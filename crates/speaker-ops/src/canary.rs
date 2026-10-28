//! Chấm một lượt kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3): các khách chạy theo một lịch nói đã biết
//! (`Turn`), bộ đọc thật đọc cửa sổ họp của app thật, và ở mỗi lượt đọc ta biết những người đang được báo "đang nói" (`Frame`).
//! Kiểm tra này đo đúng thứ vỡ khi Teams, Meet, Zoom đổi giao diện: đọc được tên và chỉ báo "đang nói" đúng người.
//!
//! Luật chấm (cùng mức A-spk3 của spec §12: đúng ≥ 90%, sai ≤ 5%):
//! - Chỉ báo của app trễ so với lúc nói ([`Params::shift_ms`], mặc định 0,6 s): lượt đọc lúc `t` ứng với lúc nói `t − shift`.
//! - Một lượt nói đạt khi ≥ [`Params::min_cover`] (60%) số lượt đọc nằm trong nó báo đúng người nói. Ở chỗ nói chồng, mọi người đang
//!   nói đều là đáp án hợp lệ.
//! - Báo sai là có người **không** nói báo "đang nói" ở lượt đọc nằm trong một lượt nói hay khi im hẳn; người vừa nói xong trong
//!   [`Params::tail_ms`] trước đó thì không tính là sai (Zoom giữ người nói trước thêm 2,5–3,5 s, spec §3; Teams tắt chỉ báo trễ).
//! - Đạt toàn lượt kiểm khi ≥ 90% số lượt nói đạt và tỉ lệ báo sai ≤ 5%.
//! - Không đạt thì tình trạng ghi nhận: không thấy ô người tham dự nào → `no_names`; thấy ô mà không bao giờ có ai "đang nói" →
//!   `no_speaking`; app họp không trả lời đa số lượt đọc → `blocked`; còn lại (có chỉ báo nhưng sai người hay thiếu) → `no_speaking`.

use speaker_protocol::MeetingApp;

use crate::health::{Entry, Health};

/// Một lượt nói trong lịch: khách `who` (tên hiển thị trong cuộc họp thử) nói từ `start_ms` tới `end_ms` (giờ Unix, ms).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Turn {
    pub who: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

/// Một lượt đọc của bộ đọc: lúc `at_ms`, những người đang được báo "đang nói".
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Frame {
    pub at_ms: i64,
    pub speaking: Vec<String>,
}

