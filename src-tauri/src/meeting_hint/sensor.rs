//! Vòng lấy mẫu của gợi ý bật dịch trên Windows (spec 2026-11-01-goi-y-bat-dich-khi-hop §3): mỗi 500 ms hỏi phiên âm thanh của loa,
//! (khi có tiếng) bảng tiến trình, (theo lịch) cửa sổ họp; đưa cho `meeting_scan::probe::Probe` rồi cho máy trạng thái
//! `meeting_scan::hint::Hint` quyết định. Chỉ chạy khi gợi ý bật và app rảnh; ngoài ra chỉ ngủ.
//!
//! Log chỉ có số đếm. Không ghi tiêu đề cửa sổ, tên cuộc họp hay tên người.

use std::time::{Duration, Instant};

use meeting_scan::hint::{Action, PEAK_THRESHOLD, SAMPLE_EVERY, Tick};
use meeting_scan::probe::{Observation, Probe};
use meeting_scan::procmap::{Levels, ProcTable};
use meeting_scan::win::{Win32Desktop, process_table};
use speaker_recipe::Recipes;
use tauri::{AppHandle, Manager, Runtime};

use super::{Service, hide, idle, show};
use crate::speaker::recipes;
use crate::state::AppState;

/// Đọc lại công thức đang có chừng này (công thức đổi chậm: tải về mỗi 6 giờ).
const RECIPES_REFRESH: Duration = Duration::from_secs(600);
/// Sau chừng này lần đọc âm thanh liên tiếp đều lỗi (ví dụ máy không có thiết bị phát) thì thưa ra, đỡ tốn máy.
const FAILURES_BEFORE_BACKOFF: u32 = 10;
const BACKOFF: Duration = Duration::from_secs(10);
/// Lỗi đọc âm thanh chỉ ghi log chừng này một lần, để máy không có thiết bị phát không làm đầy log.
const ERROR_LOG_EVERY: Duration = Duration::from_secs(300);

struct Sensor {
    probe: Probe,
    desktop: Win32Desktop,
    recipes: Option<Recipes>,
    recipes_at: Option<Instant>,
    error_logged_at: Option<Instant>,
    /// Số lần đọc âm thanh lỗi liên tiếp.
    failures: u32,
}

impl Sensor {
    fn new() -> Self {
        Self {
            probe: Probe::default(),
            desktop: Win32Desktop,
            recipes: None,
            recipes_at: None,
            error_logged_at: None,
            failures: 0,
        }
    }

    /// Công thức đang có (bản build sẵn hay bản đã tải), đọc lại thưa. Chỉ dùng cho dự phòng của Teams và Zoom; không đọc được thì
    /// không dự phòng, gợi ý vẫn chạy.
    fn recipes<R: Runtime>(&mut self, app: &AppHandle<R>, now: Instant) -> Option<&Recipes> {
        if self
            .recipes_at
            .is_none_or(|at| now.saturating_duration_since(at) >= RECIPES_REFRESH)
        {
            self.recipes_at = Some(now);
            self.recipes = match speaker_recipe::parse(&recipes::body(app)) {
                Ok(r) => Some(r),
                Err(e) => {
                    log::warn!("gợi ý bật dịch: không đọc được công thức ({e}); bỏ dự phòng");
                    None
                }
            };
        }
        self.recipes.as_ref()
    }

    fn observe<R: Runtime>(&mut self, app: &AppHandle<R>, now: Instant) -> Observation {
        let levels = match audio_capture::windows::output_levels() {
            Ok(l) => {
                self.failures = 0;
                Levels {
                    sessions: l.sessions,
                    device_peak: l.device_peak,
                }
            }
            Err(e) => {
                self.failures = self.failures.saturating_add(1);
                if self
                    .error_logged_at
                    .is_none_or(|at| now.saturating_duration_since(at) >= ERROR_LOG_EVERY)
                {
                    self.error_logged_at = Some(now);
                    log::warn!("gợi ý bật dịch: không đọc được mức tiếng của loa: {e}");
                }
                Levels::default()
            }
        };
        // Bảng tiến trình chỉ cần khi có phiên đang có tiếng.
        let loud = levels.device_loud() || levels.sessions.iter().any(|(_, peak)| *peak >= PEAK_THRESHOLD);
        let table = if loud { process_table() } else { ProcTable::default() };
        // Mượn `recipes` rồi `probe`/`desktop` cùng lúc: tách trường để borrow checker thấy chúng rời nhau.
        let recipes_ready = self.recipes(app, now).is_some();
        let Self {
            probe,
            desktop,
            recipes,
            ..
        } = self;
        let recipes = if recipes_ready { recipes.as_ref() } else { None };
        probe.observe(desktop, recipes, &levels, &table, now)
    }
}

/// Vòng lấy mẫu; chạy trên luồng riêng tới khi app thoát. Không có `unwrap`, chỉ số mảng hay `state()` có thể panic (bản release dùng
/// `panic = "abort"`): thiếu trạng thái thì bỏ qua lượt này.
pub fn run<R: Runtime>(app: AppHandle<R>) {
    let mut sensor = Sensor::new();
    loop {
        std::thread::sleep(if sensor.failures >= FAILURES_BEFORE_BACKOFF {
            BACKOFF
        } else {
            SAMPLE_EVERY
        });
        let (Some(state), Some(service)) = (app.try_state::<AppState>(), app.try_state::<Service>()) else {
            continue;
        };
        let (settings, status) = (state.settings(), state.status());
        let enabled = settings.meeting_hint.enabled;
        let idle = idle(&settings, &status);
        let now = Instant::now();
        let observation = if enabled && idle {
            sensor.observe(&app, now)
        } else {
            Observation::default()
        };
        let action = service.hint().tick(&Tick {
            now,
            enabled,
            idle,
            ignored: &settings.meeting_hint.ignored_apps,
            present: &observation.present,
            sound: &observation.sound,
        });
        match action {
            Action::None => {}
            Action::Show(hinted) => show(&app, hinted),
            Action::Hide(reason) => {
                log::info!("gợi ý bật dịch: đóng ({reason:?})");
                hide(&app);
            }
        }
    }
}
