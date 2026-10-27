//! Giao thức giữa app và tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.2), cùng kiểu với
//! `asr-protocol`: mỗi khung là độ dài `u32` little-endian rồi nội dung postcard, tối đa [`MAX_FRAME_BYTES`].
//!
//! - postcard mã hóa enum theo chỉ số biến thể: chỉ thêm biến thể ở CUỐI (test `variant_indices_are_pinned`). Thêm hay bỏ
//!   trường cũng đổi định dạng: app và worker luôn build cùng nhau, và [`PROTOCOL_VERSION`] tăng mỗi lần đổi bất kỳ kiểu nào.
//! - Kế hoạch 02 chỉ có phần nhận giọng. Kế hoạch 04 thêm `Speech`, `SetNames`, `ReaderState`, trường tên của [`VoiceInfo`]
//!   và người tham dự (spec §4.2) ở cuối các enum, và tăng [`PROTOCOL_VERSION`].
//! - Log không bao giờ chứa âm thanh hay tên người: `Debug` của [`SegmentAudio`] viết tay.
//! - Mô hình đe dọa của kênh: worker đọc khung của app (tiến trình cha); app đọc khung của worker, tiến trình chạy bộ đọc
//!   protobuf và (kế hoạch 04) đọc giao diện app khác, nên app coi khung của worker là dữ liệu chưa tin: giới hạn kích thước
//!   khung, từ chối khung hỏng hay lạ (bỏ worker, chạy lại), giới hạn độ dài danh sách ([`MAX_VOICES_ON_WIRE`]).

#![forbid(unsafe_code)]

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{self, Read, Write};

/// Âm thanh gửi cho worker luôn là 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;
/// Chỉ nhúng tối đa 4 s đầu phần tiếng nói của mỗi đoạn (cách A2, spec §5.2). App gửi tối đa chừng này mẫu; worker từ chối
/// đoạn dài hơn.
pub const MAX_EMBED_SAMPLES: usize = SAMPLE_RATE as usize * 4;
/// Ngắn hơn thì không nhúng (spec §5.2). Nguồn sự thật duy nhất của ngưỡng 0,5 s: `speaker_worker::embed::MIN_SAMPLES` và
/// [`SpeakerConfig::validate`] dùng số này.
pub const MIN_EMBED_MS: u64 = 500;
/// Thời lượng tối đa của một đoạn (`end_ms − start_ms`): `PipelineConfig` cho `segmenter.max_segment_ms` tới 28 s (mặc định 8 s).
pub const MAX_SEGMENT_MS: u64 = 30_000;
/// Một đoạn 4 s dạng `i16` sau postcard khoảng 200 KB; 4 MiB là dư nhiều (spec §4.2).
pub const MAX_FRAME_BYTES: u32 = 4 * 1024 * 1024;
/// Số giọng đang sống tối đa mà [`SpeakerConfig::validate`] nhận.
pub const MAX_VOICES: usize = 32;
/// App coi `Voices` có nhiều giọng hơn chừng này là khung hỏng.
pub const MAX_VOICES_ON_WIRE: usize = 64;
/// Phiên bản giao thức, trường đầu của `Response::Ready`. App tắt nhận giọng nếu worker báo số khác.
pub const PROTOCOL_VERSION: u32 = 1;

/// Nguồn của âm thanh (spec §5.5): `System` khi micro bị hạ hay im, `Mic` khi âm thanh máy dưới ngưỡng nhường lời và micro có
/// tiếng, `Mixed` khi cả hai có tiếng. Đoạn lấy nguồn chiếm đa số khung.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Source {
    #[default]
    System,
    Mic,
    Mixed,
}

/// Một đoạn VAD gửi cho worker (spec §4.2).
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct SegmentAudio {
    /// Id đoạn của `Segmenter` (chưa cộng `id_base` của phiên).
    pub segment_id: u64,
    /// Ranh giới tiếng nói, tính từ đầu phiên, không gồm đệm. `end_ms − start_ms` là thời lượng thật dùng cho phân cụm.
    pub start_ms: u64,
    pub end_ms: u64,
    pub source: Source,
    /// PCM 16 kHz `i16`: tối đa [`MAX_EMBED_SAMPLES`] mẫu đầu của phần tiếng nói `[start_ms, end_ms)`, không đệm (A2).
    pub pcm: Vec<i16>,
}

