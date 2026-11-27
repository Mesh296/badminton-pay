import { MAX_AMOUNT } from "../shared/money";

// Display helpers for money and dates (Vietnamese locale).

export { formatMoney } from "../shared/money";

const numberFormat = new Intl.NumberFormat("vi-VN");

// Money is typed in thousands of dong: "100" means 100.000đ. Amounts are
// still stored and shown as full dong everywhere else.
const INPUT_UNIT = 1000;

/** Value for a money text input, in thousands: 250000 -> "250", 1250000 -> "1.250", 0 -> "". */
export const formatMoneyInput = (amount: number) => (amount ? numberFormat.format(Math.floor(amount / INPUT_UNIT)) : "");

/** Typed thousands to dong: "250" -> 250000, "1.250" -> 1250000; capped at the server's limit. */
export const parseMoney = (text: string) =>
  Math.min((Number(text.replace(/\D/g, "").slice(0, 9)) || 0) * INPUT_UNIT, MAX_AMOUNT);

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date in the device's timezone as YYYY-MM-DD. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const weekdayFormat = new Intl.DateTimeFormat("vi-VN", { weekday: "short" });

/** "2026-11-27" -> "Th 6, 27/11"; the year is added only when it is not this year. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = weekdayFormat.format(new Date(year, month - 1, day));
  const yearPart = year === new Date().getFullYear() ? "" : `/${year}`;
  return `${weekday}, ${pad(day)}/${pad(month)}${yearPart}`;
}

/** "2026-11-27" -> "27/11", for tight rows */
export const formatDayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Short money for chart labels: 85.000đ -> "85k", 1.234.000đ -> "1,23tr". */
export function formatMoneyShort(amount: number): string {
  const thousands = Math.round(amount / 1000);
  // From 999.500đ up it is millions, so it never shows "1000k"
  if (Math.abs(thousands) >= 1000) {
    return `${(amount / 1_000_000).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}tr`;
  }
  return `${thousands}k`;
}

/** "2026-11-27" -> "11/2026" */

export const formatMonth = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "vi");
