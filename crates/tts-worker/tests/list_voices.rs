//! `ListVoices` chạy binary `tts-worker` thật nhưng KHÔNG cần model: đường dẫn model là giả, chỉ file giọng là thật.
//! Worker phải trả `Voices` (hoặc `Failed { ModelMissing }` khi file giọng hỏng) và vẫn chạy tiếp (spec 2026-11-04 §5).
#![cfg(feature = "engine")]

use std::io::Write;
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use tts_protocol::{ErrorKind, PROTOCOL_VERSION, Request, Response, read_frame, write_frame};

struct Worker {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
}

fn spawn(voices: &Path) -> Worker {
    let none = "/không/có/model";
    let mut child = Command::new(env!("CARGO_BIN_EXE_tts-worker"))
        .args(["--model-dir", none, "--codec-dir", none, "--g2p-dict", none])
        .arg("--voices")
        .arg(voices)
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
    fn ask(&mut self, r: &Request) -> Response {
        write_frame(&mut self.stdin, r).unwrap();
        self.stdin.flush().unwrap();
        read_frame(&mut self.stdout)
            .unwrap()
            .expect("worker đóng sau ListVoices")
    }

    fn finish(mut self) {
        write_frame(&mut self.stdin, &Request::Shutdown).unwrap();
        self.stdin.flush().unwrap();
        assert!(self.child.wait().unwrap().success());
    }
}

fn temp_file(tag: &str, body: &str) -> std::path::PathBuf {
    let p = std::env::temp_dir().join(format!("tts-worker-listvoices-{tag}-{}.json", std::process::id()));
    std::fs::write(&p, body).unwrap();
    p
}

#[test]
fn list_voices_answers_without_model_and_keeps_running() {
    let p = temp_file(
        "ok",
        r#"{"default_voice":"Hải Đăng","presets":{"Ngọc Lan":{"speaker_emb":[1],"codes":[[1]]},"Hải Đăng":{"speaker_emb":[2],"codes":[[2]]}}}"#,
    );
    let mut w = spawn(&p);
    let want = Response::Voices {
        id: 7,
        names: vec!["Hải Đăng".into(), "Ngọc Lan".into()],
        default: "Hải Đăng".into(),
    };
    assert_eq!(w.ask(&Request::ListVoices { id: 7 }), want);
    // Hỏi lần hai: worker vẫn sống.
    assert_eq!(
        w.ask(&Request::ListVoices { id: 8 }),
        Response::Voices {
            id: 8,
            names: vec!["Hải Đăng".into(), "Ngọc Lan".into()],
            default: "Hải Đăng".into(),
        }
    );
    w.finish();
    let _ = std::fs::remove_file(&p);
}

#[test]
fn list_voices_reports_broken_file_and_keeps_running() {
    let p = temp_file("broken", "{không phải json");
    let mut w = spawn(&p);
    for id in [1, 2] {
        assert_eq!(
            w.ask(&Request::ListVoices { id }),
            Response::Failed {
                id,
                kind: ErrorKind::ModelMissing
            }
        );
    }
    w.finish();
    let _ = std::fs::remove_file(&p);
}
