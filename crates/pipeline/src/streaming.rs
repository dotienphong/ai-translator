//! Luật thuần của chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §3–§5; H4 của kế hoạch 00): đơn vị và khóa
//! so khớp, chốt dần bằng LocalAgreement (`Stabilizer`), nhịp và tự tắt (`Cadence`), lịch chép từng phần
//! (`PartialScheduler`). Không có luồng, khóa hay giờ thật: luồng VAD và luồng phụ đề của `engine` gọi vào đây.

use crate::config::StreamingConfig;
use crate::glossary::normalize;
use crate::metrics::percentile;
use crate::sentence::SENTENCE_END;
use std::collections::VecDeque;
use unicode_normalization::UnicodeNormalization;

/// Một đơn vị hiển thị (từ, hay chữ với zh/ja) và khóa so khớp (NFC, chữ thường, bỏ dấu câu) — spec §3.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unit {
    pub text: String,
    pub key: String,
}

/// Tiếng Trung và tiếng Nhật: mỗi chữ (ký tự không phải khoảng trắng) là một đơn vị, nối không có dấu cách (spec §3).
pub fn uses_char_units(lang: &str) -> bool {
    matches!(lang, "zh" | "ja")
}

/// Chỗ nối hai đơn vị: không có gì với zh/ja, một dấu cách với tiếng khác.
fn separator(lang: &str) -> &'static str {
    if uses_char_units(lang) { "" } else { " " }
}

/// Khóa so khớp: NFC, chữ thường, chỉ giữ chữ và số (bỏ dấu câu và ký hiệu), như `units` của `latency-bench`.
fn key_of(text: &str) -> String {
    normalize(text).chars().filter(|c| c.is_alphanumeric()).collect()
}

/// Mọi đơn vị trả về đều có `key` khác rỗng: phần chỉ gồm dấu câu (ký tự loại P, hay token như "—", "…") không thành
/// đơn vị riêng mà gắn vào `text` của đơn vị đứng trước; nếu ở đầu chuỗi thì gắn vào đơn vị đứng sau. Chuỗi không có
/// đơn vị nào có key thì trả rỗng. Nhờ vậy "你好，世界" và "你好世界" có cùng dãy key [你,好,世,界].
///
/// `text` của đơn vị ở dạng NFC (dấu tiếng Việt tổ hợp thành chữ dựng sẵn), giữ hoa thường và dấu câu để hiện. Với tiếng
/// Trung, tiếng Nhật, khoảng trắng bị bỏ (đơn vị nối không có dấu cách); với tiếng khác, dấu câu gắn vào đơn vị bên cạnh
/// kèm một dấu cách, nên `join_units` trả lại đúng chuỗi đã gộp khoảng trắng.
pub fn split_units(text: &str, lang: &str) -> Vec<Unit> {
    let text: String = text.nfc().collect();
    let sep = separator(lang);
    let pieces: Vec<String> = if uses_char_units(lang) {
        text.chars().filter(|c| !c.is_whitespace()).map(String::from).collect()
    } else {
        text.split_whitespace().map(String::from).collect()
    };
    let mut units: Vec<Unit> = Vec::new();
    // Dấu câu đứng trước đơn vị có khóa đầu tiên: gắn vào đơn vị đó.
    let mut lead = String::new();
    for piece in pieces {
        let key = key_of(&piece);
        if !key.is_empty() {
            units.push(Unit {
                text: format!("{lead}{piece}"),
                key,
            });
            lead.clear();
        } else if let Some(prev) = units.last_mut() {
            prev.text.push_str(sep);
            prev.text.push_str(&piece);
        } else {
            lead.push_str(&piece);
            lead.push_str(sep);
        }
    }
    units
}

/// Nối các đơn vị để hiện: không có gì với zh/ja, một dấu cách với tiếng khác.
pub fn join_units(units: &[Unit], lang: &str) -> String {
    units
        .iter()
        .map(|u| u.text.as_str())
        .collect::<Vec<_>>()
        .join(separator(lang))
}

/// Bỏ một dấu kết câu ở cuối (. ? ! 。 ？ ！) và khoảng trắng sau nó (spec §4.3): bản dịch tạm chưa phải câu xong. Kết quả
/// không có khoảng trắng cuối.
pub fn strip_terminal_punct(text: &str) -> &str {
    let text = text.trim_end();
    match text.strip_suffix(SENTENCE_END) {
        Some(rest) => rest.trim_end(),
        None => text,
    }
}

