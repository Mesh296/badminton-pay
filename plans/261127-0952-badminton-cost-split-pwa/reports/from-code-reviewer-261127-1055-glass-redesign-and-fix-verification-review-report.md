# Code review: restyle + fix verification (second pass)

## Read this first: the review target changed mid-review

- Brief describes a green "glass" UI with light + dark themes. That is what was on disk at 10:48.
- Between 10:54 and 10:56:38 these were rewritten: `src/client/styles/{tokens,base,components,motion}.css`, `styles.css`, `member-visuals.tsx`, `pin-prompt.tsx`, `screens/{balances,history-stats,members}.tsx`, `index.html`, `public/manifest.webmanifest`.
- On disk now: light-only "white gallery" theme. `color-scheme: light` (`tokens.css:6`), no `prefers-color-scheme: dark` block, blue accent, `.glass` only on top bar / tab bar / save bar / toast, PIN dialog is `.surface`, balance pills replaced by `.balance` text.
- **This report covers the state after the last write (10:56:38), unchanged through 11:06:46.** Logic files (`app.tsx`, `use-pin-write.ts`, `use-hash-route.ts`, `session-form.tsx`, `transfer-card.tsx`, `member-detail.tsx`, `member-form.tsx`, `src/worker/*`) last changed 10:43-10:46, before I read them.
- Brief items with no target any more: dark-mode contrast, contrast of text on translucent cards/dialog, background blobs, hue avatars.
- A new report `research-261127-1041-iphone-liquid-glass-on-the-web-report.md` appeared at 11:04, so a third restyle may be coming. CSS findings below then need a recheck; logic findings do not.

## Addendum 11:10: a third rewrite started while this report was being written

Writes resumed at 11:07:03 and were still landing at 11:09:04 (`package.json`, `package-lock.json`, all four style files, `use-hash-route.ts`, `app.tsx`, `main.tsx`, `session-form.tsx`, `balances.tsx`, `members.tsx`, `pin-prompt.tsx`, `index.html`, manifest). Not reviewed. Diff against my 10:56 copy plus greps at 11:09:56 only:

- Reverses two decisions the brief lists as settled:
  - View Transitions API removed from `use-hash-route.ts` (no `startViewTransition`, no `flushSync`, no `animateUntil`); `view-transition-name` gone from the CSS.
  - System font replaced by a self-hosted webfont: `main.tsx:3-7` imports `@fontsource/be-vietnam-pro` (4 weights), new dependency at `package.json:19`.
- Also new: floating "+" link (`app.tsx`, class `fab`), `div.screen` keyed by route replaces the `SessionForm` key, `data-boot` reveal removed, `.glass` class removed from markup, `theme-color` now `#f2f2f2`.
- `npm run typecheck` exit 0 at 11:09:56. Lint and tests not rerun on this state.

Effect on the findings below:

| Finding | In the 11:09 state |
|---|---|
| (a) table D1-D13 | Logic unchanged; line numbers in `app.tsx` shift by a few lines |
| N1 row overflow | Still present: `components.css:64` + `:66-70`, `history-stats.tsx:62`, `member-detail.tsx:88` |
| N2 silent dropped write | Still present: `use-pin-write.ts:26` (file untouched) |
| N9 `button role="alert"` | Still present: `app.tsx:155` |
| N10 `history.length` back | Still present: `use-hash-route.ts:28` |
| N11 scroll reset on back | Still present: `use-hash-route.ts:14` |
| N3, N4, N5, S1-S4 | Moot: view transitions removed |
| N6 | Media query still there (`tokens.css:82`); comment not rechecked |
| N7, N8, N12, N13, S6 | Need a recheck: tokens and components rewritten |

Everything from "Scope and method" down describes the 10:56:38 state.

## Scope and method

