import { describe, expect, it } from "vitest";
import { computeBalances, splitSession, suggestTransfers } from "../src/shared/money";

const people = (count: number, drinkers: number) =>
  Array.from({ length: count }, (_, i) => ({ memberId: i + 1, drank: i < drinkers }));

const sharesOf = (input: Parameters<typeof splitSession>[0]) => [...splitSession(input).values()];

describe("splitSession edge cases", () => {
  it("single attendee who drank pays the full court and drink amounts", () => {
    expect(sharesOf({ courtAmount: 50_000, drinkAmount: 30_000, attendees: people(1, 1) })).toEqual([80_000]);
  });

  it("single attendee who did not drink pays only the court amount", () => {
    expect(sharesOf({ courtAmount: 50_000, drinkAmount: 0, attendees: people(1, 0) })).toEqual([50_000]);
  });

  it("one drinker carries the whole drink amount, others pay court only", () => {
    // court 100000/3 -> 34000 each; drink 70000 falls on the single drinker
    expect(sharesOf({ courtAmount: 100_000, drinkAmount: 70_000, attendees: people(3, 1) })).toEqual([
      104_000, 34_000, 34_000,
    ]);
  });

  it("rounds an odd court amount up per person", () => {
    // 100001 / 2 = 50000.5 -> 51000 each, so the group pays 102000
    expect(sharesOf({ courtAmount: 100_001, drinkAmount: 0, attendees: people(2, 0) })).toEqual([51_000, 51_000]);
  });

  it("rounds a tiny court amount up to one 1,000 step per person", () => {
    // 1000 / 3 -> 1000 each; the 2000 surplus is kept by the payer via computeBalances
    expect(sharesOf({ courtAmount: 1_000, drinkAmount: 0, attendees: people(3, 0) })).toEqual([1_000, 1_000, 1_000]);
  });

  it("rounds a 1 VND court amount up to 1,000 for each of 50 attendees", () => {
    const shares = sharesOf({ courtAmount: 1, drinkAmount: 0, attendees: people(50, 0) });
    expect(shares).toHaveLength(50);
    expect(new Set(shares)).toEqual(new Set([1_000]));
  });

  it("rounds court and drink parts independently", () => {
    // court 1 / 2 -> 1000 each; drink 1000 / 1 drinker -> 1000 exact, total 2000 for the drinker
    expect(sharesOf({ courtAmount: 1, drinkAmount: 1_000, attendees: people(2, 1) })).toEqual([2_000, 1_000]);
  });

  it("keeps max amounts exact for 50 attendees who all drink", () => {
    // court 100M/50 = 2M, drink 100M/50 = 2M, so each drinker owes 4M
    const shares = sharesOf({ courtAmount: 100_000_000, drinkAmount: 100_000_000, attendees: people(50, 50) });
    expect(shares).toEqual(Array(50).fill(4_000_000));
  });

  it("rounds the max court amount up when split 49 ways", () => {
    // 100M / 49 = 2040816.3 -> 2041000 each
    const shares = sharesOf({ courtAmount: 100_000_000, drinkAmount: 0, attendees: people(49, 0) });
    expect(new Set(shares)).toEqual(new Set([2_041_000]));
  });

  it("court 0 with drinks only: non-drinkers owe nothing", () => {
    expect(sharesOf({ courtAmount: 0, drinkAmount: 30_000, attendees: people(3, 1) })).toEqual([30_000, 0, 0]);
  });

  it("drink amount 0 adds no drink charge even when someone is flagged as drinking", () => {
    expect(sharesOf({ courtAmount: 60_000, drinkAmount: 0, attendees: people(3, 2) })).toEqual([20_000, 20_000, 20_000]);
  });
});

describe("computeBalances and suggestTransfers edge cases", () => {
  it("single-attendee payer who is also the attendee nets to zero", () => {
    const balances = computeBalances([{ payerId: 1, attendees: [{ memberId: 1, share: 80_000 }] }], []);
    expect(balances.get(1)).toBe(0);
  });

  it("rounding surplus from a split goes to the payer and the ledger still sums to zero", () => {
    // bill 1000 among 3 people collects 3000; payer is credited 3000 and owes own 1000
    const balances = computeBalances(
      [{ payerId: 1, attendees: [1, 2, 3].map((memberId) => ({ memberId, share: 1_000 })) }],
      [],
    );
    expect(balances.get(1)).toBe(2_000);
    expect(balances.get(2)).toBe(-1_000);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("suggests no transfers when every balance is zero", () => {
    expect(suggestTransfers(new Map([[1, 0], [2, 0]]))).toEqual([]);
  });

  it("suggests no transfers for an empty ledger", () => {
    expect(suggestTransfers(new Map())).toEqual([]);
  });
});
