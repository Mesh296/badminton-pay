import { Hono } from "hono";
import type { Me } from "../shared/types";
import { resolveActor } from "./auth-session";
import { sendDailyReminders } from "./daily-reminder";
import { loadState } from "./load-state";
import { authRoutes } from "./routes-auth";
import { avatarRoutes } from "./routes-avatars";
import { claimRoutes } from "./routes-claims";
import { pushRoutes } from "./routes-push";
import { memberRoutes } from "./routes-members";
import { joinRoutes, profileRoutes } from "./routes-self-service";
import { sessionRoutes } from "./routes-sessions";
import { transferRoutes } from "./routes-transfers";

export type AppEnv = { Bindings: Env; Variables: { actor: Me | null } };

const app = new Hono<AppEnv>();

app.use("/api/*", resolveActor);

// Reads are public; every other method needs a signed-in account. Enforced here
// for the whole API so a new write route cannot be added without the check.
// What each account may change is decided in the routes. The sign-in routes
// themselves are exempt.
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET") {
    // Browsers send Origin on every non-GET request. The cookie is SameSite=Lax,
    // which stops other sites but not a sibling origin under the same parent
    // domain (another Worker on the account), so a foreign Origin is refused.
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "Yêu cầu không hợp lệ" }, 403);
    if (!c.req.path.startsWith("/api/auth/") && !c.get("actor")) return c.json({ error: "Cần đăng nhập" }, 401);
  }
  await next();
});

// Liveness check that also proves the D1 binding and schema are in place.
app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT count(*) AS n FROM members").first<{ n: number }>();
  return c.json({ ok: true, members: row?.n ?? 0 });
});

app.get("/api/state", async (c) => c.json(await loadState(c.env.DB, c.get("actor"))));

app.route("/api/auth", authRoutes);
app.route("/api/members", memberRoutes);
app.route("/api/join", joinRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/sessions", sessionRoutes);
app.route("/api/transfers", transferRoutes);
app.route("/api/claims", claimRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/avatars", avatarRoutes);

// Only /api/* reaches the Worker, so any unmatched path here is an unknown API route.
app.notFound((c) => c.json({ error: "Không tìm thấy" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Lỗi máy chủ" }, 500);
});

// The API, plus the evening reminder on the cron trigger in wrangler.jsonc.
export default {
  fetch: app.fetch,
  scheduled(_event, env, ctx) {
    ctx.waitUntil(
      sendDailyReminders(env)
        .then((n) => console.log(`reminded ${n}`))
        .catch((error: unknown) => console.error("reminders failed", error)),
    );
  },
} satisfies ExportedHandler<Env>;
