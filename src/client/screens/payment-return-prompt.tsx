import { useEffect, useState } from "react";
import { useApp } from "../app-context";
import { formatMoney, todayIso } from "../format";
import { forgetPayment, readPendingPayment, type PendingPayment } from "../pending-payment";

// "Đã chuyển 45.000đ cho Minh chưa?" Shown when the payer comes back to the
// app after leaving it to pay (bank app, MoMo, or copying the account), and
// also when the app starts again, since iPhone may have closed it meanwhile.
// One tap reports the payment; nobody has to find the button on their own.
export function PaymentReturnPrompt() {
  const { state, balances, write, nameOf, me } = useApp();
  const [pending, setPending] = useState<PendingPayment | null>(readPendingPayment);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setPending(readPendingPayment());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Nothing to ask once it is reported, or once they owe nothing any more.
  if (
    !pending ||
    me?.memberId !== pending.fromId ||
    state.claims.some((c) => c.fromId === pending.fromId && c.toId === pending.toId) ||
    (balances.get(pending.fromId) ?? 0) >= 0
  ) {
    return null;
  }
  const to = nameOf(pending.toId);

  const close = () => {
    forgetPayment();
    setPending(null);
  };

  const report = async () => {
    setSaving(true);
    const ok = await write("POST", "/api/claims", {
      date: todayIso(),
      fromId: pending.fromId,
      toId: pending.toId,
      amount: pending.amount,
    });
    setSaving(false);
    if (ok) close();
  };

  return (
    <div className="return-prompt" role="dialog" aria-labelledby="return-prompt-title">
      <p id="return-prompt-title" className="row-title">
        Đã chuyển {formatMoney(pending.amount)} cho {to} chưa?
      </p>
      <p className="hint">App không tự biết bạn đã chuyển. Báo để {to} xác nhận, xong là số dư được trừ.</p>
      <div className="row-buttons">
        <button type="button" className="button secondary" onClick={close} disabled={saving}>
          Chưa
        </button>
        <button type="button" className="button" onClick={() => void report()} disabled={saving}>
          {saving ? "Đang báo…" : "Đã chuyển"}
        </button>
      </div>
    </div>
  );
}