- Files: all listed in the brief + `public/manifest.webmanifest`, `docs/deployment-guide.md:14`, tests touching the fixes.
- Checks: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run test` 6 files, 73 passed (the former `it.fails` hex-id test now passes normally). Rerun at 11:06 on the final state.
- Browser: headless Chrome 158 over the DevTools protocol, 375x667 mobile emulation, against the running dev server. GET only. For the toast check `fetch` was stubbed inside that page. Member-detail page not opened (would call img.vietqr.io).
- Not done: any write through the API, any WebKit/iPhone run, `npm run build`. View-transition and layout results are Chrome results.
- No client hook has a test (`use-pin-write.ts`, `use-hash-route.ts`). Fixes D6, D7, D11 are verified by reading only.

## (a) First-report findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| D1 | Save error invisible | FIXED | Fixed toast `app.tsx:141-145`, `components.css:192-208` (z 50). Measured at 375px: x16 y64 343x48, under the 52px bar |
| D2 | Stale state after failed refetch | FIXED | `reload` returns boolean `app.tsx:51-60`; `use-pin-write.ts:61` shows "Đã lưu, nhưng chưa tải lại…"; resume path `app.tsx:72`. Residual: message is gone after 6 s (`app.tsx:23,79-83`), nothing marks the data as stale after that |
| D3 | QR referrer leak | FIXED | `transfer-card.tsx:71` `referrerPolicy="no-referrer"` |
| D4 | `2026-13-01` -> 500 | FIXED | `validation.ts:16-25`; test `test/api.test.ts:106,110` expects 400 |
| D5 | Hex / exponent path ids | FIXED | `http-helpers.ts:25-30` digits only; test `test/edge-cases-api-input.test.ts:166-171`. Nit: `007` still aliases 7 |
| D6 | Overlapping writes orphan PIN prompt | FIXED | In-flight ref `use-pin-write.ts:20,26-27,64-66`. Side effect: N2 |
| D7 | Double delete | FIXED | Same guard. Delete button still not disabled (`session-form.tsx:146`); second tap is dropped silently (N2) |
| D8 | Empty date | FIXED | `session-form.tsx:32-33` |
| D9 | Notice never cleared | PARTIAL | Auto-dismiss 6 s + tap (`app.tsx:79-83,142`). Not cleared on route change or at write start; stale toast lives up to 6 s |
| D10 | Update racing delete -> 500 | NOT FIXED | `routes-sessions.ts:51-65` unchanged. Was optional |
| D11 | Non-ASCII PIN | FIXED | `use-pin-write.ts:11,37-41`; `docs/deployment-guide.md:14` |
| D12 | Amount cap mismatch, English zod text | PARTIAL | Cap shared: `money.ts:7`, `format.ts:14`, `validation.ts:12`; Vietnamese on amount/date/member id `validation.ts:7-12,22-25`. Still zod-default English, API-only: `validation.ts:30-32` (text length), `:39,:44` (non-string), `:61-63` (attendee max 50, `drank`), missing body via `http-helpers.ts:13-16` |
| D13 | Stale refetch overwrites newer | NOT FIXED | `app.tsx:51-60,69-76`, no sequence guard. Still unreproduced |

First-report nits: "Nước" label FIXED (`session-form.tsx:115`). NOT FIXED: tablist without tabpanel (`history-stats.tsx:15-22`), "Hủy" without context (`history-stats.tsx:74`), `aria-modal` without focus trap / Escape (`pin-prompt.tsx:19`), landscape side insets, duplicate initial load (`app.tsx:63-65`), `/api/pin` comment claims a client caller (`index.ts:24-25`), PIN stored only after 2xx (`use-pin-write.ts:58`), stale stored PIN shows "Sai mã PIN" unprompted (`use-pin-write.ts:51`), `inputMode="numeric"` with letters allowed (`member-form.tsx:64`), "đã ứng" = sum of shares (`member-detail.tsx:64,73`). PARTIAL: deep-link back (N10). Others not rechecked.

## New findings, verified

### N1. Medium: transfer rows overflow the card and the screen
`components.css:61`, `components.css:63-67`; `history-stats.tsx:62`, `member-detail.tsx:88`
- `.list > li { margin: 0 20px }` plus `.list-row { width: 100% }` on the same `<li>` (transfer rows are `li.list-row`; session rows are `li > a.list-row`, fine).
- Measured on `#/history` at 375px: row right edge 379, card right edge 359, viewport 375, document `scrollWidth` 379. Page scrolls sideways; divider and "Hủy" run past the card, "Hủy" clipped at the screen edge.
- Knock-on, measured: every view transition into `#/history` is aborted by Chrome (`InvalidStateError … Viewport size changed`), so that tab never animates.
- member-detail transfer list uses the same markup; not measured.
- Fix: `.list > li.list-row { width: auto; }`.

