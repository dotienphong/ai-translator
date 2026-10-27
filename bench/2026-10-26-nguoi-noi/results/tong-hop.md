# Tổng hợp kế hoạch 01 (spike): phân biệt người nói

Kế hoạch 01, Task 15. Trả lời 9 câu hỏi của kế hoạch 01 (spec `2026-10-26-phan-biet-nguoi-noi-design.md` §13 mục 1) bằng số
trong các file kết quả của thư mục này. Không có số đo mới ở đây, trừ hai lượt chạy lại test lúc viết file này (dòng 1 và 5, ghi
rõ). Mọi số macOS đo trên Apple M4 Pro, macOS 26.6.2 (điều kiện đầy đủ ở từng file). Phần Windows chờ Task 13. Spec đã sửa theo
bảng này, mỗi chỗ ghi "(chốt ở kế hoạch 01, `results/<file>`)". **Chủ dự án đã duyệt cả năm điểm ở mục "Điều cần chủ dự án duyệt" ngày 2026-10-26 ("đồng ý hết đề nghị"); kế hoạch 02 viết sau đó.**

## Bảng trả lời

| # | Câu hỏi | Kết quả | File kết quả | Việc phải đổi trong spec |
|---|---|---|---|---|
| 1 | fbank Rust khớp Kaldi; ERes2Net trên `candle-onnx` khớp onnxruntime (Task 2, 3) | **Đạt.** fbank: sai lệch lớn nhất ≈ 2,3e-4 so với `kaldi-native-fbank` (ngưỡng < 1e-3; trung bình < 1e-4). Nhúng trên `candle-onnx` so với onnxruntime: cosine ≥ 0,999 (ngưỡng của test; test không in giá trị nên **số cụ thể chưa ghi**; nghiên cứu trước spec đo 1,0, spec §3). Chạy lại lúc viết file này: cả hai test đạt. Cách B' (dòng 4) cho nhúng giống hệt từng bit `simple_eval` cả đồ thị ở 2, 4, 8 s | Không có file riêng: test `fbank::tests::matches_kaldi_native_fbank` và `embed::tests::embedding_matches_onnxruntime` (`#[ignore]`, cần model) của `crates/speaker-worker`; B': `ram.md` | §5.1 giữ; thêm test giống từng bit cho B' (§4.1) |
| 2 | A-spk1 trên AMI bằng code Rust; ngưỡng chọn (Task 7) | **Đạt ở θ = 0,35.** Chọn trên dev (ES2004a, TS3003a tai nghe): θ = 0,35, gộp 1,10 (= không bao giờ gộp); mục tiêu 0,911, θ = 0,40 cho 0,910 (chênh đúng 1 đoạn). Phần kiểm (4 bản ghi): trung bình dòng ≥ 1 s 92,0%, mọi dòng 85,1%; thấp nhất EN2002a 87,3% / 80,2% (769/959 đoạn, hơn mức 80% đúng 1 đoạn). Ở θ = 0,40, EN2002a mọi dòng 766/959 (79,9%): không đạt theo từng bản ghi. Số giọng hiện ra 4–8 cho 4 người. Gộp 0,70 (kèm `merge_min_ms` 10 s) không kích hoạt lần nào trên 6 bản ghi; gộp 0,50 làm EN2002a kém đi. Với A2 4 s đầu (cấu hình chọn ở dòng 4): trung bình 91,8% / 84,9%, EN2002a mọi dòng 767/959 (**thiếu 1 đoạn** theo từng bản ghi) | `nhan-giong-ami.md`; A2: `ram.md` | §5.3 θ = 0,35; §5.4 gộp mặc định tắt; §12 ghi kết quả. Cách đọc A-spk1 khi dùng A2: mục "Điều cần chủ dự án duyệt" |
| 3 | A-spk2 tiếng Việt, bản Opus (Task 8) | **Đạt theo trung bình, không đạt theo từng hội thoại.** θ = 0,35 (chọn trên dev tiếng Việt cũng ra 0,35, gộp 1,10). 8 bản ghi kiểm (4 hội thoại Common Voice tiếng Việt, bản thường và Opus 24 kbps): trung bình dòng ≥ 1 s **93,9%** (thường 97,3%, Opus 90,5%); 7/8 bản ≥ 85%, thấp nhất 67,7% (cv-vi-05 Opus). Thêm 6 hội thoại seed 1 (ngoài phép đo chính): cả 24 bản 20/24 đạt, trung bình 92,1%. Cả 4 bản hỏng (67–76%) cùng một lỗi: hai người gộp thành một giọng (cosine tâm cụm của cặp 0,60–0,70 ở ba bản; bản thứ tư dưới 0,44, do thứ tự đoạn đầu). Không θ nào trong 0,25–0,50 làm hết bản hỏng. θ = 0,40: trung bình 87,4%, 6/8 bản đạt | `nhan-giong-tieng-viet.md` | §12 ghi quyết định (a); §14 rủi ro gộp giọng; §5.3 đề xuất tách cụm bằng tên (chờ duyệt) |
| 4 | Tốc độ, RAM macOS (Windows chờ); nhận giọng có xong trước nhận dạng không; có cần tự tắt trên máy yếu (Task 9, 9b, 13) | **macOS, cấu hình chọn B' + A2 4 s** (chạy đồ thị từng nút, chỉ nhúng 4 s đầu mỗi đoạn; Task 9b, chạy lâu 452 lần): RSS đỉnh 198,0–208,2 MB, CPU 7,25–7,36% một lõi mỗi giây tiếng nói, nhúng p50 89,8–90,7 ms, p90 190,7–198,0 ms, **452/452 lần xong ≤ 230 ms** ở cả 4 lần đo (chậm nhất 200,9–205,2 ms; một bản ghi IS1009a chạy hai vòng, worker chạy một mình). Nguyên bản (Task 9, 2 luồng): RSS đỉnh cả cuộc họp 1 542–1 556 MB, CPU 8,48–8,63%, 85,8–86,3% đoạn xong ≤ 230 ms; 1 luồng chỉ 68,6–69,0%, nên cần 2 luồng. Máy bận (4 tiến trình `yes`): không đổi; hết lõi (12 tiến trình `yes`, một lần): p50 1,58 s, không đoạn nào ≤ 230 ms. Mốc nhận dạng 230 ms là số của spec, chưa đo trên chính các đoạn này, chưa đo khi chạy cùng `asr-worker`, `llama-server`. Tự tắt trên máy yếu: không cần trên M4 Pro; **Windows chờ Task 13** | `toc-do.md`, `ram.md` | §4.1 (B', số luồng), §4.2 (`Load`, `Segment`), §4.4, §5.2 (A2), §11 (ngân sách mới) |
| 5 | App 0.3.1 đọc manifest có khóa `speaker` (Task 10) | **Đạt.** Manifest có khóa `speaker` (và `speaker_config`) ở gốc phần thân vẫn đọc được, các gói như cũ; một `kind` lạ trong `files` làm app từ chối cả manifest (đúng lý do không thêm `kind` mới). Chạy lại lúc viết file này: `cargo test -p meeting-translator --lib models::manifest` 16 đạt, 1 bỏ qua (test chạy tay), gồm hai test mới | Không có file riêng: test `a_speaker_entry_at_the_root_does_not_break_this_app`, `an_unknown_kind_in_files_breaks_this_app` trong `src-tauri/src/models/manifest.rs` | §4.5 ghi đã kiểm |
| 6 | Tiến trình con hưởng quyền Trợ năng (Task 11) | **Có.** App thử ký ad-hoc kèm hardened runtime: đã cấp quyền thì cả cha lẫn con `AXIsProcessTrusted` = true và con đọc được cửa sổ Finder. Dựng lại cùng nguồn (cdhash không đổi): còn quyền. Đổi một dòng mã (cdhash đổi, như một bản cập nhật): **cả cha lẫn con mất quyền** (-25211). Chưa thử với binary `speaker-worker` thật | `quyen-tro-nang.md` | §6.2 bỏ phương án dự phòng; §6.7 dùng chung nút reset; §14 |
| 7 | Chi phí trợ năng Teams, Chrome; bật suốt phiên hay quanh lượt đọc (Task 12) | **Bật mà không đọc: không tốn gì đo được** (Chrome bật không đọc 1,01 tỉ lệnh/s so với 1,16 khi không bật; Teams đã bật ngang Teams sạch). **Phần tốn nằm ở việc đọc cây.** Đọc cả cửa sổ 4 lần/giây bằng bộ đọc thử: Teams thêm 1,19 tỉ lệnh/s (gấp 2,5), 371 mW cộng 78 mW của bộ đọc (≈ 0,45 W); Chrome hai cửa sổ Meet thêm 2,0 tỉ lệnh/s (gấp 2,7), 1 045 mW cộng 214 mW (≈ 1,26 W), luồng chính 3% → 27% một lõi. Đọc 1 lần/giây: ≈ 0,09 W (Teams), ≈ 0,26 W (Chrome). **%CPU đánh lừa:** khi đọc, %CPU của Teams và Chrome lại giảm (Teams 38 → 35%, Chrome 63–82 → 48%) vì chip lên xung (Chrome 1,3 → 2,9 GHz); kết luận dựa trên số lệnh và năng lượng. Mỗi lượt đọc cả cửa sổ (p50): Teams 46–65 ms (133–184 nút), hai cửa sổ Meet 92–121 ms (390 nút): **vượt giới hạn 30 ms của §6.2**, nên bộ đọc thật phải chỉ đọc các phần tử chỉ báo ở nhịp nhanh. RAM: không thấy tăng vượt nhiễu (nếu có thì dưới ~0,2 GB với Teams, ~0,3 GB với Chrome). Chrome 156 không nhận `AXManualAccessibility` (-25205, sau 96 s vẫn không có cây web); phải dùng `AXEnhancedUserInterface` (cây dựng sau ~2 s lần đầu, gỡ khi đặt lại false). Teams giữ cây tới khi khởi động lại dù đặt lại false. Kết luận: **bật suốt phiên** | `teams-chrome.md` | §3 (ghi chú), §6.2, §6.8, §10 (pháp lý), §11, §12 (A-spk5), §14 |
| 8 | Chỉ báo nói của Teams khi bảng People đóng (Task 12; Windows chờ Task 13) | **macOS: có.** Ô video của người đang nói có một phần tử con không tên (lớp `vdi-frame-occlusion`) trong ô `AXMenuItem` mang tên khách. People đóng: khớp sự thật 95–97% (r = 0,89–0,92, dời 0,6 s); mọi lượt (cả People mở) 95–99%. Hiện sau nhãn mic 0,2–0,65 s (Teams phải nghe thấy tiếng), sau lúc bật mic trung vị 0,76–1,28 s; nói chồng thì cả hai ô có; ô chủ phòng (mic tắt) không lần nào có. `find_indicators.py` của kế hoạch không bắt được (cao nhất 0,35); phân tích theo ô thì bắt được. Chưa thử: mic mở mà im lặng, họp đông hơn số ô, có video, tài khoản công việc. Meet (thêm): chỉ ô trong cửa sổ của chính người nói đổi (khớp 69–80%), ô trong cửa sổ chủ phòng không đổi, chưa giải thích. **Windows: chờ Task 13** | `teams-chrome.md` | §6.4, §6.6, §14 |
| 9 | Bộ đọc UI Automation trên Windows thấy tên và chỉ báo (Task 13) | **Chờ Task 13.** Mã `uia-probe` đã có (chỉ chạy trên Windows); gói chạy cho Windows đã dựng ngoài repo | Chưa có (`windows-uia.md`) | §6.2, §6.4, §6.6 phần Windows ghi "chờ Task 13" |

