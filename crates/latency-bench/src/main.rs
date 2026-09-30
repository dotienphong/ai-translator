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

fn main() -> anyhow::Result<()> {
    match Command::parse() {
        Command::Latency(args) => latency::run(args),
        Command::AsrEval(args) => asr_eval::run(args),
    }
}
