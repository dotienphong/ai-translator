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
