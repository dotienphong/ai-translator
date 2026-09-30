//! Chạy whisper.cpp qua whisper-rs (spec §6.4).
//!
//! Có hai chế độ giải mã:
//! - Chế độ A (`split`): nhận diện ngôn ngữ dùng một `WhisperState` riêng, luôn mã hóa 3 giây đầu của đoạn
//!   với `audio_ctx` cố định, rồi `whisper_full` chép lời. whisper.cpp chỉ đặt `audio_ctx` bên trong
//!   `whisper_full`, nên state này được `whisper_full` một lần ngay trong `Engine::load` (không đợi `Warmup`)
//!   rồi không chạy `whisper_full` nữa.
//! - Chế độ B (`shared`, xem `shared.rs`): một lượt encode dùng chung cho cả hai việc, nên chỉ có một state (state
//!   chép lời) và không tạo state nhận diện ngôn ngữ. Là mặc định khi build với feature `shared-encode`; đặt
//!   `ASR_MODE=split` để chạy chế độ A khi cần so sánh.

use crate::lid::pick_language;
use anyhow::{Context, Result, bail};
use asr_protocol::{
    MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_PCM_SAMPLES, SAMPLE_RATE, TranscribeRequest, TranscribeResult,
    audio_ctx_for_samples,
};
use std::time::Instant;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

/// Nhận diện ngôn ngữ trên tối đa 3 giây đầu của đoạn (spec §6.4).
pub const LID_SAMPLES: usize = SAMPLE_RATE as usize * 3;
pub(crate) const MIN_LANG_PROB: f32 = 0.5;
/// Cửa sổ mã hóa tối đa của Whisper: 1500 vị trí, tức 30 giây.
const MAX_AUDIO_CTX: i32 = 1500;
/// Số mẫu 16 kHz mà một vị trí của `audio_ctx` phủ (20 ms).
const SAMPLES_PER_CTX: usize = SAMPLE_RATE as usize / 50;
// Cửa sổ tối đa phủ đúng đoạn dài nhất mà `asr-protocol` cho phép.
const _: () = assert!(MAX_AUDIO_CTX as usize * SAMPLES_PER_CTX == MAX_PCM_SAMPLES);

pub struct Engine {
    ctx: WhisperContext,
    asr_state: WhisperState,
    /// Chỉ có khi chạy chế độ A; chế độ B nhận diện ngôn ngữ ngay trên `asr_state`.
    lid_state: Option<WhisperState>,
    n_threads: usize,
    flash_attn: bool,
    prev_lang: Option<i32>,
    /// Có giá trị khi chạy chế độ B.
    #[cfg(feature = "shared-encode")]
    shared: Option<crate::shared::Decoder>,
}

impl Engine {
    pub fn load(model_path: &str, use_gpu: bool, n_threads: u32) -> Result<Self> {
        // Flash attention mặc định TẮT: whisper.cpp 1.8.3 đọc K/V của encoder và cross-attention tới GGML_PAD(audio_ctx, 256)
        // mà không có mask, nên với audio_ctx rút ngắn kết quả sai và phụ thuộc các đoạn trước (ggml-org/whisper.cpp#3941).
        // Chỉ đặt `ASR_FLASH_ATTN=1` khi whisper.cpp đã có bản vá đó.
        let flash_attn = use_gpu && std::env::var("ASR_FLASH_ATTN").as_deref() == Ok("1");
        let n_threads = clamp_threads(n_threads);
        let params = WhisperContextParameters {
            use_gpu,
            flash_attn,
            ..Default::default()
        };
        let ctx = WhisperContext::new_with_params(model_path, params)
            .with_context(|| format!("không nạp được model {model_path}"))?;
        let asr_state = ctx.create_state().context("tạo state chép lời")?;
        #[cfg(feature = "shared-encode")]
        let shared = (std::env::var("ASR_MODE").as_deref() != Ok("split")).then(|| crate::shared::Decoder::new(&ctx));
        // Chỉ chế độ A cần state nhận diện ngôn ngữ riêng: không có feature `shared-encode`, hoặc có mà `ASR_MODE=split`.
        #[cfg(feature = "shared-encode")]
        let split_mode = shared.is_none();
        #[cfg(not(feature = "shared-encode"))]
        let split_mode = true;
        let lid_state = if split_mode {
            Some(create_lid_state(&ctx, n_threads)?)
        } else {
            None
        };
        Ok(Self {
            ctx,
            asr_state,
            lid_state,
            n_threads,
            flash_attn,
            prev_lang: None,
            #[cfg(feature = "shared-encode")]
            shared,
        })
    }

