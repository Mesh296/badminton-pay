import type { Context } from "hono";
import type { z } from "zod";
import type { AppEnv } from "./index";

/**
 * Parse and validate a JSON body. Returns the parsed data, or a 400 Response
 * carrying the first validation message for the client to show.
 */
export async function readBody<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<z.infer<S> | Response> {
  const raw = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, 400);
  }
  return parsed.data;
}

/**
 * Numeric path parameter, or null when it is not a canonical positive integer.
 * Plain digits without leading zeros: Number() alone would also accept "0x1",
 * "1e1" and "007", giving one record several addresses.
 */
export function intParam(c: Context<AppEnv>, name: string): number | null {
  const raw = c.req.param(name) ?? "";
  return /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}

/**
 * True when every id refers to an existing member. Checked up front so a bad
 * id becomes a clear 400 instead of a foreign-key failure inside a batch.
 */
export async function membersExist(db: D1Database, ids: number[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  const placeholders = unique.map(() => "?").join(",");
  const row = await db
    .prepare(`SELECT count(*) AS n FROM members WHERE id IN (${placeholders})`)
    .bind(...unique)
    .first<{ n: number }>();
  return row?.n === unique.length;
}
