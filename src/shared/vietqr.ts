// VietQR transfer codes, built in the app: the payload a banking app reads
// from the QR code, and the link that opens a banking app on a transfer.

export interface VietQrInput {
  bankCode: string; // NAPAS BIN
  accountNo: string;
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

/** One EMVCo field: two-digit id, two-digit length, value. */
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, start 0xFFFF), as four upper-case hex digits. */
function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * The text inside a VietQR (NAPAS 247) transfer code: EMVCo fields naming the
 * receiving bank and account, the amount in VND, and the memo, closed by a
 * checksum. Built here rather than fetched as an image from a QR service, so
 * no third party can swap the receiving account inside the code. Same
 * payload as img.vietqr.io produces for the same input (see the tests).
 */
export function vietQrPayload(input: VietQrInput): string {
  const account = field("00", input.bankCode) + field("01", input.accountNo);
  const body =
    field("00", "01") + // payload format
    field("01", "12") + // dynamic code: carries an amount
    field("38", field("00", "A000000727") + field("01", account) + field("02", "QRIBFTTA")) + // NAPAS, to an account
    field("53", "704") + // VND
    field("54", String(input.amount)) +
    field("58", "VN") +
    field("62", field("08", input.memo)) +
    "6304";
  return body + crc16(body);
}

export interface BankAppLinkInput {
  /** Which banking app to open, from BANK_APPS */
  appId: string;
  /** VietQR short code of the receiving bank, e.g. "mb" */
  bankShort: string;
  accountNo: string;
  accountName: string | null;
  amount: number;
  memo: string;
}

/**
 * Link that opens a banking app on the phone through VietQR's deeplink service
 * (https://www.vietqr.io/danh-sach-api/deeplink-app-ngan-hang/). Apps that
 * support it open on the transfer already filled in; the rest just open.
 */
export function bankAppUrl(input: BankAppLinkInput): string {
  const params = new URLSearchParams({
    app: input.appId,
    ba: `${input.accountNo}@${input.bankShort}`,
    am: String(input.amount),
    tn: input.memo,
    // Where the bank app may send the user after paying. The service requires
    // one and fills in the transfer only when it is there; VietQR's own site
    // keeps this app's address out of a third party's logs.
    url: "https://vietqr.io",
  });
  if (input.accountName) params.set("bn", input.accountName);
  return `https://dl.vietqr.io/pay?${params}`;
}