## Quyết định của chủ dự án (2026-10-26)

- **θ mặc định = 0,35** (`SpeakerConfig::default()`, spec §5.3). Theo kết quả, ngưỡng gộp mặc định đổi thành 1,10 (tắt; spec
  §5.4), xem mục "Điều cần chủ dự án duyệt".
- **Ngân sách nhận giọng:** cách B' + A2 4 s, **không** bật Accelerate. `speaker-worker` trên M4 Pro: RAM ≤ 250 MB, CPU ≤ 8% một
  lõi khi người nói liên tục. Windows i5: giữ ≤ 10% một lõi, chờ số đo (Task 13); RAM của B' trên Windows đo ở kế hoạch 02.
- **A-spk2: chọn (a).** Chấp nhận kết quả theo trung bình (phần kiểm dòng ≥ 1 s 93,9%, đạt mức 85%) và ghi rủi ro gộp hai giọng
  giống nhau vào spec. Theo từng hội thoại thì không đạt (4/24 bản rơi 67–76% vì hai giọng giống nhau gộp một cụm). Không thử model
  nhúng khác trong kế hoạch 01. Không hạ mức nghiệm thu nào khác.

## Còn chờ

**Task 13 (Windows, cần chủ dự án).** Chủ dự án chép `win-pack.zip` (dựng sẵn ở thư mục dữ liệu ngoài repo) sang máy Windows i5,
chạy script trong gói theo hướng dẫn tiếng Việt kèm theo, rồi gửi lại `ket-qua-windows.zip`. Phần Teams và Meet trên Windows cần
thêm cuộc họp có khách nói (như Task 12 trên Mac). Khi có kết quả: ghi `windows-uia.md`, phần Windows i5 của `toc-do.md`, rồi sửa
spec ở các chỗ đang ghi "chờ Task 13". Các dòng còn chờ:

