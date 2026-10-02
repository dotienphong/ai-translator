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
