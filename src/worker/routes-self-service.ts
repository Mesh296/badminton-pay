import { Hono } from "hono";
import { logMemberJoin } from "./activity-log";
import { intParam, readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { linkSchema, profileSchema } from "./validation";

// What a signed-in person can do for themself without an admin typing it in:
// ask to join the group, and keep their own name and bank details up to date.
// Joining still needs an admin's approval: the app's address is public, and a
// member can enter sessions that charge other people.

export const joinRoutes = new Hono<AppEnv>();
export const profileRoutes = new Hono<AppEnv>();

/** Open requests are capped so strangers cannot flood the admin's list. */
const MAX_OPEN_REQUESTS = 50;

// Ask to join. An admin's own request needs nobody's approval and becomes a member at once.
joinRoutes.post("/", async (c) => {
  const actor = c.get("actor")!;
  if (actor.memberId !== null) return c.json({ error: "Bạn đã ở trong nhóm" }, 400);
  const body = await readBody(c, profileSchema);
  if (body instanceof Response) return body;
  const db = c.env.DB;

  if (actor.admin) {
    await db.batch([
      db
        .prepare("INSERT INTO members (name, bank_code, account_no, account_name, email) VALUES (?, ?, ?, ?, ?)")
        .bind(body.name, body.bankCode, body.accountNo, body.accountName, actor.email),
      logMemberJoin(db, actor, "last_insert_rowid()"),
    ]);
    return c.json({ joined: true }, 201);
  }

  const open = await db
    .prepare("SELECT count(*) AS n FROM join_requests WHERE email <> ?")
    .bind(actor.email)
    .first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_REQUESTS) return c.json({ error: "Đang có quá nhiều yêu cầu chờ duyệt" }, 429);

  // Sending again replaces the earlier request, so a typo can be fixed.
  await db
    .prepare(
      `INSERT INTO join_requests (email, name, bank_code, account_no, account_name) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, bank_code = excluded.bank_code,
         account_no = excluded.account_no, account_name = excluded.account_name`,
    )
    .bind(actor.email, body.name, body.bankCode, body.accountNo, body.accountName)
    .run();
  return c.json({ joined: false }, 201);
});

const adminOnly = { error: "Chỉ quản trị duyệt được" };

interface RequestRow {
  email: string;
  name: string;
  bank_code: string | null;
  account_no: string | null;
  account_name: string | null;
}

async function readRequest(db: D1Database, id: number | null): Promise<RequestRow | null> {
  if (id === null) return null;
  return db
    .prepare("SELECT email, name, bank_code, account_no, account_name FROM join_requests WHERE id = ?")
    .bind(id)
    .first<RequestRow>();
}

const emailTaken = async (db: D1Database, email: string) =>
  (await db.prepare("SELECT 1 FROM members WHERE email = ?").bind(email).first()) !== null;
const takenError = { error: "Email đã gắn với người khác. Từ chối yêu cầu này." };

// Approve: the request becomes a new member linked to the requester's email.
joinRoutes.post("/:id/approve", async (c) => {
  if (!c.get("actor")?.admin) return c.json(adminOnly, 403);
  const id = intParam(c, "id");
  const db = c.env.DB;
  const request = await readRequest(db, id);
  if (!request) return c.json({ error: "Không tìm thấy yêu cầu" }, 404);
  if (await emailTaken(db, request.email)) return c.json(takenError, 400);

  // One transaction: the member appears and the request disappears together.
  await db.batch([
    db
      .prepare("INSERT INTO members (name, bank_code, account_no, account_name, email) VALUES (?, ?, ?, ?, ?)")
      .bind(request.name, request.bank_code, request.account_no, request.account_name, request.email),
    logMemberJoin(db, c.get("actor")!, "last_insert_rowid()"),
    db.prepare("DELETE FROM join_requests WHERE id = ?").bind(id),
  ]);
  return c.body(null, 204);
});

// Link: the requester is someone an admin added before they had signed in.
// Their email goes on that member, who keeps their name, sessions and
// balance; the bank details from the request fill in only a member with none.
joinRoutes.post("/:id/link", async (c) => {
  if (!c.get("actor")?.admin) return c.json(adminOnly, 403);
  const id = intParam(c, "id");
  const db = c.env.DB;
  const request = await readRequest(db, id);
  if (!request) return c.json({ error: "Không tìm thấy yêu cầu" }, 404);
  const body = await readBody(c, linkSchema);
  if (body instanceof Response) return body;
  const member = await db.prepare("SELECT email FROM members WHERE id = ?").bind(body.memberId).first<{ email: string | null }>();
  if (!member) return c.json({ error: "Không tìm thấy thành viên" }, 404);
  // Only an account-less member: replacing someone's email would lock them out.
  if (member.email !== null) return c.json({ error: "Người này đã có email" }, 400);
  if (await emailTaken(db, request.email)) return c.json(takenError, 400);

  const missing = "account_no IS NULL";
  await db.batch([
    db
      .prepare(
        `UPDATE members SET email = ?,
           bank_code = CASE WHEN ${missing} THEN ? ELSE bank_code END,
           account_name = CASE WHEN ${missing} THEN ? ELSE account_name END,
           account_no = CASE WHEN ${missing} THEN ? ELSE account_no END
         WHERE id = ? AND email IS NULL`,
      )
      .bind(request.email, request.bank_code, request.account_name, request.account_no, body.memberId),
    logMemberJoin(db, c.get("actor")!, "?", body.memberId),
    db.prepare("DELETE FROM join_requests WHERE id = ?").bind(id),
  ]);
  return c.body(null, 204);
});

// Reject: the request is dropped. The person may ask again.
joinRoutes.delete("/:id", async (c) => {
  if (!c.get("actor")?.admin) return c.json(adminOnly, 403);
  const id = intParam(c, "id");
  const result = id === null ? null : await c.env.DB.prepare("DELETE FROM join_requests WHERE id = ?").bind(id).run();
  if (!result || result.meta.changes === 0) return c.json({ error: "Không tìm thấy yêu cầu" }, 404);
  return c.body(null, 204);
});

// A member edits their own name and bank details. Email and "still playing" stay with the admins.
profileRoutes.put("/", async (c) => {
  const actor = c.get("actor")!;
  if (actor.memberId === null) return c.json({ error: "Bạn chưa ở trong nhóm" }, 403);
  const body = await readBody(c, profileSchema);
  if (body instanceof Response) return body;
  await c.env.DB.prepare("UPDATE members SET name = ?, bank_code = ?, account_no = ?, account_name = ? WHERE id = ?")
    .bind(body.name, body.bankCode, body.accountNo, body.accountName, actor.memberId)
    .run();
  return c.body(null, 204);
});
