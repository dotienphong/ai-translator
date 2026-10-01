//! Thiết bị thật mà whisper.cpp dùng để chạy model (spec §6.4, thông điệp `Load`), để app áp quy tắc chuyển sang CPU.
//!
//! whisper.cpp 1.8.3 (`whisper_backend_init_gpu`) chọn thiết bị ggml đầu tiên có loại GPU hoặc GPU tích hợp khi
//! `use_gpu` bật; không có thiết bị nào như vậy thì lặng lẽ chạy bằng CPU. Hàm ở đây dò đúng theo luật đó. Ca còn sót:
//! thiết bị có nhưng khởi tạo lỗi (whisper.cpp cũng chạy bằng CPU) vẫn bị báo là GPU; log của worker có dòng
//! `failed to initialize` cho ca này.

use asr_protocol::Backend;
use std::ffi::CStr;
use whisper_rs_sys::{
    ggml_backend_dev_count, ggml_backend_dev_get, ggml_backend_dev_name, ggml_backend_dev_type,
    ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU as DEVICE_GPU,
    ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_IGPU as DEVICE_IGPU,
};

/// Thiết bị whisper.cpp sẽ dùng với `use_gpu`. Gọi sau khi nạp model (lúc đó ggml đã đăng ký các backend).
pub fn real_backend(use_gpu: bool) -> Backend {
    if !use_gpu {
        return Backend::Cpu;
    }
    match first_gpu_name() {
        Some(name) => backend_from_name(&name),
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

fn first_gpu_name() -> Option<String> {
    // SAFETY: các hàm đăng ký thiết bị của ggml chỉ đọc bảng thiết bị tĩnh; `dev` do ggml sở hữu, sống tới hết tiến
    // trình, và tên là chuỗi C kết thúc bằng NUL.
    unsafe {
        for i in 0..ggml_backend_dev_count() {
            let dev = ggml_backend_dev_get(i);
            let kind = ggml_backend_dev_type(dev);
            if kind == DEVICE_GPU || kind == DEVICE_IGPU {
                let name = ggml_backend_dev_name(dev);
                return Some(if name.is_null() {
                    String::new()
                } else {
                    CStr::from_ptr(name).to_string_lossy().into_owned()
                });
            }
        }
    }
    None
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

    #[test]
    fn cpu_is_requested_explicitly() {
        assert_eq!(real_backend(false), Backend::Cpu);
    }

    /// Không bật Metal hay Vulkan thì ggml không có thiết bị GPU nào: xin GPU vẫn ra CPU.
    #[cfg(not(any(feature = "metal", feature = "vulkan")))]
    #[test]
    fn without_a_gpu_backend_the_real_device_is_cpu() {
        assert_eq!(real_backend(true), Backend::Cpu);
    }

    /// Build có Metal trên Mac Apple Silicon: thiết bị GPU là Metal.
    #[cfg(all(feature = "metal", target_os = "macos"))]
    #[test]
    fn metal_build_reports_metal() {
        assert_eq!(real_backend(true), Backend::Metal);
    }
}