### N2. Medium: a write issued while another is in flight is dropped with no feedback
`use-pin-write.ts:26`; callers `history-stats.tsx:37-40`, `session-form.tsx:57-70`, `transfer-card.tsx:37-47`
- Guard spans the request and the refetch. Neither fetch has a timeout (`api.ts:34,40`).
- Scenario 1: slow network, user confirms "Hủy" on transfer A, then on transfer B. B returns false immediately: no toast, no busy state. User believes both were cancelled.
- Scenario 2: refetch after a save hangs. Every later Save tap flips "Đang lưu…" for one frame and does nothing until the fetch settles.
- Fix: `notify("Đang lưu thao tác trước, đợi chút rồi thử lại")` before `return false`. Optional: `signal: AbortSignal.timeout(15000)` on both fetches.
- Read from code; not reproduced (no writes allowed).

### N3. Low: active tab icon and label disappear under the indicator during every tab switch
`base.css:101-111` (`view-transition-name: tab-indicator` inside the named `.tabbar`), `motion.css:59`
- A named child is captured separately and its group is painted above the parent's snapshot, which contains the labels. Indicator is now opaque `--control-gray`.
- Seen in the app with the transition frozen half way: "Thành viên" hidden under the gray pill for the 420 ms.
- Fix (untested): drop the name from `.tab-indicator`, keep its CSS transition unconditionally (remove the `@supports not` wrapper at `motion.css:22-24`), add `::view-transition-old(tabbar) { display: none }` and `::view-transition-new(tabbar) { animation: none }` so only the live tab bar shows.

### N4. Low: toast is hidden while a screen transition runs
`components.css:192`, `app.tsx:141-145`
- Un-named fixed elements stay in the root snapshot, below the `screen` group. Seen in the app: toast up, tab switch, toast covered until the transition ends.
- Hits the D2 path exactly: `use-pin-write.ts:61` raises the notice, `session-form.tsx:64` navigates at once.
- Fix: `view-transition-name: toast` on `.toast`; same idea for `.overlay`.

### N5. Low: screen flies in vertically when navigating from a scrolled page
`motion.css:57-58`, `use-hash-route.ts:32-35`
- `scrollTo(0,0)` runs inside the update callback, so `::view-transition-group(screen)` animates from the scrolled position to the top. Measured: scrolled 150px, group at translateY 22px half way, final 52px. Grows with list length.
- Fix: `::view-transition-group(screen) { animation: none; }`. Check the old screen's fade on a device after.

### N6. Low: "Reduce Transparency" fallback never runs on iPhone
`tokens.css:102-108`
- `prefers-reduced-transparency` is unsupported in Safari and iOS Safari (caniuse: no support through 26.x/27.x; Chromium only). The comment `iOS "Reduce Transparency"` is wrong.
- Impact small with `--nav-fill` at 0.8. Fix the comment; rely on a dense default fill.
- No-backdrop-filter fallback `tokens.css:109-113` is correct but no current engine needs it; 5 lines, keep or drop.

