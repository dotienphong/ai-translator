# Nghiệm thu và phát hành "Phân biệt người nói" (kế hoạch 07)

## Câu hỏi

Spec §11 (hiệu năng), §12 (kiểm thử, nghiệm thu), §13 mục 7: A-spk1…A-spk7 có đạt trên bản ứng viên không, và điều kiện nào còn thiếu trước khi bật tính năng cho người dùng (app 0.3.2 "ngủ", rồi bật bằng manifest số 4)?

## Điều kiện

| | |
|---|---|
| Máy | Mac (macOS 26.6.2, M4 Pro, 12 lõi), Rust 1.98.1, Node 24.21.0 |
| Nhánh | `phan-biet-nguoi-noi`, `HEAD` `4f15eff4` (cây git sạch, 0 thay đổi lúc bắt đầu) |
| Ngày | 2026-10-28 |
| `origin/main` | đi trước nhánh 24 commit (đều là commit website, mới nhất `ffc8fcc0`); `tauri.conf.json` ở `origin/main` ghi `0.3.1`; tag mới nhất `v0.3.1` (trước đó `v0.3.0`, `v0.2.9`), không có tag cao hơn. Vậy bản kế là **0.3.2**, giữ nguyên số bản trong kế hoạch |
| Ghi chú Step 1 | kế hoạch nói "sáu commit đầu là `ab90f013`"; thực tế `HEAD` đã đi tiếp vì có hai commit tài liệu (`a713bc72` kết quả thử Trợ năng, `4f15eff4` kế hoạch 07). Không phải lỗi |
| Quyền commit | chủ dự án đã uỷ quyền commit cục bộ (2026-10-28); không push, không amend, không rebase |
| Đĩa lúc bắt đầu | 23,4 GiB trống (cổng 14 GiB đạt; cổng 18 GiB của `--release` đạt) |

## Điều kiện đầu vào

Những việc còn chờ chủ dự án (chép từ `04-thu-that.md`, `05-windows.md`, `06-van-hanh.md`):

| Mục còn chờ | Nguồn | Ảnh hưởng tới phát hành |
|---|---|---|
| Trạng thái `Ok` (có tên và chỉ báo "đang nói") cần khách thật trong họp; chi phí đọc khi nhiều người tham dự; bộ đọc macOS với app thật (04b Task 20, 21) | `04-thu-that.md` mục "Không đo được hoặc chưa thử", `04-do.md` | Teams macOS phải đạt A-spk3 (Task 18) trước khi bật; chưa đạt thì chỉ phát hành bản ngủ |
| Quyền Trợ năng: cấp quyền ngay lúc phiên đang chạy ("không cần khởi động lại ngay trong phiên"); tắt rồi mở lại quyền, file dấu còn nguyên | `04-thu-that.md` | Không chặn phát hành; ghi trong "Chưa kiểm" |
| Công thức tải từ xa: log "chưa tải được (HTTP 404)" vì chưa đăng công thức nào lên R2 (06b Task 18) | `04-thu-that.md`, `06-van-hanh.md` | Bản ngủ không tải công thức; phải đăng và kiểm trước khi bật |
| Task 10 bản ghi Teams trên Windows: **Chờ chủ dự án** | `05-windows.md` | Windows giữ tắt (`SHIPS_ON_WINDOWS = false`) |
| Task 11 công thức Teams Windows, Task 12 chi phí đọc: **Chờ bản ghi Task 10** | `05-windows.md` | Windows giữ tắt |
| Task 13 Meet (Chrome, Edge) và Zoom trên Windows: **Chờ chủ dự án** | `05-windows.md` | Meet và Zoom giữ ngoài công thức |
| Hành vi thật của `GetPackageFullName` (Teams MSIX) và `GetFileVersionInfoW` trên Windows: mới qua clippy chéo (06b Task 20) | `06-van-hanh.md` | Windows giữ tắt |
| Đường tải công thức qua R2 thật, workflow `sign-recipes.yml` chưa chạy thật (06b Task 18) | `06-van-hanh.md` | Chặn bật, không chặn bản ngủ |
| Email cảnh báo thật `speaker_health_degraded`, `speaker_canary_failed`; migration 0007 và cron trên production (06b Task 17, 21) | `06-van-hanh.md` | Triển khai server trước khi bật |
| Bộ chuyển (cuộc họp thử với app chủ phòng thật, hai khách trình duyệt tự động), quyền Trợ năng khi chạy bằng launchd (06b Task 19) | `06-van-hanh.md` | Kiểm tra tự động hằng ngày chưa có; không chặn bản ngủ |
| Task Scheduler trên Windows (06b Task 20) | `06-van-hanh.md` | Windows giữ tắt |
| Mẫu nhãn ngoài tiếng Anh và tiếng Việt của Teams (06b Task 22) | `06-van-hanh.md` | Chữ trong app chỉ nói "Teams"; nhãn các ngôn ngữ khác chưa kiểm |
| Meet và Zoom vào công thức và kiểm tra tự động: chưa đạt tiêu chí kế hoạch 04 | `06-van-hanh.md` | Giữ ngoài công thức |

## Số test nền (2026-10-28, `HEAD` `4f15eff4`, trước khi sửa gì)

Cây git sạch, không file nào bị sửa. Tất cả khớp số đo ở `06-van-hanh.md`.

| Bộ | Kết quả thật |
|---|---|
| `speaker-protocol` | 15 đạt |
| `speaker-recipe` | 8 đạt |
| `speaker-ops` | 41 đạt, 1 bỏ qua |
| `speaker-canary` | 13 đạt |
| `speaker-worker` lib | 167 đạt, 5 bỏ qua |
| `speaker-worker` `worker_process` | 10 đạt |
| `pipeline` lib | 360 đạt |
| `pipeline` `speaker_client` | 31 đạt |
| app (`meeting-translator --lib`) | 957 đạt, 6 bỏ qua |
| server (vitest) | 47 file, 1 694 test đạt |
| Web Admin (vitest) | 51 file, 1 159 test đạt |
| vitest gốc | 35 file, 430 test đạt |
| website (`pnpm test`, `node --test`) | 300 test: 294 đạt, 0 lỗi, 6 bỏ qua |
| `node --test` (release, models, dev-env, run-dev-app, speaker-recipes, canary) | 253 đạt, 0 lỗi |

Lưu ý công cụ: Node 24 không in dòng `# pass` khi chạy không có terminal (reporter mặc định đổi); phải thêm `--test-reporter=tap` (website in dòng `ℹ pass`). Lần chạy đầu của hai bộ này không in số nên chạy lại với reporter `tap`.

## Thư viện (Task 1)

