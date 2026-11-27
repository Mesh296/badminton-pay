import { useApp } from "../app-context";
import { formatDate, formatMoney, todayIso } from "../format";
import { Icon } from "../icons";
import { Avatar, BalanceLabel } from "../member-visuals";
import { RecordReceivedCard } from "./record-received-card";
import { ClaimsCard } from "./settle-actions";
import { TransferCard } from "./transfer-card";

// One member's view: balance, who to pay (with QR) or who will pay them, and
// their sessions and transfers.
export function MemberDetail({ id }: { id: number }) {
  const { state, balances, suggestions, nameOf, actsAs, write } = useApp();
  const member = state.members.find((m) => m.id === id);
  if (!member) return <p className="empty">Không tìm thấy thành viên</p>;

  const balance = balances.get(id) ?? 0;
  const toPay = suggestions.filter((s) => s.fromId === id);
  const toReceive = suggestions.filter((s) => s.toId === id);
  const sessions = state.sessions.filter(
    (s) => s.payerId === id || s.attendees.some((a) => a.memberId === id),
  );
  const transfers = state.transfers.filter((t) => t.fromId === id || t.toId === id);

  // The receiver records money that arrived, straight from their own page.
  const confirmReceived = (fromId: number, amount: number) => {
    if (window.confirm(`Đã nhận ${formatMoney(amount)} từ ${nameOf(fromId)}?`)) {
      void write("POST", "/api/transfers", { date: todayIso(), fromId, toId: id, amount });
    }
  };

  return (
    <>
      <section className="hero surface">
        <Avatar member={member} size="large" />
        <h2>{member.name}</h2>
        <BalanceLabel balance={balance} large />
      </section>

      {toPay.map((suggestion) => {
        const payee = state.members.find((m) => m.id === suggestion.toId);
        return payee ? (
          <TransferCard
            // amount in the key resets the card after a partial payment
            key={`${payee.id}-${suggestion.amount}`}
            from={member}
            to={payee}
            amount={suggestion.amount}
          />
        ) : null;
      })}

      {actsAs(id) && <ClaimsCard claims={state.claims.filter((c) => c.toId === id)} />}

      {toReceive.length > 0 && (
        <section className="card surface">
          <h3>Sẽ nhận</h3>
          <ul className="plain">
            {toReceive.map((s) => (
              <li key={s.fromId} className="split">
                <span>{nameOf(s.fromId)}</span>
                <span className="row-end">
                  <span className="mono">{formatMoney(s.amount)}</span>
                  {actsAs(id) && (
                    <button type="button" className="link" onClick={() => confirmReceived(s.fromId, s.amount)}>
                      Đã nhận
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* For payments that no longer match a suggestion above. Not while this
          member owes: then the money goes the other way, and the payer's own
          button is "Đã chuyển" on the card above. */}
      {actsAs(id) && balance >= 0 && <RecordReceivedCard receiver={member} />}

      <h3 className="section-title">Tiền từng buổi</h3>
      {sessions.length === 0 ? (
        <p className="muted">Chưa có buổi nào</p>
      ) : (
        <ul className="list surface">
          {sessions.map((session) => {
            const share = session.attendees.find((a) => a.memberId === id)?.share ?? 0;
            const fronted = session.attendees.reduce((sum, a) => sum + a.share, 0);
            return (
              <li key={session.id}>
                <a className="list-row" href={`#/session/${session.id}`}>
                  <span className="avatar symbol" aria-hidden="true">
                    <Icon name="calendar" className="small" />
                  </span>
                  <span className="row-main">
                    <span className="row-title">{formatDate(session.date)}</span>
                    {session.payerId === id && <span className="row-sub">ứng {formatMoney(fronted)}</span>}
                  </span>
                  <span className="row-end">{formatMoney(share)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {transfers.length > 0 && (
        <>
          <h3 className="section-title">Chuyển khoản</h3>
          <ul className="list surface">
            {transfers.map((t) => (
              <li key={t.id}>
                <a className="list-row" href={`#/transfer/${t.id}`}>
                  <span className="avatar symbol" aria-hidden="true">
                    <Icon name="transfer" className="small" />
                  </span>
                  <span className="row-main">
                    <span className="row-title">
                      {t.fromId === id ? `Cho ${nameOf(t.toId)}` : `Từ ${nameOf(t.fromId)}`}
                    </span>
                    <span className="row-sub">{formatDate(t.date)}</span>
                  </span>
                  <span className="row-end">{formatMoney(t.amount)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
