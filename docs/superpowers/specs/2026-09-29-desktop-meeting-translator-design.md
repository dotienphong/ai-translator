# Meeting Translator (tên tạm): app desktop dịch phụ đề cuộc họp offline — Design

**Ngày:** 2026-09-29
**Trạng thái:** Đã duyệt ngày 2026-09-29. Kế hoạch Giai đoạn 0 nằm ở `docs/superpowers/plans/`.
**Phạm vi:** Sản phẩm mới, repo mới `meeting-translator/`, gồm app desktop cho Windows và macOS, cùng một license server nhỏ để nhận thanh toán qua PayOS. Sản phẩm **tách hẳn** khỏi AI Live Translator: thương hiệu, repo, người dùng và thanh toán đều riêng. Vì cùng chủ sở hữu nên được tham khảo cách làm bên đó, nhưng không dùng chung code hay hạ tầng. App Android không thuộc spec này.

---

## 1. Bối cảnh

- **Nguồn gốc ý tưởng:** ban đầu định port RTranslator (app dịch offline cho Android, Apache 2.0). Sau khi phân tích, hướng đi đổi sang **dịch cuộc họp trên máy tính**, vì Android không cho app bên thứ ba thu âm thanh cuộc gọi và VoIP:
  - `AudioPlaybackCapture` chỉ thu được `USAGE_MEDIA`, `USAGE_GAME` và `USAGE_UNKNOWN`.
  - Khi đang có cuộc gọi, mic của app thường chỉ nhận được im lặng.
- **Trên máy tính thì thu được âm thanh hệ thống:** Windows dùng WASAPI loopback, macOS dùng Core Audio process tap (từ macOS 14.2). Nhiều dự án chép lời cuộc họp chạy trên máy (Meetily, acta, whisper-meet…) đã chứng minh hướng này khả thi.
- **Benchmark 2026-09-29** trên Mac M4 Pro, 320 câu WMT24++; chi tiết ở `bench/2026-09-29-mt-benchmark/REPORT.md`:

  | Model | COMET (320 câu) | Ghi chú |
  |---|---|---|
  | **Hy-MT2-1.8B** | **0,837** | Cao nhất; không câu nào bị rỗng hoặc dài/ngắn bất thường |
  | HY-MT1.5-1.8B | 0,833 | |
  | MADLAD-3B | 0,779 | |
  | NLLB-600M | 0,736 | |

  - Tốc độ: Hy-MT2 Q8_0 chạy trên CPU 4 luồng mất trung bình **0,45 giây/câu** trên 30 câu trộn nhiều chiều dịch, RAM tối đa khoảng 4 GB. Riêng Anh→Việt, bản dịch dài trung vị 38 token (p90: 70 token, trên 100 câu), và trên CPU mất trung vị 0,53 giây (12 câu).
  - Trên 30 câu thử, bản 8-bit (Q8_0) của Hy-MT2 thấp hơn bản gốc 0,006 COMET. Q8_0 chưa được chấm trên đủ bộ test; việc này làm ở S7 (xem A3).
  - Benchmark chưa có các chiều Trung→Việt, Nhật→Việt và Hàn→Việt, trong khi đây là các chiều chính của người dùng Việt (F2). S7 bổ sung ba chiều này.
- **Đối thủ:** Teams, Zoom và Meet đều có phụ đề dịch, nhưng chỉ ở các gói trả phí cao và chạy trên cloud. Công cụ bên thứ ba cũng phần lớn chạy trên cloud.
- **Điểm khác biệt của sản phẩm:**
  - Xử lý hoàn toàn offline trên máy.
  - Dùng được với mọi app họp, không cần bot hay plugin.
  - Dịch tiếng Việt tốt.
  - Thêm một phút dịch không tốn chi phí.

## 2. Quyết định đã chốt

| # | Hạng mục | Quyết định |
|---|---|---|
| D1 | Sản phẩm | App desktop hiện **phụ đề dịch trực tiếp cho mọi âm thanh máy tính đang phát**: Teams, Zoom, Meet, Zalo PC, webinar, video. Không cần bot, plugin hay tài khoản trên các nền tảng họp. |
| D2 | Quan hệ với AI Live Translator | Sản phẩm hoàn toàn riêng |
| D3 | Nền tảng MVP | macOS 14.2+ trên Apple Silicon; Windows 10/11 64-bit (x64). Windows 10 đã hết hỗ trợ chính thức từ 14/10/2025 (gói ESU cho người dùng cá nhân kết thúc 13/10/2026), nhưng MVP vẫn hỗ trợ. |
| D4 | Công nghệ | **Tauri 2**: lõi Rust, giao diện React 19, TypeScript, Vite, Zustand. Engine là whisper.cpp và llama.cpp, mỗi engine chạy trong một tiến trình phụ riêng (§5). |
| D5 | Model dịch | **Hy-MT2-1.8B** (Apache 2.0), định dạng GGUF |
| D6 | Model nhận dạng giọng nói | Whisper (MIT) chạy qua whisper.cpp |
| D7 | Nơi xử lý | 100% trên máy, âm thanh không rời khỏi máy |
| D8 | Ngôn ngữ giao diện | Tiếng Việt và English, đổi được trong Cài đặt |
| D9 | Chiều dịch | MVP chỉ dịch một chiều: âm thanh máy đang phát → phụ đề ngôn ngữ của người dùng. Nếu cả hai bên cùng cài app thì mỗi bên đều thấy phụ đề của phía kia. |
| D10 | Phân phối | Tải từ website của sản phẩm: Windows dùng bộ cài **`.exe`** (NSIS, đã ký số), macOS dùng **`.dmg`** (đã ký và notarize). Chưa lên Microsoft Store hay Mac App Store. Microsoft Store có thể xem xét sau; các điều kiện của Store đã được ghi nhận ngày 2026-09-29. |
| D11 | Thanh toán | **MVP dùng PayOS**: khách chuyển khoản ngân hàng bằng mã VietQR, trả bằng VND. Khi bán ra nước ngoài thì thêm một cổng thanh toán quốc tế (§13). |
| D12 | Độ trễ mục tiêu | Trên máy khuyến nghị, **p50 ≤ 2,0 giây** (xem A2 và §8) |

**Đề xuất mặc định, PHONG xác nhận khi duyệt spec:**

| # | Hạng mục | Đề xuất |
|---|---|---|
| P1 | Kiếm tiền | **Không có quảng cáo.** Free: 30 phút dịch mỗi ngày. **Pro**: dịch không giới hạn, từ điển thuật ngữ, lưu lịch sử và xuất bản chép lời. Pro bán theo gói **trả trước 1 tháng hoặc 12 tháng** bằng VND, không tự gia hạn, vì PayOS không có thanh toán định kỳ. Giá chốt sau. |
| P2 | Bản quyền | License key do **license server riêng** của sản phẩm cấp, sau khi PayOS xác nhận đã nhận tiền. Mỗi key kích hoạt tối đa 2 máy, dùng được offline nhờ token có ký số (ân hạn 14 ngày). Không có tài khoản đăng nhập. Chi tiết ở §6.8. |

## 3. Mục tiêu, phạm vi, tiêu chí thành công

### 3.1 Tính năng MVP

| # | Tính năng |
|---|---|
| F1 | Phụ đề dịch trực tiếp từ âm thanh hệ thống |
| F2 | Người dùng chọn ngôn ngữ đích, là một trong năm ngôn ngữ: English, 中文, 日本語, 한국어, Tiếng Việt. Ngôn ngữ nguồn được **tự nhận diện trong tập ngôn ngữ người dùng chọn** (mặc định: cả năm ngôn ngữ trên), hoặc khóa cố định một ngôn ngữ. Câu nào đã là ngôn ngữ đích thì hiện câu gốc, không dịch. |
| F3 | Thanh phụ đề nổi, mô tả ở §4.4 |
| F4 | Bản chép lời của phiên: xem, tìm, sao chép. Xuất ra TXT, SRT, Markdown và lưu lịch sử là tính năng Pro; lưu lịch sử mặc định tắt. |
| F5 | Từ điển thuật ngữ (Pro), tối đa 500 cặp. Chỉ những thuật ngữ **có xuất hiện trong câu** mới được đưa vào prompt. |
| F6 | Quản lý model: có gói Chuẩn và gói Nhẹ, tự đề xuất gói theo cấu hình máy, tải tiếp được khi rớt mạng, kiểm tra SHA-256 |
| F7 | Giao diện tiếng Việt và English |
| F8 | Phân quyền Free và Pro bằng license key, dùng được khi offline |
| F9 | Tự cập nhật app |
| F10 | Phím tắt toàn cục và biểu tượng ở khay hệ thống (menu bar trên Mac). Phím tắt mặc định, đổi được trong Cài đặt: `Ctrl+Alt+T` / `⌃⌥T` để bắt đầu/dừng, `Ctrl+Alt+H` / `⌃⌥H` để ẩn/hiện phụ đề, `Ctrl+Alt+L` / `⌃⌥L` để khóa/mở khóa phụ đề. Ở Giai đoạn 0 kiểm tra xem có trùng phím tắt của Teams, Zoom, Meet không. |

### 3.2 Ngoài phạm vi MVP

- Dịch giọng của người dùng rồi phát vào cuộc họp (cần micro ảo)
- Bot tham gia cuộc họp, xử lý trên cloud
- Tóm tắt hoặc biên bản cuộc họp
- Phân biệt ai đang nói
- Ghi âm cuộc họp
- Thu âm từ micro
- Linux, Mac chip Intel, Windows ARM64
- Phát hành qua các kho ứng dụng
- App mobile
- Dịch chữ trên màn hình (OCR)

### 3.3 Tiêu chí nghiệm thu

| # | Tiêu chí |
|---|---|
| A1 | **Tương thích:** chạy được với Teams (app), Zoom (app), Google Meet (Chrome và Edge; thêm Safari trên Mac) và Zalo PC, trên cả hai hệ điều hành. Nghe được qua loa, tai nghe có dây và tai nghe Bluetooth. |
| A2 | **Độ trễ**, tính từ lúc người nói thực sự dừng câu đến lúc bản dịch hiện đủ, kể cả khi đó vẫn là phụ đề tạm (§6.3). Không tính lần nạp model khi bắt đầu phiên (§5). **Máy khuyến nghị: p50 ≤ 2,0 giây, p90 ≤ 3,0 giây**, và chữ dịch đầu tiên hiện trong ≤ 1,0 giây (p50). Máy tối thiểu: p50 ≤ 3,5 giây. |
| A3 | **Chất lượng dịch**, chấm trên văn bản (không qua bước nhận dạng giọng nói), chạy qua đúng `llama-server` và prompt của app. Bộ test gồm bộ của benchmark 2026-09-29, cộng thêm ba chiều Trung→Việt, Nhật→Việt, Hàn→Việt, mỗi chiều 100 câu, dựng từ WMT24++ giống các chiều đã có. **Mốc:** ở S7, chấm COMET của Q8_0 (gói Chuẩn) và Q4_K_M (gói Nhẹ) cho bốn chiều Anh/Trung/Nhật/Hàn→Việt. **Mức sàn** cho Anh→Việt: gói Chuẩn ≥ 0,83, gói Nhẹ ≥ 0,80; nếu không đạt thì xem lại D5 trước khi làm MVP. Ba chiều Trung/Nhật/Hàn→Việt chưa có mức sàn; chiều nào thấp hơn Anh→Việt quá 0,05 thì xem lại D5 cho chiều đó. **Chống thụt lùi:** sau mỗi lần đổi model, engine hay prompt, COMET của từng chiều không được thấp hơn mốc quá 0,01. |
| A4 | **Chất lượng nhận dạng giọng nói**, đo trên bộ clip mẫu dựng ở Giai đoạn 0 (S7). Mỗi ngôn ngữ nguồn mặc định có ít nhất 15 phút âm thanh, kèm bản chép chuẩn đã được người kiểm lại, và có cả âm thanh thu qua tai nghe Bluetooth (băng hẹp). Chỉ dùng clip có quyền sử dụng: tự thu, hoặc bộ dữ liệu mở như FLEURS và AMI (CC BY 4.0). Tiếng Anh và tiếng Việt đo WER; tiếng Trung, Nhật, Hàn đo CER theo thông lệ cho các ngôn ngữ này. Lấy mốc cho cả gói Chuẩn và gói Nhẹ. Sau mỗi lần đổi model hay engine, WER/CER không được xấu hơn mốc quá 10% (tương đối). |
| A5 | **Ổn định:** một phiên dịch liên tục 2 giờ không crash. RAM sau giờ đầu không tăng quá 10%. |
| A6 | **Cài đặt:** bộ cài ký số hợp lệ. Bản macOS đã notarize, mở không bị Gatekeeper chặn. **Gỡ app sạch, người dùng chọn giữ hay xóa model:** trên Windows, bộ gỡ cài đặt có ô "xóa dữ liệu app", xóa được cả model (§6.7). Trên macOS, gỡ app chỉ là kéo vào Thùng rác, không có bước nào để hỏi; vì vậy trong app có nút "Xóa model và dữ liệu" (§4.3), và trang hỗ trợ hướng dẫn bấm nút này trước khi gỡ. |
| A7 | **Quyền riêng tư:** kiểm tra qua proxy mạng, trong lúc dịch không có request mạng nào, trừ các việc chạy theo lịch: kiểm tra bản quyền, kiểm tra cập nhật app và manifest model. Không request nào chứa âm thanh hay nội dung chép lời. |

