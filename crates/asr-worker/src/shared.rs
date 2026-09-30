//! Chế độ dùng chung một lượt encode cho nhận diện ngôn ngữ và chép lời (spec §6.4).
//!
//! Cần bản vá `whisper_set_audio_ctx_with_state` trong `third_party/` (feature `shared-encode`).
//! Giải mã greedy, không timestamp, không temperature fallback, giống cấu hình của `engine.rs`.

use crate::engine::{Primers, mean_logprob};
use crate::lid::{min_prob_for, pick_language};
use anyhow::{Context, Result};
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
    /// Trung bình log-xác suất của các token văn bản giữ lại (xem `TranscribeResult::avg_logprob`).
    pub avg_logprob: f32,
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

    fn pick(&self, logits: &[f32], first_step: bool) -> (WhisperTokenId, f32) {
        pick_token(logits, &self.suppressed, &self.blank, self.eot, first_step)
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
        primers: &Primers,
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
            pick_language(&probs, allowed, prev_lang, min_prob_for(pcm.len()))
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };

        // Prompt của client nếu có, không thì câu mồi của ngôn ngữ vừa chọn (zh, ja): xem `Primers`.
        let lang = whisper_rs::get_lang_str(lang_id).context("lang id không hợp lệ")?;
        let context = primers.context_for(lang, prompt_tokens);
        let mut prompt = Vec::with_capacity(context.len().min(MAX_PROMPT_TOKENS) + 5);
        if !context.is_empty() {
            prompt.push(ctx.token_prev());
            prompt.extend_from_slice(&context[context.len().saturating_sub(MAX_PROMPT_TOKENS)..]);
        }
        prompt.extend([sot, ctx.token_lang(lang_id), ctx.token_transcribe(), ctx.token_not()]);
        // whisper.cpp ghi logits của token cuối vào hàng `n_tokens - 1`, còn `get_logits()` chỉ đọc
        // hàng 0. Vì vậy decode phần đầu prompt thành một batch, rồi decode riêng token cuối.
        let (head, last) = prompt.split_at(prompt.len() - 1);
        state.decode(head, 0, n_threads)?;
        state.decode(last, head.len(), n_threads)?;
        let max_new = max_new_tokens(ctx.n_text_ctx() as usize, prompt.len(), pcm.len());
        let mut out = Generated::with_capacity(max_new);
        for (step, n_past) in (0..max_new).zip(prompt.len()..) {
            let (next, logprob) = self.pick(state.get_logits()?, step == 0);
            if next == self.eot || !out.push(next, logprob) {
                break;
            }
            // Không cần logits sau token cuối cùng được phép.
            if out.tokens.len() < max_new {
                state.decode(&[next], n_past, n_threads)?;
            }
        }
        let mut bytes = Vec::new();
        for &t in &out.tokens {
            bytes.extend_from_slice(ctx.token_to_bytes(t)?);
        }
        let avg_logprob = out.avg_logprob();
        Ok(Decoded {
            lang_id,
            lang_prob,
            no_speech_prob,
            text: String::from_utf8_lossy(&bytes).trim().to_string(),
            tokens: out.tokens,
            lid_ms,
            avg_logprob,
        })
    }
}

fn softmax_at(logits: &[f32], index: usize) -> f32 {
    let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let sum: f32 = logits.iter().map(|&l| (l - max).exp()).sum();
    (logits[index] - max).exp() / sum
}

/// Chọn token có logit lớn nhất trong các token không bị chặn (`suppressed`, và ở bước đầu cả `blank`), kèm log-xác
/// suất của nó. Log-xác suất là log-softmax trên đúng tập token được phép, giống `whisper_process_logits` của
/// whisper.cpp (token bị chặn có logit −∞ nên không vào mẫu số) và giống `plog` mà chế độ A đọc từ `whisper_full`.
fn pick_token(
    logits: &[f32],
    suppressed: &[bool],
    blank: &[WhisperTokenId],
    eot: WhisperTokenId,
    first_step: bool,
) -> (WhisperTokenId, f32) {
    let allowed = |id: usize| !(suppressed[id] || (first_step && blank.contains(&(id as WhisperTokenId))));
    let mut best = (eot, f32::NEG_INFINITY);
    for (id, &logit) in logits.iter().enumerate() {
        if allowed(id) && logit > best.1 {
            best = (id as WhisperTokenId, logit);
        }
    }
    // Mẫu số của softmax, trừ cực đại cho ổn định số; token bản thân nó đóng góp 1 nên tổng ≥ 1. Token thấp hơn cực đại
    // quá 30 nat (e^-30 ≈ 1e-13) không đổi được tổng ở độ chính xác f32, nên bỏ qua để khỏi tốn `exp`: gần hết
    // 51 865 logit của một bước rơi vào trường hợp này.
    let sum: f32 = logits
        .iter()
        .enumerate()
        .filter(|&(id, &logit)| logit - best.1 > -30.0 && allowed(id))
        .map(|(_, &logit)| (logit - best.1).exp())
        .sum();
    (best.0, -sum.ln())
}

