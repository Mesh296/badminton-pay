---
phase: 2
title: Money Logic and API
status: completed
effort: 3h
priority: P1
dependencies:
  - 1
---

# Phase 2: Money Logic and API

## Overview

Pure money functions (split, balances, settlement) with tests, then the Hono API that stores sessions, members, and transfers behind a server-side PIN check.

## Requirements

- Functional: split a session; derive balances; suggest transfers; CRUD for members, sessions, transfers; public read of all state.
- Non-functional: integer VND only; writes are atomic; every write validated and PIN-checked on the server; PIN-bearing routes rate-limited.

## Architecture

### Money logic (`src/shared/money.ts`)

```ts
const ROUND = 1000;
// Single division keeps exact results exact: 240000 / (6 * 1000) === 40
const ceilShare = (amount: number, count: number) =>
  Math.ceil(amount / (count * ROUND)) * ROUND;

splitSession({ courtAmount, drinkAmount, attendees: [{ memberId, drank }] })
  // -> Map<memberId, share>
  // share = ceilShare(court, attendees) + (drank ? ceilShare(drink, drinkers) : 0)
  // throws if no attendees, or drinkAmount > 0 with no drinkers

computeBalances(sessions, transfers)
  // -> Map<memberId, balance>
  // + sum of all shares of sessions the member paid for
  // - the member's own shares
  // + transfers sent, - transfers received

suggestTransfers(balances)
  // -> [{ fromId, toId, amount }]
  // repeatedly match the largest debtor with the largest creditor
```

Worked example (also a test): court 250,000 / 6 people, drinks 70,000 / 3 drinkers → court share 42,000, drink share 24,000; drinkers owe 66,000, others 42,000; payer credited 324,000.

### API (`src/worker/`)

| Method | Path | PIN | Purpose |
|---|---|---|---|
| GET | `/api/state` | no | members, sessions with attendees, transfers |
| POST | `/api/pin` | checks it | 204 if PIN correct, else 401 |
| POST | `/api/members` | yes | add member |
| PUT | `/api/members/:id` | yes | edit name, bank info, active flag |
| POST | `/api/sessions` | yes | create session, server computes shares |
| PUT | `/api/sessions/:id` | yes | replace session and its attendees |
| DELETE | `/api/sessions/:id` | yes | delete session (attendees cascade) |
| POST | `/api/transfers` | yes | record a transfer |
| DELETE | `/api/transfers/:id` | yes | undo a transfer |

- No member delete: set `active = 0` so history and balances stay intact.
- Session create: `DB.batch([insert session, insert attendee × n])`. Update: `DB.batch([update session, delete attendees, insert attendee × n])`.
- The server ignores any share sent by the client and recomputes with `splitSession`.

### PIN and rate limit (`src/worker/pin-auth.ts`)

- PIN read from `env.EDIT_PIN`, sent by the client in header `X-Edit-Pin`.
- Compare SHA-256 digests of both values with `crypto.subtle.timingSafeEqual`.
- Fail closed: if `EDIT_PIN` is missing or shorter than 6 chars, writes return 503.
- Rate limit with the Workers Rate Limiting binding, keyed by `cf-connecting-ip`, 20 requests per 60 s (10 would block adding a dozen members in one go), applied to `/api/pin` and every write route; over the limit returns 429. A WAF rate-limit rule is not an option because the app runs on `workers.dev` without a custom domain. Confirm the config shape first: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### Validation (`src/worker/validation.ts`, zod)

- Amounts: integers, 0 to 100,000,000. Transfer amount > 0.
- Date matches `YYYY-MM-DD`.
- Name trimmed, 1-40 chars. Account number up to 20 alphanumerics. `bank_code` must be in `src/shared/banks.ts`.
- Attendees: at least 1, unique, all existing member ids; payer exists.
- `drink_amount > 0` requires at least one drinker; drinkers must be attendees.
- Transfer `from_id` ≠ `to_id`, both exist.
- Invalid input returns 400 with a short Vietnamese message.

## Related Code Files

- Create: `src/shared/money.ts`, `src/shared/types.ts`, `src/shared/banks.ts`
- Create: `src/worker/pin-auth.ts`, `src/worker/validation.ts`
- Create: `src/worker/routes-members.ts`, `src/worker/routes-sessions.ts`, `src/worker/routes-transfers.ts`
- Modify: `src/worker/index.ts` (mount routes, `/api/state`, `/api/pin`)
- Modify: `wrangler.jsonc` (rate-limit binding)
- Create: `test/money.test.ts`, `test/api.test.ts`, `vitest.config.ts`

## Implementation Steps

1. Write `test/money.test.ts` first, then `src/shared/money.ts`:
   - the worked example above
   - exact division is not rounded (240,000 / 6 → 40,000)
   - no drinks → shares are court-only
   - drinks > 0 with zero drinkers → throws
   - payer who did not attend → balances still sum to 0
   - randomized sessions + transfers (fixed seed): sum of balances is 0; after applying `suggestTransfers` every balance is 0; transfer count ≤ non-zero members − 1
2. `src/shared/banks.ts`: about 20 common banks as `{ code, name }`, where `code` is the NAPAS BIN. Take the values from `https://api.vietqr.io/v2/banks` once and hardcode them; do not fetch at runtime.
3. `pin-auth.ts`: Hono middleware for PIN check and rate limit.
4. `validation.ts`: zod schemas for member, session, transfer bodies.
5. Routes for members, sessions, transfers; `GET /api/state` does three selects plus attendees and returns one JSON object.
6. `vitest.config.ts` using `@cloudflare/vitest-pool-workers` with D1 migrations applied; `test/api.test.ts`:
   - write without PIN → 401; wrong PIN → 401
   - create members + the worked-example session with PIN → `GET /api/state` shows shares 66,000 / 42,000
   - drinks > 0 with no drinkers → 400
   - update session to 4 attendees → attendee rows replaced, shares recomputed
   - delete session → attendee rows gone
7. `npm run test` and `npm run typecheck`.

## Success Criteria

- [x] All money tests pass, including the randomized zero-sum and settle-to-zero checks
- [x] All API tests pass
- [x] No write route is reachable without the PIN middleware (verified by test for each resource)
- [x] `GET /api/state` returns everything the client needs in one response
- [x] Each source file stays under 200 lines

## Risk Assessment

- Floating-point rounding errors: avoided by integer amounts and one division per share; covered by the exact-division test.
- Rate-limit binding is per Cloudflare location and eventually consistent: acceptable here; the 6+ char PIN is the main defense.
- Editing an old session changes balances retroactively: intended, since balances are derived. History shows the session with its current values; there is no "edited" marker.
