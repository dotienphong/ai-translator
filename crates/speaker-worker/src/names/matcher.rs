//! Ghép tên vào giọng (spec §6.6): cộng dồn thời gian trùng giữa các đoạn của mỗi giọng và khoảng "đang nói" của từng người tham
//! dự (đã dời theo độ trễ của app), gán tên khi đủ cả ba điều kiện, chống nhảy tên, đánh số khi một tên khớp nhiều giọng. Bằng
//! chứng của một đoạn tính khi dấu "đang nói" của khoảng thời gian đó đã tới (QĐ 9 của kế hoạch 04). Mỗi tên một giọng (ghép cặp
//! tối ưu, QĐ 9); giọng có dấu hiệu gộp không nhận tên (QĐ 25); tín hiệu mic cần ô của chính người dùng và bằng chứng chỉ báo (QĐ 24).
//! Không gán chính người dùng, không gán giọng trong phòng (§5.5). Thuần, tất định; tên không vào log.

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fmt;

use speaker_protocol::{NameSource, SpeakerConfig};

use super::{ParticipantNow, Spans, Via};
use crate::embed::cosine;

/// Gán khi một tên chiếm ≥ 60% thời gian trùng của giọng, có ≥ 3 s, từ ≥ 2 đoạn (spec §6.6).
pub const NAME_SHARE: f64 = 0.60;
pub const NAME_MIN_MS: i64 = 3_000;
pub const NAME_MIN_SEGMENTS: u32 = 2;
/// Bỏ tên đang gán khi nó xuống dưới 50% (QĐ 9, ngoài spec).
pub const NAME_DROP_SHARE: f64 = 0.50;
/// Đổi tên khi tên mới hơn tên cũ ≥ 20% và ≥ 5 s (spec §6.6).
pub const SWITCH_RATIO: f64 = 1.20;
pub const SWITCH_MIN_MS: i64 = 5_000;
/// Đoạn được tính bằng chứng khi lượt đọc mới nhất (đã trừ trễ) qua cuối đoạn chừng này.
pub const SETTLE_MARGIN_MS: i64 = 500;
/// Giữ khoảng "đang nói" chừng này.
pub const KEEP_SPEAKING_MS: i64 = 180_000;
/// Giữ bản ghi của chừng này đoạn gần nhất (tách giọng, đổi nhãn); tổng bằng chứng giữ cả phiên.
pub const KEEP_SEGMENTS: usize = 512;
/// Đoạn "mang tên" một người khi tên đó phủ ≥ 70% đoạn và không tên nào khác phủ ≥ 30% (tách giọng, §5.3).
pub const ATTRIBUTE_SHARE: f64 = 0.70;
pub const ATTRIBUTE_OTHER: f64 = 0.30;
pub const MAX_PARTICIPANTS: usize = 64;
/// Giọng "đang nói gần đây" (nhịp đọc nhanh, QĐ 13).
pub const RECENT_VOICE_MS: i64 = 60_000;
/// Tên phải có ít nhất chừng này bằng chứng từ chỉ báo (công thức hay tự học) trên giọng, không chỉ từ tín hiệu mic (QĐ 24).
pub const MIN_INDICATOR_MS: i64 = 1_000;

/// Ngưỡng lấy từ `SpeakerConfig` (đổi được qua `speaker_config` của manifest): dấu hiệu gộp (QĐ 25) và "tâm khác nhau" của máy
/// chung phòng (QĐ 9).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SplitRule {
    pub share: f64,
    pub min_ms: i64,
    pub max_cosine: f32,
}

impl SplitRule {
    pub fn from_config(c: &SpeakerConfig) -> Self {
        Self {
            share: f64::from(c.split_share),
            min_ms: c.split_min_ms as i64,
            max_cosine: c.split_max_cosine,
        }
    }
}

impl Default for SplitRule {
    fn default() -> Self {
        Self::from_config(&SpeakerConfig::default())
    }
}

/// Một đoạn đã có giọng.
#[derive(Clone)]
pub struct SegRec {
    pub id: u64,
    pub start_ms: i64,
    pub end_ms: i64,
    pub voice: Option<u32>,
    /// Đoạn từ micro: không bao giờ là bằng chứng cho tên (người trong phòng không có trên cửa sổ họp, spec §5.5).
    pub mic: bool,
    /// Nhúng của đoạn (tách giọng, §5.3); chỉ khi đọc tên bật, xóa cùng phiên (§5.6).
    pub embedding: Option<Vec<f32>>,
    /// Đoạn đã vào tâm của giọng (`Assignment::updated`).
    pub contributed: bool,
    /// Giọng của đoạn chỉ là đoán (`confidence` dưới θ: đoạn ngắn kế thừa giọng trước, hay bị ép vào giọng gần nhất khi đủ giọng): vẫn
    /// mang nhãn "Người N" nhưng không bao giờ là bằng chứng cho tên (rà soát đợt A, A2).
    pub guess: bool,
    settled: bool,
    evidence: Vec<(String, [i64; 3])>,
    /// Tên mà đoạn mang riêng (xem [`ATTRIBUTE_SHARE`]).
    pub attributed: Option<String>,
}

impl SegRec {
    pub fn new(
        id: u64,
        start_ms: i64,
        end_ms: i64,
        voice: Option<u32>,
        mic: bool,
        embedding: Option<Vec<f32>>,
        contributed: bool,
    ) -> Self {
        Self {
            id,
            start_ms,
            end_ms,
            voice,
            mic,
            embedding,
            contributed,
            guess: false,
            settled: false,
            evidence: Vec::new(),
            attributed: None,
        }
    }

    /// Đánh dấu giọng của đoạn là đoán (xem [`SegRec::guess`]).
    pub fn guessed(mut self, guess: bool) -> Self {
        self.guess = guess;
        self
    }

    pub fn dur(&self) -> i64 {
        (self.end_ms - self.start_ms).max(0)
    }
}

/// Bằng chứng của một tên cho một giọng: ms trùng, số đoạn, ms theo tín hiệu (chỉ báo, mic, tự học). `guess_*` là phần của các đoạn
/// "đoán" (xem [`SegRec::guess`]) đã nằm trong `ms`/`segs`/`by`: nó vẫn làm nặng thêm dấu hiệu gộp giọng (QĐ 25) và mẫu số của tỉ lệ,
/// nhưng không được tính để đạt ngưỡng nhận tên (rà soát đợt A, A2).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Evidence {
    pub ms: i64,
    pub segs: u32,
    pub by: [i64; 3],
    guess_by: [i64; 3],
    guess_segs: u32,
}

