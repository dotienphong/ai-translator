//! Tự hiệu chỉnh (spec §6.5; QĐ 11, 24 của kế hoạch 04). Chỉ khi lượt đọc nhận ra đúng một ô của chính người dùng. Bắt đầu tìm khi
//! máy có ≥ 10 s tiếng nói mà không người ở xa nào "đang nói" theo tín hiệu 1–3 (công thức không tìm thấy hay ngừng khớp); từ đó
//! bộ đọc gửi thêm trạng thái các phần tử không chữ trong mỗi ô (`TileSample::candidates`). Mỗi 5 s, với 60 s gần nhất, lưới
//! 250 ms, tiếng nói dời 0,6 s: phần tử nào có hệ số tương quan ≥ 0,6 giữa "khác trạng thái thường gặp nhất" và **tiếng nói chung
//! của máy** (như chữ spec), và ≥ 90% số lần đổi nằm trong lúc có tiếng, thì thành chỉ báo của người tham dự có ô chứa nó tới hết
//! phiên. Học được thì thôi tìm, tìm quá 3 phút không học được thì cũng ngừng; cả hai ca 10 phút sau mới tìm lại (rà soát A-Q4). Mẫu tìm được
//! không có tên người (khóa vị trí); kế hoạch 06 gửi kèm báo cáo tình trạng.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use speaker_protocol::{
    LearnedPattern, MAX_LEARNED_PATTERNS, MAX_PATTERN_CLASSES, MAX_PATTERN_PATH, MAX_PATTERN_STATES,
    MAX_PATTERN_TOKEN_BYTES, PatternState,
};

use super::Spans;
use crate::reader::extract::{CandidateShape, TileSample};

pub const CAL_WINDOW_MS: i64 = 60_000;
pub const CAL_GRID_MS: i64 = 250;
pub const CAL_SHIFT_MS: i64 = 600;
pub const CAL_MIN_R: f64 = 0.6;
pub const CAL_ONLY_IN_SPEECH: f64 = 0.9;
/// Khi đã thấy ≥ 2 giọng (mỗi giọng ≥ [`CAL_VOICE_MIN_MS`] trong cửa sổ): phần tử bật ≥ chừng này thời gian có tiếng của máy là
/// phần tử "toàn phòng", không phải chỉ báo của riêng một người (rà soát đợt A, A1).
pub const CAL_MAX_ON_SHARE: f64 = 0.8;
/// Khi đã thấy ≥ 2 giọng: một giọng phải trùng ≥ chừng này lúc phần tử bật thì mới coi là chủ của chỉ báo.
pub const CAL_OWNER_SHARE: f64 = 0.8;
pub const CAL_VOICE_MIN_MS: i64 = 1_000;
pub const CAL_START_AFTER_MS: i64 = 10_000;
pub const CAL_EVERY_MS: i64 = 5_000;
/// Tìm tối đa chừng này mỗi lần; không học được thì ngừng.
pub const CAL_MAX_SEARCH_MS: i64 = 180_000;
/// Ngừng vì không học được thì chừng này sau mới thử lại.
pub const CAL_RETRY_AFTER_MS: i64 = 600_000;
pub const MAX_LEARNED: usize = 16;
/// Số chuỗi (người, phần tử) tối đa đang theo dõi.
pub const MAX_SERIES: usize = 512;
/// Một chuỗi cần ít nhất chừng này mẫu mới được xét.
const MIN_SAMPLES: usize = 8;
/// Số (khóa, trạng thái) tối đa giữ mô tả trong một lần tìm.
const MAX_SHAPES: usize = 128;

#[derive(Default)]
pub struct Calibrator {
    active: bool,
    unexplained_ms: i64,
    searching_since: i64,
    retry_at: Option<i64>,
    series: BTreeMap<(String, u64), VecDeque<(i64, u64)>>,
    learned: BTreeMap<String, u64>,
    last_eval: Option<i64>,
    /// Mô tả các ứng viên đã thấy trong lần tìm này: (khóa, trạng thái) → (số lần thấy, mô tả). Bỏ khi thôi tìm.
    seen: BTreeMap<(u64, u64), (u32, CandidateShape)>,
    /// Mô tả chỉ báo đã học, theo khóa ứng viên (không có tên người), để gửi kèm báo cáo tình trạng.
    patterns: BTreeMap<u64, LearnedPattern>,
}

