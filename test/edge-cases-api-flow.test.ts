import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addMembers, call, clearTables, getState, sessionBody } from "./support/api-client";

beforeEach(clearTables);

const sessionCount = async () =>
  (await env.DB.prepare("SELECT count(*) AS n FROM sessions").first<{ n: number }>())?.n;

describe("GET /api/state shape", () => {
  it("groups attendees per session and orders sessions newest first", async () => {
    const [a, b, c, d] = await addMembers(4);
    const older = sessionBody([a, b], {
      date: "2026-11-01",
      courtAmount: 60_000,
      drinkAmount: 0,
      attendees: [
        { memberId: a, drank: false },
        { memberId: b, drank: false },
      ],
    });
    const newer = sessionBody([c, d], {
      date: "2026-11-20",
      courtAmount: 40_000,
      drinkAmount: 20_000,
      attendees: [
        { memberId: c, drank: true },
        { memberId: d, drank: false },
      ],
    });
    await call("POST", "/api/sessions", older);
    await call("POST", "/api/sessions", newer);

    const { sessions } = await getState();
    expect(sessions.map((s) => s.date)).toEqual(["2026-11-20", "2026-11-01"]);
    expect(sessions[0].attendees).toEqual([
      { memberId: c, drank: true, hours: 1, share: 40_000 },
      { memberId: d, drank: false, hours: 1, share: 20_000 },
    ]);
    expect(sessions[1].attendees.map((x) => x.memberId).sort()).toEqual([a, b].sort());
    expect(sessions[1].attendees.map((x) => x.share)).toEqual([30_000, 30_000]);
  });
});

describe("session update semantics", () => {
  it("moves the payer and keeps shares computed from the new attendee set", async () => {
    const [a, b, c] = await addMembers(3);
    const created = (await (await call("POST", "/api/sessions", sessionBody([a, b, c], { drinkAmount: 0, attendees: [a, b, c].map((memberId) => ({ memberId, drank: false })) }))).json()) as { id: string };
    const update = sessionBody([a, b, c], {
      payerId: c,
      courtAmount: 90_000,
      drinkAmount: 0,
      attendees: [b, c].map((memberId) => ({ memberId, drank: false })),
    });
    expect((await call("PUT", `/api/sessions/${created.id}`, update)).status).toBe(200);

    const [session] = (await getState()).sessions;
    expect(session.payerId).toBe(c);
    expect(session.attendees.map((x) => x.memberId).sort()).toEqual([b, c].sort());
    expect(session.attendees.map((x) => x.share)).toEqual([45_000, 45_000]);
  });

  it("a failed update (unknown member) leaves the original session and attendees untouched", async () => {
    const [a, b] = await addMembers(2);
    const original = sessionBody([a, b], { drinkAmount: 0, courtAmount: 80_000, attendees: [a, b].map((memberId) => ({ memberId, drank: false })) });
    const created = (await (await call("POST", "/api/sessions", original)).json()) as { id: string };

    const bad = { ...original, courtAmount: 10_000, attendees: [a, { memberId: 999_999, drank: false }] };
    expect((await call("PUT", `/api/sessions/${created.id}`, bad)).status).toBe(400);

    const [session] = (await getState()).sessions;
    expect(session.courtAmount).toBe(80_000);
    expect(session.attendees.map((x) => x.share)).toEqual([40_000, 40_000]);
  });

  it("a failed update to an unknown session id returns 404 and creates nothing", async () => {
    const [a] = await addMembers(1);
    const body = sessionBody([a], { drinkAmount: 0, attendees: [{ memberId: a, drank: false }] });
    expect((await call("PUT", "/api/sessions/does-not-exist", body)).status).toBe(404);
    expect(await sessionCount()).toBe(0);
  });
});

describe("member lifecycle in sessions", () => {
  // Characterization: the schema does not reject inactive members. Whether that is intended is an open question.
  it("currently accepts a deactivated member as attendee of a new session", async () => {
    const [a, b] = await addMembers(2);
    const deactivate = { name: "Người 2", bankCode: null, accountNo: null, accountName: null, active: false };
    expect((await call("PUT", `/api/members/${b}`, deactivate)).status).toBe(200);
    const body = sessionBody([a, b], { drinkAmount: 0, attendees: [a, b].map((memberId) => ({ memberId, drank: false })) });
    expect((await call("POST", "/api/sessions", body)).status).toBe(201);
  });
});
