//! Bản chép lời của phiên, trong bộ nhớ (spec §6.6 "Lưu trữ", F4): mọi phụ đề của phiên đang chạy hoặc phiên vừa dừng,
//! theo đúng luật của thanh phụ đề (`upsert` thay cả đối tượng, `delta` nối chữ dịch, `replaces` xóa phụ đề đã gộp), nhưng
//! không giới hạn số dòng. Cửa sổ chính đọc bản này khi mở màn hình Bản chép lời; khi phiên dừng, app lưu nó vào lịch sử
//! nếu bật "Lưu lịch sử" và đang là Pro (`history.rs`). Phiên mới bắt đầu thì bản cũ bị thay.
//!
//! Bảng người nói của phiên (spec 2026-10-26-phan-biet-nguoi-noi §9, `speakers.rs`) cũng ở đây: giọng từng câu (`Subtitle::speaker`,
//! nhãn tới muộn sửa tại chỗ), nhãn, màu, tên đổi tay, gộp tay. Bản chép lời, Lịch sử và file xuất đọc nhãn từ đây.

use std::collections::{BTreeMap, VecDeque};
use std::sync::Mutex;

use pipeline::subtitle::{Delta, Names, Roster, SpeakerLabel, Subtitle};
use serde::Serialize;
use speaker_protocol::ReaderStatus;

use super::speakers::{NameSource, RosterView, SpeakerBook, SpeakerError, VoiceView, clean_name};
use crate::i18n::{self, Strings};
use crate::settings::UiLanguage;

/// Bản chép lời của một phiên.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    /// Số của phiên trong lần chạy này của app (`session::Session`); 0 là chưa có phiên nào.
    pub session: u64,
    /// Giờ Unix (ms) lúc bắt đầu phiên. `start_ms`, `end_ms` của từng dòng tính từ mốc này.
    pub started_at: u64,
    /// Giờ Unix (ms) lúc phiên dừng; `None` khi phiên còn chạy.
    pub ended_at: Option<u64>,
    /// Mã ngôn ngữ đích của phiên (`vi`, `en`…).
    pub target_lang: String,
    /// Theo thứ tự `id`, tức thứ tự câu.
    pub lines: Vec<Subtitle>,
    /// Người nói của phiên (spec 2026-10-26-phan-biet-nguoi-noi §9): `lines[i].speaker` là `id` trong danh sách này. Rỗng khi phiên
    /// không có nhận giọng. Lịch sử: dựng lại từ nhãn đã lưu (`VoiceView::saved`).
    pub speakers: Vec<VoiceView>,
    /// `rev` của bảng người nói mới nhất đã dựng lúc chụp (QĐ 25): giao diện không để bản chụp tới muộn đè bảng mới hơn. Lịch sử: 0.
    pub speakers_rev: u64,
}

impl Transcript {
    /// Nhãn người nói của một câu (đã tính đổi tên, gộp); `None` khi chưa xác định hay giọng không có trong bảng.
    pub fn speaker_label(&self, line: &Subtitle) -> Option<&str> {
        let id = line.speaker?;
        self.speakers.iter().find(|v| v.id == id).map(|v| v.label.as_str())
    }
}

#[derive(Default)]
struct Current {
    meta: Transcript,
    lines: BTreeMap<u64, Subtitle>,
    speakers: SpeakerBook,
    /// Ngôn ngữ giao diện cho nhãn "Người N"; `None` là English. Giữ qua các phiên.
    ui: Option<UiLanguage>,
    /// Số thứ tự của bảng người nói (QĐ 25): tăng ở mỗi lần dựng bảng và mỗi lần bảng đổi mà không dựng (phiên mới, xóa dữ liệu,
    /// đổi ngôn ngữ), giữ qua các phiên.
    rev: u64,
}

