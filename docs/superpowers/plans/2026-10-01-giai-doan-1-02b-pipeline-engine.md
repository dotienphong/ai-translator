# Giai đoạn 1 · 02b: Pipeline trong app — engine, test từ file WAV, công cụ đo, nguồn âm thanh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần thứ hai của kế hoạch 02 (mục 2.2 của kế hoạch 00), sau 02a:
- phụ đề và sự kiện theo §6.6, hai hàng đợi chống nghẽn của §7, số đo của phiên;
- engine của một phiên dịch: âm thanh 16 kHz vào, `subtitle://upsert` và `subtitle://delta` ra;
- test tích hợp từ file WAV (clip FLEURS, Đ20) với tiến trình phụ giả, và bản chạy model thật;
- `latency-bench mt-eval` (Đ4), nhãn và so mốc cho `score_mt.py`, công cụ đo `no_speech_prob` và tỉ lệ token (Đ12);
- `audio-capture` đủ cho app: chọn thiết bị, danh sách app đang phát tiếng, tiền xử lý dùng chung, tap thu cả âm thanh của app;
- đo cho Đ12 và chạy lại A3, A4, S6 (mục 6.7 của kế hoạch 00).

**Kiến trúc:** Như 02a. Engine chạy bốn luồng (VAD, nhận dạng, phụ đề, dịch); luồng phụ đề là nơi duy nhất phát sự kiện phụ đề (QĐ1). App nối vào qua `FrameSource`, `VadFactory`, trait `Asr` và `Mt` của `SidecarManager`, và `EventSink`.

**Công nghệ:** Như 02a; không thêm crate nào.

Đọc trước 02a: `docs/superpowers/plans/2026-10-01-giai-doan-1-02a-pipeline-crate.md`. Các mục "Phiên bản đã chốt", "Cách đọc kế hoạch này", "Dòng của bảng đối chiếu", "Quyết định" (QĐ) và "Điểm cần chủ dự án quyết" ở đó áp cho file này. Làm file này sau khi 02a đã commit hết.

---

## Task 1: Phụ đề, hàng đợi §7, số đo của phiên

Ba module thuần, không luồng, không khóa, để test từng trường hợp (dòng 151, 186, 218–222, 238, 288; QĐ9):
- `subtitle.rs`: `Subtitle` (tên trường theo `src/lib/ipc.ts`, thêm `replaces`), `Status` đủ bảy trạng thái của §6.6, `Delta`.
- `queue.rs`: `AsrQueue` (VAD → nhận dạng) và `MtQueue` (câu chờ dịch) theo §7. "Hiện tại" là giờ âm thanh của phiên.
- `metrics.rs`: `SessionMetrics` (thời gian từng bước, số đoạn theo kết cục, số lần ghép, thời lượng tiếng nói đã dịch cho quota của 06) và bản tóm tắt một dòng cho log, không có chữ chép lời.

**Files:**
- Sửa: `crates/pipeline/src/lib.rs`
- Tạo: `crates/pipeline/src/metrics.rs`
- Tạo: `crates/pipeline/src/queue.rs`
- Tạo: `crates/pipeline/src/subtitle.rs`

- [ ] **Step 1: Khai báo module**

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -3,13 +3,16 @@
 pub mod filter;
 pub mod llama;
 pub mod logfile;
+pub mod metrics;
 pub mod postprocess;
 pub mod process;
 pub mod prompt;
 pub mod prompt_history;
+pub mod queue;
 pub mod segmenter;
 pub mod sentence;
 pub mod sse;
+pub mod subtitle;
 pub mod supervisor;
 pub mod text;
 pub mod translate;
```

- [ ] **Step 2: Viết test**

Tạo `crates/pipeline/src/metrics.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Số đo của một phiên (spec §7): thời gian từng bước, lưu trên máy, không gửi đi đâu. Bảng debug ẩn (kế hoạch 03) đọc
//! bản tóm tắt này; khi phiên dừng, bản tóm tắt được ghi vào log (Đ17 của kế hoạch 00). Không có chữ chép lời nào ở đây.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentiles_interpolate() {
        assert_eq!(percentile(&[], 50.0), None);
        assert_eq!(percentile(&[3.0, 1.0, 2.0], 50.0), Some(2.0));
        assert_eq!(percentile(&[0.0, 400.0], 90.0), Some(360.0));
    }

    #[test]
    fn summary_has_counts_and_stages_but_no_text() {
        let m = SessionMetrics {
            segments: 4,
            translated: 3,
            asr_ms: vec![100.0, 300.0],
            latency_ms: vec![900.0],
            translated_speech_ms: 5_000,
            ..Default::default()
        };
        assert_eq!(
            m.summary(),
            "4 đoạn (lọc 0, bỏ 0), 3 câu dịch, 0 lỗi, 0 bỏ bước dịch, 0 cùng ngôn ngữ, 0 lần ghép; nhận dạng p50 200 ms, \
             p90 280 ms; tổng p50 900 ms, p90 900 ms; tiếng nói đã dịch 5000 ms"
        );
    }
}
```

Tạo `crates/pipeline/src/queue.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Hai hàng đợi chống nghẽn của §7, ở dạng luật thuần (không luồng, không khóa), để test từng trường hợp.
//!
//! - [`AsrQueue`], VAD → nhận dạng: tối đa 3 đoạn chờ; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây; chỉ
//!   bỏ đoạn (`dropped`) khi độ trễ vượt 20 giây.
//! - [`MtQueue`], câu chờ dịch: tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ thành một request (phụ đề cũng gộp
//!   thành một, lấy `start_ms` của câu đầu và `end_ms` của câu cuối); câu chờ quá 20 giây thì bỏ bước dịch (`skipped`).
//!
//! "Hiện tại" là giờ âm thanh của phiên (ms), cùng gốc với `start_ms` và `end_ms`.

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: usize = SAMPLE_RATE as usize;

    fn seg(id: u64, start_ms: u64, end_ms: u64, seconds: usize) -> PendingSegment {
        PendingSegment {
            ids: vec![id],
            start_ms,
            end_ms,
            samples: vec![0.0; seconds * SECOND],
        }
    }

    fn ids(q: &mut AsrQueue) -> Vec<Vec<u64>> {
        let mut out = Vec::new();
        while let Some(Popped::Segment(s)) = q.pop(0) {
            out.push(s.ids);
        }
        out
    }

    #[test]
    fn up_to_three_segments_wait_without_merging() {
        let mut q = AsrQueue::new(QueueConfig::default());
        for i in 0..3 {
            q.push(seg(i, i * 5_000, i * 5_000 + 3_000, 3));
        }
        assert_eq!(ids(&mut q), [vec![0], vec![1], vec![2]]);
    }

    #[test]
    fn a_full_queue_merges_the_two_oldest_segments() {
        let mut q = AsrQueue::new(QueueConfig::default());
        for i in 0..4 {
            q.push(seg(i, i * 5_000, i * 5_000 + 3_000, 3));
        }
        let first = match q.pop(0).unwrap() {
            Popped::Segment(s) => s,
            other => panic!("{other:?}"),
        };
        assert_eq!((first.ids, first.start_ms, first.end_ms), (vec![0, 1], 0, 8_000));
        assert_eq!(first.samples.len(), 6 * SECOND);
        assert_eq!(ids(&mut q), [vec![2], vec![3]]);
    }

    #[test]
    fn segments_longer_than_12_seconds_together_are_not_merged() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.push(seg(0, 0, 7_000, 7));
        q.push(seg(1, 8_000, 14_000, 6));
        q.push(seg(2, 15_000, 16_000, 1));
        q.push(seg(3, 17_000, 18_000, 1)); // 7 + 6 = 13 giây > 12: không gộp, hàng dài 4
        assert_eq!(q.len(), 4);
        assert_eq!(ids(&mut q), [vec![0], vec![1], vec![2], vec![3]]);
    }

    #[test]
    fn only_segments_later_than_20_seconds_are_dropped() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.push(seg(0, 0, 3_000, 3));
        q.push(seg(1, 4_000, 6_000, 2));
        assert_eq!(q.oldest_end_ms(), Some(3_000));
        assert!(matches!(q.pop(23_001), Some(Popped::Dropped(s)) if s.ids == [0]));
        assert!(
            matches!(q.pop(23_001), Some(Popped::Segment(s)) if s.ids == [1]),
            "trễ 17 giây: vẫn nhận dạng"
        );
        assert!(q.pop(0).is_none());
    }

    fn item(sub_id: u64, lang: &str, text: &str, enqueued_ms: u64) -> MtItem {
        MtItem {
            sub_id,
            version: 1,
            lang: lang.into(),
            text: text.into(),
            start_ms: sub_id * 1_000,
            end_ms: sub_id * 1_000 + 800,
            enqueued_ms,
            open: false,
            replaces: Vec::new(),
        }
    }

    #[test]
    fn a_full_translation_queue_merges_consecutive_sentences_of_the_same_language() {
        let mut q = MtQueue::new(QueueConfig::default());
        assert!(q.push(item(1, "en", "One.", 0)).is_empty());
        assert!(q.push(item(2, "en", "Two.", 100)).is_empty());
        assert!(q.push(item(3, "ja", "三。", 200)).is_empty());
        let merged = q.push(item(4, "ja", "四。", 300));
        assert_eq!(merged.len(), 1);
        let m = &merged[0];
        assert_eq!(
            (m.sub_id, m.text.as_str(), m.start_ms, m.end_ms),
            (1, "One. Two.", 1_000, 2_800)
        );
        assert_eq!((m.replaces.clone(), m.version, m.enqueued_ms), (vec![2], 2, 0));
        let order: Vec<u64> = q.iter().map(|i| i.sub_id).collect();
        assert_eq!(order, [1, 3, 4]);
    }

    #[test]
    fn japanese_and_chinese_sentences_are_joined_without_a_space() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "ja", "一。", 0));
        q.push(item(2, "ja", "二。", 0));
        q.push(item(3, "ja", "三。", 0));
        let merged = q.push(item(4, "en", "Four.", 0));
        assert_eq!(merged[0].text, "一。二。三。");
        assert_eq!(merged[0].replaces, [2, 3]);
    }

    #[test]
    fn the_open_sentence_is_never_merged() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "en", "One.", 0));
        q.push(item(2, "en", "Two.", 0));
        q.push(MtItem {
            open: true,
            ..item(3, "en", "and three", 0)
        });
        let merged = q.push(item(4, "en", "Four.", 0));
        assert_eq!(merged[0].replaces, [2]);
        assert_eq!(q.iter().map(|i| i.sub_id).collect::<Vec<_>>(), [1, 3, 4]);
        assert!(q.update(3, "and three more", 3_900, 2));
        q.close(3);
        let merged = q.push(item(5, "en", "Five.", 0));
        assert_eq!(merged[0].text, "One. Two. and three more Four.");
    }

    #[test]
    fn sentences_waiting_more_than_20_seconds_are_skipped() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "en", "One.", 1_000));
        q.push(item(2, "en", "Two.", 5_000));
        assert!(matches!(q.pop(21_001), Some(Ready::Skip(i)) if i.sub_id == 1));
        assert!(matches!(q.pop(21_001), Some(Ready::Translate(i)) if i.sub_id == 2));
    }
}
```

Tạo `crates/pipeline/src/subtitle.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Phụ đề gửi sang giao diện (spec §6.6). Tên trường theo `src/lib/ipc.ts` (`start_ms`, `src_lang`…).
//!
//! Hai sự kiện: `subtitle://upsert` gửi cả đối tượng (giao diện thay phụ đề cùng `id`), `subtitle://delta` gửi phần chữ
//! dịch mới trong lúc đang dịch (giao diện nối vào `tgt_text` của phụ đề cùng `id`). Một upsert luôn thay hẳn chữ dịch,
//! nên sau khi dịch lại (ghép câu, thử lại) chữ cũ không còn.

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
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --lib`
Expected: biên dịch lỗi:

```text
error[E0422]: cannot find struct, variant or union type `SessionMetrics` in this scope
error[E0425]: cannot find value `SAMPLE_RATE` in this scope
error[E0425]: cannot find type `PendingSegment` in this scope
error[E0422]: cannot find struct, variant or union type `PendingSegment` in this scope
error[E0425]: cannot find type `AsrQueue` in this scope
error[E0433]: cannot find type `QueueConfig` in this scope
```

- [ ] **Step 4: Viết code**

Thêm vào `crates/pipeline/src/metrics.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use serde::Serialize;

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct SessionMetrics {
    /// Số đoạn VAD đã chốt.
    pub segments: usize,
    /// Số đoạn bị luật bỏ đoạn loại (không có tiếng nói, câu ảo giác).
    pub filtered: usize,
    pub dropped: usize,
    pub same_lang: usize,
    pub translated: usize,
    pub failed: usize,
    pub skipped: usize,
    /// Số lần một đoạn được ghép vào câu đang mở (§6.3).
    pub merges: usize,
    /// Cắt đoạn: từ lúc hết tiếng nói tới lúc đoạn được chốt (giờ âm thanh), ms.
    pub vad_ms: Vec<f32>,
    /// Nhận dạng (`asr_ms` của worker), ms.
    pub asr_ms: Vec<f32>,
    /// Dịch, từ lúc bắt đầu tới lúc xong (cả lần thử lại nếu có), ms.
    pub mt_ms: Vec<f32>,
    /// Tổng thể: từ lúc hết tiếng nói của câu tới lúc bản dịch hiện đủ (giờ âm thanh), ms.
    pub latency_ms: Vec<f32>,
    /// Thời lượng tiếng nói đã dịch, cho quota Free (Q5 của kế hoạch 00: không tính `same_lang`, đoạn bị bỏ, đoạn bị lọc).
    pub translated_speech_ms: u64,
}

/// Phân vị `p` (0–100), nội suy tuyến tính như numpy. Rỗng thì `None`.
pub fn percentile(values: &[f32], p: f32) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    let mut v = values.to_vec();
    v.sort_by(f32::total_cmp);
    let rank = (v.len() - 1) as f32 * p / 100.0;
    let (lo, hi) = (rank.floor() as usize, rank.ceil() as usize);
    Some(v[lo] + (v[hi] - v[lo]) * (rank - lo as f32))
}

impl SessionMetrics {
    /// Một dòng cho log: số đoạn theo loại, p50/p90 của từng bước.
    pub fn summary(&self) -> String {
        let stat = |name: &str, v: &[f32]| match (percentile(v, 50.0), percentile(v, 90.0)) {
            (Some(p50), Some(p90)) => format!(" {name} p50 {p50:.0} ms, p90 {p90:.0} ms;"),
            _ => String::new(),
        };
        format!(
            "{} đoạn (lọc {}, bỏ {}), {} câu dịch, {} lỗi, {} bỏ bước dịch, {} cùng ngôn ngữ, {} lần ghép;{}{}{}{} tiếng nói đã dịch {} ms",
            self.segments,
            self.filtered,
            self.dropped,
            self.translated,
            self.failed,
            self.skipped,
            self.same_lang,
            self.merges,
            stat("cắt đoạn", &self.vad_ms),
            stat("nhận dạng", &self.asr_ms),
            stat("dịch", &self.mt_ms),
            stat("tổng", &self.latency_ms),
            self.translated_speech_ms
        )
    }
}
```

Thêm vào `crates/pipeline/src/queue.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::QueueConfig;
use crate::sentence::joiner;
use asr_protocol::SAMPLE_RATE;
use std::collections::VecDeque;

/// Một đoạn chờ nhận dạng. Đoạn gộp mang id của mọi đoạn đã gộp, theo thứ tự.
#[derive(Clone, PartialEq)]
pub struct PendingSegment {
    pub ids: Vec<u64>,
    pub start_ms: u64,
    pub end_ms: u64,
    pub samples: Vec<f32>,
}

// Debug viết tay: không in âm thanh.
impl std::fmt::Debug for PendingSegment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PendingSegment")
            .field("ids", &self.ids)
            .field("start_ms", &self.start_ms)
            .field("end_ms", &self.end_ms)
            .field("samples", &format_args!("<{} mẫu>", self.samples.len()))
            .finish()
    }
}

#[derive(Debug, PartialEq)]
pub enum Popped {
    Segment(PendingSegment),
    /// Trễ quá `asr_drop_after_ms`: bỏ, không nhận dạng.
    Dropped(PendingSegment),
}

#[derive(Debug)]
pub struct AsrQueue {
    items: VecDeque<PendingSegment>,
    cfg: QueueConfig,
}

impl AsrQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            cfg,
        }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Mốc `end_ms` của đoạn chờ lâu nhất, để tính độ trễ.
    pub fn oldest_end_ms(&self) -> Option<u64> {
        self.items.front().map(|s| s.end_ms)
    }

    /// Thêm một đoạn. Hàng đợi đã đủ `asr_max_waiting` đoạn thì trước đó gộp hai đoạn chờ lâu nhất, nếu tổng âm thanh
    /// (gồm đệm) không quá `asr_merge_max_ms`. Không gộp được thì vẫn thêm: chỉ độ trễ mới làm bỏ đoạn.
    pub fn push(&mut self, segment: PendingSegment) {
        if self.items.len() >= self.cfg.asr_max_waiting && self.items.len() >= 2 {
            let max_samples = self.cfg.asr_merge_max_ms as usize * SAMPLE_RATE as usize / 1000;
            if self.items[0].samples.len() + self.items[1].samples.len() <= max_samples {
                let second = self.items.remove(1).expect("có ít nhất hai đoạn");
                let first = &mut self.items[0];
                first.ids.extend(second.ids);
                first.end_ms = second.end_ms;
                first.samples.extend(second.samples);
            }
        }
        self.items.push_back(segment);
    }

    /// Lấy đoạn kế tiếp. Đoạn đã trễ quá `asr_drop_after_ms` (tính từ `end_ms`) thì trả `Dropped`.
    pub fn pop(&mut self, now_ms: u64) -> Option<Popped> {
        let segment = self.items.pop_front()?;
        Some(if now_ms.saturating_sub(segment.end_ms) > self.cfg.asr_drop_after_ms {
            Popped::Dropped(segment)
        } else {
            Popped::Segment(segment)
        })
    }
}

/// Một câu chờ dịch.
#[derive(Clone, Debug, PartialEq)]
pub struct MtItem {
    /// Id của phụ đề (id đoạn đầu của câu, cộng `id_base`).
    pub sub_id: u64,
    /// Tăng mỗi khi chữ của câu đổi (ghép thêm đoạn, gộp câu): bản dịch của phiên bản cũ bị bỏ.
    pub version: u32,
    pub lang: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    /// Lúc câu vào hàng đợi (giờ âm thanh). Câu gộp lấy mốc của câu vào sớm nhất.
    pub enqueued_ms: u64,
    /// Câu đang mở (còn có thể ghép thêm đoạn, §6.3): chưa được gộp với câu khác.
    pub open: bool,
    pub replaces: Vec<u64>,
}

#[derive(Debug, PartialEq)]
pub enum Ready {
    Translate(MtItem),
    /// Chờ quá `mt_skip_after_ms`: chỉ hiện câu gốc.
    Skip(MtItem),
}

#[derive(Debug)]
pub struct MtQueue {
    items: VecDeque<MtItem>,
    cfg: QueueConfig,
}

impl MtQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            cfg,
        }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &MtItem> {
        self.items.iter()
    }

    /// Thêm một câu. Đầy (`mt_max_waiting`) thì trước đó gộp mọi dãy câu liên tiếp cùng ngôn ngữ đã chốt. Trả các câu vừa
    /// được gộp (đã có `replaces` và `version` mới), để phụ đề của chúng được gửi lại.
    pub fn push(&mut self, item: MtItem) -> Vec<MtItem> {
        let merged = if self.items.len() >= self.cfg.mt_max_waiting {
            self.merge_runs()
        } else {
            Vec::new()
        };
        self.items.push_back(item);
        merged
    }

    /// Đưa lại lên đầu hàng một câu đang dịch dở mà vừa được ghép thêm đoạn (bản dịch cũ đã bị hủy).
    pub fn push_front(&mut self, item: MtItem) {
        self.items.push_front(item);
    }

    /// Câu đang chờ vừa được ghép thêm đoạn: cập nhật chữ và phiên bản. Trả `false` nếu câu không còn trong hàng.
    pub fn update(&mut self, sub_id: u64, text: &str, end_ms: u64, version: u32) -> bool {
        match self.items.iter_mut().find(|i| i.sub_id == sub_id) {
            Some(item) => {
                item.text = text.to_string();
                item.end_ms = end_ms;
                item.version = version;
                true
            }
            None => false,
        }
    }

    /// Câu đã chốt: từ giờ được gộp với câu khác.
    pub fn close(&mut self, sub_id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.sub_id == sub_id) {
            item.open = false;
        }
    }

    /// Lấy câu kế tiếp để dịch; câu đã chờ quá `mt_skip_after_ms` thì trả `Skip`.
    pub fn pop(&mut self, now_ms: u64) -> Option<Ready> {
        let item = self.items.pop_front()?;
        Some(if now_ms.saturating_sub(item.enqueued_ms) > self.cfg.mt_skip_after_ms {
            Ready::Skip(item)
        } else {
            Ready::Translate(item)
        })
    }

    fn merge_runs(&mut self) -> Vec<MtItem> {
        let mut out: VecDeque<MtItem> = VecDeque::new();
        let mut merged_ids = Vec::new();
        for item in self.items.drain(..) {
            match out.back_mut() {
                Some(last) if !last.open && !item.open && last.lang == item.lang => {
                    last.text = format!("{}{}{}", last.text.trim_end(), joiner(&last.lang), item.text.trim());
                    last.end_ms = item.end_ms;
                    last.enqueued_ms = last.enqueued_ms.min(item.enqueued_ms);
                    last.replaces.push(item.sub_id);
                    last.replaces.extend(item.replaces);
                    last.version += 1;
                    if !merged_ids.contains(&last.sub_id) {
                        merged_ids.push(last.sub_id);
                    }
                }
                _ => out.push_back(item),
            }
        }
        self.items = out;
        self.items
            .iter()
            .filter(|i| merged_ids.contains(&i.sub_id))
            .cloned()
            .collect()
    }
}
```

Thêm vào `crates/pipeline/src/subtitle.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
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
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline --lib`
Expected:

```text
test result: ok. 108 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline/src/lib.rs \
  crates/pipeline/src/metrics.rs \
  crates/pipeline/src/queue.rs \
  crates/pipeline/src/subtitle.rs
git commit -m "feat(pipeline): phụ đề, hàng đợi chống nghẽn §7 và số đo của phiên" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Engine của một phiên dịch

`engine.rs` nối mọi phần trước thành một phiên (§5, §7; dòng 9, 15, 16, 45, 66, 67, 73, 95, 96, 98, 99, 141, 143, 147, 217–222, 231, 235, 238, 273, 315; QĐ1, QĐ10):
- `Engine::start(cfg, source, vad, asr, mt, sink)` chạy bốn luồng: VAD, nhận dạng, phụ đề, dịch. `stop` dừng theo QĐ10; `join` chờ tới khi nguồn hết (test từ file).
- Trait cho app nối vào: `FrameSource` (âm thanh 16 kHz mono vào; `SampleSource` phát mẫu có sẵn), `VadModel` (Silero, hoặc `EnergyVad` cho test không cần model), `EventSink` (phụ đề, delta, mức âm lượng, chỉ báo, lỗi làm phiên dừng kèm loại `Fatal`).
- Luồng phụ đề: ghép câu (§6.3), `same_lang` không dịch (F2), cờ ngữ cảnh câu trước (`translation_context`, mặc định tắt), hàng đợi dịch, chỉ báo "Đang trễ", "Không nghe thấy âm thanh" (60 giây theo RMS) và "dịch không dùng được". Request dịch làm nóng gửi một lần khi bắt đầu phiên (`cache_prompt`).
- `segmenter.rs` thêm `open_start_ms` (thời điểm bắt đầu của đoạn đang nói dở, để luồng phụ đề tính độ trễ).
- `tests/engine.rs` (dòng 295, 315): âm thanh tổng hợp có ranh giới biết trước, VAD theo năng lượng, tiến trình phụ giả qua đúng `SidecarManager`; kiểm thứ tự, thời gian, trạng thái, ghép câu, lọc, `dropped`, lỗi làm phiên dừng, dừng nhanh, và log của cả phiên không có chữ chép lời nào.
- `tests/lifecycle.rs`: chỉnh theo trait `Mt` của engine.

