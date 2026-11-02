//! `tts-worker`: tiến trình phụ đọc bản dịch (spec 2026-11-02-doc-ban-dich-tts-design §4).
//! Giao thức: khung postcard của `tts-protocol` trên stdin/stdout; stdout CHỈ chứa khung giao thức. Log (số liệu, không
//! có chữ của người dùng) ra stderr. Nạp model lười ở lần đọc đầu tiên.
//!
//! Dòng lệnh: `--model-dir <onnx_update> --codec-dir <moss-codec> --g2p-dict <sea_g2p.bin> --voices <voices_v3_turbo.json>
//! [--ort-lib <onnxruntime.dll>] [--threads N] [--seed N]`.

use std::collections::HashSet;
use std::io::Write;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use tts_protocol::{ErrorKind, PROTOCOL_VERSION, Request, Response, read_frame, write_frame};
use tts_worker::engine::{Cancelled, Engine};
use tts_worker::phonemize::Phonemizer;
use tts_worker::synth::{Synth, to_i16};
use tts_worker::voices::Voices;

/// 0,2 s PCM mỗi khung: app phát mượt, khung nhỏ vẫn đủ gọn.
const CHUNK_SAMPLES: usize = 9_600;

struct Args {
    model_dir: PathBuf,
    codec_dir: PathBuf,
    g2p_dict: PathBuf,
    voices: PathBuf,
    ort_lib: Option<PathBuf>,
    threads: usize,
    seed: u64,
    stream: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut m = std::collections::HashMap::new();
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        let v = it.next().ok_or_else(|| format!("thiếu giá trị cho {k}"))?;
        m.insert(k, v);
    }
    let path = |k: &str| m.get(k).map(PathBuf::from).ok_or_else(|| format!("thiếu {k}"));
    Ok(Args {
        model_dir: path("--model-dir")?,
        codec_dir: path("--codec-dir")?,
        g2p_dict: path("--g2p-dict")?,
        voices: path("--voices")?,
        ort_lib: m.get("--ort-lib").map(PathBuf::from),
        threads: m.get("--threads").and_then(|v| v.parse().ok()).unwrap_or(0),
        seed: m.get("--seed").and_then(|v| v.parse().ok()).unwrap_or(0x5eed),
        stream: m.get("--stream").is_none_or(|v| v != "0"),
    })
}

enum Msg {
    Req(Request),
    Eof,
}

