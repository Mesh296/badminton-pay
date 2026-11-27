---
type: research
date: 2026-11-27 10:41 (Asia/Saigon)
plan: plans/261127-0952-badminton-cost-split-pwa
status: complete, applied
---

# Research Report: iPhone "Liquid Glass" look on the web

> Update 2026-11-27 10:58: the owner rejected the green glass look ("xấu quá") and supplied an Apple-style reference. The theme now is light only: `#f5f5f7` canvas, flat white 28px cards with no shadows or gradients, `#1d1d1f` type, one blue (`#0066cc` links, `#0071e3` filled primary), pill buttons and inputs, plain-text balances. Frosted blur survives only on navigation chrome (top bar, tab bar, save bar, toast), which is what the reference itself prescribes. The findings below on what glass can and cannot do on iPhone, and the motion decisions, still hold; the palette and "glass on cards" decisions in the table are superseded.

## Executive Summary

Apple's Liquid Glass (iOS 26) cannot be reproduced fully in Safari. The part that works everywhere is frosted glass: translucent fill + `backdrop-filter: blur() saturate()` + bright hairline edge + soft shadow. The refraction/lensing part needs SVG filters inside `backdrop-filter`, which only Chromium renders; Safari and iOS render nothing for it and can drop the whole declaration. Since the target is iPhone, the design is blur-only glass that looks complete by itself, with no refraction layer.

Glass is costly and hurts contrast when overused. Applied rule: live blur only on the few elements that float over content (top bar, tab bar, save bar, dialog, toast); every card and list is a translucent surface without blur. Fallbacks for Reduce Transparency, Reduce Motion, and missing `backdrop-filter`.

Motion: View Transitions API (same-document) is supported on iOS Safari 18+, so screen changes use it with a no-animation fallback. Spring feel comes from CSS `linear()` easing behind `@supports`.

## Research Methodology

- Searches: 3 (WebSearch; Gemini CLI path skipped, `timeout` binary missing)
- Sources: third-party tutorials and blogs, caniuse, Chrome developer blog, NN/g, web.dev. No Apple documentation on a web implementation exists.
- Also consulted: `ui-ux-pro-max` skill (style database entries "Liquid Glass" and "Glassmorphism", UX rule list) and `ui-styling` skill (tokens, dark mode, accessibility practices).
- Confidence: high on browser support facts; medium on performance thresholds (no authoritative benchmark found)

## Key Findings

### 1. What works on iPhone

| Technique | iOS Safari | Used |
|---|---|---|
| `backdrop-filter: blur() saturate()` (+ `-webkit-` prefix) | Yes | Yes |
| Translucent fill, 1px light border, inset top highlight, drop shadow | Yes | Yes |
| SVG displacement filter in `backdrop-filter` (refraction) | No: renders nothing; an invalid part can void the whole value | No |
| `@supports` to detect the SVG path | Unreliable in Safari (reports success, renders nothing) | Not relied on |
| WebGL shader over live HTML | Possible, heavy | No |

### 2. Accessibility

- Contrast is the main failure of glass UIs; check text against the worst backdrop. Automated checkers ignore what is behind a `backdrop-filter`.
- `@media (prefers-reduced-transparency: reduce)`: switch to solid surfaces (Apple does the same natively).
- `@media (prefers-reduced-motion: reduce)`: remove movement.
- NN/g: use blur to separate layers, not as decoration.

### 3. Performance

- `backdrop-filter` re-filters the region behind an element on every frame that region changes. An animated background under glass repaints every blur layer each frame.
- Guidance from sources: keep blur modest, keep simultaneous blur layers to 2-3 on mobile. Numbers are rules of thumb, not measured.

### 4. Motion

- Same-document View Transitions: iOS Safari 18.0+. Nested view-transition groups are not supported in Safari; flat named groups are fine.
- iOS back-swipe already animates the page, so an app-level transition on that navigation would play twice.

## What was applied in this repo

| Decision | Reason |
|---|---|
| Blur-only glass, no refraction | Refraction does not render on iPhone |
| `.glass` (live blur) on top bar, tab bar, save bar, dialog, toast only; `.surface` (no blur) for cards and lists | Caps blur layers; lists scroll without re-filtering |
| Static colored radial gradients behind the app | Gives glass something to pick up; static so blurs are not recomputed each frame |
| Tab bar and save bar use a denser fill than other glass | Labels stay readable over any content |
| QR code on a solid white tile in both themes | Bank apps must be able to scan it |
| Tokens in one file; Reduce Transparency, no-`backdrop-filter`, dark mode all handled by overriding tokens | One place to tune |
| Floating capsule tab bar with icon + label and a sliding indicator | iOS 26 idiom; indicator is a shared element in the view transition |
| View transitions: slide for push/pop, fade-through for tabs; only for in-app navigation | Spatial continuity without double animation on back-swipe |
| Spring easing via `linear()` behind `@supports`, cubic-bezier fallback | Natural feel where supported |
| Only `transform` and `opacity` animated; press feedback 140 ms; first-load stagger capped at 10 rows | No layout work during animation |
| Plain CSS kept; Tailwind + shadcn (the `ui-styling` skill's default stack) not adopted | Rewriting 5 screens for no visual gain; the skill's token, dark-mode and accessibility practices were applied instead |
| `ui-ux-pro-max --design-system` output not used for palette/fonts | It returned a landing-page pattern (blue/orange, Calistoga); system font and the existing green brand fit an iOS utility better |

## Common Pitfalls

- Stacking glass on glass: contrast and frame rate both drop.
- Putting `url(#svg)` and `blur()` in one unguarded `backdrop-filter`: Safari can drop the blur too.
- Animating the backdrop under glass.
- Forgetting `-webkit-backdrop-filter`.
- Trusting contrast checkers on translucent surfaces.

## Next steps

1. Check on a real iPhone: scroll smoothness on the session form (save bar + tab bar + top bar = 3 blur layers), and legibility outdoors.
2. If scrolling stutters on older iPhones, drop blur on the save bar first (it already uses a dense fill).
3. Turn on Reduce Transparency and Reduce Motion in iOS settings once to confirm both fallbacks.

## Resources

- Liquid Glass on the Web, 6 ways: https://dev.to/devyatov/liquid-glass-on-the-web-6-ways-to-build-it-with-css-and-svg-3m07
- LogRocket, Liquid Glass with CSS and SVG: https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/
- Recreating Liquid Glass, physics and pitfalls: https://emit-solution.com/en/blog/recreate-apple-liquid-glass-css
- iOS 26 glassy effect tutorial: https://therobbiedavis.com/how-to-recreate-the-ios-26-glassy-effect-with-css/
- NN/g on glassmorphism: https://www.nngroup.com/articles/glassmorphism/
- web.dev backdrop-filter: https://web.dev/articles/backdrop-filter.md.txt
- Glassmorphism and accessibility: https://axesslab.com/?p=5111
- caniuse, View Transitions (single-document): https://caniuse.com/view-transitions
- Chrome, view transitions 2025 update: https://developer.chrome.com/blog/view-transitions-in-2025

## Unresolved questions

- Real-device frame rate with 3 blur layers on older iPhones: not measurable here.
- Whether the owner wants Tailwind/shadcn anyway for future screens.
