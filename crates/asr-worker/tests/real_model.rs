//! `asr-worker` nạp model thật và nói đã chạy trên thiết bị nào (spec 2026-10-18 §4). Cần model và build có GPU nên bị bỏ
//! qua mặc định. Chạy từ gốc repo:
//!
//! ```text
//! MT_ASR_MODEL=models/ggml-small-q5_1.bin cargo test -p asr-worker --features metal,shared-encode \
//!   --test real_model -- --include-ignored --nocapture
//! ```

use asr_protocol::{Backend, Request, Response, read_frame, write_frame};
use std::io::{BufReader, BufWriter};
use std::process::{Command, Stdio};

#[test]
#[ignore = "cần model thật: MT_ASR_MODEL"]
fn a_real_load_reports_the_device_it_runs_on() {
    let model = std::env::var("MT_ASR_MODEL").expect("đặt MT_ASR_MODEL");
    let dir = std::env::temp_dir().join(format!("asr-worker-real-model-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let stderr_path = dir.join("stderr.log");

    let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(std::fs::File::create(&stderr_path).unwrap())
        .spawn()
        .unwrap();
    let mut input = BufWriter::new(child.stdin.take().unwrap());
    let mut output = BufReader::new(child.stdout.take().unwrap());
    write_frame(
        &mut input,
        &Request::Load {
            model_path: model,
            use_gpu: true,
            n_threads: 4,
        },
    )
    .unwrap();
    let ready = read_frame::<_, Response>(&mut output).unwrap().unwrap();
    drop(input);
    assert!(child.wait().unwrap().success());

    let Response::Ready { backend, .. } = ready else {
        panic!("cần Ready, nhận {ready:?}");
    };
    let stderr = std::fs::read_to_string(&stderr_path).unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    println!("{stderr}");
    let gpu_line = stderr.lines().find(|l| l.starts_with("asr-worker: gpu="));
    if backend == Backend::Cpu {
        assert!(gpu_line.is_none(), "chạy CPU thì không có dòng gpu=: {stderr}");
    } else {
        assert!(
            gpu_line.is_some(),
            "thiếu dòng `asr-worker: gpu=` trong stderr: {stderr}"
        );
    }
    assert!(
        stderr
            .lines()
            .any(|l| l.starts_with("asr-worker: backend=") && l.contains(backend.as_str())),
        "dòng backend= phải khớp Ready ({backend:?}): {stderr}"
    );
}
