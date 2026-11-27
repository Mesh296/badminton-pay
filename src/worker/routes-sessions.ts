import { Hono, type Context } from "hono";
import { splitSession } from "../shared/money";
import type { Me, SessionSnapshot } from "../shared/types";
import { logActivity, readStoredSession } from "./activity-log";
import { membersExist, readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { sessionSchema, type SessionInput } from "./validation";

export const sessionRoutes = new Hono<AppEnv>();

// A session belongs to whoever fronted the money: only that member (or an
// admin) may enter, change or delete it. This stops one member from recording
// a session that makes others owe someone else.
const ownsSession = (c: Context<AppEnv>, payerId: number) => {
  const actor = c.get("actor");
  return Boolean(actor?.admin) || (actor?.memberId != null && actor.memberId === payerId);
};
const notOwner = (c: Context<AppEnv>) => c.json({ error: "Chỉ người ứng mới ghi được buổi này" }, 403);

// The session as it will be stored. Shares are always computed here; the
// client never supplies them. An attendee sent without hours keeps the hours
// stored for them (`stored`), or counts 1.
function toSnapshot(id: string, body: SessionInput, stored?: SessionSnapshot | null): SessionSnapshot {
  const storedHours = new Map(stored?.attendees.map((a) => [a.memberId, a.hours]));
  const input = {
    ...body,
    attendees: body.attendees.map((a) => ({ ...a, hours: a.hours ?? storedHours.get(a.memberId) ?? 1 })),
  };
  const shares = splitSession(input);
  return {
    id,
    date: input.date,
    payerId: input.payerId,
    courtAmount: input.courtAmount,
    drinkAmount: input.drinkAmount,
    note: input.note,
    attendees: input.attendees.map((a) => ({
      memberId: a.memberId,
      drank: a.drank,
      hours: a.hours,
      share: shares.get(a.memberId)!,
    })),
  };
}

function attendeeInserts(db: D1Database, session: SessionSnapshot): D1PreparedStatement[] {
  return session.attendees.map((attendee) =>
    db
      .prepare("INSERT INTO session_attendees (session_id, member_id, drank, hours, share) VALUES (?, ?, ?, ?, ?)")
      .bind(session.id, attendee.memberId, attendee.drank ? 1 : 0, attendee.hours, attendee.share),
  );
}

// Writes need a signed-in account (index.ts answers 401 otherwise).
const actorOf = (c: Context<AppEnv>) => c.get("actor") as Me;

// Validated session body, or the error Response to send back.
async function readSession(c: Context<AppEnv>): Promise<SessionInput | Response> {
  const body = await readBody(c, sessionSchema);
  if (body instanceof Response) return body;
  const ids = [body.payerId, ...body.attendees.map((a) => a.memberId)];
  if (!(await membersExist(c.env.DB, ids))) {
    return c.json({ error: "Có thành viên không tồn tại" }, 400);
  }
  return body;
}

sessionRoutes.post("/", async (c) => {
  const body = await readSession(c);
  if (body instanceof Response) return body;
  if (!ownsSession(c, body.payerId)) return notOwner(c);

  const db = c.env.DB;
  const id = body.id ?? crypto.randomUUID();
  // Saved already: the app is retrying after its reply was lost.
  if (await db.prepare("SELECT 1 FROM sessions WHERE id = ?").bind(id).first()) return c.json({ id }, 200);
  const session = toSnapshot(id, body);
  // One batch = one transaction: a session never exists without its attendees or its log entry.
  await db.batch([
    db
      .prepare(
        "INSERT INTO sessions (id, date, payer_id, court_amount, drink_amount, note) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, body.date, body.payerId, body.courtAmount, body.drinkAmount, body.note),
    ...attendeeInserts(db, session),
    logActivity(db, actorOf(c), "session.create", null, session),
  ]);
  return c.json({ id }, 201);
});

sessionRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const existing = await readStoredSession(db, id);
  if (!existing) return c.json({ error: "Không tìm thấy buổi" }, 404);
  if (!ownsSession(c, existing.payerId)) return notOwner(c);

  const body = await readSession(c);
  if (body instanceof Response) return body;
  // The payer cannot be handed to someone else either.
  if (!ownsSession(c, body.payerId)) return notOwner(c);

  const updated = toSnapshot(id, body, existing);
  try {
    await db.batch([
      db
        .prepare(
          "UPDATE sessions SET date = ?, payer_id = ?, court_amount = ?, drink_amount = ?, note = ? WHERE id = ?",
        )
        .bind(body.date, body.payerId, body.courtAmount, body.drinkAmount, body.note, id),
      db.prepare("DELETE FROM session_attendees WHERE session_id = ?").bind(id),
      ...attendeeInserts(db, updated),
      logActivity(db, actorOf(c), "session.update", existing, updated),
    ]);
  } catch (error) {
    // Someone deleted the session between the check above and this batch: the
    // attendee inserts then fail on the foreign key and the batch rolls back.
    const stillThere = await db.prepare("SELECT 1 FROM sessions WHERE id = ?").bind(id).first();
    if (!stillThere) return c.json({ error: "Không tìm thấy buổi" }, 404);
    throw error;
  }
  return c.json({ id });
});

sessionRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const existing = await readStoredSession(db, id);
  if (!existing) return c.json({ error: "Không tìm thấy buổi" }, 404);
  if (!ownsSession(c, existing.payerId)) return notOwner(c);
  // Attendee rows go with the session via ON DELETE CASCADE; the log keeps a copy.
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE id = ?").bind(id),
    logActivity(db, actorOf(c), "session.delete", existing, null),
  ]);
  return c.body(null, 204);
});
