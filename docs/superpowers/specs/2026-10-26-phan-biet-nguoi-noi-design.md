# Phân biệt người nói: tên người đang nói trên phụ đề (thiết kế)

Ngày 2026-10-26. Nhánh `phan-biet-nguoi-noi` (worktree `meeting-translator-work/phan-biet-nguoi-noi`). Trạng thái: chủ dự
án duyệt thiết kế từng phần ngày 2026-10-26 (mục 1–13); spec viết lại từ các phần đã duyệt.

Phạm vi code: crate mới `crates/speaker-worker` và `crates/speaker-protocol`; `crates/pipeline` (gửi đoạn sang nhận giọng,
luật ghép câu, `Subtitle`); `crates/audio-capture` (cờ nguồn của khung ở bộ trộn); `crates/latency-bench` (lệnh đo người
nói); `src-tauri/src/{session.rs, sidecar/, models/, settings/, transcript/, db.rs, diagnostics/, events.rs, commands.rs}`
và module mới `src-tauri/src/speaker/`; `src-tauri/capabilities/{overlay,main}.json`; `src/lib/{ipc.ts, subtitleView.ts}`, `src/windows/overlay/*`,
`src/windows/main/{screens/Transcript.tsx, settings/SubtitleSettings.tsx}`, `src/i18n/*.ts`; `server/` (nhận báo cáo tình
trạng, bảng D1, Web Admin, cron); `scripts/speaker-recipes/`, `tools/speaker-canary/`; `docs/legal/privacy.*`; `website/`;
spec chính §2 (D1), §3.1–§3.3, §5, §6.3, §6.6, §7, §8, §10.1, §10.2.

## 1. Mục tiêu

Chủ dự án hỏi (2026-10-26): làm được tính năng phân biệt ai đang nói trong phụ đề không, và hiện được đúng tên người
đang nói trong Teams, Google Meet, Zoom không. Người dùng của sản phẩm dùng Meet và Teams nhiều hơn Zoom.

**Thứ tự ưu tiên** (chủ dự án chốt, dùng để quyết mọi đánh đổi trong spec này):

1. **Tốc độ dịch và tốc độ nhả chữ không bị ảnh hưởng.**
2. **Hiện đúng tên người đang nói nhiều nhất có thể.** Không chắc thì hiện "Người N", không hiện sai tên.
3. **Bảo mật của app không kém đi.**

**Chủ dự án chốt (2026-10-26):**

- **Mọi gói đều dùng được**, kể cả Free dùng thử. Tên người nói trong Lịch sử và file xuất đi theo Pro, như Lịch sử và xuất
  file hiện nay.
- **Bật sẵn cả hai phần:** phân biệt giọng ("Người 1", "Người 2"…) và lấy tên thật từ app họp. macOS chỉ hỏi quyền Trợ năng
  khi gặp cuộc họp mà chưa có quyền (mời qua một dòng trên thanh phụ đề, không tự bật hộp thoại hệ thống).
- **Hiển thị:** tên có màu ở dòng đầu mỗi lượt nói, các câu sau của cùng người chỉ có vạch màu (mẫu đã duyệt, mục 8).
- **macOS và Windows phát hành cùng một lần.**
- **Tài khoản thử:** chỉ bản cá nhân miễn phí (2–3 Gmail, 1 tài khoản Microsoft). Bản doanh nghiệp theo dõi qua báo cáo
  tình trạng sau phát hành.
- **Kiến trúc:** nhận giọng và đọc tên chạy trong một tiến trình phụ riêng, ưu tiên thấp (mục 4).
- **Không làm extension trình duyệt.**

**Hiện trạng** (đọc code ngày 2026-10-26, main `8ecbcf8a`, bản 0.3.1):

- Spec chính §3.2 xếp "Phân biệt ai đang nói" ngoài phạm vi MVP.
- `pipeline::subtitle::Subtitle` không có thông tin người nói. Luật ghép câu (`pipeline::sentence::OpenSentence::accepts`)
  ghép hai đoạn cùng ngôn ngữ cách nhau ≤ 700 ms, không xét người nói.
- `pipeline::segmenter::Segment` có `start_ms`, `end_ms` theo đồng hồ thật từ đầu phiên và `samples` 16 kHz.
- Tiến trình chính chạy Silero VAD bằng `candle-onnx` 0.11, không chứa ggml (§5, §6.3). `candle-core` dùng chung một bộ
  luồng `rayon` toàn cục.
- Gõ dịch đã xin quyền Trợ năng trên macOS (`compose/native_macos.rs`: `AXIsProcessTrusted`, `tccutil reset` khi quyền cũ).
  App ký ad-hoc nên quyền này mất sau mỗi bản cập nhật.
- Manifest model `models.json` có phong bì ký Ed25519 (`models/signed.rs`), có phần `pipeline` đổi ngưỡng từ xa, bỏ qua khóa
  lạ ở phần thân; enum `Kind` của file chỉ có `asr`, `mt`, `vad`, `license`.
- Báo cáo lỗi (`diagnostics/`) che dữ liệu, kiểm lần cuối và bỏ cả báo cáo khi còn mẫu nhạy cảm.
- Lịch sử chép lời nằm trong SQLCipher (`db.rs`, bảng `lines`), là tính năng Pro.

## 2. Phạm vi

**Trong phạm vi (F13):**

- Phân biệt giọng trong âm thanh máy và micro, gán mỗi dòng phụ đề cho một giọng.
- Lấy tên hiển thị của người đang nói từ: Microsoft Teams bản cài (Teams mới, `com.microsoft.teams2` / `ms-teams.exe`),
  Google Meet trong Chrome và Edge, Zoom bản cài (Zoom Workplace). Cả macOS và Windows.
- Đổi tên, chọn tên từ danh sách người tham dự, gộp hai người, ngay trong phiên.
- Tên người nói trong Lịch sử và file xuất (Pro).
- Cơ chế chống vỡ khi Teams và Meet cập nhật giao diện (mục 7).

**Ngoài phạm vi:**

- Extension trình duyệt.
- Zoom và Teams mở trong trình duyệt; Meet trong Safari, Firefox, Cốc Cốc.
- Nhận lại một người qua nhiều phiên (lưu dấu vân giọng), nhận diện danh tính.
- Ghi âm, chụp màn hình cuộc họp.
- Lấy tên qua API của Microsoft hay Google: các API này cần bot hoặc cloud (Meet Media API còn ở chương trình thử nghiệm và
  bắt mọi người tham dự đăng ký; Meet Add-ons SDK không có sự kiện người nói; Teams cần bot hoặc Graph), trái với hướng
  offline, không bot của sản phẩm (D1).

