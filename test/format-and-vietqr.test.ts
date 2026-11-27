import { describe, expect, it } from "vitest";
import { parseCssTimeMs } from "../src/client/css-time";
import { formatMoney, formatMoneyInput, formatMonth, parseMoney } from "../src/client/format";
import { BANK_APPS, BANKS } from "../src/shared/banks";
import { bankAppUrl, stripDiacritics, transferMemo, vietQrPayload } from "../src/shared/vietqr";

describe("CSS timing tokens", () => {
  it("reads both units, since the production build rewrites 420ms as .42s", () => {
    expect(parseCssTimeMs("420ms")).toBe(420);
    expect(parseCssTimeMs(" .42s")).toBe(420);
    expect(parseCssTimeMs("0.17s")).toBeCloseTo(170);
    expect(parseCssTimeMs("170ms ")).toBe(170);
    expect(parseCssTimeMs("")).toBe(0);
    expect(parseCssTimeMs("auto")).toBe(0);
  });
});

describe("money formatting", () => {
  it("formats and parses VND", () => {
    expect(formatMoney(85_000)).toBe("85.000đ");
    expect(formatMoneyInput(0)).toBe("");
    expect(parseMoney("abc")).toBe(0);
    expect(formatMonth("2026-11-27")).toBe("11/2026");
  });

  it("takes money input in thousands of dong", () => {
    // typing 100 means 100.000đ
    expect(parseMoney("100")).toBe(100_000);
    expect(parseMoney("1.250")).toBe(1_250_000);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("999999999")).toBe(100_000_000); // capped at the server limit
    expect(formatMoneyInput(100_000)).toBe("100");
    expect(formatMoneyInput(1_250_000)).toBe("1.250");
    // round trip keeps the stored amount
    expect(parseMoney(formatMoneyInput(320_000))).toBe(320_000);
  });
});

describe("VietQR", () => {
  it("builds an ASCII memo from a Vietnamese name", () => {
    expect(stripDiacritics("Đặng Cường")).toBe("Dang Cuong");
    expect(transferMemo("Bình (em)")).toBe("Cau long Binh em");
    expect(transferMemo("x".repeat(80)).length).toBe(50);
  });

  it("builds the same transfer code as VietQR's own image service", () => {
    // Decoded from https://img.vietqr.io/image/970436-0123456789-qr_only.png?amount=66000&addInfo=Cau%20long%20An
    expect(vietQrPayload({ bankCode: "970436", accountNo: "0123456789", amount: 66_000, memo: "Cau long An" })).toBe(
      "00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045405660005802VN62150811Cau long An6304098F",
    );
  });
});

describe("bank app deeplink", () => {
  it("names the receiving account as number@bank, with amount, memo, name and the return page the service requires", () => {
    const url = new URL(
      bankAppUrl({ appId: "mb", bankShort: "vcb", accountNo: "0123456789", accountName: "NGUYEN VAN A", amount: 85_000, memo: "Cau long Minh" }),
    );
    expect(url.origin + url.pathname).toBe("https://dl.vietqr.io/pay");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      app: "mb",
      ba: "0123456789@vcb",
      am: "85000",
      tn: "Cau long Minh",
      url: "https://vietqr.io",
      bn: "NGUYEN VAN A",
    });
  });

  it("has a short code for every bank and no duplicate app", () => {
    expect(BANKS.every((b) => /^[a-z]+$/.test(b.short))).toBe(true);
    expect(new Set(BANK_APPS.map((a) => a.id)).size).toBe(BANK_APPS.length);
  });
});
