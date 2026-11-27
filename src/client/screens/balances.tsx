import { LOGIN_URL } from "../api";
import { useApp } from "../app-context";
import { byName, formatMoney } from "../format";
import { Icon } from "../icons";
import { Avatar, BalanceLabel } from "../member-visuals";

// Home screen: group total and everyone's balance (debtors first).
export function Balances() {
  const { state, balances, me, canAdd } = useApp();

  const rows = state.members
    .map((member) => ({ member, balance: balances.get(member.id) ?? 0 }))
    // Inactive members only matter while they still owe or are owed.
    .filter(({ member, balance }) => member.active || balance !== 0)
    .sort((a, b) => a.balance - b.balance || byName(a.member, b.member));

  if (state.members.length === 0) {
    return (
      <div className="empty">
        <p>Chưa có thành viên</p>
        <a className="button" href="#/members">
          Thêm thành viên
        </a>
      </div>
    );
  }

  const totalDebt = rows.reduce((sum, row) => sum + Math.max(0, -row.balance), 0);

  return (
    <>
      <section className="hero surface">
        <p className="eyebrow">{totalDebt > 0 ? "Cả nhóm còn nợ" : "Cả nhóm"}</p>
        <p className="hero-amount">{totalDebt > 0 ? formatMoney(totalDebt) : "Hết nợ"}</p>
        {canAdd ? (
          <a className="button secondary" href="#/session/new">
            Thêm buổi
          </a>
        ) : (
          !me && (
            <a className="button secondary" href={LOGIN_URL}>
              Đăng nhập
            </a>
          )
        )}
      </section>

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
