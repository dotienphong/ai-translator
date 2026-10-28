//! Phụ đề gửi sang giao diện (spec §6.6). Tên trường theo `src/lib/ipc.ts` (`start_ms`, `src_lang`…).
//!
//! Hai sự kiện: `subtitle://upsert` gửi cả đối tượng (giao diện thay phụ đề cùng `id`), `subtitle://delta` gửi phần chữ
//! dịch mới trong lúc đang dịch (giao diện nối vào `tgt_text` của phụ đề cùng `id`). Một upsert luôn thay hẳn chữ dịch,
//! nên sau khi dịch lại (ghép câu, thử lại) chữ cũ không còn.
//!
//! Chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6.2) thêm `subtitle://live` (`LiveLine`, dòng đang nói, chỉ
//! cho thanh phụ đề) và `subtitle://live-end` (`LiveEnd`, gỡ dòng đó).

use serde::{Deserialize, Serialize};
use std::fmt;

/// `Deserialize` cho lịch sử chép lời của app (đọc lại trạng thái đã lưu trong DB, kế hoạch 03).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    /// Đã có chữ gốc, đang chờ dịch.
    AsrDone,
    Translating,
    Done,
    /// Dịch lỗi cả hai lần, hoặc `llama-server` không dùng được: hiện câu gốc, "chưa dịch được".
    Failed,
    /// Câu đã là ngôn ngữ đích: hiện câu gốc, không dịch (F2).
    SameLang,
    /// Chờ dịch quá lâu: bỏ bước dịch, chỉ hiện câu gốc (§7).
    Skipped,
    /// Đoạn âm thanh bị bỏ vì trễ hoặc vì `asr-worker` lỗi: bản chép lời hiện "[bỏ qua đoạn]".
    Dropped,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Subtitle {
    /// Duy nhất trong cả lần chạy của app (xem `EngineConfig::id_base`).
    pub id: u64,
    /// Ranh giới tiếng nói, tính từ đầu phiên (§6.3).
    pub start_ms: u64,
    pub end_ms: u64,
    pub src_lang: String,
    pub src_text: String,
    pub tgt_text: String,
    pub status: Status,
    /// Phụ đề tạm (§6.3): câu chưa chốt, có thể còn được ghép thêm.
    pub provisional: bool,
    /// Id của các phụ đề đã được gộp vào phụ đề này khi hàng đợi dịch đầy (§7). Giao diện xóa các phụ đề đó.
    pub replaces: Vec<u64>,
    /// Mã giọng (spec 2026-10-26-phan-biet-nguoi-noi §9): `None` khi chưa biết hay phiên không có nhận giọng. Tên và màu không
    /// nằm ở đây (kế hoạch 03 tính từ `speaker://roster`).
    pub speaker: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Delta {
    pub id: u64,
    /// Phần chữ dịch mới, đã qua hậu xử lý.
    pub text: String,
}

/// Dòng đang nói (spec 2026-10-10 §6.2, `subtitle://live`): bản tạm của đoạn VAD đang mở. Phần ổn định và phần tạm là hai
/// chuỗi riêng (`stable + tail` là cả chuỗi, `tail` tự mang khoảng trắng đầu khi cần), không gửi chỉ số, để không lệch
/// giữa UTF-8 và UTF-16.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct LiveLine {
    /// `id_base` + id mà đoạn mở sẽ nhận khi đóng (cùng không gian id với `Subtitle`).
    pub id: u64,
    /// Id phụ đề tạm (đang trong cửa sổ ghép) mà dòng này nối tiếp; thanh phụ đề vẽ dòng thay chỗ phụ đề đó.
    pub extends: Option<u64>,
    pub src_lang: String,
    pub src_stable: String,
    pub src_tail: String,
    pub tgt_stable: String,
    pub tgt_tail: String,
    /// Số đơn vị nguồn mà bản dịch đang hiện được dịch từ đó (chỉ để đo, §10.1; giao diện bỏ qua).
    pub tgt_src_units: u32,
    /// Giọng của câu đang mở mà dòng này nối tiếp (`extends`); lượt nói mới chưa có nhãn cho tới khi đoạn đóng và có `Assign`
    /// (spec 2026-10-26-phan-biet-nguoi-noi §4.4).
    pub speaker: Option<u32>,
}

/// Gỡ dòng đang nói (`subtitle://live-end`): lượt cuối đã chốt, đoạn bị lọc hay bỏ, chế độ tự tắt, dừng phiên.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct LiveEnd {
    pub id: u64,
}

/// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker`, spec 2026-10-26-phan-biet-nguoi-noi §4.3): nhãn tới muộn, giọng bị
/// gộp. Giao diện đổi nhãn tại chỗ.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct SpeakerLabel {
    pub id: u64,
    pub speaker: Option<u32>,
}