// Debug viết tay: âm thanh không bao giờ vào log (spec §5.6, §10).
impl fmt::Debug for SegmentAudio {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SegmentAudio")
            .field("segment_id", &self.segment_id)
            .field("start_ms", &self.start_ms)
            .field("end_ms", &self.end_ms)
            .field("source", &self.source)
            .field("pcm", &format_args!("<{} mẫu>", self.pcm.len()))
            .finish()
    }
}

/// Ngưỡng của nhận giọng (spec §5.2–§5.4); đổi được qua khóa `speaker_config` của manifest (§4.5). Thiếu khóa nào thì dùng
/// mặc định.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SpeakerConfig {
    /// Cosine tối thiểu để vào một giọng đã có.
    pub theta: f32,
    /// Ngắn hơn thì không dùng nhúng, lấy giọng của đoạn trước.
    pub min_embed_ms: u64,
    /// Từ độ dài này mới được mở giọng mới.
    pub min_new_ms: u64,
    /// Từ độ dài này mới cập nhật tâm của giọng.
    pub min_update_ms: u64,
    /// Số giọng đang sống tối đa; đủ rồi thì đoạn không giống giọng nào vào giọng gần nhất. Mã giọng không bao giờ dùng lại nên
    /// có thể lớn hơn số này.
    pub max_voices: usize,
    /// Cosine giữa hai tâm để tự gộp; lớn hơn 1 là không bao giờ gộp (mặc định 1,10: kế hoạch 01 không thấy gộp giúp gì).
    pub merge_theta: f32,
    /// Mỗi giọng phải có ít nhất chừng này tiếng nói mới được tự gộp.
    pub merge_min_ms: u64,
}

impl Default for SpeakerConfig {
    fn default() -> Self {
        // Chốt ở kế hoạch 01 (results/nhan-giong-ami.md, nhan-giong-tieng-viet.md).
        Self {
            theta: 0.35,
            min_embed_ms: MIN_EMBED_MS,
            min_new_ms: 1_500,
            min_update_ms: 1_000,
            max_voices: 8,
            merge_theta: 1.10,
            merge_min_ms: 10_000,
        }
    }
}

impl SpeakerConfig {
    /// Trả tên trường đầu tiên vô lý. App (manifest) và worker (`Load`) cùng gọi; sai thì dùng [`SpeakerConfig::default`].
    pub fn validate(&self) -> Result<(), String> {
        let checks = [
            ("theta", self.theta.is_finite() && self.theta > 0.0 && self.theta <= 1.0),
            (
                "min_embed_ms",
                (MIN_EMBED_MS..=MAX_SEGMENT_MS).contains(&self.min_embed_ms),
            ),
            (
                "min_new_ms",
                (self.min_embed_ms..=MAX_SEGMENT_MS).contains(&self.min_new_ms),
            ),
            (
                "min_update_ms",
                (self.min_embed_ms..=MAX_SEGMENT_MS).contains(&self.min_update_ms),
            ),
            ("max_voices", (1..=MAX_VOICES).contains(&self.max_voices)),
            (
                "merge_theta",
                self.merge_theta.is_finite() && self.merge_theta > 0.0 && self.merge_theta <= 2.0,
            ),
            ("merge_min_ms", self.merge_min_ms <= 3_600_000),
        ];
        match checks.iter().find(|(_, ok)| !ok) {
            Some((name, _)) => Err((*name).to_string()),
            None => Ok(()),
        }
    }
}

