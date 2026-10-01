//! Ghép câu và phụ đề tạm (spec §6.3, "Ghép câu và phụ đề tạm"). Chuyển nguyên từ mô phỏng của `latency-bench` (Đ3 của
//! kế hoạch 00), để app và công cụ đo S6 dùng đúng một bản luật.
//!
//! Mọi mốc thời gian là mốc tiếng nói (`Segment::start_ms` và `end_ms`, không gồm đệm), nên cửa sổ ghép tính từ lúc hết
//! tiếng nói của đoạn trước tới lúc có tiếng nói của đoạn sau.

use crate::config::MergeConfig;

/// Dấu câu kết thúc của §6.3. Đúng chữ của spec: đuôi như `."` hay `」` chưa được xử lý riêng.
pub const SENTENCE_END: [char; 6] = ['.', '?', '!', '。', '？', '！'];

/// Một đoạn đã chép lời, đủ để quyết định ghép.
#[derive(Clone, Copy, Debug)]
pub struct Piece<'a> {
    pub start_ms: u64,
    pub end_ms: u64,
    /// Ngôn ngữ do `asr-worker` chọn (§6.4).
    pub lang: &'a str,
    pub text: &'a str,
}

/// Cửa sổ ghép: max(700 ms, `vadEndSilenceMs` + 400 ms) với mặc định.
pub fn merge_window_ms(end_silence_ms: u64, cfg: &MergeConfig) -> u64 {
    (end_silence_ms + cfg.window_extra_ms).max(cfg.window_min_ms)
}

/// Đoạn kết thúc bằng dấu câu kết thúc thì câu đã chốt: không còn là phụ đề tạm.
pub fn ends_sentence(text: &str) -> bool {
    text.trim_end().ends_with(SENTENCE_END)
}

/// Chỗ nối chữ: tiếng Trung và tiếng Nhật không có dấu cách giữa các từ.
pub fn joiner(lang: &str) -> &'static str {
    if matches!(lang, "zh" | "ja") { "" } else { " " }
}

/// Câu đang mở: các đoạn liên tiếp đã ghép và chưa chốt.
#[derive(Clone, Debug, PartialEq)]
pub struct OpenSentence {
    /// Ngôn ngữ của các đoạn. Đoạn sau khác ngôn ngữ thì không ghép.
    lang: String,
    text: String,
    segments: usize,
    /// Tổng thời lượng tiếng nói, không tính đệm và không tính khoảng nghỉ giữa các đoạn.
    speech_ms: u64,
    start_ms: u64,
    /// Lúc hết tiếng nói của đoạn cuối.
    last_end_ms: u64,
    /// Đoạn cuối kết thúc bằng dấu câu kết thúc: câu đã chốt.
    closed: bool,
    max_speech_ms: u64,
    max_segments: usize,
}

impl OpenSentence {
    pub fn new(first: &Piece, cfg: &MergeConfig) -> Self {
        Self {
            lang: first.lang.to_string(),
            text: first.text.trim().to_string(),
            segments: 1,
            speech_ms: first.end_ms.saturating_sub(first.start_ms),
            start_ms: first.start_ms,
            last_end_ms: first.end_ms,
            closed: ends_sentence(first.text),
            max_speech_ms: cfg.max_speech_ms,
            max_segments: cfg.max_segments,
        }
    }

    /// `next` ghép được vào câu này không. Đoạn cắt cưỡng bức (8 giây) bắt đầu đúng chỗ đoạn trước kết thúc, nên
    /// khoảng cách bằng 0. Đạt trần thì chốt câu, đoạn sau mở câu mới.
    pub fn accepts(&self, next: &Piece, window_ms: u64) -> bool {
        !self.closed
            && next.lang == self.lang
            && next.start_ms.saturating_sub(self.last_end_ms) <= window_ms
            && self.segments < self.max_segments
            && self.speech_ms + next.end_ms.saturating_sub(next.start_ms) <= self.max_speech_ms
    }

    pub fn push(&mut self, next: &Piece) {
        self.text = format!("{}{}{}", self.text.trim_end(), joiner(&self.lang), next.text.trim());
        self.segments += 1;
        self.speech_ms += next.end_ms.saturating_sub(next.start_ms);
        self.last_end_ms = next.end_ms;
        self.closed = ends_sentence(next.text);
    }

    pub fn lang(&self) -> &str {
        &self.lang
    }

    /// Chữ của cả câu, để dịch lại (§6.3).
    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn segments(&self) -> usize {
        self.segments
    }

