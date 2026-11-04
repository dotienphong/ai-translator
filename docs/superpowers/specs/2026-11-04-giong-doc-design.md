# Màn hình "Giọng đọc": chọn giọng, âm lượng, tốc độ, ngắt nghỉ — Design

Trạng thái: **bản nháp chờ chủ dự án duyệt** (2026-11-04). Chưa có dòng code nào. Nối tiếp `2026-11-02-doc-ban-dich-tts-design.md` (gọi là "spec TTS"); không đổi các quyết định trong đó.

## 1. Mục tiêu và phạm vi

Người dùng chọn được giọng đọc khác (trong các giọng có sẵn của VieNeu-TTS v3 Turbo) và có một màn hình riêng để chỉnh cách đọc.

Đã chốt với chủ dự án (2026-11-04):

- Vị trí: **mục riêng ở thanh bên trái, ngay dưới "Gõ dịch"** (không phải tab trong Cài đặt).
- Nội dung: chọn giọng + nghe thử; âm lượng, tốc độ, độ dài khoảng nghỉ giữa câu.
- Tốc độ: **đổi nhịp giữ cao độ** (co/giãn thời gian) trong `tts-worker`.
- Ngoài phạm vi: bật/tắt tính năng, tự đọc, làm nhỏ âm thanh cuộc họp, tải/xóa gói giọng (đã có chỗ khác); thông số sinh tiếng nâng cao (nhiệt độ, top-k, top-p, phạt lặp); nhân bản giọng; macOS (giọng đọc chỉ có trên Windows).

## 2. Dữ kiện đã kiểm

- Worker đã nhận tên giọng: `Request::Speak { voice: Option<String> }` (`crates/tts-protocol`), `Voices::get(name)` rơi về giọng mặc định khi tên lạ hoặc `None` (`crates/tts-worker/src/voices.rs`). Hiện app luôn gửi `voice = None`.
- Trang model gốc (`pnnbao-ump/VieNeu-TTS-v3-Turbo`, đọc 2026-11-04): `voices_v3_turbo.json` chứa **23 giọng preset** (Bắc 13: nam 7, nữ 6; Trung 2; Nam 8: nam 4, nữ 4), mặc định upstream là Minh Quân; giấy phép Apache-2.0 bao cả giọng preset. Gói ~520 MB của app đã chứa file này, nên **không phải tải thêm gì**. Trang model gốc không có tham số tốc độ hay cao độ.
- **Chưa xác minh được trong môi trường làm việc** (không có model): file giọng của gói đang phát hành có đủ 23 giọng, tên chính xác ra sao. Bước đầu của kế hoạch là đọc `models/tts/voices_v3_turbo.json` trên máy chủ dự án và ghi danh sách thật vào spec này (mục 9).

## 3. Nguyên tắc không làm hỏng tính năng cũ

1. Mọi khóa mới có mặc định = hành vi hiện tại: giọng mặc định của file, tốc độ 1,0, khoảng nghỉ 1,0, âm lượng 100%.
2. Tốc độ 1,0 **không đi qua thuật toán đổi nhịp**; đầu ra phải giống hệt bản hiện tại (test so sánh từng mẫu).
3. Không sửa `asr-worker`, `speaker-worker`, `pipeline`, đường thu âm và cơ chế chặn thu khi đang đọc (spec TTS §5). Không thêm thư viện bên thứ ba (thuật toán đổi nhịp tự viết, thuần Rust; nếu sau này muốn thêm thư viện thì theo CLAUDE.md: bản ổn định mới nhất, kiểm tương thích).
4. Giọng không tồn tại, file giọng hỏng, thông số ngoài khoảng: không bao giờ làm crash hay im lặng; rơi về mặc định và đọc bình thường.
5. Website không nêu tên model hay engine (CLAUDE.md).

## 4. Cài đặt (`src-tauri/src/settings/`)

Khóa mới trong `Settings` (tên camelCase ở JSON như các khóa khác):

| Khóa | Kiểu | Mặc định | Khoảng hợp lệ |
|---|---|---|---|
| `tts_voice_vi` | `Option<String>` | `None` (giọng mặc định của file) | tên ≤ `MAX_VOICE_BYTES` |
| `tts_voice_en` | `Option<String>` | `None` | như trên |
| `tts_volume` | `u8` | 100 | 0–100 |
| `tts_speed` | `f32` | 1,0 | 0,8–1,3 |
| `tts_pause` | `f32` | 1,0 | 0,5–2,0 |

