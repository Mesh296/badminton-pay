import { useState } from "react";
import { BANKS } from "../../shared/banks";
import { AccountCard } from "../account-card";
import { useApp } from "../app-context";
import { byName } from "../format";
import { Icon } from "../icons";
import { Avatar } from "../member-visuals";
import { MemberForm } from "./member-form";

// Member list, with the sign-in card on top. Only admins see add/edit.
// Members are deactivated, never deleted.
export function Members() {
  const { state, me } = useApp();
  const admin = Boolean(me?.admin);
  // member id being edited, "new" for the add form, null when closed
  const [open, setOpen] = useState<number | "new" | null>(null);
  const members = [...state.members].sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));

  return (
    <>
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
