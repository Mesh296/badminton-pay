import type { CSSProperties } from "react";
import { parseCssTimeMs } from "./css-time";

/** Inline CSS custom properties, e.g. cssVars({ "--i": 3 }). */
export const cssVars = (vars: Record<`--${string}`, string | number>) => vars as CSSProperties;

/**
 * A timing token from tokens.css (e.g. "--glide"), in milliseconds. 0 when the
 * user asks for reduced motion: the CSS then runs every animation in 0.01 ms,
 * and timers waiting on one must not keep things on screen for the full length.
 */
export function cssTimeMs(name: `--${string}`): number {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return parseCssTimeMs(getComputedStyle(document.documentElement).getPropertyValue(name));
}
