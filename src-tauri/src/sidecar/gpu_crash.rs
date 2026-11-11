//! Nhớ GPU làm `asr-worker-vulkan` chết hẳn (lỗi native của driver) để các lần mở app sau chạy thẳng bằng CPU.
//!
//! Báo cáo thật `R-NQBY-S4F7` (RTX 2060 SUPER, driver Vulkan trên Windows 10.0.26300): `asr-worker-vulkan` thoát `0xc0000005`
//! (access violation) ngay lúc dựng backend Vulkan trong `whisper_model_load`, mỗi lần mở app. Giám sát chuyển CPU sau lần
//! lỗi đầu, nhưng quyết định đó mất khi tắt app, nên mọi lần mở sau lại tốn ~6 giây để chết lần nữa và sinh thêm báo cáo
//! `sidecar_died`. Ở đây ta ghi lại thời điểm binary Vulkan đã chết; `prepare` bỏ GPU trong [`BLOCK_SECS`] (14 ngày) để
//! các bản cập nhật app tiếp theo không bị chết lại mỗi lần cập nhật (báo cáo thật `R-ATR4-EAR7`). Hết hạn 14 ngày thì thử
//! GPU lại (người dùng có thể đã cập nhật driver).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Thời gian nhớ lỗi: 14 ngày; sau đó thử lại GPU (người dùng có thể đã cập nhật driver).
pub const BLOCK_SECS: i64 = 14 * 24 * 3600;

/// Mã thoát native của Windows nghĩa là tiến trình chết vì lỗi bộ nhớ hay driver, không phải lỗi logic của app: access
/// violation, illegal instruction, stack buffer overrun, heap corruption.
const NATIVE_CRASH_CODES: [&str; 4] = ["0xc0000005", "0xc000001d", "0xc0000409", "0xc0000374"];

#[derive(Serialize, Deserialize)]
struct Record {
    sha256: String,
    at: i64,
}

/// Thông báo lỗi của giám sát (`asr-worker đã thoát (exit code: 0xc0000005)`) có mã thoát native không.
pub fn looks_like_native_crash(reason: &str) -> bool {
    let reason = reason.to_lowercase();
    NATIVE_CRASH_CODES.iter().any(|c| reason.contains(c))
}

/// File nhớ nằm cạnh `seen_file`. `None` khi `seen_file` không có thư mục cha (test dùng đường dẫn rỗng): không ghi lung tung
/// vào thư mục làm việc.
pub fn file_beside(seen_file: &Path) -> Option<PathBuf> {
    seen_file
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .map(|d| d.join("gpu-crash.json"))
}

/// Ghi lại binary Vulkan `sha256` vừa chết vì lỗi native lúc `now`.
pub fn record(file: &Path, sha256: &str, now: i64) {
    let Ok(bytes) = serde_json::to_vec(&Record {
        sha256: sha256.to_string(),
        at: now,
    }) else {
        return;
    };
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Err(e) = std::fs::write(file, bytes) {
        log::warn!("không ghi được {}: {e}", file.display());
    }
}

/// Vulkan trên máy đã chết vì lỗi native trong [`BLOCK_SECS`] gần đây không. Chặn theo thời gian thay vì mã băm binary
/// cụ thể (báo cáo thật `R-ATR4-EAR7`), để bản app cập nhật mới không bị chết lại ngay lần mở đầu trước khi người dùng kịp
/// cập nhật driver GPU.
pub fn is_blocked(file: &Path, _sha256: &str, now: i64) -> bool {
    std::fs::read(file)
        .ok()
        .and_then(|b| serde_json::from_slice::<Record>(&b).ok())
        .is_some_and(|r| (0..BLOCK_SECS).contains(&(now - r.at)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-gpu-crash-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("gpu-crash.json")
    }

    #[test]
    fn native_exit_codes_are_recognised_but_ordinary_failures_are_not() {
        assert!(looks_like_native_crash(
            "asr-worker đã thoát (exit code: 0xc0000005), xem log"
        ));
        assert!(looks_like_native_crash("exit code: 0xC0000409"));
        assert!(!looks_like_native_crash("asr-worker đã thoát (exit code: 1)"));
        assert!(!looks_like_native_crash("ErrorOutOfDeviceMemory"));
    }

    #[test]
    fn a_recorded_crash_blocks_until_it_expires() {
        let file = temp("block");
        assert!(!is_blocked(&file, "abc", 1_000), "chưa ghi gì");
        record(&file, "abc", 1_000);
        assert!(is_blocked(&file, "abc", 1_000 + 60));
        assert!(is_blocked(&file, "abc", 1_000 + BLOCK_SECS - 1));
        assert!(!is_blocked(&file, "abc", 1_000 + BLOCK_SECS), "hết hạn thì thử GPU lại");
        assert!(
            is_blocked(&file, "other", 1_000 + 60),
            "bản app mới vẫn tiếp tục nhớ trong thời gian chặn"
        );
        assert!(!is_blocked(&file, "abc", 500), "đồng hồ lùi: không tin");
        let _ = std::fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn a_corrupt_file_blocks_nothing() {
        let file = temp("corrupt");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, b"hong").unwrap();
        assert!(!is_blocked(&file, "abc", 1_000));
        let _ = std::fs::remove_dir_all(file.parent().unwrap());
    }

    #[test]
    fn the_file_sits_beside_the_seen_file_and_an_empty_path_writes_nothing() {
        assert_eq!(
            file_beside(Path::new("/data/sidecars-seen.json")),
            Some(PathBuf::from("/data/gpu-crash.json"))
        );
        assert_eq!(file_beside(Path::new("")), None);
        assert_eq!(file_beside(Path::new("sidecars-seen.json")), None);
    }
}
