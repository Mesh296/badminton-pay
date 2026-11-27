---
title: Badminton cost split PWA
description: >-
  PWA for a 10-12 person badminton group: enter a session, split court and drink
  costs, track running balances, settle via VietQR. Cloudflare Workers + D1,
  $0/month.
status: in-progress
priority: P2
branch: minhtran-emvn/init
tags:
  - pwa
  - cloudflare-workers
  - d1
  - react
  - hono
blockedBy: []
blocks: []
created: '2026-11-27T03:02:53.385Z'
createdBy: 'ck:plan'
source: skill
---

# Badminton cost split PWA

## Overview

Greenfield web app (PWA, iPhone-first) for a badminton group of 10-12. One person fronts the money each session; the app splits it, keeps a running balance per member, suggests who pays whom, and shows a VietQR code for the transfer.

Source of decisions: [brainstorm report](../reports/brainstorm-261127-0952-badminton-cost-split-pwa-report.md). Mode: fast (scope fixed in brainstorm, no open research).

## Key Decisions

| Area | Decision |
|---|---|
| Split | Court+shuttle amount split evenly among attendees; drink amount split evenly among drinkers |
| Rounding | Each part rounded UP to 1,000 VND; payer is credited the sum of shares (surplus of a few thousand goes to payer) |
| Payer | Varies per session; may be a non-attendee |
| Debt tracking | Running balance per member, derived from raw rows, never stored |
| Settlement | Greedy "largest debtor pays largest creditor", at most n-1 transfers; recording a transfer is manual |
| Hosting | Changed 2026-11-27: the user has a VPS (Ubuntu, Docker). Production = Docker Compose: Node + SQLite file behind Caddy (HTTPS). The Worker + D1 path stays for dev and tests; the API code is shared through a thin D1-over-SQLite adapter (`src/server/`) |
| Write access | Google sign-in per member (replaced the shared PIN, phase 5). Payer owns their sessions, receiver confirms transfers, admins manage members |
| Read access | Public to anyone with the link (includes names, balances, bank account numbers) |
| VietQR | `<img>` from `img.vietqr.io` |
| Stack | One Cloudflare Worker: React + Vite SPA as static assets, Hono API under `/api/*`, D1 |
| Distribution | PWA via Add to Home Screen; manifest + icons only, no service worker |
| Styling | One plain CSS file, no Tailwind or component library |
| Routing / data | Hash routes and one `GET /api/state` refetched after each write; no router or query library |

## Architecture

```
iPhone (PWA) ──> Worker ──┬─ static assets (SPA, index.html fallback)
                          └─ /api/* (Hono) ── session cookie + per-member rules ── D1
```

- `src/shared/` holds pure money logic used by both Worker (compute shares on save) and client (live preview, balances, settlement, stats).
- Client computes balances/stats from `/api/state`. Ceiling: fine for years of data at this group size (~500 sessions ≈ 100 KB JSON); move aggregation to SQL only if payload grows past ~1 MB.

Target layout:

```
migrations/0001_init.sql
src/shared/   money.ts  vietqr.ts  banks.ts  types.ts
src/worker/   index.ts  pin-auth.ts  validation.ts  routes-*.ts
src/client/   main.tsx  app.tsx  api.ts  format.ts  styles.css  screens/*.tsx
public/       manifest.webmanifest  icons  robots.txt
test/         money.test.ts  api.test.ts
```

## Acceptance Criteria

- [ ] Entering a 6-person session with 3 drinkers takes under 30 seconds on an iPhone
- [ ] Sum of shares of a session equals the payer's credit; sum of all balances is always 0
- [ ] After every suggested transfer is recorded, every balance is 0
- [ ] Scanning the QR with a bank app shows the right payee, amount, and memo
- [ ] Any write without a signed-in account returns 401; a write the account may not make returns 403
- [ ] Add to Home Screen opens full-screen on iOS
- [ ] Running cost is $0/month

## Out of Scope

Guests outside the member list, per-hour splitting, per-item drink pricing, per-user login, offline mode, push notifications, bank integration to auto-confirm transfers.

## Risks

| Risk | Handling |
|---|---|
| Public read exposes names, balances, account numbers to anyone who finds the URL | Accepted by user. `noindex`, non-obvious Worker name. Upgrade path: require sign-in for `GET /api/state` |
| Account number and amount pass through `vietqr.io` | Accepted by user. Upgrade path: generate the EMVCo QR payload in-app |
| Forged sign-in | HMAC-signed session cookie, 32+ char secret, fail closed if unset; Google callback checks state, audience, issuer, verified email |
| Cloudflare template or binding config drifted from what this plan assumes | Each phase names the doc page to check before writing config |
| Scope creep | Out-of-scope list above; new requests go to a later plan |

## Open Questions

- Does Google sign-in work inside the iPhone home-screen app? Verify on device in phase 4.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Scaffold and Database](./phase-01-scaffold-and-database.md) | Completed |
| 2 | [Money Logic and API](./phase-02-money-logic-and-api.md) | Completed |
| 3 | [Mobile UI and PWA](./phase-03-mobile-ui-and-pwa.md) | Completed |
| 4 | [Deploy and Device Verification](./phase-04-deploy-and-device-verification.md) | Pending |
| 5 | [Google sign-in and per-member permissions](./phase-05-google-sign-in-and-per-member-permissions.md) | In Progress |

## Dependencies

- No other plans in `plans/`.
- Phases run in order: 1 → 2 → 3 → 5 → 4.
- Phases 1-3 need no Cloudflare account (local D1). Phase 4 needs the user to run `wrangler login`, create a Google OAuth client and set the sign-in secrets.
