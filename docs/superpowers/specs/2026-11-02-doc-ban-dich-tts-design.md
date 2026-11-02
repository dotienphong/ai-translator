# Nút nghe bản dịch (TTS offline, VieNeu-TTS v3 Turbo) — Design

Trạng thái: **bản nháp chờ chủ dự án duyệt** (2026-11-02). Chưa có dòng code nào của tính năng; nhánh `feat/vieneu-tts-v3-turbo`.

## 1. Quyết định đã chốt (chủ dự án, 2026-11-02)

- Tính năng: **nút nghe** trên phụ đề / bản chép lời. Chỉ đọc khi người dùng bấm. Không tự đọc liên tục trong cuộc họp.
- Ngôn ngữ đọc: tiếng Việt và tiếng Anh (v3 Turbo chỉ có hai ngôn ngữ này). Câu dịch ra Hàn, Trung, Nhật: **không hiện nút nghe**.
- Chạy 100% trên máy, trong một **worker riêng** theo mẫu `speaker-worker` / `asr-worker`.
- Hạ tầng ONNX: thử `candle-onnx` trước; nếu thiếu toán tử thì báo chủ dự án trước khi thêm `ort`. **Kết quả spike: thiếu toán tử, cần `ort` (mục 7b).**
- Ngoài phạm vi: phát vào cuộc họp (D9, §3.2 spec gốc), nhân bản giọng, tự đọc liên tục, tiếng Hàn/Trung/Nhật.

## 2. Nguyên tắc không làm hỏng tính năng cũ

1. Công tắc `tts` **tắt mặc định**. Tắt thì không spawn worker, không nạp model, không đổi đường đi của âm thanh, ASR, dịch.
2. Không sửa `asr-worker`, `speaker-worker`, `pipeline` ngoài đúng một điểm nối (mục 5).
3. Không có hai bản ggml trong một tiến trình (spec §6.12): worker TTS không chứa ggml, không có mã mạng.
4. Phiên bản thư viện mới: theo spec §6.12 (bản ổn định mới nhất, kiểm MSRV 1.98.1, build lại và chạy toàn bộ test).
5. Website không nêu tên model, engine hay thư viện (CLAUDE.md, `website/README.md`).

## 3. Pipeline v3 Turbo (đọc từ SDK `vieneu` 3.8.3, `_v3_turbo_engine/onnx_runtime_lite.py`)

Thành phần cần có trên máy:

| Nhóm | File |
|---|---|
| Backbone (3 graph) | `vieneu_prefill.onnx`, `vieneu_decode_step.onnx` (KV cache), `vieneu_acoustic_cached.onnx` |
| Trọng số ngoài | `vieneu_backbone_shared.data` (external data của ONNX) |
| Đầu ra, embedding | `vieneu_v3_heads.npz` (embedding và đầu ra buộc chung, `xvec_proj`) |
| Cấu hình | `config.json`, `tokenizer.json` |
| Codec 48 kHz | `moss_audio_tokenizer_decode_full.onnx`, `..._decode_step.onnx`, `..._decode_shared.data`, `codec_browser_onnx_meta.json` |
| Giọng preset | `voices_v3_turbo.json` (speaker embedding + mã tham chiếu; không cần bộ mã hóa clone) |

Các bước (phần SDK viết bằng NumPy phải viết lại bằng Rust):

1. Chuẩn hóa chữ và chuyển âm vị bằng `sea-g2p` (lõi Rust, Apache-2.0, có sẵn crate).
2. Dựng các hàng đầu vào: embedding, neo giọng (speaker anchor), mã tham chiếu.
3. `prefill` rồi vòng `decode_step` với KV cache; mỗi bước chạy `acoustic_cached` để ra khung; lấy mẫu (nhiệt độ, top-k, top-p, phạt lặp có cửa sổ lịch sử), có thử lại khi nghi "lảm nhảm" (babble).
4. Giải mã codec theo khung (`decode_step`) để phát dần; câu đầu ra sau khoảng 300 ms theo tài liệu tác giả.
5. Ghép đoạn, chèn khoảng lặng theo dấu câu, ra PCM 48 kHz.

