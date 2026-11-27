import { computeBalances, formatMoney, suggestTransfers } from "../shared/money";
import { pushToMember, vapidKey, type PushMessage } from "./routes-push";

// Every evening at 19:00 (Vietnam time) everyone who still owes money and has
// notifications on is told whom they owe. Owed by the current suggestions,
// like the app shows; a payment already reported and waiting for the
// receiver is not owed again. Run by the Workers cron trigger (wrangler.jsonc)
// and by a timer on the Node server.

export interface Debt {
  name: string;
  amount: number;
}

/** A reminder still undelivered after this long is dropped: by then a newer one is coming. */
const REMINDER_TTL_SECONDS = 4 * 60 * 60;

/** The notification for someone with these debts (at least one). */
export function reminderMessage(debts: Debt[]): PushMessage {
  const tag = "reminder";
  if (debts.length === 1) {
    const [{ name, amount }] = debts;
    return { title: `Còn nợ ${name} ${formatMoney(amount)}`, body: `Chuyển xong thì vào app bấm Đã chuyển để ${name} xác nhận.`, url: "/", tag };
  }
  const total = debts.reduce((sum, d) => sum + d.amount, 0);
  return {
    title: `Còn nợ ${formatMoney(total)} tiền cầu lông`,
    body: `${debts.map((d) => `${d.name} ${formatMoney(d.amount)}`).join(", ")}. Chuyển xong thì vào app bấm Đã chuyển.`,
    url: "/",
    tag,
  };
}

/**
 * The next 19:00 Vietnam time (12:00 UTC; no daylight saving there) strictly
 * after `after` (ms). Counted from the run that just happened, never from the
 * clock: a timer can fire a few ms early, and counting from the clock would
 * then pick the same evening again and send twice.
 */
export function nextReminderAt(after: number): number {
  const next = new Date(after);
  next.setUTCHours(12, 0, 0, 0);
  if (next.getTime() <= after) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

/** Sends the evening reminders. Returns how many members were reminded. */
export async function sendDailyReminders(env: Env): Promise<number> {
  const jwk = vapidKey(env);
  if (!jwk) return 0;
  const db = env.DB;
  const [sessions, attendees, transfers, claims, members, devices] = await db.batch([
    db.prepare("SELECT id, payer_id FROM sessions"),
    db.prepare("SELECT session_id, member_id, share FROM session_attendees"),
    db.prepare("SELECT from_id, to_id, amount FROM transfers"),
    db.prepare("SELECT from_id, to_id FROM transfer_claims"),
    db.prepare("SELECT id, name FROM members"),
    db.prepare("SELECT DISTINCT member_id, origin FROM push_subscriptions"),
  ]);

  type Row = Record<string, number | string | null>;
  const shares = new Map<string, { memberId: number; share: number }[]>();
  for (const a of attendees.results as Row[]) {
    const list = shares.get(a.session_id as string) ?? [];
    list.push({ memberId: a.member_id as number, share: a.share as number });
    shares.set(a.session_id as string, list);
  }
  const balances = computeBalances(
    (sessions.results as Row[]).map((s) => ({ payerId: s.payer_id as number, attendees: shares.get(s.id as string) ?? [] })),
    (transfers.results as Row[]).map((t) => ({ fromId: t.from_id as number, toId: t.to_id as number, amount: t.amount as number })),
  );
  const reported = new Set((claims.results as Row[]).map((c) => `${c.from_id}-${c.to_id}`));
  const names = new Map((members.results as Row[]).map((m) => [m.id as number, m.name as string]));

  // memberId -> what they still owe, to whom
  const debts = new Map<number, Debt[]>();
  for (const s of suggestTransfers(balances)) {
    if (reported.has(`${s.fromId}-${s.toId}`)) continue;
    const list = debts.get(s.fromId) ?? [];
    list.push({ name: names.get(s.toId) ?? "?", amount: s.amount });
    debts.set(s.fromId, list);
  }

  // The app address the phones signed up through names the sender.
  const rows = devices.results as Row[];
  const anyOrigin = rows.find((d) => d.origin)?.origin as string | undefined;
  let reminded = 0;
  for (const memberId of new Set(rows.map((d) => d.member_id as number))) {
    const owed = debts.get(memberId);
    if (!owed) continue;
    const origin = (rows.find((d) => d.member_id === memberId && d.origin)?.origin as string | undefined) ?? anyOrigin;
    if (!origin) {
      // Only devices registered before the address was kept; the next app opening fills it in.
      console.warn("reminder skipped: no app address for member", memberId);
      continue;
    }
    const delivered = await pushToMember(db, jwk, memberId, reminderMessage(owed), origin, REMINDER_TTL_SECONDS).catch(
      (error: unknown) => {
        console.error("reminder failed", error);
        return 0;
      },
    );
    if (delivered > 0) reminded++;
  }
  return reminded;
}
