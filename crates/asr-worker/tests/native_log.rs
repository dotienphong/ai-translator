//! Log của whisper.cpp và ggml đi qua callback của worker (`native_log`, Q2 của review 02 lần 2): chạy binary thật, nạp
//! một model không có. whisper.cpp báo lỗi mở file qua log; dòng đó phải vẫn ra stderr (file log của tiến trình phụ) và
//! có trong thông báo lỗi gửi cho app. Các dòng giữ lại chỉ là của yêu cầu hiện tại: worker xóa chúng trước mỗi yêu cầu
//! (B1 của review 02 lần 3), nên lỗi sau không bị xếp theo log của lỗi trước.

use asr_protocol::{ErrorKind, Request, Response, read_frame, write_frame};
use std::io::{BufReader, BufWriter, Read};
use std::process::{Command, Stdio};

#[test]
fn whisper_log_lines_reach_stderr_and_the_error_message() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = BufWriter::new(child.stdin.take().unwrap());
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let load = Request::Load {
        model_path: "/khong/co/model.bin".into(),
        use_gpu: false,
        n_threads: 1,
    };
    let mut load_error = || {
        write_frame(&mut input, &load).unwrap();
        match read_frame::<_, Response>(&mut output).unwrap().unwrap() {
            Response::Error { kind, message, .. } => {
                assert_eq!(kind, ErrorKind::ModelLoad);
                message
            }
            other => panic!("cần Error ModelLoad, nhận {other:?}"),
        }
    };
    let message = load_error();
    let again = load_error();
    assert_eq!(
        again.matches("failed to open").count(),
        1,
        "chỉ log của yêu cầu này: {again}"
    );
    drop(input);
    let mut stderr = String::new();
    child.stderr.take().unwrap().read_to_string(&mut stderr).unwrap();
    assert!(child.wait().unwrap().success());
    assert!(message.contains("failed to open"), "{message}");
    assert!(stderr.contains("failed to open '/khong/co/model.bin'"), "{stderr}");
}
