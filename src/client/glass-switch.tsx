import { useRef, useState } from "react";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** id of the text that names the setting */
  labelledBy: string;
}

/** How long the knob stays a glass lens after a flip; matches --base in tokens.css. */
const LENS_MS = 320;

// An on/off switch in the iPhone style: green track when on, gray when off.
// At rest the knob is a white pill; while pressed and as it slides it swells
// into a clear glass lens larger than the track, the green or gray showing
// through, then settles back (components.css .switch).
export function GlassSwitch({ checked, onChange, disabled = false, labelledBy }: Props) {
  const [moving, setMoving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const flip = () => {
    window.clearTimeout(timer.current);
    setMoving(true);
    timer.current = window.setTimeout(() => setMoving(false), LENS_MS);
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
