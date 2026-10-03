# Giai đoạn 1 · 08a: Nghiệm thu — công cụ đo và tổng hợp

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần code của kế hoạch 08 (mục 2.8 của kế hoạch 00): bộ script để agent đo và tổng hợp kết quả nghiệm thu A1–A7 (spec §3.3), tải máy (§8), và kiểm bảng đối chiếu đủ 100% (Task 5 của kế hoạch 00):
- `mapping.py`: đếm trạng thái của bảng đối chiếu, nhóm dòng chưa xong theo việc đang chặn, kiểm điều kiện phát hành;
- `gates.py`: cổng số liệu A2 (độ trễ), A3 (COMET), A4 (WER/CER), dùng lại kết quả và luật của `latency-bench`, `score_mt.py`, `score_asr.py`;
- `soak.py`: soak test 2 giờ (A5) và CPU trung bình (§8), trên macOS và Windows;
- `netaudit.py`: kiểm nhật ký mạng qua proxy (A7);
- `report.py`: báo cáo nghiệm thu từ các file kết quả.

Việc điều phối (người thao tác app họp, tai nghe, máy tham chiếu, proxy, bộ cài đã ký; agent chạy script) nằm ở **08b** (`docs/superpowers/plans/2026-10-03-giai-doan-1-08b-nghiem-thu-dieu-phoi.md`). Làm 08a trước: 08b dùng các script này.

**Kiến trúc:** Mọi script nằm ở `bench/phase1/acceptance/`, theo quy ước của `bench/phase0/` (Python 3.12 trở lên, chỉ thư viện chuẩn, test bằng `unittest`, chạy từ gốc repo). Mỗi script đọc file kết quả có sẵn (JSON của `latency-bench`, `score_mt.py`, `score_asr.py`; CSV của chính `soak.py`; HAR của proxy), in bảng Markdown, ghi JSON vào `bench/phase1/results/acceptance/` cho `report.py`, và trả mã thoát 1 khi không đạt. Không script nào gọi mạng, mở app hay cần quyền.

**Công nghệ:** Không thêm thư viện nào (Python, npm hay crate). Python trên máy dev là 3.14.6; script chỉ cần 3.12 trở lên (cùng mức `bench/phase0/README.md`). Không đổi `Cargo.lock`, `pnpm-lock.yaml`.

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.8, 4, 5, 6). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Tên file dùng ngày viết `2026-10-03` (Đ1).

Kế hoạch 08 chia hai file, làm theo thứ tự:
1. **08a** (file này): Task 1–6, có code, chạy bằng script.
2. **08b**: Task 1–11, điều phối và đo; phần lớn cần người.

Dòng của bảng đối chiếu, quyết định (QĐ), điểm cần chủ dự án quyết, kết quả mutation và bảng commit tham chiếu nằm ở file này, dùng chung cho cả hai.

---

## Cách đọc kế hoạch này

- **Thứ tự và trạng thái đầu.** Làm trên `main`, từ commit `b2ea5b0` (01–06 và 07a đã thực thi trên Mac; 07b đang sửa). 08a không đụng file nào của kế hoạch khác, nên áp được lên `main` mới hơn miễn là `bench/phase1/acceptance/` chưa có. Trước mỗi task, `git status` phải sạch.
- **Khối code.** "Tạo `<file>`": chép nguyên khối vào file mới. Mọi file của 08a đều là file mới. Bước "Viết test trước" tạo file test; bước "Viết code" tạo module.
- **Khối Expected.** Mọi khối Expected là output thật, lấy từ một lần chạy lại toàn bộ các task từ file kế hoạch trên một bản sao sạch của `b2ea5b0` (2026-10-03). Lệnh đã lọc output để Expected không phụ thuộc thời gian chạy (`sed` bỏ "in 0.003s"). Lệnh chạy trên bảng đối chiếu thật (`mapping.py`, `report.py`) in số dòng lúc lập kế hoạch; số này đổi mỗi khi kế hoạch 00 được cập nhật.
- **Môi trường.** Mọi lệnh chạy từ gốc repo. Không cần build Rust hay cài gói nào.
- **Không mở app, không bật hộp thoại quyền** (mục 6.8 của kế hoạch 00). `soak.py` chỉ đọc danh sách tiến trình (`ps`), không cần quyền.

## Dòng của bảng đối chiếu giao cho kế hoạch 08

Lấy bằng lệnh ở Task 2, Step 1 của kế hoạch 00 (37 dòng có `08`). Cột "Task": `b<số>` là task của 08b; `a` là công cụ ở 08a.

| # | Yêu cầu (rút gọn) | Phần của 08 | Task |
|---|---|---|---|
| 1, 25, 298–301 | D1, A1, ma trận thủ công (hệ điều hành, app họp, thiết bị phát, toàn màn hình, nhiều màn hình) | ma trận A1 27 ô | a5 (mẫu), b8 |
| 3 | D3: macOS 14.2+, Windows 10/11 x64 | lượt nhanh trên macOS 14.2, 15, 27, Windows 10 | b8 |
| 7, 83, 248, 249, 315 | âm thanh không rời máy; app chỉ gọi server của mình; log không có chữ chép lời | kiểm qua proxy, kiểm log sau phiên | a4, b7 |
| 12, 26, 225 | D12, A2, ngân sách độ trễ | S6 trên máy tham chiếu, cổng A2 | a2, b5 |
| 27, 28, 297 | A3: mốc, sàn, chống thụt lùi; benchmark trước mỗi lần đổi model | chạy lại A3 trên bản phát hành | a2, b4 |
| 29 | A4 chống thụt lùi | chạy lại A4 trên bản phát hành | a2, b4 |
| 30, 31 | A4: clip Bluetooth thật; nghe lại 24 clip | C13 (Đ11) | b3 |
| 32, 306 | A5, soak test | soak 2 giờ trên Mac và Windows | a3, b6 |
| 33, 307 | A6, cài đặt và cập nhật | danh sách A6 | a5 (mẫu), b9 |
| 34 | A7 | kiểm qua proxy | a4, b7 |
| 121 | flash attention khi upstream có mask cho phần đệm | kiểm upstream trước phát hành | b4 |
| 209 | mức CPU cố định (AVX2, không AVX-512) | chạy bản phát hành trên máy tối thiểu | b5 |
| 227, 228 | RAM `--no-repack`; VRAM Windows | S6 trên máy CPU và card rời | b5 |
| 229 | CPU trung bình ≤ 30% | đo cùng lượt soak | a3, b6 |
| 302–305 | Windows không Vulkan; card 4 GB, 6 GB; khoảng lặng dài; khay | ma trận A1, đợt Windows | b2, b8 |
| 308 | bản cài không chính hãng | thử với bản ký thật | b9 |
| 322 | Giai đoạn 1 đạt A1–A7 | báo cáo nghiệm thu | a5, b11 |

Ngoài 37 dòng này, 08b Task 2 điều phối mọi bước còn chờ người hay Windows của 01–07 (các dòng còn lại không ở trạng thái `xong`), và 08b Task 11 đưa cả bảng về `xong` hay `hoãn` có duyệt.

## Sửa sau review lần 1 (2026-10-03)

Review lần 1 (`$S/review-08-r1.md`, trên `4f2baac`) kết luận "Cần sửa": 0 Nghiêm trọng, 5 Quan trọng, 4 Nhỏ; công cụ có thể báo ĐẠT khi chưa nên. Bản này sửa như sau; mọi test mới đỏ trước khi sửa.

| Mã | Sửa ở đâu | Cách sửa |
|---|---|---|
| Q1 | 08a Task 2; 08b Task 5 | `gates.py a2` gọi lại `summarize.problems`, ngưỡng `summarize.A2`; hạng máy lấy từ nhãn, bỏ `--class`; lượt tắt ghép câu không tính. Test `test_an_untrustworthy_run_cannot_pass`, `test_the_class_comes_from_the_label`, `test_a_run_without_merging_is_left_out` |
| Q2 | 08a Task 2, 5 | A3 đòi đủ các lượt `-plain` của mốc; `report.py` có tập bắt buộc (`REQUIRED`): A4 hai gói (`--pack`), A5 và A7 Mac và Windows (QĐ9). Test `test_a_missing_pack_fails`, `test_part_of_the_required_set_is_not_enough` |
| Q3 | 08a Task 3; 08b Task 6 | soak tính WebView (Windows: con cháu của app; macOS: `com.apple.WebKit.*`), `--require` app và hai tiến trình phụ; khởi động lại là pid mới sau mẫu đầu (QĐ5, QĐ6). Test `test_windows_keeps_every_descendant_of_the_app`, `test_a_required_process_absent_from_the_start_fails`, `test_two_webviews_at_once_are_not_a_restart` |
| Q4 | 08a Task 4; 08b Task 7 | mitmproxy theo tiến trình của app, bỏ bước mở trình duyệt, phát video bằng QuickTime (QĐ7) |
| Q5 | QĐ3; 08b Task 5 | S6 dùng tiến trình phụ của bản ứng viên; thêm số p50/p90 `total` của bảng debug của app thật; đưa lệch kế hoạch 00 vào điểm cần quyết 6 |
| N1 | 08a Task 1 | `hoãn` cần đúng cụm "chủ dự án duyệt YYYY-MM-DD" (QĐ2). Test `test_postponed_needs_the_owner_approval_with_its_date` |
| N2 | 08a Task 4 | `--start`, `--stop` bắt buộc; thêm từ mồi tiếng Việt. Test `test_the_session_window_is_required` |
| N3 | 08b Task 2 | thêm dòng 16: C15 (báo cáo Giai đoạn 0, kết luận S3) |
| N4 | 08b Task 5 | thêm Mac Apple Silicon 8 GB vào danh sách máy đo A2 (hạng tối thiểu) |

## Quyết định của kế hoạch này

- **QĐ1. Script Python thư viện chuẩn trong `bench/phase1/acceptance/`**, như `bench/phase0/`: không thêm phụ thuộc, chạy được trên Mac và Windows có Python 3.12. Phương án khác đã xét: script Node `.mjs` như `scripts/release/` (cũng không phụ thuộc); chọn Python vì các công cụ chấm (`score_mt.py`, `score_asr.py`) và S6 (`run_matrix.py`, `summarize.py`) đều là Python, và `gates.py a3` gọi thẳng `regression_lines` của `score_mt.py`.
- **QĐ2. "Đủ 100%"** (Task 5 kế hoạch 00) là: không lỗi định dạng, mọi dòng `xong`, hoặc `hoãn` có đúng cụm "chủ dự án duyệt YYYY-MM-DD" trong Ghi chú (một ngày bất kỳ, như ngày kiểm hay ngày đo, không tính; N1 của review lần 1). `mapping.py check` kiểm đúng điều đó, thay cho ba lệnh `awk`; nhóm "việc đang chặn" chỉ để điều phối, không ảnh hưởng kết quả.
- **QĐ3. A2: S6 là phép đo chính, cộng số của app thật** (Q5 của review lần 1, controller quyết 2026-10-03). S6 (`latency-bench latency`) chạy đúng luật của `pipeline` (Đ3 của kế hoạch 00) với file WAV có mốc "người nói dừng" chính xác, và dùng tiến trình phụ của bản ứng viên (cách của 07a Task 13); cổng A2 tính trên số này. Kế hoạch 00 ghi "08 đo lại A2 bằng app thật" (mục 5, C6): app không ghi mốc người nói dừng, và S6 không đi qua đường thu thật, `TauriSink`, IPC, lúc webview vẽ chữ. Vì vậy trên mỗi máy tham chiếu, 08b Task 5 còn chạy bản đã cài, phát cùng file của S6 qua loa, đọc p50/p90 `total` ở bảng debug của app (§7; `SessionMetrics::latency_ms`, từ lúc hết tiếng nói tới lúc bản dịch hiện đủ) và ghi cạnh số S6; chênh quá 300 ms thì phải giải thích trước khi kết luận A2. Lệch so với kế hoạch 00 nên đưa chủ dự án quyết (điểm cần quyết 6).
- **QĐ4. A3, A4 so với mốc hiện hành:** A3 dùng `s7_mt.json` và luật 0,01 của `score_mt.py`, cộng mức sàn Anh→Việt cho lượt không có ngữ cảnh; A4 dùng `a4_m4pro-{turbo,small}-final.json` (mục 6.7 của kế hoạch 00), cho tới khi chủ dự án duyệt mốc mới sau C13 (08b Task 3).
- **QĐ5. RAM của A5** là tổng RSS (working set trên Windows) của app, WebView của app và hai tiến trình phụ (§8 tính "App và WebView"; Q3 của review lần 1). Windows: mọi tiến trình con cháu của app, gồm `msedgewebview2`. macOS: `com.apple.WebKit.*` theo tên (tiến trình XPC có cha là `launchd`, không lọc theo cha được), nên lúc đo không mở app WebKit nào khác. App và hai tiến trình phụ là bắt buộc (`--require`): thiếu ở mẫu đầu thì không đạt; "sau giờ đầu không tăng quá 10%" so số lớn nhất sau phút 60 với trung bình phút 55–60 (không dùng một mẫu đơn lẻ, tránh nhiễu). RSS của `llama-server` gồm trang file model mmap; vì so tương đối nên không ảnh hưởng.
- **QĐ6. CPU của §8** là tổng thời gian CPU của app, WebView và hai tiến trình phụ chia thời gian thực và số lõi logic, đo trong cùng lượt soak (người nói liên tục). Không tính app họp. GPU trên macOS không đo bằng script (`powermetrics` cần `sudo`); 08b Task 6 ghi GPU từ Activity Monitor (Mac) và Task Manager (Windows) bằng tay.
- **QĐ7. A7 kiểm bằng proxy có giải mã TLS, chỉ bắt lưu lượng của app** (Q4 của review lần 1): mitmproxy chế độ theo tiến trình (`mitmdump --mode local:meeting-translator,asr-worker,llama-server`, macOS và Windows), không phải proxy hệ thống, vì HAR không ghi tiến trình gửi và request của trình duyệt, app họp, dịch vụ nền sẽ thành vi phạm giả. Người cài và tin chứng chỉ gốc của mitmproxy lên máy thử rồi gỡ sau khi thử; app dùng TLS của hệ điều hành nên tin chứng chỉ đó. Video phát bằng app không qua mạng (QuickTime, file có sẵn). Hai mốc Bắt đầu, Dừng là bắt buộc. Từ mồi gồm cụm của câu phát vào app và cụm của bản dịch app đã hiện (chép từ bản chép lời xuất ra; N2).
- **QĐ8. Danh sách cho phép của A7 lấy từ bản build đang thử** (URL license server, manifest model, `latest.json`); tên miền chưa mua (T7) nên mẫu dùng `LICENSE_HOST`, `MODELS_HOST`, `UPDATE_HOST`. Đường dẫn được gọi trong lúc dịch: `validate`, `plans` (hỏi giờ, QĐ31 của 06), manifest, `latest.json`. Tải model, mua gói, kích hoạt không được xảy ra trong lúc dịch.
- **QĐ9. Thiếu số liệu không bao giờ thành đạt** (`report.py`): mỗi tiêu chí là `đạt`, `không đạt` hay `chưa có số liệu`; kết luận chung chỉ ĐẠT khi mọi dòng đạt. Mỗi tiêu chí có tập bắt buộc (Q2 của review lần 1): A2 đủ hai hạng máy (hạng lấy từ nhãn, không từ dòng lệnh); A3, A4 đủ hai gói; A5, tải máy, A7 một máy Mac và một máy Windows. Thiếu một phần là `chưa có số liệu`.
- **QĐ10. Kết quả của 08 commit vào `bench/phase1/results/acceptance/`**: JSON của từng cổng, CSV và JSON của soak (2 giờ, mẫu 10 giây, ba tiến trình: khoảng 2 200 dòng), ma trận A1, danh sách A6, `report.md`. Nhật ký HAR không commit (có thể chứa token, key của lần thử); chỉ commit `a7-<máy>.json`.
- **QĐ11. Ma trận A1 rút gọn 27 ô**, không phải tích Đề-các (4 bản macOS × 6 app họp × 3 thiết bị × …): mỗi app họp với loa trên macOS 26 và Windows 11, hai loại tai nghe với Zoom (Bluetooth thêm với Teams), toàn màn hình với Zoom và Teams, hai màn hình với Meet, cộng một lượt nhanh trên macOS 14.2, 15, 27 và Windows 10. Thu âm không phụ thuộc app họp (D1, §6.1), nên rủi ro nằm ở từng app, từng loại thiết bị và từng hệ điều hành, không ở tổ hợp. Điểm cần quyết 1.
- **QĐ12. 08b không viết lại bước của người đã có ở kế hoạch trước** (01 Task 24–25, 02b Task 7–9, 02c Task 8–9, 03b Task 8–9, 04b Task 13–14, 05 Task 19–21, 06b Task 6–7, 07a Task 13–16, 07b Task 11–15, các task GĐ0 còn chờ): 08b sắp thứ tự, nói ai làm, và nơi ghi kết quả; Expected nằm ở kế hoạch gốc.

