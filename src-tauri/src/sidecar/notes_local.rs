//! Cách chạy `llama-server` riêng của ghi chú trên máy (`notes::local`): tìm binary, kiểm SHA-256 như `sidecar::prepare`, chọn
//! GPU hay CPU, nhả file model đang được tiến trình phụ của phiên giữ. Nằm ở `sidecar` (không phải `notes`) vì chạm vào bộ tiến
//! trình phụ của phiên; module `notes` chỉ đọc bản chép lời và không được đi qua phiên (spec ghi chú §2).

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};

use super::{GpuProbe, default_sidecar_env, integrity, paths, probe};
use crate::models::service::NotesReady;
use crate::notes::engine::NotesError;
use crate::notes::local::{LOG_NAME, LocalSpec};

/// Chờ tối đa chừng này cho lần dò GPU đang chạy dở (Windows) trước khi quyết định GPU hay CPU.
const PROBE_WAIT: Duration = Duration::from_secs(30);

/// `llama-server` của ghi chú chạy trên GPU không: macOS luôn (Metal); Windows khi lần dò GPU có kết quả dùng được. GPU tích
/// hợp vẫn dùng: đo cho ghi chú 840 s so với 1465 s khi chỉ CPU (khác với phiên dịch, vốn chạy CPU 5 luồng khi chỉ có GPU
/// tích hợp). Chưa dò xong hay dò hỏng thì CPU (an toàn).
pub fn use_gpu(windows: bool, probed: Option<&probe::ProbeOutcome>) -> bool {
    !windows || probed.is_some_and(|o| o.usable)
}

/// Dựng [`LocalSpec`] cho gói ghi chú `ready`: nhả file model của tiến trình phụ đang rảnh, kiểm binary `llama-server`
/// (SHA-256, không chạy binary chưa kiểm), chọn GPU/CPU, log trong thư mục log của app. Lỗi binary là `Engine` (mã
/// `notesEngineFailed`).
pub fn spec<R: Runtime>(app: &AppHandle<R>, ready: &NotesReady) -> Result<LocalSpec, NotesError> {
    // Tiến trình phụ rảnh của lần dịch trước còn giữ model và VRAM. Phiên dịch không chạy lúc bấm (`notes::service::decide`) nhưng
    // có thể bắt đầu trong lúc chờ lần chạy sẵn: khi đó dừng việc này (móc đầu phiên đã đặt cờ tạm dừng), không tắt bộ của phiên.
    if !crate::session::release_idle_models(app) {
        return Err(NotesError::Cancelled);
    }
    let engine_error = |what: &str| NotesError::Engine(what.to_string());
    let dir = paths::binaries_dir().map_err(|_| engine_error("không tìm thấy thư mục llama-server"))?;
    let files = paths::sidecar_files(&dir, paths::TARGET, tauri::is_dev(), cfg!(windows));
    let verified = integrity::verify(&dir, &[&files.llama], integrity::SIDECAR_HASHES).map_err(|e| {
        log::warn!("llama-server của ghi chú không qua kiểm: {e}");
        engine_error("llama-server không đúng bản")
    })?;
    let probed = app
        .try_state::<GpuProbe>()
        .and_then(|probe| probe.get(PROBE_WAIT));
    let log = app
        .path()
        .app_log_dir()
        .map_err(|_| engine_error("không có thư mục log"))?
        .join(LOG_NAME);
    Ok(LocalSpec {
        exe: files.llama,
        model: ready.path.clone(),
        model_sha256: ready.sha256.clone(),
        ctx: ready.ctx,
        use_gpu: use_gpu(cfg!(windows), probed.as_ref()),
        log,
        env: default_sidecar_env(),
        hold: Arc::new(verified.locks),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome(usable: bool) -> probe::ProbeOutcome {
        probe::ProbeOutcome {
            usable,
            gpus: Vec::new(),
        }
    }

    /// macOS luôn dùng Metal; Windows chỉ dùng GPU khi lần dò có kết quả dùng được, còn lại CPU.
    #[test]
    fn the_gpu_is_used_on_macos_and_on_windows_only_when_the_probe_found_a_usable_one() {
        assert!(use_gpu(false, None));
        assert!(use_gpu(false, Some(&outcome(false))));
        assert!(use_gpu(true, Some(&outcome(true))));
        assert!(!use_gpu(true, Some(&outcome(false))));
        assert!(!use_gpu(true, None));
    }
}
