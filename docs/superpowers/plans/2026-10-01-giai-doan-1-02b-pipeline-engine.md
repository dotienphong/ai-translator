# Giai đoạn 1 · 02b: Pipeline trong app — engine, test từ file WAV, công cụ đo, nguồn âm thanh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần thứ ba của kế hoạch 02 (mục 2.2 của kế hoạch 00), sau 02a và 02d:
- phụ đề và sự kiện theo §6.6, hai hàng đợi chống nghẽn của §7, số đo của phiên;
- engine của một phiên dịch: âm thanh 16 kHz vào, `subtitle://upsert` và `subtitle://delta` ra; dừng trong hạn 3 giây và dịch nốt câu cuối; đếm phút cho hạn mức qua `EventSink::usage` và dừng khi chạm hạn mức (§6.8, kế hoạch 06 nối vào);
- test tích hợp từ file WAV (clip FLEURS, Đ20) với tiến trình phụ giả, và bản chạy model thật;
- `latency-bench mt-eval` (Đ4), nhãn và so mốc cho `score_mt.py`, công cụ đo `no_speech_prob` và tỉ lệ token (Đ12);
- `audio-capture` đủ cho app: chọn thiết bị, danh sách app đang phát tiếng (gộp tiến trình helper, có tên hiển thị), tiền xử lý dùng chung, tap thu cả âm thanh của app, tap nhiều tiến trình;
- đo cho Đ12 và chạy lại A3, A4, S6 (mục 6.7 của kế hoạch 00).

**Kiến trúc:** Như 02a. Engine chạy bốn luồng (VAD, nhận dạng, phụ đề, dịch); luồng phụ đề là nơi duy nhất phát sự kiện phụ đề (QĐ1). App nối vào qua `FrameSource`, `VadFactory`, trait `Asr` và `Mt` của `SidecarManager`, và `EventSink`.

**Công nghệ:** Như 02a. Task 5 thêm `objc2-app-kit` và `libc` cho `audio-capture` (macOS), xem bảng phiên bản ở 02a.

Đọc trước 02a: `docs/superpowers/plans/2026-10-01-giai-doan-1-02a-pipeline-crate.md`. Các mục "Phiên bản đã chốt", "Cách đọc kế hoạch này", "Dòng của bảng đối chiếu", "Quyết định" (QĐ) và "Điểm cần chủ dự án quyết" ở đó áp cho file này. Làm file này sau khi 02a và 02d đã commit hết.

---

## Task 1: Phụ đề, hàng đợi §7, số đo của phiên

Ba module thuần, không luồng, không khóa, để test từng trường hợp (dòng 151, 186, 218–222, 238, 288; QĐ9, QĐ25):
- `subtitle.rs`: `Subtitle` (tên trường theo `src/lib/ipc.ts`, có `replaces` của §6.6), `Status` đủ bảy trạng thái của §6.6, `Delta`.
- `queue.rs`: `AsrQueue` (VAD → nhận dạng) và `MtQueue` (câu chờ dịch) theo §7. "Hiện tại" là giờ âm thanh của phiên.
  - `PendingSegment` mang `speech_ms` và hai số của VAD từ `Segment`; đoạn gộp cộng `speech_ms` của các đoạn con, không tính khoảng nghỉ ở giữa (§6.3), và lấy trung bình số của VAD theo `speech_ms`.
  - `MtItem` mang `speech_ms` (câu gộp cộng lại) và `context`, ngữ cảnh chụp lúc mở câu (Q1 của review 02b; câu gộp giữ ngữ cảnh của câu đầu).
- `metrics.rs`: `SessionMetrics` (thời gian từng bước, số đoạn theo kết cục, số lần ghép, thời lượng tiếng nói đã dịch theo luật đếm phút của §6.8) và bản tóm tắt một dòng cho log, không có chữ chép lời.

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
//!   bỏ đoạn (`dropped`) khi độ trễ vượt 20 giây. Đoạn gộp có `speech_ms` bằng tổng của các đoạn con, không tính khoảng
//!   nghỉ ở giữa (§6.3, hạn mức §6.8).
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
            speech_ms: end_ms - start_ms,
            mean_prob: 0.9,
            speech_ratio: 1.0,
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
        // 3 giây tiếng nói mỗi đoạn; khoảng nghỉ 2 giây ở giữa (3 000–5 000 ms) không tính (§6.3, §6.8).
        assert_eq!(first.speech_ms, 6_000);
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
            speech_ms: 800,
            context: Some(format!("trước {sub_id}")),
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
        // Câu gộp: tiếng nói cộng lại, giữ ngữ cảnh của câu đầu.
        assert_eq!((m.speech_ms, m.context.as_deref()), (1_600, Some("trước 1")));
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
        assert!(q.update(3, "and three more", 3_900, 1_700, 2));
        q.close(3);
        let merged = q.push(item(5, "en", "Five.", 0));
        assert_eq!(merged[0].text, "One. Two. and three more Four.");
        assert_eq!(merged[0].speech_ms, 800 + 800 + 1_700 + 800);
    }

    #[test]
    fn sentences_waiting_more_than_20_seconds_are_skipped() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "en", "One.", 1_000));
        q.push(item(2, "en", "Two.", 5_000));
        assert!(matches!(q.pop(21_001), Some(Ready::Skip(i)) if i.sub_id == 1));
        assert!(matches!(q.pop(21_001), Some(Ready::Translate(i)) if i.sub_id == 2));
    }

    /// Đoạn gộp lấy trung bình xác suất VAD theo độ dài tiếng nói.
    #[test]
    fn merged_segments_weigh_the_vad_statistics_by_speech_length() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.push(PendingSegment {
            mean_prob: 0.5,
            speech_ratio: 0.5,
            ..seg(0, 0, 1_000, 1)
        });
        q.push(PendingSegment {
            mean_prob: 0.9,
            speech_ratio: 1.0,
            ..seg(1, 2_000, 5_000, 3)
        });
        q.push(seg(2, 6_000, 7_000, 1));
        q.push(seg(3, 8_000, 9_000, 1));
        let Some(Popped::Segment(first)) = q.pop(0) else {
            panic!("phải có đoạn gộp")
        };
        assert_eq!((first.ids, first.speech_ms), (vec![0, 1], 4_000));
        assert!((first.mean_prob - 0.8).abs() < 1e-6, "{}", first.mean_prob);
        assert!((first.speech_ratio - 0.875).abs() < 1e-6, "{}", first.speech_ratio);
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
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

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
    /// Thời lượng tiếng nói đã được dịch xong, theo luật đếm phút của hạn mức (spec §6.8, "Cách đếm phút"): cộng
    /// `speech_ms` (không gồm đệm; đoạn gộp cộng từng đoạn con) khi phụ đề sang `done`, mỗi đoạn một lần kể cả khi câu
    /// được dịch lại sau khi ghép hay gộp. Không tính `same_lang`, `failed`, `skipped`, `dropped`, đoạn bị lọc.
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
    /// Độ dài tiếng nói, không gồm đệm; đoạn gộp là tổng của các đoạn con (`Segment::speech_ms`).
    pub speech_ms: u64,
    /// Xác suất VAD trung bình và tỉ lệ khung tiếng nói (`Segment::mean_prob`, `Segment::speech_ratio`); đoạn gộp lấy
    /// trung bình theo `speech_ms`. Luật câu đệm (`filter`) dùng `mean_prob`.
    pub mean_prob: f32,
    pub speech_ratio: f32,
    pub samples: Vec<f32>,
}

impl From<crate::segmenter::Segment> for PendingSegment {
    fn from(s: crate::segmenter::Segment) -> Self {
        Self {
            ids: vec![s.id],
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            speech_ms: s.speech_ms,
            mean_prob: s.mean_prob,
            speech_ratio: s.speech_ratio,
            samples: s.samples,
        }
    }
}

impl PendingSegment {
    /// Gộp `next` vào sau đoạn này: thời gian từ đầu đoạn này tới cuối `next`, `speech_ms` cộng lại.
    fn absorb(&mut self, next: PendingSegment) {
        let total = (self.speech_ms + next.speech_ms).max(1) as f32;
        let weigh = |a: f32, wa: u64, b: f32, wb: u64| (a * wa as f32 + b * wb as f32) / total;
        self.mean_prob = weigh(self.mean_prob, self.speech_ms, next.mean_prob, next.speech_ms);
        self.speech_ratio = weigh(self.speech_ratio, self.speech_ms, next.speech_ratio, next.speech_ms);
        self.ids.extend(next.ids);
        self.end_ms = next.end_ms;
        self.speech_ms += next.speech_ms;
        self.samples.extend(next.samples);
    }
}

