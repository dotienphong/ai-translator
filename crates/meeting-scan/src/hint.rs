//! Máy trạng thái gợi ý bật dịch khi có cuộc họp (spec 2026-11-01-goi-y-bat-dich-khi-hop §2, §4). Thuần Rust: không đọc đồng hồ, cửa
//! sổ hay âm thanh; bên gọi đưa vào mỗi lần lấy mẫu (500 ms) cái đang thấy, và nhận về việc cần làm. Nhờ vậy test được mọi nền tảng.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use speaker_protocol::MeetingApp;

/// Phải có tiếng liên tục chừng này thì mới gợi ý (chủ dự án chốt 2026-11-01: 5 giây).
pub const SOUND_WINDOW: Duration = Duration::from_secs(5);
/// Tỉ lệ mẫu có tiếng tối thiểu trong [`SOUND_WINDOW`].
pub const MIN_SOUND_RATIO: f32 = 0.75;
/// Nhịp lấy mẫu mà bên gọi dùng; cửa sổ được coi là đủ dài khi thiếu không quá một nhịp rưỡi.
pub const SAMPLE_EVERY: Duration = Duration::from_millis(500);
/// Đỉnh âm lượng (0..1) từ đó trở lên mới tính là có tiếng.
pub const PEAK_THRESHOLD: f32 = 0.01;
/// Im tiếng chừng này (hay mất cửa sổ họp) thì coi cuộc họp đã hết, cuộc họp sau hỏi lại.
pub const MEETING_END_SILENCE: Duration = Duration::from_secs(60);
/// Không ai bấm gì thì tự đóng.
pub const AUTO_CLOSE: Duration = Duration::from_secs(15);

/// App họp theo cách người dùng thấy: Meet ở Chrome và Edge là một app (nút "Không hỏi lại với Google Meet" áp cho cả hai).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HintApp {
    Teams,
    Zoom,
    Meet,
}

impl HintApp {
    pub const ALL: [HintApp; 3] = [HintApp::Teams, HintApp::Zoom, HintApp::Meet];

    pub fn of(app: MeetingApp) -> Self {
        match app {
            MeetingApp::Teams => HintApp::Teams,
            MeetingApp::Zoom => HintApp::Zoom,
            MeetingApp::MeetChrome | MeetingApp::MeetEdge => HintApp::Meet,
        }
    }
}

/// Tiêu đề cửa sổ trình duyệt có phải trang họp Google Meet không: tiêu đề tab Meet bắt đầu bằng "Meet" rồi gạch ngang hay gạch
/// ngang dài ("Meet - abc-defg-hij", "Meet – Tên cuộc họp"). Chỉ gọi cho cửa sổ của Chrome, Edge (danh sách viết cứng).
pub fn is_meet_title(title: &str) -> bool {
    let rest = title.trim_start().strip_prefix("Meet");
    rest.is_some_and(|r| r.starts_with(" - ") || r.starts_with(" \u{2013} ") || r.starts_with(" \u{2014} "))
}

/// App họp là app riêng (Teams, Zoom): tiếng của chính nó đã đủ để coi là đang họp. Trình duyệt thì phải thêm cửa sổ Meet.
pub fn is_native(app: MeetingApp) -> bool {
    matches!(app, MeetingApp::Teams | MeetingApp::Zoom)
}

/// App họp "có mặt" ở lần quan sát này: Teams, Zoom có cửa sổ hiện (`visible`) hay đang có phiên âm thanh gán được (`mapped`); Meet ở
/// Chrome, Edge chỉ khi có cửa sổ trình duyệt mang tiêu đề Meet (`visible`). Tiếng của trình duyệt khi xem YouTube không làm Meet có mặt.
pub fn present_apps(visible: &[MeetingApp], mapped: &[MeetingApp]) -> Vec<MeetingApp> {
    MeetingApp::ALL
        .into_iter()
        .filter(|a| visible.contains(a) || (is_native(*a) && mapped.contains(a)))
        .collect()
}

