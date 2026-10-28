# Phân biệt người nói, kế hoạch 07: phát hành (nâng thư viện, công tắc thành tính năng thật, đăng model, nghiệm thu, pháp lý, website, spec chính, bản 0.3.2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG push, KHÔNG gộp `main`, KHÔNG squash, KHÔNG rebase, KHÔNG amend, KHÔNG deploy, KHÔNG đẩy tag, KHÔNG chạm production, Cloudflare, R2, GitHub Actions thật** trong Task phần A. Commit cục bộ trên nhánh `phan-biet-nguoi-noi` thì được (điều phối viên xác nhận 2026-10-28); **hỏi lại chủ dự án ở Task 0 Step 1 nếu không chắc quyền này còn hiệu lực**. Mọi bước đẩy ra ngoài (đẩy `main`, ký và đăng manifest, đẩy tag, deploy server và website, đăng bài) nằm ở phần B và **do chủ dự án chạy hay ra lệnh**.
>
> **Task phần A (Task 0–15, file này và file 07b) làm hoàn toàn trên máy Mac này.** Không chạy gì với Teams, Chrome, Edge, Zoom hay app họp thật; không phát tiếng ra loa; không mở micro (các lượt đo dùng file âm thanh ngoại tuyến). Task phần B (Task 16–24, file 07b) cần chủ dự án: máy Windows i5, tài khoản, khóa, deploy, đẩy tag, công bố.
>
> **File này chứa Task 0–9** (mốc, nâng thư viện, công tắc, chữ trong app, model và manifest, CI, kiểm bản release, nghiệm thu tự động, soak). **File 07b** (`2026-10-28-phan-biet-nguoi-noi-07b-phat-hanh-phap-ly-website-b.md`) chứa Task 10–24 và các mục cuối: **Phủ spec, Để kế hoạch sau, Rủi ro và điều chưa biết, Điều cần chủ dự án quyết của CẢ HAI file**. Số Task dùng chung.

**Goal:** đưa "Phân biệt người nói" (F13) ra người dùng thật, an toàn, theo thứ tự ưu tiên của chủ dự án (1. tốc độ dịch không bị ảnh hưởng; 2. thà "Người N" còn hơn sai tên; 3. bảo mật và quyền riêng tư không kém đi): nâng bốn thư viện còn lệch "bản ổn định mới nhất"; biến công tắc nội bộ `speaker::enabled` thành tính năng thật (macOS bật, Windows chỉ khi có số đo) kèm các lớp chống lọt công tắc dev; đăng model nhận giọng bằng một mục `speaker` ở gốc manifest (cũng là **công tắc tắt khẩn từ xa**); nghiệm thu A-spk1…A-spk7 trên bản ứng viên; viết nội dung chính sách riêng tư 1.9 / EULA 1.6, website năm ngôn ngữ và spec chính (§15 của spec); rồi phát hành app 0.3.2 và **bật bằng manifest** theo quy trình `docs/release/phat-hanh.md`.

**Architecture:** giữ hai bước tách rời để rút lui dễ: (1) **phát hành app 0.3.2 "ngủ"**: mã tính năng có trong bản phát hành nhưng manifest chưa có mục `speaker`, nên app không tải model, không tải công thức, không gửi báo cáo, giao diện không hiện nhóm "Người nói" (cư xử như 0.3.1); (2) **bật**: đăng manifest số 4 có mục `speaker` (`min_app_version` 0.3.2), từ lúc đó app 0.3.2 tải model 26 MB nền và phiên dịch kế tiếp có phân biệt giọng. Tắt khẩn có ba lớp, từ nhẹ tới nặng: công thức rỗng (tắt đọc tên, còn "Người N"), manifest số mới **bỏ** mục `speaker` (tắt cả tính năng ở phiên dịch kế tiếp, không cần phát hành app), công tắc của người dùng (Cài đặt › Phụ đề › Người nói). Hằng `SHIPS_ON_WINDOWS` giữ `false` ở 0.3.2 tới khi chủ dự án có số đo trên máy Windows i5 và bản ghi UI Automation thật.

**Tech Stack:** Rust 1.98.1 (edition 2024, MSRV 1.98 của workspace; `rust-toolchain.toml` khóa 1.98.1); `candle-onnx`/`candle-core` 0.11.0 (không đổi); TypeScript 7.0.2 và React 19.3.0 (Cài đặt), vitest; Node 24 (`node --test`); Python 3.12 của `$DATA/venv` (chấm A-spk1, A-spk2); `latency-bench`, `soak` (`rus`). **Không thêm thư viện nào.** Bốn thư viện Rust đang khóa thấp hơn "bản ổn định mới nhất" (CLAUDE.md, spec §6.12) và Task 1 nâng chúng: `libc` 0.2.189 → 0.2.191, `sha2` 0.11.0 → 0.11.1, `serde_json` 1.0.151 → 1.0.154, `realfft` 3.5.0 → 3.5.1. Kiểm bằng API crates.io ngày 2026-10-28 (`max_stable_version`, trùng kết quả `cargo search`/`cargo info`): `libc` **0.2.191** (MSRV 1.65, đăng 2026-10-16; `cargo search libc` còn in `1.0.0-alpha.5`: bản tiền phát hành, **không dùng**), `sha2` **0.11.1** (MSRV 1.88, 2026-10-12), `serde_json` **1.0.154** (MSRV 1.71, 2026-10-11), `realfft` **3.5.1** (MSRV 1.61, 2026-10-26); tất cả ≤ 1.98.1, không bị yanked. `cargo update --dry-run` trên `Cargo.lock` hiện tại chỉ khóa lại đúng bốn gói đó ("Locking 4 packages"). Các thư viện còn lại của các crate `speaker-*` đã là bản ổn định mới nhất và trùng `Cargo.lock`: `candle-core` 0.11.0, `candle-onnx` 0.11.0, `prost` 0.14.4, `rayon` 1.12.0, `core-foundation` 0.10.1, `windows` 0.62.2, `regex` 1.13.1, `ed25519-dalek` 3.0.0, `base64` 0.23.1, `reqwest` 0.13.5, `clap` 4.6.7, `anyhow` 1.0.104, `serde` 1.0.229, `thiserror` 2.0.21, `tempfile` 3.27.0, `postcard` 1.1.3. Không crate nào mang ggml (app và `speaker-worker` không chứa ggml; `cargo tree -p meeting-translator | grep -i ggml` rỗng). Thư viện npm: không cài thêm gì; Task 1 chỉ ghi `pnpm outdated` vào biên bản.

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §1–2 (mục tiêu, phạm vi), §4.5 (model nhận giọng, manifest), §10 (bảo mật, quyền riêng tư, pháp lý), §11 (hiệu năng), §12 (kiểm thử, nghiệm thu), §13 mục 7, §14, §15 (sửa spec chính). Spec chính: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Quy trình phát hành: `docs/release/phat-hanh.md` (mục 2 mỗi lần phát hành, mục 13 cập nhật model, mục 15 phân biệt người nói). Pháp lý: `docs/legal/README.md` ("Đổi ngày hiệu lực"). Website: `website/README.md`.

**Dựa trên:** kế hoạch 01 đến 06 đã thực thi (nhánh `phan-biet-nguoi-noi`, HEAD `ab90f013`): `crates/{speaker-protocol,speaker-recipe,speaker-worker,speaker-ops,speaker-canary}`, `src-tauri/src/speaker/{mod,recipes,health,eui_macos}.rs`, `scripts/speaker-recipes/`, `tools/speaker-canary/`, `server/` (báo cáo tình trạng), `docs/release/phat-hanh.md` mục 15, kết quả ở `$B/results/` (`tong-hop.md`, `02-*.md`, `04-do.md`, `04-ghep-ten.md`, `05-windows.md`, `06-van-hanh.md`, `teams-chrome.md`, `quyen-tro-nang.md`). Đọc `$B/results/06-van-hanh.md` mục "Chưa kiểm" và "Phần B" trước khi làm.

