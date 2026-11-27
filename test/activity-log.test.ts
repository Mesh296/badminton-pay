import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../src/shared/types";
import { ACTIVITY_SHOWN } from "../src/worker/load-state";
import { ADMIN, call, clearTables, getState, sessionBody } from "./support/api-client";

// Every write to sessions and transfers leaves a row saying who did it and
// what the record looked like before and after.
const AN = "an@example.test";
const BINH = "binh@example.test";
let ids: number[] = [];

beforeEach(async () => {
  await clearTables();
  ids = [];
  for (const [name, email] of [["An", AN], ["Bình", BINH], ["Cường", null]]) {
    const res = await call("POST", "/api/members", { name, email });
    ids.push(((await res.json()) as { id: number }).id);
  }
  // Adding them logged three "joined" entries; the tests below start from an empty log.
  await env.DB.prepare("DELETE FROM activity_log").run();
});

const stateAs = async (email: string) => (await (await call("GET", "/api/state", undefined, email)).json()) as AppState;

describe("activity log", () => {
  it("records who created, edited and deleted a session, with the record before and after", async () => {
    const created = await call("POST", "/api/sessions", sessionBody(ids), AN);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await call("PUT", `/api/sessions/${id}`, sessionBody(ids, { courtAmount: 300_000 }), AN)).status).toBe(200);
    expect((await call("DELETE", `/api/sessions/${id}`, undefined, AN)).status).toBe(204);

    const { activity } = await getState();
    expect(activity.map((a) => a.action)).toEqual(["session.delete", "session.update", "session.create"]);
    expect(activity.every((a) => a.actorMemberId === ids[0])).toBe(true);
    const [deleted, updated, createdEntry] = activity;
    expect(createdEntry.before).toBeNull();
    expect(createdEntry.after).toMatchObject({ id, payerId: ids[0], courtAmount: 250_000 });
    // Shares are logged as the server computed them: 250k court over 3, 70k drinks over 3.
    expect(createdEntry.after && "attendees" in createdEntry.after && createdEntry.after.attendees.map((a) => a.share)).toEqual([
      108_000, 108_000, 108_000,
    ]);
    expect(updated.before).toMatchObject({ courtAmount: 250_000 });
    expect(updated.after).toMatchObject({ courtAmount: 300_000 });
    expect(deleted.before).toMatchObject({ id, courtAmount: 300_000 });
    expect(deleted.after).toBeNull();
  });

  it("records transfers being recorded and undone by the receiver", async () => {
    const transfer = { date: "2026-11-27", fromId: ids[0], toId: ids[1], amount: 50_000 };
    const res = await call("POST", "/api/transfers", transfer, BINH);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    expect((await getState()).transfers.map((t) => t.id)).toEqual([id]);
    expect((await call("DELETE", `/api/transfers/${id}`, undefined, BINH)).status).toBe(204);

    const { activity } = await getState();
    expect(activity.map((a) => [a.action, a.actorMemberId])).toEqual([
      ["transfer.delete", ids[1]],
      ["transfer.create", ids[1]],
    ]);
    expect(activity[0].before).toEqual({ ...transfer, note: null });
    expect(activity[1].after).toEqual({ ...transfer, note: null });
  });

  it("logs nothing for a refused or invalid write", async () => {
    expect((await call("POST", "/api/sessions", sessionBody(ids, { payerId: ids[1] }), AN)).status).toBe(403);
    expect((await call("POST", "/api/transfers", { date: "2026-11-27", fromId: ids[0], toId: ids[1], amount: 1000 }, AN)).status).toBe(403);
    expect((await call("POST", "/api/sessions", sessionBody(ids, { courtAmount: -1 }), AN)).status).toBe(400);
    expect((await getState()).activity).toEqual([]);
  });

  it("shows who did it to everyone, but the account email only to admins", async () => {
    await call("POST", "/api/sessions", sessionBody(ids), AN);
    expect((await getState()).activity[0].actorEmail).toBeUndefined();
    expect((await stateAs(BINH)).activity[0].actorEmail).toBeUndefined();
    expect((await stateAs(ADMIN)).activity[0].actorEmail).toBe(AN);
  });

  it("sends only the latest entries, newest first", async () => {
    const insert = env.DB.prepare(
      "INSERT INTO activity_log (at, actor_email, actor_member_id, action, before, after) VALUES (?, ?, ?, 'transfer.create', NULL, '{}')",
    );
    await env.DB.batch(Array.from({ length: ACTIVITY_SHOWN + 5 }, (_, i) => insert.bind(`2026-11-27T00:00:${String(i).padStart(2, "0")}Z`, AN, ids[0])));
    const { activity } = await getState();
    expect(activity).toHaveLength(ACTIVITY_SHOWN);
    expect(activity[0].id).toBeGreaterThan(activity[1].id);
  });
});

