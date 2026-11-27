import { useEffect, useState } from "react";
import { readStatus, turnOffPush, turnOn, type PushStatus } from "./push-notifications";

/**
 * The switch in the account card. With `offerOnly` (home screen, for whoever
 * is owed) it shows only while notifications could be turned on and are not.
 */
export function PushToggle({ offerOnly = false }: { offerOnly?: boolean }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    void readStatus().then(setStatus);
  }, []);

  if (status === null || (offerOnly && status !== "off" && !busy)) return null;
  if (status === "unsupported") {
    return (
      <p className="hint">
        Muốn điện thoại báo khi có người chuyển tiền: thêm app vào màn hình chính (Chia sẻ → Thêm vào MH chính), mở app
        từ đó rồi bật ở đây. Cần iOS 16.4 trở lên.
      </p>
    );
  }
  if (status === "blocked") {
    return <p className="hint">Thông báo của app đang bị chặn. Bật lại trong Cài đặt → Thông báo.</p>;
  }

  const toggle = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (status === "on") {
        await turnOffPush();
        setStatus("off");
      } else {
        setStatus(await turnOn());
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Chưa bật được thông báo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="check">
        <input type="checkbox" checked={status === "on"} disabled={busy} onChange={() => void toggle()} />
        Báo lên điện thoại khi có người chuyển tiền cho mình
      </label>
      {problem && <p className="hint">{problem}</p>}
    </>
  );
}