- Dòng 4, phần Windows: tốc độ và CPU trên i5 với A2 4 s (ngân sách ≤ 10% một lõi); có cần tự tắt trên máy yếu. Chờ Task 13.
- Dòng 8, phần Windows: chỉ báo nói của Teams qua UI Automation. Chờ Task 13.
- Dòng 9: bộ đọc UI Automation thấy tên và chỉ báo (Teams, Chrome). Chờ Task 13.

## Điều cần chủ dự án duyệt

**Đã duyệt hết (2026-10-26):** (1) tách cụm bằng tên thật: làm ở kế hoạch 04; (2) A-spk1 tính theo trung bình; (3) gộp mặc định tắt; (4) các thay đổi thiết kế; (5) chính sách quyền riêng tư nói đúng việc Teams. Nội dung từng điểm giữ nguyên bên dưới để lưu vết.

1. **Đề xuất, chưa có số đo: dùng tên thật để tách cụm giọng bị gộp.** Lỗi chính của A-spk2 là hai người giống giọng bị gộp một
   cụm, và phân cụm trực tuyến không tự tách lại. Khi bộ đọc tên chạy, một cụm liên tục trùng với hai tên khác nhau (mỗi tên một
   phần đáng kể thời gian trùng, xen kẽ theo thời gian) là dấu hiệu đã gộp; worker tách cụm theo tên. Lợi: sửa đúng lỗi đo được, chỉ
   khi có tên thật (Teams, Meet, Zoom), không tốn thêm khi không có tên. Rủi ro: chỉ báo trễ 0,4–1,3 s tùy app và nói chồng có thể làm tách
   nhầm; không giúp giọng trong phòng hay máy chung phòng; cần giữ nhúng các đoạn gần đây trong RAM của phiên. Hiện nay luật ghép
   tên (§6.6, một tên phải chiếm ≥ 60%) sẽ không gán tên nào cho cụm gộp, nên không sai tên nhưng mất tên. Ghi ở spec §5.3, đánh dấu
   chưa duyệt; nếu duyệt thì kế hoạch 04 đo trên dòng thời gian giả và bản ghi cây Teams.