/// Kết quả hiển thị: `stable + tail` là cả chuỗi; `tail` tự mang khoảng trắng đầu khi cần.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Split {
    pub stable: String,
    pub tail: String,
}

/// Chốt dần theo LocalAgreement-n, chỉ dài thêm (spec §4.2, §4.4).
///
/// Mỗi `push`: tách đơn vị, giữ `n` kết quả gần nhất; đủ `n` kết quả thì `c` = độ dài phần chung (theo khóa) của cả `n`,
/// `cand = c − holdback`; nếu `cand` dài hơn phần ổn định và kết quả mới nhất khớp phần ổn định ở các vị trí đầu, phần ổn
/// định lấy `cand` đơn vị đầu của kết quả mới nhất. Phần tạm là các đơn vị của kết quả mới nhất từ vị trí `stable_len()`.
#[derive(Clone, Debug)]
pub struct Stabilizer {
    lang: String,
    n: usize,
    holdback: usize,
    history: VecDeque<Vec<Unit>>,
    stable: Vec<Unit>,
}

impl Stabilizer {
    pub fn new(lang: &str, agree_n: usize, holdback: usize) -> Self {
        Self {
            lang: lang.to_string(),
            n: agree_n.max(1),
            holdback,
            history: VecDeque::new(),
            stable: Vec::new(),
        }
    }

    /// Thêm một kết quả mới (bản chép từng phần, hay bản dịch tạm đã xong) và trả phần ổn định / phần tạm.
    pub fn push(&mut self, text: &str) -> Split {
        self.history.push_back(split_units(text, &self.lang));
        while self.history.len() > self.n {
            self.history.pop_front();
        }
        let newest = self.history.back().expect("vừa thêm").clone();
        if self.history.len() == self.n {
            let common = (0..newest.len())
                .take_while(|&i| {
                    self.history
                        .iter()
                        .all(|h| h.get(i).is_some_and(|u| u.key == newest[i].key))
                })
                .count();
            let cand = common.saturating_sub(self.holdback);
            let keeps_stable = self.stable.iter().zip(&newest).all(|(s, u)| s.key == u.key);
            if cand > self.stable.len() && keeps_stable {
                self.stable = newest[..cand].to_vec();
            }
        }
        self.split_of(&newest)
    }

    /// Chia một bản chưa xong (bản dịch tạm đang stream) theo phần ổn định hiện có, không đổi lịch sử.
    pub fn preview(&self, text: &str) -> Split {
        self.split_of(&split_units(text, &self.lang))
    }

    fn split_of(&self, units: &[Unit]) -> Split {
        let stable = join_units(&self.stable, &self.lang);
        let rest = units.get(self.stable.len()..).unwrap_or(&[]);
        let mut tail = join_units(rest, &self.lang);
        if !tail.is_empty() && !stable.is_empty() && !uses_char_units(&self.lang) {
            tail.insert(0, ' ');
        }
        Split { stable, tail }
    }

    /// Phần ổn định dạng chuỗi (không có khoảng trắng cuối): dùng làm prefill.
    pub fn stable_text(&self) -> String {
        join_units(&self.stable, &self.lang)
    }

    pub fn stable_len(&self) -> usize {
        self.stable.len()
    }
}

/// Nhịp T và tự tắt (spec §5): giữ tối đa `cycle_window` vòng cập nhật gần nhất (ms). Một vòng là từ lúc tạo lần chép từng
/// phần tới lúc bản dịch tạm của nó xong; vòng bị hủy không được ghi.
#[derive(Clone, Debug)]
pub struct Cadence {
    cycles: VecDeque<f32>,
    window: usize,
    factor: f32,
    min_ms: u64,
    max_ms: u64,
    initial_ms: u64,
    warmup: usize,
    auto_off_ms: u64,
}

impl Cadence {
    pub fn new(cfg: &StreamingConfig) -> Self {
        Self {
            cycles: VecDeque::new(),
            window: cfg.cycle_window.max(1),
            factor: cfg.cadence_factor,
            min_ms: cfg.min_cadence_ms,
            // `validate` đã bảo đảm max ≥ min; giữ lại ở đây để `clamp` không bao giờ panic.
            max_ms: cfg.max_cadence_ms.max(cfg.min_cadence_ms),
            initial_ms: cfg.initial_cadence_ms,
            warmup: cfg.warmup_cycles,
            auto_off_ms: cfg.auto_off_cycle_ms,
        }
    }

