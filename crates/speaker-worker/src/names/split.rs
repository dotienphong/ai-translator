//! Tách giọng bị gộp theo tên thật (spec §5.3, đã duyệt; QĐ 10 của kế hoạch 04): một giọng trùng với hai tên, mỗi tên một phần đáng
//! kể thời gian trùng (`split_share`, `split_min_ms`, `split_min_segments` đoạn mang riêng tên đó), xen kẽ theo thời gian (≥ 2 lần
//! đổi), và tâm nhúng của hai nhóm đoạn khác nhau (cosine ≤ `split_max_cosine`): tách nhóm mang tên ít thời gian hơn sang giọng mới.
//! Mỗi giọng tách tối đa một lần mỗi 60 s, tối đa 4 lần mỗi phiên (worker giữ đếm). Thuần, tất định.

use std::collections::BTreeSet;
use std::fmt;

use speaker_protocol::SpeakerConfig;

use super::matcher::{NameMatcher, SegRec, centroid_of};
use crate::embed::cosine;

pub const SPLIT_COOLDOWN_MS: i64 = 60_000;
pub const MAX_SPLITS: u32 = 4;
/// Mỗi nhóm cần ít nhất chừng này nhúng để so tâm.
pub const MIN_EMBEDDINGS: usize = 2;

#[derive(Clone, PartialEq)]
pub struct SplitPlan {
    pub voice: u32,
    /// Tên của nhóm đoạn chuyển sang giọng mới.
    pub name: String,
    /// Id các đoạn chuyển sang giọng mới (theo thứ tự thời gian).
    pub segments: Vec<u64>,
}

// Debug viết tay: tên không vào log (rà soát A-NHỎ 5).
impl fmt::Debug for SplitPlan {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SplitPlan(giọng {}, <tên {} ký tự>, đoạn {:?})",
            self.voice,
            self.name.chars().count(),
            self.segments
        )
    }
}

