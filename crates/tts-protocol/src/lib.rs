//! Giao thức giữa app và tiến trình phụ `tts-worker` (spec 2026-11-02-doc-ban-dich-tts-design §4), cùng kiểu với
//! `speaker-protocol`: mỗi khung là độ dài `u32` little-endian rồi nội dung postcard, tối đa [`MAX_FRAME_BYTES`].
//!
//! - postcard mã hóa enum theo chỉ số biến thể: chỉ thêm biến thể ở CUỐI (test `variant_indices_are_pinned`). Thêm hay
//!   bỏ trường cũng đổi định dạng: app và worker luôn build cùng nhau, và [`PROTOCOL_VERSION`] tăng mỗi lần đổi kiểu.
//! - Log không bao giờ chứa chữ cần đọc hay âm thanh: `Debug` của [`Request`] và [`Response`] viết tay, chỉ in độ dài.
//! - Khung của worker là dữ liệu chưa tin: giới hạn kích thước khung, từ chối khung hỏng hay lạ.

#![forbid(unsafe_code)]

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{self, Read, Write};

/// Âm thanh worker trả luôn là 48 kHz mono, `i16`.
pub const SAMPLE_RATE: u32 = 48_000;
/// Chữ cần đọc dài tối đa chừng này byte (một câu phụ đề; cùng cỡ giới hạn ô Gõ dịch).
pub const MAX_TEXT_BYTES: usize = 4_000;
/// Một khung âm thanh chứa tối đa chừng này mẫu (1 s); worker cắt nhỏ hơn khi phát dần.
pub const MAX_PCM_SAMPLES: usize = SAMPLE_RATE as usize;
/// Tên giọng dài tối đa chừng này byte.
pub const MAX_VOICE_BYTES: usize = 64;
/// Khung lớn nhất: 1 s PCM `i16` (96 KB) dư nhiều.
pub const MAX_FRAME_BYTES: u32 = 512 * 1024;
/// Phiên bản giao thức, trường đầu của [`Response::Ready`]. App tắt nút nghe nếu worker báo số khác.
pub const PROTOCOL_VERSION: u32 = 3;
/// Tốc độ đọc cho phép (1.0 = bình thường); ngoài khoảng hay không hữu hạn thì [`Request::validate`] từ chối.
pub const SPEED_RANGE: std::ops::RangeInclusive<f32> = 0.8..=1.3;
/// Hệ số nhân thời gian nghỉ giữa các câu/cụm (1.0 = bình thường); cùng cách kiểm như [`SPEED_RANGE`].
pub const PAUSE_RANGE: std::ops::RangeInclusive<f32> = 0.5..=2.0;

/// Ngôn ngữ đọc. v3 Turbo chỉ có hai ngôn ngữ này; tiếng Hàn, Trung, Nhật không có nút nghe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Lang {
    Vi,
    En,
}

/// Lệnh từ app tới worker.
// Không `Eq`: có trường `f32`.
#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub enum Request {
    /// Đọc một câu. `voice = None` dùng giọng mặc định; `speed = None` là 1.0 ([`SPEED_RANGE`]); `pause_scale = None` là 1.0
    /// ([`PAUSE_RANGE`]). Hai trường cuối thêm ở phiên bản giao thức 3.
    Speak {
        id: u64,
        lang: Lang,
        text: String,
        voice: Option<String>,
        speed: Option<f32>,
        pause_scale: Option<f32>,
    },
    /// Hủy câu đang đọc (người dùng bấm lại, đổi câu hay đóng).
    Cancel { id: u64 },
    /// Thoát sạch.
    Shutdown,
    /// Nạp model sẵn (mất vài giây ở lần đầu) để lần đọc đầu không bị trễ. Trả `Done { id }` hoặc `Failed { id, .. }`.
    /// Thêm ở phiên bản giao thức 2.
    Warmup { id: u64 },
    /// Hỏi danh sách giọng. Trả `Voices { id, .. }`. Thêm ở phiên bản giao thức 3.
    ListVoices { id: u64 },
}

/// Loại lỗi gửi về app (không kèm chữ của người dùng).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ErrorKind {
    /// Model chưa tải hoặc hỏng (sai SHA-256).
    ModelMissing,
    /// Chữ rỗng, quá dài hay ngôn ngữ không hỗ trợ.
    BadRequest,
    /// Lỗi khi suy luận.
    Inference,
    /// Bị hủy bởi [`Request::Cancel`].
    Cancelled,
}

