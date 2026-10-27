//! Tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1): đọc `Request` từ stdin, ghi `Response` ra stdout.
//! stdout chỉ dùng cho khung giao thức (`platform::protocol_stdout`). Mọi lỗi đọc hay ghi khung làm worker thoát với mã 1;
//! app tự khởi động lại. Không có mã mạng (CI kiểm cây phụ thuộc, kế hoạch 02b).

use std::io::{BufReader, BufWriter};
use std::path::Path;

use anyhow::{Context, Result, anyhow};
use speaker_protocol::{Request, read_frame, write_frame};
use speaker_worker::embed::Embedder;
use speaker_worker::platform;
use speaker_worker::session::{Step, Worker};

/// Stack của luồng chạy vòng khung (nhúng giọng chạy trên luồng này): phòng xa cho Windows, nơi luồng chính chỉ có 1 MiB.
const STACK_BYTES: usize = 16 << 20;

fn main() -> Result<()> {
    // Việc đầu tiên trên Windows: chỉ nạp DLL từ thư mục app và System32.
    #[cfg(windows)]
    platform::harden_dll_search()?;
    // App luôn đặt `RAYON_NUM_THREADS=2` (spec §4.1). Thiếu biến, rỗng hay không phải số nguyên dương (chạy tay, lỗi ở app) thì
    // rayon và candle-core (đọc biến này mỗi lần nhân ma trận) dùng mọi lõi, trái ngân sách CPU (§11): đặt lại 2. Đọc như hai thư
    // viện đó (`usize::from_str`, phải > 0), nên giá trị nào chúng nhận thì worker giữ nguyên.
    let threads_ok = std::env::var("RAYON_NUM_THREADS")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .is_some_and(|n| n > 0);
    if !threads_ok {
        // SAFETY: đầu `main`, chưa có luồng nào khác đọc hay ghi môi trường.
        unsafe { std::env::set_var("RAYON_NUM_THREADS", "2") };
    }
    let protocol = platform::protocol_stdout()?;
    platform::lower_priority();
    platform::init_compute_pool().context("không dựng được bộ luồng tính toán")?;
    // Số luồng thật vào log (02b, soak test đọc được).
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
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(protocol);
    let mut worker = Worker::new(|path: &Path, sha256: Option<&str>| Embedder::load_checked(path, sha256));
    while let Some(request) = read_frame::<_, Request>(&mut input)? {
        match worker.handle(request) {
            Step::Exit => break,
            Step::Reply(responses) => {
                for r in &responses {
                    write_frame(&mut output, r)?;
                }
            }
        }
    }
    eprintln!("{}", worker.summary());
    Ok(())
}
