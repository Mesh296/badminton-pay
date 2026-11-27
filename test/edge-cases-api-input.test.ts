import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addMembers, call, clearTables, getState, seedMembers, sessionBody } from "./support/api-client";

beforeEach(async () => {
  await clearTables();
});

describe("session amount and shape validation", () => {
  it("accepts the max amount 100,000,000 and rejects one more", async () => {
    const [payer] = await addMembers(1);
    const max = sessionBody([payer], { courtAmount: 100_000_000, drinkAmount: 0, attendees: [{ memberId: payer, drank: false }] });
    expect((await call("POST", "/api/sessions", max)).status).toBe(201);
    const over = { ...max, courtAmount: 100_000_001 };
    expect((await call("POST", "/api/sessions", over)).status).toBe(400);
    expect((await getState()).sessions).toHaveLength(1);
  });

  it("rejects non-integer, string, null and non-finite amounts", async () => {
    const ids = await addMembers(3);
    const base = sessionBody(ids, { drinkAmount: 0, attendees: ids.map((memberId) => ({ memberId, drank: false })) });
    const bad = [
      { ...base, courtAmount: 1.5 },
      { ...base, courtAmount: "250000" },
      { ...base, courtAmount: null },
      { ...base, courtAmount: true },
      { ...base, courtAmount: -1 },
    ];
    for (const body of bad) expect((await call("POST", "/api/sessions", body)).status).toBe(400);

    // JSON number 1e400 parses to Infinity; must not be stored.
    const infinite = JSON.stringify(base).replace('"courtAmount":250000', '"courtAmount":1e400');
    expect((await call("POST", "/api/sessions", infinite)).status).toBe(400);
    expect((await getState()).sessions).toHaveLength(0);
  });

  it("rejects a session where court and drink are both zero", async () => {
    const ids = await addMembers(2);
    const body = sessionBody(ids, {
      courtAmount: 0,
      drinkAmount: 0,
      attendees: ids.map((memberId) => ({ memberId, drank: false })),
    });
    expect((await call("POST", "/api/sessions", body)).status).toBe(400);
  });

  it("accepts court 0 with drinks only and stores zero shares for non-drinkers", async () => {
    const ids = await addMembers(3);
    const body = sessionBody(ids, {
      courtAmount: 0,
      drinkAmount: 30_000,
      attendees: ids.map((memberId, i) => ({ memberId, drank: i === 1 })),
    });
    expect((await call("POST", "/api/sessions", body)).status).toBe(201);
    const [session] = (await getState()).sessions;
    expect(session.attendees.map((a) => a.share)).toEqual([0, 30_000, 0]);
  });

  it("accepts a single attendee session and stores the full share", async () => {
    const [id] = await addMembers(1);
    const body = sessionBody([id], { courtAmount: 50_000, drinkAmount: 30_000, attendees: [{ memberId: id, drank: true }] });
    expect((await call("POST", "/api/sessions", body)).status).toBe(201);
    // No hours sent: one hour, as clients from before hours existed send it
    expect((await getState()).sessions[0].attendees).toEqual([{ memberId: id, drank: true, hours: 1, share: 80_000 }]);
  });

  it("keeps stored hours when an app opened before hours existed edits the session", async () => {
    const ids = await addMembers(2);
    const body = sessionBody(ids, { courtAmount: 300_000, drinkAmount: 0, attendees: ids.map((memberId, i) => ({ memberId, drank: false, hours: i ? 1 : 2 })) });
    const { id } = (await (await call("POST", "/api/sessions", body)).json()) as { id: string };
    const old = { ...body, note: "sửa ghi chú", attendees: ids.map((memberId) => ({ memberId, drank: false })) };
    expect((await call("PUT", `/api/sessions/${id}`, old)).status).toBe(200);
    expect((await getState()).sessions[0].attendees.map((a) => [a.hours, a.share])).toEqual([
      [2, 200_000],
      [1, 100_000],
    ]);
  });

  it("saves a session once when the app sends it again with the same id", async () => {
    const ids = await addMembers(2);
    const body = sessionBody(ids, { id: crypto.randomUUID() });
    expect((await call("POST", "/api/sessions", body)).status).toBe(201);
    expect((await call("POST", "/api/sessions", body)).status).toBe(200);
    expect((await getState()).sessions).toHaveLength(1);
    expect((await call("POST", "/api/sessions", { ...body, id: "not-a-uuid" })).status).toBe(400);
  });

  it("splits the court by whole hours played and rejects anything but 1 to 6 whole hours", async () => {
    const ids = await addMembers(3);
    const attendees = (hours: unknown[]) => ids.map((memberId, i) => ({ memberId, drank: false, hours: hours[i] }));
    const body = sessionBody(ids, { courtAmount: 250_000, drinkAmount: 0, attendees: attendees([2, 2, 1]) });
    expect((await call("POST", "/api/sessions", body)).status).toBe(201);
    const [session] = (await getState()).sessions;
    expect(session.attendees.map((a) => [a.hours, a.share])).toEqual([
      [2, 100_000],
      [2, 100_000],
      [1, 50_000],
    ]);

    for (const bad of [1.5, 0, -1, 7, "2", null]) {
      const res = await call("POST", "/api/sessions", { ...body, attendees: attendees([2, bad, 1]) });
      expect(res.status, `hours ${String(bad)}`).toBe(400);
    }
    expect((await getState()).sessions).toHaveLength(1);
  });

  it("accepts 50 attendees at max amounts and rejects 51", async () => {
    const ids = await seedMembers(51);
    const attendees50 = ids.slice(0, 50).map((memberId) => ({ memberId, drank: true }));
    const ok = sessionBody(ids, { courtAmount: 100_000_000, drinkAmount: 100_000_000, attendees: attendees50 });
    expect((await call("POST", "/api/sessions", ok)).status).toBe(201);
    const [session] = (await getState()).sessions;
    expect(session.attendees).toHaveLength(50);
    expect(new Set(session.attendees.map((a) => a.share))).toEqual(new Set([4_000_000]));

    const attendees51 = ids.map((memberId) => ({ memberId, drank: true }));
    const tooMany = sessionBody(ids, { attendees: attendees51 });
    expect((await call("POST", "/api/sessions", tooMany)).status).toBe(400);
  });

  it("rejects a payer id that is not a member", async () => {
    const ids = await addMembers(2);
    const body = sessionBody(ids, { payerId: 999_999 });
    expect((await call("POST", "/api/sessions", body)).status).toBe(400);
  });

  it("ignores client-supplied share fields and recomputes them", async () => {
    const ids = await addMembers(2);
    const body = sessionBody(ids, {
      courtAmount: 100_000,
      drinkAmount: 0,
      shares: [1, 1],
      attendees: ids.map((memberId) => ({ memberId, drank: false, share: 1 })),
    });
    expect((await call("POST", "/api/sessions", body)).status).toBe(201);
    expect((await getState()).sessions[0].attendees.map((a) => a.share)).toEqual([50_000, 50_000]);
  });

  it("treats a blank note as no note and rejects notes over 200 chars", async () => {
    const [a] = await addMembers(1);
    const attendees = [{ memberId: a, drank: false }];
    const blank = await call("POST", "/api/sessions", sessionBody([a], { note: "   ", drinkAmount: 0, attendees }));
    expect(blank.status).toBe(201);
    expect((await getState()).sessions[0].note).toBeNull();
    expect((await call("POST", "/api/sessions", sessionBody([a], { note: "n".repeat(201), drinkAmount: 0, attendees }))).status).toBe(400);
  });

  it("rejects impossible and accepts leap calendar dates", async () => {
    const ids = await addMembers(1);
    const attendees = [{ memberId: ids[0], drank: false }];
    expect((await call("POST", "/api/sessions", sessionBody(ids, { date: "2027-02-29", drinkAmount: 0, attendees }))).status).toBe(400);
    expect((await call("POST", "/api/sessions", sessionBody(ids, { date: "2028-02-29", drinkAmount: 0, attendees }))).status).toBe(201);
  });

  it("rejects a malformed JSON body and a missing body with 400", async () => {
    const malformed = await call("POST", "/api/sessions", "{\"date\": ");
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: string }).error).toBeTruthy();
    expect((await call("POST", "/api/sessions")).status).toBe(400);
    expect((await call("POST", "/api/members", "[]")).status).toBe(400);
  });
});

