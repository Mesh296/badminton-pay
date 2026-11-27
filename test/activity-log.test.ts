import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
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
