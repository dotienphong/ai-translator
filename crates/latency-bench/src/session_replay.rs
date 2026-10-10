//! Dựng lại những gì giao diện thấy từ các sự kiện của engine (`latency-bench session`, spec 2026-10-10 §10.1): mỗi phụ
//! đề hiện gì và lúc nào, bản dịch đang hiện được dịch từ phiên bản câu nào, và chữ nguồn của câu gồm những phần nào.
//!
//! - **Phần (`Piece`)**: mỗi lần một phụ đề có `end_ms` mới (câu mới, câu được ghép thêm đoạn §6.3) là một phần chữ nguồn
//!   mới, mốc cuối là `end_ms` đó. Câu gộp ở hàng đợi dịch (§7, `replaces`) nhận luôn các phần của các câu bị gộp.
//! - **Bản dịch thuộc phiên bản nào (`Shown::tgt_of`)**: upsert đổi `end_ms` mà giữ nguyên chữ dịch là bản dịch cũ đang
//!   được giữ (A2); chữ dịch mới (delta, upsert có chữ khác, trạng thái cuối) là của phiên bản hiện tại.

use crate::session_metrics::{Recorded, Timed};
use pipeline::glossary::normalize;
use pipeline::subtitle::{Status, Subtitle};
use std::collections::BTreeMap;

/// Khóa so khớp của các đơn vị trong `text` (spec 2026-10-10 §3): một chữ với tiếng Trung và tiếng Nhật, một từ (tách theo
/// khoảng trắng) với tiếng khác. Khóa là dạng NFC, chữ thường, chỉ giữ chữ và số; đơn vị không còn gì (chỉ có dấu câu
/// hay ký hiệu) thì bỏ.
pub fn units(text: &str, lang: &str) -> Vec<String> {
    let text = normalize(text);
    let raw: Vec<String> = if matches!(lang, "zh" | "ja") {
        text.chars().filter(|c| !c.is_whitespace()).map(String::from).collect()
    } else {
        text.split_whitespace().map(String::from).collect()
    };
    raw.iter()
        .map(|u| u.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|k| !k.is_empty())
        .collect()
}

/// Chữ Hán và kana: mỗi chữ là một đơn vị (tiếng Trung, tiếng Nhật). Hangul không thuộc nhóm này (tiếng Hàn tách theo từ).
fn is_han_or_kana(c: char) -> bool {
    matches!(c,
        '\u{3005}'..='\u{3007}'
        | '\u{3040}'..='\u{30FF}'
        | '\u{31F0}'..='\u{31FF}'
        | '\u{3400}'..='\u{4DBF}'
        | '\u{4E00}'..='\u{9FFF}'
        | '\u{F900}'..='\u{FAFF}'
        | '\u{FF66}'..='\u{FF9F}'
        | '\u{20000}'..='\u{323AF}'
    )
}

/// Khóa so khớp của chữ dịch, khi không biết ngôn ngữ đích (`summarize` chỉ nhận truth và sự kiện, H9): mỗi chữ Hán hay
/// kana là một đơn vị, phần còn lại tách theo khoảng trắng. Với đích tiếng Việt, tiếng Anh thì ra đúng như `units`.
pub fn target_units(text: &str) -> Vec<String> {
    let mut spaced = String::new();
    for c in normalize(text).chars() {
        if is_han_or_kana(c) {
            spaced.push(' ');
            spaced.push(c);
            spaced.push(' ');
        } else {
            spaced.push(c);
        }
    }
    spaced
        .split_whitespace()
        .map(|u| u.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|k| !k.is_empty())
        .collect()
}

/// Độ dài phần đầu chung của hai dãy khóa.
pub fn lcp(a: &[String], b: &[String]) -> usize {
    a.iter().zip(b).take_while(|(x, y)| x == y).count()
}

/// Số đơn vị của `old` bị rút lại khi chữ đang hiện đổi thành `new` (§10.1, độ nháy của tầng tạm). Chữ chỉ được nối thêm
/// (delta) thì không có gì bị rút lại, kể cả khi từ cuối đang viết dở ("tô" thành "tôi").
pub fn retracted(old: &str, new: &str) -> usize {
    if new.starts_with(old) {
        return 0;
    }
    let (a, b) = (target_units(old), target_units(new));
    let k = lcp(&a, &b);
    let last_grows = k + 1 == a.len() && b.get(k).is_some_and(|u| u.starts_with(a[k].as_str()));
    a.len() - k - usize::from(last_grows)
}

