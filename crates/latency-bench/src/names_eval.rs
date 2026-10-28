//! Lệnh `speaker-names-eval` (kế hoạch 04 Task 11; spec 2026-10-26-phan-biet-nguoi-noi §5.3, §6.6): chạy phần ghép tên và tách
//! giọng của `speaker_worker::session::Worker` trên cache nhúng của `speaker-eval --embeddings-out`, với bộ đọc tên giả dựng từ RTTM:
//! mỗi người nói thật là một người tham dự cùng tên; chỉ báo "đang nói" bật `--on-ms` sau lúc bắt đầu nói, tắt `--off-ms` sau lúc thôi
//! nói, lấy mẫu mỗi `--tick-ms`, mất ngẫu nhiên `--miss` lượt (`--seed`). Ghi JSONL mỗi đoạn một dòng (`start_ms`, `end_ms`, `voice`,
//! `name`, `truth`) để `score_spk.py` chấm giọng; tự chấm tên trên dòng ≥ 1 s, sau khi người nói thật của dòng đã nói ≥ 2 lượt (như
//! A-spk3), theo nhãn cuối phiên (như bản chép lời). In một dòng JSON tóm tắt.

use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use clap::Args;
use speaker_protocol::{MeetingApp, NamesSetup, Request, Response, Source, SpeakerConfig};
use speaker_recipe::Os;
use speaker_worker::names::{ParticipantNow, Via};
use speaker_worker::session::{Embed, Worker};

use crate::speaker_eval::{CachedSegment, read_cache, write_file};

#[derive(Args)]
pub struct NamesEvalArgs {
    /// Cache nhúng của `speaker-eval --embeddings-out`.
    #[arg(long)]
    embeddings_in: PathBuf,
    /// Nhãn người nói (RTTM).
    #[arg(long)]
    rttm: PathBuf,
    /// JSONL kết quả.
    #[arg(long)]
    out: PathBuf,
    /// Chỉ báo bật sau lúc bắt đầu nói chừng này ms (kế hoạch 01: Teams 760–1 280, Zoom 440–560, Meet 500–1 200).
    #[arg(long, default_value_t = 900)]
    on_ms: i64,
    /// Chỉ báo tắt sau lúc thôi nói chừng này ms (Teams 520–700).
    #[arg(long, default_value_t = 600)]
    off_ms: i64,
    #[arg(long, default_value_t = 250)]
    tick_ms: i64,
    /// Phần lượt đọc mất chỉ báo (0–1).
    #[arg(long, default_value_t = 0.0)]
    miss: f64,
    #[arg(long, default_value_t = 1)]
    seed: u64,
    /// App giả lập: độ trễ dời mốc lấy từ công thức build sẵn (hiện chỉ `teams`; app không có trong công thức build sẵn dùng trễ
    /// mặc định 800 ms, QĐ 16, 32).
    #[arg(long, default_value = "teams")]
    app: String,
    /// Bật tách giọng bị gộp (spec §5.3).
    #[arg(long)]
    split: bool,
    #[arg(long)]
    split_share: Option<f32>,
    #[arg(long)]
    split_min_ms: Option<u64>,
    #[arg(long)]
    split_min_segments: Option<u32>,
    #[arg(long)]
    split_max_cosine: Option<f32>,
}

/// Không nhúng: công cụ này đưa nhúng đã lưu thẳng vào `Worker::segment_with`.
struct NoEmbed;

impl Embed for NoEmbed {
    fn embed(&self, _: &[f32]) -> Result<Vec<f32>> {
        bail!("speaker-names-eval không nhúng")
    }
}

/// Lượt RTTM: (đầu ms, cuối ms, người).
type Turn = (i64, i64, String);

/// Nhãn cuối phiên của một đoạn: (giọng, tên).
type Label = (Option<u32>, Option<String>);

