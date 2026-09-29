//! Giao thức giữa tiến trình chính và `asr-worker` (spec §6.4).
//!
//! Mỗi khung gồm độ dài `u32` little-endian, theo sau là nội dung mã hóa bằng postcard.

#![forbid(unsafe_code)]

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{self, Read, Write};

/// Âm thanh gửi cho `asr-worker` luôn là 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;

/// Một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB; 16 MiB là dư nhiều.
pub const MAX_FRAME_BYTES: u32 = 16 * 1024 * 1024;

/// Yêu cầu từ app gửi cho `asr-worker`. Mỗi yêu cầu có đúng một phản hồi, trừ `Shutdown` (worker thoát, không phản hồi):
/// `Load` → `Ready` hoặc `Error`; `Warmup` → `WarmupDone` hoặc `Error`; `Transcribe` → `Result` hoặc `Error`.
///
/// postcard mã hóa enum theo chỉ số biến thể (thứ tự khai báo): chỉ thêm biến thể mới ở CUỐI, không đổi thứ tự.
/// Thêm hoặc bỏ trường cũng đổi định dạng trên dây, nên app và `asr-worker` luôn phải build cùng một lúc.
/// Test `variant_indices_are_pinned` sẽ đỏ nếu vi phạm.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Request {
    Load {
        model_path: String,
        use_gpu: bool,
        n_threads: u32,
    },
    Warmup,
    Transcribe(TranscribeRequest),
    Shutdown,
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct TranscribeRequest {
    pub segment_id: u64,
    /// Âm thanh 16 kHz mono.
    pub pcm: Vec<i16>,
    /// Mã ngôn ngữ Whisper được phép, ví dụ `["en", "vi"]`. Một phần tử nghĩa là khóa ngôn ngữ.
    pub languages: Vec<String>,
    /// Tối đa 100 token của đoạn trước cùng ngôn ngữ, dùng làm prompt khởi đầu.
    pub prompt_tokens: Vec<i32>,
    pub audio_ctx: i32,
}

/// Phản hồi của `asr-worker`. Cùng quy tắc chỉ-thêm-ở-cuối như [`Request`].
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Response {
    Ready {
        backend: String,
        /// `shared` (chế độ B: nhận diện ngôn ngữ và chép lời dùng chung một lượt encode) hoặc `split` (chế độ A).
        decode_mode: String,
        whisper_version: String,
        system_info: String,
    },
    WarmupDone {
        millis: f32,
    },
    Result(TranscribeResult),
    Error {
        segment_id: Option<u64>,
        message: String,
    },
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct TranscribeResult {
    pub segment_id: u64,
    pub lang: String,
    pub lang_prob: f32,
    pub text: String,
    pub tokens: Vec<i32>,
    pub no_speech_prob: f32,
    /// Thời gian nhận diện ngôn ngữ, 0 nếu ngôn ngữ bị khóa.
    pub lid_ms: f32,
    /// Thời gian chép lời (encode + decode).
    pub asr_ms: f32,
}

// Debug viết tay: âm thanh và nội dung chép lời không bao giờ được vào log (spec §10.1, §10.2).
impl fmt::Debug for TranscribeRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TranscribeRequest")
            .field("segment_id", &self.segment_id)
            .field("pcm", &format_args!("<{} mẫu>", self.pcm.len()))
            .field("languages", &self.languages)
            .field("prompt_tokens", &format_args!("<{} token>", self.prompt_tokens.len()))
            .field("audio_ctx", &self.audio_ctx)
            .finish()
    }
}

impl fmt::Debug for TranscribeResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TranscribeResult")
            .field("segment_id", &self.segment_id)
            .field("lang", &self.lang)
            .field("lang_prob", &self.lang_prob)
            .field("text", &format_args!("<{} ký tự>", self.text.chars().count()))
            .field("tokens", &format_args!("<{} token>", self.tokens.len()))
            .field("no_speech_prob", &self.no_speech_prob)
            .field("lid_ms", &self.lid_ms)
            .field("asr_ms", &self.asr_ms)
            .finish()
    }
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

