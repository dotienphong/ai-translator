# Vận hành: công thức tải từ xa có ký số, báo cáo tình trạng, kiểm tra tự động (kế hoạch 06, phần A)

## Câu hỏi

Spec §7.1 (công thức đọc tên tải từ xa, ký số, chống quay lui), §7.2 (báo cáo tình trạng `speaker_health`: app, server, D1, Web Admin, cron cảnh báo), §7.3 (kiểm tra tự động hằng ngày, ở mức bộ đọc), §10 (bảo mật, quyền riêng tư): phần làm được hoàn toàn trên Mac (Task 0–16) đã xong và còn đúng khi chạy lại toàn bộ chưa?

## Điều kiện

| | |
|---|---|
| Máy | Mac (macOS 26.6.2), Rust 1.98.1; Windows chỉ biên dịch chéo (mingw, target `x86_64-pc-windows-msvc`, không `cargo-xwin`) |
| Nhánh | `phan-biet-nguoi-noi`, `HEAD` `72614025`; mọi thay đổi của phần A nằm ở working tree (**chưa commit**, theo dặn của chủ dự án) |
| Ngày | 2026-10-28 |
| Đĩa | 21–22 GiB trống trước các bước build (cổng 14 GiB); không dùng `--release` |
| Cách chạy | `CARGO_TARGET_DIR=<worktree>/target CARGO_INCREMENTAL=0`; server và Web Admin bằng `pnpm` có sẵn (`--frozen-lockfile` đã cài) |
| Không làm | không deploy, không chạm production, Cloudflare, R2, GitHub Actions; không chạy gì với Teams, Chrome, Edge, Zoom hay app thật |

## Kết quả

### Số test từng gói (mốc Task 0 Step 2 cũ so với số thật Task 16)

| Gói | Mốc Task 0 Step 2 | Số thật Task 16 |
|---|---|---|
| `speaker-protocol` | 14 | **15** đạt |
| `speaker-recipe` | 8 | **8** đạt |
| `speaker-ops` (crate mới) | chưa có | **41** đạt, 1 bỏ qua (`check_recipes_body`, chạy bằng `--ignored` trong CI công thức) |
| `speaker-canary` (crate mới) | chưa có | **13** đạt |
| `speaker-worker` lib | 162 đạt, 5 bỏ qua | **167** đạt, 5 bỏ qua |
| `speaker-worker` `worker_process` | 10 | **10** đạt |
| `pipeline` lib | 360 | **360** đạt |
| `pipeline` `speaker_client` | 31 | **31** đạt |
| `pipeline` các test tích hợp khác | (không nêu) | `clients` 18 (2 bỏ qua), `engine` 5, `lifecycle` 41, `shutdown` 1, `streaming` 1; các test `real_*`, `no_speech`, `vad_reference` bỏ qua có chủ ý |
| app `meeting-translator` lib | 935 đạt, 6 bỏ qua | **957** đạt, 6 bỏ qua |
| Server (vitest) | 45 file | **47 file, 1 694 test** đạt (`pnpm run check`: typecheck, vectors, test, test:scripts, ui:check, dry-run đều thoát 0) |
| Web Admin (vitest) | 50 file | **51 file, 1 159 test** đạt |
| `node --test` (script phát hành, cập nhật model và công thức, canary) | (không nêu) | **230** đạt, 0 lỗi, 0 bỏ qua (`update.test.mjs`, `canary.test.mjs`, `scripts/release/*.test.mjs`, `manifest.test.mjs`, `update.test.mjs` của model) |

`latency-bench` (115 đạt, 1 bỏ qua) và vitest gốc (430) không thuộc lệnh của Task 16; số đo ở các lượt trước, chưa chạy lại trong lượt này.

### Định dạng, clippy, phụ thuộc, không mã mạng

