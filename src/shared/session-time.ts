import { MAX_HOURS } from "./money";

// A session's time range: "HH:MM" on the half hour, ending a whole number of
// hours (1 to MAX_HOURS) after it starts and no later than 23:30, so the
// hours played stay whole as everywhere else.

export const TIME_PATTERN = /^([01]\d|2[0-3]):[03]0$/;

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Every start a session can have: 05:00, 05:30, ... 22:30 (an hour before the last end). */
export const START_TIMES = Array.from({ length: (22.5 - 5) * 2 + 1 }, (_, i) => toTime(5 * 60 + i * 30));

/** "18:00" + 2 -> "20:00"; null past 23:30. */
export function addHours(start: string, hours: number): string | null {
  const end = toMinutes(start) + hours * 60;
  return end <= toMinutes("23:30") ? toTime(end) : null;
}

/** Whole hours from start to end, or null when they are not 1..MAX_HOURS whole hours apart. */
export function hoursBetween(start: string, end: string): number | null {
  const minutes = toMinutes(end) - toMinutes(start);
  const hours = minutes / 60;
  return Number.isInteger(hours) && hours >= 1 && hours <= MAX_HOURS ? hours : null;
}