## 3. Số đo nền (nghiên cứu 2026-10-26)

Script, kết quả tóm tắt và cách chạy lại: `bench/2026-10-26-nguoi-noi/truoc-spec/` (dữ liệu và bản ghi cây giao diện có tên
người không nằm trong git).

**Phân biệt giọng trên AMI** (4 cuộc họp tiếng Anh, CC BY 4.0, mỗi cuộc 4 người; đoạn cắt bằng đúng `SileroVad` +
`Segmenter` của app, ngắt câu 50 ms; phân cụm trực tuyến nhân quả; tham số chọn trên ES2004a và TS3003a tai nghe, báo trên
phần còn lại):

| Model (giấy phép, cỡ) | Dòng ≥ 1 s đúng người | Mọi dòng đúng người | Số "người" hiện ra (thật: 4) |
|---|---|---|---|
| 3D-Speaker ERes2Net VoxCeleb (Apache-2.0, 26 MB) | 87–96% | 81–88% | 5–8 |
| NeMo TitaNet-small (CC-BY-4.0, 40 MB) | 85–91% | 77–87% | 4–7 |
| 3D-Speaker CAM++ zh_en (Apache-2.0, 28 MB) | 81–95% | 72–86% | 5–8 |

- WeSpeaker ResNet34-LM và CAM++ VoxCeleb sụp về 1–2 người với ngưỡng chọn trên dev: loại.
- Đoạn VAD của app: trung vị 1,1–1,6 s; 36–49% đoạn ngắn hơn 1 s; 8–32% đoạn có từ hai người trở lên (mỗi người ≥ 0,3 s),
  nên trần theo thời lượng chỉ 69–94%. Ngắt câu 300 ms không tốt hơn (đoạn lẫn người tăng lên 34–47%).
- **8–26% cặp đoạn cách nhau ≤ 0,7 s (ứng viên ghép câu) là hai người khác nhau:** luật ghép hiện tại có thể nối lời hai
  người vào một dòng.
- Ngưỡng "người tạm" (chỉ hiện khi đủ N giây) và gộp cụm tự động không cải thiện; gom lại cả phiên bằng agglomerative
  không hơn trực tuyến.
- **Tốc độ** (M4 Pro, 1 luồng, đoạn 3 s): ERes2Net qua onnxruntime ~15 ms; qua `candle-onnx` 0.11 (sau `onnxsim`) ~100 ms,
  kết quả trùng onnxruntime (cosine 1,0). CAM++ không chạy được trên `candle-onnx` (Conv stride (2,1), AvgPool 1D
  `ceil_mode`).

**Đọc tên từ app họp** (thử thật trên Mac: chủ phòng là app thật, 2 khách tự động nói theo kịch bản, đọc cây
Accessibility 4 lần mỗi giây):

| | Zoom 7.1.9 (bản cài) | Teams mới (bản cài, tài khoản cá nhân) | Meet (Chrome 156) |
|---|---|---|---|
| Tín hiệu "đang nói" | Chữ trong mô tả ô video: "Tên, Computer audio unmuted, Video off, active speaker" | Lớp CSS của ảnh đại diện trong bảng People đổi khi nói; ô video chỉ có muted/unmuted | Lớp CSS của thanh âm lượng cạnh chữ tên đổi liên tục khi nói |
| Trễ từ lúc bắt đầu nói (trung vị) | 0,44 s (xem Speaker), 0,56 s (Gallery) | ~0,75 s | ~0,5–1,2 s |
| Nói chồng | Chỉ một người; giữ người nói trước thêm 2,5–3,5 s | Hiện cả hai | Chưa thử được |
| Điều kiện | Quyền Trợ năng | Đặt `AXEnhancedUserInterface`; bảng People mở | Đặt `AXManualAccessibility` |

- Dò "đang nói" **không dùng tên lớp CSS nào** (chỉ dùng id có nghĩa của Teams và vị trí cạnh chữ tên của Meet): Teams khớp
  sự thật 88% số lần chụp; Meet: ô của người đang nói khớp 74–81%, ô của người im lặng không bị nhận nhầm lần nào.
- Khách chưa đăng nhập Google không vào được phòng Meet của tài khoản cá nhân, kể cả không dùng micro giả.
- Teams cho khách vào bằng trình duyệt không cần tài khoản.

## 4. Kiến trúc

```
Thu âm ─► Tiền xử lý ─► VAD, cắt câu ──► Nhận dạng (asr-worker) ─► Dịch (llama-server) ─► Ghép phụ đề ─► giao diện
                            │                                                                 ▲
                            │ bản sao âm thanh, hàng đợi 4 đoạn, đầy thì bỏ                    │ mã giọng, bảng người nói
                            ▼                                                                 │
                     speaker-worker (ưu tiên thấp) ── nhận giọng + đọc tên app họp ───────────┘
```

### 4.1 Tiến trình phụ `speaker-worker`

- Crate `crates/speaker-worker`, binary `speaker-worker`. **Không chứa ggml.** Nhận giọng bằng `candle-onnx` (cùng bản với
  `pipeline`). Đọc cây giao diện bằng `ApplicationServices` (macOS, qua `objc2`/FFI như Gõ dịch) và UI Automation
  (Windows, crate `windows` thêm feature `Win32_UI_Accessibility`, `Win32_System_Com`).
- **Ưu tiên thấp:** macOS `setpriority(PRIO_PROCESS, 0, 10)` và QoS `utility` cho các luồng; Windows
  `BELOW_NORMAL_PRIORITY_CLASS`. Bộ luồng tính toán giới hạn 2 luồng (`RAYON_NUM_THREADS=2` khi chạy). Lý do có tiến trình
  riêng: không tranh bộ luồng `rayon` với Silero VAD của tiến trình chính, đặt được ưu tiên thấp cho riêng nó, và app họp
  treo hay lỗi khi bị đọc thì chỉ tiến trình này chết.
- **Kiểm trước khi chạy** như `asr-worker` (§10.2): SHA-256 theo danh sách build sẵn; ký cùng app; Windows chỉ nạp DLL từ thư
  mục app và System32 (`SetDefaultDllDirectories`).
