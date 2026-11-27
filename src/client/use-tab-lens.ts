import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { cssTimeMs } from "./css-vars";
import type { Tab } from "./tab-bar";
import { navigate } from "./use-hash-route";

// What the tab bar's lens does, separate from how it looks (tab-bar.tsx):
// where it is heading, whether it is lifted into a bubble, which tab it
// magnifies, and the pointer handling that drives it.

/** Inner padding of the bar, in px. Must match `.tabbar { padding }` in base.css. */
const BAR_PADDING = 6;
/** A press becomes a drag once the pointer has moved this far, in px. */
const DRAG_THRESHOLD = 8;
/**
 * The bubble starts shrinking back to the flat pill this far into its glide.
 * Late enough that a tap shows the glass bending the tabs it passes over for
 * nearly the whole trip (the glide starts slowly, so an early landing hid it),
 * early enough that the squeeze plays as it arrives instead of after a stop.
 */
const SETTLE_AT = 0.85;

/** Delay before settling, from the glide duration in tokens.css. */
function settleDelayMs(): number {
  return cssTimeMs("--glide") * SETTLE_AT;
}

/** A pointer that is down on the bar. `x` is null until it has moved enough to count as a drag. */
interface Press {
  /** The finger being followed; other fingers on the bar are ignored. */
  pointerId: number;
  startX: number;
  /** Lens offset in px while it follows the finger. */
  x: number | null;
  /** Tab under the pointer. */
  index: number;
}

/**
 * Lens state for a tab bar with these tabs, the current one being activeIndex.
 * `handlers` go on the bar (<nav>).
 */
export function useTabLens(tabs: Tab[], activeIndex: number) {
  const current = Math.max(activeIndex, 0);
  const [press, setPress] = useState<Press | null>(null);
  // The tab chosen on release. The route changes a moment later; until it does,
  // the lens keeps heading there instead of flicking back to the old tab.
  const [released, setReleased] = useState<{ index: number; from: number } | null>(null);
  // The tab the lens last came to rest on.
  const [settledIndex, setSettledIndex] = useState(current);
  // During a tap's glide: false until the lens is halfway, so the tab it left
  // stays magnified until then and the tab it heads to only after (see below).
  const [pastHalf, setPastHalf] = useState(true);
  // Whether the next landing plays the squeeze: only after the lens has gone to
  // another tab. Pressing the current tab and letting go just eases back down;
  // the squeeze starts from full size and would make the bubble jump first.
  // Also false on first paint.
  const [squeeze, setSqueeze] = useState(false);
  // Set when a press was handled here, so the link's own click that follows is not a second navigation.
  const pointerHandled = useRef(false);

  // The release is over once the route has moved on. Left in place it pulled the
  // lens back to the released tab whenever the page later returned to `from`
  // (back button, the add button, saving a session).
  if (released && released.from !== current) setReleased(null);

  const lensIndex = press ? press.index : released && released.from === current ? released.index : current;
  // Lens offset in px while it follows a dragging finger; null otherwise.
  const dragX = press?.x ?? null;
  const following = dragX !== null;
  const traveling = settledIndex !== lensIndex;
  const lifted = press !== null || traveling;
  // The tab seen magnified through the lens: the one under the finger while
  // dragging; on a glide, the one it left, then from halfway the one it heads to.
  // Magnifying the destination at touch-down swelled an icon the lens had not reached.
  const magnifiedIndex = following || pastHalf ? lensIndex : settledIndex;

  // When the lens last set off towards a tab. A tap starts the glide on
  // touch-down, so the settle below is timed from here, not from the release.
  const glideStart = useRef(0);
  useEffect(() => {
    glideStart.current = performance.now();
  }, [lensIndex]);

  useEffect(() => {
    if (pastHalf) return;
    const remaining = cssTimeMs("--glide") / 2 - (performance.now() - glideStart.current);
    const timer = window.setTimeout(() => setPastHalf(true), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [pastHalf, lensIndex]);

  // Once the finger is up and the lens is on its way, settle it part-way
  // through the glide (see SETTLE_AT).
  useEffect(() => {
    if (!traveling || press) return;
    const remaining = settleDelayMs() - (performance.now() - glideStart.current);
    const timer = window.setTimeout(() => setSettledIndex(lensIndex), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [traveling, press, lensIndex]);

  /** Lens offset and nearest tab for a pointer position, clamped to the bar. */
  const slotAt = (bar: HTMLElement, clientX: number) => {
    const rect = bar.getBoundingClientRect();
    const slot = (rect.width - BAR_PADDING * 2) / tabs.length;
    const maxX = slot * (tabs.length - 1);
    const x = Math.min(maxX, Math.max(0, clientX - rect.left - BAR_PADDING - slot / 2));
    return { x, index: Math.round(x / slot) };
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (press || (event.pointerType === "mouse" && event.button !== 0)) return;
    // Capture keeps the moves coming even when the finger leaves the bar.
    event.currentTarget.setPointerCapture(event.pointerId);
    const { index } = slotAt(event.currentTarget, event.clientX);
    setSqueeze(index !== settledIndex);
    setPastHalf(false);
    // Not a drag yet: the lens glides to the pressed tab at its normal pace.
    setPress({ pointerId: event.pointerId, startX: event.clientX, x: null, index });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (press.x === null && Math.abs(event.clientX - press.startX) < DRAG_THRESHOLD) return;
    const slot = slotAt(event.currentTarget, event.clientX);
    if (slot.index !== settledIndex) setSqueeze(true);
    setPress({ ...press, ...slot });
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!press || event.pointerId !== press.pointerId) return;
    // Read the slot from this event: a last move may not have rendered yet.
    const index = press.x === null ? press.index : slotAt(event.currentTarget, event.clientX).index;
    setPress(null);
    if (index !== current) setReleased({ index, from: current });
    // Always: from one of a tab's inner screens this goes back to the tab's
    // root; on the root itself it changes nothing.
    pointerHandled.current = true;
    navigate(tabs[index].href.slice(1));
  };

  // Taps and drags navigate in onPointerUp; the link's own click would be a
  // second navigation (Safari still clicks the link under pointer capture).
  // Keyboard and assistive-technology activations come without a press and
  // keep the link's normal behaviour.
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (pointerHandled.current) event.preventDefault();
    pointerHandled.current = false;
  };

  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerId === press?.pointerId) setPress(null);
  };

  return {
    lensIndex,
    magnifiedIndex,
    lifted,
    squeeze,
    /** Lens offset in px while it follows a dragging finger; null otherwise. */
    dragX,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick },
  };
}
