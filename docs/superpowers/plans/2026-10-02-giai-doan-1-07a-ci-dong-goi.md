# Giai đoạn 1 · 07a: CI, build và đóng gói

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần đầu của kế hoạch 07 (mục 2.7 của kế hoạch 00), phần không phụ thuộc 03–06 và làm được ngay sau 01:
- CI trên GitHub Actions cho macOS arm64 và Windows x64: kiểm tra chuẩn của mục 6.2 (build, `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, `cargo test --workspace`, vitest, `pnpm -C server check`), `cargo deny check`, `cargo audit`, `pnpm audit`, cộng các phép kiểm mới của file này (giấy phép, cấu hình đóng gói, `third_party`).
- Tiến trình phụ của bản phát hành build trong CI từ mã nguồn đã khóa, có kiểm checksum (spec §10.2): `asr-worker` từ whisper.cpp 1.8.3 đã vá (kiểm lại `third_party/` từ crates.io), `llama-server` từ llama.cpp b11146 (macOS build tĩnh, Windows Vulkan cộng `GGML_BACKEND_DL` và `GGML_CPU_ALL_VARIANTS`). Bảng SHA-256 build sẵn vào app sinh từ đúng các file phát hành, với tên sau khi đóng gói (Đ15).
- Đóng gói `.dmg` (arm64, macOS tối thiểu 14.2, hardened runtime) và bộ cài NSIS `.exe` (x64), bundle id `com.aitranslator.desktop`, tên AI Translator; kiểm dung lượng ≤ 60 MB (§6.11) và ghi SHA-256 của bộ cài. Bộ gỡ Windows có ô "xóa dữ liệu app" và dọn mục khởi động ở `HKLM` (01 QĐ16, QĐ29).
- `THIRD_PARTY_NOTICES` sinh tự động từ `Cargo.lock`, `pnpm-lock.yaml` và mã nguồn C/C++ đã khóa, hiện ở màn hình Giới thiệu (§10.1); giấy phép phải nằm trong allow-list của `deny.toml`.
- Ký và notarize, ký bản cập nhật Tauri, ký manifest model: viết sẵn trong workflow, chỉ chạy khi CI có secret (Q17). Không tạo hay đưa khóa thật nào vào repo hay app.

Không làm ở đây (để 07b, viết sau 06): `tauri-plugin-updater` và hai kênh stable/beta, thử cập nhật từ bản trước, chuỗi phát hành cuối, ký thật. Danh sách việc của 07b ở cuối file.

**Kiến trúc:**
- Hai workflow chính: `ci.yml` (mỗi lần push lên `main` và mỗi pull request, không dùng secret nào) và `release.yml` (từ tag `v*` hoặc chạy tay, trong environment `release`). Thêm `sign-manifest.yml` (chạy tay) để ký manifest model production.
- Mọi logic nằm trong `scripts/release/` (Node 24 không gói npm nào, cộng vài script `sh` cho macOS), có test `node --test`. Workflow chỉ gọi các script này, nên mọi bước chạy được trên máy dev, trừ phần cần Windows.
- Thứ tự ký theo bảng SHA-256 của app (`build.rs` băm file trong `src-tauri/binaries/`): ký tiến trình phụ trước, rồi mới build app; Tauri không được ký lại chúng. macOS: `tauri build --no-sign`, rồi tự ký app (không `--deep`) và tự tạo `.dmg`. Windows: Tauri tự bỏ qua file đã có chữ ký, nên chỉ ký file chạy của app, bộ cài và bộ gỡ.
- Bước nào có secret thì không biên dịch code: build script của các crate chạy ở bước khác, khi môi trường không có secret và chưa có chứng thư nào trong keychain (rủi ro chuỗi cung ứng, §10.2).
- Cấu hình đóng gói nằm riêng ở `src-tauri/release/tauri.macos.json` và `tauri.windows.json`, truyền bằng `--config`: bản dev, `cargo test` và các kế hoạch khác không đổi gì.

**Công nghệ:** Giữ nguyên Rust 1.98.1, Tauri 2.12.1 (CLI 2.12.1), Node 24.21.0, pnpm 12.6.0. Không thêm crate hay gói npm nào: `Cargo.lock`, `pnpm-lock.yaml` và `server/pnpm-lock.yaml` giữ nguyên. Công cụ mới chỉ dùng trong CI và lúc phát hành (bảng "Phiên bản đã chốt").

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.7, 4.16, 4.22, 6.2). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (§6.11, §6.12, §10.1, §10.2, §11, §12, A6).

---

## Phiên bản đã chốt (kiểm ngày 2026-10-02, theo §6.12)

Kiểm bằng API công khai của GitHub (release mới nhất, ngày phát hành, SHA commit của tag), `cargo info`/API crates.io, và trang phiên bản của LunarG. Mọi bản đã ra ít nhất 1 ngày lúc kiểm. Action của GitHub khóa theo SHA commit (tag có chú thích thì lấy commit mà tag trỏ tới).

| Thành phần | Phiên bản | Dùng ở | Ghi chú |
|---|---|---|---|
| Runner macOS | `macos-26` (arm64, image 20260907) | CI, phát hành | Có Rust 1.98.1 qua rustup, CMake 4.4, Ninja, Xcode 26; không có protoc |
| Runner Windows | `windows-2025` (image 20260927) | CI, phát hành | VS 2022 Enterprise 17.14, LLVM 20, CMake, Ninja, Perl 5.42, 7-Zip 26.03; không có protoc, Vulkan SDK |
| actions/checkout | v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1` | mọi job | 2026-07-20; `persist-credentials: false` |
| actions/setup-node | v7.0.0 `820762786026740c76f36085b0efc47a31fe5020` | mọi job | 2026-07-14; đọc `.node-version` (24.21.0) |
| pnpm/action-setup | v6.1.0 `ea17c68df8912ef543352723c149a84f56e3d413` | mọi job | 2026-09-05; tag có chú thích `d9184bf…` trỏ tới commit này; đọc `packageManager` (pnpm 12.6.0) |
| taiki-e/install-action | v2.87.22 `83ac0ad63c0167e6f06796fab0fce28db1bf3db0` | CI, phát hành | 2026-09-29; tải bản build sẵn của cargo-deny, cargo-audit, cargo-about và kiểm checksum theo manifest của action |
| actions/upload-artifact | v7.0.1 `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | phát hành | 2026-04-10 |
| cargo-deny | 0.20.2 | CI | Bản đang dùng trên máy dev (2026-07-09) |
| cargo-audit | 0.22.2 | CI | Bản đang dùng trên máy dev (2026-06-05) |
| cargo-about | 0.9.2 | CI, phát hành, máy dev | 2026-08-18. Máy dev: tải bản build sẵn `cargo-about-0.9.2-aarch64-apple-darwin.tar.gz` (SHA-256 `ae72f0df…cc3e`) ở Task 5. Chạy `--frozen`, không dùng mạng |
| protoc | 36.2 | CI, phát hành | 2026-09-17; SHA-256 lấy từ trường `digest` của release, khóa trong `scripts/release/versions.env` |
| Vulkan SDK (LunarG) | 1.4.363.0 | phát hành Windows | Bản mới nhất ở `vulkan.lunarg.com/sdk/latest/windows.txt` lúc kiểm. SHA-256 chốt ở lần chạy đầu (QĐ8) |
| llama.cpp | b11146 = v0.5.0, commit `7fe450e19305b828c199d602c23a8337aaa1f03b` | phát hành | Như Giai đoạn 0 (spec §6.12); nay build từ mã nguồn thay cho bản build sẵn |
| whisper.cpp | 1.8.3 trong `whisper-rs-sys` 0.15.0 (đã vá, `third_party/`) | phát hành | Không đổi; Task 4 kiểm lại từ crates.io |
| actionlint | 1.7.12 | máy dev (kiểm workflow) | 2026-03-30; bản build sẵn, SHA-256 `aba9ced2…953f`; không chạy trong CI |
| shellcheck | 0.11.0 | máy dev (kiểm script sh) | 2025-08-04; bản build sẵn, SHA-256 `339b930f…d26f`; không chạy trong CI |

Ghi chú:
- Bản Ubuntu, `macos-latest`, `windows-latest` không dùng: nhãn `-latest` tự chuyển sang image mới (README của `actions/runner-images`), nên khóa nhãn có số.
- Action `ilammy/msvc-dev-cmd` (bản mới nhất v1.13.0 từ 2024-01) không dùng; `build-sidecars-windows.mjs` tự nạp môi trường của Visual Studio bằng `vswhere` và `vcvars64.bat`.
- Không có cache trong CI (QĐ17).

## Cách đọc kế hoạch này

- **Thứ tự và trạng thái đầu.** Làm trên `main`, sau 01 (đã xong phần code). Lúc lập kế hoạch, mọi task dựng trên `31ca0fb`. Kế hoạch này làm được trước hay sau 03, 04 (xem "File giao nhau với 03 và 04"). Trước mỗi task, `git status` phải sạch.
- **Khối code.**
  - "Tạo `<file>`": chép nguyên khối vào file mới.
  - "Thay toàn bộ `<file>` bằng": ghi đè cả file.
  - "Sửa `<file>` (áp bằng `git apply`)": khối `diff` là bản vá chuẩn, có dòng `index` đầy đủ; lưu khối vào một file tạm rồi chạy `git apply <file tạm>` từ gốc repo. Nếu 03 hay 04 đã thực thi trước và `git apply --check` báo lỗi, dùng `git apply --3way <file tạm>` (đã thử trên cây của 03, xem dưới). `--3way` cũng lỗi thì dừng, đừng sửa tay cho khớp.
  - "Run:" kèm khối `bash`: chạy cả khối từ gốc repo.
- **Khối Expected.** Mọi khối Expected là output thật, lấy từ một lần chạy lại toàn bộ các task trên một clone sạch ở `31ca0fb` (2026-10-03), bằng chính các khối của file này (`$S/p07/run.py`; vài lệnh chạy lại riêng sau khi sửa script chạy để gộp stdout với stderr đúng thứ tự). Thêm `$S/p07/check_md.py` đọc file này như implementer, áp mọi khối Tạo/Thay toàn bộ/Sửa lên một clone sạch: cây sau mỗi Task 1–10 khớp đúng commit tham chiếu. Đường dẫn đã đổi về gốc repo (`/Users/dtphong/Desktop/software_business/meeting-translator`, target ở `target/`). Thời gian chạy và dòng `Compiling` khác; số test, tên lỗi, SHA-256 của file nguồn phải giống. SHA-256 của file build ra (tiến trình phụ, bộ cài) chỉ giống khi cùng máy và cùng bộ dịch; trên máy khác thì khác, nhưng các phép kiểm vẫn phải in "khớp".
- **Mạng.** Task 3 clone llama.cpp từ GitHub; Task 5 tải hai file giấy phép và cargo-about từ GitHub; Task 7 tải protoc; Task 9, 10 tải actionlint, shellcheck. Mọi file tải về đều kiểm SHA-256 hoặc commit.
- **Đĩa.** Task 3 và Task 6 build bản release (`asr-worker`, llama.cpp, app với LTO): thêm khoảng 3 GB ở `target/`. Task 3 Step 4 kiểm `df -h /System/Volumes/Data`; dưới 4 GiB thì dừng.
- **Không bật hộp thoại quyền, không mở app.** Không task nào của agent mở `AI Translator.app` hay chạy tap thu âm. Ký ad-hoc (`codesign --sign -`) không cần keychain. Thử app đã đóng gói là Task 15 (người).
- **`src-tauri/binaries/`.** Task 3 xóa mọi file cũ trong thư mục này và đặt tiến trình phụ của bản phát hành vào. Muốn chạy lại bản dev sau đó thì chạy `scripts/copy-sidecars.sh`.
- **Task cần người hay Windows** ghi rõ ở tiêu đề: Task 13 (máy rảnh), Task 14–16 (người, GitHub, Mac, Windows).

## Bảng task và commit tham chiếu

Chuỗi commit dựng lúc lập kế hoạch nằm ở repo riêng `$S/p07-repo` (`S=/Users/dtphong/Desktop/software_business/meeting-translator-work`), nhánh `plan07a`, base `31ca0fb`. Sau mỗi task, so cây: `git diff --stat <commit tham chiếu> HEAD` phải rỗng (cần `git fetch $S/p07-repo plan07a` một lần).

| Task | Nội dung | Commit tham chiếu |
|---|---|---|
| 1 | Bảng SHA-256 dùng tên sau khi đóng gói | `e85377b` |
| 2 | Script kiểm bản phát hành | `74da09d` |
| 3 | Tiến trình phụ macOS từ mã nguồn đã khóa | `b317ea8` |
| 4 | Kiểm `third_party` từ crates.io | `451c441` |
| 5 | THIRD_PARTY_NOTICES và màn hình Giới thiệu | `813a2d7` |
| 6 | Đóng gói macOS | `687c1c7` |
| 7 | Cài protoc, Vulkan SDK; `versions.mjs` | `e40cdd5` |
| 8 | Đóng gói Windows | `8291523` |
| 9 | Workflow CI, Dependabot | `7b457a5` |
| 10 | Workflow phát hành, ký manifest | `04d132c` |
| 11 | Kiểm tra chuẩn (mục 6.2 của kế hoạch 00) | không có commit |
| 12 | Cập nhật kế hoạch 00 | commit tài liệu |
| 13 | So `llama-server` tự build với b11146: A3, S6 (cần máy rảnh) | commit kết quả đo |
| 14 | Đẩy lên GitHub, chạy CI và workflow phát hành lần đầu (cần người) | — |
| 15 | Thử bản `.dmg` trên Mac (cần người) | — |
| 16 | Thử bộ cài và bộ gỡ trên Windows (cần máy Windows và người) | — |

## Quyết định của kế hoạch này

Đánh số QĐ1–QĐ22, chỉ dùng trong file này.

- **QĐ1. Bảng SHA-256 dùng tên sau khi đóng gói.** Bundler của Tauri chép `externalBin` vào cạnh file chạy của app và bỏ hậu tố target triple; app bản phát hành tìm tiến trình phụ theo tên không có triple (`sidecar/paths.rs`). Trước kế hoạch này, `build.rs` ghi tên có triple, nên bản phát hành sẽ từ chối mọi tiến trình phụ. Nay `build.rs` gọi `sidecar::bundled_name` (một file dùng chung cho build script và app, nạp qua `#[path]`), và chỉ đổi tên khi `tauri_build::is_dev()` là `false` (`tauri build` bật `custom-protocol`). Bản dev giữ tên như cũ. `release-check.mjs embedded` kiểm file chạy của bản đóng gói có đủ SHA-256 và không còn tên kèm triple.
- **QĐ2. macOS: Tauri không ký gì.** `tauri-bundler` 2.12.1 (`bundle/macos/app.rs`) ký mọi `externalBin` bằng `codesign --force` khi có danh tính ký, làm SHA-256 của tiến trình phụ đổi sau khi `build.rs` đã băm. Vì vậy: ký tiến trình phụ trước (`build-sidecars-macos.sh`), `tauri build --no-sign`, rồi ký app không `--deep` (chữ ký của tiến trình phụ giữ nguyên, `codesign` kiểm chúng đã được ký), và tự tạo `.dmg` bằng `hdiutil` (nén LZMA, định dạng `ULMO`, như cách đo của S3 ở §6.11).
- **QĐ3. Windows: Tauri chỉ ký file chưa có chữ ký hợp lệ.** `bundle.rs` của bundler bỏ qua tiến trình phụ đã ký (`verify`), và `nsis/mod.rs` bỏ qua resource đã ký (`should_sign`). Nên tiến trình phụ và DLL ký trước khi build app (`build-sidecars-windows.mjs --sign-only`), còn Tauri qua `signCommand` ký file chạy của app, bộ cài và bộ gỡ. Build tách hai lệnh: `tauri build --no-bundle` (biên dịch, không secret) và `tauri bundle` (đóng gói, ký).
- **QĐ4. `llama-server` trên macOS build tĩnh** (dòng 211 của kế hoạch 00): một file 14,7 MB, chỉ nạp framework của hệ thống, không `.dylib` nào đi kèm, nên ít file phải ký và kiểm SHA-256. Metal nhúng sẵn shader, `GGML_NATIVE=OFF`, mức CPU `armv8.4-a+fp16` như `asr-worker`, BLAS của Accelerate như bản chính thức. Lúc lập kế hoạch, dịch 5 câu cố định trên GPU cho kết quả giống từng chữ bản chính thức b11146 với cả Q8_0 và Q4_K_M; đường CPU (`-ngl 0`) khác 1/5 câu, vì biến thể CPU khác (bản chính thức build native trên máy CI). Chấp nhận; A3 và S6 kiểm lại ở Task 13 trước khi phát hành.
- **QĐ5. Windows: C runtime tĩnh cho mọi tiến trình phụ** (C9, R12, 02a QĐ32). Cờ `/DEPENDENTLOADFLAG:0x800` chỉ cho DLL import thẳng nằm trong System32, nên `VCRUNTIME140.dll` đặt cạnh app sẽ không được tìm thấy; kèm bộ cài VC++ Redistributable thì vượt 60 MB. Nên: `asr-worker` build với `+crt-static` (qua `RUSTFLAGS`, nhắc lại cờ `/DEPENDENTLOADFLAG` vì `RUSTFLAGS` thay hẳn `rustflags` của `.cargo/config.toml`), whisper.cpp với `CMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded` (whisper-rs-sys chuyển mọi biến `CMAKE_*` cho CMake; `CMAKE_POLICY_DEFAULT_CMP0091=NEW` vì whisper.cpp khai CMake tối thiểu 3.5); llama.cpp với `CMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded` và tắt OpenMP (`vcomp140.dll` cũng là C runtime). App chính giữ mặc định của Tauri (`staticVCRuntime`: VC runtime tĩnh, UCRT của hệ thống). CI kiểm bằng `dumpbin`.
- **QĐ6. `llama-server` không có web UI, không HTTPS.** `LLAMA_USE_PREBUILT_UI` mặc định `ON` làm CMake tải giao diện từ Hugging Face lúc build; tắt cùng `LLAMA_BUILD_UI`, và `LLAMA_OPENSSL=OFF`. App không dùng hai phần này (`--no-ui`, chỉ nghe 127.0.0.1); bớt bề mặt tấn công và bớt tải mạng lúc build.
- **QĐ7. "Kiểm checksum" của mã nguồn C/C++** (§10.2): llama.cpp clone nông theo tag, rồi kiểm `git rev-parse HEAD` đúng commit khóa trong `versions.env` (git kiểm SHA-1 có chống va chạm) và cây không bị sửa; `LLAMA_BUILD_NUMBER=11146` vì clone nông làm số build tính sai. whisper.cpp: `verify-third-party.sh` dựng lại `third_party/` từ hai file `.crate` trên crates.io (SHA-256 trong `third_party/README.md`) cộng hai bản vá, rồi so từng file với bản đã commit. Công cụ tải về (protoc, Vulkan SDK) kiểm SHA-256 trong `versions.env`.
- **QĐ8. Vulkan SDK 1.4.363.0, SHA-256 chốt ở lần chạy đầu.** Lúc lập kế hoạch không tải bộ cài của LunarG (ngoài phạm vi được gọi mạng). `versions.env` để trống `VULKAN_SDK_SHA256`; `install-tools.mjs` khi đó in SHA-256 của file vừa tải rồi dừng. Task 14 so số đó với trang tải của LunarG rồi ghi vào `versions.env`.
- **QĐ9. Ngưỡng dung lượng 60 MB là 60 000 000 byte** của file bộ cài (`.dmg`, `-setup.exe`), chặt hơn 60 MiB.
- **QĐ10. THIRD_PARTY_NOTICES.** Rust: `cargo about generate --format json --frozen` cho app và cho `asr-worker` (hai binary có code Rust được phát hành), gộp theo văn bản giấy phép; JavaScript: `pnpm licenses list --prod --json` và file LICENSE của từng gói (gói của giao diện đã build); C/C++: whisper.cpp và ggml, llama.cpp và các thư viện nó nhúng (từ mã nguồn đã clone); model: Hy-MT2, trọng số Whisper, Silero VAD (`licenses/models/`, commit vào repo). File sinh ra không commit (`.gitignore`); bản phát hành sinh lúc build và đặt trong bộ cài (`Resources/` trên macOS, thư mục cài trên Windows). Giao diện đọc file qua `import.meta.glob`, thành một chunk riêng chỉ tải khi mở Giới thiệu; không thêm lệnh Tauri nào, để không đụng `commands.rs`, `build.rs` (danh sách lệnh), `capabilities/*.json`, `acl_tests.rs` mà 03 và 04 cùng sửa. Bản dev chưa sinh file thì màn hình ghi "Bản này không có danh sách giấy phép".
- **QĐ11. `about.toml` nhận đúng các giấy phép của `deny.toml`** (`accepted` = `[licenses] allow`, test giữ hai danh sách khớp). `onig_sys` nhúng mã nguồn C của Oniguruma (BSD-2-Clause) vào tiến trình chính mà giấy phép của crate chỉ ghi MIT, nên `about.toml` khai thêm `oniguruma/COPYING` (có checksum).
- **QĐ12. Bước có secret không biên dịch code.** macOS: chứng thư nằm trong một keychain tạm (`macos-keychain.sh`), nạp ngay trước bước ký và xóa ngay sau, không vào danh sách tìm kiếm của người dùng (`codesign --keychain`); khóa notarize `.p8` chỉ nằm trên đĩa trong bước ký. Windows: lệnh ký chỉ có trong hai bước ký. Khóa ký bản cập nhật chỉ có trong bước đóng gói cuối.
- **QĐ13. Lệnh ký Windows là biến cấu hình `MT_WINDOWS_SIGN_CMD`** (`{file}` thay bằng đường dẫn), vì dịch vụ ký cloud của chứng thư OV chưa chọn (T2). Secret của dịch vụ đó thêm vào hai bước ký khi chọn xong (07b).
- **QĐ14. Bộ gỡ Windows.** Mẫu NSIS của Tauri 2.12 đã có ô "xóa dữ liệu app" (xóa `%APPDATA%\com.aitranslator.desktop` và `%LOCALAPPDATA%\com.aitranslator.desktop`, gồm model) và luôn xóa giá trị `AI Translator` ở `HKCU\...\Run`. `nsis-hooks.nsh` thêm: xóa giá trị đó ở `HKLM\...\Run` và ở `Explorer\StartupApproved\Run` của cả `HKLM` lẫn `HKCU`, trừ khi bộ gỡ chạy để cập nhật. `HKLM` chỉ xóa được khi bộ gỡ có quyền admin; còn sót thì ghi một dòng chi tiết. Kho khóa (Credential Manager) giữ nguyên vì bộ đếm hạn mức không mất khi gỡ app (§6.8).
- **QĐ15. NSIS:** `installMode` `currentUser` (mặc định của Tauri; thư mục cài `%LOCALAPPDATA%\AI Translator`, khác thư mục dữ liệu theo bundle id, spec §6.7); hai ngôn ngữ English và Vietnamese, không hỏi chọn ngôn ngữ (theo ngôn ngữ của Windows); WebView2 qua bootstrapper tải về (`downloadBootstrapper`, im lặng).
- **QĐ16. Dependabot** cho cargo, npm (gốc và `server/`) và GitHub Actions, mỗi tuần, `cooldown` 1 ngày (luật tuổi phát hành, §6.12). PR của Dependabot chỉ là đề xuất; nâng phiên bản vẫn theo §6.12.
- **QĐ17. Không cache trong CI.** Đơn giản, và không có đường nào để cache bị nhiễm đi vào bản phát hành. CI chạy lâu hơn; xem lại sau Task 14.
- **QĐ18. Workflow phát hành chạy `cargo test --release -p meeting-translator --lib`** (nhận từ 03: phần chỉ có ở bản debug, như `DevGate`, không có trong bản release). Lúc lập kế hoạch: 162 test qua, 115 giây trên M4 Pro.
- **QĐ19. Runner `macos-26` và `windows-2025`;** Rust theo `rust-toolchain.toml` (`rustup toolchain install`); cargo-deny, cargo-audit, cargo-about qua `taiki-e/install-action`.
- **QĐ20. Chữ ký bản cập nhật gắn phiên bản** (`tauri signer sign --app-version`), để updater của 07b có thể bật `requireSignedVersion`.
- **QĐ21. Tiến trình phụ macOS ký với hardened runtime và identifier `com.aitranslator.desktop.<tên>`,** kể cả khi ký ad-hoc, để bản thử nội bộ chạy giống bản phát hành.
- **QĐ22. Không đổi `.cargo/config.toml`.** Cờ `/DEPENDENTLOADFLAG:0x800` có sẵn; `+crt-static` chỉ áp cho `asr-worker` lúc phát hành (QĐ5), vì app chính đã có VC runtime tĩnh của Tauri và hai cách trộn nhau chưa thử được trên Windows.

## Kiểm bằng mutation lúc lập kế hoạch

Script `$S/p07/mut.py`, chạy trên cây cuối của 07a: mỗi mutation sửa một chỗ, chạy test, rồi trả file về như cũ. M4 chạy bằng `package-macos.sh build` (build app thật). Mọi mutation đều bị bắt; N2 sống ở lần chạy đầu, đã thêm một assert vào test của Task 5 ("MIT WITH Unknown-exception").

```text
B1 bundled_name bỏ qua dev: bị giết [test result: FAILED. 20 passed; 1 failed; 0 ignored; 0 measured; 143 filtered out; finished in 0.34s]
B2 bundled_name không cần dấu nối: bị giết [test result: FAILED. 20 passed; 1 failed; 0 ignored; 0 measured; 143 filtered out; finished in 0.33s]
B3 bundled_name không tách .exe: bị giết [test result: FAILED. 19 passed; 2 failed; 0 ignored; 0 measured; 143 filtered out; finished in 0.34s]
B4 bundled_name nhận tên rỗng trước triple: bị giết [test result: FAILED. 20 passed; 1 failed; 0 ignored; 0 measured; 143 filtered out; finished in 0.36s]
M4 build.rs luôn coi là bản dev (giữ tên kèm triple): bị giết [package-macos.sh build: "LỖI: file chạy của app còn tên bản dev asr-worker-aarch64-apple-darwin"]
R1 checkBundle không so SHA-256: bị giết [ℹ fail 1]
R2 checkBundle bỏ qua thư viện lạ: bị giết [ℹ fail 1]
R3 macOS nhận @rpath: bị giết [ℹ fail 1]
R4 macOS không so minos: bị giết [ℹ fail 1]
R5 Windows bỏ vcomp: bị giết [ℹ fail 1]
R6 Windows bỏ luật DLL cạnh asr-worker: bị giết [ℹ fail 1]
R7 dumpbin bỏ phần delay load: bị giết [ℹ fail 2]
R8 ngưỡng dung lượng dùng <: bị giết [ℹ fail 2]
R9 embedded không kiểm tên bản dev: bị giết [ℹ fail 1]
R10 embedded không kiểm SHA-256: bị giết [ℹ fail 1]
N1 SPDX: OR thành AND: bị giết [ℹ fail 1]
N2 SPDX: bỏ WITH: bị giết [ℹ fail 1] (sau khi thêm assert; lần đầu SỐNG)
N3 npm không kiểm allow-list: bị giết [ℹ fail 1]
N4 npm không đòi file giấy phép: bị giết [ℹ fail 1]
N5 about.toml thiếu một giấy phép: bị giết [ℹ fail 1]
N6 gộp cargo-about trùng crate: bị giết [ℹ fail 1]
T1 SHA-256 rỗng vẫn qua: bị giết [ℹ fail 1]
T2 SHA-256 sai vẫn qua: bị giết [ℹ fail 1]
W1 asr-worker Windows không CRT tĩnh: bị giết [ℹ fail 1]
W2 asr-worker Windows mất DEPENDENTLOADFLAG: bị giết [ℹ fail 1]
W3 llama.cpp Windows bật OpenMP: bị giết [ℹ fail 1]
W4 llama.cpp Windows tải UI có sẵn: bị giết [ℹ fail 1]
W5 env trùng tên khác hoa thường: bị giết [ℹ fail 1]
W6 build mang cấu hình ký: bị giết [ℹ fail 1]
W7 lệnh ký không đặt đường dẫn trong nháy: bị giết [ℹ fail 1]
F1 notices rỗng vẫn hiện: bị giết [Tests  1 failed | 67 passed (68)]
F2 notices lỗi tải ném ra giao diện: bị giết [Tests  1 failed | 67 passed (68)]
```

## Secret và biến của CI

Mọi secret nằm trong environment `release` của repo (Settings › Environments), không ở mức repo, để chỉ hai workflow `release.yml` và `sign-manifest.yml` đọc được. `ci.yml` không dùng secret nào. Tên đã chốt ở kế hoạch này:

| Tên | Loại | Dùng ở | Nội dung |
|---|---|---|---|
| `APPLE_CERTIFICATE_P12` | secret | macOS: ký tiến trình phụ, ký app và `.dmg` | Chứng thư Developer ID Application xuất ra `.p12` (kèm khóa riêng), mã base64 |
| `APPLE_CERTIFICATE_PASSWORD` | secret | như trên | Mật khẩu của file `.p12` |
| `APPLE_API_KEY_P8` | secret | macOS: notarize | Nội dung file `AuthKey_<id>.p8` của App Store Connect API (vai trò Developer) |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | secret | như trên | Key ID và Issuer ID của khóa đó |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | cả hai: chữ ký bản cập nhật | Khóa ký bản cập nhật (Q17), tạo bằng `tauri signer generate` |
| `MANIFEST_SIGNING_KEY` | secret | `sign-manifest.yml` | JWK Ed25519 khóa ký manifest model production (Q17; định dạng của `scripts/models/gen-manifest-key.mjs`, kế hoạch 04) |
| `MT_WINDOWS_SIGN_CMD` | biến (Variables) | Windows: ký tiến trình phụ, app, bộ cài | Lệnh ký của dịch vụ ký cloud, có `{file}` (QĐ13) |

Thiếu secret nào thì bước tương ứng bỏ qua (hoặc ký ad-hoc trên macOS), và bản ra chỉ dùng thử nội bộ. Việc tạo khóa thật và nhập secret là của người, ở 07b (danh sách cuối file).

## File giao nhau với 03 và 04

| File | 07a sửa | 03, 04 sửa | Cách làm |
|---|---|---|---|
| `src/windows/main/screens/About.tsx` | thay câu "sẽ hiện ở đây" bằng `<Licenses />` | 03b thêm bảng debug ẩn | Task 5 sửa bằng một script node chạy được trên cả hai cây (đã thử trên cây của 03); không dùng `git apply` |
| `src/i18n/en.ts`, `vi.ts` | thay khóa `about.licensesPending` bằng ba khóa mới | 03, 04 thêm khóa | `git apply --3way` (đã thử với 03) |
| `.gitignore` | thêm `/THIRD_PARTY_NOTICES.txt` ở cuối | — | — |
| `src-tauri/build.rs` | hàm `sidecar_hashes` | 03, 04 thêm lệnh vào danh sách `commands` | `--3way` (đã thử với 03) |
| `src-tauri/src/sidecar/mod.rs`, `paths.rs` | thêm module, thêm một test | 04b sửa `paths.rs` | `--3way` |

Lúc lập kế hoạch, cả mười commit của 07a áp được lên nhánh `plan03` của `$S/p03-repo` (`f30491f`) bằng `git am --3way`; riêng `About.tsx` xung đột ở dòng import nên Task 5 dùng script. Chưa thử với 04 (kế hoạch 04 đang sửa). Ghi chú khi 03 đã vào `main`: `THIRD_PARTY_NOTICES` phải có thêm SQLCipher (BSD), OpenSSL (Apache-2.0, chỉ Windows) và câu mẫu FLEURS (CC BY 4.0) mà 03 thêm; việc này ở 07b (cần `clarify` cho `libsqlite3-sys`, `openssl-src` với checksum của file giấy phép thật).

---

## Task 1: Bảng SHA-256 dùng tên sau khi đóng gói

QĐ1. Bản phát hành tìm tiến trình phụ theo tên không kèm target triple (`sidecar/paths.rs`), nên bảng SHA-256 mà `build.rs` build sẵn vào app cũng phải dùng tên đó.

**Files:**
- Create: `src-tauri/src/sidecar/bundled_name.rs`
- Modify: `src-tauri/src/sidecar/mod.rs`, `src-tauri/src/sidecar/paths.rs` (một test), `src-tauri/build.rs`

- [ ] **Step 1: Viết test trước**

Tạo `src-tauri/src/sidecar/bundled_name.rs`:

```rust
//! Tên của một file trong `src-tauri/binaries/` sau khi đóng gói (spec §6.11; Đ15 của kế hoạch 00). File này dùng chung
//! cho `build.rs` (bảng SHA-256 build sẵn vào app, nạp qua `#[path]`) và cho app, nên không dùng gì ngoài `std`.
//!
//! Bundler của Tauri chép các tiến trình phụ khai ở `externalBin` vào cạnh file chạy của app và bỏ hậu tố target triple:
//! `asr-worker-aarch64-apple-darwin` thành `asr-worker`, `llama-server-x86_64-pc-windows-msvc.exe` thành
//! `llama-server.exe`. Thư viện đi kèm (`.dylib`, `.dll`) không có triple trong tên nên giữ nguyên. Bản dev đọc thẳng
//! `src-tauri/binaries/`, nên tên giữ nguyên.

#[cfg(test)]
mod tests {
    use super::*;

    const MAC: &str = "aarch64-apple-darwin";
    const WIN: &str = "x86_64-pc-windows-msvc";

    #[test]
    fn release_drops_the_target_triple() {
        assert_eq!(
            bundled_name("asr-worker-aarch64-apple-darwin", MAC, false),
            "asr-worker"
        );
        assert_eq!(
            bundled_name("llama-server-aarch64-apple-darwin", MAC, false),
            "llama-server"
        );
        assert_eq!(
            bundled_name("asr-worker-vulkan-x86_64-pc-windows-msvc.exe", WIN, false),
            "asr-worker-vulkan.exe"
        );
        assert_eq!(
            bundled_name("llama-server-x86_64-pc-windows-msvc.exe", WIN, false),
            "llama-server.exe"
        );
    }

    #[test]
    fn libraries_and_other_names_are_kept() {
        assert_eq!(bundled_name("libggml.0.dylib", MAC, false), "libggml.0.dylib");
        assert_eq!(bundled_name("ggml-vulkan.dll", WIN, false), "ggml-vulkan.dll");
        // Triple của nền tảng khác, hoặc chỉ có triple mà không có tên: không phải tên `externalBin`, giữ nguyên.
        assert_eq!(
            bundled_name("asr-worker-x86_64-pc-windows-msvc.exe", MAC, false),
            "asr-worker-x86_64-pc-windows-msvc.exe"
        );
        assert_eq!(
            bundled_name("-aarch64-apple-darwin", MAC, false),
            "-aarch64-apple-darwin"
        );
        assert_eq!(bundled_name("aarch64-apple-darwin", MAC, false), "aarch64-apple-darwin");
        // Có triple nhưng thiếu dấu nối: giữ nguyên.
        assert_eq!(
            bundled_name("asr-workeraarch64-apple-darwin", MAC, false),
            "asr-workeraarch64-apple-darwin"
        );
    }

    #[test]
    fn dev_keeps_every_name() {
        assert_eq!(
            bundled_name("asr-worker-aarch64-apple-darwin", MAC, true),
            "asr-worker-aarch64-apple-darwin"
        );
        assert_eq!(
            bundled_name("llama-server-x86_64-pc-windows-msvc.exe", WIN, true),
            "llama-server-x86_64-pc-windows-msvc.exe"
        );
    }
}
```

File chỉ có phần đầu `//!` và khối test; Step 3 thêm hàm vào giữa.

Sửa `src-tauri/src/sidecar/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/sidecar/mod.rs b/src-tauri/src/sidecar/mod.rs
index 3c03b1bfd4025927193abf3b36390fd36974e038..899b1d10abf62021e55230d39caa2435efdb0c58 100644
--- a/src-tauri/src/sidecar/mod.rs
+++ b/src-tauri/src/sidecar/mod.rs
@@ -1,6 +1,7 @@
 //! Phần của app quanh hai tiến trình phụ (Đ2 của kế hoạch 00): tìm file, kiểm SHA-256, nhớ binary đã chạy, dò GPU trên
 //! Windows, rồi dựng `SidecarSpec`. Việc chạy và giám sát nằm ở `pipeline::supervisor`.
 
+pub mod bundled_name;
 pub mod first_run;
 pub mod integrity;
 pub mod paths;
```

Run:
```bash
cargo test -p meeting-translator --lib sidecar::bundled_name 2>&1 | grep -E '^error' | sort | uniq -c
```

Expected (lúc lập kế hoạch: chưa có hàm `bundled_name`):
```text
   1 error: could not compile `meeting-translator` (lib test) due to 12 previous errors; 1 warning emitted
  12 error[E0425]: cannot find function `bundled_name` in this scope
```

- [ ] **Step 2: Viết code**

Thay toàn bộ `src-tauri/src/sidecar/bundled_name.rs`:

```rust
//! Tên của một file trong `src-tauri/binaries/` sau khi đóng gói (spec §6.11; Đ15 của kế hoạch 00). File này dùng chung
//! cho `build.rs` (bảng SHA-256 build sẵn vào app, nạp qua `#[path]`) và cho app, nên không dùng gì ngoài `std`.
//!
//! Bundler của Tauri chép các tiến trình phụ khai ở `externalBin` vào cạnh file chạy của app và bỏ hậu tố target triple:
//! `asr-worker-aarch64-apple-darwin` thành `asr-worker`, `llama-server-x86_64-pc-windows-msvc.exe` thành
//! `llama-server.exe`. Thư viện đi kèm (`.dylib`, `.dll`) không có triple trong tên nên giữ nguyên. Bản dev đọc thẳng
//! `src-tauri/binaries/`, nên tên giữ nguyên.

/// Tên của file `file` (trong `src-tauri/binaries/`) ở chỗ app tìm nó lúc chạy. Bản phát hành (`dev` là `false`): bỏ
/// hậu tố `-<target>` (trước `.exe` nếu có), như bundler của Tauri làm với `externalBin`; tên không có hậu tố đó thì giữ
/// nguyên. Bản dev giữ nguyên mọi tên.
pub fn bundled_name(file: &str, target: &str, dev: bool) -> String {
    if dev {
        return file.to_string();
    }
    let (stem, ext) = match file.strip_suffix(".exe") {
        Some(stem) => (stem, ".exe"),
        None => (file, ""),
    };
    match stem.strip_suffix(target).and_then(|s| s.strip_suffix('-')) {
        Some(base) if !base.is_empty() => format!("{base}{ext}"),
        _ => file.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAC: &str = "aarch64-apple-darwin";
    const WIN: &str = "x86_64-pc-windows-msvc";

    #[test]
    fn release_drops_the_target_triple() {
        assert_eq!(
            bundled_name("asr-worker-aarch64-apple-darwin", MAC, false),
            "asr-worker"
        );
        assert_eq!(
            bundled_name("llama-server-aarch64-apple-darwin", MAC, false),
            "llama-server"
        );
        assert_eq!(
            bundled_name("asr-worker-vulkan-x86_64-pc-windows-msvc.exe", WIN, false),
            "asr-worker-vulkan.exe"
        );
        assert_eq!(
            bundled_name("llama-server-x86_64-pc-windows-msvc.exe", WIN, false),
            "llama-server.exe"
        );
    }

    #[test]
    fn libraries_and_other_names_are_kept() {
        assert_eq!(bundled_name("libggml.0.dylib", MAC, false), "libggml.0.dylib");
        assert_eq!(bundled_name("ggml-vulkan.dll", WIN, false), "ggml-vulkan.dll");
        // Triple của nền tảng khác, hoặc chỉ có triple mà không có tên: không phải tên `externalBin`, giữ nguyên.
        assert_eq!(
            bundled_name("asr-worker-x86_64-pc-windows-msvc.exe", MAC, false),
            "asr-worker-x86_64-pc-windows-msvc.exe"
        );
        assert_eq!(
            bundled_name("-aarch64-apple-darwin", MAC, false),
            "-aarch64-apple-darwin"
        );
        assert_eq!(bundled_name("aarch64-apple-darwin", MAC, false), "aarch64-apple-darwin");
        // Có triple nhưng thiếu dấu nối: giữ nguyên.
        assert_eq!(
            bundled_name("asr-workeraarch64-apple-darwin", MAC, false),
            "asr-workeraarch64-apple-darwin"
        );
    }

    #[test]
    fn dev_keeps_every_name() {
        assert_eq!(
            bundled_name("asr-worker-aarch64-apple-darwin", MAC, true),
            "asr-worker-aarch64-apple-darwin"
        );
        assert_eq!(
            bundled_name("llama-server-x86_64-pc-windows-msvc.exe", WIN, true),
            "llama-server-x86_64-pc-windows-msvc.exe"
        );
    }
}
```

Sửa `src-tauri/src/sidecar/paths.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/sidecar/paths.rs b/src-tauri/src/sidecar/paths.rs
index 7eef8a1a0e991b5453447673f985edab6335981d..8664842377c0b4e04c1915f9f440e34e0990d4be 100644
--- a/src-tauri/src/sidecar/paths.rs
+++ b/src-tauri/src/sidecar/paths.rs
@@ -1,7 +1,8 @@
 //! Chỗ đặt tiến trình phụ (spec §6.11) và model (§6.7).
 //!
 //! - Tiến trình phụ: bản dev ở `src-tauri/binaries/`, tên kèm target triple (`scripts/copy-sidecars.sh` chép vào); bản
-//!   phát hành nằm cạnh file chạy của app, tên không kèm triple (Tauri `externalBin` bỏ triple khi đóng gói, kế hoạch 07).
+//!   phát hành nằm cạnh file chạy của app, tên không kèm triple (Tauri `externalBin` bỏ triple khi đóng gói; bảng SHA-256
+//!   dùng tên đó, xem `bundled_name`).
 //! - Model: bản dev đọc `MT_MODELS_DIR`, không đặt thì `<repo>/models`; bản phát hành ở `app_local_data_dir/models`
 //!   (kế hoạch 04 tải về đó).
 
@@ -122,6 +123,20 @@ mod tests {
         assert_eq!(win.llama, Path::new("/b/llama-server.exe"));
     }
 
+    /// Tên bản dev mà `build.rs` đổi thành tên bản phát hành (`bundled_name`) phải đúng là tên app tìm lúc chạy.
+    #[test]
+    fn bundled_names_match_the_release_file_names() {
+        for (target, windows) in [("aarch64-apple-darwin", false), ("x86_64-pc-windows-msvc", true)] {
+            for base in ["asr-worker", "asr-worker-vulkan", "asr-worker-cpu", "llama-server"] {
+                let dev = file_name(base, target, true, windows);
+                assert_eq!(
+                    crate::sidecar::bundled_name::bundled_name(&dev, target, false),
+                    file_name(base, target, false, windows)
+                );
+            }
+        }
+    }
+
     #[test]
     fn model_files_by_tier() {
         let std = model_files(Path::new("/m"), None);
```

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
index 4fb539bfbbf9f17646b29e22e5669ddb9972cef1..5b91ade18cd7c306200979c7884d837e4c0d6a2a 100644
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -2,6 +2,9 @@ use sha2::{Digest, Sha256};
 use std::fmt::Write as _;
 use std::path::Path;
 
+#[path = "src/sidecar/bundled_name.rs"]
+mod bundled_name;
+
 fn main() {
     sidecar_hashes();
     // App manifest: lệnh của app cũng đi qua ACL (spec §10.2). Cửa sổ nào không được cấp
@@ -31,15 +34,18 @@ fn main() {
 /// SHA-256 của mọi file trong `binaries/` (tiến trình phụ và thư viện đi kèm), ghi vào `sidecar_hashes.rs` để app kiểm
 /// trước khi chạy (spec §10.2, "Thay tiến trình phụ, hoặc chèn thư viện giả"; Đ15 của kế hoạch 00). Thư mục chưa có thì
 /// danh sách rỗng, và app từ chối chạy tiến trình phụ nào.
+///
+/// Bản phát hành (`tauri build`, Tauri không ở chế độ dev) ghi tên file sau khi đóng gói, tức tên không kèm target
+/// triple (`bundled_name`), vì app tìm tiến trình phụ theo tên đó cạnh file chạy của nó. Bundler chép nguyên byte, nên
+/// SHA-256 không đổi; file nào cần ký thì phải ký trước khi build (kế hoạch 07a, `scripts/release/`).
 fn sidecar_hashes() {
     let dir = Path::new("binaries");
     // Tạo thư mục rỗng nếu chưa có: `rerun-if-changed` với đường dẫn không tồn tại làm cargo build lại crate này mỗi lần.
     std::fs::create_dir_all(dir).expect("tạo được src-tauri/binaries/");
     println!("cargo:rerun-if-changed=binaries");
-    println!(
-        "cargo:rustc-env=SIDECAR_TARGET={}",
-        std::env::var("TARGET").expect("cargo đặt TARGET")
-    );
+    let target = std::env::var("TARGET").expect("cargo đặt TARGET");
+    println!("cargo:rustc-env=SIDECAR_TARGET={target}");
+    let dev = tauri_build::is_dev();
     let mut entries: Vec<(String, String)> = Vec::new();
     if let Ok(read) = std::fs::read_dir(dir) {
         for entry in read.flatten() {
@@ -54,7 +60,8 @@ fn sidecar_hashes() {
                 let _ = write!(s, "{b:02x}");
                 s
             });
-            entries.push((entry.file_name().to_string_lossy().into_owned(), hex));
+            let name = entry.file_name().to_string_lossy().into_owned();
+            entries.push((bundled_name::bundled_name(&name, &target, dev), hex));
         }
     }
     entries.sort();
```

- [ ] **Step 3: Chạy test**

Run: `cargo test -p meeting-translator --lib sidecar:: 2>&1 | grep -E '^test |^test result'`

Expected (lúc lập kế hoạch, trên `31ca0fb`; 03, 04 đã vào `main` thì số `filtered out` lớn hơn):
```text
test sidecar::bundled_name::tests::dev_keeps_every_name ... ok
test sidecar::bundled_name::tests::libraries_and_other_names_are_kept ... ok
test sidecar::bundled_name::tests::release_drops_the_target_triple ... ok
test sidecar::paths::tests::names_follow_the_external_bin_convention ... ok
test sidecar::paths::tests::bundled_names_match_the_release_file_names ... ok
test sidecar::paths::tests::windows_has_two_asr_workers_and_macos_one ... ok
test sidecar::paths::tests::model_files_by_tier ... ok
test sidecar::probe::tests::a_new_binary_gets_a_longer_probe ... ok
test sidecar::probe::tests::no_gpu_software_renderer_or_garbage_means_cpu ... ok
test sidecar::probe::tests::discrete_or_integrated_gpus_are_usable ... ok
test sidecar::tests::errors_map_to_ui_codes ... ok
test sidecar::probe::tests::probe_output_is_capped ... ok
test sidecar::integrity::tests::a_file_others_can_write_is_refused ... ok
test sidecar::integrity::tests::sha256_matches_shasum ... ok
test sidecar::integrity::tests::untouched_files_pass_and_return_the_executable_hashes ... ok
test sidecar::integrity::tests::unknown_or_missing_files_are_refused ... ok
test sidecar::first_run::tests::a_binary_is_new_until_it_has_run_once ... ok
test sidecar::integrity::tests::a_changed_library_or_executable_is_refused ... ok
test sidecar::integrity::tests::an_extra_library_in_the_folder_is_refused ... ok
test sidecar::tests::a_timed_out_probe_is_not_remembered ... ok
test sidecar::probe::tests::a_probe_that_fails_or_hangs_means_cpu ... ok
test result: ok. 21 passed; 0 failed; 0 ignored; 0 measured; 143 filtered out; finished in 0.34s
```

- [ ] **Step 4: fmt, clippy**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings; echo "fmt+clippy: $?"
```

Expected (lúc lập kế hoạch):
```text
fmt+clippy: 0
```

- [ ] **Step 5: Commit**

Run:
```bash
git add src-tauri/src/sidecar/bundled_name.rs src-tauri/src/sidecar/mod.rs src-tauri/src/sidecar/paths.rs src-tauri/build.rs
git commit -q -m "feat(app): bảng SHA-256 của tiến trình phụ dùng tên sau khi đóng gói ở bản phát hành (Đ15, §6.11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(app): bảng SHA-256 của tiến trình phụ dùng tên sau khi đóng gói ở bản phát hành (Đ15, §6.11)
```

## Task 2: Script kiểm bản phát hành

`scripts/release/release-check.mjs`: bảng SHA-256 của tiến trình phụ (Đ15), so bản đóng gói với `binaries/`, kiểm bảng nằm trong file chạy của app (QĐ1), thư viện mà file Mach-O hay PE nạp (`otool`, `dumpbin`; C9, C11), ngưỡng dung lượng (QĐ9), dòng SHA-256 của bộ cài (§10.2). Chạy được trên macOS và Windows chỉ với Node 24.

**Files:**
- Create: `scripts/release/release-check.test.mjs`, `scripts/release/release-check.mjs`

- [ ] **Step 1: Viết test trước**

Tạo `scripts/release/release-check.test.mjs`:

```js
// Test của release-check.mjs: `node --test scripts/release/`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  bundledName,
  checkBundle,
  checkSize,
  embeddedErrors,
  macosErrors,
  main,
  parseDumpbinDependents,
  parseOtoolLibraries,
  parseOtoolMinOs,
  sidecarTable,
  windowsErrors,
} from "./release-check.mjs";

const MAC = "aarch64-apple-darwin";
const WIN = "x86_64-pc-windows-msvc";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "release-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("tên sau khi đóng gói giống luật của bundled_name.rs", () => {
  assert.equal(bundledName("asr-worker-aarch64-apple-darwin", MAC), "asr-worker");
  assert.equal(bundledName("asr-worker-cpu-x86_64-pc-windows-msvc.exe", WIN), "asr-worker-cpu.exe");
  assert.equal(bundledName("libggml.0.dylib", MAC), "libggml.0.dylib");
  assert.equal(bundledName("ggml-vulkan.dll", WIN), "ggml-vulkan.dll");
  assert.equal(bundledName("-aarch64-apple-darwin", MAC), "-aarch64-apple-darwin");
  assert.equal(bundledName("asr-workeraarch64-apple-darwin", MAC), "asr-workeraarch64-apple-darwin");
  assert.equal(bundledName("asr-worker-x86_64-pc-windows-msvc.exe", MAC), "asr-worker-x86_64-pc-windows-msvc.exe");
});

