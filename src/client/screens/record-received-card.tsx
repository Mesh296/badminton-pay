import { useState } from "react";
import type { Member } from "../../shared/types";
import { useApp } from "../app-context";
import { byName, todayIso } from "../format";
import { Icon } from "../icons";
import { MoneyInput } from "../money-input";

// Records money this member received from anyone, for any amount. The
// suggested payments are recomputed whenever a balance changes, so a payment
// made for an earlier suggestion may no longer be listed by the time it
// arrives; this is how the receiver still records it.
export function RecordReceivedCard({ receiver }: { receiver: Member }) {
  const { state, balances, write, nameOf } = useApp();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState<number | "">("");
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Active members, plus anyone who left but still owes or is owed.
  const payers = state.members
    .filter((m) => m.id !== receiver.id && (m.active || (balances.get(m.id) ?? 0) !== 0))
    .sort(byName);

  const close = () => {
    setOpen(false);
    setFromId("");
    setAmount(0);
  };

  const save = async () => {
    setSaving(true);
    const ok = await write("POST", "/api/transfers", { date: todayIso(), fromId, toId: receiver.id, amount });
    setSaving(false);
    if (ok) close();
  };

  if (!open) {
    return (
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        <Icon name="check" className="small" />
        Ghi tiền {receiver.name} đã nhận
      </button>
    );
  }

  return (
    <section className="card surface">
      <h3>Ghi tiền {receiver.name} đã nhận</h3>
      <label className="field">
        <span>Người chuyển</span>
        <select value={fromId} onChange={(e) => setFromId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Chọn người</option>
          {payers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <MoneyInput label="Số tiền" value={amount} onChange={setAmount} />
      {/* Same money twice: once here and once when confirming the report */}
      {state.claims.some((c) => c.fromId === fromId && c.toId === receiver.id) && (
        <p className="hint">{nameOf(Number(fromId))} đã báo chuyển: bấm "Đã nhận" ở thẻ chờ xác nhận thay vì ghi ở đây</p>
      )}
      <div className="row-buttons">
        <button type="button" className="button secondary" onClick={close}>
          Hủy
        </button>
        <button type="button" className="button" onClick={save} disabled={saving || fromId === "" || amount <= 0}>
          {saving ? "Đang lưu…" : "Xác nhận"}
        </button>
      </div>
    </section>
  );
}