**Quy ước:**
- `W` = gốc worktree nhánh `phan-biet-nguoi-noi` (thư mục `meeting-translator-work/phan-biet-nguoi-noi`); `DATA` = `$W/../data-nguoi-noi` (ngoài mọi repo; có `models/`, `ami/`, `out/`, `venv/`, `bin/`); `B` = `$W/bench/2026-10-26-nguoi-noi`; `M` = thư mục chính của repo (checkout `main`, chứa `models/`, `tools/llama-b11669/`, `bench/phase0/data/`; **chỉ đọc từ đó**, không sửa gì ở `M`). Đặt bốn biến này theo máy của bạn trước khi chạy lệnh.
- Shell trở về thư mục chính sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd $W &&`** (lệnh `server/` thì `cd $W/server &&`, lệnh website `cd $W/website &&`).
- **Mọi lệnh cargo đặt `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0`.** Không `cargo clean`, không xóa gì trong `target/`. `cargo test` có từ hai bộ lọc tên trở lên viết dạng `--lib -- a:: b::`.
- **Đĩa:** bước build nặng bắt đầu bằng `avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; }` (ngưỡng **18** GiB cho mọi lệnh `--release` của `meeting-translator`). Lệnh dừng thì **báo chủ dự án**, không tự dọn. Máy này lúc viết kế hoạch còn khoảng 23 GiB.
- **Grep:** `grep` mặc định của máy này là `ugrep` và bỏ sót khi truyền danh sách file dài: dùng `/usr/bin/grep`, và đặt `--include='*.ts'` trong nháy (zsh báo lỗi khi glob không khớp).
- **Định dạng Rust:** mã mẫu đã qua `cargo fmt` (`max_width = 120`); mỗi Mốc kiểm vẫn chạy `cargo fmt -p <crate> -- --check`.
- **Repo GitHub công khai:** không ghi đường dẫn thư mục cá nhân (thư mục home của người dùng máy), tên người thật, bí mật vào file nào của repo. Tên trong test là tên giả. Quét lại ở Task 15.
- **Website** (CLAUDE.md, `website/README.md`): chỉ nói điều có thật, số đo kèm điều kiện đo; **không công bố công nghệ lõi** (tên model, engine, thư viện, khung app, kiến trúc nội bộ; có test `CORE_TECH` chặn); sửa nội dung một trang thì sửa đủ năm ngôn ngữ vi/en/ja/zh/ko (pháp lý chỉ vi, en); đổi giá thì đổi `server/wrangler.jsonc` và `website/src/plans.mjs` (kế hoạch này không đổi giá); không thêm tên miền cũ `aitranslator.io.vn` vào chỗ mới.
- **Không extension trình duyệt.** macOS ký ad-hoc là điều kiện cố định của kế hoạch này.
- **Tên người không bao giờ vào log, báo cáo, email, hay file kết quả trong repo.**
- Số test "mong đợi" là số đo ở `$B/results/06-van-hanh.md` (2026-10-28); lệch thì ghi số thật và xem lại, đổi hành vi thì dừng, báo.

---

## Quyết định thiết kế của kế hoạch này (ngoài chữ của spec)

1. **Số bản và hai bước "ngủ rồi bật".** `origin/main` đang ở 0.3.1 (tag `v0.3.1` là tag mới nhất; Task 0 Step 1 kiểm lại) nên bản kế là **0.3.2**; nếu Step 1 ra số khác thì thay `0.3.2` bằng số kế tiếp ở Task 4, 10, 12, 21 và 22. Mặc định: phát hành **stable** 0.3.2 với tính năng "ngủ", rồi đăng manifest số 4 để bật. Lý do: mỗi bước có rút lui riêng (bản ngủ giống 0.3.1 về hành vi; bật và tắt chỉ là một lần đăng manifest, không phát hành app); ngày hiệu lực pháp lý và website tách khỏi ngày bật. Cách khác: phát hành beta `0.3.2-beta.1` trước (kênh beta tự chọn; chính sách phải hiệu lực trước bản đầu tiên có mã tính năng, kể cả beta, nên ngày hiệu lực dời về ngày beta); hay đăng manifest trước app (bật ngay cho mọi người cập nhật). Không khuyến nghị hai cách này.
2. **Windows tắt bằng hằng số ở 0.3.2.** Spec §13 ghi "một lần phát hành cho cả hai hệ điều hành", nhưng điều phối viên chốt "macOS trước; Windows chỉ khi có bản ghi thật": chưa có số đo A-spk4 và A-spk5 trên máy Windows i5, chưa có bản ghi cây UI Automation (05b Task 10–13 chờ chủ dự án), và `recipes.json` chưa có mục Windows. Mặc định: `SHIPS_ON_WINDOWS = false` (Task 2). Bộ cài Windows vẫn chứa `speaker-worker` (đã đóng gói từ 0.3.1+; không làm gì trên Windows). Bật Windows là đổi một hằng số ở bản phát hành kế tiếp, sau khi Task 19 đạt.
3. **"Ngủ" nghĩa là gì trong mã.** `speaker::enabled()` của bản phát hành trả `true` trên macOS, nhưng ba nơi còn hỏi thêm "manifest có mục `speaker` cho bản này không" (`ModelService::speaker_offered`, Task 2): (a) phiên dịch chỉ chạy `speaker-worker` khi `models.speaker_model()` có file (đã vậy từ kế hoạch 02); (b) vòng tải công thức chỉ chạy khi manifest có mục; (c) Cài đặt › Phụ đề chỉ hiện nhóm "Người nói" khi `ModelsView.speaker` khác `unavailable` (Task 2 Step 8). Báo cáo `speaker_health` chỉ sinh ra khi worker chạy, nên cũng "ngủ". Hệ quả: 0.3.2 chưa có mục `speaker` thì **không thêm kết nối mạng nào** so với 0.3.1.
4. **Công tắc dev giữ nguyên ở bản debug.** `AI_TRANSLATOR_DEV_SPEAKER=true` vẫn là cách bật tính năng ở bản debug (test và máy dev không đổi hành vi: `cargo test` thường vẫn thấy `enabled() == false`). Bản phát hành **không đọc biến môi trường nào** (hằng `DEV_SPEAKER_ENV` chỉ có trong bản debug). Các lớp chống lọt công tắc dev vào bản phát hành giữ nguyên và có thêm một test chạy ở **bản release**: `release_builds_follow_the_platform_table_not_the_environment` (CI chạy `cargo test --release ... speaker::`), cùng `release-check.mjs no-dev-gate` (chuỗi `AI_TRANSLATOR_DEV_SPEAKER` vẫn nằm trong `DEV_GATE_MARKERS`).
5. **Giấy phép model đi theo `THIRD_PARTY_NOTICES`, không thêm file vào `files` của manifest.** Thêm một file `kind: license` vào các gói đã có làm gói đang cài thiếu file (hành vi app chưa kiểm): nên giữ giấy phép trong `licenses/models/` và `scripts/release/notices.mjs` (cùng cách Hy-MT2, Whisper, Silero), và đăng thêm một bản sao cạnh model trên R2 (`models/speaker/<12 ký tự đầu SHA-256>/3D-Speaker-LICENSE.txt`, không nằm trong manifest).
6. **Manifest là công tắc tắt khẩn.** `scripts/models/speaker-manifest.mjs` (Task 4) dựng `body-<N+1>.json` **có** hay **không có** khóa `speaker`; `pnpm models:update` về sau giữ khóa này (`bumpBody` trải `...prev`, có test). Tắt khẩn = `speaker-manifest.mjs remove` rồi ký và đăng như mọi manifest (runbook mục 16, Task 14).
7. **Chữ trong app nói đúng phạm vi thật.** Cài đặt đang ghi "Lấy tên từ Teams, Meet, Zoom (… Meet trong Chrome hoặc Edge)" nhưng công thức build sẵn chỉ có Teams (macOS): Meet và Zoom tắt tới khi bản ghi thật đạt tiêu chí (04 QĐ 16, 32). Task 3 sửa chữ năm ngôn ngữ thành "Teams". Khi Meet hay Zoom vào công thức sau này thì sửa chữ ở bản app kế (nói ít hơn sự thật thì không sai).
8. **Pháp lý viết nháp để chủ dự án duyệt, ngày hiệu lực đổi vào ngày phát hành.** Nội dung chính sách 1.9 và EULA 1.6 vào `docs/legal` ở Task 10, **giữ nguyên dòng phiên bản và ngày** tới Task 21 (như kế hoạch nguồn micro 04); chủ dự án duyệt nội dung và hỏi luật sư (spec §10: dữ liệu sinh trắc theo Luật 91/2025/QH15 và Nghị định 356/2025) **trước Task 22 (bật)**; bản app ngủ có thể phát hành trước khi luật sư trả lời (tính năng chưa chạy với ai).
9. **Website nói đúng điều có thật:** macOS trước; Teams (bản cài) có tên tự động; Meet, Zoom chưa; Windows chưa có "Người N" theo bản này; không nêu model, thư viện hay cách đọc giao diện. Website chỉ deploy **sau khi manifest số 4 đã đăng** (khi tính năng thật sự có với người dùng), không phải lúc phát hành app ngủ.
10. **Không thêm thư viện, không đổi giá, không đổi giao thức, không đổi mã của `speaker-worker`.** Phần mã của kế hoạch này nhỏ: bốn dòng khai báo phiên bản, một hằng số và một hàm công tắc, một hàm `speaker_offered`, hai điều kiện (tải công thức, hiện nhóm Cài đặt), chữ i18n, một script manifest, hai dòng CI.

## Cấu trúc file

"07" là file này (Task 0–9); "07b" là file đi kèm (Task 10–24).

| File | Việc | Task |
|---|---|---|
| Sửa `Cargo.toml`, `crates/{pipeline,asr-worker,audio-capture,latency-bench,speaker-worker,speaker-canary}/Cargo.toml`, `src-tauri/Cargo.toml`, `Cargo.lock`, `scripts/check-windows.sh` | nâng `libc`, `sha2`, `serde_json`, `realfft`; clippy chéo Windows cho `speaker-ops`, `speaker-canary` | 1 |
| Sửa `src-tauri/src/speaker/mod.rs`, `src-tauri/src/speaker/recipes.rs`, `src-tauri/src/models/service.rs`, `src/windows/main/settings/SubtitleSettings.tsx`, `src/windows/main/settings/SpeakerSettingsWiring.test.ts` | công tắc thật, "ngủ" khi manifest chưa có mục `speaker`, nhóm Cài đặt chỉ hiện khi có model | 2 |
| Sửa `src/i18n/{vi,en,ja,zh,ko}.ts` | chữ "Lấy tên từ Teams" năm ngôn ngữ | 3 |
| Tạo `licenses/models/3D-Speaker-LICENSE.txt`, `scripts/models/speaker-manifest.mjs`, `scripts/models/speaker-manifest.test.mjs`, `scripts/models/released/body-4.json` (chỉ ở Task 22, chủ dự án), `$B/results/07-nghiem-thu.md`; sửa `scripts/release/notices.mjs`, `scripts/release/notices.test.mjs`, `.github/workflows/ci.yml` | giấy phép model, script manifest, test | 4 |
| Sửa `.github/workflows/release.yml`, `scripts/release/workflow.test.mjs` | `release.yml` chạy `speaker::`, `db::`, `diagnostics::` ở bản release | 5 |
| (không sửa file) | dựng và kiểm bản release cục bộ | 6 |
| Tạo `$DATA/out/07/…`, `$B/results/07-nghiem-thu.md` | A-spk1, A-spk2, A-spk7 trên bản ứng viên | 7 |
| Tạo `$DATA/out/07/a-spk4/…` | A-spk4 (độ trễ) và nhãn muộn | 8 |
| Tạo `$DATA/out/07/soak/…` | soak > 1 giờ | 9 |
| Sửa `docs/legal/*`, `website/test/site.test.mjs` | chính sách 1.9, EULA 1.6 | 10 (07b) |
| Sửa `website/src/content/{vi,en,ja,zh,ko}/*.mjs`, `website/test/site.test.mjs` | website năm ngôn ngữ | 11, 12 (07b) |
| Sửa spec chính | §2 D1, §3.1–§3.3, §5, §6.3, §6.6, §7, §8, §10.1, §10.2 | 13 (07b) |
| Sửa `docs/release/phat-hanh.md` | runbook mục 16 | 14 (07b) |

---

### Task 0: Mốc ban đầu

**Files:** tạo `$B/results/07-nghiem-thu.md` (khung, điền dần ở các Task sau)

- [ ] **Step 1: Nhánh, trạng thái, số bản kế, quyền commit, đĩa**

Run: `cd $W && git branch --show-current && git log --oneline -6 && git status --short | wc -l && git fetch origin && git rev-list --count HEAD..origin/main && git show origin/main:src-tauri/tauri.conf.json | /usr/bin/grep '"version"' && git ls-remote --tags origin | tail -3 | awk '{print $2}' && df -k /System/Volumes/Data | tail -1 | awk '{printf "%.1f GiB trống\n", $4/1048576}' && node --version && rustc --version`
Expected: `phan-biet-nguoi-noi`; sáu commit, đầu là `ab90f013`; số dòng `git status` (ghi lại để đối chiếu ở các Mốc kiểm; có thể có file của 06b chưa commit); số commit `origin/main` đi trước (chỉ là commit website, ghi lại); `"version": "0.3.1"`; ba tag cuối trong đó có `refs/tags/v0.3.1` và **không** có tag cao hơn; còn trống ≥ 14 GiB; Node 24.x; `rustc 1.98.1`. Nếu `origin/main` đã ở số khác 0.3.1 hay có tag cao hơn, **dừng** và báo chủ dự án (đổi số bản ở các Task nêu ở QĐ 1; nhánh có thể cần cập nhật theo `main`, việc của chủ dự án).
Nếu không có ghi nhận mới rằng chủ dự án còn cho commit cục bộ, hỏi một câu (AskUserQuestion): "Cho commit cục bộ trên nhánh `phan-biet-nguoi-noi` (không push, không gộp)?" và theo câu trả lời: không cho thì bỏ các bước "Commit" và để mọi thay đổi ở working tree.

- [ ] **Step 2: Điều kiện đầu vào: những gì còn chờ chủ dự án**

Run: `cd $B/results && /usr/bin/grep -n -i "chờ chủ dự án\|chưa kiểm\|chờ task\|^\*\*Chờ" 04-do.md 04-ghep-ten.md 05-windows.md 06-van-hanh.md | cut -c1-200 | head -40`
Expected: liệt kê các mục còn chờ: 04b Task 19–21 (bộ đọc macOS với app thật), 05b Task 10–13 (Windows UI Automation), 06b Task 17–22 (triển khai server, đăng công thức, kiểm tra tự động, báo động thử, mẫu nhãn 5 ngôn ngữ). Chép nguyên văn từng mục còn chờ vào bảng "Điều kiện đầu vào" của `$B/results/07-nghiem-thu.md` (Step 4) với cột "Ảnh hưởng tới phát hành": mục nào chưa đạt thì **không đưa** phần tương ứng ra người dùng (Teams macOS phải đạt A-spk3 ở Task 18 trước khi bật; Windows giữ tắt; Meet và Zoom giữ ngoài công thức).

- [ ] **Step 3: Số test nền (mọi thứ xanh trước khi sửa)**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && for p in speaker-protocol speaker-recipe speaker-ops speaker-canary speaker-worker pipeline; do echo "== $p"; cargo test --locked -p $p 2>&1 | /usr/bin/grep -E "^test result|FAILED|panicked"; done; echo "== app"; cargo test --locked -p meeting-translator --lib 2>&1 | /usr/bin/grep -E "^test result|FAILED"; cd $W/server && pnpm install --frozen-lockfile 2>&1 | tail -1 && pnpm exec vitest run 2>&1 | /usr/bin/grep -E "Tests |Test Files"; cd $W/server/admin-ui && pnpm exec vitest run 2>&1 | /usr/bin/grep -E "Tests |Test Files"; cd $W && pnpm install --frozen-lockfile 2>&1 | tail -1 && pnpm exec vitest run 2>&1 | /usr/bin/grep -E "Tests |Test Files"; cd $W/website && pnpm install --frozen-lockfile 2>&1 | tail -1 && pnpm test 2>&1 | /usr/bin/grep -E "^# (pass|fail)"; cd $W && node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs scripts/speaker-recipes/update.test.mjs tools/speaker-canary/canary.test.mjs 2>&1 | /usr/bin/grep -E "^# (pass|fail)"`
Expected (số đo 2026-10-28 ở `$B/results/06-van-hanh.md`; lệch thì ghi số thật): `speaker-protocol` 15; `speaker-recipe` 8; `speaker-ops` 41 (1 bỏ qua); `speaker-canary` 13; `speaker-worker` lib 167 (5 bỏ qua) và `worker_process` 10; `pipeline` lib 360 và `speaker_client` 31; app lib 957 (6 bỏ qua); server 47 file, 1 694 test; Web Admin 51 file, 1 159 test; vitest gốc ≥ 430 (ghi số); website `# fail 0` (ghi số `# pass`); `node --test` `# fail 0` (≥ 230). **Chép các số này vào `$B/results/07-nghiem-thu.md` (Step 4).** Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 4: Tạo biên bản khung**

Tạo `$B/results/07-nghiem-thu.md` (tiếng Việt, theo mẫu `06-van-hanh.md`) với các mục: "Câu hỏi" (spec §11, §12, §13 mục 7: nghiệm thu A-spk1…A-spk7 trên bản ứng viên, và điều kiện để bật), "Điều kiện" (máy, nhánh, HEAD, ngày), "Điều kiện đầu vào" (bảng Step 2), "Số test nền" (Step 3), rồi các tiêu đề trống đánh số theo Task: "Thư viện (Task 1)", "Công tắc (Task 2)", "Model và giấy phép (Task 4)", "Bản release cục bộ (Task 6)", "A-spk1, A-spk2, A-spk7 (Task 7)", "A-spk4 và nhãn muộn (Task 8)", "Soak (Task 9)", "A-spk3 (Task 18)", "Windows (Task 19)", "A7 (Task 22)", "Chưa kiểm". Mỗi mục trống ghi dòng `Chờ Task N.` để người đọc biết chưa có số.

- [ ] **Step 5: Test nền ở bản release (chạy nền, dài)**

Đây là lần đầu chạy cục bộ `speaker::`, `db::`, `diagnostics::` ở profile release (CI có, máy này chưa; `$B/results/02-tong-hop.md` "Còn mở"). Chạy trước khi sửa công tắc để biết nền xanh.
Run (nền, `run_in_background`): `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 pnpm build >/dev/null 2>&1; CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: db:: --test-threads=1 2>&1 | tail -15`
Expected: `test result: ok.` với số test lớn hơn 0 (ghi số), không `FAILED`. Mất 30–60 phút (LTO). Khi xong ghi số vào biên bản; đỏ thì **dừng** và báo (lỗi có từ trước, không phải của kế hoạch này). Tắt tiến trình nền khi xong.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short | wc -l`
Expected: bằng số ghi ở Step 1 cộng đúng một dòng (`$B/results/07-nghiem-thu.md`, nằm trong `bench/` đã theo dõi hay chưa tùy `.gitignore`). Commit cục bộ (nếu được phép): `cd $W && git branch --show-current && git add bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "docs(speaker): biên bản nghiệm thu 07, khung và số nền"` (kèm dòng đồng tác giả theo nhắc nhở của phiên thực thi).

---

### Task 1: Nâng `libc`, `sha2`, `serde_json`, `realfft` lên bản ổn định mới nhất

CLAUDE.md: "luôn dùng bản ổn định mới nhất; kiểm tương thích và xung đột; sau khi cài, build lại toàn bộ và chạy test". Bốn thư viện nằm trong các crate phát hành (mọi binary), nên nâng đổi `Cargo.lock` của cả workspace.

**Files:**
- Modify: `Cargo.toml` (gốc), `crates/pipeline/Cargo.toml`, `crates/asr-worker/Cargo.toml`, `crates/audio-capture/Cargo.toml`, `crates/latency-bench/Cargo.toml`, `crates/speaker-worker/Cargo.toml`, `crates/speaker-canary/Cargo.toml`, `src-tauri/Cargo.toml`, `Cargo.lock`, `scripts/check-windows.sh`

- [ ] **Step 1: Kiểm phiên bản (chỉ đọc), ghi vào biên bản**

Run:
```bash
for c in libc sha2 serde_json realfft; do v=$(curl -s -m 20 -A "ai-translator-release-check" "https://crates.io/api/v1/crates/$c" | python3 -c 'import sys,json; d=json.load(sys.stdin)["crate"]; print(d["max_stable_version"])'); l=$(/usr/bin/grep -A1 "^name = \"$c\"$" $W/Cargo.lock | /usr/bin/grep version | sed 's/version = //' | tr -d '"' | tr '\n' ' '); echo "$c stable=$v lock=$l"; sleep 1; done
for cv in libc/0.2.191 sha2/0.11.1 serde_json/1.0.154 realfft/3.5.1; do curl -s -m 20 -A "ai-translator-release-check" "https://crates.io/api/v1/crates/$cv" | python3 -c 'import sys,json; d=json.load(sys.stdin)["version"]; print(d["crate"], d["num"], "rust_version=", d.get("rust_version"), "yanked", d["yanked"])'; sleep 1; done
```
Expected: `libc stable=0.2.191 lock=0.2.189`; `sha2 stable=0.11.1 lock=0.10.9 0.11.0` (hai bản: `0.10.9` là phụ thuộc gián tiếp có từ trước); `serde_json stable=1.0.154 lock=1.0.151`; `realfft stable=3.5.1 lock=3.5.0`; dòng sau: `rust_version= 1.65`, `1.88`, `1.71`, `1.61`, `yanked False` cả bốn. Số khác (crates.io đã ra bản mới hơn) thì **dùng bản mới nhất thật** và thay số ở các lệnh bên dưới. `rust_version` lớn hơn 1.98 hay `yanked True` thì dừng, báo.

- [ ] **Step 2: Xem trước tác động (không ghi gì)**

Run: `cd $W && CARGO_TARGET_DIR=/tmp/none cargo update -p libc -p serde_json -p realfft -p sha2@0.11.0 --dry-run 2>&1 | tail -8`
Expected: `Locking 4 packages to latest Rust 1.98 compatible versions` và bốn dòng `Updating libc v0.2.189 -> v0.2.191`, `realfft v3.5.0 -> v3.5.1`, `serde_json v1.0.151 -> v1.0.154`, `sha2 v0.11.0 -> v0.11.1`; cuối cùng `warning: not updating lockfile due to dry run`. Nhiều hơn bốn gói thì dừng và đọc: có thứ gì đó khác bị kéo theo.

- [ ] **Step 3: Sửa yêu cầu phiên bản trong các `Cargo.toml`**

```bash
cd $W && sed -i '' 's/^serde_json = "1.0.151"$/serde_json = "1.0.154"/' Cargo.toml \
 && sed -i '' 's/^libc = "0.2.189"$/libc = "0.2.191"/' crates/pipeline/Cargo.toml crates/asr-worker/Cargo.toml crates/audio-capture/Cargo.toml crates/latency-bench/Cargo.toml crates/speaker-worker/Cargo.toml src-tauri/Cargo.toml \
 && sed -i '' 's/^realfft = "3.5.0"$/realfft = "3.5.1"/' crates/speaker-worker/Cargo.toml \
 && sed -i '' 's/^sha2 = "0.11.0"$/sha2 = "0.11.1"/' crates/speaker-worker/Cargo.toml crates/speaker-canary/Cargo.toml src-tauri/Cargo.toml \
 && git diff --stat -- '*.toml' | tail -10 && /usr/bin/grep -rn '0.2.189\|"0.11.0"\|"3.5.0"\|"1.0.151"' --include=Cargo.toml . | /usr/bin/grep -v "/target/\|third_party\|node_modules"
```
Expected: 8 file `.toml` đổi (gốc, `pipeline`, `asr-worker`, `audio-capture`, `latency-bench`, `speaker-worker`, `speaker-canary`, `src-tauri`); lệnh `grep` cuối không in dòng nào ngoài các phụ thuộc không liên quan (nếu in `candle-*` `"0.11.0"` thì đó là `candle`, **không đổi**: kiểm từng dòng, chỉ bốn thư viện của bước này được đổi).

- [ ] **Step 4: Cập nhật `Cargo.lock` đúng bốn gói**

```bash
cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 \
 && cargo update -p libc --precise 0.2.191 2>&1 | tail -2 \
 && cargo update -p serde_json --precise 1.0.154 2>&1 | tail -2 \
 && cargo update -p realfft --precise 3.5.1 2>&1 | tail -2 \
 && cargo update -p sha2@0.11.0 --precise 0.11.1 2>&1 | tail -2 \
 && git diff --stat Cargo.lock && git diff Cargo.lock | /usr/bin/grep '^[+-][^+-]' | sort | uniq -c | sort -rn | head -20
```
Expected: mỗi lệnh in `Updating X vA -> vB`; `Cargo.lock` đổi **8 dòng mỗi phía** (`version` và `checksum` của bốn gói, không dòng nào khác). Thấy nhiều hơn thì đọc `git diff Cargo.lock` trước khi đi tiếp.

- [ ] **Step 5: Thêm hai crate vận hành vào clippy chéo Windows**

`06-van-hanh.md` đề xuất, chưa ai làm: `scripts/check-windows.sh` chưa liệt kê `speaker-ops`, `speaker-canary`. Sửa dòng clippy:

```old
cargo clippy -p meeting-translator -p pipeline -p audio-capture -p speaker-worker -p speaker-protocol --target x86_64-pc-windows-msvc --all-targets "$@" \
```
```new
cargo clippy -p meeting-translator -p pipeline -p audio-capture -p speaker-worker -p speaker-protocol -p speaker-ops -p speaker-canary --target x86_64-pc-windows-msvc --all-targets "$@" \
```

- [ ] **Step 6: Build lại toàn bộ và chạy test (CLAUDE.md)**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt --all -- --check && echo fmt-ok && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -2 && cargo test --locked --workspace 2>&1 | /usr/bin/grep -E "^test result|FAILED|panicked|error(\[|:)" | sort | uniq -c | sort -rn | head -12 && cargo test --locked -p asr-worker --features shared-encode 2>&1 | /usr/bin/grep -E "^test result|FAILED"`
Expected: `fmt-ok`; clippy `Finished` không cảnh báo; mọi `test result: ok.` (không dòng `FAILED`); `asr-worker --features shared-encode` ok. Test đáng chú ý phải nằm trong đó: `fbank::tests::matches_kaldi_native_fbank` (realfft đổi: sai lệch vẫn dưới 1e-3), các test `integrity::` (sha2), giao thức (`serde_json`), `the_worker_lowers_its_priority` (libc). Đỏ thì dừng và đọc: **đổi hành vi thì báo**, đừng sửa test cho khớp.

- [ ] **Step 7: B' giống từng bit và model thật (chạy lại mỗi khi nâng thư viện nền)**

Spec §14: B' dựa vào hành vi chưa ghi thành tài liệu của `candle-onnx`; `realfft` đổi nên chạy lại cả nhúng so onnxruntime.
Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --locked --release -p speaker-worker --lib -- --ignored steps_match embedding_matches 2>&1 | /usr/bin/grep -E "^test |test result"`
Expected: `steps_match_simple_eval_on_the_real_model ... ok` và `embedding_matches_onnxruntime ... ok`; `test result: ok. 2 passed`. Hỏng thì dừng, báo (không nâng `realfft`; giữ 3.5.0 và ghi lý do vào "Điều cần chủ dự án quyết").

- [ ] **Step 8: Chéo Windows, giấy phép, bảo mật, không mã mạng, không hai bản ggml**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && scripts/check-windows.sh --locked 2>&1 | tail -3; cargo deny check 2>&1 | tail -3; cargo audit 2>&1 | tail -6; scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe 2>&1 | tail -3; cargo tree -d --workspace 2>/dev/null | /usr/bin/grep -E "^(libc|serde_json|realfft|sha2) " ; echo "== ggml trong app:"; cargo tree -p meeting-translator 2>/dev/null | /usr/bin/grep -i ggml | head -3`
Expected: `check-windows.sh` `Finished`, thoát 0; `cargo deny`: `advisories ok, bans ok, licenses ok, sources ok`; `cargo audit`: không lỗ hổng mới (sáu cảnh báo cũ không bảo trì ở `paste`, `proc-macro-error`, `zbus_names`, `zvariant`, `zvariant_derive`, `glib`, như `06-van-hanh.md`); `check-no-network.sh` sạch; `cargo tree -d`: chỉ `sha2` hiện hai bản (`0.10.9` gián tiếp có từ trước và `0.11.1`), `libc`, `serde_json`, `realfft` mỗi cái một bản (không in); mục ggml rỗng.

- [ ] **Step 9: Thư viện npm (chỉ ghi, không nâng)**

Run: `cd $W && pnpm outdated 2>&1 | head -30; cd $W/server && pnpm outdated 2>&1 | head -20; cd $W/website && pnpm outdated 2>&1 | head -20`
Expected: bảng các gói trực tiếp còn bản mới hơn (có thể trống). Chép vào biên bản mục "Thư viện (Task 1)": nâng npm đổi giao diện và server, không thuộc kế hoạch này; kế hoạch 07 **không cài thêm gói npm nào** nên không vi phạm CLAUDE.md. Gói có `pnpm audit --audit-level high` đỏ thì báo.

- [ ] **Step 10: Mốc kiểm**

Run: `cd $W && git status --short | /usr/bin/grep -v "^??" | head -12 && git diff --stat | tail -1`
Expected: đúng chín file đổi (tám `.toml`, `Cargo.lock`) cộng `scripts/check-windows.sh`; mọi lệnh Step 6–8 đạt. Ghi vào biên bản "Thư viện (Task 1)": bảng bốn gói (cũ → mới, MSRV), kết quả từng lệnh, số test. Commit cục bộ: `cd $W && git branch --show-current && git add Cargo.toml Cargo.lock crates/*/Cargo.toml src-tauri/Cargo.toml scripts/check-windows.sh bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "build(deps): nâng libc 0.2.191, sha2 0.11.1, serde_json 1.0.154, realfft 3.5.1 (bản ổn định mới nhất)"`.

---

### Task 2: Công tắc thành tính năng thật, "ngủ" khi manifest chưa có mục `speaker`

Hiện `speaker::enabled()` của bản phát hành luôn `false` (src-tauri/src/speaker/mod.rs). Task này đặt: macOS `true`, Windows theo hằng `SHIPS_ON_WINDOWS` (mặc định `false`), hệ điều hành khác `false`; bản debug giữ cờ dev. Thêm hàm `ModelService::speaker_offered` để các nơi khác biết manifest có mục `speaker` cho bản này hay không.

**Files:**
- Modify: `src-tauri/src/speaker/mod.rs` (đầu file, `enabled`, `mod tests`), `src-tauri/src/speaker/recipes.rs` (vòng tải công thức), `src-tauri/src/models/service.rs` (hàm và test mới), `src/windows/main/settings/SubtitleSettings.tsx`, `src/windows/main/settings/SpeakerSettingsWiring.test.ts`

- [ ] **Step 1: Viết test trước (bảng hệ điều hành, hai chế độ build)**

Mở `src-tauri/src/speaker/mod.rs`, tìm `#[cfg(test)] mod tests {` và thêm **vào cuối** khối `mod tests` (trước dấu `}` đóng của nó):

