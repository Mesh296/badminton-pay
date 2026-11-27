import { z } from "zod";
import { BANK_CODES } from "../shared/banks";
import { MAX_AMOUNT, MAX_HOURS } from "../shared/money";

// Request body schemas. Every write is validated here before touching D1.

// Fallback for any rule without its own message below, so the client never
// shows zod's English defaults.
z.config({ customError: () => "Dữ liệu không hợp lệ" });

const memberId = z.number("Thành viên không hợp lệ").int("Thành viên không hợp lệ").positive("Thành viên không hợp lệ");
const amount = z
  .number("Số tiền không hợp lệ")
  .int("Số tiền phải là số nguyên")
  .min(0, "Số tiền không được âm")
  .max(MAX_AMOUNT, "Số tiền quá lớn");

// True only for a real calendar date; an out-of-range month or day makes an
// Invalid Date, whose toISOString() would throw.
function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const date = z
  .string("Ngày không hợp lệ")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ")
  // Rejects impossible dates such as 2026-02-31 or 2026-13-01.
  .refine(isRealDate, "Ngày không hợp lệ");

// Optional free text: missing, null and blank all become null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const memberSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên").max(40, "Tên quá dài"),
  bankCode: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || BANK_CODES.has(v), "Ngân hàng không hợp lệ"),
  accountNo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{0,20}$/, "Số tài khoản không hợp lệ")
    .nullish()
    .transform((v) => v || null),
  accountName: optionalText(60),
  // Google account the member signs in with; stored lowercase.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email không hợp lệ")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email không hợp lệ")
    .nullish()
    .transform((v) => v || null),
  active: z.boolean().default(true),
});

// What a person may say about themself: asking to join, or editing their own details.
export const profileSchema = memberSchema.pick({ name: true, bankCode: true, accountNo: true, accountName: true });

// Which existing member a join request is.
export const linkSchema = z.object({ memberId });

export const sessionSchema = z
  .object({
    // Chosen by the app when the form opens, so saving again after a lost
    // reply finds the session already there instead of adding it twice.
    id: z.uuid("Dữ liệu không hợp lệ").optional(),
    date,
    payerId: memberId,
    courtAmount: amount,
    drinkAmount: amount,
    note: optionalText(200),
    attendees: z
      .array(
        z.object({
          memberId,
          drank: z.boolean(),
          // Whole hours only (1h, 2h, 3h, never 1h30). Missing only from an
          // app opened before hours existed: an edit keeps what is stored, a
          // new session counts 1 hour (routes-sessions.ts).
          hours: z
            .number("Số giờ không hợp lệ")
            .int("Số giờ phải là số nguyên")
            .min(1, "Ít nhất 1 giờ")
            .max(MAX_HOURS, `Tối đa ${MAX_HOURS} giờ`)
            .optional(),
        }),
      )
      .min(1, "Chọn người đi")
      .max(50),
  })
  .superRefine((session, ctx) => {
    const ids = session.attendees.map((a) => a.memberId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Một người bị chọn 2 lần" });
    }
    if (session.courtAmount + session.drinkAmount === 0) {
      ctx.addIssue({ code: "custom", message: "Nhập tiền" });
    }
    if (session.drinkAmount > 0 && !session.attendees.some((a) => a.drank)) {
      ctx.addIssue({ code: "custom", message: "Chọn người uống" });
    }
  });

// Confirming a reported payment: what actually arrived, when it differs from the report.
// The body may be left out entirely.
export const confirmSchema = z.object({ amount: amount.min(1, "Số tiền phải lớn hơn 0").optional() }).optional();

export const transferSchema = z
  .object({
    date,
    fromId: memberId,
    toId: memberId,
    amount: amount.min(1, "Số tiền phải lớn hơn 0"),
    note: optionalText(200),
  })
  .refine((t) => t.fromId !== t.toId, "Người chuyển và người nhận phải khác nhau");

export type MemberInput = z.infer<typeof memberSchema>;
export type SessionInput = z.infer<typeof sessionSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
