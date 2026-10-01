//! Chạy tiến trình phụ sao cho chúng không bị bỏ lại khi app chết (spec §5, "Việc cho MVP").
//!
//! App chính build với `panic = "abort"`, nên `Drop` không chạy khi app panic.
//! - macOS (Unix): mỗi tiến trình phụ là trưởng một process group riêng. [`install_panic_hook`] thêm một hook chạy trước khi
//!   abort, gửi `SIGKILL` cho mọi group còn sống. `asr-worker` còn tự thoát khi stdin đóng, kể cả khi app bị kill hẳn.
//! - Windows: mọi tiến trình phụ vào một Job Object có `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. App chết bằng bất kỳ cách nào
//!   thì handle của job đóng, và Windows kill cả job. Tiến trình phụ chạy với `CREATE_NO_WINDOW`, vì app là ứng dụng GUI
//!   nên tiến trình console con sẽ bật cửa sổ console.
//!
//! App bị `SIGKILL` (Force Quit) hay crash vì tín hiệu thì hook không chạy, và `llama-server` còn lại. Vì vậy trên macOS
//! mỗi tiến trình phụ còn được ghi vào một pidfile (`set_pidfile`, thường là `sidecars-live.json` trong thư mục dữ liệu
//! của app). Lần mở app sau, [`reap_orphans`] đọc file đó và kill tiến trình còn sót, chỉ khi đủ bốn điều kiện: binary
//! ghi trong file nằm trong thư mục tiến trình phụ của app, và tiến trình đang chạy ở pid đó có cùng thời điểm bắt đầu,
//! cùng đường dẫn binary, và vẫn là trưởng group của nó. Pid có thể đã được cấp lại cho tiến trình khác, nên thiếu một
//! điều kiện là không kill.
//!
//! Pidfile là của một bản app đang chạy: plugin single-instance (kế hoạch 01) bảo đảm chỉ một bản app chạy mỗi lúc, nên
//! khi `setup` của bản mới gọi [`reap_orphans`], mọi mục trong file là của một lần chạy đã chết.
//!
//! Lúc app thoát, [`begin_shutdown`] bật cờ toàn cục: từ đó [`spawn`] luôn trả lỗi, nên giám sát đang khởi động lại không
//! thể chạy thêm tiến trình sau [`kill_all`].

use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, Once};
use std::time::{Duration, Instant};

/// Một tiến trình phụ, như ghi trong pidfile.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub pid: u32,
    /// Thời điểm tiến trình bắt đầu, micro giây từ epoch (macOS: `pbi_start_tvsec`, `pbi_start_tvusec`). 0 nếu không đọc
    /// được: mục đó không bao giờ bị kill ở lần mở sau.
    pub start_us: u64,
    /// Đường dẫn thật (đã `canonicalize`) của binary.
    pub exe: PathBuf,
}

struct Registry {
    entries: Vec<Entry>,
    pidfile: Option<PathBuf>,
}

static LIVE: Mutex<Registry> = Mutex::new(Registry {
    entries: Vec::new(),
    pidfile: None,
});
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

fn registry() -> MutexGuard<'static, Registry> {
    LIVE.lock().unwrap_or_else(|e| e.into_inner())
}

impl Registry {
    fn save(&self) {
        if let Some(path) = &self.pidfile
            && let Err(e) = write_pidfile(path, &self.entries)
        {
            log::warn!("không ghi được {}: {e}", path.display());
        }
    }
}

/// Đặt cờ cho lệnh chạy tiến trình phụ, trước `spawn`.
pub fn configure(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

/// Chạy một tiến trình phụ và ghi nhận nó: vào Job Object (Windows), vào danh sách để hook panic dọn, và vào pidfile.
/// Kiểm cờ thoát, chạy và ghi nhận dưới cùng một khóa với [`kill_all`], nên không tiến trình nào lọt ra sau khi app đã
/// dọn. `exe` là binary của lệnh, ghi vào pidfile.
pub fn spawn(cmd: &mut Command, exe: &Path) -> io::Result<Child> {
    let mut reg = registry();
    if SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Err(io::Error::other("app đang thoát, không chạy thêm tiến trình phụ"));
    }
    let child = cmd.spawn()?;
    #[cfg(windows)]
    if let Err(e) = job::assign(&child) {
        log::warn!("không đưa được tiến trình phụ {} vào Job Object: {e}", child.id());
    }
    let pid = child.id();
    reg.entries.push(Entry {
        pid,
        start_us: start_time_us(pid).unwrap_or(0),
        exe: std::fs::canonicalize(exe).unwrap_or_else(|_| exe.to_path_buf()),
    });
    reg.save();
    Ok(child)
}