test("bảng SHA-256 có tên gốc, tên sau khi đóng gói, số byte", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "asr-worker-aarch64-apple-darwin"), "worker");
  writeFileSync(join(dir, "libggml.0.dylib"), "lib");
  assert.deepEqual(sidecarTable(dir, MAC), [
    {
      file: "asr-worker-aarch64-apple-darwin",
      bundled: "asr-worker",
      bytes: 6,
      // `printf worker | shasum -a 256`, như test sha256_matches_shasum của integrity.rs
      sha256: "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e",
    },
    {
      file: "libggml.0.dylib",
      bundled: "libggml.0.dylib",
      bytes: 3,
      sha256: "76b5a357391276b282a516f54f48ef3c207f46d8192dc58c208d5183d38415f8",
    },
  ]);
});

test("bản đóng gói khớp binaries/ thì không lỗi", (t) => {
  const root = tempDir(t);
  const bin = join(root, "binaries");
  const app = join(root, "MacOS");
  mkdirSync(bin);
  mkdirSync(app);
  writeFileSync(join(bin, "asr-worker-aarch64-apple-darwin"), "worker");
  writeFileSync(join(bin, "llama-server-aarch64-apple-darwin"), "server");
  writeFileSync(join(app, "asr-worker"), "worker");
  writeFileSync(join(app, "llama-server"), "server");
  writeFileSync(join(app, "meeting-translator"), "app");
  assert.deepEqual(checkBundle(bin, app, MAC), []);
});

test("bản đóng gói thiếu file, file bị đổi (ví dụ ký lại), hay có thư viện lạ thì lỗi", (t) => {
  const root = tempDir(t);
  const bin = join(root, "binaries");
  const app = join(root, "MacOS");
  mkdirSync(bin);
  mkdirSync(app);
  writeFileSync(join(bin, "asr-worker-aarch64-apple-darwin"), "worker");
  writeFileSync(join(bin, "llama-server-aarch64-apple-darwin"), "server");
  writeFileSync(join(app, "asr-worker"), "worker signed again");
  writeFileSync(join(app, "libggml-cpu.dylib"), "lib");
  assert.deepEqual(checkBundle(bin, app, MAC), [
    "asr-worker khác bản trong binaries/ (asr-worker-aarch64-apple-darwin), bảng SHA-256 build sẵn sẽ không khớp",
    "thiếu llama-server trong bản đóng gói",
    "thư viện lạ trong bản đóng gói: libggml-cpu.dylib",
  ]);
});

test("binaries/ rỗng là lỗi", (t) => {
  const root = tempDir(t);
  assert.deepEqual(checkBundle(root, root, MAC), [`${root} không có file nào`]);
});

test("file chạy của app phải mang SHA-256 của mọi file, với tên sau khi đóng gói", () => {
  const table = [
    { file: "asr-worker-aarch64-apple-darwin", bundled: "asr-worker", bytes: 6, sha256: "a".repeat(64) },
    { file: "libggml.0.dylib", bundled: "libggml.0.dylib", bytes: 3, sha256: "b".repeat(64) },
  ];
  const release = Buffer.from(`xx asr-worker${"a".repeat(64)}libggml.0.dylib${"b".repeat(64)} yy`);
  assert.deepEqual(embeddedErrors(release, table), []);
  const dev = Buffer.from(`asr-worker-aarch64-apple-darwin${"a".repeat(64)}`);
  assert.deepEqual(embeddedErrors(dev, table), [
    "file chạy của app còn tên bản dev asr-worker-aarch64-apple-darwin: bảng SHA-256 không dùng tên sau khi đóng gói",
    "file chạy của app không có SHA-256 của libggml.0.dylib",
  ]);
});

const OTOOL_L = `build/bin/llama-server:
\t/System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate (compatibility version 1.0.0, current version 4.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1359.0.0)
\t@rpath/libggml.0.dylib (compatibility version 0.0.0, current version 0.10.0)
`;

const OTOOL_LOAD = `Load command 9
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform 1
    minos 14.2
      sdk 26.4
   ntools 1
`;

test("đọc otool -L và otool -l", () => {
  assert.deepEqual(parseOtoolLibraries(OTOOL_L), [
    "/System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate",
    "/usr/lib/libSystem.B.dylib",
    "@rpath/libggml.0.dylib",
  ]);
  assert.equal(parseOtoolMinOs(OTOOL_LOAD), "14.2");
  assert.equal(parseOtoolMinOs("cmd LC_SEGMENT_64"), null);
});

test("macOS: thư viện ngoài hệ thống và minos cao hơn đều là lỗi", () => {
  assert.deepEqual(macosErrors("llama-server", parseOtoolLibraries(OTOOL_L), "14.2", "14.2"), [
    "llama-server nạp thư viện ngoài hệ thống: @rpath/libggml.0.dylib",
  ]);
  assert.deepEqual(macosErrors("asr-worker", ["/usr/lib/libc++.1.dylib"], "15.0", "14.2"), [
    "asr-worker cần macOS 15.0, cao hơn 14.2",
  ]);
  assert.deepEqual(macosErrors("asr-worker", ["/usr/lib/libc++.1.dylib"], "13.3", "14.2"), []);
  assert.deepEqual(macosErrors("asr-worker", [], null, "14.2"), ["asr-worker không có LC_BUILD_VERSION"]);
});

const DUMPBIN = `
Dump of file asr-worker-vulkan.exe

File Type: EXECUTABLE IMAGE

  Image has the following dependencies:

    vulkan-1.dll
    KERNEL32.dll
    VCRUNTIME140.dll
    api-ms-win-crt-runtime-l1-1-0.dll

  Image has the following delay load dependencies:

    ggml-base.dll

  Summary

        1000 .data
`;

test("đọc dumpbin /dependents, kể cả phần delay load", () => {
  assert.deepEqual(parseDumpbinDependents(DUMPBIN), [
    "vulkan-1.dll",
    "KERNEL32.dll",
    "VCRUNTIME140.dll",
    "api-ms-win-crt-runtime-l1-1-0.dll",
    "ggml-base.dll",
  ]);
  assert.deepEqual(parseDumpbinDependents("File Type: EXECUTABLE IMAGE"), []);
});

test("Windows: C runtime của Visual C++ luôn là lỗi; DLL cạnh file là lỗi khi --no-local-libs", () => {
  const dlls = parseDumpbinDependents(DUMPBIN);
  assert.deepEqual(windowsErrors("asr-worker-vulkan.exe", dlls, ["ggml-base.dll", "llama.dll"], true), [
    "asr-worker-vulkan.exe cần C runtime của Visual C++: VCRUNTIME140.dll",
    "asr-worker-vulkan.exe nạp DLL nằm cạnh nó: ggml-base.dll",
  ]);
  assert.deepEqual(windowsErrors("llama-server.exe", ["ggml.dll", "KERNEL32.dll", "MSVCP140.dll"], ["ggml.dll"], false), [
    "llama-server.exe cần C runtime của Visual C++: MSVCP140.dll",
  ]);
  assert.deepEqual(windowsErrors("llama-server.exe", ["ggml.dll", "vcomp140.dll"], [], false), [
    "llama-server.exe cần C runtime của Visual C++: vcomp140.dll",
  ]);
  assert.deepEqual(windowsErrors("x.exe", ["KERNEL32.dll", "api-ms-win-crt-heap-l1-1-0.dll"], [], true), []);
});

test("ngưỡng dung lượng tính bằng byte, bằng ngưỡng vẫn đạt", () => {
  assert.deepEqual(checkSize(60_000_000, 60_000_000), []);
  assert.deepEqual(checkSize(60_000_001, 60_000_000), ["60000001 byte, vượt ngưỡng 60000000 byte"]);
});

