---
phase: 3
title: Mobile UI and PWA
status: completed
effort: 5h
priority: P1
dependencies:
  - 1
  - 2
---

# Phase 3: Mobile UI and PWA

## Overview

Five iPhone-first screens in Vietnamese on top of the API, the VietQR payment view, and the PWA metadata that makes Add to Home Screen open full-screen.

## Requirements

- Functional: balances home, member detail with QR and "Đã chuyển", session form with live preview, history + stats, member management, PIN prompt.
- Non-functional: usable one-handed at 390 px width; session entry under 30 s; no extra UI dependencies; basic accessibility (labels, real buttons, contrast, meaning not carried by color alone).

## Architecture

- Hash routes handled by a ~15-line hook on `hashchange` (keeps iOS swipe-back working): `#/`, `#/member/:id`, `#/session/new`, `#/session/:id`, `#/history`, `#/members`.
- `useAppState` hook: fetch `/api/state` on load and after every successful write. Balances, suggestions, and stats are computed on the client with `src/shared/money.ts`.
- `api.ts`: fetch wrapper that adds `X-Edit-Pin` from `localStorage`; on 401 it clears the stored PIN and opens the PIN prompt; on 429 it shows "thử lại sau 1 phút".
- Bottom tab bar: Số dư / Lịch sử / Thành viên. Primary button "+ Buổi mới" on the home screen.

### Screens

| Screen | File | Content |
|---|---|---|
| Số dư | `screens/balances.tsx` | Members sorted debtors first; each row "nợ 85.000đ" or "được nhận 120.000đ"; zero balances muted |
| Chi tiết | `screens/member-detail.tsx` | Balance; for a debtor, each suggested transfer with payee, amount, QR, account number + copy button, "Đã chuyển"; for a creditor, who will pay them; that member's sessions and transfers |
| Buổi đánh | `screens/session-form.tsx` | Date (default today), payer, court+shuttle amount, drink amount, member rows with "đi" and "nước" toggles, live per-person preview, sticky Save |
| Lịch sử | `screens/history-stats.tsx` | Sessions and transfers by date; tap a session to edit, a transfer to undo (confirm); stats tab with total per month and per-member session count + total share |
| Thành viên | `screens/members.tsx` | Add/edit name, bank, account number, account name; active toggle |

### VietQR (`src/shared/vietqr.ts`)

```
https://img.vietqr.io/image/{bank_code}-{account_no}-compact2.png
  ?amount={amount}&addInfo={memo}&accountName={account_name}
```

- Memo: `Cau long {payer name without diacritics}`, URL-encoded, max 50 chars.
- Confirm the URL format before coding: https://www.vietqr.io/danh-sach-api/link-tao-ma-nhanh/
- Payee without bank info: show the amount and "chưa có tài khoản" instead of a QR.
- The account number and copy button stay visible so payment still works if the image fails to load.

### PWA and iOS details

- `public/manifest.webmanifest`: name, `short_name` "Cầu lông", `display: standalone`, colors, 192/512 icons.
- `index.html`: `lang="vi"`, apple-touch-icon 180 px, `apple-mobile-web-app-capable`, `viewport-fit=cover`, `<meta name="robots" content="noindex">`.
- `public/robots.txt` disallowing all.
- Safe-area padding for the notch and home indicator; tap targets ≥ 44 px.
- Inputs at 16 px font to stop iOS zoom; money inputs use `inputmode="numeric"` with thousand separators via `Intl.NumberFormat('vi-VN')`.
- No service worker.

## Related Code Files

- Create: `src/client/api.ts`, `src/client/format.ts`, `src/client/use-app-state.ts`, `src/client/use-hash-route.ts`
- Create: `src/client/pin-prompt.tsx`, `src/client/styles.css`
- Create: `src/client/screens/balances.tsx`, `member-detail.tsx`, `session-form.tsx`, `history-stats.tsx`, `members.tsx`
- Create: `src/shared/vietqr.ts`
- Create: `public/manifest.webmanifest`, `public/robots.txt`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- Modify: `src/client/app.tsx`, `src/client/main.tsx`, `index.html`

## Implementation Steps

1. `format.ts` (VND formatting, parse numeric input, strip diacritics) and `vietqr.ts`; add 2-3 assertions for both to `test/money.test.ts` or a small sibling test.
2. `api.ts`, `use-app-state.ts`, `use-hash-route.ts`, `pin-prompt.tsx`.
3. `styles.css`: CSS variables, system font, light and dark via `prefers-color-scheme`.
4. Members screen first (needed to create data), then session form, balances, member detail, history + stats.
5. Session form rules: "nước" toggle only enabled when "đi" is on; Save disabled until the same rules as server validation pass; preview uses `splitSession`.
6. "Đã chuyển": amount prefilled from the suggestion and editable, then `POST /api/transfers`, then refetch.
7. Destructive actions (delete session, undo transfer) ask for confirmation.
8. PWA files and `index.html` meta tags; simple shuttlecock icon.
9. Verify in a browser at 390 px width against the local Worker: add 6 members, enter the worked-example session, check balances and suggestions, record transfers until all balances are 0, edit and delete a session, check stats.

## Success Criteria

- [ ] Worked-example session entered in under 30 s with the stopwatch running (needs a person on a real iPhone; checked in phase 4)
- [x] Balances screen matches the API test numbers (66,000 / 42,000; payer +258,000 if the payer drank)
- [x] Recording all suggested transfers brings every balance to 0
- [x] QR image renders with the right amount for a member with bank info; fallback text shows without it
- [x] Wrong PIN shows the prompt again; no write happens
- [x] No horizontal scroll at 390 px; inputs do not trigger zoom
- [x] `npm run typecheck`, `npm run test`, `npm run build` pass; each source file under 200 lines

## Risk Assessment

- An installed PWA on iOS has storage separate from Safari: the PIN must be entered once more after Add to Home Screen. Mention it in the member instructions (phase 4).
- `img.vietqr.io` outage: account number + copy button is the fallback.
- UI growing beyond 5 screens: anything not listed here goes to a later plan.