/// Một giọng của phiên (`speaker://roster`). Kế hoạch 03 thêm nhãn, màu, nguồn tên; kế hoạch 04 thêm người tham dự.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct RosterVoice {
    /// Mã giọng; "Người N" lấy N = mã (mã tăng theo thứ tự xuất hiện, không dùng lại, có thể > 8).
    pub id: u32,
    /// Giọng trong phòng (≥ 60% thời lượng từ micro, spec §5.5).
    pub room: bool,
}

/// Bảng giọng của phiên: mọi giọng đã thấy, trừ giọng đã bị gộp.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Roster {
    pub voices: Vec<RosterVoice>,
}

/// Tên đọc từ app họp (spec 2026-10-26-phan-biet-nguoi-noi §6.6, §9; kế hoạch 04): tên của các giọng có tên và người tham dự. Tên
/// chưa qua `clean_name` của app. `Debug` không in tên.
#[derive(Clone, Default, PartialEq, Eq)]
pub struct Names {
    pub voices: Vec<NamedVoice>,
    pub participants: Vec<String>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct NamedVoice {
    pub id: u32,
    pub name: String,
    /// Một tên ở nhiều giọng (máy chung phòng): giọng thứ mấy.
    pub room_index: Option<u32>,
}

impl fmt::Debug for Names {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Names({} giọng có tên, {} người tham dự)",
            self.voices.len(),
            self.participants.len()
        )
    }
}

impl fmt::Debug for NamedVoice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "NamedVoice({}, <{} ký tự>, {:?})",
            self.id,
            self.name.chars().count(),
            self.room_index
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sự kiện dòng đang nói (spec 2026-10-10 §6.2, H5): tên trường snake_case như `Subtitle`.
    #[test]
    fn live_events_serialize_with_snake_case_fields() {
        let line = LiveLine {
            id: 12,
            extends: Some(10),
            src_lang: "en".into(),
            src_stable: "so we".into(),
            src_tail: " went".into(),
            tgt_stable: "chúng tôi".into(),
            tgt_tail: " đã đi".into(),
            tgt_src_units: 3,
            speaker: Some(2),
        };
        assert_eq!(
            serde_json::to_value(&line).unwrap(),
            serde_json::json!({
                "id": 12, "extends": 10, "src_lang": "en", "src_stable": "so we", "src_tail": " went",
                "tgt_stable": "chúng tôi", "tgt_tail": " đã đi", "tgt_src_units": 3, "speaker": 2
            })
        );
        assert_eq!(
            serde_json::to_value(LiveLine::default()).unwrap(),
            serde_json::json!({
                "id": 0, "extends": null, "src_lang": "", "src_stable": "", "src_tail": "",
                "tgt_stable": "", "tgt_tail": "", "tgt_src_units": 0, "speaker": null
            })
        );
        assert_eq!(
            serde_json::to_value(LiveEnd { id: 12 }).unwrap(),
            serde_json::json!({ "id": 12 })
        );
    }

    /// Sự kiện của nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.3, §9): `subtitle://speaker`, `speaker://roster`.
    #[test]
    fn speaker_events_serialize_with_snake_case_fields() {
        assert_eq!(
            serde_json::to_value(SpeakerLabel {
                id: 7,
                speaker: Some(2)
            })
            .unwrap(),
            serde_json::json!({ "id": 7, "speaker": 2 })
        );
        assert_eq!(
            serde_json::to_value(SpeakerLabel { id: 7, speaker: None }).unwrap(),
            serde_json::json!({ "id": 7, "speaker": null })
        );
        let roster = Roster {
            voices: vec![RosterVoice { id: 1, room: false }, RosterVoice { id: 9, room: true }],
        };
        assert_eq!(
            serde_json::to_value(&roster).unwrap(),
            serde_json::json!({ "voices": [{ "id": 1, "room": false }, { "id": 9, "room": true }] })
        );
    }

    #[test]
    fn serializes_with_the_field_names_of_the_ui() {
        let s = Subtitle {
            id: 7,
            start_ms: 1_000,
            end_ms: 2_500,
            src_lang: "en".into(),
            src_text: "Hello".into(),
            tgt_text: "Xin chào".into(),
            status: Status::SameLang,
            provisional: false,
            replaces: vec![8],
            speaker: Some(3),
        };
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            serde_json::json!({
                "id": 7, "start_ms": 1000, "end_ms": 2500, "src_lang": "en", "src_text": "Hello",
                "tgt_text": "Xin chào", "status": "same_lang", "provisional": false, "replaces": [8],
                "speaker": 3
            })
        );
        let statuses = [
            Status::AsrDone,
            Status::Translating,
            Status::Done,
            Status::Failed,
            Status::SameLang,
            Status::Skipped,
            Status::Dropped,
        ];
        let names: Vec<String> = statuses
            .iter()
            .map(|s| serde_json::to_value(s).unwrap().as_str().unwrap().to_string())
            .collect();
        assert_eq!(
            names,
            [
                "asr_done",
                "translating",
                "done",
                "failed",
                "same_lang",
                "skipped",
                "dropped"
            ]
        );
    }
}
