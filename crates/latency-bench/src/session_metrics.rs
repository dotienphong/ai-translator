//! Chỉ số của `latency-bench session` (spec 2026-10-10 §10.1; H7, H9 của kế hoạch 00), tính từ các sự kiện mà engine gửi
//! cho giao diện (`Timed`) và mốc thật của từng câu (`*.truth.json`). Toàn hàm thuần, test bằng sự kiện tổng hợp; việc
//! dựng lại giao diện thấy gì nằm ở `session_replay`.
//!
//! - **Thời điểm nói của từ:** chia đều `start_ms`–`end_ms` của câu trong truth cho các đơn vị của bản chép cuối của câu
//!   (các phần có mốc cuối nằm trong câu, `pieces_of`). Đơn vị thứ i (từ 0) được nói xong lúc
//!   `start_ms + (i + 1) × (end_ms − start_ms) / n`, như nghiên cứu (`stream_sim.py`).
//! - **Chế độ thường** (không có dòng đang nói): tầng tạm của một từ là lần đầu một phụ đề phủ tới từ đó có chữ dịch
//!   (`Replay::first_text_ms`); tầng ổn định là lúc phụ đề phủ tới từ đó chốt (`done`, không còn `provisional`) và không
//!   bị thay sau đó (`Replay::settled_ms`).
//! - **A2** tính như `latency`: ghép câu với phần có mốc cuối gần nhất (trong 1 giây), đo từ `end_ms` của câu tới lúc
//!   bản dịch của phiên bản có phần đó hiện đủ (`a2_*`) và hiện chữ đầu tiên (`a2_first_*`). LID nhầm sang ngôn ngữ đích
//!   (`same_lang` mà câu thật là tiếng khác) thì không tính, và các từ của câu đó coi như chưa được dịch.

use crate::session_replay::{Piece, Replay};
use crate::stats::{Utterance, match_segments, percentile};
use pipeline::engine::Indicators;
use pipeline::subtitle::{Delta, Status, Subtitle};
use serde::Serialize;

/// Cửa sổ ghép câu thật với phần có mốc cuối gần nhất, như `latency` (A2).
const MATCH_WINDOW_MS: u64 = 1_000;
/// Phần có mốc cuối trong `[start_ms, max(end_ms, vad_end_ms) + PIECE_TAIL_MS]` của một câu thì thuộc câu đó. Khoảng lặng
/// giữa hai câu của S6 từ 416 ms trở lên, nên 300 ms không lấn sang câu sau.
const PIECE_TAIL_MS: u64 = 300;

/// Một sự kiện engine gửi cho giao diện, đúng như `EventSink` nhận (H9). Kế hoạch 02 thêm `Live`, `LiveEnd`. Trong file
/// JSON, mỗi sự kiện là một object có `t_ms`, `kind` và các trường của sự kiện.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Recorded {
    /// `subtitle://upsert`.
    Subtitle(Subtitle),
    /// `subtitle://delta`.
    Delta(Delta),
    /// Chỉ báo của thanh phụ đề (`app://status`).
    Indicators(Indicators),
}

/// Sự kiện kèm thời điểm, ms từ lúc bắt đầu phát WAV (giờ thật).
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Timed {
    pub t_ms: f64,
    #[serde(flatten)]
    pub ev: Recorded,
}

/// Các khóa `summary` của H7: ms làm tròn 0,1, tỉ lệ làm tròn 4 chữ số, không có số thì `None` (JSON `null`).
/// `summarize` điền các khóa tính từ truth và sự kiện; `session::run` điền các khóa của lượt chạy (`segments`,
/// `busy_ratio`, `cpu_percent`, `partials`; kế hoạch 02 thêm `cadence_p50_ms`, `streaming_auto_off`).
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Summary {
    pub a2_p50_ms: Option<f64>,
    pub a2_p90_ms: Option<f64>,
    pub a2_first_p50_ms: Option<f64>,
    pub first_from_start_p50_ms: Option<f64>,
    pub first_from_start_p90_ms: Option<f64>,
    pub word_lag_tentative_p50_ms: Option<f64>,
    pub word_lag_tentative_p90_ms: Option<f64>,
    pub word_lag_stable_p50_ms: Option<f64>,
    pub word_lag_stable_p90_ms: Option<f64>,
    pub stable_flicker_ratio: Option<f64>,
    pub tentative_erasure_ratio: Option<f64>,
    pub busy_ratio: Option<f64>,
    pub cpu_percent: Option<f64>,
    pub utterances: Option<f64>,
    pub segments: Option<f64>,
    pub partials: Option<f64>,
    pub cadence_p50_ms: Option<f64>,
    pub streaming_auto_off: Option<f64>,
}

