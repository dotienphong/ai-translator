# Sổ tay chạy A5 (soak 2 giờ) và A7 (qua proxy) trên Mac

Rút gọn Task 6 và Task 7 của `docs/superpowers/plans/2026-10-03-phase-1-08b-nghiem-thu-dieu-phoi.md`, điền sẵn tên
tiến trình, đường dẫn và máy chủ thật của máy này (MacBook Pro M4 Pro, macOS 26). Chạy từ gốc repo:

```bash
cd ~/Desktop/software_business/ai-translator
```

## Điều cần biết trước

- **Tên tiến trình trên Mac** (khác kế hoạch, vốn viết `asr-worker`, `llama-server`):

  | Tiến trình | Tên |
  |---|---|
  | App | `meeting-translator` |
  | Nhận dạng | `asr-worker-aarch64-apple-darwin` |
  | Dịch | `llama-server-aarch64-apple-darwin` |
  | WebView | `com.apple.WebKit.*` (4 tiến trình) |

  `soak.py pids --app meeting-translator` liệt kê đúng 7 tiến trình này (đã kiểm 2026-10-05).

  **Đó là tên của bản dev.** Bản release đóng gói (`.app` trong `/Applications`) đặt tên tiến trình phụ là `asr-worker` và
  `llama-server` (không có hậu tố `-aarch64-apple-darwin`); `summarize` không cần `--require` vì mặc định đã theo tên này
  (đã chạy A5 trên bản release 2026-10-06). Chỉ bản dev mới cần `--require` với tên dài.
- **Bản đo chính thức:** A5 và A7 tính trên **bản release** (build release, không có `debug_assertions`), cài vào
  `/Applications`. Từ spec 2026-10-05 bản release **ký ad-hoc** (khi chưa có Developer ID) vẫn qua phép tự kiểm và chạy
  gói trả phí, nên đo được như bản Developer ID; ghi rõ cách ký vào báo cáo ("ký ad-hoc, không notarize"). Dựng bản này bằng
  `AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh`, rồi `ditto` vào `/Applications`. Bản dev
  (`scripts/run-dev-app.sh`) chỉ để thử công cụ (dry-run); số đo RAM, CPU của bản dev **không** dùng làm kết luận A5.
  Lần đầu mở bản mới macOS hỏi Keychain (khoảng 5 lần) và quyền thu âm: bấm **Always Allow** và cho phép; bấm Hủy thì app
  không đọc được bản quyền, phải thoát hẳn rồi mở lại.
- Cắm sạc, tắt Docker và trình duyệt nặng, đóng app đang ngốn CPU. Đừng để máy ngủ.
- Công cụ lấy mẫu chỉ thấy tiến trình của chính app (qua tiến trình chịu trách nhiệm của hệ điều hành), nên Safari, Mail
  mở sẵn không làm lệch số.

## A5: soak 2 giờ

1. Mở app (`! scripts/run-dev-app.sh` cho bản dev), vào **Cài đặt › Bản quyền** nhập key để có Professional.
2. Bấm **Bắt đầu** với một nguồn âm thanh bất kỳ, rồi kiểm công cụ thấy đủ tiến trình:
   ```bash
   python3 bench/phase1/acceptance/soak.py pids --app meeting-translator
   ```
   Phải có đủ 7 dòng (app, 4 `com.apple.WebKit.*`, hai tiến trình phụ).
3. Chuẩn bị âm thanh **dài hơn 2 giờ, nói tiếng Anh liên tục**: bài giảng hay buổi họp công khai trên YouTube, phát qua
   loa ở âm lượng thường (app thu âm thanh hệ thống, không dùng micro). Nếu chỉ thử công cụ, vòng lặp file mẫu 5 giây
   cũng đủ để có tải (không dùng cho kết luận A5, vì nói lặp lại):
   ```bash
   end=$((SECONDS+7320)); while [ $SECONDS -lt $end ]; do afplay public/listen-test-en.wav; done
   ```
4. Lấy mẫu 2 giờ 2 phút, `caffeinate` giữ máy thức (lệnh dừng khi chạy xong):
   ```bash
   caffeinate -i python3 bench/phase1/acceptance/soak.py sample --app meeting-translator --every 10 --duration 7320 \
     --out bench/phase1/results/acceptance/a5-mac.csv
   ```
   Cuối lệnh in `733 mẫu, ghi …`. Mỗi 30 phút ghi GPU từ **Activity Monitor › Window › GPU History** vào
   `bench/phase1/results/acceptance/a5-mac.md`.
5. Tổng hợp, với tên tiến trình của Mac:
   ```bash
   python3 bench/phase1/acceptance/soak.py summarize bench/phase1/results/acceptance/a5-mac.csv \
     --require meeting-translator,asr-worker-aarch64-apple-darwin,llama-server-aarch64-apple-darwin,com.apple.WebKit \
     --out bench/phase1/results/acceptance/a5-mac.json
   ```
   Đúng khi: `Nơi đo: mac, máy …`, không có `THIẾU tiến trình bắt buộc`, `Số mẫu: 733; … (đủ 2 giờ)`,
   `Biến mất: không; khởi động lại: không`, RAM tăng không quá `+10.0%`, `A5: ĐẠT; tải máy ≤ 30%: ĐẠT`.