- File cài đặt cũ thiếu khóa thì `migrate::load` ghép mặc định (không cần migration); `validate` từ chối khi lưu giá trị ngoài khoảng, `NaN`/vô cực (như các khóa hiện có); lúc đọc để nói thì kẹp lại (mục 6).
- Tên giọng được kiểm lúc đọc, không kiểm lúc lưu (danh sách giọng phụ thuộc gói đã tải). Tên không còn trong file giọng thì `Voices::get` dùng giọng mặc định; giao diện hiện lựa chọn "Mặc định".
- Đổi cài đặt có hiệu lực từ câu đọc kế tiếp; không khởi động lại worker.

## 5. Worker và giao thức (`tts-protocol`, `tts-worker`, `tts-client`)

- `Request::Speak` thêm hai trường tùy chọn `speed: Option<f32>` và `pause_scale: Option<f32>` (thêm cuối `Speak`; biến thể mới lấy chỉ số kế tiếp). Postcard mã hóa theo vị trí nên không có trường mặc định hay bỏ qua: khung cũ không đọc được bằng kiểu mới. Tương thích nhờ tăng `PROTOCOL_VERSION` từ 2 lên 3 (app và worker luôn build cùng nhau); worker cũ bị từ chối ngay ở `Ready`; `fake_tts_worker` và test của `tts-client` cập nhật theo. Worker lệch phiên bản bị app tắt ngay như đã quy định ở spec TTS §7e.
- Lệnh mới `ListVoices` → `Voices { names: Vec<String>, default: String }`. Xử lý **không nạp ONNX**: chỉ đọc tên và tên mặc định trong `voices_v3_turbo.json`, nên trả lời nhanh và không tốn RAM model. Worker chưa chạy thì app dùng chính `tts-client` khởi động lười như `speak`. Kết quả được app giữ trong bộ nhớ tới khi gói giọng đổi.
- `pause_scale`: nhân hai hằng `GAP_MINOR_S` và `GAP_SENTENCE_S` (`speech.rs`) lúc ghép khoảng lặng; giá trị 1,0 giữ nguyên đường cũ.
- `speed`: bộ co/giãn thời gian dạng WSOLA, mô-đun riêng `tempo.rs` trong `tts-worker`, chạy trên từng nhóm khung PCM của đường phát dần, giữ trạng thái chồng lấn giữa các nhóm, độ trễ thêm không quá ~30 ms. Chỉ áp cho phần tiếng nói; khoảng lặng được chèn sau bước này nên không bị co/giãn. `speed == 1,0` bỏ qua hoàn toàn. Hủy giữa chừng (`cancel`) vẫn dừng trong thời gian như hiện nay.
- Số liệu/log không chứa chữ của người dùng (giữ nguyên quy ước `Debug` đã có).

## 6. Phía app Tauri (`src-tauri/src/tts.rs`, `commands.rs`)

- `tts_speak` (và `overlay_tts_speak`, chữ ký không đổi) lấy giọng theo ngôn ngữ câu (vi/en) và `speed`, `pause_scale` từ cài đặt, rồi gửi kèm lệnh; giá trị đọc ra được kẹp vào khoảng hợp lệ (`NaN` → 1,0), nên file cài đặt sửa tay sai vẫn đọc bình thường.
- Nút Nghe thử dùng lệnh riêng `tts_preview` (giọng, tốc độ, khoảng nghỉ, âm lượng truyền thẳng, dùng giá trị đang kéo trên màn hình, chưa cần đã lưu), chỉ cửa sổ chính được cấp.
- Lệnh mới `tts_list_voices` trả `{ names, default }` (hoặc lỗi `ttsUnavailable` khi thiếu worker/model), đăng ký ở `handler()`, `build.rs` và `capabilities/*.json` (test `acl_tests` bắt buộc khớp).
- Cài đặt mới đi qua lệnh lưu cài đặt hiện có, không thêm lệnh lưu riêng.
- Âm lượng không vào worker: phía Rust (`tts::speak`/`preview`) nhân hệ số 0–100% vào PCM trước khi gửi về giao diện, nên cả cửa sổ chính lẫn overlay (Nghe dịch) đều theo mà không sửa `TtsPlayer`; chỉ giảm chứ không khuếch đại nên không méo tiếng. Cờ `mark_playing` chặn thu giữ nguyên.

## 7. Giao diện