impl Evidence {
    fn apply(&mut self, by: [i64; 3], guess: bool, sign: i64) {
        for (a, b) in self.by.iter_mut().zip(by) {
            *a += sign * b;
        }
        if guess {
            for (a, b) in self.guess_by.iter_mut().zip(by) {
                *a += sign * b;
            }
        }
        self.ms += sign * by.iter().sum::<i64>();
        let step = |n: u32| if sign > 0 { n + 1 } else { n.saturating_sub(1) };
        self.segs = step(self.segs);
        if guess {
            self.guess_segs = step(self.guess_segs);
        }
    }

    /// ms trùng không tính các đoạn đoán.
    fn real_ms(&self) -> i64 {
        self.ms - self.guess_by.iter().sum::<i64>()
    }

    fn real_segs(&self) -> u32 {
        self.segs.saturating_sub(self.guess_segs)
    }

    /// ms theo chỉ báo (công thức và tự học) không tính các đoạn đoán.
    fn real_indicator(&self) -> i64 {
        self.by[0] + self.by[2] - self.guess_by[0] - self.guess_by[2]
    }

    pub fn source(&self) -> NameSource {
        let [ind, mic, learned] = self.by;
        if mic > ind && mic >= learned {
            NameSource::Mic
        } else if learned > ind {
            NameSource::Learned
        } else {
            NameSource::Indicator
        }
    }
}

fn slot(via: Via) -> usize {
    match via {
        Via::Mic => 1,
        Via::Learned => 2,
        Via::None | Via::Indicator => 0,
    }
}

/// Tên của một giọng như worker gửi trong `Voices`.
#[derive(Clone, PartialEq)]
pub struct VoiceName {
    pub name: String,
    pub room_index: Option<u32>,
    pub source: NameSource,
}

// Debug viết tay: tên không vào log (rà soát A-NHỎ 5).
impl fmt::Debug for VoiceName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "VoiceName(<{} ký tự>, số {:?}, {:?})",
            self.name.chars().count(),
            self.room_index,
            self.source
        )
    }
}

/// Tâm (tổng nhúng đã chuẩn hóa nhân thời lượng) của các đoạn; `None` khi ít hơn `min` nhúng dùng được. Dùng chung với `split`.
pub(crate) fn centroid_of<'a>(recs: impl IntoIterator<Item = &'a SegRec>, min: usize) -> Option<Vec<f32>> {
    let mut sum: Option<Vec<f32>> = None;
    let mut n = 0;
    for s in recs {
        let Some(e) = &s.embedding else { continue };
        let norm = e.iter().map(|x| x * x).sum::<f32>().sqrt();
        if !(norm.is_finite() && norm > 0.0) {
            continue;
        }
        let acc = sum.get_or_insert_with(|| vec![0.0; e.len()]);
        if acc.len() != e.len() {
            continue;
        }
        let w = s.dur() as f32 / norm;
        for (a, x) in acc.iter_mut().zip(e) {
            *a += x * w;
        }
        n += 1;
    }
    if n >= min { sum } else { None }
}

/// Tổng thời gian trùng lớn nhất khi mỗi tên về tối đa một giọng (ghép cặp tối ưu như Hungarian), bằng duyệt có cắt tỉa cho n ≤ 8:
/// `w[v][k]` là thời gian trùng của giọng `v` với tên `k` (0: không phải ứng viên). Chỉ test dùng, để kiểm cách nhóm theo tên của
/// [`NameMatcher`] vẫn tối ưu khi luật đổi.
#[cfg(test)]
pub(crate) fn best_matching(w: &[Vec<i64>]) -> i64 {
    fn go(w: &[Vec<i64>], v: usize, used: &mut [bool], sum: i64, best: &mut i64) {
        if v == w.len() {
            *best = (*best).max(sum);
            return;
        }
        let rest: i64 = w[v..].iter().map(|r| r.iter().copied().max().unwrap_or(0).max(0)).sum();
        if sum + rest <= *best {
            return;
        }
        go(w, v + 1, used, sum, best);
        for (k, &x) in w[v].iter().enumerate() {
            if x > 0 && !used[k] {
                used[k] = true;
                go(w, v + 1, used, sum + x, best);
                used[k] = false;
            }
        }
    }
    let mut best = 0;
    go(w, 0, &mut vec![false; w.first().map_or(0, Vec::len)], 0, &mut best);
    best
}

#[derive(Default)]
pub struct NameMatcher {
    spans: BTreeMap<(String, Via), Spans>,
    participants: Vec<(String, bool)>,
    segs: VecDeque<SegRec>,
    totals: BTreeMap<u32, BTreeMap<String, Evidence>>,
    names: BTreeMap<u32, String>,
    /// Tên vừa bỏ (QĐ 9): tên mới phải thắng tên này theo luật đổi tên mới được gán.
    held: BTreeMap<u32, String>,
    last_obs_ms: Option<i64>,
    rule: SplitRule,
}

impl NameMatcher {
    /// Ngưỡng từ `SpeakerConfig` của `Load` (mặc định: `SpeakerConfig::default()`).
    pub fn set_rule(&mut self, rule: SplitRule) {
        self.rule = rule;
    }

    /// Tắt "Lấy tên": bỏ mọi tên, bằng chứng, người tham dự; bản ghi đoạn giữ lại nhưng không còn bằng chứng.
    pub fn clear_names(&mut self) {
        self.spans.clear();
        self.participants.clear();
        self.totals.clear();
        self.names.clear();
        self.held.clear();
        self.last_obs_ms = None;
        for s in &mut self.segs {
            s.settled = true;
            s.evidence.clear();
            s.attributed = None;
        }
    }

    pub fn is_self(&self, name: &str) -> bool {
        self.participants.iter().any(|(n, me)| n == name && *me)
    }

    pub fn last_obs_ms(&self) -> Option<i64> {
        self.last_obs_ms
    }

