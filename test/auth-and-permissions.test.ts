import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSession } from "../src/worker/auth-session";
import { ADMIN, call, clearTables, getState, sessionBody } from "./support/api-client";

// Three members who can sign in. ids = [an, binh, cuong].
const AN = "an@example.test";
const BINH = "binh@example.test";
const CUONG = "cuong@example.test";
let ids: number[] = [];

beforeEach(async () => {
  await clearTables();
  ids = [];
  for (const [name, email] of [["An", AN], ["Bình", BINH], ["Cường", CUONG]]) {
    const res = await call("POST", "/api/members", { name, email });
    expect(res.status).toBe(201);
    ids.push(((await res.json()) as { id: number }).id);
  }
});
afterEach(() => vi.restoreAllMocks());

/** Raw request with an arbitrary Cookie header, for forged-session cases. */
const withCookie = (cookie: string, method = "POST", path = "/api/members") =>
  exports.default.fetch(
    new Request(`http://app.test${path}`, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ name: "Ghost" }),
    }),
  );

describe("session cookie", () => {
  it("rejects a tampered, wrongly signed, expired or malformed cookie", async () => {
    const good = await signSession(ADMIN, env.SESSION_SECRET);
    const [payload, signature] = good.split(".");
    const otherPayload = (await signSession("evil@example.test", env.SESSION_SECRET)).split(".")[0];
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    const forged = [
      `${otherPayload}.${signature}`, // payload swapped under a real signature
      await signSession(ADMIN, "another-secret-another-secret-12345"),
      await signSession(ADMIN, env.SESSION_SECRET, twoYearsAgo),
      payload,
      "not-a-session",
      "%%%.%%%",
    ];
    for (const token of forged) {
      expect((await withCookie(`session=${token}`)).status).toBe(401);
    }
    expect((await withCookie(`session=${good}`)).status).toBe(201);
  });

  it("tells the client who is signed in, and hides emails from everyone but admins", async () => {
    const visitor = await getState();
    expect(visitor.me).toBeNull();
    expect(visitor.members.every((m) => m.email === undefined)).toBe(true);

    const asBinh = (await (await call("GET", "/api/state", undefined, BINH)).json()) as typeof visitor;
    expect(asBinh.me).toEqual({ email: BINH, memberId: ids[1], admin: false });
    expect(asBinh.members.every((m) => m.email === undefined)).toBe(true);

    const asAdmin = (await (await call("GET", "/api/state", undefined, ADMIN)).json()) as typeof visitor;
    expect(asAdmin.me).toEqual({ email: ADMIN, memberId: null, admin: true });
    expect(asAdmin.members.map((m) => m.email)).toEqual([AN, BINH, CUONG]);
  });

  it("gives an account that is not linked to any member no write access", async () => {
    const stranger = "stranger@example.test";
    expect((await call("POST", "/api/sessions", sessionBody(ids), stranger)).status).toBe(403);
    expect((await call("POST", "/api/transfers", { date: "2026-11-27", fromId: ids[0], toId: ids[1], amount: 1000 }, stranger)).status).toBe(403);
    expect((await call("POST", "/api/members", { name: "Ghost" }, stranger)).status).toBe(403);
  });
});