    /// Một vòng cập nhật xong. Số âm hay không hữu hạn thì bỏ.
    pub fn record(&mut self, cycle_ms: f32) {
        if !(cycle_ms.is_finite() && cycle_ms >= 0.0) {
            return;
        }
        self.cycles.push_back(cycle_ms);
        while self.cycles.len() > self.window {
            self.cycles.pop_front();
        }
    }

    fn median(&self) -> Option<f32> {
        let cycles: Vec<f32> = self.cycles.iter().copied().collect();
        percentile(&cycles, 50.0)
    }

    /// T (ms): `initial_cadence_ms` khi chưa đủ `warmup_cycles` vòng; sau đó `cadence_factor` × trung vị, kẹp
    /// [`min_cadence_ms`, `max_cadence_ms`].
    pub fn cadence_ms(&self) -> u64 {
        match self.median() {
            Some(median) if self.cycles.len() >= self.warmup => {
                ((median * self.factor).round() as u64).clamp(self.min_ms, self.max_ms)
            }
            _ => self.initial_ms,
        }
    }

    /// Đủ `cycle_window` vòng và trung vị lớn hơn `auto_off_cycle_ms`: máy không theo kịp (spec §5).
    pub fn too_slow(&self) -> bool {
        self.cycles.len() >= self.window && self.median().is_some_and(|m| m > self.auto_off_ms as f32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(units: &[Unit]) -> Vec<&str> {
        units.iter().map(|u| u.key.as_str()).collect()
    }

    fn texts(units: &[Unit]) -> Vec<&str> {
        units.iter().map(|u| u.text.as_str()).collect()
    }

    /// Đơn vị (spec §3): một từ với tiếng có dấu cách, một chữ với tiếng Trung và tiếng Nhật.
    #[test]
    fn words_and_cjk_characters_are_units() {
        let en = split_units("So, we went HOME!", "en");
        assert_eq!(keys(&en), ["so", "we", "went", "home"]);
        assert_eq!(texts(&en), ["So,", "we", "went", "HOME!"]);
        assert_eq!(keys(&split_units("안녕 하세요", "ko")), ["안녕", "하세요"]);
        let ja = split_units("こんにちは 世界", "ja");
        assert_eq!(ja.len(), 7);
        assert_eq!(join_units(&ja, "ja"), "こんにちは世界");
        assert!(uses_char_units("zh") && uses_char_units("ja"));
        assert!(!uses_char_units("ko") && !uses_char_units("vi") && !uses_char_units("en"));
    }

    /// Dấu tiếng Việt viết tổ hợp cho cùng khóa và cùng chữ hiện (NFC) với chữ dựng sẵn.
    #[test]
    fn vietnamese_diacritics_are_normalized() {
        let composed = split_units("Việt Nam", "vi");
        let decomposed = split_units("Vie\u{0302}\u{0323}t Nam", "vi");
        assert_eq!(composed, decomposed);
        assert_eq!(keys(&composed), ["việt", "nam"]);
        assert_eq!(texts(&decomposed)[0], "Việt");
    }

    /// Dấu câu không thành đơn vị riêng: gắn vào đơn vị đứng trước, hay đứng sau nếu ở đầu chuỗi (H4). Nhờ vậy câu có và
    /// không có dấu phẩy cho cùng dãy khóa.
    #[test]
    fn punctuation_attaches_to_a_neighbour() {
        let zh = split_units("你好，世界。", "zh");
        assert_eq!(keys(&zh), ["你", "好", "世", "界"]);
        assert_eq!(texts(&zh), ["你", "好，", "世", "界。"]);
        assert_eq!(join_units(&zh, "zh"), "你好，世界。");
        assert_eq!(keys(&split_units("你好世界", "zh")), keys(&zh));
        assert_eq!(texts(&split_units("「はい」", "ja")), ["「は", "い」"]);
        let en = split_units("— Hello — world …", "en");
        assert_eq!(texts(&en), ["— Hello —", "world …"]);
        assert_eq!(join_units(&en, "en"), "— Hello — world …");
        assert!(split_units(" … !! ", "en").is_empty());
        assert!(split_units("。、", "ja").is_empty());
        assert!(split_units("", "vi").is_empty());
    }

    fn split(stable: &str, tail: &str) -> Split {
        Split {
            stable: stable.into(),
            tail: tail.into(),
        }
    }

    /// LocalAgreement-2, giữ lại 1 từ (spec §4.2): phần ổn định là phần chung của hai lần liền nhau trừ từ cuối; phần tạm
    /// tự mang dấu cách đầu.
    #[test]
    fn local_agreement_two_with_one_word_held_back() {
        let mut s = Stabilizer::new("en", 2, 1);
        assert_eq!(s.push("so we"), split("", "so we"));
        assert_eq!(s.push("so we went"), split("so", " we went"));
        assert_eq!(s.push("so we went home"), split("so we", " went home"));
        assert_eq!((s.stable_text().as_str(), s.stable_len()), ("so we", 2));
    }

    /// Phần ổn định chỉ dài thêm: lần mới không khớp thì phần tạm lấy các đơn vị của lần mới từ vị trí bằng độ dài phần ổn
    /// định (§4.2); sai lệch được sửa ở lượt cuối.
    #[test]
    fn the_stable_part_never_shrinks() {
        let mut s = Stabilizer::new("en", 2, 1);
        s.push("so we went");
        s.push("so we went home");
        assert_eq!(s.push("so they went home today"), split("so we", " went home today"));
        assert_eq!(s.stable_text(), "so we");
        assert_eq!(s.push("so we went home today"), split("so we", " went home today"));
        assert_eq!(
            s.push("so we went home today and"),
            split("so we went home", " today and")
        );
    }

    /// Các kết quả gần nhất khớp nhau nhưng trái với phần đã chốt: không chốt thêm.
    #[test]
    fn agreement_that_contradicts_the_stable_part_is_ignored() {
        let mut s = Stabilizer::new("en", 2, 0);
        s.push("a b");
        s.push("a b c");
        assert_eq!(s.stable_text(), "a b");
        assert_eq!(s.push("x y z"), split("a b", " z"));
        assert_eq!(s.push("x y z w"), split("a b", " z w"));
        assert_eq!(s.stable_text(), "a b");
    }

    /// Tiếng Trung: giữ lại 2 chữ; không có dấu cách giữa phần ổn định và phần tạm.
    #[test]
    fn chinese_holds_back_two_characters_without_spaces() {
        let mut s = Stabilizer::new("zh", 2, 2);
        s.push("我们今天");
        assert_eq!(s.push("我们今天开会，"), split("我们", "今天开会，"));
        assert_eq!(s.stable_text(), "我们");
    }

    /// LocalAgreement-3 (spec §4.4, ja và ko): cần ba kết quả liền nhau.
    #[test]
    fn three_results_must_agree_when_n_is_three() {
        let mut s = Stabilizer::new("en", 3, 1);
        s.push("we will");
        assert_eq!(s.push("we will meet"), split("", "we will meet"));
        assert_eq!(s.push("we will meet you"), split("we", " will meet you"));
    }

    /// Khóa bỏ hoa thường và dấu câu; phần ổn định lấy chữ của lần mới nhất và không có khoảng trắng cuối (dùng làm
    /// prefill, spec §4.3).
    #[test]
    fn keys_ignore_case_and_punctuation_and_the_stable_text_has_no_trailing_space() {
        let mut s = Stabilizer::new("vi", 2, 1);
        s.push("Chúng tôi, đã đi");
        assert_eq!(s.push("chúng tôi đã đi về"), split("chúng tôi đã", " đi về"));
        assert!(!s.stable_text().ends_with(char::is_whitespace));
    }

    /// `preview` chia một bản đang stream theo phần ổn định hiện có, không đổi lịch sử.
    #[test]
    fn preview_splits_without_changing_the_history() {
        let mut s = Stabilizer::new("en", 2, 1);
        s.push("so we went");
        s.push("so we went home");
        assert_eq!(s.preview("so we"), split("so we", ""));
        assert_eq!(s.preview("so we will"), split("so we", " will"));
        assert_eq!(s.push("so we went home now"), split("so we went", " home now"));
    }

    /// Nhịp T (spec §5): 1 000 ms khi chưa đủ 3 vòng; sau đó 1,5 × trung vị.
    #[test]
    fn the_cadence_starts_at_one_second_then_follows_the_median() {
        let mut c = Cadence::new(&StreamingConfig::default());
        assert_eq!(c.cadence_ms(), 1_000);
        c.record(500.0);
        c.record(700.0);
        assert_eq!(c.cadence_ms(), 1_000, "chưa đủ 3 vòng");
        c.record(600.0);
        assert_eq!(c.cadence_ms(), 900, "1,5 × trung vị 600");
        c.record(800.0);
        assert_eq!(c.cadence_ms(), 975, "1,5 × trung vị 650");
    }

    #[test]
    fn the_cadence_is_clamped_between_700_and_2000_ms() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..3 {
            c.record(100.0);
        }
        assert_eq!(c.cadence_ms(), 700);
        for _ in 0..8 {
            c.record(1_900.0);
        }
        assert_eq!(c.cadence_ms(), 2_000);
    }

    /// Chỉ `cycle_window` (8) vòng gần nhất được tính.
    #[test]
    fn only_the_last_eight_cycles_count() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..8 {
            c.record(3_000.0);
        }
        for _ in 0..5 {
            c.record(400.0);
        }
        // Còn 3 vòng 3 000 ms và 5 vòng 400 ms: trung vị 400, T = 600 kẹp lên 700.
        assert_eq!(c.cadence_ms(), 700);
        assert!(!c.too_slow());
    }

