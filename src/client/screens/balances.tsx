import { LOGIN_URL } from "../api";
import { useApp } from "../app-context";
import { byName, formatMoney } from "../format";
import { Icon } from "../icons";
import { Avatar, BalanceLabel } from "../member-visuals";
import { PushToggle } from "../push-toggle";
import { ClaimsCard } from "./settle-actions";

/**
 * The top of the home screen for a signed-in member: where they stand and the
 * one thing to do about it. Someone who owes gets a button straight to the QR
 * code and "Đã chuyển", so nobody has to work out where paying happens.
 */
function MyStatus({ memberId, totalDebt, next }: { memberId: number; totalDebt: number; next: { href: string; label: string } }) {
  const { state, balances, suggestions, nameOf } = useApp();
  const balance = balances.get(memberId) ?? 0;
  const payees = suggestions.filter((s) => s.fromId === memberId);
  const reported = state.claims.filter((c) => c.fromId === memberId);
  const myPage = `#/member/${memberId}`;
  const group = <p className="hint">{totalDebt > 0 ? `Cả nhóm còn nợ ${formatMoney(totalDebt)}` : "Cả nhóm hết nợ"}</p>;

  if (balance < 0) {
    return (
      <section className="hero surface">
        <p className="eyebrow">Bạn đang nợ</p>
        <p className="hero-amount">{formatMoney(-balance)}</p>
        <a className="button" href={myPage}>
          <Icon name="wallet" className="small" />
          {payees.length === 1 ? `Chuyển cho ${nameOf(payees[0].toId)}` : "Chuyển tiền"}
        </a>
        {reported.length > 0 ? (
          <p className="hint">Đã báo chuyển, chờ {nameOf(reported[0].toId)} xác nhận</p>
        ) : (
          group
        )}
      </section>
    );
  }
  return (
    <section className="hero surface">
      <p className="eyebrow">{balance > 0 ? "Bạn sẽ nhận" : "Bạn"}</p>
      <p className="hero-amount">{balance > 0 ? formatMoney(balance) : "Hết nợ"}</p>
      <a className="button secondary" href={balance > 0 ? myPage : next.href}>
        {balance > 0 ? "Xem ai chưa trả" : next.label}
      </a>
      {group}
      {balance > 0 && <PushToggle offerOnly />}
    </section>
  );
}

// Home screen: where the signed-in member stands, then everyone's balance (debtors first).
export function Balances() {
  const { state, balances, me, canAdd } = useApp();

  const rows = state.members
    .map((member) => ({ member, balance: balances.get(member.id) ?? 0 }))
    // Inactive members only matter while they still owe or are owed.
    .filter(({ member, balance }) => member.active || balance !== 0)
    .sort((a, b) => a.balance - b.balance || byName(a.member, b.member));

  // The one next step for whoever is looking. The members tab holds the join
  // form and, for admins, adding members and approving requests.
  const waiting = state.joinRequests.length;
  const next =
    canAdd && state.members.length > 0
      ? { href: "#/session/new", label: "Thêm buổi" }
      : !me
        ? { href: LOGIN_URL, label: "Đăng nhập" }
        : me.admin
          ? { href: "#/members", label: "Thêm thành viên" }
          : { href: "#/members", label: waiting > 0 ? "Chờ duyệt" : "Xin vào nhóm" };
  // Admins receive everyone's requests; tell them when some are waiting.
  const waitingHint = me?.admin && waiting > 0 && (
    <a className="hint" href="#/members">
      {waiting} người chờ duyệt
    </a>
  );

  if (state.members.length === 0) {
    return (
      <div className="empty">
        <p>Chưa có thành viên</p>
        <a className="button" href={next.href}>
          {next.label}
        </a>
        {waitingHint}
      </div>
    );
  }

  const totalDebt = rows.reduce((sum, row) => sum + Math.max(0, -row.balance), 0);
  // Payments others reported sending to whoever is looking, first thing they see.
  const myId = me?.memberId ?? null;
  const incoming = state.claims.filter((c) => c.toId === myId);

  return (
    <>
      <ClaimsCard claims={incoming} />
      {myId != null && state.members.some((m) => m.id === myId) ? (
        <MyStatus memberId={myId} totalDebt={totalDebt} next={next} />
      ) : (
        <section className="hero surface">
          <p className="eyebrow">{totalDebt > 0 ? "Cả nhóm còn nợ" : "Cả nhóm"}</p>
          <p className="hero-amount">{totalDebt > 0 ? formatMoney(totalDebt) : "Hết nợ"}</p>
          <a className="button secondary" href={next.href}>
            {next.label}
          </a>
        </section>
      )}

      {waitingHint}

      {/* Above the list, so the floating add button never covers it */}
      <p className="hint">{myId != null ? "Chạm tên để xem chi tiết từng người" : "Chạm tên bạn để lấy mã QR chuyển tiền"}</p>

      <ul className="list surface">
        {rows.map(({ member, balance }) => (
          <li key={member.id}>
            <a className="list-row" href={`#/member/${member.id}`}>
              <Avatar member={member} />
              <span className="row-main row-title">
                {member.name}
                {member.id === myId && <span className="muted"> · bạn</span>}
              </span>
              <BalanceLabel balance={balance} />
              <Icon name="chevron-right" className="small chevron" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