/// Yêu cầu từ app. Thứ tự: `Load` → `Ready`; `SessionStart` (không trả lời); mỗi `Segment` → `Assign` hay `Error`, có thể kèm
/// `Merged`, `Voices`; `Shutdown`: worker thoát, không trả lời.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Request {
    Load {
        model_path: String,
        /// SHA-256 (hex chữ thường) mà app đã kiểm cho file model; worker băm đúng các byte nó đọc và dựng đồ thị từ chính các
        /// byte đó, khác thì `Ready { model_ok: false }` (file bị thay sau lúc app kiểm, spec §10). `None`: model của bản dev,
        /// không kiểm.
        model_sha256: Option<String>,
        config: SpeakerConfig,
    },
    /// Giờ hệ thống (ms Unix) lúc bắt đầu phiên; worker xóa mọi giọng. Kế hoạch 04 dùng làm mốc chung với dấu "đang nói".
    SessionStart {
        unix_ms: u64,
    },
    Segment(SegmentAudio),
    Shutdown,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    /// `Segment` khi model chưa nạp được.
    NotLoaded,
    /// Yêu cầu sai (thời lượng âm, đoạn quá dài, PCM quá 4 s): lỗi của app.
    InvalidRequest,
    Internal,
}

/// Một giọng đang sống (spec §4.2; kế hoạch 04 thêm trường tên ở cuối).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct VoiceInfo {
    pub voice: u32,
    /// Tổng thời lượng tiếng nói đã gán cho giọng này.
    pub speech_ms: u64,
    /// Giọng trong phòng: ≥ 60% thời lượng từ micro (spec §5.5).
    pub mic: bool,
}

