import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addMembers, call, clearTables, getState } from "./support/api-client";

beforeEach(clearTables);

// The worked example from the plan: court 250k / 6 people, drinks 70k / 3 drinkers.
const exampleSession = (ids: number[]) => ({
  date: "2026-11-27",
  payerId: ids[0],
  courtAmount: 250_000,
  drinkAmount: 70_000,
  attendees: ids.map((memberId, i) => ({ memberId, drank: i < 3 })),
});

describe("sign-in guard", () => {
  const writes: [string, string][] = [
    ["POST", "/api/members"],
    ["PUT", "/api/members/1"],
    ["POST", "/api/sessions"],
    ["PUT", "/api/sessions/abc"],
    ["DELETE", "/api/sessions/abc"],
    ["POST", "/api/transfers"],
    ["DELETE", "/api/transfers/1"],
  ];

  it.each(writes)("%s %s is rejected for a visitor", async (method, path) => {
    expect((await call(method, path, {}, null)).status).toBe(401);
  });

  it("leaves reads public", async () => {
    expect((await call("GET", "/api/state", undefined, null)).status).toBe(200);
  });
});

describe("sessions", () => {
  it("stores server-computed shares for the worked example", async () => {
    const ids = await addMembers(6);
    const res = await call("POST", "/api/sessions", exampleSession(ids));
    expect(res.status).toBe(201);

    const [session] = (await getState()).sessions;
    const shareOf = (id: number) => session.attendees.find((a) => a.memberId === id)?.share;
    expect(ids.map(shareOf)).toEqual([66_000, 66_000, 66_000, 42_000, 42_000, 42_000]);
    expect(session.payerId).toBe(ids[0]);
  });

  it("rejects invalid sessions with 400", async () => {
    const ids = await addMembers(3);
    const base = exampleSession(ids);
    const noDrinkers = { ...base, attendees: base.attendees.map((a) => ({ ...a, drank: false })) };
    const unknownMember = { ...base, attendees: [...base.attendees, { memberId: 9999, drank: false }] };
    const duplicate = { ...base, attendees: [base.attendees[0], base.attendees[0]] };
    const badDate = { ...base, date: "2026-02-31" };
    const badMonth = { ...base, date: "2026-13-01" };
    const tooLarge = { ...base, courtAmount: 100_000_001 };
    const negative = { ...base, courtAmount: -1 };

    for (const body of [noDrinkers, unknownMember, duplicate, badDate, badMonth, tooLarge, negative, {}]) {
      expect((await call("POST", "/api/sessions", body)).status).toBe(400);
    }
    expect((await getState()).sessions).toHaveLength(0);
  });

  it("replaces attendees and recomputes shares on update", async () => {
    const ids = await addMembers(6);
    const created = (await (await call("POST", "/api/sessions", exampleSession(ids))).json()) as { id: string };

    const update = {
      ...exampleSession(ids.slice(0, 4)),
      courtAmount: 200_000,
      drinkAmount: 0,
      attendees: ids.slice(0, 4).map((memberId) => ({ memberId, drank: false })),
    };
    expect((await call("PUT", `/api/sessions/${created.id}`, update)).status).toBe(200);

    const [session] = (await getState()).sessions;
    expect(session.attendees.map((a) => a.share)).toEqual([50_000, 50_000, 50_000, 50_000]);
    expect((await call("PUT", "/api/sessions/missing", update)).status).toBe(404);
  });

  it("deletes a session together with its attendee rows", async () => {
    const ids = await addMembers(6);
    const created = (await (await call("POST", "/api/sessions", exampleSession(ids))).json()) as { id: string };
    expect((await call("DELETE", `/api/sessions/${created.id}`)).status).toBe(204);

    const left = await env.DB.prepare("SELECT count(*) AS n FROM session_attendees").first<{ n: number }>();
    expect(left?.n).toBe(0);
    expect((await call("DELETE", `/api/sessions/${created.id}`)).status).toBe(404);
  });
});

describe("members and transfers", () => {
  it("updates a member and validates bank info", async () => {
    const [id] = await addMembers(1);
    const good = { name: "Minh", bankCode: "970436", accountNo: "0123456789", accountName: "TRAN MINH", active: false };
    expect((await call("PUT", `/api/members/${id}`, good)).status).toBe(200);
    expect((await getState()).members[0]).toEqual({ id, ...good, avatar: null });

    expect((await call("PUT", `/api/members/${id}`, { ...good, bankCode: "000000" })).status).toBe(400);
    expect((await call("PUT", `/api/members/${id}`, { ...good, name: "  " })).status).toBe(400);
    expect((await call("PUT", "/api/members/9999", good)).status).toBe(404);
    // one record, one address: no leading zeros
    expect((await call("PUT", `/api/members/00${id}`, good)).status).toBe(404);

    // rules without a specific message still answer in Vietnamese
    for (const body of [{ ...good, accountName: "x".repeat(61) }, undefined]) {
      const res = await call("PUT", `/api/members/${id}`, body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("Dữ liệu không hợp lệ");
    }
  });

  it("records and undoes a transfer", async () => {
    const [a, b] = await addMembers(2);
    const transfer = { date: "2026-11-27", fromId: a, toId: b, amount: 66_000 };
    const res = await call("POST", "/api/transfers", transfer);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    expect((await getState()).transfers).toHaveLength(1);

    expect((await call("POST", "/api/transfers", { ...transfer, toId: a })).status).toBe(400);
    expect((await call("POST", "/api/transfers", { ...transfer, amount: 0 })).status).toBe(400);
    expect((await call("POST", "/api/transfers", { ...transfer, toId: 9999 })).status).toBe(400);

    expect((await call("DELETE", `/api/transfers/${id}`)).status).toBe(204);
    expect((await getState()).transfers).toHaveLength(0);
  });
});
