import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";
import type { AppState } from "../../src/shared/types";
import { signSession } from "../../src/worker/auth-session";

/** Admin account configured for tests in vitest.config.ts. */
export const ADMIN = "admin@example.test";

/** Cookie header for a signed-in account, minted with the same code the Worker uses. */
export const sessionCookie = async (email: string) => `session=${await signSession(email, env.SESSION_SECRET)}`;

export async function clearTables() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM transfers"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM members"),
    env.DB.prepare("DELETE FROM join_requests"),
    env.DB.prepare("DELETE FROM activity_log"),
  ]);
}

/**
 * Sends a request through the real Worker, signed in as `as` (an email), or as
 * a visitor when `as` is null. `body` is JSON-encoded unless it is a string,
 * which is sent raw.
 */
export async function call(method: string, path: string, body?: unknown, as: string | null = ADMIN) {
  const headers: Record<string, string> = {};
  if (as !== null) headers.Cookie = await sessionCookie(as);
  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = typeof body === "string" ? body : JSON.stringify(body);
  }
  return exports.default.fetch(new Request(`http://app.test${path}`, { method, headers, body: payload, redirect: "manual" }));
}

export async function addMembers(count: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await call("POST", "/api/members", { name: `Người ${i + 1}` });
    expect(res.status).toBe(201);
    ids.push(((await res.json()) as { id: number }).id);
  }
  return ids;
}

/** Inserts members directly in D1, for bulk setup. */
export async function seedMembers(count: number): Promise<number[]> {
  await env.DB.batch(
    Array.from({ length: count }, (_, i) => env.DB.prepare("INSERT INTO members (name) VALUES (?)").bind(`Seed ${i}`)),
  );
  const rows = await env.DB.prepare("SELECT id FROM members ORDER BY id DESC LIMIT ?").bind(count).all<{ id: number }>();
  return rows.results.map((r) => r.id).reverse();
}

export const getState = async () => (await (await call("GET", "/api/state", undefined, null)).json()) as AppState;

export const sessionBody = (ids: number[], overrides: Record<string, unknown> = {}) => ({
  date: "2026-11-27",
  payerId: ids[0],
  courtAmount: 250_000,
  drinkAmount: 70_000,
  attendees: ids.map((memberId, i) => ({ memberId, drank: i < 3 })),
  ...overrides,
});