describe("fixing a transfer", () => {
  const transfer = { date: "2026-11-27", fromId: 0, toId: 0, amount: 50_000 };
  let id = 0;
  beforeEach(async () => {
    Object.assign(transfer, { fromId: ids[0], toId: ids[1] });
    id = ((await (await call("POST", "/api/transfers", transfer, BINH)).json()) as { id: number }).id;
  });
  const fix = (changes: Record<string, unknown>, as: string, target = id) =>
    call("PUT", `/api/transfers/${target}`, { ...transfer, ...changes }, as);

  it("lets the receiver correct the amount, date and payer, and logs before and after", async () => {
    expect((await fix({ amount: 60_000, fromId: ids[2], date: "2026-11-26" }, BINH)).status).toBe(200);
    expect((await getState()).transfers).toMatchObject([{ id, amount: 60_000, fromId: ids[2], toId: ids[1], date: "2026-11-26" }]);
    const [entry] = (await getState()).activity;
    expect(entry).toMatchObject({ action: "transfer.update", actorMemberId: ids[1], before: { amount: 50_000 }, after: { amount: 60_000 } });
  });

  it("refuses the payer, and a receiver handing the transfer to someone else", async () => {
    expect((await fix({ amount: 1_000 }, AN)).status).toBe(403);
    expect((await fix({ toId: ids[2] }, BINH)).status).toBe(403);
    expect((await getState()).transfers[0].amount).toBe(50_000);
  });

  it("lets an admin change anything, including the receiver", async () => {
    expect((await fix({ toId: ids[2], amount: 70_000 }, ADMIN)).status).toBe(200);
    expect((await getState()).transfers[0]).toMatchObject({ toId: ids[2], amount: 70_000 });
  });

  it("answers 404 for a missing transfer and 400 for an invalid fix", async () => {
    expect((await fix({}, ADMIN, id + 1000)).status).toBe(404);
    expect((await fix({ amount: 0 }, BINH)).status).toBe(400);
    expect((await fix({ fromId: ids[1] }, BINH)).status).toBe(400);
  });
});

describe("news for the Thông báo tab", () => {
  afterEach(() => vi.restoreAllMocks());
  const actions = async () => (await getState()).activity.map((a) => [a.action, a.actorMemberId, a.before, a.after]);

  it("records a member being added or joining, with who it was", async () => {
    const res = await call("POST", "/api/members", { name: "Dũng" });
    const { id } = (await res.json()) as { id: number };
    expect(await actions()).toEqual([["member.join", null, null, { memberId: id }]]);
  });

  it("records a payment reported, withdrawn by the payer, and turned down by the receiver", async () => {
    // An fronted a session Bình played in, so Bình owes An.
    await call("POST", "/api/sessions", sessionBody(ids), AN);
    await env.DB.prepare("DELETE FROM activity_log").run();
    const claim = { date: "2026-11-27", fromId: ids[1], toId: ids[0], amount: 45_000, note: null };
    await call("POST", "/api/claims", claim, BINH);
    let [first] = (await getState()).claims;
    await call("DELETE", `/api/claims/${first.id}`, undefined, BINH);
    await call("POST", "/api/claims", claim, BINH);
    [first] = (await getState()).claims;
    await call("DELETE", `/api/claims/${first.id}`, undefined, AN);
    expect(await actions()).toEqual([
      ["claim.delete", ids[0], claim, null],
      ["claim.create", ids[1], null, claim],
      ["claim.delete", ids[1], claim, null],
      ["claim.create", ids[1], null, claim],
    ]);
  });

  it("records a member signing in with Google, and nothing for someone not in the group", async () => {
    const signIn = async (email: string) => {
      const claims = { aud: "test-client-id", iss: "https://accounts.google.com", email, email_verified: true };
      const idToken = `x.${btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.x`;
      // Google's token endpoint answers with an ID token for this email.
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ id_token: idToken }));
      const res = await exports.default.fetch(
        new Request("http://app.test/api/auth/callback?code=c&state=s", { headers: { Cookie: "oauth_state=s" }, redirect: "manual" }),
      );
      expect(res.headers.get("Location")).toBe("/");
    };
    await signIn(AN);
    await signIn("stranger@example.test");
    expect(await actions()).toEqual([["auth.login", ids[0], null, null]]);
  });
});
