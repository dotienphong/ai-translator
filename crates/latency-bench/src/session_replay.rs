//! Dựng lại những gì giao diện thấy từ các sự kiện của engine (`latency-bench session`, spec 2026-10-10 §10.1): mỗi phụ
//! đề hiện gì và lúc nào, bản dịch đang hiện được dịch từ phiên bản câu nào, và chữ nguồn của câu gồm những phần nào.
//!
//! - **Phần (`Piece`)**: mỗi lần một phụ đề có `end_ms` mới (câu mới, câu được ghép thêm đoạn §6.3) là một phần chữ nguồn
//!   mới, mốc cuối là `end_ms` đó. Câu gộp ở hàng đợi dịch (§7, `replaces`) nhận luôn các phần của các câu bị gộp.
//! - **Bản dịch thuộc phiên bản nào (`Shown::tgt_of`)**: upsert đổi `end_ms` mà giữ nguyên chữ dịch là bản dịch cũ đang
//!   được giữ (A2); chữ dịch mới (delta, upsert có chữ khác, trạng thái cuối) là của phiên bản hiện tại.

use crate::session_metrics::{Recorded, Timed};
use pipeline::glossary::normalize;
use pipeline::subtitle::{LiveLine, Status, Subtitle};
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

/// Một lần hiện của dòng đang nói (kế hoạch 02; spec 2026-10-10 §6.2).
#[derive(Clone, Debug, PartialEq)]
pub struct LiveObs {
    pub t_ms: f64,
    /// Câu mà dòng thay chỗ lúc đó: `extends`, hay chính id của dòng.
    pub sentence: u64,
    /// Khóa của chữ nguồn đang hiện (`src_stable + src_tail`).
    pub src_keys: Vec<String>,
    pub tgt_src_units: usize,
    pub tgt_stable: String,
    /// Số đơn vị (`target_units`) của phần dịch ổn định.
    pub stable_units: usize,
    /// Cả chữ dịch đang hiện (`tgt_stable + tgt_tail`).
    pub tgt: String,
}

/// Lịch sử của một dòng đang nói.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LiveTrack {
    pub obs: Vec<LiveObs>,
    /// Phần chữ (chỉ số trong `Replay::pieces`) mà lượt cuối của đoạn tạo ra, và câu chứa nó lúc đó (QĐ10 của kế hoạch 02).
    pub piece: Option<usize>,
    pub sentence: Option<u64>,
    /// Lúc gỡ dòng, và chữ dịch của câu lúc đó (phụ đề cuối thay vào).
    pub ended: Option<(f64, String)>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Replay {
    pub tracks: BTreeMap<u64, Track>,
    /// Mọi phần, theo thứ tự xuất hiện.
    pub pieces: Vec<Piece>,
    /// Khóa so khớp của chữ nguồn của từng phần (cùng chỉ số với `pieces`).
    pub piece_keys: Vec<Vec<String>>,
    /// Dòng đang nói theo id (kế hoạch 02).
    pub lives: BTreeMap<u64, LiveTrack>,
    /// (phụ đề, chỉ số phần) mà upsert ngay trước sự kiện đang xét tạo ra (QĐ10 của kế hoạch 02). Sự kiện `live` kế tiếp
    /// dùng hết nó: chỉ lần phát lại lúc đóng băng đứng ngay sau upsert đó.
    just_created: Option<(u64, usize)>,
}

