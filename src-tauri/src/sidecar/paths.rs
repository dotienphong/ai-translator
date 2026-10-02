//! Chỗ đặt tiến trình phụ (spec §6.11) và model (§6.7).
//!
//! - Tiến trình phụ: bản dev ở `src-tauri/binaries/`, tên kèm target triple (`scripts/copy-sidecars.sh` chép vào); bản
//!   phát hành nằm cạnh file chạy của app, tên không kèm triple (Tauri `externalBin` bỏ triple khi đóng gói, kế hoạch 07).
//! - Model: theo kho model của kế hoạch 04 (`app_local_data_dir/models`, `models::store`). Bản dev chưa tải gói nào
//!   thì dùng file của Giai đoạn 0 ở `MT_MODELS_DIR`, không đặt thì `<repo>/models`.

use std::path::{Path, PathBuf};

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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModelFiles {
    pub asr: PathBuf,
    pub mt: PathBuf,
    pub vad: PathBuf,
}

/// Bản dev chưa tải gói nào qua manifest: file model của Giai đoạn 0 trong `models/` của repo, theo tên cố định
/// (§6.7). Gói `lite` dùng bộ của gói Nhẹ, mọi gói khác (kể cả chưa chọn) dùng gói Chuẩn.
pub fn model_files(dir: &Path, tier: Option<&str>) -> ModelFiles {
    let (asr, mt) = match tier {
        Some("lite") => ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
        _ => ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
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

/// File model đầu tiên còn thiếu (bản dev, file của Giai đoạn 0 không có trong kho model).
pub fn first_missing(files: &ModelFiles) -> Option<&Path> {
    [&files.asr, &files.mt, &files.vad]
        .into_iter()
        .find(|p| !p.is_file())
        .map(PathBuf::as_path)
}

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
        let lite = model_files(Path::new("/m"), Some("lite"));
        assert_eq!(lite.asr, Path::new("/m/ggml-small-q5_1.bin"));
        assert_eq!(lite.vad, Path::new("/m/silero_vad_v6.2.3.onnx"));
        assert_eq!(first_missing(&lite), Some(Path::new("/m/ggml-small-q5_1.bin")));
    }
}
