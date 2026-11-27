import { useState } from "react";
import { BANKS } from "../../shared/banks";
import type { JoinRequest } from "../../shared/types";
import { AccountCard } from "../account-card";
import { useApp } from "../app-context";
import { byName } from "../format";
import { Icon } from "../icons";
import { Avatar } from "../member-visuals";
import { MemberForm } from "./member-form";

// Member list, with the sign-in card on top. Only admins see add/edit.
// Members are deactivated, never deleted.
export function Members() {
  const { state, me, write } = useApp();
  const admin = Boolean(me?.admin);
  // member id being edited, "new" for the add form, null when closed
  const [open, setOpen] = useState<number | "new" | null>(null);
  const members = [...state.members].sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));

  // Only admins receive other people's requests.
  const requests = admin ? state.joinRequests : [];
  const reject = (request: JoinRequest) => {
    if (window.confirm(`Từ chối ${request.name} (${request.email})?`)) void write("DELETE", `/api/join/${request.id}`);
  };
  // Members an admin added before they signed in: a request may be one of them.
  const withoutEmail = members.filter((m) => !m.email);
  const link = (request: JoinRequest, memberId: number) => {
    const member = state.members.find((m) => m.id === memberId);
    if (member && window.confirm(`Gộp ${request.email} vào ${member.name}? ${member.name} sẽ đăng nhập bằng email này.`)) {
      void write("POST", `/api/join/${request.id}/link`, { memberId });
    }
  };

  return (
    <>
      {requests.length > 0 && (
        <section className="card surface">
          <h3>Chờ duyệt</h3>
          <ul className="plain">
            {requests.map((request) => (
              <li key={request.id} className="join-request">
                <div className="split">
                  <span className="row-main">
                    <span className="row-title">{request.name}</span>
                    <span className="row-sub">{request.email}</span>
                  </span>
                  <span className="row-end">
                    <button type="button" className="link" onClick={() => reject(request)}>
                      Từ chối
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => void write("POST", `/api/join/${request.id}/approve`)}
                    >
                      Thêm mới
                    </button>
                  </span>
                </div>
                {withoutEmail.length > 0 && (
                  <label className="field">
                    <span>Hoặc là người đã có trong nhóm</span>
                    <select value="" onChange={(e) => link(request, Number(e.target.value))}>
                      <option value="">Gộp vào…</option>
                      {withoutEmail.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {!m.active && " (đã nghỉ)"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AccountCard />


      {admin &&
        (open === "new" ? (
          <MemberForm onDone={() => setOpen(null)} />
        ) : (
          <button type="button" className="button big" onClick={() => setOpen("new")}>
            <Icon name="plus" className="small" />
            Thêm thành viên
          </button>
        ))}

      {members.length === 0 && open !== "new" && <p className="empty">Chưa có thành viên</p>}

      {members.length > 0 && (
        <ul className="list surface">
          {members.map((member) => {
            const bank = BANKS.find((b) => b.code === member.bankCode)?.name;
            const summary = (
              <>
                <Avatar member={member} />
                <span className="row-main">
                  <span className="row-title">{member.name}</span>
                  <span className="row-sub">
                    {bank && member.accountNo ? `${bank} · ${member.accountNo}` : "Chưa có STK"}
                    {!member.active && " · đã nghỉ"}
                    {/* Emails are only sent to admins: shows who can sign in already. */}
                    {admin && ` · ${member.email ?? "chưa có email"}`}
                  </span>
                </span>
              </>
            );
            if (!admin) {
              return (
                <li key={member.id} className="list-row">
                  {summary}
                </li>
              );
            }
            return (
              <li key={member.id}>
                {open === member.id ? (
                  <MemberForm member={member} onDone={() => setOpen(null)} />
                ) : (
                  <button type="button" className="list-row" onClick={() => setOpen(member.id)}>
                    {summary}
                    <span className="row-end link-text">Sửa</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