/// App nào đang có tiếng (spec §3): app có mặt (`present`) mà (1) có phiên âm thanh gán được về nó (`mapped`), hoặc (2, dự phòng,
/// chỉ Teams và Zoom) thiết bị phát có tiếng, **không phiên nào** gán được về app họp nào, và app có cửa sổ họp theo công thức
/// (`recipe_windows`). Xét theo từng trình duyệt: Meet ở Edge không bị kích hoạt bởi YouTube ở Chrome. Kết quả theo [`HintApp`], không
/// trùng lặp.
pub fn apps_with_sound(
    mapped: &[MeetingApp],
    device_loud: bool,
    present: &[MeetingApp],
    recipe_windows: &[MeetingApp],
) -> Vec<HintApp> {
    let mut out = Vec::new();
    for app in MeetingApp::ALL {
        if !present.contains(&app) {
            continue;
        }
        let fallback = device_loud && is_native(app) && mapped.is_empty() && recipe_windows.contains(&app);
        let hint = HintApp::of(app);
        if (mapped.contains(&app) || fallback) && !out.contains(&hint) {
            out.push(hint);
        }
    }
    out
}

/// Cái đang thấy ở một lần lấy mẫu.
#[derive(Clone, Copy, Debug)]
pub struct Tick<'a> {
    pub now: Instant,
    /// Gợi ý đang bật trong Cài đặt.
    pub enabled: bool,
    /// App đang rảnh: không có phiên dịch, không đang tải model, đang thu âm thanh máy.
    pub idle: bool,
    /// App đã bị tắt gợi ý (Không hỏi lại với ...).
    pub ignored: &'a [HintApp],
    /// App họp có mặt ([`present_apps`]): cửa sổ họp đang hiện, hay (Teams, Zoom) đang có tiếng gán được.
    pub present: &'a [HintApp],
    /// App có tiếng ([`apps_with_sound`]); luôn nằm trong `present`.
    pub sound: &'a [HintApp],
}

/// Việc bên gọi cần làm sau một lần lấy mẫu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    None,
    Show(HintApp),
    Hide(HideReason),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HideReason {
    /// Người dùng bắt đầu dịch bằng cách khác, hay gợi ý bị tắt.
    NoLongerNeeded,
    /// 15 giây không ai bấm.
    TimedOut,
}

#[derive(Default)]
struct PerApp {
    /// (thời điểm, có tiếng) trong [`SOUND_WINDOW`] gần nhất, chỉ ghi khi app họp có mặt.
    samples: VecDeque<(Instant, bool)>,
    /// Cuộc họp hiện tại đã được hỏi.
    asked: bool,
    /// Lần cuối thấy tiếng của app.
    last_sound: Option<Instant>,
    /// Lần cuối app họp có mặt. Mất mặt ngắn (đổi tab trình duyệt) chưa tính là hết họp: phải mất [`MEETING_END_SILENCE`].
    last_present: Option<Instant>,
}

/// Trạng thái từng app họp. Ba trường riêng thay vì mảng có chỉ số: không có chỗ nào có thể chỉ số sai (bản release dùng `panic = "abort"`, một
/// lần panic là app sập).
#[derive(Default)]
struct Apps {
    teams: PerApp,
    zoom: PerApp,
    meet: PerApp,
}

impl Apps {
    fn get(&self, app: HintApp) -> &PerApp {
        match app {
            HintApp::Teams => &self.teams,
            HintApp::Zoom => &self.zoom,
            HintApp::Meet => &self.meet,
        }
    }

    fn get_mut(&mut self, app: HintApp) -> &mut PerApp {
        match app {
            HintApp::Teams => &mut self.teams,
            HintApp::Zoom => &mut self.zoom,
            HintApp::Meet => &mut self.meet,
        }
    }

    fn all_mut(&mut self) -> [&mut PerApp; 3] {
        [&mut self.teams, &mut self.zoom, &mut self.meet]
    }
}

#[derive(Default)]
pub struct Hint {
    apps: Apps,
    shown: Option<(HintApp, Instant)>,
    was_idle: bool,
}

impl Hint {
    pub fn new() -> Self {
        Self {
            was_idle: true,
            ..Self::default()
        }
    }

