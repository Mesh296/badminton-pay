# badminton-pay

Web app (PWA) chia tiền cầu lông cho nhóm 10-12 người. React + Vite và Hono API. Bản chạy thật là Docker trên VPS (Node + một file SQLite); khi dev và chạy test thì dùng bộ giả lập Cloudflare Workers + D1 có sẵn trong repo, cùng một code API.

## Phát triển local

```bash
npm install
cp .dev.vars.example .dev.vars   # điền Google client, secret phiên, email quản trị
npm run db:migrate:local         # tạo schema D1 local
npm run dev                      # http://localhost:5173
```

| Lệnh | Việc |
|---|---|
| `npm run typecheck` | Kiểm tra kiểu |
| `npm run test` | Chạy test |
| `npm run build` | Build giao diện |
| `npm run test:server` | Build bản chạy trên server (Node + SQLite) và kiểm tra đầu-cuối |
| `npm run cf-typegen` | Sinh lại kiểu binding sau khi sửa `wrangler.jsonc` |

Deploy lên VPS bằng Docker, tên miền, đăng nhập Google, sao lưu: xem [docs/deployment-guide.md](docs/deployment-guide.md).

## Cách tính tiền

- Ô nhập tiền dùng đơn vị nghìn đồng: gõ `100` nghĩa là 100.000đ. Số tiền vẫn được lưu và hiển thị theo đồng.
- Tiền sân + cầu chia đều cho người đi; tiền nước chia đều cho người uống.
- Mỗi phần làm tròn lên 1.000đ. Người ứng tiền được ghi nhận tổng các phần đã chia, nên phần dư do làm tròn thuộc về người ứng.
- Số dư mỗi người = tiền đã ứng − phần phải chia + tiền đã chuyển − tiền đã nhận. Tổng số dư cả nhóm luôn bằng 0.
- App gợi ý ai chuyển cho ai; người nhận tiền bấm "Đã nhận" khi tiền về.

## Ai làm được gì

- Xem thì không cần đăng nhập. Sửa thì đăng nhập một lần bằng Google.
- Thành viên chỉ nhập, sửa, xóa buổi do chính mình ứng tiền.
- Chỉ người nhận tiền mới ghi nhận "Đã nhận", nên người nợ không tự xóa nợ được.
- Quản trị (email trong `ADMIN_EMAILS`) làm được mọi việc và là người thêm thành viên, gắn email Google cho từng người.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/shared/` | Logic chia tiền, danh sách ngân hàng, tạo link VietQR (dùng chung cho Worker và giao diện) |
| `src/worker/` | API Hono: đăng nhập Google, phân quyền, validate, đọc/ghi D1 |
| `src/server/` | Chạy API đó trên Node: phát giao diện, lớp nối sang file SQLite |
| `src/client/` | Giao diện React |
| `migrations/` | Schema D1 |
| `test/` | Test chạy trong môi trường Workers |

## Tin nhắn gửi nhóm

> App tính tiền cầu lông của nhóm mình: `<địa-chỉ-app>`
> Mở bằng Safari, bấm nút Chia sẻ → "Thêm vào MH chính" để có icon như app thường.
> Ai cũng xem được số nợ của mình và quét QR để chuyển khoản. Muốn nhập buổi mình ứng tiền hoặc xác nhận đã nhận tiền thì vào tab Thành viên, đăng nhập Google một lần (gửi mình email Google của bạn trước).
