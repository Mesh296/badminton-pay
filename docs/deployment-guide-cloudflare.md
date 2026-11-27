# Hướng dẫn deploy lên Cloudflare

App chạy trên một Cloudflare Worker (gói miễn phí) với database D1. Không cần server, không cần tên miền: Cloudflare cấp địa chỉ `https://<tên>.<tài-khoản>.workers.dev` có sẵn HTTPS.

Mọi lệnh dưới đây chạy trên máy của bạn, trong thư mục repo, sau khi đã `npm install`.

Muốn chạy trên VPS của mình thì xem [deployment-guide.md](deployment-guide.md). Chuyển từ Cloudflare về VPS sau này: mục cuối của file này.

## 1. Deploy lần đầu

Cần tài khoản Cloudflare miễn phí.

1. Đăng nhập: `npx wrangler login`
2. Đổi `"name"` trong `wrangler.jsonc` thành tên khó đoán, ví dụ `bpay-x7k2m9`. Tên này nằm trong địa chỉ app; ai có địa chỉ là xem được dữ liệu.
3. Tạo database: `npx wrangler d1 create badminton-pay`, rồi chép `database_id` được in ra vào `wrangler.jsonc` (thay `local-placeholder`).
4. Tạo bảng: `npm run db:migrate:remote`
5. Deploy: `npm run deploy`. Ghi lại địa chỉ `https://<tên>.<tài-khoản>.workers.dev` được in ra.

Lúc này app đã xem được, nhưng chưa ai đăng nhập hay ghi được gì cho tới khi xong bước 2.

## 2. Đăng nhập Google

Mỗi thành viên đăng nhập một lần bằng tài khoản Google. App chỉ xin địa chỉ email.

