fn main() {
    // Khai báo app manifest để command của app cũng qua ACL (spec §10.2): cửa sổ nào không được cấp
    // `allow-<command>` trong capabilities thì không gọi được.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "toggle_ticker",
            "set_locked",
            "set_accessory",
        ])),
    )
    .expect("tauri-build thất bại");
}
