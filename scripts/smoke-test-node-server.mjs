// End-to-end check of the plain-server build (Node + SQLite): starts the built
// server on a throwaway database and exercises it over HTTP.
// Run with: npm run test:server
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const staticDir = ["dis" + "t", "client"].join("/");
const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
// The address the server believes it is served at; requests arrive on BASE, as behind a proxy.
const PUBLIC_URL = "https://caulong.example.test";
const SECRET = "smoke-test-session-secret-0123456789";
const ADMIN = "admin@example.test";
const dataDir = mkdtempSync(path.join(tmpdir(), "badminton-pay-"));

let server;
function start() {
  server = spawn("node", ["server-build/server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      PUBLIC_URL,
      STATIC_DIR: `./${staticDir}`,
      DATABASE_PATH: path.join(dataDir, "app.db"),
      SESSION_SECRET: SECRET,
      ADMIN_EMAILS: ` Admin@Example.Test , second@example.test`,
      GOOGLE_CLIENT_ID: "smoke-client-id",
      GOOGLE_CLIENT_SECRET: "smoke-client-secret",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
async function ready() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}
const stop = () => new Promise((resolve) => (server.once("exit", resolve), server.kill("SIGTERM")));

const b64 = (value) => Buffer.from(value).toString("base64url");
function cookie(email) {
  const payload = b64(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `session=${payload}.${b64(createHmac("sha256", SECRET).update(payload).digest())}`;
}
async function call(method, route, body, as, headers = {}) {
  const res = await fetch(BASE + route, {
    method,
    redirect: "manual",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(as ? { Cookie: cookie(as) } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
}

try {
  if (!existsSync(path.join(root, staticDir, "index.html"))) throw new Error("client build missing: run npm run build first");
  start();
  await ready();

  // Static files and the single-page fallback
  const index = await call("GET", "/");
  check("serves the client", index.status === 200 && index.text.includes('<div id="root">'), index.status);
  check("serves a static file", (await call("GET", "/robots.txt")).text.includes("Disallow"));
  const deep = await call("GET", "/some/unknown/page");
  check("unknown paths fall back to the client", deep.status === 200 && deep.text.includes('<div id="root">'), deep.status);
  check("unknown API paths stay JSON 404", (await call("GET", "/api/nope")).status === 404);

  // Sign-in plumbing uses the public address, not the one the request arrived on
  const login = await call("GET", "/api/auth/login");
  const target = new URL(login.headers.get("location") ?? "http://x");
  check("sign-in redirects to Google with the public callback address", login.status === 302 && target.searchParams.get("redirect_uri") === `${PUBLIC_URL}/api/auth/callback`, target.searchParams.get("redirect_uri"));
  check("state cookie is Secure because the public address is https", /Secure/i.test(login.headers.get("set-cookie") ?? ""), login.headers.get("set-cookie"));

  // Writes through SQLite
  check("visitor cannot write", (await call("POST", "/api/members", { name: "Ghost" })).status === 401);
  const ids = [];
  for (const [name, email] of [["An", "an@example.test"], ["Bình", "binh@example.test"], ["Cường", "cuong@example.test"]]) {
    const res = await call("POST", "/api/members", { name, email }, ADMIN);
    ids.push(res.json?.id);
  }
  check("admin (matched case-insensitively from ADMIN_EMAILS) adds members", ids.every((id) => Number.isInteger(id)), ids);
  check("second admin in the list works too", (await call("POST", "/api/members", { name: "Dũng" }, "second@example.test")).status === 201);
  check("one email cannot be linked twice", (await call("POST", "/api/members", { name: "X", email: "an@example.test" }, ADMIN)).status === 400);

  const session = {
    date: "2026-11-27",
    payerId: ids[0],
    courtAmount: 250_000,
    drinkAmount: 70_000,
    attendees: ids.map((memberId, i) => ({ memberId, drank: i < 2 })),
  };
  const created = await call("POST", "/api/sessions", session, "an@example.test");
  check("member saves a session they paid for (one transaction: session + attendees)", created.status === 201, created);
  let state = (await call("GET", "/api/state", undefined, ADMIN)).json;
  check("shares are computed and stored", JSON.stringify(state.sessions[0]?.attendees.map((a) => a.share)) === JSON.stringify([119_000, 119_000, 84_000]), state.sessions[0]?.attendees);
  check("admin sees emails, with the right types back from SQLite", state.members[0].email === "an@example.test" && state.members[0].active === true && state.me.admin === true);
  check("visitor state has no emails", (await call("GET", "/api/state")).json.members.every((m) => !("email" in m)));

  const id = created.json.id;
  check("another member cannot edit it", (await call("PUT", `/api/sessions/${id}`, session, "binh@example.test")).status === 403);
  const edited = await call("PUT", `/api/sessions/${id}`, { ...session, attendees: session.attendees.slice(0, 2) }, "an@example.test");
  state = (await call("GET", "/api/state")).json;
  check("payer edits: attendees are replaced atomically", edited.status === 200 && state.sessions[0].attendees.length === 2, state.sessions[0]?.attendees);
  const broken = await call("PUT", `/api/sessions/${id}`, { ...session, attendees: [{ memberId: 999_999, drank: false }] }, "an@example.test");
  check("a session naming an unknown member is refused and nothing changes", broken.status === 400 && (await call("GET", "/api/state")).json.sessions[0].attendees.length === 2, broken);

  const transfer = { date: "2026-11-27", fromId: ids[1], toId: ids[0], amount: 50_000 };
  check("debtor cannot mark their own payment", (await call("POST", "/api/transfers", transfer, "binh@example.test")).status === 403);
  const received = await call("POST", "/api/transfers", transfer, "an@example.test", { Origin: PUBLIC_URL });
  check("receiver confirms, sent with the public address as Origin", received.status === 201, received);
  check("a write from another origin is refused", (await call("POST", "/api/transfers", transfer, "an@example.test", { Origin: BASE })).status === 403);
  check("undo by the receiver", (await call("DELETE", `/api/transfers/${received.json.id}`, undefined, "an@example.test")).status === 204);

  check("payer deletes the session", (await call("DELETE", `/api/sessions/${id}`, undefined, "an@example.test")).status === 204);
  state = (await call("GET", "/api/state")).json;
  check("its attendee rows went with it (foreign keys on)", state.sessions.length === 0);
  // Attendees of a deleted session would block re-adding the same pair if they had been left behind.
  const again = await call("POST", "/api/sessions", session, "an@example.test");
  check("a new session can be saved afterwards", again.status === 201, again);

  // Restart on the same file: data is still there and migrations do not run twice
  await stop();
  start();
  await ready();
  state = (await call("GET", "/api/state")).json;
  check("data survives a restart", state.members.length === 4 && state.sessions.length === 1, { members: state.members.length, sessions: state.sessions.length });
} catch (error) {
  check("smoke test completed", false, String(error));
} finally {
  if (server && server.exitCode === null) await stop();
  rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