/// Đọc một khung. Trả `Ok(None)` khi luồng đóng đúng ở ranh giới giữa hai khung.
///
/// Sau `FrameError::Io` hoặc `FrameError::TooLarge` luồng đã mất đồng bộ: bên gọi phải bỏ luồng và khởi động lại
/// tiến trình phụ. Sau `Codec` hoặc `TrailingBytes` cả khung đã được đọc hết, nên luồng vẫn đồng bộ.
pub fn read_frame<R: Read, T: DeserializeOwned>(r: &mut R) -> Result<Option<T>, FrameError> {
    let mut len_buf = [0u8; 4];
    let got = read_up_to(r, &mut len_buf)?;
    if got == 0 {
        return Ok(None);
    }
    if got < len_buf.len() {
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

fn read_up_to<R: Read>(r: &mut R, buf: &mut [u8]) -> io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match r.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(filled)
}

/// `audio_ctx = min(1500, 50 × số giây của đoạn + 64)` (spec §6.4). Làm tròn lên.
pub fn audio_ctx_for_samples(n_samples: usize) -> i32 {
    let frames = (n_samples as u64).saturating_mul(50).div_ceil(SAMPLE_RATE as u64);
    frames.saturating_add(64).min(1500) as i32
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample_request() -> Request {
        Request::Transcribe(TranscribeRequest {
            segment_id: 7,
            pcm: vec![0, 1, -1, i16::MAX, i16::MIN],
            languages: vec!["en".into(), "vi".into()],
            prompt_tokens: vec![50364, 123],
            audio_ctx: 214,
        })
    }

    #[test]
    fn roundtrip_request_and_response() {
        let mut buf = Vec::new();
        write_frame(&mut buf, &sample_request()).unwrap();
        let ready = Response::Ready {
            backend: "metal".into(),
            decode_mode: "shared".into(),
            whisper_version: "1.8.3".into(),
            system_info: "NEON = 1".into(),
        };
        write_frame(&mut buf, &ready).unwrap();
        let resp = Response::Result(TranscribeResult {
            segment_id: 7,
            lang: "vi".into(),
            lang_prob: 0.93,
            text: "xin chào".into(),
            tokens: vec![1, 2, 3],
            no_speech_prob: 0.01,
            lid_ms: 12.5,
            asr_ms: 240.0,
        });
        write_frame(&mut buf, &resp).unwrap();

        let mut r = Cursor::new(buf);
        let got_req: Request = read_frame(&mut r).unwrap().unwrap();
        let got_ready: Response = read_frame(&mut r).unwrap().unwrap();
        let got_resp: Response = read_frame(&mut r).unwrap().unwrap();
        assert_eq!(got_req, sample_request());
        assert_eq!(got_ready, ready);
        assert_eq!(got_resp, resp);
        assert!(read_frame::<_, Request>(&mut r).unwrap().is_none());
    }

    #[test]
    fn empty_stream_is_clean_eof() {
        let mut r = Cursor::new(Vec::<u8>::new());
        assert!(read_frame::<_, Request>(&mut r).unwrap().is_none());
    }

    #[test]
    fn truncated_length_is_an_error() {
        let mut r = Cursor::new(vec![3u8, 0]);
        assert!(matches!(read_frame::<_, Request>(&mut r), Err(FrameError::Io(_))));
    }

    #[test]
    fn truncated_payload_is_an_error() {
        let mut buf = Vec::new();
        write_frame(&mut buf, &sample_request()).unwrap();
        buf.truncate(buf.len() - 1);
        let mut r = Cursor::new(buf);
        assert!(matches!(read_frame::<_, Request>(&mut r), Err(FrameError::Io(_))));
    }

    #[test]
    fn oversized_length_is_rejected() {
        let mut buf = (MAX_FRAME_BYTES + 1).to_le_bytes().to_vec();
        buf.extend_from_slice(&[0; 8]);
        let mut r = Cursor::new(buf);
        assert!(matches!(read_frame::<_, Request>(&mut r), Err(FrameError::TooLarge(_))));
    }

    #[test]
    fn audio_ctx_matches_spec_formula() {
        assert_eq!(audio_ctx_for_samples(48_000), 214); // 3 giây
        assert_eq!(audio_ctx_for_samples(134_400), 484); // 8,4 giây (8 giây + 2 × 200 ms đệm)
        assert_eq!(audio_ctx_for_samples(16_000 * 30), 1500); // 30 giây, bị chặn ở 1500
        assert_eq!(audio_ctx_for_samples(1), 65); // làm tròn lên
    }

    /// Mỗi lần `read` chỉ trả tối đa 1 byte, và cứ lần thứ hai lại báo `Interrupted` (giống pipe thật).
    struct Trickle<R> {
        inner: R,
        calls: usize,
    }

    impl<R: Read> Read for Trickle<R> {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            self.calls += 1;
            if self.calls.is_multiple_of(2) {
                return Err(io::ErrorKind::Interrupted.into());
            }
            let n = buf.len().min(1);
            self.inner.read(&mut buf[..n])
        }
    }

    #[test]
    fn survives_short_reads_and_interrupts() {
        let mut buf = Vec::new();
        write_frame(&mut buf, &sample_request()).unwrap();
        write_frame(&mut buf, &Request::Warmup).unwrap();
        let mut r = Trickle {
            inner: Cursor::new(buf),
            calls: 0,
        };
        assert_eq!(read_frame::<_, Request>(&mut r).unwrap().unwrap(), sample_request());
        assert_eq!(read_frame::<_, Request>(&mut r).unwrap().unwrap(), Request::Warmup);
        assert!(read_frame::<_, Request>(&mut r).unwrap().is_none());
    }

    /// Message có kích thước mã hóa đúng bằng `MAX_FRAME_BYTES` (1 byte biến thể + 1 byte Option + 4 byte độ dài chuỗi).
    fn message_of_exactly_max() -> Response {
        let msg = Response::Error {
            segment_id: None,
            message: "a".repeat(MAX_FRAME_BYTES as usize - 6),
        };
        assert_eq!(postcard::to_stdvec(&msg).unwrap().len(), MAX_FRAME_BYTES as usize);
        msg
    }

    #[test]
    fn frame_of_exactly_max_bytes_roundtrips() {
        let msg = message_of_exactly_max();
        let mut buf = Vec::new();
        write_frame(&mut buf, &msg).unwrap();
        let got: Response = read_frame(&mut Cursor::new(buf)).unwrap().unwrap();
        assert_eq!(got, msg);
    }

    #[test]
    fn write_rejects_oversized_message_and_writes_nothing() {
        let Response::Error {
            segment_id,
            mut message,
        } = message_of_exactly_max()
        else {
            unreachable!()
        };
        message.push('a'); // MAX + 1
        let mut out = Vec::new();
        let res = write_frame(&mut out, &Response::Error { segment_id, message });
        assert!(matches!(res, Err(FrameError::TooLarge(n)) if n == MAX_FRAME_BYTES as u64 + 1));
        assert!(out.is_empty());
    }

    #[test]
    fn write_frame_flushes_and_uses_le_length_prefix() {
        let mut w = std::io::BufWriter::new(Vec::new());
        write_frame(&mut w, &Request::Warmup).unwrap();
        // Không gọi flush: dữ liệu phải đã xuống Vec bên dưới. 4 byte độ dài LE, rồi chỉ số biến thể 1.
        assert_eq!(w.get_ref().as_slice(), &[1, 0, 0, 0, 1]);
    }

    /// Khóa chỉ số biến thể (postcard mã hóa enum theo thứ tự khai báo): đổi thứ tự sẽ làm test này đỏ.
    #[test]
    fn variant_indices_are_pinned() {
        fn index<T: Serialize>(v: &T) -> u8 {
            postcard::to_stdvec(v).unwrap()[0]
        }
        let load = Request::Load {
            model_path: String::new(),
            use_gpu: false,
            n_threads: 0,
        };
        let requests = [
            index(&load),
            index(&Request::Warmup),
            index(&sample_request()),
            index(&Request::Shutdown),
        ];
        assert_eq!(requests, [0, 1, 2, 3]);

        let ready = Response::Ready {
            backend: String::new(),
            decode_mode: String::new(),
            whisper_version: String::new(),
            system_info: String::new(),
        };
        let result = Response::Result(TranscribeResult {
            segment_id: 0,
            lang: String::new(),
            lang_prob: 0.0,
            text: String::new(),
            tokens: vec![],
            no_speech_prob: 0.0,
            lid_ms: 0.0,
            asr_ms: 0.0,
        });
        let error = Response::Error {
            segment_id: None,
            message: String::new(),
        };
        let warmup_done = Response::WarmupDone { millis: 0.0 };
        let responses = [index(&ready), index(&warmup_done), index(&result), index(&error)];
        assert_eq!(responses, [0, 1, 2, 3]);
    }

    #[test]
    fn trailing_bytes_in_a_frame_are_rejected() {
        // Warmup (chỉ số 1) kèm 2 byte thừa.
        let mut r = Cursor::new(vec![3, 0, 0, 0, 1, 0xAA, 0xBB]);
        assert!(matches!(
            read_frame::<_, Request>(&mut r),
            Err(FrameError::TrailingBytes(2))
        ));
    }

    #[test]
    fn debug_output_never_contains_audio_or_transcript() {
        let req = Request::Transcribe(TranscribeRequest {
            segment_id: 1,
            pcm: vec![12345; 1000],
            languages: vec!["vi".into()],
            prompt_tokens: vec![777; 3],
            audio_ctx: 100,
        });
        let s = format!("{req:?}");
        assert!(
            s.contains("<1000 mẫu>") && !s.contains("12345") && !s.contains("777"),
            "{s}"
        );
        let resp = Response::Result(TranscribeResult {
            segment_id: 1,
            lang: "vi".into(),
            lang_prob: 0.9,
            text: "bí mật cuộc họp".into(),
            tokens: vec![4242],
            no_speech_prob: 0.0,
            lid_ms: 0.0,
            asr_ms: 0.0,
        });
        let s = format!("{resp:?}");
        assert!(!s.contains("bí mật") && !s.contains("4242"), "{s}");
    }

    #[test]
    fn audio_ctx_is_total() {
        assert_eq!(audio_ctx_for_samples(0), 64);
        assert_eq!(audio_ctx_for_samples(1 << 40), 1500);
        assert_eq!(audio_ctx_for_samples(usize::MAX), 1500);
    }
}
