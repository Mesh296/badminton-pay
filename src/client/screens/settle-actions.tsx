import { useState } from "react";
import type { Member, Transfer } from "../../shared/types";
import { useApp } from "../app-context";
import { formatDayMonth, formatMoney, todayIso } from "../format";
import { Icon } from "../icons";
import { MoneyInput } from "../money-input";

// Settling one suggested payment. The payer taps "Đã chuyển" after paying; the
// receiver sees that report and confirms it once the money is in their
// account, which records the transfer. A report counts toward no balance
// until then. The receiver (or an admin) can also record money straight away,
// for cash or when nobody reported it.

/** Confirm or turn down one reported payment: for its receiver or an admin. */
export function ClaimAnswer({ claim }: { claim: Transfer }) {
  const { write, nameOf } = useApp();
  const [saving, setSaving] = useState(false);
  const answer = async (received: boolean) => {
    if (!received && !window.confirm(`Báo ${nameOf(claim.fromId)} là chưa nhận được ${formatMoney(claim.amount)}?`)) {
      return;
    }
    setSaving(true);
    await write(received ? "POST" : "DELETE", received ? `/api/claims/${claim.id}/confirm` : `/api/claims/${claim.id}`);
    setSaving(false);
  };
  return (
    <div className="row-buttons">
      <button type="button" className="button secondary" disabled={saving} onClick={() => void answer(false)}>
        Chưa nhận
      </button>
      <button type="button" className="button" disabled={saving} onClick={() => void answer(true)}>
        <Icon name="check" className="small" />
        Đã nhận
      </button>
    </div>
  );
}

interface Props {
  from: Member;
  to: Member;
  amount: number;
}

export function SettleActions({ from, to, amount }: Props) {
  const { state, write, actsAs, me, nameOf } = useApp();
  const claim = state.claims.find((c) => c.fromId === from.id && c.toId === to.id);
  const isPayer = me?.memberId === from.id;
  // An admin paying their own debt is the payer here, never the receiver.
  const isReceiver = !isPayer && actsAs(to.id);
  // Reported to someone else, still waiting: the suggestions do not count it yet.
  const waiting = isPayer ? state.claims.find((c) => c.fromId === from.id && c.toId !== to.id) : undefined;
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState(amount);
  const [saving, setSaving] = useState(false);

  if (claim) {
    if (isReceiver) {
      return (
        <div className="confirm">
          <p>
            {from.name} báo đã chuyển <strong>{formatMoney(claim.amount)}</strong>
          </p>
          <ClaimAnswer claim={claim} />
        </div>
      );
    }
    return (
      <div className="confirm">
        <p className="hint">
          {isPayer ? "Bạn" : from.name} đã báo chuyển {formatMoney(claim.amount)}, chờ {to.name} xác nhận
        </p>
        {isPayer && (
          <button type="button" className="button secondary" onClick={() => void write("DELETE", `/api/claims/${claim.id}`)}>
            Hủy báo
          </button>
        )}
      </div>
    );
  }

  if (!isReceiver && !isPayer) return <p className="hint">Chờ {to.name} xác nhận đã nhận</p>;

  if (!open) {
    return (
      <>
        {waiting ? (
          <p className="hint">
            Bạn đã báo chuyển {formatMoney(waiting.amount)} cho {nameOf(waiting.toId)}, đang chờ xác nhận. Chờ xác nhận xong
            rồi hẵng chuyển tiếp.
          </p>
        ) : (
          isPayer && (
            <p className="hint">
              Chuyển xong thì bấm đây để báo {to.name}. App không tự biết bạn đã chuyển: số dư chỉ trừ khi {to.name} xác nhận.
            </p>
          )
        )}
        <button type="button" className="button" onClick={() => setOpen(true)}>
          <Icon name="check" className="small" />
          {isReceiver ? "Đã nhận" : "Đã chuyển"}
        </button>
      </>
    );
  }

  // The receiver records the transfer; the payer only reports it.
  const submit = async () => {
    setSaving(true);
    const ok = await write("POST", isReceiver ? "/api/transfers" : "/api/claims", {
      date: todayIso(),
      fromId: from.id,
      toId: to.id,
      amount: paid,
    });
    setSaving(false);
    if (ok) setOpen(false);
  };

  return (
    <div className="confirm">
      <MoneyInput label={isReceiver ? "Số tiền đã nhận" : "Số tiền đã chuyển"} value={paid} onChange={setPaid} />
      {!isReceiver && <p className="hint">{to.name} sẽ thấy và xác nhận khi tiền vào tài khoản</p>}
      <div className="row-buttons">
        <button type="button" className="button secondary" onClick={() => setOpen(false)}>
          Hủy
        </button>
        <button type="button" className="button" onClick={submit} disabled={saving || paid <= 0}>
          {saving ? "Đang lưu…" : isReceiver ? "Xác nhận" : `Báo ${to.name}`}
        </button>
      </div>
    </div>
  );
}

/**
 * Reported payments waiting on a receiver: the alert they see at the top of
 * the home screen and on their own page.
 */
export function ClaimsCard({ claims }: { claims: Transfer[] }) {
  const { nameOf } = useApp();
  if (claims.length === 0) return null;
  return (
    <section className="card surface claims" aria-live="polite">
      <h3>Chờ xác nhận đã nhận</h3>
      <ul className="plain">
        {claims.map((claim) => (
          <li key={claim.id} className="confirm">
            <p>
              {nameOf(claim.fromId)} báo đã chuyển <strong>{formatMoney(claim.amount)}</strong> ·{" "}
              {formatDayMonth(claim.date)}
            </p>
            <ClaimAnswer claim={claim} />
          </li>
        ))}
      </ul>
    </section>
  );
}
