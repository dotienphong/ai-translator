//! Tiến trình phụ `asr-worker`: đọc `Request` từ stdin, ghi `Response` ra stdout (spec §6.4).
//! stdout chỉ dùng cho khung giao thức; mọi log đều ra stderr. whisper.cpp và ggml tự ghi log ra stderr, nên không
//! gọi `whisper_rs::install_logging_hooks`: khi không bật feature `log_backend`, hàm đó nuốt mất log (kể cả lỗi GPU).

use anyhow::Result;
use asr_protocol::{Request, Response, read_frame, write_frame};
use asr_worker::engine::Engine;
use std::io::{BufReader, BufWriter};

fn main() -> Result<()> {
    if std::env::args().any(|a| a == "--probe") {
        return probe();
    }
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(std::io::stdout().lock());
    let mut engine: Option<Engine> = None;

    while let Some(request) = read_frame::<_, Request>(&mut input)? {
        let response = match request {
            Request::Load {
                model_path,
                use_gpu,
                n_threads,
            } => match Engine::load(&model_path, use_gpu, n_threads) {
                Ok(e) => {
                    let ready = Response::Ready {
                        backend: backend_name(use_gpu).to_string(),
                        decode_mode: e.decode_mode().to_string(),
                        whisper_version: whisper_rs::WHISPER_CPP_VERSION.to_string(),
                        system_info: whisper_rs::print_system_info().to_string(),
                    };
                    engine = Some(e);
                    ready
                }
                Err(e) => Response::Error {
                    segment_id: None,
                    message: format!("{e:#}"),
                },
            },
            Request::Warmup => match engine.as_mut() {
                Some(e) => match e.warmup() {
                    Ok(millis) => Response::WarmupDone { millis },
                    Err(err) => Response::Error {
                        segment_id: None,
                        message: format!("{err:#}"),
                    },
                },
                None => not_loaded(None),
            },
            Request::Transcribe(req) => match engine.as_mut() {
                Some(e) => match e.transcribe(&req) {
                    Ok(result) => Response::Result(result),
                    Err(err) => Response::Error {
                        segment_id: Some(req.segment_id),
                        message: format!("{err:#}"),
                    },
                },
                None => not_loaded(Some(req.segment_id)),
            },
            Request::Shutdown => break,
        };
        write_frame(&mut output, &response)?;
    }
    Ok(())
}

fn not_loaded(segment_id: Option<u64>) -> Response {
    Response::Error {
        segment_id,
        message: "chưa nạp model".into(),
    }
}

fn backend_name(use_gpu: bool) -> &'static str {
    match (use_gpu, cfg!(feature = "metal"), cfg!(feature = "vulkan")) {
        (true, true, _) => "metal",
        (true, _, true) => "vulkan",
        _ => "cpu",
    }
}

#[cfg(feature = "vulkan")]
fn probe() -> Result<()> {
    println!("{}", serde_json::to_string(&asr_worker::probe::list_gpus()?)?);
    Ok(())
}

#[cfg(not(feature = "vulkan"))]
fn probe() -> Result<()> {
    println!("[]");
    Ok(())
}