- **Không có mã mạng:** CI kiểm `cargo tree -p speaker-worker` không có `reqwest`, `hyper`, `ureq`, `tokio`, socket.
- **Khởi động:** chạy song song khi bắt đầu phiên nếu tính năng bật; **phiên không chờ nó**. Chưa sẵn sàng thì đoạn gửi tới
  bị bỏ (không nhãn). Dừng khi hết phiên; mọi giọng bị xóa.
- **Khi lỗi:** khởi động lại sau 1, 2, 5 s như `asr-worker`. Chết 3 lần trong phiên thì tắt tính năng tới hết phiên, ghi log
  (không có tên), phụ đề chạy bình thường.

### 4.2 Giao thức (`crates/speaker-protocol`)

Cùng kiểu với `asr-protocol`: khung 4 byte độ dài (`u32` little-endian) + postcard, tối đa 4 MiB; khung hỏng là lỗi và worker
thoát; chỉ thêm biến thể ở cuối (test `variant_indices_are_pinned`); `PROTOCOL_VERSION` là trường đầu của `Ready`; app và
worker build cùng nhau. Log không bao giờ chứa âm thanh hay tên người.

App gửi:

- `Load {model_path, threads, names_enabled, recipe_json}` → `Ready {protocol_version, model_ok, reader_platform}`.
  `recipe_json` là phần thân công thức đọc **đã được app kiểm chữ ký** (mục 7.1); worker kiểm lại cấu trúc.
- `SessionStart {unix_ms}`: giờ hệ thống lúc bắt đầu phiên, mốc chung để so thời gian đoạn với dấu "đang nói".
- `Segment {segment_id, start_ms, end_ms, source, pcm}`: `pcm` 16 kHz `i16`, chỉ phần tiếng nói `[start_ms, end_ms)` (không
  đệm), tối đa 8 s; `source` là `System`, `Mic` hay `Mixed` (mục 5.5).
- `Speech {start_ms, end_ms}`: khoảng có tiếng nói của âm thanh máy theo VAD (kể cả đoạn ngắn bị bỏ), cho phần tự hiệu chỉnh.
- `SetNames {enabled}`, `Shutdown`.

Worker trả:

- `Assign {segment_id, voice: Option<u32>, confidence}`: `None` khi đoạn quá ngắn và chưa có giọng nào.
- `Voices {voices: [VoiceInfo {voice, name: Option<String>, name_source, room_index, mic}], participants: [String]}`: gửi khi
  có thay đổi (giọng mới, gán tên, gộp). `participants` là tên người tham dự đọc được (cho danh sách chọn tên).
- `Merged {from, into}`: hai giọng được gộp.
- `ReaderState {app, app_version, state, recipe_version, learned}`: trạng thái bộ đọc (mục 7.2), không có tên người.
- `Error {kind, message}`.

### 4.3 Luồng dữ liệu, không bao giờ chờ nhãn

- Khi `Segmenter` chốt một đoạn, luồng VAD vẫn đưa đoạn vào hàng đợi nhận dạng như cũ. Ngay sau đó nó chép phần tiếng nói
  của đoạn vào **kênh giới hạn 4 đoạn** sang luồng client của `speaker-worker` bằng `try_send`. **Đầy thì bỏ đoạn đó.** Luồng
  VAD không bao giờ chờ.
- Luồng client ghi khung xuống stdin của worker; một luồng đọc nhận `Assign`, `Voices`, `Merged` và chuyển cho luồng phụ đề
  qua kênh.
- Luồng phụ đề (nơi duy nhất phát sự kiện phụ đề, §7 spec chính):
  - Phụ đề chưa phát mà đã có `Assign` thì gắn `speaker` trước khi phát.
  - Phụ đề đã phát thì phát `subtitle://speaker {id, speaker}`.
  - `Voices` và `Merged` cập nhật bảng người nói và phát `speaker://roster`.
- **Chữ gốc, bản dịch, dòng đang nói và chữ dịch hiện dần đi đúng đường cũ, không đợi gì từ `speaker-worker`.**

### 4.4 Luật ghép câu và hàng đợi

- `OpenSentence` nhớ giọng của từng đoạn (`Option<u32>`). `accepts` thêm điều kiện: **hai đoạn đều đã biết giọng và khác
  giọng thì không ghép.** Giọng của một đoạn là `Assign` đã nhận tới lúc kết quả nhận dạng của đoạn đó về; chưa có thì `None`
  và luật cũ áp dụng. Trên M4 Pro nhận giọng (~100 ms) thường xong trước nhận dạng (~230 ms).
- Hàng đợi dịch gộp câu khi đầy (§7 spec chính): không gộp hai câu đã biết khác giọng.
- Hàng đợi đoạn âm thanh gộp đoạn khi đầy (§7): giữ nguyên; đoạn gộp lấy giọng chiếm nhiều thời lượng hơn.
- Dòng đang nói (chế độ dịch trong lúc nói): mang giọng của câu đang mở (`extends`) nếu có; lượt nói mới chưa có nhãn cho tới
  khi đoạn đóng và có `Assign`.

### 4.5 Model nhận giọng

- File ONNX của ERes2Net VoxCeleb đã qua `onnxsim` (26 MB) cùng LICENSE, NOTICE của 3D-Speaker, host trên R2 như model khác.
- Manifest model thêm **khóa mới ở gốc phần thân** `speaker` (một mục file: `id`, `version`, `file`, `url`, `bytes`, `sha256`,
  `license_id`, `min_app_version`). **Không** thêm loại `kind` mới vào danh sách `files`, vì app ≤ 0.3.1 sẽ lỗi khi đọc giá trị
  enum lạ; khóa lạ ở gốc thì app cũ bỏ qua (spike kiểm lại trên 0.3.1).
- Tải cùng gói model đang dùng (mọi gói), kiểm SHA-256, lưu cạnh model khác. Chưa có file thì tính năng tắt lặng lẽ, Cài đặt
  ghi "đang tải".
- Các ngưỡng ở mục 5 nằm trong `SpeakerConfig`, đổi được qua khóa `speaker_config` của manifest (sai thì giữ mặc định), như
  phần `pipeline`.

## 5. Nhận giọng (Người 1, Người 2…)

### 5.1 Model và đặc trưng

