# Code review: badminton cost split PWA (implementation)

Reviewed files on disk 2026-11-27 10:33-10:40 (no diff, all untracked). Source was still being edited during review (`src/client/app.tsx` changed 10:34, tests added 10:35-10:36); line numbers below match the 10:38 state.

## Scope

- Files: `migrations/0001_init.sql`, `wrangler.jsonc`, `src/shared/*` (4), `src/worker/*` (8), `src/client/**` (15 + css), `index.html`, `public/*`, `test/*` (8 + support), configs, `docs/deployment-guide.md`, `README.md`
- LOC: ~1,950 src, ~770 test
- Checks run: `npm run typecheck` exit 0; `npm run lint` exit 0, no warnings; `npm run test` 6 files, 72 passed + 1 expected-fail (`it.fails`, hex id, see D5)
- One transient test failure seen at 10:35 ("a PIN with extra whitespace or different case is not accepted", got 204). Cause: test bug, header values are whitespace-trimmed by the Fetch API so the PIN really matched. Test was rewritten by the tester a minute later; rerun at 10:37 green. Not an auth defect.
- Not run: `npm run build`, dev server, any browser/device check. All client findings are from reading code + CSS, not from a browser.

## Overall

No critical or high defects. Money logic and the PIN trust boundary are correct. Defects are in client error visibility, one URL leak to the QR provider, and input edge cases that return 500 or hit an aliased id.

## Verified OK (asked explicitly)

**(b) Money** `src/shared/money.ts`
- Sign: positive = is owed. Session: payer +share per attendee, attendee -share. Transfer: from +amount, to -amount. Zero-sum by construction (every `add` is paired).
- Rounding: court and drink parts rounded up separately to 1,000; payer credited sum of stored shares. Matches worked example (66,000 / 42,000 / 324,000).
- Integer safety: `amount / (count * 1000)` is exact when divisible; non-divisible quotients are >= 1/50,000 from an integer at max inputs (100M, 50 people), far above float error. Max share 200M, far below 2^53.
- Edge cases covered by tests and reading: payer not attending, drink 0 with flagged drinkers, court 0, single attendee (nets to 0), 1 VND / 50 people, 100M / 49.
- `suggestTransfers`: settles to zero, <= debtors + creditors - 1 transfers, does not mutate input. Randomized test (200 rounds, fixed seed) asserts all three.

**(c) Trust boundary** `src/worker/*`
- Every non-GET under `/api/*` passes `requirePin` (`index.ts:14`), registered before all routes and sub-apps. No GET handler writes. Tests hit all 8 write routes without PIN -> 401.
- Fail closed: `EDIT_PIN` missing or < 6 chars -> 503 before anything else (`pin-auth.ts:25`). Missing limiter binding throws -> 500, also closed.
- Limiter runs before the PIN compare (`pin-auth.ts:30`), so guesses over the limit are never evaluated.
- Compare: SHA-256 both sides + `timingSafeEqual`. Case-sensitive (tested).
- SQL: all values bound. `membersExist` builds only `?` placeholders, max 51 params (D1 limit 100). Never called with an empty list.
- Atomicity: create and update are single `DB.batch` calls; failed update leaves the session untouched (tested). Cascade delete tested.
- Error leakage: `onError` returns a generic body, logs server-side only.
- CSRF not applicable: no cookies, custom header, no CORS.

**(d) Client**
- No `dangerouslySetInnerHTML` / `innerHTML` / `eval` (grep). All hrefs built from numeric ids or server UUIDs.
- VietQR URL: account number `encodeURIComponent`, query via `URLSearchParams`. Checked against the live service with a dummy account: `+` and `%20` variants return byte-identical SVGs, so the `+` encoding is decoded as a space.
- Hooks: all hooks run before the early return in `session-form.tsx:23`; lint rule `react/rules-of-hooks` passes.
- Keys unique in every list. Save buttons disabled by `saving`.
- iOS: all inputs 16px (root 16px + `font: inherit`), top/bottom safe areas handled, `viewport-fit=cover`, icons 180/192/512 confirmed by `file`.
- State fails to load: retry button shown (`app.tsx:144-150`). Refetch on `visibilitychange` present (`app.tsx:66-72`).

