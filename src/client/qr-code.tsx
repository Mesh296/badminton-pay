import { encode } from "uqr";

// A QR code drawn as SVG right in the page, so what it encodes never passes
// through, or depends on, an outside service. Black modules on a white tile in
// both themes, so banking apps can always scan it.
export function QrCode({ text, label }: { text: string; label: string }) {
  // Medium error correction; the two-module border plus the tile's padding is the quiet zone.
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  let path = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${size} ${size}`}
      width={240}
      height={240}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