    /// App mà cửa sổ gợi ý đang hiện.
    pub fn shown(&self) -> Option<HintApp> {
        self.shown.map(|s| s.0)
    }

    /// Người dùng bấm "Bật dịch": cuộc họp này đã hỏi xong.
    pub fn accepted(&mut self) {
        self.shown = None;
    }

    /// Người dùng bấm "Bỏ qua" hay ✕ (tắt cho cả app thì bên gọi lưu thêm vào cài đặt): cuộc họp này đã hỏi xong.
    pub fn dismissed(&mut self) {
        self.shown = None;
    }

    pub fn tick(&mut self, t: &Tick<'_>) -> Action {
        // Tắt gợi ý: bỏ hết, đóng cửa sổ nếu đang hiện.
        if !t.enabled {
            let was_shown = self.shown.is_some();
            *self = Self::new();
            return if was_shown {
                Action::Hide(HideReason::NoLongerNeeded)
            } else {
                Action::None
            };
        }
        // Có phiên dịch (hay không rảnh): đóng cửa sổ nếu đang hiện, xóa mẫu, giữ "đã hỏi" để lúc dừng dịch giữa cuộc họp không hỏi lại.
        if !t.idle {
            self.was_idle = false;
            for app in self.apps.all_mut() {
                app.samples.clear();
            }
            return if self.shown.take().is_some() {
                Action::Hide(HideReason::NoLongerNeeded)
            } else {
                Action::None
            };
        }
        if !self.was_idle {
            // Vừa rảnh lại: cuộc họp đang có thì chưa tính là hết.
            self.was_idle = true;
            for app in self.apps.all_mut() {
                if app.asked {
                    app.last_sound = Some(t.now);
                }
            }
        }
        for a in HintApp::ALL {
            self.update(a, t);
        }
        if let Some((_, at)) = self.shown {
            if t.now.saturating_duration_since(at) >= AUTO_CLOSE {
                self.shown = None;
                return Action::Hide(HideReason::TimedOut);
            }
            return Action::None;
        }
        for a in HintApp::ALL {
            if t.ignored.contains(&a) || !self.ready(a, t.now) {
                continue;
            }
            self.apps.get_mut(a).asked = true;
            self.shown = Some((a, t.now));
            return Action::Show(a);
        }
        Action::None
    }

    fn update(&mut self, a: HintApp, t: &Tick<'_>) {
        let st = self.apps.get_mut(a);
        if !t.present.contains(&a) {
            // Mất mặt đủ lâu (hơn một phút): cuộc họp hết, cuộc sau hỏi lại. Ngắn hơn (đổi tab trình duyệt) thì giữ nguyên.
            if st
                .last_present
                .is_some_and(|at| t.now.saturating_duration_since(at) >= MEETING_END_SILENCE)
            {
                *st = PerApp::default();
            }
            return;
        }
        st.last_present = Some(t.now);
        let sound = t.sound.contains(&a);
        if sound {
            st.last_sound = Some(t.now);
        } else if st
            .last_sound
            .is_some_and(|at| t.now.saturating_duration_since(at) >= MEETING_END_SILENCE)
        {
            // Im tiếng lâu: cuộc họp hết, cuộc sau hỏi lại.
            *st = PerApp::default();
            return;
        }
        st.samples.push_back((t.now, sound));
        while st
            .samples
            .front()
            .is_some_and(|(at, _)| t.now.saturating_duration_since(*at) > SOUND_WINDOW)
        {
            st.samples.pop_front();
        }
    }

