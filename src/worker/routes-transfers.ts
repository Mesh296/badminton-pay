import { Hono, type Context } from "hono";
import { intParam, membersExist, readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { transferSchema } from "./validation";

// A transfer is a manual record that one member paid another outside the app.
// Only the member who received the money (or an admin) may record or undo it:
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

  const row = await c.env.DB.prepare(
    "INSERT INTO transfers (date, from_id, to_id, amount, note) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(body.date, body.fromId, body.toId, body.amount, body.note)
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

transferRoutes.delete("/:id", async (c) => {
  const id = intParam(c, "id");
  if (id === null) return c.json({ error: "Không tìm thấy lần chuyển" }, 404);
  const existing = await c.env.DB.prepare("SELECT to_id FROM transfers WHERE id = ?").bind(id).first<{ to_id: number }>();
  if (!existing) return c.json({ error: "Không tìm thấy lần chuyển" }, 404);
  if (!isReceiver(c, existing.to_id)) return notReceiver(c);
  await c.env.DB.prepare("DELETE FROM transfers WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});