impl Calibrator {
    pub fn active(&self) -> bool {
        self.active
    }

    /// Chỉ báo tự học của từng người tham dự (khóa ứng viên).
    pub fn learned(&self) -> &BTreeMap<String, u64> {
        &self.learned
    }

    /// Mô tả các chỉ báo đã học (tối đa [`MAX_LEARNED_PATTERNS`], không trùng nhau, không có tên người): vai trò, vị trí trong ô và
    /// các trạng thái thấy nhiều nhất. Gửi kèm `ReaderState` (spec §7.2).
    pub fn patterns(&self) -> Vec<LearnedPattern> {
        self.patterns.values().take(MAX_LEARNED_PATTERNS).cloned().collect()
    }

    fn note(&mut self, shape: &CandidateShape) {
        let id = (shape.key, shape.state);
        if !self.seen.contains_key(&id) && self.seen.len() >= MAX_SHAPES {
            return;
        }
        self.seen.entry(id).or_insert_with(|| (0, shape.clone())).0 += 1;
    }

    /// Mô tả ứng viên `key` từ các trạng thái đã thấy (nhiều lần nhất trước, hòa thì trạng thái nhỏ hơn).
    fn describe(&self, key: u64) -> Option<LearnedPattern> {
        let mut states: Vec<&(u32, CandidateShape)> =
            self.seen.range((key, 0)..=(key, u64::MAX)).map(|(_, v)| v).collect();
        states.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.state.cmp(&b.1.state)));
        let first = &states.first()?.1;
        // Kẹp vào giới hạn của giao thức (`patterns_fit`): vai trò hay vị trí quá lớn thì không mô tả; vai trò phụ hay lớp quá
        // dài thì bỏ; quá nhiều lớp thì giữ những lớp đầu.
        if first.role.len() > MAX_PATTERN_TOKEN_BYTES || first.path.len() > MAX_PATTERN_PATH {
            return None;
        }
        let fits = |s: &&String| s.len() <= MAX_PATTERN_TOKEN_BYTES;
        Some(LearnedPattern {
            role: first.role.clone(),
            path: first.path.clone(),
            states: states
                .iter()
                .take(MAX_PATTERN_STATES)
                .map(|(_, s)| PatternState {
                    subrole: if fits(&&s.subrole) {
                        s.subrole.clone()
                    } else {
                        String::new()
                    },
                    classes: s
                        .classes
                        .iter()
                        .filter(fits)
                        .take(MAX_PATTERN_CLASSES)
                        .cloned()
                        .collect(),
                })
                .collect(),
        })
    }

    /// Một lượt đọc lúc `at_ms`, cách lượt trước `period_ms`. `explained`: có người ở xa đang nói theo tín hiệu 1–3 hay chỉ báo tự
    /// học; `speech`: tiếng nói của máy.
    pub fn push(
        &mut self,
        at_ms: i64,
        period_ms: i64,
        tiles: &[TileSample],
        explained: bool,
        speech: &Spans,
        voices: impl FnOnce() -> BTreeMap<u32, Spans>,
    ) {
        if tiles.iter().filter(|t| t.is_self).count() != 1 {
            // QĐ 24: chưa nhận ra (đúng một) ô của chính người dùng thì ô đó có thể bị học: không tự hiệu chỉnh.
            return;
        }
        if !self.active {
            if self.retry_at.is_some_and(|r| at_ms < r) {
                return;
            }
            if explained {
                self.unexplained_ms = 0;
            } else if speech.covers(at_ms - CAL_SHIFT_MS) {
                self.unexplained_ms += period_ms.clamp(0, 1_000);
            }
            if self.unexplained_ms < CAL_START_AFTER_MS {
                return;
            }
            self.active = true;
            self.searching_since = at_ms;
            self.last_eval = None;
        }
        if at_ms - self.searching_since >= CAL_MAX_SEARCH_MS {
            self.stop(Some(at_ms + CAL_RETRY_AFTER_MS));
            return;
        }
        for tile in tiles.iter().filter(|t| !t.is_self) {
            let mut keys: BTreeSet<u64> = self
                .series
                .keys()
                .filter(|(n, _)| *n == tile.name)
                .map(|(_, k)| *k)
                .collect();
            keys.extend(tile.candidates.iter().map(|(k, _)| *k));
            for shape in &tile.shapes {
                self.note(shape);
            }
            for key in keys {
                let id = (tile.name.clone(), key);
                if !self.series.contains_key(&id) && self.series.len() >= MAX_SERIES {
                    continue;
                }
                // Phần tử không có ở lượt này: trạng thái 0 (chỉ báo kiểu "chỉ có mặt khi nói").
                let state = tile.candidates.iter().find(|(k, _)| *k == key).map_or(0, |&(_, s)| s);
                let s = self.series.entry(id).or_default();
                s.push_back((at_ms, state));
                while s.front().is_some_and(|&(t, _)| t < at_ms - CAL_WINDOW_MS) {
                    s.pop_front();
                }
            }
        }
        if self.last_eval.is_none_or(|t| at_ms - t >= CAL_EVERY_MS) {
            self.last_eval = Some(at_ms);
            if self.evaluate(at_ms, speech, voices) {
                // Học được thì thôi tìm, 10 phút sau mới tìm tiếp cho người khác (rà soát lần 2 A-C1: không đặt hạn thì sau 10 s tiếng
                // nói chưa giải thích được lại tìm ngay).
                self.stop(Some(at_ms + CAL_RETRY_AFTER_MS));
            }
        }
    }

    /// Thôi tìm: bỏ chuỗi đang theo dõi; `retry_at`: không tìm lại trước lúc này.
    fn stop(&mut self, retry_at: Option<i64>) {
        self.active = false;
        self.unexplained_ms = 0;
        self.retry_at = retry_at;
        self.series.clear();
        self.seen.clear();
    }

    /// `true` khi học được chỉ báo mới.
    fn evaluate(&mut self, at_ms: i64, speech: &Spans, voices: impl FnOnce() -> BTreeMap<u32, Spans>) -> bool {
        let grid: Vec<i64> = (0..CAL_WINDOW_MS / CAL_GRID_MS)
            .map(|i| at_ms - CAL_WINDOW_MS + i * CAL_GRID_MS)
            .collect();
        let target: Vec<f64> = grid
            .iter()
            .map(|&t| f64::from(u8::from(speech.covers(t - CAL_SHIFT_MS))))
            .collect();
        let mut best: BTreeMap<String, (f64, u64)> = BTreeMap::new();
        // Giọng của worker chỉ lấy khi có ứng viên qua các ngưỡng trên (lấy một lần).
        let mut voices = Some(voices);
        let mut voice_spans: Option<BTreeMap<u32, Spans>> = None;
        for ((name, key), s) in &self.series {
            if self.learned.contains_key(name) || s.len() < MIN_SAMPLES {
                continue;
            }
            let mode = mode_of(s);
            let x: Vec<f64> = grid
                .iter()
                .map(|&t| state_at(s, t).map_or(0.0, |st| f64::from(u8::from(st != mode))))
                .collect();
            let r = pearson(&x, &target);
            let changes: Vec<i64> = s
                .iter()
                .zip(s.iter().skip(1))
                .filter(|(a, b)| a.1 != b.1)
                .map(|(_, b)| b.0)
                .collect();
            if changes.is_empty() {
                continue;
            }
            // Lần đổi lúc tắt tới sau khi hết tiếng (trễ của app): tính là "có tiếng" nếu máy có tiếng trong 1 s trước đó.
            let in_speech = changes
                .iter()
                .filter(|&&t| speech.covers(t - CAL_SHIFT_MS) || speech.covers(t - CAL_SHIFT_MS - 1_000))
                .count() as f64
                / changes.len() as f64;
            if r >= CAL_MIN_R && in_speech >= CAL_ONLY_IN_SPEECH && best.get(name).is_none_or(|b| r > b.0) {
                let owners = voice_spans.get_or_insert_with(|| voices.take().map(|f| f()).unwrap_or_default());
                if single_owner(&grid, &x, &target, owners) {
                    best.insert(name.clone(), (r, *key));
                }
            }
        }
        let mut learned_new = false;
        for (name, (_, key)) in best {
            if self.learned.len() < MAX_LEARNED {
                self.learned.insert(name, key);
                if let Some(pattern) = self.describe(key) {
                    self.patterns.entry(key).or_insert(pattern);
                }
                learned_new = true;
            }
        }
        learned_new
    }
}