1. Vào [Google Cloud Console](https://console.cloud.google.com/), tạo một project.
2. Mở **Google Auth Platform**, khai báo app: loại **External**, điền tên app và email liên hệ.
3. Mở **Clients** → **Create client** → **Web application**. Ở **Authorized redirect URIs** thêm `https://<tên>.<tài-khoản>.workers.dev/api/auth/callback`.
4. Chép **Client ID** và **Client secret**, rồi đặt bốn secret cho Worker (mỗi lệnh hỏi giá trị, dán vào rồi Enter):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET     # dán kết quả của: openssl rand -base64 32
npx wrangler secret put ADMIN_EMAILS       # email Google của quản trị; nhiều người thì cách nhau dấu phẩy
```

5. Mở app → tab **Thành viên** → **Đăng nhập Google** bằng email quản trị, điền tên của bạn rồi bấm **Vào nhóm** (quản trị vào thẳng, không cần duyệt).

   Thành viên khác tự làm đúng như vậy: đăng nhập Google, điền tên và số tài khoản, bấm **Vào nhóm**. Yêu cầu của họ hiện ở đầu tab **Thành viên** của quản trị; bấm **Duyệt** là họ dùng được. Bạn không phải gõ email của ai. Vẫn có thể thêm tay một người và điền email cho họ bằng **Thêm thành viên**.

Nếu Google từ chối thành viên vì app đang ở trạng thái thử nghiệm, vào **Audience** bấm **Publish app**.

Secret được giữ qua các lần deploy; chỉ đặt lại khi muốn đổi.

## 3. Kiểm tra

```bash
URL=https://<tên>.<tài-khoản>.workers.dev
curl -s $URL/api/health                                                                                           # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST $URL/api/members -H 'Content-Type: application/json' -d '{}'   # 401
curl -s $URL/robots.txt                                                                                           # Disallow: /
```

Trên iPhone: mở địa chỉ bằng Safari, bấm Chia sẻ → Thêm vào MH chính, mở app từ icon, đăng nhập Google ngay trong app đó, nhập một buổi thật, mở mã QR của một người đang nợ và quét bằng app ngân hàng để kiểm tra người nhận, số tiền, nội dung.

Đăng nhập Google trong app đã cài lên màn hình chính iPhone chưa được kiểm chứng: có nơi báo Google chặn trình duyệt nhúng. Nếu bị chặn, thành viên dùng app trong Safari (cùng địa chỉ, đăng nhập bình thường).

## Cập nhật app

```bash
npm run test && npm run deploy
```

Chạy từ máy bạn, không cần vào server nào. Dữ liệu và secret giữ nguyên.

`npm run deploy` tự áp các thay đổi database mới (thư mục `migrations/`) trước khi đưa code lên; nếu wrangler hỏi xác nhận thì đồng ý.

Bản mới lỗi thì quay về bản trước: `npx wrangler rollback`.

## Sao lưu và khôi phục

| Việc | Lệnh |
|---|---|
| Sao lưu ra file SQL | `npx wrangler d1 export badminton-pay --remote --output backup.sql` |
| Quay database về một thời điểm (7 ngày gần nhất ở gói miễn phí) | `npx wrangler d1 time-travel restore badminton-pay --timestamp=<thời-điểm>` |

File sao lưu chứa tên, email và số tài khoản của thành viên, không đưa vào git.

## Đổi quản trị, đăng xuất mọi người

```bash
npx wrangler secret put ADMIN_EMAILS     # đổi danh sách quản trị
npx wrangler secret put SESSION_SECRET   # giá trị mới: mọi máy phải đăng nhập lại
```

Gỡ quyền một thành viên: quản trị xóa email khỏi tên người đó. Bỏ tick "Còn chơi" không gỡ quyền, để người đã nghỉ vẫn xác nhận được tiền người khác trả cho mình.

Nên gắn địa chỉ `@gmail.com`. Email công ty hay trường học có thể bị thu hồi rồi cấp cho người khác, và người đó sẽ đăng nhập được với tên của thành viên cũ.

## Giới hạn gói miễn phí

Tại thời điểm viết (11/2026): Workers 100.000 request/ngày, D1 5 triệu dòng đọc/ngày, 100.000 dòng ghi/ngày, 5 GB. Nhóm 10-12 người dùng chưa tới 1% các mức này. Số liệu hiện hành: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/).

## Bảo mật cần biết

- Ai có địa chỉ app đều xem được tên, số dư và số tài khoản ngân hàng của thành viên. Email của thành viên chỉ quản trị thấy.
- Mã QR do chính app tạo ngay trên máy, không qua dịch vụ nào. Nút "Mở app ngân hàng" thì đi qua trang `dl.vietqr.io` của VietQR (Casso): số tài khoản, tên chủ tài khoản, số tiền và nội dung đi qua dịch vụ đó; địa chỉ app thì không (app không gửi Referer sang trang khác). Trước khi bấm chuyển trong app ngân hàng, xem tên người nhận do ngân hàng hiện ra có đúng người không (app nhắc tên đúng ngay dưới nút).
- Phiên đăng nhập là cookie có chữ ký, sống 1 năm. Mất máy thì đổi `SESSION_SECRET` để đăng xuất mọi người.
- Quyền đã bó hẹp: buổi do người ứng (hoặc quản trị) ghi, chuyển khoản do người nhận (hoặc quản trị) ghi.
- Mỗi lần thêm, sửa, xóa buổi hay ghi, hủy chuyển khoản đều vào nhật ký (tab **Lịch sử** → **Nhật ký**): ai làm, lúc nào, trước và sau thế nào. Cả nhóm xem được, nên ghi buổi giả để trừ nợ hay hủy một khoản đã nhận đều lộ tên người làm. Buổi hoặc khoản bị xóa khôi phục được ngay từ nhật ký; app không có cách sửa hay xóa nhật ký.

Ai làm được gì: xem bảng trong [deployment-guide.md](deployment-guide.md#ai-làm-được-gì).

## Chuyển về VPS sau này

Khi server đã mở được cổng 80 và 443, chuyển cả dữ liệu sang mà không mất gì:

1. Trên máy bạn, xuất dữ liệu: `npx wrangler d1 export badminton-pay --remote --output export.sql`, rồi chép `export.sql` lên server vào thư mục repo.
2. Trên server, dựng app theo [deployment-guide.md](deployment-guide.md) tới hết bước 5 (app chạy với database trống).
3. Nạp dữ liệu (ghi đè database trống đó):

```bash
docker compose stop app
docker compose run --rm --user root -v "$PWD/export.sql:/export.sql:ro" app sh -c 'rm -f /data/app.db && node --disable-warning=ExperimentalWarning -e "new (require(\"node:sqlite\").DatabaseSync)(\"/data/app.db\").exec(require(\"node:fs\").readFileSync(\"/export.sql\",\"utf8\"))" && chown node:node /data/app.db'
docker compose start app
```

4. Ở Google Cloud, thêm redirect URI của địa chỉ mới (`https://<tên-miền>/api/auth/callback`). Thành viên đăng nhập lại một lần ở địa chỉ mới.
5. Gửi nhóm địa chỉ mới. Khi mọi người đã chuyển, xóa Worker cũ: `npx wrangler delete`.

Từ lúc xuất dữ liệu tới lúc nhóm dùng địa chỉ mới, đừng nhập gì ở địa chỉ cũ, kẻo phần nhập sau không được mang theo.
