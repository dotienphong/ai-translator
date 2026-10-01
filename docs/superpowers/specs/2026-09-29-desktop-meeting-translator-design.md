# AI Translator: app desktop dịch phụ đề cuộc họp offline — Design

**Ngày:** 2026-09-29
**Trạng thái:**
- Đã duyệt ngày 2026-09-29. Kế hoạch nằm ở `docs/superpowers/plans/`.
- Sửa ngày 2026-10-01 theo quyết định của chủ dự án: chốt tên, bốn gói và hạn mức, cách lưu dữ liệu. Cùng đợt, spec nhận các điểm lệch nhỏ đã chốt ở kế hoạch Giai đoạn 1 · 01, 02 và 05.
- Các chi tiết hạn mức do controller tự quyết (§6.8, "Hạn mức") còn chờ chủ dự án xem (Q16 của kế hoạch Giai đoạn 1 · 00).
**Phạm vi:** Sản phẩm mới, repo mới `meeting-translator/`, gồm app desktop cho Windows và macOS, cùng một license server nhỏ để nhận thanh toán qua PayOS. Sản phẩm **tách hẳn** khỏi AI Live Translator: thương hiệu, repo, người dùng và thanh toán đều riêng. Vì cùng chủ sở hữu nên được tham khảo cách làm bên đó, nhưng không dùng chung code hay hạ tầng. App Android không thuộc spec này.
**Tên và định danh** (D13):
- Tên sản phẩm: **AI Translator**. Logo và tên miền chưa có (§15).
- Bundle identifier: **`com.aitranslator.desktop`**, thay cho `dev.meetingtranslator.spike` của spike. Thư mục dữ liệu, thư mục log và "service" của kho khóa đều lấy theo identifier này (§6.7, §10.2), nên không đổi sau khi đã có người dùng.
- **Giữ tên cũ ở những chỗ người dùng không thấy:** thư mục repo `meeting-translator/`, tên crate (`meeting-translator`, `meeting_translator_lib`, `asr-worker`, `asr-protocol`, `pipeline`…), tên binary do cargo build ra, và tên Worker của license server (`mt-license-<env>`). Chỉ tên hiển thị (`productName`) và bundle identifier đổi.

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
  - Trên 30 câu thử, bản 8-bit (Q8_0) của Hy-MT2 thấp hơn bản gốc 0,006 COMET. S7 đã chấm Q8_0 trên đủ bộ test; mốc ở §3.3.
  - Benchmark chưa có các chiều Trung→Việt, Nhật→Việt và Hàn→Việt, trong khi đây là các chiều chính của người dùng Việt (F2). S7 đã bổ sung ba chiều này (§3.3).
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
| D13 | Tên và định danh | **AI Translator**, bundle identifier `com.aitranslator.desktop`. Tên miền mua sau. Repo, crate và binary giữ tên `meeting-translator` (đầu spec). |
| P1 | Kiếm tiền | **Không có quảng cáo.** Bốn gói, xem bảng dưới. Ba gói trả phí có chung các tính năng Pro (từ điển thuật ngữ, lưu lịch sử, xuất bản chép lời), chỉ khác hạn mức dịch. Gói trả phí bán theo **đơn 30 ngày, trả trước** bằng VND, không tự gia hạn, vì PayOS không có thanh toán định kỳ. Không có gói 12 tháng hay gói trọn đời. Hạn mức tính riêng cho từng máy (§6.8). "Chỉ bán đơn 30 ngày" và "tính năng Pro dùng chung cho mọi gói trả phí" là controller tự quyết; chủ dự án có thể đổi. |
| P2 | Bản quyền | License key do **license server riêng** của sản phẩm cấp, sau khi PayOS xác nhận đã nhận tiền. Mỗi key kích hoạt tối đa 2 máy, và mỗi máy có đủ hạn mức của gói. Dùng được offline nhờ token có ký số (ân hạn 14 ngày). Không có tài khoản đăng nhập. Chi tiết ở §6.8. |

P1 và P2 là đề xuất lúc duyệt spec; chủ dự án chốt ngày 2026-10-01. Giữ mã P1, P2 để tham chiếu trong các kế hoạch không đổi.

**Các gói (P1):**

| Mã gói | Tên hiển thị | Hạn mức dịch, mỗi máy | Giá |
|---|---|---|---|
| `free` | Free | 10 phút mỗi ngày | 0 |
| `pro` | Professional | 30 giờ mỗi chu kỳ 30 ngày | 50.000 đ / 30 ngày |
| `pro_x2` | Professional X2 | 100 giờ mỗi chu kỳ 30 ngày | 150.000 đ / 30 ngày |
| `pro_x5` | Professional X5 | không giới hạn | 500.000 đ / 30 ngày |

- Server đọc giá và hạn mức của gói trả phí từ cấu hình (§6.8); app không ghi cứng giá. Hạn mức Free là một hằng số phía app.
- **"Pro"** trong spec là tên chung của các tính năng chỉ có ở gói trả phí, và của trạng thái "đang có gói trả phí còn hạn". Đây không phải tên một gói. Mã gói `pro` là gói Professional.
- Cách đếm phút, chu kỳ 30 ngày và khi hết hạn mức: §6.8, mục "Hạn mức".

## 3. Mục tiêu, phạm vi, tiêu chí thành công

### 3.1 Tính năng MVP

| # | Tính năng |
|---|---|
| F1 | Phụ đề dịch trực tiếp từ âm thanh hệ thống |
| F2 | Người dùng chọn ngôn ngữ đích, là một trong năm ngôn ngữ: English, 中文, 日本語, 한국어, Tiếng Việt. Ngôn ngữ nguồn được **tự nhận diện trong tập ngôn ngữ người dùng chọn** (mặc định: cả năm ngôn ngữ trên), hoặc khóa cố định một ngôn ngữ. Câu nào đã là ngôn ngữ đích thì hiện câu gốc, không dịch. |
| F3 | Thanh phụ đề nổi, mô tả ở §4.4 |
| F4 | Bản chép lời của phiên: xem, tìm, sao chép. Xuất ra TXT, SRT, Markdown và lưu lịch sử là tính năng Pro, chỉ có ở gói trả phí (§2); lưu lịch sử mặc định tắt. |
| F5 | Từ điển thuật ngữ (tính năng Pro, chỉ có ở gói trả phí), tối đa 500 cặp. Chỉ những thuật ngữ **có xuất hiện trong câu** mới được đưa vào prompt. |
| F6 | Quản lý model: có gói Chuẩn và gói Nhẹ, tự đề xuất gói theo cấu hình máy, tải tiếp được khi rớt mạng, kiểm tra SHA-256 |
| F7 | Giao diện tiếng Việt và English |
| F8 | Phân quyền theo gói (Free và ba gói trả phí, §2) bằng license key, dùng được khi offline. Hạn mức dịch theo gói, đếm riêng trên từng máy (§6.8). |
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
| A3 | **Chất lượng dịch**, chấm trên văn bản (không qua bước nhận dạng giọng nói), chạy qua đúng `llama-server` và prompt của app. Bộ test gồm bộ của benchmark 2026-09-29, cộng thêm ba chiều Trung→Việt, Nhật→Việt, Hàn→Việt, mỗi chiều 100 câu, dựng từ WMT24++ giống các chiều đã có. **Mốc:** COMET của Q8_0 (gói Chuẩn) và Q4_K_M (gói Nhẹ), chấm ở S7, ghi ở bảng dưới. **Mức sàn** cho Anh→Việt: gói Chuẩn ≥ 0,83, gói Nhẹ ≥ 0,80; nếu không đạt thì xem lại D5 trước khi làm MVP. Ba chiều Trung/Nhật/Hàn→Việt chưa có mức sàn; chiều nào thấp hơn Anh→Việt quá 0,05 thì xem lại D5 cho chiều đó. **Chống thụt lùi:** sau mỗi lần đổi model, engine hay prompt, COMET của từng chiều không được thấp hơn mốc quá 0,01. |
| A4 | **Chất lượng nhận dạng giọng nói**, đo trên bộ clip mẫu dựng ở Giai đoạn 0 (S7). Mỗi ngôn ngữ nguồn mặc định có ít nhất 15 phút âm thanh, kèm bản chép chuẩn đã được người kiểm lại, và có cả âm thanh thu qua tai nghe Bluetooth (băng hẹp). Chỉ dùng clip có quyền sử dụng: tự thu, hoặc bộ dữ liệu mở như FLEURS và AMI (CC BY 4.0). Tiếng Anh và tiếng Việt đo WER; tiếng Trung, Nhật, Hàn đo CER theo thông lệ cho các ngôn ngữ này. Lấy mốc cho cả gói Chuẩn và gói Nhẹ; mốc đo ở S7 ghi ở bảng dưới. Sau mỗi lần đổi model hay engine, WER/CER không được xấu hơn mốc quá 10% (tương đối). |
| A5 | **Ổn định:** một phiên dịch liên tục 2 giờ không crash. RAM sau giờ đầu không tăng quá 10%. |
| A6 | **Cài đặt:** bộ cài ký số hợp lệ. Bản macOS đã notarize, mở không bị Gatekeeper chặn. **Gỡ app sạch, người dùng chọn giữ hay xóa model:** trên Windows, bộ gỡ cài đặt có ô "xóa dữ liệu app", xóa được cả model (§6.7). Trên macOS, gỡ app chỉ là kéo vào Thùng rác, không có bước nào để hỏi; vì vậy trong app có nút "Xóa model và dữ liệu" (§4.3), và trang hỗ trợ hướng dẫn bấm nút này trước khi gỡ. |
| A7 | **Quyền riêng tư:** kiểm tra qua proxy mạng, trong lúc dịch không có request mạng nào, trừ các việc chạy theo lịch: kiểm tra bản quyền, kiểm tra cập nhật app và manifest model. Không request nào chứa âm thanh hay nội dung chép lời. |

**Mốc đo ở Giai đoạn 0** (Mac M4 Pro, 2026-09-30; số liệu gốc ở `bench/phase0/results/`):

- **A3** (`s7_mt_decisions.md`): COMET của lượt không có ngữ cảnh, qua `llama-server` b11146 và prompt của app. Anh/Trung/Nhật/Hàn→Việt và Việt→Anh mỗi chiều 100 câu; Việt→Trung/Nhật/Hàn mỗi chiều 40 câu.

  | Chiều | Gói Chuẩn (Q8_0) | Gói Nhẹ (Q4_K_M) |
  |---|---|---|
  | Anh→Việt | 0,842 | 0,841 |
  | Trung→Việt | 0,829 | 0,831 |
  | Nhật→Việt | 0,830 | 0,815 |
  | Hàn→Việt | 0,834 | 0,822 |
  | Việt→Anh | 0,821 | 0,822 |
  | Việt→Trung | 0,836 | 0,821 |
  | Việt→Nhật | 0,847 | 0,845 |
  | Việt→Hàn | 0,851 | 0,842 |

  - Anh→Việt đạt mức sàn ở cả hai gói, nên không cần xem lại D5. Gói Chuẩn chỉ dư 0,012 so với sàn 0,83.
  - Không chiều Trung/Nhật/Hàn→Việt nào thấp hơn Anh→Việt quá 0,05. Chênh nhiều nhất là Nhật→Việt của gói Nhẹ, thấp hơn 0,026.
  - 100 câu mới của mỗi chiều Trung/Nhật/Hàn→Việt thiên về văn nói đời thường (social 76, literary 16, news 6, speech 2), nên chỉ đại diện gần đúng cho lời nói trong cuộc họp.
- **A4** (`a4_m4pro-turbo-final.json`, `a4_m4pro-small-final.json`): đo với cấu hình chốt ở §6.4. Bộ clip lấy từ tập dev của FLEURS, khoảng 15 phút mỗi ngôn ngữ: 437 clip băng rộng, cộng 111 bản băng hẹp mô phỏng tai nghe Bluetooth ở chế độ đàm thoại (HFP). Bảng dưới là nhóm băng rộng.

  | Ngôn ngữ | Chỉ số | Gói Chuẩn (turbo) | Gói Nhẹ (small) |
  |---|---|---|---|
  | en | WER | 0,054 | 0,066 |
  | vi | WER | 0,087 | 0,225 |
  | zh | CER | 0,056 | 0,096 |
  | ja | CER | 0,045 | 0,131 |
  | ko | CER | 0,041 | 0,082 |

  - Cả hai model nhận đúng ngôn ngữ ở mọi clip.
  - Băng hẹp làm lỗi tăng ở hầu hết ô, rõ nhất ở en và ja (`s7_asr.md`).
  - Chưa đủ điều kiện của A4, phải làm trước khi coi mốc là chính thức: thu clip thật qua tai nghe Bluetooth, và người nghe lại 24 clip có chú thích Latin trong bản chép chuẩn (zh 16, ja 3, ko 5). Mốc trong `s7_asr.md` là cấu hình cũ, không sàn; mốc hiện hành là các file `-final.json`.

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

1. Người dùng bấm **Bắt đầu**, qua nút, phím tắt hoặc menu khay. Thanh phụ đề (ẩn lúc mở app, §4.4) hiện ra, kèm chỉ báo "đang nghe" (mức âm lượng) và chỉ báo độ trễ. Nếu hai tiến trình phụ chưa chạy (§5), thanh phụ đề hiện "Đang nạp model…" trong vài giây đầu.
2. **Hạn mức** (§6.8), với các gói có hạn mức (Free, Professional, Professional X2):
   - Khi còn 5 phút thì nhắc.
   - Hết hạn mức thì dừng phiên, với lý do `quota_exhausted`. Thanh phụ đề và cửa sổ chính báo đã hết hạn mức, ghi thời điểm hạn mức được reset, kèm nút nâng gói. Thời điểm reset hiển thị:
     - Free: max(00:00 hôm sau, lần reset trước + 20 giờ) (§6.8);
     - gói trả phí: mốc đầu chu kỳ kế tiếp, kèm ghi chú cần có mạng để mở hạn mức mới. Nếu `expires_at` đến trước mốc đó thì báo ngày hết hạn của gói thay cho thời điểm reset.
   - Hạn mức còn 0 thì không bắt đầu được phiên mới.
   - App không chạy tiếp ở chế độ "chỉ chép lời".
   - Professional X5 không giới hạn.
3. Người dùng bấm **Dừng** để kết thúc phiên. Thanh phụ đề giữ nguyên các dòng cuối để người dùng đọc nốt. Sau đó người dùng có thể mở bản chép lời của phiên.

### 4.3 Các màn hình

- **Màn hình chính:**
  - Trạng thái: Sẵn sàng, Đang dịch hoặc Lỗi.
  - Nút Bắt đầu/Dừng.
  - Ngôn ngữ đích và tập ngôn ngữ nguồn.
  - Nguồn âm thanh: trên Windows là thiết bị phát; trên macOS là toàn hệ thống hoặc một app cụ thể.
  - Mức âm lượng vào.
  - Hạn mức còn lại: số phút còn lại hôm nay (Free) hoặc trong chu kỳ (Professional, Professional X2), kèm thời điểm reset. Professional X5 ghi "Không giới hạn".
- **Bản chép lời:** mỗi câu gồm giờ, câu gốc và bản dịch. Có tìm kiếm, sao chép, xuất file (Pro).
- **Lịch sử (Pro):** danh sách các phiên đã lưu, xóa từng phiên hoặc xóa tất cả.
- **Từ điển thuật ngữ (Pro):** thêm, sửa, xóa; nhập và xuất CSV.
- **Cài đặt:**
  - **Chung:** ngôn ngữ giao diện, khởi động cùng hệ thống, giao diện sáng/tối, kênh cập nhật (stable hoặc beta).
  - **Phụ đề:** cỡ chữ, số dòng, độ mờ nền, có hiện câu gốc hay không.
  - **Âm thanh:** nguồn âm thanh, độ nhạy ngắt câu.
  - **Model:** gói đang dùng, dung lượng, tải lại hoặc xóa.
  - **Phím tắt.**
  - **Bản quyền:** nhập key; gói đang dùng, trạng thái và ngày hết hạn; hạn mức còn lại của chu kỳ; gia hạn hoặc đổi gói (mở màn hình Nâng cấp); gỡ kích hoạt.
  - **Quyền riêng tư:**
    - Bật/tắt lưu lịch sử.
    - Nút xóa toàn bộ dữ liệu: xóa lịch sử và từ điển thuật ngữ.
    - Nút "Xóa model và dữ liệu": xóa thêm cả model, dùng trước khi gỡ app trên macOS (A6).
    - Cả hai nút đều giữ lại trạng thái bản quyền và bộ đếm hạn mức (§6.8).
- **Nâng cấp** (mở từ nút nâng gói, từ nhóm Cài đặt "Bản quyền", hoặc khi hết hạn mức):
  - Hiện đủ 4 gói (§2): tên, hạn mức, giá mỗi 30 ngày; đánh dấu gói đang dùng. Giá lấy từ license server (`GET /v1/plans`, §6.8); không có mạng thì báo cần mạng để mua.
  - Người dùng chọn một gói trả phí, nhập email, tick ô đồng ý xử lý email (§10.1), rồi quét mã VietQR hiện ngay trong app (§6.8).
  - Đang có license còn hạn: chọn cùng gói là gia hạn thêm 30 ngày; chọn gói khác là đổi gói. Khi đổi gói, app hiện trước số ngày quy đổi và ngày hết hạn mới (§6.8, "Mua thêm và đổi gói"), và ghi rõ không hoàn tiền.
  - Ghi rõ MVP chỉ nhận chuyển khoản từ ngân hàng Việt Nam (§6.8).
- **Giới thiệu và giấy phép mã nguồn mở.**
- **Đóng cửa sổ chính:**
  - Bấm X (kể cả `Alt+F4` trên Windows, `⌘W` trên Mac) chỉ ẩn cửa sổ xuống khay. App vẫn chạy; phím tắt và phiên dịch đang chạy vẫn hoạt động.
  - Muốn thoát hẳn thì chọn **Thoát** trong menu khay: app dừng phiên dịch nếu đang chạy (như khi bấm Dừng), tắt hai tiến trình phụ (§5), rồi mới thoát.
  - Trên Mac, `⌘Q`, mục Quit trong menu app và mục Quit ở Dock cũng không thoát app: lệnh thoát bị hủy, rồi app hiện cửa sổ chính kèm lời nhắc "chọn Thoát ở biểu tượng trên menu bar". Lời nhắc hiện trong app, không dùng thông báo hệ thống. Force Quit của macOS vẫn thoát được.
  - Ngoại lệ: không chặn thoát khi máy tắt, khởi động lại, đăng xuất, và khi app tự khởi động lại để cập nhật (§6.11). Nếu chặn, hệ điều hành báo app đang cản tắt máy.

### 4.4 Thanh phụ đề

- **Kiểu cửa sổ:** cửa sổ riêng, không viền, nền mờ bán trong suốt, **luôn nổi trên cùng**. Không hiện trên taskbar của Windows, và không lấy focus của app họp.
- **Ẩn lúc mở app**, kể cả khi app khởi động cùng hệ thống. Bắt đầu phiên thì hiện; dừng phiên thì giữ nguyên. Người dùng vẫn ẩn/hiện bằng tay được, qua nút, phím tắt hoặc menu khay.
- **Nội dung:**
  - Hiện 1–3 dòng bản dịch gần nhất; tùy chọn hiện câu gốc chữ nhỏ ở phía trên.
  - **Bản dịch hiện dần từng chữ** trong lúc model đang dịch.
  - **Phụ đề tạm:** câu chưa chốt hiện màu nhạt hơn. Nếu người nói nói tiếp ngay (§6.3), phụ đề tạm được thay bằng bản dịch của cả câu đã ghép.
- **Di chuyển và kích thước:** kéo để di chuyển, kéo cạnh để đổi kích thước. App nhớ vị trí riêng cho từng màn hình.
- **Chế độ khóa:** cho click xuyên qua thanh phụ đề, để không cản thao tác trên cửa sổ họp. Mở khóa bằng phím tắt hoặc menu khay. Thanh phụ đề không có nút khóa: khi đã khóa thì click đi xuyên qua, không bấm được gì trên thanh.
- **Nổi trên app họp đang toàn màn hình:**
  - macOS: dùng NSPanel kiểu non-activating, đặt window level cao, cho tham gia mọi Space với cờ `canJoinAllSpaces` và `fullScreenAuxiliary`. Chỉ đặt các cờ này trên một NSWindow thường thì thường chưa đủ để nổi trên Space toàn màn hình của app khác. Chờ kết quả S5 (kế hoạch 05, Task 3–4, `results/s5_overlay.md`).
  - Windows: đặt cửa sổ ở chế độ topmost.
