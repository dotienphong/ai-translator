//! Gom trạng thái bộ đọc tên thành báo cáo tình trạng `speaker_health` (spec 2026-10-26-phan-biet-nguoi-noi §7.2).
//!
//! - [`Tracker`] nhận từng `ReaderState` của worker (đổi mới gửi) và cộng thời gian theo (ngày UTC, app họp, phiên bản app họp,
//!   trạng thái) vào [`Ledger`]; sổ này lưu trên máy (JSON) để báo cáo của một ngày gửi được sau khi ngày đó qua, kể cả khi app đã
//!   thoát. Mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản app họp): [`Tracker::due`] chỉ trả ngày đã qua và chưa gửi.
//! - [`report_json`] dựng thân báo cáo gửi tới `POST /v1/diagnostics` (`kind = "speaker_health"`). **Không có tên người, không có
//!   chữ**: mọi chuỗi đi qua danh sách cho phép (phiên bản, mã hệ điều hành, vai trò và lớp của chỉ báo tự học); chuỗi không hợp lệ
//!   là lỗi và không có báo cáo (đóng cửa khi nghi ngờ). App còn chạy bộ che và bộ kiểm cuối của báo cáo lỗi trên cả chuỗi JSON.
//!
//! Tính phút: `minutes.total` là thời gian bộ đọc có app họp và không nghỉ (`Ok`, `NoNames`, `NoSpeaking`, `NoPermission`,
//! `Blocked`); `minutes.ok` chỉ tính `Ok` (có tên và có chỉ báo "đang nói"). `Off`, `NoMeeting`, `Paused` không tính.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use speaker_protocol::{
    LearnedPattern, MAX_LEARNED_PATTERNS, MAX_PATTERN_CLASSES, MAX_PATTERN_PATH, MAX_PATTERN_STATES,
    MAX_PATTERN_TOKEN_BYTES, MeetingApp, PatternState, ReaderStatus,
};

/// Báo cáo chỉ gửi cho mục có ít nhất chừng này thời gian đọc (tránh nhiễu từ lần mở app họp vài giây).
pub const MIN_REPORT_MS: u64 = 60_000;
/// Một khoảng giữa hai `ReaderState` tính tối đa chừng này (máy ngủ giữa phiên không làm phút phình ra).
pub const MAX_INTERVAL_MS: u64 = 3 * 3_600_000;
/// Sổ giữ chừng này ngày gần nhất.
pub const KEEP_DAYS: i64 = 7;
pub const DAY_MS: u64 = 86_400_000;
/// Thân báo cáo tối đa chừng này byte.
pub const MAX_REPORT_BYTES: usize = 4096;

/// Tình trạng của bộ đọc trong một khoảng thời gian (spec §7.2). Thứ tự khai báo là thứ tự nặng dần (dùng khi hai trạng thái bằng
/// thời gian).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Health {
    Ok,
    NoPermission,
    NoSpeaking,
    NoNames,
    Blocked,
}

impl Health {
    pub fn as_str(self) -> &'static str {
        match self {
            Health::Ok => "ok",
            Health::NoPermission => "no_permission",
            Health::NoSpeaking => "no_speaking",
            Health::NoNames => "no_names",
            Health::Blocked => "blocked",
        }
    }

    /// Trạng thái bộ đọc của worker thành tình trạng; `None` với `Off`, `NoMeeting`, `Paused` (không tính thời gian).
    pub fn of(state: ReaderStatus) -> Option<Self> {
        match state {
            ReaderStatus::Ok => Some(Health::Ok),
            ReaderStatus::NoNames => Some(Health::NoNames),
            ReaderStatus::NoSpeaking => Some(Health::NoSpeaking),
            ReaderStatus::NoPermission => Some(Health::NoPermission),
            ReaderStatus::Blocked => Some(Health::Blocked),
            ReaderStatus::Off | ReaderStatus::NoMeeting | ReaderStatus::Paused => None,
        }
    }

    /// Hỏng do công thức hay app họp đổi (khác `NoPermission`, là việc của người dùng): tính vào ngưỡng cảnh báo của server.
    pub fn broken(self) -> bool {
        matches!(self, Health::NoNames | Health::NoSpeaking | Health::Blocked)
    }
}