```rust
    /// Kế hoạch 07, QĐ 2: bản phát hành bật nhận giọng trên đúng các hệ điều hành đã nghiệm thu, và chỉ ở đó.
    #[test]
    fn the_release_ships_on_the_audited_platforms_only() {
        assert!(ships_on("macos"));
        assert_eq!(ships_on("windows"), SHIPS_ON_WINDOWS);
        assert!(!ships_on("linux"));
        assert!(!ships_on(""));
    }

    /// Chỉ chạy ở bản release (`cargo test --release`, CI): công tắc của bản phát hành đúng bằng bảng hệ điều hành, không đọc biến môi trường.
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_follow_the_platform_table_not_the_environment() {
        assert_eq!(enabled(), ships_on(std::env::consts::OS));
    }

    /// Bản debug (`cargo test` thường): chỉ bật khi có cờ dev; giá trị khác `true` không bật.
    #[cfg(debug_assertions)]
    #[test]
    fn debug_builds_stay_opt_in() {
        assert!(!switch_on(None));
        assert!(!switch_on(Some("1")));
        assert!(!switch_on(Some("TRUE")));
        assert!(switch_on(Some("true")));
    }
```

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --locked -p meeting-translator --lib speaker::tests::the_release_ships 2>&1 | tail -6`
Expected: lỗi biên dịch `cannot find function \`ships_on\`` và `cannot find value \`SHIPS_ON_WINDOWS\``.

- [ ] **Step 2: Thêm hằng, hàm và đổi `enabled()`**

Sửa `src-tauri/src/speaker/mod.rs`. Đoạn đầu file (chữ cũ của dòng 4–8):

