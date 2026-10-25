# Nguồn micro: dịch giọng trong phòng, riêng hay cùng âm thanh máy (thiết kế)

Ngày 2026-10-24. Nhánh `nguon-micro` (worktree `meeting-translator-work/nguon-micro`). Phạm vi: `crates/audio-capture`
(nguồn micro, `Preprocessor`, bộ trộn có nhường lời, chống tiếng ồn ở micro, công cụ `capture`), `crates/pipeline`
(`FrameSource` có thêm bản cho VAD, tham số VAD theo chế độ, luật lọc câu ngắn), `crates/latency-bench` (lệnh `mix-eval`),
`src-tauri/src/capture.rs`, `src-tauri/src/settings/mod.rs`, `src-tauri/src/session.rs`, `src-tauri/src/errors.rs`,
`src-tauri/src/system.rs`, `src-tauri/src/actions.rs`, `src-tauri/Info.plist`, `src-tauri/macos/*.lproj/InfoPlist.strings`,
`src/lib/ipc.ts`, `src/lib/audioSource.ts`, `src/lib/subtitleView.ts`, `src/windows/main/settings/AudioSettings.tsx`,
`src/windows/main/screens/Home.tsx`, `src/i18n/*.ts`, `docs/legal/{privacy,eula}.{vi,en}.md`, `website/src/content/*`,
`bench/2026-10-24-nguon-micro/`, spec chính §2 (D1, D9), §3.1–§3.3, §4.3, §6.1, §6.2, §9, §10.1.

## 1. Mục tiêu

Chủ dự án muốn app lấy tiếng từ micro để dịch giọng nói ngoài đời, và dịch được cùng lúc cả giọng ngoài đời lẫn giọng
trong app họp. Ví dụ: họp lai, một số người ngồi cùng phòng, một số người họp online.

Hiện trạng (đọc code ngày 2026-10-24):

- Spec chính §3.2 xếp "Thu âm từ micro" vào ngoài phạm vi MVP. D1 nói app dịch "mọi âm thanh máy tính đang phát".
- Pipeline chỉ nhận **một luồng 16 kHz mono** (`pipeline::engine::FrameSource`): một VAD, rồi whisper, rồi dịch. Câu
  không mang thông tin "đến từ nguồn nào".
- `audio_capture::preprocess::Preprocessor` đã nhận được hai nguồn. Nó resample từng nguồn về 16 kHz rồi trộn bằng
  `Mixer2`, bù lệch đồng hồ bằng cách phát riêng phần dư quá 100 ms. Windows dùng cách này để trộn thiết bị Console với
  thiết bị Communications.
- macOS đã khai entitlement `com.apple.security.device.audio-input` (`src-tauri/release/entitlements.plist`). Còn thiếu
  `NSMicrophoneUsageDescription`.

Chủ dự án chọn (2026-10-24):

1. **Micro dùng để thu người khác trong phòng.** Giọng thu được dịch sang ngôn ngữ của người dùng, cùng chiều với tiếng
   cuộc họp online.
2. **Không cần nhãn nguồn.** Ở chế độ âm thanh máy + micro, hai luồng được trộn thành một trước VAD. Pipeline (nhận dạng,
   ghép câu, dịch, phụ đề) giữ nguyên, trừ ba chỗ nhỏ cho việc chống tiếng ồn (mục 5.8).
3. **Mọi gói đều dùng được** (kể cả Free dùng thử). Phút vẫn trừ theo hạn mức như cũ.
4. **Xử lý tiếng vọng bằng cách nhường lời** (mục 5.4), kèm một spike so ba cách (trộn thẳng, nhường lời, khử vọng AEC3)
   trên bản thu thật rồi mới chốt (mục 6).
5. **Micro phải hạn chế tối đa tiếng ồn và tạp âm** (gõ bàn phím, bấm hay viết bút, gõ bàn…) để không dịch sai và không
   hiện chữ không mong muốn. Khi phải chọn, **ưu tiên không có chữ ảo**: chấp nhận bỏ sót một phần câu thật rất ngắn nói
   riêng lẻ ("OK", "Vâng") khi phòng ồn (mục 5.7, mức đạt ở mục 6.3).

## 2. Ngoài phạm vi

- Nhãn nguồn trên phụ đề ("Trong phòng" / "Cuộc họp"), tách hai làn VAD. Nếu sau này cần thì làm spec riêng; nhánh này
  để sẵn chỗ nối (mục 5.5).
- Dịch giọng của chính người dùng sang tiếng người bên kia (dịch hai chiều), micro ảo, phát giọng dịch vào cuộc họp.
- Lọc riêng giọng của chính người dùng. Câu tiếng Việt của người dùng hiện câu gốc, không dịch, theo luật F2 hiện có.
- Khử vọng của hệ điều hành:
  - macOS Voice Processing (`kAudioUnitSubType_VoiceProcessingIO`) làm nhỏ tiếng các app khác khoảng 8 dB ngay cả ở mức
    thấp nhất. Nó cũng lỗi (−10875) khi micro và loa là hai thiết bị khác nhau.
  - Windows chỉ cho chọn tham chiếu AEC (`IAcousticEchoCancellationControl`) từ build 22621, tùy driver; Windows 10
    không có.
- Tự cân mức micro (AGC). Chỉ thêm nếu spike cho thấy VAD bỏ sót giọng ở xa (mục 6.3).
- Lọc ồn cho luồng âm thanh máy: đó là tín hiệu số, app họp đã tự lọc ồn phía người nói.
- Lọc giọng của hệ điều hành (Voice Isolation trên macOS, Studio Effects trên Windows): app không điều khiển được, và
  chúng chỉ áp cho một số app hay một số máy.
- Phân biệt người nói, ghi âm.

## 3. Trải nghiệm người dùng

### 3.1. Ba chế độ

| Chế độ | Thu gì | Dùng khi |
|---|---|---|
| Âm thanh máy (mặc định, như hiện nay) | Như `audioSource` hiện có: toàn hệ thống hay một app (macOS), tự động hay một thiết bị phát (Windows) | Họp online, xem video |
| Micro | Chỉ micro | Nói chuyện trực tiếp, nghe giảng, họp tại chỗ |
| Âm thanh máy + Micro | Trộn hai luồng thành một (mục 5.3, 5.4) | Họp lai: người trong phòng và người online |

### 3.2. Cài đặt › Âm thanh

- **Dòng mới "Nguồn"** (ba lựa chọn ở mục 3.1), đặt trên bộ chọn nguồn hiện có.
- **Bộ chọn âm thanh máy** (đang có): hiện ở chế độ Âm thanh máy và Âm thanh máy + Micro.
- **Bộ chọn micro** (mới): hiện ở chế độ Micro và Âm thanh máy + Micro.
  - Mặc định "Micro mặc định của hệ thống", tự theo khi người dùng đổi micro mặc định (cắm tai nghe). Có thể chọn một
    micro cụ thể.
  - Ghi chú dưới bộ chọn: "Dùng micro của tai nghe Bluetooth làm tai nghe chuyển sang chế độ gọi: tiếng nghe kém đi."
- **Công tắc "Lọc tiếng ồn micro"** (mới, mặc định bật): hiện ở chế độ Micro và Âm thanh máy + Micro. Ghi chú: "Bỏ qua
  tiếng gõ phím, tiếng bút, tiếng gõ bàn. Một số câu rất ngắn như "OK" có thể bị bỏ qua khi phòng ồn; tắt nếu phòng
  yên tĩnh mà câu ngắn hay bị mất." Tắt thì bỏ lớp 2, 4, 5 của mục 5.7; lớp 1 (lọc 80 Hz) luôn chạy.
- **Ở chế độ Âm thanh máy + Micro**, có ghi chú: "Khi người online đang nói, micro được hạ xuống để không dịch hai lần.
  Người trong phòng nói chen lúc đó có thể bị bỏ sót. Đeo tai nghe cho kết quả tốt nhất."
- Đổi chế độ hay đổi micro giữa phiên thì có tác dụng ở lần bắt đầu phiên sau, giống `audioSource` hiện nay.

### 3.3. Màn hình chính và thanh phụ đề

- Nhãn nguồn ghi đúng chế độ: "Toàn hệ thống", "Micro: {tên}", "Toàn hệ thống + Micro: {tên}" (tên micro do hệ điều
  hành báo). Áp cho cả nhãn của nguồn một app và thiết bị phát hiện có.
