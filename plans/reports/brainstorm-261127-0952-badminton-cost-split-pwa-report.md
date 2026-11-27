---
type: brainstorm
date: 2026-11-27
slug: badminton-cost-split-pwa
status: approved
modes: []
---

# Brainstorm: app chia tiền cầu lông (PWA)

## Summary

Web app PWA cho nhóm cầu lông 10-12 người, dùng chủ yếu trên iPhone. Nhập 1 buổi (ai đi, ai uống nước, 2 con số tiền), app tính phần mỗi người, cộng dồn số dư, gợi ý ai chuyển cho ai kèm VietQR. Host Cloudflare Workers + D1, $0/tháng. Không lên App Store.

## Problem

- Users: nhóm cầu lông 10-12 người, số người đi mỗi buổi khác nhau (4, 6, ...).
- Struggle: 1 người ứng tiền, chia không đều (có người uống nước, có người không), tính tay rắc rối.
- Consequence: người ứng phải tự tính + đòi; người khác không biết mình nợ bao nhiêu.
- Success: nhập 1 buổi < 30s, ai cũng mở link xem được số nợ + quét QR trả.

Alternatives không code đã cân nhắc:

| Cách | Vì sao loại |
|---|---|
| Google Sheet chung | Nhập trên điện thoại khó, dễ sửa hỏng công thức, không QR |
| Splitwise / Tricount | 12 người phải cài + đăng ký, không VietQR, nhập split 2 lớp nhiều bước |

Evidence status: weak-medium (pain trực tiếp của user, chưa hỏi cả nhóm). Chấp nhận vì build rẻ, scope nhỏ.

## Requirements (đã chốt với user)

| Mục | Quyết định |
|---|---|
| Chia tiền | Sân+cầu (1 số) chia đều người đi; nước (1 số) chia đều người uống |
| Quyền ghi | 1 PIN chung, kiểm ở server |
| Quyền xem | Công khai, ai có link đều xem |
| Theo dõi nợ | Số dư cộng dồn qua nhiều buổi |
| Người ứng | Thay đổi theo buổi (user chọn, không phải thủ quỹ cố định) |
| Tính năng thêm | VietQR, lịch sử + thống kê |
| VietQR | Ảnh từ `img.vietqr.io` |
| Stack | Cloudflare Workers + D1 |
| Phân phối | PWA, Add to Home Screen |

Out of scope vòng đầu: khách vãng lai, chia theo giờ chơi, login từng người, offline, thông báo, tính theo món nước từng người.

## Approaches evaluated

### Phân phối trên iPhone

| Cách | Chi phí | Kết luận |
|---|---|---|
| TestFlight | $99/năm | Loại: build hết hạn 90 ngày, mời từng người |
| Ad-hoc / sideload | $99/năm hoặc free | Loại: đăng ký UDID; bản free hết hạn 7 ngày |
| PWA | $0 | Chọn |

### Hosting / stack

| Hướng | Ưu | Nhược | Kết luận |
|---|---|---|---|
| A. Cloudflare Workers + D1 + React SPA | 1 deploy, $0, không ngủ đông, PIN ở server, SQL hợp cộng dồn | Viết API nhỏ, học wrangler | Chọn |
| B. Next.js + Vercel + Neon | Quen thuộc | 2 dịch vụ, cold start, nặng quá mức cần | Loại |
| C. Static + Firebase | Ít code nhất, realtime | PIN chỉ ở client, cộng dồn ở client | Loại |
| Vercel + Supabase free | Dễ | Supabase pause sau ~7 ngày idle, nhóm đánh tuần/lần dính | Loại |

## Final design

### Ledger

```
số dư = tiền đã ứng − phần phải chia + tiền đã chuyển đi − tiền đã nhận
```

