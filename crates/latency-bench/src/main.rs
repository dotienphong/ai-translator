//! Công cụ đo: `latency` (S6), `asr-eval` (S7, A4), `mt-eval` (A3, qua đúng code dịch của app), `session` (đo bằng
//! `pipeline::Engine` thật, spec 2026-10-10 §10.1), `speaker-eval` (nhận giọng, spec 2026-10-26-phan-biet-nguoi-noi §12), `speaker-names-eval` (ghép tên, tách giọng),
//! `embed-probe` (thời gian, CPU mỗi lần nhúng giọng).

mod aec;
mod asr_eval;
mod denoise;
mod embed_probe;
mod latency;
mod mix_eval;
mod mt_eval;
mod names_eval;
mod session;
mod session_metrics;
mod session_replay;
mod speaker_eval;
mod stats;
mod wavio;

use clap::Parser;

// Phân tích đúng một lần khi chạy lệnh nên kích thước của enum không đáng kể; trên Windows `LatencyArgs` lớn hơn hẳn các
// biến thể khác (kích thước của `OsString` khác macOS) và clippy báo lỗi.
#[allow(clippy::large_enum_variant)]
#[derive(Parser)]
enum Command {
    /// Đo độ trễ tổng thể trên một session phát lại theo thời gian thực.
    Latency(latency::LatencyArgs),
    /// Chép lời bộ clip A4 để tính WER/CER.
    AsrEval(asr_eval::AsrEvalArgs),
    /// Dịch bộ test A3 bằng code dịch của app, để score_mt.py chấm COMET.
    MtEval(mt_eval::MtEvalArgs),
    /// Đo độ trễ bằng `pipeline::Engine` thật trên một session phát lại theo thời gian thực (spec 2026-10-10 §10.1).
    Session(session::SessionArgs),
    /// Căn một bản thu đã xử lý ngoài thẳng hàng với `mic.wav` (spike nguồn micro).
    Align(wavio::AlignArgs),
    /// Lọc ồn micro bằng RNNoise cho bản VAD (spike nguồn micro).
    Denoise(denoise::DenoiseArgs),
    /// Khử vọng micro bằng AEC3 (phương án C của spike nguồn micro).
    Aec(aec::AecArgs),
    /// Chấm các phương án trộn và chống ồn trên bản thu của một cảnh (spike nguồn micro).
    MixEval(mix_eval::MixEvalArgs),
    /// Nhận giọng người nói trên một bản ghi: cắt đoạn như app, nhúng (trong tiến trình hay qua speaker-worker thật), phân cụm (spec 2026-10-26-phan-biet-nguoi-noi §12).
    SpeakerEval(speaker_eval::SpeakerEvalArgs),
    /// Ghép tên và tách giọng của speaker-worker trên cache nhúng, với bộ đọc tên giả dựng từ RTTM (kế hoạch 04 Task 11).
    SpeakerNamesEval(names_eval::NamesEvalArgs),
    /// Nhúng giọng lặp lại trên một đoạn WAV, in thời gian và CPU mỗi lần (đo RSS đỉnh bằng `/usr/bin/time -l`).
    EmbedProbe(embed_probe::EmbedProbeArgs),
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
            Command::MtEval(args) => mt_eval::run(args),
            Command::Session(args) => session::run(args),
            Command::Align(args) => wavio::run_align(args),
            Command::Denoise(args) => denoise::run(args),
            Command::Aec(args) => aec::run(args),
            Command::MixEval(args) => mix_eval::run(args),
            Command::SpeakerEval(args) => speaker_eval::run(args),
            Command::SpeakerNamesEval(args) => names_eval::run(args),
            Command::EmbedProbe(args) => embed_probe::run(args),
        })?;
    worker.join().map_err(|_| anyhow::anyhow!("luồng chạy lệnh bị panic"))?
}