**Files:**
- Tạo: `crates/pipeline/src/engine.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/segmenter.rs`
- Test (tạo): `crates/pipeline/tests/engine.rs`
- Test (sửa): `crates/pipeline/tests/lifecycle.rs`

- [ ] **Step 1: Khai báo module**

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -1,5 +1,6 @@
 pub mod asr_client;
 pub mod config;
+pub mod engine;
 pub mod filter;
 pub mod llama;
 pub mod logfile;
```

- [ ] **Step 2: Viết test**

Tạo `crates/pipeline/src/engine.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Pipeline của một phiên dịch (spec §5, §7): âm thanh 16 kHz mono vào, phụ đề ra. Không phụ thuộc Tauri: app nối vào qua
//! [`FrameSource`] và [`EventSink`] (`src-tauri/src/session.rs`), test nối vào bằng file WAV và tiến trình phụ giả.
//!
//! Các luồng (§7). Callback thu âm nằm ngoài crate này (`audio-capture`).
//! 1. Luồng VAD (stack 8 MiB, vì Silero chạy bằng candle cần hơn 1 MiB ở bản debug, §6.3): đọc âm thanh, đo mức âm lượng,
//!    phát hiện "không có âm thanh", chạy VAD và cắt đoạn, đưa đoạn vào hàng đợi nhận dạng.
//! 2. Luồng nhận dạng: lấy đoạn theo luật hàng đợi §7, dựng prompt theo ngôn ngữ, gọi `asr-worker`, áp luật bỏ đoạn.
//! 3. Luồng phụ đề: nơi duy nhất phát sự kiện phụ đề, nên thứ tự upsert và delta luôn đúng. Ghép câu (§6.3), hàng đợi dịch
//!    (§7), chỉ báo "Đang trễ", số đo của phiên.
//! 4. Luồng dịch: dịch từng câu (`translate`), gửi từng phần chữ về luồng phụ đề.
//!
//! Chọn luồng riêng và client đồng bộ, không dùng runtime tokio (kế hoạch 02, QĐ1): hai client đồng bộ của Giai đoạn 0 đã
//! được đo ở S6 và giữ nguyên; mỗi tiến trình phụ chỉ xử lý một yêu cầu một lúc (`-np 1`), nên async không thêm thông
//! lượng; crate `pipeline` không cần runtime nào, test chạy không cần Tauri.
//!
//! "Giờ" của phiên là giờ âm thanh: số mẫu đã đọc, đổi ra ms. Âm thanh thu thật chạy đúng tốc độ thời gian thực (trên
//! Windows, khoảng lặng được chèn im lặng, §6.1), nên giờ âm thanh bằng giờ thật; test phát file WAV nhanh hơn thời gian
//! thực mà luật vẫn như nhau.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_is_reported_after_60_seconds() {
        let mut m = SilenceMonitor::new(AudioConfig::default());
        let frames_per_minute = 60_000 / FRAME_MS; // 1 875 khung
        for _ in 1..frames_per_minute {
            assert!(!m.push(0.0, FRAME_MS));
        }
        assert!(m.push(0.0, FRAME_MS), "khung thứ 1 875: đủ 60 giây im lặng");
        assert!(!m.push(0.1, FRAME_MS), "có âm thanh thì hết báo");
    }

    #[test]
    fn inserted_silence_counts_as_silence_but_quiet_speech_does_not() {
        let mut m = SilenceMonitor::new(AudioConfig {
            no_audio_after_ms: 64,
            ..AudioConfig::default()
        });
        assert!(!m.push(0.000_1, FRAME_MS));
        assert!(m.push(0.0, FRAME_MS));
        assert!(!m.push(0.001, FRAME_MS), "RMS 0,001 (khoảng −60 dBFS) vẫn là âm thanh");
    }

    #[test]
    fn energy_vad_and_sample_source() {
        let mut vad = EnergyVad { threshold_rms: 0.01 };
        assert_eq!(vad.prob(&[0.0; FRAME_SAMPLES]).unwrap(), 0.0);
        assert_eq!(vad.prob(&[0.2; FRAME_SAMPLES]).unwrap(), 0.9);
        let mut src = SampleSource::new(vec![0.5; 1_000], 400, Duration::ZERO);
        let mut out = Vec::new();
        while src.read(&mut out, Duration::ZERO).unwrap() {}
        assert_eq!(out.len(), 1_000);
    }
}
```

Sửa `crates/pipeline/src/segmenter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/segmenter.rs
+++ b/crates/pipeline/src/segmenter.rs
@@ -294,6 +294,17 @@
     }
 
     #[test]
+    fn the_open_segment_start_is_visible_before_it_closes() {
+        let mut seg = Segmenter::new(SegmenterConfig::default());
+        run(&mut seg, &[(0.0, 0.0, 10)]);
+        assert_eq!(seg.open_start_ms(), None);
+        run(&mut seg, &[(0.9, 0.5, 5)]);
+        assert_eq!(seg.open_start_ms(), Some(10 * FRAME_MS));
+        run(&mut seg, &[(0.0, 0.0, 20)]);
+        assert_eq!(seg.open_start_ms(), None, "blip 5 khung bị bỏ khi chốt");
+    }
+
+    #[test]
     fn flush_emits_pending_speech() {
         let mut seg = Segmenter::new(SegmenterConfig::default());
         run(&mut seg, &[(0.9, 0.5, 20)]);
```

Tạo `crates/pipeline/tests/engine.rs`:

```rust
//! Pipeline từ âm thanh tới phụ đề (spec §11, "Test tích hợp": chạy pipeline từ file âm thanh, không thu âm thật, kiểm
//! phụ đề có xuất hiện, đúng thứ tự, đúng thời gian). Âm thanh tổng hợp có ranh giới biết trước; VAD theo năng lượng;
//! tiến trình phụ giả chạy qua đúng `SidecarManager` của app.

use pipeline::config::{AsrConfig, MtConfig, PipelineConfig, SupervisorConfig};
use pipeline::engine::{EnergyVad, Engine, EngineConfig, EventSink, Fatal, Indicators, SampleSource, VadFactory};
use pipeline::prompt::Lang;
use pipeline::subtitle::{Delta, Status, Subtitle};
use pipeline::supervisor::{AsrSpec, Clock, FakeClock, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant};

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");
const RATE: usize = 16_000;

/// Log của cả tiến trình test, để kiểm log không chứa nội dung chép lời (§11, "Bảo mật").
struct CaptureLog(Mutex<Vec<String>>);

impl log::Log for CaptureLog {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        self.0.lock().unwrap().push(format!("{}", record.args()));
    }

    fn flush(&self) {}
}

static LOG: CaptureLog = CaptureLog(Mutex::new(Vec::new()));

fn capture_log() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        log::set_logger(&LOG).unwrap();
        log::set_max_level(log::LevelFilter::Trace);
    });
}

#[derive(Debug, Clone)]
enum Ev {
    Upsert(Subtitle),
    Delta(Delta),
    Indicators(Indicators),
    Fatal(String),
}

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<Ev>>,
    levels: Mutex<Vec<f32>>,
}

impl EventSink for Recorder {
    fn subtitle(&self, s: &Subtitle) {
        self.events.lock().unwrap().push(Ev::Upsert(s.clone()));
    }
    fn delta(&self, d: &Delta) {
        self.events.lock().unwrap().push(Ev::Delta(d.clone()));
    }
    fn level(&self, rms: f32) {
        self.levels.lock().unwrap().push(rms);
    }
    fn indicators(&self, i: &Indicators) {
        self.events.lock().unwrap().push(Ev::Indicators(i.clone()));
    }
    fn fatal(&self, kind: Fatal, reason: &str) {
        assert_eq!(kind, Fatal::Asr, "{reason}");
        self.events.lock().unwrap().push(Ev::Fatal(reason.to_string()));
    }
}

impl Recorder {
    fn events(&self) -> Vec<Ev> {
        self.events.lock().unwrap().clone()
    }

    /// Áp các sự kiện như giao diện làm (upsert thay cả phụ đề, delta nối chữ dịch, `replaces` xóa phụ đề đã gộp).
    /// Trả trạng thái cuối theo id, và thứ tự id xuất hiện lần đầu.
    fn replay(&self) -> (BTreeMap<u64, Subtitle>, Vec<u64>) {
        let (mut ui, mut order) = (BTreeMap::new(), Vec::new());
        for ev in self.events() {
            match ev {
                Ev::Upsert(s) => {
                    for id in &s.replaces {
                        ui.remove(id);
                    }
                    if !order.contains(&s.id) {
                        order.push(s.id);
                    }
                    ui.insert(s.id, s);
                }
                Ev::Delta(d) => ui
                    .get_mut(&d.id)
                    .expect("delta của phụ đề đã có")
                    .tgt_text
                    .push_str(&d.text),
                _ => {}
            }
        }
        (ui, order)
    }
}

struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-engine-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Âm thanh tổng hợp: (có tiếng hay không, ms). Tiếng là sóng sin 440 Hz biên độ 0,3.
fn audio(parts: &[(bool, usize)]) -> Vec<f32> {
    let mut out = Vec::new();
    for &(tone, ms) in parts {
        for _ in 0..ms * RATE / 1000 {
            let t = out.len() as f32 / RATE as f32;
            out.push(if tone {
                0.3 * (2.0 * std::f32::consts::PI * 440.0 * t).sin()
            } else {
                0.0
            });
        }
    }
    out
}

fn manager(t: &Temp, texts: &[&str], asr_plan: &[&str], clock: Arc<dyn Clock>) -> Arc<SidecarManager> {
    std::fs::write(t.path("texts"), texts.join("\n")).unwrap();
    std::fs::write(t.path("asr-plan"), asr_plan.join("\n")).unwrap();
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: Some(PathBuf::from(FAKE_ASR)),
            exe_cpu: PathBuf::from(FAKE_ASR),
            model: PathBuf::from("/models/asr.bin"),
            log: t.path("logs/asr-worker.log"),
            first_run: false,
            require_shared: true,
            env: vec![
                ("FAKE_ASR_TEXTS".into(), t.path("texts").display().to_string()),
                ("FAKE_ASR_PLAN".into(), t.path("asr-plan").display().to_string()),
            ],
        },
        llama: LlamaSpec {
            exe: PathBuf::from(FAKE_LLAMA),
            model: PathBuf::from("/models/mt.gguf"),
            log: t.path("logs/llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: SupervisorConfig {
            ready_timeout_ms: 10_000,
            shutdown_grace_ms: 1_000,
            ..SupervisorConfig::default()
        },
        asr_config: AsrConfig::default(),
        mt_config: MtConfig::default(),
    };
    SidecarManager::new(spec, clock, Arc::new(NoEvents))
}

fn energy_vad() -> VadFactory {
    Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.01 }) as _))
}

fn config(languages: &[&str]) -> EngineConfig {
    EngineConfig {
        pipeline: PipelineConfig::default(),
        languages: languages.iter().map(|l| l.to_string()).collect(),
        target: Lang::Vi,
        translation_context: false,
        id_base: 1_000,
    }
}

/// Phát nhanh gấp 20 lần thời gian thực: khối 100 ms mỗi 5 ms.
fn source(samples: Vec<f32>) -> Box<SampleSource> {
    Box::new(SampleSource::new(samples, RATE / 10, Duration::from_millis(5)))
}

#[test]
fn subtitles_appear_in_order_with_the_right_times() {
    capture_log();
    let t = Temp::new("order");
    let texts = [
        "en\tso we went to",
        "en\tthe market yesterday",
        "en\tThen we ate.",
        "vi\txin chào mọi người",
        "en\tThank you for coming\t!nospeech",
    ];
    let manager = manager(&t, &texts, &[], Arc::new(SystemClock::default()));
    manager.ensure_started().unwrap();
    let samples = audio(&[
        (false, 1_000),
        (true, 2_000), // đoạn 0: 1,0–3,0 giây
        (false, 400),  // nghỉ 0,4 giây, trong cửa sổ ghép 0,7 giây
        (true, 1_500), // đoạn 1: ghép vào câu của đoạn 0
        (false, 1_500),
        (true, 1_200), // đoạn 2: có dấu chấm, câu chốt ngay
        (false, 1_500),
        (true, 1_000), // đoạn 3: tiếng Việt, trùng ngôn ngữ đích
        (false, 1_000),
        (true, 800), // đoạn 4: không có tiếng nói theo luật no_speech
        (false, 1_500),
    ]);
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en", "vi"]),
        source(samples),
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    let metrics = engine.join();

    let (ui, order) = sink.replay();
    assert_eq!(order, [1_000, 1_002, 1_003], "đoạn 1 ghép vào đoạn 0, đoạn 4 bị lọc");
    let row = |id: u64| {
        let s = &ui[&id];
        (
            s.start_ms,
            s.end_ms,
            s.src_text.as_str(),
            s.tgt_text.as_str(),
            s.status,
            s.provisional,
        )
    };
    // Khung 32 ms: tiếng bắt đầu ở 1 000 ms rơi vào khung 992–1 024 ms.
    assert_eq!(
        row(1_000),
        (
            992,
            4_928,
            "so we went to the market yesterday",
            "VI: so we went to the market yesterday",
            Status::Done,
            false
        )
    );
    assert_eq!(
        row(1_002),
        (6_400, 7_616, "Then we ate.", "VI: Then we ate.", Status::Done, false)
    );
    assert_eq!(
        row(1_003),
        (9_088, 10_112, "xin chào mọi người", "", Status::SameLang, false)
    );
    assert_eq!(
        (
            metrics.segments,
            metrics.filtered,
            metrics.same_lang,
            metrics.merges,
            metrics.dropped
        ),
        (5, 1, 1, 1, 0)
    );
    assert_eq!(
        metrics.translated_speech_ms,
        (4_928 - 3_392) + (3_008 - 992) + (7_616 - 6_400)
    );
    assert!(!sink.levels.lock().unwrap().is_empty(), "có mức âm lượng cho giao diện");
    assert!(
        !sink
            .events()
            .iter()
            .any(|e| matches!(e, Ev::Indicators(i) if i.lagging || i.no_audio)),
        "không trễ, và 1,5 giây im lặng chưa phải \"không có âm thanh\""
    );
    assert!(!sink.events().iter().any(|e| matches!(e, Ev::Fatal(_))));

    // Log của cả phiên không có chữ chép lời hay bản dịch nào.
    let log = LOG.0.lock().unwrap().join("\n");
    for secret in ["market", "we ate", "xin chào", "Thank you"] {
        assert!(!log.contains(secret), "log lộ \"{secret}\":\n{log}");
    }
}

#[test]
fn a_segment_that_keeps_crashing_the_worker_is_shown_as_dropped() {
    let t = Temp::new("dropped");
    let clock = Arc::new(FakeClock::default());
    let manager = manager(&t, &["en\tHello there."], &["crash_on:1", "crash_on:1", "ok"], clock);
    let samples = audio(&[
        (false, 500),
        (true, 1_000),
        (false, 1_500),
        (true, 1_000),
        (false, 1_500),
    ]);
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en"]),
        source(samples),
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    let metrics = engine.join();
    let (ui, order) = sink.replay();
    assert_eq!(order, [1_000, 1_001]);
    assert_eq!(ui[&1_000].status, Status::Dropped);
    assert_eq!(ui[&1_001].status, Status::Done);
    assert_eq!(metrics.dropped, 1);
}

#[test]
fn a_worker_that_keeps_crashing_stops_the_session_with_an_error() {
    let t = Temp::new("fatal");
    let clock = Arc::new(FakeClock::default());
    let manager = manager(&t, &["en\tHello."], &["crash_on:1"; 7], clock);
    let samples = audio(&[
        (false, 500),
        (true, 1_000),
        (false, 1_500),
        (true, 1_000),
        (false, 1_500),
        (true, 1_000),
        (false, 1_500),
    ]);
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en"]),
        source(samples),
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    engine.join();
    let fatal: Vec<String> = sink
        .events()
        .into_iter()
        .filter_map(|e| match e {
            Ev::Fatal(r) => Some(r),
            _ => None,
        })
        .collect();
    assert_eq!(fatal.len(), 1, "{fatal:?}");
    assert!(fatal[0].contains("quá 5 lần"), "{}", fatal[0]);
}

#[test]
fn stop_ends_a_live_session_quickly() {
    let t = Temp::new("stop");
    let manager = manager(&t, &["en\tstill talking"], &[], Arc::new(SystemClock::default()));
    // Nguồn chạy đúng thời gian thực, dài 60 giây: chỉ dừng được bằng `stop`.
    let samples = audio(&[(true, 30_000), (false, 30_000)]);
    let live = Box::new(SampleSource::new(samples, 512, Duration::from_millis(32)));
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en"]),
        live,
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    std::thread::sleep(Duration::from_millis(500));
    let started = Instant::now();
    let metrics = engine.stop();
    assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    // Đoạn đang nói dở được chốt khi dừng và vẫn có phụ đề.
    assert_eq!(metrics.segments, 1);
    let (ui, _) = sink.replay();
    assert_eq!(ui.len(), 1);
}
```

Sửa `crates/pipeline/tests/lifecycle.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/tests/lifecycle.rs
+++ b/crates/pipeline/tests/lifecycle.rs
@@ -122,8 +122,9 @@
             shutdown_grace_ms: 1_000,
             ..SupervisorConfig::default()
         },
+        // Rộng, để máy bận không làm test đỏ; ca worker treo nằm ở `clients.rs`.
         asr_config: AsrConfig {
-            timeout_ms: 1_000,
+            timeout_ms: 10_000,
             ..AsrConfig::default()
         },
         mt_config: MtConfig::default(),
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --test engine`
Expected: biên dịch lỗi:

```text
error[E0432]: unresolved imports `pipeline::engine::EnergyVad`, `pipeline::engine::Engine`, `pipeline::engine::EngineConfig`, `pipeline::engine::EventSink`, `pipeline::engine::Fatal`, `pipeline::engine::Indicators`, `pipeline::engine::SampleSource`, `pipeline::engine::VadFactory`
```

- [ ] **Step 4: Viết code**

Thêm vào `crates/pipeline/src/engine.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::{AudioConfig, FilterConfig, MtConfig, PipelineConfig};
use crate::filter::{Verdict, pcm_skip, verdict};
use crate::metrics::SessionMetrics;
use crate::prompt::{Lang, translation_prompt};
use crate::prompt_history::PromptHistory;
use crate::queue::{AsrQueue, MtItem, MtQueue, PendingSegment, Popped, Ready};
use crate::segmenter::{FRAME_MS, FRAME_SAMPLES, Segmenter};
use crate::sentence::{OpenSentence, Piece, merge_window_ms};
use crate::subtitle::{Delta, Status, Subtitle};
use crate::supervisor::{Asr, AsrFailure};
use crate::text::display_text;
use crate::translate::{Event, Job, Mt, Outcome, translate};
use crate::vad::SileroVad;
use anyhow::Result;
use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// Stack của luồng VAD (§6.3: từ 4 MiB).
const VAD_STACK_BYTES: usize = 8 << 20;
/// Luồng VAD gửi giờ âm thanh cho luồng phụ đề sau mỗi chừng này khung (96 ms).
const CLOCK_EVERY_FRAMES: u64 = 3;
/// Khi dừng phiên: câu đang dịch được chờ thêm chừng này rồi mới hủy.
const STOP_GRACE: Duration = Duration::from_secs(2);

#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub pipeline: PipelineConfig,
    /// Mã ngôn ngữ Whisper được phép; một phần tử là khóa ngôn ngữ (F2).
    pub languages: Vec<String>,
    pub target: Lang,
    /// Cờ thử nghiệm `experimental.translationContext` (§6.5), mặc định tắt.
    pub translation_context: bool,
    /// Cộng vào id của mọi phụ đề, để id không trùng giữa các phiên của cùng một lần chạy app.
    pub id_base: u64,
}

/// Nguồn âm thanh 16 kHz mono.
pub trait FrameSource: Send {
    /// Thêm mẫu mới vào `out`, chờ tối đa `timeout` nếu chưa có. `Ok(false)`: hết luồng.
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool>;
}

/// Mẫu có sẵn trong bộ nhớ (file WAV), phát theo từng khối. `pace`: chờ giữa hai khối, để phát gần thời gian thực.
pub struct SampleSource {
    samples: Vec<f32>,
    pos: usize,
    chunk: usize,
    pace: Duration,
}

impl SampleSource {
    pub fn new(samples: Vec<f32>, chunk: usize, pace: Duration) -> Self {
        Self {
            samples,
            pos: 0,
            chunk: chunk.max(1),
            pace,
        }
    }
}

impl FrameSource for SampleSource {
    fn read(&mut self, out: &mut Vec<f32>, _timeout: Duration) -> Result<bool> {
        if self.pos >= self.samples.len() {
            return Ok(false);
        }
        if !self.pace.is_zero() {
            std::thread::sleep(self.pace);
        }
        let end = (self.pos + self.chunk).min(self.samples.len());
        out.extend_from_slice(&self.samples[self.pos..end]);
        self.pos = end;
        Ok(true)
    }
}

/// Xác suất có tiếng nói của một khung 512 mẫu.
pub trait VadModel {
    fn prob(&mut self, frame: &[f32]) -> Result<f32>;
}

impl VadModel for SileroVad {
    fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        SileroVad::prob(self, frame)
    }
}

/// VAD theo năng lượng, cho test không cần model: RMS của khung vượt ngưỡng là tiếng nói.
pub struct EnergyVad {
    pub threshold_rms: f32,
}

impl VadModel for EnergyVad {
    fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        Ok(if rms(frame) > self.threshold_rms { 0.9 } else { 0.0 })
    }
}

/// Dựng VAD trên chính luồng VAD (Silero phải được tạo và chạy trên luồng có stack lớn, §6.3).
pub type VadFactory = Box<dyn FnOnce() -> Result<Box<dyn VadModel>> + Send>;

fn rms(frame: &[f32]) -> f32 {
    (frame.iter().map(|x| x * x).sum::<f32>() / frame.len().max(1) as f32).sqrt()
}

/// Chỉ báo nhỏ của thanh phụ đề (§4.4, §9).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Indicators {
    /// Độ trễ vượt `lag_warn_ms` (6 giây): "Đang trễ".
    pub lagging: bool,
    /// Hơn 60 giây không có âm thanh vào: "Không nghe thấy âm thanh".
    pub no_audio: bool,
    /// `llama-server` không dùng được: phụ đề chỉ hiện câu gốc.
    pub translation_unavailable: bool,
}

/// Lỗi làm phiên phải dừng.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fatal {
    /// Không nạp được VAD.
    Vad,
    /// `asr-worker` không dùng được nữa (lỗi quá 5 lần trong 10 phút, §6.4).
    Asr,
}

/// Nơi nhận kết quả của pipeline. Gọi từ các luồng của engine.
pub trait EventSink: Send + Sync {
    fn subtitle(&self, subtitle: &Subtitle);
    fn delta(&self, delta: &Delta);
    /// Mức âm lượng vào (RMS, 0 tới 1), mỗi `level_interval_ms`.
    fn level(&self, rms: f32);
    fn indicators(&self, indicators: &Indicators);
    /// Phiên phải dừng và báo lỗi (§9). Gọi từ luồng của engine: đừng dừng engine ngay trong hàm này.
    fn fatal(&self, kind: Fatal, reason: &str);
}

/// Đếm thời gian im lặng liên tục (RMS dưới ngưỡng), kể cả phần im lặng được chèn khi Windows không trả gói dữ liệu (§9).
#[derive(Debug)]
pub struct SilenceMonitor {
    silent_ms: u64,
    cfg: AudioConfig,
}

impl SilenceMonitor {
    pub fn new(cfg: AudioConfig) -> Self {
        Self { silent_ms: 0, cfg }
    }