### N7. Low: contrast below 4.5:1 (computed from tokens, blur averaging ignored)
| Pair | Ratio | Where |
|---|---|---|
| inactive segmented label, `--muted` on `--track` over `--bg` | 3.71 | `components.css:162-181`, always |
| save-bar hint (`.muted`, 14px) on frosted fill | 4.79 over white, 3.15 over selected (black) toggles | `session-form.tsx:136`, `components.css:150-159`. Selected rows under the bar is the normal state while filling the form |
| inactive tab label (12px) | 4.71-4.79 typical, 3.15 over black toggles, 3.61 over the blue button | `base.css:85-98` |
| toast text (14px) | 5.23-5.32 typical, 3.50 over black toggles, 4.01 over blue | `components.css:192-208` |
| unselected toggle outline (non-text) | 1.45 | `components.css:140` |
- Passing: muted on white 4.95, muted on canvas 4.55, link on white 5.57, white on blue button 4.70, debt/error on white 5.50, field outline 3.62.
- `--muted` cannot reach 4.5 over black below ~0.97 fill alpha. Fix: use `--text` for small text on `.glass` (save-bar hint, tab labels) or raise `--nav-fill` to ~0.92; darker label on the segmented track.

### N8. Low: touch targets under 44px (measured)
- `.segmented button` 168x40 (`components.css:181`).
- `.link` "Hủy" 37x44 (`components.css:57`). Add `min-width: 44px`.
- Session form: none under 44.

### N9. Low: toast is a `<button role="alert">`
`app.tsx:142`
- `alert` is not a permitted role on `button` and replaces the button role, so assistive tech is not told it can be dismissed. Fix: `<div role="alert">` wrapping a button, or a plain `div` with the click handler.
- Same message twice does not restart the 6 s timer (`app.tsx:79-83`); the repeat can vanish almost at once.

### N10. Low: `goBack()` decides on `history.length`
`use-hash-route.ts:69-76`
- Length counts the whole tab history, both directions. Deep link opened from another page in the same tab: length > 1, `back()` leaves the app. First entry with forward entries: `back()` does nothing, button is dead.
- Empty history (fresh tab, home-screen launch): falls back to `#/` correctly.
- Fix: count in-app navigations in a module variable; `back()` only when > 0, else `navigate` to the parent tab.

### N11. Low: scroll reset on every hashchange, including back
`use-hash-route.ts:32-35`
- Open a session from far down the history list, go back: list is at the top. Reset only on forward in-app navigation.

### N12. Low: raw color outside `tokens.css`
- `components.css:119`: `stroke='%2386868b'` in the select chevron data URI, a copy of `--steel`. Commented, but it will drift. Cheapest: record it as a second accepted exception next to the QR tile; a mask-based version needs a wrapper element.
- Nit: `base.css:46,108` and `components.css:92` use palette tokens (`--control-gray`, `--white`) although `tokens.css:3` says components use semantic names only.

### N13. Low: top bar height ignores the safe-area inset
`base.css:44-45`
- `min-height: 52px` with `border-box` includes the `env(safe-area-inset-top)` padding. No effect today: `index.html:13` uses status-bar style `default`, inset is 0. Switching to `black-translucent` gives a bar with no room above the title. Fix: `min-height: calc(52px + env(safe-area-inset-top))`.

## Checked and fine