/// Thời gian của một cặp (app họp, phiên bản app họp) trong một ngày.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    pub app: MeetingApp,
    pub app_version: Option<String>,
    /// Mili giây theo tình trạng.
    pub ms: BTreeMap<Health, u64>,
    /// Số phiên bản công thức lớn nhất đã thấy trong ngày.
    pub recipe_version: u32,
    /// Số chỉ báo tự học lớn nhất đã thấy trong ngày.
    pub learned: u32,
    /// Mô tả chỉ báo tự học (không trùng nhau, tối đa `MAX_LEARNED_PATTERNS`).
    pub patterns: Vec<LearnedPattern>,
}

impl Entry {
    pub fn new(app: MeetingApp, app_version: Option<String>) -> Self {
        Self {
            app,
            app_version,
            ms: BTreeMap::new(),
            recipe_version: 0,
            learned: 0,
            patterns: Vec::new(),
        }
    }

    pub fn total_ms(&self) -> u64 {
        self.ms.values().sum()
    }

    pub fn ok_ms(&self) -> u64 {
        self.ms.get(&Health::Ok).copied().unwrap_or(0)
    }

    /// Tình trạng chiếm nhiều thời gian nhất; bằng nhau thì tình trạng nặng hơn.
    pub fn dominant(&self) -> Option<Health> {
        self.ms
            .iter()
            .filter(|(_, ms)| **ms > 0)
            .max_by_key(|(h, ms)| (**ms, **h))
            .map(|(h, _)| *h)
    }
}

fn app_str(app: MeetingApp) -> &'static str {
    match app {
        MeetingApp::Teams => "teams",
        MeetingApp::Zoom => "zoom",
        MeetingApp::MeetChrome => "meet_chrome",
        MeetingApp::MeetEdge => "meet_edge",
    }
}

/// Khóa của cặp (app họp, phiên bản app họp) trong sổ.
pub fn entry_key(app: MeetingApp, version: Option<&str>) -> String {
    format!("{}|{}", app_str(app), version.unwrap_or("?"))
}

/// Sổ trên máy: ngày UTC (số ngày từ 1970-01-01) → khóa → mục; kèm các (ngày, khóa) đã gửi.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Ledger {
    #[serde(default)]
    pub days: BTreeMap<i64, BTreeMap<String, Entry>>,
    #[serde(default)]
    pub sent: BTreeSet<String>,
}

/// Một `ReaderState` của worker (không có tên người).
#[derive(Clone, Debug, PartialEq)]
pub struct Reading {
    pub app: Option<MeetingApp>,
    pub app_version: Option<String>,
    pub state: ReaderStatus,
    pub recipe_version: u32,
    pub learned: u32,
    pub patterns: Vec<LearnedPattern>,
}

struct Open {
    since_ms: u64,
    app: MeetingApp,
    app_version: Option<String>,
    health: Health,
    recipe_version: u32,
    learned: u32,
    patterns: Vec<LearnedPattern>,
}

/// Một mục đến hạn gửi.
#[derive(Clone, Debug, PartialEq)]
pub struct Due {
    pub day: i64,
    pub key: String,
    pub entry: Entry,
}

pub struct Tracker {
    ledger: Ledger,
    open: Option<Open>,
    dirty: bool,
}

impl Tracker {
    pub fn new(ledger: Ledger) -> Self {
        Self {
            ledger,
            open: None,
            dirty: false,
        }
    }

    pub fn ledger(&self) -> &Ledger {
        &self.ledger
    }

    /// Sổ có đổi từ lần gọi trước không (để ghi xuống đĩa); đặt lại cờ.
    pub fn take_dirty(&mut self) -> bool {
        std::mem::take(&mut self.dirty)
    }

    /// Một `ReaderState` tới lúc `at_ms` (giờ Unix, ms): đóng khoảng đang mở rồi mở khoảng mới nếu trạng thái có tính thời gian.
    pub fn observe(&mut self, at_ms: u64, reading: Reading) {
        self.close(at_ms);
        let (Some(app), Some(health)) = (reading.app, Health::of(reading.state)) else {
            return;
        };
        self.open = Some(Open {
            since_ms: at_ms,
            app,
            app_version: reading.app_version,
            health,
            recipe_version: reading.recipe_version,
            learned: reading.learned,
            patterns: reading.patterns,
        });
    }

