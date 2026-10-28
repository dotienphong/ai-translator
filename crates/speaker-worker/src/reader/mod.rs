//! Bộ đọc tên người nói từ app họp (spec 2026-10-26-phan-biet-nguoi-noi §6.1–§6.2, §6.8): luồng riêng lấy mẫu cây giao diện của
//! cửa sổ họp và gửi [`Sample`] cho luồng chính của worker; mọi logic theo thời gian nằm ở `names` (QĐ 1 của kế hoạch 04). Chỉ
//! đọc; không bấm, không gõ gì trong app họp. Luồng chính điều khiển qua [`Control`] (đọc hay nghỉ, nhịp, ứng viên tự hiệu chỉnh).

pub mod eui;
pub mod extract;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod stats;
pub mod tree;
#[cfg(windows)]
pub mod uia;
pub mod uia_tree;
pub mod windowset;
pub mod winscan;

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use speaker_protocol::{MeetingApp, ReaderPlatform, ReaderStatus};
use speaker_recipe::Recipes;

use extract::TileSample;

/// Bộ đọc mà bản worker này có (`Ready.reader_platform`).
pub const PLATFORM: ReaderPlatform = if cfg!(target_os = "macos") {
    ReaderPlatform::MacOs
} else if cfg!(windows) {
    ReaderPlatform::Windows
} else {
    ReaderPlatform::Unsupported
};
/// Nhịp đọc (spec §6.2, QĐ 13): 1 lần/giây; 4 lần/giây khi máy có tiếng và đang cần gán tên.
pub const SLOW: Duration = Duration::from_millis(1_000);
pub const FAST: Duration = Duration::from_millis(250);
/// Lượt đầy đủ (duyệt cửa sổ, tìm ô và neo) mỗi chừng này, hay ngay khi một ô không còn đọc được.
pub const FULL_EVERY: Duration = Duration::from_millis(3_000);
/// Quét tiến trình tìm app họp (spec §6.1).
pub const SCAN_EVERY: Duration = Duration::from_millis(2_000);

/// Điều luồng chính muốn ở bộ đọc.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ControlState {
    /// Đọc tên ("Lấy tên" bật, không tạm dừng vì quá tải); tắt thì bộ đọc trả `AXEnhancedUserInterface`, gửi một mẫu `Off` rồi ngủ
    /// tới khi trạng thái đổi (QĐ 27).
    pub enabled: bool,
    /// Nhịp 4 lần/giây.
    pub fast: bool,
    /// Đọc ứng viên tự hiệu chỉnh (`TileSample::candidates`): khi đang tìm, hay khi đã học được chỉ báo (để theo chỉ báo đó).
    pub calibrate: bool,
}

#[derive(Default)]
struct Shared {
    state: ControlState,
    stop: bool,
}

/// Trạng thái chung giữa luồng chính và luồng đọc (QĐ 27): luồng đọc ngủ bằng [`Control::wait`] và chỉ thức khi tới lượt, khi
/// trạng thái đổi hay khi dừng; không thức định kỳ để xét cờ.
#[derive(Default)]
pub struct Control {
    shared: Mutex<Shared>,
    changed: Condvar,
}

impl Control {
    fn lock(&self) -> MutexGuard<'_, Shared> {
        self.shared.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Đặt trạng thái; chỉ đánh thức luồng đọc khi trạng thái đổi.
    pub fn set(&self, s: ControlState) {
        let mut g = self.lock();
        if g.state != s {
            g.state = s;
            self.changed.notify_all();
        }
    }

    pub fn get(&self) -> ControlState {
        self.lock().state
    }

    /// Worker sắp thoát: bộ đọc trả `AXEnhancedUserInterface` rồi dừng.
    pub fn stop(&self) {
        self.lock().stop = true;
        self.changed.notify_all();
    }

    pub fn stopped(&self) -> bool {
        self.lock().stop
    }

    /// Ngủ tới `until` (`None`: không hạn) hay tới khi trạng thái khác `seen`. Trả trạng thái lúc thức; `None` khi đã dừng.
    pub fn wait(&self, seen: ControlState, until: Option<Instant>) -> Option<ControlState> {
        let mut g = self.lock();
        loop {
            if g.stop {
                return None;
            }
            if g.state != seen {
                return Some(g.state);
            }
            match until {
                None => g = self.changed.wait(g).unwrap_or_else(PoisonError::into_inner),
                Some(u) => {
                    let now = Instant::now();
                    if now >= u {
                        return Some(g.state);
                    }
                    g = self
                        .changed
                        .wait_timeout(g, u - now)
                        .unwrap_or_else(PoisonError::into_inner)
                        .0;
                }
            }
        }
    }
}

