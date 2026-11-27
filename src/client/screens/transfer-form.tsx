import { useState } from "react";
import { useApp } from "../app-context";
import { byName, formatMoney } from "../format";
import { MoneyInput } from "../money-input";
import { navigate } from "../use-hash-route";

// Fix or delete one recorded transfer, for when it was entered wrong. The
// receiver may change the date, who paid, the amount and the note; an admin may
// also change who received it. Everyone else sees it read-only. The server
// enforces the same rules and logs every change.
export function TransferForm({ id }: { id: number }) {
  const { state, write, me, actsAs, nameOf } = useApp();
  const transfer = state.transfers.find((t) => t.id === id);
  const [date, setDate] = useState(transfer?.date ?? "");
  const [fromId, setFromId] = useState(transfer?.fromId ?? 0);
  const [toId, setToId] = useState(transfer?.toId ?? 0);
  const [amount, setAmount] = useState(transfer?.amount ?? 0);
  const [note, setNote] = useState(transfer?.note ?? "");
  const [saving, setSaving] = useState(false);

  if (!transfer) return <p className="empty">Không tìm thấy lần chuyển</p>;
  const canEdit = actsAs(transfer.toId);
  // Active members, plus whoever is on this transfer even if they left since.
  const members = state.members
    .filter((m) => m.active || m.id === transfer.fromId || m.id === transfer.toId)
    .sort(byName);

  // Same rules as the server, so Save is only enabled for a valid transfer.
  const problem = !date
    ? "Chọn ngày"
    : fromId === toId
      ? "Người chuyển và người nhận phải khác nhau"
      : amount <= 0
        ? "Nhập số tiền"
        : null;

  const save = async () => {
    setSaving(true);
    const ok = await write("PUT", `/api/transfers/${id}`, { date, fromId, toId, amount, note: note.trim() || null });
    setSaving(false);
    if (ok) navigate("/history");
  };

  const remove = async () => {
    const line = `${nameOf(transfer.fromId)} → ${nameOf(transfer.toId)} ${formatMoney(transfer.amount)}`;
    if (!window.confirm(`Xóa chuyển khoản này?\n${line}`)) return;
    setSaving(true);
    const ok = await write("DELETE", `/api/transfers/${id}`);
    setSaving(false);
    if (ok) navigate("/history");
  };

  const memberSelect = (value: number, onChange: (id: number) => void, disabled = false) => (
    <select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      {/* A disabled fieldset turns every control inside read-only for those who may not edit. */}
      <fieldset className="form" disabled={!canEdit}>
        <section className="card surface">
          <label className="field">
            <span>Ngày</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Người chuyển</span>
            {memberSelect(fromId, setFromId)}
          </label>
          <label className="field">
            <span>Người nhận</span>
            {/* Only an admin may move a transfer to another receiver */}
            {memberSelect(toId, setToId, !me?.admin)}
          </label>
        </section>

        <section className="card surface">
          <MoneyInput label="Số tiền" value={amount} onChange={setAmount} />
          <label className="field">
            <span>Ghi chú</span>
            <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
        </section>
      </fieldset>

      {!canEdit && <p className="hint">Chỉ {nameOf(transfer.toId)} sửa được lần chuyển này</p>}

      {canEdit && (
        <div className="savebar">
          {problem && (
            <p className="muted" aria-live="polite">
              {problem}
            </p>
          )}
          <button type="button" className="button big" onClick={save} disabled={Boolean(problem) || saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
          <button type="button" className="button danger" onClick={remove} disabled={saving}>
            Xóa chuyển khoản
          </button>
        </div>
      )}
    </form>
  );
}
