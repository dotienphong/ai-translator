//! Bảng người nói của phiên (spec 2026-10-26-phan-biet-nguoi-noi §8, §9; kế hoạch 03): nhãn "Người N" theo thứ tự xuất hiện, chỉ số
//! màu, tên đổi tay, gộp tay. Chỉ trong RAM, theo phiên (`TranscriptStore`); không có giọng hay dấu vân giọng (spec §5.6, §10). Đổi
//! tên, gộp chỉ đổi cách hiện, không gửi worker (spec §5.4). Tên người dùng gõ không bao giờ vào log hay thông báo lỗi.

use std::collections::BTreeMap;

use pipeline::subtitle::Roster;
use serde::Serialize;

use crate::i18n::Strings;

/// Số màu của bảng (spec §8.1, §8.2): giọng thứ N lấy màu `(N − 1) mod 8`.
pub const PALETTE_SIZE: u32 = 8;
/// Tên dài tối đa, tính theo ký tự (spec §8.2, ô "Đổi tên"; §6.3, tên đọc từ app họp).
pub const MAX_NAME_CHARS: usize = 40;
/// Trần số byte của tên trước khi làm sạch (rà soát mã 03, mục 5): tên qua IPC không giới hạn độ dài, dài hơn trần này thì
/// [`clean_name`] từ chối ngay, không duyệt từng ký tự. Tên hợp lệ có tới 40 ký tự × 4 byte; trần gấp 4 lần thế để còn chỗ cho
/// khoảng trắng và ký tự vô hình bị bỏ (tên đọc từ app họp, kế hoạch 04).
pub const MAX_NAME_BYTES: usize = 4 * 4 * MAX_NAME_CHARS;

/// Tên lấy từ đâu (spec §9).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NameSource {
    /// Tên đọc từ app họp (kế hoạch 04).
    Name,
    /// Chưa có tên: "Người N".
    Voice,
    /// Người dùng đổi tên hay chọn từ danh sách người tham dự; nhãn đã lưu ở Lịch sử.
    User,
}

/// Một giọng như giao diện vẽ (`speaker://roster`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceView {
    pub id: u32,
    /// Nhãn đã tính sẵn: tên đổi tay, tên đọc từ app họp, hay "Người N" theo ngôn ngữ giao diện.
    pub label: String,
    /// Chỉ số trong bảng 8 màu (0–7); giao diện chọn mã màu theo nền (QĐ 1).
    pub color: u32,
    pub source: NameSource,
    /// Giọng trong phòng (spec §5.5).
    pub room: bool,
    /// Đã gộp tay vào giọng này: nhãn, màu, nguồn là của giọng đó (QĐ 4).
    pub merged_into: Option<u32>,
}

impl VoiceView {
    /// Nhãn đã lưu ở Lịch sử, đọc lại thành giọng thứ `order` (từ 1) của phiên đó: màu theo thứ tự, nguồn `user` (QĐ 12).
    pub fn saved(order: u32, label: String) -> Self {
        Self {
            id: order,
            label,
            color: (order.max(1) - 1) % PALETTE_SIZE,
            source: NameSource::User,
            room: false,
            merged_into: None,
        }
    }
}

/// Bảng người nói gửi giao diện (`speaker://roster`, spec §9).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterView {
    /// Các giọng đang có trong phiên, theo mã tăng dần (tức thứ tự xuất hiện).
    pub voices: Vec<VoiceView>,
    /// Tên người tham dự đọc được (kế hoạch 04), cho mục "Chọn người trong cuộc họp". Kế hoạch 03: luôn rỗng.
    pub participants: Vec<String>,
    /// Hiện dòng mời cấp quyền Trợ năng trên thanh phụ đề (spec §6.7). Kế hoạch 04 đặt; kế hoạch 03: luôn `false`.
    pub ask_access: bool,
    /// Số thứ tự của bảng (QĐ 25): tăng dần trong lần chạy của app, `TranscriptStore` đặt; giao diện bỏ bảng có `rev` nhỏ hơn bảng đã
    /// nhận. `SpeakerBook::view` để 0.
    pub rev: u64,
}