    pub fn start_ms(&self) -> u64 {
        self.start_ms
    }

    pub fn last_end_ms(&self) -> u64 {
        self.last_end_ms
    }

    /// Có dấu câu kết thúc ở đoạn cuối.
    pub fn is_closed(&self) -> bool {
        self.closed
    }
}

/// Đoạn vừa chép lời xong và cần dịch: ghép vào câu đang mở nếu được, không thì mở câu mới.
/// Trả (số đoạn trong câu, chữ nguồn của cả câu để dịch).
pub fn plan_merge(
    open: &mut Option<OpenSentence>,
    piece: &Piece,
    window_ms: u64,
    cfg: &MergeConfig,
) -> (usize, String) {
    match open.as_mut().filter(|o| o.accepts(piece, window_ms)) {
        Some(o) => o.push(piece),
        None => *open = Some(OpenSentence::new(piece, cfg)),
    }
    let o = open.as_ref().expect("vừa ghép hoặc vừa mở câu");
    (o.segments, o.text.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> MergeConfig {
        MergeConfig::default()
    }

    /// Một đoạn tiếng Anh, chỉ có mốc tiếng nói (không gồm đệm) và chữ, để thử ghép câu.
    fn piece(start_ms: u64, end_ms: u64, text: &str) -> Piece<'_> {
        Piece {
            start_ms,
            end_ms,
            lang: "en",
            text,
        }
    }

    #[test]
    fn merge_window_is_measured_from_speech_end_to_next_speech_start() {
        let open = OpenSentence::new(&piece(1_000, 4_000, "so we went to"), &cfg());
        // Hết tiếng ở 4 000 ms: bắt đầu nói lại ở 4 700 là đúng cửa sổ 700 ms, ở 4 701 là quá 1 ms.
        assert!(open.accepts(&piece(4_700, 6_000, "the market"), 700));
        assert!(!open.accepts(&piece(4_701, 6_000, "the market"), 700));
    }

    #[test]
    fn forced_cut_pieces_touch_and_merge() {
        // Cắt cưỡng bức ở 8 giây: đoạn sau bắt đầu đúng chỗ đoạn trước kết thúc, khoảng cách bằng 0.
        let open = OpenSentence::new(&piece(0, 8_000, "a long sentence that"), &cfg());
        assert!(open.accepts(&piece(8_000, 12_000, "keeps going"), 700));
    }

    #[test]
    fn merge_window_follows_end_silence() {
        assert_eq!(merge_window_ms(200, &cfg()), 700);
        assert_eq!(merge_window_ms(300, &cfg()), 700);
        assert_eq!(merge_window_ms(301, &cfg()), 701);
        assert_eq!(merge_window_ms(800, &cfg()), 1_200);
    }

    #[test]
    fn sentence_is_capped_at_three_segments() {
        let mut open = OpenSentence::new(&piece(0, 2_000, "one"), &cfg());
        let two = piece(2_100, 4_000, "two");
        let three = piece(4_100, 6_000, "three");
        assert!(open.accepts(&two, 700));
        open.push(&two);
        assert!(open.accepts(&three, 700)); // mới 2 đoạn: còn chỗ
        open.push(&three);
        assert_eq!(open.segments(), 3);
        assert!(!open.accepts(&piece(6_100, 7_000, "four"), 700)); // đủ 3 đoạn: đoạn sau mở câu mới
    }

    #[test]
    fn sentence_is_capped_at_15_seconds_of_speech() {
        let open = OpenSentence::new(&piece(0, 8_000, "x"), &cfg()); // 8 giây tiếng nói
        assert!(open.accepts(&piece(8_100, 15_000, "y"), 700)); // tổng 14,9 giây
        assert!(open.accepts(&piece(8_100, 15_100, "y"), 700)); // đúng 15 giây: còn được
        assert!(!open.accepts(&piece(8_100, 15_101, "y"), 700)); // 15,001 giây: quá trần
    }

    #[test]
    fn speech_duration_counts_only_speech_not_the_pauses_between_pieces() {
        let mut open = OpenSentence::new(&piece(0, 5_000, "x"), &cfg());
        open.push(&piece(5_600, 10_600, "y")); // hai khoảng nói 5 giây, nghỉ 0,6 giây: tiếng nói 10 giây
        assert!(open.accepts(&piece(11_200, 16_200, "z"), 700)); // 10 + 5 = 15 giây tiếng nói, dù cả câu trải 16,2 giây
    }

    #[test]
    fn caps_come_from_the_config() {
        let tight = MergeConfig {
            max_segments: 2,
            max_speech_ms: 5_000,
            ..cfg()
        };
        let mut open = OpenSentence::new(&piece(0, 2_000, "a"), &tight);
        assert!(
            !open.accepts(&piece(2_100, 5_200, "b"), 700),
            "2 + 3,1 giây quá trần 5 giây"
        );
        open.push(&piece(2_100, 4_000, "b"));
        assert!(!open.accepts(&piece(4_100, 4_500, "c"), 700), "đủ 2 đoạn");
    }

    #[test]
    fn terminal_punctuation_closes_the_sentence() {
        for end in [".", "?", "!", "。", "？", "！", ". ", "?\n"] {
            let text = format!("đã xong{end}");
            let open = OpenSentence::new(&piece(0, 2_000, &text), &cfg());
            assert!(open.is_closed());
            assert!(!open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
        }
        for end in ["", ",", ";", ":", "，", "、", " và"] {
            let text = format!("còn tiếp{end}");
            let open = OpenSentence::new(&piece(0, 2_000, &text), &cfg());
            assert!(open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
        }
    }

    #[test]
    fn only_the_last_piece_decides_whether_the_sentence_is_closed() {
        let mut open = OpenSentence::new(&piece(0, 2_000, "Xong rồi."), &cfg());
        assert!(!open.accepts(&piece(2_100, 3_000, "tiếp"), 700));
        // Câu mở mà đoạn đầu có dấu chấm giữa chừng (ví dụ "Mr. Smith") vẫn ghép tiếp nếu đoạn cuối không có.
        open = OpenSentence::new(&piece(0, 2_000, "Mr. Smith said"), &cfg());
        open.push(&piece(2_100, 3_000, "that it was done."));
        assert!(!open.accepts(&piece(3_100, 4_000, "next"), 700));
    }

    #[test]
    fn different_language_does_not_merge() {
        let open = OpenSentence::new(&piece(0, 2_000, "hello"), &cfg());
        let next = Piece {
            lang: "vi",
            ..piece(2_100, 3_000, "xin chào")
        };
        assert!(!open.accepts(&next, 700));
    }

    #[test]
    fn merged_source_is_the_whole_sentence() {
        let mut open = None;
        let a = piece(0, 3_000, "We walked to the");
        let b = piece(3_400, 6_000, "market yesterday.");
        let c = piece(6_200, 8_000, "Then we ate.");
        assert_eq!(
            plan_merge(&mut open, &a, 700, &cfg()),
            (1, "We walked to the".to_string())
        );
        assert_eq!(
            plan_merge(&mut open, &b, 700, &cfg()),
            (2, "We walked to the market yesterday.".to_string())
        );
        assert_eq!(open.as_ref().map(|o| (o.start_ms(), o.last_end_ms())), Some((0, 6_000)));
        // `b` kết thúc bằng dấu chấm: câu đã chốt, `c` mở câu mới.
        assert_eq!(plan_merge(&mut open, &c, 700, &cfg()), (1, "Then we ate.".to_string()));
    }

    #[test]
    fn a_piece_outside_the_window_starts_a_new_sentence() {
        let mut open = None;
        plan_merge(&mut open, &piece(0, 3_000, "first part"), 700, &cfg());
        let late = piece(3_701, 5_000, "second part");
        assert_eq!(
            plan_merge(&mut open, &late, 700, &cfg()),
            (1, "second part".to_string())
        );
    }

    #[test]
    fn chinese_and_japanese_join_without_a_space() {
        for lang in ["zh", "ja"] {
            let mut open = None;
            let a = Piece {
                lang,
                ..piece(0, 3_000, "我们走到 ")
            };
            let b = Piece {
                lang,
                ..piece(3_200, 5_000, " 市场")
            };
            plan_merge(&mut open, &a, 700, &cfg());
            assert_eq!(
                plan_merge(&mut open, &b, 700, &cfg()),
                (2, "我们走到市场".to_string()),
                "{lang}"
            );
        }
    }

    #[test]
    fn other_languages_join_with_one_space() {
        for lang in ["en", "ko", "vi"] {
            let mut open = None;
            let a = Piece {
                lang,
                ..piece(0, 3_000, "một hai ")
            };
            let b = Piece {
                lang,
                ..piece(3_200, 5_000, " ba bốn")
            };
            plan_merge(&mut open, &a, 700, &cfg());
            assert_eq!(
                plan_merge(&mut open, &b, 700, &cfg()),
                (2, "một hai ba bốn".to_string()),
                "{lang}"
            );
        }
    }
}
