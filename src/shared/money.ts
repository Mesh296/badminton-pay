// Pure money logic used by the Worker (shares at save time) and the client
// (live preview, balances, settlement). Everything is integer VND.

export const ROUND_TO = 1000;

/** Largest single amount the app accepts (court, drinks, or one transfer). */
export const MAX_AMOUNT = 100_000_000;

export interface SplitInput {
  courtAmount: number;
  drinkAmount: number;
  attendees: { memberId: number; drank: boolean }[];
}

export interface SuggestedTransfer {
  fromId: number;
  toId: number;
  amount: number;
}

// One division keeps exact splits exact: 240000 / (6 * 1000) === 40, so no
// floating-point error can push an evenly divisible amount up a step.
function ceilShare(amount: number, count: number): number {
  return Math.ceil(amount / (count * ROUND_TO)) * ROUND_TO;
}

/**
 * Share per attendee: court cost split among everyone present, drink cost
 * split among drinkers, each part rounded up to ROUND_TO.
 */
export function splitSession(input: SplitInput): Map<number, number> {
  const { courtAmount, drinkAmount, attendees } = input;
  if (attendees.length === 0) throw new Error("Chọn người đi");
  const drinkers = attendees.filter((a) => a.drank).length;
  if (drinkAmount > 0 && drinkers === 0) throw new Error("Chọn người uống");

  const court = ceilShare(courtAmount, attendees.length);
  const drink = drinkers > 0 ? ceilShare(drinkAmount, drinkers) : 0;
  return new Map(attendees.map((a) => [a.memberId, court + (a.drank ? drink : 0)]));
}

/**
 * Running balance per member. Positive = is owed money, negative = owes.
 * The payer is credited the sum of shares (not the raw amounts), so rounding
 * surplus goes to the payer and all balances always sum to zero.
 */
export function computeBalances(
  sessions: { payerId: number; attendees: { memberId: number; share: number }[] }[],
  transfers: { fromId: number; toId: number; amount: number }[],
): Map<number, number> {
  const balances = new Map<number, number>();
  const add = (id: number, delta: number) => balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const session of sessions) {
    for (const attendee of session.attendees) {
      add(session.payerId, attendee.share);
      add(attendee.memberId, -attendee.share);
    }
  }
  for (const transfer of transfers) {
    add(transfer.fromId, transfer.amount);
    add(transfer.toId, -transfer.amount);
  }
  return balances;
}

/**
 * Who should pay whom to bring every balance to zero. Matches the largest
 * debtor with the largest creditor; produces at most (non-zero members - 1)
 * transfers.
 */
export function suggestTransfers(balances: Map<number, number>): SuggestedTransfer[] {
  const side = (sign: 1 | -1) =>
    [...balances]
      .filter(([, balance]) => balance * sign > 0)
      .map(([id, balance]) => ({ id, amount: Math.abs(balance) }))
      .sort((a, b) => b.amount - a.amount || a.id - b.id);
  const debtors = side(-1);
  const creditors = side(1);

  const result: SuggestedTransfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    result.push({ fromId: debtors[d].id, toId: creditors[c].id, amount });
    debtors[d].amount -= amount;
    creditors[c].amount -= amount;
    if (debtors[d].amount === 0) d++;
    if (creditors[c].amount === 0) c++;
  }
  return result;
}
