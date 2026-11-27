import { Hono } from "hono";
import { intParam, readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { memberSchema } from "./validation";

// Members are never deleted: deactivating keeps history and balances intact.
// Only admins manage members, because linking an email to a member is what
// lets that account act as the member.
export const memberRoutes = new Hono<AppEnv>();

memberRoutes.use("*", async (c, next) => {
  if (!c.get("actor")?.admin) return c.json({ error: "Chỉ quản trị sửa được thành viên" }, 403);
  await next();
});

/** True when another member already uses this email. */
async function emailTaken(db: D1Database, email: string | null, exceptId = 0): Promise<boolean> {
  if (!email) return false;
  const row = await db.prepare("SELECT 1 FROM members WHERE email = ? AND id <> ?").bind(email, exceptId).first();
  return row !== null;
}

memberRoutes.post("/", async (c) => {
  const body = await readBody(c, memberSchema);
  if (body instanceof Response) return body;
  if (await emailTaken(c.env.DB, body.email)) return c.json({ error: "Email đã gắn với người khác" }, 400);

  const row = await c.env.DB.prepare(
    "INSERT INTO members (name, bank_code, account_no, account_name, active, email) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(body.name, body.bankCode, body.accountNo, body.accountName, body.active ? 1 : 0, body.email)
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

memberRoutes.put("/:id", async (c) => {
  const id = intParam(c, "id");
  if (id === null) return c.json({ error: "Không tìm thấy thành viên" }, 404);
  const body = await readBody(c, memberSchema);
  if (body instanceof Response) return body;
  if (await emailTaken(c.env.DB, body.email, id)) return c.json({ error: "Email đã gắn với người khác" }, 400);

  const result = await c.env.DB.prepare(
    "UPDATE members SET name = ?, bank_code = ?, account_no = ?, account_name = ?, active = ?, email = ? WHERE id = ?",
  )
    .bind(body.name, body.bankCode, body.accountNo, body.accountName, body.active ? 1 : 0, body.email, id)
    .run();
  if (result.meta.changes === 0) return c.json({ error: "Không tìm thấy thành viên" }, 404);
  return c.json({ id });
});
