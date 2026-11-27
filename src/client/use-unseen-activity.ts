import { useEffect } from "react";
import type { ActivityEntry, AppState } from "../shared/types";

// What is new in the Thông báo tab on this device: entries made by someone
// else since the tab was last open. Kept per device, in localStorage.

const SEEN_KEY = "seen-activity";

/** Id of the newest entry seen when the tab was last open (0: never). */
export const readSeen = () => Number(localStorage.getItem(SEEN_KEY)) || 0;

/** The viewer's own doing, which is never news to them. */
export const isOwn = (entry: ActivityEntry, me: AppState["me"]) =>
  entry.actorMemberId !== null ? entry.actorMemberId === me?.memberId : entry.actorEmail === me?.email;

/**
 * True while there is news, for the dot on the tab. Showing the tab marks
 * everything seen; the feed reads the old mark first to point out what is new.
 */
export function useUnseenActivity(state: AppState | null, showing: boolean): boolean {
  const latest = state?.activity[0]?.id ?? 0;
  useEffect(() => {
    if (showing && latest > readSeen()) localStorage.setItem(SEEN_KEY, String(latest));
  }, [showing, latest]);
  if (!state || showing) return false;
  const seen = readSeen();
  return state.activity.some((entry) => entry.id > seen && !isOwn(entry, state.me));
}
