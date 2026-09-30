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
//!
//! Cả hai chế độ dùng chung: ngưỡng giữ ngôn ngữ trước theo độ dài đoạn (`lid::min_prob_for`), câu mồi cho zh và ja
//! (`Primers`), và trả `avg_logprob`.

use crate::lid::{min_prob_for, pick_language};
use anyhow::{Context, Result, bail};
use asr_protocol::{
    MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_PCM_SAMPLES, SAMPLE_RATE, TranscribeRequest, TranscribeResult,
    audio_ctx_for_samples,
};
use std::time::Instant;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

/// Nhận diện ngôn ngữ trên tối đa 3 giây đầu của đoạn (spec §6.4).
pub const LID_SAMPLES: usize = SAMPLE_RATE as usize * 3;
/// Cửa sổ mã hóa tối đa của Whisper: 1500 vị trí, tức 30 giây.
const MAX_AUDIO_CTX: i32 = 1500;
/// Số mẫu 16 kHz mà một vị trí của `audio_ctx` phủ (20 ms).
const SAMPLES_PER_CTX: usize = SAMPLE_RATE as usize / 50;
/// `audio_ctx` của state nhận diện ngôn ngữ ở chế độ A: cửa sổ 3 giây theo công thức `50 × số giây + 64` (214). Cố ý
/// không qua sàn `MIN_AUDIO_CTX` của `audio_ctx_for_samples`, để chế độ A (nay chỉ dùng để so sánh) giữ nguyên hành
/// vi đã đo ở S3.
const LID_AUDIO_CTX: i32 = (LID_SAMPLES / SAMPLES_PER_CTX) as i32 + 64;
// Cửa sổ tối đa phủ đúng đoạn dài nhất mà `asr-protocol` cho phép.
const _: () = assert!(MAX_AUDIO_CTX as usize * SAMPLES_PER_CTX == MAX_PCM_SAMPLES);

/// Câu mồi cho tiếng Trung: chữ giản thể, có dấu câu kết thúc.
const PRIMER_ZH: &str = "以下是普通话的句子。";
/// Câu mồi cho tiếng Nhật: có dấu câu kết thúc.
const PRIMER_JA: &str = "以下は日本語の文です。";

/// Prompt mồi cho zh và ja (`<|startofprev|>` rồi các token này, như prompt của client). Lý do:
/// - Dấu câu (spec §6.3): Whisper gần như không đặt dấu câu kết thúc cho hai tiếng này (S6: zh 1/43 đoạn, ja 3/15), nên
///   luật ghép câu (câu không kết thúc bằng dấu câu thì ghép với câu sau) nối cả những câu khác nhau. Prompt có dấu câu
///   làm Whisper chép theo kiểu có dấu câu.
/// - Chữ giản thể: `small` ra chữ phồn thể ở khoảng nửa số clip zh; câu mồi zh viết bằng chữ giản thể kéo về giản thể.
///
/// Chỉ dùng khi client không gửi prompt (đoạn đầu, hoặc sau khi đổi ngôn ngữ): prompt của client là ngữ cảnh thật nên
/// thắng. Token hóa một lần lúc nạp model. Đặt `ASR_NO_PRIMER=1` để tắt mồi (các danh sách rỗng), dùng khi đo so sánh.
#[derive(Default)]
pub struct Primers {
    zh: Vec<i32>,
    ja: Vec<i32>,
}

impl Primers {
    fn new(ctx: &WhisperContext) -> Result<Self> {
        if std::env::var("ASR_NO_PRIMER").as_deref() == Ok("1") {
            return Ok(Self::default());
        }
        let eot = ctx.token_eot();
        let tokenize = |text: &str| -> Result<Vec<i32>> {
            // Mỗi token phủ ít nhất một byte, nên `text.len()` đủ lớn để không gặp mã âm (whisper-rs 0.16 chỉ coi -1 là
            // lỗi, còn mã âm khác bị nó đổi thành độ dài Vec khổng lồ).
            let tokens = ctx
                .tokenize(text, text.len())
                .with_context(|| format!("token hóa câu mồi {text:?}"))?;
            if tokens.is_empty() || tokens.len() > MAX_PROMPT_TOKENS || tokens.iter().any(|t| !(0..eot).contains(t)) {
                bail!("câu mồi {text:?} token hóa ra {tokens:?}, không hợp lệ");
            }
            Ok(tokens)
        };
        Ok(Self {
            zh: tokenize(PRIMER_ZH)?,
            ja: tokenize(PRIMER_JA)?,
        })
    }

    /// Có câu mồi nào đang bật không (`false` khi `ASR_NO_PRIMER=1`).
    pub fn enabled(&self) -> bool {
        !self.zh.is_empty() || !self.ja.is_empty()
    }

    /// Prompt dùng cho đoạn có ngôn ngữ `lang`: prompt của client nếu có, không thì câu mồi của `lang` (zh, ja), không
    /// thì rỗng. Độ dài luôn không quá `MAX_PROMPT_TOKENS` khi `client` không quá (engine đã kiểm).
    pub fn context_for<'a>(&'a self, lang: &str, client: &'a [i32]) -> &'a [i32] {
        if !client.is_empty() {
            return client;
        }
        match lang {
            "zh" => &self.zh,
            "ja" => &self.ja,
            _ => &[],
        }
    }
}

/// Trung bình log-xác suất của các token văn bản; 0,0 nếu không có token nào (xem `TranscribeResult::avg_logprob`).
/// Cộng bằng f64 để đoạn dài không mất độ chính xác.
pub fn mean_logprob(logprobs: &[f32]) -> f32 {
    if logprobs.is_empty() {
        return 0.0;
    }
    (logprobs.iter().map(|&l| l as f64).sum::<f64>() / logprobs.len() as f64) as f32
}

