//! Công cụ đo cho Giai đoạn 0: `latency` (S6) và `asr-eval` (S7, A4).

mod asr_eval;
mod latency;
mod stats;

use clap::Parser;

#[derive(Parser)]
enum Command {
    /// Đo độ trễ tổng thể trên một session phát lại theo thời gian thực.
    Latency(latency::LatencyArgs),
    /// Chép lời bộ clip A4 để tính WER/CER.
    AsrEval(asr_eval::AsrEvalArgs),
}

/// Stack của luồng chạy lệnh. `SileroVad` (candle-onnx) cần hơn 1 MiB ở bản debug (`cargo run`), mà luồng chính của Windows
/// chỉ có 1 MiB. Bản release cần rất ít, nhưng không nên phụ thuộc vào điều đó.
const STACK_BYTES: usize = 8 << 20;

fn main() -> anyhow::Result<()> {
    // Phân tích tham số ngay trên luồng chính, để `--help` và lỗi tham số in ra như thường.
    let command = Command::parse();
    let worker = std::thread::Builder::new()
        .name("latency-bench".into())
        .stack_size(STACK_BYTES)
        .spawn(move || match command {
            Command::Latency(args) => latency::run(args),
            Command::AsrEval(args) => asr_eval::run(args),
        })?;
    worker.join().map_err(|_| anyhow::anyhow!("luồng chạy lệnh bị panic"))?
}
