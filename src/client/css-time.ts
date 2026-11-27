// Pure, DOM-free so it can be tested on its own (test/format-and-vietqr.test.ts).

/**
 * A CSS time ("420ms", ".42s") in milliseconds; 0 when it is not one.
 * Both units occur: the production build minifies "420ms" in tokens.css to ".42s".
 */
export function parseCssTimeMs(raw: string): number {
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return 0;
  const unit = raw.trim().toLowerCase();
  return unit.endsWith("ms") ? value : unit.endsWith("s") ? value * 1000 : 0;
}
