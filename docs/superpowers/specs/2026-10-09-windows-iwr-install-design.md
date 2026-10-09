# Cài Windows bằng một dòng lệnh PowerShell

Ngày 2026-10-09. Làm tương tự bản macOS (spec `2026-10-09-macos-curl-install-design.md`): người dùng Windows dán một dòng vào PowerShell, app được tải, kiểm tra, cài và mở, không qua màn hình SmartScreen. Bản Windows vẫn chưa ký mã (spec `2026-10-08-windows-unsigned-design.md`).

## 1. Nghiên cứu

| Điều cần biết | Kết luận | Nguồn |
|---|---|---|
| SmartScreen (AppRep) kiểm file nào | Chỉ file mang dấu Mark of the Web (`Zone.Identifier`), khi mở qua Explorer hay `ShellExecute`. Chạy từ cmd/PowerShell thì không kiểm. | Eric Lawrence, "Downloads and the Mark of the Web" (textslashplain.com) |
| Ai gắn dấu MOTW | Trình duyệt (Edge, Chrome, Firefox), Outlook. **Không** gắn: `curl.exe` đi kèm Windows, `bitsadmin`, mọi script dùng WinINET/WinHTTP/System.Net (kể cả PowerShell). "By design". | cùng bài |
| Smart App Control (SAC) | Windows 11. Khác SmartScreen: kiểm chữ ký/uy tín của **mọi** code nạp vào, kể cả bộ cài chưa ký. Ở chế độ chặn thì chặn app chưa ký và chưa có uy tín, **không có nút bỏ qua**; chỉ tắt được SAC. Mặc định ở chế độ đánh giá (chưa chặn); từ 25H2 (tháng 4/2026) bật lại được sau khi tắt. | Eric Lawrence, "Smart App Control" (2026-04-28) |
| Cờ bộ cài NSIS của Tauri | `/S` im lặng (mẫu kiểm `${Silent}`); `/P` thụ động; `/R` mở app sau khi cài (chỉ khi `/S` hay `/P`); `/NS` không tạo lối tắt; `/UPDATE`. Cài theo người dùng vào `$LOCALAPPDATA\AI Translator`. Ghi `HKCU\...\Uninstall\AI Translator` với `InstallLocation`, `MainBinaryName`. Silent vẫn tạo lối tắt Desktop và Start Menu. | mẫu `installer.nsi` của tauri-bundler (dev) |
| `irm \| iex` | `iex` chạy văn bản, không phải file nên không bị ExecutionPolicy; bị chặn ở máy có Constrained Language Mode (AppLocker/WDAC của công ty). `iex` lỗi nếu văn bản bắt đầu bằng BOM. `exit` trong script chạy bằng `iex` đóng cửa sổ PowerShell của người dùng. | kiến thức PowerShell, đã áp dụng vào thiết kế |

Hệ quả: một script PowerShell tải bộ cài bằng `Invoke-WebRequest` và chạy nó bằng `Start-Process` không đi qua SmartScreen, dù chưa ký mã. Nó **không** vượt được SAC chế độ chặn, và không thay thế việc ký mã. Defender có thể vẫn quét bằng học máy; chưa đo.

## 2. Thiết kế