describe("requests from another origin", () => {
  // A page on a sibling domain can make the browser send the cookie along with a form post.
  const post = async (origin: string | null) =>
    exports.default.fetch(
      new Request("http://app.test/api/transfers", {
        method: "POST",
        headers: { Cookie: `session=${await signSession(AN, env.SESSION_SECRET)}`, "Content-Type": "text/plain", ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({ date: "2026-11-27", fromId: ids[1], toId: ids[0], amount: 500_000 }),
      }),
    );

  it("refuses a write whose Origin is not this app, and accepts the app's own", async () => {
    expect((await post("https://evil.example")).status).toBe(403);
    expect((await post("http://other.app.test")).status).toBe(403);
    expect((await getState()).transfers).toHaveLength(0);
    expect((await post("http://app.test")).status).toBe(201);
  });
});

describe("members: admin only", () => {
  it("lets only an admin add or edit members", async () => {
    expect((await call("POST", "/api/members", { name: "Ghost" }, AN)).status).toBe(403);
    // A member cannot even edit their own row (which would let them take another email).
    expect((await call("PUT", `/api/members/${ids[0]}`, { name: "An", email: BINH }, AN)).status).toBe(403);
    expect((await call("PUT", `/api/members/${ids[0]}`, { name: "An 2", email: AN }, ADMIN)).status).toBe(200);
  });

  it("stores emails lowercase and refuses one email for two members", async () => {
    expect((await call("POST", "/api/members", { name: "Dũng", email: "  Dung@Example.Test " })).status).toBe(201);
    expect((await call("POST", "/api/members", { name: "Dũng 2", email: "dung@example.test" })).status).toBe(400);
    expect((await call("PUT", `/api/members/${ids[0]}`, { name: "An", email: BINH })).status).toBe(400);
    expect((await call("POST", "/api/members", { name: "Bad", email: "not-an-email" })).status).toBe(400);
    // Saving a member with their own email again is fine; clearing it is too.
    expect((await call("PUT", `/api/members/${ids[0]}`, { name: "An", email: AN })).status).toBe(200);
    expect((await call("PUT", `/api/members/${ids[0]}`, { name: "An", email: "" })).status).toBe(200);
    expect((await call("POST", "/api/sessions", sessionBody(ids), AN)).status).toBe(403);
  });
});

describe("sessions: only the payer", () => {
  it("lets a member enter a session they paid for, not one paid by someone else", async () => {
    expect((await call("POST", "/api/sessions", sessionBody(ids, { payerId: ids[0] }), AN)).status).toBe(201);
    expect((await call("POST", "/api/sessions", sessionBody(ids, { payerId: ids[1] }), AN)).status).toBe(403);
    expect((await getState()).sessions).toHaveLength(1);
  });

  it("lets only the payer or an admin change or delete a session, and never hand it to another payer", async () => {
    const created = await call("POST", "/api/sessions", sessionBody(ids, { payerId: ids[0] }), AN);
    const { id } = (await created.json()) as { id: string };

    expect((await call("PUT", `/api/sessions/${id}`, sessionBody(ids, { payerId: ids[0], courtAmount: 1000 }), BINH)).status).toBe(403);
    // Bình cannot take the session over by naming himself payer.
    expect((await call("PUT", `/api/sessions/${id}`, sessionBody(ids, { payerId: ids[1] }), BINH)).status).toBe(403);
    expect((await call("DELETE", `/api/sessions/${id}`, undefined, BINH)).status).toBe(403);
    // An cannot pass the session to Bình either.
    expect((await call("PUT", `/api/sessions/${id}`, sessionBody(ids, { payerId: ids[1] }), AN)).status).toBe(403);
    expect((await getState()).sessions[0]).toMatchObject({ payerId: ids[0], courtAmount: 250_000 });

    expect((await call("PUT", `/api/sessions/${id}`, sessionBody(ids, { payerId: ids[0], courtAmount: 300_000 }), AN)).status).toBe(200);
    expect((await call("PUT", `/api/sessions/${id}`, sessionBody(ids, { payerId: ids[1] }), ADMIN)).status).toBe(200);
    // Now it is Bình's session.
    expect((await call("DELETE", `/api/sessions/${id}`, undefined, AN)).status).toBe(403);
    expect((await call("DELETE", `/api/sessions/${id}`, undefined, BINH)).status).toBe(204);
    expect((await getState()).sessions).toHaveLength(0);
  });
});

describe("transfers: only the receiver", () => {
  const transfer = (fromId: number, toId: number) => ({ date: "2026-11-27", fromId, toId, amount: 50_000 });

  it("refuses a debtor marking their own payment, and anyone else doing it for them", async () => {
    // Bình owes An: neither Bình (sender) nor Cường (bystander) may record it.
    expect((await call("POST", "/api/transfers", transfer(ids[1], ids[0]), BINH)).status).toBe(403);
    expect((await call("POST", "/api/transfers", transfer(ids[1], ids[0]), CUONG)).status).toBe(403);
    expect((await getState()).transfers).toHaveLength(0);

    expect((await call("POST", "/api/transfers", transfer(ids[1], ids[0]), AN)).status).toBe(201);
    expect((await call("POST", "/api/transfers", transfer(ids[2], ids[0]), ADMIN)).status).toBe(201);
    expect((await getState()).transfers).toHaveLength(2);
  });

  it("lets only the receiver or an admin undo a transfer", async () => {
    const created = await call("POST", "/api/transfers", transfer(ids[1], ids[0]), AN);
    const { id } = (await created.json()) as { id: number };
    expect((await call("DELETE", `/api/transfers/${id}`, undefined, BINH)).status).toBe(403);
    expect((await call("DELETE", `/api/transfers/${id}`, undefined, AN)).status).toBe(204);
    expect((await call("DELETE", `/api/transfers/${id}`, undefined, AN)).status).toBe(404);
  });
});

describe("Google sign-in flow", () => {
  const idToken = (claims: Record<string, unknown>) => `x.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.x`;
  // Each stubbed response is created inside the Worker's own call: a Response made by the test cannot be read from another request.
  const goodClaims = { iss: "https://accounts.google.com", aud: "test-client-id", email: "Binh@Example.Test", email_verified: true };

  /** Starts a login and returns the state value and its cookie. */
  async function startLogin() {
    const res = await call("GET", "/api/auth/login", undefined, null);
    expect(res.status).toBe(302);
    const target = new URL(res.headers.get("location")!);
    const state = target.searchParams.get("state")!;
    return { target, state, cookie: `oauth_state=${state}` };
  }
  const callback = (query: string, cookie: string) =>
    exports.default.fetch(new Request(`http://app.test/api/auth/callback?${query}`, { headers: { Cookie: cookie }, redirect: "manual" }));
  const sessionFrom = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("session="));

  it("sends the visitor to Google with this app's callback address", async () => {
    const { target, state } = await startLogin();
    expect(target.origin + target.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(target.searchParams.get("client_id")).toBe("test-client-id");
    expect(target.searchParams.get("redirect_uri")).toBe("http://app.test/api/auth/callback");
    expect(target.searchParams.get("scope")).toBe("openid email");
    expect(state.length).toBeGreaterThan(20);
  });

  it("signs the member in after Google confirms the email", async () => {
    const tokenCall = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ id_token: idToken(goodClaims) }));
    const { state, cookie } = await startLogin();
    const res = await callback(`code=abc&state=${state}`, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(tokenCall).toHaveBeenCalledOnce();

    const session = sessionFrom(res)!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    // The cookie works as Bình (email lowercased) on a later request.
    const state2 = await exports.default.fetch(new Request("http://app.test/api/state", { headers: { Cookie: session.split(";")[0] } }));
    expect(((await state2.json()) as { me: unknown }).me).toEqual({ email: BINH, memberId: ids[1], admin: false });
  });

  it("refuses a callback whose state does not match, without calling Google", async () => {
    const tokenCall = vi.spyOn(globalThis, "fetch");
    const { state, cookie } = await startLogin();
    for (const [query, sent] of [
      [`code=abc&state=other`, cookie],
      [`code=abc&state=${state}`, ""],
      [`state=${state}`, cookie],
      [`error=access_denied&state=${state}`, cookie],
    ]) {
      const res = await callback(query, sent);
      expect(res.headers.get("location")).toBe("/?login=failed");
      expect(sessionFrom(res)).toBeUndefined();
    }
    expect(tokenCall).not.toHaveBeenCalled();
  });

  it("refuses tokens for another app, another issuer, or an unverified email", async () => {
    const bad = [
      { ...goodClaims, aud: "someone-elses-client" },
      { ...goodClaims, iss: "https://evil.example" },
      { ...goodClaims, email_verified: false },
      { ...goodClaims, email: undefined },
    ];
    for (const claims of bad) {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ id_token: idToken(claims) }));
      const { state, cookie } = await startLogin();
      const res = await callback(`code=abc&state=${state}`, cookie);
      expect(res.headers.get("location")).toBe("/?login=failed");
      expect(sessionFrom(res)).toBeUndefined();
      vi.restoreAllMocks();
    }
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("nope", { status: 400 }));
    const { state, cookie } = await startLogin();
    expect((await callback(`code=abc&state=${state}`, cookie)).headers.get("location")).toBe("/?login=failed");
  });

  it("returns to the app when Google cannot be reached or answers with something else", async () => {
    for (const reply of [
      async () => {
        throw new Error("network down");
      },
      async () => new Response("<html>oops</html>"),
      async () => Response.json({}),
    ]) {
      vi.spyOn(globalThis, "fetch").mockImplementation(reply);
      const { state, cookie } = await startLogin();
      const res = await callback(`code=abc&state=${state}`, cookie);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/?login=failed");
      vi.restoreAllMocks();
    }
  });

  it("signs out by clearing the cookie", async () => {
    const res = await call("POST", "/api/auth/logout", undefined, AN);
    expect(res.status).toBe(204);
    expect(sessionFrom(res)).toMatch(/Max-Age=0/i);
  });
});
