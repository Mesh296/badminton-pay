import type { CSSProperties } from "react";

/** Inline CSS custom properties, e.g. cssVars({ "--i": 3 }). */
export const cssVars = (vars: Record<`--${string}`, string | number>) => vars as CSSProperties;
