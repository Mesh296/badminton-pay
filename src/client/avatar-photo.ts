/** Side of the stored photo, in pixels: sharp on a 3× screen at the 96px profile size. */
const SIDE = 288;

/**
 * A photo picked on the phone, cropped to the centre square and shrunk to a
 * small JPEG (base64, without the data: prefix) ready to upload. Drawn
 * through an <img>, which applies the photo's own rotation.
 */
export async function avatarFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIDE;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIDE, SIDE);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}