- Dương = được nhận lại, âm = nợ. Tổng số dư cả nhóm luôn = 0.
- Số dư derive từ dữ liệu gốc, không lưu sẵn → sửa buổi cũ tự đúng lại.
- Gợi ý chuyển khoản: greedy ghép người nợ nhiều nhất với người được nhận nhiều nhất, tối đa n−1 lần chuyển.

### Split 1 buổi

- share sân = court_amount / số người đi; share nước = drink_amount / số người uống.
- Mỗi share làm tròn lên 1.000đ.
- Người ứng được ghi credit = tổng các share (≥ số thực chi vài nghìn) → giữ invariant tổng = 0.
- Người ứng có thể không nằm trong danh sách người đi.

### Data (D1)

| Bảng | Cột chính |
|---|---|
| `members` | id, name, bank_code, account_no, account_name, active |
| `sessions` | id, date, payer_id, court_amount, drink_amount, note |
| `session_attendees` | session_id, member_id, drank, share |
| `transfers` | id, from_id, to_id, amount, date, note |

Member chỉ soft-deactivate, không xoá.

### Screens

1. Số dư (home): list thành viên + số nợ/được nhận, nút "+ Buổi mới".
2. Chi tiết 1 người: "chuyển cho X: N đ", VietQR, nút "Đã chuyển" (cần PIN), lịch sử người đó.
3. Buổi mới / sửa: ngày (default hôm nay), người ứng, 2 ô tiền, list tên với 2 toggle đi/uống, preview tiền mỗi người.
4. Lịch sử + thống kê: buổi + transfers; tổng chi theo tháng, số buổi mỗi người.
5. Thành viên: thêm/sửa tên + tài khoản ngân hàng.

### Tech

- React + Vite + TypeScript SPA; Hono API trên Workers; static assets + API chung 1 Worker.
- PIN = Worker secret; request ghi kèm PIN header, sai → 401; client nhớ PIN trong localStorage.
- VietQR: `<img>` tới `img.vietqr.io` với bank, account, amount, addInfo.
- PWA: manifest + apple-touch-icon; không service worker.
- `noindex`; số tài khoản chỉ hiện ở màn QR.
- Unit test (vitest) cho 3 hàm tiền: split buổi, tính số dư, gợi ý chuyển khoản.

## Risks

| Rủi ro | Xử lý |
|---|---|
| Xem công khai: ai đoán URL thấy tên + số nợ | User chấp nhận. noindex, tên subdomain khó đoán. Nâng cấp: PIN cả khi xem |
| VietQR qua bên thứ ba (số TK + số tiền) | User chấp nhận. Nâng cấp: tự sinh EMVCo QR trong app (~40 dòng + lib qrcode) |
| PIN ngắn dễ brute-force | PIN ≥ 6 ký tự + 1 rate-limit rule free của Cloudflare |
| Ghi nhận chuyển khoản thủ công | Người nhận là người bấm xác nhận; không tích hợp ngân hàng |
| Scope creep | Giữ danh sách out-of-scope ở trên |

## Success criteria

- Nhập buổi 6 người, 3 uống < 30s trên iPhone.
- Tổng share của 1 buổi = credit của người ứng; tổng số dư = 0 luôn đúng.
- Sau khi chuyển theo gợi ý, mọi số dư về 0.
- Quét QR bằng app ngân hàng: đúng người nhận, số tiền, nội dung.
- Request ghi không PIN → 401.
- Add to Home Screen mở full-screen trên iOS.
- $0/tháng.

## Next steps

1. `/ck:plan` với report này.
2. User tạo tài khoản Cloudflare free (nếu chưa có).
3. Thu thập tên + tài khoản ngân hàng thành viên để seed.

## Unresolved questions

- Danh sách ngân hàng: hardcode ~15 bank phổ biến hay fetch từ `api.vietqr.io/v2/banks`?
- Ai bấm "Đã chuyển": người chuyển hay người nhận (cả hai đều cần PIN chung, app không phân biệt được)?
- Styling: plain CSS hay Tailwind (để plan quyết).
