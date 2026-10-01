//! Phụ đề gửi sang giao diện (spec §6.6). Tên trường theo `src/lib/ipc.ts` (`start_ms`, `src_lang`…).
//!
//! Hai sự kiện: `subtitle://upsert` gửi cả đối tượng (giao diện thay phụ đề cùng `id`), `subtitle://delta` gửi phần chữ
//! dịch mới trong lúc đang dịch (giao diện nối vào `tgt_text` của phụ đề cùng `id`). Một upsert luôn thay hẳn chữ dịch,
//! nên sau khi dịch lại (ghép câu, thử lại) chữ cũ không còn.

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
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
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Delta {
    pub id: u64,
    /// Phần chữ dịch mới, đã qua hậu xử lý.
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

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
        };
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            serde_json::json!({
                "id": 7, "start_ms": 1000, "end_ms": 2500, "src_lang": "en", "src_text": "Hello",
                "tgt_text": "Xin chào", "status": "same_lang", "provisional": false, "replaces": [8]
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
