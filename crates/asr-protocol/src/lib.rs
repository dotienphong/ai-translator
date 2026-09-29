//! Giao thức giữa tiến trình chính và `asr-worker` (spec §6.4).
//!
//! Mỗi khung gồm độ dài `u32` little-endian, theo sau là nội dung mã hóa bằng postcard.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

/// Âm thanh gửi cho `asr-worker` luôn là 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;

/// Một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB; 16 MiB là dư nhiều.
pub const MAX_FRAME_BYTES: u32 = 16 * 1024 * 1024;

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

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
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

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
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

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error("lỗi I/O: {0}")]
    Io(#[from] io::Error),
    #[error("khung dài {0} byte, vượt giới hạn {MAX_FRAME_BYTES}")]
    TooLarge(u64),
    #[error("lỗi mã hóa: {0}")]
    Codec(#[from] postcard::Error),
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
    Ok(Some(postcard::from_bytes(&buf)?))
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
    let frames = (n_samples as u64 * 50).div_ceil(SAMPLE_RATE as u64);
    (frames as i32 + 64).min(1500)
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
}