/// Tóm tắt của cả lượt chạy bộ đọc (ngoài các `Frame`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Run {
    /// Số lượt đọc có ít nhất một ô người tham dự.
    pub passes_with_tiles: u32,
    /// Số lượt đọc app họp không trả lời (`Blocked`).
    pub passes_blocked: u32,
    /// Tổng số lượt đọc.
    pub passes: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Params {
    pub shift_ms: i64,
    pub tail_ms: i64,
    pub min_cover: f64,
    pub ok_turns: f64,
    pub max_wrong: f64,
    /// Ít hơn chừng này lượt nói thì kết quả không có nghĩa (lịch hỏng): lỗi, không phải tình trạng của app.
    pub min_turns: usize,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            shift_ms: 600,
            tail_ms: 3_500,
            min_cover: 0.6,
            ok_turns: 0.9,
            max_wrong: 0.05,
            min_turns: 4,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Score {
    pub turns: u32,
    pub turns_ok: u32,
    /// Số lượt đọc đã xét và số lượt có người báo sai.
    pub judged: u32,
    pub wrong: u32,
}

impl Score {
    pub fn turn_ratio(&self) -> f64 {
        if self.turns == 0 {
            0.0
        } else {
            f64::from(self.turns_ok) / f64::from(self.turns)
        }
    }

    pub fn wrong_ratio(&self) -> f64 {
        if self.judged == 0 {
            0.0
        } else {
            f64::from(self.wrong) / f64::from(self.judged)
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Verdict {
    pub health: Health,
    pub score: Score,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum CanaryError {
    #[error("lịch chỉ có {0} lượt nói, cần ít nhất {1}")]
    TooFewTurns(usize, usize),
    #[error("lượt nói {0} có thời gian không hợp lệ")]
    BadTurn(usize),
}

/// Chấm một lượt kiểm tra. `turns`: lịch nói; `frames`: các lượt đọc (không cần đúng thứ tự); `run`: tóm tắt của bộ đọc.
pub fn judge(turns: &[Turn], frames: &[Frame], run: Run, p: &Params) -> Result<Verdict, CanaryError> {
    if turns.len() < p.min_turns {
        return Err(CanaryError::TooFewTurns(turns.len(), p.min_turns));
    }
    if let Some(i) = turns.iter().position(|t| t.end_ms <= t.start_ms || t.who.is_empty()) {
        return Err(CanaryError::BadTurn(i));
    }
    // Người hợp lệ ở lượt đọc lúc `t`: đang nói, hay vừa nói xong trong `tail_ms` trước đó.
    let allowed_at = |t: i64| -> Vec<&Turn> {
        turns
            .iter()
            .filter(|u| (u.start_ms..u.end_ms + p.tail_ms).contains(&(t - p.shift_ms)))
            .collect()
    };
    let mut turns_ok = 0;
    for turn in turns {
        let inside: Vec<&Frame> = frames
            .iter()
            .filter(|f| (turn.start_ms..turn.end_ms).contains(&(f.at_ms - p.shift_ms)))
            .collect();
        let right = inside.iter().filter(|f| f.speaking.contains(&turn.who)).count();
        if !inside.is_empty() && right as f64 / inside.len() as f64 >= p.min_cover {
            turns_ok += 1;
        }
    }
    let (mut judged, mut wrong) = (0, 0);
    for f in frames {
        let allowed = allowed_at(f.at_ms);
        judged += 1;
        if f.speaking.iter().any(|n| !allowed.iter().any(|u| u.who == *n)) {
            wrong += 1;
        }
    }
    let score = Score {
        turns: turns.len() as u32,
        turns_ok,
        judged,
        wrong,
    };
    let anyone_spoke = frames.iter().any(|f| !f.speaking.is_empty());
    let health = if run.passes > 0 && run.passes_blocked * 2 > run.passes {
        Health::Blocked
    } else if run.passes_with_tiles == 0 {
        Health::NoNames
    } else if !anyone_spoke {
        Health::NoSpeaking
    } else if score.turn_ratio() >= p.ok_turns && score.wrong_ratio() <= p.max_wrong {
        Health::Ok
    } else {
        Health::NoSpeaking
    };
    Ok(Verdict { health, score })
}

/// Mục tình trạng của một lượt kiểm tra (để dựng báo cáo `speaker_health` có `canary = true`): toàn bộ thời gian chạy tính theo
/// tình trạng đã chấm.
pub fn entry(
    verdict: &Verdict,
    duration_ms: u64,
    app: MeetingApp,
    app_version: Option<String>,
    recipe_version: u32,
) -> Entry {
    let mut e = Entry::new(app, app_version);
    e.ms.insert(verdict.health, duration_ms);
    e.recipe_version = recipe_version;
    e
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: i64 = 1_793_059_200_000;

    fn turn(who: &str, from_s: i64, to_s: i64) -> Turn {
        Turn {
            who: who.into(),
            start_ms: T0 + from_s * 1_000,
            end_ms: T0 + to_s * 1_000,
        }
    }

    /// Hai khách nói lần lượt (4 lượt), rồi nói chồng.
    fn schedule() -> Vec<Turn> {
        vec![
            turn("Khach A", 0, 6),
            turn("Khach B", 8, 14),
            turn("Khach A", 16, 22),
            turn("Khach B", 24, 30),
            turn("Khach A", 32, 40),
            turn("Khach B", 34, 42),
        ]
    }

    /// Chỉ báo hoàn hảo: lượt đọc mỗi 0,25 s, báo đúng người đang nói (trễ 0,6 s), im ngoài lúc nói.
    fn frames_of(turns: &[Turn], tweak: impl Fn(i64, Vec<String>) -> Vec<String>) -> Vec<Frame> {
        (0..46_000 / 250)
            .map(|i| {
                let at = T0 + i * 250;
                let speaking: Vec<String> = turns
                    .iter()
                    .filter(|t| (t.start_ms..t.end_ms).contains(&(at - 600)))
                    .map(|t| t.who.clone())
                    .collect();
                Frame {
                    at_ms: at,
                    speaking: tweak(at, speaking),
                }
            })
            .collect()
    }

    fn run() -> Run {
        Run {
            passes_with_tiles: 180,
            passes_blocked: 0,
            passes: 184,
        }
    }

    #[test]
    fn a_perfect_reader_passes() {
        let turns = schedule();
        let v = judge(&turns, &frames_of(&turns, |_, s| s), run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::Ok);
        assert_eq!((v.score.turns, v.score.turns_ok, v.score.wrong), (6, 6, 0));
    }

    /// Zoom giữ người nói trước thêm vài giây sau khi im: không tính là sai.
    #[test]
    fn holding_the_previous_speaker_for_a_few_seconds_is_not_wrong() {
        let turns = schedule();
        let frames = frames_of(&turns, |at, mut s| {
            let held = turns
                .iter()
                .filter(|t| (t.end_ms..t.end_ms + 3_000).contains(&(at - 600)))
                .map(|t| t.who.clone());
            s.extend(held);
            s.sort();
            s.dedup();
            s
        });
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::Ok, "{:?}", v.score);
    }

    #[test]
    fn no_participant_tile_means_no_names() {
        let turns = schedule();
        let none = Run {
            passes_with_tiles: 0,
            passes_blocked: 0,
            passes: 184,
        };
        let v = judge(&turns, &frames_of(&turns, |_, _| vec![]), none, &Params::default()).unwrap();
        assert_eq!(v.health, Health::NoNames);
    }

    #[test]
    fn tiles_but_nobody_ever_speaking_means_no_speaking() {
        let turns = schedule();
        let v = judge(&turns, &frames_of(&turns, |_, _| vec![]), run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::NoSpeaking);
        assert_eq!(v.score.turns_ok, 0);
    }

    #[test]
    fn the_app_not_answering_means_blocked_before_anything_else() {
        let turns = schedule();
        let blocked = Run {
            passes_with_tiles: 10,
            passes_blocked: 100,
            passes: 184,
        };
        assert_eq!(
            judge(&turns, &frames_of(&turns, |_, s| s), blocked, &Params::default())
                .unwrap()
                .health,
            Health::Blocked
        );
        let half = Run {
            passes_with_tiles: 90,
            passes_blocked: 92,
            passes: 184,
        };
        assert_eq!(
            judge(&turns, &frames_of(&turns, |_, s| s), half, &Params::default())
                .unwrap()
                .health,
            Health::Ok,
            "đúng một nửa chưa là chặn"
        );
    }

    /// Chỉ báo đổi người: tên sai ở mọi lượt đọc.
    #[test]
    fn a_swapped_indicator_fails_on_both_counts() {
        let turns = schedule();
        let frames = frames_of(&turns, |_, s| {
            s.iter()
                .map(|n| {
                    if n == "Khach A" {
                        "Khach B".to_string()
                    } else {
                        "Khach A".to_string()
                    }
                })
                .collect()
        });
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::NoSpeaking);
        assert_eq!(
            v.score.turns_ok, 2,
            "chỉ hai lượt nói chồng cuối còn đúng vì cả hai tên cùng hợp lệ: {:?}",
            v.score
        );
        assert!(v.score.wrong_ratio() > 0.3, "{:?}", v.score);
    }

    /// Một lượt nói mất chỉ báo: dưới 60% số lượt đọc của một lượt nói thì lượt đó không đạt; 1 lượt hỏng trên 6 là dưới 90%.
    #[test]
    fn one_missed_turn_in_six_is_below_ninety_percent() {
        let turns = schedule();
        let frames = frames_of(&turns, |at, s| {
            let in_second = (T0 + 8_000..T0 + 14_000).contains(&(at - 600));
            if in_second { vec![] } else { s }
        });
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert_eq!((v.score.turns_ok, v.score.turns), (5, 6));
        assert_eq!(v.health, Health::NoSpeaking);
    }

    /// Ranh giới `min_cover`: đúng tên ở 70% số lượt đọc của lượt nói thì đạt, chỉ 30% thì không (có tên đúng đôi lúc là chưa đủ).
    #[test]
    fn a_turn_needs_the_right_name_in_at_least_sixty_percent_of_its_reads() {
        let turns = schedule();
        let covered = |share: f64| {
            frames_of(&turns, |at, s| {
                let from = T0 + 8_000 + 600;
                let cut = from + (6_000.0 * share) as i64;
                if (from..T0 + 14_000 + 600).contains(&at) && at >= cut {
                    vec![]
                } else {
                    s
                }
            })
        };
        let seventy = judge(&turns, &covered(0.7), run(), &Params::default()).unwrap();
        assert_eq!(
            (seventy.score.turns_ok, seventy.score.turns),
            (6, 6),
            "{:?}",
            seventy.score
        );
        let thirty = judge(&turns, &covered(0.3), run(), &Params::default()).unwrap();
        assert_eq!(
            (thirty.score.turns_ok, thirty.score.turns),
            (5, 6),
            "{:?}",
            thirty.score
        );
    }

    #[test]
    fn a_stray_name_while_nobody_speaks_counts_as_wrong() {
        let turns = schedule();
        let frames = frames_of(&turns, |at, s| {
            if s.is_empty() && at > T0 + 50_000 {
                vec!["Khach A".into()]
            } else {
                s
            }
        });
        // Không có lượt đọc sau 50 s trong frames_of: thêm tay vài lượt im có người báo.
        let mut frames = frames;
        for i in 0..40 {
            frames.push(Frame {
                at_ms: T0 + 60_000 + i * 250,
                speaking: vec!["Khach A".into()],
            });
        }
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert!(v.score.wrong >= 40, "{:?}", v.score);
        assert_eq!(v.health, Health::NoSpeaking);
    }

    #[test]
    fn a_broken_schedule_is_an_error_not_a_verdict() {
        let turns = schedule();
        assert_eq!(
            judge(&turns[..3], &[], run(), &Params::default()),
            Err(CanaryError::TooFewTurns(3, 4))
        );
        let mut bad = schedule();
        bad[2].end_ms = bad[2].start_ms;
        assert_eq!(
            judge(&bad, &[], run(), &Params::default()),
            Err(CanaryError::BadTurn(2))
        );
        let mut nameless = schedule();
        nameless[0].who.clear();
        assert_eq!(
            judge(&nameless, &[], run(), &Params::default()),
            Err(CanaryError::BadTurn(0))
        );
    }

    #[test]
    fn the_report_entry_carries_the_verdict() {
        let turns = schedule();
        let v = judge(&turns, &frames_of(&turns, |_, _| vec![]), run(), &Params::default()).unwrap();
        let e = entry(&v, 300_000, MeetingApp::Teams, Some("26032.1100".into()), 2);
        assert_eq!(e.dominant(), Some(Health::NoSpeaking));
        assert_eq!(e.total_ms(), 300_000);
        assert_eq!(e.ok_ms(), 0);
        assert_eq!(e.recipe_version, 2);
    }
}
