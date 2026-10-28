//! `speaker-canary`: kiểm tra tự động hằng ngày của bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06). Chạy trên máy của
//! chủ dự án (launchd, Task Scheduler) do bộ điều khiển `tools/speaker-canary` gọi; không nằm trong app hay gói cài.
//!
//!   speaker-canary run --schedule <lịch.json> --t0-unix-ms <ms> --seconds <n> --machine <nhãn> [--recipe <file>] [--out <kết quả.json>]
//!                      [--app-version <x.y.z>] [--os-version <chuỗi>] [--api <url>] [--no-send]
//!       đọc cửa sổ họp của app trong lịch (macOS: Accessibility, Windows: UI Automation) `--seconds` giây theo nhịp 4 lần mỗi giây, chấm so với
//!       lịch nói (giây tính từ `--t0-unix-ms`), ghi kết quả (không có tên người) và gửi `speaker_health` với `canary = true`. Báo cáo gửi lỗi tạm
//!       được giữ ở `<kết quả>.report.json` để gửi lại bằng `send`. Thoát 0 khi tình trạng là `ok`, 1 khi hỏng, 2 khi lỗi chạy.
//!   speaker-canary send --report <file> [--api <url>]
//!       gửi lại một báo cáo đã dựng (mã thoát 0 khi gửi được, 3 khi lỗi tạm, 4 khi bị từ chối).
//!
//! Chỉ đọc, không bấm, không gõ gì trong app họp. Tiến trình chạy công cụ phải có quyền Trợ năng (macOS: quyền của Terminal hay của launchd job).

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, bail};
use clap::{Parser, Subcommand};
use speaker_canary::{Collector, DEFAULT_API, HttpPoster, Schedule, SendError, facts, report, result_json, send};
use speaker_ops::canary::Params;
use speaker_ops::health::Health;
use speaker_recipe::{Os, Recipes};
use speaker_worker::reader::Sample;

const PERIOD: Duration = Duration::from_millis(250);

#[derive(Parser)]
#[command(about = "Kiểm tra tự động hằng ngày của bộ đọc tên người nói")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Run {
        #[arg(long)]
        schedule: PathBuf,
        /// Mốc 0 của lịch nói, giờ Unix (ms).
        #[arg(long)]
        t0_unix_ms: i64,
        #[arg(long)]
        seconds: u64,
        /// Nhãn máy chạy kiểm tra (không phải mã phần cứng); thành `device_id_hash` của báo cáo.
        #[arg(long)]
        machine: String,
        /// Công thức thay bản build sẵn (để thử công thức ứng viên).
        #[arg(long)]
        recipe: Option<PathBuf>,
        #[arg(long)]
        out: Option<PathBuf>,
        #[arg(long, default_value = env!("CARGO_PKG_VERSION"))]
        app_version: String,
        #[arg(long, default_value = "unknown")]
        os_version: String,
        #[arg(long, default_value = DEFAULT_API)]
        api: String,
        #[arg(long)]
        no_send: bool,
        /// Dấu `AXEnhancedUserInterface` (macOS), để trả lại nếu công cụ bị tắt giữa chừng.
        #[arg(long)]
        marker: Option<PathBuf>,
    },
    Send {
        #[arg(long)]
        report: PathBuf,
        #[arg(long, default_value = DEFAULT_API)]
        api: String,
    },
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// Đọc cửa sổ họp của `app` `seconds` giây theo nhịp 4 lần mỗi giây; mỗi lượt đọc đưa cho `each`.
#[cfg(target_os = "macos")]
fn read(
    recipes: Arc<Recipes>,
    app: speaker_protocol::MeetingApp,
    seconds: u64,
    marker: Option<PathBuf>,
    mut each: impl FnMut(&Sample),
) -> anyhow::Result<()> {
    use speaker_worker::reader::macos::{LiveReader, set_process_timeout};
    set_process_timeout();
    let mut reader = LiveReader::new(recipes, marker, Some(app));
    reader.restore_leftovers();
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        let started = Instant::now();
        each(&reader.tick(false));
        std::thread::sleep(PERIOD.saturating_sub(started.elapsed()));
    }
    reader.release_all();
    Ok(())
}

