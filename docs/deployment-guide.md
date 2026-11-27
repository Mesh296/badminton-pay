# Hướng dẫn deploy lên VPS (Docker)

Không có VPS, hoặc VPS chưa mở được cổng 80 và 443: dùng [deployment-guide-cloudflare.md](deployment-guide-cloudflare.md).

App chạy trên một VPS Linux bằng Docker, gồm hai container:

- `app`: Node chạy API và phát giao diện; toàn bộ dữ liệu là một file SQLite trong volume `app-data`.
- `caddy`: nhận cổng 80/443, tự xin và gia hạn chứng chỉ HTTPS.

## Cần có

- VPS Ubuntu có quyền `sudo`, mở cổng TCP 80 và 443 ở cả hai lớp: tường lửa của nhà cung cấp (Oracle Cloud: luật Ingress trong Security List của subnet, cần quyền trên trang quản trị) và trên máy (`ufw`, hoặc `iptables` với Ubuntu của Oracle). Thử từ máy khác: `nc -vz <IP> 443` hết thời gian chờ nghĩa là còn bị chặn.
- Một tên miền trỏ về IP của VPS. Đăng nhập Google chỉ chạy trên tên miền có HTTPS; Google không nhận địa chỉ IP.
- Một tài khoản Google để tạo phần đăng nhập.

## 1. Cài Docker

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER      # rồi thoát SSH và vào lại
docker --version && docker compose version
```

Nếu `ufw` đang bật: `sudo ufw allow 80,443/tcp`.

## 2. Tên miền

Chọn một trong hai:

- **Mua tên miền**, rồi tạo bản ghi `A` trỏ về IP của VPS (ví dụ `caulong.tenmien.com`).
- **Tên miền phụ miễn phí**: đăng ký ở [DuckDNS](https://www.duckdns.org/), tạo một tên (ví dụ `caulong-nhom.duckdns.org`) và điền IP của VPS.

Kiểm tra đã trỏ đúng: `ping <tên-miền>` phải ra IP của VPS.

Chưa có tên miền thì vẫn chạy thử được ở chế độ chỉ xem: đặt `PUBLIC_URL=http://<IP>` ở bước 5. Khi đó ai cũng xem được số dư nhưng không ai đăng nhập hay ghi được.

## 3. Đưa code lên server

```bash
git clone <địa-chỉ-repo> badminton-pay && cd badminton-pay
```

Hoặc chép từ máy mình: `rsync -av --exclude node_modules --exclude .git ./ ubuntu@<IP>:badminton-pay/`.

## 4. Đăng nhập Google

Mỗi thành viên đăng nhập một lần bằng tài khoản Google. App chỉ xin địa chỉ email.

