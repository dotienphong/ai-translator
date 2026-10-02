# Giai đoạn 1 · 04a: Quản lý model — manifest ký, tải, kho model, đề xuất gói

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần lõi của kế hoạch 04 (mục 2.4 của kế hoạch 00; spec F6, D5, D6, §6.7, §8, §9): manifest `models.json` ký Ed25519 với khóa công khai build sẵn, bộ vector test và script ký cho staging; tải từng file bằng HTTP Range, kiểm SHA-256, thử lại, tạm dừng và tải tiếp; kho model trên máy; cấu hình máy và đề xuất gói theo ngưỡng đọc từ manifest (Đ7); nguồn manifest, chống quay lui, kiểm tối đa mỗi ngày một lần.

**Kiến trúc:**
- Mọi thứ nằm trong module mới `src-tauri/src/models/` (§12 ghi `models/{manifest,download,store}.rs`; 04 thêm `signed.rs`, `machine.rs`, `recommend.rs`, `source.rs`, rồi ở 04b `service.rs`, `commands.rs`). Mỗi file một việc và có test riêng, không cần mở cửa sổ.
- Tải bằng `reqwest` đồng bộ (đã có trong workspace từ 02) trên luồng riêng, đúng cách 02 chọn (luồng hệ điều hành, không tokio; 02a QĐ1). TLS và proxy theo hệ điều hành.
- Test tải chạy với một HTTP server giả viết bằng `std::net` trong chính test (`models/test_http.rs`): hiểu `Range`, ghi lại request, giả được rớt mạng, mã lỗi, server bỏ qua `Range`, dữ liệu hỏng. Không test nào gọi Internet.
- Ngưỡng đề xuất gói, danh sách gói, ghi chú chất lượng và ngưỡng của pipeline nằm trong manifest đã ký, không hard-code trong app (Đ7).

**Công nghệ:** Rust 1.98.1, Tauri 2.12.1 như `main`. Thêm `ed25519-dalek` 3.0.0, `base64` 0.23.1, `libc` 0.2.189 (macOS); bật thêm feature của `reqwest` 0.13.5 và `windows` 0.62.2 (bảng "Phiên bản đã chốt"). Script ký chạy bằng Node 24 (WebCrypto Ed25519), không thêm gói npm.

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.4, 3, 6, 8, 9). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`.

Kế hoạch 04 chia hai file, làm theo thứ tự:
1. **04a** (file này): Task 1–6, phần lõi trong `src-tauri/src/models/` và `scripts/models/`, chưa nối vào app.
2. **04b** `docs/superpowers/plans/2026-10-02-giai-doan-1-04b-quan-ly-model-app.md`: Task 7–15, nối vào app (cài đặt `modelTier`, dịch vụ model, lệnh, sự kiện, phiên dịch), giao diện (bước 2–3 của lần đầu mở, Cài đặt › Model, nút "Xóa model và dữ liệu"), kiểm tra chuẩn, bước của người (bucket R2 staging), đợt Windows, cập nhật kế hoạch 00.

Bảng phiên bản, bảng dòng của bảng đối chiếu, quyết định (QĐ), điểm cần chủ dự án quyết và danh sách file giao nhau với kế hoạch 03 nằm ở file này, dùng chung cho cả hai.

Dựng trên `main` `45de838` (01, 02, 05 đã làm trên Mac; Tauri 2.12.1). Controller đề xuất **thực thi 03 trước 04**: xem mục "File giao nhau với kế hoạch 03".

---

## Phiên bản đã chốt (kiểm ngày 2026-10-02, theo §6.12)

Kiểm bằng `cargo info` và API của crates.io (bản ổn định mới nhất, ngày phát hành, MSRV, giấy phép, yanked), theo luật "bản ổn định mới nhất đã ra ít nhất 1 ngày". Sau khi thêm: `cargo deny check` in `advisories ok, bans ok, licenses ok, sources ok`.

| Thành phần | Phiên bản | Dùng ở | Ghi chú tương thích |
|---|---|---|---|
| ed25519-dalek | 3.0.0 (`default-features = false`) | app (`models/signed.rs`) | Bản ổn định mới nhất (2026-07-06), BSD-3-Clause (có trong `deny.toml`), MSRV 1.85. Kéo `curve25519-dalek` 5.0.0, `ed25519` 3.0.0, `signature`, `subtle`, `fiat-crypto`: thuần Rust. Chỉ dùng để kiểm chữ ký (`verify_strict`); test dùng `SigningKey` với khóa test |
| base64 | 0.23.1 | app | Bản mới nhất (2026-08-04), MIT OR Apache-2.0, MSRV 1.71. Cùng bản `reqwest` đang kéo vào. `URL_SAFE_NO_PAD` từ chối đệm và bit thừa (dạng không chuẩn) |
| reqwest | 0.13.5 (đã có ở `pipeline`); app bật `blocking`, `native-tls`, `system-proxy`, `default-features = false` | app | TLS của hệ điều hành qua `native-tls` 0.2.18 (2026-02-18; Security.framework 3.7.0 trên macOS, SChannel 0.1.29 trên Windows): nhận chứng chỉ gốc cài trong máy (proxy công ty, A7), không thêm thư viện C nào vào tiến trình chính. `openssl*` chỉ xuất hiện trong `Cargo.lock` cho Linux, không có trong cây của `aarch64-apple-darwin` hay `x86_64-pc-windows-msvc` (`cargo tree --target … -i openssl-sys` không in gì). `system-proxy` đọc proxy của hệ thống (`system-configuration` 0.7.0 trên macOS). Client của `llama-server` vẫn `.no_proxy()` như 02 |
| libc | 0.2.189 | app, chỉ macOS | Cùng bản `pipeline`; `sysctlbyname("hw.memsize")`, `statfs` |
| windows | 0.62.2, thêm `Win32_Storage_FileSystem`, `Win32_System_SystemInformation` | app, chỉ Windows | Cùng bản đang dùng; `GlobalMemoryStatusEx`, `GetDiskFreeSpaceExW`. Kiểm bằng `./scripts/check-windows.sh` |
| sha2 | 0.11.0 (đã có) | app | SHA-256 khi tải và khi băm lại |
| Node | 24.21.0 (đã có) | `scripts/models/` | WebCrypto Ed25519 (`node:crypto`), `node --test`. Không thêm gói npm; `pnpm-lock.yaml` không đổi |

Không crate nào mới kéo ggml hay bản thứ hai của một thư viện C vào tiến trình chính.

## Cách đọc kế hoạch này

Như mục "Cách đọc kế hoạch này" của 02a, cộng các điểm riêng:
- **Khối code.** "Tạo `<file>`": chép nguyên khối. "Tạo `<file>`, lúc này mới có phần test": file chỉ có các dòng `//!` đầu và khối `#[cfg(test)] mod tests`. "Thêm vào `<file>` (giữa các dòng `//!` đầu file và khối test)": chèn khối vào giữa hai phần đó, cách mỗi bên một dòng trống. "Sửa `<file>` (áp bằng `git apply`)": lưu khối `diff` vào file tạm, chạy `git apply <file tạm>` từ gốc repo; `--check` lỗi thì dừng, đừng sửa tay.
- **Dòng phiên bản.** Khối `diff` của `Cargo.toml` có thể lấy một dòng phụ thuộc có số phiên bản làm ngữ cảnh. Nếu `main` đã nâng phiên bản đó, giữ bản của `main`: áp bằng `git apply --3way`, không đổi phiên bản về bản cũ.
- **Khối Expected.** Là output thật của một lần chạy lại toàn bộ kế hoạch trên worktree sạch dựng từ `45de838` (2026-10-02). Thời gian (`finished in …`) sẽ khác; số test và tên lỗi phải giống. Lệnh có `grep` hay `head` thì Expected là phần đã lọc. Số test là số lúc lập kế hoạch: nếu 03 đã vào `main` trước thì số test tổng (`cargo test -p meeting-translator --lib` không lọc, `pnpm test`) lớn hơn; số của lệnh có bộ lọc `models::…` vẫn phải giống.
- **Chuỗi commit tham chiếu.** Repo `meeting-translator-work/p04-repo` (ngoài repo chính), nhánh `ref`: mỗi task một commit, đúng như kế hoạch này tạo ra. So cây sau mỗi task bằng `git diff <commit tham chiếu> -- <đường dẫn>`.
- **Đĩa.** Kiểm `df -h /` trước Task 1 và trước kiểm tra chuẩn; dưới 6 GiB thì dừng và báo. Sau `./scripts/check-windows.sh`, xóa `target/x86_64-pc-windows-msvc` (khoảng 0,3 GiB) nếu đĩa chật.
- **Không bật hộp thoại quyền** (mục 6.8 của kế hoạch 00): không task nào mở app hay System Settings. Test dùng server HTTP giả trên `127.0.0.1` (có thể hiện hộp thoại tường lửa trên Windows lần đầu; trên Mac thì không).
- **Task cần người hoặc Windows:** ghi ở đầu task (04b Task 13, 14).

## Task → commit tham chiếu

| Task | Commit tham chiếu (`p04-repo`, nhánh `ref`) | Nội dung |
|---|---|---|
| 1 | `36ebbd1` | feat(models): manifest model, kiểu và kiểm phần thân |
| 2 | `a658059` | feat(models): phong bì ký Ed25519, khóa build sẵn, vector và script ký staging |
| 3 | `a8b096d` | feat(models): tải một file model bằng HTTP Range, kiểm SHA-256, thử lại và tạm dừng |
| 4 | `315effe` | feat(models): kho model trên máy: đã tải, kiểm kích thước, băm lại, xóa, dọn |
| 5 | `4370018` | feat(models): cấu hình máy và đề xuất gói theo ngưỡng của manifest; --probe giữ danh sách GPU |
| 6 | `802e998` | feat(models): nguồn manifest: URL theo bản, tải và kiểm, chống quay lui, kiểm mỗi ngày một lần |
| 7 | `49a046a` | feat(settings): modelTier là mã gói của manifest, chỉ đổi qua lệnh quản lý model |
| 8 | `cd5b496` | feat(models): dịch vụ model, lệnh và sự kiện models://state: tải gói, tạm dừng, cập nhật, xóa |
| 9 | `1cfebee` | feat(app): phiên dịch lấy model và ngưỡng từ kho model; model hỏng thì băm lại; gói mới dùng từ phiên sau |
| 10 | `3ede982` | feat(ui): kiểu, store và chuỗi giao diện của quản lý model |
| 11 | `76576c9` | feat(ui): bước 2–3 của lần đầu mở, Cài đặt › Model, nút Xóa model và dữ liệu, lời mời cập nhật model |
| 12–15 | — | Task 12 kiểm tra chuẩn (không commit); Task 13 (người) và Task 15 commit lúc thực thi; Task 14 đợt Windows |

## Dòng của bảng đối chiếu

Lọc bằng lệnh ở Task 2 Step 1 của kế hoạch 00 (cột "Kế hoạch" có `04`). Mỗi dòng có task nhận:

| # | Yêu cầu (rút gọn) | Task |
|---|---|---|
| 5 | D5: Hy-MT2-1.8B GGUF, phân phối qua manifest | 1, 2 (cấu hình staging), 13 |
| 6 | D6: Whisper qua whisper.cpp (phần 04: file `asr` trong manifest) | 1, 2 |
| 20 | F6: gói Chuẩn và Nhẹ, tự đề xuất, tải tiếp khi rớt mạng, kiểm SHA-256 | 3, 4, 5, 8, 11 |
| 33 | A6: macOS có nút "Xóa model và dữ liệu" (phần của 04) | 8, 11 |
| 36 | Bước 2: kiểm tra cấu hình, đề xuất gói kèm dung lượng | 5, 8, 11 |
| 37 | Bước 3: tải, tạm dừng rồi tải tiếp; tải xong dùng được ngay | 3, 8, 11 |
| 53 | Cài đặt › Model: gói đang dùng, dung lượng, tải lại hoặc xóa | 11 |
| 57 | Nút "Xóa model và dữ liệu", giữ bản quyền và bộ đếm hạn mức | 8, 11 (phần dữ liệu của 03 nối ở `wipe_user_data`, QĐ13) |
| 105 | `--probe` (phần 04: đề xuất gói theo VRAM) | 5, 14 |
| 107 | Model: turbo q5_0, small q5_1 | 2 (`models.config.json`) |
| 157 | Manifest R2, ký Ed25519, khóa công khai build sẵn, đủ trường | 1, 2, 6, 13 |
| 158 | Hai gói và dung lượng | 2 (cấu hình), 13 |
| 159 | Đề xuất gói theo RAM, card rời, VRAM; người dùng đổi được | 5, 11 |
| 160 | HTTP Range, `*.part`, SHA-256 rồi đổi tên, dung lượng trống ≥ model + 1 GB | 3, 8 |
| 161 | Nơi lưu `app_local_data_dir/models` | 8, 14 (Windows) |
| 162 | Tự host model, LICENSE và NOTICE cạnh model | 2, 13 |
| 163 | Kiểm manifest lúc khởi động, tối đa mỗi ngày một lần, hỏi trước khi tải | 6, 8, 11 |
| 223 | Hạng máy; báo máy chưa được hỗ trợ (Đ13) | 5, 11 |
| 224 | Ghi chú chất lượng theo gói, khuyến nghị gói Chuẩn cho vi, ja, ko, zh | 2 (ghi chú trong manifest), 11 |
| 226 | Gói lai nếu M1 không đạt: thêm bằng manifest | 5 (test gói lai), CDA (Q15) |
| 228 | Ngưỡng VRAM 6 GB, gói Nhẹ vừa card 4 GB | 2 (ngưỡng), 14 |
| 233 | Model thiếu hay hỏng: lúc khởi động chỉ kiểm có file và kích thước; SHA-256 khi tải xong và khi nạp lỗi | 4, 8, 9 |
| 237 | Thiếu RAM hay VRAM: đề xuất chuyển sang gói Nhẹ (phần 04: đổi gói) | 11 |
| 246 | Tải lỗi: thử lại 3 lần, cho tải tiếp sau | 3, 8 |
| 258 | Giấy phép model: LICENSE, NOTICE | 2, 13 |
| 291 | Unit test: manifest và SHA-256 | 1–4 |
| 303 | Thủ công: card 4 GB và 6 GB đề xuất đúng gói | 14 (Windows, người) |
| 318 | Cây thư mục §12: `src-tauri/src/models/` | 1–8 |
| 338 | `PipelineConfig` nạp phần muốn đổi từ manifest đã ký | 1, 9 |

## Quyết định của kế hoạch này

- **QĐ1. Phong bì ký.** `models.json` là `{ "format": "ai-translator-models", "version": 1, "kid", "body", "sig" }`; `body` là base64url của các byte JSON phần thân; `sig` là Ed25519 trên `"ai-translator-models.v1." + body`. Ký trên chuỗi đã mã hóa nên không cần chuẩn hóa JSON; tiền tố tách chữ ký manifest khỏi chữ ký token (`v1.<payload>`, 05). Đọc chặt như token của 05: khóa lạ, đệm base64, bit thừa, BOM, quá 1 MiB đều là `malformed`. Lý do: một định dạng kiểm được bằng cả Node (script ký) lẫn Rust, có bộ vector chung.
- **QĐ2. Phần thân manifest.** Ngoài các trường của §6.7 (`id`, `tier`, `kind`, `version`, `url`, `bytes`, `sha256`, `license_id`, `min_app_version`):
  - `tier` là **danh sách** gói có file đó (VAD và giấy phép dùng chung hai gói);
  - thêm `file` (tên file trên máy, tên an toàn) và `kind = "license"` cho LICENSE, NOTICE;
  - `packs`: mã gói, tên và ghi chú chất lượng theo vi/en (gói lai thêm bằng manifest, Q15);
  - `recommend`: `min_ram_mib`, danh sách luật xét theo thứ tự, `fallback` (Đ7);
  - `sequence` tăng dần, app từ chối manifest có số nhỏ hơn bản đã nhận, hay cùng số mà khác nội dung (chống phát lại manifest cũ);
  - `pipeline`: ngưỡng của `PipelineConfig` muốn đổi (dòng 338); sai thì giữ mặc định, manifest vẫn dùng được.
  - `url` tương đối so với URL của manifest, hay `https://` đầy đủ. Khóa lạ bị bỏ qua (manifest mới hơn app).
  - **Cần sửa spec §6.7** cho khớp (`tier` là danh sách, thêm `file`, `kind` `license`, `packs`, `recommend`, `sequence`, `pipeline`).
- **QĐ3. `modelTier` là mã gói của manifest** (chuỗi, không còn enum `standard | lite`), để gói thêm bằng manifest dùng được không phát hành lại app (Đ7). File cài đặt cũ vẫn đọc được (`"standard"`, `"lite"`). `modelTier` thành khóa chỉ đọc của `update_settings`; chỉ đổi qua `select_model_pack` (gói phải đã tải) và khi tải xong một gói (04b Task 7–8).
- **QĐ4. Ngưỡng tính bằng MiB, thấp hơn dung lượng danh nghĩa một chút**, vì hệ điều hành báo ít hơn: máy "16 GB" chạy Windows thường báo khoảng 15,7–15,9 GiB; card RTX 4050 "6 GB" báo heap `DEVICE_LOCAL` 6 128 MiB. Cấu hình staging: RAM khuyến nghị 15 360 MiB, RAM tối thiểu 7 168 MiB, VRAM gói Chuẩn 5 632 MiB; card dưới ngưỡng (kể cả 4 GB) và GPU tích hợp rơi về `fallback` là gói Nhẹ. Đổi bằng manifest khi có C6, C7.
- **QĐ5. TLS của hệ điều hành** (`native-tls`) cho manifest và model: nhận chứng chỉ gốc của proxy công ty (A7), không thêm thư viện C. Ghi cho 07: `tauri-plugin-updater` nên dùng cùng TLS (`native-tls`) để không kéo thêm `rustls` với `aws-lc`.
- **QĐ6. Thử lại.** Thử lại 3 lần khi lỗi mạng, lỗi HTTP hay sai SHA-256, chờ 1, 5, 15 giây (§9). Rớt mạng mà lần thử đó vẫn nhận thêm dữ liệu thì đếm lại từ đầu, để mạng chập chờn không làm bỏ cuộc giữa file 2 GB. Hết lượt thì giữ phần dở, người dùng bấm Tiếp tục.
- **QĐ7. File tạm tên theo SHA-256** (`<file>.<16 hex đầu>.part`): bản mới của một file không tải tiếp trên phần dở của bản cũ. Trạng thái băm giữ qua các lần thử, nên rớt mạng không phải băm lại phần đã có.
- **QĐ8. Máy chưa được hỗ trợ** (RAM dưới `min_ram_mib`, x64 không có AVX2, Đ13): app báo rõ nhưng vẫn cho chọn và tải gói. AVX2 kiểm trong app (bản build cần nó), không qua manifest.
- **QĐ9. Kiểm manifest** khi app khởi động (luồng nền) và khi mở bước 2 hay Cài đặt › Model, cùng một luật: chưa có manifest nào, hoặc đã quá 24 giờ từ lần kiểm thành công gần nhất, hoặc giờ máy lùi về trước lần đó. Lỗi mạng không xóa bản đang có.
- **QĐ10. Khóa và URL theo loại bản.** Bản dev (`tauri::is_dev()`) chỉ nhận khối `staging` của `src-tauri/keys/manifest-public-keys.json` và URL staging (biến môi trường `AT_MODELS_URL` đè được, cho phép `http` tới `127.0.0.1`); bản phát hành chỉ nhận khối `production` và `PRODUCTION_URL`. Lúc lập kế hoạch cả hai khối khóa rỗng và cả hai URL là `None`: 04b Task 13 (người) thêm khóa và URL staging; 07 thêm khóa và URL production. Khóa riêng staging là file JWK quyền 0600 ngoài repo, kid `stg-…` (Đ8); script từ chối đường dẫn trong repo và kid khác `stg-`.
- **QĐ11. Bản dev chưa tải gói nào qua manifest** thì vẫn chạy bằng file của Giai đoạn 0 trong `models/` của repo như 02 (04b Task 9).
- **QĐ12. NOTICE của sản phẩm.** Hy-MT2 không có file NOTICE; `scripts/models/NOTICE.txt` ghi nguồn, bản và giấy phép của từng model, và ghi rõ không sửa đổi. LICENSE của Whisper, whisper.cpp, Silero VAD lấy từ tag cố định khi dựng bucket (Task 13).
- **QĐ13 – QĐ19:** phần nối vào app, ở mục "Quyết định" của 04b.

## Điểm cần chủ dự án quyết

1. **Ngưỡng đề xuất gói** (QĐ4): 15 360 / 7 168 / 5 632 MiB đang theo suy luận, chờ C6, C7. Đổi bằng manifest, không cần sửa app. Ghi chú chất lượng của hai gói (`scripts/models/models.config.json`) cũng cần chủ dự án duyệt chữ.
2. **Đang tải bản cập nhật của gói đang dùng thì không bắt đầu phiên được** (04b QĐ15). Phương án khác: cho dịch tiếp bằng bản cũ, chỉ thay file khi phiên dừng (phức tạp hơn, nhất là trên Windows vì file đang mở không đổi tên được).
3. **Máy chưa được hỗ trợ vẫn cho tải** (QĐ8). Phương án khác: chặn ở bước 2.
4. **"Xóa model và dữ liệu" không đưa app về lần đầu mở** (04b QĐ18): sau khi xóa, app vẫn ở màn hình chính, nút Bắt đầu báo chưa có model kèm nút mở Cài đặt › Model.
5. **Tên file kế hoạch.** Đ1 của kế hoạch 00 giữ tiền tố `2026-10-01` cho mọi kế hoạch; theo yêu cầu của controller, 04 dùng tiền tố `2026-10-02`. Task 15 sửa tên file trong bảng mục 2 của kế hoạch 00.
6. **Q17** (bản sao khóa ký manifest production) vẫn phải quyết trước khi 07 tạo khóa production.

## File giao nhau với kế hoạch 03

03 và 04 viết cùng lúc trên `main` `45de838`; controller đề xuất làm 03 trước. Các file 04 sửa mà 03 có thể cũng sửa (khối `diff` trong kế hoạch này lấy ít ngữ cảnh, một dòng, cho các file này để dễ áp lại):

| File | 04 sửa gì | Ở task |
|---|---|---|
| `Cargo.lock`, `src-tauri/Cargo.toml` | thêm `base64`, `ed25519-dalek`, `reqwest`, `libc`; thêm 2 feature của `windows` | 1, 2, 5 |
| `src-tauri/src/lib.rs` | `pub mod models;`; quản lý `ModelService` trong `setup` | 1, 8 |
| `src-tauri/src/settings/mod.rs`, `settings/patch.rs` | `model_tier: Option<String>`, kiểm mã gói; `modelTier` chỉ đọc | 7 |
| `src-tauri/src/session.rs` | kiểu `tier`; `release_models`, `pipeline_config` của `SessionDeps`; `engine_config` nhận `PipelineConfig`; băm lại khi model hỏng; giữ gói cũ trong lúc dịch | 7, 8, 9 |
| `src-tauri/src/commands.rs`, `build.rs`, `capabilities/main.json` | 8 lệnh mới của cửa sổ `main` | 8 |
| `src-tauri/src/errors.rs` | 11 mã lỗi `models…` | 8 |
| `src-tauri/src/actions.rs` | `commit_settings` thành `pub(crate)`; thêm `set_model_tier` | 8 |
| `src-tauri/src/test_support.rs` | `mock_app_full`, `models_config`, quản lý `ModelService` trong app giả | 8 |
| `src/i18n/en.ts`, `src/i18n/vi.ts` | khối `models.*` sau dòng `"onboarding.download.title"`; khối `error.models*` sau dòng `"error.modelBroken"` | 8, 10 |
| `src/lib/ipc.ts` | `ModelTier = string`; `SettingsPatch` bỏ `modelTier`; 8 lệnh, sự kiện `models://state` | 7, 10 |
| `src/windows/main/main.tsx` | khởi tạo store model | 11 |
| `src/windows/main/onboarding/Onboarding.tsx` | thân bước `model`, `download` | 11 |
| `src/windows/main/screens/SettingsScreen.tsx` | nhóm `model`; nút "Xóa model và dữ liệu" ở nhóm `privacy` | 11 |
| `src/windows/main/screens/Home.tsx` | lời mời cập nhật, tiến độ tải, nút mở Cài đặt › Model | 11 |