- **Icon ở Dock (macOS):** khi app chỉ còn biểu tượng ở menu bar, app không có icon ở Dock (activation policy `accessory`). Khi mở cửa sổ chính, app hiện icon ở Dock (`regular`).
- **Chỉ báo nhỏ:** đang nghe, không có âm thanh, hoặc đang trễ.

### 4.5 Ngôn ngữ giao diện

- **Chuỗi giao diện:** lưu trong từ điển có kiểu. `en` là nguồn chuẩn cho danh sách khóa; kiểu `Record` bắt `vi` phải có đủ mọi khóa. Đây là cách AI Live Translator đang làm, đã quen tay.
- **Đổi ngôn ngữ ngay**, không cần khởi động lại app.
- **Chuỗi phía Rust** (menu khay, thông báo hệ thống, khoảng 20 chuỗi) nằm trong một bảng nhỏ riêng, có đủ cả vi và en.
- **Menu app trên Mac** (About, Edit, Window, Quit…) dùng chữ mặc định English của các mục có sẵn ở MVP. Chỉ menu khay theo ngôn ngữ giao diện.

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
- Chạy khi người dùng mở cửa sổ chính hoặc bấm Bắt đầu. Tắt sau 10 phút không dịch, để app nằm ở khay không giữ vài GB RAM (ước tính 4–6 GB; trên M4 Pro đo được khoảng 2,9 GiB cho hai tiến trình phụ của gói Chuẩn, §8).
- `asr-worker` chạy trước. `llama-server` chạy sau khi `asr-worker` đã nạp xong model, để `llama-server` thấy đúng VRAM còn trống (§6.5).
- Lần đầu phải chờ nạp model vài giây; thanh phụ đề hiện "Đang nạp model…". Thời gian này không tính vào độ trễ ở A2.
- **Việc cho MVP:** app chính build với `panic = "abort"` (§10.2), nên `Drop` không chạy khi app crash. Dùng Job Object (`KILL_ON_JOB_CLOSE`) trên Windows và process group trên macOS, để tiến trình phụ không bị bỏ lại.

**Thành phần nằm ngoài app:** một license server nhỏ làm việc với PayOS (chi tiết ở §6.8). App chỉ gọi server này khi mua, kích hoạt và kiểm tra bản quyền. Âm thanh và nội dung chép lời không bao giờ đi qua server.

```
App ──HTTPS──► License server (Cloudflare Worker + D1) ◄──webhook── PayOS ◄── khách quét VietQR
                      │ tạo link thanh toán ─────────────────────────► PayOS
                      └─ gửi email chứa license key
```

## 6. Thiết kế thành phần

### 6.1 Thu âm thanh

- **Interface chung:** `trait AudioSource { fn start(&mut self, sink: RingProducer) -> Result<()>; fn stop(&mut self); fn format(&self) -> AudioFormat; fn failed(&self) -> bool; }`. `failed()` báo luồng thu đã chết, ví dụ khi thiết bị bị rút.
- **Windows:** dùng WASAPI shared-mode **endpoint loopback**.
  - **Chế độ tự động:** thu loopback của thiết bị phát mặc định (vai trò *Console*) và của thiết bị mặc định cho liên lạc (vai trò *Communications*, nếu khác thiết bị trên), rồi trộn lại. App họp có thể phát tiếng qua thiết bị Communications, nhất là khi dùng tai nghe Bluetooth.
    - Mỗi thiết bị có một ring buffer riêng. Luồng tiền xử lý resample từng luồng về 16 kHz rồi mới trộn, và bù lệch đồng hồ giữa hai thiết bị bằng cách bỏ hoặc chèn mẫu.
  - **Khi không có âm thanh nào đang phát,** WASAPI loopback không trả gói dữ liệu nào, và sự kiện báo có dữ liệu cũng không được kích hoạt. Đây là hành vi chuẩn của Windows. Vì vậy:
    - Luồng thu đọc theo timer, không chờ sự kiện.
    - Luồng thu tự chèn im lặng vào khoảng trống, tính theo đồng hồ thật (vị trí QPC do `GetBuffer` trả về). Nhờ vậy VAD vẫn chốt được đoạn, thời gian của phụ đề không bị lệch, và vẫn phát hiện được lỗi "không có âm thanh" (§9).
  - Người dùng có thể chọn thủ công một thiết bị.
  - Tự khởi tạo lại khi thiết bị thay đổi: xem "Khi thiết bị phát đổi" bên dưới.
  - **Không dùng process loopback** trong MVP, vì đã có báo cáo cách này chỉ nhận được im lặng với Teams.
  - Hệ quả: app thu **mọi** âm thanh của máy, kể cả tiếng thông báo hay video đang mở.
  - Chờ kết quả S2 trên Windows (kế hoạch 04, Task 7–8, `results/s2_capture.md`): Teams, Zoom, Meet, thiết bị Communications, tai nghe Bluetooth, chèn im lặng.
- **macOS:** dùng Core Audio process tap (`AudioHardwareCreateProcessTap`, macOS 14.2+), đọc qua aggregate device.
  - **Mặc định:** tap toàn hệ thống, trừ chính app.
  - **Tùy chọn:** chỉ tap một app họp được chọn từ danh sách các app đang phát âm thanh.
  - Khai báo `NSAudioCaptureUsageDescription` trong Info.plist.
  - Gọi API qua `objc2` và `objc2-core-audio`; không dùng `coreaudio-sys`.
  - Chờ kết quả S1 (kế hoạch 04, Task 6, `results/s1_capture.md`).
- **Khi thiết bị phát đổi** (cắm tai nghe, kết nối Bluetooth), trên cả hai hệ điều hành:
  - App hỏi định kỳ mỗi 500 ms chữ ký của thiết bị phát mặc định (`audio_capture::default_output_signature`). Chữ ký đổi, hoặc luồng thu chết (`failed()`), thì mở lại nguồn, trong ≤ 2 giây (§9).
  - Không dùng `IMMNotificationClient` trên Windows hay listener của Core Audio trên macOS. Cách hỏi định kỳ cho cùng kết quả, mà không có callback chạy trên luồng của hệ thống (chốt ở kế hoạch Giai đoạn 1 · 02a, QĐ16).
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
  - Thêm 200 ms đệm ở đầu và cuối mỗi đoạn. Code làm tròn lên 7 khung, tức 224 ms mỗi phía; đầu phiên, cuối phiên và phía bị cắt cưỡng bức có ít hơn.
- **Ghép câu và phụ đề tạm:** ngưỡng 300 ms dễ cắt giữa câu, ở những chỗ người nói ngừng nghỉ tự nhiên.
  - Nếu đoạn vừa chốt không kết thúc bằng dấu câu kết thúc (`.` `?` `!` `。` `？` `！`), phụ đề được đánh dấu **tạm**.
  - **Cửa sổ ghép** = max(700 ms, `vadEndSilenceMs` + 400 ms), tính từ lúc hết tiếng nói của đoạn trước. Với mặc định 300 ms, cửa sổ là 700 ms.
  - Nếu tiếng nói tiếp tục trong cửa sổ ghép **và đoạn sau cùng ngôn ngữ với câu đang mở** (ngôn ngữ do §6.4 chọn), đoạn sau được ghép vào: nối chữ của hai đoạn, dịch lại cả câu, rồi thay phụ đề tạm. Tiếng Trung và tiếng Nhật nối chữ không có dấu cách.
  - Đoạn khác ngôn ngữ thì mở một câu mới. Đoạn đã là ngôn ngữ đích (`same_lang`, §6.6) cũng cắt chuỗi ghép; đoạn bị bỏ vì không có tiếng nói (§6.4) thì không.
  - Phụ đề được chốt khi có dấu câu kết thúc, hoặc khi hết cửa sổ ghép mà không có tiếng nói mới.
  - **Trần:** một câu ghép dài tối đa 15 giây tiếng nói (không tính đệm và khoảng nghỉ giữa các đoạn) hoặc 3 đoạn. Đạt trần thì chốt câu, đoạn sau bắt đầu một câu mới. Nhờ vậy câu không dài mãi, và mỗi lần dịch lại không chậm dần.
  - **Tiếng Trung và tiếng Nhật:** Whisper ít đặt dấu câu kết thúc cho hai tiếng này, nhất là gói Nhẹ (trên session S6, cấu hình chốt: zh 13/43 đoạn với turbo, 5/43 với small; ja 18/37 và 4/37; en 31–34/43). Vì vậy luật ghép nối cả những câu khác nhau, rõ nhất ở zh: khoảng 7/18 lần ghép ở gói Chuẩn, đo trước khi có sàn 512 (nguồn và ước lượng lại ở `bench/phase0/results/phase0_review_notes.md`).
    - Giữ luật hiện tại. Với zh, mô phỏng trên session S6 cho thấy số câu còn nguyên vẹn gần như nhau dù ghép hay không; với ja, ghép giữ nguyên vẹn nhiều câu hơn (ước lượng của review, `phase0_review_notes.md`).
    - So với tắt ghép, trên M4 Pro (4 session zh và ja, đo trước khi có sàn 512, máy chạy bằng pin): p50 tăng 36–140 ms, p90 tăng 74–356 ms (`m4pro-khuyennghi-*-nomerge-*.json`).
    - Mồi dấu câu cho zh và ja đã thử, nhưng không giúp ghép câu (§6.4).
- **Đầu ra:** `Segment { id, start_ms, end_ms, speech_ms, samples }`. Thời gian tính từ lúc bắt đầu phiên theo đồng hồ thật, không theo số mẫu đã nhận (§6.1).
  - `start_ms` và `end_ms` là lúc tiếng nói bắt đầu và kết thúc, **không gồm phần đệm**; `samples` có cả phần đệm.
  - `speech_ms` là độ dài tiếng nói của đoạn, không gồm phần đệm. Đoạn gộp ở hàng đợi (§7) có `speech_ms` bằng tổng của các đoạn con, không tính khoảng nghỉ ở giữa. Hạn mức tính phút bằng `speech_ms` (§6.8).
- **Cách chạy Silero (chốt ở S3):** Silero VAD v6.2.3 (`silero_vad.onnx`) chạy trong tiến trình chính bằng `candle-onnx`. Crate này thuần Rust, nên không cần thư viện ONNX Runtime, và tiến trình chính vẫn không chứa ggml (§5). VAD vẫn chạy khi `asr-worker` khởi động lại.
  - Không dùng `ort`, vì crate này chỉ có bản RC (§6.12). Bản `op18_ifless` của model không chạy được trên candle.
  - State của LSTM phải `detach()` sau mỗi khung. Nếu không, mỗi khung giữ thêm khoảng 0,5 MB: RSS tăng khoảng 1 GB mỗi phút, và việc hủy chuỗi đó làm tràn stack sau vài phút (đo lúc review, `phase0_review_notes.md`).
  - Bản debug cần khoảng 1 MiB stack cho mỗi lần suy luận, mà luồng chính của Windows chỉ có 1 MiB. Vì vậy VAD được tạo và chạy trên luồng riêng, có stack từ 4 MiB.
  - Test `vad_reference` so kết quả với onnxruntime, rồi chạy thêm 4 000 khung để bắt rò bộ nhớ (§6.12).
- **Việc cho MVP:** chọn luật ghép câu tốt hơn cho zh và ja, ví dụ coi khoảng nghỉ đủ dài là hết câu. Cần dữ liệu hội thoại thật, không phải câu đọc của FLEURS.

### 6.4 Nhận dạng giọng nói

- **Engine:** whisper.cpp qua `whisper-rs`, chạy trong **tiến trình phụ `asr-worker`**. Đây là một binary Rust nhỏ trong cùng workspace, link tĩnh whisper.cpp (§6.12). Dùng Metal trên macOS và Vulkan trên Windows; lỗi GPU thì tự chuyển sang CPU.
- **Giao tiếp với tiến trình chính:** qua stdin/stdout, không mở cổng mạng. Kiểu thông điệp nằm trong crate `asr-protocol`, dùng chung cho cả hai bên (§12). MVP dùng **giao thức bản 2** (`PROTOCOL_VERSION = 2`, chốt ở kế hoạch Giai đoạn 1 · 02a, Task 1); Giai đoạn 0 dùng bản 1, chưa có `protocol_version`, `prev_lang`, `Error.kind` và các enum.
  - **Khung:** 4 byte độ dài (`u32` little-endian), theo sau là thông điệp mã hóa bằng postcard. Mỗi khung dài tối đa 16 MiB (`MAX_FRAME_BYTES`).
  - **Thông điệp:** app gửi `Request`, worker trả `Response`. Mỗi yêu cầu có đúng một phản hồi, trừ `Shutdown`.
    - `Load {model_path, use_gpu, n_threads}` → `Ready {protocol_version, backend, decode_mode, whisper_version, system_info}`.
      - `protocol_version` là trường đầu, để app đọc được cả khi worker cũ hơn. App từ chối worker lệch phiên bản.
      - `backend` là enum `Metal`, `Vulkan` hoặc `Cpu`, và là **thiết bị thật** (đọc bảng thiết bị của ggml), để áp quy tắc chuyển sang CPU. Bản 1 chỉ trả backend được yêu cầu theo feature build và `use_gpu`.
      - `decode_mode` là enum `Shared` (chế độ B) hoặc `Split` (chế độ A), xem "Chế độ giải mã" bên dưới.
    - `Warmup` → `WarmupDone {millis}`.
    - `Transcribe(TranscribeRequest {segment_id, pcm, languages, prompt_tokens, audio_ctx, prev_lang})` → `Result(TranscribeResult {segment_id, lang, lang_prob, text, tokens, no_speech_prob, lid_ms, asr_ms, avg_logprob})`.
    - `Shutdown`: worker thoát, không phản hồi. Khi stdin đóng (ví dụ app chết), worker cũng thoát.
    - Mọi lỗi → `Error {segment_id?, kind, message}`. `segment_id` có giá trị khi lỗi thuộc về một đoạn. `kind` là `NotLoaded`, `ModelLoad`, `OutOfMemory`, `GpuInit`, `InvalidRequest` hoặc `Internal`, để bảng lỗi ở §9 phân biệt được. Worker phân loại theo nội dung thông báo của whisper.cpp và ggml; đầu vào sai thì trả `InvalidRequest`, không panic.
  - **Trường của `TranscribeRequest`.** Giá trị ngoài khoảng thì worker trả `Error`.
    - `pcm`: âm thanh 16 kHz mono, int16, từ `MIN_PCM_SAMPLES` đến `MAX_PCM_SAMPLES` mẫu (0,1 đến 30 giây). Đoạn 8 giây chỉ khoảng 256 KB. Pipeline không gửi đoạn ngắn hơn 100 ms.
    - `languages`: mã ngôn ngữ Whisper được phép, ví dụ `["en", "vi"]`. Một phần tử nghĩa là khóa ngôn ngữ.
    - `prompt_tokens`: tối đa `MAX_PROMPT_TOKENS` (100) token cuối của các đoạn trước cùng ngôn ngữ. Mỗi token phải là token văn bản (nhỏ hơn EOT).
    - `prev_lang`: ngôn ngữ của đoạn được giữ gần nhất (đoạn bị bỏ ở "Lọc lỗi ảo giác" không làm đổi), là trường cuối. Worker không giữ trạng thái nhận diện ngôn ngữ, nên kết quả không phụ thuộc thứ tự yêu cầu, và app không mất ngôn ngữ trước khi worker khởi động lại. Worker chỉ dùng `prompt_tokens` khi ngôn ngữ chọn cho đoạn này đúng bằng `prev_lang`.
    - `audio_ctx`: từ 0 đến 1500; 0 là cửa sổ 30 giây. Giá trị khác phải phủ hết `pcm` (`audio_ctx × 320 ≥ số mẫu`), vì whisper.cpp lặng lẽ bỏ phần đuôi không được phủ. Công thức ở "Rút ngắn cửa sổ mã hóa" bên dưới.
  - **Trường của `TranscribeResult`:**
    - `lid_ms`: thời gian nhận diện ngôn ngữ, bằng 0 khi ngôn ngữ bị khóa. `asr_ms`: thời gian chép lời (encode và decode).
    - `avg_logprob`, trường cuối: trung bình log-xác suất của các token văn bản đã sinh, không tính token đặc biệt, kể cả EOT. Không có token nào thì bằng 0. Chế độ B bỏ log-xác suất của phần bị gom vì lặp; chế độ A không có luật lặp, nên trung bình gồm cả token lặp. Dùng cho luật bỏ đoạn ở "Lọc lỗi ảo giác".
  - **Mở rộng giao thức:** postcard mã hóa enum theo chỉ số biến thể, nên chỉ thêm biến thể mới ở cuối, không đổi thứ tự (test `variant_indices_are_pinned`). Thêm hay bỏ trường cũng đổi định dạng trên dây, nên app và `asr-worker` luôn build cùng nhau.
  - **Khung lỗi:** khung còn byte thừa sau thông điệp là lỗi (`TrailingBytes`), cũng như khung hỏng, bị cắt, hoặc dài quá 16 MiB. Gặp lỗi đọc khung, worker thoát với mã 1, và app khởi động lại worker như ở dưới.
  - Log của thông điệp không bao giờ chứa âm thanh hay nội dung chép lời (§10.2).
  - Đo ở S3 trên M4 Pro: truyền qua pipe tốn 0,4–0,9 ms mỗi đoạn ở trung vị, lớn nhất 2,9 ms (giả định 10 ở §14).
- **Hai bản trên Windows:** `asr-worker-vulkan` (Vulkan và CPU) và `asr-worker-cpu` (chỉ CPU). Bản Vulkan phụ thuộc trực tiếp vào `vulkan-1.dll`, nên không chạy được trên máy không có Vulkan. macOS chỉ có một bản (Metal và CPU).
  - Mỗi lần app khởi động, kể cả ở bước kiểm tra cấu hình lần đầu (§4.1), app chạy nền `asr-worker-vulkan --probe`. Tiến trình này in ra danh sách GPU (loại thiết bị, dung lượng heap `DEVICE_LOCAL`) rồi thoát; kết quả dùng để đề xuất gói model (§6.7). Mọi code đụng tới GPU đều nằm trong tiến trình phụ, nên driver lỗi lúc dò GPU cũng không làm sập app.
  - Khi cần chạy `asr-worker`, app dùng bản Vulkan nếu lần dò tìm thấy GPU dùng được. Bản Vulkan không khởi động được, hoặc crash lúc nạp model, thì app chạy bản CPU.
  - Chờ kết quả S3 trên Windows (kế hoạch 03, Task 14–16, `results/s3_windows.md`): build hai bản, `--probe`, chép lời bằng Vulkan và CPU, máy không có Vulkan.
- **Khi tiến trình phụ lỗi:** tự khởi động lại, chờ lần lượt 1, 2, 5 giây giữa các lần, giống `llama-server` (§6.5).
  - Lần đầu chạy một binary mới, thời gian chờ `Ready` theo cùng quy tắc với `/health` của `llama-server` (§6.5).
  - Đoạn đang xử lý được gửi lại một lần. Lỗi lần nữa thì đánh dấu "[bỏ qua đoạn]" (`dropped`, §6.6).
  - Crash 2 lần liên tiếp khi đang dùng GPU thì chuyển sang CPU, báo "Đang chạy bằng CPU (chậm hơn)".
  - Quá 5 lần trong 10 phút thì dừng dịch và báo lỗi.
- **Model:**
  - Gói Chuẩn: `large-v3-turbo` bản q5_0, khoảng 550 MB.
  - Gói Nhẹ: `small` bản q5_1, khoảng 190 MB.