- `cargo fmt … -- --check` cho bảy gói: `fmt-ok`.
- `cargo clippy --locked --workspace --all-targets -- -D warnings`: `Finished`, không cảnh báo.
- `scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe`: sạch (cây phụ thuộc hai nền tảng, feature Windows, mã nguồn).
- `cargo deny check`: `advisories ok, bans ok, licenses ok, sources ok`.
- `cargo audit`: không lỗ hổng mới; sáu cảnh báo đã được cho phép từ trước, không thuộc crate của kế hoạch này (`paste`, `proc-macro-error`, `zbus_names`, `zvariant`, `zvariant_derive` không còn bảo trì; `glib` unsound).
- `Cargo.lock`: **0 dòng bị xóa**, 49 dòng thêm: ba gói mới của workspace (`speaker-ops`, `speaker-canary`, `speaker-recipe`) và một dòng phụ thuộc vào `meeting-translator`; không đổi phiên bản của crate nào có sẵn.

### Windows (biên dịch chéo, clippy `-D warnings`)

- `scripts/check-windows.sh --locked` (`meeting-translator`, `pipeline`, `audio-capture`, `speaker-worker`, `speaker-protocol`): `Finished`, thoát 0. Lần này `Finished` trong 1,25 giây vì mọi crate đã được kiểm chéo ở các task trước và nguồn không đổi (cache còn hợp lệ).
- Script **chưa liệt kê** `speaker-ops` và `speaker-canary`, nên chạy riêng cùng môi trường như script: `cargo clippy --locked -p speaker-ops -p speaker-canary --target x86_64-pc-windows-msvc --all-targets -- -D warnings`: `Finished`, thoát 0.
- **Đề xuất (không tự sửa, ngoài `Files:`):** thêm `-p speaker-ops -p speaker-canary` vào dòng `cargo clippy` của `scripts/check-windows.sh` để CI và người sau không phải chạy riêng.

### Quét chuỗi không được có trong repo công khai

Quét 129 file thêm hoặc sửa (liệt kê từ `git status --short -uall` cộng `find` thủ công trên `tools/speaker-canary/`, thư mục này bị `.git/info/exclude` che khỏi `git status`; trừ `bench/` và `docs/superpowers/plans/`; năm file: `canary.mjs`, `lib.mjs`, `canary.test.mjs`, `README.md`, `templates/canary.example.json`).

- Không có khóa riêng, khóa AWS, mã truy cập, email thật hay tên thật. Đường dẫn cá nhân: chỉ ở bốn dòng có sẵn trong mục 14 cũ của `docs/release/phat-hanh.md` (không nằm trong phần thêm của kế hoạch này: phần thêm là 62 dòng, `git diff` không có dòng nào bị xóa hay khớp mẫu).
- Các chỗ khớp còn lại đều là chuỗi giả trong test hay bộ phát hiện (đường dẫn thư mục người dùng giả với tên `x` ở test của `reader/tree.rs`; tên giả `alice`, `bob` ở test có sẵn của `diagnostics/`; `/etc/passwd` là đường dẫn bị từ chối ở `sign-recipes-ci.test.mjs`; danh sách mẫu cấm của `make_fixture.py`; `canary.test.mjs` khẳng định không có `password`). Tên trong test là tên giả.
- Lưu ý công cụ: `grep` mặc định của máy này là `ugrep` và bỏ sót kết quả khi truyền danh sách file dài; lượt quét phải dùng `/usr/bin/grep` từng file.

### Kiểm âm tính đã làm (theo báo cáo từng task; Task 16 không chạy lại)

Phá cố ý, thấy test đỏ đúng lý do, hoàn lại, thấy xanh: Task 1 (tiền tố ký của models: vector kiểm đỏ), Task 2 (nhánh quay lui của `judge`), Task 4 (bỏ kiểm `version` tăng), Task 5 (giới hạn mẫu chỉ báo), Task 7 (đếm dãy chữ số của mẫu, tỉ lệ sai), Task 9 (bộ che tên), Task 10 (server nhận báo cáo), Task 11 (cảnh báo một lần mỗi ngày, hai lời gọi trong `reconcile.ts`), Task 13 (`p.speaking > 0.0`).