    /// Một khung; trả `true` khi đã im lặng từ `no_audio_after_ms` trở lên.
    pub fn push(&mut self, frame_rms: f32, frame_ms: u64) -> bool {
        if frame_rms < self.cfg.silent_rms {
            self.silent_ms += frame_ms;
        } else {
            self.silent_ms = 0;
        }
        self.silent_ms >= self.cfg.no_audio_after_ms
    }
}

enum AsrOutcome {
    Transcribed {
        ids: Vec<u64>,
        start_ms: u64,
        end_ms: u64,
        lang: String,
        text: String,
        asr_ms: f32,
    },
    /// Luật bỏ đoạn loại (không có tiếng nói, câu ảo giác, quá ngắn): không phụ đề, không cắt chuỗi ghép câu.
    Filtered {
        ids: Vec<u64>,
    },
    Dropped {
        ids: Vec<u64>,
        start_ms: u64,
        end_ms: u64,
    },
    Unavailable(String),
}

enum Msg {
    Queued {
        id: u64,
        start_ms: u64,
        end_ms: u64,
        closed_ms: u64,
    },
    Clock {
        now_ms: u64,
        speech_since: Option<u64>,
    },
    NoAudio(bool),
    Asr(AsrOutcome),
    AsrDone,
    MtDelta {
        sub_id: u64,
        version: u32,
        text: String,
    },
    MtRetry {
        sub_id: u64,
        version: u32,
    },
    MtDone {
        sub_id: u64,
        version: u32,
        outcome: Outcome,
    },
}

struct MtJob {
    sub_id: u64,
    version: u32,
    src: Lang,
    text: String,
    context: Option<String>,
    cancel: Arc<AtomicBool>,
}

/// Hàng đợi nhận dạng dùng chung giữa luồng VAD và luồng nhận dạng.
struct SharedQueue {
    state: Mutex<(AsrQueue, bool)>,
    ready: Condvar,
}

impl SharedQueue {
    fn push(&self, segment: PendingSegment) {
        self.state.lock().unwrap().0.push(segment);
        self.ready.notify_one();
    }

    fn close(&self) {
        self.state.lock().unwrap().1 = true;
        self.ready.notify_one();
    }

    /// Chờ đoạn kế tiếp; `None` khi đã đóng và hết đoạn.
    fn pop(&self, now_ms: &AtomicU64) -> Option<Popped> {
        let mut state = self.state.lock().unwrap();
        loop {
            if let Some(p) = state.0.pop(now_ms.load(Ordering::SeqCst)) {
                return Some(p);
            }
            if state.1 {
                return None;
            }
            state = self.ready.wait(state).unwrap();
        }
    }
}

pub struct Engine {
    stop: Arc<AtomicBool>,
    hurry: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
    composer: Option<JoinHandle<SessionMetrics>>,
}

impl Engine {
    pub fn start(
        cfg: EngineConfig,
        source: Box<dyn FrameSource>,
        vad: VadFactory,
        asr: Box<dyn Asr>,
        mt: Box<dyn Mt>,
        sink: Arc<dyn EventSink>,
    ) -> Result<Self> {
        let stop = Arc::new(AtomicBool::new(false));
        let hurry = Arc::new(AtomicBool::new(false));
        let now_ms = Arc::new(AtomicU64::new(0));
        let queue = Arc::new(SharedQueue {
            state: Mutex::new((AsrQueue::new(cfg.pipeline.queue.clone()), false)),
            ready: Condvar::new(),
        });
        let (tx, rx) = mpsc::channel::<Msg>();
        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();

        let vad_thread = {
            let (stop, now_ms, queue, tx, sink) =
                (stop.clone(), now_ms.clone(), queue.clone(), tx.clone(), sink.clone());
            let pipeline = cfg.pipeline.clone();
            std::thread::Builder::new()
                .name("vad".into())
                .stack_size(VAD_STACK_BYTES)
                .spawn(move || vad_loop(source, vad, &pipeline, &queue, &tx, &*sink, &now_ms, &stop))?
        };
        let asr_thread = {
            let (queue, tx, now_ms) = (queue.clone(), tx.clone(), now_ms.clone());
            let (filter, languages) = (cfg.pipeline.filter.clone(), cfg.languages.clone());
            let max_prompt = cfg.pipeline.asr.max_prompt_tokens;
            std::thread::Builder::new()
                .name("asr".into())
                .spawn(move || asr_loop(asr, &queue, &tx, &now_ms, &filter, languages, max_prompt))?
        };
        let mt_thread = {
            let (tx, mt_cfg, target) = (tx.clone(), cfg.pipeline.mt.clone(), cfg.target);
            std::thread::Builder::new()
                .name("mt".into())
                .spawn(move || mt_loop(mt, jobs_rx, &tx, &mt_cfg, target))?
        };
        drop(tx);
        let composer = {
            let hurry = hurry.clone();
            std::thread::Builder::new()
                .name("subtitles".into())
                .spawn(move || Composer::new(cfg, sink, jobs_tx, hurry).run(rx))?
        };
        Ok(Self {
            stop,
            hurry,
            threads: vec![vad_thread, asr_thread, mt_thread],
            composer: Some(composer),
        })
    }

    /// Dừng phiên (bấm Dừng): luồng VAD chốt đoạn đang dở, các đoạn đang chờ vẫn được chép lời; câu chờ dịch thì bỏ bước
    /// dịch (`skipped`), câu đang dịch được chờ tối đa 2 giây. Trả số đo của phiên.
    pub fn stop(mut self) -> SessionMetrics {
        self.hurry.store(true, Ordering::SeqCst);
        self.stop.store(true, Ordering::SeqCst);
        self.finish()
    }

    /// Chờ tới khi nguồn âm thanh tự hết và mọi đoạn đã xử lý xong (phát file WAV).
    pub fn join(mut self) -> SessionMetrics {
        self.finish()
    }

    fn finish(&mut self) -> SessionMetrics {
        let metrics = self
            .composer
            .take()
            .map(|c| c.join().unwrap_or_default())
            .unwrap_or_default();
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
        metrics
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        if self.composer.is_some() {
            self.hurry.store(true, Ordering::SeqCst);
            self.stop.store(true, Ordering::SeqCst);
            self.finish();
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn vad_loop(
    mut source: Box<dyn FrameSource>,
    vad: VadFactory,
    cfg: &PipelineConfig,
    queue: &SharedQueue,
    tx: &Sender<Msg>,
    sink: &dyn EventSink,
    now_ms: &AtomicU64,
    stop: &AtomicBool,
) {
    let mut vad = match vad() {
        Ok(v) => v,
        Err(e) => {
            log::error!("không nạp được VAD: {e:#}");
            sink.fatal(Fatal::Vad, &format!("không nạp được VAD: {e:#}"));
            queue.close();
            return;
        }
    };
    let mut segmenter = Segmenter::new(cfg.segmenter.clone());
    let mut silence = SilenceMonitor::new(cfg.audio.clone());
    let level_frames = (cfg.audio.level_interval_ms / FRAME_MS).max(1);
    let (mut buf, mut frames, mut no_audio) = (Vec::new(), 0u64, false);
    let mut level_sum = 0.0f32;
    let send_segment = |seg: crate::segmenter::Segment, closed_ms: u64| {
        let _ = tx.send(Msg::Queued {
            id: seg.id,
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            closed_ms,
        });
        queue.push(PendingSegment {
            ids: vec![seg.id],
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            samples: seg.samples,
        });
    };
    'outer: while !stop.load(Ordering::SeqCst) {
        match source.read(&mut buf, Duration::from_millis(20)) {
            Ok(true) => {}
            Ok(false) => break,
            Err(e) => {
                log::warn!("nguồn âm thanh lỗi: {e:#}");
                break;
            }
        }
        let mut consumed = 0;
        while buf.len() - consumed >= FRAME_SAMPLES {
            let frame = &buf[consumed..consumed + FRAME_SAMPLES];
            consumed += FRAME_SAMPLES;
            frames += 1;
            let now = frames * FRAME_MS;
            now_ms.store(now, Ordering::SeqCst);
            let frame_rms = rms(frame);
            level_sum += frame_rms;
            if frames.is_multiple_of(level_frames) {
                sink.level(level_sum / level_frames as f32);
                level_sum = 0.0;
            }
            let silent = silence.push(frame_rms, FRAME_MS);
            if silent != no_audio {
                no_audio = silent;
                let _ = tx.send(Msg::NoAudio(silent));
            }
            let prob = match vad.prob(frame) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("VAD lỗi: {e:#}");
                    break 'outer;
                }
            };
            for seg in segmenter.push(frame, prob) {
                send_segment(seg, now);
            }
            if frames.is_multiple_of(CLOCK_EVERY_FRAMES) {
                let _ = tx.send(Msg::Clock {
                    now_ms: now,
                    speech_since: segmenter.open_start_ms(),
                });
            }
        }
        buf.drain(..consumed);
    }
    if let Some(seg) = segmenter.flush() {
        send_segment(seg, frames * FRAME_MS);
    }
    let _ = tx.send(Msg::Clock {
        now_ms: frames * FRAME_MS,
        speech_since: None,
    });
    queue.close();
}

fn asr_loop(
    mut asr: Box<dyn Asr>,
    queue: &SharedQueue,
    tx: &Sender<Msg>,
    now_ms: &AtomicU64,
    filter: &FilterConfig,
    languages: Vec<String>,
    max_prompt_tokens: usize,
) {
    let mut history = PromptHistory::new(max_prompt_tokens);
    // Ngôn ngữ của đoạn được giữ lại gần nhất (§6.4). Khóa ngôn ngữ thì luôn là ngôn ngữ đó.
    let mut prev_lang = (languages.len() == 1).then(|| languages[0].clone());
    while let Some(popped) = queue.pop(now_ms) {
        let segment = match popped {
            Popped::Segment(s) => s,
            Popped::Dropped(s) => {
                let _ = tx.send(Msg::Asr(AsrOutcome::Dropped {
                    ids: s.ids,
                    start_ms: s.start_ms,
                    end_ms: s.end_ms,
                }));
                continue;
            }
        };
        if pcm_skip(segment.samples.len()).is_some() {
            let _ = tx.send(Msg::Asr(AsrOutcome::Filtered { ids: segment.ids }));
            continue;
        }
        let pcm: Vec<i16> = segment
            .samples
            .iter()
            .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect();
        let req = TranscribeRequest {
            segment_id: segment.ids[0],
            audio_ctx: audio_ctx_for_samples(pcm.len()),
            prompt_tokens: history.prompt_for(prev_lang.as_deref(), pcm.len()),
            pcm,
            languages: languages.clone(),
            prev_lang: prev_lang.clone(),
        };
        let outcome = match asr.transcribe(req) {
            Ok(r) => {
                let text = display_text(&r.lang, &r.text, filter);
                match verdict(r.no_speech_prob, r.avg_logprob, &text, filter) {
                    Verdict::Speech => {
                        history.push(&r.lang, &r.tokens);
                        prev_lang = Some(r.lang.clone());
                        AsrOutcome::Transcribed {
                            ids: segment.ids,
                            start_ms: segment.start_ms,
                            end_ms: segment.end_ms,
                            lang: r.lang,
                            text,
                            asr_ms: r.asr_ms + r.lid_ms,
                        }
                    }
                    Verdict::NoSpeech | Verdict::Hallucination => AsrOutcome::Filtered { ids: segment.ids },
                }
            }
            Err(AsrFailure::Dropped(reason)) => {
                log::warn!("bỏ đoạn {:?}: {reason}", segment.ids);
                AsrOutcome::Dropped {
                    ids: segment.ids,
                    start_ms: segment.start_ms,
                    end_ms: segment.end_ms,
                }
            }
            Err(AsrFailure::Unavailable(reason)) => {
                let _ = tx.send(Msg::Asr(AsrOutcome::Unavailable(reason)));
                break;
            }
        };
        let _ = tx.send(Msg::Asr(outcome));
    }
    let _ = tx.send(Msg::AsrDone);
}

fn mt_loop(mut mt: Box<dyn Mt>, jobs: Receiver<MtJob>, tx: &Sender<Msg>, cfg: &MtConfig, target: Lang) {
    // Làm nóng khi bắt đầu phiên (§6.5); lỗi ở đây không quan trọng, request thật sẽ báo lỗi của nó.
    let warmup = translation_prompt("Hello.", Lang::En, target);
    let req = crate::llama::ChatRequest {
        prompt: &warmup,
        max_tokens: 32,
        repeat_penalty: cfg.repeat_penalty,
    };
    if let Err(e) = mt.stream(&req, &mut |_| ControlFlow::Continue(())) {
        log::warn!("làm nóng llama-server lỗi: {e}");
    }
    for job in jobs {
        let (sub_id, version) = (job.sub_id, job.version);
        let request = Job {
            text: &job.text,
            src: job.src,
            tgt: target,
            context: job.context.as_deref(),
        };
        let outcome = translate(&mut *mt, &request, cfg, &mut |event| {
            if job.cancel.load(Ordering::SeqCst) {
                return ControlFlow::Break(());
            }
            let msg = match event {
                Event::Delta(text) => Msg::MtDelta {
                    sub_id,
                    version,
                    text: text.to_string(),
                },
                Event::Retry => Msg::MtRetry { sub_id, version },
            };
            match tx.send(msg) {
                Ok(()) => ControlFlow::Continue(()),
                Err(_) => ControlFlow::Break(()),
            }
        });
        let _ = tx.send(Msg::MtDone {
            sub_id,
            version,
            outcome,
        });
    }
}

struct SubState {
    sub: Subtitle,
    version: u32,
    /// Câu đã chốt (không còn là câu đang mở).
    closed: bool,
}

struct InFlight {
    sub_id: u64,
    version: u32,
    cancel: Arc<AtomicBool>,
    started: Instant,
}

struct Composer {
    cfg: EngineConfig,
    sink: Arc<dyn EventSink>,
    jobs: Option<Sender<MtJob>>,
    hurry: Arc<AtomicBool>,
    window_ms: u64,
    now_ms: u64,
    speech_since: Option<u64>,
    /// Đoạn đã chốt ở VAD, chưa có kết quả nhận dạng: id → (start_ms, end_ms).
    pending: BTreeMap<u64, (u64, u64)>,
    open: Option<(OpenSentence, u64)>,
    subs: HashMap<u64, SubState>,
    queue: MtQueue,
    in_flight: Option<InFlight>,
    mt_unavailable: bool,
    indicators: Indicators,
    /// Câu gốc đã chốt gần nhất theo ngôn ngữ, cho cờ ngữ cảnh.
    previous: HashMap<String, String>,
    metrics: SessionMetrics,
    asr_done: bool,
}

impl Composer {
    fn new(cfg: EngineConfig, sink: Arc<dyn EventSink>, jobs: Sender<MtJob>, hurry: Arc<AtomicBool>) -> Self {
        let window_ms = merge_window_ms(cfg.pipeline.segmenter.end_silence_ms, &cfg.pipeline.merge);
        let queue = MtQueue::new(cfg.pipeline.queue.clone());
        Self {
            cfg,
            sink,
            jobs: Some(jobs),
            hurry,
            window_ms,
            now_ms: 0,
            speech_since: None,
            pending: BTreeMap::new(),
            open: None,
            subs: HashMap::new(),
            queue,
            in_flight: None,
            mt_unavailable: false,
            indicators: Indicators::default(),
            previous: HashMap::new(),
            metrics: SessionMetrics::default(),
            asr_done: false,
        }
    }

    fn run(mut self, rx: Receiver<Msg>) -> SessionMetrics {
        loop {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(msg) => self.handle(msg),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            self.check_hurry();
            self.dispatch();
            if self.asr_done && self.in_flight.is_none() && self.queue.is_empty() {
                break;
            }
        }
        self.finish_open();
        drop(self.jobs.take()); // luồng dịch thoát
        log::info!("phiên dịch kết thúc: {}", self.metrics.summary());
        self.metrics
    }

    fn handle(&mut self, msg: Msg) {
        match msg {
            Msg::Queued {
                id,
                start_ms,
                end_ms,
                closed_ms,
            } => {
                self.metrics.segments += 1;
                self.metrics.vad_ms.push(closed_ms.saturating_sub(end_ms) as f32);
                self.pending.insert(id, (start_ms, end_ms));
            }
            Msg::Clock { now_ms, speech_since } => {
                self.now_ms = now_ms;
                self.speech_since = speech_since;
                self.close_open_after_window();
                self.update_lag();
            }
            Msg::NoAudio(no_audio) => {
                self.indicators.no_audio = no_audio;
                self.sink.indicators(&self.indicators);
            }
            Msg::Asr(outcome) => self.on_asr(outcome),
            Msg::AsrDone => {
                self.asr_done = true;
                self.finish_open();
            }
            Msg::MtDelta { sub_id, version, text } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    state.sub.tgt_text.push_str(&text);
                    self.sink.delta(&Delta { id: sub_id, text });
                }
            }
            Msg::MtRetry { sub_id, version } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    state.sub.tgt_text.clear();
                    self.sink.subtitle(&state.sub);
                }
            }
            Msg::MtDone {
                sub_id,
                version,
                outcome,
            } => self.on_mt_done(sub_id, version, outcome),
        }
    }

    /// Tin nhắn của luồng dịch thuộc đúng câu đang dịch, và câu chưa đổi từ lúc gửi dịch.
    fn is_current(&self, sub_id: u64, version: u32) -> bool {
        self.in_flight
            .as_ref()
            .is_some_and(|f| f.sub_id == sub_id && f.version == version)
            && self.subs.get(&sub_id).is_some_and(|s| s.version == version)
    }

    fn on_asr(&mut self, outcome: AsrOutcome) {
        match outcome {
            AsrOutcome::Transcribed {
                ids,
                start_ms,
                end_ms,
                lang,
                text,
                asr_ms,
            } => {
                for id in &ids {
                    self.pending.remove(id);
                }
                self.metrics.asr_ms.push(asr_ms);
                let piece = Piece {
                    start_ms,
                    end_ms,
                    lang: &lang,
                    text: &text,
                };
                if lang == self.cfg.target.code() {
                    self.finish_open();
                    self.metrics.same_lang += 1;
                    let sub = Subtitle {
                        id: self.cfg.id_base + ids[0],
                        start_ms,
                        end_ms,
                        src_lang: lang.clone(),
                        src_text: text.clone(),
                        tgt_text: String::new(),
                        status: Status::SameLang,
                        provisional: false,
                        replaces: Vec::new(),
                    };
                    self.sink.subtitle(&sub);
                    return;
                }
                self.metrics.translated_speech_ms += end_ms.saturating_sub(start_ms);
                let window = self.window_ms;
                if let Some((open, sub_id)) = self.open.as_mut().filter(|(o, _)| o.accepts(&piece, window)) {
                    open.push(&piece);
                    let (sub_id, closed, joined) = (*sub_id, open.is_closed(), open.text().to_string());
                    self.metrics.merges += 1;
                    self.grow(sub_id, &joined, end_ms, closed);
                    if closed {
                        self.finish_open();
                    }
                } else {
                    self.finish_open();
                    let open = OpenSentence::new(&piece, &self.cfg.pipeline.merge);
                    let sub_id = self.cfg.id_base + ids[0];
                    let closed = open.is_closed();
                    let sub = Subtitle {
                        id: sub_id,
                        start_ms,
                        end_ms,
                        src_lang: lang.clone(),
                        src_text: text.clone(),
                        tgt_text: String::new(),
                        status: Status::AsrDone,
                        provisional: !closed,
                        replaces: Vec::new(),
                    };
                    self.sink.subtitle(&sub);
                    self.subs.insert(
                        sub_id,
                        SubState {
                            sub,
                            version: 1,
                            closed,
                        },
                    );
                    self.enqueue(sub_id, 1, false);
                    if closed {
                        self.remember_previous(&lang, &text);
                    } else {
                        self.open = Some((open, sub_id));
                    }
                }
            }
            AsrOutcome::Filtered { ids } => {
                self.metrics.filtered += 1;
                for id in &ids {
                    self.pending.remove(id);
                }
            }
            AsrOutcome::Dropped { ids, start_ms, end_ms } => {
                self.metrics.dropped += 1;
                for id in &ids {
                    self.pending.remove(id);
                }
                // Mất âm thanh giữa chừng thì không ghép câu qua chỗ đó.
                self.finish_open();
                self.sink.subtitle(&Subtitle {
                    id: self.cfg.id_base + ids[0],
                    start_ms,
                    end_ms,
                    src_lang: String::new(),
                    src_text: String::new(),
                    tgt_text: String::new(),
                    status: Status::Dropped,
                    provisional: false,
                    replaces: Vec::new(),
                });
            }
            AsrOutcome::Unavailable(reason) => {
                log::error!("asr-worker không dùng được: {reason}");
                self.sink.fatal(Fatal::Asr, &reason);
            }
        }
    }

    /// Câu đang mở vừa được ghép thêm một đoạn: gửi lại phụ đề (tạm), và dịch lại cả câu.
    fn grow(&mut self, sub_id: u64, text: &str, end_ms: u64, closed: bool) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        state.version += 1;
        state.closed = closed;
        state.sub.src_text = text.to_string();
        state.sub.end_ms = end_ms;
        state.sub.tgt_text.clear();
        state.sub.status = Status::AsrDone;
        state.sub.provisional = !closed;
        let version = state.version;
        self.sink.subtitle(&state.sub);
        let in_flight = self.in_flight.as_ref().is_some_and(|f| f.sub_id == sub_id);
        if in_flight {
            // Bản dịch của câu cũ không còn đúng: hủy, đưa câu mới lên đầu hàng.
            if let Some(f) = &self.in_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            self.enqueue(sub_id, version, true);
        } else if !self.queue.update(sub_id, text, end_ms, version) {
            self.enqueue(sub_id, version, false);
        }
    }

    fn enqueue(&mut self, sub_id: u64, version: u32, front: bool) {
        let Some(state) = self.subs.get(&sub_id) else { return };
        let item = MtItem {
            sub_id,
            version,
            lang: state.sub.src_lang.clone(),
            text: state.sub.src_text.clone(),
            start_ms: state.sub.start_ms,
            end_ms: state.sub.end_ms,
            enqueued_ms: self.now_ms,
            open: !state.closed,
            replaces: state.sub.replaces.clone(),
        };
        if front {
            self.queue.push_front(item);
            return;
        }
        for merged in self.queue.push(item) {
            let absorbed: Vec<u64> = merged.replaces.clone();
            for id in &absorbed {
                self.subs.remove(id);
            }
            if let Some(state) = self.subs.get_mut(&merged.sub_id) {
                state.version = merged.version;
                state.sub.src_text = merged.text.clone();
                state.sub.end_ms = merged.end_ms;
                state.sub.replaces = merged.replaces.clone();
                self.sink.subtitle(&state.sub);
            }
        }
    }

    /// Chốt câu đang mở: không còn là phụ đề tạm.
    fn finish_open(&mut self) {
        let Some((open, sub_id)) = self.open.take() else { return };
        self.queue.close(sub_id);
        self.remember_previous(open.lang(), open.text());
        if let Some(state) = self.subs.get_mut(&sub_id) {
            state.closed = true;
            if state.sub.provisional {
                state.sub.provisional = false;
                self.sink.subtitle(&state.sub);
            }
            if matches!(state.sub.status, Status::Done | Status::Failed | Status::Skipped) {
                self.subs.remove(&sub_id);
            }
        }
    }

    fn remember_previous(&mut self, lang: &str, text: &str) {
        self.previous.insert(lang.to_string(), text.to_string());
    }

    /// Hết cửa sổ ghép mà không có tiếng nói mới thì chốt câu đang mở (§6.3).
    fn close_open_after_window(&mut self) {
        let Some((open, _)) = &self.open else { return };
        let deadline = open.last_end_ms() + self.window_ms;
        let speech_inside = self.speech_since.is_some_and(|s| s <= deadline)
            || self.pending.values().any(|&(start, _)| start <= deadline);
        if self.now_ms > deadline && !speech_inside {
            self.finish_open();
        }
    }

    /// Độ trễ = giờ hiện tại trừ `end_ms` của đoạn cũ nhất còn đang xử lý (§7).
    fn update_lag(&mut self) {
        let oldest = self
            .pending
            .values()
            .map(|&(_, end)| end)
            .chain(self.queue.iter().map(|i| i.end_ms))
            .chain(
                self.in_flight
                    .as_ref()
                    .and_then(|f| self.subs.get(&f.sub_id))
                    .map(|s| s.sub.end_ms),
            )
            .min();
        let lagging = oldest.is_some_and(|end| self.now_ms.saturating_sub(end) > self.cfg.pipeline.queue.lag_warn_ms);
        if lagging != self.indicators.lagging {
            self.indicators.lagging = lagging;
            self.sink.indicators(&self.indicators);
        }
    }

    /// Đang dừng phiên: câu chờ dịch thì bỏ bước dịch, câu đang dịch quá `STOP_GRACE` thì hủy.
    fn check_hurry(&mut self) {
        if !self.hurry.load(Ordering::SeqCst) {
            return;
        }
        if let Some(f) = &self.in_flight
            && f.started.elapsed() > STOP_GRACE
        {
            f.cancel.store(true, Ordering::SeqCst);
        }
    }

    fn dispatch(&mut self) {
        while self.in_flight.is_none() {
            let hurry = self.hurry.load(Ordering::SeqCst);
            let item = match self.queue.pop(self.now_ms) {
                None => return,
                Some(Ready::Translate(item)) if !hurry && !self.mt_unavailable => item,
                Some(Ready::Translate(item) | Ready::Skip(item)) => {
                    let status = if self.mt_unavailable && !hurry {
                        Status::Failed
                    } else {
                        Status::Skipped
                    };
                    self.settle(item.sub_id, status, String::new());
                    continue;
                }
            };
            let Some(state) = self.subs.get_mut(&item.sub_id) else {
                continue;
            };
            state.sub.status = Status::Translating;
            state.sub.tgt_text.clear();
            self.sink.subtitle(&state.sub);
            let context = self
                .cfg
                .translation_context
                .then(|| self.previous.get(&item.lang).cloned())
                .flatten()
                .filter(|p| *p != item.text);
            let cancel = Arc::new(AtomicBool::new(false));
            let job = MtJob {
                sub_id: item.sub_id,
                version: item.version,
                src: Lang::from_code(&item.lang).unwrap_or(Lang::En),
                text: item.text,
                context,
                cancel: cancel.clone(),
            };
            self.in_flight = Some(InFlight {
                sub_id: item.sub_id,
                version: item.version,
                cancel,
                started: Instant::now(),
            });
            let sent = self.jobs.as_ref().is_some_and(|j| j.send(job).is_ok());
            if !sent {
                self.in_flight = None;
                self.settle(item.sub_id, Status::Failed, String::new());
            }
        }
    }

    fn on_mt_done(&mut self, sub_id: u64, version: u32, outcome: Outcome) {
        let ours = self
            .in_flight
            .as_ref()
            .is_some_and(|f| f.sub_id == sub_id && f.version == version);
        if !ours {
            return;
        }
        self.in_flight = None;
        if !self.subs.get(&sub_id).is_some_and(|s| s.version == version) {
            return; // câu đã được ghép thêm hay gộp: bản mới đang chờ dịch
        }
        match outcome {
            Outcome::Done(t) => {
                self.metrics.translated += 1;
                self.metrics.mt_ms.push(t.total_ms);
                self.settle(sub_id, Status::Done, t.text);
            }
            Outcome::Failed { reason, .. } => {
                log::warn!("dịch lỗi câu {sub_id}: {reason}");
                self.settle(sub_id, Status::Failed, String::new());
            }
            Outcome::Cancelled => self.settle(sub_id, Status::Skipped, String::new()),
            Outcome::Unavailable(reason) => {
                log::error!("llama-server không dùng được: {reason}");
                self.mt_unavailable = true;
                self.indicators.translation_unavailable = true;
                self.sink.indicators(&self.indicators);
                self.settle(sub_id, Status::Failed, String::new());
            }
        }
    }

    /// Kết thúc phần dịch của một phụ đề.
    fn settle(&mut self, sub_id: u64, status: Status, tgt_text: String) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        match status {
            Status::Failed => self.metrics.failed += 1,
            Status::Skipped => self.metrics.skipped += 1,
            Status::Done => self
                .metrics
                .latency_ms
                .push(self.now_ms.saturating_sub(state.sub.end_ms) as f32),
            _ => {}
        }
        state.sub.status = status;
        state.sub.tgt_text = tgt_text;
        self.sink.subtitle(&state.sub);
        if state.closed {
            self.subs.remove(&sub_id);
        }
    }
}
```

Sửa `crates/pipeline/src/segmenter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/segmenter.rs
+++ b/crates/pipeline/src/segmenter.rs
@@ -164,6 +164,12 @@
         out
     }
 
