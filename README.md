# badminton-pay

Web app (PWA) chia tiền cầu lông cho nhóm 10-12 người. React + Vite và Hono API. Cùng một code API chạy được ở hai nơi: Cloudflare Workers + D1 (cũng là môi trường khi dev và chạy test), hoặc Docker trên VPS (Node + một file SQLite).

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
| `npm run deploy` | Build và deploy lên Cloudflare |
| `npm run test:server` | Build bản chạy trên server (Node + SQLite) và kiểm tra đầu-cuối |
| `npm run cf-typegen` | Sinh lại kiểu binding sau khi sửa `wrangler.jsonc` |

Deploy, đăng nhập Google, cập nhật, sao lưu:

- Cloudflare Workers + D1 (đang dùng): [docs/deployment-guide-cloudflare.md](docs/deployment-guide-cloudflare.md)
- VPS bằng Docker (khi server mở được cổng 80/443), kèm cách chuyển dữ liệu sang: [docs/deployment-guide.md](docs/deployment-guide.md)

## Cách tính tiền

- Ô nhập tiền dùng đơn vị nghìn đồng: gõ `100` nghĩa là 100.000đ. Số tiền vẫn được lưu và hiển thị theo đồng.
- Tiền sân + cầu chia cho người đi theo số giờ mỗi người chơi (giờ chẵn, 1 đến 6 giờ; ai cũng chơi hết buổi thì chia đều). Tiền nước chia đều cho người uống.
  Ví dụ sân 400.000đ, 2 giờ: 3 người chơi 2 giờ, 2 người chơi 1 giờ, tổng 8 giờ, mỗi giờ 50.000đ: người 2 giờ trả 100.000đ, người 1 giờ trả 50.000đ.
- Mỗi phần làm tròn lên 1.000đ. Người ứng tiền được ghi nhận tổng các phần đã chia, nên phần dư do làm tròn thuộc về người ứng.
- Số dư mỗi người = tiền đã ứng − phần phải chia + tiền đã chuyển − tiền đã nhận. Tổng số dư cả nhóm luôn bằng 0.
- App gợi ý ai chuyển cho ai, kèm mã QR và nút mở thẳng app ngân hàng trên iPhone (MB Bank, VietinBank, BIDV, ACB, OCB tự điền sẵn STK, số tiền, nội dung; app khác chỉ mở, STK được chép sẵn).
- App gợi ý ai chuyển cho ai. Người nợ chuyển xong bấm "Đã chuyển"; người nhận thấy thông báo ở đầu màn Số dư và bấm "Đã nhận" khi tiền về (hoặc "Chưa nhận"). Chỉ khi người nhận xác nhận thì số dư mới đổi. Người nhận bật "Báo lên điện thoại" (trang chủ hoặc tab Thành viên) thì điện thoại đổ chuông khi có người báo; trên iPhone cần thêm app ra màn hình chính, iOS 16.4 trở lên. Người nhận cũng tự bấm "Đã nhận" được khi chưa ai báo (vd. trả tiền mặt). Tiền về không khớp gợi ý nào (gợi ý đã đổi vì có buổi mới) thì người nhận bấm "Ghi tiền đã nhận" ở trang của mình, chọn người chuyển và số tiền.

## Ai làm được gì

- Xem thì không cần đăng nhập. Sửa thì đăng nhập một lần bằng Google, điền tên và số tài khoản để xin vào nhóm, rồi chờ quản trị bấm duyệt.
- Thành viên chỉ nhập, sửa, xóa buổi do chính mình ứng tiền.
- Chỉ người nhận tiền mới ghi nhận "Đã nhận", nên người nợ không tự xóa nợ được: "Đã chuyển" chỉ là lời báo.
- Lỡ nhập sai: bấm vào buổi hoặc khoản chuyển trong tab Lịch sử để sửa hoặc xóa (người ứng, người nhận, hoặc quản trị).
- Nhật ký (tab Lịch sử → Nhật ký) ghi ai thêm, sửa, xóa buổi hay chuyển khoản, lúc nào, trước và sau; ai cũng xem được, thay đổi đụng tới mình có chữ "Có bạn", thứ bị xóa khôi phục được.
- Thành viên tự sửa tên và số tài khoản của mình.
- Quản trị (email trong `ADMIN_EMAILS`) làm được mọi việc: duyệt người xin vào (thêm mới, hoặc gộp vào người đã thêm tay trước mà chưa có email), thêm tay thành viên, gắn email.

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
> Ai cũng xem được số nợ của mình và quét QR để chuyển khoản. Muốn nhập buổi mình ứng tiền hoặc xác nhận đã nhận tiền thì vào tab Thành viên, đăng nhập Google, điền tên và số tài khoản rồi bấm "Vào nhóm"; mình duyệt là dùng được.