### Tệp thêm hoặc sửa của Task 15 và Task 16

- Sửa `docs/release/phat-hanh.md`: thêm mục **15** (15.1 đợt triển khai lần đầu: migration 0007 trước, Worker sau, kiểm cron; 15.2 `pnpm recipes:update` gồm `--check`; 15.3 quay lại `--revert-to <V>` và tắt từ xa; 15.4 báo cáo tình trạng và Web Admin; 15.5 kiểm tra tự động). 62 dòng thêm, 0 xóa.
- Tạo `bench/2026-10-26-nguoi-noi/results/06-van-hanh.md` (file này).
- `git status --short`: 93 dòng trước, 95 dòng sau (thêm đúng `docs/release/phat-hanh.md` và file kết quả này; các file mới của `scripts/speaker-recipes/`, `tools/speaker-canary/`, `bench/` nằm trong thư mục untracked hay bị che nên không hiện riêng).

## Chưa kiểm (giữ nguyên cho tới khi có số thật)

- Hành vi thật của `GetPackageFullName` (Teams MSIX) và `GetFileVersionInfoW` (Chrome, Edge, Zoom) trên Windows: mới qua clippy chéo (Task 20).
- Đường tải công thức qua R2 thật, kể cả lần đăng đầu bằng `pnpm recipes:update` (Task 18); workflow `sign-recipes.yml` chưa chạy thật.
- Email cảnh báo thật `speaker_health_degraded` và `speaker_canary_failed` (Task 21); migration 0007 và cron trên production (Task 17).
- Bộ chuyển (mở cuộc họp thử bằng app chủ phòng thật và hai khách trình duyệt tự động) và quyền Trợ năng khi chạy bằng launchd (Task 19).
- Task Scheduler trên Windows, kể cả file `.xml` UTF-16LE có BOM (Task 20).
- Mẫu nhãn ngoài tiếng Anh và tiếng Việt của Teams (Task 22).
- Meet và Zoom vào công thức và vào kiểm tra tự động: chưa đạt tiêu chí của kế hoạch 04, kiểm tra tự động của hai app này sẽ thoát 2 ("không có mục").

## Phần B (Task 17–22): CHƯA làm, cần chủ dự án

Điều kiện chung: chủ dự án cho phép commit phần A, gộp vào `main` và đẩy (workflow `sign-recipes.yml` phải có trên `main` mới chạy được), CI của lượt đẩy xanh. Không có secret mới.

| Task | Việc | Ai |
|---|---|---|
| 17 | Triển khai server và Web Admin: áp migration 0007 **trước**, deploy hai Worker sau, kiểm cron (runbook 15.1) | chủ dự án chạy lệnh ghi production |
| 18 | Đăng công thức lần đầu qua `pnpm recipes:update` và thử đường tải, tắt từ xa, quay lại | chủ dự án |
| 19 | Tài khoản thử, bộ chuyển macOS, quyền Trợ năng cho launchd, lịch ban đêm | cùng chủ dự án (nhiều giờ) |
| 20 | Bộ chuyển và Task Scheduler trên máy Windows i5; kiểm hai hàm Win32 | cùng chủ dự án |
| 21 | Thử email cảnh báo bằng cách cố ý làm hỏng | chủ dự án |
| 22 | Mẫu nhãn ngoài tiếng Anh và tiếng Việt, sau khi 04b Task 19–21 xong | cùng chủ dự án |

Các quyết định đang chờ (mục "Điều cần chủ dự án quyết" cuối file 06b): kiểm tra tự động ở mức bộ đọc (QĐ 13), cho phép commit, máy chạy ban đêm, Zoom, ngưỡng cảnh báo, nâng `sha2` và `serde_json` ở đợt cập nhật phụ thuộc chung.