/// Số đơn vị của phần dịch đã ổn định `stable` mà bản cuối `final_text` thay đổi (§10.1, độ nháy của tầng ổn định).
pub fn changed_stable_units(stable: &str, final_text: &str) -> usize {
    let (a, b) = (target_units(stable), target_units(final_text));
    a.len() - lcp(&a, &b)
}

/// Một phần chữ nguồn của câu.
#[derive(Clone, Debug, PartialEq)]
pub struct Piece {
    /// Mốc cuối tiếng nói của phần (giờ âm thanh, ms).
    pub end_ms: u64,
    /// Số đơn vị nguồn phần này thêm vào câu.
    pub units: usize,
    /// Các phụ đề lần lượt chứa phần này: phụ đề đầu tiên, rồi phụ đề đã gộp nó ở hàng đợi dịch.
    pub owners: Vec<u64>,
}

/// Trạng thái hiện của một phụ đề ngay sau một sự kiện.
#[derive(Clone, Debug, PartialEq)]
pub struct Shown {
    pub t_ms: f64,
    pub end_ms: u64,
    pub status: Status,
    pub provisional: bool,
    pub tgt: String,
    /// `end_ms` của phiên bản câu mà chữ dịch đang hiện được dịch từ đó; `None` khi chưa hiện chữ dịch nào.
    pub tgt_of: Option<u64>,
}

/// Lịch sử của một phụ đề.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Track {
    pub src_lang: String,
    pub src_text: String,
    pub shown: Vec<Shown>,
    /// Chỉ số (trong `Replay::pieces`) các phần của câu, theo thứ tự trong chữ nguồn.
    pub pieces: Vec<usize>,
    /// Đã bị gộp vào phụ đề khác (`replaces`): không còn trên màn hình.
    pub absorbed: bool,
}

/// Trạng thái kết thúc phần dịch của một phụ đề.
const FINAL: [Status; 5] = [
    Status::Done,
    Status::Failed,
    Status::Skipped,
    Status::SameLang,
    Status::Dropped,
];

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Replay {
    pub tracks: BTreeMap<u64, Track>,
    /// Mọi phần, theo thứ tự xuất hiện.
    pub pieces: Vec<Piece>,
}

impl Replay {
    pub fn new(events: &[Timed]) -> Self {
        let mut replay = Self::default();
        for e in events {
            match &e.ev {
                Recorded::Subtitle(s) => replay.upsert(e.t_ms, s),
                Recorded::Delta(d) => replay.delta(e.t_ms, d.id, &d.text),
                Recorded::Indicators(_) => {}
            }
        }
        replay
    }

    fn upsert(&mut self, t_ms: f64, s: &Subtitle) {
        for id in &s.replaces {
            let moved = match self.tracks.get_mut(id) {
                Some(t) if !t.absorbed => {
                    t.absorbed = true;
                    t.pieces.clone()
                }
                _ => continue,
            };
            for &i in &moved {
                self.pieces[i].owners.push(s.id);
            }
            self.tracks.entry(s.id).or_default().pieces.extend(moved);
        }
        let track = self.tracks.entry(s.id).or_default();
        let n = units(&s.src_text, &s.src_lang).len();
        let counted: usize = track.pieces.iter().map(|&i| self.pieces[i].units).sum();
        let last_end = track.pieces.last().map(|&i| self.pieces[i].end_ms);
        if last_end.is_none_or(|e| s.end_ms > e) || n > counted {
            self.pieces.push(Piece {
                end_ms: s.end_ms,
                units: n.saturating_sub(counted),
                owners: vec![s.id],
            });
            track.pieces.push(self.pieces.len() - 1);
        }
        let tgt_of = if s.tgt_text.is_empty() {
            None
        } else if FINAL.contains(&s.status) {
            Some(s.end_ms)
        } else {
            match track.shown.last() {
                // Cùng chữ: bản đang giữ khi ghép câu (A2), hay chỉ đổi trạng thái.
                Some(prev) if prev.tgt == s.tgt_text => prev.tgt_of,
                _ => Some(s.end_ms),
            }
        };
        track.shown.push(Shown {
            t_ms,
            end_ms: s.end_ms,
            status: s.status,
            provisional: s.provisional,
            tgt: s.tgt_text.clone(),
            tgt_of,
        });
        track.src_lang = s.src_lang.clone();
        track.src_text = s.src_text.clone();
    }