2. **Cách đọc A-spk1 khi dùng A2 4 s.** Nhúng cả đoạn: đạt cả theo từng bản ghi lẫn trung bình. Cấu hình đã chốt (A2 4 s đầu): đạt
   theo trung bình (91,8% / 84,9%), theo từng bản ghi thiếu 1 đoạn ở "mọi dòng" của EN2002a (767/959, cần 768); biến thể "4 s giữa"
   vừa đủ (768) nhưng chọn theo phần kiểm là sai phương pháp (`ram.md`). Chênh 1 đoạn nằm trong nhiễu đã thấy giữa θ 0,35 và 0,40.
   Cần chủ dự án chọn: đọc A-spk1 theo trung bình (như A-spk2), hay giữ cách đọc từng bản ghi (khi đó A2 4 s đang thiếu 1 đoạn).
   Spec §12 chưa đổi mức, chỉ ghi số.
3. **Ngưỡng gộp mặc định tắt (1,10).** Đã đổi trong mã và spec §5.4 theo kết quả: không thấy gộp giúp gì (0,70 không kích hoạt lần
   nào trên AMI; trên dev tiếng Việt mọi mức 0,70–1,10 cho cùng kết quả), gộp 0,50 làm EN2002a kém đi, và lỗi chính đo được là gộp
   nhầm. Mã gộp giữ lại, đổi được qua `speaker_config`. Nhờ xác nhận.