    /// Đủ điều kiện gợi ý (chưa xét ignored): chưa hỏi cuộc họp này, mẫu phủ gần đủ [`SOUND_WINDOW`], đủ tỉ lệ có tiếng.
    fn ready(&self, a: HintApp, now: Instant) -> bool {
        let st = self.apps.get(a);
        if st.asked {
            return false;
        }
        let Some((first, _)) = st.samples.front() else {
            return false;
        };
        let covered = now.saturating_duration_since(*first) + SAMPLE_EVERY.mul_f32(1.5);
        if covered < SOUND_WINDOW {
            return false;
        }
        let loud = st.samples.iter().filter(|(_, s)| *s).count();
        loud as f32 >= st.samples.len() as f32 * MIN_SOUND_RATIO
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Chạy máy theo nhịp 500 ms với đầu vào cố định, trả về hành động đầu tiên khác `None` và số lần lấy mẫu đã dùng.
    struct Run {
        hint: Hint,
        t0: Instant,
        n: u32,
    }

    #[derive(Clone, Copy)]
    struct World<'a> {
        enabled: bool,
        idle: bool,
        ignored: &'a [HintApp],
        present: &'a [HintApp],
        sound: &'a [HintApp],
    }

    const TEAMS: &[HintApp] = &[HintApp::Teams];
    const NONE: &[HintApp] = &[];

    fn world<'a>(present: &'a [HintApp], sound: &'a [HintApp]) -> World<'a> {
        World {
            enabled: true,
            idle: true,
            ignored: NONE,
            present,
            sound,
        }
    }

    impl Run {
        fn new() -> Self {
            Run {
                hint: Hint::new(),
                t0: Instant::now(),
                n: 0,
            }
        }
        fn step(&mut self, w: World<'_>) -> Action {
            let now = self.t0 + SAMPLE_EVERY * self.n;
            self.n += 1;
            self.hint.tick(&Tick {
                now,
                enabled: w.enabled,
                idle: w.idle,
                ignored: w.ignored,
                present: w.present,
                sound: w.sound,
            })
        }
        /// Chạy `secs` giây; trả hành động khác `None` đầu tiên (kèm giây đã chạy).
        fn run(&mut self, w: World<'_>, secs: f32) -> Option<(Action, f32)> {
            let steps = (secs / 0.5) as u32;
            for _ in 0..steps {
                let a = self.step(w);
                if a != Action::None {
                    return Some((a, self.n as f32 * 0.5));
                }
            }
            None
        }
    }

    #[test]
    fn shows_after_five_seconds_of_sound_with_a_meeting_window() {
        let mut r = Run::new();
        let (action, at) = r.run(world(TEAMS, TEAMS), 30.0).unwrap();
        assert_eq!(action, Action::Show(HintApp::Teams));
        assert!((4.5..=5.5).contains(&at), "hiện lúc {at}s");
    }

    #[test]
    fn short_sound_does_not_show() {
        let mut r = Run::new();
        assert_eq!(r.run(world(TEAMS, TEAMS), 3.0), None);
        // Im lặng rồi tiếng ngắn: tỉ lệ có tiếng trong 5 giây chưa tới 75%.
        assert_eq!(r.run(world(TEAMS, NONE), 10.0), None);
        assert_eq!(r.run(world(TEAMS, TEAMS), 2.0), None);
    }

    #[test]
    fn sound_without_a_meeting_window_never_shows() {
        let mut r = Run::new();
        assert_eq!(r.run(world(NONE, TEAMS), 60.0), None);
    }

    #[test]
    fn a_short_dropout_inside_the_window_is_tolerated() {
        let mut r = Run::new();
        // 8 mẫu có tiếng, 1 mẫu im, rồi tiếp: 1/10 im vẫn ≥ 75%.
        for _ in 0..4 {
            assert_eq!(r.step(world(TEAMS, TEAMS)), Action::None);
        }
        assert_eq!(r.step(world(TEAMS, NONE)), Action::None);
        let shown = r.run(world(TEAMS, TEAMS), 5.0).map(|x| x.0);
        assert_eq!(shown, Some(Action::Show(HintApp::Teams)));
    }