- ERes2Net VoxCeleb (3D-Speaker, Apache-2.0), nhúng 192 chiều, chạy bằng `candle-onnx`.
- Đặc trưng: fbank kiểu Kaldi 80 dải, khung 25 ms, bước 10 ms, cửa sổ povey, không dither, trừ trung bình theo thời gian
  (`feature_normalize_type: global-mean`), mẫu trong khoảng [-1, 1]. Viết bằng Rust (`realfft`); test so với
  `kaldi-native-fbank` trên các clip mẫu, sai lệch ≤ 1e-3, và nhúng cuối cùng cosine ≥ 0,999 so với onnxruntime.

### 5.2 Theo độ dài đoạn

| Độ dài phần tiếng nói | Cách xử lý |
|---|---|
| < 0,5 s | Không tính nhúng; lấy giọng của đoạn trước (`confidence` thấp) |
| 0,5–1,5 s | Tính nhúng; chỉ được chọn một giọng đã có khi độ giống ≥ θ; không mở giọng mới; không giống ai thì lấy giọng trước |
| ≥ 1,5 s | Giống một giọng ≥ θ thì vào giọng đó; không thì mở giọng mới |

### 5.3 Phân cụm trực tuyến

- Mỗi giọng có tâm là tổng nhúng đã chuẩn hóa, nhân theo thời lượng; chỉ đoạn ≥ 1,0 s mới cập nhật tâm.
- Độ giống là cosine với tâm đã chuẩn hóa. Mặc định θ = 0,40 (chọn trên dev AMI), tối đa 8 giọng mỗi phiên; giọng thứ 9 thì
  vào giọng gần nhất.
- Mã giọng tăng dần từ 1 trong phiên; "Người N" lấy N theo thứ tự xuất hiện.
- Kết quả tất định với cùng chuỗi đoạn (test).

### 5.4 Gộp giọng

- **Tự gộp** khi hai tâm có độ giống ≥ 0,70 và cả hai đã có ≥ 10 s tiếng nói; giọng ít thời lượng hơn gộp vào giọng nhiều hơn,
  worker gửi `Merged`. Ngưỡng chỉnh trong spike trên AMI và dữ liệu tiếng Việt.
- **Gộp tay** từ cửa sổ chính (mục 8.2): chỉ đổi cách hiện ở app (giọng A hiện như giọng B), không gửi lại worker.

### 5.5 Có micro

- Bộ trộn (`DuckingMixer`) gắn cờ nguồn cho từng khung 32 ms: `System` khi micro đang bị hạ hoặc im, `Mic` khi âm thanh máy dưới
  ngưỡng nhường lời và micro có tiếng, `Mixed` khi cả hai. Đoạn lấy nguồn chiếm đa số khung. Chế độ chỉ micro thì mọi đoạn là
  `Mic`.
- Giọng có ≥ 60% thời lượng từ `Mic` là **giọng trong phòng**: không bao giờ nhận tên từ app họp (người trong phòng không
  có trên cửa sổ họp); vẫn hiện "Người N" và đổi tên tay được.

### 5.6 Không lưu

Nhúng và tâm chỉ nằm trong RAM của `speaker-worker`, xóa khi dừng phiên hay worker thoát. Không ghi đĩa, không gửi đi,
không đưa vào log hay báo cáo.

## 6. Đọc tên từ app họp

### 6.1 Danh sách app và cửa sổ họp

Danh sách app **viết cứng trong app** (công thức đọc chỉ được thu hẹp):

| App | macOS | Windows | Cửa sổ họp |
|---|---|---|---|
| Teams | `com.microsoft.teams2` | `ms-teams.exe` | Tiêu đề theo công thức (ví dụ "Meeting with …", "Cuộc họp với …"), có nút rời cuộc gọi |
| Zoom | `us.zoom.xos` | `Zoom.exe` | `AXIdentifier` = `zm.meeting.window.main` (macOS), tiêu đề "Zoom Meeting" |
| Meet | `com.google.Chrome`, `com.microsoft.edgemac` | `chrome.exe`, `msedge.exe` | Tiêu đề bắt đầu bằng "Meet – " / "Meet - " |

- Worker quét tiến trình đang chạy mỗi 2 s trong phiên. Chỉ đọc cửa sổ họp; không đọc cửa sổ hay tab khác (không đọc thanh
  địa chỉ, chỉ tiêu đề cửa sổ).
- Có nhiều cửa sổ họp cùng lúc thì đọc tất cả (tối đa 2), ưu tiên cửa sổ có tiếng nói khớp.

### 6.2 Đọc cây

- **macOS:** `AXUIElementCreateApplication(pid)`, `AXUIElementSetMessagingTimeout` 0,2 s. Teams: đặt
  `AXEnhancedUserInterface = true` khi gặp cửa sổ họp, đặt lại `false` khi dừng phiên; có dấu trong thư mục dữ liệu để lần mở
  app sau trả lại nếu app thoát đột ngột. Chrome, Edge: đặt `AXManualAccessibility = true` khi gặp cửa sổ Meet (trình duyệt
  không cho đặt lại; còn bật tới khi khởi động lại trình duyệt).
- **Windows:** `IUIAutomation::ElementFromHandle` trên cửa sổ họp, `CacheRequest` lấy `Name`, `ControlType`, `AutomationId`,
  `ClassName`, duyệt bằng `TreeWalker`. Không cần đặt thuộc tính nào.
- **Giới hạn mỗi lượt:** ≤ 3 000 phần tử, ≤ 30 ms; vượt thì dừng lượt đó, lượt sau đọc tiếp. Nhịp: 4 lần mỗi giây khi có tiếng
  nói (theo `Speech`), 1 lần mỗi giây khi im.
- Tiến trình con hưởng quyền Trợ năng của app chính trên macOS (tiến trình chịu trách nhiệm là app); spike kiểm trên bản ký
  ad-hoc. Không thì phương án dự phòng là chạy phần đọc trong tiến trình chính ở luồng riêng (mục 14).

### 6.3 Thứ lấy ra

Mỗi lượt đọc trả về đúng danh sách `Participant {name, muted: Option<bool>, speaking: f32, is_self}` kèm giờ hệ thống. Tên
được làm gọn theo công thức (bỏ hậu tố như "(Guest)", "(Khách)", "(Host)", "(me)"), dài tối đa 40 ký tự. Không lấy thứ gì khác
ra khỏi hàm đọc: không chat, không nội dung cửa sổ khác, không ảnh.

### 6.4 Tín hiệu "đang nói", theo thứ tự