+    /// Mốc bắt đầu (ms) của đoạn đang mở, nếu có: có người đang nói. Luồng phụ đề dùng mốc này để biết tiếng nói đã tiếp
+    /// tục trong cửa sổ ghép câu chưa (§6.3), trước khi đoạn đó được chốt.
+    pub fn open_start_ms(&self) -> Option<u64> {
+        self.active.as_ref().map(|a| a.start_frame * FRAME_MS)
+    }
+
     /// Chốt đoạn đang dở khi hết luồng.
     pub fn flush(&mut self) -> Option<Segment> {
         let active = self.active.take()?;
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline`
Expected:

```text
test result: ok. 112 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.52s
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.11s
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.26s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-fc16c618e4b8f5a0)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-9dfc4bfd3d3f8afa)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-c38f44afa7fc4703)
     Running tests/clients.rs (target/debug/deps/clients-429936f3fc6661e8)
     Running tests/engine.rs (target/debug/deps/engine-edfb1de2e43120d9)
     Running tests/lifecycle.rs (target/debug/deps/lifecycle-72cb79e575bb1e0c)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-f0916b9001a6d4ad)
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline/src/engine.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/segmenter.rs \
  crates/pipeline/tests/engine.rs \
  crates/pipeline/tests/lifecycle.rs
git commit -m "feat(pipeline): engine của một phiên dịch: bốn luồng, phụ đề và sự kiện theo §6.6" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Clip FLEURS cho test tích hợp, test với model thật, công cụ đo `no_speech_prob`

Đ20 và dòng 115, 295:
- `tests/fixtures/audio/`: một file WAV ghép ba câu FLEURS (CC BY 4.0, ghi công trong `ATTRIBUTION.txt`) với khoảng lặng, cùng mốc thời gian của từng câu. Dựng lại bằng `build_fixture.py` từ bộ clip A4 có sẵn, cho ra đúng các byte đã commit.
- `tests/engine.rs` thêm test chạy pipeline từ file WAV đó, với VAD theo năng lượng và tiến trình phụ giả (chạy mặc định).
- `tests/real_sidecars.rs` (bỏ qua mặc định): cùng file, qua Silero, `asr-worker` và `llama-server` thật.
- `tests/no_speech.rs` (bỏ qua mặc định, QĐ22): tín hiệu không có tiếng nói qua `asr-worker` thật, cộng số đoạn VAD của app cắt ra.

**Files:**
- Test (sửa): `crates/pipeline/tests/engine.rs`
- Test (tạo): `crates/pipeline/tests/no_speech.rs`
- Test (tạo): `crates/pipeline/tests/real_sidecars.rs`
- Tạo: `tests/fixtures/audio/ATTRIBUTION.txt`
- Tạo: `tests/fixtures/audio/build_fixture.py`
- Tạo (script sinh ra): `tests/fixtures/audio/fleurs-en-en-vi.json`
- Tạo (script sinh ra): `tests/fixtures/audio/fleurs-en-en-vi.wav`

- [ ] **Step 1: Dựng clip**

Cần bộ clip A4 ở `bench/phase0/data/asr/` (dựng bằng `bench/phase0/asr/build_clips.py`, kế hoạch 0-03 Task 10; có sẵn trên máy dev).

Tạo `tests/fixtures/audio/ATTRIBUTION.txt`:

```text
fleurs-en-en-vi.wav ghép ba câu đọc của bộ dữ liệu FLEURS (tập dev), cách nhau bằng khoảng lặng:
- en-14159306883861268418 (tiếng Anh)
- en-6415341913845555034 (tiếng Anh)
- vi-12090846728876801190 (tiếng Việt)

FLEURS: Conneau và cộng sự, "FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech", 2022,
Google. Giấy phép Creative Commons Attribution 4.0 (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/.
Bản ở đây đã được sửa: cắt lặng đầu cuối (bench/phase0/asr/build_clips.py), rồi ghép và chèn khoảng lặng
(build_fixture.py). Chỉ dùng cho test, không vào bộ cài.
```

Tạo `tests/fixtures/audio/build_fixture.py`:

```python
"""Dựng clip cho test tích hợp của pipeline (kế hoạch 00, Đ20): ghép ba câu FLEURS (CC BY 4.0) với khoảng lặng.

Dùng (từ gốc repo, sau khi đã dựng bộ clip A4 bằng bench/phase0/asr/build_clips.py):
  python3 tests/fixtures/audio/build_fixture.py
Kết quả: tests/fixtures/audio/fleurs-en-en-vi.wav (16 kHz, mono, 16-bit) và fleurs-en-en-vi.json (mốc từng câu).
Chạy lại cho ra đúng các byte cũ.
"""
import json
import os
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CLIPS = os.path.join(ROOT, "bench", "phase0", "data", "asr")
RATE = 16_000
# (id của clip trong manifest A4, khoảng lặng trước clip, giây)
PARTS = [
    ("en-14159306883861268418", 1.0),
    ("en-6415341913845555034", 1.5),
    ("vi-12090846728876801190", 1.5),
]
TAIL_SECONDS = 1.5


def main():
    manifest = {r["id"]: r for r in map(json.loads, open(os.path.join(CLIPS, "manifest.jsonl"), encoding="utf-8"))}
    frames, truth = bytearray(), []
    for clip_id, gap in PARTS:
        frames += b"\0\0" * int(gap * RATE)
        row = manifest[clip_id]
        with wave.open(os.path.join(CLIPS, row["path"])) as w:
            assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (RATE, 1, 2), clip_id
            start = len(frames) // 2
            frames += w.readframes(w.getnframes())
        truth.append({"id": clip_id, "lang": row["lang"], "start_ms": start * 1000 // RATE,
                      "end_ms": (len(frames) // 2) * 1000 // RATE, "ref": row["ref"]})
    frames += b"\0\0" * int(TAIL_SECONDS * RATE)
    with wave.open(os.path.join(HERE, "fleurs-en-en-vi.wav"), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(bytes(frames))
    with open(os.path.join(HERE, "fleurs-en-en-vi.json"), "w", encoding="utf-8") as f:
        json.dump(truth, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(frames) // 2 / RATE:.2f} giây, {len(truth)} câu")


if __name__ == "__main__":
    main()
```

Run:
```bash
python3 tests/fixtures/audio/build_fixture.py
shasum -a 256 tests/fixtures/audio/fleurs-en-en-vi.wav
cat tests/fixtures/audio/fleurs-en-en-vi.json
```
Expected: 19,08 giây, ba câu, đúng SHA-256 này, và mốc như sau:

```text
$ python3 tests/fixtures/audio/build_fixture.py && shasum -a 256 tests/fixtures/audio/fleurs-en-en-vi.wav && git status --short tests/fixtures
19.08 giây, 3 câu
bfd08d5c999b5ea285c5f0ddc1056eb5c4634c52ec39cec84134fb4be3e0a706  tests/fixtures/audio/fleurs-en-en-vi.wav
```

```json
[
 {
  "id": "en-14159306883861268418",
  "lang": "en",
  "start_ms": 1000,
  "end_ms": 4960,
  "ref": "That didn't seem to make sense to me; it certainly wasn't fair."
 },
 {
  "id": "en-6415341913845555034",
  "lang": "en",
  "start_ms": 6460,
  "end_ms": 10840,
  "ref": "The result of plotting analysis will be posted to a public website."
 },
 {
  "id": "vi-12090846728876801190",
  "lang": "vi",
  "start_ms": 12340,
  "end_ms": 17580,
  "ref": "Các nhà khoa học cho biết vụ va chạm đã gây ra vụ nổ rất lớn."
 }
]
```

- [ ] **Step 2: Viết test**

Sửa `crates/pipeline/tests/engine.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/tests/engine.rs
+++ b/crates/pipeline/tests/engine.rs
@@ -8,7 +8,7 @@
 use pipeline::subtitle::{Delta, Status, Subtitle};
 use pipeline::supervisor::{AsrSpec, Clock, FakeClock, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
 use std::collections::BTreeMap;
-use std::path::PathBuf;
+use std::path::{Path, PathBuf};
 use std::sync::{Arc, Mutex, Once};
 use std::time::{Duration, Instant};
 
@@ -392,3 +392,63 @@
     let (ui, _) = sink.replay();
     assert_eq!(ui.len(), 1);
 }
+
+/// File WAV ở `tests/fixtures/audio/` (clip FLEURS, Đ20 của kế hoạch 00), qua VAD theo năng lượng và tiến trình phụ giả:
+/// mỗi câu có đúng một phụ đề, đúng thứ tự, nằm trong khoảng thời gian của câu (§11, "Test tích hợp"). Bản chạy model thật
+/// ở `real_sidecars.rs`.
+#[test]
+fn the_fleurs_fixture_gives_one_subtitle_per_sentence_at_the_right_time() {
+    #[derive(serde::Deserialize)]
+    struct Truth {
+        lang: String,
+        start_ms: u64,
+        end_ms: u64,
+    }
+    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/audio");
+    let truth: Vec<Truth> =
+        serde_json::from_reader(std::fs::File::open(fixtures.join("fleurs-en-en-vi.json")).unwrap()).unwrap();
+    let samples: Vec<f32> = hound::WavReader::open(fixtures.join("fleurs-en-en-vi.wav"))
+        .unwrap()
+        .samples::<i16>()
+        .map(|s| s.unwrap() as f32 / 32768.0)
+        .collect();
+    let t = Temp::new("fixture");
+    let texts = ["en\tFirst sentence.", "en\tSecond sentence.", "vi\tCâu thứ ba."];
+    let manager = manager(&t, &texts, &[], Arc::new(SystemClock::default()));
+    manager.ensure_started().unwrap();
+    let mut cfg = config(&["en", "vi"]);
+    // Id đoạn bắt đầu từ 0, để đoạn thứ i lấy dòng thứ i của `texts`.
+    cfg.id_base = 0;
+    // Câu đọc của FLEURS có chỗ nghỉ giữa chừng tới 1,1 giây; 1,2 giây giữ mỗi câu là một đoạn, mà vẫn ngắn hơn khoảng
+    // lặng 1,5 giây giữa các câu. VAD theo năng lượng thay cho Silero chỉ để test không cần model.
+    cfg.pipeline.segmenter.end_silence_ms = 1_200;
+    // Hai câu tiếng Anh thu rất nhỏ (khoảng −62 dBFS); khoảng lặng giữa các câu là số 0 tuyệt đối.
+    let vad: VadFactory = Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.000_2 }) as _));
+    let sink = Arc::new(Recorder::default());
+    let engine = Engine::start(
+        cfg,
+        source(samples),
+        vad,
+        Box::new(manager.asr()),
+        Box::new(manager.mt()),
+        sink.clone(),
+    )
+    .unwrap();
+    engine.join();
+    let (ui, order) = sink.replay();
+    assert_eq!(order.len(), truth.len(), "{ui:?}");
+    for (id, t) in order.iter().zip(&truth) {
+        let s = &ui[id];
+        // Như `real_sidecars.rs`: phụ đề nằm trong khoảng của câu (lệch tối đa 500 ms), và dài ít nhất nửa câu.
+        assert!(
+            s.start_ms + 500 >= t.start_ms
+                && s.end_ms <= t.end_ms + 500
+                && 2 * (s.end_ms - s.start_ms) >= t.end_ms - t.start_ms,
+            "{s:?} so với câu {}–{}",
+            t.start_ms,
+            t.end_ms
+        );
+        assert_eq!(s.src_lang, t.lang);
+        assert_eq!(s.status, if t.lang == "vi" { Status::SameLang } else { Status::Done });
+    }
+}
```

Tạo `crates/pipeline/tests/no_speech.rs`:

````rust
//! Việc cho MVP §6.4 (Đ12 của kế hoạch 00): `no_speech_prob` và `avg_logprob` của `asr-worker` thật trên âm thanh không có
//! tiếng nói, và luật lọc của app (`filter::verdict`) có bỏ được đoạn đó không. Đặt thêm `MT_VAD_MODEL` thì in cả số đoạn
//! mà VAD của app (Silero, luật cắt đoạn mặc định) cắt ra từ tín hiệu: 0 nghĩa là trong app tín hiệu đó không bao giờ tới
//! `asr-worker`. Tín hiệu tổng hợp: im lặng, nhiễu trắng,
//! nhiễu hồng, tiếng ù điện, tiếng gõ phím, hợp âm. Thêm file WAV bất kỳ (ví dụ clip nhạc có quyền dùng) qua
//! `NO_SPEECH_WAVS`, mỗi file 16 kHz mono 16-bit, cắt thành đoạn 8 giây như VAD (tối đa 10 đoạn mỗi file).
//!
//! Đây là phép thử để chọn ngưỡng, không phải test hồi quy: không kiểm theo số đo, chỉ kiểm worker trả kết quả cho mọi
//! đoạn. Cần binary và model nên bị bỏ qua mặc định. Chạy từ gốc repo, một lần cho mỗi model:
//!
//! ```text
//! MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-large-v3-turbo-q5_0.bin \
//! MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx NO_SPEECH_WAVS=<clip.wav,…> \
//! cargo test -p pipeline --test no_speech -- --include-ignored --nocapture
//! ```
//!
//! Đổi file nhạc sang đúng định dạng trên Mac: `afconvert -f WAVE -d LEI16@16000 -c 1 vào.m4a ra.wav`.
//! Mỗi đoạn in một dòng JSON; dòng cuối là các đoạn mà app sẽ hiện thành phụ đề: `verdict` là `Speech`, và VAD có cắt ra
//! đoạn (khi đặt `MT_VAD_MODEL`).

use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::{AsrLaunch, AsrWorker};
use pipeline::config::{FilterConfig, PipelineConfig};
use pipeline::filter::{Verdict, verdict};
use pipeline::segmenter::{FRAME_SAMPLES, Segmenter};
use pipeline::text::display_text;
use pipeline::vad::SileroVad;
use std::f32::consts::TAU;
use std::path::PathBuf;

const RATE: usize = 16_000;

/// Sinh số giả ngẫu nhiên tất định (xorshift), để mọi lần chạy cùng một tín hiệu.
struct Rng(u32);

impl Rng {
    /// Số thực trong [-1, 1).
    fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

fn scale_to_rms(mut x: Vec<f32>, rms: f32) -> Vec<f32> {
    let now = (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt();
    if now > 0.0 {
        x.iter_mut().for_each(|v| *v *= rms / now);
    }
    x
}

fn white(n: usize, rms: f32) -> Vec<f32> {
    let mut r = Rng(0x9e37_79b9);
    scale_to_rms((0..n).map(|_| r.next()).collect(), rms)
}

/// Nhiễu hồng theo bộ lọc của Paul Kellet (tiếng ồn nền kiểu quạt, điều hòa).
fn pink(n: usize, rms: f32) -> Vec<f32> {
    let mut r = Rng(0x85eb_ca6b);
    let mut b = [0.0f32; 7];
    let x = (0..n)
        .map(|_| {
            let w = r.next();
            b[0] = 0.99886 * b[0] + w * 0.0555179;
            b[1] = 0.99332 * b[1] + w * 0.0750759;
            b[2] = 0.96900 * b[2] + w * 0.153852;
            b[3] = 0.86650 * b[3] + w * 0.3104856;
            b[4] = 0.55000 * b[4] + w * 0.5329522;
            b[5] = -0.7616 * b[5] - w * 0.016898;
            let y = b.iter().sum::<f32>() + w * 0.5362;
            b[6] = w * 0.115926;
            y
        })
        .collect();
    scale_to_rms(x, rms)
}

/// Tiếng ù điện 50 Hz cùng các họa âm lẻ.
fn hum(n: usize, rms: f32) -> Vec<f32> {
    let x = (0..n)
        .map(|i| {
            let t = i as f32 / RATE as f32;
            [1.0, 3.0, 5.0, 7.0]
                .iter()
                .map(|k| (TAU * 50.0 * k * t).sin() / k)
                .sum()
        })
        .collect();
    scale_to_rms(x, rms)
}

/// Tiếng gõ phím: tiếng tách ngắn (nhiễu tắt dần trong 15 ms) cách nhau 120–250 ms.
fn typing(n: usize, rms: f32) -> Vec<f32> {
    let mut r = Rng(0xc2b2_ae35);
    let mut x = vec![0.0f32; n];
    let mut at = 0usize;
    while at < n {
        for (k, v) in x.iter_mut().skip(at).take(240).enumerate() {
            *v = r.next() * (-(k as f32) / 40.0).exp();
        }
        at += 1_920 + ((r.next() + 1.0) * 1_040.0) as usize;
    }
    scale_to_rms(x, rms)
}

/// Hợp âm La trưởng đổi nhịp mỗi nửa giây, có rung biên độ: thay cho nhạc khi chưa có clip.
fn chords(n: usize, rms: f32) -> Vec<f32> {
    let x = (0..n)
        .map(|i| {
            let t = i as f32 / RATE as f32;
            let root = if (i / (RATE / 2)).is_multiple_of(2) {
                220.0
            } else {
                293.66
            };
            let tremolo = 0.75 + 0.25 * (TAU * 5.0 * t).sin();
            [1.0, 1.26, 1.5].iter().map(|k| (TAU * root * k * t).sin()).sum::<f32>() * tremolo
        })
        .collect();
    scale_to_rms(x, rms)
}

fn signals() -> Vec<(String, Vec<f32>)> {
    let mut out = Vec::new();
    for secs in [3usize, 8] {
        let n = secs * RATE;
        out.push((format!("im lặng {secs}s"), vec![0.0; n]));
        out.push((format!("nhiễu trắng −60 dBFS {secs}s"), white(n, 0.001)));
        out.push((format!("nhiễu trắng −30 dBFS {secs}s"), white(n, 0.0316)));
        out.push((format!("nhiễu hồng −26 dBFS {secs}s"), pink(n, 0.05)));
        out.push((format!("ù điện 50 Hz −26 dBFS {secs}s"), hum(n, 0.05)));
        out.push((format!("gõ phím −30 dBFS {secs}s"), typing(n, 0.0316)));
        out.push((format!("hợp âm −20 dBFS {secs}s"), chords(n, 0.1)));
    }
    for path in std::env::var("NO_SPEECH_WAVS")
        .unwrap_or_default()
        .split(',')
        .filter(|p| !p.is_empty())
    {
        let mut reader = hound::WavReader::open(path).unwrap_or_else(|e| panic!("{path}: {e}"));
        let spec = reader.spec();
        assert!(
            spec.sample_rate == RATE as u32 && spec.channels == 1 && spec.bits_per_sample == 16,
            "{path}: cần 16 kHz mono 16-bit (xem đầu file)"
        );
        let x: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
        let name = std::path::Path::new(path)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        for (k, chunk) in x.chunks(8 * RATE).take(10).enumerate() {
            if chunk.len() >= RATE {
                out.push((format!("{name} #{k}"), chunk.to_vec()));
            }
        }
    }
    out
}

/// Số đoạn mà VAD và luật cắt đoạn mặc định của app cắt ra từ tín hiệu.
fn vad_segments(vad: &mut SileroVad, samples: &[f32]) -> usize {
    vad.reset().unwrap();
    let mut segmenter = Segmenter::new(PipelineConfig::default().segmenter);
    let mut n = 0;
    for frame in samples.as_chunks::<FRAME_SAMPLES>().0 {
        let prob = vad.prob(frame).unwrap();
        n += segmenter.push(frame, prob).len();
    }
    n + usize::from(segmenter.flush().is_some())
}

fn env(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("đặt {name}")))
}

#[test]
#[ignore = "cần model và binary thật, xem đầu file"]
fn no_speech_signals_through_the_real_worker() {
    // Silero chạy bằng candle cần stack lớn hơn mặc định của luồng test ở bản debug (như luồng VAD của engine).
    std::thread::Builder::new()
        .stack_size(8 << 20)
        .spawn(run)
        .unwrap()
        .join()
        .unwrap();
}

