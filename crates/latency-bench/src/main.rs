//! Công cụ đo cho Giai đoạn 0. Bước này mới có `asr-eval` (A4); `latency` (S6) thêm ở kế hoạch 06.

mod asr_eval;

use clap::Parser;

#[derive(Parser)]
enum Command {
    /// Chép lời bộ clip A4 để tính WER/CER.
    AsrEval(asr_eval::AsrEvalArgs),
}

fn main() -> anyhow::Result<()> {
    match Command::parse() {
        Command::AsrEval(args) => asr_eval::run(args),
    }
}
