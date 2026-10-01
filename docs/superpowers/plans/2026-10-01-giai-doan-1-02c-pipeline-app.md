# Giai đoạn 1 · 02c: Pipeline trong app — nối vào app

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Phần cuối của kế hoạch 02 (mục 2.2 của kế hoạch 00): bấm Bắt đầu (nút, phím tắt hoặc khay) là có phụ đề dịch thật từ âm thanh hệ thống. Gồm:
- tiến trình phụ trong `src-tauri/binaries/`: script chép cho bản dev, bảng SHA-256 build sẵn và kiểm trước khi chạy (Đ15), nhận biết lần đầu chạy binary mới, dò GPU trên Windows;
- nguồn âm thanh của phiên (`capture.rs`): mở theo cài đặt, mở lại khi thiết bị đổi, chèn im lặng theo đồng hồ thật;
- `session.rs` thay `session_stub.rs`: bắt đầu, dừng, hủy khi đang nạp model, lỗi làm phiên dừng, sự kiện `subtitle://upsert`, `subtitle://delta`, `audio://level`, trạng thái phiên, chạy sẵn tiến trình phụ khi mở cửa sổ chính, tắt sau 10 phút rảnh, Thoát;
- lệnh chọn nguồn âm thanh và mở trang quyền ghi âm thanh hệ thống, `NSAudioCaptureUsageDescription`;
- giao diện: trạng thái và lỗi của phiên, mức âm lượng, Cài đặt › Âm thanh, bước quyền ở lần đầu mở app, chữ dịch hiện dần và gộp phụ đề trên thanh phụ đề (mức tối thiểu; phần hoàn chỉnh ở 03);
- thử tay trên Mac với âm thanh thật, đợt Windows, cập nhật kế hoạch 00.

**Kiến trúc:**
- `session.rs` giữ phần bên ngoài sau trait `SessionDeps`: app dùng `LiveDeps` (tiến trình phụ thật qua `pipeline::supervisor`, nguồn âm thanh thật, Silero VAD); test dùng `FakeDeps` trong `test_support.rs` (ASR và MT giả trong tiến trình, âm thanh tổng hợp, VAD theo năng lượng). Nhờ vậy luồng bắt đầu, dừng, lỗi test được bằng `MockRuntime`.
- Bắt đầu phiên chặn lâu (nạp model), nên chạy trên luồng nền: lệnh `toggle_session` là `async` và gọi `spawn_blocking`; phím tắt, khay, Thoát chạy trên luồng riêng (QĐ19).
- Phụ đề đi thẳng từ luồng phụ đề của engine ra sự kiện Tauri; chỉ báo và trạng thái đi qua `app://status`.

**Công nghệ:** Như 02a. Thêm `sha2` 0.11.0 và dùng `rtrb` của workspace (bảng "Phiên bản đã chốt" của 02a).

Đọc trước 02a (`docs/superpowers/plans/2026-10-01-giai-doan-1-02a-pipeline-crate.md`): các mục "Phiên bản đã chốt", "Cách đọc kế hoạch này", "Dòng của bảng đối chiếu", "Quyết định" và "Điểm cần chủ dự án quyết" áp cho file này. Làm file này sau khi 02a và 02b đã commit hết.

Chỗ nối của 01 mà file này dùng (Task 26 của 01): `session_stub.rs` và chỗ gọi nó trong `actions.rs`, `lib.rs`; trait `overlay::Surface` (hiện, ẩn thanh phụ đề) và `SystemOpener` (mở trang ngoài app), cùng bản giả trong `test_support.rs`; danh sách lệnh cố định của test ACL lấy từ `commands::MAIN_COMMANDS`.

---

## Task 1: Tiến trình phụ trong `src-tauri/binaries/`

Dòng 136, 205, 272, 313; Đ15; QĐ17, QĐ18:
- `scripts/copy-sidecars.sh`: chép `asr-worker` (build `metal,shared-encode`) và `llama-server` b11146 cùng các `.dylib` nó cần vào `src-tauri/binaries/`, tên kèm target triple như `externalBin` của Tauri. Thư mục này bị `.gitignore` bỏ qua; bản phát hành do CI của 07 build.
- `build.rs`: băm SHA-256 mọi file trong `binaries/` vào `OUT_DIR/sidecar_hashes.rs`, và đặt `SIDECAR_TARGET` (target triple lúc build).
- `sidecar/paths.rs`: tên file và chỗ đặt tiến trình phụ, model của từng gói (bản dev theo `tauri::is_dev()`).
- `sidecar/integrity.rs`: kiểm SHA-256 theo bảng build sẵn; file thiếu, không có trong bảng, hay khác bảng đều bị từ chối.
- `sidecar/first_run.rs`: `sidecars-seen.json`, nhớ binary nào đã chạy được, để biết lần đầu chạy binary mới.
- `sidecar/probe.rs`: Windows, chạy `asr-worker-vulkan --probe` để chọn bản GPU hay CPU (§6.4).

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
 tauri-plugin-autostart = "2.7.0"
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -18,6 +18,7 @@
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
            std::fs::write(dir.join(file), bytes).unwrap();
            table.push((file.to_string(), sha256_file(&dir.join(file)).unwrap()));
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

    #[test]
    fn untouched_files_pass_and_return_the_executable_hashes() {
        let (t, table) = setup("ok");
        let hashes = verify(
            &t.0,
            &[&t.0.join("asr-worker"), &t.0.join("llama-server")],
            &borrowed(&table),
        )
        .unwrap();
        assert_eq!(hashes, [table[0].1.clone(), table[1].1.clone()]);
    }

    #[test]
    fn a_changed_library_or_executable_is_refused() {
        let (t, table) = setup("tampered");
        std::fs::write(t.0.join("libggml.0.dylib"), b"LIB").unwrap();
        let err = verify(&t.0, &[&t.0.join("asr-worker")], &borrowed(&table)).unwrap_err();
        assert_eq!(err, IntegrityError::Tampered("libggml.0.dylib".into()));
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
        // `false` thoát với mã 1; `yes` in mãi không thoát (quá thời gian chờ thì bị kill).
        assert!(!run_probe(Path::new("/usr/bin/false"), Duration::from_secs(5)));
        assert!(!run_probe(Path::new("/usr/bin/yes"), Duration::from_millis(200)));
        assert!(!run_probe(Path::new("/khong/co/file"), Duration::from_secs(1)));
    }
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p meeting-translator --lib sidecar`
Expected: biên dịch lỗi:

```text
error[E0433]: cannot find type `Path` in this scope
error[E0433]: cannot find type `ModelTier` in this scope
error[E0433]: cannot find type `Duration` in this scope
error[E0425]: cannot find function `is_first_run` in this scope
error[E0425]: cannot find function `mark_seen` in this scope
error[E0425]: cannot find function `sha256_file` in this scope
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
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
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

/// Kiểm mọi file trong `table` (tên file trong `dir`, SHA-256), và mọi file thực thi trong `required` phải có trong bảng.
/// Trả băm của từng file thực thi trong `required`, theo thứ tự.
pub fn verify(dir: &Path, required: &[&Path], table: &[(&str, &str)]) -> Result<Vec<String>, IntegrityError> {
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
    for (file, expected) in table {
        let path = dir.join(file);
        let actual = sha256_file(&path).map_err(|_| IntegrityError::Missing(file.to_string()))?;
        if actual != *expected {
            return Err(IntegrityError::Tampered(file.to_string()));
        }
    }
    Ok(hashes)
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

/// Chạy `exe --probe`, chờ tối đa `timeout`. Lỗi, quá giờ hay mã thoát khác 0 đều là "không có GPU dùng được".
pub fn run_probe(exe: &Path, timeout: Duration) -> bool {
    let mut cmd = Command::new(exe);
    cmd.arg("--probe")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    pipeline::process::configure(&mut cmd);
    let Ok(mut child) = cmd.spawn() else { return false };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(status)) => {
                log::info!("{} --probe thoát với {status}: dùng bản CPU", exe.display());
                return false;
            }
            Ok(None) if started.elapsed() < timeout => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
    let mut out = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        use std::io::Read;
        let _ = stdout.read_to_string(&mut out);
    }
    usable_gpu(&out)
}
```

Run: `chmod +x scripts/copy-sidecars.sh`

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p meeting-translator --lib sidecar`
Expected:

```text
test sidecar::paths::tests::names_follow_the_external_bin_convention ... ok
test sidecar::paths::tests::windows_has_two_asr_workers_and_macos_one ... ok
test sidecar::paths::tests::model_files_by_tier ... ok
test sidecar::probe::tests::discrete_or_integrated_gpus_are_usable ... ok
test sidecar::probe::tests::no_gpu_software_renderer_or_garbage_means_cpu ... ok
test sidecar::integrity::tests::sha256_matches_shasum ... ok
test sidecar::integrity::tests::untouched_files_pass_and_return_the_executable_hashes ... ok
test sidecar::integrity::tests::unknown_or_missing_files_are_refused ... ok
test sidecar::integrity::tests::a_changed_library_or_executable_is_refused ... ok
test sidecar::first_run::tests::a_binary_is_new_until_it_has_run_once ... ok
test sidecar::probe::tests::a_probe_that_fails_or_hangs_means_cpu ... ok
test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 84 filtered out; finished in 0.28s
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
- `capture.rs`: `LiveCapture` (trait `FrameSource` của engine). Nguồn chạy trên luồng riêng, vì `start()` có thể chờ lâu; mỗi 500 ms kiểm thiết bị phát mặc định và luồng thu, đổi hay chết thì mở lại; `ClockFiller` chèn im lặng theo đồng hồ thật trong lúc chưa có nguồn. Âm thanh chỉ nằm trong RAM. Lỗi mở nguồn đổi thành mã cho giao diện: `appNotPlaying` (app đã chọn không phát tiếng), `audioPermission` (tạo tap lỗi trên macOS, thường là chưa cấp quyền; chờ C1), `captureFailed`.
- `errors.rs`: tám mã lỗi của phiên dịch (§9), kèm câu tiếng Anh và tiếng Việt trong `src/i18n/` (test `every_error_code_has_ui_text` bắt chỗ thiếu).

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `src-tauri/Cargo.toml`
- Tạo: `src-tauri/src/capture.rs`
- Sửa: `src-tauri/src/errors.rs`
- Sửa: `src-tauri/src/lib.rs`
- Sửa: `src/i18n/en.ts`
- Sửa: `src/i18n/vi.ts`

- [ ] **Step 1: Khai báo phụ thuộc và module**

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
@@ -4,6 +4,7 @@
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
//! - Nguồn chạy trên một luồng riêng, vì `start()` có thể chờ lâu (macOS: tap chờ tới khi có app phát tiếng).
//! - Mỗi 500 ms luồng đó xem thiết bị phát mặc định đã đổi chưa (cắm tai nghe, Bluetooth) và luồng thu còn sống không; có
//!   thì mở lại nguồn (§9: khởi tạo lại trong ≤ 2 giây).
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
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -108,7 +108,23 @@
             }
             codes.push(CommandError::hotkey(HotkeyAction::ToggleLock, error).code);
         }
-        codes.extend([AUTOSTART_FAILED, OVERLAY_FAILED, OPEN_FAILED, UNSUPPORTED].map(String::from));
+        codes.extend(
+            [
+                AUTOSTART_FAILED,
+                OVERLAY_FAILED,
+                OPEN_FAILED,
+                UNSUPPORTED,
+                SIDECAR_MISSING,
+                SIDECAR_TAMPERED,
+                SIDECAR_FAILED,
+                MODEL_MISSING,
+                AUDIO_PERMISSION,
+                CAPTURE_FAILED,
+                APP_NOT_PLAYING,
+                VAD_FAILED,
+            ]
+            .map(String::from),
+        );
         for code in codes {
             assert!(
                 en.contains(&format!("\"error.{code}\":")),
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p meeting-translator --lib -- capture errors`
Expected: biên dịch lỗi:

