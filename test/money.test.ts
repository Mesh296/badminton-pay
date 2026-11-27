import { describe, expect, it } from "vitest";
import { computeBalances, splitSession, suggestTransfers } from "../src/shared/money";

const attendees = (count: number, drinkers: number) =>
  Array.from({ length: count }, (_, i) => ({ memberId: i + 1, drank: i < drinkers }));

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

describe("splitSession", () => {
  it("splits court among everyone and drinks among drinkers, rounding up to 1,000", () => {
    const shares = splitSession({ courtAmount: 250_000, drinkAmount: 70_000, attendees: attendees(6, 3) });
    // court 250000/6 -> 42000, drinks 70000/3 -> 24000
    expect([...shares.values()]).toEqual([66_000, 66_000, 66_000, 42_000, 42_000, 42_000]);
    expect(sum(shares.values())).toBe(324_000);
  });

  it("does not round an exact division", () => {
    const shares = splitSession({ courtAmount: 240_000, drinkAmount: 0, attendees: attendees(6, 0) });
    expect(new Set(shares.values())).toEqual(new Set([40_000]));
  });

  it("charges court only when there are no drinks", () => {
    const shares = splitSession({ courtAmount: 100_000, drinkAmount: 0, attendees: attendees(4, 0) });
    expect([...shares.values()]).toEqual([25_000, 25_000, 25_000, 25_000]);
  });

  it("splits the court by hours played and the drinks equally", () => {
    const shares = splitSession({
      courtAmount: 400_000,
      drinkAmount: 30_000,
      attendees: [
        { memberId: 1, drank: true, hours: 2 },
        { memberId: 2, drank: false, hours: 2 },
        { memberId: 3, drank: false, hours: 2 },
        { memberId: 4, drank: true, hours: 1 },
        { memberId: 5, drank: false, hours: 1 },
      ],
    });
    // 8 hours in all: 50.000đ an hour; drinks 15.000đ each for the 2 drinkers
    expect([...shares.values()]).toEqual([115_000, 100_000, 100_000, 65_000, 50_000]);
  });

  it("splits equally when everyone played as long, whatever the length", () => {
    const people = attendees(6, 3);
    const byHours = (hours: number) =>
      splitSession({ courtAmount: 250_000, drinkAmount: 70_000, attendees: people.map((a) => ({ ...a, hours })) });
    expect(byHours(3)).toEqual(byHours(1));
    expect(byHours(1)).toEqual(splitSession({ courtAmount: 250_000, drinkAmount: 70_000, attendees: people }));
  });

  it("rounds each weighted court share up, so the payer is never short", () => {
    const shares = splitSession({
      courtAmount: 100_000,
      drinkAmount: 0,
      attendees: [
        { memberId: 1, drank: false, hours: 3 },
        { memberId: 2, drank: false, hours: 2 },
        { memberId: 3, drank: false, hours: 2 },
      ],
    });
    // 100000 * 3/7 = 42857 -> 43000; 100000 * 2/7 = 28571 -> 29000
    expect([...shares.values()]).toEqual([43_000, 29_000, 29_000]);
    expect(sum(shares.values())).toBeGreaterThanOrEqual(100_000);
  });

  it("rejects drinks with nobody drinking, and empty sessions", () => {
    expect(() => splitSession({ courtAmount: 100_000, drinkAmount: 50_000, attendees: attendees(4, 0) })).toThrow();
    expect(() => splitSession({ courtAmount: 100_000, drinkAmount: 0, attendees: [] })).toThrow();
  });
});

describe("computeBalances", () => {
  it("credits the payer the sum of shares, even when the payer did not attend", () => {
    const shares = splitSession({ courtAmount: 250_000, drinkAmount: 70_000, attendees: attendees(6, 3) });
    const session = {
      payerId: 99,
      attendees: [...shares].map(([memberId, share]) => ({ memberId, share })),
    };
    const balances = computeBalances([session], []);
    expect(balances.get(99)).toBe(324_000);
    expect(balances.get(1)).toBe(-66_000);
    expect(balances.get(6)).toBe(-42_000);
    expect(sum(balances.values())).toBe(0);
  });

  it("nets the payer's own share and applies transfers", () => {
    const session = {
      payerId: 1,
      attendees: [
        { memberId: 1, share: 50_000 },
        { memberId: 2, share: 50_000 },
      ],
    };
    const balances = computeBalances([session], [{ fromId: 2, toId: 1, amount: 50_000 }]);
    expect(balances.get(1)).toBe(0);
    expect(balances.get(2)).toBe(0);
  });
});

// Small deterministic PRNG so the randomized check is reproducible.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("suggestTransfers", () => {
  it("settles a simple case with one transfer per debtor", () => {
    const balances = new Map([
      [1, 100_000],
      [2, -60_000],
      [3, -40_000],
    ]);
    expect(suggestTransfers(balances)).toEqual([
      { fromId: 2, toId: 1, amount: 60_000 },
      { fromId: 3, toId: 1, amount: 40_000 },
    ]);
  });

  it("keeps the ledger zero-sum and settles it to zero for random histories", () => {
    const random = mulberry32(20261127);
    const int = (max: number) => Math.floor(random() * max);

    for (let round = 0; round < 200; round++) {
      const memberCount = 2 + int(11);
      const sessions = Array.from({ length: 1 + int(8) }, () => {
        const present = Array.from({ length: memberCount }, (_, i) => i + 1).filter(() => random() < 0.6);
        const list = (present.length > 0 ? present : [1]).map((memberId) => ({ memberId, drank: random() < 0.5 }));
        const hasDrinker = list.some((a) => a.drank);
        const shares = splitSession({
          courtAmount: int(600) * 1000 + int(1000),
          drinkAmount: hasDrinker ? int(200_000) : 0,
          attendees: list,
        });
        return {
          payerId: 1 + int(memberCount),
          attendees: [...shares].map(([memberId, share]) => ({ memberId, share })),
        };
      });
      const transfers = Array.from({ length: int(4) }, () => {
        const fromId = 1 + int(memberCount);
        return { fromId, toId: (fromId % memberCount) + 1, amount: 1 + int(300_000) };
      });

      const balances = computeBalances(sessions, transfers);
      expect(sum(balances.values())).toBe(0);

      const suggestions = suggestTransfers(balances);
      const nonZero = [...balances.values()].filter((b) => b !== 0).length;
      expect(suggestions.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));

      const settled = computeBalances(sessions, [...transfers, ...suggestions]);
      expect([...settled.values()].every((b) => b === 0)).toBe(true);
    }
  });
});