    /// Một lượt đọc lúc `at_ms` (giờ phiên), cách lượt trước `period_ms`; `delay_ms`: chỉ báo của app trễ chừng này so với lúc nói.
    pub fn observe(&mut self, at_ms: i64, period_ms: i64, delay_ms: i64, now: &[ParticipantNow]) {
        for p in now {
            match self.participants.iter().position(|(n, _)| *n == p.name) {
                Some(i) => self.participants[i].1 |= p.is_self,
                None if self.participants.len() < MAX_PARTICIPANTS => {
                    self.participants.push((p.name.clone(), p.is_self))
                }
                None => {}
            }
        }
        let half = period_ms.clamp(2, 1_000) / 2;
        let (start, end) = (at_ms - delay_ms - half, at_ms - delay_ms + half);
        let speaking: Vec<(String, Via)> = now
            .iter()
            .filter(|p| !p.is_self && p.speaking > 0.5 && p.via != Via::None)
            .map(|p| (p.name.clone(), p.via))
            .collect();
        if speaking.is_empty() {
            // Tín hiệu 3 (spec §6.4): chỉ khi đúng một người ở xa đang mở mic, và lượt đọc nhận ra đúng một ô của chính người dùng
            // (QĐ 24: không thì ô của người dùng có thể là "người ở xa duy nhất mở mic"); phần máy có tiếng tính lúc lập bằng chứng.
            let me = now.iter().filter(|p| p.is_self).count();
            let open: Vec<&ParticipantNow> = now.iter().filter(|p| !p.is_self && p.muted == Some(false)).collect();
            if me == 1
                && let [only] = open[..]
            {
                self.spans
                    .entry((only.name.clone(), Via::Mic))
                    .or_default()
                    .add(start, end);
            }
        } else {
            for (name, via) in speaking {
                self.spans.entry((name, via)).or_default().add(start, end);
            }
        }
        self.last_obs_ms = Some(self.last_obs_ms.map_or(at_ms, |l| l.max(at_ms)));
        for s in self.spans.values_mut() {
            s.prune(at_ms - KEEP_SPEAKING_MS);
        }
    }

    /// Đoạn vừa có giọng (`Assign`).
    pub fn segment(&mut self, rec: SegRec) {
        self.segs.push_back(rec);
        while self.segs.len() > KEEP_SEGMENTS {
            self.segs.pop_front();
        }
    }

    /// Giọng của đoạn `id` đổi (tách giọng): bằng chứng của nó sang giọng mới.
    pub fn relabel(&mut self, id: u64, voice: u32) {
        let Some(i) = self.segs.iter().position(|s| s.id == id) else {
            return;
        };
        let old = self.segs[i].voice.replace(voice);
        if self.segs[i].settled {
            let ev = self.segs[i].evidence.clone();
            let guess = self.segs[i].guess;
            if let Some(old) = old {
                self.apply(old, &ev, guess, -1);
            }
            self.apply(voice, &ev, guess, 1);
        }
    }

    /// Worker gộp giọng `from` vào `into`.
    pub fn merged(&mut self, from: u32, into: u32) {
        for s in self.segs.iter_mut().filter(|s| s.voice == Some(from)) {
            s.voice = Some(into);
        }
        if let Some(moved) = self.totals.remove(&from) {
            let dst = self.totals.entry(into).or_default();
            for (name, e) in moved {
                let d = dst.entry(name).or_default();
                d.ms += e.ms;
                d.segs += e.segs;
                d.guess_segs += e.guess_segs;
                for (a, b) in d.by.iter_mut().zip(e.by) {
                    *a += b;
                }
                for (a, b) in d.guess_by.iter_mut().zip(e.guess_by) {
                    *a += b;
                }
            }
        }
        self.names.remove(&from);
        self.held.remove(&from);
    }

    fn apply(&mut self, voice: u32, ev: &[(String, [i64; 3])], guess: bool, sign: i64) {
        let t = self.totals.entry(voice).or_default();
        for (name, by) in ev {
            t.entry(name.clone()).or_default().apply(*by, guess, sign);
        }
    }

    fn overlaps(&self, start: i64, end: i64, speech: &Spans) -> Vec<(String, [i64; 3])> {
        let mut by: BTreeMap<String, [i64; 3]> = BTreeMap::new();
        for ((name, via), spans) in &self.spans {
            let ms = if *via == Via::Mic {
                spans.intersect(speech, start, end)
            } else {
                spans.overlap(start, end)
            };
            if ms > 0 {
                by.entry(name.clone()).or_default()[slot(*via)] += ms;
            }
        }
        by.into_iter().collect()
    }

    /// Lập bằng chứng cho các đoạn mà dấu "đang nói" của khoảng thời gian đó đã tới, rồi gán lại tên. `delay_ms`: trễ của app;
    /// `speech`: tiếng nói của máy (tín hiệu mic); `room`: giọng trong phòng. Trả `true` khi tên của giọng nào đó đổi.
    pub fn settle(&mut self, delay_ms: i64, speech: &Spans, room: &BTreeSet<u32>) -> bool {
        if let Some(last) = self.last_obs_ms {
            let ready: Vec<usize> = self
                .segs
                .iter()
                .enumerate()
                .filter(|(_, s)| !s.settled && s.voice.is_some() && last - delay_ms >= s.end_ms + SETTLE_MARGIN_MS)
                .map(|(i, _)| i)
                .collect();
            for i in ready {
                let (start, end, mic, voice) = {
                    let s = &self.segs[i];
                    (s.start_ms, s.end_ms, s.mic, s.voice)
                };
                let ev = if mic {
                    Vec::new()
                } else {
                    self.overlaps(start, end, speech)
                };
                let dur = (end - start).max(1) as f64;
                let total = |by: &[i64; 3]| by.iter().sum::<i64>() as f64;
                let guess = self.segs[i].guess;
                let attributed = ev
                    .iter()
                    .find(|(_, by)| total(by) >= ATTRIBUTE_SHARE * dur)
                    .filter(|(n, _)| ev.iter().all(|(m, by)| m == n || total(by) < ATTRIBUTE_OTHER * dur))
                    .map(|(n, _)| n.clone())
                    .filter(|_| !guess);
                if let Some(v) = voice {
                    self.apply(v, &ev, guess, 1);
                }
                let s = &mut self.segs[i];
                s.settled = true;
                s.evidence = ev;
                s.attributed = attributed;
            }
        }
        self.reassign(room)
    }