describe("member and transfer boundaries", () => {
  it("accepts a 40-char name and rejects 41", async () => {
    expect((await call("POST", "/api/members", { name: "a".repeat(40) })).status).toBe(201);
    expect((await call("POST", "/api/members", { name: "a".repeat(41) })).status).toBe(400);
  });

  it("rejects account numbers with punctuation or over 20 chars", async () => {
    expect((await call("POST", "/api/members", { name: "A", accountNo: "012-345" })).status).toBe(400);
    expect((await call("POST", "/api/members", { name: "A", accountNo: "1".repeat(21) })).status).toBe(400);
    expect((await call("POST", "/api/members", { name: "A", accountNo: "1".repeat(20) })).status).toBe(201);
  });

  it("transfer amount accepts 100,000,000 and rejects fractions, strings and overflow", async () => {
    const [a, b] = await addMembers(2);
    const t = { date: "2026-11-27", fromId: a, toId: b };
    expect((await call("POST", "/api/transfers", { ...t, amount: 100_000_000 })).status).toBe(201);
    expect((await call("POST", "/api/transfers", { ...t, amount: 100_000_001 })).status).toBe(400);
    expect((await call("POST", "/api/transfers", { ...t, amount: 1.5 })).status).toBe(400);
    expect((await call("POST", "/api/transfers", { ...t, amount: "1000" })).status).toBe(400);
    expect((await getState()).transfers).toHaveLength(1);
  });
});

