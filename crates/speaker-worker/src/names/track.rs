//! Tín hiệu "đang nói" của từng người tham dự qua các lượt đọc (spec §6.4): chữ trong nhãn ô (tín hiệu 1); phần tử neo có mặt,
//! đổi trạng thái ≥ 2 lần trong 1 s, hay khác trạng thái nền của chính nó (tín hiệu 2); chỉ báo tự học (6.5). Tín hiệu mic (3) cần
//! tiếng nói của máy nên nằm ở `matcher`. Lịch sử khóa theo **từng ô** (tên, `slot`), rồi mới gộp các ô cùng tên thành một người
//! (QĐ 23 của kế hoạch 04). Nền của tín hiệu "khác trạng thái thường gặp" chỉ lấy từ các lượt máy im (`quiet_at`, Task 6).

use std::collections::{BTreeMap, VecDeque};

use speaker_recipe::SignalKind;

use super::{ParticipantNow, Spans, Via};
use crate::reader::extract::TileSample;

pub const FLICKER_WINDOW_MS: i64 = 1_000;
/// Tín hiệu `caption`: dòng phụ đề cuối đang nói khi chữ của nó đổi (hay nó mới xuất hiện) trong chừng này gần nhất.
pub const CAPTION_WINDOW_MS: i64 = 1_000;
pub const FLICKER_CHANGES: usize = 2;
/// Nền của tín hiệu "khác trạng thái thường gặp": chừng này lượt máy im gần nhất.
pub const DEVIATION_BASELINE: usize = 40;
/// Cần ít nhất chừng này lượt máy im mới có nền.
pub const DEVIATION_MIN_QUIET: usize = 10;
/// Lịch sử của ô không còn thấy quá chừng này thì bỏ.
pub const HISTORY_KEEP_MS: i64 = 300_000;
/// Máy "im" ở một lượt khi không có tiếng nói trong khoảng trễ của app cộng chừng này trước lượt đó.
pub const QUIET_MARGIN_MS: i64 = 1_000;

/// Máy im ở lượt đọc lúc `at_ms`: không có tiếng nói (theo `Speech`) trong [`at_ms` − trễ − 1 s, `at_ms`].
pub fn quiet_at(speech: &Spans, at_ms: i64, delay_ms: i64) -> bool {
    speech.overlap(at_ms - delay_ms - QUIET_MARGIN_MS, at_ms + 1) == 0
}
/// Khóa lịch sử của chỉ báo tự học (không trùng chỉ số tín hiệu của công thức).
const LEARNED: usize = usize::MAX;

#[derive(Default)]
struct History {
    last: Option<Option<u64>>,
    changes: VecDeque<i64>,
    /// Trạng thái ở các lượt máy im gần nhất: nền của tín hiệu "khác trạng thái thường gặp" (rà soát A-Q9: lấy trên cả phiên thì
    /// người nói nhiều làm tín hiệu đảo chiều).
    quiet: VecDeque<Option<u64>>,
    updated_ms: i64,
}

impl History {
    fn push(&mut self, at_ms: i64, state: Option<u64>, quiet: bool) {
        if self.last.is_some_and(|l| l != state) {
            self.changes.push_back(at_ms);
        }
        self.last = Some(state);
        self.updated_ms = at_ms;
        while self
            .changes
            .front()
            .is_some_and(|&t| t <= at_ms - FLICKER_WINDOW_MS.max(CAPTION_WINDOW_MS))
        {
            self.changes.pop_front();
        }
        if quiet {
            self.quiet.push_back(state);
            if self.quiet.len() > DEVIATION_BASELINE {
                self.quiet.pop_front();
            }
        }
    }

    fn flickering(&self) -> bool {
        self.changes
            .iter()
            .filter(|&&t| t > self.updated_ms - FLICKER_WINDOW_MS)
            .count()
            >= FLICKER_CHANGES
    }

    /// Có đổi trạng thái trong [`CAPTION_WINDOW_MS`] gần nhất.
    fn changed_recently(&self) -> bool {
        self.changes.iter().any(|&t| t > self.updated_ms - CAPTION_WINDOW_MS)
    }

