//! Phần của app quanh hai tiến trình phụ (Đ2 của kế hoạch 00): tìm file, kiểm SHA-256, nhớ binary đã chạy, dò GPU trên
//! Windows, rồi dựng `SidecarSpec`. Việc chạy và giám sát nằm ở `pipeline::supervisor`.

pub mod bundled_name;
pub mod first_run;
pub mod integrity;
pub mod paths;
pub mod probe;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use asr_protocol::Backend;
use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
use pipeline::supervisor::{AsrSpec, GiveUpCause, LlamaSpec, SidecarSpec};
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::models::service::ModelService;
use crate::settings::Settings;

/// Kết quả chuẩn bị: cách chạy hai tiến trình phụ, cộng những gì app cần nhớ.
/// Những gì một bộ tiến trình phụ đang chạy dựa vào: gói, file model, ngưỡng của giám sát và của hai tiến trình phụ.
/// Khác thì phải dựng bộ mới: bản cập nhật cùng mã gói có thể đổi tên file hay ngưỡng (Q-B của review 04 lần 2).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SidecarKey {
    pub tier: Option<String>,
    pub models: paths::ModelFiles,
    pub supervisor: SupervisorConfig,
    pub asr: AsrConfig,
    pub mt: MtConfig,
}

/// [`SidecarKey`] cho cài đặt lúc này. Rẻ (chỉ kiểm có file và kích thước), nên lần chuẩn bị nào cũng gọi, kể cả khi
/// tiến trình phụ đang chạy.
pub fn sidecar_key<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<SidecarKey, CommandError> {
    let models = resolve_models(app, settings)?;
    let config = app
        .try_state::<Arc<ModelService>>()
        .map(|models| models.pipeline_config())
        .unwrap_or_default();
    // Họ prompt theo model mà `llama-server` của bộ này sẽ nạp (spec gói Nhanh §4.3).
    let mut mt = config.mt;
    mt.prompt_family = models.mt_prompt;
    Ok(SidecarKey {
        tier: settings.model_tier.clone(),
        models,
        supervisor: config.supervisor,
        asr: config.asr,
        mt,
    })
}

#[derive(Debug)]
pub struct Prepared {
    pub spec: SidecarSpec,
    pub key: SidecarKey,
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

/// Tham số thêm cho `llama-server` khi máy chỉ có GPU tích hợp (`llama_cpu`, từ `probe::only_integrated_gpu`): `-ngl 0`
/// (đứng sau `-ngl auto` mà `llama::command` đã truyền; llama.cpp lấy giá trị cuối) và `-t 5` để giới hạn số luồng.
///
/// Mặc định của `llama-server` dùng hết số luồng phần cứng báo (10 trên i5-1345U: 2 lõi P + 8 lõi E). Đo lại
/// 2026-10-31 trên đúng máy đó, có tải nền thật (phát video trong lúc dịch, giống lúc người dùng vừa xem YouTube vừa
/// dịch), không phải máy rảnh như lúc đo `s6_windows.md`: 10 luồng chậm nhất và dao động nhiều nhất (tổng mỗi câu
/// trung bình 1,85 s, có lượt tụt xuống 13,6 tok/s sinh chữ); 4–6 luồng là vùng tốt nhất và ổn định ở cả hai lượt đo
/// theo hai thứ tự ngược nhau; 8 luồng không ổn định (có lượt mất 5,9 s cho một câu, nghi tràn không đều vào lõi E).
/// Chọn 5 vì không bao giờ là lựa chọn tệ nhất ở cả hai lượt. Xem `bench/phase0/results/s6_windows.md` mục "Số luồng
/// CPU khi có tải nền (2026-10-31)".
fn llama_cpu_extra_args(llama_cpu: bool) -> Vec<String> {
    if llama_cpu {
        vec!["-ngl".into(), "0".into(), "-t".into(), "5".into()]
    } else {
        Vec::new()
    }
}

/// Máy đủ sức cho chế độ dịch trong lúc người nói chưa dừng không, lúc bắt đầu phiên (spec 2026-10-10 §5, "Tắt ngay từ
/// đầu phiên"; QĐ1 của kế hoạch 03):
/// - `asr-worker` phải chạy GPU: `asr_backend` là thiết bị thật của worker đang chạy (`SidecarManager::asr_backend`, đặt ở
///   `Ready`); chưa biết thì coi như chưa đủ sức.
/// - Windows: lần dò GPU phải có kết quả (`probed`) và không bị `probe::too_slow_for_streaming`. Dò quá giờ thì `prepare`
///   đã cho `asr-worker` chạy CPU, nên kết quả vẫn là chưa đủ sức.
pub fn streaming_supported(windows: bool, probed: Option<&probe::ProbeOutcome>, asr_backend: Option<Backend>) -> bool {
    let asr_on_gpu = asr_backend.is_some_and(Backend::is_gpu);
    let gpu_ok = !windows || probed.is_some_and(|o| !probe::too_slow_for_streaming(o));
    asr_on_gpu && gpu_ok
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
        probe_at_launch(&app, || probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)));
    });
}