## Real defects

### D1. Medium: save errors are invisible on the session form
`src/client/app.tsx:137-141`, `src/client/styles.css:115`, `styles.css:209-218`
- Notice is the first child of `<main>`, not sticky. Save button sits in a sticky bottom bar.
- Scenario: 12 members, user scrolls down to pick attendees, taps Save, server returns 400/429 or the network drops. Button flips "Đang lưu…" -> "Lưu buổi đánh", notice renders ~400px above the viewport. Looks like nothing happened.
- Fix: render the notice inside `.savebar` (or make `.notice` `position: sticky; top: 52px + safe-area; z-index: 1`).

### D2. Medium: write succeeds, refetch fails, UI shows old data with no warning
`src/client/app.tsx:50-57`, `:102-103`, `:142-144`
- `reload` swallows the error into `loadFailed`, which is only rendered when `state` is null. `write` returns true regardless.
- Scenario: session POST returns 201, the following `GET /api/state` fails (signal drop). Form navigates to balances, which still show pre-save numbers. User re-enters the session -> duplicate session, everyone charged twice until someone notices.
- Fix: have `reload` return a boolean; after a write, on false set a notice such as "Đã lưu, nhưng chưa tải lại được số liệu".
- Related, low: a lost response on the POST itself shows "Mất kết nối, thử lại nhé" although the row was stored. No idempotency key. Acceptable at this scale (duplicates are visible and deletable); mention only.

### D3. Medium: QR image request leaks the app URL to img.vietqr.io
`src/client/screens/transfer-card.tsx:56-69`, `index.html` (no referrer policy)
- Browser default `strict-origin-when-cross-origin` sends `Referer: https://<worker-name>.<account>.workers.dev/` with every QR load.
- The accepted decision covers account number + amount going to the provider. It does not cover the URL, and the unguessable Worker name is the only thing protecting the public `GET /api/state` (names, balances, all account numbers).
- Fix: `referrerPolicy="no-referrer"` on the `<img>`, or `<meta name="referrer" content="no-referrer">`.

### D4. Low: out-of-range date returns 500 instead of 400
`src/worker/validation.ts:15`
- `new Date("2026-13-01T00:00:00Z").toISOString()` throws `RangeError`; zod does not catch exceptions in `refine`. Confirmed with the repo's zod: `2026-13-01`, `2026-00-10`, `2026-11-32`, `2026-11-00` all throw; `2026-02-31` is rejected cleanly. `readBody` has no try/catch, so this reaches `onError` -> 500 "Lỗi máy chủ". (Throw verified by script; 500 path by reading.)
- Not reachable from the date picker; nothing is written.
- Fix: `const d = new Date(...); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v`.

### D5. Low: numeric path ids accept hex, exponent and padded forms
`src/worker/http-helpers.ts:23`
- `Number("0x15")` = 21, `Number("1e1")` = 10, `Number(" 7 ")` = 7. `PUT /api/members/0x1` updates member 1 (tester confirmed, `it.fails` in `test/edge-cases-api-input.test.ts:157`).
- PIN-gated, so an alias, not a bypass.
- Fix: `/^[1-9]\d*$/.test(raw)` before `Number`.

### D6. Low: overlapping writes can orphan a PIN prompt and leave a button stuck
`src/client/app.tsx:80`
- Scenario: PIN was rotated, device still has the old one. User confirms "Hủy" on two transfers quickly (or Save then Delete on a session). Both get 401, both call `setPinRequest`; the second replaces the first resolver. First `write` never resolves, its caller stays in `saving` ("Đang lưu…") until remount.
- Fix: one in-flight guard in `write` (ref flag, return false if busy), which also covers D7.