test("CLI: size và sha256sums", (t) => {
  const dir = tempDir(t);
  const file = join(dir, "AI Translator_0.1.0_aarch64.dmg");
  writeFileSync(file, "worker");
  assert.deepEqual(main(["size", file, "--max-bytes", "6"]), []);
  assert.deepEqual(main(["size", file, "--max-bytes", "5"]), ["6 byte, vượt ngưỡng 5 byte"]);
  const out = join(dir, "SHA256SUMS");
  assert.deepEqual(main(["sha256sums", file, "--out", out]), []);
  assert.equal(
    readFileSync(out, "utf8"),
    "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e  AI Translator_0.1.0_aarch64.dmg\n",
  );
  assert.throws(() => main(["size", file]), /thiếu --max-bytes/);
  assert.throws(() => main(["nope"]), /lệnh không rõ: nope/);
});
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^ℹ (tests|pass|fail)'
```

Expected (lúc lập kế hoạch: chưa có module):
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/release-check.mjs' imported from /Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/release-check.test.mjs
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

- [ ] **Step 2: Viết code**

Tạo `scripts/release/release-check.mjs`:

```js
#!/usr/bin/env node
// Kiểm bản phát hành (kế hoạch 07a). Chạy được trên macOS và Windows, chỉ cần Node 24, không gói npm nào.
//
//   node scripts/release/release-check.mjs table <thư mục binaries> --target <triple> [--out <file.json>]
//       Bảng SHA-256 của mọi file trong thư mục tiến trình phụ, kèm tên sau khi đóng gói (Đ15 của kế hoạch 00).
//   node scripts/release/release-check.mjs bundle <thư mục binaries> <thư mục chứa file chạy trong bản đóng gói> --target <triple>
//       Mỗi file trong binaries/ có mặt trong bản đóng gói, đúng tên sau khi đóng gói, đúng SHA-256 (app so với bảng build
//       sẵn); bản đóng gói không có thư viện nào khác (spec §10.2).
//   node scripts/release/release-check.mjs embedded <thư mục binaries> <file chạy của app> --target <triple>
//       File chạy của app mang đúng bảng SHA-256 build sẵn: có SHA-256 của mọi file trong binaries/, và không còn tên bản
//       dev kèm triple (build.rs ghi tên sau khi đóng gói ở bản phát hành).
//   node scripts/release/release-check.mjs deps-macos <file>... [--min-os 14.2]
//       Mọi thư viện mà file Mach-O nạp đều là của hệ thống (/System/Library, /usr/lib), và bản macOS tối thiểu của file
//       không cao hơn --min-os.
//   node scripts/release/release-check.mjs deps-windows <file>... [--no-local-libs]
//       Đọc `dumpbin /dependents`: không file nào cần C runtime của Visual C++ (VCRUNTIME, MSVCP, VCOMP; C9 của kế hoạch 00);
//       với --no-local-libs (asr-worker), không DLL nào nằm cạnh file, nên không có DLL ggml (C11).
//   node scripts/release/release-check.mjs size <file> --max-bytes <số>
//       Dung lượng bộ cài không vượt ngưỡng (spec §6.11: 60 MB, tính 60 000 000 byte).
//   node scripts/release/release-check.mjs sha256sums <file>... --out <file>
//       Dòng `<sha256>  <tên file>` cho từng bộ cài, để website công bố (spec §10.2).
//
// Lỗi thì in lý do ra stderr và thoát mã 1.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Tên sau khi đóng gói: bỏ hậu tố `-<target>` (trước `.exe` nếu có). Cùng luật với `src-tauri/src/sidecar/bundled_name.rs`. */
export function bundledName(file, target) {
  const exe = file.endsWith(".exe") ? ".exe" : "";
  const stem = exe ? file.slice(0, -exe.length) : file;
  const suffix = `-${target}`;
  if (stem.endsWith(suffix) && stem.length > suffix.length) return stem.slice(0, -suffix.length) + exe;
  return file;
}

/** Tên có dạng thư viện mà hệ điều hành hay `llama-server` có thể nạp. Cùng luật với `integrity::looks_like_library`. */
export function looksLikeLibrary(name) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".dll") ||
    lower.endsWith(".dylib") ||
    lower.endsWith(".so") ||
    lower.includes(".so.") ||
    lower.startsWith("libggml-") ||
    lower.startsWith("ggml-")
  );
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function filesIn(dir) {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();
}

/** Bảng SHA-256 của thư mục tiến trình phụ. */
export function sidecarTable(dir, target) {
  return filesIn(dir).map((file) => {
    const path = join(dir, file);
    return { file, bundled: bundledName(file, target), bytes: statSync(path).size, sha256: sha256File(path) };
  });
}

/** Lỗi khi so bản đóng gói với binaries/. Trả mảng câu lỗi, rỗng là đạt. */
export function checkBundle(binariesDir, bundleDir, target) {
  const errors = [];
  const table = sidecarTable(binariesDir, target);
  if (table.length === 0) errors.push(`${binariesDir} không có file nào`);
  const expected = new Set();
  for (const row of table) {
    expected.add(row.bundled);
    const path = join(bundleDir, row.bundled);
    if (!existsSync(path)) {
      errors.push(`thiếu ${row.bundled} trong bản đóng gói`);
    } else if (sha256File(path) !== row.sha256) {
      errors.push(`${row.bundled} khác bản trong binaries/ (${row.file}), bảng SHA-256 build sẵn sẽ không khớp`);
    }
  }
  for (const name of filesIn(bundleDir)) {
    if (looksLikeLibrary(name) && !expected.has(name)) errors.push(`thư viện lạ trong bản đóng gói: ${name}`);
  }
  return errors;
}

/** Lỗi khi file chạy của app (nội dung `binary`) không mang đúng bảng `table` (kết quả của `sidecarTable`). */
export function embeddedErrors(binary, table) {
  const errors = [];
  for (const row of table) {
    if (!binary.includes(Buffer.from(row.sha256))) errors.push(`file chạy của app không có SHA-256 của ${row.file}`);
    if (row.file !== row.bundled && binary.includes(Buffer.from(row.file))) {
      errors.push(`file chạy của app còn tên bản dev ${row.file}: bảng SHA-256 không dùng tên sau khi đóng gói`);
    }
  }
  return errors;
}

/** Thư viện trong output của `otool -L <file>` (bỏ dòng đầu là tên file). */
export function parseOtoolLibraries(text) {
  return text
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/ \(compatibility version .*\)$/, ""));
}

/** Bản macOS tối thiểu (`minos`) trong output của `otool -l <file>`, hoặc null. */
export function parseOtoolMinOs(text) {
  const match = text.match(/cmd LC_BUILD_VERSION[\s\S]*?\n\s*minos (\S+)/);
  return match ? match[1] : null;
}

function versionLe(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return true;
}

/** Lỗi của một file Mach-O: thư viện ngoài hệ thống, hoặc `minos` cao hơn `minOs`. */
export function macosErrors(file, libraries, minos, minOs) {
  const errors = [];
  for (const lib of libraries) {
    if (!lib.startsWith("/System/Library/") && !lib.startsWith("/usr/lib/")) {
      errors.push(`${file} nạp thư viện ngoài hệ thống: ${lib}`);
    }
  }
  if (minos === null) errors.push(`${file} không có LC_BUILD_VERSION`);
  else if (!versionLe(minos, minOs)) errors.push(`${file} cần macOS ${minos}, cao hơn ${minOs}`);
  return errors;
}

/** DLL trong output của `dumpbin /dependents <file>`: các dòng giữa "Image has the following dependencies:" và "Summary". */
export function parseDumpbinDependents(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /Image has the following (delay load )?dependencies:/.test(line));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (/^Summary$/.test(trimmed)) break;
    if (/Image has the following delay load dependencies:/.test(trimmed)) continue;
    if (/\.dll$/i.test(trimmed)) out.push(trimmed);
  }
  return out;
}

const VC_RUNTIME = /^(vcruntime|msvcp|vcomp|concrt|vccorlib|ucrtbased)\d*.*\.dll$/i;

/** Lỗi của một file PE: cần C runtime của Visual C++; với `noLocalLibs`, có DLL nằm cạnh file (trong `localDlls`). */
export function windowsErrors(file, dlls, localDlls, noLocalLibs) {
  const errors = [];
  const local = new Set(localDlls.map((name) => name.toLowerCase()));
  for (const dll of dlls) {
    if (VC_RUNTIME.test(dll)) errors.push(`${file} cần C runtime của Visual C++: ${dll}`);
    if (noLocalLibs && local.has(dll.toLowerCase())) errors.push(`${file} nạp DLL nằm cạnh nó: ${dll}`);
  }
  return errors;
}

export function checkSize(bytes, maxBytes) {
  return bytes <= maxBytes ? [] : [`${bytes} byte, vượt ngưỡng ${maxBytes} byte`];
}

