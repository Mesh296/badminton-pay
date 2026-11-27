// Common Vietnamese banks. `code` is the NAPAS BIN that VietQR uses to identify
// the bank; `short` is VietQR's short code for it, which the bank-app deeplink
// takes. Values taken from https://api.vietqr.io/v2/banks (2026-11-27).

export interface Bank {
  code: string;
  short: string;
  name: string;
}

export const BANKS: Bank[] = [
  { code: "970436", short: "vcb", name: "Vietcombank" },
  { code: "970422", short: "mb", name: "MBBank" },
  { code: "970407", short: "tcb", name: "Techcombank" },
  { code: "970418", short: "bidv", name: "BIDV" },
  { code: "970415", short: "icb", name: "VietinBank" },
  { code: "970405", short: "vba", name: "Agribank" },
  { code: "970416", short: "acb", name: "ACB" },
  { code: "970432", short: "vpb", name: "VPBank" },
  { code: "970423", short: "tpb", name: "TPBank" },
  { code: "970403", short: "stb", name: "Sacombank" },
  { code: "970441", short: "vib", name: "VIB" },
  { code: "970437", short: "hdb", name: "HDBank" },
  { code: "970443", short: "shb", name: "SHB" },
  { code: "970448", short: "ocb", name: "OCB" },
  { code: "970426", short: "msb", name: "MSB" },
  { code: "970431", short: "eib", name: "Eximbank" },
  { code: "970429", short: "scb", name: "SCB" },
  { code: "970440", short: "seab", name: "SeABank" },
  { code: "970449", short: "lpb", name: "LPBank" },
  { code: "970428", short: "nab", name: "NamABank" },
  { code: "970425", short: "abb", name: "ABBANK" },
  { code: "970454", short: "vccb", name: "VietCapitalBank" },
  { code: "970412", short: "pvcb", name: "PVcomBank" },
  { code: "546034", short: "cake", name: "CAKE" },
  { code: "963388", short: "timo", name: "Timo" },
  { code: "546035", short: "ubank", name: "Ubank" },
];

export const BANK_CODES = new Set(BANKS.map((bank) => bank.code));

/**
 * iPhone banking apps the VietQR deeplink service can open, from
 * https://api.vietqr.io/v2/ios-app-deeplinks (2026-11-27), dropping apps with
 * no recorded installs. With `autofill` the app opens on a transfer already
 * filled in (account, amount, memo); the others only open.
 */
export const BANK_APPS: { id: string; name: string; autofill: boolean }[] = [
  { id: "mb", name: "MB Bank", autofill: true },
  { id: "icb", name: "VietinBank iPay", autofill: true },
  { id: "bidv", name: "BIDV SmartBanking", autofill: true },
  { id: "acb", name: "ACB ONE", autofill: true },
  { id: "ocb", name: "OCB OMNI", autofill: true },
  { id: "tcb", name: "Techcombank", autofill: false },
  { id: "vcb", name: "Vietcombank", autofill: false },
  { id: "vpb", name: "VPBank NEO", autofill: false },
  { id: "vba", name: "Agribank Plus", autofill: false },
  { id: "cake", name: "CAKE", autofill: false },
  { id: "tpb", name: "TPBank", autofill: false },
  { id: "lpb", name: "LPBank", autofill: false },
  { id: "timo", name: "Timo", autofill: false },
  { id: "vib-2", name: "MyVIB", autofill: false },
  { id: "hdb", name: "HDBank", autofill: false },
  { id: "shb", name: "SHB SAHA", autofill: false },
  { id: "seab", name: "SeAMobile", autofill: false },
  { id: "scb", name: "SCB Mobile Banking", autofill: false },
  { id: "shbvn", name: "Shinhan SOL", autofill: false },
  { id: "abb", name: "ABBank", autofill: false },
  { id: "pvcb", name: "PVConnect", autofill: false },
  { id: "eib", name: "Eximbank EDigi", autofill: false },
];