Chưa tự đo trên máy này (môi trường làm việc không tải được model). Số tham khảo từ tác giả: RTF 0,37 (int8) / 0,62 (fp32) trên CPU desktop; int8 cần CPU có VNNI.

## 4. Kiến trúc

- Crate mới `tts-protocol` (khung JSON dòng như `speaker-protocol`) và `tts-worker` (bin). Không phụ thuộc `pipeline`.
- Worker ưu tiên thấp hơn ASR và dịch; nạp model lười (lúc bấm nút nghe lần đầu hoặc khi mở bản chép lời), tự thoát sau khi rảnh.
- Lệnh: `speak { id, lang, text, voice }` → luồng `audio { id, pcm_f32_48k }` → `done`. Hủy được (`cancel { id }`) khi người dùng bấm lại, đổi câu, hoặc đóng.
- Phát âm thanh ở app chính (cpal hoặc API sẵn có của app); hàng đợi một câu một lần.
- Model tải qua quản lý model (§6.7): SHA-256, tải tiếp được; gói riêng, người dùng tự bật.

## 5. Vòng lặp âm thanh trên Windows (đã chốt 2026-11-02: chủ dự án ủy quyền, chọn phương án chặn thu)

Windows thu **mọi** âm thanh máy qua loopback (§6.1), nên tiếng TTS của chính app sẽ bị thu lại, nhận dạng và dịch thành phụ đề giả. macOS đã loại trừ chính app khỏi tap nên không bị.

Quyết định: khi đang phát TTS, cổng nhận (ring buffer sau loopback) **bỏ qua** dữ liệu trong khoảng thời gian phát, và VAD được reset khi phát xong. Đây là điểm nối duy nhất đụng luồng cũ; phải có test chứng minh khi tắt công tắc `tts` thì hành vi y hệt hiện tại. Phương án thay thế: cảnh báo "dùng tai nghe" và không chặn (đơn giản hơn, nhưng loa ngoài vẫn gây phụ đề giả).

## 6. Rủi ro đã biết

| Rủi ro | Cách xử lý |
|---|---|
| `candle-onnx` chưa chắc hỗ trợ đủ toán tử (KV cache, external data, int8) | Spike trước; thiếu thì báo chủ dự án trước khi thêm `ort` (thư viện native mới: dung lượng, license, mục `licenses/native`) |
| **License codec chưa xác nhận.** Bản `MOSS-Audio-Tokenizer-ONNX` (lớn) ghi Apache-2.0, nhưng trang model Nano ghi "theo file LICENSE gốc; nếu chưa có thì coi như chưa được phép phân phối lại" | Phải xác nhận bằng văn bản/LICENSE chính thức của bản **Nano ONNX** trước khi đóng gói hay bán |
| License model v3 Turbo | Apache-2.0 theo model card (một bản sao); đọc lại trang gốc `pnnbao-ump/VieNeu-TTS-v3-Turbo` và LICENSE trước khi phát hành |
| Chất lượng câu Anh–Việt trộn, chuỗi số, tên riêng | Bộ câu thử cố định + chủ dự án nghe |
| RAM khi chạy cùng ASR (whisper) và dịch (llama) | Nạp lười, thoát khi rảnh, đo tổng RAM |
| Máy cũ chậm | Bản int8 nếu có VNNI; phương án thấp: giọng hệ điều hành hoặc ẩn nút |

## 7. Kiểm thử và nghiệm thu

- Toàn bộ test hiện có chạy nguyên khi công tắc tắt; thêm test "tắt thì không spawn worker, không đổi đường dữ liệu".
- Test đối chiếu: với seed và tham số cố định, mã codec và PCM của bản Rust khớp SDK Python trong dung sai (golden file).
- Đo độ trễ từng khâu (chuẩn hóa chữ, prefill, khung đầu, khung tiếp theo, giải mã, phát) trên một máy Windows yếu và một máy Mac; ghi số đo kèm điều kiện đo.
- `cargo clippy`, `cargo deny`, `cargo about` (mục `licenses/`) cho crate mới.
- Chủ dự án nghe thử: tiếng Việt, tiếng Anh, câu trộn, số, tên riêng.

