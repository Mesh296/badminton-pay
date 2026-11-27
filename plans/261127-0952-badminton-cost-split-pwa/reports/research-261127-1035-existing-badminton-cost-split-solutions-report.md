---
type: research
date: 2026-11-27 10:35 (Asia/Saigon)
plan: plans/261127-0952-badminton-cost-split-pwa
status: complete
---

# Research Report: existing solutions for splitting badminton group costs

## Executive Summary

Existing tools cover this problem. Closest match: **Sport Share** (free Vietnamese web app: attendance, court split, group-fund debts, VietQR) and **Sporta** (commercial, auto split + per-person QR, join by link without account). Several hobby projects (Badmintool, BSM, Mê Cầu Lông, SMASH) do variations. General bill splitters (Splitwise, Tricount, Splid, Spliit) work but lack VietQR and the "court for all + drinks for some" shortcut.

Honest read: this research should have come before building. Had it, "try Sport Share or Sporta for 2 weeks" was a valid zero-code option. The app in this repo is already built through phase 3 and fits the group's exact rules (varying payer, running balance, shared PIN, own data), so the remaining question is whether to deploy it or switch, not whether to build.

Nothing found invalidates the current design. Three ideas are worth borrowing later; none is needed for first release.

## Research Methodology

- Searches: 5 (WebSearch; Gemini CLI path skipped, `timeout` binary missing on this machine)
- Sources: ~25 result pages, read via search summaries only. Repos and apps were NOT opened or tested.
- Terms: chia tiền cầu lông, Reclub, open source Splitwise alternative, Splitwise free tier limits, MoMo Quỹ nhóm
- Confidence: medium for existence and headline features; low for maintenance status, pricing, exact limits

## Key Findings

### 1. Badminton / sports-group tools (Vietnam)