impl Current {
    fn strings(&self) -> &'static Strings {
        i18n::strings(self.ui.unwrap_or(UiLanguage::En))
    }

    /// Bảng người nói để phát hay trả về: số thứ tự mới, lớn hơn mọi bảng trước.
    fn roster_view(&mut self) -> RosterView {
        self.rev += 1;
        RosterView {
            rev: self.rev,
            ..self.speakers.view(self.strings())
        }
    }

    /// Đổi tên, gộp chỉ trong phiên đang chạy (QĐ 10 của kế hoạch 03): phiên đã dừng đã lưu Lịch sử, Lịch sử chỉ đọc.
    fn running(&self) -> Result<(), SpeakerError> {
        if self.meta.session == 0 || self.meta.ended_at.is_some() {
            return Err(SpeakerError::NotFound);
        }
        Ok(())
    }
}

/// Bản chép lời của phiên hiện tại (hoặc vừa dừng). Quản lý bằng `app.manage`; luồng phụ đề của engine ghi vào, lệnh
/// của giao diện đọc ra.
#[derive(Default)]
pub struct TranscriptStore(Mutex<Current>, Mutex<SeenNames>);

/// Số tên đã thấy giữ lại nhiều nhất để che trong báo cáo lỗi; đầy thì bỏ tên cũ nhất.
pub const MAX_SEEN_NAMES: usize = 256;

/// Tên người tham dự và tên người dùng đặt đã thấy trong lần chạy này của app, tới hết lần chạy (chỉ RAM, không ghi đĩa, không vào log):
/// bảng người nói của phiên mới hay sau khi tắt "Lấy tên" không còn các tên đó, nhưng bộ che tên của báo cáo lỗi vẫn phải che chúng
/// trong một dòng log cũ (rà soát đợt A, A4).
#[derive(Default)]
struct SeenNames(VecDeque<String>);

impl SeenNames {
    fn add(&mut self, name: String) {
        if self.0.contains(&name) {
            return;
        }
        if self.0.len() >= MAX_SEEN_NAMES {
            self.0.pop_front();
        }
        self.0.push_back(name);
    }
}