## 7b. Kết quả spike (2026-11-02, model thật)

- **Tải model:** về `models/tts/` (đã nằm trong `.gitignore`). README của codec Nano ONNX và của VieNeu đều ghi `license: apache-2.0` (chỉ có metadata, không có file LICENSE riêng).
- **Toán tử ONNX** (opset 17) so với `candle-onnx` 0.11.1 (82 toán tử):
  - Backbone fp32 (`onnx_update/vieneu_prefill`, `vieneu_decode_step`): đủ toán tử.
  - `vieneu_acoustic_cached` (cả hai bản): có `DynamicQuantizeLinear` (4) và `MatMulInteger` (5) — `candle-onnx` không có.
  - Bản int8 của backbone: `DynamicQuantizeLinear` 48, `MatMulInteger` 84 — không có.
  - Codec giải mã (`decode_full`, `decode_step`): thiếu `LayerNormalization` (24), `Reciprocal` (12), `Mod` (1).
  - **Kết luận: `candle-onnx` không chạy được pipeline này nguyên trạng.** Phải tự thêm năm toán tử (kể cả phép nhân ma trận số nguyên) hoặc dùng `ort`. Chưa đo tốc độ, nhưng graph 3000+ nút chạy trình thông dịch Rust nhiều khả năng chậm hơn ONNX Runtime ở vòng sinh từng khung.
- **Bản tham chiếu chạy được:** SDK `vieneu` (ONNX Runtime, fp32) trên model đã tải cho ra âm thanh 48 kHz đúng (giọng Hải Đăng). Máy đo là máy cloud 2 nhân, 1 luồng, nên RTF 0,90–1,01 chỉ để tham khảo, không đại diện máy người dùng.

## 7c. Engine `ort` (2026-11-02) và điều cần chủ dự án duyệt

**Đã làm (cloud, model thật, Linux x86):** `tts-worker` có engine Rust nạp đúng các file ONNX của v3 Turbo bằng `ort`:
chữ → âm vị (`sea-g2p`) → neo giọng, embedding → prefill → vòng 16 codebook (acoustic + lấy mẫu + decode_step) → codec → PCM 48 kHz.
Đối chiếu SDK `vieneu` (greedy, cùng ONNX Runtime 1.31.0): âm vị giống hệt, hàng prompt giống hệt, neo giọng và embedding lệch
7e-7, **49/49 khung mã giống hệt, sóng âm lệch 0**. Đo trên máy cloud 2 nhân: sinh khung 2,8 s + codec 0,7 s cho 3,9 s âm thanh
(RTF ≈ 0,9; chỉ để tham khảo, không đại diện máy người dùng; chưa tối ưu: ma trận ra, bản int8, nhiều luồng, codec streaming).
Lưu ý khi viết test: ONNX Runtime 1.29 và 1.31 cho khung mã lệch nhau ở 4/49 khung (khác biệt số học làm lật vài lựa chọn greedy
gần hòa); test đối chiếu phải dùng cùng phiên bản ORT với engine.

**Trong repo:** mã engine nằm sau feature `engine` (tắt mặc định). `Cargo.lock` hiện chỉ có hai crate mới; các phụ thuộc của `engine` vào lock khi chạy `cargo build` lần đầu trên máy có mạng.

