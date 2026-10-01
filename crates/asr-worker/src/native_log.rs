//! Log của whisper.cpp và ggml (spec §6.4, §9). whisper-rs chỉ trả `InitError` hay `GenericError(n)`, còn lý do thật
//! (hết bộ nhớ GPU, khởi tạo Metal hay Vulkan lỗi) chỉ nằm trong log. Worker cài callback cho cả hai thư viện: mọi dòng
//! vẫn ra stderr như trước (file log của tiến trình phụ), và các dòng cảnh báo, lỗi gần nhất được giữ lại để
//! `engine::classify` phân loại lỗi.
//!
//! whisper.cpp và ggml không ghi âm thanh hay chữ chép lời vào log (worker tắt mọi cờ `print_*`).

use std::collections::VecDeque;
use std::ffi::{CStr, c_char, c_void};
use std::io::Write;
use std::sync::Mutex;

use whisper_rs_sys::{
    ggml_log_level, ggml_log_level_GGML_LOG_LEVEL_CONT, ggml_log_level_GGML_LOG_LEVEL_ERROR,
    ggml_log_level_GGML_LOG_LEVEL_WARN,
};

/// Số dòng cảnh báo, lỗi giữ lại.
pub const KEEP: usize = 20;

static RECENT: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
/// Dòng trước có được giữ không, để dòng nối tiếp (`GGML_LOG_LEVEL_CONT`) theo cùng.
static LAST_KEPT: Mutex<bool> = Mutex::new(false);

/// Cài callback cho whisper.cpp và ggml. Gọi một lần, trước `Load`.
pub fn install() {
    // SAFETY: hai hàm chỉ lưu con trỏ hàm; `callback` sống suốt chương trình và không dùng `user_data`.
    unsafe {
        whisper_rs_sys::whisper_log_set(Some(callback), std::ptr::null_mut());
        whisper_rs_sys::ggml_log_set(Some(callback), std::ptr::null_mut());
    }
}

/// Callback của whisper.cpp và ggml.
///
/// # Safety
/// `text` là null hoặc một chuỗi C kết thúc bằng NUL, như whisper.cpp và ggml truyền.
pub unsafe extern "C" fn callback(level: ggml_log_level, text: *const c_char, _user_data: *mut c_void) {
    if text.is_null() {
        return;
    }
    // SAFETY: theo hợp đồng của hàm.
    let text = unsafe { CStr::from_ptr(text) }.to_string_lossy();
    let _ = std::io::stderr().write_all(text.as_bytes());
    record(level, &text);
}

/// Giữ dòng nếu là cảnh báo, lỗi, hay có chữ "error"/"failed"; dòng nối tiếp theo dòng trước.
pub fn record(level: ggml_log_level, text: &str) {
    let mut last = LAST_KEPT.lock().unwrap_or_else(|e| e.into_inner());
    let lower = text.to_lowercase();
    let keep = if level == ggml_log_level_GGML_LOG_LEVEL_CONT {
        *last
    } else {
        level == ggml_log_level_GGML_LOG_LEVEL_WARN
            || level == ggml_log_level_GGML_LOG_LEVEL_ERROR
            || lower.contains("error")
            || lower.contains("failed")
    };
    *last = keep;
    if !keep || text.trim().is_empty() {
        return;
    }
    let mut recent = RECENT.lock().unwrap_or_else(|e| e.into_inner());
    if recent.len() == KEEP {
        recent.pop_front();
    }
    recent.push_back(text.trim().to_string());
}

/// Các dòng đã giữ, cũ trước.
pub fn recent() -> Vec<String> {
    RECENT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .cloned()
        .collect()
}

/// Thông báo lỗi gửi cho app (`Response::Error.message`, app ghi vào log của nó): lỗi của worker, kèm các dòng cảnh
/// báo, lỗi của whisper.cpp và ggml trong yêu cầu này, vì lý do thật thường chỉ nằm ở đó.
pub fn describe(err: &anyhow::Error) -> String {
    let log = recent();
    if log.is_empty() {
        format!("{err:#}")
    } else {
        format!("{err:#} (log của whisper.cpp: {})", log.join(" | "))
    }
}

