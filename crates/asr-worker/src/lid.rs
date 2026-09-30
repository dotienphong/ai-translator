//! Chọn ngôn ngữ trong tập người dùng cho phép (spec §6.4).

use asr_protocol::SAMPLE_RATE;

/// Ngưỡng thường: xác suất cao nhất (đã chuẩn hóa trong tập cho phép) dưới mức này thì giữ ngôn ngữ của đoạn trước.
pub const MIN_LANG_PROB: f32 = 0.5;

/// Đoạn ngắn hơn mức này (1,5 giây) dùng ngưỡng [`MIN_LANG_PROB_SHORT`].
pub const SHORT_LID_SAMPLES: usize = 24_000;
const _: () = assert!(SHORT_LID_SAMPLES == SAMPLE_RATE as usize * 3 / 2);

/// Ngưỡng cho đoạn ngắn hơn [`SHORT_LID_SAMPLES`]. Ở S6, turbo nhận thành tiếng Anh các đoạn tiếng Việt dưới 1,3 giây
/// (xác suất từ 0,57 đến 0,99): đoạn quá ngắn không đủ bằng chứng để đổi ngôn ngữ, nên chỉ đổi khi xác suất từ 0,9.
pub const MIN_LANG_PROB_SHORT: f32 = 0.9;

/// Ngưỡng `min_prob` cho `pick_language` theo độ dài đoạn (số mẫu 16 kHz): [`MIN_LANG_PROB_SHORT`] nếu đoạn ngắn hơn
/// [`SHORT_LID_SAMPLES`], còn không [`MIN_LANG_PROB`]. Cả hai chế độ giải mã dùng hàm này.
pub fn min_prob_for(n_samples: usize) -> f32 {
    if n_samples < SHORT_LID_SAMPLES {
        MIN_LANG_PROB_SHORT
    } else {
        MIN_LANG_PROB
    }
}

/// `probs`: xác suất của mọi ngôn ngữ Whisper, index là lang id.
/// `allowed`: các lang id được phép, không được rỗng.
/// `prev`: ngôn ngữ của đoạn trước.
///
/// Xác suất được chuẩn hóa lại trong tập `allowed`. Nếu ngôn ngữ cao nhất vẫn dưới
/// `min_prob` thì giữ ngôn ngữ của đoạn trước (nếu nó thuộc tập cho phép).
pub fn pick_language(probs: &[f32], allowed: &[i32], prev: Option<i32>, min_prob: f32) -> (i32, f32) {
    assert!(!allowed.is_empty(), "tập ngôn ngữ cho phép không được rỗng");
    let prob_of = |id: i32| probs.get(id as usize).copied().unwrap_or(0.0).max(0.0);
    let total: f32 = allowed.iter().map(|&id| prob_of(id)).sum();
    let normalized = |id: i32| if total > 0.0 { prob_of(id) / total } else { 0.0 };

    let mut best = (allowed[0], normalized(allowed[0]));
    for &id in &allowed[1..] {
        let p = normalized(id);
        if p > best.1 {
            best = (id, p);
        }
    }
    if best.1 < min_prob
        && let Some(prev) = prev.filter(|p| allowed.contains(p))
    {
        return (prev, normalized(prev));
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    // lang id của Whisper: en=0, zh=1, ko=5, ja=7, vi=19 (ms=23).
    fn probs(pairs: &[(usize, f32)]) -> Vec<f32> {
        let mut v = vec![0.0; 100];
        for &(i, p) in pairs {
            v[i] = p;
        }
        v
    }

    #[test]
    fn picks_highest_inside_allowed_and_renormalizes() {
        // "ms" (id 23) cao nhất nhưng không được phép.
        let p = probs(&[(23, 0.5), (19, 0.3), (0, 0.1)]);
        let (id, prob) = pick_language(&p, &[0, 19], None, 0.5);
        assert_eq!(id, 19);
        assert!((prob - 0.75).abs() < 1e-6);
    }

    #[test]
    fn keeps_previous_language_when_unsure() {
        let p = probs(&[(0, 0.2), (19, 0.25), (1, 0.2)]);
        let (id, prob) = pick_language(&p, &[0, 1, 19], Some(0), 0.5);
        assert_eq!(id, 0);
        // Xác suất trả về là của ngôn ngữ được giữ, đã chuẩn hóa trong tập cho phép.
        assert!((prob - 0.2 / 0.65).abs() < 1e-6);
    }

    #[test]
    fn ignores_previous_language_outside_allowed_set() {
        let p = probs(&[(0, 0.2), (19, 0.25), (1, 0.2)]);
        let (id, _) = pick_language(&p, &[0, 1, 19], Some(7), 0.5);
        assert_eq!(id, 19);
    }

    #[test]
    fn confident_detection_overrides_previous_language() {
        let p = probs(&[(0, 0.05), (19, 0.9)]);
        let (id, _) = pick_language(&p, &[0, 19], Some(0), 0.5);
        assert_eq!(id, 19);
    }

    #[test]
    fn all_zero_falls_back_to_previous_or_first() {
        let p = probs(&[]);
        assert_eq!(pick_language(&p, &[0, 19], Some(19), 0.5).0, 19);
        assert_eq!(pick_language(&p, &[0, 19], None, 0.5).0, 0);
    }

    #[test]
    fn short_segments_use_a_stricter_threshold() {
        assert_eq!(SHORT_LID_SAMPLES, 24_000); // 1,5 giây
        assert_eq!(MIN_LANG_PROB, 0.5);
        assert_eq!(MIN_LANG_PROB_SHORT, 0.9);
        assert_eq!(min_prob_for(0), 0.9);
        assert_eq!(min_prob_for(16_000), 0.9); // 1 giây
        assert_eq!(min_prob_for(SHORT_LID_SAMPLES - 1), 0.9);
        assert_eq!(min_prob_for(SHORT_LID_SAMPLES), 0.5); // đúng 1,5 giây đã là đoạn thường
        assert_eq!(min_prob_for(16_000 * 30), 0.5);
    }

    #[test]
    fn short_threshold_keeps_previous_language_unless_very_confident() {
        // en 0,8 / vi 0,2: đoạn thường (ngưỡng 0,5) đổi sang en; đoạn ngắn (ngưỡng 0,9) giữ vi của đoạn trước.
        let p = probs(&[(0, 0.8), (19, 0.2)]);
        assert_eq!(pick_language(&p, &[0, 19], Some(19), min_prob_for(48_000)).0, 0);
        let (id, prob) = pick_language(&p, &[0, 19], Some(19), min_prob_for(16_000));
        assert_eq!(id, 19);
        assert!((prob - 0.2).abs() < 1e-6); // xác suất trả về là của ngôn ngữ được giữ
        // Từ 0,9 trở lên thì đoạn ngắn vẫn đổi ngôn ngữ.
        let p = probs(&[(0, 0.95), (19, 0.05)]);
        assert_eq!(pick_language(&p, &[0, 19], Some(19), min_prob_for(16_000)).0, 0);
        // Chưa có ngôn ngữ trước thì không có gì để giữ, kể cả khi ngưỡng cao.
        assert_eq!(pick_language(&probs(&[(0, 0.8), (19, 0.2)]), &[0, 19], None, 0.9).0, 0);
    }
}