## Điểm cần chủ dự án quyết

1. **Ma trận A1 27 ô** (QĐ11). **Đề xuất:** dùng 27 ô; ô nào không đạt thì thêm các tổ hợp liền kề của ô đó.
2. **A5 và A7 chạy trên mấy máy:** `report.py` đòi một máy Mac và một máy Windows (`REQUIRED`). **Đề xuất:** giữ; A5 2 giờ trên Mac khuyến nghị và Windows có card rời, máy tối thiểu chỉ chạy 30 phút để xem RAM (không vào báo cáo).
3. **Thêm test của `bench/phase1/acceptance/` vào CI** (`ci.yml` của 07a). **Đề xuất:** có, một bước `python3 -m unittest discover …` ở job macOS; 08 không sửa `ci.yml` vì 07b đang sửa file này.
4. **Cài chứng chỉ gốc của proxy lên máy thử cho A7** (QĐ7). **Đề xuất:** dùng máy thử riêng hay tài khoản macOS riêng, gỡ chứng chỉ ngay sau khi thử.
5. **Mua thật một đơn trên production** (Nhận từ 06; 08b Task 10): số tiền thật nhỏ nhất (Professional 50 000 đ), hoàn tiền tay sau đó hay giữ. **Đề xuất:** giữ đơn, dùng key đó cho máy thử.
6. **A2 đo bằng S6 cộng số của app thật, lệch "08 đo lại A2 bằng app thật" của kế hoạch 00** (QĐ3; controller quyết theo đề xuất của review). **Đề xuất:** duyệt; nếu chủ dự án muốn cổng A2 tính trên số của app thật thì cần thêm mốc "người nói dừng" vào app (việc mới, ngoài Giai đoạn 1).

## Kết quả mutation lúc lập kế hoạch

Script ngoài repo `meeting-translator-work/p08gen/mut8.py`, chạy trên cây cuối của 08a (`plan08`). Mỗi mutation sửa đúng một chỗ của một script, chạy test của script đó (`unittest`), test phải đỏ, rồi trả code về. Chạy với `PYTHONDONTWRITEBYTECODE=1` và xóa `__pycache__` trước mỗi lần: mutation và lúc trả lại có cùng độ dài, trong cùng một giây, thì Python vẫn dùng file `.pyc` của bản đã đột biến (gặp lúc sửa theo review lần 1). 47 mutation, gồm 11 cho phần sửa theo review lần 1 (MP7, GA9–GA12, SK9–SK11, NA9, RP7, RP8).

| Mã | File | Mutation | Kết quả |
|---|---|---|---|
| MP1 | `mapping.py` | không kiểm trạng thái lạ | bị giết |
| MP2 | `mapping.py` | `hoãn` không cần ngày chủ dự án duyệt | bị giết |
| MP3 | `mapping.py` | không phát hiện số dòng trùng | bị giết |
| MP4 | `mapping.py` | "T8 `sha`" (task kèm commit) bị coi là mã tài khoản T8 | bị giết |
| MP5 | `mapping.py` | dòng thiếu cột không bị báo | bị giết |
| MP6 | `mapping.py` | "(cần người)" trong Ghi chú không được nhận | bị giết |
| GA1 | `gates.py` | A2: bằng đúng ngưỡng là không đạt | bị giết |
| GA2 | `summarize.py` (GĐ0, `gates.py` dùng lại) | A2: chữ dịch đầu tiên ≤ 1,1 s thay vì 1,0 s | bị giết |
| GA3 | `gates.py` | A2: không có session nào vẫn đạt | bị giết |
| GA4 | `gates.py` | A3: mức sàn áp cả lượt có ngữ cảnh | bị giết |
| GA5 | `gates.py` | A3: thiếu chiều mà vẫn đạt | bị giết |
| GA6 | `gates.py` | A4: cho xấu hơn 11% thay vì 10% | bị giết |
| GA7 | `gates.py` | A4: thiếu nhóm mà vẫn đạt | bị giết |
| GA8 | `gates.py` | A4: chọn WER/CER theo kết quả mới, không theo mốc | bị giết |
| SK1 | `soak.py` | RAM giờ đầu lấy trung bình cả giờ, không phải phút 55–60 | bị giết |
| SK2 | `soak.py` | cho RAM tăng 11% thay vì 10% | bị giết |
| SK3 | `soak.py` | tiến trình khởi động lại không làm A5 trượt | bị giết |
| SK4 | `soak.py` | tiến trình biến mất không làm A5 trượt | bị giết |
| SK5 | `soak.py` | CPU không chia cho số lõi | bị giết |
| SK6 | `soak.py` | bỏ phần ngày của thời gian CPU | bị giết |
| SK7 | `soak.py` | chưa đủ 2 giờ vẫn đạt | bị giết |
| SK8 | `soak.py` | lấy mẫu dừng sớm một mẫu | bị giết |
| NA1 | `netaudit.py` | request tới `127.0.0.1` (tiến trình phụ) bị tính | bị giết |
| NA2 | `netaudit.py` | request không theo lịch trong lúc dịch không bị báo | bị giết |
| NA3 | `netaudit.py` | từ mồi so phân biệt hoa thường, không NFC | bị giết |
| NA4 | `netaudit.py` | thân request vượt giới hạn 1 byte không bị báo | bị giết |
| NA5 | `netaudit.py` | proxy không thấy request nào vẫn đạt | bị giết |
| NA6 | `netaudit.py` | lấy luật khớp đầu tiên, không phải dài nhất | bị giết |
| NA7 | `netaudit.py` | thân `audio/*` không bị báo | bị giết |
| NA8 | `netaudit.py` | từ mồi trong URL không bị báo | bị giết |
| RP1 | `report.py` | A2 đạt khi chỉ có một hạng máy | bị giết |
| RP2 | `report.py` | A6 đạt khi còn mục chưa đánh dấu | bị giết |
| RP3 | `report.py` | bảng đối chiếu luôn đạt | bị giết |
| RP4 | `report.py` | A1 đạt khi còn ô `chưa thử` | bị giết |
| RP5 | `report.py` | kết luận chung ĐẠT khi còn tiêu chí chưa có số liệu | bị giết |
| RP6 | `report.py` | một file đạt là cả tiêu chí đạt | bị giết |
| MP7 | `mapping.py` | `hoãn` nhận một ngày bất kỳ, không cần "chủ dự án duyệt" (N1 của review lần 1) | bị giết |
| GA9 | `gates.py` | A2: bỏ luật lượt đo đáng tin của `summarize.py` (Q1) | bị giết |
| GA10 | `gates.py` | A2: hạng máy không lấy từ nhãn (Q1) | bị giết |
| GA11 | `gates.py` | A2: lượt tắt ghép câu vẫn được tính (Q1) | bị giết |
| GA12 | `gates.py` | A3: thiếu một gói của mốc vẫn đạt (Q2) | bị giết |
| SK9 | `soak.py` | không đòi tiến trình bắt buộc có mặt (Q3) | bị giết |
| SK10 | `soak.py` | không giữ tiến trình con cháu của app (WebView2) (Q3) | bị giết |
| SK11 | `soak.py` | mọi pid đều tính là khởi động lại (hai WebContent cùng lúc) (Q3) | bị giết |
| NA9 | `netaudit.py` | thiếu mốc Bắt đầu, Dừng vẫn đạt (N2) | bị giết |
| RP7 | `report.py` | thiếu một máy hay một gói của tập bắt buộc vẫn đạt (Q2) | bị giết |
| RP8 | `report.py` | file mang tên gói này mà chứa gói kia vẫn đạt (Q2) | bị giết |

## Bảng task → commit tham chiếu

Cây tham chiếu: `meeting-translator-work/p08-repo`, nhánh `plan08` (dựng bằng cách chạy lại kế hoạch từ file, từ `b2ea5b0`). Mỗi task có code ứng với đúng một commit; cây sau mỗi commit khớp từng byte với chuỗi dựng thử ban đầu (nhánh `p08`).

| Task | Commit | Thông điệp |
|---|---|---|
| 08a Task 1 | `c8cb762` | feat(bench): kiểm bảng đối chiếu của kế hoạch 00: đếm trạng thái, nhóm việc đang chặn, điều kiện đủ 100% (kế hoạch 08) |
| 08a Task 2 | `582cb17` | feat(bench): cổng số liệu A2, A3, A4 của nghiệm thu, dùng lại luật chống thụt lùi của score_mt.py (kế hoạch 08) |
| 08a Task 3 | `3d17650` | feat(bench): soak test A5 và tải máy: lấy mẫu RAM, thời gian CPU của app và tiến trình phụ trên macOS và Windows (kế hoạch 08) |
| 08a Task 4 | `bcc9e5f` | feat(bench): kiểm nhật ký mạng A7 qua proxy: máy chủ, đường dẫn, request trong lúc dịch, thân request, từ mồi (kế hoạch 08) |
| 08a Task 5 | `86163e8` | feat(bench): báo cáo nghiệm thu A1–A7 và bảng đối chiếu; mẫu ma trận A1, danh sách A6 (kế hoạch 08) |
| 08a Task 6 | `34198e8` | docs(bench): bảng công cụ nghiệm thu Giai đoạn 1 (kế hoạch 08) |

08b là điều phối các bước của người, không có commit tham chiếu.

---

## Task 1: Bảng đối chiếu (`mapping.py`)

Kế hoạch 00, mục 4 (bảng đối chiếu) và Task 5 (kiểm đủ 100% trước khi phát hành); bàn giao của mục 2.8. QĐ1, QĐ2.

- `summary`: đếm năm trạng thái, nhóm các dòng chưa xong theo việc đang chặn: mã việc chờ, tài khoản, điểm cần quyết (`C…`, `T…`, `Q…`, `P05-…`) trong Ghi chú; phần cần người (`(người)` ở cột Kế hoạch hay chữ "người" trong Ghi chú); phần Windows; việc của chủ dự án (`CDA`). "T8 `adb1e7b`" là Task 8 kèm SHA, không phải tài khoản T8. Dòng không có dấu nào vào nhóm "khác".
- `check`: các lỗi định dạng của Task 2 Step 5 (số cột, trạng thái lạ, số trùng), cộng mọi dòng chưa `xong`, và dòng `hoãn` mà Ghi chú không có đúng cụm "chủ dự án duyệt YYYY-MM-DD" (một ngày bất kỳ, như ngày kiểm, không đủ; N1 của review lần 1). Rỗng là đủ 100%; mã thoát 1 nếu chưa.
- Thay ba lệnh `awk` của Task 2 Step 5 và Task 5 Step 1 kế hoạch 00 bằng một lệnh có test.

**Files:**
- Create: `bench/phase1/acceptance/mapping.py`
- Create: `bench/phase1/acceptance/test_mapping.py`

- [ ] **Step 1: Viết test trước**

Tạo `bench/phase1/acceptance/test_mapping.py`:

```python
"""Test của mapping.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapping import blockers, parse, release_problems, summary  # noqa: E402

TABLE = """# Bảng
| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 1 | Thu âm | 02, 08 | A1 ở 08; chờ C1 (người) | chờ |
| 2 | Ký số | 07 | Chờ T1, T2 | chưa làm |
| 3 | Thử Windows | 02 (Win) | | đang làm |
| 4 | Quyết định | CDA, 02 | Điểm cần quyết 1 | chưa làm |
| 5 | Xong rồi | 01 | 01: Task 2 `4e0dfe9` | xong |
| 6 | Để sau | 08 | hoãn, chủ dự án duyệt 2026-10-05 | hoãn |
"""


class Parse(unittest.TestCase):
    def test_rows_and_statuses(self):
        rows, problems = parse(TABLE)
        self.assertEqual(problems, [])
        self.assertEqual([r.num for r in rows], [1, 2, 3, 4, 5, 6])
        self.assertEqual([r.status for r in rows], ["chờ", "chưa làm", "đang làm", "chưa làm", "xong", "hoãn"])
        self.assertEqual(rows[0].line, 4)

    def test_format_problems(self):
        bad = TABLE + "| 7 | Thiếu cột | 01 | xong |\n| 8 | A | 01 | | xong rồi |\n| 5 | Trùng | 01 | | xong |\n"
        _, problems = parse(bad)
        self.assertEqual(len(problems), 3)
        self.assertIn("sai số cột", problems[0])
        self.assertIn("trạng thái lạ", problems[1])
        self.assertIn("bị trùng", problems[2])


class Blockers(unittest.TestCase):
    def test_codes_and_tags(self):
        rows, _ = parse(TABLE)
        self.assertEqual(blockers(rows[0]), ["C1", "người"])
        self.assertEqual(blockers(rows[1]), ["T1", "T2"])
        self.assertEqual(blockers(rows[2]), ["Windows"])
        self.assertEqual(blockers(rows[3]), ["chủ dự án"])

    def test_codes_inside_words_and_shas_are_not_codes(self):
        rows, _ = parse("| 9 | x | 01 | SHA `c13ab` và C130 nhưng ATC1, Q1A | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["C130"])

    def test_a_task_with_its_commit_is_not_an_account_code(self):
        rows, _ = parse("| 9 | x | 04 | 04: T8 `adb1e7b`, T11 `1797cd1`; chờ T1, T2 | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["T1", "T2"])

    def test_people_and_windows_written_in_the_note(self):
        rows, _ = parse("| 9 | x | 06 | thử tay chờ 06b Task 6 (cần người); 01 Task 25 dòng 3 (Win) | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["người", "Windows"])

    def test_people_tag(self):
        rows, _ = parse("| 9 | x | 08 (người), 02 | | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["người"])

    def test_no_marker_is_other(self):
        rows, _ = parse("| 9 | x | 07 | | chưa làm |\n")
        self.assertEqual(blockers(rows[0]), ["khác"])


class Summary(unittest.TestCase):
    def test_counts_and_groups_skip_done_and_postponed(self):
        rows, _ = parse(TABLE)
        counts, groups = summary(rows)
        self.assertEqual(counts, {"chưa làm": 2, "đang làm": 1, "chờ": 1, "xong": 1, "hoãn": 1})
        self.assertEqual(groups, {"C1": [1], "T1": [2], "T2": [2], "Windows": [3], "chủ dự án": [4], "người": [1]})

    def test_groups_are_sorted_by_size(self):
        rows, _ = parse("| 1 | a | 07 | T1 | chờ |\n| 2 | b | 07 | C6 | chờ |\n| 3 | c | 07 | C6 | chờ |\n")
        self.assertEqual(list(summary(rows)[1]), ["C6", "T1"])


class Release(unittest.TestCase):
    def test_every_row_not_done_blocks_the_release(self):
        rows, problems = parse(TABLE)
        issues = release_problems(rows, problems)
        self.assertEqual(issues, ["#1: chờ", "#2: chưa làm", "#3: đang làm", "#4: chưa làm"])

    def test_postponed_needs_the_owner_approval_with_its_date(self):
        text = ("| 1 | a | 08 | chủ dự án duyệt | hoãn |\n"
                "| 2 | b | 08 | hoãn, chủ dự án duyệt 2026-10-05 | hoãn |\n"
                "| 3 | c | 02, 08 | 02 kiểm ngày 2026-10-01; vẫn tắt, kiểm 2026-11-02 | hoãn |\n")
        rows, problems = parse(text)
        why = "hoãn mà Ghi chú không có \"chủ dự án duyệt YYYY-MM-DD\""
        self.assertEqual(release_problems(rows, problems), [f"#1: {why}", f"#3: {why}"])

    def test_format_problems_block_the_release(self):
        rows, problems = parse("| 1 | a | 01 | | xong |\n| 1 | b | 01 | | xong |\n")
        self.assertEqual(len(release_problems(rows, problems)), 1)

    def test_all_done_is_ready(self):
        rows, problems = parse("| 1 | a | 01 | `abc1234` | xong |\n")
        self.assertEqual(release_problems(rows, problems), [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_mapping.py' 2>&1 | grep -E '^(ImportError|ModuleNotFoundError)' | sort -u
```
Expected (lúc lập kế hoạch; chưa có module):
```text
ImportError: Failed to import test module: test_mapping
ModuleNotFoundError: No module named 'mapping'
```

