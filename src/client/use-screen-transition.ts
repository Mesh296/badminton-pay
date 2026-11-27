import { useEffect, useState } from "react";
import { applyPendingScrollReset } from "./use-hash-route";

/** How a screen change relates the two screens; picks the CSS motion. */
export type NavKind = "push" | "pop" | "tab";

/** Sub-screens sit one level below the tab roots. */
const depth = (route: string[]) => (route[0] === "member" || route[0] === "session" ? 1 : 0);

function kindOf(from: string[], to: string[]): NavKind {
  const delta = depth(to) - depth(from);
  return delta > 0 ? "push" : delta < 0 ? "pop" : "tab";
}

/** Exit duration from the CSS token, so the timing lives in one place (tokens.css). */
function exitMs(): number {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--exit")) || 0;
}

/**
 * Two-step screen change, the way native apps do it: the current screen plays
 * its exit first, and only then is the new screen mounted and played in.
 * `shown` lags the real route by the exit duration; `leaving` is true during
 * that gap.
 */
export function useScreenTransition(route: string[]) {
  const [shown, setShown] = useState<{ route: string[]; kind: NavKind }>({ route, kind: "tab" });
  const routeKey = route.join("/");
  const shownKey = shown.route.join("/");
  const leaving = routeKey !== shownKey;
  const kind = leaving ? kindOf(shown.route, route) : shown.kind;

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => {
      // Scroll only once the old screen is gone, so it does not jump while fading out.
      applyPendingScrollReset();
      setShown({ route, kind });
    }, exitMs());
    return () => window.clearTimeout(timer);
  }, [leaving, route, kind]);

  return { shown: shown.route, shownKey, leaving, kind };
}
