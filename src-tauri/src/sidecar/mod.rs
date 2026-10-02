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
use crate::settings::Settings;

/// Kết quả chuẩn bị: cách chạy hai tiến trình phụ, cộng những gì app cần nhớ.
#[derive(Debug)]
pub struct Prepared {
    pub spec: SidecarSpec,
    pub tier: Option<String>,
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
    result: Mutex<Option<probe::ProbeOutcome>>,
    running: Mutex<bool>,
    done: Condvar,
}

impl GpuProbe {
    /// Kết quả đã có; đang dò thì chờ tối đa `wait`. Trả `None` nếu chưa có kết quả.
    pub fn get(&self, wait: Duration) -> Option<probe::ProbeOutcome> {
        let running = self.running.lock().unwrap_or_else(|e| e.into_inner());
        let _running = self
            .done
            .wait_timeout_while(running, wait, |r| *r)
            .unwrap_or_else(|e| e.into_inner());
        self.result.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Dò bằng `probe` nếu chưa có kết quả và chưa ai đang dò. Quá giờ (`None`) thì không nhớ.
    pub fn run(&self, probe: impl FnOnce() -> Option<probe::ProbeOutcome>) -> Option<probe::ProbeOutcome> {
        {
            let mut running = self.running.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(known) = self.result.lock().unwrap_or_else(|e| e.into_inner()).clone() {
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
            *self.result.lock().unwrap_or_else(|e| e.into_inner()) = outcome.clone();
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
            .is_some_and(|o| o.usable)
    } else {
        true
    };
    let models_dir = if tauri::is_dev() {
        paths::dev_models_dir()
    } else {
        data.join("models")
    };
    let models = paths::model_files(&models_dir, settings.model_tier.as_deref());
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
        tier: settings.model_tier.clone(),
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
        let outcome = |usable| probe::ProbeOutcome {
            usable,
            gpus: Vec::new(),
        };
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
                Some(outcome(true))
            }),
            Some(outcome(true))
        );
        assert_eq!(
            probe.run(|| panic!("đã có kết quả thì không dò nữa")),
            Some(outcome(true))
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        // Một luồng đang dò: luồng khác chờ kết quả đó.
        let probe = Arc::new(GpuProbe::default());
        let slow = {
            let probe = probe.clone();
            std::thread::spawn(move || {
                probe.run(|| {
                    std::thread::sleep(Duration::from_millis(100));
                    Some(outcome(false))
                })
            })
        };
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(probe.run(|| panic!("đang có người dò")), Some(outcome(false)));
        assert_eq!(slow.join().unwrap(), Some(outcome(false)));
    }
}
