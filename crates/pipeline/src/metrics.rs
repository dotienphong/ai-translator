//! Số đo của một phiên (spec §7): thời gian từng bước, lưu trên máy, không gửi đi đâu. Bảng debug ẩn (kế hoạch 03) đọc
//! bản tóm tắt này; khi phiên dừng, bản tóm tắt được ghi vào log (Đ17 của kế hoạch 00). Không có chữ chép lời nào ở đây.

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
    /// Chế độ dịch trong lúc nói (spec 2026-10-10 §4–§5): số lần chép từng phần có kết quả, thời gian mỗi lần (`asr_ms` của
    /// worker), các vòng cập nhật đã xong (từ lúc tạo yêu cầu chép từng phần tới lúc bản dịch tạm xong), nhịp T sau mỗi vòng,
    /// và việc chế độ đã tự tắt. Không có chữ nào.
    pub partials: usize,
    pub partial_asr_ms: Vec<f32>,
    pub live_cycle_ms: Vec<f32>,
    pub cadence_ms: Vec<f32>,
    pub streaming_auto_off: bool,
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
        let mut out = format!(
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
        );
        if self.partials > 0 {
            out.push_str(&format!(
                "; {} lần chép từng phần;{}{}{}",
                self.partials,
                stat("chép từng phần", &self.partial_asr_ms),
                stat("vòng cập nhật", &self.live_cycle_ms),
                stat("nhịp", &self.cadence_ms)
            ));
            if self.streaming_auto_off {
                out.push_str(" đã tự tắt");
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentiles_interpolate() {
        assert_eq!(percentile(&[], 50.0), None);
        assert_eq!(percentile(&[3.0, 1.0, 2.0], 50.0), Some(2.0));
        assert_eq!(percentile(&[0.0, 400.0], 90.0), Some(360.0));
    }

    /// Chế độ dịch trong lúc nói (spec 2026-10-10 §5): chỉ ghi khi có lần chép từng phần, và chỉ có số.
    #[test]
    fn the_summary_reports_the_live_mode_only_when_it_ran() {
        let m = SessionMetrics {
            partials: 12,
            partial_asr_ms: vec![200.0, 220.0],
            live_cycle_ms: vec![500.0, 700.0],
            cadence_ms: vec![1_000.0],
            streaming_auto_off: true,
            ..Default::default()
        };
        assert!(
            m.summary().ends_with(
                "; 12 lần chép từng phần; chép từng phần p50 210 ms, p90 218 ms; vòng cập nhật p50 600 ms, p90 680 ms; \
                 nhịp p50 1000 ms, p90 1000 ms; đã tự tắt"
            ),
            "{}",
            m.summary()
        );
        assert!(!SessionMetrics::default().summary().contains("chép từng phần"));
        // Một lần đã đủ để nhắc; chưa tự tắt thì không ghi "đã tự tắt".
        let one = SessionMetrics {
            partials: 1,
            ..Default::default()
        }
        .summary();
        assert!(one.ends_with("; 1 lần chép từng phần;"), "{one}");
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