pub(crate) fn read_rttm(path: &Path) -> Result<Vec<Turn>> {
    let text = std::fs::read_to_string(path).with_context(|| format!("không đọc được {}", path.display()))?;
    let mut turns = Vec::new();
    for line in text.lines() {
        let p: Vec<&str> = line.split_whitespace().collect();
        if p.first() != Some(&"SPEAKER") || p.len() < 8 {
            continue;
        }
        let (s, d): (f64, f64) = (p[3].parse()?, p[4].parse()?);
        turns.push((
            (s * 1000.0).round() as i64,
            ((s + d) * 1000.0).round() as i64,
            p[7].to_string(),
        ));
    }
    turns.sort();
    Ok(turns)
}

/// Người nói nhiều nhất trong [s, e); bằng nhau thì tên nhỏ hơn.
fn truth_of(turns: &[Turn], s: i64, e: i64) -> Option<String> {
    let mut by: BTreeMap<&str, i64> = BTreeMap::new();
    for (ts, te, spk) in turns {
        let o = e.min(*te) - s.max(*ts);
        if o > 0 {
            *by.entry(spk.as_str()).or_default() += o;
        }
    }
    by.into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(a.0)))
        .map(|(n, _)| n.to_string())
}

/// Khoảng có tiếng nói: hợp các lượt (đã theo thứ tự đầu lượt).
fn speech_spans(turns: &[Turn]) -> Vec<(i64, i64)> {
    let mut out: Vec<(i64, i64)> = Vec::new();
    for (s, e, _) in turns {
        match out.last_mut() {
            Some(last) if *s <= last.1 => last.1 = last.1.max(*e),
            _ => out.push((*s, *e)),
        }
    }
    out
}

/// Số giả ngẫu nhiên tất định (LCG 64 bit), cho `--miss`.
struct Lcg(u64);

impl Lcg {
    fn next_f64(&mut self) -> f64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

#[derive(Debug, Default, PartialEq)]
pub(crate) struct Summary {
    lines: usize,
    correct: usize,
    wrong: usize,
    unnamed: usize,
    voices: usize,
    /// Đoạn đổi giọng sau `Assign` đầu (tách giọng).
    moved: usize,
}

/// Sự kiện theo thời gian; cùng thời điểm thì `Speech` trước, rồi đoạn, rồi lượt đọc.
#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum Ev {
    Speech(i64, i64),
    Segment(usize),
    Tick,
}

