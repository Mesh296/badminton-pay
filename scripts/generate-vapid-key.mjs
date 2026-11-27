// Prints a new VAPID key pair (P-256, as one JWK line) for push notifications.
// Store it as the VAPID_KEY secret: `node scripts/generate-vapid-key.mjs | npx wrangler secret put VAPID_KEY`
// on Cloudflare, or as VAPID_KEY=... in .env on a server. Keep it secret.
// A new key makes every phone turn notifications on again.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
process.stdout.write(JSON.stringify({ kty, crv, x, y, d }));