/// Kết quả của một câu trong truth (khóa `utterances` của file JSON).
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct UtteranceResult {
    pub id: String,
    pub lang: String,
    pub start_ms: u64,
    pub end_ms: u64,
    /// Số đơn vị của bản chép cuối của câu.
    pub units: usize,
    pub a2_shown_ms: Option<f64>,
    pub a2_first_ms: Option<f64>,
    pub first_from_start_ms: Option<f64>,
    pub word_lag_tentative_ms: Vec<f64>,
    pub word_lag_stable_ms: Vec<f64>,
    pub lid_to_target: bool,
}

/// Làm tròn tới 0,1 ms.
pub fn ms(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

/// Làm tròn tỉ lệ tới 4 chữ số thập phân.
pub fn ratio4(v: f64) -> f64 {
    (v * 1e4).round() / 1e4
}

/// Các phần thuộc câu `u`, theo thứ tự thời gian.
fn pieces_of<'a>(u: &Utterance, pieces: &'a [Piece]) -> Vec<&'a Piece> {
    let last = u.vad_end_ms.unwrap_or(u.end_ms).max(u.end_ms) + PIECE_TAIL_MS;
    let mut mine: Vec<&Piece> = pieces
        .iter()
        .filter(|p| (u.start_ms..=last).contains(&p.end_ms))
        .collect();
    mine.sort_by_key(|p| p.end_ms);
    mine
}

/// Kết quả của từng câu trong truth.
pub fn evaluate(truth: &[Utterance], events: &[Timed]) -> Vec<UtteranceResult> {
    evaluate_replay(truth, &Replay::new(events))
}

fn evaluate_replay(truth: &[Utterance], replay: &Replay) -> Vec<UtteranceResult> {
    let ends: Vec<u64> = replay.pieces.iter().map(|p| p.end_ms).collect();
    let matched = match_segments(truth, &ends, MATCH_WINDOW_MS);
    truth
        .iter()
        .zip(matched)
        .map(|(u, m)| {
            let mine = pieces_of(u, &replay.pieces);
            // `same_lang` nghĩa là LID chọn đúng ngôn ngữ đích; câu thật là tiếng khác thì chỉ hiện câu gốc sai ngôn ngữ.
            let wrong_lang = |p: &Piece| {
                replay.final_status(p) == Some(Status::SameLang) && replay.final_lang(p) != Some(u.lang.as_str())
            };
            let n: usize = mine.iter().map(|p| p.units).sum();
            let span = u.end_ms.saturating_sub(u.start_ms) as f64;
            let mut out = UtteranceResult {
                id: u.id.clone(),
                lang: u.lang.clone(),
                start_ms: u.start_ms,
                end_ms: u.end_ms,
                units: n,
                ..UtteranceResult::default()
            };
            let mut i = 0usize;
            for p in &mine {
                let tentative = replay.first_text_ms(p).filter(|_| !wrong_lang(p));
                let stable = replay.settled_ms(p).filter(|_| !wrong_lang(p));
                for _ in 0..p.units {
                    let spoken = u.start_ms as f64 + (i + 1) as f64 * span / n as f64;
                    if let Some(t) = tentative {
                        out.word_lag_tentative_ms.push(ms(t - spoken));
                    }
                    if let Some(t) = stable {
                        out.word_lag_stable_ms.push(ms(t - spoken));
                    }
                    i += 1;
                }
            }
            out.first_from_start_ms = mine
                .iter()
                .filter(|p| !wrong_lang(p))
                .filter_map(|p| replay.first_text_ms(p))
                .min_by(f64::total_cmp)
                .map(|t| ms(t - u.start_ms as f64));
            if let Some(p) = m.map(|i| &replay.pieces[i]) {
                out.lid_to_target = wrong_lang(p);
                if !out.lid_to_target {
                    out.a2_shown_ms = replay.done_ms(p).map(|t| ms(t - u.end_ms as f64));
                    out.a2_first_ms = replay.first_text_ms(p).map(|t| ms(t - u.end_ms as f64));
                }
            }
            out
        })
        .collect()
}

