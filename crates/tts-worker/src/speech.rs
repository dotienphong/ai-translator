//! Đo trên sóng âm: khoảng lặng hai đầu, số cụm năng lượng và phát hiện "nói thêm" (port `core_utils.py`:
//! `edge_silence`, `pause_pad_samples`, `count_speech_bursts`, `babble_suspect`, `babble_prefer`).
//! Đối chiếu với SDK bằng `tests/golden_text.rs`.

use crate::frames::{is_cue_only, syllable_count};

/// Khoảng nghỉ tối thiểu giữa hai đoạn theo loại ranh giới (giây), đo trên 23 giọng preset của SDK.
pub const GAP_SENTENCE_S: f32 = 0.50;
pub const GAP_MINOR_S: f32 = 0.30;
pub const GAP_PARA_S: f32 = 0.70;
/// Chỉ kiểm "nói thêm" cho đoạn có tối đa chừng này tiếng.
pub const BABBLE_MAX_SYLLABLES: usize = 3;
/// Số lần sinh lại tối đa khi nghi "nói thêm".
pub const BABBLE_MAX_RETRIES: usize = 2;
const BURST_THRESH_DB: f32 = -18.0;
const BURST_MIN_GAP_MS: usize = 60;
const BURST_MIN_MS: usize = 30;
const EDGE_THRESH_DB: f32 = -45.0;

/// `(lead, tail)`: số mẫu im lặng ở đầu và cuối (envelope mean|x| theo cửa sổ 10 ms dưới -45 dB). Toàn im lặng: `(len, 0)`.
pub fn edge_silence(wav: &[f32], sr: u32) -> (usize, usize) {
    let n = wav.len();
    let win = ((0.01 * f64::from(sr)) as usize).max(1);
    let n_win = n / win;
    if n_win == 0 {
        return (n, 0);
    }
    let thr = 10f32.powf(EDGE_THRESH_DB / 20.0);
    let above = |w: usize| wav[w * win..(w + 1) * win].iter().map(|x| x.abs()).sum::<f32>() / win as f32 > thr;
    let first = (0..n_win).find(|&w| above(w));
    let last = (0..n_win).rev().find(|&w| above(w));
    match (first, last) {
        (Some(a), Some(b)) => (a * win, n - (b + 1) * win),
        _ => (n, 0),
    }
}

/// Số mẫu zeros cần chèn giữa `prev` và `next` để khoảng nghỉ THẬT (đuôi trước + zeros + đầu sau) đạt `pause_s`; 0 nếu đủ.
/// Dùng cho phát dần: đoạn trước đã phát đi nên không cắt được nữa.
pub fn pause_pad_samples(prev: &[f32], next: &[f32], sr: u32, pause_s: f32) -> usize {
    let (lead_prev, mut tail) = edge_silence(prev, sr);
    if lead_prev == prev.len() {
        tail = prev.len();
    }
    let (lead, _) = edge_silence(next, sr);
    ((pause_s * sr as f32) as usize).saturating_sub(tail + lead)
}

/// Số cụm năng lượng (xấp xỉ số tiếng) trong sóng mono.
pub fn count_speech_bursts(wav: &[f32], sr: u32) -> usize {
    let hop = ((f64::from(sr) * 0.010) as usize).max(1);
    let n = wav.len() / hop;
    if n == 0 {
        return 0;
    }
    let env: Vec<f32> = (0..n)
        .map(|i| (wav[i * hop..(i + 1) * hop].iter().map(|x| x * x).sum::<f32>() / hop as f32).sqrt())
        .collect();
    let peak = env.iter().copied().fold(0.0f32, f32::max);
    if peak <= 1e-6 {
        return 0;
    }
    let thr = peak * 10f32.powf(BURST_THRESH_DB / 20.0);
    let min_gap = (BURST_MIN_GAP_MS / 10).max(1);
    let min_len = (BURST_MIN_MS / 10).max(1);
    let mut bursts: Vec<(usize, usize)> = Vec::new();
    let (mut start, mut last_on): (Option<usize>, usize) = (None, 0);
    for (i, &e) in env.iter().enumerate() {
        if e > thr {
            match start {
                None => start = Some(i),
                Some(s) if i - last_on > min_gap => {
                    bursts.push((s, last_on));
                    start = Some(i);
                }
                _ => {}
            }
            last_on = i;
        }
    }
    if let Some(s) = start {
        bursts.push((s, last_on));
    }
    bursts.iter().filter(|(a, b)| b - a + 1 >= min_len).count()
}

/// Kết quả kiểm một đoạn vừa sinh.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Babble {
    pub suspect: bool,
    pub syllables: usize,
    pub bursts: usize,
    pub n_frames: usize,
}

