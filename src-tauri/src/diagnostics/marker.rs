//! Dấu vết của lần chạy trước, để báo cáo `crash` (spec 2026-10-17-diagnostics-reports-design.md §1).
//!
//! - **`run.marker`**: ghi lúc khởi động, xóa khi app thoát bình thường (`RunEvent::Exit`). Lần mở sau còn thấy nó nghĩa là lần
//!   chạy trước chết không qua đường thoát (`unclean_exit`). Mọi đường thoát có chủ ý đều qua `RunEvent::Exit`: menu khay
//!   (`app.exit`), cập nhật (`request_restart`), macOS tắt máy hay đăng xuất (`applicationWillTerminate:` → `LoopDestroyed`),
//!   Windows tắt máy hay đăng xuất (`tao` 0.37 xử lý `WM_ENDSESSION` bằng `loop_destroyed()` rồi `process::exit`, nên cũng qua
//!   `RunEvent::Exit`). Plugin cập nhật trên Windows còn gọi `process::exit` sau `install_on_exit`, nên marker phải xóa trước đó.
//! - **`panic.json`**: panic hook ghi vị trí và câu panic trước khi bản phát hành abort (`panic = "abort"`).
//! - Máy khởi động lại từ lúc ghi marker (mất điện, tắt máy cưỡng bức, kernel panic) không phải lỗi của app: không báo.
//!
//! Plugin single-instance bảo đảm chỉ một bản app chạy, nên marker còn lại luôn của một lần chạy đã chết.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::report::{MAX_MESSAGE_CHARS, location_key};

const MARKER: &str = "run.marker";
const PANIC: &str = "panic.json";

#[derive(Serialize, Deserialize)]
struct Marker {
    started_at: i64,
    version: String,
}

#[derive(Serialize, Deserialize)]
struct PanicDump {
    at: i64,
    location: String,
    message: String,
}

/// Lần chạy trước của app, theo dấu vết còn lại.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PreviousRun {
    /// Thoát bình thường, hay chưa có lần chạy nào.
    Clean,
    /// Có `panic.json`: `location` đã chuẩn hóa (`location_key`), `message` chưa che.
    Panicked { at: i64, location: String, message: String },
    /// Còn `run.marker`, không có `panic.json`, và máy không khởi động lại từ đó.
    Unclean { started_at: i64 },
    /// Còn `run.marker` nhưng máy đã khởi động lại từ đó: không phải crash của app.
    RebootedSince,
}

#[derive(Clone)]
pub struct RunFiles {
    dir: PathBuf,
}

impl RunFiles {
    /// `dir`: thư mục báo cáo của app.
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn read<T: for<'de> Deserialize<'de>>(&self, name: &str) -> Option<T> {
        std::fs::read(self.dir.join(name))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
    }

    /// Gọi lúc khởi động: phân loại lần chạy trước, xóa dấu vết của nó, rồi đặt marker của lần chạy này. `boot_time`: giờ Unix
    /// (giây) máy khởi động, nếu biết.
    pub fn begin_run(&self, now: i64, boot_time: Option<i64>, version: &str) -> PreviousRun {
        let dump: Option<PanicDump> = self.read(PANIC);
        let marker: Option<Marker> = self.read(MARKER);
        let _ = std::fs::remove_file(self.dir.join(PANIC));
        let _ = std::fs::remove_file(self.dir.join(MARKER));
        if std::fs::create_dir_all(&self.dir).is_ok()
            && let Ok(bytes) = serde_json::to_vec(&Marker {
                started_at: now,
                version: version.to_string(),
            })
        {
            let _ = std::fs::write(self.dir.join(MARKER), bytes);
        }
        classify(dump, marker, boot_time)
    }

    /// App thoát bình thường: xóa marker.
    pub fn end_run(&self) {
        let _ = std::fs::remove_file(self.dir.join(MARKER));
    }