/// Lỗi của đổi tên, gộp. Thông báo không có tên người.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum SpeakerError {
    #[error("không có giọng này trong phiên đang chạy")]
    NotFound,
    #[error("tên dài quá 40 ký tự")]
    TooLong,
    #[error("gộp một giọng vào chính nó")]
    Same,
}

#[derive(Clone, Debug, Default)]
struct Voice {
    /// Thứ tự xuất hiện trong phiên, từ 1 ("Người N", màu).
    order: u32,
    room: bool,
    /// Còn trong bảng giọng của worker (giọng bị worker gộp đi thì không).
    live: bool,
    user_name: Option<String>,
    /// Tên đọc từ app họp (kế hoạch 04 đặt).
    auto_name: Option<String>,
}

#[derive(Debug, Default)]
pub struct SpeakerBook {
    voices: BTreeMap<u32, Voice>,
    /// Gộp tay: giọng → giọng nó hiện như. Đích luôn là giọng không bị gộp (một bước).
    merged: BTreeMap<u32, u32>,
    participants: Vec<String>,
    ask_access: bool,
    /// Người dùng tắt "Phân biệt người nói" giữa phiên: bỏ mọi bảng giọng tới sau (QĐ 8).
    off: bool,
}

impl SpeakerBook {
    /// Bảng giọng mới của worker (`EventSink::roster`). Giọng mới nhận thứ tự kế tiếp, xét theo mã tăng dần (mã tăng theo thứ tự xuất
    /// hiện). Trả `true` khi giao diện cần vẽ lại.
    pub fn apply(&mut self, roster: &Roster) -> bool {
        if self.off {
            return false;
        }
        let mut incoming = roster.voices.clone();
        incoming.sort_by_key(|v| v.id);
        let mut changed = false;
        for v in &incoming {
            let next = self.voices.len() as u32 + 1;
            let voice = self.voices.entry(v.id).or_insert_with(|| Voice {
                order: next,
                ..Voice::default()
            });
            if !voice.live || voice.room != v.room {
                voice.live = true;
                voice.room = v.room;
                changed = true;
            }
        }
        for (id, voice) in self.voices.iter_mut() {
            if voice.live && !incoming.iter().any(|v| v.id == *id) {
                voice.live = false;
                changed = true;
            }
        }
        // Giọng đích của một lần gộp tay vừa bị worker gộp đi: bỏ lần gộp đó (giọng hiện lại như chính nó), không trỏ tới giọng ma.
        let voices = &self.voices;
        let before = self.merged.len();
        self.merged.retain(|_, into| voices.get(into).is_some_and(|v| v.live));
        changed | (self.merged.len() != before)
    }

    /// Đổi tên giọng `id` (giọng đã gộp thì đổi tên giọng đích). `name` là kết quả của [`clean_name`], làm sạch trước khi giữ khóa
    /// của bản chép lời (rà soát mã 03, mục 5); `None` là trở về tên tự động.
    pub fn rename(&mut self, id: u32, name: Option<String>) -> Result<(), SpeakerError> {
        let root = self.live_root(id)?;
        self.voices.get_mut(&root).ok_or(SpeakerError::NotFound)?.user_name = name;
        Ok(())
    }

    /// Gộp tay giọng `from` vào `into`: từ giờ `from` (và mọi giọng đã gộp vào `from`) hiện như `into`.
    pub fn merge(&mut self, from: u32, into: u32) -> Result<(), SpeakerError> {
        let (from, into) = (self.live_root(from)?, self.live_root(into)?);
        if from == into {
            return Err(SpeakerError::Same);
        }
        for target in self.merged.values_mut() {
            if *target == from {
                *target = into;
            }
        }
        self.merged.insert(from, into);
        Ok(())
    }

    /// Người dùng tắt giữa phiên: bỏ hết, kể cả tên đã đổi; bảng giọng tới sau bị bỏ qua tới phiên sau.
    pub fn turn_off(&mut self) {
        *self = SpeakerBook {
            off: true,
            ..SpeakerBook::default()
        };
    }

