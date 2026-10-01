//! Tiến trình phụ `asr-worker`: đọc `Request` từ stdin, ghi `Response` ra stdout (spec §6.4).
//! stdout chỉ dùng cho khung giao thức: ngay khi chạy, worker giữ riêng stdout cho giao thức và trỏ fd 1 sang stderr
//! (`platform::protocol_stdout`), nên log lạ của thư viện C không lọt vào kênh giao thức. Log của whisper.cpp và ggml đi
//! qua `native_log` (vẫn ra stderr, và giữ các dòng lỗi gần nhất để phân loại lỗi). Không gọi
//! `whisper_rs::install_logging_hooks`: khi không bật feature `log_backend`, hàm đó nuốt mất log (kể cả lỗi GPU).

use anyhow::Result;
use asr_protocol::{ErrorKind, PROTOCOL_VERSION, Request, Response, read_frame, write_frame};
use asr_worker::backend::real_backend;
use asr_worker::engine::{Engine, classify};
use std::io::{BufReader, BufWriter};

/// Vòng lặp giao thức. Mọi lỗi đọc khung (I/O, khung quá lớn, `Codec`, `TrailingBytes`) đều làm worker thoát ngay với
/// mã 1, kể cả khi luồng vẫn còn đồng bộ (`Codec`, `TrailingBytes`). App tự khởi động lại worker, nên không cố đọc tiếp.
fn main() -> Result<()> {
    #[cfg(windows)]
    asr_worker::platform::harden_dll_search()?;
    if std::env::args().any(|a| a == "--probe") {
        return probe();
    }
    let protocol = asr_worker::platform::protocol_stdout()?;
    asr_worker::native_log::install();
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(protocol);
    let mut engine: Option<Engine> = None;

    while let Some(request) = read_frame::<_, Request>(&mut input)? {
        asr_worker::native_log::clear();
        let response = match request {
            Request::Load {
                model_path,
                use_gpu,
                n_threads,
            } => match Engine::load(&model_path, use_gpu, n_threads) {
                Ok(e) => {
                    let backend = real_backend(use_gpu);
                    eprintln!(
                        "asr-worker: backend={} flash_attn={} decode_mode={}",
                        backend.as_str(),
                        if e.flash_attn() { "on" } else { "off" },
                        e.decode_mode().as_str()
                    );
                    // Dòng riêng, để dòng trên giữ nguyên định dạng cũ (các phép kiểm log tìm đúng dòng đó).
                    eprintln!("asr-worker: primer={}", if e.primer_enabled() { "on" } else { "off" });
                    let ready = Response::Ready {
                        protocol_version: PROTOCOL_VERSION,
                        backend,
                        decode_mode: e.decode_mode(),
                        whisper_version: whisper_rs::WHISPER_CPP_VERSION.to_string(),
                        system_info: whisper_rs::print_system_info().to_string(),
                    };
                    engine = Some(e);
                    ready
                }
                Err(e) => Response::Error {
                    segment_id: None,
                    kind: classify(ErrorKind::ModelLoad, &e),
                    message: asr_worker::native_log::describe(&e),
                },
            },
            Request::Warmup => match engine.as_mut() {
                Some(e) => match e.warmup() {
                    Ok(millis) => Response::WarmupDone { millis },
                    Err(err) => Response::Error {
                        segment_id: None,
                        kind: classify(ErrorKind::Internal, &err),
                        message: asr_worker::native_log::describe(&err),
                    },
                },
                None => not_loaded(None),
            },
            Request::Transcribe(req) => match engine.as_mut() {
                Some(e) => match e.transcribe(&req) {
                    Ok(result) => Response::Result(result),
                    Err((kind, err)) => Response::Error {
                        segment_id: Some(req.segment_id),
                        kind,
                        message: asr_worker::native_log::describe(&err),
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
        kind: ErrorKind::NotLoaded,
        message: "chưa nạp model".into(),
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
