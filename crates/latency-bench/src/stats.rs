//! Phân vị và ghép đoạn với câu thật.

use serde::{Deserialize, Serialize};

/// Phân vị kiểu nội suy tuyến tính (giống `numpy.percentile` mặc định). `p` ngoài [0, 100] được kẹp về hai đầu.
pub fn percentile(values: &[f32], p: f32) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    let mut v = values.to_vec();
    v.sort_by(f32::total_cmp);
    let rank = (p.clamp(0.0, 100.0) / 100.0) * (v.len() - 1) as f32;
    let (lo, hi) = (rank.floor() as usize, rank.ceil() as usize);
    Some(v[lo] + (v[hi] - v[lo]) * (rank - lo as f32))
}

/// Một câu trong file mốc thật do `build_sessions.py` tạo.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Utterance {
    pub id: String,
    pub lang: String,
    pub start_ms: u64,
    /// Thời điểm người nói thực sự dừng câu (spec A2). Độ trễ tính từ mốc này.
    pub end_ms: u64,
    /// Mốc dừng theo VAD, trước khi `build_sessions.py` tinh chỉnh bằng năng lượng (`end_ms` sớm hơn hoặc bằng mốc này). Đoạn
    /// của Segmenter cũng dừng theo VAD, nên độ lệch mốc kiểm so với mốc này. Truth cũ không có thì dùng `end_ms`.
    #[serde(default)]
    pub vad_end_ms: Option<u64>,
    pub text: String,
}

/// Trả, với mỗi câu, chỉ số đoạn có `end_ms` gần mốc dừng câu nhất (trong phạm vi `max_ms`).
/// Mỗi đoạn chỉ được ghép với một câu.
///
/// Giả định: ghép tham lam theo thứ tự câu; đúng khi câu dài ít nhất khoảng 3 giây và cách nhau ít nhất 0,4 giây.
/// Câu ngắn hơn hoặc sát nhau hơn thì câu đi trước có thể lấy mất đoạn của câu sau.
pub fn match_segments(utterances: &[Utterance], segment_ends_ms: &[u64], max_ms: u64) -> Vec<Option<usize>> {
    let mut used = vec![false; segment_ends_ms.len()];
    utterances
        .iter()
        .map(|u| {
            let best = segment_ends_ms
                .iter()
                .enumerate()
                .filter(|(i, _)| !used[*i])
                .map(|(i, &end)| (i, end.abs_diff(u.end_ms)))
                .filter(|&(_, d)| d <= max_ms)
                .min_by_key(|&(_, d)| d)
                .map(|(i, _)| i);
            if let Some(i) = best {
                used[i] = true;
            }
            best
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_interpolates() {
        let v = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(percentile(&v, 50.0), Some(2.5));
        assert_eq!(percentile(&v, 0.0), Some(1.0));
        assert_eq!(percentile(&v, 100.0), Some(4.0));
        assert!((percentile(&v, 90.0).unwrap() - 3.7).abs() < 1e-6);
        assert_eq!(percentile(&[], 50.0), None);
    }

    fn utt(end_ms: u64) -> Utterance {
        Utterance {
            id: format!("u{end_ms}"),
            lang: "en".into(),
            start_ms: 0,
            end_ms,
            vad_end_ms: None,
            text: String::new(),
        }
    }

    #[test]
    fn matches_nearest_segment_end_once() {
        let utts = [utt(1_000), utt(5_000), utt(9_000)];
        let ends = [1_064, 4_960, 20_000];
        assert_eq!(match_segments(&utts, &ends, 1_000), vec![Some(0), Some(1), None]);
    }

    #[test]
    fn segment_is_not_reused() {
        let utts = [utt(1_000), utt(1_100)];
        let ends = [1_050];
        assert_eq!(match_segments(&utts, &ends, 1_000), vec![Some(0), None]);
    }

    #[test]
    fn percentile_sorts_unsorted_input() {
        // numpy.percentile([15, 20, 35, 40, 50], [0, 40, 90, 100]) == [15, 29, 46, 50]
        let v = [50.0, 15.0, 40.0, 20.0, 35.0];
        assert_eq!(percentile(&v, 0.0), Some(15.0));
        assert!((percentile(&v, 40.0).unwrap() - 29.0).abs() < 1e-4);
        assert!((percentile(&v, 90.0).unwrap() - 46.0).abs() < 1e-4);
        assert_eq!(percentile(&v, 100.0), Some(50.0));
        assert_eq!(percentile(&[7.0], 90.0), Some(7.0));
    }

    #[test]
    fn percentile_clamps_p_into_0_100() {
        let v = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(percentile(&v, -10.0), Some(1.0));
        assert_eq!(percentile(&v, 250.0), Some(4.0));
    }

    #[test]
    fn match_window_is_inclusive_on_both_sides() {
        assert_eq!(match_segments(&[utt(5_000)], &[6_000], 1_000), vec![Some(0)]);
        assert_eq!(match_segments(&[utt(5_000)], &[4_000], 1_000), vec![Some(0)]);
        assert_eq!(match_segments(&[utt(5_000)], &[6_001], 1_000), vec![None]);
        assert_eq!(match_segments(&[utt(5_000)], &[3_999], 1_000), vec![None]);
    }

    #[test]
    fn picks_nearest_end_on_either_side() {
        // Câu dài hơn 8 s bị cắt cưỡng bức (max_segment_ms): đoạn cắt giữa câu cũng nằm trong phạm vi.
        assert_eq!(match_segments(&[utt(9_000)], &[8_200, 9_030], 1_000), vec![Some(1)]);
        assert_eq!(match_segments(&[utt(5_000)], &[4_900, 5_800], 1_000), vec![Some(0)]);
        assert_eq!(match_segments(&[utt(5_000)], &[4_200, 5_100], 1_000), vec![Some(1)]);
    }
}