    /// "Xóa toàn bộ dữ liệu": bỏ tên người dùng gõ và các lần gộp; số thứ tự, màu giữ nguyên.
    pub fn forget_names(&mut self) {
        for voice in self.voices.values_mut() {
            voice.user_name = None;
        }
        self.merged.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.voices.is_empty()
    }

    /// Bảng như giao diện vẽ, nhãn tự động theo `s` (ngôn ngữ giao diện).
    pub fn view(&self, s: &Strings) -> RosterView {
        RosterView {
            voices: self
                .voices
                .iter()
                .filter(|(_, v)| v.live)
                .filter_map(|(&id, _)| self.voice_view(id, s))
                .collect(),
            participants: self.participants.clone(),
            ask_access: self.ask_access,
            rev: 0,
        }
    }

    fn voice_view(&self, id: u32, s: &Strings) -> Option<VoiceView> {
        let root = self.root(id);
        let v = self.voices.get(&root)?;
        let (label, source) = match (&v.user_name, &v.auto_name) {
            (Some(name), _) => (name.clone(), NameSource::User),
            (None, Some(name)) => (name.clone(), NameSource::Name),
            (None, None) => (s.speaker_voice.replace("{n}", &v.order.to_string()), NameSource::Voice),
        };
        Some(VoiceView {
            id,
            label,
            color: (v.order.max(1) - 1) % PALETTE_SIZE,
            source,
            room: v.room,
            merged_into: (root != id).then_some(root),
        })
    }

    /// Giọng `id` hiện như giọng nào (gộp tay một bước).
    fn root(&self, id: u32) -> u32 {
        self.merged.get(&id).copied().unwrap_or(id)
    }

    /// Như [`Self::root`], cho giọng đang có trong phiên; không có (hay đã tắt) thì `NotFound`.
    fn live_root(&self, id: u32) -> Result<u32, SpeakerError> {
        if self.off || !self.voices.get(&id).is_some_and(|v| v.live) {
            return Err(SpeakerError::NotFound);
        }
        Ok(self.root(id))
    }
}

/// Ký tự định dạng không có hình (Unicode Cf) bị bỏ khỏi tên (QĐ 11): điều khiển hướng chữ (U+061C, U+200E, U+200F,
/// U+202A–U+202E, U+2066–U+2069), ký tự rộng 0 và nối vô hình (U+180E, U+200B, U+2060–U+2064, U+FEFF), định dạng cũ đã bỏ
/// (U+206A–U+206F), neo chú thích (U+FFF9–U+FFFB), gạch nối mềm (U+00AD), ký tự tag (U+E0001, U+E0020–U+E007F: giấu được cả một
/// đoạn chữ; cờ vùng như cờ Anh còn lại 🏴), điều khiển định dạng của chữ tượng hình Ai Cập (U+13430–U+1343F), tốc ký Duployan
/// (U+1BCA0–U+1BCA3) và ký hiệu nhạc (U+1D173–U+1D17A). Cùng nhóm ký tự tag là các mã chưa gán U+E0000–U+E00FF, U+E01F0–U+E0FFF
/// (Unicode định sẵn là không bao giờ có hình, nên cũng giấu được chữ; rà soát mã 03, mục 3); bộ chọn biến thể ở giữa
/// (U+E0100–U+E01EF) xem [`is_variation_selector`]. Giữ U+200C (ZWNJ) và U+200D (ZWJ): chữ Ba Tư, chữ Ấn và emoji ghép cần
/// chúng. Các ký tự Cf còn lại có hình (dấu số Ả Rập U+0600–U+0605, U+06DD, U+070F, U+0890–U+0891, U+08E2; dấu số Kaithi U+110BD,
/// U+110CD) nên được giữ.
fn is_hidden_format(c: char) -> bool {
    matches!(
        c,
        '\u{00AD}'
            | '\u{061C}'
            | '\u{180E}'
            | '\u{200B}'
            | '\u{200E}'
            | '\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{206F}'
            | '\u{FEFF}'
            | '\u{FFF9}'..='\u{FFFB}'
            | '\u{13430}'..='\u{1343F}'
            | '\u{1BCA0}'..='\u{1BCA3}'
            | '\u{1D173}'..='\u{1D17A}'
            | '\u{E0000}'..='\u{E00FF}'
            | '\u{E01F0}'..='\u{E0FFF}'
    )
}

