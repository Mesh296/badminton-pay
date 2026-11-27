import { useEffect, useState } from "react";

// Minimal hash router: "#/member/3" -> ["member", "3"]. Hash navigation keeps
// browser history, so the iOS swipe-back gesture works. Screen-change motion
// lives in use-screen-transition.ts and motion.css.

const parse = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);

// Each history entry made inside the app is tagged with its position, stored
// in history.state. That tells a fresh entry (scroll to top) from a revisited
// one (leave scroll alone), and tells the back button whether there is an
// in-app screen to go back to.
let position = 0;
// Set when a fresh entry is opened; applied by the screen transition once the
// old screen has left, so the page does not jump while it is still fading out.
let scrollResetPending = false;

export function applyPendingScrollReset(): void {
  if (scrollResetPending) window.scrollTo(0, 0);
  scrollResetPending = false;
}

function readPosition(): number | null {
  const state = window.history.state as { position?: unknown } | null;
  return typeof state?.position === "number" ? state.position : null;
}

/** Tags the current entry if it is new; returns true when it was new. */
function tagEntry(): boolean {
  const known = readPosition();
  if (known !== null) {
    position = known;
    return false;
  }
  position += 1;
  window.history.replaceState({ position }, "");
  return true;
}

export function useHashRoute(): string[] {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    // First entry of this visit: position 0, unless a reload kept an earlier tag.
    const known = readPosition();
    if (known === null) window.history.replaceState({ position: 0 }, "");
    position = known ?? 0;

    const onChange = () => {
      scrollResetPending = tagEntry();
      setRoute(parse());
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

/** In-app back button. Goes home when this is the first in-app screen (deep link). */
export function goBack(): void {
  if (position > 0) window.history.back();
  else navigate("/");
}
