import { formatMoneyInput, parseMoney } from "./format";

interface Props {
  label: string;
  /** Amount in dong. */
  value: number;
  onChange: (value: number) => void;
}

// Money field typed in thousands of dong: the user types 100, the fixed
// ".000đ" after it shows what that means, and onChange receives 100000.
export function MoneyInput({ label, value, onChange }: Props) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="money">
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={formatMoneyInput(value)}
          onChange={(e) => onChange(parseMoney(e.target.value))}
        />
        <span className="money-suffix">.000đ</span>
      </span>
    </label>
  );
}