/// Chạy mô phỏng; trả nhãn cuối phiên của từng đoạn (giọng, tên) và tóm tắt.
pub(crate) fn simulate(
    args: &NamesEvalArgs,
    segments: &[CachedSegment],
    turns: &[Turn],
) -> Result<(Vec<Label>, Summary)> {
    const T0: u64 = 1_800_000_000_000;
    let app: MeetingApp = serde_json::from_value(serde_json::Value::String(args.app.clone()))
        .with_context(|| format!("--app {} không có", args.app))?;
    let mut cfg = SpeakerConfig {
        split: args.split,
        ..SpeakerConfig::default()
    };
    if let Some(v) = args.split_share {
        cfg.split_share = v;
    }
    if let Some(v) = args.split_min_ms {
        cfg.split_min_ms = v;
    }
    if let Some(v) = args.split_min_segments {
        cfg.split_min_segments = v;
    }
    if let Some(v) = args.split_max_cosine {
        cfg.split_max_cosine = v;
    }
    if let Err(field) = cfg.validate() {
        bail!("ngưỡng sai ở `{field}`");
    }
    let mut w = Worker::new(|_: &Path, _: Option<&str>| Ok(NoEmbed)).with_os(Os::Macos);
    let _ = w.handle(Request::Load {
        model_path: "-".into(),
        model_sha256: None,
        config: cfg,
        names: NamesSetup {
            enabled: true,
            recipe_json: speaker_recipe::BUILTIN_JSON.into(),
            eui_marker: None,
        },
    });
    let _ = w.handle_at(Request::SessionStart { unix_ms: T0 }, T0);
    let mut events: Vec<(i64, Ev)> = Vec::new();
    for (s, e) in speech_spans(turns) {
        events.push((e, Ev::Speech(s, e)));
    }
    for (i, seg) in segments.iter().enumerate() {
        events.push((seg.end_ms as i64 + 200, Ev::Segment(i)));
    }
    let last = segments
        .iter()
        .map(|s| s.end_ms as i64)
        .chain(turns.iter().map(|t| t.1))
        .max()
        .unwrap_or(0)
        + 5_000;
    let mut t = 0;
    while t < last {
        events.push((t, Ev::Tick));
        t += args.tick_ms;
    }
    events.sort();
    let speakers: BTreeSet<&str> = turns.iter().map(|t| t.2.as_str()).collect();
    let mut rng = Lcg(args.seed);
    let mut voice_of: Vec<Option<u32>> = vec![None; segments.len()];
    let mut names: BTreeMap<u32, Option<String>> = BTreeMap::new();
    let mut moved = 0;
    for (at, ev) in events {
        let replies = match ev {
            Ev::Speech(s, e) => {
                let _ = w.handle_at(
                    Request::Speech {
                        start_ms: s.max(0) as u64,
                        end_ms: e as u64,
                    },
                    T0 + e as u64,
                );
                Vec::new()
            }
            Ev::Segment(i) => {
                let s = &segments[i];
                w.segment_with(i as u64, s.start_ms, s.end_ms, Source::System, s.embedding.clone())
            }
            Ev::Tick => {
                let now: Vec<ParticipantNow> = speakers
                    .iter()
                    .map(|&spk| {
                        let on = turns
                            .iter()
                            .any(|(s, e, n)| n == spk && s + args.on_ms <= at && at < e + args.off_ms)
                            && rng.next_f64() >= args.miss;
                        ParticipantNow {
                            name: spk.to_string(),
                            is_self: false,
                            muted: None,
                            speaking: if on { 1.0 } else { 0.0 },
                            via: if on { Via::Indicator } else { Via::None },
                        }
                    })
                    .collect();
                w.observe_at(T0 + at as u64, args.tick_ms as u32, app, None, &now, &[])
            }
        };
        for r in replies {
            match r {
                Response::Assign { segment_id, voice, .. } => {
                    let i = segment_id as usize;
                    if voice_of[i].is_some() && voice_of[i] != voice {
                        moved += 1;
                    }
                    voice_of[i] = voice;
                }
                Response::Voices { voices, .. } => {
                    names = voices
                        .into_iter()
                        .map(|v| (v.voice, v.name.map(|n| n.as_str().to_string())))
                        .collect();
                }
                Response::Merged { from, into } => {
                    for v in voice_of.iter_mut().filter(|v| **v == Some(from)) {
                        *v = Some(into);
                    }
                }
                _ => {}
            }
        }
    }
    let labels: Vec<Label> = voice_of
        .iter()
        .map(|v| (*v, v.and_then(|v| names.get(&v).cloned().flatten())))
        .collect();
    let mut sum = Summary {
        voices: names.len(),
        moved,
        ..Summary::default()
    };
    for (seg, (_, name)) in segments.iter().zip(&labels) {
        let (s, e) = (seg.start_ms as i64, seg.end_ms as i64);
        if e - s < 1_000 {
            continue;
        }
        let Some(truth) = truth_of(turns, s, e) else { continue };
        if turns.iter().filter(|(_, te, n)| *n == truth && *te <= s).count() < 2 {
            continue;
        }
        sum.lines += 1;
        match name {
            Some(n) if *n == truth => sum.correct += 1,
            Some(_) => sum.wrong += 1,
            None => sum.unnamed += 1,
        }
    }
    Ok((labels, sum))
}