/// Các token đã sinh và log-xác suất của từng token. Hai vec luôn cùng độ dài.
#[derive(Default)]
struct Generated {
    tokens: Vec<WhisperTokenId>,
    logprobs: Vec<f32>,
}

impl Generated {
    fn with_capacity(n: usize) -> Self {
        Self {
            tokens: Vec::with_capacity(n),
            logprobs: Vec::with_capacity(n),
        }
    }

    /// Thêm `next`. Nếu `next` làm thành vòng lặp (xem `cut_loop`) thì `tokens` được gom về một bản, log-xác suất của
    /// phần bị bỏ cũng bỏ theo (không tính vào `avg_logprob`), `next` không được giữ, và trả `false`: phải dừng giải mã.
    fn push(&mut self, next: WhisperTokenId, logprob: f32) -> bool {
        if cut_loop(&mut self.tokens, next) {
            self.logprobs.truncate(self.tokens.len());
            return false;
        }
        self.tokens.push(next);
        self.logprobs.push(logprob);
        true
    }

    fn avg_logprob(&self) -> f32 {
        mean_logprob(&self.logprobs)
    }
}

/// Mẫu dài nhất (token) mà `loop_period` tìm. Câu bị lặp trong bộ clip FLEURS dài 12–48 token.
const MAX_LOOP_PERIOD: usize = 64;

