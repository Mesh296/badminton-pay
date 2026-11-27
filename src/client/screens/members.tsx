import { useId, useState } from "react";
import { BANKS } from "../../shared/banks";
import type { JoinRequest } from "../../shared/types";
import { AccountCard, SignOutButton } from "../account-card";
import { useApp } from "../app-context";
import { byName } from "../format";
import { Icon } from "../icons";
import { Avatar } from "../member-visuals";
import { MemberForm } from "./member-form";

// The settings tab: requests to join (admins), who is signed in and their
// options, the member list (shown or hidden, remembered on this device), and
// signing out at the very bottom.
export function Settings() {
  return (
    <>
      <JoinRequestsCard />
      <AccountCard />
      <MembersSection />
      <SignOutButton />
    </>
  );
}

/** Whether the member list is shown, per device; admins start with it open. */
const OPEN_KEY = "members-open";

// Requests to join, for admins: always on top while any wait.
function JoinRequestsCard() {
  const { state, me, write } = useApp();
  // Only admins receive other people's requests.
  const requests = me?.admin ? state.joinRequests : [];
  const reject = (request: JoinRequest) => {
    if (window.confirm(`Từ chối ${request.name} (${request.email})?`)) void write("DELETE", `/api/join/${request.id}`);
  };
  // Members an admin added before they signed in: a request may be one of them.
  const withoutEmail = [...state.members].filter((m) => !m.email).sort(byName);
  const link = (request: JoinRequest, memberId: number) => {
    const member = state.members.find((m) => m.id === memberId);
    if (member && window.confirm(`Gộp ${request.email} vào ${member.name}? ${member.name} sẽ đăng nhập bằng email này.`)) {
      void write("POST", `/api/join/${request.id}/link`, { memberId });
    }
  };
  if (requests.length === 0) return null;
  return (
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
  );
}

// Everyone in the group; admins add and edit members here. Inactive members last.
function MembersSection() {
  const { state, me } = useApp();
  const admin = Boolean(me?.admin);
  // member id being edited, "new" for the add form, null when closed
  const [open, setOpen] = useState<number | "new" | null>(null);
  const [shown, setShown] = useState(() => {
    const saved = localStorage.getItem(OPEN_KEY);
    return saved === null ? admin || state.members.length === 0 : saved === "1";
  });
  const members = [...state.members].sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));

  const bodyId = useId();
  const toggle = () => {
    setShown(!shown);
    localStorage.setItem(OPEN_KEY, shown ? "0" : "1");
  };

  return (
    // Not <details>: Safari cannot animate it. The list slides open and shut
    // instead (components.css .members-collapse), and is inert while shut.
    <section className={shown ? "members-section open" : "members-section"}>
      <button type="button" className="members-toggle" aria-expanded={shown} aria-controls={bodyId} onClick={toggle}>
        <span className="setting-icon" aria-hidden="true">
          <Icon name="users" className="small" />
        </span>
        <span className="row-main">Thành viên · {state.members.length}</span>
        <Icon name="chevron-right" className="small chevron" />
      </button>
      <div id={bodyId} className="members-collapse" inert={!shown}>
      <div className="members-body">
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
      </div>
      </div>
    </section>
  );
}