1. Vào [Google Cloud Console](https://console.cloud.google.com/), tạo một project.
2. Mở **Google Auth Platform**, khai báo app: loại **External**, điền tên app và email liên hệ.
3. Mở **Clients** → **Create client** → **Web application**. Ở **Authorized redirect URIs** thêm `https://<tên-miền>/api/auth/callback`.
4. Chép **Client ID** và **Client secret** để dùng ở bước 5.

Nếu Google từ chối thành viên vì app đang ở trạng thái thử nghiệm, vào **Audience** bấm **Publish app**.

## 5. Cấu hình và chạy

```bash
cp .env.example .env
nano .env
```

| Biến | Giá trị |
|---|---|
| `PUBLIC_URL` | Đúng địa chỉ mọi người mở, ví dụ `https://caulong-nhom.duckdns.org` (không có dấu `/` ở cuối) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Lấy ở bước 4 |
| `SESSION_SECRET` | Kết quả của `openssl rand -base64 32` |
| `ADMIN_EMAILS` | Email Google của quản trị; nhiều người thì cách nhau dấu phẩy |

```bash
docker compose up -d --build
docker compose logs -f        # Ctrl+C để thoát
```

Lần đầu Caddy mất khoảng nửa phút để xin chứng chỉ. File `.env` chứa bí mật, không đưa vào git.

Sau đó: mở app → tab **Thành viên** → **Đăng nhập Google** bằng email quản trị, điền tên của bạn rồi bấm **Vào nhóm** (quản trị vào thẳng, không cần duyệt).

Thành viên khác tự làm đúng như vậy: đăng nhập Google, điền tên và số tài khoản, bấm **Vào nhóm**. Yêu cầu của họ hiện ở đầu tab **Thành viên** của quản trị; bấm **Duyệt** là họ dùng được. Bạn không phải gõ email của ai. Vẫn có thể thêm tay một người và điền email cho họ bằng **Thêm thành viên**.

## 6. Kiểm tra

```bash
URL=https://<tên-miền>
curl -s $URL/api/health                                                                                           # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST $URL/api/members -H 'Content-Type: application/json' -d '{}'   # 401
curl -s $URL/robots.txt                                                                                           # Disallow: /
```

Trên iPhone: mở địa chỉ bằng Safari, bấm Chia sẻ → Thêm vào MH chính, mở app từ icon, đăng nhập Google ngay trong app đó, nhập một buổi thật, mở mã QR của một người đang nợ và quét bằng app ngân hàng để kiểm tra người nhận, số tiền, nội dung.

Đăng nhập Google trong app đã cài lên màn hình chính iPhone chưa được kiểm chứng: có nơi báo Google chặn trình duyệt nhúng. Nếu bị chặn, thành viên dùng app trong Safari (cùng địa chỉ, đăng nhập bình thường).

## Cập nhật bản mới

```bash
git pull
docker compose up -d --build
```

Thay đổi cấu trúc dữ liệu (thư mục `migrations/`) tự chạy khi app khởi động. Nên sao lưu trước khi cập nhật.

## Sao lưu và khôi phục

Sao lưu ra file `backup.db` trong thư mục hiện tại (app vẫn chạy):

```bash
docker compose exec app node --disable-warning=ExperimentalWarning -e "new (require('node:sqlite').DatabaseSync)('/data/app.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp app:/data/backup.db ./backup.db
docker compose exec app rm /data/backup.db
```

Khôi phục từ `backup.db` (ghi đè dữ liệu hiện tại):

```bash
docker compose stop app
docker compose run --rm --user root -v "$PWD/backup.db:/backup.db:ro" app sh -c 'cp /backup.db /data/app.db && chown node:node /data/app.db'
docker compose start app
```

File sao lưu chứa tên, email và số tài khoản của thành viên, không đưa vào git. Nên chép một bản ra ngoài VPS.

`docker compose down -v` xóa luôn volume dữ liệu. Dừng app thì dùng `docker compose down` (không có `-v`).

## Đổi quản trị, đăng xuất mọi người

Sửa `.env` rồi chạy `docker compose up -d`:

- Đổi `ADMIN_EMAILS` để đổi danh sách quản trị.
- Đổi `SESSION_SECRET` sang giá trị mới: mọi máy phải đăng nhập lại.

Gỡ quyền một thành viên: quản trị xóa email khỏi tên người đó (người đó vẫn gửi lại yêu cầu được, và bạn từ chối được). Bỏ tick "Còn chơi" không gỡ quyền, để người đã nghỉ vẫn xác nhận được tiền người khác trả cho mình.

Nên gắn địa chỉ `@gmail.com`. Email công ty hay trường học có thể bị thu hồi rồi cấp cho người khác, và người đó sẽ đăng nhập được với tên của thành viên cũ.

## Ai làm được gì

| Vai | Được làm |
|---|---|
| Chưa đăng nhập | Xem số dư, lịch sử, mã QR |
| Đã đăng nhập, chưa được duyệt | Như trên, và gửi yêu cầu vào nhóm |
| Thành viên | Nhập, sửa, xóa buổi do chính mình ứng tiền; bấm "Đã nhận" cho tiền người khác chuyển cho mình; sửa tên và số tài khoản của mình |
| Quản trị | Mọi thứ ở trên cho bất kỳ ai, duyệt hoặc từ chối người xin vào, thêm và sửa thành viên, gắn email |

Người nợ không tự bấm xóa nợ được: chỉ người nhận tiền (hoặc quản trị) mới ghi nhận đã nhận.

## Bảo mật cần biết

- Ai có địa chỉ app đều xem được tên, số dư và số tài khoản ngân hàng của thành viên. Email của thành viên chỉ quản trị thấy. Muốn kín hơn thì đổi `GET /api/state` sang yêu cầu đăng nhập.
- Mã QR do `img.vietqr.io` tạo, nên số tài khoản và số tiền đi qua dịch vụ đó.
- Phiên đăng nhập là cookie có chữ ký, sống 1 năm. Mất máy thì đổi `SESSION_SECRET` để đăng xuất mọi người.
- App không lưu nhật ký ai sửa gì. Quyền đã bó hẹp: buổi do người ứng (hoặc quản trị) ghi, chuyển khoản do người nhận (hoặc quản trị) ghi.
- `PUBLIC_URL` phải đúng địa chỉ thật. Sai thì đăng nhập hỏng và mọi thao tác ghi bị từ chối.

## Chuyển từ Cloudflare sang

Đang chạy trên Cloudflare và muốn mang dữ liệu về VPS: làm theo mục "Chuyển về VPS sau này" trong [deployment-guide-cloudflare.md](deployment-guide-cloudflare.md).
