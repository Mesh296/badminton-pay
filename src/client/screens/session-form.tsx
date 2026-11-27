import { useState } from "react";
import { MAX_HOURS, splitSession } from "../../shared/money";
import { addHours, hoursBetween, START_TIMES } from "../../shared/session-time";
import { LOGIN_URL } from "../api";
import { useApp } from "../app-context";
import { byName, formatDayMonth, formatMoney, todayIso } from "../format";
import { Icon } from "../icons";
import { Avatar } from "../member-visuals";
import { MoneyInput } from "../money-input";
import { navigate } from "../use-hash-route";

/** 1, 2, … MAX_HOURS: whole hours only, never 1h30 */
const HOUR_CHOICES = Array.from({ length: MAX_HOURS }, (_, i) => i + 1);

// Create or edit one session: who paid, the two amounts, who came, how long
// they played, who drank.
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
  // Where and when. A new session starts from the last one's court and time.
  const template = editing ?? state.sessions[0];
  const [courtId, setCourtId] = useState<number | null>(template?.courtId ?? null);
  const [startTime, setStartTime] = useState<string | null>(template?.startTime ?? null);
  // How long the session ran, in whole hours: what everyone played unless set
  // lower for them. With a time range it is the range; otherwise the longest
  // anyone played.
  const [length, setLength] = useState(() => {
    const range = template?.startTime && template.endTime ? hoursBetween(template.startTime, template.endTime) : null;
    return range ?? Math.max(1, ...(template?.attendees.map((a) => a.hours) ?? []));
  });
  // memberId -> what they had and how long they played, for everyone who attended
  const [picked, setPicked] = useState(
    () => new Map(editing?.attendees.map((a) => [a.memberId, { drank: a.drank, hours: a.hours }])),
  );
  const [saving, setSaving] = useState(false);
  // A new session's id, fixed while the form is open: saving again after a
  // lost reply finds it already saved instead of adding it twice.
  const [newId] = useState(() => crypto.randomUUID());

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
  const attendees = [...picked].map(([memberId, { drank, hours }]) => ({ memberId, drank, hours }));
  const drinkers = attendees.filter((a) => a.drank).length;
  const endTime = startTime ? addHours(startTime, length) : null;
  // Hours only matter once the session ran longer than one hour.
  const timed = length > 1;

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
            : attendees.some((a) => a.hours > length)
              ? "Có người chơi lâu hơn khung giờ"
              : null;
  const shares = problem ? null : splitSession({ courtAmount: court, drinkAmount: drink, attendees });
  const collected = shares ? [...shares.values()].reduce((a, b) => a + b, 0) : 0;

  const toggle = (id: number, field: "present" | "drank") => {
    const next = new Map(picked);
    const current = next.get(id);
    if (field === "present") {
      if (current) next.delete(id);
      else next.set(id, { drank: false, hours: length });
    } else if (current) {
      next.set(id, { ...current, drank: !current.drank });
    }
    setPicked(next);
  };

  const setHours = (id: number, hours: number) => {
    const current = picked.get(id);
    if (current) setPicked(new Map(picked).set(id, { ...current, hours }));
  };

  // A new start keeps the length when it still ends by 23:30, else the longest that does.
  const changeStart = (next: string | null) => {
    setStartTime(next);
    if (next && !addHours(next, length)) {
      const fits = HOUR_CHOICES.filter((h) => addHours(next, h)).at(-1) ?? 1;
      changeLength(fits);
    }
  };

  // Whoever played the whole session keeps playing the whole of the new
  // length; anyone set lower stays as they are, within it.
  const changeLength = (next: number) => {
    setPicked(
      new Map(
        [...picked].map(([id, a]) => [id, { ...a, hours: a.hours === length ? next : Math.min(a.hours, next) }]),
      ),
    );
    setLength(next);
  };

  const save = async () => {
    // Two people (the payer and an admin) entering the same evening is the usual way a session gets counted twice.
    const twin = state.sessions.find((s) => s.id !== editing?.id && s.date === date && s.payerId === payerId);
    if (twin && !window.confirm(`Đã có buổi ${formatDayMonth(date)} do ${nameOf(twin.payerId)} ứng. Vẫn lưu thêm buổi này?`)) {
      return;
    }
    setSaving(true);
    const body = {
      date,
      payerId,
      courtId,
      startTime,
      endTime,
      courtAmount: court,
      drinkAmount: drink,
      note: note.trim() || null,
      attendees,
    };
    const ok = editing
      ? await write("PUT", `/api/sessions/${editing.id}`, body)
      : await write("POST", "/api/sessions", { ...body, id: newId });
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
          <label className="field">
            <span>Sân</span>
            <select value={courtId ?? ""} onChange={(e) => setCourtId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Chọn sân…</option>
              {state.courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {/* From a start on the half hour to an end whole hours later: the
              hours played stay whole. Without a start, just the number of hours. */}
          <div className="field-row">
            <label className="field">
              <span>Bắt đầu</span>
              <select value={startTime ?? ""} onChange={(e) => changeStart(e.target.value || null)}>
                <option value="">Chưa chọn</option>
                {START_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{startTime ? "Kết thúc" : "Số giờ chơi"}</span>
              <select value={length} onChange={(e) => changeLength(Number(e.target.value))}>
                {HOUR_CHOICES.filter((h) => !startTime || addHours(startTime, h)).map((h) => (
                  <option key={h} value={h}>
                    {startTime ? `${addHours(startTime, h)} · ${h}h` : `${h} giờ`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="card surface">
          <MoneyInput label="Sân + cầu" value={court} onChange={setCourt} />
          <MoneyInput label="Nước" value={drink} onChange={setDrink} />
        </section>

        <section className="card surface" role="group" aria-labelledby="attendees-label">
          {/* How many came is what everyone asks first: a big number, updated as names are ticked */}
          {/* Not a live region: the save bar already reads the count out */}
          <div id="attendees-label" className="headcount">
            <span>
              <strong>{attendees.length}</strong> người đi
            </span>
            <span className="headcount-drink">
              <Icon name="droplet" className="small" />
              {drinkers} uống
            </span>
          </div>
          {timed && <p className="hint">Tiền sân chia theo giờ chơi. Ai chơi ít hơn {length} giờ thì chọn lại cạnh tên.</p>}
          <ul className={timed ? "picker timed" : "picker"}>
            {members.map((m) => {
              const attendee = picked.get(m.id);
              const present = Boolean(attendee);
              const hours = attendee?.hours ?? length;
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
                  {timed && (
                    <select
                      className={hours < length ? "toggle hours short" : "toggle hours"}
                      aria-label={`${m.name} chơi mấy giờ`}
                      data-present={present}
                      value={hours}
                      disabled={!present}
                      onChange={(e) => setHours(m.id, Number(e.target.value))}
                    >
                      {/* Up to the session's length, or further if this person was stored longer */}
                      {HOUR_CHOICES.slice(0, Math.max(length, hours)).map((h) => (
                        <option key={h} value={h}>
                          {h}h
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="toggle drink"
                    aria-pressed={attendee?.drank === true}
                    aria-label={`${m.name} uống nước`}
                    disabled={!present}
                    onClick={() => toggle(m.id, "drank")}
                  >
                    <Icon name="droplet" className="small" />
                    {/* No room for the word once the hours sit beside it */}
                    {!timed && "Nước"}
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
              `${attendees.length} người · Thu ${formatMoney(collected)}` +
                (collected > court + drink ? ` · dư ${formatMoney(collected - court - drink)} về người ứng` : "")}
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
