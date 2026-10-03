use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::path::Path;

#[path = "src/sidecar/bundled_name.rs"]
mod bundled_name;

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
            "start_listen_test",
            "set_overlay_visible",
            "set_overlay_locked",
            "get_app_info",
            "open_log_dir",
            "open_taskbar_settings",
            "open_login_items_settings",
            "list_audio_sources",
            "open_audio_permission_settings",
            "get_transcript",
            "transcript_text",
            "export_transcript",
            "list_history",
            "get_history_session",
            "delete_history_session",
            "clear_history",
            "list_glossary",
            "add_glossary_entry",
            "update_glossary_entry",
            "delete_glossary_entry",
            "import_glossary_csv",
            "export_glossary_csv",
            "clear_all_data",
            "get_debug_sessions",
            "get_models_state",
            "load_models",
            "download_models",
            "pause_models_download",
            "select_model_pack",
            "delete_models",
            "delete_models_and_data",
            "dismiss_models_update",
            "verify_models",
            "get_license",
            "activate_license",
            "deactivate_license",
            "deactivate_other_device",
            "validate_license",
            "get_plans",
            "start_checkout",
            "get_pending_order",
            "cancel_checkout",
            "open_checkout_page",
            "recover_license",
            "get_overlay_view",
            "hide_overlay",
            "begin_overlay_resize",
            "overlay_resize_move",
            "end_overlay_resize",
        ])),
    )
    .expect("tauri-build thất bại");
}

/// SHA-256 của mọi file trong `binaries/` (tiến trình phụ và thư viện đi kèm), ghi vào `sidecar_hashes.rs` để app kiểm
/// trước khi chạy (spec §10.2, "Thay tiến trình phụ, hoặc chèn thư viện giả"; Đ15 của kế hoạch 00). Thư mục chưa có thì
/// danh sách rỗng, và app từ chối chạy tiến trình phụ nào.
///
/// Bản phát hành (`tauri build`, Tauri không ở chế độ dev) ghi tên file sau khi đóng gói, tức tên không kèm target
/// triple (`bundled_name`), vì app tìm tiến trình phụ theo tên đó cạnh file chạy của nó. Bundler chép nguyên byte, nên
/// SHA-256 không đổi; file nào cần ký thì phải ký trước khi build (kế hoạch 07a, `scripts/release/`).
fn sidecar_hashes() {
    let dir = Path::new("binaries");
    // Tạo thư mục rỗng nếu chưa có: `rerun-if-changed` với đường dẫn không tồn tại làm cargo build lại crate này mỗi lần.
    std::fs::create_dir_all(dir).expect("tạo được src-tauri/binaries/");
    println!("cargo:rerun-if-changed=binaries");
    let target = std::env::var("TARGET").expect("cargo đặt TARGET");
    println!("cargo:rustc-env=SIDECAR_TARGET={target}");
    let dev = tauri_build::is_dev();
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
            let name = entry.file_name().to_string_lossy().into_owned();
            entries.push((bundled_name::bundled_name(&name, &target, dev), hex));
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
