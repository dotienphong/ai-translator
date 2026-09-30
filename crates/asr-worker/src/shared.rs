//! Chế độ dùng chung một lượt encode cho nhận diện ngôn ngữ và chép lời (spec §6.4).
//!
//! Cần bản vá `whisper_set_audio_ctx_with_state` trong `third_party/` (feature `shared-encode`).
//! Giải mã greedy, không timestamp, không temperature fallback, giống cấu hình của `engine.rs`.

use crate::lid::pick_language;
use anyhow::Result;
use asr_protocol::{MAX_PROMPT_TOKENS, SAMPLE_RATE};
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
        // Giới hạn phải lớn hơn số token dài nhất có thể ra (" ♪♪♪" là 10 byte): whisper-rs 0.16 chỉ coi -1 là lỗi,
        // còn giá trị âm khác (chuỗi ra nhiều token hơn giới hạn) bị nó đổi thành độ dài Vec khổng lồ.
        let single = |s: &str| ctx.tokenize(s, 16).ok().filter(|t| t.len() == 1).map(|t| t[0]);
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
            prompt.extend_from_slice(&prompt_tokens[prompt_tokens.len().saturating_sub(MAX_PROMPT_TOKENS)..]);
        }
        prompt.extend([sot, ctx.token_lang(lang_id), ctx.token_transcribe(), ctx.token_not()]);
        // whisper.cpp ghi logits của token cuối vào hàng `n_tokens - 1`, còn `get_logits()` chỉ đọc
        // hàng 0. Vì vậy decode phần đầu prompt thành một batch, rồi decode riêng token cuối.
        let (head, last) = prompt.split_at(prompt.len() - 1);
        state.decode(head, 0, n_threads)?;
        state.decode(last, head.len(), n_threads)?;
        let max_new = max_new_tokens(ctx.n_text_ctx() as usize, prompt.len(), pcm.len());
        let mut tokens = Vec::with_capacity(max_new);
        for (step, n_past) in (0..max_new).zip(prompt.len()..) {
            let next = self.pick(state.get_logits()?, step == 0);
            if next == self.eot || cut_loop(&mut tokens, next) {
                break;
            }
            tokens.push(next);
            // Không cần logits sau token cuối cùng được phép.
            if tokens.len() < max_new {
                state.decode(&[next], n_past, n_threads)?;
            }
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

/// Mẫu dài nhất (token) mà `loop_period` tìm. Câu bị lặp trong bộ clip FLEURS dài 12–48 token.
const MAX_LOOP_PERIOD: usize = 64;

/// Số bản liên tiếp của một mẫu `n` token ở cuối dãy thì coi là lỗi lặp của Whisper. Mẫu ngắn (1–8 token) cần 4 bản
/// để không cắt nhầm lời nói thật ("no, no, no"); mẫu dài (9–64 token, thường là cả câu) chỉ cần 3 bản.
fn loop_repeats(n: usize) -> usize {
    if n <= 8 { 4 } else { 3 }
}

/// Độ dài `n` của mẫu nếu `tokens` nối thêm `next` kết thúc bằng `loop_repeats(n)` bản liên tiếp của cùng một mẫu
/// `n` token, với 1 ≤ n ≤ `MAX_LOOP_PERIOD`. Có nhiều `n` thì lấy `n` nhỏ nhất. Không cấp phát.
fn loop_period(tokens: &[WhisperTokenId], next: WhisperTokenId) -> Option<usize> {
    let len = tokens.len() + 1;
    let at = |i: usize| tokens.get(i).copied().unwrap_or(next);
    (1..=MAX_LOOP_PERIOD).find(|&n| {
        let span = n * loop_repeats(n);
        span <= len && (len - span..len - n).all(|i| at(i) == at(i + n))
    })
}

/// Nếu `next` làm thành vòng lặp (xem `loop_period`) thì cắt `tokens` về đúng một bản của mẫu và trả `true`:
/// các bản sau là chữ Whisper bịa ra, bản cuối lại còn dở (có thể cắt giữa một ký tự UTF-8 nhiều byte).
fn cut_loop(tokens: &mut Vec<WhisperTokenId>, next: WhisperTokenId) -> bool {
    match loop_period(tokens, next) {
        Some(n) => {
            tokens.truncate(tokens.len() + 1 - (loop_repeats(n) - 1) * n);
            true
        }
        None => false,
    }
}

/// Trần số token mới của một đoạn: nửa ngữ cảnh văn bản của Whisper (224) trừ độ dài prompt, và không quá
/// `16 + 20 × số giây` của đoạn. Trên bộ clip FLEURS, lời nói không lặp có nhiều nhất 7,75 token/giây (p99 6,35), nên
/// trần theo độ dài chỉ chặn vòng lặp mà `loop_period` không bắt được (các bản không giống hệt nhau), nhất là ở đoạn
/// ngắn. Hệ số 20 khoảng 3 lần p99, để `loop_period` (cần 3 bản) thường kịp gom vòng lặp trước khi chạm trần.
/// Khác `whisper_full`: whisper.cpp luôn cho 220 token, không trừ độ dài prompt.
fn max_new_tokens(n_text_ctx: usize, prompt_len: usize, n_samples: usize) -> usize {
    let by_audio = 16 + n_samples * 20 / SAMPLE_RATE as usize;
    (n_text_ctx / 2).saturating_sub(prompt_len).min(by_audio).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `prefix` rồi `reps` bản của `pattern`; token cuối tách ra làm `next`, như vòng giải mã.
    fn looped(prefix: &[i32], pattern: &[i32], reps: usize) -> (Vec<i32>, i32) {
        let mut seq = prefix.to_vec();
        for _ in 0..reps {
            seq.extend_from_slice(pattern);
        }
        let next = seq.pop().unwrap();
        (seq, next)
    }

    /// Mẫu `n` token khác nhau, không trùng với tiền tố [1, 2, 3].
    fn pattern(n: usize) -> Vec<i32> {
        (100..100 + n as i32).collect()
    }

    #[test]
    fn short_patterns_need_four_copies() {
        for n in 1..=8 {
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 4);
            assert_eq!(loop_period(&t, next), Some(n), "n = {n}, 4 bản");
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 3);
            assert_eq!(loop_period(&t, next), None, "n = {n}, 3 bản chưa là vòng lặp");
        }
    }

    #[test]
    fn long_patterns_need_three_copies() {
        // Ghim cận trên bằng số, không dùng lại hằng: đổi MAX_LOOP_PERIOD thì test phải đỏ.
        for n in 9..=64 {
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 3);
            assert_eq!(loop_period(&t, next), Some(n), "n = {n}, 3 bản");
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 2);
            assert_eq!(loop_period(&t, next), None, "n = {n}, 2 bản chưa là vòng lặp");
        }
        // Dài hơn 64 token thì để trần token lo.
        let (t, next) = looped(&[], &pattern(65), 3);
        assert_eq!(loop_period(&t, next), None);
    }

    #[test]
    fn loop_must_end_with_next() {
        assert_eq!(loop_period(&[], 7), None);
        assert_eq!(loop_period(&[7, 7, 7], 8), None);
        assert_eq!(loop_period(&[7, 7, 7, 7], 8), None);
        // Vòng lặp 2 token đang lệch pha: token kế tiếp phải khớp đúng vị trí trong mẫu.
        assert_eq!(loop_period(&[5, 6, 5, 6, 5, 6, 5], 5), None);
        assert_eq!(loop_period(&[5, 6, 5, 6, 5, 6, 5], 6), Some(2));
    }

    #[test]
    fn cut_loop_keeps_one_copy() {
        let (mut t, next) = looped(&[1, 2], &[5, 6], 4);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [1, 2, 5, 6]);

        let p = pattern(20);
        let (mut t, next) = looped(&[1, 2], &p, 3);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [&[1, 2][..], &p].concat());

        // Không lặp thì không đụng vào `tokens`.
        let (mut t, next) = looped(&[1, 2], &p, 2);
        let before = t.clone();
        assert!(!cut_loop(&mut t, next));
        assert_eq!(t, before);
    }

    #[test]
    fn token_cap_follows_audio_length_and_prompt() {
        let secs = |s: usize| s * SAMPLE_RATE as usize;
        assert_eq!(max_new_tokens(448, 4, secs(30)), 220); // như whisper_full khi không có prompt
        assert_eq!(max_new_tokens(448, 4, secs(8)), 176);
        assert_eq!(max_new_tokens(448, 4, secs(2)), 56);
        assert_eq!(max_new_tokens(448, 4, 1_600), 18); // 0,1 giây
        assert_eq!(max_new_tokens(448, 105, secs(8)), 119); // prompt đủ 100 token
        assert_eq!(max_new_tokens(448, 300, secs(30)), 1);
    }
}