/// Số bản liên tiếp của một mẫu `n` token ở cuối dãy thì coi là lỗi lặp của Whisper:
/// - 1–8 token: 4 bản, để không cắt nhầm lời nói thật ("no, no, no");
/// - 9–15 token: 3 bản;
/// - 16–64 token (thường là cả câu): 2 bản, vì Whisper có khi chép cả câu hai lần rồi mới dừng (S7: 8 clip, 6 của turbo
///   và 2 của small), mà 3 bản thì không bắt được.
///
/// Đánh đổi: người nói nhắc lại nguyên một câu dài hai lần liền thì bản thứ hai cũng bị gom.
fn loop_repeats(n: usize) -> usize {
    match n {
        1..=8 => 4,
        9..=15 => 3,
        _ => 2,
    }
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
/// ngắn. Hệ số 20 khoảng 3 lần p99, để `loop_period` (cần 2 đến 4 bản) thường kịp gom vòng lặp trước khi chạm trần.
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
    fn loop_repeats_by_pattern_length() {
        for n in 1..=8 {
            assert_eq!(loop_repeats(n), 4, "n = {n}");
        }
        for n in 9..=15 {
            assert_eq!(loop_repeats(n), 3, "n = {n}");
        }
        for n in 16..=64 {
            assert_eq!(loop_repeats(n), 2, "n = {n}");
        }
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
    fn medium_patterns_need_three_copies() {
        for n in 9..=15 {
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 3);
            assert_eq!(loop_period(&t, next), Some(n), "n = {n}, 3 bản");
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 2);
            assert_eq!(loop_period(&t, next), None, "n = {n}, 2 bản chưa là vòng lặp");
        }
    }

    #[test]
    fn long_patterns_need_two_copies() {
        // Ghim cận trên bằng số, không dùng lại hằng: đổi MAX_LOOP_PERIOD thì test phải đỏ.
        for n in 16..=64 {
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 2);
            assert_eq!(loop_period(&t, next), Some(n), "n = {n}, 2 bản (cả câu chép hai lần)");
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 1);
            assert_eq!(loop_period(&t, next), None, "n = {n}, 1 bản chưa là vòng lặp");
        }
        // Dài hơn 64 token thì để trần token lo, dù lặp bao nhiêu bản.
        for reps in [2, 3, 10] {
            let (t, next) = looped(&[], &pattern(65), reps);
            assert_eq!(loop_period(&t, next), None, "mẫu 65 token, {reps} bản");
        }
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
        // Mẫu 2 token × 4 bản.
        let (mut t, next) = looped(&[1, 2], &[5, 6], 4);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [1, 2, 5, 6]);

        // Mẫu 12 token × 3 bản.
        let p = pattern(12);
        let (mut t, next) = looped(&[1, 2], &p, 3);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [&[1, 2][..], &p].concat());

        // Mẫu 20 token × 2 bản: cả câu chép hai lần.
        let p = pattern(20);
        let (mut t, next) = looped(&[1, 2], &p, 2);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [&[1, 2][..], &p].concat());

        // Một bản thì không đụng vào `tokens`.
        let (mut t, next) = looped(&[1, 2], &p, 1);
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

    // Từ vựng thử: 0, 1, 2 là chữ; 3 là khoảng trắng; 4 là EOT; 5 là token đặc biệt (sau EOT) luôn bị chặn.
    const EOT: WhisperTokenId = 4;
    const SUPPRESSED: [bool; 6] = [false, false, false, false, false, true];
    const BLANK: [WhisperTokenId; 2] = [3, EOT];

    /// log-softmax tại `at` trên các chỉ số `over`, tính bằng f64.
    fn exact_logprob(logits: &[f32], over: impl Iterator<Item = usize>, at: usize) -> f64 {
        let z: f64 = over.map(|i| (logits[i] as f64).exp()).sum();
        logits[at] as f64 - z.ln()
    }

    #[test]
    fn pick_token_normalizes_over_unsuppressed_tokens() {
        // Token 5 (đặc biệt, logit 100) bị chặn: không được chọn, và không vào mẫu số.
        let logits = [1.0, 2.0, 3.0, 0.0, 2.5, 100.0];
        let (token, logprob) = pick_token(&logits, &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, 2);
        let want = exact_logprob(&logits, 0..5, 2);
        assert!((logprob as f64 - want).abs() < 1e-5, "{logprob} so với {want}");
    }

    #[test]
    fn pick_token_first_step_leaves_out_blank_and_eot() {
        let logits = [0.5, 0.5, 0.25, 5.0, 9.0, 100.0];
        // Bước đầu: khoảng trắng (3) và EOT (4) bị chặn cả khi chọn lẫn khi chuẩn hóa. Hòa thì lấy token đứng trước.
        let (token, logprob) = pick_token(&logits, &SUPPRESSED, &BLANK, EOT, true);
        assert_eq!(token, 0);
        assert!((logprob as f64 - exact_logprob(&logits, 0..3, 0)).abs() < 1e-5);
        // Các bước sau: EOT được phép, và ở đây thắng.
        let (token, logprob) = pick_token(&logits, &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, EOT);
        assert!((logprob as f64 - exact_logprob(&logits, 0..5, 4)).abs() < 1e-5);
    }

    #[test]
    fn pick_token_logprob_is_at_most_zero_and_ignores_far_below_logits() {
        // Một token áp đảo: log-xác suất gần 0, không bao giờ dương.
        let (token, logprob) = pick_token(&[50.0, 0.0, 0.0, 0.0, 0.0, 0.0], &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, 0);
        assert!((-1e-6..=0.0).contains(&logprob), "{logprob}");

        // 998 token thấp hơn cực đại 40 nat, cộng −∞: kết quả vẫn khớp tổng chính xác, không ra NaN.
        let mut logits = vec![-40.0f32; 1000];
        logits[7] = 0.0;
        logits[8] = -1.0;
        logits[9] = f32::NEG_INFINITY;
        let suppressed = vec![false; 1000];
        let (token, logprob) = pick_token(&logits, &suppressed, &[], 999, false);
        assert_eq!(token, 7);
        let want = exact_logprob(&logits, 0..1000, 7);
        assert!((logprob as f64 - want).abs() < 1e-6, "{logprob} so với {want}");

        // Mọi logit bằng nhau: xác suất đều, log(1/n).
        let (token, logprob) = pick_token(&[0.0; 6], &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, 0);
        assert!((logprob as f64 + 5f64.ln()).abs() < 1e-6, "{logprob}");
    }

    #[test]
    fn generated_averages_logprobs_of_kept_tokens() {
        let mut g = Generated::default();
        assert_eq!(g.avg_logprob(), 0.0); // chưa có token nào
        assert!(g.push(10, -0.5));
        assert!(g.push(11, -1.5));
        assert_eq!(g.tokens, [10, 11]);
        assert!((g.avg_logprob() + 1.0).abs() < 1e-6);
    }

    #[test]
    fn generated_drops_logprobs_of_a_cut_loop() {
        // Tiền tố 9, rồi mẫu [5, 6] lặp 4 bản: bản đầu có log-xác suất cao, các bản sau thấp (chữ bịa ra).
        let mut g = Generated::default();
        assert!(g.push(9, -1.0));
        for (token, logprob) in [(5, -0.5), (6, -0.5)] {
            assert!(g.push(token, logprob));
        }
        for (token, logprob) in [(5, -10.0), (6, -10.0), (5, -10.0), (6, -10.0), (5, -10.0)] {
            assert!(g.push(token, logprob)); // bản 2, bản 3 và token đầu của bản 4: chưa đủ 4 bản
        }
        assert_eq!(g.tokens.len(), 8);
        assert!(!g.push(6, -10.0)); // token cuối của bản thứ tư: cắt và dừng
        assert_eq!(g.tokens, [9, 5, 6]); // đúng một bản, token gây cắt không được giữ
        assert_eq!(g.logprobs, [-1.0, -0.5, -0.5]); // log-xác suất của phần bị bỏ cũng bỏ theo
        assert!((g.avg_logprob() as f64 + 2.0 / 3.0).abs() < 1e-6);
    }
}
