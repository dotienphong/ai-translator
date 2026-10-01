//! `asr-worker` giả, chỉ dùng trong test của `pipeline` (kế hoạch 00, mục 6.3: tiến trình phụ giả). Nói đúng giao thức của
//! `asr-protocol`, không cần model hay GPU.
//!
//! Điều khiển bằng biến môi trường:
//! - `FAKE_ASR_PLAN`: file kịch bản. Mỗi lần tiến trình chạy lấy dòng đầu (rồi bỏ dòng đó khỏi file); hết dòng thì là `ok`.
//!   Một dòng gồm các lệnh cách nhau bằng dấu cách:
//!   - `ok`: chạy bình thường;
//!   - `exit_at_start:<mã>`: thoát ngay với mã này (như thiếu `vulkan-1.dll`);
//!   - `load_error:<ModelLoad|OutOfMemory|GpuInit>`: trả `Error` cho `Load`;
//!   - `version:<n>`: `Ready` báo phiên bản giao thức `n`;
//!   - `backend:<cpu|metal|vulkan>`: thiết bị báo trong `Ready` (mặc định metal nếu xin GPU, cpu nếu không);
//!   - `mode:split`: báo chế độ A;
//!   - `crash_on:<n>`: thoát với mã 3, không trả lời, khi nhận `Transcribe` thứ `n` của lần chạy này;
//!   - `hang_on:<n>`: treo khi nhận `Transcribe` thứ `n`;
//!   - `wrong_id_on:<n>`: kết quả của `Transcribe` thứ `n` mang id đoạn cộng 1000;
//!   - `slow_ms:<ms>`: chờ chừng này trước khi trả mỗi kết quả `Transcribe` (để test hàng đợi tất định).
//! - `FAKE_ASR_LOG`: file ghi nối tiếp các sự kiện (`start use_gpu=…`, `transcribe <id> prev=<ngôn ngữ> prompt=<số token>`).
//! - `FAKE_ASR_TEXTS`: file, mỗi dòng `<ngôn ngữ>\t<chữ>`; đoạn có id `i` trả dòng `i % số dòng`. Thêm `\t!nospeech` ở cuối
//!   dòng thì trả `no_speech_prob` 0,9 và `avg_logprob` −1,5. Không đặt thì trả `đoạn <id>` bằng ngôn ngữ đầu tiên được phép.

use asr_protocol::{
    Backend, DecodeMode, ErrorKind, PROTOCOL_VERSION, Request, Response, TranscribeResult, read_frame, write_frame,
};
use std::io::{BufReader, BufWriter, Write};

struct Plan {
    exit_at_start: Option<i32>,
    load_error: Option<ErrorKind>,
    version: u32,
    backend: Option<Backend>,
    mode: DecodeMode,
    crash_on: Option<u32>,
    hang_on: Option<u32>,
    wrong_id_on: Option<u32>,
    slow_ms: u64,
}