- [ ] **Step 3: Viết code**

Tạo `bench/phase1/acceptance/mapping.py`:

```python
"""Bảng đối chiếu spec → kế hoạch con (mục 4 của kế hoạch Giai đoạn 1 · 00).

Đếm trạng thái, nhóm các dòng chưa xong theo việc đang chặn (mã C, T, Q, P05-…, phần cần người, phần Windows, việc của
chủ dự án), và kiểm điều kiện phát hành của Task 5 kế hoạch 00: mọi dòng `xong`, hoặc `hoãn` có cụm "chủ dự án duyệt YYYY-MM-DD" trong
Ghi chú.

Chạy từ gốc repo:
  python3 bench/phase1/acceptance/mapping.py summary
  python3 bench/phase1/acceptance/mapping.py check
"""
import argparse
import json
import os
import re
import sys
from dataclasses import asdict, dataclass

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PLAN = os.path.join(ROOT, "docs", "superpowers", "plans", "2026-10-01-giai-doan-1-00-tong-quan.md")
STATUSES = ("chưa làm", "đang làm", "chờ", "xong", "hoãn")
ROW = re.compile(r"^\| ([0-9]+) \|")
# Mã việc chờ (mục 5 kế hoạch 00) và điểm cần quyết. Không nhận "T8 `adb1e7b`": đó là Task 8 kèm SHA của commit.
CODE = re.compile(r"(?<![0-9A-Za-z])(C[0-9]+|T[0-9]+|Q[0-9]+|P05-[0-9]+)(?![0-9A-Za-z])(?! `)")
# Dòng `hoãn` ghi đúng cụm này trong Ghi chú; một ngày bất kỳ (ngày kiểm, ngày đo) không phải ngày duyệt.
APPROVED = re.compile(r"chủ dự án duyệt [0-9]{4}-[0-9]{2}-[0-9]{2}")


@dataclass
class Row:
    num: int
    requirement: str
    plans: str
    note: str
    status: str
    line: int


def parse(text):
    """Trả (các dòng của bảng, các lỗi định dạng). Dòng của bảng là dòng bắt đầu bằng `| <số> |`."""
    rows, problems, seen = [], [], set()
    for i, line in enumerate(text.splitlines(), start=1):
        if not ROW.match(line):
            continue
        cells = line.split("|")
        if len(cells) != 7:
            problems.append(f"dòng {i}: sai số cột ({len(cells) - 2} thay vì 5)")
            continue
        num = int(cells[1])
        status = cells[5].strip()
        if status not in STATUSES:
            problems.append(f"dòng {i} (#{num}): trạng thái lạ {status!r}")
        if num in seen:
            problems.append(f"dòng {i}: số {num} bị trùng")
        seen.add(num)
        rows.append(Row(num, cells[2].strip(), cells[3].strip(), cells[4].strip(), status, i))
    return rows, problems


def blockers(row):
    """Việc đang chặn một dòng chưa xong: mã trong Ghi chú, cộng phần cần người, Windows, chủ dự án ở cột Kế hoạch."""
    found = list(dict.fromkeys(CODE.findall(row.note)))
    if "(người)" in row.plans or "người" in row.note:
        found.append("người")
    if "(Win)" in row.plans or "Win)" in row.note or "Windows" in row.note:
        found.append("Windows")
    if "CDA" in row.plans:
        found.append("chủ dự án")
    return found or ["khác"]


def summary(rows):
    counts = {s: sum(r.status == s for r in rows) for s in STATUSES}
    groups = {}
    for r in rows:
        if r.status in ("xong", "hoãn"):
            continue
        for b in blockers(r):
            groups.setdefault(b, []).append(r.num)
    return counts, dict(sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])))


def release_problems(rows, problems):
    """Lý do chưa phát hành được (Task 5 kế hoạch 00); rỗng là đủ 100%."""
    out = list(problems)
    for r in rows:
        if r.status not in ("xong", "hoãn"):
            out.append(f"#{r.num}: {r.status}")
        elif r.status == "hoãn" and not APPROVED.search(r.note):
            out.append(f"#{r.num}: hoãn mà Ghi chú không có \"chủ dự án duyệt YYYY-MM-DD\"")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Bảng đối chiếu của kế hoạch Giai đoạn 1 · 00.")
    ap.add_argument("command", choices=["summary", "check"])
    ap.add_argument("--file", default=PLAN)
    ap.add_argument("--json", action="store_true", help="in JSON thay cho Markdown")
    args = ap.parse_args(argv)
    with open(args.file, encoding="utf-8") as f:
        rows, problems = parse(f.read())
    counts, groups = summary(rows)
    issues = release_problems(rows, problems)
    if args.json:
        print(json.dumps({"rows": len(rows), "counts": counts, "groups": groups, "problems": problems,
                          "release_ready": not issues, "pending": [asdict(r) for r in rows
                                                                   if r.status not in ("xong", "hoãn")]},
                         ensure_ascii=False, indent=1))
    elif args.command == "summary":
        parts = ", ".join(f"{s} {counts[s]}" for s in STATUSES)
        print(f"Tổng: {len(rows)} dòng; {parts}.")
        for p in problems:
            print(f"Lỗi định dạng: {p}")
        print("| Việc chặn | Số dòng | Dòng |")
        print("|---|---|---|")
        for name, nums in groups.items():
            print(f"| {name} | {len(nums)} | {', '.join(map(str, nums))} |")
    else:
        for p in issues:
            print(p)
        print("đủ 100%" if not issues else f"chưa đủ: {len(issues)} lý do")
    return 0 if args.command == "summary" or not issues else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_mapping.py' -v 2>&1 | grep -E ' \.\.\. |^Ran |^OK|^FAILED' | sed -E 's/ in [0-9.]+s$//'
```
Expected (lúc lập kế hoạch):
```text
test_a_task_with_its_commit_is_not_an_account_code (test_mapping.Blockers.test_a_task_with_its_commit_is_not_an_account_code) ... ok
test_codes_and_tags (test_mapping.Blockers.test_codes_and_tags) ... ok
test_codes_inside_words_and_shas_are_not_codes (test_mapping.Blockers.test_codes_inside_words_and_shas_are_not_codes) ... ok
test_no_marker_is_other (test_mapping.Blockers.test_no_marker_is_other) ... ok
test_people_and_windows_written_in_the_note (test_mapping.Blockers.test_people_and_windows_written_in_the_note) ... ok
test_people_tag (test_mapping.Blockers.test_people_tag) ... ok
test_format_problems (test_mapping.Parse.test_format_problems) ... ok
test_rows_and_statuses (test_mapping.Parse.test_rows_and_statuses) ... ok
test_all_done_is_ready (test_mapping.Release.test_all_done_is_ready) ... ok
test_every_row_not_done_blocks_the_release (test_mapping.Release.test_every_row_not_done_blocks_the_release) ... ok
test_format_problems_block_the_release (test_mapping.Release.test_format_problems_block_the_release) ... ok
test_postponed_needs_the_owner_approval_with_its_date (test_mapping.Release.test_postponed_needs_the_owner_approval_with_its_date) ... ok
test_counts_and_groups_skip_done_and_postponed (test_mapping.Summary.test_counts_and_groups_skip_done_and_postponed) ... ok
test_groups_are_sorted_by_size (test_mapping.Summary.test_groups_are_sorted_by_size) ... ok
Ran 14 tests
OK
```

Run:
```bash
python3 bench/phase1/acceptance/mapping.py summary | head -1
```
Expected (lúc lập kế hoạch):
```text
Tổng: 357 dòng; chưa làm 28, đang làm 13, chờ 117, xong 199, hoãn 0.
```

Run:
```bash
python3 bench/phase1/acceptance/mapping.py check | tail -1; echo "mã thoát: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
chưa đủ: 158 lý do
mã thoát: 1
```

- [ ] **Step 5: Commit**

```bash
git add bench/phase1/acceptance/mapping.py \
  bench/phase1/acceptance/test_mapping.py
git commit -m "feat(bench): kiểm bảng đối chiếu của kế hoạch 00: đếm trạng thái, nhóm việc đang chặn, điều kiện đủ 100% (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 2: Cổng số liệu A2, A3, A4 (`gates.py`)

Spec §3.3 (A2, A3, A4), §8 (ngân sách độ trễ). QĐ3, QĐ4.

- `a2`: đọc JSON của `latency-bench latency` (cùng định dạng S6, `bench/phase0/latency/run_matrix.py`) và dùng lại đúng luật của `bench/phase0/latency/summarize.py` (Q1 của review lần 1): ngưỡng `A2` (khuyến nghị p50 2000, p90 3000, chữ đầu tiên 1000 ms; tối thiểu p50 3500 ms), hạng máy lấy từ nhãn (`-khuyennghi-`, `-toithieu-`; không có cờ `--class`), lượt tắt ghép câu không tính, và lượt đo không đáng tin (`problems`: đo dưới 85% số câu, phát lại trễ quá 100 ms, mốc dừng lệch quá 300 ms) là không đạt. Thiếu số hay không có lượt nào được tính là không đạt.
- `a3`: dùng lại `regression_lines` của `bench/phase0/mt/score_mt.py` (không viết lại luật thụt lùi 0,01), cộng mức sàn Anh→Việt 0,83 (Q8_0), 0,80 (Q4_K_M) cho lượt không có ngữ cảnh (`-plain`). Mọi lượt `-plain` của mốc (cả hai gói) phải có mặt (Q2).
- `a4`: so `a4_<nhãn>.json` của `score_asr.py` với mốc `a4_m4pro-{turbo,small}-final.json` từng nhóm (`en`, `en-nb`, …), WER hay CER theo mốc, xấu hơn quá 10% tương đối là không đạt; thiếu nhóm là không đạt. `--pack` ghi tên gói vào JSON để `report.py` kiểm đủ hai gói.
- Chạy thử trên số liệu GĐ0 có sẵn: 12 session S6 đều đạt A2; mốc so với chính nó đạt A3, A4.

**Files:**
- Create: `bench/phase1/acceptance/gates.py`
- Create: `bench/phase1/acceptance/test_gates.py`

- [ ] **Step 1: Viết test trước**

Tạo `bench/phase1/acceptance/test_gates.py`:

```python
"""Test của gates.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gates import gate_a2, gate_a3, gate_a4  # noqa: E402


def session(tier, p50, p90, first, measured=21, lag=10, offset=40, merge="true", machine="m1"):
    """Một file của `latency-bench latency` (các trường `summarize.py` cần)."""
    return {"label": f"{machine}-{tier}-chuan-en", "config": {"merge": merge},
            "summary": {"utterances": 21, "measured": measured, "merges": 4, "feed_lag_max_ms": lag,
                        "end_offset_max_abs_ms": offset, "shown_p50_ms": p50, "shown_p90_ms": p90, "first_p50_ms": first}}


class A2(unittest.TestCase):
    def test_recommended_machine_limits(self):
        ok = gate_a2([session("khuyennghi", 1999, 2999, 999), session("khuyennghi", 2000, 3000, 1000)])
        self.assertTrue(ok["pass"])
        self.assertEqual(ok["classes"], ["khuyennghi"])
        slow = gate_a2([session("khuyennghi", 2001, 1500, 600), session("khuyennghi", 900, 3001, 1001)])
        self.assertFalse(slow["pass"])
        self.assertEqual([r["failed"] for r in slow["sessions"]],
                         [["shown_p50_ms"], ["shown_p90_ms", "first_p50_ms"]])

    def test_minimum_machine_only_limits_p50(self):
        self.assertTrue(gate_a2([session("toithieu", 3500, 9000, 3000)])["pass"])
        self.assertFalse(gate_a2([session("toithieu", 3501, 100, 100)])["pass"])

    def test_the_class_comes_from_the_label(self):
        out = gate_a2([session("khuyennghi", 3000, 2000, 900), session("toithieu", 3000, 2000, 900)])
        self.assertEqual(out["classes"], ["khuyennghi", "toithieu"])
        self.assertEqual([r["failed"] for r in out["sessions"]], [["shown_p50_ms"], []])
        nolabel = session("khuyennghi", 900, 900, 900)
        nolabel["label"] = "m1-chuan-en"
        self.assertFalse(gate_a2([nolabel])["pass"])

    def test_an_untrustworthy_run_cannot_pass(self):
        """Luật "lượt đo đáng tin" của bench/phase0/latency/summarize.py (Q1 của review 08 lần 1)."""
        for bad in (dict(measured=5), dict(lag=900), dict(offset=400)):
            out = gate_a2([session("khuyennghi", 800, 900, 500, **bad)])
            self.assertFalse(out["pass"], bad)
            self.assertTrue(out["sessions"][0]["failed"][0].startswith(("chỉ đo được", "phát lại trễ", "mốc dừng lệch")))

    def test_a_run_without_merging_is_left_out(self):
        out = gate_a2([session("khuyennghi", 5000, 9000, 900, merge="false"), session("khuyennghi", 900, 900, 900)])
        self.assertTrue(out["pass"])
        self.assertEqual(out["sessions"][0]["skipped"], "lượt tắt ghép câu")
        self.assertFalse(gate_a2([session("khuyennghi", 900, 900, 900, merge="false")])["pass"])

    def test_a_missing_value_or_no_session_fails(self):
        partial = session("khuyennghi", 900, 900, 900)
        del partial["summary"]["first_p50_ms"]
        self.assertFalse(gate_a2([partial])["pass"])
        self.assertFalse(gate_a2([])["pass"])


BASE = {"Q8_0-plain": {"en->vi": {"comet": 0.842}, "zh->vi": {"comet": 0.829}},
        "Q4_K_M-plain": {"en->vi": {"comet": 0.841}}}


class A3(unittest.TestCase):
    def test_within_0_01_of_the_baseline_passes(self):
        report = {"Q8_0-plain": {"en->vi": {"comet": 0.833}, "zh->vi": {"comet": 0.820}},
                  "Q4_K_M-plain": {"en->vi": {"comet": 0.832}}}
        out = gate_a3(report, BASE)
        self.assertTrue(out["pass"], out)

    def test_more_than_0_01_below_regresses(self):
        report = {"Q8_0-plain": {"en->vi": {"comet": 0.842}, "zh->vi": {"comet": 0.818}}}
        self.assertTrue(gate_a3(report, BASE)["regressed"])
        self.assertFalse(gate_a3(report, BASE)["pass"])

    def test_the_english_floor_applies_per_pack(self):
        base = {"Q8_0-plain": {"en->vi": {"comet": 0.835}}, "Q4_K_M-plain": {"en->vi": {"comet": 0.805}}}
        report = {"Q8_0-plain": {"en->vi": {"comet": 0.829}}, "Q4_K_M-plain": {"en->vi": {"comet": 0.799}}}
        out = gate_a3(report, base)
        self.assertEqual(out["below_floor"], ["Q8_0-plain en->vi 0.829 < 0.83", "Q4_K_M-plain en->vi 0.799 < 0.80"])
        self.assertFalse(out["regressed"])
        self.assertFalse(out["pass"])

    def test_the_floor_does_not_apply_to_runs_with_context(self):
        base = {"Q8_0-context": {"en->vi": {"comet": 0.671}}}
        self.assertTrue(gate_a3({"Q8_0-context": {"en->vi": {"comet": 0.671}}}, base)["pass"])

    def test_a_missing_pack_fails(self):
        """Lượt của mốc mà lượt này không chạy (một gói) là thiếu (Q2 của review 08 lần 1)."""
        out = gate_a3({"Q4_K_M-plain": {"en->vi": {"comet": 0.841}}}, BASE)
        self.assertEqual(out["missing"], ["thiếu lượt Q8_0-plain"])
        self.assertFalse(out["pass"])

    def test_a_missing_direction_fails(self):
        out = gate_a3({"Q8_0-plain": {"en->vi": {"comet": 0.85}}}, BASE)
        self.assertEqual(out["missing"], ["Q8_0-plain: thiếu chiều zh->vi", "thiếu lượt Q4_K_M-plain"])
        self.assertFalse(out["pass"])


class A4(unittest.TestCase):
    BASE = {"en": {"wer": 0.054}, "en-nb": {"wer": 0.105}, "zh": {"cer": 0.056}}

    def test_up_to_10_percent_worse_passes(self):
        out = gate_a4({"en": {"wer": 0.0594}, "en-nb": {"wer": 0.09}, "zh": {"cer": 0.0616}}, self.BASE, "turbo")
        self.assertTrue(out["pass"], out)
        self.assertEqual(out["pack"], "turbo")

    def test_more_than_10_percent_worse_fails(self):
        out = gate_a4({"en": {"wer": 0.0595}, "en-nb": {"wer": 0.09}, "zh": {"cer": 0.05}}, self.BASE, "small")
        self.assertEqual([r["pass"] for r in out["groups"]], [False, True, True])
        self.assertFalse(out["pass"])

    def test_cer_is_used_where_the_baseline_has_cer(self):
        out = gate_a4({"en": {"wer": 0.05}, "en-nb": {"wer": 0.1}, "zh": {"wer": 0.01, "cer": 0.07}}, self.BASE, "small")
        self.assertEqual(out["groups"][2]["metric"], "cer")
        self.assertFalse(out["pass"])

    def test_a_missing_group_fails(self):
        out = gate_a4({"en": {"wer": 0.05}, "zh": {"cer": 0.05}}, self.BASE, "small")
        self.assertEqual(out["missing"], ["en-nb"])
        self.assertFalse(out["pass"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_gates.py' 2>&1 | grep -E '^(ImportError|ModuleNotFoundError)' | sort -u
```
Expected (lúc lập kế hoạch; chưa có module):
```text
ImportError: Failed to import test module: test_gates
ModuleNotFoundError: No module named 'gates'
```

