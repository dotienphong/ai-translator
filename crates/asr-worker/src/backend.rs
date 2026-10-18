//! Thiết bị thật mà whisper.cpp dùng để chạy model (spec §6.4, thông điệp `Load`), để app áp quy tắc chuyển sang CPU.
//!
//! whisper.cpp 1.8.3 (`whisper_backend_init_gpu`) dùng thiết bị ggml thứ `gpu_device` trong các thiết bị loại GPU hoặc GPU
//! tích hợp (mặc định 0) khi `use_gpu` bật; không có thiết bị nào như vậy thì lặng lẽ chạy bằng CPU. ggml-vulkan liệt kê
//! cả card rời lẫn iGPU theo thứ tự hệ thống, nên trên laptop hai GPU mặc định 0 hay rơi vào iGPU. `select_gpu` chọn
//! `gpu_device` thay mặc định (spec 2026-10-18). Ca còn sót: thiết bị có nhưng khởi tạo lỗi (whisper.cpp cũng chạy bằng
//! CPU) vẫn bị báo là GPU; log của worker có dòng `failed to initialize` cho ca này.

use asr_protocol::Backend;
use std::ffi::CStr;
use whisper_rs_sys::{
    ggml_backend_dev_count, ggml_backend_dev_description, ggml_backend_dev_get, ggml_backend_dev_memory,
    ggml_backend_dev_name, ggml_backend_dev_type, ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU as DEVICE_GPU,
    ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_IGPU as DEVICE_IGPU,
};

/// Thiết bị whisper.cpp sẽ dùng: `selected` là kết quả `select_gpu` lúc nạp model (chọn một lần, vì bộ nhớ trống đổi sau
/// khi nạp model vào card); `None` là CPU.
pub fn real_backend(selected: Option<&Selected>) -> Backend {
    match selected {
        Some(s) => backend_from_name(&s.candidate.device),
        None => Backend::Cpu,
    }
}

/// Tên thiết bị ggml ("Metal", "MTL0", "Vulkan0"…) sang `Backend`. Tên lạ thì theo feature lúc build.
pub fn backend_from_name(name: &str) -> Backend {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with("metal") || lower.starts_with("mtl") {
        Backend::Metal
    } else if lower.starts_with("vulkan") {
        Backend::Vulkan
    } else if cfg!(feature = "metal") {
        Backend::Metal
    } else {
        Backend::Vulkan
    }
}

/// Một thiết bị ggml loại GPU hay GPU tích hợp. Danh sách các thiết bị này theo đúng thứ tự đăng ký của ggml, nên chỉ số
/// trong danh sách chính là `gpu_device` mà whisper.cpp hiểu (`whisper_backend_init_gpu`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Candidate {
    /// Tên thiết bị ggml ("Vulkan1", "MTL0"…), để suy ra `Backend`.
    pub device: String,
    /// Tên card ("NVIDIA GeForce RTX 3050 Laptop GPU"), để ghi log.
    pub name: String,
    pub integrated: bool,
    /// Bộ nhớ thiết bị còn trống, MiB (ggml báo; không có ngân sách bộ nhớ thì là cả heap).
    pub free_mib: u64,
}

/// Card rời phải còn trống ít nhất chừng này mới được chọn thay thiết bị đầu tiên (spec 2026-10-18 §3).
pub const MIN_DISCRETE_FREE_MIB: u64 = 2048;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reason {
    /// Có thiết bị loại GPU (không phải iGPU) còn đủ bộ nhớ.
    Discrete,
    /// Như hành vi mặc định của whisper.cpp: thiết bị đầu tiên.
    FirstDevice,
    /// `ASR_GPU_DEVICE`.
    Forced,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Choice {
    pub index: usize,
    pub reason: Reason,
}

/// Chọn thiết bị cho whisper (spec 2026-10-18 §3). `forced`: giá trị `ASR_GPU_DEVICE` đã đọc.
pub fn choose_gpu(candidates: &[Candidate], forced: Option<usize>) -> Option<Choice> {
    if candidates.is_empty() {
        return None;
    }
    if let Some(index) = forced.filter(|&i| i < candidates.len()) {
        return Some(Choice {
            index,
            reason: Reason::Forced,
        });
    }
    // Bằng nhau về bộ nhớ trống thì lấy chỉ số nhỏ hơn (`max_by_key` giữ phần tử cuối, nên so thêm `Reverse`).
    let discrete = candidates
        .iter()
        .enumerate()
        .filter(|(_, c)| !c.integrated && c.free_mib >= MIN_DISCRETE_FREE_MIB)
        .max_by_key(|&(i, c)| (c.free_mib, std::cmp::Reverse(i)));
    Some(match discrete {
        Some((index, _)) => Choice {
            index,
            reason: Reason::Discrete,
        },
        None => Choice {
            index: 0,
            reason: Reason::FirstDevice,
        },
    })
}

/// `ASR_GPU_DEVICE`: chỉ số thiết bị ép dùng, khi đo. Không phải số nguyên không âm thì bỏ qua.
pub fn forced_from(value: Option<&str>) -> Option<usize> {
    value.and_then(|v| v.trim().parse().ok())
}

/// Phần sau `asr-worker: ` của dòng log nói whisper chạy trên thiết bị nào.
pub fn describe(candidate: &Candidate, reason: Reason) -> String {
    // Theo phân loại của ggml: GPU hay GPU tích hợp (Apple Silicon là "GPU", không phải "card rời").
    let kind = if candidate.integrated { "iGPU" } else { "GPU" };
    let why = match reason {
        Reason::Discrete => "ưu tiên GPU còn đủ bộ nhớ",
        Reason::FirstDevice => "giữ thiết bị đầu",
        Reason::Forced => "ép bằng ASR_GPU_DEVICE",
    };
    format!(
        "gpu={} ({kind}, {} MiB trống, {why})",
        candidate.name, candidate.free_mib
    )
}

/// Thiết bị đã chọn cho whisper và lý do.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Selected {
    pub candidate: Candidate,
    pub choice: Choice,
}