- **Chế độ giải mã (chốt ở S3):** mặc định là **chế độ B** (`shared`): nhận diện ngôn ngữ và chép lời dùng chung một lượt encode.
  - Chế độ B cần build `asr-worker` với feature `shared-encode`, vì nó dùng bản vá ở `third_party/`. Thiếu feature này thì worker chỉ có chế độ A.
  - Lý do: trong whisper.cpp, chế độ tự nhận diện chạy encoder một lượt để lấy xác suất ngôn ngữ, rồi chạy thêm lượt nữa để chép lời. Lượt nhận diện còn chạy trước khi `audio_ctx` được áp dụng, nên mã hóa đủ cửa sổ 30 giây. Để nguyên thì thời gian nhận dạng gần gấp đôi, trong khi chi phí nhận diện phải dưới 20% thời gian nhận dạng của đoạn (giả định 9 ở §14).
  - Cách làm: `asr-worker` đặt `audio_ctx` rồi mới encode. Sau đó chạy một bước decoder với token SOT, lấy từ logits cả xác suất ngôn ngữ lẫn `no_speech_prob`, rồi tự giải mã greedy bằng API mức thấp của whisper.cpp.
  - **Bản vá:** whisper.cpp chỉ đặt `audio_ctx` bên trong `whisper_full`, nên phải vá. Bản vá thêm hàm C `whisper_set_audio_ctx_with_state` và `WhisperState::set_audio_ctx` phía Rust. Hai bản vá nằm ở `third_party/patches/` (`0001-whisper-cpp-set-audio-ctx.patch`, `0002-whisper-rs-set-audio-ctx.patch`), áp lên bản sao của `whisper-rs-sys` và `whisper-rs` trong `third_party/`, nối vào qua `[patch.crates-io]`. Cách dựng lại ở `third_party/README.md`.
  - **Chế độ A** (`split`, bật bằng `ASR_MODE=split`): nhận diện trên 3 giây đầu của đoạn bằng một state riêng, rồi `whisper_full` chép lời. Chỉ giữ để so sánh, hoặc dự phòng khi không dùng được bản vá.
  - Kết quả S3 trên 548 clip của A4 (M4 Pro, Metal):
    - B nhận đúng ngôn ngữ 548/548 clip. A chỉ đúng 507–508 clip; riêng tiếng Nhật 74–77%, vì 3 giây đầu phần nhiều là nhiễu.
    - WER/CER của B thấp hơn A ở cả 10 ô (2 model × 5 ngôn ngữ). Chênh lệch đến từ việc A nhận sai ngôn ngữ và A chạy vòng lặp.
    - Chi phí nhận diện của B bằng 0–2% thời gian chép lời; của A là 11–19% với small và 24–36% với turbo.
- **Chọn ngôn ngữ:**
  - Lấy xác suất ngôn ngữ của Whisper, chuẩn hóa lại trong **tập người dùng cho phép**, rồi chọn ngôn ngữ cao nhất.
  - Đoạn từ 1,5 giây trở lên: nếu xác suất cao nhất (sau khi chuẩn hóa) dưới 0,5 thì giữ ngôn ngữ của đoạn trước, để ngôn ngữ không nhảy qua lại.
  - **Đoạn ngắn hơn 1,5 giây:** chỉ đổi ngôn ngữ khi xác suất cao nhất từ 0,9 trở lên; còn không thì giữ ngôn ngữ của đoạn trước.
    - Lý do: ở S6, không có sàn `audio_ctx` thì turbo nhận 22/60 đoạn tiếng Việt thành tiếng Anh, và đoạn dưới 1,3 giây sai hết. Có sàn và ngưỡng này, session tiếng Việt của gói Chuẩn nhận đúng 56/60 đoạn.
    - Đánh đổi, theo một phép thử lúc review trên đoạn dài 1 giây: nhận đúng thêm 7/60 đoạn khi ngôn ngữ trước đúng, nhưng sai thêm 5/60 đoạn khi người nói đổi ngôn ngữ thật. Cách dựng phép thử chỉ ghi vắn tắt ở kế hoạch 00 (`phase0_review_notes.md`). Chấp nhận, vì trong cuộc họp, việc giữ nguyên một ngôn ngữ phổ biến hơn nhiều so với đổi ngôn ngữ.
  - Chỉ giữ ngôn ngữ của đoạn trước khi ngôn ngữ đó thuộc tập cho phép. Chưa có đoạn trước thì lấy ngôn ngữ cao nhất.
  - Nếu người dùng khóa ngôn ngữ, hoặc tập cho phép chỉ có một ngôn ngữ, thì bỏ bước nhận diện.
  - Với tập hai ngôn ngữ, ngưỡng 0,5 không bao giờ có tác dụng, vì xác suất sau chuẩn hóa của ngôn ngữ cao nhất luôn từ 0,5 trở lên (việc cho MVP ở cuối mục).
  - Trên 548 clip FLEURS (câu đọc, dài 3–28 giây), chế độ B nhận đúng mọi clip, nên khóa ngôn ngữ không đổi chữ nào; lợi ích duy nhất là bỏ được 1,7–2,7 ms nhận diện. Trên đoạn VAD ngắn (S6), khóa ngôn ngữ còn tránh được lỗi nhận diện (4/60 đoạn tiếng Việt của gói Chuẩn).
- **Giải mã:** greedy, không dùng temperature fallback. Chặn các token không phải tiếng nói.
  - **Prompt khởi đầu:** tối đa 100 token cuối (`MAX_PROMPT_TOKENS`) của các đoạn trước cùng ngôn ngữ.
  - **Mồi dấu câu cho zh và ja:** đã thử, và **tắt mặc định**. Chỉ bật khi đặt `ASR_PRIMER=1`, để thử nghiệm; khi đó, đoạn không có prompt của đoạn trước dùng một câu mồi có dấu câu. Lý do tắt:
    - với zh, dấu `。` hiện cả ở đoạn giữa câu, nên không giúp ghép câu (§6.3);
    - trên đoạn không có tiếng nói, model chép lại chính câu mồi.
  - **Dừng khi lặp** (chỉ chế độ B; chế độ A dùng `whisper_full`, không có luật này, trần của nó là 220 token): mỗi khi sinh thêm một token, nếu dãy token kết thúc bằng nhiều bản liên tiếp của cùng một mẫu thì gom về một bản rồi dừng giải mã. Số bản cần có:
    - mẫu 1–8 token: 4 bản, để không cắt nhầm lời nói thật như "no, no, no";
    - mẫu 9–15 token: 3 bản;
    - mẫu 16–112 token (thường là cả câu): 2 bản, vì Whisper có khi chép cả câu hai lần rồi mới dừng. 112 là nửa trần 224 token của Whisper.
    - Trên A4, luật 2 bản bắt đúng 3 clip chép hai lần và không bắt nhầm clip nào (`phase0_review_notes.md`).
    - Đánh đổi: người nói nhắc lại liền một câu từ 16 token trở lên thì câu đó chỉ hiện một lần. Một phép thử lúc review, ghép đôi các câu, gặp trường hợp này ở 6/80 cặp; cách dựng cặp chỉ ghi vắn tắt ở kế hoạch 00 (`phase0_review_notes.md`).
  - **Trần số token mới** của một đoạn (chỉ chế độ B): min(224 − độ dài prompt, 16 + 20 × số giây của đoạn). Độ dài prompt tính cả `<|startofprev|>` và 4 token SOT, ngôn ngữ, task, notimestamps. Trần theo độ dài chặn các vòng lặp mà luật trên không bắt được (các bản không giống hệt nhau), nhất là ở đoạn ngắn. Hệ số 20 bằng khoảng 3 lần p99 của lời nói thật trên FLEURS (6,35 token/giây, `phase0_review_notes.md`).
- **Rút ngắn cửa sổ mã hóa (`audio_ctx`):** mặc định whisper.cpp luôn mã hóa một cửa sổ 30 giây, kể cả khi đoạn chỉ dài 3 giây. App đặt **`audio_ctx = min(1500, max(512, 50 × số giây của đoạn + 64))`**, làm tròn lên; mỗi giây tương ứng 50 khung. Sàn 512 là hằng `MIN_AUDIO_CTX`, công thức là hàm `audio_ctx_for_samples`, cả hai nằm trong `asr-protocol`.
  - Sàn chỉ có tác dụng với đoạn ngắn hơn 8,96 giây. Đoạn thường của app dài tối đa 8 giây cộng đệm, nên luôn có `audio_ctx` bằng 512; chỉ đoạn được gộp ở hàng đợi (§7, tới 12 giây) mới lớn hơn.
  - Lý do có sàn (S7, A4): cửa sổ quá ngắn làm Whisper chép thừa, như lặp cụm cuối câu hay chép cả câu hai lần. Sàn giảm tổng số lỗi trên 5 ngôn ngữ 6,4% với turbo và 1,5% với small, không ô nào xấu đi đáng kể. Sàn còn sửa nhận diện ngôn ngữ của turbo với đoạn tiếng Việt ngắn (xem "Chọn ngôn ngữ").
  - Chi phí: trên A4, turbo chậm thêm khoảng 88 ms ở đoạn dưới 5 giây, small khoảng 15 ms; từ 9 giây trở lên không đổi. Trên session S6 (lượt có sàn so với lượt không sàn, cùng đợt đo), bước nhận dạng p50 của turbo tăng 32–76 ms tùy session, độ trễ tổng thể p50 gộp mọi câu tăng khoảng 20 ms (965 → 984 ms); small đổi trong khoảng ±16 ms.
  - So với cửa sổ 30 giây đầy đủ (giả định 8 ở §14), trên cùng một bản build (`s7_asr.md`, lượt sàn 512 so với lượt fullctx), còn 3/10 ô tăng quá 10%: turbo zh +11,1%, turbo ko +45,1%, small ko +15,5%. Xét từng ô thì giả định 8 không đạt.
    - Gần hết phần chênh nằm ở clip dài hơn 9 giây, nơi sàn không đổi `audio_ctx`: turbo zh +20 lỗi ở 38 clip dài, +0 ở 64 clip ngắn; small ko +42 và +3. Đoạn thường của app ngắn hơn 8,96 giây, nên phần chênh này chỉ gặp ở đoạn gộp của hàng đợi (§7).
    - Ô turbo ko do một clip 13,7 giây chép cả câu hai lần. Luật lặp 2 bản của cấu hình chốt bắt được clip này: `a4_m4pro-turbo-final.json` cho CER 0,041, thấp hơn fullctx (0,043).
    - Lượt fullctx chạy bằng bản build trước luật lặp mới, nên chưa có số so sánh cùng cấu hình. Chờ chạy lại fullctx với bản build chốt (bổ sung cho kế hoạch 03, Task 11).
  - Không dùng cửa sổ 30 giây làm mặc định: turbo chậm gấp 2,6 lần (p50 334 → 884 ms), vượt ngân sách ở §8.
  - Chế độ A vẫn nhận diện ngôn ngữ trên cửa sổ 3 giây (`audio_ctx` 214), không qua sàn.
