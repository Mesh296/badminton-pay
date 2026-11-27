import { useState } from "react";
import { BANK_APPS, BANKS } from "../../shared/banks";
import type { Member } from "../../shared/types";
import { bankAppUrl, transferMemo, vietQrPayload } from "../../shared/vietqr";
import { useApp } from "../app-context";
import { formatMoney } from "../format";
import { Icon } from "../icons";
import { QrCode } from "../qr-code";
import { SettleActions } from "./settle-actions";

interface Props {
  from: Member;
  to: Member;
  amount: number;
}

/** The banking app this phone pays with, remembered between visits */
const BANK_APP_KEY = "bank-app";

// One suggested payment: who to pay, how much, the VietQR code, a button that
// opens the payer's banking app on the transfer, and the buttons to settle it:
// the payer reports it sent, the receiver confirms it arrived.
export function TransferCard({ from, to, amount }: Props) {
  const { me } = useApp();
  const [copied, setCopied] = useState(false);
  const [appId, setAppId] = useState(() => localStorage.getItem(BANK_APP_KEY) ?? "");

  const bank = BANKS.find((b) => b.code === to.bankCode);
  const hasAccount = Boolean(to.bankCode && to.accountNo);
  const memo = transferMemo(from.name);
  const app = BANK_APPS.find((a) => a.id === appId);
  // The receiver has nothing to pay here.
  const showBankApp = Boolean(bank) && me?.memberId !== to.id;

  const chooseApp = (id: string) => {
    setAppId(id);
    localStorage.setItem(BANK_APP_KEY, id);
  };

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(to.accountNo ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="card surface">
      <h3>
        Chuyển cho {to.name}: <strong>{formatMoney(amount)}</strong>
      </h3>

      {hasAccount ? (
        <>
          <QrCode
            text={vietQrPayload({ bankCode: to.bankCode!, accountNo: to.accountNo!, amount, memo })}
            label={`Mã QR chuyển ${formatMoney(amount)} cho ${to.name}`}
          />
          <p className="account">
            {bank?.name} · <span className="mono">{to.accountNo}</span>
            {to.accountName && <> · {to.accountName}</>}
          </p>
          <button type="button" className="button secondary" onClick={copyAccount}>
            <Icon name={copied ? "check" : "copy"} className="small" />
            {copied ? "Đã chép" : "Chép STK"}
          </button>

          {showBankApp && (
            <div className="bank-app">
              <label className="field">
                <span>Mở app ngân hàng</span>
                <select value={appId} onChange={(e) => chooseApp(e.target.value)}>
                  <option value="">Chọn app của bạn</option>
                  <optgroup label="Tự điền sẵn">
                    {BANK_APPS.filter((a) => a.autofill).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Chỉ mở app">
                    {BANK_APPS.filter((a) => !a.autofill).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              {app && (
                <>
                  <a
                    className="button"
                    href={bankAppUrl({
                      appId: app.id,
                      bankShort: bank!.short,
                      accountNo: to.accountNo!,
                      accountName: to.accountName,
                      amount,
                      memo,
                    })}
                    rel="noreferrer"
                    // Apps that do not fill in the transfer get the account number on the clipboard to paste.
                    onClick={app.autofill ? undefined : copyAccount}
                  >
                    <Icon name="wallet" className="small" />
                    Mở {app.name}
                  </a>
                  <p className="hint">
                    {app.autofill ? "Tự điền STK, số tiền và nội dung" : "App này chưa tự điền: STK được chép sẵn để dán, số tiền tự nhập"}
                  </p>
                </>
              )}
              {/* The bank shows the real account holder before sending; a name that
                  differs means the details were changed somewhere on the way. */}
              {to.accountName && <p className="hint">Tên người nhận trong app ngân hàng phải là {to.accountName}</p>}
            </div>
          )}
        </>
      ) : (
        <p className="muted">{to.name} chưa có số tài khoản. Hỏi trực tiếp.</p>
      )}

      <SettleActions from={from} to={to} amount={amount} />
    </section>
  );
}
