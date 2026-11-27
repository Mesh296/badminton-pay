import { useRef, useState } from "react";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** id of the text that names the setting */
  labelledBy: string;
}

/** Length of the knob's flip motion; matches the knob-to-on/off keyframes in components.css. */
const MOTION_MS = 560;

// An on/off switch with iPhone's colours, green when on and gray when off,
// and a knob that is a glass lens bigger than the track. A flip moves the
// knob like a drop of liquid (components.css .switch).
export function GlassSwitch({ checked, onChange, disabled = false, labelledBy }: Props) {
  const [moving, setMoving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const flip = () => {
    window.clearTimeout(timer.current);
    setMoving(true);
    timer.current = window.setTimeout(() => setMoving(false), MOTION_MS);
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={moving ? "switch moving" : "switch"}
      onClick={flip}
    >
      <span className="switch-knob" />
    </button>
  );
}