- `Screen` thêm `"voice"`, nằm ngay sau `"compose"` trong `SCREENS`; biểu tượng loa (thêm vào `Icon` nếu chưa có); nhãn `nav.voice` ("Giọng đọc") đủ 5 ngôn ngữ giao diện (vi/en/ja/zh/ko). Mục ẩn khi không phải Windows.
- `src/windows/main/screens/VoiceScreen.tsx`:
  - Hai khối chọn giọng: **tiếng Việt** và **tiếng Anh**. Mỗi khối là danh sách chọn một, nhóm theo vùng (Bắc/Trung/Nam), mỗi dòng có tên, giới tính, nút Nghe thử; có lựa chọn "Mặc định".
  - Nhãn vùng/giới tính lấy từ bảng tĩnh `src/lib/ttsVoices.ts` theo trang model gốc; tên chưa có trong bảng vẫn hiện, xếp vào nhóm "Khác".
  - Ba thanh trượt: âm lượng (%), tốc độ (×), khoảng nghỉ (×), có số hiện bên cạnh; nút "Khôi phục mặc định".
  - Nghe thử đọc câu mẫu cố định theo ngôn ngữ của khối (có trong bộ chuỗi giao diện), cùng đường `tts_speak`. Bấm lại hoặc rời màn hình thì hủy.
- Trạng thái chưa dùng được dùng chung `store/tts.ts`: gói đang tải thì khóa điều khiển và hiện %, thiếu worker/model thì hiện cùng lý do như nút "Nghe dịch". Không cần thêm store trạng thái mới; danh sách giọng nằm trong `store/tts.ts`, tải khi mở màn hình và khi `tts://changed`.
- Màn hình lỗi/bận: nút Nghe thử hiện trạng thái đang đọc/dừng giống nút nghe ở phụ đề; lỗi hiện thông báo ngắn, không văng.

## 8. Kiểm thử và nghiệm thu

- `tts-protocol`: khứ hồi (postcard) có hai trường mới và các biến thể mới; `ListVoices`/`Voices`.
- `tts-worker`: `tempo` — độ dài đầu ra ≈ độ dài vào / tốc độ (dung sai 2%), không `NaN`/vượt ±1, `speed = 1,0` giống hệt từng mẫu, chia nhóm khác nhau cho cùng kết quả (dung sai nhỏ); `pause_scale` đổi đúng độ dài khoảng lặng; `ListVoices` không nạp ONNX.
- Settings: validate (kẹp, `NaN`), migrate từ file cũ thiếu khóa, mặc định = hành vi cũ.
- App: ACL khớp; `tts_speak` gửi đúng giọng theo ngôn ngữ.
- Giao diện (vitest): `VoiceScreen` (khóa khi chưa có gói, chọn giọng lưu đúng khóa, khôi phục mặc định), `navigation` (mục ẩn trên macOS), `store/tts` (nạp danh sách giọng).
- Toàn bộ test hiện có chạy nguyên (`cargo test --workspace`, `cargo clippy`, `cargo fmt --check`, `vitest`, `tsc`).
- Chủ dự án nghe thử: vài giọng mỗi vùng, tốc độ 0,8 / 1,0 / 1,3 (chốt lại khoảng nếu âm thanh méo), khoảng nghỉ 0,5 / 2,0.

## 9. Việc mở

1. ~~Đọc `models/tts/voices_v3_turbo.json`~~ **Xong (2026-11-04)**: file thật có **25 giọng**, mặc định `Hải Đăng` (không phải 23 giọng/mặc định Minh Quân như trang model gốc). Danh sách: Adam, Adam bựa, Hải Đăng, Kim Thanh, Mai Anh, Minh Triết, Minh Đức, Mỹ Duyên, Ngọc Huyền, Ngọc Linh, Ngọc Trân, Phạm Tuyên, Quang Sơn, Quốc Tuấn, Quỳnh Anh, Thanh Bình, Thiền Tâm Đức, Thiện Minh, Thái Sơn, Thùy Dung, Thục Đoan, Trúc Ly, Xuân Vĩnh, Đoan Trang, Đức Trí. Vùng/giới tính chỉ gán cho 20 giọng có trong trang model gốc; 5 giọng còn lại (Adam bựa, Hải Đăng, Quốc Tuấn, Thiền Tâm Đức, Thiện Minh) vào nhóm "Khác", giới tính "không rõ". Chủ dự án cân nhắc có ẩn "Adam bựa" không.
2. Nghe chất lượng đổi nhịp để chốt khoảng 0,8–1,3.
3. Website (sau khi phát hành, 5 ngôn ngữ, không nêu tên model): bổ sung "chọn giọng nam/nữ theo ba miền, chỉnh tốc độ, âm lượng, khoảng nghỉ" ở `features`, guide liên quan, `faq`; số giọng chỉ nêu sau khi xác minh số thật ở mục 1. Chính sách quyền riêng tư không đổi (không có dữ liệu mới rời máy).
4. Commit, push, phát hành: chỉ khi chủ dự án cho phép (quy tắc dự án).