1. **Chữ rõ ràng:** mẫu chữ trong nhãn của ô video (Zoom: "active speaker", "đang nói" theo ngôn ngữ giao diện).
2. **Hành vi:** phần tử neo cạnh tên (theo công thức: cùng ô, cách chữ tên ≤ k nút) đổi trạng thái nhiều lần trong 1 s, hoặc
   khác trạng thái thường gặp nhất của chính nó (Teams: phần tử id `roster-avatar-img-*`; Meet: nhóm có lớp CSS ngay trước chữ
   tên). Không cần biết tên lớp CSS.
3. **Bật/tắt mic:** nhãn trợ năng "muted/unmuted" theo ngôn ngữ; chỉ dùng khi đúng một người ở xa đang mở mic.
4. **Tự hiệu chỉnh** (mục 6.5) khi ba tín hiệu trên không tìm thấy hoặc ngừng khớp.

Riêng Teams: ô video chỉ cho biết bật/tắt mic, chỉ báo nói đo được nằm ở bảng People. Spike tìm thêm chỉ báo ở ô video khi
bảng People đóng; không thấy thì Teams dùng bảng People khi mở, tín hiệu 3 và 6.5 khi đóng, và Cài đặt ghi mẹo "mở bảng
Người tham gia trong Teams để tên chính xác hơn". App không tự bấm gì trong Teams.

### 6.5 Tự hiệu chỉnh

- Trong phiên, worker ghi lại các lần đổi trạng thái của mọi phần tử trong cửa sổ họp gần chữ tên người tham dự (trong giới hạn
  của 6.2), và so với khoảng có tiếng nói của âm thanh máy (`Speech`) trong 60 s gần nhất, dời 0,6 s.
- Phần tử nào có hệ số tương quan ≥ 0,6 với tiếng nói, và chỉ đổi khi có tiếng, được dùng làm chỉ báo của người tham dự gần nó
  tới hết phiên.
- Mẫu chỉ báo tìm được (vai trò, id, lớp CSS, vị trí so với chữ tên; **không có tên người**) đi kèm báo cáo tình trạng để người
  vận hành cập nhật công thức.

### 6.6 Ghép tên vào giọng

- Với mỗi giọng, cộng dồn thời gian trùng giữa các đoạn của giọng đó và khoảng "đang nói" của từng người tham dự, sau khi dời
  mốc theo độ trễ của app (công thức; mặc định 0,6 s).
- **Gán tên khi đủ cả ba:** một tên chiếm ≥ 60% thời gian trùng của giọng, có ≥ 3 s bằng chứng, từ ≥ 2 đoạn. Mỗi tên một giọng
  (ghép cặp Hungarian theo thời gian trùng).
- **Một tên khớp nhiều giọng** (máy chung phòng họp): giữ tên kèm số, "Phòng A · giọng 1", "Phòng A · giọng 2" theo thứ tự nói.
- **Chống nhảy tên:** đổi tên đã gán chỉ khi tên mới hơn tên cũ ≥ 20% thời gian trùng và ≥ 5 s.
- Bỏ qua: chính người dùng (`is_self`: "(me)" của Zoom, "Myself video"/"(You)" của Teams, "Bạn"/"You" của Meet), giọng trong phòng
  (5.5).
- Tên đổi tay trong phiên luôn thắng tên tự động.

### 6.7 Quyền Trợ năng (macOS)

- Dùng lại luồng của Gõ dịch: kiểm `AXIsProcessTrusted`, mở System Settings, nút `tccutil reset Accessibility` khi quyền cũ sau
  cập nhật.
- **Dòng mời trên thanh phụ đề** hiện khi đủ: đang dịch, worker thấy cửa sổ họp của app trong danh sách, chưa có quyền, công tắc
  "Lấy tên" bật, thanh chưa khóa. Nút "Mở Cài đặt" và ✕ (ẩn tới hết phiên). Thanh đã khóa thì không hiện (click đi xuyên).
- Cài đặt › Phụ đề › Người nói hiện trạng thái quyền và nút cấp quyền. Windows không có dòng này.

### 6.8 Tác động lên app khác

- Teams: `AXEnhancedUserInterface` chỉ bật trong phiên dịch có cửa sổ họp Teams. Spike đo CPU của Teams và hiệu ứng cửa sổ;
  ảnh hưởng rõ thì chỉ bật quanh mỗi lượt đọc.
- Chrome, Edge: `AXManualAccessibility` còn bật tới khi khởi động lại trình duyệt. Spike đo CPU, RAM của trình duyệt khi bật. Nói
  rõ trong chính sách quyền riêng tư và trang hỗ trợ.
- Không bấm, không gõ, không đổi gì khác trong app họp.

## 7. Chống vỡ và vận hành

### 7.1 Công thức đọc

- **Nguồn:** `scripts/speaker-recipes/recipes.json` (trong repo). Bản build sẵn được nhúng vào app lúc build. Bản mới đăng ở
  `https://releases.aitranslator.vn/speaker/recipes.json`.
- **Phong bì ký** cùng cấu trúc với `models.json` (`models/signed.rs`), cùng khóa ký manifest trong CI, nhưng `format` là
  `ai-translator-speaker-recipes` và **tiền tố ký riêng**, để chữ ký manifest model không dùng được cho công thức và ngược lại.
- **App tải** lúc mở và mỗi 6 giờ, kiểm chữ ký, kiểm `schema`, `min_app_version`, không nhận bản cũ hơn bản đang có (chống
  quay lui), lưu trên máy. Lỗi gì cũng giữ bản đang có.
- **Nội dung (chỉ mô tả, không có mã):** theo từng app và hệ điều hành: mẫu tiêu đề cửa sổ họp; quy tắc tìm chữ tên (vai trò,
  id hay tiền tố id, mẫu nhãn theo 5 ngôn ngữ giao diện); quy tắc chỉ báo nói (vị trí so với chữ tên, loại tín hiệu: chữ /
  đổi trạng thái / khác trạng thái thường gặp); dấu nhận ra chính người dùng; mẫu nhãn mic; mẫu bỏ hậu tố tên; độ trễ dời mốc.
- **Giới hạn an toàn:** mẫu chữ dùng crate `regex` (thời gian tuyến tính, không bị làm treo), mỗi mẫu ≤ 256 ký tự, cả file ≤ 256
  KB; app trong công thức phải thuộc danh sách viết cứng (6.1), không thì bỏ cả mục đó.