/// Bỏ ghi nhận sau khi tiến trình phụ đã thoát và được `wait`: pid có thể được cấp lại cho tiến trình khác.
pub fn release(pid: u32) {
    let mut reg = registry();
    let before = reg.entries.len();
    reg.entries.retain(|e| e.pid != pid);
    if reg.entries.len() != before {
        reg.save();
    }
}

/// Các tiến trình phụ đang được ghi nhận (để test và để log lúc thoát).
pub fn live() -> Vec<u32> {
    let mut pids: Vec<u32> = registry().entries.iter().map(|e| e.pid).collect();
    pids.sort_unstable();
    pids
}

/// Mục đang được ghi nhận của `pid`, nếu có.
pub fn entry(pid: u32) -> Option<Entry> {
    registry().entries.iter().find(|e| e.pid == pid).cloned()
}

/// Từ giờ ghi danh sách tiến trình phụ vào `path` (ghi file tạm rồi đổi tên). Gọi ở `setup`, sau [`reap_orphans`].
pub fn set_pidfile(path: &Path) {
    let mut reg = registry();
    reg.pidfile = Some(path.to_path_buf());
    reg.save();
}

/// Ghi `entries` vào `path`: ghi file tạm cạnh đó rồi `rename`, để lần mở sau không đọc phải file ghi dở.
pub fn write_pidfile(path: &Path, entries: &[Entry]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, serde_json::to_vec(entries).map_err(io::Error::other)?)?;
    std::fs::rename(&tmp, path)
}

/// Kill các tiến trình phụ mà lần chạy trước của app bỏ lại (Force Quit), theo pidfile ở `path`. Trả về pid đã kill.
/// Chỉ kill mục khớp cả thời điểm bắt đầu, đường dẫn binary và process group (xem đầu module), và binary nằm trong
/// `allowed_dir` (thư mục tiến trình phụ của app): pidfile có bị sửa cũng không làm app kill tiến trình nào khác. File
/// thiếu hay hỏng thì không làm gì. Trên Windows luôn trả rỗng: Job Object đã kill tiến trình phụ khi app chết.
pub fn reap_orphans(path: &Path, allowed_dir: &Path) -> Vec<u32> {
    let allowed = std::fs::canonicalize(allowed_dir).unwrap_or_else(|_| allowed_dir.to_path_buf());
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    let entries: Vec<Entry> = match serde_json::from_slice(&bytes) {
        Ok(entries) => entries,
        Err(e) => {
            log::warn!("bỏ qua {}: {e}", path.display());
            return Vec::new();
        }
    };
    let mut killed = Vec::new();
    for e in entries {
        if e.exe.starts_with(&allowed) && is_orphan_of_ours(&e) {
            log::warn!(
                "kill tiến trình phụ còn sót từ lần chạy trước: pid {} ({})",
                e.pid,
                e.exe.display()
            );
            kill_group(e.pid);
            killed.push(e.pid);
        }
    }
    killed
}

/// Tiến trình `e.pid` vẫn đúng là tiến trình đã ghi: cùng thời điểm bắt đầu, cùng binary, và vẫn là trưởng group.
fn is_orphan_of_ours(e: &Entry) -> bool {
    if e.start_us == 0 || start_time_us(e.pid) != Some(e.start_us) {
        return false;
    }
    if exe_path(e.pid).as_deref() != Some(e.exe.as_path()) {
        return false;
    }
    #[cfg(unix)]
    {
        // SAFETY: `getpgid` chỉ đọc.
        let pgid = unsafe { libc::getpgid(e.pid as libc::pid_t) };
        pgid == e.pid as libc::pid_t
    }
    #[cfg(not(unix))]
    false
}