Đo 2026-10-28. Bản mới nhất ổn định lấy từ API crates.io (`max_stable_version`, trùng `cargo search`; `libc` 1.0.0-alpha.5 là bản tiền phát hành, không dùng).

| Gói | Cũ | Mới | MSRV | Yanked |
|---|---|---|---|---|
| `libc` | 0.2.189 | 0.2.191 | 1.65 | không |
| `sha2` | 0.11.0 | 0.11.1 | 1.88 | không |
| `serde_json` | 1.0.151 | 1.0.154 | 1.71 | không |
| `realfft` | 3.5.0 | 3.5.1 | 1.61 | không |

`Cargo.lock` đổi 12 dòng mỗi phía: `version` và `checksum` của bốn gói (8) cộng bốn dòng tham chiếu `sha2 0.11.1` của các crate phụ thuộc. `sha2 0.10.9` (gián tiếp) giữ nguyên. Lần `cargo update -p` còn tự đổi `cssparser-macros` từ `syn 3.0.6` sang `syn 2.0.119` (yêu cầu `>=2,<4`, ngoài danh sách nâng); đã hoàn lại tay, `cargo metadata --locked` vẫn đạt.

Kết quả: fmt ok; clippy workspace sạch (chỉ một cảnh báo từ build script `whisper-rs-sys`, bên thứ ba, có từ trước); `cargo test --locked --workspace` 1 949 đạt, 0 lỗi, 25 bỏ qua; `asr-worker --features shared-encode` ok; B' trên model thật (`steps_match…`, `embedding_matches_onnxruntime`) 2 đạt; `check-windows.sh --locked` thoát 0 (có thêm `speaker-ops`, `speaker-canary`); `cargo deny` sạch; `cargo audit` chỉ sáu cảnh báo cũ; `check-no-network.sh` sạch; `cargo tree -d`: `sha2` hai bản (0.10.9, 0.11.1), `libc`, `serde_json`, `realfft` một bản; không có ggml trong app.

`pnpm outdated` (chỉ ghi, không nâng): gốc `@vitejs/plugin-react` 6.1.1→6.1.2, `react`/`react-dom` 19.3.0→19.3.1, `vite` 8.3.4→8.3.5, `vitest` 5.0.3→5.0.5, `zustand` 5.0.15→5.0.16; server `hono` 4.13.12→4.13.14, `@cloudflare/vitest-plugin` 1.3.4→1.4.8, `@cloudflare/workers-types`, `wrangler` 4.145.0→4.153.0, `vitest` 4.1.11→5.0.5; website `wrangler` 4.148.0→4.153.0. Không thuộc kế hoạch này.

## Công tắc (Task 2)

Hằng `SHIPS_ON_WINDOWS = false`, hàm `ships_on(os)` (macOS bật, Windows theo hằng, khác tắt), `enabled()` của bản phát hành = `ships_on(std::env::consts::OS)`; bản debug giữ cờ dev. `ModelService::speaker_offered()` (manifest có mục `speaker` dùng được cho bản này) làm tính năng "ngủ": vòng tải công thức (`speaker/recipes.rs`) chỉ chạy khi `speaker_offered()`, nhóm Cài đặt "Người nói" chỉ hiện khi `speakerAvailable` và `ModelsView.speaker != unavailable`. Phiên dịch chỉ chạy `speaker-worker` khi `speaker_model()` có file (đã vậy từ kế hoạch 02); báo cáo tình trạng chỉ sinh ra khi worker chạy.

Test: app lib (debug) 960 đạt, 6 bỏ qua (957 + 3 test mới, trong đó hai test cổng release cũ bị thay, xem dưới); vitest 35 file/431 test; `tsc --noEmit` sạch; clippy macOS và `scripts/check-windows.sh --locked` sạch (0 cảnh báo); `cargo fmt --all -- --check` sạch; `node --test` 108 đạt, 0 lỗi; `check-no-network.sh` và `cargo deny check` sạch. Bản release: `cargo test --release --locked -p meeting-translator --lib -- speaker:: pro:: license:: diagnostics:: db::` 304 đạt (303 + 1), gồm `release_builds_follow_the_platform_table_not_the_environment`.

Sửa ngoài chữ kế hoạch: hai test chỉ chạy ở bản release (`release_builds_never_enable_speaker`, `release_builds_never_activate_speaker_whatever_the_settings`) khẳng định tính năng luôn tắt, sẽ đỏ trên macOS sau khi đổi công tắc; thay bằng `release_builds_follow_the_platform_table_not_the_environment` (theo kế hoạch) và `release_builds_activate_speaker_per_platform_table_and_settings`. Bảy chú thích còn nói "tắt tới kế hoạch 07" sửa lại (`settings/mod.rs`, `state.rs`, `lib.rs`, `speaker/mod.rs` ba chỗ, `src/lib/ipc.ts`) và biểu ngữ cảnh báo của `scripts/run-dev-app.sh`.

## Model và giấy phép (Task 4)

Ngày 2026-10-28. Ba SHA-256 (tính bằng `shasum -a 256`, khớp kế hoạch):

| File | Byte | SHA-256 |
|---|---|---|
| `eres2net-sv-en-voxceleb-16k.onnx` (file đã nghiệm thu, sẽ đăng) | 26 496 496 | `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e` |
| `eres2net-sv-en-voxceleb-16k.orig.onnx` (bản gốc của sherpa-onnx) | 26 485 263 | `c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5` |
| `eres2net-sv-en-voxceleb-16k-LICENSE.txt` = `licenses/models/3D-Speaker-LICENSE.txt` | 11 357 | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |

Nguồn giấy phép đã đọc (2026-10-28):

- `https://github.com/modelscope/3D-Speaker` (README, mục License): "3D-Speaker is released under the Apache License 2.0." Không có dòng bản quyền (Copyright) nào. README không liệt kê model ERes2Net VoxCeleb tiếng Anh trong các model đã huấn luyện của nó.
- ModelScope, model `iic/speech_eres2net_sv_en_voxceleb_16k` (API `api/v1/models/…` và `README.md` của model, đọc bằng curl): `license: Apache License 2.0`; không có dòng bản quyền.
- `https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models` (qua API GitHub): có tài sản `3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx`, 26 485 263 byte (đúng cỡ file `.orig.onnx`); trang ghi "Each model has its own license. Please see the corresponding repository for the specific license of a given model." (GitHub không trả SHA-256 của tài sản; SHA-256 `c59158…2db5` là hằng `SHA_GOC` trong `prepare_model.py`, lấy từ lần tải trước).
- Văn bản giấy phép: đối chiếu với `LICENSE-APACHE` chuẩn trong `~/.cargo/registry` (`addr2line-0.25.1`): giống hệt khi bỏ khoảng trắng đầu/cuối dòng và dòng trống. Đoạn mẫu "Copyright [yyyy] [name of copyright owner]" là phụ lục chuẩn của Apache-2.0, chưa điền; vì không nguồn nào ghi chủ bản quyền, `THIRD_PARTY_NOTICES` KHÔNG thêm dòng Copyright nào.