## 4. Trải nghiệm người dùng

### 4.1 Lần đầu mở app

1. **Chọn ngôn ngữ giao diện.** Mặc định theo hệ điều hành: tiếng Việt nếu máy dùng tiếng Việt, còn lại là English.
2. **Kiểm tra cấu hình** (RAM, GPU, dung lượng trống), rồi đề xuất **gói Chuẩn (khoảng 2,5 GB)** hoặc **gói Nhẹ (khoảng 1,3 GB)**, có ghi rõ dung lượng sẽ tải.
3. **Tải model.** Có thể tạm dừng rồi tải tiếp. Tải xong là dùng được ngay.
4. **Cấp quyền trên macOS:** hướng dẫn bật quyền "Ghi âm thanh hệ thống", kèm nút mở System Settings. Windows không cần bước này.
5. **Chọn ngôn ngữ đích** (mặc định theo ngôn ngữ giao diện) và tập ngôn ngữ nguồn.
6. **Nghe thử:** app phát một câu tiếng Anh mẫu để người dùng thấy phụ đề hiện lên, xác nhận app hoạt động. Trên macOS, tap mặc định loại trừ chính app (§6.1), nên riêng ở bước này tap tạm thời thu cả âm thanh của app.
7. **Thông báo quyền riêng tư:** âm thanh không rời khỏi máy. Người dùng tự chịu trách nhiệm thông báo cho người cùng họp nếu pháp luật hoặc quy định công ty yêu cầu.
8. **Biểu tượng khay:** báo cho người dùng biết app chạy ở khay hệ thống (menu bar trên Mac), và bấm X chỉ ẩn cửa sổ chính (§4.3). Windows 10/11 mặc định giấu icon của app mới vào mục icon ẩn (mũi tên `^`), và app không tự ghim icon ra ngoài được. Vì vậy trên Windows, bước này có ảnh hướng dẫn kéo icon ra taskbar, kèm nút mở trang cài đặt Taskbar (`ms-settings:taskbar`) để bật icon của app.

### 4.2 Trong cuộc họp

1. Người dùng bấm **Bắt đầu**, qua nút, phím tắt hoặc menu khay. Thanh phụ đề hiện ra, kèm chỉ báo "đang nghe" (mức âm lượng) và chỉ báo độ trễ. Nếu hai tiến trình phụ chưa chạy (§5), thanh phụ đề hiện "Đang nạp model…" trong vài giây đầu.
2. Với gói Free: khi còn 5 phút thì nhắc. Hết 30 phút thì dừng dịch, thanh phụ đề hiện thông báo và nút nâng cấp.
3. Người dùng bấm **Dừng** để kết thúc phiên, sau đó có thể mở bản chép lời của phiên.

### 4.3 Các màn hình

- **Màn hình chính:**
  - Trạng thái: Sẵn sàng, Đang dịch hoặc Lỗi.
  - Nút Bắt đầu/Dừng.
  - Ngôn ngữ đích và tập ngôn ngữ nguồn.
  - Nguồn âm thanh: trên Windows là thiết bị phát; trên macOS là toàn hệ thống hoặc một app cụ thể.
  - Mức âm lượng vào.
  - Số phút còn lại trong ngày (gói Free).
- **Bản chép lời:** mỗi câu gồm giờ, câu gốc và bản dịch. Có tìm kiếm, sao chép, xuất file (Pro).
- **Lịch sử (Pro):** danh sách các phiên đã lưu, xóa từng phiên hoặc xóa tất cả.
- **Từ điển thuật ngữ (Pro):** thêm, sửa, xóa; nhập và xuất CSV.
- **Cài đặt:**
  - **Chung:** ngôn ngữ giao diện, khởi động cùng hệ thống, giao diện sáng/tối, kênh cập nhật (stable hoặc beta).
  - **Phụ đề:** cỡ chữ, số dòng, độ mờ nền, có hiện câu gốc hay không.
  - **Âm thanh:** nguồn âm thanh, độ nhạy ngắt câu.
  - **Model:** gói đang dùng, dung lượng, tải lại hoặc xóa.
  - **Phím tắt.**
  - **Bản quyền:** nhập key, trạng thái và ngày hết hạn, gia hạn, gỡ kích hoạt.
  - **Quyền riêng tư:**
    - Bật/tắt lưu lịch sử.
    - Nút xóa toàn bộ dữ liệu: xóa lịch sử và từ điển thuật ngữ.
    - Nút "Xóa model và dữ liệu": xóa thêm cả model, dùng trước khi gỡ app trên macOS (A6).
    - Cả hai nút đều giữ lại trạng thái bản quyền và quota (§6.8).
- **Nâng cấp Pro:** chọn gói 1 tháng hoặc 12 tháng, nhập email, quét mã VietQR hiện ngay trong app (§6.8).
- **Giới thiệu và giấy phép mã nguồn mở.**
- **Đóng cửa sổ chính:**
  - Bấm X (kể cả `Alt+F4` trên Windows, `⌘W` trên Mac) chỉ ẩn cửa sổ xuống khay. App vẫn chạy; phím tắt và phiên dịch đang chạy vẫn hoạt động.
  - Muốn thoát hẳn thì chọn **Thoát** trong menu khay: app dừng phiên dịch nếu đang chạy (như khi bấm Dừng), tắt hai tiến trình phụ (§5), rồi mới thoát.
  - Trên Mac, `⌘Q` và mục Quit ở Dock cũng không thoát app: bỏ mục Quit khỏi menu của app, hoặc chặn lệnh thoát không đến từ menu khay.
  - Ngoại lệ: không chặn thoát khi máy tắt, khởi động lại, đăng xuất, và khi app tự khởi động lại để cập nhật (§6.11). Nếu chặn, hệ điều hành báo app đang cản tắt máy.

### 4.4 Thanh phụ đề

- **Kiểu cửa sổ:** cửa sổ riêng, không viền, nền mờ bán trong suốt, **luôn nổi trên cùng**. Không hiện trên taskbar của Windows, và không lấy focus của app họp.
- **Nội dung:**
  - Hiện 1–3 dòng bản dịch gần nhất; tùy chọn hiện câu gốc chữ nhỏ ở phía trên.
  - **Bản dịch hiện dần từng chữ** trong lúc model đang dịch.
  - **Phụ đề tạm:** câu chưa chốt hiện màu nhạt hơn. Nếu người nói nói tiếp ngay (§6.3), phụ đề tạm được thay bằng bản dịch của cả câu đã ghép.
- **Di chuyển và kích thước:** kéo để di chuyển, kéo cạnh để đổi kích thước. App nhớ vị trí riêng cho từng màn hình.
- **Chế độ khóa:** cho click xuyên qua thanh phụ đề, để không cản thao tác trên cửa sổ họp. Mở khóa bằng phím tắt hoặc menu khay.
- **Nổi trên app họp đang toàn màn hình:**
  - macOS: dùng NSPanel kiểu non-activating, đặt window level cao, cho tham gia mọi Space với cờ `canJoinAllSpaces` và `fullScreenAuxiliary`. Chỉ đặt các cờ này trên một NSWindow thường thì thường chưa đủ để nổi trên Space toàn màn hình của app khác. S5 xác nhận.
  - Windows: đặt cửa sổ ở chế độ topmost.
- **Icon ở Dock (macOS):** khi app chỉ còn biểu tượng ở menu bar, app không có icon ở Dock (activation policy `accessory`). Khi mở cửa sổ chính, app hiện icon ở Dock (`regular`).
- **Chỉ báo nhỏ:** đang nghe, không có âm thanh, hoặc đang trễ.

### 4.5 Ngôn ngữ giao diện

- **Chuỗi giao diện:** lưu trong từ điển có kiểu. `en` là nguồn chuẩn cho danh sách khóa; kiểu `Record` bắt `vi` phải có đủ mọi khóa. Đây là cách AI Live Translator đang làm, đã quen tay.
- **Đổi ngôn ngữ ngay**, không cần khởi động lại app.
- **Chuỗi phía Rust** (menu khay, thông báo hệ thống, khoảng 20 chuỗi) nằm trong một bảng nhỏ riêng, có đủ cả vi và en.

## 5. Kiến trúc tổng thể

```
┌──────────────── App: tiến trình chính Tauri, viết bằng Rust, không chứa ggml ────────────────┐
│                                                                                              │
│  Thu âm thanh ──► Tiền xử lý ──► VAD, cắt câu ──► Nhận dạng ──► Dịch ──► Ghép phụ đề         │
│  WASAPI loopback  16 kHz mono    Silero VAD       (client)      (HTTP)   & bản chép lời      │
│  / Core Audio tap                                     │           │                          │
│                                                       │           │                          │
│  Model · Bản quyền · Cài đặt · Lịch sử (SQLite)       │           │                          │
│  Khay · Phím tắt                                      │           │                          │
│          │ lệnh / sự kiện Tauri                       │           │                          │
│   ┌──────┴──────────┐                                 │           │                          │
│  Cửa sổ chính       Thanh phụ đề                      │           │                          │
│  (WebView, React)   (WebView, trong suốt)             │           │                          │
└───────────────────────────────────────────────────────┼───────────┼──────────────────────────┘
                                                        │           └───┐
                                          stdin/stdout, │               │ HTTP 127.0.0.1,
                                     không mở cổng mạng │               │ API key ngẫu nhiên
                             ┌──────────────────────────▼───┐   ┌───────▼──────────────────────┐
                             │ Tiến trình phụ: asr-worker   │   │ Tiến trình phụ: llama-server │
                             │ whisper.cpp + model Whisper  │   │ llama.cpp + Hy-MT2 GGUF      │
                             │ Metal / Vulkan / CPU         │   │ Metal / Vulkan / CPU         │
                             └──────────────────────────────┘   └──────────────────────────────┘
```

**Vì sao chạy cả nhận dạng giọng nói lẫn dịch thành tiến trình phụ (sidecar):**
1. Tiến trình chính không chứa ggml. whisper.cpp và llama.cpp mỗi bên kèm một bản ggml riêng; để chung một tiến trình thì dễ trùng symbol (đã có báo cáo lỗi ở cả C++ lẫn Rust).
2. Engine hoặc driver GPU có crash thì app vẫn chạy và tự khởi động lại engine. Lỗi driver Vulkan trên Windows không làm sập app (A5).
3. Nâng phiên bản whisper.cpp hay llama.cpp mà không phải build lại toàn bộ app.
4. `llama-server` đã có sẵn chế độ stream, chat template và các backend GPU.

**Vòng đời hai tiến trình phụ:**
- Chạy khi người dùng mở cửa sổ chính hoặc bấm Bắt đầu. Tắt sau 10 phút không dịch, để app nằm ở khay không giữ 4–6 GB RAM (§8).
- `asr-worker` chạy trước. `llama-server` chạy sau khi `asr-worker` đã nạp xong model, để `llama-server` thấy đúng VRAM còn trống (§6.5).
- Lần đầu phải chờ nạp model vài giây; thanh phụ đề hiện "Đang nạp model…". Thời gian này không tính vào độ trễ ở A2.

**Thành phần nằm ngoài app:** một license server nhỏ làm việc với PayOS (chi tiết ở §6.8). App chỉ gọi server này khi mua, kích hoạt và kiểm tra bản quyền. Âm thanh và nội dung chép lời không bao giờ đi qua server.

```
App ──HTTPS──► License server (Cloudflare Worker + D1) ◄──webhook── PayOS ◄── khách quét VietQR
                      │ tạo link thanh toán ─────────────────────────► PayOS
                      └─ gửi email chứa license key
```

## 6. Thiết kế thành phần

### 6.1 Thu âm thanh

