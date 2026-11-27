import type { AppState } from "../shared/types";

// Thin fetch layer. Who is signed in travels in a cookie set by the Worker
// after Google sign-in, so requests carry no credentials of their own.

/** Starts Google sign-in; a plain link, because the flow is a chain of redirects. */
export const LOGIN_URL = "/api/auth/login";

export async function fetchState(): Promise<AppState> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`state ${res.status}`);
  return res.json();
}

export function sendWrite(method: string, path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Server error message if the response carries one, otherwise a generic line. */
export async function errorMessage(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Có lỗi. Thử lại.";
}