### D7. Low: destructive actions have no in-flight guard
`src/client/screens/session-form.tsx:63-66`, `:134`; `src/client/screens/history-stats.tsx:35-38`
- Delete button stays enabled during save and during its own request. Second confirm -> second DELETE -> 404 -> "Không tìm thấy…" shown after a successful delete. Save + Delete together can also hit D10.

### D8. Low: empty date passes client validation
`src/client/screens/session-form.tsx:29-38`, `:72`
- `problem` never checks `date`; `required` is inert because Save is `type="button"`. iOS date picker has a clear/reset action -> `date === ""` -> Save enabled -> server 400, shown where D1 hides it.
- Fix: add `!date ? "Chọn ngày"` to `problem`.

### D9. Low: error notice is never cleared on navigation
`src/client/app.tsx:46`, `:86`, `:97`, `:101`
- Cleared only by the next successful write. A stale "Sai…/Không tìm thấy…" follows the user across every screen.
- Fix: clear at the start of `write` and on route change.

### D10. Low: update racing a delete returns 500
`src/worker/routes-sessions.ts:51-65`
- Existence check and batch are separate. Session deleted in between -> attendee inserts fail the FK -> batch rolls back -> 500. No data damage. Could return 404 by checking `meta.changes` of the UPDATE, or leave as is.

### D11. Low: PIN with non-Latin-1 characters can never be sent
`src/client/api.ts:42`, `src/client/app.tsx:84-88`, `docs/deployment-guide.md:14`
- Header values must be ByteString. `new Headers({"X-Edit-Pin": "cầulông2026"})` throws `TypeError` (verified in Node, same WebIDL rule in browsers). The rejection is caught as a network error -> "Mất kết nối, thử lại nhé" on every write.
- Fix: one line in the deployment guide ("chỉ dùng chữ không dấu và số"), optionally the same check in `PinPrompt`.

### D12. Low: user-reachable validation errors are English zod defaults
`src/worker/validation.ts:9`, `src/worker/http-helpers.ts:16`, `src/client/format.ts:12`
- Client accepts 9 digits (999,999,999), server caps at 100,000,000. Typing 150.000.000 -> notice "Too big: expected number to be <=100000000" (message verified). Phase 2 requires a short Vietnamese message.
- Fix: message on `amount.max(...)`, and cap `parseMoney` at the same limit. Missing/invalid JSON body similarly returns "Invalid input: expected object, received undefined" (API-only, nit).

### D13. Low, suspicion: stale refetch can overwrite a newer one
`src/client/app.tsx:50-57`, `:66-72`, `:102`
- Visibility refetch and post-write refetch are unordered. If the older response lands last, the just-saved write disappears from the UI until the next refetch. Reasoned from code, not reproduced. Fix: sequence counter, ignore out-of-date responses.

## Plan mismatches (decide, then sync code or plan)

- Rate limit is 20/60s (`wrangler.jsonc:30`, `docs/deployment-guide.md:63`, tests) vs 10/60s in `phase-02:73`. Phase 4 step "11 quick POST /api/pin -> 429" will not trip at 20; needs 21.
- `phase-02` risk note says the UI shows that a session was edited in history. No `updated_at` column, no marker in `history-stats.tsx`.
- Phase 3 success criterion "each source file under 200 lines" is ticked; `src/client/styles.css` is 250. Plan also mandates one CSS file, so leave it and fix the checkbox wording.
- `use-app-state.ts` from the phase 3 file list does not exist; logic lives in `app.tsx` + `app-context.ts`. Fine, plan is stale.

## Acceptance criteria (plan.md)