/// Thời điểm bắt đầu của tiến trình `pid`, micro giây từ epoch.
#[cfg(target_os = "macos")]
pub fn start_time_us(pid: u32) -> Option<u64> {
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = size_of::<libc::proc_bsdinfo>() as libc::c_int;
    // SAFETY: `info` đủ chỗ cho `PROC_PIDTBSDINFO`; hàm chỉ ghi vào đó.
    let n = unsafe {
        libc::proc_pidinfo(
            pid as libc::c_int,
            libc::PROC_PIDTBSDINFO,
            0,
            (&mut info as *mut libc::proc_bsdinfo).cast(),
            size,
        )
    };
    (n == size).then(|| info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec)
}

#[cfg(not(target_os = "macos"))]
pub fn start_time_us(_pid: u32) -> Option<u64> {
    None
}

/// Đường dẫn binary của tiến trình `pid`.
#[cfg(target_os = "macos")]
fn exe_path(pid: u32) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: `buf` có đúng `PROC_PIDPATHINFO_MAXSIZE` byte.
    let n = unsafe { libc::proc_pidpath(pid as libc::c_int, buf.as_mut_ptr().cast(), buf.len() as u32) };
    (n > 0).then(|| PathBuf::from(std::ffi::OsStr::from_bytes(&buf[..n as usize])))
}

#[cfg(not(target_os = "macos"))]
fn exe_path(_pid: u32) -> Option<PathBuf> {
    None
}

/// Cách kill một tiến trình phụ từ luồng khác, không cần khóa của bên đang dùng nó (ví dụ giám sát dừng một worker đang
/// treo giữa request). Giữ chung `Child` với client, nên không bao giờ kill nhầm một pid đã được cấp lại.
#[derive(Clone)]
pub struct Killer(pub(crate) std::sync::Arc<Mutex<Child>>);

impl Killer {
    pub fn new(child: std::sync::Arc<Mutex<Child>>) -> Self {
        Self(child)
    }

    pub fn kill(&self) {
        let _ = self.0.lock().unwrap_or_else(|e| e.into_inner()).kill();
    }
}

/// Bật cờ thoát: từ giờ [`spawn`] luôn trả lỗi. Gọi trước [`kill_all`] lúc app thoát.
pub fn begin_shutdown() {
    SHUTTING_DOWN.store(true, Ordering::SeqCst);
}

pub fn shutting_down() -> bool {
    SHUTTING_DOWN.load(Ordering::SeqCst)
}

/// Gọi một lần lúc app khởi động: khi panic, kill mọi tiến trình phụ còn sống trước khi abort.
pub fn install_panic_hook() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            kill_all_from_panic();
            previous(info);
        }));
    });
}

/// Kill mọi tiến trình phụ đang được ghi nhận. Trên Windows không cần: Job Object kill cả job khi app thoát.
pub fn kill_all() {
    for e in &registry().entries {
        kill_group(e.pid);
    }
}

/// Như [`kill_all`], nhưng không chờ khóa quá 200 ms: luồng đang panic có thể chính là luồng giữ khóa.
fn kill_all_from_panic() {
    let deadline = Instant::now() + Duration::from_millis(200);
    loop {
        match LIVE.try_lock() {
            Ok(reg) => {
                reg.entries.iter().for_each(|e| kill_group(e.pid));
                return;
            }
            Err(std::sync::TryLockError::Poisoned(p)) => {
                p.into_inner().entries.iter().for_each(|e| kill_group(e.pid));
                return;
            }
            Err(std::sync::TryLockError::WouldBlock) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(std::sync::TryLockError::WouldBlock) => return,
        }
    }
}

