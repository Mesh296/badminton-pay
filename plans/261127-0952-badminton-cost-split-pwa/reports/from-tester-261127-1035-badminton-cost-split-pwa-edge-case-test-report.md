# Edge-case test report: badminton-pay (money + API)

## Commands run

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc -b`) | PASS, exit 0 |
| `npm run lint` (`oxlint`) | PASS, exit 0, no warnings |
| `npm run test` (baseline, before new tests) | PASS, 3 files, 28 tests, 1.9s |
| `npm run test` (after) | PASS, 6 files, 72 passed + 1 expected-fail (`it.fails`), 73 total, ~2.2s |
| `npm run test` x2 more | identical counts, no flakiness observed |

Tests: 28 -> 73 total. New: 45 (44 pass, 1 `it.fails` that documents a defect).

Not run: `npm run build`, coverage (no coverage script or provider in `package.json`, so not measured).

## Tests added

- `test/edge-cases-money.test.ts` (15): single attendee, one drinker, odd/tiny/1-VND court, independent rounding, max 50-attendee exact split, max court over 49, court 0 with drinks, drink 0 with flagged drinker, payer-only nets zero, rounding surplus to payer, empty ledger/zero balances.
- `test/edge-cases-api-input.test.ts` (19): max 100M and 100M+1, non-integer/string/null/bool/negative/`1e400` amounts, court+drink 0, court 0 with drinks only, single attendee, 50 vs 51 attendees, unknown payer, client `share` fields ignored, note blank/200/201, leap vs impossible dates, malformed and missing JSON body, name 40/41, account no. rules, transfer amount bounds, non-decimal/zero/negative/fractional ids, unknown transfer id, id beyond safe int, hex id (`it.fails`), non-integer drink not persisted.
- `test/edge-cases-api-flow.test.ts` (11): wrong/empty PIN on all write routes writes nothing, PIN case sensitivity, exact 20/60s rate boundary then 429 even with right PIN, GETs not rate-limited, fail-closed 503 for short/absent `EDIT_PIN`, `/api/state` grouping + ordering, payer change on update, failed update atomic (state unchanged), update unknown id 404, deactivated member characterization.
- `test/support/api-client.ts`: shared helper (per-test IP, table reset, bulk seed via D1 to avoid the rate limit).

Fail-closed test uses the real `requirePin` mounted in a local Hono app with a per-request `env`, because the `EDIT_PIN` binding is fixed in `vitest.config.ts` and cannot be varied cleanly.

## Defects found

1. **Path ids parsed with `Number()`, accept hex/exponent notation** (`src/worker/http-helpers.ts:23`, `intParam`; used by `src/worker/routes-members.ts:22` and `src/worker/routes-transfers.ts:25`).
   - Input: `PUT /api/members/0x1` (member id 1), body `{"name":"Hacked"}`.
   - Expected: 404 (non-decimal id), member unchanged.
   - Actual: 200, member 1 renamed to "Hacked" (verified by probe).
   - Same parser covers `1e1` (= 10) and `DELETE /api/transfers/<hex>`. Transfer delete was not probed directly.
   - Severity: low-medium. Only PIN holders can write, but a write can hit a different record than the id shown.
   - Test: `test/edge-cases-api-input.test.ts` "rejects hex-notation member ids..." marked `it.fails`. Fix would be `/^\d+$/` check in `intParam`; not applied (src out of scope).

No money-logic defects found. Splits, rounding, balances and settlement held on all boundary cases tested.

## Behaviour notes (not defects, need decision)

- Deactivated members accepted as session attendees (`src/worker/routes-sessions.ts:24` via `membersExist` in `src/worker/http-helpers.ts:31-38`, which ignores `active`). Locked as characterization test in `test/edge-cases-api-flow.test.ts`. If inactive members must be rejected, flip that test and add the check.
- Rate limit: `wrangler.jsonc` says 20/60s (matches task), phase-02 plan says 10/60s. Tests follow 20/60s. Plan doc looks stale.

## Coverage gaps left

- No coverage numbers; add `@vitest/coverage-v8` and a script if the 80% target is required.
- Mutation check not performed. Assertions are exact values, so a ceil->floor or drop-payer-surplus change should fail, but this was not verified by mutation.
- Race: `PUT /api/sessions/:id` concurrent with `DELETE` can hit an FK error inside the batch (500). Not deterministically testable.
- No request body size limit; not tested or enforced.
- Transfers to/from deactivated members not tested.
- `HEAD` requires PIN (method !== "GET"); not tested.
- Client-side balance/settlement code (`src/client`) not covered by these tests beyond `format.ts`.
- No `npm run build` check run.

## Unresolved questions

1. Should inactive members be blocked from new sessions and transfers?
2. Is hex/exponent path id acceptance unintended? (Assumed yes; fix is a one-line `intParam` change.)
3. Rate limit: 20/60s (wrangler, task) or 10/60s (plan)?
4. Is a coverage target (80%) to be enforced? No provider configured today.
