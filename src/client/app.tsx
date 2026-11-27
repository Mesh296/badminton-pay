import { useEffect, useMemo, useState, type ReactNode } from "react";
import { computeBalances, suggestTransfers } from "../shared/money";
import { AppContext, type AppContextValue } from "./app-context";
import { GlassRefractionFilter } from "./glass-refraction-filter";
import { Icon } from "./icons";
import { ActivityFeed } from "./screens/activity-feed";
import { Balances } from "./screens/balances";
import { HistoryStats } from "./screens/history-stats";
import { MemberDetail } from "./screens/member-detail";
import { PaymentReturnPrompt } from "./screens/payment-return-prompt";
import { Settings } from "./screens/members";
import { SessionForm } from "./screens/session-form";
import { TransferForm } from "./screens/transfer-form";
import { TabBar, type Tab } from "./tab-bar";
import { useAppState } from "./use-app-state";
import { goBack, useHashRoute } from "./use-hash-route";
import { useScreenTransition } from "./use-screen-transition";
import { useUnseenActivity } from "./use-unseen-activity";
import { resyncPush } from "./push-notifications";
import { useWrite } from "./use-write";

const TABS: Tab[] = [
  { href: "#/", key: "", label: "Số dư", icon: "wallet" },
  { href: "#/history", key: "history", label: "Lịch sử", icon: "history" },
  { href: "#/notifications", key: "notifications", label: "Thông báo", icon: "bell" },
  { href: "#/members", key: "members", label: "Cài đặt", icon: "settings" },
];

const NOTICE_MS = 6000;

// Picks the screen and its title for the current hash route.
function screenFor(route: string[]): { title: string; body: ReactNode; tab: string; sub: boolean } {
  const [section, param] = route;
  if (section === "member") return { title: "Chi tiết", body: <MemberDetail id={Number(param)} />, tab: "", sub: true };
  if (section === "session") {
    const isNew = param === "new";
    return {
      title: isNew ? "Buổi mới" : "Sửa buổi",
      body: <SessionForm sessionId={isNew ? undefined : param} />,
      tab: isNew ? "" : "history",
      sub: true,
    };
  }
  if (section === "transfer") {
    return { title: "Chuyển khoản", body: <TransferForm id={Number(param)} />, tab: "history", sub: true };
  }
  if (section === "history") return { title: "Lịch sử", body: <HistoryStats />, tab: "history", sub: false };
  if (section === "members") return { title: "Cài đặt", body: <Settings />, tab: "members", sub: false };
  if (section === "notifications") return { title: "Thông báo", body: <ActivityFeed />, tab: "notifications", sub: false };
  return { title: "Tiền cầu lông", body: <Balances />, tab: "", sub: false };
}

export default function App() {
  // The Worker sends a failed or cancelled Google sign-in back with ?login=failed.
  const [notice, setNotice] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).has("login") ? "Đăng nhập không được. Thử lại." : null,
  );
  // Drop that marker so a reload does not repeat the notice.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
    }
  }, []);
  const route = useHashRoute();
  const { state, loadFailed, reload } = useAppState(setNotice);

  // Notices dismiss themselves.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const write = useWrite(reload, setNotice);

  // A member's phone with notifications on re-registers once per opening.
  const memberId = state?.me?.memberId ?? null;
  useEffect(() => {
    if (memberId !== null) void resyncPush();
  }, [memberId]);

  const context = useMemo<AppContextValue | null>(() => {
    if (!state) return null;
    const balances = computeBalances(state.sessions, state.transfers);
    const names = new Map(state.members.map((m) => [m.id, m.name]));
    return {
      state,
      balances,
      suggestions: suggestTransfers(balances),
      nameOf: (id) => names.get(id) ?? "?",
      me: state.me,
      canAdd: Boolean(state.me && (state.me.admin || state.me.memberId !== null)),
      actsAs: (id) => Boolean(state.me && (state.me.admin || state.me.memberId === id)),
      write,
    };
  }, [state, write]);

  const transition = useScreenTransition(route);
  // `target` is where navigation is heading: the tab bar reacts to it at once.
  // `screen` is what is on screen now; it trails by the exit animation.
  const target = screenFor(route);
  const screen = screenFor(transition.shown);
  const tabIndex = TABS.findIndex((tab) => tab.key === target.tab);
  // Marked seen once the feed is on screen, after it has read what was new.
  const news = useUnseenActivity(state, screen.tab === "notifications" && !screen.sub);
  const tabs = useMemo(() => TABS.map((tab) => (tab.key === "notifications" ? { ...tab, badge: news } : tab)), [news]);

  return (
    <>
      <header className="topbar">
        {/* Back only on sub-screens; tab roots are reached from the tab bar. */}
        {screen.sub && (
          <button type="button" className="round-button" onClick={goBack} aria-label="Quay lại">
            <Icon name="chevron-left" />
          </button>
        )}
        {/* key restarts the title's fade when the screen changes */}
        <h1 key={screen.title}>{screen.title}</h1>
      </header>

      <main>
        {context ? (
          <AppContext.Provider value={context}>
            {/* key remounts the screen on every route change: fields reset and the enter animation replays */}
            <div
              className={transition.leaving ? "screen leaving" : "screen"}
              data-nav={transition.kind}
              key={transition.shownKey}
            >
              {screen.body}
            </div>
            <PaymentReturnPrompt />
          </AppContext.Provider>
        ) : loadFailed ? (
          <div className="empty">
            <p>Không tải được</p>
            <button type="button" className="button" onClick={() => void reload()}>
              Thử lại
            </button>
          </div>
        ) : (
          <p className="empty">Đang tải…</p>
        )}
      </main>

      {/* The one primary action of the app, available from every tab to those who may add a session */}
      {!target.sub && context?.canAdd && context.state.members.length > 0 && (
        <a className="fab" href="#/session/new" aria-label="Buổi mới">
          <Icon name="plus" />
        </a>
      )}

      <TabBar tabs={tabs} activeIndex={tabIndex} />

      {/* Fixed under the top bar so it is seen wherever the page is scrolled; dismisses itself, or on tap. */}
      {notice && (
        <div className="toast" role="alert" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      <GlassRefractionFilter />
    </>
  );
}
