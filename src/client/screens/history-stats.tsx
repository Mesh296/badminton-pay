import { useState } from "react";
import type { Session, Transfer } from "../../shared/types";
import { useApp } from "../app-context";
import { formatDate, formatDayMonth, formatMoney } from "../format";
import { Icon } from "../icons";
import { cssVars } from "../css-vars";
import { Stats } from "./stats";

type Entry = { date: string; session: Session } | { date: string; transfer: Transfer };

const TABS = [
  { key: "history", label: "Lịch sử" },
  { key: "stats", label: "Thống kê" },
] as const;

// Past sessions and transfers, and simple totals per month and per member.
// Who changed what is in the Thông báo tab.
export function HistoryStats() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("history");
  const index = TABS.findIndex((t) => t.key === tab);
  return (
    <>
      <div className="segmented" role="tablist" style={cssVars({ "--seg-index": index, "--seg-count": TABS.length })}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "history" ? <History /> : <Stats />}
    </>
  );
}

function History() {
  const { state, nameOf } = useApp();
  const entries: Entry[] = [
    ...state.sessions.map((session) => ({ date: session.date, session })),
    ...state.transfers.map((transfer) => ({ date: transfer.date, transfer })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (entries.length === 0) return <p className="empty">Chưa có buổi nào</p>;

  return (
    <ul className="list surface">
      {entries.map((entry) =>
        "session" in entry ? (
          <li key={`s-${entry.session.id}`}>
            <a className="list-row" href={`#/session/${entry.session.id}`}>
              <span className="avatar symbol" aria-hidden="true">
                <Icon name="calendar" className="small" />
              </span>
              <span className="row-main">
                <span className="row-title">{formatDate(entry.date)}</span>
                <span className="row-sub">
                  {[
                    state.courts.find((c) => c.id === entry.session.courtId)?.name,
                    entry.session.startTime && `${entry.session.startTime}–${entry.session.endTime}`,
                    `${entry.session.attendees.length} người`,
                    `${nameOf(entry.session.payerId)} ứng`,
                    entry.session.note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="row-end">{formatMoney(entry.session.courtAmount + entry.session.drinkAmount)}</span>
            </a>
          </li>
        ) : (
          <li key={`t-${entry.transfer.id}`}>
            {/* Opens the transfer, where its receiver or an admin can fix or delete it */}
            <a className="list-row" href={`#/transfer/${entry.transfer.id}`}>
              <span className="avatar symbol" aria-hidden="true">
                <Icon name="transfer" className="small" />
              </span>
              <span className="row-main">
                <span className="row-title">
                  {nameOf(entry.transfer.fromId)} → {nameOf(entry.transfer.toId)}
                </span>
                <span className="row-sub">Chuyển khoản · {formatDayMonth(entry.date)}</span>
              </span>
              <span className="row-end">{formatMoney(entry.transfer.amount)}</span>
            </a>
          </li>
        ),
      )}
    </ul>
  );
}
