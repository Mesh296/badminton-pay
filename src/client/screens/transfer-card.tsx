import { useState } from "react";
import { BANKS } from "../../shared/banks";
import type { Member } from "../../shared/types";
import { transferMemo, vietQrUrl } from "../../shared/vietqr";
import { useApp } from "../app-context";
import { formatMoney, todayIso } from "../format";
import { Icon } from "../icons";
import { MoneyInput } from "../money-input";

interface Props {
  from: Member;
  to: Member;
  amount: number;
}

// One suggested payment: who to pay, how much and the VietQR code. Only the
// receiver (or an admin) gets the button that records the money as received;
// the payer sees that it is waiting for them.
export function TransferCard({ from, to, amount }: Props) {
  const { write, actsAs } = useApp();
  const canConfirm = actsAs(to.id);
  const [confirming, setConfirming] = useState(false);
  const [paid, setPaid] = useState(amount);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const bankName = BANKS.find((bank) => bank.code === to.bankCode)?.name;
  const hasAccount = Boolean(to.bankCode && to.accountNo);

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(to.accountNo ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const record = async () => {
    setSaving(true);
    const ok = await write("POST", "/api/transfers", {
      date: todayIso(),
      fromId: from.id,
      toId: to.id,
      amount: paid,
    });
    setSaving(false);
    if (ok) setConfirming(false);
  };

  return (
    <section className="card surface">
      <h3>
        Chuyển cho {to.name}: <strong>{formatMoney(amount)}</strong>
      </h3>

      {hasAccount ? (
        <>
          <img
            className="qr"
            src={vietQrUrl({
              bankCode: to.bankCode!,
              accountNo: to.accountNo!,
              accountName: to.accountName,
              amount,
              memo: transferMemo(from.name),
            })}
            alt={`Mã QR chuyển ${formatMoney(amount)} cho ${to.name}`}
            width={240}
            height={240}
            loading="lazy"
            // Keeps this app's address (the only thing guarding the public data) out of the QR service's logs.
            referrerPolicy="no-referrer"
          />
          <p className="account">
            {bankName} · <span className="mono">{to.accountNo}</span>
            {to.accountName && <> · {to.accountName}</>}
          </p>
          <button type="button" className="button secondary" onClick={copyAccount}>
            <Icon name={copied ? "check" : "copy"} className="small" />
            {copied ? "Đã chép" : "Chép STK"}
          </button>
        </>
      ) : (
        <p className="muted">{to.name} chưa có số tài khoản. Hỏi trực tiếp.</p>
      )}

      {!canConfirm ? (
        <p className="hint">Chờ {to.name} xác nhận đã nhận</p>
      ) : confirming ? (
        <div className="confirm">
          <MoneyInput label="Số tiền" value={paid} onChange={setPaid} />
          <div className="row-buttons">
            <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
              Hủy
            </button>
            <button type="button" className="button" onClick={record} disabled={saving || paid <= 0}>
              {saving ? "Đang lưu…" : "Xác nhận"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button" onClick={() => setConfirming(true)}>
          <Icon name="check" className="small" />
          Đã nhận
        </button>
      )}
    </section>
  );
}