    fn delta(&mut self, t_ms: f64, id: u64, text: &str) {
        let Some(track) = self.tracks.get_mut(&id) else { return };
        let Some(last) = track.shown.last().cloned() else {
            return;
        };
        track.shown.push(Shown {
            t_ms,
            tgt: format!("{}{text}", last.tgt),
            tgt_of: Some(last.end_ms),
            ..last
        });
    }

    /// Lần đầu (ms) một phụ đề chứa phần `p` hiện chữ dịch được dịch từ phiên bản có phần đó, hay hiện câu gốc vì câu đã
    /// là ngôn ngữ đích. Đây là tầng tạm ở chế độ thường.
    pub fn first_text_ms(&self, p: &Piece) -> Option<f64> {
        self.earliest(p, |s| {
            s.status == Status::SameLang || s.tgt_of.is_some_and(|v| v >= p.end_ms)
        })
    }

    /// Lần đầu (ms) bản dịch của một phiên bản có phần `p` hiện đủ (`done`), hay câu gốc hiện vì câu đã là ngôn ngữ đích
    /// (A2).
    pub fn done_ms(&self, p: &Piece) -> Option<f64> {
        self.earliest(p, |s| matches!(s.status, Status::Done | Status::SameLang))
    }

    fn earliest(&self, p: &Piece, hit: impl Fn(&Shown) -> bool) -> Option<f64> {
        p.owners
            .iter()
            .filter_map(|id| self.tracks.get(id))
            .filter_map(|t| t.shown.iter().find(|s| s.end_ms >= p.end_ms && hit(s)).map(|s| s.t_ms))
            .min_by(f64::total_cmp)
    }

    /// Lúc phụ đề cuối cùng chứa phần `p` chốt hẳn: `done` hay `same_lang`, không còn `provisional`, và không đổi gì sau
    /// đó. Đây là tầng ổn định ở chế độ thường. `None` nếu câu kết thúc mà không có bản dịch hay câu gốc để hiện.
    pub fn settled_ms(&self, p: &Piece) -> Option<f64> {
        let track = self.tracks.get(p.owners.last()?)?;
        let last = track.shown.last()?;
        (!track.absorbed && !last.provisional && matches!(last.status, Status::Done | Status::SameLang))
            .then_some(last.t_ms)
    }

    /// Trạng thái cuối của phụ đề cuối cùng chứa phần `p`.
    pub fn final_status(&self, p: &Piece) -> Option<Status> {
        self.tracks.get(p.owners.last()?)?.shown.last().map(|s| s.status)
    }

    /// Ngôn ngữ nguồn (LID chọn) của phụ đề cuối cùng chứa phần `p`.
    pub fn final_lang(&self, p: &Piece) -> Option<&str> {
        self.tracks.get(p.owners.last()?).map(|t| t.src_lang.as_str())
    }

    /// Phụ đề còn trên màn hình lúc kết thúc mà có bản dịch xong.
    fn translated(&self) -> impl Iterator<Item = &Shown> {
        self.tracks
            .values()
            .filter(|t| !t.absorbed)
            .filter_map(|t| t.shown.last())
            .filter(|s| s.status == Status::Done)
    }

    /// Số đơn vị của mọi bản dịch cuối: mẫu số của hai tỉ lệ nháy (§10.1).
    pub fn final_translated_units(&self) -> usize {
        self.translated().map(|s| target_units(&s.tgt).len()).sum()
    }

    /// Tổng số đơn vị chữ dịch bị rút lại giữa hai lần hiện liên tiếp của cùng một phụ đề.
    pub fn retracted_units(&self) -> usize {
        self.tracks
            .values()
            .flat_map(|t| t.shown.windows(2))
            .map(|w| retracted(&w[0].tgt, &w[1].tgt))
            .sum()
    }