pub fn run(args: NamesEvalArgs) -> Result<()> {
    let segments = read_cache(&args.embeddings_in)?;
    let turns = read_rttm(&args.rttm)?;
    let (labels, sum) = simulate(&args, &segments, &turns)?;
    write_file(&args.out, "", |out| {
        for (seg, (voice, name)) in segments.iter().zip(&labels) {
            let truth = truth_of(&turns, seg.start_ms as i64, seg.end_ms as i64);
            writeln!(
                out,
                "{}",
                serde_json::json!({"start_ms": seg.start_ms, "end_ms": seg.end_ms, "voice": voice, "name": name, "truth": truth})
            )?;
        }
        Ok(())
    })?;
    let pct = |n: usize| {
        if sum.lines > 0 {
            n as f64 * 100.0 / sum.lines as f64
        } else {
            0.0
        }
    };
    // Ngưỡng in làm tròn 3 chữ số (f32 sang JSON ra 0.20000000298…), để ghép với tham số của lệnh gọi.
    let round = |v: Option<f32>| v.map(|v| (f64::from(v) * 1000.0).round() / 1000.0);
    println!(
        "{}",
        serde_json::json!({
            "file": args.embeddings_in.file_name().map(|f| f.to_string_lossy().into_owned()),
            "on_ms": args.on_ms, "miss": args.miss, "split": args.split,
            "split_share": round(args.split_share), "split_max_cosine": round(args.split_max_cosine),
            "lines": sum.lines, "correct_pct": pct(sum.correct), "wrong_pct": pct(sum.wrong),
            "unnamed_pct": pct(sum.unnamed), "voices": sum.voices, "moved": sum.moved,
        })
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args() -> NamesEvalArgs {
        NamesEvalArgs {
            embeddings_in: "x".into(),
            rttm: "x".into(),
            out: "x".into(),
            on_ms: 900,
            off_ms: 600,
            tick_ms: 250,
            miss: 0.0,
            seed: 1,
            app: "teams".into(),
            split: false,
            split_share: None,
            split_min_ms: None,
            split_min_segments: None,
            split_max_cosine: None,
        }
    }

    /// Hai người khác giọng nói luân phiên 4 s: sau khởi động (mỗi người ≥ 2 lượt) mọi dòng đúng tên.
    #[test]
    fn two_clear_speakers_are_named_right() {
        let (mut segments, mut turns) = (Vec::new(), Vec::new());
        for k in 0..10i64 {
            let (s, e) = (k * 5_000, k * 5_000 + 4_000);
            let (spk, emb) = if k % 2 == 0 {
                ("S1", vec![1.0, 0.0, 0.0])
            } else {
                ("S2", vec![0.0, 1.0, 0.0])
            };
            segments.push(CachedSegment {
                start_ms: s as u64,
                end_ms: e as u64,
                embedding: Some(emb),
                embed_ms: 0.0,
            });
            turns.push((s, e, spk.to_string()));
        }
        let (labels, sum) = simulate(&args(), &segments, &turns).unwrap();
        assert_eq!((sum.lines, sum.correct, sum.wrong, sum.voices), (6, 6, 0, 2));
        assert_eq!(labels[9], (Some(2), Some("S2".to_string())));
        let off = simulate(&NamesEvalArgs { miss: 1.0, ..args() }, &segments, &turns)
            .unwrap()
            .1;
        assert_eq!((off.correct, off.unnamed), (0, 6), "mất mọi lượt đọc: không tên nào");
    }

    #[test]
    fn rttm_turns_are_read_in_ms_and_sorted() {
        let dir = std::env::temp_dir().join(format!("names-eval-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.rttm");
        std::fs::write(
            &path,
            "SPEAKER a 1 2.50 1.00 <NA> <NA> S2 <NA> <NA>\nSPEAKER a 1 0.10 2.00 <NA> <NA> S1 <NA> <NA>\n",
        )
        .unwrap();
        assert_eq!(
            read_rttm(&path).unwrap(),
            [(100, 2_100, "S1".to_string()), (2_500, 3_500, "S2".to_string())]
        );
        assert_eq!(
            truth_of(&read_rttm(&path).unwrap(), 2_000, 3_000),
            Some("S2".to_string())
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