    fn deviating(&self) -> bool {
        if self.quiet.len() < DEVIATION_MIN_QUIET {
            return false;
        }
        let mut counts: BTreeMap<Option<u64>, usize> = BTreeMap::new();
        for s in &self.quiet {
            *counts.entry(*s).or_default() += 1;
        }
        // Bằng số lần thì trạng thái có khóa nhỏ hơn là nền (tất định).
        let base = counts
            .iter()
            .max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0)))
            .map(|(s, _)| *s);
        self.last.is_some_and(|l| Some(l) != base)
    }
}

pub struct SpeakingTracker {
    /// Đã nhận ít nhất một lượt đọc (ô phụ đề xuất hiện sau lượt đầu mới tính là "dòng mới").
    started: bool,
    kinds: Vec<SignalKind>,
    /// Khóa: (tên, `slot` của ô, chỉ số tín hiệu).
    history: BTreeMap<(String, u32, usize), History>,
}

impl SpeakingTracker {
    /// `kinds`: loại của từng tín hiệu trong công thức, theo thứ tự (`TileSample::anchors` cùng thứ tự).
    pub fn new(kinds: Vec<SignalKind>) -> Self {
        Self {
            started: false,
            kinds,
            history: BTreeMap::new(),
        }
    }

    /// Một lượt đọc lúc `at_ms`; `learned`: chỉ báo tự học của từng người (khóa ứng viên); `quiet`: máy im ở lượt này
    /// (`quiet_at`). Trả mỗi người tham dự một dòng, theo tên.
    pub fn push(
        &mut self,
        at_ms: i64,
        tiles: &[TileSample],
        learned: &BTreeMap<String, u64>,
        quiet: bool,
    ) -> Vec<ParticipantNow> {
        let mut now: BTreeMap<String, ParticipantNow> = BTreeMap::new();
        let first_push = !self.started;
        self.started = true;
        for (index, tile) in tiles.iter().enumerate() {
            let mut by_signal = false;
            for (i, kind) in self.kinds.iter().enumerate() {
                let state = tile.anchors.get(i).copied().flatten();
                let on = match kind {
                    SignalKind::Label => tile.label_speaking,
                    SignalKind::Presence => state.is_some(),
                    SignalKind::Caption => {
                        // Chỉ dòng phụ đề cuối (mới nhất) tính; dòng mới xuất hiện sau lượt đầu là một thay đổi.
                        let key = (tile.name.clone(), tile.slot, i);
                        let fresh = !self.history.contains_key(&key);
                        let h = self.history.entry(key).or_default();
                        h.push(at_ms, state, quiet);
                        if fresh && !first_push {
                            h.changes.push_back(at_ms);
                        }
                        index + 1 == tiles.len() && h.changed_recently()
                    }
                    SignalKind::Flicker | SignalKind::Deviation => {
                        let h = self.history.entry((tile.name.clone(), tile.slot, i)).or_default();
                        h.push(at_ms, state, quiet);
                        if *kind == SignalKind::Flicker {
                            h.flickering()
                        } else {
                            h.deviating()
                        }
                    }
                };
                by_signal |= on;
            }
            let by_learned = match learned.get(&tile.name) {
                Some(key) => {
                    let state = tile.candidates.iter().find(|(k, _)| k == key).map(|&(_, s)| s);
                    let h = self.history.entry((tile.name.clone(), tile.slot, LEARNED)).or_default();
                    h.push(at_ms, state, quiet);
                    h.deviating() || h.flickering()
                }
                None => false,
            };
            let via = if by_signal {
                Via::Indicator
            } else if by_learned {
                Via::Learned
            } else {
                Via::None
            };
            let p = now.entry(tile.name.clone()).or_insert_with(|| ParticipantNow {
                name: tile.name.clone(),
                is_self: false,
                muted: None,
                speaking: 0.0,
                via: Via::None,
            });
            p.is_self |= tile.is_self;
            p.muted = match (p.muted, tile.muted) {
                (Some(false), _) | (_, Some(false)) => Some(false),
                (a, b) => a.or(b),
            };
            if via == Via::Indicator || (via == Via::Learned && p.via == Via::None) {
                p.via = via;
                p.speaking = 1.0;
            }
        }
        self.history.retain(|_, h| at_ms - h.updated_ms <= HISTORY_KEEP_MS);
        now.into_values().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reader::extract::tests::{fixture_recipes, meet_recipes, recipes, tiles_of, zoom_recipes};
    use crate::reader::tree::tests::{fixture, truth};
    use speaker_recipe::{MeetingApp, Os, Recipes};
    use std::collections::BTreeSet;

    fn on_at(truth: &[(f64, String, bool)], who: &str, t: f64) -> bool {
        // `rfind` thay `filter().last()` (clippy `double_ended_iterator_last`, rà soát A-C2.3).
        truth
            .iter()
            .rfind(|(at, w, _)| *at <= t && w == who)
            .is_some_and(|(_, _, on)| *on)
    }

    /// Có ai trong sự thật đang bật mic ở khoảng [t − 1,6 s, t − 0,6 s] (như `quiet_at` của bộ đọc thật: trễ chỉ báo cộng 1 s).
    fn anyone_on(truth: &[(f64, String, bool)], t: f64) -> bool {
        let who: BTreeSet<&str> = truth.iter().map(|x| x.1.as_str()).collect();
        who.into_iter()
            .any(|w| (0..=4).any(|k| on_at(truth, w, t - 0.6 - 0.25 * f64::from(k))))
    }

    /// Như `bench/2026-10-26-nguoi-noi/tro-nang/o_dang_noi.py`: lưới 0,25 s; ở mỗi điểm đẩy ảnh chụp gần nhất vào bộ theo dõi (như bộ
    /// đọc thật đọc đều 250 ms, QĐ 23), sự thật dời 0,6 s; tính khớp từ giây thứ 1 tới ảnh chụp cuối. Trả phần điểm khớp của người
    /// tham dự `name` so với người nói thật `who`.
    fn agreement(r: &Recipes, os: Os, file: &str, app: MeetingApp, name: &str, who: &str, shift: f64) -> f64 {
        let app = r.app(os, app).unwrap();
        let snaps = fixture(file);
        let truth = truth(file);
        let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
        let (mut hits, mut n) = (0usize, 0usize);
        let mut t = snaps[0].t;
        let end = snaps.last().unwrap().t;
        while t < end {
            let i = snaps.partition_point(|s| s.t <= t) - 1;
            let (_, tiles) = tiles_of(&snaps[i], app);
            let now = tracker.push((t * 1000.0) as i64, &tiles, &BTreeMap::new(), !anyone_on(&truth, t));
            if t >= snaps[0].t + 1.0 {
                let speaking = now.iter().any(|p| p.name == name && p.speaking > 0.5);
                hits += usize::from(speaking == on_at(&truth, who, t - shift));
                n += 1;
            }
            t += 0.25;
        }
        hits as f64 / n as f64
    }

    /// Kế hoạch 01 (`results/teams-chrome.md`): khung "đang nói" ở ô video Teams khớp sự thật 95–97% (dời 0,6 s).
    #[test]
    fn teams_frames_follow_who_speaks() {
        for file in ["teams-macos-people-closed.jsonl", "teams-macos-people-open.jsonl"] {
            for who in ["Lan", "Minh"] {
                let a = agreement(&recipes(), Os::Macos, file, MeetingApp::Teams, who, who, 0.6);
                eprintln!("{file} {who}: {a:.3}");
                assert!(a >= 0.90, "{file} {who}: {a:.3}");
            }
        }
    }

    /// Kế hoạch 05b Task 11: Teams Windows chỉ có chỉ báo "đang nói" ở bảng People (lớp của ảnh đại diện), nên "ô" là hàng của
    /// bảng. Hai bản ghi bảng mở (kịch bản khác nhau): (a) đủ ba người ở ≥ 95% ảnh chụp; (b) khớp sự thật từng khách ≥ 0,85.
    #[test]
    fn teams_windows_people_panel_follows_who_speaks() {
        let r = fixture_recipes("teams-windows-people.recipes.json");
        for file in ["teams-windows-people-open.jsonl", "teams-windows-people-open-2.jsonl"] {
            let app = r.app(Os::Windows, MeetingApp::Teams).unwrap();
            let snaps = fixture(file);
            let full = snaps
                .iter()
                .filter(|s| {
                    let names: BTreeSet<String> = tiles_of(s, app).1.into_iter().map(|t| t.name).collect();
                    ["Hoa Phạm", "Khach Lan", "Khach Minh"]
                        .iter()
                        .all(|n| names.contains(*n))
                })
                .count();
            let share = full as f64 / snaps.len() as f64;
            eprintln!("{file} đủ ba người: {share:.3}");
            assert!(share >= 0.95, "{file}: {share:.3}");
            for who in ["Lan", "Minh"] {
                let name = format!("Khach {who}");
                let a = agreement(&r, Os::Windows, file, MeetingApp::Teams, &name, who, 0.6);
                eprintln!("{file} {who}: {a:.3}");
                assert!(a >= 0.85, "{file} {who}: {a:.3}");
            }
        }
    }

    /// Teams Windows, phụ đề trực tiếp (kế hoạch 05b): bảng People đóng. Ô là dòng phụ đề (tên rồi lời), dòng cuối đang đổi chữ là người
    /// đang nói; độ trễ 2,4 s chọn trên `captions-closed` (90 s), kiểm trên `captions-open` (34 s, bảng mở, bản ghi khác).
    #[test]
    fn teams_windows_live_captions_follow_who_speaks() {
        let r = fixture_recipes("teams-windows-captions.recipes.json");
        let shift = f64::from(r.app(Os::Windows, MeetingApp::Teams).unwrap().delay_ms) / 1000.0;
        for file in [
            "teams-windows-captions-closed.jsonl",
            "teams-windows-captions-open.jsonl",
        ] {
            for who in ["Lan", "Minh"] {
                let name = format!("Khach {who}");
                let a = agreement(&r, Os::Windows, file, MeetingApp::Teams, &name, who, shift);
                eprintln!("{file} {who}: {a:.3}");
                assert!(a >= 0.80, "{file} {who}: {a:.3}");
            }
        }
    }

    /// Kế hoạch 01: ô của người nói trong cửa sổ của chính nó khớp 69–80% với từng tín hiệu (thanh âm lượng, lớp sáng); ở đây gộp
    /// hai tín hiệu, lịch sử theo từng ô rồi gộp theo tên (QĐ 23). Người rà đo cách này (theo ô, 250 ms): 0,890. Không có đường lùi
    /// hạ ngưỡng: đỏ thì dừng, báo. **Số này đo ô của tài khoản đang nói trong chính cửa sổ của nó** (khi dùng thật là ô của chính
    /// người dùng); ở cửa sổ người nghe không có chỉ báo: xem `meet_gives_no_name_in_the_listener_window` (Task 7) và QĐ 32.
    #[test]
    fn meet_level_bar_and_highlight_follow_the_voice() {
        let a = agreement(
            &meet_recipes(),
            Os::Macos,
            "meet-chrome-macos.jsonl",
            MeetingApp::MeetChrome,
            "Hoa Phạm",
            "nguoinoi",
            0.6,
        );
        eprintln!("meet: {a:.3}");
        assert!(a >= 0.80, "{a:.3}");
    }

    #[test]
    fn zoom_follows_the_active_speaker_label() {
        let r = zoom_recipes();
        let app = r.app(Os::Macos, MeetingApp::Zoom).unwrap();
        let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
        let who = |tracker: &mut SpeakingTracker, s: &crate::reader::tree::Snapshot| {
            let now = tracker.push((s.t * 1000.0) as i64, &tiles_of(s, app).1, &BTreeMap::new(), true);
            now.into_iter()
                .filter(|p| p.speaking > 0.5)
                .map(|p| (p.name, p.via))
                .collect::<Vec<_>>()
        };
        let snaps = fixture("zoom-macos-synthetic.jsonl");
        assert_eq!(
            who(&mut tracker, &snaps[0]),
            [("Lan Nguyễn".to_string(), Via::Indicator)]
        );
        assert_eq!(
            who(&mut tracker, &snaps[3]),
            [("Minh Trần".to_string(), Via::Indicator)]
        );
        assert!(who(&mut tracker, &snaps[5]).is_empty());
    }

    #[test]
    fn flicker_needs_two_changes_within_a_second_and_deviation_a_quiet_baseline() {
        let mut h = History::default();
        h.push(0, Some(1), true);
        h.push(400, Some(2), true);
        assert!(!h.flickering(), "một lần đổi");
        h.push(800, Some(1), true);
        assert!(h.flickering());
        h.push(2_000, Some(1), true);
        assert!(!h.flickering(), "các lần đổi cũ hơn 1 s bị quên");
        let mut d = History::default();
        for i in 0..9 {
            d.push(i * 250, Some(7), true);
        }
        d.push(2_250, Some(8), false);
        assert!(!d.deviating(), "chưa đủ 10 lượt máy im");
        d.push(2_500, Some(7), true);
        d.push(2_750, Some(8), false);
        assert!(d.deviating(), "khác nền của các lượt máy im");
        for i in 0..60 {
            d.push(3_000 + i * 250, Some(8), false);
        }
        assert!(d.deviating(), "lượt có tiếng không vào nền");
    }

    fn tile(name: &str, slot: u32, anchor: Option<u64>, candidates: Vec<(u64, u64)>) -> TileSample {
        TileSample {
            name: name.into(),
            is_self: false,
            muted: None,
            label_speaking: false,
            anchors: vec![anchor],
            candidates,
            shapes: vec![],
            slot,
        }
    }

    #[test]
    fn the_same_name_in_two_windows_is_one_participant() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Presence]);
        let tiles = [tile("Lan", 0, None, vec![]), tile("Lan", 256, Some(1), vec![])];
        let now = tracker.push(0, &tiles, &BTreeMap::new(), true);
        assert_eq!(now.len(), 1);
        assert_eq!((now[0].speaking, now[0].via), (1.0, Via::Indicator));
    }

    /// QĐ 23 (rà soát A-Q1): hai ô cùng tên, mỗi ô đứng yên ở trạng thái riêng, không được coi là "đổi trạng thái".
    #[test]
    fn two_tiles_with_the_same_name_keep_separate_histories() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Flicker]);
        let mut last = Vec::new();
        for i in 0..8 {
            let tiles = [tile("Minh", 0, Some(1), vec![]), tile("Minh", 1, Some(2), vec![])];
            last = tracker.push(i * 250, &tiles, &BTreeMap::new(), true);
        }
        assert_eq!((last.len(), last[0].via), (1, Via::None));
    }

    /// Rà soát A-Q9: người nói 70% số lượt đọc (nhịp 4/s khi có tiếng làm lượt có tiếng chiếm đa số) không bị đảo chiều, vì nền lấy
    /// từ các lượt máy im (QĐ 23).
    #[test]
    fn a_talker_at_seventy_percent_is_not_inverted() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Deviation]);
        let mut wrong = 0;
        for i in 0..200i64 {
            let talking = i % 10 < 7;
            let state = if talking { 2 } else { 1 };
            let now = tracker.push(
                i * 250,
                &[tile("Lan", 0, Some(state), vec![])],
                &BTreeMap::new(),
                !talking,
            );
            if i >= 40 && (now[0].speaking > 0.5) != talking {
                wrong += 1;
            }
        }
        assert_eq!(wrong, 0);
    }

    #[test]
    fn a_learned_candidate_makes_its_participant_speak() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Presence]);
        let learned = BTreeMap::from([("Lan".to_string(), 42u64)]);
        let mut last = Vec::new();
        for i in 0..20 {
            last = tracker.push(i * 250, &[tile("Lan", 0, None, vec![(42, 1)])], &learned, true);
        }
        assert_eq!(last[0].via, Via::None);
        let now = tracker.push(5_000, &[tile("Lan", 0, None, vec![(42, 2)])], &learned, false);
        assert_eq!((now[0].speaking, now[0].via), (1.0, Via::Learned));
    }

    #[test]
    fn quiet_means_no_machine_speech_within_the_delay_and_a_second() {
        let mut speech = Spans::default();
        speech.add(10_000, 12_000);
        assert!(!quiet_at(&speech, 13_000, 900), "tiếng kết thúc 1 s trước, trễ 0,9 s");
        assert!(quiet_at(&speech, 14_000, 900));
        assert!(quiet_at(&speech, 9_999, 900), "chưa có tiếng");
    }

    /// Kế hoạch 04 Task 18: thời gian của phần thuần mỗi lượt đọc (duyệt cây fixture, lấy mẫu ô, tín hiệu). Không gồm thời gian gọi
    /// Accessibility (đo ở Task 20). Chạy tay: `cargo test --release -p speaker-worker --lib -- --ignored names::track --nocapture`.
    #[test]
    #[ignore]
    fn logic_cost_per_pass_on_fixtures() {
        for (file, app) in [
            ("teams-macos-people-closed.jsonl", MeetingApp::Teams),
            ("meet-chrome-macos.jsonl", MeetingApp::MeetChrome),
        ] {
            // Meet tắt mặc định (QĐ 32): công thức riêng của thư mục fixture.
            let r = if app == MeetingApp::Teams {
                recipes()
            } else {
                crate::reader::extract::tests::meet_recipes()
            };
            let app = r.app(Os::Macos, app).unwrap();
            let snaps = fixture(file);
            let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
            let mut us: Vec<f64> = Vec::new();
            for _ in 0..20 {
                for s in &snaps {
                    let t0 = std::time::Instant::now();
                    let (_, tiles) = tiles_of(s, app);
                    let _ = tracker.push((s.t * 1000.0) as i64, &tiles, &BTreeMap::new(), false);
                    us.push(t0.elapsed().as_secs_f64() * 1e6);
                }
            }
            us.sort_by(f64::total_cmp);
            eprintln!(
                "{file}: p50 {:.0} µs, p90 {:.0} µs, lớn nhất {:.0} µs ({} lượt)",
                us[us.len() / 2],
                us[us.len() * 9 / 10],
                us[us.len() - 1],
                us.len()
            );
        }
    }

    /// Rà soát B-N12: phần chạy trên luồng chính của worker, cùng luồng nhúng giọng, ở ca xấu nhất: tự hiệu chỉnh đang tìm với 32 ô ×
    /// 16 ứng viên (tối đa `MAX_SERIES` 512 chuỗi), mỗi 5 s một lần đánh giá trên lưới 240 điểm; ghép tên và tách giọng trên 512 đoạn
    /// gần nhất. In thời gian của lần `push` tốn nhất (lần có đánh giá) và của `settle` + `find_split`.
    #[test]
    #[ignore]
    fn worst_case_cost_of_calibration_matching_and_split() {
        use crate::names::Spans;
        use crate::names::calibrate::Calibrator;
        use crate::names::matcher::{NameMatcher, SegRec};
        use crate::names::split::find_split;
        use speaker_protocol::SpeakerConfig;
        let mut speech = Spans::default();
        speech.add(0, 10_000_000);
        let me = TileSample {
            name: "Hoa Phạm".into(),
            is_self: true,
            muted: Some(true),
            label_speaking: false,
            anchors: vec![],
            candidates: vec![],
            shapes: vec![],
            slot: 9_999,
        };
        let tiles: Vec<TileSample> = std::iter::once(me)
            .chain((0..32u32).map(|i| TileSample {
                name: format!("Người {i}"),
                is_self: false,
                muted: Some(false),
                label_speaking: false,
                anchors: vec![],
                candidates: (0..16u64).map(|k| (k, u64::from(i) + k)).collect(),
                shapes: vec![],
                slot: i,
            }))
            .collect();
        let mut c = Calibrator::default();
        let mut worst_push = 0f64;
        let mut t = 0i64;
        while t < 120_000 {
            let t0 = std::time::Instant::now();
            c.push(t, 250, &tiles, false, &speech, Default::default);
            worst_push = worst_push.max(t0.elapsed().as_secs_f64() * 1e3);
            t += 250;
        }
        let mut m = NameMatcher::default();
        for i in 0..512u64 {
            let s = i as i64 * 2_000;
            m.segment(SegRec::new(
                i,
                s,
                s + 1_500,
                Some((i % 8) as u32 + 1),
                false,
                Some(vec![1.0; 192]),
                true,
            ));
        }
        let now: Vec<ParticipantNow> = (0..32)
            .map(|i| ParticipantNow {
                name: format!("Người {i}"),
                is_self: false,
                muted: Some(false),
                speaking: 1.0,
                via: Via::Indicator,
            })
            .collect();
        let mut t = 0i64;
        while t < 1_030_000 {
            m.observe(t, 250, 900, &now[(t as usize / 2_000) % 32..][..1]);
            t += 250;
        }
        let cfg = SpeakerConfig {
            split: true,
            ..SpeakerConfig::default()
        };
        let t0 = std::time::Instant::now();
        m.settle(900, &speech, &std::collections::BTreeSet::new());
        let _ = find_split(
            &m,
            &cfg,
            &std::collections::BTreeSet::new(),
            &std::collections::BTreeSet::new(),
        );
        let settle_ms = t0.elapsed().as_secs_f64() * 1e3;
        eprintln!("xấu nhất: Calibrator::push {worst_push:.2} ms; settle + find_split (512 đoạn) {settle_ms:.2} ms");
    }
}