Phần sửa đổi trong mục thông báo: kế hoạch ghi "operators folded, no weight changed"; chỉ có thể kiểm chứng rằng `prepare_model.py` chạy `onnxsim.simplify` rồi lưu, nên bản trong repo ghi "simplified with onnxsim; the model was not retrained or fine-tuned".

Test: `node --test` của `notices.test.mjs` + `speaker-manifest.test.mjs`: 16 đạt, 0 lỗi. Cả bộ CI (`scripts/release/*.test.mjs` + `scripts/models/{manifest,update,speaker-manifest}.test.mjs` + `scripts/dev-env.test.mjs` + `scripts/run-dev-app.test.mjs`): 226 đạt, 0 lỗi. Cổng kiểm `check_manifest_body` (app, thư mục tạm): `sequence 3 -> 4, không đổi id`, `test result: ok`; không có `released/body-4.json` trong repo.

## Bản release cục bộ (Task 6)

Ngày 2026-10-28, HEAD `6f5d4153`, `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 MACOSX_DEPLOYMENT_TARGET=14.2`. Không chạy app, không chạm app thật. Cổng đĩa của task này: bắt đầu build khi còn ≥ 14 GiB (đo 17, 16, 15, 15 GiB), dừng nếu < 12 GiB; sau cùng còn 15,4 GiB.

| Bước | Kết quả |
|---|---|
| 1. Test bản release (`pnpm build` thoát 0, rồi `cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: db:: --test-threads=1`) | `test result: ok. 304 passed; 0 failed; 0 ignored; 658 filtered out`, 2,38 s (lượt Task 0 là 303) |
| 2. Dựng app release, `release-check.mjs no-dev-gate target/release/meeting-translator` | build 2 phút 36 giây; thoát 0 ("không có mã công tắc dev"); binary app 14 699 936 byte |
| 2. Chuỗi cấm trong binary app (`strings -a … \| grep -c`) | `AI_TRANSLATOR_DEV_SPEAKER` **0**; `AI_TRANSLATOR_DEV_PRO` **0**; `AI_TRANSLATOR_DEV_REPORTS` **0**; `aitranslator.io.vn` **0** |
| 3. `speaker-worker` release | **4 275 488 byte** (gzip 1 637 830); `check-no-network.sh --binary target/release/speaker-worker` thoát 0 ("không có mã mạng"); `minos 14.2`, `sdk 27.0`; liên kết: `ApplicationServices`, `CoreFoundation`, `libiconv.2`, `libSystem.B` |
| 4. Đọc mã "ngủ/thức" | `speaker_offered`: định nghĩa `models/service.rs:890`, dùng ở vòng tải công thức `speaker/recipes.rs:179` (đúng hai chỗ trong mã chạy; ngoài ra một chú thích đầu `recipes.rs` và test `service.rs:2046`); `speakerModel !== "unavailable"` đúng một dòng, `SubtitleSettings.tsx:36`. "Thức/ngủ" chạy thật kiểm ở Task 21–22 |
| 5. `scripts/release/check-release-config.sh` | thoát 0, "hai cấu hình đóng gói hợp lệ" (macOS và Windows; chép đủ `speaker-worker` và `THIRD_PARTY_NOTICES.txt`) |
| 5. `node --test --test-reporter=tap "scripts/release/*.test.mjs"` | 87 đạt, 0 lỗi |

Ước tính kích thước đóng gói: `.dmg` 0.3.1 9 980 110 byte + worker nén gzip 1 637 830 byte ≈ 11,6 MB (Windows chưa dựng lại ở Task này; ước tính cũ ≈ 22,6 MB); giới hạn 60 MB, dưới gần 5 lần. Số thật ở Task 21 Step 7.

Sai lệch so với kế hoạch (không ảnh hưởng kết luận):

- **Kích thước worker lệch +49%** so với 2 867 152 byte (spec §4.1; số đó đo ở kế hoạch 02, trước khi có bộ đọc tên). Nguyên nhân khả dĩ, đã đối chiếu mã: kế hoạch 04–05 thêm `reader/macos.rs` (đọc cây Accessibility qua `ApplicationServices`) và phụ thuộc `core-foundation` 0.10.1 cho macOS, nên binary lớn hơn và có thêm hai framework hệ thống `ApplicationServices`, `CoreFoundation` (kế hoạch ghi "chỉ `libSystem` và `libiconv`"). Cả hai là framework có sẵn của macOS, không phải thư viện lạ; không có mã mạng (cổng `check-no-network.sh` đạt). Chưa kiểm cách khác để loại trừ nguyên nhân khác (vd. cấu hình tối ưu hóa). Còn dư rất nhiều so với 60 MB.
- **Số test `release_builds`**: kế hoạch nói `--list … | grep -c release_builds` ra `1`; thực tế ra `2` (`release_builds_activate_speaker_per_platform_table_and_settings` của lượt trước và `release_builds_follow_the_platform_table_not_the_environment` của Task 2). Test chỉ-release mới có chạy.
- **Số test tăng 303 → 304 (một, không phải hai như kế hoạch viết)**: đối chiếu `git diff ab90f013 HEAD` của `speaker/mod.rs`: Task 2 thêm `the_release_ships_on_the_audited_platforms_only` và `release_builds_follow_the_platform_table_not_the_environment` (chạy ở bản release), thêm `debug_builds_stay_opt_in` (chỉ bản debug), bỏ `release_builds_never_enable_speaker` và đổi tên `release_builds_never_activate_speaker_whatever_the_settings` thành `release_builds_activate_speaker_per_platform_table_and_settings`; ở bản release: +2 −1 = +1. Khớp số đo của Task 2 (304).
- **`check-release-config.sh` lần đầu thoát 1** vì thiếu `THIRD_PARTY_NOTICES.txt` (file sinh ra, bị gitignore; CI chạy `notices.mjs` trước). Đã chạy `node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --no-llama` (143 văn bản giấy phép, 513 crate, 5 gói npm, 9 mục C/C++ và model; không lỗi), chạy lại thoát 0, rồi xóa đúng file đó (file do task này tạo). Cây git sạch.
- Kiểm bằng `--test-reporter=tap` vì không có terminal.

## Test nền ở bản release (Task 0 Step 5)

