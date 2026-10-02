//! Bảng debug ẩn (spec §7, "Số đo từng phiên"; Đ17 của kế hoạch 00): số đo của vài phiên gần nhất trong lần chạy này của
//! app, chỉ trong bộ nhớ, không gửi đi đâu. Bản tóm tắt của mỗi phiên cũng nằm trong log (`session.rs`). Không có chữ chép
//! lời nào ở đây.

use std::collections::VecDeque;
use std::sync::Mutex;

use pipeline::metrics::{SessionMetrics, percentile};
use serde::Serialize;

/// Số phiên giữ lại.
pub const KEEP_SESSIONS: usize = 10;

/// p50 và p90 của một bước, ms.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Stage {
    pub name: &'static str,
    pub count: usize,
    pub p50: Option<f32>,
    pub p90: Option<f32>,
}

/// Số đo của một phiên đã dừng.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSession {
    pub session: u64,
    /// Giờ Unix (ms) lúc phiên dừng.
    pub ended_at: u64,
    /// Một dòng như trong log.
    pub summary: String,
    pub segments: usize,
    pub filtered: usize,
    pub dropped: usize,
    pub translated: usize,
    pub failed: usize,
    pub skipped: usize,
    pub same_lang: usize,
    pub merges: usize,
    pub translated_speech_ms: u64,
    /// Cắt đoạn, nhận dạng, dịch, tổng thể.
    pub stages: Vec<Stage>,
}

impl DebugSession {
    pub fn new(session: u64, ended_at: u64, m: &SessionMetrics) -> Self {
        let stage = |name, v: &[f32]| Stage {
            name,
            count: v.len(),
            p50: percentile(v, 50.0),
            p90: percentile(v, 90.0),
        };
        Self {
            session,
            ended_at,
            summary: m.summary(),
            segments: m.segments,
            filtered: m.filtered,
            dropped: m.dropped,
            translated: m.translated,
            failed: m.failed,
            skipped: m.skipped,
            same_lang: m.same_lang,
            merges: m.merges,
            translated_speech_ms: m.translated_speech_ms,
            stages: vec![
                stage("vad", &m.vad_ms),
                stage("asr", &m.asr_ms),
                stage("mt", &m.mt_ms),
                stage("total", &m.latency_ms),
            ],
        }
    }
}

/// Các phiên gần nhất, mới nhất trước. Quản lý bằng `app.manage`.
#[derive(Default)]
pub struct DebugLog(Mutex<VecDeque<DebugSession>>);

impl DebugLog {
    pub fn record(&self, entry: DebugSession) {
        let mut log = self.0.lock().unwrap_or_else(|e| e.into_inner());
        log.push_front(entry);
        log.truncate(KEEP_SESSIONS);
    }

    pub fn sessions(&self) -> Vec<DebugSession> {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_last_ten_sessions_newest_first_with_stage_percentiles() {
        let log = DebugLog::default();
        for n in 1..=12 {
            let m = SessionMetrics {
                segments: n as usize,
                asr_ms: vec![100.0, 300.0],
                ..Default::default()
            };
            log.record(DebugSession::new(n, n * 1_000, &m));
        }
        let sessions = log.sessions();
        assert_eq!(sessions.len(), KEEP_SESSIONS);
        assert_eq!((sessions[0].session, sessions[9].session), (12, 3));
        let asr = &sessions[0].stages[1];
        assert_eq!(
            (asr.name, asr.count, asr.p50, asr.p90),
            ("asr", 2, Some(200.0), Some(280.0))
        );
        assert_eq!(sessions[0].stages[0].p50, None, "bước không có số đo");
        assert!(sessions[0].summary.starts_with("12 đoạn"));
    }
}