#[cfg(windows)]
fn read(
    recipes: Arc<Recipes>,
    app: speaker_protocol::MeetingApp,
    seconds: u64,
    _marker: Option<PathBuf>,
    mut each: impl FnMut(&Sample),
) -> anyhow::Result<()> {
    use speaker_worker::reader::uia::{ComGuard, LiveReader};
    let _com = ComGuard::init();
    let mut reader = LiveReader::new(recipes, Some(app))?;
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        let started = Instant::now();
        each(&reader.tick(false));
        std::thread::sleep(PERIOD.saturating_sub(started.elapsed()));
    }
    reader.release_all();
    Ok(())
}

#[cfg(not(any(target_os = "macos", windows)))]
fn read(
    _recipes: Arc<Recipes>,
    _app: speaker_protocol::MeetingApp,
    _seconds: u64,
    _marker: Option<PathBuf>,
    _each: impl FnMut(&Sample),
) -> anyhow::Result<()> {
    bail!("kiểm tra tự động chỉ chạy trên macOS và Windows")
}

fn post(api: &str, body: &str) -> Result<(), SendError> {
    let poster = HttpPoster::new(api).ok_or(SendError::Rejected(0))?;
    send(&poster, body)
}

fn exit_of(result: Result<(), SendError>) -> ExitCode {
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(SendError::Retry(why)) => {
            eprintln!("speaker-canary: chưa gửi được ({why}); gửi lại bằng `send`");
            ExitCode::from(3)
        }
        Err(SendError::Rejected(status)) => {
            eprintln!("speaker-canary: server từ chối báo cáo (HTTP {status})");
            ExitCode::from(4)
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run(
    schedule: PathBuf,
    t0: i64,
    seconds: u64,
    machine: String,
    recipe: Option<PathBuf>,
    out: Option<PathBuf>,
    app_version: String,
    os_version: String,
    api: String,
    no_send: bool,
    marker: Option<PathBuf>,
) -> anyhow::Result<ExitCode> {
    let schedule: Schedule =
        serde_json::from_slice(&std::fs::read(&schedule).context("không đọc được lịch")?).context("lịch sai dạng")?;
    let recipe_json = match &recipe {
        Some(p) => std::fs::read_to_string(p).with_context(|| format!("không đọc được {}", p.display()))?,
        None => speaker_recipe::BUILTIN_JSON.to_string(),
    };
    let recipes = Arc::new(speaker_recipe::parse(&recipe_json)?);
    let os = Os::current().context("hệ điều hành này không có bộ đọc")?;
    let Some(mut collector) = Collector::new(&recipes, os, schedule.app, schedule.turns(t0)) else {
        bail!("công thức không có mục cho app này trên hệ điều hành này: không có gì để kiểm");
    };
    let started = now_ms();
    read(Arc::clone(&recipes), schedule.app, seconds, marker, |s: &Sample| {
        collector.push(s)
    })?;
    let duration_ms = u64::try_from(now_ms() - started).unwrap_or(0);
    let outcome = collector.finish(&Params::default())?;
    let result = result_json(&outcome, duration_ms);
    println!("{result}");
    let body = report(
        &outcome,
        &facts(&app_version, &os_version, &machine),
        now_ms() / 1000,
        duration_ms,
    )?;
    if let Some(out) = &out {
        std::fs::write(out, &result)?;
        std::fs::write(out.with_extension("report.json"), &body)?;
    }
    if !no_send {
        let sent = exit_of(post(&api, &body));
        if sent != ExitCode::SUCCESS {
            return Ok(sent);
        }
    }
    Ok(if outcome.verdict.health == Health::Ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    })
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Send { report, api } => match std::fs::read_to_string(&report) {
            Ok(body) => exit_of(post(&api, &body)),
            Err(e) => {
                eprintln!("speaker-canary: không đọc được {}: {e}", report.display());
                ExitCode::from(2)
            }
        },
        Command::Run {
            schedule,
            t0_unix_ms,
            seconds,
            machine,
            recipe,
            out,
            app_version,
            os_version,
            api,
            no_send,
            marker,
        } => match run(
            schedule,
            t0_unix_ms,
            seconds,
            machine,
            recipe,
            out,
            app_version,
            os_version,
            api,
            no_send,
            marker,
        ) {
            Ok(code) => code,
            Err(e) => {
                eprintln!("speaker-canary: lỗi: {e:#}");
                ExitCode::from(2)
            }
        },
    }
}
