import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../shared/types";
import { fetchState } from "./api";

/**
 * Loads the whole app state and keeps it fresh: once at start, after every
 * write (via `reload`), and whenever the app comes back to the foreground.
 */
export function useAppState(notify: (message: string) => void) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Id of the most recent load. A slower, older response must never overwrite
  // a newer one (e.g. a foreground refetch finishing after a post-save reload).
  const latest = useRef(0);

  /** Refetch everything; false when the request failed (old state is kept). */
  const reload = useCallback(async (): Promise<boolean> => {
    const id = ++latest.current;
    try {
      const data = await fetchState();
      if (id === latest.current) {
        setState(data);
        setLoadFailed(false);
      }
      return true;
    } catch {
      if (id === latest.current) setLoadFailed(true);
      return false;
    }
  }, []);

  // Initial load.
  useEffect(() => {
    const id = ++latest.current;
    fetchState().then(
      (data) => {
        if (id === latest.current) setState(data);
      },
      () => {
        if (id === latest.current) setLoadFailed(true);
      },
    );
  }, []);

  // A home-screen app resumes from the background without reloading, so
  // refetch when it becomes visible to pick up what other members entered.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      if (!(await reload())) notify("Chưa tải được số mới");
    };
    document.addEventListener("visibilitychange", onVisible);
    // The service worker says when a notification arrived while the app is open.
    const onMessage = (event: MessageEvent) => {
      if (event.data === "refresh") void reload();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [reload, notify]);

  return { state, loadFailed, reload };
}