Lệnh: `pnpm build` (thoát 0) rồi `cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: db:: --test-threads=1`, với `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 MACOSX_DEPLOYMENT_TARGET=14.2`, đĩa 21 GiB trống (cổng 18 GiB đạt).

Kết quả: `test result: ok. 303 passed; 0 failed; 0 ignored; 657 filtered out`, chạy test 1,8 s. Hai test công tắc có sẵn đều đạt ở bản release: `release_builds_never_enable_speaker`, `release_builds_never_activate_speaker_whatever_the_settings`. Test `release_builds_follow_the_platform_table_not_the_environment` chưa có (Task 2 thêm).

Ghi chú: kế hoạch dự kiến 30–60 phút (LTO) nhưng lần này chỉ mất khoảng 4 phút (giải thích khả dĩ, chưa kiểm: `target/` của worktree đã có sẵn artefact release của các lượt trước); lần chạy đầu không có `dist/` nên `pnpm build` chưa chạy được (lỗi script của tôi: biến đường dẫn log rỗng), test vẫn đạt 303; chạy lại sau `pnpm build` thật, vẫn 303 đạt. Đĩa sau khi chạy: 21 GiB. Không có tiến trình nền nào còn sót.

## A-spk1, A-spk2, A-spk7 trên bản ứng viên (Task 7)

Ngày 2026-10-28, ứng viên = `HEAD` `444aa12c` (cây git sạch). Dựng `latency-bench` và `speaker-worker` bản release (`MACOSX_DEPLOYMENT_TARGET=14.2`, `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0`, `Finished` sau 1 phút 40 giây, đĩa 44 GiB trống). Đường đo đúng kế hoạch: `latency-bench speaker-eval --worker` (Silero VAD + `Segmenter` của app, `speaker-worker` thật, PCM 16 bit, A2 4 s, θ = 0,35, không gộp) rồi `score_spk.py`. Model nhúng lấy ở `$DATA/models/eres2net-sv-en-voxceleb-16k.onnx` (SHA khớp bản `dev-models`; kế hoạch viết `$M/models/…` nhưng file ở `$DATA/models`), Silero ở `$M/models/silero_vad_v6.2.3.onnx`; RTTM nằm ở `$DATA/out/<tên>.rttm` (AMI) và `$DATA/out/vi/<tên>.rttm` (tiếng Việt). Kết quả thô ở `$DATA/out/07/{ami,vi}/` (ngoài repo).

**Kết luận: không thụt lùi. A-spk1 đạt (91,6% và 84,8%), A-spk2 đạt (93,9%): trùng mốc kế hoạch 02 tới chữ số thập phân thứ nhất, từng bản ghi cũng trùng. A-spk7 phần tự động đạt.**

### A-spk1: AMI, 4 bản ghi kiểm

| Bản ghi | Dòng ≥ 1 s | Mọi dòng | Thời lượng | Giọng/người | Mốc 02 (≥ 1 s / mọi dòng) |
|---|---|---|---|---|---|
| IS1009a.Mix-Headset | 89,6% | 85,7% | 75,0% | 5/4 | 89,6 / 85,7 |
| EN2002a.Mix-Headset | 86,5% | 79,5% | 64,3% | 8/4 | 86,5 / 79,5 |
| IS1009a.Array1-01 | 96,3% | 85,3% | 78,9% | 4/4 | 96,2 / 85,3 |
| ES2004a.Array1-01 | 94,2% | 88,7% | 79,5% | 6/4 | 94,2 / 88,7 |
| **Trung bình** | **91,6%** | **84,8%** | | | **91,6 / 84,8** |

Mức đạt: ≥ 85% và ≥ 80% (đạt, tính theo trung bình các bản ghi kiểm). Lệch mốc 0,0 / 0,0 điểm (giới hạn thụt lùi 1 điểm). (IS1009a.Array1-01: 154/160 = 96,25%, làm tròn 96,3% ở đây và 96,2% ở 02; cùng một số đoạn.) Theo từng bản ghi, EN2002a mọi dòng 79,5% < 80% như ở kế hoạch 02 (chỉ để biết; mức đạt tính trung bình).

### A-spk2: tiếng Việt, 8 bản ghi kiểm

| Bản ghi | Dòng ≥ 1 s | Mọi dòng | Giọng/người | Mốc 02 (≥ 1 s) |
|---|---|---|---|---|
| cv-vi-03 | 97,8% | 91,5% | 3/3 | 97,8 |
| cv-vi-04 | 98,9% | 94,8% | 3/3 | 98,9 |
| cv-vi-05 | 94,7% | 89,6% | 4/4 | 94,7 |
| cv-vi-06 | 97,7% | 88,1% | 4/3 | 97,7 |
| cv-vi-03 Opus | 97,7% | 92,4% | 3/3 | 97,7 |
| cv-vi-04 Opus | 99,0% | 94,9% | 3/3 | 99,0 |
| cv-vi-05 Opus | **67,7%** | 66,4% | 3/4 | 67,7 |
| cv-vi-06 Opus | 97,7% | 88,2% | 3/3 | 97,7 |
| **Trung bình** | **93,9%** | | | **93,9** |

Mức đạt ≥ 85% (đạt). 7/8 bản ≥ 85%; thấp nhất cv-vi-05 Opus 67,7% (hai người giống giọng bị gộp thành một giọng) là rủi ro đã biết (spec §14), không đổi so với 02, không thêm bản nào rơi dưới 85%.

### Tất định

Chạy lại IS1009a.Array1-01 (`$DATA/out/07/ami/IS1009a.Array1-01.rerun.jsonl`). **`cmp` thẳng hai file `.jsonl` KHÁC** ("differ: char 33, line 1") vì mỗi dòng có trường `embed_ms` (thời gian nhúng đo lúc chạy, 260/260 dòng khác). Bỏ trường đó thì hai file **giống hệt** (260 dòng: `confidence`, `end_ms`, `start_ms`, `voice` đều giống) và điểm chấm lại bằng đúng số cũ (96,25% / 85,3%, 4 giọng). Kết luận: nhãn và độ tin tất định; `cmp` nguyên file không dùng được vì có trường thời gian (sai lệch so với kế hoạch, không phải lỗi tính năng; ở 02 so "điểm và nhãn", không so byte).

### Thời gian khứ hồi, RSS, CPU của worker (ghi lại, không phải mức đạt của task này)

