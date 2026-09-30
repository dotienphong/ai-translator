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

/// Số mẫu tối thiểu của một đoạn: 100 ms. Ngắn hơn thì `log_mel_spectrogram` của whisper.cpp đọc 200 mẫu đầu và
/// whisper.cpp bỏ qua đoạn, nên `asr-worker` trả `Error`.
pub const MIN_PCM_SAMPLES: usize = SAMPLE_RATE as usize / 10;

/// Số mẫu tối đa của một đoạn: 30 giây, đúng cửa sổ mã hóa tối đa của Whisper (1500 vị trí, mỗi vị trí 20 ms).
/// Dài hơn thì `asr-worker` trả `Error`.
pub const MAX_PCM_SAMPLES: usize = SAMPLE_RATE as usize * 30;

/// Số token tối đa của `prompt_tokens`: 100 token của đoạn trước cùng ngôn ngữ (spec §6.4). Nhiều hơn thì `asr-worker`
/// trả `Error`, để hai chế độ giải mã xử lý prompt giống nhau.
pub const MAX_PROMPT_TOKENS: usize = 100;

/// Sàn của `audio_ctx` mà [`audio_ctx_for_samples`] áp dụng: 512 khung (10,24 giây). Đoạn ngắn hơn 8,96 giây, nơi công
/// thức `50 × số giây + 64` cho dưới 512, được nâng lên bằng mức này. Đây là đề xuất cho §6.4 (xem kế hoạch 00, Task 2);
/// spec hiện chỉ có công thức không sàn. Lý do:
/// - A4 (S7): với cửa sổ mã hóa ngắn, Whisper chép thừa (lặp cụm cuối câu, chép cả câu hai lần). Có sàn thì tổng lỗi
///   trên 5 ngôn ngữ giảm 6,4% ở turbo và 1,5% ở small, không ô nào xấu đi đáng kể.
/// - S6: không có sàn thì turbo nhận diện ngôn ngữ sai ở 22/60 đoạn tiếng Việt (đoạn dưới 1,3 giây sai hết, thành
///   tiếng Anh); có sàn thì 53/60 đoạn đúng.
///
/// Chi phí: turbo chậm thêm khoảng 90 ms ở đoạn dưới 5 giây, small khoảng 15 ms; từ 9 giây trở lên không đổi.
pub const MIN_AUDIO_CTX: i32 = 512;

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
    /// Âm thanh 16 kHz mono, từ [`MIN_PCM_SAMPLES`] đến [`MAX_PCM_SAMPLES`] mẫu (0,1 đến 30 giây); ngoài khoảng này
    /// worker trả `Error`.
    pub pcm: Vec<i16>,
    /// Mã ngôn ngữ Whisper được phép, ví dụ `["en", "vi"]`. Một phần tử nghĩa là khóa ngôn ngữ.
    pub languages: Vec<String>,
    /// Tối đa [`MAX_PROMPT_TOKENS`] token của đoạn trước cùng ngôn ngữ, dùng làm prompt khởi đầu; nhiều hơn thì worker
    /// trả `Error`.
    pub prompt_tokens: Vec<i32>,
    /// Cửa sổ mã hóa, mỗi vị trí 20 ms, trong khoảng 0 đến 1500. 0 nghĩa là cửa sổ 30 giây; giá trị khác phải phủ hết
    /// `pcm` (`audio_ctx · 320 ≥ pcm.len()`), nếu không worker trả `Error` vì whisper.cpp sẽ lặng lẽ bỏ phần đuôi.
    /// Công thức thường dùng: [`audio_ctx_for_samples`].
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
    /// Trung bình log-xác suất của các token văn bản đã sinh. Không tính token đặc biệt, kể cả EOT: cố ý khác OpenAI
    /// (OpenAI cộng cả log-xác suất của EOT rồi chia cho số token cộng 1). Bỏ EOT thì trung bình âm hơn một chút, rõ ở
    /// đoạn ngắn, nên luật bên dưới chặt hơn một chút. Không có token nào thì là 0,0. Chế độ B bỏ log-xác suất của phần
    /// bị `cut_loop` gom; chế độ A không có `cut_loop` nên trung bình gồm cả token lặp.
    ///
    /// Cùng `no_speech_prob`, dùng để bỏ đoạn không có tiếng nói theo luật đề xuất cho §6.4 (xem kế hoạch 00, Task 2;
    /// spec hiện chỉ có `no_speech_prob > 0,6`): bỏ khi `no_speech_prob > 0,6` **và** `avg_logprob < −1`. Trên A4
    /// (548 clip) luật bỏ đúng 1 clip, small `en-9810650684898829002_nb`, có bản chép là ảo giác; turbo 0 clip.
    ///
    /// Nằm cuối struct để bố cục trên dây dễ đọc và dễ kiểm (postcard mã hóa trường theo thứ tự khai báo). Việc này
    /// không cho lợi ích tương thích: thêm hay bỏ trường nào cũng đổi định dạng, nên app và `asr-worker` luôn phải build
    /// cùng nhau (xem [`Request`]). Test `avg_logprob_is_the_last_field_on_the_wire` chỉ khóa bố cục.
    pub avg_logprob: f32,
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
            .field("avg_logprob", &self.avg_logprob)
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