**Chủ dự án đã duyệt 2026-11-02 ("chấp nhận") và đã bật `engine` ở manifest:** (1) ngoại lệ rc cho `ort`, ghim `=2.0.0-rc.15`; (2) `load-dynamic`, app tự đóng ONNX Runtime 1.31 (MIT; `licenses/native/onnxruntime-*`); (3) chép `sea-g2p-rs` vào `third_party/` vì `deny.toml` cấm nguồn git lạ; (4) `tokenizers` dùng cùng bản 0.22.2 đang khóa trong Cargo.lock (qua candle) thay vì 0.23.2, để không thêm bản thứ hai; (5) dung lượng: tải model riêng qua quản lý model. Còn phải làm trên máy Windows: `cargo build -p tts-worker --features engine` để Cargo.lock tự thêm `ort`, `ort-sys`, `libloading`, `pastey`, `fancy-regex`, `bit-set`, `bit-vec`, `sea-g2p-rs` rồi commit Cargo.lock; `cargo deny check`; `cargo about`.

**Điểm đã nêu khi xin duyệt:**
1. **`ort` chỉ có bản 2.0.0-rc.15** (toàn bộ dòng 2.x đang là rc; dòng 1.x cũ không còn bảo trì). CLAUDE.md và spec §6.12 đòi "bản ổn định mới nhất": cần chủ dự án chấp nhận ngoại lệ cho một phụ thuộc rc, ghim `=2.0.0-rc.15`.
2. **Nguồn ONNX Runtime:** `ort` tải sẵn nhị phân từ `cdn.pyke.io` lúc build (mặc định), hoặc `load-dynamic` (khuyến nghị: app tự đóng `onnxruntime.dll` / `libonnxruntime.dylib` đúng phiên bản 1.31 kèm bản cài, ký số, ghi vào `licenses/native`; ONNX Runtime là MIT). Mỗi hệ điều hành một bản.
3. **`sea-g2p-rs`** (Apache-2.0) không có trên crates.io: dùng phụ thuộc git ghim `rev` (kiểm `deny.toml` mục `sources`) hoặc chép vào `third_party/`. Kèm từ điển `sea_g2p.bin` (~63 MB) vào gói model.
4. **`tokenizers` 0.23.2** (Apache-2.0, bản ổn định) kéo thêm phụ thuộc; có thể thay bằng BPE byte-level tự viết (từ vựng 419) nếu muốn bớt phụ thuộc.
5. **Dung lượng và dùng bộ nhớ** (đã đo tệp): backbone fp32 396 MB + heads 50 MB + codec 44 MB + từ điển 63 MB; bản int8 ~99 MB + 50 MB nhưng cần CPU có VNNI và chưa thử.

**Còn thiếu để có nút nghe chạy được:** cắt câu dài và trần số khung theo độ dài âm vị, chống "lảm nhảm", ghép khoảng lặng, codec streaming (phát từng khung), vòng lặp worker + giao thức, đưa vào app (spawn lười, hủy, phát PCM), chặn thu khi phát (mục 5), nút giao diện và phím, giọng mặc định, tối ưu tốc độ, đo trên Windows và Mac.

## 7d. Số đo trên máy Windows của chủ dự án (2026-11-02, bản có phát dần và luồng mặc định)

Máy Windows x64 của chủ dự án (chưa ghi lại tên CPU), release, `--test-threads=1`. Đối chiếu SDK: 49/49 khung giống hệt, sóng âm lệch 2e-6; codec dạng luồng lệch 3e-6 so với giải mã một lần.

| | fp32 (`onnx_update`) | int8 (`onnx_int8`) |
|---|---|---|
| Nạp model (`Warmup`) | 2,7 s | 2,6 s |
| Câu ngắn (0,7 s âm thanh) sau warmup | 0,30 s | 0,26 s |
| Câu 3,9–4,5 s: tiếng đầu ra sau | 0,29–0,36 s | 0,20–0,26 s |
| Câu 3,9–4,5 s: tạo xong sau | 2,4–2,8 s (RTF ≈ 0,6) | 1,4–1,8 s (RTF ≈ 0,35) |
| Hủy giữa chừng: dừng sau | 50–90 ms | 50 ms |

