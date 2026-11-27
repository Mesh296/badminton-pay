import { LOGIN_URL } from "../api";
import { useApp } from "../app-context";
import { byName, formatMoney } from "../format";
import { Icon } from "../icons";
import { Avatar, BalanceLabel } from "../member-visuals";
import { ClaimsCard } from "./settle-actions";

// Home screen: group total and everyone's balance (debtors first).
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
  const incoming = state.claims.filter((c) => me?.memberId != null && c.toId === me.memberId);

  return (
    <>
      <ClaimsCard claims={incoming} />
      <section className="hero surface">
        <p className="eyebrow">{totalDebt > 0 ? "Cả nhóm còn nợ" : "Cả nhóm"}</p>
        <p className="hero-amount">{totalDebt > 0 ? formatMoney(totalDebt) : "Hết nợ"}</p>
        <a className="button secondary" href={next.href}>
          {next.label}
        </a>
      </section>

      {waitingHint}

      {/* Above the list, so the floating add button never covers it */}
      <p className="hint">Chạm tên để xem mã QR</p>

      <ul className="list surface">
        {rows.map(({ member, balance }) => (
          <li key={member.id}>
            <a className="list-row" href={`#/member/${member.id}`}>
              <Avatar member={member} />
              <span className="row-main row-title">{member.name}</span>
              <BalanceLabel balance={balance} />
              <Icon name="chevron-right" className="small chevron" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