- **Flash attention: tắt** (kiểm lại ngày 2026-10-01: ggml-org/whisper.cpp#3941 vẫn mở; giữ tắt, kế hoạch 08 kiểm lại trước khi phát hành). whisper.cpp 1.8.3, cả v1.9.4 và master, sai khi bật flash attention cùng `audio_ctx` rút ngắn: phần đệm tới bội 256 không có mask. Kết quả là lặp câu, và thay đổi theo đoạn chép trước (ggml-org/whisper.cpp#3941, bản vá chưa được merge). `ASR_FLASH_ATTN=1` chỉ dùng để thử.
  - Bản vá mask cho kết quả trùng hệt bản tắt flash. Trên M4 Pro, nó giúp chép lời nhanh hơn 5–13% và giảm 91–149 MB bộ nhớ đệm mỗi state (đo lúc review, `phase0_review_notes.md`). Trên M4 Pro, mức lợi này không đổi quyết định nào (p50 và p90 dư khoảng gấp đôi). Máy tham chiếu chưa đo: nếu M1 cơ bản hay máy chỉ có CPU sát ngưỡng A2 thì xem lại.
  - Chỉ bật lại khi whisper.cpp có mask cho phần đệm, và phải kèm test tất định: cùng một đoạn, chép sau các đoạn khác nhau, phải ra cùng token.
- **Làm nóng:** sau `Load`, app gửi `Warmup`; `asr-worker` chạy thử một lần trên một đoạn im lặng để nạp sẵn kernel GPU.
- **Lọc lỗi "ảo giác" của Whisper:**
  - **Bỏ đoạn khi `no_speech_prob > 0,6` và `avg_logprob < −1`.** Đây là luật của OpenAI Whisper, nhưng `avg_logprob` không tính EOT nên dễ bỏ đoạn hơn một chút ở đoạn ngắn. Đoạn có chữ rỗng cũng bị bỏ.
    - Luật này chạy ở tiến trình chính; `asr-worker` chỉ trả `no_speech_prob` và `avg_logprob`. Đoạn bị bỏ không được đưa vào prompt của đoạn sau, và không làm đổi ngôn ngữ của đoạn trước (`prev_lang`). Công cụ đo của Giai đoạn 0 chưa làm hai điều này.
    - `no_speech_prob` lấy từ logits ngay sau SOT (chế độ B). Với tham số của app, `whisper_full` (chế độ A) luôn trả gần 0, nên bộ lọc chỉ có tác dụng ở chế độ B.
    - Cần cả hai điều kiện. Chỉ dùng `no_speech_prob > 0,6` thì bỏ nhầm câu đúng, ví dụ một câu tiếng Hàn có `no_speech_prob` 0,62 và `avg_logprob` −0,25 (`phase0_review_notes.md`). Chỉ dùng `avg_logprob < −1` thì bỏ nhầm một clip tiếng Nhật thật trên A4.
    - Trên A4, luật bỏ đúng 1 clip, là một bản chép ảo giác của small; với turbo, luật không bỏ clip nào. Trên S6, luật bỏ 1 đoạn: câu ảo giác "Thank you." dài 256 ms, ở gói Nhẹ.
    - Với turbo, `no_speech_prob` luôn khoảng 1e-11 trên đoạn có tiếng nói, nên luật gần như không bao giờ bỏ đoạn nào.
  - Vòng lặp token được gom ngay lúc giải mã ("Dừng khi lặp" ở trên).
  - Bỏ các câu hay bị bịa ra khi chỉ có nhạc hoặc im lặng, ví dụ "Thank you for watching", "Hãy subscribe cho kênh", "[Music]", "ご視聴ありがとうございました", "请不吝点赞…". Các câu này có `avg_logprob` cao, nên luật `no_speech` ở trên không bắt được.
- **Việc cho MVP:**
  - Thử `no_speech_prob` trên im lặng, nhiễu và nhạc, nhất là với turbo, trước khi dựa vào bộ lọc này.
  - Luật lặp: khi prompt dài (đoạn trước cùng ngôn ngữ, tới 100 token), trần token còn khoảng 119, nên câu chép đôi dài từ khoảng 60 token không bị bắt. Xem lại.
  - Chọn ngưỡng giữ ngôn ngữ của đoạn trước theo số ngôn ngữ trong tập, dựa trên đoạn VAD thật (S6) và dữ liệu hội thoại. A4 không dùng được cho việc này: chế độ B nhận đúng 548/548 clip, và clip ngắn nhất dài 3,3 giây.
  - Cài bộ lọc câu ảo giác quen thuộc ở "Lọc lỗi ảo giác" (Giai đoạn 0 chưa có).
  - Bật `shared-encode` mặc định cho bản phát hành, và app từ chối worker có `decode_mode` khác `shared`.
  - Với zh, small hay ra chữ phồn thể: chuyển phồn thể sang giản thể ở tầng app.
  - Xem lại flash attention khi upstream có mask cho phần đệm: tự vá, hoặc chờ upstream.
  - Trước khi gửi bản vá `set_audio_ctx` lên upstream: hàm C trả `-1` khi giá trị ngoài `[0, n_audio_ctx]`, bản Rust trả `Result`.
  - Làm giao thức bản 2 như mô tả ở "Giao tiếp với tiến trình chính": `prev_lang` trong `TranscribeRequest`; `backend` và `decode_mode` thành enum; `Error.kind`; `Ready.protocol_version`.
  - `asr-worker` giữ riêng stdout cho giao thức: chuyển fd 1 sang stderr, để log lạ của thư viện không lọt vào kênh giao thức.
  - Log của `asr-worker` mở ở chế độ append để giữ log qua các lần khởi động lại, nên cần xoay vòng hoặc giới hạn kích thước.

### 6.5 Dịch

- **Tiến trình phụ `llama-server`:** khóa cố định một phiên bản llama.cpp.
  - macOS arm64: dùng Metal.
  - Windows x64: dùng backend Vulkan và CPU, nạp backend lúc chạy, lỗi GPU thì tự chuyển CPU.
- **Lệnh chạy:** `LLAMA_API_KEY=<ngẫu nhiên> llama-server -m <gguf> --host 127.0.0.1 --port <cổng trống ngẫu nhiên> -c 2048 -np 1 -ngl auto --no-ui`. App gọi `/health` để biết server đã sẵn sàng.
  - API key truyền qua biến môi trường `LLAMA_API_KEY`, không qua `--api-key`, vì tham số dòng lệnh hiện ra trong `ps`. b11146 hỗ trợ cả hai cách.
  - Giai đoạn 0 (`crates/pipeline/src/llama.rs`) vẫn truyền `--api-key`. MVP đổi sang `LLAMA_API_KEY`, chỉ đặt biến này cho tiến trình `llama-server`.
  - Dùng `--no-ui`, không dùng `--no-webui`: b11146 đánh dấu tên cũ là deprecated.
  - `-ngl auto` là mặc định của llama.cpp hiện tại. Khi đó `--fit`, vốn bật sẵn, tự chọn số lớp đặt lên GPU theo VRAM còn trống, và chừa lại 1 GiB.
  - Không truyền `-ngl 99`. Đã đặt tay số lớp thì `--fit` không chỉnh nữa, nên máy ít VRAM dễ hết bộ nhớ lúc nạp model.
  - Chạy `llama-server` sau khi `asr-worker` đã nạp model (§5), để `--fit` tính cả phần VRAM mà whisper đang dùng.
- **Khi server lỗi:** tự khởi động lại, chờ lần lượt 1, 2, 5 giây giữa các lần. Quá 5 lần trong 10 phút thì báo lỗi, phụ đề chỉ hiện câu gốc.
- **Lần đầu chạy một binary mới** (sau khi cài hoặc cập nhật), macOS mất khoảng 15 giây kiểm tra trước khi `llama-server` chạy. Số này không có file kết quả hay log, và chưa đo trên bản đã notarize (`phase0_review_notes.md`).
  - Lần đầu chạy, app chờ `/health` tới **180 giây** (lần thường 60 giây), và lần chờ này không tính là một lần lỗi trong bộ đếm "quá 5 lần trong 10 phút". 180 giây là trần an toàn (tối thiểu phải từ 30 giây), chưa dựa trên số đo của bản đã notarize.
  - Giao diện báo "Đang chuẩn bị lần đầu".
  - Áp dụng cả cho `asr-worker` (chờ `Ready`, §6.4).
- **API:** dùng `/v1/chat/completions` với `stream: true`, chat template lấy từ GGUF.
  - S4 đã xác nhận trên macOS arm64, với cả Q8_0 và Q4_K_M: token prompt do `llama-server` b11146 dựng từ template trong GGUF trùng từng token với tokenizer Hugging Face, và bản dịch stream giống hệt khi nạp token của Hugging Face.
  - Kết luận chỉ áp cho lệnh chạy ở trên (không `--jinja`, không `--chat-template`). Đổi cờ, hoặc chạy trên Windows, thì làm lại S4.
  - **Phương án dự phòng**, nếu template trong GGUF không dùng được: render template bằng `minijinja` phía Rust rồi gọi `/completion`. Khi đó phải truyền mảng token, hoặc bỏ BOS ở đầu chuỗi: nếu GGUF có `add_bos_token=true` thì sẽ ra BOS kép (S4 đã tái hiện). `/v1/chat/completions` không bị lỗi này.
- **Mẫu prompt** lấy theo model card của Hy-MT2:
  - Khi câu có liên quan tới tiếng Trung, dùng mẫu tiếng Trung: `将以下文本翻译为{目标语言}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}`
  - Các trường hợp còn lại dùng mẫu tiếng Anh: `Translate the following text into {target}. Note that you should only output the translated result without any additional explanation:\n\n{text}`
  - Tên ngôn ngữ trong prompt: mẫu tiếng Anh dùng tên tiếng Anh (Vietnamese, English, Chinese, Japanese, Korean); mẫu tiếng Trung dùng tên tiếng Trung (越南语, 英语, 中文, 日语, 韩语), giống benchmark (`run_mt.py`).
  - **Thuật ngữ:** dùng mẫu "terminology" của Hy-MT2.
    - Chỉ lấy những mục trong từ điển có xuất hiện trong câu, tối đa 20 mục mỗi câu.
    - Trước khi so khớp, chuẩn hóa Unicode NFC và không phân biệt hoa thường.
    - Chữ Latin khớp theo ranh giới từ; chữ Trung, Nhật, Hàn khớp theo chuỗi con.
  - **Đưa câu trước vào làm ngữ cảnh** (mẫu "background information"): **giữ là cờ thử nghiệm, mặc định tắt** (S7).
    - Q8_0 dịch tệ hơn có ý nghĩa ở cả 8 chiều (COMET giảm 0,035–0,186), và 325/538 bản dịch dính tiêu đề mẫu hoặc dịch luôn câu ngữ cảnh.
    - Q4_K_M không có chiều nào tốt hơn có ý nghĩa, và vẫn có 8/538 bản dịch nghi lẫn mẫu.
- **Tham số sinh:** temperature 0, repeat penalty 1,05 (giống benchmark). Số token tối đa = min(4 × số token câu gốc + 32, 512). Trên bộ test S7, hạn mức này không cắt bản dịch nào trong 1240 bản dịch không ngữ cảnh (lớn nhất bằng 0,61 hạn mức).
- **Tăng tốc:** bật `cache_prompt` để dùng lại KV cache của phần hướng dẫn cố định ở đầu prompt. Khi bắt đầu phiên, gửi một request làm nóng.
- **Hậu xử lý:** bản dịch được stream ra thanh phụ đề (§4.4), nên hậu xử lý chạy ngay trong lúc stream, không chờ bản dịch hoàn chỉnh.
  - Cắt khoảng trắng thừa.
  - Giữ lại vài token đầu cho tới khi chắc chắn không phải nhãn đầu câu (như "Translation:" hay "译文：") hoặc ngoặc kép mở, rồi mới hiện. Nhãn thì bỏ. Ngoặc kép bao quanh thì bỏ nếu câu gốc không có.
  - **Bản dịch quá dài:** đo bằng token, không đo bằng ký tự, vì tỉ lệ ký tự giữa các cặp ngôn ngữ chênh nhau rất nhiều. Trong benchmark, câu tiếng Việt dài trung vị gấp 2,74 lần câu tiếng Trung cùng nghĩa; nếu đo bằng ký tự với ngưỡng 3 lần, gần nửa số câu Trung→Việt sẽ bị coi là lỗi. Vượt ngưỡng thì cắt stream ngay.
    - Ngưỡng tỉ lệ token (token bản dịch chia token câu gốc) đặt riêng cho từng cặp ngôn ngữ. Lấy ở S7: tỉ lệ lớn nhất đo được trên bộ test, cộng biên 25%, làm tròn lên 0,1.
    - Ngưỡng: Anh→Việt 4,4; Trung→Việt 6,6; Nhật→Việt 3,5; Hàn→Việt 3,5; Việt→Anh 1,6; Việt→Trung 1,2; Việt→Nhật 2,2; Việt→Hàn 2,2.
    - Câu gốc rất ngắn làm tỉ lệ dao động mạnh. Ngưỡng Trung→Việt 6,6 chỉ do một câu gốc 4 token có bản dịch đúng dài 21 token. Chỉ tính câu gốc từ 10 token trở lên thì Trung→Việt còn 4,3 và Việt→Anh còn 1,4; sáu chiều còn lại giữ nguyên.
    - **Chỉ áp ngưỡng tỉ lệ khi câu gốc có từ 10 token trở lên** (chốt 2026-10-01, cách 2 ở Q4 của kế hoạch Giai đoạn 1 · 00). Câu ngắn hơn chỉ chịu hạn mức sinh ở "Tham số sinh" (tối đa 68 token khi câu gốc dưới 10 token). Lý do: không cần hằng số chỉ do một câu (`zh-vi-888`) quyết định, và hạn mức sinh chưa cắt bản dịch nào trong 1240 bản dịch của S7. Ngưỡng giữ nguyên các số ở trên.
    - Cặp chưa có ngưỡng (không có tiếng Việt) chưa bị kiểm tỉ lệ, cho tới khi đo xong (Việc cho MVP bên dưới).
    - Bộ test không có câu gốc dưới 3 token (như "Vâng", "OK"), và không có cặp nào không chứa tiếng Việt.
  - **Thử lại** một lần với repeat penalty cao hơn (1,15). Với temperature 0, giữ nguyên tham số thì kết quả sẽ y hệt lần trước. Vẫn lỗi thì hiện câu gốc, đánh dấu "chưa dịch được".
- **Bỏ qua bước dịch** khi ngôn ngữ câu gốc trùng ngôn ngữ đích.
- **Việc cho MVP:**
  - Đo ngưỡng cho các cặp không có tiếng Việt, và cho câu gốc dưới 3 token.
  - Đo lại thời gian chờ lần đầu với bản đã ký và notarize.

### 6.6 Phụ đề và bản chép lời

- **Cấu trúc:** `Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status, replaces }`, cộng thêm cờ `provisional` cho phụ đề tạm (§6.3).
  - `replaces`: danh sách id các phụ đề đã gộp vào phụ đề này khi hàng đợi dịch đầy (§7), để giao diện xóa chúng. Thường là danh sách rỗng.
  - `status` nhận một trong các giá trị:
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
    - Chờ kết quả S6 trên card rời 6 GB, 4 GB và GPU tích hợp (kế hoạch 06, Task 8) để chốt ngưỡng VRAM 6 GB.

  Các máy còn lại được đề xuất gói Nhẹ. Người dùng vẫn đổi được.
- **Tải model:**
  - Dùng HTTP Range để tải tiếp được khi rớt mạng.
  - Ghi ra file `*.part`, kiểm tra SHA-256, rồi mới đổi tên thành file chính thức.
  - Trước khi tải, kiểm tra dung lượng trống còn ít nhất bằng kích thước model cộng 1 GB.
- **Nơi lưu:** thư mục dữ liệu của app theo Tauri (`app_local_data_dir`), nằm ngoài thư mục cài đặt.
  - macOS: `~/Library/Application Support/<bundle-id>/models`, tức `~/Library/Application Support/com.aitranslator.desktop/models`
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
- Webhook là một route chung `/v1/webhooks/{provider}`; server chọn cổng theo cột `provider` của đơn. Thêm một cổng khác chỉ cần viết thêm một cài đặt. License, token bản quyền và app đều không phải sửa.
- Bảng đơn hàng lưu thêm `provider` và `currency`. Mỗi gói trả phí có giá riêng theo từng loại tiền.
- License chỉ quan tâm gói, `expires_at` và `cycle_anchor`, không quan tâm tiền đến từ đâu. Vì vậy cả hai kiểu thanh toán đều dùng chung được:
  - Gói trả trước của PayOS: mỗi đơn là 30 ngày, theo luật ở "Mua thêm và đổi gói".
  - Thuê bao tự gia hạn của cổng quốc tế: mỗi webhook gia hạn cộng thêm một kỳ 30 ngày; khách hủy thì ngừng cộng.

**Gói và bảng giá:**
- Bốn gói ở §2. Server giữ bảng gói trả phí trong biến cấu hình `PLANS` của từng môi trường: mã gói, tên hiển thị, hạn mức mỗi chu kỳ (`quota_minutes_per_cycle`, `null` là không giới hạn), số ngày mỗi đơn (30), giá theo từng loại tiền. Đổi giá hay hạn mức không cần phát hành lại app.
- **Đổi hạn mức trong `PLANS`** có tác dụng ngay với mọi license đang dùng gói đó, ở lần `validate` sau, vì token lấy hạn mức từ bảng hiện hành. Vì vậy người vận hành **không được hạ hạn mức của một gói đang bán**: khách đã trả tiền cho hạn mức cũ. Muốn bán hạn mức thấp hơn thì thêm gói mới.
- Môi trường chưa cấu hình `PLANS` thì `GET /v1/plans`, checkout, `activate` và `validate` đều trả `503 pricing_not_configured`, để không bao giờ bán sai giá hay cấp token thiếu hạn mức. Staging dùng giá thử nhỏ (kế hoạch 05).
- Hạn mức Free (10 phút mỗi ngày) là hằng số phía app, vì Free không có token.

**Mua thêm và đổi gói:**
- Server tính khi xác nhận đã nhận tiền (webhook, đối soát, hoặc admin cấp tay), theo gói và hạn của license tại "hiện tại".
- **"Hiện tại"** là thời điểm thanh toán do PayOS báo (`transactionDateTime`), kẹp trong thời hạn của link thanh toán (từ lúc tạo đơn tới `expiredAt`). Không làm tròn về đầu ngày. Vì vậy webhook đến chậm hay đối soát sau vài giờ vẫn cho cùng kết quả.
  - `transactionDateTime` có thể là giờ Việt Nam không kèm múi giờ (dạng `2026-10-01 14:30:00`), và tài liệu PayOS không ghi múi giờ. Server parse giá trị không có múi giờ theo GMT+7, và nhận cả ISO 8601 có múi giờ. Đây là giả định cần kiểm (§14, giả định 11).
  - Admin cấp tay dùng thời điểm thao tác, kể cả với đơn `underpaid` mà khách đã chuyển bù.
  - **"Hiện tại" khi áp đơn không được sớm hơn `cycle_anchor` đang có của license.** Luật này dùng khi các đơn được áp không theo thứ tự thanh toán: đơn trả sớm hơn mà được xử lý sau một đơn trả muộn hơn (ví dụ webhook tới không theo thứ tự) thì tính tại `cycle_anchor` của license. Nhờ vậy `cycle_anchor` không bao giờ lùi.
- **License mới:** `plan` là gói của đơn; `expires_at` = hiện tại + 30 ngày; `cycle_anchor` = hiện tại.
- **Mua thêm cùng gói:** `expires_at` cộng 30 ngày, tính từ max(hiện tại, `expires_at`). `cycle_anchor` giữ nguyên; nếu license đã hết hạn thì `cycle_anchor` = hiện tại.
- **Đổi gói khi license còn hạn** (lên gói hay xuống gói đều làm như nhau):
  - Gói mới bắt đầu ngay: `plan` = gói mới, `cycle_anchor` = hiện tại, hạn mức của chu kỳ mới tính đầy đủ.
  - Số ngày còn lại của gói cũ được quy ra tiền theo giá gói cũ, rồi đổi sang ngày của gói mới, làm tròn xuống:
    `ngày_quy_đổi = floor(ngày_còn_lại × giá_cũ / giá_mới)`.
    - `ngày_còn_lại` = (`expires_at` − hiện tại) / 1 ngày, giữ cả phần lẻ.
    - `giá_cũ` và `giá_mới` lấy theo bảng giá hiện hành, cùng loại tiền với đơn.
  - `expires_at` = hiện tại + 30 ngày + `ngày_quy_đổi`.
  - Không hoàn tiền.
  - Ví dụ lên gói: Professional còn 20 ngày, mua X2. Ta có 20 × 50.000 / 150.000 = 6,67, làm tròn xuống 6 ngày. X2 chạy trong 36 ngày.
  - Ví dụ xuống gói: X2 còn 10 ngày, mua Professional. Ta có 10 × 150.000 / 50.000 = 30 ngày. Professional chạy trong 60 ngày.
- **License đã hết hạn mà mua gói khác:** tính như license mới, nhưng giữ key cũ.
- Đơn gia hạn hay đổi gói: response của checkout có thêm ước tính `license_expires_at`, tính theo thời điểm tạo đơn, để app hiện trước cho người dùng. Số chính thức tính theo thời điểm thanh toán, muộn hơn lúc tạo đơn tối đa 15 phút (thời hạn của link). Vì vậy `expires_at` chính thức muộn hơn ước tính tối đa 15 phút; riêng khi đổi gói, `ngày_quy_đổi` có thể ít hơn ước tính 1 ngày, vì `ngày_còn_lại` giảm và phép làm tròn xuống.
- Máy thứ hai của cùng key nhận gói mới ở lần `validate` kế tiếp ("Kiểm tra định kỳ" bên dưới); trước đó máy đó vẫn dùng token cũ.

**API của license server:**
- Mọi body là JSON. Tên trường dùng `snake_case` cho cả request lẫn response (`order_code`, `checkout_url`, `qr_code`, `order_token`, `license_key`…); chỉ khi gọi PayOS mới dùng `camelCase` của PayOS.
- Lỗi có dạng `{"error": "<mã>", …}`. Thời điểm tính bằng giây Unix. `429` luôn kèm header `Retry-After`.
- Mọi route chỉ nhận HTTPS (ngoài môi trường dev). Server không bật CORS, vì app gọi server từ phía Rust, không gọi từ WebView.

| Endpoint | Việc làm |
|---|---|
| `GET /v1/plans` | Trả bảng gói trả phí đang bán: mã gói (`code`), tên hiển thị (`name`), `quota_minutes_per_cycle`, số ngày mỗi đơn, giá theo loại tiền. App dùng cho màn hình Nâng cấp (§4.3). Chưa cấu hình thì `503 pricing_not_configured`. |
| `POST /v1/checkout` `{plan: "pro" \| "pro_x2" \| "pro_x5", email, consent: true, license_key?}` | `consent` là ô đồng ý xử lý email (§10.1); thiếu thì trả `400`. Server lưu thời điểm đồng ý vào đơn. Tạo đơn với `order_code` duy nhất (dải số ở dưới), gọi PayOS `POST /v2/payment-requests` với `expiredAt` = hiện tại + 15 phút. Trả về `order_code`, `checkout_url`, `qr_code` (chuỗi VietQR thô, app tự vẽ thành mã QR), `order_token` (mã ngẫu nhiên để app hỏi trạng thái đơn), `plan`, `amount`, `currency` và `expires_at` của link. Khi gia hạn hay đổi gói thì truyền thêm `license_key` đang có; response có thêm ước tính `license_expires_at` và `converted_days` (số ngày quy đổi, 0 khi cùng gói). |
| `POST /v1/webhooks/{provider}` (PayOS: `/v1/webhooks/payos`) | Kiểm tra chữ ký webhook bằng checksum key, rồi gọi PayOS `GET /v2/payment-requests/{orderCode}` để xác nhận. Chỉ coi đơn là đã trả khi `status` là `PAID`, `amountPaid` ≥ `amount`, và `amount` khớp số tiền của đơn. Đánh dấu đơn đã trả tiền (idempotent theo `order_code`). Cấp license mới, hoặc gia hạn hay đổi gói theo "Mua thêm và đổi gói". Gửi email chứa key. URL webhook được đăng ký và xác nhận qua API `confirm-webhook` của PayOS khi triển khai. Cổng lạ thì trả `404`. |
| `GET /v1/orders/{order_code}`, header `Authorization: Bearer <order_token>` | App hỏi trạng thái đơn. Khi đơn đã trả tiền thì trả thêm `license_key`, `license_plan`, `license_expires_at` (của license lúc hỏi, có thể đã đổi tiếp bởi đơn sau) và `grant_kind` (`new`, `extend` hay `change`). `order_token` đi trong header, không đi trong query, vì URL có thể lọt vào log, lịch sử trình duyệt và proxy. Sai hay thiếu token thì trả `404`, như đơn không tồn tại. |
| `POST /v1/licenses/activate` `{key, device_id_hash, device_label}` | Kích hoạt, tối đa 2 máy mỗi key. Trả về token bản quyền. Nếu `device_id_hash` đã có activation của key này, kể cả activation đã gỡ (ví dụ khi cài lại app), thì dùng lại đúng activation đó: giữ `activation_id`, `activation_created_at` và `quota_epoch`, không mở cửa sổ `quota_fresh` mới, không tốn thêm suất. Activation mới thật mở cửa sổ `quota_fresh` 15 phút (§6.8, "Hạn mức"). Khi đã đủ 2 máy thì trả `409`, kèm danh sách máy đã kích hoạt: `activation_id`, `device_label` và thời điểm `validate` gần nhất. Key đang bị khóa tạm thì trả `423 license_locked` (§10.2). Response gồm `token` và các trường của token mà app cần đọc: `activation_id`, `activation_created_at`, `plan`, `expires_at`, `cycle_anchor`, `quota_minutes_per_cycle`, `quota_epoch`, `quota_fresh`, `refresh_before`. Chưa cấu hình `PLANS` thì `503 pricing_not_configured`. |
| `POST /v1/licenses/validate` `{key, activation_id}` | Trả về token mới nếu license còn hiệu lực, cùng các trường như `activate`. Token mang gói, hạn và hạn mức hiện tại của license. Chưa cấu hình `PLANS` thì `503 pricing_not_configured`. |
| `POST /v1/licenses/deactivate` `{key, activation_id}` | Gỡ kích hoạt để chuyển máy. Gọi được từ chính máy đó, hoặc từ máy mới khi key đã đủ 2 máy (gỡ từ xa). Mỗi lần gỡ tính vào luật khóa tạm ở §10.2. **Gỡ không xóa dòng activation**, chỉ đánh dấu đã gỡ và trả lại suất, để kích hoạt lại cùng máy dùng lại đúng activation đó. |
| `POST /v1/licenses/recover` `{email}` | Gửi lại mọi key còn hiệu lực của email này vào chính email đó. Luôn trả `200`, để không lộ email nào có key. Server tra và gửi thư sau khi đã trả lời, để thời gian phản hồi cũng không lộ. Email không có key thì không gửi gì. Có giới hạn tần suất (§10.2). |

- **Trạng thái đơn:**
  - theo trạng thái của PayOS: `pending`, `processing`, `paid`, `underpaid`, `cancelled`, `expired`, `failed`. `PAID` mà thiếu tiền thì coi là `underpaid`;
  - của server, không phải của PayOS: `paid_needs_review` và `refunded` (dưới đây).
  - Webhook gửi lại, đối soát hay cấp tay không bao giờ áp lại đơn đã ở `paid`, `paid_needs_review` hay `refunded`.
- **License đã bị thu hồi mà nhận được tiền** của một đơn gia hạn hay đổi gói:
  - server không áp đơn. Đơn chuyển sang `paid_needs_review`, server tạo cảnh báo `order_needs_review` cho người vận hành (§10.2);
  - `GET /v1/orders` trả `status: "paid_needs_review"`, không có key; app báo "đã nhận tiền, đang chờ hỗ trợ xử lý" kèm cách liên hệ;
  - admin xử lý bằng thao tác `resolve` ("Công cụ hỗ trợ" bên dưới). Sau đó đơn thành `paid` (cấp key mới) hoặc `refunded` (đã hoàn tiền).
- **Dải số đơn theo môi trường:**
  - staging dùng `order_code` từ 1 tới 999.999; production từ 1.000.001. Hai môi trường không trùng số, kể cả khi dùng chung một kênh PayOS;
  - trần là 9.999.999, để mô tả đơn `AT<order_code>` (`AT` cộng tối đa 7 chữ số) không quá 9 ký tự (§14, giả định 7). Vượt trần thì checkout trả `503`, không gọi PayOS.

**Gửi email:** qua Resend (API HTTP, gọi từ Worker), sau interface `EmailProvider` để đổi dịch vụ được. Khóa API của Resend là secret của Worker. Tên miền gửi phải được xác thực (SPF, DKIM).
- Email là văn bản thuần, song ngữ vi/en.
- Lỗi gửi email không chặn việc cấp key: key vẫn lấy được qua `GET /v1/orders`, `recover` hoặc admin.
- Email mua hàng có idempotency key theo đơn, nên gửi lại không bao giờ thành hai thư.
- **Phân loại lỗi của Resend:**
  - Chỉ `400` và `422` (thư sai dạng, địa chỉ nhận không hợp lệ) là lỗi vĩnh viễn: thôi gửi.
  - Mọi lỗi khác là lỗi tạm: `401`, `403` (khóa API bị khóa, tên miền chưa xác thực: sửa cấu hình xong là gửi được), `409` (hai lượt gửi chồng nhau), `429`, `5xx` và lỗi mạng.
  - Lỗi tạm thì cron gửi lại, giãn dần: sau 5 phút, 15 phút, 1 giờ, rồi mỗi 6 giờ, trong 24 giờ sau khi trả tiền.
  - Cảnh báo `email_failed` cho người vận hành chỉ tạo ở lần lỗi đầu của mỗi đơn (§10.2).

**Công cụ hỗ trợ:** các endpoint `/admin/*` chạy ở một **Worker admin riêng**, cả Worker đặt sau Cloudflare Access; Worker API không có `/admin`. Worker admin tự kiểm lại danh tính do Access cấp, thiếu thì từ chối. Chỉ người vận hành dùng được. Các việc:
- Tra cứu theo email hoặc `order_code`, gửi lại key.
- Mở khóa key bị khóa tạm (§10.2).
- Cấp hoặc gia hạn tay, ví dụ khi khách chuyển thiếu rồi chuyển bù. Gia hạn tay một license **đã hết hạn** thì đặt lại `cycle_anchor` và mở cửa sổ `quota_fresh`, như khi mua thêm cùng gói (§6.8, "Mua thêm và đổi gói").
- **Xử lý đơn `paid_needs_review`:** `POST /admin/orders/{order_code}/resolve`, cần `note`. `action` nhận một trong hai giá trị:
  - `grant_new_license`: cấp một license mới theo gói của đơn (key mới, 30 ngày từ lúc thao tác), gửi thư chứa key; license đã thu hồi giữ nguyên. Đơn thành `paid`;
  - `refunded`: ghi nhận là đã hoàn tiền ở bên ngoài hệ thống. Đơn thành `refunded`.
- Gỡ activation, thu hồi key. Admin gỡ activation cũng chỉ đánh dấu đã gỡ, không xóa dòng activation, giống người dùng tự gỡ.
- **Reset hạn mức của máy:** tăng `quota_epoch` của một activation. Ở lần `validate` sau, máy nhận epoch mới (cửa sổ `quota_fresh` 15 phút tính từ token đầu tiên cấp sau khi tăng), nên bắt đầu bộ đếm mới (§6.8, "Hạn mức"). Chỉ làm khi khách liên hệ, ví dụ khi máy mất bản ghi bộ đếm.
- **Xóa hoặc ẩn danh dữ liệu cá nhân theo email** (§10.1). Thao tác này chỉ chạy khi người vận hành tự gọi, ví dụ khi khách yêu cầu xóa; không bao giờ chạy tự động.
- **Ký thử một token bằng khóa dự phòng** (ô không đang ký, §10.2), để kiểm khóa công khai tương ứng trong `server/keys/public-keys.json`, cũng là khóa build sẵn vào app, khớp khóa riêng. Token ký thử hết hạn ngay lúc ký và không gắn máy nào, nên không dùng được làm bản quyền.
- Worker admin **không giữ khóa nào**: bảng gói và việc ký thử lấy từ Worker API qua service binding (RPC `AdminRpc`, §12).
- Đăng ký URL webhook với PayOS (`confirm-webhook`).

Mọi thao tác đều được ghi nhật ký, kể cả tra cứu.

**Chữ ký khi tạo link thanh toán:** theo tài liệu PayOS, ký HMAC-SHA256 bằng checksum key trên chuỗi các trường `amount`, `cancelUrl`, `description`, `orderCode`, `returnUrl` xếp theo thứ tự chữ cái.

**Token bản quyền:**
- Ký bằng Ed25519. App build sẵn hai khóa công khai, khóa đang dùng và khóa dự phòng (§10.2), nên kiểm tra được token ngay cả khi offline.
- Token gồm:
  - `kid`: mã của khóa đã ký token (§10.2);
  - `license_id`, `activation_id`, `device_id_hash`;
  - `activation_created_at`: lúc activation này được tạo, để hiển thị và hỗ trợ;
  - `quota_epoch`: số nguyên của activation, bắt đầu từ 0, tăng khi admin reset hạn mức của máy;
  - `quota_fresh`: `true` cho mọi token cấp trong vòng 15 phút kể từ mốc gần nhất trong ba mốc của "Cửa sổ `quota_fresh`" (§6.8, "Hạn mức"); ngoài cửa sổ đó là `false`. App chỉ tin cờ này trong response vừa nhận (§6.8, "Hạn mức"). `activation_created_at` không dùng cho luật hạn mức, chỉ để hiển thị và hỗ trợ;
  - `plan`: mã gói trả phí, `pro`, `pro_x2` hoặc `pro_x5`;
  - `expires_at`;
  - `cycle_anchor`: mốc tính chu kỳ hạn mức 30 ngày ("Hạn mức" bên dưới);
  - `quota_minutes_per_cycle`: hạn mức mỗi chu kỳ, tính bằng phút (Professional 1800, X2 6000); `null` là không giới hạn (X5);
  - `issued_at`, theo giờ của server, và `refresh_before` (= `issued_at` + 14 ngày).
- `device_id_hash` là mã băm SHA-256 của ID phần cứng: IOPlatformUUID trên macOS, MachineGuid trên Windows.
- Quá `refresh_before` mà vẫn chưa làm mới được token (ví dụ vì offline lâu) thì app về Free.
- Quá `expires_at` thì app gọi `validate` trước, nếu có mạng, vì key có thể đã được gia hạn từ máy khác. App chỉ về Free và nhắc gia hạn khi server xác nhận chưa gia hạn, hoặc khi không có mạng.

**Mua ngay trong app:**
1. Người dùng mở màn hình "Nâng cấp" (§4.3), chọn gói, nhập email, tick ô đồng ý.
2. App **hiện mã VietQR ngay trong app**, tự vẽ từ chuỗi `qr_code`, kèm nút mở trang thanh toán của PayOS.
3. Người dùng quét mã bằng app ngân hàng.
4. App hỏi trạng thái đơn mỗi 3 giây, tối đa 15 phút, bằng thời hạn của link thanh toán. Khi đơn đã trả tiền, app **tự kích hoạt trên máy đang dùng**. Với đơn gia hạn hay đổi gói, app gọi `validate` để lấy token có gói và `expires_at` mới, thay vì gọi `activate`.
5. Nếu app bị đóng khi đơn chưa được xác nhận, lần mở tiếp theo app hỏi lại đơn đó (app lưu `order_code` và `order_token`).
6. Key cũng được gửi qua email, để kích hoạt máy thứ hai hoặc cài lại máy.

**Hạn mức:**
- **Đếm riêng trên từng máy.** Mỗi máy kích hoạt có đủ hạn mức của gói; hai máy của cùng một key không chia chung. Server không theo dõi số phút đã dùng.
- **Cách đếm phút**, áp cho mọi gói:
  - Phút tính bằng **độ dài tiếng nói** `speech_ms` của từng đoạn (§6.3), không gồm phần đệm. Đoạn gộp ở hàng đợi (§7) cộng `speech_ms` của từng đoạn con, không tính khoảng nghỉ ở giữa.
  - Chỉ tính đoạn đã chép lời, **có ngôn ngữ khác ngôn ngữ đích**, và đã được dịch xong: bộ đếm cộng phút khi phụ đề chuyển sang `done`. Mỗi đoạn tính một lần, kể cả khi câu được dịch lại sau khi ghép (§6.3) hay gộp (§7).
  - Không tính đoạn cùng ngôn ngữ đích (`same_lang`), đoạn bị bỏ (`dropped`), đoạn bị lọc (§6.4), đoạn không được dịch (`skipped`, `failed`), hay lúc im lặng.
  - Vì vậy chép lời câu đã là ngôn ngữ đích là miễn phí. Đây là chủ ý: app chỉ tính tiền phần dịch.
- **Chu kỳ của Free:** theo ngày.
  - Reset lúc 00:00 theo giờ máy, nhưng chỉ khi ngày đã tăng so với lần reset trước **và** đã qua ít nhất 20 giờ theo "đồng hồ thật" kể từ lần reset trước. Vì vậy đổi múi giờ qua lại không reset được hạn mức.
  - **"Đồng hồ thật":** thời gian đã qua kể từ lần reset trước là giá trị lớn nhất trong ba số:
    1. thời gian đơn điệu cộng dồn trong lúc app chạy, lưu trong kho khóa;
    2. hiệu hai header `Date` của server: `Date` mới nhất trừ `Date` gần nhất trước lần reset. Chỉ dùng số này khi có cả `Date` từ trước lần reset lẫn `Date` sau đó. Header lấy từ mọi response của server của app (license server, CDN của manifest và bản cập nhật);
    3. hiệu giờ máy: giờ máy hiện tại trừ giờ máy lúc reset. Số này chỉ được tính khi giờ máy hiện tại không nhỏ hơn mốc thời gian lớn nhất từng thấy quá 10 phút, cùng dung sai với §10.2.
  - Vì vậy khi offline, Free dùng giờ máy. Chỉnh giờ tới trước thì lách được (rủi ro chấp nhận, §10.2); chỉnh lùi thì số 3 không được tính, nên vẫn bị chặn.
  - Bộ đếm Free của ngày luôn cộng cả số phút dịch lúc đang ở gói trả phí. Ngày nào hết hạn mức của gói trả phí thì Free của ngày đó cũng coi là đã hết. Nhờ vậy gói trả phí hết hạn hay hết hạn mức giữa ngày không mở thêm 10 phút Free.
- **Chu kỳ của gói trả phí:** 30 ngày tính từ `cycle_anchor`, không theo tháng dương lịch.
  - Số thứ tự chu kỳ `n = floor((issued_at − cycle_anchor) / 30 ngày)`, với `issued_at` của **token mới nhất** (giờ server), không theo giờ máy. Chu kỳ `n` bắt đầu lúc `cycle_anchor + n × 30 ngày` ("mốc đầu chu kỳ").
  - Nhờ vậy `n` không bao giờ giảm, và chỉnh đồng hồ máy tới hay lùi đều không mở được chu kỳ mới. Giờ máy chỉ dùng để biết khi nào gọi `validate`.
  - Giờ máy qua mốc đầu chu kỳ kế tiếp thì app gọi `validate` ngay, nếu có mạng. Token mới mà `issued_at` vẫn trước mốc (giờ máy chạy nhanh) thì app hẹn `validate` lại sau (mốc − `issued_at`) + 1 phút.
  - Offline lúc qua mốc thì app dùng tiếp bộ đếm của chu kỳ cũ, và báo cần có mạng để mở hạn mức mới (§9).
  - **Chu kỳ cuối ngắn hơn 30 ngày** (khi `expires_at` đến trước mốc đầu chu kỳ kế tiếp, ví dụ sau khi đổi gói có ngày quy đổi): hạn mức của chu kỳ đó là `ceil(quota_minutes_per_cycle × số_ngày / 30)`, với `số_ngày` là số ngày từ mốc đầu chu kỳ tới `expires_at`, làm tròn lên. App tự tính từ `expires_at` của token; gia hạn làm `expires_at` lùi ra thì app tính lại.
- **Lưu bộ đếm:** trong kho khóa của hệ điều hành (Keychain trên macOS, Credential Manager trên Windows; §10.2).
- **Free** (không có token, nên không dùng `quota_fresh` hay bản ghi đánh dấu):
  - Một bộ đếm theo ngày.
  - Bắt đầu từ 0 ở lần đầu chạy app (chưa có dữ liệu nào: chưa có file cài đặt, chưa có mục nào trong kho khóa), và ở mỗi lần reset ngày hợp lệ (luật "Chu kỳ của Free" ở trên).
  - **Mất bản ghi:** không còn bộ đếm của ngày trong khi app đã có dữ liệu từ trước (ví dụ file cài đặt). Khi đó coi như đã dùng hết 10 phút của ngày đó.
- **Gói trả phí:**
  - Khóa của bộ đếm là (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`).
    - Dùng mốc đầu chu kỳ thay cho số thứ tự, vì đặt lại `cycle_anchor` (đổi gói, mua lại sau khi hết hạn) làm chu kỳ đếm lại từ 0: chu kỳ đầu sau đó không được dùng chung bộ đếm với chu kỳ đầu trước đó.
    - Có `activation_id` để bộ đếm của activation cũ trên cùng máy không lẫn với activation hiện tại. Ví dụ: `device_id_hash` của máy đổi (như khi cài lại hệ điều hành), nên server tạo activation khác cho cùng một máy.
    - `quota_epoch` là số nguyên của activation, nằm trong token. Admin tăng số này bằng thao tác "reset hạn mức của máy" (§6.8, "Công cụ hỗ trợ").
  - **Bản ghi đánh dấu:** app giữ trong kho khóa một bản ghi "đã từng chạy license này trên máy này", gồm (`license_id`, `activation_id`, mốc đầu chu kỳ gần nhất đã có bộ đếm, `quota_epoch` của bộ đếm đó).
  - **Thứ tự ghi:** ghi bộ đếm trước, bản ghi đánh dấu sau. Lý do: app bị tắt giữa hai lần ghi thì còn bộ đếm mà chưa có bản ghi đánh dấu mới, nên lần sau vẫn đọc được bộ đếm. Ghi theo thứ tự ngược lại thì có thể còn bản ghi đánh dấu mà không có bộ đếm, và app sẽ coi nhầm là mất bản ghi.
  - **Cửa sổ `quota_fresh`:** server đặt `quota_fresh: true` cho **mọi** token cấp trong vòng 15 phút kể từ mốc gần nhất trong ba mốc. Ngoài cửa sổ này, token có `quota_fresh: false`. Ba mốc, server lưu riêng từng mốc:
    - lúc tạo activation;
    - lúc server cấp **token đầu tiên sau khi admin tăng `quota_epoch`**, không phải lúc admin bấm. Server ghi thời điểm này khi cấp token đó. Nhờ vậy máy nhận epoch mới muộn, kể cả máy đã xóa sạch dữ liệu, vẫn có cửa sổ `fresh`;
    - lúc server áp việc đặt lại `cycle_anchor` (đổi gói, mua lại sau khi hết hạn), tức lúc xử lý đơn. Không tính từ giá trị `cycle_anchor`, vì giá trị đó là `transactionDateTime` và có thể sớm hơn nhiều khi webhook đến chậm hay đối soát muộn.
    - Nhờ vậy mất response trên đường truyền, hay tắt app trước khi ghi bộ đếm, không làm khách thật bị khóa: lần `validate` hay `activate` sau trong 15 phút vẫn nhận token `fresh`.
    - **App chỉ tin `quota_fresh` trong response vừa nhận từ server.** Token đọc lại từ kho khóa luôn được coi là `quota_fresh: false`, để cờ này không dùng lại được sau khi hết cửa sổ.
  - **Bắt đầu bộ đếm từ 0** chỉ trong ba trường hợp. App ghi ngay bộ đếm, rồi bản ghi đánh dấu.
    - response vừa nhận có token `quota_fresh: true`, và chưa có bộ đếm của khóa hiện tại;
    - `quota_epoch` của token lớn hơn `quota_epoch` trong bản ghi đánh dấu của activation này. Luật này an toàn vì chỉ admin tăng được epoch;
    - sang chu kỳ mới, khi bản ghi đánh dấu của activation này có mốc cũ hơn mốc hiện tại.
  - **Thứ tự ưu tiên:** trong cửa sổ `fresh`, luật "bắt đầu từ 0" đứng trước luật "mất bản ghi". Nghĩa là token `fresh` vừa nhận thì app bắt đầu từ 0, kể cả khi bản ghi đánh dấu nói đã có bộ đếm mà bộ đếm không còn (rủi ro chấp nhận ở §10.2).
  - **Mất bản ghi:** luật chặt, coi như **đã dùng hết hạn mức của cả chu kỳ hiện tại**. App coi là mất khi:
    - có bản ghi đánh dấu của đúng activation, đúng chu kỳ hiện tại và **đúng `quota_epoch` của token**, mà bộ đếm đó không còn;
    - token không `fresh`, và không có bản ghi đánh dấu lẫn bộ đếm nào của **activation này**. Ví dụ: quá 15 phút sau khi kích hoạt, xóa sạch dữ liệu rồi nhập lại key trên cùng máy; activation được dùng lại nên không mở cửa sổ `fresh` mới (§6.8, `activate`).
  - **Đường cứu cho khách thật:** khách liên hệ hỗ trợ; người vận hành dùng thao tác "reset hạn mức của máy" (tăng `quota_epoch`). Máy còn bản ghi đánh dấu thì bắt đầu từ 0 nhờ luật epoch lớn hơn; máy đã xóa sạch dữ liệu thì nhờ cửa sổ `fresh` tính từ token đầu tiên sau khi tăng. Thao tác này chỉ người vận hành làm, và được ghi nhật ký.
- **Gỡ máy rồi kích hoạt máy khác không chuyển bộ đếm.** Máy mới có activation mới, nhận token `quota_fresh`, nên có bộ đếm riêng bắt đầu từ 0 ở chu kỳ hiện tại; bộ đếm của máy cũ ở lại máy cũ. Kích hoạt lại chính máy cũ thì dùng lại đúng activation cũ (không mở cửa sổ `fresh` mới), và dùng tiếp bộ đếm cũ trong kho khóa (bộ đếm không mất khi gỡ app, §4.3, A6).
  - Vì vậy xoay một key qua nhiều máy cho thêm hạn mức. Luật khóa tạm (§10.2) chỉ giới hạn được phần nào (tối đa khoảng 3 lần đổi máy mỗi 30 ngày). MVP chấp nhận rủi ro này (§10.2).
- **Khi chạm hạn mức:**
  - Hạn mức còn 0 thì không cho bắt đầu phiên.
  - Đang dịch mà chạm hạn mức thì dừng phiên, với lý do `quota_exhausted`: bỏ các đoạn và câu còn trong hàng đợi, chỉ dịch xong câu đang dịch.
  - App báo thời điểm hạn mức được reset, kèm nút nâng gói (§4.2). Không chạy tiếp ở chế độ "chỉ chép lời".
  - Các tính năng Pro khác (lịch sử, từ điển, xuất file) vẫn dùng được khi gói còn hạn.
- MVP chấp nhận rủi ro bị lách ở mức cơ bản; các cách lách đã chặn và rủi ro chấp nhận ghi ở §10.2.

**Các quy tắc khác:**
- **Gia hạn:** PayOS không tự trừ tiền định kỳ. App nhắc trước 7 ngày và khi đã hết hạn. Nút "Gia hạn" mở màn hình Nâng cấp, tạo đơn mới gắn với key hiện có, cùng gói hoặc đổi gói.
- **Kiểm tra định kỳ:** lúc khởi động và sau đó mỗi giờ, app xem lần `validate` thành công gần nhất đã quá 24 giờ chưa. Nếu đã quá và có mạng thì gọi `validate` để lấy token mới. Phải kiểm tra cả khi app đang chạy, vì app thường nằm ở khay hệ thống nhiều ngày liền. Nếu chỉ kiểm tra lúc khởi động, quá `refresh_before` app sẽ tự về Free dù vẫn có mạng.
- **Máy bị gỡ từ xa** sẽ về Free ở lần `validate` kế tiếp. Nếu máy đó đang offline thì token cũ vẫn dùng được tới `refresh_before`, tối đa 14 ngày.
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
- `experimental.translationContext`: cờ thử nghiệm đưa câu trước vào làm ngữ cảnh, mặc định tắt (§6.5)

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
  - Mục tiêu dung lượng bộ cài ≤ 60 MB, vì model tải riêng.
    - macOS, phần tiến trình phụ (S3, `s3_size_macos-arm64.json`): `asr-worker`, `llama-server` và các `.dylib` của nó là 27,5 MB chưa nén, 7,7 MB sau khi nén LZMA (11,3 MB với zlib).
    - Windows: chờ số đo ở kế hoạch 03, Task 15, Step 3 (`results/s3_size_windows-x64.json`). Bộ cài Windows có hai bản `asr-worker` và các backend ggml của `llama-server`. Lúc lập kế hoạch, riêng `llama-server` và các DLL đã là 86 MB chưa nén, 13,7 MB sau khi nén LZMA.
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
  - `llama-server`, kèm thư viện backend của ggml trên Windows. Trên macOS, bản chính thức cũng link động và kèm các file `.dylib` (§6.12).

### 6.12 Quy tắc chọn phiên bản thư viện

- **Luôn dùng bản ổn định mới nhất** của công nghệ và thư viện bên thứ ba tại thời điểm cài. Không dùng bản beta, rc hay nightly, trừ khi bắt buộc; khi đó phải ghi rõ lý do.
- **Luật tuổi phát hành:** "mới nhất" là bản ổn định mới nhất **đã ra được ít nhất 1 ngày** lúc cài. Bản ra chưa đủ 1 ngày thì dùng bản ngay trước đó, và ghi lại trong kế hoạch. Luật áp cho cả gói npm lẫn crate Rust.
  - npm: pnpm 12 tự áp luật này (`minimumReleaseAge` mặc định 1 ngày). **Không bao giờ commit `minimumReleaseAgeExclude`**; nếu `pnpm add` tự ghi mục này vào `pnpm-workspace.yaml` thì xóa đi và chọn bản cũ hơn.
  - Crate: cargo không có luật này, và `Cargo.toml` dùng `^` nên `cargo update` có thể kéo bản vừa ra. Vì vậy phải xem ngày phát hành trên crates.io trước khi cài hay nâng, và khi bản mới nhất chưa đủ 1 ngày thì khóa bản trước đó trong `Cargo.lock` (`cargo update -p <crate> --precise <bản>`).
- **Trước khi chốt một phiên bản, phải kiểm tra kỹ tương thích và xung đột:**
  - Đọc release notes và changelog, xem có thay đổi phá vỡ tương thích (breaking change) nào ảnh hưởng tới app không.
  - Kiểm tra peer dependency và yêu cầu về phiên bản. Ví dụ:
    - Thư viện React phải hỗ trợ React 19.
    - Mọi plugin Tauri phải cùng dòng phiên bản với Tauri core.
    - Crate Rust phải chạy được với bản Rust stable đang dùng (MSRV).
    - Node.js phải đúng phiên bản Vite yêu cầu.
  - Trong cùng một tiến trình, không được có hai bản của cùng một thư viện gốc, và không được trùng symbol.
    - Riêng ggml, app cố ý có hai bản nhưng ở hai tiến trình phụ riêng (§5): whisper.cpp trong `asr-worker`, llama.cpp trong `llama-server`. Tiến trình chính không link ggml.
    - `asr-worker` link tĩnh whisper.cpp và tắt nạp backend động (`GGML_BACKEND_DL`). Nhờ vậy nó không nạp thư viện ggml nào từ đĩa, nên không nạp nhầm thư viện ggml của `llama-server` nằm cùng thư mục. Máy Windows không có Vulkan dùng bản `asr-worker-cpu` (§6.4). Trên Windows, chờ kết quả kế hoạch 03, Task 14 và 16: `dumpbin /dependents` của hai bản `asr-worker` không có DLL ggml nào, và `asr-worker-cpu` chạy được trên máy không có Vulkan.
    - Vì link tĩnh, `asr-worker` không tự chọn được biến thể CPU lúc chạy. Phải build với `GGML_NATIVE=OFF` và mức CPU cố định. Nếu không, bản build trên máy CI đời mới có thể crash trên máy người dùng vì gặp lệnh CPU không hỗ trợ.
      - Mức CPU đặt ở `.cargo/config.toml`, với `force = true` để biến môi trường của shell hay CI không ghi đè được: x64 bật AVX, AVX2, BMI2, FMA, F16C, không bật AVX-512; arm64 dùng `armv8.4-a+fp16`, tức mức Apple M1 (không i8mm, không SME).
      - Bản build native trên M4 Pro bật `MATMUL_INT8` và `SME`, nên có thể crash trên M1. Với mức cố định, `system_info` của `asr-worker` chỉ còn `NEON`, `ARM_FMA`, `FP16_VA`, `DOTPROD`.
      - Sửa file này thì phải xóa bản build cũ của `whisper-rs-sys` ở cả hai profile, vì build script của nó không tự chạy lại.
    - `llama-server` trên Windows build với `GGML_BACKEND_DL` và `GGML_CPU_ALL_VARIANTS`: có Vulkan thì nạp backend Vulkan, và tự chọn biến thể CPU hợp với máy.
    - `llama-server` chính thức trên macOS link động: `libllama*.dylib` và `libggml*.dylib` nằm cùng thư mục. Giai đoạn 0 dùng bản này. MVP chọn giữa tự build tĩnh (Metal, `GGML_NATIVE=OFF`) và kèm các file `.dylib` (ký cùng Team ID, §10.2).
  - Engine mới phải chạy đúng với model:
    - llama.cpp mới phải nạp và chạy đúng GGUF của Hy-MT2.
    - `whisper-rs` phải đi kèm whisper.cpp có đủ các tính năng cần dùng: `audio_ctx` và API mức thấp để encode và giải mã (§6.4). Bản vá ở `third_party/` phải áp được lên bản mới (§6.4).
  - **Yêu cầu build:** `protoc` (để build `candle-onnx`), CMake (build whisper.cpp), bộ dịch C/C++ (Xcode trên macOS, Visual Studio Build Tools trên Windows), libclang (trên Windows lấy từ LLVM), Vulkan SDK (để build `asr-worker-vulkan`).
  - **Thư viện C runtime trên Windows:** chờ kết quả `dumpbin /dependents` ở kế hoạch 03, Task 14 (`results/s3_windows.md`). Nếu các file `.exe` phụ thuộc `VCRUNTIME140.dll`, MVP chọn giữa link tĩnh CRT (`-C target-feature=+crt-static`) và kèm bộ cài VC++ Redistributable.
- **Sau mỗi lần cài hoặc nâng cấp:**
  - Build lại toàn bộ và chạy hết test.
  - Chạy `cargo audit`, `cargo deny` và `pnpm audit`.
    - `cargo deny` dùng `deny.toml` ở gốc repo. File này có danh sách giấy phép được phép, và luật chỉ `asr-worker` được link `whisper-rs` (§5).
  - Nâng `candle-core` hoặc `candle-onnx` thì chạy thêm test `vad_reference` với `--include-ignored`. Test này so Silero chạy bằng candle với onnxruntime, rồi chạy dài để bắt rò bộ nhớ. Test mặc định bị bỏ qua vì cần các biến `SILERO_VAD_MODEL`, `VAD_TEST_WAV`, `VAD_REF_JSON`; file tham chiếu sinh bằng `bench/phase0/vad/ref_probs.py`.
  - Nếu có đụng tới engine hoặc model thì chạy lại benchmark (§11).
- **Khóa phiên bản:**
  - Commit lockfile (`Cargo.lock`, `pnpm-lock.yaml`), và ghi rõ phiên bản llama.cpp, whisper.cpp đang dùng. Hiện tại:
    - llama.cpp v0.5.0, tức build b11146. Các build `bXXXX` hằng ngày chỉ là prerelease.
    - whisper.cpp 1.8.3, qua `whisper-rs` 0.16.0 và `whisper-rs-sys` 0.15.0, có vá (`third_party/`, §6.4). whisper.cpp mới nhất là 1.9.4, nhưng `whisper-rs` chưa theo kịp.
    - Silero VAD v6.2.3 chạy bằng `candle-onnx` 0.11.0. Không dùng `ort`, vì crate này chỉ có bản 2.0.0-rc.13 (§6.3).
  - Chỉ nâng cấp khi chủ động quyết định, không để phiên bản tự nhảy.
- **Bài học từ benchmark 2026-09-29:** với `transformers` 5.x, MADLAD dịch ra ký tự vô nghĩa, trong khi bản 4.57 chạy đúng. Vì vậy dùng bản mới nhất vẫn phải kiểm chứng bằng test chạy thật.

## 7. Luồng xử lý, đa luồng và chống nghẽn

- **Các luồng và tiến trình:**
  1. Callback thu âm thanh (realtime), ghi vào ring buffer.
  2. Luồng tiền xử lý và VAD.
  3. Luồng nhận dạng: gửi từng đoạn sang `asr-worker` và nhận kết quả.
  4. Luồng dịch: gọi `llama-server` (HTTP stream).
  5. Luồng phụ đề: nơi duy nhất phát sự kiện phụ đề, nên thứ tự `upsert` và `delta` luôn đúng.
  6. Tiến trình phụ `asr-worker`: mỗi lần xử lý một đoạn, chạy trên GPU hoặc CPU.
  7. Tiến trình phụ `llama-server`.
- **Luồng riêng và client đồng bộ, không dùng runtime `tokio`** cho pipeline (chốt ở kế hoạch Giai đoạn 1 · 02a, QĐ1). Lý do:
  - hai client đồng bộ của Giai đoạn 0 đã chạy qua S6;
  - mỗi tiến trình phụ chỉ làm một việc một lúc (`llama-server -np 1`, `asr-worker` đọc tuần tự), nên async không thêm thông lượng;
  - crate `pipeline` không cần runtime nào, nên test chạy không cần Tauri.
  App chỉ dùng runtime của Tauri để đưa việc chặn (bắt đầu phiên, chạy tiến trình phụ) ra khỏi luồng chính, và cho các việc ngoài pipeline: tải model, bản quyền.
- **Hàng đợi đoạn âm thanh (VAD → nhận dạng)** chứa tối đa 3 đoạn.
  - Khi đầy, gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây.
  - Chỉ bỏ đoạn khi độ trễ vượt 20 giây. Đoạn bị bỏ được đánh dấu "[bỏ qua đoạn]" trong bản chép lời (`dropped`, §6.6).
- **Độ trễ** tính bằng thời điểm hiện tại trừ `end_ms` của đoạn đang xử lý. Vượt 6 giây thì hiện chỉ báo "Đang trễ".
- **Hàng đợi dịch** chứa tối đa 3 câu.
  - Khi đầy, gộp các câu liên tiếp cùng ngôn ngữ vào một request. Các phụ đề tương ứng cũng được gộp thành một phụ đề, lấy `start_ms` của câu đầu và `end_ms` của câu cuối.
  - Câu nào đã chờ quá 20 giây thì bỏ qua bước dịch, chỉ hiện câu gốc (`skipped`), để bắt kịp tốc độ nói.
- **Phụ đề gộp** mang id của câu đầu, và trường `replaces` liệt kê id các phụ đề đã gộp vào nó (§6.6).
- **Ngưỡng của pipeline:** mọi ngưỡng của §6.3–§6.5 và mục này (cắt đoạn, ghép câu, lọc, nhận dạng, dịch, hàng đợi, giám sát tiến trình phụ, âm thanh) nằm trong một cấu hình `PipelineConfig`, mặc định là số đã chốt trong spec.
  - Kế hoạch 04 nạp phần muốn đổi từ manifest đã ký (§6.7), nên đổi ngưỡng không cần phát hành lại app.
  - Giá trị vô lý bị từ chối, và app giữ mặc định.
  - `vadEndSilenceMs` của người dùng (§6.9) ghi đè ngưỡng im lặng chốt đoạn.
- **Số đo từng phiên**, lưu trên máy và không gửi đi đâu: thời gian của từng bước (cắt đoạn, nhận dạng, dịch, tổng thể). Xem được trong bảng debug ẩn và trong log để hỗ trợ khi người dùng báo lỗi.

## 8. Hiệu năng và cấu hình máy

| Hạng máy | macOS | Windows | Gói model |
|---|---|---|---|
| Khuyến nghị | Apple Silicon M1 trở lên, RAM 16 GB (riêng M1 cơ bản phải xác nhận ở S6) | Windows 10/11 x64, RAM 16 GB, card đồ họa rời hỗ trợ Vulkan với VRAM riêng ≥ 6 GB (NVIDIA, AMD, Intel Arc) | Chuẩn |
| Tối thiểu | Apple Silicon, RAM 8 GB | RAM 8 GB, CPU 4 nhân có AVX2 | Nhẹ |
| Chưa hỗ trợ trong MVP | Mac chip Intel | ARM64, CPU không có AVX2, RAM < 8 GB | — |

Chờ kết quả S6 trên các máy tham chiếu (§13; kế hoạch 06, Task 8–9, `results/s6_latency.md`) để chốt hạng máy khuyến nghị. M4 Pro, máy đã đo, không phải máy quyết định.

**Chất lượng nhận dạng theo gói** (A4, mốc ở §3.3): gói Nhẹ chép kém rõ ở tiếng Việt (WER 0,225, so với 0,087 của gói Chuẩn), tiếng Nhật (CER 0,131 so với 0,045), tiếng Hàn (0,082 so với 0,041) và tiếng Trung (0,096 so với 0,056). Tiếng Anh gần ngang (0,066 so với 0,054). Khi chọn gói (§4.1, §6.7), app phải ghi chú điều này, và khuyến nghị gói Chuẩn cho người dùng nghe chủ yếu tiếng Việt, Nhật, Hàn, Trung.

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

**Đo được trên Mac M4 Pro** (S6, `bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json`): cấu hình chốt ở §6.4, ghép câu §6.3 bật, 6 session mỗi gói (en, vi, zh, ja, ko và trộn). Mỗi ô là khoảng giữa các session.

| Gói | p50 | p90 | Chữ dịch đầu tiên, p50 | Nhận dạng, p50 | Dịch, p50 |
|---|---|---|---|---|---|
| Chuẩn | 764–1028 ms | 940–1341 ms | 631–686 ms | 229–254 ms | 143–404 ms |
| Nhẹ | 613–844 ms | 725–1142 ms | 517–565 ms | 90–139 ms | 119–281 ms |

- Cả 12 session đạt A2. p50 và p90 dư khoảng gấp đôi (lớn nhất 1028 ms và 1341 ms, so với 2,0 và 3,0 giây); chữ dịch đầu tiên dư ít hơn (lớn nhất 686 ms, so với 1,0 giây).
- Session tiếng Việt dịch sang tiếng Anh; các session khác dịch sang tiếng Việt.
- Trên M4 Pro, cả hai gói chạy bằng GPU (Metal), nên cột "Gói Nhẹ, chỉ CPU" của bảng ngân sách chưa được đo.
- Chờ kết quả S6 trên các máy tham chiếu (kế hoạch 06, Task 8–9, `results/s6_latency.md`).

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
- Trên máy băng thông thấp, dùng Q4_K_M (1,13 GB) cho bước dịch nhưng vẫn giữ whisper turbo. Trên M1 cơ bản, bước dịch khi đó còn khoảng 0,85 giây. Đổi lại, COMET giảm: S7 đo được Anh→Việt gần như không đổi (−0,000), giảm nhiều nhất là 0,015 ở Nhật→Việt và Việt→Trung (giả định 6 ở §14).

**RAM ước tính (RSS), cần kiểm chứng ở mục S6** (M4 Pro đã đo, xem "RAM đo được trên Mac M4 Pro" bên dưới):

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

**RAM đo được trên Mac M4 Pro** (S6, cùng các lượt ở trên), đỉnh của hai tiến trình phụ, chưa tính app và WebView:
- Số trong file JSON tính bằng MiB (1 MiB = 1 048 576 byte).
- Gói Chuẩn: tổng 2909–3012 MiB (khoảng 2,9 GiB). `asr-worker` 780–788 MiB, `llama-server` 2125–2225 MiB.
- Gói Nhẹ: tổng 1861–1917 MiB (khoảng 1,8–1,9 GiB). `asr-worker` 411–418 MiB, `llama-server` 1446–1501 MiB.
- Mỗi tiến trình lấy số lớn hơn giữa RSS và `phys_footprint`. RSS của `llama-server` tính cả trang của file model được mmap, còn `phys_footprint` thì không. Với `asr-worker` thì ngược lại: `phys_footprint` lớn hơn RSS vì có bộ nhớ Metal.
- CPU: 1,8–3,0% của cả máy, vì GPU làm phần nặng. Số này là tổng thời gian CPU của `asr-worker`, `llama-server` và `latency-bench` (đóng vai tiến trình chính) chia cho thời gian thực và cho 12 lõi, không phải CPU đo cho toàn hệ thống. Riêng `llama-server` dùng 17–31% của một lõi.
- Chờ kết quả S6 trên các máy tham chiếu (kế hoạch 06, Task 8–9), nhất là máy chạy bằng CPU.

**VRAM ước tính trên Windows (card rời), cần kiểm chứng ở S6:**

| Thành phần | Gói Chuẩn | Gói Nhẹ |
|---|---|---|
| `asr-worker` (whisper, gồm buffer tính toán) | 1–1,5 GB (turbo) | khoảng 0,4 GB (small) |
| `llama-server` (trọng số, KV cache khoảng 0,13 GB, buffer tính toán) | 2,2–2,5 GB (Q8_0) | khoảng 1,5 GB (Q4_K_M) |
| Phần chừa cho app họp, trình duyệt và Windows (`--fit` mặc định chừa 1 GiB) | khoảng 1 GB | khoảng 1 GB |
| **Tổng** | **khoảng 4,2–5 GB, nên ngưỡng đề xuất là 6 GB** | **khoảng 2,9 GB, vừa card 4 GB** |

Chờ kết quả S6 trên Windows để có VRAM đo thật (kế hoạch 06, Task 8, file `vram-<máy>-<gói>.csv`).

**Mục tiêu tải máy:** CPU trung bình ≤ 30% trên máy khuyến nghị khi người trong cuộc họp nói liên tục, để app họp vẫn chạy mượt.

## 9. Xử lý lỗi

| Tình huống | Cách phát hiện | Cách xử lý |
|---|---|---|
| macOS chưa cấp quyền ghi âm thanh hệ thống | Tạo tap bị lỗi, hoặc buffer toàn im lặng kèm trạng thái quyền | Hiện màn hình hướng dẫn, có nút mở System Settings |
| Đang dịch mà hơn 60 giây không có âm thanh vào | Mức RMS của luồng âm thanh, kể cả phần im lặng được chèn khi Windows không trả gói dữ liệu (§6.1) | Thanh phụ đề hiện "Không nghe thấy âm thanh" kèm gợi ý cách sửa |
| Thiết bị phát thay đổi (cắm tai nghe, kết nối Bluetooth) | Hỏi định kỳ 500 ms chữ ký thiết bị phát mặc định; luồng thu chết (`AudioSource::failed`) (§6.1) | Tự khởi tạo lại việc thu âm trong ≤ 2 giây |
| Model thiếu hoặc hỏng | Lúc khởi động chỉ kiểm tra có file và đúng kích thước, vì băm 2,5 GB mỗi lần khởi động tốn vài giây. SHA-256 đầy đủ chỉ kiểm sau khi tải xong (§6.7), và kiểm lại khi nạp model lỗi. | Đề nghị tải lại |
| `asr-worker` không chạy hoặc bị crash | Mã thoát, hoặc không trả kết quả trong thời gian chờ | Tự khởi động lại theo §6.4, gửi lại đoạn đang xử lý một lần. Crash 2 lần liên tiếp khi dùng GPU thì chuyển sang CPU. Quá 5 lần trong 10 phút thì dừng dịch và báo lỗi. |
| `llama-server` không chạy hoặc bị crash | Mã thoát, hoặc `/health` báo lỗi | Tự khởi động lại theo §6.5. Quá giới hạn thì báo lỗi, chỉ hiện câu gốc. |
| GPU khởi tạo lỗi, hoặc máy Windows không có Vulkan | Log của backend; `asr-worker-vulkan` không khởi động được (§6.4) | Chạy `asr-worker-cpu`, và `llama-server` chạy bằng CPU. Báo "Đang chạy bằng CPU (chậm hơn)". |
| Thiếu RAM hoặc VRAM | RAM trống thấp, hoặc tiến trình phụ báo hết bộ nhớ, kể cả bộ nhớ GPU | Đề xuất chuyển sang gói Nhẹ |
| Trễ dồn lại | Độ trễ > 6 giây | Hiện chỉ báo và áp dụng chính sách ở §7 |
| Hết hạn mức (Free: 10 phút hôm nay; Professional, X2: hạn mức của chu kỳ) | Bộ đếm phút (§6.8, "Hạn mức") | Dừng phiên với lý do `quota_exhausted`. Báo đã hết hạn mức và thời điểm reset, kèm nút nâng gói (§4.2) |
| Giờ máy qua mốc chu kỳ mới của gói trả phí khi đang offline | Giờ máy qua mốc, `validate` lỗi mạng | Dùng tiếp bộ đếm của chu kỳ cũ; báo "Cần kết nối mạng để mở hạn mức của chu kỳ mới". Có mạng thì gọi `validate` ngay |
| Mất bản ghi bộ đếm (§6.8) | Luật "Mất bản ghi" của Free và của gói trả phí ở §6.8 | Coi như đã hết hạn mức của ngày hoặc của chu kỳ. Báo rõ lý do, hướng dẫn liên hệ hỗ trợ để người vận hành reset hạn mức của máy |
| License không hợp lệ, hết hạn hoặc bị thu hồi | Kết quả `validate` | Về Free, báo rõ lý do |
| Mất mạng đúng lúc cần kiểm tra license | Lỗi mạng | Giữ gói trả phí trong 14 ngày ân hạn |
| Key bị khóa tạm vì gỡ máy quá nhiều | `activate` trả `423 license_locked` | Báo key bị khóa tạm, hướng dẫn liên hệ hỗ trợ (§10.2). Máy đang kích hoạt vẫn dùng được |
| Server trả `429` (giới hạn tần suất, hoặc IP bị chặn tạm) | Mã `429` kèm `Retry-After` | Báo "thử lại sau", không thử lại liên tục. `429` ở `activate` không có nghĩa là key sai (§10.2) |
| Key đã kích hoạt đủ 2 máy | `activate` trả `409` | Hiện danh sách máy đã kích hoạt (tên máy, lần dùng gần nhất), cho gỡ một máy rồi kích hoạt máy đang dùng. Vượt giới hạn gỡ ở §10.2 thì hướng dẫn liên hệ hỗ trợ. |
| Khách đã chuyển khoản nhưng webhook của PayOS đến chậm hoặc bị mất | App vẫn đang chờ; server có đơn chưa xác nhận | App hỏi trạng thái đơn mỗi 3 giây. Server tự đối soát bằng `GET /v2/payment-requests/{id}`, theo lịch ở dưới bảng. |
| Webhook bị gửi trùng | Trùng `order_code` | Xử lý idempotent: mỗi đơn chỉ cấp, gia hạn hoặc đổi gói license một lần |
| Khách chuyển thiếu tiền, hoặc link thanh toán hết hạn | `amountPaid` < `amount`, hoặc trạng thái đơn trả về từ PayOS | Không cấp license, hiện hướng dẫn liên hệ hỗ trợ. Hỗ trợ cấp tay khi khách đã chuyển bù (§6.8). |
| Tải model thất bại | Lỗi HTTP hoặc sai SHA-256 | Thử lại 3 lần, cho phép tải tiếp sau |
| Bản dịch lỗi (quá dài, có kèm lời giải thích) | Tỉ lệ token theo từng cặp ngôn ngữ (§6.5), mẫu nhận dạng | Cắt stream, thử lại một lần với repeat penalty cao hơn, sau đó hiện câu gốc |

**Lịch đối soát đơn** (Cron Trigger chạy mỗi 5 phút):
- Xét các đơn `pending`, `processing` và `underpaid` (khách có thể chuyển bù) tạo trong 24 giờ qua.
- Trong giờ đầu kể từ khi tạo đơn: hỏi PayOS ở mỗi lần cron chạy, hai lần hỏi cách nhau ít nhất 4 phút.
- Sau giờ đầu: mỗi giờ một lần.
- Quá 24 giờ: đơn `pending` hay `processing` coi là hết hạn; đơn `underpaid` giữ nguyên để hỗ trợ xử lý.
- Mỗi lần cron hỏi tối đa 50 đơn, vì PayOS có thể trả `429`.
- Lý do giãn lịch: link chỉ sống 15 phút. Nếu hỏi mọi đơn bỏ dở mỗi 5 phút suốt 24 giờ thì mỗi đơn tốn 288 lần gọi PayOS.

## 10. Quyền riêng tư, bảo mật, pháp lý

### 10.1 Quyền riêng tư và pháp lý

- **Âm thanh** chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng.
- **App chỉ kết nối mạng để:** tải manifest và model, kiểm tra cập nhật, gọi license server của sản phẩm (khi mua, kích hoạt, kiểm tra bản quyền). MVP **không có analytics và không gửi báo cáo crash**. Log nằm trên máy; khi cần hỗ trợ, người dùng tự gửi.
- **Tiến trình phụ:** `llama-server` chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy, truyền qua biến môi trường (§6.5; trạng thái đích cho MVP, Giai đoạn 0 còn dùng `--api-key`). `asr-worker` không mở cổng mạng nào, chỉ giao tiếp qua stdin/stdout.
- **Khóa API của PayOS** (client id, api key, checksum key) chỉ nằm trên license server, được lưu dưới dạng secret, không bao giờ có trong app.
- **Lịch sử chép lời** mặc định tắt, chỉ lưu trên máy, xóa toàn bộ được bằng một nút.
- **Luật Bảo vệ dữ liệu cá nhân 2025 (Việt Nam):**
  - App không có tài khoản đăng nhập.
  - License server chỉ lưu email (để gửi và khôi phục key), thông tin đơn hàng, license, mã băm của ID máy, tên máy (`device_label`, để người dùng nhận ra máy khi cần gỡ) và thời điểm kiểm tra bản quyền gần nhất.
  - Việc chuyển khoản do ngân hàng và PayOS xử lý; server không nhận số tài khoản ngân hàng của khách.
  - Khi mua, người dùng tick đồng ý cho xử lý email vào đúng mục đích này (`consent` của checkout, §6.8). Server lưu thời điểm đồng ý.
  - Server không gửi email người mua sang PayOS.
  - **Thời gian lưu (chốt 2026-10-01): dữ liệu cá nhân được giữ không thời hạn**, không bao giờ tự xóa:
    - Email, `device_label`, đơn hàng và activation được giữ mãi. Không có cron tự xóa hay tự ẩn danh.
    - Khách yêu cầu xóa thì người vận hành gọi thao tác admin "xóa hoặc ẩn danh dữ liệu theo email" (§6.8). Thao tác này không bao giờ chạy tự động, và làm như sau:
      - bỏ email và `device_label`;
      - **giữ `device_id_hash` ở dạng đã băm.** Đây là dữ liệu bí danh, giữ cho mục đích chống lạm dụng: giới hạn 2 máy, luật khóa tạm, và việc dùng lại activation khi kích hoạt lại cùng máy (§6.8). Cách chọn này cần luật sư xác nhận (§15);
      - giữ thời điểm đồng ý xử lý email, làm bằng chứng đã có sự đồng ý trước đó;
      - giữ dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền.

      License vẫn dùng được, nhưng không khôi phục qua email được nữa.
    - Ngoài phạm vi:
      - dữ liệu giới hạn tần suất (khoảng 3 giờ, chỉ lưu HMAC của IP, key, email; §10.2) và log của Cloudflare tự hết hạn. Đây là dữ liệu kỹ thuật, không phải hồ sơ khách hàng;
      - log thư do Resend lưu (địa chỉ nhận và nội dung thư, có key), theo chính sách lưu của Resend. Thời hạn lưu cụ thể chưa kiểm; kiểm khi tạo tài khoản Resend (T6) và ghi vào chính sách quyền riêng tư.
    - Việc giữ không thời hạn cần hỏi luật sư (§15).
  - Chính sách quyền riêng tư phải ghi rõ dữ liệu nào được lưu, **được giữ không thời hạn**, và khách có thể yêu cầu xóa theo cách nào.
  - **Hóa đơn điện tử: chưa làm trong MVP** (chốt 2026-10-01). Server không gửi thông tin người mua (tên, mã số thuế, email) sang PayOS, và app không có ô nhập các thông tin này. Làm sau MVP (§15); nghĩa vụ thuế khi bán vẫn cần hỏi kế toán.
  - **Chuyển dữ liệu ra nước ngoài:** license server (Cloudflare D1) và dịch vụ gửi email (Resend) đặt ngoài Việt Nam, nên có thể thuộc diện chuyển dữ liệu cá nhân xuyên biên giới. Khi đó phải lập hồ sơ đánh giá tác động và gửi cơ quan chuyên trách trong 60 ngày kể từ lần chuyển đầu tiên. Hộ kinh doanh và doanh nghiệp siêu nhỏ được miễn; doanh nghiệp nhỏ và doanh nghiệp khởi nghiệp được chọn không làm trong 5 năm đầu. Việc này phụ thuộc loại hình đăng ký kinh doanh (§15), cần hỏi luật sư.
- **Giấy phép bên thứ ba**, liệt kê ở màn hình Giới thiệu và file `THIRD_PARTY_NOTICES`:
  - Hy-MT2: Apache 2.0, kèm LICENSE và NOTICE. Nếu tự nén lại model thì phải ghi chú là đã sửa đổi.
  - Trọng số Whisper: MIT.
  - whisper.cpp, llama.cpp, ggml: MIT.
  - Silero VAD: MIT.
  - Tauri: MIT/Apache 2.0.
  - React: MIT.
  - SQLCipher: giấy phép kiểu BSD, bắt buộc ghi công. OpenSSL (Apache 2.0), nếu dùng bản đi kèm.
  - candle, dùng để chạy Silero (§6.3): MIT/Apache 2.0.
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
| Chỉnh đồng hồ máy (lùi, tới trước, hoặc đổi múi giờ qua lại) để lách hạn mức hoặc hạn dùng | **Gói trả phí:** số thứ tự chu kỳ tính theo `issued_at` của token mới nhất (giờ server), không theo giờ máy, nên chỉnh đồng hồ không có tác dụng; giờ máy chỉ quyết định lúc gọi `validate` (§6.8, "Hạn mức"). **Free:** reset cần ngày tăng và đã qua 20 giờ theo "đồng hồ thật": lớn nhất trong thời gian đơn điệu lúc app chạy, hiệu hai header `Date` của server, và hiệu giờ máy (chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy), §6.8. Chỉnh lùi bị chặn; chỉnh tới trước khi offline là rủi ro chấp nhận (dưới bảng). **Hạn dùng:** app lưu mốc thời gian lớn nhất từng thấy; giờ hiện tại nhỏ hơn mốc đó quá 10 phút thì coi token là phải kiểm tra online lại, và nhắc người dùng chỉnh giờ. |
| Sửa hoặc xóa trạng thái bản quyền và bộ đếm hạn mức trên máy | Lưu trong kho khóa của hệ điều hành (Keychain trên macOS, Credential Manager trên Windows), không lưu file thường. Trên Windows, mục lưu ở chế độ cục bộ (`persistence = Local`), không đi theo hồ sơ roaming sang máy khác, vì bản quyền và hạn mức gắn với từng máy. Mất bản ghi bộ đếm thì coi như đã hết hạn mức của ngày hoặc của chu kỳ. Gói trả phí: xóa sạch dữ liệu rồi nhập lại key trên cùng máy (quá cửa sổ 15 phút) cũng bị coi là mất bản ghi: server dùng lại activation cũ, nên không mở cửa sổ `quota_fresh` mới; token đọc lại từ kho khóa luôn coi là không `fresh`. Khách thật thì nhờ hỗ trợ reset hạn mức của máy: tăng `quota_epoch`; epoch lớn hơn bản ghi đánh dấu thì bắt đầu từ 0, còn máy đã xóa sạch dữ liệu thì có cửa sổ `fresh` tính từ token đầu tiên sau khi tăng (§6.8). |
| Chia sẻ hoặc bán lại key | Mỗi key tối đa 2 máy; kích hoạt lại trên cùng một máy không tốn thêm suất. Key sinh ngẫu nhiên với ít nhất 128 bit, có ký tự kiểm tra để phát hiện gõ sai. **Khóa tạm:** xem luật dưới bảng. |
| Dò key hoặc spam license server | Giới hạn request theo IP, theo key và theo email, theo cửa sổ 1 giờ: `activate` ≤ 10 lần/giờ/IP, `validate` ≤ 30 lần/giờ/key, `checkout` ≤ 10 lần/giờ/IP, `recover` ≤ 3 lần/giờ/email và ≤ 10 lần/giờ/IP, `deactivate` ≤ 10 lần/giờ/IP, hỏi đơn ≤ 600 lần/giờ cho mỗi cặp (IP, đơn). `validate` đếm theo key đã chuẩn hóa. Vượt ngưỡng thì trả `429`. Bộ đếm nằm trong D1 và chỉ lưu HMAC-SHA256 (có pepper bí mật) của IP, key, email. **Chặn IP:** xem luật dưới bảng. |
| Bị clone, đổi thương hiệu rồi bán lại | **Pháp lý:** đăng ký nhãn hiệu (tên và logo) tại Cục Sở hữu trí tuệ Việt Nam, mở rộng ra quốc tế sau. EULA cấm dịch ngược, cấm phân phối lại, cấm đổi thương hiệu. Có sẵn quy trình yêu cầu Microsoft Store và nhà cung cấp hosting gỡ bản nhái. **Kỹ thuật:** logic quan trọng (prompt, cắt và ghép câu, khớp thuật ngữ) nằm trong Rust đã biên dịch; JavaScript chỉ lo hiển thị và được rút gọn. Manifest model, bản cập nhật và token đều ký bằng khóa riêng, nên bản nhái không dùng được hạ tầng của sản phẩm. |
| Bản giả có cài mã độc | Ký số và notarize mọi bản phát hành. Chỉ phát hành qua tên miền chính thức. Website công bố mã SHA-256 của từng bộ cài và cảnh báo về bản giả. |
| Tấn công qua giao diện WebView | **Capabilities của Tauri 2:** cửa sổ `overlay` chỉ nhận sự kiện phụ đề, kéo được chính nó, và gọi được đúng một lệnh chỉ đọc là `get_overlay_view` (phần cài đặt của chính nó). Overlay không gọi lệnh khóa, vì khi đã khóa thì click đi xuyên qua thanh; mở khóa bằng phím tắt hoặc menu khay (§4.4). Cửa sổ `main` chỉ được cấp đúng các lệnh nó cần. Không cửa sổ nào được gọi thẳng lệnh của plugin. **CSP chặt:** chỉ nạp tài nguyên đóng gói trong app, không `unsafe-eval`, không tải script từ bên ngoài. **Chặn điều hướng:** webview chỉ được đi tới URL của chính app; `blob:` và yêu cầu mở cửa sổ mới đều bị chặn. Link ngoài chỉ mở bằng trình duyệt của hệ thống, và chỉ khi là `https` tới tên miền nằm trong danh sách cho phép build sẵn (trang thanh toán PayOS, website của sản phẩm); còn lại thì chặn và ghi log. Tắt devtools ở bản phát hành. Mọi dữ liệu từ giao diện gửi xuống Rust đều được kiểm tra kiểu và phạm vi. |
| Thay tiến trình phụ, hoặc chèn thư viện giả | Trước khi chạy `asr-worker` hay `llama-server`, kiểm tra SHA-256 của file thực thi và của các thư viện ggml, theo một danh sách build sẵn vào app. Windows: tiến trình chính và `asr-worker` gọi `SetDefaultDllDirectories` để chỉ nạp DLL từ thư mục app và System32. macOS: hardened runtime có bật library validation, mọi file thực thi và `.dylib` ký cùng Team ID. |
| Lộ nội dung cuộc họp | Lịch sử chép lời được mã hóa bằng SQLCipher, khóa ngẫu nhiên lưu trong kho khóa của hệ điều hành. Log không bao giờ chứa nội dung chép lời. File xuất ra do người dùng chủ động tạo và tự quản lý. |
| Tấn công license server | Chỉ nhận HTTPS, kiểm ngay trong Worker. Kiểm tra chữ ký webhook và xử lý idempotent (§6.8). Dùng prepared statement của D1, kiểm tra mọi input. Secret lưu bằng Wrangler secrets. Không để dữ liệu nhạy cảm trong URL: `order_token` đi trong header, tắt invocation log của Workers Logs, bỏ query khỏi URL trong log. `/admin/*` nằm ở Worker riêng đặt sau Cloudflare Access, tự kiểm lại danh tính, và chống CSRF. Ghi nhật ký mọi thay đổi license. Cảnh báo cho người vận hành: xem dưới bảng. |
| Lộ khóa ký token | Token có trường `kid`. App build sẵn 2 khóa công khai: khóa đang dùng và khóa dự phòng. Cách giữ và đổi khóa: xem "Khóa ký token" dưới bảng. |
| Rủi ro chuỗi cung ứng | Không khóa ký nào (ký mã, cập nhật, token, manifest) nằm trên máy dev. Bản phát hành được build và ký trong CI, từ tag đã commit, dùng secret của CI hoặc dịch vụ ký trên cloud. CI chạy `cargo audit`, `cargo deny`, `pnpm audit`, và bật Dependabot. llama.cpp và whisper.cpp được build trong CI từ tag đã khóa, có kiểm tra checksum. |

**Rủi ro chấp nhận ở MVP** (hạn mức):
- **Xoay key sang máy khác:** mỗi máy mới bắt đầu bộ đếm từ 0 (§6.8), nên gỡ máy rồi kích hoạt máy khác cho thêm hạn mức. Luật khóa tạm bên dưới chỉ giới hạn được phần nào (khoảng 3 lần đổi máy mỗi 30 ngày).
- **Free bị lách bằng cách chỉnh giờ tới trước khi offline:** khi không có mạng, "đồng hồ thật" của Free dựa vào giờ máy (§6.8), nên chỉnh giờ tới trước reset được Free sớm hơn đúng luật. Chỉnh lùi vẫn bị chặn.
- **Free trên cùng máy lách được bằng cách xóa sạch dữ liệu** (kho khóa và file cài đặt): Free không có token, nên app không phân biệt được với một máy mới.
- **Xóa sạch dữ liệu trong cửa sổ `quota_fresh`:** trong 15 phút sau khi kích hoạt, reset hạn mức, hay đặt lại `cycle_anchor`, xóa sạch dữ liệu thì bộ đếm của gói trả phí về 0. Mất tối đa khoảng 15 phút hạn mức mỗi lần mở cửa sổ.
- **Sửa nội dung bản ghi đánh dấu hay bộ đếm trong kho khóa:** người có quyền trên máy sửa được các mục này. MVP không ký hay mã hóa thêm.
- **Người hết hạn mức gói trả phí mà gỡ kích hoạt** thì từ hôm sau dùng được 10 phút Free mỗi ngày. Hôm gỡ thì Free cũng đã hết (§6.8).

**Khóa tạm key** (giới hạn việc xoay key qua nhiều máy):
- Đếm số lần gỡ do người dùng (tự gỡ hoặc gỡ từ xa; không tính admin gỡ) trong 30 ngày gần nhất, chỉ tính từ lần admin mở khóa gần nhất, và **trừ các lần gỡ chính máy đang kích hoạt**.
- Khi một máy không đang kích hoạt xin `activate`, kể cả máy từng dùng key này, mà số trên lớn hơn 3, server khóa key, trả `423 license_locked`, và tạo cảnh báo cho người vận hành.
- Gỡ rồi kích hoạt lại cùng một máy bao nhiêu lần cũng không bị khóa.
- Key đã khóa thì chặn mọi máy không đang kích hoạt. Các máy đang kích hoạt vẫn `validate` và gỡ máy được.
- Hỗ trợ mở khóa qua admin; các lần gỡ trước lúc mở khóa không còn tính.

**Chặn IP thất bại nhiều, và CGNAT:**
- Thất bại đếm theo IP, chung mọi endpoint: key sai định dạng, key không tồn tại, activation lạ. Chạm 60 lần trong 1 giờ thì IP đó bị chặn tới hết giờ, và server tạo cảnh báo cho người vận hành.
- Nhiều người dùng thật có thể chung một IP qua CGNAT. Vì vậy khi IP đang bị chặn, server chỉ cho qua `validate` và `deactivate` có key hợp lệ **kèm `activation_id` đang hoạt động và khớp**; mọi request khác trả `429`, kể cả `activate` và checkout gia hạn.
- Không cho qua mọi key hợp lệ, vì khi đó kẻ dò vẫn phân biệt được key thật (`200`) với key giả (`429`). Đoán trúng một `activation_id` (UUID v4, 122 bit ngẫu nhiên) là không khả thi.
- Vì vậy app luôn gửi `activation_id` khi `validate`, và không coi `429` ở `activate` là key sai (§9).

**Cảnh báo cho người vận hành:**
- Năm loại sự kiện: `many_failures` (một IP chạm 60 lần thất bại), `webhook_bad_signature`, `email_failed`, `license_locked`, `order_needs_review` (license đã thu hồi nhận được tiền, §6.8).
- Cron gửi một email cho mỗi loại, **tối đa một lần mỗi giờ**, tới hộp thư vận hành, qua `EmailProvider`. Gửi lỗi thì lần cron sau thử lại.
- Địa chỉ nhận là dữ liệu cá nhân nên là secret của Worker (`OPERATOR_EMAIL`), không nằm trong repo. Thiếu thì cảnh báo chỉ ghi log. Chủ dự án chưa chọn hộp thư này (§15).
- Cảnh báo đi cùng kênh Resend với thư chứa key, nên khi Resend sập thì chỉ còn log. Giảm rủi ro bằng Workers Issues của Cloudflare (ghi `console.error` và response `5xx`, gửi qua webhook hay chat, không qua Resend).

**Khóa ký token:**
- **`kid` là duy nhất, có số thứ tự:** dạng `<môi trường>-<năm>-<tháng>-<số thứ tự>`, ví dụ `prod-2026-10-1`. Không bao giờ dùng lại một `kid`, kể cả `kid` đã bị lộ. Công cụ tạo khóa từ chối `kid` đã có trong `server/keys/public-keys.json`. Mỗi khóa mới, kể cả khóa dự phòng, lấy số kế tiếp (ví dụ `stg-2026-10-1` ở ô A, `stg-2026-10-2` ở ô B).
- **Hai ô khóa, đặt tên theo ô, không theo vai:** secret `TOKEN_SIGNING_KEY_A` và `TOKEN_SIGNING_KEY_B` của Worker API, mỗi ô là một JWK Ed25519 có `kid`. Biến cấu hình `TOKEN_SIGNING_SLOT` (`a` hoặc `b`, không phải secret) chọn ô đang ký; ô còn lại là khóa dự phòng.
  - Lý do: secret của Worker không đọc lại được, nên không chép được khóa từ secret này sang secret khác. Nếu đặt tên theo vai (khóa chính, khóa dự phòng), thì sau lần đổi khóa đầu tiên tên sẽ sai với vai.
  - Cả hai khóa được tạo bằng một script rồi pipe thẳng vào `wrangler secret put`. Khóa riêng không bao giờ in ra terminal, ghi ra file, hay lưu ở đâu trên máy người vận hành. **Không dùng kho mật khẩu.** Thiếu một trong hai ô thì deploy báo lỗi.
  - Khóa công khai của cả hai ô nằm trong `server/keys/public-keys.json`, ghi theo môi trường và theo ô, và được build sẵn vào app.
  - Kiểm khóa công khai khớp khóa riêng bằng thao tác admin "ký thử bằng khóa dự phòng" (§6.8), rồi kiểm token đó bằng `server/keys/public-keys.json`, kể cả việc token nằm đúng ô Worker báo. Khóa đang ký được kiểm bằng một token thật.
- **Đổi khóa** (khi khóa đang ký bị lộ, hoặc khi chủ động đổi):
  1. Đổi `TOKEN_SIGNING_SLOT` sang ô dự phòng, rồi deploy. Từ lúc này token mới ký bằng khóa dự phòng; app đã có sẵn khóa công khai của nó.
  2. Tạo khóa mới, với `kid` có số thứ tự kế tiếp, ghi vào ô vừa rảnh. Ô này thành khóa dự phòng mới.
  3. Sửa `server/keys/public-keys.json`: bỏ khóa bị lộ, ghi khóa mới vào đúng ô. Phát hành bản cập nhật app mang hai khóa công khai này.
  4. Bản app cũ vẫn nhận token ký bằng khóa bị lộ cho tới khi được cập nhật. Đây là rủi ro còn lại, chấp nhận.
- **Đánh đổi:** tài khoản Cloudflare bị chiếm thì mất cả hai khóa. Nhưng khi đó server cũng đã bị chiếm, nên một khóa dự phòng cất ở chỗ khác cũng không cứu được.

**Để Giai đoạn 2**, và chỉ làm khi thấy bị crack nhiều thật: chống debug, làm rối code sâu hơn, kiểm tra toàn vẹn nhiều lớp, phát hiện gian lận phía server bằng phân tích hành vi.

## 11. Kiểm thử

- **Unit test (`cargo test`):**
  - Resample và gộp kênh; trộn hai thiết bị Windows có lệch đồng hồ.
  - Chèn im lặng khi luồng loopback không trả gói dữ liệu (§6.1).
  - Cắt câu với tín hiệu tổng hợp: im lặng, tiếng nói, nhạc, đoạn bị cắt ở 8 giây.
  - VAD chạy dài không tăng bộ nhớ (state LSTM đã `detach()`, §6.3). Phần chạy dài nằm trong test `vad_reference`, mặc định bị bỏ qua (§6.12); `cargo test` thường chỉ có `debug_assert!` trong `SileroVad::prob` giữ lỗi này.
  - Ghép câu tạm: cửa sổ ghép theo `vadEndSilenceMs`, trần 15 giây hoặc 3 đoạn, đoạn khác ngôn ngữ không ghép.
  - Chọn ngôn ngữ trong tập cho phép, cơ chế giữ ngôn ngữ đoạn trước, và ngưỡng 0,9 cho đoạn ngắn hơn 1,5 giây.
  - Giao thức stdin/stdout với `asr-worker`: đóng gói, giải mã, thông điệp hỏng hoặc bị cắt, khung thừa byte, chỉ số biến thể cố định (§6.4).
  - Giải mã của `asr-worker`: công thức `audio_ctx` có sàn 512, luật lặp theo độ dài mẫu, trần số token.
  - Luật bỏ đoạn ở tiến trình chính theo `no_speech_prob` và `avg_logprob`.
  - Tạo prompt: nhánh tiếng Trung và không tiếng Trung, tên ngôn ngữ của từng mẫu; khớp thuật ngữ tiếng Việt có dấu và chữ Trung, Nhật, Hàn.
  - Hậu xử lý bản dịch khi đang stream: lọc nhãn và ngoặc kép, ngưỡng tỉ lệ token theo cặp ngôn ngữ, thử lại với tham số khác.
  - Các trạng thái của phụ đề, kể cả `same_lang`, `skipped` và `dropped`.
  - Hạn mức (§6.8):
    - cách đếm phút: theo `speech_ms`, không gồm đệm, đoạn gộp cộng từng đoạn con; chỉ cộng khi phụ đề sang `done`; mỗi đoạn một lần; `same_lang`, `skipped`, `failed`, `dropped`, đoạn bị lọc không tính;
    - Free: bắt đầu từ 0 ở lần đầu chạy app và mỗi lần reset hợp lệ; mất bộ đếm ngày khi đã có dữ liệu thì coi như hết; reset khi ngày tăng và đã qua 20 giờ "đồng hồ thật" (lớn nhất trong ba số; hiệu `Date` chỉ khi có `Date` trước và sau lần reset; hiệu giờ máy bị bỏ khi giờ máy nhỏ hơn mốc lớn nhất từng thấy quá 10 phút); đổi múi giờ qua lại không reset được; phút dịch lúc ở gói trả phí cũng cộng vào Free của ngày; hết hạn mức gói trả phí thì Free của ngày cũng hết;
    - gói trả phí: `n` tính theo `issued_at` của token mới nhất, chỉnh giờ máy tới hay lùi không đổi `n`; hẹn `validate` lại sau (mốc − `issued_at`) + 1 phút; offline qua mốc thì dùng tiếp bộ đếm cũ; chu kỳ cuối ngắn có hạn mức `ceil(hạn_mức × số_ngày / 30)`;
    - khóa bộ đếm (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`): đổi gói không dùng lại bộ đếm cũ; epoch mới thì bộ đếm mới; ghi bộ đếm trước, bản ghi đánh dấu sau (tắt app giữa hai lần ghi không thành mất bản ghi);
    - gói trả phí bắt đầu từ 0 chỉ khi response vừa nhận có `quota_fresh: true`, khi epoch của token lớn hơn epoch trong bản ghi đánh dấu, hoặc sang chu kỳ mới khi bản ghi đánh dấu có mốc cũ hơn; trong cửa sổ `fresh`, luật bắt đầu từ 0 đứng trước luật mất bản ghi; token đọc lại từ kho khóa luôn coi là không `fresh`; mất bản ghi theo hai trường hợp của §6.8 (so theo activation này, cả `activation_id` và `quota_epoch`); quá 15 phút, xóa sạch dữ liệu rồi nhập lại key thì coi như hết hạn mức;
    - chạm hạn mức: không bắt đầu được phiên khi còn 0; bỏ hàng đợi, dịch xong câu đang dịch, dừng với `quota_exhausted`; X5 không giới hạn.
  - Trạng thái bản quyền: ân hạn, thu hồi, tự làm mới token khi app chạy liên tục quá 24 giờ.
  - Manifest và SHA-256.
- **Test giao diện (`vitest`):** i18n đủ khóa cả vi lẫn en; hiển thị thanh phụ đề. Các hàm xuất file viết và test phía Rust (`transcript/export.rs`, §12), vì webview chặn `blob:` (§10.2).
- **License server:**
  - Unit test: tính và kiểm tra chữ ký HMAC-SHA256 với dữ liệu mẫu của PayOS; webhook idempotent; chỉ cấp license khi `PAID`, `amountPaid` ≥ `amount` và `amount` khớp đơn; mua thêm cùng gói (từ max(hiện tại, `expires_at`), giữ `cycle_anchor`, đặt lại khi đã hết hạn); đổi gói (công thức quy đổi, cả hai ví dụ ở §6.8, `cycle_anchor` mới); giới hạn 2 máy, kích hoạt lại cùng máy không tốn suất, gỡ từ xa khi đã đủ máy; khóa tạm (`423`); chặn IP và trường hợp CGNAT; `recover` luôn trả `200`; ký và kiểm tra token Ed25519, có `cycle_anchor`, `quota_minutes_per_cycle`, `quota_epoch`, `activation_created_at`; "hiện tại" của gia hạn và đổi gói là `transactionDateTime` kẹp trong thời hạn link; reset hạn mức của máy tăng `quota_epoch`; `quota_fresh: true` cho mọi token trong 15 phút kể từ lúc tạo activation, lúc cấp token đầu tiên sau khi tăng `quota_epoch`, hay lúc server áp việc đặt lại `cycle_anchor` (không theo giá trị `cycle_anchor`), và `false` sau đó; gỡ (kể cả admin gỡ) không xóa activation, kích hoạt lại cùng `device_id_hash` dùng lại activation và không mở cửa sổ `quota_fresh` mới; parse `transactionDateTime` không có múi giờ theo GMT+7; phân loại lỗi email.
  - Test tích hợp với PayOS trên môi trường test nếu có; nếu không có thì dùng giao dịch với số tiền nhỏ.
- **Test tích hợp:**
  - Chạy pipeline từ file WAV (không cần thu âm thật), kiểm tra phụ đề có xuất hiện, đúng thứ tự, đúng thời gian.
  - Vòng đời hai tiến trình phụ: khởi động đúng thứ tự (`asr-worker` trước `llama-server`), giả lập crash, tự khởi động lại, gửi lại đoạn đang xử lý, chuyển sang CPU sau 2 lần crash khi dùng GPU, tắt sau 10 phút không dịch.
- **Benchmark (`bench/`):** đo chất lượng (COMET, chrF++) và độ trễ từng bước cho mỗi gói model. Chạy trước mỗi lần đổi model hoặc engine. Ngưỡng theo A2–A4. Kết quả gốc nằm ở `bench/2026-09-29-mt-benchmark/`; mốc của Giai đoạn 0 nằm ở `bench/phase0/results/` (§3.3, §8).
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
  - Chỉnh lùi đồng hồ máy: app phát hiện, không reset hạn mức, yêu cầu kiểm tra online. Chỉnh đồng hồ tới trước qua mốc chu kỳ: không mở được chu kỳ mới khi chưa có token mới.
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
├── .cargo/config.toml            # Mức CPU cố định khi build whisper.cpp (§6.12)
├── deny.toml                     # cargo deny: giấy phép được phép, chỉ asr-worker link whisper.cpp (§6.12)
├── src/                          # Giao diện: React + TypeScript
│   ├── windows/main/             # Cửa sổ chính (các màn hình ở §4.3)
│   ├── windows/overlay/          # Thanh phụ đề
│   ├── components/  store/  lib/ipc.ts
│   └── i18n/                     # Từ điển en (chuẩn) + vi
├── src-tauri/                    # Tiến trình chính, không link ggml
│   ├── src/
│   │   ├── main.rs
│   │   ├── session.rs            # Nối crate audio-capture và pipeline vào app: bắt đầu/dừng phiên, phát sự kiện phụ đề
│   │   ├── sidecar/{asr,llama}.rs  # Tìm binary, kiểm SHA-256, phát sự kiện trạng thái; logic giám sát nằm trong crate pipeline
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
│   ├── asr-protocol/             # Kiểu thông điệp stdin/stdout, dùng chung cho app và asr-worker
│   ├── audio-capture/            # Thu âm thanh, chèn im lặng, trộn, resample (§6.1, §6.2)
│   ├── pipeline/                 # VAD, cắt đoạn, client asr-worker, gọi llama-server, prompt, giám sát tiến trình phụ, PipelineConfig (§6.3–§6.5, §7)
│   └── latency-bench/            # Công cụ đo của Giai đoạn 0 (S3, S6, A4), không vào bộ cài
├── third_party/                  # whisper-rs, whisper-rs-sys đã vá, nối qua [patch.crates-io] (§6.4)
├── server/                       # License server: hai Cloudflare Worker (API, admin; nối bằng service binding) + D1. D1 có bảng deactivations: mỗi lần gỡ máy một dòng, vì activation không bị xóa
│   └── src/
│       ├── index.ts  admin-entry.ts  # Điểm vào của Worker API và Worker admin (§6.8)
│       ├── admin-rpc.ts          # AdminRpc: Worker admin gọi qua service binding để lấy bảng gói và ký thử khóa dự phòng; Worker admin không giữ khóa nào
│       ├── {checkout,orders,licenses,token,plans,reconcile,admin}.ts
│       ├── {ratelimit,alerts}.ts     # Giới hạn tần suất, chặn IP, cảnh báo cho người vận hành (§10.2)
│       ├── payment/{provider,payos}.ts  # Interface PaymentProvider và cài đặt PayOS (§6.8)
│       └── email/{provider,resend,templates}.ts  # Interface EmailProvider và cài đặt Resend (§6.8)
├── bench/                        # Đánh giá chất lượng và độ trễ
│   ├── 2026-09-29-mt-benchmark/  # Kết quả gốc của lần chọn model
│   └── phase0/                   # Công cụ đo Giai đoạn 0; kết quả ở results/ (§3.3, §8)
├── tests/fixtures/audio/         # Vài clip ngắn có quyền dùng cho test tích hợp; bộ clip A4 nằm ở bench/phase0/data/ (không commit)
└── docs/superpowers/specs/
```

- `asr-protocol`, `asr-worker`, `audio-capture` và `pipeline` có từ Giai đoạn 0, và phần lớn code dùng lại được ở MVP.
- **Việc cho MVP:**
  - Đã chọn (2026-10-01): giữ `audio-capture` và `pipeline` là crate riêng, vì code và test của Giai đoạn 0 dùng lại được nguyên, và test chạy không cần Tauri. `src-tauri` chỉ còn phần nối các crate vào app.
  - Trước khi tạo `server/`: thêm vào `.gitignore` các mẫu `.dev.vars*`, `.env*`, `*.pem`, `*.p12`, `*.pfx`, `*.key` (§10.2).

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

**Giai đoạn 1: MVP.** Làm F1–F10, license server và tích hợp PayOS, bốn gói và hạn mức (§2, §6.8), đạt A1–A7. Các việc kỹ thuật rút ra từ Giai đoạn 0 nằm ở mục "Việc cho MVP" của §5, §6.3, §6.4, §6.5 và §12, cùng các phương án MVP phải chọn ở §6.12, và các điều kiện A4 còn thiếu ở §3.3.

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
   - Có môi trường test; nếu không có thì test bằng giao dịch nhỏ. Kiểm ngày 2026-10-01: PayOS không có sandbox, nên test bằng giao dịch nhỏ trên staging.
   - Mô tả đơn cần ngắn (với một số ngân hàng tối đa 9 ký tự), nên dùng mã dạng `AT` cộng số đơn (tối đa 7 chữ số, §6.8).
8. Rút ngắn `audio_ctx` không làm WER tăng quá 10% so với cửa sổ 30 giây đầy đủ. (S7) Kết quả S7: không đạt theo từng ô, xem §6.4 "Rút ngắn cửa sổ mã hóa".
9. Chi phí nhận diện ngôn ngữ giữ được dưới 20% thời gian nhận dạng của đoạn (§6.4). (S3)
10. Truyền âm thanh qua stdin/stdout sang `asr-worker` thêm không quá 10 ms mỗi đoạn. (S3)
11. `transactionDateTime` của PayOS không ghi múi giờ, và tài liệu PayOS không nói. Spec giả định đó là giờ Việt Nam (GMT+7) và parse theo đó (§6.8). Kiểm bằng giao dịch thật trên staging (kế hoạch 05, Task 20): so `transactionDateTime` với giờ chuyển khoản trong app ngân hàng.

## 15. Việc còn mở (không chặn phần kỹ thuật)

Đã quyết ngày 2026-10-01 và đã đưa vào spec: tên và bundle identifier (D13), bốn gói và giá (P1, §2), hạn mức (§6.8), cách lưu dữ liệu (§10.1), chưa làm hóa đơn điện tử (§10.1), không dùng kho mật khẩu cho khóa ký token (§10.2). Dịch vụ email đã chọn là Resend, nhưng chưa có tài khoản (T6 của kế hoạch Giai đoạn 1 · 00). Tài khoản Cloudflare riêng đã có.

Còn mở:
- **Logo và tên miền.** Tên miền mua sau. Trong lúc chờ, staging dùng `*.workers.dev` và URL tạm của R2; mọi URL đọc từ cấu hình. Cần tên miền trước khi license server lên production (email gửi từ tên miền đã xác thực, `returnUrl`) và trước bản beta đầu tiên.
- **Kênh PayOS cho staging** (P05-1 của kế hoạch Giai đoạn 1 · 05): mỗi kênh PayOS chỉ có một URL webhook, nên staging cần một kênh riêng. Cần có trước khi triển khai staging.
- **Hộp thư nhận cảnh báo vận hành** (P05-5, `OPERATOR_EMAIL`, §10.2). Cần có trước khi triển khai staging.
- **Pháp lý:** hỏi luật sư về:
  - hồ sơ chuyển dữ liệu cá nhân ra nước ngoài (§10.1);
  - việc **giữ dữ liệu cá nhân không thời hạn** (§10.1), xét theo Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân (hiệu lực từ 1/1/2026);
  - việc giữ `device_id_hash` (đã băm) khi khách yêu cầu xóa (§10.1);
  - thủ tục thông báo website bán hàng với Bộ Công Thương.
- **PayOS:** liên kết tài khoản ngân hàng nhận tiền theo loại hình đăng ký kinh doanh (doanh nghiệp, hộ kinh doanh hoặc cá nhân).
- **Thanh toán quốc tế:** PayOS chỉ nhận chuyển khoản từ ngân hàng Việt Nam, nên MVP chỉ bán cho khách ở Việt Nam. Muốn bán ra nước ngoài thì chọn thêm một nhà cung cấp sau MVP (có thể cân nhắc Polar).
- **Giấy tờ cho phát hành:** mua chứng thư ký mã OV cho Windows, loại ký trên cloud (§6.11); tài khoản Apple Developer (99 USD/năm).
- **Website:** trang tải app, trang giá, chính sách quyền riêng tư và điều khoản sử dụng. Phần này sẽ có spec riêng.
- **Hóa đơn điện tử và thuế: để sau MVP.** Trước khi làm, hỏi kế toán về nghĩa vụ khi bán phần mềm cho khách ở Việt Nam. PayOS có trường thông tin người mua và API hóa đơn để tích hợp.