/// Chờ tới lượt đọc kế (QĐ 13, 27): `c` là trạng thái của lượt vừa đọc, `started` lúc lượt đó bắt đầu. Đổi `fast`/`calibrate` giữa
/// chừng chỉ tính lại hạn theo nhịp mới, không đọc ngay (rà soát lần 2 B-N-B: mười lần đổi liền không thành mười lượt); bật lại hay
/// tắt "Lấy tên" thì thức ngay (bật: đọc; tắt: trả EUI). Trả trạng thái cho lượt kế; `None` khi dừng.
pub fn next_turn(control: &Control, mut c: ControlState, started: Instant) -> Option<ControlState> {
    loop {
        let until = c.enabled.then(|| started + if c.fast { FAST } else { SLOW });
        let next = control.wait(c, until)?;
        if next == c || next.enabled != c.enabled {
            return Some(next);
        }
        c = next;
    }
}

/// Thứ bộ đọc cần: công thức đã kiểm, file dấu `AXEnhancedUserInterface` (QĐ 8).
pub struct ReaderSetup {
    pub recipes: Arc<Recipes>,
    pub eui_marker: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pass {
    /// Không đọc cây (nghỉ, không có app họp, chưa có quyền).
    Idle,
    Full,
    Fast,
}

/// Một lượt đọc. `status` là `Ok` khi có cửa sổ họp (dù chưa tìm thấy ô nào).
#[derive(Clone, Debug)]
pub struct Sample {
    pub at_unix_ms: u64,
    /// Từ lượt trước tới lượt này.
    pub period_ms: u32,
    pub status: ReaderStatus,
    pub app: Option<MeetingApp>,
    pub app_version: Option<String>,
    pub tiles: Vec<TileSample>,
    pub pass: Pass,
    /// Thời gian của lượt và số phần tử đã đọc (log, đo ngân sách §6.2).
    pub pass_ms: f32,
    pub elements: u32,
}

/// Nơi luồng đọc gửi mẫu; `false` khi luồng chính đã thôi nhận (worker thoát).
pub type SampleSink = Box<dyn FnMut(Sample) -> bool + Send>;

/// Chạy bộ đọc trên luồng riêng (macOS: `macos::spawn`, Windows: `uia::spawn`); nền tảng chưa có bộ đọc thì `None`.
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, sink: SampleSink) -> Option<std::thread::JoinHandle<()>> {
    #[cfg(target_os = "macos")]
    {
        macos::spawn(setup, control, sink)
    }
    #[cfg(windows)]
    {
        uia::spawn(setup, control, sink)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (setup, control, sink);
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// QĐ 27 (rà soát B-Q4): luồng đọc ngủ tới hạn hay tới khi trạng thái đổi; "Lấy tên" tắt thì ngủ không hạn, thức ngay khi bật
    /// lại hay khi worker dừng.
    #[test]
    fn the_reader_sleeps_until_its_turn_a_change_or_stop() {
        let c = Arc::new(Control::default());
        let off = c.get();
        assert_eq!(
            c.wait(off, Some(Instant::now() + Duration::from_millis(20))),
            Some(off),
            "tới hạn, không đổi"
        );
        let waiter = {
            let c = c.clone();
            std::thread::spawn(move || c.wait(off, None))
        };
        let on = ControlState { enabled: true, ..off };
        c.set(on);
        assert_eq!(
            waiter.join().unwrap(),
            Some(on),
            "đổi trạng thái đánh thức luồng đang ngủ không hạn"
        );
        let waiter = {
            let c = c.clone();
            std::thread::spawn(move || c.wait(on, None))
        };
        c.stop();
        assert_eq!(waiter.join().unwrap(), None);
        assert!(c.stopped());
    }

    /// Rà soát lần 2 B-N-B: đổi `fast`/`calibrate` mười lần trong khoảng 220 ms (nhịp 1 lượt/giây) không làm thêm lượt nào: chỉ tính
    /// lại hạn. Cũ (thức mỗi lần đổi): ≥ 10 lượt.
    #[test]
    fn state_changes_reschedule_without_extra_passes() {
        let c = Arc::new(Control::default());
        let on = ControlState {
            enabled: true,
            fast: false,
            calibrate: false,
        };
        c.set(on);
        let reader = {
            let c = c.clone();
            std::thread::spawn(move || {
                let (mut turns, mut s) = (0, on);
                while let Some(next) = next_turn(&c, s, Instant::now()) {
                    s = next;
                    turns += 1;
                }
                turns
            })
        };
        for k in 0..10 {
            c.set(ControlState {
                calibrate: k % 2 == 0,
                ..on
            });
            std::thread::sleep(Duration::from_millis(22));
        }
        c.stop();
        let turns = reader.join().unwrap();
        assert!(turns <= 1, "{turns} lượt");
    }

    /// Bật lại "Lấy tên" thì đọc ngay, không chờ hết nhịp.
    #[test]
    fn turning_names_on_reads_at_once() {
        let c = Arc::new(Control::default());
        let off = c.get();
        let on = ControlState { enabled: true, ..off };
        let setter = {
            let c = c.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(20));
                c.set(on);
            })
        };
        let t0 = Instant::now();
        assert_eq!(next_turn(&c, off, t0), Some(on));
        assert!(t0.elapsed() < Duration::from_millis(500), "{:?}", t0.elapsed());
        setter.join().unwrap();
    }
}
