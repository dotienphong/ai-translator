//! Hậu xử lý bản dịch ngay trong lúc stream (spec §6.5, "Hậu xử lý"), để phụ đề hiện dần từng chữ mà không lộ nhãn hay
//! lời giải thích.
//!
//! - Cắt khoảng trắng ở hai đầu; chuỗi khoảng trắng ở giữa gộp thành một dấu cách.
//! - Giữ lại phần đầu cho tới khi chắc không phải nhãn ("Translation:", "译文："…); nhãn thì bỏ.
//! - Ngoặc kép mở ở đầu (khi câu gốc không mở bằng ngoặc kép) không được hiện trong lúc stream; lúc kết thúc, nếu ngoặc
//!   kép đó bao quanh cả bản dịch thì bỏ cả cặp, còn không (ngoặc đóng nằm giữa câu) thì trả nó lại vào bản cuối. Trên S7,
//!   5/1240 bản dịch mở bằng ngoặc kép, không bản nào là ngoặc bao quanh: cả 5 được giữ nguyên.
//! - Vi phạm thì dừng stream ngay: quá ngưỡng tỉ lệ token (đếm gói SSE, mỗi gói một token), xuống dòng rồi viết tiếp khi
//!   câu gốc không có xuống dòng (dấu hiệu lời giải thích; S7 không có bản dịch đúng nào như vậy), bị cắt ở `max_tokens`,
//!   hoặc rỗng.

/// Nhãn đầu câu hay gặp, viết thường. So khớp không phân biệt hoa thường.
const LABELS: &[&str] = &[
    "translation:",
    "translated text:",
    "translated:",
    "bản dịch:",
    "dịch:",
    "译文：",
    "译文:",
    "翻译：",
    "翻译:",
    "翻訳：",
    "訳文：",
    "번역:",
    "번역：",
];

/// Cặp ngoặc kép mở và đóng.
const QUOTES: &[(char, char)] = &[
    ('"', '"'),
    ('“', '”'),
    ('«', '»'),
    ('「', '」'),
    ('『', '』'),
    ('‘', '’'),
    ('\'', '\''),
];

