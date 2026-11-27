import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromBase64Url, toBase64Url } from "../src/shared/base64url";
import { nextReminderAt, reminderMessage, sendDailyReminders } from "../src/worker/daily-reminder";
import { call, clearTables } from "./support/api-client";

// Phones that ring when someone reports paying their member.
const PAYER = "payer@example.test";
const RECEIVER = "receiver@example.test";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";

const ecdh = { name: "ECDH", namedCurve: "P-256" };
const text = new TextEncoder();

/** A browser's side of a subscription: its key pair and auth secret. */
async function device(endpoint = ENDPOINT) {
  const keys = (await crypto.subtle.generateKey(ecdh, true, ["deriveBits"])) as CryptoKeyPair;
  const publicKey = new Uint8Array((await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { keys, publicKey, auth, json: { endpoint, keys: { p256dh: toBase64Url(publicKey), auth: toBase64Url(auth) } } };
}

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
};
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
};

/** What the browser does with a push body (RFC 8291), using the platform's own HKDF. */
async function decrypt(body: Uint8Array, d: Awaited<ReturnType<typeof device>>) {
  const salt = body.slice(0, 16);
  const keyLength = body[20];
  const serverPublic = body.slice(21, 21 + keyLength);
  const serverKey = await crypto.subtle.importKey("raw", serverPublic, ecdh, false, []);
  const derive = { name: "ECDH", public: serverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(derive, d.keys.privateKey, 256));
  const ikm = await hkdf(d.auth, shared, join(text.encode("WebPush: info\0"), d.publicKey, serverPublic), 32);
  const cek = await hkdf(salt, ikm, text.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, text.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, body.slice(21 + keyLength)));
  expect(plain.at(-1)).toBe(2); // last-record delimiter
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1))) as { title: string; body: string; url: string };
}

let payer = 0;
let receiver = 0;
beforeEach(async () => {
  await clearTables();
  const add = async (name: string, email: string) =>
    ((await (await call("POST", "/api/members", { name, email })).json()) as { id: number }).id;
  receiver = await add("Minh", RECEIVER);
  payer = await add("Y tá", PAYER);
  // Minh fronted a session the nurse played in: she owes him, so she may report paying.
  const session = { date: "2026-11-27", payerId: receiver, courtAmount: 90_000, drinkAmount: 0, attendees: [{ memberId: payer, drank: false }] };
  expect((await call("POST", "/api/sessions", session, RECEIVER)).status).toBe(201);
});
afterEach(() => vi.restoreAllMocks());

const devices = async () =>
  (await env.DB.prepare("SELECT endpoint, member_id FROM push_subscriptions ORDER BY rowid").all<{ endpoint: string; member_id: number }>())
    .results;

describe("turning notifications on and off", () => {
  it("gives the browser the public key to subscribe with", async () => {
    const res = await call("GET", "/api/push/key", undefined, null);
    expect(fromBase64Url(((await res.json()) as { key: string }).key)).toHaveLength(65);
  });

  it("saves a device for the signed-in member, and moves it when someone else signs in on it", async () => {
    const d = await device();
    expect((await call("POST", "/api/push", d.json, RECEIVER)).status).toBe(204);
    expect(await devices()).toEqual([{ endpoint: ENDPOINT, member_id: receiver }]);
    expect((await call("POST", "/api/push", d.json, PAYER)).status).toBe(204);
    expect(await devices()).toEqual([{ endpoint: ENDPOINT, member_id: payer }]);
  });

  it("accepts only real push services and well-formed keys, from members", async () => {
    const d = await device();
    const bad = [
      { ...d.json, endpoint: "https://evil.example/push" },
      { ...d.json, endpoint: "http://fcm.googleapis.com/fcm/send/x" },
      { ...d.json, endpoint: "https://fcm.googleapis.com.evil.example/x" },
      { ...d.json, endpoint: "https://localhost/x" },
      { ...d.json, keys: { ...d.json.keys, p256dh: d.json.keys.auth } },
      { ...d.json, keys: { ...d.json.keys, auth: "not base64!" } },
      { endpoint: ENDPOINT },
    ];
    for (const body of bad) expect((await call("POST", "/api/push", body, RECEIVER)).status).toBe(400);
    expect((await call("POST", "/api/push", { ...d.json, endpoint: "https://web.push.apple.com/abc" }, RECEIVER)).status).toBe(204);
    expect((await call("POST", "/api/push", d.json, "stranger@example.test")).status).toBe(403);
    expect((await call("POST", "/api/push", d.json, null)).status).toBe(401);
    expect(await devices()).toHaveLength(1);
  });

  it("keeps the newest 5 devices per member", async () => {
    for (let i = 1; i <= 6; i++) await call("POST", "/api/push", (await device(`${ENDPOINT}-${i}`)).json, RECEIVER);
    expect((await devices()).map((r) => r.endpoint)).toEqual([2, 3, 4, 5, 6].map((i) => `${ENDPOINT}-${i}`));
  });

  it("lets only that member take a device off", async () => {
    await call("POST", "/api/push", (await device()).json, RECEIVER);
    expect((await call("DELETE", "/api/push", { endpoint: ENDPOINT }, PAYER)).status).toBe(204);
    expect(await devices()).toHaveLength(1);
    expect((await call("DELETE", "/api/push", { endpoint: ENDPOINT }, RECEIVER)).status).toBe(204);
    expect(await devices()).toHaveLength(0);
  });
});