fn run() {
    let log = std::env::temp_dir().join(format!("pipeline-no-speech-{}.log", std::process::id()));
    let (mut worker, ready) = AsrWorker::spawn(&AsrLaunch::new(&env("MT_ASR_WORKER"), &env("MT_ASR_MODEL"), &log))
        .expect("asr-worker chạy được");
    println!("{{\"backend\":\"{}\"}}", ready.backend.as_str());
    let cfg = FilterConfig::default();
    let mut vad = std::env::var_os("MT_VAD_MODEL").map(|p| SileroVad::load(std::path::Path::new(&p)).unwrap());
    let all = signals();
    let mut shown = Vec::new();
    for (id, (name, samples)) in all.iter().enumerate() {
        let pcm: Vec<i16> = samples
            .iter()
            .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect();
        let r = worker
            .transcribe(TranscribeRequest {
                segment_id: id as u64,
                audio_ctx: audio_ctx_for_samples(pcm.len()),
                prompt_tokens: Vec::new(),
                pcm,
                languages: ["en", "zh", "ja", "ko", "vi"].map(String::from).to_vec(),
                prev_lang: None,
            })
            .unwrap_or_else(|e| panic!("{name}: {e}"));
        let text = display_text(&r.lang, &r.text, &cfg);
        let v = verdict(r.no_speech_prob, r.avg_logprob, &text, &cfg);
        let segments = vad.as_mut().map(|vad| vad_segments(vad, samples));
        println!(
            "{}",
            serde_json::json!({
                "signal": name, "lang": r.lang, "lang_prob": r.lang_prob, "no_speech_prob": r.no_speech_prob,
                "avg_logprob": r.avg_logprob, "verdict": format!("{v:?}"), "vad_segments": segments, "text": text,
            })
        );
        if v == Verdict::Speech && segments != Some(0) {
            shown.push(name.clone());
        }
    }
    println!(
        "{{\"segments\":{},\"shown_as_subtitle\":{},\"shown\":{:?}}}",
        all.len(),
        shown.len(),
        shown
    );
    let _ = std::fs::remove_file(&log);
}
````

Tạo `crates/pipeline/tests/real_sidecars.rs`:

````rust
//! Pipeline với tiến trình phụ và model thật, trên clip FLEURS ở `tests/fixtures/audio/` (Đ20 của kế hoạch 00). Cần model
//! và binary nên bị bỏ qua mặc định. Chạy từ gốc repo:
//!
//! ```text
//! MT_ASR_WORKER=<asr-worker build metal,shared-encode> MT_ASR_MODEL=models/ggml-small-q5_1.bin \
//! MT_LLAMA_SERVER=tools/llama-b11146/macos-arm64/llama-b11146/llama-server MT_MT_MODEL=models/Hy-MT2-1.8B-Q4_K_M.gguf \
//! MT_VAD_MODEL=models/silero_vad_v6.2.3.onnx cargo test -p pipeline --test real_sidecars -- --include-ignored --nocapture
//! ```
//!
//! Phát clip đúng thời gian thực (khoảng 19 giây), nên độ trễ và hàng đợi chạy như khi thu thật.

use pipeline::config::PipelineConfig;
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, Indicators, SampleSource};
use pipeline::prompt::Lang;
use pipeline::subtitle::{Delta, Status, Subtitle};
use pipeline::supervisor::{AsrSpec, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
use pipeline::vad::SileroVad;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
struct Ui(Mutex<(BTreeMap<u64, Subtitle>, Vec<u64>)>);

impl EventSink for Ui {
    fn subtitle(&self, s: &Subtitle) {
        let mut ui = self.0.lock().unwrap();
        for id in &s.replaces {
            ui.0.remove(id);
        }
        if !ui.1.contains(&s.id) {
            ui.1.push(s.id);
        }
        ui.0.insert(s.id, s.clone());
    }
    fn delta(&self, d: &Delta) {
        if let Some(s) = self.0.lock().unwrap().0.get_mut(&d.id) {
            s.tgt_text.push_str(&d.text);
        }
    }
    fn level(&self, _: f32) {}
    fn indicators(&self, _: &Indicators) {}
    fn fatal(&self, kind: Fatal, reason: &str) {
        panic!("pipeline dừng ({kind:?}): {reason}");
    }
}

#[derive(serde::Deserialize)]
struct Truth {
    lang: String,
    start_ms: u64,
    end_ms: u64,
}

fn env(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("đặt {name}")))
}

#[test]
#[ignore = "cần model và binary thật, xem đầu file"]
fn real_sidecars_translate_the_fixture_in_order() {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/audio");
    let truth: Vec<Truth> =
        serde_json::from_reader(std::fs::File::open(fixtures.join("fleurs-en-en-vi.json")).unwrap()).unwrap();
    let samples: Vec<f32> = hound::WavReader::open(fixtures.join("fleurs-en-en-vi.wav"))
        .unwrap()
        .samples::<i16>()
        .map(|s| s.unwrap() as f32 / 32768.0)
        .collect();
    let logs = std::env::temp_dir().join(format!("pipeline-real-{}", std::process::id()));
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: Some(env("MT_ASR_WORKER")),
            exe_cpu: env("MT_ASR_WORKER"),
            model: env("MT_ASR_MODEL"),
            log: logs.join("asr-worker.log"),
            first_run: false,
            require_shared: true,
            env: Vec::new(),
        },
        llama: LlamaSpec {
            exe: env("MT_LLAMA_SERVER"),
            model: env("MT_MT_MODEL"),
            log: logs.join("llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: Default::default(),
        asr_config: Default::default(),
        mt_config: Default::default(),
    };
    let manager = SidecarManager::new(spec, Arc::new(SystemClock::default()), Arc::new(NoEvents));
    manager.ensure_started().unwrap();
    let vad_model = env("MT_VAD_MODEL");
    let ui = Arc::new(Ui::default());
    let engine = Engine::start(
        EngineConfig {
            pipeline: PipelineConfig::default(),
            languages: ["en", "zh", "ja", "ko", "vi"].map(String::from).to_vec(),
            target: Lang::Vi,
            translation_context: false,
            id_base: 0,
        },
        Box::new(SampleSource::new(samples, 512, Duration::from_millis(32))),
        Box::new(move || Ok(Box::new(SileroVad::load(&vad_model)?) as _)),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        ui.clone(),
    )
    .unwrap();
    let metrics = engine.join();
    println!("{}", metrics.summary());
    let (subs, order) = std::mem::take(&mut *ui.0.lock().unwrap());
    for s in subs.values() {
        println!(
            "{} {}–{} {:?} {} | {}",
            s.id, s.start_ms, s.end_ms, s.status, s.src_text, s.tgt_text
        );
    }
    // Thứ tự xuất hiện lần đầu là thứ tự thời gian.
    let starts: Vec<u64> = order.iter().filter_map(|id| subs.get(id)).map(|s| s.start_ms).collect();
    assert!(starts.windows(2).all(|w| w[0] < w[1]), "{starts:?}");
    // Mỗi câu thật có ít nhất một phụ đề nằm trong khoảng của nó (±0,5 giây), đúng trạng thái.
    for t in &truth {
        let inside: Vec<&Subtitle> = subs
            .values()
            .filter(|s| s.start_ms + 500 >= t.start_ms && s.end_ms <= t.end_ms + 500)
            .collect();
        assert!(
            !inside.is_empty(),
            "không có phụ đề cho câu {}–{}",
            t.start_ms,
            t.end_ms
        );
        for s in inside {
            assert_eq!(s.src_lang, t.lang);
            let expected = if t.lang == "vi" { Status::SameLang } else { Status::Done };
            assert_eq!(s.status, expected, "{s:?}");
            assert!(!s.provisional, "phụ đề cuối không còn là phụ đề tạm: {s:?}");
            if expected == Status::Done {
                assert!(!s.tgt_text.is_empty());
            }
        }
    }
    let _ = std::fs::remove_dir_all(&logs);
}
````

- [ ] **Step 3: Chạy test**

Test tích hợp từ file WAV dùng code đã có từ Task 2, nên chạy xanh ngay; ba test còn lại bị bỏ qua.

Run: `cargo test -p pipeline`
Expected:

```text
test result: ok. 112 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.53s
test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.54s
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.25s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-fc16c618e4b8f5a0)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-9dfc4bfd3d3f8afa)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-c38f44afa7fc4703)
     Running tests/clients.rs (target/debug/deps/clients-429936f3fc6661e8)
     Running tests/engine.rs (target/debug/deps/engine-edfb1de2e43120d9)
     Running tests/lifecycle.rs (target/debug/deps/lifecycle-72cb79e575bb1e0c)
     Running tests/no_speech.rs (target/debug/deps/no_speech-17573c238f79b2e7)
     Running tests/real_sidecars.rs (target/debug/deps/real_sidecars-8f6b1695169f3930)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-f0916b9001a6d4ad)
```

- [ ] **Step 4: Chạy test với model thật**

Cần bản release của `asr-worker` (02a, Task 1, Step 7) và `llama-server` b11146 ở `tools/`.

Run:
```bash
MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-small-q5_1.bin \
MT_LLAMA_SERVER=$PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server MT_MT_MODEL=$PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf \
MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx cargo test -p pipeline --test real_sidecars -- --include-ignored --nocapture
```
Expected: mỗi câu có ít nhất một phụ đề nằm trong khoảng thời gian của câu, đúng thứ tự; hai câu tiếng Anh `Done`, câu tiếng Việt `SameLang` (có thể bị VAD cắt làm hai đoạn); trước đó một dòng tóm tắt số đo của phiên (số đoạn theo kết cục, thời gian từng bước; không dùng làm số đo vì máy lúc lập kế hoạch đang bận). Chữ chép và bản dịch tùy máy. Lúc lập kế hoạch (gói Nhẹ):

```text
0 1472–4032 Done That didn't seem to make sense to me. It certainly wasn't fair. | Điều đó dường như không hợp lý chút nào. Chắc chắn là không công bằng.
1 7072–10528 Done The results of plotting analysis will be posted to a public website. | Kết quả phân tích đồ họa sẽ được đăng trên một trang web công cộng.
2 13088–14336 SameLang Cái nhà khoa học cho viết | 
3 14784–17472 SameLang vụp và trạm đã gây ra vụ nổ gắt lớn | 
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 30.31s
```

Run (một lần cho mỗi model):
```bash
for m in large-v3-turbo-q5_0 small-q5_1; do
  MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-$m.bin \
  MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx cargo test -p pipeline --test no_speech -- --include-ignored --nocapture
done
```
Expected: 14 dòng JSON mỗi model rồi dòng tổng. Lúc lập kế hoạch, VAD của app không cắt ra đoạn nào từ cả 14 tín hiệu (`"vad_segments":0`), nên không phụ đề nào hiện (`"shown_as_subtitle":0`). Không có VAD thì khác: turbo luôn cho `no_speech_prob` cỡ 1e-10 và bịa "you", "so", "Thank you." cho im lặng, ù điện, tiếng gõ phím; small cho `no_speech_prob` 0,48–0,94 và luật lọc bỏ được 10/14. Task 6 ghi kết quả này cùng phép thử với nhạc.

```text
{"segments":14,"shown_as_subtitle":0,"shown":[]}
```

- [ ] **Step 5: Clippy và định dạng**

Run: `cargo clippy -p pipeline --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 6: Commit**

```bash
git add crates/pipeline/tests/engine.rs \
  crates/pipeline/tests/no_speech.rs \
  crates/pipeline/tests/real_sidecars.rs \
  tests/fixtures/audio/ATTRIBUTION.txt \
  tests/fixtures/audio/build_fixture.py \
  tests/fixtures/audio/fleurs-en-en-vi.json \
  tests/fixtures/audio/fleurs-en-en-vi.wav
git commit -m "test(pipeline): clip FLEURS cho test tích hợp, test với model thật, công cụ đo no_speech_prob" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: `latency-bench mt-eval`, nhãn cho `score_mt.py`, bộ đo tỉ lệ token

Đ4, Đ12, mục 6.7 của kế hoạch 00; dòng 27, 149:
- `mt_eval.rs`: dịch bộ test A3 bằng đúng `pipeline::translate` của app, ghi JSONL cùng định dạng với `translate.py` (thêm `status`, `attempts`); chạy lại cùng `--out-dir` thì dịch tiếp, dòng cuối viết dở bị cắt.
- `score_mt.py`: `--outputs` (thư mục kết quả), `--label` (bắt buộc khi chấm thư mục khác `outputs/`, để không ghi đè mốc `s7_mt.json`), `--baseline` (bảng so từng chiều với mốc, thoát lỗi khi có chiều thấp hơn quá 0,01). `translate.py` thêm `--label` cho thư mục kết quả.
- `build_ratio_set.py`, `ratio_stats.py` (QĐ22): bộ câu và bảng tỉ lệ token cho Task 6.

**Files:**
- Tạo: `bench/phase0/mt/build_ratio_set.py`
- Tạo: `bench/phase0/mt/ratio_stats.py`
- Sửa: `bench/phase0/mt/score_mt.py`
- Sửa: `bench/phase0/mt/translate.py`
- Sửa: `crates/latency-bench/src/main.rs`
- Tạo: `crates/latency-bench/src/mt_eval.rs`

- [ ] **Step 1: Viết test**

Sửa `crates/latency-bench/src/main.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/main.rs
+++ b/crates/latency-bench/src/main.rs
@@ -2,6 +2,7 @@
 
 mod asr_eval;
 mod latency;
+mod mt_eval;
 mod stats;
 
 use clap::Parser;
```

Tạo `crates/latency-bench/src/mt_eval.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! A3 (Đ4 của kế hoạch 00): dịch bộ test bằng đúng code dịch của app (`pipeline::translate`: prompt, số token tối đa,
//! hậu xử lý trong lúc stream, thử lại một lần), ghi JSONL cùng định dạng với `bench/phase0/mt/translate.py` để
//! `score_mt.py` chấm.
//!
//! Kết quả: `<out-dir>/<tên model>-<plain|context>.jsonl`. Chạy lại cùng `--out-dir` thì dịch tiếp các câu chưa có, như
//! `translate.py`; muốn dịch lại từ đầu thì dùng thư mục khác (nhãn khác), đừng xóa kết quả mốc.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_half_written_last_line_is_cut_on_resume() {
        let dir = std::env::temp_dir().join(format!("mt-eval-resume-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.jsonl");
        std::fs::write(&path, "{\"id\":\"a\"}\n{\"id\":\"b\"}\n{\"id\":\"c\",\"hy").unwrap();
        let done = done_ids(&path).unwrap();
        assert_eq!(done, HashSet::from(["a".to_string(), "b".to_string()]));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{\"id\":\"a\"}\n{\"id\":\"b\"}\n"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `cargo test -p latency-bench`
Expected: biên dịch lỗi:

```text
error[E0433]: cannot find type `HashSet` in this scope
error[E0425]: cannot find function `done_ids` in this scope
```

- [ ] **Step 3: Viết code**

Tạo `bench/phase0/mt/build_ratio_set.py`:

```python
"""Bộ câu để đo ngưỡng tỉ lệ token còn thiếu (Đ12 của kế hoạch Giai đoạn 1 · 00, dòng 149 của bảng đối chiếu).

- 12 chiều không có tiếng Việt (giữa en, zh, ja, ko), mỗi chiều 100 đoạn WMT24++. Dùng cùng bốn file đã ghim của
  `build_testset.py`; các đoạn khác hẳn 340 đoạn mà bộ A3 đã dùng. Câu nguồn và đích là bản dịch chuẩn của cùng một đoạn.
- Câu gốc rất ngắn (thường dưới 3 token): 12 câu đáp ngắn hay gặp trong cuộc họp cho mỗi ngôn ngữ trong năm ngôn ngữ, dịch
  sang bốn ngôn ngữ còn lại. Id bắt đầu bằng `short-`.
- Chỉ để đo tỉ lệ token, không chấm COMET, nên không cần bản tham chiếu.

Dùng: python3 bench/phase0/mt/build_ratio_set.py  (ghi bench/phase0/data/mt/testset_ratio.jsonl)
"""
import json
import os
import random
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_testset import DATA, FILES, load  # noqa: E402

N = 100
LANGS = ("en", "zh", "ja", "ko")
SHORT = {
    "en": ["Yes.", "No.", "Okay.", "Thanks.", "Right.", "Sure.", "Hello.", "Sorry?", "Great.", "Next slide.", "Agreed.", "Go ahead."],
    "vi": ["Vâng.", "Không.", "Được.", "Cảm ơn.", "Đúng rồi.", "Chắc chắn.", "Xin chào.", "Xin lỗi?", "Tuyệt.", "Trang sau.", "Đồng ý.", "Mời anh."],
    "zh": ["是的。", "不是。", "好的。", "谢谢。", "对。", "当然。", "你好。", "什么？", "太好了。", "下一页。", "同意。", "请讲。"],
    "ja": ["はい。", "いいえ。", "了解です。", "ありがとう。", "そうですね。", "もちろん。", "こんにちは。", "すみません？", "いいですね。", "次のスライド。", "賛成です。", "どうぞ。"],
    "ko": ["네.", "아니요.", "좋아요.", "감사합니다.", "맞아요.", "물론이죠.", "안녕하세요.", "네?", "훌륭해요.", "다음 슬라이드.", "동의합니다.", "말씀하세요."],
}