fn opening_quote(c: char) -> Option<(char, char)> {
    QUOTES.iter().copied().find(|&(open, _)| open == c)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Violation {
    /// Quá ngưỡng tỉ lệ token của cặp ngôn ngữ.
    TooLong,
    /// Xuống dòng rồi viết tiếp, khi câu gốc không có xuống dòng.
    Explanation,
    /// Chạm `max_tokens` (`finish_reason` là "length").
    Truncated,
    /// Không có chữ nào.
    Empty,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    /// Phần chữ mới được hiện (không rỗng).
    Emit(String),
    /// Chưa có gì để hiện.
    Hold,
    /// Dừng stream.
    Stop(Violation),
}

#[derive(Debug)]
pub struct PostProcessor {
    source_opens_with_quote: bool,
    source_has_newline: bool,
    raw: String,
    /// Đã qua phần đầu (nhãn, ngoặc mở): `body_start` là byte đầu của phần thân trong `raw`.
    body_start: Option<usize>,
    quote: Option<(char, char)>,
    emitted: String,
    chunks: usize,
    max_chunks: Option<usize>,
}

impl PostProcessor {
    /// `max_chunks`: số gói (token) tối đa trước khi coi là quá dài; `None` là không kiểm tỉ lệ.
    pub fn new(source: &str, max_chunks: Option<usize>) -> Self {
        let source = source.trim();
        Self {
            source_opens_with_quote: source.chars().next().and_then(opening_quote).is_some(),
            source_has_newline: source.contains('\n'),
            raw: String::new(),
            body_start: None,
            quote: None,
            emitted: String::new(),
            chunks: 0,
            max_chunks,
        }
    }

    /// Nhận một gói chữ của stream.
    pub fn push(&mut self, chunk: &str) -> Step {
        self.chunks += 1;
        if self.max_chunks.is_some_and(|max| self.chunks > max) {
            return Step::Stop(Violation::TooLong);
        }
        self.raw.push_str(chunk);
        if self.body_start.is_none() && !self.decide_head() {
            return Step::Hold;
        }
        match self.visible() {
            Err(v) => Step::Stop(v),
            // Phần hiện luôn nối dài phần đã hiện (chỉ phần đuôi được giữ lại); phòng hờ thì không hiện gì thêm.
            Ok(visible) if !visible.starts_with(&self.emitted) => Step::Hold,
            Ok(visible) => {
                let delta = visible[self.emitted.len()..].to_string();
                if delta.is_empty() {
                    Step::Hold
                } else {
                    self.emitted.push_str(&delta);
                    Step::Emit(delta)
                }
            }
        }
    }

    /// Kết thúc stream. Trả bản dịch cuối, có thể khác phần đã hiện ở chỗ ngoặc kép (xem đầu file).
    pub fn finish(&self, finish_reason: Option<&str>) -> Result<String, Violation> {
        if finish_reason == Some("length") {
            return Err(Violation::Truncated);
        }
        let Some(start) = self.body_start else {
            // Stream kết thúc khi còn đang giữ phần đầu: chỉ có khoảng trắng, nhãn, hay tiền tố của nhãn.
            let head = self.raw.trim();
            let lower = head.to_lowercase();
            return if head.is_empty() || LABELS.iter().any(|l| lower == *l) {
                Err(Violation::Empty)
            } else {
                Ok(collapse(head))
            };
        };
        let body = collapse(self.raw[start..].trim());
        let text = match self.quote {
            Some((open, close)) => match body.strip_suffix(close) {
                // Ngoặc bao quanh cả câu: bên trong không còn ngoặc đóng cùng loại.
                Some(inner) if !inner.contains(close) => inner.trim_end().to_string(),
                _ => format!("{open}{body}"),
            },
            None => body,
        };
        if text.is_empty() {
            Err(Violation::Empty)
        } else {
            Ok(text)
        }
    }

    /// Bỏ khoảng trắng đầu, nhãn và ngoặc mở. Trả `false` nếu còn phải chờ thêm chữ mới biết.
    fn decide_head(&mut self) -> bool {
        let lead = self.raw.len() - self.raw.trim_start().len();
        let mut start = lead;
        let head = &self.raw[start..];
        if head.is_empty() {
            return false;
        }
        let lower = head.to_lowercase();
        if let Some(label) = LABELS.iter().find(|l| lower.starts_with(**l)) {
            // `to_lowercase` có thể đổi độ dài byte với vài chữ; nhãn ở đây giữ nguyên độ dài khi viết thường.
            start += label.len();
            start += self.raw[start..].len() - self.raw[start..].trim_start().len();
        } else if LABELS.iter().any(|l| l.starts_with(&lower)) {
            return false;
        }
        let rest = &self.raw[start..];
        let Some(first) = rest.chars().next() else {
            return false;
        };
        if !self.source_opens_with_quote
            && let Some(pair) = opening_quote(first)
        {
            self.quote = Some(pair);
            start += first.len_utf8();
        }
        self.body_start = Some(start);
        true
    }

    /// Phần thân được phép hiện: khoảng trắng gộp, khoảng trắng cuối và ngoặc đóng cuối (khi đã giấu ngoặc mở) còn giữ lại.
    fn visible(&self) -> Result<String, Violation> {
        let body = &self.raw[self.body_start.expect("đã qua phần đầu")..];
        let body = body.trim_start();
        let trimmed = body.trim_end();
        if !self.source_has_newline && trimmed.contains('\n') {
            return Err(Violation::Explanation);
        }
        let mut text = collapse(trimmed);
        if let Some((_, close)) = self.quote
            && text.ends_with(close)
        {
            text.pop();
        }
        Ok(text)
    }
}

/// Gộp mọi chuỗi khoảng trắng thành một dấu cách.
fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Đưa các gói vào, trả (các phần đã hiện, kết quả cuối).
    fn run(source: &str, chunks: &[&str], max: Option<usize>) -> (Vec<String>, Result<String, Violation>) {
        let mut pp = PostProcessor::new(source, max);
        let mut shown = Vec::new();
        for c in chunks {
            match pp.push(c) {
                Step::Emit(d) => shown.push(d),
                Step::Hold => {}
                Step::Stop(v) => return (shown, Err(v)),
            }
        }
        let end = pp.finish(Some("stop"));
        (shown, end)
    }

    #[test]
    fn plain_translation_streams_word_by_word() {
        let (shown, end) = run("Good morning", &["\n", "Chào", " buổi", "  sáng", " "], None);
        assert_eq!(shown, ["Chào", " buổi", " sáng"]);
        assert_eq!(end.unwrap(), "Chào buổi sáng");
    }

    #[test]
    fn labels_are_held_back_and_removed() {
        let (shown, end) = run("Hello", &["Trans", "lation", ":", " Xin", " chào"], None);
        assert_eq!(shown, ["Xin", " chào"]);
        assert_eq!(end.unwrap(), "Xin chào");
        let (_, end) = run("你好", &["译文：", "Xin chào"], None);
        assert_eq!(end.unwrap(), "Xin chào");
        let (_, end) = run("Hi", &["BẢN DỊCH:", " Chào"], None);
        assert_eq!(end.unwrap(), "Chào");
    }

    #[test]
    fn a_word_that_only_looks_like_a_label_is_released() {
        let (shown, end) = run("La traduction est difficile", &["Translation", " is", " hard"], None);
        assert_eq!(shown, ["Translation is", " hard"]);
        assert_eq!(end.unwrap(), "Translation is hard");
    }

    #[test]
    fn surrounding_quotes_are_removed_when_the_source_has_none() {
        let (shown, end) = run("Let's go", &["“", "Đi", " thôi", "”"], None);
        assert_eq!(
            shown,
            ["Đi", " thôi"],
            "ngoặc mở không hiện, ngoặc đóng cuối được giữ lại"
        );
        assert_eq!(end.unwrap(), "Đi thôi");
        let (_, end) = run("Go", &["\"Đi.\""], None);
        assert_eq!(end.unwrap(), "Đi.");
    }

    #[test]
    fn quotes_that_do_not_surround_the_whole_text_are_kept() {
        // Như ja-vi-892 ở S7: ngoặc đóng nằm giữa câu.
        let chunks = ["“Cốc", " cốc.", " Có", " ai", " không?”", " Cô", " thì", " thầm."];
        let (shown, end) = run("コンコン。「誰かいますか？」彼女はささやいた。", &chunks, None);
        assert_eq!(shown.concat(), "Cốc cốc. Có ai không?” Cô thì thầm.");
        assert_eq!(
            end.unwrap(),
            "“Cốc cốc. Có ai không?” Cô thì thầm.",
            "bản cuối trả lại ngoặc mở"
        );
    }

    #[test]
    fn quotes_of_the_source_are_kept() {
        let (_, end) = run("\"Hello\"", &["\"", "Xin chào", "\""], None);
        assert_eq!(end.unwrap(), "\"Xin chào\"");
    }

    #[test]
    fn too_many_tokens_stop_the_stream() {
        let (shown, end) = run("Hi", &["a", " b", " c", " d"], Some(3));
        assert_eq!(shown, ["a", " b", " c"]);
        assert_eq!(end, Err(Violation::TooLong));
    }

    #[test]
    fn a_new_line_followed_by_more_text_is_an_explanation() {
        let (shown, end) = run("Hi", &["Chào", "\n", "\n", "(Giải", " thích)"], None);
        assert_eq!(shown, ["Chào"]);
        assert_eq!(end, Err(Violation::Explanation));
        // Xuống dòng ở cuối rồi hết: không phải lời giải thích.
        let (_, end) = run("Hi", &["Chào", "\n"], None);
        assert_eq!(end.unwrap(), "Chào");
        // Câu gốc có xuống dòng thì bản dịch được xuống dòng (gộp thành dấu cách khi hiện).
        let (_, end) = run("a\nb", &["x", "\n", "y"], None);
        assert_eq!(end.unwrap(), "x y");
    }

    #[test]
    fn truncated_or_empty_results_are_violations() {
        let mut pp = PostProcessor::new("Hi", None);
        assert_eq!(pp.push("Chào"), Step::Emit("Chào".into()));
        assert_eq!(pp.finish(Some("length")), Err(Violation::Truncated));
        let (_, end) = run("Hi", &["\n", " "], None);
        assert_eq!(end, Err(Violation::Empty));
        let (_, end) = run("Hi", &["Translation:"], None);
        assert_eq!(end, Err(Violation::Empty));
        // Stream kết thúc giữa một tiền tố của nhãn: vẫn là chữ.
        let (_, end) = run("Hi", &["Trans"], None);
        assert_eq!(end.unwrap(), "Trans");
    }
}