- **Đăng bản mới:** `pnpm recipes:update` giống `pnpm models:update`: kiểm cấu trúc, chạy bộ test cây giao diện ghi sẵn (mục 12),
  hỏi y/N, CI ký và đăng R2.

### 7.2 Báo cáo tình trạng

- Mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản app họp), gửi qua `POST /v1/diagnostics` với `kind` mới
  `speaker_health`, chỉ khi công tắc "Gửi báo cáo lỗi" (Cài đặt › Quyền riêng tư) đang bật.
- Nội dung: phiên bản app, hệ điều hành, app họp và phiên bản, phiên bản công thức, trạng thái (`ok`, `no_names`,
  `no_speaking`, `no_permission`, `blocked`), số phút đọc được tên / tổng số phút họp, mẫu chỉ báo tự hiệu chỉnh tìm được (6.5),
  cờ `canary`. **Không có tên người, không có chữ.** Đi qua bộ che và kiểm lần cuối của báo cáo lỗi.
- Server: bảng D1 `speaker_health`, giới hạn tần suất như báo cáo lỗi. Web Admin: bảng theo app họp, phiên bản và trạng thái.
  Cron gửi email vận hành khi một phiên bản app họp có ≥ 30% báo cáo hỏng (từ 5 báo cáo), hoặc lượt kiểm tra tự động hỏng 2
  ngày liền.

### 7.3 Kiểm tra tự động hằng ngày

- `tools/speaker-canary/`: kịch bản như nghiên cứu (tạo phòng, cho 2 khách nói lần lượt rồi nói chồng, chạy bản app dev, kiểm
  tên ra đúng), chạy ban đêm trên Mac (launchd) và máy Windows (Task Scheduler) của chủ dự án; mỗi lần ~5 phút mỗi app.
- Tài khoản: 2–3 Gmail (khách Meet phải đăng nhập), 1 tài khoản Microsoft cá nhân (chủ phòng Teams; khách Teams vào bằng trình
  duyệt). Chủ dự án tạo và đăng nhập sẵn trên máy chạy kiểm tra, trong hồ sơ trình duyệt riêng. Mật khẩu không nằm trong repo.
- Khách dùng micro giả là file giọng đọc, không phát tiếng ra loa. Kết quả gửi như `speaker_health` với `canary = true`.

### 7.4 Hỏng thì vẫn chạy

Bộ đọc không đọc được tên thì phụ đề vẫn có "Người N". Người dùng bấm nhãn để chọn tên trong danh sách người tham dự (đọc từ
chữ hiển thị, ít vỡ hơn chỉ báo nói) hoặc gõ tên.

## 8. Giao diện

Mẫu đã duyệt (dựng trên giao diện thật bằng `scripts/ui-preview`): `bench/2026-10-26-nguoi-noi/truoc-spec/mock/`.

### 8.1 Thanh phụ đề

- Tên có màu ở dòng đầu mỗi lượt nói (cỡ 0,56 em, đậm). Mọi câu của lượt có vạch màu bên trái (0,16 em). Câu tiếp theo của
  cùng người không lặp tên.
- Bảng 8 màu đọc rõ trên nền tối của thanh: `#7cc4ff`, `#ffb86b`, `#9be38f`, `#f59fd5`, `#c7a6ff`, `#ffe27a`, `#6fe0d2`,
  `#ff8f8f`; giọng N lấy màu theo thứ tự xuất hiện.
- Giọng chưa xác định: chưa hiện nhãn và vạch (tránh nhấp nháy); có `Assign` thì gắn ngay vào đúng dòng. Tên đổi (tên thật về
  muộn, đổi tay, gộp) thì nhãn đổi tại chỗ.
- Dòng mời cấp quyền (6.7) nằm trên cùng, nền mờ, chữ nhỏ.
- Công tắc "Phân biệt người nói" tắt thì thanh như hiện nay.

### 8.2 Cửa sổ chính

- Bản chép lời: nhãn dạng "chip" có chấm màu ở đầu mỗi lượt nói, vạch màu bên trái các dòng. Bảng màu đậm hơn cho nền sáng:
  `#1f6fd1`, `#c25e00`, `#2f8a3b`, `#b8378f`, `#7048c9`, `#9a7a00`, `#0f8a7e`, `#c93a3a`; nền tối dùng bảng của thanh phụ đề.
- Bấm nhãn mở menu: ô "Đổi tên" (≤ 40 ký tự), "Chọn người trong cuộc họp" (danh sách `participants`), "Gộp vào người khác ▸".
  Áp cho mọi câu của giọng đó trong phiên.
- Lịch sử (Pro) hiện nhãn đã lưu, không sửa được (như nội dung hiện nay).

### 8.3 Cài đặt › Phụ đề › nhóm "Người nói"

- "Phân biệt người nói" (bật sẵn): "Mỗi người một màu trên phụ đề. Nhận giọng ngay trên máy; không lưu, không gửi đi, hết phiên
  thì xóa."
- "Lấy tên từ Teams, Meet, Zoom" (bật sẵn): "Hiện tên người đang nói, đọc từ cửa sổ cuộc họp (Teams và Zoom bản cài, Meet trong
  Chrome hoặc Edge). Không đọc chat, không chụp màn hình. Chưa đọc được tên thì hiện "Người 1", "Người 2"." Tắt khi "Phân biệt
  người nói" tắt.
- "Quyền Trợ năng" (chỉ macOS): trạng thái và nút cấp quyền, dùng chung với Gõ dịch.
- Không thêm tab mới (hàng tab đã đủ chỗ cho 8 tab).

### 8.4 Ngôn ngữ và quyền của cửa sổ

- Chữ mới có đủ 5 ngôn ngữ giao diện; `check-i18n` phải đạt.
- Cửa sổ `overlay` nhận thêm sự kiện `subtitle://speaker`, `speaker://roster`, và **đúng một lệnh mới không tham số**
  `open_speaker_settings` cho nút "Mở Cài đặt" của dòng mời: lệnh chỉ hiện cửa sổ chính ở Cài đặt › Phụ đề (việc menu khay vốn
  làm được), không đọc hay đổi dữ liệu gì. Hiện thanh chỉ có `get_overlay_view`, `hide_overlay` và các lệnh kéo cạnh, không có
  đường nào mở Cài đặt.
- Cửa sổ `main` thêm lệnh `rename_speaker`, `merge_speakers`, và hai khóa cài đặt mới.

## 9. Dữ liệu