/// Phản hồi của worker. Cùng luật chỉ-thêm-ở-cuối như [`Request`].
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Response {
    Ready {
        /// Trường đầu tiên (test `protocol_version_comes_first_in_ready`).
        protocol_version: u32,
        /// `false`: model không nạp được; worker vẫn sống nhưng trả `Error { NotLoaded }` cho mọi đoạn.
        model_ok: bool,
    },
    /// `voice` là `None` khi đoạn quá ngắn (hay nhúng không dùng được) mà chưa có giọng nào.
    Assign {
        segment_id: u64,
        voice: Option<u32>,
        confidence: f32,
    },
    /// Danh sách giọng đang sống, gửi khi có giọng mới, gộp, hay cờ trong phòng đổi.
    Voices {
        voices: Vec<VoiceInfo>,
    },
    Merged {
        from: u32,
        into: u32,
    },
    Error {
        segment_id: Option<u64>,
        kind: ErrorKind,
        message: String,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error("lỗi I/O: {0}")]
    Io(#[from] io::Error),
    #[error("khung dài {0} byte, vượt giới hạn {MAX_FRAME_BYTES}")]
    TooLarge(u64),
    #[error("lỗi mã hóa: {0}")]
    Codec(#[from] postcard::Error),
    #[error("khung còn {0} byte thừa sau thông điệp")]
    TrailingBytes(usize),
}

/// Ghi một khung rồi `flush`. Khung quá [`MAX_FRAME_BYTES`] thì không ghi gì.
pub fn write_frame<W: Write, T: Serialize>(w: &mut W, msg: &T) -> Result<(), FrameError> {
    let bytes = postcard::to_stdvec(msg)?;
    if bytes.len() as u64 > MAX_FRAME_BYTES as u64 {
        return Err(FrameError::TooLarge(bytes.len() as u64));
    }
    w.write_all(&(bytes.len() as u32).to_le_bytes())?;
    w.write_all(&bytes)?;
    w.flush()?;
    Ok(())
}

/// Đọc một khung. `Ok(None)` khi luồng đóng đúng ở ranh giới giữa hai khung. Mọi lỗi khác: bên đọc bỏ luồng (worker thoát; app
/// coi worker đã chết).
pub fn read_frame<R: Read, T: DeserializeOwned>(r: &mut R) -> Result<Option<T>, FrameError> {
    let mut len_buf = [0u8; 4];
    let mut filled = 0;
    while filled < len_buf.len() {
        match r.read(&mut len_buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.into()),
        }
    }
    if filled == 0 {
        return Ok(None);
    }
    if filled < len_buf.len() {
        return Err(io::Error::from(io::ErrorKind::UnexpectedEof).into());
    }
    let len = u32::from_le_bytes(len_buf);
    if len > MAX_FRAME_BYTES {
        return Err(FrameError::TooLarge(len as u64));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    let (msg, rest) = postcard::take_from_bytes::<T>(&buf)?;
    if !rest.is_empty() {
        return Err(FrameError::TrailingBytes(rest.len()));
    }
    Ok(Some(msg))
}

/// Mẫu f32 trong [-1, 1] sang PCM 16 bit, cùng công thức `pipeline::engine` dùng cho `asr-worker` (nhân `i16::MAX`, chặn biên).
pub fn pcm_from_f32(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}

/// Ngược lại của [`pcm_from_f32`]: chia `i16::MAX`, chặn ở -1 (`i16::MIN` hơi vượt).
pub fn f32_from_pcm(pcm: &[i16]) -> Vec<f32> {
    pcm.iter().map(|&v| (v as f32 / i16::MAX as f32).max(-1.0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample_segment() -> SegmentAudio {
        SegmentAudio {
            segment_id: 7,
            start_ms: 1_000,
            end_ms: 3_500,
            source: Source::Mic,
            pcm: vec![0, 1, -1, i16::MAX, i16::MIN],
        }
    }

    fn requests() -> Vec<Request> {
        vec![
            Request::Load {
                model_path: "/m/eres2net.onnx".into(),
                model_sha256: Some("ab".repeat(32)),
                config: SpeakerConfig::default(),
            },
            Request::SessionStart {
                unix_ms: 1_793_000_000_000,
            },
            Request::Segment(sample_segment()),
            Request::Shutdown,
        ]
    }

    fn responses() -> Vec<Response> {
        vec![
            Response::Ready {
                protocol_version: PROTOCOL_VERSION,
                model_ok: true,
            },
            Response::Assign {
                segment_id: 7,
                voice: Some(9),
                confidence: 0.5,
            },
            Response::Voices {
                voices: vec![VoiceInfo {
                    voice: 9,
                    speech_ms: 2_500,
                    mic: true,
                }],
            },
            Response::Merged { from: 2, into: 1 },
            Response::Error {
                segment_id: Some(7),
                kind: ErrorKind::InvalidRequest,
                message: "đoạn sai".into(),
            },
        ]
    }

    #[test]
    fn requests_and_responses_roundtrip() {
        let mut buf = Vec::new();
        for r in requests() {
            write_frame(&mut buf, &r).unwrap();
        }
        for r in responses() {
            write_frame(&mut buf, &r).unwrap();
        }
        let mut cur = Cursor::new(buf);
        for r in requests() {
            assert_eq!(read_frame::<_, Request>(&mut cur).unwrap().unwrap(), r);
        }
        for r in responses() {
            assert_eq!(read_frame::<_, Response>(&mut cur).unwrap().unwrap(), r);
        }
        assert!(read_frame::<_, Request>(&mut cur).unwrap().is_none());
    }

    /// postcard mã hóa enum theo thứ tự khai báo: đổi thứ tự là đổi định dạng trên dây.
    #[test]
    fn variant_indices_are_pinned() {
        fn index<T: Serialize>(v: &T) -> u8 {
            postcard::to_stdvec(v).unwrap()[0]
        }
        assert_eq!(requests().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3]);
        assert_eq!(responses().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3, 4]);
        assert_eq!(
            [Source::System, Source::Mic, Source::Mixed].map(|s| index(&s)),
            [0, 1, 2]
        );
        assert_eq!(
            [ErrorKind::NotLoaded, ErrorKind::InvalidRequest, ErrorKind::Internal].map(|k| index(&k)),
            [0, 1, 2]
        );
    }

    /// `protocol_version` là trường đầu của `Ready`: app đọc được số này trước mọi trường khác.
    #[test]
    fn protocol_version_comes_first_in_ready() {
        let ready = Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: false,
        };
        let bytes = postcard::to_stdvec(&ready).unwrap();
        assert_eq!(bytes[..2], [0, PROTOCOL_VERSION as u8]);
    }

    #[test]
    fn oversized_truncated_and_unknown_frames_are_errors() {
        let mut big = (MAX_FRAME_BYTES + 1).to_le_bytes().to_vec();
        big.extend([0; 8]);
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(big)),
            Err(FrameError::TooLarge(_))
        ));
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![3u8, 0])),
            Err(FrameError::Io(_))
        ));
        // `Shutdown` (chỉ số 3) kèm 2 byte thừa.
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![3, 0, 0, 0, 3, 0xAA, 0xBB])),
            Err(FrameError::TrailingBytes(2))
        ));
        // Chỉ số biến thể lạ.
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![1, 0, 0, 0, 9])),
            Err(FrameError::Codec(_))
        ));
    }

    #[test]
    fn a_frame_larger_than_the_limit_is_not_written_but_four_seconds_fit_easily() {
        let big = Request::Segment(SegmentAudio {
            pcm: vec![i16::MAX; MAX_FRAME_BYTES as usize / 2],
            ..sample_segment()
        });
        let mut out = Vec::new();
        assert!(matches!(write_frame(&mut out, &big), Err(FrameError::TooLarge(_))));
        assert!(out.is_empty());
        let four = Request::Segment(SegmentAudio {
            pcm: vec![i16::MIN; MAX_EMBED_SAMPLES],
            ..sample_segment()
        });
        write_frame(&mut out, &four).unwrap();
        assert!(out.len() < MAX_FRAME_BYTES as usize / 10, "{} byte", out.len());
    }

    #[test]
    fn debug_output_never_contains_audio() {
        let s = format!(
            "{:?}",
            Request::Segment(SegmentAudio {
                pcm: vec![12345; 100],
                ..sample_segment()
            })
        );
        assert!(s.contains("<100 mẫu>") && !s.contains("12345"), "{s}");
    }

    /// Ngưỡng chốt ở kế hoạch 01 (results/nhan-giong-ami.md, nhan-giong-tieng-viet.md): θ 0,35, gộp tắt (1,10).
    #[test]
    fn the_default_config_is_the_one_chosen_in_plan_01_and_is_valid() {
        let c = SpeakerConfig::default();
        assert_eq!(
            (
                c.theta,
                c.min_embed_ms,
                c.min_new_ms,
                c.min_update_ms,
                c.max_voices,
                c.merge_theta,
                c.merge_min_ms
            ),
            (0.35, 500, 1_500, 1_000, 8, 1.10, 10_000)
        );
        assert_eq!(c.validate(), Ok(()));
    }

    #[test]
    fn validate_names_the_first_bad_field() {
        let bad = |change: fn(&mut SpeakerConfig)| {
            let mut c = SpeakerConfig::default();
            change(&mut c);
            c.validate().unwrap_err()
        };
        assert_eq!(bad(|c| c.theta = f32::NAN), "theta");
        assert_eq!(bad(|c| c.theta = -0.1), "theta");
        assert_eq!(bad(|c| c.theta = 0.0), "theta");
        assert_eq!(bad(|c| c.theta = 1.5), "theta");
        // Ngắn hơn 0,5 s thì `Embedder::embed` từ chối: hai nguồn sự thật phải khớp (MIN_EMBED_MS).
        assert_eq!(bad(|c| c.min_embed_ms = 499), "min_embed_ms");
        assert_eq!(bad(|c| c.min_new_ms = 400), "min_new_ms");
        assert_eq!(bad(|c| c.min_update_ms = 499), "min_update_ms");
        assert_eq!(bad(|c| c.max_voices = 0), "max_voices");
        assert_eq!(bad(|c| c.max_voices = MAX_VOICES + 1), "max_voices");
        assert_eq!(bad(|c| c.merge_theta = f32::INFINITY), "merge_theta");
        assert_eq!(bad(|c| c.merge_min_ms = u64::MAX), "merge_min_ms");
    }

    #[test]
    fn pcm_conversion_roundtrips_within_one_step() {
        let x = [0.0f32, 0.5, -0.5, 1.0, -1.0, 2.0, -2.0];
        let back = f32_from_pcm(&pcm_from_f32(&x));
        for (a, b) in x.iter().map(|v| v.clamp(-1.0, 1.0)).zip(&back) {
            assert!((a - b).abs() <= 1.0 / i16::MAX as f32, "{a} {b}");
        }
        assert_eq!(f32_from_pcm(&[i16::MIN]), [-1.0]);
    }

    #[test]
    fn the_a2_cap_is_four_seconds_and_the_embedding_floor_half_a_second() {
        assert_eq!(MAX_EMBED_SAMPLES, 64_000);
        assert_eq!(MIN_EMBED_MS, 500);
    }
}