function option(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

function required(value, name) {
  if (value === undefined) throw new Error(`thiếu ${name}`);
  return value;
}

export function main(argv) {
  const args = [...argv];
  const command = args.shift();
  const errors = [];
  switch (command) {
    case "table": {
      const target = required(option(args, "--target"), "--target");
      const out = option(args, "--out");
      const table = sidecarTable(required(args[0], "thư mục binaries"), target);
      const json = `${JSON.stringify(table, null, 2)}\n`;
      if (out) writeFileSync(out, json);
      else process.stdout.write(json);
      break;
    }
    case "bundle": {
      const target = required(option(args, "--target"), "--target");
      errors.push(...checkBundle(required(args[0], "thư mục binaries"), required(args[1], "thư mục đóng gói"), target));
      if (errors.length === 0) console.log(`bản đóng gói khớp ${filesIn(args[0]).length} file của binaries/`);
      break;
    }
    case "embedded": {
      const target = required(option(args, "--target"), "--target");
      const table = sidecarTable(required(args[0], "thư mục binaries"), target);
      errors.push(...embeddedErrors(readFileSync(required(args[1], "file chạy của app")), table));
      if (errors.length === 0) console.log(`${basename(args[1])} mang bảng SHA-256 của ${table.length} file, đúng tên sau khi đóng gói`);
      break;
    }
    case "deps-macos": {
      const minOs = option(args, "--min-os") ?? "14.2";
      for (const file of args) {
        const libs = parseOtoolLibraries(execFileSync("otool", ["-L", file], { encoding: "utf8" }));
        const minos = parseOtoolMinOs(execFileSync("otool", ["-l", file], { encoding: "utf8" }));
        errors.push(...macosErrors(basename(file), libs, minos, minOs));
        console.log(`${basename(file)}: minos ${minos}; ${libs.join(", ")}`);
      }
      break;
    }
    case "deps-windows": {
      const noLocalLibs = flag(args, "--no-local-libs");
      for (const file of args) {
        const dlls = parseDumpbinDependents(execFileSync("dumpbin", ["/nologo", "/dependents", file], { encoding: "utf8" }));
        const dir = join(file, "..");
        const localDlls = filesIn(dir).filter((name) => name.toLowerCase().endsWith(".dll"));
        errors.push(...windowsErrors(basename(file), dlls, localDlls, noLocalLibs));
        console.log(`${basename(file)}: ${dlls.join(", ")}`);
      }
      break;
    }
    case "size": {
      const maxBytes = Number(required(option(args, "--max-bytes"), "--max-bytes"));
      const file = required(args[0], "file");
      const bytes = statSync(file).size;
      console.log(`${basename(file)}: ${bytes} byte (${(bytes / 1e6).toFixed(1)} MB), ngưỡng ${maxBytes} byte`);
      errors.push(...checkSize(bytes, maxBytes));
      break;
    }
    case "sha256sums": {
      const out = required(option(args, "--out"), "--out");
      const lines = args.map((file) => `${sha256File(file)}  ${basename(file)}\n`);
      writeFileSync(out, lines.join(""));
      process.stdout.write(lines.join(""));
      break;
    }
    default:
      throw new Error(`lệnh không rõ: ${command ?? "(trống)"}`);
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const errors = main(process.argv.slice(2));
    for (const error of errors) console.error(`LỖI: ${error}`);
    process.exitCode = errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail))'`

Expected (lúc lập kế hoạch):
```text
✔ tên sau khi đóng gói giống luật của bundled_name.rs (0.409667ms)
✔ bảng SHA-256 có tên gốc, tên sau khi đóng gói, số byte (4.3635ms)
✔ bản đóng gói khớp binaries/ thì không lỗi (3.106958ms)
✔ bản đóng gói thiếu file, file bị đổi (ví dụ ký lại), hay có thư viện lạ thì lỗi (2.63575ms)
✔ binaries/ rỗng là lỗi (0.901625ms)
✔ file chạy của app phải mang SHA-256 của mọi file, với tên sau khi đóng gói (0.172708ms)
✔ đọc otool -L và otool -l (0.194209ms)
✔ macOS: thư viện ngoài hệ thống và minos cao hơn đều là lỗi (0.088375ms)
✔ đọc dumpbin /dependents, kể cả phần delay load (0.357ms)
✔ Windows: C runtime của Visual C++ luôn là lỗi; DLL cạnh file là lỗi khi --no-local-libs (1.715459ms)
✔ ngưỡng dung lượng tính bằng byte, bằng ngưỡng vẫn đạt (0.056666ms)
✔ CLI: size và sha256sums (1.787958ms)
ℹ tests 12
ℹ pass 12
ℹ fail 0
```

- [ ] **Step 3: Thử với `llama-server` b11146 chính thức** (bản link động của Giai đoạn 0, có sẵn ở `tools/`): phép kiểm phải báo mọi `.dylib` ngoài hệ thống.

Run:
```bash
node scripts/release/release-check.mjs deps-macos tools/llama-b11146/macos-arm64/llama-b11146/llama-server 2>&1 | cut -c1-140; echo "exit=$?"
```

Expected (lúc lập kế hoạch; `exit` là mã của `cut`, lệnh `node` thoát 1):
```text
llama-server: minos 13.3; /usr/lib/librdma.dylib, @rpath/libllama-server-impl.dylib, @rpath/libllama-common.0.dylib, @rpath/libmtmd.0.dylib,
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libllama-server-impl.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libllama-common.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libmtmd.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libllama.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libggml.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libggml-cpu.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libggml-blas.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libggml-metal.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libggml-rpc.0.dylib
LỖI: llama-server nạp thư viện ngoài hệ thống: @rpath/libggml-base.0.dylib
exit=0
```

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/release/release-check.mjs scripts/release/release-check.test.mjs
git commit -q -m "feat(release): script kiểm bản phát hành: bảng SHA-256, bản đóng gói, thư viện nạp, dung lượng, SHA256SUMS (Đ15, §6.11, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): script kiểm bản phát hành: bảng SHA-256, bản đóng gói, thư viện nạp, dung lượng, SHA256SUMS (Đ15, §6.11, §10.2)
```

## Task 3: Tiến trình phụ macOS từ mã nguồn đã khóa

QĐ4, QĐ6, QĐ7, QĐ21. `versions.env` khóa phiên bản và checksum cho mọi script phát hành; `build-sidecars-macos.sh` build `asr-worker` và `llama-server` tĩnh, ký, kiểm; `compare-llama.mjs` so bản tự build với bản chính thức trên cùng model (R11).

**Files:**
- Create: `scripts/release/versions.env`, `scripts/release/compare-llama.test.mjs`, `scripts/release/compare-llama.mjs`, `scripts/release/build-sidecars-macos.sh`

- [ ] **Step 1: Phiên bản đã khóa**

Tạo `scripts/release/versions.env`:

```sh
# Phiên bản đã khóa của mã nguồn và công cụ dùng để build bản phát hành (kế hoạch 07a; spec §6.12, §10.2).
# File này vừa được `sh` nạp (`. versions.env`), vừa được PowerShell đọc theo dòng `TÊN=giá trị`: chỉ dùng dạng đó, không
# dấu nháy, không biến lồng nhau. Đổi phiên bản thì đổi cả commit hay SHA-256 đi kèm, rồi làm lại các phép thử ở kế
# hoạch 07a (mục "Khi nâng llama.cpp").

# llama.cpp v0.5.0 = build b11146 (spec §6.12). Commit kiểm bằng `git rev-parse HEAD` sau khi clone theo tag.
LLAMA_CPP_TAG=b11146
LLAMA_CPP_COMMIT=7fe450e19305b828c199d602c23a8337aaa1f03b
LLAMA_CPP_BUILD_NUMBER=11146

# protoc (build candle-onnx, spec §6.12): bản phát hành v36.2 trên GitHub, SHA-256 lấy từ trường `digest` của release.
PROTOC_VERSION=36.2
PROTOC_SHA256_OSX_AARCH64=9cd98a532c5c5e0c4161314de0225de27e4c8a323917b6ea7b1b714d3ae23466
PROTOC_SHA256_WIN64=f0c128dc0d8492eceece83bb459a4c0e316764b929ffbf1aa416357fd644edd3

# Vulkan SDK (build asr-worker-vulkan và ggml-vulkan của llama-server trên Windows). SHA-256 của bộ cài chốt ở lần chạy
# đầu (kế hoạch 07a, Task 12): còn trống thì bước cài in SHA-256 thật rồi dừng.
VULKAN_SDK_VERSION=1.4.363.0
VULKAN_SDK_SHA256=
```

- [ ] **Step 2: Test của phần thuần trong `compare-llama.mjs`, rồi code**

Tạo `scripts/release/compare-llama.test.mjs`:

```js
// Test phần thuần của compare-llama.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { SENTENCES, differences, translationPrompt } from "./compare-llama.mjs";

test("câu lệnh dịch theo mẫu của Hy-MT2", () => {
  assert.equal(
    translationPrompt("vi", "Hello."),
    "Translate the following segment into Vietnamese, without additional explanation.\n\nHello.",
  );
});

test("khác chữ hay khác số token đều tính là khác", () => {
  const a = SENTENCES.map((_, i) => ({ text: `câu ${i}`, tokens: 5 }));
  assert.deepEqual(differences(a, a.map((x) => ({ ...x }))), []);
  const b = a.map((x) => ({ ...x }));
  b[1] = { text: "câu khác", tokens: 5 };
  b[3] = { text: "câu 3", tokens: 6 };
  assert.deepEqual(differences(a, b), [
    'câu 2: A {"text":"câu 1","tokens":5} / B {"text":"câu khác","tokens":5}',
    'câu 4: A {"text":"câu 3","tokens":5} / B {"text":"câu 3","tokens":6}',
  ]);
});
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^ℹ (tests|pass|fail)'
```

Expected (lúc lập kế hoạch: chưa có module):
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/compare-llama.mjs' imported from /Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/compare-llama.test.mjs
ℹ tests 13
ℹ pass 12
ℹ fail 1
```

Tạo `scripts/release/compare-llama.mjs`:

```js
#!/usr/bin/env node
// So hai bản llama-server trên cùng model (R11 của kế hoạch 00): chạy lần lượt từng bản với đúng cờ app dùng
// (crates/pipeline/src/llama.rs), dịch vài câu cố định với temperature 0, rồi so từng chữ và số token. Khác nhau thì thoát
// mã 1. Dùng khi thay bản chính thức b11146 bằng bản tự build của kế hoạch 07a, và mỗi lần nâng llama.cpp.
//
//   node scripts/release/compare-llama.mjs <llama-server A> <llama-server B> <model .gguf> [--cpu]
//
// --cpu: chạy với -ngl 0 (đường CPU, như app khi GPU lỗi). Không cần mạng; server chỉ nghe 127.0.0.1.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";

export const SENTENCES = [
  ["en", "vi", "Let's move the release to next Tuesday so the team has time to fix the login bug."],
  ["zh", "vi", "我们下周二之前需要把预算报告发给财务部。"],
  ["ja", "en", "この件については、来週の会議でもう一度話し合いましょう。"],
  ["vi", "en", "Chúng ta cần thêm hai người cho dự án này trước cuối tháng."],
  ["ko", "vi", "회의록은 오늘 오후까지 공유해 주세요."],
];

const NAMES = { en: "English", vi: "Vietnamese", zh: "Chinese", ja: "Japanese", ko: "Korean" };

/** Câu lệnh dịch theo mẫu của Hy-MT2 (không kèm thuật ngữ). */
export function translationPrompt(target, text) {
  return `Translate the following segment into ${NAMES[target]}, without additional explanation.\n\n${text}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitHealthy(base, key, child) {
  for (let i = 0; i < 600; i++) {
    if (child.exitCode !== null) throw new Error(`llama-server thoát sớm, mã ${child.exitCode}`);
    try {
      const res = await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) return;
    } catch {
      // chưa nghe
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("llama-server không sẵn sàng sau 60 giây");
}

async function post(base, key, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Chạy một bản llama-server, dịch mọi câu, trả [{text, tokens}]. */
export async function runServer(binary, model, cpu) {
  const port = await freePort();
  const key = randomBytes(16).toString("hex");
  const args = ["-m", model, "--host", "127.0.0.1", "--port", String(port), "-c", "2048", "-np", "1"];
  args.push("-ngl", cpu ? "0" : "auto", "--no-ui");
  const child = spawn(binary, args, { env: { ...process.env, LLAMA_API_KEY: key }, stdio: ["ignore", "ignore", "pipe"] });
  let log = "";
  child.stderr.on("data", (d) => {
    log = (log + d).slice(-4000);
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitHealthy(base, key, child);
    const out = [];
    for (const [, target, text] of SENTENCES) {
      const reply = await post(base, key, "/v1/chat/completions", {
        messages: [{ role: "user", content: translationPrompt(target, text) }],
        temperature: 0,
        top_k: 1,
        seed: 1,
        max_tokens: 96,
        stream: false,
      });
      const content = reply.choices[0].message.content;
      const tokens = (await post(base, key, "/tokenize", { content })).tokens.length;
      out.push({ text: content, tokens });
    }
    return out;
  } catch (error) {
    throw new Error(`${error.message}\n--- stderr của llama-server ---\n${log}`);
  } finally {
    child.kill();
  }
}

/** Các dòng khác nhau giữa hai kết quả. */
export function differences(a, b) {
  const diffs = [];
  for (let i = 0; i < SENTENCES.length; i++) {
    if (a[i].text !== b[i].text || a[i].tokens !== b[i].tokens) {
      diffs.push(`câu ${i + 1}: A ${JSON.stringify(a[i])} / B ${JSON.stringify(b[i])}`);
    }
  }
  return diffs;
}

async function main(argv) {
  const cpu = argv.includes("--cpu");
  const [a, b, model] = argv.filter((x) => x !== "--cpu");
  if (!a || !b || !model) throw new Error("cần: <llama-server A> <llama-server B> <model .gguf> [--cpu]");
  const ra = await runServer(a, model, cpu);
  const rb = await runServer(b, model, cpu);
  SENTENCES.forEach(([src, tgt], i) => console.log(`${i + 1}. ${src}->${tgt} (${ra[i].tokens} token): ${ra[i].text}`));
  const diffs = differences(ra, rb);
  for (const d of diffs) console.error(`KHÁC: ${d}`);
  console.log(diffs.length === 0 ? `giống nhau cả ${SENTENCES.length} câu` : `${diffs.length} câu khác nhau`);
  return diffs.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (error) => {
      console.error(`LỖI: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
```

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^ℹ (tests|pass|fail)'`

Expected (lúc lập kế hoạch):
```text
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

- [ ] **Step 3: Script build**

Tạo `scripts/release/build-sidecars-macos.sh`:

```sh
#!/bin/sh
# Build hai tiến trình phụ của bản phát hành macOS (arm64) từ mã nguồn đã khóa, rồi chép vào src-tauri/binaries/ (kế hoạch
# 07a; spec §6.11, §6.12, §10.2):
#   - asr-worker: whisper.cpp 1.8.3 đã vá trong third_party/, link tĩnh, Metal, shared-encode (dòng 119 của kế hoạch 00);
#   - llama-server: llama.cpp ở commit khóa trong versions.env, build tĩnh (Metal nhúng sẵn shader, GGML_NATIVE=OFF, mức CPU
#     như asr-worker), không web UI, không HTTPS; không có .dylib đi kèm (dòng 211 của kế hoạch 00).
# Rồi kiểm mọi thư viện mà hai file nạp đều là của hệ thống, và macOS tối thiểu là 14.2 (`release-check.mjs deps-macos`).
#
# Ký: đặt MT_SIGN_IDENTITY (ví dụ "Developer ID Application: <tên> (<Team ID>)") thì ký từng file với hardened runtime và
# timestamp; không đặt thì ký ad-hoc. Phải ký trước khi build app: build.rs băm file trong binaries/, và nếu bundler của
# Tauri ký lại thì SHA-256 đổi (vì vậy package-macos.sh build bằng `tauri build --no-sign`).
#
#   scripts/release/build-sidecars-macos.sh              # build, chép, ký, kiểm
#   scripts/release/build-sidecars-macos.sh --sign-only  # chỉ ký lại file đã có trong binaries/ rồi kiểm
#
# CI build trước (ký ad-hoc, keychain chưa có chứng thư), rồi mới nạp chứng thư và chạy `--sign-only`, để build script của
# các crate không chạy lúc chứng thư đang mở (spec §10.2, rủi ro chuỗi cung ứng).
#
# Thư mục làm việc: $MT_RELEASE_WORK (mặc định target/release-work). Script xóa mọi file cũ trong src-tauri/binaries/; bản
# dev cần chạy lại scripts/copy-sidecars.sh sau đó.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
# shellcheck source=scripts/release/versions.env
. "$root/scripts/release/versions.env"
triple=aarch64-apple-darwin
work="${MT_RELEASE_WORK:-$root/target/release-work}"
target="${CARGO_TARGET_DIR:-$root/target}"
out="$root/src-tauri/binaries"
identity="${MT_SIGN_IDENTITY:--}"
mkdir -p "$work"

sign_and_check() {
  for name in asr-worker llama-server; do
    file="$out/$name-$triple"
    if [ "$identity" = "-" ]; then
      codesign --force --sign - --options runtime --identifier "com.aitranslator.desktop.$name" "$file"
    else
      codesign --force --sign "$identity" ${MT_KEYCHAIN:+--keychain "$MT_KEYCHAIN"} --options runtime --timestamp \
        --identifier "com.aitranslator.desktop.$name" "$file"
    fi
    codesign --verify --strict "$file"
  done
  node "$root/scripts/release/release-check.mjs" deps-macos "$out"/*
  node "$root/scripts/release/release-check.mjs" table "$out" --target "$triple"
}

if [ "${1:-}" = "--sign-only" ]; then
  sign_and_check
  exit 0
fi

echo "== asr-worker (metal, shared-encode)"
(cd "$root" && cargo build --release --locked -p asr-worker --features metal,shared-encode)

echo "== llama.cpp $LLAMA_CPP_TAG"
src="$work/llama.cpp"
if [ ! -d "$src/.git" ]; then
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$LLAMA_CPP_TAG" \
    https://github.com/ggml-org/llama.cpp.git "$src"
fi
actual=$(git -C "$src" rev-parse HEAD)
if [ "$actual" != "$LLAMA_CPP_COMMIT" ]; then
  echo "llama.cpp ở commit $actual, versions.env khóa $LLAMA_CPP_COMMIT" >&2
  exit 1
fi
if [ -n "$(git -C "$src" status --porcelain)" ]; then
  echo "mã nguồn llama.cpp ở $src đã bị sửa: xóa thư mục đó rồi chạy lại" >&2
  exit 1
fi
cmake -S "$src" -B "$work/llama-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.2 \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=OFF \
  -DGGML_CPU_ARM_ARCH=armv8.4-a+fp16 \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_BLAS=ON \
  -DGGML_OPENMP=OFF \
  -DGGML_RPC=OFF \
  -DGGML_BACKEND_DL=OFF \
  -DGGML_CCACHE=OFF \
  -DLLAMA_BUILD_NUMBER="$LLAMA_CPP_BUILD_NUMBER" \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_TOOLS=ON \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_OPENSSL=OFF >"$work/llama-cmake.log"
cmake --build "$work/llama-build" --target llama-server >"$work/llama-build.log"

echo "== src-tauri/binaries"
mkdir -p "$out"
rm -f "$out"/*
cp "$target/release/asr-worker" "$out/asr-worker-$triple"
cp "$work/llama-build/bin/llama-server" "$out/llama-server-$triple"
sign_and_check
```

Run: `chmod +x scripts/release/build-sidecars-macos.sh`

- [ ] **Step 4: Build thật** (clone llama.cpp từ GitHub, build release `asr-worker` và `llama-server`; lúc lập kế hoạch khoảng 1–3 phút trên M4 Pro tùy cache). Kiểm đĩa trước: Task 3 và Task 6 cần khoảng 3 GB ở `target/`, nên dưới 4 GiB thì dừng.

Run: `df -h /System/Volumes/Data | tail -1 | awk '{print ($4+0 >= 4) ? "đủ đĩa" : "THIẾU ĐĨA: dừng"}'`

Expected (lúc lập kế hoạch):
```text
đủ đĩa
```

Run:
```bash
scripts/release/build-sidecars-macos.sh 2>&1 | grep -v -E '^\s*(Compiling|Downloaded|Downloading|Updating|Locking|Adding)' | grep -v 'replacing existing signature'
```

Expected (lúc lập kế hoạch; SHA-256 chỉ giống khi cùng máy và cùng Xcode):
```text
== asr-worker (metal, shared-encode)
    Finished `release` profile [optimized] target(s) in 23.07s
== llama.cpp b11146
CMAKE_BUILD_TYPE=Release
== src-tauri/binaries
asr-worker-aarch64-apple-darwin: minos 11.0; /usr/lib/libiconv.2.dylib, /usr/lib/libc++.1.dylib, /System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate, /System/Library/Frameworks/Foundation.framework/Versions/C/Foundation, /System/Library/Frameworks/Metal.framework/Versions/A/Metal, /System/Library/Frameworks/MetalKit.framework/Versions/A/MetalKit, /usr/lib/libSystem.B.dylib, /System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation, /usr/lib/libobjc.A.dylib
llama-server-aarch64-apple-darwin: minos 14.2; /System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate, /usr/lib/libSystem.B.dylib, /System/Library/Frameworks/Foundation.framework/Versions/C/Foundation, /System/Library/Frameworks/Metal.framework/Versions/A/Metal, /System/Library/Frameworks/MetalKit.framework/Versions/A/MetalKit, /usr/lib/libc++.1.dylib, /System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation, /usr/lib/libobjc.A.dylib
[
  {
    "file": "asr-worker-aarch64-apple-darwin",
    "bundled": "asr-worker",
    "bytes": 2107216,
    "sha256": "736a323b2759acba13574b6aa90458daa35633cfff484c560882265f189428ef"
  },
  {
    "file": "llama-server-aarch64-apple-darwin",
    "bundled": "llama-server",
    "bytes": 14656528,
    "sha256": "f55dd2030a20c1de90143cb452c7567da73dfe2f2a5ee2e7dba2d8e4ae949d80"
  }
]
```

Run:
```bash
for f in src-tauri/binaries/*; do codesign -dv "$f" 2>&1 | grep -E '^(Identifier|CodeDirectory)' | cut -d ' ' -f 1-4; done
src-tauri/binaries/llama-server-aarch64-apple-darwin --version 2>&1 | grep '^version'
```

Expected (lúc lập kế hoạch):
```text
Identifier=com.aitranslator.desktop.asr-worker
CodeDirectory v=20500 size=4292 flags=0x10002(adhoc,runtime)
Identifier=com.aitranslator.desktop.llama-server
CodeDirectory v=20500 size=28742 flags=0x10002(adhoc,runtime)
version: 0.5.0-dev (build 11146, commit 7fe450e)
```

- [ ] **Step 5: So với b11146 chính thức** (cần `models/` của Giai đoạn 0; không cần mạng). Đường GPU phải giống từng chữ; đường CPU được phép khác (QĐ4).

Run:
```bash
node scripts/release/compare-llama.mjs tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
  src-tauri/binaries/llama-server-aarch64-apple-darwin models/Hy-MT2-1.8B-Q8_0.gguf
```

Expected (lúc lập kế hoạch):
```text
1. en->vi (45 token): Hãy chuyển ngày phát hành sang thứ Ba tuần sau. Như vậy, đội ngũ sẽ có thời gian để khắc phục lỗi liên quan đến quá trình đăng nhập.
2. zh->vi (27 token): Chúng ta cần phải gửi báo cáo ngân sách cho bộ phận tài chính trước thứ Ba tới.
3. ja->en (13 token): We’ll discuss this matter again during the meeting next week.
4. vi->en (15 token): We need two more people for this project before the end of the month.
5. ko->vi (23 token): Xin hãy chia sẻ biên bản cuộc họp cho tôi vào chiều nay nhé.
giống nhau cả 5 câu
```

Run:
```bash
node scripts/release/compare-llama.mjs tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
  src-tauri/binaries/llama-server-aarch64-apple-darwin models/Hy-MT2-1.8B-Q4_K_M.gguf | tail -1
```

Expected (lúc lập kế hoạch):
```text
giống nhau cả 5 câu
```

Run:
```bash
node scripts/release/compare-llama.mjs tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
  src-tauri/binaries/llama-server-aarch64-apple-darwin models/Hy-MT2-1.8B-Q8_0.gguf --cpu 2>&1 | tail -2; echo "exit=$?"
```

Expected (lúc lập kế hoạch; khác 1 câu là chấp nhận được (QĐ4), Task 13 đo A3):
```text
KHÁC: câu 3: A {"text":"Regarding this matter, let’s discuss it again at the meeting next week.","tokens":16} / B {"text":"We’ll discuss this matter again during the meeting next week.","tokens":13}
1 câu khác nhau
exit=0
```

- [ ] **Step 6: Commit**

Run:
```bash
git add scripts/release/versions.env scripts/release/compare-llama.mjs scripts/release/compare-llama.test.mjs scripts/release/build-sidecars-macos.sh
git commit -q -m "feat(release): build asr-worker và llama-server tĩnh cho macOS từ mã nguồn đã khóa; so bản tự build với b11146 chính thức (§6.12, §10.2, R11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): build asr-worker và llama-server tĩnh cho macOS từ mã nguồn đã khóa; so bản tự build với b11146 chính thức (§6.12, §10.2, R11)
```

## Task 4: Kiểm `third_party` từ crates.io

QĐ7. Dựng lại `third_party/whisper-rs-sys` (kèm whisper.cpp 1.8.3) và `third_party/whisper-rs` từ hai file `.crate` (SHA-256 trong `third_party/README.md`) cộng hai bản vá, rồi so với bản đã commit. Lấy `.crate` trong cache của cargo nếu có.

**Files:**
- Create: `scripts/release/verify-third-party.sh`

- [ ] **Step 1: Script**

Tạo `scripts/release/verify-third-party.sh`:

```sh
#!/bin/sh
# Kiểm `third_party/` (whisper.cpp 1.8.3 trong whisper-rs-sys, và whisper-rs) đúng bằng hai crate gốc trên crates.io, với
# SHA-256 đã khóa, cộng hai bản vá trong `third_party/patches/` (spec §10.2: whisper.cpp build từ mã nguồn đã khóa, có
# kiểm checksum). Dựng lại theo `third_party/README.md` trong thư mục tạm, rồi so từng file mà git theo dõi trong
# `third_party/whisper-rs-sys` và `third_party/whisper-rs` (bản trong cây làm việc; CI checkout đúng commit đang build).
#
#   scripts/release/verify-third-party.sh
#
# Lấy file .crate trong cache của cargo nếu có, không thì tải từ static.crates.io. Hai mã SHA-256 phải khớp README.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/rebuilt/third_party" "$tmp/committed"

fetch() {
  name=$1
  version=$2
  sha=$3
  file="$tmp/$name-$version.crate"
  cached=""
  for candidate in "${CARGO_HOME:-$HOME/.cargo}"/registry/cache/*/"$name-$version.crate"; do
    if [ -f "$candidate" ]; then
      cached=$candidate
      break
    fi
  done
  if [ -n "$cached" ]; then
    cp "$cached" "$file"
  else
    curl -sSfL -o "$file" "https://static.crates.io/crates/$name/$name-$version.crate"
  fi
  actual=$(shasum -a 256 "$file" | cut -d ' ' -f 1)
  if [ "$actual" != "$sha" ]; then
    echo "$name $version: SHA-256 $actual, README khóa $sha" >&2
    exit 1
  fi
  tar xzf "$file" -C "$tmp/rebuilt/third_party"
  mv "$tmp/rebuilt/third_party/$name-$version" "$tmp/rebuilt/third_party/$name"
  rm "$tmp/rebuilt/third_party/$name/.cargo_vcs_info.json"
}

# Hai mã SHA-256 lấy đúng từ khối "Dựng lại từ đầu" của README, để README và script không lệch nhau.
sha_of() {
  sed -n "s/^\([0-9a-f]\{64\}\)  third_party\/$1\$/\1/p" "$root/third_party/README.md"
}
fetch whisper-rs-sys 0.15.0 "$(sha_of whisper-rs-sys-0.15.0.crate)"
fetch whisper-rs 0.16.0 "$(sha_of whisper-rs-0.16.0.crate)"
(cd "$tmp/rebuilt" && git apply --directory=third_party "$root/third_party/patches/0001-whisper-cpp-set-audio-ctx.patch" \
  && git apply --directory=third_party "$root/third_party/patches/0002-whisper-rs-set-audio-ctx.patch")

(cd "$root" && git ls-files -z third_party/whisper-rs-sys third_party/whisper-rs | xargs -0 tar -cf -) |
  tar -x -C "$tmp/committed"
if diff -r "$tmp/rebuilt/third_party" "$tmp/committed/third_party" >"$tmp/diff.txt"; then
  echo "third_party khớp whisper-rs-sys 0.15.0 và whisper-rs 0.16.0 trên crates.io cộng hai bản vá"
else
  head -n 40 "$tmp/diff.txt" >&2
  echo "third_party khác bản dựng lại từ crates.io (xem diff ở trên)" >&2
  exit 1
fi
```

Run: `chmod +x scripts/release/verify-third-party.sh`

- [ ] **Step 2: Chạy**

Run: `scripts/release/verify-third-party.sh`

Expected (lúc lập kế hoạch):
```text
third_party khớp whisper-rs-sys 0.15.0 và whisper-rs 0.16.0 trên crates.io cộng hai bản vá
```

- [ ] **Step 3: Thử chiều sai** (thêm tạm một dòng vào whisper.cpp, chạy, rồi trả file về): script phải báo khác.

Run:
```bash
echo '// thử' >> third_party/whisper-rs-sys/whisper.cpp/src/whisper.cpp
scripts/release/verify-third-party.sh 2>&1 | tail -3
git checkout -- third_party/whisper-rs-sys/whisper.cpp/src/whisper.cpp
git status --short
```

Expected (lúc lập kế hoạch):
```text
9012a9013
> // thử
third_party khác bản dựng lại từ crates.io (xem diff ở trên)
?? scripts/release/verify-third-party.sh
```

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/release/verify-third-party.sh
git commit -q -m "feat(release): kiểm third_party đúng bằng whisper-rs-sys và whisper-rs trên crates.io cộng hai bản vá (§10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): kiểm third_party đúng bằng whisper-rs-sys và whisper-rs trên crates.io cộng hai bản vá (§10.2)
```

## Task 5: THIRD_PARTY_NOTICES và màn hình Giới thiệu

QĐ10, QĐ11 (§10.1; dòng 257, 258, 259 của kế hoạch 00).

**Files:**
- Create: `about.toml`, `licenses/models/{Hy-MT2,whisper,silero-vad}-LICENSE.txt`, `scripts/release/notices.test.mjs`, `scripts/release/notices.mjs`, `src/lib/notices.test.ts`, `src/lib/notices.ts`, `src/windows/main/screens/Licenses.tsx`
- Modify: `src/windows/main/screens/About.tsx` (bằng script), `src/i18n/en.ts`, `src/i18n/vi.ts`, `.gitignore`

- [ ] **Step 1: cargo-about** (bản build sẵn, chỉ dùng trên máy dev; CI cài bằng `taiki-e/install-action`)

Run:
```bash
mkdir -p target/release-work/tools && cd target/release-work/tools
curl -sfLO https://github.com/EmbarkStudios/cargo-about/releases/download/0.9.2/cargo-about-0.9.2-aarch64-apple-darwin.tar.gz
echo "ae72f0df0c399a1e96336f696fa55b1b28679fd725632eba8cf8e4568467cc3e  cargo-about-0.9.2-aarch64-apple-darwin.tar.gz" | shasum -a 256 -c -
tar xzf cargo-about-0.9.2-aarch64-apple-darwin.tar.gz
cp cargo-about-0.9.2-aarch64-apple-darwin/cargo-about "$HOME/.cargo/bin/cargo-about"
cargo about --version
```

Expected (lúc lập kế hoạch):
```text
cargo-about-0.9.2-aarch64-apple-darwin.tar.gz: OK
cargo-about 0.9.2
```

- [ ] **Step 2: Giấy phép của model** (văn bản ở cùng các tag mà kế hoạch 04 dùng; file của Hy-MT2 có sẵn trong `models/` từ Giai đoạn 0)

Run:
```bash
mkdir -p licenses/models
curl -sfL https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE -o licenses/models/whisper-LICENSE.txt
curl -sfL https://raw.githubusercontent.com/snakers4/silero-vad/v6.2.3/LICENSE -o licenses/models/silero-vad-LICENSE.txt
cp models/Hy-MT2-LICENSE.txt licenses/models/Hy-MT2-LICENSE.txt
shasum -a 256 -c - <<'EOF'
a1d52d448f81c584a47c583e19dfab2d3851c7c84431b07baee093c1113ed114  licenses/models/Hy-MT2-LICENSE.txt
2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b  licenses/models/silero-vad-LICENSE.txt
b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d  licenses/models/whisper-LICENSE.txt
EOF
```

Expected (lúc lập kế hoạch):
```text
licenses/models/Hy-MT2-LICENSE.txt: OK
licenses/models/silero-vad-LICENSE.txt: OK
licenses/models/whisper-LICENSE.txt: OK
```

- [ ] **Step 3: `about.toml`**

Tạo `about.toml`:

```toml
# cargo-about (kế hoạch 07a): giấy phép của mọi crate đi vào bản phát hành, để sinh THIRD_PARTY_NOTICES (spec §10.1).
# `accepted` giữ đúng như `[licenses] allow` của deny.toml; `scripts/release/notices.test.mjs` kiểm hai danh sách khớp.
accepted = [
    "0BSD",
    "Apache-2.0",
    "Apache-2.0 WITH LLVM-exception",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BSL-1.0",
    "CC0-1.0",
    "ISC",
    "MIT",
    "MIT-0",
    "MPL-2.0",
    "Unicode-3.0",
    "Unlicense",
    "Zlib",
]
# Chỉ hai nền tảng phát hành, như `[graph] targets` của deny.toml.
targets = ["aarch64-apple-darwin", "x86_64-pc-windows-msvc"]
# Crate chỉ dùng trong test không vào bản phát hành. Crate dùng lúc build (macro, build script) vẫn liệt kê.
ignore-dev-dependencies = true
# Crate trong workspace không publish nên không khai giấy phép.
private = { ignore = true }

# onig_sys nhúng mã nguồn C của Oniguruma (BSD-2-Clause, `oniguruma/COPYING`) vào tiến trình chính, qua candle-core →
# tokenizers (dòng 354 của kế hoạch 00). Giấy phép của crate chỉ ghi MIT, nên khai thêm file của Oniguruma.
[onig_sys.clarify]
license = "MIT AND BSD-2-Clause"

[[onig_sys.clarify.files]]
path = "LICENSE.md"
license = "MIT"
checksum = "71f321038b088358004bee991635ac09e4c703bec467d3c30c06992c0595f189"

[[onig_sys.clarify.files]]
path = "oniguruma/COPYING"
license = "BSD-2-Clause"
checksum = "70ba5469ea0bab6e18a32d7009068f996503168d27be57747e08da34337ff26f"
```

- [ ] **Step 4: Test của script sinh danh sách, rồi code**

Tạo `scripts/release/notices.test.mjs`:

```js
// Test của notices.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { licenseFiles, mergeAbout, npmPackages, renderNotices, spdxAllowed, tomlStringArray } from "./notices.mjs";

const root = join(import.meta.dirname, "..", "..");
const ALLOW = ["Apache-2.0", "MIT", "Apache-2.0 WITH LLVM-exception", "BSD-3-Clause"];

test("about.toml nhận đúng các giấy phép deny.toml cho phép", () => {
  const allow = tomlStringArray(readFileSync(join(root, "deny.toml"), "utf8"), "licenses", "allow");
  const accepted = tomlStringArray(readFileSync(join(root, "about.toml"), "utf8"), "", "accepted");
  assert.ok(allow.includes("MIT") && allow.length > 5);
  assert.deepEqual([...accepted].sort(), [...allow].sort());
});

test("đọc mảng chuỗi trong TOML theo mục", () => {
  const toml = 'x = ["a"]\n\n[licenses]\n# chú thích\nallow = [\n    "MIT",\n    "Zlib",\n]\n[bans]\nallow = ["no"]\n';
  assert.deepEqual(tomlStringArray(toml, "licenses", "allow"), ["MIT", "Zlib"]);
  assert.deepEqual(tomlStringArray(toml, "", "x"), ["a"]);
  assert.throws(() => tomlStringArray(toml, "graph", "targets"), /không có \[graph\]/);
});

test("biểu thức SPDX: OR cần một vế, AND cần mọi vế, WITH là một giấy phép", () => {
  assert.equal(spdxAllowed("MIT", ALLOW), true);
  assert.equal(spdxAllowed("Apache-2.0 OR MIT", ALLOW), true);
  assert.equal(spdxAllowed("GPL-3.0-only OR MIT", ALLOW), true);
  assert.equal(spdxAllowed("GPL-3.0-only", ALLOW), false);
  assert.equal(spdxAllowed("MIT AND GPL-3.0-only", ALLOW), false);
  assert.equal(spdxAllowed("(MIT OR Apache-2.0) AND BSD-3-Clause", ALLOW), true);
  assert.equal(spdxAllowed("(MIT OR Apache-2.0) AND ISC", ALLOW), false);
  assert.equal(spdxAllowed("Apache-2.0 WITH LLVM-exception", ALLOW), true);
  assert.equal(spdxAllowed("GPL-2.0 WITH Classpath-exception-2.0", ALLOW), false);
  // Ngoại lệ đi cùng giấy phép thành một mục riêng: MIT được phép không có nghĩa "MIT WITH <ngoại lệ>" được phép.
  assert.equal(spdxAllowed("MIT WITH Unknown-exception", ALLOW), false);
  assert.throws(() => spdxAllowed("(MIT", ALLOW), /thiếu "\)"/);
  assert.throws(() => spdxAllowed("MIT MIT", ALLOW), /hỏng/);
});

const crate = (name, version) => ({ crate: { name, version } });

test("gộp hai lần chạy cargo-about theo văn bản, mỗi crate một lần", () => {
  const app = {
    licenses: [
      { id: "MIT", name: "MIT License", text: "mit text A", used_by: [crate("serde", "1.0.229"), crate("log", "0.4.34")] },
      { id: "Apache-2.0", name: "Apache License 2.0", text: "apache", used_by: [crate("serde", "1.0.229")] },
    ],
  };
  const worker = {
    licenses: [
      { id: "MIT", name: "MIT License", text: "mit text A", used_by: [crate("serde", "1.0.229"), crate("libc", "0.2.189")] },
      { id: "MIT", name: "MIT License", text: "mit text B", used_by: [crate("anyhow", "1.0.104")] },
    ],
  };
  assert.deepEqual(mergeAbout([app, worker]), [
    { id: "Apache-2.0", name: "Apache License 2.0", text: "apache", crates: ["serde 1.0.229"] },
    { id: "MIT", name: "MIT License", text: "mit text B", crates: ["anyhow 1.0.104"] },
    { id: "MIT", name: "MIT License", text: "mit text A", crates: ["libc 0.2.189", "log 0.4.34", "serde 1.0.229"] },
  ]);
});

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "notices-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("gói npm: đọc mọi file giấy phép; giấy phép lạ hay thiếu file là lỗi", (t) => {
  const ok = tempDir(t);
  writeFileSync(join(ok, "LICENSE_MIT"), "mit");
  writeFileSync(join(ok, "LICENSE_APACHE-2.0"), "apache");
  writeFileSync(join(ok, "README.md"), "readme");
  const bare = tempDir(t);
  assert.deepEqual(licenseFiles(ok), ["LICENSE_APACHE-2.0", "LICENSE_MIT"]);
  const listing = {
    "Apache-2.0 OR MIT": [{ name: "@tauri-apps/api", versions: ["2.12.1"], paths: [ok], license: "Apache-2.0 OR MIT" }],
    "GPL-3.0-only": [{ name: "gpl-pkg", versions: ["1.0.0"], paths: [bare], license: "GPL-3.0-only" }],
    MIT: [{ name: "zustand", versions: ["5.0.15"], paths: [join(bare, "missing")], license: "MIT" }],
  };
  const { packages, errors } = npmPackages(listing, ALLOW);
  assert.deepEqual(packages, [
    { name: "@tauri-apps/api", version: "2.12.1", license: "Apache-2.0 OR MIT", texts: ["apache", "mit"] },
    { name: "gpl-pkg", version: "1.0.0", license: "GPL-3.0-only", texts: [] },
  ]);
  assert.deepEqual(errors, [
    "gpl-pkg: giấy phép GPL-3.0-only không có trong deny.toml",
    `gpl-pkg: không có file giấy phép trong ${bare}`,
    `zustand: không thấy ${join(bare, "missing")} (chạy pnpm install --frozen-lockfile trước)`,
  ]);
});

test("văn bản có đủ ba phần, theo thứ tự", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "LICENSE"), "MIT License\n\nCopyright (c) whisper.cpp authors\n");
  const text = renderNotices({
    rust: [{ id: "MIT", name: "MIT License", text: "\nmit body\n", crates: ["log 0.4.34", "serde 1.0.229"] }],
    npm: [{ name: "react", version: "19.3.0", license: "MIT", texts: ["react mit\n"] }],
    native: [
      { title: "whisper.cpp 1.8.3 and ggml (MIT) - in asr-worker", files: [join(dir, "LICENSE")] },
      { title: "Public domain components in llama-server", text: "stb_image (public domain or MIT)\n" },
    ],
  });
  const rule = "=".repeat(78);
  const line = "-".repeat(78);
  assert.equal(
    text,
    [
      "AI Translator - third-party software notices",
      "Generated by scripts/release/notices.mjs from Cargo.lock, pnpm-lock.yaml and the pinned native sources.",
      "",
      rule,
      "Rust crates (1 license texts)",
      rule,
      "",
      line,
      "MIT License (MIT)",
      "Used by: log 0.4.34, serde 1.0.229",
      line,
      "",
      "mit body",
      "",
      rule,
      "JavaScript packages (1)",
      rule,
      "",
      line,
      "react 19.3.0 (MIT)",
      line,
      "",
      "react mit",
      "",
      rule,
      "Native libraries and models",
      rule,
      "",
      line,
      "whisper.cpp 1.8.3 and ggml (MIT) - in asr-worker",
      line,
      "",
      "MIT License\n\nCopyright (c) whisper.cpp authors",
      "",
      line,
      "Public domain components in llama-server",
      line,
      "",
      "stb_image (public domain or MIT)",
      "",
      "",
    ].join("\n"),
  );
});
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^ℹ (tests|pass|fail)'
```

Expected (lúc lập kế hoạch: chưa có module):
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/notices.mjs' imported from /Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/notices.test.mjs
ℹ tests 15
ℹ pass 14
ℹ fail 1
```

Tạo `scripts/release/notices.mjs`:

```js
#!/usr/bin/env node
// Sinh THIRD_PARTY_NOTICES.txt (spec §10.1; kế hoạch 07a): giấy phép của mọi thư viện đi vào bản phát hành.
//   - Rust: `cargo about generate --format json --frozen` cho app và cho asr-worker (hai binary được phát hành có code
//     Rust), gộp theo văn bản giấy phép. `about.toml` chỉ nhận các giấy phép trong `[licenses] allow` của deny.toml.
//   - JavaScript: `pnpm licenses list --prod --json` (gói nằm trong giao diện đã build), văn bản lấy từ file LICENSE của
//     từng gói. Giấy phép phải nằm trong allow-list của deny.toml.
//   - C/C++ trong tiến trình phụ: whisper.cpp và ggml (third_party/), llama.cpp cùng các thư viện nó nhúng (mã nguồn đã
//     clone ở --llama-src, đúng commit khóa trong versions.env).
//   - Model: Hy-MT2, trọng số Whisper, Silero VAD (licenses/models/).
//
//   node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --llama-src <thư mục llama.cpp>
//   node scripts/release/notices.mjs --out <file> --no-llama     # CI kiểm giấy phép, chưa có mã nguồn llama.cpp
//
// Không dùng mạng: cargo-about chạy `--frozen`, chỉ đọc file trong cache của cargo.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..", "..");

/** So chuỗi theo mã ký tự, không theo locale, để thứ tự giống nhau trên mọi máy. */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Danh sách chuỗi trong mảng `key = [ ... ]` đầu tiên sau dòng `[section]` (hay ở gốc file khi `section` rỗng). */
export function tomlStringArray(text, section, key) {
  let body = text;
  if (section) {
    const start = text.indexOf(`\n[${section}]`);
    if (start < 0) throw new Error(`không có [${section}]`);
    body = text.slice(start + 1);
  }
  const match = body.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"));
  if (!match) throw new Error(`không có ${key}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Biểu thức SPDX (`A OR B`, `A AND B`, có ngoặc) có hợp với allow-list không: OR cần một vế, AND cần mọi vế. */
export function spdxAllowed(expression, allow) {
  const tokens = expression.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/);
  let i = 0;
  const primary = () => {
    if (tokens[i] === "(") {
      i++;
      const value = orExpr();
      if (tokens[i++] !== ")") throw new Error(`thiếu ")" trong ${expression}`);
      return value;
    }
    let id = tokens[i++];
    if (id === undefined) throw new Error(`biểu thức SPDX hỏng: ${expression}`);
    if (tokens[i] === "WITH") {
      id = `${id} WITH ${tokens[i + 1]}`;
      i += 2;
    }
    return allow.includes(id);
  };
  const andExpr = () => {
    let value = primary();
    while (tokens[i] === "AND") {
      i++;
      value = primary() && value;
    }
    return value;
  };
  const orExpr = () => {
    let value = andExpr();
    while (tokens[i] === "OR") {
      i++;
      value = andExpr() || value;
    }
    return value;
  };
  const value = orExpr();
  if (i !== tokens.length) throw new Error(`biểu thức SPDX hỏng: ${expression}`);
  return value;
}

/** Gộp output JSON của nhiều lần chạy cargo-about: mỗi văn bản giấy phép một mục, kèm danh sách crate dùng nó. */
export function mergeAbout(reports) {
  const byText = new Map();
  for (const report of reports) {
    for (const license of report.licenses) {
      const key = `${license.id}\n${license.text}`;
      const entry = byText.get(key) ?? { id: license.id, name: license.name, text: license.text, crates: new Set() };
      for (const use of license.used_by) entry.crates.add(`${use.crate.name} ${use.crate.version}`);
      byText.set(key, entry);
    }
  }
  return [...byText.values()]
    .map((entry) => ({ ...entry, crates: [...entry.crates].sort(cmp) }))
    .sort((a, b) => cmp(a.id, b.id) || cmp(a.crates[0], b.crates[0]));
}

/** File giấy phép trong thư mục của một gói npm (LICENSE, LICENSE.md, LICENSE-MIT, LICENCE, COPYING…). */
export function licenseFiles(dir) {
  return readdirSync(dir)
    .filter((name) => /^(licen[cs]e|copying)/i.test(name))
    .sort(cmp);
}

/** Gói npm của giao diện: [{name, version, license, texts}]. Lỗi khi giấy phép ngoài allow-list hay gói không có file. */
export function npmPackages(listing, allow) {
  const errors = [];
  const packages = [];
  for (const group of Object.values(listing)) {
    for (const pkg of group) {
      if (!spdxAllowed(pkg.license, allow)) errors.push(`${pkg.name}: giấy phép ${pkg.license} không có trong deny.toml`);
      const dir = pkg.paths[0];
      if (!existsSync(dir)) {
        errors.push(`${pkg.name}: không thấy ${dir} (chạy pnpm install --frozen-lockfile trước)`);
        continue;
      }
      const files = licenseFiles(dir);
      if (files.length === 0) errors.push(`${pkg.name}: không có file giấy phép trong ${dir}`);
      packages.push({
        name: pkg.name,
        version: pkg.versions.join(", "),
        license: pkg.license,
        texts: files.map((file) => readFileSync(join(dir, file), "utf8")),
      });
    }
  }
  packages.sort((a, b) => cmp(a.name, b.name));
  return { packages, errors };
}

/** Thư viện C/C++ và model: [{title, files: [đường dẫn]}] hoặc [{title, text}]. */
export function nativeComponents(llamaSrc, llamaTag) {
  const items = [
    {
      title: "whisper.cpp 1.8.3 and ggml (MIT) - in asr-worker",
      files: [join(root, "third_party/whisper-rs-sys/whisper.cpp/LICENSE")],
    },
  ];
  if (llamaSrc) {
    const at = (path) => join(llamaSrc, path);
    items.push(
      { title: `llama.cpp ${llamaTag} and ggml (MIT) - in llama-server`, files: [at("LICENSE")] },
      { title: "cpp-httplib (MIT) - in llama-server", files: [at("vendor/cpp-httplib/LICENSE")] },
      { title: "nlohmann/json (MIT) - in llama-server", files: [at("licenses/LICENSE-jsonhpp")] },
      { title: "xxHash (BSD-2-Clause) - in llama-server", files: [at("vendor/hash/xxhash/LICENSE")] },
      { title: "rotate-bits (MIT) - in llama-server", files: [at("vendor/hash/rotate-bits/LICENSE.md")] },
      {
        title: "Public domain components in llama-server",
        text:
          "stb_image (public domain or MIT), miniaudio (public domain or MIT-0), subprocess.h by sheredom (Unlicense),\n" +
          "SHA-1 by Steve Reid (public domain), SHA-256 by Igor Pavlov (public domain).\n",
      },
    );
  }
  items.push(
    {
      title: "Hy-MT2-1.8B-GGUF translation model (Apache-2.0), Tencent",
      files: [join(root, "licenses/models/Hy-MT2-LICENSE.txt")],
    },
    { title: "Whisper model weights (MIT), OpenAI", files: [join(root, "licenses/models/whisper-LICENSE.txt")] },
    { title: "Silero VAD v6.2.3 (MIT)", files: [join(root, "licenses/models/silero-vad-LICENSE.txt")] },
  );
  return items;
}

const RULE = "=".repeat(78);
const LINE = "-".repeat(78);

/** Văn bản THIRD_PARTY_NOTICES. */
export function renderNotices({ rust, npm, native }) {
  const out = [];
  out.push("AI Translator - third-party software notices");
  out.push("Generated by scripts/release/notices.mjs from Cargo.lock, pnpm-lock.yaml and the pinned native sources.");
  out.push("");
  out.push(RULE, `Rust crates (${rust.length} license texts)`, RULE, "");
  for (const license of rust) {
    out.push(LINE, `${license.name} (${license.id})`, `Used by: ${license.crates.join(", ")}`, LINE, "");
    out.push(license.text.trim(), "");
  }
  out.push(RULE, `JavaScript packages (${npm.length})`, RULE, "");
  for (const pkg of npm) {
    out.push(LINE, `${pkg.name} ${pkg.version} (${pkg.license})`, LINE, "");
    for (const text of pkg.texts) out.push(text.trim(), "");
  }
  out.push(RULE, "Native libraries and models", RULE, "");
  for (const item of native) {
    out.push(LINE, item.title, LINE, "");
    const texts = item.text !== undefined ? [item.text] : item.files.map((file) => readFileSync(file, "utf8"));
    for (const text of texts) out.push(text.trim(), "");
  }
  return `${out.join("\n")}\n`;
}

function cargoAbout(manifest) {
  const json = execFileSync(
    "cargo",
    ["about", "generate", "--format", "json", "--frozen", "--fail", "--all-features", "-c", "about.toml", "-m", manifest],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return JSON.parse(json);
}

function versionsEnv() {
  const env = {};
  for (const line of readFileSync(join(root, "scripts/release/versions.env"), "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

export function main(argv) {
  const args = [...argv];
  const outIndex = args.indexOf("--out");
  if (outIndex < 0 || !args[outIndex + 1]) throw new Error("thiếu --out <file>");
  const out = args[outIndex + 1];
  const llamaIndex = args.indexOf("--llama-src");
  const noLlama = args.includes("--no-llama");
  if ((llamaIndex < 0) === !noLlama) throw new Error("cần đúng một trong --llama-src <thư mục> và --no-llama");
  const llamaSrc = llamaIndex >= 0 ? args[llamaIndex + 1] : null;
  const env = versionsEnv();
  if (llamaSrc) {
    const head = execFileSync("git", ["-C", llamaSrc, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (head !== env.LLAMA_CPP_COMMIT) throw new Error(`llama.cpp ở ${head}, versions.env khóa ${env.LLAMA_CPP_COMMIT}`);
  }

  const allow = tomlStringArray(readFileSync(join(root, "deny.toml"), "utf8"), "licenses", "allow");
  const accepted = tomlStringArray(readFileSync(join(root, "about.toml"), "utf8"), "", "accepted");
  const errors = [];
  if (JSON.stringify([...accepted].sort()) !== JSON.stringify([...allow].sort())) {
    errors.push("about.toml `accepted` khác deny.toml `[licenses] allow`");
  }
  const rust = mergeAbout([cargoAbout("src-tauri/Cargo.toml"), cargoAbout("crates/asr-worker/Cargo.toml")]);
  const listing = JSON.parse(
    execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" }),
  );
  const npm = npmPackages(listing, allow);
  errors.push(...npm.errors);
  const native = nativeComponents(llamaSrc, env.LLAMA_CPP_TAG);
  for (const item of native) for (const file of item.files ?? []) if (!existsSync(file)) errors.push(`thiếu ${file}`);
  if (errors.length === 0) {
    writeFileSync(out, renderNotices({ rust, npm: npm.packages, native }));
    const crates = new Set(rust.flatMap((license) => license.crates)).size;
    console.log(
      `${out}: ${rust.length} văn bản giấy phép Rust (${crates} crate), ${npm.packages.length} gói npm, ${native.length} mục C/C++ và model`,
    );
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const errors = main(process.argv.slice(2));
    for (const error of errors) console.error(`LỖI: ${error}`);
    process.exitCode = errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^ℹ (tests|pass|fail)'`

Expected (lúc lập kế hoạch):
```text
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

- [ ] **Step 5: Sinh file thật** (dùng mã nguồn llama.cpp đã clone ở Task 3; chạy lần hai phải ra đúng file như lần đầu)

Run:
```bash
node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --llama-src target/release-work/llama.cpp 2>&1 | grep -E '^(THIRD_PARTY|LỖI)'
shasum -a 256 THIRD_PARTY_NOTICES.txt | cut -c1-16
node scripts/release/notices.mjs --out target/release-work/notices-again.txt --llama-src target/release-work/llama.cpp >/dev/null 2>&1
cmp THIRD_PARTY_NOTICES.txt target/release-work/notices-again.txt && echo "chạy lại ra đúng file cũ"
grep -n -E '^(Rust crates|JavaScript packages|Native libraries)' THIRD_PARTY_NOTICES.txt
grep -c 'K.Kosako' THIRD_PARTY_NOTICES.txt
```

Expected (lúc lập kế hoạch. Dòng `warning: config found for a crate not present in the graph` (đã lọc ở đây) là của lần chạy cho `asr-worker`, vì `onig_sys` chỉ có trong app):
```text
THIRD_PARTY_NOTICES.txt: 125 văn bản giấy phép Rust (464 crate), 5 gói npm, 10 mục C/C++ và model
bb153e9b9f7ffe08
chạy lại ra đúng file cũ
5:Rust crates (125 license texts)
11592:JavaScript packages (5)
11924:Native libraries and models
1
```

- [ ] **Step 5b: CI dùng `--no-llama` khi chưa clone llama.cpp**

Run:
```bash
node scripts/release/notices.mjs --out target/release-work/notices-ci.txt --no-llama 2>&1 | tail -1
node scripts/release/notices.mjs --out x.txt 2>&1; echo "exit=$?"
```

Expected (lúc lập kế hoạch):
```text
target/release-work/notices-ci.txt: 125 văn bản giấy phép Rust (464 crate), 5 gói npm, 4 mục C/C++ và model
LỖI: cần đúng một trong --llama-src <thư mục> và --no-llama
exit=1
```

- [ ] **Step 6: Giao diện: test trước**

Tạo `src/lib/notices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadNotices } from "./notices";

describe("loadNotices", () => {
  it("trả văn bản của file THIRD_PARTY_NOTICES đã đóng gói", async () => {
    await expect(loadNotices({ "/THIRD_PARTY_NOTICES.txt": async () => "AI Translator - notices\n" })).resolves.toBe(
      "AI Translator - notices\n",
    );
  });

  it("bản build không có file (bản dev chưa sinh) thì trả null", async () => {
    await expect(loadNotices({})).resolves.toBeNull();
  });

  it("file rỗng hay đọc lỗi cũng trả null, không ném lỗi ra giao diện", async () => {
    await expect(loadNotices({ "/THIRD_PARTY_NOTICES.txt": async () => "  \n" })).resolves.toBeNull();
    await expect(
      loadNotices({
        "/THIRD_PARTY_NOTICES.txt": async () => {
          throw new Error("chunk lỗi");
        },
      }),
    ).resolves.toBeNull();
  });
});
```

Run: `pnpm test 2>&1 | grep -E "Cannot find module|Test Files|Tests "`

Expected (lúc lập kế hoạch: chưa có module):
```text
Error: Cannot find module './notices' imported from /Users/dtphong/Desktop/software_business/meeting-translator/src/lib/notices.test.ts
 Test Files  1 failed | 6 passed (7)
      Tests  65 passed (65)
```

- [ ] **Step 7: Giao diện: code**

Tạo `src/lib/notices.ts`:

```ts
// Danh sách giấy phép bên thứ ba (spec §10.1): file THIRD_PARTY_NOTICES.txt ở gốc repo do scripts/release/notices.mjs
// sinh lúc build bản phát hành, và Vite đóng gói nó thành một chunk riêng, chỉ tải khi mở màn hình Giới thiệu.
// Bản dev chưa sinh file thì không có chunk nào.

/** Kết quả của `import.meta.glob(…, { query: "?raw", import: "default" })`: đường dẫn → hàm tải văn bản. */
export type NoticeLoaders = Record<string, () => Promise<string>>;

/** Văn bản giấy phép, hoặc null khi bản build không có file (hay file rỗng, hay tải lỗi). */
export async function loadNotices(loaders: NoticeLoaders): Promise<string | null> {
  const load = Object.values(loaders)[0];
  if (!load) return null;
  try {
    const text = await load();
    return text.trim() === "" ? null : text;
  } catch {
    return null;
  }
}
```

Tạo `src/windows/main/screens/Licenses.tsx`:

```tsx
import { useEffect, useState } from "react";
import { loadNotices } from "../../../lib/notices";
import { useT } from "../appStore";

// File sinh lúc build bản phát hành (scripts/release/notices.mjs); không có thì `notices` rỗng.
const notices = import.meta.glob<string>("/THIRD_PARTY_NOTICES.txt", { query: "?raw", import: "default" });

// Danh sách giấy phép mã nguồn mở ở màn hình Giới thiệu (§4.3, §10.1).
export function Licenses() {
  const t = useT();
  // undefined: đang tải; null: bản này không có danh sách.
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadNotices(notices).then((value) => {
      if (alive) setText(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (text === undefined) return <p className="hint">{t("about.licensesLoading")}</p>;
  if (text === null) return <p className="hint">{t("about.licensesMissing")}</p>;
  return (
    <>
      <p className="hint">{t("about.licensesIntro")}</p>
      <pre
        tabIndex={0}
        aria-label={t("about.licenses")}
        style={{ maxHeight: "40vh", overflow: "auto", whiteSpace: "pre-wrap", fontSize: "0.8em" }}
      >
        {text}
      </pre>
    </>
  );
}
```

Phần thay đổi của `src/windows/main/screens/About.tsx` làm bằng script node, không dùng `git apply`: script chạy được cả khi 03 đã thêm bảng debug vào file này (xem "File giao nhau với 03 và 04").

Run:
```bash
node - <<'EOF'
const fs = require("node:fs");
const path = "src/windows/main/screens/About.tsx";
let s = fs.readFileSync(path, "utf8");
const edits = [
  ['import { useApp, useT } from "../appStore";\n', 'import { useApp, useT } from "../appStore";\nimport { Licenses } from "./Licenses";\n'],
  ["// Kế hoạch 07 thêm danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES`.", "// Danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES` (kế hoạch 07a, `Licenses.tsx`)."],
  ['        <p className="hint">{t("about.licensesPending")}</p>\n', "        <Licenses />\n"],
];
for (const [from, to] of edits) {
  if (s.split(from).length !== 2) throw new Error(`About.tsx: không thấy đúng một chỗ: ${from.trim()}`);
  s = s.replace(from, to);
}
fs.writeFileSync(path, s);
EOF
git diff --stat src/windows/main/screens/About.tsx
```

Expected (lúc lập kế hoạch):
```text
 src/windows/main/screens/About.tsx | 5 +++--
 1 file changed, 3 insertions(+), 2 deletions(-)
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 4443ac2edbb1943782834810b547e6ff02b0cc8a..598267ded93a8c10bec4c1b7f07bc6e4213e5259 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -101,7 +101,9 @@ export const en = {
   "about.openLogs": "Open log folder",
   "about.logsHint": "Logs stay on this computer and never contain what was said. Send them to support only if you want to.",
   "about.licenses": "Open-source licenses",
-  "about.licensesPending": "The list of open-source licenses will appear here.",
+  "about.licensesIntro": "AI Translator uses the open-source software and models below, under their licenses.",
+  "about.licensesLoading": "Loading the list of licenses…",
+  "about.licensesMissing": "This build has no list of licenses. Release builds include it.",
   "about.trademark": "Microsoft Teams, Zoom and Google Meet are mentioned only to describe compatibility. AI Translator is not affiliated with these companies.",
 
   "onboarding.step": "Step {n} of {total}",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 0fdb07891afb03f5dff0a9b7fb27362f66e8542a..e89df1b50efb2afcf0216d63960669e08ef9af35 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -101,7 +101,9 @@ export const vi: Record<MessageKey, string> = {
   "about.openLogs": "Mở thư mục log",
   "about.logsHint": "Log chỉ nằm trên máy này và không bao giờ chứa nội dung cuộc họp. Bạn tự gửi cho bộ phận hỗ trợ khi cần.",
   "about.licenses": "Giấy phép mã nguồn mở",
-  "about.licensesPending": "Danh sách giấy phép mã nguồn mở sẽ hiện ở đây.",
+  "about.licensesIntro": "AI Translator dùng các phần mềm mã nguồn mở và model dưới đây, theo giấy phép của từng phần.",
+  "about.licensesLoading": "Đang tải danh sách giấy phép…",
+  "about.licensesMissing": "Bản này không có danh sách giấy phép. Bản phát hành có danh sách này.",
   "about.trademark": "Microsoft Teams, Zoom và Google Meet chỉ được nhắc tới để mô tả khả năng tương thích. AI Translator không liên kết với các công ty này.",
 
   "onboarding.step": "Bước {n}/{total}",
```

Sửa `.gitignore` (áp bằng `git apply`):

```diff
diff --git a/.gitignore b/.gitignore
index 41ae472c061e86a11c93df3c9af346c503e96d99..37dc76d49b7f482d10a08aba1233af3e8cb624fc 100644
--- a/.gitignore
+++ b/.gitignore
@@ -34,3 +34,6 @@ __pycache__/
 # License server
 /server/node_modules/
 /server/.wrangler/
+
+# Danh sách giấy phép bên thứ ba, sinh lúc build bản phát hành (scripts/release/notices.mjs)
+/THIRD_PARTY_NOTICES.txt
```

- [ ] **Step 8: Chạy test và build giao diện** (có file `THIRD_PARTY_NOTICES.txt` thì Vite tách nó thành một chunk riêng; cảnh báo chunk lớn hơn 500 kB là của chunk này, chỉ tải khi mở Giới thiệu)

Run:
```bash
pnpm test 2>&1 | grep -E 'Test Files|Tests '
pnpm build 2>&1 | grep -E 'THIRD_PARTY_NOTICES|built in|error' | sed -E 's/in [0-9]+ms/in …ms/'
```

Expected (lúc lập kế hoạch):
```text
 Test Files  7 passed (7)
      Tests  68 passed (68)
dist/assets/THIRD_PARTY_NOTICES-D3Dj_cvD.js  679.27 kB │ gzip: 58.79 kB
✓ built in …ms
```

Bản không có file (như bản dev chưa chạy `notices.mjs`) cũng phải build được:

Run:
```bash
mv THIRD_PARTY_NOTICES.txt target/release-work/
pnpm build 2>&1 | grep -c THIRD_PARTY_NOTICES
mv target/release-work/THIRD_PARTY_NOTICES.txt .
```

Expected (lúc lập kế hoạch: `0`, không có chunk nào):
```text
0
```

- [ ] **Step 9: Commit** (`THIRD_PARTY_NOTICES.txt` không vào commit, `.gitignore` đã chặn)

Run:
```bash
git add .gitignore about.toml licenses/models scripts/release/notices.mjs scripts/release/notices.test.mjs src/lib/notices.ts src/lib/notices.test.ts src/windows/main/screens/Licenses.tsx src/windows/main/screens/About.tsx src/i18n/en.ts src/i18n/vi.ts
git commit -q -m "feat(release): sinh THIRD_PARTY_NOTICES từ Cargo.lock, pnpm-lock.yaml và mã nguồn C/C++ đã khóa; hiện ở màn hình Giới thiệu (§10.1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): sinh THIRD_PARTY_NOTICES từ Cargo.lock, pnpm-lock.yaml và mã nguồn C/C++ đã khóa; hiện ở màn hình Giới thiệu (§10.1)
The following paths are ignored by one of your .gitignore files:
licenses/models
hint: Use -f if you really want to add them.
hint: Disable this message with "git config set advice.addIgnoredFile false"
```

## Task 6: Đóng gói macOS

QĐ2, QĐ9, QĐ12, QĐ20. Cấu hình đóng gói riêng (`tauri.macos.json`) và script đóng gói hai phần: `build` (không cần secret) và `sign` (ký, notarize, `.dmg`, kiểm). Không có secret thì ký ad-hoc, bỏ qua notarize và chữ ký bản cập nhật.

**Files:**
- Create: `src-tauri/release/tauri.macos.json`, `scripts/release/package-macos.sh`

- [ ] **Step 1: Cấu hình và script**

Tạo `src-tauri/release/tauri.macos.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "active": true,
    "targets": ["app"],
    "category": "Productivity",
    "shortDescription": "Live translated subtitles for meetings",
    "externalBin": ["binaries/asr-worker", "binaries/llama-server"],
    "resources": {
      "../THIRD_PARTY_NOTICES.txt": "THIRD_PARTY_NOTICES.txt"
    },
    "macOS": {
      "minimumSystemVersion": "14.2",
      "hardenedRuntime": true
    }
  }
}
```

Tạo `scripts/release/package-macos.sh`:

```sh
#!/bin/sh
# Đóng gói bản phát hành macOS (arm64): `AI Translator.app` trong một `.dmg` (kế hoạch 07a; spec §6.11, §10.2, A6).
# Chạy sau build-sidecars-macos.sh (src-tauri/binaries/ có hai tiến trình phụ đã ký) và notices.mjs (THIRD_PARTY_NOTICES.txt).
#
#   scripts/release/package-macos.sh          # cả hai phần dưới đây
#   scripts/release/package-macos.sh build    # bước 1–2, không cần secret nào
#   scripts/release/package-macos.sh sign     # bước 3–6, sau `build`
#
# CI chạy `build` khi keychain còn khóa và chưa có secret nào trong môi trường, rồi mới chạy `sign` với secret, để build
# script của các crate không đọc được secret hay dùng được chứng thư (spec §10.2, rủi ro chuỗi cung ứng).
#
# Thứ tự, vì app kiểm SHA-256 của tiến trình phụ theo bảng build sẵn (build.rs):
#   1. `tauri build --no-sign`: bundler của Tauri ký lại mọi `externalBin` bằng `codesign --force` nếu được ký, làm SHA-256
#      đổi; nên Tauri không ký gì, tiến trình phụ đã ký sẵn ở build-sidecars-macos.sh.
#   2. Kiểm bản đóng gói: tiến trình phụ trong Contents/MacOS đúng từng byte như binaries/, không có thư viện lạ, và file
#      chạy của app mang bảng SHA-256 của chúng với tên sau khi đóng gói.
#   3. Ký app (không `--deep`, để chữ ký của tiến trình phụ giữ nguyên), hardened runtime; kiểm lại bước 2.
#   4. Có thông tin notarize thì notarize app và staple.
#   5. Tạo `.dmg` (nén LZMA, có lối tắt Applications), ký, notarize và staple nếu có thông tin.
#   6. Kiểm dung lượng ≤ 60 000 000 byte (§6.11), ghi SHA-256 (§10.2); có khóa ký bản cập nhật thì tạo và ký `.app.tar.gz`.
#
# Biến môi trường (CI đặt từ secret; không đặt thì bỏ qua bước tương ứng, bản ra chỉ dùng thử nội bộ):
#   MT_SIGN_IDENTITY        chứng thư Developer ID Application; không đặt thì ký ad-hoc
#   MT_KEYCHAIN             keychain chứa chứng thư đó (macos-keychain.sh); không đặt thì codesign tìm ở keychain mặc định
#   APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER   khóa App Store Connect API để notarize
#   TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD   khóa ký bản cập nhật (Q17 của kế hoạch 00)
#   MT_RELEASE_OUT          thư mục ra, mặc định target/release-out
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
triple=aarch64-apple-darwin
target="${CARGO_TARGET_DIR:-$root/target}"
identity="${MT_SIGN_IDENTITY:--}"
out="${MT_RELEASE_OUT:-$target/release-out}"
check="$root/scripts/release/release-check.mjs"
version=$(node -p "require('$root/src-tauri/tauri.conf.json').version")
product=$(node -p "require('$root/src-tauri/tauri.conf.json').productName")
app="$target/release/bundle/macos/$product.app"
dmg="$out/${product}_${version}_aarch64.dmg"

phase="${1:-all}"
case "$phase" in
  all | build | sign) ;;
  *)
    echo "phần không rõ: $phase (dùng build, sign, hoặc để trống)" >&2
    exit 1
    ;;
esac

for f in "asr-worker-$triple" "llama-server-$triple"; do
  if [ ! -f "$root/src-tauri/binaries/$f" ]; then
    echo "thiếu src-tauri/binaries/$f: chạy scripts/release/build-sidecars-macos.sh trước" >&2
    exit 1
  fi
done
if [ ! -f "$root/THIRD_PARTY_NOTICES.txt" ]; then
  echo "thiếu THIRD_PARTY_NOTICES.txt: chạy scripts/release/notices.mjs trước" >&2
  exit 1
fi

notarize() {
  if [ -z "${APPLE_API_KEY_PATH:-}" ]; then
    echo "chưa có khóa notarize: bỏ qua notarize $1"
    return 0
  fi
  xcrun notarytool submit "$1" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
  xcrun stapler staple "$2"
  xcrun stapler validate "$2"
}

sign() {
  if [ "$identity" = "-" ]; then
    codesign --force --sign - "$@"
  else
    codesign --force --sign "$identity" ${MT_KEYCHAIN:+--keychain "$MT_KEYCHAIN"} --timestamp "$@"
  fi
}

if [ "$phase" != "sign" ]; then
  echo "== tauri build (không ký)"
  (cd "$root" && pnpm tauri build --ci --no-sign --bundles app --config src-tauri/release/tauri.macos.json)
  node "$check" bundle "$root/src-tauri/binaries" "$app/Contents/MacOS" --target "$triple"
  node "$check" embedded "$root/src-tauri/binaries" "$app/Contents/MacOS/meeting-translator" --target "$triple"
  if [ "$phase" = "build" ]; then
    exit 0
  fi
elif [ ! -d "$app" ]; then
  echo "thiếu $app: chạy package-macos.sh build trước" >&2
  exit 1
fi

echo "== ký app"
sign --options runtime "$app"
codesign --verify --strict --deep "$app"
codesign -dv "$app" 2>&1 | grep -E '^(Identifier=|CodeDirectory |TeamIdentifier=)'
node "$check" bundle "$root/src-tauri/binaries" "$app/Contents/MacOS" --target "$triple"
mkdir -p "$out"
if [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  ditto -c -k --keepParent "$app" "$out/app-notarize.zip"
  notarize "$out/app-notarize.zip" "$app"
  rm "$out/app-notarize.zip"
fi

echo "== dmg"
stage="$out/dmg-stage"
rm -rf "$stage" "$dmg"
mkdir -p "$stage"
ditto "$app" "$stage/$product.app"
ln -s /Applications "$stage/Applications"
hdiutil create -quiet -volname "$product" -srcfolder "$stage" -fs HFS+ -format ULMO "$dmg"
rm -rf "$stage"
hdiutil verify -quiet "$dmg"
if [ "$identity" != "-" ]; then
  sign "$dmg"
  notarize "$dmg" "$dmg"
fi
node "$check" size "$dmg" --max-bytes 60000000
node "$check" sha256sums "$dmg" --out "$out/SHA256SUMS-macos.txt"

if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "== bản cập nhật (.app.tar.gz và chữ ký)"
  tar -czf "$out/$product.app.tar.gz" -C "$(dirname "$app")" "$product.app"
  (cd "$root" && pnpm tauri signer sign --app-version "$version" "$out/$product.app.tar.gz")
else
  echo "chưa có khóa ký bản cập nhật: bỏ qua .app.tar.gz"
fi
```

Run: `chmod +x scripts/release/package-macos.sh`

- [ ] **Step 2: Đóng gói thật** (build app release với LTO; lúc lập kế hoạch khoảng 2–3 phút)

Run:
```bash
scripts/release/package-macos.sh 2>&1 | sed -n '/Finished `release`/,$p' | sed -E 's/in [0-9]+m [0-9]+s/in …/'
```

Expected (lúc lập kế hoạch; SHA-256 của `.dmg` đổi mỗi lần tạo (dấu thời gian), số byte chênh vài byte):
```text
    Finished `release` profile [optimized] target(s) in …
       Built application at: /Users/dtphong/Desktop/software_business/meeting-translator/target/release/meeting-translator
    Bundling AI Translator.app (/Users/dtphong/Desktop/software_business/meeting-translator/target/release/bundle/macos/AI Translator.app)
        Warn Skipping signing due to --no-sign flag.
    Finished 1 bundle at:
        /Users/dtphong/Desktop/software_business/meeting-translator/target/release/bundle/macos/AI Translator.app (25.07 MiB)

bản đóng gói khớp 2 file của binaries/
meeting-translator mang bảng SHA-256 của 2 file, đúng tên sau khi đóng gói
== ký app
/Users/dtphong/Desktop/software_business/meeting-translator/target/release/bundle/macos/AI Translator.app: replacing existing signature
Identifier=com.aitranslator.desktop
CodeDirectory v=20500 size=17241 flags=0x10002(adhoc,runtime) hashes=532+3 location=embedded
TeamIdentifier=not set
bản đóng gói khớp 2 file của binaries/
== dmg
AI Translator_0.1.0_aarch64.dmg: 7571752 byte (7.6 MB), ngưỡng 60000000 byte
bc3c3047753ce0887be8b8ee9e282080060aa27615c5d537e146e0292f59bbbc  AI Translator_0.1.0_aarch64.dmg
chưa có khóa ký bản cập nhật: bỏ qua .app.tar.gz
```

Run:
```bash
a="target/release/bundle/macos/AI Translator.app"
ls "$a/Contents/MacOS" "$a/Contents/Resources"
plutil -p "$a/Contents/Info.plist" | grep -E 'LSMinimumSystemVersion|CFBundleIdentifier|CFBundleExecutable|NSAudioCaptureUsageDescription' | cut -c1-90
hdiutil imageinfo target/release-out/*.dmg | grep -E '^Format:'
ls target/release-out
```

Expected (lúc lập kế hoạch):
```text
target/release/bundle/macos/AI Translator.app/Contents/MacOS:
asr-worker
llama-server
meeting-translator

target/release/bundle/macos/AI Translator.app/Contents/Resources:
THIRD_PARTY_NOTICES.txt
en.lproj
icon.icns
vi.lproj
  "CFBundleExecutable" => "meeting-translator"
  "CFBundleIdentifier" => "com.aitranslator.desktop"
  "LSMinimumSystemVersion" => "14.2"
  "NSAudioCaptureUsageDescription" => "AI Translator captures the audio your Mac is playin
Format: ULMO
AI Translator_0.1.0_aarch64.dmg
SHA256SUMS-macos.txt
```

- [ ] **Step 3: Phần `build` và `sign` chạy riêng được, tham số sai thì báo**

Run:
```bash
scripts/release/package-macos.sh bogus; echo "exit=$?"
scripts/release/package-macos.sh build 2>&1 | tail -2
scripts/release/package-macos.sh sign 2>&1 | grep -E '^(== |bản đóng gói|AI Translator_)' | cut -c1-60
```

Expected (lúc lập kế hoạch):
```text
phần không rõ: bogus (dùng build, sign, hoặc để trống)
exit=1
bản đóng gói khớp 2 file của binaries/
meeting-translator mang bảng SHA-256 của 2 file, đúng tên sau khi đóng gói
== ký app
bản đóng gói khớp 2 file của binaries/
== dmg
AI Translator_0.1.0_aarch64.dmg: 7572980 byte (7.6 MB), ngưỡ
```

- [ ] **Step 4: Commit**

Run:
```bash
git add src-tauri/release/tauri.macos.json scripts/release/package-macos.sh
git commit -q -m "feat(release): đóng gói macOS: .app không để Tauri ký lại tiến trình phụ, ký app, .dmg LZMA, notarize, kiểm dung lượng, SHA-256, chữ ký bản cập nhật (§6.11, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): đóng gói macOS: .app không để Tauri ký lại tiến trình phụ, ký app, .dmg LZMA, notarize, kiểm dung lượng, SHA-256, chữ ký bản cập nhật (§6.11, §10.2)
```

## Task 7: Cài protoc và Vulkan SDK cho CI; `versions.mjs`

QĐ7, QĐ8. `install-tools.mjs` tải công cụ build từ bản khóa trong `versions.env` và kiểm SHA-256; `versions.mjs` đọc `versions.env` cho các script Node (thay hàm riêng trong `notices.mjs`).

**Files:**
- Create: `scripts/release/tools.test.mjs`, `scripts/release/versions.mjs`, `scripts/release/install-tools.mjs`
- Modify: `scripts/release/notices.mjs`

- [ ] **Step 1: Test trước**

Tạo `scripts/release/tools.test.mjs`:

```js
// Test của versions.mjs và install-tools.mjs (chạy được trên Mac): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { shaErrors, toolAsset } from "./install-tools.mjs";
import { parseVersions, readVersions } from "./versions.mjs";

const versions = readVersions();

test("versions.env: mọi khóa cần có, commit llama.cpp đủ 40 ký tự", () => {
  for (const key of ["LLAMA_CPP_TAG", "LLAMA_CPP_COMMIT", "LLAMA_CPP_BUILD_NUMBER", "PROTOC_VERSION", "VULKAN_SDK_VERSION"]) {
    assert.ok(versions[key], key);
  }
  assert.match(versions.LLAMA_CPP_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(`b${versions.LLAMA_CPP_BUILD_NUMBER}`, versions.LLAMA_CPP_TAG);
  assert.match(versions.PROTOC_SHA256_OSX_AARCH64, /^[0-9a-f]{64}$/);
  assert.match(versions.PROTOC_SHA256_WIN64, /^[0-9a-f]{64}$/);
  assert.deepEqual(parseVersions("# x\nA=1\r\nB=\n"), { A: "1", B: "" });
});

test("protoc và Vulkan SDK: đúng URL theo nền tảng; nền tảng khác thì báo lỗi", () => {
  assert.deepEqual(toolAsset("protoc", "darwin", "arm64", versions), {
    url: `https://github.com/protocolbuffers/protobuf/releases/download/v${versions.PROTOC_VERSION}/protoc-${versions.PROTOC_VERSION}-osx-aarch_64.zip`,
    file: `protoc-${versions.PROTOC_VERSION}-osx-aarch_64.zip`,
    sha256: versions.PROTOC_SHA256_OSX_AARCH64,
  });
  assert.equal(toolAsset("protoc", "win32", "x64", versions).sha256, versions.PROTOC_SHA256_WIN64);
  assert.equal(
    toolAsset("vulkan-sdk", "win32", "x64", versions).url,
    `https://sdk.lunarg.com/sdk/download/${versions.VULKAN_SDK_VERSION}/windows/vulkansdk-windows-X64-${versions.VULKAN_SDK_VERSION}.exe`,
  );
  assert.throws(() => toolAsset("protoc", "linux", "x64", versions), /chưa khóa bản cho linux-x64/);
  assert.throws(() => toolAsset("vulkan-sdk", "darwin", "arm64", versions), /chỉ cần trên Windows/);
});

test("SHA-256 sai hay chưa khóa đều dừng", () => {
  assert.deepEqual(shaErrors("a.zip", "ab", "ab"), []);
  assert.deepEqual(shaErrors("a.zip", "ab", "cd"), ["a.zip: SHA-256 ab, versions.env khóa cd"]);
  assert.deepEqual(shaErrors("a.exe", "ab", ""), ["a.exe: versions.env chưa có SHA-256; SHA-256 của file vừa tải là ab"]);
});
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^ℹ (tests|pass|fail)'
```

Expected (lúc lập kế hoạch: chưa có module):
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/install-tools.mjs' imported from /Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/tools.test.mjs
ℹ tests 21
ℹ pass 20
ℹ fail 1
```

- [ ] **Step 2: Code**

Tạo `scripts/release/versions.mjs`:

```js
// Đọc scripts/release/versions.env (dòng `TÊN=giá trị`, như `sh` nạp) cho các script Node của kế hoạch 07a.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

export function parseVersions(text) {
  const versions = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) versions[match[1]] = match[2].trim();
  }
  return versions;
}

export function readVersions() {
  return parseVersions(readFileSync(join(root, "scripts/release/versions.env"), "utf8"));
}
```

Tạo `scripts/release/install-tools.mjs`:

```js
#!/usr/bin/env node
// Cài công cụ build cho CI từ bản đã khóa trong versions.env, có kiểm SHA-256 (kế hoạch 07a; spec §6.12, §10.2).
//
//   node scripts/release/install-tools.mjs protoc --dest <thư mục>      # macOS arm64 hoặc Windows x64
//   node scripts/release/install-tools.mjs vulkan-sdk                   # Windows x64, cài vào C:\VulkanSDK\<phiên bản>
//
// Trong GitHub Actions (có GITHUB_PATH, GITHUB_ENV), thư mục bin được thêm vào PATH của các bước sau, và Vulkan SDK đặt
// biến VULKAN_SDK. Vulkan SDK chưa có SHA-256 trong versions.env thì in SHA-256 của file vừa tải rồi dừng: người chốt so
// với trang tải của LunarG rồi ghi vào versions.env (Task 12 của kế hoạch 07a).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { readVersions } from "./versions.mjs";

/** File cần tải của một công cụ trên một nền tảng: { url, file, sha256 } (sha256 có thể rỗng). */
export function toolAsset(tool, platform, arch, versions) {
  if (tool === "protoc") {
    const v = versions.PROTOC_VERSION;
    const [name, key] =
      platform === "darwin" && arch === "arm64"
        ? ["osx-aarch_64", "PROTOC_SHA256_OSX_AARCH64"]
        : platform === "win32" && arch === "x64"
          ? ["win64", "PROTOC_SHA256_WIN64"]
          : [null, null];
    if (!name) throw new Error(`protoc: chưa khóa bản cho ${platform}-${arch}`);
    const file = `protoc-${v}-${name}.zip`;
    return {
      url: `https://github.com/protocolbuffers/protobuf/releases/download/v${v}/${file}`,
      file,
      sha256: versions[key],
    };
  }
  if (tool === "vulkan-sdk") {
    if (platform !== "win32" || arch !== "x64") throw new Error("vulkan-sdk: chỉ cần trên Windows x64");
    const v = versions.VULKAN_SDK_VERSION;
    const file = `vulkansdk-windows-X64-${v}.exe`;
    return { url: `https://sdk.lunarg.com/sdk/download/${v}/windows/${file}`, file, sha256: versions.VULKAN_SDK_SHA256 };
  }
  throw new Error(`công cụ không rõ: ${tool}`);
}

/** Lỗi khi SHA-256 của file tải về không khớp bản đã khóa (hoặc chưa khóa). */
export function shaErrors(file, actual, expected) {
  if (!expected) return [`${file}: versions.env chưa có SHA-256; SHA-256 của file vừa tải là ${actual}`];
  if (actual !== expected) return [`${file}: SHA-256 ${actual}, versions.env khóa ${expected}`];
  return [];
}

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "release-tools" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function exportPath(dir) {
  if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, `${dir}\n`);
}

function exportEnv(name, value) {
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

export async function main(argv, { platform = process.platform, arch = process.arch } = {}) {
  const [tool, ...rest] = argv;
  const versions = readVersions();
  const asset = toolAsset(tool, platform, arch, versions);
  const bytes = await download(asset.url);
  const actual = createHash("sha256").update(bytes).digest("hex");
  const errors = shaErrors(asset.file, actual, asset.sha256);
  if (errors.length > 0) return errors;
  if (tool === "protoc") {
    const i = rest.indexOf("--dest");
    if (i < 0 || !rest[i + 1]) throw new Error("protoc: thiếu --dest <thư mục>");
    const dest = rest[i + 1];
    mkdirSync(dest, { recursive: true });
    const zip = join(dest, asset.file);
    writeFileSync(zip, bytes);
    // `tar` của macOS và Windows 10+ (bsdtar) đọc được zip.
    execFileSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
    const bin = join(dest, "bin");
    exportPath(bin);
    console.log(`protoc ${versions.PROTOC_VERSION}: ${bin}`);
  } else {
    const installer = join(process.env.RUNNER_TEMP ?? ".", asset.file);
    writeFileSync(installer, bytes);
    execFileSync(installer, ["--accept-licenses", "--default-answer", "--confirm-command", "install"], { stdio: "inherit" });
    const sdk = `C:\\VulkanSDK\\${versions.VULKAN_SDK_VERSION}`;
    exportEnv("VULKAN_SDK", sdk);
    exportPath(`${sdk}\\Bin`);
    console.log(`Vulkan SDK ${versions.VULKAN_SDK_VERSION}: ${sdk}`);
  }
  return [];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (errors) => {
      for (const error of errors) console.error(`LỖI: ${error}`);
      process.exitCode = errors.length === 0 ? 0 : 1;
    },
    (error) => {
      console.error(`LỖI: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
```

Sửa `scripts/release/notices.mjs` (áp bằng `git apply`):

```diff
diff --git a/scripts/release/notices.mjs b/scripts/release/notices.mjs
index 83bd5528ffa90f5620a3b2b93ac8850f1bca9bdb..e53ff2a7226078adcbedde69369e33466aeb703a 100644
--- a/scripts/release/notices.mjs
+++ b/scripts/release/notices.mjs
@@ -18,7 +18,7 @@ import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
 import { join } from "node:path";
 import { pathToFileURL } from "node:url";
 
-const root = join(import.meta.dirname, "..", "..");
+import { readVersions, root } from "./versions.mjs";
 
 /** So chuỗi theo mã ký tự, không theo locale, để thứ tự giống nhau trên mọi máy. */
 const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
@@ -197,15 +197,6 @@ function cargoAbout(manifest) {
   return JSON.parse(json);
 }
 
-function versionsEnv() {
-  const env = {};
-  for (const line of readFileSync(join(root, "scripts/release/versions.env"), "utf8").split("\n")) {
-    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
-    if (match) env[match[1]] = match[2];
-  }
-  return env;
-}
-
 export function main(argv) {
   const args = [...argv];
   const outIndex = args.indexOf("--out");
@@ -215,7 +206,7 @@ export function main(argv) {
   const noLlama = args.includes("--no-llama");
   if ((llamaIndex < 0) === !noLlama) throw new Error("cần đúng một trong --llama-src <thư mục> và --no-llama");
   const llamaSrc = llamaIndex >= 0 ? args[llamaIndex + 1] : null;
-  const env = versionsEnv();
+  const env = readVersions();
   if (llamaSrc) {
     const head = execFileSync("git", ["-C", llamaSrc, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
     if (head !== env.LLAMA_CPP_COMMIT) throw new Error(`llama.cpp ở ${head}, versions.env khóa ${env.LLAMA_CPP_COMMIT}`);
```

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^ℹ (tests|pass|fail)'`

Expected (lúc lập kế hoạch):
```text
ℹ tests 23
ℹ pass 23
ℹ fail 0
```

- [ ] **Step 3: Cài protoc thật** (tải từ GitHub, kiểm SHA-256)

Run:
```bash
node scripts/release/install-tools.mjs protoc --dest target/release-work/protoc && target/release-work/protoc/bin/protoc --version
```

Expected (lúc lập kế hoạch):
```text
protoc 36.2: target/release-work/protoc/bin
libprotoc 36.2
```

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/release/tools.test.mjs scripts/release/versions.mjs scripts/release/install-tools.mjs scripts/release/notices.mjs
git commit -q -m "feat(release): cài protoc và Vulkan SDK cho CI từ bản đã khóa, kiểm SHA-256; versions.mjs dùng chung (§6.12, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): cài protoc và Vulkan SDK cho CI từ bản đã khóa, kiểm SHA-256; versions.mjs dùng chung (§6.12, §10.2)
```

## Task 8: Đóng gói Windows

QĐ3, QĐ5, QĐ13, QĐ14, QĐ15. Ba tiến trình phụ và DLL của `llama-server` build trên runner Windows (`build-sidecars-windows.mjs`), ký bằng lệnh của dịch vụ ký (`sign-windows.mjs`), đóng gói NSIS (`package-windows.mjs`). Trên Mac chỉ chạy được test của phần thuần, `--dry-run`, và kiểm cấu hình bằng tauri-build (`check-release-config.sh`); chạy thật ở Task 14 (runner) và Task 16 (máy Windows).

**Files:**
- Create: `scripts/release/windows.test.mjs`, `scripts/release/build-sidecars-windows.mjs`, `scripts/release/sign-windows.mjs`, `scripts/release/package-windows.mjs`, `src-tauri/release/tauri.windows.json`, `src-tauri/release/nsis-hooks.nsh`, `scripts/release/check-release-config.sh`

- [ ] **Step 1: Test trước**

Tạo `scripts/release/windows.test.mjs`:

```js
// Test phần thuần của các script Windows (chạy được trên Mac): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { TRIPLE, mergeEnv, parseSetOutput, steps } from "./build-sidecars-windows.mjs";
import { findInstaller, signConfig, tauriArgs } from "./package-windows.mjs";
import { signCommandLine } from "./sign-windows.mjs";
import { readVersions } from "./versions.mjs";

const versions = readVersions();

test("build Windows: CRT tĩnh, giữ cờ DEPENDENTLOADFLAG, đủ cờ llama.cpp đã chốt", () => {
  const list = steps({ work: "W", target: "T", out: "O", versions });
  const cargo = list.filter((s) => s.run?.[0] === "cargo");
  assert.deepEqual(
    cargo.map((s) => s.run.at(-1)),
    ["vulkan,shared-encode", "shared-encode"],
  );
  for (const s of cargo) {
    assert.equal(s.env.RUSTFLAGS, "-C target-feature=+crt-static -C link-arg=/DEPENDENTLOADFLAG:0x800");
    assert.equal(s.env.CMAKE_MSVC_RUNTIME_LIBRARY, "MultiThreaded");
  }
  assert.deepEqual(
    list.filter((s) => s.copy).map((s) => s.copy[1]),
    [
      join("O", `asr-worker-vulkan-${TRIPLE}.exe`),
      join("O", `asr-worker-cpu-${TRIPLE}.exe`),
      join("O", `llama-server-${TRIPLE}.exe`),
    ],
  );
  const configure = list.find((s) => s.run?.[0] === "cmake" && s.run[1] === "-S").run;
  for (const flag of [
    "-DBUILD_SHARED_LIBS=ON",
    "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded",
    "-DGGML_NATIVE=OFF",
    "-DGGML_BACKEND_DL=ON",
    "-DGGML_CPU_ALL_VARIANTS=ON",
    "-DGGML_VULKAN=ON",
    "-DGGML_OPENMP=OFF",
    "-DLLAMA_BUILD_UI=OFF",
    "-DLLAMA_USE_PREBUILT_UI=OFF",
    "-DLLAMA_OPENSSL=OFF",
    `-DLLAMA_BUILD_NUMBER=${versions.LLAMA_CPP_BUILD_NUMBER}`,
  ]) {
    assert.ok(configure.includes(flag), flag);
  }
  assert.deepEqual(list.at(-1), { dlls: [join("W", "llama-build", "bin"), "O"] });
});

test("môi trường của vcvars: đọc `set`, gộp không trùng tên khác hoa thường", () => {
  const msvc = parseSetOutput("Path=C:\\VS\\bin;C:\\Windows\r\nINCLUDE=C:\\VS\\include\r\nx=a=b\r\n");
  assert.deepEqual(msvc, { Path: "C:\\VS\\bin;C:\\Windows", INCLUDE: "C:\\VS\\include", x: "a=b" });
  assert.deepEqual(mergeEnv({ PATH: "old", HOME: "h" }, msvc, { RUSTFLAGS: "r" }), {
    HOME: "h",
    Path: "C:\\VS\\bin;C:\\Windows",
    INCLUDE: "C:\\VS\\include",
    x: "a=b",
    RUSTFLAGS: "r",
  });
});

test("lệnh ký: thay {file} bằng đường dẫn trong nháy; thiếu cấu hình thì lỗi", () => {
  assert.equal(
    signCommandLine("smctl sign --input {file}", "C:\\a b\\x.exe"),
    'smctl sign --input "C:\\a b\\x.exe"',
  );
  assert.throws(() => signCommandLine(undefined, "x.exe"), /chưa đặt MT_WINDOWS_SIGN_CMD/);
  assert.throws(() => signCommandLine("signtool sign", "x.exe"), /phải có \{file\}/);
  assert.throws(() => signCommandLine("s {file}", 'a".exe'), /dấu nháy/);
});

test("đóng gói Windows: build không mang cấu hình ký, bundle mới mang; tên bộ cài", () => {
  assert.deepEqual(tauriArgs("build", "W/sign.json"), [
    "tauri",
    "build",
    "--ci",
    "--no-bundle",
    "--config",
    "src-tauri/release/tauri.windows.json",
  ]);
  assert.deepEqual(tauriArgs("bundle", null), [
    "tauri",
    "bundle",
    "--ci",
    "--bundles",
    "nsis",
    "--config",
    "src-tauri/release/tauri.windows.json",
  ]);
  assert.deepEqual(tauriArgs("bundle", "W/sign.json").slice(-2), ["--config", "W/sign.json"]);
  assert.deepEqual(signConfig("C:\\r\\sign-windows.mjs"), {
    bundle: { windows: { signCommand: { cmd: "node", args: ["C:\\r\\sign-windows.mjs", "%1"] } } },
  });
  assert.equal(
    findInstaller(["AI Translator_0.1.0_x64-setup.exe", "x.txt"], "AI Translator", "0.1.0"),
    "AI Translator_0.1.0_x64-setup.exe",
  );
  assert.throws(() => findInstaller([], "AI Translator", "0.1.0"), /không thấy AI Translator_0.1.0_x64-setup.exe/);
});
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^ℹ (tests|pass|fail)'
```

Expected (lúc lập kế hoạch: chưa có module):
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/build-sidecars-windows.mjs' imported from /Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/windows.test.mjs
ℹ tests 24
ℹ pass 23
ℹ fail 1
```

- [ ] **Step 2: Code**

Tạo `scripts/release/build-sidecars-windows.mjs`:

```js
#!/usr/bin/env node
// Build ba tiến trình phụ của bản phát hành Windows x64 từ mã nguồn đã khóa, rồi chép vào src-tauri/binaries/ (kế hoạch
// 07a; spec §6.4, §6.11, §6.12, §10.2):
//   - asr-worker-vulkan, asr-worker-cpu: whisper.cpp 1.8.3 đã vá, link tĩnh, shared-encode; CRT tĩnh (`+crt-static`, và
//     `CMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded` cho whisper.cpp), vì cờ /DEPENDENTLOADFLAG:0x800 chỉ cho DLL import thẳng
//     nằm trong System32 (02a QĐ32; C9 của kế hoạch 00);
//   - llama-server: llama.cpp ở commit khóa trong versions.env, `GGML_BACKEND_DL` và `GGML_CPU_ALL_VARIANTS` (dòng 210),
//     Vulkan, CRT tĩnh, không OpenMP (vcomp140.dll là C runtime), không web UI, không HTTPS; mọi DLL đi cùng thư mục.
// Rồi kiểm bằng dumpbin: không file nào cần C runtime của Visual C++, hai bản asr-worker không nạp DLL nào nằm cạnh nó
// (không có DLL ggml, C11), và in bảng SHA-256.
//
//   node scripts/release/build-sidecars-windows.mjs              # trên Windows, cần Vulkan SDK (install-tools.mjs vulkan-sdk)
//   node scripts/release/build-sidecars-windows.mjs --sign-only  # chỉ ký file đã có trong binaries/ rồi kiểm
//   node scripts/release/build-sidecars-windows.mjs --dry-run    # in các lệnh sẽ chạy, chạy được trên mọi máy
//
// Ký: đặt MT_WINDOWS_SIGN_CMD (xem sign-windows.mjs) thì ký từng file trước khi build app, vì build.rs băm file đã ký. CI
// build khi chưa có secret nào trong môi trường, rồi chạy `--sign-only` với secret của dịch vụ ký (spec §10.2).
// Thư mục làm việc: MT_RELEASE_WORK (mặc định target/release-work). Script xóa mọi file cũ trong src-tauri/binaries/.

import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { readVersions, root } from "./versions.mjs";

export const TRIPLE = "x86_64-pc-windows-msvc";

/** Biến môi trường từ output của lệnh `set` của cmd.exe. */
export function parseSetOutput(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

/** Gộp biến môi trường; tên biến trên Windows không phân biệt hoa thường (`Path` và `PATH` là một), nên bỏ tên trùng ở `base`. */
export function mergeEnv(base, ...extras) {
  const out = { ...base };
  for (const extra of extras) {
    for (const [key, value] of Object.entries(extra ?? {})) {
      for (const existing of Object.keys(out)) if (existing.toLowerCase() === key.toLowerCase()) delete out[existing];
      out[key] = value;
    }
  }
  return out;
}

/** Các bước build, theo thứ tự: { run: [lệnh, ...tham số], env?, cwd? } hoặc { copy: [từ, tới] } hoặc { dlls: [từ, tới] }. */
export function steps({ work, target, out, versions }) {
  // RUSTFLAGS thay hẳn rustflags của .cargo/config.toml, nên nhắc lại cờ DEPENDENTLOADFLAG ở đây.
  const crt = {
    RUSTFLAGS: "-C target-feature=+crt-static -C link-arg=/DEPENDENTLOADFLAG:0x800",
    CMAKE_MSVC_RUNTIME_LIBRARY: "MultiThreaded",
    CMAKE_POLICY_DEFAULT_CMP0091: "NEW",
  };
  const cargo = (features) => ({
    run: ["cargo", "build", "--release", "--locked", "-p", "asr-worker", "--features", features],
    env: crt,
    cwd: root,
  });
  const exe = join(target, "release", "asr-worker.exe");
  const src = join(work, "llama.cpp");
  const build = join(work, "llama-build");
  return [
    cargo("vulkan,shared-encode"),
    { copy: [exe, join(out, `asr-worker-vulkan-${TRIPLE}.exe`)] },
    cargo("shared-encode"),
    { copy: [exe, join(out, `asr-worker-cpu-${TRIPLE}.exe`)] },
    {
      run: [
        "cmake",
        "-S",
        src,
        "-B",
        build,
        "-G",
        "Ninja",
        "-DCMAKE_BUILD_TYPE=Release",
        "-DBUILD_SHARED_LIBS=ON",
        "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded",
        "-DGGML_NATIVE=OFF",
        "-DGGML_BACKEND_DL=ON",
        "-DGGML_CPU_ALL_VARIANTS=ON",
        "-DGGML_VULKAN=ON",
        "-DGGML_OPENMP=OFF",
        "-DGGML_RPC=OFF",
        "-DGGML_CCACHE=OFF",
        `-DLLAMA_BUILD_NUMBER=${versions.LLAMA_CPP_BUILD_NUMBER}`,
        "-DLLAMA_BUILD_TESTS=OFF",
        "-DLLAMA_BUILD_EXAMPLES=OFF",
        "-DLLAMA_BUILD_TOOLS=ON",
        "-DLLAMA_BUILD_SERVER=ON",
        "-DLLAMA_BUILD_UI=OFF",
        "-DLLAMA_USE_PREBUILT_UI=OFF",
        "-DLLAMA_OPENSSL=OFF",
      ],
    },
    // Build cả dự án: các backend (ggml-vulkan, ggml-cpu-<biến thể>) là module riêng, llama-server không link thẳng.
    { run: ["cmake", "--build", build, "--config", "Release"] },
    { copy: [join(build, "bin", "llama-server.exe"), join(out, `llama-server-${TRIPLE}.exe`)] },
    { dlls: [join(build, "bin"), out] },
  ];
}

function show(step) {
  if (step.run) {
    const env = Object.entries(step.env ?? {}).map(([k, v]) => `${k}="${v}" `).join("");
    return `${env}${step.run.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`;
  }
  if (step.copy) return `copy ${step.copy[0]} -> ${step.copy[1]}`;
  return `copy ${step.dlls[0]}\\*.dll -> ${step.dlls[1]}`;
}

/** Môi trường của Visual Studio (vcvars64.bat), để có cl, link, dumpbin trong PATH. */
function msvcEnv() {
  const vswhere = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  const vs = execFileSync(
    vswhere,
    ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"],
    { encoding: "utf8" },
  ).trim();
  const vcvars = join(vs, "VC", "Auxiliary", "Build", "vcvars64.bat");
  return parseSetOutput(execSync(`"${vcvars}" >nul && set`, { shell: "cmd.exe", encoding: "utf8" }));
}

function cloneLlama(src, versions) {
  if (!existsSync(join(src, ".git"))) {
    execFileSync(
      "git",
      ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", versions.LLAMA_CPP_TAG, "https://github.com/ggml-org/llama.cpp.git", src],
      { stdio: "inherit" },
    );
  }
  const head = execFileSync("git", ["-C", src, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== versions.LLAMA_CPP_COMMIT) throw new Error(`llama.cpp ở commit ${head}, versions.env khóa ${versions.LLAMA_CPP_COMMIT}`);
  if (execFileSync("git", ["-C", src, "status", "--porcelain"], { encoding: "utf8" }).trim() !== "") {
    throw new Error(`mã nguồn llama.cpp ở ${src} đã bị sửa: xóa thư mục đó rồi chạy lại`);
  }
}

export function main(argv) {
  const versions = readVersions();
  const work = process.env.MT_RELEASE_WORK ?? join(root, "target", "release-work");
  const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");
  const out = join(root, "src-tauri", "binaries");
  const list = steps({ work, target, out, versions });
  if (argv.includes("--dry-run")) {
    console.log(`git clone --depth 1 --branch ${versions.LLAMA_CPP_TAG} (kiểm commit ${versions.LLAMA_CPP_COMMIT})`);
    for (const step of list) console.log(show(step));
    return;
  }
  if (process.platform !== "win32") throw new Error("chỉ chạy trên Windows (hoặc dùng --dry-run)");
  const msvc = msvcEnv();
  if (argv.includes("--sign-only")) {
    signAndCheck(out, msvc);
    return;
  }
  mkdirSync(work, { recursive: true });
  cloneLlama(join(work, "llama.cpp"), versions);
  mkdirSync(out, { recursive: true });
  for (const name of readdirSync(out)) rmSync(join(out, name), { force: true });
  for (const step of list) {
    console.log(`== ${show(step)}`);
    if (step.run) {
      const [cmd, ...args] = step.run;
      execFileSync(cmd, args, { stdio: "inherit", cwd: step.cwd, env: mergeEnv(process.env, msvc, step.env) });
    } else if (step.copy) {
      copyFileSync(step.copy[0], step.copy[1]);
    } else {
      for (const name of readdirSync(step.dlls[0]).filter((n) => n.toLowerCase().endsWith(".dll"))) {
        copyFileSync(join(step.dlls[0], name), join(step.dlls[1], name));
      }
    }
  }
  signAndCheck(out, msvc);
}

/** Ký (khi có MT_WINDOWS_SIGN_CMD) mọi file trong binaries/, rồi kiểm bằng dumpbin và in bảng SHA-256. */
function signAndCheck(out, msvc) {
  const files = readdirSync(out).map((name) => join(out, name));
  if (process.env.MT_WINDOWS_SIGN_CMD) {
    for (const file of files) execFileSync("node", [join(root, "scripts/release/sign-windows.mjs"), file], { stdio: "inherit" });
  } else {
    console.log("chưa đặt MT_WINDOWS_SIGN_CMD: không ký tiến trình phụ");
  }
  const check = join(root, "scripts/release/release-check.mjs");
  const env = mergeEnv(process.env, msvc);
  const workers = files.filter((f) => /asr-worker-(vulkan|cpu)-/.test(f));
  const rest = files.filter((f) => !workers.includes(f));
  execFileSync("node", [check, "deps-windows", "--no-local-libs", ...workers], { stdio: "inherit", env });
  execFileSync("node", [check, "deps-windows", ...rest], { stdio: "inherit", env });
  execFileSync("node", [check, "table", out, "--target", TRIPLE], { stdio: "inherit" });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Tạo `scripts/release/sign-windows.mjs`:

```js
#!/usr/bin/env node
// Ký một file Windows (.exe, .dll) bằng dịch vụ ký cloud của chứng thư OV (spec §6.11, §10.2; T2 của kế hoạch 00).
//
//   node scripts/release/sign-windows.mjs <file>
//
// Lệnh ký của từng dịch vụ khác nhau, nên lấy từ biến MT_WINDOWS_SIGN_CMD (biến cấu hình của CI, không phải bí mật), trong
// đó `{file}` được thay bằng đường dẫn file trong dấu nháy. Thông tin đăng nhập của dịch vụ ký nằm trong secret của CI, mà
// lệnh đó tự đọc từ biến môi trường. Tauri gọi script này qua `bundle.windows.signCommand` (package-windows.mjs) cho file
// chạy của app, bộ cài và bộ gỡ; build-sidecars-windows.mjs gọi nó cho tiến trình phụ và DLL trước khi build app.

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Dòng lệnh ký cho `file`. */
export function signCommandLine(template, file) {
  if (!template) throw new Error("chưa đặt MT_WINDOWS_SIGN_CMD");
  if (!template.includes("{file}")) throw new Error("MT_WINDOWS_SIGN_CMD phải có {file}");
  if (file.includes('"')) throw new Error(`đường dẫn có dấu nháy: ${file}`);
  return template.replaceAll("{file}", `"${file}"`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error("thiếu <file>");
    execSync(signCommandLine(process.env.MT_WINDOWS_SIGN_CMD, file), { stdio: "inherit" });
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Tạo `scripts/release/package-windows.mjs`:

```js
#!/usr/bin/env node
// Đóng gói bản phát hành Windows x64: bộ cài NSIS `.exe` kèm bootstrapper WebView2 (kế hoạch 07a; spec §6.11, §10.2, A6).
// Chạy sau build-sidecars-windows.mjs và notices.mjs.
//
//   node scripts/release/package-windows.mjs          # cả hai phần dưới đây
//   node scripts/release/package-windows.mjs build    # bước 1–2: biên dịch app, không cần secret nào
//   node scripts/release/package-windows.mjs bundle   # bước 3–5: đóng gói, ký, kiểm
//
// Các bước:
//   1. Ghi lại SHA-256 của src-tauri/binaries/ (build.rs băm đúng các file này vào app).
//   2. `tauri build --no-bundle` với src-tauri/release/tauri.windows.json; binaries/ không được đổi, và file chạy của app
//      mang bảng SHA-256 của chúng với tên sau khi đóng gói.
//   3. `tauri bundle --bundles nsis` (không biên dịch lại). Có MT_WINDOWS_SIGN_CMD thì thêm `bundle.windows.signCommand`
//      (sign-windows.mjs): Tauri ký file chạy của app, bộ cài, bộ gỡ, và bỏ qua tiến trình phụ, DLL đã ký sẵn (Tauri chỉ
//      ký file chưa có chữ ký hợp lệ, nên tiến trình phụ phải ký trước, ở build-sidecars-windows.mjs).
//   4. binaries/ vẫn không đổi; giải nén bộ cài bằng 7-Zip rồi kiểm tiến trình phụ, DLL đúng từng byte.
//   5. Kiểm dung lượng ≤ 60 000 000 byte (§6.11, C10), ghi SHA-256; có khóa ký bản cập nhật thì ký bộ cài (`.sig`).
//
// CI chạy `build` khi chưa có secret nào trong môi trường, rồi `bundle` với secret, để build script của các crate không
// đọc được secret (spec §10.2, rủi ro chuỗi cung ứng).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { checkBundle, checkSize, embeddedErrors, sha256File, sidecarTable } from "./release-check.mjs";
import { TRIPLE } from "./build-sidecars-windows.mjs";
import { root } from "./versions.mjs";

const SIDECARS = ["asr-worker-vulkan", "asr-worker-cpu", "llama-server"];

/** Tham số của `tauri build --no-bundle` (phần `build`) và `tauri bundle` (phần `bundle`, kèm file cấu hình ký nếu có). */
export function tauriArgs(phase, signConfig) {
  const config = ["--config", "src-tauri/release/tauri.windows.json"];
  if (phase === "build") return ["tauri", "build", "--ci", "--no-bundle", ...config];
  const args = ["tauri", "bundle", "--ci", "--bundles", "nsis", ...config];
  if (signConfig) args.push("--config", signConfig);
  return args;
}

/** Cấu hình ký của Tauri: gọi sign-windows.mjs bằng đường dẫn tuyệt đối (thư mục làm việc của bundler không cố định). */
export function signConfig(scriptPath) {
  return { bundle: { windows: { signCommand: { cmd: "node", args: [scriptPath, "%1"] } } } };
}

/** Bộ cài trong thư mục bundle/nsis: đúng một file `<tên>_<phiên bản>_x64-setup.exe`. */
export function findInstaller(names, product, version) {
  const name = `${product}_${version}_x64-setup.exe`;
  if (!names.includes(name)) throw new Error(`không thấy ${name} (có: ${names.join(", ") || "không có file nào"})`);
  return name;
}

function pnpm(args, env) {
  execFileSync("pnpm", args, { cwd: root, stdio: "inherit", env, shell: process.platform === "win32" });
}

export function main(phase = "all") {
  if (!["all", "build", "bundle"].includes(phase)) throw new Error(`phần không rõ: ${phase} (dùng build, bundle, hoặc để trống)`);
  const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");
  const work = process.env.MT_RELEASE_WORK ?? join(root, "target", "release-work");
  const out = process.env.MT_RELEASE_OUT ?? join(target, "release-out");
  const binaries = join(root, "src-tauri", "binaries");
  for (const name of SIDECARS) {
    if (!existsSync(join(binaries, `${name}-${TRIPLE}.exe`))) {
      throw new Error(`thiếu src-tauri/binaries/${name}-${TRIPLE}.exe: chạy build-sidecars-windows.mjs trước`);
    }
  }
  if (!existsSync(join(root, "THIRD_PARTY_NOTICES.txt"))) throw new Error("thiếu THIRD_PARTY_NOTICES.txt: chạy notices.mjs trước");
  mkdirSync(out, { recursive: true });

  const table = join(work, "binaries-before-build.json");
  const errors = [];
  if (phase !== "bundle") {
    mkdirSync(work, { recursive: true });
    const before = JSON.stringify(sidecarTable(binaries, TRIPLE));
    writeFileSync(table, before);
    pnpm(tauriArgs("build", null), process.env);
    if (JSON.stringify(sidecarTable(binaries, TRIPLE)) !== before) errors.push("src-tauri/binaries/ bị đổi trong lúc build");
    const exe = join(target, "release", "meeting-translator.exe");
    errors.push(...embeddedErrors(readFileSync(exe), sidecarTable(binaries, TRIPLE)));
    if (phase === "build" || errors.length > 0) return errors;
  } else if (!existsSync(table)) {
    throw new Error(`thiếu ${table}: chạy package-windows.mjs build trước`);
  }
  const before = readFileSync(table, "utf8");
  let signFile = null;
  if (process.env.MT_WINDOWS_SIGN_CMD) {
    signFile = join(work, "tauri.windows.sign.json");
    mkdirSync(work, { recursive: true });
    writeFileSync(signFile, JSON.stringify(signConfig(join(root, "scripts/release/sign-windows.mjs"))));
  } else {
    console.log("chưa đặt MT_WINDOWS_SIGN_CMD: bộ cài không được ký (chỉ dùng thử nội bộ)");
  }
  pnpm(tauriArgs("bundle", signFile), process.env);
  if (JSON.stringify(sidecarTable(binaries, TRIPLE)) !== before) {
    errors.push("src-tauri/binaries/ bị đổi sau khi build app: bảng SHA-256 trong app không còn khớp (file chưa ký sẵn?)");
  }

  const nsisDir = join(target, "release", "bundle", "nsis");
  const installer = join(nsisDir, findInstaller(readdirSync(nsisDir), conf.productName, conf.version));
  const extract = join(work, "nsis-extract");
  rmSync(extract, { recursive: true, force: true });
  execFileSync("7z", ["x", "-y", `-o${extract}`, installer], { stdio: "ignore" });
  errors.push(...checkBundle(binaries, extract, TRIPLE));
  const bytes = readFileSync(installer).length;
  console.log(`${installer}: ${bytes} byte (${(bytes / 1e6).toFixed(1)} MB), ngưỡng 60000000 byte`);
  errors.push(...checkSize(bytes, 60_000_000));
  const sums = `${sha256File(installer)}  ${conf.productName}_${conf.version}_x64-setup.exe\n`;
  writeFileSync(join(out, "SHA256SUMS-windows.txt"), sums);
  process.stdout.write(sums);
  if (errors.length === 0 && process.env.TAURI_SIGNING_PRIVATE_KEY) {
    pnpm(["tauri", "signer", "sign", "--app-version", conf.version, installer], process.env);
  } else if (errors.length === 0) {
    console.log("chưa có khóa ký bản cập nhật: bỏ qua chữ ký .sig");
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const errors = main(process.argv[2]);
    for (const error of errors) console.error(`LỖI: ${error}`);
    process.exitCode = errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^ℹ (tests|pass|fail)'`

Expected (lúc lập kế hoạch):
```text
ℹ tests 27
ℹ pass 27
ℹ fail 0
```

Run:
```bash
node scripts/release/build-sidecars-windows.mjs --dry-run | cut -c1-160
node scripts/release/build-sidecars-windows.mjs; echo "exit=$?"
node scripts/release/package-windows.mjs bogus; echo "exit=$?"
```

Expected (lúc lập kế hoạch):
```text
git clone --depth 1 --branch b11146 (kiểm commit 7fe450e19305b828c199d602c23a8337aaa1f03b)
RUSTFLAGS="-C target-feature=+crt-static -C link-arg=/DEPENDENTLOADFLAG:0x800" CMAKE_MSVC_RUNTIME_LIBRARY="MultiThreaded" CMAKE_POLICY_DEFAULT_CMP0091="NEW" car
copy /Users/dtphong/Desktop/software_business/meeting-translator/target/release/asr-worker.exe -> /Users/dtphong/Desktop/software_business/meeti
RUSTFLAGS="-C target-feature=+crt-static -C link-arg=/DEPENDENTLOADFLAG:0x800" CMAKE_MSVC_RUNTIME_LIBRARY="MultiThreaded" CMAKE_POLICY_DEFAULT_CMP0091="NEW" car
copy /Users/dtphong/Desktop/software_business/meeting-translator/target/release/asr-worker.exe -> /Users/dtphong/Desktop/software_business/meeti
cmake -S /Users/dtphong/Desktop/software_business/meeting-translator/target/release-work/llama.cpp -B /Users/dtphong/Desktop/software_business/m
cmake --build /Users/dtphong/Desktop/software_business/meeting-translator/target/release-work/llama-build --config Release
copy /Users/dtphong/Desktop/software_business/meeting-translator/target/release-work/llama-build/bin/llama-server.exe -> /Users/dtphong/Desktop/
copy /Users/dtphong/Desktop/software_business/meeting-translator/target/release-work/llama-build/bin\*.dll -> /Users/dtphong/Desktop/software_bu
LỖI: chỉ chạy trên Windows (hoặc dùng --dry-run)
exit=1
LỖI: phần không rõ: bogus (dùng build, bundle, hoặc để trống)
exit=1
```

- [ ] **Step 3: Cấu hình đóng gói Windows và bộ gỡ**

Tạo `src-tauri/release/tauri.windows.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "category": "Productivity",
    "shortDescription": "Live translated subtitles for meetings",
    "externalBin": ["binaries/asr-worker-vulkan", "binaries/asr-worker-cpu", "binaries/llama-server"],
    "resources": {
      "../THIRD_PARTY_NOTICES.txt": "THIRD_PARTY_NOTICES.txt",
      "binaries/*.dll": ""
    },
    "windows": {
      "webviewInstallMode": { "type": "downloadBootstrapper", "silent": true },
      "nsis": {
        "installMode": "currentUser",
        "languages": ["English", "Vietnamese"],
        "displayLanguageSelector": false,
        "installerHooks": "release/nsis-hooks.nsh"
      }
    }
  }
}
```

Tạo `src-tauri/release/nsis-hooks.nsh`:

```nsis
; Macro cho bộ cài NSIS của Tauri (bundle.windows.nsis.installerHooks; kế hoạch 07a).
;
; Mẫu bộ cài của Tauri 2.12 đã có ô "xóa dữ liệu app" ở bộ gỡ: tick thì xóa %APPDATA%\com.aitranslator.desktop và
; %LOCALAPPDATA%\com.aitranslator.desktop (gồm model, spec §6.7, A6), và luôn xóa giá trị "AI Translator" ở
; HKCU\...\CurrentVersion\Run. Kho khóa (Credential Manager) giữ nguyên, vì bộ đếm hạn mức không mất khi gỡ app (§6.8).
;
; Macro dưới đây dọn thêm phần mẫu không làm (01 QĐ16): mục khởi động mà auto-launch 0.6.0 ghi ở HKLM (khi app từng chạy
; bằng quyền admin), và khóa StartupApproved của Task Manager ở cả hai nơi. Không làm khi bộ gỡ chạy để cập nhật, để giữ
; lựa chọn "khởi động cùng hệ thống" qua các bản. HKLM chỉ xóa được khi bộ gỡ có quyền admin; không có quyền thì lệnh
; lỗi mà không dừng bộ gỡ, và dòng chi tiết ghi lại để người hỗ trợ biết.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    ClearErrors
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    ${IfNot} ${Errors}
      DetailPrint "HKLM Run '${PRODUCTNAME}' is still present: run the uninstaller as administrator to remove it."
    ${EndIf}
  ${EndIf}
!macroend
```

- [ ] **Step 4: Kiểm hai cấu hình đóng gói** (tauri-build đọc cấu hình gộp qua `TAURI_CONFIG`: khóa sai tên thì `unknown field`; và chép `externalBin`, `resources` như lúc đóng gói)

Tạo `scripts/release/check-release-config.sh`:

```sh
#!/bin/sh
# Kiểm hai file cấu hình đóng gói (src-tauri/release/tauri.macos.json, tauri.windows.json) mà không cần build bản phát hành
# (kế hoạch 07a). tauri-build đọc cấu hình gộp qua biến TAURI_CONFIG: khóa sai tên thì báo lỗi (`unknown field`), và nó
# chép `externalBin`, `resources` vào thư mục target như lúc đóng gói, nên đường dẫn và mẫu glob sai cũng lộ ra.
#
#   scripts/release/check-release-config.sh
#
# Chạy trên Mac (phần Windows qua scripts/check-windows.sh, cần `rustup target add x86_64-pc-windows-msvc`). Tiến trình phụ
# nào chưa có trong src-tauri/binaries/ thì tạm đặt file giả cùng tên, xong thì xóa đúng các file giả đó; file thật không bị đụng.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
bin="$root/src-tauri/binaries"
target="${CARGO_TARGET_DIR:-$root/target}"
created=""
cleanup() {
  for f in $created; do rm -f "$bin/$f"; done
}
trap cleanup EXIT INT TERM
placeholder() {
  if [ ! -e "$bin/$1" ]; then
    printf 'placeholder' >"$bin/$1"
    created="$created $1"
  fi
}
# tauri-build phải đã chép từng file (tên sau khi đóng gói) vào thư mục target.
copied() {
  dir=$1
  shift
  for f in "$@"; do
    if [ ! -f "$dir/$f" ]; then
      echo "tauri-build không chép $f vào $dir" >&2
      exit 1
    fi
    echo "đã chép $f"
  done
}
mkdir -p "$bin"
if [ ! -f "$root/THIRD_PARTY_NOTICES.txt" ]; then
  echo "thiếu THIRD_PARTY_NOTICES.txt: chạy scripts/release/notices.mjs trước" >&2
  exit 1
fi

echo "== tauri.macos.json"
placeholder asr-worker-aarch64-apple-darwin
placeholder llama-server-aarch64-apple-darwin
(cd "$root" && TAURI_CONFIG="$(cat src-tauri/release/tauri.macos.json)" cargo check -q -p meeting-translator)
copied "$target/debug" asr-worker llama-server THIRD_PARTY_NOTICES.txt

echo "== tauri.windows.json"
for name in asr-worker-vulkan asr-worker-cpu llama-server; do placeholder "$name-x86_64-pc-windows-msvc.exe"; done
placeholder ggml-placeholder.dll
(cd "$root" && TAURI_CONFIG="$(cat src-tauri/release/tauri.windows.json)" ./scripts/check-windows.sh -q)
copied "$target/x86_64-pc-windows-msvc/debug" asr-worker-vulkan.exe asr-worker-cpu.exe llama-server.exe ggml-placeholder.dll \
  THIRD_PARTY_NOTICES.txt
echo "hai cấu hình đóng gói hợp lệ"
```

Run: `chmod +x scripts/release/check-release-config.sh`

Run: `scripts/release/check-release-config.sh 2>&1 | grep -v '^Using'; ls src-tauri/binaries`

Expected (lúc lập kế hoạch; file giả chỉ tồn tại trong lúc chạy, `binaries/` còn đúng hai tiến trình phụ thật của Task 3):
```text
== tauri.macos.json
đã chép asr-worker
đã chép llama-server
đã chép THIRD_PARTY_NOTICES.txt
== tauri.windows.json
đã chép asr-worker-vulkan.exe
đã chép asr-worker-cpu.exe
đã chép llama-server.exe
đã chép ggml-placeholder.dll
đã chép THIRD_PARTY_NOTICES.txt
hai cấu hình đóng gói hợp lệ
asr-worker-aarch64-apple-darwin
llama-server-aarch64-apple-darwin
```

Thử chiều sai: một khóa sai tên phải bị tauri-build từ chối.

Run:
```bash
for n in asr-worker-vulkan asr-worker-cpu llama-server; do printf x > src-tauri/binaries/$n-x86_64-pc-windows-msvc.exe; done
TAURI_CONFIG="$(sed 's/"installMode"/"instalMode"/' src-tauri/release/tauri.windows.json)" ./scripts/check-windows.sh -q 2>&1 \
  | grep -o 'unknown field `instalMode`'
rm -f src-tauri/binaries/*-x86_64-pc-windows-msvc.exe
```

Expected (lúc lập kế hoạch):
```text
unknown field `instalMode`
```

- [ ] **Step 5: Commit**

Run:
```bash
git add scripts/release/windows.test.mjs scripts/release/build-sidecars-windows.mjs scripts/release/sign-windows.mjs scripts/release/package-windows.mjs src-tauri/release/tauri.windows.json src-tauri/release/nsis-hooks.nsh scripts/release/check-release-config.sh
git commit -q -m "feat(release): đóng gói Windows: ba tiến trình phụ CRT tĩnh, llama-server Vulkan và mọi biến thể CPU, bộ cài NSIS dọn mục khởi động HKLM; kiểm hai cấu hình đóng gói (§6.11, §6.12, A6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): đóng gói Windows: ba tiến trình phụ CRT tĩnh, llama-server Vulkan và mọi biến thể CPU, bộ cài NSIS dọn mục khởi động HKLM; kiểm hai cấu hình đóng gói (§6.11, §6.12, A6)
```

## Task 9: Workflow CI và Dependabot

QĐ16, QĐ17, QĐ19. `ci.yml` chạy kiểm tra chuẩn của mục 6.2 trên `macos-26` (đủ) và `windows-2025` (build, clippy, test của workspace, script phát hành), không secret, `GITHUB_TOKEN` chỉ `contents: read`, mọi action khóa theo SHA.

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`

- [ ] **Step 1: Workflow**

Tạo `.github/workflows/ci.yml`:

```yaml
# Kiểm tra chuẩn (mục 6.2 của kế hoạch 00) trên macOS arm64 và Windows x64, cho mỗi lần push lên main và mỗi pull request
# (kế hoạch 07a; spec §6.12, §10.2, §11). Không dùng secret nào. Mọi action khóa theo SHA commit, ghi bản ở chú thích.
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  CARGO_TERM_COLOR: always
  CARGO_INCREMENTAL: "0"

jobs:
  macos:
    name: macOS arm64
    runs-on: macos-26
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
      - name: Rust theo rust-toolchain.toml
        run: |
          rustup toolchain install
          rustup target add x86_64-pc-windows-msvc
          rustc --version
      - name: protoc
        run: node scripts/release/install-tools.mjs protoc --dest "$RUNNER_TEMP/protoc"
      - uses: taiki-e/install-action@83ac0ad63c0167e6f06796fab0fce28db1bf3db0 # v2.87.22
        with:
          tool: cargo-deny@0.20.2,cargo-audit@0.22.2,cargo-about@0.9.2
      - name: cargo fmt
        run: cargo fmt --all -- --check
      - name: Giao diện (build, vitest)
        run: |
          pnpm install --frozen-lockfile
          pnpm build
          pnpm test
      - name: Script phát hành (node --test)
        run: node --test "scripts/release/*.test.mjs"
      - name: cargo clippy
        run: |
          cargo clippy --workspace --all-targets -- -D warnings
          cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
      - name: cargo test
        run: |
          cargo test --workspace
          cargo test -p asr-worker --features shared-encode
      - name: asr-worker bản phát hành (Metal, shared-encode)
        run: cargo build --release --locked -p asr-worker --features metal,shared-encode
      - name: Code Windows biên dịch được (clippy cho target Windows)
        run: ./scripts/check-windows.sh
      - name: third_party đúng bằng crate gốc cộng bản vá
        run: scripts/release/verify-third-party.sh
      - name: Giấy phép (THIRD_PARTY_NOTICES, allow-list của deny.toml)
        run: node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --no-llama
      - name: Cấu hình đóng gói hợp lệ
        run: scripts/release/check-release-config.sh
      - name: cargo deny, cargo audit
        run: |
          cargo deny check
          cargo audit
      - name: pnpm audit
        run: pnpm audit --audit-level high
      - name: License server
        run: |
          pnpm -C server install --frozen-lockfile
          pnpm -C server check
          pnpm -C server audit --audit-level high

  windows:
    name: Windows x64
    runs-on: windows-2025
    timeout-minutes: 120
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
      - name: Rust theo rust-toolchain.toml
        run: |
          rustup toolchain install
          rustc --version
      - name: protoc
        run: node scripts/release/install-tools.mjs protoc --dest "$RUNNER_TEMP/protoc"
      - name: Giao diện (build để có dist/ cho src-tauri)
        run: |
          pnpm install --frozen-lockfile
          pnpm build
      - name: Script phát hành (node --test)
        run: node --test "scripts/release/*.test.mjs"
      - name: cargo clippy
        run: |
          cargo clippy --workspace --all-targets -- -D warnings
          cargo clippy -p asr-worker --features shared-encode --all-targets -- -D warnings
      - name: cargo test
        run: |
          cargo test --workspace
          cargo test -p asr-worker --features shared-encode
```

Tạo `.github/dependabot.yml`:

```yaml
# Dependabot (spec §10.2): báo lỗ hổng và đề xuất bản mới. PR của Dependabot chỉ là đề xuất; nâng phiên bản vẫn theo
# §6.12 (kiểm tương thích, build lại, chạy hết test). `cooldown` giữ luật tuổi phát hành: chỉ đề xuất bản đã ra ít nhất 1 ngày.
version: 2
updates:
  - package-ecosystem: cargo
    directory: /
    schedule:
      interval: weekly
    cooldown:
      default-days: 1
    open-pull-requests-limit: 5
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    cooldown:
      default-days: 1
    open-pull-requests-limit: 5
  - package-ecosystem: npm
    directory: /server
    schedule:
      interval: weekly
    cooldown:
      default-days: 1
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    cooldown:
      default-days: 1
```

- [ ] **Step 2: Kiểm cú pháp** (actionlint, bản build sẵn, chỉ trên máy dev; Ruby của macOS đọc YAML của Dependabot)

Run:
```bash
cd target/release-work/tools
curl -sfLO https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_darwin_arm64.tar.gz
echo "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f  actionlint_1.7.12_darwin_arm64.tar.gz" | shasum -a 256 -c -
tar xzf actionlint_1.7.12_darwin_arm64.tar.gz actionlint
cd ../../..
target/release-work/tools/actionlint .github/workflows/ci.yml && echo "actionlint: sạch"
ruby -ryaml -e 'd = YAML.load_file(".github/dependabot.yml"); d["updates"].each { |u| puts [u["package-ecosystem"], u["directory"], u.dig("cooldown", "default-days")].join(" ") }'
```

Expected (lúc lập kế hoạch):
```text
actionlint_1.7.12_darwin_arm64.tar.gz: OK
actionlint: sạch
cargo / 1
npm / 1
npm /server 1
github-actions / 1
```

- [ ] **Step 3: Mọi bước của job macOS chạy được trên máy dev** (trừ bước cài công cụ). Các lệnh chưa chạy ở task trước:

Run:
```bash
cargo deny check 2>&1 | tail -1
cargo audit 2>&1 | grep -E '^warning: [0-9]+ allowed'
pnpm audit --audit-level high 2>&1 | tail -1
```

Expected (lúc lập kế hoạch; `pnpm audit` hỏi registry của npm):
```text
advisories ok, bans ok, licenses ok, sources ok
warning: 3 allowed warnings found
No known vulnerabilities found
```

- [ ] **Step 4: Commit**

Run:
```bash
git add .github/workflows/ci.yml .github/dependabot.yml
git commit -q -m "ci: kiểm tra chuẩn trên macOS arm64 và Windows x64 (build, fmt, clippy, test, vitest, server, deny, audit, giấy phép, cấu hình đóng gói); Dependabot (§10.2, §11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
ci: kiểm tra chuẩn trên macOS arm64 và Windows x64 (build, fmt, clippy, test, vitest, server, deny, audit, giấy phép, cấu hình đóng gói); Dependabot (§10.2, §11)
```

## Task 10: Workflow phát hành và ký manifest

QĐ12, QĐ13, QĐ18, QĐ20. `release.yml` build hai bộ cài từ tag; ký, notarize, ký bản cập nhật chỉ khi environment `release` có secret; bước có secret không biên dịch. `sign-manifest.yml` ký phần thân manifest model bằng khóa production (cần `scripts/models/sign-manifest.mjs` của kế hoạch 04).

**Files:**
- Create: `scripts/release/macos-keychain.sh`, `scripts/release/sign-manifest-ci.sh`, `.github/workflows/release.yml`, `.github/workflows/sign-manifest.yml`

- [ ] **Step 1: Hai script cho bước có secret**

Tạo `scripts/release/macos-keychain.sh`:

```sh
#!/bin/sh
# Keychain tạm chứa chứng thư Developer ID Application cho CI (kế hoạch 07a; spec §10.2: khóa ký chỉ nằm trong secret của CI).
#
#   eval "$(scripts/release/macos-keychain.sh import)"   # đọc P12 (base64 của .p12) và P12_PASSWORD; in lệnh đặt
#                                                        # MT_SIGN_IDENTITY và MT_KEYCHAIN cho shell đang chạy
#   scripts/release/macos-keychain.sh delete             # xóa keychain tạm
#
# Keychain không vào danh sách tìm kiếm của người dùng: codesign tìm chứng thư qua `--keychain "$MT_KEYCHAIN"`
# (build-sidecars-macos.sh, package-macos.sh). Mật khẩu keychain ngẫu nhiên, chỉ sống trong lệnh `import`. CI nạp chứng thư
# ngay trước bước ký và xóa ngay sau đó, nên các bước biên dịch không bao giờ thấy chứng thư.
set -eu
keychain="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/release.keychain-db"
case "${1:-}" in
  import)
    pass=$(openssl rand -hex 24)
    security create-keychain -p "$pass" "$keychain"
    # Lỗi ở bất kỳ bước nào sau đây thì xóa keychain vừa tạo.
    trap 'security delete-keychain "$keychain" 2>/dev/null || true' EXIT
    security set-keychain-settings -lut 3600 "$keychain"
    security unlock-keychain -p "$pass" "$keychain"
    cert=$(mktemp)
    printf '%s' "$P12" | base64 --decode >"$cert"
    security import "$cert" -f pkcs12 -k "$keychain" -P "$P12_PASSWORD" -T /usr/bin/codesign >/dev/null
    rm -f "$cert"
    security set-key-partition-list -S apple-tool:,apple: -s -k "$pass" "$keychain" >/dev/null
    identity=$(security find-identity -v -p codesigning "$keychain" |
      sed -n 's/^.*"\(Developer ID Application: [^"]*\)"$/\1/p' | head -n 1)
    if [ -z "$identity" ]; then
      echo "chứng thư trong P12 không phải Developer ID Application" >&2
      exit 1
    fi
    case "$identity" in
      *"'"*)
        echo "tên chứng thư có dấu nháy đơn" >&2
        exit 1
        ;;
    esac
    trap - EXIT
    printf "MT_SIGN_IDENTITY='%s'; MT_KEYCHAIN='%s'; export MT_SIGN_IDENTITY MT_KEYCHAIN\n" "$identity" "$keychain"
    ;;
  delete)
    if [ -e "$keychain" ]; then security delete-keychain "$keychain"; fi
    ;;
  *)
    echo "dùng: macos-keychain.sh import | delete" >&2
    exit 1
    ;;
esac
```

Tạo `scripts/release/sign-manifest-ci.sh`:

```sh
#!/bin/sh
# Bước ký manifest model production của workflow sign-manifest.yml (kế hoạch 07a). Đọc khóa riêng từ biến
# MANIFEST_SIGNING_KEY, ghi ra file tạm quyền 0600 ngoài repo (sign-manifest.mjs của kế hoạch 04 đòi vậy), ký phần thân
# BODY bằng `--env production`, rồi xóa file khóa dù thành công hay lỗi. Kết quả: target/manifest/models.json.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
if [ -z "${MANIFEST_SIGNING_KEY:-}" ]; then
  echo "environment release chưa có secret MANIFEST_SIGNING_KEY" >&2
  exit 1
fi
if [ ! -f "$root/scripts/models/sign-manifest.mjs" ]; then
  echo "chưa có scripts/models/sign-manifest.mjs (kế hoạch 04)" >&2
  exit 1
fi
case "${BODY:-}" in
  "" | /* | *..*)
    echo "BODY phải là đường dẫn tương đối trong repo, không có '..'" >&2
    exit 1
    ;;
esac
if [ ! -f "$root/$BODY" ]; then
  echo "không thấy $BODY" >&2
  exit 1
fi
key="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/manifest-signing-key.jwk"
trap 'rm -f "$key"' EXIT INT TERM
(
  umask 077
  printf '%s' "$MANIFEST_SIGNING_KEY" >"$key"
)
unset MANIFEST_SIGNING_KEY
mkdir -p "$root/target/manifest"
node "$root/scripts/models/sign-manifest.mjs" --env production --key "$key" --body "$root/$BODY" \
  --out "$root/target/manifest/models.json"
```

Run: `chmod +x scripts/release/macos-keychain.sh scripts/release/sign-manifest-ci.sh`

- [ ] **Step 2: Workflow**

Tạo `.github/workflows/release.yml`:

```yaml
# Build bản phát hành từ tag đã commit (spec §10.2): `.dmg` cho macOS arm64 và bộ cài NSIS `.exe` cho Windows x64, cùng
# SHA-256 của bộ cài và bảng SHA-256 của tiến trình phụ (Đ15). Kế hoạch 07a; 07b thêm phần đăng bản (manifest cập nhật,
# kênh stable/beta) và ký thật.
#
# Ký, notarize, ký bản cập nhật chỉ chạy khi environment `release` có secret tương ứng; thiếu secret thì bước đó bỏ qua
# và bản ra chỉ dùng thử nội bộ. Bước nào có secret thì không biên dịch gì: build script của các crate chạy ở bước khác,
# khi môi trường không có secret và keychain đang khóa (rủi ro chuỗi cung ứng).
#
# Secret của environment `release` (tên đã chốt ở kế hoạch 07a, mục "Secret của CI"):
#   APPLE_CERTIFICATE_P12, APPLE_CERTIFICATE_PASSWORD   chứng thư Developer ID Application (.p12, base64) và mật khẩu
#   APPLE_API_KEY_P8, APPLE_API_KEY_ID, APPLE_API_ISSUER  khóa App Store Connect API để notarize
#   TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD  khóa ký bản cập nhật (Q17)
# Biến cấu hình (không bí mật): MT_WINDOWS_SIGN_CMD, lệnh ký của dịch vụ ký cloud (sign-windows.mjs; chọn ở T2).
name: Release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

env:
  CARGO_TERM_COLOR: always
  CARGO_INCREMENTAL: "0"

jobs:
  macos:
    name: macOS arm64
    runs-on: macos-26
    timeout-minutes: 150
    environment: release
    env:
      HAS_APPLE_CERT: ${{ secrets.APPLE_CERTIFICATE_P12 != '' }}
      HAS_NOTARY_KEY: ${{ secrets.APPLE_API_KEY_P8 != '' }}
      MT_RELEASE_OUT: ${{ github.workspace }}/target/release-out
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
      - name: Rust theo rust-toolchain.toml
        run: rustup toolchain install
      - name: protoc
        run: node scripts/release/install-tools.mjs protoc --dest "$RUNNER_TEMP/protoc"
      - uses: taiki-e/install-action@83ac0ad63c0167e6f06796fab0fce28db1bf3db0 # v2.87.22
        with:
          tool: cargo-about@0.9.2
      - name: Phụ thuộc của giao diện
        run: |
          pnpm install --frozen-lockfile
          pnpm build
      - name: Test thư viện app ở bản release (không có phần chỉ dành cho bản debug)
        run: cargo test --release --locked -p meeting-translator --lib
      - name: Tiến trình phụ (asr-worker, llama-server tĩnh), ký ad-hoc
        run: scripts/release/build-sidecars-macos.sh
      - name: THIRD_PARTY_NOTICES
        run: node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --llama-src target/release-work/llama.cpp
      - name: Ký tiến trình phụ bằng Developer ID
        if: env.HAS_APPLE_CERT == 'true'
        env:
          P12: ${{ secrets.APPLE_CERTIFICATE_P12 }}
          P12_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        run: |
          eval "$(scripts/release/macos-keychain.sh import)"
          trap 'scripts/release/macos-keychain.sh delete' EXIT
          scripts/release/build-sidecars-macos.sh --sign-only
      - name: Build app (không ký, không secret)
        run: scripts/release/package-macos.sh build
      - name: Ký app, notarize, .dmg, kiểm dung lượng, SHA-256, chữ ký bản cập nhật
        env:
          P12: ${{ secrets.APPLE_CERTIFICATE_P12 }}
          P12_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_API_KEY_P8: ${{ secrets.APPLE_API_KEY_P8 }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        run: |
          trap 'scripts/release/macos-keychain.sh delete; rm -f "$RUNNER_TEMP/notary.p8"' EXIT
          if [ "$HAS_APPLE_CERT" = "true" ]; then
            eval "$(scripts/release/macos-keychain.sh import)"
          fi
          if [ "$HAS_NOTARY_KEY" = "true" ]; then
            printf '%s' "$APPLE_API_KEY_P8" > "$RUNNER_TEMP/notary.p8"
            chmod 600 "$RUNNER_TEMP/notary.p8"
            export APPLE_API_KEY_PATH="$RUNNER_TEMP/notary.p8"
          fi
          unset P12 P12_PASSWORD APPLE_API_KEY_P8
          scripts/release/package-macos.sh sign
          node scripts/release/release-check.mjs table src-tauri/binaries --target aarch64-apple-darwin \
            --out "$MT_RELEASE_OUT/sidecar-sha256-macos.json"
          cp THIRD_PARTY_NOTICES.txt "$MT_RELEASE_OUT/"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: macos-arm64
          path: target/release-out/
          if-no-files-found: error

  windows:
    name: Windows x64
    runs-on: windows-2025
    timeout-minutes: 180
    environment: release
    defaults:
      run:
        shell: bash
    env:
      MT_RELEASE_OUT: ${{ github.workspace }}/target/release-out
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
      - name: Rust theo rust-toolchain.toml
        run: rustup toolchain install
      - name: protoc
        run: node scripts/release/install-tools.mjs protoc --dest "$RUNNER_TEMP/protoc"
      - name: Vulkan SDK
        run: node scripts/release/install-tools.mjs vulkan-sdk
      - uses: taiki-e/install-action@83ac0ad63c0167e6f06796fab0fce28db1bf3db0 # v2.87.22
        with:
          tool: cargo-about@0.9.2
      - name: Phụ thuộc của giao diện
        run: |
          pnpm install --frozen-lockfile
          pnpm build
      - name: Test thư viện app ở bản release (không có phần chỉ dành cho bản debug)
        run: cargo test --release --locked -p meeting-translator --lib
      - name: Tiến trình phụ (asr-worker-vulkan, asr-worker-cpu, llama-server và DLL)
        run: node scripts/release/build-sidecars-windows.mjs
      - name: Ký tiến trình phụ và DLL
        if: vars.MT_WINDOWS_SIGN_CMD != ''
        env:
          MT_WINDOWS_SIGN_CMD: ${{ vars.MT_WINDOWS_SIGN_CMD }}
        run: node scripts/release/build-sidecars-windows.mjs --sign-only
      - name: THIRD_PARTY_NOTICES
        run: node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --llama-src target/release-work/llama.cpp
      - name: Build app (không secret)
        run: node scripts/release/package-windows.mjs build
      - name: Bộ cài NSIS, ký, kiểm, SHA-256, chữ ký bản cập nhật
        env:
          MT_WINDOWS_SIGN_CMD: ${{ vars.MT_WINDOWS_SIGN_CMD }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        run: |
          node scripts/release/package-windows.mjs bundle
          cp target/release/bundle/nsis/*-setup.exe* "$MT_RELEASE_OUT/"
          node scripts/release/release-check.mjs table src-tauri/binaries --target x86_64-pc-windows-msvc \
            --out "$MT_RELEASE_OUT/sidecar-sha256-windows.json"
          cp THIRD_PARTY_NOTICES.txt "$MT_RELEASE_OUT/"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: windows-x64
          path: target/release-out/
          if-no-files-found: error
```

Tạo `.github/workflows/sign-manifest.yml`:

```yaml
# Ký manifest model production trong CI (spec §10.2; Q17 của kế hoạch 00; kế hoạch 04a QĐ10, 07a). Khóa riêng duy nhất
# nằm ở secret MANIFEST_SIGNING_KEY của environment `release` (JWK Ed25519, có `kid` thuộc khối `production` của
# src-tauri/keys/manifest-public-keys.json); bản sao offline mã hóa nằm ngoài CI. Người vận hành chạy workflow bằng tay với
# đường dẫn phần thân (JSON chưa ký, sinh bằng scripts/models/build-manifest.mjs), rồi tải models.json đã ký lên R2.
name: Sign model manifest

on:
  workflow_dispatch:
    inputs:
      body:
        description: Đường dẫn tương đối trong repo tới phần thân manifest (JSON chưa ký)
        required: true
        type: string

permissions:
  contents: read

jobs:
  sign:
    name: Ký manifest production
    runs-on: macos-26
    timeout-minutes: 15
    environment: release
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
      - name: Ký phần thân bằng khóa production
        env:
          MANIFEST_SIGNING_KEY: ${{ secrets.MANIFEST_SIGNING_KEY }}
          BODY: ${{ inputs.body }}
        run: scripts/release/sign-manifest-ci.sh
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: models-manifest
          path: target/manifest/models.json
          if-no-files-found: error
```

- [ ] **Step 3: Kiểm cú pháp workflow và script sh** (shellcheck bản build sẵn, chỉ trên máy dev)

Run:
```bash
cd target/release-work/tools
curl -sfLO https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.darwin.aarch64.tar.gz
echo "339b930feb1ea764467013cc1f72d09cd6b869ebf1013296ba9055ab2ffbd26f  shellcheck-v0.11.0.darwin.aarch64.tar.gz" | shasum -a 256 -c -
tar xzf shellcheck-v0.11.0.darwin.aarch64.tar.gz
cd ../../..
PATH="$PWD/target/release-work/tools/shellcheck-v0.11.0:$PATH" target/release-work/tools/actionlint .github/workflows/*.yml && echo "actionlint: sạch"
target/release-work/tools/shellcheck-v0.11.0/shellcheck -x scripts/release/*.sh && echo "shellcheck: sạch"
```

Expected (lúc lập kế hoạch):
```text
shellcheck-v0.11.0.darwin.aarch64.tar.gz: OK
actionlint: sạch
shellcheck: sạch
```

- [ ] **Step 4: Thử bước ký manifest ở các chiều lỗi** (không có khóa; chưa có script của 04; đường dẫn ra ngoài repo)

Run:
```bash
BODY=x.json scripts/release/sign-manifest-ci.sh; echo "exit=$?"
MANIFEST_SIGNING_KEY='{"kid":"thử"}' BODY=x.json scripts/release/sign-manifest-ci.sh; echo "exit=$?"
mkdir -p scripts/models && touch scripts/models/sign-manifest.mjs
MANIFEST_SIGNING_KEY='{"kid":"thử"}' BODY=../x.json scripts/release/sign-manifest-ci.sh; echo "exit=$?"
rm -r scripts/models
```

Expected (lúc lập kế hoạch):
```text
environment release chưa có secret MANIFEST_SIGNING_KEY
exit=1
chưa có scripts/models/sign-manifest.mjs (kế hoạch 04)
exit=1
BODY phải là đường dẫn tương đối trong repo, không có '..'
exit=1
```

- [ ] **Step 5: Thử keychain tạm** với một chứng thư tự ký mang tên "Developer ID Application" (chỉ để thử, xóa ngay): `security import` nhận file, nhưng `find-identity -v` không nhận chứng thư không tin cậy, nên script báo lỗi và tự xóa keychain. Chứng thư Developer ID thật chỉ thử được ở Task 14.

Run:
```bash
t=target/release-work/kc && rm -rf "$t" && mkdir -p "$t"
printf '[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = Developer ID Application: Test Only (TEAMID1234)\n[ext]\nkeyUsage = critical, digitalSignature\nextendedKeyUsage = critical, codeSigning\nbasicConstraints = critical, CA:false\n' > "$t/cert.cnf"
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -keyout "$t/k.pem" -out "$t/c.pem" -days 1 -config "$t/cert.cnf" -extensions ext 2>/dev/null
/usr/bin/openssl pkcs12 -export -inkey "$t/k.pem" -in "$t/c.pem" -out "$t/t.p12" -passout pass:test-only
RUNNER_TEMP="$PWD/$t" P12="$(base64 < "$t/t.p12")" P12_PASSWORD=test-only scripts/release/macos-keychain.sh import; echo "exit=$?"
ls "$t"
rm -rf "$t"
```

Expected (lúc lập kế hoạch; không còn file `release.keychain-db` sau lệnh):
```text
chứng thư trong P12 không phải Developer ID Application
exit=1
c.pem
cert.cnf
k.pem
t.p12
```

- [ ] **Step 5b: Bước test thư viện app ở bản release** (QĐ18; lúc lập kế hoạch khoảng 2 phút)

Run: `cargo test --release --locked -p meeting-translator --lib 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):
```text
test result: ok. 162 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.38s
```

- [ ] **Step 6: Commit**

Run:
```bash
git add scripts/release/macos-keychain.sh scripts/release/sign-manifest-ci.sh .github/workflows/release.yml .github/workflows/sign-manifest.yml
git commit -q -m "ci: workflow phát hành macOS và Windows từ tag; ký, notarize, ký bản cập nhật và ký manifest model chỉ chạy khi có secret, không bước có secret nào biên dịch code (§6.11, §10.2, Q17)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
ci: workflow phát hành macOS và Windows từ tag; ký, notarize, ký bản cập nhật và ký manifest model chỉ chạy khi có secret, không bước có secret nào biên dịch code (§6.11, §10.2, Q17)
```

## Task 11: Kiểm tra chuẩn (mục 6.2 của kế hoạch 00)

Đủ khối lệnh của mục 6.2 của kế hoạch 00 trên cây cuối của 07a, cộng các phép kiểm mới của file này (đúng các bước của job macOS trong `ci.yml`). Không có commit. 07a không đổi crate nào ngoài app, nên số test của các crate khác như trên `31ca0fb`.

- [ ] **Step 1: Rust**

Run:
```bash
cargo fmt --all -- --check; echo "fmt: $?"
cargo clippy --workspace --all-targets -q -- -D warnings; echo "clippy: $?"
```

Expected (lúc lập kế hoạch):
```text
fmt: 0
warning: variable does not need to be mutable
   --> third_party/whisper-rs-sys/build.rs:137:13
    |
137 |         let mut bindings = bindgen::Builder::default()
    |             ----^^^^^^^^
    |             |
    |             help: remove this `mut`
    |
    = note: `#[warn(unused_mut)]` (part of `#[warn(unused)]`) on by default

clippy: 0
```

Run:
```bash
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```

Expected (lúc lập kế hoạch, trên `31ca0fb` cộng 07a (4 test mới trong app)):
```text
passed 504 failed 0 ignored 11
```

Run:
```bash
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -q -- -D warnings; echo "clippy asr-worker: $?"
cargo test -p asr-worker --features shared-encode 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
cargo build --release --locked -p asr-worker --features metal,shared-encode 2>&1 | tail -1 | sed -E 's/in [0-9.]+s/in …/'
```

Expected (lúc lập kế hoạch):
```text
clippy asr-worker: 0
passed 42 failed 0 ignored 1
    Finished `release` profile [optimized] target(s) in …
```

Run:
```bash
./scripts/check-windows.sh -q; echo "check-windows: $?"
cargo deny check 2>&1 | tail -1
cargo audit 2>&1 | grep -E '^warning: [0-9]+ allowed'
```

Expected (lúc lập kế hoạch):
```text
check-windows: 0
advisories ok, bans ok, licenses ok, sources ok
warning: 3 allowed warnings found
```

- [ ] **Step 2: Giao diện và script phát hành**

Run:
```bash
pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null 2>&1; echo "build: $?"
pnpm test 2>&1 | grep -E 'Test Files|Tests '
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^ℹ (tests|pass|fail)'
pnpm audit --audit-level high 2>&1 | tail -1
```

Expected (lúc lập kế hoạch):
```text
build: 0
 Test Files  7 passed (7)
      Tests  68 passed (68)
ℹ tests 27
ℹ pass 27
ℹ fail 0
No known vulnerabilities found
```

Run:
```bash
scripts/release/verify-third-party.sh
node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --no-llama 2>&1 | grep -E '^(THIRD_PARTY|LỖI)'
scripts/release/check-release-config.sh 2>&1 | tail -1
```

Expected (lúc lập kế hoạch; `--no-llama` ghi đè file có đủ llama.cpp của Task 5, chạy lại Task 5 Step 5 trước khi đóng gói):
```text
third_party khớp whisper-rs-sys 0.15.0 và whisper-rs 0.16.0 trên crates.io cộng hai bản vá
THIRD_PARTY_NOTICES.txt: 125 văn bản giấy phép Rust (464 crate), 5 gói npm, 4 mục C/C++ và model
hai cấu hình đóng gói hợp lệ
```

- [ ] **Step 3: License server** (07a không đổi `server/`)

Run:
```bash
pnpm -C server install --frozen-lockfile >/dev/null 2>&1; pnpm -C server check 2>&1 | grep -E '^ +Tests  |^ℹ (tests|pass) |dry-run: exiting' | sort | uniq -c
pnpm -C server audit --audit-level high 2>&1 | tail -1
```

Expected (lúc lập kế hoạch):
```text
   1       Tests  360 passed (360)
   4 --dry-run: exiting now.
   1 ℹ pass 6
   1 ℹ tests 6
No known vulnerabilities found
```

## Task 12: Cập nhật kế hoạch 00

Làm theo Task 2 của kế hoạch 00 (`docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`), ghi SHA commit thật của từng task:
- Step 1–2: liệt kê các dòng có `07`. Đổi theo kết quả thật:
  - dòng 3 (D3: macOS 14.2, chỉ arm64 và x64): `đang làm`, ghi `minimumSystemVersion` 14.2 và hai runner; còn 08 thử các bản hệ điều hành;
  - dòng 92 (`NSAudioCaptureUsageDescription`), 119 (`shared-encode` bản phát hành), 205 (tiến trình phụ trong bộ cài), 211 (llama-server tĩnh trên macOS, QĐ4), 213 (yêu cầu build trong CI), 214 (CRT tĩnh, QĐ5), 257 (THIRD_PARTY_NOTICES), 259 (rà RTranslator: không có tài sản nào trong danh sách sinh ra), 270 (SHA-256 của bộ cài), 276 (chuỗi cung ứng), 317 (CI chạy audit): `xong` phần của 07a, hoặc `chờ` kèm lý do khi còn phần chạy thật trên runner (Task 14) hay máy Windows (Task 16);
  - dòng 199 (dung lượng bộ cài): macOS `xong` (lúc lập kế hoạch `.dmg` 7 571 752 byte, ngưỡng 60 000 000), Windows chờ Task 14 (C10);
  - dòng 208, 210 (dumpbin, `GGML_BACKEND_DL` + `GGML_CPU_ALL_VARIANTS`): `chờ` Task 14;
  - dòng 59 (Giới thiệu và giấy phép), 196, 198, 200–204, 307, 308, 33 (A6): phần còn lại thuộc 07b, 08, hay chờ T1, T2.
- Step 3: thêm dòng cho việc phát sinh: (a) đường CPU của `llama-server` tự build khác bản chính thức 1/5 câu (QĐ4, chờ Task 13); (b) SQLCipher, OpenSSL, câu mẫu FLEURS vào THIRD_PARTY_NOTICES sau khi 03 vào `main` (07b); (c) giá trị trong `Run` của Windows không có dấu nháy (01, mục 2.7): chưa sửa, 07b.
- Step 4:
  - mục 2: bảng kế hoạch con thêm dòng `2026-10-02-giai-doan-1-07a-ci-dong-goi.md` (07a, đã viết); 07 đổi thành "07a: CI, build, đóng gói; 07b: cập nhật, phát hành, ký thật (viết sau 06)";
  - mục 2.7: "Nhận từ 01/02/04" đánh dấu phần 07a đã làm; thêm "Còn cho 07b" trỏ tới mục cuối của file này;
  - mục 5.3 (T3): repo từ xa đã có (`dotienphong/ai-live-translator-desktop`); CI chạy khi chủ dự án đẩy (Task 14);
  - mục 6.2: thêm `node --test "scripts/release/*.test.mjs"`, `scripts/release/verify-third-party.sh`, `node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --no-llama`, `scripts/release/check-release-config.sh` vào khối lệnh; ghi chú CI chạy đúng khối này (`.github/workflows/ci.yml`);
  - mục 6.5 (bí mật của CI): tên secret ở mục "Secret và biến của CI" của file này;
  - mục 8.3: thêm các điểm ở "Điểm cần chủ dự án quyết" của file này.
- Step 5–6: kiểm định dạng bảng, rồi commit với thông điệp `docs(plan): cập nhật tổng quan Giai đoạn 1 sau kế hoạch 07a`.

## Task 13: So `llama-server` tự build với b11146: A3 và S6 (cần máy rảnh)

R11 của kế hoạch 00: đổi binary của `llama-server` thì chạy lại S4, A3, S6. S4 (mẫu chat và token của prompt) không đổi, vì cùng commit và cùng chat template trong GGUF; Task 3 Step 5 đã thấy đường GPU dịch giống từng chữ. Task này đo A3 và S6 bằng bản tự build. Nên chạy cùng đợt máy rảnh với 02b Task 7–9 (đo bằng bản chính thức), để có hai lượt so được với nhau.

**Cần người thao tác (Step 1).** Lâu: A3 khoảng 20 phút, S6 khoảng 40 phút.

**Files:**
- Create: `bench/phase0/results/s7_mt-07a-selfbuilt.json`, `.md`; `bench/phase0/results/latency/m4pro-07a-s6-khuyennghi-*.json`; `bench/phase0/results/s6_07a_selfbuilt.md` (script sinh ra)

- [ ] **Step 1: Chuẩn bị máy rảnh** như 02b Task 7 Step 1 (đóng app nặng, cắm sạc, cây sạch). Chờ người xác nhận.

- [ ] **Step 2: Đặt bản tự build cạnh bản chính thức** (`run_matrix.py` tìm `llama-server` theo `--llama-variant` dưới `tools/llama-b11146/`):

```bash
scripts/release/build-sidecars-macos.sh >/dev/null
mkdir -p tools/llama-b11146/selfbuilt-macos-arm64
cp src-tauri/binaries/llama-server-aarch64-apple-darwin tools/llama-b11146/selfbuilt-macos-arm64/llama-server
```

- [ ] **Step 3: A3 bằng `mt-eval`** (như 02b Task 7 Step 2–3, chỉ đổi `--llama-server`, thư mục ra và nhãn):

```bash
cargo build --release -p latency-bench
for m in Q8_0 Q4_K_M; do for v in plain context; do
  target/release/latency-bench mt-eval --testset bench/phase0/data/mt/testset_phase0.jsonl \
    --llama-server tools/llama-b11146/selfbuilt-macos-arm64/llama-server \
    --model models/Hy-MT2-1.8B-$m.gguf --out-dir bench/phase0/data/mt/outputs-07a-selfbuilt --variant $v
done; done
uv run --no-project --python 3.12 --with "unbabel-comet==2.2.7" --with "numpy<2" \
  --with "transformers<5" --with "setuptools<82" python bench/phase0/mt/score_mt.py \
  --outputs bench/phase0/data/mt/outputs-07a-selfbuilt --label 07a-selfbuilt --baseline bench/phase0/results/s7_mt.json
```
Expected: như 02b Task 7 Step 3: bảng "So với mốc" đủ 32 dòng, mọi dòng `đạt`, lệnh thoát 0. Thấp hơn mốc quá 0,01 thì không dùng bản tự build cho bản phát hành; báo chủ dự án.

- [ ] **Step 4: S6** (như 02b Task 9 Step 2–3, nhãn `m4pro-07a-s6`, thêm `--llama-variant selfbuilt-macos-arm64`; bảng so với lượt `m4pro-chot` ghi vào `bench/phase0/results/s6_07a_selfbuilt.md` bằng đoạn Python của 02b Task 9 Step 3, đổi nhãn và tên file):

```bash
cargo build --release -p latency-bench
cargo build --release -p asr-worker --features metal,shared-encode
for pkg in chuan nhe; do
  python3 bench/phase0/latency/run_matrix.py --machine m4pro-07a-s6 --tier khuyennghi --package $pkg \
    --llama-variant selfbuilt-macos-arm64
done
```
Expected: 12 file `m4pro-07a-s6-khuyennghi-*.json`; bảng chênh mọi dòng `đạt` (p50, p90 không cao hơn `m4pro-chot` quá 10%), A2 `đạt` ở cả 24 dòng của `summarize.py`.

- [ ] **Step 5: Commit kết quả**

```bash
git add bench/phase0/results/s7_mt-07a-selfbuilt.* bench/phase0/results/latency/m4pro-07a-s6-khuyennghi-*.json bench/phase0/results/s6_07a_selfbuilt.md
git commit -m "test(bench): A3 và S6 với llama-server b11146 tự build tĩnh (R11, kế hoạch 07a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 14: Đẩy lên GitHub, chạy CI và workflow phát hành lần đầu (cần người)

Agent không đẩy lên GitHub, không tạo secret và không chạy workflow thật. Repo từ xa: `dotienphong/ai-live-translator-desktop` (riêng tư).

- [ ] **Step 1 (người): Cấu hình repo.**
  - Settings › Actions › General: cho phép Actions; "Workflow permissions" để "Read repository contents" (mặc định của repo mới).
  - Settings › Environments: tạo `release`. Đề xuất (điểm cần quyết 3): bật "Required reviewers" là chủ dự án, và "Deployment branches and tags" chỉ cho tag `v*` (và nhánh `main` cho lần chạy tay).
  - Chưa cần secret nào cho bước này.
- [ ] **Step 2 (người): Đẩy `main`.** Workflow `CI` chạy hai job. Expected: job macOS xanh. Job Windows là lần đầu code Windows của app chạy thật (trước đây chỉ `check-windows.sh` trên Mac): test nào đỏ thì ghi lại tên test và log, mở việc sửa theo kế hoạch của phần đó (01, 02); không tắt test.
- [ ] **Step 3 (người): Chạy `Release` bằng tay** (Actions › Release › Run workflow, nhánh `main`).
  - Expected lần đầu: job Windows dừng ở bước "Vulkan SDK" với `vulkansdk-windows-X64-1.4.363.0.exe: versions.env chưa có SHA-256; SHA-256 của file vừa tải là <64 ký tự>` (QĐ8). So số đó với SHA-256 mà trang tải của LunarG công bố cho đúng file đó; khớp thì ghi vào `VULKAN_SDK_SHA256=` trong `scripts/release/versions.env`, commit (`build(release): khóa SHA-256 của Vulkan SDK 1.4.363.0`), đẩy, chạy lại.
  - Expected job macOS: xanh; artifact `macos-arm64` có `AI Translator_0.1.0_aarch64.dmg` (khoảng 7,6 MB), `SHA256SUMS-macos.txt`, `sidecar-sha256-macos.json`, `THIRD_PARTY_NOTICES.txt`; log có "chưa có khóa notarize" và "chưa có khóa ký bản cập nhật".
  - Expected job Windows (lần chạy sau): xanh; log bước tiến trình phụ in danh sách DLL của từng file (`dumpbin`), không có dòng `LỖI`; artifact `windows-x64` có `AI Translator_0.1.0_x64-setup.exe` và số byte của nó ≤ 60 000 000.
- [ ] **Step 4: Ghi kết quả vào kế hoạch 00** (agent làm được khi người gửi log): C9 (VC runtime: dòng `deps-windows` của mọi file không có `VCRUNTIME`, `MSVCP`, `VCOMP`), C10 (dung lượng bộ cài Windows), C11 (hai bản `asr-worker` không nạp DLL nào nằm cạnh chúng); dòng 199, 208, 210, 214. Đỏ ở bước nào thì sửa script theo log, chạy lại.

## Task 15: Thử bản `.dmg` trên Mac (cần người)

Bản ký ad-hoc từ Task 6 (hoặc artifact của Task 14). Chưa notarize nên Gatekeeper chặn lần mở đầu; đây là bước thử nội bộ, không phải A6.

- [ ] **Step 1 (người):** Mở `target/release-out/AI Translator_0.1.0_aarch64.dmg`, kéo AI Translator vào Applications. Chạy `xattr -dr com.apple.quarantine "/Applications/AI Translator.app"` (bản chưa notarize), rồi mở app.
  - Expected: app mở, có biểu tượng ở menu bar; Giới thiệu hiện câu "AI Translator dùng các phần mềm mã nguồn mở…" và khung danh sách giấy phép cuộn được (có `whisper.cpp`, `llama.cpp`, `react`, `tauri`).
- [ ] **Step 2 (người):** Có model ở thư mục model của bản phát hành (`~/Library/Application Support/com.aitranslator.desktop/models`; trước khi có 04 thì chép 4 file của `models/`), bấm Bắt đầu với một video có tiếng.
  - Expected: macOS hỏi quyền "Ghi âm thanh hệ thống" với câu của `InfoPlist.strings`; cho phép thì phụ đề hiện. Đây là lần đầu app chạy với hardened runtime: nếu thu âm thanh không chạy, xem Console (lọc `AI Translator`, `tccd`, `amfid`) và báo lại, vì có thể cần thêm entitlement (07b).
  - Expected: không có lỗi `sidecarTampered` hay `sidecarMissing` (bảng SHA-256 dùng đúng tên sau khi đóng gói, QĐ1).
- [ ] **Step 3 (người):** Thoát bằng menu bar › Thoát, xóa app khỏi Applications.

## Task 16: Thử bộ cài và bộ gỡ trên Windows (cần máy Windows và người)

Bộ cài chưa ký từ artifact `windows-x64` của Task 14. SmartScreen sẽ cảnh báo (chưa có chứng thư, T2).

- [ ] **Step 1 (người):** Chạy `AI Translator_0.1.0_x64-setup.exe` (More info › Run anyway).
  - Expected: bộ cài tiếng Việt nếu Windows tiếng Việt, tiếng Anh nếu không; cài vào `%LOCALAPPDATA%\AI Translator`; thư mục cài có `meeting-translator.exe`, `asr-worker-vulkan.exe`, `asr-worker-cpu.exe`, `llama-server.exe`, các file `ggml*.dll`, `llama*.dll`, `THIRD_PARTY_NOTICES.txt`; không có `VCRUNTIME140.dll`.
- [ ] **Step 2 (người):** Mở app; bật "khởi động cùng hệ thống" trong Cài đặt; kiểm `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run` có `AI Translator`. Giới thiệu hiện danh sách giấy phép.
- [ ] **Step 3 (người):** Gỡ app (Settings › Apps), tick ô "Delete the application data" / "Xóa dữ liệu ứng dụng".
  - Expected: thư mục cài, `%APPDATA%\com.aitranslator.desktop` và `%LOCALAPPDATA%\com.aitranslator.desktop` (gồm `models`) đều mất; giá trị `AI Translator` mất khỏi `HKCU\...\Run` và `HKCU\...\Explorer\StartupApproved\Run`; mục trong Credential Manager (bộ đếm hạn mức) còn.
- [ ] **Step 4 (người):** Cài lại, chạy app một lần bằng "Run as administrator", bật khởi động cùng hệ thống (ghi vào `HKLM`), rồi gỡ bằng bộ gỡ chạy với quyền admin. Expected: giá trị ở `HKLM\...\Run` cũng mất. Gỡ không có quyền admin thì giá trị đó còn, và phần chi tiết của bộ gỡ có dòng `HKLM Run 'AI Translator' is still present…`.

## Điểm cần chủ dự án quyết

1. **Dịch vụ ký cloud cho chứng thư OV Windows** (T2): SSL.com eSigner, DigiCert KeyLocker, Azure Trusted Signing, hay dịch vụ khác. Chọn xong thì đặt biến `MT_WINDOWS_SIGN_CMD` và thêm secret của dịch vụ vào hai bước ký của `release.yml` (07b). Chưa chọn thì bộ cài Windows không ký.
2. **Tài khoản Apple Developer** (T1): cá nhân hay tổ chức (tổ chức cần D-U-N-S). Có tài khoản thì tạo chứng thư Developer ID Application và khóa App Store Connect API, nhập 5 secret Apple vào environment `release`.
3. **Environment `release`:** đề xuất bật "Required reviewers" (chủ dự án duyệt từng lần phát hành) và chỉ cho tag `v*`. Đồng ý không?
4. **Phút chạy Actions của repo riêng tư:** runner macOS tính phút gấp nhiều lần Linux. CI chạy ở mỗi push lên `main` và mỗi PR như hiện tại, hay chỉ PR và chạy tay? Không có cache (QĐ17) nên mỗi lần chạy lâu (ước lượng 30–60 phút cho job macOS; số thật có sau Task 14).
5. **Thông tin bộ cài:** `publisher` và `copyright` (tên pháp nhân hay hộ kinh doanh) chưa đặt trong `tauri.*.json`; EULA trong bộ cài (Q8) chưa có nội dung. Cần tên và nội dung trước bản phát hành công khai.
6. **Dependabot:** giữ PR đề xuất bản mới mỗi tuần (QĐ16), hay chỉ bật cảnh báo bảo mật (Dependabot alerts và security updates)?
7. **Đường CPU của `llama-server` tự build** dịch khác bản chính thức 1/5 câu (QĐ4). Đề xuất: chấp nhận nếu Task 13 đạt A3 và S6; không đạt thì quay về kèm `.dylib` của bản chính thức (ký cùng Team ID).

## Ranh giới với 07b và danh sách việc của 07b

07a dừng ở chỗ: CI chạy được, hai bộ cài build được từ mã nguồn đã khóa, mọi bước ký đã viết và chạy khi có secret. 07b (viết sau 06, khi bản cài đủ tính năng) làm:

1. `tauri-plugin-updater` (cùng dòng 2.x với Tauri core, TLS của hệ điều hành như 04): manifest cập nhật trên CDN, kiểm lúc khởi động và mỗi 24 giờ, cài ở lần thoát kế tiếp, mời khởi động lại khi rảnh (Q13), hai kênh stable và beta theo `updateChannel` (dòng 50, 203, 204). Khởi động lại để cập nhật dùng `AppHandle::request_restart` (đi qua `RunEvent::Exit`, 03 lưu lịch sử ở đó) và không bị chặn thoát (dòng 63).
2. Khóa công khai của bản cập nhật trong cấu hình app; bật `requireSignedVersion` (chữ ký đã gắn phiên bản, QĐ20); sinh và ký `latest.json` cho từng kênh trong `release.yml`; thử cập nhật thật từ bản trước (dòng 307).
3. Tạo khóa production theo Q17: một khóa ký bản cập nhật (`tauri signer generate`), một khóa ký manifest model (`scripts/models/gen-manifest-key.mjs` của 04), tạo trên máy không nối mạng hay trong CI, nhập thẳng vào secret của environment `release`, kèm bản sao offline mã hóa bằng passphrase (USB; passphrase in ra giấy). Ghi khóa công khai manifest vào khối `production` của `src-tauri/keys/manifest-public-keys.json`, đặt `PRODUCTION_URL` (04); chạy `sign-manifest.yml` lần đầu.
4. Ký thật: macOS (T1) với notarize và staple; đo lại thời gian chờ lần đầu với bản đã ký (dòng 150); Windows (T2) với `MT_WINDOWS_SIGN_CMD` và secret của dịch vụ ký; tự kiểm chữ ký lúc khởi động có Team ID, tên chủ chứng thư thật (dòng 264, 06 và 07).
5. Chuỗi phát hành cuối: tag `v*`, bản nháp GitHub Release hay tải lên CDN, công bố SHA-256 trên website (dòng 270), thêm tên miền website vào `navigation::EXTERNAL_HOSTS` (T7).
6. THIRD_PARTY_NOTICES sau 03 và 06: SQLCipher (BSD), OpenSSL 3.6.3 (Apache-2.0, chỉ Windows), câu mẫu FLEURS (CC BY 4.0), thư viện vẽ mã QR (06); `clarify` trong `about.toml` cho crate nhúng mã nguồn C (`libsqlite3-sys`, `openssl-src`), có checksum của file giấy phép thật.
7. Windows: giá trị trong `Run` không có dấu nháy (01, mục 2.7 của kế hoạch 00): ghi lại giá trị có nháy sau `enable()`, có test bằng bản giả; thử ở đợt Windows.
8. Entitlement của hardened runtime nếu Task 15 cho thấy cần (thu âm thanh hệ thống, Metal).
9. Xem lại cache của CI và lịch chạy (điểm cần quyết 4) sau khi có số phút thật của Task 14.
10. EULA trong bộ cài và màn hình Giới thiệu (Q8), `publisher`, `copyright` (điểm cần quyết 5); logo thật thay biểu tượng tạm (dòng 196).
