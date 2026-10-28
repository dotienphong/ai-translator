//! Chạy binary `speaker-worker` thật qua stdin/stdout (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §4.2, §10): model tổng hợp nhỏ
//! (không cần model thật), SHA-256 của model, khung hỏng, số luồng mặc định, ưu tiên thấp.

use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use candle_onnx::onnx::attribute_proto::AttributeType;
use candle_onnx::onnx::tensor_proto::DataType;
use candle_onnx::onnx::tensor_shape_proto::Dimension;
use candle_onnx::onnx::tensor_shape_proto::dimension::Value as Dim;
use candle_onnx::onnx::{
    AttributeProto, GraphProto, ModelProto, NodeProto, TensorProto, TensorShapeProto, TypeProto, ValueInfoProto,
    type_proto,
};
use prost::Message;
use speaker_protocol::{
    ErrorKind, NamesSetup, PROTOCOL_VERSION, Request, Response, SegmentAudio, Source, SpeakerConfig, read_frame,
    write_frame,
};

const EXE: &str = env!("CARGO_BIN_EXE_speaker-worker");

/// SHA-256 hex chữ thường của một file, như app gửi trong `Load`.
fn sha256_hex(path: &Path) -> String {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    Sha256::digest(std::fs::read(path).unwrap())
        .iter()
        .fold(String::new(), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("speaker-worker-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// Model tổng hợp: `x (1, T, 80)` nhân `w (80, 192)` rồi ReduceMax theo thời gian ra `embedding (1, 192)`.
fn synthetic_model(dir: &Path) -> PathBuf {
    let dim = |d: Dim| Dimension {
        value: Some(d),
        ..Default::default()
    };
    let attr = |name: &str, kind: AttributeType, i: i64, ints: Vec<i64>| AttributeProto {
        name: name.into(),
        r#type: kind as i32,
        i,
        ints,
        ..Default::default()
    };
    let model = ModelProto {
        graph: Some(GraphProto {
            node: vec![
                NodeProto {
                    op_type: "MatMul".into(),
                    input: vec!["x".into(), "w".into()],
                    output: vec!["h".into()],
                    ..Default::default()
                },
                NodeProto {
                    op_type: "ReduceMax".into(),
                    input: vec!["h".into()],
                    output: vec!["embedding".into()],
                    attribute: vec![
                        attr("axes", AttributeType::Ints, 0, vec![1]),
                        attr("keepdims", AttributeType::Int, 0, Vec::new()),
                    ],
                    ..Default::default()
                },
            ],
            initializer: vec![TensorProto {
                name: "w".into(),
                dims: vec![80, 192],
                data_type: DataType::Float as i32,
                float_data: (0..80 * 192).map(|i| ((i % 7) as f32 - 3.0) * 0.01).collect(),
                ..Default::default()
            }],
            input: vec![ValueInfoProto {
                name: "x".into(),
                r#type: Some(TypeProto {
                    value: Some(type_proto::Value::TensorType(type_proto::Tensor {
                        elem_type: DataType::Float as i32,
                        shape: Some(TensorShapeProto {
                            dim: vec![
                                dim(Dim::DimParam("N".into())),
                                dim(Dim::DimParam("T".into())),
                                dim(Dim::DimValue(80)),
                            ],
                        }),
                    })),
                    ..Default::default()
                }),
                ..Default::default()
            }],
            output: vec![ValueInfoProto {
                name: "embedding".into(),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    };
    let path = dir.join("model.onnx");
    std::fs::write(&path, model.encode_to_vec()).unwrap();
    path
}

struct Worker {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl Worker {
    fn spawn() -> Self {
        let mut child = Command::new(EXE)
            .env("RAYON_NUM_THREADS", "2")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Self { child, stdin, stdout }
    }

    fn send(&mut self, req: &Request) {
        write_frame(&mut self.stdin, req).unwrap();
    }

    fn recv(&mut self) -> Response {
        read_frame::<_, Response>(&mut self.stdout).unwrap().unwrap()
    }

    /// Chờ tiến trình thoát; trả (thoát thành công, stderr).
    fn finish(self) -> (bool, String) {
        drop(self.stdin);
        let out = self.child.wait_with_output().unwrap();
        (out.status.success(), String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

fn chirp(len: usize) -> Vec<i16> {
    (0..len)
        .map(|i| (0.3 * (i as f32 * (0.02 + i as f32 * 1e-6)).sin() * i16::MAX as f32) as i16)
        .collect()
}

#[test]
fn a_synthetic_model_loads_and_segments_get_voices() {
    let dir = temp_dir("synthetic");
    let mut w = Worker::spawn();
    let model = synthetic_model(&dir);
    w.send(&Request::Load {
        model_path: model.display().to_string(),
        model_sha256: Some(sha256_hex(&model)),
        config: SpeakerConfig::default(),
        names: NamesSetup::off(),
    });
    assert_eq!(
        w.recv(),
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: true,
            reader_platform: speaker_worker::reader::PLATFORM
        }
    );
    w.send(&Request::SessionStart { unix_ms: 1 });
    w.send(&Request::Segment(SegmentAudio {
        segment_id: 4,
        start_ms: 0,
        end_ms: 2_000,
        source: Source::System,
        pcm: chirp(32_000),
    }));
    assert!(matches!(
        w.recv(),
        Response::Assign {
            segment_id: 4,
            voice: Some(1),
            ..
        }
    ));
    assert!(matches!(w.recv(), Response::Voices { voices, .. } if voices.len() == 1));
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(stderr.contains("1 đoạn"), "{stderr}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_missing_model_is_reported_not_fatal() {
    let mut w = Worker::spawn();
    w.send(&Request::Load {
        model_path: "/khong/co/model.onnx".into(),
        model_sha256: None,
        config: SpeakerConfig::default(),
        names: NamesSetup::off(),
    });
    assert_eq!(
        w.recv(),
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: false,
            reader_platform: speaker_worker::reader::PLATFORM
        }
    );
    w.send(&Request::Segment(SegmentAudio {
        segment_id: 1,
        start_ms: 0,
        end_ms: 1_000,
        source: Source::System,
        pcm: vec![0; 100],
    }));
    assert!(matches!(
        w.recv(),
        Response::Error {
            kind: ErrorKind::NotLoaded,
            ..
        }
    ));
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(!stderr.contains("/khong/co"), "log không chứa đường dẫn: {stderr}");
}

#[test]
fn a_broken_frame_ends_the_worker_without_a_panic() {
    for bytes in [
        (u32::MAX).to_le_bytes().to_vec(),  // khung quá 4 MiB
        vec![3, 0, 0, 0, 0xFF, 0xFF, 0xFF], // nội dung không giải mã được
        vec![2, 0, 0],                      // độ dài cụt
    ] {
        let mut w = Worker::spawn();
        w.stdin.write_all(&bytes).unwrap();
        let (ok, stderr) = w.finish();
        assert!(!ok, "khung hỏng phải làm worker thoát lỗi");
        assert!(!stderr.contains("panicked"), "{stderr}");
    }
}

/// Spec §10: byte của model khác SHA-256 app đã kiểm thì worker không dùng model; log không có đường dẫn.
#[test]
fn a_model_with_another_sha256_is_not_used() {
    let dir = temp_dir("sha");
    let mut w = Worker::spawn();
    w.send(&Request::Load {
        model_path: synthetic_model(&dir).display().to_string(),
        model_sha256: Some("0".repeat(64)),
        config: SpeakerConfig::default(),
        names: NamesSetup::off(),
    });
    assert_eq!(
        w.recv(),
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: false,
            reader_platform: speaker_worker::reader::PLATFORM
        }
    );
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(stderr.contains("SHA-256 của model khác"), "{stderr}");
    assert!(
        !stderr.contains(&dir.display().to_string()),
        "log không có đường dẫn: {stderr}"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

/// Chạy worker với `RAYON_NUM_THREADS` = `value` (`None`: không đặt), gửi `Shutdown`; trả dòng log báo số luồng tính toán.
fn thread_line(value: Option<&str>) -> String {
    let mut cmd = Command::new(EXE);
    match value {
        Some(v) => cmd.env("RAYON_NUM_THREADS", v),
        None => cmd.env_remove("RAYON_NUM_THREADS"),
    };
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    write_frame(&mut stdin, &Request::Shutdown).unwrap();
    drop(stdin);
    let out = child.wait_with_output().unwrap();
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(out.status.success(), "{value:?}: {stderr}");
    stderr
        .lines()
        .find(|l| l.contains("luồng tính toán"))
        .unwrap_or_else(|| panic!("{value:?}: không có dòng số luồng: {stderr}"))
        .to_string()
}

/// Thiếu `RAYON_NUM_THREADS` (chạy tay, lỗi ở app): worker tự dùng 2 luồng, không chiếm mọi lõi (spec §4.1, §11).
#[test]
fn without_the_thread_variable_the_worker_still_uses_two_threads() {
    assert_eq!(thread_line(None), "speaker-worker: 2 luồng tính toán");
}

/// Rỗng hay không phải số nguyên dương: rayon và candle-core coi như không đặt (mọi lõi), nên worker cũng đặt lại 2.
#[test]
fn an_invalid_thread_variable_also_means_two_threads() {
    for value in ["", "0", "abc", "-1", " 3"] {
        assert_eq!(
            thread_line(Some(value)),
            "speaker-worker: 2 luồng tính toán",
            "RAYON_NUM_THREADS={value:?}"
        );
    }
}

/// Giá trị hợp lệ (số nguyên dương) giữ nguyên.
#[test]
fn a_valid_thread_variable_is_kept() {
    assert_eq!(thread_line(Some("3")), "speaker-worker: 3 luồng tính toán");
}

/// Đoạn im lặng cho đặc trưng toàn 0 sau khi trừ trung bình (vector "ma"): worker không mở giọng cho nó, log ghi lý do.
#[test]
fn a_silent_segment_opens_no_voice() {
    let dir = temp_dir("silence");
    let mut w = Worker::spawn();
    let model = synthetic_model(&dir);
    w.send(&Request::Load {
        model_path: model.display().to_string(),
        model_sha256: Some(sha256_hex(&model)),
        config: SpeakerConfig::default(),
        names: NamesSetup::off(),
    });
    assert!(matches!(w.recv(), Response::Ready { model_ok: true, .. }));
    let segment = |segment_id, pcm| {
        Request::Segment(SegmentAudio {
            segment_id,
            start_ms: 0,
            end_ms: 2_000,
            source: Source::System,
            pcm,
        })
    };
    w.send(&segment(1, vec![0; 32_000]));
    assert_eq!(
        w.recv(),
        Response::Assign {
            segment_id: 1,
            voice: None,
            confidence: 0.0
        }
    );
    // Phản hồi kế tiếp là `Assign` của đoạn 2 (đoạn 1 không gửi `Voices`), và tiếng nói mở giọng 1.
    w.send(&segment(2, chirp(32_000)));
    assert!(matches!(
        w.recv(),
        Response::Assign {
            segment_id: 2,
            voice: Some(1),
            ..
        }
    ));
    assert!(matches!(w.recv(), Response::Voices { voices, .. } if voices.len() == 1));
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(stderr.contains("không có đặc trưng"), "{stderr}");
    assert!(stderr.contains("1 lần nhúng (lỗi 1)"), "{stderr}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// Spec §4.1: macOS `setpriority(PRIO_PROCESS, 0, 10)`.
#[cfg(target_os = "macos")]
#[test]
fn the_worker_lowers_its_priority() {
    let mut w = Worker::spawn();
    w.send(&Request::Load {
        model_path: "/khong/co/model.onnx".into(),
        model_sha256: None,
        config: SpeakerConfig::default(),
        names: NamesSetup::off(),
    });
    w.recv();
    // SAFETY: chỉ đọc mức nice của tiến trình con.
    let nice = unsafe { libc::getpriority(libc::PRIO_PROCESS, w.child.id()) };
    // `setpriority(…, 10)` đặt giá trị tuyệt đối: chạy dưới tiến trình cha đã có nice > 10 thì worker giữ nice của cha.
    assert!(nice >= 10, "nice {nice}");
    w.send(&Request::Shutdown);
    assert!(w.finish().0);
}

/// Kế hoạch 04: `Speech`, `SetNames`, `PauseNames` không có trả lời; khung kế tiếp sau chúng là `Assign` của đoạn. Worker in phiên
/// bản giao thức ra stderr lúc khởi động (QĐ 26).
#[test]
fn speech_set_names_and_pause_get_no_reply() {
    let dir = temp_dir("speech");
    let mut w = Worker::spawn();
    let model = synthetic_model(&dir);
    w.send(&Request::Load {
        model_path: model.display().to_string(),
        model_sha256: Some(sha256_hex(&model)),
        config: SpeakerConfig::default(),
        names: NamesSetup::off(),
    });
    assert!(matches!(w.recv(), Response::Ready { model_ok: true, .. }));
    w.send(&Request::SessionStart { unix_ms: 1 });
    w.send(&Request::Speech {
        start_ms: 0,
        end_ms: 512,
    });
    w.send(&Request::SetNames { enabled: true });
    w.send(&Request::PauseNames);
    w.send(&Request::Segment(SegmentAudio {
        segment_id: 4,
        start_ms: 0,
        end_ms: 2_000,
        source: Source::System,
        pcm: chirp(32_000),
    }));
    assert!(matches!(w.recv(), Response::Assign { segment_id: 4, .. }));
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(
        stderr.contains(&format!("giao thức phiên bản {}", speaker_protocol::PROTOCOL_VERSION)),
        "{stderr}"
    );
    let _ = std::fs::remove_dir_all(&dir);
}