```text
error[E0433]: cannot find type `AudioSource` in this scope
error[E0425]: cannot find value `SIDECAR_MISSING` in this scope
error[E0425]: cannot find value `SIDECAR_TAMPERED` in this scope
error[E0425]: cannot find value `SIDECAR_FAILED` in this scope
error[E0425]: cannot find value `MODEL_MISSING` in this scope
error[E0425]: cannot find value `AUDIO_PERMISSION` in this scope
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

/// Chu kỳ kiểm thiết bị phát và luồng thu.
const WATCH_EVERY: Duration = Duration::from_millis(500);
/// Mở nguồn lỗi thì thử lại sau chừng này.
const RETRY_AFTER: Duration = Duration::from_secs(2);

/// Lỗi mở nguồn, báo một lần cho phiên (mã lỗi của `errors`).
pub type OnError = Box<dyn Fn(&'static str, String) + Send + Sync>;

/// Nguồn của cài đặt hiện tại. `include_self`: macOS, tap toàn hệ thống thu cả âm thanh của chính app (bước "Nghe thử",
/// §4.1 bước 6, Đ16 của kế hoạch 00); Windows, loopback vốn thu mọi âm thanh của máy nên không đổi gì.
fn open_sources(source: &AudioSource, include_self: bool) -> anyhow::Result<Vec<Box<dyn Source>>> {
    #[cfg(target_os = "macos")]
    {
        use audio_capture::macos::{MacTapSource, TapTarget, audio_apps};
        let target = match source {
            AudioSource::App { bundle_id } => {
                let app = audio_apps()?
                    .into_iter()
                    .find(|a| &a.bundle_id == bundle_id)
                    .ok_or_else(|| anyhow::anyhow!("{bundle_id} không phát âm thanh"))?;
                TapTarget::Process(app.pid)
            }
            _ if include_self => TapTarget::System,
            _ => TapTarget::SystemExceptSelf,
        };
        Ok(vec![Box::new(MacTapSource::new(
            target,
            Arc::new(CaptureStats::default()),
        ))])
    }
    #[cfg(windows)]
    {
        let _ = include_self;
        use audio_capture::windows::{Endpoint, LoopbackSource, Role, default_endpoint_id};
        let stats = || Arc::new(CaptureStats::default());
        Ok(match source {
            AudioSource::Device { id } => vec![Box::new(LoopbackSource::new(Endpoint::Device(id.clone()), stats()))],
            _ => {
                // Chế độ tự động (§6.1): Console, cộng Communications nếu là thiết bị khác.
                let mut sources: Vec<Box<dyn Source>> =
                    vec![Box::new(LoopbackSource::new(Endpoint::Default(Role::Console), stats()))];
                if default_endpoint_id(Role::Console)? != default_endpoint_id(Role::Communications)? {
                    sources.push(Box::new(LoopbackSource::new(
                        Endpoint::Default(Role::Communications),
                        stats(),
                    )));
                }
                sources
            }
        })
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (source, include_self);
        anyhow::bail!("chỉ hỗ trợ macOS và Windows")
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

/// Chạy nguồn cho tới khi `stop`, mở lại khi thiết bị đổi hay luồng thu chết.
fn capture_loop(
    source: AudioSource,
    include_self: bool,
    shared: Arc<Mutex<Option<Preprocessor>>>,
    stop: Arc<AtomicBool>,
    on_error: OnError,
) {
    let mut reported = false;
    while !stop.load(Ordering::SeqCst) {
        let signature = audio_capture::default_output_signature();
        let mut sources = match open_sources(&source, include_self) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("không mở được nguồn âm thanh: {e:#}");
                if !reported {
                    reported = true;
                    on_error(error_code(&source, &e), format!("{e:#}"));
                }
                std::thread::sleep(RETRY_AFTER);
                continue;
            }
        };
        let mut rings = Vec::new();
        let mut failed = None;
        for s in &mut sources {
            let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
            match s.start(producer) {
                Ok(()) => rings.push((consumer, s.format())),
                Err(e) => {
                    failed = Some(e);
                    break;
                }
            }
        }
        if let Some(e) = failed {
            log::warn!("không chạy được nguồn âm thanh: {e:#}");
            if !reported {
                reported = true;
                on_error(error_code(&source, &e), format!("{e:#}"));
            }
            sources.iter_mut().for_each(|s| s.stop());
            std::thread::sleep(RETRY_AFTER);
            continue;
        }
        match Preprocessor::new(rings) {
            Ok(p) => *shared.lock().unwrap() = Some(p),
            Err(e) => log::warn!("không dựng được bộ tiền xử lý: {e:#}"),
        }
        log::info!("đang thu âm thanh ({} nguồn)", sources.len());
        loop {
            std::thread::sleep(WATCH_EVERY);
            if stop.load(Ordering::SeqCst) {
                break;
            }
            let device_changed =
                matches!(source, AudioSource::System) && audio_capture::default_output_signature() != signature;
            if device_changed || sources.iter().any(|s| s.failed()) {
                log::info!("thiết bị phát đã đổi hoặc luồng thu dừng: mở lại nguồn âm thanh");
                break;
            }
        }
        *shared.lock().unwrap() = None;
        sources.iter_mut().for_each(|s| s.stop());
    }
}

/// Nguồn âm thanh thật của một phiên, cho `pipeline::engine`.
pub struct LiveCapture {
    shared: Arc<Mutex<Option<Preprocessor>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    filler: ClockFiller,
    started: Instant,
    buf: Vec<f32>,
}

impl LiveCapture {
    pub fn open(source: AudioSource, include_self: bool, on_error: OnError) -> Self {
        let shared = Arc::new(Mutex::new(None));
        let stop = Arc::new(AtomicBool::new(false));
        let thread = {
            let (shared, stop) = (shared.clone(), stop.clone());
            std::thread::Builder::new()
                .name("capture".into())
                .spawn(move || capture_loop(source, include_self, shared, stop, on_error))
                .ok()
        };
        Self {
            shared,
            stop,
            thread,
            filler: ClockFiller::new(200),
            started: Instant::now(),
            buf: Vec::new(),
        }
    }
}

impl FrameSource for LiveCapture {
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        std::thread::sleep(timeout.min(Duration::from_millis(20)));
        self.buf.clear();
        if let Some(p) = self.shared.lock().unwrap().as_mut() {
            p.drain(&mut self.buf)?;
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
        // Luồng thu có thể đang kẹt trong `start()` (macOS chờ app phát tiếng): không chờ nó, nó tự dừng khi `start` trả về.
        drop(self.thread.take());
    }
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -21,6 +21,23 @@
 pub const OVERLAY_FAILED: &str = "overlayFailed";
 pub const OPEN_FAILED: &str = "openFailed";
 pub const UNSUPPORTED: &str = "unsupported";
+// Phiên dịch (kế hoạch 02, spec §9).
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
+/// Không nạp được VAD.
+pub const VAD_FAILED: &str = "vadFailed";
 
 impl CommandError {
     pub fn new(code: &str, field: Option<&str>, message: impl Into<String>) -> Self {
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -133,6 +133,14 @@
   "error.overlayFailed": "Could not change the subtitle bar.",
   "error.openFailed": "Could not open it.",
   "error.unsupported": "Not available on this system.",
+  "error.sidecarMissing": "Part of the app is missing. Please reinstall Meeting Translator.",
+  "error.sidecarTampered": "Part of the app was changed or damaged. Please reinstall Meeting Translator.",
+  "error.sidecarFailed": "Speech recognition stopped working. Press Start to try again; if it keeps failing, send the logs to support.",
+  "error.modelMissing": "The model has not been downloaded yet.",
+  "error.audioPermission": "Meeting Translator is not allowed to record system audio.",
+  "error.captureFailed": "Could not capture audio.",
+  "error.appNotPlaying": "The chosen app is not playing sound. Start the meeting audio, or choose the whole system.",
+  "error.vadFailed": "Could not load the speech detector. Please reinstall Meeting Translator.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -133,5 +133,13 @@
   "error.overlayFailed": "Không đổi được thanh phụ đề.",
   "error.openFailed": "Không mở được.",
   "error.unsupported": "Không có trên hệ điều hành này.",
+  "error.sidecarMissing": "Thiếu một phần của app. Hãy cài lại Meeting Translator.",
+  "error.sidecarTampered": "Một phần của app đã bị thay đổi hoặc hỏng. Hãy cài lại Meeting Translator.",
+  "error.sidecarFailed": "Phần nhận dạng giọng nói ngừng chạy. Bấm Bắt đầu để thử lại; nếu vẫn lỗi, hãy gửi log cho bộ phận hỗ trợ.",
+  "error.modelMissing": "Chưa tải model.",
+  "error.audioPermission": "Meeting Translator chưa được phép ghi âm thanh hệ thống.",
+  "error.captureFailed": "Không thu được âm thanh.",
+  "error.appNotPlaying": "App đã chọn không phát tiếng. Hãy bật âm thanh cuộc họp, hoặc chọn toàn hệ thống.",
+  "error.vadFailed": "Không nạp được bộ nhận biết tiếng nói. Hãy cài lại Meeting Translator.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p meeting-translator --lib -- capture errors && pnpm test`
Expected:

```text
test capture::tests::capture_errors_map_to_ui_codes ... ok
test errors::tests::invalid_setting_maps_to_reason_code_and_field ... ok
test security::keystore::tests::platform_errors_are_reported ... ok
test errors::tests::every_error_code_has_ui_text ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 92 filtered out; finished in 0.00s
```

```text
 Test Files  4 passed (4)
      Tests  28 passed (28)
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

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

Thay `session_stub.rs` (dòng 15, 16, 43, 45, 61, 66, 73, 79, 81, 82, 96, 105, 141, 222, 236, 237, 305; QĐ17–QĐ20):
- `session.rs`:
  - trait `SessionDeps` (tiến trình phụ, nguồn âm thanh, VAD) với hai bản: `LiveDeps` cho app, `FakeDeps` cho test;
  - `start`/`start_with` (`StartOptions { include_self }` cho bước nghe thử của 03), `stop`, `toggle` (đang nạp model thì bấm là hủy), `shutdown` (Thoát; đang nạp model thì kill luôn), `prewarm` (mở cửa sổ chính thì chạy sẵn tiến trình phụ, Đ19), `spawn_ticker` (tắt sau 10 phút rảnh);
  - `TauriSink` phát `subtitle://upsert`, `subtitle://delta`, `audio://level`, cập nhật chỉ báo; lỗi làm phiên dừng (`Fatal::Vad` thành `vadFailed`, `Fatal::Asr` thành `sidecarFailed`, lỗi của nguồn âm thanh) chạy trên luồng riêng, và chỉ dừng đúng phiên gây lỗi;
  - `StatusEvents`: sự kiện của tiến trình phụ thành trạng thái (`loading`, `cpuFallback`, `suggestLite`) và ghi `sidecars-seen.json`;
  - `engine_config`: ngôn ngữ (khóa nguồn thì một ngôn ngữ, F2), ngôn ngữ đích, `vadEndSilenceMs`, cờ ngữ cảnh, `id_base` theo số phiên.
- `sidecar/mod.rs`: `prepare` kiểm SHA-256 (mã `sidecarMissing`, `sidecarTampered`), dò GPU sau khi đã kiểm, kiểm có file model (`modelMissing`; kích thước và SHA-256 ở 04), dựng `SidecarSpec`.
- `state.rs`: trạng thái phiên thêm `starting` và `error`; `AppStatus` thêm `loading`, `sessionError`, `cpuFallback`, `suggestLite`, `indicators`. `tray.rs` coi `starting` như đang dịch.
- `events.rs`: tên `subtitle://delta` và `audio://level`; trạng thái gửi cho cả hai cửa sổ (thanh phụ đề cần chỉ báo, 03).
- `actions.rs`, `commands.rs`: `toggle_session` gọi `session::toggle`; lệnh `toggle_session` thành `async` (QĐ19); phím tắt và khay chạy trên luồng riêng; Thoát nhớ vị trí thanh phụ đề rồi tắt phiên và tiến trình phụ trên luồng riêng.
- `lib.rs`: hook panic kill tiến trình phụ (`pipeline::process::install_panic_hook`), Windows `SetDefaultDllDirectories`, quản lý `Session`, luồng tick, lưới an toàn `kill_all` khi thoát. `window.rs`: `show_main` gọi `prewarm`.
- `test_support.rs`: `FakeDeps`; `app_tests.rs`: phiên ra phụ đề thật qua engine, lỗi bắt đầu, lỗi sau khi bắt đầu, nghe thử thu cả âm thanh của app. Test `overlay_starts_hidden_and_appears_when_a_session_starts` của 01 vẫn qua.

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
@@ -1,7 +1,7 @@
 //! Lõi Rust của app Meeting Translator (spec §5, §12). `main.rs` chỉ gọi `run()`.
 //!
 //! Kế hoạch 01 dựng khung: cài đặt, i18n phía Rust, khay, phím tắt, hai cửa sổ, quyền, kho khóa, log.
