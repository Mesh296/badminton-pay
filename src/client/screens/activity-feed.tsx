import { useState } from "react";
import type { ActivityEntry, SessionSnapshot, TransferSnapshot } from "../../shared/types";
import { useApp } from "../app-context";
import { isOwn, readSeen } from "../use-unseen-activity";
import { formatDayMonth, formatMoney } from "../format";
import { Icon, type IconName } from "../icons";

// The Thông báo tab: what happened, newest first. Who changed which session or
// transfer, who reported or turned down a payment, who joined or signed in.
// Everyone sees it, so a session entered against someone, or a payment undone,
// shows up with the name of whoever did it. A deleted record can be put back from here by
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
  // Sessions logged before courts and times have neither; that is no change.
  const rangeChanged =
    (before.startTime ?? null) !== (after.startTime ?? null) || (before.endTime ?? null) !== (after.endTime ?? null);
  // A new range usually moves everyone's hours with it; say it once.
  if (rangeChanged) parts.push("đổi khung giờ");
  else if (hoursOf(before) !== hoursOf(after)) parts.push("đổi giờ chơi");
  if ((before.courtId ?? null) !== (after.courtId ?? null)) parts.push("đổi sân");
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

/** Members a change touches: the payer and attendees, both ends of a payment, or who joined. */
function membersIn(entry: ActivityEntry): Set<number> {
  const ids = new Set<number>();
  for (const record of [entry.before, entry.after]) {
    if (!record) continue;
    if ("payerId" in record) [record.payerId, ...record.attendees.map((a) => a.memberId)].forEach((id) => ids.add(id));
    else if ("fromId" in record) [record.fromId, record.toId].forEach((id) => ids.add(id));
    else ids.add(record.memberId);
  }
  return ids;
}

interface Row {
  icon: IconName;
  title: string;
  detail: string;
  /** The session's page, while it still exists */
  href?: string;
  /** Puts a deleted record back, for whoever may enter it */
  restore?: () => void;
}

export function ActivityFeed() {
  const { state, me, nameOf, actsAs, write } = useApp();
  // Read before the tab marks everything seen, to point out what is new.
  const [seenBefore] = useState(readSeen);
  if (state.activity.length === 0) return <p className="empty">Chưa có thay đổi nào</p>;

  const restoreSession = (s: SessionSnapshot) => {
    if (!window.confirm(`Khôi phục buổi ${formatDayMonth(s.date)}?`)) return;
    // Entries logged before hours existed have none: the server then counts 1 hour each, as they were split.
    const attendees = s.attendees.map(({ memberId, drank, hours }) => ({ memberId, drank, hours }));
    // It comes back under its old id, which nothing else uses since it was deleted.
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
          icon: "calendar",
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
          icon: "transfer",
          title: `${who} ${{ "transfer.create": "ghi", "transfer.update": "sửa", "transfer.delete": "hủy" }[entry.action]} ${nameOf(transfer.fromId)} → ${nameOf(transfer.toId)}`,
          detail: before && after ? transferChanges(before, after, nameOf) : formatMoney(transfer.amount),
          restore: before && !after && actsAs(before.toId) && !transferIsBack(before) ? () => restoreTransfer(before) : undefined,
        };
      }
      case "claim.create":
      case "claim.delete": {
        const claim = (entry.after ?? entry.before)!;
        // Withdrawn by the payer, or turned down by the receiver (or an admin).
        const title =
          entry.action === "claim.create"
            ? `${who} báo đã chuyển cho ${nameOf(claim.toId)}`
            : entry.actorMemberId === claim.fromId
              ? `${who} hủy báo chuyển cho ${nameOf(claim.toId)}`
              : `${who} báo chưa nhận được tiền của ${nameOf(claim.fromId)}`;
        return { icon: "transfer", title, detail: formatMoney(claim.amount) };
      }
      case "member.join":
        return {
          icon: "users",
          title: `${entry.after ? nameOf(entry.after.memberId) : who} vào nhóm`,
          detail: entry.after && entry.actorMemberId !== entry.after.memberId ? `${who} duyệt` : "",
        };
      case "auth.login":
        return { icon: "users", title: `${who} đăng nhập`, detail: "" };
    }
  }

  return (
    <ul className="list surface">
      {state.activity.map((entry) => {
        const who = entry.actorMemberId === null ? "Quản trị" : nameOf(entry.actorMemberId);
        // Someone else's change that touches the viewer's own money
        const aboutMe = me?.memberId != null && entry.actorMemberId !== me.memberId && membersIn(entry).has(me.memberId);
        const isNew = entry.id > seenBefore && !isOwn(entry, me);
        const { icon, title, detail, href, restore } = describe(entry, who);

        const body = (
          <>
            <span className="avatar symbol" aria-hidden="true">
              <Icon name={icon} className="small" />
            </span>
            <span className="row-main">
              <span className="row-title">{title}</span>
              <span className="row-sub">
                {isNew && <span className="new-dot" aria-label="Mới" />}
                {aboutMe && <span className="accent-text">Có bạn · </span>}
                {detail && `${detail} · `}
                {formatTime(entry.at)}
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