- **Interface chung:** `trait AudioSource { fn start(&mut self, sink: RingProducer) -> Result<()>; fn stop(&mut self); fn format(&self) -> AudioFormat; }`
- **Windows:** dùng WASAPI shared-mode **endpoint loopback**.
  - **Chế độ tự động:** thu loopback của thiết bị phát mặc định (vai trò *Console*) và của thiết bị mặc định cho liên lạc (vai trò *Communications*, nếu khác thiết bị trên), rồi trộn lại. App họp có thể phát tiếng qua thiết bị Communications, nhất là khi dùng tai nghe Bluetooth.
    - Mỗi thiết bị có một ring buffer riêng. Luồng tiền xử lý resample từng luồng về 16 kHz rồi mới trộn, và bù lệch đồng hồ giữa hai thiết bị bằng cách bỏ hoặc chèn mẫu.
  - **Khi không có âm thanh nào đang phát,** WASAPI loopback không trả gói dữ liệu nào, và sự kiện báo có dữ liệu cũng không được kích hoạt. Đây là hành vi chuẩn của Windows. Vì vậy:
    - Luồng thu đọc theo timer, không chờ sự kiện.
    - Luồng thu tự chèn im lặng vào khoảng trống, tính theo đồng hồ thật (vị trí QPC do `GetBuffer` trả về). Nhờ vậy VAD vẫn chốt được đoạn, thời gian của phụ đề không bị lệch, và vẫn phát hiện được lỗi "không có âm thanh" (§9).
  - Người dùng có thể chọn thủ công một thiết bị.
  - Lắng nghe `IMMNotificationClient` để tự khởi tạo lại khi thiết bị thay đổi.
  - **Không dùng process loopback** trong MVP, vì đã có báo cáo cách này chỉ nhận được im lặng với Teams.
  - Hệ quả: app thu **mọi** âm thanh của máy, kể cả tiếng thông báo hay video đang mở.
- **macOS:** dùng Core Audio process tap (`AudioHardwareCreateProcessTap`, macOS 14.2+), đọc qua aggregate device.
  - **Mặc định:** tap toàn hệ thống, trừ chính app.
  - **Tùy chọn:** chỉ tap một app họp được chọn từ danh sách các app đang phát âm thanh.
  - Khai báo `NSAudioCaptureUsageDescription` trong Info.plist.
  - Gọi API qua `objc2` và `coreaudio-sys`.
- **Ràng buộc realtime:** callback thu âm không cấp phát bộ nhớ và không lock; chỉ ghi vào ring buffer lock-free (crate `rtrb`). Ring buffer chứa được 30 giây âm thanh.

### 6.2 Tiền xử lý

Gộp về một kênh (mono), rồi resample từ tần số của thiết bị (thường 48 kHz) xuống 16 kHz bằng crate `rubato`. Sau đó chia thành khung 512 mẫu (32 ms) để đưa vào VAD.

### 6.3 VAD và cắt câu

- **Silero VAD** (MIT).
- **Tham số mặc định:**
  - Ngưỡng tiếng nói: 0,5.
  - Đoạn tiếng nói ngắn nhất: 250 ms.
  - **Im lặng 300 ms thì chốt đoạn**, để đạt mục tiêu độ trễ ở A2. Người dùng chỉnh được trong khoảng 200–800 ms bằng mục "Độ nhạy ngắt câu".
  - **Mỗi đoạn dài tối đa 8 giây.** Nếu dài hơn, cắt cưỡng bức tại khung có năng lượng thấp nhất trong 1,5 giây cuối.
  - Thêm 200 ms đệm ở đầu và cuối mỗi đoạn.
- **Ghép câu và phụ đề tạm:** ngưỡng 300 ms dễ cắt giữa câu, ở những chỗ người nói ngừng nghỉ tự nhiên.
  - Nếu đoạn vừa chốt không kết thúc bằng dấu câu kết thúc (`.` `?` `!` `。` `？` `！`), phụ đề được đánh dấu **tạm**.
  - **Cửa sổ ghép** = max(700 ms, `vadEndSilenceMs` + 400 ms), tính từ lúc hết tiếng nói của đoạn trước. Với mặc định 300 ms, cửa sổ là 700 ms.
  - Nếu tiếng nói tiếp tục trong cửa sổ ghép, đoạn sau được ghép vào: nối chữ của hai đoạn, dịch lại cả câu, rồi thay phụ đề tạm.
  - Phụ đề được chốt khi có dấu câu kết thúc, hoặc khi hết cửa sổ ghép mà không có tiếng nói mới.
  - **Trần:** một câu ghép dài tối đa 15 giây âm thanh hoặc 3 đoạn. Đạt trần thì chốt câu, đoạn sau bắt đầu một câu mới. Nhờ vậy câu không dài mãi, và mỗi lần dịch lại không chậm dần.
- **Đầu ra:** `Segment { id, start_ms, end_ms, samples }`. Thời gian tính từ lúc bắt đầu phiên theo đồng hồ thật, không theo số mẫu đã nhận (§6.1).
- **Cách chạy Silero:** chốt ở Giai đoạn 0, mục S3. Tiến trình chính không chứa ggml (§5), nên có hai cách:
  - **Ưu tiên:** chạy trong tiến trình chính qua một crate ONNX (ví dụ `ort`). VAD vẫn chạy khi `asr-worker` khởi động lại; đổi lại, bộ cài có thêm thư viện ONNX Runtime.
  - Chạy trong `asr-worker` qua VAD API của whisper.cpp. Cách này không thêm thư viện, nhưng phải gửi âm thanh liên tục sang `asr-worker`, và VAD dừng khi tiến trình này khởi động lại. Nếu chọn cách này thì phải gọi `whisper_vad_detect_speech_no_reset`, vì `whisper_vad_detect_speech` reset trạng thái của model mỗi lần gọi.

### 6.4 Nhận dạng giọng nói

- **Engine:** whisper.cpp qua `whisper-rs`, chạy trong **tiến trình phụ `asr-worker`**. Đây là một binary Rust nhỏ trong cùng workspace, link tĩnh whisper.cpp (§6.12). Dùng Metal trên macOS và Vulkan trên Windows; lỗi GPU thì tự chuyển sang CPU.
- **Giao tiếp với tiến trình chính:** qua stdin/stdout, không mở cổng mạng. Mỗi thông điệp có độ dài ghi ở đầu và được mã hóa nhị phân. Kiểu thông điệp nằm trong crate `asr-protocol`, dùng chung cho cả hai bên (§12).
  - `load {model_path, use_gpu}` → `ready {backend, device}`.
  - `transcribe {segment_id, pcm, languages, prompt_tokens, audio_ctx}` → `result {segment_id, lang, lang_prob, text, tokens, no_speech_prob, timings}`. `pcm` là âm thanh 16 kHz mono; một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB, nên chi phí truyền không đáng kể.
  - `warmup` và `shutdown`.
- **Hai bản trên Windows:** `asr-worker-vulkan` (Vulkan và CPU) và `asr-worker-cpu` (chỉ CPU). Bản Vulkan phụ thuộc trực tiếp vào `vulkan-1.dll`, nên không chạy được trên máy không có Vulkan. macOS chỉ có một bản (Metal và CPU).
  - Mỗi lần app khởi động, kể cả ở bước kiểm tra cấu hình lần đầu (§4.1), app chạy nền `asr-worker-vulkan --probe`. Tiến trình này in ra danh sách GPU (loại thiết bị, dung lượng heap `DEVICE_LOCAL`) rồi thoát; kết quả dùng để đề xuất gói model (§6.7). Mọi code đụng tới GPU đều nằm trong tiến trình phụ, nên driver lỗi lúc dò GPU cũng không làm sập app.
  - Khi cần chạy `asr-worker`, app dùng bản Vulkan nếu lần dò tìm thấy GPU dùng được. Bản Vulkan không khởi động được, hoặc crash lúc nạp model, thì app chạy bản CPU.
- **Khi tiến trình phụ lỗi:** tự khởi động lại, chờ lần lượt 1, 2, 5 giây giữa các lần, giống `llama-server` (§6.5).
  - Đoạn đang xử lý được gửi lại một lần. Lỗi lần nữa thì đánh dấu "[bỏ qua đoạn]" (`dropped`, §6.6).
  - Crash 2 lần liên tiếp khi đang dùng GPU thì chuyển sang CPU, báo "Đang chạy bằng CPU (chậm hơn)".
  - Quá 5 lần trong 10 phút thì dừng dịch và báo lỗi.
- **Model:**
  - Gói Chuẩn: `large-v3-turbo` bản q5_0, khoảng 550 MB.
  - Gói Nhẹ: `small` bản q5_1, khoảng 190 MB.
- **Chọn ngôn ngữ:**
  - Lấy xác suất ngôn ngữ của Whisper, chuẩn hóa lại trong **tập người dùng cho phép**, rồi chọn ngôn ngữ cao nhất.
  - Nếu xác suất cao nhất (sau khi chuẩn hóa) dưới 0,5 thì giữ ngôn ngữ của đoạn trước, để ngôn ngữ không nhảy qua lại.
  - Nếu người dùng khóa ngôn ngữ, hoặc tập cho phép chỉ có một ngôn ngữ, thì bỏ bước nhận diện.
  - **Chi phí của bước nhận diện:** trong whisper.cpp, chế độ tự nhận diện chạy encoder một lượt để lấy xác suất ngôn ngữ, rồi chạy encoder thêm lượt nữa để chép lời. Lượt nhận diện còn chạy trước khi `audio_ctx` được áp dụng, nên lần gọi đầu tiên mã hóa đủ cửa sổ 30 giây. Để nguyên thì thời gian nhận dạng gần gấp đôi. `asr-worker` phải giữ chi phí này dưới 20% thời gian nhận dạng của đoạn, theo thứ tự ưu tiên:
    1. Dùng chung một lượt encode cho cả nhận diện và chép lời: gọi encode, rồi tự giải mã greedy bằng API mức thấp của whisper.cpp.
    2. Nếu không làm được, chỉ nhận diện trên tối đa 3 giây đầu của đoạn, với `audio_ctx` tương ứng.

    Cả hai cách có thể cần sửa nhỏ whisper.cpp để đặt `audio_ctx` trước khi encode. Nếu phải sửa thì ghi rõ bản vá và gửi lên upstream. Chốt ở S3.
- **Giải mã:** greedy, không dùng temperature fallback. Dùng tối đa 100 token của đoạn trước (cùng ngôn ngữ) làm prompt khởi đầu. Chặn các token không phải tiếng nói.
- **Rút ngắn cửa sổ mã hóa (`audio_ctx`):** mặc định whisper.cpp luôn mã hóa một cửa sổ 30 giây, kể cả khi đoạn chỉ dài 3 giây. App đặt `audio_ctx = min(1500, 50 × số giây của đoạn + 64)`, vì mỗi giây tương ứng 50 khung. Cách này giảm mạnh thời gian mã hóa, nhưng có thể làm giảm độ chính xác, nên phải đo WER ở mục S7.
- **Làm nóng:** ngay sau khi nạp model, `asr-worker` chạy thử một lần trên một đoạn im lặng để nạp sẵn kernel GPU.
- **Lọc lỗi "ảo giác" của Whisper:**
  - Bỏ đoạn có `no_speech_prob > 0,6`.
  - Bỏ các câu lặp n-gram.
  - Bỏ các câu hay bị bịa ra khi chỉ có nhạc hoặc im lặng, ví dụ "Thank you for watching", "Hãy subscribe cho kênh", "[Music]".

### 6.5 Dịch

- **Tiến trình phụ `llama-server`:** khóa cố định một phiên bản llama.cpp.
  - macOS arm64: dùng Metal.
  - Windows x64: dùng backend Vulkan và CPU, nạp backend lúc chạy, lỗi GPU thì tự chuyển CPU.
- **Lệnh chạy:** `llama-server -m <gguf> --host 127.0.0.1 --port <cổng trống ngẫu nhiên> --api-key <ngẫu nhiên> -c 2048 -np 1 -ngl auto --no-webui`. App gọi `/health` để biết server đã sẵn sàng.
  - `-ngl auto` là mặc định của llama.cpp hiện tại. Khi đó `--fit`, vốn bật sẵn, tự chọn số lớp đặt lên GPU theo VRAM còn trống, và chừa lại 1 GiB.
  - Không truyền `-ngl 99`. Đã đặt tay số lớp thì `--fit` không chỉnh nữa, nên máy ít VRAM dễ hết bộ nhớ lúc nạp model.
  - Chạy `llama-server` sau khi `asr-worker` đã nạp model (§5), để `--fit` tính cả phần VRAM mà whisper đang dùng.
- **Khi server lỗi:** tự khởi động lại, chờ lần lượt 1, 2, 5 giây giữa các lần. Quá 5 lần trong 10 phút thì báo lỗi, phụ đề chỉ hiện câu gốc.
- **API:** dùng `/v1/chat/completions` với `stream: true`, chat template lấy từ GGUF. Nếu template trong GGUF không dùng được, render template bằng `minijinja` phía Rust rồi gọi `/completion`. Chốt ở mục S4.
- **Mẫu prompt** lấy theo model card của Hy-MT2:
  - Khi câu có liên quan tới tiếng Trung, dùng mẫu tiếng Trung: `将以下文本翻译为{目标语言}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}`
  - Các trường hợp còn lại dùng mẫu tiếng Anh: `Translate the following text into {target}. Note that you should only output the translated result without any additional explanation:\n\n{text}`
  - Tên ngôn ngữ trong prompt: mẫu tiếng Anh dùng tên tiếng Anh (Vietnamese, English, Chinese, Japanese, Korean); mẫu tiếng Trung dùng tên tiếng Trung (越南语, 英语, 中文, 日语, 韩语), giống benchmark (`run_mt.py`).
  - **Thuật ngữ:** dùng mẫu "terminology" của Hy-MT2.
    - Chỉ lấy những mục trong từ điển có xuất hiện trong câu, tối đa 20 mục mỗi câu.
    - Trước khi so khớp, chuẩn hóa Unicode NFC và không phân biệt hoa thường.
    - Chữ Latin khớp theo ranh giới từ; chữ Trung, Nhật, Hàn khớp theo chuỗi con.
  - **Đưa câu trước vào làm ngữ cảnh** (mẫu "background information"): để dạng cờ thử nghiệm. Chỉ bật mặc định nếu ở mục S7 nó làm COMET tăng và độ trễ tăng không quá 20%.
