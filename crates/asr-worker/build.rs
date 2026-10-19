//! Chỉ macOS: link `libclang_rt.osx.a` để có `___isPlatformVersionAtLeast`.
//!
//! Bản phát hành đặt `MACOSX_DEPLOYMENT_TARGET=14.2` (scripts/release/build-sidecars-macos.sh), nên ggml-metal biên dịch các
//! khối `@available(macOS 15.0, ...)` thành lời gọi kiểm phiên bản lúc chạy, và hàm đó nằm trong compiler-rt của clang. Clang tự
//! link thư viện này, nhưng rustc gọi `cc` với `-nodefaultlibs` nên bước link báo thiếu ký hiệu. Nếu không đặt deployment target
//! thì không có lời gọi nào và thư viện không bị kéo vào (archive chỉ nạp phần đang cần), nên build thường vẫn như cũ.

use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");
    println!("cargo:rerun-if-env-changed=SDKROOT");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    // Cùng `cc` mà rustc dùng để link, để thư viện đúng bản với trình link.
    let resource_dir = Command::new("cc")
        .arg("--print-resource-dir")
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_owned());
    let archive = resource_dir.map(|dir| PathBuf::from(dir).join("lib/darwin/libclang_rt.osx.a"));
    match archive {
        Some(path) if path.is_file() => println!("cargo:rustc-link-arg={}", path.display()),
        // Không chặn build: chỉ thiếu khi mã bên trong thật sự cần hàm đó, lúc ấy trình link tự báo.
        _ => println!("cargo:warning=không tìm thấy libclang_rt.osx.a (cc --print-resource-dir)"),
    }
}
