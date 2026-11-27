import { LOGIN_URL } from "./api";
import { useApp } from "./app-context";

// Who is signed in, with the way in or out. Signing in is what unlocks adding
// sessions and confirming money received; looking needs no account.
export function AccountCard() {
  const { state, me, write } = useApp();

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

  const member = state.members.find((m) => m.id === me.memberId);
  return (
    <section className="card surface">
      <div>
        <p className="row-title">{member?.name ?? (me.admin ? "Quản trị" : "Chưa có trong nhóm")}</p>
        <p className="account">
          {me.email}
          {member && me.admin && " · quản trị"}
        </p>
      </div>
      {!member && !me.admin && <p className="muted">Nhờ quản trị gắn email này vào tên bạn</p>}
      {!member && me.admin && <p className="muted">Điền email này vào tên bạn để ứng tiền</p>}
      <button type="button" className="button secondary" onClick={() => void write("POST", "/api/auth/logout")}>
        Đăng xuất
      </button>
    </section>
  );
}
