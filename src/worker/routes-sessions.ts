import { Hono, type Context } from "hono";
import { splitSession } from "../shared/money";
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

// Shares are always computed here; the client never supplies them.
function attendeeInserts(db: D1Database, sessionId: string, input: SessionInput): D1PreparedStatement[] {
  const shares = splitSession(input);
  return input.attendees.map((attendee) =>
    db
      .prepare("INSERT INTO session_attendees (session_id, member_id, drank, share) VALUES (?, ?, ?, ?)")
      .bind(sessionId, attendee.memberId, attendee.drank ? 1 : 0, shares.get(attendee.memberId)!),
  );
}

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
  const id = crypto.randomUUID();
  // One batch = one transaction: a session never exists without its attendees.
  await db.batch([
    db
      .prepare(
        "INSERT INTO sessions (id, date, payer_id, court_amount, drink_amount, note) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, body.date, body.payerId, body.courtAmount, body.drinkAmount, body.note),
    ...attendeeInserts(db, id, body),
  ]);
  return c.json({ id }, 201);
});

sessionRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const existing = await db.prepare("SELECT payer_id FROM sessions WHERE id = ?").bind(id).first<{ payer_id: number }>();
  if (!existing) return c.json({ error: "Không tìm thấy buổi" }, 404);
  if (!ownsSession(c, existing.payer_id)) return notOwner(c);

  const body = await readSession(c);
  if (body instanceof Response) return body;
  // The payer cannot be handed to someone else either.
  if (!ownsSession(c, body.payerId)) return notOwner(c);

  try {
    await db.batch([
      db
        .prepare(
          "UPDATE sessions SET date = ?, payer_id = ?, court_amount = ?, drink_amount = ?, note = ? WHERE id = ?",
        )
        .bind(body.date, body.payerId, body.courtAmount, body.drinkAmount, body.note, id),
      db.prepare("DELETE FROM session_attendees WHERE session_id = ?").bind(id),
      ...attendeeInserts(db, id, body),
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
  const existing = await c.env.DB.prepare("SELECT payer_id FROM sessions WHERE id = ?").bind(id).first<{ payer_id: number }>();
  if (!existing) return c.json({ error: "Không tìm thấy buổi" }, 404);
  if (!ownsSession(c, existing.payer_id)) return notOwner(c);
  // Attendee rows go with the session via ON DELETE CASCADE.
  await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});
