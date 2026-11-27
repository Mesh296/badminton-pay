// Common Vietnamese banks. `code` is the NAPAS BIN that VietQR uses to identify
// the bank. Values taken from https://api.vietqr.io/v2/banks (2026-11-27).

export interface Bank {
  code: string;
  name: string;
}

export const BANKS: Bank[] = [
  { code: "970436", name: "Vietcombank" },
  { code: "970422", name: "MBBank" },
  { code: "970407", name: "Techcombank" },
  { code: "970418", name: "BIDV" },
  { code: "970415", name: "VietinBank" },
  { code: "970405", name: "Agribank" },
  { code: "970416", name: "ACB" },
  { code: "970432", name: "VPBank" },
  { code: "970423", name: "TPBank" },
  { code: "970403", name: "Sacombank" },
  { code: "970441", name: "VIB" },
  { code: "970437", name: "HDBank" },
  { code: "970443", name: "SHB" },
  { code: "970448", name: "OCB" },
  { code: "970426", name: "MSB" },
  { code: "970431", name: "Eximbank" },
  { code: "970429", name: "SCB" },
  { code: "970440", name: "SeABank" },
  { code: "970449", name: "LPBank" },
  { code: "970428", name: "NamABank" },
  { code: "970425", name: "ABBANK" },
  { code: "970454", name: "VietCapitalBank" },
  { code: "970412", name: "PVcomBank" },
  { code: "546034", name: "CAKE" },
  { code: "963388", name: "Timo" },
  { code: "546035", name: "Ubank" },
];

export const BANK_CODES = new Set(BANKS.map((bank) => bank.code));