- **`Subtitle`** thêm `speaker: Option<u32>` (mã giọng). Tên và màu không nằm trong phụ đề.
- **Sự kiện mới:** `subtitle://speaker {id, speaker}`; `speaker://roster {voices: [{id, label, color, source: "name" | "voice" |
  "user", room: bool}], participants: [string]}`; `label` đã tính sẵn ("Lan Nguyễn", "Người 3", "Phòng A · giọng 1").
- **Bản chép lời trong bộ nhớ** giữ `speaker` của từng dòng và bảng người nói của phiên; đổi tên và gộp sửa bảng này.
- **Lịch sử:** migration thêm cột `speaker TEXT` (cho phép rỗng) vào `lines`; lưu nhãn tại lúc ghi, sau đổi tên. Vẫn trong
  SQLCipher, vẫn chỉ khi có Pro và bật "Lưu lịch sử".
- **Xuất file** (Pro): TXT `[giờ] Lan: câu gốc` rồi `→ bản dịch`; SRT thêm tùy chọn tiền tố `Lan: `; Markdown `**Lan:** …`. Không
  có nhãn thì như cũ.
- **Cài đặt:** `speakerDiarization: bool = true`, `speakerNames: bool = true`. Dòng mời đã ẩn chỉ nhớ trong phiên.

## 10. Bảo mật và quyền riêng tư

| Mối lo | Biện pháp |
|---|---|
| Thêm bí mật vào app | Không có bí mật mới. Công thức ký bằng khóa manifest trong CI; app chỉ có khóa công khai. |
| Thay hay sửa `speaker-worker` | SHA-256 theo danh sách build sẵn trước khi chạy, ký cùng app, nạp DLL hạn chế (§10.2 spec chính). |
| Worker gửi dữ liệu ra ngoài | Không có mã mạng (CI kiểm cây phụ thuộc). Worker chỉ nói chuyện với app qua stdin/stdout. |
| Đọc quá phạm vi | Danh sách app viết cứng; chỉ cửa sổ họp; chỉ tên, trạng thái mic, mức nói; giới hạn phần tử và thời gian; không chat, không URL, không ảnh. |
| Công thức độc (khóa ký bị lộ) | Chỉ mô tả, không mã; không thêm được app; mẫu chữ không thể làm treo; worker không có mạng nên không gửi được gì. |
| Lộ dấu vân giọng | Chỉ trong RAM của worker, xóa khi hết phiên; không ghi đĩa, không log, không báo cáo. |
| Lộ tên người tham dự | Chỉ trong RAM và Lịch sử mã hóa (Pro, khi bật lưu); log chỉ có số đếm và trạng thái; bộ che báo cáo lỗi thêm luật kiểm; báo cáo tình trạng không có tên. |
| Quyền mới | Không thêm entitlement; macOS dùng quyền Trợ năng sẵn có của app; Windows không cần quyền quản trị. Cửa sổ `overlay` chỉ thêm `open_speaker_settings` (không tham số, chỉ hiện cửa sổ chính ở Cài đặt › Phụ đề). |
| App họp treo khi bị đọc | Chờ tối đa 0,2 s mỗi lệnh; treo hay lỗi thì chỉ worker chết, phụ đề vẫn chạy. |
| Phụ thuộc mới | `realfft` và feature mới của `windows` qua `cargo deny`, `cargo audit`; bản mới nhất ổn định theo §6.12. |

**Pháp lý:**

- Chính sách quyền riêng tư lên phiên bản mới (vi, en): app tạm thời phân tích đặc điểm giọng ngay trên máy để phân biệt người
  nói, không để xác định danh tính, không lưu, không gửi đi; app đọc tên người tham dự hiển thị trên cửa sổ cuộc họp để gắn nhãn;
  tên chỉ lưu khi người dùng bật Lưu lịch sử; nói về chế độ trợ năng của trình duyệt (6.8). EULA không đổi trừ khi rà soát thấy cần.
- Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định 356/2025: dữ liệu sinh trắc học dùng để xác định
  người là dữ liệu nhạy cảm. Thiết kế không lưu, không gửi, không xác định danh tính; **chủ dự án hỏi luật sư trước khi phát
  hành.**
- Website chỉ nói điều có thật về tính năng ("phân biệt người nói, hiện tên từ Teams, Meet, Zoom"), không nêu tên model, thư viện
  hay cách đọc giao diện (CLAUDE.md, `website/README.md`).

## 11. Hiệu năng

- **Độ trễ (ưu tiên số 1):** đo xen kẽ bật/tắt tính năng như nghiệm thu A2 của nguồn micro (`latency-bench session`, cùng đoạn
  âm thanh, nhiều lượt). So với tắt: A2 p50 chậm thêm ≤ 20 ms, p90 ≤ 50 ms; chữ dịch đầu tiên p50 ≤ 20 ms.
- **Tải:** `speaker-worker` trung bình ≤ 5% một lõi trên M4 Pro và ≤ 10% trên Windows i5 khi người nói liên tục; RAM ≤ 150 MB.
  Đọc giao diện ≤ 30 ms mỗi lượt. Đo thêm phần tốn của Teams và trình duyệt khi bật trợ năng (6.8).
- **Khi quá tải:** kênh 4 đoạn đầy thì bỏ đoạn; worker xử lý chậm hơn thời gian thực trong 30 s liền thì tạm dừng đọc tên, chỉ
  nhận giọng; vẫn chậm thì báo app tắt tính năng tới hết phiên. Không bao giờ làm chậm pipeline.

## 12. Kiểm thử và nghiệm thu

**Test tự động:**

- fbank so với `kaldi-native-fbank`; nhúng so với onnxruntime; phân cụm tất định; luật độ dài đoạn; gộp giọng.
- Ghép tên vào giọng trên dòng thời gian giả (trễ, nói chồng, máy chung phòng, người dùng, giọng trong phòng, đổi tay).
- Giao thức: biến thể ghim chỉ số, khung hỏng, giới hạn kích thước.
- Bộ đọc trên **cây giao diện ghi sẵn** (JSONL, tên người thay bằng tên giả) cho từng app và hệ điều hành: ra đúng người tham dự,
  đúng mức nói. Mỗi lần sửa công thức phải qua bộ này.