/// Bộ chọn biến thể (rà soát mã 03, mục 3): của chữ Mông Cổ (U+180B–U+180D, U+180F), VS1–VS16 (U+FE00–U+FE0F; emoji cần U+FE0F)
/// và VS17–VS256 (U+E0100–U+E01EF; biến thể chữ Hán của tên Nhật). Không có hình, và một dãy bộ chọn giấu được cả một đoạn chữ
/// (mỗi byte một ký tự) như ký tự tag, nên [`clean_name`] chỉ giữ một bộ chọn ngay sau một ký tự có hình.
fn is_variation_selector(c: char) -> bool {
    matches!(
        c,
        '\u{180B}'..='\u{180D}' | '\u{180F}' | '\u{FE00}'..='\u{FE0F}' | '\u{E0100}'..='\u{E01EF}'
    )
}

/// Ký tự không có hình mà [`clean_name`] vẫn giữ vì chỉ có nghĩa cạnh chữ khác: ZWNJ, ZWJ, CGJ (U+034F), bộ chọn biến thể, chữ
/// lấp chỗ trống của Hangul (U+115F, U+1160, U+3164, U+FFA0), nguyên âm ẩn của chữ Khmer (U+17B4, U+17B5), ô chữ nổi trống
/// (U+2800). Tên chỉ có các ký tự này và khoảng trắng trông như nhãn rỗng (rà soát mã 03, mục 4).
fn is_invisible(c: char) -> bool {
    is_variation_selector(c)
        || matches!(
            c,
            '\u{034F}'
                | '\u{115F}'
                | '\u{1160}'
                | '\u{17B4}'
                | '\u{17B5}'
                | '\u{200C}'
                | '\u{200D}'
                | '\u{2800}'
                | '\u{3164}'
                | '\u{FFA0}'
        )
}