    /// Ghi panic dump. Gọi từ panic hook: không được panic, không làm gì nặng.
    pub fn record_panic(&self, at: i64, location: &str, message: &str) {
        let dump = PanicDump {
            at,
            location: location.to_string(),
            message: message.chars().take(MAX_MESSAGE_CHARS).collect(),
        };
        if let Ok(bytes) = serde_json::to_vec(&dump) {
            let _ = std::fs::create_dir_all(&self.dir);
            let _ = std::fs::write(self.dir.join(PANIC), bytes);
        }
    }

    fn record_panic_info(&self, info: &std::panic::PanicHookInfo<'_>) {
        let location = info
            .location()
            .map_or_else(|| "không rõ".to_string(), |l| location_key(l.file(), l.line()));
        let payload = info.payload();
        let message = payload
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_default();
        self.record_panic(now_secs(), &location, &message);
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }
}

fn classify(dump: Option<PanicDump>, marker: Option<Marker>, boot_time: Option<i64>) -> PreviousRun {
    if let Some(d) = dump {
        return PreviousRun::Panicked {
            at: d.at,
            location: d.location,
            message: d.message,
        };
    }
    match marker {
        None => PreviousRun::Clean,
        Some(m) if boot_time.is_some_and(|boot| boot > m.started_at) => PreviousRun::RebootedSince,
        Some(m) => PreviousRun::Unclean {
            started_at: m.started_at,
        },
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

static PANIC_FILES: OnceLock<RunFiles> = OnceLock::new();

/// Cài panic hook ghi `panic.json`, nối trước hook đang có (ở app: hook của `pipeline::process` kill tiến trình phụ rồi in
/// panic). Gọi một lần ở `setup`; lần sau không làm gì.
pub fn install_panic_dump(files: RunFiles) {
    if PANIC_FILES.set(files).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(files) = PANIC_FILES.get() {
            files.record_panic_info(info);
        }
        previous(info);
    }));
}

