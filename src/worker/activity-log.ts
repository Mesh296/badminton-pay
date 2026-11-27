import type { ActivityEntry, Me, MemberEvent, SessionSnapshot, TransferSnapshot } from "../shared/types";
import { attendeeFromRow, sessionFromRow, type AttendeeRow, type SessionRow, type TransferRow } from "./load-state";

// The activity log: who changed which session or transfer, when, and what it
// looked like before and after. Rows are written in the same batch as the
// change, so a change never lands without its log entry or the other way round.

/** The log row for one change, to add to the batch that makes the change. */
export function logActivity(
  db: D1Database,
  actor: Me,
  action: ActivityEntry["action"],
  before: SessionSnapshot | TransferSnapshot | null,
  after: SessionSnapshot | TransferSnapshot | MemberEvent | null,
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO activity_log (at, actor_email, actor_member_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      new Date().toISOString(),
      actor.email,
      actor.memberId,
      action,
      before && JSON.stringify(before),
      after && JSON.stringify(after),
    );
}

/**
 * The log row for someone joining, to add to the batch right after the write
 * that makes them a member. `memberIdSql` finds their id inside that batch,
 * e.g. "(SELECT id FROM members WHERE email = ?)" or "last_insert_rowid()".
 */
export function logMemberJoin(db: D1Database, actor: Me, memberIdSql: string, ...binds: unknown[]): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO activity_log (at, actor_email, actor_member_id, action, before, after)
       VALUES (?, ?, ?, 'member.join', NULL, json_object('memberId', ${memberIdSql}))`,
    )
    .bind(new Date().toISOString(), actor.email, actor.memberId, ...binds);
}

/** A session as stored now, or null when there is none with this id. */
export async function readStoredSession(db: D1Database, id: string): Promise<SessionSnapshot | null> {
  const [session, attendees] = await db.batch([
    db.prepare("SELECT id, date, payer_id, court_amount, drink_amount, note FROM sessions WHERE id = ?").bind(id),
    db.prepare("SELECT session_id, member_id, drank, hours, share FROM session_attendees WHERE session_id = ? ORDER BY member_id").bind(id),
  ]);
  const row = session.results[0] as SessionRow | undefined;
  return row ? sessionFromRow(row, (attendees.results as AttendeeRow[]).map(attendeeFromRow)) : null;
}

/** A transfer as stored now (without its id), or null when there is none with this id. */
export async function readStoredTransfer(db: D1Database, id: number): Promise<TransferSnapshot | null> {
  const row = await db
    .prepare("SELECT id, date, from_id, to_id, amount, note FROM transfers WHERE id = ?")
    .bind(id)
    .first<TransferRow>();
  return row && { date: row.date, fromId: row.from_id, toId: row.to_id, amount: row.amount, note: row.note };
}
