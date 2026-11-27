---
phase: 4
title: "Deploy and Device Verification"
status: pending
effort: "1h"
priority: P1
dependencies: [1, 2, 3]
---

# Phase 4: Deploy and Device Verification

## Overview

> Target changed on 2026-11-27 from Cloudflare to the user's VPS (Ubuntu + Docker, no domain yet). Steps to follow are in `docs/deployment-guide.md`: install Docker, point a domain at the VPS, create the Google OAuth client, fill `.env`, `docker compose up -d --build`. The wrangler steps below apply only if deploying to Cloudflare instead. Verified locally: image build, Compose stack with Caddy, backup and restore, data surviving a container recreate. Not verified: real domain + certificate, real Google sign-in, iPhone. Update, same day: the VPS is on Oracle Cloud, only port 22 is reachable and the user cannot change its Security List (owner offline). Decision: deploy to Cloudflare now (`docs/deployment-guide-cloudflare.md`, the wrangler steps below), move to the VPS once ports 80/443 are opened. The D1-to-SQLite move is documented and was tried locally with a real D1 export.

Create the production D1 database, set the sign-in secrets, deploy the Worker, verify on a real iPhone, and write the short docs the group and future maintainer need.

## Requirements

- Functional: app reachable at a `workers.dev` URL; production data starts empty; members are added through the app.
- Non-functional: $0/month on Cloudflare free tier; secrets never committed; a documented way to back up and roll back.

## User Actions Required

- Have a free Cloudflare account and run `wrangler login`.
- Create a Google OAuth client (Web application) with redirect URI `https://<app>/api/auth/callback`, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_EMAILS` with `wrangler secret put`.
- Test on an iPhone, including a QR scan with a bank app.

## Related Code Files

- Modify: `wrangler.jsonc` (real `database_id`, final Worker name)
- Modify: `README.md`
- Create: `docs/deployment-guide.md`

## Implementation Steps

1. Pick a Worker name that is not guessable, e.g. `bpay-` plus 6 random characters; set it in `wrangler.jsonc`.
2. `wrangler d1 create badminton-pay`; copy the returned id into `wrangler.jsonc`.
3. `npm run db:migrate:remote`.
4. `wrangler secret put` for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_EMAILS`.
5. `npm run deploy`; note the URL.
6. Checks against production:
   - `curl -X POST <url>/api/members -d '{}'` → 401
   - `GET <url>/robots.txt` disallows all
7. iPhone checks: open in Safari, Add to Home Screen, launch from the icon (full-screen), sign in with Google (inside the home-screen app, not only Safari), add members with their emails, enter a real session, open a debtor's QR and scan it with a bank app (confirm payee, amount, memo; no need to send money).
8. `README.md`: what the app is, local dev, test, deploy commands.
9. `docs/deployment-guide.md`: first deploy, signing everyone out / changing admins, backup (`wrangler d1 export badminton-pay --remote --output backup.sql`), rollback (`wrangler rollback`, D1 Time Travel restore), free-tier limits.
10. Add to the README a short Vietnamese message for the group chat: the link, how to Add to Home Screen, that signing in with Google is needed only to edit and must be entered once in the installed app.

## Success Criteria

- [ ] Production URL loads on iPhone and opens full-screen from the home screen icon
- [ ] Write without sign-in returns 401 in production
- [ ] Google sign-in completes inside the iPhone home-screen app
- [ ] Bank app shows the correct payee, amount, and memo from the QR
- [ ] One real session entered and balances look right to the user
- [ ] No secret value (Google client secret, session secret) appears in git history
- [ ] README and deployment guide match the commands actually used

## Risk Assessment

- Bad deploy: `wrangler rollback` restores the previous Worker version.
- Data mistake: sessions and transfers are editable and deletable; D1 Time Travel covers accidental mass changes.
- Stolen session: rotate `SESSION_SECRET`; every device signs in again.
- Link shared outside the group: data is readable by design; switch `GET /api/state` to require sign-in if that becomes a problem.