- [ ] **Step 3: Viết code**

Tạo `bench/phase1/acceptance/gates.py`:

```python
"""Cổng số liệu của nghiệm thu (spec §3.3): A2 độ trễ, A3 chất lượng dịch, A4 nhận dạng giọng nói.

- `a2`: file JSON của `latency-bench latency` (mỗi file một session, `bench/phase0/latency/run_matrix.py`). Dùng lại đúng
  luật của `bench/phase0/latency/summarize.py`: ngưỡng `A2` theo hạng máy, hạng lấy từ nhãn (`-khuyennghi-`, `-toithieu-`),
  lượt tắt ghép câu không tính, và lượt đo không đáng tin (`problems`: đo dưới 85% số câu, phát lại trễ, mốc dừng lệch)
  thì không đạt.
- `a3`: kết quả `bench/phase0/mt/score_mt.py --label <nhãn>` (`s7_mt-<nhãn>.json`), so mốc `s7_mt.json` bằng chính hàm
  `regression_lines` của `score_mt.py` (thấp hơn mốc quá 0,01 là thụt lùi), cộng mức sàn Anh→Việt; mọi lượt `-plain` của
  mốc (hai gói) phải có mặt.
- `a4`: kết quả `bench/phase0/asr/score_asr.py` (`a4_<nhãn>.json`), so mốc `a4_m4pro-{turbo,small}-final.json`: mỗi nhóm
  không xấu hơn mốc quá 10% tương đối.

Mỗi lệnh in bảng Markdown, ghi JSON (`--out`) cho `report.py`, và trả mã thoát 1 nếu không đạt.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "phase0", "mt"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "phase0", "latency"))
import summarize  # noqa: E402
from score_mt import regression_lines  # noqa: E402

# A3: mức sàn Anh→Việt theo gói, cho lượt không có ngữ cảnh (cấu hình mặc định, tên lượt kết thúc bằng `-plain`); lượt
# có ngữ cảnh là cờ thử nghiệm, chỉ so mốc.
FLOORS = {"Q8_0": 0.83, "Q4_K_M": 0.80}
# A4: không xấu hơn mốc quá 10% (tương đối).
A4_RELATIVE = 0.10


def tier_of(label):
    """Hạng máy trong nhãn, như `summarize.py`."""
    return next((t for t in summarize.A2 if f"-{t}-" in label), None)


def gate_a2(results):
    """`results`: nội dung các file JSON của `latency-bench latency`. Không có lượt nào được tính thì không đạt."""
    rows = []
    for r in sorted(results, key=lambda r: r["label"]):
        s = r.get("summary", {})
        if r.get("config", {}).get("merge") == "false":
            rows.append({"label": r["label"], "tier": None, "values": {}, "failed": [], "skipped": "lượt tắt ghép câu"})
            continue
        tier = tier_of(r["label"])
        if tier is None:
            failed = ["nhãn không có hạng máy (-khuyennghi- hay -toithieu-)"]
            limits = {}
        else:
            limits = summarize.A2[tier]
            failed = summarize.problems(s) or [k for k, v in limits.items() if s[k] > v]
        rows.append({"label": r["label"], "tier": tier, "values": {k: s.get(k) for k in limits}, "failed": failed})
    counted = [r for r in rows if "skipped" not in r]
    ok = bool(counted) and not any(r["failed"] for r in counted)
    return {"criterion": "A2", "pass": ok, "classes": sorted({r["tier"] for r in counted if r["tier"]}),
            "sessions": rows}


def gate_a3(report, baseline):
    """`report`, `baseline`: phần `runs` của `s7_mt-<nhãn>.json` và `s7_mt.json`."""
    lines, regressed, missing = regression_lines(report, {"runs": baseline})
    # `regression_lines` bỏ qua lượt của mốc mà lượt này không chạy; nghiệm thu cần đủ cả hai gói (Q2 của review 08 lần 1).
    missing += [f"thiếu lượt {name}" for name in sorted(baseline) if name.endswith("-plain") and name not in report]
    below_floor = []
    for name, per_dir in report.items():
        floor = next((v for k, v in FLOORS.items() if k in name), None) if name.endswith("-plain") else None
        comet = per_dir.get("en->vi", {}).get("comet")
        if floor is not None and comet is not None and comet < floor:
            below_floor.append(f"{name} en->vi {comet:.3f} < {floor:.2f}")
    ok = not regressed and not missing and not below_floor
    return {"criterion": "A3", "pass": ok, "regressed": regressed, "missing": missing, "below_floor": below_floor,
            "table": lines}


def gate_a4(result, baseline, pack):
    """`result`, `baseline`: nội dung `a4_<nhãn>.json`, theo nhóm (`en`, `en-nb`, …). `pack`: `turbo` hay `small`."""
    rows, missing = [], []
    for group in sorted(baseline):
        metric = "cer" if "cer" in baseline[group] else "wer"
        if group not in result or metric not in result[group]:
            missing.append(group)
            continue
        base, new = baseline[group][metric], result[group][metric]
        ok = new <= base * (1 + A4_RELATIVE) + 1e-12
        rows.append({"group": group, "metric": metric, "baseline": base, "result": new, "pass": ok})
    ok = bool(rows) and not missing and all(r["pass"] for r in rows)
    return {"criterion": "A4", "pack": pack, "pass": ok, "missing": missing, "groups": rows}


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Cổng số liệu A2, A3, A4 của nghiệm thu.")
    sub = ap.add_subparsers(dest="gate", required=True)
    a2 = sub.add_parser("a2")
    a2.add_argument("files", nargs="+", help="JSON của latency-bench latency (hạng máy lấy từ nhãn)")
    a3 = sub.add_parser("a3")
    a3.add_argument("--report", required=True, help="s7_mt-<nhãn>.json")
    a3.add_argument("--baseline", required=True, help="s7_mt.json")
    a4 = sub.add_parser("a4")
    a4.add_argument("--result", required=True, help="a4_<nhãn>.json")
    a4.add_argument("--baseline", required=True, help="a4_m4pro-<model>-final.json")
    a4.add_argument("--pack", required=True, choices=["turbo", "small"], help="gói đang so (Chuẩn: turbo, Nhẹ: small)")
    for p in (a2, a3, a4):
        p.add_argument("--out", help="ghi kết quả JSON vào file này")
    args = ap.parse_args(argv)

    if args.gate == "a2":
        out = gate_a2([load(f) for f in args.files])
        print("| Session | Hạng | p50 | p90 | Chữ đầu p50 | Kết luận |")
        print("|---|---|---|---|---|---|")
        for r in out["sessions"]:
            v = r["values"]
            vals = " | ".join("—" if v.get(k) is None else f"{v[k]:.0f}"
                              for k in ("shown_p50_ms", "shown_p90_ms", "first_p50_ms"))
            mark = r.get("skipped") or ("đạt" if not r["failed"] else "KHÔNG ĐẠT: " + "; ".join(r["failed"]))
            print(f"| {r['label']} | {r['tier'] or '—'} | {vals} | {mark} |")
    elif args.gate == "a3":
        out = gate_a3(load(args.report)["runs"], load(args.baseline)["runs"])
        print("\n".join(out["table"]))
        for m in out["missing"]:
            print(f"Không so được: {m}")
        for b in out["below_floor"]:
            print(f"Dưới mức sàn: {b}")
    else:
        out = gate_a4(load(args.result), load(args.baseline), args.pack)
        print("| Nhóm | Chỉ số | Mốc | Lượt này | Kết luận |")
        print("|---|---|---|---|---|")
        for r in out["groups"]:
            print(f"| {r['group']} | {r['metric'].upper()} | {r['baseline']:.3f} | {r['result']:.3f} | "
                  f"{'đạt' if r['pass'] else 'XẤU HƠN QUÁ 10%'} |")
        for m in out["missing"]:
            print(f"Thiếu nhóm: {m}")
    print(f"{out['criterion']}: {'ĐẠT' if out['pass'] else 'KHÔNG ĐẠT'}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_gates.py' -v 2>&1 | grep -E ' \.\.\. |^Ran |^OK|^FAILED' | sed -E 's/ in [0-9.]+s$//'
```
Expected (lúc lập kế hoạch):
```text
test_a_missing_value_or_no_session_fails (test_gates.A2.test_a_missing_value_or_no_session_fails) ... ok
test_a_run_without_merging_is_left_out (test_gates.A2.test_a_run_without_merging_is_left_out) ... ok
Luật "lượt đo đáng tin" của bench/phase0/latency/summarize.py (Q1 của review 08 lần 1). ... ok
test_minimum_machine_only_limits_p50 (test_gates.A2.test_minimum_machine_only_limits_p50) ... ok
test_recommended_machine_limits (test_gates.A2.test_recommended_machine_limits) ... ok
test_the_class_comes_from_the_label (test_gates.A2.test_the_class_comes_from_the_label) ... ok
test_a_missing_direction_fails (test_gates.A3.test_a_missing_direction_fails) ... ok
Lượt của mốc mà lượt này không chạy (một gói) là thiếu (Q2 của review 08 lần 1). ... ok
test_more_than_0_01_below_regresses (test_gates.A3.test_more_than_0_01_below_regresses) ... ok
test_the_english_floor_applies_per_pack (test_gates.A3.test_the_english_floor_applies_per_pack) ... ok
test_the_floor_does_not_apply_to_runs_with_context (test_gates.A3.test_the_floor_does_not_apply_to_runs_with_context) ... ok
test_within_0_01_of_the_baseline_passes (test_gates.A3.test_within_0_01_of_the_baseline_passes) ... ok
test_a_missing_group_fails (test_gates.A4.test_a_missing_group_fails) ... ok
test_cer_is_used_where_the_baseline_has_cer (test_gates.A4.test_cer_is_used_where_the_baseline_has_cer) ... ok
test_more_than_10_percent_worse_fails (test_gates.A4.test_more_than_10_percent_worse_fails) ... ok
test_up_to_10_percent_worse_passes (test_gates.A4.test_up_to_10_percent_worse_passes) ... ok
Ran 16 tests
OK
```

Run:
```bash
python3 bench/phase1/acceptance/gates.py a2 bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json
```
Expected (lúc lập kế hoạch):
```text
| Session | Hạng | p50 | p90 | Chữ đầu p50 | Kết luận |
|---|---|---|---|---|---|
| m4pro-chot-khuyennghi-chuan-en | khuyennghi | 1014 | 1147 | 659 | đạt |
| m4pro-chot-khuyennghi-chuan-ja | khuyennghi | 1007 | 1306 | 686 | đạt |
| m4pro-chot-khuyennghi-chuan-ko | khuyennghi | 1019 | 1341 | 650 | đạt |
| m4pro-chot-khuyennghi-chuan-mixed | khuyennghi | 948 | 1247 | 656 | đạt |
| m4pro-chot-khuyennghi-chuan-vi | khuyennghi | 764 | 940 | 631 | đạt |
| m4pro-chot-khuyennghi-chuan-zh | khuyennghi | 1028 | 1187 | 636 | đạt |
| m4pro-chot-khuyennghi-nhe-en | khuyennghi | 734 | 926 | 522 | đạt |
| m4pro-chot-khuyennghi-nhe-ja | khuyennghi | 796 | 990 | 565 | đạt |
| m4pro-chot-khuyennghi-nhe-ko | khuyennghi | 822 | 996 | 550 | đạt |
| m4pro-chot-khuyennghi-nhe-mixed | khuyennghi | 752 | 987 | 530 | đạt |
| m4pro-chot-khuyennghi-nhe-vi | khuyennghi | 613 | 725 | 517 | đạt |
| m4pro-chot-khuyennghi-nhe-zh | khuyennghi | 844 | 1142 | 521 | đạt |
A2: ĐẠT
```

Run:
```bash
python3 bench/phase1/acceptance/gates.py a3 --report bench/phase0/results/s7_mt.json --baseline bench/phase0/results/s7_mt.json | tail -1
```
Expected (lúc lập kế hoạch):
```text
A3: ĐẠT
```

Run:
```bash
python3 bench/phase1/acceptance/gates.py a4 --pack small --result bench/phase0/results/a4_m4pro-small-final.json --baseline bench/phase0/results/a4_m4pro-small-final.json | tail -1
```
Expected (lúc lập kế hoạch):
```text
A4: ĐẠT
```

- [ ] **Step 5: Commit**

```bash
git add bench/phase1/acceptance/gates.py \
  bench/phase1/acceptance/test_gates.py
git commit -m "feat(bench): cổng số liệu A2, A3, A4 của nghiệm thu, dùng lại luật chống thụt lùi của score_mt.py (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 3: Soak test A5 và tải máy (`soak.py`)

Spec §3.3 (A5), §8 (CPU trung bình ≤ 30% trên máy khuyến nghị), §11 (soak test). QĐ5, QĐ6.

- `sample`: mỗi 10 giây (mặc định) chụp danh sách tiến trình (`ps -A -o pid=,ppid=,rss=,time=,comm=` trên macOS; PowerShell `Win32_Process` dạng JSON trên Windows), giữ `meeting-translator`, `asr-worker*`, `llama-server`, WebView của app, ghi CSV ngay sau mỗi mẫu (mất điện giữa chừng vẫn còn số liệu). Ctrl+C để dừng sớm.
- WebView (§8 tính RAM "App và WebView"; Q3 của review lần 1): trên Windows giữ mọi tiến trình con cháu của app (`--app`), gồm `msedgewebview2`; trên macOS giữ `com.apple.WebKit.*` theo tên (tiến trình XPC có cha là `launchd`), nên lúc đo không mở app WebKit nào khác.
- `summarize`: A5 đạt khi mọi tên trong `--require` (mặc định app và hai tiến trình phụ) có ở mẫu đầu, đủ 2 giờ, không tiến trình nào biến mất, không có pid mới của một tên sau mẫu đầu (hai WebContent cùng lúc từ đầu không tính là khởi động lại), và tổng RSS lớn nhất sau giờ đầu không quá 110% trung bình của phút 55–60. Tải máy: tổng thời gian CPU (theo từng pid) chia thời gian thực và số lõi logic; thiếu tiến trình bắt buộc thì cũng không đạt.
- Phần Windows chỉ test bằng JSON mẫu; chạy thật ở 08b Task 6.

**Files:**
- Create: `bench/phase1/acceptance/soak.py`
- Create: `bench/phase1/acceptance/test_soak.py`

- [ ] **Step 1: Viết test trước**

Tạo `bench/phase1/acceptance/test_soak.py`:

```python
"""Test của soak.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from soak import parse_cputime, parse_powershell, parse_ps, read_csv, sample, select, summarize  # noqa: E402

NAMES = ("meeting-translator", "asr-worker", "llama-server", "com.apple.WebKit")
REQUIRE = ("meeting-translator", "asr-worker", "llama-server")

PS = """    1     0  13264   0:12.34 /sbin/launchd
  812     1 120000   1:02.50 /Applications/AI Translator.app/Contents/MacOS/meeting-translator
  830   812 650000   2:03:04.00 /Applications/AI Translator.app/Contents/MacOS/asr-worker
  831   812 2100000 1-00:00:01 /Applications/AI Translator.app/Contents/MacOS/llama-server
  840     1 300000   0:30.00 /System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent
  900     1   2000   0:00.01 /bin/zsh