/// Chọn thiết bị cho whisper theo `choose_gpu`, đọc `ASR_GPU_DEVICE`. Gọi trước khi tạo context (ggml đăng ký các backend
/// ngay lần đầu hỏi thiết bị, như `whisper_backend_init_gpu` vẫn làm). Không có GPU thì `None`.
pub fn select_gpu() -> Option<Selected> {
    let candidates = gpu_candidates();
    let forced = forced_from(std::env::var("ASR_GPU_DEVICE").ok().as_deref());
    let choice = choose_gpu(&candidates, forced)?;
    Some(Selected {
        candidate: candidates[choice.index].clone(),
        choice,
    })
}

/// Các thiết bị ggml loại GPU hay GPU tích hợp theo thứ tự đăng ký: đúng vòng lặp của `whisper_backend_init_gpu`, nên chỉ
/// số trong danh sách là `gpu_device`.
fn gpu_candidates() -> Vec<Candidate> {
    // SAFETY: các hàm đăng ký thiết bị của ggml chỉ đọc bảng thiết bị tĩnh; `dev` do ggml sở hữu, sống tới hết tiến
    // trình; tên và mô tả là chuỗi C kết thúc bằng NUL (hoặc null); `free` và `total` sống suốt lời gọi.
    unsafe {
        let text = |p: *const std::os::raw::c_char| {
            if p.is_null() {
                String::new()
            } else {
                CStr::from_ptr(p).to_string_lossy().into_owned()
            }
        };
        (0..ggml_backend_dev_count())
            .filter_map(|i| {
                let dev = ggml_backend_dev_get(i);
                let kind = ggml_backend_dev_type(dev);
                if kind != DEVICE_GPU && kind != DEVICE_IGPU {
                    return None;
                }
                let (mut free, mut total) = (0usize, 0usize);
                ggml_backend_dev_memory(dev, &mut free, &mut total);
                let device = text(ggml_backend_dev_name(dev));
                let description = text(ggml_backend_dev_description(dev));
                Some(Candidate {
                    name: if description.is_empty() {
                        device.clone()
                    } else {
                        description
                    },
                    device,
                    integrated: kind == DEVICE_IGPU,
                    free_mib: (free >> 20) as u64,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_names_map_to_backends() {
        assert_eq!(backend_from_name("Metal"), Backend::Metal);
        assert_eq!(backend_from_name("MTL0"), Backend::Metal);
        assert_eq!(backend_from_name("Vulkan0"), Backend::Vulkan);
        assert_eq!(backend_from_name("vulkan1"), Backend::Vulkan);
    }

    fn gpu(name: &str, free_mib: u64) -> Candidate {
        Candidate {
            device: "Vulkan0".into(),
            name: name.into(),
            integrated: false,
            free_mib,
        }
    }

    fn igpu(name: &str, free_mib: u64) -> Candidate {
        Candidate {
            integrated: true,
            ..gpu(name, free_mib)
        }
    }

    fn pick(candidates: &[Candidate]) -> Option<(usize, Reason)> {
        choose_gpu(candidates, None).map(|c| (c.index, c.reason))
    }

    #[test]
    fn no_gpu_means_no_choice() {
        assert_eq!(pick(&[]), None);
        assert_eq!(choose_gpu(&[], Some(0)), None);
    }

    #[test]
    fn a_single_device_is_the_first_device() {
        assert_eq!(pick(&[gpu("Metal", 20_000)]), Some((0, Reason::Discrete)));
        assert_eq!(pick(&[igpu("Vulkan0", 8_000)]), Some((0, Reason::FirstDevice)));
    }

    /// Ca của báo cáo R-VBXX-951X: Intel UHD đứng đầu danh sách, RTX 3050 Laptop 4 GB đứng sau.
    #[test]
    fn a_discrete_card_beats_an_integrated_gpu_listed_first() {
        let devices = [
            igpu("Intel(R) UHD Graphics", 16_000),
            gpu("NVIDIA GeForce RTX 3050 Laptop GPU", 4_000),
        ];
        assert_eq!(pick(&devices), Some((1, Reason::Discrete)));
    }

    #[test]
    fn the_discrete_card_with_the_most_free_memory_wins() {
        let devices = [gpu("A", 4_000), gpu("B", 8_000), gpu("C", 8_000)];
        assert_eq!(pick(&devices), Some((1, Reason::Discrete)));
    }

    /// Card rời quá nhỏ thì giữ hành vi cũ, để không đổi một lần chạy được trên iGPU thành lần hết bộ nhớ rồi sang CPU.
    #[test]
    fn a_discrete_card_below_the_threshold_keeps_the_old_behaviour() {
        let devices = [igpu("Intel", 16_000), gpu("MX450", MIN_DISCRETE_FREE_MIB - 1)];
        assert_eq!(pick(&devices), Some((0, Reason::FirstDevice)));
        let devices = [igpu("Intel", 16_000), gpu("GTX 1650", MIN_DISCRETE_FREE_MIB)];
        assert_eq!(pick(&devices), Some((1, Reason::Discrete)));
    }

    #[test]
    fn only_integrated_gpus_keep_the_first_device() {
        assert_eq!(
            pick(&[igpu("A", 8_000), igpu("B", 12_000)]),
            Some((0, Reason::FirstDevice))
        );
    }

    #[test]
    fn a_valid_forced_index_wins_over_the_rule() {
        let devices = [igpu("Intel", 16_000), gpu("NVIDIA", 8_000)];
        let forced = choose_gpu(&devices, Some(0)).unwrap();
        assert_eq!((forced.index, forced.reason), (0, Reason::Forced));
        // Chỉ số ngoài danh sách bị bỏ qua, theo quy tắc thường.
        assert_eq!(
            choose_gpu(&devices, Some(2)).map(|c| (c.index, c.reason)),
            Some((1, Reason::Discrete))
        );
    }

    #[test]
    fn the_forced_index_is_read_from_the_environment_value() {
        assert_eq!(forced_from(Some("1")), Some(1));
        assert_eq!(forced_from(Some(" 0 ")), Some(0));
        assert_eq!(forced_from(Some("-1")), None);
        assert_eq!(forced_from(Some("card rời")), None);
        assert_eq!(forced_from(None), None);
    }

    #[test]
    fn the_log_line_names_the_device_and_the_reason() {
        let line = describe(&gpu("NVIDIA GeForce RTX 3050 Laptop GPU", 3_900), Reason::Discrete);
        assert_eq!(
            line,
            "gpu=NVIDIA GeForce RTX 3050 Laptop GPU (GPU, 3900 MiB trống, ưu tiên GPU còn đủ bộ nhớ)"
        );
        assert_eq!(
            describe(&igpu("Intel(R) UHD Graphics", 16_000), Reason::FirstDevice),
            "gpu=Intel(R) UHD Graphics (iGPU, 16000 MiB trống, giữ thiết bị đầu)"
        );
        assert!(describe(&gpu("X", 1), Reason::Forced).ends_with("ép bằng ASR_GPU_DEVICE)"));
    }

    #[test]
    fn no_selected_device_means_cpu() {
        assert_eq!(real_backend(None), Backend::Cpu);
    }

    /// Thiết bị báo về là thiết bị đã chọn (card rời), không phải thiết bị đầu tiên của ggml.
    #[test]
    fn the_reported_backend_follows_the_selected_device() {
        let selected = |device: &str| Selected {
            candidate: Candidate {
                device: device.into(),
                ..gpu("x", 4_000)
            },
            choice: Choice {
                index: 1,
                reason: Reason::Discrete,
            },
        };
        assert_eq!(real_backend(Some(&selected("Vulkan1"))), Backend::Vulkan);
        assert_eq!(real_backend(Some(&selected("MTL0"))), Backend::Metal);
    }

    /// Không bật Metal hay Vulkan thì ggml không có thiết bị GPU nào: xin GPU vẫn ra CPU.
    #[cfg(not(any(feature = "metal", feature = "vulkan")))]
    #[test]
    fn without_a_gpu_backend_the_real_device_is_cpu() {
        assert!(select_gpu().is_none());
        assert_eq!(real_backend(select_gpu().as_ref()), Backend::Cpu);
    }

    /// Build có Metal trên Mac Apple Silicon: thiết bị GPU là Metal.
    #[cfg(all(feature = "metal", target_os = "macos"))]
    #[test]
    fn metal_build_reports_metal() {
        let selected = select_gpu().expect("Metal có một thiết bị");
        assert_eq!(selected.choice.index, 0, "một thiết bị: không đổi so với trước");
        assert_eq!(real_backend(Some(&selected)), Backend::Metal);
    }
}
