import { useCallback, useRef } from "react";
import { errorMessage, sendWrite } from "./api";
import type { AppContextValue } from "./app-context";

/**
 * Writes to the API. `write` sends one request, then reloads state so every
 * screen shows the new numbers. Problems are reported through `notify`; the
 * server decides what the signed-in account may change and its refusal is
 * shown as is.
 */
export function useWrite(reload: () => Promise<boolean>, notify: (message: string | null) => void) {
  const writing = useRef(false);

  return useCallback<AppContextValue["write"]>(
    async (method, path, body) => {
      // One write at a time: a second action while one is in flight is refused
      // (and said so), which also stops double saves and double deletes.
      if (writing.current) {
        notify("Đang lưu, đợi chút");
        return false;
      }
      writing.current = true;
      try {
        const res = await sendWrite(method, path, body).catch(() => null);
        if (!res) {
          // The reply may be what got lost: show what the server now has
          // before anyone taps again.
          void reload();
          notify("Mất mạng. Xem lại đã lưu chưa rồi hẵng thử lại.");
          return false;
        }
        if (!res.ok) {
          // Refused or gone: what this screen shows is out of date (signed out,
          // rights changed, row deleted by someone else). Reload so the controls
          // match what the account may still do.
          if ([401, 403, 404, 409].includes(res.status)) void reload();
          notify(await errorMessage(res));
          return false;
        }
        // Saved. If the refresh fails, say so: showing old numbers silently
        // would invite the user to enter the same thing twice.
        notify((await reload()) ? null : "Đã lưu. Mở lại app để thấy số mới.");
        return true;
      } finally {
        writing.current = false;
      }
    },
    [reload, notify],
  );
}