fn load(a: &Args) -> Result<Synth, Box<dyn std::error::Error>> {
    let engine = Engine::load(&a.model_dir, &a.codec_dir, a.ort_lib.as_deref(), a.threads)?;
    let phon = Phonemizer::open(a.g2p_dict.to_str().ok_or("g2p-dict không phải UTF-8")?)?;
    let voices = Voices::load(&a.voices, engine.cfg.n_vq)?;
    let mut synth = Synth::new(engine, phon, voices, a.seed);
    synth.stream = a.stream;
    Ok(synth)
}

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("tts-worker: {e}");
            return ExitCode::from(2);
        }
    };
    let cancels: Arc<Mutex<HashSet<u64>>> = Arc::default();
    let shutdown = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<Msg>();

    // Luồng đọc: Cancel và Shutdown có hiệu lực ngay cả khi luồng chính đang sinh.
    {
        let (cancels, shutdown) = (cancels.clone(), shutdown.clone());
        std::thread::spawn(move || {
            let mut stdin = std::io::stdin().lock();
            loop {
                match read_frame::<Request, _>(&mut stdin) {
                    Ok(Some(req)) => {
                        if req.validate().is_err() {
                            eprintln!("tts-worker: bỏ khung vi phạm giới hạn");
                            let _ = tx.send(Msg::Eof);
                            return;
                        }
                        match req {
                            Request::Cancel { id } => {
                                cancels.lock().unwrap().insert(id);
                            }
                            Request::Shutdown => {
                                shutdown.store(true, Ordering::SeqCst);
                                let _ = tx.send(Msg::Eof);
                                return;
                            }
                            r => {
                                let _ = tx.send(Msg::Req(r));
                            }
                        }
                    }
                    Ok(None) | Err(_) => {
                        shutdown.store(true, Ordering::SeqCst);
                        let _ = tx.send(Msg::Eof);
                        return;
                    }
                }
            }
        });
    }

    let mut out = std::io::stdout().lock();
    if write_frame(
        &mut out,
        &Response::Ready {
            protocol: PROTOCOL_VERSION,
        },
    )
    .is_err()
    {
        return ExitCode::from(1);
    }
    let mut synth: Option<Synth> = None;
    let mut warmed = false;
    while let Ok(msg) = rx.recv() {
        let (id, text, voice) = match msg {
            Msg::Req(Request::Speak { id, text, voice, .. }) => (id, text, voice),
            Msg::Req(Request::Warmup { id }) => {
                if synth.is_none() {
                    match load(&args) {
                        Ok(s) => synth = Some(s),
                        Err(e) => {
                            eprintln!("tts-worker: không nạp được model: {e}");
                            let _ = write_frame(
                                &mut out,
                                &Response::Failed {
                                    id,
                                    kind: ErrorKind::ModelMissing,
                                },
                            );
                            continue;
                        }
                    }
                }
                // Nạp xong chưa đủ nóng: lần suy luận đầu của ONNX còn khởi tạo nhân tính toán (câu đầu trễ vài giây). Đọc nháp một câu
                // ngắn, bỏ âm thanh, để câu thật đầu tiên chạy ở tốc độ bình thường. Lỗi ở đây không quan trọng.
                if let Some(s) = synth.as_mut() {
                    if !warmed {
                        warmed = true;
                        let stop = || shutdown.load(Ordering::SeqCst);
                        let _ = s.speak("Xin chào.", None, &stop, &mut |_pcm: &[f32]| Ok(()));
                    }
                }
                let _ = write_frame(&mut out, &Response::Done { id });
                continue;
            }
            _ => break,
        };
        if cancels.lock().unwrap().remove(&id) {
            let _ = write_frame(
                &mut out,
                &Response::Failed {
                    id,
                    kind: ErrorKind::Cancelled,
                },
            );
            continue;
        }
        if synth.is_none() {
            match load(&args) {
                Ok(s) => synth = Some(s),
                Err(e) => {
                    eprintln!("tts-worker: không nạp được model: {e}");
                    let _ = write_frame(
                        &mut out,
                        &Response::Failed {
                            id,
                            kind: ErrorKind::ModelMissing,
                        },
                    );
                    continue;
                }
            }
        }
        let s = synth.as_mut().expect("vừa nạp");
        let is_cancelled = || shutdown.load(Ordering::SeqCst) || cancels.lock().unwrap().contains(&id);
        let mut seq = 0u32;
        let result = s.speak(&text, voice.as_deref(), &is_cancelled, &mut |pcm: &[f32]| {
            for chunk in pcm.chunks(CHUNK_SAMPLES) {
                write_frame(
                    &mut out,
                    &Response::Audio {
                        id,
                        seq,
                        pcm: to_i16(chunk),
                    },
                )?;
                seq += 1;
            }
            Ok(())
        });
        cancels.lock().unwrap().remove(&id);
        let resp = match result {
            Ok(st) => {
                let ms = |d: std::time::Duration| d.as_secs_f32() * 1000.0;
                eprintln!(
                    "tts-worker: đọc xong id={id}: {} đoạn, {} khung, {} lần sinh lại, khung đầu sau {} ms, tổng {} ms, {:.2}s âm thanh | prefill {:.0} ms, decode_step {:.0} ms, acoustic {:.0} ms, đầu ra+lấy mẫu {:.0} ms, codec {:.0} ms",
                    st.units,
                    st.frames,
                    st.retries,
                    st.first_audio_ms,
                    st.gen_ms,
                    st.audio_samples as f32 / 48_000.0,
                    ms(st.prof.prefill),
                    ms(st.prof.decode_step),
                    ms(st.prof.acoustic),
                    ms(st.prof.heads_sampling),
                    ms(st.prof.codec)
                );
                Response::Done { id }
            }
            Err(e) if e.is::<Cancelled>() => Response::Failed {
                id,
                kind: ErrorKind::Cancelled,
            },
            Err(e) => {
                eprintln!("tts-worker: lỗi suy luận id={id}: {e}");
                Response::Failed {
                    id,
                    kind: ErrorKind::Inference,
                }
            }
        };
        if write_frame(&mut out, &resp).is_err() {
            break;
        }
    }
    let _ = out.flush();
    ExitCode::SUCCESS
}
