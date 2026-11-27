// Builds the VietQR "quick link" image URL (https://www.vietqr.io/danh-sach-api/link-tao-ma-nhanh/).
// The image is rendered by vietqr.io; the app only composes the URL.

export interface VietQrInput {
  bankCode: string; // NAPAS BIN
  accountNo: string;
  accountName: string | null;
  amount: number;
  memo: string;
}

/** Vietnamese text to plain ASCII, since bank memos do not carry diacritics reliably. */
export function stripDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Transfer memo, e.g. "Cau long Minh": ASCII letters, digits and spaces, max 50 chars. */
export function transferMemo(payerName: string): string {
  return `Cau long ${stripDiacritics(payerName)}`
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

// The documented .png path currently redirects to an .svg; <img> follows it.
export function vietQrUrl(input: VietQrInput): string {
  const params = new URLSearchParams({ amount: String(input.amount), addInfo: input.memo });
  if (input.accountName) params.set("accountName", input.accountName);
  const path = `${input.bankCode}-${encodeURIComponent(input.accountNo)}-compact2.png`;
  return `https://img.vietqr.io/image/${path}?${params}`;
}
