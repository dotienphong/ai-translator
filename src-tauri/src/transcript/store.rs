//! Bản chép lời của phiên, trong bộ nhớ (spec §6.6 "Lưu trữ", F4): mọi phụ đề của phiên đang chạy hoặc phiên vừa dừng,
//! theo đúng luật của thanh phụ đề (`upsert` thay cả đối tượng, `delta` nối chữ dịch, `replaces` xóa phụ đề đã gộp), nhưng
//! không giới hạn số dòng. Cửa sổ chính đọc bản này khi mở màn hình Bản chép lời; khi phiên dừng, app lưu nó vào lịch sử
//! nếu bật "Lưu lịch sử" và đang là Pro (`history.rs`). Phiên mới bắt đầu thì bản cũ bị thay.

use std::collections::BTreeMap;
use std::sync::Mutex;

use pipeline::subtitle::{Delta, Subtitle};
use serde::Serialize;

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
}

#[derive(Default)]
struct Current {
    meta: Transcript,
    lines: BTreeMap<u64, Subtitle>,
}

/// Bản chép lời của phiên hiện tại (hoặc vừa dừng). Quản lý bằng `app.manage`; luồng phụ đề của engine ghi vào, lệnh
/// của giao diện đọc ra.
#[derive(Default)]
pub struct TranscriptStore(Mutex<Current>);

impl TranscriptStore {
    fn lock(&self) -> std::sync::MutexGuard<'_, Current> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Phiên `session` bắt đầu: bỏ bản của phiên trước.
    pub fn begin(&self, session: u64, started_at: u64, target_lang: &str) {
        *self.lock() = Current {
            meta: Transcript {
                session,
                started_at,
                ended_at: None,
                target_lang: target_lang.to_string(),
                lines: Vec::new(),
            },
            lines: BTreeMap::new(),
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

    /// Xóa toàn bộ dữ liệu (§4.3, Quyền riêng tư): bỏ cả bản chép lời trong bộ nhớ. Phiên đang chạy vẫn ghi tiếp các câu
    /// sau.
    pub fn clear(&self) {
        let mut current = self.lock();
        current.lines.clear();
    }
}

fn snapshot(current: &Current) -> Transcript {
    Transcript {
        lines: current.lines.values().cloned().collect(),
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
        }
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
}