- Công thức: chữ ký, tiền tố riêng, chống quay lui, giới hạn mẫu và kích thước, app ngoài danh sách bị bỏ.
- Luật ghép câu mới; hàng đợi; migration Lịch sử; xuất file; sự kiện tới giao diện; capability của `overlay` chỉ thêm
  `open_speaker_settings` (test ACL hiện có).

**Nghiệm thu:**

| # | Tiêu chí | Mức đạt |
|---|---|---|
| A-spk1 | Nhận giọng offline trên AMI (4 bản ghi kiểm, tham số cố định) | Dòng ≥ 1 s đúng người ≥ 85%, mọi dòng ≥ 80%; làm mốc chống thụt lùi |
| A-spk2 | Nhận giọng tiếng Việt: hội thoại dựng từ Common Voice tiếng Việt (CC0, có mã người nói), 3–4 người | Dòng ≥ 1 s đúng người ≥ 85% |
| A-spk3 | Tên thật: kịch bản tự động, Zoom, Teams, Meet × macOS, Windows; tính sau khi mỗi người đã nói ≥ 2 lượt | Dòng ≥ 1 s đúng tên ≥ 90%; sai tên ≤ 5% |
| A-spk4 | Độ trễ (mục 11) | A2 p50 ≤ +20 ms, p90 ≤ +50 ms, chữ đầu ≤ +20 ms |
| A-spk5 | Tải (mục 11) | CPU, RAM trong ngân sách; Teams và trình duyệt không chậm rõ |
| A-spk6 | Họp thật tiếng Việt ≥ 3 người do chủ dự án thử, macOS và Windows | Chủ dự án đánh giá đạt |
| A-spk7 | Bảo mật | `cargo deny`, `cargo audit`, kiểm không có mã mạng trong worker, capability `overlay` chỉ thêm `open_speaker_settings`, báo cáo không có tên |

## 13. Kế hoạch

Một lần phát hành cho cả macOS và Windows. Mỗi kế hoạch viết sau khi kế hoạch trước xong và chủ dự án duyệt.

1. **01 Spike:** fbank Rust + ERes2Net trên `candle-onnx`, đo tốc độ macOS và Windows i5; dựng dữ liệu tiếng Việt từ Common Voice
   và đo A-spk2; kiểm tiến trình con hưởng quyền Trợ năng (bản ký ad-hoc); đo phần tốn của Teams và Chrome khi bật trợ năng; tìm
   chỉ báo nói ở ô video Teams khi bảng People đóng; làm thử bộ đọc UI Automation trên Windows (Teams, Chrome); kiểm app 0.3.1 đọc
   manifest có khóa `speaker`; chốt ngưỡng (θ, gộp, ghép tên).
2. **02 Worker và pipeline:** `speaker-protocol`, `speaker-worker` (nhận giọng), client trong app, cờ nguồn ở bộ trộn, luật ghép
   câu, `Subtitle.speaker`, sự kiện; lệnh `latency-bench` đo A-spk1/A-spk2; đo A-spk4.
3. **03 Giao diện và dữ liệu:** thanh phụ đề, bản chép lời, menu đổi tên và gộp, Cài đặt, Lịch sử, xuất file, 5 ngôn ngữ.
4. **04 Đọc tên macOS:** bộ đọc Zoom, Teams, Meet (Chrome, Edge), tự hiệu chỉnh, ghép tên vào giọng, dòng mời cấp quyền, công thức
   build sẵn, bộ test cây giao diện ghi sẵn.
5. **05 Đọc tên Windows:** bộ đọc UI Automation cho ba app; chủ dự án thử trên máy Windows.
6. **06 Vận hành:** công thức ký số (`pnpm recipes:update`, CI, R2), báo cáo `speaker_health` (app, server, D1, Web Admin, cron),
   kiểm tra tự động hằng ngày (macOS, Windows).
7. **07 Phát hành:** chính sách quyền riêng tư, sửa spec chính (mục 15), website 5 ngôn ngữ, nghiệm thu A-spk1–7, phát hành.

**Việc của chủ dự án:** tạo tài khoản thử và đăng nhập trên máy chạy kiểm tra; thử trên Windows (kế hoạch 05, 07); họp thật
A-spk6; hỏi luật sư (mục 10).

## 14. Rủi ro và phương án

| Rủi ro | Phương án |
|---|---|
| Nhận giọng tiếng Việt kém hơn tiếng Anh | Đo ở spike (A-spk2); kém thì thử TitaNet-small, CAM++ zh_en (vá đồ thị cho `candle-onnx`), chỉnh θ. |
| Windows i5 chạy nhận giọng chậm | Đo ở spike; chậm thì 1 luồng, bỏ đoạn < 1 s, hoặc tự tắt trên máy yếu như chế độ dịch trong lúc nói. |
| Teams, Meet đổi giao diện | Năm lớp ở mục 7 và 6.4–6.5; hỏng thì lùi về "Người N". |
| Tiến trình con không hưởng quyền Trợ năng | Chạy phần đọc tên trong tiến trình chính ở luồng riêng, giữ giới hạn thời gian; nhận giọng vẫn ở worker. |
| Bật trợ năng làm Teams hay trình duyệt chậm | Chỉ bật quanh lượt đọc (Teams); giảm nhịp đọc; ghi rõ cho người dùng. |
| Người dùng Teams không mở bảng People | Tín hiệu bật/tắt mic, tự hiệu chỉnh, mẹo trong Cài đặt; chấp nhận độ đúng thấp hơn trên Teams. |
| Nhiều người nói chồng, máy chung phòng | Thà "Người N" hay "Phòng A · giọng N" còn hơn sai tên; người dùng đổi tay. |

## 15. Sửa spec chính khi phát hành (kế hoạch 07)

- §2 D1: thêm phân biệt người nói và tên từ Teams, Meet, Zoom.
- §3.1: thêm F13. §3.2: bỏ "Phân biệt ai đang nói". §3.3: thêm A-spk1–A-spk7.
- §5: thêm tiến trình phụ `speaker-worker` vào sơ đồ.
- §6.3: luật ghép câu không ghép hai giọng khác nhau. §6.6: `Subtitle.speaker`, sự kiện mới, Lịch sử, xuất file.
- §7: luồng client `speaker-worker`, kênh 4 đoạn bỏ khi đầy; hàng đợi không gộp hai giọng khác nhau.
- §8: ngân sách CPU, RAM của `speaker-worker`.
- §10.1: dữ liệu giọng và tên người tham dự, báo cáo tình trạng. §10.2: các dòng ở mục 10 của spec này.