impl TranscriptStore {
    fn lock(&self) -> std::sync::MutexGuard<'_, Current> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn remember(&self, names: impl IntoIterator<Item = String>) {
        let mut seen = self.1.lock().unwrap_or_else(|e| e.into_inner());
        for n in names {
            seen.add(n);
        }
    }

    /// Tên để che trong báo cáo lỗi: người tham dự và nhãn có tên (đọc từ app họp hay do người dùng đặt; không có "Người N") của bảng
    /// hiện có, cộng mọi tên đã thấy trong lần chạy này của app (tối đa [`MAX_SEEN_NAMES`]).
    pub fn redaction_names(&self) -> Vec<String> {
        let view = self.roster_view();
        let mut out: Vec<String> = view
            .participants
            .into_iter()
            .chain(
                view.voices
                    .into_iter()
                    .filter(|v| v.source != NameSource::Voice)
                    .map(|v| v.label),
            )
            .collect();
        out.extend(self.1.lock().unwrap_or_else(|e| e.into_inner()).0.iter().cloned());
        out
    }

    /// Phiên `session` bắt đầu: bỏ bản của phiên trước, cả bảng người nói; giữ ngôn ngữ giao diện; số thứ tự bảng tăng (bảng rỗng
    /// của phiên mới mới hơn mọi bảng của phiên trước, kể cả bảng còn đang trên đường tới giao diện; rà soát lần 2, A-N3).
    pub fn begin(&self, session: u64, started_at: u64, target_lang: &str) {
        let mut current = self.lock();
        let (ui, rev) = (current.ui, current.rev + 1);
        *current = Current {
            meta: Transcript {
                session,
                started_at,
                ended_at: None,
                target_lang: target_lang.to_string(),
                lines: Vec::new(),
                speakers: Vec::new(),
                speakers_rev: 0,
            },
            lines: BTreeMap::new(),
            speakers: SpeakerBook::default(),
            ui,
            rev,
        };
    }

    /// Một `subtitle://upsert` của phiên `session`. Sự kiện của phiên khác (tới muộn) bị bỏ.
    pub fn upsert(&self, session: u64, subtitle: &Subtitle) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        for id in &subtitle.replaces {
            current.lines.remove(id);
        }
        current.lines.insert(subtitle.id, subtitle.clone());
    }

    /// Một `subtitle://delta` của phiên `session`: nối vào chữ dịch của phụ đề cùng `id`.
    pub fn delta(&self, session: u64, delta: &Delta) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        if let Some(line) = current.lines.get_mut(&delta.id) {
            line.tgt_text.push_str(&delta.text);
        }
    }

    /// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker` của phiên `session`): sửa đúng câu đó.
    pub fn set_speaker(&self, session: u64, label: &SpeakerLabel) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        if let Some(line) = current.lines.get_mut(&label.id) {
            line.speaker = label.speaker;
        }
    }

    /// Bảng giọng mới của worker cho phiên `session` (`EventSink::roster`). Trả bảng người nói mới để phát, dựng trong cùng lần khóa
    /// (QĐ 25); `None` khi không có gì đổi hay đó không phải phiên hiện tại.
    pub fn roster(&self, session: u64, roster: &Roster) -> Option<RosterView> {
        let mut current = self.lock();
        (current.meta.session == session && current.speakers.apply(roster)).then(|| current.roster_view())
    }

    /// Tên đọc từ app họp và người tham dự của phiên `session` (`EventSink::names`). Trả bảng mới để phát khi đổi, dựng trong cùng
    /// lần khóa (QĐ 25 của 03). Làm sạch tên trong lúc khóa: khung của worker đã giới hạn ≤ 64 tên × 160 byte.
    pub fn names(&self, session: u64, names: &Names) -> Option<RosterView> {
        self.remember(
            names
                .participants
                .iter()
                .chain(names.voices.iter().map(|v| &v.name))
                .filter_map(|n| clean_name(n).ok().flatten()),
        );
        let mut current = self.lock();
        (current.meta.session == session && current.speakers.set_names(names)).then(|| current.roster_view())
    }

    /// Trạng thái bộ đọc tên của phiên `session` (dòng mời cấp quyền, spec §6.7). Trả bảng mới khi đổi.
    pub fn reader(&self, session: u64, state: ReaderStatus) -> Option<RosterView> {
        let mut current = self.lock();
        (current.meta.session == session && current.speakers.set_reader(state)).then(|| current.roster_view())
    }

    /// Người dùng tắt "Lấy tên" (QĐ 31): xóa tên tự động, người tham dự, dòng mời của phiên hiện tại. Trả bảng mới khi đổi.
    pub fn clear_names(&self) -> Option<RosterView> {
        let mut current = self.lock();
        current.speakers.clear_names().then(|| current.roster_view())
    }

    /// Người dùng bật lại "Lấy tên": bảng người nói nhận tên tự động trở lại.
    pub fn allow_names(&self) {
        self.lock().speakers.allow_names();
    }

    /// Bảng người nói hiện có, như giao diện vẽ (`speaker://roster`).
    pub fn roster_view(&self) -> RosterView {
        self.lock().roster_view()
    }

    /// Phiên hiện tại có giọng nào chưa.
    pub fn has_speakers(&self) -> bool {
        !self.lock().speakers.is_empty()
    }

    /// Ngôn ngữ giao diện cho nhãn "Người N": đặt một lần lúc khởi động app (`lib.rs`), rồi mỗi khi người dùng đổi ngôn ngữ
    /// (`speaker::language_changed`); `begin` giữ nó qua các phiên. Nhãn tự động đổi nên số thứ tự bảng tăng.
    pub fn set_ui_language(&self, lang: UiLanguage) {
        let mut current = self.lock();
        current.ui = Some(lang);
        current.rev += 1;
    }

    /// Đổi tên giọng `id` (spec §8.2). Trả bảng người nói mới để phát.
    pub fn rename_speaker(&self, id: u32, name: &str) -> Result<RosterView, SpeakerError> {
        // Làm sạch (và từ chối tên quá dài) trước khi khóa: khóa này cũng là khóa của luồng phụ đề (`upsert`, `delta`), còn tên tới
        // qua IPC không giới hạn độ dài (rà soát mã 03, mục 5).
        let name = clean_name(name)?;
        self.remember(name.clone());
        let mut current = self.lock();
        current.running()?;
        current.speakers.rename(id, name)?;
        Ok(current.roster_view())
    }

    /// Gộp tay giọng `from` vào `into` (spec §5.4, §8.2). Trả bảng người nói mới để phát.
    pub fn merge_speakers(&self, from: u32, into: u32) -> Result<RosterView, SpeakerError> {
        let mut current = self.lock();
        current.running()?;
        current.speakers.merge(from, into)?;
        Ok(current.roster_view())
    }

    /// Người dùng tắt "Phân biệt người nói" (QĐ 8 của kế hoạch 03): bỏ bảng người nói; câu đã có không còn nhãn ở bản chép lời,
    /// Lịch sử, file xuất. Trả bảng rỗng để phát khi phiên đã có giọng (giao diện cần xóa nhãn); chưa có giọng thì `None`, không
    /// phát gì: bản phát hành (không có nhận giọng) không phát sự kiện mới nào (QĐ 9; rà soát mã 03, mục 2).
    pub fn speakers_off(&self) -> Option<RosterView> {
        let mut current = self.lock();
        let had_voices = !current.speakers.is_empty();
        current.speakers.turn_off();
        let view = current.roster_view();
        had_voices.then_some(view)
    }

    /// Phiên `session` dừng lúc `ended_at`. Trả bản chép lời để lưu lịch sử; `None` nếu đó không phải phiên hiện tại hay
    /// đã dừng rồi.
    pub fn end(&self, session: u64, ended_at: u64) -> Option<Transcript> {
        let mut current = self.lock();
        if session == 0 || current.meta.session != session || current.meta.ended_at.is_some() {
            return None;
        }
        current.meta.ended_at = Some(ended_at);
        Some(snapshot(&current))
    }

    /// Bản chép lời hiện có, cho giao diện và để xuất file.
    pub fn snapshot(&self) -> Transcript {
        snapshot(&self.lock())
    }

    /// Xóa toàn bộ dữ liệu (§4.3, Quyền riêng tư): bỏ cả bản chép lời trong bộ nhớ và tên người dùng đã đặt cho người nói (QĐ 18).
    /// Phiên đang chạy vẫn ghi tiếp các câu sau.
    pub fn clear(&self) {
        let mut current = self.lock();
        current.lines.clear();
        current.speakers.forget_names();
        current.rev += 1;
    }
}

