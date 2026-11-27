---
type: journal
date: 2026-11-27
branch: minhtran-emvn/init
plan: plans/261127-0952-badminton-cost-split-pwa
---

# Brainstorm + plan: badminton cost split PWA

## Context

Empty repo. Goal: simple iPhone-first app for a 10-12 person badminton group to split court and drink costs when attendance varies and one person fronts the money. No server, no budget, no App Store.

## What happened

- Brainstorm: compared Google Sheet and Splitwise against a custom app; custom app justified only if session entry stays under 30 s and scope stays small.
- Native iOS distribution (TestFlight, ad-hoc, sideload) rejected: $99/year or expiring builds. PWA chosen.
- Hosting: Cloudflare Workers + D1 chosen over Next.js + Neon and static + Firebase. Supabase free rejected because it pauses after about a week idle, which a weekly group would hit.
- Plan written: 4 phases, about 10 h.

## Decisions

| Decision | Why |
|---|---|
| Running balance derived from raw rows, not stored | Editing an old session stays correct without recalculation code |
| Payer varies per session (user choice over fixed treasurer) | Matches how the group actually pays; costs a settlement suggestion algorithm |
| Shares rounded up to 1,000 VND, surplus to payer | Keeps amounts easy to transfer and the ledger zero-sum |
| One shared PIN checked server-side, public read | No accounts for 12 people; PIN is real because it never reaches the client bundle |
| VietQR via `img.vietqr.io` image | One `<img>` tag; user accepted third-party exposure |
| Client computes balances and stats from one `/api/state` call | Fewer endpoints; data volume is tiny |
| Session id is a UUID from the Worker | Lets session + attendees go in one atomic `DB.batch()` |

## Reflection

- Recommended a fixed treasurer; user picked varying payer. The ledger model absorbed it without extra tables, only the greedy settlement function.
- Told the user a free Cloudflare rate-limit rule would cover PIN brute force. Wrong for `workers.dev`: WAF rules need a custom domain. Plan uses the Workers rate-limit binding instead.
- "Account number only shown on the QR screen" is UI-only. With public read, account numbers are public to anyone with the link. Flagged to the user.

## Next

- User picks the next step: implement, or gate the plan first.
- Phase 4 needs the user's Cloudflare login and PIN choice.