| Bản ghi | Đoạn có nhúng | p50 / p90 (ms) | Xong ≤ 230 ms | RSS đỉnh (MB) | CPU % một lõi |
|---|---|---|---|---|---|
| IS1009a.Mix-Headset | 226 | 98,4 / 198,3 | 222/226 | 202,0 | 7,40 |
| EN2002a.Mix-Headset | 756 | 78,7 / 195,7 | 738/756 | 173,6 | 7,62 |
| IS1009a.Array1-01 | 227 | 87,9 / 196,1 | 226/227 | 212,5 | 7,54 |
| ES2004a.Array1-01 | 255 | 77,4 / 183,2 | 255/255 | 257,7 | 8,05 |
| cv-vi-03 / 04 / 05 / 06 | 107 / 129 / 114 / 135 | 78,4 / 76,9 / 84,2 / 63,8 (p50); 140,4 / 132,1 / 143,3 / 115,4 (p90) | tất cả đủ | 190,2 / 234,9 / 251,5 / 185,3 | 8,50 / 8,39 / 8,56 / 8,47 |
| cv-vi-03 / 04 / 05 / 06 Opus | 108 / 131 / 115 / 135 | 76,4 / 73,9 / 77,0 / 65,5 (p50); 136,6 / 128,5 / 142,4 / 122,8 (p90) | tất cả đủ | 191,8 / 224,7 / 262,2 / 182,2 | 8,43 / 8,44 / 8,37 / 8,82 |

Lưu ý quan trọng: **máy KHÔNG rảnh trong lúc đo** (người dùng khác và app của họ đang chạy: `uptime` trung bình 1 phút 9,0 lúc bắt đầu, 11,5 ở cuối trên 12 lõi; trong 02 là 4–8). Điểm nhãn không phụ thuộc tải (tất định, ở trên) nên A-spk1/A-spk2 không bị ảnh hưởng; nhưng **số thời gian ở bảng này bị nhiễu và không dùng làm số A-spk4**: ở bốn đoạn của IS1009a.Mix-Headset, 18 của EN2002a, một của IS1009a.Array1-01 khứ hồi vượt 230 ms (tổng 23/1 464 đoạn AMI; ở 02 là 0/2 438 khi tải 4–8), còn tiếng Việt vẫn đủ 100%. Số đo độ trễ chính thức phải làm ở Task 8 trên máy rảnh. RSS vượt 250 MB ở ES2004a.Array1-01 (257,7) và cv-vi-05 (251,5), cv-vi-05 Opus (262,2); CPU tiếng Việt 8,37–8,82% > 8%: cùng kiểu vượt ngân sách đã ghi ở `02-nhan-giong-worker.md` (A-spk5, soak Task 9), không đổi hành vi so với 02.

### A-spk7: phần kiểm được tự động (HEAD `444aa12c`)

| Kiểm | Kết quả thật |
|---|---|
| `cargo deny check` | `advisories ok, bans ok, licenses ok, sources ok` |
| `cargo audit` | **chạy được** (tải cơ sở dữ liệu advisory từ mạng, 1 380 advisory, quét 724 crate): 0 lỗ hổng; 6 cảnh báo đã cho phép (`paste` RUSTSEC-2024-0370, `glib` RUSTSEC-2024-0429, RUSTSEC-2024-0436, `zvariant` RUSTSEC-2026-0370, `zvariant_derive` RUSTSEC-2026-0372, RUSTSEC-2026-0371): đúng sáu cảnh báo cũ của Task 1 |
| `check-no-network.sh speaker-worker speaker-protocol speaker-recipe` | "không có mã mạng" (cây phụ thuộc hai nền tảng, feature Windows, mã nguồn) |
| app `--lib -- acl_tests speaker::health diagnostics::` | `ok. 102 passed; 0 failed` (7 `acl_tests` + 8 `speaker::health` + 87 `diagnostics::`) |
| `cargo test --locked -p speaker-ops` | `ok. 41 passed; 0 failed; 1 ignored` |
| server `vitest run test/speaker-health.test.ts` | 1 file, 21 test đạt |

## A-spk4 và nhãn muộn (Task 8)

**Chưa chạy.** Chờ máy rảnh; không có số mới.

## Soak (Task 9)

**Chưa chạy.** Soak > 1 giờ cần máy rảnh; không có số mới.

## Kiểm cuối toàn nhánh (Task 15, 2026-10-28)

`HEAD` `7aa157c7`, cây git sạch lúc bắt đầu và lúc kết thúc (trừ file biên bản này). Đĩa 16,8 GiB (cổng 14 GiB đạt). Không chạy app, Teams, âm thanh; không sửa mã nguồn. `CARGO_TARGET_DIR` của worktree, `CARGO_INCREMENTAL=0`. Mọi lệnh chạy nền, log riêng từng nhóm.

### Số test cuối

| Nhóm | Lệnh | Kết quả thật |
|---|---|---|
| fmt | `cargo fmt --all -- --check` | sạch (thoát 0) |
| clippy | `cargo clippy --locked --workspace --all-targets -- -D warnings` | sạch (thoát 0); chỉ một cảnh báo từ build script `whisper-rs-sys` (bên thứ ba, có từ trước) |
| Windows chéo | `scripts/check-windows.sh --locked` | thoát 0, không cảnh báo |
| Rust workspace | `cargo test --locked --workspace` | **1 952 đạt, 0 lỗi, 25 bỏ qua** (52 mục chạy). Gồm app lib 960 đạt / 6 bỏ qua; `pipeline` lib 360; `speaker-worker` lib 167 đạt / 5 bỏ qua; `latency-bench` 115 / 1; `audio-capture` 92 / 4; `speaker-ops` 41 / 1; `pipeline` `lifecycle` 41, `speaker_client` 31; `asr-protocol` 21; `asr-worker` lib 35; `speaker-protocol` 15; `speaker-canary` 13; `worker_process` 10; `speaker-recipe` 8 |
| asr-worker shared-encode | `cargo test --locked -p asr-worker --features shared-encode` | **53 đạt, 0 lỗi, 2 bỏ qua** |
| ACL | `cargo test -p meeting-translator --lib -- acl_tests` | 7 đạt (gồm `the_overlay_only_gains_open_speaker_settings`) |
| Không mã mạng | `bash scripts/release/check-no-network.sh` | sạch (speaker-worker, speaker-protocol, speaker-recipe; cây phụ thuộc hai nền tảng, feature Windows, mã nguồn) |
| Giao diện | `pnpm build` rồi `pnpm exec vitest run` | build thoát 0; **35 file, 431 test đạt** |
| Server | `pnpm run check` (typecheck, vectors, vitest, test:scripts, ui:check, dry-run) | thoát 0; vitest **47 file, 1 694 test đạt**; `node --test` script **46 test: 45 đạt, 0 lỗi** (1 bỏ qua); Web Admin trong `check`: 51 file / 1 159 test đạt, vite build ok; `wrangler deploy --dry-run` hai Worker ok |
| Web Admin | `cd server/admin-ui && pnpm exec vitest run` | **51 file, 1 159 test đạt** |
| Website | `cd website && pnpm test --test-reporter=tap` | **304 test: 298 đạt, 0 lỗi, 6 bỏ qua** (gồm `CORE_TECH`, `STALE_SPEAKER`, i18n ja/zh/ko, chính sách có nội dung người nói) |
| `node --test` | release, `models/{manifest,update,speaker-manifest}`, `dev-env`, `run-dev-app`, `speaker-recipes/update`, `canary` (reporter `tap`) | **264 đạt, 0 lỗi, 0 bỏ qua** (yêu cầu ≥ 239) |
| Python | `python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'` | **83 test, OK** |

