//! Dấu vết của lần chạy trước, để báo cáo `crash` (spec 2026-10-17-diagnostics-reports-design.md §1).
//!
//! - **`run.marker`**: ghi lúc khởi động, xóa khi app thoát bình thường (`RunEvent::Exit`). Lần mở sau còn thấy nó nghĩa là lần
//!   chạy trước chết không qua đường thoát (`unclean_exit`). Mọi đường thoát có chủ ý đều qua `RunEvent::Exit`: menu khay
//!   (`app.exit`), cập nhật (`request_restart`), macOS tắt máy hay đăng xuất (`applicationWillTerminate:` → `LoopDestroyed`),
//!   Windows tắt máy hay đăng xuất (`tao` 0.37 xử lý `WM_ENDSESSION` bằng `loop_destroyed()` rồi `process::exit`, nên cũng qua
//!   `RunEvent::Exit`). Plugin cập nhật trên Windows còn gọi `process::exit` sau `install_on_exit`, nên marker phải xóa trước đó.
//! - **`panic.json`**: panic hook ghi vị trí và câu panic trước khi bản phát hành abort (`panic = "abort"`).
//! - Máy khởi động lại, hay người dùng đăng nhập lại (Windows tắt máy với Fast Startup không reset giờ chạy của hệ thống nhưng
//!   mở phiên đăng nhập mới), từ lúc ghi marker (mất điện, tắt máy cưỡng bức, kernel panic, hệ điều hành kill app lúc tắt máy hay
//!   đăng xuất) không phải lỗi của app: không báo.
//! - Tên hai file trên là của bản phát hành. Bản debug dùng `run.debug.marker` và `panic.debug.json` trong cùng thư mục (xem
//!   `MARKER`), nên hai bản không đọc dấu của nhau.
//!
//! Plugin single-instance bảo đảm chỉ một bản app chạy, nên marker còn lại luôn của một lần chạy đã chết.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::report::{MAX_MESSAGE_CHARS, location_key};

