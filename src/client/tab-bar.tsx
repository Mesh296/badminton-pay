import { cssVars } from "./css-vars";
import { Icon, type IconName } from "./icons";
import { useTabLens } from "./use-tab-lens";

export interface Tab {
  href: string;
  key: string;
  label: string;
  icon: IconName;
}

// Floating tab bar with a selection lens.
// - At rest the selection is a flat tinted pill in the current tab's slot.
// - While it moves it lifts into a glass bubble and magnifies the tab under it.
// - When it arrives, it settles back to the flat pill.
// A tap sends the lens to the tapped tab in one continuous glide that starts
// on touch-down. Holding and sliding makes it follow the finger; releasing
// opens the tab under it.
export function TabBar({ tabs, activeIndex }: { tabs: Tab[]; activeIndex: number }) {
  const { lensIndex, magnifiedIndex, lifted, squeeze, dragX, handlers } = useTabLens(tabs, activeIndex);

  return (
    <nav
      className={`tabbar${lifted ? " lens-lifted" : squeeze ? " lens-landed" : ""}${dragX !== null ? " lens-dragging" : ""}`}
      aria-label="Điều hướng chính"
      // Lens position: under the finger while dragging, otherwise on a tab's slot.
      // --copy-x moves the copy of the tabs inside the lens the opposite way by the
      // same distance, so the copy stays lined up with the real tabs beneath it.
      // (Percentages are of each element's own width: the copy spans all the slots.)
      style={cssVars({
        "--lens-x": dragX !== null ? `${dragX}px` : `${lensIndex * 100}%`,
        "--copy-x": dragX !== null ? `${-dragX}px` : `${(-lensIndex * 100) / tabs.length}%`,
      })}
      {...handlers}
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
                  data-lens={lifted && index === magnifiedIndex ? "" : undefined}
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
          data-lens={lifted && index === magnifiedIndex ? "" : undefined}
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