"""

WIN = ('[{"ProcessId":4,"ParentProcessId":0,"Name":"System","WorkingSetSize":1024,"KernelModeTime":0,"UserModeTime":0},'
       '{"ProcessId":70,"ParentProcessId":4,"Name":"meeting-translator.exe","WorkingSetSize":"104857600",'
       '"KernelModeTime":20000000,"UserModeTime":30000000},'
       '{"ProcessId":77,"ParentProcessId":70,"Name":"asr-worker-vulkan.exe","WorkingSetSize":2097152,'
       '"KernelModeTime":0,"UserModeTime":122500000},'
       '{"ProcessId":80,"ParentProcessId":70,"Name":"msedgewebview2.exe","WorkingSetSize":4194304,'
       '"KernelModeTime":10000000,"UserModeTime":0},'
       '{"ProcessId":81,"ParentProcessId":80,"Name":"msedgewebview2.exe","WorkingSetSize":1048576,'
       '"KernelModeTime":0,"UserModeTime":0},'
       '{"ProcessId":90,"ParentProcessId":4,"Name":"msedgewebview2.exe","WorkingSetSize":9999999,'
       '"KernelModeTime":0,"UserModeTime":0}]')


class Parse(unittest.TestCase):
    def test_cputime_formats(self):
        self.assertEqual(parse_cputime("0:12.34"), 12.34)
        self.assertEqual(parse_cputime("2:03:04.00"), 7384.0)
        self.assertEqual(parse_cputime("1-00:00:01"), 86401.0)

    def test_ps_keeps_the_app_its_sidecars_and_webkit(self):
        rows = select(parse_ps(PS), NAMES, "meeting-translator")
        self.assertEqual([r[:2] for r in rows], [(812, "meeting-translator"), (830, "asr-worker"),
                                                  (831, "llama-server"), (840, "com.apple.WebKit.WebContent")])
        self.assertEqual(rows[2][2], 2100000)
        self.assertEqual(rows[0][3], 62.5)

    def test_windows_keeps_every_descendant_of_the_app(self):
        """WebView2 (`msedgewebview2`) là con của app; WebView2 của app khác (pid 90) không tính (Q3 của review 08 lần 1)."""
        rows = select(parse_powershell(WIN), REQUIRE, "meeting-translator")
        self.assertEqual(rows, [(70, "meeting-translator", 102400, 5.0), (77, "asr-worker-vulkan", 2048, 12.25),
                                (80, "msedgewebview2", 4096, 1.0), (81, "msedgewebview2", 1024, 0.0)])
        one = '{"ProcessId":5,"ParentProcessId":1,"Name":"meeting-translator.exe","WorkingSetSize":1024,"UserModeTime":0}'
        self.assertEqual(select(parse_powershell(one), REQUIRE, "meeting-translator"),
                         [(5, "meeting-translator", 1, 0.0)])


def run(hours, ram=lambda t: 1000 * 1024, cpu_rate=0.5, every=60, restart_at=None, vanish_at=None):
    """Mẫu giả: ba tiến trình, mỗi `every` giây; tổng RAM theo hàm `ram(t)` (KiB), CPU `cpu_rate` giây mỗi giây."""
    rows = []
    for k in range(int(hours * 3600 / every) + 1):
        t = k * every
        for i, name in enumerate(REQUIRE):
            if vanish_at is not None and name == "llama-server" and t >= vanish_at:
                continue
            pid = 100 + i + (1000 if restart_at is not None and name == "asr-worker" and t >= restart_at else 0)
            rows.append((float(t), pid, name, ram(t) // 3, cpu_rate * t / 3))
    return rows


class Summarize(unittest.TestCase):
    def test_a_steady_two_hour_run_passes(self):
        out = summarize(run(2), ncpu=10)
        self.assertTrue(out["pass_a5"], out)
        self.assertAlmostEqual(out["ram_growth"], 0.0, places=3)
        self.assertAlmostEqual(out["cpu_avg"], 0.05, places=3)
        self.assertTrue(out["pass_cpu"])

    def test_ram_growth_over_10_percent_after_the_first_hour_fails(self):
        grow = summarize(run(2, ram=lambda t: 1000 * 1024 if t <= 3600 else 1101 * 1024), ncpu=10)
        self.assertFalse(grow["pass_a5"])
        self.assertAlmostEqual(grow["ram_growth"], 0.101, places=3)
        ok = summarize(run(2, ram=lambda t: 1000 * 1024 if t <= 3600 else 1099 * 1024), ncpu=10)
        self.assertTrue(ok["pass_a5"])

    def test_growth_inside_the_first_hour_does_not_count(self):
        out = summarize(run(2, ram=lambda t: 500 * 1024 if t < 3300 else 1000 * 1024), ncpu=10)
        self.assertTrue(out["pass_a5"], out)

    def test_too_short_fails(self):
        out = summarize(run(1.5), ncpu=10)
        self.assertFalse(out["long_enough"])
        self.assertFalse(out["pass_a5"])

    def test_a_restart_or_a_vanished_process_fails(self):
        restarted = summarize(run(2, restart_at=4000), ncpu=10)
        self.assertEqual(restarted["restarts"], {"asr-worker": 1})
        self.assertFalse(restarted["pass_a5"])
        vanished = summarize(run(2, vanish_at=5000), ncpu=10)
        self.assertEqual(vanished["missing"], ["llama-server"])
        self.assertFalse(vanished["pass_a5"])

    def test_cpu_over_30_percent_of_the_machine_fails(self):
        out = summarize(run(2, cpu_rate=3.1), ncpu=10)
        self.assertAlmostEqual(out["cpu_avg"], 0.31, places=3)
        self.assertFalse(out["pass_cpu"])
        self.assertTrue(out["pass_a5"])

    def test_no_samples(self):
        self.assertFalse(summarize([], ncpu=10)["pass_a5"])

    def test_a_required_process_absent_from_the_start_fails(self):
        """Gõ sai tên app ở `--names`, hay app không chạy: không đạt (Q3 của review 08 lần 1)."""
        rows = [r for r in run(2) if r[2] != "meeting-translator"]
        out = summarize(rows, ncpu=10, require=REQUIRE)
        self.assertEqual(out["absent"], ["meeting-translator"])
        self.assertFalse(out["pass_a5"])
        self.assertFalse(out["pass_cpu"])

    def test_two_webviews_at_once_are_not_a_restart(self):
        rows = run(2)
        rows += [(t, 500 + k, "com.apple.WebKit.WebContent", 1000, 0.0) for t in sorted({r[0] for r in rows})
                 for k in (0, 1)]
        out = summarize(rows, ncpu=10)
        self.assertEqual(out["restarts"], {})
        self.assertTrue(out["pass_a5"], out)


class Sample(unittest.TestCase):
    def test_writes_one_row_per_process_per_tick(self):
        now = [0.0]

        def clock():
            return now[0]

        def sleep(s):
            now[0] += s

        snap = lambda names, app: [(1, "meeting-translator", 1000, now[0] / 10), (2, "llama-server", 2000, 0.0)]  # noqa
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "s.csv")
            self.assertEqual(sample(NAMES, 10, 30, path, snap=snap, clock=clock, sleep=sleep), 4)
            rows = read_csv(path)
        self.assertEqual(len(rows), 8)
        self.assertEqual(sorted({r[0] for r in rows}), [0.0, 10.0, 20.0, 30.0])
        self.assertEqual(rows[-2], (30.0, 1, "meeting-translator", 1000, 3.0))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_soak.py' 2>&1 | grep -E '^(ImportError|ModuleNotFoundError)' | sort -u
```
Expected (lúc lập kế hoạch; chưa có module):
```text
ImportError: Failed to import test module: test_soak
ModuleNotFoundError: No module named 'soak'
```

- [ ] **Step 3: Viết code**

Tạo `bench/phase1/acceptance/soak.py`:

```python
"""Soak test A5 (spec §3.3, §11) và tải máy (§8): lấy mẫu RAM và thời gian CPU của app và hai tiến trình phụ.

- `sample`: mỗi `--every` giây chụp danh sách tiến trình (macOS: `ps`; Windows: PowerShell `Win32_Process`), giữ tiến
  trình có tên chứa một trong `--names` và mọi tiến trình con cháu của app (`--app`), ghi CSV `t_s,pid,name,rss_kib,cpu_s`
  (giây từ lúc bắt đầu, RSS hay working set, tổng thời gian CPU). Dừng sau `--duration` giây hoặc khi bấm Ctrl+C; mỗi mẫu
  ghi ngay xuống file.
- WebView (spec §8 tính RAM "App và WebView"): trên Windows, `msedgewebview2` là con của app nên được giữ theo cây tiến
  trình; trên macOS, tiến trình XPC của WebKit (`com.apple.WebKit.*`) có cha là `launchd`, nên giữ theo tên, và lúc đo
  không được mở app WebKit nào khác (Safari, Mail…).
- `summarize`: A5 đạt khi mọi tên trong `--require` có mặt ở mẫu đầu, chạy đủ `--hours` giờ, không tiến trình nào biến mất
  hay khởi động lại (pid mới của một tên xuất hiện sau mẫu đầu), và RAM tổng sau giờ đầu không vượt quá 110% RAM trung
  bình của phút 55–60. Tải máy: tổng thời gian CPU chia thời gian thực và số lõi logic, mục tiêu ≤ 30% trên máy khuyến
  nghị.

RSS của `llama-server` tính cả trang file model được mmap (§8), nên số tuyệt đối lớn hơn `phys_footprint`; A5 chỉ so
tương đối nên không ảnh hưởng.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
import time

DEFAULT_NAMES = ("meeting-translator", "asr-worker", "llama-server", "com.apple.WebKit")
DEFAULT_APP = "meeting-translator"
DEFAULT_REQUIRE = ("meeting-translator", "asr-worker", "llama-server")
RAM_GROWTH_MAX = 0.10
CPU_AVG_MAX = 0.30


def parse_cputime(text):
    """Thời gian CPU của `ps -o time=`: `[[dd-]hh:]mm:ss[.ss]`, ra giây."""
    days = 0
    if "-" in text:
        d, text = text.split("-", 1)
        days = int(d)
    parts = [float(p) for p in text.split(":")]
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + p
    return days * 86400 + seconds


def matches(name, names):
    return any(n in name for n in names)


def parse_ps(text):
    """Output của `ps -A -o pid=,ppid=,rss=,time=,comm=` (macOS): (pid, ppid, tên, RSS KiB, CPU giây).
    `comm` có thể là đường dẫn có dấu cách."""
    out = []
    for line in text.splitlines():
        fields = line.split(None, 4)
        if len(fields) < 5:
            continue
        pid, ppid, rss, cputime, comm = fields
        out.append((int(pid), int(ppid), os.path.basename(comm.strip()), int(rss), parse_cputime(cputime)))
    return out


def parse_powershell(text):
    """JSON của `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,
    KernelModeTime,UserModeTime | ConvertTo-Json` (Windows). Thời gian CPU tính bằng đơn vị 100 ns."""
    data = json.loads(text or "[]")
    if isinstance(data, dict):
        data = [data]
    out = []
    for p in data:
        name = (p.get("Name") or "").removesuffix(".exe")
        cpu = (int(p.get("KernelModeTime") or 0) + int(p.get("UserModeTime") or 0)) / 1e7
        out.append((int(p["ProcessId"]), int(p.get("ParentProcessId") or 0), name,
                    int(p.get("WorkingSetSize") or 0) // 1024, cpu))
    return out


def select(procs, names, app):
    """Giữ tiến trình có tên chứa một trong `names`, và mọi tiến trình con cháu của tiến trình có tên chứa `app`."""
    parent = {pid: ppid for pid, ppid, _, _, _ in procs}
    roots = {pid for pid, _, name, _, _ in procs if app in name}

    def under_app(pid):
        seen = set()
        while pid in parent and pid not in seen:
            seen.add(pid)
            pid = parent[pid]
            if pid in roots:
                return True
        return False

    return [(pid, name, rss, cpu) for pid, _, name, rss, cpu in procs if matches(name, names) or under_app(pid)]


def snapshot(names, app=DEFAULT_APP):
    if sys.platform == "win32":
        cmd = ["powershell", "-NoProfile", "-Command",
               "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,"
               "KernelModeTime,UserModeTime | ConvertTo-Json -Compress"]
        text = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
        return select(parse_powershell(text), names, app)
    text = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,rss=,time=,comm="], capture_output=True, text=True,
                          check=True).stdout
    return select(parse_ps(text), names, app)


def sample(names, every, duration, out_path, snap=snapshot, clock=time.monotonic, sleep=time.sleep, app=DEFAULT_APP):
    """Ghi CSV; trả số mẫu đã lấy."""
    start = clock()
    taken = 0
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["t_s", "pid", "name", "rss_kib", "cpu_s"])
        try:
            while True:
                t = clock() - start
                for pid, name, rss, cpu in snap(names, app):
                    w.writerow([f"{t:.1f}", pid, name, rss, f"{cpu:.2f}"])
                f.flush()
                taken += 1
                # Dừng theo lịch mẫu, không theo đồng hồ: mẫu thứ k ở giây k × every, mẫu cuối không quá duration.
                if taken * every > duration:
                    break
                sleep(max(0.0, start + taken * every - clock()))
        except KeyboardInterrupt:
            pass
    return taken


def read_csv(path):
    with open(path, encoding="utf-8") as f:
        return [(float(r["t_s"]), int(r["pid"]), r["name"], int(r["rss_kib"]), float(r["cpu_s"]))
                for r in csv.DictReader(f)]


def summarize(rows, ncpu, hours=2.0, require=DEFAULT_REQUIRE):
    """Tổng hợp các mẫu (t, pid, tên, RSS KiB, CPU giây)."""
    times = sorted({r[0] for r in rows})
    if not times:
        return {"samples": 0, "absent": list(require), "pass_a5": False, "pass_cpu": False}
    t0, t1 = times[0], times[-1]
    by_time = {}
    for t, pid, name, rss, cpu in rows:
        by_time.setdefault(t, []).append((pid, name, rss, cpu))
    every = (t1 - t0) / (len(times) - 1) if len(times) > 1 else 0.0
    duration = t1 - t0
    # Tên bắt buộc (app, hai tiến trình phụ) phải có ở mẫu đầu. Biến mất: tên có ở mẫu đầu mà vắng ở một mẫu sau đó.
    # Khởi động lại: pid mới của một tên xuất hiện sau mẫu đầu (nhiều pid cùng tên ngay từ đầu, như hai WebContent, thì
    # không tính).
    first_names = {name for _, name, _, _ in by_time[t0]}
    absent = [n for n in require if not any(n in name for name in first_names)]
    missing = sorted({n for t in times for n in first_names - {name for _, name, _, _ in by_time[t]}})
    first_pids = {pid for pid, _, _, _ in by_time[t0]}
    restarts = {}
    for _, pid, name, _, _ in rows:
        if pid not in first_pids:
            restarts.setdefault(name, set()).add(pid)
    restarts = {n: len(p) for n, p in sorted(restarts.items())}
    total_mib = {t: sum(r[2] for r in by_time[t]) / 1024 for t in times}
    hour1 = [total_mib[t] for t in times if 3300 <= t - t0 <= 3600]
    after = [total_mib[t] for t in times if t - t0 > 3600]
    ram_hour1 = sum(hour1) / len(hour1) if hour1 else None
    ram_after = max(after) if after else None
    growth = ram_after / ram_hour1 - 1 if ram_hour1 and ram_after is not None else None
    cpu_by_pid = {}
    for _, pid, _, _, cpu in rows:
        lo, hi = cpu_by_pid.get(pid, (cpu, cpu))
        cpu_by_pid[pid] = (min(lo, cpu), max(hi, cpu))
    cpu_s = sum(hi - lo for lo, hi in cpu_by_pid.values())
    cpu_avg = cpu_s / (duration * ncpu) if duration > 0 else None
    long_enough = duration >= hours * 3600 - 2 * every
    pass_a5 = (not absent and long_enough and not missing and not restarts and growth is not None
               and growth <= RAM_GROWTH_MAX)
    return {
        "samples": len(times), "duration_s": duration, "long_enough": long_enough, "absent": absent, "missing": missing,
        "restarts": restarts, "ram_hour1_mib": ram_hour1, "ram_after_max_mib": ram_after, "ram_growth": growth,
        "ram_peak_mib": max(total_mib.values()), "cpu_avg": cpu_avg, "ncpu": ncpu, "pass_a5": pass_a5,
        "pass_cpu": not absent and cpu_avg is not None and cpu_avg <= CPU_AVG_MAX,
    }


