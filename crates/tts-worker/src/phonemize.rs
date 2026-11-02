//! Chữ → âm vị cho v3 Turbo: `sea-g2p` (chuẩn hóa số, ngày, đơn vị… rồi G2P song ngữ Việt–Anh) cộng phần keo giữ nguyên
//! các dấu hiệu phi ngôn ngữ `[cười]`, `[thở dài]`, `[hắng giọng]` thành token `<|emotion_k|>`.
//! Port từ `vieneu_utils/phonemize_text.py::phonemize_text_with_emotions` (SDK `vieneu`).

use regex::Regex;
use sea_g2p_rs::g2p::G2PEngine;
use sea_g2p_rs::lang::vi::Normalizer;
use sea_g2p_rs::punc::apply_punc_norm;
use std::io;

/// Dấu câu dính vào token hay âm vị đứng trước (không thêm dấu cách).
const ATTACHING_PUNCT: &str = ".,!?;:…)]}\"'’”";

pub struct Phonemizer {
    normalizer: Normalizer,
    engine: G2PEngine,
    split: Regex,
}

impl Phonemizer {
    /// `dict_path`: file từ điển `sea_g2p.bin` (cùng gói model).
    pub fn open(dict_path: &str) -> io::Result<Self> {
        let engine = G2PEngine::new(dict_path)?;
        let normalizer = Normalizer::new("vi", Some(dict_path));
        let split = Regex::new(r"(\[[^\]]+\]|<\|emotion_\d+\|>)").expect("regex hằng");
        Ok(Self {
            normalizer,
            engine,
            split,
        })
    }

    fn plain(&self, text: &str, punc_norm: bool) -> String {
        if text.is_empty() {
            return String::new();
        }
        let normalized = self.normalizer.normalize(text, punc_norm);
        self.engine.phonemize(&normalized)
    }

    /// Chữ → chuỗi âm vị, giữ dấu hiệu cảm xúc. Câu không có `[` hay `<|emotion_` đi đường nhanh.
    pub fn phonemize(&self, text: &str) -> String {
        if !text.contains('[') && !text.contains("<|emotion_") {
            return self.plain(text, true);
        }
        let mut parts: Vec<(bool, &str)> = Vec::new();
        let mut last = 0;
        for m in self.split.find_iter(text) {
            parts.push((false, &text[last..m.start()]));
            parts.push((true, m.as_str()));
            last = m.end();
        }
        parts.push((false, &text[last..]));

        let mut out = String::new();
        for (is_tag, part) in parts {
            if is_tag && let Some(token) = emotion_token(part) {
                if out.is_empty() {
                    out = token;
                } else {
                    out.push(' ');
                    out.push_str(&token);
                }
                continue;
            }
            // Đoạn giữa các token cảm xúc KHÔNG ép punc_norm, để khỏi chèn "." giữa câu (khớp dữ liệu huấn luyện).
            let ph = if part.trim().is_empty() {
                String::new()
            } else {
                self.plain(part, false)
            };
            if ph.is_empty() {
                continue;
            }
            if out.is_empty() {
                out = ph;
            } else if ph.chars().next().is_some_and(|c| ATTACHING_PUNCT.contains(c)) {
                out.push_str(&ph);
            } else {
                out.push(' ');
                out.push_str(&ph);
            }
        }
        apply_punc_norm(&out)
    }
}

/// `[cười]` → `<|emotion_1|>`… ; `<|emotion_k|>` có sẵn giữ nguyên; thẻ lạ → `None` (đọc như chữ thường).
fn emotion_token(tag: &str) -> Option<String> {
    let t = tag.trim();
    if t.starts_with("<|") {
        return Some(t.to_string());
    }
    let inner = t.strip_prefix('[')?.strip_suffix(']')?.trim().to_lowercase();
    let k = match inner.as_str() {
        "chuckle" | "cười" | "cuoi" => 1,
        "sigh" | "thở dài" | "tho dai" => 2,
        "clear throat" | "hắng giọng" | "hang giong" => 3,
        _ => return None,
    };
    Some(format!("<|emotion_{k}|>"))
}

#[cfg(test)]
mod tests {
    use super::emotion_token;

    #[test]
    fn emotion_tags_map_to_tokens() {
        assert_eq!(emotion_token("[cười]").as_deref(), Some("<|emotion_1|>"));
        assert_eq!(emotion_token("[ Sigh ]").as_deref(), Some("<|emotion_2|>"));
        assert_eq!(emotion_token("[hắng giọng]").as_deref(), Some("<|emotion_3|>"));
        assert_eq!(emotion_token("<|emotion_2|>").as_deref(), Some("<|emotion_2|>"));
        assert_eq!(emotion_token("[lạ]"), None);
    }
}