Trước khi sửa số luồng và tắt vòng quay chờ, cùng máy này tạo câu 3,9 s mất ~5,4 s và tiếng đầu ra sau 4–8 s. Phát dần (nhóm 4/6/8/25 khung) cho đầu ra giống đường chờ cả câu (lệch 1/32768).
Kết luận: fp32 đã nhanh hơn thời gian thực ~1,6 lần nên là mặc định; int8 nhanh hơn nữa nhưng chất lượng phải nghe (`models/tts/wav_fp32` và `wav_int8`) và cần CPU có VNNI nên chưa bật mặc định.
Còn thiếu: đo khi chạy chung với ASR (whisper) và dịch (llama) trong một phiên họp thật, vì ba tiến trình sẽ tranh lõi.

## 7e. Lớp client và phần nối vào app (2026-11-02)

**Đã có và đã kiểm tra:** `crates/tts-client` quản lý worker cho app: chạy lười, `Warmup`, mỗi lúc chỉ đọc một câu (câu mới hủy câu cũ), worker chết thì chạy lại sau 1/2/5 s và tắt tới hết phiên sau 3 lần, lệch giao thức hay thiếu model thì tắt ngay, rảnh 5 phút thì tắt để nhả RAM. Cách chạy tiến trình do app truyền vào (`Config::spawn`) nên dùng được `pipeline::process::spawn` (Job Object, process group). 13 test với worker giả (đọc, hủy, chết, chạy lại, tắt, lệch giao thức, rảnh) và một test với worker thật: hủy câu cũ sau 50 ms, câu mới xong sau 0,73 s.

**Phần nối vào app Tauri (chưa làm; cần quyết và không kiểm chứng được ngoài máy Windows/Mac của chủ dự án):**
1. *Đóng gói tiến trình phụ:* thêm `tts-worker` vào `externalBin` của `tauri.conf.json`, `scripts/copy-sidecars.sh`, `build.rs` (băm SHA-256, app từ chối binary lạ: spec §10.2), CI phát hành và ký/notarize; kèm `onnxruntime.dll`/`.dylib` 1.31 (MIT) cạnh binary.
2. *Gói model:* ~0,6 GB (backbone fp32 + heads + codec + từ điển + voices), tải qua quản lý model (§6.7) theo manifest ký Ed25519 (`scripts/models/update.mjs`): cần thêm mục vào manifest, đặt file lên `releases.aitranslator.vn`, ký. Không đóng vào bản cài.
3. *Cài đặt:* khóa `tts` (bật/tắt, mặc định tắt) trong `settings/` kèm `validate`, migrate (khóa mới hoàn toàn chỉ cần giá trị mặc định), nhóm Cài đặt mới và chuỗi 5 ngôn ngữ.
4. *Lệnh `invoke`:* `tts_speak` (kênh phát PCM về giao diện), `tts_cancel`, `tts_status`, đăng ký ở `handler()`, `build.rs` và `capabilities/*.json` (test `acl_tests` bắt buộc khớp).
5. *Phát âm thanh:* trong WebView bằng Web Audio (không thêm thư viện âm thanh native); backend đẩy PCM qua kênh Tauri.
6. *Chặn thu khi đang đọc (mục 5):* một cờ nguyên tử `tts_playing` bật lúc giao diện báo bắt đầu phát và tắt khi hết; ở điểm sau cùng mọi nguồn thu (trước ring buffer) nếu cờ bật thì thay mẫu bằng 0 (giữ nguyên dòng thời gian, VAD coi như im lặng). Chạm lõi thu âm nên cần test riêng.
7. *Giao diện:* nút nghe cạnh câu dịch Việt/Anh trên bản chép lời và phụ đề (không có nút cho Hàn/Trung/Nhật), đổi trạng thái đang đọc/dừng.

## 8. Việc mở

1. License codec Nano ONNX và model: metadata ghi Apache-2.0 (mục 7b); vẫn nên lưu bản chụp trang model và hỏi lại tác giả nếu cần văn bản chính thức.
2. ~~Quyết mục 5~~ Đã chốt: chặn thu trong lúc phát.
3. ~~Đặt model~~ Xong (`models/tts/`).
4. Chỗ đặt nút nghe trong giao diện (phụ đề nổi, bản chép lời, hay cả hai).