/// Rà soát đợt A (A1): tương quan với tiếng nói CHUNG của máy không phân biệt "toàn phòng" với "của một người". Khi worker đã thấy
/// ≥ 2 giọng trong cửa sổ thì phần tử ứng viên (`x`: 1 khi khác trạng thái thường gặp) phải (a) không bật gần hết thời gian có tiếng
/// (≥ [`CAL_MAX_ON_SHARE`]) và (b) có một giọng trùng ≥ [`CAL_OWNER_SHARE`] lúc nó bật; không thì không học (ngả về "Người N").
fn single_owner(grid: &[i64], x: &[f64], target: &[f64], voices: &BTreeMap<u32, Spans>) -> bool {
    let (from, to) = (
        grid.first().copied().unwrap_or(0),
        grid.last().copied().unwrap_or(0) + CAL_GRID_MS,
    );
    let seen = voices
        .values()
        .filter(|v| v.overlap(from - CAL_SHIFT_MS, to - CAL_SHIFT_MS) >= CAL_VOICE_MIN_MS)
        .count();
    if seen < 2 {
        return true;
    }
    let on: Vec<i64> = grid.iter().zip(x).filter(|&(_, &v)| v > 0.5).map(|(&t, _)| t).collect();
    let speech_pts = target.iter().filter(|&&v| v > 0.5).count();
    let on_in_speech = x.iter().zip(target).filter(|&(&a, &b)| a > 0.5 && b > 0.5).count();
    if on.is_empty() || (speech_pts > 0 && on_in_speech as f64 >= CAL_MAX_ON_SHARE * speech_pts as f64) {
        return false;
    }
    voices.values().any(|v| {
        let own = on.iter().filter(|&&t| v.covers(t - CAL_SHIFT_MS)).count();
        own as f64 >= CAL_OWNER_SHARE * on.len() as f64
    })
}