/// Unix: gửi `SIGKILL` cho cả group của tiến trình phụ `pid` (group có id bằng pid vì `process_group(0)`).
pub fn kill_group(pid: u32) {
    #[cfg(unix)]
    // SAFETY: `killpg` chỉ gửi tín hiệu.
    unsafe {
        libc::killpg(pid as libc::pid_t, libc::SIGKILL);
    }
    #[cfg(windows)]
    let _ = pid;
}

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::sync::OnceLock;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation, SetInformationJobObject,
    };
    use windows::core::PCWSTR;

    /// Handle của job, giữ tới hết đời tiến trình (không bao giờ đóng: đóng là kill hết tiến trình phụ).
    struct Job(HANDLE);
    // SAFETY: handle của kernel object dùng được từ mọi luồng.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    fn job() -> windows::core::Result<&'static Job> {
        static JOB: OnceLock<Result<Job, windows::core::Error>> = OnceLock::new();
        JOB.get_or_init(|| {
            // SAFETY: tạo job không tên; `info` sống tới hết lệnh gọi.
            unsafe {
                let handle = CreateJobObjectW(None, PCWSTR::null())?;
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )?;
                Ok(Job(handle))
            }
        })
        .as_ref()
        .map_err(Clone::clone)
    }

    pub fn assign(child: &Child) -> windows::core::Result<()> {
        let job = job()?;
        // SAFETY: handle của `child` còn hiệu lực trong lúc `child` còn sống.
        unsafe { AssignProcessToJobObject(job.0, HANDLE(child.as_raw_handle())) }
    }
}