/// Tên người dùng gõ hay chọn từ danh sách người tham dự (QĐ 11): bỏ ký tự định dạng vô hình, bỏ ký tự điều khiển, chỉ giữ một bộ
/// chọn biến thể ngay sau một ký tự có hình, gộp khoảng trắng, cắt hai đầu. Rỗng hay không có ký tự nào nhìn thấy được thì `None`
/// (trở về tên tự động); dài hơn 40 ký tự, hay trước khi làm sạch dài hơn [`MAX_NAME_BYTES`] byte, thì lỗi (ô nhập đã chặn ở 40).
/// Kế hoạch 04: tên tự động và tên người tham dự cũng phải qua hàm này.
pub fn clean_name(raw: &str) -> Result<Option<String>, SpeakerError> {
    if raw.len() > MAX_NAME_BYTES {
        return Err(SpeakerError::TooLong);
    }
    let mut visible = String::with_capacity(raw.len());
    // Ký tự vừa giữ nhận được một bộ chọn biến thể không: ký tự có hình, chưa có bộ chọn nào theo sau.
    let mut takes_selector = false;
    for c in raw.chars().filter(|&c| !is_hidden_format(c)) {
        if is_variation_selector(c) {
            if takes_selector {
                visible.push(c);
            }
            takes_selector = false;
        } else {
            visible.push(c);
            takes_selector = !(c.is_whitespace() || c.is_control() || is_invisible(c));
        }
    }
    let name = visible
        .split(|c: char| c.is_whitespace() || c.is_control())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(SpeakerError::TooLong);
    }
    let blank = name.chars().all(|c| c == ' ' || is_invisible(c));
    Ok((!blank).then_some(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::{EN, VI};
    use pipeline::subtitle::RosterVoice;

    fn roster(ids: &[u32]) -> Roster {
        Roster {
            voices: ids.iter().map(|&id| RosterVoice { id, room: false }).collect(),
        }
    }

    fn labels(book: &SpeakerBook) -> Vec<(u32, String, u32)> {
        book.view(&VI)
            .voices
            .into_iter()
            .map(|v| (v.id, v.label, v.color))
            .collect()
    }

    /// Tên đã làm sạch, như `TranscriptStore::rename_speaker` đưa cho [`SpeakerBook::rename`].
    fn named(raw: &str) -> Option<String> {
        clean_name(raw).unwrap()
    }

    /// Spec §5.3, §8.1: "Người N" và màu theo thứ tự xuất hiện; giọng thứ 9 quay lại màu đầu; nhãn theo ngôn ngữ giao diện.
    #[test]
    fn voices_are_numbered_and_colored_in_order_of_appearance() {
        let mut book = SpeakerBook::default();
        assert!(book.apply(&roster(&[1, 2])));
        assert_eq!(labels(&book), [(1, "Người 1".into(), 0), (2, "Người 2".into(), 1)]);
        assert!(book.apply(&roster(&(1..=9).collect::<Vec<_>>())));
        assert_eq!(labels(&book)[8], (9, "Người 9".into(), 0), "8 màu rồi quay lại");
        assert_eq!(book.view(&EN).voices[2].label, "Speaker 3");
    }

    /// QĐ 2: worker chạy lại (mã giọng cộng mã lớn nhất đã thấy) hay một mã không bao giờ tới giao diện: số vẫn liền nhau.
    #[test]
    fn the_number_follows_appearance_not_the_voice_id() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[4]));
        book.apply(&roster(&[4, 7]));
        assert_eq!(labels(&book), [(4, "Người 1".into(), 0), (7, "Người 2".into(), 1)]);
    }

    #[test]
    fn the_same_roster_twice_changes_nothing() {
        let mut book = SpeakerBook::default();
        assert!(book.apply(&roster(&[1])));
        assert!(!book.apply(&roster(&[1])), "giao diện không phải vẽ lại");
        assert!(
            book.apply(&Roster {
                voices: vec![RosterVoice { id: 1, room: true }],
            }),
            "giọng trong phòng đổi"
        );
        assert!(book.view(&VI).voices[0].room);
    }

    /// Worker gộp giọng 2 vào 1 (`Merged`): engine đã gắn lại nhãn các câu; giọng 2 rời bảng, số thứ tự không dùng lại.
    #[test]
    fn a_voice_merged_away_by_the_worker_leaves_and_its_number_is_not_reused() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        assert!(book.apply(&roster(&[1])));
        assert_eq!(labels(&book), [(1, "Người 1".into(), 0)]);
        book.apply(&roster(&[1, 3]));
        assert_eq!(labels(&book)[1], (3, "Người 3".into(), 2));
    }

    /// Spec §8.2: đổi tên áp cho mọi câu của giọng; tên người dùng thắng tên tự động; để trống là trở về tên tự động.
    #[test]
    fn renaming_wins_over_the_automatic_label_and_empty_restores_it() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        book.rename(2, named("  Hoa\tPhạm ")).unwrap();
        let v = &book.view(&VI).voices[1];
        assert_eq!((v.label.as_str(), v.source, v.color), ("Hoa Phạm", NameSource::User, 1));
        book.rename(2, named("")).unwrap();
        let v = &book.view(&VI).voices[1];
        assert_eq!((v.label.as_str(), v.source), ("Người 2", NameSource::Voice));
    }

    /// QĐ 11: bỏ ký tự điều khiển (tên đi vào TXT, SRT, Markdown), gộp khoảng trắng, tối đa 40 ký tự (không đếm byte).
    #[test]
    fn names_are_cleaned_and_limited_to_40_characters() {
        assert_eq!(clean_name(" Lan \n Nguyễn\u{0007} "), Ok(Some("Lan Nguyễn".into())));
        assert_eq!(clean_name(" \t\n"), Ok(None));
        let forty = "ễ".repeat(40);
        assert_eq!(clean_name(&forty), Ok(Some(forty.clone())));
        assert_eq!(clean_name(&format!("{forty}a")), Err(SpeakerError::TooLong));
    }

    /// QĐ 11: ký tự định dạng không có hình (đảo hướng chữ, rộng 0, gạch nối mềm, tag…) bị bỏ, kể cả trong tên người tham dự do người
    /// khác đặt; ZWNJ, ZWJ và ký tự Cf có hình được giữ.
    #[test]
    fn hidden_format_characters_are_dropped_but_joiners_are_kept() {
        assert_eq!(
            clean_name("\u{202E}Lan\u{2066}Ng\u{200B}uyễn\u{2069}\u{200F}\u{FEFF}\u{00AD}"),
            Ok(Some("LanNguyễn".into()))
        );
        assert_eq!(
            clean_name("\u{202A}\u{202C}"),
            Ok(None),
            "chỉ có ký tự vô hình: như tên rỗng"
        );
        assert_eq!(
            clean_name("\u{180E}A\u{206A}\u{206F}n\u{FFF9}\u{FFFB}\u{E0001}\u{13430}\u{1BCA0}\u{1D173}"),
            Ok(Some("An".into())),
            "phần còn lại của nhóm Cf không có hình (rà soát lần 2, A-N4)"
        );
        // Ký tự tag U+E0020–U+E007F chép được cả một đoạn chữ ASCII mà không nhìn thấy.
        let tagged: String = "Lan"
            .chars()
            .chain(
                "hidden"
                    .chars()
                    .map(|c| char::from_u32(0xE0000 + u32::from(c)).unwrap()),
            )
            .collect();
        assert_eq!(clean_name(&tagged), Ok(Some("Lan".into())), "chữ giấu bằng tag");
        let ayah = "\u{06DD}\u{0661}";
        assert_eq!(
            clean_name(ayah),
            Ok(Some(ayah.into())),
            "Cf có hình (dấu hết câu kinh, chữ số Ả Rập) được giữ"
        );
        let coder = "👩\u{200D}💻 An";
        assert_eq!(clean_name(coder), Ok(Some(coder.into())), "ZWJ của emoji ghép");
        let persian = "می\u{200C}خواهم";
        assert_eq!(clean_name(persian), Ok(Some(persian.into())), "ZWNJ của chữ Ba Tư");
    }

    /// Rà soát mã 03, mục 3: một dãy bộ chọn biến thể giấu được cả một đoạn chữ (mỗi byte một ký tự) như ký tự tag. Chỉ giữ một bộ
    /// chọn ngay sau một ký tự có hình (biến thể chữ Hán của tên Nhật, emoji cần U+FE0F); bỏ bộ chọn đứng đầu, đứng sau khoảng trắng
    /// hay sau một bộ chọn khác. Mã chưa gán của khối ký tự tag (U+E0080–U+E00FF, U+E01F0–U+E0FFF) cũng không bao giờ có hình.
    #[test]
    fn only_one_variation_selector_after_a_visible_character_is_kept() {
        let hidden = |base: &str, from: u32, n: u32| -> String {
            base.chars()
                .chain((0..n).map(|i| char::from_u32(from + i).unwrap()))
                .collect()
        };
        assert_eq!(
            clean_name(&hidden("Lan", 0xE0100, 36)),
            Ok(Some("Lan\u{E0100}".into())),
            "36 byte giấu bằng VS17–VS256"
        );
        assert_eq!(
            clean_name(&format!("Lan{}", "\u{FE0F}".repeat(30))),
            Ok(Some("Lan\u{FE0F}".into()))
        );
        assert_eq!(
            clean_name("\u{FE0F}\u{E0100}An \u{FE0F}Ba"),
            Ok(Some("An Ba".into())),
            "bộ chọn đứng đầu hay sau khoảng trắng"
        );
        assert_eq!(
            clean_name("An\u{200D}\u{FE0F}\u{200D}\u{FE0F}"),
            Ok(Some("An\u{200D}\u{200D}".into())),
            "bộ chọn sau ký tự không có hình"
        );
        assert_eq!(
            clean_name("\u{1820}\u{180B}\u{180C}\u{180F}"),
            Ok(Some("\u{1820}\u{180B}".into())),
            "bộ chọn biến thể của chữ Mông Cổ"
        );
        for name in [
            "葛\u{E0100}城",
            "❤\u{FE0F} An",
            "🏳\u{FE0F}\u{200D}🌈",
            "#\u{FE0F}\u{20E3}",
            "🧑\u{200D}⚕\u{FE0F}",
        ] {
            assert_eq!(clean_name(name), Ok(Some(name.into())), "{name:?}");
        }
        assert_eq!(clean_name(&hidden("Lan", 0xE0080, 30)), Ok(Some("Lan".into())));
        assert_eq!(clean_name("Lan\u{E0000}\u{E01F0}\u{E0FFF}"), Ok(Some("Lan".into())));
    }

    /// Rà soát mã 03, mục 4: tên không có ký tự nào nhìn thấy được (chữ lấp chỗ trống của Hangul, ô chữ nổi trống, CGJ, ZWJ…) trông
    /// như nhãn rỗng: coi như tên rỗng, trở về tên tự động. Có chữ nhìn thấy được thì giữ nguyên.
    #[test]
    fn a_name_with_nothing_visible_is_empty() {
        for blank in [
            "\u{3164}",
            "\u{115F}",
            "\u{1160}\u{FFA0}",
            "\u{2800}\u{2800}",
            "\u{034F}",
            "\u{3164} \u{2800}",
            "\u{200D}\u{200C}",
            "\u{17B4}\u{17B5}",
            "\u{2800}\u{FE0F}",
        ] {
            assert_eq!(clean_name(blank), Ok(None), "{blank:?}");
        }
        for name in ["A\u{034F}\u{034F}B", "\u{3164}Lan", "한\u{3164}"] {
            assert_eq!(clean_name(name), Ok(Some(name.into())), "{name:?}");
        }
    }

    /// Rà soát mã 03, mục 5: tên qua IPC không giới hạn độ dài; quá trần số byte thì từ chối ngay, không duyệt từng ký tự, kể cả
    /// khi phần lớn là khoảng trắng sẽ bị bỏ.
    #[test]
    fn a_name_too_many_bytes_long_is_refused_before_cleaning() {
        let padded = format!("{}Lan", " ".repeat(1_000_000));
        assert_eq!(clean_name(&padded), Err(SpeakerError::TooLong));
        let at_limit = format!("{}Lan", " ".repeat(MAX_NAME_BYTES - 3));
        assert_eq!(clean_name(&at_limit), Ok(Some("Lan".into())), "đúng trần: vẫn làm sạch");
        assert_eq!(clean_name(&format!(" {at_limit}")), Err(SpeakerError::TooLong));
        let widest = "😀".repeat(MAX_NAME_CHARS);
        assert!(widest.len() <= MAX_NAME_BYTES / 4, "tên hợp lệ dài nhất còn dư chỗ");
        assert_eq!(clean_name(&format!("\u{202A}{widest}\u{202C}")), Ok(Some(widest)));
    }

    /// Spec §5.4, §8.2: gộp tay chỉ đổi cách hiện: giọng 2 hiện như giọng 1 (nhãn, màu); đổi tên giọng 2 là đổi tên giọng 1; gộp
    /// tiếp giọng 1 vào giọng 3 thì giọng 2 cũng theo.
    #[test]
    fn merging_shows_one_voice_as_another() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2, 3]));
        book.merge(2, 1).unwrap();
        let v = book.view(&VI).voices;
        assert_eq!(
            (v[1].label.as_str(), v[1].color, v[1].merged_into),
            ("Người 1", 0, Some(1))
        );
        book.rename(2, named("Lan")).unwrap();
        assert_eq!(
            book.view(&VI).voices[0].label,
            "Lan",
            "đổi tên giọng đã gộp là đổi tên giọng đích"
        );
        book.merge(1, 3).unwrap();
        let v = book.view(&VI).voices;
        assert_eq!(
            v.iter().map(|x| x.merged_into).collect::<Vec<_>>(),
            [Some(3), Some(3), None]
        );
        assert!(v.iter().all(|x| x.label == "Người 3" && x.color == 2), "{v:?}");
    }

    /// Gộp tay 2 vào 1, rồi worker gộp giọng 1 đi (`Merged`, giọng 1 rời bảng): bỏ lần gộp tay đó, giọng 2 hiện lại như chính nó,
    /// không trỏ tới một giọng không còn trong bảng.
    #[test]
    fn a_manual_merge_into_a_voice_the_worker_removed_is_dropped() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2, 3]));
        book.merge(2, 1).unwrap();
        assert!(book.apply(&roster(&[2, 3])));
        let v = book.view(&VI).voices;
        assert_eq!(
            v.iter()
                .map(|x| (x.id, x.label.as_str(), x.merged_into))
                .collect::<Vec<_>>(),
            [(2, "Người 2", None), (3, "Người 3", None)]
        );
    }

    #[test]
    fn unknown_or_same_voices_are_refused() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        assert_eq!(book.rename(9, named("x")), Err(SpeakerError::NotFound));
        assert_eq!(book.merge(1, 9), Err(SpeakerError::NotFound));
        assert_eq!(book.merge(1, 1), Err(SpeakerError::Same));
        book.merge(2, 1).unwrap();
        assert_eq!(book.merge(2, 1), Err(SpeakerError::Same), "đã gộp rồi");
        // Tên quá dài bị `clean_name` từ chối trước khi tới bảng (test `renaming_cleans_the_name_before_taking_the_lock` của store).
    }

    /// QĐ 8: tắt giữa phiên thì bỏ hết, kể cả tên đã đổi; bảng giọng tới muộn bị bỏ qua.
    #[test]
    fn turning_off_drops_everything_and_ignores_later_rosters() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1]));
        book.rename(1, named("Lan")).unwrap();
        book.turn_off();
        assert_eq!(book.view(&VI), RosterView::default());
        assert!(book.is_empty());
        assert!(!book.apply(&roster(&[1, 2])));
        assert_eq!(book.rename(1, named("Lan")), Err(SpeakerError::NotFound));
    }

    /// QĐ 18: "Xóa toàn bộ dữ liệu" giữa phiên bỏ tên người dùng gõ và các lần gộp; số thứ tự, màu giữ nguyên.
    #[test]
    fn forgetting_names_keeps_numbers_and_colors() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        book.rename(1, named("Lan")).unwrap();
        book.merge(2, 1).unwrap();
        book.forget_names();
        assert_eq!(labels(&book), [(1, "Người 1".into(), 0), (2, "Người 2".into(), 1)]);
    }

    /// Spec §9 (cộng `mergedInto`, `askAccess`, `rev` của QĐ 4): tên trường của `speaker://roster`. `rev` do `TranscriptStore` đặt
    /// (QĐ 25); bảng của `SpeakerBook` có `rev` 0.
    #[test]
    fn the_roster_event_has_the_fields_of_the_spec() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1]));
        assert_eq!(
            serde_json::to_value(book.view(&VI)).unwrap(),
            serde_json::json!({
                "voices": [{ "id": 1, "label": "Người 1", "color": 0, "source": "voice", "room": false, "mergedInto": null }],
                "participants": [],
                "askAccess": false,
                "rev": 0
            })
        );
    }

    /// QĐ 12: Lịch sử đọc lại nhãn đã lưu thành một giọng cố định, màu theo thứ tự.
    #[test]
    fn a_saved_label_becomes_a_fixed_voice() {
        let v = VoiceView::saved(10, "Lan".into());
        assert_eq!(
            (v.id, v.label.as_str(), v.color, v.source, v.room, v.merged_into),
            (10, "Lan", 1, NameSource::User, false, None)
        );
    }
}
