// Web Push with nothing but WebCrypto, so it runs the same on Workers and on
// Node: the message is encrypted for the one device (RFC 8291, aes128gcm) and
// the request signed with the app's VAPID key (RFC 8292). The push service
// (Apple, Google, Mozilla) only ever sees ciphertext.

import { fromBase64Url, toBase64Url } from "../shared/base64url";

export interface PushTarget {
  endpoint: string;
  /** The device's public key, base64url (65 bytes, uncompressed P-256) */
  p256dh: string;
  /** The device's auth secret, base64url (16 bytes) */
  auth: string;
}

const text = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function hmac(key: Uint8Array<ArrayBuffer>, ...data: Uint8Array[]): Promise<Uint8Array<ArrayBuffer>> {
  const hmacKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, concat(...data)));
}

const ONE = new Uint8Array([1]);
/** Records are at most this long; a notification is far shorter, so it is one record. */
const RECORD_SIZE = 4096;

/**
 * The request body for one device: salt, record size and our one-off public
 * key, then the payload encrypted with a key only that device can derive.
 * `salt` and `local` are fixed only by tests.
 */
export async function encryptForDevice(
  payload: Uint8Array,
  target: Pick<PushTarget, "p256dh" | "auth">,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)),
  local?: CryptoKeyPair,
): Promise<Uint8Array<ArrayBuffer>> {
  const ecdh = { name: "ECDH", namedCurve: "P-256" };
  const keys = local ?? ((await crypto.subtle.generateKey(ecdh, true, ["deriveBits"])) as CryptoKeyPair);
  const ourPublic = new Uint8Array((await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer);
  const theirPublic = fromBase64Url(target.p256dh);
  const theirKey = await crypto.subtle.importKey("raw", theirPublic, ecdh, false, []);
  // Workers' types spell this member "$public"; the runtime takes "public" as everywhere else.
  const derive = { name: "ECDH", public: theirKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(derive, keys.privateKey, 256));

  // HKDF (SHA-256) done by hand: every output here is one block or less.
  const authKey = await hmac(fromBase64Url(target.auth), shared);
  const ikm = await hmac(authKey, text.encode("WebPush: info\0"), theirPublic, ourPublic, ONE);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, text.encode("Content-Encoding: aes128gcm\0"), ONE)).slice(0, 16);
  const nonce = (await hmac(prk, text.encode("Content-Encoding: nonce\0"), ONE)).slice(0, 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 marks the last (and only) record; no padding.
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(payload, new Uint8Array([2])));

  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = ourPublic.length;
  return concat(header, ourPublic, new Uint8Array(sealed));
}

/** The app's VAPID key pair as a JWK with its private part ("d"), as kept in the VAPID_KEY secret. */
export const vapidPublicKey = (jwk: JsonWebKey) =>
  toBase64Url(concat(new Uint8Array([4]), fromBase64Url(jwk.x!), fromBase64Url(jwk.y!)));

/** Authorization header proving the app sent this: a short-lived ES256 token for the push service. */
export async function vapidAuthorization(endpoint: string, jwk: JsonWebKey, subject: string): Promise<string> {
  const { kty, crv, x, y, d } = jwk;
  const key = await crypto.subtle.importKey("jwk", { kty, crv, x, y, d }, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const part = (value: object) => toBase64Url(text.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })}`;
  // WebCrypto signs ECDSA as raw r||s, which is exactly what JWS ES256 wants.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, text.encode(unsigned));
  return `vapid t=${unsigned}.${toBase64Url(new Uint8Array(signature))}, k=${vapidPublicKey(jwk)}`;
}

/**
 * Sends one message to one device. Returns the push service's HTTP status
 * (404/410: the device is gone). `ttlSeconds`: how long the push service keeps
 * it for a phone that is offline.
 */
export async function sendPush(
  target: PushTarget,
  message: object,
  jwk: JsonWebKey,
  subject: string,
  ttlSeconds = 86_400,
): Promise<number> {
  const body = await encryptForDevice(text.encode(JSON.stringify(message)), target);
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, jwk, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      // Sent at once rather than batched.
      TTL: String(ttlSeconds),
      Urgency: "high",
    },
    body,
  });
  return res.status;
}