```old
//! **Tới kế hoạch 07: tính năng TẮT với người dùng cuối.** Công tắc nội bộ [`enabled`]: chỉ bản debug bật được, bằng
//! `AI_TRANSLATOR_DEV_SPEAKER=true` trong `.env` (đọc qua `scripts/run-dev-app.sh`, cùng cơ chế `AI_TRANSLATOR_DEV_PRO`, spec
//! 2026-10-04 §2). Mã đọc biến nằm sau `cfg(debug_assertions)`; bản phát hành không có chuỗi tên biến (`release-check.mjs
//! no-dev-gate` chặn). Kế hoạch 03 thêm cài đặt `speakerDiarization` (mặc định bật): phiên có nhận giọng khi [`active`], tức công
//! tắc nội bộ bật **và** cài đặt bật; giao diện chỉ hiện nhóm Cài đặt "Người nói" khi [`enabled`] (`AppInfo::speaker_available`).
```
```new
//! **Bản phát hành (kế hoạch 07, QĐ 2):** [`enabled`] theo bảng hệ điều hành đã nghiệm thu ([`ships_on`]): macOS bật, Windows theo
//! [`SHIPS_ON_WINDOWS`] (`false` tới khi có số đo máy Windows i5), hệ điều hành khác tắt. Bản phát hành không đọc biến môi trường
//! nào. Công tắc dev: chỉ bản debug, `AI_TRANSLATOR_DEV_SPEAKER=true` trong `.env` (đọc qua `scripts/run-dev-app.sh`, cùng cơ chế
//! `AI_TRANSLATOR_DEV_PRO`, spec 2026-10-04 §2); mã đọc biến nằm sau `cfg(debug_assertions)`, bản phát hành không có chuỗi tên
//! biến (`release-check.mjs no-dev-gate` chặn). Bản này có mã tính năng chưa có nghĩa là tính năng đang chạy: model nhận giọng chỉ
//! có khi manifest có mục `speaker` ([`crate::models::service::ModelService::speaker_offered`]); chưa có thì mọi thứ "ngủ" như
//! bản không có tính năng. Bỏ mục đó khỏi manifest là cách tắt khẩn từ xa. Cài đặt `speakerDiarization` (mặc định bật): phiên có
//! nhận giọng khi [`active`], tức công tắc nội bộ bật **và** cài đặt bật.
```

Đoạn `enabled()` (chữ cũ của dòng 54–64):

```old
/// Bản này có tính năng không (công tắc nội bộ). Bản phát hành: luôn `false` tới kế hoạch 07; bản debug: theo cờ dev.
pub fn enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_SPEAKER_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}
```
```new
/// Bản phát hành có tính năng trên Windows không. Giữ `false` tới khi có số đo A-spk4 và A-spk5 trên máy Windows i5 và bản ghi
/// cây UI Automation thật (kế hoạch 07, QĐ 2); bật là đổi hằng này ở bản phát hành đó.
pub const SHIPS_ON_WINDOWS: bool = false;

/// Bản phát hành có tính năng trên hệ điều hành `os` (`std::env::consts::OS`) không.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn ships_on(os: &str) -> bool {
    match os {
        "macos" => true,
        "windows" => SHIPS_ON_WINDOWS,
        _ => false,
    }
}

/// Bản này có tính năng không (công tắc nội bộ). Bản phát hành: theo bảng hệ điều hành ([`ships_on`]); bản debug: theo cờ dev.
pub fn enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_SPEAKER_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        ships_on(std::env::consts::OS)
    }
}
```

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --locked -p meeting-translator --lib speaker:: 2>&1 | /usr/bin/grep -E "^test result|FAILED|error" | head`
Expected: `test result: ok.` (gồm `the_release_ships_on_the_audited_platforms_only` và `debug_builds_stay_opt_in`; test `release_builds_…` không chạy ở debug).

- [ ] **Step 3: `ModelService::speaker_offered` (test trước)**

Mở `src-tauri/src/models/service.rs`, tìm test `the_speaker_model_state_reaches_the_ui` (kết thúc bằng khối thử `SpeakerDownloading::start`) và thêm **ngay trước** dòng `/// Kế hoạch 03 (QĐ 15): trạng thái model nhận giọng tới giao diện` một test mới (cùng `mod tests`):

```rust
    /// Kế hoạch 07, QĐ 3: "manifest có mục `speaker` dùng được cho bản này" là điều kiện để tính năng thôi "ngủ" (tải công thức,
    /// hiện nhóm Cài đặt). Chưa có mục, hay mục cần app mới hơn, thì `false`.
    #[test]
    fn the_speaker_entry_wakes_the_feature_only_when_the_manifest_offers_it() {
        let offered = |entry: Option<serde_json::Value>| {
            let h = harness(|_| {});
            let mut body = real_sample();
            if let Some(entry) = entry {
                body["speaker"] = entry;
            }
            publish(&h.server, &body);
            h.call("load_models", json!({})).unwrap();
            h.service().speaker_offered()
        };
        let entry = |min_app_version: &str| {
            json!({
                "id": "eres2net-voxceleb", "version": "1", "file": "eres2net.onnx", "url": "files/eres2net.onnx",
                "bytes": 64, "sha256": "be".repeat(32), "license_id": "Apache-2.0", "min_app_version": min_app_version
            })
        };
        assert!(!offered(None), "manifest chưa có mục speaker: ngủ");
        assert!(offered(Some(entry("0.1.0"))), "có mục dùng được: thức");
        assert!(!offered(Some(entry("99.0.0"))), "mục cần app mới hơn: ngủ");
    }
```

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --locked -p meeting-translator --lib models::service::tests::the_speaker_entry_wakes 2>&1 | tail -5`
Expected: lỗi biên dịch `no method named \`speaker_offered\``.

Thêm hàm vào `impl ModelService`, **ngay trước** hàm `pub fn speaker_model(&self)` (tìm dòng `/// Model nhận giọng đã tải và đúng kích thước`):

```rust
    /// Manifest hiện có mục `speaker` dùng được cho bản app này (kế hoạch 07, QĐ 3): chưa có (hay mục sai, hay cần app mới hơn) thì
    /// tính năng "ngủ", không tải gì, không hiện gì. Khác [`Self::speaker_model`]: hàm đó còn đòi file đã tải.
    pub fn speaker_offered(&self) -> bool {
        self.manifest()
            .and_then(|s| s.manifest.speaker_model(&self.cfg.app_version))
            .is_some()
    }

```
Run lại lệnh ở trên.
Expected: `test result: ok. 1 passed`.

- [ ] **Step 4: Vòng tải công thức chỉ chạy khi manifest có mục `speaker`**

Sửa `src-tauri/src/speaker/recipes.rs`, trong vòng `std::thread::spawn` của `install` (chữ cũ):

```old
            let on = app
                .try_state::<AppState>()
                .is_some_and(|s| wanted(super::enabled(), &s.settings()));
            if on {
```
```new
            let on = app
                .try_state::<AppState>()
                .is_some_and(|s| wanted(super::enabled(), &s.settings()))
                && app
                    .try_state::<Arc<ModelService>>()
                    .is_some_and(|m| m.speaker_offered());
            if on {
```
Kiểm đầu file có `use crate::models::service::ModelService;` chưa: `cd $W && /usr/bin/grep -n "^use " src-tauri/src/speaker/recipes.rs`. Chưa có thì thêm `use crate::models::service::ModelService;` cùng nhóm với các `use crate::…` đã có (đúng thứ tự chữ cái để `cargo fmt` không đổi).
Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --locked -p meeting-translator --lib speaker:: 2>&1 | /usr/bin/grep -E "^test result|FAILED|error"`
Expected: `test result: ok.` (vòng nền không có test riêng: hành vi của `speaker_offered` đã có test ở Step 3; việc nối vào vòng được kiểm ở Task 6 Step 4 bằng cách đọc log bản release).

- [ ] **Step 5: Mã Rust: fmt, clippy hai nền tảng, test lại phần liên quan**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p meeting-translator -- --check && echo fmt-ok && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -2 && scripts/check-windows.sh --locked 2>&1 | tail -2 && cargo test --locked -p meeting-translator --lib 2>&1 | /usr/bin/grep -E "^test result|FAILED"`
Expected: `fmt-ok`; clippy sạch ở cả hai nền tảng (hàm `ships_on` có `allow(dead_code)` ở bản debug nên không cảnh báo); app lib **960** đạt, 6 bỏ qua (957 của `06-van-hanh.md` cộng ba test mới chạy ở debug: `the_release_ships_on_the_audited_platforms_only`, `debug_builds_stay_opt_in`, `the_speaker_entry_wakes_the_feature_only_when_the_manifest_offers_it`; ghi số thật).

- [ ] **Step 6: Nhóm Cài đặt "Người nói" chỉ hiện khi manifest có model (test trước)**

Sửa `src/windows/main/settings/SpeakerSettingsWiring.test.ts`. (a) Trong `beforeEach`, model mặc định của ModelsView giả là `unavailable` nên đặt `ready` cho các test "bản có tính năng":

```old
  modelsStore.setState({ view: fakeModelsView() });
});
```
```new
  modelsStore.setState({ view: fakeModelsView({ speaker: "ready" }) });
});
```
(b) Thêm test mới vào `describe("Cài đặt › Phụ đề: nhóm Người nói", …)`, ngay sau test `"chưa đọc được AppInfo (info = null): không hiện nhóm"`:

```ts
  // Kế hoạch 07, QĐ 3: bản đã có mã tính năng nhưng manifest chưa có mục `speaker` ("ngủ") thì giao diện không hiện gì.
  it("ModelsView.speaker = unavailable (manifest chưa có model): không hiện nhóm, cả khi bản có tính năng", () => {
    for (const platform of ["macos", "windows"] as const) {
      appStore.setState({ info: info({ speakerAvailable: true, platform }) });
      modelsStore.setState({ view: fakeModelsView({ speaker: "unavailable" }) });
      const markup = subtitles();
      expect(markup).not.toContain("speaker-settings");
      expect(markup).not.toContain(viText["settings.speakers.title"]);
      expect(markup).toContain("show-source");
    }
    modelsStore.setState({ view: null });
    expect(subtitles()).not.toContain("speaker-settings");
    for (const speaker of ["missing", "downloading", "ready"] as const) {
      modelsStore.setState({ view: fakeModelsView({ speaker }) });
      expect(subtitles(), speaker).toContain('<section id="speaker-settings"');
    }
  });
```
Run: `cd $W && pnpm exec vitest run src/windows/main/settings/SpeakerSettingsWiring.test.ts 2>&1 | tail -12`
Expected: test mới **đỏ** (`unavailable` vẫn hiện nhóm); các test cũ xanh.

Sửa `src/windows/main/settings/SubtitleSettings.tsx` (chữ cũ):

```old
  const speakers = info?.speakerAvailable === true;
```
```new
  // Bản có mã tính năng nhưng manifest chưa có mục `speaker` ("ngủ", kế hoạch 07 QĐ 3): không hiện nhóm (nút bật tắt sẽ chẳng làm gì).
  const speakers = info?.speakerAvailable === true && speakerModel !== "unavailable";
```
(`speakerModel` khai báo ở dòng trên đó, không cần đổi thứ tự.)
Run: `cd $W && pnpm exec vitest run src/windows/main/settings 2>&1 | tail -8 && pnpm exec tsc --noEmit -p . 2>&1 | tail -3`
Expected: mọi test trong `src/windows/main/settings` xanh (kể cả test mới); `tsc` không lỗi.

- [ ] **Step 7: Kiểm không còn chỗ nào khác giả định "bản phát hành không có tính năng"**

Run: `cd $W && /usr/bin/grep -rn "tới kế hoạch 07\|bản phát hành: luôn\|bản phát hành không\|bản phát hành \(luôn \)\?tắt" src-tauri/src src crates scripts --include='*.rs' --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.sh' | /usr/bin/grep -i "speaker\|nhận giọng\|người nói" | cut -c1-200`
Expected: các dòng chú thích còn nói "tắt tới kế hoạch 07" (ở `session.rs`, `commands.rs`, `state.rs`, `speaker/health.rs`, `recipes.rs`, `scripts/run-dev-app.sh`…). **Sửa chữ từng chỗ** thành mô tả đúng ("bản phát hành: bật theo `speaker::enabled()`; ngủ khi manifest chưa có mục `speaker`") bằng Edit; không đổi mã. Mỗi chỗ ghi `Tệp:` và dòng cũ/mới trong biên bản. Không còn dòng nào nói tính năng "tắt với người dùng cuối".

- [ ] **Step 8: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt --all -- --check && echo fmt-ok && cargo test --locked -p meeting-translator --lib 2>&1 | /usr/bin/grep -E "^test result|FAILED" && pnpm exec vitest run 2>&1 | /usr/bin/grep -E "Tests |Test Files" && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | /usr/bin/grep -E "^# (pass|fail)"`
Expected: `fmt-ok`; app lib đạt; vitest đạt; `node --test` `# fail 0` (`dev-gate-markers.test.mjs`, `dev-env.test.mjs` và `run-dev-app.test.mjs` vẫn xanh: công tắc dev không đổi). Commit cục bộ: `cd $W && git branch --show-current && git add src-tauri/src src/windows/main/settings scripts bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "feat(speaker): công tắc thành tính năng thật (macOS bật, Windows theo hằng), ngủ khi manifest chưa có mục speaker"`.

---

### Task 3: Chữ trong app nói đúng phạm vi thật (năm ngôn ngữ)

**Files:** Modify `src/i18n/{vi,en,ja,zh,ko}.ts`

- [ ] **Step 1: Liệt kê chữ nhắc Meet hay Zoom ở phần "Người nói"**