-//! Kế hoạch 02 nối `audio-capture` và `pipeline` vào, thay `session_stub.rs` bằng `session.rs`.
+//! Kế hoạch 02 nối `audio-capture` và `pipeline` vào (`session.rs`, `capture.rs`, `sidecar/`).
 
 pub mod actions;
 pub mod capture;
@@ -17,7 +17,7 @@
 pub mod overlay;
 pub mod quit_guard;
 pub mod security;
-pub mod session_stub;
+pub mod session;
 pub mod settings;
 pub mod sidecar;
 pub mod state;
@@ -33,6 +33,8 @@
 #[cfg(test)]
 mod test_support;
 
+use std::sync::Arc;
+
 use tauri::{App, AppHandle, Manager, RunEvent};
 
 use crate::hotkey_registry::HotkeyRegistry;
@@ -43,6 +45,10 @@
 pub const AUTOSTART_ARG: &str = "--autostart";
 
 pub fn run() {
+    // App panic thì kill tiến trình phụ trước khi abort (Windows: Job Object lo việc này).
+    pipeline::process::install_panic_hook();
+    #[cfg(windows)]
+    harden_dll_search();
     // single-instance phải là plugin đầu tiên: bản thứ hai thoát ngay, bản đang chạy hiện cửa sổ chính (Q7).
     let builder = tauri::Builder::default()
         .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
@@ -95,6 +101,8 @@
     }
     app.manage(AppState::new(settings.clone(), loaded.meta, launched_at_login));
     app.manage(HotkeyRegistry::default());
