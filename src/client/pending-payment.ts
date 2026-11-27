// A payment the payer went off to make in their banking app (or MoMo), kept
// on this device so that when they come back the app asks whether it went
// through. People pay and forget that the app cannot see their bank, so
// asking at that moment is what gets the payment reported.

export interface PendingPayment {
  fromId: number;
  toId: number;
  amount: number;
  /** When they left to pay, ms since epoch */
  at: number;
}

const KEY = "pending-payment";
/** Not asked any more after a day: by then the receiver has likely sorted it out. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function rememberPayment(payment: Omit<PendingPayment, "at">) {
  localStorage.setItem(KEY, JSON.stringify({ ...payment, at: Date.now() }));
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const payment = JSON.parse(localStorage.getItem(KEY) ?? "null") as PendingPayment | null;
    return payment && Date.now() - payment.at < MAX_AGE_MS ? payment : null;
  } catch {
    return null;
  }
}

export const forgetPayment = () => localStorage.removeItem(KEY);
