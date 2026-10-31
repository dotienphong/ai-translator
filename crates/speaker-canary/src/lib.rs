//! Phần thuần của kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06): đọc lịch nói, biến các lượt đọc của bộ
//! đọc thành "ai đang được báo đang nói", chấm, dựng báo cáo `speaker_health` có `canary = true`, gửi. Phần chạm hệ điều hành (đọc cây
//! Accessibility, UI Automation) nằm ở `main.rs`.
//!
//! Tên trong lịch (`who`) là tên hiển thị của các tài khoản thử trong cuộc họp thử; chỉ nằm trong file lịch cục bộ và trong bộ nhớ, **không
//! bao giờ** vào kết quả, báo cáo hay log. Mỗi lượt đọc đi qua đúng `SpeakingTracker` mà worker dùng, nên kiểm tra phát hiện đúng thứ làm
//! hỏng tên thật: công thức không còn khớp giao diện.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use speaker_ops::canary::{self, CanaryError, Frame, Params, Run, Turn, Verdict};
use speaker_ops::health::{self, Facts};
use speaker_protocol::{MeetingApp, ReaderStatus};
use speaker_recipe::{Os, Recipes};
use speaker_worker::names::track::SpeakingTracker;
use speaker_worker::reader::{Pass, Sample};

pub const DEFAULT_API: &str = "https://api.aitranslator.vn";

/// Lịch nói do bộ điều khiển (tools/speaker-canary) ghi: giây tính từ mốc `t0` (giờ Unix, ms) mà bộ điều khiển cho `run`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Schedule {
    pub app: MeetingApp,
    pub turns: Vec<ScheduledTurn>,
}

#[derive(Clone, Deserialize, Serialize, PartialEq)]
pub struct ScheduledTurn {
    pub who: String,
    pub start_s: f64,
    pub end_s: f64,
}

// Tên khách không vào log, kể cả qua `{:?}`.
impl std::fmt::Debug for ScheduledTurn {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ScheduledTurn({} → {} s)", self.start_s, self.end_s)
    }
}

impl Schedule {
    /// Lượt nói tuyệt đối (giờ Unix, ms) từ mốc `t0_unix_ms`.
    pub fn turns(&self, t0_unix_ms: i64) -> Vec<Turn> {
        let at = |s: f64| t0_unix_ms + (s * 1000.0).round() as i64;
        self.turns
            .iter()
            .map(|t| Turn {
                who: t.who.clone(),
                start_ms: at(t.start_s),
                end_ms: at(t.end_s),
            })
            .collect()
    }
}

/// Gom các lượt đọc của bộ đọc thành `Frame` (ai đang được báo "đang nói") và đếm tóm tắt cho `canary::judge`.
pub struct Collector {
    app: MeetingApp,
    tracker: SpeakingTracker,
    delay_ms: i64,
    turns: Vec<Turn>,
    frames: Vec<Frame>,
    run: Run,
    app_version: Option<String>,
    recipe_version: u32,
}

impl Collector {
    /// `None` nếu công thức không có mục cho `app` trên hệ điều hành này (không có gì để kiểm).
    pub fn new(recipes: &Recipes, os: Os, app: MeetingApp, turns: Vec<Turn>) -> Option<Self> {
        let recipe = recipes.app(os, app)?;
        Some(Self {
            app,
            tracker: SpeakingTracker::new(recipe.speaking.iter().map(|s| s.kind).collect()),
            delay_ms: i64::from(recipe.delay_ms),
            turns,
            frames: Vec::new(),
            run: Run {
                passes_with_tiles: 0,
                passes_blocked: 0,
                passes: 0,
            },
            app_version: None,
            recipe_version: recipes.version,
        })
    }

    /// Máy "im" theo lịch: không lượt nói nào trong [`at` − trễ − 1 s, `at`] (như `quiet_at` của worker, nhưng theo lịch đã biết).
    fn quiet(&self, at_ms: i64) -> bool {
        let from = at_ms - self.delay_ms - 1_000;
        !self.turns.iter().any(|t| t.start_ms < at_ms + 1 && t.end_ms > from)
    }