    fn reassign(&mut self, room: &BTreeSet<u32>) -> bool {
        let before = self.names.clone();
        let mut wanted: BTreeMap<u32, String> = BTreeMap::new();
        let voices: Vec<u32> = self.totals.keys().copied().collect();
        // Lưới an toàn (rà soát đợt A, A1): tên có bằng chứng tự học ở ≥ 2 giọng là dấu hiệu chỉ báo "toàn phòng" bị học nhầm.
        let mut learned_voices: BTreeMap<&str, u32> = BTreeMap::new();
        for t in self.totals.values() {
            for (n, e) in t {
                if e.by[2] >= MIN_INDICATOR_MS {
                    *learned_voices.entry(n.as_str()).or_default() += 1;
                }
            }
        }
        for &v in &voices {
            if room.contains(&v) {
                continue;
            }
            let t = &self.totals[&v];
            let total: i64 = t.values().map(|e| e.ms.max(0)).sum();
            let best = t
                .iter()
                .filter(|(n, _)| !self.is_self(n))
                .max_by(|a, b| a.1.ms.cmp(&b.1.ms).then(b.0.cmp(a.0)))
                .map(|(n, e)| (n.clone(), *e));
            let ms_of = |name: &str| t.get(name).map_or(0, |e| e.ms);
            let qualifies = |e: &Evidence| {
                e.real_ms() >= NAME_MIN_MS
                    && e.real_segs() >= NAME_MIN_SEGMENTS
                    && total > 0
                    && e.ms as f64 >= NAME_SHARE * total as f64
                    && e.real_indicator() >= MIN_INDICATOR_MS
            };
            let beats = |n: &str, e: &Evidence, old: &str| {
                n == old || (e.ms as f64 >= SWITCH_RATIO * ms_of(old) as f64 && e.ms - ms_of(old) >= SWITCH_MIN_MS)
            };
            // QĐ 25: một tên khác (không phải người dùng) chiếm phần đáng kể của giọng: dấu hiệu gộp, không nhận tên trội.
            let merged = |winner: &str| {
                t.iter().any(|(n, e)| {
                    n != winner
                        && !self.is_self(n)
                        && e.ms >= self.rule.min_ms
                        && e.ms as f64 >= self.rule.share * total as f64
                        && e.segs >= NAME_MIN_SEGMENTS
                })
            };
            let current = self.names.get(&v).cloned();
            let anchor = current.clone().or_else(|| self.held.get(&v).cloned());
            let next = match best {
                Some((n, e)) if qualifies(&e) && anchor.as_deref().is_none_or(|old| beats(&n, &e, old)) => Some(n),
                _ => current.filter(|old| total > 0 && ms_of(old) as f64 >= NAME_DROP_SHARE * total as f64),
            };
            // Tên bị ≥ 2 giọng nhận bằng chứng tự học thì giọng nào cũng không nhận tên đó bằng bằng chứng tự học.
            let contested = |n: &str| {
                learned_voices.get(n).is_some_and(|&c| c >= 2)
                    && t.get(n).is_some_and(|e| e.source() == NameSource::Learned)
            };
            if let Some(n) = next.filter(|n| !merged(n) && !contested(n)) {
                wanted.insert(v, n);
            }
        }
        let chosen = self.one_voice_per_name(&wanted);
        for v in voices {
            match chosen.get(&v) {
                Some(n) => {
                    self.held.remove(&v);
                    self.names.insert(v, n.clone());
                }
                None => {
                    if let Some(old) = self.names.remove(&v) {
                        self.held.insert(v, old);
                    }
                }
            }
        }
        self.names != before
    }

    /// Mỗi tên một giọng (spec §6.6, QĐ 9). Mỗi giọng có tối đa một tên ứng viên nên ghép cặp tối ưu là: tên về giọng có nhiều thời
    /// gian trùng với tên đó nhất (bằng nhau: mã nhỏ hơn; test `grouping_by_name_is_an_optimal_matching`), trừ khi một giọng đang mang
    /// tên đó và giọng kia chưa hơn nó theo luật đổi tên (≥ 20% và ≥ 5 s). Giọng thua giữ tên kèm số (máy chung phòng) chỉ khi tâm
    /// nhúng của nó khác tâm của mọi giọng khác cùng tên (`cosine ≤ split_max_cosine`).
    fn one_voice_per_name(&self, wanted: &BTreeMap<u32, String>) -> BTreeMap<u32, String> {
        let mut by_name: BTreeMap<&str, Vec<u32>> = BTreeMap::new();
        for (v, n) in wanted {
            by_name.entry(n.as_str()).or_default().push(*v);
        }
        let mut out = BTreeMap::new();
        for (name, voices) in by_name {
            let ms = |v: u32| self.totals.get(&v).and_then(|t| t.get(name)).map_or(0, |e| e.ms);
            let most = |list: Vec<u32>| list.into_iter().max_by(|a, b| ms(*a).cmp(&ms(*b)).then(b.cmp(a)));
            let Some(best) = most(voices.clone()) else { continue };
            // Chống nhảy tên giữa các giọng (spec §6.6; rà soát lần 2 A-Q2): giọng đang mang tên giữ tên trừ khi giọng khác hơn nó
            // ≥ 20% và ≥ 5 s thời gian trùng với tên đó.
            let holder = most(
                voices
                    .iter()
                    .copied()
                    .filter(|v| self.names.get(v).map(String::as_str) == Some(name))
                    .collect(),
            );
            let winner = match holder {
                Some(h)
                    if h != best
                        && !(ms(best) as f64 >= SWITCH_RATIO * ms(h) as f64 && ms(best) - ms(h) >= SWITCH_MIN_MS) =>
                {
                    h
                }
                _ => best,
            };
            out.insert(winner, name.to_string());
            if voices.len() < 2 {
                continue;
            }
            let centroids: BTreeMap<u32, Option<Vec<f32>>> = voices
                .iter()
                .map(|&v| (v, centroid_of(self.segs.iter().filter(|s| s.voice == Some(v)), 1)))
                .collect();
            for &v in voices.iter().filter(|&&v| v != winner) {
                let distinct = centroids[&v].as_ref().is_some_and(|c| {
                    voices.iter().filter(|&&o| o != v).all(|o| {
                        centroids[o]
                            .as_ref()
                            .is_some_and(|d| cosine(c, d) <= self.rule.max_cosine)
                    })
                });
                if distinct {
                    out.insert(v, name.to_string());
                }
            }
        }
        out
    }