def main():
    data = {lang: load(lang) for lang in FILES}
    common = set.intersection(*(set(d) for d in data.values()))

    def usable(seg):
        rows = [data[lang][seg] for lang in FILES]
        if any(r["is_bad_source"] or r["domain"] == "canary" for r in rows):
            return False
        return 15 <= len(rows[0]["source"]) <= 250 and len(data["vi"][seg]["target"]) <= 300

    # Cùng pool và thứ tự xáo của build_testset.py; 340 đoạn đầu đã dùng cho A3.
    pool = sorted(s for s in common if usable(s))
    random.Random(2026).shuffle(pool)
    segments = pool[340:340 + N]

    def text(lang, seg):
        return data["vi"][seg]["source"] if lang == "en" else data[lang][seg]["target"]

    items = []
    for src in LANGS:
        for tgt in LANGS:
            if src == tgt:
                continue
            for seg in segments:
                items.append({"id": f"{src}-{tgt}-{seg}", "dir": f"{src}->{tgt}", "src_lang": src, "tgt_lang": tgt,
                              "src": text(src, seg)})
    for src, phrases in SHORT.items():
        for tgt in SHORT:
            if src == tgt:
                continue
            for k, phrase in enumerate(phrases):
                items.append({"id": f"short-{src}-{tgt}-{k}", "dir": f"{src}->{tgt}", "src_lang": src, "tgt_lang": tgt,
                              "src": phrase})
    out = os.path.join(DATA, "testset_ratio.jsonl")
    with open(out, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    print("ghi", len(items), "câu ->", out)
    print("WMT24++:", len([i for i in items if not i["id"].startswith("short-")]),
          "câu ngắn:", len([i for i in items if i["id"].startswith("short-")]))
    print(sorted(Counter(it["dir"] for it in items).items()))


if __name__ == "__main__":
    main()
```

Tạo `bench/phase0/mt/ratio_stats.py`:

```python
"""Tỉ lệ token của bản dịch (token bản dịch chia token câu gốc) từ kết quả `latency-bench mt-eval`, theo cách của S7
(`s7_mt_decisions.md`): ngưỡng đề xuất là tỉ lệ lớn nhất đo được cộng biên 25%, làm tròn lên 0,1, chỉ tính câu gốc từ
10 token trở lên (cách 2 của Q4). Câu gốc dưới 3 token báo riêng: số token bản dịch lớn nhất, so với hạn mức sinh của §6.5
(`4 × số token câu gốc + 32`).

Dùng: python3 bench/phase0/mt/ratio_stats.py <mt-eval.jsonl>… [--out bench/phase0/results/gd1_mt_ratio.md]
"""
import argparse
import json
import math
import os
from collections import defaultdict

MIN_SRC = 10


def suggest(ratio):
    return math.ceil(ratio * 1.25 * 10 - 1e-9) / 10


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out")
    args = ap.parse_args()
    lines = []
    for path in args.files:
        rows = [json.loads(l) for l in open(path, encoding="utf-8")]
        by_dir = defaultdict(list)
        for r in rows:
            by_dir[r["dir"]].append(r)
        lines += [f"## {os.path.basename(path)}", "",
                  f"| chiều | câu | câu gốc ≥ {MIN_SRC} token | tỉ lệ lớn nhất (≥ {MIN_SRC}) | ngưỡng đề xuất "
                  f"| câu gốc < 3 token | token dịch lớn nhất (< 3) | hạn mức sinh (< 3) | lỗi |",
                  "|---|---|---|---|---|---|---|---|---|"]
        for d in sorted(by_dir):
            rs = [r for r in by_dir[d] if r["status"] == "done" and r["src_tokens"] > 0]
            long = [r["completion_tokens"] / r["src_tokens"] for r in rs if r["src_tokens"] >= MIN_SRC]
            short = [r for r in rs if r["src_tokens"] < 3]
            failed = sum(r["status"] != "done" for r in by_dir[d])
            top = max(long) if long else None
            cap = max((4 * r["src_tokens"] + 32 for r in short), default=None)
            lines.append(
                f"| {d} | {len(by_dir[d])} | {len(long)} | {f'{top:.2f}' if top else '—'} "
                f"| {f'{suggest(top):.1f}' if top else '—'} | {len(short)} "
                f"| {max((r['completion_tokens'] for r in short), default='—')} | {cap if cap else '—'} | {failed} |")
        lines.append("")
    text = "\n".join(lines)
    print(text)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("# Tỉ lệ token cho cặp không có tiếng Việt và câu gốc rất ngắn (Đ12)\n\n"
                    "Sinh bởi `bench/phase0/mt/ratio_stats.py` từ kết quả `latency-bench mt-eval` trên "
                    "`testset_ratio.jsonl` (`build_ratio_set.py`).\n\n" + text)


if __name__ == "__main__":
    main()
```

Sửa `bench/phase0/mt/score_mt.py` (áp bằng `git apply`):

```diff
--- a/bench/phase0/mt/score_mt.py
+++ b/bench/phase0/mt/score_mt.py
@@ -3,7 +3,12 @@
 Dùng (môi trường COMET, xem kế hoạch 02):
   python bench/phase0/mt/score_mt.py            # COMET + tỉ lệ token
   python bench/phase0/mt/score_mt.py --no-comet # chỉ tỉ lệ token, không cần torch
-Kết quả: bench/phase0/results/s7_mt.json và s7_mt.md.
+Kết quả: bench/phase0/results/s7_mt.json và s7_mt.md (mốc của S7).
+
+Chấm một lượt mới mà không ghi đè mốc (chống thụt lùi A3, kế hoạch Giai đoạn 1 · 00 mục 6.7):
+  python bench/phase0/mt/score_mt.py --outputs bench/phase0/data/mt/outputs-<nhãn> --label <nhãn> \
+    --baseline bench/phase0/results/s7_mt.json
+Kết quả: bench/phase0/results/s7_mt-<nhãn>.json và .md; bảng cuối so từng chiều với mốc (không thấp hơn quá 0,01).
 """
 import argparse
 import glob
@@ -19,6 +24,7 @@
 RESULTS = os.path.join(ROOT, "bench", "phase0", "results")
 FLOOR = {"Q8_0": 0.83, "Q4_K_M": 0.80}  # mức sàn Anh→Việt (A3)
 CJK_GAP = 0.05  # Trung/Nhật/Hàn→Việt thấp hơn Anh→Việt quá mức này thì xem lại D5 (A3)
+REGRESSION = 0.01  # chống thụt lùi A3: mỗi chiều không thấp hơn mốc quá mức này
 MARKERS = ("[", "【")  # tiêu đề của mẫu prompt có ngữ cảnh: [Background Information], 【背景信息】
 
 
@@ -99,13 +105,38 @@
     return f"{floor:.3f} ({'đạt' if per_dir[d]['comet'] >= floor else 'KHÔNG ĐẠT'})"
 
 
+def regression_lines(report, baseline):
+    """So COMET từng chiều của các lượt cùng tên với mốc. Trả (các dòng Markdown, có chiều nào thụt lùi không)."""
+    lines = ["", "## So với mốc (chống thụt lùi A3)", "",
+             "| Lượt chạy | Chiều | Mốc | Lượt này | Chênh | Kết luận |", "|---|---|---|---|---|---|"]
+    regressed = False
+    for name, per_dir in report.items():
+        base = baseline["runs"].get(name, {})
+        for d, r in per_dir.items():
+            if "comet" not in r or "comet" not in base.get(d, {}):
+                continue
+            diff = r["comet"] - base[d]["comet"]
+            ok = diff >= -REGRESSION
+            regressed |= not ok
+            lines.append(f"| {name} | {d} | {base[d]['comet']:.3f} | {r['comet']:.3f} | {diff:+.3f} | "
+                         f"{'đạt' if ok else 'THỤT LÙI'} |")
+    return lines, regressed
+
+
 def main():
     ap = argparse.ArgumentParser()
     ap.add_argument("--no-comet", action="store_true")
+    ap.add_argument("--outputs", default=os.path.join(DATA, "outputs"),
+                    help="thư mục JSONL của translate.py hoặc latency-bench mt-eval")
+    ap.add_argument("--label", default="",
+                    help="nhãn kết quả: ghi s7_mt-<nhãn>.json và .md, không ghi đè mốc s7_mt.json")
+    ap.add_argument("--baseline", help="file s7_mt.json làm mốc: thêm bảng so từng chiều")
     args = ap.parse_args()
+    if os.path.abspath(args.outputs) != os.path.join(DATA, "outputs") and not args.label:
+        ap.error("chấm thư mục khác outputs/ thì phải có --label, để không ghi đè mốc s7_mt.json")
     items = {it["id"]: it for it in map(json.loads, open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8"))}
     runs = {}
-    for path in sorted(glob.glob(os.path.join(DATA, "outputs", "*.jsonl"))):
+    for path in sorted(glob.glob(os.path.join(args.outputs, "*.jsonl"))):
         name = os.path.basename(path).removesuffix(".jsonl")
         runs[name] = {r["id"]: r for r in map(json.loads, open(path, encoding="utf-8"))}
     if not runs:
@@ -146,7 +177,8 @@
                 thresholds[d] = max(thresholds[d], r["proposed_threshold"])
 
     os.makedirs(RESULTS, exist_ok=True)
-    with open(os.path.join(RESULTS, "s7_mt.json"), "w", encoding="utf-8") as f:
+    stem = f"s7_mt-{args.label}" if args.label else "s7_mt"
+    with open(os.path.join(RESULTS, f"{stem}.json"), "w", encoding="utf-8") as f:
         json.dump({"runs": report, "comparisons": comparisons, "token_ratio_thresholds": thresholds}, f,
                   ensure_ascii=False, indent=1)
 
@@ -171,9 +203,15 @@
     lines += ["", "## Ngưỡng tỉ lệ token đề xuất cho §6.5 (từ các lượt chạy không có ngữ cảnh)", "",
               "| Chiều | Ngưỡng |", "|---|---|"]
     lines += [f"| {d} | {v:.1f} |" for d, v in sorted(thresholds.items())]
-    with open(os.path.join(RESULTS, "s7_mt.md"), "w", encoding="utf-8") as f:
+    regressed = False
+    if args.baseline:
+        extra, regressed = regression_lines(report, json.load(open(args.baseline, encoding="utf-8")))
+        lines += extra
+    with open(os.path.join(RESULTS, f"{stem}.md"), "w", encoding="utf-8") as f:
         f.write("\n".join(lines) + "\n")
     print("\n".join(lines))
+    if regressed:
+        raise SystemExit("có chiều thấp hơn mốc quá 0,01: không commit thay đổi gây ra nó, báo chủ dự án (mục 6.7)")
 
 
 if __name__ == "__main__":
```

Sửa `bench/phase0/mt/translate.py` (áp bằng `git apply`):

```diff
--- a/bench/phase0/mt/translate.py
+++ b/bench/phase0/mt/translate.py
@@ -3,6 +3,8 @@
 Dùng:
   python3 bench/phase0/mt/translate.py --model models/Hy-MT2-1.8B-Q8_0.gguf [--variant plain|context] [--limit N]
 Kết quả: bench/phase0/data/mt/outputs/<model>-<variant>.jsonl, chạy lại thì tiếp tục từ câu chưa dịch.
+Thêm `--label <nhãn>` thì ghi vào outputs-<nhãn>/, không đụng tới kết quả mốc trong outputs/.
+Từ Giai đoạn 1, A3 dịch bằng `latency-bench mt-eval` (code dịch của app); công cụ này giữ để so sánh.
 """
 import argparse
 import json
@@ -18,6 +20,7 @@
     ap.add_argument("--model", required=True)
     ap.add_argument("--variant", choices=["plain", "context"], default="plain")
     ap.add_argument("--limit", type=int, default=0, help="chỉ dịch N câu đầu của mỗi chiều (chạy thử)")
+    ap.add_argument("--label", default="", help="ghi vào outputs-<nhãn>/ thay vì outputs/ (mốc)")
     args = ap.parse_args()
 
     items = [json.loads(line) for line in open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8")]
@@ -32,7 +35,7 @@
         items = [it for it in items if it["context"]]
 
     stem = os.path.basename(args.model).removesuffix(".gguf")
-    out_dir = os.path.join(DATA, "outputs")
+    out_dir = os.path.join(DATA, f"outputs-{args.label}" if args.label else "outputs")
     os.makedirs(out_dir, exist_ok=True)
     out_path = os.path.join(out_dir, f"{stem}-{args.variant}.jsonl")
     done = set()
```

Sửa `crates/latency-bench/src/main.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/main.rs
+++ b/crates/latency-bench/src/main.rs
@@ -1,4 +1,4 @@
-//! Công cụ đo cho Giai đoạn 0: `latency` (S6) và `asr-eval` (S7, A4).
+//! Công cụ đo: `latency` (S6), `asr-eval` (S7, A4), `mt-eval` (A3, qua đúng code dịch của app).
 
 mod asr_eval;
 mod latency;
@@ -13,6 +13,8 @@
     Latency(latency::LatencyArgs),
     /// Chép lời bộ clip A4 để tính WER/CER.
     AsrEval(asr_eval::AsrEvalArgs),
+    /// Dịch bộ test A3 bằng code dịch của app, để score_mt.py chấm COMET.
+    MtEval(mt_eval::MtEvalArgs),
 }
 
 /// Stack của luồng chạy lệnh. `SileroVad` (candle-onnx) cần hơn 1 MiB ở bản debug (`cargo run`), mà luồng chính của Windows
@@ -28,6 +30,7 @@
         .spawn(move || match command {
             Command::Latency(args) => latency::run(args),
             Command::AsrEval(args) => asr_eval::run(args),
+            Command::MtEval(args) => mt_eval::run(args),
         })?;
     worker.join().map_err(|_| anyhow::anyhow!("luồng chạy lệnh bị panic"))?
 }
```

Thêm vào `crates/latency-bench/src/mt_eval.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use anyhow::{Context, Result, bail};
use pipeline::config::MtConfig;
use pipeline::llama::{LlamaLaunch, LlamaServer};
use pipeline::prompt::Lang;
use pipeline::translate::{Job, Outcome, translate};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};

#[derive(clap::Args)]
pub struct MtEvalArgs {
    /// JSONL của `build_testset.py`: mỗi dòng có id, dir, src_lang, tgt_lang, src, context.
    #[arg(long)]
    testset: PathBuf,
    #[arg(long)]
    llama_server: PathBuf,
    #[arg(long)]
    model: PathBuf,
    /// Thư mục kết quả, ví dụ `bench/phase0/data/mt/outputs-gd1-mteval`. Không dùng `outputs/` (mốc của S7).
    #[arg(long)]
    out_dir: PathBuf,
    /// `plain`: không ngữ cảnh (cấu hình mặc định của app). `context`: cờ thử nghiệm ngữ cảnh câu trước.
    #[arg(long, default_value = "plain", value_parser = ["plain", "context"])]
    variant: String,
    /// Chỉ dịch N câu đầu của mỗi chiều (chạy thử).
    #[arg(long, default_value_t = 0)]
    limit: usize,
}

#[derive(Deserialize)]
struct Item {
    id: String,
    dir: String,
    src_lang: String,
    tgt_lang: String,
    src: String,
    #[serde(default)]
    context: Option<String>,
}

/// Một dòng kết quả. Các trường đầu giống `translate.py`; `status` và `attempts` là của app.
#[derive(Serialize)]
struct Row<'a> {
    id: &'a str,
    dir: &'a str,
    /// Bản dịch sau hậu xử lý; dịch lỗi thì là câu gốc, đúng như phụ đề app hiện ("chưa dịch được").
    hyp: String,
    src_tokens: usize,
    completion_tokens: usize,
    total_ms: f32,
    first_token_ms: Option<f32>,
    /// "stop" khi dịch xong; "failed" khi cả hai lần đều lỗi (không có "length": bản cụt bị coi là lỗi).
    finish_reason: &'static str,
    status: &'static str,
    attempts: u8,
}

/// Các id đã có trong file kết quả. Dòng cuối viết dở (lần trước bị ngắt) thì cắt bỏ.
fn done_ids(path: &Path) -> Result<HashSet<String>> {
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let data = std::fs::read(path)?;
    let keep = data.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    if keep < data.len() {
        std::fs::write(path, &data[..keep])?;
    }
    #[derive(Deserialize)]
    struct Done {
        id: String,
    }
    BufReader::new(std::fs::File::open(path)?)
        .lines()
        .map(|l| Ok(serde_json::from_str::<Done>(&l?)?.id))
        .collect()
}

