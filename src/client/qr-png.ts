import { encode } from "uqr";

/**
 * The QR code as a PNG file, for handing to another app through the share
 * sheet (MoMo reads a shared QR image). Built synchronously, so the share can
 * still count as the user's tap. Black on white with a wide quiet zone, so it
 * scans from a photo.
 */
export function qrPngFile(text: string, name: string): File {
  const { data, size } = encode(text, { ecc: "M", border: 4 });
  const scale = 12;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
  const binary = atob(canvas.toDataURL("image/png").split(",")[1]);
  return new File([Uint8Array.from(binary, (char) => char.charCodeAt(0))], name, { type: "image/png" });
}