+    app.manage(session::Session::new(Arc::new(session::LiveDeps::new(handle.clone()))));
+    session::spawn_ticker(&handle);
 
     #[cfg(target_os = "macos")]
     {
@@ -130,6 +138,22 @@
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
use crate::session::{self, StartOptions};
use crate::state::{AppState, SessionStatus};
use crate::test_support::{FakeAudio, FakeDeps, invoke, mock_app, mock_app_with, overlay_calls, window};

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

/// Chỉ thử ẩn/hiện: lệnh khóa ghi cài đặt qua `tauri-plugin-store`, mà app giả không đăng ký plugin này
/// (đăng ký thì ghi vào thư mục cài đặt thật của app). Khóa thử tay ở Task 24–25.
#[test]
fn hide_and_show_reach_the_overlay_window() {
    let app = mock_app();
    let main = window(&app, "main");
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": true })).unwrap();
    assert_eq!(status["overlayVisible"], true);
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": false })).unwrap();
    assert_eq!(status["overlayVisible"], false);
    assert_eq!(overlay_calls(&app), ["show", "hide"]);
}

#[test]
fn blocked_quit_shows_a_notice_in_the_main_window() {
    let app = mock_app();
    let _main = window(&app, "main");
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    app.listen_any(NOTICE, move |event| {
        sink.lock().unwrap().push(event.payload().to_string())
    });
    actions::quit_blocked(app.handle());
    assert_eq!(*received.lock().unwrap(), [r#"{"kind":"quitFromTray"}"#]);
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
```

Tạo `src-tauri/src/session.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Phiên dịch (spec §4.2, §12): nối `audio-capture` và `pipeline` vào app. Thay `session_stub.rs` của kế hoạch 01.
//!
//! - Bắt đầu (nút, phím tắt, khay): hiện thanh phụ đề, chạy hai tiến trình phụ nếu chưa chạy ("Đang nạp model…"), mở nguồn
//!   âm thanh, chạy `pipeline::engine`. Mọi việc này chặn lâu nên không bao giờ chạy trên luồng chính.
//! - Dừng: engine chốt đoạn đang dở, xử lý nốt, rồi dừng; tiến trình phụ còn chạy thêm 10 phút (§5).
//! - Lỗi làm phiên dừng (tiến trình phụ bỏ cuộc, không mở được nguồn âm thanh, thiếu quyền): trạng thái `error` kèm mã lỗi.
//! - Phụ đề đi qua hai sự kiện của §6.6 (`subtitle://upsert`, `subtitle://delta`), mức âm lượng qua `audio://level`, chỉ
//!   báo (trễ, không có âm thanh) qua `app://status`.
//!
//! Phần bên ngoài (tiến trình phụ, nguồn âm thanh, VAD) đi qua `SessionDeps`: app dùng `LiveDeps`, test dùng bản giả
//! (`test_support.rs`), nên luồng bắt đầu, dừng, lỗi test được bằng `MockRuntime`.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::UiLanguage;

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
}
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -1,18 +1,29 @@
 //! Dụng cụ cho các test chạy app bằng `MockRuntime`: đúng `tauri.conf.json`, `capabilities/` và app
-//! manifest của `build.rs`, nhưng không mở cửa sổ thật.
-
+//! manifest của `build.rs`, nhưng không mở cửa sổ thật. Phiên dịch chạy đúng `session.rs` và `pipeline::engine`, với
+//! phần bên ngoài giả (`FakeDeps`): không chạy tiến trình phụ, không thu âm thật.
+
+use std::ops::ControlFlow;
 use std::sync::{Arc, Mutex};
-
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
 
+use crate::capture::OnError;
 use crate::commands;
+use crate::errors::CommandError;
 use crate::overlay::{OverlaySurface, Surface};
+use crate::session::{Session, SessionDeps};
 use crate::settings::migrate::FileMeta;
-use crate::settings::{Settings, UiLanguage};
+use crate::settings::{AudioSource, Settings, UiLanguage};
 use crate::state::AppState;
 use crate::system::{System, SystemOpener};
 
@@ -65,7 +76,145 @@
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
+/// Phần bên ngoài giả của phiên dịch.
+#[derive(Clone, Debug, Default)]
+pub struct FakeDeps {
+    pub audio: FakeAudio,
+    /// `prepare` trả lỗi có mã này (ví dụ thiếu model).
+    pub prepare_error: Option<&'static str>,
+    /// Nguồn âm thanh báo lỗi có mã này ngay khi mở (ví dụ chưa cấp quyền).
+    pub capture_error: Option<&'static str>,
+    /// `asr-worker` không dùng được nữa (bỏ cuộc sau nhiều lần lỗi).
+    pub asr_unavailable: bool,
+    /// Giá trị `include_self` của từng lần mở nguồn âm thanh.
+    pub captures: Arc<Mutex<Vec<bool>>>,
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
+    fn prepare(&self, _settings: &Settings) -> Result<(), CommandError> {
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
+    fn capture(&self, _source: &AudioSource, include_self: bool, on_error: OnError) -> Box<dyn FrameSource> {
+        self.captures.lock().unwrap().push(include_self);
+        if let Some(code) = self.capture_error {
+            on_error(code, "lỗi giả".into());
+        }
+        Box::new(FakeCapture {
+            audio: self.audio,
+            pos: 0,
+        })
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
@@ -81,6 +230,7 @@
         .manage(surface)
         .manage(System(Box::new(system.clone())))
         .manage(system)
+        .manage(Session::new(Arc::new(deps)))
         .invoke_handler(commands::handler())
         .build(tauri::generate_context!(test = true))
         .expect("dựng được app giả")
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p meeting-translator --lib`
Expected: biên dịch lỗi:

```text
error[E0432]: unresolved import `crate::session_stub`
error[E0432]: unresolved import `crate::session::StartOptions`
error[E0432]: unresolved imports `crate::session::Session`, `crate::session::SessionDeps`
error[E0432]: unresolved imports `crate::events::AUDIO_LEVEL`, `crate::events::SUBTITLE_DELTA`
error[E0433]: cannot find `Session` in `session`
error[E0433]: cannot find `LiveDeps` in `session`
```

- [ ] **Step 4: Viết code**

Phiên tạm của 01 không còn dùng: `git rm src-tauri/src/session_stub.rs`

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -8,8 +8,8 @@
 use crate::errors::{self, CommandError};
 use crate::hotkeys::HotkeyAction;
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
@@ -81,16 +82,11 @@
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
@@ -110,7 +106,16 @@
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
@@ -178,12 +183,16 @@
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
+        .map_err(|e| CommandError::new(errors::SIDECAR_FAILED, None, e.to_string()))?
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
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use pipeline::config::PipelineConfig;
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, VadFactory};
use pipeline::prompt::Lang as MtLang;
use pipeline::subtitle::{Delta, Subtitle};
use pipeline::supervisor::{Asr, SidecarEvent, SidecarEvents, SidecarManager, SystemClock, Which};
use pipeline::translate::Mt;
use pipeline::vad::SileroVad;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::capture::{LiveCapture, OnError};
use crate::errors::{self, CommandError};
use crate::settings::{AudioSource, Lang, Settings};
use crate::sidecar::{self, Prepared, first_run};
use crate::state::{AppState, AppStatus, Loading, SessionStatus};
use crate::{actions, events, overlay};

/// Chu kỳ gọi `SessionDeps::tick` (tắt tiến trình phụ khi rảnh 10 phút).
const TICK_EVERY: Duration = Duration::from_secs(30);
/// Id phụ đề của phiên thứ n bắt đầu từ `n × ID_STRIDE` (không trùng giữa các phiên của một lần chạy app).
const ID_STRIDE: u64 = 1_000_000;

/// Những gì một phiên cần từ bên ngoài.
pub trait SessionDeps: Send + Sync {
    /// Chạy hai tiến trình phụ nếu chưa chạy, theo gói model trong cài đặt; chặn tới khi cả hai sẵn sàng.
    fn prepare(&self, settings: &Settings) -> Result<(), CommandError>;
    fn asr(&self) -> Box<dyn Asr>;
    fn mt(&self) -> Box<dyn Mt>;
    fn vad(&self) -> VadFactory;
    /// Mở nguồn âm thanh. Lỗi mở nguồn tới sau (nguồn chạy trên luồng riêng) đi qua `on_error`. `include_self`: xem
    /// [`StartOptions`].
    fn capture(&self, source: &AudioSource, include_self: bool, on_error: OnError) -> Box<dyn FrameSource>;
    fn begin_session(&self) {}
    fn end_session(&self) {}
    /// Gọi định kỳ: tắt tiến trình phụ sau 10 phút không dịch.
    fn tick(&self) {}
    /// Thoát app: tắt hai tiến trình phụ.
    fn shutdown(&self) {}
}

/// Trạng thái phiên, quản lý bằng `tauri::Manager::manage`.
pub struct Session {
    deps: Arc<dyn SessionDeps>,
    engine: Mutex<Option<Engine>>,
    /// Bắt đầu, dừng và dừng vì lỗi lần lượt từng việc một.
    gate: Mutex<()>,
    /// Người dùng bấm Dừng trong lúc đang nạp model.
    cancel: AtomicBool,
    sessions: AtomicU64,
}

impl Session {
    pub fn new(deps: Arc<dyn SessionDeps>) -> Self {
        Self {
            deps,
            engine: Mutex::new(None),
            gate: Mutex::new(()),
            cancel: AtomicBool::new(false),
            sessions: AtomicU64::new(0),
        }
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

fn set_error<R: Runtime>(app: &AppHandle<R>, code: &str) -> AppStatus {
    app.state::<AppState>().update_status(|s| {
        s.session = SessionStatus::Error;
        s.session_error = Some(code.to_string());
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

/// Bắt đầu phiên với nguồn âm thanh trong cài đặt. Chặn tới khi phiên chạy (hoặc lỗi): gọi từ luồng nền.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    start_with(app, StartOptions::default())
}

/// Như [`start`], với tùy chọn.
pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Result<AppStatus, CommandError> {
    let session = app.state::<Session>();
    let state = app.state::<AppState>();
    let _gate = session.gate.lock().unwrap();
    if matches!(state.status().session, SessionStatus::Starting | SessionStatus::Running) {
        return Ok(state.status());
    }
    session.cancel.store(false, Ordering::SeqCst);
    state.update_status(|s| {
        s.session = SessionStatus::Starting;
        s.session_error = None;
        s.indicators = Indicators::default();
        s.overlay_visible = true;
    });
    show_overlay(app);
    changed(app);
    let settings = state.settings();
    if let Err(e) = session.deps.prepare(&settings) {
        log::error!("không bắt đầu được phiên: {} ({})", e.code, e.message);
        set_error(app, &e.code);
        return Err(e);
    }
    if session.cancel.load(Ordering::SeqCst) {
        state.update_status(|s| {
            s.session = SessionStatus::Idle;
            s.loading = None;
        });
        return Ok(changed(app));
    }
    let n = session.sessions.fetch_add(1, Ordering::SeqCst) + 1;
    let on_error: OnError = {
        let app = app.clone();
        Box::new(move |code, message| {
            let app = app.clone();
            std::thread::spawn(move || fail(&app, n, code, &message));
        })
    };
    let source = session
        .deps
        .capture(&settings.audio_source, options.include_self, on_error);
    let sink = Arc::new(TauriSink {
        app: app.clone(),
        session: n,
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
            let e = CommandError::new(errors::CAPTURE_FAILED, None, format!("{e:#}"));
            log::error!("không chạy được pipeline: {}", e.message);
            set_error(app, &e.code);
            return Err(e);
        }
    };
    *session.engine.lock().unwrap() = Some(engine);
    session.deps.begin_session();
    state.update_status(|s| {
        s.session = SessionStatus::Running;
        s.loading = None;
    });
    log::info!("bắt đầu phiên dịch {n}");
    Ok(changed(app))
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
    set_error(app, code);
}

/// Nút, phím tắt, khay: bắt đầu khi chưa dịch; dừng khi đang dịch; đang nạp model thì hủy việc bắt đầu.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    match app.state::<AppState>().status().session {
        SessionStatus::Idle | SessionStatus::Error => start(app),
        SessionStatus::Starting => {
            app.state::<Session>().cancel.store(true, Ordering::SeqCst);
            Ok(app.state::<AppState>().status())
        }
        SessionStatus::Running => Ok(stop(app)),
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

/// Thoát app (Thoát ở menu khay, §4.3): dừng phiên rồi tắt hai tiến trình phụ. Đang nạp model thì không chờ: kill luôn.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    let session = app.state::<Session>();
    session.cancel.store(true, Ordering::SeqCst);
    match session.gate.try_lock() {
        Ok(_gate) => {
            stop_engine(&session);
            session.deps.shutdown();
        }
        Err(_) => log::info!("thoát lúc đang bắt đầu hay dừng phiên: kill tiến trình phụ"),
    }
    pipeline::process::kill_all();
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

/// Kết quả của engine sang giao diện.
struct TauriSink<R: Runtime> {
    app: AppHandle<R>,
    session: u64,
}

impl<R: Runtime> EventSink for TauriSink<R> {
    fn subtitle(&self, subtitle: &Subtitle) {
        let _ = self.app.emit(events::SUBTITLE_UPSERT, subtitle);
    }

    fn delta(&self, delta: &Delta) {
        let _ = self.app.emit(events::SUBTITLE_DELTA, delta);
    }

    fn level(&self, rms: f32) {
        let _ = self.app.emit(events::AUDIO_LEVEL, rms);
    }

    fn indicators(&self, indicators: &Indicators) {
        self.app
            .state::<AppState>()
            .update_status(|s| s.indicators = indicators.clone());
        changed(&self.app);
    }

    fn fatal(&self, kind: Fatal, reason: &str) {
        let code = match kind {
            Fatal::Vad => errors::VAD_FAILED,
            Fatal::Asr => errors::SIDECAR_FAILED,
        };
        let (app, n, reason) = (self.app.clone(), self.session, reason.to_string());
        std::thread::spawn(move || fail(&app, n, code, &reason));
    }
}

/// Sự kiện của tiến trình phụ sang trạng thái của app.
struct StatusEvents<R: Runtime> {
    app: AppHandle<R>,
    asr_hash: String,
    llama_hash: String,
    seen_file: std::path::PathBuf,
}

impl<R: Runtime> SidecarEvents for StatusEvents<R> {
    fn on_event(&self, event: &SidecarEvent) {
        let state = self.app.state::<AppState>();
        match event {
            SidecarEvent::Starting { first_run, .. } => {
                state.update_status(|s| s.loading = Some(if *first_run { Loading::FirstRun } else { Loading::Model }))
            }
            SidecarEvent::Ready { which, first_run, .. } => {
                if *first_run {
                    let hash = if *which == Which::Asr {
                        &self.asr_hash
                    } else {
                        &self.llama_hash
                    };
                    if let Err(e) = first_run::mark_seen(&self.seen_file, hash) {
                        log::warn!("không ghi được {}: {e}", self.seen_file.display());
                    }
                }
                if *which == Which::Llama {
                    state.update_status(|s| s.loading = None);
                }
            }
            SidecarEvent::CpuFallback { .. } => state.update_status(|s| s.cpu_fallback = true),
            SidecarEvent::OutOfMemory { .. } => state.update_status(|s| s.suggest_lite = true),
            SidecarEvent::Restarting { .. } | SidecarEvent::GaveUp { .. } | SidecarEvent::Stopped { .. } => return,
        }
        changed(&self.app);
    }
}

struct Live {
    manager: Arc<SidecarManager>,
    prepared: Prepared,
}

/// Phần bên ngoài thật: tiến trình phụ (`pipeline::supervisor`), nguồn âm thanh (`capture`), Silero VAD.
pub struct LiveDeps<R: Runtime> {
    app: AppHandle<R>,
    live: Mutex<Option<Live>>,
    /// Kết quả dò GPU, một lần mỗi lần chạy app.
    gpu_usable: Mutex<Option<bool>>,
}

impl<R: Runtime> LiveDeps<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self {
            app,
            live: Mutex::new(None),
            gpu_usable: Mutex::new(None),
        }
    }

    /// macOS: Metal luôn có. Windows: `asr-worker-vulkan --probe` (§6.4).
    fn gpu_usable(&self, exe: &Path) -> bool {
        *self
            .gpu_usable
            .lock()
            .unwrap()
            .get_or_insert_with(|| !cfg!(windows) || sidecar::probe::run_probe(exe, PROBE_TIMEOUT))
    }

    fn manager(&self) -> Arc<SidecarManager> {
        self.live
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.manager.clone())
            .expect("prepare() chạy trước")
    }
}

/// Thời gian chờ tối đa của `--probe`.
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);

impl<R: Runtime> SessionDeps for LiveDeps<R> {
    fn prepare(&self, settings: &Settings) -> Result<(), CommandError> {
        let running =
            self.live.lock().unwrap().as_ref().and_then(|l| {
                (l.prepared.tier == settings.model_tier && l.manager.running()).then(|| l.manager.clone())
            });
        if let Some(manager) = running {
            manager.touch();
            return Ok(());
        }
        // Kiểm SHA-256 mỗi lần chạy lại tiến trình phụ, không chỉ lúc mở app (§10.2).
        let prepared = sidecar::prepare(&self.app, settings, |exe| self.gpu_usable(exe))?;
        let manager = {
            let mut live = self.live.lock().unwrap();
            // Đổi gói model thì dựng lại; tiến trình cũ tắt khi phiên cuối còn dùng nó kết thúc (`SidecarManager` bị hủy).
            if live.as_ref().is_none_or(|l| l.prepared.tier != prepared.tier) {
                let events = Arc::new(StatusEvents {
                    app: self.app.clone(),
                    asr_hash: prepared.asr_hash.clone(),
                    llama_hash: prepared.llama_hash.clone(),
                    seen_file: prepared.seen_file.clone(),
                });
                let manager = SidecarManager::new(prepared.spec.clone(), Arc::new(SystemClock::default()), events);
                *live = Some(Live { manager, prepared });
            }
            live.as_ref().expect("vừa dựng").manager.clone()
        };
        manager
            .ensure_started()
            .map_err(|e| CommandError::new(errors::SIDECAR_FAILED, None, e.to_string()))
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
            .map(|l| l.prepared.vad_model.clone())
            .unwrap_or_default();
        Box::new(move || Ok(Box::new(SileroVad::load(&path)?) as _))
    }

    fn capture(&self, source: &AudioSource, include_self: bool, on_error: OnError) -> Box<dyn FrameSource> {
        Box::new(LiveCapture::open(source.clone(), include_self, on_error))
    }

    fn begin_session(&self) {
        self.manager().begin_session();
    }

    fn end_session(&self) {
        self.manager().end_session();
    }

    fn tick(&self) {
        let manager = self.live.lock().unwrap().as_ref().map(|l| l.manager.clone());
        if let Some(manager) = manager
            && manager.tick()
        {
            log::info!("tắt tiến trình phụ sau 10 phút không dịch");
        }
    }

    fn shutdown(&self) {
        let live = self.live.lock().unwrap().take();
        if let Some(live) = live {
            live.manager.stop(false);
        }
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

use pipeline::config::PipelineConfig;
use pipeline::supervisor::{AsrSpec, LlamaSpec, SidecarSpec};
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::settings::{ModelTier, Settings};

/// Kết quả chuẩn bị: cách chạy hai tiến trình phụ, cộng những gì app cần nhớ.
#[derive(Clone, Debug)]
pub struct Prepared {
    pub spec: SidecarSpec,
    pub tier: Option<ModelTier>,
    /// SHA-256 của file thực thi `asr-worker` (bản GPU nếu có, không thì bản CPU) và `llama-server`.
    pub asr_hash: String,
    pub llama_hash: String,
    pub vad_model: PathBuf,
    pub seen_file: PathBuf,
}

/// Dựng cách chạy cho gói model trong cài đặt. `gpu_usable` nhận file `asr-worker` bản GPU và trả có dùng được GPU không
/// (Windows: kết quả `--probe`; macOS luôn `true`, Metal). Hàm này chỉ được gọi sau khi mọi file đã qua kiểm SHA-256: không
/// chạy binary nào chưa kiểm.
pub fn prepare<R: Runtime>(
    app: &AppHandle<R>,
    settings: &Settings,
    gpu_usable: impl FnOnce(&Path) -> bool,
) -> Result<Prepared, CommandError> {
    let path_error = |e: tauri::Error| CommandError::new(errors::SIDECAR_MISSING, None, e.to_string());
    let dir = paths::binaries_dir().map_err(|e| CommandError::new(errors::SIDECAR_MISSING, None, e.to_string()))?;
    let files = paths::sidecar_files(&dir, paths::TARGET, tauri::is_dev(), cfg!(windows));
    let required: Vec<&Path> = if cfg!(windows) {
        vec![&files.asr_gpu, &files.asr_cpu, &files.llama]
    } else {
        vec![&files.asr_cpu, &files.llama]
    };
    let hashes = integrity::verify(&dir, &required, integrity::SIDECAR_HASHES).map_err(|e| {
        let code = match e {
            integrity::IntegrityError::Missing(_) => errors::SIDECAR_MISSING,
            _ => errors::SIDECAR_TAMPERED,
        };
        CommandError::new(code, None, e.to_string())
    })?;
    let gpu_usable = gpu_usable(&files.asr_gpu);
    let models_dir = if tauri::is_dev() {
        paths::dev_models_dir()
    } else {
        app.path().app_local_data_dir().map_err(path_error)?.join("models")
    };
    let models = paths::model_files(&models_dir, settings.model_tier);
    if let Some(missing) = paths::first_missing(&models) {
        return Err(CommandError::new(
            errors::MODEL_MISSING,
            None,
            format!("thiếu {}", missing.display()),
        ));
    }
    let data = app.path().app_local_data_dir().map_err(path_error)?;
    let logs = app.path().app_log_dir().map_err(path_error)?;
    let seen_file = data.join("sidecars-seen.json");
    // Băm của bản `asr-worker` sẽ chạy: Windows không có GPU dùng được thì là bản CPU (phần tử thứ hai).
    let asr_hash = hashes[if cfg!(windows) && !gpu_usable { 1 } else { 0 }].clone();
    let llama_hash = hashes[hashes.len() - 1].clone();
    let config = PipelineConfig::default();
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: gpu_usable.then(|| files.asr_gpu.clone()),
            exe_cpu: files.asr_cpu.clone(),
            model: models.asr.clone(),
            log: logs.join("asr-worker.log"),
            first_run: first_run::is_first_run(&seen_file, &asr_hash),
            require_shared: true,
            env: Vec::new(),
        },
        llama: LlamaSpec {
            exe: files.llama.clone(),
            model: models.mt.clone(),
            log: logs.join("llama-server.log"),
            extra_args: Vec::new(),
            first_run: first_run::is_first_run(&seen_file, &llama_hash),
            env: Vec::new(),
        },
        supervisor: config.supervisor,
        asr_config: config.asr,
        mt_config: config.mt,
    };
    Ok(Prepared {
        spec,
        tier: settings.model_tier,
        asr_hash,
        llama_hash,
        vad_model: models.vad,
        seen_file,
    })
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
@@ -24,6 +40,15 @@
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
 }
 
 /// Phần cài đặt mà thanh phụ đề cần. Cửa sổ `overlay` chỉ đọc được phần này (§10.2).
@@ -83,6 +108,11 @@
                 // Thanh phụ đề ẩn lúc khởi động, kể cả khi mở lúc đăng nhập; hiện khi bắt đầu phiên (§4.2, Đ19).
                 overlay_visible: false,
                 hotkey_failures: Vec::new(),
+                loading: None,
+                session_error: None,
+                cpu_fallback: false,
+                suggest_lite: false,
+                indicators: Indicators::default(),
             }),
             launched_at_login,
         }
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
test app_tests::hide_and_show_reach_the_overlay_window ... ok
test session::tests::the_engine_follows_the_language_and_pause_settings ... ok
test app_tests::a_failed_start_reports_its_error_code ... ok
test app_tests::a_listening_test_session_also_captures_the_app_itself ... ok
test app_tests::overlay_starts_hidden_and_appears_when_a_session_starts ... ok
test app_tests::a_session_turns_speech_into_subtitle_events ... ok
test app_tests::errors_after_the_start_stop_the_session_with_their_code ... ok
test result: ok. 99 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.28s
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

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
- lệnh `list_audio_sources` (`async`, vì hỏi Core Audio hay WASAPI có thể chậm): macOS, các app đang phát tiếng theo bundle ID (trừ chính app); Windows, các thiết bị phát;
- lệnh `open_audio_permission_settings`: macOS, mở trang quyền ghi âm thanh hệ thống của System Settings. Như mọi việc mở ra ngoài app (QĐ28 của 01), lệnh đi qua `SystemOpener`: phương thức mới của trait, bản thật trong `system.rs` (`AUDIO_PERMISSION_URL`), bản giả trong `test_support::FakeSystem`, và tên lệnh trong `OPENER_COMMANDS` của `acl_tests.rs`. Test không mở gì thật; trên Windows lệnh trả `unsupported` trước khi tới `SystemOpener`;
- hai lệnh có mặt ở đủ ba chỗ (`commands::handler`, `build.rs`, `capabilities/main.json`); test ACL lấy danh sách cố định từ `MAIN_COMMANDS`;
- `src-tauri/Info.plist`: `NSAudioCaptureUsageDescription`, cùng câu của S1. Tauri gộp file này vào Info.plist của bộ cài (07) và nhúng vào binary của `pnpm tauri dev`, nên macOS hỏi quyền với đúng câu này ở cả hai.

**Files:**
- Tạo: `src-tauri/Info.plist`
- Sửa: `src-tauri/build.rs`
- Sửa: `src-tauri/capabilities/main.json`
- Test (sửa): `src-tauri/src/acl_tests.rs`
- Sửa: `src-tauri/src/actions.rs`
- Sửa: `src-tauri/src/commands.rs`
- Sửa: `src-tauri/src/system.rs`
- Test (sửa): `src-tauri/src/test_support.rs`

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

Sửa `src-tauri/src/system.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/system.rs
+++ b/src-tauri/src/system.rs
@@ -126,6 +126,9 @@
         fn open_external_url(&self, url: &str) -> Result<(), String> {
             self.push(&format!("open_external_url {url}"))
         }
+        fn open_audio_permission_settings(&self) -> Result<(), String> {
+            self.push("open_audio_permission_settings")
+        }
     }
 
     #[test]
@@ -136,6 +139,7 @@
         assert!(open_taskbar_settings(app).is_err());
         assert!(open_login_items_settings(app).is_err());
         assert!(open_external_url(app, "https://pay.payos.vn/").is_err());
+        assert!(open_audio_permission_settings(app).is_err());
     }
 
     #[test]
@@ -148,6 +152,7 @@
         open_taskbar_settings(app).unwrap();
         open_login_items_settings(app).unwrap();
         open_external_url(app, "https://pay.payos.vn/web/1").unwrap();
+        open_audio_permission_settings(app).unwrap();
         assert_eq!(
             *recorder.0.lock().unwrap(),
             [
@@ -155,6 +160,7 @@
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
@@ -73,6 +73,9 @@
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
Expected: biên dịch lỗi:

```text
error[E0407]: method `open_audio_permission_settings` is not a member of trait `SystemOpener`
error[E0425]: cannot find function `open_audio_permission_settings` in this scope
```

- [ ] **Step 3: Viết code**

Tạo `src-tauri/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSAudioCaptureUsageDescription</key>
  <string>Meeting Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.</string>
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
 use tauri_plugin_autostart::ManagerExt as _;
@@ -183,6 +184,62 @@
     system::open_taskbar_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
 }
 
+/// Một lựa chọn ở Cài đặt › Âm thanh, ngoài "toàn hệ thống" (§6.1). Cùng dạng với `settings::AudioSource`.
+#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
+#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
+pub enum AudioSourceOption {
+    /// macOS: một app đang phát âm thanh. Core Audio chỉ cho bundle ID, nên giao diện hiện bundle ID.
+    App { bundle_id: String },
+    /// Windows: một thiết bị phát đang hoạt động.
+    Device { id: String, name: String },
+}
+
+/// Danh sách nguồn chọn được lúc này: macOS, các app đang phát âm thanh (trừ chính app); Windows, các thiết bị phát.
+pub fn list_audio_sources() -> Result<Vec<AudioSourceOption>, CommandError> {
+    let failed = |e: anyhow::Error| CommandError::new(errors::CAPTURE_FAILED, None, format!("{e:#}"));
+    #[cfg(target_os = "macos")]
+    {
+        let me = std::process::id() as i32;
+        // Một app có thể có nhiều tiến trình phát tiếng (trình duyệt): mỗi bundle ID một dòng, theo thứ tự chữ cái.
+        let bundles: std::collections::BTreeSet<String> = audio_capture::macos::audio_apps()
+            .map_err(failed)?
+            .into_iter()
+            .filter(|a| a.pid != me && !a.bundle_id.is_empty())
+            .map(|a| a.bundle_id)
+            .collect();
+        Ok(bundles
+            .into_iter()
+            .map(|bundle_id| AudioSourceOption::App { bundle_id })
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
+        .map_err(|e| CommandError::new(errors::CAPTURE_FAILED, None, e.to_string()))?
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
+    /// macOS: System Settings › Privacy & Security, trang quyền ghi âm thanh hệ thống (kế hoạch 02, §4.1 bước 4, §9).
+    fn open_audio_permission_settings(&self) -> Result<(), String>;
 }
+
+/// macOS: trang "Screen & System Audio Recording" của System Settings, phần "System Audio Recording Only" (quyền mà
+/// Core Audio tap cần). Cần người kiểm trên máy thật (kế hoạch 02c, Task 8).
+pub const AUDIO_PERMISSION_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture";
 
 /// `SystemOpener` đang dùng.
 pub struct System(pub Box<dyn SystemOpener>);
@@ -64,6 +70,16 @@
     fn open_external_url(&self, url: &str) -> Result<(), String> {
         self.0.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
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
 
 /// Cài bản thật. Gọi một lần ở đầu `setup`, trước khi tạo cửa sổ.
@@ -95,6 +111,10 @@
 
 pub fn open_external_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
     with(app, |s| s.open_external_url(url))
+}
+
+pub fn open_audio_permission_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
+    with(app, |s| s.open_audio_permission_settings())
 }
 
 #[cfg(test)]
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run: `cargo test -p meeting-translator --lib && plutil -lint src-tauri/Info.plist`
Expected:

```text
test acl_tests::capabilities_grant_exactly_the_fixed_lists ... ok
test app_tests::blocked_quit_shows_a_notice_in_the_main_window ... ok
test app_tests::hide_and_show_reach_the_overlay_window ... ok
test acl_tests::outside_effects_only_reach_the_fake_opener ... ok
test app_tests::a_failed_start_reports_its_error_code ... ok
test acl_tests::each_window_only_reaches_its_own_commands ... ok
test app_tests::overlay_starts_hidden_and_appears_when_a_session_starts ... ok
test app_tests::a_listening_test_session_also_captures_the_app_itself ... ok
test app_tests::a_session_turns_speech_into_subtitle_events ... ok
test app_tests::errors_after_the_start_stop_the_session_with_their_code ... ok
test result: ok. 99 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.28s
```

```text
$ plutil -lint src-tauri/Info.plist
src-tauri/Info.plist: OK
```

- [ ] **Step 5: Clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Info.plist \
  src-tauri/build.rs \
  src-tauri/capabilities/main.json \
  src-tauri/src/acl_tests.rs \
  src-tauri/src/actions.rs \
  src-tauri/src/commands.rs \
  src-tauri/src/system.rs \
  src-tauri/src/test_support.rs
git commit -m "feat(app): chọn nguồn âm thanh, mở trang quyền ghi âm thanh hệ thống, NSAudioCaptureUsageDescription" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: Dữ liệu của giao diện: kiểu, store, thanh phụ đề

Dòng 43, 66, 67, 152:
- `src/lib/ipc.ts`: kiểu khớp phía Rust (trạng thái phiên mới, `Indicators`, `Subtitle.replaces`, `SubtitleDelta`, `AudioSourceOption`, hai lệnh mới, hai sự kiện mới).
- `src/store/app.ts`: mức âm lượng theo `audio://level` (về 0 khi phiên không chạy), danh sách nguồn âm thanh, mở trang quyền; bắt đầu phiên lỗi thì lấy trạng thái lỗi từ phía Rust (`sessionError`) thay vì bật thanh báo lỗi chung; `levelToMeter` (thanh đo theo dBFS).
- `src/store/overlay.ts`: `appendDelta` nối chữ dịch tới dần; `upsertLine` bỏ các phụ đề đã gộp (`replaces`).
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
 import type { AppInfo, AppStatus, Settings } from "../lib/ipc";
-import { canOpenScreens, createAppStore, toUiError } from "./app";
+import { canOpenScreens, createAppStore, levelToMeter, toUiError } from "./app";
 
 const settings: Settings = {
   uiLanguage: "vi",
@@ -20,7 +20,16 @@
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
+};
 const info: AppInfo = {
   name: "Meeting Translator",
   version: "0.1.0",
@@ -29,13 +38,15 @@
   launchedAtLogin: false,
 };
 
-let failToggle = false;
+// `toggle_session` lỗi: "model" là lỗi của phiên (trạng thái ra "error"), "acl" là lỗi khác.
+let failToggle: "model" | "acl" | null = null;
 
 function setup() {
-  failToggle = false;
+  failToggle = null;
   const fake = fakeIpc({
     get_settings: () => settings,
-    get_app_status: () => status,
+    get_app_status: () =>
+      failToggle === "model" ? { ...status, session: "error", sessionError: "modelMissing", overlayVisible: true } : status,
     get_app_info: () => info,
     update_settings: ({ patch }) => {
       if (patch.vadEndSilenceMs === 900) throw { code: "outOfRange", field: "vadEndSilenceMs", message: "…" };
@@ -46,9 +57,12 @@
       return { ...settings, hotkeys: { ...settings.hotkeys, [action]: accelerator.replace("Key", "") } };
     },
     toggle_session: () => {
-      if (failToggle) throw { code: "overlayFailed", field: null, message: "…" };
+      if (failToggle === "model") throw { code: "modelMissing", field: null, message: "…" };
+      if (failToggle === "acl") throw "Command toggle_session not allowed by ACL";
       return { ...status, session: "running", overlayVisible: true };
     },
+    list_audio_sources: () => [{ kind: "app", bundleId: "us.zoom.xos" }],
+    open_audio_permission_settings: () => null,
     set_overlay_locked: ({ locked }) => ({ ...settings, overlay: { ...settings.overlay, locked } }),
     open_login_items_settings: () => null,
   });
@@ -56,7 +70,7 @@
 }
 
 describe("app store", () => {
-  it("init đọc cài đặt, trạng thái, thông tin app và nghe bốn sự kiện", async () => {
+  it("init đọc cài đặt, trạng thái, thông tin app và nghe năm sự kiện", async () => {
     const { fake, store } = setup();
     const off = await store.getState().init();
     expect(store.getState().settings).toEqual(settings);
@@ -66,6 +80,7 @@
     expect(fake.listenerCount("app://status")).toBe(1);
     expect(fake.listenerCount("app://navigate")).toBe(1);
     expect(fake.listenerCount("app://notice")).toBe(1);
+    expect(fake.listenerCount("audio://level")).toBe(1);
     off();
     expect(fake.listenerCount("settings://changed")).toBe(0);
   });
@@ -124,13 +139,52 @@
     expect(store.getState().settings?.overlay.locked).toBe(true);
   });
 
-  it("bắt đầu phiên lỗi thì báo lỗi, trạng thái giữ nguyên", async () => {
-    const { store } = setup();
-    await store.getState().init();
-    failToggle = true;
+  it("bắt đầu phiên lỗi thì trạng thái ra lỗi kèm mã, không bật thanh báo lỗi chung", async () => {
+    const { store } = setup();
+    await store.getState().init();
+    failToggle = "model";
     await store.getState().toggleSession();
-    expect(store.getState().error).toEqual({ code: "overlayFailed", field: null });
+    expect(store.getState().status?.session).toBe("error");
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
+    fake.emit("app://status", { ...status, session: "running" });
+    fake.emit("audio://level", 0.05);
+    expect(store.getState().level).toBe(0.05);
+    fake.emit("app://status", { ...status, session: "idle" });
+    expect(store.getState().level).toBe(0);
+  });
+
+  it("đọc danh sách nguồn âm thanh và mở trang quyền ghi âm thanh", async () => {
+    const { fake, store } = setup();
+    await store.getState().init();
+    expect(store.getState().audioSources).toBeNull();
+    await store.getState().loadAudioSources();
+    expect(store.getState().audioSources).toEqual([{ kind: "app", bundleId: "us.zoom.xos" }]);
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
```

Sửa `src/store/overlay.test.ts` (áp bằng `git apply`):

```diff
--- a/src/store/overlay.test.ts
+++ b/src/store/overlay.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import { fakeIpc } from "../lib/fakeIpc";
 import type { OverlayView, Subtitle } from "../lib/ipc";
-import { createOverlayStore, upsertLine } from "./overlay";
+import { appendDelta, createOverlayStore, upsertLine } from "./overlay";
 
 const sub = (id: number, tgt: string, provisional = false): Subtitle => ({
   id,
@@ -12,6 +12,7 @@
   tgt_text: tgt,
   status: "done",
   provisional,
+  replaces: [],
 });
 
 const view: OverlayView = { uiLanguage: "vi", fontSize: 22, lines: 2, opacity: 0.6, showSource: false, locked: false };
@@ -30,6 +31,20 @@
   });
 });
 
+describe("gộp câu và chữ dịch tới dần", () => {
+  it("phụ đề có replaces thì xóa các phụ đề đã gộp vào nó (§7)", () => {
+    const lines = [sub(1, "a"), sub(2, "b"), sub(3, "c")];
+    const merged = { ...sub(4, "b c"), replaces: [2, 3] };
+    expect(upsertLine(lines, merged, 3).map((l) => l.id)).toEqual([1, 4]);
+  });
+
+  it("delta nối vào chữ dịch của đúng phụ đề, phụ đề đã trôi khỏi thanh thì bỏ qua", () => {
+    const lines = [sub(1, "Xin"), sub(2, "")];
+    const next = appendDelta(appendDelta(lines, { id: 1, text: " chào" }), { id: 9, text: "x" });
+    expect(next.map((l) => l.tgt_text)).toEqual(["Xin chào", ""]);
+  });
+});
+
 describe("overlay store", () => {
   it("đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện", async () => {
     const fake = fakeIpc({ get_overlay_view: () => view });
@@ -38,8 +53,10 @@
     expect(store.getState().view).toEqual(view);
     fake.emit("subtitle://upsert", sub(1, "một"));
     fake.emit("subtitle://upsert", sub(2, "hai"));
-    fake.emit("subtitle://upsert", sub(3, "ba"));
+    fake.emit("subtitle://upsert", sub(3, "b"));
+    fake.emit("subtitle://delta", { id: 3, text: "a" });
     expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3]);
+    expect(store.getState().lines[1]?.tgt_text).toBe("ba");
     fake.emit("overlay://view", { ...view, lines: 1, locked: true });
     expect(store.getState().view?.locked).toBe(true);
     expect(store.getState().lines.map((l) => l.id)).toEqual([3]);
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `pnpm test`
Expected: các test mới lỗi:

```text
 Test Files  2 failed | 2 passed (4)
      Tests  8 failed | 26 passed (34)
 FAIL  src/store/app.test.ts > app store > init đọc cài đặt, trạng thái, thông tin app và nghe năm sự kiện
 FAIL  src/store/app.test.ts > app store > bắt đầu phiên lỗi thì trạng thái ra lỗi kèm mã, không bật thanh báo lỗi chung
 FAIL  src/store/app.test.ts > app store > mức âm lượng theo sự kiện, về 0 khi phiên dừng
 FAIL  src/store/app.test.ts > app store > đọc danh sách nguồn âm thanh và mở trang quyền ghi âm thanh
 FAIL  src/store/app.test.ts > app store > thanh đo âm lượng theo dBFS: −60 dB trở xuống là 0, 0 dB là đầy
 FAIL  src/store/overlay.test.ts > gộp câu và chữ dịch tới dần > phụ đề có replaces thì xóa các phụ đề đã gộp vào nó (§7)
 FAIL  src/store/overlay.test.ts > gộp câu và chữ dịch tới dần > delta nối vào chữ dịch của đúng phụ đề, phụ đề đã trôi khỏi thanh thì bỏ qua
 FAIL  src/store/overlay.test.ts > overlay store > đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện
```

- [ ] **Step 3: Viết code**

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -58,13 +58,32 @@
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
 }
+
+// Một lựa chọn ở Cài đặt › Âm thanh (`actions::AudioSourceOption`): macOS, app đang phát tiếng; Windows, thiết bị phát.
+export type AudioSourceOption = { kind: "app"; bundleId: string } | { kind: "device"; id: string; name: string };
 
 export interface AppInfo {
   name: string;
@@ -83,7 +102,7 @@
   locked: boolean;
 }
 
-// Phụ đề (spec §6.6). Kế hoạch 02 phát đủ các trạng thái; kế hoạch 01 chỉ phát phụ đề mẫu.
+// Phụ đề (spec §6.6, `pipeline::subtitle::Subtitle`).
 export interface Subtitle {
   id: number;
   start_ms: number;
@@ -93,6 +112,14 @@
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
@@ -118,7 +145,8 @@
   update_settings: { args: { patch: SettingsPatch }; result: Settings };
   set_hotkey: { args: { action: HotkeyAction; accelerator: string }; result: Settings };
   get_app_status: { args: undefined; result: AppStatus };
-  // Lỗi (ví dụ không hiện được thanh phụ đề) thì `invoke` reject với `CommandError`.
+  // Chờ tới khi phiên chạy (có thể vài chục giây lúc nạp model). Lỗi thì reject với `CommandError`, và trạng thái
+  // phiên là "error" kèm `sessionError`.
   toggle_session: { args: undefined; result: AppStatus };
   set_overlay_visible: { args: { visible: boolean }; result: AppStatus };
   set_overlay_locked: { args: { locked: boolean }; result: Settings };
@@ -126,6 +154,8 @@
   open_log_dir: { args: undefined; result: null };
   open_taskbar_settings: { args: undefined; result: null };
   open_login_items_settings: { args: undefined; result: null };
+  list_audio_sources: { args: undefined; result: AudioSourceOption[] };
+  open_audio_permission_settings: { args: undefined; result: null };
   get_overlay_view: { args: undefined; result: OverlayView };
 }
 
@@ -136,6 +166,9 @@
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
@@ -22,6 +23,14 @@
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
@@ -31,6 +40,10 @@
   onboardingStep: number;
   error: UiError | null;
   notice: AppNotice | null;
+  // Mức âm lượng vào gần nhất (RMS), 0 khi không dịch.
+  level: number;
+  // Nguồn chọn được ở Cài đặt › Âm thanh; `null` là chưa đọc.
+  audioSources: AudioSourceOption[] | null;
   init(): Promise<() => void>;
   navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;
   setOnboardingStep(step: number): void;
@@ -42,6 +55,8 @@
   openLogDir(): Promise<void>;
   openTaskbarSettings(): Promise<void>;
   openLoginItemsSettings(): Promise<void>;
+  openAudioPermissionSettings(): Promise<void>;
+  loadAudioSources(): Promise<void>;
   finishOnboarding(): Promise<void>;
   dismissError(): void;
   dismissNotice(): void;
@@ -84,11 +99,14 @@
       onboardingStep: 0,
       error: null,
       notice: null,
+      level: 0,
+      audioSources: null,
 
       async init() {
         const offs = await Promise.all([
           ipc.listen("settings://changed", (settings) => set({ settings })),
-          ipc.listen("app://status", (status) => set({ status })),
+          ipc.listen("app://status", (status) => set(status.session === "running" ? { status } : { status, level: 0 })),
+          ipc.listen("audio://level", (level) => set({ level })),
           ipc.listen("app://navigate", (target: Navigate) => get().navigate(target.screen, target.settingsGroup)),
           ipc.listen("app://notice", (notice) => set({ notice })),
         ]);
@@ -125,11 +143,16 @@
         }
       },
 
+      // Lỗi bắt đầu phiên nằm trong trạng thái (`session` "error", `sessionError`), Home hiện ngay dưới nút; chỉ lỗi
+      // khác (ví dụ lệnh bị chặn) mới lên thanh báo lỗi chung.
       async toggleSession() {
-        await run(
-          () => ipc.invoke("toggle_session"),
-          (status) => set({ status }),
-        );
+        try {
+          set({ status: await ipc.invoke("toggle_session") });
+        } catch (e) {
+          const status = await ipc.invoke("get_app_status").catch(() => null);
+          if (status?.session === "error") set({ status, level: 0 });
+          else set({ error: toUiError(e) });
+        }
       },
 
       async setOverlayVisible(visible) {
@@ -168,6 +191,20 @@
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

Sửa `src/store/overlay.ts` (áp bằng `git apply`):

```diff
--- a/src/store/overlay.ts
+++ b/src/store/overlay.ts
@@ -1,14 +1,21 @@
 import { createStore } from "zustand/vanilla";
-import type { Ipc, OverlayView, Subtitle } from "../lib/ipc";
+import type { Ipc, OverlayView, Subtitle, SubtitleDelta } from "../lib/ipc";
 
 // Store của thanh phụ đề. Cửa sổ `overlay` chỉ đọc được phần cài đặt của nó (`get_overlay_view`)
 // và nghe sự kiện; không gọi được lệnh nào khác (spec §10.2). Kế hoạch 03 làm đủ phần hiển thị.
 
-// Giữ tối đa `max` phụ đề gần nhất. Phụ đề cùng `id` (phụ đề tạm được thay, §6.3) cập nhật tại chỗ.
+// Giữ tối đa `max` phụ đề gần nhất. Phụ đề cùng `id` (phụ đề tạm được thay, §6.3) cập nhật tại chỗ; phụ đề đã được gộp
+// vào phụ đề mới (`replaces`, §7) thì bỏ.
 export function upsertLine(lines: readonly Subtitle[], subtitle: Subtitle, max: number): Subtitle[] {
-  const i = lines.findIndex((l) => l.id === subtitle.id);
-  const next = i >= 0 ? lines.map((l, j) => (j === i ? subtitle : l)) : [...lines, subtitle];
+  const kept = lines.filter((l) => !subtitle.replaces.includes(l.id));
+  const i = kept.findIndex((l) => l.id === subtitle.id);
+  const next = i >= 0 ? kept.map((l, j) => (j === i ? subtitle : l)) : [...kept, subtitle];
   return next.slice(-Math.max(1, max));
+}
+
+// Nối phần chữ dịch mới vào phụ đề cùng `id`. Phụ đề đã trôi khỏi thanh thì bỏ qua.
+export function appendDelta(lines: readonly Subtitle[], delta: SubtitleDelta): Subtitle[] {
+  return lines.map((l) => (l.id === delta.id ? { ...l, tgt_text: l.tgt_text + delta.text } : l));
 }
 
 export interface OverlayStoreState {
@@ -27,6 +34,7 @@
         ipc.listen("subtitle://upsert", (subtitle) =>
           set({ lines: upsertLine(get().lines, subtitle, get().view?.lines ?? 3) }),
         ),
+        ipc.listen("subtitle://delta", (delta) => set({ lines: appendDelta(get().lines, delta) })),
       ]);
       set({ view: await ipc.invoke("get_overlay_view") });
       return () => offs.forEach((off) => off());
```

Sửa `src/windows/overlay/overlay.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/overlay/overlay.tsx
+++ b/src/windows/overlay/overlay.tsx
@@ -25,8 +25,10 @@
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
      Tests  34 passed (34)
```

```text
✓ built in 324ms
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
- `src/lib/audioSource.ts`: giá trị của danh sách chọn nguồn, tên hiện cho từng nguồn (macOS: bundle ID; Windows: tên thiết bị); nguồn đang chọn vẫn có trong danh sách dù lúc này không đọc thấy.
- `Home.tsx`: trạng thái (Sẵn sàng, Đang khởi động, Đang dịch, Lỗi), nút Bắt đầu/Hủy/Dừng, lỗi của phiên kèm nút mở System Settings khi thiếu quyền, nạp model và lần đầu chạy, chạy bằng CPU, đề xuất gói Nhẹ, chỉ báo, nguồn âm thanh, thanh đo âm lượng.
- `settings/AudioSettings.tsx`: nguồn âm thanh, độ nhạy ngắt câu 200–800 ms (lưu khi thả thanh trượt; áp dụng từ phiên sau).
- `onboarding/Onboarding.tsx`: bước 4 (chỉ macOS) giải thích quyền và có nút mở System Settings.
- `i18n`: câu tiếng Anh và tiếng Việt cho mọi chữ mới.

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
    const options: AudioSourceOption[] = [{ kind: "app", bundleId: "com.microsoft.teams2" }];
    const zoom: AudioSource = { kind: "app", bundleId: "us.zoom.xos" };
    expect(sourceChoices(zoom, options).map(sourceKey)).toEqual(["system", "app:com.microsoft.teams2", "app:us.zoom.xos"]);
    expect(sourceChoices({ kind: "system" }, null).map(sourceKey)).toEqual(["system"]);
  });

  it("tên hiện: toàn hệ thống theo hệ điều hành, app theo bundle ID, thiết bị theo tên", () => {
    const devices: AudioSourceOption[] = [{ kind: "device", id: "d1", name: "Loa (Realtek)" }];
    expect(sourceLabel({ kind: "system" }, "macos", null, t)).toBe("Toàn hệ thống, trừ app này");
    expect(sourceLabel({ kind: "system" }, "windows", null, t)).toBe("Thiết bị phát mặc định (tự động)");
    expect(sourceLabel({ kind: "app", bundleId: "us.zoom.xos" }, "macos", null, t)).toBe("Chỉ us.zoom.xos");
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
      Tests  34 passed (34)
 FAIL  src/lib/audioSource.test.ts [ src/lib/audioSource.test.ts ]
Error: Cannot find module './audioSource' imported from src/lib/audioSource.test.ts
```

- [ ] **Step 3: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -13,11 +13,22 @@
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
+  "home.translationUnavailable": "Translation is unavailable: only the original text is shown.",
+  "home.audioSource.app": "Only {app}",
+  "home.audioSource.change": "Change",
   "home.languages": "Languages",
   "home.audioSource": "Audio source",
   "home.audioSource.system.macos": "Whole system, except this app",
@@ -54,10 +65,15 @@
   "settings.group.license": "License",
   "settings.group.privacy": "Privacy",
   "settings.subtitles.description": "Font size, number of lines, background opacity and original text.",
-  "settings.audio.description": "Audio source and how quickly a sentence is closed after a pause.",
   "settings.model.description": "Model pack in use, disk space, download again or delete.",
   "settings.license.description": "License key, status and expiry date, renew or deactivate.",
   "settings.privacy.description": "Saving history, delete all data, delete models and data.",
+  "settings.audio.source": "Audio source",
+  "settings.audio.refresh": "Refresh list",
+  "settings.audio.hint.macos": "Only apps that are playing sound right now are listed. With one app chosen, other sounds such as notifications are not translated.",
+  "settings.audio.hint.windows": "Automatic follows the default playback device and the communications device. Choose one device if your meeting app plays somewhere else.",
+  "settings.audio.pause": "Pause that ends a sentence",
+  "settings.audio.pause.hint": "Shorter: subtitles appear sooner, but sentences may be cut. Longer: fewer cuts, more delay. Applies from the next session.",
   "settings.general.uiLanguage": "Interface language",
   "settings.general.launchAtLogin": "Launch at login",
   "settings.general.launchAtLogin.hint": "The app starts in the menu bar or system tray, without opening this window.",
@@ -93,6 +109,7 @@
   "onboarding.model.title": "Check this computer and choose a model pack",
   "onboarding.download.title": "Download the model",
   "onboarding.permission.title": "Allow system audio recording",
+  "onboarding.permission.body": "macOS asks for permission the first time you start translating. If you refused, turn on Meeting Translator in System Settings › Privacy & Security › Screen & System Audio Recording, under System Audio Recording Only.",
   "onboarding.languages.title": "Choose your languages",
   "onboarding.test.title": "Try it",
   "onboarding.privacy.title": "Your privacy",
@@ -115,6 +132,7 @@
 
   "common.dismiss": "Dismiss",
   "common.notYet": "Not available yet.",
+  "common.openPermissionSettings": "Open System Settings",
 
   "error.outOfRange": "This value is out of range.",
   "error.empty": "Choose at least one item.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -13,11 +13,22 @@
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
+  "home.translationUnavailable": "Không dịch được: chỉ hiện câu gốc.",
+  "home.audioSource.app": "Chỉ {app}",
+  "home.audioSource.change": "Đổi",
   "home.languages": "Ngôn ngữ",
   "home.audioSource": "Nguồn âm thanh",
   "home.audioSource.system.macos": "Toàn hệ thống, trừ app này",
@@ -54,10 +65,15 @@
   "settings.group.license": "Bản quyền",
   "settings.group.privacy": "Quyền riêng tư",
   "settings.subtitles.description": "Cỡ chữ, số dòng, độ mờ nền và câu gốc.",
-  "settings.audio.description": "Nguồn âm thanh và độ nhạy ngắt câu.",
   "settings.model.description": "Gói model đang dùng, dung lượng, tải lại hoặc xóa.",
   "settings.license.description": "Key bản quyền, trạng thái và ngày hết hạn, gia hạn hoặc gỡ kích hoạt.",
   "settings.privacy.description": "Lưu lịch sử, xóa toàn bộ dữ liệu, xóa model và dữ liệu.",
+  "settings.audio.source": "Nguồn âm thanh",
+  "settings.audio.refresh": "Làm mới danh sách",
+  "settings.audio.hint.macos": "Danh sách chỉ có các app đang phát tiếng. Khi chọn một app, các âm thanh khác như tiếng thông báo sẽ không được dịch.",
+  "settings.audio.hint.windows": "Chế độ tự động theo thiết bị phát mặc định và thiết bị liên lạc. Chọn một thiết bị nếu app họp phát tiếng ra chỗ khác.",
+  "settings.audio.pause": "Độ nhạy ngắt câu",
+  "settings.audio.pause.hint": "Ngắn hơn: phụ đề hiện sớm hơn nhưng câu dễ bị cắt. Dài hơn: ít bị cắt hơn nhưng trễ hơn. Áp dụng từ phiên dịch sau.",
   "settings.general.uiLanguage": "Ngôn ngữ giao diện",
   "settings.general.launchAtLogin": "Khởi động cùng hệ thống",
   "settings.general.launchAtLogin.hint": "App mở sẵn ở menu bar hoặc khay hệ thống, không mở cửa sổ này.",
@@ -93,6 +109,7 @@
   "onboarding.model.title": "Kiểm tra máy và chọn gói model",
   "onboarding.download.title": "Tải model",
   "onboarding.permission.title": "Cho phép ghi âm thanh hệ thống",
+  "onboarding.permission.body": "macOS hỏi quyền ở lần đầu bạn bắt đầu dịch. Nếu đã từ chối, hãy bật Meeting Translator trong System Settings › Privacy & Security › Screen & System Audio Recording, ở mục System Audio Recording Only.",
   "onboarding.languages.title": "Chọn ngôn ngữ",
   "onboarding.test.title": "Nghe thử",
   "onboarding.privacy.title": "Quyền riêng tư",
@@ -115,6 +132,7 @@
 
   "common.dismiss": "Đóng",
   "common.notYet": "Chưa có.",
+  "common.openPermissionSettings": "Mở System Settings",
 
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

// Tên hiện cho một nguồn. macOS chỉ biết bundle ID của app (Core Audio không cho tên). Windows: tên thiết bị nếu danh
// sách đã đọc, không thì id.
export function sourceLabel(
  source: AudioSource | AudioSourceOption,
  platform: AppInfo["platform"],
  options: readonly AudioSourceOption[] | null,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  switch (source.kind) {
    case "system":
      return t(platform === "macos" ? "home.audioSource.system.macos" : "home.audioSource.system.windows");
    case "app":
      return t("home.audioSource.app", { app: source.bundleId });
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
@@ -138,6 +138,15 @@
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
@@ -59,6 +59,7 @@
   const settings = useApp((s) => s.settings);
   const update = useApp((s) => s.updateSettings);
   const openTaskbarSettings = useApp((s) => s.openTaskbarSettings);
+  const openPermission = useApp((s) => s.openAudioPermissionSettings);
   switch (step) {
     // Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (bước 5 đổi lại được).
     case "language":
@@ -76,6 +77,17 @@
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

Sửa `src/windows/main/screens/Home.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/screens/Home.tsx
+++ b/src/windows/main/screens/Home.tsx
@@ -1,27 +1,72 @@
+import { errorKey, type MessageKey } from "../../../i18n";
+import { sourceLabel } from "../../../lib/audioSource";
+import type { SessionStatus } from "../../../lib/ipc";
+import { levelToMeter } from "../../../store/app";
 import { useApp, useT } from "../appStore";
 import { LanguagePicker } from "../LanguagePicker";
 
-// Màn hình chính (§4.3). Kế hoạch 02 nối nút Bắt đầu với pipeline, nguồn âm thanh và mức âm lượng;
-// kế hoạch 06 điền số phút còn lại.
+const BADGE: Record<SessionStatus, MessageKey> = {
+  idle: "status.idle",
+  starting: "status.starting",
+  running: "status.running",
+  error: "status.error",
+};
+
+// Nút chính: đang khởi động thì bấm là hủy (`session::toggle`).
+const BUTTON: Record<SessionStatus, MessageKey> = {
+  idle: "home.start",
+  starting: "home.cancel",
+  running: "home.stop",
+  error: "home.start",
+};
+
+// Màn hình chính (§4.3): bắt đầu/dừng, trạng thái và lỗi của phiên, ngôn ngữ, nguồn âm thanh, mức âm lượng.
+// Kế hoạch 06 điền số phút còn lại.
 export function Home() {
   const t = useT();
   const status = useApp((s) => s.status);
   const settings = useApp((s) => s.settings);
   const info = useApp((s) => s.info);
+  const level = useApp((s) => s.level);
+  const audioSources = useApp((s) => s.audioSources);
   const toggleSession = useApp((s) => s.toggleSession);
   const setVisible = useApp((s) => s.setOverlayVisible);
   const setLocked = useApp((s) => s.setOverlayLocked);
+  const navigate = useApp((s) => s.navigate);
+  const openPermission = useApp((s) => s.openAudioPermissionSettings);
   if (!status || !settings || !info) return null;
-  const running = status.session === "running";
+  const session = status.session;
+  const notes: MessageKey[] = [];
+  if (status.loading) notes.push(status.loading === "firstRun" ? "home.loading.firstRun" : "home.loading.model");
+  if (status.cpuFallback) notes.push("home.cpuFallback");
+  if (status.suggestLite) notes.push("home.suggestLite");
+  if (session === "running") {
+    if (status.indicators.lagging) notes.push("home.lagging");
+    if (status.indicators.noAudio) notes.push("home.noAudio");
+    if (status.indicators.translationUnavailable) notes.push("home.translationUnavailable");
+  }
   return (
     <>
       <div className="card">
         <div className="row">
-          <span className={running ? "badge running" : "badge"}>{t(running ? "status.running" : "status.idle")}</span>
+          <span className={`badge ${session}`}>{t(BADGE[session])}</span>
           <button className="primary" onClick={() => void toggleSession()}>
-            {t(running ? "home.stop" : "home.start")}
+            {t(BUTTON[session])}
           </button>
         </div>
+        {session === "error" && status.sessionError && (
+          <div className="row" role="alert">
+            <span className="error-text">{t(errorKey(status.sessionError))}</span>
+            {status.sessionError === "audioPermission" && info.platform === "macos" && (
+              <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
+            )}
+          </div>
+        )}
+        {notes.map((key) => (
+          <p key={key} className="hint" role="status">
+            {t(key)}
+          </p>
+        ))}
       </div>
       <div className="card">
         <h2>{t("home.languages")}</h2>
@@ -30,11 +75,12 @@
       <div className="card">
         <div className="row">
           <span>{t("home.audioSource")}</span>
-          <span>{t(info.platform === "macos" ? "home.audioSource.system.macos" : "home.audioSource.system.windows")}</span>
+          <span>{sourceLabel(settings.audioSource, info.platform, audioSources, t)}</span>
+          <button onClick={() => navigate("settings", "audio")}>{t("home.audioSource.change")}</button>
         </div>
         <div className="row">
           <span>{t("home.inputLevel")}</span>
-          <span className="hint">{t("common.notYet")}</span>
+          <meter min={0} max={1} value={session === "running" ? levelToMeter(level) : 0} aria-label={t("home.inputLevel")} />
         </div>
         <div className="row">
           <span>{t("home.minutesLeft")}</span>
```

Sửa `src/windows/main/screens/SettingsScreen.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/screens/SettingsScreen.tsx
+++ b/src/windows/main/screens/SettingsScreen.tsx
@@ -1,15 +1,15 @@
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
@@ -30,6 +30,7 @@
         ))}
       </div>
       {group === "general" && <GeneralSettings />}
+      {group === "audio" && <AudioSettings />}
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
      Tests  37 passed (37)
```

```text
✓ built in 191ms
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

`scripts/check-windows.sh` kiểm thêm `pipeline` và `audio-capture`, với pkg-config giả của 02b (QĐ15), và nhận thêm tham số cho cargo.

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
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 8.84s
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
passed 351 failed 0 ignored 7
```

Và `pnpm test`:

```text
 Test Files  5 passed (5)
      Tests  37 passed (37)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check-windows.sh
git commit -m "chore(app): check-windows.sh kiểm cả pipeline và audio-capture" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Thử trên Mac với âm thanh thật (cần người)

Bàn giao chính của kế hoạch 02 (mục 2.2 của kế hoạch 00): bấm Bắt đầu là có phụ đề dịch từ âm thanh hệ thống. Agent không tự chạy app và không bật hộp thoại quyền (mục 6.8): agent chuẩn bị, đưa từng bước cho người, ghi kết quả. Dòng 25, 32, 38, 43, 61, 79, 230, 232, 305 (và C1).

**Cần người thao tác:** cả task. Nên chạy trên bản ký bằng chứng thư cố định (R8, `scripts/run-dev-signed.sh` của 01) để không phải cấp quyền lại sau mỗi lần build; không có thì dùng `pnpm tauri dev`.

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

- [ ] **Step 2: Người chạy app** (`pnpm tauri dev`, hoặc bản ký của 01)

Expected: cửa sổ chính hiện. Trong khoảng 10–20 giây, `pgrep -l -f 'asr-worker|llama-server'` có đủ hai tiến trình (chạy sẵn khi mở cửa sổ chính, Đ19). Lần đầu chạy binary mới, màn hình chính có dòng "Đang chuẩn bị lần đầu".

- [ ] **Step 3: Bắt đầu và cấp quyền**

Người mở một video có người nói tiếng Anh (ví dụ bản tin) trong Safari hoặc Chrome, rồi bấm Bắt đầu.
Expected:
- Thanh phụ đề hiện. Lần đầu, macOS hỏi quyền ghi âm thanh với câu trong `Info.plist`; người bấm Allow. Không có hộp thoại mà phụ đề không hiện thì ghi lại (dòng 2 của C1).
- Trong khoảng 2 giây sau mỗi câu, phụ đề tiếng Việt hiện, chữ dịch hiện dần; câu chưa chốt nhạt hơn rồi được thay bằng bản dịch của cả câu.
- Thanh đo âm lượng ở màn hình chính chạy theo tiếng.

- [ ] **Step 4: Các thao tác của phiên**
- Đổi sang video tiếng Việt. Expected: phụ đề là câu gốc, không dịch (`same_lang`).
- Bấm Dừng. Expected: thanh phụ đề còn nguyên; trạng thái "Sẵn sàng". Bấm Bắt đầu lại: chạy ngay, không nạp lại model.
- Bắt đầu và dừng bằng phím tắt (mặc định `Ctrl+Alt+T`) và bằng menu khay. Expected: như nút.
- Trong lúc dịch, cắm tai nghe có dây hoặc nối AirPods. Expected: phụ đề tiếp tục sau tối đa khoảng 2 giây (§9).
- Tạm dừng video hơn 60 giây. Expected: màn hình chính hiện "Một lúc lâu không nghe thấy âm thanh…".

- [ ] **Step 5: Cài đặt › Âm thanh**
- Mở danh sách nguồn khi video đang phát. Expected: có bundle ID của trình duyệt (ví dụ `com.apple.Safari`, hay tiến trình phụ của Chrome).
- Chọn trình duyệt, bắt đầu phiên, rồi phát tiếng ở app khác. Expected: chỉ tiếng của trình duyệt có phụ đề.
- Chọn một app không phát tiếng, bắt đầu phiên. Expected: lỗi "App đã chọn không phát tiếng…".
- Kéo "Độ nhạy ngắt câu" lên 800 ms. Expected: phiên sau câu bị cắt ít hơn, phụ đề hiện chậm hơn một chút.

- [ ] **Step 6: Thiếu quyền**

Người tắt quyền của app trong System Settings › Privacy & Security › Screen & System Audio Recording (mục System Audio Recording Only), rồi bấm Bắt đầu.
Expected: màn hình chính báo "Meeting Translator chưa được phép ghi âm thanh hệ thống." kèm nút "Mở System Settings"; bấm nút thì mở đúng phần "System Audio Recording Only". Không đúng trang thì ghi lại trang mở ra, thử `open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"` trong Terminal, và ghi neo nào đúng (điểm cần quyết 6 của 02a). Bật lại quyền sau bước này.

- [ ] **Step 7: Thoát và tắt khi rảnh**
- Thoát ở menu khay. Expected: `pgrep -l -f 'asr-worker|llama-server'` không in gì (dòng 61, 305).
- Mở lại app, mở cửa sổ chính, không dịch gì trong 10 phút. Expected: sau 10–11 phút, `pgrep` không còn tiến trình phụ (§5).

- [ ] **Step 8: Log**

Mở Giới thiệu › Mở thư mục log, tìm vài chữ đã xuất hiện trong phụ đề ở Step 3 (`grep -ri '<chữ>' ~/Library/Logs/<bundle id>/`).
Expected: không tìm thấy; log chỉ có trạng thái và số đo của phiên (dòng 315).

- [ ] **Step 9 (tùy chọn): Phiên dài**

Một phiên 2 giờ với âm thanh cuộc họp. Ở phút 60 và phút 120: `ps -o pid,rss,comm -p $(pgrep -d, -f 'meeting-translator|asr-worker|llama-server')`.
Expected: không crash; RSS ở phút 120 không lớn hơn phút 60 quá 10% (A5, 08 đo chính thức).

- [ ] **Step 10: Ghi kết quả và commit**

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
Expected: mọi test qua, kể cả test `#[cfg(windows)]` của `audio-capture` và `pipeline` (Job Object); không có cảnh báo.

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
- Máy có GPU: `asr-worker-vulkan` chạy; log của `asr-worker` báo `backend=vulkan`.
- Máy không có Vulkan (máy ảo): app vẫn mở được, dùng `asr-worker-cpu`, `llama-server` chạy bằng CPU, màn hình chính báo "Đang chạy bằng CPU" (dòng 236, 302; C3).
- Kill app bằng Task Manager trong lúc dịch: không còn `asr-worker` hay `llama-server` (Job Object, dòng 82).
- Không có cửa sổ console nào bật lên khi tiến trình phụ chạy (`CREATE_NO_WINDOW`), không có hộp thoại tường lửa.
- S4 trên Windows theo mục 2.2 và C4 của kế hoạch 00 (chat template của `llama-server` Vulkan).

- [ ] **Step 4: Ghi kết quả và commit**

```bash
git add bench/phase0/results/gd1_app_windows.md
git commit -m "test(app): thử phiên dịch thật trên Windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Cập nhật kế hoạch 00

Làm theo Task 2 của kế hoạch 00 (`docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`), cho cả ba file 02a, 02b, 02c:
- Step 1–2: liệt kê 140 dòng có `02`, đổi trạng thái theo bảng "Dòng của bảng đối chiếu" của 02a và kết quả thật (SHA commit của task). Dòng còn phần chờ Windows, C1, Q4, Q6 hay clip nhạc thì để `chờ` kèm mã.
- Step 3: thêm dòng cho việc phát sinh, nếu chủ dự án chưa quyết các điểm ở "Điểm cần chủ dự án quyết" của 02a (ví dụ luật riêng cho turbo ở điểm 10).
- Step 4:
  - mục 2: tên ba file 02a, 02b, 02c thay cho `…-02-pipeline.md`;
  - mục 5: C12 có kết quả ở `bench/phase0/results/gd1_a4.md`;
  - mục 6.2: `scripts/check-windows.sh` nay kiểm cả `pipeline` và `audio-capture`; bản dev cần `scripts/copy-sidecars.sh` trước `pnpm tauri dev`.
- Step 5–6: kiểm định dạng bảng, rồi commit với thông điệp `docs(plan): cập nhật tổng quan Giai đoạn 1 sau kế hoạch 02`.
