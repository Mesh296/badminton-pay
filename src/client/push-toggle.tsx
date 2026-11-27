import { useEffect, useId, useState } from "react";
import { GlassSwitch } from "./glass-switch";
import { Icon } from "./icons";
import { readStatus, turnOffPush, turnOn, type PushStatus } from "./push-notifications";

/**
 * "Thông báo" with its switch: rings this phone when someone reports paying
 * the signed-in member. A settings row by default; with `offerOnly` (home
 * screen, for whoever is owed) only while it could be turned on and is not.
 */
export function PushToggle({ offerOnly = false }: { offerOnly?: boolean }) {
  const labelId = useId();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    void readStatus().then(setStatus);
  }, []);

  if (status === null || (offerOnly && status !== "off" && !busy)) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      if (on) {
        setStatus(await turnOn());
      } else {
        await turnOffPush();
        setStatus("off");
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Chưa bật được thông báo");
    } finally {
      setBusy(false);
    }
  };

  // Why it cannot be switched here, or what went wrong.
  const note =
    status === "unsupported"
      ? "Thêm app vào màn hình chính (Chia sẻ → Thêm vào MH chính), mở từ đó rồi bật. Cần iOS 16.4 trở lên."
      : status === "blocked"
        ? "Đang bị chặn. Bật lại trong Cài đặt → Thông báo của điện thoại."
        : problem;

  return (
    <div className={offerOnly ? "setting-row offer" : "setting-row"}>
      {!offerOnly && (
        <span className="setting-icon" aria-hidden="true">
          <Icon name="bell" className="small" />
        </span>
      )}
      <span className="row-main">
        <span id={labelId} className="row-title">
          {offerOnly ? "Báo khi có người chuyển tiền" : "Bật thông báo"}
        </span>
        <span className="row-sub">{note ?? (offerOnly ? "Điện thoại sẽ đổ chuông" : "Báo khi có người chuyển tiền cho bạn")}</span>
      </span>
      <GlassSwitch
        checked={status === "on"}
        disabled={busy || status === "unsupported" || status === "blocked"}
        onChange={(on) => void toggle(on)}
        labelledBy={labelId}
      />
    </div>
  );
}
