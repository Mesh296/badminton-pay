import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cssVars } from "./css-vars";
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
/** If the lens never reports the end of its travel, settle it after this long. */
const SETTLE_FALLBACK_MS = 900;

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
  const lens = useRef<HTMLSpanElement>(null);

  const lensIndex = press ? press.index : released && released.from === current ? released.index : current;
  const following = press !== null && press.x !== null;
  const traveling = settledIndex !== lensIndex;
  const lifted = press !== null || traveling;

  // The travel normally ends with the lens's transitionend. This timer covers
  // the cases where that event never comes (e.g. the transition was cancelled).
  useEffect(() => {
    if (!traveling || press) return;
    const timer = window.setTimeout(() => setSettledIndex(lensIndex), SETTLE_FALLBACK_MS);
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
    // Already resting on the chosen tab (held until it arrived): no travel is
    // left to wait for, so settle now.
    const gliding = lens.current?.getAnimations().some((a) => (a as CSSTransition).transitionProperty === "translate");
    if (!gliding) setSettledIndex(index);
    if (index !== current) navigate(tabs[index].href.slice(1));
  };

  return (
    <nav
      className={`tabbar${lifted ? " lens-lifted" : ""}${following ? " lens-dragging" : ""}`}
      aria-label="Điều hướng chính"
      // Lens position: under the finger while dragging, otherwise on a tab's slot.
      style={cssVars({ "--lens-x": following ? `${press.x}px` : `${lensIndex * 100}%` })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setPress(null)}
    >
      {/* The glass body and the lens are siblings, so the lens looks through to the page itself. */}
      <span className="tabbar-glass" aria-hidden="true" />
      <span
        ref={lens}
        className="tab-indicator"
        aria-hidden="true"
        onTransitionEnd={(event) => {
          if (event.propertyName === "translate" && !press) setSettledIndex(lensIndex);
        }}
      />
      {tabs.map((tab, index) => (
        <a
          key={tab.key}
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