    /// Một lượt đọc của bộ đọc.
    pub fn push(&mut self, s: &Sample) {
        if s.status == ReaderStatus::Off
            || s.pass == Pass::Idle && s.app.is_none() && s.status != ReaderStatus::NoMeeting
        {
            return;
        }
        self.run.passes += 1;
        if s.status == ReaderStatus::Blocked {
            self.run.passes_blocked += 1;
        }
        if s.status != ReaderStatus::Ok || s.app != Some(self.app) {
            return;
        }
        if self.app_version.is_none() {
            self.app_version = s.app_version.clone();
        }
        if s.tiles.iter().any(|t| !t.is_self) {
            self.run.passes_with_tiles += 1;
        }
        let at = i64::try_from(s.at_unix_ms).unwrap_or(i64::MAX);
        let quiet = self.quiet(at);
        let now = self.tracker.push(at, &s.tiles, &BTreeMap::new(), quiet);
        self.frames.push(Frame {
            at_ms: at,
            speaking: now
                .iter()
                .filter(|p| p.speaking > 0.0 && !p.is_self)
                .map(|p| p.name.clone())
                .collect(),
        });
    }

    /// Chấm cả lượt chạy.
    pub fn finish(self, params: &Params) -> Result<Outcome, CanaryError> {
        let verdict = canary::judge(&self.turns, &self.frames, self.run, params)?;
        Ok(Outcome {
            verdict,
            app: self.app,
            app_version: self.app_version,
            recipe_version: self.recipe_version,
            frames: self.frames.len(),
            passes: self.run.passes,
        })
    }
}

/// Kết quả một lượt kiểm tra (không có tên người).
#[derive(Clone, Debug, PartialEq)]
pub struct Outcome {
    pub verdict: Verdict,
    pub app: MeetingApp,
    pub app_version: Option<String>,
    pub recipe_version: u32,
    pub frames: usize,
    pub passes: u32,
}