describe("path id handling", () => {
  it("returns 404 for non-decimal, zero and negative ids and leaves members unchanged", async () => {
    await addMembers(1);
    for (const bad of ["abc", "0", "-1", "1.5"]) {
      expect((await call("PUT", `/api/members/${bad}`, { name: "X" })).status).toBe(404);
      expect((await call("DELETE", `/api/transfers/${bad}`)).status).toBe(404);
    }
    expect((await getState()).members[0].name).toBe("Người 1");
  });

  it("returns 404 for a transfer id that does not exist", async () => {
    expect((await call("DELETE", "/api/transfers/424242")).status).toBe(404);
  });

  it("returns 404 for an id beyond the safe integer range", async () => {
    expect((await call("PUT", "/api/members/99999999999999999999", { name: "X" })).status).toBe(404);
  });

  // Number() would parse "0x15" as 21; path ids must be plain decimal digits.
  it("rejects hex-notation member ids instead of updating the member with that decimal id", async () => {
    const [id] = await addMembers(1);
    const hex = `0x${id.toString(16)}`;
    expect((await call("PUT", `/api/members/${hex}`, { name: "Hacked" })).status).toBe(404);
    expect((await getState()).members.find((m) => m.id === id)?.name).not.toBe("Hacked");
  });

  it("rejects non-integer drink amounts without touching state", async () => {
    const ids = await addMembers(2);
    const before = await env.DB.prepare("SELECT count(*) AS n FROM session_attendees").first<{ n: number }>();
    const res = await call("POST", "/api/sessions", sessionBody(ids, { drinkAmount: 0.5 }));
    expect(res.status).toBe(400);
    const after = await env.DB.prepare("SELECT count(*) AS n FROM session_attendees").first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });
});