6. Gửi lại kết quả (dán phần in ra). Không commit file nếu đó là lượt dry-run trên bản dev.

Đã thử công cụ ngày 2026-10-05 (30 giây trên bản dev đang rảnh): nhận đủ tiến trình, ghi CSV, tổng hợp chạy; kết luận
"KHÔNG ĐẠT" của lượt 30 giây là đúng thiết kế vì RAM cần ít nhất vài chục phút để so với giờ đầu.

## A7: kiểm không có lưu lượng ngoài danh sách

Danh sách cho phép đã điền máy chủ thật: `bench/phase1/results/acceptance/a7-allow.json` (license server
`mt-license.dotienphong1993.workers.dev` và bucket R2 `pub-a4be034c8c474a36b893a65e8f0b8365.r2.dev`). Request nào ra
ngoài danh sách, hay gọi lúc đang dịch mà không phải việc chạy theo lịch, bị tính là vi phạm.

1. **Kiểm cách mitmproxy khớp tên** (một lần, trước khi cài chứng chỉ). Cửa sổ 1, từng dòng một (Ctrl+C trước dòng sau):
   ```bash
   mitmdump --mode local:curl
   mitmdump --mode local:cur
   ```
   Cửa sổ 2, lúc cửa sổ 1 đang chạy: `curl -s -o /dev/null http://example.com/`. Lần đầu macOS hỏi cho phép
   **network extension** của mitmproxy: chọn cho phép (System Settings › Privacy & Security). Dòng `GET http://example.com/`
   ở `local:curl` là chế độ chạy được; ở `local:cur` là khớp **một phần** tên. Ghi kết quả vào
   `bench/phase1/results/acceptance/a7-mac.md`.
2. **Cài chứng chỉ gốc của mitmproxy** (app dùng `native-tls` nên tin Keychain hệ thống): chạy `mitmdump` một lần để sinh
   `~/.mitmproxy/mitmproxy-ca-cert.pem`, rồi
   ```bash
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem
   ```
   **Phải gỡ ở bước 6.**
3. **Proxy theo tiến trình của app** (không đặt proxy hệ thống, không mở trình duyệt). Khớp một phần tên:
   ```bash
   mitmdump --mode local:meeting-translator,asr-worker,llama-server --set hardump=$HOME/a7.har
   ```
   Khớp nguyên tên (kết quả bước 1 không có dòng `GET` ở `local:cur`):
   ```bash
   mitmdump --mode local:meeting-translator,asr-worker-aarch64-apple-darwin,llama-server-aarch64-apple-darwin --set hardump=$HOME/a7.har
   ```
   Giới hạn đã chấp nhận: chế độ này không bắt WebView và chỉ ghi luồng HTTP; phần đó kiểm bằng `nettop` ở bước 4.
4. **Thao tác** (ghi giờ đồng hồ có múi giờ: `date +%Y-%m-%dT%H:%M:%S%z`):
   1. Mở app (có gói trả phí). **Cài đặt › Bản quyền › Kiểm tra ngay** (để HAR có request **trước** Bắt đầu).
   2. Bấm **Bắt đầu** và **ghi giờ Bắt đầu**. Trong cửa sổ khác:
      ```bash
      python3 bench/phase1/acceptance/soak.py pids --app meeting-translator
      nettop -P -x -t external -L 180 -s 5 -J bytes_in,bytes_out -p <pid1> -p <pid2> … > "$HOME/a7-nettop.csv"
      ```
      (mỗi pid ở lệnh trên là một `-p`). Phát câu mẫu `public/listen-test-en.wav` nhiều lần trong 15 phút (QuickTime),
      cùng một video tiếng Anh có sẵn trên máy.
   3. `nettop` tự thoát sau 180 mẫu (15 phút ở `-s 5`): bấm Dừng ngay sau khi nó thoát. Đừng dừng nó bằng `kill` khi chạy nền: tiến trình nền bỏ qua SIGINT và dữ liệu chỉ ghi ra file lúc `nettop` thoát. Chỉ có hàng tiêu đề trong CSV là bình thường (không luồng ngoài nào đang mở); tiến trình có luồng thì có thêm một hàng. Đúng khi số byte của `com.apple.WebKit.*` và hai tiến trình phụ
      **không tăng** từ khối đầu tới khối cuối; của app chỉ tăng lúc có request trong HAR.
   4. Bấm **Dừng** và **ghi giờ Dừng**. Bấm **Kiểm tra ngay** lần nữa (để HAR có request **sau** Dừng). Xuất bản chép lời
      ra TXT, mở Lịch sử.