- `website/src/public/install.ps1` (Worker website phục vụ `/install.ps1`, `text/plain`, cache 5 phút, `noindex`). Lệnh: `irm https://aitranslator.io.vn/install.ps1 | iex`; kênh beta: `& ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta`.
- Các bước: kiểm máy (Windows ≥ 10, x64; RAM dưới 8 GB chỉ cảnh báo); TLS 1.2; đọc `<kênh>/latest.json` (`version` phải khớp `^\d+\.\d+\.\d+(-beta\.\d+)?$`); tải `AI Translator_<version>_x64-setup.exe` và `SHA256SUMS-windows.txt` từ R2 (`releases.aitranslator.io.vn`), đối chiếu SHA-256 (`Get-FileHash`); `Unblock-File` phòng hờ; chạy `setup.exe /S` (`-Wait`, kiểm mã thoát); tìm thư mục cài qua `HKCU:\...\Uninstall\AI Translator\InstallLocation` (mặc định `%LOCALAPPDATA%\AI Translator`); mở `meeting-translator.exe`; xóa thư mục tạm.
- Không dùng `/R`: `Start-Process -Wait` đợi cả tiến trình con, nên sẽ treo tới khi người dùng thoát app. Script tự mở app sau khi bộ cài xong.
- Không quyền quản trị, không UAC, không `exit`, toàn bộ nằm trong hàm gọi ở dòng cuối (văn bản đứt giữa chừng thì lỗi cú pháp, không chạy nửa script). Console PowerShell 5.1 không in tiếng Việt có dấu mặc định nên script tạm đặt `[Console]::OutputEncoding` sang UTF-8 rồi khôi phục. Ngôn ngữ thông báo theo `Get-UICulture`/vùng (Việt Nam là tiếng Việt), ép được bằng `AI_TRANSLATOR_LANG`.
- Không có biến ghi đè URL máy chủ (spec 2026-10-04). Biến tùy chọn: `AI_TRANSLATOR_CHANNEL`, `AI_TRANSLATOR_NO_OPEN`, `AI_TRANSLATOR_LANG`.
- Bộ cài đang cài đè bản cũ: NSIS im lặng tự đóng app đang chạy (ghi chú phát hành của Tauri); chưa kiểm trên máy thật.

## 3. Giới hạn nói thẳng với người dùng (đã đưa lên website)

- Chạy lệnh dán từ internet là tin nguồn `aitranslator.io.vn`; SHA-256 nằm cùng máy chủ nên chỉ chống file hỏng. Có lệnh "in script ra đọc rồi mới chạy".
- Smart App Control chế độ chặn vẫn chặn bản chưa ký, kể cả cách này. Hướng dẫn tắt SAC có trong trang cài đặt Windows, kèm lưu ý ở bản Windows 11 cũ tắt rồi không bật lại được.
- Máy công ty có Constrained Language Mode không chạy được script: dùng file .exe hoặc hỏi quản trị.
- File .exe tải bằng trình duyệt vẫn có thể bị SmartScreen cảnh báo (More info › Run anyway).
- Phần mềm diệt virus có thể gắn cờ bộ cài chưa ký; đối chiếu SHA-256.

## 4. Kiểm chứng

- `website/test/install-ps1.test.mjs`: hợp đồng với release (URL, tên bộ cài, SHA256SUMS, tên file chạy lấy từ `Cargo.toml`, tên sản phẩm), không BOM, không `exit`, không đòi quyền quản trị, lệnh trên header khớp lệnh trên các trang; với PowerShell 7: cú pháp, các hàm thuần (kiểm phiên bản chống chèn đường dẫn/lệnh, đọc `SHA256SUMS`, ghép URL, chọn ngôn ngữ), và chạy trên hệ không phải Windows thì báo lỗi rõ mà không đóng shell.
- **Chưa chạy được bộ cài NSIS thật** (không có máy Windows trong phiên này). Việc đó nằm ở mục dưới.

## 5. Kiểm tay trên Windows (trước khi deploy trang web nói về lệnh Windows)

Máy Windows 10 hoặc 11 x64 sạch, một tài khoản thường:

1. Chép `install.ps1` vào máy, mở **Windows PowerShell** (5.1), chạy `Get-Content -Raw -Encoding UTF8 .\install.ps1 | iex` (R2 đã có bản 0.1.0). Kỳ vọng: tải, SHA-256 khớp, cài im lặng, app mở, không có màn hình SmartScreen, không UAC.
2. Lặp lại trong PowerShell 7 (`pwsh`).
3. Chạy lại khi app đang mở: kỳ vọng bộ cài đóng app và thay bản, script mở lại app.
4. Kiểm có lối tắt Start Menu và mục trong Settings › Apps; gỡ bằng Uninstall.
5. Máy Windows 11 bật Smart App Control ở chế độ chặn: ghi lại hành vi thật (có chặn bộ cài, hay chặn app sau khi cài).
6. Máy tiếng Việt: thông báo tiếng Việt, không lỗi hiển thị dấu.
7. Sau khi trang web được deploy: `irm https://aitranslator.io.vn/install.ps1 | iex` từ URL công khai; `curl.exe -sI https://aitranslator.io.vn/install.ps1` trả `content-type: text/plain`.

Kết quả (chưa có):