    /// `shared` (chế độ B) hoặc `split` (chế độ A).
    pub fn decode_mode(&self) -> &'static str {
        #[cfg(feature = "shared-encode")]
        if self.shared.is_some() {
            return "shared";
        }
        "split"
    }

    /// Flash attention có đang bật không. Mặc định tắt, xem `load`.
    pub fn flash_attn(&self) -> bool {
        self.flash_attn
    }

    /// Chạy thử trên 3 giây im lặng để nạp sẵn kernel GPU cho state chép lời. Ở chế độ A, state nhận diện ngôn ngữ
    /// đã được làm nóng và đặt `audio_ctx` ngay trong `load`; chế độ B không có state đó.
    pub fn warmup(&mut self) -> Result<f32> {
        let silence = vec![0.0f32; LID_SAMPLES];
        let started = Instant::now();
        let params = full_params(self.n_threads, "en", audio_ctx_for_samples(silence.len()));
        self.asr_state
            .full(params, &silence)
            .context("làm nóng state chép lời")?;
        Ok(started.elapsed().as_secs_f32() * 1000.0)
    }

    pub fn transcribe(&mut self, req: &TranscribeRequest) -> Result<TranscribeResult> {
        // Kiểm đầu vào trước mọi lệnh gọi whisper, cho cả hai chế độ: đầu vào sai trả `Error` qua giao thức chứ không
        // làm worker chết (whisper-rs panic khi mã ngôn ngữ chứa NUL, mà bản release đặt panic = abort).
        if req.languages.is_empty() {
            bail!("danh sách ngôn ngữ rỗng");
        }
        if let Some(l) = req.languages.iter().find(|l| l.contains('\0')) {
            bail!("mã ngôn ngữ chứa ký tự NUL: {l:?}");
        }
        if req.pcm.len() < MIN_PCM_SAMPLES {
            bail!("đoạn quá ngắn: {} mẫu (tối thiểu {MIN_PCM_SAMPLES})", req.pcm.len());
        }
        if req.pcm.len() > MAX_PCM_SAMPLES {
            bail!("đoạn quá dài: {} mẫu (tối đa {MAX_PCM_SAMPLES})", req.pcm.len());
        }
        if req.prompt_tokens.len() > MAX_PROMPT_TOKENS {
            bail!(
                "prompt quá dài: {} token (tối đa {MAX_PROMPT_TOKENS})",
                req.prompt_tokens.len()
            );
        }
        let eot = self.ctx.token_eot();
        if let Some(t) = req.prompt_tokens.iter().find(|&&t| !(0..eot).contains(&t)) {
            bail!("prompt_tokens có token {t} ngoài khoảng [0, {eot})");
        }
        if !(0..=MAX_AUDIO_CTX).contains(&req.audio_ctx) {
            bail!("audio_ctx {} ngoài khoảng [0, {MAX_AUDIO_CTX}]", req.audio_ctx);
        }
        // 0 là cửa sổ đầy đủ 30 giây. Cửa sổ nào ngắn hơn đoạn thì whisper.cpp lặng lẽ bỏ phần đuôi (chế độ B chỉ ra
        // phần đầu), nên `audio_ctx` phải phủ hết đoạn. Đoạn dài hơn 30 giây đã bị từ chối ở trên, kể cả khi
        // `audio_ctx` là 0.
        let window = if req.audio_ctx == 0 {
            MAX_AUDIO_CTX
        } else {
            req.audio_ctx
        };
        if window as usize * SAMPLES_PER_CTX < req.pcm.len() {
            bail!(
                "audio_ctx {} chỉ phủ {} mẫu, ngắn hơn đoạn ({} mẫu)",
                req.audio_ctx,
                window as usize * SAMPLES_PER_CTX,
                req.pcm.len()
            );
        }
        let allowed = req
            .languages
            .iter()
            .map(|l| whisper_rs::get_lang_id(l).with_context(|| format!("mã ngôn ngữ không hợp lệ: {l}")))
            .collect::<Result<Vec<i32>>>()?;
        let pcm: Vec<f32> = req.pcm.iter().map(|&s| s as f32 / 32768.0).collect();

        #[cfg(feature = "shared-encode")]
        if let Some(decoder) = &self.shared {
            let started = Instant::now();
            let d = decoder.transcribe(
                &self.ctx,
                &mut self.asr_state,
                &pcm,
                req.audio_ctx,
                &allowed,
                self.prev_lang,
                &req.prompt_tokens,
                self.n_threads,
            )?;
            let total_ms = started.elapsed().as_secs_f32() * 1000.0;
            self.prev_lang = Some(d.lang_id);
            return Ok(TranscribeResult {
                segment_id: req.segment_id,
                lang: whisper_rs::get_lang_str(d.lang_id)
                    .context("lang id không hợp lệ")?
                    .to_string(),
                lang_prob: d.lang_prob,
                text: d.text,
                tokens: d.tokens,
                no_speech_prob: d.no_speech_prob,
                lid_ms: d.lid_ms,
                asr_ms: total_ms - d.lid_ms,
            });
        }

        let lid_started = Instant::now();
        let (lang_id, lang_prob) = if allowed.len() == 1 {
            (allowed[0], 1.0)
        } else {
            let head = &pcm[..pcm.len().min(LID_SAMPLES)];
            let lid_state = self.lid_state.as_mut().context("thiếu state nhận diện ngôn ngữ")?;
            lid_state
                .pcm_to_mel(head, self.n_threads)
                .context("tính mel cho nhận diện ngôn ngữ")?;
            let (_, probs) = lid_state.lang_detect(0, self.n_threads).context("nhận diện ngôn ngữ")?;
            pick_language(&probs, &allowed, self.prev_lang, MIN_LANG_PROB)
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };
        let lang = whisper_rs::get_lang_str(lang_id).context("lang id không hợp lệ")?;

        let asr_started = Instant::now();
        let mut params = full_params(self.n_threads, lang, req.audio_ctx);
        if !req.prompt_tokens.is_empty() {
            params.set_tokens(&req.prompt_tokens);
        }
        self.asr_state.full(params, &pcm).context("chép lời")?;
        let asr_ms = asr_started.elapsed().as_secs_f32() * 1000.0;

        let mut text = String::new();
        let mut tokens = Vec::new();
        let mut no_speech_prob = 0.0f32;
        for segment in self.asr_state.as_iter() {
            text.push_str(&segment.to_str_lossy()?);
            no_speech_prob = no_speech_prob.max(segment.no_speech_probability());
            for i in 0..segment.n_tokens() {
                if let Some(token) = segment.get_token(i) {
                    let id = token.token_id();
                    if id < eot {
                        tokens.push(id);
                    }
                }
            }
        }
        self.prev_lang = Some(lang_id);
        Ok(TranscribeResult {
            segment_id: req.segment_id,
            lang: lang.to_string(),
            lang_prob,
            text: text.trim().to_string(),
            tokens,
            no_speech_prob,
            lid_ms,
            asr_ms,
        })
    }
}

