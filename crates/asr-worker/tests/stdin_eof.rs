//! `asr-worker` tự thoát khi stdin đóng (spec §5): app bị kill hẳn (Force Quit) thì pipe stdin đóng, và worker không bị bỏ
//! lại, kể cả khi chưa nạp model hay vừa trả lời một yêu cầu.

use asr_protocol::{ErrorKind, Request, Response, read_frame, write_frame};
use std::io::BufReader;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn exits_within(child: &mut std::process::Child, limit: Duration) -> std::process::ExitStatus {
    let deadline = Instant::now() + limit;
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            panic!("asr-worker không thoát sau {limit:?} khi stdin đóng");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn closing_stdin_ends_the_worker() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    write_frame(&mut stdin, &Request::Warmup).unwrap();
    match read_frame::<_, Response>(&mut stdout).unwrap() {
        Some(Response::Error { kind, .. }) => assert_eq!(kind, ErrorKind::NotLoaded),
        other => panic!("phản hồi lạ: {other:?}"),
    }
    drop(stdin);
    let status = exits_within(&mut child, Duration::from_secs(5));
    assert!(status.success(), "{status}");
}
