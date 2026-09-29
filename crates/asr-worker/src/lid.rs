//! Chọn ngôn ngữ trong tập người dùng cho phép (spec §6.4).

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
}