- **Tham số sinh:** temperature 0, repeat penalty 1,05 (giống benchmark). Số token tối đa = min(4 × số token câu gốc + 32, 512).
- **Tăng tốc:** bật `cache_prompt` để dùng lại KV cache của phần hướng dẫn cố định ở đầu prompt. Khi bắt đầu phiên, gửi một request làm nóng.
- **Hậu xử lý:** bản dịch được stream ra thanh phụ đề (§4.4), nên hậu xử lý chạy ngay trong lúc stream, không chờ bản dịch hoàn chỉnh.
  - Cắt khoảng trắng thừa.
  - Giữ lại vài token đầu cho tới khi chắc chắn không phải nhãn đầu câu (như "Translation:" hay "译文：") hoặc ngoặc kép mở, rồi mới hiện. Nhãn thì bỏ. Ngoặc kép bao quanh thì bỏ nếu câu gốc không có.
  - **Bản dịch quá dài:** đo bằng token, không đo bằng ký tự, vì tỉ lệ ký tự giữa các cặp ngôn ngữ chênh nhau rất nhiều. Trong benchmark, câu tiếng Việt dài trung vị gấp 2,74 lần câu tiếng Trung cùng nghĩa; nếu đo bằng ký tự với ngưỡng 3 lần, gần nửa số câu Trung→Việt sẽ bị coi là lỗi. Ngưỡng tỉ lệ token đặt riêng cho từng cặp ngôn ngữ, lấy ở S7 từ tỉ lệ lớn nhất đo được trên benchmark, cộng thêm biên. Vượt ngưỡng thì cắt stream ngay.
  - **Thử lại** một lần với repeat penalty cao hơn (1,15). Với temperature 0, giữ nguyên tham số thì kết quả sẽ y hệt lần trước. Vẫn lỗi thì hiện câu gốc, đánh dấu "chưa dịch được".
- **Bỏ qua bước dịch** khi ngôn ngữ câu gốc trùng ngôn ngữ đích.

### 6.6 Phụ đề và bản chép lời

- **Cấu trúc:** `Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status }`, cộng thêm cờ `provisional` cho phụ đề tạm (§6.3). `status` nhận một trong các giá trị:
  - `asr_done`, `translating`, `done`, `failed`.
  - `same_lang`: câu đã là ngôn ngữ đích nên không dịch (F2).
  - `skipped`: bỏ bước dịch vì trễ, chỉ hiện câu gốc (§7).
  - `dropped`: đoạn âm thanh bị bỏ vì trễ hoặc vì `asr-worker` lỗi; bản chép lời hiện "[bỏ qua đoạn]" (§6.4, §7).
- **Gửi sang giao diện qua sự kiện Tauri:**
  - `subtitle://upsert`: gửi cả đối tượng.
  - `subtitle://delta`: gửi từng token trong lúc đang dịch.
- **Hiển thị:** thanh phụ đề hiện N dòng gần nhất; cửa sổ chính hiện toàn bộ.
- **Lưu trữ:**
  - Bản chép lời nằm trong bộ nhớ theo từng phiên.
  - App có một file SQLite **đã mã hóa** trong thư mục dữ liệu của app. Mã hóa bằng SQLCipher qua `rusqlite`, khóa lưu trong kho khóa của hệ điều hành (§10.2). File này chứa:
    - Từ điển thuật ngữ (Pro, F5).
    - Bản chép lời, chỉ khi bật "Lưu lịch sử" (Pro).
- **Xuất file:**
  - TXT, theo dạng `[giờ] câu gốc` rồi `→ bản dịch`.
  - SRT, chọn xuất câu gốc hoặc bản dịch.
  - Markdown.

### 6.7 Quản lý model

- **Manifest `models.json`** đặt trên CDN của thương hiệu (Cloudflare R2 + tên miền riêng), **ký bằng Ed25519**. Khóa công khai được build sẵn vào app.
  - Các trường: `id`, `tier`, `kind` (asr/mt/vad), `version`, `url`, `bytes`, `sha256`, `license_id`, `min_app_version`.
- **Hai gói model:**

  | Gói | Nhận dạng giọng nói | Dịch | VAD | Tổng |
  |---|---|---|---|---|
  | **Chuẩn** | whisper large-v3-turbo q5_0 | Hy-MT2-1.8B Q8_0 (1,91 GB) | silero-vad | khoảng 2,5 GB |
  | **Nhẹ** | whisper small q5_1 | Hy-MT2-1.8B Q4_K_M (1,13 GB) | silero-vad | khoảng 1,3 GB |

- **Đề xuất gói Chuẩn khi:**
  - máy Apple Silicon có RAM từ 16 GB; hoặc
  - máy Windows có RAM từ 16 GB và **card đồ họa rời** hỗ trợ Vulkan, có bộ nhớ riêng (VRAM) **từ 6 GB**. Gói Chuẩn cần khoảng 3,2–4 GB VRAM cho hai engine, cộng khoảng 1 GB cho app họp và Windows (bảng VRAM ở §8).
    - App xác định qua `asr-worker-vulkan --probe` (§6.4): `deviceType` là `VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU`, và heap `DEVICE_LOCAL` lớn nhất từ 6 GB.
    - Card rời từ 4 GB tới dưới 6 GB được đề xuất gói Nhẹ. Gói Nhẹ chỉ cần khoảng 2 GB VRAM, nên vẫn chạy hoàn toàn trên GPU. Người dùng vẫn chọn được gói Chuẩn; khi đó `llama-server` tự chuyển bớt lớp sang CPU cho vừa VRAM (§6.5), nên dịch chậm hơn.
    - GPU tích hợp dùng chung RAM nên chưa được tính, kể cả khi Vulkan báo dung lượng lớn.
    - S6 đo trên card rời 4 GB và trên GPU tích hợp. Kết quả dùng để quyết định có hạ ngưỡng, hoặc thêm tổ hợp whisper turbo + Hy-MT2 Q4_K_M cho nhóm máy này không (§14).

  Các máy còn lại được đề xuất gói Nhẹ. Người dùng vẫn đổi được.
- **Tải model:**
  - Dùng HTTP Range để tải tiếp được khi rớt mạng.
  - Ghi ra file `*.part`, kiểm tra SHA-256, rồi mới đổi tên thành file chính thức.
  - Trước khi tải, kiểm tra dung lượng trống còn ít nhất bằng kích thước model cộng 1 GB.
- **Nơi lưu:** thư mục dữ liệu của app theo Tauri (`app_local_data_dir`), nằm ngoài thư mục cài đặt.
  - macOS: `~/Library/Application Support/<bundle-id>/models`
  - Windows: `%LOCALAPPDATA%\<bundle-id>\models`. Không đặt trong `%LOCALAPPDATA%\<tên app>`, vì đó là thư mục cài đặt của bộ cài NSIS kiểu per-user. Ô "xóa dữ liệu app" của bộ gỡ cài đặt chỉ xóa `%APPDATA%\<bundle-id>` và `%LOCALAPPDATA%\<bundle-id>` (A6).
- **Tự host model:** Apache 2.0 và MIT cho phép phân phối lại. File LICENSE và NOTICE được đặt cạnh file model. Không tải từ Hugging Face hay GitHub của người khác.
- **Cập nhật model:** khi có mạng, app kiểm tra manifest lúc khởi động, tối đa một lần mỗi ngày. Có bản mới thì hỏi người dùng, không tự tải.

### 6.8 Thanh toán (PayOS) và bản quyền

**Vì sao cần license server riêng:**
- PayOS chỉ lo việc nhận tiền, không cấp license key.
- Khóa API của PayOS (client id, api key, checksum key) bắt buộc nằm trên server, không được nhúng vào app.
- Server viết bằng TypeScript + Hono, chạy trên Cloudflare Workers, lưu dữ liệu ở D1 (SQLite), dùng **tài khoản Cloudflare riêng** của sản phẩm.

**Chuẩn bị cho việc thêm cổng thanh toán quốc tế:**
- Phần thanh toán trên server nằm sau interface `PaymentProvider`, gồm `create_checkout`, `verify_webhook` và `get_payment_status`. PayOS là cài đặt đầu tiên.
- Thêm một cổng khác chỉ cần viết thêm một cài đặt và một endpoint webhook. License, token bản quyền và app đều không phải sửa.
- Bảng đơn hàng lưu thêm `provider` và `currency`. Mỗi gói Pro có giá riêng theo từng loại tiền.
- License chỉ quan tâm `expires_at`, không quan tâm tiền đến từ đâu. Vì vậy cả hai kiểu thanh toán đều dùng chung được:
  - Gói trả trước của PayOS: mỗi lần trả tiền cộng thêm 30 hoặc 365 ngày.
  - Thuê bao tự gia hạn của cổng quốc tế: mỗi webhook gia hạn cộng thêm một kỳ; khách hủy thì ngừng cộng.

**API của license server:**

| Endpoint | Việc làm |
|---|---|
| `POST /v1/checkout` `{plan: "pro_1m" \| "pro_12m", email, license_key?}` | Tạo đơn với `orderCode` duy nhất, gọi PayOS `POST /v2/payment-requests` với `expiredAt` = hiện tại + 15 phút. Trả về `checkoutUrl`, `qrCode` (chuỗi VietQR thô, app tự vẽ thành mã QR) và `order_token` (mã ngẫu nhiên để app hỏi trạng thái đơn). Khi gia hạn thì truyền thêm `license_key` đang có. |
| `POST /v1/webhooks/payos` | Kiểm tra chữ ký webhook bằng checksum key, rồi gọi PayOS `GET /v2/payment-requests/{orderCode}` để xác nhận. Chỉ coi đơn là đã trả khi `status` là `PAID` và `amountPaid` ≥ `amount`. Đánh dấu đơn đã trả tiền (idempotent theo `orderCode`). Cấp license mới, hoặc gia hạn license cũ thêm 30 hay 365 ngày, tính từ max(hôm nay, ngày hết hạn). Gửi email chứa key. URL webhook được đăng ký và xác nhận qua API `confirm-webhook` của PayOS khi triển khai. |
| `GET /v1/orders/{orderCode}?token=…` | App hỏi trạng thái đơn. Khi đơn đã trả tiền thì trả về key. |
| `POST /v1/licenses/activate` `{key, device_id_hash, device_label}` | Kích hoạt, tối đa 2 máy mỗi key. Trả về token bản quyền. Nếu `device_id_hash` đã có activation của key này (ví dụ khi cài lại app) thì dùng lại activation đó, không tốn thêm suất. Khi đã đủ 2 máy thì trả `409`, kèm danh sách máy đã kích hoạt: `activation_id`, `device_label` và thời điểm `validate` gần nhất. |
| `POST /v1/licenses/validate` `{key, activation_id}` | Trả về token mới nếu license còn hiệu lực |
| `POST /v1/licenses/deactivate` `{key, activation_id}` | Gỡ kích hoạt để chuyển máy. Gọi được từ chính máy đó, hoặc từ máy mới khi key đã đủ 2 máy (gỡ từ xa). Mỗi lần gỡ tính vào giới hạn ở §10.2. |
| `POST /v1/licenses/recover` `{email}` | Gửi lại mọi key còn hiệu lực của email này vào chính email đó. Luôn trả `200`, để không lộ email nào có key. Có giới hạn tần suất (§10.2). |

**Công cụ hỗ trợ:** vài endpoint `/admin/*` đặt sau Cloudflare Access, chỉ người vận hành dùng được. Các việc:
- Tra cứu theo email hoặc `orderCode`, gửi lại key.
- Mở khóa key bị khóa tạm (§10.2).
- Cấp hoặc gia hạn tay, ví dụ khi khách chuyển thiếu rồi chuyển bù.
- Gỡ activation, thu hồi key.

Mọi thao tác đều được ghi nhật ký.

**Chữ ký khi tạo link thanh toán:** theo tài liệu PayOS, ký HMAC-SHA256 bằng checksum key trên chuỗi các trường `amount`, `cancelUrl`, `description`, `orderCode`, `returnUrl` xếp theo thứ tự chữ cái.

