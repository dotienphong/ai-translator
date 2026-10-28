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

Chờ Task 4.

## Bản release cục bộ (Task 6)

Chờ Task 6.

## Test nền ở bản release (Task 0 Step 5)

Lệnh: `pnpm build` (thoát 0) rồi `cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: db:: --test-threads=1`, với `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 MACOSX_DEPLOYMENT_TARGET=14.2`, đĩa 21 GiB trống (cổng 18 GiB đạt).

Kết quả: `test result: ok. 303 passed; 0 failed; 0 ignored; 657 filtered out`, chạy test 1,8 s. Hai test công tắc có sẵn đều đạt ở bản release: `release_builds_never_enable_speaker`, `release_builds_never_activate_speaker_whatever_the_settings`. Test `release_builds_follow_the_platform_table_not_the_environment` chưa có (Task 2 thêm).

Ghi chú: kế hoạch dự kiến 30–60 phút (LTO) nhưng lần này chỉ mất khoảng 4 phút (giải thích khả dĩ, chưa kiểm: `target/` của worktree đã có sẵn artefact release của các lượt trước); lần chạy đầu không có `dist/` nên `pnpm build` chưa chạy được (lỗi script của tôi: biến đường dẫn log rỗng), test vẫn đạt 303; chạy lại sau `pnpm build` thật, vẫn 303 đạt. Đĩa sau khi chạy: 21 GiB. Không có tiến trình nền nào còn sót.

## A-spk1, A-spk2, A-spk7 (Task 7)

Chờ Task 7.

## A-spk4 và nhãn muộn (Task 8)

Chờ Task 8.

## Soak (Task 9)

Chờ Task 9.

## A-spk3 (Task 18)

Chờ Task 18.

## Windows (Task 19)

Chờ Task 19.

## A7 (Task 22)

Chờ Task 22.

## Chưa kiểm

Chờ các Task sau; danh sách điều kiện đầu vào ở trên vẫn còn nguyên.