/// Các khóa `summary` tính được từ truth và sự kiện (H9). Khóa của lượt chạy để `None`; `session::run` điền.
pub fn summarize(truth: &[Utterance], events: &[Timed]) -> Summary {
    let replay = Replay::new(events);
    let utterances = evaluate_replay(truth, &replay);
    let col = |f: fn(&UtteranceResult) -> Option<f64>| -> Vec<f32> {
        utterances.iter().filter_map(f).map(|v| v as f32).collect()
    };
    let words = |f: fn(&UtteranceResult) -> &Vec<f64>| -> Vec<f32> {
        utterances.iter().flat_map(|u| f(u).iter().map(|&v| v as f32)).collect()
    };
    let (shown, first, from_start) = (
        col(|u| u.a2_shown_ms),
        col(|u| u.a2_first_ms),
        col(|u| u.first_from_start_ms),
    );
    let (tentative, stable) = (words(|u| &u.word_lag_tentative_ms), words(|u| &u.word_lag_stable_ms));
    let pct = |v: &[f32], p: f32| percentile(v, p).map(|x| ms(f64::from(x)));
    let final_units = replay.final_translated_units();
    let ratio = |n: usize| (final_units > 0).then(|| ratio4(n as f64 / final_units as f64));
    Summary {
        a2_p50_ms: pct(&shown, 50.0),
        a2_p90_ms: pct(&shown, 90.0),
        a2_first_p50_ms: pct(&first, 50.0),
        first_from_start_p50_ms: pct(&from_start, 50.0),
        first_from_start_p90_ms: pct(&from_start, 90.0),
        word_lag_tentative_p50_ms: pct(&tentative, 50.0),
        word_lag_tentative_p90_ms: pct(&tentative, 90.0),
        word_lag_stable_p50_ms: pct(&stable, 50.0),
        word_lag_stable_p90_ms: pct(&stable, 90.0),
        stable_flicker_ratio: ratio(replay.changed_stable_units()),
        tentative_erasure_ratio: ratio(replay.retracted_units()),
        utterances: Some(truth.len() as f64),
        ..Summary::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_replay::tests::{merged_sentence, upsert};

    fn utt(id: &str, lang: &str, start_ms: u64, end_ms: u64, vad_end_ms: Option<u64>) -> Utterance {
        Utterance {
            id: id.into(),
            lang: lang.into(),
            start_ms,
            end_ms,
            vad_end_ms,
            text: String::new(),
        }
    }

    /// Câu tiếng Anh 1 000–5 000 ms, chép thành hai phần ("so we went" tới 2 500, "home." tới 5 050), xem
    /// `merged_sentence`. Bốn từ được nói xong lúc 2 000, 3 000, 4 000, 5 000 ms.
    #[test]
    fn word_lags_follow_the_pieces_of_a_merged_sentence() {
        let u = &evaluate(&[utt("a", "en", 1_000, 5_000, Some(5_050))], &merged_sentence(true))[0];
        assert_eq!(u.units, 4);
        // Ba từ đầu có chữ dịch lúc 2 700, từ cuối lúc bản mới thay vào (5 600).
        assert_eq!(u.word_lag_tentative_ms, [700.0, -300.0, -1_300.0, 600.0]);
        // Tầng ổn định: câu chốt hẳn lúc 5 700.
        assert_eq!(u.word_lag_stable_ms, [3_700.0, 2_700.0, 1_700.0, 700.0]);
        assert_eq!(u.first_from_start_ms, Some(1_700.0));
        // A2: phần gần mốc cuối câu nhất là phần thứ hai (5 050).
        assert_eq!((u.a2_shown_ms, u.a2_first_ms), (Some(700.0), Some(600.0)));
        assert!(!u.lid_to_target);
    }

    #[test]
    fn same_language_sentences_count_but_a_lid_error_into_the_target_does_not() {
        let mut vi = upsert(3_000.0, 1, 2_000, "Xin chào", "", Status::SameLang, false);
        let mut wrong = upsert(5_600.0, 2, 5_000, "Hello there", "", Status::SameLang, false);
        for e in [&mut vi, &mut wrong] {
            if let Recorded::Subtitle(s) = &mut e.ev {
                s.src_lang = "vi".into();
            }
        }
        let truth = [utt("vi", "vi", 0, 2_000, None), utt("en", "en", 4_000, 5_000, None)];
        let all = evaluate(&truth, &[vi, wrong]);
        assert_eq!((all[0].a2_shown_ms, all[0].a2_first_ms), (Some(1_000.0), Some(1_000.0)));
        assert_eq!(all[0].word_lag_tentative_ms, [2_000.0, 1_000.0]);
        assert_eq!(all[0].word_lag_stable_ms, [2_000.0, 1_000.0]);
        assert!(all[1].lid_to_target);
        assert_eq!((all[1].a2_shown_ms, all[1].first_from_start_ms), (None, None));
        assert_eq!(all[1].units, 2);
        assert!(
            all[1].word_lag_tentative_ms.is_empty(),
            "câu gốc sai ngôn ngữ không phải bản dịch"
        );
    }

    #[test]
    fn an_utterance_without_any_piece_has_no_numbers() {
        let u = &evaluate(&[utt("x", "en", 20_000, 25_000, None)], &merged_sentence(true))[0];
        assert_eq!((u.units, u.a2_shown_ms, u.first_from_start_ms), (0, None, None));
        assert!(u.word_lag_tentative_ms.is_empty());
    }

    #[test]
    fn the_summary_has_the_keys_of_h7() {
        let s = summarize(&[utt("a", "en", 1_000, 5_000, Some(5_050))], &merged_sentence(true));
        assert_eq!(
            (s.a2_p50_ms, s.a2_p90_ms, s.a2_first_p50_ms),
            (Some(700.0), Some(700.0), Some(600.0))
        );
        assert_eq!(
            (s.first_from_start_p50_ms, s.first_from_start_p90_ms),
            (Some(1_700.0), Some(1_700.0))
        );
        // Tạm: −1 300, −300, 600, 700. Ổn định: 700, 1 700, 2 700, 3 700.
        assert_eq!(
            (s.word_lag_tentative_p50_ms, s.word_lag_tentative_p90_ms),
            (Some(150.0), Some(670.0))
        );
        assert_eq!(
            (s.word_lag_stable_p50_ms, s.word_lag_stable_p90_ms),
            (Some(2_200.0), Some(3_400.0))
        );
        assert_eq!(
            (s.stable_flicker_ratio, s.tentative_erasure_ratio),
            (Some(0.0), Some(0.5))
        );
        assert_eq!(s.utterances, Some(1.0));
        // Khóa của lượt chạy do `session::run` điền.
        assert_eq!(
            (s.busy_ratio, s.cpu_percent, s.segments, s.partials),
            (None, None, None, None)
        );
        assert_eq!((s.cadence_p50_ms, s.streaming_auto_off), (None, None));
        let keys: Vec<String> = serde_json::to_value(&s)
            .unwrap()
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        assert_eq!(keys.len(), 18, "{keys:?}");
        // Chưa có câu nào dịch xong: hai tỉ lệ nháy không có mẫu số.
        let empty = summarize(&[], &[]);
        assert_eq!(
            (empty.tentative_erasure_ratio, empty.a2_p50_ms, empty.utterances),
            (None, None, Some(0.0))
        );
    }

    #[test]
    fn events_serialize_with_their_kind() {
        let json = serde_json::to_value(&merged_sentence(true)[..3]).unwrap();
        assert_eq!(
            (json[0]["kind"].as_str(), json[0]["id"].as_u64()),
            (Some("subtitle"), Some(1))
        );
        assert_eq!(
            (json[2]["kind"].as_str(), json[2]["text"].as_str()),
            (Some("delta"), Some("chúng tôi"))
        );
        assert_eq!(json[2]["t_ms"].as_f64(), Some(2_700.0));
    }
}
