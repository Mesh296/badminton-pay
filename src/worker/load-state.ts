import type { AppState, Attendee, Me } from "../shared/types";

interface MemberRow {
  id: number;
  name: string;
  bank_code: string | null;
  account_no: string | null;
  account_name: string | null;
  active: number;
  email: string | null;
}
interface SessionRow {
  id: string;
  date: string;
  payer_id: number;
  court_amount: number;
  drink_amount: number;
  note: string | null;
}
interface AttendeeRow {
  session_id: string;
  member_id: number;
  drank: number;
  share: number;
}
interface TransferRow {
  id: number;
  date: string;
  from_id: number;
  to_id: number;
  amount: number;
  note: string | null;
}

/**
 * Everything the client needs in one read. The client derives balances,
 * settlement suggestions and stats from this. Reads are public, so member
 * emails are only included for an admin.
 * Ceiling: whole-history payload; move aggregation into SQL if it nears ~1 MB.
 */
export async function loadState(db: D1Database, actor: Me | null): Promise<AppState> {
  const [members, sessions, attendees, transfers] = await db.batch([
    db.prepare("SELECT id, name, bank_code, account_no, account_name, active, email FROM members ORDER BY id"),
    db.prepare(
      "SELECT id, date, payer_id, court_amount, drink_amount, note FROM sessions ORDER BY date DESC, rowid DESC",
    ),
    db.prepare("SELECT session_id, member_id, drank, share FROM session_attendees ORDER BY member_id"),
    db.prepare("SELECT id, date, from_id, to_id, amount, note FROM transfers ORDER BY date DESC, id DESC"),
  ]);

  const attendeesBySession = new Map<string, Attendee[]>();
  for (const row of attendees.results as AttendeeRow[]) {
    const list = attendeesBySession.get(row.session_id) ?? [];
    list.push({ memberId: row.member_id, drank: row.drank === 1, share: row.share });
    attendeesBySession.set(row.session_id, list);
  }

  return {
    members: (members.results as MemberRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      bankCode: row.bank_code,
      accountNo: row.account_no,
      accountName: row.account_name,
      active: row.active === 1,
      ...(actor?.admin ? { email: row.email } : {}),
    })),
    sessions: (sessions.results as SessionRow[]).map((row) => ({
      id: row.id,
      date: row.date,
      payerId: row.payer_id,
      courtAmount: row.court_amount,
      drinkAmount: row.drink_amount,
      note: row.note,
      attendees: attendeesBySession.get(row.id) ?? [],
    })),
    transfers: (transfers.results as TransferRow[]).map((row) => ({
      id: row.id,
      date: row.date,
      fromId: row.from_id,
      toId: row.to_id,
      amount: row.amount,
      note: row.note,
    })),
    me: actor,
  };
}