Số so với trước: Rust workspace 1 949 (Task 1) → 1 952 (+3 test của Task 2); website 300 → 304 (+test của Task 10, 11 hai, 12); `node --test` 253 → 264. Không có test đỏ ở nhóm nào. Không chạy `pnpm install` mới (`--frozen-lockfile --offline`, "Lockfile is up to date"); `dist/` do `pnpm build` ghi là file bị bỏ qua của git. Công cụ chấm A-spk3 (Task 18) chưa có nên bỏ bước 2.

### Quét repo công khai

Danh sách file: `git diff --name-only origin/main...HEAD` bỏ `docs/superpowers/plans/` (349 file, tồn tại hết), cộng `git status` (0). `origin/main` đã fetch (`32850cf8`). Dùng `/usr/bin/grep`.

- **Khóa/mã truy cập** (`BEGIN … PRIVATE`, `AKIA…`, `ghp_…`, `xox[bp]-`, `sk-…`): **0 dòng**.
- **Đường dẫn cá nhân** (`/Users/`, `/home/<tên>`): 33 dòng ở 9 file, **tất cả là chuỗi giả hay tài liệu nói về việc che đường dẫn, không dòng nào thật**. Chỉ 7 dòng nằm trong phần thêm của nhánh; các dòng còn lại có sẵn ở `origin/main`.

| File | Số dòng | Loại |
|---|---|---|
| `crates/latency-bench/src/latency.rs` | 11 | đường dẫn giả trong test của hàm bỏ tiền tố (`/home/dev/…`, `/Users/somebody/…`); có sẵn |
| `src-tauri/src/diagnostics/{report,reporter,scrub}.rs` | 6 + 3 + 3 | tên giả `alice`, `bob`, `runner` làm đầu vào test của bộ lọc báo cáo; có sẵn |
| `src-tauri/src/db.rs` | 1 | `/Users/someone/…` giả trong test; có sẵn |
| `scripts/ui-preview/tauri-mock.ts` | 2 | đường dẫn giả `an` của IPC giả; có sẵn |
| `crates/speaker-worker/src/reader/tree.rs` | 2 | `C:/Users/x`, `/Users/x` trong test bộ phát hiện đường dẫn (của nhánh) |
| `scripts/speaker-recipes/make_fixture.py` | 1 | chú thích liệt kê chuỗi bị cấm trong công thức (của nhánh) |
| `bench/2026-10-26-nguoi-noi/results/02-windows.md` | 4 | tài liệu về `--remap-path-prefix=$HOME=/home/user` (thay đường dẫn bằng chuỗi giả); không có đường dẫn thật (của nhánh) |

- `docs/release/phat-hanh.md`: bốn dòng `/Users/…` có sẵn ở mục 14 cũ (`origin/main` có 4, `HEAD` có 4); nhánh không thêm dòng nào.
- **Tên người thật**: tên "Đỗ Tiến Phong" (bên cung cấp, đã công khai trong `docs/legal` và `about.mjs` của `origin/main`) xuất hiện như cũ; nhánh không thêm. Các lần khớp "phong" trong phần thêm là chữ "phong bì" và chuỗi giả `phong2` trong test. Không có email, tên người tham dự thật; tên trong test của `speaker-canary` là tên giả.
- **Công nghệ lõi trong `website/src/content`** (`eres2net|3d-speaker|candle|onnx|embedding|vector nhúng|speaker-worker|AXUIElement|UI Automation|accessibility api`): **0 dòng** (test `CORE_TECH` cũng đạt).

## Bảng nghiệm thu A-spk1…A-spk7

Mức đạt theo spec §12 (mục 3.3 spec chính). "Số cũ" là số của kế hoạch 02, đo qua `speaker-worker` thật trên M4 Pro; **chưa đo lại trên bản ứng viên 0.3.2**.

| Mã | Mức đạt | Kết quả | File / lệnh | Trạng thái |
|---|---|---|---|---|
| A-spk1 | Dòng ≥ 1 s đúng người ≥ 85%, mọi dòng ≥ 80% (trung bình 4 bản ghi AMI) | bản ứng viên `444aa12c`: **91,6%** (≥ 1 s), **84,8%** (mọi dòng); trùng mốc 02 (lệch 0,0 / 0,0) | Task 7, mục A-spk1; `results/02-nhan-giong-worker.md` | **đạt** |
| A-spk2 | Dòng ≥ 1 s đúng người ≥ 85% (trung bình 8 bản ghi tiếng Việt) | bản ứng viên `444aa12c`: **93,9%**; 7/8 bản ≥ 85%, thấp nhất 67,7% (rủi ro đã biết); trùng mốc 02 | Task 7, mục A-spk2; `results/02-nhan-giong-worker.md` | **đạt** |
| A-spk3 | Đúng tên ≥ 90%, sai tên ≤ 5% (Teams thật) | không có số | Task 18 (bộ chấm chưa có) | **chờ chủ dự án** |
| A-spk4 | A2 p50 ≤ +20 ms, p90 ≤ +50 ms, chữ đầu ≤ +20 ms | số cũ M4 Pro: p50 −11,8 ms, p90 −26,4 ms, chữ đầu −18,2 ms (không chậm hơn); i5 chưa đo | `results/02-do-tre.md`; Task 8 | **chờ** (Task 8 chưa chạy; Windows chờ chủ dự án) |
| A-spk5 | Tải trong ngân sách (≤ 8% một lõi, RAM ≤ 250 MB); Teams, trình duyệt không chậm rõ | số cũ: RAM 141,8 MB sau 92 phút; Windows chưa đo | `results/02-soak.md`, `results/ram.md`; Task 9 | **chờ** (soak bản ứng viên chưa chạy) |
| A-spk6 | Họp thật tiếng Việt ≥ 3 người, macOS và Windows; chủ dự án đánh giá | không có | Task 17, 18 | **chờ chủ dự án** |
| A-spk7 | `cargo deny`, `cargo audit`, không mã mạng trong worker, `overlay` chỉ thêm `open_speaker_settings`, báo cáo không có tên | `cargo deny` sạch, `cargo audit` chỉ sáu cảnh báo cũ (Task 1); không mã mạng sạch và binary worker release không mã mạng (Task 6, 15); 7 test `acl_tests` đạt (Task 15); test báo cáo không chứa tên nằm trong 960 test của app | Task 1, 6, 15 | **phần tự động đạt trên `444aa12c`** (Task 7 Step 4: deny, audit, không mã mạng, 102 test app, 41 speaker-ops, 21 server đạt); phần không tự động nằm ở Task 17, 18 |