// Debug viết tay: không in âm thanh.
impl std::fmt::Debug for PendingSegment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PendingSegment")
            .field("ids", &self.ids)
            .field("start_ms", &self.start_ms)
            .field("end_ms", &self.end_ms)
            .field("speech_ms", &self.speech_ms)
            .field("mean_prob", &self.mean_prob)
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
                self.items[0].absorb(second);
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
    /// Độ dài tiếng nói của câu, không gồm đệm; câu gộp là tổng của các câu con.
    pub speech_ms: u64,
    /// Câu gốc trước đó cùng ngôn ngữ, chụp lúc câu được mở (cờ `experimental.translationContext`, §6.5). Câu gộp giữ
    /// ngữ cảnh của câu đầu.
    pub context: Option<String>,
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

    /// Câu đang chờ vừa được ghép thêm đoạn: cập nhật chữ, mốc cuối, tiếng nói và phiên bản. Trả `false` nếu câu không
    /// còn trong hàng.
    pub fn update(&mut self, sub_id: u64, text: &str, end_ms: u64, speech_ms: u64, version: u32) -> bool {
        match self.items.iter_mut().find(|i| i.sub_id == sub_id) {
            Some(item) => {
                item.text = text.to_string();
                item.end_ms = end_ms;
                item.speech_ms = speech_ms;
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
                    last.speech_ms += item.speech_ms;
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
test result: ok. 129 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
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

`engine.rs` nối mọi phần trước thành một phiên (§5, §7; dòng 9, 15, 16, 45, 66, 67, 73, 95, 96, 98, 99, 141, 143, 147, 217–222, 231, 235, 238, 273, 315; QĐ1, QĐ10, QĐ25–QĐ27):
- `Engine::start(cfg, source, vad, asr, mt, sink)` chạy bốn luồng: VAD, nhận dạng, phụ đề, dịch (luồng VAD chạy sau cùng). `stop` dừng theo QĐ10 (hạn chung 3 giây, câu cuối vẫn được dịch); `join` chờ tới khi nguồn hết (test từ file); `exhaust_quota` dừng theo QĐ26.
- Trait cho app nối vào: `FrameSource` (âm thanh 16 kHz mono vào; `SampleSource` phát mẫu có sẵn), `VadModel` (Silero, hoặc `EnergyVad` cho test không cần model), `EventSink` (phụ đề, delta, mức âm lượng, chỉ báo, lỗi làm phiên dừng kèm loại `Fatal`, và `usage`: phút vừa dịch xong cho hạn mức, mặc định không làm gì).
- Luồng phụ đề: ghép câu (§6.3), `same_lang` không dịch (F2), cờ ngữ cảnh câu trước (`translation_context`, mặc định tắt; ngữ cảnh chụp lúc mở câu), hàng đợi dịch, chỉ báo "Đang trễ", "Không nghe thấy âm thanh" (60 giây theo RMS) và "dịch không dùng được", đếm phút khi phụ đề sang `done`. Request dịch làm nóng gửi một lần khi bắt đầu phiên, và dừng khi bấm Dừng.
- Luồng nhận dạng áp `filter::verdict` với số của đoạn (`no_speech_prob`, `avg_logprob`, xác suất VAD, độ dài tiếng nói).
- Mỗi luồng có guard: panic không làm engine treo (Q4 của review 02b); VAD lỗi giữa chừng và nguồn âm thanh hỏng đều báo lỗi (Q5).
- `segmenter.rs` thêm `open_start_ms` (thời điểm bắt đầu của đoạn đang nói dở, để luồng phụ đề biết tiếng nói đã tiếp tục trong cửa sổ ghép câu).
- Test đơn vị của luồng phụ đề, nạp thẳng tin nhắn, tất định (Q2 của review 02b): ngữ cảnh đúng câu trước, gộp phụ đề khi hàng đợi dịch đầy, `skipped` vì chờ lâu, `failed` và "dịch không dùng được", luồng dịch chết, câu được ghép thêm khi đang dịch (hủy, dịch lại; ghép thêm hai lần thì hàng chỉ giữ một mục, bản mới nhất, và câu không kẹt ở `translating`: Q-A của review 02 lần 2; câu đang chờ dịch được ghép thêm hai lần thì chỉ gửi đi dịch một lần: Nhỏ-2 của review 02 lần 3. Tối đa là hai lần ghép thêm, vì `max_segments` là 3), đếm phút mỗi đoạn một lần, "Đang trễ", dừng trong hạn và hết hạn, chạm hạn mức (từ `usage` và từ ngoài). Thêm test cả engine với nhận dạng và dịch giả trong tiến trình: VAD không nạp được, VAD lỗi giữa chừng, nguồn âm thanh hỏng, luồng VAD và luồng nhận dạng panic, `llama-server` treo lúc Dừng, lần làm nóng dừng khi Dừng.
- `tests/engine.rs` (dòng 295, 315): âm thanh tổng hợp có ranh giới biết trước, VAD theo năng lượng, tiến trình phụ giả qua đúng `SidecarManager`; kiểm thứ tự, thời gian, trạng thái, ghép câu, lọc, phút đã dịch (khớp tổng của `usage`), `dropped`, lỗi làm phiên dừng, dừng nhanh, và log của cả phiên không có chữ chép lời nào. Các test này phát âm thanh nhanh gấp 20 lần thời gian thực, nên đặt ngưỡng trễ rất lớn (600 000 ms) để máy bận không làm test đỏ ngẫu nhiên (Q3 của review 02b); luật trễ có test riêng ở trên.

**Files:**
- Tạo: `crates/pipeline/src/engine.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/segmenter.rs`
- Test (tạo): `crates/pipeline/tests/engine.rs`

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
//!    (§7), chỉ báo "Đang trễ", số đo của phiên, đếm phút cho hạn mức (§6.8).
//! 4. Luồng dịch: dịch từng câu (`translate`), gửi từng phần chữ về luồng phụ đề.
//!
//! Chọn luồng riêng và client đồng bộ, không dùng runtime tokio (kế hoạch 02, QĐ1): hai client đồng bộ của Giai đoạn 0 đã
//! được đo ở S6 và giữ nguyên; mỗi tiến trình phụ chỉ xử lý một yêu cầu một lúc (`-np 1`), nên async không thêm thông
//! lượng; crate `pipeline` không cần runtime nào, test chạy không cần Tauri.
//!
//! "Giờ" của phiên là giờ âm thanh: số mẫu đã đọc, đổi ra ms. Âm thanh thu thật chạy đúng tốc độ thời gian thực (trên
//! Windows, khoảng lặng được chèn im lặng, §6.1), nên giờ âm thanh bằng giờ thật; test phát file WAV nhanh hơn thời gian
//! thực mà luật vẫn như nhau. Riêng hạn dịch câu cuối khi dừng (`mt.stop_grace_ms`) tính bằng giờ thật, vì lúc đó âm
//! thanh đã ngừng.
//!
//! Ba cách kết thúc một phiên:
//! - [`Engine::stop`] (bấm Dừng): luồng VAD chốt đoạn đang dở; các đoạn và câu còn lại được xử lý tiếp như thường, trong
//!   một hạn chung `mt.stop_grace_ms` (3 giây) tính từ lúc bấm, nên câu cuối thường vẫn được dịch. Hết hạn thì câu đang
//!   dịch và câu chờ dịch thành `skipped`, và luồng phụ đề thoát ngay. Luồng nhận dạng và luồng dịch không được chờ: nếu
//!   tiến trình phụ đang treo, chúng tự kết thúc khi request hết thời gian chờ.
//! - Hết hạn mức (spec §6.8, "Khi chạm hạn mức"): [`EventSink::usage`] trả `Break`, hoặc app gọi
//!   [`Engine::exhaust_quota`]. Engine bỏ các đoạn chờ nhận dạng và các câu chờ dịch (`skipped`), chỉ dịch xong câu đang
//!   dịch (trong cùng hạn `mt.stop_grace_ms`), rồi báo [`Fatal::QuotaExhausted`]. Kế hoạch 06 nối bộ đếm vào đây.
//! - Lỗi không chạy tiếp được ([`Fatal`]): VAD, nguồn âm thanh, `asr-worker`, hoặc một luồng của engine dừng bất thường.
//!   App nhận [`EventSink::fatal`] rồi gọi `stop`.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llama::{ChatRequest, StreamEnd};
    use crate::translate::{MtError, Translated};
    use asr_protocol::TranscribeResult;

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

    // ---- Luồng phụ đề, nạp thẳng tin nhắn (Q2 của review 02b): tất định, không luồng, không tiến trình phụ. ----

    #[derive(Default)]
    struct Sink {
        subs: Mutex<Vec<Subtitle>>,
        indicators: Mutex<Vec<Indicators>>,
        fatal: Mutex<Vec<(Fatal, String)>>,
        usage: Mutex<Vec<Usage>>,
        /// Hạn mức (ms): tổng `usage` chạm số này thì trả `Break`.
        limit_ms: Option<u64>,
    }

    impl EventSink for Sink {
        fn subtitle(&self, s: &Subtitle) {
            self.subs.lock().unwrap().push(s.clone());
        }
        fn delta(&self, _: &Delta) {}
        fn level(&self, _: f32) {}
        fn indicators(&self, i: &Indicators) {
            self.indicators.lock().unwrap().push(i.clone());
        }
        fn fatal(&self, kind: Fatal, reason: &str) {
            self.fatal.lock().unwrap().push((kind, reason.to_string()));
        }
        fn usage(&self, u: &Usage) -> ControlFlow<()> {
            let mut all = self.usage.lock().unwrap();
            all.push(*u);
            let total: u64 = all.iter().map(|u| u.speech_ms).sum();
            match self.limit_ms {
                Some(limit) if total >= limit => ControlFlow::Break(()),
                _ => ControlFlow::Continue(()),
            }
        }
    }

    impl Sink {
        fn kinds(&self) -> Vec<Fatal> {
            self.fatal.lock().unwrap().iter().map(|(k, _)| *k).collect()
        }

        fn usage(&self) -> Vec<(u64, u64)> {
            self.usage
                .lock()
                .unwrap()
                .iter()
                .map(|u| (u.sub_id, u.speech_ms))
                .collect()
        }
    }

    struct Harness {
        c: Composer,
        jobs: Receiver<MtJob>,
        sink: Arc<Sink>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
    }

    fn cfg() -> EngineConfig {
        EngineConfig {
            pipeline: PipelineConfig::default(),
            languages: vec!["en".into(), "vi".into()],
            target: Lang::Vi,
            translation_context: false,
            id_base: 0,
        }
    }

    fn harness_with(cfg: EngineConfig, sink: Sink) -> Harness {
        let sink = Arc::new(sink);
        let (jobs_tx, jobs) = mpsc::channel();
        let flags = Flags::default();
        let asr_queue = Arc::new(SharedQueue::new(AsrQueue::new(cfg.pipeline.queue.clone())));
        let c = Composer::new(cfg, sink.clone(), jobs_tx, flags.clone(), asr_queue.clone());
        Harness {
            c,
            jobs,
            sink,
            flags,
            asr_queue,
        }
    }

    fn harness() -> Harness {
        harness_with(cfg(), Sink::default())
    }

    fn done(text: &str) -> Outcome {
        Outcome::Done(Translated {
            text: text.into(),
            attempts: 1,
            source_tokens: 1,
            completion_tokens: Some(1),
            first_delta_ms: None,
            total_ms: 1.0,
        })
    }

    impl Harness {
        /// Nạp một tin nhắn như vòng lặp của luồng phụ đề; trả `true` khi luồng phụ đề sẽ thoát.
        fn feed(&mut self, msg: Msg) -> bool {
            self.c.handle(msg);
            self.c.step()
        }

        /// Đoạn `id` vừa chép lời xong; tiếng nói đúng bằng `start..end`.
        fn said(&mut self, id: u64, start_ms: u64, end_ms: u64, lang: &str, text: &str) -> bool {
            self.feed(Msg::Asr(AsrOutcome::Transcribed {
                ids: vec![id],
                start_ms,
                end_ms,
                speech_ms: end_ms - start_ms,
                lang: lang.into(),
                text: text.into(),
                asr_ms: 1.0,
            }))
        }

        fn job(&self) -> MtJob {
            self.jobs.try_recv().expect("phải có câu được gửi đi dịch")
        }

        fn no_job(&self) {
            assert!(self.jobs.try_recv().is_err(), "không được gửi thêm câu nào đi dịch");
        }

        fn finish(&mut self, job: &MtJob, outcome: Outcome) -> bool {
            self.feed(Msg::MtDone {
                sub_id: job.sub_id,
                version: job.version,
                outcome,
            })
        }

        fn last(&self, id: u64) -> Subtitle {
            self.sink
                .subs
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|s| s.id == id)
                .cloned()
                .expect("phụ đề phải có")
        }

        fn statuses(&self, id: u64) -> Vec<Status> {
            let subs = self.sink.subs.lock().unwrap();
            let mut out: Vec<Status> = Vec::new();
            for s in subs.iter().filter(|s| s.id == id) {
                if out.last() != Some(&s.status) {
                    out.push(s.status);
                }
            }
            out
        }
    }

    /// Q1 của review 02b: ngữ cảnh là câu chốt ngay trước câu đó, chụp lúc mở câu; không phải câu mới nhất lúc gửi dịch.
    #[test]
    fn the_context_is_the_sentence_before_captured_when_it_opens() {
        let mut h = harness_with(
            EngineConfig {
                translation_context: true,
                ..cfg()
            },
            Sink::default(),
        );
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        assert_eq!(j1.context, None);
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.said(4, 6_000, 7_000, "vi", "Xin chào."); // ngôn ngữ khác không đổi ngữ cảnh của tiếng Anh
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!((j2.text.as_str(), j2.context.as_deref()), ("Two.", Some("One.")));
        h.finish(&j2, done("Hai."));
        assert_eq!(h.job().context.as_deref(), Some("Two."));
    }

    /// Hàng đợi dịch đầy: các câu chờ cùng ngôn ngữ gộp thành một phụ đề (`replaces`), tiếng nói cộng lại (§7).
    #[test]
    fn a_full_translation_queue_merges_the_waiting_subtitles() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        for (id, text) in [(2, "Two."), (3, "Three."), (4, "Four.")] {
            h.said(id, id * 2_000, id * 2_000 + 1_000, "en", text);
        }
        h.said(5, 10_000, 11_000, "en", "Five.");
        let merged = h.last(2);
        assert_eq!(
            (merged.src_text.as_str(), merged.replaces.clone(), merged.end_ms),
            ("Two. Three. Four.", vec![3, 4], 9_000)
        );
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!((j2.sub_id, j2.text.as_str()), (2, "Two. Three. Four."));
        h.finish(&j2, done("Hai. Ba. Bốn."));
        assert_eq!(h.job().sub_id, 5);
        assert_eq!(h.sink.usage(), [(1, 1_000), (2, 3_000)]);
        assert_eq!(h.last(2).status, Status::Done);
    }

    /// Câu chờ dịch quá 20 giây thì chỉ hiện câu gốc (`skipped`, §7), và không tính phút.
    #[test]
    fn a_sentence_waiting_too_long_is_skipped() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 1_500, 2_000, "en", "Two.");
        h.feed(Msg::Clock {
            now_ms: 20_500,
            speech_since: None,
        });
        h.finish(&j1, done("Một."));
        h.no_job();
        assert_eq!(h.statuses(2), [Status::AsrDone, Status::Skipped]);
        assert_eq!(h.c.metrics.skipped, 1);
        assert_eq!(h.sink.usage(), [(1, 1_000)]);
    }

    /// Dịch lỗi thì `failed`; `llama-server` không dùng được thì báo chỉ báo, và câu sau thành `failed` ngay. Không tính phút.
    #[test]
    fn failed_translations_and_an_unavailable_server() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.finish(
            &j1,
            Outcome::Failed {
                reason: "x".into(),
                attempts: 2,
                source_tokens: 1,
                completion_tokens: None,
            },
        );
        assert_eq!(h.last(1).status, Status::Failed);
        h.said(2, 2_000, 3_000, "en", "Two.");
        let j2 = h.job();
        h.finish(&j2, Outcome::Unavailable("bỏ cuộc".into()));
        assert!(
            h.sink
                .indicators
                .lock()
                .unwrap()
                .last()
                .unwrap()
                .translation_unavailable
        );
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.no_job();
        assert_eq!(h.statuses(3), [Status::AsrDone, Status::Failed]);
        assert!(h.sink.usage().is_empty());
        assert_eq!(h.c.metrics.failed, 3);
    }

    /// Luồng dịch dừng bất thường: câu đang dịch thành `failed`, không chờ mãi.
    #[test]
    fn a_dead_translation_thread_fails_the_sentence() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let _j1 = h.job();
        h.feed(Msg::MtGone);
        assert_eq!(h.last(1).status, Status::Failed);
        assert!(h.c.in_flight.is_none());
    }

    /// Câu được ghép thêm đoạn khi đang dịch: hủy bản dịch cũ, dịch lại cả câu; phút tính đủ hai đoạn, mỗi đoạn một lần.
    #[test]
    fn a_sentence_that_grows_while_translating_is_retranslated() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.said(2, 1_300, 2_000, "en", "home.");
        assert!(j1.cancel.load(Ordering::SeqCst), "bản dịch cũ bị hủy");
        h.no_job();
        h.finish(&j1, Outcome::Cancelled);
        let j2 = h.job();
        assert_eq!((j2.sub_id, j2.version, j2.text.as_str()), (1, 2, "so we went home."));
        h.finish(&j2, done("chúng tôi về nhà."));
        assert_eq!(h.sink.usage(), [(1, 1_700)]);
        assert_eq!((h.c.metrics.translated, h.c.metrics.merges), (1, 1));
    }

    /// Q-A của review 02 lần 2: câu (chưa chốt, không có dấu kết thúc) được ghép thêm hai lần trong lúc bản đầu còn đang
    /// dịch. Hàng chỉ có một mục cho câu đó (bản mới nhất); bản dịch xong không bị một mục cũ đưa về `translating`.
    #[test]
    fn a_sentence_that_grows_twice_while_translating_ends_done() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we");
        let j1 = h.job();
        h.said(2, 1_300, 2_000, "en", "went");
        h.said(3, 2_300, 3_000, "en", "home");
        h.finish(&j1, Outcome::Cancelled);
        let j3 = h.job();
        assert_eq!((j3.sub_id, j3.version, j3.text.as_str()), (1, 3, "so we went home"));
        h.finish(&j3, done("chúng tôi về nhà"));
        h.no_job();
        let last = h.last(1);
        assert_eq!(
            (last.status, last.tgt_text.as_str()),
            (Status::Done, "chúng tôi về nhà")
        );
        assert_eq!(h.statuses(1).last(), Some(&Status::Done));
    }

    /// Nhỏ-2 của review 02 lần 3: câu đang chờ dịch (chưa gửi đi) được ghép thêm hai lần (tối đa, vì `max_segments` là 3):
    /// mục trong hàng được cập nhật tại chỗ, câu chỉ được gửi đi dịch một lần với bản mới nhất.
    #[test]
    fn a_waiting_sentence_that_grows_twice_is_translated_once() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 1_500, 2_000, "en", "so we");
        h.said(3, 2_300, 2_800, "en", "went");
        h.said(4, 3_100, 3_500, "en", "home");
        h.no_job();
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!((j2.sub_id, j2.version, j2.text.as_str()), (2, 3, "so we went home"));
        h.finish(&j2, done("chúng tôi về nhà"));
        h.no_job();
        let translating = h.statuses(2).iter().filter(|s| **s == Status::Translating).count();
        assert_eq!(translating, 1, "{:?}", h.statuses(2));
        assert_eq!(h.sink.usage(), [(1, 1_000), (2, 1_400)]);
    }

    /// Câu đã dịch xong rồi mới được ghép thêm: lần dịch lại chỉ tính phần mới (§6.8: mỗi đoạn tính một lần).
    #[test]
    fn a_retranslated_sentence_counts_only_the_new_speech() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đi"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let j2 = h.job();
        h.finish(&j2, done("chúng tôi về nhà."));
        assert_eq!(
            h.statuses(1),
            [
                Status::AsrDone,
                Status::Translating,
                Status::Done,
                Status::AsrDone,
                Status::Translating,
                Status::Done
            ]
        );
        h.said(3, 3_000, 4_000, "vi", "Xin chào.");
        h.no_job();
        assert_eq!(h.sink.usage(), [(1, 1_000), (1, 700)]);
        assert_eq!(h.c.metrics.translated_speech_ms, 1_700, "same_lang không tính");
    }

    /// "Đang trễ" khi đoạn cũ nhất còn đang xử lý trễ quá 6 giây, tắt khi bắt kịp (§7).
    #[test]
    fn the_lag_indicator_follows_the_oldest_unfinished_segment() {
        let mut h = harness();
        h.feed(Msg::Queued {
            id: 1,
            start_ms: 0,
            end_ms: 1_000,
            closed_ms: 1_300,
        });
        let clock = |now_ms| Msg::Clock {
            now_ms,
            speech_since: None,
        };
        h.feed(clock(7_000));
        assert!(h.sink.indicators.lock().unwrap().is_empty(), "trễ đúng 6 giây chưa báo");
        h.feed(clock(7_100));
        assert!(h.sink.indicators.lock().unwrap().last().unwrap().lagging);
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.feed(clock(7_200));
        assert!(
            h.sink.indicators.lock().unwrap().last().unwrap().lagging,
            "câu đang dịch vẫn trễ"
        );
        h.finish(&j1, done("Một."));
        h.feed(clock(7_300));
        assert!(!h.sink.indicators.lock().unwrap().last().unwrap().lagging);
    }

    /// N3 của review 02b: bấm Dừng thì câu cuối vẫn được dịch trong hạn chung; hết hạn thì câu còn lại thành `skipped`.
    #[test]
    fn stop_translates_the_last_sentence_within_the_grace_period() {
        let mut config = cfg();
        config.pipeline.mt.stop_grace_ms = 300;
        let mut h = harness_with(config, Sink::default());
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.flags.hurry.store(true, Ordering::SeqCst);
        assert!(!h.c.step());
        assert!(!h.finish(&j1, done("Một.")), "còn trong hạn: chờ câu cuối");
        assert_eq!(h.last(1).status, Status::Done);
        h.said(2, 2_000, 3_000, "en", "Last.");
        let j2 = h.job();
        h.said(3, 4_000, 5_000, "en", "After.");
        std::thread::sleep(Duration::from_millis(350));
        assert!(h.c.step(), "hết hạn: luồng phụ đề thoát ngay");
        assert!(j2.cancel.load(Ordering::SeqCst));
        assert_eq!(h.last(2).status, Status::Skipped);
        assert_eq!(h.last(3).status, Status::Skipped);
        assert_eq!(h.sink.usage(), [(1, 1_000)]);
    }

    /// Chạm hạn mức (§6.8): bỏ đoạn chờ nhận dạng và câu chờ dịch, không hiện đoạn chép lời xong muộn, rồi báo
    /// `QuotaExhausted`.
    #[test]
    fn reaching_the_quota_drops_the_queues_and_reports_it() {
        let mut h = harness_with(
            cfg(),
            Sink {
                limit_ms: Some(1_000),
                ..Sink::default()
            },
        );
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.asr_queue.push(PendingSegment {
            ids: vec![4],
            start_ms: 6_000,
            end_ms: 7_000,
            speech_ms: 1_000,
            mean_prob: 0.9,
            speech_ratio: 1.0,
            samples: vec![0.0; 16_000],
        });
        assert!(h.finish(&j1, done("Một.")), "câu đang dịch xong là thoát");
        assert!(h.flags.stop.load(Ordering::SeqCst), "dừng thu âm thanh");
        assert!(
            h.asr_queue.pop(&AtomicU64::new(0)).is_none(),
            "hàng đợi nhận dạng đã bỏ và đóng"
        );
        assert_eq!(h.last(2).status, Status::Skipped);
        assert_eq!(h.last(3).status, Status::Skipped);
        h.said(5, 8_000, 9_000, "en", "Late.");
        assert!(!h.sink.subs.lock().unwrap().iter().any(|s| s.id == 5));
        h.no_job();
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.kinds(), [Fatal::QuotaExhausted]);
        assert_eq!(sink.usage(), [(1, 1_000)]);
    }

    /// App báo hết hạn mức từ ngoài (`Engine::exhaust_quota`) khi đang dịch: câu đang dịch vẫn được dịch xong.
    #[test]
    fn an_outside_quota_stop_lets_the_sentence_being_translated_finish() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.flags.quota.store(true, Ordering::SeqCst);
        assert!(!h.c.step(), "chờ câu đang dịch");
        assert_eq!(h.last(2).status, Status::Skipped);
        assert!(h.finish(&j1, done("Một.")));
        assert_eq!(h.last(1).status, Status::Done);
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.kinds(), [Fatal::QuotaExhausted]);
    }

    // ---- Engine đầy đủ với nhận dạng và dịch giả trong tiến trình (không cần tiến trình phụ). ----

    /// Chép lời mọi đoạn thành `<chữ>` cố định bằng tiếng Anh.
    struct ConstAsr(&'static str);

    impl Asr for ConstAsr {
        fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            Ok(TranscribeResult {
                segment_id: req.segment_id,
                lang: "en".into(),
                lang_prob: 1.0,
                text: self.0.into(),
                tokens: vec![1, 2],
                no_speech_prob: 0.0,
                lid_ms: 0.0,
                asr_ms: 1.0,
                avg_logprob: -0.2,
            })
        }
    }

    struct PanicAsr;

    impl Asr for PanicAsr {
        fn transcribe(&mut self, _: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            panic!("lỗi giả trong luồng nhận dạng")
        }
    }

    /// `llama-server` giả trong tiến trình: gửi một gói chữ mỗi `every`, tối đa `chunks` gói (`usize::MAX`: không bao giờ
    /// xong). Ghi lại lúc bên gọi dừng stream.
    struct SlowMt {
        every: Duration,
        chunks: usize,
        broke: Arc<AtomicBool>,
    }

    impl Mt for SlowMt {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            _req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            let mut cancelled = false;
            for _ in 0..self.chunks {
                std::thread::sleep(self.every);
                if on_delta("x").is_break() {
                    self.broke.store(true, Ordering::SeqCst);
                    cancelled = true;
                    break;
                }
            }
            Ok(StreamEnd {
                text: "x".into(),
                first_token_ms: 1.0,
                total_ms: 1.0,
                finish_reason: (!cancelled).then(|| "stop".into()),
                completion_tokens: Some(1),
                chunks: 1,
                cancelled,
            })
        }
    }

    /// `llama-server` treo hẳn: stream không trả gói nào (tới khi test kết thúc).
    struct HungMt;

    impl Mt for HungMt {
        fn count_tokens(&mut self, _: &str) -> Result<usize, MtError> {
            Ok(1)
        }

        fn stream(
            &mut self,
            _: &ChatRequest,
            _: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            std::thread::sleep(Duration::from_secs(3_600));
            Err(MtError::Failed("treo".into()))
        }
    }

    fn quick_mt() -> Box<dyn Mt> {
        Box::new(SlowMt {
            every: Duration::ZERO,
            chunks: 1,
            broke: Arc::default(),
        })
    }

    /// 1 giây tiếng (sóng vuông biên độ 0,3) rồi `silence_ms` im lặng.
    fn speech_then_silence(silence_ms: usize) -> Vec<f32> {
        let mut s: Vec<f32> = (0..16_000).map(|i| if i % 40 < 20 { 0.3 } else { -0.3 }).collect();
        s.extend(std::iter::repeat_n(0.0, silence_ms * 16));
        s
    }

    fn energy() -> VadFactory {
        Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.01 }) as _))
    }

    fn start(
        source: Box<dyn FrameSource>,
        vad: VadFactory,
        asr: Box<dyn Asr>,
        mt: Box<dyn Mt>,
        config: EngineConfig,
    ) -> (Engine, Arc<Sink>) {
        let sink = Arc::new(Sink::default());
        let engine = Engine::start(config, source, vad, asr, mt, sink.clone()).unwrap();
        (engine, sink)
    }

    /// Nguồn phát mẫu cho sẵn rồi giữ luồng mở (như thu âm thật, chỉ dừng bằng `stop`).
    struct Live {
        samples: SampleSource,
    }

    impl FrameSource for Live {
        fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
            if !self.samples.read(out, timeout)? {
                std::thread::sleep(Duration::from_millis(5));
                out.extend(std::iter::repeat_n(0.0, 80));
            }
            Ok(true)
        }
    }

    fn live(samples: Vec<f32>) -> Box<dyn FrameSource> {
        Box::new(Live {
            samples: SampleSource::new(samples, 1_600, Duration::ZERO),
        })
    }

    /// Q5 của review 02b: VAD không nạp được thì báo lỗi, engine kết thúc.
    #[test]
    fn a_vad_that_does_not_load_is_fatal() {
        let vad: VadFactory = Box::new(|| Err(anyhow::anyhow!("model VAD hỏng")));
        let (engine, sink) = start(live(Vec::new()), vad, Box::new(ConstAsr("x")), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Vad]);
    }

    /// Q5: VAD lỗi giữa chừng cũng báo lỗi, không dừng lặng lẽ.
    #[test]
    fn a_vad_error_midway_is_fatal() {
        struct Broken;
        impl VadModel for Broken {
            fn prob(&mut self, _: &[f32]) -> Result<f32> {
                anyhow::bail!("candle lỗi")
            }
        }
        let vad: VadFactory = Box::new(|| Ok(Box::new(Broken) as _));
        let (engine, sink) = start(
            live(speech_then_silence(100)),
            vad,
            Box::new(ConstAsr("x")),
            quick_mt(),
            cfg(),
        );
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Vad]);
    }

    /// Q5: nguồn âm thanh hỏng hẳn thì báo `Audio`.
    #[test]
    fn a_broken_audio_source_is_fatal() {
        struct Broken;
        impl FrameSource for Broken {
            fn read(&mut self, _: &mut Vec<f32>, _: Duration) -> Result<bool> {
                anyhow::bail!("thiết bị đã rút")
            }
        }
        let (engine, sink) = start(Box::new(Broken), energy(), Box::new(ConstAsr("x")), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Audio]);
    }

    /// Q4 của review 02b: luồng VAD panic thì engine vẫn kết thúc (không treo) và báo lỗi.
    #[test]
    fn a_panicking_vad_thread_does_not_hang_the_engine() {
        struct Panics;
        impl FrameSource for Panics {
            fn read(&mut self, _: &mut Vec<f32>, _: Duration) -> Result<bool> {
                panic!("lỗi giả trong luồng VAD")
            }
        }
        let (engine, sink) = start(Box::new(Panics), energy(), Box::new(ConstAsr("x")), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Vad]);
    }

    /// Q4: luồng nhận dạng panic thì engine vẫn kết thúc và báo lỗi `Asr`.
    #[test]
    fn a_panicking_asr_thread_does_not_hang_the_engine() {
        let source = Box::new(SampleSource::new(speech_then_silence(1_000), 1_600, Duration::ZERO));
        let (engine, sink) = start(source, energy(), Box::new(PanicAsr), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Asr]);
    }

    /// Q6 của review 02b: `llama-server` treo giữa lúc dịch thì Dừng vẫn xong trong khoảng `stop_grace_ms`; câu đó
    /// thành `skipped`.
    #[test]
    fn stop_does_not_wait_for_a_hung_translation() {
        let mut config = cfg();
        config.pipeline.mt.stop_grace_ms = 300;
        let (engine, sink) = start(
            live(speech_then_silence(1_500)),
            energy(),
            Box::new(ConstAsr("Hello there.")),
            Box::new(HungMt),
            config,
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        while !sink.subs.lock().unwrap().iter().any(|s| s.status == Status::AsrDone) {
            assert!(Instant::now() < deadline, "phải có phụ đề");
            std::thread::sleep(Duration::from_millis(10));
        }
        let started = Instant::now();
        engine.stop();
        assert!(started.elapsed() < Duration::from_secs(2), "{:?}", started.elapsed());
        let last = sink.subs.lock().unwrap().last().cloned().unwrap();
        assert_eq!(last.status, Status::Skipped);
    }

    /// Q6: lần làm nóng `llama-server` cũng dừng khi bấm Dừng.
    #[test]
    fn stop_breaks_the_warmup() {
        let broke = Arc::new(AtomicBool::new(false));
        let mt = Box::new(SlowMt {
            every: Duration::from_millis(10),
            chunks: usize::MAX,
            broke: broke.clone(),
        });
        let (engine, _sink) = start(live(Vec::new()), energy(), Box::new(ConstAsr("x")), mt, cfg());
        std::thread::sleep(Duration::from_millis(50));
        engine.stop();
        let deadline = Instant::now() + Duration::from_secs(2);
        while !broke.load(Ordering::SeqCst) {
            assert!(Instant::now() < deadline, "lần làm nóng phải dừng");
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}
```

Sửa `crates/pipeline/src/segmenter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/segmenter.rs
+++ b/crates/pipeline/src/segmenter.rs
@@ -358,6 +358,17 @@
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
use pipeline::engine::{
    EnergyVad, Engine, EngineConfig, EventSink, Fatal, Indicators, SampleSource, Usage, VadFactory,
};
use pipeline::prompt::Lang;
use pipeline::subtitle::{Delta, Status, Subtitle};
use pipeline::supervisor::{AsrSpec, Clock, FakeClock, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
use std::collections::BTreeMap;
use std::ops::ControlFlow;
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
    Fatal(Fatal, String),
}

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<Ev>>,
    levels: Mutex<Vec<f32>>,
    usage: Mutex<Vec<Usage>>,
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
        self.events.lock().unwrap().push(Ev::Fatal(kind, reason.to_string()));
    }
    fn usage(&self, u: &Usage) -> ControlFlow<()> {
        self.usage.lock().unwrap().push(*u);
        ControlFlow::Continue(())
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

/// Các test này phát âm thanh nhanh gấp 20 lần thời gian thực, nên ngưỡng trễ 6 giây chỉ còn 300 ms thật: đặt các ngưỡng
/// trễ rất lớn để máy bận không làm test đỏ. Luật trễ có test riêng, tất định, trong `engine.rs` (Q3 của review 02b).
fn config(languages: &[&str]) -> EngineConfig {
    let mut pipeline = PipelineConfig::default();
    pipeline.queue.lag_warn_ms = 600_000;
    pipeline.queue.asr_drop_after_ms = 600_000;
    pipeline.queue.mt_skip_after_ms = 600_000;
    EngineConfig {
        pipeline,
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
    // Phút cho hạn mức (§6.8): tiếng nói của các câu đã dịch xong, không gồm đệm; câu ghép cộng từng đoạn, không tính
    // khoảng nghỉ 3 008–3 392 ms; câu tiếng Việt (`same_lang`) và đoạn bị lọc không tính.
    assert_eq!(
        metrics.translated_speech_ms,
        (3_008 - 992) + (4_928 - 3_392) + (7_616 - 6_400)
    );
    let usage: u64 = sink.usage.lock().unwrap().iter().map(|u| u.speech_ms).sum();
    assert_eq!(usage, metrics.translated_speech_ms, "mỗi đoạn được báo đúng một lần");
    assert!(!sink.levels.lock().unwrap().is_empty(), "có mức âm lượng cho giao diện");
    assert!(
        !sink
            .events()
            .iter()
            .any(|e| matches!(e, Ev::Indicators(i) if i.lagging || i.no_audio)),
        "không trễ, và 1,5 giây im lặng chưa phải \"không có âm thanh\""
    );
    assert!(!sink.events().iter().any(|e| matches!(e, Ev::Fatal(..))));

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
            Ev::Fatal(Fatal::Asr, r) => Some(r),
            Ev::Fatal(kind, r) => panic!("{kind:?}: {r}"),
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

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --test engine`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0432]: unresolved imports `pipeline::engine::EnergyVad`, `pipeline::engine::Engine`, `pipeline::engine::EngineConfig`, `pipeline::engine::EventSink`, `pipeline::engine::Fatal`, `pipeline::engine::Indicators`, `pipeline::engine::SampleSource`, `pipeline::engine::Usage`, `pipeline::engine::VadFactory`
```

- [ ] **Step 4: Viết code**

Thêm vào `crates/pipeline/src/engine.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::{AudioConfig, FilterConfig, MtConfig, PipelineConfig};
use crate::filter::{Evidence, Verdict, pcm_skip, verdict};
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
    /// Thêm mẫu mới vào `out`, chờ tối đa `timeout` nếu chưa có. `Ok(false)`: hết luồng. `Err`: nguồn hỏng hẳn (app đã
    /// thử mở lại mà không được, 02c); engine báo [`Fatal::Audio`].
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

/// Lý do phiên phải dừng.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fatal {
    /// Không nạp được VAD, VAD lỗi giữa chừng, hoặc luồng VAD dừng bất thường.
    Vad,
    /// Nguồn âm thanh hỏng hẳn (`FrameSource::read` trả lỗi).
    Audio,
    /// `asr-worker` không dùng được nữa (lỗi quá 5 lần trong 10 phút, §6.4), hoặc luồng nhận dạng dừng bất thường.
    Asr,
    /// Luồng phụ đề dừng bất thường.
    Internal,
    /// Chạm hạn mức (§6.8): app dừng phiên với lý do `quota_exhausted` (kế hoạch 06).
    QuotaExhausted,
}

/// Một lần đếm phút cho hạn mức (§6.8, "Cách đếm phút"): phụ đề `sub_id` vừa sang `done`, và `speech_ms` là phần tiếng nói
/// chưa được tính của nó (không gồm đệm, đoạn gộp cộng từng đoạn con). Câu được dịch lại sau khi ghép thêm đoạn chỉ tính
/// phần mới. `same_lang`, `failed`, `skipped`, `dropped` và đoạn bị lọc không bao giờ có `Usage`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Usage {
    pub sub_id: u64,
    pub speech_ms: u64,
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
    /// Phút vừa dịch xong, để bộ đếm hạn mức cộng (kế hoạch 06). Trả `Break` khi đã chạm hạn mức: engine dừng theo luật
    /// "Khi chạm hạn mức" rồi báo [`Fatal::QuotaExhausted`]. Mặc định không đếm gì.
    fn usage(&self, _usage: &Usage) -> ControlFlow<()> {
        ControlFlow::Continue(())
    }
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
        speech_ms: u64,
        lang: String,
        text: String,
        asr_ms: f32,
    },
    /// Luật bỏ đoạn loại (không có tiếng nói, câu ảo giác, chuỗi lặp, câu đệm, quá ngắn): không phụ đề, không cắt chuỗi
    /// ghép câu.
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
    /// Luồng dịch dừng bất thường.
    MtGone,
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
    fn new(queue: AsrQueue) -> Self {
        Self {
            state: Mutex::new((queue, false)),
            ready: Condvar::new(),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, (AsrQueue, bool)> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn push(&self, segment: PendingSegment) {
        let mut state = self.lock();
        if !state.1 {
            state.0.push(segment);
        }
        drop(state);
        self.ready.notify_one();
    }

    fn close(&self) {
        self.lock().1 = true;
        self.ready.notify_all();
    }

    /// Bỏ mọi đoạn đang chờ và đóng hàng (hết hạn mức). Trả số đoạn bị bỏ.
    fn clear(&self) -> usize {
        let mut state = self.lock();
        let mut n = 0;
        while state.0.pop(0).is_some() {
            n += 1;
        }
        state.1 = true;
        drop(state);
        self.ready.notify_all();
        n
    }

    /// Chờ đoạn kế tiếp; `None` khi đã đóng và hết đoạn.
    fn pop(&self, now_ms: &AtomicU64) -> Option<Popped> {
        let mut state = self.lock();
        loop {
            if let Some(p) = state.0.pop(now_ms.load(Ordering::SeqCst)) {
                return Some(p);
            }
            if state.1 {
                return None;
            }
            state = self.ready.wait(state).unwrap_or_else(|e| e.into_inner());
        }
    }
}

/// Cờ dùng chung giữa `Engine` và các luồng.
#[derive(Clone, Default)]
struct Flags {
    /// Luồng VAD ngừng đọc âm thanh.
    stop: Arc<AtomicBool>,
    /// Đã bấm Dừng: hạn `stop_grace_ms` bắt đầu.
    hurry: Arc<AtomicBool>,
    /// Hết hạn mức.
    quota: Arc<AtomicBool>,
}

pub struct Engine {
    flags: Flags,
    vad: Option<JoinHandle<()>>,
    /// Luồng nhận dạng và luồng dịch: chỉ `join` chờ chúng; `stop` thì không (xem đầu module).
    workers: Vec<JoinHandle<()>>,
    composer: Option<JoinHandle<SessionMetrics>>,
}

impl Engine {
    /// Chạy các luồng của một phiên. Luồng VAD (luồng duy nhất tự đọc âm thanh mãi) chạy sau cùng: nếu không tạo được
    /// một luồng, các luồng đã chạy thấy đầu vào của chúng đóng lại và tự kết thúc.
    pub fn start(
        cfg: EngineConfig,
        source: Box<dyn FrameSource>,
        vad: VadFactory,
        asr: Box<dyn Asr>,
        mt: Box<dyn Mt>,
        sink: Arc<dyn EventSink>,
    ) -> Result<Self> {
        let flags = Flags::default();
        let now_ms = Arc::new(AtomicU64::new(0));
        let queue = Arc::new(SharedQueue::new(AsrQueue::new(cfg.pipeline.queue.clone())));
        let (tx, rx) = mpsc::channel::<Msg>();
        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();
        let fail = |e: std::io::Error, flags: &Flags, queue: &SharedQueue| {
            flags.stop.store(true, Ordering::SeqCst);
            flags.hurry.store(true, Ordering::SeqCst);
            queue.close();
            anyhow::Error::from(e).context("không tạo được luồng của phiên dịch")
        };

        let mt_thread = {
            let (tx, mt_cfg, target, hurry) = (tx.clone(), cfg.pipeline.mt.clone(), cfg.target, flags.hurry.clone());
            std::thread::Builder::new()
                .name("mt".into())
                .spawn(move || {
                    let _guard = MtGuard(tx.clone());
                    mt_loop(mt, jobs_rx, &tx, &mt_cfg, target, &hurry)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        let asr_thread = {
            let (asr_queue, tx, now_ms) = (queue.clone(), tx.clone(), now_ms.clone());
            let (filter, languages) = (cfg.pipeline.filter.clone(), cfg.languages.clone());
            let max_prompt = cfg.pipeline.asr.max_prompt_tokens;
            std::thread::Builder::new()
                .name("asr".into())
                .spawn(move || {
                    let _guard = AsrGuard(tx.clone());
                    asr_loop(asr, &asr_queue, &tx, &now_ms, &filter, languages, max_prompt)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        let vad_pipeline = cfg.pipeline.clone();
        let composer = {
            let (composer_flags, asr_queue, sink) = (flags.clone(), queue.clone(), sink.clone());
            std::thread::Builder::new()
                .name("subtitles".into())
                .spawn(move || {
                    let _guard = ComposerGuard {
                        stop: composer_flags.stop.clone(),
                        sink: sink.clone(),
                    };
                    Composer::new(cfg, sink, jobs_tx, composer_flags, asr_queue).run(rx)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        let vad_thread = {
            let (stop, now_ms, queue2, sink) = (flags.stop.clone(), now_ms.clone(), queue.clone(), sink.clone());
            std::thread::Builder::new()
                .name("vad".into())
                .stack_size(VAD_STACK_BYTES)
                .spawn(move || {
                    let _guard = VadGuard {
                        queue: queue2.clone(),
                        sink: sink.clone(),
                    };
                    vad_loop(source, vad, &vad_pipeline, &queue2, &tx, &*sink, &now_ms, &stop)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        Ok(Self {
            flags,
            vad: Some(vad_thread),
            workers: vec![asr_thread, mt_thread],
            composer: Some(composer),
        })
    }

    /// Dừng phiên (bấm Dừng), xem đầu module. Trả về sau tối đa khoảng `mt.stop_grace_ms`. Trả số đo của phiên.
    pub fn stop(mut self) -> SessionMetrics {
        self.flags.hurry.store(true, Ordering::SeqCst);
        self.flags.stop.store(true, Ordering::SeqCst);
        let metrics = self.join_composer();
        self.workers.clear(); // không chờ: luồng nhận dạng và luồng dịch tự kết thúc
        metrics
    }

    /// Hết hạn mức (§6.8): bỏ hàng đợi, dịch xong câu đang dịch, rồi báo [`Fatal::QuotaExhausted`]. Không chặn.
    pub fn exhaust_quota(&self) {
        self.flags.quota.store(true, Ordering::SeqCst);
    }

    /// Chờ tới khi nguồn âm thanh tự hết và mọi đoạn đã xử lý xong (phát file WAV).
    pub fn join(mut self) -> SessionMetrics {
        let metrics = self.join_composer();
        for t in self.workers.drain(..) {
            let _ = t.join();
        }
        metrics
    }

    fn join_composer(&mut self) -> SessionMetrics {
        let metrics = match self.composer.take().map(JoinHandle::join) {
            Some(Ok(m)) => m,
            Some(Err(_)) => {
                log::error!("luồng phụ đề dừng bất thường");
                SessionMetrics::default()
            }
            None => SessionMetrics::default(),
        };
        // Luồng phụ đề đã thoát thì luồng VAD không còn ai nhận: dừng nó.
        self.flags.stop.store(true, Ordering::SeqCst);
        if let Some(vad) = self.vad.take() {
            let _ = vad.join();
        }
        metrics
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        if self.composer.is_some() {
            self.flags.hurry.store(true, Ordering::SeqCst);
            self.flags.stop.store(true, Ordering::SeqCst);
            self.join_composer();
        }
    }
}

/// Luồng VAD kết thúc (kể cả khi panic): đóng hàng đợi nhận dạng, để luồng nhận dạng không chờ mãi.
struct VadGuard {
    queue: Arc<SharedQueue>,
    sink: Arc<dyn EventSink>,
}

impl Drop for VadGuard {
    fn drop(&mut self) {
        self.queue.close();
        if std::thread::panicking() {
            self.sink.fatal(Fatal::Vad, "luồng VAD dừng bất thường");
        }
    }
}

/// Luồng nhận dạng kết thúc (kể cả khi panic): báo luồng phụ đề.
struct AsrGuard(Sender<Msg>);

impl Drop for AsrGuard {
    fn drop(&mut self) {
        if std::thread::panicking() {
            let _ = self.0.send(Msg::Asr(AsrOutcome::Unavailable(
                "luồng nhận dạng dừng bất thường".into(),
            )));
        }
        let _ = self.0.send(Msg::AsrDone);
    }
}

/// Luồng dịch panic: báo luồng phụ đề, để câu đang dịch không chờ mãi.
struct MtGuard(Sender<Msg>);

impl Drop for MtGuard {
    fn drop(&mut self) {
        if std::thread::panicking() {
            let _ = self.0.send(Msg::MtGone);
        }
    }
}

/// Luồng phụ đề panic: dừng luồng VAD và báo app.
struct ComposerGuard {
    stop: Arc<AtomicBool>,
    sink: Arc<dyn EventSink>,
}

impl Drop for ComposerGuard {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.stop.store(true, Ordering::SeqCst);
            self.sink.fatal(Fatal::Internal, "luồng phụ đề dừng bất thường");
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
        queue.push(PendingSegment::from(seg));
    };
    'outer: while !stop.load(Ordering::SeqCst) {
        match source.read(&mut buf, Duration::from_millis(20)) {
            Ok(true) => {}
            Ok(false) => break,
            Err(e) => {
                log::error!("nguồn âm thanh lỗi: {e:#}");
                sink.fatal(Fatal::Audio, &format!("nguồn âm thanh lỗi: {e:#}"));
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
                    sink.fatal(Fatal::Vad, &format!("VAD lỗi: {e:#}"));
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
                let evidence = Evidence {
                    no_speech_prob: r.no_speech_prob,
                    avg_logprob: r.avg_logprob,
                    vad_mean_prob: segment.mean_prob,
                    speech_ms: segment.speech_ms,
                };
                match verdict(&evidence, &text, filter) {
                    Verdict::Speech => {
                        history.push(&r.lang, &r.tokens);
                        prev_lang = Some(r.lang.clone());
                        AsrOutcome::Transcribed {
                            ids: segment.ids,
                            start_ms: segment.start_ms,
                            end_ms: segment.end_ms,
                            speech_ms: segment.speech_ms,
                            lang: r.lang,
                            text,
                            asr_ms: r.asr_ms + r.lid_ms,
                        }
                    }
                    Verdict::NoSpeech | Verdict::Hallucination | Verdict::Repetition | Verdict::Filler => {
                        AsrOutcome::Filtered { ids: segment.ids }
                    }
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
}

fn mt_loop(
    mut mt: Box<dyn Mt>,
    jobs: Receiver<MtJob>,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    hurry: &AtomicBool,
) {
    // Làm nóng khi bắt đầu phiên (§6.5); lỗi ở đây không quan trọng, request thật sẽ báo lỗi của nó. Bấm Dừng thì bỏ
    // ngang lần làm nóng.
    let warmup = translation_prompt("Hello.", Lang::En, target);
    let req = crate::llama::ChatRequest {
        prompt: &warmup,
        max_tokens: 32,
        repeat_penalty: cfg.repeat_penalty,
    };
    if !hurry.load(Ordering::SeqCst)
        && let Err(e) = mt.stream(&req, &mut |_| {
            if hurry.load(Ordering::SeqCst) {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        })
    {
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
    /// Tiếng nói của câu (không gồm đệm), và phần đã được tính cho hạn mức.
    speech_ms: u64,
    counted_ms: u64,
    /// Ngữ cảnh chụp lúc mở câu (cờ `translationContext`).
    context: Option<String>,
}

struct InFlight {
    sub_id: u64,
    version: u32,
    cancel: Arc<AtomicBool>,
}

struct Composer {
    cfg: EngineConfig,
    sink: Arc<dyn EventSink>,
    jobs: Option<Sender<MtJob>>,
    flags: Flags,
    asr_queue: Arc<SharedQueue>,
    window_ms: u64,
    stop_grace: Duration,
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
    /// Lúc bấm Dừng (giờ thật), hoặc lúc chạm hạn mức.
    hurry_since: Option<Instant>,
    quota_hit: bool,
    /// Hết hạn dừng: luồng phụ đề thoát ngay, không chờ luồng nhận dạng hay luồng dịch.
    abandoned: bool,
}

impl Composer {
    fn new(
        cfg: EngineConfig,
        sink: Arc<dyn EventSink>,
        jobs: Sender<MtJob>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
    ) -> Self {
        let window_ms = merge_window_ms(cfg.pipeline.segmenter.end_silence_ms, &cfg.pipeline.merge);
        let queue = MtQueue::new(cfg.pipeline.queue.clone());
        let stop_grace = Duration::from_millis(cfg.pipeline.mt.stop_grace_ms);
        Self {
            cfg,
            sink,
            jobs: Some(jobs),
            flags,
            asr_queue,
            window_ms,
            stop_grace,
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
            hurry_since: None,
            quota_hit: false,
            abandoned: false,
        }
    }

    fn run(mut self, rx: Receiver<Msg>) -> SessionMetrics {
        loop {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(msg) => self.handle(msg),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if self.step() {
                break;
            }
        }
        self.finish()
    }

    /// Xét cờ dừng và hạn mức, gửi câu kế tiếp đi dịch. Trả `true` khi luồng phụ đề phải thoát.
    fn step(&mut self) -> bool {
        self.check_flags();
        self.dispatch();
        self.abandoned
            || (self.asr_done && self.in_flight.is_none() && self.queue.is_empty())
            || (self.quota_hit && self.in_flight.is_none())
    }

    fn finish(mut self) -> SessionMetrics {
        self.finish_open();
        drop(self.jobs.take()); // luồng dịch thoát
        if self.quota_hit {
            self.sink.fatal(Fatal::QuotaExhausted, "đã dùng hết hạn mức");
        }
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
            Msg::MtGone => {
                log::error!("luồng dịch dừng bất thường");
                self.jobs = None;
                self.set_mt_unavailable();
                if let Some(f) = self.in_flight.take() {
                    self.settle(f.sub_id, Status::Failed, String::new());
                }
            }
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
        if self.quota_hit {
            // Hết hạn mức: đoạn chép lời xong muộn không còn được hiện hay dịch.
            if let AsrOutcome::Transcribed { ids, .. }
            | AsrOutcome::Filtered { ids }
            | AsrOutcome::Dropped { ids, .. } = &outcome
            {
                for id in ids {
                    self.pending.remove(id);
                }
            }
            return;
        }
        match outcome {
            AsrOutcome::Transcribed {
                ids,
                start_ms,
                end_ms,
                speech_ms,
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
                let window = self.window_ms;
                if let Some((open, sub_id)) = self.open.as_mut().filter(|(o, _)| o.accepts(&piece, window)) {
                    open.push(&piece);
                    let (sub_id, closed, joined) = (*sub_id, open.is_closed(), open.text().to_string());
                    self.metrics.merges += 1;
                    self.grow(sub_id, &joined, end_ms, speech_ms, closed);
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
                    // Ngữ cảnh là câu chốt trước câu này, chụp ngay lúc mở câu (§6.5).
                    let context = self
                        .cfg
                        .translation_context
                        .then(|| self.previous.get(&lang).cloned())
                        .flatten();
                    self.subs.insert(
                        sub_id,
                        SubState {
                            sub,
                            version: 1,
                            closed,
                            speech_ms,
                            counted_ms: 0,
                            context,
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
    fn grow(&mut self, sub_id: u64, text: &str, end_ms: u64, speech_ms: u64, closed: bool) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        state.version += 1;
        state.closed = closed;
        state.speech_ms += speech_ms;
        state.sub.src_text = text.to_string();
        state.sub.end_ms = end_ms;
        state.sub.tgt_text.clear();
        state.sub.status = Status::AsrDone;
        state.sub.provisional = !closed;
        let version = state.version;
        self.sink.subtitle(&state.sub);
        let in_flight = self.in_flight.as_ref().is_some_and(|f| f.sub_id == sub_id);
        if in_flight {
            // Bản dịch của câu cũ không còn đúng: hủy, đưa câu mới lên đầu hàng. Câu đã ghép thêm một lần trong lúc bản cũ
            // còn đang dịch thì đã có trong hàng: chỉ cập nhật mục đó, không thêm mục thứ hai.
            if let Some(f) = &self.in_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            let total = state.speech_ms;
            if !self.queue.update(sub_id, text, end_ms, total, version) {
                self.enqueue(sub_id, version, true);
            }
        } else {
            let total = state.speech_ms;
            if !self.queue.update(sub_id, text, end_ms, total, version) {
                self.enqueue(sub_id, version, false);
            }
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
            speech_ms: state.speech_ms,
            context: state.context.clone(),
            enqueued_ms: self.now_ms,
            open: !state.closed,
            replaces: state.sub.replaces.clone(),
        };
        if front {
            self.queue.push_front(item);
            return;
        }
        for merged in self.queue.push(item) {
            let mut counted = 0;
            for id in &merged.replaces {
                if let Some(absorbed) = self.subs.remove(id) {
                    counted += absorbed.counted_ms;
                }
            }
            if let Some(state) = self.subs.get_mut(&merged.sub_id) {
                state.version = merged.version;
                state.speech_ms = merged.speech_ms;
                state.counted_ms += counted;
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

    fn set_mt_unavailable(&mut self) {
        self.mt_unavailable = true;
        if !self.indicators.translation_unavailable {
            self.indicators.translation_unavailable = true;
            self.sink.indicators(&self.indicators);
        }
    }

    /// Xét cờ của `Engine`: hết hạn mức, đã bấm Dừng, đã hết hạn dừng.
    fn check_flags(&mut self) {
        if self.flags.quota.load(Ordering::SeqCst) && !self.quota_hit {
            self.hit_quota();
        }
        if self.flags.hurry.load(Ordering::SeqCst) && self.hurry_since.is_none() {
            self.hurry_since = Some(Instant::now());
        }
        if self.hurry_since.is_some_and(|t| t.elapsed() >= self.stop_grace) && !self.abandoned {
            self.abandon();
        }
    }

    /// Chạm hạn mức (§6.8): dừng thu, bỏ đoạn chờ nhận dạng và câu chờ dịch, chỉ dịch xong câu đang dịch.
    fn hit_quota(&mut self) {
        log::info!("chạm hạn mức: dừng phiên");
        self.quota_hit = true;
        self.flags.stop.store(true, Ordering::SeqCst);
        self.asr_queue.clear();
        self.pending.clear();
        self.finish_open();
        while let Some(Ready::Translate(item) | Ready::Skip(item)) = self.queue.pop(self.now_ms) {
            self.settle(item.sub_id, Status::Skipped, String::new());
        }
        if self.hurry_since.is_none() {
            self.hurry_since = Some(Instant::now());
        }
    }

    /// Hết hạn dừng: câu đang dịch và câu chờ dịch thành `skipped`; luồng phụ đề thoát.
    fn abandon(&mut self) {
        self.abandoned = true;
        if let Some(f) = self.in_flight.take() {
            f.cancel.store(true, Ordering::SeqCst);
            self.settle(f.sub_id, Status::Skipped, String::new());
        }
        while let Some(Ready::Translate(item) | Ready::Skip(item)) = self.queue.pop(self.now_ms) {
            self.settle(item.sub_id, Status::Skipped, String::new());
        }
    }

    fn dispatch(&mut self) {
        while self.in_flight.is_none() && !self.quota_hit && !self.abandoned {
            let item = match self.queue.pop(self.now_ms) {
                None => return,
                Some(Ready::Translate(item)) if !self.mt_unavailable => item,
                Some(Ready::Translate(item)) => {
                    self.settle(item.sub_id, Status::Failed, String::new());
                    continue;
                }
                Some(Ready::Skip(item)) => {
                    self.settle(item.sub_id, Status::Skipped, String::new());
                    continue;
                }
            };
            let Some(state) = self.subs.get_mut(&item.sub_id) else {
                continue;
            };
            if state.version != item.version {
                continue; // mục cũ của một câu đã được ghép thêm: bản mới nằm ở mục khác của hàng
            }
            state.sub.status = Status::Translating;
            state.sub.tgt_text.clear();
            self.sink.subtitle(&state.sub);
            let cancel = Arc::new(AtomicBool::new(false));
            let job = MtJob {
                sub_id: item.sub_id,
                version: item.version,
                src: Lang::from_code(&item.lang).unwrap_or(Lang::En),
                text: item.text,
                context: item.context,
                cancel: cancel.clone(),
            };
            self.in_flight = Some(InFlight {
                sub_id: item.sub_id,
                version: item.version,
                cancel,
            });
            let sent = self.jobs.as_ref().is_some_and(|j| j.send(job).is_ok());
            if !sent {
                self.in_flight = None;
                self.set_mt_unavailable();
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
                self.set_mt_unavailable();
                self.settle(sub_id, Status::Failed, String::new());
            }
        }
    }

    /// Kết thúc phần dịch của một phụ đề. `Done` thì đếm phút cho hạn mức (§6.8).
    fn settle(&mut self, sub_id: u64, status: Status, tgt_text: String) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        let mut usage = None;
        match status {
            Status::Failed => self.metrics.failed += 1,
            Status::Skipped => self.metrics.skipped += 1,
            Status::Done => {
                self.metrics
                    .latency_ms
                    .push(self.now_ms.saturating_sub(state.sub.end_ms) as f32);
                let new_ms = state.speech_ms.saturating_sub(state.counted_ms);
                state.counted_ms = state.speech_ms;
                if new_ms > 0 {
                    self.metrics.translated_speech_ms += new_ms;
                    usage = Some(Usage {
                        sub_id,
                        speech_ms: new_ms,
                    });
                }
            }
            _ => {}
        }
        state.sub.status = status;
        state.sub.tgt_text = tgt_text;
        self.sink.subtitle(&state.sub);
        if state.closed {
            self.subs.remove(&sub_id);
        }
        if let Some(usage) = usage
            && self.sink.usage(&usage).is_break()
            && !self.quota_hit
        {
            self.hit_quota();
        }
    }
}
```

Sửa `crates/pipeline/src/segmenter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/segmenter.rs
+++ b/crates/pipeline/src/segmenter.rs
@@ -188,6 +188,12 @@
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
test result: ok. 153 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.36s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 11 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.53s
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.18s
test result: ok. 38 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.81s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-901454d330477dd2)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-b11221de58f4122f)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-d5d453cb8d0fce77)
     Running tests/clients.rs (target/debug/deps/clients-79f5008458d238c8)
     Running tests/engine.rs (target/debug/deps/engine-75c665353de2c3db)
     Running tests/lifecycle.rs (target/debug/deps/lifecycle-3343c457a743e8de)
     Running tests/shutdown.rs (target/debug/deps/shutdown-8294228bcb944e13)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-c2808b28efa7e0e7)
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline/src/engine.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/segmenter.rs \
  crates/pipeline/tests/engine.rs
git commit -m "feat(pipeline): engine của một phiên dịch: bốn luồng, phụ đề và sự kiện theo §6.6, đếm phút" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Clip FLEURS cho test tích hợp, test với model thật, công cụ đo `no_speech_prob`

Đ20 và dòng 115, 295:
- `tests/fixtures/audio/`: một file WAV ghép ba câu FLEURS (CC BY 4.0, ghi công trong `ATTRIBUTION.txt`) với khoảng lặng, cùng mốc thời gian của từng câu. Dựng lại bằng `build_fixture.py` từ bộ clip A4 có sẵn, cho ra đúng các byte đã commit.
- `tests/engine.rs` thêm test chạy pipeline từ file WAV đó, với VAD theo năng lượng và tiến trình phụ giả (chạy mặc định).
- `tests/real_sidecars.rs` (bỏ qua mặc định): cùng file, qua Silero, `asr-worker` và `llama-server` thật.
- `tests/no_speech.rs` (bỏ qua mặc định, QĐ22): tín hiệu không có tiếng nói qua `asr-worker` thật; có VAD thì in số đoạn VAD của app cắt ra và áp luật lọc với xác suất VAD của đoạn, như app. Worker nhận nguyên cả tín hiệu (hay đoạn 8 giây), không theo từng đoạn VAD cắt ra; doc của file ghi rõ điều này (N-4 của review 02 lần 2).

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
python3 tests/fixtures/audio/build_fixture.py && shasum -a 256 tests/fixtures/audio/fleurs-en-en-vi.wav && git status --short tests/fixtures
```
Expected: 19,08 giây, ba câu, đúng SHA-256 này, và hai file mới chưa commit:

```text
19.08 giây, 3 câu
bfd08d5c999b5ea285c5f0ddc1056eb5c4634c52ec39cec84134fb4be3e0a706  tests/fixtures/audio/fleurs-en-en-vi.wav
```

`tests/fixtures/audio/fleurs-en-en-vi.json` phải có đúng nội dung:

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
@@ -11,7 +11,7 @@
 use pipeline::supervisor::{AsrSpec, Clock, FakeClock, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
 use std::collections::BTreeMap;
 use std::ops::ControlFlow;
-use std::path::PathBuf;
+use std::path::{Path, PathBuf};
 use std::sync::{Arc, Mutex, Once};
 use std::time::{Duration, Instant};
 
@@ -410,3 +410,63 @@
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
//! Việc cho MVP §6.4 (Đ12 của kế hoạch 00; Q11 của review 02b): `no_speech_prob` và `avg_logprob` của `asr-worker` thật
//! trên âm thanh không có tiếng nói, và luật lọc của app (`filter::verdict`) có bỏ được đoạn đó không. Đặt thêm
//! `MT_VAD_MODEL` thì in cả số đoạn mà VAD của app (Silero, luật cắt đoạn mặc định) cắt ra từ tín hiệu (0 nghĩa là trong
//! app tín hiệu đó không bao giờ tới `asr-worker`), và luật lọc dùng xác suất VAD trung bình của đoạn đầu như app. Tín hiệu
//! tổng hợp: im lặng, nhiễu trắng, nhiễu hồng, tiếng ù điện, tiếng gõ phím, hợp âm. Thêm file WAV bất kỳ (ví dụ clip nhạc
//! CC0) qua `NO_SPEECH_WAVS`, mỗi file 16 kHz mono 16-bit, cắt thành đoạn 8 giây như VAD (tối đa 10 đoạn mỗi file).
//!
//! Mỗi tín hiệu (hay đoạn 8 giây của file WAV) được gửi cho worker nguyên cả đoạn, không theo từng đoạn VAD cắt ra (N-4
//! của review 02 lần 2): VAD chỉ dùng để đếm số đoạn và lấy xác suất VAD của đoạn đầu. Trong app, worker chỉ nhận đoạn
//! VAD đã cắt; chữ bịa và `avg_logprob` của đoạn ngắn đó có thể khác số in ở đây.
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
use pipeline::filter::{Evidence, Verdict, compression_ratio, verdict};
use pipeline::segmenter::{FRAME_SAMPLES, Segment, Segmenter};
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

/// Các đoạn mà VAD và luật cắt đoạn mặc định của app cắt ra từ tín hiệu.
fn vad_segments(vad: &mut SileroVad, samples: &[f32]) -> Vec<Segment> {
    vad.reset().unwrap();
    let mut segmenter = Segmenter::new(PipelineConfig::default().segmenter);
    let mut out = Vec::new();
    for frame in samples.as_chunks::<FRAME_SAMPLES>().0 {
        let prob = vad.prob(frame).unwrap();
        out.extend(segmenter.push(frame, prob));
    }
    out.extend(segmenter.flush());
    out
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
        let cut = vad.as_mut().map(|vad| vad_segments(vad, samples));
        // Như app: đoạn có xác suất VAD và độ dài tiếng nói của nó. Không có VAD thì cả tín hiệu là một đoạn chắc chắn.
        let (vad_mean_prob, speech_ms) = match cut.as_deref() {
            Some([first, ..]) => (first.mean_prob, first.speech_ms),
            _ => (1.0, (samples.len() * 1000 / RATE) as u64),
        };
        let evidence = Evidence {
            no_speech_prob: r.no_speech_prob,
            avg_logprob: r.avg_logprob,
            vad_mean_prob,
            speech_ms,
        };
        let v = verdict(&evidence, &text, &cfg);
        let segments = cut.as_ref().map(Vec::len);
        println!(
            "{}",
            serde_json::json!({
                "signal": name, "lang": r.lang, "lang_prob": r.lang_prob, "no_speech_prob": r.no_speech_prob,
                "avg_logprob": r.avg_logprob, "vad_segments": segments,
                "vad_mean_prob": cut.as_ref().and_then(|c| c.first()).map(|s| s.mean_prob),
                "compression_ratio": compression_ratio(&text), "verdict": format!("{v:?}"), "text": text,
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
test result: ok. 153 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.37s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 11 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.56s
test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.63s
test result: ok. 38 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.93s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-901454d330477dd2)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-b11221de58f4122f)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-d5d453cb8d0fce77)
     Running tests/clients.rs (target/debug/deps/clients-79f5008458d238c8)
     Running tests/engine.rs (target/debug/deps/engine-75c665353de2c3db)
     Running tests/lifecycle.rs (target/debug/deps/lifecycle-3343c457a743e8de)
     Running tests/no_speech.rs (target/debug/deps/no_speech-2e858ca2d0d906bc)
     Running tests/real_sidecars.rs (target/debug/deps/real_sidecars-24319808e9f3e346)
     Running tests/shutdown.rs (target/debug/deps/shutdown-8294228bcb944e13)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-c2808b28efa7e0e7)
```

- [ ] **Step 4: Chạy test với model thật**

Cần bản release của `asr-worker` (02a, Task 1, Step 7) và `llama-server` b11146 ở `tools/`.

Run:
```bash
MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-small-q5_1.bin \
MT_LLAMA_SERVER=$PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server MT_MT_MODEL=$PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf \
MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx cargo test -p pipeline --test real_sidecars -- --include-ignored --nocapture
```
Expected: mỗi câu có ít nhất một phụ đề nằm trong khoảng thời gian của câu, đúng thứ tự; hai câu tiếng Anh `Done`, câu tiếng Việt `SameLang` (có thể bị VAD cắt làm hai đoạn); trước đó một dòng tóm tắt số đo của phiên (số đoạn theo kết cục, thời gian từng bước; không dùng làm số đo hiệu năng). Chữ chép và bản dịch tùy máy. Lúc lập kế hoạch (gói Nhẹ):

```text
4 đoạn (lọc 0, bỏ 0), 2 câu dịch, 0 lỗi, 0 bỏ bước dịch, 2 cùng ngôn ngữ, 0 lần ghép; cắt đoạn p50 320 ms, p90 320 ms; nhận dạng p50 111 ms, p90 114 ms; dịch p50 201 ms, p90 201 ms; tổng p50 496 ms, p90 509 ms; tiếng nói đã dịch 6016 ms
0 1472–4032 Done That didn't seem to make sense to me. It certainly wasn't fair. | Điều đó dường như không hợp lý chút nào. Chắc chắn là không công bằng.
1 7072–10528 Done The results of plotting analysis will be posted to a public website. | Kết quả phân tích đồ họa sẽ được đăng trên một trang web công cộng.
2 13088–14336 SameLang Cái nhà khoa học cho viết | 
3 14784–17472 SameLang vụp và trạm đã gây ra vụ nổ gắt lớn | 
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 32.16s
```

Run:
```bash
for m in large-v3-turbo-q5_0 small-q5_1; do
  MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-$m.bin \
  MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx cargo test -p pipeline --test no_speech -- --include-ignored --nocapture
done
```
Expected: 14 dòng JSON mỗi model rồi dòng tổng. VAD của app không cắt ra đoạn nào từ cả 14 tín hiệu (`"vad_segments":0`), nên không phụ đề nào hiện (`"shown_as_subtitle":0`). Không có VAD thì khác: turbo luôn cho `no_speech_prob` cỡ 1e-10 và bịa "you", "so", "Thank you." cho im lặng, ù điện, tiếng gõ phím. Task 6 chạy lại với bộ nhạc thử và ghi kết quả. Dòng tổng lúc lập kế hoạch, turbo rồi small:

```text
{"segments":14,"shown_as_subtitle":0,"shown":[]}
```

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
- `mt_eval.rs`: dịch bộ test A3 bằng đúng `pipeline::translate` của app, ghi JSONL cùng định dạng với `translate.py` (thêm `status`, `attempts`). `--limit` lấy N câu đầu mỗi chiều trước khi lọc biến thể `context`, như `translate.py` (N12 của review 02b). Mỗi file kết quả có `<…>.meta.json` ghi điều kiện của lượt chạy (git HEAD và cờ có thay đổi chưa commit, tên và kích thước model, đường dẫn và kích thước `llama-server` (N-5 của review 02 lần 2), `MtConfig`, biến thể, bộ test, `--limit`); chạy lại cùng `--out-dir` thì dịch tiếp, dòng cuối viết dở bị cắt, nhưng điều kiện khác lần trước thì từ chối, trừ khi có `--resume-anyway` (Q7 của review 02b: tránh bẫy R6 của kế hoạch 00).
- `score_mt.py`: `--outputs` (thư mục kết quả), `--label` (ghi `s7_mt-<nhãn>`), `--write-baseline` (chỉ cờ này mới ghi lại mốc `s7_mt.json`; không có nhãn hay cờ này thì từ chối chạy, N4), `--baseline` (bảng so từng chiều với mốc; thoát lỗi khi có chiều thấp hơn quá 0,01, và khi không so được: không lượt nào trùng tên với mốc, thiếu chiều mà mốc có, hay thiếu COMET, Q8). Dòng `failed` của `mt-eval` không tính vào tỉ lệ token và thời gian; bảng thêm cột "Lỗi". `test_score_mt.py` là test Python của phần so mốc. `translate.py` thêm `--label` cho thư mục kết quả.
- `build_ratio_set.py`, `ratio_stats.py` (QĐ22): bộ câu và bảng tỉ lệ token cho Task 6.

**Files:**
- Tạo: `bench/phase0/mt/build_ratio_set.py`
- Tạo: `bench/phase0/mt/ratio_stats.py`
- Sửa: `bench/phase0/mt/score_mt.py`
- Tạo: `bench/phase0/mt/test_score_mt.py`
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
//! Kết quả: `<out-dir>/<tên model>-<plain|context>.jsonl`, cùng `<…>.meta.json` ghi điều kiện của lượt chạy: git HEAD (kèm
//! cờ có thay đổi chưa commit), tên và kích thước model, đường dẫn và kích thước `llama-server`, `MtConfig`, biến thể, bộ
//! test. Chạy lại cùng `--out-dir` thì dịch
//! tiếp các câu chưa có, như `translate.py`, nhưng chỉ khi điều kiện y hệt lần trước (R6 của kế hoạch 00: tránh trộn
//! kết quả của hai phiên bản code hay hai model). Khác thì từ chối, trừ khi có `--resume-anyway`. Muốn dịch lại từ đầu
//! thì dùng thư mục khác (nhãn khác), đừng xóa kết quả mốc.

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

    fn meta() -> Meta {
        Meta {
            git_head: "abc".into(),
            git_dirty: false,
            model_file: "m.gguf".into(),
            model_bytes: 10,
            llama_server: "/tools/llama-b11146/llama-server".into(),
            llama_server_bytes: 20,
            variant: "plain".into(),
            testset_file: "t.jsonl".into(),
            testset_lines: 620,
            limit: 0,
            mt_config: serde_json::to_value(MtConfig::default()).unwrap(),
        }
    }

    /// Q7 của review 02b: dịch tiếp chỉ khi điều kiện y hệt lần trước.
    #[test]
    fn resuming_needs_the_same_conditions() {
        let dir = std::env::temp_dir().join(format!("mt-eval-meta-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("m-plain.meta.json");
        check_meta(&path, false, &meta(), false).unwrap();
        check_meta(&path, true, &meta(), false).unwrap();
        let cfg = MtConfig {
            repeat_penalty: 1.1,
            ..MtConfig::default()
        };
        let other = Meta {
            git_head: "def".into(),
            mt_config: serde_json::to_value(cfg).unwrap(),
            ..meta()
        };
        let err = check_meta(&path, true, &other, false).unwrap_err().to_string();
        assert!(err.contains("git_head, mt_config"), "{err}");
        let other_server = Meta {
            llama_server_bytes: 21,
            ..meta()
        };
        let err = check_meta(&path, true, &other_server, false).unwrap_err().to_string();
        assert!(err.contains("llama_server_bytes"), "đổi bản llama-server: {err}");
        assert_eq!(meta_diff(&meta(), &meta()), Vec::<&str>::new());
        check_meta(&path, true, &other, true).unwrap();
        let saved: Meta = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved, other, "--resume-anyway ghi điều kiện mới");
        std::fs::remove_file(&path).unwrap();
        let err = check_meta(&path, true, &meta(), false).unwrap_err().to_string();
        assert!(
            err.contains("không có hoặc hỏng"),
            "kết quả cũ mà thiếu meta.json: {err}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `cargo test -p latency-bench`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0433]: cannot find type `HashSet` in this scope
error[E0425]: cannot find type `Meta` in this scope
error[E0422]: cannot find struct, variant or union type `Meta` in this scope
error[E0422]: cannot find struct, variant or union type `MtConfig` in this scope
error[E0425]: cannot find function `done_ids` in this scope
error[E0433]: cannot find type `MtConfig` in this scope
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
                f"| {d} | {len(by_dir[d])} | {len(long)} | {f'{top:.2f}' if top is not None else '—'} "
                f"| {f'{suggest(top):.1f}' if top is not None else '—'} | {len(short)} "
                f"| {max((r['completion_tokens'] for r in short), default='—')} | {cap if cap is not None else '—'} "
                f"| {failed} |")
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
@@ -1,9 +1,14 @@
 """S7: chấm COMET từng chiều, so sánh theo cặp và lấy ngưỡng tỉ lệ token cho hậu xử lý (spec A3, §6.5).
 
-Dùng (môi trường COMET, xem kế hoạch 02):
-  python bench/phase0/mt/score_mt.py            # COMET + tỉ lệ token
-  python bench/phase0/mt/score_mt.py --no-comet # chỉ tỉ lệ token, không cần torch
-Kết quả: bench/phase0/results/s7_mt.json và s7_mt.md.
+Chấm một lượt mới mà không đụng tới mốc (chống thụt lùi A3, kế hoạch Giai đoạn 1 · 00 mục 6.7):
+  python bench/phase0/mt/score_mt.py --outputs bench/phase0/data/mt/outputs-<nhãn> --label <nhãn> \
+    --baseline bench/phase0/results/s7_mt.json
+Kết quả: bench/phase0/results/s7_mt-<nhãn>.json và .md; bảng cuối so từng chiều với mốc (không thấp hơn quá 0,01). Thêm
+`--no-comet` để chỉ tính tỉ lệ token (không cần torch); khi đó không so được với mốc.
+
+Ghi lại chính mốc S7 (bench/phase0/results/s7_mt.json và s7_mt.md, từ bench/phase0/data/mt/outputs/) phải nói rõ:
+  python bench/phase0/mt/score_mt.py --write-baseline
+Không có `--label` hay `--write-baseline` thì công cụ từ chối chạy, để không lỡ tay ghi đè mốc.
 """
 import argparse
 import glob
@@ -19,6 +24,7 @@
 RESULTS = os.path.join(ROOT, "bench", "phase0", "results")
 FLOOR = {"Q8_0": 0.83, "Q4_K_M": 0.80}  # mức sàn Anh→Việt (A3)
 CJK_GAP = 0.05  # Trung/Nhật/Hàn→Việt thấp hơn Anh→Việt quá mức này thì xem lại D5 (A3)
+REGRESSION = 0.01  # chống thụt lùi A3: mỗi chiều không thấp hơn mốc quá mức này
 MARKERS = ("[", "【")  # tiêu đề của mẫu prompt có ngữ cảnh: [Background Information], 【背景信息】
 
 
@@ -46,17 +52,25 @@
     return ("\n" in hyp and "\n" not in src) or (hyp.lstrip().startswith(MARKERS) and not src.lstrip().startswith(MARKERS))
 
 
+def is_failed(r):
+    """Dòng `failed` của `latency-bench mt-eval`: dịch lỗi cả hai lần, `hyp` là câu gốc, không có số đo thời gian."""
+    return r.get("finish_reason") == "failed"
+
+
 def summarize(rows, scores, items):
-    # Bản dịch bị cắt ở số token tối đa (finish_reason "length") là sinh lan man: đếm riêng, không tính vào ngưỡng.
+    # Bản dịch bị cắt ở số token tối đa (finish_reason "length", chỉ có ở translate.py) là sinh lan man: đếm riêng, không
+    # tính vào ngưỡng. Dòng `failed` (mt-eval) cũng đếm riêng: không có tỉ lệ token hay thời gian thật.
     capped = sum(r.get("finish_reason") == "length" for r in rows)
-    kept = [r for r in rows if r.get("finish_reason") != "length"] or rows  # cả chiều đều bị cắt: vẫn tính, để thấy
-    ratios = [r["completion_tokens"] / max(r["src_tokens"], 1) for r in kept]
-    out = {"n": len(rows), "length_capped": capped,
+    failed = sum(is_failed(r) for r in rows)
+    ok = [r for r in rows if not is_failed(r)]
+    kept = [r for r in ok if r.get("finish_reason") != "length"] or ok  # cả chiều đều bị cắt: vẫn tính, để thấy
+    ratios = [r["completion_tokens"] / max(r["src_tokens"], 1) for r in kept] or [0.0]
+    out = {"n": len(rows), "length_capped": capped, "failed": failed,
            "leaked": sum(looks_leaked(items[r["id"]]["src"], r["hyp"]) for r in rows),
            "token_ratio_max": max(ratios), "token_ratio_p99": percentile(ratios, 99),
            # Ngưỡng đề xuất: tỉ lệ lớn nhất đo được, cộng biên 25%, làm tròn lên 0,1.
            "proposed_threshold": math.ceil(max(ratios) * 1.25 * 10) / 10,
-           "total_ms_p50": percentile([r["total_ms"] for r in rows], 50)}
+           "total_ms_p50": percentile([r["total_ms"] for r in ok], 50) if ok else None}
     if scores:
         out["comet"] = mean(scores[r["id"]] for r in rows)
     return out
@@ -70,9 +84,10 @@
             by_dir[r["dir"]].append(i)
     out = {}
     for d, ids in sorted(by_dir.items()):
-        ms_a = percentile([runs[a][i]["total_ms"] for i in ids], 50)
-        ms_b = percentile([runs[b][i]["total_ms"] for i in ids], 50)
-        row = {"n": len(ids), "ms_change": ms_a / ms_b - 1,
+        timed = [i for i in ids if not is_failed(runs[a][i]) and not is_failed(runs[b][i])] or ids
+        ms_a = percentile([runs[a][i]["total_ms"] for i in timed], 50)
+        ms_b = percentile([runs[b][i]["total_ms"] for i in timed], 50)
+        row = {"n": len(ids), "ms_change": ms_a / ms_b - 1 if ms_b else 0.0,
                # Bản dịch dài hơn gấp đôi lượt kia: dấu hiệu dịch luôn câu ngữ cảnh hoặc sinh lan man.
                "longer_x2": sum(runs[a][i]["completion_tokens"] > 2 * runs[b][i]["completion_tokens"] for i in ids)}
         if scores:
@@ -99,13 +114,57 @@
     return f"{floor:.3f} ({'đạt' if per_dir[d]['comet'] >= floor else 'KHÔNG ĐẠT'})"
 
 
+def regression_lines(report, baseline):
+    """So COMET từng chiều của các lượt cùng tên với mốc.
+
+    Trả (các dòng Markdown, có chiều nào thụt lùi không, các chỗ không so được). Không so được là lỗi, vì khi đó bảng
+    trống mà lệnh vẫn "đạt": lượt này không có lượt nào cùng tên với mốc; một lượt thiếu chiều mà mốc có; hoặc thiếu
+    COMET (chấm bằng `--no-comet`) ở chiều mà mốc có. Lượt của mốc mà lượt này không chạy (ví dụ chỉ chạy Q4_K_M-plain)
+    thì không tính là thiếu.
+    """
+    lines = ["", "## So với mốc (chống thụt lùi A3)", "",
+             "| Lượt chạy | Chiều | Mốc | Lượt này | Chênh | Kết luận |", "|---|---|---|---|---|---|"]
+    regressed, missing = False, []
+    matched = [name for name in report if name in baseline["runs"]]
+    if not matched:
+        missing.append(f"không lượt nào trùng tên với mốc (lượt này: {sorted(report)}, mốc: {sorted(baseline['runs'])})")
+    for name in matched:
+        per_dir, base = report[name], baseline["runs"][name]
+        for d in sorted(base):
+            if "comet" not in base[d]:
+                continue
+            if d not in per_dir:
+                missing.append(f"{name}: thiếu chiều {d}")
+                continue
+            if "comet" not in per_dir[d]:
+                missing.append(f"{name} {d}: không có COMET (chấm bằng --no-comet?)")
+                continue
+            diff = per_dir[d]["comet"] - base[d]["comet"]
+            ok = diff >= -REGRESSION
+            regressed |= not ok
+            lines.append(f"| {name} | {d} | {base[d]['comet']:.3f} | {per_dir[d]['comet']:.3f} | {diff:+.3f} | "
+                         f"{'đạt' if ok else 'THỤT LÙI'} |")
+    return lines, regressed, missing
+
+
 def main():
     ap = argparse.ArgumentParser()
     ap.add_argument("--no-comet", action="store_true")
+    ap.add_argument("--outputs", default=os.path.join(DATA, "outputs"),
+                    help="thư mục JSONL của translate.py hoặc latency-bench mt-eval")
+    ap.add_argument("--label", default="",
+                    help="nhãn kết quả: ghi s7_mt-<nhãn>.json và .md, không ghi đè mốc s7_mt.json")
+    ap.add_argument("--write-baseline", action="store_true",
+                    help="ghi lại mốc S7 (s7_mt.json, s7_mt.md) từ bench/phase0/data/mt/outputs/")
+    ap.add_argument("--baseline", help="file s7_mt.json làm mốc: thêm bảng so từng chiều")
     args = ap.parse_args()
+    if bool(args.label) == args.write_baseline:
+        ap.error("cần đúng một trong hai: --label <nhãn> (lượt mới) hoặc --write-baseline (ghi lại mốc S7)")
+    if args.write_baseline and os.path.abspath(args.outputs) != os.path.join(DATA, "outputs"):
+        ap.error("--write-baseline chỉ chấm bench/phase0/data/mt/outputs/ (kết quả mốc của S7)")
     items = {it["id"]: it for it in map(json.loads, open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8"))}
     runs = {}
-    for path in sorted(glob.glob(os.path.join(DATA, "outputs", "*.jsonl"))):
+    for path in sorted(glob.glob(os.path.join(args.outputs, "*.jsonl"))):
         name = os.path.basename(path).removesuffix(".jsonl")
         runs[name] = {r["id"]: r for r in map(json.loads, open(path, encoding="utf-8"))}
     if not runs:
@@ -146,20 +205,22 @@
                 thresholds[d] = max(thresholds[d], r["proposed_threshold"])
 
     os.makedirs(RESULTS, exist_ok=True)
-    with open(os.path.join(RESULTS, "s7_mt.json"), "w", encoding="utf-8") as f:
+    stem = f"s7_mt-{args.label}" if args.label else "s7_mt"
+    with open(os.path.join(RESULTS, f"{stem}.json"), "w", encoding="utf-8") as f:
         json.dump({"runs": report, "comparisons": comparisons, "token_ratio_thresholds": thresholds}, f,
                   ensure_ascii=False, indent=1)
 
     lines = ["## Mốc theo lượt chạy", "",
-             "| Lượt chạy | Chiều | Số câu | COMET | Mức sàn (A3) | Tỉ lệ token lớn nhất | Ngưỡng đề xuất | Bị cắt | Nghi lẫn mẫu "
-             "| p50 thời gian (ms) |",
-             "|---|---|---|---|---|---|---|---|---|---|"]
+             "| Lượt chạy | Chiều | Số câu | COMET | Mức sàn (A3) | Tỉ lệ token lớn nhất | Ngưỡng đề xuất | Bị cắt | Lỗi "
+             "| Nghi lẫn mẫu | p50 thời gian (ms) |",
+             "|---|---|---|---|---|---|---|---|---|---|---|"]
     for name, per_dir in report.items():
         for d, r in per_dir.items():
             comet_s = f"{r['comet']:.3f}" if "comet" in r else "—"
+            ms_s = f"{r['total_ms_p50']:.0f}" if r["total_ms_p50"] is not None else "—"
             lines.append(f"| {name} | {d} | {r['n']} | {comet_s} | {floor_cell(name, d, per_dir)} | "
                          f"{r['token_ratio_max']:.2f} | {r['proposed_threshold']:.1f} | {r['length_capped']} | "
-                         f"{r['leaked']} | {r['total_ms_p50']:.0f} |")
+                         f"{r['failed']} | {r['leaked']} | {ms_s} |")
     lines += ["", "## So sánh theo cặp (cùng tập câu)", "",
               "| So sánh | Chiều | Số câu | Chênh COMET | 95% CI | Chênh p50 thời gian | Số câu dài gấp đôi |",
               "|---|---|---|---|---|---|---|"]
@@ -171,9 +232,17 @@
     lines += ["", "## Ngưỡng tỉ lệ token đề xuất cho §6.5 (từ các lượt chạy không có ngữ cảnh)", "",
               "| Chiều | Ngưỡng |", "|---|---|"]
     lines += [f"| {d} | {v:.1f} |" for d, v in sorted(thresholds.items())]
-    with open(os.path.join(RESULTS, "s7_mt.md"), "w", encoding="utf-8") as f:
+    regressed, missing = False, []
+    if args.baseline:
+        extra, regressed, missing = regression_lines(report, json.load(open(args.baseline, encoding="utf-8")))
+        lines += extra + [f"- Không so được: {m}" for m in missing]
+    with open(os.path.join(RESULTS, f"{stem}.md"), "w", encoding="utf-8") as f:
         f.write("\n".join(lines) + "\n")
     print("\n".join(lines))
+    if missing:
+        raise SystemExit("không so được với mốc: " + "; ".join(missing))
+    if regressed:
+        raise SystemExit("có chiều thấp hơn mốc quá 0,01: không commit thay đổi gây ra nó, báo chủ dự án (mục 6.7)")
 
 
 if __name__ == "__main__":
```

Tạo `bench/phase0/mt/test_score_mt.py`:

```python
"""Test của score_mt.py, phần so với mốc (Q8 của review 02b). Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase0/mt -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score_mt import regression_lines, summarize  # noqa: E402

BASE = {"runs": {"Q4_K_M-plain": {"en->vi": {"comet": 0.84}, "zh->vi": {"comet": 0.80}},
                 "Q8_0-plain": {"en->vi": {"comet": 0.85}}}}


class RegressionLines(unittest.TestCase):
    def test_every_direction_is_compared(self):
        report = {"Q4_K_M-plain": {"en->vi": {"comet": 0.835}, "zh->vi": {"comet": 0.81}}}
        lines, regressed, missing = regression_lines(report, BASE)
        self.assertEqual((regressed, missing), (False, []))
        self.assertEqual(sum(l.startswith("| Q4_K_M-plain |") for l in lines), 2)

    def test_more_than_0_01_below_the_baseline_regresses(self):
        report = {"Q4_K_M-plain": {"en->vi": {"comet": 0.829}, "zh->vi": {"comet": 0.80}}}
        _, regressed, missing = regression_lines(report, BASE)
        self.assertEqual((regressed, missing), (True, []))

    def test_a_missing_direction_cannot_pass(self):
        report = {"Q4_K_M-plain": {"en->vi": {"comet": 0.84}}}
        _, regressed, missing = regression_lines(report, BASE)
        self.assertFalse(regressed)
        self.assertEqual(missing, ["Q4_K_M-plain: thiếu chiều zh->vi"])

    def test_scores_without_comet_cannot_pass(self):
        report = {"Q4_K_M-plain": {"en->vi": {"n": 1}, "zh->vi": {"n": 1}}}
        _, _, missing = regression_lines(report, BASE)
        self.assertEqual(len(missing), 2)
        self.assertIn("không có COMET", missing[0])

    def test_no_run_with_the_baseline_name_cannot_pass(self):
        _, _, missing = regression_lines({"Q4_K_M-gd1-plain": {"en->vi": {"comet": 0.9}}}, BASE)
        self.assertEqual(len(missing), 1)
        self.assertIn("không lượt nào trùng tên", missing[0])


class Summarize(unittest.TestCase):
    def test_failed_rows_do_not_skew_the_timings_or_ratios(self):
        items = {"a": {"src": "x"}, "b": {"src": "y"}}
        rows = [{"id": "a", "hyp": "X", "src_tokens": 10, "completion_tokens": 12, "total_ms": 400.0,
                 "finish_reason": "stop"},
                {"id": "b", "hyp": "y", "src_tokens": 10, "completion_tokens": 0, "total_ms": 0.0,
                 "finish_reason": "failed"}]
        r = summarize(rows, None, items)
        self.assertEqual((r["n"], r["failed"], r["total_ms_p50"], r["token_ratio_max"]), (2, 1, 400.0, 1.2))


if __name__ == "__main__":
    unittest.main()
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
    /// Chỉ dịch N câu đầu của mỗi chiều (chạy thử). Áp trước khi lọc biến thể `context`, như `translate.py`.
    #[arg(long, default_value_t = 0)]
    limit: usize,
    /// Dịch tiếp file kết quả cũ dù điều kiện lần trước khác lần này (`<…>.meta.json`).
    #[arg(long)]
    resume_anyway: bool,
}

/// Điều kiện của một lượt chạy, ghi cạnh file kết quả.
#[derive(Serialize, Deserialize, PartialEq, Debug)]
struct Meta {
    git_head: String,
    git_dirty: bool,
    model_file: String,
    model_bytes: u64,
    /// Bản `llama-server` (N-5 của review 02 lần 2): đổi bản llama.cpp thì không dịch tiếp vào file cũ.
    llama_server: String,
    llama_server_bytes: u64,
    variant: String,
    testset_file: String,
    testset_lines: usize,
    limit: usize,
    mt_config: serde_json::Value,
}

/// `git rev-parse HEAD` và `git status --porcelain` của repo chứa công cụ. Không có git thì là "không rõ".
fn git_state() -> (String, bool) {
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };
    let head = git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "không rõ".into());
    let dirty = git(&["status", "--porcelain", "--untracked-files=no"]).is_some_and(|s| !s.is_empty());
    (head, dirty)
}

/// So điều kiện lần này với lần trước; trả các khóa khác nhau.
fn meta_diff(old: &Meta, new: &Meta) -> Vec<&'static str> {
    let mut keys = Vec::new();
    let pairs: [(&'static str, bool); 11] = [
        ("git_head", old.git_head == new.git_head),
        ("git_dirty", old.git_dirty == new.git_dirty),
        ("model_file", old.model_file == new.model_file),
        ("model_bytes", old.model_bytes == new.model_bytes),
        ("llama_server", old.llama_server == new.llama_server),
        ("llama_server_bytes", old.llama_server_bytes == new.llama_server_bytes),
        ("variant", old.variant == new.variant),
        ("testset_file", old.testset_file == new.testset_file),
        ("testset_lines", old.testset_lines == new.testset_lines),
        ("limit", old.limit == new.limit),
        ("mt_config", old.mt_config == new.mt_config),
    ];
    for (key, same) in pairs {
        if !same {
            keys.push(key);
        }
    }
    keys
}

/// Ghi `meta` cạnh file kết quả; file kết quả đã có thì `meta` phải khớp lần trước (hoặc `resume_anyway`).
fn check_meta(meta_path: &Path, out_exists: bool, meta: &Meta, resume_anyway: bool) -> Result<()> {
    if out_exists {
        let old: Option<Meta> = std::fs::read(meta_path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok());
        let diff = match &old {
            Some(old) => meta_diff(old, meta),
            None => vec!["meta.json (không có hoặc hỏng)"],
        };
        if !diff.is_empty() && !resume_anyway {
            bail!(
                "{} có kết quả của một lượt chạy khác ({}): dùng --out-dir khác, hoặc --resume-anyway nếu chắc chắn",
                meta_path.display(),
                diff.join(", ")
            );
        }
        if !diff.is_empty() {
            println!("dịch tiếp dù khác lần trước: {}", diff.join(", "));
        }
    }
    std::fs::write(meta_path, serde_json::to_vec_pretty(meta)?)?;
    Ok(())
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
    let mut lines = 0;
    let mut per_dir = std::collections::HashMap::<String, usize>::new();
    for line in reader.lines() {
        let item: Item = serde_json::from_str(&line?)?;
        lines += 1;
        // Như `translate.py`: lấy N câu đầu của mỗi chiều trước, rồi mới lọc câu có ngữ cảnh.
        let n = per_dir.entry(item.dir.clone()).or_default();
        if args.limit > 0 && *n >= args.limit {
            continue;
        }
        *n += 1;
        if args.variant == "context" && item.context.as_deref().is_none_or(str::is_empty) {
            continue;
        }
        items.push(item);
    }
    let cfg = MtConfig::default();
    let (git_head, git_dirty) = git_state();
    let meta = Meta {
        git_head,
        git_dirty,
        model_file: format!("{stem}.gguf"),
        model_bytes: std::fs::metadata(&args.model)
            .with_context(|| format!("không đọc được {}", args.model.display()))?
            .len(),
        llama_server: args.llama_server.display().to_string(),
        llama_server_bytes: std::fs::metadata(&args.llama_server)
            .with_context(|| format!("không đọc được {}", args.llama_server.display()))?
            .len(),
        variant: args.variant.clone(),
        testset_file: args
            .testset
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        testset_lines: lines,
        limit: args.limit,
        mt_config: serde_json::to_value(&cfg)?,
    };
    let meta_path = args.out_dir.join(format!("{stem}-{}.meta.json", args.variant));
    check_meta(&meta_path, out_path.exists(), &meta, args.resume_anyway)?;
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
test result: ok. 30 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.65s
```

Run: `python3 -m unittest discover -s bench/phase0/mt -p 'test_*.py'`
Expected:

```text
Ran 6 tests in 0.000s
OK
```

Run: `cargo run -q -p latency-bench -- mt-eval --help`
Expected:

```text
Dịch bộ test A3 bằng code dịch của app, để score_mt.py chấm COMET

Usage: latency-bench mt-eval [OPTIONS] --testset <TESTSET> --llama-server <LLAMA_SERVER> --model <MODEL> --out-dir <OUT_DIR>

Options:
      --testset <TESTSET>            JSONL của `build_testset.py`: mỗi dòng có id, dir, src_lang, tgt_lang, src, context
      --llama-server <LLAMA_SERVER>  
      --model <MODEL>                
      --out-dir <OUT_DIR>            Thư mục kết quả, ví dụ `bench/phase0/data/mt/outputs-gd1-mteval`. Không dùng `outputs/` (mốc của S7)
      --variant <VARIANT>            `plain`: không ngữ cảnh (cấu hình mặc định của app). `context`: cờ thử nghiệm ngữ cảnh câu trước [default: plain] [possible values: plain, context]
      --limit <LIMIT>                Chỉ dịch N câu đầu của mỗi chiều (chạy thử). Áp trước khi lọc biến thể `context`, như `translate.py` [default: 0]
      --resume-anyway                Dịch tiếp file kết quả cũ dù điều kiện lần trước khác lần này (`<…>.meta.json`)
  -h, --help                         Print help
```

- [ ] **Step 5: Chạy thử với `llama-server` thật** (bộ test A3 có sẵn ở `bench/phase0/data/mt/testset_phase0.jsonl`)

Kết quả chạy thử đặt trong `target/` (bị `.gitignore` bỏ qua).

Run:
```bash
rm -rf target/mteval-smoke && cargo run -q -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_phase0.jsonl --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server --model $PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf --out-dir target/mteval-smoke --limit 2 && wc -l target/mteval-smoke/*.jsonl && head -c 300 target/mteval-smoke/Hy-MT2-1.8B-Q4_K_M-plain.jsonl && echo && grep -E '"(git_dirty|model_file|variant|limit)"' target/mteval-smoke/Hy-MT2-1.8B-Q4_K_M-plain.meta.json
```
Expected: 2 câu mỗi chiều, 8 chiều, tiến độ, số dòng, đầu file kết quả (bản dịch tùy máy), và điều kiện của lượt chạy. `git_dirty` cho biết cây có thay đổi chưa commit: làm đúng theo thứ tự bước thì là `true`, vì code của task tới Step 7 mới commit (N8 của review 02 lần 3); Expected dưới đây lấy trên cây đã commit, nên in `false`. Các dòng khác như nhau ở cả hai cách:

```text
Hy-MT2-1.8B-Q4_K_M-plain: 16 câu, còn 16 câu phải dịch
Hy-MT2-1.8B-Q4_K_M-plain: 16/16
      16 target/mteval-smoke/Hy-MT2-1.8B-Q4_K_M-plain.jsonl
{"id":"en-vi-424","dir":"en->vi","hyp":"@user36 Cặp kính thứ hai đó thật tuyệt! Tôi rất thích mua kính… Tôi chẳng bao giờ vứt chúng đi, nhưng lại không thể tìm được những cặp kính khác nào cả?! Cặp kính của tôi hiện tại có màu cầu vồng; 
  "git_dirty": false,
  "model_file": "Hy-MT2-1.8B-Q4_K_M.gguf",
  "variant": "plain",
  "limit": 2,
```

Chạy lại đúng lệnh `mt-eval` trên (không `rm`):
```bash
cargo run -q -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_phase0.jsonl --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server --model $PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf --out-dir target/mteval-smoke --limit 2
```
Expected: không dịch lại câu nào:

```text
Hy-MT2-1.8B-Q4_K_M-plain: 16 câu, còn 0 câu phải dịch
```

Chạy lại với điều kiện khác (`--limit 3`) vào cùng thư mục:
```bash
cargo run -q -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_phase0.jsonl --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server --model $PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf --out-dir target/mteval-smoke --limit 3
```
Expected: từ chối, thoát mã 1:

```text
Error: target/mteval-smoke/Hy-MT2-1.8B-Q4_K_M-plain.meta.json có kết quả của một lượt chạy khác (limit): dùng --out-dir khác, hoặc --resume-anyway nếu chắc chắn
exit=1
```

Run:
```bash
cd bench/phase0/mt
python3 score_mt.py --no-comet --outputs ../../../target/mteval-smoke 2>&1 | tail -1
python3 score_mt.py --no-comet --outputs ../../../target/mteval-smoke --label gd1-smoke --baseline ../results/s7_mt.json 2>&1 | tail -2
ls ../results | grep gd1-smoke
rm -f ../results/*gd1-smoke*
git status --short ../results
cd ../../..
```
Expected: lệnh đầu từ chối vì thiếu `--label` hay `--write-baseline`; lệnh thứ hai ghi file có nhãn, không đụng `s7_mt.json`, nhưng thoát lỗi vì chấm `--no-comet` thì không so được với mốc (dòng cuối liệt kê từng chiều thiếu COMET); sau khi xóa hai file có nhãn, `git status` không in gì:

```text
score_mt.py: error: cần đúng một trong hai: --label <nhãn> (lượt mới) hoặc --write-baseline (ghi lại mốc S7)
- Không so được: Hy-MT2-1.8B-Q4_K_M-plain zh->vi: không có COMET (chấm bằng --no-comet?)
không so được với mốc: Hy-MT2-1.8B-Q4_K_M-plain en->vi: không có COMET (chấm bằng --no-comet?); Hy-MT2-1.8B-Q4_K_M-plain ja->vi: không có COMET (chấm bằng --no-comet?); Hy-MT2-1.8B-Q4_K_M-plain ko->vi: không có COMET (chấm bằng --no-comet?); Hy-MT2-1.8B-Q4_K_M-plain vi->en: không có COMET (chấm bằng --no-comet?); Hy-MT2-1.8B-Q4_K_M-plain vi->ja: không có COMET (chấm bằng --no-comet?); Hy-MT2-1.8B-Q4_K_M-plain vi->ko: không có COMET (chấm bằng --no-comet?); Hy-MT2-1.8B-Q4_K_M-plain vi->zh: không có COMET (chấm bằng --no-comet?); Hy-MT2-1.8B-Q4_K_M-plain zh->vi: không có COMET (chấm bằng --no-comet?)
s7_mt-gd1-smoke.json
s7_mt-gd1-smoke.md
```

Run:
```bash
python3 bench/phase0/mt/build_ratio_set.py
```
Expected: bộ câu có 1440 câu (1200 câu WMT24++ cho 12 chiều không có tiếng Việt, 240 câu ngắn):

```text
ghi 1440 câu -> bench/phase0/data/mt/testset_ratio.jsonl
WMT24++: 1200 câu ngắn: 240
[('en->ja', 112), ('en->ko', 112), ('en->vi', 12), ('en->zh', 112), ('ja->en', 112), ('ja->ko', 112), ('ja->vi', 12), ('ja->zh', 112), ('ko->en', 112), ('ko->ja', 112), ('ko->vi', 12), ('ko->zh', 112), ('vi->en', 12), ('vi->ja', 12), ('vi->ko', 12), ('vi->zh', 12), ('zh->en', 112), ('zh->ja', 112), ('zh->ko', 112), ('zh->vi', 12)]
```

Run:
```bash
rm -rf target/ratio-smoke && cargo run -q -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_ratio.jsonl --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server --model $PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf --out-dir target/ratio-smoke --limit 3 && python3 bench/phase0/mt/ratio_stats.py target/ratio-smoke/Hy-MT2-1.8B-Q4_K_M-plain.jsonl | head -12
```
Expected: tiến độ, rồi bảng có một dòng mỗi chiều (số trong bảng tùy model, chỉ là chạy thử):

```text
Hy-MT2-1.8B-Q4_K_M-plain: 60 câu, còn 60 câu phải dịch
Hy-MT2-1.8B-Q4_K_M-plain: 25/60
Hy-MT2-1.8B-Q4_K_M-plain: 50/60
Hy-MT2-1.8B-Q4_K_M-plain: 60/60
## Hy-MT2-1.8B-Q4_K_M-plain.jsonl

| chiều | câu | câu gốc ≥ 10 token | tỉ lệ lớn nhất (≥ 10) | ngưỡng đề xuất | câu gốc < 3 token | token dịch lớn nhất (< 3) | hạn mức sinh (< 3) | lỗi |
|---|---|---|---|---|---|---|---|---|
| en->ja | 3 | 3 | 1.77 | 2.3 | 0 | — | — | 0 |
| en->ko | 3 | 3 | 2.00 | 2.5 | 0 | — | — | 0 |
| en->vi | 3 | 0 | — | — | 3 | 5 | 40 | 0 |
| en->zh | 3 | 3 | 1.46 | 1.9 | 0 | — | — | 0 |
| ja->en | 3 | 3 | 1.03 | 1.3 | 0 | — | — | 0 |
| ja->ko | 3 | 3 | 1.14 | 1.5 | 0 | — | — | 0 |
| ja->vi | 3 | 0 | — | — | 0 | — | — | 0 |
| ja->zh | 3 | 3 | 0.79 | 1.0 | 0 | — | — | 0 |
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p latency-bench --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add bench/phase0/mt/build_ratio_set.py \
  bench/phase0/mt/ratio_stats.py \
  bench/phase0/mt/score_mt.py \
  bench/phase0/mt/test_score_mt.py \
  bench/phase0/mt/translate.py \
  crates/latency-bench/src/main.rs \
  crates/latency-bench/src/mt_eval.rs
git commit -m "feat(bench): latency-bench mt-eval, nhãn và so mốc cho score_mt, bộ đo tỉ lệ token (Đ4, Đ12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: `audio-capture` cho app, và kiểm toàn bộ phần crate

Phần của `audio-capture` mà app (02c) cần (dòng 84–91, 93–95, 232, 278; QĐ16, QĐ20, QĐ28, QĐ30):
- `lib.rs`: `AudioSource::failed()` (luồng thu chết), `AudioApp { pids, bundle_id, name }`, `default_output_signature()` để app biết thiết bị phát đã đổi (macOS: id kèm tần số mẫu danh định).
- `macos.rs`:
  - `default_output_device`, `nominal_sample_rate`;
  - `audio_apps`: app đang phát tiếng, chỉ đọc HAL, không cần quyền; gộp tiến trình theo gói `.app` ngoài cùng (`group_processes`, `outer_app`), tên và bundle ID đọc từ `Info.plist` của gói đó (`bundle_identity`, qua `NSBundle`; Q-F của review 02 lần 2), không có gói thì từ `NSRunningApplication` (`app_identity`, đi lên tối đa 3 tiến trình cha); tiến trình vừa thoát thì bỏ qua (Q9 của review 02b); chạy trong `autoreleasepool` (N-8); test đọc gói Calculator có sẵn, và test `#[ignore]` `print_the_playing_apps` in bảng app đang phát cho 02c Task 8;
  - `TapTarget::System` cho bước nghe thử, `TapTarget::Processes(Vec<i32>)` cho nguồn một app (thay `Process(i32)`);
  - `failed()` của tap một app: mọi tiến trình của app đã thoát (N11).
- `windows.rs` (code của kế hoạch 0-04 Task 7, đưa vào crate): `Endpoint` (mặc định theo vai trò, hoặc thiết bị chọn tay theo id), `list_render_devices`, cờ `failed` khi thiết bị bị rút, `default_endpoint_id`; `with_com` nhận luồng đã khởi tạo COM ở chế độ STA (`RPC_E_CHANGED_MODE`) mà không gọi `CoUninitialize` (N7).
- `preprocess.rs`: luồng tiền xử lý dùng chung (gộp mono, resample từng nguồn về 16 kHz, trộn hai nguồn bằng `Mixer2`), `RING_SAMPLES` (30 giây ở 48 kHz stereo), và `ClockFiller` chèn im lặng theo đồng hồ thật khi nguồn không trả mẫu (không chèn khi nguồn đang chạy; mỗi lần tối đa 2 giây; N2 của review 02b, Q5 của review 02c).
- `bin/capture.rs` dùng `Endpoint::Default` và `TapTarget::Processes`.
- `Cargo.toml` thêm `objc2-app-kit` và `libc` cho macOS.

Phần gọi API Windows chỉ kiểm được bằng clippy cho target Windows; test thật của `windows.rs` (`#[cfg(windows)]`, có một test `#[ignore]` cần thiết bị phát) chạy ở đợt Windows (02c, Task 9).

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `crates/audio-capture/Cargo.toml`
- Sửa: `crates/audio-capture/src/bin/capture.rs`
- Sửa: `crates/audio-capture/src/lib.rs`
- Sửa: `crates/audio-capture/src/macos.rs`
- Tạo: `crates/audio-capture/src/preprocess.rs`
- Tạo: `crates/audio-capture/src/windows.rs`

- [ ] **Step 1: Khai báo module và phụ thuộc**

Sửa `crates/audio-capture/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/audio-capture/Cargo.toml
+++ b/crates/audio-capture/Cargo.toml
@@ -19,9 +19,14 @@
 objc2-core-audio-types = "0.3.2"
 objc2-core-foundation = "0.3.2"
 objc2-foundation = "0.3.2"
+# Tên hiển thị của app đang phát tiếng (`NSRunningApplication.localizedName`). Cùng bản Tauri đang dùng.
+objc2-app-kit = { version = "0.3.2", default-features = false, features = ["std", "libc", "NSRunningApplication"] }
+# `proc_pidpath`, `proc_pidinfo`: gộp tiến trình helper theo gói `.app`, biết tiến trình đã thoát.
+libc = "0.2.189"
 
 [target.'cfg(windows)'.dependencies]
 windows = { version = "0.62.2", features = [
+    "Win32_Devices_FunctionDiscovery",
     "Win32_Foundation",
     "Win32_Media_Audio",
     "Win32_Media_KernelStreaming",
@@ -30,4 +35,5 @@
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
 
@@ -22,6 +25,43 @@
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
+    /// Mọi tiến trình đang phát tiếng của app, kể cả tiến trình helper cùng gói `.app` (trình duyệt, app Electron).
+    pub pids: Vec<i32>,
+    /// Bundle ID của app chính; không tìm được app chính thì là bundle ID mà Core Audio báo cho tiến trình.
+    pub bundle_id: String,
+    /// Tên hiển thị (`NSRunningApplication.localizedName`); `None` nếu không có.
+    pub name: Option<String>,
+}
+
+/// Dấu hiệu của thiết bị phát mặc định: đổi thì app khởi tạo lại việc thu trong ≤ 2 giây (§9). App hỏi định kỳ (mỗi 500 ms)
+/// thay cho listener của Core Audio và `IMMNotificationClient`: cùng kết quả, không có callback chạy trên luồng của hệ
+/// thống. `None` nếu không đọc được.
+///
+/// macOS: id của thiết bị kèm tần số mẫu danh định (`<id>@<Hz>`), vì tai nghe Bluetooth đổi tần số trên cùng thiết bị.
+pub fn default_output_signature() -> Option<String> {
+    #[cfg(target_os = "macos")]
+    return macos::default_output_device().ok().map(|id| {
+        let rate = macos::nominal_sample_rate(id).unwrap_or(0.0);
+        format!("{id}@{rate:.0}")
+    });
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
        // Nguồn tắt 1,5 giây: bù đúng phần thiếu tới "bây giờ" (1,85 giây − 0,2 giây đã có).
        assert_eq!(f.silence_before(Duration::from_millis(1_850), 0), 26_400);
        // Nguồn chạy lại: không bù hai lần.
        assert_eq!(f.silence_before(Duration::from_millis(1_950), 1_600), 0);
    }

    /// N2 của review 02b: đồng hồ thiết bị chậm 50 ppm suốt một giờ thì không chèn im lặng vào giữa tiếng nói.
    #[test]
    fn a_slow_device_clock_never_inserts_silence_while_running() {
        use std::time::Duration;
        let mut f = ClockFiller::new(200);
        let mut inserted = 0;
        // Mỗi 20 ms thật, thiết bị trả 320 mẫu trừ 50 ppm (cộng dồn bằng số thực).
        let mut owed = 0.0f64;
        for tick in 1..=180_000u64 {
            owed += 320.0 * (1.0 - 50e-6);
            let n = owed.floor() as usize;
            owed -= n as f64;
            inserted += f.silence_before(Duration::from_millis(tick * 20), n);
        }
        assert_eq!(inserted, 0);
    }

    /// Q5 của review 02c: máy ngủ một giờ thì không chèn một giờ im lặng; sau đó vẫn bù khoảng trống ngắn như thường.
    #[test]
    fn a_long_gap_resyncs_instead_of_inserting_silence() {
        use std::time::Duration;
        let mut f = ClockFiller::new(200);
        assert_eq!(f.silence_before(Duration::from_millis(1_000), 16_000), 0);
        assert_eq!(
            f.silence_before(Duration::from_secs(3_601), 0),
            0,
            "thiếu một giờ: không chèn"
        );
        assert_eq!(f.silence_before(Duration::from_millis(3_601_100), 1_600), 0);
        // Khoảng trống 2 giây ngay sau đó vẫn được bù (đúng trần 2 giây).
        assert_eq!(f.silence_before(Duration::from_millis(3_603_100), 0), 32_000);
        assert_eq!(
            f.silence_before(Duration::from_millis(3_605_200), 0),
            0,
            "2,1 giây: quá trần, đồng bộ lại"
        );
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
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0425]: cannot find function `default_output_device` in module `macos`
error[E0425]: cannot find function `nominal_sample_rate` in module `macos`
```

- [ ] **Step 4: Viết code**

Sửa `crates/audio-capture/src/bin/capture.rs` (áp bằng `git apply`):

```diff
--- a/crates/audio-capture/src/bin/capture.rs
+++ b/crates/audio-capture/src/bin/capture.rs
@@ -125,14 +125,16 @@
 #[cfg(target_os = "macos")]
 fn make_sources(args: &Args) -> Result<Vec<Source>> {
     use audio_capture::macos::{MacTapSource, TapTarget};
-    let target = args.pid.map_or(TapTarget::SystemExceptSelf, TapTarget::Process);
+    let target = args
+        .pid
+        .map_or(TapTarget::SystemExceptSelf, |pid| TapTarget::Processes(vec![pid]));
     let stats = Arc::new(CaptureStats::default());
     Ok(vec![(Box::new(MacTapSource::new(target, stats.clone())), stats)])
 }
 
 #[cfg(windows)]
 fn make_sources(args: &Args) -> Result<Vec<Source>> {
-    use audio_capture::windows::{LoopbackSource, Role, default_endpoint_id};
+    use audio_capture::windows::{Endpoint, LoopbackSource, Role, default_endpoint_id};
     let roles = match args.role.as_str() {
         "console" => vec![Role::Console],
         "communications" => vec![Role::Communications],
@@ -148,7 +150,7 @@
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
@@ -20,28 +20,35 @@
     AudioObjectGetPropertyDataSize, AudioObjectID, AudioObjectPropertyAddress, CATapDescription, CATapMuteBehavior,
     kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceIsStackedKey, kAudioAggregateDeviceNameKey,
     kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey,
-    kAudioDevicePropertyStreamConfiguration, kAudioHardwarePropertyTranslatePIDToProcessObject,
-    kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeInput,
-    kAudioObjectSystemObject, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
+    kAudioDevicePropertyNominalSampleRate, kAudioDevicePropertyStreamConfiguration,
+    kAudioHardwarePropertyDefaultOutputDevice, kAudioHardwarePropertyProcessObjectList,
+    kAudioHardwarePropertyTranslatePIDToProcessObject, kAudioObjectPropertyElementMain,
+    kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeInput, kAudioObjectSystemObject,
+    kAudioProcessPropertyBundleID, kAudioProcessPropertyIsRunningOutput, kAudioProcessPropertyPID,
+    kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
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
+use std::path::{Path, PathBuf};
 use std::ptr::NonNull;
 use std::sync::Arc;
 use std::sync::atomic::Ordering;
 
-#[derive(Clone, Copy, Debug)]
+#[derive(Clone, Debug, PartialEq, Eq)]
 pub enum TapTarget {
     /// Toàn hệ thống, trừ chính app (mặc định, spec §6.1).
     SystemExceptSelf,
-    /// Chỉ một app, theo pid.
-    Process(i32),
+    /// Toàn hệ thống, kể cả chính app: chỉ cho bước "Nghe thử" (§4.1 bước 6, Đ16 của kế hoạch 00), khi app tự phát câu mẫu.
+    System,
+    /// Chỉ một app: mọi tiến trình đang phát tiếng của app đó (`AudioApp::pids`). Trình duyệt và app Electron phát tiếng
+    /// từ tiến trình helper, nên một app thường có nhiều pid.
+    Processes(Vec<i32>),
 }
 
 type IoBlock = RcBlock<
@@ -99,22 +106,34 @@
 
 impl AudioSource for MacTapSource {
     fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
-        let processes: Vec<Retained<NSNumber>> = match self.target {
+        let processes: Vec<Retained<NSNumber>> = match &self.target {
             // App chưa từng phát âm thanh thì chưa có process object; khi đó không cần loại trừ.
             TapTarget::SystemExceptSelf => process_object(std::process::id() as i32)
                 .ok()
                 .into_iter()
                 .map(NSNumber::new_u32)
                 .collect(),
-            TapTarget::Process(pid) => vec![NSNumber::new_u32(process_object(pid)?)],
+            TapTarget::System => Vec::new(),
+            // Tiến trình vừa thoát thì bỏ qua; chỉ lỗi khi không còn tiến trình nào.
+            TapTarget::Processes(pids) => {
+                let objects: Vec<_> = pids
+                    .iter()
+                    .filter_map(|&pid| process_object(pid).ok())
+                    .map(NSNumber::new_u32)
+                    .collect();
+                if objects.is_empty() {
+                    bail!("không tiến trình nào trong {pids:?} còn phát âm thanh");
+                }
+                objects
+            }
         };
         let list = NSArray::from_retained_slice(&processes);
         let description = unsafe {
             match self.target {
-                TapTarget::SystemExceptSelf => {
+                TapTarget::SystemExceptSelf | TapTarget::System => {
                     CATapDescription::initStereoGlobalTapButExcludeProcesses(CATapDescription::alloc(), &list)
                 }
-                TapTarget::Process(_) => {
+                TapTarget::Processes(_) => {
                     CATapDescription::initStereoMixdownOfProcesses(CATapDescription::alloc(), &list)
                 }
             }
@@ -216,6 +235,24 @@
     fn format(&self) -> AudioFormat {
         self.format
     }
+
+    /// Chỉ tap một app mà mọi tiến trình của app đó đã thoát: tap không bao giờ có tiếng nữa, app phải mở lại nguồn (khi
+    /// app họp mở lại, nó có pid mới). Tap toàn hệ thống không có cách tự báo chết: đổi thiết bị phát được phát hiện qua
+    /// `default_output_signature`. Không dùng "không có khung mới trong 2 giây" làm dấu hiệu, vì aggregate đặt
+    /// `tapautostart`: không app nào phát tiếng thì IO block không được gọi, dù tap vẫn sống.
+    fn failed(&self) -> bool {
+        match &self.target {
+            TapTarget::Processes(pids) => self.aggregate_id != 0 && !pids.iter().any(|&pid| pid_alive(pid)),
+            _ => false,
+        }
+    }
+}
+
+/// Tiến trình `pid` còn tồn tại (kể cả khi không có quyền gửi tín hiệu cho nó).
+fn pid_alive(pid: i32) -> bool {
+    // SAFETY: tín hiệu 0 chỉ kiểm tiến trình có tồn tại không, không gửi gì.
+    let rc = unsafe { libc::kill(pid, 0) };
+    rc == 0 || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
 }
 
 impl Drop for MacTapSource {
@@ -365,6 +402,262 @@
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
+/// Tần số mẫu danh định của thiết bị. Tai nghe Bluetooth (AirPods) đổi tần số trên cùng thiết bị khi app họp mở micro
+/// (chuyển sang chế độ đàm thoại), nên tần số là một phần của dấu hiệu thiết bị (`default_output_signature`).
+pub fn nominal_sample_rate(device: AudioObjectID) -> Result<f64> {
+    let mut rate: f64 = 0.0;
+    get_property(
+        device,
+        kAudioDevicePropertyNominalSampleRate,
+        std::ptr::null(),
+        0,
+        &mut rate,
+    )?;
+    Ok(rate)
+}
+
+/// Một tiến trình đang phát tiếng, theo Core Audio.
+#[derive(Clone, Debug, PartialEq, Eq)]
+pub struct PlayingProcess {
+    pub pid: i32,
+    /// Bundle ID mà Core Audio báo cho tiến trình (helper có bundle ID riêng).
+    pub bundle_id: String,
+    /// Đường dẫn binary (`proc_pidpath`), nếu đọc được.
+    pub path: Option<PathBuf>,
+}
+
+/// Tên và bundle ID của một app: theo gói `.app` ngoài cùng (`Info.plist`), hoặc theo `NSRunningApplication`.
+#[derive(Clone, Debug, PartialEq, Eq)]
+pub struct AppIdentity {
+    pub name: Option<String>,
+    pub bundle_id: Option<String>,
+}
+
+/// Gói `.app` ngoài cùng chứa `path`: helper của trình duyệt và app Electron nằm trong gói của app chính (ví dụ
+/// `/Applications/Google Chrome.app/Contents/Frameworks/…/Google Chrome Helper.app/…`).
+pub fn outer_app(path: &Path) -> Option<PathBuf> {
+    let mut out = PathBuf::new();
+    for part in path.components() {
+        out.push(part);
+        if part.as_os_str().to_string_lossy().ends_with(".app") {
+            return Some(out);
+        }
+    }
+    None
+}
+
+/// Gộp các tiến trình đang phát tiếng theo gói `.app` ngoài cùng (không có gói thì theo bundle ID), rồi lấy tên và bundle
+/// ID của app: trước hết từ chính gói `.app` ngoài cùng (`bundle`), vì `NSRunningApplication` của một helper có thể trả
+/// về chính helper (ví dụ `com.google.Chrome.helper`), làm bundle ID đã lưu đổi giữa các lần (Q-F của review 02 lần 2);
+/// không có gói thì từ `running` (tìm ở tiến trình đó hoặc tối đa 3 tiến trình cha). Tách riêng khỏi Core Audio để test.
+pub fn group_processes(
+    processes: &[PlayingProcess],
+    bundle: impl Fn(&Path) -> Option<AppIdentity>,
+    running: impl Fn(i32) -> Option<AppIdentity>,
+) -> Vec<AudioApp> {
+    let mut groups: Vec<(String, Option<PathBuf>, Vec<&PlayingProcess>)> = Vec::new();
+    for p in processes {
+        let app = p.path.as_deref().and_then(outer_app);
+        let key = app
+            .as_ref()
+            .map(|a| a.to_string_lossy().into_owned())
+            .unwrap_or_else(|| p.bundle_id.clone());
+        match groups.iter_mut().find(|(k, _, _)| *k == key) {
+            Some((_, _, members)) => members.push(p),
+            None => groups.push((key, app, vec![p])),
+        }
+    }
+    let mut apps: Vec<AudioApp> = groups
+        .into_iter()
+        .map(|(_, app, members)| {
+            let found = app
+                .as_deref()
+                .and_then(&bundle)
+                .filter(|f| f.bundle_id.is_some())
+                .or_else(|| members.iter().find_map(|p| running(p.pid)));
+            let mut pids: Vec<i32> = members.iter().map(|p| p.pid).collect();
+            pids.sort_unstable();
+            AudioApp {
+                pids,
+                bundle_id: found
+                    .as_ref()
+                    .and_then(|f| f.bundle_id.clone())
+                    .unwrap_or_else(|| members[0].bundle_id.clone()),
+                name: found.and_then(|f| f.name),
+            }
+        })
+        .collect();
+    apps.sort_by(|a, b| a.bundle_id.cmp(&b.bundle_id));
+    apps
+}
+
+/// Đường dẫn binary của tiến trình `pid`.
+fn pid_path(pid: i32) -> Option<PathBuf> {
+    use std::os::unix::ffi::OsStrExt;
+    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
+    // SAFETY: `buf` có đúng `PROC_PIDPATHINFO_MAXSIZE` byte.
+    let n = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
+    (n > 0).then(|| PathBuf::from(std::ffi::OsStr::from_bytes(&buf[..n as usize])))
+}
+
+/// Tiến trình cha của `pid`.
+fn parent_pid(pid: i32) -> Option<i32> {
+    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
+    let size = size_of::<libc::proc_bsdinfo>() as libc::c_int;
+    // SAFETY: `info` đủ chỗ cho `PROC_PIDTBSDINFO`; hàm chỉ ghi vào đó.
+    let n = unsafe {
+        libc::proc_pidinfo(
+            pid,
+            libc::PROC_PIDTBSDINFO,
+            0,
+            (&mut info as *mut libc::proc_bsdinfo).cast(),
+            size,
+        )
+    };
+    (n == size && info.pbi_ppid > 1).then_some(info.pbi_ppid as i32)
+}
+
+/// Tên hiển thị và bundle ID đọc từ `Info.plist` của gói `app` (`NSBundle`; tên theo ngôn ngữ của máy nếu gói có bản
+/// dịch: `CFBundleDisplayName`, rồi `CFBundleName`, rồi tên gói bỏ đuôi `.app`).
+pub fn bundle_identity(app: &Path) -> Option<AppIdentity> {
+    use objc2_foundation::{NSBundle, NSString};
+    let bundle = NSBundle::bundleWithPath(&NSString::from_str(app.to_str()?))?;
+    let bundle_id = bundle.bundleIdentifier().map(|s| s.to_string());
+    let name = ["CFBundleDisplayName", "CFBundleName"]
+        .iter()
+        .find_map(|key| {
+            let value = bundle.objectForInfoDictionaryKey(&NSString::from_str(key))?;
+            let value = value.downcast::<NSString>().ok()?.to_string();
+            (!value.trim().is_empty()).then_some(value)
+        })
+        .or_else(|| {
+            app.file_stem()
+                .map(|s| s.to_string_lossy().into_owned())
+                .filter(|s| !s.is_empty())
+        });
+    Some(AppIdentity { name, bundle_id })
+}
+
+/// Tên hiển thị (`localizedName`) và bundle ID của app chứa `pid`: thử chính `pid`, rồi đi lên tối đa 3 tiến trình cha
+/// (helper do app chính chạy). Bỏ tên rỗng.
+pub fn app_identity(pid: i32) -> Option<AppIdentity> {
+    let mut current = Some(pid);
+    for _ in 0..4 {
+        let p = current?;
+        if let Some(app) = objc2_app_kit::NSRunningApplication::runningApplicationWithProcessIdentifier(p) {
+            let name = app
+                .localizedName()
+                .map(|s| s.to_string())
+                .filter(|s| !s.trim().is_empty());
+            if name.is_some() {
+                return Some(AppIdentity {
+                    name,
+                    bundle_id: app.bundleIdentifier().map(|s| s.to_string()),
+                });
+            }
+        }
+        current = parent_pid(p);
+    }
+    None
+}
+
+/// Các app đang phát âm thanh, cho tùy chọn "chỉ tap một app họp" (§6.1). Không cần quyền ghi âm thanh. Chạy trong một
+/// `autoreleasepool`: hàm được gọi từ luồng nền của app (không có pool riêng), và `NSBundle`, `NSRunningApplication` trả
+/// về đối tượng autorelease.
+pub fn audio_apps() -> Result<Vec<AudioApp>> {
+    objc2::rc::autoreleasepool(|_| audio_apps_inner())
+}
+
+fn audio_apps_inner() -> Result<Vec<AudioApp>> {
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
+    let mut playing = Vec::new();
+    for id in ids {
+        // Tiến trình vừa thoát giữa chừng thì bỏ qua nó, không làm hỏng cả danh sách.
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
+        if get_property(id, kAudioProcessPropertyPID, std::ptr::null(), 0, &mut pid).is_err() {
+            continue;
+        }
+        let mut bundle: *const CFString = std::ptr::null();
+        if get_property(id, kAudioProcessPropertyBundleID, std::ptr::null(), 0, &mut bundle).is_err() {
+            continue;
+        }
+        // SAFETY: Core Audio trả một CFString đã retain (+1); `CFRetained` nhận quyền sở hữu và release khi xong.
+        let bundle_id = NonNull::new(bundle.cast_mut())
+            .map(|p| unsafe { CFRetained::from_raw(p) }.to_string())
+            .unwrap_or_default();
+        if pid != std::process::id() as i32 && !bundle_id.is_empty() {
+            playing.push(PlayingProcess {
+                pid,
+                bundle_id,
+                path: pid_path(pid),
+            });
+        }
+    }
+    Ok(group_processes(&playing, bundle_identity, app_identity))
+}
+
 fn process_object(pid: i32) -> Result<AudioObjectID> {
     let mut id: AudioObjectID = 0;
     get_property(
@@ -419,6 +712,150 @@
 }
 
 #[cfg(test)]
+mod hal {
+    use super::*;
+
+    /// Đọc danh sách app và thiết bị phát của máy thật; không tạo tap nên không hỏi quyền.
+    #[test]
+    #[ignore = "đọc thiết bị âm thanh của máy thật"]
+    fn default_device_and_audio_apps_can_be_read() {
+        let device = default_output_device().unwrap();
+        assert_ne!(device, 0);
+        assert!(nominal_sample_rate(device).unwrap() > 0.0);
+        assert!(crate::default_output_signature().unwrap().contains('@'));
+        let apps = audio_apps().unwrap();
+        assert!(
+            apps.iter()
+                .all(|a| !a.pids.is_empty() && a.pids.iter().all(|&p| p > 0) && !a.bundle_id.is_empty()),
+            "{apps:?}"
+        );
+        println!("{apps:?}");
+    }
+
+    /// Tiến trình của chính test có `proc_pidpath`, cha của nó còn sống, và một pid không tồn tại thì không sống.
+    #[test]
+    fn process_helpers_read_the_running_process() {
+        let me = std::process::id() as i32;
+        assert!(pid_path(me).is_some_and(|p| p.is_absolute()));
+        assert!(pid_alive(me));
+        assert!(!pid_alive(i32::MAX - 7), "pid không tồn tại");
+        assert!(parent_pid(me).is_none_or(|p| p > 1));
+    }
+}
+
+#[cfg(test)]
+mod grouping {
+    use super::*;
+
+    fn proc(pid: i32, bundle_id: &str, path: &str) -> PlayingProcess {
+        PlayingProcess {
+            pid,
+            bundle_id: bundle_id.into(),
+            path: Some(PathBuf::from(path)),
+        }
+    }
+
+    /// Tên và bundle ID đọc từ `Info.plist` của một gói `.app` có sẵn trên mọi máy macOS. Chỉ đọc file, không cần quyền.
+    #[test]
+    fn a_bundle_names_its_app() {
+        let id = bundle_identity(Path::new("/System/Applications/Calculator.app")).unwrap();
+        assert_eq!(id.bundle_id.as_deref(), Some("com.apple.calculator"));
+        assert!(id.name.is_some_and(|n| !n.is_empty()));
+        assert_eq!(bundle_identity(Path::new("/khong/co.app")), None);
+    }
+
+    /// Bảng các app đang phát tiếng của máy này, để người thử ở 02c Task 8 so với app thật (tên, bundle ID, pid). Đọc
+    /// thuộc tính của Core Audio HAL, không cần quyền; bỏ qua mặc định vì kết quả tùy máy.
+    #[test]
+    #[ignore = "in bảng app đang phát tiếng của máy này"]
+    fn print_the_playing_apps() {
+        for app in audio_apps().unwrap() {
+            println!("{:?}\t{}\t{:?}", app.name, app.bundle_id, app.pids);
+        }
+    }
+
+    #[test]
+    fn the_outer_app_bundle_is_found() {
+        let chrome = "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/\
+                      Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)";
+        assert_eq!(
+            outer_app(Path::new(chrome)),
+            Some(PathBuf::from("/Applications/Google Chrome.app"))
+        );
+        assert_eq!(outer_app(Path::new("/usr/libexec/coreaudiod")), None);
+    }
+
+    /// Q9 của review 02b: các tiến trình helper gộp vào app chính; tên lấy từ `NSRunningApplication`, đi lên tiến trình
+    /// cha khi helper không có tên.
+    #[test]
+    fn helper_processes_are_grouped_under_their_app() {
+        let processes = [
+            proc(
+                300,
+                "com.google.Chrome.helper",
+                "/Applications/Google Chrome.app/Contents/Frameworks/x.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/h",
+            ),
+            proc(200, "us.zoom.xos", "/Applications/zoom.us.app/Contents/MacOS/zoom.us"),
+            proc(
+                301,
+                "com.google.Chrome.helper",
+                "/Applications/Google Chrome.app/Contents/Frameworks/x.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/h",
+            ),
+            PlayingProcess {
+                pid: 400,
+                bundle_id: "com.example.tool".into(),
+                path: None,
+            },
+        ];
+        // Gói `.app` ngoài cùng cho tên và bundle ID của app chính, kể cả khi `NSRunningApplication` của helper trả về
+        // chính helper (Q-F của review 02 lần 2).
+        let bundle = |app: &Path| match app.to_str()? {
+            "/Applications/Google Chrome.app" => Some(AppIdentity {
+                name: Some("Google Chrome".into()),
+                bundle_id: Some("com.google.Chrome".into()),
+            }),
+            // Gói đọc không được bundle ID: dùng `NSRunningApplication`.
+            _ => Some(AppIdentity {
+                name: None,
+                bundle_id: None,
+            }),
+        };
+        let running = |pid: i32| match pid {
+            300 | 301 => Some(AppIdentity {
+                name: Some("Google Chrome Helper".into()),
+                bundle_id: Some("com.google.Chrome.helper".into()),
+            }),
+            200 => Some(AppIdentity {
+                name: Some("zoom.us".into()),
+                bundle_id: Some("us.zoom.xos".into()),
+            }),
+            _ => None,
+        };
+        let apps = group_processes(&processes, bundle, running);
+        assert_eq!(
+            apps,
+            [
+                AudioApp {
+                    pids: vec![400],
+                    bundle_id: "com.example.tool".into(),
+                    name: None
+                },
+                AudioApp {
+                    pids: vec![300, 301],
+                    bundle_id: "com.google.Chrome".into(),
+                    name: Some("Google Chrome".into())
+                },
+                AudioApp {
+                    pids: vec![200],
+                    bundle_id: "us.zoom.xos".into(),
+                    name: Some("zoom.us".into())
+                },
+            ]
+        );
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
/// thời gian của phụ đề không lệch, và "không có âm thanh" (§9) vẫn được phát hiện.
///
/// - Chỉ chèn khi nguồn không trả mẫu nào (`new_samples == 0`). Khi nguồn đang chạy, phần thiếu so với đồng hồ thật chỉ là
///   đồng hồ thiết bị lệch vài chục ppm: không chèn im lặng vào giữa tiếng nói, chỉ kéo mốc về đồng hồ thật.
/// - Mỗi lần chèn tối đa `max_fill_ms` (2 giây). Thiếu nhiều hơn (máy ngủ, tiến trình bị treo lâu) thì chỉ đồng bộ lại
///   mốc, không chèn: tránh đẩy hàng giờ im lặng (hàng GB mẫu) vào pipeline.
#[derive(Debug)]
pub struct ClockFiller {
    produced: u64,
    tolerance: u64,
    max_fill: u64,
}

impl ClockFiller {
    /// `tolerance_ms`: thiếu dưới mức này thì coi là trễ của bộ đệm, không chèn. Mỗi lần chèn tối đa 2 giây.
    pub fn new(tolerance_ms: u64) -> Self {
        Self::with_max_fill(tolerance_ms, 2_000)
    }

    pub fn with_max_fill(tolerance_ms: u64, max_fill_ms: u64) -> Self {
        Self {
            produced: 0,
            tolerance: tolerance_ms * TARGET_RATE as u64 / 1000,
            max_fill: max_fill_ms * TARGET_RATE as u64 / 1000,
        }
    }

    /// `elapsed`: thời gian thật từ lúc bắt đầu; `new_samples`: số mẫu nguồn vừa trả. Trả số mẫu im lặng cần chèn trước
    /// các mẫu đó.
    pub fn silence_before(&mut self, elapsed: std::time::Duration, new_samples: usize) -> usize {
        let expected = (elapsed.as_micros() as u64) * TARGET_RATE as u64 / 1_000_000;
        if new_samples > 0 {
            // Nguồn đang chạy: không chèn. Đồng hồ thiết bị chậm hơn đồng hồ thật thì kéo mốc về, để phần thiếu không
            // cộng dồn rồi bị chèn một lần vào giữa câu.
            self.produced = (self.produced + new_samples as u64).max(expected.saturating_sub(self.tolerance));
            return 0;
        }
        let deficit = expected.saturating_sub(self.produced);
        if deficit <= self.tolerance {
            return 0;
        }
        if deficit > self.max_fill {
            log_resync(deficit);
            self.produced = expected;
            return 0;
        }
        self.produced = expected;
        deficit as usize
    }
}

fn log_resync(deficit: u64) {
    eprintln!(
        "audio-capture: nguồn im {} giây (máy ngủ?), đồng bộ lại đồng hồ, không chèn im lặng",
        deficit / TARGET_RATE as u64
    );
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
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
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

/// Chạy `f` với COM ở chế độ MTA trên luồng hiện tại. Luồng đã khởi tạo COM ở chế độ STA (`RPC_E_CHANGED_MODE`, ví dụ
/// luồng giao diện) vẫn dùng được các API ở đây; khi đó không gọi `CoUninitialize`, vì lần khởi tạo đó không phải của hàm
/// này.
fn with_com<T>(f: impl FnOnce() -> Result<T>) -> Result<T> {
    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let owned = if hr == RPC_E_CHANGED_MODE {
        false
    } else {
        hr.ok()?;
        true
    };
    let result = f();
    if owned {
        unsafe { CoUninitialize() };
    }
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

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p audio-capture`
Expected:

```text
test result: ok. 34 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.07s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.76s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Test bỏ qua của macOS chỉ đọc thuộc tính của Core Audio HAL (thiết bị phát mặc định, tần số mẫu, danh sách tiến trình phát tiếng) và `NSRunningApplication`, không tạo tap nên không bật hộp thoại quyền. Danh sách app in ra tùy app đang phát tiếng trên máy (lúc lập kế hoạch: không app nào):

Run: `cargo test -p audio-capture --lib -- --include-ignored default_device_and_audio_apps --nocapture`
Expected:

```text
test macos::hal::default_device_and_audio_apps_can_be_read ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 35 filtered out; finished in 0.05s
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
Expected: không có cảnh báo; `cargo fmt` không in gì; dòng cuối của lệnh thứ hai:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 5.85s
```

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
passed 443 failed 0 ignored 10
```

- [ ] **Step 8: Commit**

```bash
git add Cargo.lock \
  crates/audio-capture/Cargo.toml \
  crates/audio-capture/src/bin/capture.rs \
  crates/audio-capture/src/lib.rs \
  crates/audio-capture/src/macos.rs \
  crates/audio-capture/src/preprocess.rs \
  crates/audio-capture/src/windows.rs
git commit -m "feat(audio-capture): nguồn âm thanh cho app: chọn thiết bị, danh sách app, tiền xử lý dùng chung" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Đo `no_speech_prob` với nhạc, nhận luật câu đệm, đo tỉ lệ token (Đ12)

Không đổi code. Ghi kết quả đo vào `bench/phase0/results/` (dòng 115, 149, 279; QĐ22, QĐ24). Không đo thời gian, nên không cần máy rảnh; `llama-server` và `asr-worker` vẫn dùng GPU, nên đừng chạy cùng lúc với Task 7–9. Cần mạng (tải bộ nhạc thử từ Wikimedia Commons) và `uv`.

Mọi file tạm (nhạc tải về, kết quả thô) nằm trong `target/q11/` (bị `.gitignore` bỏ qua). Chỉ hai bảng kết quả vào repo; không commit audio.

**Files:**
- Create: `bench/phase0/results/gd1_no_speech.md` (script sinh ra)
- Create: `bench/phase0/results/gd1_mt_ratio.md` (script sinh ra)

- [ ] **Step 1: Bản release của `asr-worker`**

Run: `cargo build --release -p asr-worker --features metal,shared-encode`
Expected: dòng cuối `Finished \`release\` profile [optimized] target(s) in …`.

- [ ] **Step 2: Tải và chuẩn bị bộ nhạc thử**

Mười file nhạc không lời trên Wikimedia Commons, chỉ CC0 hoặc public domain (giấy phép đọc từ API của Commons lúc lập kế hoạch, ghi lại trong `gd1_no_speech.md`). Script kiểm SHA-1 của từng file theo Commons, đổi sang WAV 16 kHz mono 16-bit, giữ 80 giây đầu (`no_speech.rs` cắt mỗi file thành tối đa 10 đoạn 8 giây).

Run:
```bash
mkdir -p target/q11
cat > target/q11/music.json <<'EOF'
[
 {"name": "ambient-ck61", "title": "Ambient music test, Yamaha CK61.flac", "license": "CC0", "sha1": "fbe9e5fbe4b727fac1608dec68c94a956d9cbd65", "url": "https://upload.wikimedia.org/wikipedia/commons/4/49/Ambient_music_test%2C_Yamaha_CK61.flac"},
 {"name": "dvorak-largo", "title": "Antonin Dvorak - symphony no. 9 in e minor 'from the new world', op. 95 - ii. largo.ogg", "license": "Public domain", "sha1": "88f4ba157183fc1f1f27fcbb8ffe10c1691d9824", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c3/Antonin_Dvorak_-_symphony_no._9_in_e_minor_%27from_the_new_world%27%2C_op._95_-_ii._largo.ogg"},
 {"name": "vivaldi-rv425", "title": "Antonio Vivaldi, Mandolin Concerto in C major, RV 425.ogg", "license": "PDM-owner", "sha1": "b1f16456f9d3b4ff033ae7a03b5b18bbc5c51dcb", "url": "https://upload.wikimedia.org/wikipedia/commons/6/60/Antonio_Vivaldi%2C_Mandolin_Concerto_in_C_major%2C_RV_425.ogg"},
 {"name": "bach-aria", "title": "Bach, Goldberg Variations, Aria (Musopen version).ogg", "license": "CC0", "sha1": "a1c48089f8b54f056ab0aa69abe7fd119e95405a", "url": "https://upload.wikimedia.org/wikipedia/commons/a/af/Bach%2C_Goldberg_Variations%2C_Aria_%28Musopen_version%29.ogg"},
 {"name": "komiku-46", "title": "Komiku - 46 - Merfolk Music Box.ogg", "license": "CC0", "sha1": "4255a73e5f4c7a3cb2af1ce8b6a2e103a2ec5963", "url": "https://upload.wikimedia.org/wikipedia/commons/6/69/Komiku_-_46_-_Merfolk_Music_Box.ogg"},
 {"name": "lofi-001", "title": "Lofi music 001.wav", "license": "CC0", "sha1": "d62e1a98d6cd493a2e2842ad957f86cfab5b953c", "url": "https://upload.wikimedia.org/wikipedia/commons/f/f5/Lofi_music_001.wav"},
 {"name": "lfm-01", "title": "Loyalty Freak Music - 01 - Monster Parade.ogg", "license": "CC0", "sha1": "2aacb39b71644acbc699a8a44488d31f7625089e", "url": "https://upload.wikimedia.org/wikipedia/commons/1/1b/Loyalty_Freak_Music_-_01_-_Monster_Parade.ogg"},
 {"name": "lfm-08", "title": "Loyalty Freak Music - 08 - Beach.ogg", "license": "CC0", "sha1": "7d949c5d7fdc5d170dd2af9dfd1ea5df3e87549b", "url": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Loyalty_Freak_Music_-_08_-_Beach.ogg"},
 {"name": "lfm-13", "title": "Loyalty Freak Music - 13 - Work.ogg", "license": "CC0", "sha1": "ae13e092e39d7d1f90a3404d13ecd115af085264", "url": "https://upload.wikimedia.org/wikipedia/commons/b/bb/Loyalty_Freak_Music_-_13_-_Work.ogg"},
 {"name": "techno-001", "title": "Techno music 001.wav", "license": "CC0", "sha1": "0eb3c9bb6323418a1657a7dedd476d795bc16673", "url": "https://upload.wikimedia.org/wikipedia/commons/4/4d/Techno_music_001.wav"}
]
EOF
uv run --no-project --python 3.12 --with av==19.0.0 --with numpy==2.5.3 python - <<'EOF'
"""Tải bộ nhạc thử, kiểm SHA-1, đổi sang WAV 16 kHz mono 16-bit, giữ 80 giây đầu."""
import hashlib, json, os, time, urllib.error, urllib.request, wave
import av
import numpy as np
OUT = "target/q11"
for m in json.load(open(f"{OUT}/music.json", encoding="utf-8")):
    os.makedirs(f"{OUT}/orig", exist_ok=True)  # bản gốc để riêng: Step 3 đọc mọi *.wav trong target/q11
    raw = f"{OUT}/orig/{m['name']}{os.path.splitext(m['url'])[1]}"
    if not os.path.exists(raw):
        req = urllib.request.Request(m["url"], headers={"User-Agent": "Mozilla/5.0"})
        for attempt in range(6):
            try:
                data = urllib.request.urlopen(req).read()
                break
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    raise
                time.sleep(20 * (attempt + 1))  # Commons giới hạn tần suất tải
        assert hashlib.sha1(data).hexdigest() == m["sha1"], m["title"]
        open(raw, "wb").write(data)
        time.sleep(5)
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks = []
    for frame in av.open(raw).decode(audio=0):
        chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(frame)]
    chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(None)]
    pcm = np.concatenate(chunks)[: 80 * 16000].astype(np.int16)
    with wave.open(f"{OUT}/{m['name']}.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm.tobytes())
    print(m["name"], f"{len(pcm) / 16000:.1f} giây", m["license"])
EOF
```
Expected: mười dòng, chín file đủ 80 giây (file `komiku-46` ngắn hơn):

```text
ambient-ck61 80.0 giây CC0
dvorak-largo 80.0 giây Public domain
vivaldi-rv425 80.0 giây PDM-owner
bach-aria 80.0 giây CC0
komiku-46 63.5 giây CC0
lofi-001 80.0 giây CC0
lfm-01 80.0 giây CC0
lfm-08 80.0 giây CC0
lfm-13 80.0 giây CC0
techno-001 80.0 giây CC0
```

- [ ] **Step 3: `no_speech_prob` trên tín hiệu tổng hợp và nhạc, qua `asr-worker` thật**

Run:
```bash
WAVS=$(ls $PWD/target/q11/*.wav | tr '\n' ',' | sed 's/,$//')
for m in large-v3-turbo-q5_0 small-q5_1; do
  MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-$m.bin \
  MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx NO_SPEECH_WAVS=$WAVS \
    cargo test -q -p pipeline --test no_speech -- --include-ignored --nocapture | grep '^{' > target/q11/$m.jsonl
  tail -1 target/q11/$m.jsonl
done
```
Expected: mỗi model 112 đoạn (14 tín hiệu tổng hợp, 98 đoạn nhạc) và không đoạn nào hiện thành phụ đề:

```text
{"segments":112,"shown_as_subtitle":0,"shown":[]}
{"segments":112,"shown_as_subtitle":0,"shown":[]}
```

- [ ] **Step 4: Điều kiện nhận luật mới trên A4 và S6** (Q11 của review 02b; QĐ24)

Run: `cargo test -p latency-bench phase1_ -- --include-ignored --nocapture`
Expected: hai test qua. Trên A4, luật mới không bỏ thêm clip nào trong 548 clip của mỗi model (small vẫn chỉ có 1 clip `NoSpeech` của Giai đoạn 0); trên S6, test kiểm luật câu đệm chỉ bỏ đúng 2 đoạn đã biết là chữ sai (xem `phase1_filler_rule_drops_only_known_hallucinations_on_s6`):

```text
turbo: 548 clip, bị bỏ {}, tỉ lệ nén lớn nhất 1.54
small: 548 clip, bị bỏ {"NoSpeech": ["en-9810650684898829002_nb"]}, tỉ lệ nén lớn nhất 1.54
test latency::tests::phase1_rules_drop_no_a4_clip ... ok
test latency::tests::phase1_filler_rule_drops_only_known_hallucinations_on_s6 ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 29 filtered out; finished in 0.32s
```

- [ ] **Step 5: Ghi `gd1_no_speech.md`**

Run:
```bash
python3 - <<'EOF'
import json
from collections import Counter
music = json.load(open("target/q11/music.json", encoding="utf-8"))
out = [
    "# no_speech_prob và luật lọc trên âm thanh không có tiếng nói (Đ12, Q11 của review 02b)", "",
    "Sinh từ `crates/pipeline/tests/no_speech.rs` (kế hoạch Giai đoạn 1 · 02b, Task 6): 14 tín hiệu tổng hợp và mười file nhạc",
    "không lời (mỗi file tối đa 10 đoạn 8 giây), qua Silero VAD của app và `asr-worker` thật, rồi luật lọc của app",
    "(`filter::verdict`). \"Hiện thành phụ đề\" nghĩa là VAD cắt ra ít nhất một đoạn và luật lọc giữ chữ.", "",
    "## Kết luận", ""]
for m in ("large-v3-turbo-q5_0", "small-q5_1"):
    rows = [json.loads(l) for l in open(f"target/q11/{m}.jsonl", encoding="utf-8")]
    sig = [r for r in rows if "signal" in r]
    total = [r for r in rows if "shown_as_subtitle" in r][0]
    cut = [r for r in sig if r["vad_segments"]]
    verdicts = Counter(r["verdict"] for r in cut)
    out.append(f"- {m}: {len(sig)} đoạn; VAD cắt ra đoạn ở {len(cut)} đoạn ({dict(verdicts)}); "
               f"hiện thành phụ đề: {total['shown_as_subtitle']}.")
    thanks = [r["avg_logprob"] for r in sig if r["text"].strip() == "Thank you."]
    if thanks:
        out.append(f"  Chữ bịa \"Thank you.\" ở {len(thanks)} đoạn, `avg_logprob` từ {min(thanks):.2f} tới {max(thanks):.2f}"
                   " (cả đoạn 8 giây gửi nguyên cho worker): chỉ số này không đủ để nhận ra chữ bịa.")
out += ["- Không có VAD (cột \"Luật lọc\" của các dòng VAD = 0) thì turbo bịa chữ cho hầu hết tín hiệu, vì `no_speech_prob`",
        "  của turbo luôn cỡ 1e-10; Silero VAD của app là lớp chặn chính, luật câu đệm và nhãn có ngoặc chặn phần lọt qua.", "",
        "## Điều kiện nhận luật mới (QĐ24)", "",
        "- A4 (`out-m4pro-{turbo,small}-final.jsonl`, 548 clip mỗi model): luật câu đệm và luật chuỗi lặp không bỏ clip nào;",
        "  tỉ lệ nén lớn nhất của chữ thật là 1,54 ở cả hai model, dưới ngưỡng 2,4. Luật `no_speech` của Giai đoạn 0 vẫn bỏ",
        "  đúng một clip của small (`en-9810650684898829002_nb`, chữ bịa) như trước. Test",
        "  `phase1_rules_drop_no_a4_clip`.",
        "- S6 (12 lượt cấu hình chốt, 528 đoạn): luật câu đệm bỏ thêm 2 đoạn của gói Chuẩn, cả hai có chữ sai: đoạn 26 của `en`",
        "  (32 ms ngay sau một câu, chép thành \"Thank you.\") và đoạn 45 của `vi` (đuôi câu \"… ở Las Cañitas.\", chép thành",
        "  \"Cảm ơn\"). Bản chép đúng ở hai chỗ đó không có \"Thank you\" hay \"Cảm ơn\". Test",
        "  `phase1_filler_rule_drops_only_known_hallucinations_on_s6`.", "",
        "## Kiểm chéo turbo bằng công cụ khác (lúc lập kế hoạch)", "",
        "faster-whisper 1.2.1 (CTranslate2 4.8.2, CPU, int8, `beam_size=1`, `temperature=0`, không VAD, không lọc), model",
        "`large-v3-turbo`, cùng ba tín hiệu của `no_speech.rs` (im lặng, ù điện 50 Hz −26 dBFS, gõ phím −30 dBFS; 3 và 8 giây):",
        "`no_speech_prob` từ 3,6e-11 tới 1,5e-10, chữ \"Thank you.\" hoặc \"you\", có hay không khóa ngôn ngữ. Model `small` qua",
        "cùng công cụ: 0,68 tới 0,92. Vậy `no_speech_prob` cỡ 1e-10 là tính chất của turbo, không phải lỗi đọc của chế độ B.",
        "Script đối chiếu (faster-whisper trong một venv riêng) nằm ngoài repo, theo quyết định Q11(1) của controller: chỉ",
        "commit bảng kết quả; các thông số ở trên đủ để chạy lại.", "",
        "## Bộ nhạc thử", "",
        "Wikimedia Commons, giấy phép đọc từ API của Commons (`extmetadata.LicenseShortName`) ngày 2026-10-01. Không lưu audio",
        "trong repo; tải lại bằng 02b Task 6, Step 2.", "",
        "| Tên | File trên Commons | Giấy phép |", "|---|---|---|"]
out += [f"| {m['name']} | [{m['title']}](https://commons.wikimedia.org/wiki/File:{m['url'].rsplit('/', 1)[1]}) | {m['license']} |"
        for m in music]
for m in ("large-v3-turbo-q5_0", "small-q5_1"):
    rows = [json.loads(l) for l in open(f"target/q11/{m}.jsonl", encoding="utf-8")]
    out += ["", f"## {m} ({rows[0].get('backend', '?')})", "",
            "| Tín hiệu | VAD cắt ra | Xác suất VAD | no_speech_prob | avg_logprob | Tỉ lệ nén | Luật lọc | Chữ |",
            "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if "signal" in r:
            vp = f"{r['vad_mean_prob']:.2f}" if r["vad_mean_prob"] is not None else "—"
            text = r["text"][:40].replace("|", "\\|").replace("\n", " ")
            out.append(f"| {r['signal']} | {r['vad_segments']} | {vp} | {r['no_speech_prob']:.2g} | {r['avg_logprob']:.2f} "
                       f"| {r['compression_ratio']:.2f} | {r['verdict']} | {text} |")
open("bench/phase0/results/gd1_no_speech.md", "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out[:16]))
EOF
```
Expected: phần đầu của file (phần còn lại là hai bảng 112 dòng):

```text
# no_speech_prob và luật lọc trên âm thanh không có tiếng nói (Đ12, Q11 của review 02b)

Sinh từ `crates/pipeline/tests/no_speech.rs` (kế hoạch Giai đoạn 1 · 02b, Task 6): 14 tín hiệu tổng hợp và mười file nhạc
không lời (mỗi file tối đa 10 đoạn 8 giây), qua Silero VAD của app và `asr-worker` thật, rồi luật lọc của app
(`filter::verdict`). "Hiện thành phụ đề" nghĩa là VAD cắt ra ít nhất một đoạn và luật lọc giữ chữ.

## Kết luận

- large-v3-turbo-q5_0: 112 đoạn; VAD cắt ra đoạn ở 3 đoạn ({'Hallucination': 3}); hiện thành phụ đề: 0.
  Chữ bịa "Thank you." ở 4 đoạn, `avg_logprob` từ -0.68 tới -0.48 (cả đoạn 8 giây gửi nguyên cho worker): chỉ số này không đủ để nhận ra chữ bịa.
- small-q5_1: 112 đoạn; VAD cắt ra đoạn ở 3 đoạn ({'Filler': 2, 'NoSpeech': 1}); hiện thành phụ đề: 0.
- Không có VAD (cột "Luật lọc" của các dòng VAD = 0) thì turbo bịa chữ cho hầu hết tín hiệu, vì `no_speech_prob`
  của turbo luôn cỡ 1e-10; Silero VAD của app là lớp chặn chính, luật câu đệm và nhãn có ngoặc chặn phần lọt qua.

## Điều kiện nhận luật mới (QĐ24)
```

Kiểm số tỉ lệ nén lớn nhất của A4 ghi trong file khớp dòng in ra ở Step 4. Có đoạn nhạc hiện thành phụ đề thì ghi vào đầu file chữ bịa ra là gì, đề xuất thêm câu vào `DEFAULT_FILLER_PHRASES` hay ngưỡng mới để chủ dự án quyết; không tự sửa luật lọc.

- [ ] **Step 6: Tỉ lệ token cho cặp không có tiếng Việt và câu gốc rất ngắn**

Run (khoảng 1440 câu mỗi model):
```bash
python3 bench/phase0/mt/build_ratio_set.py
for m in Q8_0 Q4_K_M; do
  cargo run -q --release -p latency-bench -- mt-eval --testset bench/phase0/data/mt/testset_ratio.jsonl \
    --llama-server $PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
    --model $PWD/models/Hy-MT2-1.8B-$m.gguf --out-dir bench/phase0/data/mt/outputs-gd1-ratio | tail -1
done
python3 bench/phase0/mt/ratio_stats.py bench/phase0/data/mt/outputs-gd1-ratio/Hy-MT2-1.8B-Q8_0-plain.jsonl \
  bench/phase0/data/mt/outputs-gd1-ratio/Hy-MT2-1.8B-Q4_K_M-plain.jsonl --out bench/phase0/results/gd1_mt_ratio.md
```
Expected: hai bảng, mỗi bảng 20 dòng (12 chiều không có tiếng Việt, 8 chiều có tiếng Việt chỉ gồm câu ngắn). Cột "lỗi" là số câu dịch lỗi cả hai lần (`failed`): với cặp chưa có ngưỡng thì chỉ có thể do rỗng, xuống dòng kiểu lời giải thích, hay chạm hạn mức sinh. Lúc lập kế hoạch:

```text
ghi 1440 câu -> bench/phase0/data/mt/testset_ratio.jsonl
WMT24++: 1200 câu ngắn: 240
[('en->ja', 112), ('en->ko', 112), ('en->vi', 12), ('en->zh', 112), ('ja->en', 112), ('ja->ko', 112), ('ja->vi', 12), ('ja->zh', 112), ('ko->en', 112), ('ko->ja', 112), ('ko->vi', 12), ('ko->zh', 112), ('vi->en', 12), ('vi->ja', 12), ('vi->ko', 12), ('vi->zh', 12), ('zh->en', 112), ('zh->ja', 112), ('zh->ko', 112), ('zh->vi', 12)]
Hy-MT2-1.8B-Q8_0-plain: 1440/1440
Hy-MT2-1.8B-Q4_K_M-plain: 1440/1440
## Hy-MT2-1.8B-Q8_0-plain.jsonl

| chiều | câu | câu gốc ≥ 10 token | tỉ lệ lớn nhất (≥ 10) | ngưỡng đề xuất | câu gốc < 3 token | token dịch lớn nhất (< 3) | hạn mức sinh (< 3) | lỗi |
|---|---|---|---|---|---|---|---|---|
| en->ja | 112 | 75 | 2.61 | 3.3 | 9 | 10 | 40 | 0 |
| en->ko | 112 | 75 | 2.50 | 3.2 | 9 | 9 | 40 | 0 |
| en->vi | 12 | 0 | — | — | 9 | 8 | 40 | 0 |
| en->zh | 112 | 75 | 1.54 | 2.0 | 9 | 3 | 40 | 0 |
| ja->en | 112 | 89 | 1.33 | 1.7 | 0 | — | — | 0 |
| ja->ko | 112 | 89 | 2.17 | 2.8 | 0 | — | — | 0 |
| ja->vi | 12 | 0 | — | — | 0 | — | — | 0 |
| ja->zh | 112 | 89 | 1.17 | 1.5 | 0 | — | — | 1 |
| ko->en | 112 | 94 | 1.46 | 1.9 | 2 | 3 | 40 | 1 |
| ko->ja | 112 | 94 | 1.60 | 2.0 | 2 | 4 | 40 | 0 |
| ko->vi | 12 | 0 | — | — | 2 | 5 | 40 | 0 |
| ko->zh | 112 | 93 | 1.00 | 1.3 | 2 | 3 | 40 | 1 |
| vi->en | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ja | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ko | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->zh | 12 | 0 | — | — | 0 | — | — | 0 |
| zh->en | 112 | 76 | 2.15 | 2.7 | 9 | 4 | 40 | 0 |
| zh->ja | 112 | 76 | 2.88 | 3.6 | 9 | 10 | 40 | 0 |
| zh->ko | 112 | 76 | 2.92 | 3.7 | 9 | 7 | 40 | 0 |
| zh->vi | 12 | 0 | — | — | 9 | 6 | 40 | 0 |

## Hy-MT2-1.8B-Q4_K_M-plain.jsonl

| chiều | câu | câu gốc ≥ 10 token | tỉ lệ lớn nhất (≥ 10) | ngưỡng đề xuất | câu gốc < 3 token | token dịch lớn nhất (< 3) | hạn mức sinh (< 3) | lỗi |
|---|---|---|---|---|---|---|---|---|
| en->ja | 112 | 75 | 2.22 | 2.8 | 9 | 7 | 40 | 0 |
| en->ko | 112 | 75 | 2.31 | 2.9 | 9 | 9 | 40 | 0 |
| en->vi | 12 | 0 | — | — | 9 | 8 | 40 | 0 |
| en->zh | 112 | 75 | 1.46 | 1.9 | 9 | 3 | 40 | 0 |
| ja->en | 112 | 89 | 1.33 | 1.7 | 0 | — | — | 0 |
| ja->ko | 112 | 89 | 1.85 | 2.4 | 0 | — | — | 0 |
| ja->vi | 12 | 0 | — | — | 0 | — | — | 0 |
| ja->zh | 112 | 89 | 1.11 | 1.4 | 0 | — | — | 0 |
| ko->en | 112 | 93 | 1.17 | 1.5 | 2 | 4 | 40 | 1 |
| ko->ja | 112 | 94 | 1.47 | 1.9 | 2 | 4 | 40 | 0 |
| ko->vi | 12 | 0 | — | — | 2 | 5 | 40 | 0 |
| ko->zh | 112 | 94 | 0.93 | 1.2 | 2 | 3 | 40 | 0 |
| vi->en | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ja | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ko | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->zh | 12 | 0 | — | — | 0 | — | — | 0 |
| zh->en | 112 | 76 | 2.08 | 2.6 | 9 | 4 | 40 | 0 |
| zh->ja | 112 | 75 | 3.00 | 3.8 | 9 | 7 | 40 | 1 |
| zh->ko | 112 | 76 | 2.92 | 3.7 | 9 | 7 | 40 | 0 |
| zh->vi | 12 | 0 | — | — | 9 | 6 | 40 | 0 |
```

Thêm vào cuối `gd1_mt_ratio.md` một đoạn đề xuất:
- ngưỡng cho 12 chiều mới, lấy số lớn hơn của hai model ở cột "ngưỡng đề xuất";
- câu gốc dưới 3 token: hạn mức sinh `4 × số token + 32` có đủ không (so cột "token dịch lớn nhất" với cột "hạn mức sinh").

Ngưỡng chỉ vào `DEFAULT_RATIO_THRESHOLDS` (`crates/pipeline/src/config.rs`) sau khi được duyệt (điểm cần quyết 4). **Đã quyết** (controller, 2026-10-02): ngưỡng của 12 chiều theo mục "Đề xuất" đã vào `DEFAULT_RATIO_THRESHOLDS` ở `22fa4fe`; câu gốc dưới 3 token giữ hạn mức `4 × số token + 32`.

**Đo lại sau `22fa4fe`.** `mt-eval` dịch bằng `MtConfig::default()`, nên từ `22fa4fe` bản dịch của cả 12 chiều này bị cắt ở ngưỡng mặc định: cột "tỉ lệ lớn nhất" không vượt được ngưỡng; câu vượt ngưỡng bị dịch lại, hai lần đều vượt thì thành lỗi. Muốn đo tỉ lệ khách quan thì chạy với danh sách ngưỡng rỗng (`ratio_thresholds` trống); `mt-eval` chưa có cờ cho việc này, nên phải sửa tạm `MtConfig` trong `mt_eval.rs` hoặc thêm cờ.

- [ ] **Step 7: Commit**

```bash
git add bench/phase0/results/gd1_no_speech.md bench/phase0/results/gd1_mt_ratio.md
git commit -m "test(bench): no_speech_prob với nhạc CC0, điều kiện nhận luật câu đệm, tỉ lệ token cho cặp không có tiếng Việt (Đ12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: Chạy lại A3 bằng code dịch của app (cần máy rảnh)

Mục 6.7 của kế hoạch 00: 02d và Task 2 của file này đổi hậu xử lý, tham số sinh và cách gọi `llama-server` (prompt không đổi), nên chạy lại A3. Lần đầu dịch bằng `mt-eval` (Đ4) thay cho `translate.py`, nên đây cũng là mốc mới đầu tiên của A3 qua đúng code của app.

**Cần người thao tác (Step 1).** Lâu: dịch 4 lượt (khoảng 15 phút trên M4 Pro theo kế hoạch 0-02), chấm COMET khoảng 5 phút. Chạy trên cây đã commit hết (`git status` sạch), vì `mt-eval` ghi git HEAD và cờ có thay đổi vào `<…>.meta.json`.

**Files:**
- Create: `bench/phase0/results/s7_mt-gd1-mteval.json`, `bench/phase0/results/s7_mt-gd1-mteval.md` (script sinh ra)

- [ ] **Step 1: Chuẩn bị máy rảnh** (mục 6.9 của kế hoạch 00; dùng chung cho Task 7–9)

Nhờ người: đóng Docker Desktop, Chrome, Safari; tắt server của `stock_app` đang nghe cổng 8000; cắm sạc. Chờ người xác nhận, rồi kiểm:

```bash
pgrep -l -f 'Docker Desktop|Google Chrome|Safari' || echo "không còn app nặng"
lsof -nP -iTCP:8000 -sTCP:LISTEN || echo "cổng 8000 trống"
pmset -g batt | head -1
sysctl vm.swapusage
git status --short | wc -l
```
Expected: `không còn app nặng`, `cổng 8000 trống`, `Now drawing from 'AC Power'`, swap gần trống (`used` dưới vài trăm MB), và `0` (cây sạch). Chép các dòng này vào cuối file kết quả của task (Step 4). Còn app nặng hay đang chạy pin thì dừng, báo người.

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
Expected: lượt `plain` của mỗi model in `Hy-MT2-1.8B-<model>-plain: 620 câu, còn 620 câu phải dịch` (lượt `context` ít câu hơn, chỉ câu có ngữ cảnh), tiến độ mỗi 25 câu, và kết thúc không lỗi. Bị ngắt giữa chừng thì chạy lại đúng lệnh: `mt-eval` dịch tiếp nếu điều kiện không đổi. `mt-eval` từ chối dịch tiếp (điều kiện khác lần trước, ví dụ đã có commit mới) thì xóa `bench/phase0/data/mt/outputs-gd1-mteval` và chạy lại từ đầu; chỉ dùng `--resume-anyway` khi chắc chắn thay đổi không liên quan tới dịch.

- [ ] **Step 3: Chấm COMET và so với mốc S7**

Run:
```bash
uv run --no-project --python 3.12 --with "unbabel-comet==2.2.7" --with "numpy<2" \
  --with "transformers<5" --with "setuptools<82" python bench/phase0/mt/score_mt.py \
  --outputs bench/phase0/data/mt/outputs-gd1-mteval --label gd1-mteval --baseline bench/phase0/results/s7_mt.json
```
Expected:
- Ba bảng như kế hoạch 0-02 Task 6, cột "Mức sàn (A3)" ghi `đạt`, cột "Lỗi" là số câu `failed` của từng chiều.
- Bảng cuối "So với mốc (chống thụt lùi A3)" có đủ 32 dòng (4 lượt × 8 chiều; lượt `context` chỉ các chiều mốc có), mọi dòng `đạt` (không chiều nào thấp hơn mốc quá 0,01), không có dòng "Không so được", và lệnh thoát mã 0.
- Lệnh thoát với thông báo `có chiều thấp hơn mốc quá 0,01` thì không làm tiếp phần dịch; báo chủ dự án kèm bảng (mục 6.7). Chủ dự án quyết: sửa hậu xử lý, hay duyệt mốc mới. Thoát với `không so được với mốc` thì xem lượt hay chiều nào thiếu, chạy bù rồi chấm lại.

- [ ] **Step 4: Ghi trạng thái máy và commit**

Thêm vào cuối `bench/phase0/results/s7_mt-gd1-mteval.md` một mục "Máy lúc chạy" với các dòng của Step 1 và commit của code (`git rev-parse --short HEAD`, khớp `git_head` trong các `meta.json`).

```bash
git add bench/phase0/results/s7_mt-gd1-mteval.json bench/phase0/results/s7_mt-gd1-mteval.md
git commit -m "test(bench): A3 dịch bằng code của app (mt-eval), so với mốc S7" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Chạy lại A4 và lượt fullctx (cần máy rảnh)

Mục 6.7 của kế hoạch 00 và C12: 02a Task 1 đổi giao thức, cách giữ ngôn ngữ trước và bản vá whisper.cpp. Chạy lại A4 cho cả hai model, cùng lượt cửa sổ 30 giây đầy đủ (`--full-ctx`) trên cùng bản build, để kiểm giả định 8 (§14).

**Cần người thao tác:** máy rảnh như Task 7, Step 1 (kiểm lại các lệnh nếu đã nghỉ giữa hai task). Lâu: 4 lượt × 548 clip.

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
def rel(new, base):
    # Mốc bằng 0: chỉ đạt khi lượt này cũng bằng 0 (không chia cho 0).
    if base == 0:
        return 0.0 if new == 0 else float("inf")
    return (new - base) / base * 100
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
        d = rel(n, b)
        ok = d <= 10 + 1e-9
        bad |= not ok
        lines.append(f"| {m} | {k} | {metric.upper()} | {b:.3f} | {n:.3f} | {d:+.1f}% | {'đạt' if ok else 'THỤT LÙI'} |")
lines += ["", "## Giả định 8: (mặc định − fullctx) / fullctx ≤ 10%, cùng bản build", "",
          "| Model | Nhóm | Mặc định | fullctx | Chênh | Kết luận |", "|---|---|---|---|---|---|"]
for m in ("turbo", "small"):
    d, f = load(f"{m}-gd1-prevlang"), load(f"{m}-gd1-fullctx")
    for k in sorted(d):
        if not k.endswith("-wb"):
            continue
        metric = "cer" if "cer" in d[k] else "wer"
        a, b = d[k][metric], f[k][metric]
        r = rel(a, b)
        lines.append(f"| {m} | {k} | {a:.3f} | {b:.3f} | {r:+.1f}% | {'đạt' if r <= 10 else 'quá 10%'} |")
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

Thêm mục "Máy lúc chạy" (các dòng như Task 7, Step 1) và commit của code vào cuối `gd1_a4.md`.

```bash
git add bench/phase0/results/a4_m4pro-turbo-gd1-prevlang.json bench/phase0/results/a4_m4pro-small-gd1-prevlang.json \
  bench/phase0/results/a4_m4pro-turbo-gd1-fullctx.json bench/phase0/results/a4_m4pro-small-gd1-fullctx.json \
  bench/phase0/results/gd1_a4.md
git commit -m "test(bench): A4 và lượt fullctx sau giao thức bản 2 (C12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: Chạy lại S6 (cần máy rảnh)

Mục 6.7 của kế hoạch 00: 02a, 02d và Task 1–5 của file này đổi giao thức, lọc đoạn, phồn thể sang giản thể và hậu xử lý, có thể làm chậm pipeline. `latency-bench latency` dùng đúng luật của `pipeline` (Đ3), nên đo lại S6 như kế hoạch 0-06 Task 7. Nhãn của lượt này là `m4pro-gd1-s6` (N5 của review 02b).

**Cần người thao tác:** máy rảnh như Task 7, Step 1. Không chạy gì khác trong lúc đo. Lâu: 12 session, mỗi gói khoảng 20 phút (kế hoạch 0-06 Task 7).

**Files:**
- Create: `bench/phase0/results/latency/m4pro-gd1-s6-khuyennghi-{chuan,nhe}-{en,ja,ko,mixed,vi,zh}.json` (script sinh ra)
- Create: `bench/phase0/results/gd1_s6.md`

- [ ] **Step 1: Kiểm máy rảnh lần nữa** (các lệnh của Task 7, Step 1). Expected như ở đó. Giữ output để chép vào Step 4.

- [ ] **Step 2: Đo**

Run:
```bash
cargo build --release -p latency-bench
cargo build --release -p asr-worker --features metal,shared-encode
python3 bench/phase0/latency/run_matrix.py --machine m4pro-gd1-s6 --tier khuyennghi --package chuan
python3 bench/phase0/latency/run_matrix.py --machine m4pro-gd1-s6 --tier khuyennghi --package nhe
```
Expected: 12 file `m4pro-gd1-s6-khuyennghi-*.json`. Script dừng trước một session nếu còn `llama-server` hay `asr-worker` sót lại (báo pid): kill pid đó rồi chạy lại.

- [ ] **Step 3: So với lượt cấu hình chốt, ghi `gd1_s6.md`**

Run:
```bash
python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json \
  bench/phase0/results/latency/m4pro-gd1-s6-khuyennghi-*.json > target/gd1_s6_table.md
python3 - <<'EOF'
import json
R = "bench/phase0/results/latency"
lines = ["# S6 sau phần crate của kế hoạch 02 (nhãn `m4pro-gd1-s6`)", "",
         "## Chênh với lượt cấu hình chốt (`m4pro-chot`)", "",
         "| Gói | Session | p50 chốt | p50 lượt này | Chênh | p90 chốt | p90 lượt này | Chênh | Kết luận |",
         "|---|---|---|---|---|---|---|---|---|"]
bad = False
for pkg in ("chuan", "nhe"):
    for s in ("en", "ja", "ko", "mixed", "vi", "zh"):
        old = json.load(open(f"{R}/m4pro-chot-khuyennghi-{pkg}-{s}.json"))["summary"]
        new = json.load(open(f"{R}/m4pro-gd1-s6-khuyennghi-{pkg}-{s}.json"))["summary"]
        cells, ok = [], True
        for key in ("shown_p50_ms", "shown_p90_ms"):
            a, b = old.get(key), new.get(key)
            if not a or b is None:
                cells += ["—", "—", "—"]
                ok = False
                continue
            d = (b - a) / a * 100
            ok &= d <= 10
            cells += [f"{a:.0f}", f"{b:.0f}", f"{d:+.0f}%"]
        bad |= not ok
        lines.append(f"| {pkg} | {s} | " + " | ".join(cells) + f" | {'đạt' if ok else 'CHẬM HƠN QUÁ 10%'} |")
lines += ["", "## Bảng của `summarize.py`", "", open("target/gd1_s6_table.md", encoding="utf-8").read().rstrip(), "",
          "## Máy lúc chạy", "", "(chép output của Task 9, Step 1 và `git rev-parse --short HEAD` vào đây)"]
open("bench/phase0/results/gd1_s6.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines[:18]))
raise SystemExit(1 if bad else 0)
EOF
```
Expected:
- Bảng chênh: mọi dòng `đạt` (p50 và p90 của lượt này không cao hơn lượt `chot` quá 10%). Lượt `chot` (kế hoạch 0-06 Task 7): p50 lớn nhất 1028 ms (Chuẩn), 844 ms (Nhẹ); p90 lớn nhất 1341 ms, 1142 ms.
- Trong bảng của `summarize.py`: cột A2 ghi `đạt` ở cả 24 dòng. Số đoạn bỏ qua có thể thêm lý do `filler` ở gói Chuẩn (QĐ24: trên dữ liệu S6 cũ, luật câu đệm bỏ 2 đoạn có chữ sai), `hallucination` và `repetition` thường là 0.
- Có dòng `KHÔNG ĐẠT`, `KHÔNG KẾT LUẬN`, hay `CHẬM HƠN QUÁ 10%` (lệnh thoát mã 1): không đi tiếp; báo chủ dự án kèm bảng và trạng thái máy.

- [ ] **Step 4: Ghi trạng thái máy và commit**

Thay dòng giữ chỗ ở mục "Máy lúc chạy" của `gd1_s6.md` bằng output của Step 1 và commit của code.

```bash
git add bench/phase0/results/latency/m4pro-gd1-s6-khuyennghi-*.json bench/phase0/results/gd1_s6.md
git commit -m "test(bench): S6 sau phần crate của kế hoạch 02 trên Mac M4 Pro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Phần crate của kế hoạch 02 xong ở đây. Đi tiếp `docs/superpowers/plans/2026-10-01-giai-doan-1-02c-pipeline-app.md`; Task 2 của kế hoạch 00 (cập nhật bảng đối chiếu) làm một lần ở cuối 02c cho cả ba file.