Khi dựng lại 04 trên `main` đã có 03:
- Khối `diff` lệch chỉ vì 03 thêm dòng bên cạnh: áp bằng `git apply --3way`, rồi giữ cả phần của 03 lẫn phần của 04.
- `commands.rs`, `build.rs`, `capabilities/main.json`: danh sách lệnh là hợp của hai kế hoạch; test `acl_tests::capabilities_grant_exactly_the_fixed_lists` giữ ba chỗ khớp nhau.
- Nhóm Quyền riêng tư (`SettingsScreen.tsx`): 03 làm nội dung nhóm; đặt `<DeleteModelsAndData />` của 04 dưới nút "Xóa toàn bộ dữ liệu" của 03, và bỏ thẻ mô tả "chưa có" nếu 03 đã bỏ.
- `models/commands.rs::wipe_user_data` (04b Task 8): thay thân hàm bằng lời gọi hàm xóa lịch sử và từ điển của 03 (cùng việc với nút "Xóa toàn bộ dữ liệu" của 03), và thêm vào test `deleting_packs_and_everything` một kiểm tra lịch sử đã bị xóa.
- `test_support.rs`: nếu 03 cũng thêm trạng thái vào `mock_app_with`, gộp cả hai vào `mock_app_full`.
- `session.rs`: 03 có thể đổi `TauriSink` hay thêm `SessionDeps` cho bước "Nghe thử"; phần 04 chỉ thêm hai phương thức mặc định (`release_models`, `pipeline_config`) và sửa `prepare` của `LiveDeps`, `engine_config`, `start_failed`, `fail`.
- Số test trong Expected tăng theo số test của 03; số của lệnh có bộ lọc `models::` không đổi.

## Kiểm bằng mutation lúc lập kế hoạch

Script ngoài repo (`meeting-translator-work/p04-mut/mut.py`), chạy trên cây cuối của 04: mỗi mutation sửa một chỗ, chạy test lọc theo module, rồi trả code về. Hai mutation còn sống ở lượt đầu đã có test mới: D2 (bỏ kiểm `Content-Range`, thêm test `a_partial_response_at_the_wrong_offset_restarts` và lỗi giả `WrongRange`) và T3 (`verify_pack` không bỏ file hỏng khỏi `installed.json`, thêm kiểm `installed()`). Kết quả lượt cuối (`bị giết`: có test đỏ):

```text
S1 bỏ kiểm chữ ký: bị giết (test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 217 filtered out; finished in 0.01s)
S2 ký không tiền tố: bị giết (test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 217 filtered out; finished in 0.01s)
S3 nhận khóa lạ trong phong bì: bị giết (test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 217 filtered out; finished in 0.01s)
F1 bỏ kiểm sha256 hex: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.01s)
F2 cho url http: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.01s)
F3 cho tên file có ..: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.00s)
D1 không gửi Range: bị giết (test result: FAILED. 8 passed; 5 failed; 0 ignored; 0 measured; 208 filtered out; finished in 0.18s)
D2 bỏ kiểm Content-Range: bị giết (test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 208 filtered out; finished in 0.14s)
D3 bỏ so SHA-256: bị giết (test result: FAILED. 11 passed; 2 failed; 0 ignored; 0 measured; 208 filtered out; finished in 0.08s)
D4 tiến độ đếm lại với mọi lỗi: bị giết (test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 208 filtered out; finished in 0.16s)
D5 thử lại 2 lần: bị giết (test result: FAILED. 10 passed; 3 failed; 0 ignored; 0 measured; 208 filtered out; finished in 0.13s)
D6 không chặn gửi quá: bị giết (test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 208 filtered out; finished in 0.15s)
D7 200 không ghi lại từ đầu: bị giết (test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 208 filtered out; finished in 0.17s)
T1 resolve bỏ kiểm kích thước: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.72s)
T2 xóa gói không giữ file dùng chung: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.56s)
T3 verify_pack không xóa khỏi danh sách: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.20s)
T4 cập nhật vẫn tính complete: bị giết (test result: FAILED. 56 passed; 2 failed; 0 ignored; 0 measured; 163 filtered out; finished in 1.12s)
R1 bỏ ngưỡng VRAM: bị giết (test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 217 filtered out; finished in 0.00s)
R2 bỏ kiểm AVX2: bị giết (test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 217 filtered out; finished in 0.00s)
R3 GPU tích hợp cũng tính: bị giết (test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 217 filtered out; finished in 0.00s)
C1 kiểm manifest mỗi lần: bị giết (test result: FAILED. 56 passed; 2 failed; 0 ignored; 0 measured; 163 filtered out; finished in 1.17s)
C2 nhận manifest cũ hơn: bị giết (test result: FAILED. 56 passed; 2 failed; 0 ignored; 0 measured; 163 filtered out; finished in 0.88s)
C3 http tới máy khác: bị giết (test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 216 filtered out; finished in 0.03s)
V1 bỏ kiểm dung lượng trống: bị giết (test result: FAILED. 13 passed; 1 failed; 0 ignored; 0 measured; 207 filtered out; finished in 0.54s)
V2 Để sau không nhớ: bị giết (test result: FAILED. 13 passed; 1 failed; 0 ignored; 0 measured; 207 filtered out; finished in 0.74s)
V3 cập nhật đè gói đang dịch: bị giết (test result: FAILED. 13 passed; 1 failed; 0 ignored; 0 measured; 207 filtered out; finished in 1.00s)
V4 tải xong không chọn gói: bị giết (test result: FAILED. 7 passed; 7 failed; 0 ignored; 0 measured; 207 filtered out; finished in 10.35s)
V5 xóa hết không bỏ gói: bị giết (test result: FAILED. 13 passed; 1 failed; 0 ignored; 0 measured; 207 filtered out; finished in 0.68s)
V6 lỗi tải manifest xóa bản cũ: bị giết (test result: FAILED. 13 passed; 1 failed; 0 ignored; 0 measured; 207 filtered out; finished in 0.92s)
P1 đổi gói giữa phiên: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.01s)
P2 không băm lại khi model hỏng: bị giết (test result: FAILED. 13 passed; 1 failed; 0 ignored; 0 measured; 207 filtered out; finished in 10.36s)
P3 ngưỡng manifest bị bỏ: bị giết (test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 213 filtered out; finished in 0.01s)
G1 modelTier sửa được qua update_settings: bị giết (test result: FAILED. 13 passed; 1 failed; 0 ignored; 0 measured; 207 filtered out; finished in 0.57s)
G2 bỏ kiểm mã gói: bị giết (test result: FAILED. 33 passed; 1 failed; 0 ignored; 0 measured; 187 filtered out; finished in 0.02s)
```

---

## Task 1: Manifest model: kiểu và kiểm phần thân

Dòng 5, 6, 157, 291, 318, 338; QĐ2:
- `src-tauri/src/models/manifest.rs`: kiểu của phần thân (`Manifest`, `FileEntry`, `Pack`, `Recommend`, `Rule`), đọc và kiểm từng trường, trả tên trường sai đầu tiên; file của một gói, dung lượng gói, gói cần app mới hơn (`min_app_version`), ngưỡng của pipeline theo manifest.
- Test dùng manifest mẫu `sample()` (hai gói, VAD và giấy phép dùng chung); test của các task sau dùng lại mẫu này.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `src-tauri/Cargo.toml`
- Sửa: `src-tauri/src/lib.rs`
- Tạo: `src-tauri/src/models/mod.rs`
- Tạo: `src-tauri/src/models/manifest.rs`

- [ ] **Step 1: Kiểm đĩa, khai báo phụ thuộc và module**

Run: `df -h / | tail -1`

Expected: cột trống (Avail) từ 6 GiB trở lên; ít hơn thì dừng và báo.

`manifest.rs` dùng `reqwest::Url` để kiểm URL tuyệt đối; app bật luôn các feature mà Task 3 cần (TLS của hệ điều hành, proxy hệ thống, QĐ5).

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -22,2 +22,4 @@ log = "0.4.34"
 pipeline = { path = "../crates/pipeline" }
+# Tải manifest và model (spec §6.7): TLS của hệ điều hành (Security.framework, SChannel), proxy của hệ thống.
+reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "native-tls", "system-proxy"] }
 rtrb.workspace = true
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -18,2 +18,3 @@ pub mod logging;
 pub mod login_item;
+pub mod models;
 pub mod navigation;
```

Tạo `src-tauri/src/models/mod.rs`:

```rust
//! Quản lý model (spec F6, §6.7, kế hoạch 04): manifest ký Ed25519, tải tiếp được khi rớt mạng, kiểm SHA-256, đề
//! xuất gói theo máy, xóa model.

pub mod manifest;
```

- [ ] **Step 2: Viết test**

Tạo `src-tauri/src/models/manifest.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Phần thân của manifest model `models.json` (spec §6.7; Đ7 của kế hoạch 00): file model, gói, ngưỡng đề xuất gói theo
//! máy, và ngưỡng của pipeline muốn đổi. File trên R2 là một phong bì ký Ed25519 ([`super::signed`]); file này chỉ đọc
//! phần thân sau khi chữ ký đã đúng.
//!
//! - Mỗi file có các trường của §6.7: `id`, `tier` (danh sách gói có file này: VAD và giấy phép dùng chung), `kind`
//!   (`asr`, `mt`, `vad`, và `license` cho LICENSE, NOTICE đặt cạnh model), `version`, `url`, `bytes`, `sha256`,
//!   `license_id`, `min_app_version`; thêm `file` là tên file trên máy.
//! - Gói (`packs`) có tên và ghi chú chất lượng theo hai ngôn ngữ giao diện (§8), vì gói mới (ví dụ gói lai, Q15) thêm
//!   bằng manifest, không phát hành lại app. Mỗi gói có đúng một file `asr`, một `mt`, một `vad`.
//! - `recommend`: RAM tối thiểu và luật đề xuất gói, xét theo thứ tự, luật đầu tiên khớp thắng; không luật nào khớp thì
//!   dùng `fallback` (§8, Đ7).
//! - `pipeline`: các ngưỡng của `PipelineConfig` muốn đổi (02a QĐ21). Sai thì giữ mặc định, manifest vẫn dùng được.
//!
//! Khóa lạ trong phần thân bị bỏ qua (manifest mới hơn app); khóa thiếu là lỗi.

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::{Value, json};

    /// Manifest mẫu hợp lệ: hai gói, VAD và giấy phép dùng chung. Test của module khác dùng lại.
    pub(crate) fn sample() -> Value {
        let file = |id: &str, tier: &[&str], kind: &str, name: &str, bytes: u64| {
            json!({
                "id": id, "tier": tier, "kind": kind, "version": "1", "file": name,
                "url": format!("files/{name}"), "bytes": bytes, "sha256": "ab".repeat(32),
                "license_id": "MIT", "min_app_version": "0.1.0"
            })
        };
        json!({
            "schema": 1,
            "sequence": 3,
            "published_at": "2026-10-02T00:00:00Z",
            "files": [
                file("whisper-turbo", &["standard"], "asr", "ggml-large-v3-turbo-q5_0.bin", 500),
                file("whisper-small", &["lite"], "asr", "ggml-small-q5_1.bin", 200),
                file("hy-mt2-q8", &["standard"], "mt", "Hy-MT2-1.8B-Q8_0.gguf", 1900),
                file("hy-mt2-q4", &["lite"], "mt", "Hy-MT2-1.8B-Q4_K_M.gguf", 1100),
                file("silero-vad", &["standard", "lite"], "vad", "silero_vad_v6.2.3.onnx", 20),
                file("hy-mt2-license", &["standard", "lite"], "license", "Hy-MT2-LICENSE.txt", 10),
            ],
            "packs": [
                { "id": "standard", "name": { "vi": "Chuẩn", "en": "Standard" },
                  "note": { "vi": "Chép lời tốt nhất.", "en": "Best transcription." } },
                { "id": "lite", "name": { "vi": "Nhẹ", "en": "Lite" },
                  "note": { "vi": "Kém hơn với tiếng Việt.", "en": "Weaker for Vietnamese." } }
            ],
            "recommend": {
                "min_ram_mib": 7000,
                "rules": [
                    { "pack": "standard", "os": "macos", "min_ram_mib": 15000 },
                    { "pack": "standard", "os": "windows", "min_ram_mib": 15000,
                      "gpu": "discrete", "min_vram_mib": 5600 }
                ],
                "fallback": "lite"
            }
        })
    }

    fn parse(value: &Value) -> Result<Manifest, Invalid> {
        Manifest::parse(&serde_json::to_vec(value).unwrap())
    }

    fn rejects(change: impl FnOnce(&mut Value), field: &str) {
        let mut value = sample();
        change(&mut value);
        assert_eq!(parse(&value).map(|_| ()), Err(Invalid(field.into())), "{field}");
    }

    #[test]
    fn the_sample_lists_the_files_of_each_pack() {
        let m = parse(&sample()).unwrap();
        let ids = |pack: &str| m.files_of(pack).iter().map(|f| f.id.clone()).collect::<Vec<_>>();
        assert_eq!(
            ids("standard"),
            ["whisper-turbo", "hy-mt2-q8", "silero-vad", "hy-mt2-license"]
        );
        assert_eq!(
            ids("lite"),
            ["whisper-small", "hy-mt2-q4", "silero-vad", "hy-mt2-license"]
        );
        assert_eq!(m.pack_bytes("standard"), 500 + 1900 + 20 + 10);
        assert_eq!(m.pack("lite").unwrap().name.vi, "Nhẹ");
        assert!(m.pack("hybrid").is_none());
    }

    #[test]
    fn unknown_keys_are_ignored_and_missing_keys_rejected() {
        let mut value = sample();
        value["future"] = json!({ "x": 1 });
        value["files"][0]["future"] = json!(true);
        assert!(parse(&value).is_ok());
        let mut value = sample();
        value["files"][0].as_object_mut().unwrap().remove("sha256");
        assert!(matches!(parse(&value), Err(Invalid(e)) if e.starts_with("json:")));
    }

    #[test]
    fn rejects_bad_files() {
        rejects(|v| v["schema"] = json!(2), "schema");
        rejects(|v| v["files"][1]["id"] = json!("whisper-turbo"), "files[1].id");
        rejects(|v| v["files"][0]["id"] = json!("Whisper"), "files[0].id");
        rejects(|v| v["files"][0]["tier"] = json!([]), "files[0].tier");
        rejects(|v| v["files"][0]["tier"] = json!(["hybrid"]), "files[0].tier");
        rejects(|v| v["files"][0]["version"] = json!(""), "files[0].version");
        for name in ["../x.bin", ".hidden", "a/b.bin", "a\\b.bin", "x.bin.part", ""] {
            rejects(|v| v["files"][0]["file"] = json!(name), "files[0].file");
        }
        rejects(
            |v| v["files"][1]["file"] = json!("ggml-large-v3-turbo-q5_0.bin"),
            "files[1].file",
        );
        for url in [
            "http://cdn.example/x.bin",
            "files/../x.bin",
            "/x.bin",
            "files//x.bin",
            "files/a b.bin",
        ] {
            rejects(|v| v["files"][0]["url"] = json!(url), "files[0].url");
        }
        rejects(|v| v["files"][0]["bytes"] = json!(0), "files[0].bytes");
        rejects(|v| v["files"][0]["bytes"] = json!(MAX_FILE_BYTES + 1), "files[0].bytes");
        rejects(|v| v["files"][0]["sha256"] = json!("AB".repeat(32)), "files[0].sha256");
        rejects(|v| v["files"][0]["sha256"] = json!("ab".repeat(31)), "files[0].sha256");
        rejects(|v| v["files"][0]["license_id"] = json!(" "), "files[0].license_id");
        rejects(
            |v| v["files"][0]["min_app_version"] = json!("1.0"),
            "files[0].min_app_version",
        );
    }

    #[test]
    fn rejects_bad_packs_and_rules() {
        rejects(|v| v["packs"] = json!([]), "packs");
        rejects(|v| v["packs"][1]["id"] = json!("standard"), "packs[1].id");
        rejects(|v| v["packs"][0]["note"]["en"] = json!(""), "packs[0].note.en");
        rejects(
            |v| v["packs"][0]["name"]["vi"] = json!("x".repeat(501)),
            "packs[0].name.vi",
        );
        // Gói Nhẹ thiếu VAD; gói Chuẩn có hai file nhận dạng.
        rejects(|v| v["files"][4]["tier"] = json!(["standard"]), "packs[1].files");
        rejects(
            |v| v["files"][1]["tier"] = json!(["lite", "standard"]),
            "packs[0].files",
        );
        rejects(|v| v["recommend"]["min_ram_mib"] = json!(0), "recommend.min_ram_mib");
        rejects(
            |v| v["recommend"]["rules"][0]["pack"] = json!("hybrid"),
            "recommend.rules[0].pack",
        );
        rejects(
            |v| {
                v["recommend"]["rules"][1].as_object_mut().unwrap().remove("gpu");
            },
            "recommend.rules[1].gpu",
        );
        rejects(|v| v["recommend"]["fallback"] = json!("hybrid"), "recommend.fallback");
    }

    #[test]
    fn absolute_https_urls_are_allowed() {
        let mut value = sample();
        value["files"][0]["url"] = json!("https://models.example/whisper/x.bin");
        assert!(parse(&value).is_ok());
    }

    #[test]
    fn a_pack_needs_a_new_enough_app() {
        let mut value = sample();
        value["files"][1]["min_app_version"] = json!("0.2.0");
        let m = parse(&value).unwrap();
        assert!(m.usable_by("standard", "0.1.0"));
        assert!(!m.usable_by("lite", "0.1.0"));
        assert!(m.usable_by("lite", "0.2.0"));
        assert!(m.usable_by("lite", "1.0.0-beta.1"));
        assert!(!m.usable_by("hybrid", "9.9.9"));
    }

    #[test]
    fn versions_compare_by_number() {
        assert_eq!(version("0.10.2"), Some((0, 10, 2)));
        assert_eq!(version("1.2.3-beta.4+build"), Some((1, 2, 3)));
        assert!(version("0.10.2") > version("0.9.9"));
        for bad in ["1.2", "1.2.3.4", "a.b.c", "", "1..2"] {
            assert_eq!(version(bad), None, "{bad}");
        }
    }

    /// Dòng 338 của bảng đối chiếu: ngưỡng của pipeline đổi được bằng manifest; giá trị vô lý thì giữ mặc định.
    #[test]
    fn pipeline_thresholds_come_from_the_manifest_when_sane() {
        let m = parse(&sample()).unwrap();
        assert_eq!(m.pipeline_config(), PipelineConfig::default());
        let mut value = sample();
        value["pipeline"] = json!({ "queue": { "lag_warn_ms": 8000 } });
        assert_eq!(parse(&value).unwrap().pipeline_config().queue.lag_warn_ms, 8_000);
        value["pipeline"] = json!({ "filter": { "no_speech_prob_max": 1.5 } });
        assert_eq!(parse(&value).unwrap().pipeline_config(), PipelineConfig::default());
        value["pipeline"] = json!({ "queue": { "lag_warn_ms": "nhiều" } });
        assert_eq!(parse(&value).unwrap().pipeline_config(), PipelineConfig::default());
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib models::manifest 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 14 previous errors; 1 warning emitted
error[E0425]: cannot find function `version` in this scope
error[E0425]: cannot find function, tuple struct or tuple variant `Invalid` in this scope
error[E0425]: cannot find type `Invalid` in this scope
error[E0425]: cannot find type `Manifest` in this scope
error[E0425]: cannot find value `MAX_FILE_BYTES` in this scope
error[E0433]: cannot find type `Manifest` in this scope
error[E0433]: cannot find type `PipelineConfig` in this scope
```

- [ ] **Step 4: Viết code**

Thêm vào `src-tauri/src/models/manifest.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use pipeline::config::PipelineConfig;
use serde::{Deserialize, Serialize};

/// Phiên bản định dạng phần thân mà app này đọc được.
pub const SCHEMA: u32 = 1;
/// Một file model không lớn hơn chừng này (Q8_0 là 1,91 GB).
pub const MAX_FILE_BYTES: u64 = 16 << 30;
const MAX_TEXT: usize = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Asr,
    Mt,
    Vad,
    License,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    pub id: String,
    /// Các gói có file này.
    pub tier: Vec<String>,
    pub kind: Kind,
    pub version: String,
    /// Tên file trong thư mục model.
    pub file: String,
    /// Đường dẫn tương đối so với URL của manifest, hoặc URL `https://` đầy đủ.
    pub url: String,
    pub bytes: u64,
    /// SHA-256 dạng hex chữ thường.
    pub sha256: String,
    pub license_id: String,
    pub min_app_version: String,
}

