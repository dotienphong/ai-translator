//! Binary `asr-worker` nói đúng giao thức v2 (spec §6.4) khi chưa có model: không cần file model hay GPU.

use asr_protocol::{ErrorKind, Request, Response, TranscribeRequest, read_frame, write_frame};
use std::io::{BufReader, BufWriter};
use std::process::{Command, Stdio};

fn transcribe(segment_id: u64) -> Request {
    Request::Transcribe(TranscribeRequest {
        segment_id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into()],
        prompt_tokens: Vec::new(),
        audio_ctx: 512,
        prev_lang: None,
    })
}

#[test]
fn errors_carry_a_kind_and_the_worker_exits_when_stdin_closes() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut input = BufWriter::new(child.stdin.take().unwrap());
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut call = |req: &Request| {
        write_frame(&mut input, req).unwrap();
        read_frame::<_, Response>(&mut output).unwrap().unwrap()
    };

    let not_loaded = |resp: Response, id: Option<u64>| match resp {
        Response::Error { segment_id, kind, .. } => assert_eq!((segment_id, kind), (id, ErrorKind::NotLoaded)),
        other => panic!("cần Error NotLoaded, nhận {other:?}"),
    };
    not_loaded(call(&Request::Warmup), None);
    not_loaded(call(&transcribe(7)), Some(7));
    let load = Request::Load {
        model_path: "/khong/co/model.bin".into(),
        use_gpu: false,
        n_threads: 1,
    };
    match call(&load) {
        Response::Error { segment_id, kind, .. } => assert_eq!((segment_id, kind), (None, ErrorKind::ModelLoad)),
        other => panic!("cần Error ModelLoad, nhận {other:?}"),
    }
    drop(input); // app chết: stdin đóng thì worker tự thoát
    assert!(child.wait().unwrap().success());
}