5. **Thoát app, dừng `mitmdump`** (HAR chỉ được ghi khi dừng).
6. **Gỡ chứng chỉ gốc của mitmproxy:**
   ```bash
   sudo security delete-certificate -c mitmproxy -t /Library/Keychains/System.keychain
   ```
7. **Từ mồi:** mở file TXT vừa xuất, chép một cụm 3–5 từ của bản dịch tiếng Việt vào mảng `canaries` của
   `bench/phase1/results/acceptance/a7-allow.json`.
8. **Kiểm** (thay hai giờ bằng giờ đã ghi, đúng dạng `2026-10-10T09:00:00+07:00`):
   ```bash
   python3 bench/phase1/acceptance/netaudit.py "$HOME/a7.har" \
     --allow bench/phase1/results/acceptance/a7-allow.json \
     --app-log "$HOME/Library/Logs/com.aitranslator.desktop/app.log" \
     --start <giờ Bắt đầu> --stop <giờ Dừng> --out bench/phase1/results/acceptance/a7-mac.json
   ```
   Đúng khi: `Request ra ngoài: N; trong lúc dịch: M` với N ≥ 3, không dòng `VI PHẠM`, `A7: ĐẠT`. Rồi xóa `$HOME/a7.har`
   (không commit HAR).
9. **Log không chứa chữ chép lời** (phải ra `0`):
   ```bash
   grep -rli -e "plotting analysis" -e "public website" "$HOME/Library/Logs/com.aitranslator.desktop" | wc -l
   ```

Gặp vi phạm "máy chủ không có trong danh sách cho phép" với máy chủ của app khác: proxy không lọc đúng tiến trình, làm lại
bước 3, **không** thêm máy chủ đó vào danh sách.

## Ghi chú từ lượt dry-run A5 và A7 trên bản dev (2026-10-06)

Lượt chạy rút gọn (A5 10 phút, A7 dịch 8 phút) để thử công cụ; không tính là nghiệm thu. Kết quả: `bench/phase1/results/acceptance/a5a7-dryrun-2026-10-06.md`.

- mitmproxy 12.2.3: lần đầu chạy `mitmdump --mode local:…` macOS xếp network extension ở trạng thái `activated waiting for user`
  (kiểm bằng `systemextensionsctl list | grep -i mitm`) cho tới khi bật **Mitmproxy Redirector** ở System Settings › General ›
  Login Items & Extensions › Network Extensions. Chưa bật thì request không được bắt và log trống.
- Khớp tên: `local:cur` và `local:curl` đều bắt được `curl`, nên khớp một phần tên (dùng được `local:meeting-translator,asr-worker,llama-server`).
- Log trực tiếp của `mitmdump` hiện **IP** thay vì tên máy chủ (HTTP/3 không có tên); trong **HAR** thì URL và header `Host` đúng tên
  (`mt-license….workers.dev`), nên `netaudit.py` khớp được danh sách cho phép. Chỉ đọc HAR, đừng đọc log trực tiếp.
- Máy có Tailscale và Microsoft Defender (extension mạng): không cản việc bắt.
- Thử proxy trước khi mở app: không dùng bản chép của `curl` hệ thống (bị tắt, exit 137). Dùng một chương trình nhỏ dựng bằng
  `swiftc` đặt tên `meeting-translator-probe`; **bỏ file này và khởi động lại proxy trước khi chạy thật**, vì request thử nằm trong
  HAR sẽ bị tính là vi phạm.
- Ghi HAR ra thư mục tạm, không để ở `$HOME`; xóa HAR sau khi kiểm (HAR chứa nội dung request).
- Bản chép lời xuất từ Lịch sử; từ mồi (cụm "kết quả phân tích") đã có sẵn trong `a7-allow.json` cho câu mẫu `listen-test-en.wav`.
- Luôn gỡ chứng chỉ (bước 6) rồi kiểm: `security find-certificate -c mitmproxy /Library/Keychains/System.keychain` phải báo không tìm thấy.

Bài học từ A7 chính thức (2026-10-06):
- **HAR phải có request cả trước lẫn sau phiên dịch**, nếu không `netaudit.py` báo `KHÔNG ĐẠT` (không chứng minh được proxy bắt suốt cửa sổ). Sau khi bấm Dừng, bấm **Kiểm tra ngay** rồi **xác nhận dòng `POST …/validate` mới hiện trong log của `mitmdump` trước khi thoát app**; lần đầu bước này bị sót và phải chạy lại 15 phút.
- Request `GET /stable/latest.json` (kiểm tra cập nhật theo lịch) có thể rơi vào lúc dịch; nó nằm trong danh sách cho phép (`during_session: true`), nên `trong lúc dịch: 1` là bình thường.
- Mã máy `host` do `uuid.getnode()` nên đổi giữa các lần chạy trên máy có nhiều giao diện mạng; không dùng nó để so hai kết quả.