- (b) `role="group"` + `aria-labelledby` on the attendee `<section>` is valid (`session-form.tsx:97-98`). `aria-pressed` toggles correct (`:106,:114`). Hooks all before early returns (`session-form.tsx:25`, `history-stats.tsx:35`, `member-detail.tsx:12`). Keys unique in every list.
- (c) `animateUntil` gate works: `data-nav` set, `ready` resolved on `#/ -> #/members` and `#/ -> #/session/new`. `flushSync` in the update callback is correct, new screen is captured. `current` ref is updated synchronously in the handler, not stale. StrictMode: effect and cleanup are symmetric. `data-nav` never cleared: harmless, only `::view-transition-*` selectors read it and it is set before each transition. Four transition names, one element each. `@supports not (view-transition-name: none)` syntax correct. Reduced motion covered twice (JS `use-hash-route.ts:40`, CSS `motion.css:88-97`).
- (d) `-webkit-backdrop-filter` present (`base.css:31`). Blur layers: top bar + tab bar always, + save bar on the session form, + toast = 4 max. Stacking order correct: save bar 10 (inside `main`), bars 20, toast 50, dialog 100. End of scroll at 375x667: last section bottom 357, save bar 377-563, tab bar top 595, nothing covered. Inputs 17px. Keyframes animate transform and opacity only; transitions also cover color, background and box-shadow, so the comment at `motion.css:2` is slightly off, but nothing triggers layout.
- (e) All code files under 200 lines (max 156). kebab-case names. No dead selectors in either direction (old `.notice` is gone). No unused tokens.

## Suspicions (not verified)

- S1. WebKit drops `backdrop-filter` while a view transition runs (WebKit bug 302256, status NEW). Top bar and tab bar would flash to the flat 80% fill on each animated navigation on iPhone. Chrome keeps the blur on the group (measured). Needs a device.
- S2. A late update callback can overwrite a newer route: `apply` closes over `next` (`use-hash-route.ts:29-35,49`). Needs an un-animated hashchange inside the capture window, so unlikely. One-line hardening: `setRoute(parse())`.
- S3. `transition.ready` rejects when a transition is skipped (seen: InvalidStateError) and nothing handles it (`use-hash-route.ts:49`): possible "Uncaught (in promise)" console noise. Not captured.
- S4. Gate holes (`use-hash-route.ts:24-26`): tapping the tab already shown arms the gate with no hashchange, so a back swipe within 600 ms animates twice; tapping "Số dư" on a URL with no hash runs a same-screen transition and adds a history entry.
- S5. After deleting a session the form shows "Không tìm thấy buổi đánh." until navigation, because `write` resolves after the refetch (`session-form.tsx:25,67-70`).
- S6. iOS date input with `appearance: none` (`components.css:102-115`): empty-state height and alignment need a device.
- S7. Resume from background can fire `visibilitychange` before the network is back: spurious "Chưa tải được số liệu mới" toast (`app.tsx:69-73`).

## Nits

- `format.ts:14`: typing past the cap snaps the field to 100.000.000 instead of ignoring the keystroke.
- `app.tsx:72`: resume failure with no state loaded says "đang hiện số cũ" over the "Không tải được dữ liệu" screen.
- `app.tsx:28`: "Số dư" tab carries `aria-current="page"` on member and new-session screens.
- Custom old/new screen animations still use the UA `mix-blend-mode: plus-lighter` (`motion.css:61-66`); set `normal` when not cross-fading the same content.

## Recommended order

1. N1 (one line; also restores the history transition)
2. N2 (one `notify`)
3. N3 + N4 + N5 (transition CSS, about 6 lines)
4. N7 + N8 (tokens and two sizes)
5. N9, N10, N11, N13
6. D9 remainder, D12 remainder, D13, D10 if wanted

## Sources

- https://caniuse.com/mdn-css_at-rules_media_prefers-reduced-transparency
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency
- https://bugs.webkit.org/show_bug.cgi?id=302256

## Unresolved questions

1. Which design is the target: the brief's glass + dark theme, the light-only theme on disk, or the "liquid glass" direction in the 11:04 research report? CSS findings N3-N8, N12, N13 are tied to the on-disk state.
2. Is dropping dark mode intended? On a dark-mode phone the app is now light.
3. Accept the select-chevron data URI color as a second raw-color exception?
4. D10: leave the 500 on update-vs-delete as is?
5. Is the scroll reset on back navigation (N11) intended?
6. First-report questions 1-4 (rate limit number, edited-session marker, inactive attendees, `/api/pin` and `/api/health`) were not revisited.
