//! Prompt khởi đầu cho `asr-worker` (spec §6.4, "Giải mã"): tối đa 100 token cuối của các đoạn trước cùng ngôn ngữ, giữ ở
//! tiến trình chính. Đoạn bị luật bỏ đoạn loại ra thì không vào đây (§6.4, "Lọc lỗi ảo giác").
//!
//! Việc cho MVP ở §6.4 ("Luật lặp khi prompt dài"): worker cho mỗi đoạn tối đa min(224 − độ dài prompt, 16 + 20 × số giây)
//! token mới. Prompt đủ 100 token (105 kể cả token đặc biệt) hạ trần còn 119, nên câu chép đôi dài từ 60 token không bị
//! luật lặp 2 bản bắt. Vì vậy app chỉ gửi phần prompt không làm trần theo độ dài bị hạ: trần của worker luôn là
//! `16 + 20 × số giây`, có prompt hay không. Đoạn 3 giây vẫn có đủ 100 token, đoạn 8,4 giây (8 giây cộng đệm) còn 35 token,
//! đoạn gộp 12 giây của hàng đợi (§7) không có prompt.

use asr_protocol::SAMPLE_RATE;
use std::collections::{HashMap, VecDeque};

/// Nửa ngữ cảnh văn bản của Whisper (`n_text_ctx / 2`, mọi model Whisper đều là 448 / 2).
pub const TEXT_CTX_HALF: usize = 224;
/// `<|startofprev|>` cộng 4 token SOT, ngôn ngữ, task, notimestamps (xem `asr-worker/src/shared.rs`).
const PROMPT_OVERHEAD: usize = 5;

/// Trần token mới theo độ dài đoạn, đúng công thức của `asr-worker` (`max_new_tokens` trong `shared.rs`).
fn audio_token_cap(n_samples: usize) -> usize {
    16 + n_samples * 20 / SAMPLE_RATE as usize
}

/// Số token prompt tối đa cho một đoạn `n_samples` mẫu, để `224 − (prompt + 5) ≥ 16 + 20 × số giây`.
pub fn prompt_budget(n_samples: usize, max_tokens: usize) -> usize {
    (TEXT_CTX_HALF - PROMPT_OVERHEAD)
        .saturating_sub(audio_token_cap(n_samples))
        .min(max_tokens)
}

#[derive(Debug, Default)]
pub struct PromptHistory {
    per_lang: HashMap<String, VecDeque<i32>>,
    max_tokens: usize,
}

impl PromptHistory {
    pub fn new(max_tokens: usize) -> Self {
        Self {
            per_lang: HashMap::new(),
            max_tokens,
        }
    }

    /// Thêm token của một đoạn đã được giữ lại.
    pub fn push(&mut self, lang: &str, tokens: &[i32]) {
        let history = self.per_lang.entry(lang.to_string()).or_default();
        history.extend(tokens);
        let excess = history.len().saturating_sub(self.max_tokens);
        history.drain(..excess);
    }

    /// Prompt cho đoạn kế tiếp: token cuối của ngôn ngữ `prev_lang` (ngôn ngữ của đoạn trước), cắt theo `prompt_budget`.
    /// Worker chỉ dùng prompt này nếu đoạn mới vẫn là `prev_lang`.
    pub fn prompt_for(&self, prev_lang: Option<&str>, n_samples: usize) -> Vec<i32> {
        let Some(history) = prev_lang.and_then(|l| self.per_lang.get(l)) else {
            return Vec::new();
        };
        let take = prompt_budget(n_samples, self.max_tokens).min(history.len());
        history.iter().skip(history.len() - take).copied().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: usize = SAMPLE_RATE as usize;

    #[test]
    fn budget_keeps_the_audio_cap_of_the_worker() {
        assert_eq!(prompt_budget(3 * SECOND, 100), 100); // trần 76: còn chỗ cho đủ 100
        assert_eq!(prompt_budget(134_400, 100), 35); // 8,4 giây: trần 184, 219 − 184 = 35
        assert_eq!(prompt_budget(12 * SECOND, 100), 0); // đoạn gộp 12 giây: trần 256 > 219
        for n in [SECOND, 5 * SECOND, 134_400, 10 * SECOND] {
            let k = prompt_budget(n, 100);
            // Công thức trần của worker với prompt k token: min(224 − (k + 5), 16 + 20 × giây).
            let cap_with_prompt = (TEXT_CTX_HALF - (k + 5)).min(audio_token_cap(n));
            assert_eq!(cap_with_prompt, audio_token_cap(n), "{n} mẫu");
        }
    }

    #[test]
    fn history_is_per_language_and_keeps_the_last_tokens() {
        let mut h = PromptHistory::new(100);
        h.push("en", &(0..80).collect::<Vec<i32>>());
        h.push("en", &(80..130).collect::<Vec<i32>>());
        h.push("vi", &[7, 8]);
        let en = h.prompt_for(Some("en"), 3 * SECOND);
        assert_eq!(en.len(), 100);
        assert_eq!((en[0], en[99]), (30, 129));
        assert_eq!(h.prompt_for(Some("vi"), 3 * SECOND), [7, 8]);
        assert!(h.prompt_for(Some("ja"), 3 * SECOND).is_empty());
        assert!(h.prompt_for(None, 3 * SECOND).is_empty());
    }

    #[test]
    fn long_segments_get_the_tail_of_the_history() {
        let mut h = PromptHistory::new(100);
        h.push("en", &(0..100).collect::<Vec<i32>>());
        let p = h.prompt_for(Some("en"), 134_400);
        assert_eq!(p, (65..100).collect::<Vec<i32>>());
        assert!(h.prompt_for(Some("en"), 12 * SECOND).is_empty());
    }
}