Run: `cd $W && /usr/bin/grep -n "Zoom\|Meet" src/i18n/vi.ts | /usr/bin/grep -i "speaker\|người nói\|tên" | cut -c1-200; for l in vi en ja zh ko; do /usr/bin/grep -n '"settings.speakers.names' src/i18n/$l.ts | cut -c1-90; done`
Expected: `vi.ts` có đúng hai khóa `settings.speakers.names` (dòng 623) và `settings.speakers.names.hint` (dòng 624) nhắc Meet và Zoom; mỗi ngôn ngữ còn lại có hai khóa cùng tên. Có thêm khóa nào khác nhắc "Zoom"/"Meet" trong ngữ cảnh người nói (ví dụ ở dòng mời cấp quyền) thì sửa cùng đợt, theo cùng nguyên tắc (chỉ nói Teams).

- [ ] **Step 2: Sửa chữ**

Mỗi ngôn ngữ hai `Edit`: tên khóa `settings.speakers.names` và `settings.speakers.names.hint`. Chữ cũ lấy đúng từ file (đã in ở Step 1 và `grep` dòng đó); chữ mới:

| Ngôn ngữ | `settings.speakers.names` | `settings.speakers.names.hint` |
|---|---|---|
| vi | `Lấy tên từ Teams` | `Hiện tên người đang nói, đọc từ cửa sổ cuộc họp Microsoft Teams (bản cài trên máy). Không đọc chat, không chụp màn hình. Chưa đọc được tên thì hiện “Người 1”, “Người 2”.` |
| en | `Get names from Teams` | `Shows who is speaking, read from the Microsoft Teams meeting window (the desktop app). Chat is never read and the screen is never captured. Until a name can be read, “Speaker 1”, “Speaker 2” are shown.` |
| ja | `Teams から名前を取得` | `会議ウィンドウから話している人の名前を読み取って表示します（インストール版の Microsoft Teams）。チャットは読まず、画面も撮影しません。名前を読み取れるまでは「話者1」「話者2」と表示します。` |
| zh | `从 Teams 获取姓名` | `从会议窗口读取并显示正在说话的人的姓名（安装版 Microsoft Teams）。不读取聊天，不截屏。读取到姓名之前显示“说话人1”“说话人2”。` |
| ko | `Teams에서 이름 가져오기` | `회의 창에서 말하는 사람의 이름을 읽어 표시합니다(설치형 Microsoft Teams). 채팅은 읽지 않으며 화면을 캡처하지 않습니다. 이름을 읽기 전에는 “화자 1”, “화자 2”로 표시합니다.` |

Dòng `settings.speakers.diarization` và `.hint` giữ nguyên (đúng sự thật: nhận giọng ngay trên máy, không lưu, không gửi).

- [ ] **Step 3: Kiểm năm ngôn ngữ**

Run: `cd $W && pnpm exec vitest run src/i18n 2>&1 | tail -4 && /usr/bin/grep -rn "Meet, Zoom\|Meet、Zoom\|Zoom と\|Meet 在\|Meet in Chrome\|Chrome 또는" src/i18n | /usr/bin/grep "speakers" ; echo "-- còn sót (phải rỗng):"; node scripts/ui-preview/check-i18n.mjs 2>&1 | tail -6`
Expected: vitest của `src/i18n` đạt; lệnh grep trống; `check-i18n.mjs` đạt cả năm ngôn ngữ (cần Vite xem trước ở cổng 1430 và Chrome: bật bằng `pnpm exec vite --config scripts/ui-preview/vite.config.ts` ở một tiến trình nền do chính bạn mở rồi **tắt đúng tiến trình đó** khi xong, như `memory/ui-redesign-2026-10-10.md`; không đụng tiến trình của người khác). Nếu máy không chạy được Chrome không đầu, ghi rõ vào biên bản "chưa chạy check-i18n" và để chủ dự án chạy ở Task 18.

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && pnpm exec vitest run 2>&1 | /usr/bin/grep -E "Tests |Test Files" && git diff --stat | tail -3`
Expected: vitest đạt; đúng năm file `src/i18n/*.ts` đổi, mỗi file 2 dòng. Commit cục bộ: `cd $W && git branch --show-current && git add src/i18n && git commit -m "fix(i18n): chữ Người nói chỉ nhắc Teams, đúng phạm vi bản phát hành"`.

---

### Task 4: Giấy phép model, script manifest (tắt khẩn), test

**Files:**
- Create: `licenses/models/3D-Speaker-LICENSE.txt`, `scripts/models/speaker-manifest.mjs`, `scripts/models/speaker-manifest.test.mjs`
- Modify: `scripts/release/notices.mjs`, `scripts/release/notices.test.mjs`, `.github/workflows/ci.yml`

- [ ] **Step 1: Xác nhận file model và nguồn gốc**

Run: `cd $W && ls -l $DATA/models/eres2net-sv-en-voxceleb-16k.onnx $DATA/models/eres2net-sv-en-voxceleb-16k-LICENSE.txt && shasum -a 256 $DATA/models/eres2net-sv-en-voxceleb-16k.onnx $DATA/models/eres2net-sv-en-voxceleb-16k.orig.onnx $DATA/models/eres2net-sv-en-voxceleb-16k-LICENSE.txt`
Expected: model **26 496 496 byte**, SHA-256 `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e` (đây là file đã dùng cho mọi số đo A-spk1, A-spk2, A-spk4 và RAM; model gốc của sherpa-onnx `…orig.onnx` SHA-256 `c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5`, trùng `SHA_GOC` trong `$B/prepare_model.py`); file giấy phép 11 357 byte, SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`. Số khác thì **dừng**: model không phải file đã nghiệm thu. Ghi ba số vào biên bản "Model và giấy phép (Task 4)". (Tái dựng được từ `python -I $B/prepare_model.py <thư mục>`; nếu dựng lại ra SHA-256 khác do phiên bản `onnxsim`, **vẫn dùng đúng file trong `$DATA/models/`**, không đăng file dựng lại khi chưa chạy lại Task 7.)

- [ ] **Step 2: Giấy phép và nguồn gốc (đọc nguồn thật trước khi ghi)**

(a) Đọc README và mục giấy phép của dự án gốc (`https://github.com/modelscope/3D-Speaker`) và trang bản phát hành của sherpa-onnx (`https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models`), xác nhận: model ERes2Net VoxCeleb của 3D-Speaker theo **Apache-2.0**, và file `3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx` là bản chuyển ONNX do sherpa-onnx đăng. Ghi vào biên bản: URL, ngày đọc, và **dòng bản quyền đúng như nguồn ghi** (tên chủ bản quyền không đoán). Nguồn không ghi Apache-2.0 hay ghi khác thì **dừng**, báo chủ dự án (không phát hành model này).
(b) Chép giấy phép vào repo: `cd $W && cp $DATA/models/eres2net-sv-en-voxceleb-16k-LICENSE.txt licenses/models/3D-Speaker-LICENSE.txt && head -4 licenses/models/3D-Speaker-LICENSE.txt && shasum -a 256 licenses/models/3D-Speaker-LICENSE.txt`
Expected: `Apache License`, `Version 2.0, January 2004`; SHA-256 `c71d239d…0ab4` (như Step 1).

- [ ] **Step 3: Đưa vào `THIRD_PARTY_NOTICES` (test trước)**

Thêm vào cuối `scripts/release/notices.test.mjs` (và đổi dòng `import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";` thành có `readdirSync`):

```js
test("mọi file giấy phép model trong licenses/models/ có mặt trong danh sách của notices.mjs (không sót, không dư)", () => {
  const source = readFileSync(join(root, "scripts/release/notices.mjs"), "utf8");
  for (const file of readdirSync(join(root, "licenses/models"))) {
    assert.ok(source.includes(`licenses/models/${file}`), `${file} chưa được notices.mjs đưa vào THIRD_PARTY_NOTICES`);
  }
  assert.ok(source.includes("3D-Speaker ERes2Net"), "thiếu mục model nhận giọng (Apache-2.0)");
});
```
Run: `cd $W && node --test scripts/release/notices.test.mjs 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`
Expected: test mới **đỏ** ("3D-Speaker-LICENSE.txt chưa được notices.mjs đưa vào…").

Sửa `scripts/release/notices.mjs`, sau dòng `{ title: "Silero VAD v6.2.3 (MIT)", files: [join(root, "licenses/models/silero-vad-LICENSE.txt")] },`:

```old
    { title: "Silero VAD v6.2.3 (MIT)", files: [join(root, "licenses/models/silero-vad-LICENSE.txt")] },
  );
```
```new
    { title: "Silero VAD v6.2.3 (MIT)", files: [join(root, "licenses/models/silero-vad-LICENSE.txt")] },
    {
      title: "3D-Speaker ERes2Net speaker-embedding model (Apache-2.0)",
      files: [join(root, "licenses/models/3D-Speaker-LICENSE.txt")],
    },
    {
      title: "3D-Speaker ERes2Net: source and modification notice",
      text:
        "The speaker-embedding model used to tell speakers apart (eres2net-sv-en-voxceleb-16k.onnx) is the ONNX export of the\n" +
        "3D-Speaker ERes2Net VoxCeleb model published by the sherpa-onnx project (file 3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx,\n" +
        "SHA-256 c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5), licensed under the Apache License, Version 2.0 (text above).\n" +
        "Source: https://github.com/modelscope/3D-Speaker and https://github.com/k2-fsa/sherpa-onnx.\n" +
        "Modification: the ONNX graph was simplified with onnxsim (operators folded, no weight changed); nothing else.\n" +
        "The model runs only on your computer.\n",
    },
  );
```
Nếu ở Step 2(a) nguồn ghi dòng bản quyền cụ thể, thêm vào cuối chuỗi `text` đúng dòng đó (ví dụ `"Copyright …\n"`), không đoán.
Run lại lệnh test. Expected: `# fail 0`.

- [ ] **Step 4: Script manifest và test (chép đúng nội dung; đã thử ngoài repo)**

Tạo hai file với **đúng** nội dung dưới đây (đã chạy thử ở bản sao ngoài repo: 9 test đạt, thử trên model thật cho `models/speaker/beffe43e7027/…`).

File `scripts/models/speaker-manifest.mjs`:

```javascript
#!/usr/bin/env node
// Dựng phần thân manifest model số kế tiếp có (hay không còn) khóa gốc `speaker` (spec 2026-10-26-phan-biet-nguoi-noi §4.5;
// kế hoạch 07). Khóa `speaker` và `speaker_config` nằm ở gốc phần thân, ngoài `files`: app 0.3.1 trở về trước bỏ qua khóa lạ
// ở gốc, còn một `kind` lạ trong `files` thì làm app từ chối cả manifest. Lệnh này không chạm mạng hay R2; nó chỉ ghi
// `scripts/models/released/body-<N+1>.json` (phần thân chưa ký) và in các việc tiếp theo cho người vận hành.
//
//   node scripts/models/speaker-manifest.mjs add --file <model.onnx> --min-app-version 0.3.2 [--config <speaker_config.json>] [--released-dir <thư mục>]
//   node scripts/models/speaker-manifest.mjs remove [--released-dir <thư mục>]   # tắt khẩn: manifest mới không còn `speaker` và `speaker_config`
//
// `--released-dir` (mặc định `scripts/models/released`) để thử ở thư mục tạm mà không ghi vào repo.
//
// `pnpm models:update` giữ nguyên các khóa gốc của bản đang phát hành (`bumpBody` trải `...prev`), nên sau lệnh `add`,
// các lượt cập nhật model về sau không làm mất mục `speaker`.
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "./lib.mjs";
import { bumpBody, latestBody, publishedAtNow, serializeJson } from "./update-lib.mjs";

export const SPEAKER_ID = "eres2net-voxceleb";
const MAX_BYTES = 200 << 20; // như MAX_SPEAKER_BYTES của src-tauri/src/models/manifest.rs
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const VERSION = /^\d+\.\d+\.\d+$/;

/** Mục `speaker` từ file model trên máy: `url` tương đối so với `models/`, thư mục theo 12 ký tự đầu của SHA-256. */
export function speakerEntry({ file, bytes, sha256, version, minAppVersion, licenseId = "Apache-2.0" }) {
  const name = basename(file);
  const entry = {
    id: SPEAKER_ID,
    version,
    file: name,
    url: `speaker/${sha256.slice(0, 12)}/${name}`,
    bytes,
    sha256,
    license_id: licenseId,
    min_app_version: minAppVersion,
  };
  const bad = [
    ["version", typeof version === "string" && version.length > 0 && version.length <= 32],
    ["file", SAFE_NAME.test(name) && !/\.(part|tmp)$/i.test(name)],
    ["bytes", Number.isSafeInteger(bytes) && bytes > 0 && bytes <= MAX_BYTES],
    ["sha256", /^[0-9a-f]{64}$/.test(sha256)],
    ["min_app_version", VERSION.test(minAppVersion ?? "")],
    ["license_id", licenseId.trim().length > 0 && licenseId.length <= 64],
    ["url", entry.url.split("/").every((s) => SEGMENT.test(s) && s !== "." && s !== "..")],
  ].find(([, ok]) => !ok);
  if (bad) throw new Error(`mục speaker không hợp lệ ở trường ${bad[0]}`);
  return entry;
}

/** Phần thân số mới có mục `speaker` (và `speaker_config` nếu cho); từ chối khi bản đang chạy đã có `speaker`. */
export function withSpeaker(prev, entry, config, publishedAt) {
  if (prev.speaker) {
    throw new Error(`manifest số ${prev.sequence} đã có mục speaker (id ${prev.speaker.id}); đổi model là việc riêng, không dùng lệnh này.`);
  }
  if (prev.files.some((f) => f.id === entry.id || f.file.toLowerCase() === entry.file.toLowerCase())) {
    throw new Error(`id hay tên file của mục speaker trùng một file trong \`files\` của manifest số ${prev.sequence}.`);
  }
  const next = bumpBody(prev, {}, publishedAt);
  next.speaker = entry;
  if (config !== undefined) next.speaker_config = config;
  return next;
}

