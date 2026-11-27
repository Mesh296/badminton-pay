import { useState } from "react";
import { splitSession } from "../../shared/money";
import { LOGIN_URL } from "../api";
import { useApp } from "../app-context";
import { byName, formatMoney, todayIso } from "../format";
import { Icon } from "../icons";
import { Avatar } from "../member-visuals";
import { MoneyInput } from "../money-input";
import { navigate } from "../use-hash-route";

// Create or edit one session: who paid, the two amounts, who came, who drank.
// A member can only enter sessions they paid for and edit those; an admin can
// do it for anyone. Everyone else sees the session read-only.
export function SessionForm({ sessionId }: { sessionId?: string }) {
  const { state, write, me, canAdd, actsAs, nameOf } = useApp();
  const admin = Boolean(me?.admin);
  const editing = state.sessions.find((s) => s.id === sessionId);

  const [date, setDate] = useState(editing?.date ?? todayIso());
  // New session: a member is always the payer of what they enter; an admin
  // picks, starting from whoever paid last time.
  const [payerId, setPayerId] = useState<number | "">(
    editing?.payerId ?? (admin ? (state.sessions[0]?.payerId ?? me?.memberId ?? "") : (me?.memberId ?? "")),
  );
  const [court, setCourt] = useState(editing?.courtAmount ?? 0);
  const [drink, setDrink] = useState(editing?.drinkAmount ?? 0);
  const [note, setNote] = useState(editing?.note ?? "");
  // memberId -> drank, for everyone who attended
  const [picked, setPicked] = useState(() => new Map(editing?.attendees.map((a) => [a.memberId, a.drank])));
  const [saving, setSaving] = useState(false);

  if (sessionId && !editing) return <p className="empty">Không tìm thấy buổi</p>;
  if (!editing && !canAdd) {
    return (
      <div className="empty">
        <p>{me ? "Email này chưa có trong nhóm" : "Đăng nhập để thêm buổi"}</p>
        {!me && (
          <a className="button" href={LOGIN_URL}>
            Đăng nhập Google
          </a>
        )}
      </div>
    );
  }
  const canEdit = editing ? actsAs(editing.payerId) : true;

  // Active members, plus anyone already on this session even if deactivated since.
  const members = state.members.filter((m) => m.active || picked.has(m.id) || m.id === payerId).sort(byName);
  const attendees = [...picked].map(([memberId, drank]) => ({
    memberId,
    drank,
  }));

  // Same rules as the server, so Save is only enabled for a valid session.
  const problem = !date
    ? "Chọn ngày"
    : payerId === ""
      ? "Chọn người ứng"
      : attendees.length === 0
        ? "Chọn người đi"
        : court + drink === 0
          ? "Nhập tiền"
          : drink > 0 && !attendees.some((a) => a.drank)
            ? "Chọn người uống"
            : null;
  const shares = problem ? null : splitSession({ courtAmount: court, drinkAmount: drink, attendees });
  const collected = shares ? [...shares.values()].reduce((a, b) => a + b, 0) : 0;

  const toggle = (id: number, field: "present" | "drank") => {
    const next = new Map(picked);
    if (field === "present") {
      if (next.has(id)) next.delete(id);
      else next.set(id, false);
    } else {
      next.set(id, !next.get(id));
    }
    setPicked(next);
  };

  const save = async () => {
    setSaving(true);
    const body = {
      date,
      payerId,
      courtAmount: court,
      drinkAmount: drink,
      note: note.trim() || null,
      attendees,
    };
    const ok = editing
      ? await write("PUT", `/api/sessions/${editing.id}`, body)
      : await write("POST", "/api/sessions", body);
    setSaving(false);
    if (ok) navigate("/");
  };

  const remove = async () => {
    if (!editing || !window.confirm("Xóa buổi này? Số dư sẽ tính lại.")) return;
    setSaving(true);
    const ok = await write("DELETE", `/api/sessions/${editing.id}`);
    setSaving(false);
    if (ok) navigate("/history");
  };

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
            <span>Người ứng</span>
            <select
              value={payerId}
              disabled={!admin}
              onChange={(e) => setPayerId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Chọn…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="card surface">
          <MoneyInput label="Sân + cầu" value={court} onChange={setCourt} />
          <MoneyInput label="Nước" value={drink} onChange={setDrink} />
        </section>

        <section className="card surface" role="group" aria-labelledby="attendees-label">
          <p id="attendees-label" className="eyebrow">
            Đi {attendees.length} · Uống {attendees.filter((a) => a.drank).length}
          </p>
          <ul className="picker">
            {members.map((m) => {
              const present = picked.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className="toggle name"
                    aria-pressed={present}
                    onClick={() => toggle(m.id, "present")}
                  >
                    <Avatar member={m} size="small" />
                    <span className="grow">{m.name}</span>
                    {present && shares && <span className="share">{formatMoney(shares.get(m.id) ?? 0)}</span>}
                  </button>
                  <button
                    type="button"
                    className="toggle drink"
                    aria-pressed={picked.get(m.id) === true}
                    aria-label={`${m.name} uống nước`}
                    disabled={!present}
                    onClick={() => toggle(m.id, "drank")}
                  >
                    <Icon name="droplet" className="small" />
                    Nước
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card surface">
          <label className="field">
            <span>Ghi chú</span>
            <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
        </section>
      </fieldset>

      {!canEdit && editing && <p className="hint">Chỉ {nameOf(editing.payerId)} sửa được buổi này</p>}

      {canEdit && (
        <div className="savebar">
          <p className={problem ? "muted" : undefined} aria-live="polite">
            {problem ??
              (collected > court + drink
                ? `Thu ${formatMoney(collected)} · dư ${formatMoney(collected - court - drink)} về người ứng`
                : `Thu ${formatMoney(collected)}`)}
          </p>
          <button type="button" className="button big" onClick={save} disabled={Boolean(problem) || saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
          {editing && (
            <button type="button" className="button danger" onClick={remove} disabled={saving}>
              Xóa buổi
            </button>
          )}
        </div>
      )}
    </form>
  );
}