/// State nhận diện ngôn ngữ của chế độ A. `lang_detect` dùng lại `audio_ctx` mà lần `whisper_full` gần nhất đã đặt cho
/// state. Giao thức không bắt buộc gửi `Warmup`, nên chạy `whisper_full` một lần ngay lúc nạp, trên 3 giây im lặng. Nếu
/// bỏ qua, đoạn đầu tiên sẽ nhận diện ngôn ngữ trên cửa sổ 30 giây đầy đủ: chậm hơn nhiều và cho xác suất khác.
fn create_lid_state(ctx: &WhisperContext, n_threads: usize) -> Result<WhisperState> {
    let mut state = ctx.create_state().context("tạo state nhận diện ngôn ngữ")?;
    let silence = vec![0.0f32; LID_SAMPLES];
    let params = full_params(n_threads, "en", audio_ctx_for_samples(LID_SAMPLES));
    state
        .full(params, &silence)
        .context("đặt audio_ctx cho state nhận diện ngôn ngữ")?;
    Ok(state)
}

/// Kẹp số luồng yêu cầu về số CPU logic (`available_parallelism`) của máy. Yêu cầu 0 vẫn lên 1 như trước; nếu không
/// hỏi được số CPU logic thì giữ nguyên giá trị yêu cầu.
fn clamp_threads(requested: u32) -> usize {
    let requested = requested.max(1) as usize;
    match std::thread::available_parallelism() {
        Ok(cpus) => requested.min(cpus.get()),
        Err(_) => requested,
    }
}

/// Tham số giải mã theo spec §6.4: greedy, không temperature fallback, chặn token không phải
/// tiếng nói, không dùng ngữ cảnh nội bộ của whisper.cpp (prompt được truyền rõ ràng).
fn full_params<'a, 'b>(n_threads: usize, lang: &'a str, audio_ctx: i32) -> FullParams<'a, 'b> {
    let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    p.set_n_threads(n_threads as i32);
    p.set_language(Some(lang));
    p.set_audio_ctx(audio_ctx);
    p.set_no_context(true);
    p.set_single_segment(true);
    p.set_no_timestamps(true);
    p.set_suppress_nst(true);
    p.set_temperature(0.0);
    p.set_temperature_inc(0.0);
    p.set_print_special(false);
    p.set_print_progress(false);
    p.set_print_realtime(false);
    p.set_print_timestamps(false);
    p
}
