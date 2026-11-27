import { useState } from "react";
import { LOGIN_URL } from "./api";
import { useApp } from "./app-context";
import { MemberForm } from "./screens/member-form";

// Who is signed in, with the way in or out. Signing in is what unlocks adding
// sessions and confirming money received; looking needs no account.
// A signed-in person who is not in the group yet asks to join here.
export function AccountCard() {
  const { state, me, write } = useApp();
  const [editing, setEditing] = useState(false);

  if (!me) {
    return (
      <section className="card surface">
        <p className="muted">Đăng nhập để thêm buổi và xác nhận tiền về</p>
        <a className="button" href={LOGIN_URL}>
          Đăng nhập Google
        </a>
      </section>
    );
  }

  const signOut = (
    <button type="button" className="button secondary" onClick={() => void write("POST", "/api/auth/logout")}>
      Đăng xuất
    </button>
  );
  const member = state.members.find((m) => m.id === me.memberId);

  // In the group: identity, own details, sign out.
  if (member) {
    if (editing) return <MemberForm member={member} mode="self" onDone={() => setEditing(false)} />;
    return (
      <section className="card surface">
        <div>
          <p className="row-title">{member.name}</p>
          <p className="row-sub">
            {me.email}
            {me.admin && " · quản trị"}
          </p>
        </div>
        <div className="row-buttons">
          <button type="button" className="button secondary" onClick={() => setEditing(true)}>
            Sửa thông tin
          </button>
          {signOut}
        </div>
      </section>
    );
  }

  // Not in the group yet. For a non-admin, joinRequests holds only their own request.
  const request = state.joinRequests.find((r) => r.email === me.email);
  return (
    <>
      <section className="card surface">
        <div>
          <p className="row-title">{request ? `${request.name} · chờ duyệt` : "Chưa vào nhóm"}</p>
          <p className="row-sub">{me.email}</p>
        </div>
        {request ? (
          <p className="muted">Đã gửi. Quản trị duyệt là bạn dùng được.</p>
        ) : (
          <p className="muted">{me.admin ? "Điền tên để thêm chính bạn vào nhóm" : "Điền tên để xin vào nhóm"}</p>
        )}
        {signOut}
      </section>
      {!request && <MemberForm mode="join" />}
    </>
  );
}