/// Giờ Unix (giây) máy khởi động, nếu hỏi được.
#[cfg(target_os = "macos")]
pub fn boot_time_secs(_now: i64) -> Option<i64> {
    let mut tv = libc::timeval { tv_sec: 0, tv_usec: 0 };
    let mut len = std::mem::size_of::<libc::timeval>();
    // SAFETY: `kern.boottime` là một `struct timeval`; `tv` và `len` sống suốt lời gọi.
    let rc = unsafe {
        libc::sysctlbyname(
            c"kern.boottime".as_ptr(),
            (&mut tv as *mut libc::timeval).cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    (rc == 0 && tv.tv_sec > 0).then_some(tv.tv_sec)
}

/// Windows: giờ khởi động suy từ thời gian chạy của hệ thống (`GetTickCount64`). Với Fast Startup, "khởi động" của hệ thống
/// không tính lần tắt máy rồi bật lại, nên mốc này có thể quá sớm: khi đó lần tắt máy hiện là `Unclean` chứ không bị bỏ sót.
#[cfg(windows)]
pub fn boot_time_secs(now: i64) -> Option<i64> {
    use windows::Win32::System::SystemInformation::GetTickCount64;
    // SAFETY: hàm không tham số và không có điều kiện tiên quyết.
    let uptime_ms = unsafe { GetTickCount64() };
    Some(now - i64::try_from(uptime_ms / 1000).ok()?)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn boot_time_secs(_now: i64) -> Option<i64> {
    None
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;

    const T0: i64 = 1_790_812_800;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-marker-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn the_first_run_is_clean_and_leaves_a_marker() {
        let dir = temp("first");
        let files = RunFiles::new(dir.clone());
        assert_eq!(files.begin_run(T0, None, "0.1.10"), PreviousRun::Clean);
        assert!(dir.join(MARKER).exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_normal_exit_leaves_nothing_to_report() {
        let dir = temp("normal");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, None, "0.1.10");
        files.end_run();
        assert!(!dir.join(MARKER).exists());
        assert_eq!(files.begin_run(T0 + 100, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_leftover_marker_is_an_unclean_exit_once() {
        let dir = temp("unclean");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, Some(T0 - 3_600), "0.1.10");
        assert_eq!(
            files.begin_run(T0 + 500, Some(T0 - 3_600), "0.1.10"),
            PreviousRun::Unclean { started_at: T0 }
        );
        // Lần mở thứ ba: lần thứ hai đã đặt marker mới và (giả sử) lại không thoát bình thường.
        assert_eq!(
            files.begin_run(T0 + 900, Some(T0 - 3_600), "0.1.10"),
            PreviousRun::Unclean { started_at: T0 + 500 }
        );
        files.end_run();
        assert_eq!(files.begin_run(T0 + 1_000, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_reboot_since_the_marker_is_not_a_crash() {
        let dir = temp("reboot");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, Some(T0 - 3_600), "0.1.10");
        // Lần mở sau, máy khởi động lúc T0 + 60: sau khi ghi marker.
        assert_eq!(
            files.begin_run(T0 + 900, Some(T0 + 60), "0.1.10"),
            PreviousRun::RebootedSince
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_panic_dump_wins_over_the_marker_and_is_consumed() {
        let dir = temp("panic");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, None, "0.1.10");
        files.record_panic(T0 + 5, "src-tauri/src/session.rs:12", &"ế".repeat(900));
        let PreviousRun::Panicked { at, location, message } = files.begin_run(T0 + 100, None, "0.1.10") else {
            panic!("phải là Panicked");
        };
        assert_eq!((at, location.as_str()), (T0 + 5, "src-tauri/src/session.rs:12"));
        assert_eq!(message.chars().count(), MAX_MESSAGE_CHARS);
        assert!(!dir.join(PANIC).exists());
        files.end_run();
        assert_eq!(files.begin_run(T0 + 200, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_panic_during_a_reboot_window_is_still_reported() {
        let dir = temp("panic-reboot");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, None, "0.1.10");
        files.record_panic(T0 + 5, "x.rs:1", "boom");
        assert!(matches!(
            files.begin_run(T0 + 100, Some(T0 + 50), "0.1.10"),
            PreviousRun::Panicked { .. }
        ));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_files_are_ignored_and_removed() {
        let dir = temp("corrupt");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(MARKER), b"hong").unwrap();
        std::fs::write(dir.join(PANIC), b"hong").unwrap();
        let files = RunFiles::new(dir.clone());
        assert_eq!(files.begin_run(T0, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_boot_time_is_in_the_past_when_the_os_can_tell() {
        let now = now_secs();
        match boot_time_secs(now) {
            Some(boot) => assert!(boot < now && now - boot < 5 * 365 * 86_400, "{boot} so với {now}"),
            // Hệ điều hành không hỏi được mốc khởi động: chỉ chấp nhận ở nền tảng app không hỗ trợ.
            None => {
                #[cfg(any(target_os = "macos", windows))]
                panic!("macOS và Windows phải trả được mốc khởi động");
            }
        }
    }

    /// Hook thật: ghi dump rồi gọi tiếp hook cũ. Test duy nhất cài hook toàn cục trong tiến trình test này.
    #[test]
    fn the_panic_hook_writes_the_dump_and_still_calls_the_previous_hook() {
        static PREVIOUS_CALLED: AtomicBool = AtomicBool::new(false);
        let dir = temp("hook");
        std::panic::set_hook(Box::new(|_| PREVIOUS_CALLED.store(true, Ordering::SeqCst)));
        install_panic_dump(RunFiles::new(dir.clone()));
        let result = std::thread::spawn(|| panic!("lỗi thử")).join();
        assert!(result.is_err());
        assert!(PREVIOUS_CALLED.load(Ordering::SeqCst), "hook cũ vẫn chạy");
        let dump: PanicDump = serde_json::from_slice(&std::fs::read(dir.join(PANIC)).unwrap()).unwrap();
        assert_eq!(dump.message, "lỗi thử");
        assert!(dump.location.contains("marker.rs:"), "{}", dump.location);
        let _ = std::panic::take_hook();
        std::fs::remove_dir_all(dir).unwrap();
    }
}