    /// Tự tắt (spec §5): đủ 8 vòng và trung vị lớn hơn 1 300 ms.
    #[test]
    fn the_mode_turns_off_only_with_a_full_window_over_the_limit() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..7 {
            c.record(5_000.0);
        }
        assert!(!c.too_slow(), "mới 7 vòng");
        c.record(5_000.0);
        assert!(c.too_slow());
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..8 {
            c.record(1_300.0);
        }
        assert!(!c.too_slow(), "đúng 1 300 ms chưa tắt");
        for _ in 0..8 {
            c.record(1_301.0);
        }
        assert!(c.too_slow());
    }

    #[test]
    fn bad_cycle_values_are_ignored() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for bad in [f32::NAN, -1.0, f32::INFINITY] {
            c.record(bad);
        }
        assert_eq!(c.cadence_ms(), 1_000);
        for _ in 0..8 {
            c.record(f32::NAN);
        }
        assert!(!c.too_slow());
    }

    /// Mỗi loại số xấu, ghi riêng đủ một cửa sổ (8 lần, nhiều hơn 3 vòng khởi động), vẫn bị bỏ: lọt vào là T đổi. 0 ms thì
    /// hợp lệ (không âm, hữu hạn).
    #[test]
    fn each_kind_of_bad_cycle_value_is_ignored_on_its_own() {
        for bad in [f32::NAN, -1.0, f32::INFINITY, f32::NEG_INFINITY] {
            let mut c = Cadence::new(&StreamingConfig::default());
            for _ in 0..8 {
                c.record(bad);
            }
            assert_eq!(c.cadence_ms(), 1_000, "{bad} phải bị bỏ");
            assert!(!c.too_slow(), "{bad} phải bị bỏ");
        }
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..3 {
            c.record(0.0);
        }
        assert_eq!(c.cadence_ms(), 700, "0 ms được tính: 1,5 × 0 kẹp lên 700");
    }

    /// Vòng thứ 9 tính từ cuối rơi khỏi cửa sổ: trung vị lấy đúng 8 vòng gần nhất.
    #[test]
    fn the_ninth_newest_cycle_falls_out_of_the_window() {
        let mut c = Cadence::new(&StreamingConfig::default());
        c.record(5_000.0);
        for _ in 0..4 {
            c.record(1_000.0);
        }
        for _ in 0..4 {
            c.record(1_500.0);
        }
        // 8 vòng gần nhất: 4 × 1 000 và 4 × 1 500, trung vị 1 250: T = 1 875, chưa tự tắt. Cửa sổ 9 (còn vòng 5 000 ms)
        // hay 7 (mất một vòng 1 000 ms) đều cho trung vị 1 500: T kẹp 2 000.
        assert_eq!(c.cadence_ms(), 1_875);
        assert!(!c.too_slow());
    }

    /// Mọi ngưỡng lấy từ cấu hình (đổi được qua manifest, spec §5), không phải số mặc định viết cứng.
    #[test]
    fn every_cadence_threshold_comes_from_the_config() {
        let cfg = StreamingConfig {
            cycle_window: 4,
            cadence_factor: 2.0,
            min_cadence_ms: 300,
            max_cadence_ms: 3_000,
            initial_cadence_ms: 1_200,
            warmup_cycles: 2,
            auto_off_cycle_ms: 900,
            ..StreamingConfig::default()
        };
        let mut c = Cadence::new(&cfg);
        assert_eq!(c.cadence_ms(), 1_200);
        c.record(200.0);
        assert_eq!(c.cadence_ms(), 1_200, "chưa đủ 2 vòng");
        c.record(200.0);
        assert_eq!(c.cadence_ms(), 400, "2 × trung vị 200");
        for _ in 0..4 {
            c.record(1_000.0);
        }
        assert_eq!(c.cadence_ms(), 2_000);
        assert!(c.too_slow(), "đủ 4 vòng, trung vị 1 000 > 900");
        for _ in 0..4 {
            c.record(2_000.0);
        }
        assert_eq!(c.cadence_ms(), 3_000, "2 × 2 000 kẹp xuống 3 000");
    }

    #[test]
    fn empty_and_punctuation_only_results_show_nothing() {
        let mut s = Stabilizer::new("en", 2, 1);
        assert_eq!(s.push(""), Split::default());
        assert_eq!(s.push("..."), Split::default());
        assert_eq!(s.stable_len(), 0);
    }

    /// Kết quả mới ngắn hơn phần ổn định mà khớp phần đầu: phần ổn định không rút lại, phần tạm rỗng, không panic; bản cũ
    /// dài hơn bản mới cũng không làm lệch phần chung.
    #[test]
    fn a_shorter_result_never_shrinks_the_stable_part() {
        let mut s = Stabilizer::new("en", 2, 0);
        s.push("a b c d e");
        assert_eq!(s.push("a b c d e f"), split("a b c d e", " f"));
        assert_eq!(s.push("a b c"), split("a b c d e", ""));
        assert_eq!(s.push("a b c"), split("a b c d e", ""));
        assert_eq!(s.preview("a b"), split("a b c d e", ""));
        assert_eq!(s.push("a b c d e f g"), split("a b c d e", " f g"));
        assert_eq!(s.push("a b c d e f g h"), split("a b c d e f g", " h"));
    }

    /// Đồng thuận theo khóa: hoa thường hay dấu câu của phần đã chốt đổi thì phần ổn định vẫn dài thêm và lấy chữ của kết
    /// quả mới nhất (H4); đồng thuận lại ở cùng độ dài thì giữ nguyên chữ đang có.
    #[test]
    fn the_stable_part_grows_by_key_and_takes_the_newest_spelling() {
        let mut s = Stabilizer::new("en", 2, 0);
        s.push("hello world");
        assert_eq!(s.push("Hello, world"), split("Hello, world", ""));
        assert_eq!(s.push("hello world again"), split("Hello, world", " again"));
        assert_eq!(s.push("HELLO WORLD again"), split("HELLO WORLD again", ""));
    }

    /// `agree_n` = 0 được coi là 1, không panic.
    #[test]
    fn agree_n_zero_counts_as_one() {
        let mut s = Stabilizer::new("en", 0, 1);
        assert_eq!(s.push("a b"), split("a", " b"));
        assert_eq!(s.push("x y z"), split("a", " y z"));
    }

    /// Dấu kết câu ở cuối bản dịch tạm không hiện (spec §4.3): bỏ đúng một dấu, và khoảng trắng hai bên nó.
    #[test]
    fn terminal_punctuation_is_stripped_once() {
        assert_eq!(strip_terminal_punct("Xin chào."), "Xin chào");
        assert_eq!(strip_terminal_punct("Xong rồi!  "), "Xong rồi");
        assert_eq!(strip_terminal_punct("你好。"), "你好");
        assert_eq!(strip_terminal_punct("本当？"), "本当");
        assert_eq!(strip_terminal_punct("What?!"), "What?");
        assert_eq!(strip_terminal_punct("chúng tôi ."), "chúng tôi");
        assert_eq!(strip_terminal_punct("Mr. Smith"), "Mr. Smith");
        assert_eq!(strip_terminal_punct("còn tiếp,"), "còn tiếp,");
        assert_eq!(strip_terminal_punct("chào "), "chào");
        assert_eq!(strip_terminal_punct(""), "");
    }
}
