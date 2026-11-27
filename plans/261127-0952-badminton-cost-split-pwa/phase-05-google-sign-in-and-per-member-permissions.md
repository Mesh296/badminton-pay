---
phase: 5
title: Google sign-in and per-member permissions
status: in-progress
priority: P1
dependencies:
  - 3
effort: ''
---

# Phase 5: Google sign-in and per-member permissions

## Overview

Replaces the shared PIN. Decided by the user on 2026-11-27 after asking what stops member A from marking member B's debt as paid: with one PIN, nothing did. Each member now signs in once with Google; the app knows who is acting and limits what they may change. Runs before phase 4 (deploy), which now sets the Google and session secrets instead of the PIN.

## Requirements

- Sign in once with Google; stay signed in for a year on that device.
- Reads stay public (no sign-in to look).
- Sessions: only the payer of a session, or an admin, may enter, edit or delete it. A member cannot enter a session with another payer or hand one over.
- Transfers: only the receiver, or an admin, may record or undo one. The payer sees the QR and "waiting for X to confirm".
- Members: only admins add or edit, including linking a Google email to a member. Admins are listed in `ADMIN_EMAILS`.
- Member emails are sent to admins only.
- Out of scope this round: action log, members editing their own bank details, sliding session renewal.

## Architecture

- `GET /api/auth/login` → Google (authorization-code flow, scope `openid email`) → `GET /api/auth/callback` → signed cookie → app. Redirects only, no popup or Google script.
- Cookie `session` = base64url(JSON {email, exp}) + HMAC-SHA256 with `SESSION_SECRET`; HttpOnly, SameSite=Lax, Secure on https, one year. Stateless: rotating the secret signs everyone out.
- Each request: cookie → email → `members.email` → `{ email, memberId, admin }`. Non-GET requests without it get 401; routes return 403 for what the account may not change.
- `/api/state` adds `me`; the client hides controls the account cannot use. The server remains the authority.

## Related Code Files

- Create: `src/worker/auth-session.ts`, `src/worker/routes-auth.ts`, `migrations/0002_member_email.sql`, `src/client/account-card.tsx`, `src/client/use-write.ts`, `test/auth-and-permissions.test.ts`
- Modify: `src/worker/index.ts`, `routes-members.ts`, `routes-sessions.ts`, `routes-transfers.ts`, `load-state.ts`, `validation.ts`, `src/shared/types.ts`, client screens, `wrangler.jsonc`, `vitest.config.ts`, `.dev.vars.example`, docs
- Delete: `src/worker/pin-auth.ts`, `src/client/pin-prompt.tsx`, `src/client/use-pin-write.ts`, the `PIN_LIMITER` binding

## Success Criteria

- [x] Visitor writes return 401; forged, tampered and expired cookies are rejected
- [x] Member can enter and edit only sessions they paid for; cannot reassign the payer
- [x] Only the receiver or an admin can record or undo a transfer
- [x] Only admins manage members; one email per member; emails hidden from non-admins
- [x] Callback rejects a wrong state, another app's token, another issuer, an unverified email
- [x] UI shows each role only the controls it may use (headless walkthrough: visitor, member, admin)
- [ ] Real Google sign-in works with the user's OAuth client (needs the user's Google Cloud project)
- [ ] Sign-in works inside the iPhone home-screen app (see risk)

## Risk Assessment

- Google sign-in inside an iPhone home-screen app is unverified: reports are mixed, including Google's `disallowed_useragent` block for embedded browsers. Must be tested on a real iPhone after deploy. Fallback if blocked: members use the app in Safari (same link, sign-in works there), or switch to per-member codes.
- OAuth app left in "Testing" may limit who can sign in; publish it if members are refused.
- A stolen cookie is valid for up to a year; rotate `SESSION_SECRET` to sign everyone out.
