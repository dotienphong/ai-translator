//! `speaker-worker` giả, chỉ dùng trong test của `pipeline` (`speaker_client`): nói đúng giao thức `speaker-protocol`, không cần
//! model.
//!
//! - `FAKE_SPEAKER_PLAN`: file kịch bản; mỗi lần chạy lấy dòng đầu (rồi bỏ dòng đó), hết dòng thì `ok`. Các lệnh cách nhau bằng
//!   dấu cách: `ok`; `exit_at_start:<mã>`; `version:<n>` (`Ready` báo phiên bản n); `model_bad` (`Ready` báo model hỏng);
//!   `load_delay_ms:<ms>`; `voices:<k>` (đoạn có id `i` vào giọng `i % k + 1`, mặc định 1); `crash_on:<n>` (thoát mã 3, không
//!   trả lời, ở `Segment` thứ n của lần chạy này); `hang_on:<n>` (treo ở `Segment` thứ n); `big_voices` (trả `Voices` 100 giọng
//!   ở `Segment` đầu); `flood_voices:<n>` (trả thêm n khung `Voices` ở `Segment` đầu: worker gửi dồn); `error_on:<n>` (trả
//!   `Error` có id đoạn thay cho `Assign` ở `Segment` thứ n); `errors:<n>` (trả thêm n khung `Error` không có id đoạn ở `Segment`
//!   đầu); `big_voice_id` (`Assign` của `Segment` đầu mang mã giọng `u32::MAX - 1`); `ready_twice` (trả hai `Ready` cho `Load`);
//!   `segment_delay_ms:<ms>` (chờ chừng ấy trước khi trả lời mỗi `Segment`: worker chậm); `named` (ở `Segment` đầu, sau `Assign`:
//!   `Voices` có giọng 1 tên "Lan", người tham dự "Lan", "Minh", rồi `ReaderState { Teams, NoPermission }`); `long_name` (ở `Segment`
//!   đầu: `Voices` có tên 200 byte).
//! - `FAKE_SPEAKER_LOG`: file ghi nối tiếp: `start threads=<RAYON_NUM_THREADS>`, `load model=<tên file> sha=<có|không> theta=<θ>`, `session unix=<ms>`,
//!   `names enabled=<bool> recipe=<số byte>`, `speech <đầu>-<cuối>`, `set_names <bool>`, `pause_names`,
//!   `segment <id> pcm=<số mẫu> dur=<ms> source=<nguồn>`, `shutdown`.

use speaker_protocol::{ErrorKind, PROTOCOL_VERSION, Request, Response, VoiceInfo, read_frame, write_frame};
use std::collections::BTreeSet;
use std::io::{BufReader, BufWriter, Write};
use std::time::Duration;

#[derive(Default)]
struct Plan {
    exit_at_start: Option<i32>,
    version: Option<u32>,
    model_bad: bool,
    load_delay_ms: u64,
    voices: u64,
    crash_on: Option<u64>,
    hang_on: Option<u64>,
    big_voices: bool,
    flood_voices: u64,
    error_on: Option<u64>,
    errors: u64,
    big_voice_id: bool,
    ready_twice: bool,
    segment_delay_ms: u64,
    named: bool,
    long_name: bool,
}

fn next_plan_line() -> String {
    let Some(path) = std::env::var_os("FAKE_SPEAKER_PLAN") else {
        return "ok".into();
    };
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines = text.lines();
    let first = lines.next().unwrap_or("ok").to_string();
    let rest: Vec<&str> = lines.collect();
    std::fs::write(&path, rest.join("\n")).expect("ghi lại kịch bản");
    first
}

fn parse(line: &str) -> Plan {
    let mut p = Plan {
        voices: 1,
        ..Plan::default()
    };
    for word in line.split_whitespace() {
        let (key, value) = word.split_once(':').unwrap_or((word, ""));
        match key {
            "ok" => {}
            "exit_at_start" => p.exit_at_start = value.parse().ok(),
            "version" => p.version = value.parse().ok(),
            "model_bad" => p.model_bad = true,
            "load_delay_ms" => p.load_delay_ms = value.parse().unwrap_or(0),
            "voices" => p.voices = value.parse::<u64>().unwrap_or(1).max(1),
            "crash_on" => p.crash_on = value.parse().ok(),
            "hang_on" => p.hang_on = value.parse().ok(),
            "big_voices" => p.big_voices = true,
            "flood_voices" => p.flood_voices = value.parse().unwrap_or(0),
            "error_on" => p.error_on = value.parse().ok(),
            "errors" => p.errors = value.parse().unwrap_or(0),
            "big_voice_id" => p.big_voice_id = true,
            "segment_delay_ms" => p.segment_delay_ms = value.parse().unwrap_or(0),
            "ready_twice" => p.ready_twice = true,
            "named" => p.named = true,
            "long_name" => p.long_name = true,
            other => panic!("lệnh kịch bản lạ: {other}"),
        }
    }
    p
}

fn log(line: &str) {
    if let Some(path) = std::env::var_os("FAKE_SPEAKER_LOG") {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("mở log");
        writeln!(f, "{line}").expect("ghi log");
    }
}