/** Phần thân số mới không còn `speaker` và `speaker_config`: app thôi dùng model nhận giọng từ phiên dịch kế tiếp (tắt khẩn). */
export function withoutSpeaker(prev, publishedAt) {
  if (!prev.speaker) throw new Error(`manifest số ${prev.sequence} không có mục speaker: không có gì để bỏ.`);
  const next = bumpBody(prev, {}, publishedAt);
  delete next.speaker;
  delete next.speaker_config;
  return next;
}

function sha256File(path) {
  return new Promise((ok, err) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => ok(hash.digest("hex")))
      .on("error", err);
  });
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith("--") || rest[i + 1] === undefined) throw new Error(`Tham số không hợp lệ: ${rest.slice(i).join(" ")}`);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  if (mode !== "add" && mode !== "remove") throw new Error("Dùng: speaker-manifest.mjs add --file <model.onnx> --min-app-version <x.y.z> [--config <json>] | remove");
  return { mode, opts };
}

export async function run(argv, { releasedDir = resolve(REPO, "scripts/models/released"), now = new Date(), log = console.log } = {}) {
  const { mode, opts } = parseArgs(argv);
  releasedDir = opts["released-dir"] ? resolve(opts["released-dir"]) : releasedDir;
  const latest = latestBody(releasedDir);
  const prev = JSON.parse(readFileSync(latest.path, "utf8"));
  const publishedAt = publishedAtNow(now);
  let next;
  if (mode === "add") {
    if (!opts.file || !existsSync(opts.file)) throw new Error("Thiếu --file hay file model không có.");
    const sha256 = await sha256File(opts.file);
    const bytes = statSync(opts.file).size;
    const entry = speakerEntry({
      file: opts.file,
      bytes,
      sha256,
      version: opts.version ?? "1",
      minAppVersion: opts["min-app-version"],
      licenseId: opts["license-id"],
    });
    const config = opts.config ? JSON.parse(readFileSync(opts.config, "utf8")) : undefined;
    next = withSpeaker(prev, entry, config, publishedAt);
    log(`Tải lên R2 (rclone hay wrangler, như mục 13 của runbook): ${opts.file}  ->  models/${entry.url}`);
    log(`  SHA-256 ${entry.sha256}, ${entry.bytes} byte`);
  } else {
    next = withoutSpeaker(prev, publishedAt);
    log("Bản này BỎ mục speaker: app thôi dùng model nhận giọng từ phiên dịch sau khi nhận manifest.");
  }
  const out = join(releasedDir, `body-${next.sequence}.json`);
  if (existsSync(out)) throw new Error(`${out} đã có; không ghi đè.`);
  writeFileSync(out, serializeJson(next));
  log(`Đã ghi ${out} (manifest số ${next.sequence}, trước đó số ${prev.sequence}).`);
  log(`Tiếp: ký bằng workflow \`Sign model manifest\` (body=scripts/models/released/body-${next.sequence}.json, previous=scripts/models/released/body-${prev.sequence}.json), rồi tải models.json đã ký lên R2 (runbook mục 16).`);
  return { prev, next, path: out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}
```

File `scripts/models/speaker-manifest.test.mjs`:

```javascript
// Kiểm `speaker-manifest.mjs` (kế hoạch 07 của phân biệt người nói): `node --test scripts/models/speaker-manifest.test.mjs`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bumpBody } from "./update-lib.mjs";
import { SPEAKER_ID, run, speakerEntry, withSpeaker, withoutSpeaker } from "./speaker-manifest.mjs";

const SHA = "be".repeat(32);
const prev = () => ({
  schema: 1,
  sequence: 3,
  published_at: "2026-10-21T05:03:38Z",
  files: [{ id: "notice", file: "NOTICE.txt", kind: "license" }],
  packs: [{ id: "standard" }],
  recommend: { fallback: "lite" },
});
const entryOf = (over = {}) =>
  speakerEntry({ file: "/x/eres2net-sv-en-voxceleb-16k.onnx", bytes: 26_496_496, sha256: SHA, version: "1", minAppVersion: "0.3.2", ...over });

test("mục speaker: url tương đối theo 12 ký tự đầu của SHA-256, id cố định, giấy phép mặc định Apache-2.0", () => {
  assert.deepEqual(entryOf(), {
    id: SPEAKER_ID,
    version: "1",
    file: "eres2net-sv-en-voxceleb-16k.onnx",
    url: `speaker/${SHA.slice(0, 12)}/eres2net-sv-en-voxceleb-16k.onnx`,
    bytes: 26_496_496,
    sha256: SHA,
    license_id: "Apache-2.0",
    min_app_version: "0.3.2",
  });
});

test("mục speaker sai bị từ chối, nêu đúng trường", () => {
  for (const [over, field] of [
    [{ sha256: "xyz" }, "sha256"],
    [{ bytes: 0 }, "bytes"],
    [{ bytes: 201 << 20 }, "bytes"],
    [{ minAppVersion: "0.3" }, "min_app_version"],
    [{ minAppVersion: undefined }, "min_app_version"],
    [{ file: "/x/a b.onnx" }, "file"],
    [{ file: "/x/model.onnx.part" }, "file"],
    [{ version: "" }, "version"],
  ]) {
    assert.throws(() => entryOf(over), new RegExp(`trường ${field}`), JSON.stringify(over));
  }
});

test("thêm speaker: số tăng 1, các phần khác giữ nguyên, speaker_config tùy chọn", () => {
  const next = withSpeaker(prev(), entryOf(), { theta: 0.4 }, "2026-11-01T00:00:00Z");
  assert.equal(next.sequence, 4);
  assert.equal(next.published_at, "2026-11-01T00:00:00Z");
  assert.deepEqual(next.files, prev().files);
  assert.deepEqual(next.packs, prev().packs);
  assert.deepEqual(next.recommend, prev().recommend);
  assert.equal(next.speaker.id, SPEAKER_ID);
  assert.deepEqual(next.speaker_config, { theta: 0.4 });
  assert.equal("speaker_config" in withSpeaker(prev(), entryOf(), undefined, "2026-11-01T00:00:00Z"), false);
});

test("thêm speaker hai lần, hay trùng id hay tên file trong files, bị từ chối", () => {
  const once = withSpeaker(prev(), entryOf(), undefined, "2026-11-01T00:00:00Z");
  assert.throws(() => withSpeaker(once, entryOf(), undefined, "2026-11-02T00:00:00Z"), /đã có mục speaker/);
  const clash = prev();
  clash.files.push({ id: "x", file: "ERES2NET-sv-en-voxceleb-16k.onnx", kind: "asr" });
  assert.throws(() => withSpeaker(clash, entryOf(), undefined, "2026-11-01T00:00:00Z"), /trùng/);
});

test("tắt khẩn: bỏ speaker và speaker_config, số tăng 1; không có speaker thì từ chối", () => {
  const on = withSpeaker(prev(), entryOf(), { theta: 0.4 }, "2026-11-01T00:00:00Z");
  const off = withoutSpeaker(on, "2026-11-03T00:00:00Z");
  assert.equal(off.sequence, 5);
  assert.equal("speaker" in off, false);
  assert.equal("speaker_config" in off, false);
  assert.deepEqual(off.files, prev().files);
  assert.throws(() => withoutSpeaker(prev(), "2026-11-03T00:00:00Z"), /không có mục speaker/);
});

test("pnpm models:update (bumpBody) giữ speaker và speaker_config của bản đang phát hành", () => {
  const on = withSpeaker(prev(), entryOf(), { theta: 0.4 }, "2026-11-01T00:00:00Z");
  const next = bumpBody(on, {}, "2026-11-05T00:00:00Z");
  assert.deepEqual(next.speaker, on.speaker);
  assert.deepEqual(next.speaker_config, on.speaker_config);
  assert.equal(next.sequence, 5);
});

test("lệnh ghi body-<N+1>.json, in việc cần làm, không ghi đè", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "spk-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "body-3.json"), `${JSON.stringify(prev(), null, 2)}\n`);
  const model = join(dir, "eres2net-sv-en-voxceleb-16k.onnx");
  writeFileSync(model, "model-bytes");
  const lines = [];
  const now = new Date("2026-11-01T12:34:56.789Z");
  const done = await run(["add", "--file", model, "--min-app-version", "0.3.2"], { releasedDir: dir, now, log: (l) => lines.push(l) });
  assert.equal(done.next.sequence, 4);
  assert.equal(done.next.published_at, "2026-11-01T12:34:56Z");
  const text = readFileSync(join(dir, "body-4.json"), "utf8");
  assert.ok(text.endsWith("}\n"));
  assert.equal(JSON.parse(text).speaker.bytes, 11);
  assert.ok(lines.some((l) => l.includes("models/speaker/")));
  assert.ok(lines.some((l) => l.includes("body-4.json") && l.includes("body-3.json")));
  // Lần hai: bản mới nhất đã có speaker.
  await assert.rejects(run(["add", "--file", model, "--min-app-version", "0.3.2"], { releasedDir: dir, now, log: () => {} }), /đã có mục speaker/);
  // Tắt khẩn ghi body-5.json.
  const off = await run(["remove"], { releasedDir: dir, now, log: () => {} });
  assert.equal(off.next.sequence, 5);
  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith("body-")).sort(), ["body-3.json", "body-4.json", "body-5.json"]);
});

test("--released-dir đọc và ghi ở thư mục khác, không đụng thư mục mặc định", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "spk-manifest-dir-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "body-7.json"), `${JSON.stringify({ ...prev(), sequence: 7 }, null, 2)}\n`);
  const model = join(dir, "m.onnx");
  writeFileSync(model, "x");
  const done = await run(["add", "--file", model, "--min-app-version", "0.3.2", "--released-dir", dir], { log: () => {} });
  assert.equal(done.next.sequence, 8);
  assert.equal(done.path, join(dir, "body-8.json"));
});

test("tham số sai", async () => {
  await assert.rejects(run([], { releasedDir: ".", log: () => {} }), /Dùng:/);
  await assert.rejects(run(["add", "--file"], { releasedDir: ".", log: () => {} }), /Tham số không hợp lệ/);
});
```

Run: `cd $W && node --test scripts/models/speaker-manifest.test.mjs 2>&1 | /usr/bin/grep -E "^(✔|✖)|^ℹ (pass|fail)"`
Expected: 9 dòng `✔`, `ℹ pass 9`, `ℹ fail 0`.

- [ ] **Step 5: Đưa test vào CI**

Sửa `.github/workflows/ci.yml` (bước "Script phát hành và script manifest model"):

```old
        run: node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs
```
```new
        run: node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/models/speaker-manifest.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs
```
Run: `cd $W && /usr/bin/grep -c "speaker-manifest.test.mjs" .github/workflows/ci.yml && node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/models/speaker-manifest.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | /usr/bin/grep -E "^ℹ (pass|fail)"`
Expected: `1`; `ℹ fail 0`.

- [ ] **Step 6: Cổng kiểm của app chấp nhận phần thân mẫu có mục `speaker` (thử ở thư mục tạm, không ghi vào repo)**

Dựng phần thân thử bằng `--released-dir` (thư mục tạm) và để `check_manifest_body` của app kiểm, cùng luật mà workflow ký manifest dùng. **Không** ghi `body-4.json` vào repo ở bước này (đó là việc của Task 22, ngày đăng):
```bash
cd $W && T=$(mktemp -d) && cp scripts/models/released/body-3.json $T/ && node scripts/models/speaker-manifest.mjs add --file $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --min-app-version 0.3.2 --released-dir $T 2>&1 | tail -4 && MANIFEST_BODY=$T/body-4.json MANIFEST_PREVIOUS=$T/body-3.json CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --locked -p meeting-translator --lib check_manifest_body -- --ignored --nocapture 2>&1 | /usr/bin/grep -E "so với bản trước|^sequence|test result|panicked"; rm -rf $T; git status --short scripts/models | head -3
```
Expected: lệnh `add` in `models/speaker/beffe43e7027/eres2net-sv-en-voxceleb-16k.onnx`, SHA-256 `beffe43e…043e`, `26496496 byte`, `Đã ghi …/body-4.json (manifest số 4, trước đó số 3)`; cổng kiểm in `so với bản trước: sequence 3 -> 4, không đổi id`, `sequence 4`, `test result: ok`; `git status --short scripts/models` chỉ hiện hai file mới của Step 4 (không có `released/body-4.json`).

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && node --test scripts/release/notices.test.mjs scripts/models/speaker-manifest.test.mjs 2>&1 | /usr/bin/grep -E "^ℹ (pass|fail)" && git status --short | /usr/bin/grep -v "^??" ; git status --short licenses scripts/models | head`
Expected: `ℹ fail 0`; file đổi: `scripts/release/notices.mjs`, `notices.test.mjs`, `.github/workflows/ci.yml`; file mới: `licenses/models/3D-Speaker-LICENSE.txt`, `scripts/models/speaker-manifest.mjs`, `scripts/models/speaker-manifest.test.mjs`; **không** có `body-4.json`. Ghi vào biên bản "Model và giấy phép (Task 4)": ba SHA-256, nguồn đã đọc, kết quả test. Commit cục bộ: `cd $W && git branch --show-current && git add licenses/models/3D-Speaker-LICENSE.txt scripts/models/speaker-manifest.mjs scripts/models/speaker-manifest.test.mjs scripts/release/notices.mjs scripts/release/notices.test.mjs .github/workflows/ci.yml bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "build(speaker): giấy phép model nhận giọng trong THIRD_PARTY_NOTICES, script dựng manifest có hay không có mục speaker"`.

