import { useState } from "react";
import { Icon } from "../icons";
import { qrPngFile } from "../qr-png";

interface Props {
  /** The VietQR payload: receiver's bank, account, amount and note */
  qrText: string;
  /** Bank, account number and holder as text, for MoMo's paste-to-fill */
  accountText: string;
  /** Called as the payer leaves for MoMo */
  onPay: () => void;
}

// Paying from MoMo. MoMo opens on no prefilled bank transfer from a link, but
// it reads a QR image shared to it from the share sheet and fills in the
// receiver. Where files cannot be shared, the account goes on the clipboard
// and MoMo opens; its search bar fills the bank and account from a paste.
export function MomoPay({ qrText, accountText, onPay }: Props) {
  const [pasted, setPasted] = useState(false);

  const send = async () => {
    onPay();
    const file = qrPngFile(qrText, "ma-qr-chuyen-tien.png");
    if (navigator.canShare?.({ files: [file] })) {
      // Cancelling the share sheet rejects; nothing to do then.
      await navigator.share({ files: [file] }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(accountText).catch(() => undefined);
    setPasted(true);
    window.location.href = "momo://";
  };

  return (
    <>
      <button type="button" className="button" onClick={() => void send()}>
        <Icon name="wallet" className="small" />
        Gửi mã QR sang MoMo
      </button>
      {pasted && <p className="hint">Đã chép STK. Trong MoMo bấm Dán ở ô tìm kiếm, rồi nhập số tiền.</p>}
    </>
  );
}