    /// Số đơn vị của phần dịch đã ổn định mà bản cuối thay đổi. Ở chế độ thường, tầng ổn định chính là phụ đề đã chốt và
    /// không bao giờ đổi nữa, nên phần ổn định bằng bản cuối. Kế hoạch 02 thêm các quan sát của dòng đang nói.
    pub fn changed_stable_units(&self) -> usize {
        self.translated().map(|s| changed_stable_units(&s.tgt, &s.tgt)).sum()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use pipeline::subtitle::Delta;

    /// Một upsert lúc `t_ms`.
    pub(crate) fn upsert(
        t_ms: f64,
        id: u64,
        end_ms: u64,
        src: &str,
        tgt: &str,
        status: Status,
        provisional: bool,
    ) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::Subtitle(Subtitle {
                id,
                start_ms: 0,
                end_ms,
                src_lang: "en".into(),
                src_text: src.into(),
                tgt_text: tgt.into(),
                status,
                provisional,
                replaces: Vec::new(),
            }),
        }
    }

    pub(crate) fn delta(t_ms: f64, id: u64, text: &str) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::Delta(Delta { id, text: text.into() }),
        }
    }

    /// Câu "so we went" (đoạn tới 2 500 ms) được dịch, rồi ghép thêm "home." (đoạn tới 5 050 ms). `held`: bản dịch cũ còn
    /// hiện trong lúc dịch lại (A2); không thì bị xóa như trước A2.
    pub(crate) fn merged_sentence(held: bool) -> Vec<Timed> {
        let old = if held { "chúng tôi đã đi" } else { "" };
        let mut events = vec![
            upsert(2_600.0, 1, 2_500, "so we went", "", Status::AsrDone, true),
            upsert(2_610.0, 1, 2_500, "so we went", "", Status::Translating, true),
            delta(2_700.0, 1, "chúng tôi"),
            delta(2_750.0, 1, " đã đi"),
            upsert(2_800.0, 1, 2_500, "so we went", "chúng tôi đã đi", Status::Done, true),
            upsert(5_400.0, 1, 5_050, "so we went home.", old, Status::AsrDone, false),
            upsert(5_410.0, 1, 5_050, "so we went home.", old, Status::Translating, false),
        ];
        if held {
            events.push(upsert(
                5_600.0,
                1,
                5_050,
                "so we went home.",
                "chúng tôi về nhà.",
                Status::Translating,
                false,
            ));
        } else {
            events.push(delta(5_600.0, 1, "chúng tôi về nhà."));
        }
        events.push(upsert(
            5_700.0,
            1,
            5_050,
            "so we went home.",
            "chúng tôi về nhà.",
            Status::Done,
            false,
        ));
        events
    }

    #[test]
    fn units_are_words_or_cjk_characters_without_punctuation() {
        assert_eq!(units("Xin chào, thế giới!", "vi"), ["xin", "chào", "thế", "giới"]);
        assert_eq!(units("你好，世界。", "zh"), ["你", "好", "世", "界"]);
        assert_eq!(units("こんにちは 世界", "ja").len(), 7);
        assert_eq!(units("Hello — world ...", "en"), ["hello", "world"]);
        // Dấu tiếng Việt viết tổ hợp (e + dấu mũ + dấu nặng) cho cùng khóa với chữ dựng sẵn.
        assert_eq!(units("Vie\u{0302}\u{0323}t", "vi"), units("Việt", "vi"));
        assert!(units(" ... ", "en").is_empty());
        assert_eq!(target_units("Xin chào, bạn!"), ["xin", "chào", "bạn"]);
        assert_eq!(target_units("你好，世界"), ["你", "好", "世", "界"]);
        assert_eq!(
            target_units("안녕 하세요"),
            ["안녕", "하세요"],
            "tiếng Hàn tách theo từ"
        );
    }

    #[test]
    fn retraction_counts_only_units_that_disappear() {
        assert_eq!(retracted("", "chúng tôi"), 0);
        assert_eq!(retracted("chúng tô", "chúng tôi về"), 0, "từ cuối đang viết dở");
        assert_eq!(retracted("chúng tôi đã đi", ""), 4, "xóa trắng");
        assert_eq!(retracted("chúng tôi đã đi", "chúng tôi về nhà."), 2);
        assert_eq!(retracted("xin chà", "xin chào bạn"), 0);
        assert_eq!(retracted("a b c", "a b cd e"), 0);
        assert_eq!(retracted("a b c", "a b x"), 1);
        assert_eq!(changed_stable_units("chúng tôi đã", "chúng tôi về nhà"), 1);
    }

    #[test]
    fn a_merged_sentence_is_two_pieces_and_the_held_text_belongs_to_the_old_version() {
        let replay = Replay::new(&merged_sentence(true));
        assert_eq!(
            replay.pieces,
            [
                Piece {
                    end_ms: 2_500,
                    units: 3,
                    owners: vec![1]
                },
                Piece {
                    end_ms: 5_050,
                    units: 1,
                    owners: vec![1]
                },
            ]
        );
        let tgt_of: Vec<Option<u64>> = replay.tracks[&1].shown.iter().map(|s| s.tgt_of).collect();
        assert_eq!(
            tgt_of,
            [
                None,
                None,
                Some(2_500),
                Some(2_500),
                Some(2_500),
                Some(2_500), // ghép câu: bản cũ còn hiện
                Some(2_500),
                Some(5_050), // bản mới thay vào
                Some(5_050),
            ]
        );
        let (p0, p1) = (&replay.pieces[0], &replay.pieces[1]);
        assert_eq!(replay.first_text_ms(p0), Some(2_700.0));
        assert_eq!(replay.first_text_ms(p1), Some(5_600.0));
        assert_eq!(replay.done_ms(p0), Some(2_800.0));
        assert_eq!(replay.done_ms(p1), Some(5_700.0));
        assert_eq!(replay.settled_ms(p0), Some(5_700.0), "câu chỉ chốt hẳn ở lần cuối");
        assert_eq!(replay.final_status(p1), Some(Status::Done));
        assert_eq!(replay.final_translated_units(), 4);
        assert_eq!(replay.retracted_units(), 2, "\"đã đi\" bị thay bằng \"về nhà\"");
        assert_eq!(replay.changed_stable_units(), 0);
    }

    #[test]
    fn before_a2_the_merge_erased_the_shown_translation() {
        let replay = Replay::new(&merged_sentence(false));
        assert_eq!(replay.retracted_units(), 4, "bản cũ bị xóa trắng");
        assert_eq!(replay.first_text_ms(&replay.pieces[1]), Some(5_600.0));
    }

    #[test]
    fn a_sentence_merged_in_the_translation_queue_hands_its_pieces_over() {
        let mut absorbing = upsert(9_000.0, 1, 7_000, "One. Two.", "", Status::AsrDone, false);
        if let Recorded::Subtitle(s) = &mut absorbing.ev {
            s.replaces = vec![2];
        }
        let events = vec![
            upsert(4_000.0, 1, 3_000, "One.", "", Status::AsrDone, false),
            upsert(8_000.0, 2, 7_000, "Two.", "", Status::AsrDone, false),
            absorbing,
            upsert(9_500.0, 1, 7_000, "One. Two.", "Một. Hai.", Status::Done, false),
        ];
        let replay = Replay::new(&events);
        assert!(replay.tracks[&2].absorbed);
        assert_eq!(replay.tracks[&1].pieces, [0, 1]);
        let two = &replay.pieces[1];
        assert_eq!((two.end_ms, two.units, two.owners.clone()), (7_000, 1, vec![2, 1]));
        assert_eq!(replay.first_text_ms(two), Some(9_500.0));
        assert_eq!(replay.settled_ms(two), Some(9_500.0));
        assert_eq!(replay.pieces.len(), 2, "câu gộp không thêm phần nào khác");
    }

    #[test]
    fn same_language_and_dropped_sentences() {
        let mut same = upsert(3_000.0, 4, 2_000, "Xin chào", "", Status::SameLang, false);
        if let Recorded::Subtitle(s) = &mut same.ev {
            s.src_lang = "vi".into();
        }
        let events = vec![same, upsert(6_000.0, 5, 5_000, "", "", Status::Dropped, false)];
        let replay = Replay::new(&events);
        let (vi, dropped) = (&replay.pieces[0], &replay.pieces[1]);
        assert_eq!(
            (vi.units, replay.first_text_ms(vi), replay.done_ms(vi)),
            (2, Some(3_000.0), Some(3_000.0))
        );
        assert_eq!(replay.settled_ms(vi), Some(3_000.0));
        assert_eq!(
            (dropped.units, replay.first_text_ms(dropped), replay.done_ms(dropped)),
            (0, None, None)
        );
        assert_eq!(replay.final_status(dropped), Some(Status::Dropped));
        assert_eq!(replay.final_lang(vi), Some("vi"));
    }
}