4. **Các chỗ sửa spec có đổi thiết kế (theo số đo):** giao thức `Load` bỏ `threads` (số luồng chỉ qua `RAYON_NUM_THREADS` lúc app
   chạy worker); `Segment.pcm` chỉ mang tối đa 4 s đầu; Teams dùng ô video làm neo chỉ báo, bảng People là tín hiệu bổ sung, bỏ mẹo
   "mở bảng Người tham gia" khỏi Cài đặt; trợ năng bật suốt phiên; Chrome, Edge dùng `AXEnhancedUserInterface`; bộ đọc chỉ đọc phần
   tử chỉ báo ở nhịp nhanh, mặc định 1 lần/giây, 4 lần/giây chỉ khi có tiếng và đang cần gán tên; đo tải bằng số lệnh và năng lượng.
5. **Chính sách quyền riêng tư (kế hoạch 07):** phải nói đúng việc trợ năng của Teams đã bật thì còn bật tới khi Teams khởi động lại
   (không tốn gì đo được khi không ai đọc); với trình duyệt chỉ bật trong lúc dịch có cửa sổ Meet.

## Ghi cho kế hoạch 02 (và kế hoạch 04)

Tóm từ mục "Ghi cho kế hoạch 02" của `ram.md` và "Kết luận cho spec" của `teams-chrome.md`, `quyen-tro-nang.md`.

**Kế hoạch 02 (worker, pipeline):**

- Số luồng: app đặt `RAYON_NUM_THREADS=2` trong môi trường lúc chạy worker; không truyền qua `Load`, không `build_global` sau khi
  chạy (`candle-core` 0.11.0 đọc biến này ở mỗi lần nhân ma trận, pool rayon toàn cục chỉ đọc một lần lúc tạo).
- Ưu tiên thấp: không gọi `Device::with_context` (pool riêng của `candle-core` tự đặt QoS user-interactive); QoS `utility` đặt cho
  pool rayon toàn cục bằng `start_handler`.
- Viết B' trong repo: mô-đun riêng (ví dụ `crates/speaker-worker/src/onnx_steps.rs`), `Embedder::from_model`; khi nạp kiểm đầu vào
  `x` (dtype, rank, chiều 80), kiểm mọi đầu vào của nút tìm được, từ chối tên trùng và graph lồng; test `#[ignore]` so `to_bits`
  với `simple_eval` cả đồ thị ở 1, 2, 4, 8 s, đồ thị nhỏ tự dựng cho các ca biên, ca báo lỗi, và test đếm giá trị còn sống sau mỗi
  nút (test so bit không bắt được giá trị bỏ sót).
