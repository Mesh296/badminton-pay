import { useId } from "react";
import { encode } from "uqr";

// The payment QR code, drawn as SVG right in the page, so what it encodes never
// passes through, or depends on, an outside service. Dressed like the VietQR
// codes banks show: a white card with a red-to-blue rim, the "VietQR" name on
// top and a red and blue V in the middle. The code itself stays black on
// white in both themes, so banking apps can always scan it.

const RED = "#da251c";
const BLUE = "#0b5fa8";
/** White margin around the code inside the card, in modules (the quiet zone). */
const PAD = 3;
/** Room above the code for the "VietQR" name, in modules. */
const HEADER = 7;
/** Width of the V badge as a share of the code's width. */
const BADGE = 0.2;

export function QrCode({ text, label }: { text: string; label: string }) {
  // Several codes can share a page; each needs its own gradient id.
  const rim = `vietqr-rim-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Highest error correction: the badge hides the middle of the code, and the
  // remaining 30% redundancy still reads it.
  const { data, size } = encode(text, { ecc: "H", border: 0 });
  let path = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );

  const width = size + PAD * 2;
  const height = size + PAD * 2 + HEADER;
  const top = PAD + HEADER;
  // The badge: a white rounded square centred on the code, with the V in it.
  const side = size * BADGE;
  const cx = PAD + size / 2;
  const cy = top + size / 2;
  const arm = side * 0.3;
  const stroke = side * 0.17;

  return (
    <svg
      className="qr"
      viewBox={`0 0 ${width} ${height}`}
      width={248}
      height={(248 * height) / width}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={RED} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <rect x={0.6} y={0.6} width={width - 1.2} height={height - 1.2} rx={3.5} fill="#fff" stroke={`url(#${rim})`} strokeWidth={1.2} />
      <text
        x={width / 2}
        y={PAD + HEADER * 0.62}
        textAnchor="middle"
        fontSize={HEADER * 0.7}
        fontWeight={800}
        letterSpacing={-0.1}
      >
        <tspan fill={RED}>Viet</tspan>
        <tspan fill={BLUE}>QR</tspan>
      </text>
      <path d={path} fill="#000" transform={`translate(${PAD} ${top})`} shapeRendering="crispEdges" />
      <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} rx={side * 0.22} fill="#fff" />
      <path
        d={`M${cx - arm} ${cy - arm * 0.8}L${cx} ${cy + arm * 0.9}`}
        stroke={RED}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={`M${cx} ${cy + arm * 0.9}L${cx + arm} ${cy - arm * 0.8}`}
        stroke={BLUE}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