/// Trạng thái thường gặp nhất; bằng số lần thì giá trị nhỏ hơn (tất định).
fn mode_of(s: &VecDeque<(i64, u64)>) -> u64 {
    let mut counts: BTreeMap<u64, usize> = BTreeMap::new();
    for &(_, st) in s {
        *counts.entry(st).or_default() += 1;
    }
    counts
        .iter()
        .max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0)))
        .map_or(0, |(st, _)| *st)
}

/// Trạng thái ở lượt đọc gần nhất không sau `t`.
fn state_at(s: &VecDeque<(i64, u64)>, t: i64) -> Option<u64> {
    let i = s.partition_point(|&(at, _)| at <= t);
    (i > 0).then(|| s[i - 1].1)
}

fn pearson(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len().min(y.len()) as f64;
    if n < 2.0 {
        return 0.0;
    }
    let (mx, my) = (x.iter().sum::<f64>() / n, y.iter().sum::<f64>() / n);
    let (mut sxy, mut sxx, mut syy) = (0.0, 0.0, 0.0);
    for (a, b) in x.iter().zip(y) {
        sxy += (a - mx) * (b - my);
        sxx += (a - mx) * (a - mx);
        syy += (b - my) * (b - my);
    }
    if sxx == 0.0 || syy == 0.0 {
        0.0
    } else {
        sxy / (sxx * syy).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tile(name: &str, candidates: Vec<(u64, u64)>) -> TileSample {
        TileSample {
            name: name.into(),
            is_self: false,
            muted: None,
            label_speaking: false,
            anchors: vec![None],
            candidates,
            shapes: vec![],
            slot: 0,
            variant: 0,
        }
    }

    /// Ô của chính người dùng (QĐ 24: chưa nhận ra ô này thì không tự hiệu chỉnh).
    fn me() -> TileSample {
        TileSample {
            is_self: true,
            slot: 1,
            variant: 0,
            ..tile("Hoa Phạm", vec![])
        }
    }

    /// Mỗi 4 s: nói 1,5 s, im 2,5 s; 80 s.
    fn bursts() -> Spans {
        let mut s = Spans::default();
        for k in 0..20 {
            s.add(k * 4_000, k * 4_000 + 1_500);
        }
        s
    }

    #[test]
    fn an_element_that_changes_with_speech_is_learned() {
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        let mut was_active = false;
        while t < 80_000 {
            let talking = speech.covers(t - CAL_SHIFT_MS);
            let noise = if (t / 3_300) % 2 == 0 { 1 } else { 2 };
            c.push(
                t,
                250,
                &[me(), tile("Lan", vec![(7, if talking { 2 } else { 1 }), (8, noise)])],
                false,
                &speech,
                Default::default,
            );
            was_active |= c.active();
            t += 250;
        }
        assert!(was_active, "≥ 10 s tiếng nói không ai đang nói");
        assert_eq!(c.learned().get("Lan"), Some(&7));
        assert_eq!(c.learned().len(), 1);
        assert!(!c.active(), "học được thì thôi tìm (rà soát A-Q4)");
    }

    /// Kế hoạch 06 (spec §7.2): chỉ báo học được kèm mô tả (vai trò, vị trí trong ô, các trạng thái đã thấy), không có tên người.
    #[test]
    fn a_learned_indicator_is_described_without_names() {
        let shape = |state: u64| CandidateShape {
            key: 7,
            state,
            role: "AXGroup".into(),
            path: vec![2, 0],
            subrole: String::new(),
            classes: if state == 2 {
                vec!["x".into(), "on".into()]
            } else {
                vec!["x".into()]
            },
        };
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let state = if speech.covers(t - CAL_SHIFT_MS) { 2 } else { 1 };
            let mut lan = tile("Lan", vec![(7, state)]);
            lan.shapes = vec![shape(state)];
            c.push(t, 250, &[me(), lan], false, &speech, Default::default);
            t += 250;
        }
        assert_eq!(c.learned().get("Lan"), Some(&7));
        let patterns = c.patterns();
        assert_eq!(patterns.len(), 1);
        assert_eq!(
            (patterns[0].role.as_str(), patterns[0].path.as_slice()),
            ("AXGroup", &[2u16, 0][..])
        );
        let classes: Vec<&Vec<String>> = patterns[0].states.iter().map(|s| &s.classes).collect();
        assert_eq!(classes.len(), 2, "hai trạng thái: im và đang nói");
        assert!(
            classes.contains(&&vec!["x".to_string()]) && classes.contains(&&vec!["x".to_string(), "on".to_string()])
        );
        assert!(!format!("{patterns:?}").contains("Lan"), "mô tả không có tên người");
        assert!(speaker_protocol::patterns_fit(&patterns));
    }

    /// Bổ sung kế hoạch 06: lớp CSS thật có thể dài hay nhiều hơn giới hạn của giao thức; mô tả phải được kẹp lại cho vừa
    /// `patterns_fit`, nếu không app coi worker là hỏng và dừng nhận giọng.
    #[test]
    fn a_described_indicator_always_fits_the_protocol_limits() {
        let long = "c".repeat(speaker_protocol::MAX_PATTERN_TOKEN_BYTES + 1);
        let shape = |state: u64| CandidateShape {
            key: 7,
            state,
            role: "AXGroup".into(),
            path: vec![2, 0],
            subrole: long.clone(),
            classes: std::iter::once(long.clone())
                .chain((0..7).map(|i| format!("k{i}")))
                .chain(std::iter::once(format!("s{state}")))
                .collect(),
        };
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let state = if speech.covers(t - CAL_SHIFT_MS) { 2 } else { 1 };
            let mut lan = tile("Lan", vec![(7, state)]);
            lan.shapes = vec![shape(state)];
            c.push(t, 250, &[me(), lan], false, &speech, Default::default);
            t += 250;
        }
        assert_eq!(c.learned().get("Lan"), Some(&7));
        let patterns = c.patterns();
        assert_eq!(patterns.len(), 1);
        assert!(speaker_protocol::patterns_fit(&patterns), "{patterns:?}");
        assert!(
            patterns[0].states.iter().all(|s| s.subrole.is_empty()),
            "token quá dài bị bỏ"
        );
    }

    /// QĐ 11 (rà soát A-Q10): máy lúc nào cũng có tiếng (Lan và Minh nói luân phiên); phần tử trong ô Lan đổi đúng lúc giọng của
    /// Minh nói. Tự hiệu chỉnh chỉ tương quan với tiếng nói chung (spec §6.5) nên không học (cách cũ "tương quan theo từng giọng" học
    /// nhầm phần tử này thành chỉ báo của Lan). Giới hạn đã biết: chỉ báo đúng của người nói luân phiên cũng không học được (r ≈ 0,30,
    /// mục Rủi ro).
    #[test]
    fn an_element_that_follows_another_voice_is_not_learned() {
        let mut speech = Spans::default();
        speech.add(0, 80_000);
        let mut minh = Spans::default();
        for k in 0..20 {
            minh.add(k * 4_000 + 2_000, k * 4_000 + 3_500);
        }
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let state = if minh.covers(t - CAL_SHIFT_MS) { 2 } else { 1 };
            c.push(
                t,
                250,
                &[me(), tile("Lan", vec![(7, state)])],
                false,
                &speech,
                Default::default,
            );
            t += 250;
        }
        assert!(c.learned().is_empty());
    }

    /// Rà soát đợt A (A1): ba người ở xa nói luân phiên; một phần tử "toàn phòng" nằm trong ô của Lan đổi trạng thái khi BẤT KỲ ai
    /// nói nên tương quan ~1 với tiếng nói chung. Không được học làm chỉ báo của Lan (mọi giọng sẽ nhận tên Lan).
    #[test]
    fn a_room_wide_element_is_not_learned_when_several_voices_talk() {
        let (speech, voices) = three_voices();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let state = if speech.covers(t - CAL_SHIFT_MS) { 2 } else { 1 };
            c.push(t, 250, &[me(), tile("Lan", vec![(7, state)])], false, &speech, || {
                voices.clone()
            });
            t += 250;
        }
        assert!(
            c.learned().is_empty(),
            "phần tử bật theo mọi giọng không phải của riêng Lan"
        );
    }

    /// Như trên nhưng phần tử chỉ bật khi hai trong ba giọng nói: không giọng nào giải thích ≥ 80% lúc bật.
    #[test]
    fn an_element_that_follows_two_of_three_voices_is_not_learned() {
        let (speech, voices) = three_voices();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let on = voices[&1].covers(t - CAL_SHIFT_MS) || voices[&2].covers(t - CAL_SHIFT_MS);
            c.push(
                t,
                250,
                &[me(), tile("Lan", vec![(7, if on { 2 } else { 1 })])],
                false,
                &speech,
                || voices.clone(),
            );
            t += 250;
        }
        assert!(c.learned().is_empty());
    }

    /// Không hồi quy (A1): có hai giọng, chỉ báo thật của giọng nói nhiều hơn (chỉ bật lúc giọng đó nói) vẫn được học.
    #[test]
    fn a_real_indicator_is_still_learned_when_two_voices_are_seen() {
        let mut v1 = Spans::default();
        let mut v2 = Spans::default();
        let mut speech = Spans::default();
        for k in 0..10 {
            v1.add(k * 8_000, k * 8_000 + 3_000);
            v2.add(k * 8_000 + 4_000, k * 8_000 + 5_500);
            speech.add(k * 8_000, k * 8_000 + 3_000);
            speech.add(k * 8_000 + 4_000, k * 8_000 + 5_500);
        }
        let voices: BTreeMap<u32, Spans> = [(1, v1.clone()), (2, v2)].into();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let on = v1.covers(t - CAL_SHIFT_MS);
            c.push(
                t,
                250,
                &[me(), tile("Lan", vec![(7, if on { 2 } else { 1 })])],
                false,
                &speech,
                || voices.clone(),
            );
            t += 250;
        }
        assert_eq!(c.learned().get("Lan"), Some(&7));
    }

    /// Ba giọng nói luân phiên (mỗi 12 s: 1,5 s mỗi giọng, nghỉ 2,5 s giữa các giọng); 80 s.
    fn three_voices() -> (Spans, BTreeMap<u32, Spans>) {
        let mut speech = Spans::default();
        let mut voices: BTreeMap<u32, Spans> = BTreeMap::new();
        for k in 0..7 {
            for v in 0..3u32 {
                let s = k * 12_000 + i64::from(v) * 4_000;
                speech.add(s, s + 1_500);
                voices.entry(v + 1).or_default().add(s, s + 1_500);
            }
        }
        (speech, voices)
    }

    #[test]
    fn nothing_is_learned_while_the_recipe_explains_speech() {
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let talking = speech.covers(t - CAL_SHIFT_MS);
            c.push(
                t,
                250,
                &[me(), tile("Lan", vec![(7, if talking { 2 } else { 1 })])],
                true,
                &speech,
                Default::default,
            );
            t += 250;
        }
        assert!(!c.active() && c.learned().is_empty());
    }

    /// QĐ 24: lượt đọc không nhận ra ô của chính người dùng (Meet hiện nay) thì không tự hiệu chỉnh.
    #[test]
    fn nothing_is_learned_without_the_user_tile() {
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let talking = speech.covers(t - CAL_SHIFT_MS);
            c.push(
                t,
                250,
                &[tile("Lan", vec![(7, if talking { 2 } else { 1 })])],
                false,
                &speech,
                Default::default,
            );
            t += 250;
        }
        assert!(!c.active() && c.learned().is_empty());
    }

    #[test]
    fn an_element_that_changes_in_silence_is_not_learned() {
        let speech = bursts();
        let mut c = Calibrator::default();
        // `i64` rõ ràng: `rem_euclid` không gọi được trên số nguyên chưa rõ kiểu (rà soát A-C2.2, lỗi E0689).
        let mut t: i64 = 0;
        while t < 80_000 {
            let quiet_middle = (2_500..3_500).contains(&(t.rem_euclid(4_000)));
            c.push(
                t,
                250,
                &[me(), tile("Lan", vec![(7, if quiet_middle { 2 } else { 1 })])],
                false,
                &speech,
                Default::default,
            );
            t += 250;
        }
        assert!(c.active());
        assert!(c.learned().is_empty());
    }

    /// Rà soát A-Q4: tìm quá 3 phút không học được gì thì ngừng (bộ đọc thôi đọc nhanh, thôi đọc ứng viên), 10 phút sau mới thử lại.
    #[test]
    fn the_search_stops_after_three_minutes_and_retries_after_ten() {
        let mut speech = Spans::default();
        speech.add(0, 1_000_000);
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        let (mut started, mut stopped, mut restarted) = (None, None, None);
        while t < 1_000_000 {
            c.push(
                t,
                250,
                &[me(), tile("Lan", vec![(7, 1)])],
                false,
                &speech,
                Default::default,
            );
            match (c.active(), started, stopped, restarted) {
                (true, None, _, _) => started = Some(t),
                (false, Some(_), None, _) => stopped = Some(t),
                (true, Some(_), Some(_), None) => restarted = Some(t),
                _ => {}
            }
            t += 250;
        }
        let (s, e, r) = (started.unwrap(), stopped.unwrap(), restarted.unwrap());
        assert_eq!(e - s, CAL_MAX_SEARCH_MS);
        assert!(r - e >= CAL_RETRY_AFTER_MS, "{}", r - e);
        assert!(c.learned().is_empty());
    }
}
