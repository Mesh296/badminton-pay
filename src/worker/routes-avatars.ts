import { Hono } from "hono";
import { z } from "zod";
import { fromBase64Url } from "../shared/base64url";
import { intParam, readBody } from "./http-helpers";
import type { AppEnv } from "./index";

// Profile photos. A member sets or removes their own; anyone may look, as
// with names. The phone shrinks the photo to a 256×256 JPEG before sending.
export const avatarRoutes = new Hono<AppEnv>();

/** Far more than a 256×256 JPEG needs; keeps a row small. */
const MAX_BYTES = 200_000;

const avatarSchema = z.object({
  image: z
    .string()
    .max(Math.ceil((MAX_BYTES * 4) / 3) + 4, "Ảnh quá lớn")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Ảnh không hợp lệ")
    // Only JPEG is ever stored and served (it starts FF D8 FF), so nothing
    // else can be handed back to browsers from this app's address.
    .refine((value) => {
      const bytes = fromBase64Url(value.slice(0, 8));
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }, "Ảnh phải là JPEG"),
});

// The photo itself. Its address carries the version, so it never changes and may be cached.
avatarRoutes.get("/:id", async (c) => {
  const id = intParam(c, "id");
  const row =
    id === null
      ? null
      : await c.env.DB.prepare("SELECT image FROM member_avatars WHERE member_id = ?").bind(id).first<{ image: string }>();
  if (!row) return c.json({ error: "Chưa có ảnh" }, 404);
  return c.body(fromBase64Url(row.image), 200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
});

avatarRoutes.put("/", async (c) => {
  const memberId = c.get("actor")?.memberId;
  if (memberId == null) return c.json({ error: "Bạn chưa ở trong nhóm" }, 403);
  const body = await readBody(c, avatarSchema);
  if (body instanceof Response) return body;
  await c.env.DB.prepare(
    `INSERT INTO member_avatars (member_id, image, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(member_id) DO UPDATE SET image = excluded.image, updated_at = excluded.updated_at`,
  )
    .bind(memberId, body.image, Date.now())
    .run();
  return c.body(null, 204);
});

avatarRoutes.delete("/", async (c) => {
  const memberId = c.get("actor")?.memberId;
  if (memberId == null) return c.json({ error: "Bạn chưa ở trong nhóm" }, 403);
  await c.env.DB.prepare("DELETE FROM member_avatars WHERE member_id = ?").bind(memberId).run();
  return c.body(null, 204);
});