// Test chỉ có trên Unix: trên Windows, việc dọn tiến trình phụ là của Job Object (cần máy Windows để thử).
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn sleeper() -> Child {
        let exe = Path::new("/bin/sleep");
        let mut cmd = Command::new(exe);
        cmd.arg("30");
        configure(&mut cmd);
        spawn(&mut cmd, exe).unwrap()
    }

    fn wait_killed(child: &mut Child) -> Option<i32> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(status) = child.try_wait().unwrap() {
                use std::os::unix::process::ExitStatusExt;
                return status.signal();
            }
            if Instant::now() > deadline {
                return None;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    struct TempDir(PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn temp(name: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!("pipeline-process-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        TempDir(dir)
    }

    #[test]
    fn a_child_leads_its_own_process_group_and_is_killed_with_it() {
        let mut child = sleeper();
        let pid = child.id();
        assert!(live().contains(&pid));
        // SAFETY: chỉ đọc pgid của tiến trình con.
        let pgid = unsafe { libc::getpgid(pid as libc::pid_t) };
        assert_eq!(pgid, pid as libc::pid_t, "tiến trình phụ là trưởng group của nó");
        // Chỉ kill đúng tiến trình này: test khác chạy song song cũng có tiến trình phụ đang được ghi nhận.
        kill_group(pid);
        assert_eq!(
            wait_killed(&mut child),
            Some(libc::SIGKILL),
            "kill_group phải giết được tiến trình phụ"
        );
        release(pid);
        assert!(!live().contains(&pid));
    }

    /// N5 của review 02 lần 3: binary chạy qua một symlink thì pidfile ghi đường dẫn thật, để lần sau so được với
    /// `proc_pidpath`.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_binary_run_through_a_symlink_is_recorded_by_its_real_path() {
        let dir = temp("symlink");
        std::fs::create_dir_all(&dir.0).unwrap();
        let link = dir.0.join("sleep-link");
        std::os::unix::fs::symlink("/bin/sleep", &link).unwrap();
        let mut cmd = Command::new(&link);
        cmd.arg("30");
        configure(&mut cmd);
        let mut child = spawn(&mut cmd, &link).unwrap();
        let e = entry(child.id()).unwrap();
        assert_eq!(e.exe, std::fs::canonicalize("/bin/sleep").unwrap());
        kill_group(child.id());
        wait_killed(&mut child);
        release(child.id());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn the_pidfile_entry_names_the_start_time_and_the_real_binary() {
        let mut child = sleeper();
        let e = entry(child.id()).unwrap();
        assert!(e.start_us > 0);
        assert_eq!(start_time_us(child.id()), Some(e.start_us));
        assert_eq!(e.exe, std::fs::canonicalize("/bin/sleep").unwrap());
        assert_eq!(exe_path(child.id()).as_deref(), Some(e.exe.as_path()));
        kill_group(child.id());
        wait_killed(&mut child);
        release(child.id());
    }

    /// Lần mở sau chỉ kill tiến trình còn đúng là tiến trình đã ghi.
    #[cfg(target_os = "macos")]
    #[test]
    fn orphans_are_reaped_only_when_everything_matches() {
        let dir = temp("reap");
        let file = dir.0.join("sidecars-live.json");
        let mut child = sleeper();
        let real = entry(child.id()).unwrap();
        let wrong_start = Entry {
            start_us: real.start_us + 1,
            ..real.clone()
        };
        // Binary khác nhưng cũng nằm trong thư mục cho phép: chỉ phép so đường dẫn binary chặn được.
        let wrong_exe = Entry {
            exe: std::fs::canonicalize("/bin/ls").unwrap(),
            ..real.clone()
        };
        let unknown_start = Entry {
            start_us: 0,
            ..real.clone()
        };
        let bin = std::fs::canonicalize("/bin").unwrap();
        for e in [wrong_start, wrong_exe, unknown_start] {
            write_pidfile(&file, std::slice::from_ref(&e)).unwrap();
            assert_eq!(reap_orphans(&file, &bin), Vec::<u32>::new(), "{e:?}");
            assert_eq!(child.try_wait().unwrap(), None, "không được kill: {e:?}");
        }
        write_pidfile(&file, std::slice::from_ref(&real)).unwrap();
        // Đúng tiến trình nhưng binary nằm ngoài thư mục tiến trình phụ của app: không kill.
        assert_eq!(reap_orphans(&file, &dir.0), Vec::<u32>::new());
        assert_eq!(child.try_wait().unwrap(), None);
        assert_eq!(reap_orphans(&file, &bin), vec![real.pid]);
        assert_eq!(wait_killed(&mut child), Some(libc::SIGKILL));
        release(real.pid);
        // File thiếu hay hỏng thì không làm gì.
        std::fs::write(&file, b"{oops").unwrap();
        assert!(reap_orphans(&file, &bin).is_empty());
        assert!(reap_orphans(&dir.0.join("missing.json"), &bin).is_empty());
    }

    /// PF1 của review 02 lần 2: cùng pid, thời điểm bắt đầu và binary, nhưng tiến trình không còn là trưởng group (ở đây
    /// một tiến trình không chạy qua `configure`, nằm trong group của test): không kill.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_process_that_does_not_lead_its_group_is_not_reaped() {
        let dir = temp("reap-group");
        let file = dir.0.join("sidecars-live.json");
        let mut child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let pid = child.id();
        let e = Entry {
            pid,
            start_us: start_time_us(pid).unwrap(),
            exe: std::fs::canonicalize("/bin/sleep").unwrap(),
        };
        assert_eq!(exe_path(pid).as_deref(), Some(e.exe.as_path()));
        write_pidfile(&file, std::slice::from_ref(&e)).unwrap();
        assert!(reap_orphans(&file, &std::fs::canonicalize("/bin").unwrap()).is_empty());
        assert_eq!(child.try_wait().unwrap(), None, "không được kill");
        let _ = child.kill();
        let _ = child.wait();
    }

    /// PF5 của review 02 lần 2: mỗi lần [`spawn`] ghi ngay pidfile (nếu đã đặt), và [`release`] bỏ mục đó.
    #[test]
    fn spawn_and_release_rewrite_the_pidfile() {
        let dir = temp("pidfile");
        let file = dir.0.join("sidecars-live.json");
        set_pidfile(&file);
        let read = || -> Vec<u32> {
            let entries: Vec<Entry> = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
            entries.iter().map(|e| e.pid).collect()
        };
        let mut child = sleeper();
        let pid = child.id();
        let listed = read().contains(&pid);
        kill_group(pid);
        wait_killed(&mut child);
        release(pid);
        let after = read().contains(&pid);
        registry().pidfile = None;
        assert!(listed, "spawn phải ghi pid vào pidfile");
        assert!(!after, "release phải bỏ pid khỏi pidfile");
    }

    #[test]
    fn the_pidfile_is_replaced_whole() {
        let dir = temp("write");
        let file = dir.0.join("data/sidecars-live.json");
        let e = Entry {
            pid: 7,
            start_us: 1,
            exe: PathBuf::from("/x"),
        };
        write_pidfile(&file, &[e.clone(), e.clone()]).unwrap();
        write_pidfile(&file, std::slice::from_ref(&e)).unwrap();
        let back: Vec<Entry> = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        assert_eq!(back, [e]);
        let names: Vec<_> = std::fs::read_dir(file.parent().unwrap()).unwrap().collect();
        assert_eq!(names.len(), 1, "không để lại file tạm");
    }
}
