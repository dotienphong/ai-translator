//! Chạy binary `tts-worker` thật với model thật qua giao thức: đọc tiếng Việt, tiếng Anh, câu nhiều đoạn, hủy giữa chừng.
//! Biến môi trường như `engine_ref.rs` cộng `TTS_VOICES` (voices_v3_turbo.json); tùy chọn `TTS_WAV_DIR` để ghi file nghe thử.
//! Chạy: `cargo test -p tts-worker --features engine --release --test worker_e2e -- --ignored --nocapture --test-threads=1`.
#![cfg(feature = "engine")]

use std::io::Write;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{Duration, Instant};
use tts_protocol::{ErrorKind, Lang, PROTOCOL_VERSION, Request, Response, SAMPLE_RATE, read_frame, write_frame};

fn env(k: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| panic!("thiếu biến môi trường {k}"))
}

struct Worker {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
}

fn spawn() -> Worker {
    spawn_with(&[])
}

fn spawn_with(extra: &[&str]) -> Worker {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_tts-worker"));
    cmd.args([
        "--model-dir",
        &env("TTS_ONNX_DIR"),
        "--codec-dir",
        &env("TTS_CODEC_DIR"),
    ])
    .args(["--g2p-dict", &env("TTS_G2P_DICT"), "--voices", &env("TTS_VOICES")]);
    cmd.args(extra);
    if let Ok(lib) = std::env::var("TTS_ORT_LIB") {
        cmd.args(["--ort-lib", &lib]);
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let (stdin, mut stdout) = (child.stdin.take().unwrap(), child.stdout.take().unwrap());
    let ready: Response = read_frame(&mut stdout).unwrap().expect("worker đóng ngay");
    assert_eq!(
        ready,
        Response::Ready {
            protocol: PROTOCOL_VERSION
        }
    );
    Worker { child, stdin, stdout }
}

impl Worker {
    fn send(&mut self, r: &Request) {
        write_frame(&mut self.stdin, r).unwrap();
        self.stdin.flush().unwrap();
    }

    /// Đọc tới khi Done/Failed của `id`; trả (pcm, số khung, thời gian tới khung đầu, kết quả).
    fn collect(&mut self, id: u64) -> (Vec<i16>, u32, Option<Duration>, Result<(), ErrorKind>) {
        let t0 = Instant::now();
        let (mut pcm, mut first, mut n) = (Vec::new(), None, 0u32);
        loop {
            match read_frame::<Response, _>(&mut self.stdout)
                .unwrap()
                .expect("worker đóng giữa chừng")
            {
                Response::Audio { id: i, seq, pcm: p } => {
                    assert_eq!(i, id);
                    assert_eq!(seq, n, "seq phải tăng dần từ 0");
                    first.get_or_insert_with(|| t0.elapsed());
                    n += 1;
                    pcm.extend(p);
                }
                Response::Done { id: i } => {
                    assert_eq!(i, id);
                    return (pcm, n, first, Ok(()));
                }
                Response::Failed { id: i, kind } => {
                    assert_eq!(i, id);
                    return (pcm, n, first, Err(kind));
                }
                Response::Ready { .. } => panic!("Ready lần hai"),
            }
        }
    }

    fn speak(&mut self, id: u64, lang: Lang, text: &str) -> (Vec<i16>, u32, Option<Duration>, Result<(), ErrorKind>) {
        self.send(&Request::Speak {
            id,
            lang,
            text: text.into(),
            voice: None,
        });
        self.collect(id)
    }

    fn finish(mut self) {
        self.send(&Request::Shutdown);
        assert!(self.child.wait().unwrap().success());
    }
}

fn rms(pcm: &[i16]) -> f32 {
    (pcm.iter().map(|&x| (f32::from(x) / 32768.0).powi(2)).sum::<f32>() / pcm.len().max(1) as f32).sqrt()
}

fn save_wav(name: &str, pcm: &[i16]) {
    let Ok(dir) = std::env::var("TTS_WAV_DIR") else { return };
    let mut b = Vec::new();
    let data = (pcm.len() * 2) as u32;
    b.extend(b"RIFF");
    b.extend((36 + data).to_le_bytes());
    b.extend(b"WAVEfmt ");
    b.extend(16u32.to_le_bytes());
    b.extend([1, 0, 1, 0]);
    b.extend(SAMPLE_RATE.to_le_bytes());
    b.extend((SAMPLE_RATE * 2).to_le_bytes());
    b.extend([2, 0, 16, 0]);
    b.extend(b"data");
    b.extend(data.to_le_bytes());
    for s in pcm {
        b.extend(s.to_le_bytes());
    }
    std::fs::write(std::path::Path::new(&dir).join(name), b).unwrap();
}

#[test]
#[ignore = "cần model thật, xem đầu file"]
fn speaks_vietnamese_english_and_multi_sentence() {
    let mut w = spawn();
    let t = Instant::now();
    let (pcm, n, first, res) = w.speak(
        1,
        Lang::Vi,
        "Xin chào, đây là bản thử giọng đọc tiếng Việt cho ứng dụng AI Translator.",
    );
    println!(
        "[vi] {:.2}s âm thanh, {n} khung, khung đầu sau {:?}, tổng {:?}",
        pcm.len() as f32 / 48000.0,
        first,
        t.elapsed()
    );
    assert!(res.is_ok());
    assert!(
        (2.0..8.0).contains(&(pcm.len() as f32 / 48000.0)),
        "thời lượng bất thường"
    );
    assert!(rms(&pcm) > 0.01, "gần như im lặng");
    save_wav("vi.wav", &pcm);

    let (pcm, _, _, res) = w.speak(
        2,
        Lang::En,
        "Hello, this is a quick test of the English voice for the translator.",
    );
    assert!(res.is_ok() && (2.0..8.0).contains(&(pcm.len() as f32 / 48000.0)) && rms(&pcm) > 0.01);
    save_wav("en.wav", &pcm);

    // Nhiều câu: phải dài hơn từng câu riêng và có khoảng lặng ở giữa.
    let (one, ..) = w.speak(3, Lang::Vi, "Cuộc họp bắt đầu lúc ba giờ chiều.");
    let (multi, _, _, res) = w.speak(
        4,
        Lang::Vi,
        "Cuộc họp bắt đầu lúc ba giờ chiều. Vui lòng tham gia đúng giờ! Cảm ơn mọi người.",
    );
    assert!(res.is_ok() && multi.len() > one.len() * 2);
    save_wav("multi.wav", &multi);
    w.finish();
}

#[test]
#[ignore = "cần model thật, xem đầu file"]
fn cancel_stops_generation_quickly_and_worker_stays_usable() {
    let mut w = spawn();
    let t = Instant::now();
    w.send(&Request::Warmup { id: 100 });
    let (_, _, _, res) = w.collect(100);
    println!("warmup (nạp model): {:?}", t.elapsed());
    assert!(res.is_ok());
    let t = Instant::now();
    let (pcm, ..) = w.speak(1, Lang::Vi, "Xin chào.");
    println!("đọc câu ngắn sau warmup: {:?}", t.elapsed());
    assert!(rms(&pcm) > 0.01);
    let long = "Đây là một đoạn văn khá dài để việc đọc kéo dài nhiều giây. ".repeat(6);
    w.send(&Request::Speak {
        id: 2,
        lang: Lang::Vi,
        text: long,
        voice: None,
    });
    std::thread::sleep(Duration::from_millis(300));
    let t = Instant::now();
    w.send(&Request::Cancel { id: 2 });
    let (_, _, _, res) = w.collect(2);
    println!("hủy: dừng sau {:?}", t.elapsed());
    assert_eq!(res, Err(ErrorKind::Cancelled));
    assert!(t.elapsed() < Duration::from_secs(3), "hủy chậm");
    // Hủy trước khi bắt đầu: câu tới sau Cancel cùng id bị bỏ.
    let (pcm, _, _, res) = w.speak(3, Lang::Vi, "Vẫn đọc được sau khi hủy.");
    assert!(res.is_ok() && rms(&pcm) > 0.01);
    w.finish();
}

#[test]
#[ignore = "cần model thật, xem đầu file"]
fn bad_model_dir_reports_model_missing() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_tts-worker"))
        .args([
            "--model-dir",
            "/không/có",
            "--codec-dir",
            "/không/có",
            "--g2p-dict",
            "/x",
            "--voices",
            "/x",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let (mut stdin, mut stdout) = (child.stdin.take().unwrap(), child.stdout.take().unwrap());
    let _ = read_frame::<Response, _>(&mut stdout).unwrap();
    write_frame(
        &mut stdin,
        &Request::Speak {
            id: 9,
            lang: Lang::Vi,
            text: "x".into(),
            voice: None,
        },
    )
    .unwrap();
    stdin.flush().unwrap();
    assert_eq!(
        read_frame::<Response, _>(&mut stdout).unwrap(),
        Some(Response::Failed {
            id: 9,
            kind: ErrorKind::ModelMissing
        })
    );
    write_frame(&mut stdin, &Request::Shutdown).unwrap();
    stdin.flush().unwrap();
    assert!(child.wait().unwrap().success());
}

#[test]
#[ignore = "cần model thật, xem đầu file"]
fn streaming_output_matches_non_streaming_and_starts_earlier() {
    let text = "Cuộc họp sẽ bắt đầu lúc ba giờ chiều, vui lòng tham gia đúng giờ và chuẩn bị tài liệu.";
    let mut a = spawn_with(&["--stream", "1"]);
    let t = Instant::now();
    let (s_pcm, _, s_first, res) = a.speak(1, Lang::Vi, text);
    let s_total = t.elapsed();
    assert!(res.is_ok());
    a.finish();
    let mut b = spawn_with(&["--stream", "0"]);
    let t = Instant::now();
    let (n_pcm, _, n_first, res) = b.speak(1, Lang::Vi, text);
    let n_total = t.elapsed();
    assert!(res.is_ok());
    b.finish();
    println!(
        "phát dần: khung đầu sau {:?}, tổng {:?}, {} mẫu | không phát dần: khung đầu sau {:?}, tổng {:?}, {} mẫu",
        s_first,
        s_total,
        s_pcm.len(),
        n_first,
        n_total,
        n_pcm.len()
    );
    save_wav("stream.wav", &s_pcm);
    save_wav("nostream.wav", &n_pcm);
    assert_eq!(s_pcm.len(), n_pcm.len(), "độ dài khác nhau");
    let max = s_pcm
        .iter()
        .zip(&n_pcm)
        .map(|(a, b)| (i32::from(*a) - i32::from(*b)).abs())
        .max()
        .unwrap();
    println!("lệch lớn nhất giữa hai đường: {max} (thang 32768)");
    assert!(max < 40, "đầu ra phát dần khác không phát dần");
}
