import { formatMoney } from "./format";

/** Initial of the given name (the last word in Vietnamese names) on a quiet gray disc. */
export function Avatar({ member, size = "" }: { member: { name: string }; size?: "" | "small" | "large" }) {
  const lastWord = member.name.trim().split(/\s+/).pop() ?? "";
  const initial = Array.from(lastWord)[0]?.toUpperCase() ?? "?";
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {initial}
    </span>
  );
}

/** "nợ 85.000đ" / "nhận 120.000đ" / "hết nợ" as plain text: wording carries the meaning, color only reinforces it. */
export function BalanceLabel({ balance, large = false }: { balance: number; large?: boolean }) {
  const size = large ? " large" : "";
  if (balance < 0) return <span className={`balance debt${size}`}>nợ {formatMoney(-balance)}</span>;
  if (balance > 0) return <span className={`balance credit${size}`}>nhận {formatMoney(balance)}</span>;
  return <span className={`balance zero${size}`}>hết nợ</span>;
}
