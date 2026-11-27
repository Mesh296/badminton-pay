import { useState } from "react";
import type { Session, Transfer } from "../../shared/types";
import { useApp } from "../app-context";
import { byName, formatDate, formatDayMonth, formatMoney, formatMonth } from "../format";
import { Icon } from "../icons";
import { cssVars } from "../css-vars";

type Entry = { date: string; session: Session } | { date: string; transfer: Transfer };

// Past sessions and transfers, plus simple totals per month and per member.
export function HistoryStats() {
  const [tab, setTab] = useState<"history" | "stats">("history");
  return (
    <>
      <div className="segmented" role="tablist" style={cssVars({ "--seg-index": tab === "history" ? 0 : 1 })}>
        <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>
          Lịch sử
        </button>
        <button type="button" role="tab" aria-selected={tab === "stats"} onClick={() => setTab("stats")}>
          Thống kê
        </button>
      </div>
      {tab === "history" ? <History /> : <Stats />}
    </>
  );
}

function History() {
  const { state, nameOf, write, actsAs } = useApp();
  const entries: Entry[] = [
    ...state.sessions.map((session) => ({ date: session.date, session })),
    ...state.transfers.map((transfer) => ({ date: transfer.date, transfer })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (entries.length === 0) return <p className="empty">Chưa có buổi nào</p>;

  const undo = (transfer: Transfer) => {
    const line = `${nameOf(transfer.fromId)} → ${nameOf(transfer.toId)} ${formatMoney(transfer.amount)}`;
    if (window.confirm(`Hủy chuyển khoản này?\n${line}`)) void write("DELETE", `/api/transfers/${transfer.id}`);
  };

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
                  {entry.session.attendees.length} người · {nameOf(entry.session.payerId)} ứng
                  {entry.session.note && <> · {entry.session.note}</>}
                </span>
              </span>
              <span className="row-end">{formatMoney(entry.session.courtAmount + entry.session.drinkAmount)}</span>
            </a>
          </li>
        ) : (
          <li key={`t-${entry.transfer.id}`} className="list-row">
            <span className="avatar symbol" aria-hidden="true">
              <Icon name="transfer" className="small" />
            </span>
            <span className="row-main">
              <span className="row-title">
                {nameOf(entry.transfer.fromId)} → {nameOf(entry.transfer.toId)}
              </span>
              <span className="row-sub">Chuyển khoản · {formatDayMonth(entry.date)}</span>
            </span>
            <span className="row-end">
              {formatMoney(entry.transfer.amount)}
              {actsAs(entry.transfer.toId) && (
                <button type="button" className="link" onClick={() => undo(entry.transfer)}>
                  Hủy
                </button>
              )}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

function Stats() {
  const { state } = useApp();
  if (state.sessions.length === 0) return <p className="empty">Chưa có số liệu</p>;

  // month (YYYY-MM) -> { sessions, total spent }
  const months = new Map<string, { count: number; total: number }>();
  // memberId -> { sessions attended, total share }
  const perMember = new Map<number, { count: number; total: number }>();
  for (const session of state.sessions) {
    const month = months.get(session.date.slice(0, 7)) ?? { count: 0, total: 0 };
    month.count += 1;
    month.total += session.courtAmount + session.drinkAmount;
    months.set(session.date.slice(0, 7), month);
    for (const attendee of session.attendees) {
      const row = perMember.get(attendee.memberId) ?? { count: 0, total: 0 };
      row.count += 1;
      row.total += attendee.share;
      perMember.set(attendee.memberId, row);
    }
  }

  return (
    <>
      <h3 className="section-title">Theo tháng</h3>
      <div className="surface table-card">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Tháng</th>
              <th scope="col">Buổi</th>
              <th scope="col">Chi</th>
            </tr>
          </thead>
          <tbody>
            {[...months].sort(([a], [b]) => b.localeCompare(a)).map(([month, row]) => (
              <tr key={month}>
                <th scope="row">{formatMonth(month)}</th>
                <td>{row.count}</td>
                <td>{formatMoney(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title">Theo người</h3>
      <div className="surface table-card">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Tên</th>
              <th scope="col">Buổi</th>
              <th scope="col">Tiền</th>
            </tr>
          </thead>
          <tbody>
            {state.members
              .filter((m) => perMember.has(m.id))
              .sort(byName)
              .map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.name}</th>
                  <td>{perMember.get(m.id)!.count}</td>
                  <td>{formatMoney(perMember.get(m.id)!.total)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