**Token bản quyền:**
- Ký bằng Ed25519. Khóa công khai build sẵn vào app, nên app kiểm tra được token ngay cả khi offline.
- Token gồm: `kid` (mã của khóa đã ký token, để đổi được khóa khi cần, §10.2), `license_id`, `plan`, `expires_at`, `activation_id`, `device_id_hash`, `issued_at`, và `refresh_before` (= `issued_at` + 14 ngày).
- `device_id_hash` là mã băm SHA-256 của ID phần cứng: IOPlatformUUID trên macOS, MachineGuid trên Windows.
- Quá `refresh_before` mà vẫn chưa làm mới được token (ví dụ vì offline lâu) thì app về Free.
- Quá `expires_at` thì app gọi `validate` trước, nếu có mạng, vì key có thể đã được gia hạn từ máy khác. App chỉ về Free và nhắc gia hạn khi server xác nhận chưa gia hạn, hoặc khi không có mạng.

**Mua ngay trong app:**
1. Người dùng mở "Nâng cấp Pro", chọn gói, nhập email.
2. App **hiện mã VietQR ngay trong app**, tự vẽ từ chuỗi `qrCode`, kèm nút mở trang thanh toán của PayOS.
3. Người dùng quét mã bằng app ngân hàng.
4. App hỏi trạng thái đơn mỗi 3 giây, tối đa 15 phút, bằng thời hạn của link thanh toán. Khi đơn đã trả tiền, app **tự kích hoạt trên máy đang dùng**. Với đơn gia hạn, app gọi `validate` để lấy token có `expires_at` mới, thay vì gọi `activate`.
5. Nếu app bị đóng khi đơn chưa được xác nhận, lần mở tiếp theo app hỏi lại đơn đó (app lưu `orderCode` và `order_token`).
6. Key cũng được gửi qua email, để kích hoạt máy thứ hai hoặc cài lại máy.

**Các quy tắc khác:**
- **Gia hạn:** PayOS không tự trừ tiền định kỳ. App nhắc trước 7 ngày và khi đã hết hạn. Nút "Gia hạn" tạo đơn mới gắn với key hiện có.
- **Kiểm tra định kỳ:** lúc khởi động và sau đó mỗi giờ, app xem lần `validate` thành công gần nhất đã quá 24 giờ chưa. Nếu đã quá và có mạng thì gọi `validate` để lấy token mới. Phải kiểm tra cả khi app đang chạy, vì app thường nằm ở khay hệ thống nhiều ngày liền. Nếu chỉ kiểm tra lúc khởi động, quá `refresh_before` app sẽ tự về Free dù vẫn có mạng.
- **Máy bị gỡ từ xa** sẽ về Free ở lần `validate` kế tiếp. Nếu máy đó đang offline thì token cũ vẫn dùng được tới `refresh_before`, tối đa 14 ngày.
- **Quota Free:** tính "phút dịch" bằng tổng độ dài các đoạn có tiếng nói, không tính lúc im lặng. Lưu trong kho khóa của hệ điều hành (Keychain trên macOS, Credential Manager trên Windows), có chống chỉnh lùi đồng hồ (§10.2). MVP chấp nhận rủi ro bị lách ở mức cơ bản, nhưng chặn hai cách lách dễ nhất:
  - Reset lúc 00:00 theo giờ máy, nhưng chỉ khi ngày đã tăng so với lần reset trước và đã qua ít nhất 20 giờ theo đồng hồ thật. Vì vậy đổi múi giờ qua lại không reset được quota.
  - Nếu mất bản ghi quota trong khi app đã có dữ liệu từ trước (ví dụ file cài đặt), app coi như đã dùng hết quota của ngày hôm đó.
- **Trong app:** interface `LicenseProvider` (activate, validate, deactivate) được cài đặt bằng một client gọi license server.
- **Giới hạn:** PayOS chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng VND, nên MVP chỉ bán được cho khách ở Việt Nam.

### 6.9 Cài đặt

Lưu dạng JSON bằng `tauri-plugin-store`, có số phiên bản schema và bước migrate khi schema đổi.

Các khóa chính:
- `uiLanguage`, `targetLanguage`, `sourceLanguages[]`, `sourceLock?`
- `audioSource`, `vadEndSilenceMs`
- `overlay.{fontSize, lines, opacity, showSource, locked, positions}`
- `modelTier`
- `hotkeys`
- `saveHistory`
- `launchAtLogin`
- `theme`
- `updateChannel`: `stable` hoặc `beta` (§6.11)
- `experimental.translationContext`: cờ thử nghiệm đưa câu trước vào làm ngữ cảnh (§6.5)

Từ điển thuật ngữ không nằm trong file cài đặt mà nằm trong SQLite mã hóa (§6.6).

### 6.10 Giao diện

- **Công nghệ:** React 19, TypeScript, Vite, Zustand, cùng bộ công cụ quen thuộc với AI Live Translator.
- **Hai cửa sổ `main` và `overlay`,** mỗi cửa sổ có entry HTML riêng. Giao tiếp với lõi Rust qua `invoke` (lệnh) và sự kiện Tauri; store Zustand đăng ký nhận sự kiện.
- **Nhận diện thương hiệu mới**, không dùng lại nhận diện của AI Live Translator.
- **Trợ năng:** chữ phóng to được, đủ tương phản cho phụ đề.

### 6.11 Đóng gói, ký số, cập nhật

- **Bộ cài (Tauri bundler):**
  - Windows: NSIS `.exe`, kèm bootstrapper WebView2.
  - macOS: `.dmg` cho arm64.
  - Mục tiêu dung lượng bộ cài ≤ 60 MB, vì model tải riêng. Đo sớm ở S3, vì bộ cài Windows có hai bản `asr-worker` và các backend ggml của `llama-server`.
- **Ký số:**
  - **Windows:** chứng thư ký mã OV có khóa nằm trên HSM của một dịch vụ ký trên cloud (ví dụ SSL.com eSigner, DigiCert KeyLocker), để CI ký được (§10.2). Từ 2023, khóa của chứng thư OV bắt buộc nằm trên phần cứng; nếu là token USB thì CI không dùng được. Lúc đầu SmartScreen vẫn có thể cảnh báo cho tới khi app tích đủ uy tín.
  - **macOS:** Developer ID Application, bật hardened runtime và notarize.
- **macOS không chạy sandbox**, vì phân phối trực tiếp. App cần process tap, và cần bật `macOSPrivateApi` để làm cửa sổ trong suốt. Vì vậy hiện chưa thể lên Mac App Store, khớp với quyết định D10.
- **Tự cập nhật:** dùng `tauri-plugin-updater`.
  - File manifest cập nhật đặt trên CDN, ký bằng khóa cập nhật.
  - Kiểm tra lúc khởi động và mỗi 24 giờ; cài bản mới ở lần thoát app kế tiếp. App thường nằm ở khay nhiều ngày nên ít khi thoát. Vì vậy khi có bản mới và app đang rảnh (không dịch), app hiện thông báo mời khởi động lại để cập nhật.
  - Có hai kênh: stable và beta, chọn trong Cài đặt (§6.9).
- **File đi kèm:** các tiến trình phụ đặt ở `src-tauri/binaries/`, tên kèm target triple:
  - `asr-worker` trên macOS; `asr-worker-vulkan` và `asr-worker-cpu` trên Windows (§6.4).
  - `llama-server`, kèm thư viện backend của ggml trên Windows.

### 6.12 Quy tắc chọn phiên bản thư viện

- **Luôn dùng bản ổn định mới nhất** của công nghệ và thư viện bên thứ ba tại thời điểm cài. Không dùng bản beta, rc hay nightly, trừ khi bắt buộc; khi đó phải ghi rõ lý do.
- **Trước khi chốt một phiên bản, phải kiểm tra kỹ tương thích và xung đột:**
  - Đọc release notes và changelog, xem có thay đổi phá vỡ tương thích (breaking change) nào ảnh hưởng tới app không.
  - Kiểm tra peer dependency và yêu cầu về phiên bản. Ví dụ:
    - Thư viện React phải hỗ trợ React 19.
    - Mọi plugin Tauri phải cùng dòng phiên bản với Tauri core.
    - Crate Rust phải chạy được với bản Rust stable đang dùng (MSRV).
    - Node.js phải đúng phiên bản Vite yêu cầu.
  - Trong cùng một tiến trình, không được có hai bản của cùng một thư viện gốc, và không được trùng symbol.
    - Riêng ggml, app cố ý có hai bản nhưng ở hai tiến trình phụ riêng (§5): whisper.cpp trong `asr-worker`, llama.cpp trong `llama-server`. Tiến trình chính không link ggml.
    - `asr-worker` link tĩnh whisper.cpp và tắt nạp backend động (`GGML_BACKEND_DL`). Nhờ vậy nó không nạp thư viện ggml nào từ đĩa, nên không nạp nhầm thư viện ggml của `llama-server` nằm cùng thư mục. Máy Windows không có Vulkan dùng bản `asr-worker-cpu` (§6.4). Kiểm tra ở S3.
    - Vì link tĩnh, `asr-worker` không tự chọn được biến thể CPU lúc chạy. Phải build với `GGML_NATIVE=OFF` và mức CPU cố định: x64 bật AVX2, FMA, F16C, không bật AVX-512; arm64 nhắm Apple M1. Nếu không, bản build trên máy CI đời mới có thể crash trên máy người dùng vì gặp lệnh CPU không hỗ trợ.
    - `llama-server` trên Windows build với `GGML_BACKEND_DL` và `GGML_CPU_ALL_VARIANTS`: có Vulkan thì nạp backend Vulkan, và tự chọn biến thể CPU hợp với máy. Trên macOS thì build tĩnh với Metal và `GGML_NATIVE=OFF`.
  - Engine mới phải chạy đúng với model:
    - llama.cpp mới phải nạp và chạy đúng GGUF của Hy-MT2.
    - `whisper-rs` phải đi kèm whisper.cpp có đủ các tính năng cần dùng: `audio_ctx`, API mức thấp để encode và giải mã (§6.4), và VAD nếu chọn chạy Silero trong `asr-worker` (§6.3).
- **Sau mỗi lần cài hoặc nâng cấp:**
  - Build lại toàn bộ và chạy hết test.
  - Chạy `cargo audit`, `cargo deny` và `pnpm audit`.
  - Nếu có đụng tới engine hoặc model thì chạy lại benchmark (§11).
- **Khóa phiên bản:**
  - Commit lockfile (`Cargo.lock`, `pnpm-lock.yaml`), và ghi rõ phiên bản llama.cpp, whisper.cpp đang dùng.
  - Chỉ nâng cấp khi chủ động quyết định, không để phiên bản tự nhảy.
- **Bài học từ benchmark 2026-09-29:** với `transformers` 5.x, MADLAD dịch ra ký tự vô nghĩa, trong khi bản 4.57 chạy đúng. Vì vậy dùng bản mới nhất vẫn phải kiểm chứng bằng test chạy thật.

## 7. Luồng xử lý, đa luồng và chống nghẽn

- **Các luồng và tiến trình:**
  1. Callback thu âm thanh (realtime), ghi vào ring buffer.
  2. Luồng tiền xử lý và VAD.
  3. Runtime `tokio`: gửi từng đoạn sang `asr-worker` và nhận kết quả, dịch (HTTP stream), sự kiện giao diện, tải model, bản quyền.
  4. Tiến trình phụ `asr-worker`: mỗi lần xử lý một đoạn, chạy trên GPU hoặc CPU.
  5. Tiến trình phụ `llama-server`.
- **Hàng đợi đoạn âm thanh (VAD → nhận dạng)** chứa tối đa 3 đoạn.
  - Khi đầy, gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây.
  - Chỉ bỏ đoạn khi độ trễ vượt 20 giây. Đoạn bị bỏ được đánh dấu "[bỏ qua đoạn]" trong bản chép lời (`dropped`, §6.6).
- **Độ trễ** tính bằng thời điểm hiện tại trừ `end_ms` của đoạn đang xử lý. Vượt 6 giây thì hiện chỉ báo "Đang trễ".
- **Hàng đợi dịch** chứa tối đa 3 câu.
  - Khi đầy, gộp các câu liên tiếp cùng ngôn ngữ vào một request. Các phụ đề tương ứng cũng được gộp thành một phụ đề, lấy `start_ms` của câu đầu và `end_ms` của câu cuối.
  - Câu nào đã chờ quá 20 giây thì bỏ qua bước dịch, chỉ hiện câu gốc (`skipped`), để bắt kịp tốc độ nói.
- **Số đo từng phiên**, lưu trên máy và không gửi đi đâu: thời gian của từng bước (cắt đoạn, nhận dạng, dịch, tổng thể). Xem được trong bảng debug ẩn và trong log để hỗ trợ khi người dùng báo lỗi.

## 8. Hiệu năng và cấu hình máy