/// Phần của [`start_gpu_probe`] sau bước kiểm binary: dò bằng `run` (hay lấy kết quả đã có, [`GpuProbe::run`]), rồi báo
/// những nơi đổi theo kết quả. Tách riêng để test chạy được trên mọi máy: `start_gpu_probe` chỉ chạy trên Windows, cần
/// binary thật đúng SHA-256 và không trả handle của luồng nền.
fn probe_at_launch<R: Runtime>(app: &AppHandle<R>, run: impl FnOnce() -> Option<probe::ProbeOutcome>) {
    let outcome = app.state::<GpuProbe>().run(run);
    // Đề xuất gói theo VRAM của card rời (kế hoạch 04) đổi theo kết quả dò.
    crate::models::service::changed(app);
    // Chỉ có GPU tích hợp hay không có GPU dùng được: chưa đủ sức dịch trong lúc người nói chưa dừng (spec 2026-10-10
    // §5). Cài đặt › Phụ đề ghi chú ngay, chưa cần bắt đầu phiên (§6.3).
    if outcome.as_ref().is_some_and(probe::too_slow_for_streaming) {
        app.state::<crate::state::AppState>()
            .update_status(crate::state::AppStatus::note_machine_too_slow);
        crate::actions::status_changed(app);
    }
}

fn seen_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|d| d.join("sidecars-seen.json"))
}