describe("ringing the receiver", () => {
  it("sends the receiver's devices an encrypted, signed message when a payment is reported", async () => {
    const d = await device();
    await call("POST", "/api/push", d.json, RECEIVER);
    const sent = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));

    const res = await call("POST", "/api/claims", { date: "2026-11-27", fromId: payer, toId: receiver, amount: 45_000 }, PAYER);
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));

    const [url, init] = sent.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("86400");

    // The body opens only with the device's keys, and says who paid how much.
    expect(await decrypt(init.body as Uint8Array, d)).toEqual({
      title: "Y tá báo đã chuyển 45.000đ",
      body: "Mở app để xác nhận đã nhận",
      url: "/",
    });

    // The token is signed by the key the browser subscribed with, for that push service.
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(headers.Authorization)!;
    const [head, claims, signature] = token.split(".");
    const publicKey = await crypto.subtle.importKey("raw", fromBase64Url(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromBase64Url(signature),
      text.encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
    const { key } = (await (await call("GET", "/api/push/key", undefined, null)).json()) as { key: string };
    expect(k).toBe(key);
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims)))).toMatchObject({ aud: "https://fcm.googleapis.com" });
  });

  it("forgets a device the push service says is gone", async () => {
    await call("POST", "/api/push", (await device()).json, RECEIVER);
    const sent = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 410 }));
    await call("POST", "/api/claims", { date: "2026-11-27", fromId: payer, toId: receiver, amount: 45_000 }, PAYER);
    await vi.waitFor(() => expect(sent).toHaveBeenCalled());
    await vi.waitFor(async () => expect(await devices()).toEqual([]));
  });

  it("does not ring the payer, and a report still saves when nobody has notifications on", async () => {
    await call("POST", "/api/push", (await device()).json, PAYER);
    const sent = vi.spyOn(globalThis, "fetch");
    expect((await call("POST", "/api/claims", { date: "2026-11-27", fromId: payer, toId: receiver, amount: 1000 }, PAYER)).status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).not.toHaveBeenCalled();
  });
});

describe("the evening reminder", () => {
  it("names whom someone owes, one person or several", () => {
    expect(reminderMessage([{ name: "Minh", amount: 45_000 }])).toEqual({
      title: "Còn nợ Minh 45.000đ",
      body: "Chuyển xong thì vào app bấm Đã chuyển để Minh xác nhận.",
      url: "/",
      tag: "reminder",
    });
    expect(reminderMessage([{ name: "Minh", amount: 98_000 }, { name: "Hân", amount: 49_000 }])).toMatchObject({
      title: "Còn nợ 147.000đ tiền cầu lông",
      body: "Minh 98.000đ, Hân 49.000đ. Chuyển xong thì vào app bấm Đã chuyển.",
    });
  });

  it("rings whoever owes, with notifications on, and nobody who is owed", async () => {
    const payerDevice = await device(`${ENDPOINT}-payer`);
    await call("POST", "/api/push", payerDevice.json, PAYER);
    await call("POST", "/api/push", (await device(`${ENDPOINT}-receiver`)).json, RECEIVER);
    const sent = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));

    expect(await sendDailyReminders(env)).toBe(1);
    expect(sent).toHaveBeenCalledTimes(1);
    const [url, init] = sent.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENDPOINT}-payer`);
    // The nurse played alone in Minh's 90.000đ session.
    expect(await decrypt(init.body as Uint8Array, payerDevice)).toMatchObject({ title: "Còn nợ Minh 90.000đ" });
  });

  it("does not remind about a payment already reported and waiting", async () => {
    await call("POST", "/api/push", (await device()).json, PAYER);
    await call("POST", "/api/claims", { date: "2026-11-27", fromId: payer, toId: receiver, amount: 90_000 }, PAYER);
    const sent = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    expect(await sendDailyReminders(env)).toBe(0);
    expect(sent.mock.calls.filter(([u]) => String(u).startsWith(ENDPOINT))).toHaveLength(0);
  });
});

describe("when the evening reminder runs", () => {
  const at = (iso: string) => Date.parse(iso);
  it("is 19:00 in Vietnam (12:00 UTC), today if still ahead, else tomorrow", () => {
    expect(nextReminderAt(at("2026-11-27T05:00:00Z"))).toBe(at("2026-11-27T12:00:00Z"));
    expect(nextReminderAt(at("2026-11-27T12:00:00Z"))).toBe(at("2026-11-28T12:00:00Z"));
    expect(nextReminderAt(at("2026-11-27T23:59:00Z"))).toBe(at("2026-11-28T12:00:00Z"));
  });

  it("counts from the slot that just ran, so a timer firing early never sends twice", () => {
    const slot = at("2026-11-27T12:00:00Z");
    expect(nextReminderAt(slot)).toBe(slot + 24 * 60 * 60 * 1000);
  });
});

describe("devices registered before the app address was kept", () => {
  it("are skipped until a device registers again, which fills the address in for all", async () => {
    const d = await device(`${ENDPOINT}-payer`);
    await call("POST", "/api/push", d.json, PAYER);
    await env.DB.prepare("UPDATE push_subscriptions SET origin = NULL").run();
    const sent = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    expect(await sendDailyReminders(env)).toBe(0);

    await call("POST", "/api/push", (await device(`${ENDPOINT}-receiver`)).json, RECEIVER);
    expect(await sendDailyReminders(env)).toBe(1);
    expect(sent.mock.calls.map(([u]) => String(u))).toEqual([`${ENDPOINT}-payer`]);
  });

  it("counts only members a reminder reached", async () => {
    await call("POST", "/api/push", (await device()).json, PAYER);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    expect(await sendDailyReminders(env)).toBe(0);
  });
});