/// Thông tin máy của báo cáo kiểm tra tự động. `machine` là nhãn do người vận hành đặt cho máy chạy kiểm tra (không phải mã phần cứng):
/// `device_id_hash` là SHA-256 của `canary|<nhãn>`, nên không trùng và không lẫn với máy người dùng.
pub fn facts(app_version: &str, os_version: &str, machine: &str) -> Facts {
    Facts {
        app_version: app_version.to_string(),
        build: if cfg!(debug_assertions) { "debug" } else { "release" },
        os_name: std::env::consts::OS.to_string(),
        os_version: os_version.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        device_id_hash: Sha256::digest(format!("canary|{machine}").as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    }
}

/// Thân báo cáo `speaker_health` (`canary = true`) của một lượt kiểm tra: toàn bộ thời gian chạy tính theo tình trạng đã chấm.
pub fn report(outcome: &Outcome, facts: &Facts, now_secs: i64, duration_ms: u64) -> Result<String, health::BuildError> {
    let entry = canary::entry(
        &outcome.verdict,
        duration_ms,
        outcome.app,
        outcome.app_version.clone(),
        outcome.recipe_version,
    );
    health::report_json(facts, health::day_of_unix_secs(now_secs), &entry, true)
}

/// File kết quả cục bộ của một lượt (cho nhật ký của người vận hành): tình trạng, điểm, phiên bản; không có tên người.
pub fn result_json(outcome: &Outcome, duration_ms: u64) -> String {
    let s = outcome.verdict.score;
    serde_json::json!({
        "state": outcome.verdict.health.as_str(),
        "meeting_app": outcome.app,
        "meeting_version": outcome.app_version,
        "recipe_version": outcome.recipe_version,
        "turns": s.turns,
        "turns_ok": s.turns_ok,
        "judged": s.judged,
        "wrong": s.wrong,
        "frames": outcome.frames,
        "passes": outcome.passes,
        "duration_ms": duration_ms,
    })
    .to_string()
}

/// Nơi nhận báo cáo: trả mã HTTP, hay lỗi mạng (không kèm URL).
pub trait Poster {
    fn post(&self, body: &str) -> Result<u16, String>;
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum SendError {
    /// Server từ chối báo cáo (4xx khác 429): gửi lại cũng vậy.
    #[error("server từ chối báo cáo: HTTP {0}")]
    Rejected(u16),
    /// Mạng hay server lỗi tạm (5xx, 429): thử lại sau.
    #[error("chưa gửi được: {0}")]
    Retry(String),
}

/// Gửi một báo cáo đã dựng. 2xx là xong.
pub fn send(poster: &dyn Poster, body: &str) -> Result<(), SendError> {
    match poster.post(body) {
        Ok(200..=299) => Ok(()),
        Ok(429) => Err(SendError::Retry("HTTP 429".into())),
        Ok(status @ 500..=599) => Err(SendError::Retry(format!("HTTP {status}"))),
        Ok(status) => Err(SendError::Rejected(status)),
        Err(e) => Err(SendError::Retry(e)),
    }
}

/// `POST {base}/v1/diagnostics` bằng reqwest (không theo redirect, hạn chờ ngắn), như `HttpReportApi` của app.
pub struct HttpPoster {
    url: String,
    client: reqwest::blocking::Client,
}

impl HttpPoster {
    /// `base` phải là `https` (hay `http` tới 127.0.0.1 khi thử); không thì `None`.
    pub fn new(base: &str) -> Option<Self> {
        let base = base.trim_end_matches('/');
        let url = reqwest::Url::parse(base).ok()?;
        let ok = url.scheme() == "https"
            || (url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost")));
        let client = reqwest::blocking::Client::builder()
            .user_agent("AI-Translator-Canary")
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .ok()?;
        (ok && url.query().is_none()).then(|| Self {
            url: format!("{base}/v1/diagnostics"),
            client,
        })
    }
}

impl Poster for HttpPoster {
    fn post(&self, body: &str) -> Result<u16, String> {
        self.client
            .post(&self.url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.to_string())
            .send()
            .map(|r| r.status().as_u16())
            .map_err(|e| e.without_url().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    use speaker_ops::health::Health;
    use speaker_recipe::parse;
    use speaker_worker::reader::extract::TileSample;

    const T0: i64 = 1_793_059_200_000;

    fn recipes() -> Recipes {
        parse(speaker_recipe::BUILTIN_JSON).unwrap()
    }

    fn schedule() -> Schedule {
        let turn = |who: &str, a: f64, b: f64| ScheduledTurn {
            who: who.into(),
            start_s: a,
            end_s: b,
        };
        Schedule {
            app: MeetingApp::Teams,
            turns: vec![
                turn("Khach A", 0.0, 6.0),
                turn("Khach B", 8.0, 14.0),
                turn("Khach A", 16.0, 22.0),
                turn("Khach B", 24.0, 30.0),
            ],
        }
    }

    fn tile(name: &str, is_self: bool, speaking: bool, slot: u32) -> TileSample {
        TileSample {
            name: name.into(),
            is_self,
            muted: Some(false),
            label_speaking: false,
            // Công thức Teams: chỉ báo "có mặt khi nói" (`Some(1)`).
            anchors: vec![speaking.then_some(1)],
            candidates: vec![],
            shapes: vec![],
            slot,
            variant: 0,
        }
    }

    /// Bộ đọc hoàn hảo: 4 lượt mỗi giây; ô của khách có chỉ báo khi khách đó đang nói (trễ 0,6 s). `show` đổi từng ô: `None` là ô không
    /// có mặt, `Some(b)` là chỉ báo `b`.
    fn samples(show: impl Fn(&str, bool) -> Option<bool>, status: ReaderStatus) -> Vec<Sample> {
        let turns = schedule().turns(T0);
        (0..32_000 / 250)
            .map(|i| {
                let at = T0 + i * 250;
                let on = |who: &str| {
                    turns
                        .iter()
                        .any(|t| t.who == who && (t.start_ms..t.end_ms).contains(&(at - 600)))
                };
                let mut tiles = vec![tile("Minh", true, false, 0)];
                for (k, guest) in ["Khach A", "Khach B"].iter().enumerate() {
                    if let Some(shown) = show(guest, on(guest)) {
                        tiles.push(tile(guest, false, shown, k as u32 + 1));
                    }
                }
                Sample {
                    at_unix_ms: at as u64,
                    period_ms: 250,
                    status,
                    app: Some(MeetingApp::Teams),
                    app_version: Some("26032.1100".into()),
                    tiles,
                    pass: Pass::Fast,
                    pass_ms: 1.0,
                    elements: 4,
                }
            })
            .collect()
    }

    fn judge(samples: &[Sample]) -> Outcome {
        let mut c = Collector::new(&recipes(), Os::Macos, MeetingApp::Teams, schedule().turns(T0)).unwrap();
        for s in samples {
            c.push(s);
        }
        c.finish(&Params::default()).unwrap()
    }

    #[test]
    fn the_schedule_gives_absolute_turns_and_never_prints_names() {
        let turns = schedule().turns(T0);
        assert_eq!((turns[1].start_ms, turns[1].end_ms), (T0 + 8_000, T0 + 14_000));
        let parsed: Schedule =
            serde_json::from_str(r#"{"app":"meet_chrome","turns":[{"who":"Khach X","start_s":1.5,"end_s":2.25}]}"#)
                .unwrap();
        assert_eq!(parsed.app, MeetingApp::MeetChrome);
        assert!(!format!("{parsed:?}").contains("Khach X"), "Debug không in tên khách");
    }

    #[test]
    fn a_working_recipe_reads_the_right_guest_at_the_right_time() {
        let out = judge(&samples(|_, on| Some(on), ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::Ok, "{:?}", out.verdict.score);
        assert_eq!((out.verdict.score.turns, out.verdict.score.turns_ok), (4, 4));
        assert_eq!(out.app_version.as_deref(), Some("26032.1100"));
        assert_eq!(out.recipe_version, recipes().version);
    }

    /// Teams đổi giao diện: chỉ báo "đang nói" biến mất (ô vẫn đọc được).
    #[test]
    fn tiles_without_an_indicator_mean_no_speaking() {
        let out = judge(&samples(|_, _| Some(false), ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::NoSpeaking);
    }

    /// Teams đổi giao diện: không còn ô người tham dự nào (chỉ còn ô của chính mình).
    #[test]
    fn no_participant_tiles_mean_no_names() {
        let out = judge(&samples(|_, _| None, ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::NoNames);
    }

    #[test]
    fn an_app_that_does_not_answer_means_blocked() {
        let out = judge(&samples(|_, on| Some(on), ReaderStatus::Blocked));
        assert_eq!(out.verdict.health, Health::Blocked);
    }

    /// Chỉ báo dính vào một khách (luôn bật dù khách đó im): sai người ở mọi lượt của khách kia và lúc im.
    #[test]
    fn an_indicator_stuck_on_one_guest_is_not_a_pass() {
        let out = judge(&samples(|who, on| Some(who == "Khach A" || on), ReaderStatus::Ok));
        assert_eq!(out.verdict.health, Health::NoSpeaking);
        assert!(out.verdict.score.wrong_ratio() > 0.05, "{:?}", out.verdict.score);
    }

    /// Ô của chính mình có chỉ báo bật suốt: không phải "khách đang nói", không tính sai.
    #[test]
    fn the_own_tile_never_counts_as_a_speaking_guest() {
        let mut all = samples(|_, on| Some(on), ReaderStatus::Ok);
        for s in &mut all {
            s.tiles[0].anchors = vec![Some(1)];
        }
        let out = judge(&all);
        assert_eq!(out.verdict.health, Health::Ok, "{:?}", out.verdict.score);
        assert_eq!(out.verdict.score.wrong, 0);
    }

    /// Máy "im" theo lịch: không có lượt nói nào trong [`at` − trễ − 1 s, `at`].
    #[test]
    fn the_machine_is_quiet_only_a_delay_and_a_second_after_the_last_turn() {
        let c = Collector::new(&recipes(), Os::Macos, MeetingApp::Teams, schedule().turns(T0)).unwrap();
        let gap = c.delay_ms + 1_000;
        assert!(gap < 2_000, "khoảng im giữa hai lượt đủ để thử");
        assert!(c.quiet(T0 - 1), "trước lượt đầu");
        assert!(!c.quiet(T0 + 3_000), "đang có người nói");
        assert!(!c.quiet(T0 + 6_000 + gap - 1), "vẫn trong độ trễ của lượt vừa xong");
        assert!(c.quiet(T0 + 6_000 + gap), "đã im đủ lâu");
    }

    #[test]
    fn there_is_nothing_to_check_without_a_recipe_for_the_app() {
        let none = parse(r#"{"schema":1,"version":1,"min_app_version":"0.3.2","apps":[]}"#).unwrap();
        assert!(Collector::new(&none, Os::Macos, MeetingApp::Teams, vec![]).is_none());
        assert!(Collector::new(&none, Os::Windows, MeetingApp::Teams, vec![]).is_none());
        assert!(
            Collector::new(&recipes(), Os::Windows, MeetingApp::Teams, vec![]).is_some(),
            "bản build sẵn có Teams Windows từ 0.5.2 (nguồn đầu: bảng người tham dự)"
        );
        assert!(
            Collector::new(&recipes(), Os::Windows, MeetingApp::MeetChrome, vec![]).is_none(),
            "Meet Windows chưa có"
        );
    }

    #[test]
    fn a_broken_schedule_is_an_error_not_a_verdict() {
        let mut c = Collector::new(
            &recipes(),
            Os::Macos,
            MeetingApp::Teams,
            schedule().turns(T0)[..2].to_vec(),
        )
        .unwrap();
        for s in samples(|_, on| Some(on), ReaderStatus::Ok) {
            c.push(&s);
        }
        assert!(c.finish(&Params::default()).is_err());
    }

    /// Báo cáo và kết quả không có tên khách; báo cáo đi đúng khuôn của `speaker_health` với `canary = true`.
    #[test]
    fn the_report_is_a_canary_health_report_without_any_name() {
        let out = judge(&samples(|_, on| Some(on), ReaderStatus::Ok));
        let f = facts("0.3.2", "15.6.1", "mac-chu-du-an");
        assert_eq!(f.device_id_hash.len(), 64);
        assert_ne!(f.device_id_hash, facts("0.3.2", "15.6.1", "may-khac").device_id_hash);
        let json = report(&out, &f, 1_793_059_300, 300_000).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["kind"], "speaker_health");
        assert_eq!(v["canary"], true);
        assert_eq!(v["state"], "ok");
        assert_eq!(v["minutes"], serde_json::json!({"ok": 5, "total": 5}));
        assert_eq!(
            v["meeting"],
            serde_json::json!({"app": "teams", "version": "26032.1100"})
        );
        let result = result_json(&out, 300_000);
        for text in [&json, &result, &format!("{out:?}")] {
            assert!(
                !text.contains("Khach") && !text.contains("Minh") && !text.contains("mac-chu-du-an"),
                "{text}"
            );
        }
        assert!(serde_json::from_str::<serde_json::Value>(&result).unwrap()["turns_ok"] == 4);
    }

    struct FakePoster(Mutex<Vec<Result<u16, String>>>);

    impl Poster for FakePoster {
        fn post(&self, _body: &str) -> Result<u16, String> {
            self.0.lock().unwrap().remove(0)
        }
    }

    #[test]
    fn sending_tells_retryable_from_final_failures() {
        let poster = |r: Result<u16, String>| FakePoster(Mutex::new(vec![r]));
        assert_eq!(send(&poster(Ok(202)), "{}"), Ok(()));
        assert_eq!(send(&poster(Ok(429)), "{}"), Err(SendError::Retry("HTTP 429".into())));
        assert_eq!(send(&poster(Ok(503)), "{}"), Err(SendError::Retry("HTTP 503".into())));
        assert_eq!(send(&poster(Ok(422)), "{}"), Err(SendError::Rejected(422)));
        assert_eq!(send(&poster(Ok(400)), "{}"), Err(SendError::Rejected(400)));
        assert_eq!(
            send(&poster(Err("mạng".into())), "{}"),
            Err(SendError::Retry("mạng".into()))
        );
    }

    #[test]
    fn only_https_or_loopback_servers_are_accepted() {
        assert!(HttpPoster::new(DEFAULT_API).is_some());
        assert!(HttpPoster::new("http://127.0.0.1:8787").is_some());
        assert!(HttpPoster::new("http://api.example.com").is_none());
        assert!(HttpPoster::new("https://api.example.com/?x=1").is_none());
        assert!(HttpPoster::new("không phải url").is_none());
    }
}