/// Trả lời từ worker tới app.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Response {
    /// Worker sẵn sàng; trường đầu là [`PROTOCOL_VERSION`].
    Ready { protocol: u32 },
    /// Một đoạn PCM 48 kHz mono của câu `id`; `seq` tăng dần từ 0.
    Audio { id: u64, seq: u32, pcm: Vec<i16> },
    /// Hết câu `id`.
    Done { id: u64 },
    /// Câu `id` lỗi.
    Failed { id: u64, kind: ErrorKind },
    /// Danh sách giọng (trả lời [`Request::ListVoices`]) và giọng mặc định. Thêm ở phiên bản giao thức 3.
    Voices {
        id: u64,
        names: Vec<String>,
        default: String,
    },
}

impl fmt::Debug for Request {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Request::Speak {
                id,
                lang,
                text,
                voice,
                speed,
                pause_scale,
            } => f
                .debug_struct("Speak")
                .field("id", id)
                .field("lang", lang)
                .field("text_bytes", &text.len())
                .field("voice_set", &voice.is_some())
                .field("speed", speed)
                .field("pause_scale", pause_scale)
                .finish(),
            Request::Cancel { id } => f.debug_struct("Cancel").field("id", id).finish(),
            Request::Shutdown => f.write_str("Shutdown"),
            Request::Warmup { id } => f.debug_struct("Warmup").field("id", id).finish(),
            Request::ListVoices { id } => f.debug_struct("ListVoices").field("id", id).finish(),
        }
    }
}

impl fmt::Debug for Response {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Response::Ready { protocol } => f.debug_struct("Ready").field("protocol", protocol).finish(),
            Response::Audio { id, seq, pcm } => f
                .debug_struct("Audio")
                .field("id", id)
                .field("seq", seq)
                .field("samples", &pcm.len())
                .finish(),
            Response::Done { id } => f.debug_struct("Done").field("id", id).finish(),
            Response::Failed { id, kind } => f.debug_struct("Failed").field("id", id).field("kind", kind).finish(),
            Response::Voices { id, names, .. } => f
                .debug_struct("Voices")
                .field("id", id)
                .field("count", &names.len())
                .finish(),
        }
    }
}

