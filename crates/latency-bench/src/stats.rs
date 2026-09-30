//! Phân vị và ghép đoạn với câu thật.

use serde::{Deserialize, Serialize};

/// Phân vị kiểu nội suy tuyến tính (giống `numpy.percentile` mặc định). `p` trong [0, 100].
pub fn percentile(values: &[f32], p: f32) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    let mut v = values.to_vec();
    v.sort_by(f32::total_cmp);
    let rank = (p / 100.0) * (v.len() - 1) as f32;
    let (lo, hi) = (rank.floor() as usize, rank.ceil() as usize);
    Some(v[lo] + (v[hi] - v[lo]) * (rank - lo as f32))
}

/// Một câu trong file mốc thật do `build_sessions.py` tạo.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Utterance {
    pub id: String,
    pub lang: String,
    pub start_ms: u64,
    /// Thời điểm người nói thực sự dừng câu (spec A2).
    pub end_ms: u64,
    pub text: String,
}

/// Trả, với mỗi câu, chỉ số đoạn có `end_ms` gần mốc dừng câu nhất (trong phạm vi `max_ms`).
/// Mỗi đoạn chỉ được ghép với một câu.
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
}