def fmt(value, spec):
    return "—" if value is None else format(value, spec)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Soak test A5 và tải máy §8.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample")
    s.add_argument("--names", default=",".join(DEFAULT_NAMES), help="tên tiến trình, cách nhau bằng dấu phẩy")
    s.add_argument("--app", default=DEFAULT_APP, help="tên tiến trình của app: giữ thêm mọi tiến trình con cháu của nó")
    s.add_argument("--every", type=float, default=10.0)
    s.add_argument("--duration", type=float, default=2 * 3600 + 120)
    s.add_argument("--out", required=True)
    m = sub.add_parser("summarize")
    m.add_argument("csv")
    m.add_argument("--hours", type=float, default=2.0)
    m.add_argument("--ncpu", type=int, default=os.cpu_count())
    m.add_argument("--require", default=",".join(DEFAULT_REQUIRE),
                   help="tên phải có ở mẫu đầu (thiếu là không đạt), cách nhau bằng dấu phẩy")
    m.add_argument("--out", help="ghi kết quả JSON vào file này")
    args = ap.parse_args(argv)
    if args.cmd == "sample":
        n = sample(tuple(x for x in args.names.split(",") if x), args.every, args.duration, args.out, app=args.app)
        print(f"{n} mẫu, ghi {args.out}")
        return 0
    out = summarize(read_csv(args.csv), args.ncpu, args.hours, tuple(x for x in args.require.split(",") if x))
    print(f"Số mẫu: {out['samples']}; thời gian: {fmt(out.get('duration_s'), '.0f')} giây "
          f"({'đủ' if out.get('long_enough') else 'chưa đủ'} {args.hours:g} giờ)")
    if out.get("absent"):
        print(f"THIẾU tiến trình bắt buộc ở mẫu đầu: {', '.join(out['absent'])}")
    print(f"Biến mất: {', '.join(out.get('missing', [])) or 'không'}; khởi động lại: "
          f"{', '.join(f'{k} {v} lần' for k, v in out.get('restarts', {}).items()) or 'không'}")
    print(f"RAM: phút 55–60 {fmt(out.get('ram_hour1_mib'), '.0f')} MiB, lớn nhất sau giờ đầu "
          f"{fmt(out.get('ram_after_max_mib'), '.0f')} MiB, tăng {fmt(out.get('ram_growth'), '+.1%')}")
    print(f"CPU trung bình: {fmt(out.get('cpu_avg'), '.1%')} của {out.get('ncpu')} lõi")
    print(f"A5: {'ĐẠT' if out['pass_a5'] else 'KHÔNG ĐẠT'}; tải máy ≤ 30%: {'ĐẠT' if out['pass_cpu'] else 'KHÔNG ĐẠT'}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0 if out["pass_a5"] and out["pass_cpu"] else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_soak.py' -v 2>&1 | grep -E ' \.\.\. |^Ran |^OK|^FAILED' | sed -E 's/ in [0-9.]+s$//'
```
Expected (lúc lập kế hoạch):
```text
test_cputime_formats (test_soak.Parse.test_cputime_formats) ... ok
test_ps_keeps_the_app_its_sidecars_and_webkit (test_soak.Parse.test_ps_keeps_the_app_its_sidecars_and_webkit) ... ok
WebView2 (`msedgewebview2`) là con của app; WebView2 của app khác (pid 90) không tính (Q3 của review 08 lần 1). ... ok
test_writes_one_row_per_process_per_tick (test_soak.Sample.test_writes_one_row_per_process_per_tick) ... ok
Gõ sai tên app ở `--names`, hay app không chạy: không đạt (Q3 của review 08 lần 1). ... ok
test_a_restart_or_a_vanished_process_fails (test_soak.Summarize.test_a_restart_or_a_vanished_process_fails) ... ok
test_a_steady_two_hour_run_passes (test_soak.Summarize.test_a_steady_two_hour_run_passes) ... ok
test_cpu_over_30_percent_of_the_machine_fails (test_soak.Summarize.test_cpu_over_30_percent_of_the_machine_fails) ... ok
test_growth_inside_the_first_hour_does_not_count (test_soak.Summarize.test_growth_inside_the_first_hour_does_not_count) ... ok
test_no_samples (test_soak.Summarize.test_no_samples) ... ok
test_ram_growth_over_10_percent_after_the_first_hour_fails (test_soak.Summarize.test_ram_growth_over_10_percent_after_the_first_hour_fails) ... ok
test_too_short_fails (test_soak.Summarize.test_too_short_fails) ... ok
test_two_webviews_at_once_are_not_a_restart (test_soak.Summarize.test_two_webviews_at_once_are_not_a_restart) ... ok
Ran 13 tests
OK
```

Run:
```bash
d=$(mktemp -d) && python3 bench/phase1/acceptance/soak.py sample --names launchd --app khong-co-app --every 1 --duration 2 --out "$d/s.csv" >/dev/null && python3 bench/phase1/acceptance/soak.py summarize "$d/s.csv" --require launchd | head -2
```
Expected (lúc lập kế hoạch):
```text
Số mẫu: 3; thời gian: 2 giây (chưa đủ 2 giờ)
Biến mất: không; khởi động lại: không
```

Run:
```bash
d=$(mktemp -d) && python3 bench/phase1/acceptance/soak.py sample --names launchd --app khong-co-app --every 1 --duration 1 --out "$d/s.csv" >/dev/null && python3 bench/phase1/acceptance/soak.py summarize "$d/s.csv" | sed -n 2p
```
Expected (lúc lập kế hoạch):
```text
THIẾU tiến trình bắt buộc ở mẫu đầu: meeting-translator, asr-worker, llama-server
```

- [ ] **Step 5: Commit**

```bash
git add bench/phase1/acceptance/soak.py \
  bench/phase1/acceptance/test_soak.py
git commit -m "feat(bench): soak test A5 và tải máy: lấy mẫu RAM, thời gian CPU của app và tiến trình phụ trên macOS và Windows (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 4: Kiểm mạng A7 qua proxy (`netaudit.py`)

Spec §3.3 (A7), §10.1 (app chỉ kết nối mạng để …), §10.2. QĐ7, QĐ8.

- Đọc nhật ký HAR của proxy (mitmproxy, Proxyman, Charles đều xuất được) và danh sách cho phép (`a7-allow.template.json`: máy chủ, đường dẫn, đường dẫn nào được gọi trong lúc dịch, giới hạn thân request, từ mồi).
- Báo vi phạm: máy chủ hay đường dẫn lạ; request không theo lịch trong khoảng Bắt đầu…Dừng (hai mốc bắt buộc; N2 của review lần 1); thân request quá giới hạn hay có kiểu âm thanh, multipart, nhị phân; URL hay thân request chứa từ mồi (cụm của câu đã phát vào app và của bản dịch app đã hiện, so sau NFC và chữ thường). Không có request ra ngoài nào cũng là không đạt (proxy không thấy app).
- Nhật ký chỉ được có lưu lượng của app và tiến trình phụ (mitmproxy `--mode local:…`; Q4 của review lần 1): HAR không ghi tiến trình gửi, nên request của trình duyệt hay app khác sẽ thành vi phạm.
- Request tới `127.0.0.1`, `localhost` (hai tiến trình phụ) bỏ qua: không ra khỏi máy.

**Files:**
- Create: `bench/phase1/acceptance/a7-allow.template.json`
- Create: `bench/phase1/acceptance/netaudit.py`
- Create: `bench/phase1/acceptance/test_netaudit.py`

- [ ] **Step 1: Viết test trước**

Tạo `bench/phase1/acceptance/test_netaudit.py`:

```python
"""Test của netaudit.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netaudit import audit, when  # noqa: E402

ALLOW = {
    "hosts": {
        "license.example": [
            {"path": "/v1/licenses/validate", "during_session": True},
            {"path": "/v1/plans", "during_session": True},
            {"path": "/v1/checkout", "during_session": False},
        ],
        "models.example": [{"path": "/manifest/", "during_session": True}],
    },
    "max_body_bytes": 256,
    "canaries": ["plotting analysis", "Kết quả phân tích"],
}
START, STOP = when("2026-10-03T10:00:00+07:00"), when("2026-10-03T11:00:00+07:00")


def entry(url, at="2026-10-03T10:30:00+07:00", method="GET", body=None, mime="application/json"):
    req = {"method": method, "url": url, "bodySize": -1 if body is None else len(body.encode())}
    if body is not None:
        req["postData"] = {"mimeType": mime, "text": body}
    return {"startedDateTime": at, "request": req}


def har(*entries):
    return {"log": {"entries": list(entries)}}


class Audit(unittest.TestCase):
    def test_scheduled_requests_during_the_session_pass(self):
        out = audit(har(entry("https://license.example/v1/licenses/validate", method="POST",
                              body='{"key":"X","activation_id":"a"}'),
                        entry("https://models.example/manifest/models.json"),
                        entry("http://127.0.0.1:8080/completion", body="x" * 5000)), ALLOW, START, STOP)
        self.assertTrue(out["pass"], out)
        self.assertEqual((out["external"], out["in_session"]), (2, 2))

    def test_unknown_host_or_path_fails(self):
        out = audit(har(entry("https://tracker.example/collect"),
                        entry("https://license.example/v1/admin/x")), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["máy chủ không có trong danh sách cho phép", "đường dẫn không có trong danh sách cho phép"])

    def test_unscheduled_request_only_fails_during_the_session(self):
        before = entry("https://license.example/v1/checkout", at="2026-10-03T09:59:59+07:00", method="POST", body="{}")
        during = entry("https://license.example/v1/checkout", method="POST", body="{}")
        self.assertTrue(audit(har(before), ALLOW, START, STOP)["pass"])
        out = audit(har(during), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["gọi trong lúc dịch mà không phải việc chạy theo lịch"])

    def test_large_or_audio_bodies_fail(self):
        big = entry("https://license.example/v1/plans", method="POST", body="a" * 257)
        audio = entry("https://license.example/v1/plans", method="POST", body="RIFF", mime="audio/wav")
        out = audit(har(big, audio), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]], ["thân request 257 byte, quá 256", "kiểu audio/wav"])

    def test_a_canary_in_the_body_or_the_url_fails(self):
        body = entry("https://license.example/v1/plans", method="POST", body='{"t":"the PLOTTING analysis"}')
        url = entry("https://license.example/v1/plans?q=k%E1%BA%BFt%20qu%E1%BA%A3%20ph%C3%A2n%20t%C3%ADch")
        out = audit(har(body, url), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["có từ mồi 'plotting analysis'", "có từ mồi 'kết quả phân tích'"])

    def test_no_external_request_means_the_proxy_saw_nothing(self):
        out = audit(har(entry("http://localhost:9000/health")), ALLOW, START, STOP)
        self.assertFalse(out["pass"])
        self.assertEqual(out["violations"][0]["reason"], "không có request ra ngoài nào: kiểm lại proxy")

    def test_the_session_window_is_required(self):
        """Thiếu mốc Bắt đầu, Dừng thì luật "trong lúc dịch" không chạy được: không đạt (N2 của review 08 lần 1)."""
        out = audit(har(entry("https://license.example/v1/plans")), ALLOW)
        self.assertEqual([v["reason"] for v in out["violations"]], ["thiếu mốc Bắt đầu, Dừng của phiên dịch"])
        self.assertFalse(out["pass"])

    def test_the_longest_matching_rule_wins(self):
        allow = {"hosts": {"license.example": [{"path": "/v1/", "during_session": False},
                                               {"path": "/v1/plans", "during_session": True}]}}
        self.assertTrue(audit(har(entry("https://license.example/v1/plans")), allow, START, STOP)["pass"])
        self.assertFalse(audit(har(entry("https://license.example/v1/other")), allow, START, STOP)["pass"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_netaudit.py' 2>&1 | grep -E '^(ImportError|ModuleNotFoundError)' | sort -u
```
Expected (lúc lập kế hoạch; chưa có module):
```text
ImportError: Failed to import test module: test_netaudit
ModuleNotFoundError: No module named 'netaudit'
```

- [ ] **Step 3: Viết code**

Tạo `bench/phase1/acceptance/a7-allow.template.json`:

```json
{
 "_note": "Mẫu cho netaudit.py (A7). Chép thành bench/phase1/results/acceptance/a7-allow.json, thay LICENSE_HOST, MODELS_HOST, UPDATE_HOST bằng máy chủ thật của bản đang thử (URL của license server, của manifest model và của latest.json trong bản build). Từ mồi: cụm của câu sẽ phát vào app lúc thử (câu mẫu của bước Nghe thử), cộng cụm của bản dịch mà app hiện trong lúc thử (chép từ bản chép lời xuất ra sau khi dừng; mặc định có một cụm thường gặp).",
 "hosts": {
  "LICENSE_HOST": [
   {"path": "/v1/licenses/validate", "during_session": true},
   {"path": "/v1/plans", "during_session": true},
   {"path": "/v1/licenses/activate", "during_session": false},
   {"path": "/v1/licenses/deactivate", "during_session": false},
   {"path": "/v1/licenses/recover", "during_session": false},
   {"path": "/v1/checkout", "during_session": false},
   {"path": "/v1/orders/", "during_session": false}
  ],
  "MODELS_HOST": [
   {"path": "/", "during_session": false},
   {"path": "/models.json", "during_session": true}
  ],
  "UPDATE_HOST": [
   {"path": "/", "during_session": false},
   {"path": "/latest.json", "during_session": true}
  ]
 },
 "max_body_bytes": 4096,
 "canaries": [
  "plotting analysis",
  "public website",
  "kết quả phân tích"
 ]
}
```

Tạo `bench/phase1/acceptance/netaudit.py`:

```python
"""A7 (spec §3.3, §10.1): kiểm nhật ký mạng của một lần thử, ghi qua proxy ở dạng HAR (mitmproxy `--set hardump=…`,
Proxyman, Charles đều xuất được).

Luật:
- Mọi request ra ngoài (trừ `127.0.0.1`, `localhost`, `::1`) phải tới máy chủ và đường dẫn có trong danh sách cho phép
  (`--allow`, JSON). Mỗi đường dẫn ghi kèm có được gọi trong lúc dịch không (`during_session`): A7 chỉ cho các việc chạy
  theo lịch (kiểm tra bản quyền, hỏi giờ của license server, kiểm tra cập nhật app và manifest model).
- Trong khoảng `--start`…`--stop` (lúc bấm Bắt đầu tới lúc bấm Dừng; bắt buộc) chỉ request có `during_session: true`.
- Không request nào có thân lớn hơn `max_body_bytes`, hay có kiểu `audio/*`, `multipart/*`, `application/octet-stream`.
- Không URL hay thân request nào chứa một "từ mồi" (`canaries`): cụm từ có trong câu đã phát vào app lúc thử. So sau khi
  chuẩn hóa NFC và đổi chữ thường.
- Phải có ít nhất một request ra ngoài, để chứng minh proxy thật sự thấy lưu lượng của app. Nhật ký phải chỉ có lưu lượng
  của app và tiến trình phụ (mitmproxy `--mode local:…`, hay lọc theo app trong Proxyman trước khi xuất): HAR không ghi
  tiến trình gửi, nên request của trình duyệt hay app khác sẽ thành vi phạm.
"""
import argparse
import json
import sys
import unicodedata
from datetime import datetime
from urllib.parse import unquote, urlsplit

LOCAL = {"127.0.0.1", "localhost", "::1", "[::1]"}
BAD_TYPES = ("audio/", "multipart/", "application/octet-stream")


def fold(text):
    return unicodedata.normalize("NFC", text).lower()


def when(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def allowed_path(rules, path):
    """Luật khớp dài nhất theo tiền tố đường dẫn, hay None."""
    hits = [r for r in rules if path.startswith(r["path"])]
    return max(hits, key=lambda r: len(r["path"])) if hits else None


def audit(har, allow, start=None, stop=None):
    canaries = [fold(c) for c in allow.get("canaries", [])]
    limit = allow.get("max_body_bytes", 4096)
    violations, external, in_session = [], 0, 0
    for e in har["log"]["entries"]:
        req = e["request"]
        url = urlsplit(req["url"])
        host = url.hostname or ""
        if host in LOCAL:
            continue
        external += 1
        t = when(e["startedDateTime"])
        during = start is not None and stop is not None and start <= t <= stop
        in_session += during
        reasons = []
        rule = allowed_path(allow["hosts"].get(host, []), url.path or "/")
        if host not in allow["hosts"]:
            reasons.append("máy chủ không có trong danh sách cho phép")
        elif rule is None:
            reasons.append("đường dẫn không có trong danh sách cho phép")
        elif during and not rule.get("during_session", False):
            reasons.append("gọi trong lúc dịch mà không phải việc chạy theo lịch")
        post = req.get("postData") or {}
        body = post.get("text") or ""
        size = max(req.get("bodySize") or 0, len(body.encode("utf-8")))
        if size > limit:
            reasons.append(f"thân request {size} byte, quá {limit}")
        mime = (post.get("mimeType") or "").lower()
        if mime.startswith(BAD_TYPES):
            reasons.append(f"kiểu {mime}")
        haystack = fold(unquote(req["url"])) + "\n" + fold(body)
        for c in canaries:
            if c in haystack:
                reasons.append(f"có từ mồi {c!r}")
        for r in reasons:
            violations.append({"time": e["startedDateTime"], "method": req["method"], "url": req["url"], "reason": r})
    if start is None or stop is None:
        violations.append({"time": None, "method": None, "url": None, "reason": "thiếu mốc Bắt đầu, Dừng của phiên dịch"})
    if external == 0:
        violations.append({"time": None, "method": None, "url": None,
                           "reason": "không có request ra ngoài nào: kiểm lại proxy"})
    return {"criterion": "A7", "external": external, "in_session": in_session, "violations": violations,
            "pass": not violations}


def main(argv=None):
    ap = argparse.ArgumentParser(description="A7: kiểm nhật ký HAR của một lần thử qua proxy.")
    ap.add_argument("har")
    ap.add_argument("--allow", required=True, help="JSON: hosts, max_body_bytes, canaries")
    ap.add_argument("--start", required=True, help="lúc bấm Bắt đầu, ISO 8601 có múi giờ")
    ap.add_argument("--stop", required=True, help="lúc bấm Dừng, ISO 8601 có múi giờ")
    ap.add_argument("--out", help="ghi kết quả JSON vào file này")
    args = ap.parse_args(argv)
    with open(args.har, encoding="utf-8") as f:
        har = json.load(f)
    with open(args.allow, encoding="utf-8") as f:
        allow = json.load(f)
    out = audit(har, allow, when(args.start), when(args.stop))
    print(f"Request ra ngoài: {out['external']}; trong lúc dịch: {out['in_session']}")
    for v in out["violations"]:
        print(f"VI PHẠM: {v['method'] or ''} {v['url'] or ''} — {v['reason']}".replace("  ", " "))
    print(f"A7: {'ĐẠT' if out['pass'] else 'KHÔNG ĐẠT'}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_netaudit.py' -v 2>&1 | grep -E ' \.\.\. |^Ran |^OK|^FAILED' | sed -E 's/ in [0-9.]+s$//'
```
Expected (lúc lập kế hoạch):
```text
test_a_canary_in_the_body_or_the_url_fails (test_netaudit.Audit.test_a_canary_in_the_body_or_the_url_fails) ... ok
test_large_or_audio_bodies_fail (test_netaudit.Audit.test_large_or_audio_bodies_fail) ... ok
test_no_external_request_means_the_proxy_saw_nothing (test_netaudit.Audit.test_no_external_request_means_the_proxy_saw_nothing) ... ok
test_scheduled_requests_during_the_session_pass (test_netaudit.Audit.test_scheduled_requests_during_the_session_pass) ... ok
test_the_longest_matching_rule_wins (test_netaudit.Audit.test_the_longest_matching_rule_wins) ... ok
Thiếu mốc Bắt đầu, Dừng thì luật "trong lúc dịch" không chạy được: không đạt (N2 của review 08 lần 1). ... ok
test_unknown_host_or_path_fails (test_netaudit.Audit.test_unknown_host_or_path_fails) ... ok
test_unscheduled_request_only_fails_during_the_session (test_netaudit.Audit.test_unscheduled_request_only_fails_during_the_session) ... ok
Ran 8 tests
OK
```

Run:
```bash
python3 -c "import json; a = json.load(open('bench/phase1/acceptance/a7-allow.template.json')); print(sorted(a['hosts']), a['max_body_bytes'], a['canaries'])"
```
Expected (lúc lập kế hoạch):
```text
['LICENSE_HOST', 'MODELS_HOST', 'UPDATE_HOST'] 4096 ['plotting analysis', 'public website', 'kết quả phân tích']
```

Run:
```bash
python3 bench/phase1/acceptance/netaudit.py /dev/null --allow bench/phase1/acceptance/a7-allow.template.json 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
netaudit.py: error: the following arguments are required: --start, --stop
```

- [ ] **Step 5: Commit**

```bash
git add bench/phase1/acceptance/a7-allow.template.json \
  bench/phase1/acceptance/netaudit.py \
  bench/phase1/acceptance/test_netaudit.py
git commit -m "feat(bench): kiểm nhật ký mạng A7 qua proxy: máy chủ, đường dẫn, request trong lúc dịch, thân request, từ mồi (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 5: Báo cáo nghiệm thu (`report.py`) và mẫu A1, A6

Bàn giao của mục 2.8 kế hoạch 00 (báo cáo nghiệm thu, số liệu gốc commit trong `bench/`). QĐ9, QĐ10.

- Gom kết quả trong `bench/phase1/results/acceptance/` (bảng ở đầu `report.py`) và bảng đối chiếu thành `report.md`: mỗi tiêu chí `đạt`, `không đạt` hay `chưa có số liệu`, kèm đường dẫn bằng chứng. Kết luận chung chỉ ĐẠT khi mọi dòng đạt; thiếu số liệu không bao giờ thành đạt.
- Mỗi tiêu chí có tập số liệu bắt buộc (`REQUIRED`; Q2 của review lần 1): A2 đủ hạng khuyến nghị và hạng tối thiểu (lấy từ nhãn); A3 đủ hai gói (`gates.py` kiểm); A4 `a4-turbo.json` và `a4-small.json`; A5, tải máy và A7 một máy Mac và một máy Windows (`a5-mac`, `a5-win`, `a7-mac`, `a7-win`). Thiếu một file là `chưa có số liệu`; một file không đạt là `không đạt`. A1 còn ô `chưa thử`, A6 còn mục chưa đánh dấu cũng là chưa có số liệu.
- Mẫu cho người điền: `a1-matrix.template.md` (27 ô: mỗi app họp với loa trên macOS 26 và Windows 11, hai loại tai nghe, toàn màn hình, hai màn hình, cộng lượt nhanh trên macOS 14.2, 15, 27, Windows 10), `a6-checklist.template.md` (8 mục).

**Files:**
- Create: `bench/phase1/acceptance/a1-matrix.template.md`
- Create: `bench/phase1/acceptance/a6-checklist.template.md`
- Create: `bench/phase1/acceptance/report.py`
- Create: `bench/phase1/acceptance/test_report.py`

- [ ] **Step 1: Viết test trước**

Tạo `bench/phase1/acceptance/test_report.py`:

```python
"""Test của report.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from report import FAIL, NONE, PASS, build, render  # noqa: E402

PLAN_DONE = "| 1 | a | 01 | `abc1234` | xong |\n| 2 | b | 08 | hoãn, chủ dự án duyệt 2026-10-05 | hoãn |\n"
PLAN_OPEN = "| 1 | a | 01 | | chờ |\n"
MATRIX = """| Hệ điều hành | App họp | Thiết bị | Kết quả |
|---|---|---|---|
| macOS 26 | Zoom | loa | đạt |
| macOS 26 | Teams | tai nghe Bluetooth | {last} |
"""


class Report(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        self.plan = os.path.join(self.dir, "plan.md")
        self.write("plan.md", PLAN_DONE)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, content):
        with open(os.path.join(self.dir, name), "w", encoding="utf-8") as f:
            f.write(content if isinstance(content, str) else json.dumps(content))

    def complete(self):
        self.write("a1-matrix.md", MATRIX.format(last="đạt"))
        self.write("a2-m4pro.json", {"classes": ["khuyennghi"], "pass": True})
        self.write("a2-m1-8gb.json", {"classes": ["toithieu"], "pass": True})
        self.write("a3.json", {"pass": True})
        self.write("a4-turbo.json", {"pack": "turbo", "pass": True})
        self.write("a4-small.json", {"pack": "small", "pass": True})
        self.write("a5-mac.json", {"pass_a5": True, "pass_cpu": True})
        self.write("a5-win.json", {"pass_a5": True, "pass_cpu": True})
        self.write("a6-checklist.md", "- [x] Gatekeeper\n- [x] Gỡ app\n")
        self.write("a7-mac.json", {"pass": True})
        self.write("a7-win.json", {"pass": True})

    def statuses(self):
        return {name: status for name, status, _, _ in build(self.dir, self.plan)}

    def test_everything_passing_is_accepted(self):
        self.complete()
        text, overall = render(build(self.dir, self.plan))
        self.assertTrue(overall)
        self.assertIn("Kết luận: **ĐẠT**", text)
        self.assertEqual(set(self.statuses().values()), {PASS})

    def test_nothing_yet_means_no_data_not_a_pass(self):
        s = self.statuses()
        self.assertEqual(s["A1 Tương thích"], NONE)
        self.assertEqual(s["A7 Quyền riêng tư"], NONE)
        self.assertEqual(s["Bảng đối chiếu (kế hoạch 00, Task 5)"], PASS)
        self.assertFalse(render(build(self.dir, self.plan))[1])

    def test_a_failed_matrix_cell_or_an_untried_one(self):
        self.complete()
        self.write("a1-matrix.md", MATRIX.format(last="không đạt"))
        self.assertEqual(self.statuses()["A1 Tương thích"], FAIL)
        self.write("a1-matrix.md", MATRIX.format(last="chưa thử"))
        self.assertEqual(self.statuses()["A1 Tương thích"], NONE)

    def test_a2_needs_both_machine_classes(self):
        self.complete()
        os.remove(os.path.join(self.dir, "a2-m1-8gb.json"))
        self.assertEqual(self.statuses()["A2 Độ trễ"], NONE)
        self.write("a2-m1-8gb.json", {"classes": ["toithieu"], "pass": False})
        self.assertEqual(self.statuses()["A2 Độ trễ"], FAIL)

    def test_one_failed_file_fails_the_criterion(self):
        self.complete()
        self.write("a4-small.json", {"pack": "small", "pass": False})
        self.write("a7-win.json", {"pass": False})
        self.write("a5-win.json", {"pass_a5": True, "pass_cpu": False})
        s = self.statuses()
        self.assertEqual((s["A4 Nhận dạng giọng nói"], s["A5 Ổn định (2 giờ)"], s["§8 Tải máy ≤ 30%"],
                          s["A7 Quyền riêng tư"]), (FAIL, PASS, FAIL, FAIL))

    def test_part_of_the_required_set_is_not_enough(self):
        """Một gói, một máy là chưa đủ số liệu, kể cả khi file có mặt đều đạt (Q2 của review 08 lần 1)."""
        self.complete()
        for name in ("a4-small.json", "a5-win.json", "a7-win.json"):
            os.remove(os.path.join(self.dir, name))
        rows = {name: (status, detail) for name, status, _, detail in build(self.dir, self.plan)}
        self.assertEqual(rows["A4 Nhận dạng giọng nói"], (NONE, "thiếu: small"))
        self.assertEqual(rows["A5 Ổn định (2 giờ)"], (NONE, "thiếu: win"))
        self.assertEqual(rows["§8 Tải máy ≤ 30%"], (NONE, "thiếu: win"))
        self.assertEqual(rows["A7 Quyền riêng tư"], (NONE, "thiếu: win"))
        self.write("a5-mac.json", {"pass_a5": False, "pass_cpu": True})
        self.assertEqual(self.statuses()["A5 Ổn định (2 giờ)"], FAIL, "một file không đạt là không đạt, kể cả khi còn thiếu")

    def test_a_file_named_for_one_pack_holding_the_other_fails(self):
        self.complete()
        self.write("a4-small.json", {"pack": "turbo", "pass": True})
        self.assertEqual(self.statuses()["A4 Nhận dạng giọng nói"], FAIL)

    def test_an_unchecked_install_item_is_not_done(self):
        self.complete()
        self.write("a6-checklist.md", "- [x] Gatekeeper\n- [ ] SmartScreen\n")
        self.assertEqual(self.statuses()["A6 Cài đặt"], NONE)

    def test_the_templates_read_as_not_tried_yet(self):
        here = os.path.dirname(os.path.abspath(__file__))
        for name in ("a1-matrix", "a6-checklist"):
            with open(os.path.join(here, f"{name}.template.md"), encoding="utf-8") as f:
                self.write(f"{name}.md", f.read())
        rows = {name: (status, detail) for name, status, _, detail in build(self.dir, self.plan)}
        self.assertEqual(rows["A1 Tương thích"], (NONE, "27 ô: đạt 0, không đạt 0, chưa thử 27"))
        self.assertEqual(rows["A6 Cài đặt"], (NONE, "0/8 mục"))

    def test_an_open_mapping_row_blocks_acceptance(self):
        self.complete()
        self.write("plan.md", PLAN_OPEN)
        self.assertEqual(self.statuses()["Bảng đối chiếu (kế hoạch 00, Task 5)"], FAIL)
        self.assertFalse(render(build(self.dir, self.plan))[1])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_report.py' 2>&1 | grep -E '^(ImportError|ModuleNotFoundError)' | sort -u
```
Expected (lúc lập kế hoạch; chưa có module):
```text
ImportError: Failed to import test module: test_report
ModuleNotFoundError: No module named 'report'
```

- [ ] **Step 3: Viết code**

Tạo `bench/phase1/acceptance/a1-matrix.template.md`:

```markdown
# Ma trận A1 (spec §3.3, §11)

Chép thành `bench/phase1/results/acceptance/a1-matrix.md`. Mỗi ô: `đạt` (phụ đề dịch hiện đúng, đủ câu, thanh phụ đề nổi trên app họp, không lấy focus), `không đạt` (ghi lý do ở cột Ghi chú) hay `chưa thử`. Dòng macOS 14.2, 15, 27 và Windows 10 là lượt thử nhanh khi có máy.

| Hệ điều hành | App họp | Thiết bị phát | Hiển thị | Kết quả | Ghi chú |
|---|---|---|---|---|---|
| macOS 26 | Teams (app) | loa | cửa sổ thường | chưa thử | |
| macOS 26 | Zoom (app) | loa | cửa sổ thường | chưa thử | |
| macOS 26 | Google Meet (Chrome) | loa | cửa sổ thường | chưa thử | |
| macOS 26 | Google Meet (Edge) | loa | cửa sổ thường | chưa thử | |
| macOS 26 | Google Meet (Safari) | loa | cửa sổ thường | chưa thử | |
| macOS 26 | Zalo PC | loa | cửa sổ thường | chưa thử | |
| macOS 26 | Zoom (app) | tai nghe có dây | cửa sổ thường | chưa thử | |
| macOS 26 | Zoom (app) | tai nghe Bluetooth | cửa sổ thường | chưa thử | |
| macOS 26 | Teams (app) | tai nghe Bluetooth | cửa sổ thường | chưa thử | |
| macOS 26 | Zoom (app) | loa | toàn màn hình | chưa thử | |
| macOS 26 | Teams (app) | loa | toàn màn hình | chưa thử | |
| macOS 26 | Google Meet (Chrome) | loa | hai màn hình | chưa thử | |
| Windows 11 | Teams (app) | loa | cửa sổ thường | chưa thử | |
| Windows 11 | Zoom (app) | loa | cửa sổ thường | chưa thử | |
| Windows 11 | Google Meet (Chrome) | loa | cửa sổ thường | chưa thử | |
| Windows 11 | Google Meet (Edge) | loa | cửa sổ thường | chưa thử | |
| Windows 11 | Zalo PC | loa | cửa sổ thường | chưa thử | |
| Windows 11 | Zoom (app) | tai nghe có dây | cửa sổ thường | chưa thử | |
| Windows 11 | Zoom (app) | tai nghe Bluetooth | cửa sổ thường | chưa thử | |
| Windows 11 | Teams (app) | tai nghe Bluetooth | cửa sổ thường | chưa thử | |
| Windows 11 | Zoom (app) | loa | toàn màn hình | chưa thử | |
| Windows 11 | Teams (app) | loa | toàn màn hình | chưa thử | |
| Windows 11 | Google Meet (Chrome) | loa | hai màn hình | chưa thử | |
| macOS 14.2 | Zoom (app) | loa | cửa sổ thường | chưa thử | |
| macOS 15 | Zoom (app) | loa | cửa sổ thường | chưa thử | |
| macOS 27 | Zoom (app) | loa | cửa sổ thường | chưa thử | |
| Windows 10 | Zoom (app) | loa | cửa sổ thường | chưa thử | |
```

Tạo `bench/phase1/acceptance/a6-checklist.template.md`:

```markdown
# Danh sách A6 (spec §3.3, §11 "Cài đặt và cập nhật")

Chép thành `bench/phase1/results/acceptance/a6-checklist.md`. Đánh `[x]` khi đã thử và đạt; mục không đạt giữ `[ ]` và ghi lý do ở cuối dòng.

- [ ] macOS: `.dmg` đã ký Developer ID và notarize (`spctl -a -vv` báo `accepted`, `source=Notarized Developer ID`)
- [ ] macOS: mở app lần đầu từ `.dmg` tải qua trình duyệt, Gatekeeper không chặn
- [ ] macOS: nâng cấp từ bản trước qua tự cập nhật, cài khi thoát app (§6.11)
- [ ] macOS: nút "Xóa model và dữ liệu" xóa model, lịch sử, từ điển; giữ bản quyền; kéo app vào Thùng rác không còn tiến trình nào
- [ ] Windows: bộ cài NSIS ký OV, SmartScreen không chặn (hay chỉ cảnh báo trong thời gian xây danh tiếng, ghi rõ)
- [ ] Windows: nâng cấp từ bản trước qua tự cập nhật
- [ ] Windows: gỡ cài đặt có ô "xóa dữ liệu app"; tick thì model và dữ liệu bị xóa, không tick thì giữ
- [ ] Windows: gỡ xong không còn mục khởi động cùng máy, không còn tiến trình nào
```

Tạo `bench/phase1/acceptance/report.py`:

```python
"""Báo cáo nghiệm thu Giai đoạn 1 (spec §3.3): gom kết quả A1–A7 và bảng đối chiếu thành một file Markdown.

Đọc thư mục kết quả (mặc định `bench/phase1/results/acceptance/`):
- `a1-matrix.md`: bảng ma trận tương thích, có cột `Kết quả` mang `đạt`, `không đạt` hay `chưa thử`;
- `a2-*.json`: kết quả `gates.py a2`, mỗi file một máy (cần đủ hạng khuyến nghị và hạng tối thiểu, hạng lấy từ nhãn);
- `a3.json`: kết quả `gates.py a3`;
- `a4-turbo.json`, `a4-small.json`: kết quả `gates.py a4` của từng gói;
- `a5-mac.json`, `a5-win.json`: kết quả `soak.py summarize` (A5; dòng tải máy §8 lấy `pass_cpu` của cùng file);
- `a6-checklist.md`: danh sách `- [x]` / `- [ ]` của phần cài đặt và gỡ (A6);
- `a7-mac.json`, `a7-win.json`: kết quả `netaudit.py` của từng máy.
Thiếu một file của tập bắt buộc (`REQUIRED`) là `chưa có số liệu`, kể cả khi các file có mặt đều đạt; một file không đạt
là `không đạt`.
Cộng bảng đối chiếu của kế hoạch 00 (Task 5: mọi dòng `xong`, hoặc `hoãn` có ngày duyệt).

Mỗi tiêu chí là `đạt`, `không đạt` hay `chưa có số liệu`. Báo cáo chung chỉ ĐẠT khi mọi tiêu chí đạt.
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mapping  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESULTS = os.path.join(ROOT, "bench", "phase1", "results", "acceptance")
PASS, FAIL, NONE = "đạt", "không đạt", "chưa có số liệu"
# Tập số liệu bắt buộc của từng tiêu chí (điểm cần quyết 2 của 08a cho A5): hai gói, hay một máy Mac và một máy Windows.
REQUIRED = {"a4": ("turbo", "small"), "a5": ("mac", "win"), "a7": ("mac", "win")}


def rel(path):
    return os.path.relpath(path, ROOT)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def from_json_files(paths, key="pass"):
    if not paths:
        return NONE
    return PASS if all(load(p).get(key) for p in paths) else FAIL


def required_set(results, prefix, key="pass"):
    """Trạng thái từ các file `<prefix>-<tên>.json` của tập bắt buộc."""
    names = REQUIRED[prefix]
    paths = [os.path.join(results, f"{prefix}-{n}.json") for n in names]
    present = [(n, p) for n, p in zip(names, paths) if os.path.exists(p)]
    found = [p for _, p in present]
    for n, p in present:
        data = load(p)
        if not data.get(key) or data.get("pack", n) != n:
            return FAIL, found, f"{os.path.basename(p)} không đạt"
    missing = [n for n, p in zip(names, paths) if not os.path.exists(p)]
    if missing:
        return NONE, found, "thiếu: " + ", ".join(missing)
    return PASS, found, ", ".join(names)


def a1(results):
    path = os.path.join(results, "a1-matrix.md")
    if not os.path.exists(path):
        return NONE, [], "chưa có ma trận"
    with open(path, encoding="utf-8") as f:
        lines = [l for l in f.read().splitlines() if l.startswith("|")]
    if len(lines) < 3:
        return NONE, [path], "ma trận trống"
    header = [c.strip() for c in lines[0].strip("|").split("|")]
    col = header.index("Kết quả")
    values = [[c.strip() for c in l.strip("|").split("|")][col].lower() for l in lines[2:]]
    counts = {v: values.count(v) for v in (PASS, FAIL, "chưa thử")}
    detail = f"{len(values)} ô: đạt {counts[PASS]}, không đạt {counts[FAIL]}, chưa thử {counts['chưa thử']}"
    if counts[FAIL]:
        return FAIL, [path], detail
    if counts["chưa thử"] or counts[PASS] != len(values):
        return NONE, [path], detail
    return PASS, [path], detail


def a2(results):
    paths = sorted(glob.glob(os.path.join(results, "a2-*.json")))
    classes = set().union(*(load(p).get("classes", []) for p in paths))
    status = from_json_files(paths)
    if status == PASS and not {"khuyennghi", "toithieu"} <= classes:
        return NONE, paths, "thiếu máy khuyến nghị hay máy tối thiểu"
    return status, paths, f"{len(paths)} máy"


def checklist(path):
    if not os.path.exists(path):
        return NONE, [], "chưa có danh sách"
    with open(path, encoding="utf-8") as f:
        text = f.read()
    done = len(re.findall(r"^- \[[xX]\] ", text, re.M))
    todo = len(re.findall(r"^- \[ \] ", text, re.M))
    detail = f"{done}/{done + todo} mục"
    if done + todo == 0:
        return NONE, [path], "danh sách trống"
    return (PASS if todo == 0 else NONE), [path], detail


def build(results, plan):
    rows = [("A1 Tương thích", *a1(results)), ("A2 Độ trễ", *a2(results))]
    a3p = [p for p in [os.path.join(results, "a3.json")] if os.path.exists(p)]
    rows.append(("A3 Chất lượng dịch", from_json_files(a3p), a3p, "chống thụt lùi và mức sàn"))
    rows.append(("A4 Nhận dạng giọng nói", *required_set(results, "a4")))
    rows.append(("A5 Ổn định (2 giờ)", *required_set(results, "a5", "pass_a5")))
    rows.append(("§8 Tải máy ≤ 30%", *required_set(results, "a5", "pass_cpu")))
    rows.append(("A6 Cài đặt", *checklist(os.path.join(results, "a6-checklist.md"))))
    rows.append(("A7 Quyền riêng tư", *required_set(results, "a7")))
    with open(plan, encoding="utf-8") as f:
        table, problems = mapping.parse(f.read())
    issues = mapping.release_problems(table, problems)
    rows.append(("Bảng đối chiếu (kế hoạch 00, Task 5)", PASS if not issues else FAIL, [plan],
                 f"{len(table)} dòng, {len(issues)} chưa xong"))
    return rows


def render(rows):
    overall = all(r[1] == PASS for r in rows)
    lines = ["# Báo cáo nghiệm thu Giai đoạn 1", "",
             f"Kết luận: **{'ĐẠT' if overall else 'CHƯA ĐẠT'}**", "",
             "| Tiêu chí | Kết quả | Chi tiết | Bằng chứng |", "|---|---|---|---|"]
    for name, status, paths, detail in rows:
        evidence = ", ".join(f"`{rel(p)}`" for p in paths) or "—"
        lines.append(f"| {name} | {status} | {detail} | {evidence} |")
    return "\n".join(lines) + "\n", overall


def main(argv=None):
    ap = argparse.ArgumentParser(description="Báo cáo nghiệm thu Giai đoạn 1.")
    ap.add_argument("--results", default=RESULTS)
    ap.add_argument("--plan", default=mapping.PLAN)
    ap.add_argument("--out", help="ghi báo cáo vào file này (mặc định chỉ in)")
    args = ap.parse_args(argv)
    text, overall = render(build(args.results, args.plan))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
    print(text, end="")
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_report.py' -v 2>&1 | grep -E ' \.\.\. |^Ran |^OK|^FAILED' | sed -E 's/ in [0-9.]+s$//'
```
Expected (lúc lập kế hoạch):
```text
test_a2_needs_both_machine_classes (test_report.Report.test_a2_needs_both_machine_classes) ... ok
test_a_failed_matrix_cell_or_an_untried_one (test_report.Report.test_a_failed_matrix_cell_or_an_untried_one) ... ok
test_a_file_named_for_one_pack_holding_the_other_fails (test_report.Report.test_a_file_named_for_one_pack_holding_the_other_fails) ... ok
test_an_open_mapping_row_blocks_acceptance (test_report.Report.test_an_open_mapping_row_blocks_acceptance) ... ok
test_an_unchecked_install_item_is_not_done (test_report.Report.test_an_unchecked_install_item_is_not_done) ... ok
test_everything_passing_is_accepted (test_report.Report.test_everything_passing_is_accepted) ... ok
test_nothing_yet_means_no_data_not_a_pass (test_report.Report.test_nothing_yet_means_no_data_not_a_pass) ... ok
test_one_failed_file_fails_the_criterion (test_report.Report.test_one_failed_file_fails_the_criterion) ... ok
Một gói, một máy là chưa đủ số liệu, kể cả khi file có mặt đều đạt (Q2 của review 08 lần 1). ... ok
test_the_templates_read_as_not_tried_yet (test_report.Report.test_the_templates_read_as_not_tried_yet) ... ok
Ran 10 tests
OK
```

Run:
```bash
python3 bench/phase1/acceptance/report.py | tail -10; echo "mã thoát: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
|---|---|---|---|
| A1 Tương thích | chưa có số liệu | chưa có ma trận | — |
| A2 Độ trễ | chưa có số liệu | 0 máy | — |
| A3 Chất lượng dịch | chưa có số liệu | chống thụt lùi và mức sàn | — |
| A4 Nhận dạng giọng nói | chưa có số liệu | thiếu: turbo, small | — |
| A5 Ổn định (2 giờ) | chưa có số liệu | thiếu: mac, win | — |
| §8 Tải máy ≤ 30% | chưa có số liệu | thiếu: mac, win | — |
| A6 Cài đặt | chưa có số liệu | chưa có danh sách | — |
| A7 Quyền riêng tư | chưa có số liệu | thiếu: mac, win | — |
| Bảng đối chiếu (kế hoạch 00, Task 5) | không đạt | 357 dòng, 158 chưa xong | `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` |
mã thoát: 1
```

- [ ] **Step 5: Commit**

```bash
git add bench/phase1/acceptance/a1-matrix.template.md \
  bench/phase1/acceptance/a6-checklist.template.md \
  bench/phase1/acceptance/report.py \
  bench/phase1/acceptance/test_report.py
git commit -m "feat(bench): báo cáo nghiệm thu A1–A7 và bảng đối chiếu; mẫu ma trận A1, danh sách A6 (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 6: README và chạy toàn bộ test

Bảng công cụ cho người thực thi 08b. Chạy cả bộ test của `bench/phase1/acceptance/`.

**Files:**
- Create: `bench/phase1/acceptance/README.md`

- [ ] **Step 1: Viết code**

Tạo `bench/phase1/acceptance/README.md`:

```markdown
# Công cụ nghiệm thu Giai đoạn 1 (kế hoạch 08)

Python 3.12 trở lên, chỉ dùng thư viện chuẩn. Chạy từ gốc repo. Kết quả của các lần thử ghi vào
`bench/phase1/results/acceptance/` và được commit.

| Script | Việc | Ra |
|---|---|---|
| `mapping.py summary` / `check` | Bảng đối chiếu của kế hoạch 00: đếm trạng thái, nhóm dòng chưa xong theo việc đang chặn; `check` là Task 5 của kế hoạch 00 | in Markdown hay JSON (`--json`) |
| `gates.py a2` | A2 từ JSON của `latency-bench latency`: luật lượt đo đáng tin và ngưỡng của `summarize.py`, hạng máy lấy từ nhãn | `a2-<máy>.json` |
| `gates.py a3` | A3 từ `s7_mt-<nhãn>.json` của `score_mt.py`, so mốc `s7_mt.json`, cộng mức sàn Anh→Việt | `a3.json` |
| `gates.py a4` | A4 từ `a4_<nhãn>.json` của `score_asr.py`, so mốc `a4_m4pro-<model>-final.json` (≤ 10% tương đối), `--pack turbo` hay `small` | `a4-turbo.json`, `a4-small.json` |
| `soak.py sample` / `summarize` | A5 (2 giờ, không crash, RAM sau giờ đầu ≤ 110%) và tải máy §8 (CPU ≤ 30%), gồm WebView; `--require` các tiến trình bắt buộc | `a5-mac.*`, `a5-win.*` |
| `netaudit.py` | A7 từ nhật ký HAR của proxy (chỉ lưu lượng của app), theo danh sách cho phép (`a7-allow.template.json`), bắt buộc mốc Bắt đầu, Dừng | `a7-mac.json`, `a7-win.json` |
| `report.py` | Gom tất cả thành báo cáo nghiệm thu | `report.md` |

Mẫu cho phần người điền: `a1-matrix.template.md` (A1), `a6-checklist.template.md` (A6), `a7-allow.template.json` (A7).

Test: `python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'`.
```

- [ ] **Step 2: Chạy test**

Run:
```bash
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py' 2>&1 | tail -3 | sed -E 's/ in [0-9.]+s$//'
```
Expected (lúc lập kế hoạch):
```text
Ran 61 tests

OK
```

- [ ] **Step 3: Commit**

```bash
git add bench/phase1/acceptance/README.md
git commit -m "docs(bench): bảng công cụ nghiệm thu Giai đoạn 1 (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Sau 08a

Cả 6 task xanh thì sang 08b (`docs/superpowers/plans/2026-10-03-giai-doan-1-08b-nghiem-thu-dieu-phoi.md`). 08a không có bước của người.