| Hạng máy | macOS | Windows | Gói model |
|---|---|---|---|
| Khuyến nghị | Apple Silicon M1 trở lên, RAM 16 GB (riêng M1 cơ bản phải xác nhận ở S6) | Windows 10/11 x64, RAM 16 GB, card đồ họa rời hỗ trợ Vulkan với VRAM riêng ≥ 6 GB (NVIDIA, AMD, Intel Arc) | Chuẩn |
| Tối thiểu | Apple Silicon, RAM 8 GB | RAM 8 GB, CPU 4 nhân có AVX2 | Nhẹ |
| Chưa hỗ trợ trong MVP | Mac chip Intel | ARM64, CPU không có AVX2, RAM < 8 GB | — |

**Ngân sách độ trễ**, tính từ lúc người nói dừng câu đến lúc bản dịch hiện đủ. Bước dịch tính cho câu 38 token, là độ dài trung vị của bản dịch Anh→Việt trong benchmark, ở 75% trần băng thông (bảng thứ hai):

| Bước | Gói Chuẩn, băng thông ≥ 190 GB/s (M1 Pro trở lên, card rời ≥ 6 GB) | Gói Chuẩn, Mac chip cơ bản (68–153 GB/s) | Gói Nhẹ, chỉ CPU |
|---|---|---|---|
| Im lặng để chốt đoạn (§6.3) | 0,3 s | 0,3 s | 0,3 s |
| Nhận dạng giọng nói (`audio_ctx` rút ngắn) | 0,3–0,6 s | 0,3–0,6 s | 0,6–1,2 s |
| Dịch (stream, có `cache_prompt`) | 0,2–0,5 s | 0,6–1,4 s | 0,8–1,5 s |
| Hiển thị | < 0,05 s | < 0,05 s | < 0,05 s |
| **Tổng** | **≈ 0,8–1,45 s** | **≈ 1,2–2,35 s** | **≈ 1,7–3,05 s** |

Bảng trên là ước tính, phải đo thật ở S6. Bảng giả định chi phí nhận diện ngôn ngữ đã được giữ nhỏ như §6.4 yêu cầu.
- **Mục tiêu p50 ≤ 2,0 giây:** máy băng thông cao đạt với dư địa lớn. M4, M5 cơ bản đạt; M2, M3 cơ bản sát ngưỡng; riêng M1 cơ bản (68 GB/s) nhiều khả năng không đạt với Q8_0.
- **Mục tiêu p90 ≤ 3,0 giây:** bản dịch Anh→Việt ở p90 dài 70 token. Với độ dài này, tổng thời gian khoảng 2,7 giây trên M2/M3 cơ bản, và khoảng 3,6 giây trên M1 cơ bản, vượt mục tiêu.
- **Máy tối thiểu (p50 ≤ 3,5 giây):** gói Nhẹ chạy CPU đạt, nhưng không dư nhiều.

Mốc thực tế (benchmark 2026-09-29): Hy-MT2 Q8_0 chạy trên CPU 4 luồng của M4 Pro mất trung bình 0,45 giây/câu trên 30 câu trộn nhiều chiều. Riêng Anh→Việt, trung vị là 0,53 giây cho câu 40 token.

**Băng thông bộ nhớ là nút thắt của bước dịch.** Mỗi token sinh ra phải đọc gần hết trọng số của model, nên tốc độ sinh không vượt quá băng thông bộ nhớ chia cho kích thước model. Thực tế thường chỉ đạt khoảng 70–80% mức trần này.

| Máy | Băng thông bộ nhớ | Trần tốc độ với Q8_0 (1,91 GB) | Dịch câu 38 token ở 75% mức trần |
|---|---|---|---|
| M1 cơ bản | 68 GB/s | khoảng 35 token/giây | khoảng 1,4 s |
| M2, M3 cơ bản | 100 GB/s | khoảng 50 token/giây | khoảng 1,0 s |
| M4 cơ bản | 120 GB/s | khoảng 63 token/giây | khoảng 0,8 s |
| M5 cơ bản | 153 GB/s | khoảng 80 token/giây | khoảng 0,6 s |
| M1 Pro, card rời tầm trung | khoảng 190–200 GB/s | khoảng 100 token/giây | khoảng 0,5 s |

Nếu S6 xác nhận M1 cơ bản không đạt, có hai phương án:
- Nâng hạng máy khuyến nghị lên M2 trở lên, hoặc M1 Pro trở lên.
- Trên máy băng thông thấp, dùng Q4_K_M (1,13 GB) cho bước dịch nhưng vẫn giữ whisper turbo. Trên M1 cơ bản, bước dịch khi đó còn khoảng 0,85 giây. Đổi lại, COMET giảm tối đa 0,02 (giả định 6 ở §14).

**RAM ước tính (RSS), cần kiểm chứng ở mục S6:**

| Thành phần | Gói Chuẩn | Gói Nhẹ |
|---|---|---|
| App và WebView | khoảng 0,3 GB | khoảng 0,3 GB |
| `asr-worker` (whisper) | 1–1,5 GB (turbo) | khoảng 0,4 GB (small) |
| `llama-server` | 2,5–4 GB (Q8_0; đo được tối đa 3,95 GB trên CPU với context 2048) | 1,5–2,5 GB |
| **Tổng** | **khoảng 4–6 GB** | **khoảng 2,2–3,2 GB** |

**Về RAM của `llama-server`:**
- KV cache của Hy-MT2 chỉ khoảng 128 MB ở context 2048 (32 lớp × 4 KV head × 128 chiều, f16). Vì vậy hạ context gần như không giảm được RAM. mmap thì vốn đã bật sẵn.
- Con số 3,95 GB đo trên CPU nhiều khả năng gồm cả bản trọng số được llama.cpp sắp xếp lại (repack) để chạy nhanh trên CPU. Nếu thiếu RAM khi chạy bằng CPU thì thử `--no-repack`, đổi lại chậm hơn.
- Trên GPU con số sẽ khác, nên S6 đo theo đúng backend.

**VRAM ước tính trên Windows (card rời), cần kiểm chứng ở S6:**

| Thành phần | Gói Chuẩn | Gói Nhẹ |
|---|---|---|
| `asr-worker` (whisper, gồm buffer tính toán) | 1–1,5 GB (turbo) | khoảng 0,4 GB (small) |
| `llama-server` (trọng số, KV cache khoảng 0,13 GB, buffer tính toán) | 2,2–2,5 GB (Q8_0) | khoảng 1,5 GB (Q4_K_M) |
| Phần chừa cho app họp, trình duyệt và Windows (`--fit` mặc định chừa 1 GiB) | khoảng 1 GB | khoảng 1 GB |
| **Tổng** | **khoảng 4,2–5 GB, nên ngưỡng đề xuất là 6 GB** | **khoảng 2,9 GB, vừa card 4 GB** |

**Mục tiêu tải máy:** CPU trung bình ≤ 30% trên máy khuyến nghị khi người trong cuộc họp nói liên tục, để app họp vẫn chạy mượt.

## 9. Xử lý lỗi

| Tình huống | Cách phát hiện | Cách xử lý |
|---|---|---|
| macOS chưa cấp quyền ghi âm thanh hệ thống | Tạo tap bị lỗi, hoặc buffer toàn im lặng kèm trạng thái quyền | Hiện màn hình hướng dẫn, có nút mở System Settings |
| Đang dịch mà hơn 60 giây không có âm thanh vào | Mức RMS của luồng âm thanh, kể cả phần im lặng được chèn khi Windows không trả gói dữ liệu (§6.1) | Thanh phụ đề hiện "Không nghe thấy âm thanh" kèm gợi ý cách sửa |
| Thiết bị phát thay đổi (cắm tai nghe, kết nối Bluetooth) | `IMMNotificationClient` trên Windows / listener của Core Audio trên macOS | Tự khởi tạo lại việc thu âm trong ≤ 2 giây |
| Model thiếu hoặc hỏng | Lúc khởi động chỉ kiểm tra có file và đúng kích thước, vì băm 2,5 GB mỗi lần khởi động tốn vài giây. SHA-256 đầy đủ chỉ kiểm sau khi tải xong (§6.7), và kiểm lại khi nạp model lỗi. | Đề nghị tải lại |
| `asr-worker` không chạy hoặc bị crash | Mã thoát, hoặc không trả kết quả trong thời gian chờ | Tự khởi động lại theo §6.4, gửi lại đoạn đang xử lý một lần. Crash 2 lần liên tiếp khi dùng GPU thì chuyển sang CPU. Quá 5 lần trong 10 phút thì dừng dịch và báo lỗi. |
| `llama-server` không chạy hoặc bị crash | Mã thoát, hoặc `/health` báo lỗi | Tự khởi động lại theo §6.5. Quá giới hạn thì báo lỗi, chỉ hiện câu gốc. |
| GPU khởi tạo lỗi, hoặc máy Windows không có Vulkan | Log của backend; `asr-worker-vulkan` không khởi động được (§6.4) | Chạy `asr-worker-cpu`, và `llama-server` chạy bằng CPU. Báo "Đang chạy bằng CPU (chậm hơn)". |
| Thiếu RAM hoặc VRAM | RAM trống thấp, hoặc tiến trình phụ báo hết bộ nhớ, kể cả bộ nhớ GPU | Đề xuất chuyển sang gói Nhẹ |
| Trễ dồn lại | Độ trễ > 6 giây | Hiện chỉ báo và áp dụng chính sách ở §7 |
| Hết quota Free | Bộ đếm phút | Dừng dịch, hiện "Đã dùng hết 30 phút hôm nay" kèm nút nâng cấp |
| License không hợp lệ, hết hạn hoặc bị thu hồi | Kết quả `validate` | Về Free, báo rõ lý do |
| Mất mạng đúng lúc cần kiểm tra license | Lỗi mạng | Giữ Pro trong 14 ngày ân hạn |
| Key đã kích hoạt đủ 2 máy | `activate` trả `409` | Hiện danh sách máy đã kích hoạt (tên máy, lần dùng gần nhất), cho gỡ một máy rồi kích hoạt máy đang dùng. Vượt giới hạn gỡ ở §10.2 thì hướng dẫn liên hệ hỗ trợ. |
| Khách đã chuyển khoản nhưng webhook của PayOS đến chậm hoặc bị mất | App vẫn đang chờ; server có đơn chưa xác nhận | App hỏi trạng thái đơn mỗi 3 giây. Server tự đối soát bằng `GET /v2/payment-requests/{id}` mỗi 5 phút cho các đơn chưa xác nhận. |
| Webhook bị gửi trùng | Trùng `orderCode` | Xử lý idempotent: mỗi đơn chỉ cấp hoặc gia hạn license một lần |
| Khách chuyển thiếu tiền, hoặc link thanh toán hết hạn | `amountPaid` < `amount`, hoặc trạng thái đơn trả về từ PayOS | Không cấp license, hiện hướng dẫn liên hệ hỗ trợ. Hỗ trợ cấp tay khi khách đã chuyển bù (§6.8). |
| Tải model thất bại | Lỗi HTTP hoặc sai SHA-256 | Thử lại 3 lần, cho phép tải tiếp sau |
| Bản dịch lỗi (quá dài, có kèm lời giải thích) | Tỉ lệ token theo từng cặp ngôn ngữ (§6.5), mẫu nhận dạng | Cắt stream, thử lại một lần với repeat penalty cao hơn, sau đó hiện câu gốc |

## 10. Quyền riêng tư, bảo mật, pháp lý

### 10.1 Quyền riêng tư và pháp lý

- **Âm thanh** chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng.
- **App chỉ kết nối mạng để:** tải manifest và model, kiểm tra cập nhật, gọi license server của sản phẩm (khi mua, kích hoạt, kiểm tra bản quyền). MVP **không có analytics và không gửi báo cáo crash**. Log nằm trên máy; khi cần hỗ trợ, người dùng tự gửi.
- **Tiến trình phụ:** `llama-server` chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy. `asr-worker` không mở cổng mạng nào, chỉ giao tiếp qua stdin/stdout.
- **Khóa API của PayOS** (client id, api key, checksum key) chỉ nằm trên license server, được lưu dưới dạng secret, không bao giờ có trong app.
- **Lịch sử chép lời** mặc định tắt, chỉ lưu trên máy, xóa toàn bộ được bằng một nút.
- **Luật Bảo vệ dữ liệu cá nhân 2025 (Việt Nam):**
  - App không có tài khoản đăng nhập.
  - License server chỉ lưu email (để gửi và khôi phục key), thông tin đơn hàng, license, mã băm của ID máy, tên máy (`device_label`, để người dùng nhận ra máy khi cần gỡ) và thời điểm kiểm tra bản quyền gần nhất.
  - Việc chuyển khoản do ngân hàng và PayOS xử lý; server không nhận số tài khoản ngân hàng của khách.
  - Khi mua, người dùng tick đồng ý cho xử lý email vào đúng mục đích này.
  - Chính sách quyền riêng tư phải ghi rõ dữ liệu nào được lưu, lưu bao lâu, và cách yêu cầu xóa.
  - **Chuyển dữ liệu ra nước ngoài:** license server (Cloudflare D1) và dịch vụ gửi email đặt ngoài Việt Nam, nên có thể thuộc diện chuyển dữ liệu cá nhân xuyên biên giới. Khi đó phải lập hồ sơ đánh giá tác động và gửi cơ quan chuyên trách trong 60 ngày kể từ lần chuyển đầu tiên. Hộ kinh doanh và doanh nghiệp siêu nhỏ được miễn; doanh nghiệp nhỏ và doanh nghiệp khởi nghiệp được chọn không làm trong 5 năm đầu. Việc này phụ thuộc loại hình đăng ký kinh doanh (§15), cần hỏi luật sư.
