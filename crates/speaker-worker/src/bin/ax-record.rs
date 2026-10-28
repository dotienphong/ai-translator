//! Công cụ đo và ghi của bộ đọc tên (kế hoạch 04 Task 12, 20, 21; chỉ macOS): chạy đúng bộ đọc của `speaker-worker` (công thức build
//! sẵn hay `--recipe <file>`) trên một app họp đang chạy, `--rate` lượt mỗi giây, trong `--seconds` giây, rồi trả
//! `AXEnhancedUserInterface` và thoát. Chỉ đọc, không bấm gì. Tiến trình chạy công cụ phải có quyền Trợ năng (chạy từ Terminal:
//! quyền của Terminal).
//!
//!   ax-record stats <app> <ra.jsonl> [--rate 1|4] [--seconds 60] [--recipe <file>] [--marker <dấu.json>] [--calibrate]
//!       mỗi lượt một dòng {"t", "pass", "ms", "elements", "status", "tiles", "timeouts"}: không có tên người
//!   ax-record fixture <app> <ra.jsonl> [--seconds 60] [--recipe <file>] [--marker <dấu.json>]
//!       mỗi giây một ảnh chụp cây của cửa sổ họp, định dạng fixture: CÓ TÊN THẬT VÀ CHỮ CỦA APP HỌP, chỉ ghi vào $DATA, ẩn danh
//!       bằng scripts/speaker-recipes/make_fixture.py trước khi vào repo
//!
//! <app>: teams | zoom | meet_chrome | meet_edge (Meet, Zoom không có trong công thức build sẵn: cần `--recipe`).
//! `--calibrate`: mỗi lượt đọc cả ứng viên tự hiệu chỉnh, như worker khi đang tìm hay đã học được chỉ báo (`ControlState::calibrate`).

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("ax-record chỉ chạy trên macOS");
    std::process::exit(2);
}

#[cfg(target_os = "macos")]
fn main() -> anyhow::Result<()> {
    use std::io::Write;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use anyhow::{Context, bail};
    use speaker_protocol::MeetingApp;
    use speaker_worker::reader::macos::LiveReader;

    const USAGE: &str = "cách dùng: ax-record stats|fixture <teams|zoom|meet_chrome|meet_edge> <ra.jsonl> [--rate 1|4] \
                         [--seconds N] [--recipe <file>] [--marker <file>] [--calibrate]";
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        bail!("{USAGE}");
    }
    let (mode, out) = (args[1].as_str(), args[3].as_str());
    if mode != "stats" && mode != "fixture" {
        bail!("{USAGE}");
    }
    let app: MeetingApp = serde_json::from_value(serde_json::Value::String(args[2].clone())).context(USAGE)?;
    let opt = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let rate: u64 = opt("--rate").map_or(Ok(1), |v| v.parse()).context("--rate")?;
    let seconds: u64 = opt("--seconds").map_or(Ok(60), |v| v.parse()).context("--seconds")?;
    // Rà soát lần 2 B-N-E: đo cả đường đọc ứng viên mà worker dùng khi tìm hay đã học chỉ báo.
    let calibrate = args.iter().any(|a| a == "--calibrate");
    let recipe_json = match opt("--recipe") {
        Some(p) => std::fs::read_to_string(&p).with_context(|| format!("không đọc được {p}"))?,
        None => speaker_recipe::BUILTIN_JSON.to_string(),
    };
    let recipes = std::sync::Arc::new(speaker_recipe::parse(&recipe_json)?);
    // Hạn chờ 0,2 s cho cả tiến trình (QĐ 27), trước mọi lệnh Accessibility.
    speaker_worker::reader::macos::set_process_timeout();
    let mut reader = LiveReader::new(recipes, opt("--marker").map(std::path::PathBuf::from), Some(app));
    reader.restore_leftovers();
    let mut file =
        std::io::BufWriter::new(std::fs::File::create(out).with_context(|| format!("không tạo được {out}"))?);
    let period = Duration::from_millis(1_000 / rate.clamp(1, 4));
    let end = Instant::now() + Duration::from_secs(seconds);
    let mut result = Ok(());
    while Instant::now() < end && result.is_ok() {
        let started = Instant::now();
        let s = reader.tick(calibrate);
        let t = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs_f64();
        let line = if mode == "stats" {
            serde_json::json!({
                "t": t, "pass": format!("{:?}", s.pass), "ms": s.pass_ms, "elements": s.elements,
                "status": format!("{:?}", s.status), "tiles": s.tiles.len(), "timeouts": reader.timeouts(),
            })
        } else {
            serde_json::json!({"t": t, "lines": reader.dump_windows()})
        };
        result = writeln!(file, "{line}");
        std::thread::sleep(period.saturating_sub(started.elapsed()));
    }
    reader.release_all();
    result?;
    file.flush()?;
    Ok(())
}