/// File model của gói đang dùng, theo kho model (kế hoạch 04; lúc bắt đầu chỉ kiểm có file và đúng kích thước, §9).
/// Bản dev chưa tải gói nào qua manifest thì dùng file của Phase 0 trong `models/` của repo, như trước.
fn resolve_models<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<paths::ModelFiles, CommandError> {
    let pack = settings.model_tier.as_deref();
    let resolved = match app.try_state::<Arc<ModelService>>() {
        Some(models) => models.resolve(pack),
        None => Err(CommandError::new(errors::MODEL_MISSING, None, "chưa có quản lý model")),
    };
    match resolved {
        Err(e) if e.code == errors::MODEL_MISSING && tauri::is_dev() => {
            let dev = paths::model_files(&paths::dev_models_dir(), pack);
            match paths::first_missing(&dev) {
                None => Ok(dev),
                Some(_) => Err(e),
            }
        }
        other => other,
    }
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
    let (gpu_usable, llama_cpu) = if cfg!(windows) {
        let first = first_run::is_first_run(&seen_file, &verified.hashes[0]);
        let outcome = app
            .state::<GpuProbe>()
            .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)));
        let usable = outcome.as_ref().is_some_and(|o| o.usable);
        let llama_cpu = outcome.as_ref().is_some_and(|o| probe::only_integrated_gpu(&o.gpus));
        (usable, llama_cpu)
    } else {
        (true, false)
    };
    let key = sidecar_key(app, settings)?;
    let models = &key.models;
    let logs = app.path().app_log_dir().map_err(path_error)?;
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
            extra_args: llama_cpu_extra_args(llama_cpu),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: key.supervisor.clone(),
        asr_config: key.asr.clone(),
        mt_config: key.mt.clone(),
    };
    Ok(Prepared {
        vad_model: key.models.vad.clone(),
        spec,
        key,
        dir,
        hashes,
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

    /// Máy chỉ có GPU tích hợp thì `llama-server` chạy CPU và giới hạn 5 luồng (đo 2026-10-31, xem comment ở
    /// `llama_cpu_extra_args`); máy khác (card rời hay macOS) không thêm tham số, giữ `-ngl auto` của `llama::command`.
    #[test]
    fn llama_cpu_extra_args_caps_threads_on_integrated_only_machines() {
        assert_eq!(llama_cpu_extra_args(true), vec!["-ngl", "0", "-t", "5"]);
        assert_eq!(llama_cpu_extra_args(false), Vec::<String>::new());
    }

    /// QĐ1 của kế hoạch 03 (spec 2026-10-10 §5): dịch trong lúc người nói chưa dừng chỉ khi `asr-worker` chạy GPU; trên
    /// Windows còn phải có kết quả dò GPU, và không chỉ có GPU tích hợp.
    #[test]
    fn translating_while_speaking_needs_a_gpu_asr_worker_and_no_integrated_only_windows() {
        let gpu = |device_type: &str| probe::GpuInfo {
            name: "GPU".into(),
            device_type: device_type.into(),
            device_local_bytes: 1 << 30,
            vendor_id: 1,
        };
        let discrete = probe::ProbeOutcome {
            usable: true,
            gpus: vec![gpu("discrete")],
        };
        let integrated = probe::ProbeOutcome {
            usable: true,
            gpus: vec![gpu("integrated")],
        };
        assert!(streaming_supported(false, None, Some(Backend::Metal)), "macOS: Metal");
        assert!(
            !streaming_supported(false, None, Some(Backend::Cpu)),
            "macOS: asr-worker chạy CPU"
        );
        assert!(!streaming_supported(false, None, None), "chưa biết thiết bị");
        assert!(
            streaming_supported(true, Some(&discrete), Some(Backend::Vulkan)),
            "Windows: card rời"
        );
        assert!(
            !streaming_supported(true, Some(&integrated), Some(Backend::Vulkan)),
            "Windows: chỉ GPU tích hợp"
        );
        assert!(
            !streaming_supported(true, Some(&discrete), Some(Backend::Cpu)),
            "asr-worker đã chuyển sang CPU"
        );
        assert!(
            !streaming_supported(true, None, Some(Backend::Vulkan)),
            "chưa có kết quả dò"
        );
    }

    /// QĐ2 của kế hoạch 03 (spec 2026-10-10 §5, §6.3): lần dò GPU lúc mở app (Windows) cho kết quả chưa đủ sức (chỉ có GPU
    /// tích hợp, hay không có GPU dùng được) thì ghi máy chưa đủ nhanh ngay, chưa cần phiên nào, và báo giao diện qua
    /// `app://status`; card rời hay dò quá giờ thì không. Đang có phiên bắt đầu thì để lần bắt đầu tự quyết.
    #[test]
    fn a_gpu_probe_at_launch_notes_a_slow_machine() {
        use crate::state::{AppState, SessionStatus};
        use tauri::Listener;
        let found = |device_type: &str| {
            Some(probe::ProbeOutcome {
                usable: true,
                gpus: vec![probe::GpuInfo {
                    name: "GPU".into(),
                    device_type: device_type.into(),
                    device_local_bytes: 1 << 30,
                    vendor_id: 1,
                }],
            })
        };
        // (máy chưa đủ nhanh, giao diện đã nhận `streamingTooSlow: true`) sau lần dò cho `outcome`, phiên ở `session`.
        let launch = |session: SessionStatus, outcome: Option<probe::ProbeOutcome>| {
            let app = crate::test_support::mock_app();
            app.manage(GpuProbe::default());
            app.state::<AppState>().update_status(|s| s.session = session);
            let told = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
            let sink = told.clone();
            app.listen_any(crate::events::STATUS_CHANGED, move |e| {
                sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap());
            });
            probe_at_launch(app.handle(), || outcome);
            let noted = app.state::<AppState>().status().streaming_too_slow;
            let told = told.lock().unwrap().iter().any(|s| s["streamingTooSlow"] == true);
            (noted, told)
        };
        assert_eq!(
            launch(SessionStatus::Idle, found("integrated")),
            (true, true),
            "chỉ có GPU tích hợp"
        );
        assert_eq!(
            launch(SessionStatus::Idle, Some(probe::ProbeOutcome::default())),
            (true, true),
            "không có GPU dùng được"
        );
        assert_eq!(
            launch(SessionStatus::Idle, found("discrete")),
            (false, false),
            "card rời"
        );
        assert_eq!(
            launch(SessionStatus::Idle, None),
            (false, false),
            "dò quá giờ: chưa biết"
        );
        assert_eq!(
            launch(SessionStatus::Starting, found("integrated")),
            (false, false),
            "đang bắt đầu phiên: lần bắt đầu tự quyết"
        );
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