    /// Phiên dừng hay worker thoát: đóng khoảng đang mở.
    pub fn close(&mut self, at_ms: u64) {
        let Some(open) = self.open.take() else {
            return;
        };
        let dur = at_ms.saturating_sub(open.since_ms).min(MAX_INTERVAL_MS);
        let day = i64::try_from(at_ms / DAY_MS).unwrap_or(i64::MAX);
        let key = entry_key(open.app, open.app_version.as_deref());
        let entry = self
            .ledger
            .days
            .entry(day)
            .or_default()
            .entry(key)
            .or_insert_with(|| Entry::new(open.app, open.app_version.clone()));
        *entry.ms.entry(open.health).or_insert(0) += dur;
        entry.recipe_version = entry.recipe_version.max(open.recipe_version);
        entry.learned = entry.learned.max(open.learned);
        for p in open.patterns {
            if entry.patterns.len() < MAX_LEARNED_PATTERNS && !entry.patterns.contains(&p) {
                entry.patterns.push(p);
            }
        }
        self.dirty = true;
    }

    /// Các mục của ngày đã qua (`day < today`) chưa gửi và đủ [`MIN_REPORT_MS`], cũ nhất trước.
    pub fn due(&self, today: i64) -> Vec<Due> {
        let mut out = Vec::new();
        for (day, entries) in self.ledger.days.range(..today) {
            for (key, entry) in entries {
                if entry.total_ms() >= MIN_REPORT_MS && !self.ledger.sent.contains(&format!("{day}|{key}")) {
                    out.push(Due {
                        day: *day,
                        key: key.clone(),
                        entry: entry.clone(),
                    });
                }
            }
        }
        out
    }

    /// Đã gửi (hay bỏ hẳn) mục này: không gửi lại.
    pub fn mark_sent(&mut self, day: i64, key: &str) {
        if self.ledger.sent.insert(format!("{day}|{key}")) {
            self.dirty = true;
        }
    }

    /// Bỏ ngày cũ hơn [`KEEP_DAYS`] (kể cả dấu đã gửi của ngày đó).
    pub fn prune(&mut self, today: i64) {
        let cutoff = today - KEEP_DAYS;
        let before = (self.ledger.days.len(), self.ledger.sent.len());
        self.ledger.days.retain(|d, _| *d >= cutoff);
        self.ledger.sent.retain(|s| {
            s.split('|')
                .next()
                .and_then(|d| d.parse::<i64>().ok())
                .is_some_and(|d| d >= cutoff)
        });
        if before != (self.ledger.days.len(), self.ledger.sent.len()) {
            self.dirty = true;
        }
    }

    /// Người dùng tắt "Gửi báo cáo lỗi": bỏ cả sổ và khoảng đang mở.
    pub fn clear(&mut self) {
        self.ledger = Ledger::default();
        self.open = None;
        self.dirty = true;
    }
}

