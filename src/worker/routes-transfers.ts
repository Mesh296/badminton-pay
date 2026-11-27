import { Hono, type Context } from "hono";
import type { Me, TransferSnapshot } from "../shared/types";
import { logActivity, readStoredTransfer } from "./activity-log";
import { intParam, membersExist, readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { transferSchema } from "./validation";

// A transfer is a manual record that one member paid another outside the app.
// Only the member who received the money (or an admin) may record, fix or undo it:
// the receiver is the one who can see it arrive, and a debtor cannot clear
// their own debt.
export const transferRoutes = new Hono<AppEnv>();

const isReceiver = (c: Context<AppEnv>, toId: number) => {
  const actor = c.get("actor");
  return Boolean(actor?.admin) || (actor?.memberId != null && actor.memberId === toId);
};
const notReceiver = (c: Context<AppEnv>) => c.json({ error: "Chỉ người nhận mới xác nhận được" }, 403);

transferRoutes.post("/", async (c) => {
  const body = await readBody(c, transferSchema);
  if (body instanceof Response) return body;
  if (!isReceiver(c, body.toId)) return notReceiver(c);
  if (!(await membersExist(c.env.DB, [body.fromId, body.toId]))) {
    return c.json({ error: "Có thành viên không tồn tại" }, 400);
  }

  const db = c.env.DB;
  const transfer: TransferSnapshot = body;
  const [inserted] = await db.batch([
    db
      .prepare("INSERT INTO transfers (date, from_id, to_id, amount, note) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .bind(body.date, body.fromId, body.toId, body.amount, body.note),
    logActivity(db, c.get("actor") as Me, "transfer.create", null, transfer),
  ]);
  return c.json({ id: (inserted.results[0] as { id: number }).id }, 201);
});

// Fixing a mistake (wrong amount, date or payer). The receiver may not hand the
// transfer to someone else; an admin may change anything.
transferRoutes.put("/:id", async (c) => {
  const id = intParam(c, "id");
  if (id === null) return c.json({ error: "Không tìm thấy lần chuyển" }, 404);
  const db = c.env.DB;
  const existing = await readStoredTransfer(db, id);
  if (!existing) return c.json({ error: "Không tìm thấy lần chuyển" }, 404);
  if (!isReceiver(c, existing.toId)) return notReceiver(c);

  const body = await readBody(c, transferSchema);
  if (body instanceof Response) return body;
  if (!isReceiver(c, body.toId)) return notReceiver(c);
  if (!(await membersExist(db, [body.fromId, body.toId]))) {
    return c.json({ error: "Có thành viên không tồn tại" }, 400);
  }

  const updated: TransferSnapshot = body;
  await db.batch([
    db
      .prepare("UPDATE transfers SET date = ?, from_id = ?, to_id = ?, amount = ?, note = ? WHERE id = ?")
      .bind(body.date, body.fromId, body.toId, body.amount, body.note, id),
    logActivity(db, c.get("actor") as Me, "transfer.update", existing, updated),
  ]);
  return c.json({ id });
});

transferRoutes.delete("/:id", async (c) => {
  const id = intParam(c, "id");
  if (id === null) return c.json({ error: "Không tìm thấy lần chuyển" }, 404);
  const db = c.env.DB;
  const existing = await readStoredTransfer(db, id);
  if (!existing) return c.json({ error: "Không tìm thấy lần chuyển" }, 404);
  if (!isReceiver(c, existing.toId)) return notReceiver(c);
  await db.batch([
    db.prepare("DELETE FROM transfers WHERE id = ?").bind(id),
    logActivity(db, c.get("actor") as Me, "transfer.delete", existing, null),
  ]);
  return c.body(null, 204);
});
