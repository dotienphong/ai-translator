//! Chế độ dùng chung một lượt encode cho nhận diện ngôn ngữ và chép lời (spec §6.4).
//!
//! Cần bản vá `whisper_set_audio_ctx_with_state` trong `third_party/` (feature `shared-encode`).
//! Giải mã greedy, không timestamp, không temperature fallback, giống cấu hình của `engine.rs`.

use crate::lid::pick_language;
use anyhow::Result;
use std::time::Instant;
use whisper_rs::{WhisperContext, WhisperState, WhisperTokenId};

/// Danh sách token không phải tiếng nói, chép từ `whisper_process_logits` của whisper.cpp.
const NON_SPEECH: &[&str] = &[
    "\"",
    "#",
    "(",
    ")",
    "*",
    "+",
    "/",
    ":",
    ";",
    "<",
    "=",
    ">",
    "@",
    "[",
    "\\",
    "]",
    "^",
    "_",
    "`",
    "{",
    "|",
    "}",
    "~",
    "「",
    "」",
    "『",
    "』",
    "<<",
    ">>",
    "<<<",
    ">>>",
    "--",
    "---",
    "-(",
    "-[",
    "('",
    "(\"",
    "((",
    "))",
    "(((",
    ")))",
    "[[",
    "]]",
    "{{",
    "}}",
    "♪♪",
    "♪♪♪",
    "♩",
    "♪",
    "♫",
    "♬",
    "♭",
    "♮",
    "♯",
];

pub struct Decoded {
    pub lang_id: i32,
    pub lang_prob: f32,
    pub no_speech_prob: f32,
    pub tokens: Vec<WhisperTokenId>,
    pub text: String,
    pub lid_ms: f32,
}

pub struct Decoder {
    eot: WhisperTokenId,
    /// `true` nếu token bị chặn ở mọi bước.
    suppressed: Vec<bool>,
    /// Chặn thêm ở bước đầu (tránh câu rỗng).
    blank: Vec<WhisperTokenId>,
}

impl Decoder {
    pub fn new(ctx: &WhisperContext) -> Self {
        let n_vocab = ctx.n_vocab() as usize;
        let eot = ctx.token_eot();
        let single = |s: &str| ctx.tokenize(s, 4).ok().filter(|t| t.len() == 1).map(|t| t[0]);
        let mut suppressed = vec![false; n_vocab];
        // Mọi token đặc biệt sau EOT: SOT, ngôn ngữ, task, timestamp...
        for flag in suppressed.iter_mut().skip(eot as usize + 1) {
            *flag = true;
        }
        let mut non_speech = Vec::new();
        for s in NON_SPEECH {
            non_speech.extend(single(s));
            non_speech.extend(single(&format!(" {s}")));
        }
        non_speech.extend(single(" -"));
        non_speech.extend(single(" '"));
        for id in non_speech {
            suppressed[id as usize] = true;
        }
        let blank = [single(" "), Some(eot)].into_iter().flatten().collect();
        Self { eot, suppressed, blank }
    }

    fn pick(&self, logits: &[f32], first_step: bool) -> WhisperTokenId {
        let mut best = (self.eot, f32::NEG_INFINITY);
        for (id, &logit) in logits.iter().enumerate() {
            let token = id as WhisperTokenId;
            if self.suppressed[id] || (first_step && self.blank.contains(&token)) {
                continue;
            }
            if logit > best.1 {
                best = (token, logit);
            }
        }
        best.0
    }

    #[allow(clippy::too_many_arguments)]
    pub fn transcribe(
        &self,
        ctx: &WhisperContext,
        state: &mut WhisperState,
        pcm: &[f32],
        audio_ctx: i32,
        allowed: &[i32],
        prev_lang: Option<i32>,
        prompt_tokens: &[i32],
        n_threads: usize,
    ) -> Result<Decoded> {
        state.pcm_to_mel(pcm, n_threads)?;
        state.set_audio_ctx(audio_ctx);
        state.encode(0, n_threads)?;

        // Một bước decoder sau [SOT] cho cả xác suất ngôn ngữ lẫn xác suất "không có tiếng nói".
        let lid_started = Instant::now();
        let sot = ctx.token_sot();
        state.decode(&[sot], 0, n_threads)?;
        let logits = state.get_logits()?;
        let no_speech_prob = softmax_at(logits, ctx.token_nosp() as usize);
        let (lang_id, lang_prob) = if allowed.len() == 1 {
            (allowed[0], 1.0)
        } else {
            let lang_logit = |id: i32| logits[ctx.token_lang(id) as usize];
            let max = allowed
                .iter()
                .map(|&id| lang_logit(id))
                .fold(f32::NEG_INFINITY, f32::max);
            let mut probs = vec![0.0f32; whisper_rs::get_lang_max_id() as usize + 1];
            for &id in allowed {
                probs[id as usize] = (lang_logit(id) - max).exp();
            }
            pick_language(&probs, allowed, prev_lang, crate::engine::MIN_LANG_PROB)
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };

        let mut prompt = Vec::with_capacity(prompt_tokens.len() + 5);
        if !prompt_tokens.is_empty() {
            prompt.push(ctx.token_prev());
            prompt.extend_from_slice(&prompt_tokens[prompt_tokens.len().saturating_sub(100)..]);
        }
        prompt.extend([sot, ctx.token_lang(lang_id), ctx.token_transcribe(), ctx.token_not()]);
        // whisper.cpp ghi logits của token cuối vào hàng `n_tokens - 1`, còn `get_logits()` chỉ đọc
        // hàng 0. Vì vậy decode phần đầu prompt thành một batch, rồi decode riêng token cuối.
        let (head, last) = prompt.split_at(prompt.len() - 1);
        state.decode(head, 0, n_threads)?;
        state.decode(last, head.len(), n_threads)?;
        let max_new = (ctx.n_text_ctx() as usize / 2).saturating_sub(prompt.len()).max(1);
        let mut tokens = Vec::new();
        for (step, n_past) in (0..max_new).zip(prompt.len()..) {
            let next = self.pick(state.get_logits()?, step == 0);
            if next == self.eot || is_looping(&tokens, next) {
                break;
            }
            tokens.push(next);
            state.decode(&[next], n_past, n_threads)?;
        }
        let mut bytes = Vec::new();
        for &t in &tokens {
            bytes.extend_from_slice(ctx.token_to_bytes(t)?);
        }
        Ok(Decoded {
            lang_id,
            lang_prob,
            no_speech_prob,
            text: String::from_utf8_lossy(&bytes).trim().to_string(),
            tokens,
            lid_ms,
        })
    }
}

fn softmax_at(logits: &[f32], index: usize) -> f32 {
    let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let sum: f32 = logits.iter().map(|&l| (l - max).exp()).sum();
    (logits[index] - max).exp() / sum
}

/// Dừng khi một mẫu 1–8 token lặp lại 4 lần liên tiếp (lỗi lặp của Whisper).
fn is_looping(tokens: &[WhisperTokenId], next: WhisperTokenId) -> bool {
    let mut seq = tokens.to_vec();
    seq.push(next);
    (1..=8).any(|n| {
        seq.len() >= n * 4 && {
            let tail = &seq[seq.len() - n..];
            (1..4).all(|k| &seq[seq.len() - n * (k + 1)..seq.len() - n * k] == tail)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::is_looping;

    #[test]
    fn detects_repeated_pattern() {
        assert!(is_looping(&[1, 2, 1, 2, 1, 2, 1], 2));
        assert!(is_looping(&[5, 5, 5], 5));
        assert!(!is_looping(&[1, 2, 3, 4, 5], 6));
    }
}