---

### Task 5: `release.yml` chạy test nhận giọng, báo cáo lỗi và Lịch sử ở bản release

Việc dựng, ký và đóng gói `speaker-worker` **đã có sẵn** trong các script mà `release.yml` gọi (`scripts/release/build-sidecars-macos.sh`, `build-sidecars-windows.mjs`, `package-macos.sh`, `package-windows.mjs`, bảng SHA-256 của `scripts/release/release-check.mjs table`; commit `7c6af9b9`; `scripts/release/notices.mjs` đã đưa các crate của `speaker-worker` vào `THIRD_PARTY_NOTICES`), nên kế hoạch này không đổi phần đó; model nhận giọng đi theo manifest (Task 4, 22), không đi theo `release.yml`. Còn thiếu một việc: `ci.yml` đã chạy `pro:: license:: diagnostics:: speaker:: db::` ở bản release (dòng 70) nhưng hai job `app` của `release.yml` (macOS dòng 188, Windows dòng 392) chỉ chạy `pro:: license::`. Từ khi `speaker::enabled()` có thể `true` ở bản release, test `release_builds_follow_the_platform_table_not_the_environment` và các test `speaker::`, `db::` (cột `speaker` của Lịch sử) phải chạy đúng trên bản sẽ phát hành.

**Files:** Modify `.github/workflows/release.yml`, `scripts/release/workflow.test.mjs`

- [ ] **Step 1: Test trước**

Thêm vào cuối `scripts/release/workflow.test.mjs`:

```js
test("hai job build app (macOS, Windows) chạy test bản release cho bản quyền, báo cáo lỗi, nhận giọng và Lịch sử", () => {
  const yml = workflows[0][1];
  const want = "cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: db:: --test-threads=1";
  const lines = yml.split("\n").filter((l) => l.includes("cargo test --release --locked -p meeting-translator"));
  assert.equal(lines.length, 2, "phải có đúng hai lần chạy (macOS, Windows)");
  for (const line of lines) assert.equal(line.trim(), want);
});
```
Run: `cd $W && node --test scripts/release/workflow.test.mjs 2>&1 | /usr/bin/grep -E "^not ok|^ℹ (pass|fail)"`
Expected: test mới **đỏ** (hai dòng hiện chỉ có `pro:: license::`).

- [ ] **Step 2: Sửa `release.yml`**

Hai dòng giống nhau (macOS ở job `macos-app`, Windows ở job `windows-app`); sửa cả hai (`Edit` với `replace_all: true`, hay hai lần Edit có ngữ cảnh khác nhau):

```old
          cargo test --release --locked -p meeting-translator --lib -- pro:: license:: --test-threads=1
```
```new
          cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: db:: --test-threads=1
```
Đổi luôn tên hai bước cho đúng việc (chữ cũ `Test bản quyền ở bản release (không có phần chỉ dành cho bản debug)` xuất hiện hai lần):
```old
      - name: Test bản quyền ở bản release (không có phần chỉ dành cho bản debug)
```
```new
      - name: Test bản quyền, báo cáo lỗi, nhận giọng và Lịch sử ở bản release (không có phần chỉ dành cho bản debug)
```

- [ ] **Step 3: Kiểm**

Run: `cd $W && node --test "scripts/release/*.test.mjs" 2>&1 | /usr/bin/grep -E "^not ok|^ℹ (pass|fail)" && /usr/bin/grep -c "diagnostics:: speaker:: db::" .github/workflows/release.yml .github/workflows/ci.yml`
Expected: `ℹ fail 0`; `release.yml:2` và `ci.yml:1`. Windows: các test `speaker::` có phần chỉ macOS dùng `cfg(target_os = "macos")` nên không chạy trên Windows; nếu một test không gắn `cfg` mà cần macOS thì Task 6 (macOS) không bắt được, và sẽ đỏ ở Windows CI: tìm bằng `cd $W && /usr/bin/grep -rn "eui_macos\|AXUIElement\|tccutil" src-tauri/src/speaker/*.rs | /usr/bin/grep -v "cfg(target_os" | head` và rà các test trong `speaker/` dùng tên đó (kỳ vọng: không có). `scripts/check-windows.sh --locked` (Task 1) đã biên dịch chéo các test này (`--all-targets`).

- [ ] **Step 4: Mốc kiểm và commit**

Run: `cd $W && git diff --stat .github scripts/release | tail -3`
Expected: hai file đổi. Commit cục bộ: `cd $W && git branch --show-current && git add .github/workflows/release.yml scripts/release/workflow.test.mjs && git commit -m "ci(release): bản release chạy thêm test báo cáo lỗi, nhận giọng và Lịch sử"`.

---

### Task 6: Dựng và kiểm bản release cục bộ trên Mac

Mục tiêu: mọi cổng của CI chạy được ở máy này trước khi chủ dự án tốn 50 phút Release: test bản release có `speaker::`, binary app không có chuỗi công tắc dev, `speaker-worker` không có mã mạng và đúng kích thước, cấu hình đóng gói hợp lệ.

**Files:** không sửa (kết quả ghi vào `$B/results/07-nghiem-thu.md`, mục "Bản release cục bộ (Task 6)")

- [ ] **Step 1: Test bản release (đã chạy nền ở Task 0 Step 5 trước khi sửa; chạy lại sau)**

Run (nền): `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 pnpm build >/dev/null 2>&1; CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: db:: --test-threads=1 2>&1 | tail -15`
Expected: `test result: ok.` với số test lớn hơn lượt Task 0 Step 5 đúng **hai** (`speaker::tests::the_release_ships_on_the_audited_platforms_only` và `speaker::tests::release_builds_follow_the_platform_table_not_the_environment`; test `speaker_offered` nằm ở `models::service`, ngoài bộ lọc này; test `debug_builds_stay_opt_in` chỉ có ở bản debug). Kiểm test chỉ-release có chạy: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --release --locked -p meeting-translator --lib -- speaker::tests::release_builds --list 2>/dev/null | /usr/bin/grep -c release_builds` ra `1`.

- [ ] **Step 2: Binary app bản release không có công tắc dev, đúng tên miền**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release --locked -p meeting-translator 2>&1 | tail -2 && node scripts/release/release-check.mjs no-dev-gate target/release/meeting-translator && echo "== chuỗi cấm trong binary:" && for s in AI_TRANSLATOR_DEV_SPEAKER AI_TRANSLATOR_DEV_PRO AI_TRANSLATOR_DEV_REPORTS aitranslator.io.vn; do printf "%s: " $s; strings -a target/release/meeting-translator | /usr/bin/grep -c "$s"; done`
Expected: `release-check.mjs` thoát 0 (in dòng đạt cổng); bốn số đếm đều `0`. Số khác 0 thì **dừng**: có chuỗi công tắc dev hay tên miền cũ lọt vào bản release.

- [ ] **Step 3: `speaker-worker` bản release: kích thước, không mạng, `minos`**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p speaker-worker 2>&1 | tail -1 && ls -l target/release/speaker-worker | awk '{print $5, "byte"}' && scripts/release/check-no-network.sh --binary target/release/speaker-worker && otool -l target/release/speaker-worker | /usr/bin/grep -A4 LC_BUILD_VERSION | /usr/bin/grep -E "minos|sdk" && otool -L target/release/speaker-worker | tail -n +2 | awk '{print $1}'`
Expected: khoảng **2 867 152 byte** (spec §4.1; lệch ±5% thì ghi và xem lại); `check-no-network.sh --binary` sạch (không nhập hàm socket); `minos 14.2`; thư viện liên kết chỉ `libSystem` và `libiconv` (không thư viện lạ).

- [ ] **Step 4: Dòng "ngủ" và "thức" trong log (đọc mã, không chạy app thật)**

Không chạy app (không đụng app thật của chủ dự án). Kiểm bằng đọc mã và test: `cd $W && /usr/bin/grep -n "speaker_offered" src-tauri/src/speaker/recipes.rs src-tauri/src/models/service.rs | cut -c1-140` phải có đúng hai chỗ dùng (hàm và vòng tải công thức) và `/usr/bin/grep -n "speakerModel !== \"unavailable\"" src/windows/main/settings/SubtitleSettings.tsx` đúng một dòng. Việc "thức/ngủ" chạy thật được kiểm ở Task 22 (sau khi đăng manifest) và ở Task 21 (bản ngủ: `lsof`/proxy không thấy `speaker/recipes.json`).

- [ ] **Step 5: Cấu hình đóng gói, script phát hành**

Run: `cd $W && scripts/release/check-release-config.sh 2>&1 | tail -5 && node --test "scripts/release/*.test.mjs" 2>&1 | /usr/bin/grep -E "^ℹ (pass|fail)"`
Expected: `check-release-config.sh` thoát 0; `ℹ fail 0`. Kích thước `.dmg` và bộ cài Windows (≤ 60 MB) do `package-macos.sh` và `package-windows.mjs` kiểm trong CI; ước tính ở đây: 0.3.1 là 9 980 110 byte (.dmg) và 21 101 359 byte (.exe), cộng `speaker-worker` nén (~1,0 MB và 1,5 MB, `$B/results/02-tong-hop.md`, `05-windows.md`) ≈ 11 MB và ≈ 22,6 MB: **dưới 60 MB gần 5 lần**. Ghi ước tính, số thật ở Task 21 Step 7.

- [ ] **Step 6: Mốc kiểm**

Ghi vào biên bản "Bản release cục bộ (Task 6)": số test release (Step 1), bốn số đếm chuỗi (Step 2), byte và `minos` của worker (Step 3), kết quả `check-release-config.sh`. Không có thay đổi nào cần commit ngoài biên bản: `cd $W && git branch --show-current && git add bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "docs(speaker): biên bản nghiệm thu 07, bản release cục bộ"`.

---

### Task 7: Nghiệm thu A-spk1, A-spk2, A-spk7 trên bản ứng viên

Ứng viên = HEAD hiện tại của nhánh (sau Task 1–5). Dùng đúng đường của app: `latency-bench speaker-eval --worker` (cắt đoạn bằng `SileroVad` + `Segmenter` của app, chạy `speaker-worker` thật, PCM 16 bit của giao thức, A2 4 s, θ = 0,35, không gộp). Mốc chống thụt lùi: kế hoạch 02 (`$B/results/02-nhan-giong-worker.md`).

**Files:** không sửa (kết quả vào `$B/results/07-nghiem-thu.md`, mục "A-spk1, A-spk2, A-spk7 (Task 7)")

- [ ] **Step 1: Dựng**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release --locked -p latency-bench -p speaker-worker 2>&1 | tail -1 && git rev-parse --short HEAD`
Expected: `Finished`; in HEAD (ghi vào biên bản).

- [ ] **Step 2: A-spk1 (AMI, 4 bản ghi kiểm)**

Run:
```bash
cd $W && mkdir -p $DATA/out/07/ami && VAD=$M/models/silero_vad_v6.2.3.onnx MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx && \
for n in IS1009a.Mix-Headset EN2002a.Mix-Headset IS1009a.Array1-01 ES2004a.Array1-01; do
  target/release/latency-bench speaker-eval --wav $DATA/ami/$n.wav --vad-model $VAD --speaker-model $MODEL \
    --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 --out $DATA/out/07/ami/$n.jsonl \
    | tee $DATA/out/07/ami/$n.summary.txt
  $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/07/ami/$n.jsonl $DATA/out/$n.rttm > $DATA/out/07/ami/$n.score.json
done; $DATA/venv/bin/python -I -c "import json,glob; s=[json.load(open(f)) for f in sorted(glob.glob('$DATA/out/07/ami/*.score.json'))]; print(len(s), 'bản; dòng>=1s', round(100*sum(x['line_1s'] for x in s)/len(s),1), 'mọi dòng', round(100*sum(x['line_all'] for x in s)/len(s),1), 'giọng', [x['voices'] for x in s], 'từng bản mọi dòng', [round(100*x['line_all'],1) for x in s])"
```
Expected: `4 bản`; **dòng ≥ 1 s trung bình ≥ 85% và mọi dòng ≥ 80%** (mức đạt spec §12, tính theo trung bình các bản ghi kiểm như chủ dự án chốt 2026-10-26); mốc kế hoạch 02 là **91,6% và 84,8%**: kết quả thấp hơn mốc quá **1 điểm** thì coi là **thụt lùi**, dừng và tìm nguyên nhân (nâng thư viện ở Task 1 là nghi phạm đầu tiên). Số giọng mỗi bản `4–8` (thật có 4). Hai lần chạy giống nhau từng đoạn (tất định): chạy lại một bản và `cmp` hai file `.jsonl`.

- [ ] **Step 3: A-spk2 (tiếng Việt, 8 bản ghi kiểm)**

Run:
```bash
cd $W && mkdir -p $DATA/out/07/vi && VAD=$M/models/silero_vad_v6.2.3.onnx MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx && \
for n in cv-vi-03 cv-vi-04 cv-vi-05 cv-vi-06 cv-vi-03-opus cv-vi-04-opus cv-vi-05-opus cv-vi-06-opus; do
  target/release/latency-bench speaker-eval --wav $DATA/out/vi/$n.wav --vad-model $VAD --speaker-model $MODEL \
    --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 --out $DATA/out/07/vi/$n.jsonl \
    | tee $DATA/out/07/vi/$n.summary.txt
  $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/07/vi/$n.jsonl $DATA/out/vi/$n.rttm > $DATA/out/07/vi/$n.score.json
done && $DATA/venv/bin/python -I -c "import json,glob; s=[json.load(open(f)) for f in sorted(glob.glob('$DATA/out/07/vi/*.score.json'))]; print(len(s), 'bản; dòng>=1s', round(100*sum(x['line_1s'] for x in s)/len(s),1), [round(100*x['line_1s'],1) for x in s])"
```
Expected: `8 bản`; **trung bình dòng ≥ 1 s ≥ 85%** (mốc 02: **93,9%**; thụt lùi nếu thấp hơn quá 1 điểm). Theo từng hội thoại, 7/8 bản ≥ 85% và thấp nhất ≈ 67,7% (`cv-vi-05-opus`) là **rủi ro đã biết** (hai người giống giọng bị gộp, spec §14), không phải thụt lùi; số thấp hơn nữa hay thêm bản rơi dưới 85% thì báo.