| Tool | Type | What it does | Notes |
|---|---|---|---|
| [Sport Share](https://github.com/mhtiny3ds-a11y/Sport_share) | Free web app, open source | Schedule, attendance, court split, group-fund debts, VietQR transfer; "no server" | Closest to this project. "No server" suggests data lives on one device or a third-party store; sharing model unverified |
| [Sporta](https://www.sporta.vn/quan-ly-clb) | Commercial platform | After a match: split evenly or deduct from fund, QR with exact amount per person; join via link, no account | Also court booking; pricing unverified |
| [Badmintool](https://github.com/quocgiau217/badmintool) | Open source | Doubles pairing first; split tab: even or by matches played, VietQR per person, mark paid, self check-in | Split is secondary feature |
| [BSM](https://github.com/VuongHuyHoang/BSM_BadmintonSportManager) | Open source | Court + shuttle used + drink surcharge by actual attendance, one-tap attendance | New project |
| [Mê Cầu Lông](https://mecaulong.vercel.app/) | Web app, mobile apps in progress | Host takes attendance, split by who is present, per-person adjust in 5k steps | Also "find a game" |
| [CLB Cầu Lông / SMASH](https://github.com/o936315009/CLB-CAU-LONG) | Open source | Monthly-fee clubs: court cost by sessions per month, member wallet balance, fund in/out | Prepaid wallet model |

### 2. Regional club apps

- [Reclub](https://pickleball.reclub.co/faq): RSVP, waitlist, check-in, mark paid. No in-app payments yet; hosts compute splits by hand in the event text. Pickleball-focused; badminton support not confirmed.

### 3. General bill splitters

| App | Account needed | Free limits | Fit here |
|---|---|---|---|
| Splitwise | Yes | Daily expense cap on free tier (sources disagree: 2-5/day), ads | Poor: 12 sign-ups, cap, no VietQR |
| Tricount | Reported no (share link) | Reported fully free, no cap | OK for generic splits, no VietQR |
| Splid | No (group code) | Free, no cap | Same |
| [Spliit](https://opencollective.com/spliit) | No | Open source (MIT), self-host, PWA | Best generic open-source reference |
| [SplitPro](https://github.com/phof/split-pro) | Yes | Open source (MIT), self-host | Heavier |

Splitwise numbers come from SEO blogs; verify on the vendor site before quoting.

### 4. Wallet "group fund"

- [MoMo Quỹ Nhóm](https://www.momo.vn/quy-nhom): pooled prepaid fund, contribution reminders, only the owner withdraws, members see balance. Up to 200 members per fund. Everyone needs a verified MoMo account. It pools money; it does not compute uneven per-session shares.

## Comparative Analysis

| Need | This app | Sport Share | Sporta | Splid/Tricount | MoMo Quỹ nhóm |
|---|---|---|---|---|---|
| Court for attendees + drinks for drinkers in one form | Yes | Court yes, drinks unverified | Even split; drinks unverified | Two separate expenses | No |
| Running balance across sessions | Yes | Yes (fund debts) | Fund option | Yes | Fund balance only |
| Payer varies per session | Yes | Unverified | Unverified | Yes | No (single owner) |
| VietQR with exact amount | Yes | Yes | Yes | No | In-wallet transfer |
| No account for members | Yes | Unverified | Yes | Yes | No |
| Own the data, $0 | Yes | Likely | No / unknown | No | No |
| Zero build effort | No (already built) | Yes | Yes | Yes | Yes |

## Ideas worth borrowing (not in current scope)

| Idea | Seen in | Value | Cost | Verdict |
|---|---|---|---|---|
| Prepaid balance (members top up, sessions deduct) | SMASH, MoMo, Sporta | Fewer small transfers | Zero: current ledger already allows a transfer before any debt, which leaves a positive balance | Document it; build nothing |
| Per-person manual adjustment | Mê Cầu Lông | Covers guests, late arrivals | Medium: new field, validation, UI | Later, only if the group asks |
| Self check-in before the session | Badmintool, Reclub | Payer enters amounts only | Medium-high: unauthenticated write path | Skip for now |
| Split by matches or hours | Badmintool | Fairness for partial play | High | Already out of scope |

Own suggestion, not from sources: a "copy summary" button that produces a text block (who owes what + app link) to paste into the group's Zalo chat. Cheap, and matches how the group already communicates.

## Recommendations

1. Keep the current build; finish review fixes and deploy (phase 4). It is done, tested, and matches the agreed rules.
2. If the user prefers zero maintenance, trial Sport Share or Sporta with the group for 2 sessions before deploying. Check first: how data is shared between phones, whether drinks can be split to a subset, whether the payer can vary.
3. Add the prepaid-balance usage note to the README once deployed.
4. Revisit "copy summary" and per-person adjustment after 3-4 real sessions.

## Resources

- Sport Share: https://github.com/mhtiny3ds-a11y/Sport_share
- Badmintool: https://github.com/quocgiau217/badmintool
- BSM: https://github.com/VuongHuyHoang/BSM_BadmintonSportManager
- CLB Cầu Lông (SMASH): https://github.com/o936315009/CLB-CAU-LONG , demo https://o936315009.github.io/laptri/
- Mê Cầu Lông: https://mecaulong.vercel.app/
- Sporta: https://www.sporta.vn/quan-ly-clb
- Reclub FAQ: https://pickleball.reclub.co/faq
- MoMo Quỹ Nhóm: https://www.momo.vn/quy-nhom
- Spliit: https://opencollective.com/spliit ; SplitPro: https://github.com/phof/split-pro
- Splitwise alternatives/pricing (blogs): https://getfinny.app/blog/best-splitwise-alternatives-2026 , https://getfinny.app/blog/splitwise-pricing-2026

## Unresolved questions

- Sport Share: where is data stored and how do 12 phones see the same ledger? Can drinks go to a subset? Varying payer?
- Sporta: pricing, and whether a private group can use the split without booking courts through it.
- Maintenance status and licence of each GitHub project (not opened).
- ZaloPay bill-split feature: no source found.
