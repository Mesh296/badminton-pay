import { useRef, useState } from "react";
import { LOGIN_URL } from "./api";
import { useApp } from "./app-context";
import { avatarFromFile } from "./avatar-photo";
import { Icon } from "./icons";
import { Avatar } from "./member-visuals";
import { turnOffPush } from "./push-notifications";
import { PushToggle } from "./push-toggle";
import { MemberForm } from "./screens/member-form";

// The top of the settings tab: who is signed in, or the way in. A member sees
// their avatar (tap it to edit their details) and their options; someone not
// in the group yet asks to join here.
export function AccountCard() {
  const { state, me, write } = useApp();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // A photo from the library (or the camera) becomes the member's avatar.
  const setPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const image = await avatarFromFile(file).catch(() => null);
    if (image) await write("PUT", "/api/avatars", { image });
    setUploading(false);
  };

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

  if (member) {
    if (editing) return <MemberForm member={member} mode="self" onDone={() => setEditing(false)} />;
    return (
      <>
        <section className="profile">
          {/* iPhone offers its photo library, the camera, or files */}
          <input
            ref={picker}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void setPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={uploading ? "profile-avatar uploading" : "profile-avatar"}
            onClick={() => picker.current?.click()}
            disabled={uploading}
            aria-label={member.avatar ? "Đổi ảnh đại diện" : "Chọn ảnh đại diện"}
          >
            <Avatar member={member} size="large" />
            <span className="profile-edit" aria-hidden="true">
              <Icon name="camera" className="small" />
            </span>
          </button>
          <h2>{member.name}</h2>
          <p className="muted">
            {me.email}
            {me.admin && " · quản trị"}
          </p>
          {member.avatar && (
            <button type="button" className="link" onClick={() => void write("DELETE", "/api/avatars")}>
              Xóa ảnh đại diện
            </button>
          )}
        </section>

        <ul className="list surface">
          <li>
            <button type="button" className="list-row setting-row" onClick={() => setEditing(true)}>
              <span className="setting-icon" aria-hidden="true">
                <Icon name="pencil" className="small" />
              </span>
              <span className="row-main">
                <span className="row-title">Sửa thông tin</span>
                <span className="row-sub">Tên, ngân hàng, số tài khoản</span>
              </span>
              <Icon name="chevron-right" className="small chevron" />
            </button>
          </li>
          <li>
            <PushToggle />
          </li>
        </ul>
      </>
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
      </section>
      {!request && <MemberForm mode="join" />}
    </>
  );
}

/** Red, at the very bottom of the settings tab. This phone stops ringing for this member first. */
export function SignOutButton() {
  const { me, write } = useApp();
  if (!me) return null;
  return (
    <button
      type="button"
      className="button signout"
      onClick={() => void turnOffPush().then(() => write("POST", "/api/auth/logout"))}
    >
      Đăng xuất
    </button>
  );
}
