//! Công cụ đo và ghi của bộ đọc tên trên Windows (kế hoạch 05 Task 7; chỉ Windows): chạy đúng bộ đọc của `speaker-worker` (công thức
//! build sẵn hay `--recipe <file>`) trên một app họp đang chạy, `--rate` lượt mỗi giây, trong `--seconds` giây, rồi thoát. Chỉ đọc,
//! không bấm gì, không cần quyền quản trị (app họp và công cụ phải cùng mức quyền, thường cả hai chạy quyền người dùng thường).
//!
//!   uia-record stats <app> <ra.jsonl> [--rate 1|4] [--seconds 60] [--recipe <file>] [--calibrate]
//!       mỗi lượt một dòng {"t", "pass", "ms", "elements", "status", "tiles", "timeouts", "denied"}: không có tên người
//!   uia-record fixture <app> <ra.jsonl> [--rate 1|4] [--seconds 60] [--recipe <file>]
//!       mỗi lượt một ảnh chụp cây của cửa sổ họp (tối đa `--rate` lần mỗi giây; mỗi lần chụp cả cây có thể mất hơn 250 ms), định dạng fixture: CÓ TÊN THẬT VÀ CHỮ CỦA APP HỌP, chỉ ghi vào thư mục dữ liệu, ẩn
//!       danh bằng scripts/speaker-recipes/make_fixture.py trước khi vào repo
//!
//! <app>: teams | zoom | meet_chrome | meet_edge. Công thức build sẵn chưa có mục Windows (kế hoạch 05 QĐ 8): cần `--recipe`.
//! `--calibrate`: mỗi lượt đọc cả ứng viên tự hiệu chỉnh, như worker khi đang tìm hay đã học được chỉ báo.

#[cfg(not(windows))]
fn main() {
    eprintln!("uia-record chỉ chạy trên Windows");
    std::process::exit(2);
}

#[cfg(windows)]
fn main() -> anyhow::Result<()> {
    use std::io::Write;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use anyhow::{Context, bail};
    use speaker_protocol::MeetingApp;
    use speaker_recipe::Os;
    use speaker_worker::reader::uia::{ComGuard, LiveReader};

    const USAGE: &str = "cách dùng: uia-record stats|fixture <teams|zoom|meet_chrome|meet_edge> <ra.jsonl> [--rate 1|4] \
                         [--seconds N] [--recipe <file>] [--calibrate]";
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
    let calibrate = args.iter().any(|a| a == "--calibrate");
    let recipe_json = match opt("--recipe") {
        Some(p) => std::fs::read_to_string(&p).with_context(|| format!("không đọc được {p}"))?,
        None => speaker_recipe::BUILTIN_JSON.to_string(),
    };
    let recipes = speaker_recipe::parse(&recipe_json)?;
    if recipes.app(Os::Windows, app).is_none() {
        bail!(
            "công thức không có mục Windows cho {app:?} (bỏ: {:?}); dùng --recipe <file>",
            recipes.dropped
        );
    }
    let _com = ComGuard::init();
    let mut reader = LiveReader::new(std::sync::Arc::new(recipes), Some(app))
        .map_err(|e| anyhow::anyhow!("không khởi tạo được UI Automation (0x{:08X})", e.code().0 as u32))?;
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
                "status": format!("{:?}", s.status), "tiles": s.tiles.len(),
                "timeouts": reader.timeouts(), "denied": reader.denied(),
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
