import { beforeEach, describe, expect, it } from "vitest";
import type { AppState } from "../src/shared/types";
import { ADMIN, call, clearTables, sessionBody } from "./support/api-client";

// "Đã chuyển": the payer reports a payment, the receiver confirms or turns it down.
const PAYER = "payer@example.test";
const RECEIVER = "receiver@example.test";
const OTHER = "other@example.test";

const stateAs = async (email: string | null) => (await (await call("GET", "/api/state", undefined, email)).json()) as AppState;

let payer = 0;
let receiver = 0;
let other = 0;
beforeEach(async () => {
  await clearTables();
  const add = async (name: string, email: string) =>
    ((await (await call("POST", "/api/members", { name, email })).json()) as { id: number }).id;
  receiver = await add("Minh", RECEIVER);
  payer = await add("Y tá", PAYER);
  other = await add("Khác", OTHER);
  // Minh fronted a session the other two attended: they owe him.
  const body = sessionBody([receiver], { attendees: [{ memberId: payer, drank: false }, { memberId: other, drank: false }], drinkAmount: 0, courtAmount: 90_000 });
  expect((await call("POST", "/api/sessions", body, RECEIVER)).status).toBe(201);
});

const report = (amount = 45_000, as = PAYER, fromId = payer) =>
  call("POST", "/api/claims", { date: "2026-11-27", fromId, toId: receiver, amount }, as);

describe("reporting a payment", () => {
  it("is shown to everyone and changes no balance until the receiver confirms it", async () => {
    expect((await report()).status).toBe(201);
    const state = await stateAs(null);
    expect(state.claims).toEqual([{ id: expect.any(Number), date: "2026-11-27", fromId: payer, toId: receiver, amount: 45_000, note: null }]);
    expect(state.transfers).toEqual([]);
  });

  it("is only for the payer themself", async () => {
    expect((await report(45_000, OTHER)).status).toBe(403);
    expect((await report(45_000, ADMIN)).status).toBe(403);
    expect((await report(45_000, RECEIVER)).status).toBe(403);
    expect((await call("POST", "/api/claims", { date: "2026-11-27", fromId: payer, toId: receiver, amount: 1 }, null)).status).toBe(401);
    expect((await stateAs(null)).claims).toEqual([]);
  });

  it("is validated like a transfer", async () => {
    expect((await report(0)).status).toBe(400);
    expect((await report(1.5)).status).toBe(400);
    expect((await call("POST", "/api/claims", { date: "2026-11-27", fromId: payer, toId: payer, amount: 1 }, PAYER)).status).toBe(400);
    expect((await call("POST", "/api/claims", { date: "2026-11-27", fromId: payer, toId: 999_999, amount: 1 }, PAYER)).status).toBe(400);
  });
});

describe("answering a report", () => {
  it("confirming records the transfer, logged as the receiver's, and removes the report", async () => {
    await report();
    const [claim] = (await stateAs(null)).claims;
    expect((await call("POST", `/api/claims/${claim.id}/confirm`, undefined, PAYER)).status).toBe(403);
    expect((await call("POST", `/api/claims/${claim.id}/confirm`, undefined, OTHER)).status).toBe(403);
    expect((await call("POST", `/api/claims/${claim.id}/confirm`, undefined, RECEIVER)).status).toBe(201);

    const state = await stateAs(null);
    expect(state.claims).toEqual([]);
    expect(state.transfers).toMatchObject([{ fromId: payer, toId: receiver, amount: 45_000, date: "2026-11-27" }]);
    expect(state.activity[0]).toMatchObject({ action: "transfer.create", actorMemberId: receiver });
    // Confirming again finds nothing, so one report never becomes two transfers.
    expect((await call("POST", `/api/claims/${claim.id}/confirm`, undefined, RECEIVER)).status).toBe(404);
    expect((await stateAs(null)).transfers).toHaveLength(1);
  });

  it("an admin may confirm for the receiver", async () => {
    await report();
    const [claim] = (await stateAs(null)).claims;
    expect((await call("POST", `/api/claims/${claim.id}/confirm`, undefined, ADMIN)).status).toBe(201);
  });

  it("the receiver may turn it down and the payer take it back; nobody else may remove it", async () => {
    await report(45_000);
    const [first] = (await stateAs(null)).claims;
    expect((await call("DELETE", `/api/claims/${first.id}`, undefined, OTHER)).status).toBe(403);
    expect((await call("DELETE", `/api/claims/${first.id}`, undefined, RECEIVER)).status).toBe(204);
    await report(10_000);
    const [second] = (await stateAs(null)).claims;
    expect((await call("DELETE", `/api/claims/${second.id}`, undefined, PAYER)).status).toBe(204);
    expect((await call("DELETE", `/api/claims/${second.id}`, undefined, PAYER)).status).toBe(404);
    const state = await stateAs(null);
    expect(state.claims).toEqual([]);
    expect(state.transfers).toEqual([]);
  });
});

describe("never counting the same payment twice", () => {
  it("keeps one open report per payer and receiver", async () => {
    expect((await report()).status).toBe(201);
    expect((await report()).status).toBe(409);
    expect((await stateAs(null)).claims).toHaveLength(1);
  });

  it("refuses a report from someone who owes nothing, e.g. already recorded by the receiver", async () => {
    const recorded = await call("POST", "/api/transfers", { date: "2026-11-27", fromId: payer, toId: receiver, amount: 45_000 }, RECEIVER);
    expect(recorded.status).toBe(201);
    expect((await report()).status).toBe(409);
    expect((await stateAs(null)).claims).toEqual([]);
  });

  it("does not let the receiver record directly a payment waiting as a report", async () => {
    await report();
    const direct = await call("POST", "/api/transfers", { date: "2026-11-27", fromId: payer, toId: receiver, amount: 45_000 }, RECEIVER);
    expect(direct.status).toBe(409);
    expect((await stateAs(null)).transfers).toEqual([]);
  });

  it("does not withdraw a report that was confirmed a moment ago", async () => {
    await report();
    const [claim] = (await stateAs(null)).claims;
    expect((await call("POST", `/api/claims/${claim.id}/confirm`, undefined, RECEIVER)).status).toBe(201);
    expect((await call("DELETE", `/api/claims/${claim.id}`, undefined, PAYER)).status).toBe(404);
    const state = await stateAs(null);
    expect(state.transfers).toHaveLength(1);
    expect(state.activity.map((a) => a.action)).not.toContain("claim.delete");
  });
});