pub struct Engine {
    ctx: WhisperContext,
    asr_state: WhisperState,
    /// Chỉ có khi chạy chế độ A; chế độ B nhận diện ngôn ngữ ngay trên `asr_state`.
    lid_state: Option<WhisperState>,
    n_threads: usize,
    flash_attn: bool,
    prev_lang: Option<i32>,
    primers: Primers,
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
        let primers = Primers::new(&ctx)?;
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
            primers,
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

    /// Câu mồi cho zh và ja có đang bật không. Mặc định bật, xem [`Primers`].
    pub fn primer_enabled(&self) -> bool {
        self.primers.enabled()
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
                &self.primers,
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
                avg_logprob: d.avg_logprob,
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
            pick_language(&probs, &allowed, self.prev_lang, min_prob_for(pcm.len()))
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };
        let lang = whisper_rs::get_lang_str(lang_id).context("lang id không hợp lệ")?;

        let asr_started = Instant::now();
        let mut params = full_params(self.n_threads, lang, req.audio_ctx);
        let context = self.primers.context_for(lang, &req.prompt_tokens);
        if !context.is_empty() {
            params.set_tokens(context);
        }
        self.asr_state.full(params, &pcm).context("chép lời")?;
        let asr_ms = asr_started.elapsed().as_secs_f32() * 1000.0;

        let mut text = String::new();
        let mut tokens = Vec::new();
        let mut logprobs = Vec::new();
        let mut no_speech_prob = 0.0f32;
        for segment in self.asr_state.as_iter() {
            text.push_str(&segment.to_str_lossy()?);
            no_speech_prob = no_speech_prob.max(segment.no_speech_probability());
            for i in 0..segment.n_tokens() {
                if let Some(token) = segment.get_token(i) {
                    let id = token.token_id();
                    if id < eot {
                        tokens.push(id);
                        // whisper.cpp tính `plog` bằng log-softmax trên logit đã chặn token, giống chế độ B.
                        logprobs.push(token.token_data().plog);
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
            avg_logprob: mean_logprob(&logprobs),
        })
    }
}

/// State nhận diện ngôn ngữ của chế độ A. `lang_detect` dùng lại `audio_ctx` mà lần `whisper_full` gần nhất đã đặt cho
/// state. Giao thức không bắt buộc gửi `Warmup`, nên chạy `whisper_full` một lần ngay lúc nạp, trên 3 giây im lặng. Nếu
/// bỏ qua, đoạn đầu tiên sẽ nhận diện ngôn ngữ trên cửa sổ 30 giây đầy đủ: chậm hơn nhiều và cho xác suất khác.
fn create_lid_state(ctx: &WhisperContext, n_threads: usize) -> Result<WhisperState> {
    let mut state = ctx.create_state().context("tạo state nhận diện ngôn ngữ")?;
    let silence = vec![0.0f32; LID_SAMPLES];
    let params = full_params(n_threads, "en", LID_AUDIO_CTX);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn primers() -> Primers {
        Primers {
            zh: vec![11, 12],
            ja: vec![21],
        }
    }

    #[test]
    fn primer_is_used_only_for_zh_and_ja_without_a_client_prompt() {
        let p = primers();
        assert_eq!(p.context_for("zh", &[]), [11, 12]);
        assert_eq!(p.context_for("ja", &[]), [21]);
        for lang in ["en", "ko", "vi", "", "zh-TW"] {
            assert!(p.context_for(lang, &[]).is_empty(), "{lang}");
        }
    }

    #[test]
    fn client_prompt_wins_over_the_primer() {
        let p = primers();
        assert_eq!(p.context_for("zh", &[7, 8, 9]), [7, 8, 9]);
        assert_eq!(p.context_for("ja", &[7]), [7]);
        assert_eq!(p.context_for("en", &[7]), [7]);
    }

    #[test]
    fn disabled_primers_give_no_context() {
        let p = Primers::default();
        assert!(p.context_for("zh", &[]).is_empty());
        assert!(p.context_for("ja", &[]).is_empty());
        assert_eq!(p.context_for("zh", &[5]), [5]);
    }

    #[test]
    fn primer_texts_fit_the_prompt_budget_and_use_simplified_zh() {
        // Mỗi token phủ ít nhất một byte, nên số byte là cận trên của số token.
        for text in [PRIMER_ZH, PRIMER_JA] {
            assert!(text.len() < MAX_PROMPT_TOKENS, "{text}");
            // Có dấu câu kết thúc, để Whisper bắt chước và luật ghép câu §6.3 thấy được câu kết thúc.
            assert!(text.ends_with('。'), "{text}");
        }
        // Chữ giản thể ("话" chứ không phải "話"), để kéo `small` về giản thể.
        assert!(PRIMER_ZH.contains('话') && !PRIMER_ZH.contains('話'));
    }

    #[test]
    fn mean_logprob_is_zero_without_tokens() {
        assert_eq!(mean_logprob(&[]), 0.0);
        assert!((mean_logprob(&[-1.0, -2.0, -3.0]) + 2.0).abs() < 1e-6);
        assert_eq!(mean_logprob(&[-0.25]), -0.25);
    }

    #[test]
    fn lid_window_of_mode_a_stays_the_three_second_formula() {
        // Không qua sàn MIN_AUDIO_CTX: nhận diện ngôn ngữ ở chế độ A vẫn mã hóa cửa sổ 3 giây (150 khung + 64), còn
        // `audio_ctx_for_samples` cho cùng độ dài đó ra 512.
        assert_eq!(LID_AUDIO_CTX, 214);
        assert_eq!(audio_ctx_for_samples(LID_SAMPLES), 512);
    }
}
