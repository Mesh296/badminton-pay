import type { ActivityEntry, SessionSnapshot, TransferSnapshot } from "../../shared/types";
import { useApp } from "../app-context";
import { formatDayMonth, formatMoney } from "../format";
import { Icon } from "../icons";

// Who changed which session or transfer, newest first. Everyone sees it, so a
// session entered against someone, or a payment undone, shows up with the
// name of whoever did it. A deleted record can be put back from here by
// whoever may enter it: its payer or receiver, or an admin.

const total = (s: SessionSnapshot) => s.courtAmount + s.drinkAmount;
const pad = (n: number) => String(n).padStart(2, "0");

/** "18:05 · 27/11", in the device's time zone */
function formatTime(iso: string): string {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())} · ${pad(at.getDate())}/${pad(at.getMonth() + 1)}`;
}

/** What an edit changed, e.g. "250.000đ → 300.000đ · 5 → 6 người". */
function sessionChanges(before: SessionSnapshot, after: SessionSnapshot, nameOf: (id: number) => string): string {
  const ids = (s: SessionSnapshot, drankOnly = false) =>
    s.attendees
      .filter((a) => !drankOnly || a.drank)
      .map((a) => a.memberId)
      .sort((x, y) => x - y)
      .join();
  const hoursOf = (s: SessionSnapshot) =>
    s.attendees
      .map((a) => `${a.memberId}:${a.hours}`)
      .sort()
      .join();
  const parts: string[] = [];
  if (before.date !== after.date) parts.push(`ngày ${formatDayMonth(before.date)} → ${formatDayMonth(after.date)}`);
  if (before.payerId !== after.payerId) parts.push(`${nameOf(before.payerId)} → ${nameOf(after.payerId)} ứng`);
  if (total(before) !== total(after)) parts.push(`${formatMoney(total(before))} → ${formatMoney(total(after))}`);
  else if (before.courtAmount !== after.courtAmount) parts.push("đổi tiền sân, nước");
  if (before.attendees.length !== after.attendees.length) {
    parts.push(`${before.attendees.length} → ${after.attendees.length} người`);
  } else if (ids(before) !== ids(after)) parts.push("đổi người đi");
  else if (ids(before, true) !== ids(after, true)) parts.push("đổi người uống");
  else if (hoursOf(before) !== hoursOf(after)) parts.push("đổi giờ chơi");
  if (before.note !== after.note) parts.push("sửa ghi chú");
  return parts.join(" · ") || "không đổi gì";
}

/** What a fix to a transfer changed, e.g. "40.000đ → 50.000đ". */
function transferChanges(before: TransferSnapshot, after: TransferSnapshot, nameOf: (id: number) => string): string {
  const parts: string[] = [];
  if (before.amount !== after.amount) parts.push(`${formatMoney(before.amount)} → ${formatMoney(after.amount)}`);
  if (before.date !== after.date) parts.push(`ngày ${formatDayMonth(before.date)} → ${formatDayMonth(after.date)}`);
  if (before.fromId !== after.fromId) parts.push(`người chuyển ${nameOf(before.fromId)} → ${nameOf(after.fromId)}`);
  if (before.toId !== after.toId) parts.push(`người nhận ${nameOf(before.toId)} → ${nameOf(after.toId)}`);
  if (before.note !== after.note) parts.push("sửa ghi chú");
  return parts.join(" · ") || "không đổi gì";
}

/** Members a change touches: the payer and attendees, or both ends of a transfer. */
function membersIn(entry: ActivityEntry): Set<number> {
  const ids = new Set<number>();
  for (const record of [entry.before, entry.after]) {
    if (!record) continue;
    if ("payerId" in record) [record.payerId, ...record.attendees.map((a) => a.memberId)].forEach((id) => ids.add(id));
    else [record.fromId, record.toId].forEach((id) => ids.add(id));
  }
  return ids;
}

interface Row {
  isTransfer: boolean;
  title: string;
  detail: string;
  /** The session's page, while it still exists */
  href?: string;
  /** Puts a deleted record back, for whoever may enter it */
  restore?: () => void;
}

export function ActivityFeed() {
  const { state, me, nameOf, actsAs, write } = useApp();
  if (state.activity.length === 0) return <p className="empty">Chưa có thay đổi nào</p>;

  const restoreSession = (s: SessionSnapshot) => {
    if (!window.confirm(`Khôi phục buổi ${formatDayMonth(s.date)}?`)) return;
    // Entries logged before hours existed have none: the server then counts 1 hour each, as they were split.
    const attendees = s.attendees.map(({ memberId, drank, hours }) => ({ memberId, drank, hours }));
    // The server drops the old id and gives the session a new one.
    void write("POST", "/api/sessions", { ...s, attendees });
  };
  const restoreTransfer = (t: TransferSnapshot) => {
    if (!window.confirm(`Khôi phục ${nameOf(t.fromId)} → ${nameOf(t.toId)} ${formatMoney(t.amount)}?`)) return;
    void write("POST", "/api/transfers", t);
  };
  // A deleted record that is back already (restored, or entered again) offers no second restore.
  const sessionIsBack = (s: SessionSnapshot) =>
    state.sessions.some(
      (x) => x.date === s.date && x.payerId === s.payerId && total(x) === total(s) && x.attendees.length === s.attendees.length,
    );
  const transferIsBack = (t: TransferSnapshot) =>
    state.transfers.some((x) => x.date === t.date && x.fromId === t.fromId && x.toId === t.toId && x.amount === t.amount);

  /** The words and actions for one entry. A switch, so each case knows its record type. */
  function describe(entry: ActivityEntry, who: string): Row {
    switch (entry.action) {
      case "session.create":
      case "session.update":
      case "session.delete": {
        const { before, after } = entry;
        const session = (after ?? before)!;
        const verb = entry.action === "session.create" ? "thêm" : entry.action === "session.update" ? "sửa" : "xóa";
        return {
          isTransfer: false,
          title: `${who} ${verb} buổi ${formatDayMonth(session.date)}`,
          detail:
            before && after
              ? sessionChanges(before, after, nameOf)
              : `${formatMoney(total(session))} · ${session.attendees.length} người · ${nameOf(session.payerId)} ứng`,
          href: state.sessions.some((s) => s.id === session.id) ? `#/session/${session.id}` : undefined,
          restore:
            before && !after && actsAs(before.payerId) && !sessionIsBack(before) ? () => restoreSession(before) : undefined,
        };
      }
      case "transfer.create":
      case "transfer.update":
      case "transfer.delete": {
        const { before, after } = entry;
        const transfer = (after ?? before)!;
        return {
          isTransfer: true,
          title: `${who} ${{ "transfer.create": "ghi", "transfer.update": "sửa", "transfer.delete": "hủy" }[entry.action]} ${nameOf(transfer.fromId)} → ${nameOf(transfer.toId)}`,
          detail: before && after ? transferChanges(before, after, nameOf) : formatMoney(transfer.amount),
          restore: before && !after && actsAs(before.toId) && !transferIsBack(before) ? () => restoreTransfer(before) : undefined,
        };
      }
    }
  }

  return (
    <ul className="list surface">
      {state.activity.map((entry) => {
        const who = entry.actorMemberId === null ? "Quản trị" : nameOf(entry.actorMemberId);
        // Someone else's change that touches the viewer's own money
        const aboutMe = me?.memberId != null && entry.actorMemberId !== me.memberId && membersIn(entry).has(me.memberId);
        const { isTransfer, title, detail, href, restore } = describe(entry, who);

        const body = (
          <>
            <span className="avatar symbol" aria-hidden="true">
              <Icon name={isTransfer ? "transfer" : "calendar"} className="small" />
            </span>
            <span className="row-main">
              <span className="row-title">{title}</span>
              <span className="row-sub">
                {aboutMe && <span className="accent-text">Có bạn · </span>}
                {detail} · {formatTime(entry.at)}
              </span>
            </span>
          </>
        );
        return (
          <li key={entry.id} className={href ? undefined : "list-row"}>
            {href ? (
              <a className="list-row" href={href}>
                {body}
              </a>
            ) : (
              body
            )}
            {restore && (
              <span className="row-end">
                <button type="button" className="link" onClick={restore}>
                  Khôi phục
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
