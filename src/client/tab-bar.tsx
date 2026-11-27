import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cssTimeMs, cssVars } from "./css-vars";
import { Icon, type IconName } from "./icons";
import { navigate } from "./use-hash-route";

export interface Tab {
  href: string;
  key: string;
  label: string;
  icon: IconName;
}

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
  startX: number;
  /** Lens offset in px while it follows the finger. */
  x: number | null;
  /** Tab under the pointer. */
  index: number;
}

// Floating tab bar with a selection lens.
// - At rest the selection is a flat tinted pill in the current tab's slot.
// - While it moves it lifts into a glass bubble and magnifies the tab under it.
// - When it arrives, it settles back to the flat pill.
// A tap sends the lens to the tapped tab in one continuous glide that starts
// on touch-down. Holding and sliding makes it follow the finger; releasing
// opens the tab under it.
export function TabBar({ tabs, activeIndex }: { tabs: Tab[]; activeIndex: number }) {
  const current = Math.max(activeIndex, 0);
  const [press, setPress] = useState<Press | null>(null);
  // The tab chosen on release. The route changes a moment later; until it does,
  // the lens keeps heading there instead of flicking back to the old tab.
  const [released, setReleased] = useState<{ index: number; from: number } | null>(null);
  // The tab the lens last came to rest on.
  const [settledIndex, setSettledIndex] = useState(current);
  // True once the lens has been moved at least once. The landing animation is
  // tied to it, so it does not play when the page first appears.
  const [moved, setMoved] = useState(false);

  const lensIndex = press ? press.index : released && released.from === current ? released.index : current;
  // Lens offset in px while it follows a dragging finger; null otherwise.
  const dragX = press?.x ?? null;
  const following = dragX !== null;
  const traveling = settledIndex !== lensIndex;
  const lifted = press !== null || traveling;

  // When the lens last set off towards a tab. A tap starts the glide on
  // touch-down, so the settle below is timed from here, not from the release.
  const glideStart = useRef(0);
  useEffect(() => {
    glideStart.current = performance.now();
  }, [lensIndex]);

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
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Capture keeps the moves coming even when the finger leaves the bar.
    event.currentTarget.setPointerCapture(event.pointerId);
    setMoved(true);
    // Not a drag yet: the lens glides to the pressed tab at its normal pace.
    setPress({ startX: event.clientX, x: null, index: slotAt(event.currentTarget, event.clientX).index });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!press) return;
    if (press.x === null && Math.abs(event.clientX - press.startX) < DRAG_THRESHOLD) return;
    setPress({ startX: press.startX, ...slotAt(event.currentTarget, event.clientX) });
  };

  const onPointerUp = () => {
    if (!press) return;
    const { index } = press;
    setPress(null);
    setReleased({ index, from: current });
    if (index !== current) navigate(tabs[index].href.slice(1));
  };

  return (
    <nav
      className={`tabbar${lifted ? " lens-lifted" : moved ? " lens-landed" : ""}${following ? " lens-dragging" : ""}`}
      aria-label="Điều hướng chính"
      // Lens position: under the finger while dragging, otherwise on a tab's slot.
      // --copy-x moves the copy of the tabs inside the lens the opposite way by the
      // same distance, so the copy stays lined up with the real tabs beneath it.
      // (Percentages are of each element's own width: the copy spans all the slots.)
      style={cssVars({
        "--lens-x": dragX !== null ? `${dragX}px` : `${lensIndex * 100}%`,
        "--copy-x": dragX !== null ? `${-dragX}px` : `${(-lensIndex * 100) / tabs.length}%`,
      })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setPress(null)}
    >
      {/* The glass body and the lens are siblings, so the lens looks through to the page itself. */}
      <span className="tabbar-glass" aria-hidden="true" />
      <span className="tab-indicator" aria-hidden="true">
        {/* Where the browser cannot bend the real backdrop (WebKit), the lens shows
            this copy of the tabs instead and bends the copy. */}
        <span className="lens-view">
          <span className="lens-bend">
            <span className="lens-frame" />
            <span className="lens-copy">
              {/* The bar's own edge, so it shows and bends inside the lens where the lens bulges past it */}
              <span className="lens-copy-bar" />
              {tabs.map((tab, index) => (
                <span
                  key={tab.key}
                  className="tab"
                  aria-current={index === activeIndex ? "page" : undefined}
                  data-lens={lifted && index === lensIndex ? "" : undefined}
                >
                  <Icon name={tab.icon} />
                  <span>{tab.label}</span>
                </span>
              ))}
            </span>
          </span>
        </span>
      </span>
      {tabs.map((tab, index) => (
        <a
          key={tab.key}
          className="tab"
          href={tab.href}
          draggable={false}
          aria-current={index === activeIndex ? "page" : undefined}
          data-lens={lifted && index === lensIndex ? "" : undefined}
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
