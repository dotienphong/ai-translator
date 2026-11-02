//! Worker giả cho test của `tts-client`: nói đúng giao thức, hành vi chọn theo chữ nhận được.
//! `crash` thoát bất ngờ; `model` trả ModelMissing; `slow` phát 20 đoạn chậm và nghe được Cancel; còn lại trả 3 đoạn rồi Done.
//! Biến môi trường: `FAKE_PROTOCOL=<số>` báo sai phiên bản; `FAKE_NO_READY=1` không báo Ready.

use std::collections::HashSet;
use std::io::Write;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tts_protocol::{ErrorKind, PROTOCOL_VERSION, Request, Response, read_frame, write_frame};

fn main() {
    let cancels: Arc<Mutex<HashSet<u64>>> = Arc::default();
    let (tx, rx) = mpsc::channel::<Request>();
    {
        let cancels = cancels.clone();
        std::thread::spawn(move || {
            let mut stdin = std::io::stdin().lock();
            while let Ok(Some(req)) = read_frame::<Request, _>(&mut stdin) {
                match req {
                    Request::Cancel { id } => {
                        cancels.lock().unwrap().insert(id);
                    }
                    Request::Shutdown => std::process::exit(0),
                    r => {
                        let _ = tx.send(r);
                    }
                }
            }
            std::process::exit(0);
        });
    }
    let mut out = std::io::stdout().lock();
    if std::env::var("FAKE_NO_READY").is_err() {
        let proto = std::env::var("FAKE_PROTOCOL")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(PROTOCOL_VERSION);
        write_frame(&mut out, &Response::Ready { protocol: proto }).unwrap();
    }
    while let Ok(req) = rx.recv() {
        match req {
            Request::Warmup { id } => write_frame(&mut out, &Response::Done { id }).unwrap(),
            Request::Speak { id, text, .. } => {
                if cancels.lock().unwrap().remove(&id) {
                    write_frame(
                        &mut out,
                        &Response::Failed {
                            id,
                            kind: ErrorKind::Cancelled,
                        },
                    )
                    .unwrap();
                    continue;
                }
                match text.as_str() {
                    "crash" => std::process::exit(3),
                    "model" => {
                        write_frame(
                            &mut out,
                            &Response::Failed {
                                id,
                                kind: ErrorKind::ModelMissing,
                            },
                        )
                        .unwrap();
                    }
                    "slow" => {
                        let mut cancelled = false;
                        for seq in 0..20u32 {
                            if cancels.lock().unwrap().remove(&id) {
                                cancelled = true;
                                break;
                            }
                            write_frame(
                                &mut out,
                                &Response::Audio {
                                    id,
                                    seq,
                                    pcm: vec![1; 100],
                                },
                            )
                            .unwrap();
                            std::thread::sleep(Duration::from_millis(30));
                        }
                        let r = if cancelled {
                            Response::Failed {
                                id,
                                kind: ErrorKind::Cancelled,
                            }
                        } else {
                            Response::Done { id }
                        };
                        write_frame(&mut out, &r).unwrap();
                    }
                    t => {
                        for seq in 0..3u32 {
                            write_frame(
                                &mut out,
                                &Response::Audio {
                                    id,
                                    seq,
                                    pcm: vec![seq as i16; t.len().max(1)],
                                },
                            )
                            .unwrap();
                        }
                        write_frame(&mut out, &Response::Done { id }).unwrap();
                    }
                }
            }
            _ => {}
        }
        out.flush().unwrap();
    }
}