| Criterion | Status |
|---|---|
| 6-person session in < 30 s | Not verifiable here (device, phase 4). Flow is ~12 taps + 2 amounts |
| Shares sum = payer credit; balances sum 0 | Met (code + tests) |
| All suggested transfers recorded -> all 0 | Met (randomized test; UI prefills the amount) |
| QR shows right payee, amount, memo | URL verified against live service; bank-app scan is phase 4 |
| No PIN -> 401; repeated wrong -> 429 | Met (tests); threshold 20, see mismatch |
| Add to Home Screen full-screen | Meta, manifest, icons present; device check is phase 4 |
| $0/month | Only free-tier features used |

## Nits

Accessibility
- `history-stats.tsx:13-20`: `role="tablist"`/`tab` without `tabpanel`, `aria-controls` or arrow keys. Either finish the pattern or drop the roles and use `aria-pressed`.
- `session-form.tsx:103-111` "Nước" and `history-stats.tsx:66` "Hủy": accessible name has no member/transfer context (12 identical "Nước" buttons). Add `aria-label`.
- `pin-prompt.tsx:19`: `aria-modal` without focus trap, Escape, or focus restore. A native `<dialog>` with `showModal()` gives all three for less code.
- Heading levels jump h1 -> h3 on history, stats and member detail.
- `app.tsx:129`: `history.back()` on a deep-linked sub-screen leaves the app (Safari) or does nothing.
- Landscape left/right safe-area insets not handled.

Code quality
- `test/api.test.ts:5-43` duplicates `PIN`, `call`, `addMembers`, `getState` now in `test/support/api-client.ts`.
- `app.tsx:60-62` repeats `reload`.
- `index.ts:25` `/api/pin` has no client caller (client verifies the PIN by sending the real write). Only tests and the phase 4 curl check use it. Keep for that check or delete.
- `app.tsx:100`: PIN stored only after a 2xx. A 400 with a correct PIN makes the user type it again.
- `app.tsx:93`: a stored PIN that went stale shows "Sai mã PIN" before the user typed anything.
- `vietqr.ts:16`: regex holds literal invisible combining characters (bytes `cc80`-`cdaf`). Use `̀-ͯ`.
- `money.ts:65-67`: comment says largest debtor meets largest creditor; after the first match it is a sorted two-pointer sweep. Result is still valid; fix the comment.
- `member-detail.tsx:64,70`: "đã ứng" shows the sum of shares, not court + drink actually paid.
- `validation.ts:28-40`: server does not require bank and account together (client does); `active` defaults to true, so a PUT without it reactivates a member. Client always sends both.
- `member-form.tsx:64`: `inputMode="numeric"` while the server allows letters in account numbers.
- No `public/_headers`: no CSP / `X-Frame-Options`. PIN lives in `localStorage`; a `default-src 'self'; img-src 'self' https://img.vietqr.io` policy is cheap hardening.
- Rate limiter notes within the accepted design: key is the full client IP (IPv6 rotation sidesteps it), valid writes also consume the budget (20/min shared by everyone behind one NAT).

Checked and clean: kebab-case file names, no mocks or fake data (tests run in workerd against real D1), no plan/phase IDs in code comments, no `any` or lint suppressions in `src/`, `.dev.vars` ignored.

## Recommended order

1. D3 (one attribute)
2. D1 + D9 (notice placement and lifetime)
3. D2 (surface failed refetch)
4. D4, D5 (two one-line server fixes; flip the `it.fails` test)
5. D6 + D7 (single in-flight guard in `write`)
6. D8, D11, D12
7. Sync the rate-limit number between plan and config

## Unresolved questions

1. Rate limit: 20/60s or 10/60s?
2. Should history mark edited sessions, as the phase 2 risk note says? Needs a column.
3. Should inactive members be rejected as attendees/payer of new sessions? Server accepts them today; client hides them (tester raised the same).
4. Keep `/api/pin` and `/api/health` in production?
5. Is the URL considered secret enough to justify D3 as medium? If the group link is already shared freely, it drops to low.