fn main() {
    let plan = parse(&next_plan_line());
    if let Some(code) = plan.exit_at_start {
        std::process::exit(code);
    }
    log(&format!(
        "start threads={}",
        std::env::var("RAYON_NUM_THREADS").unwrap_or_default()
    ));
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(std::io::stdout().lock());
    let (mut segments, mut seen) = (0u64, BTreeSet::new());
    while let Ok(Some(request)) = read_frame::<_, Request>(&mut input) {
        let replies = match request {
            Request::Load {
                model_path,
                model_sha256,
                config,
                names,
            } => {
                std::thread::sleep(Duration::from_millis(plan.load_delay_ms));
                let name = std::path::Path::new(&model_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let sha = if model_sha256.is_some() { "có" } else { "không" };
                log(&format!("load model={name} sha={sha} theta={}", config.theta));
                log(&format!(
                    "names enabled={} recipe={}",
                    names.enabled,
                    names.recipe_json.len()
                ));
                let ready = Response::Ready {
                    protocol_version: plan.version.unwrap_or(PROTOCOL_VERSION),
                    model_ok: !plan.model_bad,
                    reader_platform: speaker_protocol::ReaderPlatform::Unsupported,
                };
                if plan.ready_twice {
                    vec![ready.clone(), ready]
                } else {
                    vec![ready]
                }
            }
            Request::SessionStart { unix_ms } => {
                log(&format!("session unix={unix_ms}"));
                Vec::new()
            }
            Request::Segment(s) => {
                segments += 1;
                log(&format!(
                    "segment {} pcm={} dur={} source={:?}",
                    s.segment_id,
                    s.pcm.len(),
                    s.end_ms.saturating_sub(s.start_ms),
                    s.source
                ));
                if plan.crash_on == Some(segments) {
                    std::process::exit(3);
                }
                if plan.hang_on == Some(segments) {
                    loop {
                        std::thread::sleep(Duration::from_secs(3_600));
                    }
                }
                std::thread::sleep(Duration::from_millis(plan.segment_delay_ms));
                if plan.error_on == Some(segments) {
                    vec![Response::Error {
                        segment_id: Some(s.segment_id),
                        kind: ErrorKind::Internal,
                        message: "lỗi giả".into(),
                    }]
                } else {
                    reply(&plan, &s, segments, &mut seen)
                }
            }
            Request::Speech { start_ms, end_ms } => {
                log(&format!("speech {start_ms}-{end_ms}"));
                Vec::new()
            }
            Request::SetNames { enabled } => {
                log(&format!("set_names {enabled}"));
                Vec::new()
            }
            Request::PauseNames => {
                log("pause_names");
                Vec::new()
            }
            Request::Shutdown => {
                log("shutdown");
                break;
            }
        };
        for r in &replies {
            write_frame(&mut output, r).expect("ghi khung");
        }
    }
}

/// Trả lời một `Segment` đã nhận (thứ `segments` của lần chạy này).
fn reply(plan: &Plan, s: &speaker_protocol::SegmentAudio, segments: u64, seen: &mut BTreeSet<u32>) -> Vec<Response> {
    let voice = (s.segment_id % plan.voices) as u32 + 1;
    let mut out = vec![Response::Assign {
        segment_id: s.segment_id,
        voice: Some(if plan.big_voice_id && segments == 1 {
            u32::MAX - 1
        } else {
            voice
        }),
        confidence: 0.9,
    }];
    if plan.errors > 0 && segments == 1 {
        out.extend((0..plan.errors).map(|_| Response::Error {
            segment_id: None,
            kind: ErrorKind::Internal,
            message: "lỗi giả".into(),
        }));
    }
    if plan.big_voices && segments == 1 {
        out.push(Response::Voices {
            voices: (1..=100).map(|voice| VoiceInfo::new(voice, 1, false)).collect(),
            participants: Vec::new(),
        });
    } else if plan.flood_voices > 0 && segments == 1 {
        let one = VoiceInfo::new(voice, 1, false);
        out.extend((0..plan.flood_voices).map(|_| Response::Voices {
            voices: vec![one.clone()],
            participants: Vec::new(),
        }));
    } else if seen.insert(voice) {
        out.push(Response::Voices {
            voices: seen.iter().map(|&voice| VoiceInfo::new(voice, 1_000, false)).collect(),
            participants: Vec::new(),
        });
    }
    if plan.named && segments == 1 {
        let name = speaker_protocol::PersonName::new;
        out.push(Response::Voices {
            voices: vec![VoiceInfo {
                name: name("Lan"),
                name_source: Some(speaker_protocol::NameSource::Indicator),
                ..VoiceInfo::new(voice, 1_000, false)
            }],
            participants: vec![name("Lan").unwrap(), name("Minh").unwrap()],
        });
        out.push(Response::ReaderState {
            app: Some(speaker_protocol::MeetingApp::Teams),
            app_version: Some("26276".into()),
            state: speaker_protocol::ReaderStatus::NoPermission,
            recipe_version: 1,
            learned: 1,
            patterns: vec![speaker_protocol::LearnedPattern {
                role: "AXGroup".into(),
                path: vec![1, 0],
                states: vec![],
            }],
        });
    }
    if plan.long_name && segments == 1 {
        // Không qua `PersonName::new` (từ chối tên dài): dựng thẳng qua serde như một worker hỏng.
        let long: speaker_protocol::PersonName = serde_json::from_value(serde_json::json!("x".repeat(200))).unwrap();
        out.push(Response::Voices {
            voices: vec![VoiceInfo {
                name: Some(long),
                ..VoiceInfo::new(voice, 1_000, false)
            }],
            participants: Vec::new(),
        });
    }
    out
}