    #[test]
    fn asks_once_per_meeting() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        r.hint.dismissed();
        assert_eq!(r.run(world(TEAMS, TEAMS), 120.0), None);
    }

    #[test]
    fn a_new_meeting_asks_again_after_the_old_one_ends() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        r.hint.dismissed();
        // Mất mặt hơn một phút (đóng cửa sổ họp): cuộc họp hết.
        assert_eq!(r.run(world(NONE, NONE), 65.0), None);
        let again = r.run(world(TEAMS, TEAMS), 30.0).map(|x| x.0);
        assert_eq!(again, Some(Action::Show(HintApp::Teams)));
    }

    #[test]
    fn a_minute_of_silence_ends_the_meeting_too() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        r.hint.dismissed();
        assert_eq!(r.run(world(TEAMS, NONE), 70.0), None);
        let again = r.run(world(TEAMS, TEAMS), 30.0).map(|x| x.0);
        assert_eq!(again, Some(Action::Show(HintApp::Teams)));
    }

    #[test]
    fn an_ignored_app_never_shows() {
        let mut r = Run::new();
        let mut w = world(TEAMS, TEAMS);
        w.ignored = TEAMS;
        assert_eq!(r.run(w, 60.0), None);
    }

    #[test]
    fn nothing_shows_while_translating_or_disabled() {
        let mut r = Run::new();
        let mut w = world(TEAMS, TEAMS);
        w.idle = false;
        assert_eq!(r.run(w, 60.0), None);
        let mut r = Run::new();
        let mut w = world(TEAMS, TEAMS);
        w.enabled = false;
        assert_eq!(r.run(w, 60.0), None);
    }

    #[test]
    fn stopping_translation_in_the_same_meeting_does_not_ask_again() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        r.hint.accepted();
        let mut w = world(TEAMS, TEAMS);
        w.idle = false;
        assert_eq!(r.run(w, 300.0), None);
        // Dừng dịch giữa cuộc họp, cuộc họp vẫn có tiếng.
        assert_eq!(r.run(world(TEAMS, TEAMS), 60.0), None);
    }

    #[test]
    fn the_window_closes_on_its_own_after_fifteen_seconds() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        let shown_at = r.n as f32 * 0.5;
        let (action, at) = r.run(world(TEAMS, TEAMS), 30.0).unwrap();
        assert_eq!(action, Action::Hide(HideReason::TimedOut));
        let secs = at - shown_at;
        assert!((14.5..=15.5).contains(&secs), "đóng sau {secs}s");
        // Tự đóng không làm cuộc họp này hỏi lại.
        assert_eq!(r.run(world(TEAMS, TEAMS), 60.0), None);
    }

    #[test]
    fn the_window_closes_when_translation_starts() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        let mut w = world(TEAMS, TEAMS);
        w.idle = false;
        assert_eq!(r.step(w), Action::Hide(HideReason::NoLongerNeeded));
        assert_eq!(r.hint.shown(), None);
    }

    #[test]
    fn switching_browser_tabs_for_a_short_while_is_not_the_end_of_the_meeting() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        r.hint.dismissed();
        // Tiêu đề Meet biến mất 20 giây (đổi tab), rồi quay lại: vẫn là cuộc họp cũ, không hỏi lại.
        assert_eq!(r.run(world(NONE, NONE), 20.0), None);
        assert_eq!(r.run(world(TEAMS, TEAMS), 60.0), None);
    }

    #[test]
    fn turning_the_setting_off_closes_a_window_that_is_showing() {
        let mut r = Run::new();
        assert!(matches!(r.run(world(TEAMS, TEAMS), 30.0), Some((Action::Show(_), _))));
        let mut w = world(TEAMS, TEAMS);
        w.enabled = false;
        assert_eq!(r.step(w), Action::Hide(HideReason::NoLongerNeeded));
        assert_eq!(r.step(w), Action::None);
    }

    #[test]
    fn only_one_window_at_a_time_and_priority_follows_the_order_of_apps() {
        let both = [HintApp::Teams, HintApp::Zoom];
        let mut r = Run::new();
        let (first, _) = r.run(world(&both, &both), 30.0).unwrap();
        assert_eq!(first, Action::Show(HintApp::Teams));
        // Zoom không hiện chồng lên.
        assert_eq!(r.step(world(&both, &both)), Action::None);
        assert_eq!(r.hint.shown(), Some(HintApp::Teams));
    }

    #[test]
    fn chrome_and_edge_are_one_meet() {
        assert_eq!(HintApp::of(MeetingApp::MeetChrome), HintApp::Meet);
        assert_eq!(HintApp::of(MeetingApp::MeetEdge), HintApp::Meet);
        assert_eq!(HintApp::of(MeetingApp::Teams), HintApp::Teams);
        assert_eq!(HintApp::of(MeetingApp::Zoom), HintApp::Zoom);
    }

    #[test]
    fn meet_titles_are_recognised_loosely_but_not_other_pages() {
        assert!(is_meet_title("Meet - abc-defg-hij - Google Chrome"));
        assert!(is_meet_title("Meet \u{2013} Họp nhóm - Microsoft Edge"));
        assert!(is_meet_title("  Meet - abc-defg-hij"));
        assert!(!is_meet_title("Meeting notes - Google Docs - Google Chrome"));
        assert!(!is_meet_title("Meetup - Chrome"));
        assert!(!is_meet_title("Nhạc hay nhất 2026 - YouTube - Google Chrome"));
        assert!(!is_meet_title("Hộp thư - Gmail - Google Chrome"));
        assert!(!is_meet_title("Google Meet - Chrome"));
        assert!(!is_meet_title("Meet"));
    }

    #[test]
    fn who_is_present() {
        use MeetingApp::*;
        // Teams, Zoom: có cửa sổ hiện, hay có phiên âm thanh gán được (cửa sổ ẩn xuống khay).
        assert_eq!(present_apps(&[Teams], &[]), vec![Teams]);
        assert_eq!(present_apps(&[], &[Zoom]), vec![Zoom]);
        // Trình duyệt: chỉ khi có cửa sổ Meet; phiên âm thanh của trình duyệt (YouTube) không đủ.
        assert_eq!(present_apps(&[], &[MeetChrome]), Vec::<MeetingApp>::new());
        assert_eq!(present_apps(&[MeetEdge], &[MeetChrome]), vec![MeetEdge]);
    }

    #[test]
    fn sound_by_process_mapping_or_the_device_fallback() {
        use MeetingApp::*;
        let hint = HintApp::of;
        // Gán được phiên về app, app có mặt.
        assert_eq!(apps_with_sound(&[Zoom], false, &[Zoom], &[]), vec![hint(Zoom)]);
        // Gán được nhưng app không có mặt (Meet: YouTube trong Chrome, không có cửa sổ Meet).
        assert_eq!(apps_with_sound(&[MeetChrome], true, &[], &[]), Vec::<HintApp>::new());
        // Meet mở ở Edge, YouTube phát ở Chrome: tiếng là của Chrome, Edge không có phiên: không tính.
        assert_eq!(
            apps_with_sound(&[MeetChrome], true, &[MeetEdge], &[]),
            Vec::<HintApp>::new()
        );
        // Dự phòng: Teams có cửa sổ họp theo công thức, không phiên nào gán được, thiết bị phát có tiếng.
        assert_eq!(apps_with_sound(&[], true, &[Teams], &[Teams]), vec![hint(Teams)]);
        // Không có cửa sổ họp theo công thức thì không dự phòng (tiếng có thể của Spotify trong khi Teams chỉ mở sẵn).
        assert_eq!(apps_with_sound(&[], true, &[Teams], &[]), Vec::<HintApp>::new());
        // Dự phòng không áp cho Meet (trình duyệt).
        assert_eq!(
            apps_with_sound(&[], true, &[MeetChrome], &[MeetChrome]),
            Vec::<HintApp>::new()
        );
        // Đã có phiên gán được cho app họp khác thì không dự phòng cho Teams (tiếng là của app kia).
        assert_eq!(
            apps_with_sound(&[Zoom], true, &[Teams, Zoom], &[Teams]),
            vec![hint(Zoom)]
        );
        // Thiết bị im thì dự phòng không bật.
        assert_eq!(apps_with_sound(&[], false, &[Teams], &[Teams]), Vec::<HintApp>::new());
        // Chrome và Edge cùng có tiếng và cửa sổ Meet: chỉ một Meet.
        assert_eq!(
            apps_with_sound(&[MeetChrome, MeetEdge], false, &[MeetChrome, MeetEdge], &[]),
            vec![HintApp::Meet]
        );
    }
}