/// `audio_ctx = min(1500, max(MIN_AUDIO_CTX, ceil(50 × số giây của đoạn) + 64))`. Làm tròn lên. Công thức của spec §6.4
/// là `min(1500, 50 × số giây + 64)`; sàn [`MIN_AUDIO_CTX`] là đề xuất cho §6.4 (xem kế hoạch 00, Task 2), giải thích ở
/// hằng đó.
pub fn audio_ctx_for_samples(n_samples: usize) -> i32 {
    let frames = (n_samples as u64).saturating_mul(50).div_ceil(SAMPLE_RATE as u64);
    frames.saturating_add(64).max(MIN_AUDIO_CTX as u64).min(1500) as i32
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
            avg_logprob: -0.31,
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
        // Trên sàn: 50 × số giây + 64, làm tròn lên.
        assert_eq!(audio_ctx_for_samples(143_361), 513); // vừa quá 8,96 giây: 449 + 64
        assert_eq!(audio_ctx_for_samples(16_000 * 12), 664); // 12 giây: 600 + 64
        assert_eq!(audio_ctx_for_samples(16_000 * 30 - 1), 1500); // sát 30 giây, bị chặn ở 1500
        assert_eq!(audio_ctx_for_samples(16_000 * 30), 1500); // 30 giây
    }

    #[test]
    fn audio_ctx_has_a_floor() {
        assert_eq!(MIN_AUDIO_CTX, 512);
        // Công thức thuần cho 1 + 64 = 65, 214, 484: sàn nâng cả ba lên 512.
        assert_eq!(audio_ctx_for_samples(1), 512);
        assert_eq!(audio_ctx_for_samples(48_000), 512); // 3 giây
        assert_eq!(audio_ctx_for_samples(134_400), 512); // 8,4 giây (8 giây + 2 × 200 ms đệm)
        // Sàn hết tác dụng đúng ở 8,96 giây, nơi công thức cho 448 + 64 = 512.
        assert_eq!(audio_ctx_for_samples(143_360), 512);
        // Sàn là một cửa sổ hợp lệ, và phủ được đoạn dài nhất mà công thức còn để nguyên (8,96 giây).
        assert!((0..=1500).contains(&MIN_AUDIO_CTX));
        assert!(MIN_AUDIO_CTX as usize * 320 >= 143_360);
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
            avg_logprob: 0.0,
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
            avg_logprob: -0.5,
        });
        let s = format!("{resp:?}");
        assert!(!s.contains("bí mật") && !s.contains("4242"), "{s}");
        assert!(s.contains("avg_logprob: -0.5"), "{s}");
    }

    /// `avg_logprob` nằm cuối struct: postcard mã hóa trường theo thứ tự khai báo, nên 4 byte cuối của phản hồi
    /// `Result` là `avg_logprob` (f32 little-endian). Thêm trường sau nó, hoặc đổi chỗ, sẽ làm test này đỏ. Test chỉ khóa
    /// bố cục, không bảo đảm tương thích giữa hai bản build khác nhau.
    #[test]
    fn avg_logprob_is_the_last_field_on_the_wire() {
        let result = TranscribeResult {
            segment_id: 1,
            lang: "vi".into(),
            lang_prob: 0.9,
            text: "xin chào".into(),
            tokens: vec![1, 2],
            no_speech_prob: 0.1,
            lid_ms: 1.0,
            asr_ms: 2.0,
            avg_logprob: -0.8125,
        };
        let bytes = postcard::to_stdvec(&result).unwrap();
        assert_eq!(bytes[bytes.len() - 4..], (-0.8125f32).to_le_bytes());
        assert_eq!(postcard::from_bytes::<TranscribeResult>(&bytes).unwrap(), result);
    }

    #[test]
    fn audio_ctx_is_total() {
        assert_eq!(audio_ctx_for_samples(0), MIN_AUDIO_CTX);
        assert_eq!(audio_ctx_for_samples(1 << 40), 1500);
        assert_eq!(audio_ctx_for_samples(usize::MAX), 1500);
    }
}