/// Chữ theo ngôn ngữ giao diện (§4.5).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Localized {
    pub vi: String,
    pub en: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pack {
    pub id: String,
    pub name: Localized,
    /// Ghi chú chất lượng khi chọn gói (§8).
    pub note: Localized,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Windows,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuKind {
    /// Card rời (`VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU`). GPU tích hợp chưa được tính (§6.7).
    Discrete,
}

/// Một luật đề xuất gói. Điều kiện bỏ trống thì không xét.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rule {
    pub pack: String,
    #[serde(default)]
    pub os: Option<Os>,
    #[serde(default)]
    pub min_ram_mib: Option<u64>,
    #[serde(default)]
    pub gpu: Option<GpuKind>,
    /// Heap `DEVICE_LOCAL` lớn nhất của card (theo `--probe`), tính bằng MiB.
    #[serde(default)]
    pub min_vram_mib: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Recommend {
    /// Máy có ít RAM hơn thì chưa được hỗ trợ (§8).
    pub min_ram_mib: u64,
    pub rules: Vec<Rule>,
    pub fallback: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    pub schema: u32,
    /// Tăng mỗi lần phát hành manifest; app không nhận manifest có số nhỏ hơn bản đã nhận (chống quay lui).
    pub sequence: u64,
    pub published_at: String,
    pub files: Vec<FileEntry>,
    pub packs: Vec<Pack>,
    pub recommend: Recommend,
    #[serde(default)]
    pub pipeline: Option<serde_json::Value>,
}

/// Trường đầu tiên không hợp lệ, dạng `files[2].sha256`.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[error("manifest: `{0}` không hợp lệ")]
pub struct Invalid(pub String);

/// Phiên bản `x.y.z` (bỏ phần sau dấu `-` hay `+`).
pub fn version(text: &str) -> Option<(u64, u64, u64)> {
    let core = text.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let v = (next()?, next()?, next()?);
    parts.next().is_none().then_some(v)
}

/// Mã gói hay mã file: chữ thường, số, `.`, `_`, `-`; bắt đầu bằng chữ hoặc số.
pub fn is_id(text: &str, max: usize) -> bool {
    let mut chars = text.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && text.len() <= max
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
}

/// Tên file an toàn trong thư mục model: không có thư mục con, không bắt đầu bằng `.`, không đuôi `.part`.
pub fn is_safe_file_name(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && name.len() <= 128
        && !name.ends_with(".part")
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn is_sha256(text: &str) -> bool {
    text.len() == 64 && text.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

/// URL tương đối (các đoạn an toàn, không `.` hay `..`), hoặc `https://` đầy đủ.
fn is_model_url(url: &str) -> bool {
    if url.contains("://") {
        return url.starts_with("https://") && reqwest::Url::parse(url).is_ok();
    }
    !url.is_empty()
        && url.len() <= 512
        && url.split('/').all(|seg| {
            !seg.is_empty()
                && seg != "."
                && seg != ".."
                && seg
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        })
}

fn is_text(text: &str) -> bool {
    !text.trim().is_empty() && text.chars().count() <= MAX_TEXT
}

impl Manifest {
    /// Đọc và kiểm phần thân (đã kiểm chữ ký).
    pub fn parse(body: &[u8]) -> Result<Self, Invalid> {
        let manifest: Manifest = serde_json::from_slice(body).map_err(|e| Invalid(format!("json: {e}")))?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), Invalid> {
        let bad = |field: String| Err(Invalid(field));
        if self.schema != SCHEMA {
            return bad("schema".into());
        }
        if self.packs.is_empty() {
            return bad("packs".into());
        }
        for (i, pack) in self.packs.iter().enumerate() {
            if !is_id(&pack.id, 32) || self.packs[..i].iter().any(|p| p.id == pack.id) {
                return bad(format!("packs[{i}].id"));
            }
            for (field, text) in [
                ("name.vi", &pack.name.vi),
                ("name.en", &pack.name.en),
                ("note.vi", &pack.note.vi),
                ("note.en", &pack.note.en),
            ] {
                if !is_text(text) {
                    return bad(format!("packs[{i}].{field}"));
                }
            }
        }
        if self.files.is_empty() {
            return bad("files".into());
        }
        for (i, f) in self.files.iter().enumerate() {
            let at = |field: &str| format!("files[{i}].{field}");
            let earlier = &self.files[..i];
            if !is_id(&f.id, 64) || earlier.iter().any(|e| e.id == f.id) {
                return bad(at("id"));
            }
            if f.tier.is_empty() || f.tier.iter().any(|t| self.pack(t).is_none()) {
                return bad(at("tier"));
            }
            if f.version.is_empty() || f.version.len() > 32 {
                return bad(at("version"));
            }
            if !is_safe_file_name(&f.file) || earlier.iter().any(|e| e.file == f.file) {
                return bad(at("file"));
            }
            if !is_model_url(&f.url) {
                return bad(at("url"));
            }
            if f.bytes == 0 || f.bytes > MAX_FILE_BYTES {
                return bad(at("bytes"));
            }
            if !is_sha256(&f.sha256) {
                return bad(at("sha256"));
            }
            if f.license_id.trim().is_empty() || f.license_id.len() > 64 {
                return bad(at("license_id"));
            }
            if version(&f.min_app_version).is_none() {
                return bad(at("min_app_version"));
            }
        }
        for (i, pack) in self.packs.iter().enumerate() {
            for kind in [Kind::Asr, Kind::Mt, Kind::Vad] {
                if self.files_of(&pack.id).iter().filter(|f| f.kind == kind).count() != 1 {
                    return bad(format!("packs[{i}].files"));
                }
            }
        }
        let r = &self.recommend;
        if r.min_ram_mib == 0 {
            return bad("recommend.min_ram_mib".into());
        }
        for (i, rule) in r.rules.iter().enumerate() {
            if self.pack(&rule.pack).is_none() {
                return bad(format!("recommend.rules[{i}].pack"));
            }
            if rule.min_vram_mib.is_some() && rule.gpu.is_none() {
                return bad(format!("recommend.rules[{i}].gpu"));
            }
        }
        if self.pack(&r.fallback).is_none() {
            return bad("recommend.fallback".into());
        }
        Ok(())
    }

    pub fn pack(&self, id: &str) -> Option<&Pack> {
        self.packs.iter().find(|p| p.id == id)
    }

    /// Các file của một gói, theo thứ tự trong manifest.
    pub fn files_of(&self, pack: &str) -> Vec<&FileEntry> {
        self.files.iter().filter(|f| f.tier.iter().any(|t| t == pack)).collect()
    }

    pub fn pack_bytes(&self, pack: &str) -> u64 {
        self.files_of(pack).iter().map(|f| f.bytes).sum()
    }

    /// Mọi file của gói đều chạy được với app bản `app_version` (`min_app_version`).
    pub fn usable_by(&self, pack: &str, app_version: &str) -> bool {
        let Some(app) = version(app_version) else {
            return false;
        };
        let files = self.files_of(pack);
        !files.is_empty()
            && files
                .iter()
                .all(|f| version(&f.min_app_version).is_some_and(|min| min <= app))
    }

    /// Ngưỡng của pipeline: mặc định, đè bằng phần `pipeline` của manifest nếu đọc được và hợp lệ.
    pub fn pipeline_config(&self) -> PipelineConfig {
        let Some(value) = &self.pipeline else {
            return PipelineConfig::default();
        };
        match serde_json::from_value::<PipelineConfig>(value.clone()) {
            Ok(config) => match config.validate() {
                Ok(()) => config,
                Err(field) => {
                    log::warn!("manifest: ngưỡng pipeline `{field}` vô lý, dùng mặc định");
                    PipelineConfig::default()
                }
            },
            Err(e) => {
                log::warn!("manifest: không đọc được phần pipeline ({e}), dùng mặc định");
                PipelineConfig::default()
            }
        }
    }
}
```

- [ ] **Step 5: Chạy test**

Run: `cargo test -p meeting-translator --lib models::manifest 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 160 filtered out; finished in 0.01s
```

- [ ] **Step 6: Định dạng, clippy, cargo deny**

Run:

```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -E '^(warning|error)' ; cargo deny check 2>&1 | tail -1
```

Expected:

```text
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/models/mod.rs src-tauri/src/models/manifest.rs
git commit -q -m "feat(models): manifest model, kiểu và kiểm phần thân (04 T1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Chữ ký Ed25519, khóa build sẵn, bộ vector và script ký staging

Dòng 107, 157, 158, 162, 224, 228, 258; QĐ1, QĐ10, QĐ12; Đ8:
- `src-tauri/src/models/signed.rs`: đọc phong bì, kiểm chữ ký bằng khóa công khai build sẵn (`src-tauri/keys/manifest-public-keys.json`, khối theo loại bản), rồi kiểm phần thân.
- `scripts/models/`: thư viện chung (`lib.mjs`), sinh bộ vector (`gen-manifest-vectors.mjs`), tạo khóa staging (`gen-manifest-key.mjs`), dựng phần thân từ file thật (`build-manifest.mjs` + `models.config.json`), ký (`sign-manifest.mjs`), `NOTICE.txt`, và test `node --test`.
- Bộ vector `src-tauri/src/models/testdata/manifest-vectors.json` do script Node sinh, Rust kiểm: hai bên dùng cùng định dạng. Khóa trong bộ vector là khóa test sinh từ nhãn cố định, kid `test-…`, không bao giờ có trong file khóa của app.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `src-tauri/Cargo.toml`
- Sửa: `src-tauri/src/models/mod.rs`
- Tạo: `src-tauri/keys/manifest-public-keys.json`
- Tạo: `src-tauri/src/models/signed.rs`
- Tạo: `src-tauri/src/models/testdata/manifest-vectors.json` (script sinh)
- Tạo: `scripts/models/lib.mjs`, `scripts/models/gen-manifest-vectors.mjs`, `scripts/models/manifest.test.mjs`, `scripts/models/gen-manifest-key.mjs`, `scripts/models/build-manifest.mjs`, `scripts/models/sign-manifest.mjs`, `scripts/models/models.config.json`, `scripts/models/NOTICE.txt`

- [ ] **Step 1: Phụ thuộc, module, file khóa công khai**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -19,2 +19,5 @@ anyhow.workspace = true
 audio-capture = { path = "../crates/audio-capture" }
+# Manifest model (spec §6.7): base64url của phong bì, kiểm chữ ký Ed25519 bằng khóa công khai build sẵn.
+base64 = "0.23.1"
+ed25519-dalek = { version = "3.0.0", default-features = false }
 keyring-core = "1.0.0"
```

Sửa `src-tauri/src/models/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/mod.rs
+++ b/src-tauri/src/models/mod.rs
@@ -3,2 +3,3 @@
 
 pub mod manifest;
+pub mod signed;
```

Hai khối khóa rỗng lúc này: bản dev nhận khóa staging sau Task 13 (người), bản phát hành nhận khóa production ở kế hoạch 07.

Tạo `src-tauri/keys/manifest-public-keys.json`:

```json
{
  "_note": "Khóa công khai kiểm manifest model (spec §6.7, §10.2; kế hoạch 04). Bản dev nhận khối staging, bản phát hành chỉ nhận production. Không bao giờ có khóa riêng (d) ở đây. Thêm khóa: scripts/models/gen-manifest-key.mjs.",
  "staging": [],
  "production": []
}
```

- [ ] **Step 2: Thư viện ký và bộ vector**

Tạo `scripts/models/lib.mjs`:

```js
// Phần dùng chung của các script manifest model (spec §6.7, §10.2; kế hoạch 04). Định dạng phong bì phải khớp
// `src-tauri/src/models/signed.rs`:
//   { "format": "ai-translator-models", "version": 1, "kid", "body": base64url(JSON phần thân), "sig" }
//   sig = Ed25519(CONTEXT + body), body là chuỗi base64url không đệm.
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const { subtle } = webcrypto;
export const FORMAT = "ai-translator-models";
export const VERSION = 1;
export const CONTEXT = "ai-translator-models.v1.";
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const KEYS_FILE = resolve(REPO, "src-tauri/keys/manifest-public-keys.json");
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export const b64url = (buf) => Buffer.from(buf).toString("base64url");
export const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

// Đường dẫn nằm trong repo không (khóa riêng không bao giờ được nằm trong repo).
export function insideRepo(path) {
  const rel = relative(REPO, resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// Khóa riêng từ JWK Ed25519 (`{ kty, crv, kid, d, x }`).
export async function importPrivateJwk(jwk) {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.d || !jwk.x || !jwk.kid) {
    throw new Error("Khóa không phải JWK Ed25519 có kid.");
  }
  const { kid: _kid, ...rest } = jwk;
  return subtle.importKey("jwk", rest, { name: "Ed25519" }, false, ["sign"]);
}

// Khóa test tất định từ một nhãn (chỉ cho bộ vector; kid luôn bắt đầu bằng "test-").
export async function testKey(kid, label) {
  const seed = createHash("sha256").update(label).digest();
  const privateKey = await subtle.importKey(
    "pkcs8",
    Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    { name: "Ed25519" },
    true,
    ["sign"],
  );
  const jwk = await subtle.exportKey("jwk", privateKey);
  return { kid, seed: b64url(seed), x: jwk.x, privateKey };
}

// Ký phần thân (chuỗi JSON hay Buffer) thành phong bì.
export async function signBody(privateKey, kid, body, { context = CONTEXT } = {}) {
  const bodyB64 = b64url(Buffer.isBuffer(body) ? body : Buffer.from(body));
  const sig = await subtle.sign({ name: "Ed25519" }, privateKey, Buffer.from(context + bodyB64));
  return { format: FORMAT, version: VERSION, kid, body: bodyB64, sig: b64url(sig) };
}

// Kiểm phong bì bằng khóa công khai `{ kid, x }`; trả phần thân đã đọc, hay ném lỗi.
export async function verifyEnvelope(envelope, keys) {
  const key = keys.find((k) => k.kid === envelope.kid);
  if (!key) throw new Error(`Không có khóa công khai cho kid ${envelope.kid}.`);
  const publicKey = await subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: key.x }, { name: "Ed25519" }, false, [
    "verify",
  ]);
  const ok = await subtle.verify(
    { name: "Ed25519" },
    publicKey,
    Buffer.from(envelope.sig, "base64url"),
    Buffer.from(CONTEXT + envelope.body),
  );
  if (!ok) throw new Error("Chữ ký không đúng.");
  return JSON.parse(Buffer.from(envelope.body, "base64url").toString("utf8"));
}

// Khóa công khai build sẵn vào app, của một môi trường (`staging` hay `production`).
export function builtInKeys(env, file = KEYS_FILE) {
  const all = JSON.parse(readFileSync(file, "utf8"));
  return all[env] ?? [];
}
```

Tạo `scripts/models/gen-manifest-vectors.mjs`:

```js
#!/usr/bin/env node
// Sinh bộ vector kiểm manifest model, dùng chung giữa script ký (Node) và app (Rust, `models/signed.rs`).
// Chạy lại cho ra đúng file cũ: Ed25519 là chữ ký tất định, khóa test sinh từ nhãn cố định.
// Khóa trong file này CHỈ để test; kid luôn bắt đầu bằng "test-" và không bao giờ có trong manifest-public-keys.json.
// Dùng: node scripts/models/gen-manifest-vectors.mjs > src-tauri/src/models/testdata/manifest-vectors.json
import { b64url, signBody, testKey } from "./lib.mjs";

const k1 = await testKey("test-m1", "ai-translator manifest test key 1");
const k2 = await testKey("test-m2", "ai-translator manifest test key 2");
const file = (id, tier, kind, name, bytes, sha) => ({
  id,
  tier,
  kind,
  version: "1",
  file: name,
  url: `models/${name}`,
  bytes,
  sha256: sha,
  license_id: kind === "license" || id.startsWith("hy-mt2") ? "Apache-2.0" : "MIT",
  min_app_version: "0.1.0",
});
const body = {
  schema: 1,
  sequence: 1,
  published_at: "2026-10-02T00:00:00Z",
  files: [
    file("whisper-turbo", ["standard"], "asr", "ggml-large-v3-turbo-q5_0.bin", 574041195, "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"),
    file("whisper-small", ["lite"], "asr", "ggml-small-q5_1.bin", 190085487, "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"),
    file("hy-mt2-q8", ["standard"], "mt", "Hy-MT2-1.8B-Q8_0.gguf", 1908528192, "5c3fe0b1408a5ceb0143184ef247b11b579c525f4b02b060e6c851bb76fef1a4"),
    file("hy-mt2-q4", ["lite"], "mt", "Hy-MT2-1.8B-Q4_K_M.gguf", 1133080448, "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699"),
    file("silero-vad", ["standard", "lite"], "vad", "silero_vad_v6.2.3.onnx", 2327524, "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"),
    file("hy-mt2-license", ["standard", "lite"], "license", "Hy-MT2-LICENSE.txt", 11639, "a1d52d448f81c584a47c583e19dfab2d3851c7c84431b07baee093c1113ed114"),
  ],
  packs: [
    { id: "standard", name: { vi: "Chuẩn", en: "Standard" }, note: { vi: "Chép lời tốt nhất.", en: "Best transcription." } },
    { id: "lite", name: { vi: "Nhẹ", en: "Lite" }, note: { vi: "Nhẹ hơn.", en: "Lighter." } },
  ],
  recommend: {
    min_ram_mib: 7000,
    rules: [{ pack: "standard", os: "macos", min_ram_mib: 15000 }],
    fallback: "lite",
  },
};
const json = JSON.stringify(body);
const valid = await signBody(k1.privateKey, "test-m1", json);
const tamperedJson = JSON.stringify({ ...body, sequence: 2 });
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Chữ ký 64 byte là 86 ký tự; ký tự cuối chỉ mang 2 bit, 4 bit còn lại phải bằng 0.
const last = valid.sig.at(-1);
const trailingBits = valid.sig.slice(0, -1) + B64URL[B64URL.indexOf(last) ^ 1];
const badSha = JSON.stringify({ ...body, files: body.files.map((f, i) => (i === 0 ? { ...f, sha256: f.sha256.toUpperCase() } : f)) });

const cases = [
  { name: "valid", manifest: valid, expect: "ok" },
  { name: "valid_second_key", manifest: await signBody(k2.privateKey, "test-m2", json), expect: "ok" },
  { name: "tampered_body", manifest: { ...valid, body: b64url(tamperedJson) }, expect: "bad_signature" },
  { name: "kid_signed_by_other_key", manifest: await signBody(k2.privateKey, "test-m1", json), expect: "bad_signature" },
  { name: "unknown_kid", manifest: await signBody(k1.privateKey, "test-m9", json), expect: "unknown_key" },
  { name: "signed_without_context", manifest: await signBody(k1.privateKey, "test-m1", json, { context: "" }), expect: "bad_signature" },
  { name: "signed_as_token", manifest: await signBody(k1.privateKey, "test-m1", json, { context: "v1." }), expect: "bad_signature" },
  { name: "body_with_padding", manifest: { ...valid, body: `${valid.body}==` }, expect: "malformed" },
  { name: "signature_trailing_bits", manifest: { ...valid, sig: trailingBits }, expect: "malformed" },
  { name: "unknown_envelope_field", manifest: { ...valid, note: "x" }, expect: "malformed" },
  { name: "wrong_format", manifest: { ...valid, format: "ai-translator-token" }, expect: "malformed" },
  { name: "version_2", manifest: { ...valid, version: 2 }, expect: "malformed" },
  { name: "kid_uppercase", manifest: { ...valid, kid: "TEST-M1" }, expect: "malformed" },
  { name: "bom", raw: `﻿${JSON.stringify(valid)}`, expect: "malformed" },
  { name: "invalid_body_signed", manifest: await signBody(k1.privateKey, "test-m1", badSha), expect: "invalid" },
  { name: "body_not_json_signed", manifest: await signBody(k1.privateKey, "test-m1", "not json"), expect: "invalid" },
];

process.stdout.write(
  `${JSON.stringify(
    {
      _note: "Vector kiểm manifest model (kế hoạch 04). Sinh bằng scripts/models/gen-manifest-vectors.mjs; không sửa tay. Khóa test-* chỉ để test.",
      keys: [k1, k2].map(({ kid, seed, x }) => ({ kid, x, seed })),
      cases,
    },
    null,
    2,
  )}\n`,
);
```

Run:

```bash
mkdir -p src-tauri/src/models/testdata
node scripts/models/gen-manifest-vectors.mjs > src-tauri/src/models/testdata/manifest-vectors.json
shasum -a 256 src-tauri/src/models/testdata/manifest-vectors.json
```

Expected (chạy lại cho ra đúng file: chữ ký Ed25519 tất định, khóa test sinh từ nhãn):

```text
4df09ea3b9b1f909544d401d88ae05c83a2bafe8af346daac112c673b9f91efc  src-tauri/src/models/testdata/manifest-vectors.json
```

- [ ] **Step 3: Viết test của phía Rust**

Tạo `src-tauri/src/models/signed.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

````rust
//! Phong bì ký của `models.json` (spec §6.7, §10.2): app chỉ đọc phần thân khi chữ ký Ed25519 đúng với một khóa
//! công khai build sẵn. Sửa một byte của phần thân, đổi `kid`, hay ký bằng khóa khác đều bị từ chối.
//!
//! ```json
//! { "format": "ai-translator-models", "version": 1, "kid": "stg-2026-10-1", "body": "<b64url>", "sig": "<b64url>" }
//! ```
//!
//! - `body`: base64url không đệm của các byte JSON phần thân ([`super::manifest::Manifest`]). Ký trên chính chuỗi
//!   này nên không cần chuẩn hóa JSON.
//! - `sig`: chữ ký Ed25519 trên `CONTEXT || body` (chuỗi ASCII của `body`). Tiền tố tách chữ ký manifest khỏi mọi
//!   chữ ký khác (token bản quyền dùng `v1.<payload>`).
//! - Phong bì đọc chặt: khóa lạ, base64url có đệm hay không ở dạng chuẩn, BOM, quá 1 MiB đều là `Malformed`.
//! - Khóa công khai: `src-tauri/keys/manifest-public-keys.json`. Bản dev (`tauri::is_dev()`) chỉ nhận khối
//!   `staging`, bản phát hành chỉ nhận `production` (mục 6.5 của kế hoạch 00). Khóa `test-*` chỉ có trong test,
//!   không bao giờ build vào app. Script ký và bộ vector: `scripts/models/`.

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::Value;

    const VECTORS: &str = include_str!("testdata/manifest-vectors.json");

    /// Khóa test của bộ vector (`test-m1`, `test-m2`). Test của module khác dùng lại để ký manifest giả.
    pub(crate) fn test_keys() -> Vec<TrustedKey> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let public: Vec<Value> = v["keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|k| serde_json::json!({ "kid": k["kid"], "x": k["x"] }))
            .collect();
        let wrapped = serde_json::json!({ "staging": public });
        keys_from_json(&wrapped.to_string(), KeyEnv::Staging).unwrap()
    }

    /// Một manifest hợp lệ đã ký bằng `test-m1`, với phần thân cho trước, dạng bytes của `models.json`.
    pub(crate) fn signed_with_test_key(body: &Value) -> Vec<u8> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let seed = URL_SAFE_NO_PAD.decode(v["keys"][0]["seed"].as_str().unwrap()).unwrap();
        let signing = ed25519_dalek::SigningKey::from_bytes(&seed.try_into().unwrap());
        let body_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(body).unwrap());
        use ed25519_dalek::Signer;
        let sig = signing.sign(&message(&body_b64));
        serde_json::to_vec(&serde_json::json!({
            "format": FORMAT, "version": VERSION, "kid": "test-m1", "body": body_b64,
            "sig": URL_SAFE_NO_PAD.encode(sig.to_bytes())
        }))
        .unwrap()
    }

    fn kind(result: &Result<Signed, SignedError>) -> &'static str {
        match result {
            Ok(_) => "ok",
            Err(SignedError::Malformed(_)) => "malformed",
            Err(SignedError::UnknownKey(_)) => "unknown_key",
            Err(SignedError::BadSignature) => "bad_signature",
            Err(SignedError::Invalid(_)) => "invalid",
        }
    }

    /// Bộ vector sinh bằng `scripts/models/gen-manifest-vectors.mjs` (Node, WebCrypto): Rust kiểm đúng như script ký.
    #[test]
    fn vectors_verify_as_expected() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let keys = test_keys();
        assert_eq!(keys.len(), 2);
        let cases = v["cases"].as_array().unwrap();
        assert!(cases.len() >= 12);
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let bytes = match &case["raw"] {
                Value::String(raw) => raw.as_bytes().to_vec(),
                _ => serde_json::to_vec(&case["manifest"]).unwrap(),
            };
            let result = verify(&bytes, &keys);
            assert_eq!(kind(&result), case["expect"].as_str().unwrap(), "{name}: {result:?}");
        }
        let valid = cases.iter().find(|c| c["name"] == "valid").unwrap();
        let signed = verify(&serde_json::to_vec(&valid["manifest"]).unwrap(), &keys).unwrap();
        assert_eq!(signed.kid, "test-m1");
        assert_eq!(signed.manifest.sequence, 1);
        assert_eq!(signed.manifest.packs.len(), 2);
    }

    #[test]
    fn a_manifest_signed_in_rust_verifies() {
        let bytes = signed_with_test_key(&super::super::manifest::tests::sample());
        assert_eq!(verify(&bytes, &test_keys()).unwrap().manifest.sequence, 3);
        assert_eq!(kind(&verify(&bytes, &test_keys()[1..])), "unknown_key");
        assert_eq!(kind(&verify(&bytes, &[])), "unknown_key");
        let mut big = bytes.clone();
        big.resize(MAX_BYTES + 1, b' ');
        assert_eq!(kind(&verify(&big, &test_keys())), "malformed");
    }

    /// Khóa build sẵn đọc được; không có khóa test nào; bản dev và bản phát hành dùng hai khối khác nhau.
    #[test]
    fn built_in_keys_parse_and_contain_no_test_key() {
        for env in [KeyEnv::Staging, KeyEnv::Production] {
            let keys = keys_from_json(KEYS_JSON, env).unwrap();
            assert!(keys.iter().all(|k| !k.kid.starts_with("test-")), "{env:?}");
        }
        let root: Value = serde_json::from_str(KEYS_JSON).unwrap();
        for (name, _) in root.as_object().unwrap() {
            assert!(
                ["staging", "production"].contains(&name.as_str()) || name.starts_with('_'),
                "khối lạ {name}"
            );
        }
        assert!(!KEYS_JSON.contains("\"d\""), "không có khóa riêng");
        assert_eq!(KeyEnv::current(), KeyEnv::Staging, "test chạy bản dev");
    }

    #[test]
    fn bad_key_files_are_rejected() {
        let one = |x: &str| format!(r#"{{ "staging": [{{ "kid": "stg-1", "x": "{x}" }}] }}"#);
        assert!(keys_from_json(&one("AAAA"), KeyEnv::Staging).is_err(), "khóa ngắn");
        assert!(keys_from_json(r#"{ "staging": [{ "kid": "STG", "x": "" }] }"#, KeyEnv::Staging).is_err());
        assert!(
            keys_from_json(
                r#"{ "staging": [{ "kid": "a", "x": "b", "d": "c" }] }"#,
                KeyEnv::Staging
            )
            .is_err()
        );
        assert_eq!(
            keys_from_json(r#"{ "_note": "x" }"#, KeyEnv::Production),
            Ok(Vec::new())
        );
    }
}
````

- [ ] **Step 4: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib models::signed 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 38 previous errors; 1 warning emitted
error[E0425]: cannot find function `keys_from_json` in this scope
error[E0425]: cannot find function `message` in this scope
error[E0425]: cannot find function `verify` in this scope
error[E0425]: cannot find type `SignedError` in this scope
error[E0425]: cannot find type `Signed` in this scope
error[E0425]: cannot find type `TrustedKey` in this scope
error[E0425]: cannot find value `FORMAT` in this scope
```

- [ ] **Step 5: Viết code**

Thêm vào `src-tauri/src/models/signed.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;

use super::manifest::{Invalid, Manifest};

pub const FORMAT: &str = "ai-translator-models";
pub const VERSION: u32 = 1;
/// Tiền tố của thông điệp được ký.
pub const CONTEXT: &[u8] = b"ai-translator-models.v1.";
/// Manifest lớn hơn chừng này thì không đọc.
pub const MAX_BYTES: usize = 1 << 20;

/// Khóa công khai build sẵn, cả hai môi trường.
const KEYS_JSON: &str = include_str!("../../keys/manifest-public-keys.json");

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrustedKey {
    pub kid: String,
    pub key: VerifyingKey,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyEnv {
    Staging,
    Production,
}

impl KeyEnv {
    /// Bản dev nhận khóa staging; bản phát hành chỉ nhận khóa production (Đ8 của kế hoạch 00).
    pub fn current() -> Self {
        if tauri::is_dev() {
            Self::Staging
        } else {
            Self::Production
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Staging => "staging",
            Self::Production => "production",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum SignedError {
    #[error("manifest sai định dạng: {0}")]
    Malformed(String),
    #[error("manifest ký bằng khóa lạ `{0}`")]
    UnknownKey(String),
    #[error("chữ ký manifest không đúng")]
    BadSignature,
    #[error(transparent)]
    Invalid(#[from] Invalid),
}

/// Manifest đã kiểm chữ ký và phần thân.
#[derive(Clone, Debug, PartialEq)]
pub struct Signed {
    pub kid: String,
    pub manifest: Manifest,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    format: String,
    version: u32,
    kid: String,
    body: String,
    sig: String,
}

fn kid_ok(kid: &str) -> bool {
    !kid.is_empty()
        && kid.len() <= 32
        && kid
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Thông điệp được ký của một phần thân đã mã hóa base64url.
pub fn message(body_b64: &str) -> Vec<u8> {
    [CONTEXT, body_b64.as_bytes()].concat()
}

/// Kiểm phong bì, chữ ký, rồi phần thân.
pub fn verify(bytes: &[u8], keys: &[TrustedKey]) -> Result<Signed, SignedError> {
    let malformed = |what: &str| SignedError::Malformed(what.to_string());
    if bytes.len() > MAX_BYTES {
        return Err(malformed("quá lớn"));
    }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|e| SignedError::Malformed(e.to_string()))?;
    if envelope.format != FORMAT {
        return Err(malformed("format"));
    }
    if envelope.version != VERSION {
        return Err(malformed("version"));
    }
    if !kid_ok(&envelope.kid) {
        return Err(malformed("kid"));
    }
    let body = URL_SAFE_NO_PAD.decode(&envelope.body).map_err(|_| malformed("body"))?;
    let sig: [u8; 64] = URL_SAFE_NO_PAD
        .decode(&envelope.sig)
        .ok()
        .and_then(|s| s.try_into().ok())
        .ok_or_else(|| malformed("sig"))?;
    let key = keys
        .iter()
        .find(|k| k.kid == envelope.kid)
        .ok_or_else(|| SignedError::UnknownKey(envelope.kid.clone()))?;
    key.key
        .verify_strict(&message(&envelope.body), &Signature::from_bytes(&sig))
        .map_err(|_| SignedError::BadSignature)?;
    let manifest = Manifest::parse(&body)?;
    Ok(Signed {
        kid: envelope.kid,
        manifest,
    })
}

/// Đọc khóa công khai của một môi trường từ file JSON dạng `{ "staging": [{ "kid", "x" }], "production": [...] }`. Khóa
/// bắt đầu bằng `_` (ghi chú) và các khối khác bị bỏ qua.
pub fn keys_from_json(text: &str, env: KeyEnv) -> Result<Vec<TrustedKey>, String> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Entry {
        kid: String,
        x: String,
    }
    let root: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let list = root
        .get(env.key())
        .cloned()
        .unwrap_or(serde_json::Value::Array(Vec::new()));
    let entries: Vec<Entry> = serde_json::from_value(list).map_err(|e| e.to_string())?;
    entries
        .into_iter()
        .map(|e| {
            if !kid_ok(&e.kid) {
                return Err(format!("kid `{}`", e.kid));
            }
            let bytes: [u8; 32] = URL_SAFE_NO_PAD
                .decode(&e.x)
                .ok()
                .and_then(|b| b.try_into().ok())
                .ok_or_else(|| format!("khóa của `{}`", e.kid))?;
            let key = VerifyingKey::from_bytes(&bytes).map_err(|_| format!("khóa của `{}`", e.kid))?;
            Ok(TrustedKey { kid: e.kid, key })
        })
        .collect()
}

/// Khóa build sẵn của môi trường đang chạy.
pub fn trusted_keys() -> Vec<TrustedKey> {
    keys_from_json(KEYS_JSON, KeyEnv::current()).unwrap_or_else(|e| {
        log::error!("manifest-public-keys.json hỏng ({e}): không nhận manifest nào");
        Vec::new()
    })
}
```

- [ ] **Step 6: Chạy test**

Run: `cargo test -p meeting-translator --lib models:: 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 160 filtered out; finished in 0.01s
```

- [ ] **Step 7: Viết test của các script**

Tạo `scripts/models/manifest.test.mjs`:

```js
// Test các script manifest model (kế hoạch 04). Chạy: node --test scripts/models/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { REPO, signBody, testKey, verifyEnvelope } from "./lib.mjs";

const script = (name) => resolve(REPO, "scripts/models", name);
const run = (name, args) => spawnSync(process.execPath, [script(name), ...args], { encoding: "utf8" });
const temp = () => mkdtempSync(join(tmpdir(), "mt-manifest-"));

test("bộ vector trong repo đúng như script sinh ra", () => {
  const fresh = execFileSync(process.execPath, [script("gen-manifest-vectors.mjs")], { encoding: "utf8" });
  const committed = readFileSync(resolve(REPO, "src-tauri/src/models/testdata/manifest-vectors.json"), "utf8");
  assert.equal(fresh, committed);
});

test("ký rồi kiểm được; sửa phần thân thì hỏng", async () => {
  const k = await testKey("test-m1", "ai-translator manifest test key 1");
  const envelope = await signBody(k.privateKey, k.kid, JSON.stringify({ schema: 1, sequence: 7 }));
  assert.deepEqual(await verifyEnvelope(envelope, [k]), { schema: 1, sequence: 7 });
  const tampered = { ...envelope, body: Buffer.from(JSON.stringify({ schema: 1, sequence: 8 })).toString("base64url") };
  await assert.rejects(verifyEnvelope(tampered, [k]), /Chữ ký không đúng/);
  await assert.rejects(verifyEnvelope({ ...envelope, kid: "test-m2" }, [k]), /Không có khóa công khai/);
});

test("build-manifest tính bytes và sha256 từ file thật", () => {
  const dir = temp();
  writeFileSync(join(dir, "a.bin"), "worker");
  const config = join(dir, "config.json");
  writeFileSync(
    config,
    JSON.stringify({
      files: [{ id: "a", tier: ["p"], kind: "asr", version: "1", file: "a.bin", url: "a.bin", license_id: "MIT", min_app_version: "0.1.0" }],
      packs: [{ id: "p", name: { vi: "P", en: "P" }, note: { vi: "n", en: "n" } }],
      recommend: { min_ram_mib: 1, rules: [], fallback: "p" },
    }),
  );
  const out = run("build-manifest.mjs", ["--dir", dir, "--sequence", "4", "--config", config, "--published-at", "2026-10-02T00:00:00Z"]);
  assert.equal(out.status, 0, out.stderr);
  const body = JSON.parse(out.stdout);
  assert.equal(body.sequence, 4);
  assert.equal(body.published_at, "2026-10-02T00:00:00Z");
  assert.equal(body.files[0].bytes, 6);
  // printf worker | shasum -a 256
  assert.equal(body.files[0].sha256, "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e");
  assert.equal("pipeline" in body, false);
  const missing = run("build-manifest.mjs", ["--dir", join(dir, "khong-co"), "--sequence", "4", "--config", config]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Thiếu file/);
  assert.equal(run("build-manifest.mjs", ["--dir", dir, "--sequence", "0", "--config", config]).status, 2);
});

test("cấu hình staging trong repo có đủ file cho hai gói", () => {
  const config = JSON.parse(readFileSync(script("models.config.json"), "utf8"));
  for (const pack of ["standard", "lite"]) {
    const kinds = config.files.filter((f) => f.tier.includes(pack)).map((f) => f.kind);
    for (const kind of ["asr", "mt", "vad"]) assert.equal(kinds.filter((k) => k === kind).length, 1, `${pack} ${kind}`);
    assert.ok(kinds.includes("license"), pack);
  }
  assert.ok(config.files.some((f) => f.file === "NOTICE.txt"));
});

test("gen-manifest-key: chỉ ghi khóa riêng ra ngoài repo, quyền 0600, in khóa công khai", () => {
  const dir = temp();
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ staging: [{ kid: "stg-2026-10-1", x: "x" }], production: [] }));
  const inside = run("gen-manifest-key.mjs", ["stg-2026-10-2", "--out", resolve(REPO, "k.jwk"), "--keys", keys]);
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /không được nằm trong repo/);
  assert.equal(run("gen-manifest-key.mjs", ["stg-2026-10-1", "--out", join(dir, "a.jwk"), "--keys", keys]).status, 2, "kid đã có");
  assert.equal(run("gen-manifest-key.mjs", ["prod-2026-10-1", "--out", join(dir, "b.jwk"), "--keys", keys]).status, 2, "chỉ staging");
  const ok = run("gen-manifest-key.mjs", ["stg-2026-10-2", "--out", join(dir, "c.jwk"), "--keys", keys]);
  assert.equal(ok.status, 0, ok.stderr);
  const pub = JSON.parse(ok.stdout);
  assert.equal(pub.kid, "stg-2026-10-2");
  assert.equal("d" in pub, false, "stdout không có khóa riêng");
  assert.equal(statSync(join(dir, "c.jwk")).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(join(dir, "c.jwk"), "utf8")).x, pub.x);
  assert.equal(run("gen-manifest-key.mjs", ["stg-2026-10-3", "--out", join(dir, "c.jwk"), "--keys", keys]).status, 2, "không ghi đè");
});

test("sign-manifest: chỉ ký bằng khóa có trong khối của môi trường, và tự kiểm lại", () => {
  const dir = temp();
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ staging: [], production: [] }));
  const made = run("gen-manifest-key.mjs", ["stg-2026-10-5", "--out", join(dir, "k.jwk"), "--keys", keys]);
  assert.equal(made.status, 0, made.stderr);
  const body = join(dir, "body.json");
  writeFileSync(body, JSON.stringify({ schema: 1, sequence: 2, files: [] }));
  const args = ["--key", join(dir, "k.jwk"), "--body", body, "--out", join(dir, "models.json"), "--keys", keys];
  const unknown = run("sign-manifest.mjs", args);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /không có trong khối staging/);
  writeFileSync(keys, JSON.stringify({ staging: [JSON.parse(made.stdout)], production: [] }));
  assert.equal(run("sign-manifest.mjs", [...args, "--env", "production"]).status, 2, "khóa staging không ký production");
  const signed = run("sign-manifest.mjs", args);
  assert.equal(signed.status, 0, signed.stderr);
  const envelope = JSON.parse(readFileSync(join(dir, "models.json"), "utf8"));
  assert.equal(envelope.kid, "stg-2026-10-5");
  assert.equal(envelope.format, "ai-translator-models");
});
```

Run: `node --test --test-reporter=tap scripts/models/manifest.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)'`