/// (`n_frames` mặc định làm tròn nửa-về-chẵn như `round` của Python.) Nghi "nói thêm" khi số cụm âm lớn hơn số tiếng, hoặc đoạn ≤ 2 tiếng chạy sát trần khung. Chỉ xét đoạn ≤ 3 tiếng, không
/// có dấu hiệu cảm xúc.
pub fn babble_suspect(wav: &[f32], sr: u32, phonemes: &str, cap_frames: usize, n_frames: Option<usize>) -> Babble {
    let frames = n_frames.unwrap_or_else(|| (wav.len() as f64 / (f64::from(sr) / 12.5)).round_ties_even() as usize);
    if is_cue_only(phonemes) {
        return Babble {
            suspect: frames + 1 >= cap_frames,
            syllables: 0,
            bursts: 0,
            n_frames: frames,
        };
    }
    let syl = syllable_count(phonemes);
    if syl == 0 || syl > BABBLE_MAX_SYLLABLES || phonemes.contains("<|emotion_") {
        return Babble {
            suspect: false,
            syllables: syl,
            bursts: 0,
            n_frames: 0,
        };
    }
    let bursts = count_speech_bursts(wav, sr);
    let hit_cap = syl <= 2 && frames + 1 >= cap_frames;
    Babble {
        suspect: bursts > syl || hit_cap,
        syllables: syl,
        bursts,
        n_frames: frames,
    }
}

/// Bản sinh lại `new` có đáng thay `old` không.
pub fn babble_prefer(new: &Babble, old: &Babble) -> bool {
    if new.suspect != old.suspect {
        return !new.suspect;
    }
    new.bursts < old.bursts || (new.bursts == old.bursts && new.n_frames < old.n_frames)
}

/// Khoảng nghỉ tối thiểu sau đoạn `prev_text` (giây): sau dấu kết câu `.`/`!`/`?` là [`GAP_SENTENCE_S`], còn lại
/// [`GAP_MINOR_S`]; nhân `scale` (hệ số nghỉ của người dùng, 1.0 giữ nguyên).
pub fn gap_seconds(prev_text: &str, scale: f32) -> f32 {
    let base = if prev_text.trim_end().ends_with(['.', '!', '?']) {
        GAP_SENTENCE_S
    } else {
        GAP_MINOR_S
    };
    base * scale
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gap_scales_sentence_and_minor_pauses() {
        assert_eq!(gap_seconds("Xin chào.", 2.0), 1.0);
        assert_eq!(gap_seconds("Xin chào,", 0.5), 0.15);
        assert_eq!(gap_seconds("Xin chào!  ", 1.0), GAP_SENTENCE_S);
        assert_eq!(gap_seconds("Thật sao? ", 1.0), 0.50);
        assert_eq!(gap_seconds("Xin chào,", 1.0), 0.30);
        assert_eq!(gap_seconds("Xin chào", 1.0), GAP_MINOR_S);
    }

    #[test]
    fn silence_edges_and_pad() {
        let sr = 48_000;
        let mut w = vec![0.0f32; 48_000];
        for x in &mut w[10_000..20_000] {
            *x = 0.5;
        }
        let (lead, tail) = edge_silence(&w, sr);
        assert_eq!(
            lead, 9_600,
            "cửa sổ 10 ms (480 mẫu) chứa 80 mẫu có tiếng vẫn vượt -45 dB"
        );
        assert!(tail > 27_000);
        assert_eq!(edge_silence(&vec![0.0; 1000], sr), (1000, 0));
        assert_eq!(edge_silence(&[0.5; 10], sr), (10, 0));
        // đã đủ nghỉ thì không chèn
        assert_eq!(pause_pad_samples(&w, &w, sr, 0.1), 0);
        assert!(pause_pad_samples(&[0.5; 4800], &[0.5; 4800], sr, 0.5) > 0);
    }

    #[test]
    fn bursts_count_separated_blobs() {
        let sr = 48_000;
        let mut w = vec![0.0f32; sr as usize];
        for r in [(2_000..8_000), (20_000..26_000), (36_000..42_000)] {
            for x in &mut w[r] {
                *x = 0.4;
            }
        }
        assert_eq!(count_speech_bursts(&w, sr), 3);
        assert_eq!(count_speech_bursts(&[], sr), 0);
        assert_eq!(count_speech_bursts(&vec![0.0; 4800], sr), 0);
    }

    #[test]
    fn babble_rules() {
        let sr = 48_000;
        let mut w = vec![0.0f32; sr as usize];
        for r in [(2_000..8_000), (20_000..26_000)] {
            for x in &mut w[r] {
                *x = 0.4;
            }
        }
        // 1 tiếng nhưng 2 cụm => nghi
        assert!(babble_suspect(&w, sr, "ˈa", 40, Some(10)).suspect);
        // 3 tiếng, 2 cụm => không nghi
        assert!(!babble_suspect(&w, sr, "ˈa ˈa ˈa", 40, Some(10)).suspect);
        // dài hơn 3 tiếng => bỏ qua
        assert!(!babble_suspect(&w, sr, "ˈa ˈa ˈa ˈa", 40, Some(10)).suspect);
        let bad = Babble {
            suspect: true,
            syllables: 1,
            bursts: 2,
            n_frames: 12,
        };
        let ok = Babble {
            suspect: false,
            syllables: 1,
            bursts: 1,
            n_frames: 8,
        };
        assert!(babble_prefer(&ok, &bad) && !babble_prefer(&bad, &ok));
    }
}
