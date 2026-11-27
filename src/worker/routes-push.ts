import { Hono, type Context } from "hono";
import { z } from "zod";
import { readBody } from "./http-helpers";
import type { AppEnv } from "./index";
import { fromBase64Url } from "../shared/base64url";
import { sendPush, vapidPublicKey, type PushTarget } from "./web-push";

// Notifications to a member's phone, so the receiver hears about a reported
// payment without opening the app. Turned on per device from the members tab;
// works once the VAPID_KEY secret is set (scripts/generate-vapid-key.mjs).
export const pushRoutes = new Hono<AppEnv>();

/** Most devices kept per member; the oldest goes when one more signs up. */
const DEVICES_PER_MEMBER = 5;

function vapidKey(env: Env): JsonWebKey | null {
  try {
    return env.VAPID_KEY ? (JSON.parse(env.VAPID_KEY) as JsonWebKey) : null;
  } catch {
    return null;
  }
}

// The server posts to whatever endpoint a member registers, so only the real
// push services are accepted: never an address inside the server's network.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.apple\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const isPushService = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
};
const keyOfLength = (bytes: number) =>
  z
    .string()
    .max(200)
    .refine((value) => {
      try {
        return /^[A-Za-z0-9_-]+=*$/.test(value) && fromBase64Url(value).length === bytes;
      } catch {
        return false;
      }
    }, "Thiết bị không hợp lệ");

// What PushSubscription.toJSON() gives in the browser.
const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushService, "Thiết bị không hợp lệ"),
  keys: z.object({ p256dh: keyOfLength(65), auth: keyOfLength(16) }),
});

// The public half, which the browser needs to subscribe. 404 while push is not set up.
pushRoutes.get("/key", (c) => {
  const jwk = vapidKey(c.env);
  return jwk ? c.json({ key: vapidPublicKey(jwk) }) : c.json({ error: "Chưa bật thông báo" }, 404);
});

// This device now rings for the signed-in member (taking it over from whoever had it).
pushRoutes.post("/", async (c) => {
  const memberId = c.get("actor")?.memberId;
  if (memberId == null) return c.json({ error: "Bạn chưa ở trong nhóm" }, 403);
  const body = await readBody(c, subscriptionSchema);
  if (body instanceof Response) return body;
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth) VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .bind(body.endpoint, memberId, body.keys.p256dh, body.keys.auth),
    db
      .prepare(
        `DELETE FROM push_subscriptions WHERE member_id = ? AND rowid NOT IN
           (SELECT rowid FROM push_subscriptions WHERE member_id = ? ORDER BY rowid DESC LIMIT ?)`,
      )
      .bind(memberId, memberId, DEVICES_PER_MEMBER),
  ]);
  return c.body(null, 204);
});

// This device stops ringing (turned off, or signing out).
pushRoutes.delete("/", async (c) => {
  const memberId = c.get("actor")?.memberId;
  const body = await readBody(c, z.object({ endpoint: z.string().max(1000) }));
  if (body instanceof Response) return body;
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?")
    .bind(body.endpoint, memberId ?? 0)
    .run();
  return c.body(null, 204);
});

/**
 * Rings every device of one member. Runs after the response is sent; a
 * failure is logged and never undoes the write that caused it.
 */
export function notifyMember(c: Context<AppEnv>, memberId: number, message: { title: string; body: string; url: string }) {
  const jwk = vapidKey(c.env);
  if (!jwk) return;
  const db = c.env.DB;
  // The app's own address identifies the sender to the push service.
  const subject = new URL(c.req.url).origin;
  const work = (async () => {
    const devices = await db
      .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ?")
      .bind(memberId)
      .all<PushTarget>();
    for (const device of devices.results) {
      const status = await sendPush(device, message, jwk, subject).catch((error: unknown) => {
        console.error("push failed", error);
        return 0;
      });
      // Gone for good: the app was removed or notifications turned off.
      if (status === 404 || status === 410) {
        await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(device.endpoint).run();
      } else if (status >= 400) {
        console.error("push refused", status, new URL(device.endpoint).hostname);
      }
    }
  })().catch((error: unknown) => console.error("push failed", error));
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // The Node server has no execution context; the promise just runs on.
  }
}