- [ ] **Step 4: A-spk7 phần kiểm được tự động**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo deny check 2>&1 | tail -2; cargo audit 2>&1 | /usr/bin/grep -E "Vulnerabilities|error|warning: [0-9]+ allowed" | head -3; scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe 2>&1 | tail -2; cargo test --locked -p meeting-translator --lib -- acl_tests speaker::health diagnostics:: 2>&1 | /usr/bin/grep -E "^test result|FAILED"; cargo test --locked -p speaker-ops 2>&1 | /usr/bin/grep -E "^test result|FAILED"; cd $W/server && pnpm exec vitest run test/speaker-health.test.ts 2>&1 | /usr/bin/grep -E "Tests |Test Files"`
Expected: `cargo deny` bốn `ok`; `cargo audit` không lỗ hổng (chỉ các cảnh báo cũ đã cho phép); không mã mạng sạch; test ACL (`acl_tests`: capability của `overlay` chỉ thêm `open_speaker_settings`), test sổ và báo cáo tình trạng (`speaker::health`, gồm "báo cáo không có tên") và báo cáo lỗi (`diagnostics::`) đạt; `speaker-ops` đạt; test server báo cáo tình trạng đạt (server từ chối khóa lạ và mọi chuỗi nhạy cảm). Tên file test server theo `06b` Task 10 (`server/test/speaker-health.test.ts`); nếu tên khác thì `ls server/test | /usr/bin/grep -i speaker`.

- [ ] **Step 5: Ghi biên bản và commit**

Ghi vào "A-spk1, A-spk2, A-spk7 (Task 7)": HEAD đã đo, bảng số từng bản ghi và trung bình, so mốc 02, kết quả Step 5. Commit cục bộ: `cd $W && git branch --show-current && git add bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "docs(speaker): nghiệm thu 07, A-spk1, A-spk2 và A-spk7 trên bản ứng viên"`.

---

### Task 8: Nghiệm thu A-spk4 (độ trễ) và đo lại nhãn muộn trên bản ứng viên

Ưu tiên số 1: bật tính năng không làm chậm dịch. Mức đạt (spec §11, §12): so với tắt, A2 p50 chậm thêm ≤ 20 ms, p90 ≤ 50 ms, chữ dịch đầu p50 ≤ 20 ms (khoảng tin cậy 95%, cặp xen kẽ cùng đoạn âm thanh). Máy phải **rảnh**: kế hoạch 04b Task 18 ghi tải máy 1,1–4,5; lượt đo chạy khi người dùng không dùng máy nặng, cắm điện, loa tắt tiếng (`session` cấp âm thanh ngoại tuyến, không phát ra loa).

**Files:** không sửa (kết quả vào `$B/results/07-nghiem-thu.md`, mục "A-spk4 và nhãn muộn (Task 8)")

- [ ] **Step 1: Dựng đủ ba binary (release, Metal)**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p latency-bench -p speaker-worker 2>&1 | tail -1 && cargo build --release --locked -p asr-worker --features metal,shared-encode 2>&1 | tail -1 && pmset -g batt | head -2 && uptime`
Expected: hai `Finished`; `AC Power`; tải máy (load averages) dưới ~3. Chỉ dùng `asr-worker` dựng với `--features metal,shared-encode` (bản CPU làm số lệch xa; `memory/bench-asr-worker-metal`).

- [ ] **Step 2: Chuẩn bị script chạy từ script của kế hoạch 02 (ngoài repo)**

Script của 02b (`a-spk4-run.sh`) và bộ phân tích (`a-spk4-analyze.py`) nằm ở `$DATA/out/02/a-spk4/`. Chép và đổi thư mục ra, thêm công thức của bộ đọc tên:
```bash
mkdir -p $DATA/out/07/a-spk4 && cp $DATA/out/02/a-spk4/a-spk4-run.sh $DATA/out/02/a-spk4/a-spk4-analyze.py $DATA/out/07/a-spk4/ \
 && sed -i '' "s|^A=\$DATA/out/02/a-spk4|A=\$DATA/out/07/a-spk4|" $DATA/out/07/a-spk4/a-spk4-run.sh \
 && sed -i '' 's|--speaker-model \$DATA/models/eres2net-sv-en-voxceleb-16k.onnx"|--speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --speaker-names-recipe $W/bench/2026-10-26-nguoi-noi/khong-app.recipes.json"|' $DATA/out/07/a-spk4/a-spk4-run.sh \
 && /usr/bin/grep -n '^A=\|^SPK=' $DATA/out/07/a-spk4/a-spk4-run.sh
```
Expected: hai dòng: `A=$DATA/out/07/a-spk4` và `SPK="--speaker-worker target/release/speaker-worker --speaker-model … --speaker-names-recipe …/khong-app.recipes.json"`. Đường dẫn tuyệt đối (`W`, `M`, `DATA`) ở đầu script `a-spk4-run.sh` là của máy này: sửa thành giá trị máy của bạn nếu khác (file nằm ngoài repo). Công thức "không app" cho bộ đọc chạy đủ đường (quét tiến trình, `Speech`, `ReaderState`) nhưng không đọc cây của app nào (đúng cách đo của `$B/results/04-do.md`).

- [ ] **Step 3: Chạy pha `s2` (12 lượt) và `s4` (4 lượt, hàng đợi dịch) ở nền**

Run (nền, `run_in_background`; mất khoảng 60–90 phút; **không chạy gì nặng khác** trên máy trong lúc đó): `cd $W && bash $DATA/out/07/a-spk4/a-spk4-run.sh s2 s4 2>&1 | tail -5`
Expected: mỗi lượt in `=== s2 <tên> xong rc=0`; cuối cùng `TẤT CẢ XONG`. Có `rc` khác 0 hay lượt bị tiến trình phụ của phiên khác chen (cột `sidecar_la_truoc` ở `tai-may.tsv` khác `-`) thì chạy lại đúng lượt đó bằng `bash a-spk4-run.sh one s2 <tên> $DATA/out/07/a-spk4/chay-lai` rồi phân tích với `--thay <tên>`. Tắt tiến trình nền khi xong.

- [ ] **Step 4: Phân tích và so mức đạt**

Run: `cd $W && python3 -I $DATA/out/07/a-spk4/a-spk4-analyze.py $DATA/out/07/a-spk4 2>&1 | tee $DATA/out/07/a-spk4/phan-tich.txt | /usr/bin/grep -E "^### |^\| (A2 p50|A2 p90|Chữ đầu p50)" | head -20`
Expected (mức đạt): ở mục `all`: **A2 p50 chênh ≤ +20 ms, A2 p90 ≤ +50 ms, chữ đầu p50 ≤ +20 ms**, đo theo **cận trên của KTC 95%** (như `04-do.md`: bật −18,3, −25,4, −22,0 ms, cận trên −7,6/−13,5/−12,2: nhanh hơn nhẹ, chưa rõ vì sao: nghi xung nhịp; chỉ kết luận "bật không làm chậm"). Cận trên **vượt mức đạt** thì **không bật tính năng**: dừng, báo chủ dự án với bảng 12 lượt (hướng xử lý theo spec §14: 1 luồng, bỏ đoạn < 1 s, hay tự tắt trên máy yếu, mỗi hướng là kế hoạch riêng). Cũng ghi: `feed_lag_max_ms` (< 100 ms), không tiến trình phụ nào khởi động lại, 0 câu `Skip`, 0 câu dịch lỗi, hàng đợi dịch dài nhất 1 câu.

- [ ] **Step 5: Nhãn muộn (spec §4.4: luật đúng cả khi nhãn đến muộn)**

Từ cùng file phân tích (bảng "Nhãn (đúng lúc / muộn)" và "Khứ hồi p50 / p90", "≤ 230 ms") ghi vào biên bản: tỉ lệ nhãn tới trước kết quả nhận dạng (mốc: 99,6% ở 02, 98–100% ở 04) và khứ hồi p50/p90 (mốc p50 81–165 ms, p90 202–231 ms), số đoạn ≤ 230 ms (mốc 97,6%). Thấp hơn mốc quá 3 điểm thì báo (nhãn muộn nhiều hơn làm câu mất nhãn nhiều hơn, không làm chậm dịch).

- [ ] **Step 6: Ghi biên bản và commit**

Ghi bảng 12 lượt, trung bình, chênh, KTC, mức đạt vào "A-spk4 và nhãn muộn (Task 8)", kèm điều kiện (máy, HEAD, tải, nguồn điện, lệnh chạy lại). **A-spk4 trên Windows i5 và với cuộc họp Teams đang mở không thuộc bước này**: Task 18 và Task 19. Commit cục bộ: `cd $W && git branch --show-current && git add bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "docs(speaker): nghiệm thu 07, A-spk4 và nhãn muộn trên bản ứng viên"`.

---

### Task 9: Soak hơn một giờ trên bản ứng viên (RAM không rò, tải dài hạn)

A-spk5 phần worker (spec §11): RAM ≤ 250 MB, không rò; CPU trong ngân sách theo số lệnh và năng lượng (không theo %CPU). 02b đã chạy 92 phút trên bản 02 (RSS đỉnh 141,8 MB, 10% cuối thấp hơn 10% đầu 20,5 MB). Lượt này chạy lại trên bản ứng viên, **có bật bộ đọc tên (công thức không app)**.

**Files:** không sửa (kết quả vào `$B/results/07-nghiem-thu.md`, mục "Soak (Task 9)")

- [ ] **Step 1: Chuẩn bị**

```bash
mkdir -p $DATA/out/07/soak && cp $DATA/out/02/soak/soak.wav $DATA/out/02/soak/soak.truth.json $DATA/out/02/soak/chay-soak.sh $DATA/out/02/soak/phan-tich-soak.py $DATA/out/07/soak/ \
 && sed -i '' 's|^S=\$D/out/02/soak|S=$D/out/07/soak|' $DATA/out/07/soak/chay-soak.sh \
 && sed -i '' 's|--speaker-worker target/release/speaker-worker --speaker-model \$D/models/eres2net-sv-en-voxceleb-16k.onnx \\|--speaker-worker target/release/speaker-worker --speaker-model $D/models/eres2net-sv-en-voxceleb-16k.onnx --speaker-names-recipe $W/bench/2026-10-26-nguoi-noi/khong-app.recipes.json \\|' $DATA/out/07/soak/chay-soak.sh \
 && /usr/bin/grep -n '^S=\|speaker-names-recipe' $DATA/out/07/soak/chay-soak.sh | cut -c1-150; ls -l $DATA/bin/rus && ls -l $DATA/out/07/soak/soak.wav | awk '{print $5}'
```
Expected: dòng `S=$D/out/07/soak` và một dòng có `--speaker-names-recipe`; `rus` có sẵn (nếu chưa: `cd $W && mkdir -p $DATA/bin && swiftc -O -o $DATA/bin/rus $B/tro-nang/rus.swift`); `soak.wav` dài 5537 s (≈ 177 MB). Đường dẫn tuyệt đối đầu `chay-soak.sh` là của máy này (file ngoài repo). Binary đã dựng ở Task 8 Step 1 (cùng HEAD).

- [ ] **Step 2: Chạy nền (≈ 93 phút), máy cắm điện, không dùng nặng**

Run (nền): `cd $W && zsh $DATA/out/07/soak/chay-soak.sh`
Expected: cuối cùng in `SOAK XONG rc=0`; `$DATA/out/07/soak/exit.txt` là `0`. Đổi tên `latency-bench` hay thấy `rc` khác 0 thì đọc `log.txt`. Tắt tiến trình nền khi xong (`TaskStop`), kiểm `pgrep -lx 'asr-worker|llama-server|speaker-worker|latency-bench'` rỗng (không đụng tiến trình không do mình mở).

- [ ] **Step 3: Phân tích**

Run: `cd $W && python3 -I $DATA/out/07/soak/phan-tich-soak.py $DATA/out/07/soak > $DATA/out/07/soak/phan-tich.txt && /usr/bin/grep -iE "đỉnh|10%|rò|nhãn|khứ hồi|lệnh|năng lượng|mJ|khởi động lại" $DATA/out/07/soak/phan-tich.txt | head -30`
Expected (mức đạt): `speaker-worker` **đỉnh RSS ≤ 250 MB** (mốc 02: 141,8 MB); **đỉnh 10% cuối không cao hơn đỉnh 10% đầu quá 25 MB** (không rò; mốc 02: thấp hơn 20,5 MB); worker không bị tắt, không tiến trình phụ nào khởi động lại, nhúng lỗi 0; nhãn tới muộn ≤ 1% (mốc 0,28%); CPU theo **số lệnh và năng lượng** ngang mốc 02 (≈ 1,45 tỉ lệnh và ≈ 445 mJ mỗi 1 s tiếng nói IS1009a; %CPU không dùng để kết luận, spec §6.8, §11). Vượt mức đạt: báo chủ dự án với số, **không bật tính năng**.

- [ ] **Step 4: Ghi biên bản và commit**

Ghi vào "Soak (Task 9)": thời lượng, HEAD, bảng RSS 10 phút, đỉnh đầu/cuối, nhãn, tải, so mốc 02. Commit cục bộ: `cd $W && git branch --show-current && git add bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "docs(speaker): nghiệm thu 07, soak trên bản ứng viên"`.
