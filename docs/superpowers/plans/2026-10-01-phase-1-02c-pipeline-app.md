# Phase 1 · 02c: Pipeline trong app — nối vào app

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Phần cuối của kế hoạch 02 (mục 2.2 của kế hoạch 00): bấm Bắt đầu (nút, phím tắt hoặc khay) là có phụ đề dịch thật từ âm thanh hệ thống. Gồm:
- tiến trình phụ trong `src-tauri/binaries/`: script chép cho bản dev, bảng SHA-256 build sẵn và kiểm trước mọi lần chạy (Đ15, QĐ17), chặn thư viện lạ, nhận biết lần đầu chạy binary mới, dò GPU trên Windows ở luồng nền;
- nguồn âm thanh của phiên (`capture.rs`): mở theo cài đặt, mở lại khi thiết bị đổi hay app đã chọn thoát, chỉ báo lỗi kéo dài, nghi thiếu quyền khi toàn im lặng, chèn im lặng theo đồng hồ thật;
- `session.rs` thay `session_stub.rs`: bắt đầu, dừng, hủy ngay khi đang nạp model, lỗi làm phiên dừng, sự kiện `subtitle://upsert`, `subtitle://delta`, `audio://level`, trạng thái phiên (có `rev`), chạy sẵn tiến trình phụ khi mở cửa sổ chính, tắt sau 10 phút rảnh, Thoát không chờ tiến trình phụ, dọn tiến trình phụ còn sót sau Force Quit;
- lệnh chọn nguồn âm thanh (app có tên hiển thị) và mở trang quyền ghi âm thanh hệ thống; câu xin quyền tiếng Anh và tiếng Việt (`InfoPlist.strings`);
- giao diện: trạng thái và lỗi của phiên, mức âm lượng, Cài đặt › Âm thanh, bước quyền ở lần đầu mở app, chữ dịch hiện dần và gộp phụ đề trên thanh phụ đề (mức tối thiểu; phần hoàn chỉnh ở 03);
- thử tay trên Mac với âm thanh thật, đợt Windows, cập nhật kế hoạch 00.

**Kiến trúc:**
- `session.rs` giữ phần bên ngoài sau trait `SessionDeps`: app dùng `LiveDeps` (tiến trình phụ thật qua `pipeline::supervisor`, nguồn âm thanh thật, Silero VAD); test dùng `FakeDeps` trong `test_support.rs` (ASR và MT giả trong tiến trình, âm thanh tổng hợp, VAD theo năng lượng). Nhờ vậy luồng bắt đầu, dừng, lỗi test được bằng `MockRuntime`.
- Bắt đầu phiên chặn lâu (nạp model), nên chạy trên luồng nền: lệnh `toggle_session` là `async` và gọi `spawn_blocking`; phím tắt, khay, Thoát chạy trên luồng riêng (QĐ19).
- Phụ đề đi thẳng từ luồng phụ đề của engine ra sự kiện Tauri; chỉ báo và trạng thái đi qua `app://status`.

**Công nghệ:** Như 02a. Thêm `sha2` 0.11.0 và dùng `rtrb` của workspace (bảng "Phiên bản đã chốt" của 02a). Không thêm gói npm.

Đọc trước 02a (`docs/superpowers/plans/2026-10-01-phase-1-02a-pipeline-crate.md`): các mục "Phiên bản đã chốt", "Cách đọc kế hoạch này", "Dòng của bảng đối chiếu", "Quyết định" và "Điểm cần chủ dự án quyết" áp cho file này. Làm file này sau khi 02a, 02d và 02b đã commit hết.

Chỗ nối của 01 mà file này dùng (`main` `f86b1b7`, code như `940c169`: 01 đã xong, kể cả các đợt sửa R và U; tên AI Translator, bundle id `com.aitranslator.desktop`): `session_stub.rs` và chỗ gọi nó trong `actions.rs`, `lib.rs`; trait `overlay::Surface` (hiện, ẩn thanh phụ đề), `SystemOpener` (mở trang ngoài app), `LoginItem` và `SettingsFile`, cùng bản giả trong `test_support.rs` (`mock_app` cài sẵn cả bốn, nên test không đụng LaunchAgent, Login Items, file cài đặt hay System Settings thật); danh sách lệnh cố định của test ACL lấy từ `commands::MAIN_COMMANDS`. Câu mới trong `src/i18n/` nhắc tên app thì dùng "AI Translator". Phần của đợt U được giữ nguyên: nút Bắt đầu/Dừng khóa khi đang gửi lệnh (`sessionPending`, `disabled={pending}` trong `Home.tsx`), test M11 và M12 của `overlay.test.ts`, `init()` gỡ listener khi lỗi và lệnh thành công thì xóa lỗi cũ (`store/app.ts`), các tab của `SettingsScreen.tsx`. `Cargo.toml` của app giữ autostart 2.6.0, single-instance 2.5.1 như `main` lúc lập kế hoạch; nếu `main` đã nâng plugin Tauri thì giữ bản của `main` (02 không nâng plugin).

**Ghi chú cho 06** (review 02 lần 2): `EventSink::usage` chạy trên luồng phụ đề của engine; bộ đếm phút của 06 không được ghi kho khóa (Keychain, Credential Manager) đồng bộ ở đó, mà đưa sang luồng khác. Chỗ nối "hạn mức còn 0 thì không bắt đầu" là `SessionDeps::check_quota` (Task 3), mặc định cho bắt đầu.

**Ghi chú cho 03** (N8 của review 02b): nguồn `SystemExceptSelf` chỉ loại các pid của chính app. Tiếng do WebView của app phát ra đi qua tiến trình `com.apple.WebKit.GPU` (macOS) nên vẫn bị thu; bước nghe thử của 03 không được phát tiếng mẫu qua WebView mà mong nó bị loại.

---

## Task 1: Tiến trình phụ trong `src-tauri/binaries/`

Dòng 136, 205, 272, 313; Đ15; QĐ17, QĐ18:
- `scripts/copy-sidecars.sh`: chép `asr-worker` (build `metal,shared-encode`) và `llama-server` b11146 cùng các `.dylib` nó cần vào `src-tauri/binaries/`, tên kèm target triple như `externalBin` của Tauri. Thư mục này bị `.gitignore` bỏ qua; bản phát hành do CI của 07 build.
- `build.rs`: băm SHA-256 mọi file trong `binaries/` vào `OUT_DIR/sidecar_hashes.rs`, và đặt `SIDECAR_TARGET` (target triple lúc build). Tạo `binaries/` rỗng nếu chưa có, vì `rerun-if-changed` với đường dẫn không tồn tại làm cargo build lại app ở mọi lần chạy.
- `sidecar/paths.rs`: tên file và chỗ đặt tiến trình phụ, model của từng gói (bản dev theo `tauri::is_dev()`).
- `sidecar/integrity.rs`: kiểm SHA-256 theo bảng build sẵn; file thiếu, không có trong bảng, hay khác bảng đều bị từ chối; thư viện lạ trong thư mục (`.dll`, `.dylib`, `.so`, `libggml-…`, `ggml-…`) cũng bị từ chối; Unix: file trong bảng mà người khác ghi được thì từ chối; Windows: file đã kiểm được giữ mở với share mode chỉ cho đọc (`Verified::locks`, N2(b), N2(c) của review 02c; QĐ17), có test `#[cfg(windows)]`: khi còn khóa thì không mở để ghi, đổi tên hay xóa được, nhưng binary vẫn chạy (N-7 của review 02 lần 2; chạy ở Task 9).
- `sidecar/first_run.rs`: `sidecars-seen.json`, nhớ binary nào đã chạy được, để biết lần đầu chạy binary mới.
- `sidecar/probe.rs`: Windows, chạy `asr-worker-vulkan --probe` để chọn bản GPU hay CPU (§6.4): thư mục làm việc là thư mục của binary, stdout đọc trên luồng riêng và chỉ giữ 64 KiB đầu (`read_capped`, N-2 của review 02 lần 2), chờ 10 giây (60 giây với binary chưa từng chạy, vì Defender quét lần đầu), quá giờ thì trả "chưa biết" để lần sau dò lại (Q7 của review 02c).

**Files:**
- Sửa: `.gitignore`
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Tạo: `scripts/copy-sidecars.sh`
- Sửa: `src-tauri/Cargo.toml`
- Sửa: `src-tauri/build.rs`
- Sửa: `src-tauri/src/lib.rs`
- Tạo: `src-tauri/src/sidecar/first_run.rs`
- Tạo: `src-tauri/src/sidecar/integrity.rs`
- Tạo: `src-tauri/src/sidecar/mod.rs`
- Tạo: `src-tauri/src/sidecar/paths.rs`
- Tạo: `src-tauri/src/sidecar/probe.rs`

- [ ] **Step 1: Khai báo phụ thuộc và module**

Bước này sửa `src-tauri/Cargo.toml`. Nếu `main` đã nâng plugin Tauri (autostart, single-instance, `tauri-plugin`, `tauri-utils`) thì giữ bản của `main`: khối dưới chỉ thêm các dòng của 02; nếu `git apply --check` lệch chỉ vì dòng phiên bản plugin làm ngữ cảnh, áp bằng `git apply --3way`, không đổi phiên bản về bản cũ.

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -10,13 +10,17 @@
 name = "meeting_translator_lib"
 
 [build-dependencies]
+# SHA-256 của tiến trình phụ trong `binaries/`, build sẵn vào app (spec §10.2, Đ15 của kế hoạch 00).
+sha2 = "0.11.0"
 tauri-build = { version = "2.7.0", features = [] }
 
 [dependencies]
 keyring-core = "1.0.0"
 log = "0.4.34"
+pipeline = { path = "../crates/pipeline" }
 serde.workspace = true
 serde_json.workspace = true
+sha2 = "0.11.0"
 sys-locale = "0.3.2"
 tauri = { version = "2.12.0", features = ["macos-private-api", "tray-icon"] }
 tauri-plugin-autostart = "2.6.0"
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -21,6 +21,7 @@
 pub mod security;
 pub mod session_stub;
 pub mod settings;
+pub mod sidecar;
 pub mod state;
 pub mod system;
 pub mod tray;
```

Tạo `src-tauri/src/sidecar/mod.rs`:

```rust
//! Phần của app quanh hai tiến trình phụ (Đ2 của kế hoạch 00): tìm file, kiểm SHA-256, nhớ binary đã chạy, dò GPU trên
//! Windows, rồi dựng `SidecarSpec`. Việc chạy và giám sát nằm ở `pipeline::supervisor`.

pub mod first_run;
pub mod integrity;
pub mod paths;
pub mod probe;
```

- [ ] **Step 2: Viết test**

Tạo `src-tauri/src/sidecar/first_run.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! "Lần đầu chạy một binary mới" (spec §6.5): sau khi cài hoặc cập nhật, macOS kiểm tra binary khoảng 15 giây trước khi nó
//! chạy. App nhớ SHA-256 của các binary đã từng chạy tới `Ready` (file `sidecars-seen.json` trong thư mục dữ liệu); binary
//! có băm chưa gặp là lần đầu: chờ lâu hơn, không tính là lỗi, giao diện báo "Đang chuẩn bị lần đầu".

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_binary_is_new_until_it_has_run_once() {
        let dir = std::env::temp_dir().join(format!("mt-first-run-{}", std::process::id()));
        let file = dir.join("sub/sidecars-seen.json");
        assert!(is_first_run(&file, "aaa"));
        mark_seen(&file, "aaa").unwrap();
        assert!(!is_first_run(&file, "aaa"));
        assert!(is_first_run(&file, "bbb"), "bản cập nhật có băm mới");
        for i in 0..10 {
            mark_seen(&file, &format!("h{i}")).unwrap();
        }
        assert!(is_first_run(&file, "aaa"), "chỉ nhớ 8 bản gần nhất");
        assert!(!is_first_run(&file, "h9"));
        std::fs::write(&file, "hỏng").unwrap();
        assert!(is_first_run(&file, "h9"), "file hỏng thì coi như chưa gặp");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

Tạo `src-tauri/src/sidecar/integrity.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Kiểm SHA-256 của tiến trình phụ và thư viện đi kèm trước khi chạy (spec §10.2, "Thay tiến trình phụ, hoặc chèn thư
//! viện giả"; Đ15 của kế hoạch 00). Danh sách băm sinh lúc build từ `src-tauri/binaries/` (build.rs); kế hoạch 07 bảo đảm
//! CI sinh danh sách từ đúng các file phát hành.
//!
//! Ngoài các file trong bảng, thư mục không được có file dạng thư viện lạ (`.dll`, `.dylib`, `.so`, hay tên bắt đầu bằng
//! `libggml-`, `ggml-`): `llama-server` b11146 tự nạp mọi backend ggml nó thấy trong thư mục của nó (`ggml_backend_load_all`),
//! nên một thư viện thả thêm vào đó sẽ chạy trong tiến trình phụ (đã thử ở review 02c). Unix: file trong bảng mà nhóm hay
//! người khác ghi được thì cũng từ chối.
//!
//! Khoảng hở giữa lúc kiểm và lúc chạy (TOCTOU): trên Windows, mọi file đã kiểm được mở với share mode chỉ cho đọc và giữ
//! handle ([`Verified::locks`]), nên không ai sửa, đổi tên hay xóa được chúng khi app còn giữ. Trên macOS dựa vào chữ ký
//! và library validation của bản phát hành (kế hoạch 07).

#[cfg(test)]
mod tests {
    use super::*;

    struct Temp(std::path::PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn setup(name: &str) -> (Temp, Vec<(String, String)>) {
        let dir = std::env::temp_dir().join(format!("mt-integrity-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut table = Vec::new();
        for (file, bytes) in [
            ("asr-worker", &b"worker"[..]),
            ("llama-server", b"server"),
            ("libggml.0.dylib", b"lib"),
        ] {
            let path = dir.join(file);
            std::fs::write(&path, bytes).unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            }
            table.push((file.to_string(), sha256_file(&path).unwrap()));
        }
        (Temp(dir), table)
    }

    fn borrowed(table: &[(String, String)]) -> Vec<(&str, &str)> {
        table.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect()
    }

    #[test]
    fn sha256_matches_shasum() {
        let (t, _) = setup("known");
        // `printf worker | shasum -a 256`
        assert_eq!(
            sha256_file(&t.0.join("asr-worker")).unwrap(),
            "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e"
        );
    }

    /// N-7 của review 02 lần 2 (Windows, N2(c) của review 02c): khi `Verified::locks` còn giữ, không ai mở được file để
    /// ghi, đổi tên hay xóa, nhưng binary vẫn chạy được.
    #[cfg(windows)]
    #[test]
    fn verified_files_are_read_only_while_locked_but_still_run() {
        let dir = std::env::temp_dir().join(format!("mt-integrity-lock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let t = Temp(dir.clone());
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let exe = t.0.join("asr-worker.exe");
        std::fs::copy(std::path::Path::new(&system).join(r"System32\whoami.exe"), &exe).unwrap();
        let table = [("asr-worker.exe".to_string(), sha256_file(&exe).unwrap())];
        let verified = verify(&t.0, &[&exe], &borrowed(&table)).unwrap();
        assert_eq!(verified.locks.len(), 1);
        assert!(
            std::fs::OpenOptions::new().write(true).open(&exe).is_err(),
            "không mở để ghi được"
        );
        assert!(
            std::fs::rename(&exe, t.0.join("khac.exe")).is_err(),
            "không đổi tên được"
        );
        assert!(std::fs::remove_file(&exe).is_err(), "không xóa được");
        let ran = std::process::Command::new(&exe).output().unwrap();
        assert!(ran.status.success(), "binary vẫn chạy được");
        drop(verified);
        assert!(
            std::fs::OpenOptions::new().write(true).open(&exe).is_ok(),
            "bỏ khóa thì ghi được"
        );
    }

    #[test]
    fn untouched_files_pass_and_return_the_executable_hashes() {
        let (t, table) = setup("ok");
        let verified = verify(
            &t.0,
            &[&t.0.join("asr-worker"), &t.0.join("llama-server")],
            &borrowed(&table),
        )
        .unwrap();
        assert_eq!(verified.hashes, [table[0].1.clone(), table[1].1.clone()]);
        assert_eq!(verified.locks.len(), if cfg!(windows) { 3 } else { 0 });
    }

    #[test]
    fn a_changed_library_or_executable_is_refused() {
        let (t, table) = setup("tampered");
        std::fs::write(t.0.join("libggml.0.dylib"), b"LIB").unwrap();
        let err = verify(&t.0, &[&t.0.join("asr-worker")], &borrowed(&table)).unwrap_err();
        assert_eq!(err, IntegrityError::Tampered("libggml.0.dylib".into()));
        for exe in ["asr-worker", "llama-server"] {
            let (t, table) = setup(&format!("exe-{exe}"));
            std::fs::write(t.0.join(exe), b"EVIL").unwrap();
            let err = verify(&t.0, &[&t.0.join(exe)], &borrowed(&table)).unwrap_err();
            assert_eq!(err, IntegrityError::Tampered(exe.into()), "thay chính file {exe}");
        }
    }

    /// N2(b) của review 02c: thư viện thả thêm vào thư mục (llama-server sẽ tự nạp) bị từ chối.
    #[test]
    fn an_extra_library_in_the_folder_is_refused() {
        for extra in ["libggml-cuda-x.so", "ggml-cpu-x.dll", "libfoo.dylib", "libbar.so.1"] {
            let (t, table) = setup(&format!("extra-{extra}"));
            std::fs::write(t.0.join(extra), b"x").unwrap();
            let err = verify(&t.0, &[&t.0.join("asr-worker")], &borrowed(&table)).unwrap_err();
            assert_eq!(err, IntegrityError::Unverified(extra.into()));
        }
        assert!(!looks_like_library("asr-worker"));
        assert!(!looks_like_library("notes.txt"));
    }

    #[cfg(unix)]
    #[test]
    fn a_file_others_can_write_is_refused() {
        use std::os::unix::fs::PermissionsExt;
        let (t, table) = setup("writable");
        std::fs::set_permissions(t.0.join("llama-server"), std::fs::Permissions::from_mode(0o775)).unwrap();
        let err = verify(&t.0, &[&t.0.join("asr-worker")], &borrowed(&table)).unwrap_err();
        assert_eq!(err, IntegrityError::Writable("llama-server".into()));
    }

    #[test]
    fn unknown_or_missing_files_are_refused() {
        let (t, table) = setup("unknown");
        std::fs::write(t.0.join("other"), b"x").unwrap();
        let t2 = borrowed(&table);
        assert_eq!(
            verify(&t.0, &[&t.0.join("other")], &t2).unwrap_err(),
            IntegrityError::Unverified("other".into())
        );
        assert_eq!(
            verify(&t.0, &[&t.0.join("nowhere")], &t2).unwrap_err(),
            IntegrityError::Missing("nowhere".into())
        );
        std::fs::remove_file(t.0.join("llama-server")).unwrap();
        assert_eq!(
            verify(&t.0, &[&t.0.join("asr-worker")], &t2).unwrap_err(),
            IntegrityError::Missing("llama-server".into())
        );
    }
}
```

Tạo `src-tauri/src/sidecar/paths.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Chỗ đặt tiến trình phụ (spec §6.11) và model (§6.7).
//!
//! - Tiến trình phụ: bản dev ở `src-tauri/binaries/`, tên kèm target triple (`scripts/copy-sidecars.sh` chép vào); bản
//!   phát hành nằm cạnh file chạy của app, tên không kèm triple (Tauri `externalBin` bỏ triple khi đóng gói, kế hoạch 07).
//! - Model: bản dev đọc `MT_MODELS_DIR`, không đặt thì `<repo>/models`; bản phát hành ở `app_local_data_dir/models`
//!   (kế hoạch 04 tải về đó).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_follow_the_external_bin_convention() {
        assert_eq!(
            file_name("asr-worker", "aarch64-apple-darwin", true, false),
            "asr-worker-aarch64-apple-darwin"
        );
        assert_eq!(
            file_name("asr-worker", "aarch64-apple-darwin", false, false),
            "asr-worker"
        );
        assert_eq!(
            file_name("llama-server", "x86_64-pc-windows-msvc", true, true),
            "llama-server-x86_64-pc-windows-msvc.exe"
        );
    }

    #[test]
    fn windows_has_two_asr_workers_and_macos_one() {
        let mac = sidecar_files(Path::new("/b"), "aarch64-apple-darwin", true, false);
        assert_eq!(mac.asr_gpu, mac.asr_cpu);
        let win = sidecar_files(Path::new("/b"), "x86_64-pc-windows-msvc", false, true);
        assert_eq!(win.asr_gpu, Path::new("/b/asr-worker-vulkan.exe"));
        assert_eq!(win.asr_cpu, Path::new("/b/asr-worker-cpu.exe"));
        assert_eq!(win.llama, Path::new("/b/llama-server.exe"));
    }

    #[test]
    fn model_files_by_tier() {
        let std = model_files(Path::new("/m"), None);
        assert_eq!(std.asr, Path::new("/m/ggml-large-v3-turbo-q5_0.bin"));
        assert_eq!(std.mt, Path::new("/m/Hy-MT2-1.8B-Q8_0.gguf"));
        let lite = model_files(Path::new("/m"), Some(ModelTier::Lite));
        assert_eq!(lite.asr, Path::new("/m/ggml-small-q5_1.bin"));
        assert_eq!(lite.vad, Path::new("/m/silero_vad_v6.2.3.onnx"));
        assert_eq!(first_missing(&lite), Some(Path::new("/m/ggml-small-q5_1.bin")));
    }
}
```

Tạo `src-tauri/src/sidecar/probe.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Windows: chọn `asr-worker-vulkan` hay `asr-worker-cpu` theo kết quả `asr-worker-vulkan --probe` (spec §6.4). Lệnh này
//! in danh sách GPU dạng JSON (kế hoạch 0-03, Task 14) rồi thoát. Máy không có `vulkan-1.dll` thì tiến trình không chạy
//! được (mã `0xC0000135`, STATUS_DLL_NOT_FOUND): dùng bản CPU. Driver lỗi lúc dò cũng chỉ làm tiến trình phụ này chết.

#[cfg(test)]
mod tests {
    use super::*;

    /// N-2 của review 02 lần 2: chỉ giữ 64 KiB đầu của stdout, nhưng vẫn đọc hết phần còn lại.
    #[test]
    fn probe_output_is_capped() {
        let mut big = std::io::Cursor::new(vec![b'x'; 3 * PROBE_STDOUT_MAX as usize]);
        let kept = read_capped(&mut big, PROBE_STDOUT_MAX);
        assert_eq!(kept.len() as u64, PROBE_STDOUT_MAX);
        assert_eq!(
            big.position(),
            3 * PROBE_STDOUT_MAX,
            "đọc hết, không để tiến trình nghẽn"
        );
        assert_eq!(read_capped(&b"[]"[..], PROBE_STDOUT_MAX), "[]");
    }

    #[test]
    fn discrete_or_integrated_gpus_are_usable() {
        let discrete = r#"[{"name":"NVIDIA GeForce RTX 4050 Laptop GPU","device_type":"discrete","device_local_bytes":6425673728,"vendor_id":4318}]"#;
        assert!(usable_gpu(discrete));
        let integrated =
            r#"[{"name":"Intel(R) UHD","device_type":"integrated","device_local_bytes":268435456,"vendor_id":32902}]"#;
        assert!(usable_gpu(integrated));
    }

    #[test]
    fn no_gpu_software_renderer_or_garbage_means_cpu() {
        assert!(!usable_gpu("[]"), "bản CPU in []");
        let llvmpipe = r#"[{"name":"llvmpipe","device_type":"cpu","device_local_bytes":0,"vendor_id":65541}]"#;
        assert!(!usable_gpu(llvmpipe));
        assert!(!usable_gpu(""));
        assert!(!usable_gpu("vulkan-1.dll not found"));
    }

    #[cfg(unix)]
    #[test]
    fn a_probe_that_fails_or_hangs_means_cpu() {
        // `false` thoát với mã 1. `yes` in mãi không thoát: stdout được đọc trên luồng riêng nên không nghẽn, quá thời gian
        // chờ thì bị kill, và kết quả là "chưa biết" (không nhớ).
        assert_eq!(
            run_probe(Path::new("/usr/bin/false"), Duration::from_secs(5)),
            Some(false)
        );
        assert_eq!(run_probe(Path::new("/usr/bin/yes"), Duration::from_millis(200)), None);
        assert_eq!(
            run_probe(Path::new("/khong/co/file"), Duration::from_secs(1)),
            Some(false)
        );
        // `true` thoát 0 mà không in danh sách GPU nào.
        assert_eq!(
            run_probe(Path::new("/usr/bin/true"), Duration::from_secs(5)),
            Some(false)
        );
    }

    #[test]
    fn a_new_binary_gets_a_longer_probe() {
        assert_eq!(probe_timeout(true), Duration::from_secs(60));
        assert_eq!(probe_timeout(false), Duration::from_secs(10));
    }
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p meeting-translator --lib sidecar`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0433]: cannot find type `Path` in this scope
error[E0433]: cannot find type `ModelTier` in this scope
error[E0425]: cannot find value `PROBE_STDOUT_MAX` in this scope
error[E0433]: cannot find type `Duration` in this scope
error[E0425]: cannot find function `is_first_run` in this scope
error[E0425]: cannot find function `mark_seen` in this scope
```

- [ ] **Step 4: Viết code**

Sửa `.gitignore` (áp bằng `git apply`):

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -12,6 +12,8 @@
 
 # Tauri
 /src-tauri/gen/
+# Tiến trình phụ cho bản dev, do scripts/copy-sidecars.sh chép vào (bản phát hành: CI của kế hoạch 07)
+/src-tauri/binaries/
 # tauri-build sinh quyền cho command của app từ build.rs (app manifest), mỗi lần build đều ghi lại
 /src-tauri/permissions/autogenerated/
 
```

Tạo `scripts/copy-sidecars.sh`:

```bash
#!/bin/sh
# Chép hai tiến trình phụ vào src-tauri/binaries/ cho bản dev trên macOS (kế hoạch 00, dòng 205 của bảng đối chiếu), tên
# kèm target triple theo quy ước `externalBin` của Tauri. Build lại app sau đó: build.rs của src-tauri băm các file này, và
# app từ chối chạy tiến trình phụ có SHA-256 khác (spec §10.2).
#
#   scripts/copy-sidecars.sh              # build asr-worker (metal, shared-encode) rồi chép
#   scripts/copy-sidecars.sh <asr-worker> # chép một bản asr-worker đã build sẵn
#
# llama-server lấy từ bản chính thức b11146 (bench/phase0/fetch.py tải vào tools/), kèm các .dylib nó cần; llama-server
# tìm chúng qua @loader_path. Bản phát hành: CI của kế hoạch 07 build và ký.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
triple=aarch64-apple-darwin
out="$root/src-tauri/binaries"
llama_dir="$root/tools/llama-b11146/macos-arm64/llama-b11146"
if [ "$#" -ge 1 ]; then
  asr="$1"
else
  (cd "$root" && cargo build --release -p asr-worker --features metal,shared-encode)
  asr="${CARGO_TARGET_DIR:-$root/target}/release/asr-worker"
fi
mkdir -p "$out"
rm -f "$out"/*
cp "$asr" "$out/asr-worker-$triple"
cp "$llama_dir/llama-server" "$out/llama-server-$triple"
for lib in libllama-server-impl libllama-common.0 libmtmd.0 libllama.0 libggml.0 libggml-base.0 libggml-cpu.0 \
  libggml-blas.0 libggml-metal.0 libggml-rpc.0; do
  cp -L "$llama_dir/$lib.dylib" "$out/"
done
ls -1 "$out"
```

Thay toàn bộ `src-tauri/build.rs` bằng:

```rust
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::path::Path;

fn main() {
    sidecar_hashes();
    // App manifest: lệnh của app cũng đi qua ACL (spec §10.2). Cửa sổ nào không được cấp
    // `allow-<tên-lệnh>` trong capabilities thì không gọi được. Danh sách phải khớp
    // `src/commands.rs` (test `acl_tests::capabilities_grant_exactly_the_fixed_lists`).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_settings",
            "update_settings",
            "set_hotkey",
            "get_app_status",
            "toggle_session",
            "set_overlay_visible",
            "set_overlay_locked",
            "get_app_info",
            "open_log_dir",
            "open_taskbar_settings",
            "open_login_items_settings",
            "get_overlay_view",
        ])),
    )
    .expect("tauri-build thất bại");
}

/// SHA-256 của mọi file trong `binaries/` (tiến trình phụ và thư viện đi kèm), ghi vào `sidecar_hashes.rs` để app kiểm
/// trước khi chạy (spec §10.2, "Thay tiến trình phụ, hoặc chèn thư viện giả"; Đ15 của kế hoạch 00). Thư mục chưa có thì
/// danh sách rỗng, và app từ chối chạy tiến trình phụ nào.
fn sidecar_hashes() {
    let dir = Path::new("binaries");
    // Tạo thư mục rỗng nếu chưa có: `rerun-if-changed` với đường dẫn không tồn tại làm cargo build lại crate này mỗi lần.
    std::fs::create_dir_all(dir).expect("tạo được src-tauri/binaries/");
    println!("cargo:rerun-if-changed=binaries");
    println!(
        "cargo:rustc-env=SIDECAR_TARGET={}",
        std::env::var("TARGET").expect("cargo đặt TARGET")
    );
    let mut entries: Vec<(String, String)> = Vec::new();
    if let Ok(read) = std::fs::read_dir(dir) {
        for entry in read.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            println!("cargo:rerun-if-changed={}", path.display());
            let bytes = std::fs::read(&path).expect("đọc được file trong binaries/");
            let digest = Sha256::digest(&bytes);
            let hex = digest.iter().fold(String::new(), |mut s, b| {
                let _ = write!(s, "{b:02x}");
                s
            });
            entries.push((entry.file_name().to_string_lossy().into_owned(), hex));
        }
    }
    entries.sort();
    let mut out = String::from(
        "/// Sinh bởi build.rs: (tên file trong `binaries/`, SHA-256).\npub const SIDECAR_HASHES: &[(&str, &str)] = &[\n",
    );
    for (name, hex) in &entries {
        let _ = writeln!(out, "    ({name:?}, {hex:?}),");
    }
    out.push_str("];\n");
    let dest = Path::new(&std::env::var("OUT_DIR").expect("cargo đặt OUT_DIR")).join("sidecar_hashes.rs");
    std::fs::write(dest, out).expect("ghi được sidecar_hashes.rs");
}
```

Thêm vào `src-tauri/src/sidecar/first_run.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use std::path::Path;

pub fn is_first_run(seen_file: &Path, hash: &str) -> bool {
    !read(seen_file).iter().any(|h| h == hash)
}

pub fn mark_seen(seen_file: &Path, hash: &str) -> std::io::Result<()> {
    let mut seen = read(seen_file);
    if seen.iter().any(|h| h == hash) {
        return Ok(());
    }
    seen.push(hash.to_string());
    // Chỉ giữ vài bản gần nhất: mỗi lần cập nhật app có binary mới.
    let excess = seen.len().saturating_sub(8);
    seen.drain(..excess);
    if let Some(dir) = seen_file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(seen_file, serde_json::to_string(&seen)?)
}

fn read(seen_file: &Path) -> Vec<String> {
    std::fs::read_to_string(seen_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
```

Thêm vào `src-tauri/src/sidecar/integrity.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::fs::File;
use std::io::Read;
use std::path::Path;

include!(concat!(env!("OUT_DIR"), "/sidecar_hashes.rs"));

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum IntegrityError {
    #[error("thiếu {0}")]
    Missing(String),
    #[error("{0} không có trong danh sách build sẵn")]
    Unverified(String),
    #[error("{0} khác bản build sẵn")]
    Tampered(String),
    #[error("{0} để người khác ghi được")]
    Writable(String),
}

/// Kết quả kiểm: băm của từng file thực thi được hỏi, và (Windows) handle chỉ cho đọc của mọi file trong bảng. Giữ
/// `locks` tới khi không cần chạy tiến trình phụ nữa.
#[derive(Debug)]
pub struct Verified {
    pub hashes: Vec<String>,
    pub locks: Vec<File>,
}

/// Mở file để kiểm. Windows: share mode chỉ `FILE_SHARE_READ`, nên khi handle còn mở thì không ai ghi, đổi tên hay xóa
/// được file (tiến trình phụ vẫn chạy được, vì Windows chỉ cần quyền đọc).
fn open_locked(path: &Path) -> std::io::Result<File> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 0x1;
        options.share_mode(FILE_SHARE_READ);
    }
    options.open(path)
}

fn sha256_of(file: &mut File) -> std::io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    }))
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    sha256_of(&mut File::open(path)?)
}

/// Tên có dạng thư viện mà `llama-server` hay hệ điều hành có thể nạp.
pub fn looks_like_library(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".dll")
        || lower.ends_with(".dylib")
        || lower.ends_with(".so")
        || lower.contains(".so.")
        || lower.starts_with("libggml-")
        || lower.starts_with("ggml-")
}

#[cfg(unix)]
fn writable_by_others(file: &File) -> bool {
    use std::os::unix::fs::PermissionsExt;
    file.metadata().is_ok_and(|m| m.permissions().mode() & 0o022 != 0)
}

#[cfg(not(unix))]
fn writable_by_others(_: &File) -> bool {
    false
}

/// Kiểm mọi file trong `table` (tên file trong `dir`, SHA-256), mọi file thực thi trong `required` phải có trong bảng, và
/// không có thư viện lạ trong `dir`. Trả băm của từng file thực thi trong `required`, theo thứ tự.
pub fn verify(dir: &Path, required: &[&Path], table: &[(&str, &str)]) -> Result<Verified, IntegrityError> {
    let name = |p: &Path| {
        p.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    let mut hashes = Vec::new();
    for exe in required {
        let exe_name = name(exe);
        match table.iter().find(|(n, _)| *n == exe_name) {
            Some((_, hash)) => hashes.push(hash.to_string()),
            None if exe.is_file() => return Err(IntegrityError::Unverified(exe_name)),
            None => return Err(IntegrityError::Missing(exe_name)),
        }
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if looks_like_library(&file) && !table.iter().any(|(n, _)| *n == file) {
                return Err(IntegrityError::Unverified(file));
            }
        }
    }
    let mut locks = Vec::new();
    for (file, expected) in table {
        let mut handle = open_locked(&dir.join(file)).map_err(|_| IntegrityError::Missing(file.to_string()))?;
        if writable_by_others(&handle) {
            return Err(IntegrityError::Writable(file.to_string()));
        }
        let actual = sha256_of(&mut handle).map_err(|_| IntegrityError::Missing(file.to_string()))?;
        if actual != *expected {
            return Err(IntegrityError::Tampered(file.to_string()));
        }
        if cfg!(windows) {
            locks.push(handle);
        }
    }
    Ok(Verified { hashes, locks })
}
```

Thêm vào `src-tauri/src/sidecar/paths.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use std::path::{Path, PathBuf};

use crate::settings::ModelTier;

/// Target triple lúc build (build.rs đặt).
pub const TARGET: &str = env!("SIDECAR_TARGET");

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SidecarFiles {
    /// Bản `asr-worker` chạy GPU. macOS: cùng file với `asr_cpu`. Windows: `asr-worker-vulkan`.
    pub asr_gpu: PathBuf,
    pub asr_cpu: PathBuf,
    pub llama: PathBuf,
}

/// Tên file của một tiến trình phụ: `<tên>-<triple>` ở bản dev, `<tên>` ở bản phát hành; thêm `.exe` trên Windows.
pub fn file_name(base: &str, target: &str, dev: bool, windows: bool) -> String {
    let exe = if windows { ".exe" } else { "" };
    if dev {
        format!("{base}-{target}{exe}")
    } else {
        format!("{base}{exe}")
    }
}

pub fn sidecar_files(dir: &Path, target: &str, dev: bool, windows: bool) -> SidecarFiles {
    let at = |base: &str| dir.join(file_name(base, target, dev, windows));
    if windows {
        SidecarFiles {
            asr_gpu: at("asr-worker-vulkan"),
            asr_cpu: at("asr-worker-cpu"),
            llama: at("llama-server"),
        }
    } else {
        SidecarFiles {
            asr_gpu: at("asr-worker"),
            asr_cpu: at("asr-worker"),
            llama: at("llama-server"),
        }
    }
}

/// Thư mục chứa tiến trình phụ của bản đang chạy.
pub fn binaries_dir() -> std::io::Result<PathBuf> {
    if tauri::is_dev() {
        Ok(Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries"))
    } else {
        let exe = std::env::current_exe()?;
        Ok(exe.parent().map(Path::to_path_buf).unwrap_or_default())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelFiles {
    pub asr: PathBuf,
    pub mt: PathBuf,
    pub vad: PathBuf,
}

/// File model của một gói (§6.7). Chưa chọn gói (`modelTier` rỗng, kế hoạch 04 đặt) thì dùng gói Chuẩn.
pub fn model_files(dir: &Path, tier: Option<ModelTier>) -> ModelFiles {
    let (asr, mt) = match tier.unwrap_or(ModelTier::Standard) {
        ModelTier::Standard => ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
        ModelTier::Lite => ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
    };
    ModelFiles {
        asr: dir.join(asr),
        mt: dir.join(mt),
        vad: dir.join("silero_vad_v6.2.3.onnx"),
    }
}

/// Thư mục model của bản dev: `MT_MODELS_DIR`, không đặt thì `<repo>/models`.
pub fn dev_models_dir() -> PathBuf {
    std::env::var_os("MT_MODELS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../models"))
}

/// File model đầu tiên còn thiếu (§9: lúc bắt đầu chỉ kiểm có file; kích thước và SHA-256 theo manifest là việc của 04).
pub fn first_missing(files: &ModelFiles) -> Option<&Path> {
    [&files.asr, &files.mt, &files.vad]
        .into_iter()
        .find(|p| !p.is_file())
        .map(PathBuf::as_path)
}
```

Thêm vào `src-tauri/src/sidecar/probe.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use serde::Deserialize;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    /// `discrete`, `integrated`, `virtual`, `cpu` hoặc `other`.
    pub device_type: String,
    pub device_local_bytes: u64,
    pub vendor_id: u32,
}

/// Có GPU chạy được Vulkan không: card rời hoặc GPU tích hợp. (Đề xuất gói theo VRAM là việc của kế hoạch 04.)
pub fn usable_gpu(probe_stdout: &str) -> bool {
    serde_json::from_str::<Vec<GpuInfo>>(probe_stdout.trim())
        .map(|gpus| {
            gpus.iter()
                .any(|g| matches!(g.device_type.as_str(), "discrete" | "integrated"))
        })
        .unwrap_or(false)
}

/// Thời gian chờ `--probe`: binary đã từng chạy thì 10 giây; binary mới (vừa cài hay cập nhật) thì 60 giây, vì lần đầu
/// Windows Defender quét file có thể lâu (Q7 của review 02c).
pub fn probe_timeout(first_run: bool) -> Duration {
    Duration::from_secs(if first_run { 60 } else { 10 })
}

/// stdout của `--probe` giữ tối đa chừng này byte (danh sách thiết bị chỉ vài KiB); phần sau đọc rồi bỏ.
pub const PROBE_STDOUT_MAX: u64 = 64 * 1024;

/// Đọc hết `source` nhưng chỉ giữ `max` byte đầu (N-2 của review 02 lần 2): tiến trình in mãi không làm app hết bộ nhớ,
/// và vẫn không bị nghẽn vì pipe đầy.
pub fn read_capped(mut source: impl std::io::Read, max: u64) -> String {
    use std::io::Read;
    let mut kept = Vec::new();
    let _ = (&mut source).take(max).read_to_end(&mut kept);
    let _ = std::io::copy(&mut source, &mut std::io::sink());
    String::from_utf8_lossy(&kept).into_owned()
}

/// Chạy `exe --probe`, chờ tối đa `timeout`. `Some(true)`: có GPU dùng được. `Some(false)`: không có (lỗi chạy, mã thoát
/// khác 0, hay danh sách không có GPU nào dùng được). `None`: quá giờ; bên gọi không nên nhớ kết quả này, để lần sau dò
/// lại. stdout được đọc trên luồng riêng, để tiến trình in nhiều không bị nghẽn vì pipe đầy.
pub fn run_probe(exe: &Path, timeout: Duration) -> Option<bool> {
    let mut cmd = Command::new(exe);
    cmd.arg("--probe")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(dir) = exe.parent().filter(|d| !d.as_os_str().is_empty()) {
        cmd.current_dir(dir);
    }
    pipeline::process::configure(&mut cmd);
    let Ok(mut child) = pipeline::process::spawn(&mut cmd, exe) else {
        return Some(false);
    };
    let reader = child
        .stdout
        .take()
        .map(|stdout| std::thread::spawn(move || read_capped(stdout, PROBE_STDOUT_MAX)));
    let started = Instant::now();
    let result = loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break Some(true),
            Ok(Some(status)) => {
                log::info!("{} --probe thoát với {status}: dùng bản CPU", exe.display());
                break Some(false);
            }
            Ok(None) if started.elapsed() < timeout => std::thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                log::warn!(
                    "{} --probe quá {timeout:?}: lần này dùng bản CPU, lần sau dò lại",
                    exe.display()
                );
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                break Some(false);
            }
        }
    };
    pipeline::process::release(child.id());
    let out = reader.and_then(|r| r.join().ok()).unwrap_or_default();
    result.map(|ok| ok && usable_gpu(&out))
}
```

Run: `chmod +x scripts/copy-sidecars.sh`

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p meeting-translator --lib sidecar`
Expected:

```text
test sidecar::probe::tests::a_new_binary_gets_a_longer_probe ... ok
test sidecar::paths::tests::names_follow_the_external_bin_convention ... ok
test sidecar::paths::tests::windows_has_two_asr_workers_and_macos_one ... ok
test sidecar::paths::tests::model_files_by_tier ... ok
test sidecar::probe::tests::probe_output_is_capped ... ok
test sidecar::probe::tests::discrete_or_integrated_gpus_are_usable ... ok
test sidecar::probe::tests::no_gpu_software_renderer_or_garbage_means_cpu ... ok
test sidecar::integrity::tests::untouched_files_pass_and_return_the_executable_hashes ... ok
test sidecar::integrity::tests::sha256_matches_shasum ... ok
test sidecar::integrity::tests::a_file_others_can_write_is_refused ... ok
test sidecar::integrity::tests::unknown_or_missing_files_are_refused ... ok
test sidecar::integrity::tests::a_changed_library_or_executable_is_refused ... ok
test sidecar::first_run::tests::a_binary_is_new_until_it_has_run_once ... ok
test sidecar::probe::tests::a_probe_that_fails_or_hangs_means_cpu ... ok
test sidecar::integrity::tests::an_extra_library_in_the_folder_is_refused ... ok
test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 110 filtered out; finished in 0.38s
```

- [ ] **Step 6: Chép tiến trình phụ cho bản dev** (cần bản release của `asr-worker`, 02a Task 1 Step 7)

Run: `scripts/copy-sidecars.sh target/release/asr-worker && du -sh src-tauri/binaries`
Expected: 12 file, khoảng 26 MB:

```text
asr-worker-aarch64-apple-darwin
libggml-base.0.dylib
libggml-blas.0.dylib
libggml-cpu.0.dylib
libggml-metal.0.dylib
libggml-rpc.0.dylib
libggml.0.dylib
libllama-common.0.dylib
libllama-server-impl.dylib
libllama.0.dylib
libmtmd.0.dylib
llama-server-aarch64-apple-darwin
 26M	src-tauri/binaries
```

Run: `src-tauri/binaries/llama-server-aarch64-apple-darwin --version 2>&1 | grep -i version`
Expected: `llama-server` chạy được từ `binaries/`, tức tìm được các `.dylib` cùng thư mục:

```text
version: 0.5.0-dev (build 11146, commit 7fe450e19)
```

- [ ] **Step 7: Clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 8: Commit**

```bash
git add .gitignore \
  Cargo.lock \
  scripts/copy-sidecars.sh \
  src-tauri/Cargo.toml \
  src-tauri/build.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/sidecar/first_run.rs \
  src-tauri/src/sidecar/integrity.rs \
  src-tauri/src/sidecar/mod.rs \
  src-tauri/src/sidecar/paths.rs \
  src-tauri/src/sidecar/probe.rs
git commit -m "feat(app): tiến trình phụ trong binaries/, SHA-256 build sẵn, lần đầu chạy, dò GPU (Đ15)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Nguồn âm thanh của phiên, mã lỗi mới

Dòng 7, 85–88, 90, 91, 94, 98, 230, 232, 248; QĐ16, QĐ20:
- `capture.rs` (QĐ28): `LiveCapture` (trait `FrameSource` của engine).
  - Nguồn được mở và chạy trên luồng riêng; mỗi 500 ms kiểm thiết bị phát mặc định (cả nguồn toàn hệ thống lẫn nguồn một app) và luồng thu, đổi hay chết thì mở lại (Q3 của review 02c). Nguồn một app trên macOS tap mọi tiến trình của app (`TapTarget::Processes`).
  - `StallWatch`: macOS, số khung đứng yên 3 giây trong khi app cần thu đang phát thì tap đã chết, mở lại; mở lại 3 lần liên tiếp mà vẫn không có khung thì chờ lâu dần, tối đa 30 giây (`StallBackoff`, Nhỏ-5 của review 02 lần 3); nguồn một app còn mở lại khi app có tiến trình phát tiếng chưa được tap (`pids_changed`; tập chỉ thu nhỏ thì không, Nhỏ-6); số liệu thu ghi vào log mỗi 60 giây (Q-G của review 02 lần 2). Quyết định của mỗi lần kiểm và việc báo sau một lần mở thất bại là hai hàm thuần có test (`on_tick`, `failure_event`; Nhỏ-3); phần thân của một lần kiểm qua nhiều lần mở (`Watch`: `StallWatch` với bậc chờ của `StallBackoff`, có khung trở lại thì về bậc đầu ngay trong lần mở đó) cũng có test (Nhỏ-1, Nhỏ-2 của review 02 lần 4).
  - `FailurePolicy`: lần mở đầu lỗi thì báo ngay; nguồn đã chạy rồi mà lỗi thì chỉ báo khi lỗi kéo dài 10 giây (Q2); nguồn một app đã chạy rồi mà app không phát nữa thì không dừng phiên: báo `CaptureEvent::WaitingForApp`, thử lại mỗi 2 giây (Q-C của review 02 lần 2).
  - `ZeroWatch`: macOS, mẫu toàn số 0 tuyệt đối 3 giây trong khi app cần thu đang phát (nguồn một app: chính app đó) thì báo nghi thiếu quyền, không dừng phiên (Q4); đã có một mẫu khác 0 trong phiên thì tắt hẳn (Q-B của review 02 lần 2).
  - `ClockFiller` chèn im lặng theo đồng hồ thật khi nguồn không trả mẫu. Âm thanh chỉ nằm trong RAM. Hủy `LiveCapture` thì chờ luồng thu tối đa 500 ms.
  - Lỗi mở nguồn đổi thành mã cho giao diện: `appNotPlaying` (app đã chọn không phát tiếng), `audioPermission` (tạo tap lỗi trên macOS, thường là chưa cấp quyền; chờ C1), `captureFailed`.
- `errors.rs`: mã lỗi của phiên dịch (§9): `sidecarMissing`, `sidecarTampered`, `sidecarFailed`, `modelMissing`, `modelBroken`, `audioPermission`, `captureFailed`, `appNotPlaying`, `vadFailed`, `quotaExhausted` (06 thêm thời điểm reset và nút nâng gói), và `unknown` cho lỗi bên trong không thuộc loại nào; đặt sau `UNSUPPORTED` của 01, dưới tiêu đề riêng; câu tiếng Anh và tiếng Việt trong `src/i18n/` (test `every_error_code_has_ui_text` bắt chỗ thiếu).

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `src-tauri/Cargo.toml`
- Tạo: `src-tauri/src/capture.rs`
- Sửa: `src-tauri/src/errors.rs`
- Sửa: `src-tauri/src/lib.rs`
- Sửa: `src/i18n/en.ts`
- Sửa: `src/i18n/vi.ts`

- [ ] **Step 1: Khai báo phụ thuộc và module**

Bước này sửa `src-tauri/Cargo.toml`. Nếu `main` đã nâng plugin Tauri (autostart, single-instance, `tauri-plugin`, `tauri-utils`) thì giữ bản của `main`: khối dưới chỉ thêm các dòng của 02; nếu `git apply --check` lệch chỉ vì dòng phiên bản plugin làm ngữ cảnh, áp bằng `git apply --3way`, không đổi phiên bản về bản cũ.

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -15,9 +15,12 @@
 tauri-build = { version = "2.7.0", features = [] }
 
 [dependencies]
+anyhow.workspace = true
+audio-capture = { path = "../crates/audio-capture" }
 keyring-core = "1.0.0"
 log = "0.4.34"
 pipeline = { path = "../crates/pipeline" }
+rtrb.workspace = true
 serde.workspace = true
 serde_json.workspace = true
 sha2 = "0.11.0"
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -7,6 +7,7 @@
 //! Kế hoạch 02 nối `audio-capture` và `pipeline` vào, thay `session_stub.rs` bằng `session.rs`.
 
 pub mod actions;
+pub mod capture;
 pub mod commands;
 pub mod errors;
 pub mod events;
```

- [ ] **Step 2: Viết test**

Tạo `src-tauri/src/capture.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Nối `audio-capture` vào pipeline (spec §6.1, §6.2, §9): mở nguồn âm thanh theo cài đặt `audioSource`, đưa mẫu 16 kHz
//! mono cho `pipeline::engine`.
//!
//! - Nguồn được mở và chạy trên một luồng riêng ("capture"), để việc mở (tạo tap và aggregate device, lần đầu macOS có
//!   thể hỏi quyền) không chặn luồng VAD.
//! - Mỗi 500 ms luồng đó xem thiết bị phát mặc định đã đổi chưa (cắm tai nghe, Bluetooth, tai nghe đổi tần số mẫu) và
//!   luồng thu còn sống không (`AudioSource::failed`; macOS chỉ tap một app: app đó đã thoát); có thì mở lại nguồn (§9:
//!   khởi tạo lại trong ≤ 2 giây). Áp cho cả nguồn toàn hệ thống lẫn nguồn một app.
//! - macOS, tap chết mà không báo gì (`coreaudiod` khởi động lại, aggregate mất sau khi máy ngủ; Q-G của review 02 lần 2):
//!   số khung nhận được ([`CaptureStats::frames`]) không tăng suốt 3 giây trong khi app cần thu vẫn đang phát tiếng thì mở
//!   lại nguồn ([`StallWatch`]). Aggregate đặt `tapautostart`, nên lúc không app nào phát thì không có khung nào là
//!   bình thường; vì vậy chỉ xét khi có app phát. Mở lại 3 lần liên tiếp mà vẫn không có khung thì chờ lâu dần, tối đa
//!   30 giây ([`StallBackoff`]). Nguồn một app: app có tiến trình phát tiếng chưa được tap (helper mới, pid được cấp lại)
//!   thì cũng mở lại; tập chỉ thu nhỏ thì không. Quyết định của mỗi lần kiểm là hàm thuần [`on_tick`].
//! - Báo lỗi ([`FailurePolicy`]): lần mở đầu tiên lỗi thì báo ngay. Nguồn đã chạy được rồi mà lỗi (đang mở lại) thì chỉ báo
//!   khi lỗi kéo dài từ 10 giây, vì §9 đòi tự khởi tạo lại, không dừng phiên. Nguồn một app đã chạy được rồi mà app đó
//!   không phát tiếng nữa (đã đóng, Q-C của review 02 lần 2) thì không dừng phiên: thử lại mỗi 2 giây và báo
//!   [`CaptureEvent::WaitingForApp`] để màn hình chính hiện chỉ báo.
//! - macOS: nguồn trả mẫu toàn số 0 tuyệt đối suốt 3 giây trong khi app cần thu đang phát tiếng, và từ đầu phiên chưa có
//!   mẫu nào khác 0, thì nhiều khả năng app chưa được cấp quyền "Ghi âm thanh hệ thống" (§9): báo
//!   [`CaptureEvent::PermissionSuspected`], không dừng phiên. Đã có âm thanh thật một lần thì quyền đã có: cuộc họp im
//!   lặng sau đó không bị báo nhầm (Q-B của review 02 lần 2).
//! - Trong lúc nguồn chưa chạy hay đang mở lại, `ClockFiller` chèn im lặng theo đồng hồ thật, để thời gian phụ đề không
//!   lệch.
//! - Âm thanh chỉ nằm trong RAM (§10.1): không ghi xuống đĩa, không gửi đi đâu.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_errors_map_to_ui_codes() {
        let app = AudioSource::App {
            bundle_id: "us.zoom.xos".into(),
        };
        let not_playing = anyhow::anyhow!("us.zoom.xos không phát âm thanh");
        assert_eq!(error_code(&app, &not_playing), errors::APP_NOT_PLAYING);
        let other = anyhow::anyhow!("AudioDeviceStart lỗi OSStatus 1");
        assert_eq!(error_code(&AudioSource::System, &other), errors::CAPTURE_FAILED);
        #[cfg(target_os = "macos")]
        {
            let tap = anyhow::anyhow!("AudioHardwareCreateProcessTap lỗi OSStatus 560947818");
            assert_eq!(error_code(&AudioSource::System, &tap), errors::AUDIO_PERMISSION);
        }
    }

    /// Q2 của review 02c: lần mở đầu lỗi thì báo ngay; nguồn đã chạy rồi mà lỗi thì chỉ báo khi lỗi kéo dài 10 giây.
    #[test]
    fn failures_are_reported_at_once_only_before_the_first_success() {
        let t0 = Instant::now();
        let at = |s: u64| t0 + Duration::from_secs(s);
        let mut p = FailurePolicy::default();
        assert_eq!(p.on_failure(at(0), false), OnFailure::Report, "lần mở đầu tiên");
        assert_eq!(p.on_failure(at(2), false), OnFailure::Retry, "đã báo rồi");
        let mut p = FailurePolicy::default();
        p.on_ok();
        assert_eq!(p.on_failure(at(0), false), OnFailure::Retry);
        assert_eq!(p.on_failure(at(9), false), OnFailure::Retry);
        assert_eq!(p.on_failure(at(10), false), OnFailure::Report, "lỗi liên tục 10 giây");
        assert_eq!(p.on_failure(at(12), false), OnFailure::Retry);
        p.on_ok();
        assert_eq!(
            p.on_failure(at(20), false),
            OnFailure::Retry,
            "chạy lại được thì đếm lại từ đầu"
        );
        assert_eq!(p.on_failure(at(31), false), OnFailure::Report);
    }

    /// Q-C của review 02 lần 2: nguồn một app. Lần mở đầu mà app không phát tiếng thì báo lỗi (`appNotPlaying`); đã thu
    /// được rồi mà app đóng thì không bao giờ dừng phiên: báo chỉ báo một lần, thử lại mãi, thu lại được thì tắt chỉ báo.
    #[test]
    fn an_app_that_stops_playing_after_the_start_only_shows_an_indicator() {
        let t0 = Instant::now();
        let at = |s: u64| t0 + Duration::from_secs(s);
        let mut p = FailurePolicy::default();
        assert_eq!(p.on_failure(at(0), true), OnFailure::Report, "chưa từng thu được");
        let mut p = FailurePolicy::default();
        assert!(!p.on_ok());
        assert_eq!(p.on_failure(at(0), true), OnFailure::Wait);
        for s in [2, 10, 60, 600] {
            assert_eq!(p.on_failure(at(s), true), OnFailure::Retry, "giây {s}");
        }
        assert!(p.on_ok(), "thu lại được: tắt chỉ báo");
        assert!(!p.on_ok());
        assert_eq!(p.on_failure(at(700), true), OnFailure::Wait, "lần đóng sau lại báo");
    }

    /// Q-G của review 02 lần 2: số khung đứng yên 3 giây trong khi app cần thu đang phát thì tap đã chết; không ai phát
    /// thì không có khung là bình thường.
    #[test]
    fn frames_that_stop_while_an_app_plays_mean_a_dead_tap() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let mut w = StallWatch::new(at(0));
        assert!(!w.stalled(10, at(500), || panic!("đang có khung thì không hỏi")));
        assert!(!w.stalled(10, at(3_000), || panic!("chưa đủ 3 giây")));
        assert!(!w.stalled(10, at(3_600), || false), "không ai phát");
        assert!(!w.stalled(10, at(6_000), || true), "đếm lại từ lúc thấy không ai phát");
        assert!(w.stalled(10, at(6_600), || true));
        assert!(!w.stalled(11, at(7_000), || true), "có khung mới");
    }

    /// Q-G của review 02 lần 2: nguồn một app mở lại khi tập tiến trình đang phát khác tập đã tap; app tạm không phát gì
    /// thì giữ nguyên tap.
    #[test]
    fn a_changed_set_of_playing_processes_reopens_an_app_source() {
        assert!(!pids_changed(&[300, 301], Some(&[300, 301])));
        assert!(pids_changed(&[300, 301], Some(&[300, 302])), "helper mới");
        assert!(pids_changed(&[300], Some(&[300, 301])));
        assert!(!pids_changed(&[300], None), "app đang im lặng");
        assert!(
            !pids_changed(&[300, 301], Some(&[300])),
            "một helper ngừng phát: tap cũ vẫn đúng"
        );
    }

    /// Nhỏ-5 của review 02 lần 3: mở lại 3 lần liên tiếp mà vẫn không có khung thì giãn thời gian chờ gấp đôi, tối đa 30
    /// giây; có khung thì đếm lại từ đầu.
    #[test]
    fn repeated_stall_reopens_back_off_up_to_30_seconds() {
        let mut b = StallBackoff::default();
        let mut seen = Vec::new();
        let mut warned = Vec::new();
        for _ in 0..7 {
            seen.push(b.threshold().as_secs());
            warned.push(b.on_stall_reopen());
        }
        assert_eq!(seen, [3, 3, 3, 6, 12, 24, 30]);
        assert_eq!(
            warned,
            [false, false, true, false, false, false, false],
            "cảnh báo một lần"
        );
        assert_eq!(b.threshold(), STALL_MAX);
        b.on_frames();
        assert_eq!(b.threshold(), STALL_FOR);
    }

    /// Nhỏ-1, Nhỏ-2 của review 02 lần 4: phần kiểm qua nhiều lần mở. Tap chết 3 lần liên tiếp thì lần mở sau chờ 6 giây
    /// (chưa coi là chết ở giây 3); có khung trở lại thì ngay trong lần mở đó bậc chờ về 3 giây. Thiết bị đổi thì mở lại
    /// ngay, không chờ.
    #[test]
    fn the_watch_backs_off_across_reopens_and_resets_on_frames() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let none = Observed::default();
        let mut w = Watch::new(t0);
        // Lần mở đầu có nhiều khung rồi tap chết: lần mở sau đếm khung lại từ 0 (W1 của review 02 lần 5).
        w.opened(at(0));
        assert_eq!(w.tick(at(100), 1_000, true, || true, none), Tick::Continue);
        assert_eq!(w.tick(at(3_000), 1_000, true, || true, none), Tick::Continue);
        assert_eq!(
            w.tick(at(3_100), 1_000, true, || true, none),
            Tick::Reopen(Reopen::Stalled)
        );
        let mut clock = 3_500;
        for _ in 0..2 {
            w.opened(at(clock));
            assert_eq!(w.threshold(), STALL_FOR);
            assert_eq!(w.tick(at(clock + 2_900), 0, true, || true, none), Tick::Continue);
            assert_eq!(
                w.tick(at(clock + 3_000), 0, true, || true, none),
                Tick::Reopen(Reopen::Stalled)
            );
            clock += 3_500;
        }
        w.opened(at(clock));
        assert_eq!(w.threshold(), Duration::from_secs(6));
        assert_eq!(
            w.tick(at(clock + 3_000), 0, true, || true, none),
            Tick::Continue,
            "đang chờ lâu hơn"
        );
        // Có khung trở lại trong cùng lần mở: bậc chờ về đầu, đếm lại từ lúc có khung.
        assert_eq!(w.tick(at(clock + 3_500), 10, true, || true, none), Tick::Continue);
        assert_eq!(w.threshold(), STALL_FOR);
        assert_eq!(w.tick(at(clock + 6_400), 10, true, || true, none), Tick::Continue);
        assert_eq!(
            w.tick(at(clock + 6_500), 10, true, || true, none),
            Tick::Reopen(Reopen::Stalled)
        );
        // Không xét tap chết (Windows) thì không bao giờ mở lại vì số khung đứng yên.
        w.opened(at(20_000));
        assert_eq!(
            w.tick(at(60_000), 0, false, || panic!("không hỏi"), none),
            Tick::Continue
        );
        let device = Observed {
            device_changed: true,
            ..none
        };
        assert_eq!(
            w.tick(at(60_100), 0, true, || true, device),
            Tick::Reopen(Reopen::Device)
        );
    }

    /// Nhỏ-3 của review 02 lần 3: quyết định của một lần kiểm và việc báo sau một lần mở thất bại.
    #[test]
    fn the_watch_decisions() {
        let none = Observed::default();
        assert_eq!(on_tick(none), Tick::Continue);
        let device = Observed {
            device_changed: true,
            stalled: true,
            ..none
        };
        assert_eq!(on_tick(device), Tick::Reopen(Reopen::Device));
        let failed = Observed {
            source_failed: true,
            ..none
        };
        assert_eq!(on_tick(failed), Tick::Reopen(Reopen::Device));
        let stalled = Observed {
            stalled: true,
            new_process: true,
            ..none
        };
        assert_eq!(on_tick(stalled), Tick::Reopen(Reopen::Stalled));
        let new_process = Observed {
            new_process: true,
            ..none
        };
        assert_eq!(on_tick(new_process), Tick::Reopen(Reopen::NewProcess));
        assert_eq!(
            failure_event(OnFailure::Wait, errors::APP_NOT_PLAYING, "x".into()),
            Some(CaptureEvent::WaitingForApp(true))
        );
        assert_eq!(
            failure_event(OnFailure::Report, errors::CAPTURE_FAILED, "x".into()),
            Some(CaptureEvent::Failed {
                code: errors::CAPTURE_FAILED,
                message: "x".into()
            })
        );
        assert_eq!(
            failure_event(OnFailure::Retry, errors::CAPTURE_FAILED, "x".into()),
            None
        );
    }

    /// Q4 của review 02c: mẫu toàn 0 tuyệt đối 3 giây trong khi có app phát tiếng thì nghi thiếu quyền.
    #[test]
    fn three_seconds_of_exact_zeros_while_an_app_plays_suggest_a_missing_permission() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let zeros = [0.0f32; 320];
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&zeros, at(0), || true), None);
        assert_eq!(w.push(&[], at(5_000), || panic!("không mẫu nào thì không hỏi")), None);
        assert_eq!(w.push(&zeros, at(2_999), || true), None);
        assert_eq!(w.push(&zeros, at(3_000), || true), Some(true));
        assert_eq!(w.push(&zeros, at(4_000), || true), None, "chỉ báo một lần");
        assert_eq!(
            w.push(&[0.0, 0.01], at(4_100), || true),
            Some(false),
            "có âm thanh thật"
        );
        // Không app nào phát: số 0 là im lặng thật, không báo.
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&zeros, at(0), || false), None);
        assert_eq!(w.push(&zeros, at(3_500), || false), None);
        assert_eq!(w.push(&zeros, at(6_000), || false), None);
        // Tiếng rất nhỏ nhưng khác 0 thì không phải dấu hiệu.
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&[1e-7; 320], at(0), || true), None);
        assert_eq!(w.push(&[1e-7; 320], at(5_000), || true), None);
    }

    /// Q-B của review 02 lần 2: đã có âm thanh thật trong phiên thì quyền đã có; cuộc họp im lặng lâu sau đó (số 0 tuyệt
    /// đối) không bị báo nhầm, kể cả khi app vẫn được tính là đang phát.
    #[test]
    fn silence_after_real_audio_is_not_a_missing_permission() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let zeros = [0.0f32; 320];
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&[0.02; 320], at(0), || true), None);
        for ms in [100, 3_100, 10_000, 600_000] {
            assert_eq!(w.push(&zeros, at(ms), || panic!("không còn hỏi")), None, "{ms} ms");
        }
    }
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -123,6 +123,17 @@
                 OVERLAY_FAILED,
                 OPEN_FAILED,
                 UNSUPPORTED,
+                SIDECAR_MISSING,
+                SIDECAR_TAMPERED,
+                SIDECAR_FAILED,
+                MODEL_MISSING,
+                MODEL_BROKEN,
+                AUDIO_PERMISSION,
+                CAPTURE_FAILED,
+                APP_NOT_PLAYING,
+                VAD_FAILED,
+                QUOTA_EXHAUSTED,
+                UNKNOWN,
             ]
             .map(String::from),
         );
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p meeting-translator --lib -- capture errors`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0433]: cannot find type `AudioSource` in this scope
error[E0433]: cannot find type `Instant` in this scope
error[E0433]: cannot find type `Duration` in this scope
error[E0425]: cannot find value `STALL_MAX` in this scope
error[E0425]: cannot find value `STALL_FOR` in this scope
error[E0422]: cannot find struct, variant or union type `Observed` in this scope
```

- [ ] **Step 4: Viết code**

Thêm vào `src-tauri/src/capture.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use audio_capture::preprocess::{ClockFiller, Preprocessor, RING_SAMPLES};
use audio_capture::{AudioSource as Source, CaptureStats};
use pipeline::engine::FrameSource;

use crate::errors;
use crate::settings::AudioSource;

/// Chu kỳ kiểm thiết bị phát và luồng thu (§6.2).
const WATCH_EVERY: Duration = Duration::from_millis(500);
/// Luồng thu xem cờ dừng sau mỗi bước chờ ngắn này.
const STEP: Duration = Duration::from_millis(50);
/// Mở nguồn lỗi thì thử lại sau chừng này.
const RETRY_AFTER: Duration = Duration::from_secs(2);
/// Nguồn đã chạy được rồi mà lỗi liên tục chừng này thì mới báo (§9: tự khởi tạo lại trong ≤ 2 giây).
const FAIL_AFTER: Duration = Duration::from_secs(10);
/// Mẫu toàn số 0 tuyệt đối chừng này (trong khi có app đang phát) thì nghi chưa có quyền (§9).
const ZERO_FOR: Duration = Duration::from_secs(3);
/// Không có khung mới chừng này trong khi app cần thu đang phát thì coi tap đã chết (Q-G của review 02 lần 2).
const STALL_FOR: Duration = Duration::from_secs(3);
/// Trần của thời gian chờ đó khi đã mở lại nhiều lần liên tiếp mà vẫn không có khung ([`StallBackoff`]).
const STALL_MAX: Duration = Duration::from_secs(30);
/// Nguồn một app: chu kỳ so tập tiến trình đang phát với tập đã tap.
#[cfg(target_os = "macos")]
const PIDS_EVERY: Duration = Duration::from_secs(2);
/// Chu kỳ ghi số liệu của luồng thu vào log (02c Task 8 đọc để kiểm tiền đề của `StallWatch`).
const STATS_EVERY: Duration = Duration::from_secs(60);
/// `LiveCapture` bị hủy thì chờ luồng thu tối đa chừng này, để tap cũ không còn chạy song song với phiên mới.
const JOIN_WITHIN: Duration = Duration::from_millis(500);

/// Việc nguồn âm thanh báo cho phiên.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CaptureEvent {
    /// Không thu được âm thanh: phiên dừng với mã lỗi này (`errors`).
    Failed { code: &'static str, message: String },
    /// macOS: nghi chưa được cấp quyền ghi âm thanh hệ thống (`true`), hoặc đã có âm thanh thật trở lại (`false`).
    PermissionSuspected(bool),
    /// Nguồn một app: app đã chọn không phát tiếng nữa, đang chờ nó phát lại (`true`), hoặc đã thu lại được (`false`).
    WaitingForApp(bool),
}

pub type OnEvent = Box<dyn Fn(CaptureEvent) + Send + Sync>;

/// Việc phải làm sau một lần mở nguồn thất bại.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OnFailure {
    /// Thử lại sau, không báo gì.
    Retry,
    /// Báo lỗi: phiên dừng.
    Report,
    /// Nguồn một app: app không phát tiếng nữa; báo chỉ báo "đang chờ app", không dừng phiên, thử lại sau.
    Wait,
}

/// Khi nào một lần mở nguồn thất bại phải báo cho phiên (Q2 của review 02c, Q-C của review 02 lần 2).
#[derive(Debug, Default)]
pub struct FailurePolicy {
    ever_ok: bool,
    failing_since: Option<Instant>,
    reported: bool,
    waiting: bool,
}

impl FailurePolicy {
    /// Nguồn vừa chạy được. Trả `true` nếu trước đó đang chờ app phát tiếng lại (để tắt chỉ báo).
    pub fn on_ok(&mut self) -> bool {
        self.ever_ok = true;
        self.failing_since = None;
        self.reported = false;
        std::mem::take(&mut self.waiting)
    }

    /// Một lần mở thất bại lúc `now`. `app_not_playing`: nguồn một app mà app đó không phát tiếng. Mỗi đợt lỗi báo một
    /// lần.
    pub fn on_failure(&mut self, now: Instant, app_not_playing: bool) -> OnFailure {
        if self.ever_ok && app_not_playing {
            self.failing_since = None;
            return if std::mem::replace(&mut self.waiting, true) {
                OnFailure::Retry
            } else {
                OnFailure::Wait
            };
        }
        let since = *self.failing_since.get_or_insert(now);
        let due = !self.ever_ok || now.duration_since(since) >= FAIL_AFTER;
        if due && !self.reported {
            self.reported = true;
            return OnFailure::Report;
        }
        OnFailure::Retry
    }
}

/// Phát hiện tap chết không báo gì (Q-G của review 02 lần 2): số khung không tăng suốt `after` (mặc định [`STALL_FOR`]).
#[derive(Debug)]
pub struct StallWatch {
    frames: u64,
    since: Instant,
    after: Duration,
}

impl StallWatch {
    pub fn new(now: Instant) -> Self {
        Self::with_threshold(now, STALL_FOR)
    }

    pub fn with_threshold(now: Instant, after: Duration) -> Self {
        Self {
            frames: 0,
            since: now,
            after,
        }
    }

    /// Đổi thời gian chờ, giữ mốc đếm hiện tại.
    pub fn set_threshold(&mut self, after: Duration) {
        self.after = after;
    }

    /// Số khung hiện tại lúc `now`. Trả `true` nếu đã đứng yên đủ lâu mà app cần thu vẫn đang phát (`playing` chỉ được
    /// hỏi khi đã đứng yên đủ lâu).
    pub fn stalled(&mut self, frames: u64, now: Instant, playing: impl FnOnce() -> bool) -> bool {
        if frames != self.frames {
            self.frames = frames;
            self.since = now;
            return false;
        }
        if now.duration_since(self.since) < self.after {
            return false;
        }
        if playing() {
            return true;
        }
        // Không ai phát: không có khung là bình thường. Đếm lại từ đầu.
        self.since = now;
        false
    }
}

/// Mở lại vì tap chết mà số khung vẫn không tăng (Nhỏ-5 của review 02 lần 3): 3 lần đầu chờ [`STALL_FOR`], sau đó giãn
/// gấp đôi mỗi lần, tối đa [`STALL_MAX`], để một cấu hình mà tiền đề của `StallWatch` sai không làm dựng lại tap mỗi 3
/// giây suốt phiên. Các lần này không tính vào [`FailurePolicy`]: mở lại vẫn thành công.
#[derive(Debug, Default)]
pub struct StallBackoff {
    reopens: u32,
}

impl StallBackoff {
    /// Thời gian đứng yên phải chờ trước khi coi là tap chết, sau `reopens` lần mở lại liên tiếp không có khung nào.
    pub fn threshold(&self) -> Duration {
        match self.reopens {
            0..=2 => STALL_FOR,
            n => STALL_FOR.saturating_mul(1 << (n - 2).min(8)).min(STALL_MAX),
        }
    }

    /// Vừa mở lại vì tap chết. Trả `true` đúng một lần, ở lần bắt đầu giãn (để ghi cảnh báo một lần).
    pub fn on_stall_reopen(&mut self) -> bool {
        self.reopens += 1;
        self.reopens == 3
    }

    /// Nguồn đã có khung: đếm lại từ đầu.
    pub fn on_frames(&mut self) {
        self.reopens = 0;
    }
}

/// Nguồn một app: trong các tiến trình đang phát tiếng của app (`None`: app không phát gì lúc này) có tiến trình chưa được
/// tap. Tập chỉ thu nhỏ (một helper ngừng phát) thì tap cũ vẫn đúng, không mở lại (Nhỏ-6 của review 02 lần 3).
pub fn pids_changed(tapped: &[i32], playing: Option<&[i32]>) -> bool {
    playing.is_some_and(|p| p.iter().any(|pid| !tapped.contains(pid)))
}

/// Việc của một lần kiểm (mỗi 500 ms) khi nguồn đang chạy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tick {
    Continue,
    /// Mở lại nguồn, kèm lý do để ghi log.
    Reopen(Reopen),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reopen {
    /// Thiết bị phát mặc định đã đổi, hoặc luồng thu đã dừng.
    Device,
    /// Tap chết: không có khung mới trong khi app cần thu vẫn đang phát.
    Stalled,
    /// Nguồn một app: app có tiến trình phát tiếng chưa được tap.
    NewProcess,
}

/// Những gì một lần kiểm thấy.
#[derive(Clone, Copy, Debug, Default)]
pub struct Observed {
    pub device_changed: bool,
    pub source_failed: bool,
    pub stalled: bool,
    pub new_process: bool,
}

/// Quyết định của một lần kiểm (Nhỏ-3 của review 02 lần 3): hàm thuần, tách khỏi `capture_loop` để test được.
pub fn on_tick(seen: Observed) -> Tick {
    if seen.device_changed || seen.source_failed {
        Tick::Reopen(Reopen::Device)
    } else if seen.stalled {
        Tick::Reopen(Reopen::Stalled)
    } else if seen.new_process {
        Tick::Reopen(Reopen::NewProcess)
    } else {
        Tick::Continue
    }
}

/// Phần kiểm của `capture_loop` cho các lần mở nối tiếp nhau (Nhỏ-1, Nhỏ-2 của review 02 lần 4): `StallWatch` của lần mở
/// hiện tại, với thời gian chờ theo [`StallBackoff`]. Có khung trở lại thì bậc chờ về đầu ngay trong lần mở đó.
#[derive(Debug)]
pub struct Watch {
    backoff: StallBackoff,
    stall: StallWatch,
    frames: u64,
}

impl Watch {
    pub fn new(now: Instant) -> Self {
        Self {
            backoff: StallBackoff::default(),
            stall: StallWatch::new(now),
            frames: 0,
        }
    }

    /// Vừa mở (hay mở lại) nguồn: đếm khung lại từ đầu, chờ theo bậc hiện tại.
    pub fn opened(&mut self, now: Instant) {
        self.stall = StallWatch::with_threshold(now, self.backoff.threshold());
        self.frames = 0;
    }

    /// Thời gian chờ đang dùng.
    pub fn threshold(&self) -> Duration {
        self.stall.after
    }

    /// Một lần kiểm: `frames` là số khung của lần mở này, `check_stall` là có xét tap chết không (macOS), `playing` chỉ
    /// được hỏi khi số khung đã đứng yên đủ lâu. `seen` là những dấu hiệu khác (thiết bị, luồng thu, tiến trình mới).
    pub fn tick(
        &mut self,
        now: Instant,
        frames: u64,
        check_stall: bool,
        playing: impl FnOnce() -> bool,
        seen: Observed,
    ) -> Tick {
        if frames > self.frames {
            self.frames = frames;
            self.backoff.on_frames();
            self.stall.set_threshold(self.backoff.threshold());
        }
        let stalled = check_stall && self.stall.stalled(frames, now, playing);
        let tick = on_tick(Observed { stalled, ..seen });
        if tick == Tick::Reopen(Reopen::Stalled) && self.backoff.on_stall_reopen() {
            log::warn!("mở lại 3 lần liên tiếp mà vẫn không có khung: từ giờ chờ lâu dần trước khi mở lại");
        }
        tick
    }
}

/// Việc báo cho phiên sau một lần mở nguồn thất bại (hàm thuần, như [`on_tick`]).
pub fn failure_event(verdict: OnFailure, code: &'static str, message: String) -> Option<CaptureEvent> {
    match verdict {
        OnFailure::Report => Some(CaptureEvent::Failed { code, message }),
        OnFailure::Wait => Some(CaptureEvent::WaitingForApp(true)),
        OnFailure::Retry => None,
    }
}

/// Theo dõi chuỗi mẫu toàn số 0 tuyệt đối (Q4 của review 02c). Đã nhận một mẫu khác 0 trong phiên thì tắt hẳn (Q-B của
/// review 02 lần 2): quyền đã có, số 0 sau đó là cuộc họp im lặng.
#[derive(Debug, Default)]
pub struct ZeroWatch {
    zero_since: Option<Instant>,
    suspected: bool,
    heard: bool,
}

impl ZeroWatch {
    /// Mẫu thật vừa nhận (không gồm im lặng do `ClockFiller` chèn). `someone_playing` chỉ được gọi khi chuỗi số 0 đã đủ
    /// dài. Trả trạng thái mới khi nó đổi.
    pub fn push(&mut self, samples: &[f32], now: Instant, someone_playing: impl FnOnce() -> bool) -> Option<bool> {
        if samples.is_empty() || self.heard {
            return None;
        }
        if samples.iter().any(|&x| x != 0.0) {
            self.heard = true;
            self.zero_since = None;
            return std::mem::take(&mut self.suspected).then_some(false);
        }
        let since = *self.zero_since.get_or_insert(now);
        if !self.suspected && now.duration_since(since) >= ZERO_FOR {
            if someone_playing() {
                self.suspected = true;
                return Some(true);
            }
            // Không app nào phát: số 0 là im lặng thật. Đếm lại từ đầu.
            self.zero_since = Some(now);
        }
        None
    }
}

/// Nguồn của cài đặt hiện tại. `include_self`: macOS, tap toàn hệ thống thu cả âm thanh của chính app (bước "Nghe thử",
/// §4.1 bước 6, Đ16 của kế hoạch 00); Windows, loopback vốn thu mọi âm thanh của máy nên không đổi gì.
fn open_sources(source: &AudioSource, include_self: bool) -> anyhow::Result<Opened> {
    #[cfg(target_os = "macos")]
    {
        use audio_capture::macos::{MacTapSource, TapTarget};
        let mut tapped = None;
        let target = match source {
            AudioSource::App { bundle_id } => {
                let pids = playing_pids(bundle_id).ok_or_else(|| anyhow::anyhow!("{bundle_id} không phát âm thanh"))?;
                tapped = Some(pids.clone());
                TapTarget::Processes(pids)
            }
            _ if include_self => TapTarget::System,
            _ => TapTarget::SystemExceptSelf,
        };
        let stats = Arc::new(CaptureStats::default());
        Ok(Opened {
            sources: vec![Box::new(MacTapSource::new(target, stats.clone()))],
            stats: vec![stats],
            tapped,
        })
    }
    #[cfg(windows)]
    {
        let _ = include_self;
        use audio_capture::windows::{Endpoint, LoopbackSource, Role, default_endpoint_id};
        let mut stats = Vec::new();
        let mut open = |endpoint: Endpoint| -> Box<dyn Source> {
            let s = Arc::new(CaptureStats::default());
            stats.push(s.clone());
            Box::new(LoopbackSource::new(endpoint, s))
        };
        let sources = match source {
            AudioSource::Device { id } => vec![open(Endpoint::Device(id.clone()))],
            _ => {
                // Chế độ tự động (§6.1): Console, cộng Communications nếu là thiết bị khác.
                let mut sources = vec![open(Endpoint::Default(Role::Console))];
                if default_endpoint_id(Role::Console)? != default_endpoint_id(Role::Communications)? {
                    sources.push(open(Endpoint::Default(Role::Communications)));
                }
                sources
            }
        };
        Ok(Opened {
            sources,
            stats,
            tapped: None,
        })
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (source, include_self);
        anyhow::bail!("chỉ hỗ trợ macOS và Windows")
    }
}

/// Các nguồn vừa mở, số liệu của từng nguồn, và (nguồn một app, macOS) tập tiến trình đã tap.
struct Opened {
    sources: Vec<Box<dyn Source>>,
    stats: Vec<Arc<CaptureStats>>,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    tapped: Option<Vec<i32>>,
}

/// macOS: các tiến trình đang phát tiếng của app `bundle_id` (đã sắp xếp), `None` nếu app không phát gì.
#[cfg(target_os = "macos")]
fn playing_pids(bundle_id: &str) -> Option<Vec<i32>> {
    audio_capture::macos::audio_apps()
        .ok()?
        .into_iter()
        .find(|a| a.bundle_id == bundle_id)
        .map(|a| a.pids)
}

/// App cần thu có đang phát tiếng không (macOS): nguồn một app thì chỉ xét chính app đó, nguồn toàn hệ thống thì xét
/// mọi app khác. Windows không cần: loopback không phụ thuộc quyền, và không có khung khi im lặng là bình thường.
fn someone_playing(source: &AudioSource) -> bool {
    #[cfg(target_os = "macos")]
    return match source {
        AudioSource::App { bundle_id } => playing_pids(bundle_id).is_some(),
        _ => audio_capture::macos::audio_apps().is_ok_and(|apps| !apps.is_empty()),
    };
    #[allow(unreachable_code)]
    {
        let _ = source;
        false
    }
}

/// Mã lỗi cho một lần mở nguồn thất bại.
fn error_code(source: &AudioSource, err: &anyhow::Error) -> &'static str {
    let text = format!("{err:#}");
    if matches!(source, AudioSource::App { .. }) && text.contains("không phát âm thanh") {
        errors::APP_NOT_PLAYING
    } else if cfg!(target_os = "macos") && text.contains("AudioHardwareCreateProcessTap") {
        // Tạo tap lỗi: thường là chưa cấp quyền "Ghi âm thanh hệ thống" (§9; chờ C1, dòng 2 của S1).
        errors::AUDIO_PERMISSION
    } else {
        errors::CAPTURE_FAILED
    }
}

/// Chờ `d`, trả `true` nếu được yêu cầu dừng trong lúc chờ.
fn wait_or_stop(stop: &AtomicBool, d: Duration) -> bool {
    let deadline = Instant::now() + d;
    while Instant::now() < deadline {
        if stop.load(Ordering::SeqCst) {
            return true;
        }
        std::thread::sleep(STEP);
    }
    stop.load(Ordering::SeqCst)
}

/// Mở các nguồn và chạy chúng; lỗi thì dừng những nguồn đã chạy.
fn start_sources(source: &AudioSource, include_self: bool) -> anyhow::Result<(Opened, Preprocessor)> {
    let mut opened = open_sources(source, include_self)?;
    let mut rings = Vec::new();
    for s in &mut opened.sources {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        if let Err(e) = s.start(producer) {
            opened.sources.iter_mut().for_each(|s| s.stop());
            return Err(e);
        }
        rings.push((consumer, s.format()));
    }
    match Preprocessor::new(rings) {
        Ok(p) => Ok((opened, p)),
        Err(e) => {
            opened.sources.iter_mut().for_each(|s| s.stop());
            Err(e)
        }
    }
}

/// Chạy nguồn cho tới khi `stop`, mở lại khi thiết bị đổi hay luồng thu chết.
fn capture_loop(
    source: AudioSource,
    include_self: bool,
    shared: Arc<Mutex<Option<Preprocessor>>>,
    stop: Arc<AtomicBool>,
    on_event: Arc<OnEvent>,
) {
    let mut policy = FailurePolicy::default();
    let mut watch = Watch::new(Instant::now());
    // Thiết bị chọn tay (Windows) không theo thiết bị mặc định.
    let follows_default = !matches!(source, AudioSource::Device { .. });
    while !stop.load(Ordering::SeqCst) {
        let signature = audio_capture::default_output_signature();
        let mut opened = match start_sources(&source, include_self) {
            Ok((opened, preprocessor)) => {
                *shared.lock().unwrap_or_else(|e| e.into_inner()) = Some(preprocessor);
                if policy.on_ok() {
                    on_event(CaptureEvent::WaitingForApp(false));
                }
                opened
            }
            Err(e) => {
                let code = error_code(&source, &e);
                log::warn!("không mở được nguồn âm thanh: {e:#}");
                let verdict = policy.on_failure(Instant::now(), code == errors::APP_NOT_PLAYING);
                if let Some(event) = failure_event(verdict, code, format!("{e:#}")) {
                    on_event(event);
                }
                wait_or_stop(&stop, RETRY_AFTER);
                continue;
            }
        };
        log::info!("đang thu âm thanh ({} nguồn)", opened.sources.len());
        let frames = |o: &Opened| o.stats.iter().map(|s| s.frames.load(Ordering::Relaxed)).sum::<u64>();
        watch.opened(Instant::now());
        #[cfg(target_os = "macos")]
        let mut pids_at = Instant::now();
        let mut stats_at = Instant::now();
        while !wait_or_stop(&stop, WATCH_EVERY) {
            let now = Instant::now();
            #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
            let mut seen = Observed {
                device_changed: follows_default && audio_capture::default_output_signature() != signature,
                source_failed: opened.sources.iter().any(|s| s.failed()),
                ..Observed::default()
            };
            #[cfg(target_os = "macos")]
            if let (Some(tapped), AudioSource::App { bundle_id }) = (&opened.tapped, &source)
                && now.duration_since(pids_at) >= PIDS_EVERY
            {
                pids_at = now;
                seen.new_process = pids_changed(tapped, playing_pids(bundle_id).as_deref());
            }
            let threshold = watch.threshold();
            let tick = watch.tick(
                now,
                frames(&opened),
                cfg!(target_os = "macos"),
                || someone_playing(&source),
                seen,
            );
            if let Tick::Reopen(reason) = tick {
                log::info!("mở lại nguồn âm thanh: {reason:?} (chờ tap chết {threshold:?})");
                break;
            }
            if now.duration_since(stats_at) >= STATS_EVERY {
                stats_at = now;
                let all: Vec<[u64; 5]> = opened.stats.iter().map(|s| s.snapshot()).collect();
                log::info!("số liệu thu (frames, silence_inserted, skipped, dropped, rejected_cycles): {all:?}");
            }
        }
        *shared.lock().unwrap_or_else(|e| e.into_inner()) = None;
        opened.sources.iter_mut().for_each(|s| s.stop());
    }
}

/// Nguồn âm thanh thật của một phiên, cho `pipeline::engine`.
pub struct LiveCapture {
    source: AudioSource,
    shared: Arc<Mutex<Option<Preprocessor>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    filler: ClockFiller,
    zeros: ZeroWatch,
    on_event: Arc<OnEvent>,
    started: Instant,
    buf: Vec<f32>,
}

impl LiveCapture {
    pub fn open(source: AudioSource, include_self: bool, on_event: OnEvent) -> Self {
        let shared = Arc::new(Mutex::new(None));
        let stop = Arc::new(AtomicBool::new(false));
        let on_event = Arc::new(on_event);
        let thread = {
            let (shared, stop, on_event, source) = (shared.clone(), stop.clone(), on_event.clone(), source.clone());
            std::thread::Builder::new()
                .name("capture".into())
                .spawn(move || capture_loop(source, include_self, shared, stop, on_event))
                .ok()
        };
        Self {
            source,
            shared,
            stop,
            thread,
            filler: ClockFiller::new(200),
            zeros: ZeroWatch::default(),
            on_event,
            started: Instant::now(),
            buf: Vec::new(),
        }
    }
}

impl FrameSource for LiveCapture {
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        std::thread::sleep(timeout.min(Duration::from_millis(20)));
        self.buf.clear();
        if let Some(p) = self.shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            p.drain(&mut self.buf)?;
        }
        if cfg!(target_os = "macos")
            && let Some(suspected) = self
                .zeros
                .push(&self.buf, Instant::now(), || someone_playing(&self.source))
        {
            (self.on_event)(CaptureEvent::PermissionSuspected(suspected));
        }
        let silence = self.filler.silence_before(self.started.elapsed(), self.buf.len());
        out.extend(std::iter::repeat_n(0.0, silence));
        out.extend_from_slice(&self.buf);
        Ok(!self.stop.load(Ordering::SeqCst))
    }
}

impl Drop for LiveCapture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Chờ luồng thu dừng tap (tối đa 500 ms), để tap của phiên cũ không chạy song song với phiên mới. Luồng kẹt lâu hơn
        // (ví dụ đang chờ hộp thoại quyền lần đầu) thì bỏ mặc: nó tự dừng khi lệnh đang chờ trả về.
        let Some(thread) = self.thread.take() else { return };
        let deadline = Instant::now() + JOIN_WITHIN;
        while !thread.is_finished() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        if thread.is_finished() {
            let _ = thread.join();
        } else {
            log::warn!("luồng thu chưa dừng sau {JOIN_WITHIN:?}");
        }
    }
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -16,8 +16,8 @@
     pub message: String,
 }
 
-// Năm hằng dưới đây là các mã lỗi ngoài lỗi cài đặt (`settings::Reason`) và lỗi phím tắt
-// (`CommandError::hotkey`).
+// Các hằng dưới đây là các mã lỗi ngoài lỗi cài đặt (`settings::Reason`) và lỗi phím tắt (`CommandError::hotkey`):
+// năm mã chung của app, rồi các mã của phiên dịch (kế hoạch 02).
 
 /// Không bật, tắt hay đọc được trạng thái khởi động cùng hệ thống.
 pub const AUTOSTART_FAILED: &str = "autostartFailed";
@@ -29,6 +29,30 @@
 pub const OPEN_FAILED: &str = "openFailed";
 /// Việc không có trên hệ điều hành này.
 pub const UNSUPPORTED: &str = "unsupported";
+
+// Mã lỗi của phiên dịch (kế hoạch 02, spec §9).
+/// Thiếu tiến trình phụ trong bản cài (bản dev: chưa chạy `scripts/copy-sidecars.sh`).
+pub const SIDECAR_MISSING: &str = "sidecarMissing";
+/// Tiến trình phụ hay thư viện đi kèm khác bản build sẵn (§10.2).
+pub const SIDECAR_TAMPERED: &str = "sidecarTampered";
+/// Tiến trình phụ không khởi động được, hoặc lỗi quá 5 lần trong 10 phút.
+pub const SIDECAR_FAILED: &str = "sidecarFailed";
+/// Thiếu file model (kế hoạch 04 tải về).
+pub const MODEL_MISSING: &str = "modelMissing";
+/// macOS: tạo tap lỗi, thường là chưa cấp quyền "Ghi âm thanh hệ thống".
+pub const AUDIO_PERMISSION: &str = "audioPermission";
+/// Không mở được nguồn âm thanh.
+pub const CAPTURE_FAILED: &str = "captureFailed";
+/// macOS, tap một app: app đó không phát âm thanh.
+pub const APP_NOT_PLAYING: &str = "appNotPlaying";
+/// Model không nạp được, kể cả bằng CPU: model hỏng (§9: đề nghị tải lại, kế hoạch 04).
+pub const MODEL_BROKEN: &str = "modelBroken";
+/// Không nạp được VAD.
+pub const VAD_FAILED: &str = "vadFailed";
+/// Chạm hạn mức (§6.8): phiên dừng với lý do `quota_exhausted`. Kế hoạch 06 thêm thời điểm reset và nút nâng gói.
+pub const QUOTA_EXHAUSTED: &str = "quotaExhausted";
+/// Lỗi bên trong app không thuộc loại nào ở trên (ví dụ một tác vụ nền dừng bất thường).
+pub const UNKNOWN: &str = "unknown";
 
 impl CommandError {
     pub fn new(code: &str, field: Option<&str>, message: impl Into<String>) -> Self {
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -135,6 +135,16 @@
   "error.overlayFailed": "Could not change the subtitle bar.",
   "error.openFailed": "Could not open it.",
   "error.unsupported": "Not available on this system.",
+  "error.sidecarMissing": "Part of the app is missing. Please reinstall AI Translator.",
+  "error.sidecarTampered": "Part of the app was changed or damaged. Please reinstall AI Translator.",
+  "error.sidecarFailed": "Speech recognition stopped working. Press Start to try again; if it keeps failing, send the logs to support.",
+  "error.modelMissing": "The model has not been downloaded yet.",
+  "error.audioPermission": "AI Translator is not allowed to record system audio.",
+  "error.captureFailed": "Could not capture audio.",
+  "error.appNotPlaying": "The chosen app is not playing sound. Start the meeting audio, or choose the whole system.",
+  "error.vadFailed": "Could not load the speech detector. Please reinstall AI Translator.",
+  "error.modelBroken": "The model is damaged. Please download it again.",
+  "error.quotaExhausted": "The translation quota has been used up.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -135,5 +135,15 @@
   "error.overlayFailed": "Không đổi được thanh phụ đề.",
   "error.openFailed": "Không mở được.",
   "error.unsupported": "Không có trên hệ điều hành này.",
+  "error.sidecarMissing": "Thiếu một phần của app. Hãy cài lại AI Translator.",
+  "error.sidecarTampered": "Một phần của app đã bị thay đổi hoặc hỏng. Hãy cài lại AI Translator.",
+  "error.sidecarFailed": "Phần nhận dạng giọng nói ngừng chạy. Bấm Bắt đầu để thử lại; nếu vẫn lỗi, hãy gửi log cho bộ phận hỗ trợ.",
+  "error.modelMissing": "Chưa tải model.",
+  "error.audioPermission": "AI Translator chưa được phép ghi âm thanh hệ thống.",
+  "error.captureFailed": "Không thu được âm thanh.",
+  "error.appNotPlaying": "App đã chọn không phát tiếng. Hãy bật âm thanh cuộc họp, hoặc chọn toàn hệ thống.",
+  "error.vadFailed": "Không nạp được bộ nhận biết tiếng nói. Hãy cài lại AI Translator.",
+  "error.modelBroken": "Model bị hỏng. Hãy tải lại model.",
+  "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p meeting-translator --lib -- capture errors && pnpm test`
Expected:

```text
test capture::tests::frames_that_stop_while_an_app_plays_mean_a_dead_tap ... ok
test capture::tests::failures_are_reported_at_once_only_before_the_first_success ... ok
test capture::tests::the_watch_backs_off_across_reopens_and_resets_on_frames ... ok
test capture::tests::a_changed_set_of_playing_processes_reopens_an_app_source ... ok
test capture::tests::three_seconds_of_exact_zeros_while_an_app_plays_suggest_a_missing_permission ... ok
test capture::tests::silence_after_real_audio_is_not_a_missing_permission ... ok
test capture::tests::repeated_stall_reopens_back_off_up_to_30_seconds ... ok
test capture::tests::the_watch_decisions ... ok
test capture::tests::an_app_that_stops_playing_after_the_start_only_shows_an_indicator ... ok
test capture::tests::capture_errors_map_to_ui_codes ... ok
test errors::tests::invalid_setting_maps_to_reason_code_and_field ... ok
test security::keystore::tests::platform_errors_are_reported ... ok
test errors::tests::every_error_code_has_ui_text ... ok
test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 122 filtered out; finished in 0.00s
```

```text
 Test Files  4 passed (4)
      Tests  46 passed (46)
```

- [ ] **Step 6: Clippy (cả target Windows) và định dạng**

Run:
```bash
cargo clippy -p meeting-translator --all-targets -- -D warnings
RC_x86_64_pc_windows_msvc=$PWD/scripts/fake-llvm-rc PKG_CONFIG_x86_64_pc_windows_msvc=$PWD/scripts/fake-pkg-config \
  PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 \
  cargo clippy -p meeting-translator --target x86_64-pc-windows-msvc --all-targets -- -D warnings
cargo fmt --all -- --check
```
Expected: không có cảnh báo, `cargo fmt` không in gì. Dòng cuối của lệnh thứ hai:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 32.08s
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/src/capture.rs \
  src-tauri/src/errors.rs \
  src-tauri/src/lib.rs \
  src/i18n/en.ts \
  src/i18n/vi.ts
git commit -m "feat(app): nguồn âm thanh của phiên, mở lại khi thiết bị đổi, mã lỗi §9" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Phiên dịch (`session.rs`)

Thay `session_stub.rs` (dòng 15, 16, 43, 45, 61, 66, 73, 79, 81, 82, 96, 105, 141, 222, 236, 237, 305; QĐ8, QĐ17–QĐ20, QĐ29):
- `session.rs`:
  - trait `SessionDeps` (tiến trình phụ, nguồn âm thanh, VAD) với hai bản: `LiveDeps` cho app, `FakeDeps` cho test;
  - `start`/`start_with` (`StartOptions { include_self }` cho bước nghe thử của 03), `stop`, `toggle` (đang chuẩn bị thì bấm là Hủy: về `idle` ngay; mỗi lần bắt đầu có số riêng, Hủy tăng số đó, lần đang dở kiểm số của nó lần cuối cùng khóa với trạng thái; Q1 của review 02c. Khóa phiên không giữ trong lúc chuẩn bị tiến trình phụ, nên Hủy rồi bấm Bắt đầu lại hiện `starting` ngay: Q-E của review 02 lần 2), `check_quota` trước khi chuẩn bị (chỗ nối của 06, mặc định cho bắt đầu), rồi `allow_retry` cho tiến trình phụ đã bỏ cuộc thử lại (R3-1 của review 02 lần 3; `prewarm` không gọi), lần đã hủy mà chuẩn bị lỗi thì bỏ chỉ báo "Đang nạp model" còn sót (Nhỏ-7), `shutdown` (Thoát; không chờ khóa của tiến trình phụ, N1), `prewarm` (mở cửa sổ chính thì chạy sẵn tiến trình phụ, Đ19), `spawn_ticker` (tắt sau 10 phút rảnh);
  - `TauriSink` phát `subtitle://upsert`, `subtitle://delta`, `audio://level` (chỉ cửa sổ chính), cập nhật chỉ báo; lỗi làm phiên dừng (`fatal_code`: `Fatal::Vad` thành `vadFailed`, `Audio` thành `captureFailed`, `Asr` thành `sidecarFailed` hay `sidecarTampered`/`modelBroken` theo lý do bỏ cuộc, `Internal` thành `unknown`, `QuotaExhausted` thành `quotaExhausted`; `Engine::start` lỗi là `unknown`, N-1 của review 02 lần 2) chạy trên luồng riêng, và chỉ dừng đúng phiên gây lỗi; `usage` để mặc định (06 nối bộ đếm phút vào đây);
  - `StatusEvents`: sự kiện của tiến trình phụ thành trạng thái (`loading`, `cpuFallback`, `suggestLite`; cờ CPU riêng cho từng tiến trình phụ theo `CpuFallback` và `Ready.use_gpu`, chỉ báo hiện khi có cờ nào bật: Q4-2 của review 02 lần 4, Q5-1 của review 02 lần 5), kiểm SHA-256 trước mỗi lần chạy (`before_spawn`, QĐ17), báo binary nào là lần đầu chạy (`is_first_run`) và ghi `sidecars-seen.json` khi binary đó tới `Ready`;
  - `LiveDeps`: khóa `live` chỉ giữ trong lúc clone `Arc<SidecarManager>`, không bao giờ trong lúc chờ tiến trình phụ; `allow_retry` quên lý do bỏ cuộc cũ (N-6 của review 02 lần 2, có test) và gọi `SidecarManager::allow_retry` (test với một giám sát thật đã bỏ cuộc: Q4-1 của review 02 lần 4);
  - `engine_config`: ngôn ngữ (khóa nguồn thì một ngôn ngữ, F2), ngôn ngữ đích, `vadEndSilenceMs`, cờ ngữ cảnh, `id_base` theo số phiên.
- `sidecar/mod.rs`: `prepare` kiểm SHA-256 (mã `sidecarMissing`, `sidecarTampered`; hàm thuần `integrity_error_code`, `give_up_code` có test), dò GPU sau khi đã kiểm (dùng kết quả của luồng dò nền `GpuProbe`, `start_gpu_probe`), kiểm có file model (`modelMissing`; kích thước và SHA-256 ở 04), dựng `SidecarSpec`.
- `state.rs`: trạng thái phiên thêm `starting` và `error`; `AppStatus` thêm `loading`, `sessionError`, `cpuFallback`, `suggestLite`, `indicators`, `permissionSuspected`, `waitingForApp` (nguồn một app đang chờ app phát lại) và `rev` (tăng mỗi lần trạng thái đổi). `tray.rs` coi `starting` như đang dịch.
- `events.rs`: tên `subtitle://delta` và `audio://level`; trạng thái gửi cho cả hai cửa sổ (thanh phụ đề cần chỉ báo, 03).
- `actions.rs`, `commands.rs`: `toggle_session` gọi `session::toggle`; lệnh `toggle_session` thành `async` (QĐ19; tác vụ nền dừng bất thường thì mã `unknown`); phím tắt và khay chạy trên luồng riêng; Thoát nhớ vị trí thanh phụ đề rồi tắt phiên và tiến trình phụ trên luồng riêng.
- `lib.rs`: hook panic kill tiến trình phụ (`pipeline::process::install_panic_hook`), Windows `SetDefaultDllDirectories`; trong `setup`: kill tiến trình phụ còn sót từ lần chạy trước theo pidfile rồi bật pidfile (QĐ8, Q8(a) của review 02c; comment ghi rõ việc này dựa vào plugin single-instance, N-10), dò GPU nền, quản lý `Session`, luồng tick. `window.rs`: `show_main` gọi `prewarm`.
- `test_support.rs`: `FakeDeps` (cổng chặn `prepare` như nạp model lâu, ghi lại việc của nguồn âm thanh từng phiên); `app_tests.rs`: phiên ra phụ đề thật qua engine, lỗi bắt đầu, lỗi sau khi bắt đầu, nghe thử thu cả âm thanh của app; và các luồng khó của Q6: Hủy lúc đang chuẩn bị về `idle` ngay, Thoát lúc `prepare` đang chặn trả về dưới 1 giây, lỗi tới muộn của phiên cũ không chạm phiên mới (kể cả chỉ báo chờ app), bấm từ ba luồng cùng lúc cho kết quả nhất quán, `rev` tăng; Hủy rồi Bắt đầu lại có phản hồi ngay (Q-E; lần đã hủy không mở nguồn âm thanh, chỉ lần mới mở: Nhỏ-1 của review 02 lần 3); hạn mức còn 0 thì không bắt đầu; bấm Bắt đầu gọi `allow_retry` trước `prepare`, chạy sẵn thì không (R3-1); lần đã hủy mà nạp lỗi thì không còn "Đang nạp model" (Nhỏ-7). Test `overlay_starts_hidden_and_appears_when_a_session_starts` của 01 vẫn qua.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `src-tauri/Cargo.toml`
- Sửa: `src-tauri/src/actions.rs`
- Test (sửa): `src-tauri/src/app_tests.rs`
- Sửa: `src-tauri/src/commands.rs`
- Sửa: `src-tauri/src/events.rs`
- Sửa: `src-tauri/src/lib.rs`
- Sửa: `src-tauri/src/overlay/mod.rs`
- Tạo: `src-tauri/src/session.rs`
- Xóa: `src-tauri/src/session_stub.rs`
- Sửa: `src-tauri/src/sidecar/mod.rs`
- Sửa: `src-tauri/src/state.rs`
- Test (sửa): `src-tauri/src/test_support.rs`
- Sửa: `src-tauri/src/tray.rs`
- Sửa: `src-tauri/src/window.rs`

- [ ] **Step 1: Khai báo phụ thuộc**

Bước này sửa `src-tauri/Cargo.toml`. Nếu `main` đã nâng plugin Tauri (autostart, single-instance, `tauri-plugin`, `tauri-utils`) thì giữ bản của `main`: khối dưới chỉ thêm các dòng của 02; nếu `git apply --check` lệch chỉ vì dòng phiên bản plugin làm ngữ cảnh, áp bằng `git apply --3way`, không đổi phiên bản về bản cũ.

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -42,9 +42,15 @@
 tauri-nspanel = "2.1.0"
 
 [target.'cfg(windows)'.dependencies]
-windows = { version = "0.62.2", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging"] }
+windows = { version = "0.62.2", features = [
+    "Win32_Foundation",
+    "Win32_System_LibraryLoader",
+    "Win32_UI_WindowsAndMessaging",
+] }
 windows-native-keyring-store = "1.1.0"
 
 [dev-dependencies]
+# Kiểu `TranscribeRequest`/`TranscribeResult` cho `asr-worker` giả trong `test_support.rs`.
+asr-protocol = { path = "../crates/asr-protocol" }
 # `test`: MockRuntime để test ACL của từng cửa sổ mà không mở cửa sổ thật.
 tauri = { version = "2.12.0", features = ["macos-private-api", "tray-icon", "test"] }
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -4,7 +4,7 @@
 //! tên binary (`meeting-translator`) và tên thư mục repo giữ nguyên (QĐ29).
 //!
 //! Kế hoạch 01 dựng khung: cài đặt, i18n phía Rust, khay, phím tắt, hai cửa sổ, quyền, kho khóa, log.
-//! Kế hoạch 02 nối `audio-capture` và `pipeline` vào, thay `session_stub.rs` bằng `session.rs`.
+//! Kế hoạch 02 nối `audio-capture` và `pipeline` vào (`session.rs`, `capture.rs`, `sidecar/`).
 
 pub mod actions;
 pub mod capture;
@@ -20,7 +20,7 @@
 pub mod overlay;
 pub mod quit_guard;
 pub mod security;
-pub mod session_stub;
+pub mod session;
 pub mod settings;
 pub mod sidecar;
 pub mod state;
@@ -36,6 +36,8 @@
 #[cfg(test)]
 mod test_support;
 
+use std::sync::Arc;
+
 use tauri::{App, AppHandle, Manager, RunEvent};
 
 use crate::hotkey_registry::HotkeyRegistry;
@@ -46,6 +48,10 @@
 pub const AUTOSTART_ARG: &str = "--autostart";
 
 pub fn run() {
+    // App panic thì kill tiến trình phụ trước khi abort (Windows: Job Object lo việc này).
+    pipeline::process::install_panic_hook();
+    #[cfg(windows)]
+    harden_dll_search();
     let context = tauri::generate_context!();
     // QĐ29: tên mục khởi động cùng hệ thống theo một luật duy nhất (`login_item::autostart_name`): macOS
     // là bundle identifier (tên file LaunchAgent và `Label`), Windows là tên sản phẩm (tên giá trị trong `Run`).
@@ -109,6 +115,22 @@
     }
     app.manage(AppState::new(settings.clone(), loaded.meta, launched_at_login));
     app.manage(HotkeyRegistry::default());
+    // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
+    // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
+    // plugin single-instance (đăng ký trước `setup`) bảo đảm không có bản app nào khác đang chạy: bản thứ hai thoát trước
+    // khi tới đây, nên mọi mục trong file là của một lần chạy đã chết, không phải của bản đang dùng tiến trình phụ đó.
+    let pidfile = handle.path().app_local_data_dir()?.join("sidecars-live.json");
+    if let Ok(dir) = sidecar::paths::binaries_dir() {
+        let reaped = pipeline::process::reap_orphans(&pidfile, &dir);
+        if !reaped.is_empty() {
+            log::warn!("đã kill {} tiến trình phụ còn sót từ lần chạy trước", reaped.len());
+        }
+    }
+    pipeline::process::set_pidfile(&pidfile);
+    app.manage(sidecar::GpuProbe::default());
+    sidecar::start_gpu_probe(&handle);
+    app.manage(session::Session::new(Arc::new(session::LiveDeps::new(handle.clone()))));
+    session::spawn_ticker(&handle);
 
     #[cfg(target_os = "macos")]
     {
@@ -144,6 +166,22 @@
         // Bấm icon ở Dock khi cửa sổ chính đang ẩn.
         #[cfg(target_os = "macos")]
         RunEvent::Reopen { .. } => window::show_main(app),
+        // Lưới an toàn: tiến trình phụ nào còn sống lúc app thoát thì kill (Thoát ở menu khay đã tắt chúng).
+        RunEvent::Exit => pipeline::process::kill_all(),
         _ => {}
     }
 }
+
+/// Windows: chỉ nạp DLL từ thư mục hệ thống và thư mục của app, không từ thư mục hiện hành hay `PATH` (chống DLL
+/// hijacking, §10.2).
+#[cfg(windows)]
+fn harden_dll_search() {
+    use windows::Win32::System::LibraryLoader::{
+        LOAD_LIBRARY_SEARCH_APPLICATION_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32, SetDefaultDllDirectories,
+    };
+    if let Err(e) =
+        unsafe { SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_APPLICATION_DIR) }
+    {
+        log::warn!("không đặt được thư mục tìm DLL: {e}");
+    }
+}
```

- [ ] **Step 2: Viết test**

Thay toàn bộ `src-tauri/src/app_tests.rs` bằng:

```rust
//! Test hành vi của app qua lệnh `invoke`, chạy bằng `MockRuntime` (không mở cửa sổ thật).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::{Listener, Manager};

use crate::actions;
use crate::errors;
use crate::events::{AUDIO_LEVEL, NOTICE, SUBTITLE_DELTA, SUBTITLE_UPSERT};
use crate::login_item::AgentStatus;
use crate::session::{self, StartOptions};
use crate::state::{AppState, SessionStatus};
use crate::test_support::{
    FakeAudio, FakeDeps, PrepareGate, invoke, last_saved, login_state, mock_app, mock_app_with, overlay_calls, window,
};

/// Ghi lại mọi payload của một sự kiện.
fn record(app: &tauri::App<tauri::test::MockRuntime>, event: &str) -> Arc<Mutex<Vec<Value>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    app.listen_any(event, move |e| {
        sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
    });
    received
}

/// Chờ tới khi `ok` đúng, tối đa 10 giây.
fn wait_until(what: &str, ok: impl Fn() -> bool) {
    let started = Instant::now();
    while !ok() {
        assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn overlay_starts_hidden_and_appears_when_a_session_starts() {
    let app = mock_app();
    let main = window(&app, "main");
    let status = invoke(&main, "get_app_status", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("idle"), Some(false))
    );
    assert!(overlay_calls(&app).is_empty());
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("running"), Some(true))
    );
    assert_eq!(overlay_calls(&app), ["show"], "bắt đầu phiên thì hiện thanh phụ đề");
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("idle"), Some(true)),
        "dừng phiên thì thanh phụ đề giữ nguyên"
    );
    assert_eq!(overlay_calls(&app), ["show"]);
}

#[test]
fn hide_show_and_lock_reach_the_overlay_window() {
    let app = mock_app();
    let main = window(&app, "main");
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": true })).unwrap();
    assert_eq!(status["overlayVisible"], true);
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": false })).unwrap();
    assert_eq!(status["overlayVisible"], false);
    let settings = invoke(&main, "set_overlay_locked", json!({ "locked": true })).unwrap();
    assert_eq!(settings["overlay"]["locked"], true);
    assert_eq!(
        last_saved(&app, "overlay").unwrap()["locked"],
        true,
        "khóa được ghi vào file"
    );
    invoke(&main, "set_overlay_locked", json!({ "locked": false })).unwrap();
    assert_eq!(
        overlay_calls(&app),
        ["show", "hide", "click_through on", "click_through off"],
        "khóa và mở khóa không tự hiện hay ẩn thanh phụ đề"
    );
}

#[test]
fn blocked_quit_shows_a_notice_in_the_main_window() {
    let app = mock_app();
    let _main = window(&app, "main");
    let received = notices(&app);
    actions::quit_blocked(app.handle());
    assert_eq!(*received.lock().unwrap(), [r#"{"kind":"quitFromTray"}"#]);
}

fn notices(app: &tauri::App<tauri::test::MockRuntime>) -> Arc<Mutex<Vec<String>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    app.listen_any(NOTICE, move |event| {
        sink.lock().unwrap().push(event.payload().to_string())
    });
    received
}

#[test]
fn enabling_launch_at_login_blocked_in_login_items_shows_a_notice() {
    let app = mock_app();
    let main = window(&app, "main");
    let received = notices(&app);
    login_state(&app, |s| s.status = Some(AgentStatus::RequiresApproval));
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    assert_eq!(settings["launchAtLogin"], true);
    assert_eq!(*received.lock().unwrap(), [r#"{"kind":"loginItemsApproval"}"#]);
}

#[test]
fn turning_off_launch_at_login_works_and_reports_when_it_stays_on() {
    let app = mock_app();
    let main = window(&app, "main");
    let registered = |app: &tauri::App<tauri::test::MockRuntime>| {
        let mut value = false;
        login_state(app, |s| value = s.registered);
        value
    };
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    assert_eq!(settings["launchAtLogin"], true);
    assert!(registered(&app), "bật thì gọi `enable()`");
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap();
    assert_eq!(settings["launchAtLogin"], false);
    assert!(!registered(&app), "tắt bình thường thì hết đăng ký");
    invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    // Windows: mục ở `HKLM` không xóa được khi không có quyền admin.
    login_state(&app, |s| s.stuck_on = true);
    let error = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap_err();
    assert!(error.contains("autostartStillEnabled"), "{error}");
    let settings = invoke(&main, "get_settings", json!({})).unwrap();
    assert_eq!(settings["launchAtLogin"], true, "cài đặt giữ đúng trạng thái thật");
}

#[test]
fn startup_follows_the_system_when_login_items_turned_it_off() {
    let app = mock_app();
    login_state(&app, |s| {
        s.registered = true;
        s.status = Some(AgentStatus::RequiresApproval);
    });
    let mut settings = crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi);
    settings.launch_at_login = true;
    assert!(actions::sync_launch_at_login(app.handle(), &mut settings));
    assert!(!settings.launch_at_login);
}

#[test]
fn a_session_turns_speech_into_subtitle_events() {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    let (upserts, deltas, levels) = (
        record(&app, SUBTITLE_UPSERT),
        record(&app, SUBTITLE_DELTA),
        record(&app, AUDIO_LEVEL),
    );
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    wait_until("một phụ đề dịch xong", || {
        upserts.lock().unwrap().iter().any(|s| s["status"] == "done")
    });
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "idle");

    let upserts = upserts.lock().unwrap();
    let done = upserts.iter().find(|s| s["status"] == "done").unwrap();
    assert_eq!(
        (&done["src_lang"], &done["src_text"], &done["tgt_text"]),
        (&json!("en"), &json!("Hello everyone."), &json!("Xin chào mọi người."))
    );
    assert!(
        done["id"].as_u64().unwrap() >= 1_000_000,
        "id của phiên thứ nhất bắt đầu từ 1 000 000: {done}"
    );
    let id = done["id"].clone();
    assert!(
        deltas.lock().unwrap().iter().any(|d| d["id"] == id),
        "chữ dịch tới dần qua subtitle://delta"
    );
    assert!(!levels.lock().unwrap().is_empty(), "có mức âm lượng cho giao diện");
}

#[test]
fn a_failed_start_reports_its_error_code() {
    let app = mock_app_with(FakeDeps {
        prepare_error: Some(errors::MODEL_MISSING),
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    let result = invoke(&main, "toggle_session", json!({}));
    assert!(
        matches!(&result, Err(message) if message.contains(errors::MODEL_MISSING)),
        "{result:?}"
    );
    let status = invoke(&main, "get_app_status", json!({})).unwrap();
    assert_eq!(
        (&status["session"], &status["sessionError"]),
        (&json!("error"), &json!(errors::MODEL_MISSING))
    );
}

/// Lỗi tới sau khi phiên đã chạy (nguồn âm thanh chưa có quyền, `asr-worker` bỏ cuộc): phiên dừng, trạng thái lỗi.
#[test]
fn errors_after_the_start_stop_the_session_with_their_code() {
    let cases = [
        (
            FakeDeps {
                capture_error: Some(errors::AUDIO_PERMISSION),
                ..FakeDeps::default()
            },
            errors::AUDIO_PERMISSION,
        ),
        (
            FakeDeps {
                audio: FakeAudio::Tone,
                asr_unavailable: true,
                ..FakeDeps::default()
            },
            errors::SIDECAR_FAILED,
        ),
    ];
    for (deps, code) in cases {
        let app = mock_app_with(deps);
        let main = window(&app, "main");
        invoke(&main, "toggle_session", json!({})).unwrap();
        let state = app.state::<AppState>();
        wait_until(code, || state.status().session == SessionStatus::Error);
        assert_eq!(state.status().session_error.as_deref(), Some(code));
        let status = invoke(&main, "toggle_session", json!({})).unwrap();
        assert_ne!(status["session"], "error", "bấm Bắt đầu lại thì thử lại");
    }
}

/// Bước "Nghe thử" của kế hoạch 03 (Đ16): phiên mở nguồn âm thanh có thu cả âm thanh của chính app; phiên thường thì không.
#[test]
fn a_listening_test_session_also_captures_the_app_itself() {
    let deps = FakeDeps::default();
    let captures = deps.captures.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::start_with(app.handle(), StartOptions { include_self: true }).unwrap();
    session::stop(app.handle());
    session::start(app.handle()).unwrap();
    session::stop(app.handle());
    assert_eq!(*captures.lock().unwrap(), [true, false]);
}

/// App giả có `prepare` chặn ở cổng (như nạp model lâu), và một lần bắt đầu phiên đang chờ ở đó trên luồng riêng.
struct StartingApp {
    app: tauri::App<tauri::test::MockRuntime>,
    gate: Arc<PrepareGate>,
    /// Các lần gọi `shutdown` và `kill_all` của phần bên ngoài giả.
    shutdowns: Arc<Mutex<Vec<&'static str>>>,
    /// Các lần mở nguồn âm thanh (`include_self` của từng lần).
    captures: Arc<Mutex<Vec<bool>>>,
    starting: std::thread::JoinHandle<Result<crate::state::AppStatus, crate::errors::CommandError>>,
}

fn starting_app() -> StartingApp {
    let gate = Arc::new(PrepareGate::default());
    let deps = FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    };
    let shutdowns = deps.shutdowns.clone();
    let captures = deps.captures.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    let handle = app.handle().clone();
    let starting = std::thread::spawn(move || session::start(&handle));
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    assert_eq!(app.state::<AppState>().status().session, SessionStatus::Starting);
    StartingApp {
        app,
        gate,
        shutdowns,
        captures,
        starting,
    }
}

/// Q1 của review 02c: bấm lần nữa lúc đang chuẩn bị là Hủy: về `idle` ngay, không chờ nạp model; lần bắt đầu đang dở
/// không chạy phiên khi nạp xong.
#[test]
fn cancel_while_starting_returns_to_idle_at_once() {
    let StartingApp {
        app,
        gate,
        starting,
        captures,
        ..
    } = starting_app();
    let started = Instant::now();
    let status = session::toggle(app.handle()).unwrap();
    assert!(started.elapsed() < Duration::from_secs(1));
    assert_eq!(status.session, SessionStatus::Idle);
    gate.open();
    let after = starting.join().unwrap().unwrap();
    assert_eq!(after.session, SessionStatus::Idle);
    assert!(!app.state::<session::Session>().has_engine(), "không có phiên nào chạy");
    assert_eq!(app.state::<AppState>().status().session, SessionStatus::Idle);
    assert!(
        captures.lock().unwrap().is_empty(),
        "lần đã hủy không mở nguồn âm thanh"
    );
}

/// Q-E của review 02 lần 2: Hủy rồi bấm Bắt đầu lại trong lúc lần đã hủy còn đang chờ nạp model. Lần mới hiện `starting`
/// ngay (không chờ lần cũ nạp xong); khi nạp xong, chỉ lần mới chạy phiên.
#[test]
fn start_again_after_cancel_responds_at_once() {
    let StartingApp {
        app,
        gate,
        starting,
        captures,
        ..
    } = starting_app();
    assert_eq!(session::toggle(app.handle()).unwrap().session, SessionStatus::Idle);
    let handle = app.handle().clone();
    let again = std::thread::spawn(move || session::toggle(&handle));
    wait_until("lần bắt đầu mới hiện starting", || {
        app.state::<AppState>().status().session == SessionStatus::Starting
    });
    wait_until("cả hai lần đều đang chờ nạp model", || gate.waiting() == 2);
    gate.open();
    let _ = starting.join().unwrap().unwrap(); // lần đã hủy trả về mà không chạy phiên
    let status = again.join().unwrap().unwrap();
    assert_eq!(status.session, SessionStatus::Running);
    assert!(app.state::<session::Session>().has_engine());
    assert_eq!(captures.lock().unwrap().len(), 1, "chỉ lần mới mở nguồn âm thanh");
    session::stop(app.handle());
}

/// Nhỏ-7 của review 02 lần 3: Hủy, rồi lần đã hủy nạp lỗi. Sự kiện tới muộn của tiến trình phụ đã đặt lại "Đang nạp
/// model"; khi lần đó kết thúc, chỉ báo được bỏ, trạng thái vẫn `idle`, không báo lỗi.
#[test]
fn a_cancelled_start_that_fails_clears_the_loading_note() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        prepare_error: Some(errors::MODEL_MISSING),
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let handle = app.handle().clone();
    let starting = std::thread::spawn(move || session::start(&handle));
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    assert_eq!(session::toggle(app.handle()).unwrap().session, SessionStatus::Idle);
    let state = app.state::<AppState>();
    state.update_status(|s| s.loading = Some(crate::state::Loading::Model));
    gate.open();
    let result = starting.join().unwrap();
    assert!(result.is_ok(), "lần đã hủy không báo lỗi: {result:?}");
    let status = state.status();
    assert_eq!((status.session, status.loading), (SessionStatus::Idle, None));
}

/// R3-1 của review 02 lần 3: bấm Bắt đầu thì cho tiến trình phụ đã bỏ cuộc thử lại, trước khi chuẩn bị; chạy sẵn khi mở
/// cửa sổ chính thì không.
#[test]
fn a_user_start_allows_a_retry_before_preparing_and_prewarm_does_not() {
    let deps = FakeDeps::default();
    let calls = deps.calls.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::prewarm(app.handle());
    wait_until("chạy sẵn xong", || !calls.lock().unwrap().is_empty());
    assert_eq!(*calls.lock().unwrap(), ["prepare"]);
    session::toggle(app.handle()).unwrap();
    assert_eq!(*calls.lock().unwrap(), ["prepare", "allow_retry", "prepare"]);
    session::stop(app.handle());
}

/// Chỗ nối của kế hoạch 06: hạn mức còn 0 thì không bắt đầu phiên (không chuẩn bị tiến trình phụ), trạng thái ra lỗi
/// `quotaExhausted`.
#[test]
fn an_exhausted_quota_refuses_to_start() {
    let deps = FakeDeps {
        quota_exhausted: true,
        ..FakeDeps::default()
    };
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    let err = session::toggle(app.handle()).unwrap_err();
    assert_eq!(err.code, errors::QUOTA_EXHAUSTED);
    let status = app.state::<AppState>().status();
    assert_eq!(
        (status.session, status.session_error.as_deref()),
        (SessionStatus::Error, Some(errors::QUOTA_EXHAUSTED))
    );
    assert_eq!(*prepares.lock().unwrap(), 0);
}

/// N1 của review 02c: thoát app lúc đang chờ nạp model trả về ngay (không chờ 60–180 giây).
#[test]
fn shutdown_while_preparing_returns_quickly() {
    let StartingApp {
        app,
        shutdowns,
        starting,
        ..
    } = starting_app();
    let started = Instant::now();
    session::shutdown(app.handle());
    assert!(started.elapsed() < Duration::from_secs(1), "{:?}", started.elapsed());
    assert_eq!(*shutdowns.lock().unwrap(), ["shutdown", "kill_all"]);
    let result = starting.join().unwrap();
    assert!(result.is_ok(), "lần bắt đầu bị hủy, không báo lỗi: {result:?}");
    assert!(!app.state::<session::Session>().has_engine());
}

/// Lỗi của một phiên cũ tới muộn (nguồn âm thanh của phiên trước) không dừng phiên mới.
#[test]
fn a_late_error_of_an_old_session_does_not_touch_the_new_one() {
    let deps = FakeDeps::default();
    let events = deps.capture_events.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::start(app.handle()).unwrap();
    session::stop(app.handle());
    session::start(app.handle()).unwrap();
    let old = events.lock().unwrap().remove(0);
    old(crate::capture::CaptureEvent::Failed {
        code: errors::CAPTURE_FAILED,
        message: "phiên cũ".into(),
    });
    old(crate::capture::CaptureEvent::PermissionSuspected(true));
    std::thread::sleep(Duration::from_millis(300));
    let status = app.state::<AppState>().status();
    assert_eq!(
        (status.session, status.session_error, status.permission_suspected),
        (SessionStatus::Running, None, false)
    );
    old(crate::capture::CaptureEvent::WaitingForApp(true));
    assert!(!app.state::<AppState>().status().waiting_for_app);
    // Lỗi của chính phiên đang chạy thì dừng phiên; chỉ báo của nó thì hiện.
    let current = events.lock().unwrap().remove(0);
    current(crate::capture::CaptureEvent::PermissionSuspected(true));
    assert!(app.state::<AppState>().status().permission_suspected);
    current(crate::capture::CaptureEvent::WaitingForApp(true));
    assert!(app.state::<AppState>().status().waiting_for_app);
    current(crate::capture::CaptureEvent::WaitingForApp(false));
    assert!(!app.state::<AppState>().status().waiting_for_app);
    current(crate::capture::CaptureEvent::Failed {
        code: errors::CAPTURE_FAILED,
        message: "phiên này".into(),
    });
    let state = app.state::<AppState>();
    wait_until("phiên dừng vì lỗi", || {
        state.status().session == SessionStatus::Error
    });
    assert_eq!(state.status().session_error.as_deref(), Some(errors::CAPTURE_FAILED));
}

/// Bấm Bắt đầu từ ba nơi cùng lúc (nút, phím tắt, khay) trong lúc đang nạp model: kết quả cuối nhất quán, không kẹt ở
/// `starting`, và có engine khi và chỉ khi trạng thái là `running`.
#[test]
fn toggling_from_three_threads_ends_in_a_consistent_state() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let toggles: Vec<_> = (0..3)
        .map(|_| {
            let handle = app.handle().clone();
            std::thread::spawn(move || session::toggle(&handle))
        })
        .collect();
    std::thread::sleep(Duration::from_millis(100));
    gate.open();
    for t in toggles {
        t.join().unwrap().unwrap();
    }
    let status = app.state::<AppState>().status();
    assert_ne!(status.session, SessionStatus::Starting);
    assert_eq!(
        status.session == SessionStatus::Running,
        app.state::<session::Session>().has_engine()
    );
    session::stop(app.handle());
}

/// Trạng thái có `rev` tăng dần, để giao diện bỏ kết quả cũ tới muộn.
#[test]
fn the_status_revision_grows_with_every_change() {
    let app = mock_app();
    let main = window(&app, "main");
    let before = invoke(&main, "get_app_status", json!({})).unwrap()["rev"]
        .as_u64()
        .unwrap();
    let running = invoke(&main, "toggle_session", json!({})).unwrap()["rev"]
        .as_u64()
        .unwrap();
    let idle = invoke(&main, "toggle_session", json!({})).unwrap()["rev"]
        .as_u64()
        .unwrap();
    assert!(before < running && running < idle, "{before} {running} {idle}");
}
```

Tạo `src-tauri/src/session.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Phiên dịch (spec §4.2, §12): nối `audio-capture` và `pipeline` vào app. Thay `session_stub.rs` của kế hoạch 01.
//!
//! - Bắt đầu (nút, phím tắt, khay): hiện thanh phụ đề, chạy hai tiến trình phụ nếu chưa chạy ("Đang nạp model…"), mở nguồn
//!   âm thanh, chạy `pipeline::engine`. Mọi việc này chặn lâu nên không bao giờ chạy trên luồng chính.
//! - Bấm lần nữa khi đang chuẩn bị là Hủy: trạng thái về `idle` ngay; lần bắt đầu đang dở thấy cờ hủy thì không chạy
//!   phiên (kiểm cả sau khi đã dựng engine, cùng khóa với trạng thái).
//! - Dừng: engine chốt đoạn đang dở, dịch nốt câu cuối trong khoảng 3 giây, rồi dừng; tiến trình phụ còn chạy thêm 10 phút
//!   (§5).
//! - Lỗi làm phiên dừng (tiến trình phụ bỏ cuộc, không mở được nguồn âm thanh, thiếu quyền): trạng thái `error` kèm mã lỗi.
//!   Lỗi của một phiên cũ (tới muộn) không chạm phiên mới.
//! - Thoát app ([`shutdown`]): không chờ tiến trình phụ đang nạp model hay đang treo; kill chúng.
//! - Phụ đề đi qua hai sự kiện của §6.6 (`subtitle://upsert`, `subtitle://delta`), mức âm lượng qua `audio://level` (chỉ
//!   cửa sổ chính), chỉ báo (trễ, không có âm thanh) qua `app://status`.
//! - Hạn mức (§6.8): engine báo phút đã dịch qua `EventSink::usage`; kế hoạch 06 nối bộ đếm vào [`TauriSink`]. Hết hạn mức
//!   thì engine dừng với `Fatal::QuotaExhausted`, mã lỗi `quotaExhausted`.
//!
//! Phần bên ngoài (tiến trình phụ, nguồn âm thanh, VAD) đi qua `SessionDeps`: app dùng `LiveDeps`, test dùng bản giả
//! (`test_support.rs`), nên luồng bắt đầu, hủy, dừng, lỗi, thoát test được bằng `MockRuntime`.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::UiLanguage;

    /// Đếm số lần giám sát hỏi trước khi chạy một tiến trình phụ.
    #[derive(Default)]
    struct CountSpawns(Mutex<usize>);

    impl SidecarEvents for CountSpawns {
        fn on_event(&self, _: &SidecarEvent) {}
        fn before_spawn(&self, _: Which, _: &Path) -> Result<(), String> {
            *self.0.lock().unwrap() += 1;
            Ok(())
        }
    }

    /// Q4-1 của review 02 lần 4: `LiveDeps::allow_retry` cho đúng `SidecarManager` đang dùng thử lại. Tiến trình phụ trỏ
    /// tới một binary không có nên lỗi ngay; `max_failures` 0 nên bỏ cuộc ở lần lỗi đầu.
    #[test]
    fn allow_retry_reaches_the_live_manager() {
        use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
        use pipeline::supervisor::{AsrSpec, FakeClock, LlamaSpec, SidecarSpec};
        let missing = PathBuf::from("/khong/co/asr-worker");
        let spec = SidecarSpec {
            asr: AsrSpec {
                exe_gpu: None,
                exe_cpu: missing.clone(),
                model: PathBuf::from("/khong/co/model.bin"),
                log: std::env::temp_dir().join(format!("mt-allow-retry-{}.log", std::process::id())),
                first_run: false,
                require_shared: false,
                env: Vec::new(),
            },
            llama: LlamaSpec {
                exe: missing,
                model: PathBuf::from("/khong/co/mt.gguf"),
                log: std::env::temp_dir().join(format!("mt-allow-retry-llama-{}.log", std::process::id())),
                extra_args: Vec::new(),
                first_run: false,
                env: Vec::new(),
            },
            supervisor: SupervisorConfig {
                max_failures: 0,
                ..SupervisorConfig::default()
            },
            asr_config: AsrConfig::default(),
            mt_config: MtConfig::default(),
        };
        let spawns = Arc::new(CountSpawns::default());
        let manager = SidecarManager::new(spec, Arc::new(FakeClock::default()), spawns.clone());
        let app = tauri::test::mock_app();
        let deps = LiveDeps::new(app.handle().clone());
        *deps.live.lock().unwrap() = Some(Live {
            manager: manager.clone(),
            tier: None,
            vad_model: PathBuf::new(),
        });
        assert_eq!(manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
        assert_eq!(manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
        assert_eq!(*spawns.0.lock().unwrap(), 1, "đã bỏ cuộc thì không chạy lại");
        deps.allow_retry();
        assert!(manager.ensure_started().is_err());
        assert_eq!(*spawns.0.lock().unwrap(), 2, "bấm Bắt đầu thì thử lại");
    }

    /// Q4-2 của review 02 lần 4: `asr-worker` chạy lại được bằng GPU thì bỏ chỉ báo "Đang chạy bằng CPU".
    #[test]
    fn a_gpu_ready_clears_the_cpu_fallback_note() {
        let app = crate::test_support::mock_app();
        let events = StatusEvents {
            app: app.handle().clone(),
            dir: PathBuf::new(),
            hashes: Vec::new(),
            seen_file: PathBuf::new(),
            last_exe: Mutex::new([None, None]),
            locks: Mutex::new(Vec::new()),
            asr_gave_up: Arc::default(),
            on_cpu: Mutex::new([false, false]),
        };
        let state = app.state::<AppState>();
        events.on_event(&SidecarEvent::CpuFallback { which: Which::Asr });
        assert!(state.status().cpu_fallback);
        let ready = |which, use_gpu| SidecarEvent::Ready {
            which,
            use_gpu,
            backend: None,
            first_run: false,
        };
        events.on_event(&ready(Which::Asr, false));
        events.on_event(&ready(Which::Llama, true));
        assert!(state.status().cpu_fallback, "vẫn chạy bằng CPU");
        events.on_event(&ready(Which::Asr, true));
        assert!(!state.status().cpu_fallback);
        // Q5-1 của review 02 lần 5, kịch bản 1: `llama-server` tự sang CPU, rồi `asr-worker` chạy lại bằng GPU: chỉ báo
        // còn, vì `llama-server` vẫn chạy bằng CPU.
        events.on_event(&SidecarEvent::CpuFallback { which: Which::Llama });
        events.on_event(&ready(Which::Llama, false));
        events.on_event(&ready(Which::Asr, true));
        events.on_event(&ready(Which::Llama, false));
        assert!(state.status().cpu_fallback, "llama-server vẫn chạy -ngl 0");
        // Kịch bản 2: `llama-server` về GPU ở lần chạy kế tiếp thì chỉ báo tắt.
        events.on_event(&ready(Which::Llama, true));
        assert!(!state.status().cpu_fallback);
        // Máy không có GPU dùng được: `Ready` bằng CPU ngay lần đầu cũng bật chỉ báo.
        events.on_event(&ready(Which::Asr, false));
        assert!(state.status().cpu_fallback);
    }

    /// N-6 của review 02 lần 2: bấm Bắt đầu thì quên lý do bỏ cuộc cũ, mã lỗi giữa phiên về mặc định.
    #[test]
    fn a_new_start_forgets_why_the_worker_gave_up() {
        let app = tauri::test::mock_app();
        let deps = LiveDeps::new(app.handle().clone());
        *deps.asr_gave_up.lock().unwrap() = Some(GiveUpCause::Tampered);
        assert_eq!(deps.asr_failure_code(), errors::SIDECAR_TAMPERED);
        deps.allow_retry();
        assert_eq!(deps.asr_failure_code(), errors::SIDECAR_FAILED);
    }

    #[test]
    fn the_engine_follows_the_language_and_pause_settings() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.vad_end_silence_ms = 500;
        let cfg = engine_config(&settings, 3_000_000);
        assert_eq!(cfg.languages, ["en", "zh", "ja", "ko", "vi"]);
        assert_eq!(cfg.target, MtLang::Vi);
        assert_eq!(cfg.pipeline.segmenter.end_silence_ms, 500);
        assert!(!cfg.translation_context);
        assert_eq!(cfg.id_base, 3_000_000);
        settings.source_lock = Some(Lang::Ja);
        settings.target_language = Lang::En;
        settings.experimental.translation_context = true;
        let cfg = engine_config(&settings, 0);
        assert_eq!(cfg.languages, ["ja"], "khóa ngôn ngữ nguồn thì bỏ nhận diện (§6.4)");
        assert_eq!(cfg.target, MtLang::En);
        assert!(cfg.translation_context);
    }

    #[test]
    fn every_fatal_reason_has_an_error_code() {
        let codes: Vec<&str> = [
            Fatal::Vad,
            Fatal::Audio,
            Fatal::Asr,
            Fatal::Internal,
            Fatal::QuotaExhausted,
        ]
        .into_iter()
        .map(|k| fatal_code(k, errors::SIDECAR_TAMPERED))
        .collect();
        assert_eq!(
            codes,
            [
                errors::VAD_FAILED,
                errors::CAPTURE_FAILED,
                errors::SIDECAR_TAMPERED,
                errors::UNKNOWN,
                errors::QUOTA_EXHAUSTED
            ]
        );
    }
}
```

Thay toàn bộ `src-tauri/src/sidecar/mod.rs` bằng:

```rust
//! Phần của app quanh hai tiến trình phụ (Đ2 của kế hoạch 00): tìm file, kiểm SHA-256, nhớ binary đã chạy, dò GPU trên
//! Windows, rồi dựng `SidecarSpec`. Việc chạy và giám sát nằm ở `pipeline::supervisor`.

pub mod first_run;
pub mod integrity;
pub mod paths;
pub mod probe;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn errors_map_to_ui_codes() {
        use integrity::IntegrityError;
        assert_eq!(
            integrity_error_code(&IntegrityError::Missing("x".into())),
            errors::SIDECAR_MISSING
        );
        for e in [
            IntegrityError::Unverified("x".into()),
            IntegrityError::Tampered("x".into()),
            IntegrityError::Writable("x".into()),
        ] {
            assert_eq!(integrity_error_code(&e), errors::SIDECAR_TAMPERED, "{e:?}");
        }
        assert_eq!(give_up_code(GiveUpCause::Tampered), errors::SIDECAR_TAMPERED);
        assert_eq!(give_up_code(GiveUpCause::ModelLoad), errors::MODEL_BROKEN);
        assert_eq!(give_up_code(GiveUpCause::Failures), errors::SIDECAR_FAILED);
    }

    /// Q7 của review 02c: dò quá giờ thì không nhớ (lần sau dò lại); có kết quả thì nhớ, và lần dò đang chạy được dùng chung.
    #[test]
    fn a_timed_out_probe_is_not_remembered() {
        let probe = GpuProbe::default();
        let calls = AtomicUsize::new(0);
        assert_eq!(
            probe.run(|| {
                calls.fetch_add(1, Ordering::SeqCst);
                None
            }),
            None
        );
        assert_eq!(probe.get(Duration::ZERO), None);
        assert_eq!(
            probe.run(|| {
                calls.fetch_add(1, Ordering::SeqCst);
                Some(true)
            }),
            Some(true)
        );
        assert_eq!(probe.run(|| panic!("đã có kết quả thì không dò nữa")), Some(true));
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        // Một luồng đang dò: luồng khác chờ kết quả đó.
        let probe = Arc::new(GpuProbe::default());
        let slow = {
            let probe = probe.clone();
            std::thread::spawn(move || {
                probe.run(|| {
                    std::thread::sleep(Duration::from_millis(100));
                    Some(false)
                })
            })
        };
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(probe.run(|| panic!("đang có người dò")), Some(false));
        assert_eq!(slow.join().unwrap(), Some(false));
    }
}
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -1,20 +1,31 @@
 //! Dụng cụ cho các test chạy app bằng `MockRuntime`: đúng `tauri.conf.json`, `capabilities/` và app
-//! manifest của `build.rs`, nhưng không mở cửa sổ thật.
-
-use std::sync::{Arc, Mutex};
-
+//! manifest của `build.rs`, nhưng không mở cửa sổ thật. Phiên dịch chạy đúng `session.rs` và `pipeline::engine`, với
+//! phần bên ngoài giả (`FakeDeps`): không chạy tiến trình phụ, không thu âm thật.
+
+use std::ops::ControlFlow;
+use std::sync::{Arc, Condvar, Mutex};
+use std::time::Duration;
+
+use asr_protocol::{TranscribeRequest, TranscribeResult};
+use pipeline::engine::{EnergyVad, FrameSource, VadFactory};
+use pipeline::llama::{ChatRequest, StreamEnd};
+use pipeline::supervisor::{Asr, AsrFailure};
+use pipeline::translate::{Mt, MtError};
 use serde_json::Value;
 use tauri::ipc::{CallbackFn, InvokeBody};
 use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
 use tauri::webview::InvokeRequest;
 use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};
 
+use crate::capture::OnEvent;
 use crate::commands;
+use crate::errors::{self, CommandError};
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
 use crate::overlay::{OverlaySurface, Surface};
+use crate::session::{Session, SessionDeps};
 use crate::settings::migrate::FileMeta;
 use crate::settings::persist::{SettingsFile, Writer};
-use crate::settings::{Settings, UiLanguage};
+use crate::settings::{AudioSource, Settings, UiLanguage};
 use crate::state::AppState;
 use crate::system::{System, SystemOpener};
 
@@ -112,7 +123,231 @@
     }
 }
 
+/// Âm thanh giả của một phiên.
+#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
+pub enum FakeAudio {
+    /// Chỉ im lặng: phiên chạy nhưng không có phụ đề.
+    #[default]
+    Silence,
+    /// 1 giây tiếng, 1 giây im lặng, lặp lại; phát nhanh gấp 10 lần thời gian thật.
+    Tone,
+}
+
+/// Cổng chặn `prepare` (như nạp model lâu): `prepare` chờ tới khi cổng mở, hoặc app thoát.
+#[derive(Debug, Default)]
+pub struct PrepareGate {
+    /// (cổng đã mở, app đang thoát)
+    state: Mutex<(bool, bool)>,
+    changed: Condvar,
+    /// Số lần `prepare` đang chờ ở cổng.
+    waiting: Mutex<usize>,
+}
+
+impl PrepareGate {
+    pub fn open(&self) {
+        self.state.lock().unwrap().0 = true;
+        self.changed.notify_all();
+    }
+
+    pub fn waiting(&self) -> usize {
+        *self.waiting.lock().unwrap()
+    }
+
+    fn close_for_shutdown(&self) {
+        self.state.lock().unwrap().1 = true;
+        self.changed.notify_all();
+    }
+
+    /// `Ok` khi cổng mở; `Err` khi app thoát trong lúc chờ.
+    fn pass(&self) -> Result<(), CommandError> {
+        *self.waiting.lock().unwrap() += 1;
+        let state = self.state.lock().unwrap();
+        let state = self
+            .changed
+            .wait_while(state, |(open, closing)| !*open && !*closing)
+            .unwrap();
+        let closing = state.1;
+        drop(state);
+        *self.waiting.lock().unwrap() -= 1;
+        if closing {
+            return Err(CommandError::new(errors::SIDECAR_FAILED, None, "app đang thoát"));
+        }
+        Ok(())
+    }
+}
+
+/// Phần bên ngoài giả của phiên dịch.
+#[derive(Clone, Default)]
+pub struct FakeDeps {
+    pub audio: FakeAudio,
+    /// `prepare` trả lỗi có mã này (ví dụ thiếu model).
+    pub prepare_error: Option<&'static str>,
+    /// `prepare` chờ ở cổng này (Q6 của review 02c).
+    pub prepare_gate: Option<Arc<PrepareGate>>,
+    /// Hạn mức đã hết: `check_quota` từ chối (chỗ nối của kế hoạch 06).
+    pub quota_exhausted: bool,
+    /// Số lần `prepare` được gọi.
+    pub prepares: Arc<Mutex<usize>>,
+    /// Thứ tự gọi `allow_retry` và `prepare` (R3-1 của review 02 lần 3).
+    pub calls: Arc<Mutex<Vec<&'static str>>>,
+    /// Nguồn âm thanh báo lỗi có mã này ngay khi mở (ví dụ chưa cấp quyền).
+    pub capture_error: Option<&'static str>,
+    /// `asr-worker` không dùng được nữa (bỏ cuộc sau nhiều lần lỗi).
+    pub asr_unavailable: bool,
+    /// Giá trị `include_self` của từng lần mở nguồn âm thanh.
+    pub captures: Arc<Mutex<Vec<bool>>>,
+    /// Nơi nhận việc của nguồn âm thanh của từng phiên, theo thứ tự: test gọi để giả lỗi tới muộn.
+    pub capture_events: Arc<Mutex<Vec<OnEvent>>>,
+    /// Số lần `shutdown` và `kill_all` được gọi.
+    pub shutdowns: Arc<Mutex<Vec<&'static str>>>,
+}
+
+struct FakeCapture {
+    audio: FakeAudio,
+    pos: usize,
+}
+
+impl FrameSource for FakeCapture {
+    fn read(&mut self, out: &mut Vec<f32>, _timeout: Duration) -> anyhow::Result<bool> {
+        // 100 ms âm thanh mỗi 10 ms.
+        std::thread::sleep(Duration::from_millis(10));
+        for _ in 0..1_600 {
+            let speaking = self.audio == FakeAudio::Tone && (self.pos / 16_000).is_multiple_of(2);
+            let t = self.pos as f32 / 16_000.0;
+            out.push(if speaking {
+                0.3 * (2.0 * std::f32::consts::PI * 220.0 * t).sin()
+            } else {
+                0.0
+            });
+            self.pos += 1;
+        }
+        Ok(true)
+    }
+}
+
+struct FakeAsr {
+    unavailable: bool,
+}
+
+impl Asr for FakeAsr {
+    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
+        if self.unavailable {
+            return Err(AsrFailure::Unavailable("asr-worker giả bỏ cuộc".into()));
+        }
+        Ok(TranscribeResult {
+            segment_id: req.segment_id,
+            lang: "en".into(),
+            lang_prob: 0.99,
+            text: "Hello everyone.".into(),
+            tokens: vec![15947, 1518, 13],
+            no_speech_prob: 0.01,
+            lid_ms: 1.0,
+            asr_ms: 5.0,
+            avg_logprob: -0.2,
+        })
+    }
+}
+
+struct FakeMt;
+
+impl Mt for FakeMt {
+    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
+        Ok(text.split_whitespace().count())
+    }
+
+    fn stream(
+        &mut self,
+        _req: &ChatRequest,
+        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
+    ) -> Result<StreamEnd, MtError> {
+        let chunks = ["Xin", " chào", " mọi", " người."];
+        for c in chunks {
+            if on_delta(c).is_break() {
+                break;
+            }
+        }
+        Ok(StreamEnd {
+            text: chunks.concat(),
+            first_token_ms: 1.0,
+            total_ms: 2.0,
+            finish_reason: Some("stop".into()),
+            completion_tokens: Some(chunks.len()),
+            chunks: chunks.len(),
+            cancelled: false,
+        })
+    }
+}
+
+impl SessionDeps for FakeDeps {
+    fn check_quota(&self) -> Result<(), CommandError> {
+        if self.quota_exhausted {
+            return Err(CommandError::new(errors::QUOTA_EXHAUSTED, None, "hạn mức còn 0"));
+        }
+        Ok(())
+    }
+
+    fn allow_retry(&self) {
+        self.calls.lock().unwrap().push("allow_retry");
+    }
+
+    fn prepare(&self, _settings: &Settings) -> Result<(), CommandError> {
+        *self.prepares.lock().unwrap() += 1;
+        self.calls.lock().unwrap().push("prepare");
+        if let Some(gate) = &self.prepare_gate {
+            gate.pass()?;
+        }
+        match self.prepare_error {
+            Some(code) => Err(CommandError::new(code, None, "lỗi giả")),
+            None => Ok(()),
+        }
+    }
+
+    fn asr(&self) -> Box<dyn Asr> {
+        Box::new(FakeAsr {
+            unavailable: self.asr_unavailable,
+        })
+    }
+
+    fn mt(&self) -> Box<dyn Mt> {
+        Box::new(FakeMt)
+    }
+
+    fn vad(&self) -> VadFactory {
+        Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.05 }) as _))
+    }
+
+    fn capture(&self, _source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource> {
+        self.captures.lock().unwrap().push(include_self);
+        if let Some(code) = self.capture_error {
+            on_event(crate::capture::CaptureEvent::Failed {
+                code,
+                message: "lỗi giả".into(),
+            });
+        }
+        self.capture_events.lock().unwrap().push(on_event);
+        Box::new(FakeCapture {
+            audio: self.audio,
+            pos: 0,
+        })
+    }
+
+    fn shutdown(&self) {
+        self.shutdowns.lock().unwrap().push("shutdown");
+        if let Some(gate) = &self.prepare_gate {
+            gate.close_for_shutdown();
+        }
+    }
+
+    fn kill_all(&self) {
+        self.shutdowns.lock().unwrap().push("kill_all");
+    }
+}
+
 pub fn mock_app() -> tauri::App<MockRuntime> {
+    mock_app_with(FakeDeps::default())
+}
+
+pub fn mock_app_with(deps: FakeDeps) -> tauri::App<MockRuntime> {
     let builder = mock_builder();
     #[cfg(target_os = "macos")]
     let builder = builder.plugin(tauri_nspanel::init());
@@ -134,6 +369,7 @@
         .manage(login)
         .manage(Writer(Box::new(file.clone())))
         .manage(file)
+        .manage(Session::new(Arc::new(deps)))
         .invoke_handler(commands::handler())
         .build(tauri::generate_context!(test = true))
         .expect("dựng được app giả")
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p meeting-translator --lib`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0432]: unresolved import `crate::session_stub`
error[E0432]: unresolved import `crate::session::StartOptions`
error[E0432]: unresolved imports `crate::session::Session`, `crate::session::SessionDeps`
error[E0432]: unresolved imports `crate::events::AUDIO_LEVEL`, `crate::events::SUBTITLE_DELTA`
error[E0433]: cannot find `Loading` in `state`
error[E0433]: cannot find `GpuProbe` in `sidecar`
```

- [ ] **Step 4: Viết code**

Phiên tạm của 01 không còn dùng:

Run: `git rm src-tauri/src/session_stub.rs`

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -8,8 +8,8 @@
 use crate::hotkeys::HotkeyAction;
 use crate::login_item::LoginItems;
 use crate::settings::{self, Settings, persist};
-use crate::state::{AppState, AppStatus, OverlayView, SessionStatus};
-use crate::{events, hotkey_registry, login_item, overlay, session_stub, system, tray, window};
+use crate::state::{AppState, AppStatus, OverlayView};
+use crate::{events, hotkey_registry, login_item, overlay, session, system, tray, window};
 
 /// Lưu cài đặt mới rồi báo mọi nơi cần biết.
 fn commit_settings<R: Runtime>(app: &AppHandle<R>, next: Settings) -> Settings {
@@ -29,7 +29,8 @@
     next
 }
 
-fn status_changed<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
+/// Báo trạng thái mới cho giao diện và menu khay. `session.rs` gọi hàm này mỗi khi trạng thái phiên đổi.
+pub(crate) fn status_changed<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
     let status = app.state::<AppState>().status();
     events::status_changed(app, &status);
     tray::refresh(app);
@@ -83,16 +84,11 @@
     }
 }
 
-/// Bắt đầu hoặc dừng phiên. Bắt đầu thì hiện thanh phụ đề (§4.2); dừng thì thanh giữ nguyên, để
-/// người dùng còn đọc được các dòng cuối.
+/// Bắt đầu hoặc dừng phiên (`session::toggle`). Bắt đầu thì hiện thanh phụ đề (§4.2); dừng thì thanh giữ nguyên, để
+/// người dùng còn đọc được các dòng cuối. Chặn tới khi phiên chạy hay lỗi (nạp model có thể mất vài chục giây): không
+/// gọi từ luồng chính.
 pub fn toggle_session<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
-    match app.state::<AppState>().status().session {
-        SessionStatus::Idle => {
-            session_stub::start(app).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?
-        }
-        SessionStatus::Running => session_stub::stop(app),
-    }
-    Ok(status_changed(app))
+    session::toggle(app)
 }
 
 pub fn set_overlay_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> Result<AppStatus, CommandError> {
@@ -112,7 +108,16 @@
 pub fn run_hotkey<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction) {
     let state = app.state::<AppState>();
     let result = match action {
-        HotkeyAction::ToggleSession => toggle_session(app).map(drop),
+        // Phím tắt và menu khay chạy trên luồng chính: bắt đầu phiên trên luồng riêng.
+        HotkeyAction::ToggleSession => {
+            let app = app.clone();
+            std::thread::spawn(move || {
+                if let Err(e) = toggle_session(&app) {
+                    log::warn!("phím tắt {action:?} lỗi: {e:?}");
+                }
+            });
+            Ok(())
+        }
         HotkeyAction::ToggleOverlay => set_overlay_visible(app, !state.status().overlay_visible).map(drop),
         HotkeyAction::ToggleLock => set_overlay_locked(app, !state.settings().overlay.locked).map(drop),
     };
@@ -187,12 +192,16 @@
     system::open_taskbar_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
 }
 
-/// Thoát hẳn, chỉ gọi từ menu khay (§4.3). Kế hoạch 02 dừng phiên và tắt hai tiến trình phụ ở đây.
+/// Thoát hẳn, chỉ gọi từ menu khay (§4.3): nhớ vị trí thanh phụ đề, dừng phiên, tắt hai tiến trình phụ, rồi thoát.
+/// Dừng phiên có thể chờ tới 2 giây (câu đang dịch), nên việc đó chạy trên luồng riêng.
 pub fn quit<R: Runtime>(app: &AppHandle<R>) {
-    session_stub::stop(app);
     overlay::remember_position(app);
     log::info!("thoát theo yêu cầu từ menu khay");
-    app.exit(0);
+    let app = app.clone();
+    std::thread::spawn(move || {
+        session::shutdown(&app);
+        app.exit(0);
+    });
 }
 
 /// macOS: vừa bỏ qua một yêu cầu thoát không đến từ menu khay (`⌘Q`, mục Quit ở menu app, Quit ở
```

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -10,7 +10,7 @@
 use tauri::{AppHandle, Runtime, State};
 
 use crate::actions;
-use crate::errors::CommandError;
+use crate::errors::{self, CommandError};
 use crate::hotkeys::HotkeyAction;
 use crate::settings::Settings;
 use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
@@ -39,11 +39,13 @@
     state.status()
 }
 
-/// Kế hoạch 02: bắt đầu phiên thật (mở thu âm, chạy tiến trình phụ) không được chạy trên luồng chính;
-/// lệnh đồng bộ của Tauri chạy trên luồng chính, nên khi đó chuyển lệnh này sang `async`.
+/// Bắt đầu phiên thật (chạy tiến trình phụ, mở nguồn âm thanh) có thể chặn vài chục giây, nên không chạy trên luồng
+/// chính: lệnh `async` chạy trên runtime của Tauri, việc chặn chạy trên luồng của `spawn_blocking`.
 #[tauri::command]
-pub fn toggle_session<R: Runtime>(app: AppHandle<R>) -> Result<AppStatus, CommandError> {
-    actions::toggle_session(&app)
+pub async fn toggle_session<R: Runtime>(app: AppHandle<R>) -> Result<AppStatus, CommandError> {
+    tauri::async_runtime::spawn_blocking(move || actions::toggle_session(&app))
+        .await
+        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
 }
 
 #[tauri::command]
```

Sửa `src-tauri/src/events.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/events.rs
+++ b/src-tauri/src/events.rs
@@ -17,8 +17,12 @@
 pub const NAVIGATE: &str = "app://navigate";
 pub const NOTICE: &str = "app://notice";
 pub const OVERLAY_VIEW: &str = "overlay://view";
-/// Phụ đề (spec §6.6). Kế hoạch 02 phát sự kiện này từ pipeline; kế hoạch 01 chỉ phát phụ đề mẫu.
+/// Phụ đề (spec §6.6): cả đối tượng (`pipeline::subtitle::Subtitle`).
 pub const SUBTITLE_UPSERT: &str = "subtitle://upsert";
+/// Phần chữ dịch mới trong lúc đang dịch (`pipeline::subtitle::Delta`).
+pub const SUBTITLE_DELTA: &str = "subtitle://delta";
+/// Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
+pub const AUDIO_LEVEL: &str = "audio://level";
 
 /// Yêu cầu cửa sổ chính mở một màn hình, ví dụ khi bấm dòng báo lỗi phím tắt ở menu khay.
 #[derive(Clone, Debug, Serialize)]
@@ -43,8 +47,10 @@
     emit(app, window::MAIN, SETTINGS_CHANGED, settings);
 }
 
+/// Gửi cho cả thanh phụ đề: nó cần biết đang nạp model, đang trễ, không có âm thanh (§4.4; kế hoạch 03 hiển thị).
 pub fn status_changed<R: Runtime>(app: &AppHandle<R>, status: &AppStatus) {
     emit(app, window::MAIN, STATUS_CHANGED, status);
+    emit(app, overlay::LABEL, STATUS_CHANGED, status);
 }
 
 pub fn overlay_view<R: Runtime>(app: &AppHandle<R>, view: &OverlayView) {
```

Sửa `src-tauri/src/overlay/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/overlay/mod.rs
+++ b/src-tauri/src/overlay/mod.rs
@@ -52,7 +52,7 @@
 }
 
 /// Tạo thanh phụ đề ở trạng thái ẩn, đặt vào vị trí đã nhớ, áp chế độ khóa đã lưu. Thanh chỉ hiện khi
-/// bắt đầu phiên (`session_stub::start`, sau này `session.rs` của 02) hoặc khi người dùng bấm hiện (§4.2).
+/// bắt đầu phiên (`session::start`) hoặc khi người dùng bấm hiện (§4.2).
 pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
     let settings = app.state::<AppState>().settings();
     platform::create(app, i18n::strings(settings.ui_language).overlay_title)?;
```

Thêm vào `src-tauri/src/session.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use pipeline::config::PipelineConfig;
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, VadFactory};
use pipeline::prompt::Lang as MtLang;
use pipeline::subtitle::{Delta, Subtitle};
use pipeline::supervisor::{Asr, GiveUpCause, SidecarEvent, SidecarEvents, SidecarManager, SystemClock, Which};
use pipeline::translate::Mt;
use pipeline::vad::SileroVad;
use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use crate::capture::{CaptureEvent, LiveCapture, OnEvent};
use crate::errors::{self, CommandError};
use crate::settings::{AudioSource, Lang, ModelTier, Settings};
use crate::sidecar::{self, first_run, integrity};
use crate::state::{AppState, AppStatus, Loading, SessionStatus};
use crate::{actions, events, overlay, window};

/// Chu kỳ gọi `SessionDeps::tick` (tắt tiến trình phụ khi rảnh 10 phút). Để ngoài `PipelineConfig`: chỉ là nhịp kiểm, mốc
/// 10 phút nằm ở `supervisor.idle_shutdown_ms`.
const TICK_EVERY: Duration = Duration::from_secs(30);
/// Id phụ đề của phiên thứ n bắt đầu từ `n × ID_STRIDE` (không trùng giữa các phiên của một lần chạy app).
const ID_STRIDE: u64 = 1_000_000;
/// Thoát app: chờ lần bắt đầu hay dừng phiên đang dở tối đa chừng này (tiến trình phụ đã bị kill nên nó trả về nhanh).
const SHUTDOWN_WAIT: Duration = Duration::from_secs(2);

/// Những gì một phiên cần từ bên ngoài.
pub trait SessionDeps: Send + Sync {
    /// Chạy hai tiến trình phụ nếu chưa chạy, theo gói model trong cài đặt; chặn tới khi cả hai sẵn sàng.
    fn prepare(&self, settings: &Settings) -> Result<(), CommandError>;
    fn asr(&self) -> Box<dyn Asr>;
    fn mt(&self) -> Box<dyn Mt>;
    fn vad(&self) -> VadFactory;
    /// Mở nguồn âm thanh. Việc của nguồn tới sau (nguồn chạy trên luồng riêng) đi qua `on_event`. `include_self`: xem
    /// [`StartOptions`].
    fn capture(&self, source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource>;
    /// Người dùng bấm Bắt đầu: tiến trình phụ đã bỏ cuộc được thử lại từ đầu (người dùng có thể đã sửa nguyên nhân). Gọi
    /// trước `prepare` của lần bắt đầu; lần chạy sẵn khi mở cửa sổ chính (`prewarm`) thì không (R3-1 của review 02 lần 3).
    fn allow_retry(&self) {}
    fn begin_session(&self) {}
    fn end_session(&self) {}
    /// Trước khi bắt đầu một phiên: hạn mức còn 0 thì từ chối (§6.8, "Khi chạm hạn mức"). Kế hoạch 06 cài bằng bộ đếm phút
    /// của license; mặc định cho bắt đầu.
    fn check_quota(&self) -> Result<(), CommandError> {
        Ok(())
    }
    /// Gọi định kỳ: tắt tiến trình phụ sau 10 phút không dịch.
    fn tick(&self) {}
    /// Thoát app, bước 1: từ giờ không chạy thêm tiến trình phụ nào, kill các tiến trình đang chạy. Không chờ gì.
    fn shutdown(&self) {}
    /// Thoát app, bước cuối: kill mọi tiến trình phụ còn sót.
    fn kill_all(&self) {}
    /// Mã lỗi khi `asr-worker` không dùng được nữa giữa phiên.
    fn asr_failure_code(&self) -> &'static str {
        errors::SIDECAR_FAILED
    }
}

/// Trạng thái phiên, quản lý bằng `tauri::Manager::manage`.
pub struct Session {
    deps: Arc<dyn SessionDeps>,
    engine: Mutex<Option<Engine>>,
    /// Gắn engine của phiên, dừng và dừng vì lỗi lần lượt từng việc một. Không giữ trong lúc chuẩn bị tiến trình phụ (có
    /// thể 60–180 giây), để Hủy rồi bấm Bắt đầu lại có phản hồi ngay (Q-E của review 02 lần 2).
    gate: Mutex<()>,
    /// Số của lần bắt đầu hiện tại. Hủy (hay thoát app) tăng số này: lần bắt đầu đang chuẩn bị thấy số đã đổi thì thôi,
    /// không chạm tới lần bắt đầu mới.
    attempt: AtomicU64,
    /// App đang thoát: không bắt đầu phiên mới.
    closing: AtomicBool,
    sessions: AtomicU64,
}

impl Session {
    pub fn new(deps: Arc<dyn SessionDeps>) -> Self {
        Self {
            deps,
            engine: Mutex::new(None),
            gate: Mutex::new(()),
            attempt: AtomicU64::new(0),
            closing: AtomicBool::new(false),
            sessions: AtomicU64::new(0),
        }
    }

    /// Có engine đang chạy không (cho test).
    pub fn has_engine(&self) -> bool {
        self.engine.lock().unwrap().is_some()
    }
}

fn code_of(settings: Lang) -> &'static str {
    match settings {
        Lang::En => "en",
        Lang::Zh => "zh",
        Lang::Ja => "ja",
        Lang::Ko => "ko",
        Lang::Vi => "vi",
    }
}

/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh.
pub fn engine_config(settings: &Settings, id_base: u64) -> EngineConfig {
    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = u64::from(settings.vad_end_silence_ms);
    let languages = match settings.source_lock {
        Some(lang) => vec![code_of(lang).to_string()],
        None => settings
            .source_languages
            .iter()
            .map(|l| code_of(*l).to_string())
            .collect(),
    };
    EngineConfig {
        pipeline,
        languages,
        target: MtLang::from_code(code_of(settings.target_language)).expect("năm ngôn ngữ của F2"),
        translation_context: settings.experimental.translation_context,
        id_base,
    }
}

/// Mã lỗi của một lý do dừng của engine.
pub fn fatal_code(kind: Fatal, asr_code: &'static str) -> &'static str {
    match kind {
        Fatal::Vad => errors::VAD_FAILED,
        Fatal::Audio => errors::CAPTURE_FAILED,
        Fatal::Asr => asr_code,
        Fatal::Internal => errors::UNKNOWN,
        Fatal::QuotaExhausted => errors::QUOTA_EXHAUSTED,
    }
}

fn changed<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
    actions::status_changed(app)
}

/// Hiện thanh phụ đề (§4.2) trên luồng chính: NSPanel chỉ đổi được từ luồng chính.
fn show_overlay<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    if let Err(e) = app.run_on_main_thread(move || {
        if let Err(e) = overlay::set_visible(&handle, true) {
            log::warn!("không hiện được thanh phụ đề: {e}");
        }
    }) {
        log::warn!("không hiện được thanh phụ đề: {e}");
    }
}

/// Báo lỗi của lần bắt đầu số `attempt`, trừ khi người dùng đã hủy lần đó (trạng thái đã về `idle`, hay đã sang lần sau).
fn start_failed<R: Runtime>(app: &AppHandle<R>, attempt: u64, code: &str) -> AppStatus {
    let session = app.state::<Session>();
    app.state::<AppState>().update_status(|s| {
        if s.session == SessionStatus::Starting && session.attempt.load(Ordering::SeqCst) == attempt {
            s.session = SessionStatus::Error;
            s.session_error = Some(code.to_string());
        }
        s.loading = None;
    });
    changed(app)
}

/// Tùy chọn của một phiên.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StartOptions {
    /// Thu cả âm thanh của chính app: cho bước "Nghe thử" (§4.1 bước 6), khi app tự phát một câu mẫu. Kế hoạch 03 dùng
    /// (Đ16 của kế hoạch 00). Chỉ có tác dụng trên macOS với nguồn toàn hệ thống.
    pub include_self: bool,
}

/// Bắt đầu phiên với nguồn âm thanh trong cài đặt. Chặn tới khi phiên chạy (hoặc lỗi, hoặc bị hủy): gọi từ luồng nền.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    start_with(app, StartOptions::default())
}

/// Như [`start`], với tùy chọn.
pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Result<AppStatus, CommandError> {
    let session = app.state::<Session>();
    let state = app.state::<AppState>();
    if session.closing.load(Ordering::SeqCst) {
        return Ok(state.status());
    }
    if let Err(e) = session.deps.check_quota() {
        let refused = state.update_status(|s| {
            if matches!(s.session, SessionStatus::Starting | SessionStatus::Running) {
                return false;
            }
            s.session = SessionStatus::Error;
            s.session_error = Some(e.code.clone());
            true
        });
        if refused {
            changed(app);
            return Err(e);
        }
        return Ok(state.status());
    }
    let mut attempt = 0;
    let begun = state.update_status(|s| {
        if matches!(s.session, SessionStatus::Starting | SessionStatus::Running) {
            return false;
        }
        attempt = session.attempt.fetch_add(1, Ordering::SeqCst) + 1;
        s.session = SessionStatus::Starting;
        s.session_error = None;
        s.indicators = Indicators::default();
        s.permission_suspected = false;
        s.waiting_for_app = false;
        s.overlay_visible = true;
        true
    });
    if !begun {
        return Ok(state.status());
    }
    let current = || session.attempt.load(Ordering::SeqCst) == attempt;
    show_overlay(app);
    changed(app);
    let settings = state.settings();
    session.deps.allow_retry();
    if let Err(e) = session.deps.prepare(&settings) {
        if !current() {
            // Lần đã hủy: sự kiện của tiến trình phụ có thể đã đặt lại chỉ báo "Đang nạp model"; không có gì đang nạp
            // nữa thì bỏ nó (Nhỏ-7 của review 02 lần 3).
            state.update_status(|s| {
                if s.session != SessionStatus::Starting {
                    s.loading = None;
                }
            });
            return Ok(changed(app));
        }
        log::error!("không bắt đầu được phiên: {} ({})", e.code, e.message);
        start_failed(app, attempt, &e.code);
        return Err(e);
    }
    if !current() {
        return Ok(state.status());
    }
    // Từ đây tới lúc gắn engine thì giữ khóa (nhanh: chỉ mở nguồn và tạo luồng): lỗi của nguồn âm thanh tới ngay lúc mở
    // (`fail`, trên luồng riêng) chờ tới khi engine đã gắn rồi mới dừng nó.
    let _gate = session.gate.lock().unwrap();
    if !current() {
        return Ok(state.status());
    }
    let n = session.sessions.fetch_add(1, Ordering::SeqCst) + 1;
    let source = session
        .deps
        .capture(&settings.audio_source, options.include_self, capture_events(app, n));
    let sink = Arc::new(TauriSink {
        app: app.clone(),
        session: n,
        asr_code: session.deps.clone(),
    });
    let engine = match Engine::start(
        engine_config(&settings, n * ID_STRIDE),
        source,
        session.deps.vad(),
        session.deps.asr(),
        session.deps.mt(),
        sink,
    ) {
        Ok(engine) => engine,
        Err(e) => {
            // Không tạo được luồng của phiên: lỗi bên trong app, không phải lỗi nguồn âm thanh (N-1 của review 02 lần 2).
            let e = CommandError::new(errors::UNKNOWN, None, format!("{e:#}"));
            log::error!("không chạy được pipeline: {}", e.message);
            start_failed(app, attempt, &e.code);
            return Err(e);
        }
    };
    // Kiểm hủy lần cuối, cùng khóa với trạng thái: Hủy tới sau bước này thì gặp trạng thái `running` và là Dừng.
    let running = state.update_status(|s| {
        if !current() || s.session != SessionStatus::Starting {
            return false;
        }
        s.session = SessionStatus::Running;
        s.loading = None;
        true
    });
    if !running {
        engine.stop();
        log::info!("hủy phiên dịch {n} lúc đang bắt đầu");
        return Ok(state.status());
    }
    *session.engine.lock().unwrap() = Some(engine);
    session.deps.begin_session();
    log::info!("bắt đầu phiên dịch {n}");
    Ok(changed(app))
}

/// Việc của nguồn âm thanh phiên `n` sang trạng thái của app.
fn capture_events<R: Runtime>(app: &AppHandle<R>, n: u64) -> OnEvent {
    let app = app.clone();
    Box::new(move |event| match event {
        CaptureEvent::Failed { code, message } => {
            let app = app.clone();
            std::thread::spawn(move || fail(&app, n, code, &message));
        }
        CaptureEvent::PermissionSuspected(suspected) => {
            let current = app.state::<Session>().sessions.load(Ordering::SeqCst) == n;
            if current {
                app.state::<AppState>()
                    .update_status(|s| s.permission_suspected = suspected);
                changed(&app);
            }
        }
        CaptureEvent::WaitingForApp(waiting) => {
            let current = app.state::<Session>().sessions.load(Ordering::SeqCst) == n;
            if current {
                app.state::<AppState>().update_status(|s| s.waiting_for_app = waiting);
                changed(&app);
            }
        }
    })
}

/// Dừng engine (nếu có) và báo cho tiến trình phụ. Không đổi trạng thái. Trả `false` nếu không có engine nào chạy.
fn stop_engine(session: &Session) -> bool {
    let engine = session.engine.lock().unwrap().take();
    let Some(engine) = engine else {
        return false;
    };
    let metrics = engine.stop();
    // Số đo của phiên vào log, không có chữ chép lời (§7, Đ17).
    log::info!("kết thúc phiên dịch: {}", metrics.summary());
    session.deps.end_session();
    true
}

/// Dừng phiên (bấm Dừng). Thanh phụ đề giữ nguyên để người dùng còn đọc được các dòng cuối.
pub fn stop<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
    let session = app.state::<Session>();
    let _gate = session.gate.lock().unwrap();
    stop_engine(&session);
    app.state::<AppState>().update_status(|s| {
        s.session = SessionStatus::Idle;
        s.loading = None;
        s.indicators = Indicators::default();
        s.permission_suspected = false;
        s.waiting_for_app = false;
    });
    changed(app)
}

/// Dừng phiên `n` vì lỗi (§9). Gọi từ luồng riêng, không từ luồng của engine. Phiên đó đã dừng (người dùng bấm Dừng,
/// hay đã sang phiên khác) thì bỏ qua.
fn fail<R: Runtime>(app: &AppHandle<R>, n: u64, code: &str, message: &str) {
    let session = app.state::<Session>();
    let _gate = session.gate.lock().unwrap();
    if session.sessions.load(Ordering::SeqCst) != n || !stop_engine(&session) {
        return;
    }
    log::error!("phiên dịch dừng vì lỗi {code}: {message}");
    app.state::<AppState>().update_status(|s| {
        s.session = SessionStatus::Error;
        s.session_error = Some(code.to_string());
        s.loading = None;
    });
    changed(app);
}

/// Nút, phím tắt, khay: bắt đầu khi chưa dịch; dừng khi đang dịch; đang chuẩn bị thì Hủy (về `idle` ngay).
pub fn toggle<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    let session = app.state::<Session>();
    let state = app.state::<AppState>();
    let cancelled = state.update_status(|s| {
        if s.session != SessionStatus::Starting {
            return false;
        }
        session.attempt.fetch_add(1, Ordering::SeqCst);
        s.session = SessionStatus::Idle;
        s.loading = None;
        true
    });
    if cancelled {
        log::info!("hủy lần bắt đầu phiên");
        return Ok(changed(app));
    }
    match state.status().session {
        SessionStatus::Idle | SessionStatus::Error => start(app),
        SessionStatus::Running => Ok(stop(app)),
        SessionStatus::Starting => Ok(state.status()),
    }
}

/// Mở cửa sổ chính: chạy sẵn hai tiến trình phụ trên luồng nền (§5, Đ19).
pub fn prewarm<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let Some(session) = app.try_state::<Session>() else {
            return;
        };
        let settings = app.state::<AppState>().settings();
        if let Err(e) = session.deps.prepare(&settings) {
            log::warn!("chưa chạy được tiến trình phụ: {} ({})", e.code, e.message);
            app.state::<AppState>().update_status(|s| s.loading = None);
            changed(&app);
        }
    });
}

/// Thoát app (Thoát ở menu khay, §4.3). Không chờ khóa của tiến trình phụ (N1 của review 02c):
/// 1. đặt cờ hủy, chặn mọi lần chạy tiến trình phụ mới và kill các tiến trình đang chạy (`SessionDeps::shutdown`), nên
///    lần bắt đầu phiên hay lần chạy sẵn đang chờ nạp model trả về ngay;
/// 2. chờ tối đa 2 giây để lấy khóa phiên, dừng engine nếu có;
/// 3. kill mọi tiến trình phụ còn sót.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    let session = app.state::<Session>();
    session.closing.store(true, Ordering::SeqCst);
    session.attempt.fetch_add(1, Ordering::SeqCst);
    session.deps.shutdown();
    let deadline = Instant::now() + SHUTDOWN_WAIT;
    loop {
        match session.gate.try_lock() {
            Ok(_gate) => {
                stop_engine(&session);
                break;
            }
            Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                log::warn!("thoát lúc phiên còn đang bắt đầu hay dừng: không chờ nữa");
                break;
            }
        }
    }
    session.deps.kill_all();
}

/// Luồng nền gọi `tick` định kỳ.
pub fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(TICK_EVERY);
            app.state::<Session>().deps.tick();
        }
    });
}

/// Kết quả của engine sang giao diện. Kế hoạch 06 thêm `usage` (đếm phút cho hạn mức, §6.8) ở đây.
struct TauriSink<R: Runtime> {
    app: AppHandle<R>,
    session: u64,
    asr_code: Arc<dyn SessionDeps>,
}

impl<R: Runtime> EventSink for TauriSink<R> {
    fn subtitle(&self, subtitle: &Subtitle) {
        let _ = self.app.emit(events::SUBTITLE_UPSERT, subtitle);
    }

    fn delta(&self, delta: &Delta) {
        let _ = self.app.emit(events::SUBTITLE_DELTA, delta);
    }

    fn level(&self, rms: f32) {
        // Chỉ cửa sổ chính vẽ mức âm lượng.
        let _ = self
            .app
            .emit_to(EventTarget::webview_window(window::MAIN), events::AUDIO_LEVEL, rms);
    }

    fn indicators(&self, indicators: &Indicators) {
        self.app
            .state::<AppState>()
            .update_status(|s| s.indicators = indicators.clone());
        changed(&self.app);
    }

    fn fatal(&self, kind: Fatal, reason: &str) {
        let code = fatal_code(kind, self.asr_code.asr_failure_code());
        let (app, n, reason) = (self.app.clone(), self.session, reason.to_string());
        std::thread::spawn(move || fail(&app, n, code, &reason));
    }
}

/// Sự kiện của tiến trình phụ sang trạng thái của app, cộng bước kiểm SHA-256 trước mỗi lần chạy (QĐ17) và "lần đầu chạy".
struct StatusEvents<R: Runtime> {
    app: AppHandle<R>,
    dir: PathBuf,
    hashes: Vec<(PathBuf, String)>,
    seen_file: PathBuf,
    /// Binary vừa chạy của mỗi bên (để ghi "đã chạy" khi nó tới `Ready`).
    last_exe: Mutex<[Option<PathBuf>; 2]>,
    /// Windows: handle chỉ cho đọc của lần kiểm gần nhất (`integrity::Verified::locks`), giữ suốt đời app.
    locks: Mutex<Vec<std::fs::File>>,
    /// Lý do bỏ cuộc gần nhất của `asr-worker`.
    asr_gave_up: Arc<Mutex<Option<GiveUpCause>>>,
    /// Mỗi tiến trình phụ (`slot`) đang chạy bằng CPU không: theo `Ready.use_gpu` của lần chạy gần nhất, và bật ngay khi có
    /// `CpuFallback`. Chỉ báo "Đang chạy bằng CPU" hiện khi có ít nhất một cờ bật (Q5-1 của review 02 lần 5).
    on_cpu: Mutex<[bool; 2]>,
}

impl<R: Runtime> StatusEvents<R> {
    /// Đặt cờ CPU của `which` rồi tính lại chỉ báo chung.
    fn set_cpu(&self, which: Which, cpu: bool) {
        let mut flags = self.on_cpu.lock().unwrap();
        flags[slot(which)] = cpu;
        let any = flags.iter().any(|&f| f);
        self.app.state::<AppState>().update_status(|s| s.cpu_fallback = any);
    }
}

fn slot(which: Which) -> usize {
    match which {
        Which::Asr => 0,
        Which::Llama => 1,
    }
}

impl<R: Runtime> StatusEvents<R> {
    fn hash_of(&self, exe: &Path) -> Option<&str> {
        self.hashes.iter().find(|(p, _)| p == exe).map(|(_, h)| h.as_str())
    }
}

impl<R: Runtime> SidecarEvents for StatusEvents<R> {
    fn on_event(&self, event: &SidecarEvent) {
        let state = self.app.state::<AppState>();
        match event {
            SidecarEvent::Starting { first_run, .. } => {
                state.update_status(|s| s.loading = Some(if *first_run { Loading::FirstRun } else { Loading::Model }))
            }
            SidecarEvent::Ready { which, first_run, .. } => {
                let exe = self.last_exe.lock().unwrap()[slot(*which)].clone();
                if *first_run
                    && let Some(hash) = exe.as_deref().and_then(|e| self.hash_of(e))
                    && let Err(e) = first_run::mark_seen(&self.seen_file, hash)
                {
                    log::warn!("không ghi được {}: {e}", self.seen_file.display());
                }
                if *which == Which::Llama {
                    state.update_status(|s| s.loading = None);
                }
                // Chỉ báo CPU theo từng tiến trình phụ: tiến trình này chạy lại bằng GPU (bấm thử lại sau khi bỏ cuộc, Q4-2 của
                // review 02 lần 4) chỉ tắt cờ của chính nó (Q5-1 của review 02 lần 5).
                if let SidecarEvent::Ready { use_gpu, .. } = event {
                    self.set_cpu(*which, !*use_gpu);
                }
            }
            SidecarEvent::CpuFallback { which } => self.set_cpu(*which, true),
            SidecarEvent::OutOfMemory { .. } => state.update_status(|s| s.suggest_lite = true),
            SidecarEvent::GaveUp { which, cause, .. } => {
                if *which == Which::Asr {
                    *self.asr_gave_up.lock().unwrap() = Some(*cause);
                }
                return;
            }
            SidecarEvent::Restarting { .. } | SidecarEvent::Stopped { .. } => return,
        }
        changed(&self.app);
    }

    fn before_spawn(&self, which: Which, exe: &Path) -> Result<(), String> {
        self.last_exe.lock().unwrap()[slot(which)] = Some(exe.to_path_buf());
        let verified = integrity::verify(&self.dir, &[exe], integrity::SIDECAR_HASHES).map_err(|e| e.to_string())?;
        if !verified.locks.is_empty() {
            *self.locks.lock().unwrap() = verified.locks;
        }
        Ok(())
    }

    fn is_first_run(&self, _which: Which, exe: &Path) -> bool {
        self.hash_of(exe)
            .is_some_and(|h| first_run::is_first_run(&self.seen_file, h))
    }
}

struct Live {
    manager: Arc<SidecarManager>,
    tier: Option<ModelTier>,
    vad_model: PathBuf,
}

/// Phần bên ngoài thật: tiến trình phụ (`pipeline::supervisor`), nguồn âm thanh (`capture`), Silero VAD.
pub struct LiveDeps<R: Runtime> {
    app: AppHandle<R>,
    live: Mutex<Option<Live>>,
    asr_gave_up: Arc<Mutex<Option<GiveUpCause>>>,
}

impl<R: Runtime> LiveDeps<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self {
            app,
            live: Mutex::new(None),
            asr_gave_up: Arc::default(),
        }
    }

    /// Giám sát hiện tại. Khóa `live` chỉ giữ trong lúc clone, không bao giờ trong lúc chờ tiến trình phụ.
    fn current(&self) -> Option<Arc<SidecarManager>> {
        self.live.lock().unwrap().as_ref().map(|l| l.manager.clone())
    }

    fn manager(&self) -> Arc<SidecarManager> {
        self.current().expect("prepare() chạy trước")
    }
}

impl<R: Runtime> SessionDeps for LiveDeps<R> {
    fn prepare(&self, settings: &Settings) -> Result<(), CommandError> {
        let running = {
            let live = self.live.lock().unwrap();
            live.as_ref()
                .filter(|l| l.tier == settings.model_tier)
                .map(|l| l.manager.clone())
        };
        if let Some(manager) = running.filter(|m| m.running()) {
            manager.touch();
            return Ok(());
        }
        // Kiểm SHA-256 lúc chuẩn bị; giám sát còn kiểm lại trước mỗi lần chạy tiến trình phụ (`before_spawn`).
        let prepared = sidecar::prepare(&self.app, settings)?;
        let manager = {
            let mut live = self.live.lock().unwrap();
            // Đổi gói model thì dựng lại; tiến trình cũ tắt khi phiên cuối còn dùng nó kết thúc (`SidecarManager` bị hủy).
            if live.as_ref().is_none_or(|l| l.tier != prepared.tier) {
                *self.asr_gave_up.lock().unwrap() = None;
                let events = Arc::new(StatusEvents {
                    app: self.app.clone(),
                    dir: prepared.dir.clone(),
                    hashes: prepared.hashes.clone(),
                    seen_file: prepared.seen_file.clone(),
                    last_exe: Mutex::new([None, None]),
                    locks: Mutex::new(prepared.locks),
                    asr_gave_up: self.asr_gave_up.clone(),
                    on_cpu: Mutex::new([false, false]),
                });
                let manager = SidecarManager::new(prepared.spec, Arc::new(SystemClock::default()), events);
                *live = Some(Live {
                    manager,
                    tier: prepared.tier,
                    vad_model: prepared.vad_model,
                });
            }
            live.as_ref().expect("vừa dựng").manager.clone()
        };
        manager
            .ensure_started()
            .map_err(|e| CommandError::new(sidecar::give_up_code(e.cause), None, e.to_string()))
    }

    fn asr(&self) -> Box<dyn Asr> {
        Box::new(self.manager().asr())
    }

    fn mt(&self) -> Box<dyn Mt> {
        Box::new(self.manager().mt())
    }

    fn vad(&self) -> VadFactory {
        let path = self
            .live
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.vad_model.clone())
            .unwrap_or_default();
        Box::new(move || Ok(Box::new(SileroVad::load(&path)?) as _))
    }

    fn capture(&self, source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource> {
        Box::new(LiveCapture::open(source.clone(), include_self, on_event))
    }

    fn allow_retry(&self) {
        // Lý do bỏ cuộc của lần trước không còn đúng: giám sát cũng quên nó (N-6 của review 02 lần 2, R3-1 của lần 3).
        *self.asr_gave_up.lock().unwrap() = None;
        if let Some(manager) = self.current() {
            manager.allow_retry();
        }
    }

    fn begin_session(&self) {
        self.manager().begin_session();
    }

    fn end_session(&self) {
        self.manager().end_session();
    }

    fn tick(&self) {
        if let Some(manager) = self.current()
            && manager.tick()
        {
            log::info!("tắt tiến trình phụ sau 10 phút không dịch");
        }
    }

    fn shutdown(&self) {
        pipeline::process::begin_shutdown();
        if let Some(manager) = self.current() {
            manager.shutdown();
        }
    }

    fn kill_all(&self) {
        pipeline::process::kill_all();
    }

    fn asr_failure_code(&self) -> &'static str {
        self.asr_gave_up
            .lock()
            .unwrap()
            .map_or(errors::SIDECAR_FAILED, sidecar::give_up_code)
    }
}
```

Thay toàn bộ `src-tauri/src/sidecar/mod.rs` bằng:

```rust
//! Phần của app quanh hai tiến trình phụ (Đ2 của kế hoạch 00): tìm file, kiểm SHA-256, nhớ binary đã chạy, dò GPU trên
//! Windows, rồi dựng `SidecarSpec`. Việc chạy và giám sát nằm ở `pipeline::supervisor`.

pub mod first_run;
pub mod integrity;
pub mod paths;
pub mod probe;

use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use pipeline::config::PipelineConfig;
use pipeline::supervisor::{AsrSpec, GiveUpCause, LlamaSpec, SidecarSpec};
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::settings::{ModelTier, Settings};

/// Kết quả chuẩn bị: cách chạy hai tiến trình phụ, cộng những gì app cần nhớ.
#[derive(Debug)]
pub struct Prepared {
    pub spec: SidecarSpec,
    pub tier: Option<ModelTier>,
    /// Thư mục tiến trình phụ, và băm của từng file thực thi (theo đường dẫn), cho kiểm lại trước mỗi lần chạy và cho
    /// "lần đầu chạy".
    pub dir: PathBuf,
    pub hashes: Vec<(PathBuf, String)>,
    pub vad_model: PathBuf,
    pub seen_file: PathBuf,
    /// Windows: handle chỉ cho đọc của các file đã kiểm (`integrity::Verified::locks`).
    pub locks: Vec<std::fs::File>,
}

impl Prepared {
    pub fn hash_of(&self, exe: &Path) -> Option<&str> {
        self.hashes.iter().find(|(p, _)| p == exe).map(|(_, h)| h.as_str())
    }
}

/// Mã lỗi giao diện cho một lỗi kiểm SHA-256.
pub fn integrity_error_code(e: &integrity::IntegrityError) -> &'static str {
    match e {
        integrity::IntegrityError::Missing(_) => errors::SIDECAR_MISSING,
        _ => errors::SIDECAR_TAMPERED,
    }
}

/// Mã lỗi giao diện khi giám sát bỏ cuộc với một tiến trình phụ.
pub fn give_up_code(cause: GiveUpCause) -> &'static str {
    match cause {
        GiveUpCause::Tampered => errors::SIDECAR_TAMPERED,
        GiveUpCause::ModelLoad => errors::MODEL_BROKEN,
        GiveUpCause::Failures | GiveUpCause::NoSharedMode | GiveUpCause::Closing => errors::SIDECAR_FAILED,
    }
}

/// Kết quả dò GPU trên Windows (`asr-worker-vulkan --probe`), dùng chung giữa luồng dò lúc mở app và lần chuẩn bị đầu
/// tiên. `None` bên trong: chưa dò, hoặc lần dò trước quá giờ (dò lại).
#[derive(Default)]
pub struct GpuProbe {
    result: Mutex<Option<bool>>,
    running: Mutex<bool>,
    done: Condvar,
}

impl GpuProbe {
    /// Kết quả đã có; đang dò thì chờ tối đa `wait`. Trả `None` nếu chưa có kết quả.
    pub fn get(&self, wait: Duration) -> Option<bool> {
        let running = self.running.lock().unwrap_or_else(|e| e.into_inner());
        let _running = self
            .done
            .wait_timeout_while(running, wait, |r| *r)
            .unwrap_or_else(|e| e.into_inner());
        *self.result.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Dò bằng `probe` nếu chưa có kết quả và chưa ai đang dò. Quá giờ (`None`) thì không nhớ.
    pub fn run(&self, probe: impl FnOnce() -> Option<bool>) -> Option<bool> {
        {
            let mut running = self.running.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(known) = *self.result.lock().unwrap_or_else(|e| e.into_inner()) {
                return Some(known);
            }
            if *running {
                drop(running);
                return self.get(Duration::from_secs(60));
            }
            *running = true;
        }
        let outcome = probe();
        if outcome.is_some() {
            *self.result.lock().unwrap_or_else(|e| e.into_inner()) = outcome;
        }
        *self.running.lock().unwrap_or_else(|e| e.into_inner()) = false;
        self.done.notify_all();
        outcome
    }
}

/// Đường dẫn file của bản đang chạy.
fn files() -> Result<(PathBuf, paths::SidecarFiles), CommandError> {
    let dir = paths::binaries_dir().map_err(|e| CommandError::new(errors::SIDECAR_MISSING, None, e.to_string()))?;
    let files = paths::sidecar_files(&dir, paths::TARGET, tauri::is_dev(), cfg!(windows));
    Ok((dir, files))
}

/// Windows: dò GPU ngay khi mở app, trên luồng nền và sau khi đã kiểm SHA-256 của `asr-worker-vulkan` (Q7 của review
/// 02c), để lúc bấm Bắt đầu đã có kết quả. macOS không cần (Metal luôn có).
pub fn start_gpu_probe<R: Runtime>(app: &AppHandle<R>) {
    if !cfg!(windows) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let Ok((dir, files)) = files() else { return };
        let Ok(verified) = integrity::verify(&dir, &[&files.asr_gpu], integrity::SIDECAR_HASHES) else {
            return;
        };
        let seen = seen_file(&app);
        let first = seen
            .as_deref()
            .is_none_or(|s| first_run::is_first_run(s, &verified.hashes[0]));
        app.state::<GpuProbe>()
            .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)));
    });
}

fn seen_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|d| d.join("sidecars-seen.json"))
}

/// Dựng cách chạy cho gói model trong cài đặt. Kiểm SHA-256 trước, rồi mới chạy `--probe` (Windows): không chạy binary
/// nào chưa kiểm.
pub fn prepare<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<Prepared, CommandError> {
    let path_error = |e: tauri::Error| CommandError::new(errors::SIDECAR_MISSING, None, e.to_string());
    let (dir, files) = files()?;
    let required: Vec<&Path> = if cfg!(windows) {
        vec![&files.asr_gpu, &files.asr_cpu, &files.llama]
    } else {
        vec![&files.asr_cpu, &files.llama]
    };
    let verified = integrity::verify(&dir, &required, integrity::SIDECAR_HASHES)
        .map_err(|e| CommandError::new(integrity_error_code(&e), None, e.to_string()))?;
    let hashes: Vec<(PathBuf, String)> = required
        .iter()
        .map(|p| p.to_path_buf())
        .zip(verified.hashes.iter().cloned())
        .collect();
    let data = app.path().app_local_data_dir().map_err(path_error)?;
    let seen_file = data.join("sidecars-seen.json");
    let gpu_usable = if cfg!(windows) {
        let first = first_run::is_first_run(&seen_file, &verified.hashes[0]);
        app.state::<GpuProbe>()
            .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)))
            .unwrap_or(false)
    } else {
        true
    };
    let models_dir = if tauri::is_dev() {
        paths::dev_models_dir()
    } else {
        data.join("models")
    };
    let models = paths::model_files(&models_dir, settings.model_tier);
    if let Some(missing) = paths::first_missing(&models) {
        return Err(CommandError::new(
            errors::MODEL_MISSING,
            None,
            format!("thiếu {}", missing.display()),
        ));
    }
    let logs = app.path().app_log_dir().map_err(path_error)?;
    let config = PipelineConfig::default();
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: gpu_usable.then(|| files.asr_gpu.clone()),
            exe_cpu: files.asr_cpu.clone(),
            model: models.asr.clone(),
            log: logs.join("asr-worker.log"),
            // Lần đầu chạy được hỏi cho từng binary qua `SidecarEvents::is_first_run` (session.rs).
            first_run: false,
            require_shared: true,
            env: Vec::new(),
        },
        llama: LlamaSpec {
            exe: files.llama.clone(),
            model: models.mt.clone(),
            log: logs.join("llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: config.supervisor,
        asr_config: config.asr,
        mt_config: config.mt,
    };
    Ok(Prepared {
        spec,
        tier: settings.model_tier,
        dir,
        hashes,
        vad_model: models.vad,
        seen_file,
        locks: verified.locks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn errors_map_to_ui_codes() {
        use integrity::IntegrityError;
        assert_eq!(
            integrity_error_code(&IntegrityError::Missing("x".into())),
            errors::SIDECAR_MISSING
        );
        for e in [
            IntegrityError::Unverified("x".into()),
            IntegrityError::Tampered("x".into()),
            IntegrityError::Writable("x".into()),
        ] {
            assert_eq!(integrity_error_code(&e), errors::SIDECAR_TAMPERED, "{e:?}");
        }
        assert_eq!(give_up_code(GiveUpCause::Tampered), errors::SIDECAR_TAMPERED);
        assert_eq!(give_up_code(GiveUpCause::ModelLoad), errors::MODEL_BROKEN);
        assert_eq!(give_up_code(GiveUpCause::Failures), errors::SIDECAR_FAILED);
    }

    /// Q7 của review 02c: dò quá giờ thì không nhớ (lần sau dò lại); có kết quả thì nhớ, và lần dò đang chạy được dùng chung.
    #[test]
    fn a_timed_out_probe_is_not_remembered() {
        let probe = GpuProbe::default();
        let calls = AtomicUsize::new(0);
        assert_eq!(
            probe.run(|| {
                calls.fetch_add(1, Ordering::SeqCst);
                None
            }),
            None
        );
        assert_eq!(probe.get(Duration::ZERO), None);
        assert_eq!(
            probe.run(|| {
                calls.fetch_add(1, Ordering::SeqCst);
                Some(true)
            }),
            Some(true)
        );
        assert_eq!(probe.run(|| panic!("đã có kết quả thì không dò nữa")), Some(true));
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        // Một luồng đang dò: luồng khác chờ kết quả đó.
        let probe = Arc::new(GpuProbe::default());
        let slow = {
            let probe = probe.clone();
            std::thread::spawn(move || {
                probe.run(|| {
                    std::thread::sleep(Duration::from_millis(100));
                    Some(false)
                })
            })
        };
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(probe.run(|| panic!("đang có người dò")), Some(false));
        assert_eq!(slow.join().unwrap(), Some(false));
    }
}
```

Sửa `src-tauri/src/state.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/state.rs
+++ b/src-tauri/src/state.rs
@@ -4,16 +4,32 @@
 
 use serde::Serialize;
 
+use pipeline::engine::Indicators;
+
 use crate::hotkeys::HotkeyAction;
 use crate::settings::migrate::FileMeta;
 use crate::settings::{Settings, UiLanguage};
 
-/// Trạng thái phiên dịch. Kế hoạch 02 thêm trạng thái (đang nạp model, lỗi…) khi nối pipeline.
+/// Trạng thái phiên dịch (§4.3: Sẵn sàng, Đang dịch, Lỗi).
 #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
 #[serde(rename_all = "camelCase")]
 pub enum SessionStatus {
     Idle,
+    /// Đang chạy tiến trình phụ và mở nguồn âm thanh ("Đang nạp model…").
+    Starting,
     Running,
+    /// Phiên vừa dừng vì lỗi; mã lỗi ở `AppStatus::session_error`.
+    Error,
+}
+
+/// Đang chờ tiến trình phụ (§4.2, §6.5).
+#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
+#[serde(rename_all = "camelCase")]
+pub enum Loading {
+    /// "Đang nạp model…"
+    Model,
+    /// Lần đầu chạy binary mới: "Đang chuẩn bị lần đầu".
+    FirstRun,
 }
 
 /// Trạng thái lúc chạy, không lưu xuống đĩa. Cửa sổ chính nhận qua sự kiện `app://status`.
@@ -24,6 +40,24 @@
     pub overlay_visible: bool,
     /// Phím tắt không đăng ký được với hệ điều hành, theo thứ tự của `HotkeyAction::ALL`.
     pub hotkey_failures: Vec<HotkeyAction>,
+    pub loading: Option<Loading>,
+    /// Mã lỗi của phiên (`error.<mã>` trong i18n) khi `session` là `error`.
+    pub session_error: Option<String>,
+    /// "Đang chạy bằng CPU (chậm hơn)" (§9).
+    pub cpu_fallback: bool,
+    /// Tiến trình phụ báo hết bộ nhớ: đề xuất gói Nhẹ (§9).
+    pub suggest_lite: bool,
+    /// Đang trễ, không có âm thanh, dịch không dùng được (§4.4, §9).
+    pub indicators: Indicators,
+    /// macOS: nguồn âm thanh trả toàn im lặng tuyệt đối trong khi có app đang phát: nghi chưa được cấp quyền ghi âm thanh
+    /// hệ thống (§9). Phiên vẫn chạy; giao diện hiện `error.audioPermission` kèm nút mở System Settings.
+    pub permission_suspected: bool,
+    /// macOS, nguồn một app: app đã chọn không phát tiếng nữa (đã đóng); phiên vẫn chạy và thử thu lại mỗi 2 giây
+    /// (Q-C của review 02 lần 2). Giao diện hiện chỉ báo.
+    pub waiting_for_app: bool,
+    /// Tăng mỗi lần trạng thái đổi. Giao diện bỏ trạng thái có `rev` nhỏ hơn trạng thái đã có (kết quả của một lệnh có thể
+    /// tới sau sự kiện `app://status` mới hơn).
+    pub rev: u64,
 }
 
 /// Phần cài đặt mà thanh phụ đề cần. Cửa sổ `overlay` chỉ đọc được phần này (§10.2).
@@ -83,6 +117,14 @@
                 // Thanh phụ đề ẩn lúc khởi động, kể cả khi mở lúc đăng nhập; hiện khi bắt đầu phiên (§4.2, Đ19).
                 overlay_visible: false,
                 hotkey_failures: Vec::new(),
+                loading: None,
+                session_error: None,
+                cpu_fallback: false,
+                suggest_lite: false,
+                indicators: Indicators::default(),
+                permission_suspected: false,
+                waiting_for_app: false,
+                rev: 0,
             }),
             launched_at_login,
         }
@@ -105,8 +147,12 @@
         self.status.lock().unwrap().clone()
     }
 
+    /// Đổi trạng thái dưới khóa của nó (một lần đổi là nguyên khối), rồi tăng `rev`.
     pub fn update_status<T>(&self, f: impl FnOnce(&mut AppStatus) -> T) -> T {
-        f(&mut self.status.lock().unwrap())
+        let mut status = self.status.lock().unwrap();
+        let out = f(&mut status);
+        status.rev += 1;
+        out
     }
 
     pub fn launched_at_login(&self) -> bool {
```

Sửa `src-tauri/src/tray.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/tray.rs
+++ b/src-tauri/src/tray.rs
@@ -19,7 +19,7 @@
     let settings = state.settings();
     let status = state.status();
     let model = TrayModel {
-        running: status.session == SessionStatus::Running,
+        running: matches!(status.session, SessionStatus::Starting | SessionStatus::Running),
         overlay_visible: status.overlay_visible,
         locked: settings.overlay.locked,
         hotkeys_failed: !status.hotkey_failures.is_empty(),
```

Sửa `src-tauri/src/window.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/window.rs
+++ b/src-tauri/src/window.rs
@@ -2,7 +2,7 @@
 
 use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};
 
-use crate::{navigation, overlay};
+use crate::{navigation, overlay, session};
 
 pub const MAIN: &str = "main";
 
@@ -22,9 +22,10 @@
     Ok(())
 }
 
-/// Hiện cửa sổ chính. Trên Mac, app hiện icon ở Dock (activation policy `regular`).
-/// Kế hoạch 02 chạy hai tiến trình phụ khi cửa sổ chính mở (§5), từ chỗ gọi hàm này.
+/// Hiện cửa sổ chính. Trên Mac, app hiện icon ở Dock (activation policy `regular`). Hai tiến trình phụ chạy sẵn trên
+/// luồng nền (§5): tới lúc bấm Bắt đầu thì model đã nạp xong.
 pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
+    session::prewarm(app);
     #[cfg(target_os = "macos")]
     if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
         log::warn!("không đổi được activation policy: {e}");
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p meeting-translator --lib`
Expected:

```text
test app_tests::blocked_quit_shows_a_notice_in_the_main_window ... ok
test app_tests::an_exhausted_quota_refuses_to_start ... ok
test app_tests::enabling_launch_at_login_blocked_in_login_items_shows_a_notice ... ok
test app_tests::a_failed_start_reports_its_error_code ... ok
test app_tests::hide_show_and_lock_reach_the_overlay_window ... ok
test app_tests::startup_follows_the_system_when_login_items_turned_it_off ... ok
test app_tests::overlay_starts_hidden_and_appears_when_a_session_starts ... ok
test app_tests::the_status_revision_grows_with_every_change ... ok
test app_tests::turning_off_launch_at_login_works_and_reports_when_it_stays_on ... ok
test session::tests::a_new_start_forgets_why_the_worker_gave_up ... ok
test app_tests::a_cancelled_start_that_fails_clears_the_loading_note ... ok
test session::tests::every_fatal_reason_has_an_error_code ... ok
test session::tests::the_engine_follows_the_language_and_pause_settings ... ok
test session::tests::a_gpu_ready_clears_the_cpu_fallback_note ... ok
test session::tests::allow_retry_reaches_the_live_manager ... ok
test app_tests::cancel_while_starting_returns_to_idle_at_once ... ok
test app_tests::a_listening_test_session_also_captures_the_app_itself ... ok
test app_tests::shutdown_while_preparing_returns_quickly ... ok
test app_tests::a_user_start_allows_a_retry_before_preparing_and_prewarm_does_not ... ok
test app_tests::start_again_after_cancel_responds_at_once ... ok
test app_tests::toggling_from_three_threads_ends_in_a_consistent_state ... ok
test app_tests::a_session_turns_speech_into_subtitle_events ... ok
test app_tests::errors_after_the_start_stop_the_session_with_their_code ... ok
test app_tests::a_late_error_of_an_old_session_does_not_touch_the_new_one ... ok
test result: ok. 153 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.38s
```

- [ ] **Step 6: Clippy (cả target Windows) và định dạng**

Run:
```bash
cargo clippy -p meeting-translator --all-targets -- -D warnings
RC_x86_64_pc_windows_msvc=$PWD/scripts/fake-llvm-rc PKG_CONFIG_x86_64_pc_windows_msvc=$PWD/scripts/fake-pkg-config \
  PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 \
  cargo clippy -p meeting-translator --target x86_64-pc-windows-msvc --all-targets -- -D warnings
cargo fmt --all -- --check
```
Expected: không có cảnh báo, `cargo fmt` không in gì. Dòng cuối của lệnh thứ hai:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.31s
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/src/actions.rs \
  src-tauri/src/app_tests.rs \
  src-tauri/src/commands.rs \
  src-tauri/src/events.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/overlay/mod.rs \
  src-tauri/src/session.rs \
  src-tauri/src/sidecar/mod.rs \
  src-tauri/src/state.rs \
  src-tauri/src/test_support.rs \
  src-tauri/src/tray.rs \
  src-tauri/src/window.rs
git commit -m "feat(app): phiên dịch thật thay session_stub: tiến trình phụ, nguồn âm thanh, sự kiện phụ đề" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: Chọn nguồn âm thanh, quyền ghi âm thanh hệ thống

Dòng 38, 87, 91, 92, 230:
- lệnh `list_audio_sources` (`async`, vì hỏi Core Audio hay WASAPI có thể chậm): macOS, các app đang phát tiếng (đã gộp tiến trình helper, trừ chính app), mỗi dòng có bundle ID và tên hiển thị nếu có (QĐ30); Windows, các thiết bị phát;
- `system.rs`: test hằng `AUDIO_PERMISSION_URL` là một trang System Settings cố định (scheme `x-apple.systempreferences`), không đi qua `https_only` của 01 (chỉ dành cho link ngoài);
- `scripts/run-dev-app.sh` (Q-D của review 02 lần 2): gói binary dev thành `target/AI Translator Dev.app` (`Info.plist` của app với bundle id, hai bản `InfoPlist.strings`), ký bằng chứng thư cố định của `run-dev-signed.sh`, chạy Vite rồi mở gói bằng `open`, chuyển các biến `MT_*` qua `open --env` (app mở bằng `open` không thừa hưởng biến môi trường của shell; Nhỏ-9 của review 02 lần 3; `RUST_LOG` không được chuyển vì app không đọc nó). macOS tính quyền ghi âm thanh hệ thống cho app mở bằng `open`; chạy thẳng binary từ Terminal thì quyền tính cho Terminal (kế hoạch 0-04, Task 5). Task 8 dùng script này;
- lệnh `open_audio_permission_settings`: macOS, mở trang quyền ghi âm thanh hệ thống của System Settings. Như mọi việc mở ra ngoài app (QĐ28 của 01), lệnh đi qua `SystemOpener`: phương thức mới của trait, bản thật trong `system.rs` (`AUDIO_PERMISSION_URL`), bản giả trong `test_support::FakeSystem`, và tên lệnh trong `OPENER_COMMANDS` của `acl_tests.rs`. Test không mở gì thật; trên Windows lệnh trả `unsupported` trước khi tới `SystemOpener`;
- hai lệnh có mặt ở đủ ba chỗ (`commands::handler`, `build.rs`, `capabilities/main.json`); test ACL lấy danh sách cố định từ `MAIN_COMMANDS`;
- câu xin quyền (QĐ31): `src-tauri/Info.plist` có `NSAudioCaptureUsageDescription` bằng tiếng Anh (tên AI Translator), `CFBundleDevelopmentRegion` và `CFBundleLocalizations` (en, vi); `src-tauri/macos/{en,vi}.lproj/InfoPlist.strings` có câu tiếng Anh và tiếng Việt; `tauri.conf.json` chép hai file đó vào `Contents/Resources/` qua `bundle.macOS.files`. Tauri gộp `Info.plist` vào gói `.app` (07) và nhúng vào binary của `pnpm tauri dev`; `tauri dev` chỉ có câu tiếng Anh. Test `the_audio_permission_prompt_is_localized` đọc cả ba file bằng `include_str!`.

**Files:**
- Tạo: `scripts/run-dev-app.sh`
- Tạo: `src-tauri/Info.plist`
- Sửa: `src-tauri/build.rs`
- Sửa: `src-tauri/capabilities/main.json`
- Tạo: `src-tauri/macos/en.lproj/InfoPlist.strings`
- Tạo: `src-tauri/macos/vi.lproj/InfoPlist.strings`
- Test (sửa): `src-tauri/src/acl_tests.rs`
- Sửa: `src-tauri/src/actions.rs`
- Test (sửa): `src-tauri/src/app_tests.rs`
- Sửa: `src-tauri/src/commands.rs`
- Sửa: `src-tauri/src/system.rs`
- Test (sửa): `src-tauri/src/test_support.rs`
- Sửa: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Viết test**

Sửa `src-tauri/src/acl_tests.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/acl_tests.rs
+++ b/src-tauri/src/acl_tests.rs
@@ -44,7 +44,12 @@
 ];
 
 /// Lệnh của app có tác dụng ra ngoài app (mở Finder, System Settings, Settings của Windows).
-const OPENER_COMMANDS: &[&str] = &["open_log_dir", "open_taskbar_settings", "open_login_items_settings"];
+const OPENER_COMMANDS: &[&str] = &[
+    "open_log_dir",
+    "open_taskbar_settings",
+    "open_login_items_settings",
+    "open_audio_permission_settings",
+];
 
 fn allow(cmd: &str) -> String {
     format!("allow-{}", cmd.replace('_', "-"))
@@ -169,7 +174,11 @@
     }
     // Lệnh không có trên hệ điều hành này trả `unsupported` trước khi tới SystemOpener.
     let expected: &[&str] = if cfg!(target_os = "macos") {
-        &["open_log_dir", "open_login_items_settings"]
+        &[
+            "open_log_dir",
+            "open_login_items_settings",
+            "open_audio_permission_settings",
+        ]
     } else {
         &["open_log_dir", "open_taskbar_settings"]
     };
```

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -507,3 +507,26 @@
         .unwrap();
     assert!(before < running && running < idle, "{before} {running} {idle}");
 }
+
+/// Q8(c) của review 02c: câu hỏi quyền ghi âm thanh hệ thống có bản tiếng Anh (gốc, trong `Info.plist`) và tiếng Việt
+/// (`vi.lproj`), đều nói tên AI Translator, và `tauri.conf.json` chép hai file `InfoPlist.strings` vào gói `.app`.
+#[test]
+fn the_audio_permission_prompt_is_localized() {
+    const KEY: &str = "NSAudioCaptureUsageDescription";
+    let plist = include_str!("../Info.plist");
+    let en = include_str!("../macos/en.lproj/InfoPlist.strings");
+    let vi = include_str!("../macos/vi.lproj/InfoPlist.strings");
+    for (name, text) in [("Info.plist", plist), ("en", en), ("vi", vi)] {
+        assert!(text.contains(KEY) && text.contains("AI Translator"), "{name}");
+    }
+    assert!(plist.contains("<string>vi</string>"), "CFBundleLocalizations có vi");
+    assert!(vi.contains("thu âm thanh máy đang phát"));
+    let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
+    let files = &conf["bundle"]["macOS"]["files"];
+    for lang in ["en", "vi"] {
+        assert_eq!(
+            files[format!("Resources/{lang}.lproj/InfoPlist.strings")],
+            format!("macos/{lang}.lproj/InfoPlist.strings")
+        );
+    }
+}
```

Sửa `src-tauri/src/system.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/system.rs
+++ b/src-tauri/src/system.rs
@@ -139,6 +139,9 @@
         }
         fn open_external_url(&self, url: &str) -> Result<(), String> {
             self.push(&format!("open_external_url {url}"))
+        }
+        fn open_audio_permission_settings(&self) -> Result<(), String> {
+            self.push("open_audio_permission_settings")
         }
     }
 
@@ -162,6 +165,19 @@
         }
     }
 
+    /// Trang quyền ghi âm thanh hệ thống mở thẳng một hằng cố định của app, không đi qua `https_only` (chỉ cho link
+    /// ngoài nhận từ giao diện): kiểm hằng đó đúng là một trang của System Settings, không phải URL lấy từ bên ngoài.
+    #[test]
+    fn the_audio_permission_page_is_a_fixed_system_settings_url() {
+        let url = Url::parse(AUDIO_PERMISSION_URL).unwrap();
+        assert_eq!(url.scheme(), "x-apple.systempreferences");
+        assert!(url.as_str().ends_with("?Privacy_AudioCapture"));
+        assert!(
+            https_only(AUDIO_PERMISSION_URL).is_err(),
+            "link ngoài không mở được trang này"
+        );
+    }
+
     #[test]
     fn nothing_opens_until_an_opener_is_installed() {
         let app = tauri::test::mock_app();
@@ -170,6 +186,7 @@
         assert!(open_taskbar_settings(app).is_err());
         assert!(open_login_items_settings(app).is_err());
         assert!(open_external_url(app, "https://pay.payos.vn/").is_err());
+        assert!(open_audio_permission_settings(app).is_err());
     }
 
     #[test]
@@ -182,6 +199,7 @@
         open_taskbar_settings(app).unwrap();
         open_login_items_settings(app).unwrap();
         open_external_url(app, "https://pay.payos.vn/web/1").unwrap();
+        open_audio_permission_settings(app).unwrap();
         assert_eq!(
             *recorder.0.lock().unwrap(),
             [
@@ -189,6 +207,7 @@
                 "open_taskbar_settings",
                 "open_login_items_settings",
                 "open_external_url https://pay.payos.vn/web/1",
+                "open_audio_permission_settings",
             ]
         );
     }
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -75,6 +75,9 @@
     }
     fn open_external_url(&self, url: &str) -> Result<(), String> {
         self.push(format!("open_external_url {url}"))
+    }
+    fn open_audio_permission_settings(&self) -> Result<(), String> {
+        self.push("open_audio_permission_settings".into())
     }
 }
 
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `cargo test -p meeting-translator --lib`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error: couldn't read `src-tauri/src/../Info.plist`: No such file or directory (os error 2)
error: couldn't read `src-tauri/src/../macos/en.lproj/InfoPlist.strings`: No such file or directory (os error 2)
error: couldn't read `src-tauri/src/../macos/vi.lproj/InfoPlist.strings`: No such file or directory (os error 2)
error[E0407]: method `open_audio_permission_settings` is not a member of trait `SystemOpener`
error[E0425]: cannot find value `AUDIO_PERMISSION_URL` in this scope
error[E0425]: cannot find function `open_audio_permission_settings` in this scope
```

- [ ] **Step 3: Viết code**

Tạo `scripts/run-dev-app.sh`:

```bash
#!/bin/sh
# Chạy bản dev trong một gói `.app`, mở bằng `open` (Q-D của review 02 lần 2; như `Capture.app` của kế hoạch 0-04).
# macOS tính quyền "Ghi âm thanh hệ thống" cho app được mở bằng `open`; chạy thẳng binary từ Terminal (`pnpm tauri dev`,
# `scripts/run-dev-signed.sh`) thì quyền lại tính cho Terminal, nên các bước thử quyền của 02c Task 8 sai. Gói có
# `Info.plist` của app (câu xin quyền), hai bản `InfoPlist.strings` (en, vi) và bundle id của app; ký bằng cùng chứng thư
# cố định với `run-dev-signed.sh` (R8 của kế hoạch 00), để macOS nhớ quyền đã cấp qua các lần build.
#
#   scripts/run-dev-app.sh   # build, đóng gói vào target/AI Translator Dev.app, chạy Vite, mở app và chờ app thoát
#
# Bản dev đọc tiến trình phụ ở `src-tauri/binaries/` (chép bằng `scripts/copy-sidecars.sh`) và giao diện từ Vite.
# App mở bằng `open` không thừa hưởng biến môi trường của shell (Nhỏ-9 của review 02 lần 3): script chuyển các biến
# `MT_*` đang đặt qua `open --env` (có từ macOS 13; app cần macOS 14.2 trở lên nên luôn dùng được). Mức log của app đặt cố
# định trong `logging.rs`, không đọc `RUST_LOG`, nên biến đó không được chuyển.
set -eu
identity="${MT_DEV_SIGN_IDENTITY:-AI Translator Dev}"
root=$(cd "$(dirname "$0")/.." && pwd)
target="${CARGO_TARGET_DIR:-$root/target}"
identifier=$(sed -n 's/^  "identifier": "\(.*\)",$/\1/p' "$root/src-tauri/tauri.conf.json")
app="$target/AI Translator Dev.app"

cd "$root"
cargo build -p meeting-translator
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$target/debug/meeting-translator" "$app/Contents/MacOS/meeting-translator"
cp src-tauri/Info.plist "$app/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "$identifier" "$app/Contents/Info.plist"
plutil -replace CFBundleExecutable -string meeting-translator "$app/Contents/Info.plist"
plutil -replace CFBundleName -string "AI Translator" "$app/Contents/Info.plist"
plutil -replace CFBundlePackageType -string APPL "$app/Contents/Info.plist"
for lang in en vi; do
  mkdir -p "$app/Contents/Resources/$lang.lproj"
  cp "src-tauri/macos/$lang.lproj/InfoPlist.strings" "$app/Contents/Resources/$lang.lproj/"
done
plutil -lint "$app/Contents/Info.plist"
codesign --force --sign "$identity" --identifier "$identifier" "$app"
codesign --verify --verbose=2 "$app"

# Bản dev mở http://localhost:1420 do Vite phục vụ: chạy Vite trước, chờ nó sẵn sàng.
pnpm dev >/dev/null 2>&1 &
vite=$!
trap 'kill "$vite" 2>/dev/null' EXIT INT TERM
until curl -sf http://localhost:1420 >/dev/null; do sleep 0.2; done
set --
for name in $(env | sed -n 's/^\(MT_[A-Za-z0-9_]*\)=.*/\1/p'); do
  set -- "$@" --env "$name=$(printenv "$name")"
done
open -W "$@" "$app"
```

Tạo `src-tauri/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSAudioCaptureUsageDescription</key>
  <string>AI Translator captures the audio your Mac is playing to show translated subtitles. The audio never leaves your Mac.</string>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleLocalizations</key>
  <array>
    <string>en</string>
    <string>vi</string>
  </array>
</dict>
</plist>
```

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -20,6 +20,8 @@
             "open_log_dir",
             "open_taskbar_settings",
             "open_login_items_settings",
+            "list_audio_sources",
+            "open_audio_permission_settings",
             "get_overlay_view",
         ])),
     )
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -15,6 +15,8 @@
     "allow-open-log-dir",
     "allow-open-taskbar-settings",
     "allow-open-login-items-settings",
+    "allow-list-audio-sources",
+    "allow-open-audio-permission-settings",
     "core:event:allow-listen",
     "core:event:allow-unlisten",
     "core:webview:allow-set-webview-zoom"
```

Tạo `src-tauri/macos/en.lproj/InfoPlist.strings`:

```text
/* Câu hỏi quyền "Ghi âm thanh hệ thống" của macOS (NSAudioCaptureUsageDescription), tiếng Anh. */
"NSAudioCaptureUsageDescription" = "AI Translator captures the audio your Mac is playing to show translated subtitles. The audio never leaves your Mac.";
```

Tạo `src-tauri/macos/vi.lproj/InfoPlist.strings`:

```text
/* Câu hỏi quyền "Ghi âm thanh hệ thống" của macOS (NSAudioCaptureUsageDescription), tiếng Việt. */
"NSAudioCaptureUsageDescription" = "AI Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.";
```

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -1,6 +1,7 @@
 //! Các việc dùng chung cho lệnh `invoke`, menu khay và phím tắt. Mỗi việc đổi trạng thái rồi báo
 //! lại cho giao diện, menu khay và thanh phụ đề, để ba nơi luôn khớp nhau.
 
+use serde::Serialize;
 use serde_json::Value;
 use tauri::{AppHandle, Manager, Runtime};
 
@@ -192,6 +193,62 @@
     system::open_taskbar_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
 }
 
+/// Một lựa chọn ở Cài đặt › Âm thanh, ngoài "toàn hệ thống" (§6.1). Cùng dạng với `settings::AudioSource`.
+#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
+#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
+pub enum AudioSourceOption {
+    /// macOS: một app đang phát âm thanh, gộp cả các tiến trình helper của nó (trình duyệt, app Electron). `name` là tên
+    /// hiển thị (`NSRunningApplication.localizedName`); không có thì giao diện hiện bundle ID.
+    App { bundle_id: String, name: Option<String> },
+    /// Windows: một thiết bị phát đang hoạt động.
+    Device { id: String, name: String },
+}
+
+/// Danh sách nguồn chọn được lúc này: macOS, các app đang phát âm thanh (trừ chính app); Windows, các thiết bị phát.
+pub fn list_audio_sources() -> Result<Vec<AudioSourceOption>, CommandError> {
+    let failed = |e: anyhow::Error| CommandError::new(errors::CAPTURE_FAILED, None, format!("{e:#}"));
+    #[cfg(target_os = "macos")]
+    {
+        // `audio_apps` đã gộp tiến trình theo app và bỏ chính app; mỗi bundle ID một dòng, theo thứ tự chữ cái.
+        let apps: std::collections::BTreeMap<String, Option<String>> = audio_capture::macos::audio_apps()
+            .map_err(failed)?
+            .into_iter()
+            .filter(|a| !a.bundle_id.is_empty())
+            .map(|a| (a.bundle_id, a.name))
+            .collect();
+        Ok(apps
+            .into_iter()
+            .map(|(bundle_id, name)| AudioSourceOption::App { bundle_id, name })
+            .collect())
+    }
+    #[cfg(windows)]
+    {
+        Ok(audio_capture::windows::list_render_devices()
+            .map_err(failed)?
+            .into_iter()
+            .map(|d| AudioSourceOption::Device { id: d.id, name: d.name })
+            .collect())
+    }
+    #[cfg(not(any(target_os = "macos", windows)))]
+    {
+        let _ = failed;
+        Err(CommandError::new(
+            errors::UNSUPPORTED,
+            None,
+            "chỉ có trên macOS và Windows",
+        ))
+    }
+}
+
+/// macOS: mở System Settings ở trang quyền ghi âm thanh hệ thống, cho bước lần đầu và lỗi "chưa cấp quyền" (§4.1
+/// bước 4, §9). Đi qua `SystemOpener` như mọi việc mở ra ngoài app.
+pub fn open_audio_permission_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
+    if !cfg!(target_os = "macos") {
+        return Err(CommandError::new(errors::UNSUPPORTED, None, "chỉ có trên macOS"));
+    }
+    system::open_audio_permission_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
+}
+
 /// Thoát hẳn, chỉ gọi từ menu khay (§4.3): nhớ vị trí thanh phụ đề, dừng phiên, tắt hai tiến trình phụ, rồi thoát.
 /// Dừng phiên có thể chờ tới 2 giây (câu đang dịch), nên việc đó chạy trên luồng riêng.
 pub fn quit<R: Runtime>(app: &AppHandle<R>) {
```

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -9,7 +9,7 @@
 use serde_json::Value;
 use tauri::{AppHandle, Runtime, State};
 
-use crate::actions;
+use crate::actions::{self, AudioSourceOption};
 use crate::errors::{self, CommandError};
 use crate::hotkeys::HotkeyAction;
 use crate::settings::Settings;
@@ -84,6 +84,19 @@
     actions::open_login_items_settings(&app)
 }
 
+/// Hỏi Core Audio hay WASAPI có thể chậm: lệnh `async` để không chặn luồng chính.
+#[tauri::command]
+pub async fn list_audio_sources() -> Result<Vec<AudioSourceOption>, CommandError> {
+    tauri::async_runtime::spawn_blocking(actions::list_audio_sources)
+        .await
+        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
+}
+
+#[tauri::command]
+pub fn open_audio_permission_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
+    actions::open_audio_permission_settings(&app)
+}
+
 /// Lệnh duy nhất cửa sổ `overlay` gọi được, chỉ đọc (§10.2).
 #[tauri::command]
 pub fn get_overlay_view(state: State<'_, AppState>) -> OverlayView {
@@ -103,6 +116,8 @@
     "open_log_dir",
     "open_taskbar_settings",
     "open_login_items_settings",
+    "list_audio_sources",
+    "open_audio_permission_settings",
 ];
 
 /// Lệnh của cửa sổ `overlay`.
@@ -121,6 +136,8 @@
         open_log_dir,
         open_taskbar_settings,
         open_login_items_settings,
+        list_audio_sources,
+        open_audio_permission_settings,
         get_overlay_view,
     ]
 }
```

Sửa `src-tauri/src/system.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/system.rs
+++ b/src-tauri/src/system.rs
@@ -22,7 +22,13 @@
     fn open_login_items_settings(&self) -> Result<(), String>;
     /// Mở một URL mà `navigation` đã cho phép bằng trình duyệt của hệ thống.
     fn open_external_url(&self, url: &str) -> Result<(), String>;
-}
+    /// macOS: System Settings › Privacy & Security, trang quyền ghi âm thanh hệ thống (kế hoạch 02, §4.1 bước 4, §9).
+    fn open_audio_permission_settings(&self) -> Result<(), String>;
+}
+
+/// macOS: trang "Screen & System Audio Recording" của System Settings, phần "System Audio Recording Only" (quyền mà
+/// Core Audio tap cần). Cần người kiểm trên máy thật (kế hoạch 02c, Task 8).
+pub const AUDIO_PERMISSION_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture";
 
 /// `SystemOpener` đang dùng.
 pub struct System(pub Box<dyn SystemOpener>);
@@ -68,6 +74,16 @@
             .open_url(url.as_str(), None::<&str>)
             .map_err(|e| e.to_string())
     }
+
+    fn open_audio_permission_settings(&self) -> Result<(), String> {
+        if !cfg!(target_os = "macos") {
+            return Err("chỉ có trên macOS".into());
+        }
+        self.0
+            .opener()
+            .open_url(AUDIO_PERMISSION_URL, None::<&str>)
+            .map_err(|e| e.to_string())
+    }
 }
 
 /// Lớp chặn thứ hai sau `navigation`: bản thật chỉ mở URL `https` có tên máy chủ, kể cả khi một lời gọi
@@ -109,6 +125,10 @@
 
 pub fn open_external_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
     with(app, |s| s.open_external_url(url))
+}
+
+pub fn open_audio_permission_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
+    with(app, |s| s.open_audio_permission_settings())
 }
 
 #[cfg(test)]
```

Sửa `src-tauri/tauri.conf.json` (áp bằng `git apply`):

```diff
--- a/src-tauri/tauri.conf.json
+++ b/src-tauri/tauri.conf.json
@@ -18,6 +18,12 @@
   },
   "bundle": {
     "active": false,
-    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
+    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
+    "macOS": {
+      "files": {
+        "Resources/en.lproj/InfoPlist.strings": "macos/en.lproj/InfoPlist.strings",
+        "Resources/vi.lproj/InfoPlist.strings": "macos/vi.lproj/InfoPlist.strings"
+      }
+    }
   }
 }
```

Run: `chmod +x scripts/run-dev-app.sh`

- [ ] **Step 4: Chạy test, thấy xanh**

Run: `cargo test -p meeting-translator --lib && plutil -lint src-tauri/Info.plist src-tauri/macos/en.lproj/InfoPlist.strings src-tauri/macos/vi.lproj/InfoPlist.strings`
Expected:

```text
test acl_tests::capabilities_grant_exactly_the_fixed_lists ... ok
test app_tests::blocked_quit_shows_a_notice_in_the_main_window ... ok
test app_tests::an_exhausted_quota_refuses_to_start ... ok
test acl_tests::outside_effects_only_reach_the_fake_opener ... ok
test app_tests::enabling_launch_at_login_blocked_in_login_items_shows_a_notice ... ok
test app_tests::hide_show_and_lock_reach_the_overlay_window ... ok
test app_tests::a_failed_start_reports_its_error_code ... ok
test app_tests::startup_follows_the_system_when_login_items_turned_it_off ... ok
test app_tests::the_audio_permission_prompt_is_localized ... ok
test acl_tests::each_window_only_reaches_its_own_commands ... ok
test app_tests::a_user_start_allows_a_retry_before_preparing_and_prewarm_does_not ... ok
test app_tests::overlay_starts_hidden_and_appears_when_a_session_starts ... ok
test app_tests::turning_off_launch_at_login_works_and_reports_when_it_stays_on ... ok
test app_tests::the_status_revision_grows_with_every_change ... ok
test app_tests::shutdown_while_preparing_returns_quickly ... ok
test app_tests::a_listening_test_session_also_captures_the_app_itself ... ok
test app_tests::a_cancelled_start_that_fails_clears_the_loading_note ... ok
test app_tests::cancel_while_starting_returns_to_idle_at_once ... ok
test app_tests::start_again_after_cancel_responds_at_once ... ok
test app_tests::toggling_from_three_threads_ends_in_a_consistent_state ... ok
test app_tests::a_session_turns_speech_into_subtitle_events ... ok
test app_tests::errors_after_the_start_stop_the_session_with_their_code ... ok
test app_tests::a_late_error_of_an_old_session_does_not_touch_the_new_one ... ok
test result: ok. 155 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.38s
```

```text
src-tauri/Info.plist: OK
src-tauri/macos/en.lproj/InfoPlist.strings: OK
src-tauri/macos/vi.lproj/InfoPlist.strings: OK
```

Run: `sh -n scripts/run-dev-app.sh && test -x scripts/run-dev-app.sh && echo 'cú pháp đúng, có quyền chạy'` (chỉ kiểm cú pháp; Task 8 mới chạy script này, vì nó mở app)
Expected:

```text
cú pháp đúng, có quyền chạy
```

- [ ] **Step 5: Clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-dev-app.sh \
  src-tauri/Info.plist \
  src-tauri/build.rs \
  src-tauri/capabilities/main.json \
  src-tauri/macos/en.lproj/InfoPlist.strings \
  src-tauri/macos/vi.lproj/InfoPlist.strings \
  src-tauri/src/acl_tests.rs \
  src-tauri/src/actions.rs \
  src-tauri/src/app_tests.rs \
  src-tauri/src/commands.rs \
  src-tauri/src/system.rs \
  src-tauri/src/test_support.rs \
  src-tauri/tauri.conf.json
git commit -m "feat(app): chọn nguồn âm thanh, mở trang quyền ghi âm thanh hệ thống, câu xin quyền tiếng Anh và tiếng Việt, gói .app cho bản dev" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: Dữ liệu của giao diện: kiểu, store, thanh phụ đề

Dòng 43, 66, 67, 152:
- `src/lib/ipc.ts`: kiểu khớp phía Rust (trạng thái phiên mới, `Indicators`, `permissionSuspected`, `waitingForApp`, `rev`, `Subtitle.replaces`, `SubtitleDelta`, `AudioSourceOption` có `name`, hai lệnh mới, hai sự kiện mới).
- `src/store/app.ts`: `setStatus` bỏ trạng thái có `rev` nhỏ hơn trạng thái đang có; lỗi bắt đầu phiên nằm trong trạng thái thì thanh báo lỗi của lệnh trước cũng mất (Nhỏ-8 của review 02 lần 3) (sự kiện cũ tới sau kết quả của lệnh không ghi đè trạng thái mới; Q6 của review 02c); mức âm lượng theo `audio://level` (về 0 khi phiên không chạy), danh sách nguồn âm thanh, mở trang quyền; bắt đầu phiên lỗi thì lấy trạng thái lỗi từ phía Rust (`sessionError`) thay vì bật thanh báo lỗi chung; `levelToMeter` (thanh đo theo dBFS).
- `src/store/app.ts`, `init()`: cài đặt hay trạng thái đã tới qua sự kiện trong lúc chờ `get_settings`, `get_app_status` thì giữ bản đó, không để kết quả của lệnh đè lên.
- `src/store/overlay.ts`: `appendDelta` nối chữ dịch tới dần; `upsertLine` bỏ các phụ đề đã gộp (`replaces`), xếp theo `id`: phụ đề gộp (mang id của câu đầu, nhỏ hơn câu mới đã hiện sau nó) vào đúng chỗ dòng đầu tiên bị thay (S1 của review 02 lần 2); phụ đề khác chưa có trên thanh mà cũ hơn dòng đầu (bản dịch xong sau khi câu đã trôi khỏi thanh) thì bỏ qua, còn lại chèn đúng chỗ theo `id` (id không trùng giữa các phiên nhờ `id_base`); store nghe `app://status` (bỏ trạng thái có `rev` nhỏ hơn) và xóa phụ đề khi một phiên mới bắt đầu (`starting`); `overlay://view` mới thì cắt `lines` theo số dòng mới; `init` không ghi đè cài đặt mới hơn đã tới qua sự kiện, và cắt các phụ đề đã tới trước đó theo số dòng (N-3).
- `src/windows/overlay/overlay.tsx`: chưa có chữ dịch thì hiện câu gốc một lần (nhãn cho từng trạng thái ở 03).

**Files:**
- Sửa: `src/lib/ipc.ts`
- Test (sửa): `src/store/app.test.ts`
- Sửa: `src/store/app.ts`
- Test (sửa): `src/store/overlay.test.ts`
- Sửa: `src/store/overlay.ts`
- Sửa: `src/windows/overlay/overlay.tsx`

- [ ] **Step 1: Viết test**

Sửa `src/store/app.test.ts` (áp bằng `git apply`):

```diff
--- a/src/store/app.test.ts
+++ b/src/store/app.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import { fakeIpc } from "../lib/fakeIpc";
 import type { AppInfo, AppStatus, Ipc, Settings } from "../lib/ipc";
-import { canOpenScreens, createAppStore, toUiError } from "./app";
+import { canOpenScreens, createAppStore, levelToMeter, toUiError } from "./app";
 
 const settings: Settings = {
   uiLanguage: "vi",
@@ -20,7 +20,19 @@
   experimental: { translationContext: false },
   onboardingDone: false,
 };
-const status: AppStatus = { session: "idle", overlayVisible: true, hotkeyFailures: [] };
+const status: AppStatus = {
+  session: "idle",
+  overlayVisible: true,
+  hotkeyFailures: [],
+  loading: null,
+  sessionError: null,
+  cpuFallback: false,
+  suggestLite: false,
+  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
+  permissionSuspected: false,
+  waitingForApp: false,
+  rev: 1,
+};
 const info: AppInfo = {
   name: "AI Translator",
   version: "0.1.0",
@@ -29,17 +41,21 @@
   launchedAtLogin: false,
 };
 
-let failToggle = false;
+// `toggle_session` lỗi: "model" là lỗi của phiên (trạng thái ra "error"), "acl" là lỗi khác.
+let failToggle: "model" | "acl" | null = null;
 let failLoginItems = false;
 let failOnboarding = false;
 
 function setup() {
-  failToggle = false;
+  failToggle = null;
   failLoginItems = false;
   failOnboarding = false;
   const fake = fakeIpc({
     get_settings: () => settings,
-    get_app_status: () => status,
+    get_app_status: () =>
+      failToggle === "model"
+        ? { ...status, session: "error", sessionError: "modelMissing", overlayVisible: true, rev: 3 }
+        : status,
     get_app_info: () => info,
     update_settings: ({ patch }) => {
       if (patch.vadEndSilenceMs === 900) throw { code: "outOfRange", field: "vadEndSilenceMs", message: "…" };
@@ -51,9 +67,12 @@
       return { ...settings, hotkeys: { ...settings.hotkeys, [action]: accelerator.replace("Key", "") } };
     },
     toggle_session: () => {
-      if (failToggle) throw { code: "overlayFailed", field: null, message: "…" };
-      return { ...status, session: "running", overlayVisible: true };
+      if (failToggle === "model") throw { code: "modelMissing", field: null, message: "…" };
+      if (failToggle === "acl") throw "Command toggle_session not allowed by ACL";
+      return { ...status, session: "running", overlayVisible: true, rev: 2 };
     },
+    list_audio_sources: () => [{ kind: "app", bundleId: "us.zoom.xos", name: "zoom.us" }],
+    open_audio_permission_settings: () => null,
     set_overlay_locked: ({ locked }) => ({ ...settings, overlay: { ...settings.overlay, locked } }),
     open_login_items_settings: () => {
       if (failLoginItems) throw { code: "openFailed", field: null, message: "…" };
@@ -64,7 +83,7 @@
 }
 
 describe("app store", () => {
-  it("init đọc cài đặt, trạng thái, thông tin app và nghe bốn sự kiện", async () => {
+  it("init đọc cài đặt, trạng thái, thông tin app và nghe năm sự kiện", async () => {
     const { fake, store } = setup();
     const off = await store.getState().init();
     expect(store.getState().settings).toEqual(settings);
@@ -74,6 +93,7 @@
     expect(fake.listenerCount("app://status")).toBe(1);
     expect(fake.listenerCount("app://navigate")).toBe(1);
     expect(fake.listenerCount("app://notice")).toBe(1);
+    expect(fake.listenerCount("audio://level")).toBe(1);
     off();
     expect(fake.listenerCount("settings://changed")).toBe(0);
   });
@@ -132,13 +152,92 @@
     expect(store.getState().settings?.overlay.locked).toBe(true);
   });
 
-  it("bắt đầu phiên lỗi thì báo lỗi, trạng thái giữ nguyên", async () => {
-    const { store } = setup();
-    await store.getState().init();
-    failToggle = true;
-    await store.getState().toggleSession();
-    expect(store.getState().error).toEqual({ code: "overlayFailed", field: null });
+  it("bắt đầu phiên lỗi thì trạng thái ra lỗi kèm mã, không bật thanh báo lỗi chung", async () => {
+    const { store } = setup();
+    await store.getState().init();
+    failToggle = "model";
+    await store.getState().toggleSession();
+    expect(store.getState().status?.session).toBe("error");
+    expect(store.getState().status?.sessionError).toBe("modelMissing");
+    expect(store.getState().error).toBeNull();
+  });
+
+  it("bắt đầu phiên lỗi thì thanh báo lỗi của lệnh trước cũng mất (chỉ còn lỗi trong trạng thái)", async () => {
+    const { store } = setup();
+    await store.getState().init();
+    await store.getState().updateSettings({ vadEndSilenceMs: 900 });
+    expect(store.getState().error?.code).toBe("outOfRange");
+    failToggle = "model";
+    await store.getState().toggleSession();
+    expect(store.getState().status?.sessionError).toBe("modelMissing");
+    expect(store.getState().error).toBeNull();
+  });
+
+  it("lỗi khác của toggle_session thì lên thanh báo lỗi, trạng thái giữ nguyên", async () => {
+    const { store } = setup();
+    await store.getState().init();
+    failToggle = "acl";
+    await store.getState().toggleSession();
+    expect(store.getState().error).toEqual({ code: "unknown", field: null });
     expect(store.getState().status?.session).toBe("idle");
+  });
+
+  it("mức âm lượng theo sự kiện, về 0 khi phiên dừng", async () => {
+    const { fake, store } = setup();
+    await store.getState().init();
+    fake.emit("app://status", { ...status, session: "running", rev: 2 });
+    fake.emit("audio://level", 0.05);
+    expect(store.getState().level).toBe(0.05);
+    fake.emit("app://status", { ...status, session: "idle", rev: 3 });
+    expect(store.getState().level).toBe(0);
+  });
+
+  it("trạng thái cũ hơn trạng thái đang có (rev nhỏ hơn) bị bỏ", async () => {
+    const { fake, store } = setup();
+    await store.getState().init();
+    // Sự kiện của lần dừng (rev 5) tới trước kết quả của lệnh bắt đầu (rev 2).
+    fake.emit("app://status", { ...status, session: "idle", rev: 5 });
+    await store.getState().toggleSession();
+    expect(store.getState().status?.rev).toBe(5);
+    expect(store.getState().status?.session).toBe("idle");
+  });
+
+  it("init không đè trạng thái và cài đặt mới hơn đã tới qua sự kiện trong lúc chờ", async () => {
+    let fake: ReturnType<typeof fakeIpc> | null = null;
+    fake = fakeIpc({
+      get_settings: () => {
+        fake?.emit("settings://changed", { ...settings, uiLanguage: "en" });
+        return settings;
+      },
+      get_app_status: () => {
+        fake?.emit("app://status", { ...status, session: "starting", rev: 2 });
+        return status;
+      },
+      get_app_info: () => info,
+    });
+    const store = createAppStore(fake.ipc);
+    await store.getState().init();
+    expect(store.getState().settings?.uiLanguage).toBe("en");
+    expect(store.getState().status?.session).toBe("starting");
+  });
+
+  it("đọc danh sách nguồn âm thanh và mở trang quyền ghi âm thanh", async () => {
+    const { fake, store } = setup();
+    await store.getState().init();
+    expect(store.getState().audioSources).toBeNull();
+    await store.getState().loadAudioSources();
+    expect(store.getState().audioSources).toEqual([{ kind: "app", bundleId: "us.zoom.xos", name: "zoom.us" }]);
+    await store.getState().openAudioPermissionSettings();
+    expect(fake.calls.at(-1)?.cmd).toBe("open_audio_permission_settings");
+    expect(store.getState().error).toBeNull();
+  });
+
+  it("thanh đo âm lượng theo dBFS: −60 dB trở xuống là 0, 0 dB là đầy", () => {
+    expect(levelToMeter(0)).toBe(0);
+    expect(levelToMeter(0.001)).toBe(0);
+    expect(levelToMeter(1)).toBe(1);
+    expect(levelToMeter(0.1)).toBeCloseTo(2 / 3);
+    expect(levelToMeter(Number.NaN)).toBe(0);
   });
 
   it("lời nhắc từ phía Rust hiện rồi đóng được", async () => {
@@ -269,10 +368,10 @@
   it("lệnh Bắt đầu/Dừng lỗi thì sessionPending tắt lại", async () => {
     const { store } = setup();
     await store.getState().init();
-    failToggle = true;
+    failToggle = "acl";
     await store.getState().toggleSession();
     expect(store.getState().sessionPending).toBe(false);
-    failToggle = false;
+    failToggle = null;
     await store.getState().toggleSession();
     expect(store.getState().status?.session).toBe("running");
   });
```

Thay toàn bộ `src/store/overlay.test.ts` bằng:

```ts
import { describe, expect, it, vi } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AppStatus, OverlayView, Subtitle } from "../lib/ipc";
import { appendDelta, createOverlayStore, upsertLine } from "./overlay";

const sub = (id: number, tgt: string, provisional = false): Subtitle => ({
  id,
  start_ms: id * 1000,
  end_ms: id * 1000 + 800,
  src_lang: "en",
  src_text: `src ${id}`,
  tgt_text: tgt,
  status: "done",
  provisional,
  replaces: [],
});

const view: OverlayView = { uiLanguage: "vi", fontSize: 22, lines: 2, opacity: 0.6, showSource: false, locked: false };

describe("upsertLine", () => {
  it("thêm dòng mới vào cuối, giữ tối đa max dòng", () => {
    const lines = [sub(1, "a"), sub(2, "b")];
    expect(upsertLine(lines, sub(3, "c"), 2).map((l) => l.id)).toEqual([2, 3]);
  });

  it("phụ đề đã trôi khỏi thanh thì bỏ qua, không gắn vào cuối", () => {
    const lines = [sub(5, "e"), sub(6, "f")];
    expect(upsertLine(lines, sub(4, "d"), 2).map((l) => l.id)).toEqual([5, 6]);
    expect(upsertLine(lines, sub(4, "d"), 3).map((l) => l.id)).toEqual([5, 6]);
  });

  it("phụ đề chưa có trên thanh được chèn theo thứ tự id", () => {
    const lines = [sub(1, "a"), sub(3, "c")];
    expect(upsertLine(lines, sub(2, "b"), 3).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(upsertLine(lines, sub(2, "b"), 2).map((l) => l.id)).toEqual([2, 3]);
  });

  it("phụ đề tạm cùng id được thay tại chỗ", () => {
    const lines = [sub(1, "a"), sub(2, "b", true)];
    const next = upsertLine(lines, sub(2, "b đã ghép"), 3);
    expect(next.map((l) => l.tgt_text)).toEqual(["a", "b đã ghép"]);
    expect(next[1]?.provisional).toBe(false);
  });

  it("thay tại chỗ cả dòng không nằm cuối, thứ tự giữ nguyên", () => {
    const lines = [sub(1, "a", true), sub(2, "b"), sub(3, "c")];
    const next = upsertLine(lines, sub(1, "a đã ghép"), 3);
    expect(next.map((l) => [l.id, l.tgt_text])).toEqual([
      [1, "a đã ghép"],
      [2, "b"],
      [3, "c"],
    ]);
  });
});

describe("gộp câu và chữ dịch tới dần", () => {
  it("phụ đề có replaces thì xóa các phụ đề đã gộp vào nó (§7)", () => {
    const lines = [sub(1, "a"), sub(2, "b"), sub(3, "c")];
    const merged = { ...sub(4, "b c"), replaces: [2, 3] };
    expect(upsertLine(lines, merged, 3).map((l) => l.id)).toEqual([1, 4]);
  });

  // S1 của review 02 lần 2, đúng thứ tự sự kiện của `a_full_translation_queue_merges_the_waiting_subtitles` (engine):
  // câu 1–4 hiện, câu 5 hiện, rồi câu 2 gộp câu 3–4 (`replaces`), mang id 2 nhỏ hơn câu 5 đang hiện.
  it("phụ đề gộp vào đúng chỗ dòng đầu tiên bị thay, kể cả khi id nhỏ hơn dòng đầu còn lại", () => {
    let lines: Subtitle[] = [];
    for (const id of [1, 2, 3, 4, 5]) lines = upsertLine(lines, sub(id, `${id}`), 3);
    expect(lines.map((l) => l.id)).toEqual([3, 4, 5]);
    const merged = { ...sub(2, "Hai. Ba. Bốn."), replaces: [3, 4] };
    lines = upsertLine(lines, merged, 3);
    expect(lines.map((l) => [l.id, l.tgt_text])).toEqual([
      [2, "Hai. Ba. Bốn."],
      [5, "5"],
    ]);
    // Bản dịch xong của câu gộp (không còn `replaces` nào đang hiện) thay tại chỗ.
    lines = upsertLine(lines, { ...merged, tgt_text: "xong" }, 3);
    expect(lines.map((l) => [l.id, l.tgt_text])).toEqual([
      [2, "xong"],
      [5, "5"],
    ]);
  });

  it("delta nối vào chữ dịch của đúng phụ đề, phụ đề đã trôi khỏi thanh thì bỏ qua", () => {
    const lines = [sub(1, "Xin"), sub(2, "")];
    const next = appendDelta(appendDelta(lines, { id: 1, text: " chào" }), { id: 9, text: "x" });
    expect(next.map((l) => l.tgt_text)).toEqual(["Xin chào", ""]);
  });
});

const status = (session: AppStatus["session"], rev: number): AppStatus => ({
  session,
  overlayVisible: true,
  hotkeyFailures: [],
  loading: null,
  sessionError: null,
  cpuFallback: false,
  suggestLite: false,
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
  permissionSuspected: false,
  waitingForApp: false,
  rev,
});

describe("overlay store", () => {
  it("phiên mới bắt đầu thì xóa phụ đề của phiên trước; trạng thái cũ tới muộn thì bỏ", async () => {
    const fake = fakeIpc({ get_overlay_view: () => ({ ...view, lines: 3 }) });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    fake.emit("app://status", status("starting", 1));
    fake.emit("app://status", status("running", 2));
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("app://status", status("idle", 3));
    expect(store.getState().lines.map((l) => l.id)).toEqual([1]);
    // Trạng thái `starting` cũ (rev 1) tới muộn: không xóa gì.
    fake.emit("app://status", status("starting", 1));
    expect(store.getState().lines.map((l) => l.id)).toEqual([1]);
    expect(store.getState().status?.rev).toBe(3);
    fake.emit("app://status", status("starting", 4));
    expect(store.getState().lines).toEqual([]);
    fake.emit("app://status", status("running", 5));
    fake.emit("subtitle://upsert", sub(1_000_001, "hai"));
    expect(store.getState().lines.map((l) => l.id)).toEqual([1_000_001]);
  });

  it("đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view).toEqual(view);
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("subtitle://upsert", sub(2, "hai"));
    fake.emit("subtitle://upsert", sub(3, "b"));
    fake.emit("subtitle://delta", { id: 3, text: "a" });
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3]);
    expect(store.getState().lines[1]?.tgt_text).toBe("ba");
    fake.emit("overlay://view", { ...view, lines: 1, locked: true });
    expect(store.getState().view?.locked).toBe(true);
    expect(store.getState().lines.map((l) => l.id)).toEqual([3]);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]);
  });

  it("cài đặt tới qua sự kiện trong lúc chờ get_overlay_view thì init không ghi đè", async () => {
    let fake: ReturnType<typeof fakeIpc> | null = null;
    fake = fakeIpc({
      get_overlay_view: () => {
        fake?.emit("overlay://view", { ...view, lines: 1, fontSize: 30 });
        return view;
      },
    });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view?.fontSize).toBe(30);
  });

  it("đọc xong cài đặt thì cắt các phụ đề đã tới trước đó theo số dòng", async () => {
    let release: (v: OverlayView) => void = () => {};
    const fake = fakeIpc({ get_overlay_view: () => new Promise<OverlayView>((resolve) => (release = resolve)) });
    const store = createOverlayStore(fake.ipc);
    const ready = store.getState().init();
    await vi.waitFor(() => expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]));
    for (const id of [1, 2, 3]) fake.emit("subtitle://upsert", sub(id, `${id}`));
    release(view);
    await ready;
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3]);
  });

  it("phụ đề tới trước khi đọc xong cài đặt thì giữ mặc định 3 dòng", async () => {
    let release: (v: OverlayView) => void = () => {};
    const fake = fakeIpc({ get_overlay_view: () => new Promise<OverlayView>((resolve) => (release = resolve)) });
    const store = createOverlayStore(fake.ipc);
    const ready = store.getState().init();
    await vi.waitFor(() => expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]));
    for (const id of [1, 2, 3, 4]) fake.emit("subtitle://upsert", sub(id, `${id}`));
    expect(store.getState().view).toBeNull();
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3, 4]);
    release(view);
    await ready;
  });
});
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `pnpm test`
Expected: các test mới lỗi:

```text
 Test Files  2 failed | 2 passed (4)
      Tests  17 failed | 44 passed (61)
 FAIL  src/store/app.test.ts > app store > init đọc cài đặt, trạng thái, thông tin app và nghe năm sự kiện
 FAIL  src/store/app.test.ts > app store > bắt đầu phiên lỗi thì trạng thái ra lỗi kèm mã, không bật thanh báo lỗi chung
 FAIL  src/store/app.test.ts > app store > bắt đầu phiên lỗi thì thanh báo lỗi của lệnh trước cũng mất (chỉ còn lỗi trong trạng thái)
 FAIL  src/store/app.test.ts > app store > mức âm lượng theo sự kiện, về 0 khi phiên dừng
 FAIL  src/store/app.test.ts > app store > trạng thái cũ hơn trạng thái đang có (rev nhỏ hơn) bị bỏ
 FAIL  src/store/app.test.ts > app store > init không đè trạng thái và cài đặt mới hơn đã tới qua sự kiện trong lúc chờ
 FAIL  src/store/app.test.ts > app store > đọc danh sách nguồn âm thanh và mở trang quyền ghi âm thanh
 FAIL  src/store/app.test.ts > app store > thanh đo âm lượng theo dBFS: −60 dB trở xuống là 0, 0 dB là đầy
 FAIL  src/store/overlay.test.ts > upsertLine > phụ đề đã trôi khỏi thanh thì bỏ qua, không gắn vào cuối
 FAIL  src/store/overlay.test.ts > upsertLine > phụ đề chưa có trên thanh được chèn theo thứ tự id
 FAIL  src/store/overlay.test.ts > gộp câu và chữ dịch tới dần > phụ đề có replaces thì xóa các phụ đề đã gộp vào nó (§7)
 FAIL  src/store/overlay.test.ts > gộp câu và chữ dịch tới dần > phụ đề gộp vào đúng chỗ dòng đầu tiên bị thay, kể cả khi id nhỏ hơn dòng đầu còn lại
 FAIL  src/store/overlay.test.ts > gộp câu và chữ dịch tới dần > delta nối vào chữ dịch của đúng phụ đề, phụ đề đã trôi khỏi thanh thì bỏ qua
 FAIL  src/store/overlay.test.ts > overlay store > phiên mới bắt đầu thì xóa phụ đề của phiên trước; trạng thái cũ tới muộn thì bỏ
 FAIL  src/store/overlay.test.ts > overlay store > đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện
 FAIL  src/store/overlay.test.ts > overlay store > cài đặt tới qua sự kiện trong lúc chờ get_overlay_view thì init không ghi đè
 FAIL  src/store/overlay.test.ts > overlay store > đọc xong cài đặt thì cắt các phụ đề đã tới trước đó theo số dòng
```

- [ ] **Step 3: Viết code**

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -58,13 +58,41 @@
   experimental?: Partial<Settings["experimental"]>;
 };
 
-export type SessionStatus = "idle" | "running";
+// Trạng thái phiên (`state::SessionStatus`): "starting" là lúc chạy tiến trình phụ và mở nguồn âm thanh.
+export type SessionStatus = "idle" | "starting" | "running" | "error";
+// Đang chờ tiến trình phụ: nạp model, hay lần đầu chạy bản mới (lâu hơn, §6.5).
+export type Loading = "model" | "firstRun";
+
+// Chỉ báo của phiên (`pipeline::engine::Indicators`, §4.4, §9).
+export interface Indicators {
+  lagging: boolean;
+  noAudio: boolean;
+  translationUnavailable: boolean;
+}
 
 export interface AppStatus {
   session: SessionStatus;
   overlayVisible: boolean;
   hotkeyFailures: HotkeyAction[];
+  loading: Loading | null;
+  // Mã lỗi (`error.<mã>`) khi `session` là "error".
+  sessionError: string | null;
+  cpuFallback: boolean;
+  suggestLite: boolean;
+  indicators: Indicators;
+  // macOS: âm thanh vào toàn im lặng tuyệt đối trong khi có app đang phát: nghi chưa được cấp quyền (§9).
+  permissionSuspected: boolean;
+  // macOS, nguồn một app: app đã chọn không phát tiếng nữa; phiên vẫn chạy, đang chờ app phát lại.
+  waitingForApp: boolean;
+  // Tăng mỗi lần trạng thái đổi: trạng thái có `rev` nhỏ hơn trạng thái đang có là cũ, bỏ qua.
+  rev: number;
 }
+
+// Một lựa chọn ở Cài đặt › Âm thanh (`actions::AudioSourceOption`): macOS, app đang phát tiếng (tên hiển thị nếu có);
+// Windows, thiết bị phát.
+export type AudioSourceOption =
+  | { kind: "app"; bundleId: string; name: string | null }
+  | { kind: "device"; id: string; name: string };
 
 export interface AppInfo {
   name: string;
@@ -83,7 +111,7 @@
   locked: boolean;
 }
 
-// Phụ đề (spec §6.6). Kế hoạch 02 phát đủ các trạng thái; kế hoạch 01 chỉ phát phụ đề mẫu.
+// Phụ đề (spec §6.6, `pipeline::subtitle::Subtitle`).
 export interface Subtitle {
   id: number;
   start_ms: number;
@@ -93,6 +121,14 @@
   tgt_text: string;
   status: "asr_done" | "translating" | "done" | "failed" | "same_lang" | "skipped" | "dropped";
   provisional: boolean;
+  // Id các phụ đề đã gộp vào phụ đề này khi hàng đợi dịch đầy (§7): xóa chúng đi.
+  replaces: number[];
+}
+
+// Phần chữ dịch mới trong lúc đang dịch: nối vào `tgt_text` của phụ đề cùng `id`.
+export interface SubtitleDelta {
+  id: number;
+  text: string;
 }
 
 export type Screen = "home" | "transcript" | "history" | "glossary" | "settings" | "upgrade" | "about";
@@ -118,7 +154,8 @@
   update_settings: { args: { patch: SettingsPatch }; result: Settings };
   set_hotkey: { args: { action: HotkeyAction; accelerator: string }; result: Settings };
   get_app_status: { args: undefined; result: AppStatus };
-  // Lỗi (ví dụ không hiện được thanh phụ đề) thì `invoke` reject với `CommandError`.
+  // Chờ tới khi phiên chạy (có thể vài chục giây lúc nạp model). Lỗi thì reject với `CommandError`, và trạng thái
+  // phiên là "error" kèm `sessionError`.
   toggle_session: { args: undefined; result: AppStatus };
   set_overlay_visible: { args: { visible: boolean }; result: AppStatus };
   set_overlay_locked: { args: { locked: boolean }; result: Settings };
@@ -126,6 +163,8 @@
   open_log_dir: { args: undefined; result: null };
   open_taskbar_settings: { args: undefined; result: null };
   open_login_items_settings: { args: undefined; result: null };
+  list_audio_sources: { args: undefined; result: AudioSourceOption[] };
+  open_audio_permission_settings: { args: undefined; result: null };
   get_overlay_view: { args: undefined; result: OverlayView };
 }
 
@@ -136,6 +175,9 @@
   "app://notice": AppNotice;
   "overlay://view": OverlayView;
   "subtitle://upsert": Subtitle;
+  "subtitle://delta": SubtitleDelta;
+  // Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
+  "audio://level": number;
 }
 
 export type Command = keyof Commands;
```

Sửa `src/store/app.ts` (áp bằng `git apply`):

```diff
--- a/src/store/app.ts
+++ b/src/store/app.ts
@@ -3,6 +3,7 @@
   AppInfo,
   AppNotice,
   AppStatus,
+  AudioSourceOption,
   CommandError,
   HotkeyAction,
   Ipc,
@@ -24,6 +25,14 @@
   field: string | null;
 }
 
+// Mức âm lượng (RMS 0–1) ra độ dài thanh đo 0–1, theo dBFS từ −60 dB tới 0 dB: tiếng nói bình thường (−30 tới −10 dBFS)
+// nằm giữa thanh, thay vì dồn sát đầu như khi vẽ thẳng RMS.
+export function levelToMeter(rms: number): number {
+  if (!(rms > 0)) return 0;
+  const db = 20 * Math.log10(rms);
+  return Math.min(1, Math.max(0, (db + 60) / 60));
+}
+
 export interface AppStoreState {
   settings: Settings | null;
   status: AppStatus | null;
@@ -35,6 +44,10 @@
   notice: AppNotice | null;
   // Lệnh Bắt đầu/Dừng đang chờ phía Rust trả lời: nút bị khóa, bấm thêm không gửi lệnh thứ hai.
   sessionPending: boolean;
+  // Mức âm lượng vào gần nhất (RMS), 0 khi không dịch.
+  level: number;
+  // Nguồn chọn được ở Cài đặt › Âm thanh; `null` là chưa đọc.
+  audioSources: AudioSourceOption[] | null;
   init(): Promise<() => void>;
   navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;
   setOnboardingStep(step: number): void;
@@ -47,6 +60,8 @@
   openLogDir(): Promise<void>;
   openTaskbarSettings(): Promise<void>;
   openLoginItemsSettings(): Promise<void>;
+  openAudioPermissionSettings(): Promise<void>;
+  loadAudioSources(): Promise<void>;
   finishOnboarding(): Promise<void>;
   dismissError(): void;
   dismissNotice(): void;
@@ -81,6 +96,14 @@
       }
     }
 
+    // Nhận một trạng thái mới, từ sự kiện `app://status` hay kết quả của một lệnh. Kết quả của lệnh có thể tới sau một
+    // sự kiện mới hơn: trạng thái có `rev` nhỏ hơn trạng thái đang có thì bỏ. Phiên không chạy thì mức âm lượng về 0.
+    function setStatus(status: AppStatus) {
+      const current = get().status;
+      if (current && status.rev < current.rev) return;
+      set(status.session === "running" ? { status } : { status, level: 0 });
+    }
+
     return {
       settings: null,
       status: null,
@@ -91,12 +114,15 @@
       error: null,
       notice: null,
       sessionPending: false,
+      level: 0,
+      audioSources: null,
 
       // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
       async init() {
         const listening = await Promise.allSettled([
           ipc.listen("settings://changed", (settings) => set({ settings })),
-          ipc.listen("app://status", (status) => set({ status })),
+          ipc.listen("app://status", (status) => setStatus(status)),
+          ipc.listen("audio://level", (level) => set({ level })),
           ipc.listen("app://navigate", (target: Navigate) => get().navigate(target.screen, target.settingsGroup)),
           ipc.listen("app://notice", (notice) => set({ notice })),
         ]);
@@ -110,7 +136,9 @@
             ipc.invoke("get_app_status"),
             ipc.invoke("get_app_info"),
           ]);
-          set({ settings, status, info });
+          // Cài đặt đã tới qua sự kiện trong lúc chờ `get_settings` thì mới hơn (hoặc bằng) kết quả của lệnh: giữ bản đó.
+          set({ settings: get().settings ?? settings, info });
+          setStatus(status);
         } catch (e) {
           off();
           throw e;
@@ -152,14 +180,21 @@
         }
       },
 
+      // Lỗi bắt đầu phiên nằm trong trạng thái (`session` "error", `sessionError`), Home hiện ngay dưới nút; chỉ lỗi
+      // khác (ví dụ lệnh bị chặn) mới lên thanh báo lỗi chung.
       async toggleSession() {
         if (get().sessionPending) return;
         set({ sessionPending: true });
         try {
-          await run(
-            () => ipc.invoke("toggle_session"),
-            (status) => set({ status }),
-          );
+          setStatus(await ipc.invoke("toggle_session"));
+          set({ error: null });
+        } catch (e) {
+          const status = await ipc.invoke("get_app_status").catch(() => null);
+          if (status?.session === "error") {
+            // Lỗi bắt đầu nằm trong trạng thái; thanh báo lỗi của lệnh trước không còn đúng (Nhỏ-8 của review 02 lần 3).
+            setStatus(status);
+            set({ error: null });
+          } else set({ error: toUiError(e) });
         } finally {
           set({ sessionPending: false });
         }
@@ -168,7 +203,7 @@
       async setOverlayVisible(visible) {
         await run(
           () => ipc.invoke("set_overlay_visible", { visible }),
-          (status) => set({ status }),
+          (status) => setStatus(status),
         );
       },
 
@@ -201,6 +236,20 @@
         );
       },
 
+      async openAudioPermissionSettings() {
+        await run(
+          () => ipc.invoke("open_audio_permission_settings"),
+          () => {},
+        );
+      },
+
+      async loadAudioSources() {
+        await run(
+          () => ipc.invoke("list_audio_sources"),
+          (audioSources) => set({ audioSources }),
+        );
+      },
+
       async finishOnboarding() {
         if (await get().updateSettings({ onboardingDone: true })) set({ screen: "home" });
       },
```

Thay toàn bộ `src/store/overlay.ts` bằng:

```ts
import { createStore } from "zustand/vanilla";
import type { AppStatus, Ipc, OverlayView, Subtitle, SubtitleDelta } from "../lib/ipc";

// Store của thanh phụ đề. Cửa sổ `overlay` chỉ đọc được phần cài đặt của nó (`get_overlay_view`)
// và nghe sự kiện; không gọi được lệnh nào khác (spec §10.2). Kế hoạch 03 làm đủ phần hiển thị.

// Giữ tối đa `max` phụ đề gần nhất, xếp theo `id` (id tăng theo thứ tự câu, và không trùng giữa các phiên nhờ `id_base`).
// Phụ đề cùng `id` (phụ đề tạm được thay, §6.3; bản dịch xong) cập nhật tại chỗ; phụ đề đã được gộp vào phụ đề mới
// (`replaces`, §7) thì bỏ. Phụ đề gộp mang id của câu đầu (nhỏ hơn câu mới đã hiện sau nó), nên nếu nó thay một dòng
// đang hiện thì vào đúng chỗ dòng đầu tiên bị thay (S1 của review 02 lần 2). Phụ đề khác không có trên thanh mà cũ hơn
// dòng đầu (bản dịch xong sau khi câu đó đã trôi khỏi thanh) thì bỏ qua; còn lại thì chèn đúng chỗ theo `id`.
export function upsertLine(lines: readonly Subtitle[], subtitle: Subtitle, max: number): Subtitle[] {
  const replaced = (l: Subtitle) => subtitle.replaces.includes(l.id);
  const kept = lines.filter((l) => !replaced(l));
  const i = kept.findIndex((l) => l.id === subtitle.id);
  const firstReplaced = lines.findIndex(replaced);
  let next: Subtitle[];
  if (i >= 0) {
    next = kept.map((l, j) => (j === i ? subtitle : l));
  } else if (firstReplaced >= 0) {
    const at = lines.slice(0, firstReplaced).filter((l) => !replaced(l)).length;
    next = [...kept.slice(0, at), subtitle, ...kept.slice(at)];
  } else {
    const first = kept[0];
    if (first && subtitle.id < first.id) return kept;
    const at = kept.findIndex((l) => l.id > subtitle.id);
    next = at < 0 ? [...kept, subtitle] : [...kept.slice(0, at), subtitle, ...kept.slice(at)];
  }
  return next.slice(-Math.max(1, max));
}

// Nối phần chữ dịch mới vào phụ đề cùng `id`. Phụ đề đã trôi khỏi thanh thì bỏ qua.
export function appendDelta(lines: readonly Subtitle[], delta: SubtitleDelta): Subtitle[] {
  return lines.map((l) => (l.id === delta.id ? { ...l, tgt_text: l.tgt_text + delta.text } : l));
}

export interface OverlayStoreState {
  view: OverlayView | null;
  status: AppStatus | null;
  lines: Subtitle[];
  init(): Promise<() => void>;
}

export function createOverlayStore(ipc: Ipc) {
  return createStore<OverlayStoreState>()((set, get) => ({
    view: null,
    status: null,
    lines: [],
    async init() {
      const offs = await Promise.all([
        ipc.listen("overlay://view", (view) => set({ view, lines: get().lines.slice(-view.lines) })),
        ipc.listen("subtitle://upsert", (subtitle) =>
          set({ lines: upsertLine(get().lines, subtitle, get().view?.lines ?? 3) }),
        ),
        ipc.listen("subtitle://delta", (delta) => set({ lines: appendDelta(get().lines, delta) })),
        // Trạng thái app (cùng `rev` như cửa sổ chính): bỏ trạng thái cũ tới muộn; phiên mới bắt đầu thì xóa phụ đề cũ.
        ipc.listen("app://status", (status) => {
          const prev = get().status;
          if (prev && status.rev < prev.rev) return;
          const fresh = status.session === "starting" && prev?.session !== "starting";
          set(fresh ? { status, lines: [] } : { status });
        }),
      ]);
      // Cài đặt mới hơn đã tới qua `overlay://view` trong lúc chờ thì giữ bản đó (N-3 của review 02 lần 2).
      const view = await ipc.invoke("get_overlay_view");
      if (!get().view) set({ view, lines: get().lines.slice(-view.lines) });
      return () => offs.forEach((off) => off());
    },
  }));
}
```

Sửa `src/windows/overlay/overlay.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/overlay/overlay.tsx
+++ b/src/windows/overlay/overlay.tsx
@@ -29,8 +29,10 @@
       {lines.length === 0 && <div className="waiting">{translate(view.uiLanguage, "overlay.waiting")}</div>}
       {lines.map((l) => (
         <div key={l.id} className={l.provisional ? "provisional" : undefined}>
-          {view.showSource && <div className="source">{l.src_text}</div>}
-          <div>{l.tgt_text}</div>
+          {/* Chưa có chữ dịch (đang dịch, cùng ngôn ngữ, dịch lỗi): hiện câu gốc một lần. Kế hoạch 03 thêm nhãn cho từng
+              trạng thái. */}
+          {view.showSource && l.tgt_text && <div className="source">{l.src_text}</div>}
+          <div>{l.tgt_text || l.src_text}</div>
         </div>
       ))}
     </div>
```

- [ ] **Step 4: Chạy test và build, thấy xanh**

Run: `pnpm test && pnpm build`
Expected:

```text
 Test Files  4 passed (4)
      Tests  61 passed (61)
```

```text
✓ built in 382ms
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ipc.ts \
  src/store/app.test.ts \
  src/store/app.ts \
  src/store/overlay.test.ts \
  src/store/overlay.ts \
  src/windows/overlay/overlay.tsx
git commit -m "feat(ui): kiểu và store cho phiên dịch thật, chữ dịch hiện dần trên thanh phụ đề" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Màn hình chính, Cài đặt › Âm thanh, bước quyền

Dòng 38, 46, 52, 87, 91:
- `src/lib/audioSource.ts`: giá trị của danh sách chọn nguồn, tên hiện cho từng nguồn (macOS: tên app, tiến trình WebKit thì "Safari và trang web trong các app khác" (N-9 của review 02 lần 2), không có thì bundle ID; Windows: tên thiết bị); nguồn đang chọn vẫn có trong danh sách dù lúc này không đọc thấy.
- `Home.tsx`: trạng thái (Sẵn sàng, Đang khởi động, Đang dịch, Lỗi), nút Bắt đầu/Hủy/Dừng (vẫn khóa khi lệnh đang gửi, `disabled={pending}` của 01), lỗi của phiên kèm nút mở System Settings khi thiếu quyền, cảnh báo nghi thiếu quyền khi phiên đang chạy mà chỉ nhận toàn im lặng (`permissionSuspected`), chỉ báo app đã chọn không còn phát tiếng (`waitingForApp`), nạp model và lần đầu chạy, chạy bằng CPU, đề xuất gói Nhẹ, chỉ báo, nguồn âm thanh, thanh đo âm lượng (component `LevelMeter` riêng, để mỗi lần mức âm lượng đổi chỉ vẽ lại thanh đo).
- `settings/AudioSettings.tsx`: nguồn âm thanh, độ nhạy ngắt câu 200–800 ms (lưu khi thả thanh trượt; áp dụng từ phiên sau).
- `onboarding/Onboarding.tsx`: bước 4 (chỉ macOS) giải thích quyền và có nút mở System Settings.
- `i18n`: câu tiếng Anh và tiếng Việt cho mọi chữ mới; câu nhắc tên app dùng "AI Translator".

**Files:**
- Sửa: `src/i18n/en.ts`
- Sửa: `src/i18n/vi.ts`
- Test (tạo): `src/lib/audioSource.test.ts`
- Tạo: `src/lib/audioSource.ts`
- Sửa: `src/styles/main.css`
- Sửa: `src/windows/main/onboarding/Onboarding.tsx`
- Sửa: `src/windows/main/screens/Home.tsx`
- Sửa: `src/windows/main/screens/SettingsScreen.tsx`
- Tạo: `src/windows/main/settings/AudioSettings.tsx`

- [ ] **Step 1: Viết test**

Tạo `src/lib/audioSource.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { translate } from "../i18n";
import { sourceChoices, sourceFromKey, sourceKey, sourceLabel } from "./audioSource";
import type { AudioSource, AudioSourceOption } from "./ipc";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate("vi", key, params);

describe("nguồn âm thanh", () => {
  it("giá trị của danh sách đổi qua lại được với cài đặt", () => {
    const sources: AudioSource[] = [
      { kind: "system" },
      { kind: "app", bundleId: "us.zoom.xos" },
      { kind: "device", id: "{0.0.0.00000000}.{a:b}" },
    ];
    for (const s of sources) expect(sourceFromKey(sourceKey(s))).toEqual(s);
  });

  it("nguồn đang chọn vẫn có trong danh sách dù lúc này không đọc thấy", () => {
    const options: AudioSourceOption[] = [{ kind: "app", bundleId: "com.microsoft.teams2", name: "Microsoft Teams" }];
    const zoom: AudioSource = { kind: "app", bundleId: "us.zoom.xos" };
    expect(sourceChoices(zoom, options).map(sourceKey)).toEqual(["system", "app:com.microsoft.teams2", "app:us.zoom.xos"]);
    expect(sourceChoices({ kind: "system" }, null).map(sourceKey)).toEqual(["system"]);
  });

  it("tên hiện: toàn hệ thống theo hệ điều hành, app theo tên (không có thì bundle ID), thiết bị theo tên", () => {
    const devices: AudioSourceOption[] = [{ kind: "device", id: "d1", name: "Loa (Realtek)" }];
    const apps: AudioSourceOption[] = [{ kind: "app", bundleId: "us.zoom.xos", name: "zoom.us" }];
    expect(sourceLabel({ kind: "system" }, "macos", null, t)).toBe("Toàn hệ thống, trừ app này");
    expect(sourceLabel({ kind: "system" }, "windows", null, t)).toBe("Thiết bị phát mặc định (tự động)");
    expect(sourceLabel({ kind: "app", bundleId: "us.zoom.xos" }, "macos", null, t)).toBe("Chỉ us.zoom.xos");
    expect(sourceLabel({ kind: "app", bundleId: "us.zoom.xos" }, "macos", apps, t)).toBe("Chỉ zoom.us");
    expect(sourceLabel(apps[0]!, "macos", null, t)).toBe("Chỉ zoom.us");
    expect(sourceLabel({ kind: "app", bundleId: "x.y", name: null }, "macos", null, t)).toBe("Chỉ x.y");
    expect(sourceLabel({ kind: "app", bundleId: "com.apple.WebKit.GPU", name: null }, "macos", null, t)).toBe(
      "Chỉ Safari và trang web trong các app khác",
    );
    expect(sourceLabel({ kind: "device", id: "d1" }, "windows", devices, t)).toBe("Loa (Realtek)");
    expect(sourceLabel({ kind: "device", id: "d2" }, "windows", devices, t)).toBe("d2");
  });
});
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `pnpm test`
Expected: `audioSource.test.ts` lỗi vì chưa có module:

```text
 Test Files  1 failed | 4 passed (5)
      Tests  61 passed (61)
 FAIL  src/lib/audioSource.test.ts [ src/lib/audioSource.test.ts ]
Error: Cannot find module './audioSource' imported from src/lib/audioSource.test.ts
```

- [ ] **Step 3: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -14,11 +14,24 @@
   "nav.about": "About",
 
   "status.idle": "Ready",
+  "status.starting": "Starting",
   "status.running": "Translating",
   "status.error": "Error",
 
   "home.start": "Start",
   "home.stop": "Stop",
+  "home.cancel": "Cancel",
+  "home.loading.model": "Loading models…",
+  "home.loading.firstRun": "Preparing for first use. This can take a few minutes.",
+  "home.cpuFallback": "Running on the CPU (slower).",
+  "home.suggestLite": "This computer ran out of memory. The Lite model pack is recommended.",
+  "home.lagging": "Falling behind: subtitles are late.",
+  "home.noAudio": "No audio heard for a while. Check that the meeting sound is playing.",
+  "home.waitingForApp": "The chosen app is not playing sound any more. Translation goes on as soon as it plays again.",
+  "home.translationUnavailable": "Translation is unavailable: only the original text is shown.",
+  "home.audioSource.app": "Only {app}",
+  "home.audioSource.webkit": "Safari and web pages inside other apps",
+  "home.audioSource.change": "Change",
   "home.languages": "Languages",
   "home.audioSource": "Audio source",
   "home.audioSource.system.macos": "Whole system, except this app",
@@ -55,10 +68,15 @@
   "settings.group.license": "License",
   "settings.group.privacy": "Privacy",
   "settings.subtitles.description": "Font size, number of lines, background opacity and original text.",
-  "settings.audio.description": "Audio source and how quickly a sentence is closed after a pause.",
   "settings.model.description": "Model pack in use, disk space, download again or delete.",
   "settings.license.description": "License key, status and expiry date, renew or deactivate.",
   "settings.privacy.description": "Saving history, delete all data, delete models and data.",
+  "settings.audio.source": "Audio source",
+  "settings.audio.refresh": "Refresh list",
+  "settings.audio.hint.macos": "Only apps that are playing sound right now are listed, together with their helper processes (browsers, Electron apps). With one app chosen, other sounds such as notifications are not translated. A new source applies from the next session.",
+  "settings.audio.hint.windows": "Automatic follows the default playback device and the communications device. Choose one device if your meeting app plays somewhere else. A new source applies from the next session.",
+  "settings.audio.pause": "Pause that ends a sentence",
+  "settings.audio.pause.hint": "Shorter: subtitles appear sooner, but sentences may be cut. Longer: fewer cuts, more delay. Applies from the next session.",
   "settings.general.uiLanguage": "Interface language",
   "settings.general.launchAtLogin": "Launch at login",
   "settings.general.launchAtLogin.hint": "The app starts in the menu bar or system tray, without opening this window.",
@@ -94,6 +112,7 @@
   "onboarding.model.title": "Check this computer and choose a model pack",
   "onboarding.download.title": "Download the model",
   "onboarding.permission.title": "Allow system audio recording",
+  "onboarding.permission.body": "macOS asks for permission the first time you start translating. If you refused, turn on AI Translator in System Settings › Privacy & Security › Screen & System Audio Recording, under System Audio Recording Only.",
   "onboarding.languages.title": "Choose your languages",
   "onboarding.test.title": "Try it",
   "onboarding.privacy.title": "Your privacy",
@@ -116,6 +135,8 @@
 
   "common.dismiss": "Dismiss",
   "common.notYet": "Not available yet.",
+  "common.openPermissionSettings": "Open System Settings",
+  "home.permissionSuspected": "Nothing is heard although an app is playing sound: AI Translator may not be allowed to record system audio.",
 
   "error.outOfRange": "This value is out of range.",
   "error.empty": "Choose at least one item.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -14,11 +14,24 @@
   "nav.about": "Giới thiệu",
 
   "status.idle": "Sẵn sàng",
+  "status.starting": "Đang khởi động",
   "status.running": "Đang dịch",
   "status.error": "Lỗi",
 
   "home.start": "Bắt đầu",
   "home.stop": "Dừng",
+  "home.cancel": "Hủy",
+  "home.loading.model": "Đang nạp model…",
+  "home.loading.firstRun": "Đang chuẩn bị lần đầu. Việc này có thể mất vài phút.",
+  "home.cpuFallback": "Đang chạy bằng CPU (chậm hơn).",
+  "home.suggestLite": "Máy không đủ bộ nhớ. Nên dùng gói Nhẹ.",
+  "home.lagging": "Đang trễ: phụ đề chậm hơn lời nói.",
+  "home.noAudio": "Một lúc lâu không nghe thấy âm thanh. Hãy kiểm tra âm thanh cuộc họp có đang phát không.",
+  "home.waitingForApp": "App đã chọn không còn phát tiếng. Phiên dịch chạy tiếp ngay khi app phát tiếng lại.",
+  "home.translationUnavailable": "Không dịch được: chỉ hiện câu gốc.",
+  "home.audioSource.app": "Chỉ {app}",
+  "home.audioSource.webkit": "Safari và trang web trong các app khác",
+  "home.audioSource.change": "Đổi",
   "home.languages": "Ngôn ngữ",
   "home.audioSource": "Nguồn âm thanh",
   "home.audioSource.system.macos": "Toàn hệ thống, trừ app này",
@@ -55,10 +68,15 @@
   "settings.group.license": "Bản quyền",
   "settings.group.privacy": "Quyền riêng tư",
   "settings.subtitles.description": "Cỡ chữ, số dòng, độ mờ nền và câu gốc.",
-  "settings.audio.description": "Nguồn âm thanh và độ nhạy ngắt câu.",
   "settings.model.description": "Gói model đang dùng, dung lượng, tải lại hoặc xóa.",
   "settings.license.description": "Key bản quyền, trạng thái và ngày hết hạn, gia hạn hoặc gỡ kích hoạt.",
   "settings.privacy.description": "Lưu lịch sử, xóa toàn bộ dữ liệu, xóa model và dữ liệu.",
+  "settings.audio.source": "Nguồn âm thanh",
+  "settings.audio.refresh": "Làm mới danh sách",
+  "settings.audio.hint.macos": "Danh sách chỉ có các app đang phát tiếng, gộp cả các tiến trình phụ của app (trình duyệt, app Electron). Khi chọn một app, các âm thanh khác như tiếng thông báo sẽ không được dịch. Đổi nguồn có tác dụng từ phiên dịch sau.",
+  "settings.audio.hint.windows": "Chế độ tự động theo thiết bị phát mặc định và thiết bị liên lạc. Chọn một thiết bị nếu app họp phát tiếng ra chỗ khác. Đổi nguồn có tác dụng từ phiên dịch sau.",
+  "settings.audio.pause": "Độ nhạy ngắt câu",
+  "settings.audio.pause.hint": "Ngắn hơn: phụ đề hiện sớm hơn nhưng câu dễ bị cắt. Dài hơn: ít bị cắt hơn nhưng trễ hơn. Áp dụng từ phiên dịch sau.",
   "settings.general.uiLanguage": "Ngôn ngữ giao diện",
   "settings.general.launchAtLogin": "Khởi động cùng hệ thống",
   "settings.general.launchAtLogin.hint": "App mở sẵn ở menu bar hoặc khay hệ thống, không mở cửa sổ này.",
@@ -94,6 +112,7 @@
   "onboarding.model.title": "Kiểm tra máy và chọn gói model",
   "onboarding.download.title": "Tải model",
   "onboarding.permission.title": "Cho phép ghi âm thanh hệ thống",
+  "onboarding.permission.body": "macOS hỏi quyền ở lần đầu bạn bắt đầu dịch. Nếu đã từ chối, hãy bật AI Translator trong System Settings › Privacy & Security › Screen & System Audio Recording, ở mục System Audio Recording Only.",
   "onboarding.languages.title": "Chọn ngôn ngữ",
   "onboarding.test.title": "Nghe thử",
   "onboarding.privacy.title": "Quyền riêng tư",
@@ -116,6 +135,8 @@
 
   "common.dismiss": "Đóng",
   "common.notYet": "Chưa có.",
+  "common.openPermissionSettings": "Mở System Settings",
+  "home.permissionSuspected": "Không nghe thấy gì dù có app đang phát tiếng: có thể AI Translator chưa được phép ghi âm thanh hệ thống.",
 
   "error.outOfRange": "Giá trị nằm ngoài phạm vi cho phép.",
   "error.empty": "Hãy chọn ít nhất một mục.",
```

Tạo `src/lib/audioSource.ts`:

```ts
import type { MessageKey } from "../i18n";
import type { AppInfo, AudioSource, AudioSourceOption } from "./ipc";

// Nguồn âm thanh ở màn hình chính và Cài đặt › Âm thanh (§4.3, §6.1).

// Giá trị của `<select>` cho một nguồn: "system", "app:<bundle id>", "device:<id>".
export function sourceKey(source: AudioSource | AudioSourceOption): string {
  switch (source.kind) {
    case "system":
      return "system";
    case "app":
      return `app:${source.bundleId}`;
    case "device":
      return `device:${source.id}`;
  }
}

export function sourceFromKey(key: string): AudioSource {
  if (key.startsWith("app:")) return { kind: "app", bundleId: key.slice(4) };
  if (key.startsWith("device:")) return { kind: "device", id: key.slice(7) };
  return { kind: "system" };
}

// Các lựa chọn của danh sách: "toàn hệ thống", các nguồn đọc được lúc này, và nguồn đang chọn nếu lúc này không có
// (app họp chưa phát tiếng, thiết bị đã rút), để danh sách không tự đổi cài đặt.
export function sourceChoices(
  current: AudioSource,
  options: readonly AudioSourceOption[] | null,
): (AudioSource | AudioSourceOption)[] {
  const list: (AudioSource | AudioSourceOption)[] = [{ kind: "system" }, ...(options ?? [])];
  if (!list.some((o) => sourceKey(o) === sourceKey(current))) list.push(current);
  return list;
}

// Tên hiện cho một nguồn. App (macOS): tên hiển thị của app (đọc từ gói `.app`) nếu biết, từ chính lựa chọn hay từ danh
// sách đã đọc; tiến trình của WebKit (`com.apple.WebKit.GPU`, phát tiếng cho Safari và mọi WebView, không nằm trong gói
// `.app` nào) có tên riêng dễ hiểu (N-9 của review 02 lần 2); không thì bundle ID. Thiết bị (Windows): tên thiết bị nếu
// danh sách đã đọc, không thì id.
export function sourceLabel(
  source: AudioSource | AudioSourceOption,
  platform: AppInfo["platform"],
  options: readonly AudioSourceOption[] | null,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  switch (source.kind) {
    case "system":
      return t(platform === "macos" ? "home.audioSource.system.macos" : "home.audioSource.system.windows");
    case "app": {
      const own = "name" in source ? source.name : null;
      const found = options?.find((o) => o.kind === "app" && o.bundleId === source.bundleId);
      const name = own ?? (found?.kind === "app" ? found.name : null);
      const webkit = source.bundleId.startsWith("com.apple.WebKit.") ? t("home.audioSource.webkit") : null;
      return t("home.audioSource.app", { app: name ?? webkit ?? source.bundleId });
    }
    case "device": {
      if ("name" in source) return source.name;
      const found = options?.find((o) => o.kind === "device" && o.id === source.id);
      return found?.kind === "device" ? found.name : source.id;
    }
  }
}
```

Sửa `src/styles/main.css` (áp bằng `git apply`):

```diff
--- a/src/styles/main.css
+++ b/src/styles/main.css
@@ -152,6 +152,15 @@
   border-color: var(--color-running);
 }
 
+.badge.error {
+  color: var(--color-danger);
+  border-color: var(--color-danger);
+}
+
+meter {
+  width: 12rem;
+}
+
 .notice {
   display: flex;
   align-items: center;
```

Sửa `src/windows/main/onboarding/Onboarding.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/onboarding/Onboarding.tsx
+++ b/src/windows/main/onboarding/Onboarding.tsx
@@ -70,6 +70,7 @@
   const settings = useApp((s) => s.settings);
   const update = useApp((s) => s.updateSettings);
   const openTaskbarSettings = useApp((s) => s.openTaskbarSettings);
+  const openPermission = useApp((s) => s.openAudioPermissionSettings);
   switch (step) {
     // Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (bước 5 đổi lại được).
     case "language":
@@ -87,6 +88,17 @@
             </label>
           ))}
         </div>
+      );
+    // Bước 4, chỉ macOS: quyền "Ghi âm thanh hệ thống" (§4.1). macOS tự hỏi ở lần đầu tạo tap; bước này nói trước cho
+    // người dùng biết, và mở sẵn trang cài đặt cho ai đã lỡ từ chối.
+    case "permission":
+      return (
+        <>
+          <p>{t("onboarding.permission.body")}</p>
+          <div className="row">
+            <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
+          </div>
+        </>
       );
     case "languages":
       return <LanguagePicker />;
```

Thay toàn bộ `src/windows/main/screens/Home.tsx` bằng:

```tsx
import { errorKey, type MessageKey } from "../../../i18n";
import { sourceLabel } from "../../../lib/audioSource";
import type { SessionStatus } from "../../../lib/ipc";
import { levelToMeter } from "../../../store/app";
import { useApp, useT } from "../appStore";
import { LanguagePicker } from "../LanguagePicker";

const BADGE: Record<SessionStatus, MessageKey> = {
  idle: "status.idle",
  starting: "status.starting",
  running: "status.running",
  error: "status.error",
};

// Nút chính: đang khởi động thì bấm là hủy (`session::toggle`).
const BUTTON: Record<SessionStatus, MessageKey> = {
  idle: "home.start",
  starting: "home.cancel",
  running: "home.stop",
  error: "home.start",
};

// Màn hình chính (§4.3): bắt đầu/dừng, trạng thái và lỗi của phiên, ngôn ngữ, nguồn âm thanh, mức âm lượng.
// Kế hoạch 06 điền số phút còn lại.
export function Home() {
  const t = useT();
  const status = useApp((s) => s.status);
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const audioSources = useApp((s) => s.audioSources);
  const toggleSession = useApp((s) => s.toggleSession);
  const pending = useApp((s) => s.sessionPending);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const setLocked = useApp((s) => s.setOverlayLocked);
  const navigate = useApp((s) => s.navigate);
  const openPermission = useApp((s) => s.openAudioPermissionSettings);
  if (!status || !settings || !info) return null;
  const session = status.session;
  const notes: MessageKey[] = [];
  if (status.loading) notes.push(status.loading === "firstRun" ? "home.loading.firstRun" : "home.loading.model");
  if (status.cpuFallback) notes.push("home.cpuFallback");
  if (status.suggestLite) notes.push("home.suggestLite");
  if (session === "running") {
    if (status.indicators.lagging) notes.push("home.lagging");
    if (status.indicators.noAudio) notes.push("home.noAudio");
    if (status.waitingForApp) notes.push("home.waitingForApp");
    if (status.indicators.translationUnavailable) notes.push("home.translationUnavailable");
  }
  return (
    <>
      <div className="card">
        <div className="row">
          <span className={`badge ${session}`}>{t(BADGE[session])}</span>
          <button className="primary" disabled={pending} onClick={() => void toggleSession()}>
            {t(BUTTON[session])}
          </button>
        </div>
        {session === "error" && status.sessionError && (
          <div className="row" role="alert">
            <span className="error-text">{t(errorKey(status.sessionError))}</span>
            {status.sessionError === "audioPermission" && info.platform === "macos" && (
              <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
            )}
          </div>
        )}
        {session === "running" && status.permissionSuspected && info.platform === "macos" && (
          <div className="row" role="alert">
            <span className="error-text">{t("home.permissionSuspected")}</span>
            <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
          </div>
        )}
        {notes.map((key) => (
          <p key={key} className="hint" role="status">
            {t(key)}
          </p>
        ))}
      </div>
      <div className="card">
        <h2>{t("home.languages")}</h2>
        <LanguagePicker />
      </div>
      <div className="card">
        <div className="row">
          <span>{t("home.audioSource")}</span>
          <span>{sourceLabel(settings.audioSource, info.platform, audioSources, t)}</span>
          <button onClick={() => navigate("settings", "audio")}>{t("home.audioSource.change")}</button>
        </div>
        <div className="row">
          <span>{t("home.inputLevel")}</span>
          <LevelMeter label={t("home.inputLevel")} />
        </div>
        <div className="row">
          <span>{t("home.minutesLeft")}</span>
          <span className="hint">{t("common.notYet")}</span>
        </div>
      </div>
      <div className="card">
        <div className="row">
          <span>{t("home.overlay")}</span>
          <button onClick={() => void setVisible(!status.overlayVisible)}>
            {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
          </button>
          <button onClick={() => void setLocked(!settings.overlay.locked)}>
            {t(settings.overlay.locked ? "home.overlay.unlock" : "home.overlay.lock")}
          </button>
        </div>
      </div>
    </>
  );
}

// Thanh mức âm lượng: tự theo `level` (khoảng 10 lần mỗi giây), để phần còn lại của màn hình chính không vẽ lại theo.
function LevelMeter({ label }: { label: string }) {
  const running = useApp((s) => s.status?.session === "running");
  const level = useApp((s) => s.level);
  return <meter min={0} max={1} value={running ? levelToMeter(level) : 0} aria-label={label} />;
}
```

Sửa `src/windows/main/screens/SettingsScreen.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/screens/SettingsScreen.tsx
+++ b/src/windows/main/screens/SettingsScreen.tsx
@@ -2,15 +2,15 @@
 import type { MessageKey } from "../../../i18n";
 import type { SettingsGroup } from "../../../lib/ipc";
 import { useApp, useT } from "../appStore";
+import { AudioSettings } from "../settings/AudioSettings";
 import { GeneralSettings } from "../settings/GeneralSettings";
 import { HotkeySettings } from "../settings/HotkeySettings";
 
 const GROUPS: readonly SettingsGroup[] = ["general", "subtitles", "audio", "model", "hotkeys", "license", "privacy"];
 
-// Nhóm do kế hoạch khác làm: Phụ đề (03), Âm thanh (02), Model (04), Bản quyền (06), Quyền riêng tư (03, 04).
+// Nhóm do kế hoạch khác làm: Phụ đề (03), Model (04), Bản quyền (06), Quyền riêng tư (03, 04).
 const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {
   subtitles: "settings.subtitles.description",
-  audio: "settings.audio.description",
   model: "settings.model.description",
   license: "settings.license.description",
   privacy: "settings.privacy.description",
@@ -66,6 +66,7 @@
         tabIndex={description ? 0 : undefined}
       >
         {group === "general" && <GeneralSettings />}
+        {group === "audio" && <AudioSettings />}
         {group === "hotkeys" && <HotkeySettings />}
         {description && (
           <div className="card">
```

Tạo `src/windows/main/settings/AudioSettings.tsx`:

```tsx
import { useEffect, useState } from "react";
import { sourceChoices, sourceFromKey, sourceKey, sourceLabel } from "../../../lib/audioSource";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Âm thanh" (§4.3): nguồn âm thanh (§6.1) và độ nhạy ngắt câu (200–800 ms, §6.3).
export function AudioSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const options = useApp((s) => s.audioSources);
  const load = useApp((s) => s.loadAudioSources);
  const update = useApp((s) => s.updateSettings);
  const [pause, setPause] = useState<number | null>(null);
  useEffect(() => {
    void load();
  }, [load]);
  if (!settings || !info) return null;
  const pauseMs = pause ?? settings.vadEndSilenceMs;
  const commitPause = () => {
    if (pause !== null && pause !== settings.vadEndSilenceMs) void update({ vadEndSilenceMs: pause });
    setPause(null);
  };
  return (
    <div className="card">
      <div className="row">
        <label htmlFor="audio-source">{t("settings.audio.source")}</label>
        <select
          id="audio-source"
          value={sourceKey(settings.audioSource)}
          onChange={(e) => void update({ audioSource: sourceFromKey(e.target.value) })}
        >
          {sourceChoices(settings.audioSource, options).map((o) => (
            <option key={sourceKey(o)} value={sourceKey(o)}>
              {sourceLabel(o, info.platform, options, t)}
            </option>
          ))}
        </select>
        <button onClick={() => void load()}>{t("settings.audio.refresh")}</button>
      </div>
      <p className="hint">{t(info.platform === "macos" ? "settings.audio.hint.macos" : "settings.audio.hint.windows")}</p>
      <div className="row">
        <label htmlFor="vad-end-silence">{t("settings.audio.pause")}</label>
        <input
          id="vad-end-silence"
          type="range"
          min={200}
          max={800}
          step={50}
          value={pauseMs}
          onChange={(e) => setPause(Number(e.target.value))}
          onPointerUp={commitPause}
          onKeyUp={commitPause}
          onBlur={commitPause}
        />
        <span>{pauseMs} ms</span>
      </div>
      <p className="hint">{t("settings.audio.pause.hint")}</p>
    </div>
  );
}
```

- [ ] **Step 4: Chạy test và build, thấy xanh**

Run: `pnpm test && pnpm build && cargo test -p meeting-translator --lib errors`
Expected:

```text
 Test Files  5 passed (5)
      Tests  64 passed (64)
```

```text
✓ built in 77ms
```

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/vi.ts \
  src/lib/audioSource.test.ts \
  src/lib/audioSource.ts \
  src/styles/main.css \
  src/windows/main/onboarding/Onboarding.tsx \
  src/windows/main/screens/Home.tsx \
  src/windows/main/screens/SettingsScreen.tsx \
  src/windows/main/settings/AudioSettings.tsx
git commit -m "feat(ui): màn hình chính theo phiên thật, Cài đặt › Âm thanh, bước quyền ghi âm thanh hệ thống" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: Kiểm code Windows trên Mac, và kiểm tra chuẩn

`scripts/check-windows.sh` kiểm thêm `pipeline` và `audio-capture`, với pkg-config giả của 02d Task 1 (QĐ15), và nhận thêm tham số cho cargo.

**Files:**
- Sửa: `scripts/check-windows.sh`

- [ ] **Step 1: Sửa script**

Thay toàn bộ `scripts/check-windows.sh` bằng:

```bash
#!/bin/sh
# Kiểm kiểu và clippy phần code Windows của app ngay trên Mac (R1 của kế hoạch 00), vì chưa có máy
# Windows. Chỉ kiểm được là code biên dịch được; hành vi thật (khay, Alt+F4, thanh phụ đề topmost,
# Credential Manager, WASAPI loopback, Job Object) vẫn phải thử trên Windows.
# Cần một lần: rustup target add x86_64-pc-windows-msvc
# Tham số thêm được chuyển cho cargo (ví dụ `--locked`).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
# tauri-build gọi trình biên dịch resource (xem fake-llvm-rc).
export RC_x86_64_pc_windows_msvc="$here/fake-llvm-rc"
# onig_sys (candle-core → tokenizers) muốn biên dịch thư viện C oniguruma cho Windows (xem fake-pkg-config).
export PKG_CONFIG_x86_64_pc_windows_msvc="$here/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1
cargo clippy -p meeting-translator -p pipeline -p audio-capture --target x86_64-pc-windows-msvc --all-targets "$@" \
  -- -D warnings
```

- [ ] **Step 2: Chạy**

Run: `./scripts/check-windows.sh`
Expected: dòng cuối `Finished \`dev\` profile`, không có cảnh báo:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.23s
```

- [ ] **Step 3: Kiểm tra chuẩn** (mục 6.2 của kế hoạch 00)

Run:
```bash
cargo fmt --all -- --check
pnpm install --frozen-lockfile
pnpm build
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --workspace
cargo test -p asr-worker --features shared-encode
cargo build --release -p asr-worker --features metal,shared-encode
cargo deny check && cargo audit
pnpm test
pnpm audit
```
Expected: không lỗi, clippy không cảnh báo, `cargo deny check` in `advisories ok, bans ok, licenses ok, sources ok`, `cargo audit` chỉ còn 3 cảnh báo đã được cho phép, `pnpm audit` in `No known vulnerabilities found`. Tổng số test của `cargo test --workspace`:

```text
passed 490 failed 0 ignored 10
```

Và `pnpm test`:

```text
 Test Files  5 passed (5)
      Tests  64 passed (64)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check-windows.sh
git commit -m "chore(app): check-windows.sh kiểm cả pipeline và audio-capture" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Thử trên Mac với âm thanh thật (cần người)

Bàn giao chính của kế hoạch 02 (mục 2.2 của kế hoạch 00): bấm Bắt đầu là có phụ đề dịch từ âm thanh hệ thống. Agent không tự chạy app và không bật hộp thoại quyền (mục 6.8): agent chuẩn bị, đưa từng bước cho người, ghi kết quả. Dòng 25, 32, 38, 43, 61, 79, 230, 232, 305 (và C1; Q9 của review 02c).

**Cần người thao tác:** cả task. Chạy app bằng `scripts/run-dev-app.sh` (Task 4): gói `.app` mở bằng `open`, nên macOS tính quyền ghi âm thanh hệ thống cho chính app (Q-D của review 02 lần 2). Không dùng `pnpm tauri dev` hay `scripts/run-dev-signed.sh` cho các bước có quyền: hai cách đó chạy binary từ Terminal, và quyền lại tính cho Terminal (kế hoạch 0-04, Task 5). Script ký bằng chứng thư cố định (R8, `MT_DEV_SIGN_IDENTITY`), nên không phải cấp quyền lại sau mỗi lần build. Gói có cả `en.lproj` và `vi.lproj`: máy đặt tiếng Việt thì câu xin quyền là tiếng Việt.

**Files:**
- Create: `bench/phase0/results/gd1_app_mac.md`

- [ ] **Step 1: Agent chuẩn bị**

Run:
```bash
ls models/ggml-large-v3-turbo-q5_0.bin models/Hy-MT2-1.8B-Q8_0.gguf models/silero_vad_v6.2.3.onnx
ls src-tauri/binaries | wc -l
pgrep -l -f 'asr-worker|llama-server' || echo "không có tiến trình phụ nào"
```
Expected: ba file model; 12 file trong `binaries/` (02c Task 1 Step 6; chưa có thì chạy lại bước đó); không có tiến trình phụ nào đang chạy.

- [ ] **Step 2: Người chạy app** (`scripts/run-dev-app.sh`)

Expected: cửa sổ chính hiện. Trong khoảng 10–20 giây, `pgrep -l -f 'asr-worker|llama-server'` có đủ hai tiến trình (chạy sẵn khi mở cửa sổ chính, Đ19). Lần đầu chạy binary mới, màn hình chính có dòng "Đang chuẩn bị lần đầu".

- [ ] **Step 3: Lần đầu chạy: Hủy và Thoát lúc đang chuẩn bị**

Agent xóa `sidecars-seen.json` trong thư mục dữ liệu của app (`~/Library/Application Support/com.aitranslator.desktop/`) để lần chạy sau được coi là lần đầu.
- Người mở app, bấm Bắt đầu, rồi bấm Hủy khi màn hình còn "Đang chuẩn bị lần đầu". Expected: trạng thái về "Sẵn sàng" ngay (dưới 1 giây); không có lỗi. Bấm Bắt đầu lại ngay, khi lần đã hủy còn đang nạp model. Expected: màn hình hiện "Đang khởi động" ngay, nút không bị treo; phiên chạy khi nạp xong (Q-E của review 02 lần 2).
- Xóa lại file đó, mở app, bấm Bắt đầu, rồi chọn Thoát ở menu khay khi còn đang chuẩn bị. Expected: app đóng trong khoảng 1 giây; `pgrep -l -f 'asr-worker|llama-server'` không in gì.

- [ ] **Step 4: Bắt đầu và cấp quyền**

Người mở một video có người nói tiếng Anh (ví dụ bản tin) trong Safari hoặc Chrome, rồi bấm Bắt đầu.
Expected:
- Thanh phụ đề hiện. Lần đầu, macOS hỏi quyền ghi âm thanh với câu trong `Info.plist` của gói (có tên AI Translator; tiếng Việt nếu máy đặt tiếng Việt). Hộp thoại phải nói "AI Translator", không phải "Terminal"; nói Terminal thì app không được mở bằng `run-dev-app.sh`, dừng lại. Người bấm "Don't Allow". Expected: màn hình chính báo "AI Translator chưa được phép ghi âm thanh hệ thống." kèm nút "Mở System Settings", hoặc (nếu tap vẫn tạo được mà chỉ nhận toàn im lặng) cảnh báo "Không nghe thấy gì dù có app đang phát tiếng…" sau khoảng 3 giây. Ghi lại trường hợp nào xảy ra (dòng 2 của C1).
- Người bật quyền trong System Settings. macOS có thể hiện hộp thoại "Quit & Reopen": bấm nút đó, rồi ghi lại là có hộp thoại này. Bấm Bắt đầu lại.
- Trong khoảng 2 giây sau mỗi câu, phụ đề tiếng Việt hiện, chữ dịch hiện dần; câu chưa chốt nhạt hơn rồi được thay bằng bản dịch của cả câu.
- Thanh đo âm lượng ở màn hình chính chạy theo tiếng.

- [ ] **Step 5: Các thao tác của phiên**
- Đổi sang video tiếng Việt. Expected: phụ đề là câu gốc, không dịch (`same_lang`).
- Bấm Dừng ngay sau khi người trong video nói xong một câu. Expected: câu cuối vẫn có bản dịch (dịch nốt trong khoảng 3 giây); thanh phụ đề còn nguyên; trạng thái "Sẵn sàng". Bấm Bắt đầu lại: chạy ngay, không nạp lại model.
- Bắt đầu và dừng bằng phím tắt (mặc định `Ctrl+Alt+T`) và bằng menu khay. Expected: như nút.
- Bấm phím tắt rồi bấm ngay mục Bắt đầu/Dừng ở menu khay (gần như cùng lúc), lặp vài lần. Expected: trạng thái ở màn hình chính, khay và thanh phụ đề luôn khớp nhau; không có phiên nào chạy mà màn hình báo "Sẵn sàng".
- Trong lúc dịch, cắm tai nghe có dây, rồi rút ra. Expected: phụ đề tiếp tục sau tối đa khoảng 2 giây mỗi lần (§9).
- Trong lúc dịch, nối AirPods, rồi tắt AirPods (cất vào hộp). Expected: như trên; tiếng về loa máy vẫn có phụ đề.
- Tạm dừng video hơn 60 giây. Expected: màn hình chính hiện "Một lúc lâu không nghe thấy âm thanh…", nhưng **không** hiện cảnh báo nghi thiếu quyền (đã có âm thanh thật trong phiên, Q-B của review 02 lần 2). Agent tìm trong log của app các dòng `số liệu thu` ghi trong lúc tạm dừng: số khung đứng yên khi không app nào phát (tiền đề của `StallWatch`, Q-G); ghi hai dòng liên tiếp vào kết quả.
- Trong lúc dịch, cho máy ngủ (đóng nắp hoặc Apple menu › Sleep) 5 phút rồi mở lại, phát tiếp video. Expected: phụ đề tiếp tục trong vài giây (nếu tap đã chết, log có dòng "không có khung mới … mở lại nguồn âm thanh"), hoặc phiên dừng với một lỗi có câu rõ ràng; không treo, không crash. Ghi lại trường hợp nào.

- [ ] **Step 6: Cài đặt › Âm thanh**
- Mở danh sách nguồn khi video đang phát trong Chrome và trong Safari. Expected: có "Google Chrome" (một dòng dù có nhiều tiến trình helper, bundle ID `com.google.Chrome`, không phải `…helper`) và "Safari và trang web trong các app khác" (Safari phát tiếng qua tiến trình WebKit). Agent chạy `cargo test -p audio-capture --lib -- --ignored print_the_playing_apps --nocapture` trong lúc đó và chép bảng in ra (tên, bundle ID, pid) vào kết quả (Q-F của review 02 lần 2).
- Chọn Chrome, bắt đầu phiên, rồi phát tiếng ở app khác. Expected: chỉ tiếng của Chrome có phụ đề. Mở thêm một tab phát tiếng trong Chrome (tiến trình helper mới). Expected: tab mới cũng có phụ đề sau vài giây (log có dòng "tiến trình đang phát … đã đổi"). Đóng Chrome trong lúc dịch. Expected: phiên **không** dừng; màn hình chính hiện "App đã chọn không còn phát tiếng…"; mở lại Chrome và phát tiếng thì chỉ báo tắt và có phụ đề trở lại (Q-C của review 02 lần 2).
- Chọn một app không phát tiếng, bắt đầu phiên. Expected: lỗi "App đã chọn không phát tiếng…".
- Kéo "Độ nhạy ngắt câu" lên 800 ms. Expected: phiên sau câu bị cắt ít hơn, phụ đề hiện chậm hơn một chút.

- [ ] **Step 7: Thiếu quyền và trang System Settings**

Người tắt quyền của app trong System Settings › Privacy & Security › Screen & System Audio Recording (mục System Audio Recording Only), rồi bấm Bắt đầu.
Expected: màn hình chính báo "AI Translator chưa được phép ghi âm thanh hệ thống." kèm nút "Mở System Settings" (hoặc cảnh báo nghi thiếu quyền như Step 4); bấm nút thì mở đúng phần "System Audio Recording Only". Trong Terminal, người thử thêm hai neo dưới đây, ghi neo nào mở đúng trang, rồi agent đặt neo đó vào `system::AUDIO_PERMISSION_URL` (điểm cần quyết 3 của 02a):
```bash
open "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture"
open "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AudioCapture"
```
Bật lại quyền sau bước này.

- [ ] **Step 8: Tiến trình phụ và model bị thay đổi**

Tiến trình phụ đang chạy (chạy sẵn khi mở cửa sổ chính, Đ19) thì bước chuẩn bị trả về ngay mà không kiểm lại binary, nên ca sửa byte phải làm khi app đã thoát. Không chạy lại `run-dev-app.sh` sau khi sửa: script build lại, và `build.rs` băm lại file đã sửa. Agent không mở app (mục 6.8): agent sửa file, người mở app.

1. Người thoát app ở menu khay (`run-dev-app.sh` kết thúc, Vite cũng dừng).
2. Agent sửa một byte trong `src-tauri/binaries/libggml.0.dylib`: `printf '\x00' | dd of=src-tauri/binaries/libggml.0.dylib bs=1 seek=4096 count=1 conv=notrunc`.
3. Người chạy Vite và mở lại đúng gói đã build, không build lại; app thoát thì tắt Vite:
   ```bash
   pnpm dev >/dev/null 2>&1 & vite=$!
   until curl -sf http://localhost:1420 >/dev/null; do sleep 0.2; done
   open -W "${CARGO_TARGET_DIR:-target}/AI Translator Dev.app"; kill "$vite"
   ```
4. Người bấm Bắt đầu ở menu khay. Expected: lỗi `sidecarTampered` ("Một phần của app đã bị thay đổi hoặc hỏng…"); không tiến trình phụ nào được chạy. Agent chạy lại `./scripts/copy-sidecars.sh`.
5. Agent đổi tên model dịch: `m="${MT_MODELS_DIR:-models}"; mv -n "$m/Hy-MT2-1.8B-Q8_0.gguf" "$m/mt-original.gguf"`. Người bấm Bắt đầu. Expected: lỗi `modelMissing`. Agent trả lại: `mv -n "$m/mt-original.gguf" "$m/Hy-MT2-1.8B-Q8_0.gguf"`.
6. Ca bỏ cuộc thật bên trong giám sát (Q4-1 của review 02 lần 4). Trước hết `pgrep -l -f 'asr-worker|llama-server'` phải không in gì: tiến trình phụ đang chạy (chạy sẵn khi mở cửa sổ chính, Đ19) thì bước chuẩn bị trả về ngay và ca này không đạt. Nếu `pgrep` có in, người thoát app ở menu khay, agent đặt file rác như dưới đây **trước**, rồi người mở lại như mục 3: lần chạy sẵn khi mở cửa sổ chính tự bỏ cuộc vì model rác, và bấm Bắt đầu vẫn ra đúng Expected. Agent chuyển model nhận dạng sang chỗ khác và đặt vào chỗ cũ một file rác cùng tên; `mv -n` không bao giờ đè lên model thật nếu bước này bị chạy lại:
   ```bash
   m="${MT_MODELS_DIR:-models}"
   mv -n "$m/ggml-large-v3-turbo-q5_0.bin" "$m/turbo-original.bin"
   [ -e "$m/turbo-original.bin" ] && [ ! -e "$m/ggml-large-v3-turbo-q5_0.bin" ] && head -c 1048576 /dev/urandom > "$m/ggml-large-v3-turbo-q5_0.bin"
   ```
   Người bấm Bắt đầu ở menu khay. Expected: lỗi `modelBroken` (bản GPU nạp lỗi thì chạy bằng CPU, nạp lỗi nữa thì bỏ cuộc).
7. Agent trả model thật về: `m="${MT_MODELS_DIR:-models}"; [ -e "$m/turbo-original.bin" ] && rm "$m/ggml-large-v3-turbo-q5_0.bin" && mv -n "$m/turbo-original.bin" "$m/ggml-large-v3-turbo-q5_0.bin"`. Người bấm Bắt đầu, không khởi động lại app. Expected: phiên chạy, phụ đề hiện, màn hình chính không còn "Đang chạy bằng CPU" (thử lại sau khi bỏ cuộc là bắt đầu lại từ đầu, kể cả GPU: R3-1 của review 02 lần 3, Q4-2 của review 02 lần 4).

- [ ] **Step 9: Thoát, Force Quit và tắt khi rảnh**
- Thoát ở menu khay. Expected: `pgrep -l -f 'asr-worker|llama-server'` không in gì (dòng 61, 305).
- Mở lại app, bấm Bắt đầu, rồi Force Quit (Apple menu › Force Quit). Ghi pid của tiến trình phụ còn lại (`pgrep -l -f 'asr-worker|llama-server'`). Mở lại app. Expected: các pid đã ghi không còn; log của app có dòng "đã kill … tiến trình phụ còn sót từ lần chạy trước" (QĐ8).
- Mở cửa sổ chính, không dịch gì trong 10 phút. Expected: sau 10–11 phút, `pgrep` không còn tiến trình phụ (§5).

- [ ] **Step 10: Log**

Mở Giới thiệu › Mở thư mục log, tìm vài chữ đã xuất hiện trong phụ đề ở Step 4 (`grep -ri '<chữ>' ~/Library/Logs/com.aitranslator.desktop/`).
Expected: không tìm thấy; log chỉ có trạng thái và số đo của phiên (dòng 315).

- [ ] **Step 11 (tùy chọn): Phiên dài**

Một phiên 2 giờ với âm thanh cuộc họp. Ở phút 60 và phút 120: `ps -o pid,rss,comm -p $(pgrep -d, -f 'meeting-translator|asr-worker|llama-server')`.
Expected: không crash; RSS ở phút 120 không lớn hơn phút 60 quá 10% (A5, 08 đo chính thức).

- [ ] **Step 12: Ghi kết quả và commit**

Ghi vào `bench/phase0/results/gd1_app_mac.md`: máy, macOS, commit, và mỗi bước một dòng (đạt, không đạt, ghi chú); bước không đạt thì kèm đoạn log liên quan.

```bash
git add bench/phase0/results/gd1_app_mac.md
git commit -m "test(app): thử phiên dịch thật trên Mac" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: Đợt Windows (cần máy Windows và người)

Làm khi có máy Windows, theo thứ tự ở mục 3 của kế hoạch 00 ("Đợt Windows"), sau kế hoạch 0-01 Task 2, 0-03 Task 14–16, 0-04 Task 7–8 và 0-05 Task 4. Dòng 82, 85–88, 101, 105, 131, 137, 236, 302, 304 (C2, C3, C4).

**Files:**
- Create: `bench/phase0/results/gd1_app_windows.md`

- [ ] **Step 1: Build và test** (PowerShell, gốc repo)

```powershell
cargo test --workspace
cargo test -p audio-capture --lib -- --include-ignored the_default_device_is_listed
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: mọi test qua, kể cả test `#[cfg(windows)]` của `audio-capture`, `pipeline` (Job Object) và app (file đã kiểm bị khóa ghi); không có cảnh báo.

- [ ] **Step 2: Chép tiến trình phụ**

Build hai bản `asr-worker` theo kế hoạch 0-03 Task 14 Step 3, rồi chép vào `src-tauri\binaries\` với tên kèm triple, cùng mọi DLL của bản `llama-server` b11146 Vulkan (`bench/phase0/fetch.py` giải nén vào `tools\llama-b11146\win-vulkan-x64\`):

```powershell
$t = "x86_64-pc-windows-msvc"; $b = "src-tauri\binaries"
$l = (Get-ChildItem -Recurse tools\llama-b11146\win-vulkan-x64 -Filter llama-server.exe | Select-Object -First 1).DirectoryName
New-Item -ItemType Directory -Force $b | Out-Null; Remove-Item "$b\*" -Force
Copy-Item target\asr-worker-vulkan.exe "$b\asr-worker-vulkan-$t.exe"
Copy-Item target\asr-worker-cpu.exe "$b\asr-worker-cpu-$t.exe"
Copy-Item "$l\llama-server.exe" "$b\llama-server-$t.exe"
Copy-Item "$l\*.dll" $b
Get-ChildItem $b | Select-Object Name, Length
```
Expected: ba file `.exe` và các DLL của ggml và llama.

- [ ] **Step 3: Chạy app với âm thanh thật** (`pnpm tauri dev`), ghi từng mục:
- Teams, Zoom, Google Meet (Chrome, Edge), Zalo PC: phụ đề hiện (A1, C2).
- Chế độ tự động: tai nghe làm thiết bị Communications khác thiết bị mặc định: cả hai luồng đều có phụ đề.
- Cài đặt › Âm thanh: danh sách thiết bị phát có tên; chọn một thiết bị thì chỉ thu thiết bị đó.
- Cắm, rút tai nghe trong lúc dịch: phụ đề tiếp tục sau tối đa khoảng 2 giây.
- Tạm dừng video lâu, không ai nói: câu cuối vẫn được chốt, thời gian phụ đề không lệch (dòng 304).
- Cho máy ngủ 5 phút trong lúc dịch rồi mở lại: phụ đề tiếp tục, hoặc phiên dừng với lỗi có câu rõ ràng; không treo.
- Máy có GPU: `asr-worker-vulkan` chạy; log của `asr-worker` báo `backend=vulkan`. Log của `llama-server` (`llama-server.log` trong thư mục log) có dòng offload lên thiết bị Vulkan (ví dụ `offloaded N/N layers to GPU`): llama.cpp không thấy GPU thì tự chạy CPU mà không báo lỗi, và app không biết (N5 của lần kiểm 6).
- Lần đầu chạy `--probe` khi Windows Defender đang quét (Windows Security › Virus & threat protection › Quick scan, bấm ngay trước khi mở app với `binaries\` vừa chép): app vẫn chọn được bản GPU hay CPU, hoặc lần này chạy CPU và lần mở sau dò lại; không treo.
- Máy không có Vulkan (máy ảo): app vẫn mở được, dùng `asr-worker-cpu`, `llama-server` chạy bằng CPU, màn hình chính báo "Đang chạy bằng CPU" (dòng 236, 302; C3).
- Thả một file lạ `ggml-cpu-x.dll` (chép bất kỳ DLL nào và đổi tên) vào thư mục chứa tiến trình phụ của bản đang chạy, rồi bấm Bắt đầu: lỗi `sidecarTampered`; xóa file đó thì chạy lại được (QĐ17).
- Kill app bằng Task Manager trong lúc dịch: không còn `asr-worker` hay `llama-server` (Job Object, dòng 82).
- Không có cửa sổ console nào bật lên khi tiến trình phụ chạy (`CREATE_NO_WINDOW`), không có hộp thoại tường lửa.
- S4 trên Windows theo mục 2.2 và C4 của kế hoạch 00 (chat template của `llama-server` Vulkan).

- [ ] **Step 4: Ghi kết quả và commit**

```bash
git add bench/phase0/results/gd1_app_windows.md
git commit -m "test(app): thử phiên dịch thật trên Windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Cập nhật kế hoạch 00

Làm theo Task 2 của kế hoạch 00 (`docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md`), cho cả bốn file 02a, 02d, 02b, 02c:
- Step 1–2: liệt kê 145 dòng có `02`, đổi trạng thái theo bảng "Dòng của bảng đối chiếu" của 02a và kết quả thật (SHA commit của task). Dòng còn phần chờ Windows, C1, Q4, Q6 hay clip nhạc thì để `chờ` kèm mã.
- Step 3: thêm dòng cho việc phát sinh, nếu chủ dự án chưa quyết các điểm ở "Điểm cần chủ dự án quyết" của 02a (ví dụ ngưỡng `filler_logprob_max` ở điểm 1, bộ nhạc thử ở điểm 8).
- Step 4:
  - mục 2: tên bốn file 02a, 02d, 02b, 02c thay cho `…-02-pipeline.md`;
  - mục 5: C12 có kết quả ở `bench/phase0/results/gd1_a4.md`;
  - mục 6.2: `scripts/check-windows.sh` nay kiểm cả `pipeline` và `audio-capture`; bản dev cần `scripts/copy-sidecars.sh` trước `pnpm tauri dev`;
  - việc chuyển cho 07: điểm cần quyết 9 của 02a (`/DEPENDENTLOADFLAG:0x800` cần VC++ Redistributable hoặc `+crt-static`; mọi DLL, dylib đi kèm phải vào bảng SHA-256);
  - việc chuyển cho 03: ghi chú N8 ở đầu 02c.
- Step 5–6: kiểm định dạng bảng, rồi commit với thông điệp `docs(plan): cập nhật tổng quan Phase 1 sau kế hoạch 02`.