/// Giọng đầu tiên (theo mã) cần tách, nếu có. `room`: giọng trong phòng (không tách); `cooling`: giọng vừa tách trong 60 s.
pub fn find_split(
    m: &NameMatcher,
    cfg: &SpeakerConfig,
    room: &BTreeSet<u32>,
    cooling: &BTreeSet<u32>,
) -> Option<SplitPlan> {
    if !cfg.split {
        return None;
    }
    for (&voice, totals) in m.totals() {
        if room.contains(&voice) || cooling.contains(&voice) {
            continue;
        }
        let total: i64 = totals.values().map(|e| e.ms.max(0)).sum();
        if total <= 0 {
            continue;
        }
        let recs: Vec<&SegRec> = m
            .records()
            .filter(|s| s.voice == Some(voice) && s.attributed.is_some())
            .collect();
        let count = |n: &str| recs.iter().filter(|s| s.attributed.as_deref() == Some(n)).count() as u32;
        let mut names: Vec<(&String, i64)> = totals
            .iter()
            .filter(|(n, e)| {
                !m.is_self(n)
                    && e.ms >= cfg.split_min_ms as i64
                    && e.ms as f64 >= f64::from(cfg.split_share) * total as f64
                    && count(n) >= cfg.split_min_segments
            })
            .map(|(n, e)| (n, e.ms))
            .collect();
        if names.len() < 2 {
            continue;
        }
        names.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
        let (major, minor) = (names[0].0.as_str(), names[1].0.as_str());
        let order: Vec<&str> = recs
            .iter()
            .filter_map(|s| s.attributed.as_deref())
            .filter(|n| *n == major || *n == minor)
            .collect();
        if order.windows(2).filter(|w| w[0] != w[1]).count() < 2 {
            continue;
        }
        let of = |name: &str| {
            centroid_of(
                recs.iter().copied().filter(|s| s.attributed.as_deref() == Some(name)),
                MIN_EMBEDDINGS,
            )
        };
        let (Some(a), Some(b)) = (of(major), of(minor)) else {
            continue;
        };
        if cosine(&a, &b) > cfg.split_max_cosine {
            continue;
        }
        let segments = recs
            .iter()
            .filter(|s| s.attributed.as_deref() == Some(minor))
            .map(|s| s.id)
            .collect();
        return Some(SplitPlan {
            voice,
            name: minor.to_string(),
            segments,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::names::Spans;
    use crate::names::matcher::SegRec;
    use crate::names::matcher::tests::read;

    const A: [f32; 3] = [1.0, 0.0, 0.0];
    /// Cosine 0,8 với A: hai người giống giọng (như cặp 0,60–0,70 của `results/nhan-giong-tieng-viet.md`, ở đây đơn giản hóa).
    const D: [f32; 3] = [0.8, 0.6, 0.0];
    const LAN: &[(i64, i64)] = &[(0, 4_000), (10_000, 14_000), (20_000, 24_000)];
    const MINH: &[(i64, i64)] = &[(5_000, 9_000), (15_000, 19_000), (25_000, 29_000)];

    fn split_on() -> SpeakerConfig {
        SpeakerConfig {
            split: true,
            ..SpeakerConfig::default()
        }
    }

    /// Giọng 1 nhận cả Lan (nhúng `lan`) và Minh (nhúng `minh`) xen kẽ; chỉ báo trễ 900 ms.
    fn merged(lan: [f32; 3], minh: [f32; 3], minh_turns: &[(i64, i64)]) -> NameMatcher {
        let mut m = NameMatcher::default();
        let mut turns: Vec<(i64, i64, [f32; 3])> = LAN.iter().map(|&(s, e)| (s, e, lan)).collect();
        turns.extend(minh_turns.iter().map(|&(s, e)| (s, e, minh)));
        turns.sort_by_key(|t| t.0);
        for (id, (s, e, emb)) in turns.into_iter().enumerate() {
            m.segment(SegRec::new(id as u64, s, e, Some(1), false, Some(emb.to_vec()), true));
        }
        read(&mut m, 0, 31_000, 900, &[("Lan", LAN), ("Minh", minh_turns)]);
        m.settle(900, &Spans::default(), &BTreeSet::new());
        m
    }

    #[test]
    fn two_alternating_names_with_different_voices_split_the_voice() {
        let m = merged(A, D, MINH);
        assert_eq!(m.names().get(&1), None, "giọng gộp không có tên (mỗi tên 50%)");
        let plan = find_split(&m, &split_on(), &BTreeSet::new(), &BTreeSet::new()).unwrap();
        assert_eq!(
            plan,
            SplitPlan {
                voice: 1,
                name: "Minh".into(),
                segments: vec![1, 3, 5]
            }
        );
    }

    #[test]
    fn one_person_seen_under_two_names_is_not_split() {
        let m = merged(A, A, MINH);
        assert_eq!(
            find_split(&m, &split_on(), &BTreeSet::new(), &BTreeSet::new()),
            None,
            "hai tâm giống hệt"
        );
    }

    #[test]
    fn a_one_sided_overlap_is_not_split() {
        let m = merged(A, D, &MINH[..1]);
        assert_eq!(
            find_split(&m, &split_on(), &BTreeSet::new(), &BTreeSet::new()),
            None,
            "Minh chỉ một đoạn"
        );
    }

    #[test]
    fn split_plans_never_print_names() {
        let plan = SplitPlan {
            voice: 1,
            name: "Minh Trần".into(),
            segments: vec![1, 3],
        };
        assert!(!format!("{plan:?}").contains("Minh"));
    }

    #[test]
    fn room_voices_cooling_voices_and_the_default_config_never_split() {
        let m = merged(A, D, MINH);
        let one = BTreeSet::from([1]);
        assert_eq!(
            find_split(&m, &split_on(), &one, &BTreeSet::new()),
            None,
            "giọng trong phòng"
        );
        assert_eq!(
            find_split(&m, &split_on(), &BTreeSet::new(), &one),
            None,
            "vừa tách trong 60 s"
        );
        assert_eq!(
            find_split(&m, &SpeakerConfig::default(), &BTreeSet::new(), &BTreeSet::new()),
            None,
            "mặc định tắt"
        );
    }
}
