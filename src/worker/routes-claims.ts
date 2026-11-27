import { Hono, type Context } from "hono";
import { formatMoney } from "../shared/money";
import type { Me, TransferSnapshot } from "../shared/types";
import { logActivity } from "./activity-log";
import { intParam, membersExist, readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { transferFromRow, type TransferRow } from "./load-state";
import { notifyMember } from "./routes-push";
import { isReceiver, notReceiver } from "./routes-transfers";
import { confirmSchema, transferSchema } from "./validation";

// "Đã chuyển": the payer reports a payment, and the receiver confirms it once
// they see the money arrive. Only the confirmation records a transfer, so a
// debtor still cannot clear their own debt; the report just tells the
// receiver what to look for.
export const claimRoutes = new Hono<AppEnv>();

const notFound = (c: Context<AppEnv>) => c.json({ error: "Không tìm thấy lần báo chuyển" }, 404);

async function readClaim(db: D1Database, id: number | null) {
  if (id === null) return null;
  const row = await db
    .prepare("SELECT id, date, from_id, to_id, amount, note FROM transfer_claims WHERE id = ?")
    .bind(id)
    .first<TransferRow>();
  return row && transferFromRow(row);
}

/** A member's balance from the stored records (positive: is owed), as the client computes it. */
async function balanceOf(db: D1Database, memberId: number): Promise<number> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(a.share), 0) FROM session_attendees a JOIN sessions s ON s.id = a.session_id WHERE s.payer_id = ?1)
       - (SELECT COALESCE(SUM(share), 0) FROM session_attendees WHERE member_id = ?1)
       + (SELECT COALESCE(SUM(amount), 0) FROM transfers WHERE from_id = ?1)
       - (SELECT COALESCE(SUM(amount), 0) FROM transfers WHERE to_id = ?1) AS balance`,
    )
    .bind(memberId)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
}

// Report a payment you made.
claimRoutes.post("/", async (c) => {
  const body = await readBody(c, transferSchema);
  if (body instanceof Response) return body;
  if (c.get("actor")?.memberId !== body.fromId) return c.json({ error: "Chỉ người chuyển mới báo được" }, 403);
  if (!(await membersExist(c.env.DB, [body.fromId, body.toId]))) {
    return c.json({ error: "Có thành viên không tồn tại" }, 400);
  }
  const db = c.env.DB;
  // One open report per payer and receiver: a second tap, a second device or
  // a stale screen would otherwise ask the receiver to confirm the same money twice.
  const pending = await db
    .prepare("SELECT 1 FROM transfer_claims WHERE from_id = ? AND to_id = ?")
    .bind(body.fromId, body.toId)
    .first();
  if (pending) return c.json({ error: "Đã báo rồi, đang chờ người nhận xác nhận" }, 409);
  // Someone who owes nothing has nothing to report: most likely the receiver
  // already recorded this payment and the payer's screen was out of date.
  if ((await balanceOf(db, body.fromId)) >= 0) {
    return c.json({ error: "Bạn không còn nợ: có thể người nhận đã ghi khoản này rồi" }, 409);
  }
  const snapshot: TransferSnapshot = body;
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO transfer_claims (date, from_id, to_id, amount, note) VALUES (?, ?, ?, ?, ?)
         RETURNING id, (SELECT name FROM members WHERE id = from_id) AS payer`,
      )
      .bind(body.date, body.fromId, body.toId, body.amount, body.note),
    logActivity(db, c.get("actor") as Me, "claim.create", null, snapshot),
  ]);
  const row = inserted.results[0] as { id: number; payer: string } | undefined;
  // The receiver's phone rings, so they know to look at their account.
  notifyMember(c, body.toId, {
    title: `${row!.payer} báo đã chuyển ${formatMoney(body.amount)}`,
    body: "Mở app để xác nhận đã nhận",
    url: "/",
  });
  return c.json({ id: row!.id }, 201);
});

// The receiver (or an admin) saw the money arrive: it becomes a transfer.
claimRoutes.post("/:id/confirm", async (c) => {
  const id = intParam(c, "id");
  const db = c.env.DB;
  const claim = await readClaim(db, id);
  if (!claim) return notFound(c);
  if (!isReceiver(c, claim.toId)) return notReceiver(c);
  // The receiver records what reached their account, which may differ from
  // what was reported (sent short, or more); the log keeps whose word it was.
  // No body (or one that is not JSON) confirms the reported amount.
  const body = await readBody(c, confirmSchema);
  if (body instanceof Response) return body;
  const received = body?.amount ?? claim.amount;

  const snapshot: TransferSnapshot = {
    date: claim.date,
    fromId: claim.fromId,
    toId: claim.toId,
    amount: received,
    note: claim.note,
  };
  try {
    const [inserted] = await db.batch([
      // The claim is checked again inside the batch: if a second confirm got
      // here first and the claim is gone, the amount is NULL, the insert fails
      // and the whole batch rolls back, so one report never becomes two transfers.
      db
        .prepare(
          `INSERT INTO transfers (date, from_id, to_id, amount, note)
           VALUES (?, ?, ?, (SELECT CASE WHEN EXISTS (SELECT 1 FROM transfer_claims WHERE id = ?) THEN ? END), ?)
           RETURNING id`,
        )
        .bind(claim.date, claim.fromId, claim.toId, id, received, claim.note),
      db.prepare("DELETE FROM transfer_claims WHERE id = ?").bind(id),
      logActivity(db, c.get("actor") as Me, "transfer.create", null, snapshot),
    ]);
    return c.json({ id: (inserted.results[0] as { id: number }).id }, 201);
  } catch (error) {
    if (!(await readClaim(db, id))) return notFound(c);
    throw error;
  }
});

// Not received (by the receiver or an admin), or taken back (by the payer).
claimRoutes.delete("/:id", async (c) => {
  const id = intParam(c, "id");
  const db = c.env.DB;
  const claim = await readClaim(db, id);
  if (!claim) return notFound(c);
  const isPayer = c.get("actor")?.memberId === claim.fromId;
  if (!isPayer && !isReceiver(c, claim.toId)) return notReceiver(c);
  // Confirmed a moment ago from another phone: then nothing is withdrawn.
  const deleted = await db.prepare("DELETE FROM transfer_claims WHERE id = ?").bind(id).run();
  if (deleted.meta.changes === 0) return notFound(c);
  const { id: _id, ...snapshot } = claim;
  await logActivity(db, c.get("actor") as Me, "claim.delete", snapshot, null).run();
  return c.body(null, 204);
});
