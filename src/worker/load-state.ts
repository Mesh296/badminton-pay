import type { ActivityEntry, AppState, Attendee, JoinRequest, Me, Session, Transfer } from "../shared/types";

interface MemberRow {
  id: number;
  name: string;
  bank_code: string | null;
  account_no: string | null;
  account_name: string | null;
  active: number;
  email: string | null;
}
export interface SessionRow {
  id: string;
  date: string;
  payer_id: number;
  court_amount: number;
  drink_amount: number;
  note: string | null;
}
export interface AttendeeRow {
  session_id: string;
  member_id: number;
  drank: number;
  hours: number;
  share: number;
}
export interface TransferRow {
  id: number;
  date: string;
  from_id: number;
  to_id: number;
  amount: number;
  note: string | null;
}

interface ActivityRow {
  id: number;
  at: string;
  actor_email: string;
  actor_member_id: number | null;
  action: ActivityEntry["action"];
  before: string | null;
  after: string | null;
}

/** How many recent activity entries the state carries; older ones stay in the table. */
export const ACTIVITY_SHOWN = 50;

export const attendeeFromRow = (row: AttendeeRow): Attendee => ({
  memberId: row.member_id,
  drank: row.drank === 1,
  hours: row.hours,
  share: row.share,
});

export const sessionFromRow = (row: SessionRow, attendees: Attendee[]): Session => ({
  id: row.id,
  date: row.date,
  payerId: row.payer_id,
  courtAmount: row.court_amount,
  drinkAmount: row.drink_amount,
  note: row.note,
  attendees,
});

export const transferFromRow = (row: TransferRow): Transfer => ({
  id: row.id,
  date: row.date,
  fromId: row.from_id,
  toId: row.to_id,
  amount: row.amount,
  note: row.note,
});

function activityFromRow(row: ActivityRow, admin: boolean): ActivityEntry {
  return {
    id: row.id,
    at: row.at,
    actorMemberId: row.actor_member_id,
    ...(admin ? { actorEmail: row.actor_email } : {}),
    action: row.action,
    before: row.before === null ? null : JSON.parse(row.before),
    after: row.after === null ? null : JSON.parse(row.after),
  } as ActivityEntry;
}

interface JoinRequestRow {
  id: number;
  email: string;
  name: string;
  bank_code: string | null;
  account_no: string | null;
  account_name: string | null;
}

/** Open join requests the account may see: every one for an admin, otherwise only its own. */
async function loadJoinRequests(db: D1Database, actor: Me | null): Promise<JoinRequest[]> {
  // Members who are not admins have nothing to see here; skip the query.
  if (!actor || (!actor.admin && actor.memberId !== null)) return [];
  const rows = await db
    .prepare(
      "SELECT id, email, name, bank_code, account_no, account_name FROM join_requests WHERE ? = 1 OR email = ? ORDER BY id",
    )
    .bind(actor.admin ? 1 : 0, actor.email)
    .all<JoinRequestRow>();
  return rows.results.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    bankCode: row.bank_code,
    accountNo: row.account_no,
    accountName: row.account_name,
  }));
}

/**
 * Everything the client needs in one read. The client derives balances,
 * settlement suggestions and stats from this. Reads are public, so member
 * emails are only included for an admin.
 * Ceiling: whole-history payload; move aggregation into SQL if it nears ~1 MB.
 */
export async function loadState(db: D1Database, actor: Me | null): Promise<AppState> {
  const [members, sessions, attendees, transfers, activity] = await db.batch([
    db.prepare("SELECT id, name, bank_code, account_no, account_name, active, email FROM members ORDER BY id"),
    db.prepare(
      "SELECT id, date, payer_id, court_amount, drink_amount, note FROM sessions ORDER BY date DESC, rowid DESC",
    ),
    db.prepare("SELECT session_id, member_id, drank, hours, share FROM session_attendees ORDER BY member_id"),
    db.prepare("SELECT id, date, from_id, to_id, amount, note FROM transfers ORDER BY date DESC, id DESC"),
    db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT ?").bind(ACTIVITY_SHOWN),
  ]);

  const attendeesBySession = new Map<string, Attendee[]>();
  for (const row of attendees.results as AttendeeRow[]) {
    const list = attendeesBySession.get(row.session_id) ?? [];
    list.push(attendeeFromRow(row));
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
    sessions: (sessions.results as SessionRow[]).map((row) => sessionFromRow(row, attendeesBySession.get(row.id) ?? [])),
    transfers: (transfers.results as TransferRow[]).map(transferFromRow),
    me: actor,
    joinRequests: await loadJoinRequests(db, actor),
    activity: (activity.results as ActivityRow[]).map((row) => activityFromRow(row, Boolean(actor?.admin))),
  };
}
