import { useState, type FormEvent } from "react";
import { BANKS } from "../../shared/banks";
import type { Member } from "../../shared/types";
import { useApp } from "../app-context";

interface Props {
  member?: Member; // omitted when adding or asking to join
  /**
   * admin: an admin adds or edits anyone, including the sign-in email.
   * self: a member edits their own name and bank details.
   * join: a signed-in person asks to join (an admin's own request joins at once).
   */
  mode?: "admin" | "self" | "join";
  /** Called after a save or a cancel. Omit to show no cancel button. */
  onDone?: () => void;
}

// Name plus optional bank details used for the VietQR code. Admins also set
// the Google email a member signs in with and whether they still play.
export function MemberForm({ member, mode = "admin", onDone }: Props) {
  const { write } = useApp();
  const [name, setName] = useState(member?.name ?? "");
  const [bankCode, setBankCode] = useState(member?.bankCode ?? "");
  const [accountNo, setAccountNo] = useState(member?.accountNo ?? "");
  const [accountName, setAccountName] = useState(member?.accountName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [active, setActive] = useState(member?.active ?? true);
  const [saving, setSaving] = useState(false);

  // A bank and an account number only make sense together.
  const bankIncomplete = Boolean(bankCode) !== Boolean(accountNo.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const body = {
      name: name.trim(),
      bankCode: bankCode || null,
      accountNo: accountNo.trim() || null,
      accountName: accountName.trim() || null,
      email: email.trim() || null,
      active,
    };
    // The server ignores email and active outside admin mode.
    const ok =
      mode === "join"
        ? await write("POST", "/api/join", body)
        : mode === "self"
          ? await write("PUT", "/api/profile", body)
          : member
            ? await write("PUT", `/api/members/${member.id}`, body)
            : await write("POST", "/api/members", body);
    setSaving(false);
    if (ok) onDone?.();
  };

  return (
    <form className="form card surface" onSubmit={submit}>
      <label className="field">
        <span>Tên</span>
        <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
      </label>

      {mode === "admin" && (
      <label className="field">
        <span>Email Google để đăng nhập</span>
        <input
          type="email"
          value={email}
          maxLength={254}
          autoComplete="off"
          autoCapitalize="none"
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      )}

      <label className="field">
        <span>Ngân hàng</span>
        <select value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
          <option value="">Chưa có</option>
          {BANKS.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Số tài khoản</span>
        <input
          type="text"
          inputMode="numeric"
          value={accountNo}
          maxLength={20}
          autoComplete="off"
          onChange={(e) => setAccountNo(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
        />
      </label>

      <label className="field">
        <span>Chủ tài khoản</span>
        <input
          type="text"
          value={accountName}
          maxLength={60}
          autoComplete="off"
          onChange={(e) => setAccountName(e.target.value)}
        />
      </label>

      {member && mode === "admin" && (
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Còn chơi</span>
        </label>
      )}

      {bankIncomplete && <p className="muted">Cần cả ngân hàng và số tài khoản</p>}

      <div className="row-buttons">
        {onDone && (
          <button type="button" className="button secondary" onClick={onDone}>
            Hủy
          </button>
        )}
        <button type="submit" className="button" disabled={saving || !name.trim() || bankIncomplete}>
          {saving ? "Đang lưu…" : mode === "join" ? "Vào nhóm" : "Lưu"}
        </button>
      </div>
    </form>
  );
}