pub fn run(args: MtEvalArgs) -> Result<()> {
    std::fs::create_dir_all(&args.out_dir)?;
    let stem = args
        .model
        .file_stem()
        .context("--model phải là file .gguf")?
        .to_string_lossy()
        .into_owned();
    let out_path = args.out_dir.join(format!("{stem}-{}.jsonl", args.variant));
    let reader = BufReader::new(
        std::fs::File::open(&args.testset).with_context(|| format!("không mở được {}", args.testset.display()))?,
    );
    let mut items = Vec::new();
    let mut per_dir = std::collections::HashMap::<String, usize>::new();
    for line in reader.lines() {
        let item: Item = serde_json::from_str(&line?)?;
        if args.variant == "context" && item.context.as_deref().is_none_or(str::is_empty) {
            continue;
        }
        let n = per_dir.entry(item.dir.clone()).or_default();
        if args.limit > 0 && *n >= args.limit {
            continue;
        }
        *n += 1;
        items.push(item);
    }
    let done = done_ids(&out_path)?;
    let todo: Vec<&Item> = items.iter().filter(|i| !done.contains(&i.id)).collect();
    println!(
        "{stem}-{}: {} câu, còn {} câu phải dịch",
        args.variant,
        items.len(),
        todo.len()
    );
    if todo.is_empty() {
        return Ok(());
    }
    let launch = LlamaLaunch {
        request_timeout: crate::latency::TOOL_REQUEST_TIMEOUT,
        ..LlamaLaunch::new(
            &args.llama_server,
            &args.model,
            &args.out_dir.join(format!("{stem}.llama.log")),
        )
    };
    let mut server = LlamaServer::spawn(&launch)?;
    let cfg = MtConfig::default();
    let mut out = std::fs::OpenOptions::new().create(true).append(true).open(&out_path)?;
    for (n, item) in todo.iter().enumerate() {
        let (Some(src), Some(tgt)) = (Lang::from_code(&item.src_lang), Lang::from_code(&item.tgt_lang)) else {
            bail!("câu {}: cặp ngôn ngữ lạ {}→{}", item.id, item.src_lang, item.tgt_lang);
        };
        let job = Job {
            text: &item.src,
            src,
            tgt,
            context: if args.variant == "context" {
                item.context.as_deref()
            } else {
                None
            },
        };
        let row = match translate(&mut server, &job, &cfg, &mut |_| ControlFlow::Continue(())) {
            Outcome::Done(t) => Row {
                id: &item.id,
                dir: &item.dir,
                hyp: t.text,
                src_tokens: t.source_tokens,
                completion_tokens: t.completion_tokens.unwrap_or(0),
                total_ms: t.total_ms,
                first_token_ms: t.first_delta_ms,
                finish_reason: "stop",
                status: "done",
                attempts: t.attempts,
            },
            Outcome::Failed {
                source_tokens,
                completion_tokens,
                attempts,
                ..
            } => Row {
                id: &item.id,
                dir: &item.dir,
                hyp: item.src.clone(),
                src_tokens: source_tokens,
                completion_tokens: completion_tokens.unwrap_or(0),
                total_ms: 0.0,
                first_token_ms: None,
                finish_reason: "failed",
                status: "failed",
                attempts,
            },
            other => bail!("câu {}: {other:?}", item.id),
        };
        writeln!(out, "{}", serde_json::to_string(&row)?)?;
        out.flush()?;
        if (n + 1) % 25 == 0 || n + 1 == todo.len() {
            println!("{stem}-{}: {}/{}", args.variant, n + 1, todo.len());
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run: `cargo test -p latency-bench`
Expected:

```text
test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.27s
```

Run: `cargo run -q -p latency-bench -- mt-eval --help`
Expected:

```text
Usage: latency-bench mt-eval [OPTIONS] --testset <TESTSET> --llama-server <LLAMA_SERVER> --model <MODEL> --out-dir <OUT_DIR>
      --testset <TESTSET>            JSONL của `build_testset.py`: mỗi dòng có id, dir, src_lang, tgt_lang, src, context
      --llama-server <LLAMA_SERVER>  
      --model <MODEL>                
      --out-dir <OUT_DIR>            Thư mục kết quả, ví dụ `bench/phase0/data/mt/outputs-gd1-mteval`. Không dùng `outputs/` (mốc của S7)
      --variant <VARIANT>            `plain`: không ngữ cảnh (cấu hình mặc định của app). `context`: cờ thử nghiệm ngữ cảnh câu trước [default: plain] [possible values: plain, context]
      --limit <LIMIT>                Chỉ dịch N câu đầu của mỗi chiều (chạy thử) [default: 0]
```

- [ ] **Step 5: Chạy thử với `llama-server` thật** (bộ test A3 có sẵn ở `bench/phase0/data/mt/testset_phase0.jsonl`)

Run:
```bash
rm -rf $TMPDIR/mteval-smoke
cargo run -q -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_phase0.jsonl \
  --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
  --model $PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf --out-dir $TMPDIR/mteval-smoke --limit 2
```
Expected: 2 câu mỗi chiều, 8 chiều:

```text
Hy-MT2-1.8B-Q4_K_M-plain: 16 câu, còn 16 câu phải dịch
Hy-MT2-1.8B-Q4_K_M-plain: 16/16
```

Chạy lại đúng lệnh trên (không `rm`). Expected: không dịch lại câu nào:

```text
Hy-MT2-1.8B-Q4_K_M-plain: 16 câu, còn 0 câu phải dịch
```

Run:
```bash
cd bench/phase0/mt
python3 score_mt.py --no-comet --outputs $TMPDIR/mteval-smoke
python3 score_mt.py --no-comet --outputs $TMPDIR/mteval-smoke --label gd1-smoke
ls ../results | grep gd1-smoke
rm ../results/s7_mt-gd1-smoke.json ../results/s7_mt-gd1-smoke.md
cd ../../..
```
Expected: lệnh đầu báo lỗi vì thiếu nhãn; lệnh thứ hai ghi file có nhãn, không đụng `s7_mt.json`:

```text
score_mt.py: error: chấm thư mục khác outputs/ thì phải có --label, để không ghi đè mốc s7_mt.json
s7_mt-gd1-smoke.json
s7_mt-gd1-smoke.md
```

Run:
```bash
python3 bench/phase0/mt/build_ratio_set.py
rm -rf $TMPDIR/ratio-smoke
cargo run -q -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_ratio.jsonl \
  --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
  --model $PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf --out-dir $TMPDIR/ratio-smoke --limit 3
python3 bench/phase0/mt/ratio_stats.py $TMPDIR/ratio-smoke/Hy-MT2-1.8B-Q4_K_M-plain.jsonl
```
Expected: bộ câu có 1440 câu (1200 câu WMT24++ cho 12 chiều không có tiếng Việt, 240 câu ngắn); bảng có một dòng mỗi chiều (số trong bảng tùy model, chỉ là chạy thử):

```text
ghi 1440 câu -> bench/phase0/data/mt/testset_ratio.jsonl
WMT24++: 1200 câu ngắn: 240
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p latency-bench --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add bench/phase0/mt/build_ratio_set.py \
  bench/phase0/mt/ratio_stats.py \
  bench/phase0/mt/score_mt.py \
  bench/phase0/mt/translate.py \
  crates/latency-bench/src/main.rs \
  crates/latency-bench/src/mt_eval.rs
git commit -m "feat(bench): latency-bench mt-eval, nhãn và so mốc cho score_mt, bộ đo tỉ lệ token (Đ4, Đ12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: `audio-capture` cho app, và kiểm toàn bộ phần crate

Phần của `audio-capture` mà app (02c) cần (dòng 84–91, 93–95, 232, 278; QĐ16, QĐ20):
- `lib.rs`: `AudioSource::failed()` (luồng thu chết), `AudioApp`, `default_output_signature()` để app biết thiết bị phát đã đổi.
- `macos.rs`: `default_output_device`, `audio_apps` (app đang phát tiếng, chỉ đọc HAL, không cần quyền), `TapTarget::System` cho bước nghe thử.
- `windows.rs` (code của kế hoạch 0-04 Task 7, đưa vào crate): `Endpoint` (mặc định theo vai trò, hoặc thiết bị chọn tay theo id), `list_render_devices`, cờ `failed` khi thiết bị bị rút, `default_endpoint_id`.
- `preprocess.rs`: luồng tiền xử lý dùng chung (gộp mono, resample từng nguồn về 16 kHz, trộn hai nguồn bằng `Mixer2`), `RING_SAMPLES` (30 giây ở 48 kHz stereo), và `ClockFiller` chèn im lặng theo đồng hồ thật khi nguồn chưa chạy hay đang mở lại.
- `bin/capture.rs` dùng `Endpoint::Default`; `pipeline` thêm feature `Win32_System_Threading` cho Job Object.
- `scripts/fake-pkg-config` (QĐ15) để kiểm code Windows trên Mac.

Phần gọi API Windows chỉ kiểm được bằng clippy cho target Windows; test thật của `windows.rs` (`#[cfg(windows)]`, có một test `#[ignore]` cần thiết bị phát) chạy ở đợt Windows (02c, Task 9).

**Files:**
- Sửa: `crates/audio-capture/Cargo.toml`
- Sửa: `crates/audio-capture/src/bin/capture.rs`
- Sửa: `crates/audio-capture/src/lib.rs`
- Sửa: `crates/audio-capture/src/macos.rs`
- Tạo: `crates/audio-capture/src/preprocess.rs`
- Tạo: `crates/audio-capture/src/windows.rs`
- Sửa: `crates/pipeline/Cargo.toml`
- Sửa: `crates/pipeline/src/process.rs`
- Tạo: `scripts/fake-pkg-config`

- [ ] **Step 1: Khai báo module và feature**

Sửa `crates/audio-capture/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/audio-capture/Cargo.toml
+++ b/crates/audio-capture/Cargo.toml
@@ -22,6 +22,7 @@
 
 [target.'cfg(windows)'.dependencies]
 windows = { version = "0.62.2", features = [
+    "Win32_Devices_FunctionDiscovery",
     "Win32_Foundation",
     "Win32_Media_Audio",
     "Win32_Media_KernelStreaming",
@@ -30,4 +31,5 @@
     "Win32_System_Com_StructuredStorage",
     "Win32_System_Performance",
     "Win32_System_Variant",
+    "Win32_UI_Shell_PropertiesSystem",
 ] }
```

Sửa `crates/audio-capture/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/audio-capture/src/lib.rs
+++ b/crates/audio-capture/src/lib.rs
@@ -2,10 +2,13 @@
 
 pub mod gapfill;
 pub mod mix;
+pub mod preprocess;
 pub mod resample;
 
 #[cfg(target_os = "macos")]
 pub mod macos;
+#[cfg(windows)]
+pub mod windows;
 
 use std::sync::atomic::{AtomicU64, Ordering};
 
@@ -22,6 +25,34 @@
     fn stop(&mut self);
     /// Hợp lệ sau khi `start` thành công.
     fn format(&self) -> AudioFormat;
+    /// Luồng thu đã chết (ví dụ thiết bị bị rút): app phải khởi tạo lại việc thu (§9).
+    fn failed(&self) -> bool {
+        false
+    }
+}
+
+/// Một app đang phát âm thanh (macOS: tùy chọn chỉ tap app họp, §6.1).
+#[derive(Clone, Debug, PartialEq, Eq)]
+pub struct AudioApp {
+    pub pid: i32,
+    pub bundle_id: String,
+}
+
+/// Dấu hiệu của thiết bị phát mặc định: đổi thì app khởi tạo lại việc thu trong ≤ 2 giây (§9). App hỏi định kỳ (mỗi 500 ms)
+/// thay cho listener của Core Audio và `IMMNotificationClient`: cùng kết quả, không có callback chạy trên luồng của hệ
+/// thống. `None` nếu không đọc được.
+pub fn default_output_signature() -> Option<String> {
+    #[cfg(target_os = "macos")]
+    return macos::default_output_device().ok().map(|id| id.to_string());
+    #[cfg(windows)]
+    return {
+        use crate::windows::{Role, default_endpoint_id};
+        let console = default_endpoint_id(Role::Console).ok()?;
+        let communications = default_endpoint_id(Role::Communications).unwrap_or_default();
+        Some(format!("{console}|{communications}"))
+    };
+    #[allow(unreachable_code)]
+    None
 }
 
 /// Số liệu chẩn đoán, cập nhật từ luồng thu.
```

Sửa `crates/pipeline/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/Cargo.toml
+++ b/crates/pipeline/Cargo.toml
@@ -23,7 +23,12 @@
 
 [target.'cfg(windows)'.dependencies]
 # Job Object để tiến trình phụ không bị bỏ lại khi app chết (spec §5). Cùng bản với `audio-capture`.
-windows = { version = "0.62.2", features = ["Win32_Foundation", "Win32_Security", "Win32_System_JobObjects"] }
+windows = { version = "0.62.2", features = [
+    "Win32_Foundation",
+    "Win32_Security",
+    "Win32_System_JobObjects",
+    "Win32_System_Threading",
+] }
 
 [dev-dependencies]
 hound.workspace = true
```

- [ ] **Step 2: Viết test**

Tạo `crates/audio-capture/src/preprocess.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Luồng tiền xử lý (spec §6.1, §6.2): đọc ring buffer của một hoặc hai nguồn, gộp về mono và resample từng nguồn về
//! 16 kHz, rồi trộn hai nguồn (Windows, chế độ tự động: thiết bị Console và Communications) bằng `Mixer2`, bù lệch đồng
//! hồ bằng cách phát riêng phần dư.

#[cfg(test)]
mod tests {
    use super::*;

    fn ring(samples: &[f32]) -> rtrb::Consumer<f32> {
        let (mut p, c) = rtrb::RingBuffer::new(samples.len().max(1));
        for &s in samples {
            p.push(s).unwrap();
        }
        c
    }

    fn format(sample_rate: u32, channels: u16) -> AudioFormat {
        AudioFormat { sample_rate, channels }
    }

    #[test]
    fn a_16k_mono_source_passes_through() {
        let input: Vec<f32> = (0..1_600).map(|i| (i as f32 / 1_600.0) - 0.5).collect();
        let mut p = Preprocessor::new(vec![(ring(&input), format(16_000, 1))]).unwrap();
        let mut out = Vec::new();
        p.drain(&mut out).unwrap();
        assert_eq!(out, input);
    }

    #[test]
    fn two_sources_at_different_rates_are_resampled_then_mixed() {
        // 1 giây stereo 48 kHz giá trị 0,2 và 1 giây mono 44,1 kHz giá trị 0,1: trộn ra khoảng 0,3.
        let a = vec![0.2f32; 48_000 * 2];
        let b = vec![0.1f32; 44_100];
        let mut p = Preprocessor::new(vec![(ring(&a), format(48_000, 2)), (ring(&b), format(44_100, 1))]).unwrap();
        let mut out = Vec::new();
        p.drain(&mut out).unwrap();
        assert!(out.len() > 15_000 && out.len() <= 16_000, "{}", out.len());
        let steady = &out[4_000..out.len() - 4_000];
        let mean = steady.iter().sum::<f32>() / steady.len() as f32;
        assert!((mean - 0.3).abs() < 0.01, "{mean}");
    }

    #[test]
    fn one_source_going_quiet_does_not_stall_the_other() {
        // Nguồn b không có mẫu nào: sau lệch 100 ms, phần của nguồn a vẫn được phát (§6.1).
        let a = vec![0.2f32; 16_000];
        let mut p = Preprocessor::new(vec![(ring(&a), format(16_000, 1)), (ring(&[]), format(16_000, 1))]).unwrap();
        let mut out = Vec::new();
        p.drain(&mut out).unwrap();
        assert_eq!(out.len(), 16_000 - MAX_SKEW_SAMPLES);
    }

    #[test]
    fn the_clock_filler_inserts_silence_only_when_the_source_stalls() {
        use std::time::Duration;
        let mut f = ClockFiller::new(200);
        // Nguồn đều: 100 ms mỗi lần, đúng giờ (và trễ 150 ms, dưới dung sai).
        assert_eq!(f.silence_before(Duration::from_millis(100), 1_600), 0);
        assert_eq!(f.silence_before(Duration::from_millis(350), 1_600), 0);
        // Nguồn tắt 2 giây: bù đúng phần thiếu tới "bây giờ" (2,35 giây − 0,2 giây đã có − 0 mẫu mới).
        assert_eq!(f.silence_before(Duration::from_millis(2_350), 0), 34_400);
        // Nguồn chạy lại: không bù hai lần.
        assert_eq!(f.silence_before(Duration::from_millis(2_450), 1_600), 0);
    }

    #[test]
    fn zero_or_three_sources_are_refused() {
        assert!(Preprocessor::new(vec![]).is_err());
        let three = (0..3).map(|_| (ring(&[]), format(16_000, 1))).collect();
        assert!(Preprocessor::new(three).is_err());
    }
}
```

Tạo `crates/audio-capture/src/windows.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! WASAPI shared-mode endpoint loopback (spec §6.1). Code của kế hoạch 0-04, Task 7, thêm: chọn thiết bị theo id (người
//! dùng chọn tay), liệt kê thiết bị phát, và cờ `failed` khi luồng thu chết (thiết bị bị rút: `AUDCLNT_E_DEVICE_INVALIDATED`).
//!
//! Đọc theo timer 10 ms, không chờ sự kiện, vì loopback không báo sự kiện khi không có gì phát.
//! Khoảng trống được chèn im lặng theo đồng hồ QPC (`GapFiller`).

#[cfg(test)]
mod tests {
    use super::*;

    /// Cần Windows có thiết bị phát: danh sách không lỗi, và thiết bị mặc định nằm trong danh sách.
    #[test]
    #[ignore = "cần máy Windows có thiết bị phát"]
    fn the_default_device_is_listed() {
        let devices = list_render_devices().unwrap();
        let default = default_endpoint_id(Role::Console).unwrap();
        assert!(devices.iter().any(|d| d.id == default), "{devices:?}");
    }
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p audio-capture`
Expected: biên dịch lỗi:

```text
error[E0425]: cannot find function `default_output_device` in module `macos`
error[E0425]: cannot find type `AudioFormat` in this scope
error[E0422]: cannot find struct, variant or union type `AudioFormat` in this scope
error[E0425]: cannot find value `MAX_SKEW_SAMPLES` in this scope
error[E0433]: cannot find type `Preprocessor` in this scope
error[E0433]: cannot find type `ClockFiller` in this scope
```

- [ ] **Step 4: Viết code**

Sửa `crates/audio-capture/src/bin/capture.rs` (áp bằng `git apply`):

```diff
--- a/crates/audio-capture/src/bin/capture.rs
+++ b/crates/audio-capture/src/bin/capture.rs
@@ -132,7 +132,7 @@
 
 #[cfg(windows)]
 fn make_sources(args: &Args) -> Result<Vec<Source>> {
-    use audio_capture::windows::{LoopbackSource, Role, default_endpoint_id};
+    use audio_capture::windows::{Endpoint, LoopbackSource, Role, default_endpoint_id};
     let roles = match args.role.as_str() {
         "console" => vec![Role::Console],
         "communications" => vec![Role::Communications],
@@ -148,7 +148,7 @@
         .map(|role| {
             let stats = Arc::new(CaptureStats::default());
             (
-                Box::new(LoopbackSource::new(role, stats.clone())) as Box<dyn AudioSource>,
+                Box::new(LoopbackSource::new(Endpoint::Default(role), stats.clone())) as Box<dyn AudioSource>,
                 stats,
             )
         })
```

Sửa `crates/audio-capture/src/macos.rs` (áp bằng `git apply`):

```diff
--- a/crates/audio-capture/src/macos.rs
+++ b/crates/audio-capture/src/macos.rs
@@ -8,7 +8,7 @@
 //!
 //! Nếu chưa được cấp quyền, tap chỉ trả im lặng (chưa kiểm; dòng 2 của Task 6 sẽ cho biết).
 
-use crate::{AudioFormat, AudioSource, CaptureStats};
+use crate::{AudioApp, AudioFormat, AudioSource, CaptureStats};
 use anyhow::{Result, bail};
 use block2::RcBlock;
 use objc2::AllocAnyThread;
@@ -20,15 +20,17 @@
     AudioObjectGetPropertyDataSize, AudioObjectID, AudioObjectPropertyAddress, CATapDescription, CATapMuteBehavior,
     kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceIsStackedKey, kAudioAggregateDeviceNameKey,
     kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey,
-    kAudioDevicePropertyStreamConfiguration, kAudioHardwarePropertyTranslatePIDToProcessObject,
+    kAudioDevicePropertyStreamConfiguration, kAudioHardwarePropertyDefaultOutputDevice,
+    kAudioHardwarePropertyProcessObjectList, kAudioHardwarePropertyTranslatePIDToProcessObject,
     kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeInput,
-    kAudioObjectSystemObject, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
+    kAudioObjectSystemObject, kAudioProcessPropertyBundleID, kAudioProcessPropertyIsRunningOutput,
+    kAudioProcessPropertyPID, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
 };
 use objc2_core_audio_types::{
     AudioBuffer, AudioBufferList, AudioStreamBasicDescription, AudioTimeStamp, kAudioFormatFlagIsFloat,
     kAudioFormatFlagIsNonInterleaved,
 };
-use objc2_core_foundation::{CFArray, CFBoolean, CFDictionary, CFString, CFType};
+use objc2_core_foundation::{CFArray, CFBoolean, CFDictionary, CFRetained, CFString, CFType};
 use objc2_foundation::{NSArray, NSNumber};
 use std::cell::UnsafeCell;
 use std::ffi::{CStr, c_void};
@@ -40,6 +42,8 @@
 pub enum TapTarget {
     /// Toàn hệ thống, trừ chính app (mặc định, spec §6.1).
     SystemExceptSelf,
+    /// Toàn hệ thống, kể cả chính app: chỉ cho bước "Nghe thử" (§4.1 bước 6, Đ16 của kế hoạch 00), khi app tự phát câu mẫu.
+    System,
     /// Chỉ một app, theo pid.
     Process(i32),
 }
@@ -106,12 +110,13 @@
                 .into_iter()
                 .map(NSNumber::new_u32)
                 .collect(),
+            TapTarget::System => Vec::new(),
             TapTarget::Process(pid) => vec![NSNumber::new_u32(process_object(pid)?)],
         };
         let list = NSArray::from_retained_slice(&processes);
         let description = unsafe {
             match self.target {
-                TapTarget::SystemExceptSelf => {
+                TapTarget::SystemExceptSelf | TapTarget::System => {
                     CATapDescription::initStereoGlobalTapButExcludeProcesses(CATapDescription::alloc(), &list)
                 }
                 TapTarget::Process(_) => {
@@ -365,6 +370,89 @@
     Ok(aggregate_id)
 }
 
+/// Thiết bị phát mặc định của hệ thống. App hỏi định kỳ để biết thiết bị đã đổi (cắm tai nghe, Bluetooth), rồi khởi tạo
+/// lại việc thu (§9). Chỉ đọc thuộc tính của HAL, không cần quyền ghi âm thanh.
+pub fn default_output_device() -> Result<AudioObjectID> {
+    let mut id: AudioObjectID = 0;
+    get_property(
+        kAudioObjectSystemObject as AudioObjectID,
+        kAudioHardwarePropertyDefaultOutputDevice,
+        std::ptr::null(),
+        0,
+        &mut id,
+    )?;
+    Ok(id)
+}
+
+/// Các app đang phát âm thanh, cho tùy chọn "chỉ tap một app họp" (§6.1). Không cần quyền ghi âm thanh.
+pub fn audio_apps() -> Result<Vec<AudioApp>> {
+    let system = kAudioObjectSystemObject as AudioObjectID;
+    let mut address = AudioObjectPropertyAddress {
+        mSelector: kAudioHardwarePropertyProcessObjectList,
+        mScope: kAudioObjectPropertyScopeGlobal,
+        mElement: kAudioObjectPropertyElementMain,
+    };
+    let mut size = 0u32;
+    check(
+        unsafe {
+            AudioObjectGetPropertyDataSize(
+                system,
+                NonNull::from(&mut address),
+                0,
+                std::ptr::null(),
+                NonNull::from(&mut size),
+            )
+        },
+        "AudioObjectGetPropertyDataSize",
+    )?;
+    let mut ids = vec![0 as AudioObjectID; size as usize / size_of::<AudioObjectID>()];
+    if !ids.is_empty() {
+        check(
+            unsafe {
+                AudioObjectGetPropertyData(
+                    system,
+                    NonNull::from(&mut address),
+                    0,
+                    std::ptr::null(),
+                    NonNull::from(&mut size),
+                    NonNull::from(ids.as_mut_slice()).cast(),
+                )
+            },
+            "AudioObjectGetPropertyData",
+        )?;
+        ids.truncate(size as usize / size_of::<AudioObjectID>());
+    }
+    let mut apps = Vec::new();
+    for id in ids {
+        let mut running: u32 = 0;
+        if get_property(
+            id,
+            kAudioProcessPropertyIsRunningOutput,
+            std::ptr::null(),
+            0,
+            &mut running,
+        )
+        .is_err()
+            || running == 0
+        {
+            continue;
+        }
+        let mut pid: i32 = 0;
+        get_property(id, kAudioProcessPropertyPID, std::ptr::null(), 0, &mut pid)?;
+        let mut bundle: *const CFString = std::ptr::null();
+        get_property(id, kAudioProcessPropertyBundleID, std::ptr::null(), 0, &mut bundle)?;
+        // SAFETY: Core Audio trả một CFString đã retain (+1); `CFRetained` nhận quyền sở hữu và release khi xong.
+        let bundle_id = NonNull::new(bundle.cast_mut())
+            .map(|p| unsafe { CFRetained::from_raw(p) }.to_string())
+            .unwrap_or_default();
+        if pid != std::process::id() as i32 && !bundle_id.is_empty() {
+            apps.push(AudioApp { pid, bundle_id });
+        }
+    }
+    apps.sort_by(|a, b| a.bundle_id.cmp(&b.bundle_id));
+    Ok(apps)
+}
+
 fn process_object(pid: i32) -> Result<AudioObjectID> {
     let mut id: AudioObjectID = 0;
     get_property(
@@ -419,6 +507,20 @@
 }
 
 #[cfg(test)]
+mod hal {
+    use super::*;
+
+    /// Đọc danh sách app và thiết bị phát của máy thật; không tạo tap nên không hỏi quyền.
+    #[test]
+    #[ignore = "đọc thiết bị âm thanh của máy thật"]
+    fn default_device_and_audio_apps_can_be_read() {
+        assert_ne!(default_output_device().unwrap(), 0);
+        let apps = audio_apps().unwrap();
+        assert!(apps.iter().all(|a| a.pid > 0 && !a.bundle_id.is_empty()), "{apps:?}");
+    }
+}
+
+#[cfg(test)]
 mod synthetic {
     //! Kiểm on_io bằng AudioBufferList dựng tay trong bộ nhớ. Không gọi Core Audio.
     use super::*;
```

Thêm vào `crates/audio-capture/src/preprocess.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::AudioFormat;
use crate::mix::Mixer2;
use crate::resample::{MonoResampler, TARGET_RATE};
use anyhow::{Result, bail};

/// Ring buffer của mỗi nguồn chứa được 30 giây âm thanh 48 kHz stereo (spec §6.1). Thiết bị có tần số hay số kênh lớn
/// hơn thì ring chứa được ít giây hơn; luồng tiền xử lý đọc ring mỗi 20 ms nên vẫn dư nhiều.
pub const RING_SAMPLES: usize = 48_000 * 2 * 30;

/// Lệch tối đa giữa hai nguồn trước khi phần dư được phát riêng: 100 ms ở 16 kHz (như công cụ `capture`).
pub const MAX_SKEW_SAMPLES: usize = TARGET_RATE as usize / 10;

struct Input {
    consumer: rtrb::Consumer<f32>,
    resampler: MonoResampler,
    mono: Vec<f32>,
}

pub struct Preprocessor {
    inputs: Vec<Input>,
    mixer: Mixer2,
    raw: Vec<f32>,
}

impl Preprocessor {
    /// `inputs`: ring buffer và định dạng của từng nguồn (một hoặc hai nguồn).
    pub fn new(inputs: Vec<(rtrb::Consumer<f32>, AudioFormat)>) -> Result<Self> {
        if !(1..=2).contains(&inputs.len()) {
            bail!("cần một hoặc hai nguồn, nhận {}", inputs.len());
        }
        let inputs = inputs
            .into_iter()
            .map(|(consumer, format)| {
                Ok(Input {
                    consumer,
                    resampler: MonoResampler::new(format.sample_rate, format.channels)?,
                    mono: Vec::new(),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            inputs,
            mixer: Mixer2::new(MAX_SKEW_SAMPLES),
            raw: Vec::new(),
        })
    }

    /// Đọc hết mẫu đang có ở mọi nguồn, ghi thêm mẫu 16 kHz mono vào `out`.
    pub fn drain(&mut self, out: &mut Vec<f32>) -> Result<()> {
        for input in &mut self.inputs {
            self.raw.clear();
            let available = input.consumer.slots();
            if available > 0 {
                let chunk = input.consumer.read_chunk(available)?;
                let (a, b) = chunk.as_slices();
                self.raw.extend_from_slice(a);
                self.raw.extend_from_slice(b);
                chunk.commit_all();
            }
            input.resampler.process(&self.raw, &mut input.mono)?;
        }
        match self.inputs.as_mut_slice() {
            [only] => out.append(&mut only.mono),
            [a, b] => {
                self.mixer.push_a(&a.mono);
                self.mixer.push_b(&b.mono);
                a.mono.clear();
                b.mono.clear();
                self.mixer.drain_into(out);
            }
            _ => unreachable!("đã kiểm ở `new`"),
        }
        Ok(())
    }
}

/// Giữ luồng 16 kHz đi đúng đồng hồ thật khi nguồn không trả mẫu (macOS: tap chưa chạy vì đang chờ app phát tiếng, hoặc
/// đang khởi tạo lại sau khi đổi thiết bị): chèn im lặng bù phần thiếu, như `GapFiller` làm trên Windows (§6.1). Nhờ vậy
/// thời gian của phụ đề không lệch, và "không có âm thanh" (§9) vẫn được phát hiện. Nguồn chạy đều thì không chèn gì.
#[derive(Debug)]
pub struct ClockFiller {
    produced: u64,
    tolerance: u64,
}

impl ClockFiller {
    /// `tolerance_ms`: thiếu dưới mức này thì coi là trễ của bộ đệm, không chèn.
    pub fn new(tolerance_ms: u64) -> Self {
        Self {
            produced: 0,
            tolerance: tolerance_ms * TARGET_RATE as u64 / 1000,
        }
    }

    /// `elapsed`: thời gian thật từ lúc bắt đầu; `new_samples`: số mẫu nguồn vừa trả. Trả số mẫu im lặng cần chèn trước
    /// các mẫu đó.
    pub fn silence_before(&mut self, elapsed: std::time::Duration, new_samples: usize) -> usize {
        let expected = (elapsed.as_micros() as u64) * TARGET_RATE as u64 / 1_000_000;
        let have = self.produced + new_samples as u64;
        let deficit = expected.saturating_sub(have);
        let fill = if deficit > self.tolerance { deficit } else { 0 };
        self.produced = have + fill;
        fill as usize
    }
}
```

Thêm vào `crates/audio-capture/src/windows.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::gapfill::GapFiller;
use crate::{AudioFormat, AudioSource, CaptureStats};
use anyhow::{Context, Result, anyhow};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Duration;
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::{
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
    AUDCLNT_STREAMFLAGS_LOOPBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, DEVICE_STATE_ACTIVE, ERole,
    IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, WAVEFORMATEX,
    eCommunications, eConsole, eRender,
};
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, STGM_READ,
};
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};
use windows::core::{HSTRING, PWSTR};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    /// Thiết bị phát mặc định.
    Console,
    /// Thiết bị mặc định cho liên lạc; app họp hay dùng thiết bị này với tai nghe Bluetooth.
    Communications,
}

impl Role {
    fn erole(self) -> ERole {
        match self {
            Role::Console => eConsole,
            Role::Communications => eCommunications,
        }
    }
}

/// Thiết bị để thu loopback.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Endpoint {
    /// Thiết bị mặc định của một vai trò (chế độ tự động, §6.1).
    Default(Role),
    /// Một thiết bị người dùng chọn tay, theo id endpoint (`AudioSource::Device` trong cài đặt).
    Device(String),
}

/// Một thiết bị phát đang hoạt động, cho danh sách ở Cài đặt › Âm thanh.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderDevice {
    pub id: String,
    pub name: String,
}

pub struct LoopbackSource {
    endpoint: Endpoint,
    format: AudioFormat,
    stats: Arc<CaptureStats>,
    stop: Arc<AtomicBool>,
    failed: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

/// Chạy `f` với COM ở chế độ MTA trên luồng hiện tại.
fn with_com<T>(f: impl FnOnce() -> Result<T>) -> Result<T> {
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
    let result = f();
    unsafe { CoUninitialize() };
    result
}

fn pwstr_to_string(p: PWSTR) -> Result<String> {
    let text = unsafe { p.to_string() };
    unsafe { CoTaskMemFree(Some(p.0 as *const _)) };
    Ok(text?)
}

/// Id của thiết bị phát mặc định cho một vai trò. Hai vai trò thường trỏ cùng một thiết bị; khi đó chỉ thu một lần, để
/// không cộng tiếng hai lần (spec §6.1). App hỏi hàm này định kỳ để biết thiết bị đã đổi chưa (§9).
pub fn default_endpoint_id(role: Role) -> Result<String> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role.erole())? };
        pwstr_to_string(unsafe { device.GetId()? })
    })
}

/// Các thiết bị phát đang hoạt động, kèm tên hiển thị.
pub fn list_render_devices() -> Result<Vec<RenderDevice>> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let collection = unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)? };
        let mut devices = Vec::new();
        for i in 0..unsafe { collection.GetCount()? } {
            let device = unsafe { collection.Item(i)? };
            let id = pwstr_to_string(unsafe { device.GetId()? })?;
            let store = unsafe { device.OpenPropertyStore(STGM_READ)? };
            let name = unsafe { store.GetValue(&PKEY_Device_FriendlyName)? }.to_string();
            devices.push(RenderDevice { id, name });
        }
        Ok(devices)
    })
}

fn open_device(enumerator: &IMMDeviceEnumerator, endpoint: &Endpoint) -> Result<IMMDevice> {
    Ok(match endpoint {
        Endpoint::Default(role) => unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role.erole())? },
        Endpoint::Device(id) => unsafe { enumerator.GetDevice(&HSTRING::from(id.as_str()))? },
    })
}

impl LoopbackSource {
    pub fn new(endpoint: Endpoint, stats: Arc<CaptureStats>) -> Self {
        Self {
            endpoint,
            format: AudioFormat {
                sample_rate: 0,
                channels: 0,
            },
            stats,
            stop: Arc::new(AtomicBool::new(false)),
            failed: Arc::new(AtomicBool::new(false)),
            thread: None,
        }
    }
}

impl AudioSource for LoopbackSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<AudioFormat, String>>();
        let endpoint = self.endpoint.clone();
        let (stop, failed, stats) = (self.stop.clone(), self.failed.clone(), self.stats.clone());
        self.thread = Some(std::thread::spawn(move || {
            if let Err(e) = capture_thread(&endpoint, sink, stop, stats, &ready_tx) {
                failed.store(true, Ordering::SeqCst);
                let _ = ready_tx.send(Err(format!("{e:#}")));
            }
        }));
        self.format = ready_rx
            .recv_timeout(Duration::from_secs(5))
            .context("luồng thu không phản hồi")?
            .map_err(|e| anyhow!(e))?;
        Ok(())
    }

    fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }

    fn format(&self) -> AudioFormat {
        self.format
    }

    fn failed(&self) -> bool {
        self.failed.load(Ordering::SeqCst)
    }
}

impl Drop for LoopbackSource {
    fn drop(&mut self) {
        self.stop();
    }
}

fn capture_thread(
    endpoint: &Endpoint,
    mut sink: rtrb::Producer<f32>,
    stop: Arc<AtomicBool>,
    stats: Arc<CaptureStats>,
    ready: &mpsc::Sender<Result<AudioFormat, String>>,
) -> Result<()> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = open_device(&enumerator, endpoint)?;
        let client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None)? };

        let mix = unsafe { client.GetMixFormat()? };
        let (rate, channels) = unsafe { ((*mix).nSamplesPerSec, (*mix).nChannels) };
        unsafe { CoTaskMemFree(Some(mix as *const _)) };
        // Xin float32 ở cùng tần số và số kênh; WASAPI tự đổi định dạng nếu cần.
        let wanted = WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
            nChannels: channels,
            nSamplesPerSec: rate,
            nAvgBytesPerSec: rate * channels as u32 * 4,
            nBlockAlign: channels * 4,
            wBitsPerSample: 32,
            cbSize: 0,
        };
        let flags =
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
        unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 1_000_000, 0, &wanted, None)? };
        let capture: IAudioCaptureClient = unsafe { client.GetService()? };
        unsafe { client.Start()? };
        let _ = ready.send(Ok(AudioFormat {
            sample_rate: rate,
            channels,
        }));

        let channels = channels as usize;
        let mut gaps = GapFiller::new(rate);
        let push_silence = |sink: &mut rtrb::Producer<f32>, frames: u32| {
            for _ in 0..frames as usize * channels {
                if sink.push(0.0).is_err() {
                    stats.dropped.fetch_add(1, Ordering::Relaxed);
                }
            }
            stats.silence_inserted.fetch_add(frames as u64, Ordering::Relaxed);
        };

        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(10));
            let mut got_packet = false;
            while unsafe { capture.GetNextPacketSize()? } > 0 {
                let mut data = std::ptr::null_mut();
                let mut frames = 0u32;
                let mut buffer_flags = 0u32;
                let mut qpc = 0u64;
                unsafe { capture.GetBuffer(&mut data, &mut frames, &mut buffer_flags, None, Some(&mut qpc))? };
                let action = gaps.on_packet(qpc, frames);
                if action.silence_before > 0 {
                    push_silence(&mut sink, action.silence_before);
                }
                let keep = frames - action.skip;
                if buffer_flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                    for _ in 0..keep as usize * channels {
                        let _ = sink.push(0.0);
                    }
                } else {
                    let samples = unsafe { std::slice::from_raw_parts(data as *const f32, frames as usize * channels) };
                    for &s in &samples[action.skip as usize * channels..] {
                        if sink.push(s).is_err() {
                            stats.dropped.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
                unsafe { capture.ReleaseBuffer(frames)? };
                stats.frames.fetch_add(keep as u64, Ordering::Relaxed);
                stats.skipped.fetch_add(action.skip as u64, Ordering::Relaxed);
                got_packet = true;
            }
            if !got_packet {
                let silence = gaps.on_idle(qpc_now_hns()?);
                if silence > 0 {
                    push_silence(&mut sink, silence);
                }
            }
        }
        unsafe { client.Stop()? };
        Ok(())
    })
}

/// Thời điểm hiện tại theo QPC, đơn vị 100 ns (cùng đơn vị với `GetBuffer`).
fn qpc_now_hns() -> Result<u64> {
    let (mut counter, mut freq) = (0i64, 0i64);
    unsafe {
        QueryPerformanceCounter(&mut counter)?;
        QueryPerformanceFrequency(&mut freq)?;
    }
    Ok((counter as u128 * 10_000_000 / freq as u128) as u64)
}
```

Sửa `crates/pipeline/src/process.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/process.rs
+++ b/crates/pipeline/src/process.rs
@@ -139,12 +139,12 @@
     }
 }
 
-#[cfg(test)]
+// Test chỉ có trên Unix: trên Windows, việc dọn tiến trình phụ là của Job Object (cần máy Windows để thử).
+#[cfg(all(test, unix))]
 mod tests {
     use super::*;
     use std::time::{Duration, Instant};
 
-    #[cfg(unix)]
     #[test]
     fn a_child_leads_its_own_process_group_and_is_killed_with_it() {
         let mut cmd = Command::new("sleep");
```

Tạo `scripts/fake-pkg-config`:

```bash
#!/bin/sh
# pkg-config giả, chỉ dùng cho scripts/check-windows.sh. candle-core 0.11 luôn kéo `tokenizers` với feature `onig`, nên
# `onig_sys` biên dịch thư viện C oniguruma cho target Windows, mà Mac không có header của MSVC. Với
# RUSTONIG_DYNAMIC_LIBONIG=1, build script của onig_sys hỏi pkg-config trước: script này trả lời như đã có oniguruma
# (kèm một oniguruma.h rỗng), nên không có gì phải biên dịch. `cargo check` và `cargo clippy` không link, nên thư viện
# giả không bao giờ được dùng. Không dùng script này để build bản chạy thật.
inc="${TMPDIR:-/tmp}/meeting-translator-fake-onig"
mkdir -p "$inc"
: > "$inc/oniguruma.h"
for arg in "$@"; do
  case "$arg" in
    --modversion) echo "6.9.10"; exit 0 ;;
    --libs|--cflags) echo "-I$inc -lonig"; exit 0 ;;
  esac
done
exit 0
```

Run: `chmod +x scripts/fake-pkg-config`

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p audio-capture`
Expected:

```text
test result: ok. 28 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.07s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.78s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Test bỏ qua của macOS chỉ đọc thuộc tính của Core Audio HAL (thiết bị phát mặc định, danh sách tiến trình phát tiếng), không tạo tap nên không bật hộp thoại quyền:

Run: `cargo test -p audio-capture --lib -- --include-ignored default_device_and_audio_apps`
Expected:

```text
test macos::hal::default_device_and_audio_apps_can_be_read ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 28 filtered out; finished in 0.18s
```

- [ ] **Step 6: Clippy cho Mac và cho target Windows** (cần một lần: `rustup target add x86_64-pc-windows-msvc`)

Run:
```bash
cargo clippy -p audio-capture -p pipeline --all-targets -- -D warnings
RC_x86_64_pc_windows_msvc=$PWD/scripts/fake-llvm-rc PKG_CONFIG_x86_64_pc_windows_msvc=$PWD/scripts/fake-pkg-config \
PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 \
  cargo clippy -p audio-capture -p pipeline --target x86_64-pc-windows-msvc --all-targets -- -D warnings
cargo fmt --all -- --check
```
Expected: không có cảnh báo; lệnh thứ hai kết thúc bằng `Finished \`dev\` profile`; `cargo fmt` không in gì.

- [ ] **Step 7: Kiểm toàn bộ phần crate** (mục 6.2 của kế hoạch 00)

Run:
```bash
cargo test --workspace
cargo test -p asr-worker --features shared-encode
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo deny check && cargo audit
```
Expected: mọi test qua; clippy không cảnh báo;

```text
advisories ok, bans ok, licenses ok, sources ok
```

`cargo audit` báo 3 cảnh báo đã được cho phép, như trước kế hoạch này:

```text
Crate:     paste
ID:        RUSTSEC-2024-0436
Crate:     proc-macro-error
ID:        RUSTSEC-2024-0370
Crate:     glib
ID:        RUSTSEC-2024-0429
warning: 3 allowed warnings found
```

Tổng số test của `cargo test --workspace` (gồm cả lib của app từ 01):

```text
passed 334 failed 0 ignored 7
```

- [ ] **Step 8: Commit**

```bash
git add crates/audio-capture/Cargo.toml \
  crates/audio-capture/src/bin/capture.rs \
  crates/audio-capture/src/lib.rs \
  crates/audio-capture/src/macos.rs \
  crates/audio-capture/src/preprocess.rs \
  crates/audio-capture/src/windows.rs \
  crates/pipeline/Cargo.toml \
  crates/pipeline/src/process.rs \
  scripts/fake-pkg-config
git commit -m "feat(audio-capture): nguồn âm thanh cho app: chọn thiết bị, danh sách app, tiền xử lý dùng chung" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Đo `no_speech_prob` và tỉ lệ token (Đ12)

Không đổi code. Ghi kết quả đo để chủ dự án quyết (dòng 115, 149, 279; QĐ22). Không đo thời gian, nên không cần máy rảnh; `llama-server` và `asr-worker` vẫn dùng GPU, nên đừng chạy cùng lúc với Task 7–9.

**Cần người thao tác (Step 2):** clip nhạc có quyền dùng (Đ12). Chưa có thì làm các bước còn lại, ghi "chờ clip nhạc" và đi tiếp.

**Files:**
- Create: `bench/phase0/results/gd1_no_speech.md`
- Create: `bench/phase0/results/gd1_mt_ratio.md`

- [ ] **Step 1: `no_speech_prob` trên tín hiệu tổng hợp**

Run:
```bash
mkdir -p bench/phase0/data/asr/no_speech
for m in large-v3-turbo-q5_0 small-q5_1; do
  MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-$m.bin \
  MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx \
    cargo test -q -p pipeline --test no_speech -- --include-ignored --nocapture \
    | grep '^{' > bench/phase0/data/asr/no_speech/$m.jsonl
done
python3 - <<'EOF'
import json
out = ["# no_speech_prob trên âm thanh không có tiếng nói (Đ12)", "",
       "Sinh từ `crates/pipeline/tests/no_speech.rs` (kế hoạch Giai đoạn 1 · 02b, Task 6).", ""]
for m in ("large-v3-turbo-q5_0", "small-q5_1"):
    rows = [json.loads(l) for l in open(f"bench/phase0/data/asr/no_speech/{m}.jsonl", encoding="utf-8")]
    out += [f"## {m} ({rows[0].get('backend', '?')})", "",
            "| Tín hiệu | VAD cắt ra (đoạn) | no_speech_prob | avg_logprob | Luật lọc | Chữ |", "|---|---|---|---|---|---|"]
    for r in rows:
        if "signal" in r:
            out.append(f"| {r['signal']} | {r['vad_segments']} | {r['no_speech_prob']:.2g} | {r['avg_logprob']:.2f} "
                       f"| {r['verdict']} | {r['text'][:40]} |")
    total = [r for r in rows if "shown_as_subtitle" in r][0]
    out += ["", f"Hiện thành phụ đề trong app: {total['shown_as_subtitle']}/{total['segments']}.", ""]
open("bench/phase0/results/gd1_no_speech.md", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
EOF
```
Expected: hai bảng 14 dòng. Lúc lập kế hoạch (Task 3, Step 4): VAD không cắt ra đoạn nào từ cả 14 tín hiệu, nên "Hiện thành phụ đề trong app: 0/14" ở cả hai model. Không có VAD thì turbo không bỏ được đoạn nào theo `no_speech_prob` (luôn cỡ 1e-10).

- [ ] **Step 2: Với nhạc (cần người)**

Nhờ người đưa vài clip nhạc có quyền dùng (ví dụ nhạc tự làm, hay nhạc có giấy phép CC0), mỗi clip 10–60 giây, có nhạc không lời và nhạc có lời. Đổi sang 16 kHz mono: `afconvert -f WAVE -d LEI16@16000 -c 1 <vào> <ra>.wav`. Rồi chạy lại Step 1 với `NO_SPEECH_WAVS=<clip1.wav>,<clip2.wav>` đặt trước `cargo test`, cho cả hai model.

Expected: mỗi clip thêm tối đa 10 dòng (mỗi dòng một đoạn 8 giây). Ghi vào đầu `gd1_no_speech.md` một đoạn kết luận: bao nhiêu đoạn nhạc VAD cắt ra, bao nhiêu đoạn hiện thành phụ đề, chữ bịa ra là gì. Có đoạn nhạc hiện thành phụ đề thì ghi đề xuất luật lọc thêm (ví dụ ngưỡng `avg_logprob` riêng cho turbo) để chủ dự án quyết; không tự sửa luật lọc.

- [ ] **Step 3: Tỉ lệ token cho cặp không có tiếng Việt và câu gốc rất ngắn**

Run (khoảng 1440 câu mỗi model):
```bash
python3 bench/phase0/mt/build_ratio_set.py
for m in Q8_0 Q4_K_M; do
  cargo run -q --release -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_ratio.jsonl \
    --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
    --model $PWD/models/Hy-MT2-1.8B-$m.gguf --out-dir bench/phase0/data/mt/outputs-gd1-ratio
done
python3 bench/phase0/mt/ratio_stats.py bench/phase0/data/mt/outputs-gd1-ratio/Hy-MT2-1.8B-Q8_0-plain.jsonl \
  bench/phase0/data/mt/outputs-gd1-ratio/Hy-MT2-1.8B-Q4_K_M-plain.jsonl --out bench/phase0/results/gd1_mt_ratio.md
```
Expected: hai bảng, mỗi bảng 20 dòng (12 chiều không có tiếng Việt, 8 chiều có tiếng Việt chỉ gồm câu ngắn). Cột "lỗi" là số câu dịch lỗi cả hai lần (`failed`): với cặp chưa có ngưỡng thì chỉ có thể do rỗng, xuống dòng kiểu lời giải thích, hay chạm hạn mức sinh.

Thêm vào cuối `gd1_mt_ratio.md` một đoạn đề xuất:
- ngưỡng cho 12 chiều mới, lấy số lớn hơn của hai model ở cột "ngưỡng đề xuất";
- câu gốc dưới 3 token: hạn mức sinh `4 × số token + 32` có đủ không (so cột "token dịch lớn nhất" với cột "hạn mức sinh").

Ngưỡng chỉ vào `DEFAULT_RATIO_THRESHOLDS` (`crates/pipeline/src/config.rs`) sau khi chủ dự án duyệt (điểm cần quyết 8).

- [ ] **Step 4: Commit**

```bash
git add bench/phase0/results/gd1_no_speech.md bench/phase0/results/gd1_mt_ratio.md
git commit -m "test(bench): đo no_speech_prob và tỉ lệ token cho cặp không có tiếng Việt (Đ12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: Chạy lại A3 bằng code dịch của app (cần máy rảnh)

Mục 6.7 của kế hoạch 00: 02a Task 4–6 và Task 2 của file này đổi hậu xử lý, tham số sinh và cách gọi `llama-server` (prompt không đổi), nên chạy lại A3. Lần đầu dịch bằng `mt-eval` (Đ4) thay cho `translate.py`, nên đây cũng là mốc mới đầu tiên của A3 qua đúng code của app.

**Cần người thao tác (Step 1).** Lâu: dịch 4 lượt (khoảng 15 phút trên M4 Pro theo kế hoạch 0-02), chấm COMET khoảng 5 phút.

**Files:**
- Create: `bench/phase0/results/s7_mt-gd1-mteval.json`, `bench/phase0/results/s7_mt-gd1-mteval.md` (script sinh ra)

- [ ] **Step 1: Chuẩn bị máy rảnh** (mục 6.9 của kế hoạch 00; dùng chung cho Task 7–9)

Nhờ người: đóng Docker Desktop, Chrome, Safari; tắt server của `stock_app` đang nghe cổng 8000; cắm sạc. Chờ người xác nhận, rồi kiểm:

```bash
pgrep -l -f 'Docker Desktop|Google Chrome|Safari' || echo "không còn app nặng"
lsof -nP -iTCP:8000 -sTCP:LISTEN || echo "cổng 8000 trống"
pmset -g batt | head -1
sysctl vm.swapusage
```
Expected: `không còn app nặng`, `cổng 8000 trống`, `Now drawing from 'AC Power'`, swap gần trống (`used` dưới vài trăm MB). Chép bốn dòng này vào cuối file kết quả của task (Step 4). Còn app nặng hay đang chạy pin thì dừng, báo người.

- [ ] **Step 2: Dịch bộ test A3 bằng `mt-eval`**

Run:
```bash
cargo build --release -p latency-bench
for m in Q8_0 Q4_K_M; do for v in plain context; do
  target/release/latency-bench mt-eval --testset bench/phase0/data/mt/testset_phase0.jsonl \
    --llama-server tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
    --model models/Hy-MT2-1.8B-$m.gguf --out-dir bench/phase0/data/mt/outputs-gd1-mteval --variant $v
done; done
```
Expected: mỗi lượt in `… 620 câu, còn 620 câu phải dịch` (lượt `context` ít câu hơn, chỉ câu có ngữ cảnh), tiến độ mỗi 25 câu, và kết thúc không lỗi. Bị ngắt giữa chừng thì chạy lại đúng lệnh: `mt-eval` dịch tiếp.

- [ ] **Step 3: Chấm COMET và so với mốc S7**

Run:
```bash
uv run --no-project --python 3.12 --with "unbabel-comet==2.2.7" --with "numpy<2" \
  --with "transformers<5" --with "setuptools<82" python bench/phase0/mt/score_mt.py \
  --outputs bench/phase0/data/mt/outputs-gd1-mteval --label gd1-mteval --baseline bench/phase0/results/s7_mt.json
```
Expected:
- Ba bảng như kế hoạch 0-02 Task 6, cột "Mức sàn (A3)" ghi `đạt`.
- Bảng cuối "So với mốc (chống thụt lùi A3)": mọi dòng `đạt` (không chiều nào thấp hơn mốc quá 0,01), và lệnh thoát mã 0.
- Lệnh thoát với thông báo `có chiều thấp hơn mốc quá 0,01` thì không làm tiếp phần dịch; báo chủ dự án kèm bảng (mục 6.7). Chủ dự án quyết: sửa hậu xử lý, hay duyệt mốc mới.

- [ ] **Step 4: Ghi trạng thái máy và commit**

Thêm vào cuối `bench/phase0/results/s7_mt-gd1-mteval.md` một mục "Máy lúc chạy" với bốn dòng của Step 1 và commit của code (`git rev-parse --short HEAD`).

```bash
git add bench/phase0/results/s7_mt-gd1-mteval.json bench/phase0/results/s7_mt-gd1-mteval.md
git commit -m "test(bench): A3 dịch bằng code của app (mt-eval), so với mốc S7" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Chạy lại A4 và lượt fullctx (cần máy rảnh)

Mục 6.7 của kế hoạch 00 và C12: 02a Task 1 đổi giao thức, cách giữ ngôn ngữ trước và bản vá whisper.cpp. Chạy lại A4 cho cả hai model, cùng lượt cửa sổ 30 giây đầy đủ (`--full-ctx`) trên cùng bản build, để kiểm giả định 8 (§14).

**Cần người thao tác:** máy rảnh như Task 7, Step 1 (kiểm lại bốn lệnh nếu đã nghỉ giữa hai task). Lâu: 4 lượt × 548 clip.

**Files:**
- Create: `bench/phase0/results/a4_m4pro-{turbo,small}-gd1-prevlang.json`, `bench/phase0/results/a4_m4pro-{turbo,small}-gd1-fullctx.json` (script sinh ra)
- Create: `bench/phase0/results/gd1_a4.md`

- [ ] **Step 1: Chép lời bộ clip A4** (bộ clip ở `bench/phase0/data/asr/`, kế hoạch 0-03 Task 10)

Run:
```bash
cargo build --release -p latency-bench
cargo build --release -p asr-worker --features metal,shared-encode
for pair in "turbo large-v3-turbo-q5_0" "small small-q5_1"; do
  set -- $pair
  target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
    --asr-worker target/release/asr-worker --asr-model models/ggml-$2.bin \
    --out bench/phase0/data/asr/out-m4pro-$1-gd1-prevlang.jsonl --log-dir bench/phase0/data/asr/logs || break
  target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
    --asr-worker target/release/asr-worker --asr-model models/ggml-$2.bin --full-ctx \
    --out bench/phase0/data/asr/out-m4pro-$1-gd1-fullctx.jsonl --log-dir bench/phase0/data/asr/logs || break
done
```
Expected: mỗi lượt in `asr: metal (1.8.3), chế độ giải mã shared`, tiến độ mỗi 20 clip, tới `540 clip`.

- [ ] **Step 2: Chấm WER/CER**

Run:
```bash
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-m4pro-{turbo,small}-gd1-{prevlang,fullctx}.jsonl > bench/phase0/data/asr/gd1_a4_table.md
```
Expected: bốn file `bench/phase0/results/a4_m4pro-*-gd1-*.json`, và bảng trong `gd1_a4_table.md`.

- [ ] **Step 3: So với mốc A4 và kiểm giả định 8**

Run:
```bash
python3 - <<'EOF'
import json
R = "bench/phase0/results"
def load(name):
    return json.load(open(f"{R}/a4_m4pro-{name}.json", encoding="utf-8"))
lines = ["# A4 sau Giai đoạn 1 · 02 (giao thức bản 2, prev_lang trong yêu cầu)", "",
         "## So với mốc A4 (`-final`): nhóm wb không xấu hơn quá 10% (tương đối)", "",
         "| Model | Nhóm | Chỉ số | Mốc | Lượt này | Chênh | Kết luận |", "|---|---|---|---|---|---|---|"]
bad = False
for m in ("turbo", "small"):
    base, new = load(f"{m}-final"), load(f"{m}-gd1-prevlang")
    for k in sorted(base):
        if not k.endswith("-wb"):
            continue
        metric = "cer" if "cer" in base[k] else "wer"
        b, n = base[k][metric], new[k][metric]
        ok = n <= b * 1.10 + 1e-9
        bad |= not ok
        lines.append(f"| {m} | {k} | {metric.upper()} | {b:.3f} | {n:.3f} | {(n - b) / b * 100:+.1f}% | {'đạt' if ok else 'THỤT LÙI'} |")
lines += ["", "## Giả định 8: (mặc định − fullctx) / fullctx ≤ 10%, cùng bản build", "",
          "| Model | Nhóm | Mặc định | fullctx | Chênh | Kết luận |", "|---|---|---|---|---|---|"]
for m in ("turbo", "small"):
    d, f = load(f"{m}-gd1-prevlang"), load(f"{m}-gd1-fullctx")
    for k in sorted(d):
        if not k.endswith("-wb"):
            continue
        metric = "cer" if "cer" in d[k] else "wer"
        a, b = d[k][metric], f[k][metric]
        rel = (a - b) / b * 100 if b else 0.0
        lines.append(f"| {m} | {k} | {a:.3f} | {b:.3f} | {rel:+.1f}% | {'đạt' if rel <= 10 else 'quá 10%'} |")
open(f"{R}/gd1_a4.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
raise SystemExit(1 if bad else 0)
EOF
```
Expected:
- Bảng đầu: mọi dòng `đạt`. `asr-eval` truyền `prev_lang` đúng như worker cũ tự giữ (QĐ2), và không gửi prompt, nên WER/CER thường trùng mốc tới ba chữ số.
- Bảng thứ hai là kết quả của C12, không phải điều kiện đạt: ghi lại để so với `s7_asr.md` (lúc lập mốc, 3/10 ô quá 10%).
- Lệnh thoát mã 1 (có dòng `THỤT LÙI`) thì không đi tiếp; báo chủ dự án kèm bảng (mục 6.7).

- [ ] **Step 4: Ghi trạng thái máy và commit**

Thêm mục "Máy lúc chạy" (bốn dòng như Task 7, Step 1) và commit của code vào cuối `gd1_a4.md`.

```bash
git add bench/phase0/results/a4_m4pro-turbo-gd1-prevlang.json bench/phase0/results/a4_m4pro-small-gd1-prevlang.json \
  bench/phase0/results/a4_m4pro-turbo-gd1-fullctx.json bench/phase0/results/a4_m4pro-small-gd1-fullctx.json \
  bench/phase0/results/gd1_a4.md
git commit -m "test(bench): A4 và lượt fullctx sau giao thức bản 2 (C12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: Chạy lại S6 (cần máy rảnh)

Mục 6.7 của kế hoạch 00: 02a và Task 1–5 của file này đổi giao thức, lọc đoạn, phồn thể sang giản thể và hậu xử lý, có thể làm chậm pipeline. `latency-bench latency` dùng đúng luật của `pipeline` (Đ3), nên đo lại S6 như kế hoạch 0-06 Task 7.

**Cần người thao tác:** máy rảnh như Task 7, Step 1. Không chạy gì khác trong lúc đo. Lâu: 12 session, mỗi gói khoảng 20 phút (kế hoạch 0-06 Task 7).

**Files:**
- Create: `bench/phase0/results/latency/m4pro-gd1-khuyennghi-{chuan,nhe}-{en,ja,ko,mixed,vi,zh}.json` (script sinh ra)

- [ ] **Step 1: Kiểm máy rảnh lần nữa** (bốn lệnh của Task 7, Step 1). Expected như ở đó.

- [ ] **Step 2: Đo**

Run:
```bash
cargo build --release -p latency-bench
cargo build --release -p asr-worker --features metal,shared-encode
python3 bench/phase0/latency/run_matrix.py --machine m4pro-gd1 --tier khuyennghi --package chuan
python3 bench/phase0/latency/run_matrix.py --machine m4pro-gd1 --tier khuyennghi --package nhe
```
Expected: 12 file `m4pro-gd1-khuyennghi-*.json`. Script dừng trước một session nếu còn `llama-server` hay `asr-worker` sót lại (báo pid): kill pid đó rồi chạy lại.

- [ ] **Step 3: So với lượt cấu hình chốt**

Run: `python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json bench/phase0/results/latency/m4pro-gd1-khuyennghi-*.json`
Expected:
- Cột A2 ghi `đạt` ở cả 24 dòng.
- Mỗi session, p50 và p90 của lượt `gd1` không cao hơn lượt `chot` quá 10%. Lượt `chot` (kế hoạch 0-06 Task 7): p50 lớn nhất 1028 ms (Chuẩn), 844 ms (Nhẹ); p90 lớn nhất 1341 ms, 1142 ms.
- Số đoạn bỏ qua có thể thêm lý do `hallucination` (QĐ4); ở dữ liệu S6 cũ, luật này không bỏ đoạn nào.
- Có dòng `KHÔNG ĐẠT`, `KHÔNG KẾT LUẬN`, hay chậm hơn quá 10%: không đi tiếp; báo chủ dự án kèm bảng và trạng thái máy.

- [ ] **Step 4: Commit**

```bash
git add bench/phase0/results/latency/m4pro-gd1-khuyennghi-*.json
git commit -m "test(bench): S6 sau phần crate của kế hoạch 02 trên Mac M4 Pro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Phần crate của kế hoạch 02 xong ở đây. Đi tiếp `docs/superpowers/plans/2026-10-01-giai-doan-1-02c-pipeline-app.md`; Task 2 của kế hoạch 00 (cập nhật bảng đối chiếu) làm một lần ở cuối 02c cho cả ba file.
