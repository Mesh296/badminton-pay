import { Hono, type Context } from "hono";
import type { Me, TransferSnapshot } from "../shared/types";
import { logActivity } from "./activity-log";
import { intParam, membersExist, readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { transferFromRow, type TransferRow } from "./load-state";
import { isReceiver, notReceiver } from "./routes-transfers";
import { transferSchema } from "./validation";

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

// Report a payment you made.
claimRoutes.post("/", async (c) => {
  const body = await readBody(c, transferSchema);
  if (body instanceof Response) return body;
  if (c.get("actor")?.memberId !== body.fromId) return c.json({ error: "Chỉ người chuyển mới báo được" }, 403);
  if (!(await membersExist(c.env.DB, [body.fromId, body.toId]))) {
    return c.json({ error: "Có thành viên không tồn tại" }, 400);
  }
  const row = await c.env.DB.prepare(
    "INSERT INTO transfer_claims (date, from_id, to_id, amount, note) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(body.date, body.fromId, body.toId, body.amount, body.note)
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

// The receiver (or an admin) saw the money arrive: it becomes a transfer.
claimRoutes.post("/:id/confirm", async (c) => {
  const id = intParam(c, "id");
  const db = c.env.DB;
  const claim = await readClaim(db, id);
  if (!claim) return notFound(c);
  if (!isReceiver(c, claim.toId)) return notReceiver(c);

  const snapshot: TransferSnapshot = {
    date: claim.date,
    fromId: claim.fromId,
    toId: claim.toId,
    amount: claim.amount,
    note: claim.note,
  };
  try {
    const [inserted] = await db.batch([
      // The amount is read again inside the batch: if a second confirm got here
      // first and the claim is gone, it is NULL, the insert fails and the whole
      // batch rolls back, so one report never becomes two transfers.
      db
        .prepare(
          `INSERT INTO transfers (date, from_id, to_id, amount, note)
           VALUES (?, ?, ?, (SELECT amount FROM transfer_claims WHERE id = ?), ?) RETURNING id`,
        )
        .bind(claim.date, claim.fromId, claim.toId, id, claim.note),
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
  await db.prepare("DELETE FROM transfer_claims WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});