/// Bỏ các dòng đã giữ. Gọi trước mỗi yêu cầu, để lỗi của yêu cầu sau không bị xếp theo log của yêu cầu trước.
pub fn clear() {
    RECENT.lock().unwrap_or_else(|e| e.into_inner()).clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use asr_protocol::ErrorKind;
    use whisper_rs_sys::ggml_log_level_GGML_LOG_LEVEL_INFO;

    /// Biến toàn cục: các test của file này chạy lần lượt.
    static SERIAL: Mutex<()> = Mutex::new(());

    #[test]
    fn the_c_callback_keeps_warnings_and_errors_only() {
        let _g = SERIAL.lock().unwrap();
        clear();
        let line = |level, s: &str| {
            let c = std::ffi::CString::new(s).unwrap();
            // SAFETY: chuỗi C hợp lệ.
            unsafe { callback(level, c.as_ptr(), std::ptr::null_mut()) };
        };
        line(ggml_log_level_GGML_LOG_LEVEL_INFO, "whisper_init: loading model\n");
        line(
            ggml_log_level_GGML_LOG_LEVEL_ERROR,
            "ggml_metal_buffer_type_alloc_buffer: error: failed to allocate",
        );
        line(ggml_log_level_GGML_LOG_LEVEL_CONT, " buffer of size 1200 MiB\n");
        line(
            ggml_log_level_GGML_LOG_LEVEL_INFO,
            "whisper_backend_init_gpu: failed to initialize Vulkan backend\n",
        );
        // SAFETY: con trỏ null bị bỏ qua.
        unsafe {
            callback(
                ggml_log_level_GGML_LOG_LEVEL_ERROR,
                std::ptr::null(),
                std::ptr::null_mut(),
            )
        };
        assert_eq!(
            recent(),
            [
                "ggml_metal_buffer_type_alloc_buffer: error: failed to allocate",
                "buffer of size 1200 MiB",
                "whisper_backend_init_gpu: failed to initialize Vulkan backend",
            ]
        );
        clear();
        assert!(recent().is_empty());
    }

    /// Q2 của review 02 lần 2: `classify` (không phải `classify_with`) đọc đúng các dòng callback đã giữ, và thông báo
    /// lỗi gửi cho app có các dòng đó.
    #[test]
    fn classify_and_describe_read_the_kept_lines() {
        let _g = SERIAL.lock().unwrap();
        clear();
        let err = anyhow::anyhow!("không nạp được model: InitError");
        assert_eq!(
            crate::engine::classify(ErrorKind::ModelLoad, &err),
            ErrorKind::ModelLoad
        );
        assert_eq!(describe(&err), "không nạp được model: InitError");
        let c =
            std::ffi::CString::new("ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer\n").unwrap();
        // SAFETY: chuỗi C hợp lệ.
        unsafe { callback(ggml_log_level_GGML_LOG_LEVEL_ERROR, c.as_ptr(), std::ptr::null_mut()) };
        assert_eq!(
            crate::engine::classify(ErrorKind::ModelLoad, &err),
            ErrorKind::OutOfMemory
        );
        assert_eq!(
            describe(&err),
            "không nạp được model: InitError (log của whisper.cpp: \
             ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer)"
        );
        clear();
    }

    #[test]
    fn only_the_last_lines_are_kept() {
        let _g = SERIAL.lock().unwrap();
        clear();
        for i in 0..KEEP + 5 {
            record(ggml_log_level_GGML_LOG_LEVEL_WARN, &format!("warn {i}"));
        }
        let kept = recent();
        assert_eq!(kept.len(), KEEP);
        assert_eq!(kept[0], "warn 5");
        clear();
    }
}