Expected (lúc lập kế hoạch; bốn test đỏ vì chưa có script và cấu hình):

```text
# tests 6
# pass 2
# fail 4
```

- [ ] **Step 8: Viết script và cấu hình staging**

`gen-manifest-key.mjs` ghi khóa riêng ra file JWK quyền 0600 ngoài repo và chỉ in khóa công khai (QĐ10). `build-manifest.mjs` lấy `bytes` và `sha256` từ file thật. `sign-manifest.mjs` chỉ ký bằng khóa có trong khối của môi trường và tự kiểm lại trước khi ghi.

Tạo `scripts/models/gen-manifest-key.mjs`:

```js
#!/usr/bin/env node
// Tạo cặp khóa Ed25519 ký manifest model cho môi trường staging (Đ8 của kế hoạch 00; kế hoạch 04).
// - Khóa riêng ghi ra file JWK ở --out: đường dẫn tuyệt đối, NGOÀI repo, chưa có file; quyền 0600. Không in ra terminal.
//   Khóa này chỉ để ký manifest staging trên máy người vận hành; khóa production tạo và giữ trong CI (kế hoạch 07).
// - Khóa công khai `{ "kid", "x" }` in ra stdout, để thêm vào khối "staging" của src-tauri/keys/manifest-public-keys.json.
// - kid dạng stg-<năm>-<tháng>-<số thứ tự>, chưa có trong manifest-public-keys.json (--keys để chỉ file khác).
//
//   node scripts/models/gen-manifest-key.mjs stg-2026-10-1 --out "$HOME/.config/ai-translator/manifest-stg-2026-10-1.jwk"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { webcrypto } from "node:crypto";
import { KEYS_FILE, insideRepo } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const [kid, ...rest] = process.argv.slice(2);
let out = null;
let keysFile = KEYS_FILE;
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i] === "--out" && rest[i + 1]) out = rest[i + 1];
  else if (rest[i] === "--keys" && rest[i + 1]) keysFile = rest[i + 1];
  else fail("Tham số: <kid> --out <file JWK ngoài repo> [--keys <manifest-public-keys.json>]");
}
if (!kid || !/^stg-\d{4}-\d{2}-[1-9]\d{0,3}$/.test(kid)) fail("kid phải dạng stg-<năm>-<tháng>-<số thứ tự>, ví dụ stg-2026-10-1.");
if (!out || !isAbsolute(out)) fail("--out phải là đường dẫn tuyệt đối.");
if (insideRepo(out)) fail("Khóa riêng không được nằm trong repo.");
if (existsSync(out)) fail(`${out} đã có; không ghi đè khóa cũ.`);
const known = JSON.parse(readFileSync(keysFile, "utf8"));
for (const [env, list] of Object.entries(known)) {
  if (Array.isArray(list) && list.some((k) => k?.kid === kid)) fail(`kid ${kid} đã có trong khối ${env}. Dùng số thứ tự mới.`);
}
const { privateKey } = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
writeFileSync(out, JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x }), { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ kid, x: jwk.x })}\n`);
console.error(`Đã ghi khóa riêng vào ${out} (0600). Thêm dòng trên vào khối "staging" của ${keysFile}.`);
```

Tạo `scripts/models/build-manifest.mjs`:

```js
#!/usr/bin/env node
// Dựng phần thân manifest model từ cấu hình và các file model trên máy (kế hoạch 04): đọc
// scripts/models/models.config.json, tính `bytes` và `sha256` của từng file trong --dir, ghi phần thân JSON ra stdout.
// Phần thân chưa ký; ký bằng sign-manifest.mjs.
//
//   node scripts/models/build-manifest.mjs --dir <thư mục chứa file> --sequence 1 > body.json
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { REPO } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = opt("--dir");
const sequence = Number(opt("--sequence"));
const config = JSON.parse(readFileSync(opt("--config") ?? resolve(REPO, "scripts/models/models.config.json"), "utf8"));
const publishedAt = opt("--published-at") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
if (!dir) fail("Thiếu --dir <thư mục chứa các file model>.");
if (!Number.isSafeInteger(sequence) || sequence < 1) fail("--sequence phải là số nguyên dương, lớn hơn số của manifest đang phát hành.");

const sha256 = (path) =>
  new Promise((ok, err) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => ok(hash.digest("hex")))
      .on("error", err);
  });

const files = [];
for (const entry of config.files) {
  const path = join(dir, entry.file);
  let bytes;
  try {
    bytes = statSync(path).size;
  } catch {
    fail(`Thiếu file ${path}.`);
  }
  files.push({ ...entry, bytes, sha256: await sha256(path) });
}
const body = {
  schema: 1,
  sequence,
  published_at: publishedAt,
  files,
  packs: config.packs,
  recommend: config.recommend,
  ...(config.pipeline ? { pipeline: config.pipeline } : {}),
};
process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
```

Tạo `scripts/models/sign-manifest.mjs`:

```js
#!/usr/bin/env node
// Ký phần thân manifest model thành models.json (kế hoạch 04; Đ8 của kế hoạch 00: staging ký trên máy người vận hành
// bằng khóa ngoài repo; manifest production ký trong CI của kế hoạch 07).
// - --key: file JWK khóa riêng (gen-manifest-key.mjs), phải nằm ngoài repo và chỉ chủ file đọc được.
// - kid của khóa phải có trong khối --env (staging mặc định) của manifest-public-keys.json, đúng khóa công khai: app
//   bản tương ứng mới nhận manifest này.
// - Ký xong thì tự kiểm lại bằng khóa build sẵn rồi mới ghi --out.
//
//   node scripts/models/sign-manifest.mjs --key ~/.config/ai-translator/manifest-stg-2026-10-1.jwk --body body.json --out models.json
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, signBody, verifyEnvelope } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const keyPath = opt("--key");
const bodyPath = opt("--body");
const outPath = opt("--out");
const env = opt("--env") ?? "staging";
const keysFile = opt("--keys") ?? KEYS_FILE;
if (!keyPath || !bodyPath || !outPath) fail("Tham số: --key <JWK> --body <phần thân> --out <models.json> [--env staging] [--keys <file>]");
if (insideRepo(keyPath)) fail("Khóa riêng không được nằm trong repo.");
if (process.platform !== "win32" && (statSync(keyPath).mode & 0o077) !== 0) fail(`${keyPath} phải chỉ chủ file đọc được (chmod 600).`);
const jwk = JSON.parse(readFileSync(keyPath, "utf8"));
const trusted = builtInKeys(env, keysFile);
const known = trusted.find((k) => k.kid === jwk.kid);
if (!known) fail(`kid ${jwk.kid} không có trong khối ${env} của ${keysFile}: app sẽ không nhận manifest này.`);
if (known.x !== jwk.x) fail(`Khóa công khai của ${jwk.kid} trong ${keysFile} không khớp khóa riêng.`);
const body = readFileSync(bodyPath);
const parsed = JSON.parse(body.toString("utf8"));
if (parsed.schema !== 1 || !Number.isSafeInteger(parsed.sequence)) fail("Phần thân không đúng schema 1.");
const envelope = await signBody(await importPrivateJwk(jwk), jwk.kid, JSON.stringify(parsed));
await verifyEnvelope(envelope, trusted);
writeFileSync(outPath, `${JSON.stringify(envelope)}\n`);
console.error(`Đã ký ${outPath}: kid ${jwk.kid}, sequence ${parsed.sequence}.`);
```

Cấu hình manifest staging: hai gói theo §6.7, ghi chú chất lượng theo §8, ngưỡng theo QĐ4. Phiên bản file theo revision đã ghi trong `models/MANIFEST.json` của Giai đoạn 0 (`bench/phase0/fetch.py`).

Tạo `scripts/models/models.config.json`:

```json
{
  "_note": "Cấu hình manifest model (spec §6.7, §8; Đ7 của kế hoạch 00). build-manifest.mjs thêm bytes và sha256 từ file thật. Ngưỡng RAM, VRAM tính bằng MiB, thấp hơn dung lượng ghi trên máy một chút vì hệ điều hành báo ít hơn (QĐ của kế hoạch 04); chờ C6, C7 để chốt.",
  "files": [
    { "id": "whisper-large-v3-turbo-q5_0", "tier": ["standard"], "kind": "asr", "version": "whisper.cpp-5359861", "file": "ggml-large-v3-turbo-q5_0.bin", "url": "whisper/ggml-large-v3-turbo-q5_0.bin", "license_id": "MIT", "min_app_version": "0.1.0" },
    { "id": "whisper-small-q5_1", "tier": ["lite"], "kind": "asr", "version": "whisper.cpp-5359861", "file": "ggml-small-q5_1.bin", "url": "whisper/ggml-small-q5_1.bin", "license_id": "MIT", "min_app_version": "0.1.0" },
    { "id": "whisper-license", "tier": ["standard", "lite"], "kind": "license", "version": "v20250625", "file": "whisper-LICENSE.txt", "url": "whisper/whisper-LICENSE.txt", "license_id": "MIT", "min_app_version": "0.1.0" },
    { "id": "whisper-cpp-license", "tier": ["standard", "lite"], "kind": "license", "version": "v1.8.3", "file": "whisper.cpp-LICENSE.txt", "url": "whisper/whisper.cpp-LICENSE.txt", "license_id": "MIT", "min_app_version": "0.1.0" },
    { "id": "hy-mt2-1.8b-q8_0", "tier": ["standard"], "kind": "mt", "version": "a0c709d", "file": "Hy-MT2-1.8B-Q8_0.gguf", "url": "hy-mt2/Hy-MT2-1.8B-Q8_0.gguf", "license_id": "Apache-2.0", "min_app_version": "0.1.0" },
    { "id": "hy-mt2-1.8b-q4_k_m", "tier": ["lite"], "kind": "mt", "version": "a0c709d", "file": "Hy-MT2-1.8B-Q4_K_M.gguf", "url": "hy-mt2/Hy-MT2-1.8B-Q4_K_M.gguf", "license_id": "Apache-2.0", "min_app_version": "0.1.0" },
    { "id": "hy-mt2-license", "tier": ["standard", "lite"], "kind": "license", "version": "a0c709d", "file": "Hy-MT2-LICENSE.txt", "url": "hy-mt2/Hy-MT2-LICENSE.txt", "license_id": "Apache-2.0", "min_app_version": "0.1.0" },
    { "id": "silero-vad-v6.2.3", "tier": ["standard", "lite"], "kind": "vad", "version": "v6.2.3", "file": "silero_vad_v6.2.3.onnx", "url": "silero-vad/silero_vad_v6.2.3.onnx", "license_id": "MIT", "min_app_version": "0.1.0" },
    { "id": "silero-vad-license", "tier": ["standard", "lite"], "kind": "license", "version": "v6.2.3", "file": "silero-vad-LICENSE.txt", "url": "silero-vad/silero-vad-LICENSE.txt", "license_id": "MIT", "min_app_version": "0.1.0" },
    { "id": "notice", "tier": ["standard", "lite"], "kind": "license", "version": "1", "file": "NOTICE.txt", "url": "NOTICE.txt", "license_id": "Apache-2.0", "min_app_version": "0.1.0" }
  ],
  "packs": [
    {
      "id": "standard",
      "name": { "vi": "Chuẩn", "en": "Standard" },
      "note": {
        "vi": "Chép lời chính xác nhất. Nên chọn nếu bạn nghe chủ yếu tiếng Việt, Nhật, Hàn hoặc Trung. Cần máy RAM 16 GB.",
        "en": "Most accurate transcription. Recommended if you mostly listen to Vietnamese, Japanese, Korean or Chinese. Needs 16 GB of RAM."
      }
    },
    {
      "id": "lite",
      "name": { "vi": "Nhẹ", "en": "Lite" },
      "note": {
        "vi": "Nhẹ hơn, chạy được trên máy RAM 8 GB, nhưng chép lời kém rõ với tiếng Việt, Nhật, Hàn và Trung. Tiếng Anh gần ngang gói Chuẩn.",
        "en": "Lighter and runs with 8 GB of RAM, but noticeably less accurate for Vietnamese, Japanese, Korean and Chinese. English is close to Standard."
      }
    }
  ],
  "recommend": {
    "min_ram_mib": 7168,
    "rules": [
      { "pack": "standard", "os": "macos", "min_ram_mib": 15360 },
      { "pack": "standard", "os": "windows", "min_ram_mib": 15360, "gpu": "discrete", "min_vram_mib": 5632 }
    ],
    "fallback": "lite"
  }
}
```

Tạo `scripts/models/NOTICE.txt`:

```text
AI Translator: model files