- **Giấy phép bên thứ ba**, liệt kê ở màn hình Giới thiệu và file `THIRD_PARTY_NOTICES`:
  - Hy-MT2: Apache 2.0, kèm LICENSE và NOTICE. Nếu tự nén lại model thì phải ghi chú là đã sửa đổi.
  - Trọng số Whisper: MIT.
  - whisper.cpp, llama.cpp, ggml: MIT.
  - Silero VAD: MIT.
  - Tauri: MIT/Apache 2.0.
  - React: MIT.
  - SQLCipher: giấy phép kiểu BSD, bắt buộc ghi công. OpenSSL (Apache 2.0), nếu dùng bản đi kèm.
  - ONNX Runtime (MIT), nếu chạy Silero qua ONNX (§6.3).
  - Thư viện vẽ mã QR (§6.8).
  - Font chữ.
  - Danh sách đầy đủ được sinh tự động từ `Cargo.lock` và `pnpm-lock.yaml` (ví dụ bằng `cargo about`), và được kiểm ở CI bằng `cargo deny`.
- **Không dùng tài sản nào của RTranslator** (NLLB, HY-MT1.5, bộ từ điển GPL…). Nếu có chép code từ RTranslator thì phải giữ thông báo Apache 2.0.
- **Nhãn hiệu:** chỉ nhắc tên Teams, Zoom, Meet để mô tả khả năng tương thích, kèm câu miễn trừ "không liên kết với các công ty này".

### 10.2 Bảo mật và chống sao chép

**Giới hạn cần nói rõ:**
- Không app desktop nào chống crack được tuyệt đối. App chạy offline thì càng dễ bị crack hơn.
- Model và engine đều là mã nguồn mở, nên không ngăn được một team giỏi tự làm một app tương tự.

**Mục tiêu:**
1. Làm cho việc crack và clone tốn công tới mức không đáng làm.
2. Bảo vệ người dùng khỏi các bản giả mạo.
3. Bảo vệ thương hiệu bằng pháp lý.

**Nguyên tắc:**
- **App không chứa bí mật nào.** Trong app chỉ có khóa công khai (để kiểm tra token bản quyền, manifest model và bản cập nhật). Mọi khóa bí mật nằm trên server hoặc trong hệ thống ký của CI.
- **Không đầu tư quá tay vào chống crack.** Biện pháp nặng có thể làm app chậm và chặn nhầm người dùng thật. Lợi thế thật của sản phẩm là chất lượng dịch tiếng Việt, tốc độ cải tiến, thương hiệu và kênh bán.

**Các biện pháp trong MVP:**

| Mối đe dọa | Biện pháp |
|---|---|
| Crack để dùng Pro miễn phí | Kiểm tra bản quyền ở nhiều chỗ trong code Rust, không dồn vào một biến đúng/sai duy nhất. Bản phát hành bật `strip`, `lto`, `codegen-units = 1`, `panic = "abort"`, và làm rối các chuỗi liên quan tới bản quyền. |
| Sửa hoặc ký lại file của app | Lúc khởi động, app tự kiểm chữ ký số của chính nó. macOS dùng `SecStaticCodeCheckValidity` kèm yêu cầu đúng Team ID. Windows dùng `WinVerifyTrust` và so tên chủ chứng thư. Chữ ký không hợp lệ thì app chỉ chạy chế độ Free, báo "Bản cài không chính hãng" kèm link tải chính thức. Bản build dev bỏ qua bước này. |
| Chỉnh lùi đồng hồ máy, hoặc đổi múi giờ qua lại, để lách quota Free hoặc hạn dùng | App lưu mốc thời gian lớn nhất từng thấy. Nếu giờ hiện tại nhỏ hơn mốc đó quá 10 phút thì: không reset quota ngày, coi token là phải kiểm tra online lại, và nhắc người dùng chỉnh giờ. Quota chỉ reset khi đã qua ít nhất 20 giờ theo đồng hồ thật (§6.8). |
| Sửa hoặc xóa trạng thái bản quyền và quota trên máy | Lưu trong kho khóa của hệ điều hành (Keychain trên macOS, Credential Manager trên Windows), không lưu file thường. Mất bản ghi quota thì coi như đã hết quota trong ngày (§6.8). |
| Chia sẻ hoặc bán lại key | Mỗi key tối đa 2 máy; kích hoạt lại trên cùng một máy không tốn thêm suất. Nếu trong 30 ngày có hơn 3 lần gỡ (kể cả gỡ từ xa) rồi kích hoạt máy khác thì khóa tạm key và yêu cầu liên hệ hỗ trợ. Key sinh ngẫu nhiên với ít nhất 128 bit, có ký tự kiểm tra để phát hiện gõ sai. |
| Dò key hoặc spam license server | Giới hạn request theo IP, theo key và theo email, ví dụ `activate` ≤ 10 lần/giờ/IP, `validate` ≤ 30 lần/giờ/key, `checkout` ≤ 10 lần/giờ/IP, `recover` ≤ 3 lần/giờ/email. Vượt ngưỡng thì trả `429`. |
| Bị clone, đổi thương hiệu rồi bán lại | **Pháp lý:** đăng ký nhãn hiệu (tên và logo) tại Cục Sở hữu trí tuệ Việt Nam, mở rộng ra quốc tế sau. EULA cấm dịch ngược, cấm phân phối lại, cấm đổi thương hiệu. Có sẵn quy trình yêu cầu Microsoft Store và nhà cung cấp hosting gỡ bản nhái. **Kỹ thuật:** logic quan trọng (prompt, cắt và ghép câu, khớp thuật ngữ) nằm trong Rust đã biên dịch; JavaScript chỉ lo hiển thị và được rút gọn. Manifest model, bản cập nhật và token đều ký bằng khóa riêng, nên bản nhái không dùng được hạ tầng của sản phẩm. |
| Bản giả có cài mã độc | Ký số và notarize mọi bản phát hành. Chỉ phát hành qua tên miền chính thức. Website công bố mã SHA-256 của từng bộ cài và cảnh báo về bản giả. |
| Tấn công qua giao diện WebView | **Capabilities của Tauri 2:** cửa sổ `overlay` chỉ nhận sự kiện phụ đề và chỉ gọi được lệnh di chuyển và khóa của chính nó; cửa sổ `main` chỉ được cấp đúng các lệnh nó cần. **CSP chặt:** chỉ nạp tài nguyên đóng gói trong app, không `unsafe-eval`, không tải script từ bên ngoài. Link ngoài mở bằng trình duyệt của hệ thống. Tắt devtools ở bản phát hành. Mọi dữ liệu từ giao diện gửi xuống Rust đều được kiểm tra kiểu và phạm vi. |
| Thay tiến trình phụ, hoặc chèn thư viện giả | Trước khi chạy `asr-worker` hay `llama-server`, kiểm tra SHA-256 của file thực thi và của các thư viện ggml, theo một danh sách build sẵn vào app. Windows: tiến trình chính và `asr-worker` gọi `SetDefaultDllDirectories` để chỉ nạp DLL từ thư mục app và System32. macOS: hardened runtime có bật library validation, mọi file thực thi và `.dylib` ký cùng Team ID. |
| Lộ nội dung cuộc họp | Lịch sử chép lời được mã hóa bằng SQLCipher, khóa ngẫu nhiên lưu trong kho khóa của hệ điều hành. Log không bao giờ chứa nội dung chép lời. File xuất ra do người dùng chủ động tạo và tự quản lý. |
| Tấn công license server | Chỉ dùng HTTPS. Kiểm tra chữ ký webhook và xử lý idempotent (§6.8). Dùng prepared statement của D1, kiểm tra mọi input. Secret lưu bằng Wrangler secrets. Các endpoint `/admin/*` đặt sau Cloudflare Access. Ghi nhật ký mọi thay đổi license, cảnh báo khi có nhiều lần kiểm tra thất bại. |
| Lộ khóa ký token | Token có trường `kid`. App build sẵn 2 khóa công khai: khóa đang dùng và khóa dự phòng. Nếu khóa bị lộ, server chuyển sang khóa dự phòng, và bản cập nhật app kế tiếp mang theo một khóa dự phòng mới. |
| Rủi ro chuỗi cung ứng | Không khóa ký nào (ký mã, cập nhật, token, manifest) nằm trên máy dev. Bản phát hành được build và ký trong CI, từ tag đã commit, dùng secret của CI hoặc dịch vụ ký trên cloud. CI chạy `cargo audit`, `cargo deny`, `pnpm audit`, và bật Dependabot. llama.cpp và whisper.cpp được build trong CI từ tag đã khóa, có kiểm tra checksum. |

**Để Giai đoạn 2**, và chỉ làm khi thấy bị crack nhiều thật: chống debug, làm rối code sâu hơn, kiểm tra toàn vẹn nhiều lớp, phát hiện gian lận phía server bằng phân tích hành vi.

## 11. Kiểm thử

- **Unit test (`cargo test`):**
  - Resample và gộp kênh; trộn hai thiết bị Windows có lệch đồng hồ.
  - Chèn im lặng khi luồng loopback không trả gói dữ liệu (§6.1).
  - Cắt câu với tín hiệu tổng hợp: im lặng, tiếng nói, nhạc, đoạn bị cắt ở 8 giây.
  - Ghép câu tạm: cửa sổ ghép theo `vadEndSilenceMs`, trần 15 giây hoặc 3 đoạn.
  - Chọn ngôn ngữ trong tập cho phép, và cơ chế giữ ngôn ngữ đoạn trước.
  - Giao thức stdin/stdout với `asr-worker`: đóng gói, giải mã, thông điệp hỏng hoặc bị cắt.
  - Tạo prompt: nhánh tiếng Trung và không tiếng Trung, tên ngôn ngữ của từng mẫu; khớp thuật ngữ tiếng Việt có dấu và chữ Trung, Nhật, Hàn.
  - Hậu xử lý bản dịch khi đang stream: lọc nhãn và ngoặc kép, ngưỡng tỉ lệ token theo cặp ngôn ngữ, thử lại với tham số khác.
  - Các trạng thái của phụ đề, kể cả `same_lang`, `skipped` và `dropped`.
  - Bộ đếm quota và reset theo ngày; đổi múi giờ qua lại không reset được; mất bản ghi quota thì coi như hết quota trong ngày.
  - Trạng thái bản quyền: ân hạn, thu hồi, tự làm mới token khi app chạy liên tục quá 24 giờ.
  - Manifest và SHA-256.
- **Test giao diện (`vitest`):** i18n đủ khóa cả vi lẫn en; hiển thị thanh phụ đề; các hàm xuất file.
- **License server:**
  - Unit test: tính và kiểm tra chữ ký HMAC-SHA256 với dữ liệu mẫu của PayOS; webhook idempotent; chỉ cấp license khi `PAID` và `amountPaid` ≥ `amount`; tính ngày gia hạn (từ max(hôm nay, ngày hết hạn)); giới hạn 2 máy, kích hoạt lại cùng máy không tốn suất, gỡ từ xa khi đã đủ máy; `recover` luôn trả `200`; ký và kiểm tra token Ed25519.
  - Test tích hợp với PayOS trên môi trường test nếu có; nếu không có thì dùng giao dịch với số tiền nhỏ.
- **Test tích hợp:**
  - Chạy pipeline từ file WAV (không cần thu âm thật), kiểm tra phụ đề có xuất hiện, đúng thứ tự, đúng thời gian.
  - Vòng đời hai tiến trình phụ: khởi động đúng thứ tự (`asr-worker` trước `llama-server`), giả lập crash, tự khởi động lại, gửi lại đoạn đang xử lý, chuyển sang CPU sau 2 lần crash khi dùng GPU, tắt sau 10 phút không dịch.
