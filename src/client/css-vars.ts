import type { CSSProperties } from "react";
import { parseCssTimeMs } from "./css-time";

/** Inline CSS custom properties, e.g. cssVars({ "--i": 3 }). */
export const cssVars = (vars: Record<`--${string}`, string | number>) => vars as CSSProperties;

/** A timing token from tokens.css (e.g. "--glide"), in milliseconds. */
export const cssTimeMs = (name: `--${string}`) =>
  parseCssTimeMs(getComputedStyle(document.documentElement).getPropertyValue(name));