- Mức âm lượng vào đo trên luồng đã trộn.
- Ghi chú trạng thái mới (ở `Home.tsx` và `subtitleView.ts`, như `waitingForApp`), xem mục 7.

### 3.4. Quyền micro

- **Chỉ hỏi khi người dùng chọn chế độ có micro:** lúc chọn trong Cài đặt, và lúc bắt đầu phiên nếu quyền vẫn ở trạng
  thái chưa hỏi (ví dụ sau một bản cập nhật). Đã bị từ chối thì không hỏi lại mà xử lý theo mục 7. Không thêm bước vào
  màn hình chào lần đầu (§4.1 của spec chính không đổi).
  - Lý do: app ký ad-hoc nên macOS hỏi lại quyền sau mỗi bản cập nhật. Hỏi theo cách này thì chỉ người thật sự dùng micro
    mới bị hỏi lại.
- **macOS:**
  - Thêm `NSMicrophoneUsageDescription` vào `Info.plist`, và vào `InfoPlist.strings` của năm ngôn ngữ (en, vi, ja,
    zh-Hans, ko).
  - Đọc trạng thái quyền bằng `AVCaptureDevice.authorizationStatus(for: .audio)`, xin quyền bằng `requestAccess`.
  - Có nút mở `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` (hằng mới trong `system.rs`,
    cạnh `AUDIO_PERMISSION_URL`).
- **Windows:**
  - Phát hiện công tắc "Let desktop apps access your microphone" đang tắt. Cách phát hiện chốt ở spike: mã lỗi WASAPI hay
    khóa `ConsentStore\microphone` (mục 6.4).
  - Báo kèm nút mở `ms-settings:privacy-microphone`.

### 3.5. Gói và hạn mức

- Mọi gói đều dùng được ba chế độ.
- Phút vẫn tính bằng `speech_ms` của luồng đưa vào VAD (luồng đã trộn). Tiếng nói trong phòng cũng trừ phút. Hai người
  nói chồng nhau chỉ tính một lần vì chỉ có một VAD.

### 3.6. Hệ quả cần biết (ghi vào hướng dẫn trên website)

- Micro thu cả giọng của chính người dùng.
- App vẫn thu micro dù người dùng đã tắt mic trong app họp: đây là hai việc độc lập. macOS hiện chấm cam, Windows hiện
  biểu tượng micro trên khay trong lúc app thu.
- Tai nghe Bluetooth: mở micro của tai nghe làm tai nghe chuyển sang chế độ gọi (băng hẹp).

## 4. Settings và IPC

- **Settings** (serde camelCase, đọc settings cũ không có hai trường này thì lấy mặc định, người dùng cũ không đổi gì):
  - `captureMode: "playback" | "mic" | "both"`, mặc định `"playback"`.
  - `micDevice: string | null`, mặc định `null` (micro mặc định). Nếu có giá trị thì kiểm bằng `check_id` như
    `audioSource`.
  - `micNoiseFilter: boolean`, mặc định `true` (mục 3.2, 5.7).
  - `audioSource` giữ nguyên ý nghĩa: là phần "âm thanh máy" của chế độ `playback` và `both`.
- **Lệnh IPC mới:**
  - `list_input_devices` → `{ id, name, isDefault }[]`.
  - `mic_permission` → `"granted" | "denied" | "undetermined"`. Windows chỉ có `granted` hay `denied`.
  - `request_mic_permission` (macOS; Windows trả trạng thái hiện có).
  - `open_mic_settings`.
- **Trạng thái phiên** (`AppStatus`): thêm `micIssue: null | "permission" | "unavailable" | "suspected"` (mục 7).
- **Log và báo cáo lỗi:** ghi chế độ và loại micro (tích hợp, USB, Bluetooth, khác), **không ghi tên micro**, vì tên có
  thể chứa tên người ("AirPods của …").

## 5. Thu âm thanh

### 5.1. Nguồn micro trên macOS: `MacInputSource`

- Cài `trait AudioSource`. Chạy IOProc (`AudioDeviceCreateIOProcIDWithBlock`) thẳng trên thiết bị vào. Đây là cùng cơ chế
  đang dùng để đọc aggregate device của tap, nhưng không có tap. Code tap hiện có không bị sửa.
- Thiết bị: `kAudioHardwarePropertyDefaultInputDevice`, hoặc thiết bị có UID bằng `micDevice`. Không tìm thấy micro đã
  chọn thì báo `micUnavailable`, không tự rơi về micro mặc định.
- Bố cục buffer đọc từ cấu hình luồng vào của thiết bị (dùng lại `input_layout`). `MonoResampler` gộp nhiều kênh về mono.
- **Phương án dự phòng:** nếu spike thấy micro và tap lệch đồng hồ đến mức `Mixer2` phải phát riêng phần dư thường xuyên
  (mục 6.4), thì thêm micro làm sub-device của chính aggregate device của tap, để aggregate bù lệch.
- Thêm `list_capture_devices()` (thiết bị có luồng vào: UID, tên, loại kết nối) và `default_input_signature()`
  (`<id>@<Hz>` của micro mặc định, giống `default_output_signature`).

### 5.2. Nguồn micro trên Windows: `InputSource`

- Cài `trait AudioSource`. WASAPI shared mode trên endpoint `eCapture`, không bật `AUDCLNT_STREAMFLAGS_LOOPBACK`. Dùng
  lại khung đọc của `LoopbackSource` (đọc theo timer).
- Micro mặc định là endpoint `eCapture` mặc định của vai trò Console (thiết bị mà Settings › Sound › Input đang chọn).
  Hoặc dùng endpoint có ID bằng `micDevice`.
- Thêm `list_capture_devices()`, và đưa ID micro mặc định vào `default_input_signature()`.
- Thiết bị đang bị app khác giữ ở exclusive mode (`AUDCLNT_E_DEVICE_IN_USE`) thì báo `micUnavailable`.

### 5.3. `Preprocessor` có gắn vai

- `Preprocessor::new` nhận các đầu vào kèm vai `Playback` hay `Mic`, tối đa ba đầu vào (Windows tự động: Console,
  Communications, Mic). Phải có ít nhất một đầu vào.
- Các đầu vào `Playback` trộn với nhau bằng `Mixer2` như bây giờ.
- Đầu vào `Mic` qua chuỗi chống tiếng ồn (mục 5.7), cho ra **hai bản thẳng hàng từng mẫu**: bản cho whisper (chỉ qua
  lọc 80 Hz) và bản cho VAD (thêm lọc ồn).
- Chế độ `mic`: hai bản đi thẳng ra.
- Chế độ `both`: luồng Playback (đã trộn) và luồng Mic đi vào `DuckingMixer` (mục 5.4). Cổng nhân cùng một hệ số cho cả
  hai bản micro. Kết quả là hai bản trộn: Playback + micro cho whisper, và Playback + micro cho VAD.
- `Preprocessor::drain` ghi bản cho whisper vào `out` như hiện nay, và ghi bản cho VAD vào một vector thứ hai. Khi không
  có micro, hoặc tắt "Lọc tiếng ồn micro", hai bản giống hệt nhau.

### 5.4. `DuckingMixer` và `MicGate`

- **`DuckingMixer`:** ghép cặp mẫu Playback với mẫu Mic và bù lệch giống `Mixer2` (phần dư quá 100 ms phát riêng). Mẫu
  Mic nhân với hệ số của `MicGate` trước khi cộng. Kết quả kẹp trong [−1, 1].
- **`MicGate`** (hàm thuần, không cấp phát trong vòng xử lý):
  - Đo RMS của luồng Playback theo khung 10 ms (160 mẫu).
  - RMS từ ngưỡng trở lên: hạ micro ngay. Hệ số giảm tức thì xuống mức hạ.
  - RMS dưới ngưỡng: giữ mức hạ thêm một khoảng **giữ**, rồi mở dần về 1 trong 50 ms.
  - Tham số ban đầu: ngưỡng −45 dBFS, mức hạ −20 dB (hệ số 0,1), giữ 300 ms. Spike chọn giá trị chốt (mục 6.3).
- **Vì sao không cần đọc trước:** tiếng vọng luôn tới micro sau tín hiệu số, trễ bằng độ trễ phát ra loa cộng đường
  truyền trong không khí. Vì vậy cổng đóng kịp.
- **Giới hạn đã biết:** cách ghép cặp có thể lệch tới 100 ms giữa hai luồng. Loa Bluetooth trễ thêm 150–300 ms. Thời gian
  giữ phải phủ cả hai cộng đuôi vang của phòng; spike đo độ trễ vọng thật để chọn.