fn next_plan_line() -> String {
    let Some(path) = std::env::var_os("FAKE_ASR_PLAN") else {
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
    let mut plan = Plan {
        exit_at_start: None,
        load_error: None,
        version: PROTOCOL_VERSION,
        backend: None,
        mode: DecodeMode::Shared,
        crash_on: None,
        hang_on: None,
        wrong_id_on: None,
        slow_ms: 0,
    };
    for word in line.split_whitespace() {
        let (key, value) = word.split_once(':').unwrap_or((word, ""));
        match key {
            "ok" => {}
            "exit_at_start" => plan.exit_at_start = value.parse().ok(),
            "load_error" => {
                plan.load_error = Some(match value {
                    "OutOfMemory" => ErrorKind::OutOfMemory,
                    "GpuInit" => ErrorKind::GpuInit,
                    _ => ErrorKind::ModelLoad,
                })
            }
            "version" => plan.version = value.parse().expect("số phiên bản"),
            "backend" => {
                plan.backend = Some(match value {
                    "cpu" => Backend::Cpu,
                    "vulkan" => Backend::Vulkan,
                    _ => Backend::Metal,
                })
            }
            "mode" if value == "split" => plan.mode = DecodeMode::Split,
            "crash_on" => plan.crash_on = value.parse().ok(),
            "hang_on" => plan.hang_on = value.parse().ok(),
            "wrong_id_on" => plan.wrong_id_on = value.parse().ok(),
            "slow_ms" => plan.slow_ms = value.parse().expect("số ms"),
            other => panic!("lệnh kịch bản lạ: {other}"),
        }
    }
    plan
}

fn log(line: &str) {
    if let Some(path) = std::env::var_os("FAKE_ASR_LOG") {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("mở log giả");
        writeln!(f, "{line}").unwrap();
    }
}

fn texts() -> Vec<(String, String, bool)> {
    let Some(path) = std::env::var_os("FAKE_ASR_TEXTS") else {
        return Vec::new();
    };
    std::fs::read_to_string(path)
        .expect("đọc FAKE_ASR_TEXTS")
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| {
            let mut parts = l.split('\t');
            let lang = parts.next().unwrap_or("en").to_string();
            let text = parts.next().unwrap_or("").to_string();
            (lang, text, parts.next() == Some("!nospeech"))
        })
        .collect()
}

fn main() {
    let plan = parse(&next_plan_line());
    if let Some(code) = plan.exit_at_start {
        std::process::exit(code);
    }
    let texts = texts();
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(std::io::stdout().lock());
    let mut loaded = false;
    let mut transcribes = 0u32;
    while let Ok(Some(request)) = read_frame::<_, Request>(&mut input) {
        let response = match request {
            Request::Load { use_gpu, .. } => {
                log(&format!("start use_gpu={use_gpu}"));
                match plan.load_error {
                    Some(kind) => Response::Error {
                        segment_id: None,
                        kind,
                        message: format!("lỗi giả {kind:?}"),
                    },
                    None => {
                        loaded = true;
                        Response::Ready {
                            protocol_version: plan.version,
                            backend: plan
                                .backend
                                .unwrap_or(if use_gpu { Backend::Metal } else { Backend::Cpu }),
                            decode_mode: plan.mode,
                            whisper_version: "giả".into(),
                            system_info: String::new(),
                        }
                    }
                }
            }
            Request::Warmup => {
                log("warmup");
                Response::WarmupDone { millis: 1.0 }
            }
            Request::Transcribe(req) => {
                transcribes += 1;
                log(&format!(
                    "transcribe {} prev={} prompt={}",
                    req.segment_id,
                    req.prev_lang.as_deref().unwrap_or("-"),
                    req.prompt_tokens.len()
                ));
                if plan.crash_on == Some(transcribes) {
                    std::process::exit(3);
                }
                if plan.hang_on == Some(transcribes) {
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(60));
                    }
                }
                if plan.slow_ms > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(plan.slow_ms));
                }
                let reply_id = if plan.wrong_id_on == Some(transcribes) {
                    req.segment_id + 1000
                } else {
                    req.segment_id
                };
                if !loaded {
                    Response::Error {
                        segment_id: Some(req.segment_id),
                        kind: ErrorKind::NotLoaded,
                        message: "chưa nạp model".into(),
                    }
                } else {
                    let (lang, text, nospeech) = if texts.is_empty() {
                        (req.languages[0].clone(), format!("đoạn {}", req.segment_id), false)
                    } else {
                        texts[req.segment_id as usize % texts.len()].clone()
                    };
                    let tokens: Vec<i32> = (1..=text.split_whitespace().count() as i32).collect();
                    Response::Result(TranscribeResult {
                        segment_id: reply_id,
                        lang,
                        lang_prob: 1.0,
                        text,
                        tokens,
                        no_speech_prob: if nospeech { 0.9 } else { 0.0 },
                        lid_ms: 1.0,
                        asr_ms: 1.0,
                        avg_logprob: if nospeech { -1.5 } else { -0.2 },
                    })
                }
            }
            Request::Shutdown => break,
        };
        if write_frame(&mut output, &response).is_err() {
            break;
        }
    }
}
