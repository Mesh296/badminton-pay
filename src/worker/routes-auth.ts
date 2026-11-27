import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { fromBase64Url } from "../shared/base64url";
import { loginConfigured, SESSION_COOKIE, SESSION_SECONDS, signSession } from "./auth-session";
import type { AppEnv } from "./index";
import { logActivity } from "./activity-log";

// Google sign-in, authorization-code flow done entirely by redirects:
//   /api/auth/login -> Google -> /api/auth/callback -> session cookie -> app.
// Redirects (no popup, no Google script) are the form most likely to work
// inside an iPhone home-screen app.
export const authRoutes = new Hono<AppEnv>();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const STATE_COOKIE = "oauth_state";
const STATE_SECONDS = 600;

// Lax lets the cookie ride the top-level redirect back from Google while
// keeping it off cross-site POSTs, which is what stops request forgery.
const cookieOptions = (c: Context<AppEnv>, maxAge: number) =>
  ({
    httpOnly: true,
    // Plain http only happens on the local dev server.
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge,
  }) as const;

const redirectUri = (c: Context<AppEnv>) => new URL("/api/auth/callback", c.req.url).toString();

// Every failure returns to the app, which shows a notice for ?login=failed.
// A bare error page would strand a home-screen app, which has no back button.
const failed = (c: Context<AppEnv>) => c.redirect("/?login=failed");

authRoutes.get("/login", (c) => {
  if (!loginConfigured(c.env)) return failed(c);
  // Random value echoed back by Google; proves the callback belongs to this browser.
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, cookieOptions(c, STATE_SECONDS));
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(c),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  }).toString();
  return c.redirect(url.toString());
});

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  email?: unknown;
  email_verified?: unknown;
}

/**
 * Claims of a Google ID token. The signature is not checked: the token comes
 * straight from Google's token endpoint over TLS, authenticated with the
 * client secret, which Google documents as sufficient for this flow.
 */
function readClaims(idToken: unknown): IdTokenClaims | null {
  if (typeof idToken !== "string") return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(idToken.split(".")[1] ?? ""))) as IdTokenClaims;
  } catch {
    return null;
  }
}

authRoutes.get("/callback", async (c) => {
  const state = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  const code = c.req.query("code");
  // Also reached when the user cancels at Google (no code).
  if (!loginConfigured(c.env) || !code || !state || c.req.query("state") !== state) return failed(c);

  // Network failure or a non-JSON reply from Google counts as a failed sign-in.
  const tokens = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(c),
      grant_type: "authorization_code",
    }),
  })
    .then((response) => (response.ok ? (response.json() as Promise<{ id_token?: unknown }>) : null))
    .catch(() => null);

  const claims = readClaims(tokens?.id_token);
  const verified = claims?.email_verified === true || claims?.email_verified === "true";
  if (
    !claims ||
    claims.aud !== c.env.GOOGLE_CLIENT_ID ||
    !GOOGLE_ISSUERS.includes(String(claims.iss)) ||
    !verified ||
    typeof claims.email !== "string"
  ) {
    return failed(c);
  }

  const email = claims.email.toLowerCase();
  const session = await signSession(email, c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, session, cookieOptions(c, SESSION_SECONDS));
  // Members' sign-ins show in the Thông báo tab. Someone not in the group yet
  // shows up as a request to join instead.
  const member = await c.env.DB.prepare("SELECT id FROM members WHERE email = ?").bind(email).first<{ id: number }>();
  if (member) {
    await logActivity(c.env.DB, { email, memberId: member.id, admin: false }, "auth.login", null, null).run();
  }
  return c.redirect("/");
});

authRoutes.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});