/// Thông tin app và máy trong báo cáo (không có gói, ngôn ngữ, phần cứng).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Facts {
    pub app_version: String,
    /// `release` hay `debug`.
    pub build: &'static str,
    pub os_name: String,
    pub os_version: String,
    pub arch: String,
    pub device_id_hash: String,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum BuildError {
    #[error("trường không hợp lệ: {0}")]
    Invalid(&'static str),
}

/// Chuỗi chỉ gồm chữ, số, `.`, `_`, `+`, `-` và khoảng trắng, dài 1–`max` ký tự: phiên bản và tên hệ điều hành.
fn plain(text: &str, max: usize) -> bool {
    !text.is_empty()
        && text.len() <= max
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-' | ' '))
}

fn hash64(text: &str) -> bool {
    text.len() == 64 && text.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

/// Một lớp hay vai trò dùng được trong báo cáo: 1–32 byte của `[A-Za-z0-9_-]`, không có dãy từ 5 chữ số liền nhau (loại mã số
/// hay id kiểu `roster-avatar-img-12345678`).
fn token_ok(text: &str) -> bool {
    let mut run = 0;
    for c in text.chars() {
        if c.is_ascii_digit() {
            run += 1;
            if run >= 5 {
                return false;
            }
        } else {
            run = 0;
        }
    }
    !text.is_empty()
        && text.len() <= MAX_PATTERN_TOKEN_BYTES
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
}

/// Lọc mô tả chỉ báo tự học: bỏ lớp, vai trò không qua danh sách cho phép; mẫu không còn vai trò hợp lệ thì bỏ cả mẫu.
pub fn sanitize_patterns(list: &[LearnedPattern]) -> Vec<LearnedPattern> {
    list.iter()
        .filter(|p| p.role.chars().all(|c| c.is_ascii_alphabetic()) && token_ok(&p.role))
        .take(MAX_LEARNED_PATTERNS)
        .map(|p| LearnedPattern {
            role: p.role.clone(),
            path: p.path.iter().copied().take(MAX_PATTERN_PATH).collect(),
            states: p
                .states
                .iter()
                .take(MAX_PATTERN_STATES)
                .map(|s| PatternState {
                    subrole: if token_ok(&s.subrole) {
                        s.subrole.clone()
                    } else {
                        String::new()
                    },
                    classes: s
                        .classes
                        .iter()
                        .filter(|c| token_ok(c))
                        .take(MAX_PATTERN_CLASSES)
                        .cloned()
                        .collect(),
                })
                .collect(),
        })
        .collect()
}

/// Ngày dương lịch (năm, tháng, ngày) của số ngày từ 1970-01-01 (thuật toán `civil_from_days` của Howard Hinnant).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y, m, d)
}

/// `YYYY-MM-DD` của ngày UTC thứ `day` từ 1970-01-01.
pub fn day_string(day: i64) -> String {
    let (y, m, d) = civil_from_days(day);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Số ngày UTC từ 1970-01-01 của một thời điểm Unix tính bằng giây.
pub fn day_of_unix_secs(secs: i64) -> i64 {
    secs.div_euclid(86_400)
}

fn minutes(ms: u64) -> u64 {
    (ms + 30_000) / 60_000
}

/// Thân báo cáo `speaker_health` của một mục (spec §7.2). Lỗi nếu bất kỳ chuỗi nào ngoài danh sách cho phép: không có báo cáo.
pub fn report_json(facts: &Facts, day: i64, entry: &Entry, canary: bool) -> Result<String, BuildError> {
    let bad = BuildError::Invalid;
    if !plain(&facts.app_version, 40) {
        return Err(bad("app.version"));
    }
    if facts.build != "release" && facts.build != "debug" {
        return Err(bad("build"));
    }
    if !plain(&facts.os_name, 32) || !plain(&facts.os_version, 64) || !plain(&facts.arch, 16) {
        return Err(bad("os"));
    }
    if !hash64(&facts.device_id_hash) {
        return Err(bad("device_id_hash"));
    }
    if let Some(v) = &entry.app_version
        && !plain(v, 40)
    {
        return Err(bad("meeting.version"));
    }
    let state = entry.dominant().ok_or(bad("state"))?;
    let total = minutes(entry.total_ms());
    let ok = minutes(entry.ok_ms()).min(total);
    let patterns = sanitize_patterns(&entry.patterns);
    let json = serde_json::json!({
        "v": 1,
        "kind": "speaker_health",
        "day": day_string(day),
        "canary": canary,
        "build": facts.build,
        "app": { "version": facts.app_version },
        "os": { "name": facts.os_name, "version": facts.os_version, "arch": facts.arch },
        "meeting": { "app": app_str(entry.app), "version": entry.app_version },
        "recipe_version": entry.recipe_version,
        "state": state.as_str(),
        "minutes": { "ok": ok, "total": total },
        "learned": entry.learned,
        "patterns": patterns,
        "device_id_hash": facts.device_id_hash,
    })
    .to_string();
    if json.len() > MAX_REPORT_BYTES {
        return Err(bad("quá lớn"));
    }
    Ok(json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const T0: u64 = 20_752 * DAY_MS + 10 * 3_600_000; // 2026-10-26 10:00 UTC
    const MIN: u64 = 60_000;

    fn reading(app: Option<MeetingApp>, state: ReaderStatus) -> Reading {
        Reading {
            app,
            app_version: Some("26032.1100".into()),
            state,
            recipe_version: 2,
            learned: 0,
            patterns: vec![],
        }
    }

    fn facts() -> Facts {
        Facts {
            app_version: "0.3.2".into(),
            build: "release",
            os_name: "macos".into(),
            os_version: "15.6.1".into(),
            arch: "aarch64".into(),
            device_id_hash: "a".repeat(64),
        }
    }

    fn pattern() -> LearnedPattern {
        LearnedPattern {
            role: "AXGroup".into(),
            path: vec![2, 0],
            states: vec![
                PatternState {
                    subrole: String::new(),
                    classes: vec!["vdi-frame-occlusion".into()],
                },
                PatternState {
                    subrole: String::new(),
                    classes: vec![],
                },
            ],
        }
    }

    #[test]
    fn time_is_added_by_state_and_only_for_states_that_count() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::NoMeeting));
        t.observe(T0 + 5 * MIN, reading(Some(MeetingApp::Teams), ReaderStatus::NoNames));
        t.observe(T0 + 8 * MIN, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.observe(T0 + 18 * MIN, reading(None, ReaderStatus::Paused));
        t.observe(
            T0 + 20 * MIN,
            reading(Some(MeetingApp::Teams), ReaderStatus::NoSpeaking),
        );
        t.close(T0 + 21 * MIN);
        let day = (T0 / DAY_MS) as i64;
        let e = &t.ledger().days[&day]["teams|26032.1100"];
        assert_eq!(e.ms[&Health::NoNames], 3 * MIN);
        assert_eq!(e.ms[&Health::Ok], 10 * MIN);
        assert_eq!(e.ms[&Health::NoSpeaking], MIN);
        assert_eq!(e.total_ms(), 14 * MIN, "NoMeeting và Paused không tính");
        assert_eq!(e.ok_ms(), 10 * MIN);
        assert_eq!(e.dominant(), Some(Health::Ok));
        assert_eq!(e.recipe_version, 2);
    }

    #[test]
    fn a_long_gap_is_capped_and_a_clock_going_back_adds_nothing() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Zoom), ReaderStatus::Ok));
        t.close(T0 + 10 * 3_600_000);
        let day = (T0 / DAY_MS) as i64;
        assert_eq!(t.ledger().days[&day]["zoom|26032.1100"].total_ms(), MAX_INTERVAL_MS);
        t.observe(T0, reading(Some(MeetingApp::Zoom), ReaderStatus::Ok));
        t.close(T0 - MIN);
        assert_eq!(t.ledger().days[&day]["zoom|26032.1100"].total_ms(), MAX_INTERVAL_MS);
    }

    #[test]
    fn ties_go_to_the_worse_state() {
        let mut e = Entry::new(MeetingApp::Teams, None);
        e.ms.insert(Health::Ok, 5 * MIN);
        e.ms.insert(Health::NoNames, 5 * MIN);
        assert_eq!(e.dominant(), Some(Health::NoNames));
        e.ms.insert(Health::Blocked, 5 * MIN);
        assert_eq!(e.dominant(), Some(Health::Blocked));
        assert_eq!(Entry::new(MeetingApp::Teams, None).dominant(), None);
    }

    #[test]
    fn broken_means_the_recipe_or_the_app_changed_not_the_user() {
        let broken: Vec<_> = [
            Health::Ok,
            Health::NoPermission,
            Health::NoSpeaking,
            Health::NoNames,
            Health::Blocked,
        ]
        .into_iter()
        .filter(|h| h.broken())
        .collect();
        assert_eq!(broken, [Health::NoSpeaking, Health::NoNames, Health::Blocked]);
    }

    /// Mỗi ngày một báo cáo cho mỗi cặp (app họp, phiên bản): chỉ ngày đã qua, chưa gửi, đủ một phút.
    #[test]
    fn only_finished_days_unsent_and_long_enough_are_due() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.observe(T0 + 30 * MIN, reading(Some(MeetingApp::Zoom), ReaderStatus::NoNames));
        t.observe(
            T0 + 30 * MIN + 30_000,
            reading(Some(MeetingApp::MeetChrome), ReaderStatus::Ok),
        );
        t.close(T0 + 40 * MIN);
        let day = (T0 / DAY_MS) as i64;
        assert!(t.due(day).is_empty(), "ngày hôm nay chưa gửi");
        let due = t.due(day + 1);
        assert_eq!(due.len(), 2, "Zoom chỉ 30 giây: dưới một phút");
        assert_eq!(due[0].key, "meet_chrome|26032.1100");
        assert_eq!(due[1].key, "teams|26032.1100");
        t.mark_sent(day, "teams|26032.1100");
        assert_eq!(t.due(day + 1).len(), 1);
        t.mark_sent(day, "teams|26032.1100");
        assert!(t.take_dirty());
        assert!(!t.take_dirty());
    }

    #[test]
    fn old_days_are_pruned_with_their_sent_marks() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.close(T0 + 5 * MIN);
        let day = (T0 / DAY_MS) as i64;
        t.mark_sent(day, "teams|26032.1100");
        t.prune(day + KEEP_DAYS);
        assert_eq!(t.ledger().days.len(), 1);
        t.prune(day + KEEP_DAYS + 1);
        assert!(t.ledger().days.is_empty() && t.ledger().sent.is_empty());
    }

    #[test]
    fn the_ledger_survives_json_and_garbage_is_not_trusted() {
        let mut t = Tracker::new(Ledger::default());
        let mut r = reading(Some(MeetingApp::Teams), ReaderStatus::Ok);
        r.patterns = vec![pattern()];
        r.learned = 1;
        t.observe(T0, r);
        t.close(T0 + 5 * MIN);
        let json = serde_json::to_string(t.ledger()).unwrap();
        let back: Ledger = serde_json::from_str(&json).unwrap();
        assert_eq!(&back, t.ledger());
        assert!(serde_json::from_str::<Ledger>("{\"days\":{\"x\":1}}").is_err());
        assert_eq!(serde_json::from_str::<Ledger>("{}").unwrap(), Ledger::default());
    }

    #[test]
    fn clearing_forgets_everything() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.close(T0 + 5 * MIN);
        t.clear();
        assert_eq!(t.ledger(), &Ledger::default());
        t.close(T0 + 6 * MIN);
        assert_eq!(t.ledger(), &Ledger::default(), "khoảng đang mở cũng đã bỏ");
    }

    #[test]
    fn days_are_written_as_utc_dates() {
        assert_eq!(day_string(0), "1970-01-01");
        assert_eq!(day_string(20_753), "2026-10-27");
        assert_eq!(day_string(19_782), "2024-02-29");
        assert_eq!(day_string(-1), "1969-12-31");
        assert_eq!(day_of_unix_secs(1_793_059_200), 20_753);
        assert_eq!(day_of_unix_secs(1_793_059_199), 20_752);
    }

    fn entry() -> Entry {
        let mut e = Entry::new(MeetingApp::Teams, Some("26032.1100".into()));
        e.ms.insert(Health::Ok, 9 * MIN + 40_000);
        e.ms.insert(Health::NoNames, 2 * MIN);
        e.recipe_version = 2;
        e.learned = 1;
        e.patterns = vec![pattern()];
        e
    }

    #[test]
    fn the_report_has_exactly_the_agreed_fields() {
        let json = report_json(&facts(), 20_752, &entry(), false).unwrap();
        let v: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["kind"], "speaker_health");
        assert_eq!(v["day"], "2026-10-26");
        assert_eq!(v["canary"], false);
        assert_eq!(
            v["meeting"],
            serde_json::json!({"app": "teams", "version": "26032.1100"})
        );
        assert_eq!(v["state"], "ok");
        assert_eq!(v["minutes"], serde_json::json!({"ok": 10, "total": 12}));
        assert_eq!(v["recipe_version"], 2);
        assert_eq!(v["learned"], 1);
        assert_eq!(v["patterns"][0]["role"], "AXGroup");
        assert_eq!(v["patterns"][0]["path"], serde_json::json!([2, 0]));
        let mut keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "app",
                "build",
                "canary",
                "day",
                "device_id_hash",
                "kind",
                "learned",
                "meeting",
                "minutes",
                "os",
                "patterns",
                "recipe_version",
                "state",
                "v"
            ]
        );
        assert!(json.len() < MAX_REPORT_BYTES);
    }

    /// Báo cáo không bao giờ có chữ tự do: tên người, đường dẫn, email trong bất kỳ trường nào làm hỏng cả báo cáo.
    #[test]
    fn a_free_text_field_fails_the_whole_report() {
        let e = entry();
        let fail = |f: &Facts, e: &Entry| report_json(f, 20_752, e, false).unwrap_err();
        let mut f = facts();
        f.os_version = "15.6 /usr/local".into();
        assert_eq!(fail(&f, &e), BuildError::Invalid("os"));
        let mut f = facts();
        f.app_version = "Lan Nguyễn".into();
        assert_eq!(fail(&f, &e), BuildError::Invalid("app.version"));
        let mut f = facts();
        f.device_id_hash = "A".repeat(64);
        assert_eq!(fail(&f, &e), BuildError::Invalid("device_id_hash"));
        f.device_id_hash = "a@b.c".into();
        assert_eq!(fail(&f, &e), BuildError::Invalid("device_id_hash"));
        let mut e2 = entry();
        e2.app_version = Some("lan@example.com".into());
        assert_eq!(fail(&facts(), &e2), BuildError::Invalid("meeting.version"));
        let mut f = facts();
        f.build = "staging";
        assert_eq!(fail(&f, &e), BuildError::Invalid("build"));
        assert_eq!(
            fail(&facts(), &Entry::new(MeetingApp::Teams, None)),
            BuildError::Invalid("state"),
            "không có thời gian nào thì không có báo cáo"
        );
    }

    #[test]
    fn learned_patterns_keep_only_safe_tokens() {
        let mut p = pattern();
        p.states[0].classes = vec![
            "vdi-frame-occlusion".into(),
            "Lan Nguyễn".into(),
            "roster-avatar-img-12345678".into(),
            "a".repeat(MAX_PATTERN_TOKEN_BYTES + 1),
            "oZRSLe".into(),
            "lan@x.vn".into(),
        ];
        p.states[0].subrole = "Nguyễn".into();
        let bad_role = LearnedPattern {
            role: "AX Group".into(),
            ..pattern()
        };
        let digits_role = LearnedPattern {
            role: "AXGroup2".into(),
            ..pattern()
        };
        let clean = sanitize_patterns(&[p, bad_role, digits_role]);
        assert_eq!(clean.len(), 1, "vai trò có khoảng trắng hay chữ số bị bỏ cả mẫu");
        assert_eq!(clean[0].states[0].classes, ["vdi-frame-occlusion", "oZRSLe"]);
        assert_eq!(clean[0].states[0].subrole, "");
        assert!(speaker_protocol::patterns_fit(&clean));
    }

    #[test]
    fn a_tracker_never_keeps_more_than_four_patterns() {
        let mut t = Tracker::new(Ledger::default());
        for i in 0..6u16 {
            let mut r = reading(Some(MeetingApp::Teams), ReaderStatus::Ok);
            r.patterns = vec![LearnedPattern {
                role: "AXGroup".into(),
                path: vec![i],
                states: vec![],
            }];
            t.observe(T0 + u64::from(i) * MIN, r);
        }
        t.close(T0 + 7 * MIN);
        let day = (T0 / DAY_MS) as i64;
        assert_eq!(
            t.ledger().days[&day]["teams|26032.1100"].patterns.len(),
            MAX_LEARNED_PATTERNS
        );
    }

    /// Khóa chặn: dù mô tả chỉ báo, phiên bản hay mã máy mang tên người, thân báo cáo không bao giờ có tên đó.
    #[test]
    fn a_name_never_reaches_the_report_body() {
        let name = "Lan Nguyễn";
        let mut e = entry();
        e.patterns[0].states[0].classes = vec!["vdi-frame-occlusion".into(), name.into(), "lan.nguyen@x.vn".into()];
        e.patterns[0].states[0].subrole = name.into();
        e.patterns.push(LearnedPattern {
            role: name.into(),
            ..pattern()
        });
        let json = report_json(&facts(), 20_752, &e, false).unwrap();
        for needle in ["Lan", "Nguy", "lan.nguyen", "@"] {
            assert!(!json.contains(needle), "{needle} lọt vào báo cáo: {json}");
        }
        assert!(json.contains("vdi-frame-occlusion"), "lớp hợp lệ vẫn còn");
    }

    #[test]
    fn the_canary_flag_is_carried() {
        let json = report_json(&facts(), 20_752, &entry(), true).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&json).unwrap()["canary"], true);
    }
}