    /// Tên đang gán, theo giọng (thứ tự mã giọng = thứ tự xuất hiện), kèm số khi một tên ở nhiều giọng (máy chung phòng).
    pub fn names(&self) -> BTreeMap<u32, VoiceName> {
        let mut count: BTreeMap<&str, u32> = BTreeMap::new();
        for n in self.names.values() {
            *count.entry(n.as_str()).or_default() += 1;
        }
        let mut index: BTreeMap<&str, u32> = BTreeMap::new();
        self.names
            .iter()
            .map(|(&v, n)| {
                let room_index = (count[n.as_str()] > 1).then(|| {
                    let k = index.entry(n.as_str()).or_default();
                    *k += 1;
                    *k
                });
                let source = self
                    .totals
                    .get(&v)
                    .and_then(|t| t.get(n))
                    .map_or(NameSource::Indicator, Evidence::source);
                (
                    v,
                    VoiceName {
                        name: n.clone(),
                        room_index,
                        source,
                    },
                )
            })
            .collect()
    }

    /// Người tham dự đã thấy trong phiên (kể cả chính người dùng, QĐ 18), theo thứ tự thấy.
    pub fn participants(&self) -> Vec<String> {
        self.participants.iter().map(|(n, _)| n.clone()).collect()
    }

    /// Có giọng (không phải trong phòng) nói trong 60 s gần nhất mà chưa có tên (nhịp đọc nhanh, QĐ 13).
    pub fn needs_names(&self, now_ms: i64, room: &BTreeSet<u32>) -> bool {
        self.segs
            .iter()
            .rev()
            .take_while(|s| s.end_ms >= now_ms - RECENT_VOICE_MS)
            .filter_map(|s| s.voice)
            .any(|v| !room.contains(&v) && !self.names.contains_key(&v))
    }

    /// Khoảng nói của từng giọng (không tính đoạn từ micro) từ `since` ms.
    pub fn voice_spans(&self, since: i64) -> BTreeMap<u32, Spans> {
        let mut out: BTreeMap<u32, Spans> = BTreeMap::new();
        for s in self.segs.iter().filter(|s| !s.mic && s.end_ms > since) {
            if let Some(v) = s.voice {
                out.entry(v).or_default().add(s.start_ms, s.end_ms);
            }
        }
        out
    }

    pub fn records(&self) -> impl Iterator<Item = &SegRec> {
        self.segs.iter()
    }

    pub fn totals(&self) -> &BTreeMap<u32, BTreeMap<String, Evidence>> {
        &self.totals
    }