These files are redistributed unmodified from their original sources, next to their licenses.

- Hy-MT2-1.8B-Q8_0.gguf, Hy-MT2-1.8B-Q4_K_M.gguf
  Source: https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF (revision a0c709d9fac510f2c807aa3af52872340dc37a4a)
  Copyright (C) 2026 Tencent. Licensed under the Apache License, Version 2.0 (Hy-MT2-LICENSE.txt).
- ggml-large-v3-turbo-q5_0.bin, ggml-small-q5_1.bin
  Source: https://huggingface.co/ggerganov/whisper.cpp (revision 5359861c739e955e79d9a303bcbc70fb988958b1)
  Whisper weights: Copyright (c) 2022 OpenAI, MIT License (whisper-LICENSE.txt).
  ggml conversion: Copyright (c) 2023-2024 The ggml authors, MIT License (whisper.cpp-LICENSE.txt).
- silero_vad_v6.2.3.onnx
  Source: https://github.com/snakers4/silero-vad (tag v6.2.3)
  Copyright (c) 2020-present Silero Team, MIT License (silero-vad-LICENSE.txt).
```

- [ ] **Step 9: Chạy test của script, rồi cargo deny**

Run: `node --test --test-reporter=tap scripts/models/manifest.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)'`

Expected (lúc lập kế hoạch):

```text
# tests 6
# pass 6
# fail 0
```

Run:

```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -E '^(warning|error)' ; cargo deny check 2>&1 | tail -1
```

Expected:

```text
advisories ok, bans ok, licenses ok, sources ok
```

Lúc lập kế hoạch đã chạy thử cả chuỗi với model thật của Giai đoạn 0 (ngoài repo): `build-manifest.mjs --dir <thư mục có model, LICENSE, NOTICE> --sequence 1` mất khoảng 2,7 giây cho 2,5 GB+1,3 GB; ký bằng một khóa staging tạm (đã xóa); `signed::verify` của Rust nhận và đọc được: gói Chuẩn 2 484 912 654 byte, gói Nhẹ 1 325 509 202 byte (khớp "khoảng 2,5 GB" và "khoảng 1,3 GB" của §6.7), Mac 16 GB được đề xuất gói Chuẩn.

- [ ] **Step 10: Commit**

```bash
git add Cargo.lock src-tauri/Cargo.toml src-tauri/src/models/mod.rs src-tauri/keys/manifest-public-keys.json src-tauri/src/models/signed.rs src-tauri/src/models/testdata/manifest-vectors.json scripts/models
git commit -q -m "feat(models): phong bì ký Ed25519, khóa build sẵn, vector và script ký staging (04 T2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Tải một file: HTTP Range, `*.part`, SHA-256, thử lại, tạm dừng

Dòng 20, 37, 160, 246, 291; QĐ5, QĐ6, QĐ7:
- `src-tauri/src/models/download.rs`: client HTTP (User-Agent chung `AI-Translator/<phiên bản>`, không mang thông tin người dùng), tải một file vào `*.part` với `Range` từ cuối phần dở, kiểm SHA-256 rồi đổi tên, thử lại, tạm dừng.
- `src-tauri/src/models/test_http.rs`: HTTP server giả, chỉ biên dịch trong test.

**Files:**
- Sửa: `src-tauri/src/models/mod.rs`
- Tạo: `src-tauri/src/models/test_http.rs`
- Tạo: `src-tauri/src/models/download.rs`

- [ ] **Step 1: Server giả và module**

Tạo `src-tauri/src/models/test_http.rs`:

```rust
//! HTTP server giả cho test tải model (kế hoạch 04): chạy trong test trên `127.0.0.1`, cổng ngẫu nhiên, không cần mạng.
//! Hiểu `Range: bytes=N-`, ghi lại từng request, và giả được lỗi cho các request kế tiếp: rớt mạng giữa chừng, mã lỗi
//! HTTP, server bỏ qua `Range`, dữ liệu hỏng.

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

use reqwest::Url;

/// Lỗi giả cho một request.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    /// Hứa đủ `Content-Length` nhưng chỉ gửi chừng này byte rồi đóng kết nối (rớt mạng).
    DropAfter(usize),
    /// Trả mã lỗi này, không có nội dung.
    Status(u16),
    /// Bỏ qua `Range`, trả `200` cả file.
    IgnoreRange,
    /// Đổi một byte ở giữa phần gửi đi.
    Corrupt,
    /// Trả `206` từ sau chỗ được hỏi 500 byte, `Content-Range` ghi đúng chỗ bắt đầu thật (server hay proxy lỗi).
    WrongRange,
}

/// Một request đã nhận.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Request {
    pub path: String,
    pub range: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Default)]
struct Shared {
    files: HashMap<String, Vec<u8>>,
    faults: VecDeque<Fault>,
    requests: Vec<Request>,
}

pub struct FakeServer {
    base: Url,
    shared: Arc<Mutex<Shared>>,
}

impl FakeServer {
    pub fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("mở được cổng");
        let base = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        let shared = Arc::new(Mutex::new(Shared::default()));
        let state = shared.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let state = state.clone();
                std::thread::spawn(move || serve(stream, &state));
            }
        });
        Self { base, shared }
    }

    /// Đặt nội dung cho đường dẫn `path` (không có `/` đầu).
    pub fn put(&self, path: &str, bytes: &[u8]) {
        self.shared
            .lock()
            .unwrap()
            .files
            .insert(format!("/{path}"), bytes.to_vec());
    }

    /// Lỗi giả cho request kế tiếp (mỗi lần gọi là một request, theo thứ tự).
    pub fn fault(&self, fault: Fault) {
        self.shared.lock().unwrap().faults.push_back(fault);
    }

    pub fn url(&self, path: &str) -> Url {
        self.base.join(path).unwrap()
    }

    pub fn requests(&self) -> Vec<Request> {
        self.shared.lock().unwrap().requests.clone()
    }
}

fn serve(stream: TcpStream, shared: &Mutex<Shared>) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
    let (mut range, mut user_agent) = (None, None);
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).is_err() || header.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            match name.trim().to_ascii_lowercase().as_str() {
                "range" => range = Some(value.trim().to_string()),
                "user-agent" => user_agent = Some(value.trim().to_string()),
                _ => {}
            }
        }
    }
    let (file, fault) = {
        let mut s = shared.lock().unwrap();
        s.requests.push(Request {
            path: path.clone(),
            range: range.clone(),
            user_agent,
        });
        (s.files.get(&path).cloned(), s.faults.pop_front())
    };
    let mut out = stream;
    let head = |status: &str, extra: &str, len: usize| {
        format!("HTTP/1.1 {status}\r\nContent-Length: {len}\r\n{extra}Connection: close\r\n\r\n")
    };
    let Some(file) = file else {
        let _ = out.write_all(head("404 Not Found", "", 0).as_bytes());
        return;
    };
    if let Some(Fault::Status(code)) = fault {
        let _ = out.write_all(head(&format!("{code} Fake"), "", 0).as_bytes());
        return;
    }
    if fault == Some(Fault::WrongRange) {
        let n = range
            .as_deref()
            .and_then(|r| r.strip_prefix("bytes=")?.strip_suffix('-')?.parse::<usize>().ok())
            .unwrap_or(0);
        let skip = (n + 500).min(file.len() - 1);
        let extra = format!("Content-Range: bytes {skip}-{}/{}\r\n", file.len() - 1, file.len());
        let _ = out.write_all(head("206 Partial Content", &extra, file.len() - skip).as_bytes());
        let _ = out.write_all(&file[skip..]);
        let _ = out.shutdown(Shutdown::Both);
        return;
    }
    let start = match (&range, fault) {
        (Some(r), f) if f != Some(Fault::IgnoreRange) => r
            .strip_prefix("bytes=")
            .and_then(|r| r.strip_suffix('-'))
            .and_then(|n| n.parse::<usize>().ok()),
        _ => None,
    };
    let (status, extra, body) = match start {
        Some(n) if n >= file.len() => {
            let extra = format!("Content-Range: bytes */{}\r\n", file.len());
            let _ = out.write_all(head("416 Range Not Satisfiable", &extra, 0).as_bytes());
            return;
        }
        Some(n) => (
            "206 Partial Content",
            format!("Content-Range: bytes {n}-{}/{}\r\n", file.len() - 1, file.len()),
            file[n..].to_vec(),
        ),
        None => ("200 OK", String::new(), file),
    };
    let mut body = body;
    if fault == Some(Fault::Corrupt) && !body.is_empty() {
        let mid = body.len() / 2;
        body[mid] ^= 0xff;
    }
    let _ = out.write_all(head(status, &extra, body.len()).as_bytes());
    let send = match fault {
        Some(Fault::DropAfter(n)) => &body[..n.min(body.len())],
        _ => &body[..],
    };
    let _ = out.write_all(send);
    let _ = out.flush();
    let _ = out.shutdown(Shutdown::Both);
}
```

Sửa `src-tauri/src/models/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/mod.rs
+++ b/src-tauri/src/models/mod.rs
@@ -2,4 +2,7 @@
 //! xuất gói theo máy, xóa model.
 
+pub mod download;
 pub mod manifest;
 pub mod signed;
+#[cfg(test)]
+pub mod test_http;
```

- [ ] **Step 2: Viết test**

Tạo `src-tauri/src/models/download.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Tải một file model (spec §6.7, §9): HTTP Range để tải tiếp, ghi ra `*.part`, kiểm SHA-256 rồi mới đổi tên thành file
//! chính thức.
//!
//! - File tạm tên `<file>.<16 ký tự đầu của sha256>.part`: bản mới của cùng file (sha khác) không bao giờ tải tiếp trên
//!   phần dở của bản cũ.
//! - Tải tiếp: gửi `Range: bytes=<độ dài phần dở>-`. Server trả `206` đúng chỗ thì ghi nối; trả `200` (bỏ qua `Range`)
//!   thì ghi lại từ đầu; `Content-Range` lệch hay `416` thì xóa phần dở, lần thử sau tải lại từ đầu.
//! - SHA-256 tính dần trong lúc ghi; trạng thái băm giữ qua các lần thử, nên rớt mạng không phải băm lại phần đã có.
//! - Thử lại 3 lần khi lỗi mạng, lỗi HTTP hay sai SHA-256 (§9). Rớt mạng mà lần thử đó vẫn nhận thêm được dữ liệu thì
//!   đếm lại từ đầu: mạng chập chờn mà vẫn tiến thì không bỏ cuộc giữa file 2 GB. Hết lượt thì báo lỗi, giữ phần dở để
//!   tải tiếp sau.
//! - Tạm dừng: luồng tải xem cờ [`Pause`] sau mỗi khối 64 KiB và trong lúc chờ thử lại; dừng thì giữ phần dở.
//! - Không có thời hạn cho cả file (file lớn), chỉ có thời hạn kết nối và thời hạn chờ mỗi lần đọc.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::test_http::{FakeServer, Fault};

    struct Temp(PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn temp(name: &str) -> Temp {
        let dir = std::env::temp_dir().join(format!("mt-download-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Temp(dir)
    }

    /// 300 KiB không lặp lại, để `Corrupt` và tải tiếp ở giữa khối đều thấy được.
    fn content() -> Vec<u8> {
        (0..300 * 1024u32)
            .map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8)
            .collect()
    }

    fn setup(name: &str) -> (Temp, FakeServer, FileJob, Vec<u8>) {
        let t = temp(name);
        let server = FakeServer::start();
        let bytes = content();
        server.put("m/model.bin", &bytes);
        let job = FileJob {
            url: server.url("m/model.bin"),
            dest: t.0.join("model.bin"),
            bytes: bytes.len() as u64,
            sha256: hex(&Sha256::digest(&bytes)),
        };
        (t, server, job, bytes)
    }

    /// Không chờ thật; ghi lại các lần chờ.
    fn run(
        job: &FileJob,
        pause: &Pause,
        waits: &mut Vec<Duration>,
        progress: &mut Vec<u64>,
    ) -> Result<(), DownloadError> {
        let client = client().unwrap();
        download(
            &client,
            job,
            pause,
            &Retry::default(),
            &mut |d| {
                waits.push(d);
                true
            },
            &mut |n| progress.push(n),
        )
    }

    fn ranges(server: &FakeServer) -> Vec<Option<String>> {
        server.requests().into_iter().map(|r| r.range).collect()
    }

    #[test]
    fn downloads_verifies_and_renames() {
        let (_t, server, job, bytes) = setup("fresh");
        let (mut waits, mut progress) = (Vec::new(), Vec::new());
        run(&job, &Pause::default(), &mut waits, &mut progress).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert!(!job.part().exists(), "không còn file .part");
        assert!(waits.is_empty());
        assert_eq!(progress.last(), Some(&job.bytes));
        assert!(progress.windows(2).all(|w| w[0] < w[1]));
        let requests = server.requests();
        assert_eq!(ranges(&server), [None]);
        assert!(requests[0].user_agent.as_deref().unwrap().starts_with("AI-Translator/"));
        assert_eq!(requests[0].path, "/m/model.bin");
    }

    #[test]
    fn the_part_file_is_named_after_the_sha256() {
        let job = FileJob {
            url: Url::parse("https://x.example/a.bin").unwrap(),
            dest: PathBuf::from("/m/a.bin"),
            bytes: 1,
            sha256: "0123456789abcdef".repeat(4),
        };
        assert_eq!(job.part(), PathBuf::from("/m/a.bin.0123456789abcdef.part"));
    }

    /// Rớt mạng giữa chừng: lần thử sau gửi `Range` từ chỗ đã có, không tải lại từ đầu.
    #[test]
    fn a_dropped_connection_resumes_with_range() {
        let (_t, server, job, bytes) = setup("drop");
        server.fault(Fault::DropAfter(100_000));
        let (mut waits, mut progress) = (Vec::new(), Vec::new());
        run(&job, &Pause::default(), &mut waits, &mut progress).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [None, Some("bytes=100000-".into())]);
        assert_eq!(waits, [Duration::from_secs(1)]);
    }

    /// Phần dở từ lần chạy trước (tạm dừng, tắt app): tải tiếp từ cuối phần dở.
    #[test]
    fn an_existing_part_is_continued() {
        let (_t, server, job, bytes) = setup("part");
        std::fs::write(job.part(), &bytes[..3_000]).unwrap();
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [Some("bytes=3000-".into())]);
    }

    #[test]
    fn a_server_ignoring_range_restarts_from_zero() {
        let (_t, server, job, bytes) = setup("ignore");
        std::fs::write(job.part(), &bytes[..3_000]).unwrap();
        server.fault(Fault::IgnoreRange);
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [Some("bytes=3000-".into())]);
    }

    /// `206` mà `Content-Range` không bắt đầu đúng chỗ phần dở kết thúc: không ghi nối, lần sau tải lại từ đầu.
    #[test]
    fn a_partial_response_at_the_wrong_offset_restarts() {
        let (_t, server, job, bytes) = setup("wrongrange");
        std::fs::write(job.part(), &bytes[..3_000]).unwrap();
        server.fault(Fault::WrongRange);
        let mut waits = Vec::new();
        run(&job, &Pause::default(), &mut waits, &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [Some("bytes=3000-".into()), None]);
        assert_eq!(waits.len(), 1);
    }

    /// Phần dở hỏng mà đủ độ dài: sai SHA-256, xóa, tải lại từ đầu.
    #[test]
    fn a_full_but_wrong_part_is_downloaded_again() {
        let (_t, server, job, bytes) = setup("wrongpart");
        std::fs::write(job.part(), vec![0u8; bytes.len()]).unwrap();
        let mut waits = Vec::new();
        run(&job, &Pause::default(), &mut waits, &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [None], "lần đầu không cần request");
        assert_eq!(waits.len(), 1);
    }

    /// §9: sai SHA-256 thì thử lại; hỏng mãi thì báo lỗi, không để lại file nào.
    #[test]
    fn a_wrong_sha256_is_retried_then_reported() {
        let (_t, server, job, bytes) = setup("corrupt");
        server.fault(Fault::Corrupt);
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        let (_t, server, job, _) = setup("corrupt4");
        for _ in 0..4 {
            server.fault(Fault::Corrupt);
        }
        let mut waits = Vec::new();
        assert_eq!(
            run(&job, &Pause::default(), &mut waits, &mut Vec::new()),
            Err(DownloadError::Checksum)
        );
        assert!(!job.dest.exists() && !job.part().exists());
        assert_eq!(server.requests().len(), 4, "một lần đầu và 3 lần thử lại");
        assert_eq!(waits, [1, 5, 15].map(Duration::from_secs));
    }

    #[test]
    fn http_errors_are_retried_three_times() {
        let (_t, server, job, _) = setup("http");
        for _ in 0..4 {
            server.fault(Fault::Status(503));
        }
        assert_eq!(
            run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()),
            Err(DownloadError::Http(503))
        );
        assert_eq!(server.requests().len(), 4);
        let (_t, server, job, bytes) = setup("http404");
        server.put("m/model.bin", &bytes);
        let missing = FileJob {
            url: server.url("m/khong-co.bin"),
            ..job
        };
        assert_eq!(
            run(&missing, &Pause::default(), &mut Vec::new(), &mut Vec::new()),
            Err(DownloadError::Http(404))
        );
    }

    /// Mạng chập chờn nhưng mỗi lần vẫn nhận thêm dữ liệu: rớt 5 lần vẫn tải xong.
    #[test]
    fn progress_resets_the_retry_count() {
        let (_t, server, job, bytes) = setup("flaky");
        for _ in 0..5 {
            server.fault(Fault::DropAfter(40_000));
        }
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(server.requests().len(), 6);
    }

    #[test]
    fn pause_keeps_the_part_and_resume_continues() {
        let (_t, server, job, bytes) = setup("pause");
        let pause = Pause::default();
        let client = client().unwrap();
        let result = download(&client, &job, &pause, &Retry::default(), &mut |_| true, &mut |n| {
            if n >= 100_000 {
                pause.request();
            }
        });
        assert_eq!(result, Err(DownloadError::Paused));
        let kept = std::fs::metadata(job.part()).unwrap().len();
        assert!((100_000..job.bytes).contains(&kept), "{kept}");
        assert!(!job.dest.exists());
        pause.clear();
        run(&job, &pause, &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [None, Some(format!("bytes={kept}-"))]);
    }

    #[test]
    fn pausing_while_waiting_to_retry_stops() {
        let (_t, server, job, _) = setup("pausewait");
        server.fault(Fault::Status(500));
        let client = client().unwrap();
        let result = download(
            &client,
            &job,
            &Pause::default(),
            &Retry::default(),
            &mut |_| false,
            &mut |_| {},
        );
        assert_eq!(result, Err(DownloadError::Paused));
        let pause = Pause::default();
        pause.request();
        assert!(!sleep_unless_paused(&pause, Duration::from_secs(60)));
        pause.clear();
        assert!(sleep_unless_paused(&pause, Duration::from_millis(1)));
    }

    /// Server gửi nhiều hơn kích thước ghi trong manifest: dừng ngay, không ghi quá.
    #[test]
    fn more_bytes_than_the_manifest_says_is_an_error() {
        let (_t, server, job, _) = setup("long");
        let short = FileJob {
            bytes: 1_000,
            ..job.clone()
        };
        assert_eq!(
            run(&short, &Pause::default(), &mut Vec::new(), &mut Vec::new()),
            Err(DownloadError::TooLong)
        );
        assert!(std::fs::metadata(short.part()).unwrap().len() <= 1_000);
        assert_eq!(server.requests().len(), 4);
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib models::download 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 51 previous errors; 1 warning emitted
error[E0422]: cannot find struct, variant or union type `FileJob` in this scope
error[E0425]: cannot find function `client` in this scope
error[E0425]: cannot find function `download` in this scope
error[E0425]: cannot find function `hex` in this scope
error[E0425]: cannot find function `sleep_unless_paused` in this scope
error[E0425]: cannot find type `DownloadError` in this scope
error[E0425]: cannot find type `Duration` in this scope
```

- [ ] **Step 4: Viết code**

Thêm vào `src-tauri/src/models/download.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{CONTENT_RANGE, RANGE};
use reqwest::{StatusCode, Url};
use sha2::{Digest, Sha256};

/// User-Agent chung, không mang thông tin của người dùng hay máy.
pub const USER_AGENT: &str = concat!("AI-Translator/", env!("CARGO_PKG_VERSION"));
const CHUNK: usize = 64 * 1024;

/// Client HTTP cho manifest và model: proxy và chứng chỉ của hệ điều hành.
pub fn client() -> reqwest::Result<Client> {
    Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        // Client đồng bộ: thời hạn này áp cho từng lần chờ (gửi request, mỗi lần đọc thân), không cho cả file.
        .timeout(Duration::from_secs(30))
        .build()
}

/// Một file cần tải.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileJob {
    pub url: Url,
    /// Đường dẫn file chính thức.
    pub dest: PathBuf,
    pub bytes: u64,
    pub sha256: String,
}

impl FileJob {
    pub fn part(&self) -> PathBuf {
        let name = self
            .dest
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let tag = self.sha256.get(..16).unwrap_or(&self.sha256);
        self.dest.with_file_name(format!("{name}.{tag}.part"))
    }
}

/// Cờ tạm dừng, dùng chung giữa luồng tải và lệnh của giao diện.
#[derive(Debug, Default)]
pub struct Pause(AtomicBool);

