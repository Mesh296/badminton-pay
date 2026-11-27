import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Me } from "../shared/types";
import type { AppEnv } from "./index";

// Who is making a request. After a Google sign-in the Worker hands the browser
// a signed cookie carrying the account's email; every later request is tied to
// a member through that email. Nothing is stored server-side: changing
// SESSION_SECRET signs everyone out.

export const SESSION_COOKIE = "session";
// ponytail: fixed one-year session, no sliding renewal; members sign in again once a year.
export const SESSION_SECONDS = 60 * 60 * 24 * 365;
const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

const toBase64Url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** Sessions are only trusted when a real signing secret is set; otherwise everyone is a visitor. */
const sessionConfigured = (env: Env) => (env.SESSION_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH;

/** Google sign-in needs the OAuth client as well as the signing secret; without them it is refused. */
export function loginConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) && sessionConfigured(env);
}

/** Cookie value: base64url(JSON {email, exp}) + "." + base64url(HMAC-SHA256 of the first part). */
export async function signSession(email: string, secret: string, nowMs = Date.now()): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ email, exp: Math.floor(nowMs / 1000) + SESSION_SECONDS })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Email from a cookie value, or null when it is malformed, forged or expired. */
async function readSession(token: string, secret: string): Promise<string | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    // subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { email?: unknown; exp?: unknown };
    const live = typeof data.exp === "number" && data.exp > Date.now() / 1000;
    return live && typeof data.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

const adminEmails = (env: Env) =>
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** Sets `actor` for the request: the signed-in account, or null for a visitor. */
export const resolveActor = createMiddleware<AppEnv>(async (c, next) => {
  let actor: Me | null = null;
  const token = getCookie(c, SESSION_COOKIE);
  if (token && sessionConfigured(c.env)) {
    const email = await readSession(token, c.env.SESSION_SECRET);
    if (email) {
      const member = await c.env.DB.prepare("SELECT id FROM members WHERE email = ?").bind(email).first<{ id: number }>();
      actor = { email, memberId: member?.id ?? null, admin: adminEmails(c.env).includes(email) };
    }
  }
  c.set("actor", actor);
  await next();
});
