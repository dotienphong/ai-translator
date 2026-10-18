//! Chọn phần log đưa vào báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2): 300 dòng cuối của `app.log`; với log
//! của `asr-worker` và `llama-server` chỉ lấy dòng cảnh báo hay lỗi, dòng nói thiết bị, cộng 60 dòng cuối, bỏ hàng trăm dòng
//! biên dịch Metal mỗi lần mở. Mỗi log bị cắt theo byte, giữ phần mới nhất. Chưa che dữ liệu ở đây (việc của `scrub`).

use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::LazyLock;

use regex::Regex;

/// Số dòng cuối của `app.log`.
pub const APP_LOG_LINES: usize = 300;
/// Số dòng cuối của log tiến trình phụ (ngoài các dòng cảnh báo hay lỗi).
pub const SIDECAR_TAIL_LINES: usize = 60;
/// Trần từng log, byte UTF-8 (cùng `LOG_LIMITS` của server, `server/src/error-reports.ts`).
pub const APP_LOG_MAX_BYTES: usize = 24 * 1024;
pub const ASR_LOG_MAX_BYTES: usize = 16 * 1024;
pub const LLAMA_LOG_MAX_BYTES: usize = 16 * 1024;
/// Một dòng dài hơn thế bị cắt (một dòng JSON hay stderr khổng lồ không được chiếm hết phần của log).
const MAX_LINE_BYTES: usize = 1024;
/// Chỉ đọc phần cuối của file lớn hơn thế (file log xoay vòng ở 1 MB, đây là lưới an toàn).
const MAX_READ_BYTES: u64 = 4 * 1024 * 1024;

/// Ba file log của app.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogFile {
    App,
    Asr,
    Llama,
}

impl LogFile {
    pub fn file_name(self) -> &'static str {
        match self {
            LogFile::App => "app.log",
            LogFile::Asr => "asr-worker.log",
            LogFile::Llama => "llama-server.log",
        }
    }
}

/// Nơi đọc log, để test thay bằng bản giả.
pub trait LogSource: Send + Sync {
    /// Nội dung log (rỗng nếu chưa có hay không đọc được).
    fn read(&self, file: LogFile) -> String;
}

/// Log thật trong thư mục log của app.
pub struct FileLogs {
    pub dir: PathBuf,
}

impl LogSource for FileLogs {
    fn read(&self, file: LogFile) -> String {
        read_tail(&self.dir.join(file.file_name())).unwrap_or_default()
    }
}

fn read_tail(path: &std::path::Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(path)?;
    let len = f.metadata()?.len();
    if len > MAX_READ_BYTES {
        f.seek(SeekFrom::Start(len - MAX_READ_BYTES))?;
    }
    let mut bytes = Vec::new();
    f.take(MAX_READ_BYTES).read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// llama-server: `0.00.289.523 W load: …` (mức W hay E sau mốc thời gian).
static LEVEL_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+(?:\.\d+){2,3} [WE] ").expect("mẫu cố định"));
static KEYWORDS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)error|fail|abort|assert|out of memory|(?-u:\b)oom(?-u:\b)|fatal|panic|crash|unable|cannot|exception",
    )
    .expect("mẫu cố định")
});

/// Dòng cảnh báo hay lỗi của log tiến trình phụ.
pub fn is_warn_or_error(line: &str) -> bool {
    LEVEL_LINE.is_match(line) || KEYWORDS.is_match(line)
}

/// Cắt dòng quá dài ở ranh giới ký tự, thêm "…".
fn cap_line(line: &str) -> String {
    let line = line.trim_end_matches('\r');
    if line.len() <= MAX_LINE_BYTES {
        return line.to_string();
    }
    let mut end = MAX_LINE_BYTES;
    while !line.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &line[..end])
}