    pub fn named_voices(&self) -> usize {
        self.names.len()
    }
}
#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    const ROOMLESS: BTreeSet<u32> = BTreeSet::new();

    pub(crate) fn person(name: &str, speaking: bool) -> ParticipantNow {
        ParticipantNow {
            name: name.into(),
            is_self: false,
            muted: None,
            speaking: if speaking { 1.0 } else { 0.0 },
            via: if speaking { Via::Indicator } else { Via::None },
        }
    }

    /// Lượt đọc mỗi 250 ms trong [from, to) (giờ của lượt đọc); mỗi người nói trong các khoảng `talks` (giờ tiếng nói); chỉ báo hiện
    /// trễ `delay` ms sau lúc nói, như Teams (spec §6.6).
    pub(crate) fn read(m: &mut NameMatcher, from: i64, to: i64, delay: i64, people: &[(&str, &[(i64, i64)])]) {
        let mut t = from;
        while t < to {
            let now: Vec<ParticipantNow> = people
                .iter()
                .map(|(n, talks)| person(n, talks.iter().any(|&(s, e)| s + delay <= t && t < e + delay)))
                .collect();
            m.observe(t, 250, delay, &now);
            t += 250;
        }
    }

    pub(crate) fn seg(id: u64, s: i64, e: i64, voice: u32) -> SegRec {
        SegRec::new(id, s, e, Some(voice), false, None, true)
    }

    fn seg_e(id: u64, s: i64, e: i64, voice: u32, emb: [f32; 3]) -> SegRec {
        SegRec::new(id, s, e, Some(voice), false, Some(emb.to_vec()), true)
    }

    fn name_of(m: &NameMatcher, voice: u32) -> Option<String> {
        m.names().get(&voice).map(|n| n.name.clone())
    }

    const LAN: &[(i64, i64)] = &[(0, 4_000), (10_000, 14_000)];

    #[test]
    fn a_voice_gets_the_name_that_speaks_with_it_after_two_segments() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        read(&mut m, 0, 6_000, 900, &[("Lan", LAN), ("Minh", &[])]);
        assert!(
            !m.settle(900, &Spans::default(), &ROOMLESS),
            "một đoạn chưa đủ (spec §6.6: ≥ 2 đoạn)"
        );
        assert_eq!(name_of(&m, 1), None);
        m.segment(seg(1, 10_000, 14_000, 1));
        read(&mut m, 6_000, 16_000, 900, &[("Lan", LAN), ("Minh", &[])]);
        assert!(m.settle(900, &Spans::default(), &ROOMLESS));
        let names = m.names();
        assert_eq!(names[&1].name, "Lan");
        assert_eq!((names[&1].room_index, names[&1].source), (None, NameSource::Indicator));
        assert_eq!(m.participants(), ["Lan", "Minh"]);
    }

    #[test]
    fn a_segment_waits_for_the_late_indicator() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        read(&mut m, 0, 4_000, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(
            m.records().next().unwrap().attributed,
            None,
            "dấu đang nói của cuối đoạn chưa tới"
        );
        read(&mut m, 4_000, 5_750, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(m.records().next().unwrap().attributed.as_deref(), Some("Lan"));
    }

    /// Nói chồng cả hai lượt: mỗi tên 50% < 60%, không gán (thà "Người N" còn hơn sai tên).
    #[test]
    fn overlapping_speakers_leave_the_voice_unnamed() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 1));
        read(&mut m, 0, 16_000, 900, &[("Lan", LAN), ("Minh", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1), None);
    }

    /// Spec §6.6: một tên khớp nhiều giọng khác hẳn nhau (máy chung phòng, tâm nhúng cosine 0) giữ tên kèm số theo thứ tự xuất hiện.
    #[test]
    fn one_name_on_two_voices_is_a_shared_room() {
        let mut m = NameMatcher::default();
        let room: &[(i64, i64)] = &[(0, 4_000), (5_000, 9_000), (10_000, 14_000), (15_000, 19_000)];
        m.segment(seg_e(0, 0, 4_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(1, 5_000, 9_000, 2, [0.0, 1.0, 0.0]));
        m.segment(seg_e(2, 10_000, 14_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(3, 15_000, 19_000, 2, [0.0, 1.0, 0.0]));
        read(&mut m, 0, 21_000, 900, &[("Phòng A", room)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        let names = m.names();
        assert_eq!((names[&1].name.as_str(), names[&1].room_index), ("Phòng A", Some(1)));
        assert_eq!((names[&2].name.as_str(), names[&2].room_index), ("Phòng A", Some(2)));
    }

    /// Lượt đọc mỗi 250 ms trong [from, to): `who` đang "nói" qua tín hiệu `via` khi giờ lượt đọc (đã trừ trễ 0) nằm trong `talks`.
    fn read_via(m: &mut NameMatcher, from: i64, to: i64, who: &str, via: Via, talks: &[(i64, i64)]) {
        let mut t = from;
        while t < to {
            let on = talks.iter().any(|&(s, e)| s <= t && t < e);
            let now = [ParticipantNow {
                name: who.into(),
                is_self: false,
                muted: None,
                speaking: if on { 1.0 } else { 0.0 },
                via: if on { via } else { Via::None },
            }];
            m.observe(t, 250, 0, &now);
            t += 250;
        }
    }

    /// Rà soát đợt A (A1, lưới an toàn): một chỉ báo tự học "toàn phòng" bật theo mọi giọng thì giọng nào cũng có bằng chứng Learned
    /// cho cùng một tên. Một tên có bằng chứng Learned ở ≥ 2 giọng thì không gán bằng bằng chứng Learned cho giọng nào ("Người N").
    #[test]
    fn a_name_learned_on_several_voices_is_given_to_none() {
        let mut m = NameMatcher::default();
        let all: &[(i64, i64)] = &[
            (0, 4_000),
            (5_000, 9_000),
            (10_000, 14_000),
            (15_000, 19_000),
            (20_000, 24_000),
            (25_000, 29_000),
        ];
        for (i, &(s, e)) in all.iter().enumerate() {
            let voice = (i % 3) as u32 + 1;
            let mut emb = [0.0f32; 3];
            emb[(voice - 1) as usize] = 1.0;
            m.segment(seg_e(i as u64, s, e, voice, emb));
        }
        read_via(&mut m, 0, 32_000, "Lan", Via::Learned, all);
        m.settle(0, &Spans::default(), &ROOMLESS);
        assert!(m.names().is_empty(), "{:?}", m.names());
    }

    /// Không hồi quy (A1): bằng chứng Learned chỉ ở MỘT giọng vẫn gán tên.
    #[test]
    fn a_name_learned_on_one_voice_is_still_given() {
        let mut m = NameMatcher::default();
        let lan: &[(i64, i64)] = &[(0, 4_000), (10_000, 14_000)];
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 1));
        read_via(&mut m, 0, 16_000, "Lan", Via::Learned, lan);
        m.settle(0, &Spans::default(), &ROOMLESS);
        let names = m.names();
        assert_eq!(
            (names[&1].name.as_str(), names[&1].source),
            ("Lan", NameSource::Learned)
        );
    }

    /// Khoảng nói của từng giọng (đoạn từ micro không tính) từ `since` ms; cho tự hiệu chỉnh phân biệt "toàn phòng" với "một người".
    #[test]
    fn voice_spans_group_non_mic_segments_by_voice() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 1_000, 1));
        m.segment(seg(1, 2_000, 3_000, 2));
        m.segment(SegRec::new(2, 4_000, 5_000, Some(3), true, None, true));
        m.segment(SegRec::new(3, 6_000, 7_000, None, false, None, true));
        m.segment(seg(4, 8_000, 9_000, 1));
        let v = m.voice_spans(1_500);
        assert_eq!(v.keys().copied().collect::<Vec<_>>(), [1, 2]);
        assert!(
            v[&1].covers(8_500) && !v[&1].covers(500),
            "đoạn kết thúc trước `since` bị bỏ"
        );
    }

    /// QĐ 9 (rà soát A-Q7): một người bị phân cụm tách thành hai giọng giống nhau (cosine 0,95 > `split_max_cosine` 0,85): mỗi tên
    /// một giọng, chỉ giọng có nhiều thời gian trùng hơn mang tên, không đánh số như máy chung phòng.
    #[test]
    fn one_person_split_into_two_similar_voices_names_only_one() {
        let mut m = NameMatcher::default();
        let lan: &[(i64, i64)] = &[(0, 4_000), (5_000, 9_000), (10_000, 14_000), (15_000, 17_000)];
        m.segment(seg_e(0, 0, 4_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(1, 5_000, 9_000, 2, [0.95, 0.31, 0.0]));
        m.segment(seg_e(2, 10_000, 14_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(3, 15_000, 17_000, 2, [0.95, 0.31, 0.0]));
        read(&mut m, 0, 20_000, 900, &[("Lan", lan)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        let names = m.names();
        assert_eq!((names[&1].name.as_str(), names[&1].room_index), ("Lan", None));
        assert_eq!(names.get(&2), None, "tâm giống: cùng một người");
    }

    /// Rà soát lần 2 A-Q2: một người bị tách hai giọng giống nhau; giọng 1 mang tên trước. Giọng 2 vượt giọng 1 (15,5 s so với
    /// 11,6 s, hơn 33% nhưng chỉ hơn 3,9 s) thì giọng 1 vẫn giữ tên, mọi dòng cũ của nó không đổi; chỉ khi giọng 2 hơn ≥ 20% và ≥ 5 s
    /// (19,4 s so với 11,6 s) tên mới chuyển (spec §6.6, chống nhảy tên).
    #[test]
    fn the_name_stays_on_its_voice_until_another_voice_beats_it_by_the_switch_rule() {
        let mut m = NameMatcher::default();
        let a = [1.0, 0.0, 0.0];
        let b = [0.95, 0.31, 0.0];
        let one: &[(i64, i64)] = &[(0, 4_000), (5_000, 9_000), (10_000, 14_000)];
        let two: &[(i64, i64)] = &[
            (15_000, 19_000),
            (20_000, 24_000),
            (25_000, 29_000),
            (30_000, 34_000),
            (35_000, 39_000),
        ];
        for (i, &(s, e)) in one.iter().enumerate() {
            m.segment(seg_e(i as u64, s, e, 1, a));
        }
        for (i, &(s, e)) in two.iter().enumerate() {
            m.segment(seg_e(10 + i as u64, s, e, 2, b));
        }
        let lan: Vec<(i64, i64)> = one.iter().chain(two).copied().collect();
        read(&mut m, 0, 16_000, 900, &[("Lan", lan.as_slice())]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(
            (name_of(&m, 1).as_deref(), name_of(&m, 2)),
            (Some("Lan"), None),
            "t = 16 s"
        );
        read(&mut m, 16_000, 36_000, 900, &[("Lan", lan.as_slice())]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(
            (name_of(&m, 1).as_deref(), name_of(&m, 2)),
            (Some("Lan"), None),
            "t = 36 s: giọng 2 chưa thắng theo luật đổi tên"
        );
        read(&mut m, 36_000, 42_000, 900, &[("Lan", lan.as_slice())]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(
            (name_of(&m, 1), name_of(&m, 2).as_deref()),
            (None, Some("Lan")),
            "t = 42 s: giọng 2 hơn ≥ 20% và ≥ 5 s"
        );
    }

    /// QĐ 32 (rà soát lần 2 A-Q1): chuỗi đầy đủ fixture → `SpeakingTracker` (250 ms) → `NameMatcher` trên bản ghi Meet (đoạn = các
    /// khoảng nói thật của giọng đọc máy, trễ của công thức Meet). Chỉ báo chỉ có ở ô của tài khoản đang nói **trong chính cửa sổ của
    /// nó** (cửa sổ 0, khi dùng thật là ô của chính người dùng); ở cửa sổ chủ phòng (cửa sổ 1, chỗ người dùng nghe người ở xa) không có
    /// bằng chứng nào nên không có tên. Ghim hành vi thật, không hạ chuẩn ghép tên cho vừa; Meet tắt mặc định tới khi T21 tìm được
    /// chỉ báo dùng được ở cửa sổ người nghe.
    #[test]
    fn meet_gives_no_name_in_the_listener_window() {
        use crate::names::track::{SpeakingTracker, quiet_at};
        use crate::reader::extract::tests::{meet_recipes, tiles_of};
        use crate::reader::tree::tests::{fixture, truth};
        use speaker_recipe::{MeetingApp, Os};
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        let snaps = fixture("meet-chrome-macos.jsonl");
        let mut talks: Vec<(i64, i64)> = Vec::new();
        let mut open = None;
        for (t, who, on) in truth("meet-chrome-macos.jsonl") {
            let ms = (t * 1000.0) as i64;
            match (on, open) {
                (true, None) if who == "nguoinoi" => open = Some(ms),
                (false, Some(start)) if who == "nguoinoi" => {
                    talks.push((start, ms));
                    open = None;
                }
                _ => {}
            }
        }
        assert!(!talks.is_empty());
        let mut speech = Spans::default();
        for &(s, e) in &talks {
            speech.add(s, e);
        }
        let delay = i64::from(app.delay_ms);
        let run = |listener: bool| {
            let mut m = NameMatcher::default();
            for (i, &(s, e)) in talks.iter().enumerate() {
                m.segment(seg(i as u64, s, e, 1));
            }
            let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
            let end = (snaps.last().unwrap().t * 1000.0) as i64;
            let mut t = (snaps[0].t * 1000.0) as i64;
            while t < end {
                let i = snaps.partition_point(|s| (s.t * 1000.0) as i64 <= t) - 1;
                let tiles: Vec<_> = tiles_of(&snaps[i], app)
                    .1
                    .into_iter()
                    .filter(|x| (x.slot >= 256) == listener)
                    .collect();
                let now = tracker.push(t, &tiles, &BTreeMap::new(), quiet_at(&speech, t, delay));
                m.observe(t, 250, delay, &now);
                t += 250;
            }
            m.settle(delay, &speech, &ROOMLESS);
            let evidence: i64 = m.totals().values().flat_map(|t| t.values()).map(|e| e.ms).sum();
            (m.names().len(), evidence)
        };
        let (named, evidence) = run(true);
        eprintln!("meet, cửa sổ người nghe: {named} giọng có tên, bằng chứng {evidence} ms");
        assert_eq!((named, evidence), (0, 0), "cửa sổ người nghe không có chỉ báo");
        let (named, evidence) = run(false);
        eprintln!("meet, cửa sổ của người đang nói: {named} giọng có tên, bằng chứng {evidence} ms");
        assert!(
            named == 1 && evidence > 0,
            "chỉ báo chỉ có ở cửa sổ của chính người đang nói"
        );
    }

    /// QĐ 25 (rà soát A-Q6): giọng gộp 2:1 (Lan 3 đoạn khoảng 11,6 s, Minh 2 đoạn khoảng 5,75 s) không nhận tên trội khi chưa tách.
    #[test]
    fn a_merged_voice_with_a_dominant_name_stays_unnamed() {
        let mut m = NameMatcher::default();
        let lan: &[(i64, i64)] = &[(0, 4_000), (10_000, 14_000), (20_000, 24_000)];
        let minh: &[(i64, i64)] = &[(5_000, 8_000), (15_000, 18_000)];
        for (i, &(s, e)) in [lan[0], minh[0], lan[1], minh[1], lan[2]].iter().enumerate() {
            m.segment(seg(i as u64, s, e, 1));
        }
        read(&mut m, 0, 26_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        let t = &m.totals()[&1];
        assert!(
            t["Lan"].ms > 11_000 && t["Minh"].ms > 5_000,
            "Lan {}, Minh {}",
            t["Lan"].ms,
            t["Minh"].ms
        );
        assert_eq!(name_of(&m, 1), None);
    }

    /// QĐ 9: với luật hiện nay mỗi giọng có tối đa một tên ứng viên; khi đó "tên về giọng có nhiều thời gian trùng nhất" cho đúng
    /// tổng của ghép cặp tối ưu (như Hungarian). Kiểm trên 300 ma trận giả ngẫu nhiên tất định, tới 8 giọng, 5 tên.
    #[test]
    fn grouping_by_name_is_an_optimal_matching() {
        let mut seed = 7u64;
        let mut next = |m: u64| {
            seed = seed
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (seed >> 33) % m
        };
        for _ in 0..300 {
            let (n, k) = (1 + next(8) as usize, 1 + next(5) as usize);
            let mut w = vec![vec![0i64; k]; n];
            for row in &mut w {
                if next(4) > 0 {
                    row[next(k as u64) as usize] = 1 + next(20_000) as i64;
                }
            }
            let mut by_name = vec![0i64; k];
            for row in &w {
                for (j, &x) in row.iter().enumerate() {
                    by_name[j] = by_name[j].max(x);
                }
            }
            assert_eq!(by_name.iter().sum::<i64>(), best_matching(&w), "{w:?}");
        }
    }

    #[test]
    fn voice_names_never_print_names() {
        let n = VoiceName {
            name: "Lan Nguyễn".into(),
            room_index: Some(1),
            source: NameSource::Indicator,
        };
        assert!(!format!("{n:?}").contains("Lan"));
    }

    #[test]
    fn the_user_and_room_voices_never_get_a_name() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 1));
        let mut t = 0;
        while t < 16_000 {
            let mut me = person("Hoa Phạm", LAN.iter().any(|&(s, e)| s + 900 <= t && t < e + 900));
            me.is_self = true;
            m.observe(t, 250, 900, &[me]);
            t += 250;
        }
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1), None, "chính người dùng");
        assert_eq!(m.participants(), ["Hoa Phạm"], "vẫn có trong danh sách chọn tên");
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 1));
        read(&mut m, 0, 16_000, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &BTreeSet::from([1]));
        assert_eq!(name_of(&m, 1), None, "giọng trong phòng (spec §5.5)");
    }

    /// Spec §6.6: đổi tên đã gán chỉ khi tên mới hơn ≥ 20% và ≥ 5 s; QĐ 9: tên cũ dưới 50% thì bỏ tên trong lúc chờ.
    /// Lan ngắn (dưới `split_min_ms` nên không phải dấu hiệu gộp, QĐ 25), rồi Minh nói nhiều trên cùng giọng.
    #[test]
    fn a_new_name_needs_twenty_percent_and_five_seconds_more() {
        let mut m = NameMatcher::default();
        let lan: &[(i64, i64)] = &[(0, 2_000), (3_000, 5_000)];
        let minh: &[(i64, i64)] = &[(10_000, 14_000), (15_000, 19_000), (20_000, 24_000)];
        for (i, &(s, e)) in lan.iter().chain(minh).enumerate() {
            m.segment(seg(i as u64, s, e, 1));
        }
        read(&mut m, 0, 7_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1).as_deref(), Some("Lan"));
        read(&mut m, 7_000, 21_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        // Lan 3,75 s, Minh 7,75 s: Minh 67% nhưng chỉ hơn 4 s; Lan 33% < 50%: bỏ tên, chưa đổi.
        assert_eq!(name_of(&m, 1), None);
        read(&mut m, 21_000, 26_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(
            name_of(&m, 1).as_deref(),
            Some("Minh"),
            "Minh 11,6 s, hơn 7,9 s và gấp ba"
        );
    }

    /// Tín hiệu 3 (spec §6.4): chỉ khi đúng một người ở xa mở mic, chỉ phần máy có tiếng, chỉ khi lượt đọc nhận ra đúng một ô của
    /// chính người dùng (QĐ 24), và tên phải có ≥ [`MIN_INDICATOR_MS`] bằng chứng chỉ báo trên giọng đó (người không có ô không mượn
    /// được tên của người duy nhất đang mở mic, rà soát A-Q5).
    #[test]
    fn the_mic_signal_needs_one_open_mic_machine_speech_the_user_tile_and_some_indicator() {
        let mut speech = Spans::default();
        speech.add(0, 4_000);
        speech.add(10_000, 14_000);
        // `open`: ai mở mic; `me`: có ô của chính người dùng; `frame`: Lan có khung "đang nói" ở 1,5 s đầu.
        let run = |open: &[&str], me: bool, frame: bool| {
            let mut m = NameMatcher::default();
            m.segment(seg(0, 0, 4_000, 1));
            m.segment(seg(1, 10_000, 14_000, 1));
            let mut t = 0;
            while t < 16_000 {
                let mut now: Vec<ParticipantNow> = ["Lan", "Minh"]
                    .iter()
                    .map(|n| {
                        let talking = frame && *n == "Lan" && (900..2_400).contains(&t);
                        ParticipantNow {
                            muted: Some(!open.contains(n)),
                            ..person(n, talking)
                        }
                    })
                    .collect();
                if me {
                    now.push(ParticipantNow {
                        is_self: true,
                        muted: Some(true),
                        ..person("Hoa Phạm", false)
                    });
                }
                m.observe(t, 250, 900, &now);
                t += 250;
            }
            m.settle(900, &speech, &ROOMLESS);
            m.names().get(&1).map(|n| (n.name.clone(), n.source))
        };
        assert_eq!(run(&["Lan"], true, true), Some(("Lan".into(), NameSource::Mic)));
        assert_eq!(run(&["Lan", "Minh"], true, true), None, "hai người mở mic");
        assert_eq!(
            run(&["Lan"], false, true),
            None,
            "chưa nhận ra ô của người dùng: không dùng mic"
        );
        assert_eq!(
            run(&["Lan"], true, false),
            None,
            "chỉ có mic, không lần nào có khung: có thể là người không có ô"
        );
    }

    #[test]
    fn worker_merges_and_relabels_move_the_evidence() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 2));
        read(&mut m, 0, 16_000, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!((name_of(&m, 1), name_of(&m, 2)), (None, None), "mỗi giọng một đoạn");
        m.merged(2, 1);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1).as_deref(), Some("Lan"));
        m.relabel(1, 3);
        m.settle(900, &Spans::default(), &ROOMLESS);
        // Giọng 1 giữ tên (Lan vẫn 100% thời gian trùng của nó, QĐ 9); giọng 3 mới có một đoạn: chưa đủ.
        assert_eq!((name_of(&m, 1).as_deref(), name_of(&m, 3)), (Some("Lan"), None));
    }

    #[test]
    fn the_same_timeline_gives_the_same_names() {
        let run = || {
            let mut m = NameMatcher::default();
            m.segment(seg(0, 0, 4_000, 1));
            m.segment(seg(1, 10_000, 14_000, 1));
            read(&mut m, 0, 16_000, 900, &[("Lan", LAN), ("Minh", &[(4_000, 6_000)])]);
            m.settle(900, &Spans::default(), &ROOMLESS);
            m.names()
        };
        assert_eq!(run(), run());
    }
}
