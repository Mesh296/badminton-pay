import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import api from "../worker/index";
import { openDatabase } from "./sqlite-d1-adapter";

// Runs the app on a plain server (Docker on a VPS): the same API as the
// Cloudflare Worker, with data in one SQLite file, plus the built client files.
// Settings come from environment variables; see .env.example.

const port = Number(process.env.PORT ?? 8787);
// The address people open, e.g. https://caulong.example.com. The server sits
// behind a reverse proxy and cannot trust the scheme or Host it receives, yet
// the sign-in redirect, the Secure cookie flag and the same-origin check all
// depend on the real address, so it is fixed here.
const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
// Relative to the working directory, as the static file helper expects.
const staticDir = process.env.STATIC_DIR ?? "./public";

const env = {
  DB: openDatabase(process.env.DATABASE_PATH ?? "./data/app.db", process.env.MIGRATIONS_DIR ?? "./migrations"),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "",
  ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? "",
} as unknown as Env;

const server = new Hono();

// API: hand the request to the shared app, re-addressed to the public URL.
server.all("/api/*", async (c) => {
  const url = new URL(c.req.url);
  const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD";
  const request = new Request(new URL(url.pathname + url.search, publicUrl), {
    method: c.req.method,
    headers: c.req.raw.headers,
    // Bodies here are small JSON documents, so buffering them is fine.
    body: hasBody ? await c.req.raw.arrayBuffer() : undefined,
  });
  return api.fetch(request, env);
});

// Everything else is the client: a built file if one matches, otherwise
// index.html so the single-page app can take over.
server.use("*", serveStatic({ root: staticDir }));
server.get("*", serveStatic({ root: staticDir, path: "index.html" }));

serve({ fetch: server.fetch, port }, () => console.log(`badminton-pay listening on :${port} as ${publicUrl}`));

// Node runs as PID 1 in the container and would otherwise ignore these.
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => process.exit(0));