### 5.5. Chỗ nối khử vọng

`DuckingMixer` nhận một bước xử lý micro tùy chọn, `trait EchoCanceller { fn process(&mut self, reference: &[f32], mic:
&mut [f32]); }`, chạy trên luồng Mic trước cổng, với Playback làm tham chiếu. Bản đầu không có bước này. Nếu spike chốt
dùng AEC3 (mục 6.3), chỉ cần cài trait bằng `sonora`; phần còn lại không đổi.

### 5.6. `capture_loop`

- **`open_sources`** dựng nguồn theo `captureMode`:
  - `playback`: như hiện nay.
  - `mic`: chỉ nguồn micro.
  - `both`: nguồn Playback như hiện nay, cộng nguồn micro.
- **Bộ canh tách theo nguồn.** Không sửa thì hỏng, vì micro luôn có khung và luôn có tiếng ồn nền:
  - `Watch`/`StallWatch` (canh tap chết, macOS) chỉ đếm khung của các nguồn Playback.
  - `ZeroWatch` chạy riêng cho từng loại nguồn trên mẫu chưa trộn. Bản cho Playback giữ luật cũ (nghi thiếu quyền "Ghi
    âm thanh hệ thống"). Bản cho Mic dùng cùng luật: toàn số 0 tuyệt đối suốt 3 giây mà từ đầu phiên chưa có mẫu nào
    khác 0 thì báo micro không có tín hiệu, nhưng không hỏi "có app đang phát" (micro đang chạy luôn có tiếng ồn nền).
    Nguyên nhân có thể là thiếu quyền hoặc micro đang tắt tiếng bằng phím cứng, nên ghi chú nêu cả hai.
- **Mở lại nguồn:** khi `default_input_signature()` đổi (chỉ khi dùng micro mặc định), hoặc khi nguồn micro `failed()`.
- **Micro lỗi mà Playback vẫn chạy (chế độ `both`):** không dừng phiên. Chạy tiếp với Playback, đặt `micIssue`, thử mở
  lại micro mỗi 2 giây; mở được thì xóa `micIssue`. Chế độ `mic`: áp `FailurePolicy` như nguồn đơn hiện nay.
- **Log số liệu** mỗi 60 giây (như `STATS_EVERY`): thêm số khung của Mic, số lần phát riêng phần dư, tỉ lệ thời gian cổng
  đang hạ.

### 5.7. Chống tiếng ồn ở micro

**Vì sao làm theo cách này.**
- Chữ ảo chủ yếu sinh ra khi một đoạn chỉ có tiếng ồn (tiếng gõ phím, tiếng bút) lọt qua VAD rồi tới whisper: whisper cố
  đoán chữ và bịa ra câu quen thuộc. Vì vậy chặn chính ở VAD và sau nhận dạng.
- Không làm sạch âm thanh đưa cho whisper: nhiều nghiên cứu thấy lọc ồn làm Whisper nhận sai nhiều hơn, vì Whisper vốn
  học trên âm thanh có ồn (mục Tham khảo). Spike vẫn đo phương án whisper nghe bản đã lọc (mục 6.3).

**Năm lớp, chỉ áp cho luồng micro** (luồng Playback không đổi):

1. **Lọc thông cao 80 Hz, luôn chạy** (bậc 2, Butterworth). Cắt tiếng thình thịch khi gõ bàn, rung bàn, chạm laptop.
   Giọng nói hầu như không có năng lượng dưới 80 Hz. Áp cho cả hai bản.
2. **Lọc ồn bằng mạng nơ-ron, chỉ cho bản VAD.** Spike chọn một trong hai:
   - RNNoise qua `nnnoiseless` (0.5.2, Rust thuần, BSD-3-Clause): rất nhẹ, xử lý tốt tiếng ồn đều; với tiếng lách cách
     ngắn thì kém hơn.
   - DeepFilterNet3 (MIT/Apache-2.0): mạnh hơn với tiếng gõ phím, nặng hơn. Bản phát hành cuối v0.5.6 (2023); bản trên
     crates.io (`deep_filter` 0.2.5, 2022) đã cũ. Chỉ chọn khi RNNoise không đạt mức, và phải qua quy tắc §6.12.
   - Cả hai chạy ở 48 kHz (khung 10 ms). Micro không phải 48 kHz thì resample lên 48 kHz trước bước này.
   - Bản cho whisper được trễ đúng bằng độ trễ của bộ lọc, để hai bản thẳng hàng từng mẫu.
3. **Tách bản cho VAD và bản cho whisper** (mục 5.3, 5.8). Tiếng gõ phím bị lọc khỏi bản VAD nên không mở được đoạn.
   Đoạn đã mở vẫn lấy âm thanh từ bản cho whisper.
4. **VAD chặt hơn ở chế độ có micro** (`mic` và `both`): ngưỡng xác suất tiếng nói (`threshold`, hiện 0,5) và độ dài
   tiếng nói ngắn nhất (`min_speech_ms`, hiện 250 ms) có bộ giá trị riêng, do spike chọn. Ở chế độ `both`, luồng đã trộn
   nên bộ giá trị này áp cho cả tiếng online; tiếng số của cuộc họp có xác suất VAD cao nên ít bị ảnh hưởng (spike kiểm).
5. **Luật lọc câu ngắn sau nhận dạng, ở chế độ có micro** (`pipeline::filter`, thêm `Verdict::ShortUnsure`). Câu ngắn
   (tối đa 2 từ, hoặc tối đa 4 ký tự với zh/ja) bị bỏ khi VAD không chắc: `vad_mean_prob` dưới ngưỡng, hoặc `speech_ms`
   dưới ngưỡng. Ngưỡng do spike chọn. Luật `Filler` hiện có chỉ xét một danh sách câu đệm; luật mới xét mọi câu ngắn,
   chỉ ở chế độ có micro.

Công tắc "Lọc tiếng ồn micro" tắt thì bỏ lớp 2, 4, 5 (lớp 3 khi đó không còn tác dụng vì hai bản giống nhau).

### 5.8. Ba chỗ sửa trong pipeline

- **`FrameSource`:** thêm `read_with_vad(&mut self, out, vad_out, timeout)`. Bản mặc định gọi `read` rồi chép `out` sang
  `vad_out`, nên `SampleSource` và các nguồn trong test không đổi. Luồng VAD của engine tính `vad.prob` trên khung của
  `vad_out`, còn `Segmenter::push`, mức âm lượng, `SilenceMonitor` vẫn dùng khung của `out`.
- **`EngineConfig`:** thêm bộ tham số VAD dùng khi có micro (lớp 4), app chọn theo `captureMode` lúc bắt đầu phiên.
- **`FilterConfig` và `verdict`:** thêm luật `ShortUnsure` (lớp 5), bật theo cờ trong `EngineConfig`.

### 5.9. Không đổi

- Phần còn lại của pipeline (ghép câu, nhận dạng, dịch, phụ đề, đếm phút).
- Chỉ báo "không có âm thanh" vẫn theo ngưỡng RMS hiện có (`SilenceMonitor`). Ở chế độ có micro, tiếng ồn nền có thể làm
  chỉ báo này ít hiện hơn. Như vậy là đúng: micro vẫn đang nhận tiếng.
- `ClockFiller`, `GapFiller`, bước "Nghe thử" lần đầu (luôn dùng âm thanh máy).

## 6. Spike

Làm trước khi viết chế độ `both`. Kết quả lưu ở `bench/2026-10-24-nguon-micro/` (README, `results/*.md`, số liệu JSON).
Bản thu WAV chứa giọng người thật **không commit**. Chỉ commit bản thu dựng từ clip FLEURS.

### 6.1. S-M1: công cụ thu

- Thêm `--mic [<id>]` vào `crates/audio-capture/src/bin/capture.rs`. Công cụ ghi hai file WAV 16 kHz mono chưa trộn
  (`*-playback.wav`, `*-mic.wav`) cùng mốc thời gian, và ghi số liệu lệch đồng hồ.
- macOS: một script phát hai track bằng hai tiến trình `afplay` (track "người online", track "người trong phòng"), rồi
  chạy công cụ với `--pid <pid của afplay phát track online>`. Tap chỉ thu tiến trình đó, nên tiếng "trong phòng" chỉ vào
  micro qua loa, đúng như giọng người trong phòng. Khi cần đối chứng bằng tai nghe, track "trong phòng" phát từ điện
  thoại.
- Thêm `--cues <file JSON>`: công cụ in lời nhắc đúng giờ (ví dụ "Gõ phím laptop 2 phút") và ghi giờ thật vào
  `meta.json`, để chấm chữ ảo theo từng loại tiếng ồn.
- Clip lấy từ FLEURS (có bản chép chuẩn). Script dựng track ghi lịch của từng clip (nguồn, giờ bắt đầu, giờ kết thúc)
  ra `schedule.json`. Lúc chấm, mỗi track được căn với bản thu bằng tương quan đường bao, rồi chấm riêng từng nguồn.
- Câu trả lời rất ngắn (FLEURS không có): khoảng 40 câu một–hai từ ("OK", "Yes", "Vâng", "Đúng rồi", "好的", "はい",
  "네"…), dựng bằng lệnh `say` của macOS với giọng có sẵn của từng tiếng, kèm bản chép chuẩn.

### 6.2. S-M2: các cảnh thu

Máy M4 Pro. Mỗi cảnh khoảng 3–5 phút, các tiếng en, zh, ja, ko, vi.

| # | Cảnh | Để đo |
|---|---|---|
| 1 | Loa laptop, hai bên nói lần lượt | Tiếng vọng hại giọng online tới đâu; nhường lời có giữ đủ câu trong phòng không |
| 2 | Loa laptop, khoảng 30% thời gian nói chồng | Nhường lời mất bao nhiêu câu so với AEC3 |
| 3 | Tai nghe có dây | Đối chứng không có tiếng vọng |
| 4 | Chỉ micro: điện thoại phát ở 1 m và 3 m; micro máy, micro AirPods | Mốc WER/CER của micro (A4-mic) |
| 5 | Một buổi thật: người đọc trong phòng, một cuộc Zoom hay Meet qua loa | Kiểm lại trong điều kiện thật (chủ dự án ngồi máy) |
| 6 | Không ai nói, mỗi loại tiếng 2 phút: gõ phím laptop, bàn phím cơ, bấm bút, viết bút trên giấy, gõ ngón tay xuống bàn, lật giấy, đặt cốc, kéo ghế; thêm 2 phút quạt hay điều hòa | Đếm chữ ảo theo từng loại tiếng |
| 7 | Có người nói (clip FLEURS và câu ngắn ở mục 6.1, điện thoại ở 1 m) trong lúc có tiếng gõ phím, bấm bút, gõ bàn | Tiếng ồn hại nhận dạng tới đâu; câu ngắn bị bỏ sót bao nhiêu |

Cảnh 6 và 7 cần chủ dự án tạo tiếng ồn bằng tay (gõ phím, bút, gõ bàn). Tôi ghi lịch từng loại tiếng để chấm.

Trên máy Windows i5 của chủ dự án: cảnh 1, 4, 6, 7. Tôi soạn sẵn lệnh, chủ dự án chạy. Trên Windows, loopback thu cả tiếng
của chính công cụ, nên clip "trong phòng" phải phát ra một thiết bị phát khác, hoặc từ điện thoại.

### 6.3. S-M3: so sánh offline, `latency-bench mix-eval`

- Đầu vào: hai file WAV và lịch phát.
- Dựng luồng trộn theo ba cách:
  - **A:** trộn thẳng.
  - **B:** nhường lời. Dò lưới ngưỡng {−55, −45, −35} dBFS, mức hạ {−12, −20, −30 dB, tắt hẳn}, thời gian giữ {150,
    300, 500, 800} ms.
  - **C:** AEC3 của `sonora` trên micro, rồi trộn.
- Chạy `pipeline::Engine` thật (như lệnh `session`). Chấm WER/CER riêng cho câu online và câu trong phòng theo lịch phát.
  Đo thêm độ trễ A2 và CPU.
- **Mặc định chốt là B,** với bộ tham số tốt nhất trên cảnh 1 và 2 cộng lại. Nâng lên C chỉ khi đạt đủ bốn điều kiện:
  - Ở cảnh 2, WER/CER câu trong phòng của C tốt hơn B ít nhất 20% (tương đối).
  - Ở các cảnh còn lại, C không kém B quá 2% (tương đối).
  - AEC3 tốn không quá 5% một nhân CPU trên máy i5.
  - Chạy liền 30 phút không mất hội tụ (WER nửa sau không tệ hơn nửa đầu quá 5%).
  Nâng lên C thì phải thêm `sonora` theo quy tắc §6.12: bản ổn định mới nhất, kiểm MSRV và xung đột.
- **Mức đạt của B** (cũng là A-trộn ở mục 11):
  - Ở cảnh 1, WER/CER câu online không tệ hơn cảnh 3 quá 10% (tương đối).
  - Câu trong phòng giữ được (không bị bỏ hay cắt cụt) ít nhất 95% so với cảnh 4 ở 1 m.
- **Độ nhạy micro:** nếu cảnh 4 ở 3 m bỏ sót trên 10% câu so với 1 m, cân nhắc AGC (mục 2) bằng một quyết định riêng.

**Chống tiếng ồn (mục 5.7), trên cảnh 4, 6, 7:**
- Các phương án:
  - Lớp 2: không lọc ồn, RNNoise, DeepFilterNet3.
  - Lớp 3: VAD nghe bản đã lọc còn whisper nghe bản chỉ lọc 80 Hz, hoặc cả hai cùng nghe bản đã lọc.
  - Lớp 4: dò lưới `threshold` {0,5; 0,6; 0,7} và `min_speech_ms` {250, 400, 600}.
  - Lớp 5: dò ngưỡng `vad_mean_prob` và `speech_ms` của luật `ShortUnsure`.
- **Mức đạt** (theo ưu tiên "không có chữ ảo" ở mục 1):
  - **Chữ ảo:** cảnh 6 không quá 1 câu ảo mỗi 10 phút, tính trên cả cảnh. Ghi riêng số câu ảo của từng loại tiếng.
  - **Câu ngắn:** cảnh 7 bỏ sót không quá 20% câu một–hai từ.
  - **Câu thường có ồn:** WER/CER câu FLEURS ở cảnh 7 không tệ hơn cảnh 4 (1 m, không ồn) quá 15% (tương đối).
  - **Không hại khi phòng yên tĩnh:** cảnh 4 với năm lớp bật, WER/CER không tệ hơn khi tắt quá 5% (tương đối).
  - **Chế độ `both`:** bộ VAD chặt hơn không làm WER câu online ở cảnh 1 tệ thêm quá 5% (tương đối).
  - **CPU:** lớp 2 không quá 10% một nhân trên máy i5.
- **Luật chốt:** chọn tổ hợp nhẹ nhất đạt đủ mức, theo thứ tự: không lọc ồn, rồi RNNoise, rồi DeepFilterNet3. Trong cùng
  một bộ lọc thì chọn tham số lớp 4 và 5 lỏng nhất mà vẫn đạt mức chữ ảo. Whisper chỉ nghe bản đã lọc khi cách đó cho
  WER tốt hơn ở cảnh 7 mà không tệ hơn ở cảnh 4.
- **Không tổ hợp nào đạt mức chữ ảo:** dừng lại, báo chủ dự án kèm bảng số liệu theo từng loại tiếng, trước khi làm tiếp.
- Nếu không bộ tham số nào của B đạt mức trên, dừng lại và báo chủ dự án trước khi làm tiếp chế độ `both`.

### 6.4. S-M4: kiểm hành vi (làm đầu tiên)

- **macOS, bản ký ad-hoc có hardened runtime và entitlement hiện có:**
  - Có hiện hộp thoại xin quyền micro không?
  - Bị từ chối thì Core Audio trả lỗi hay trả số 0?
  - Ký lại (giả lập cập nhật) thì có bị hỏi lại không?
  - `objc2-av-foundation` có cùng dòng `objc2` 0.6 / `objc2-foundation` 0.3 không? Không cùng thì gọi `AVCaptureDevice`
    qua `msg_send!`.
- **Windows:**
  - Tắt công tắc quyền micro cho app desktop thì WASAPI trả mã gì (`Activate`, `Initialize`), hay trả số 0?
  - Khóa `HKCU\…\CapabilityAccessManager\ConsentStore\microphone` (và `NonPackaged`) có phản ánh đúng công tắc không?
- **Dùng micro chung với app họp:** Zoom, Teams, Meet (Chrome) đang dùng micro thì app vẫn đọc được. Phía người nghe trong
  cuộc họp không bị ảnh hưởng.
- **AirPods:** mở micro làm tai nghe chuyển chế độ ra sao, tần số mẫu thực tế, `MonoResampler` xử lý đúng.
- **Lệch đồng hồ micro và Playback trong 30 phút:** số lần `Mixer2` phát riêng phần dư, và lượng phát riêng. Đây là căn
  cứ cho phương án dự phòng ở mục 5.1.
- **macOS 14.x:** không có máy để thử. Theo dõi báo cáo lỗi sau phát hành, như các bản trước.

## 7. Lỗi và chỉ báo

Mã lỗi mới trong `src-tauri/src/errors.rs`, chuỗi đủ năm ngôn ngữ:

| Tình huống | Chế độ `mic` | Chế độ `both` |
|---|---|---|
| Thiếu quyền micro (`micPermission`) | Không bắt đầu phiên; nút mở trang cấp quyền | Chạy với âm thanh máy; `micIssue = "permission"`, ghi chú kèm nút |
| Không có micro, micro đã chọn không còn, micro bị rút, thiết bị bị giữ độc quyền (`micUnavailable`) | `FailurePolicy` như nguồn đơn; báo lỗi nếu không mở lại được | Chạy với âm thanh máy; `micIssue = "unavailable"`; thử lại mỗi 2 giây |
| Micro trả số 0 tuyệt đối 3 giây từ đầu phiên (mục 5.6) | `micIssue = "suspected"`, phiên chạy tiếp; ghi chú "Micro không có tín hiệu: kiểm quyền micro hoặc phím tắt tiếng của micro", kèm nút mở trang cấp quyền | Như cột bên trái |

Ghi chú hiện ở màn hình chính và trên thanh phụ đề, như `waitingForApp`. Lỗi của nguồn Playback giữ nguyên như hiện nay.

## 8. Quyền riêng tư và pháp lý

- **Chính sách quyền riêng tư 1.7 → 1.8** (vi, en):
  - Bảng dữ liệu thêm dòng "Âm thanh từ micro (khi bạn chọn nguồn có micro)": chỉ nằm trong RAM trong lúc dịch, không
    ghi xuống đĩa, không gửi qua mạng.
  - Tóm tắt đổi "Âm thanh cuộc họp" thành "Âm thanh (âm thanh máy và, nếu bạn chọn, micro)".
  - Nói rõ app vẫn thu micro dù người dùng đã tắt mic trong app họp.
- **EULA 1.4 → 1.5** (vi, en): mục về trách nhiệm (hiện là "Ứng dụng thu âm thanh đang phát trên máy bạn…") thành "Ứng
  dụng thu âm thanh đang phát trên máy bạn và, khi bạn chọn, âm thanh từ micro, có thể gồm giọng nói của người khác, kể
  cả người ở gần bạn." Phần trách nhiệm xin phép giữ nguyên.
- Ngày hiệu lực là ngày phát hành bản app có tính năng này. Đổi phiên bản thì người dùng đồng ý lại theo luồng hiện có
  (spec 2026-10-06 legal-in-app).
- A7: không thêm kết nối mạng nào. Phải kiểm lại bằng proxy với chế độ `both`.

## 9. Website

- Thêm phần "Dịch cả giọng trong phòng" ở trang chủ và trang tính năng. Sửa các câu "dịch mọi âm thanh máy đang phát" ở
  những chỗ liên quan (FAQ, so sánh offline/cloud, hướng dẫn bắt đầu nhanh). Thêm mục quyền micro vào hướng dẫn quyền âm
  thanh và hướng dẫn xử lý sự cố. Đủ năm ngôn ngữ. Trang pháp lý chỉ vi/en.
- Chỉ nói điều có thật:
  - Ghi giới hạn khi người trong phòng nói chen, và khuyên dùng tai nghe.
  - Được nói app bỏ qua tiếng gõ phím, tiếng bút, tiếng gõ bàn. Chỉ nêu số liệu nếu kèm điều kiện đo (ví dụ "trên bản
    thu thử X phút, Y câu ảo"). Nói rõ câu rất ngắn có thể bị bỏ qua khi phòng ồn.
  - Số đo nào cũng kèm điều kiện đo.
  - Không nêu tên thư viện, không nói "AEC3" hay "WebRTC" (`website/README.md`, có test chặn).
- Chỉ deploy sau khi bản app có tính năng này đã phát hành.

## 10. Kiểm thử

- **`audio-capture`:**
  - `MicGate`: đóng ngay khi Playback vượt ngưỡng, giữ đúng thời gian, mở dần, không đóng vì tiếng dưới ngưỡng.
  - `DuckingMixer`: ghép cặp, phát riêng phần dư, áp hệ số đúng mẫu, kẹp biên.
  - `Preprocessor`: một, hai, ba đầu vào có vai; từ chối đầu vào rỗng; hai bản (whisper, VAD) cùng độ dài và thẳng
    hàng (xung đơn vị ở micro hiện đúng vị trí ở cả hai bản); không micro hay tắt lọc ồn thì hai bản giống hệt nhau.
  - Lọc 80 Hz: tín hiệu 40 Hz giảm mạnh, 300 Hz gần như giữ nguyên.
  - Lớp 2 (bộ đã chọn): một chuỗi tiếng click tổng hợp giảm năng lượng rõ ở bản VAD; bản whisper không đổi.
- **`capture.rs`:**
  - `Watch` chỉ đếm khung Playback: micro luôn có khung mà tap đứng yên vẫn bị coi là chết.
  - `ZeroWatch` cho Mic.
  - Luật mở lại khi micro mặc định đổi.
  - Micro lỗi ở chế độ `both` không dừng phiên và đặt `micIssue`.
- **`pipeline`:**
  - `FrameSource::read_with_vad` mặc định chép `out` sang `vad_out`.
  - Engine với nguồn giả có bản VAD toàn số 0 thì không mở đoạn nào, dù bản whisper có tiếng.
  - Bộ tham số VAD khi có micro được dùng đúng theo chế độ.
  - Luật `ShortUnsure`: câu ngắn mà VAD không chắc thì bị bỏ; câu ngắn mà VAD chắc thì giữ; câu dài thì giữ; tắt cờ thì
    không bỏ câu nào.
- **Settings:** settings cũ không có `captureMode`, `micNoiseFilter` thì đọc ra `playback`, `true`; `micDevice` rỗng hay
  quá dài bị từ chối.
- **Giao diện (Vitest, ảnh qua `scripts/ui-preview`):** bộ chọn ba chế độ hiện và ẩn đúng hai bộ chọn con; nhãn nguồn ở
  màn hình chính; ghi chú `micIssue` trên thanh phụ đề; `check-i18n` năm ngôn ngữ.
- **Tích hợp:** `latency-bench session` trên bản thu cảnh 1 của spike (đã trộn theo B): A2 p50 không tăng quá 100 ms so
  với cùng bản thu chỉ lấy Playback.
- **Bộ test hiện có** (Rust, JS, website, check-i18n) phải xanh. Website thêm câu chữ mới thì test chặn công nghệ lõi
  phải qua.

## 11. Nghiệm thu (thêm vào §3.3 của spec chính)

| # | Tiêu chí |
|---|---|
| A1-mic | **Tương thích:** chế độ `mic` với micro máy, micro USB (nếu có), micro AirPods. Chế độ `both` với Zoom, Meet (Chrome), Teams, nghe qua loa và qua tai nghe. Trên cả hai hệ điều hành. |
| A4-mic | **Nhận dạng qua micro:** mốc WER/CER lấy từ cảnh 4 của spike (1 m và 3 m). Chống thụt lùi 10% (tương đối), như A4. |
| A-trộn | **Tiếng vọng:** đạt mức của B (mục 6.3) với tham số đã chốt. |
| A-ảo | **Chữ ảo:** cảnh 6 (gõ phím, bút, gõ bàn, lật giấy, đặt cốc, kéo ghế, quạt) không quá 1 câu ảo mỗi 10 phút, với "Lọc tiếng ồn micro" bật. |
| A-ồn | **Câu thật khi có ồn:** cảnh 7 bỏ sót không quá 20% câu một–hai từ; WER/CER câu thường không tệ hơn khi không ồn quá 15% (tương đối). Cảnh 4 với lọc ồn bật không tệ hơn khi tắt quá 5%. |
| A2 | Không tăng quá 100 ms (p50) ở chế độ `both` so với chế độ `playback` trên cùng bản thu. |
| A7 | Kiểm lại bằng proxy ở chế độ `both`: không có kết nối mới. |

## 12. Sửa spec chính

- **D1:** thêm "và, nếu người dùng chọn, tiếng từ micro (họp tại chỗ, họp lai)".
- **D9:** ghi rõ micro cũng dịch một chiều, sang ngôn ngữ của người dùng.
- **§3.1:** thêm F12 "Nguồn micro" (ba chế độ, mọi gói), tham chiếu spec này.
- **§3.2:** bỏ dòng "Thu âm từ micro". Giữ dòng micro ảo.
- **§3.3:** thêm các tiêu chí ở mục 11.
- **§4.3:** màn hình chính (nguồn âm thanh) và nhóm Cài đặt "Âm thanh".
- **§6.1:** mục mới "Micro". **§6.2:** trộn có nhường lời, chống tiếng ồn ở micro.
- **§6.3:** bộ tham số VAD khi có micro; VAD nghe bản đã lọc ồn. **§6.4:** luật `ShortUnsure`.
- **§9:** ba tình huống ở mục 7. **§10.1:** âm thanh micro chỉ nằm trong RAM.

## 13. Kế hoạch và thứ tự

1. **Kế hoạch 01, spike:** S-M4 trước, rồi S-M1 → S-M3. Kết thúc bằng bảng kết quả và tham số chốt. Chủ dự án duyệt
   trước khi sang kế hoạch 03.
2. **Kế hoạch 02, chế độ `mic`:** nguồn micro hai nền tảng, settings, IPC, quyền, giao diện, i18n, chống tiếng ồn (mục
   5.7, 5.8). Phần nguồn, quyền và giao diện chỉ phụ thuộc S-M4, làm song song được với S-M2 và S-M3. Phần chống tiếng
   ồn làm sau khi S-M3 chốt bộ lọc và tham số.
3. **Kế hoạch 03, chế độ `both`:** `Preprocessor` có vai, `DuckingMixer`, bộ canh tách theo nguồn, lỗi một phần. Phụ
   thuộc kết quả S-M3.
4. **Kế hoạch 04, phát hành:** pháp lý 1.8/1.5, website, sửa spec chính, nghiệm thu mục 11. Phát hành theo
   `docs/release/phat-hanh.md`.

## 14. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| macOS hỏi lại quyền micro sau mỗi bản cập nhật (ký ad-hoc) | Chỉ hỏi người dùng chọn chế độ có micro (mục 3.4); hết khi có Developer ID |
| Tham số nhường lời không hợp mọi phòng (loa Bluetooth trễ lớn, phòng vang) | Spike đo độ trễ vọng thật; ghi chú khuyên đeo tai nghe; chỗ nối AEC3 để nâng cấp |
| Tiếng gõ phím, tiếng bút, tiếng gõ bàn sinh chữ ảo | Năm lớp ở mục 5.7; cảnh 6 đo theo từng loại tiếng; tiêu chí A-ảo |
| Lọc ồn làm whisper nhận sai | Whisper nghe bản chỉ lọc 80 Hz; lọc ồn chỉ cho VAD trừ khi spike cho thấy tốt hơn; tiêu chí A-ồn |
| Lọc chặt làm mất câu thật rất ngắn | Ưu tiên đã chốt (mục 1); mức bỏ sót tối đa 20% (A-ồn); công tắc tắt lọc ồn |
| DeepFilterNet ít được bảo trì (bản cuối 2023) | Chỉ dùng khi RNNoise không đạt; qua quy tắc §6.12; nếu phải lấy từ git thay vì crates.io thì hỏi chủ dự án |
| Giọng ở xa quá nhỏ, VAD bỏ sót | Cảnh 4 ở 3 m; AGC là quyết định riêng nếu cần |
| Micro bị app họp giữ độc quyền hay bị chặn quyền trên Windows | `micUnavailable`/`micPermission` với hướng dẫn; chế độ `both` vẫn chạy với âm thanh máy |
| Người dùng tưởng tắt mic trong Zoom là app ngừng thu | Chính sách quyền riêng tư 1.8, hướng dẫn trên website; chỉ báo micro của hệ điều hành |

## 15. Quy tắc làm việc

- Làm trên nhánh `nguon-micro` (worktree riêng). Mọi lệnh gắn `cd <đường dẫn tuyệt đối của worktree> &&`.
- **Không merge, push, deploy hay đẩy tag** khi chủ dự án chưa cho phép.
- Spike S-M1 và S-M2 phát tiếng ra loa và mở micro trên máy của chủ dự án: hỏi trước mỗi lần chạy.
- Thư viện mới (`objc2-av-foundation`, `nnnoiseless`, `sonora` nếu chốt C, DeepFilterNet nếu cần) theo §6.12: bản ổn
  định mới nhất, kiểm tương thích, build lại toàn bộ và chạy test. Spike thử thư viện trong `crates/latency-bench` trước,
  chỉ thêm vào `audio-capture` khi đã chốt.

## 16. Kết quả spike và quyết định (kế hoạch 01, 2026-10-24)

Số liệu: `bench/2026-10-24-nguon-micro/results/ket-qua.md`. Chủ dự án chốt ngày 2026-10-24. Mục này **ghi đè** các mục
trước ở những điểm sau.

- **Tiếng vọng (§5.4):** dùng B với ngưỡng −55 dBFS, mức hạ −30 dB, giữ 300 ms. Không dùng AEC3 (§5.5 chỉ còn là chỗ nối
  để sau này).
- **Chống tiếng ồn (§5.7, §5.8):**
  - Lớp 1: lọc 80 Hz, giữ nguyên, chạy **trước** khuếch đại.
  - **Lớp mới, sau lớp 1: khuếch đại micro +20 dB.** Áp cho cả hai bản (whisper và VAD), ở cả chế độ `mic` lẫn `both`.
    - Bản cho whisper: qua **bộ giới hạn mức** (khuếch đại tới +20 dB, đỉnh không vượt −1 dBFS, không méo).
    - Bản cho VAD: chặn mềm `tanh`.
    - Sửa sau thử tay 2026-10-24 (`results/thu-tay-mac.md`, `results/gioi-han-muc.md`): ban đầu cả hai bản dùng `tanh` và lọc
      80 Hz chạy sau. Một tiếng ù trầm −8 dBFS làm `tanh` bão hòa và nghiền giọng nói của bản cho whisper. Cách mới bằng
      hoặc tốt hơn cách cũ ở mọi cảnh của spike.
  - Lớp 2: **RNNoise** (`nnnoiseless`), chỉ cho bản VAD. DeepFilterNet bị loại.
  - Lớp 3: whisper nghe bản chỉ lọc 80 Hz và đã khuếch đại, không nghe bản đã lọc ồn.
  - **Lớp 4 (VAD khi có micro):**
    - chế độ `mic`: `threshold` 0,5, `min_speech_ms` 400, **`end_silence_ms` 500**; tắt "Lọc tiếng ồn micro" thì
      `min_speech_ms` 250 (thử tay: "OK", "Vâng" chỉ dài khoảng 0,3 giây nên bị ngưỡng 400 bỏ, cả trong phòng yên tĩnh);
    - chế độ `both`: `threshold` 0,5, `min_speech_ms` 600, **`end_silence_ms` 500**.
    - Ở chế độ có micro, giá trị này thay cho `vadEndSilenceMs` của người dùng. Phụ đề hiện chậm hơn khoảng 0,45 s.
    - **Mục 18 ghi đè `end_silence_ms` 500 ở trên:** mặc định thành 100 ms (khóa `micEndSilenceMs`, chỉnh được 50–800 ms).
  - **Lớp 5 (`ShortUnsure`): bỏ.** Không giảm thêm chữ ảo mà làm mất câu ngắn. Code trong `pipeline::filter` (mặc định
    tắt) bị gỡ ở kế hoạch 02.
  - **Thêm:** luật `Hallucination` bắt cả câu **chứa** cụm quảng cáo kênh rõ ràng (ví dụ "subscribe cho kênh"). Câu "Hãy
    subscribe cho kênh Ghiền Mì Gõ…" đã lọt qua hai lần khi khuếch đại.
  - Công tắc "Lọc tiếng ồn micro" (§3.2) bật hay tắt RNNoise cho VAD, và đổi `min_speech_ms` (400 khi bật, 250 khi tắt).
    Khuếch đại và các tham số VAD khác vẫn áp khi tắt. Tắt chỉ hợp phòng yên tĩnh: phòng ồn (cảnh 7) gần như không còn câu
    nào.
- **AGC (§2):** đã đo, kém khuếch đại cố định. Không làm.
- **Quyền micro trên macOS (§3.4, §7):**
  - Bị từ chối thì Core Audio trả 100% số 0, không báo lỗi. Đọc trạng thái bằng `AVCaptureDevice`.
  - Ký lại ad-hoc làm quyền về `Undetermined`.
  - Gọi `request` trước `start`: nếu để Core Audio tự hỏi thì `start` chặn suốt lúc hộp thoại mở.
- **Phương án dự phòng §5.1 (gắn micro vào aggregate của tap): không cần.** Lệch đồng hồ của micro và loa tích hợp khoảng
  0,1 ppm.
- **Mức đạt (§6.3, §11): hạ về mức đo được, dùng làm mốc chống thụt lùi.** Với cấu hình trên:
  - **A-trộn:** cảnh 1 (nói lần lượt), lỗi online ≤ 9,8% × 1,10, lỗi trong phòng ≤ 5,2% × 1,10. Đo lại ở kế hoạch 03 với
    chuỗi micro mới (`results/tron-moi.md`; cách cũ 6,1% / 3,7%). Lấy số xấu nhất trong dải đo, vì cảnh 1 chỉ khoảng 45
    đoạn: chỉ lệch khuếch đại 1 dB, lỗi online của cách cũ đã chạy từ 5,3% đến 9,7%. Chế độ trộn: VAD 0,5 / 600 / 500 (400
    không tốt hơn).
  - **A-ảo:** cảnh 6, không quá 1 câu mỗi 10 phút. Giữ nguyên.
  - **A4-mic (thay A-ồn), gói Chuẩn** (đo lại với bộ giới hạn mức; số của cách cũ trong ngoặc):
    - giọng thật tiếng Việt ở 1 m: lỗi 44,7% (44,0%);
    - điện thoại 1 m: lỗi 30,0%, giữ 84% (33,5%, 80%);
    - điện thoại 3 m: lỗi 54,9%, giữ 44% (55,3%, 44%);
    - phòng ồn: giữ câu ngắn 39,5%, lỗi 69,9% (không đổi).
  - **A4-mic, gói Nhẹ:** 52,0%; 39,3% / 76%; 62,4% / 40%; 42,1% / 73,5% (cách cũ: 58,0%; 40,9% / 68%; 63,2% / 36%;
    42,1% / 74,2%).
  - **Lọc ồn tắt, gói Chuẩn** (để theo dõi, không phải mức đạt): giọng thật 1 m lỗi 36,7%; điện thoại 1 m 30,4% / 76%; 3 m
    71,2% / 36%; phòng ồn không còn câu nào.
  - Chống thụt lùi: mỗi số không được xấu hơn quá 10% (tương đối).
- **Website (§9):** nói rõ micro của laptop hợp nhất với người nói gần (khoảng 1 m) và phòng yên tĩnh; khuyên dùng micro
  rời hay micro hội nghị cho phòng lớn; không nêu số lỗi nếu không kèm điều kiện đo.
- **Còn mở:**
  - Windows (Task 17 của kế hoạch 01, làm trong kế hoạch 02);
  - dùng chung micro với app họp, AirPods, micro USB;
  - giọng thật các tiếng ngoài tiếng Việt.

## 17. Nhường lời theo tiếng nói của âm thanh máy (2026-10-25)

Số liệu: `bench/2026-10-24-nguon-micro/results/ao-tron.md`. Chủ dự án chọn ngày 2026-10-25 (hướng 3 trong ba hướng của
`ao-tron.md`), kèm yêu cầu không làm chậm dịch và nhả chữ. Mục này **ghi đè** mục 16 ở phần tiếng vọng (§5.4).

**Vấn đề.**
- Bộ nhường lời của mục 16 chỉ hạ micro khi âm thanh máy vượt −55 dBFS (mức tuyệt đối).
- Người online nói nhỏ (dưới khoảng −55 dBFS) không làm micro bị hạ.
- Micro đã khuếch đại tới +20 dB, nên tiếng nền phòng −45 dBFS lên khoảng −25 dBFS, lấn át giọng sạch của âm thanh máy.
- Đo được: lỗi 13,7% ở −56 dBFS và 80% ở −62 dBFS. Chế độ Âm thanh máy với cùng giọng: 9,1% và 12,5%.
- Hạ −30 dB vẫn chưa đủ: tiếng nền còn khoảng −55 dBFS, to hơn giọng −62 dBFS.

**Thiết kế: cổng kép.**
- Micro bị hạ khi **một trong hai** điều kiện đúng:
  - (a) khung 10 ms của âm thanh máy có RMS từ −55 dBFS trở lên, như mục 16, quyết định tức thì;
  - (b) Silero VAD chạy trên âm thanh máy cho xác suất có tiếng nói từ 0,5 trở lên ở khung 512 mẫu (32 ms) vừa xong.
- Hạ là **tắt hẳn micro** (thay cho −30 dB). Spike (`tieng-vong.md`) đo phương án tắt hẳn, giữ 150 ms, ngang mức −30 dB
  giữ 300 ms: cảnh 1 7,8% so với 7,7%, cảnh 2 11,1% so với 11,0%. Tắt hẳn kèm giữ 300 ms chưa đo; đo ở nghiệm thu dưới.
- Giữ 300 ms sau điều kiện cuối cùng, rồi mở lại dần trong 50 ms, như mục 16.
- Nhạc hay tiếng thông báo nhỏ không phải tiếng nói thì không làm micro bị hạ; âm thanh to vẫn làm hạ như trước.

**Không thêm độ trễ.**
- Không đệm hay trễ micro để chờ VAD: kết quả của khung Silero vừa xong áp cho các mẫu kế tiếp.
- Giọng to vẫn được (a) bắt tức thì. Với giọng nhỏ, đầu câu có thể lọt tối đa 1–2 khung (32–64 ms) tiếng micro; chấp nhận
  điều này để không trễ.
- Ngắt câu, nhận dạng và dịch không đổi.

**Chỗ đặt.**
- `crates/audio-capture/src/duck.rs`:
  - `DuckingMixer` nhận một bộ phát hiện tiếng nói tùy chọn, qua trait trong crate `audio-capture`, để crate này không phụ
    thuộc `pipeline`;
  - mixer gom âm thanh máy đã ghép thành khung 512 mẫu và hỏi bộ phát hiện;
  - `MicGate` có thêm cách "giữ" theo tín hiệu tiếng nói, không đổi cách đo năng lượng.
- `src-tauri/src/capture.rs`:
  - `BothPre` dùng bộ phát hiện bọc `pipeline::vad::SileroVad`;
  - `LiveCapture` nhận hàm tạo VAD của session (cùng `VadFactory` engine đang dùng);
  - Silero được nạp lười trên luồng VAD của engine (stack 8 MiB) ở lần trộn đầu tiên.
- Silero này chỉ có ở chế độ Âm thanh máy + Micro; hai chế độ kia không tốn gì thêm. Có state riêng, không dùng chung với
  VAD của engine.
- Mở lại nguồn (đổi thiết bị, micro rút ra cắm lại) thì xóa state của Silero, như engine làm với VAD của nó.

**Lỗi.**
- Silero của bộ trộn không nạp được: ghi cảnh báo một lần và dùng riêng điều kiện (a) tới hết phiên.
- Chạy lỗi giữa chừng: ghi cảnh báo và dùng riêng (a) tới lần mở nguồn kế tiếp, vì mỗi lần mở có bộ trộn mới.
- Phiên không dừng, không có mã lỗi mới.

**Chi phí và ngân sách.**
- Đo vi mô ngày 2026-10-25, bản release, M4 Pro, 3 000 khung của bản thu thật: Silero 0,22 ms mỗi khung (p95 0,23 ms, chậm
  nhất 1,9 ms).
- Đo trong app thật (cùng ngày, bản release ký ad-hoc, track 300 giây, gọi Silero ở mọi khung): trung bình khoảng 1,7 ms
  mỗi khung, chậm nhất 5–20 ms, tức khoảng 5% một nhân. Gấp khoảng 8 lần số vi mô vì chạy xen với whisper, VAD của engine
  và đồng hồ của app; **ngân sách p95 ≤ 0,5 ms ở bản nháp đầu chỉ đúng cho số vi mô, không phải cho app thật**. Dù vậy không
  gây trễ đo được (xem dưới).
- Ngân sách đo được trong app:
  - A2: so chế độ trộn với chế độ Âm thanh máy cùng ngưỡng cắt đoạn (500 ms), cùng track 300 giây, xen kẽ ít nhất ba lượt
    mỗi chế độ. Một lượt đơn lẻ dao động khoảng ±50 ms (cùng cấu hình, tổng p50 từ 1 088 tới 1 216 ms), nên so **trung bình**:
    tổng p50 của trộn không hơn Âm thanh máy quá 50 ms, tổng p90 không hơn quá 100 ms (tiêu chí gốc của A2-mic: phần do
    trộn và micro gây ra dưới 100 ms). Lượt A2 ngày 2026-10-24 (1 056 ms) dùng track khác nên không so được;
  - nhận dạng p50 và dịch p50 giữ nguyên trong dao động đo;
  - Windows i5 (máy yếu nhất đang hỗ trợ): log `nhường lời: Silero …` mỗi phút phải cho trung bình dưới 5 ms mỗi khung
    (32 ms mỗi khung, dưới 16% một nhân); **chưa đo**.
- **Giảm chi phí (đã làm, theo số đo offline ở `loi-noi.md`):** chỉ hỏi Silero ở khung không to (khung to đã hạ micro rồi)
  và không im lặng số (dưới −80 dBFS, tức khung không có gì để nghe). Khung bị bỏ không đổi state của Silero. Tỉ lệ khung
  được hỏi tùy nội dung: 6% ở bản thu thật nhiều lúc nghỉ, 18–57% ở các cảnh liên tục.
- **Không xóa state của Silero giữa chừng** (chỉ xóa lúc mở nguồn): thử xóa sau 0,5 giây không có khung nào được hỏi thì giọng
  −62 dBFS xấu đi (21,4% so với 12,7%), vì sau khi xóa, vài khung đầu của câu nhỏ chưa đủ chắc để vượt 0,5.

**Kiểm thử.**
- Đơn vị (`duck.rs`):
  - giọng tổng hợp −62 dBFS kèm bộ phát hiện giả báo "có tiếng" thì micro bị tắt từ khung kế tiếp và giữ 300 ms;
  - âm thanh máy nhỏ mà bộ phát hiện báo "không" thì micro không bị hạ;
  - âm thanh máy to vẫn hạ ngay ở khung 10 ms kế tiếp, kể cả khi không có bộ phát hiện;
  - bộ phát hiện lỗi thì quay về điều kiện (a).
- `capture.rs`: `BothPre` có VAD lỗi nạp vẫn trộn được; hàm tạo VAD chỉ được gọi ở chế độ trộn.
- `mix-eval`: phương án nhận `gate.speech_prob` (ngưỡng xác suất; không có thì như mục 16). Tắt hẳn micro khi hạ là
  `"duck_db": null`, đã có từ spike.

**Nghiệm thu (thêm vào mục 11).**
- **A-trộn:** cảnh 1, 2 không xấu hơn mốc mục 16 quá 10% (tương đối): online ≤ 9,8% × 1,10, trong phòng ≤ 5,2% × 1,10.
  Cảnh 2 báo cáo để so.
- **A-nhỏ (mới):** các cảnh `nen-h*` (giọng online nhỏ, micro chỉ có tiếng nền phòng):
  - ở −56 và −62 dBFS, lỗi của chế độ trộn không xấu hơn chế độ Âm thanh máy (`PB-app`) quá 10% (tương đối);
  - ở −36 và −46 dBFS, không xấu hơn lúc chưa sửa quá 10%.
- **A-ảo:** `ao-tron-can` và cảnh 6 vẫn 0 hay ≤ 1 câu ảo mỗi 10 phút.
- **A2:** như ngân sách ở trên (so với chế độ Âm thanh máy, cùng ngưỡng cắt đoạn).
- **Thử tay:** đúng tình huống A7 (câu mẫu `listen-test-en.wav`, −65 dBFS, nguồn toàn hệ thống, chế độ trộn). Câu mẫu phải
  được nhận đúng, và log có `micro bị hạ` lớn hơn 0.

**Kế hoạch.** Kế hoạch 05 (`docs/superpowers/plans/2026-10-25-nguon-micro-05-nhuong-loi-theo-tieng-noi.md`) làm trước
phần phát hành của kế hoạch 04 (Task 10–12). Website và pháp lý không đổi: câu "Khi người online đang nói, micro được hạ
xuống" vẫn đúng.

## 18. Mặc định ngắt câu 100 ms cho mọi chế độ (2026-10-25)

Chủ dự án chốt (2026-10-25), sau khi thử bản dev và xem số đo ở `bench/2026-10-24-nguon-micro/results/ngat-cau.md`: **mọi chế độ
thu mặc định ngắt câu 100 ms.** Bản trước đó là 50 ms (Âm thanh máy) và 500 ms (có micro, thanh trượt khóa); chủ dự án thấy 500 ms
làm phụ đề dịch video chậm.

- Hai khóa riêng, cùng mặc định: `vadEndSilenceMs` (Âm thanh máy) và `micEndSilenceMs` (micro, Âm thanh máy + Micro), mỗi khóa
  50–800 ms, bước 50 ms. Thanh "Độ nhạy ngắt câu" kéo được ở mọi chế độ và lưu vào khóa của chế độ đang chọn.
- Người dùng đã lưu `vadEndSilenceMs` (kể cả 50 ms, mặc định cũ) thì giữ nguyên: file không ghi được ai đặt tay, ai để mặc
  định, nên không đổi hàng loạt. Chỉ cài mới, hay file thiếu/hỏng khóa, mới nhận 100 ms.
- Đánh đổi đã biết (đo offline, M4 Pro; xem biên bản): ở 100 ms so với 500 ms, chế độ chỉ Micro với giọng thật nhận kém hơn
  (lỗi 57% so với 45%, 36 đoạn so với 26); chế độ Âm thanh máy + Micro nói lần lượt kém 1,5–2 điểm (online 9,7% so với 8,1% ở
  bản thu thật), nhưng nói chồng tốt hơn hẳn (10,0% so với 21,6%); phụ đề nhanh hơn khoảng 400 ms. Chữ ảo vẫn 0 ở mọi mức.
- Các mốc nghiệm thu A4-mic và A-trộn (mục 16, 17) đo ở 500 ms và vẫn là mốc của cấu hình 500 ms; ở mặc định 100 ms mốc A4-mic
  giọng thật là 57,3%, không phải 44,7%. Người dùng muốn chính xác hơn thì kéo thanh lên 300–500 ms (ghi chú dưới thanh nói
  rõ). Chưa đo chất lượng bản dịch.

## Tham khảo

- Microsoft, `IAcousticEchoCancellationControl::SetEchoCancellationRenderEndpoint` (tối thiểu build 22621):
  https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iacousticechocancellationcontrol-setechocancellationrenderendpoint
- Đo Voice Processing của macOS làm nhỏ tiếng app khác khoảng 8 dB, rồi bỏ để tự khử vọng trong app:
  https://github.com/firemonster612/speecher/pull/274, https://github.com/firemonster612/speecher/issues/236
- Granola: nhãn "Me"/"Them" lấy từ micro và âm thanh hệ thống:
  https://docs.granola.ai/help-center/taking-notes/transcription
- Thu cả hai phía, tiếng vọng và câu trùng: https://docs.openwhispr.com/help/meetings/capture-both-sides
- `sonora` (bản Rust thuần của WebRTC audio processing, có AEC3, BSD-3-Clause, 0.2.0 ngày 2026-07-29):
  https://crates.io/crates/sonora
- Lọc ồn làm Whisper nhận sai hơn: https://arxiv.org/pdf/2512.17562, https://arxiv.org/pdf/2406.12699,
  https://arxiv.org/html/2603.04710v1
- So RNNoise và DeepFilterNet (một bài đo, có tiếng gõ phím; không bộ nào làm Whisper đúng hơn):
  https://www.creativeainews.com/articles/deepfilternet-vs-rnnoise-vs-ffmpeg-noise-removal-2026/
- Tiếng gõ phím dễ bị bộ lọc ồn thông thường coi là tiếng nói: https://scitepress.org/PublishedPapers/2022/115374
- `nnnoiseless` (RNNoise bằng Rust, BSD-3-Clause, 0.5.2 ngày 2025-12-18): https://crates.io/crates/nnnoiseless
- DeepFilterNet (bản phát hành): https://github.com/Rikorose/DeepFilterNet/releases