// Bản debug (`tauri dev`) và bản phát hành đã cài dùng chung thư mục dữ liệu vì cùng identifier, nên mỗi bên giữ file riêng:
// bản này không đọc dấu của bản kia. Nếu không, dấu của một bản debug chết không qua đường thoát (Ctrl+C `tauri dev`, kill)
// sẽ được bản phát hành báo thành `crash` của chính nó, kèm `build: "release"` và log lẫn của hai bản (báo cáo thật
// `R-4C5A-RG44`, 2026-10-24).
#[cfg(debug_assertions)]
const MARKER: &str = "run.debug.marker";
#[cfg(not(debug_assertions))]
const MARKER: &str = "run.marker";
#[cfg(debug_assertions)]
const PANIC: &str = "panic.debug.json";
#[cfg(not(debug_assertions))]
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
    /// Còn `run.marker` nhưng máy đã khởi động lại, hay người dùng đã đăng nhập lại, từ đó: không phải crash của app.
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

    /// Gọi lúc khởi động: phân loại lần chạy trước, xóa dấu vết của nó, rồi đặt marker của lần chạy này. `restart_time`: giờ Unix
    /// (giây) máy khởi động, hay người dùng đăng nhập, lần gần nhất (`restart_time_secs`), nếu biết.
    pub fn begin_run(&self, now: i64, restart_time: Option<i64>, version: &str) -> PreviousRun {
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
        classify(dump, marker, restart_time)
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

fn classify(dump: Option<PanicDump>, marker: Option<Marker>, restart_time: Option<i64>) -> PreviousRun {
    if let Some(d) = dump {
        return PreviousRun::Panicked {
            at: d.at,
            location: d.location,
            message: d.message,
        };
    }
    match marker {
        None => PreviousRun::Clean,
        Some(m) if restart_time.is_some_and(|restart| restart > m.started_at) => PreviousRun::RebootedSince,
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

/// Giờ Unix (giây) máy khởi động, hay người dùng đăng nhập, lần gần nhất; nếu hỏi được.
#[cfg(target_os = "macos")]
pub fn restart_time_secs(_now: i64) -> Option<i64> {
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

/// Windows: lấy mốc muộn hơn của hai mốc.
/// - Giờ khởi động suy từ thời gian chạy của hệ thống (`GetTickCount64`). Với Fast Startup, "khởi động" của hệ thống không tính
///   lần tắt máy rồi bật lại, nên mốc này có thể quá sớm.
/// - Giờ đăng nhập của phiên hiện tại (`WTSSessionInfo`). Tắt máy hay đăng xuất luôn kết thúc phiên đăng nhập, kể cả với Fast
///   Startup, nên lần mở sau tắt máy luôn có mốc này sau marker. Nhờ nó, app bị hệ điều hành kill lúc tắt máy (hết thời gian
///   chờ, hay bị tắt cưỡng bức giữa chừng) không bị báo thành `crash` (báo cáo thật `R-FY4C-4WXX`, 2026-10-30).
#[cfg(windows)]
pub fn restart_time_secs(now: i64) -> Option<i64> {
    use windows::Win32::System::SystemInformation::GetTickCount64;
    // SAFETY: hàm không tham số và không có điều kiện tiên quyết.
    let uptime_ms = unsafe { GetTickCount64() };
    let boot = i64::try_from(uptime_ms / 1000).ok().map(|uptime| now - uptime);
    latest(boot, logon_time_secs())
}

/// Giờ Unix (giây) người dùng đăng nhập phiên hiện tại, nếu hỏi được.
#[cfg(windows)]
fn logon_time_secs() -> Option<i64> {
    use windows::Win32::System::RemoteDesktop::{
        WTS_CURRENT_SERVER_HANDLE, WTS_CURRENT_SESSION, WTSFreeMemory, WTSINFOW, WTSQuerySessionInformationW,
        WTSSessionInfo,
    };
    use windows::core::PWSTR;

    let mut buffer = PWSTR::null();
    let mut len = 0u32;
    // SAFETY: `buffer` và `len` sống suốt lời gọi; khi thành công, `buffer` trỏ tới một `WTSINFOW` do WTS cấp phát và chỉ được
    // đọc khi `len` đủ lớn, rồi giải phóng đúng một lần bằng `WTSFreeMemory`.
    unsafe {
        WTSQuerySessionInformationW(
            Some(WTS_CURRENT_SERVER_HANDLE),
            WTS_CURRENT_SESSION,
            WTSSessionInfo,
            &mut buffer,
            &mut len,
        )
        .ok()?;
        let filetime = (len as usize >= std::mem::size_of::<WTSINFOW>() && !buffer.is_null())
            .then(|| std::ptr::read_unaligned(buffer.0.cast::<WTSINFOW>()).LogonTime);
        WTSFreeMemory(buffer.0.cast());
        filetime.and_then(filetime_to_unix_secs)
    }
}

/// `FILETIME` (số khoảng 100 ns từ 1601-01-01) sang giờ Unix (giây). 0 nghĩa là Windows không biết giờ đăng nhập.
#[cfg(any(windows, test))]
fn filetime_to_unix_secs(filetime: i64) -> Option<i64> {
    const UNIX_EPOCH_AS_FILETIME_SECS: i64 = 11_644_473_600;
    (filetime > 0).then(|| filetime / 10_000_000 - UNIX_EPOCH_AS_FILETIME_SECS)
}

/// Mốc muộn hơn của hai mốc, nếu có mốc nào.
#[cfg(any(windows, test))]
fn latest(a: Option<i64>, b: Option<i64>) -> Option<i64> {
    match (a, b) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (a, b) => a.or(b),
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn restart_time_secs(_now: i64) -> Option<i64> {
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

    /// Bản debug (`tauri dev`) và bản phát hành đã cài dùng chung thư mục dữ liệu vì cùng identifier. Dấu của bản debug chết
    /// không qua đường thoát không được bản phát hành báo thành `crash` của chính nó (báo cáo thật `R-4C5A-RG44`, 2026-10-24).
    #[test]
    fn a_marker_or_panic_dump_left_by_the_other_build_kind_is_not_ours() {
        let dir = temp("other-build");
        std::fs::create_dir_all(&dir).unwrap();
        let (other_marker, other_panic) = if cfg!(debug_assertions) {
            ("run.marker", "panic.json")
        } else {
            ("run.debug.marker", "panic.debug.json")
        };
        std::fs::write(
            dir.join(other_marker),
            br#"{"started_at":1790812800,"version":"0.2.7"}"#,
        )
        .unwrap();
        std::fs::write(
            dir.join(other_panic),
            br#"{"at":1790812900,"location":"x.rs:1","message":"boom"}"#,
        )
        .unwrap();
        let files = RunFiles::new(dir.clone());
        assert_eq!(files.begin_run(T0 + 500, None, "0.2.7"), PreviousRun::Clean);
        assert!(
            dir.join(other_marker).exists(),
            "dấu của bản kia còn nguyên cho chính nó"
        );
        assert!(
            dir.join(other_panic).exists(),
            "panic dump của bản kia còn nguyên cho chính nó"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// Windows tắt máy với Fast Startup: giờ chạy của hệ thống không reset (mốc khởi động trước marker) nhưng phiên đăng nhập là
    /// phiên mới (mốc đăng nhập sau marker). App bị kill lúc tắt máy không phải crash (báo cáo thật `R-FY4C-4WXX`, 2026-10-30).
    #[test]
    fn a_new_logon_after_the_marker_is_not_a_crash_even_when_the_boot_time_is_older() {
        let dir = temp("logon");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, Some(T0 - 3_600), "0.3.1");
        let restart = latest(Some(T0 - 3_600), Some(T0 + 60));
        assert_eq!(files.begin_run(T0 + 900, restart, "0.3.1"), PreviousRun::RebootedSince);
        // Crash trong cùng phiên đăng nhập (đăng nhập trước marker) vẫn là `Unclean`.
        let restart = latest(Some(T0 - 3_600), Some(T0 - 100));
        assert_eq!(
            files.begin_run(T0 + 1_800, restart, "0.3.1"),
            PreviousRun::Unclean { started_at: T0 + 900 }
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_latest_restart_wins_and_a_missing_one_is_ignored() {
        assert_eq!(latest(Some(5), Some(9)), Some(9));
        assert_eq!(latest(Some(9), Some(5)), Some(9));
        assert_eq!(latest(None, Some(5)), Some(5));
        assert_eq!(latest(Some(5), None), Some(5));
        assert_eq!(latest(None, None), None);
    }

    #[test]
    fn a_filetime_converts_to_unix_seconds_and_zero_means_unknown() {
        // 2026-10-30 00:00:00 UTC.
        assert_eq!(
            filetime_to_unix_secs((1_793_318_400 + 11_644_473_600) * 10_000_000),
            Some(1_793_318_400)
        );
        assert_eq!(filetime_to_unix_secs(0), None);
    }

    #[test]
    fn the_restart_time_is_in_the_past_when_the_os_can_tell() {
        let now = now_secs();
        match restart_time_secs(now) {
            Some(boot) => assert!(boot <= now && now - boot < 5 * 365 * 86_400, "{boot} so với {now}"),
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