impl Pause {
    pub fn request(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn clear(&self) {
        self.0.store(false, Ordering::SeqCst);
    }

    pub fn requested(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum DownloadError {
    #[error("đã tạm dừng")]
    Paused,
    #[error("server trả HTTP {0}")]
    Http(u16),
    #[error("lỗi mạng: {0}")]
    Network(String),
    #[error("sai SHA-256")]
    Checksum,
    #[error("server gửi nhiều hơn kích thước trong manifest")]
    TooLong,
    #[error("không ghi được file: {0}")]
    Io(String),
}

impl DownloadError {
    fn retryable(&self) -> bool {
        !matches!(self, Self::Paused | Self::Io(_))
    }
}

/// Số lần thử lại và thời gian chờ trước mỗi lần.
#[derive(Clone, Debug)]
pub struct Retry {
    pub retries: u32,
    pub backoff: Vec<Duration>,
}

impl Default for Retry {
    fn default() -> Self {
        Self {
            retries: 3,
            backoff: [1, 5, 15].map(Duration::from_secs).to_vec(),
        }
    }
}

/// Băm của phần dở đã đọc: (độ dài, trạng thái băm).
type Hashed = Option<(u64, Sha256)>;

fn io(e: std::io::Error) -> DownloadError {
    DownloadError::Io(e.to_string())
}

fn hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Mở phần dở, cắt nếu dài hơn file, và lấy trạng thái băm của nó (dùng lại `cache` nếu còn đúng độ dài).
fn open_part(job: &FileJob, cache: &mut Hashed) -> Result<(File, u64, Sha256), DownloadError> {
    let path = job.part();
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)
        .map_err(io)?;
    let mut len = file.metadata().map_err(io)?.len();
    if len > job.bytes {
        file.set_len(0).map_err(io)?;
        len = 0;
    }
    let hasher = match cache.take() {
        Some((cached, hasher)) if cached == len => hasher,
        _ => {
            let mut hasher = Sha256::new();
            let mut buf = vec![0u8; CHUNK];
            file.seek(SeekFrom::Start(0)).map_err(io)?;
            let mut left = len;
            while left > 0 {
                let n = file.read(&mut buf).map_err(io)?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
                left = left.saturating_sub(n as u64);
            }
            hasher
        }
    };
    file.seek(SeekFrom::End(0)).map_err(io)?;
    Ok((file, len, hasher))
}

fn restart(file: &mut File, cache: &mut Hashed) -> Result<(), DownloadError> {
    file.set_len(0).map_err(io)?;
    file.seek(SeekFrom::Start(0)).map_err(io)?;
    *cache = None;
    Ok(())
}

/// Một lần thử. Trả số byte nhận được trong lần thử này cùng kết quả.
fn attempt(
    client: &Client,
    job: &FileJob,
    pause: &Pause,
    cache: &mut Hashed,
    on_progress: &mut dyn FnMut(u64),
) -> (u64, Result<(), DownloadError>) {
    let mut received = 0;
    let result = (|| {
        let (mut file, mut len, mut hasher) = open_part(job, cache)?;
        if len < job.bytes {
            let mut request = client.get(job.url.clone());
            if len > 0 {
                request = request.header(RANGE, format!("bytes={len}-"));
            }
            let mut response = request.send().map_err(|e| DownloadError::Network(e.to_string()))?;
            match response.status() {
                StatusCode::PARTIAL_CONTENT => {
                    let starts_at = response
                        .headers()
                        .get(CONTENT_RANGE)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.strip_prefix("bytes "))
                        .and_then(|v| v.split('-').next())
                        .and_then(|v| v.parse::<u64>().ok());
                    if starts_at != Some(len) {
                        restart(&mut file, cache)?;
                        return Err(DownloadError::Network(format!("Content-Range lệch: {starts_at:?}")));
                    }
                }
                StatusCode::OK => {
                    restart(&mut file, cache)?;
                    len = 0;
                    hasher = Sha256::new();
                }
                status => {
                    if status == StatusCode::RANGE_NOT_SATISFIABLE {
                        restart(&mut file, cache)?;
                    }
                    *cache = Some((len, hasher));
                    return Err(DownloadError::Http(status.as_u16()));
                }
            }
            let mut buf = vec![0u8; CHUNK];
            loop {
                if pause.requested() {
                    file.flush().map_err(io)?;
                    *cache = Some((len, hasher));
                    return Err(DownloadError::Paused);
                }
                let n = match response.read(&mut buf) {
                    Ok(n) => n,
                    Err(e) => {
                        *cache = Some((len, hasher));
                        return Err(DownloadError::Network(e.to_string()));
                    }
                };
                if n == 0 {
                    break;
                }
                if len + n as u64 > job.bytes {
                    restart(&mut file, cache)?;
                    return Err(DownloadError::TooLong);
                }
                file.write_all(&buf[..n]).map_err(io)?;
                hasher.update(&buf[..n]);
                len += n as u64;
                received += n as u64;
                on_progress(len);
            }
            if len < job.bytes {
                *cache = Some((len, hasher));
                return Err(DownloadError::Network("kết nối đóng trước khi đủ dữ liệu".into()));
            }
        }
        file.sync_all().map_err(io)?;
        drop(file);
        if hex(&hasher.finalize()) != job.sha256 {
            *cache = None;
            let _ = std::fs::remove_file(job.part());
            return Err(DownloadError::Checksum);
        }
        std::fs::rename(job.part(), &job.dest).map_err(io)?;
        Ok(())
    })();
    (received, result)
}

/// Tải một file, thử lại theo `retry`. `sleep` chờ trước mỗi lần thử lại; trả `false` nếu bị tạm dừng trong lúc chờ.
pub fn download(
    client: &Client,
    job: &FileJob,
    pause: &Pause,
    retry: &Retry,
    sleep: &mut dyn FnMut(Duration) -> bool,
    on_progress: &mut dyn FnMut(u64),
) -> Result<(), DownloadError> {
    let mut cache: Hashed = None;
    let mut failures = 0u32;
    loop {
        let (received, result) = attempt(client, job, pause, &mut cache, on_progress);
        let error = match result {
            Ok(()) => return Ok(()),
            Err(e) if !e.retryable() => return Err(e),
            Err(e) => e,
        };
        // Rớt mạng mà vẫn nhận thêm được dữ liệu: đếm lại. Sai SHA-256 hay lỗi HTTP thì luôn tính.
        let progressed = received > 0 && matches!(error, DownloadError::Network(_));
        failures = if progressed { 1 } else { failures + 1 };
        if failures > retry.retries {
            return Err(error);
        }
        log::warn!("tải {} lỗi ({error}), thử lại lần {failures}", job.url);
        let wait = retry
            .backoff
            .get(failures as usize - 1)
            .or(retry.backoff.last())
            .copied()
            .unwrap_or_default();
        if !sleep(wait) {
            return Err(DownloadError::Paused);
        }
    }
}

/// Chờ `wait`, xem cờ tạm dừng mỗi 100 ms.
pub fn sleep_unless_paused(pause: &Pause, wait: Duration) -> bool {
    let step = Duration::from_millis(100);
    let mut left = wait;
    while !left.is_zero() {
        if pause.requested() {
            return false;
        }
        let d = left.min(step);
        std::thread::sleep(d);
        left -= d;
    }
    !pause.requested()
}
```

- [ ] **Step 5: Chạy test**

Run: `cargo test -p meeting-translator --lib models::download 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 172 filtered out; finished in 0.14s
```

- [ ] **Step 6: Định dạng, clippy**

Run: `cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)'`

Expected:

```text
0
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/models/mod.rs src-tauri/src/models/test_http.rs src-tauri/src/models/download.rs
git commit -q -m "feat(models): tải một file model bằng HTTP Range, kiểm SHA-256, thử lại và tạm dừng (04 T3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: Kho model trên máy

Dòng 160, 161, 233, 291; §9 "Model thiếu hoặc hỏng":
- `src-tauri/src/models/store.rs`: `manifest.json` (manifest đã nhận, kiểm chữ ký lại khi đọc), `installed.json` (file đã tải xong và đúng SHA-256), `state.json` (lần kiểm manifest, "Để sau"); tình trạng từng gói (dùng được, đủ bản mới nhất, còn phải tải bao nhiêu, phần dở); file model của gói lúc bắt đầu phiên (chỉ kiểm có file và kích thước); băm lại khi nạp lỗi; xóa một gói (giữ file dùng chung), xóa hết, dọn file bản cũ.
- `download.rs` tách `part_path` để kho tính được phần dở mà không cần URL.

**Files:**
- Sửa: `src-tauri/src/models/mod.rs`
- Sửa: `src-tauri/src/models/download.rs`
- Tạo: `src-tauri/src/models/store.rs`

- [ ] **Step 1: Viết test**

Sửa `src-tauri/src/models/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/mod.rs
+++ b/src-tauri/src/models/mod.rs
@@ -5,4 +5,5 @@ pub mod download;
 pub mod manifest;
 pub mod signed;
+pub mod store;
 #[cfg(test)]
 pub mod test_http;