Tóm tắt: trên bản ứng viên `444aa12c` A-spk1 và A-spk2 đã đo lại và đạt (Task 7), A-spk7 đạt phần tự động; A-spk4, A-spk5 còn ở số cũ (Task 8, 9 chưa chạy); A-spk3, A-spk6 chưa có số hợp lệ. Bản app "ngủ" (không bật tính năng) không bị chặn bởi bảng này; **bật bằng manifest bị chặn** tới khi A-spk3 (Task 18) và pháp lý (Task 20) xong.

## Các task phần A đã làm trên nhánh (đã kiểm)

Task 0–6 và 10–14 xong và đã kiểm trước task này: thư viện (Task 1), công tắc "ngủ" (Task 2), chữ trong app năm ngôn ngữ (Task 3), giấy phép model và script manifest (Task 4), CI chạy test bản release (Task 5), bản release cục bộ (Task 6), chính sách 1.9 / EULA 1.6 nháp (Task 10), website năm ngôn ngữ (Task 11, 12), spec chính (Task 13), runbook mục 16 (Task 14). Task 7, 8, 9 chưa chạy.

## A-spk3 (Task 18)

Chờ chủ dự án (Teams thật, ba cuộc họp thử; công cụ chấm Task 18 chưa có).

## Windows (Task 19)

Chờ chủ dự án (máy Windows i5). `SHIPS_ON_WINDOWS = false` ở 0.3.2.

## A7 (Task 22)

Chờ chủ dự án (đăng manifest số 4 và kiểm bằng proxy).

## Các mục chờ chủ dự án

| Việc | Task | Điều kiện / ghi chú |
|---|---|---|
| Nghiệm thu A-spk1, A-spk2, A-spk7, A-spk4, soak trên bản ứng viên | 7, 8, 9 | cần máy rảnh và đĩa ≥ 18 GiB; không cần chủ dự án vận hành nhưng chủ dự án quyết lúc nào rảnh máy |
| Gộp nhánh vào `main`, triển khai server (migration 0007, cron), đăng công thức, kiểm | 16, 17 | chủ dự án chạy; trước Task 18 |
| A-spk3 với Teams thật (ba cuộc họp), A-spk6 họp thật tiếng Việt, đo Teams khi đang bị đọc | 18 | điều kiện của Task 22 (bật) |
| Máy Windows i5 (A-spk4, A-spk5, bản ghi UI Automation) | 19 | không chặn bản ngủ; Windows giữ tắt |
| Duyệt nội dung pháp lý và website, hỏi luật sư (dữ liệu sinh trắc học, tên người tham dự) | 20 | trước Task 22 (bật); bản ngủ phát hành được trước |
| Ngày hiệu lực pháp lý, nâng 0.3.1 → 0.3.2, phát hành app "ngủ" | 21 | một tag mỗi lần; chờ `publish` xong |
| Đăng model và manifest số 4 (bật), A7, deploy website | 22, 23 | sau Task 18 và 20; website sau khi đã bật |

**Đề nghị với chủ dự án:** duyệt nội dung pháp lý (`docs/legal`) và website, hỏi luật sư, rồi cho phép Task 16.

## Chưa kiểm

Gộp từ điều kiện đầu vào ở trên, `06-van-hanh.md`, mục "Rủi ro và điều chưa biết" và "Để kế hoạch sau" của kế hoạch 07b:

- **Trên bản ứng viên chưa đo lần nào:** A-spk1, A-spk2, A-spk4, A-spk7 (Task 7 Step 4), soak (Task 7, 8, 9 chưa chạy); mọi số trong bảng A-spk là số của kế hoạch 02.
- **A-spk3 và A-spk6:** chưa có số với Teams thật; bộ đọc macOS chưa thử với app thật trong họp; trạng thái `Ok` (có tên, chỉ báo "đang nói") cần khách thật; chi phí đọc khi nhiều người tham dự và độ tốn của Teams khi bật trợ năng chưa đo.
- **Quyền Trợ năng:** cấp quyền ngay lúc phiên đang chạy, tắt rồi mở lại quyền, sau mỗi cập nhật (ký ad-hoc, `cdhash` đổi) chưa kiểm hết.
- **Windows:** tốc độ trên i5, RAM của B' và allocator, bản ghi UI Automation của Teams, `GetPackageFullName` (Teams MSIX), `GetFileVersionInfoW`, Task Scheduler, A-spk4/A-spk5; mới qua clippy chéo. Windows giữ tắt.
- **Meet, Zoom:** chưa có bản ghi đạt tiêu chí; ngoài công thức. Nhãn Teams ngoài tiếng Anh và tiếng Việt chưa kiểm (06b Task 22).
- **Đường vận hành thật:** tải công thức qua R2 thật; workflow `sign-recipes.yml` chưa chạy; email cảnh báo `speaker_health_degraded`, `speaker_canary_failed`; migration 0007 và cron trên production; bộ chuyển (cuộc họp thử với app chủ phòng thật) và quyền Trợ năng khi chạy bằng launchd.
- **Chu kỳ nhận manifest:** app kiểm manifest tối đa mỗi ~25 giờ (không có đẩy tức thì); model tải ở phiên dịch đầu sau khi có mục `speaker`, "Người N" từ phiên sau (Task 14).
- **"Ngủ/thức" chạy thật:** mới đọc mã và kiểm bản release cục bộ; kiểm với app cài thật ở Task 21–22.
- **Giấy phép model:** văn bản Apache-2.0 không có dòng bản quyền ở nguồn; chưa có dòng Copyright nào (Task 4).
- **Pháp lý:** chính sách 1.9 và EULA 1.6 là nháp, dòng phiên bản và ngày hiệu lực giữ nguyên; chưa hỏi luật sư.
- **Kích thước đóng gói thật** `.dmg`/Windows: chỉ ước tính (≈ 11,6 MB macOS); số thật ở Task 21 Step 7. Worker release 4 275 488 byte, lớn hơn 2 867 152 byte của spec §4.1 (+49%) do bộ đọc tên.
- **Ngoài phạm vi 0.3.2 (để sau):** bật Windows; Meet, Zoom vào công thức; hợp nhất vòng `tick`; kiểm tự động mức cả app; tách giọng bị gộp bằng tay; hỏi lại khi điều khoản đổi; ngưỡng `speaker_health` chỉnh theo số liệu thật.
- **Không kiểm trong task này:** không chạy app, Teams, Chrome, Zoom hay âm thanh; không chạy `cargo deny`/`cargo audit` mới (số ở Task 1); không rà mã (giao cho hai người rà độc lập riêng).

