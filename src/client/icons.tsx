import type { ReactNode } from "react";

// One small inline icon set (24px grid, 2px round strokes) so every icon
// shares the same visual language and follows the text color.

const PATHS = {
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10.5h18" />
      <circle cx="16.5" cy="14.75" r="0.75" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18.5 14.8c1.7.8 2.7 2.4 3 5.2" />
    </>
  ),
  // An eight-tooth gear with its hub
  settings: (
    <>
      <path d="M19 9.6L21.5 10.3V13.7L19 14.4L18.6 15.3L19.9 17.5L17.5 19.9L15.3 18.6L14.4 19L13.7 21.5H10.3L9.6 19L8.7 18.6L6.5 19.9L4.1 17.5L5.4 15.3L5 14.4L2.5 13.7V10.3L5 9.6L5.4 8.7L4.1 6.5L6.5 4.1L8.7 5.4L9.6 5L10.3 2.5H13.7L14.4 5L15.3 5.4L17.5 4.1L19.9 6.5L18.6 8.7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  transfer: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  droplet: <path d="M12 3.5c3 3.6 5.5 6.6 5.5 10a5.5 5.5 0 0 1-11 0c0-3.4 2.5-6.4 5.5-10z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/** Decorative icon; always paired with visible text or an aria-label on its parent. */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