- **Benchmark (`bench/`):** đo chất lượng (COMET, chrF++) và độ trễ từng bước cho mỗi gói model. Chạy trước mỗi lần đổi model hoặc engine. Ngưỡng theo A2–A4. Kết quả gốc nằm ở `bench/2026-09-29-mt-benchmark/`.
- **Test thủ công theo ma trận:**
  - Hệ điều hành: macOS 14.2+, 15, 26, 27; Windows 10, 11.
  - App họp: Teams, Zoom, Meet (Chrome, Edge, Safari), Zalo PC.
  - Thiết bị phát: loa, tai nghe có dây, tai nghe Bluetooth.
  - Hiển thị: app họp ở chế độ toàn màn hình, và máy có nhiều màn hình.
  - Máy Windows không có Vulkan, ví dụ máy ảo: app vẫn mở được, dùng `asr-worker-cpu`, và `llama-server` chạy bằng CPU (§6.4).
  - Card rời 4 GB và 6 GB: app đề xuất đúng gói. Chọn gói Chuẩn trên card 4 GB thì `llama-server` tự chuyển bớt lớp sang CPU, không lỗi hết bộ nhớ.
  - Khoảng lặng dài trên Windows (tạm dừng video, không ai nói): câu cuối vẫn được chốt, thời gian phụ đề không lệch.
  - Khay (§4.3): bấm X thì cửa sổ chính ẩn, phiên dịch đang chạy không dừng. Chọn Thoát trong menu khay thì app thoát, không còn tiến trình phụ nào chạy. Trên Mac, `⌘Q` và Quit ở Dock không thoát app. Tắt máy hoặc đăng xuất khi app đang chạy thì không bị app chặn. Lần đầu mở trên Windows, nút ở bước 8 (§4.1) mở đúng trang cài đặt Taskbar.
- **Soak test:** phát liên tục 2 giờ âm thanh cuộc họp, theo dõi RAM, CPU và GPU (tiêu chí A5).
- **Cài đặt và cập nhật:** cài mới, nâng cấp từ bản trước, gỡ app (Windows: tick "xóa dữ liệu app" thì model bị xóa; macOS: nút "Xóa model và dữ liệu", A6); kiểm tra chữ ký qua Gatekeeper và SmartScreen.
- **Bảo mật (§10.2):**
  - Sửa một byte trong file thực thi, hoặc ký lại bằng chứng thư khác: app chỉ chạy chế độ Free và báo "Bản cài không chính hãng".
  - Các token sau đều bị từ chối: sai chữ ký, của máy khác, đã quá `refresh_before` hoặc `expires_at`, có `kid` lạ.
  - Chỉnh lùi đồng hồ máy: app phát hiện, không reset quota, yêu cầu kiểm tra online.
  - Gỡ rồi kích hoạt lại quá ngưỡng: key bị khóa tạm.
  - Cửa sổ `overlay` gọi một lệnh không được cấp, ví dụ lệnh bản quyền: Tauri chặn lại.
  - Thay `asr-worker` hoặc `llama-server` bằng một file khác: app từ chối chạy.
  - Mở file lịch sử bằng công cụ SQLite bên ngoài: không đọc được nếu không có khóa.
  - Log của một phiên dịch không chứa nội dung chép lời.
  - License server: vượt giới hạn request thì trả `429`; input độc hại (ví dụ SQL injection) bị từ chối; webhook sai chữ ký bị từ chối.
  - CI: `cargo audit`, `cargo deny` và `pnpm audit` không còn lỗ hổng mức cao.

## 12. Cấu trúc repo

```
meeting-translator/
├── Cargo.toml                    # Cargo workspace: src-tauri và crates/*
├── src/                          # Giao diện: React + TypeScript
│   ├── windows/main/             # Cửa sổ chính (các màn hình ở §4.3)
│   ├── windows/overlay/          # Thanh phụ đề
│   ├── components/  store/  lib/ipc.ts
│   └── i18n/                     # Từ điển en (chuẩn) + vi
├── src-tauri/                    # Tiến trình chính, không link ggml
│   ├── src/
│   │   ├── main.rs
│   │   ├── audio/{mod,windows,macos,resample}.rs
│   │   ├── pipeline/{vad,segmenter,asr,translate,prompt,postprocess,subtitle}.rs  # asr.rs: client của asr-worker
│   │   ├── sidecar/{asr,llama}.rs  # Chạy và giám sát asr-worker, llama-server
│   │   ├── models/{manifest,download,store}.rs
│   │   ├── license/{provider,state,quota}.rs
│   │   ├── security/{integrity,clock,keystore}.rs  # Tự kiểm chữ ký, chống lùi giờ, kho khóa (§10.2)
│   │   ├── transcript/{store,export}.rs
│   │   ├── overlay/{macos,windows}.rs  # Hành vi cửa sổ native
│   │   ├── db.rs  glossary.rs     # SQLite mã hóa: lịch sử và từ điển thuật ngữ (§6.6)
│   │   └── settings.rs  tray.rs  hotkeys.rs  i18n.rs
│   ├── capabilities/{main,overlay}.json  # Quyền của từng cửa sổ (§10.2)
│   ├── binaries/                 # asr-worker và llama-server theo target triple (§6.11)
│   └── tauri.conf.json
├── crates/
│   ├── asr-worker/               # Tiến trình phụ nhận dạng giọng nói: whisper-rs, link tĩnh whisper.cpp (§6.4)
│   └── asr-protocol/             # Kiểu thông điệp stdin/stdout, dùng chung cho app và asr-worker
├── server/                       # License server: Cloudflare Worker (TypeScript, Hono) + D1
│   └── src/
│       ├── {checkout,orders,licenses,token,reconcile,admin}.ts
│       └── payment/{provider,payos}.ts  # Interface PaymentProvider và cài đặt PayOS (§6.8)
├── bench/                        # Đánh giá chất lượng và độ trễ
│   └── 2026-09-29-mt-benchmark/  # Kết quả gốc của lần chọn model
├── tests/fixtures/audio/         # Clip âm thanh mẫu cho A4
└── docs/superpowers/specs/
```

## 13. Lộ trình

**Giai đoạn 0: spike, bắt buộc làm trước MVP**

| # | Việc cần làm |
|---|---|
| S1 | Dùng Core Audio tap trên macOS để thu âm thanh Zoom, Meet và Teams |
| S2 | Dùng loopback trên Windows để thu âm thanh Teams, Zoom và Meet, kể cả thiết bị Communications và tai nghe Bluetooth; chèn im lặng khi loopback không trả gói dữ liệu (§6.1) |
| S3 | Chạy `asr-worker` (whisper-rs) như tiến trình phụ, giao tiếp qua stdin/stdout. Chạy VAD và cơ chế chọn ngôn ngữ; đo và giảm chi phí nhận diện ngôn ngữ (§6.4). Chốt cách chạy Silero (§6.3). Kiểm tra hai bản `asr-worker` Vulkan/CPU và chế độ `--probe` trên Windows. Đo dung lượng bộ cài (§6.11). |
| S4 | Chạy `llama-server` với Hy-MT2 qua `/v1/chat/completions` ở chế độ stream; kiểm tra chat template |
| S5 | Cho thanh phụ đề nổi trên app đang toàn màn hình, trên cả Mac (NSPanel, §4.4) và Windows |
| S6 | Đo độ trễ tổng thể, RAM và VRAM cho cả hai gói model, trên các máy tham chiếu: Mac M1 cơ bản 16 GB, một Mac chip cơ bản đời mới (M4 hoặc M5), laptop Windows card rời 6 GB, laptop Windows card rời 4 GB, và máy Windows 8 GB chỉ có CPU |
| S7 | Chấm COMET của Q8_0 và Q4_K_M qua `llama-server` cho bốn chiều Anh/Trung/Nhật/Hàn→Việt, để lấy mốc cho A3 (dựng thêm ba chiều Trung/Nhật/Hàn→Việt từ WMT24++). Lấy ngưỡng tỉ lệ token cho hậu xử lý (§6.5). Dựng bộ clip và đo mốc WER/CER cho A4. Benchmark whisper turbo so với small, đo WER khi rút ngắn `audio_ctx`, và thử cờ ngữ cảnh câu trước. |

**Tiêu chí qua spike:** S1–S5 chạy được; S6 đạt **p50 ≤ 2,0 giây** trên máy khuyến nghị (đo cả trên máy M1 cơ bản 16 GB) và p50 ≤ 3,5 giây trên máy tối thiểu; mốc COMET ở S7 đạt mức sàn của A3. Nếu M1 cơ bản không đạt thì chọn một trong hai phương án ở §8. Nếu cả máy mạnh hơn cũng không đạt thì quay lại sửa spec.

**Giai đoạn 1: MVP.** Làm F1–F10, license server và tích hợp PayOS (§6.8), đạt A1–A7.

**Giai đoạn 2: mở rộng**, thứ tự tùy phản hồi của người dùng:
- Phân biệt ai đang nói.
- Hỗ trợ Windows ARM64.
- Thu âm thanh theo từng app trên Windows.
- Dịch hai chiều bằng giọng nói (micro ảo).
- Tóm tắt và biên bản cuộc họp (cần thêm một LLM).
- **Bán ra nước ngoài:** thêm một cổng thanh toán quốc tế, kiểu merchant of record để cổng đó lo thuế ở các nước (có thể cân nhắc Polar). Có giá bằng USD và thuê bao tự gia hạn. Trong app, khách ở Việt Nam thấy mã VietQR; khách nước ngoài được mở trang thanh toán của cổng quốc tế.
- Gói cho doanh nghiệp: nhiều máy, cài đặt tập trung.
- Thêm ngôn ngữ giao diện.

## 14. Giả định cần kiểm chứng trong spike

1. Core Audio process tap thu được âm thanh của Zoom, Meet và Teams trên macOS 14.2+. Quyền `NSAudioCaptureUsageDescription` hoạt động với app đã ký nhưng không chạy sandbox. (S1)
2. Endpoint loopback thu được Teams trên Windows 10/11, kể cả khi Teams phát tiếng qua thiết bị Communications. (S2)
3. File GGUF của Hy-MT2 có chat template dùng được với `/v1/chat/completions`. (S4)
4. Whisper large-v3-turbo chạy kịp thời gian thực trên máy M1 16 GB và trên laptop Windows có card rời 6 GB dùng Vulkan. Đo thêm trên card rời 4 GB và laptop chỉ có GPU tích hợp, để quyết định có nới điều kiện đề xuất gói Chuẩn ở §6.7 không. (S6)
5. Độ trễ tổng thể đạt ngân sách ở §8. (S6)
6. Bản Q4_K_M của Hy-MT2 giảm COMET không quá 0,02 so với Q8_0. (S7)
7. PayOS (kiểm tra trước khi làm §6.8):
   - Đăng ký được với loại hình kinh doanh của PHONG.
   - Webhook và cách ký HMAC-SHA256 đúng như tài liệu.
   - Có môi trường test; nếu không có thì test bằng giao dịch nhỏ.
   - Mô tả đơn cần ngắn (với một số ngân hàng tối đa 9 ký tự), nên dùng mã dạng `MT` cộng số đơn.
8. Rút ngắn `audio_ctx` không làm WER tăng quá 10% so với cửa sổ 30 giây đầy đủ. (S7)
9. Chi phí nhận diện ngôn ngữ giữ được dưới 20% thời gian nhận dạng của đoạn (§6.4). (S3)
10. Truyền âm thanh qua stdin/stdout sang `asr-worker` thêm không quá 10 ms mỗi đoạn. (S3)

## 15. Việc còn mở (không chặn phần kỹ thuật)

- **Tên sản phẩm, logo, tên miền, bundle identifier.** Trong code tạm dùng `meeting-translator`, sau đổi bằng cấu hình.
- **Chốt P1:** giá gói Pro 1 tháng và 12 tháng (VND), có bán gói trọn đời không, và hạn mức Free (đề xuất 30 phút/ngày).
- **PayOS:** đăng ký tài khoản (doanh nghiệp, hộ kinh doanh hoặc cá nhân) và liên kết tài khoản ngân hàng nhận tiền.
- **Hóa đơn điện tử và thuế** khi bán phần mềm cho khách ở Việt Nam: cần hỏi kế toán. PayOS có trường thông tin người mua và API hóa đơn để tích hợp.
- **Pháp lý:** hỏi luật sư về hồ sơ chuyển dữ liệu cá nhân ra nước ngoài (§10.1), và thủ tục thông báo website bán hàng với Bộ Công Thương.
- **Thanh toán quốc tế:** PayOS chỉ nhận chuyển khoản từ ngân hàng Việt Nam, nên MVP chỉ bán cho khách ở Việt Nam. Muốn bán ra nước ngoài thì chọn thêm một nhà cung cấp sau MVP (có thể cân nhắc Polar).
- **Dịch vụ gửi email** chứa license key.
- **Tài khoản Cloudflare riêng** cho license server.
- **Giấy tờ cho phát hành:** mua chứng thư ký mã OV cho Windows, loại ký trên cloud (§6.11); tài khoản Apple Developer (99 USD/năm).
- **Website:** trang tải app, trang giá, chính sách quyền riêng tư và điều khoản sử dụng. Phần này sẽ có spec riêng.
