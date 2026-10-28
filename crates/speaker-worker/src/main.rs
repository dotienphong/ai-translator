//! Tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1): đọc `Request` từ stdin (một luồng riêng), nhận mẫu
//! của bộ đọc tên (luồng riêng, kế hoạch 04), xử lý mọi việc trên một luồng chính và ghi `Response` ra stdout. stdout chỉ dùng cho
//! khung giao thức (`platform::protocol_stdout`). Khung hỏng hay lỗi ghi làm worker thoát với mã 1; app tự khởi động lại. Không có
//! mã mạng (CI kiểm cây phụ thuộc, kế hoạch 02b).

use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::sync::Arc;
use std::sync::mpsc::{self, TrySendError};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use speaker_protocol::{PROTOCOL_VERSION, Request, read_frame, write_frame};
use speaker_worker::embed::Embedder;
use speaker_worker::platform;
use speaker_worker::reader::{self, Control, Sample};
use speaker_worker::session::{Step, Worker};

/// Stack của luồng chính (nhúng giọng chạy trên luồng này): phòng xa cho Windows, nơi luồng chính chỉ có 1 MiB.
const STACK_BYTES: usize = 16 << 20;
/// Chờ luồng đọc tên trả `AXEnhancedUserInterface` khi worker thoát (QĐ 8); quá thì thoát luôn, dấu trong file còn đó.
const READER_EXIT_WAIT: Duration = Duration::from_secs(1);
/// Kênh sự kiện của luồng chính có giới hạn (QĐ 29): luồng stdin chờ khi đầy (áp lực ngược tới hàng ghi của app như trước); mẫu của
/// bộ đọc gửi bằng `try_send`, đầy thì bỏ.
const EVENT_QUEUE: usize = 32;

/// Việc tới luồng chính.
enum Event {
    /// Khung của app, kèm giờ hệ thống lúc đọc xong.
    Request(Request, u64),
    /// stdin đóng ở ranh giới khung.
    Closed,
    /// Khung hỏng.
    Broken(String),
    Sample(Sample),
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn main() -> Result<()> {
    // Việc đầu tiên trên Windows: chỉ nạp DLL từ thư mục app và System32.
    #[cfg(windows)]
    platform::harden_dll_search()?;
    // App luôn đặt `RAYON_NUM_THREADS=2` (spec §4.1). Thiếu biến, rỗng hay không phải số nguyên dương thì đặt lại 2.
    let threads_ok = std::env::var("RAYON_NUM_THREADS")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .is_some_and(|n| n > 0);
    if !threads_ok {
        // SAFETY: đầu `main`, chưa có luồng nào khác đọc hay ghi môi trường.
        unsafe { std::env::set_var("RAYON_NUM_THREADS", "2") };
    }
    let protocol = platform::protocol_stdout()?;
    // QĐ 26: app chép stderr của worker vào log; dòng này cho biết bản worker nói giao thức nào khi app thấy worker thoát trước `Ready`.
    eprintln!("speaker-worker: giao thức phiên bản {PROTOCOL_VERSION}");
    platform::lower_priority();
    platform::init_compute_pool().context("không dựng được bộ luồng tính toán")?;
    eprintln!("speaker-worker: {} luồng tính toán", rayon::current_num_threads());
    std::thread::Builder::new()
        .name("speaker-worker".into())
        .stack_size(STACK_BYTES)
        .spawn(move || serve(protocol))?
        .join()
        .map_err(|_| anyhow!("luồng chính của worker dừng bất thường"))?
}

fn serve(protocol: std::fs::File) -> Result<()> {
    platform::utility_qos_for_this_thread();
    let (tx, rx) = mpsc::sync_channel::<Event>(EVENT_QUEUE);
    let input = tx.clone();
    std::thread::Builder::new()
        .name("speaker-stdin".into())
        .spawn(move || {
            let mut stdin = BufReader::new(std::io::stdin().lock());
            loop {
                let event = match read_frame::<_, Request>(&mut stdin) {
                    Ok(Some(r)) => Event::Request(r, unix_ms()),
                    Ok(None) => Event::Closed,
                    Err(e) => Event::Broken(e.to_string()),
                };
                let last = !matches!(event, Event::Request(..));
                if input.send(event).is_err() || last {
                    break;
                }
            }
        })?;
    let mut output = BufWriter::new(protocol);
    let mut worker = Worker::new(|path: &Path, sha256: Option<&str>| Embedder::load_checked(path, sha256));
    let control = Arc::new(Control::default());
    let mut reader: Option<JoinHandle<()>> = None;
    let outcome = loop {
        let Ok(event) = rx.recv() else { break Ok(()) };
        let replies = match event {
            Event::Request(request, at) => match worker.handle_at(request, at) {
                Step::Exit => break Ok(()),
                Step::Reply(r) => r,
            },
            Event::Sample(sample) => worker.sample(sample),
            Event::Closed => break Ok(()),
            Event::Broken(why) => break Err(anyhow!("khung từ app hỏng: {why}")),
        };
        if let Err(e) = replies.iter().try_for_each(|r| write_frame(&mut output, r)) {
            break Err(e.into());
        }
        if reader.is_none()
            && let Some(setup) = worker.reader_setup()
        {
            let samples = tx.clone();
            let sink = move |s| !matches!(samples.try_send(Event::Sample(s)), Err(TrySendError::Disconnected(_)));
            reader = reader::spawn(setup, control.clone(), Box::new(sink));
        }
        control.set(worker.control_state(unix_ms()));
    };
    control.stop();
    if let Some(handle) = reader {
        let since = Instant::now();
        while !handle.is_finished() && since.elapsed() < READER_EXIT_WAIT {
            std::thread::sleep(Duration::from_millis(10));
        }
        if handle.is_finished() {
            let _ = handle.join();
        }
    }
    eprintln!("{}", worker.summary());
    outcome
}