- A2: hằng `MAX_EMBED_SAMPLES` (4 s); app gửi tối đa 4 s tiếng nói kèm thời lượng thật. Quyết giữ hay bỏ `embed_windowed` (cách A
  không dùng).
- Đo thêm: soak test ≥ 1 giờ có vết RSS (allocator macOS giữ bộ nhớ đã trả); mốc 230 ms khi chạy cùng `asr-worker`,
  `llama-server`; đo lại trong `speaker-worker` thật (có giao thức, đọc cây); RAM của B' và allocator trên Windows.
- B' dựa vào hành vi chưa ghi thành tài liệu của `candle-onnx` (graph con không khai `input` vẫn chạy): khi nâng `candle-onnx` phải
  chạy lại test giống từng bit. Dự phòng: B (vá `candle-onnx`, cần `third_party/`, `[patch]` cả workspace); hướng dài hạn là gửi bản
  vá lên upstream.
- Build chéo Windows để chạy clippy: cần `PKG_CONFIG_x86_64_pc_windows_msvc`, `PKG_CONFIG_ALLOW_CROSS=1`,
  `RUSTONIG_DYNAMIC_LIBONIG=1` (như Task 13).

**Kế hoạch 04 (bộ đọc macOS):**

- Không đọc cả cửa sổ ở nhịp nhanh: một lượt đầy đủ mỗi vài giây (hoặc khi cây đổi cấu trúc) để tìm ô và neo, rồi chỉ đọc các
  phần tử chỉ báo đã biết (vài chục phần tử, ít thuộc tính), gom bằng `AXUIElementCopyMultipleAttributeValues`. Thử `AXObserver`
  thay cho hỏi vòng.
- Nhịp mặc định 1 lần/giây, 4 lần/giây chỉ khi có tiếng và đang cần gán tên.
- Đo lại bằng bộ đọc thật: mục tiêu ≤ 30 ms mỗi lượt, phần năng lượng thêm cỡ vài chục mW; đo bằng số lệnh, năng lượng
  (`tro-nang/rus`), không dùng %CPU.
- Chrome dùng `AXEnhancedUserInterface`; kiểm Edge; để ý tác dụng phụ đã biết của EUI với cửa sổ (chưa kiểm có chủ đích).
- Teams: neo chỉ báo là ô video; thử thêm mic mở mà im lặng, họp đông hơn số ô, có video, tài khoản công việc. Meet: tìm hiểu vì
  sao ô ở cửa sổ chủ phòng không đổi.
- Kiểm lại với app thật: gọi `AXIsProcessTrusted` một lần thì app tự hiện trong danh sách Trợ năng (công tắc tắt).
- Thử lại quyền Trợ năng với binary `speaker-worker` thật (Rust, hardened runtime, cách spawn của app): dời từ kế hoạch 02 sang đây vì
  chỉ khi có bộ đọc tên trong worker mới có gì để thử.

## Số chưa đo

- Cosine cụ thể giữa nhúng `candle-onnx` và onnxruntime của code Rust (chỉ biết đạt ngưỡng ≥ 0,999).
- Mọi số Windows: tốc độ và CPU trên i5, RAM của B', allocator, UI Automation (Task 13, kế hoạch 02).
- CPU, RAM của `speaker-worker` thật (giao thức, đọc cây) và của bộ đọc thật; thời gian nhận dạng của chính các đoạn; mốc 230 ms khi
  chạy cùng `asr-worker`, `llama-server`; soak test ≥ 1 giờ.
- CPU khi một người nói liên tục với đoạn dài (A2 có thể giảm nhiều hơn số đo trên AMI).
- Edge (macOS và Windows); Zoom không đo lại trong kế hoạch 01 (chỉ có số trước spec, §3).