## Sửa sau rà mã (đợt A)

Người rà mã độc lập tìm lỗi trong phần Rust; sáu commit cục bộ (A1–A6) trên nhánh `phan-biet-nguoi-noi` (không đổi giao thức, `PROTOCOL_VERSION` vẫn 3, `Cargo.lock` không đổi). Ưu tiên theo chủ dự án: tốc độ dịch không đổi, thà "Người N" còn hơn sai tên, bảo mật không kém đi.

| Mục | Sửa | Test |
|---|---|---|
| A1 tự hiệu chỉnh gán tên sai cả phòng | Khi đã thấy ≥ 2 giọng, ứng viên phải không bật ≥ 80% thời gian có tiếng và có một giọng trùng ≥ 80% lúc bật (`calibrate.rs`); lưới an toàn ở `matcher.rs`: tên có bằng chứng tự học ở ≥ 2 giọng không được gán bằng bằng chứng tự học. Giọng của worker chỉ lấy lúc có ứng viên qua ngưỡng (mỗi 5 s) | phần tử toàn phòng, phần tử theo hai trong ba giọng, tên học ở ba giọng: đỏ → xanh; chỉ báo thật khi có hai giọng và tên học ở một giọng vẫn được học |
| A2 `confidence` không chặn tên đoán | Đoạn có `confidence` dưới θ (kế thừa giọng trước, hay bị ép vào giọng gần nhất khi đủ giọng) không được tính để một tên đạt ngưỡng nhận tên (≥ 3 s, ≥ 2 đoạn, có chỉ báo); nhãn "Người N" không đổi | hai test session (đoạn ép, đoạn ngắn kế thừa): đỏ → xanh |
| A3 ghi sổ trên luồng phụ đề | `Health::observe` không ghi đĩa; luồng nền ghi mỗi 15 s nếu có đổi, hết phiên và sau mỗi lần gửi ghi ngay; khóa sổ chỉ giữ lúc dựng JSON | `observing_does_not_write_the_ledger_on_the_calling_thread` |
| A4 bộ che tên chỉ biết bảng hiện tại | `TranscriptStore` nhớ tên đã thấy trong lần chạy app (RAM, tối đa 256, bỏ tên cũ nhất), `known_names` gộp | `names_seen_in_this_run_stay_known_for_redaction` |
| A5 `uia.rs` tham chiếu lệch căn | `read_unaligned` | `scripts/check-windows.sh`: 0 cảnh báo |
| A6 `enable_enhanced` | Chỉ đặt khi đọc được là chưa bật (`eui::should_enable`); lỗi hay quá hạn đọc: không đặt, không ghi dấu | `eui_is_enabled_only_when_it_is_known_to_be_off` |

### Đo A2: `latency-bench speaker-names-eval`, tách giọng tắt

28 bản ghi (4 AMI `Mix-Headset` và 24 hội thoại tiếng Việt, cùng cache nhúng `$DATA/out/`) × 6 điều kiện (trễ 600, 900, 1 300 ms; mất 0 và 0,1), bản debug. Hai lần chạy cùng máy; "trước" tái hiện đúng số của `04-ghep-ten.md`.

| | Đúng TB | Sai TB | Chưa tên TB | Sai lớn nhất |
|---|---|---|---|---|
| Trước (`HEAD` sau A1) | 87,34 | 1,85 | 10,82 | 5,8 (ES2004a) |
| Sau (cách đã chọn) | 87,27 | 1,84 | 10,90 | 5,8 (ES2004a) |

Số giống hệt ở cả sáu điều kiện; khác với trước ở 2 bản (12/168 ô): `TS3003a` 98,2 / 1,8 / 0,0 → 97,5 / 1,4 / 1,1 và `cv-vi-04` 97,6 / 1,2 / 1,2 → 96,4 / 1,2 / 2,4 (một dòng). Đúng giảm 0,07 TB (một bản −1,2 điểm), sai không tăng.

**Cách thử đầu bị bỏ:** loại hẳn đoạn đoán khỏi bằng chứng làm `EN2002a` ở trễ 1 300 ms từ 72,3 / 5,8 / 22,0 thành 88,8 / 10,0 / 1,2 (sai lớn nhất 10,0, sai TB 1,99): các đoạn đoán là bằng chứng thật rằng giọng 1 của bản này đã gộp hai người (QĐ 25), bỏ chúng thì giọng gộp được gán tên một người. Vì vậy cách đã chọn giữ đoạn đoán trong dấu hiệu gộp và mẫu số tỉ lệ, chỉ không cho chúng góp vào ngưỡng nhận tên.

### Rủi ro còn lại (không sửa ở đợt A)

- **Worker trả `voice: None` khi đoạn buộc phải đoán lúc đủ giọng:** sạch hơn (nhãn "Người N" cũng không bị đoán sai), nhưng đổi hành vi gán nhãn giọng nên phải đo lại A-spk1/A-spk2. Chưa làm.
- Điểm 5 của báo cáo rà: `token_ok` (`speaker-ops/src/health.rs`) cho qua lớp CSS dạng `avatar-LanNguyen` (≤ 32 ký tự `[A-Za-z0-9_-]`).
- Điểm 7: đọc UI Automation của Chromium trên Windows có thể bật chế độ truy cập của trình duyệt, chưa đo CPU/RAM; cần đo trước khi bật Windows.
- Điểm 8: `refresh_target` (macOS) gọi `AXWindows`, `AXTitle`, `AXIdentifier` ngoài ngân sách 30 ms khi app họp treo (chỉ làm chậm luồng đọc, không đụng đường dịch).
- Điểm 10, 11: theo thiết kế (`user_version` 2 chặn hạ cấp; khóa bảo trì khi tải model giọng 26 MB).
- A1 mới chỉ kiểm bằng dựng lại hình dạng tín hiệu trong test; chưa có bản ghi thật của họp ≥ 3 người xa có chỉ báo tự học. Chỉ báo thật của người nói quá nhiều (≥ 80% thời gian có tiếng) khi đã thấy ≥ 2 giọng sẽ không được học (chấp nhận: thà "Người N").