/// Giữ các dòng mới nhất sao cho tổng (kể cả dấu xuống dòng) không quá `max_bytes`.
pub fn fit_tail(lines: &[String], max_bytes: usize) -> String {
    let mut used = 0usize;
    let mut first = lines.len();
    for (i, line) in lines.iter().enumerate().rev() {
        let cost = line.len() + 1;
        if used + cost > max_bytes {
            break;
        }
        used += cost;
        first = i;
    }
    let mut out = String::with_capacity(used);
    for line in &lines[first..] {
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// `app.log`: `APP_LOG_LINES` dòng cuối, mỗi dòng đã cắt độ dài. Chưa cắt theo byte: người gọi che dữ liệu từng dòng rồi mới
/// `fit_tail`, vì che có thể làm dòng dài ra (tên tài khoản 3 ký tự thành `<user>`).
pub fn app_lines(text: &str) -> Vec<String> {
    let all: Vec<&str> = text.lines().collect();
    let from = all.len().saturating_sub(APP_LOG_LINES);
    all[from..].iter().map(|l| cap_line(l)).collect()
}

/// Dòng nói tiến trình phụ chạy trên thiết bị nào: danh sách GPU của ggml, thiết bị whisper.cpp chọn, và các dòng trạng
/// thái `asr-worker: …` (`backend=`, `gpu=`). Mỗi lần chạy chỉ vài dòng, nhưng ở đầu lần chạy nên xa đuôi log của phiên dài.
fn is_device_line(line: &str) -> bool {
    line.starts_with("asr-worker: ")
        || line.starts_with("ggml_vulkan: ")
        || line.starts_with("whisper_backend_init_gpu: ")
}

/// Log của tiến trình phụ: dòng cảnh báo hay lỗi, dòng nói thiết bị, cộng `SIDECAR_TAIL_LINES` dòng cuối, giữ thứ tự gốc.
pub fn sidecar_lines(text: &str) -> Vec<String> {
    let all: Vec<&str> = text.lines().collect();
    let tail_from = all.len().saturating_sub(SIDECAR_TAIL_LINES);
    all.iter()
        .enumerate()
        .filter(|(i, line)| *i >= tail_from || is_warn_or_error(line) || is_device_line(line))
        .map(|(_, line)| cap_line(line))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn numbered(n: usize) -> String {
        (1..=n).map(|i| format!("dòng {i}\n")).collect()
    }

    #[test]
    fn app_tail_keeps_the_last_300_lines() {
        let out = fit_tail(&app_lines(&numbered(1_000)), 1 << 20);
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines.len(), APP_LOG_LINES);
        assert_eq!(lines.first(), Some(&"dòng 701"));
        assert_eq!(lines.last(), Some(&"dòng 1000"));
        assert!(out.ends_with('\n'));
    }

    #[test]
    fn app_tail_of_a_short_or_empty_log_is_kept_whole() {
        assert_eq!(fit_tail(&app_lines("a\nb\n"), 1 << 20), "a\nb\n");
        assert_eq!(fit_tail(&app_lines(""), 1 << 20), "");
    }

    #[test]
    fn the_byte_cap_drops_the_oldest_lines_first() {
        let out = fit_tail(&app_lines(&numbered(300)), 100);
        assert!(out.len() <= 100, "{}", out.len());
        assert!(out.lines().last() == Some("dòng 300"));
        assert!(!out.contains("dòng 1\n"));
        // Không bao giờ cắt giữa một dòng.
        assert!(out.lines().all(|l| l.starts_with("dòng ")));
    }

    #[test]
    fn a_huge_line_is_capped_at_a_char_boundary() {
        let line = "ế".repeat(2_000);
        let out = fit_tail(&app_lines(&format!("{line}\nngắn\n")), 1 << 20);
        let first = out.lines().next().unwrap();
        assert!(first.ends_with('…'));
        assert!(first.len() <= MAX_LINE_BYTES + '…'.len_utf8());
        assert_eq!(out.lines().nth(1), Some("ngắn"));
    }

    #[test]
    fn sidecar_logs_keep_warnings_and_errors_plus_the_tail_in_original_order() {
        let mut text = String::new();
        for i in 0..400 {
            text.push_str(&format!("ggml_metal_library_compile_pipeline: loaded kernel_{i}\n"));
        }
        text.insert_str(0, "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n");
        text.push_str("ggml_metal_init: error: failed to load library\n");
        for i in 0..70 {
            text.push_str(&format!("tail {i}\n"));
        }
        let lines = sidecar_lines(&text);
        let out = lines.join("\n");
        // 1 cảnh báo đầu, 1 dòng lỗi, rồi 60 dòng cuối (dòng lỗi nằm ngay trước 70 dòng đuôi nên một phần của nó đã trong đuôi).
        assert_eq!(
            lines[0],
            "0.00.289.523 W load: special_eos_id is not in special_eog_ids"
        );
        assert!(
            lines
                .iter()
                .any(|l| l == "ggml_metal_init: error: failed to load library")
        );
        assert_eq!(lines.last().map(String::as_str), Some("tail 69"));
        assert_eq!(lines.len(), 1 + 1 + 60);
        assert!(!out.contains("kernel_7\n"), "dòng biên dịch Metal bị bỏ");
    }

    /// Dòng nói tiến trình phụ chạy trên card nào nằm ở đầu mỗi lần chạy, xa đuôi log của một phiên dài: vẫn phải có trong
    /// báo cáo (máy hai GPU, báo cáo R-VBXX-951X).
    #[test]
    fn sidecar_logs_keep_the_lines_that_name_the_device_however_far_from_the_tail() {
        let mut text = String::from(
            "ggml_vulkan: Found 2 Vulkan devices:\n\
             ggml_vulkan: 0 = Intel(R) UHD Graphics (Intel Corporation) | uma: 1\n\
             ggml_vulkan: 1 = NVIDIA GeForce RTX 3050 Laptop GPU (NVIDIA) | uma: 0\n\
             whisper_backend_init_gpu: using Vulkan1 backend\n\
             asr-worker: backend=vulkan flash_attn=off decode_mode=shared\n\
             asr-worker: gpu=NVIDIA GeForce RTX 3050 Laptop GPU (GPU, 3900 MiB trống, ưu tiên GPU còn đủ bộ nhớ)\n",
        );
        for i in 0..400 {
            text.push_str(&format!("whisper_init_state: compute buffer {i}\n"));
        }
        let out = sidecar_lines(&text).join("\n");
        for kept in [
            "ggml_vulkan: 1 = NVIDIA GeForce RTX 3050 Laptop GPU",
            "whisper_backend_init_gpu: using Vulkan1 backend",
            "asr-worker: backend=vulkan",
            "asr-worker: gpu=NVIDIA GeForce RTX 3050 Laptop GPU (GPU, 3900 MiB trống, ưu tiên GPU còn đủ bộ nhớ)",
        ] {
            assert!(out.contains(kept), "thiếu: {kept}");
        }
        assert!(!out.contains("compute buffer 7\n"));
    }

    #[test]
    fn warn_and_error_detection() {
        for line in [
            "0.00.289.523 W load: x",
            "1.02.003 E srv: y",
            "ggml_metal_init: error: failed",
            "llama_model_load: error loading model",
            "Out of memory",
            "thread panicked at",
            "OOM killer",
            "unable to open",
        ] {
            assert!(is_warn_or_error(line), "{line}");
        }
        for line in [
            "0.00.904.048 I cmn init: llama threadpool init, n_threads = 8",
            "ggml_metal_library_compile_pipeline: loaded kernel_mul_mv_q5_1_f32",
            "app us.zoom.xos đang phát",
            "whisper_init_state: compute buffer",
        ] {
            assert!(!is_warn_or_error(line), "{line}");
        }
    }

    #[test]
    fn file_logs_read_the_three_files_and_missing_ones_are_empty() {
        let dir = std::env::temp_dir().join(format!("mt-logs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("app.log"), "một\nhai\n").unwrap();
        let logs = FileLogs { dir: dir.clone() };
        assert_eq!(logs.read(LogFile::App), "một\nhai\n");
        assert_eq!(logs.read(LogFile::Asr), "");
        assert_eq!(logs.read(LogFile::Llama), "");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_non_utf8_log_is_read_lossily() {
        let dir = std::env::temp_dir().join(format!("mt-logs-bad-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("app.log"), [b'o', b'k', 0xff, b'\n']).unwrap();
        let text = FileLogs { dir: dir.clone() }.read(LogFile::App);
        assert!(text.starts_with("ok") && text.contains('\u{fffd}'));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