impl Replay {
    pub fn new(events: &[Timed]) -> Self {
        let mut replay = Self::default();
        for e in events {
            match &e.ev {
                Recorded::Subtitle(s) => replay.upsert(e.t_ms, s),
                Recorded::Delta(d) => {
                    replay.just_created = None;
                    replay.delta(e.t_ms, d.id, &d.text);
                }
                Recorded::Indicators(_) => {}
                Recorded::Live(l) => replay.live(e.t_ms, l),
                Recorded::LiveEnd(end) => replay.live_end(e.t_ms, end.id),
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
        let keys = units(&s.src_text, &s.src_lang);
        let n = keys.len();
        let counted: usize = track.pieces.iter().map(|&i| self.pieces[i].units).sum();
        let last_end = track.pieces.last().map(|&i| self.pieces[i].end_ms);
        self.just_created = None;
        if last_end.is_none_or(|e| s.end_ms > e) || n > counted {
            self.pieces.push(Piece {
                end_ms: s.end_ms,
                units: n.saturating_sub(counted),
                owners: vec![s.id],
            });
            self.piece_keys.push(keys.get(counted..).unwrap_or(&[]).to_vec());
            track.pieces.push(self.pieces.len() - 1);
            self.just_created = Some((s.id, self.pieces.len() - 1));
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

    /// Một lần hiện của dòng đang nói. Lần phát lại lúc đóng băng đứng ngay sau upsert tạo phần chữ của đoạn (QĐ5, QĐ10 của
    /// kế hoạch 02), và dòng đã có lần hiện trước đó; dòng mới xuất hiện ngay sau một upsert thì không phải lần đó. Mỗi phần
    /// chỉ gắn với một dòng.
    fn live(&mut self, t_ms: f64, l: &LiveLine) {
        let sentence = l.extends.unwrap_or(l.id);
        let created = self
            .just_created
            .take()
            .filter(|&(sub, piece)| sub == sentence && !self.lives.values().any(|t| t.piece == Some(piece)));
        let track = self.lives.entry(l.id).or_default();
        if let Some((_, piece)) = created
            && track.piece.is_none()
            && !track.obs.is_empty()
        {
            track.piece = Some(piece);
            track.sentence = Some(sentence);
        }
        track.obs.push(LiveObs {
            t_ms,
            sentence,
            src_keys: units(&format!("{}{}", l.src_stable, l.src_tail), &l.src_lang),
            tgt_src_units: l.tgt_src_units as usize,
            tgt_stable: l.tgt_stable.clone(),
            stable_units: target_units(&l.tgt_stable).len(),
            tgt: format!("{}{}", l.tgt_stable, l.tgt_tail),
        });
    }

    /// Gỡ dòng đang nói: ghi lúc gỡ và chữ dịch của câu mà dòng thay chỗ (phụ đề cuối thay vào; dòng của đoạn bị lọc thì
    /// không có gì thay).
    fn live_end(&mut self, t_ms: f64, id: u64) {
        let Some(track) = self.lives.get_mut(&id) else {
            return;
        };
        let shown = track
            .sentence
            .or_else(|| track.obs.last().map(|o| o.sentence))
            .and_then(|s| self.tracks.get(&s))
            .and_then(|t| t.shown.last())
            .map(|s| s.tgt.clone())
            .unwrap_or_default();
        track.ended = Some((t_ms, shown));
    }

    /// Vị trí đầu của phần `piece` trong chữ nguồn của câu `sentence`, và khóa của chữ nguồn cuối của câu.
    fn place(&self, sentence: u64, piece: usize) -> Option<(usize, Vec<String>)> {
        let track = self.tracks.get(&sentence)?;
        let at = track.pieces.iter().position(|&i| i == piece)?;
        let offset = track.pieces[..at].iter().map(|&i| self.pieces[i].units).sum();
        Some((offset, units(&track.src_text, &track.src_lang)))
    }

    /// Lần đầu (ms) đơn vị thứ `j` của phần `piece` được dòng đang nói của phần đó phủ, có chữ dịch (tầng tạm, QĐ10): phần
    /// đầu chung (theo khóa) giữa `tgt_src_units` đơn vị đầu của chữ nguồn đang hiện và bản chép cuối của câu dài hơn vị trí
    /// của đơn vị trong câu.
    pub fn live_tentative_ms(&self, piece: usize, j: usize) -> Option<f64> {
        let track = self.lives.values().find(|t| t.piece == Some(piece))?;
        let sentence = track.sentence?;
        let (offset, keys) = self.place(sentence, piece)?;
        track
            .obs
            .iter()
            .find(|o| {
                o.sentence == sentence
                    && !o.tgt.trim().is_empty()
                    && lcp(&o.src_keys[..o.tgt_src_units.min(o.src_keys.len())], &keys) > offset + j
            })
            .map(|o| o.t_ms)
    }

    /// Lần đầu (ms) một dòng đang thay chỗ câu chứa phần `piece` (chủ đầu tiên của phần) có phần dịch ổn định đủ dài cho đơn
    /// vị thứ `j` của phần (tầng ổn định, xấp xỉ theo tỉ lệ, spec §10.1): ít nhất ⌈(q + 1) × đơn vị bản dịch cuối ÷ đơn vị
    /// bản chép cuối⌉ đơn vị, với q là vị trí của đơn vị trong câu. Câu không có bản dịch cuối còn trên màn hình thì `None`.
    pub fn live_stable_ms(&self, piece: usize, j: usize) -> Option<f64> {
        let sentence = *self.pieces.get(piece)?.owners.first()?;
        let (offset, keys) = self.place(sentence, piece)?;
        let track = self.tracks.get(&sentence).filter(|t| !t.absorbed)?;
        let last = track.shown.last().filter(|s| s.status == Status::Done)?;
        let need = ((offset + j + 1) * target_units(&last.tgt).len()).div_ceil(keys.len().max(1));
        if need == 0 {
            return None;
        }
        self.lives
            .values()
            .flat_map(|t| &t.obs)
            .filter(|o| o.sentence == sentence && o.stable_units >= need)
            .map(|o| o.t_ms)
            .min_by(f64::total_cmp)
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

    /// Tổng số đơn vị chữ dịch bị rút lại giữa hai lần hiện liên tiếp: của cùng một phụ đề; của cùng một dòng đang nói; và
    /// lúc phụ đề cuối thay dòng đang nói (QĐ10 của kế hoạch 02).
    pub fn retracted_units(&self) -> usize {
        let subtitles: usize = self
            .tracks
            .values()
            .flat_map(|t| t.shown.windows(2))
            .map(|w| retracted(&w[0].tgt, &w[1].tgt))
            .sum();
        let lives: usize = self
            .lives
            .values()
            .map(|l| {
                let within: usize = l.obs.windows(2).map(|w| retracted(&w[0].tgt, &w[1].tgt)).sum();
                let replaced = match (&l.ended, l.obs.last()) {
                    (Some((_, fin)), Some(last)) => retracted(&last.tgt, fin),
                    _ => 0,
                };
                within + replaced
            })
            .sum();
        subtitles + lives
    }

    /// Số đơn vị của phần dịch đã ổn định mà bản cuối thay đổi (§10.1). Phụ đề đã chốt không đổi nữa, nên phần của nó bằng
    /// 0; với dòng đang nói: phần dịch ổn định cuối cùng của mỗi dòng so với bản dịch cuối của câu mà dòng thay chỗ (QĐ10).
    pub fn changed_stable_units(&self) -> usize {
        let settled: usize = self.translated().map(|s| changed_stable_units(&s.tgt, &s.tgt)).sum();
        let lives: usize = self
            .lives
            .values()
            .filter_map(|l| {
                let last = l.obs.last().filter(|o| !o.tgt_stable.is_empty())?;
                let track = self.tracks.get(&last.sentence).filter(|t| !t.absorbed)?;
                let fin = track.shown.last().filter(|s| s.status == Status::Done)?;
                Some(changed_stable_units(&last.tgt_stable, &fin.tgt))
            })
            .sum();
        settled + lives
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use pipeline::subtitle::{Delta, LiveEnd};

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
                speaker: None,
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

    /// Một dòng đang nói: chữ nguồn (ổn định, tạm), chữ dịch (ổn định, tạm), `tgt_src_units`.
    pub(crate) fn line(id: u64, extends: Option<u64>, src: (&str, &str), tgt: (&str, &str), units: u32) -> LiveLine {
        LiveLine {
            id,
            extends,
            src_lang: "en".into(),
            src_stable: src.0.into(),
            src_tail: src.1.into(),
            tgt_stable: tgt.0.into(),
            tgt_tail: tgt.1.into(),
            tgt_src_units: units,
            speaker: None,
        }
    }

    pub(crate) fn live(t_ms: f64, line: LiveLine) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::Live(line),
        }
    }

    pub(crate) fn live_end(t_ms: f64, id: u64) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::LiveEnd(LiveEnd { id }),
        }
    }

    /// Câu "so we went home." (một đoạn, tới 5 050 ms) có dòng đang nói: ba lần hiện, lượt cuối, lần phát lại lúc đóng băng
    /// ngay sau upsert tạo phụ đề, dịch xong, gỡ dòng.
    pub(crate) fn live_sentence() -> Vec<Timed> {
        vec![
            live(2_000.0, line(1, None, ("", "so we"), ("", ""), 0)),
            live(2_300.0, line(1, None, ("", "so we"), ("", "chúng tôi"), 2)),
            live(3_300.0, line(1, None, ("so", " we went"), ("chúng", " tôi đã đi"), 3)),
            upsert(5_400.0, 1, 5_050, "so we went home.", "", Status::AsrDone, false),
            live(5_401.0, line(1, None, ("so", " we went"), ("chúng", " tôi đã đi"), 3)),
            upsert(5_410.0, 1, 5_050, "so we went home.", "", Status::Translating, false),
            delta(5_600.0, 1, "chúng tôi về nhà."),
            upsert(
                5_700.0,
                1,
                5_050,
                "so we went home.",
                "chúng tôi về nhà.",
                Status::Done,
                false,
            ),
            live_end(5_701.0, 1),
        ]
    }

    /// Câu "so we went" (tới 1 400 ms) đã dịch, còn mở; dòng 2 nối tiếp nó ("home now"), rồi lượt cuối ghép đoạn 2 vào câu
    /// (tới 4 000 ms), dòng phát lại ngay sau upsert đó, câu dịch lại xong, gỡ dòng.
    pub(crate) fn live_extending() -> Vec<Timed> {
        let whole = "so we went home now.";
        let new = "chúng tôi đi về nhà bây giờ.";
        vec![
            upsert(1_500.0, 1, 1_400, "so we went", "", Status::AsrDone, true),
            upsert(1_510.0, 1, 1_400, "so we went", "", Status::Translating, true),
            upsert(1_700.0, 1, 1_400, "so we went", "chúng tôi đi", Status::Done, true),
            live(
                2_800.0,
                line(2, Some(1), ("so we went", " home"), ("", "chúng tôi đi về"), 4),
            ),
            live(
                3_600.0,
                line(
                    2,
                    Some(1),
                    ("so we went home", " now"),
                    ("chúng tôi đi về", " nhà bây giờ"),
                    5,
                ),
            ),
            upsert(4_400.0, 1, 4_000, whole, "chúng tôi đi", Status::AsrDone, false),
            live(
                4_401.0,
                line(
                    2,
                    Some(1),
                    ("so we went home", " now"),
                    ("chúng tôi đi về", " nhà bây giờ"),
                    5,
                ),
            ),
            upsert(4_600.0, 1, 4_000, whole, "chúng tôi đi", Status::Translating, false),
            upsert(4_800.0, 1, 4_000, whole, new, Status::Translating, false),
            upsert(4_900.0, 1, 4_000, whole, new, Status::Done, false),
            live_end(4_901.0, 2),
        ]
    }

    /// QĐ10 của kế hoạch 02: dòng gắn với phần chữ mà lượt cuối của nó tạo ra; tầng tạm theo phần nguồn đã dịch, tầng ổn định
    /// theo tỉ lệ phần dịch ổn định; độ nháy tạm tính cả lúc phụ đề cuối thay dòng.
    #[test]
    fn a_live_line_is_tied_to_the_piece_of_its_final_and_covers_words() {
        let replay = Replay::new(&live_sentence());
        let track = &replay.lives[&1];
        assert_eq!((track.piece, track.sentence), (Some(0), Some(1)));
        assert_eq!(track.obs.len(), 4);
        assert_eq!(track.ended, Some((5_701.0, "chúng tôi về nhà.".to_string())));
        assert_eq!(replay.piece_keys[0], ["so", "we", "went", "home"]);
        let tentative: Vec<Option<f64>> = (0..4).map(|j| replay.live_tentative_ms(0, j)).collect();
        assert_eq!(tentative, [Some(2_300.0), Some(2_300.0), Some(3_300.0), None]);
        let stable: Vec<Option<f64>> = (0..4).map(|j| replay.live_stable_ms(0, j)).collect();
        assert_eq!(stable, [Some(3_300.0), None, None, None]);
        assert_eq!(replay.retracted_units(), 2, "\"đã đi\" của dòng bị bản cuối thay");
        assert_eq!(replay.changed_stable_units(), 0);
        assert_eq!(replay.final_translated_units(), 4);
    }

    /// Dòng nối tiếp câu: phủ phần mới của câu; phần dịch ổn định của nó tính cho cả các từ của phần cũ (theo tỉ lệ trên cả
    /// câu).
    #[test]
    fn a_line_extending_a_sentence_covers_the_new_piece_and_stabilizes_the_whole_sentence() {
        let replay = Replay::new(&live_extending());
        assert_eq!((replay.lives[&2].piece, replay.lives[&2].sentence), (Some(1), Some(1)));
        assert_eq!(replay.piece_keys[1], ["home", "now"]);
        assert_eq!(
            (replay.live_tentative_ms(1, 0), replay.live_tentative_ms(1, 1)),
            (Some(2_800.0), Some(3_600.0))
        );
        assert_eq!(replay.live_tentative_ms(0, 0), None, "phần đầu không gắn với dòng nào");
        let stable: Vec<Option<f64>> = [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1)]
            .iter()
            .map(|&(p, j)| replay.live_stable_ms(p, j))
            .collect();
        assert_eq!(stable, [Some(3_600.0), Some(3_600.0), None, None, None]);
        assert_eq!((replay.retracted_units(), replay.changed_stable_units()), (0, 0));
    }

    /// Dòng xuất hiện lần đầu ngay sau một upsert tạo phần chữ không phải lần phát lại lúc đóng băng: không gắn với phần đó.
    #[test]
    fn a_new_line_right_after_a_piece_is_not_tied_to_it() {
        let events = vec![
            upsert(1_000.0, 1, 900, "hello", "", Status::AsrDone, true),
            live(1_001.0, line(2, Some(1), ("hello", " there"), ("", "xin chào"), 2)),
        ];
        let replay = Replay::new(&events);
        assert_eq!(replay.lives[&2].piece, None);
    }

    /// Dòng có bản dịch tạm đổi giữa chừng và phần dịch ổn định bị bản cuối sửa (spec §10.1): chỉ `tgt_src_units` đơn
    /// vị đầu của chữ nguồn đang hiện được phủ (chữ nguồn đang hiện có thể dài hơn, hay ngắn hơn, phần đã đem dịch);
    /// lần hiện chưa có chữ dịch không phủ gì; độ nháy tạm đếm cả lần rút lại trong dòng; độ nháy ổn định đếm phần ổn
    /// định cuối không khớp bản cuối.
    #[test]
    fn a_revised_live_line_covers_only_the_translated_source_and_counts_its_flicker() {
        let events = vec![
            // Gói đầu của bản tạm chưa có chữ (dấu kết câu đã bỏ): không phủ gì.
            live(900.0, line(1, None, ("", "so we"), ("", ""), 2)),
            // Chữ nguồn đang hiện đã có "went", bản dịch đang hiện mới dịch hai từ đầu.
            live(1_000.0, line(1, None, ("", "so we went"), ("", "chúng tôi"), 2)),
            // Lần chép mới ngắn hơn phần đã đem dịch.
            live(1_300.0, line(1, None, ("so we", ""), ("chúng", " tôi đi"), 3)),
            live(
                1_600.0,
                line(1, None, ("so we", " went home"), ("chúng", " ta đi về nhà"), 4),
            ),
            live(
                1_700.0,
                line(1, None, ("so we", " went home"), ("chúng ta đi", " về nhà"), 4),
            ),
            upsert(2_000.0, 1, 1_900, "so we went home.", "", Status::AsrDone, false),
            live(
                2_001.0,
                line(1, None, ("so we", " went home"), ("chúng ta đi", " về nhà"), 4),
            ),
            upsert(2_100.0, 1, 1_900, "so we went home.", "", Status::Translating, false),
            delta(2_300.0, 1, "chúng ta về nhà."),
            upsert(
                2_400.0,
                1,
                1_900,
                "so we went home.",
                "chúng ta về nhà.",
                Status::Done,
                false,
            ),
            live_end(2_401.0, 1),
        ];
        let replay = Replay::new(&events);
        assert_eq!((replay.lives[&1].piece, replay.lives[&1].sentence), (Some(0), Some(1)));
        let tentative: Vec<Option<f64>> = (0..4).map(|j| replay.live_tentative_ms(0, j)).collect();
        assert_eq!(tentative, [Some(1_000.0), Some(1_000.0), Some(1_600.0), Some(1_600.0)]);
        let stable: Vec<Option<f64>> = (0..4).map(|j| replay.live_stable_ms(0, j)).collect();
        assert_eq!(stable, [Some(1_300.0), Some(1_700.0), Some(1_700.0), None]);
        // Trong dòng: "tôi đi" bị thay (2). Phụ đề cuối thay dòng: "chúng ta đi về nhà" thành "chúng ta về nhà." (3).
        assert_eq!(replay.retracted_units(), 5);
        // Phần ổn định cuối "chúng ta đi": "đi" không khớp bản cuối.
        assert_eq!(replay.changed_stable_units(), 1);
    }

    /// Phần dịch ổn định của một dòng chỉ tính cho câu mà dòng thay chỗ: dòng của câu sau không làm tầng ổn định của
    /// câu trước sớm lên.
    #[test]
    fn stable_text_counts_only_for_the_sentence_the_line_stands_for() {
        let events = vec![
            live(500.0, line(1, None, ("", "one two"), ("", "một hai"), 2)),
            upsert(1_000.0, 1, 900, "one two.", "", Status::AsrDone, false),
            live(1_001.0, line(1, None, ("", "one two"), ("", "một hai"), 2)),
            upsert(1_100.0, 1, 900, "one two.", "", Status::Translating, false),
            upsert(1_300.0, 1, 900, "one two.", "một hai.", Status::Done, false),
            live_end(1_301.0, 1),
            live(2_000.0, line(3, None, ("three four five", ""), ("ba bốn năm", ""), 3)),
            upsert(2_500.0, 3, 2_400, "three four five.", "", Status::AsrDone, false),
            live(2_501.0, line(3, None, ("three four five", ""), ("ba bốn năm", ""), 3)),
            upsert(2_600.0, 3, 2_400, "three four five.", "", Status::Translating, false),
            upsert(
                2_800.0,
                3,
                2_400,
                "three four five.",
                "ba bốn năm.",
                Status::Done,
                false,
            ),
            live_end(2_801.0, 3),
        ];
        let replay = Replay::new(&events);
        assert_eq!((replay.lives[&1].piece, replay.lives[&3].piece), (Some(0), Some(1)));
        assert_eq!((replay.live_stable_ms(0, 0), replay.live_stable_ms(0, 1)), (None, None));
        assert_eq!(replay.live_stable_ms(1, 2), Some(2_000.0));
    }

    /// Phần của câu bị gộp ở hàng đợi dịch (§7, `replaces`) tính tầng ổn định theo câu chứa nó lúc đầu (chủ đầu tiên):
    /// câu đó không còn bản dịch cuối riêng, nên không có lúc ổn định từ dòng đang nói; dòng của câu gộp không tính cho
    /// nó.
    #[test]
    fn a_piece_absorbed_in_the_translation_queue_has_no_live_stable_time() {
        let mut absorbing = upsert(2_100.0, 1, 1_900, "I see. Okay.", "", Status::AsrDone, false);
        if let Recorded::Subtitle(s) = &mut absorbing.ev {
            s.replaces = vec![2];
        }
        let events = vec![
            live(500.0, line(1, None, ("", "I see"), ("tôi hiểu rồi", ""), 2)),
            upsert(1_000.0, 1, 900, "I see.", "", Status::AsrDone, false),
            live(1_001.0, line(1, None, ("", "I see"), ("tôi hiểu rồi", ""), 2)),
            upsert(2_000.0, 2, 1_900, "Okay.", "", Status::AsrDone, false),
            absorbing,
            upsert(
                2_500.0,
                1,
                1_900,
                "I see. Okay.",
                "Hiểu rồi. Được.",
                Status::Done,
                false,
            ),
            live_end(2_501.0, 1),
        ];
        let replay = Replay::new(&events);
        assert_eq!(replay.pieces[1].owners, [2, 1]);
        assert_eq!(replay.live_stable_ms(0, 1), Some(500.0));
        assert_eq!(replay.live_stable_ms(1, 0), None, "câu 2 đã bị gộp");
    }

    /// Chỉ sự kiện `live` đứng ngay sau upsert tạo phần chữ mới là lần phát lại lúc đóng băng (QĐ5). Câu 1 ngắn, không
    /// có dòng đang nói; dòng 2 của đoạn kế tiếp nối tiếp câu 1 và hiện hai lần trong lúc hàng đợi dịch còn bận (chưa
    /// có upsert hay delta nào khác). Lần hiện thứ hai không gắn dòng 2 với phần của câu 1; dòng 2 gắn với phần mà lượt
    /// cuối của nó tạo ra.
    #[test]
    fn only_the_live_event_right_after_the_upsert_ties_a_line() {
        let events = vec![
            upsert(1_000.0, 1, 900, "yes", "", Status::AsrDone, true),
            live(2_500.0, line(2, Some(1), ("yes", " so we"), ("", ""), 0)),
            live(3_300.0, line(2, Some(1), ("yes so", " we went"), ("", ""), 0)),
            upsert(3_400.0, 1, 900, "yes", "", Status::Translating, true),
            upsert(3_600.0, 1, 900, "yes", "vâng", Status::Done, true),
            live(
                4_000.0,
                line(
                    2,
                    Some(1),
                    ("yes so we", " went home"),
                    ("vâng", " vậy chúng tôi về nhà"),
                    5,
                ),
            ),
            upsert(
                5_000.0,
                1,
                4_800,
                "yes so we went home.",
                "vâng",
                Status::AsrDone,
                false,
            ),
            live(
                5_001.0,
                line(
                    2,
                    Some(1),
                    ("yes so we", " went home"),
                    ("vâng", " vậy chúng tôi về nhà"),
                    5,
                ),
            ),
        ];
        let replay = Replay::new(&events);
        assert_eq!((replay.lives[&2].piece, replay.lives[&2].sentence), (Some(1), Some(1)));
        assert_eq!(replay.live_tentative_ms(0, 0), None, "câu 1 không có dòng đang nói");
        assert_eq!(replay.live_tentative_ms(1, 0), Some(4_000.0));
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
