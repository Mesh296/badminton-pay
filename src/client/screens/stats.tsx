import { useState } from "react";
import type { Session } from "../../shared/types";
import { useApp } from "../app-context";
import { formatMoney, formatMoneyShort, formatMonth } from "../format";
import { Avatar } from "../member-visuals";

// The Thống kê tab. Each figure takes the form its job asks for:
// - a few headline numbers: stat tiles
// - spending month by month (a trend): columns, the latest month in the
//   accent and the rest in gray, its value on its cap; tap a column to read another
// - courts and members (ranking): one row each, name, bar and figure, largest first
// One series per chart, so one hue and no legend; every value is also text or
// in a table for screen readers.

const total = (s: Session) => s.courtAmount + s.drinkAmount;
/** Months shown in the column chart, newest last */
const MONTHS_SHOWN = 6;

export function Stats() {
  const { state } = useApp();
  if (state.sessions.length === 0) return <p className="empty">Chưa có số liệu</p>;

  const sessions = state.sessions;
  const spent = sessions.reduce((sum, s) => sum + total(s), 0);
  const heads = sessions.reduce((sum, s) => sum + s.attendees.length, 0);

  const sum = <K,>(rows: Map<K, { count: number; total: number }>, key: K, amount: number) => {
    const row = rows.get(key) ?? { count: 0, total: 0 };
    row.count += 1;
    row.total += amount;
    rows.set(key, row);
  };
  const months = new Map<string, { count: number; total: number }>();
  const courts = new Map<number | null, { count: number; total: number }>();
  const members = new Map<number, { count: number; total: number }>();
  for (const s of sessions) {
    sum(months, s.date.slice(0, 7), total(s));
    sum(courts, s.courtId, total(s));
    for (const a of s.attendees) sum(members, a.memberId, a.share);
  }

  const courtName = (id: number | null) => state.courts.find((c) => c.id === id)?.name ?? "Chưa ghi sân";
  const courtRows = [...courts]
    // Unrecorded courts go last, whatever their count
    .sort(([a, x], [b, y]) => Number(a === null) - Number(b === null) || y.count - x.count)
    .map(([id, row]) => ({
      key: String(id),
      name: courtName(id),
      unknown: id === null,
      value: row.count,
      figure: `${row.count} buổi · ${formatMoneyShort(row.total)}`,
    }));
  const memberRows = [...members]
    .sort(([, x], [, y]) => y.total - x.total)
    .map(([id, row]) => {
      const member = state.members.find((m) => m.id === id);
      return { key: String(id), name: member?.name ?? "?", member, value: row.total, figure: `${formatMoneyShort(row.total)} · ${row.count} buổi` };
    });

  return (
    <>
      <div className="stat-tiles">
        <StatTile label="Số buổi" value={String(sessions.length)} />
        <StatTile label="Tổng chi" value={formatMoneyShort(spent)} />
        <StatTile label="Trung bình mỗi buổi" value={formatMoneyShort(Math.round(spent / sessions.length))} />
        <StatTile label="Người mỗi buổi" value={(heads / sessions.length).toFixed(1).replace(".0", "").replace(".", ",")} />
      </div>

      <h3 className="section-title">Chi theo tháng</h3>
      <MonthColumns months={[...months].sort(([a], [b]) => a.localeCompare(b))} />

      <h3 className="section-title">Theo sân</h3>
      <BarList rows={courtRows} />

      <h3 className="section-title">Theo người</h3>
      <BarList rows={memberRows} />
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile surface">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

/**
 * Spending per month as columns, the last MONTHS_SHOWN months. The latest is the
 * point; tapping (or hovering) another shows its figures. Every month stays in
 * the table for screen readers.
 */
function MonthColumns({ months: all }: { months: [string, { count: number; total: number }][] }) {
  const months = all.slice(-MONTHS_SHOWN);
  const latest = months.length - 1;
  // Remembered by month, not position: months come and go when sessions are added or removed.
  const [picked, setPicked] = useState<string | null>(null);
  const found = months.findIndex(([m]) => m === picked);
  const active = found === -1 ? latest : found;
  const max = Math.max(...months.map(([, m]) => m.total));
  const [month, row] = months[active];

  return (
    <div className="surface chart-card">
      <p className="chart-caption">
        Tháng {formatMonth(month)}: <strong>{formatMoney(row.total)}</strong> · {row.count} buổi
      </p>
      <div className="columns" aria-hidden="true">
        {months.map(([m, r], i) => (
          <button
            key={m}
            type="button"
            tabIndex={-1}
            className={i === active ? "column active" : "column"}
            onClick={() => setPicked(m)}
            onPointerEnter={() => setPicked(m)}
            onPointerLeave={() => setPicked(null)}
          >
            <span className="column-value">{i === active ? formatMoneyShort(r.total) : ""}</span>
            <span className="column-plot">
              <span className="column-bar" style={{ height: `${Math.max(4, (r.total / max) * 100)}%` }} />
            </span>
            <span className="column-label">T{Number(m.slice(5, 7))}</span>
          </button>
        ))}
      </div>
      {/* The same figures for screen readers */}
      <table className="sr-only">
        <caption>Chi theo tháng</caption>
        <tbody>
          {all.map(([m, r]) => (
            <tr key={m}>
              <th scope="row">{formatMonth(m)}</th>
              <td>{formatMoney(r.total)}</td>
              <td>{r.count} buổi</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BarRow {
  key: string;
  name: string;
  member?: Parameters<typeof Avatar>[0]["member"];
  /** Not a real entry (sessions with no court): drawn in gray */
  unknown?: boolean;
  value: number;
  figure: string;
}

/** Ranked rows: name, a bar on a shared baseline, and the figure. Largest first. */
function BarList({ rows }: { rows: BarRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="surface bar-list">
      {rows.map((r) => (
        <li key={r.key} className={r.unknown ? "unknown" : undefined}>
          <span className="bar-name">
            {r.member && <Avatar member={r.member} size="small" />}
            {r.name}
          </span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className="bar-figure">{r.figure}</span>
        </li>
      ))}
    </ul>
  );
}