```

Tạo `src-tauri/src/models/store.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Kho model trên máy (spec §6.7, §9): thư mục `models` trong `app_local_data_dir`, nằm ngoài thư mục cài đặt.
//!
//! - File model, LICENSE và NOTICE đặt cạnh nhau, tên theo trường `file` của manifest; phần đang tải là `*.part`.
//! - `manifest.json`: nguyên văn manifest đã ký được nhận gần nhất. Đọc lại thì kiểm chữ ký lại; hỏng thì coi như
//!   chưa có.
//! - `installed.json`: các file đã tải xong và đúng SHA-256 (`id`, `file`, `sha256`, `bytes`, `version`). Một file
//!   chỉ vào đây sau khi kiểm SHA-256 và đổi tên xong.
//! - `state.json`: lần kiểm manifest gần nhất (để kiểm tối đa mỗi ngày một lần) và bản manifest người dùng đã bấm
//!   "Để sau".
//! - Lúc bắt đầu phiên chỉ kiểm file có và đúng kích thước theo `installed.json` (§9); SHA-256 đầy đủ kiểm sau khi tải
//!   xong và khi nạp model lỗi ([`Store::verify_pack`]).
//! - File của gói vẫn dùng được khi manifest mới có bản khác của nó (cùng `id`, khác `sha256`): đó là bản cập nhật đang
//!   chờ người dùng đồng ý tải.

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::models::manifest::tests::sample;
    use crate::models::signed::tests::{signed_with_test_key, test_keys};
    use serde_json::Value;
    use sha2::{Digest, Sha256};

    pub(crate) struct Temp(pub PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    pub(crate) fn temp(name: &str) -> Temp {
        let dir = std::env::temp_dir().join(format!("mt-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        Temp(dir)
    }

    /// Nội dung giả của một file model, theo `id` (cùng `id` thì cùng nội dung).
    pub(crate) fn content(id: &str, bytes: u64) -> Vec<u8> {
        (0..bytes)
            .map(|i| (i as u8) ^ id.len() as u8 ^ id.as_bytes()[0])
            .collect()
    }

    /// Manifest mẫu với `bytes` và `sha256` khớp [`content`].
    pub(crate) fn real_sample() -> Value {
        let mut value = sample();
        for f in value["files"].as_array_mut().unwrap() {
            let bytes = f["bytes"].as_u64().unwrap();
            let sha = Sha256::digest(content(f["id"].as_str().unwrap(), bytes));
            f["sha256"] = Value::String(sha.iter().map(|b| format!("{b:02x}")).collect());
        }
        value
    }

    fn manifest(value: &Value) -> Manifest {
        Manifest::parse(&serde_json::to_vec(value).unwrap()).unwrap()
    }

    /// Đặt file của gói vào kho như đã tải xong.
    pub(crate) fn install(store: &Store, m: &Manifest, pack: &str) {
        std::fs::create_dir_all(store.dir()).unwrap();
        for f in m.files_of(pack) {
            std::fs::write(store.path(&f.file), content(&f.id, f.bytes)).unwrap();
            store.mark_installed(f).unwrap();
        }
    }

    #[test]
    fn the_saved_manifest_is_verified_again_on_load() {
        let t = temp("manifest");
        let store = Store::new(&t.0);
        assert!(store.load_manifest(&test_keys()).is_none());
        let raw = signed_with_test_key(&sample());
        store.save_manifest(&raw).unwrap();
        assert_eq!(store.load_manifest(&test_keys()).unwrap().manifest.sequence, 3);
        assert!(store.load_manifest(&test_keys()[1..]).is_none(), "khóa khác");
        let mut tampered = raw.clone();
        let at = tampered.len() / 2;
        tampered[at] ^= 1;
        std::fs::write(store.path(MANIFEST), tampered).unwrap();
        assert!(store.load_manifest(&test_keys()).is_none(), "file đã lưu bị sửa");
    }

    #[test]
    fn pack_status_follows_installed_files() {
        let t = temp("status");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        let lite = store.pack_status(&m, "lite");
        assert!(!lite.usable && !lite.complete);
        assert_eq!(lite.missing_bytes, m.pack_bytes("lite"));
        install(&store, &m, "lite");
        let lite = store.pack_status(&m, "lite");
        assert!(lite.usable && lite.complete);
        assert_eq!(lite.missing_bytes, 0);
        let standard = store.pack_status(&m, "standard");
        assert!(!standard.usable);
        assert_eq!(standard.missing_bytes, 500 + 1900, "VAD và giấy phép dùng chung đã có");
        // Phần dở của file Q8_0.
        let q8 = m.files.iter().find(|f| f.id == "hy-mt2-q8").unwrap();
        std::fs::write(store.part(q8), [0u8; 700]).unwrap();
        assert_eq!(store.pack_status(&m, "standard").partial_bytes, 700);
    }

    /// §9: lúc bắt đầu phiên chỉ kiểm có file và đúng kích thước.
    #[test]
    fn resolve_checks_presence_and_size() {
        let t = temp("resolve");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        assert_eq!(
            store.resolve(&m, "lite"),
            Err(ResolveError::Missing("ggml-small-q5_1.bin".into()))
        );
        install(&store, &m, "lite");
        let files = store.resolve(&m, "lite").unwrap();
        assert_eq!(files.asr, t.0.join("ggml-small-q5_1.bin"));
        assert_eq!(files.mt, t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf"));
        assert_eq!(files.vad, t.0.join("silero_vad_v6.2.3.onnx"));
        std::fs::write(t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf"), b"ngan").unwrap();
        assert_eq!(
            store.resolve(&m, "lite"),
            Err(ResolveError::Broken("Hy-MT2-1.8B-Q4_K_M.gguf".into()))
        );
        std::fs::remove_file(t.0.join("silero_vad_v6.2.3.onnx")).unwrap();
        install(&store, &m, "lite");
        std::fs::remove_file(t.0.join("silero_vad_v6.2.3.onnx")).unwrap();
        assert_eq!(
            store.resolve(&m, "lite"),
            Err(ResolveError::Missing("silero_vad_v6.2.3.onnx".into()))
        );
    }

    /// Manifest mới có bản khác của một file: gói vẫn dùng được bản cũ, và cần tải phần khác.
    #[test]
    fn a_newer_manifest_leaves_the_pack_usable_with_an_update_pending() {
        let t = temp("update");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        newer["files"][3]["sha256"] = "cd".repeat(32).into();
        newer["files"][3]["version"] = "2".into();
        let newer = manifest(&newer);
        let status = store.pack_status(&newer, "lite");
        assert!(status.usable && !status.complete);
        assert_eq!(status.missing_bytes, 1100);
        assert!(store.resolve(&newer, "lite").is_ok());
        assert!(!store.is_installed(&newer.files[3]));
        assert!(store.is_installed(&newer.files[1]));
    }

    #[test]
    fn verify_pack_drops_files_with_a_wrong_sha256() {
        let t = temp("verify");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        assert!(store.verify_pack(&m, "lite").is_empty());
        let mut q4 = std::fs::read(t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf")).unwrap();
        q4[10] ^= 1;
        std::fs::write(t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf"), q4).unwrap();
        assert_eq!(store.verify_pack(&m, "lite"), ["hy-mt2-q4"]);
        assert!(!t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf").exists());
        assert!(
            store.installed().iter().all(|i| i.id != "hy-mt2-q4"),
            "bỏ khỏi installed.json"
        );
        assert!(!store.pack_status(&m, "lite").usable);
        assert_eq!(store.pack_status(&m, "lite").missing_bytes, 1100);
    }

    #[test]
    fn deleting_a_pack_keeps_files_shared_with_another() {
        let t = temp("delete");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        install(&store, &m, "standard");
        let q8 = m.files.iter().find(|f| f.id == "hy-mt2-q8").unwrap();
        let part = store.part(q8);
        std::fs::write(&part, b"do").unwrap();
        store.delete_pack(&m, "standard", &["lite"]).unwrap();
        assert!(store.pack_status(&m, "lite").complete);
        assert!(!store.pack_status(&m, "standard").usable);
        assert!(!t.0.join("ggml-large-v3-turbo-q5_0.bin").exists());
        assert!(!part.exists());
        assert!(t.0.join("silero_vad_v6.2.3.onnx").exists());
        store.delete_pack(&m, "lite", &[]).unwrap();
        assert!(store.installed().is_empty());
        assert!(!t.0.join("silero_vad_v6.2.3.onnx").exists());
        store.save_manifest(b"{}").unwrap();
        store.delete_all().unwrap();
        assert!(!t.0.exists());
        store.delete_all().unwrap();
    }

    #[test]
    fn cleanup_removes_old_versions_and_stale_parts() {
        let t = temp("cleanup");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        store.save_state(&StoreState::default()).unwrap();
        std::fs::write(t.0.join("Hy-MT2-1.8B-Q4_K_M-cu.gguf"), b"ban cu").unwrap();
        std::fs::write(t.0.join("x.bin.0000000000000000.part"), b"do dang").unwrap();
        let q8 = m.files.iter().find(|f| f.id == "hy-mt2-q8").unwrap();
        let current = store.part(q8);
        std::fs::write(&current, b"dang tai").unwrap();
        let before = store.used_bytes();
        store.cleanup(&m).unwrap();
        assert!(!t.0.join("Hy-MT2-1.8B-Q4_K_M-cu.gguf").exists());
        assert!(!t.0.join("x.bin.0000000000000000.part").exists());
        assert!(current.exists(), "phần dở của bản đang có trong manifest");
        assert!(store.pack_status(&m, "lite").complete);
        assert!(t.0.join("state.json").exists());
        assert!(store.used_bytes() < before);
    }

    #[test]
    fn state_round_trips_and_survives_garbage() {
        let t = temp("state");
        let store = Store::new(&t.0);
        assert_eq!(store.state(), StoreState::default());
        let state = StoreState {
            last_check: Some(1_790_000_000),
            dismissed_sequence: 4,
        };
        store.save_state(&state).unwrap();
        assert_eq!(store.state(), state);
        std::fs::write(t.0.join("state.json"), "hỏng").unwrap();
        assert_eq!(store.state(), StoreState::default());
        std::fs::write(t.0.join("installed.json"), "hỏng").unwrap();
        assert!(store.installed().is_empty());
    }
}
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib models::store 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 21 previous errors; 1 warning emitted
error[E0422]: cannot find struct, variant or union type `StoreState` in this scope
error[E0425]: cannot find type `Manifest` in this scope
error[E0425]: cannot find type `PathBuf` in this scope
error[E0425]: cannot find type `Store` in this scope
error[E0425]: cannot find value `MANIFEST` in this scope
error[E0433]: cannot find type `Manifest` in this scope
error[E0433]: cannot find type `ResolveError` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/models/download.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/download.rs
+++ b/src-tauri/src/models/download.rs
@@ -15,5 +15,5 @@
 use std::fs::{File, OpenOptions};
 use std::io::{Read, Seek, SeekFrom, Write};
-use std::path::PathBuf;
+use std::path::{Path, PathBuf};
 use std::sync::atomic::{AtomicBool, Ordering};
 use std::time::Duration;
@@ -50,14 +50,18 @@ pub struct FileJob {
 impl FileJob {
     pub fn part(&self) -> PathBuf {
-        let name = self
-            .dest
-            .file_name()
-            .map(|n| n.to_string_lossy().into_owned())
-            .unwrap_or_default();
-        let tag = self.sha256.get(..16).unwrap_or(&self.sha256);
-        self.dest.with_file_name(format!("{name}.{tag}.part"))
+        part_path(&self.dest, &self.sha256)
     }
 }
 
+/// File tạm của bản `sha256` của file `dest`.
+pub fn part_path(dest: &Path, sha256: &str) -> PathBuf {
+    let name = dest
+        .file_name()
+        .map(|n| n.to_string_lossy().into_owned())
+        .unwrap_or_default();
+    let tag = sha256.get(..16).unwrap_or(sha256);
+    dest.with_file_name(format!("{name}.{tag}.part"))
+}
+
 /// Cờ tạm dừng, dùng chung giữa luồng tải và lệnh của giao diện.
 #[derive(Debug, Default)]
```

Thêm vào `src-tauri/src/models/store.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::download::{FileJob, part_path};
use super::manifest::{FileEntry, Kind, Manifest};
use super::signed::{self, Signed, TrustedKey};
use crate::sidecar::integrity::sha256_file;
use crate::sidecar::paths::ModelFiles;

pub const MANIFEST: &str = "manifest.json";
const INSTALLED: &str = "installed.json";
const STATE: &str = "state.json";

/// Một file đã tải xong và đúng SHA-256.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Installed {
    pub id: String,
    pub file: String,
    pub sha256: String,
    pub bytes: u64,
    pub version: String,
}

impl Installed {
    pub fn from_entry(entry: &FileEntry) -> Self {
        Self {
            id: entry.id.clone(),
            file: entry.file.clone(),
            sha256: entry.sha256.clone(),
            bytes: entry.bytes,
            version: entry.version.clone(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoreState {
    /// Lần kiểm manifest thành công gần nhất (giây Unix).
    #[serde(default)]
    pub last_check: Option<u64>,
    /// Người dùng đã bấm "Để sau" với bản cập nhật của manifest này.
    #[serde(default)]
    pub dismissed_sequence: u64,
}

/// Tình trạng một gói trên máy.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackStatus {
    /// Mọi file của gói đã có (có thể là bản cũ hơn manifest): dùng được.
    pub usable: bool,
    /// Mọi file của gói đã có đúng bản trong manifest.
    pub complete: bool,
    /// Số byte còn phải tải để gói `complete` (kể cả bản cập nhật), chưa trừ phần dở.
    pub missing_bytes: u64,
    /// Số byte đã có trong các file `*.part` của gói.
    pub partial_bytes: u64,
}

/// File model thiếu (`Missing`) hay sai kích thước (`Broken`) lúc bắt đầu phiên.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ResolveError {
    #[error("chưa tải {0}")]
    Missing(String),
    #[error("{0} sai kích thước")]
    Broken(String),
}

pub struct Store {
    dir: PathBuf,
}

/// Ghi file mới rồi đổi tên đè lên file cũ, để tắt app giữa chừng không để lại file JSON dở.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    let mut file = std::fs::File::create(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    std::fs::rename(tmp, path)
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn path(&self, file: &str) -> PathBuf {
        self.dir.join(file)
    }

    fn ensure_dir(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.dir)
    }

    /// Manifest đã nhận gần nhất, kiểm chữ ký lại bằng `keys`.
    pub fn load_manifest(&self, keys: &[TrustedKey]) -> Option<Signed> {
        let bytes = std::fs::read(self.path(MANIFEST)).ok()?;
        match signed::verify(&bytes, keys) {
            Ok(signed) => Some(signed),
            Err(e) => {
                log::warn!("bỏ manifest đã lưu: {e}");
                None
            }
        }
    }

    pub fn save_manifest(&self, raw: &[u8]) -> std::io::Result<()> {
        self.ensure_dir()?;
        write_atomic(&self.path(MANIFEST), raw)
    }

    pub fn installed(&self) -> Vec<Installed> {
        std::fs::read(self.path(INSTALLED))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    fn save_installed(&self, list: &[Installed]) -> std::io::Result<()> {
        self.ensure_dir()?;
        write_atomic(&self.path(INSTALLED), &serde_json::to_vec_pretty(list)?)
    }

    /// Ghi một file vừa tải xong (thay bản cũ cùng `id`).
    pub fn mark_installed(&self, entry: &FileEntry) -> std::io::Result<()> {
        let mut list = self.installed();
        list.retain(|i| i.id != entry.id);
        list.push(Installed::from_entry(entry));
        self.save_installed(&list)
    }

    /// Bỏ các file khỏi danh sách đã tải (file trên đĩa không đụng tới).
    pub fn forget(&self, ids: &[String]) -> std::io::Result<()> {
        let mut list = self.installed();
        list.retain(|i| !ids.contains(&i.id));
        self.save_installed(&list)
    }

    pub fn state(&self) -> StoreState {
        std::fs::read(self.path(STATE))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save_state(&self, state: &StoreState) -> std::io::Result<()> {
        self.ensure_dir()?;
        write_atomic(&self.path(STATE), &serde_json::to_vec_pretty(state)?)
    }

    /// Bản đã tải của file có `id`, nếu file còn trên đĩa và đúng kích thước đã ghi.
    fn present(&self, list: &[Installed], id: &str) -> Option<Installed> {
        list.iter()
            .find(|i| i.id == id)
            .filter(|i| std::fs::metadata(self.path(&i.file)).is_ok_and(|m| m.len() == i.bytes))
            .cloned()
    }

    /// File đã có đúng bản này trong manifest.
    pub fn is_installed(&self, entry: &FileEntry) -> bool {
        self.present(&self.installed(), &entry.id)
            .is_some_and(|i| i.sha256 == entry.sha256)
    }

    /// Việc tải một file vào kho này.
    pub fn job(&self, entry: &FileEntry, url: reqwest::Url) -> FileJob {
        FileJob {
            url,
            dest: self.path(&entry.file),
            bytes: entry.bytes,
            sha256: entry.sha256.clone(),
        }
    }

    /// File tạm khi đang tải bản này của file.
    pub fn part(&self, entry: &FileEntry) -> PathBuf {
        part_path(&self.path(&entry.file), &entry.sha256)
    }

    fn part_len(&self, entry: &FileEntry) -> u64 {
        std::fs::metadata(self.part(entry)).map(|m| m.len()).unwrap_or(0)
    }

    pub fn pack_status(&self, manifest: &Manifest, pack: &str) -> PackStatus {
        let list = self.installed();
        let files = manifest.files_of(pack);
        let mut status = PackStatus {
            usable: !files.is_empty(),
            complete: !files.is_empty(),
            ..PackStatus::default()
        };
        for entry in files {
            match self.present(&list, &entry.id) {
                Some(i) if i.sha256 == entry.sha256 => {}
                Some(_) => {
                    status.complete = false;
                    status.missing_bytes += entry.bytes;
                    status.partial_bytes += self.part_len(entry);
                }
                None => {
                    status.usable = false;
                    status.complete = false;
                    status.missing_bytes += entry.bytes;
                    status.partial_bytes += self.part_len(entry);
                }
            }
        }
        status
    }

    /// File model của gói để chạy phiên (§9: chỉ kiểm có file và đúng kích thước).
    pub fn resolve(&self, manifest: &Manifest, pack: &str) -> Result<ModelFiles, ResolveError> {
        let list = self.installed();
        let pick = |kind: Kind| -> Result<PathBuf, ResolveError> {
            let entry = manifest
                .files_of(pack)
                .into_iter()
                .find(|f| f.kind == kind)
                .ok_or_else(|| ResolveError::Missing(format!("{pack}/{kind:?}")))?;
            let record = list
                .iter()
                .find(|i| i.id == entry.id)
                .ok_or_else(|| ResolveError::Missing(entry.file.clone()))?;
            let path = self.path(&record.file);
            match std::fs::metadata(&path) {
                Ok(m) if m.len() == record.bytes => Ok(path),
                Ok(_) => Err(ResolveError::Broken(record.file.clone())),
                Err(_) => Err(ResolveError::Missing(record.file.clone())),
            }
        };
        Ok(ModelFiles {
            asr: pick(Kind::Asr)?,
            mt: pick(Kind::Mt)?,
            vad: pick(Kind::Vad)?,
        })
    }

    /// Băm lại đầy đủ các file đã tải của gói (khi nạp model lỗi, §9). File sai SHA-256 bị xóa khỏi danh sách đã tải và
    /// khỏi đĩa, để gói hiện "chưa tải" và người dùng tải lại. Trả `id` các file hỏng.
    pub fn verify_pack(&self, manifest: &Manifest, pack: &str) -> Vec<String> {
        let list = self.installed();
        let mut broken = Vec::new();
        for entry in manifest.files_of(pack) {
            let Some(record) = list.iter().find(|i| i.id == entry.id) else {
                continue;
            };
            let path = self.path(&record.file);
            if sha256_file(&path).ok().as_deref() != Some(record.sha256.as_str()) {
                log::warn!("{} sai SHA-256, cần tải lại", record.file);
                let _ = std::fs::remove_file(&path);
                broken.push(record.id.clone());
            }
        }
        if !broken.is_empty()
            && let Err(e) = self.forget(&broken)
        {
            log::warn!("không ghi được {INSTALLED}: {e}");
        }
        broken
    }

    /// Xóa các file của gói, trừ file còn dùng chung với gói trong `keep` (VAD, giấy phép). Phần dở cũng xóa.
    pub fn delete_pack(&self, manifest: &Manifest, pack: &str, keep: &[&str]) -> std::io::Result<()> {
        let shared: HashSet<&str> = keep
            .iter()
            .filter(|k| **k != pack)
            .flat_map(|k| manifest.files_of(k))
            .map(|f| f.id.as_str())
            .collect();
        let doomed: Vec<String> = manifest
            .files_of(pack)
            .into_iter()
            .filter(|f| !shared.contains(f.id.as_str()))
            .map(|f| f.id.clone())
            .collect();
        let list = self.installed();
        for entry in manifest.files_of(pack) {
            if !doomed.contains(&entry.id) {
                continue;
            }
            for name in list.iter().filter(|i| i.id == entry.id).map(|i| i.file.clone()) {
                remove_if_exists(&self.path(&name))?;
            }
            remove_if_exists(&self.path(&entry.file))?;
            remove_if_exists(&self.part(entry))?;
        }
        self.forget(&doomed)
    }

    /// Xóa cả thư mục model ("Xóa model và dữ liệu", A6).
    pub fn delete_all(&self) -> std::io::Result<()> {
        match std::fs::remove_dir_all(&self.dir) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }

    /// Dọn file không còn ai dùng: model bản cũ sau khi cập nhật, phần dở của bản không còn trong manifest. Chỉ gọi khi
    /// không tiến trình phụ nào đang mở model.
    pub fn cleanup(&self, manifest: &Manifest) -> std::io::Result<()> {
        let list = self.installed();
        let mut keep: HashSet<String> = [MANIFEST, INSTALLED, STATE].map(String::from).into();
        keep.extend(list.iter().map(|i| i.file.clone()));
        for entry in &manifest.files {
            if let Some(name) = self.part(entry).file_name() {
                keep.insert(name.to_string_lossy().into_owned());
            }
        }
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Ok(());
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.path().is_file() && !keep.contains(&name) {
                log::info!("xóa file model không còn dùng: {name}");
                remove_if_exists(&entry.path())?;
            }
        }
        Ok(())
    }

    /// Tổng dung lượng các file trong thư mục model.
    pub fn used_bytes(&self) -> u64 {
        std::fs::read_dir(&self.dir)
            .map(|entries| {
                entries
                    .flatten()
                    .filter_map(|e| e.metadata().ok())
                    .filter(|m| m.is_file())
                    .map(|m| m.len())
                    .sum()
            })
            .unwrap_or(0)
    }
}

fn remove_if_exists(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}
```

- [ ] **Step 4: Chạy test**

Run: `cargo test -p meeting-translator --lib models:: 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 33 passed; 0 failed; 0 ignored; 0 measured; 160 filtered out; finished in 0.34s
```

- [ ] **Step 5: Định dạng, clippy**

Run: `cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)'`

Expected:

```text
0
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models/mod.rs src-tauri/src/models/download.rs src-tauri/src/models/store.rs
git commit -q -m "feat(models): kho model trên máy: đã tải, kiểm kích thước, băm lại, xóa, dọn (04 T4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: Cấu hình máy và đề xuất gói

Dòng 36, 105, 159, 223, 226; Đ7, Đ13; QĐ4, QĐ8:
- `src-tauri/src/models/machine.rs`: RAM (macOS `hw.memsize`, Windows `GlobalMemoryStatusEx`), dung lượng trống của ổ chứa thư mục model (macOS `statfs`, Windows `GetDiskFreeSpaceExW`; thư mục chưa có thì xét thư mục cha gần nhất), AVX2, GPU từ `--probe`.
- `src-tauri/src/models/recommend.rs`: luật của manifest xét theo thứ tự; card rời so VRAM; GPU tích hợp không tính; máy chưa được hỗ trợ.
- `sidecar/probe.rs` giữ cả danh sách GPU (`ProbeOutcome`) thay vì chỉ "có GPU dùng được"; `GpuProbe` nhớ kết quả đó.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `src-tauri/Cargo.toml`
- Sửa: `src-tauri/src/models/mod.rs`
- Tạo: `src-tauri/src/models/machine.rs`
- Tạo: `src-tauri/src/models/recommend.rs`
- Sửa: `src-tauri/src/sidecar/probe.rs`
- Sửa: `src-tauri/src/sidecar/mod.rs`

- [ ] **Step 1: Phụ thuộc và module**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -43,2 +43,4 @@ thiserror.workspace = true
 apple-native-keyring-store = { version = "1.0.2", features = ["keychain"] }
+# RAM và dung lượng trống cho đề xuất gói model (spec §8). Cùng bản `pipeline` đang dùng.
+libc = "0.2.189"
 objc2 = "0.6.4"
@@ -51,3 +53,5 @@ windows = { version = "0.62.2", features = [
     "Win32_Foundation",
+    "Win32_Storage_FileSystem",
     "Win32_System_LibraryLoader",
+    "Win32_System_SystemInformation",
     "Win32_UI_WindowsAndMessaging",
```

Sửa `src-tauri/src/models/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/mod.rs
+++ b/src-tauri/src/models/mod.rs
@@ -3,5 +3,7 @@
 
 pub mod download;
+pub mod machine;
 pub mod manifest;
+pub mod recommend;
 pub mod signed;
 pub mod store;
```

- [ ] **Step 2: Viết test**

Tạo `src-tauri/src/models/machine.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Cấu hình máy cho bước kiểm tra cấu hình (spec §4.1 bước 2, §8; Đ13 của kế hoạch 00): RAM, dung lượng trống, CPU có
//! AVX2 không (bản build x64 cần AVX2, §6.12), và card rời theo `asr-worker-vulkan --probe` (Windows).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn this_mac_reports_ram_disk_and_cpu() {
        let m = detect(None);
        assert_eq!(m.os, Os::Macos);
        assert!(m.ram_mib >= 4_096, "{}", m.ram_mib);
        assert!(m.avx2, "Apple Silicon luôn đủ");
        assert!(m.gpu_known && m.gpus.is_empty());
        let free = free_disk_bytes(&std::env::temp_dir()).unwrap();
        assert!(free > 0);
        let missing = std::env::temp_dir().join("mt-khong-co/models/con");
        assert_eq!(
            free_disk_bytes(&missing).map(|b| b > 0),
            Some(true),
            "dùng thư mục cha đã có"
        );
    }

    #[test]
    fn probe_gpus_become_discrete_flags_and_mib() {
        let info = GpuInfo {
            name: "NVIDIA GeForce RTX 4050 Laptop GPU".into(),
            device_type: "discrete".into(),
            device_local_bytes: 6_425_673_728,
            vendor_id: 4318,
        };
        let m = detect(Some(&[info]));
        assert_eq!(
            m.gpus,
            [Gpu {
                name: "NVIDIA GeForce RTX 4050 Laptop GPU".into(),
                discrete: true,
                vram_mib: 6_128
            }]
        );
        assert!(m.gpu_known);
    }
}
```

Tạo `src-tauri/src/models/recommend.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Đề xuất gói theo máy (spec §6.7, §8; Đ7, Đ13 của kế hoạch 00). Ngưỡng nằm trong manifest đã ký: đổi ngưỡng hay thêm
//! gói lai không cần phát hành lại app. App chỉ tự quyết hai điều không đổi được bằng manifest: CPU x64 không có AVX2
//! thì chưa hỗ trợ (bản build cần AVX2), và RAM dưới `min_ram_mib` của manifest thì chưa hỗ trợ.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::machine::Gpu;
    use crate::models::manifest::{Manifest, Os};

    fn rules() -> Recommend {
        let value = crate::models::manifest::tests::sample();
        Manifest::parse(&serde_json::to_vec(&value).unwrap()).unwrap().recommend
    }

    fn mac(ram_mib: u64) -> Machine {
        Machine {
            os: Os::Macos,
            ram_mib,
            avx2: true,
            gpus: Vec::new(),
            gpu_known: true,
        }
    }

    fn windows(ram_mib: u64, gpus: &[(bool, u64)]) -> Machine {
        Machine {
            os: Os::Windows,
            ram_mib,
            avx2: true,
            gpus: gpus
                .iter()
                .map(|&(discrete, vram_mib)| Gpu {
                    name: "gpu".into(),
                    discrete,
                    vram_mib,
                })
                .collect(),
            gpu_known: true,
        }
    }

    fn pack(v: Verdict) -> String {
        match v {
            Verdict::Recommend { pack } => pack,
            other => panic!("{other:?}"),
        }
    }

    /// §6.7: Apple Silicon RAM từ 16 GB thì gói Chuẩn, còn lại gói Nhẹ.
    #[test]
    fn macs_by_ram() {
        let r = rules();
        assert_eq!(pack(recommend(&mac(16_384), &r)), "standard");
        assert_eq!(pack(recommend(&mac(15_000), &r)), "standard", "ngưỡng của manifest mẫu");
        assert_eq!(pack(recommend(&mac(14_999), &r)), "lite");
        assert_eq!(pack(recommend(&mac(8_192), &r)), "lite");
    }

    /// §6.7, §11 "card rời 4 GB và 6 GB": card rời từ 6 GB và RAM 16 GB thì gói Chuẩn; card 4 GB, GPU tích hợp, hay
    /// thiếu RAM thì gói Nhẹ.
    #[test]
    fn windows_by_ram_and_discrete_vram() {
        let r = rules();
        assert_eq!(pack(recommend(&windows(16_000, &[(true, 6_128)]), &r)), "standard");
        assert_eq!(pack(recommend(&windows(16_000, &[(true, 5_600)]), &r)), "standard");
        assert_eq!(
            pack(recommend(&windows(16_000, &[(true, 4_096)]), &r)),
            "lite",
            "card 4 GB"
        );
        assert_eq!(
            pack(recommend(&windows(16_000, &[(false, 16_000)]), &r)),
            "lite",
            "GPU tích hợp chưa tính"
        );
        assert_eq!(
            pack(recommend(&windows(16_000, &[(false, 512), (true, 8_192)]), &r)),
            "standard",
            "máy có cả GPU tích hợp và card rời"
        );
        assert_eq!(
            pack(recommend(&windows(8_000, &[(true, 8_192)]), &r)),
            "lite",
            "thiếu RAM"
        );
        assert_eq!(pack(recommend(&windows(16_000, &[]), &r)), "lite", "chưa dò được GPU");
        assert_eq!(
            pack(recommend(&mac(32_768), &r)),
            "standard",
            "luật Windows không áp cho Mac"
        );
    }

    /// §8: chưa hỗ trợ khi RAM dưới mức tối thiểu hay CPU không có AVX2 (Đ13).
    #[test]
    fn unsupported_machines() {
        let r = rules();
        assert_eq!(
            recommend(&mac(4_096), &r),
            Verdict::Unsupported {
                reason: Unsupported::LowRam
            }
        );
        let mut old = windows(16_000, &[(true, 8_192)]);
        old.avx2 = false;
        assert_eq!(
            recommend(&old, &r),
            Verdict::Unsupported {
                reason: Unsupported::NoAvx2
            }
        );
        assert_eq!(
            serde_json::to_value(recommend(&old, &r)).unwrap(),
            serde_json::json!({ "kind": "unsupported", "reason": "noAvx2" })
        );
    }

    /// Đ7: gói lai thêm bằng manifest, không sửa app (Q15).
    #[test]
    fn a_hybrid_pack_can_be_added_by_the_manifest() {
        let mut r = rules();
        r.rules.insert(
            0,
            Rule {
                pack: "hybrid".into(),
                os: Some(Os::Macos),
                min_ram_mib: Some(15_000),
                gpu: None,
                min_vram_mib: None,
            },
        );
        assert_eq!(pack(recommend(&mac(16_384), &r)), "hybrid");
        assert_eq!(pack(recommend(&mac(8_192), &r)), "lite");
    }
}
```

Sửa `src-tauri/src/sidecar/probe.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/probe.rs
+++ b/src-tauri/src/sidecar/probe.rs
@@ -123,4 +123,15 @@ mod tests {
     }
 
+    /// Kế hoạch 04 đề xuất gói theo VRAM của card rời: danh sách GPU giữ lại đủ trường.
+    #[test]
+    fn probe_output_keeps_the_gpu_list() {
+        let two = r#"[{"name":"Intel(R) UHD","device_type":"integrated","device_local_bytes":268435456,"vendor_id":32902},
+            {"name":"NVIDIA GeForce RTX 4050 Laptop GPU","device_type":"discrete","device_local_bytes":6425673728,"vendor_id":4318}]"#;
+        let gpus = parse_gpus(two);
+        assert_eq!(gpus.len(), 2);
+        assert_eq!(gpus[1].device_local_bytes, 6_425_673_728);
+        assert!(parse_gpus("vulkan-1.dll not found").is_empty());
+    }
+
     #[test]
     fn no_gpu_software_renderer_or_garbage_means_cpu() {
@@ -137,17 +148,12 @@ mod tests {
         // `false` thoát với mã 1. `yes` in mãi không thoát: stdout được đọc trên luồng riêng nên không nghẽn, quá thời gian
         // chờ thì bị kill, và kết quả là "chưa biết" (không nhớ).
-        assert_eq!(
-            run_probe(Path::new("/usr/bin/false"), Duration::from_secs(5)),
-            Some(false)
-        );
-        assert_eq!(run_probe(Path::new("/usr/bin/yes"), Duration::from_millis(200)), None);
-        assert_eq!(
-            run_probe(Path::new("/khong/co/file"), Duration::from_secs(1)),
-            Some(false)
-        );
+        let usable = |exe: &str, timeout: Duration| run_probe(Path::new(exe), timeout).map(|o| o.usable);
+        assert_eq!(usable("/usr/bin/false", Duration::from_secs(5)), Some(false));
+        assert_eq!(usable("/usr/bin/yes", Duration::from_millis(200)), None);
+        assert_eq!(usable("/khong/co/file", Duration::from_secs(1)), Some(false));
         // `true` thoát 0 mà không in danh sách GPU nào.
         assert_eq!(
             run_probe(Path::new("/usr/bin/true"), Duration::from_secs(5)),
-            Some(false)
+            Some(ProbeOutcome::default())
         );
     }
```

Sửa `src-tauri/src/sidecar/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/mod.rs
+++ b/src-tauri/src/sidecar/mod.rs
@@ -238,4 +238,8 @@ mod tests {
     #[test]
     fn a_timed_out_probe_is_not_remembered() {
+        let outcome = |usable| probe::ProbeOutcome {
+            usable,
+            gpus: Vec::new(),
+        };
         let probe = GpuProbe::default();
         let calls = AtomicUsize::new(0);
@@ -251,9 +255,12 @@ mod tests {
             probe.run(|| {
                 calls.fetch_add(1, Ordering::SeqCst);
-                Some(true)
+                Some(outcome(true))
             }),
-            Some(true)
+            Some(outcome(true))
+        );
+        assert_eq!(
+            probe.run(|| panic!("đã có kết quả thì không dò nữa")),
+            Some(outcome(true))
         );
-        assert_eq!(probe.run(|| panic!("đã có kết quả thì không dò nữa")), Some(true));
         assert_eq!(calls.load(Ordering::SeqCst), 2);
         // Một luồng đang dò: luồng khác chờ kết quả đó.
@@ -264,11 +271,11 @@ mod tests {
                 probe.run(|| {
                     std::thread::sleep(Duration::from_millis(100));
-                    Some(false)
+                    Some(outcome(false))
                 })
             })
         };
         std::thread::sleep(Duration::from_millis(20));
-        assert_eq!(probe.run(|| panic!("đang có người dò")), Some(false));
-        assert_eq!(slow.join().unwrap(), Some(false));
+        assert_eq!(probe.run(|| panic!("đang có người dò")), Some(outcome(false)));
+        assert_eq!(slow.join().unwrap(), Some(outcome(false)));
     }
 }
```

- [ ] **Step 3: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib -- models:: sidecar:: 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 42 previous errors; 2 warnings emitted
error[E0422]: cannot find struct, variant or union type `GpuInfo` in this scope
error[E0422]: cannot find struct, variant or union type `Gpu` in this scope
error[E0422]: cannot find struct, variant or union type `Machine` in this scope
error[E0422]: cannot find struct, variant or union type `ProbeOutcome` in module `probe`
error[E0422]: cannot find struct, variant or union type `Rule` in this scope
error[E0425]: cannot find function `detect` in this scope
error[E0425]: cannot find function `free_disk_bytes` in this scope
```

- [ ] **Step 4: Viết code**

Thêm vào `src-tauri/src/models/machine.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use std::path::Path;

use serde::Serialize;

use super::manifest::Os;
use crate::sidecar::probe::GpuInfo;

/// Một GPU dò được, rút gọn cho đề xuất gói và giao diện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub discrete: bool,
    /// Heap `DEVICE_LOCAL` lớn nhất, MiB.
    pub vram_mib: u64,
}

impl From<&GpuInfo> for Gpu {
    fn from(g: &GpuInfo) -> Self {
        Self {
            name: g.name.clone(),
            discrete: g.device_type == "discrete",
            vram_mib: g.device_local_bytes >> 20,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Machine {
    pub os: Os,
    pub ram_mib: u64,
    /// x64: CPU có AVX2. Apple Silicon luôn `true`.
    pub avx2: bool,
    pub gpus: Vec<Gpu>,
    /// Windows: đã có kết quả `--probe`. macOS luôn `true` (không cần dò).
    pub gpu_known: bool,
}

/// Máy đang chạy. `gpus`: kết quả `--probe` (Windows), `None` nếu chưa dò xong.
pub fn detect(gpus: Option<&[GpuInfo]>) -> Machine {
    Machine {
        os: if cfg!(windows) { Os::Windows } else { Os::Macos },
        ram_mib: total_ram_bytes().unwrap_or(0) >> 20,
        avx2: has_avx2(),
        gpus: gpus.unwrap_or_default().iter().map(Gpu::from).collect(),
        gpu_known: cfg!(not(windows)) || gpus.is_some(),
    }
}

#[cfg(target_arch = "x86_64")]
fn has_avx2() -> bool {
    std::arch::is_x86_feature_detected!("avx2")
}

#[cfg(not(target_arch = "x86_64"))]
fn has_avx2() -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn total_ram_bytes() -> Option<u64> {
    let mut value: u64 = 0;
    let mut len = std::mem::size_of::<u64>();
    // SAFETY: `hw.memsize` là số 64 bit; `value` và `len` sống suốt lời gọi.
    let rc = unsafe {
        libc::sysctlbyname(
            c"hw.memsize".as_ptr(),
            (&mut value as *mut u64).cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    (rc == 0 && value > 0).then_some(value)
}

#[cfg(windows)]
pub fn total_ram_bytes() -> Option<u64> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // SAFETY: `dwLength` đã đặt đúng kích thước của struct.
    unsafe { GlobalMemoryStatusEx(&mut status) }.ok()?;
    Some(status.ullTotalPhys)
}

/// Thư mục gần nhất đã có (thư mục model có thể chưa được tạo).
fn existing_ancestor(path: &Path) -> Option<&Path> {
    path.ancestors().find(|p| p.is_dir())
}

/// Dung lượng trống cho người dùng hiện tại trên ổ chứa `path`.
#[cfg(target_os = "macos")]
pub fn free_disk_bytes(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let dir = existing_ancestor(path)?;
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    // `statfs` (không phải `statvfs`): trên macOS số khối của `statfs` là 64 bit, không bị cắt với ổ lớn.
    // SAFETY: struct C toàn số, giá trị 0 hợp lệ.
    let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c` là chuỗi C hợp lệ, `stat` sống suốt lời gọi.
    let rc = unsafe { libc::statfs(c.as_ptr(), &mut stat) };
    (rc == 0).then(|| stat.f_bavail * u64::from(stat.f_bsize))
}

#[cfg(windows)]
pub fn free_disk_bytes(path: &Path) -> Option<u64> {
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::HSTRING;
    let dir = existing_ancestor(path)?;
    let mut free = 0u64;
    // SAFETY: `free` sống suốt lời gọi; hai tham số còn lại không dùng.
    unsafe { GetDiskFreeSpaceExW(&HSTRING::from(dir.as_os_str()), Some(&mut free), None, None) }.ok()?;
    Some(free)
}
```

Thêm vào `src-tauri/src/models/recommend.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use serde::Serialize;

use super::machine::Machine;
use super::manifest::{GpuKind, Recommend, Rule};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Unsupported {
    /// RAM dưới mức tối thiểu (§8: 8 GB).
    LowRam,
    /// CPU x64 không có AVX2 (§8, §6.12).
    NoAvx2,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Verdict {
    /// Máy chưa được hỗ trợ trong MVP. Người dùng vẫn chọn và tải được gói, nhưng app báo rõ.
    Unsupported {
        reason: Unsupported,
    },
    Recommend {
        pack: String,
    },
}

fn matches(rule: &Rule, machine: &Machine) -> bool {
    let os = rule.os.is_none_or(|os| os == machine.os);
    let ram = rule.min_ram_mib.is_none_or(|min| machine.ram_mib >= min);
    let gpu = match rule.gpu {
        None => true,
        Some(GpuKind::Discrete) => machine
            .gpus
            .iter()
            .any(|g| g.discrete && rule.min_vram_mib.is_none_or(|min| g.vram_mib >= min)),
    };
    os && ram && gpu
}

pub fn recommend(machine: &Machine, recommend: &Recommend) -> Verdict {
    if !machine.avx2 {
        return Verdict::Unsupported {
            reason: Unsupported::NoAvx2,
        };
    }
    if machine.ram_mib < recommend.min_ram_mib {
        return Verdict::Unsupported {
            reason: Unsupported::LowRam,
        };
    }
    let pack = recommend
        .rules
        .iter()
        .find(|rule| matches(rule, machine))
        .map_or(&recommend.fallback, |rule| &rule.pack);
    Verdict::Recommend { pack: pack.clone() }
}
```

Sửa `src-tauri/src/sidecar/probe.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/probe.rs
+++ b/src-tauri/src/sidecar/probe.rs
@@ -17,12 +17,24 @@ pub struct GpuInfo {
 }
 
-/// Có GPU chạy được Vulkan không: card rời hoặc GPU tích hợp. (Đề xuất gói theo VRAM là việc của kế hoạch 04.)
+/// Kết quả `--probe`: có GPU dùng được không, và danh sách GPU để đề xuất gói theo VRAM (kế hoạch 04).
+#[derive(Clone, Debug, Default, PartialEq, Eq)]
+pub struct ProbeOutcome {
+    pub usable: bool,
+    pub gpus: Vec<GpuInfo>,
+}
+
+/// Danh sách GPU trong stdout của `--probe`; đọc không được thì rỗng.
+pub fn parse_gpus(probe_stdout: &str) -> Vec<GpuInfo> {
+    serde_json::from_str(probe_stdout.trim()).unwrap_or_default()
+}
+
+fn any_usable(gpus: &[GpuInfo]) -> bool {
+    gpus.iter()
+        .any(|g| matches!(g.device_type.as_str(), "discrete" | "integrated"))
+}
+
+/// Có GPU chạy được Vulkan không: card rời hoặc GPU tích hợp.
 pub fn usable_gpu(probe_stdout: &str) -> bool {
-    serde_json::from_str::<Vec<GpuInfo>>(probe_stdout.trim())
-        .map(|gpus| {
-            gpus.iter()
-                .any(|g| matches!(g.device_type.as_str(), "discrete" | "integrated"))
-        })
-        .unwrap_or(false)
+    any_usable(&parse_gpus(probe_stdout))
 }
 
@@ -46,8 +58,8 @@ pub fn read_capped(mut source: impl std::io::Read, max: u64) -> String {
 }
 
-/// Chạy `exe --probe`, chờ tối đa `timeout`. `Some(true)`: có GPU dùng được. `Some(false)`: không có (lỗi chạy, mã thoát
-/// khác 0, hay danh sách không có GPU nào dùng được). `None`: quá giờ; bên gọi không nên nhớ kết quả này, để lần sau dò
-/// lại. stdout được đọc trên luồng riêng, để tiến trình in nhiều không bị nghẽn vì pipe đầy.
-pub fn run_probe(exe: &Path, timeout: Duration) -> Option<bool> {
+/// Chạy `exe --probe`, chờ tối đa `timeout`. `usable`: có GPU dùng được; `false` khi lỗi chạy, mã thoát khác 0, hay danh
+/// sách không có GPU nào dùng được. `None`: quá giờ; bên gọi không nên nhớ kết quả này, để lần sau dò lại. stdout được
+/// đọc trên luồng riêng, để tiến trình in nhiều không bị nghẽn vì pipe đầy.
+pub fn run_probe(exe: &Path, timeout: Duration) -> Option<ProbeOutcome> {
     let mut cmd = Command::new(exe);
     cmd.arg("--probe")
@@ -60,5 +72,5 @@ pub fn run_probe(exe: &Path, timeout: Duration) -> Option<bool> {
     pipeline::process::configure(&mut cmd);
     let Ok(mut child) = pipeline::process::spawn(&mut cmd, exe) else {
-        return Some(false);
+        return Some(ProbeOutcome::default());
     };
     let reader = child
@@ -93,5 +105,11 @@ pub fn run_probe(exe: &Path, timeout: Duration) -> Option<bool> {
     pipeline::process::release(child.id());
     let out = reader.and_then(|r| r.join().ok()).unwrap_or_default();
-    result.map(|ok| ok && usable_gpu(&out))
+    result.map(|ok| {
+        let gpus = if ok { parse_gpus(&out) } else { Vec::new() };
+        ProbeOutcome {
+            usable: any_usable(&gpus),
+            gpus,
+        }
+    })
 }
 
```

Sửa `src-tauri/src/sidecar/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/mod.rs
+++ b/src-tauri/src/sidecar/mod.rs
@@ -60,5 +60,5 @@ pub fn give_up_code(cause: GiveUpCause) -> &'static str {
 #[derive(Default)]
 pub struct GpuProbe {
-    result: Mutex<Option<bool>>,
+    result: Mutex<Option<probe::ProbeOutcome>>,
     running: Mutex<bool>,
     done: Condvar,
@@ -67,5 +67,5 @@ pub struct GpuProbe {
 impl GpuProbe {
     /// Kết quả đã có; đang dò thì chờ tối đa `wait`. Trả `None` nếu chưa có kết quả.
-    pub fn get(&self, wait: Duration) -> Option<bool> {
+    pub fn get(&self, wait: Duration) -> Option<probe::ProbeOutcome> {
         let running = self.running.lock().unwrap_or_else(|e| e.into_inner());
         let _running = self
@@ -73,12 +73,12 @@ impl GpuProbe {
             .wait_timeout_while(running, wait, |r| *r)
             .unwrap_or_else(|e| e.into_inner());
-        *self.result.lock().unwrap_or_else(|e| e.into_inner())
+        self.result.lock().unwrap_or_else(|e| e.into_inner()).clone()
     }
 
     /// Dò bằng `probe` nếu chưa có kết quả và chưa ai đang dò. Quá giờ (`None`) thì không nhớ.
-    pub fn run(&self, probe: impl FnOnce() -> Option<bool>) -> Option<bool> {
+    pub fn run(&self, probe: impl FnOnce() -> Option<probe::ProbeOutcome>) -> Option<probe::ProbeOutcome> {
         {
             let mut running = self.running.lock().unwrap_or_else(|e| e.into_inner());
-            if let Some(known) = *self.result.lock().unwrap_or_else(|e| e.into_inner()) {
+            if let Some(known) = self.result.lock().unwrap_or_else(|e| e.into_inner()).clone() {
                 return Some(known);
             }
@@ -91,5 +91,5 @@ impl GpuProbe {
         let outcome = probe();
         if outcome.is_some() {
-            *self.result.lock().unwrap_or_else(|e| e.into_inner()) = outcome;
+            *self.result.lock().unwrap_or_else(|e| e.into_inner()) = outcome.clone();
         }
         *self.running.lock().unwrap_or_else(|e| e.into_inner()) = false;
@@ -157,5 +157,5 @@ pub fn prepare<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<Pr
         app.state::<GpuProbe>()
             .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)))
-            .unwrap_or(false)
+            .is_some_and(|o| o.usable)
     } else {
         true
```

- [ ] **Step 5: Chạy test**

Run: `cargo test -p meeting-translator --lib -- models:: sidecar:: 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 57 passed; 0 failed; 0 ignored; 0 measured; 143 filtered out; finished in 0.67s
```

- [ ] **Step 6: Định dạng, clippy, code Windows, cargo deny**

`machine.rs` có code riêng cho Windows; kiểm nó biên dịch được bằng clippy cho target Windows (cần một lần `rustup target add x86_64-pc-windows-msvc`), rồi xóa thư mục build Windows nếu đĩa chật.

Run:

```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -E '^(warning|error)'
./scripts/check-windows.sh 2>&1 | grep -E '^(warning|error)|Finished' | sed -E 's/ in [0-9.]+s$//'
rm -rf "${CARGO_TARGET_DIR:-target}/x86_64-pc-windows-msvc"
cargo deny check 2>&1 | tail -1
```

Expected:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s)
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock src-tauri/Cargo.toml src-tauri/src/models/mod.rs src-tauri/src/models/machine.rs src-tauri/src/models/recommend.rs src-tauri/src/sidecar/probe.rs src-tauri/src/sidecar/mod.rs
git commit -q -m "feat(models): cấu hình máy và đề xuất gói theo ngưỡng của manifest; --probe giữ danh sách GPU (04 T5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Nguồn manifest: URL, tải và kiểm, chống quay lui, mỗi ngày một lần

Dòng 157, 163; QĐ2 (`sequence`), QĐ9, QĐ10:
- `src-tauri/src/models/source.rs`: URL theo loại bản (`STAGING_URL`, `PRODUCTION_URL`, `AT_MODELS_URL` cho bản dev), URL tuyệt đối của từng file, "đã tới lúc kiểm chưa", tải và kiểm `models.json` (tối đa 1 MiB), nhận hay từ chối manifest mới.

**Files:**
- Sửa: `src-tauri/src/models/mod.rs`
- Tạo: `src-tauri/src/models/source.rs`

- [ ] **Step 1: Viết test**

Sửa `src-tauri/src/models/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/mod.rs
+++ b/src-tauri/src/models/mod.rs
@@ -7,4 +7,5 @@ pub mod manifest;
 pub mod recommend;
 pub mod signed;
+pub mod source;
 pub mod store;
 #[cfg(test)]
```

Tạo `src-tauri/src/models/source.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Nguồn manifest model (spec §6.7): URL của `models.json`, tải và kiểm, chống quay lui về bản cũ, kiểm tối đa mỗi ngày
//! một lần.
//!
//! - Bản dev đọc URL staging (biến môi trường [`URL_ENV`] đè được, để trỏ tới server thử trên máy); bản phát hành chỉ
//!   đọc URL production. Chưa có URL thì app báo "chưa có nguồn model" và không gọi mạng.
//! - URL phải là `https`; riêng bản dev cho `http` tới `127.0.0.1` hay `localhost` (server thử).
//! - Chống quay lui: manifest có `sequence` nhỏ hơn bản đã nhận bị từ chối, kể cả khi chữ ký đúng (kẻ gian phát lại
//!   manifest cũ có model lỗi). Cùng `sequence` mà khác nội dung cũng bị từ chối.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::manifest::tests::sample;
    use crate::models::signed::tests::{signed_with_test_key, test_keys};
    use crate::models::test_http::{FakeServer, Fault};

    #[test]
    fn dev_builds_read_staging_or_the_env_and_release_builds_production() {
        assert_eq!(
            manifest_url_from(true, Some("https://stg.example/models.json".into())).map(String::from),
            Some("https://stg.example/models.json".into())
        );
        assert!(manifest_url_from(true, Some("http://127.0.0.1:9000/models.json".into())).is_some());
        assert!(manifest_url_from(true, Some("http://stg.example/models.json".into())).is_none());
        assert!(manifest_url_from(true, Some("không phải url".into())).is_none());
        assert_eq!(manifest_url_from(true, None).is_some(), STAGING_URL.is_some());
        assert_eq!(
            manifest_url_from(false, Some("https://stg.example/models.json".into())).is_some(),
            PRODUCTION_URL.is_some(),
            "bản phát hành bỏ qua biến môi trường"
        );
    }

    #[test]
    fn file_urls_resolve_against_the_manifest() {
        let m = crate::models::manifest::Manifest::parse(&serde_json::to_vec(&sample()).unwrap()).unwrap();
        let base = Url::parse("https://cdn.example/models/models.json").unwrap();
        assert_eq!(
            file_url(&base, &m.files[0]).unwrap().as_str(),
            "https://cdn.example/models/files/ggml-large-v3-turbo-q5_0.bin"
        );
        let mut absolute = m.files[0].clone();
        absolute.url = "https://other.example/x.bin".into();
        assert_eq!(
            file_url(&base, &absolute).unwrap().as_str(),
            "https://other.example/x.bin"
        );
        let local = Url::parse("http://127.0.0.1:9000/models.json").unwrap();
        assert_eq!(
            file_url(&local, &m.files[0]).unwrap().as_str(),
            "http://127.0.0.1:9000/files/ggml-large-v3-turbo-q5_0.bin"
        );
        absolute.url = "http://127.0.0.1:9000/x.bin".into();
        assert!(
            file_url(&base, &absolute).is_none(),
            "manifest https không trỏ sang http"
        );
    }

    #[test]
    fn checks_at_most_once_a_day() {
        let day = CHECK_EVERY_SECS;
        let never = StoreState::default();
        assert!(due(&never, 1_000));
        let checked = StoreState {
            last_check: Some(10 * day),
            ..StoreState::default()
        };
        assert!(!due(&checked, 10 * day + 1));
        assert!(!due(&checked, 11 * day - 1));
        assert!(due(&checked, 11 * day));
        assert!(due(&checked, 10 * day - 1), "giờ máy lùi");
    }

    #[test]
    fn fetch_verifies_the_signature() {
        let server = FakeServer::start();
        server.put("models.json", &signed_with_test_key(&sample()));
        let client = crate::models::download::client().unwrap();
        let (raw, checked) = fetch(&client, &server.url("models.json"), &test_keys()).unwrap();
        assert_eq!(checked.manifest.sequence, 3);
        assert_eq!(raw, signed_with_test_key(&sample()));
        assert!(
            server.requests()[0]
                .user_agent
                .as_deref()
                .unwrap()
                .starts_with("AI-Translator/")
        );
        assert!(matches!(
            fetch(&client, &server.url("models.json"), &[]),
            Err(FetchError::Signed(SignedError::UnknownKey(_)))
        ));
        let mut tampered = signed_with_test_key(&sample());
        let at = tampered.len() / 2;
        tampered[at] ^= 1;
        server.put("models.json", &tampered);
        assert!(matches!(
            fetch(&client, &server.url("models.json"), &test_keys()),
            Err(FetchError::Signed(_))
        ));
        assert_eq!(
            fetch(&client, &server.url("khong-co.json"), &test_keys()),
            Err(FetchError::Http(404))
        );
        server.fault(Fault::Status(503));
        assert_eq!(
            fetch(&client, &server.url("models.json"), &test_keys()),
            Err(FetchError::Http(503))
        );
        server.put("big.json", &vec![b' '; signed::MAX_BYTES + 10]);
        assert!(matches!(
            fetch(&client, &server.url("big.json"), &test_keys()),
            Err(FetchError::Signed(SignedError::Malformed(_)))
        ));
    }

    #[test]
    fn older_or_conflicting_manifests_are_refused() {
        let keys = test_keys();
        let signed_seq = |seq: u64, note: &str| {
            let mut body = sample();
            body["sequence"] = seq.into();
            body["packs"][0]["note"]["en"] = note.into();
            signed::verify(&signed_with_test_key(&body), &keys).unwrap()
        };
        let three = signed_seq(3, "a");
        assert_eq!(accept(None, &three), Ok(true));
        assert_eq!(accept(Some(&three), &signed_seq(4, "a")), Ok(true));
        assert_eq!(accept(Some(&three), &signed_seq(3, "a")), Ok(false));
        assert_eq!(
            accept(Some(&three), &signed_seq(2, "a")),
            Err(FetchError::Rollback { have: 3, got: 2 })
        );
        assert_eq!(accept(Some(&three), &signed_seq(3, "b")), Err(FetchError::Conflict(3)));
    }
}
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib models::source 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 45 previous errors; 1 warning emitted
error[E0422]: cannot find struct, variant or union type `StoreState` in this scope
error[E0425]: cannot find function `accept` in this scope
error[E0425]: cannot find function `due` in this scope
error[E0425]: cannot find function `fetch` in this scope
error[E0425]: cannot find function `file_url` in this scope
error[E0425]: cannot find function `manifest_url_from` in this scope
error[E0425]: cannot find value `CHECK_EVERY_SECS` in this scope
```

- [ ] **Step 3: Viết code**

Thêm vào `src-tauri/src/models/source.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use std::io::Read;

use reqwest::Url;
use reqwest::blocking::Client;

use super::manifest::FileEntry;
use super::signed::{self, Signed, SignedError, TrustedKey};
use super::store::StoreState;

/// URL `models.json` của bucket staging (R2). Task 12 của kế hoạch 04 (cần người) điền sau khi tạo bucket.
pub const STAGING_URL: Option<&str> = None;
/// URL `models.json` production: kế hoạch 07 điền khi có tên miền (T7) và manifest ký trong CI (T3).
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản dev: biến môi trường này đè URL staging.
pub const URL_ENV: &str = "AT_MODELS_URL";
/// Kiểm manifest tối đa mỗi ngày một lần (§6.7).
pub const CHECK_EVERY_SECS: u64 = 24 * 3600;

fn is_loopback(url: &Url) -> bool {
    matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
}

/// URL manifest theo loại bản và biến môi trường (hàm thuần, để test).
pub fn manifest_url_from(dev: bool, env: Option<String>) -> Option<Url> {
    let text = if dev {
        env.or_else(|| STAGING_URL.map(String::from))
    } else {
        PRODUCTION_URL.map(String::from)
    }?;
    let url = Url::parse(&text).ok()?;
    let ok = url.scheme() == "https" || (dev && url.scheme() == "http" && is_loopback(&url));
    ok.then_some(url)
}

/// URL manifest của bản đang chạy.
pub fn manifest_url() -> Option<Url> {
    manifest_url_from(tauri::is_dev(), std::env::var(URL_ENV).ok())
}

/// URL tuyệt đối của một file trong manifest. File phải cùng giao thức `https`, trừ khi chính manifest ở server thử
/// trên máy.
pub fn file_url(manifest_url: &Url, entry: &FileEntry) -> Option<Url> {
    let url = manifest_url.join(&entry.url).ok()?;
    let ok = url.scheme() == "https" || (url.scheme() == "http" && is_loopback(manifest_url) && is_loopback(&url));
    ok.then_some(url)
}

/// Đã tới lúc kiểm manifest chưa: chưa kiểm lần nào, đã qua một ngày, hay giờ máy lùi về trước lần kiểm.
pub fn due(state: &StoreState, now: u64) -> bool {
    state
        .last_check
        .is_none_or(|last| now < last || now - last >= CHECK_EVERY_SECS)
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum FetchError {
    #[error("lỗi mạng: {0}")]
    Network(String),
    #[error("server trả HTTP {0}")]
    Http(u16),
    #[error(transparent)]
    Signed(#[from] SignedError),
    #[error("manifest cũ hơn bản đã có ({got} < {have})")]
    Rollback { have: u64, got: u64 },
    #[error("manifest cùng số {0} nhưng khác nội dung")]
    Conflict(u64),
}

/// Tải và kiểm `models.json`. Trả nguyên văn (để lưu) cùng manifest đã kiểm.
pub fn fetch(client: &Client, url: &Url, keys: &[TrustedKey]) -> Result<(Vec<u8>, Signed), FetchError> {
    let response = client
        .get(url.clone())
        .send()
        .map_err(|e| FetchError::Network(e.to_string()))?;
    if !response.status().is_success() {
        return Err(FetchError::Http(response.status().as_u16()));
    }
    let mut raw = Vec::new();
    response
        .take(signed::MAX_BYTES as u64 + 1)
        .read_to_end(&mut raw)
        .map_err(|e| FetchError::Network(e.to_string()))?;
    let checked = signed::verify(&raw, keys)?;
    Ok((raw, checked))
}

/// Có nhận manifest `new` thay cho `current` không. `Ok(true)`: bản mới hơn; `Ok(false)`: đúng bản đang có.
pub fn accept(current: Option<&Signed>, new: &Signed) -> Result<bool, FetchError> {
    let Some(current) = current else {
        return Ok(true);
    };
    let (have, got) = (current.manifest.sequence, new.manifest.sequence);
    if got > have {
        Ok(true)
    } else if got < have {
        Err(FetchError::Rollback { have, got })
    } else if current.manifest == new.manifest {
        Ok(false)
    } else {
        Err(FetchError::Conflict(got))
    }
}
```

- [ ] **Step 4: Chạy test**

Run: `cargo test -p meeting-translator --lib models:: 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 44 passed; 0 failed; 0 ignored; 0 measured; 161 filtered out; finished in 0.64s
```

- [ ] **Step 5: Định dạng, clippy**

Run: `cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)'`

Expected:

```text
0
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models/mod.rs src-tauri/src/models/source.rs
git commit -q -m "feat(models): nguồn manifest: URL theo bản, tải và kiểm, chống quay lui, kiểm mỗi ngày một lần (04 T6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Làm tiếp 04b, Task 7.