/// Lý do một khung bị từ chối.
#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("lỗi I/O: {0}")]
    Io(#[from] io::Error),
    #[error("khung dài {0} byte, vượt giới hạn")]
    FrameTooLarge(u32),
    #[error("khung không giải mã được: {0}")]
    Decode(String),
    #[error("nội dung khung vi phạm giới hạn: {0}")]
    Invalid(&'static str),
    #[error("không mã hóa được: {0}")]
    Encode(String),
}

impl Request {
    /// Kiểm giới hạn nội dung; worker gọi sau khi giải mã (khung của app cũng chỉ tin vừa đủ).
    pub fn validate(&self) -> Result<(), ProtocolError> {
        if let Request::Speak {
            text,
            voice,
            speed,
            pause_scale,
            ..
        } = self
        {
            if text.trim().is_empty() {
                return Err(ProtocolError::Invalid("chữ rỗng"));
            }
            if text.len() > MAX_TEXT_BYTES {
                return Err(ProtocolError::Invalid("chữ quá dài"));
            }
            if voice.as_ref().is_some_and(|v| v.len() > MAX_VOICE_BYTES) {
                return Err(ProtocolError::Invalid("tên giọng quá dài"));
            }
            // `RangeInclusive::contains` trả false với NaN; vô cực nằm ngoài khoảng.
            if speed.is_some_and(|v| !SPEED_RANGE.contains(&v)) {
                return Err(ProtocolError::Invalid("tốc độ ngoài khoảng"));
            }
            if pause_scale.is_some_and(|v| !PAUSE_RANGE.contains(&v)) {
                return Err(ProtocolError::Invalid("hệ số nghỉ ngoài khoảng"));
            }
        }
        Ok(())
    }
}

impl Response {
    /// App coi khung của worker là dữ liệu chưa tin.
    pub fn validate(&self) -> Result<(), ProtocolError> {
        if let Response::Audio { pcm, .. } = self
            && pcm.len() > MAX_PCM_SAMPLES
        {
            return Err(ProtocolError::Invalid("khung âm thanh quá dài"));
        }
        Ok(())
    }
}

/// Ghi một khung: độ dài `u32` LE rồi nội dung postcard.
pub fn write_frame<T: Serialize, W: Write>(w: &mut W, value: &T) -> Result<(), ProtocolError> {
    let body = postcard::to_stdvec(value).map_err(|e| ProtocolError::Encode(e.to_string()))?;
    let len = u32::try_from(body.len()).map_err(|_| ProtocolError::FrameTooLarge(u32::MAX))?;
    if len > MAX_FRAME_BYTES {
        return Err(ProtocolError::FrameTooLarge(len));
    }
    w.write_all(&len.to_le_bytes())?;
    w.write_all(&body)?;
    w.flush()?;
    Ok(())
}

/// Đọc một khung. `Ok(None)` khi đầu kia đóng đúng ranh giới khung.
pub fn read_frame<T: DeserializeOwned, R: Read>(r: &mut R) -> Result<Option<T>, ProtocolError> {
    let mut len_buf = [0u8; 4];
    match r.read(&mut len_buf[..1])? {
        0 => return Ok(None),
        _ => r.read_exact(&mut len_buf[1..])?,
    }
    let len = u32::from_le_bytes(len_buf);
    if len > MAX_FRAME_BYTES {
        return Err(ProtocolError::FrameTooLarge(len));
    }
    let mut body = vec![0u8; len as usize];
    r.read_exact(&mut body)?;
    postcard::from_bytes(&body)
        .map(Some)
        .map_err(|e| ProtocolError::Decode(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip<T: Serialize + DeserializeOwned + PartialEq + fmt::Debug>(v: T) {
        let mut buf = Vec::new();
        write_frame(&mut buf, &v).unwrap();
        let got: Option<T> = read_frame(&mut buf.as_slice()).unwrap();
        assert_eq!(got.as_ref(), Some(&v));
    }

    #[test]
    fn requests_roundtrip() {
        roundtrip(Request::Speak {
            id: 7,
            lang: Lang::Vi,
            text: "Xin chào".into(),
            voice: Some("Minh Quân".into()),
            speed: None,
            pause_scale: None,
        });
        roundtrip(Request::Speak {
            id: 8,
            lang: Lang::En,
            text: "Hello".into(),
            voice: None,
            speed: None,
            pause_scale: None,
        });
        roundtrip(Request::Cancel { id: 7 });
        roundtrip(Request::Shutdown);
        roundtrip(Request::Warmup { id: 5 });
    }

    #[test]
    fn responses_roundtrip() {
        roundtrip(Response::Ready {
            protocol: PROTOCOL_VERSION,
        });
        roundtrip(Response::Audio {
            id: 1,
            seq: 0,
            pcm: vec![0, 1, -1, i16::MAX, i16::MIN],
        });
        roundtrip(Response::Done { id: 1 });
        roundtrip(Response::Failed {
            id: 1,
            kind: ErrorKind::Cancelled,
        });
    }

    /// postcard mã hóa enum theo chỉ số: đổi thứ tự hay chèn giữa là phá giao thức.
    #[test]
    fn variant_indices_are_pinned() {
        let idx = |v: &Request| postcard::to_stdvec(v).unwrap()[0];
        assert_eq!(
            idx(&Request::Speak {
                id: 0,
                lang: Lang::Vi,
                text: String::new(),
                voice: None,
                speed: None,
                pause_scale: None
            }),
            0
        );
        assert_eq!(idx(&Request::ListVoices { id: 0 }), 4);
        assert_eq!(idx(&Request::Cancel { id: 0 }), 1);
        assert_eq!(idx(&Request::Shutdown), 2);
        assert_eq!(idx(&Request::Warmup { id: 0 }), 3);
        let ridx = |v: &Response| postcard::to_stdvec(v).unwrap()[0];
        assert_eq!(ridx(&Response::Ready { protocol: 0 }), 0);
        assert_eq!(
            ridx(&Response::Audio {
                id: 0,
                seq: 0,
                pcm: vec![]
            }),
            1
        );
        assert_eq!(ridx(&Response::Done { id: 0 }), 2);
        assert_eq!(
            ridx(&Response::Failed {
                id: 0,
                kind: ErrorKind::ModelMissing
            }),
            3
        );
        assert_eq!(
            ridx(&Response::Voices {
                id: 0,
                names: vec![],
                default: String::new()
            }),
            4
        );
        assert_eq!(postcard::to_stdvec(&Lang::Vi).unwrap(), [0]);
        assert_eq!(postcard::to_stdvec(&Lang::En).unwrap(), [1]);
    }

    #[test]
    fn clean_eof_is_none() {
        let got: Option<Request> = read_frame(&mut [].as_slice()).unwrap();
        assert!(got.is_none());
    }

    #[test]
    fn oversize_frame_is_rejected_before_allocating() {
        let bytes = (MAX_FRAME_BYTES + 1).to_le_bytes();
        let err = read_frame::<Request, _>(&mut bytes.as_slice()).unwrap_err();
        assert!(matches!(err, ProtocolError::FrameTooLarge(_)));
    }

    #[test]
    fn truncated_frame_is_an_error() {
        let mut buf = Vec::new();
        write_frame(&mut buf, &Request::Cancel { id: 1 }).unwrap();
        buf.pop();
        assert!(read_frame::<Request, _>(&mut buf.as_slice()).is_err());
        assert!(read_frame::<Request, _>(&mut buf[..2].as_ref()).is_err());
    }

    #[test]
    fn garbage_frame_is_decode_error() {
        let mut buf = 3u32.to_le_bytes().to_vec();
        buf.extend_from_slice(&[0xFF, 0xFF, 0xFF]);
        assert!(matches!(
            read_frame::<Request, _>(&mut buf.as_slice()),
            Err(ProtocolError::Decode(_))
        ));
    }

    #[test]
    fn validate_limits() {
        let ok = Request::Speak {
            id: 1,
            lang: Lang::Vi,
            text: "a".into(),
            voice: None,
            speed: None,
            pause_scale: None,
        };
        assert!(ok.validate().is_ok());
        let empty = Request::Speak {
            id: 1,
            lang: Lang::Vi,
            text: "  \n".into(),
            voice: None,
            speed: None,
            pause_scale: None,
        };
        assert!(empty.validate().is_err());
        let long = Request::Speak {
            id: 1,
            lang: Lang::En,
            text: "a".repeat(MAX_TEXT_BYTES + 1),
            voice: None,
            speed: None,
            pause_scale: None,
        };
        assert!(long.validate().is_err());
        let voice = Request::Speak {
            id: 1,
            lang: Lang::En,
            text: "a".into(),
            voice: Some("v".repeat(MAX_VOICE_BYTES + 1)),
            speed: None,
            pause_scale: None,
        };
        assert!(voice.validate().is_err());
        assert!(Request::Shutdown.validate().is_ok());
        let big = Response::Audio {
            id: 1,
            seq: 0,
            pcm: vec![0; MAX_PCM_SAMPLES + 1],
        };
        assert!(big.validate().is_err());
    }

    #[test]
    fn debug_never_prints_text_or_audio() {
        let r = Request::Speak {
            id: 1,
            lang: Lang::Vi,
            text: "bí mật cuộc họp".into(),
            voice: None,
            speed: None,
            pause_scale: None,
        };
        assert!(!format!("{r:?}").contains("bí mật"));
        let a = Response::Audio {
            id: 1,
            seq: 0,
            pcm: vec![12345; 4],
        };
        assert!(!format!("{a:?}").contains("12345"));
    }

    #[test]
    fn max_audio_frame_fits_frame_limit() {
        let mut buf = Vec::new();
        write_frame(
            &mut buf,
            &Response::Audio {
                id: u64::MAX,
                seq: u32::MAX,
                pcm: vec![i16::MIN; MAX_PCM_SAMPLES],
            },
        )
        .unwrap();
        assert!(buf.len() <= MAX_FRAME_BYTES as usize + 4);
    }

    fn speak_with(speed: Option<f32>, pause_scale: Option<f32>) -> Request {
        Request::Speak {
            id: 1,
            lang: Lang::Vi,
            text: "a".into(),
            voice: None,
            speed,
            pause_scale,
        }
    }

    #[test]
    fn speak_roundtrip_with_new_fields() {
        roundtrip(Request::Speak {
            id: 9,
            lang: Lang::En,
            text: "Hello".into(),
            voice: Some("B".into()),
            speed: Some(1.25),
            pause_scale: Some(0.5),
        });
        assert!(
            speak_with(Some(*SPEED_RANGE.start()), Some(*PAUSE_RANGE.end()))
                .validate()
                .is_ok()
        );
        assert!(
            speak_with(Some(*SPEED_RANGE.end()), Some(*PAUSE_RANGE.start()))
                .validate()
                .is_ok()
        );
    }

    #[test]
    fn list_voices_roundtrip() {
        roundtrip(Request::ListVoices { id: 3 });
        roundtrip(Response::Voices {
            id: 3,
            names: vec!["A".into(), "Minh Quân".into()],
            default: "A".into(),
        });
        assert!(Request::ListVoices { id: 3 }.validate().is_ok());
    }

    #[test]
    fn validate_rejects_out_of_range_speed() {
        for v in [0.79, 1.31, f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            assert!(speak_with(Some(v), None).validate().is_err(), "speed {v}");
        }
    }

    #[test]
    fn validate_rejects_out_of_range_pause() {
        for v in [0.49, 2.01, f32::NAN, f32::INFINITY] {
            assert!(speak_with(None, Some(v)).validate().is_err(), "pause {v}");
        }
    }

    #[test]
    fn ready_reports_protocol_3() {
        assert_eq!(PROTOCOL_VERSION, 3);
    }
}