fn snapshot(current: &Current) -> Transcript {
    Transcript {
        lines: current.lines.values().cloned().collect(),
        speakers: current.speakers.view(current.strings()).voices,
        speakers_rev: current.rev,
        ..current.meta.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pipeline::subtitle::Status;

    fn sub(id: u64, tgt: &str, status: Status) -> Subtitle {
        Subtitle {
            id,
            start_ms: id * 1_000,
            end_ms: id * 1_000 + 800,
            src_lang: "en".into(),
            src_text: format!("source {id}"),
            tgt_text: tgt.into(),
            status,
            provisional: false,
            replaces: Vec::new(),
            speaker: None,
        }
    }

    /// Rà soát đợt A (A4): bộ che tên của báo cáo lỗi vẫn biết tên đã thấy trong lần chạy này sau khi sang phiên mới hay tắt "Lấy tên"
    /// (bảng người nói hiện tại không còn), có giới hạn kích thước.
    #[test]
    fn names_seen_in_this_run_stay_known_for_redaction() {
        use pipeline::subtitle::NamedVoice;
        let names = |n: &str| Names {
            voices: vec![NamedVoice {
                id: 1,
                name: n.into(),
                room_index: None,
            }],
            participants: vec![n.into(), "Minh Trần".into()],
        };
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        assert!(store.names(1, &names("Lan Nguyễn")).is_some());
        store.begin(2, 0, "vi");
        assert!(store.roster_view().participants.is_empty(), "bảng phiên mới rỗng");
        let known = store.redaction_names();
        assert!(
            known.contains(&"Lan Nguyễn".to_string()) && known.contains(&"Minh Trần".to_string()),
            "{known:?}"
        );
        store.clear_names();
        assert!(store.names(2, &names("Hoa Phạm")).is_none(), "đang tắt: bảng bỏ tên");
        assert!(
            store.redaction_names().contains(&"Hoa Phạm".to_string()),
            "nhưng tên vẫn bị che"
        );
        for i in 0..1_000 {
            store.names(2, &names(&format!("Người khách {i}")));
        }
        let known = store.redaction_names();
        assert!(known.len() <= MAX_SEEN_NAMES + 128, "{}", known.len());
        assert!(known.contains(&"Người khách 999".to_string()), "giữ tên mới nhất");
    }

    #[test]
    fn keeps_every_line_of_the_session_in_order() {
        let store = TranscriptStore::default();
        store.begin(1, 5_000, "vi");
        store.upsert(1, &sub(3, "", Status::Translating));
        store.delta(
            1,
            &Delta {
                id: 3,
                text: "Ba".into(),
            },
        );
        store.upsert(1, &sub(1, "Một", Status::Done));
        store.upsert(1, &sub(2, "", Status::SameLang));
        let t = store.snapshot();
        assert_eq!((t.session, t.started_at, t.target_lang.as_str()), (1, 5_000, "vi"));
        let ids: Vec<u64> = t.lines.iter().map(|l| l.id).collect();
        assert_eq!(ids, [1, 2, 3]);
        assert_eq!(t.lines[2].tgt_text, "Ba", "chữ dịch tới dần được nối");
        for id in 4..2_000 {
            store.upsert(1, &sub(id, "x", Status::Done));
        }
        assert_eq!(
            store.snapshot().lines.len(),
            1_999,
            "không giới hạn số dòng như thanh phụ đề"
        );
    }

    #[test]
    fn merged_subtitles_replace_the_ones_they_absorb() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        for id in 1..=3 {
            store.upsert(1, &sub(id, "", Status::AsrDone));
        }
        let merged = Subtitle {
            replaces: vec![2, 3],
            ..sub(2, "Hai ba", Status::Done)
        };
        store.upsert(1, &merged);
        let t = store.snapshot();
        assert_eq!(t.lines.iter().map(|l| l.id).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(t.lines[1].tgt_text, "Hai ba");
    }

    #[test]
    fn events_of_another_session_are_ignored_and_a_new_session_starts_empty() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.upsert(1, &sub(1, "Một", Status::Done));
        store.begin(2, 9_000, "en");
        store.upsert(1, &sub(2, "muộn", Status::Done));
        store.delta(
            1,
            &Delta {
                id: 2,
                text: "x".into(),
            },
        );
        let t = store.snapshot();
        assert_eq!((t.session, t.target_lang.as_str(), t.lines.len()), (2, "en", 0));
    }

    #[test]
    fn end_returns_the_transcript_once() {
        let store = TranscriptStore::default();
        assert_eq!(store.end(0, 1), None, "chưa có phiên");
        store.begin(1, 100, "vi");
        store.upsert(1, &sub(1, "Một", Status::Done));
        assert_eq!(store.end(2, 500), None, "không phải phiên hiện tại");
        let t = store.end(1, 500).unwrap();
        assert_eq!((t.ended_at, t.lines.len()), (Some(500), 1));
        assert_eq!(store.end(1, 600), None, "đã dừng rồi");
        assert_eq!(store.snapshot().ended_at, Some(500));
        store.clear();
        assert!(store.snapshot().lines.is_empty());
    }

    use crate::transcript::speakers::NameSource;

    fn voices(ids: &[u32]) -> Roster {
        Roster {
            voices: ids
                .iter()
                .map(|&id| pipeline::subtitle::RosterVoice { id, room: false })
                .collect(),
        }
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §9: bản chép lời giữ giọng từng câu và bảng người nói của phiên; nhãn tới muộn sửa đúng
    /// câu; sự kiện của phiên khác bị bỏ.
    /// Chốt nhãn muộn: nhãn của câu đã có nhãn đổi lần hai thì bản chép lời (và Lịch sử khi lưu) mang nhãn sau cùng.
    #[test]
    fn a_second_label_for_the_same_line_replaces_the_first_and_is_what_history_saves() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.upsert(1, &sub(1, "Một", Status::Done));
        for speaker in [Some(2), Some(3), None] {
            store.set_speaker(1, &SpeakerLabel { id: 1, speaker });
            assert_eq!(store.snapshot().lines[0].speaker, speaker);
        }
        // Lịch sử lưu từ `snapshot()` (`history::save`, nhãn đã đổi tên qua `speaker_label`), nên nhãn sau cùng là nhãn được lưu.
        store.set_speaker(
            1,
            &SpeakerLabel {
                id: 1,
                speaker: Some(4),
            },
        );
        assert_eq!(store.snapshot().lines[0].speaker, Some(4));
    }

    #[test]
    fn the_transcript_keeps_the_speakers_of_the_session() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.set_ui_language(UiLanguage::Vi);
        store.upsert(1, &sub(1, "Một", Status::Done));
        store.upsert(1, &sub(2, "Hai", Status::Done));
        assert!(store.roster(1, &voices(&[5])).is_some());
        store.set_speaker(
            1,
            &SpeakerLabel {
                id: 2,
                speaker: Some(5),
            },
        );
        store.set_speaker(
            2,
            &SpeakerLabel {
                id: 1,
                speaker: Some(5),
            },
        );
        assert!(store.roster(2, &voices(&[6])).is_none(), "bảng của phiên khác bị bỏ");
        assert!(
            store.roster(1, &voices(&[5])).is_none(),
            "bảng không đổi: không phát lại"
        );
        let t = store.snapshot();
        assert_eq!(t.lines.iter().map(|l| l.speaker).collect::<Vec<_>>(), [None, Some(5)]);
        assert_eq!(t.speakers.len(), 1);
        assert_eq!(t.speaker_label(&t.lines[1]), Some("Người 1"));
        assert_eq!(t.speaker_label(&t.lines[0]), None);
    }

    /// Spec §8.2, QĐ 10: đổi tên, gộp áp cho mọi câu của giọng trong phiên đang chạy; sau khi dừng thì chỉ đọc. Ngôn ngữ giao diện
    /// đổi thì nhãn tự động đổi theo.
    #[test]
    fn renaming_and_merging_work_only_while_the_session_runs() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.set_ui_language(UiLanguage::Vi);
        store.roster(1, &voices(&[1, 2]));
        let view = store.rename_speaker(1, "Lan").unwrap();
        assert_eq!(view.voices[0].label, "Lan");
        let view = store.merge_speakers(2, 1).unwrap();
        assert_eq!(
            (view.voices[1].label.as_str(), view.voices[1].merged_into),
            ("Lan", Some(1))
        );
        assert_eq!(store.roster_view().voices, view.voices);
        store.set_ui_language(UiLanguage::En);
        store.rename_speaker(1, "").unwrap();
        assert_eq!(store.roster_view().voices[0].label, "Speaker 1");
        store.end(1, 10).unwrap();
        assert_eq!(store.rename_speaker(1, "Lan"), Err(SpeakerError::NotFound));
        assert_eq!(store.merge_speakers(1, 2), Err(SpeakerError::NotFound));
        assert_eq!(
            TranscriptStore::default().rename_speaker(1, "Lan"),
            Err(SpeakerError::NotFound),
            "chưa có phiên"
        );
    }

    #[test]
    fn a_new_session_forgets_the_speakers_but_keeps_the_ui_language() {
        let store = TranscriptStore::default();
        store.set_ui_language(UiLanguage::Ja);
        store.begin(1, 0, "vi");
        store.roster(1, &voices(&[1]));
        assert!(store.has_speakers());
        store.begin(2, 0, "vi");
        assert!(!store.has_speakers());
        store.roster(2, &voices(&[3]));
        assert_eq!(store.snapshot().speakers[0].label, "話者1");
    }

    /// QĐ 8: tắt "Phân biệt người nói" giữa phiên thì bảng người nói rỗng; câu đã có không còn nhãn (bản chép lời, Lịch sử, file xuất).
    #[test]
    fn turning_speakers_off_drops_the_labels() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.upsert(
            1,
            &Subtitle {
                speaker: Some(1),
                ..sub(1, "Một", Status::Done)
            },
        );
        store.roster(1, &voices(&[1]));
        let off = store.speakers_off().expect("có giọng: phát bảng rỗng");
        assert!(off.voices.is_empty() && off.rev > 0, "{off:?}");
        let t = store.snapshot();
        assert_eq!(t.speaker_label(&t.lines[0]), None);
        assert!(store.roster(1, &voices(&[1, 2])).is_none(), "bảng tới muộn bị bỏ");
        store.begin(2, 0, "vi");
        assert_eq!(store.speakers_off(), None, "chưa có giọng: không có gì để phát");
    }

    /// QĐ 25: mỗi bảng dựng ra có `rev` lớn hơn bảng trước, kể cả qua phiên mới; bản chụp ghi `rev` của bảng mới nhất đã dựng.
    #[test]
    fn every_roster_gets_a_larger_rev_across_sessions() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        let first = store.roster(1, &voices(&[1])).unwrap();
        let renamed = store.rename_speaker(1, "Lan").unwrap();
        assert!(renamed.rev > first.rev);
        assert_eq!(store.snapshot().speakers_rev, renamed.rev);
        store.begin(2, 0, "vi");
        let next = store.roster(2, &voices(&[4])).unwrap();
        assert!(next.rev > renamed.rev, "không đặt lại giữa các phiên");
    }

    /// QĐ 25, rà soát lần 2 (A-N3): phiên mới, "Xóa toàn bộ dữ liệu" và đổi ngôn ngữ đổi bảng mà không dựng bảng để phát; bản chụp
    /// sau đó phải mới hơn mọi bảng đã phát trước, để bảng cũ tới muộn (cùng `rev` với bản chụp) không đè lên bản chụp.
    #[test]
    fn a_snapshot_after_a_new_session_or_a_clear_is_newer_than_any_roster_sent_before() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        let sent = store.roster(1, &voices(&[1])).unwrap();
        store.begin(2, 0, "vi");
        assert!(store.snapshot().speakers_rev > sent.rev, "phiên mới");
        let sent = store.roster(2, &voices(&[2])).unwrap();
        store.clear();
        assert!(store.snapshot().speakers_rev > sent.rev, "xóa dữ liệu");
        let sent = store.roster_view();
        store.set_ui_language(UiLanguage::En);
        assert!(store.snapshot().speakers_rev > sent.rev, "đổi ngôn ngữ");
    }

    /// Rà soát mã 03, mục 5: khóa của bảng người nói cũng là khóa của luồng phụ đề (`upsert`, `delta`), nên đổi tên làm sạch tên
    /// (và từ chối tên quá dài) trước khi khóa: luồng phụ đề đang giữ khóa thì lệnh vẫn trả lỗi ngay, không chờ.
    #[test]
    fn renaming_cleans_the_name_before_taking_the_lock() {
        use std::sync::{Arc, mpsc};
        let store = Arc::new(TranscriptStore::default());
        store.begin(1, 0, "vi");
        store.roster(1, &voices(&[1]));
        let subtitles = store.lock();
        let (tx, rx) = mpsc::channel();
        let renaming = {
            let store = store.clone();
            std::thread::spawn(move || tx.send(store.rename_speaker(1, &"a".repeat(1_000_000))).unwrap())
        };
        let got = rx.recv_timeout(std::time::Duration::from_secs(10));
        drop(subtitles);
        renaming.join().unwrap();
        assert_eq!(got, Ok(Err(SpeakerError::TooLong)));
        assert_eq!(store.rename_speaker(1, &"a".repeat(41)), Err(SpeakerError::TooLong));
    }

    /// QĐ 18: "Xóa toàn bộ dữ liệu" bỏ cả tên người dùng đã gõ.
    #[test]
    fn clear_forgets_the_names_typed_by_the_user() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.roster(1, &voices(&[1]));
        store.rename_speaker(1, "Lan").unwrap();
        store.clear();
        assert_eq!(store.roster_view().voices[0].source, NameSource::Voice);
    }
}
