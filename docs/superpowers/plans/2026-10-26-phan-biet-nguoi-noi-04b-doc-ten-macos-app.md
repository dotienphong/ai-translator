# Phân biệt người nói, kế hoạch 04b: ráp worker, đo tách giọng, bộ đọc tên macOS thật, pipeline, app, đo và thử thật

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Như kế hoạch 04: mọi thay đổi để ở working tree; mỗi Task kết thúc bằng "Mốc kiểm"; không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`; giữ nhánh `phan-biet-nguoi-noi`. Chỉ commit khi chủ dự án nói rõ.

**Goal:** ráp phần thuần của kế hoạch 04 (Task 0–9) vào `speaker-worker` (Task 10), đo và chốt ngưỡng tách giọng (Task 11), rồi nối với Accessibility thật của macOS, với pipeline (`Speech`, `SetNames`, `PauseNames`, mốc giờ, tên tới luồng phụ đề) và với app (tên tự động, người tham dự, dòng mời cấp quyền, công tắc "Lấy tên" giữa phiên, trả `AXEnhancedUserInterface` lúc mở app); đo không làm chậm phụ đề; các bước thử với Teams, Meet, Zoom thật do chủ dự án làm.

**Architecture, Tech Stack, Spec, Quy ước, Quyết định thiết kế:** như đầu file `2026-10-26-phan-biet-nguoi-noi-04-doc-ten-macos.md` (đọc file đó trước; số QĐ ở đây là số của file đó). File này là Task 10–21; chạy sau Task 9 của file 04. Số Task dùng chung cho hai file. Phủ spec, "Để kế hoạch sau", rủi ro, điều cần chủ dự án quyết của cả hai file ở cuối file 04.

**Dựa trên:** kế hoạch 04 Task 0–9 đã làm: giao thức phiên bản 2 (`PersonName`, `NamesSetup`, `Speech`, `SetNames`, `PauseNames`, `ReaderState`, `ReaderStatus::Paused`), crate `speaker-recipe` và `recipes.json` (chỉ Teams; Meet, Zoom tắt mặc định, chỉ có công thức riêng trong thư mục fixture cho test và `ax-record --recipe`, QĐ 16, 32), fixture ẩn danh (đã duyệt), `reader::{tree, extract}` (trait `Tree`, `Budget`, `Walk`, `sample_round`, `sample_tile`, `TileSample` có `slot`), `names::{track (`quiet_at`), clock, matcher (`SplitRule`), split, calibrate}`, `OnlineClusterer::split`.

---

### Task 10: Ráp vào worker (phiên, vòng sự kiện, khung của luồng đọc)

**Files:**
- Modify: `crates/speaker-worker/src/reader/mod.rs` (thay cả file)
- Modify: `crates/speaker-worker/src/session.rs` (thay phần không phải test: từ dòng 1 tới hết `impl<E: Embed> Worker<E>`, ngay trước `#[cfg(test)]`; sửa và thêm test)
- Modify: `crates/speaker-worker/src/main.rs` (thay cả file)
- Modify: `crates/speaker-worker/tests/worker_process.rs` (`ReaderPlatform::Unsupported` → `speaker_worker::reader::PLATFORM`; thêm một test)

- [ ] **Step 1: Khung của bộ đọc (`reader/mod.rs`)**

Thay cả `crates/speaker-worker/src/reader/mod.rs`:

```rust
//! Bộ đọc tên người nói từ app họp (spec 2026-10-26-phan-biet-nguoi-noi §6.1–§6.2, §6.8): luồng riêng lấy mẫu cây giao diện của
//! cửa sổ họp và gửi [`Sample`] cho luồng chính của worker; mọi logic theo thời gian nằm ở `names` (QĐ 1 của kế hoạch 04). Chỉ
//! đọc; không bấm, không gõ gì trong app họp. Luồng chính điều khiển qua [`Control`] (đọc hay nghỉ, nhịp, ứng viên tự hiệu chỉnh).

pub mod extract;
pub mod tree;

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use speaker_protocol::{MeetingApp, ReaderPlatform, ReaderStatus};
use speaker_recipe::Recipes;

use extract::TileSample;

/// Bộ đọc mà bản worker này có (`Ready.reader_platform`). Windows: kế hoạch 05.
pub const PLATFORM: ReaderPlatform = if cfg!(target_os = "macos") { ReaderPlatform::MacOs } else { ReaderPlatform::Unsupported };
/// Nhịp đọc (spec §6.2, QĐ 13): 1 lần/giây; 4 lần/giây khi máy có tiếng và đang cần gán tên.
pub const SLOW: Duration = Duration::from_millis(1_000);
pub const FAST: Duration = Duration::from_millis(250);
/// Lượt đầy đủ (duyệt cửa sổ, tìm ô và neo) mỗi chừng này, hay ngay khi một ô không còn đọc được.
pub const FULL_EVERY: Duration = Duration::from_millis(3_000);
/// Quét tiến trình tìm app họp (spec §6.1).
pub const SCAN_EVERY: Duration = Duration::from_millis(2_000);

/// Điều luồng chính muốn ở bộ đọc.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ControlState {
    /// Đọc tên ("Lấy tên" bật, không tạm dừng vì quá tải); tắt thì bộ đọc trả `AXEnhancedUserInterface`, gửi một mẫu `Off` rồi ngủ
    /// tới khi trạng thái đổi (QĐ 27).
    pub enabled: bool,
    /// Nhịp 4 lần/giây.
    pub fast: bool,
    /// Đọc ứng viên tự hiệu chỉnh (`TileSample::candidates`): khi đang tìm, hay khi đã học được chỉ báo (để theo chỉ báo đó).
    pub calibrate: bool,
}

#[derive(Default)]
struct Shared {
    state: ControlState,
    stop: bool,
}

/// Trạng thái chung giữa luồng chính và luồng đọc (QĐ 27): luồng đọc ngủ bằng [`Control::wait`] và chỉ thức khi tới lượt, khi
/// trạng thái đổi hay khi dừng; không thức định kỳ để xét cờ.
#[derive(Default)]
pub struct Control {
    shared: Mutex<Shared>,
    changed: Condvar,
}

impl Control {
    fn lock(&self) -> MutexGuard<'_, Shared> {
        self.shared.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Đặt trạng thái; chỉ đánh thức luồng đọc khi trạng thái đổi.
    pub fn set(&self, s: ControlState) {
        let mut g = self.lock();
        if g.state != s {
            g.state = s;
            self.changed.notify_all();
        }
    }

    pub fn get(&self) -> ControlState {
        self.lock().state
    }

    /// Worker sắp thoát: bộ đọc trả `AXEnhancedUserInterface` rồi dừng.
    pub fn stop(&self) {
        self.lock().stop = true;
        self.changed.notify_all();
    }

    pub fn stopped(&self) -> bool {
        self.lock().stop
    }

    /// Ngủ tới `until` (`None`: không hạn) hay tới khi trạng thái khác `seen`. Trả trạng thái lúc thức; `None` khi đã dừng.
    pub fn wait(&self, seen: ControlState, until: Option<Instant>) -> Option<ControlState> {
        let mut g = self.lock();
        loop {
            if g.stop {
                return None;
            }
            if g.state != seen {
                return Some(g.state);
            }
            match until {
                None => g = self.changed.wait(g).unwrap_or_else(PoisonError::into_inner),
                Some(u) => {
                    let now = Instant::now();
                    if now >= u {
                        return Some(g.state);
                    }
                    g = self.changed.wait_timeout(g, u - now).unwrap_or_else(PoisonError::into_inner).0;
                }
            }
        }
    }
}

/// Chờ tới lượt đọc kế (QĐ 13, 27): `c` là trạng thái của lượt vừa đọc, `started` lúc lượt đó bắt đầu. Đổi `fast`/`calibrate` giữa
/// chừng chỉ tính lại hạn theo nhịp mới, không đọc ngay (rà soát lần 2 B-N-B: mười lần đổi liền không thành mười lượt); bật lại hay
/// tắt "Lấy tên" thì thức ngay (bật: đọc; tắt: trả EUI). Trả trạng thái cho lượt kế; `None` khi dừng.
pub fn next_turn(control: &Control, mut c: ControlState, started: Instant) -> Option<ControlState> {
    loop {
        let until = c.enabled.then(|| started + if c.fast { FAST } else { SLOW });
        let next = control.wait(c, until)?;
        if next == c || next.enabled != c.enabled {
            return Some(next);
        }
        c = next;
    }
}

/// Thứ bộ đọc cần: công thức đã kiểm, file dấu `AXEnhancedUserInterface` (QĐ 8).
pub struct ReaderSetup {
    pub recipes: Arc<Recipes>,
    pub eui_marker: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pass {
    /// Không đọc cây (nghỉ, không có app họp, chưa có quyền).
    Idle,
    Full,
    Fast,
}

/// Một lượt đọc. `status` là `Ok` khi có cửa sổ họp (dù chưa tìm thấy ô nào).
#[derive(Clone, Debug)]
pub struct Sample {
    pub at_unix_ms: u64,
    /// Từ lượt trước tới lượt này.
    pub period_ms: u32,
    pub status: ReaderStatus,
    pub app: Option<MeetingApp>,
    pub app_version: Option<String>,
    pub tiles: Vec<TileSample>,
    pub pass: Pass,
    /// Thời gian của lượt và số phần tử đã đọc (log, đo ngân sách §6.2).
    pub pass_ms: f32,
    pub elements: u32,
}

/// Nơi luồng đọc gửi mẫu; `false` khi luồng chính đã thôi nhận (worker thoát).
pub type SampleSink = Box<dyn FnMut(Sample) -> bool + Send>;

/// Chạy bộ đọc trên luồng riêng. Bộ đọc Accessibility của macOS nối ở kế hoạch 04 Task 12; tới đó, và trên nền tảng chưa có bộ
/// đọc, không chạy gì (`None`).
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, sink: SampleSink) -> Option<std::thread::JoinHandle<()>> {
    let _ = (setup, control, sink);
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// QĐ 27 (rà soát B-Q4): luồng đọc ngủ tới hạn hay tới khi trạng thái đổi; "Lấy tên" tắt thì ngủ không hạn, thức ngay khi bật
    /// lại hay khi worker dừng.
    #[test]
    fn the_reader_sleeps_until_its_turn_a_change_or_stop() {
        let c = Arc::new(Control::default());
        let off = c.get();
        assert_eq!(c.wait(off, Some(Instant::now() + Duration::from_millis(20))), Some(off), "tới hạn, không đổi");
        let waiter = {
            let c = c.clone();
            std::thread::spawn(move || c.wait(off, None))
        };
        let on = ControlState { enabled: true, ..off };
        c.set(on);
        assert_eq!(waiter.join().unwrap(), Some(on), "đổi trạng thái đánh thức luồng đang ngủ không hạn");
        let waiter = {
            let c = c.clone();
            std::thread::spawn(move || c.wait(on, None))
        };
        c.stop();
        assert_eq!(waiter.join().unwrap(), None);
        assert!(c.stopped());
    }

    /// Rà soát lần 2 B-N-B: đổi `fast`/`calibrate` mười lần trong khoảng 220 ms (nhịp 1 lượt/giây) không làm thêm lượt nào: chỉ tính
    /// lại hạn. Cũ (thức mỗi lần đổi): ≥ 10 lượt.
    #[test]
    fn state_changes_reschedule_without_extra_passes() {
        let c = Arc::new(Control::default());
        let on = ControlState {
            enabled: true,
            fast: false,
            calibrate: false,
        };
        c.set(on);
        let reader = {
            let c = c.clone();
            std::thread::spawn(move || {
                let (mut turns, mut s) = (0, on);
                while let Some(next) = next_turn(&c, s, Instant::now()) {
                    s = next;
                    turns += 1;
                }
                turns
            })
        };
        for k in 0..10 {
            c.set(ControlState { calibrate: k % 2 == 0, ..on });
            std::thread::sleep(Duration::from_millis(22));
        }
        c.stop();
        let turns = reader.join().unwrap();
        assert!(turns <= 1, "{turns} lượt");
    }

    /// Bật lại "Lấy tên" thì đọc ngay, không chờ hết nhịp.
    #[test]
    fn turning_names_on_reads_at_once() {
        let c = Arc::new(Control::default());
        let off = c.get();
        let on = ControlState { enabled: true, ..off };
        let setter = {
            let c = c.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(20));
                c.set(on);
            })
        };
        let t0 = Instant::now();
        assert_eq!(next_turn(&c, off, t0), Some(on));
        assert!(t0.elapsed() < Duration::from_millis(500), "{:?}", t0.elapsed());
        setter.join().unwrap();
    }
}
```

- [ ] **Step 2: Viết test đỏ cho phiên**

Trong `crates/speaker-worker/src/session.rs`, mod `tests`:
- closure `ready` trong test `load_reports_whether_the_model_is_usable` (Task 1 đã thêm `reader_platform: ReaderPlatform::Unsupported,` vào đó): thành `reader_platform: crate::reader::PLATFORM,`;
- thêm sau `use speaker_protocol::NamesSetup;` (Task 1):

```rust
    use crate::reader::extract::TileSample;
    use crate::reader::{ControlState, PLATFORM, Pass, Sample};
    use speaker_protocol::{MeetingApp, NameSource, PersonName, ReaderStatus};
    use speaker_recipe::Os;

    const T0: u64 = 1_800_000_000_000;

    fn names_on() -> NamesSetup {
        NamesSetup {
            enabled: true,
            recipe_json: speaker_recipe::BUILTIN_JSON.into(),
            eui_marker: None,
        }
    }

    fn named_worker(config: SpeakerConfig) -> Worker<Fake> {
        let (w, _) = worker();
        let mut w = w.with_os(Os::Macos);
        replies(w.handle(Request::Load {
            model_path: "/m/tot.onnx".into(),
            model_sha256: None,
            config,
            names: names_on(),
        }));
        replies(w.handle_at(Request::SessionStart { unix_ms: T0 }, T0));
        w
    }

    /// Đoạn `id` [start, end) ms của phiên, PCM toàn giá trị `value` (100 → A, 50 → D của bộ nhúng giả: cosine 0,8).
    fn seg_at(id: u64, start: u64, end: u64, value: i16) -> Request {
        Request::Segment(SegmentAudio {
            segment_id: id,
            start_ms: start,
            end_ms: end,
            source: Source::System,
            pcm: vec![value; ((end - start) as usize * 16).min(MAX_EMBED_SAMPLES)],
        })
    }

    fn teams(at: u64, people: &[(&str, bool)]) -> Sample {
        Sample {
            at_unix_ms: T0 + at,
            period_ms: 250,
            status: ReaderStatus::Ok,
            app: Some(MeetingApp::Teams),
            app_version: Some("26276".into()),
            tiles: people
                .iter()
                .map(|&(name, on)| TileSample {
                    name: name.into(),
                    is_self: false,
                    muted: Some(!on),
                    label_speaking: false,
                    anchors: vec![on.then_some(1)],
                    candidates: vec![],
                    slot: 0,
                })
                .collect(),
            pass: Pass::Fast,
            pass_ms: 1.0,
            elements: 4,
        }
    }

    /// Lượt đọc mỗi 250 ms trong [from, to) ms của phiên; khung "đang nói" của Teams trễ 900 ms so với lúc nói.
    fn read(w: &mut Worker<Fake>, from: u64, to: u64, talks: &[(&str, &[(u64, u64)])], out: &mut Vec<Response>) {
        let mut t = from;
        while t < to {
            let people: Vec<(&str, bool)> =
                talks.iter().map(|&(n, ts)| (n, ts.iter().any(|&(s, e)| s + 900 <= t && t < e + 900))).collect();
            out.extend(w.sample(teams(t, &people)));
            t += 250;
        }
    }

    fn last_voices(out: &[Response]) -> (Vec<VoiceInfo>, Vec<PersonName>) {
        out.iter()
            .rev()
            .find_map(|r| match r {
                Response::Voices { voices, participants } => Some((voices.clone(), participants.clone())),
                _ => None,
            })
            .unwrap()
    }

    const LAN: &[(u64, u64)] = &[(0, 4_000), (10_000, 14_000)];

    fn named_lan() -> (Worker<Fake>, Vec<Response>) {
        let mut w = named_worker(SpeakerConfig::default());
        let mut out = Vec::new();
        out.extend(replies(w.handle(seg_at(0, 0, 4_000, 100))));
        read(&mut w, 0, 6_000, &[("Lan", LAN), ("Minh", &[])], &mut out);
        assert!(last_voices(&out).0[0].name.is_none(), "một đoạn chưa đủ (spec §6.6)");
        out.extend(replies(w.handle(seg_at(1, 10_000, 14_000, 100))));
        read(&mut w, 6_000, 16_000, &[("Lan", LAN), ("Minh", &[])], &mut out);
        (w, out)
    }

    #[test]
    fn names_come_with_voices_once_the_evidence_is_enough() {
        let (_, out) = named_lan();
        let (voices, participants) = last_voices(&out);
        assert_eq!(voices[0].name, PersonName::new("Lan"));
        assert_eq!((voices[0].name_source, voices[0].room_index), (Some(NameSource::Indicator), None));
        assert_eq!(participants, [PersonName::new("Lan").unwrap(), PersonName::new("Minh").unwrap()]);
        let states: Vec<ReaderStatus> = out
            .iter()
            .filter_map(|r| match r {
                Response::ReaderState { state, recipe_version, .. } => {
                    assert_eq!(*recipe_version, 1);
                    Some(*state)
                }
                _ => None,
            })
            .collect();
        assert_eq!(states, [ReaderStatus::Ok], "trạng thái chỉ gửi khi đổi");
    }

    #[test]
    fn turning_names_off_clears_them_and_reports_off() {
        let (mut w, _) = named_lan();
        let r = replies(w.handle(Request::SetNames { enabled: false }));
        assert!(r.iter().any(|x| matches!(x, Response::ReaderState { state: ReaderStatus::Off, app: None, .. })));
        let (voices, participants) = last_voices(&r);
        assert!(voices[0].name.is_none() && participants.is_empty());
        assert!(w.sample(teams(20_000, &[("Lan", true)])).is_empty(), "tắt thì bỏ mẫu");
        assert!(!w.control_state(T0 + 20_000).enabled);
        assert!(replies(w.handle(Request::SetNames { enabled: true })).is_empty());
        assert!(w.control_state(T0 + 20_000).enabled);
    }

    /// QĐ 15 (rà soát B-Q3): tạm dừng vì quá tải giữ tên đã chốt, báo `Paused`, bỏ mẫu mới, bộ đọc nghỉ; bật lại "Lấy tên" không bỏ
    /// tạm dừng; tắt "Lấy tên" sau đó vẫn xóa tên.
    #[test]
    fn pausing_keeps_the_names_and_ignores_new_samples() {
        let (mut w, _) = named_lan();
        let r = replies(w.handle(Request::PauseNames));
        assert!(r.iter().any(|x| matches!(x, Response::ReaderState { state: ReaderStatus::Paused, .. })));
        assert!(!r.iter().any(|x| matches!(x, Response::Voices { .. })), "tên giữ nguyên: không gửi lại Voices");
        assert!(w.sample(teams(20_000, &[("Minh", true)])).is_empty(), "tạm dừng thì bỏ mẫu");
        assert!(w.summary().contains("1 giọng có tên"), "{}", w.summary());
        assert!(!w.control_state(T0 + 20_000).enabled, "bộ đọc nghỉ");
        assert!(replies(w.handle(Request::SetNames { enabled: true })).is_empty());
        assert!(!w.control_state(T0 + 20_000).enabled, "bật lại \"Lấy tên\" không bỏ tạm dừng");
        let r = replies(w.handle(Request::SetNames { enabled: false }));
        assert!(last_voices(&r).0[0].name.is_none(), "tắt \"Lấy tên\" vẫn xóa tên");
    }

    /// QĐ 30 (rà soát B-N10): `Speech` dài hơn 600 s (nhạc, phòng ồn) được cắt còn 600 s cuối, không bị bỏ: nhịp đọc và mốc giờ vẫn
    /// theo.
    #[test]
    fn a_very_long_speech_span_is_clipped_not_dropped() {
        let mut w = named_worker(SpeakerConfig::default());
        replies(w.handle(seg_at(0, 696_000, 700_000, 100)));
        replies(w.handle_at(Request::Speech { start_ms: 0, end_ms: 700_000 }, T0 + 700_010));
        assert!(w.control_state(T0 + 700_100).fast, "có tiếng, giọng 1 chưa có tên");
    }

    #[test]
    fn reader_states_are_sent_only_when_they_change() {
        let mut w = named_worker(SpeakerConfig::default());
        let s = |status| Sample {
            status,
            tiles: vec![],
            ..teams(0, &[])
        };
        let count = |r: Vec<Response>| r.iter().filter(|x| matches!(x, Response::ReaderState { .. })).count();
        assert_eq!(count(w.sample(s(ReaderStatus::Off))), 0, "mẫu Off của luồng đọc đang nghỉ không tới app (QĐ 31)");
        assert_eq!(count(w.sample(s(ReaderStatus::NoPermission))), 1);
        assert_eq!(count(w.sample(s(ReaderStatus::NoPermission))), 0);
        assert_eq!(count(w.sample(s(ReaderStatus::NoMeeting))), 1);
        assert_eq!(count(w.sample(s(ReaderStatus::Ok))), 1, "cửa sổ họp không có ô: NoNames");
    }

    /// Spec §5.3, QĐ 10: hai người giống giọng (A, D) gộp một giọng, tên xen kẽ: các đoạn của Minh chuyển sang giọng mới (gửi lại
    /// `Assign`), mỗi giọng một tên.
    #[test]
    fn a_merged_voice_is_split_by_the_names_when_enabled() {
        let mut w = named_worker(SpeakerConfig {
            split: true,
            ..SpeakerConfig::default()
        });
        let lan: &[(u64, u64)] = &[(0, 4_000), (10_000, 14_000), (20_000, 24_000)];
        let minh: &[(u64, u64)] = &[(5_000, 9_000), (15_000, 19_000), (25_000, 29_000)];
        let mut turns: Vec<(u64, u64, i16)> =
            lan.iter().map(|&(s, e)| (s, e, 100)).chain(minh.iter().map(|&(s, e)| (s, e, 50))).collect();
        turns.sort();
        let mut out = Vec::new();
        let mut t = 0;
        for (id, &(s, e, value)) in turns.iter().enumerate() {
            read(&mut w, t, s, &[("Lan", lan), ("Minh", minh)], &mut out);
            out.extend(replies(w.handle(seg_at(id as u64, s, e, value))));
            t = s;
        }
        read(&mut w, t, 31_000, &[("Lan", lan), ("Minh", minh)], &mut out);
        let moved: Vec<u64> = out
            .iter()
            .filter_map(|r| match r {
                Response::Assign {
                    segment_id,
                    voice: Some(2),
                    confidence,
                } if *confidence == 0.0 => Some(*segment_id),
                _ => None,
            })
            .collect();
        assert_eq!(moved, [1, 3, 5], "các đoạn của Minh sang giọng mới");
        let (voices, _) = last_voices(&out);
        let named: Vec<(u32, Option<&str>)> = voices.iter().map(|v| (v.voice, v.name.as_ref().map(|n| n.as_str()))).collect();
        assert_eq!(named, [(1, Some("Lan")), (2, Some("Minh"))]);
        assert!(w.summary().contains("1 lần tách"), "{}", w.summary());
    }

    #[test]
    fn the_reader_goes_fast_only_while_speech_needs_a_name() {
        let mut w = named_worker(SpeakerConfig::default());
        replies(w.handle(seg_at(0, 0, 4_000, 100)));
        assert_eq!(
            w.control_state(T0 + 4_000),
            ControlState {
                enabled: true,
                fast: false,
                calibrate: false
            },
            "máy chưa có tiếng"
        );
        replies(w.handle_at(Request::Speech { start_ms: 3_000, end_ms: 4_000 }, T0 + 4_010));
        assert!(w.control_state(T0 + 4_500).fast, "có tiếng, giọng 1 chưa có tên");
        assert!(!w.control_state(T0 + 6_000).fast, "im quá 1,5 s");
    }

    #[test]
    fn ready_reports_the_reader_and_a_broken_recipe_turns_names_off() {
        let (w, _) = worker();
        let mut w = w.with_os(Os::Macos);
        let load = |names| Request::Load {
            model_path: "/m/tot.onnx".into(),
            model_sha256: None,
            config: SpeakerConfig::default(),
            names,
        };
        let ready = replies(w.handle(load(names_on())));
        assert!(matches!(ready[0], Response::Ready { reader_platform, .. } if reader_platform == PLATFORM));
        assert_eq!(w.reader_setup().is_some(), PLATFORM != ReaderPlatform::Unsupported);
        replies(w.handle(load(NamesSetup {
            recipe_json: "{".into(),
            ..names_on()
        })));
        assert!(w.reader_setup().is_none(), "công thức hỏng: không đọc tên");
        assert!(replies(w.handle(Request::SetNames { enabled: true })).is_empty());
        assert!(!w.control_state(T0).enabled);
    }
```

- [ ] **Step 3: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- session:: 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`with_os`, `handle_at`, `sample`, `control_state`, `reader_setup` chưa có).

- [ ] **Step 4: Viết mã của phiên**

Thay `crates/speaker-worker/src/session.rs` từ dòng 1 tới hết `impl<E: Embed> Worker<E>` (dòng 247; giữ nguyên mod `tests` đã sửa ở Step 2) bằng:

```rust
//! Trạng thái của `speaker-worker` trong một lần chạy (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §4.2, §5, §6): nhận yêu cầu và
//! mẫu của bộ đọc tên, trả phản hồi. Không I/O: `main.rs` đọc, ghi khung và chạy luồng đọc; test gọi thẳng [`Worker::handle`],
//! [`Worker::sample`] với bộ nhúng giả và mẫu giả.
//!
//! - `Load`: kiểm cấu hình (sai thì dùng mặc định), nạp model; model hỏng thì `Ready { model_ok: false }`, worker vẫn sống. Phần
//!   tên: kiểm công thức; hỏng thì không đọc tên (log lý do, không có chữ của app họp).
//! - `SessionStart`: xóa mọi giọng, mọi tên; mốc giờ mới.
//! - `Segment`: thời lượng cho phân cụm là `end_ms − start_ms`; worker nhúng PCM app gửi (tối đa `MAX_EMBED_SAMPLES`, A2 §5.2);
//!   đoạn ngắn hơn `min_embed_ms` hay PCM ít hơn `MIN_SAMPLES` mẫu thì không nhúng. Rồi ghép tên, tách giọng bị gộp (§5.3). Trả
//!   `Assign` (kèm `Assign` của đoạn cũ khi tách), `Merged`, rồi `Voices` khi giọng, cờ trong phòng, tên hay người tham dự đổi.
//! - `Speech`: tiếng nói của máy (tự hiệu chỉnh, nhịp đọc, mốc giờ; khoảng quá 600 s được cắt). `SetNames`: bật, tắt đọc tên (tắt
//!   thì xóa tên). `PauseNames`: tạm dừng vì quá tải, giữ tên đã chốt.
//! - [`Worker::sample`]: tín hiệu "đang nói", ghép tên, `ReaderState` khi trạng thái đổi.
//! - Nhúng, tâm giọng, tên chỉ nằm trong RAM, mất khi `SessionStart` hay khi worker thoát (§5.6). Log (stderr) chỉ có số đếm,
//!   thời gian và loại lỗi; không có âm thanh hay tên người.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use speaker_protocol::{
    ErrorKind, MAX_APP_VERSION_BYTES, MAX_EMBED_SAMPLES, MAX_PARTICIPANTS_ON_WIRE, MAX_SEGMENT_MS, MeetingApp,
    NamesSetup, PROTOCOL_VERSION, PersonName, ReaderPlatform, ReaderStatus, Request, Response, SegmentAudio, Source,
    SpeakerConfig, VoiceInfo, f32_from_pcm,
};
use speaker_recipe::{AppRecipe, Os, Recipes, SignalKind};

use crate::cluster::OnlineClusterer;
use crate::embed::{Embedder, MIN_SAMPLES};
use crate::names::calibrate::Calibrator;
use crate::names::clock::Clock;
use crate::names::matcher::{KEEP_SPEAKING_MS, NameMatcher, SegRec, SplitRule};
use crate::names::track::{SpeakingTracker, quiet_at};
use crate::names::{ParticipantNow, Spans, split};
use crate::reader::extract::TileSample;
use crate::reader::{ControlState, PLATFORM, ReaderSetup, Sample};

/// Phần trăm thời lượng từ micro để một giọng là giọng trong phòng (spec §5.5).
pub const ROOM_MIC_PERCENT: u64 = 60;
/// Độ trễ của chỉ báo khi chưa biết app họp (như công thức Meet).
const DEFAULT_DELAY_MS: i64 = 800;
/// Máy có tiếng lâu chừng này mà không người ở xa nào "đang nói" hay mở mic thì trạng thái là `NoSpeaking` (spec §7.2).
const NO_SPEAKING_AFTER_MS: i64 = 20_000;
/// Máy có tiếng trong chừng này thì bộ đọc được đọc nhanh (QĐ 13).
const FAST_AFTER_SPEECH_MS: i64 = 1_500;
/// `Speech` dài hơn chừng này (VAD có tiếng liên tục: nhạc, phòng ồn) được cắt còn phần cuối dài chừng này (QĐ 30).
const MAX_SPEECH_SPAN_MS: u64 = 600_000;

/// Bộ nhúng mà [`Worker`] dùng: `Embedder` thật, hay bản giả trong test.
pub trait Embed {
    fn embed(&self, samples: &[f32]) -> Result<Vec<f32>>;
}

impl Embed for Embedder {
    fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
        Embedder::embed(self, samples)
    }
}

/// Thời lượng đã gán cho một giọng, và phần đến từ micro.
#[derive(Clone, Copy, Default)]
struct Tally {
    speech_ms: u64,
    mic_ms: u64,
}

impl Tally {
    fn room(&self) -> bool {
        self.speech_ms > 0 && self.mic_ms * 100 >= self.speech_ms * ROOM_MIC_PERCENT
    }
}

#[derive(Debug, PartialEq)]
pub enum Step {
    Reply(Vec<Response>),
    Exit,
}

/// Bộ nạp model: đường dẫn và SHA-256 app đã kiểm (`None`: không kiểm).
type Loader<E> = Box<dyn Fn(&Path, Option<&str>) -> Result<E>>;

/// Giọng (mã, trong phòng, tên, số phòng) và người tham dự: thứ để so xem có phải gửi `Voices` không.
type VoicesKey = (Vec<(u32, bool, Option<PersonName>, Option<u32>)>, Vec<PersonName>);

/// Phần đọc tên của một lần chạy (spec §6; kế hoạch 04). Chỉ trong RAM; phần của phiên xóa ở `SessionStart` (§5.6).
#[derive(Default)]
struct Names {
    /// Công thức hợp lệ app gửi trong `Load`; `None`: không đọc tên.
    recipes: Option<Arc<Recipes>>,
    eui_marker: Option<PathBuf>,
    enabled: bool,
    /// Tạm dừng vì quá tải (`PauseNames`, QĐ 15): giữ tên đã chốt, không đọc, không lập bằng chứng; hết khi phiên mới.
    paused: bool,
    clock: Clock,
    speech: Spans,
    matcher: NameMatcher,
    trackers: BTreeMap<MeetingApp, SpeakingTracker>,
    calibrator: Calibrator,
    app: Option<MeetingApp>,
    unexplained_ms: i64,
    /// `ReaderState` đã gửi lần cuối (app, phiên bản, trạng thái, số chỉ báo tự học).
    sent_state: Option<(Option<MeetingApp>, Option<String>, ReaderStatus, u32)>,
    splits: u32,
    split_at: BTreeMap<u32, i64>,
}

impl Names {
    /// Phiên mới: giữ công thức và công tắc, bỏ mọi thứ của phiên trước (cả tạm dừng: client tính quá tải theo phiên).
    fn new_session(&mut self, unix_ms: u64) {
        let (recipes, eui_marker, enabled) = (self.recipes.take(), self.eui_marker.take(), self.enabled);
        *self = Names {
            recipes,
            eui_marker,
            enabled,
            ..Names::default()
        };
        self.clock.start(unix_ms);
    }
}

pub struct Worker<E> {
    load: Loader<E>,
    embedder: Option<E>,
    config: SpeakerConfig,
    clusterer: OnlineClusterer,
    tally: BTreeMap<u32, Tally>,
    segments: u64,
    embedded: u64,
    embed_errors: u64,
    embed_ms: f64,
    /// Hệ điều hành mà công thức áp dụng.
    os: Os,
    names: Names,
    /// `Voices` đã gửi lần cuối.
    sent: VoicesKey,
}

fn unix_now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

impl<E: Embed> Worker<E> {
    pub fn new(load: impl Fn(&Path, Option<&str>) -> Result<E> + 'static) -> Self {
        Self {
            load: Box::new(load),
            embedder: None,
            config: SpeakerConfig::default(),
            clusterer: OnlineClusterer::new(SpeakerConfig::default()),
            tally: BTreeMap::new(),
            segments: 0,
            embedded: 0,
            embed_errors: 0,
            embed_ms: 0.0,
            os: Os::current().unwrap_or(Os::Macos),
            names: Names::default(),
            sent: VoicesKey::default(),
        }
    }

    /// Hệ điều hành của công thức (test và công cụ đo chạy trên máy khác).
    pub fn with_os(mut self, os: Os) -> Self {
        self.os = os;
        self
    }

    pub fn config(&self) -> &SpeakerConfig {
        &self.config
    }

    pub fn handle(&mut self, request: Request) -> Step {
        self.handle_at(request, unix_now_ms())
    }

    /// Như [`Worker::handle`], với giờ hệ thống lúc nhận khung (`Speech` hiệu chỉnh mốc giờ, QĐ 12 của kế hoạch 04).
    pub fn handle_at(&mut self, request: Request, now_unix_ms: u64) -> Step {
        match request {
            Request::Load {
                model_path,
                model_sha256,
                config,
                names,
            } => {
                let ready = self.load(&model_path, model_sha256.as_deref(), config);
                self.configure_names(names);
                Step::Reply(vec![ready])
            }
            Request::SessionStart { unix_ms } => {
                self.reset();
                self.names.new_session(unix_ms);
                self.names.matcher.set_rule(SplitRule::from_config(&self.config));
                Step::Reply(Vec::new())
            }
            Request::Segment(seg) => Step::Reply(self.segment(seg)),
            Request::Speech { start_ms, end_ms } => {
                if end_ms > start_ms {
                    let start = start_ms.max(end_ms.saturating_sub(MAX_SPEECH_SPAN_MS));
                    self.names.speech.add(start as i64, end_ms as i64);
                    self.names.speech.prune(end_ms as i64 - KEEP_SPEAKING_MS);
                    self.names.clock.speech(end_ms, now_unix_ms);
                }
                Step::Reply(Vec::new())
            }
            Request::SetNames { enabled } => Step::Reply(self.set_names(enabled)),
            Request::PauseNames => Step::Reply(self.pause_names()),
            Request::Shutdown => Step::Exit,
        }
    }

    /// Một dòng cho log khi thoát: chỉ số đếm và thời gian.
    pub fn summary(&self) -> String {
        let avg = if self.embedded > 0 {
            self.embed_ms / self.embedded as f64
        } else {
            0.0
        };
        format!(
            "speaker-worker: {} đoạn, {} lần nhúng (lỗi {}), nhúng trung bình {avg:.1} ms, {} giọng còn sống; tên: {} giọng có tên, \
             {} người tham dự, {} lần tách, {} chỉ báo tự học",
            self.segments,
            self.embedded,
            self.embed_errors,
            self.clusterer.voice_count(),
            self.names.matcher.named_voices(),
            self.names.matcher.participants().len(),
            self.names.splits,
            self.names.calibrator.learned().len()
        )
    }

    fn load(&mut self, model_path: &str, model_sha256: Option<&str>, config: SpeakerConfig) -> Response {
        self.config = match config.validate() {
            Ok(()) => config,
            Err(field) => {
                eprintln!("speaker-worker: cấu hình nhận giọng sai ở `{field}`, dùng mặc định");
                SpeakerConfig::default()
            }
        };
        // Thả model cũ trước khi nạp model mới: RAM không giữ hai model cùng lúc.
        self.embedder = None;
        let t0 = Instant::now();
        self.embedder = match (self.load)(Path::new(model_path), model_sha256) {
            Ok(e) => {
                eprintln!("speaker-worker: nạp model xong trong {} ms", t0.elapsed().as_millis());
                Some(e)
            }
            Err(e) => {
                // Chỉ nguyên nhân gốc (không có đường dẫn, có thể chứa tên thư mục người dùng).
                eprintln!("speaker-worker: model nhúng giọng không dùng được: {}", e.root_cause());
                None
            }
        };
        self.reset();
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: self.embedder.is_some(),
            reader_platform: PLATFORM,
        }
    }

    /// Phần tên của `Load`: kiểm lại công thức app gửi (spec §4.2); hỏng thì không đọc tên.
    fn configure_names(&mut self, setup: NamesSetup) {
        let recipes = if setup.recipe_json.is_empty() {
            None
        } else {
            match speaker_recipe::parse(&setup.recipe_json) {
                Ok(r) => {
                    for why in &r.dropped {
                        eprintln!("speaker-worker: công thức đọc tên bỏ {why}");
                    }
                    Some(Arc::new(r))
                }
                Err(e) => {
                    eprintln!("speaker-worker: công thức đọc tên không dùng được: {e}");
                    None
                }
            }
        };
        let enabled = setup.enabled && recipes.is_some();
        self.names = Names {
            recipes,
            eui_marker: setup.eui_marker.map(PathBuf::from),
            enabled,
            ..Names::default()
        };
        self.names.matcher.set_rule(SplitRule::from_config(&self.config));
        self.sent = VoicesKey::default();
    }

    fn reset(&mut self) {
        self.clusterer = OnlineClusterer::new(self.config.clone());
        self.tally.clear();
        self.sent = VoicesKey::default();
    }

    fn set_names(&mut self, enabled: bool) -> Vec<Response> {
        let on = enabled && self.names.recipes.is_some();
        let mut out = Vec::new();
        if on == self.names.enabled {
            return out;
        }
        self.names.enabled = on;
        if !on {
            self.names.matcher.clear_names();
            self.names.calibrator = Calibrator::default();
            self.names.trackers.clear();
            self.names.unexplained_ms = 0;
            self.push_state(None, None, ReaderStatus::Off, &mut out);
        }
        self.push_voices_if_changed(&mut out);
        out
    }

    /// Tạm dừng vì quá tải (spec §11, QĐ 15): giữ tên đã chốt (không gửi lại `Voices`), ngừng đọc và lập bằng chứng; `Paused`.
    fn pause_names(&mut self) -> Vec<Response> {
        let mut out = Vec::new();
        if self.names.paused {
            return out;
        }
        self.names.paused = true;
        self.names.calibrator = Calibrator::default();
        self.names.trackers.clear();
        self.names.unexplained_ms = 0;
        if self.names.enabled {
            self.push_state(None, None, ReaderStatus::Paused, &mut out);
        }
        out
    }

    fn segment(&mut self, seg: SegmentAudio) -> Vec<Response> {
        let error = |kind, message: &str| {
            vec![Response::Error {
                segment_id: Some(seg.segment_id),
                kind,
                message: message.into(),
            }]
        };
        if self.embedder.is_none() {
            return error(ErrorKind::NotLoaded, "chưa nạp model");
        }
        if seg.end_ms < seg.start_ms || seg.end_ms - seg.start_ms > MAX_SEGMENT_MS || seg.pcm.len() > MAX_EMBED_SAMPLES
        {
            return error(ErrorKind::InvalidRequest, "đoạn sai (thời lượng hay số mẫu)");
        }
        self.segments += 1;
        let duration = seg.end_ms - seg.start_ms;
        let embedding = if duration >= self.config.min_embed_ms && seg.pcm.len() >= MIN_SAMPLES {
            let t0 = Instant::now();
            let result = self.embedder.as_ref().map(|e| e.embed(&f32_from_pcm(&seg.pcm)));
            match result {
                Some(Ok(v)) => {
                    self.embedded += 1;
                    self.embed_ms += t0.elapsed().as_secs_f64() * 1000.0;
                    Some(v)
                }
                Some(Err(e)) => {
                    self.embed_errors += 1;
                    if self.embed_errors <= 3 {
                        eprintln!("speaker-worker: nhúng lỗi: {}", e.root_cause());
                    }
                    None
                }
                None => None,
            }
        } else {
            None
        };
        self.segment_with(seg.segment_id, seg.start_ms, seg.end_ms, seg.source, embedding)
    }

    /// Phần sau nhúng của một đoạn: phân cụm, thời lượng, ghép tên, tách giọng. Công cụ đo (`latency-bench speaker-names-eval`) gọi
    /// thẳng với nhúng đã lưu.
    pub fn segment_with(
        &mut self,
        segment_id: u64,
        start_ms: u64,
        end_ms: u64,
        source: Source,
        embedding: Option<Vec<f32>>,
    ) -> Vec<Response> {
        let duration = end_ms.saturating_sub(start_ms);
        let a = self.clusterer.assign(duration, embedding.as_deref());
        for &(from, into) in &a.merged {
            if let Some(t) = self.tally.remove(&from) {
                let k = self.tally.entry(into).or_default();
                k.speech_ms = k.speech_ms.saturating_add(t.speech_ms);
                k.mic_ms = k.mic_ms.saturating_add(t.mic_ms);
            }
            self.names.matcher.merged(from, into);
        }
        if let Some(v) = a.voice {
            let t = self.tally.entry(v).or_default();
            t.speech_ms = t.speech_ms.saturating_add(duration);
            if source == Source::Mic {
                t.mic_ms = t.mic_ms.saturating_add(duration);
            }
        }
        let mut out = vec![Response::Assign {
            segment_id,
            voice: a.voice,
            confidence: a.confidence,
        }];
        out.extend(a.merged.iter().map(|&(from, into)| Response::Merged { from, into }));
        if self.names.enabled
            && !self.names.paused
            && let Some(v) = a.voice
        {
            self.names.matcher.segment(SegRec::new(
                segment_id,
                start_ms as i64,
                end_ms as i64,
                Some(v),
                source == Source::Mic,
                embedding,
                a.updated,
            ));
        }
        self.settle_names(&mut out);
        self.push_voices_if_changed(&mut out);
        out
    }

    fn room(&self) -> BTreeSet<u32> {
        self.tally.iter().filter(|(_, t)| t.room()).map(|(v, _)| *v).collect()
    }

    fn recipe(&self, app: MeetingApp) -> Option<&AppRecipe> {
        self.names.recipes.as_deref()?.app(self.os, app)
    }

    fn delay_ms(&self) -> i64 {
        self.names.app.and_then(|a| self.recipe(a)).map_or(DEFAULT_DELAY_MS, |r| i64::from(r.delay_ms))
    }

    fn voices(&self) -> Vec<VoiceInfo> {
        let named = if self.names.enabled { self.names.matcher.names() } else { BTreeMap::new() };
        self.clusterer
            .voice_ids()
            .into_iter()
            .map(|voice| {
                let t = self.tally.get(&voice).copied().unwrap_or_default();
                let mut info = VoiceInfo::new(voice, t.speech_ms, t.room());
                if let Some(n) = named.get(&voice) {
                    info.name = PersonName::new(n.name.clone());
                    info.name_source = info.name.is_some().then_some(n.source);
                    info.room_index = info.name.as_ref().and(n.room_index);
                }
                info
            })
            .collect()
    }

    fn participants(&self) -> Vec<PersonName> {
        if !self.names.enabled {
            return Vec::new();
        }
        self.names
            .matcher
            .participants()
            .into_iter()
            .filter_map(PersonName::new)
            .take(MAX_PARTICIPANTS_ON_WIRE)
            .collect()
    }

    fn push_voices_if_changed(&mut self, out: &mut Vec<Response>) {
        let (voices, participants) = (self.voices(), self.participants());
        let key: VoicesKey = (
            voices.iter().map(|v| (v.voice, v.mic, v.name.clone(), v.room_index)).collect(),
            participants.clone(),
        );
        if key != self.sent {
            self.sent = key;
            out.push(Response::Voices { voices, participants });
        }
    }

    fn move_tally(&mut self, from: u32, into: u32, ms: u64, mic: bool) {
        if let Some(t) = self.tally.get_mut(&from) {
            t.speech_ms = t.speech_ms.saturating_sub(ms);
            if mic {
                t.mic_ms = t.mic_ms.saturating_sub(ms);
            }
        }
        let t = self.tally.entry(into).or_default();
        t.speech_ms = t.speech_ms.saturating_add(ms);
        if mic {
            t.mic_ms = t.mic_ms.saturating_add(ms);
        }
    }

    /// Lập bằng chứng cho các đoạn đã đủ dấu "đang nói", gán lại tên, và tách một giọng bị gộp nếu có (spec §5.3, QĐ 10).
    fn settle_names(&mut self, out: &mut Vec<Response>) {
        if !self.names.enabled || self.names.paused {
            return;
        }
        let room = self.room();
        let delay = self.delay_ms();
        self.names.matcher.settle(delay, &self.names.speech, &room);
        if self.names.splits >= split::MAX_SPLITS {
            return;
        }
        let now = self.names.matcher.last_obs_ms().unwrap_or(0);
        let cooling: BTreeSet<u32> = self
            .names
            .split_at
            .iter()
            .filter(|&(_, &t)| now - t < split::SPLIT_COOLDOWN_MS)
            .map(|(&v, _)| v)
            .collect();
        let Some(plan) = split::find_split(&self.names.matcher, &self.config, &room, &cooling) else { return };
        let moved: Vec<(u64, Vec<f32>, bool)> = self
            .names
            .matcher
            .records()
            .filter(|s| plan.segments.contains(&s.id))
            .filter_map(|s| s.embedding.clone().map(|e| (s.dur() as u64, e, s.contributed)))
            .collect();
        let members: Vec<(u64, &[f32], bool)> = moved.iter().map(|(ms, e, c)| (*ms, e.as_slice(), *c)).collect();
        let Some(new) = self.clusterer.split(plan.voice, &members) else { return };
        self.names.splits += 1;
        self.names.split_at.insert(plan.voice, now);
        self.names.split_at.insert(new, now);
        eprintln!(
            "speaker-worker: tách một giọng bị gộp theo tên ({} đoạn sang giọng mới)",
            plan.segments.len()
        );
        let info: Vec<(u64, u64, bool)> = self
            .names
            .matcher
            .records()
            .filter(|s| plan.segments.contains(&s.id))
            .map(|s| (s.id, s.dur() as u64, s.mic))
            .collect();
        for (id, ms, mic) in info {
            self.names.matcher.relabel(id, new);
            self.move_tally(plan.voice, new, ms, mic);
            out.push(Response::Assign {
                segment_id: id,
                voice: Some(new),
                confidence: 0.0,
            });
        }
        self.names.matcher.settle(delay, &self.names.speech, &room);
    }

    fn push_state(&mut self, app: Option<MeetingApp>, version: Option<String>, state: ReaderStatus, out: &mut Vec<Response>) {
        let recipe_version = self.names.recipes.as_ref().map_or(0, |r| r.version);
        let learned = self.names.calibrator.learned().len() as u32;
        let version = version.filter(|v| v.len() <= MAX_APP_VERSION_BYTES);
        let key = (app, version.clone(), state, learned);
        if self.names.sent_state.as_ref() == Some(&key) {
            return;
        }
        // Một dòng log khi trạng thái đổi (không có tên người): đo và thử thật đọc được trạng thái bộ đọc (rà soát B-N4).
        eprintln!("speaker-worker: bộ đọc: {state:?}, app {app:?}, {learned} chỉ báo tự học");
        self.names.sent_state = Some(key);
        out.push(Response::ReaderState {
            app,
            app_version: version,
            state,
            recipe_version,
            learned,
        });
    }

    /// Một lượt đọc đã có tín hiệu "đang nói" của từng người (từ [`Worker::sample`], hay dựng sẵn ở công cụ đo
    /// `speaker-names-eval`): tự hiệu chỉnh, ghép tên, trạng thái.
    pub fn observe_at(
        &mut self,
        at_unix_ms: u64,
        period_ms: u32,
        app: MeetingApp,
        app_version: Option<String>,
        now: &[ParticipantNow],
        tiles: &[TileSample],
    ) -> Vec<Response> {
        let mut out = Vec::new();
        if !self.names.enabled || self.names.paused {
            return out;
        }
        let Some(at) = self.names.clock.to_session_ms(at_unix_ms) else { return out };
        self.names.app = Some(app);
        let delay = self.delay_ms();
        let period = i64::from(period_ms);
        let explained = now.iter().any(|p| !p.is_self && p.speaking > 0.5);
        self.names.calibrator.push(at, period, tiles, explained, &self.names.speech);
        self.names.matcher.observe(at, period, delay, now);
        let mic_open = now.iter().any(|p| !p.is_self && p.muted == Some(false));
        if explained || mic_open {
            self.names.unexplained_ms = 0;
        } else if self.names.speech.covers(at - delay) {
            self.names.unexplained_ms += period.min(1_000);
        }
        let status = if now.is_empty() {
            ReaderStatus::NoNames
        } else if self.names.unexplained_ms >= NO_SPEAKING_AFTER_MS {
            ReaderStatus::NoSpeaking
        } else {
            ReaderStatus::Ok
        };
        self.push_state(Some(app), app_version, status, &mut out);
        self.settle_names(&mut out);
        self.push_voices_if_changed(&mut out);
        out
    }

    /// Một mẫu của luồng đọc tên.
    pub fn sample(&mut self, s: Sample) -> Vec<Response> {
        let mut out = Vec::new();
        if !self.names.enabled || self.names.paused || s.status == ReaderStatus::Off {
            // Mẫu `Off` của luồng đọc chỉ nói nó đang nghỉ (trạng thái `Control` chưa tới, như lúc luồng mới chạy sau khi worker chạy
            // lại). `Off` gửi cho app chỉ do `SetNames(false)`: app xóa tên tự động khi nhận `Off` (QĐ 31).
            return out;
        }
        let (Some(app), ReaderStatus::Ok) = (s.app, s.status) else {
            self.push_state(s.app, s.app_version, s.status, &mut out);
            return out;
        };
        let Some(kinds) = self.recipe(app).map(|r| r.speaking.iter().map(|x| x.kind).collect::<Vec<SignalKind>>()) else {
            return out;
        };
        let Some(at) = self.names.clock.to_session_ms(s.at_unix_ms) else { return out };
        let delay = self.recipe(app).map_or(DEFAULT_DELAY_MS, |r| i64::from(r.delay_ms));
        let quiet = quiet_at(&self.names.speech, at, delay);
        let tracker = self.names.trackers.entry(app).or_insert_with(|| SpeakingTracker::new(kinds));
        let now = tracker.push(at, &s.tiles, self.names.calibrator.learned(), quiet);
        self.observe_at(s.at_unix_ms, s.period_ms, app, s.app_version, &now, &s.tiles)
    }

    /// Bộ đọc nên làm gì (luồng chính đặt vào `Control` sau mỗi việc, QĐ 13).
    pub fn control_state(&self, now_unix_ms: u64) -> ControlState {
        let enabled = self.names.enabled && !self.names.paused;
        let now = self.names.clock.to_session_ms(now_unix_ms);
        let talking = now.is_some_and(|t| self.names.speech.last_end().is_some_and(|e| t - e <= FAST_AFTER_SPEECH_MS));
        // Đọc nhanh khi đang tìm chỉ báo (có thời hạn, QĐ 11); đọc ứng viên khi đang tìm hay đã học được (để theo chỉ báo đó).
        let searching = self.names.calibrator.active();
        let learned = !self.names.calibrator.learned().is_empty();
        let needs = searching || now.is_some_and(|t| self.names.matcher.needs_names(t, &self.room()));
        ControlState {
            enabled,
            fast: enabled && talking && needs,
            calibrate: enabled && (searching || learned),
        }
    }

    /// Thứ để chạy luồng đọc: chỉ khi đọc tên bật, có công thức, và bản worker có bộ đọc.
    pub fn reader_setup(&self) -> Option<ReaderSetup> {
        let recipes = self.names.recipes.clone()?;
        (self.names.enabled && PLATFORM != ReaderPlatform::Unsupported).then(|| ReaderSetup {
            recipes,
            eui_marker: self.names.eui_marker.clone(),
        })
    }
}
```

Lưu ý: `voice_key` và hàm `voices` cũ (dòng 158–180 trước đây) đã được thay; `Request::Speech`/`SetNames` của Task 1 nay có thân thật.

- [ ] **Step 5: Vòng sự kiện của worker (`main.rs`)**

Thay cả `crates/speaker-worker/src/main.rs`:

```rust
//! Tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1): đọc `Request` từ stdin (một luồng riêng), nhận mẫu
//! của bộ đọc tên (luồng riêng, kế hoạch 04), xử lý mọi việc trên một luồng chính và ghi `Response` ra stdout. stdout chỉ dùng cho
//! khung giao thức (`platform::protocol_stdout`). Khung hỏng hay lỗi ghi làm worker thoát với mã 1; app tự khởi động lại. Không có
//! mã mạng (CI kiểm cây phụ thuộc, kế hoạch 02b).

use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::sync::Arc;
use std::sync::mpsc::{self, TrySendError};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use speaker_protocol::{PROTOCOL_VERSION, Request, read_frame, write_frame};
use speaker_worker::embed::Embedder;
use speaker_worker::platform;
use speaker_worker::reader::{self, Control, Sample};
use speaker_worker::session::{Step, Worker};

/// Stack của luồng chính (nhúng giọng chạy trên luồng này): phòng xa cho Windows, nơi luồng chính chỉ có 1 MiB.
const STACK_BYTES: usize = 16 << 20;
/// Chờ luồng đọc tên trả `AXEnhancedUserInterface` khi worker thoát (QĐ 8); quá thì thoát luôn, dấu trong file còn đó.
const READER_EXIT_WAIT: Duration = Duration::from_secs(1);
/// Kênh sự kiện của luồng chính có giới hạn (QĐ 29): luồng stdin chờ khi đầy (áp lực ngược tới hàng ghi của app như trước); mẫu của
/// bộ đọc gửi bằng `try_send`, đầy thì bỏ.
const EVENT_QUEUE: usize = 32;

/// Việc tới luồng chính.
enum Event {
    /// Khung của app, kèm giờ hệ thống lúc đọc xong.
    Request(Request, u64),
    /// stdin đóng ở ranh giới khung.
    Closed,
    /// Khung hỏng.
    Broken(String),
    Sample(Sample),
}

fn unix_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

fn main() -> Result<()> {
    // Việc đầu tiên trên Windows: chỉ nạp DLL từ thư mục app và System32.
    #[cfg(windows)]
    platform::harden_dll_search()?;
    // App luôn đặt `RAYON_NUM_THREADS=2` (spec §4.1). Thiếu biến, rỗng hay không phải số nguyên dương thì đặt lại 2.
    let threads_ok = std::env::var("RAYON_NUM_THREADS")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .is_some_and(|n| n > 0);
    if !threads_ok {
        // SAFETY: đầu `main`, chưa có luồng nào khác đọc hay ghi môi trường.
        unsafe { std::env::set_var("RAYON_NUM_THREADS", "2") };
    }
    let protocol = platform::protocol_stdout()?;
    // QĐ 26: app chép stderr của worker vào log; dòng này cho biết bản worker nói giao thức nào khi app thấy worker thoát trước `Ready`.
    eprintln!("speaker-worker: giao thức phiên bản {PROTOCOL_VERSION}");
    platform::lower_priority();
    platform::init_compute_pool().context("không dựng được bộ luồng tính toán")?;
    eprintln!("speaker-worker: {} luồng tính toán", rayon::current_num_threads());
    std::thread::Builder::new()
        .name("speaker-worker".into())
        .stack_size(STACK_BYTES)
        .spawn(move || serve(protocol))?
        .join()
        .map_err(|_| anyhow!("luồng chính của worker dừng bất thường"))?
}

fn serve(protocol: std::fs::File) -> Result<()> {
    platform::utility_qos_for_this_thread();
    let (tx, rx) = mpsc::sync_channel::<Event>(EVENT_QUEUE);
    let input = tx.clone();
    std::thread::Builder::new().name("speaker-stdin".into()).spawn(move || {
        let mut stdin = BufReader::new(std::io::stdin().lock());
        loop {
            let event = match read_frame::<_, Request>(&mut stdin) {
                Ok(Some(r)) => Event::Request(r, unix_ms()),
                Ok(None) => Event::Closed,
                Err(e) => Event::Broken(e.to_string()),
            };
            let last = !matches!(event, Event::Request(..));
            if input.send(event).is_err() || last {
                break;
            }
        }
    })?;
    let mut output = BufWriter::new(protocol);
    let mut worker = Worker::new(|path: &Path, sha256: Option<&str>| Embedder::load_checked(path, sha256));
    let control = Arc::new(Control::default());
    let mut reader: Option<JoinHandle<()>> = None;
    let outcome = loop {
        let Ok(event) = rx.recv() else { break Ok(()) };
        let replies = match event {
            Event::Request(request, at) => match worker.handle_at(request, at) {
                Step::Exit => break Ok(()),
                Step::Reply(r) => r,
            },
            Event::Sample(sample) => worker.sample(sample),
            Event::Closed => break Ok(()),
            Event::Broken(why) => break Err(anyhow!("khung từ app hỏng: {why}")),
        };
        if let Err(e) = replies.iter().try_for_each(|r| write_frame(&mut output, r)) {
            break Err(e.into());
        }
        if reader.is_none()
            && let Some(setup) = worker.reader_setup()
        {
            let samples = tx.clone();
            let sink = move |s| !matches!(samples.try_send(Event::Sample(s)), Err(TrySendError::Disconnected(_)));
            reader = reader::spawn(setup, control.clone(), Box::new(sink));
        }
        control.set(worker.control_state(unix_ms()));
    };
    control.stop();
    if let Some(handle) = reader {
        let since = Instant::now();
        while !handle.is_finished() && since.elapsed() < READER_EXIT_WAIT {
            std::thread::sleep(Duration::from_millis(10));
        }
        if handle.is_finished() {
            let _ = handle.join();
        }
    }
    eprintln!("{}", worker.summary());
    outcome
}
```

`crates/speaker-worker/tests/worker_process.rs`: thay ba chỗ `reader_platform: ReaderPlatform::Unsupported` (Task 1) bằng `reader_platform: speaker_worker::reader::PLATFORM`, bỏ `ReaderPlatform` khỏi `use`; thêm cuối file:

```rust
/// Kế hoạch 04: `Speech`, `SetNames`, `PauseNames` không có trả lời; khung kế tiếp sau chúng là `Assign` của đoạn. Worker in phiên
/// bản giao thức ra stderr lúc khởi động (QĐ 26).
#[test]
fn speech_set_names_and_pause_get_no_reply() {
    let dir = temp_dir("speech");
    let mut w = Worker::spawn();
    let model = synthetic_model(&dir);
    w.send(&Request::Load {
        model_path: model.display().to_string(),
        model_sha256: Some(sha256_hex(&model)),
        config: SpeakerConfig::default(),
        names: NamesSetup::off(),
    });
    assert!(matches!(w.recv(), Response::Ready { model_ok: true, .. }));
    w.send(&Request::SessionStart { unix_ms: 1 });
    w.send(&Request::Speech { start_ms: 0, end_ms: 512 });
    w.send(&Request::SetNames { enabled: true });
    w.send(&Request::PauseNames);
    w.send(&Request::Segment(SegmentAudio {
        segment_id: 4,
        start_ms: 0,
        end_ms: 2_000,
        source: Source::System,
        pcm: chirp(32_000),
    }));
    assert!(matches!(w.recv(), Response::Assign { segment_id: 4, .. }));
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(stderr.contains(&format!("giao thức phiên bản {}", speaker_protocol::PROTOCOL_VERSION)), "{stderr}");
    let _ = std::fs::remove_dir_all(&dir);
}
```

- [ ] **Step 6: Chạy, thấy xanh**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: lib: 65 test cũ cộng các test mới của Task 3–10 đều đạt (`session::` có 8 test mới, `reader::tests` 3); `worker_process`: 10 đạt. Nếu một test cũ của `session::` đỏ chỉ vì thứ tự hay số khung `Voices`, đọc lại `push_voices_if_changed` (khóa so gồm giọng, cờ trong phòng, tên, người tham dự; không gồm `speech_ms`), không sửa test cũ.

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1 && scripts/check-windows.sh 2>&1 | tail -2 && scripts/release/check-no-network.sh && git status --short`
Expected: fmt, clippy sạch; `scripts/check-windows.sh` (clippy chéo Windows) sạch: bộ đọc không có mã Windows, `PLATFORM` là `Unsupported`; không mã mạng. Không commit.

---
### Task 11: Đo và chốt ngưỡng tách giọng (`latency-bench speaker-names-eval`)

Spec §5.3: "ngưỡng và cách tách chốt ở kế hoạch 04 bằng dòng thời gian giả và bản ghi cây; không đạt thì giữ như hiện nay". Task
này chạy đúng phần ghép tên và tách giọng của `Worker` trên cache nhúng của kế hoạch 01 (AMI 4 bản ghi; tiếng Việt seed 0 và seed 1,
24 bản), với bộ đọc tên giả dựng từ RTTM (người nói thật = người tham dự cùng tên), ở ba độ trễ chỉ báo và hai mức mất lượt đọc.
Không cần model, không chạy app, không mở app họp.

**Files:**
- Create: `crates/latency-bench/src/names_eval.rs`
- Modify: `crates/latency-bench/src/main.rs` (dòng 1–3, 15, 25–45, 55–67), `crates/latency-bench/src/speaker_eval.rs` (dòng 150–156, 178, 217: `pub(crate)`), `crates/latency-bench/Cargo.toml` (thêm `speaker-recipe`)
- Modify (nếu đạt tiêu chí): `crates/speaker-protocol/src/lib.rs` (`SpeakerConfig::default`, test `the_default_config_is_the_one_chosen_in_plan_01_and_is_valid`)
- Create: `$B/results/04-ghep-ten.md`; dữ liệu thô ở `$DATA/out/04/` (ngoài repo)

- [ ] **Step 1: Viết test đỏ**

`crates/latency-bench/Cargo.toml`, sau dòng `speaker-worker = …`: `speaker-recipe = { path = "../speaker-recipe" }`.

`crates/latency-bench/src/speaker_eval.rs`: `struct CachedSegment` (dòng 151) thành `pub(crate) struct CachedSegment` với bốn trường `pub(crate)`; `fn read_cache` (dòng 178) thành `pub(crate) fn read_cache`; `fn write_file` (dòng 217) thành `pub(crate) fn write_file`.

`crates/latency-bench/src/main.rs`: thêm `mod names_eval;` (sau `mod mt_eval;`); trong `enum Command` thêm sau `SpeakerEval(…)`:

```rust
    /// Ghép tên và tách giọng của speaker-worker trên cache nhúng, với bộ đọc tên giả dựng từ RTTM (kế hoạch 04 Task 11).
    SpeakerNamesEval(names_eval::NamesEvalArgs),
```

và trong `match command` thêm `Command::SpeakerNamesEval(args) => names_eval::run(args),`; dòng 2 của chú thích đầu file thêm `` `speaker-names-eval` (ghép tên, tách giọng), ``.

`crates/latency-bench/src/names_eval.rs` (phần test; mã ở Step 3):

```rust
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
            let (spk, emb) = if k % 2 == 0 { ("S1", vec![1.0, 0.0, 0.0]) } else { ("S2", vec![0.0, 1.0, 0.0]) };
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
        let off = simulate(&NamesEvalArgs { miss: 1.0, ..args() }, &segments, &turns).unwrap().1;
        assert_eq!((off.correct, off.unnamed), (0, 6), "mất mọi lượt đọc: không tên nào");
    }

    #[test]
    fn rttm_turns_are_read_in_ms_and_sorted() {
        let dir = std::env::temp_dir().join(format!("names-eval-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.rttm");
        std::fs::write(&path, "SPEAKER a 1 2.50 1.00 <NA> <NA> S2 <NA> <NA>\nSPEAKER a 1 0.10 2.00 <NA> <NA> S1 <NA> <NA>\n").unwrap();
        assert_eq!(read_rttm(&path).unwrap(), [(100, 2_100, "S1".to_string()), (2_500, 3_500, "S2".to_string())]);
        assert_eq!(truth_of(&read_rttm(&path).unwrap(), 2_000, 3_000), Some("S2".to_string()));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p latency-bench -- names_eval 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`NamesEvalArgs`, `simulate` … chưa có).

- [ ] **Step 3: Viết mã**

`crates/latency-bench/src/names_eval.rs`, trước mod `tests`:

```rust
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

pub(crate) fn read_rttm(path: &Path) -> Result<Vec<Turn>> {
    let text = std::fs::read_to_string(path).with_context(|| format!("không đọc được {}", path.display()))?;
    let mut turns = Vec::new();
    for line in text.lines() {
        let p: Vec<&str> = line.split_whitespace().collect();
        if p.first() != Some(&"SPEAKER") || p.len() < 8 {
            continue;
        }
        let (s, d): (f64, f64) = (p[3].parse()?, p[4].parse()?);
        turns.push(((s * 1000.0).round() as i64, ((s + d) * 1000.0).round() as i64, p[7].to_string()));
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
    by.into_iter().max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(a.0))).map(|(n, _)| n.to_string())
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
        self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
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
) -> Result<(Vec<(Option<u32>, Option<String>)>, Summary)> {
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
    let last = segments.iter().map(|s| s.end_ms as i64).chain(turns.iter().map(|t| t.1)).max().unwrap_or(0) + 5_000;
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
                let _ = w.handle_at(Request::Speech { start_ms: s.max(0) as u64, end_ms: e as u64 }, T0 + e as u64);
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
                        let on = turns.iter().any(|(s, e, n)| n == spk && s + args.on_ms <= at && at < e + args.off_ms)
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
                    names = voices.into_iter().map(|v| (v.voice, v.name.map(|n| n.as_str().to_string()))).collect();
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
    let labels: Vec<(Option<u32>, Option<String>)> =
        voice_of.iter().map(|v| (*v, v.and_then(|v| names.get(&v).cloned().flatten()))).collect();
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
    let pct = |n: usize| if sum.lines > 0 { n as f64 * 100.0 / sum.lines as f64 } else { 0.0 };
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
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p latency-bench -- names_eval 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 2 passed`.

- [ ] **Step 5: Đo khi tắt tách giọng (mốc)** (build nặng: `--release`, kiểm đĩa 18 GiB)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release -p latency-bench 2>&1 | tail -1`
Expected: `Finished`.

Run (một lệnh, vài phút; không chạy song song lệnh nặng khác):

```sh
cd $W && LB=$W/target/release/latency-bench O=$DATA/out/04 PY="$DATA/venv/bin/python -I" && mkdir -p $O && : > $O/names.jsonl && : > $O/voices.jsonl &&
for f in $DATA/out/{ES2004a,TS3003a,IS1009a,EN2002a}.Mix-Headset $DATA/out/vi/cv-vi-0{1,2,3,4,5,6}{,-opus} $DATA/out/vi-seed1/cv-vi-0{1,2,3,4,5,6}{,-opus}; do
  set=$(basename $(dirname $f)); n=$(basename $f)
  for on in 600 900 1300; do for miss in 0 0.1; do
    j=$O/$set-$n-on$on-miss$miss-tat.jsonl
    $LB speaker-names-eval --embeddings-in $f.emb.json --rttm $f.rttm --on-ms $on --miss $miss --out $j | sed "s/^{/{\"set\":\"$set\",/" >> $O/names.jsonl
    echo "{\"set\":\"$set\",\"file\":\"$n\",\"on_ms\":$on,\"miss\":$miss,\"split\":false,\"score\":$($PY $B/score_spk.py $j $f.rttm)}" >> $O/voices.jsonl
  done; done
done && wc -l $O/names.jsonl $O/voices.jsonl
```

Expected: mỗi file 168 dòng (28 bản ghi × 3 độ trễ × 2 mức mất). Thiếu file cache nào (`không mở được cache nhúng`) thì dừng, báo chủ dự án (dữ liệu của kế hoạch 01 ở `$DATA/out/`). Kiểm nhanh: `line_1s` của mỗi bản ghi ở dòng `split:false` phải bằng số của `results/nhan-giong-ami.md` và `results/nhan-giong-tieng-viet.md` (θ = 0,35, không gộp; cùng cache): tách giọng tắt thì công cụ này chỉ thêm tên, không đổi giọng; lệch thì dừng, tìm lỗi trước khi đo tiếp.

- [ ] **Step 6: Lưới ngưỡng tách giọng trên phần chọn tham số**

Phần chọn tham số (dev): AMI `ES2004a`, `TS3003a`; tiếng Việt seed 0 hội thoại 01, 02 (bản thường và Opus); toàn bộ 12 bản seed 1 (gồm ba bản hỏng vì gộp: seed 1 04 Opus, 05, 05 Opus). Phần kiểm (chỉ báo cáo): AMI `IS1009a`, `EN2002a`; tiếng Việt seed 0 hội thoại 03–06 (bản thường và Opus; gồm bản hỏng seed 0 05 Opus). Như cách chia của kế hoạch 01.

```sh
cd $W && LB=$W/target/release/latency-bench O=$DATA/out/04 PY="$DATA/venv/bin/python -I" &&
for f in $DATA/out/{ES2004a,TS3003a}.Mix-Headset $DATA/out/vi/cv-vi-0{1,2}{,-opus} $DATA/out/vi-seed1/cv-vi-0{1,2,3,4,5,6}{,-opus}; do
  set=$(basename $(dirname $f)); n=$(basename $f)
  for share in 0.2 0.25 0.3; do for cos in 0.8 0.85 0.9; do
    j=$O/$set-$n-on900-miss0-tach-$share-$cos.jsonl
    $LB speaker-names-eval --embeddings-in $f.emb.json --rttm $f.rttm --on-ms 900 --split --split-share $share --split-max-cosine $cos --out $j | sed "s/^{/{\"set\":\"$set\",/" >> $O/names.jsonl
    echo "{\"set\":\"$set\",\"file\":\"$n\",\"on_ms\":900,\"miss\":0,\"split\":true,\"share\":$share,\"cos\":$cos,\"score\":$($PY $B/score_spk.py $j $f.rttm)}" >> $O/voices.jsonl
  done; done
done && tail -1 $O/voices.jsonl
```

Chọn bằng đoạn Python (in bảng, không ghi gì vào repo):

```sh
cd $W && python3 -I - "$DATA/out/04" <<'EOF'
import json, sys, collections
O = sys.argv[1]
V = [json.loads(l) for l in open(f"{O}/voices.jsonl")]
base = {(v["set"], v["file"]): v["score"]["line_1s"] for v in V if not v["split"] and v["on_ms"] == 900 and v["miss"] == 0}
N = [json.loads(l) for l in open(f"{O}/names.jsonl")]
wrong = {}
for n in N:
    if n["split"]:
        wrong[(n["set"], n["file"].replace(".emb.json", ""), n["split_share"], n["split_max_cosine"])] = n["wrong_pct"]
by = collections.defaultdict(list)
for v in V:
    if v["split"]:
        by[(v["share"], v["cos"])].append(v)
for (share, cos), rows in sorted(by.items()):
    d = [r["score"]["line_1s"] - base[(r["set"], r["file"])] for r in rows]
    w = max(wrong.get((r["set"], r["file"], share, cos), 0.0) for r in rows)
    ok = min(d) >= -0.01 and w <= 5.0
    print(f"share {share} cos {cos}: TB {sum(d)/len(d)*100:+.2f} điểm, tệ nhất {min(d)*100:+.2f}, tốt nhất {max(d)*100:+.2f}, sai tên lớn nhất {w:.1f}% {'ĐẠT' if ok else 'loại'}")
EOF
```

Expected: 9 dòng. Chọn cặp (share, cos) **ĐẠT** có mức tăng trung bình lớn nhất (bằng nhau thì share lớn hơn, cos nhỏ hơn: thận trọng hơn). Không cặp nào ĐẠT thì bỏ qua Step 7, ghi "không đạt" ở Step 8 và giữ `split = false`.

- [ ] **Step 7: Kiểm trên phần kiểm và độ bền**

Với cặp đã chọn (thay `$SHARE`, `$COS`), chạy trên **mọi** 28 bản ghi ở 3 độ trễ × 2 mức mất:

```sh
cd $W && SHARE=<số> COS=<số> LB=$W/target/release/latency-bench O=$DATA/out/04 PY="$DATA/venv/bin/python -I" &&
for f in $DATA/out/{ES2004a,TS3003a,IS1009a,EN2002a}.Mix-Headset $DATA/out/vi/cv-vi-0{1,2,3,4,5,6}{,-opus} $DATA/out/vi-seed1/cv-vi-0{1,2,3,4,5,6}{,-opus}; do
  set=$(basename $(dirname $f)); n=$(basename $f)
  for on in 600 900 1300; do for miss in 0 0.1; do
    j=$O/$set-$n-on$on-miss$miss-chon.jsonl
    $LB speaker-names-eval --embeddings-in $f.emb.json --rttm $f.rttm --on-ms $on --miss $miss --split --split-share $SHARE --split-max-cosine $COS --out $j | sed "s/^{/{\"set\":\"$set\",\"chosen\":true,/" >> $O/names.jsonl
    echo "{\"set\":\"$set\",\"file\":\"$n\",\"on_ms\":$on,\"miss\":$miss,\"split\":true,\"chosen\":true,\"score\":$($PY $B/score_spk.py $j $f.rttm)}" >> $O/voices.jsonl
  done; done
done
```

**Tiêu chí đặt `split = true` làm mặc định** (cả ba):
1. Bốn bản hỏng vì gộp (seed 0 05 Opus ở phần kiểm; seed 1 04 Opus, 05, 05 Opus): `line_1s` tăng ≥ 5 điểm so với tắt tách giọng ở độ trễ 900, mất 0, trên ≥ 3/4 bản, và phần đúng tên tăng.
2. Mọi bản khác, mọi độ trễ và mức mất: `line_1s` không giảm quá 1 điểm so với tắt ở cùng độ trễ, mức mất; sai tên ≤ 5%.
3. Không bản nào sai tên > 5% khi bật mà ≤ 5% khi tắt.

So bằng đoạn Python tương tự Step 6 (đổi điều kiện lọc sang `chosen`, ghép theo `(set, file, on_ms, miss)`); in từng bản ghi: `line_1s` tắt/bật, đúng tên, sai tên, chưa tên.

- [ ] **Step 8: Ghi kết quả, đặt mặc định**

Tạo `$B/results/04-ghep-ten.md` (tiếng Việt, theo mẫu các file `results/` khác): mục "Câu hỏi" (spec §5.3, §6.6), "Điều kiện" (máy, nhánh, lệnh, dữ liệu, cách chia dev/kiểm, mô phỏng: chỉ báo từ RTTM nên **không phải A-spk3**: A-spk3 đo bằng họp thật ở kế hoạch 07), "Số đo tín hiệu trên fixture" (bốn số Teams và số Meet của Task 5 Step 4), "Ghép tên khi tắt tách giọng" (bảng mỗi bản ghi kiểm: đúng tên, sai tên, chưa tên ở 600/900/1 300 ms, mất 0 và 0,1), "Lưới ngưỡng tách giọng" (9 dòng Step 6), "Kiểm" (bảng Step 7, ba tiêu chí, đạt hay không), "Kết luận cho spec" (ngưỡng chốt, hay "không đạt, giữ như hiện nay"), "Giới hạn" (chỉ báo giả lý tưởng: không nói chồng ngoài RTTM, không lệch mốc giờ, không đổi giao diện; dữ liệu giọng đọc sạch), "Chạy lại" (lệnh của Step 5–7). Mọi số lấy từ `$DATA/out/04/`, không làm tròn khác các file kết quả trước (một chữ số thập phân cho %).

Nếu **đạt** cả ba tiêu chí: trong `crates/speaker-protocol/src/lib.rs`, `SpeakerConfig::default()` đặt `split: true`, `split_share: <SHARE>`, `split_max_cosine: <COS>`; sửa bộ số trong test `the_default_config_is_the_one_chosen_in_plan_01_and_is_valid` (Task 1) cho khớp và chú thích của trường `split` thành "Mặc định chốt ở kế hoạch 04 Task 11 (`results/04-ghep-ten.md`)". Không đạt: giữ `split: false`, ghi lý do vào file kết quả và vào mục "Rủi ro" cuối file này.

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-protocol -p speaker-worker 2>&1 | grep -E "^test result|FAILED"`
Expected: mọi nhóm `ok` (test `names::split` dùng `split_on()` tường minh nên không phụ thuộc mặc định; test `room_voices_cooling_voices_and_the_default_config_never_split` dùng `SpeakerConfig::default()`: nếu mặc định thành `true` thì sửa câu kiểm cuối của test đó thành `SpeakerConfig { split: false, ..SpeakerConfig::default() }` và đổi chữ "mặc định tắt" thành "tắt").

- [ ] **Step 9: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p latency-bench -p speaker-protocol && cargo fmt -p latency-bench -p speaker-protocol -- --check && cargo clippy -p latency-bench -p speaker-protocol --all-targets -- -D warnings 2>&1 | tail -1 && grep -c "" $B/results/04-ghep-ten.md && git status --short`
Expected: sạch; file kết quả có nội dung; `git status` thêm `?? crates/latency-bench/src/names_eval.rs`, `?? bench/2026-10-26-nguoi-noi/results/04-ghep-ten.md`, ` M crates/latency-bench/…`. Không file nào trong `$W` chứa đường dẫn `$DATA` khai triển (`grep -rn "/Users/" bench/2026-10-26-nguoi-noi/results/04-ghep-ten.md` không ra gì). Không commit.

---
### Task 12: Bộ đọc Accessibility của macOS, dấu `AXEnhancedUserInterface`, công cụ `ax-record`

**Files:**
- Modify: `crates/speaker-worker/Cargo.toml` (thêm `core-foundation` cho macOS)
- Create: `crates/speaker-worker/src/reader/eui.rs`, `crates/speaker-worker/src/reader/macos.rs`, `crates/speaker-worker/src/bin/ax-record.rs`
- Modify: `crates/speaker-worker/src/reader/mod.rs` (khai báo module, nối `spawn`), `crates/speaker-worker/src/reader/extract.rs` (thêm `dump_lines`)
- Modify: `bench/2026-10-26-nguoi-noi/tro-nang/xen_ke.py` (chế độ `R1`, `R4` đo bộ đọc thật)

Không chạy bộ đọc này với app nào trên máy trong Task này (chỉ biên dịch và test phần thuần); chạy thật ở Task 19–21 **(cần chủ dự án)**.

- [ ] **Step 1: Phụ thuộc và test đỏ cho file dấu**

`crates/speaker-worker/Cargo.toml`, thêm cuối file:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
# Đọc cây Accessibility và gói app (bộ đọc tên, kế hoạch 04): CFString, CFArray, CFBundle. Cùng bản `Cargo.lock` và app đang dùng
# (Gõ dịch); bản mới nhất trên crates.io (`cargo search core-foundation`, 2026-10-27). Không có mã mạng.
core-foundation = "0.10.1"
```

`crates/speaker-worker/src/reader/mod.rs`: thêm sau `pub mod extract;`:

```rust
pub mod eui;
#[cfg(target_os = "macos")]
pub mod macos;
```

`crates/speaker-worker/src/reader/eui.rs` (phần test):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use speaker_protocol::MeetingApp;

    #[test]
    fn entries_are_added_once_and_the_file_goes_when_empty() {
        let dir = std::env::temp_dir().join(format!("eui-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("speaker-eui.json");
        let teams = EuiEntry { pid: 42, app: MeetingApp::Teams };
        let chrome = EuiEntry { pid: 7, app: MeetingApp::MeetChrome };
        assert!(read(&path).is_empty(), "chưa có file");
        add(&path, teams).unwrap();
        add(&path, teams).unwrap();
        add(&path, chrome).unwrap();
        assert_eq!(read(&path), [teams, chrome]);
        remove(&path, 42).unwrap();
        assert_eq!(read(&path), [chrome]);
        remove(&path, 7).unwrap();
        assert!(!path.exists(), "hết mục thì xóa file");
        std::fs::write(&path, b"{hong").unwrap();
        assert!(read(&path).is_empty(), "file hỏng: coi như không có");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Rà soát lần 2 B-N-D và lần 3: ba kết quả đọc. Đang bật: đặt lại; đọc được mà không phải bật: bỏ mục, không đặt gì (không đặt
    /// `false` lặp lại mỗi lần chạy, có thể tắt chế độ mà VoiceOver bật sau này); không đọc được (app họp treo quá hạn chờ, lỗi): giữ
    /// mục để lần sau thử lại, không đặt gì.
    #[test]
    fn eui_reads_decide_reset_drop_or_keep() {
        assert_eq!(step_for(EuiRead::On), EuiStep::Reset);
        assert_eq!(step_for(EuiRead::NotOn), EuiStep::Drop);
        assert_eq!(step_for(EuiRead::Unknown), EuiStep::Keep, "app treo quá hạn chờ: giữ mục");
        assert_eq!(EuiRead::from_value(Some(true)), EuiRead::On);
        assert_eq!(EuiRead::from_value(Some(false)), EuiRead::NotOn);
        assert_eq!(EuiRead::from_value(None), EuiRead::NotOn, "không có giá trị Boolean");
        assert!(reset_done(EuiRead::NotOn));
        assert!(!reset_done(EuiRead::On) && !reset_done(EuiRead::Unknown), "còn bật hay không đọc lại được: giữ mục");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader::eui 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`read`, `add`, `remove`, `EuiRead`, `step_for`, `reset_done` chưa có; `macos.rs` chưa có).

- [ ] **Step 3: File dấu**

`crates/speaker-worker/src/reader/eui.rs`, trước mod `tests`:

```rust
//! Dấu các app mà bộ đọc đã bật `AXEnhancedUserInterface` (spec §6.2, §6.8; QĐ 8 của kế hoạch 04): ghi trước khi bật, xóa sau khi
//! trả, để lần chạy sau (worker, hay app lúc mở) trả lại nếu worker bị giết giữa chừng. File JSON nhỏ (`EuiMarker` của giao thức),
//! ghi qua file tạm rồi đổi tên. Không có tên người; lỗi chỉ ghi loại lỗi (đường dẫn có tên thư mục người dùng).

use std::io;
use std::path::Path;

use speaker_protocol::{EuiEntry, EuiMarker};

/// Các mục trong file; không có file hay file hỏng thì rỗng.
pub fn read(path: &Path) -> Vec<EuiEntry> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<EuiMarker>(&b).ok())
        .map(|m| m.entries)
        .unwrap_or_default()
}

fn write(path: &Path, entries: &[EuiEntry]) -> io::Result<()> {
    if entries.is_empty() {
        return match std::fs::remove_file(path) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    let body = serde_json::to_vec(&EuiMarker {
        entries: entries.to_vec(),
    })
    .map_err(io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, body)?;
    std::fs::rename(&tmp, path)
}

pub fn add(path: &Path, entry: EuiEntry) -> io::Result<()> {
    let mut entries = read(path);
    if !entries.contains(&entry) {
        entries.push(entry);
    }
    write(path, &entries)
}

pub fn remove(path: &Path, pid: i32) -> io::Result<()> {
    let mut entries = read(path);
    entries.retain(|e| e.pid != pid);
    write(path, &entries)
}

/// Kết quả đọc `AXEnhancedUserInterface` của app trong một mục dấu (rà soát lần 3): đang bật; đọc được mà không phải bật (`false`,
/// hay không có giá trị Boolean); không đọc được (app họp treo quá hạn chờ 0,2 s, mã -25204, hay lỗi khác).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EuiRead {
    On,
    NotOn,
    Unknown,
}

impl EuiRead {
    /// Từ giá trị đã đọc được (`None`: không có giá trị Boolean).
    pub fn from_value(v: Option<bool>) -> Self {
        if v == Some(true) { Self::On } else { Self::NotOn }
    }
}

/// Việc với một mục dấu, theo lần đọc trước khi trả. App (`speaker::eui_macos`) dùng cùng luật.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EuiStep {
    /// Đang bật: đặt lại `false` rồi đọc lại ([`reset_done`]).
    Reset,
    /// Không phải bật: mục xong việc, bỏ khỏi dấu, không đặt gì.
    Drop,
    /// Không đọc được: giữ mục để lần sau thử lại, không đặt gì.
    Keep,
}

pub fn step_for(read: EuiRead) -> EuiStep {
    match read {
        EuiRead::On => EuiStep::Reset,
        EuiRead::NotOn => EuiStep::Drop,
        EuiRead::Unknown => EuiStep::Keep,
    }
}

/// Sau khi đặt `false`: đọc lại thấy không phải bật thì xong (bỏ mục); còn bật hay không đọc được thì giữ mục.
pub fn reset_done(after: EuiRead) -> bool {
    after == EuiRead::NotOn
}
```

Tạo tạm `crates/speaker-worker/src/reader/macos.rs` chỉ một dòng chú thích `//! Bộ đọc tên trên macOS (Step 5).` để biên dịch được.

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader::eui 2>&1 | grep -E "^test result|FAILED"`
Expected: `test result: ok. 2 passed`.

- [ ] **Step 4: `dump_lines` (ghi cây theo định dạng fixture), test đỏ rồi mã**

`reader/extract.rs`, cuối mod `tests`:

```rust
    /// `ax-record fixture` ghi đúng định dạng fixture: ghi rồi đọc lại cho cùng các ô.
    #[test]
    fn dumped_lines_read_back_to_the_same_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let snap = &fixture("teams-macos-people-closed.jsonl")[0];
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let title = tree.title(roots[0]).to_string();
        let lines = dump_lines(&mut tree, &roots[0], &title, app);
        assert!(lines[0].starts_with("0|AXWindow|AXStandardWindow|Meeting with "));
        let again = Snapshot { t: 0.0, lines };
        let names = |s: &Snapshot| tiles_of(s, app).1.into_iter().map(|t| (t.name, t.muted, t.anchors)).collect::<Vec<_>>();
        assert_eq!(names(&again), names(snap));
    }
```

Chạy `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader::extract::tests::dumped` thấy lỗi biên dịch (`dump_lines` chưa có), rồi thêm vào `reader/extract.rs` (trước mod `tests`):

```rust
/// Các dòng định dạng fixture (`độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp`) của một cửa sổ họp, cho công cụ
/// `ax-record fixture`: chỉ vùng web khi `web_only` (bên ngoài chỉ đọc vai trò), tối đa [`MAX_ELEMENTS`] dòng. **Có chữ của app
/// họp** (kể cả khung chat nếu đang mở): chỉ ghi vào `$DATA`, ẩn danh bằng `make_fixture.py` trước khi vào repo.
pub fn dump_lines<T: Tree>(t: &mut T, window: &T::Node, title: &str, app: &AppRecipe) -> Vec<String> {
    let mut out = vec![format!("0|AXWindow|AXStandardWindow|{}||||||", clean_field(title))];
    let mut stack: Vec<(T::Node, u32, bool)> =
        t.children(window).into_iter().rev().map(|c| (c, 1, !app.web_only)).collect();
    while let Some((n, depth, inside)) = stack.pop() {
        if out.len() >= MAX_ELEMENTS as usize {
            break;
        }
        if depth > MAX_DEPTH {
            continue;
        }
        if !inside {
            if t.role(&n).as_deref() == Some("AXWebArea") {
                let mut a = Attrs::default();
                if t.text(&n, &mut a) && app.window_title.iter().any(|re| re.is_match(&a.title)) {
                    a.role = "AXWebArea".into();
                    out.push(line(depth, &a));
                    stack.extend(t.children(&n).into_iter().rev().map(|c| (c, depth + 1, true)));
                }
                continue;
            }
            stack.extend(t.children(&n).into_iter().rev().map(|c| (c, depth + 1, false)));
            continue;
        }
        let Some(mut a) = t.shape(&n) else { continue };
        t.text(&n, &mut a);
        out.push(line(depth, &a));
        stack.extend(t.children(&n).into_iter().rev().map(|c| (c, depth + 1, true)));
    }
    out
}

fn clean_field(s: &str) -> String {
    s.chars().map(|c| if c == '|' || c.is_control() { ' ' } else { c }).take(300).collect()
}

fn line(depth: u32, a: &Attrs) -> String {
    format!(
        "{depth}|{}|{}|{}|{}|{}|{}||{}|{}",
        clean_field(&a.role),
        clean_field(&a.subrole),
        clean_field(&a.title),
        clean_field(&a.desc),
        clean_field(&a.value),
        clean_field(&a.ident),
        clean_field(&a.dom_id),
        clean_field(&a.classes.join(" "))
    )
}
```

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader::extract 2>&1 | grep -E "^test result|FAILED"`
Expected: `test result: ok. 12 passed` (11 của Task 4 cộng 1).

- [ ] **Step 5: Bộ đọc Accessibility (`reader/macos.rs`)**

Test thuần trước (cuối file, sau mã):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_main_process_of_an_app_points_at_its_bundle() {
        let teams = Path::new("/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams");
        assert_eq!(bundle_dir_of(teams), Some(Path::new("/Applications/Microsoft Teams.app")));
        let helper = Path::new(
            "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/1/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)",
        );
        assert!(bundle_dir_of(helper).unwrap().ends_with("Google Chrome Helper (Renderer).app"), "tiến trình phụ ra gói của nó (bundle id khác, bị bỏ)");
        assert_eq!(bundle_dir_of(Path::new("/usr/bin/say")), None);
        assert_eq!(bundle_dir_of(Path::new("/x/Tool.app/Contents/Resources/tool")), None);
    }

    /// Spec §6.1: chỉ app trong danh sách viết cứng (bundle id), không phụ thuộc tên thư mục.
    #[test]
    fn only_hard_coded_bundle_ids_are_meeting_apps() {
        assert_eq!(app_of_bundle_id("com.microsoft.teams2"), Some(MeetingApp::Teams));
        assert_eq!(app_of_bundle_id("com.google.Chrome"), Some(MeetingApp::MeetChrome));
        assert_eq!(app_of_bundle_id("com.google.Chrome.helper.renderer"), None);
        assert_eq!(app_of_bundle_id("com.apple.Safari"), None);
    }
}
```

Mã, thay cả `crates/speaker-worker/src/reader/macos.rs` (giữ mod `tests` trên ở cuối):

```rust
//! Bộ đọc tên trên macOS (spec 2026-10-26-phan-biet-nguoi-noi §6.1–§6.2, §6.7–§6.8; kế hoạch 04 Task 12). Quét tiến trình mỗi 2 s
//! tìm app họp trong danh sách viết cứng (bundle id); kiểm quyền Trợ năng (`AXIsProcessTrusted`: tiến trình con hưởng quyền của app,
//! `results/quyen-tro-nang.md`); đọc cây Accessibility của cửa sổ họp qua `ApplicationServices`; bật `AXEnhancedUserInterface` cho
//! Teams suốt phiên, cho Chrome, Edge khi có cửa sổ Meet (trả sau 30 s không còn cửa sổ Meet; spec §6.8; QĐ 8, 28 của kế hoạch 04).
//! Mỗi lệnh chờ tối đa 0,2 s, đặt một lần cho cả tiến trình ([`set_process_timeout`], QĐ 27). Một ngân sách (≤ 3 000 lệnh,
//! ≤ 30 ms) cho cả lượt đọc (QĐ 13). Chỉ đọc: không bấm, không gõ, không đổi gì khác trong app họp. Log chỉ có số đếm, thời gian,
//! trạng thái; không có tên người hay chữ của app họp.

use std::collections::HashMap;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use core_foundation::array::{CFArray, CFArrayRef};
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::bundle::{CFBundle, CFBundleGetIdentifier, CFBundleGetValueForInfoDictionaryKey};
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::url::CFURL;
use speaker_protocol::{EuiEntry, MeetingApp, ReaderStatus};
use speaker_recipe::{Attrs, Os, Recipes};

use super::extract::{Budget, MAX_ELEMENTS, PASS_BUDGET, TileRef, TileSample, Walk, dump_lines, is_meeting_window, sample_round};
use super::tree::Tree;
use super::{Control, ControlState, FULL_EVERY, Pass, ReaderSetup, SCAN_EVERY, Sample, SampleSink, eui, next_turn};

type AXError = i32;
const AX_SUCCESS: AXError = 0;
/// `kAXErrorCannotComplete`: app không trả lời trong hạn chờ.
const AX_CANNOT_COMPLETE: AXError = -25204;
/// Mỗi lệnh chờ tối đa chừng này (spec §6.2).
const AX_TIMEOUT_S: f32 = 0.2;
/// Hai cửa sổ họp mỗi app là đủ (spec §6.1).
const MAX_WINDOWS: usize = 2;
/// Chừng này lượt liền có lệnh không trả lời thì trạng thái là `Blocked`.
const BLOCKED_AFTER: u32 = 5;
/// Một dòng thống kê vào log mỗi chừng này.
const STATS_EVERY: Duration = Duration::from_secs(60);
/// Chữ đọc được cắt ở chừng này ký tự (như `axtrace`).
const MAX_TEXT_CHARS: usize = 300;
const SHAPE: [&str; 5] = ["AXRole", "AXSubrole", "AXIdentifier", "AXDOMIdentifier", "AXDOMClassList"];
const TEXT: [&str; 3] = ["AXTitle", "AXDescription", "AXValue"];
const EUI: &str = "AXEnhancedUserInterface";
/// Trình duyệt: trả `AXEnhancedUserInterface` sau chừng này không còn cửa sổ Meet (QĐ 28).
const BROWSER_EUI_IDLE: Duration = Duration::from_secs(30);

/// Thông tin một tiến trình đã quét: đường dẫn file chạy, app họp và phiên bản (nếu là app họp).
type ProcInfo = (PathBuf, Option<(MeetingApp, Option<String>)>);

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    /// Header trả `Boolean` (unsigned char), không phải `bool` của Rust (rà soát B-N5).
    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCreateSystemWide() -> CFTypeRef;
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: *mut CFTypeRef) -> AXError;
    fn AXUIElementCopyMultipleAttributeValues(
        element: CFTypeRef,
        attributes: CFArrayRef,
        options: u32,
        values: *mut CFArrayRef,
    ) -> AXError;
    fn AXUIElementSetAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: CFTypeRef) -> AXError;
    fn AXUIElementSetMessagingTimeout(element: CFTypeRef, timeout_seconds: f32) -> AXError;
}

fn unix_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// Tiến trình này (hay app cha mà nó hưởng quyền) có quyền Trợ năng.
pub fn trusted() -> bool {
    // SAFETY: hàm của ApplicationServices, không tham số.
    unsafe { AXIsProcessTrusted() != 0 }
}

/// Hạn chờ 0,2 s cho mọi lệnh Accessibility của cả tiến trình (spec §6.2, §10; QĐ 27): đặt trên phần tử hệ thống. Đặt trên phần tử
/// app chỉ áp cho chính phần tử đó, không cho cửa sổ và phần tử con (`AXUIElement.h`, rà soát B-Q1). Gọi một lần ở đầu luồng đọc và
/// đầu `ax-record`.
pub fn set_process_timeout() {
    // SAFETY: hàm tạo theo luật create; NULL khi lỗi.
    let r = unsafe { AXUIElementCreateSystemWide() };
    if r.is_null() {
        return;
    }
    // SAFETY: `r` là tham chiếu +1 vừa tạo; bọc để nhả khi ra khỏi hàm.
    let system = unsafe { CFType::wrap_under_create_rule(r) };
    // SAFETY: phần tử còn sống tới hết lời gọi.
    unsafe { AXUIElementSetMessagingTimeout(system.as_CFTypeRef(), AX_TIMEOUT_S) };
}

/// Một phần tử Accessibility (giữ tham chiếu).
#[derive(Clone)]
pub struct AxNode(CFType);

impl AxNode {
    fn app(pid: i32) -> Option<Self> {
        // SAFETY: hàm tạo theo luật create; NULL khi lỗi.
        let r = unsafe { AXUIElementCreateApplication(pid) };
        if r.is_null() {
            return None;
        }
        // SAFETY: `r` là tham chiếu +1 vừa tạo.
        let el = AxNode(unsafe { CFType::wrap_under_create_rule(r) });
        // SAFETY: phần tử còn sống; đặt thêm cho chính phần tử app (hạn chờ của cả tiến trình: `set_process_timeout`).
        unsafe { AXUIElementSetMessagingTimeout(el.0.as_CFTypeRef(), AX_TIMEOUT_S) };
        Some(el)
    }

    fn copy(&self, name: &'static str) -> Result<Option<CFType>, AXError> {
        let attr = CFString::from_static_string(name);
        let mut v: CFTypeRef = std::ptr::null();
        // SAFETY: phần tử và tên thuộc tính sống tới hết lời gọi; `v` theo luật copy (+1).
        let err = unsafe { AXUIElementCopyAttributeValue(self.0.as_CFTypeRef(), attr.as_concrete_TypeRef(), &mut v) };
        if err != AX_SUCCESS {
            return Err(err);
        }
        // SAFETY: `v` là tham chiếu +1 hay NULL.
        Ok((!v.is_null()).then(|| unsafe { CFType::wrap_under_create_rule(v) }))
    }

    fn string(&self, name: &'static str) -> Option<String> {
        self.copy(name).ok().flatten().map(|v| text_of(&Some(v)))
    }

    fn elements(&self, name: &'static str) -> Vec<AxNode> {
        let Some(v) = self.copy(name).ok().flatten() else { return Vec::new() };
        let Some(arr) = v.downcast::<CFArray<*const c_void>>() else { return Vec::new() };
        arr.get_all_values()
            .into_iter()
            .filter(|p| !p.is_null())
            // SAFETY: phần tử của mảng còn sống trong lúc giữ `arr`; bọc theo luật get (+1).
            .map(|p| AxNode(unsafe { CFType::wrap_under_get_rule(p) }))
            .collect()
    }

    /// Nhiều thuộc tính một lần (spec §6.2: `AXUIElementCopyMultipleAttributeValues`). Thuộc tính không có: giá trị lỗi, đọc ra rỗng.
    fn many(&self, names: &CFArray<CFString>) -> Result<Vec<Option<CFType>>, AXError> {
        let mut out: CFArrayRef = std::ptr::null();
        // SAFETY: như `copy`; `out` theo luật copy.
        let err = unsafe {
            AXUIElementCopyMultipleAttributeValues(self.0.as_CFTypeRef(), names.as_concrete_TypeRef(), 0, &mut out)
        };
        if err != AX_SUCCESS || out.is_null() {
            return Err(err);
        }
        // SAFETY: mảng +1 vừa nhận.
        let values: CFArray<*const c_void> = unsafe { CFArray::wrap_under_create_rule(out) };
        Ok(values
            .get_all_values()
            .into_iter()
            // SAFETY: như `elements`.
            .map(|p| (!p.is_null()).then(|| unsafe { CFType::wrap_under_get_rule(p) }))
            .collect())
    }

    fn get_bool(&self, name: &'static str) -> Option<bool> {
        self.copy(name).ok().flatten().and_then(|v| v.downcast::<CFBoolean>()).map(bool::from)
    }

    /// Đọc `AXEnhancedUserInterface`, phân biệt ba kết quả (rà soát lần 3): lỗi (gồm quá hạn chờ -25204 khi app họp treo) là
    /// `Unknown`, không gộp với "không phải bật".
    fn read_eui(&self) -> eui::EuiRead {
        match self.copy(EUI) {
            Ok(v) => eui::EuiRead::from_value(v.and_then(|v| v.downcast::<CFBoolean>()).map(bool::from)),
            Err(_) => eui::EuiRead::Unknown,
        }
    }

    fn set_bool(&self, name: &'static str, on: bool) {
        let attr = CFString::from_static_string(name);
        let v = if on { CFBoolean::true_value() } else { CFBoolean::false_value() };
        // SAFETY: phần tử, tên, giá trị sống tới hết lời gọi. Mã trả về không dùng: đặt `AXEnhancedUserInterface` trả -25208 dù giá
        // trị đã đổi (`results/teams-chrome.md`).
        unsafe { AXUIElementSetAttributeValue(self.0.as_CFTypeRef(), attr.as_concrete_TypeRef(), v.as_CFTypeRef()) };
    }
}

fn text_of(v: &Option<CFType>) -> String {
    v.as_ref()
        .and_then(|v| v.downcast::<CFString>())
        .map(|s| s.to_string().chars().take(MAX_TEXT_CHARS).collect())
        .unwrap_or_default()
}

fn classes_of(v: &Option<CFType>) -> Vec<String> {
    let Some(arr) = v.as_ref().and_then(|v| v.downcast::<CFArray<*const c_void>>()) else { return Vec::new() };
    arr.get_all_values()
        .into_iter()
        .take(32)
        .filter(|p| !p.is_null())
        // SAFETY: như `AxNode::elements`.
        .map(|p| unsafe { CFType::wrap_under_get_rule(p) })
        .filter_map(|v| v.downcast::<CFString>().map(|s| s.to_string()))
        .collect()
}

/// Cây Accessibility thật, qua trait [`Tree`] (cùng mã duyệt với fixture).
pub struct AxTree {
    shape_names: CFArray<CFString>,
    text_names: CFArray<CFString>,
    /// Số lần đọc trong lượt hiện tại (log, `Sample::elements`).
    pub reads: u32,
    /// Số lệnh không trả lời trong lượt hiện tại.
    pub timeouts: u32,
}

impl AxTree {
    pub fn new() -> Self {
        let names = |list: &[&'static str]| CFArray::from_CFTypes(&list.iter().map(|s| CFString::from_static_string(s)).collect::<Vec<_>>());
        Self {
            shape_names: names(&SHAPE),
            text_names: names(&TEXT),
            reads: 0,
            timeouts: 0,
        }
    }

    fn note<T>(&mut self, r: Result<T, AXError>) -> Option<T> {
        if r.as_ref().err() == Some(&AX_CANNOT_COMPLETE) {
            self.timeouts += 1;
        }
        r.ok()
    }
}

impl Default for AxTree {
    fn default() -> Self {
        Self::new()
    }
}

impl Tree for AxTree {
    type Node = AxNode;

    fn role(&mut self, n: &AxNode) -> Option<String> {
        self.reads += 1;
        let r = n.copy("AXRole");
        self.note(r).flatten().map(|v| text_of(&Some(v)))
    }

    fn shape(&mut self, n: &AxNode) -> Option<Attrs> {
        self.reads += 1;
        let r = n.many(&self.shape_names);
        let v = self.note(r)?;
        // Mảng ngắn hơn số thuộc tính (app trả sai) thì đọc ra rỗng, không đánh chỉ số ngoài mảng (rà soát B-N6).
        let at = |i: usize| v.get(i).cloned().flatten();
        Some(Attrs {
            role: text_of(&at(0)),
            subrole: text_of(&at(1)),
            ident: text_of(&at(2)),
            dom_id: text_of(&at(3)),
            classes: classes_of(&at(4)),
            ..Attrs::default()
        })
    }

    fn text(&mut self, n: &AxNode, a: &mut Attrs) -> bool {
        self.reads += 1;
        let r = n.many(&self.text_names);
        let Some(v) = self.note(r) else { return false };
        let at = |i: usize| v.get(i).cloned().flatten();
        a.title = text_of(&at(0));
        a.desc = text_of(&at(1));
        a.value = text_of(&at(2));
        true
    }

    fn children(&mut self, n: &AxNode) -> Vec<AxNode> {
        n.elements("AXChildren")
    }
}

/// `…/X.app/Contents/MacOS/X` → `…/X.app` (gói của tiến trình chính của app).
pub fn bundle_dir_of(exe: &Path) -> Option<&Path> {
    let macos = exe.parent()?;
    if macos.file_name()? != "MacOS" {
        return None;
    }
    let contents = macos.parent()?;
    if contents.file_name()? != "Contents" {
        return None;
    }
    let app = contents.parent()?;
    (app.extension()? == "app").then_some(app)
}

/// App họp của một bundle id (danh sách viết cứng, spec §6.1).
pub fn app_of_bundle_id(id: &str) -> Option<MeetingApp> {
    MeetingApp::ALL.into_iter().find(|a| a.macos_bundle_id() == id)
}

/// Bundle id và phiên bản (`CFBundleShortVersionString`, ≤ 32 ký tự) của một gói.
fn bundle_info(dir: &Path) -> Option<(String, Option<String>)> {
    let bundle = CFBundle::new(CFURL::from_path(dir, true)?)?;
    // SAFETY: luật get: chuỗi thuộc gói đang giữ; bọc thì giữ thêm một tham chiếu.
    let id = unsafe { CFBundleGetIdentifier(bundle.as_concrete_TypeRef()) };
    if id.is_null() {
        return None;
    }
    let id = unsafe { CFString::wrap_under_get_rule(id) }.to_string();
    let key = CFString::from_static_string("CFBundleShortVersionString");
    // SAFETY: như trên.
    let v = unsafe { CFBundleGetValueForInfoDictionaryKey(bundle.as_concrete_TypeRef(), key.as_concrete_TypeRef()) };
    let version = (!v.is_null())
        .then(|| unsafe { CFType::wrap_under_get_rule(v) })
        .and_then(|v| v.downcast::<CFString>())
        .map(|s| s.to_string().chars().take(32).collect());
    Some((id, version))
}

fn list_pids() -> Vec<i32> {
    // SAFETY: hỏi số tiến trình (bộ đệm rỗng).
    let n = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    if n <= 0 {
        return Vec::new();
    }
    let mut pids = vec![0i32; n as usize + 64];
    // SAFETY: bộ đệm đủ chỗ cho `pids.len()` số `pid_t`.
    let got = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), (pids.len() * size_of::<i32>()) as i32) };
    pids.truncate(got.max(0) as usize);
    pids.retain(|&p| p > 0);
    pids
}

fn pid_path(pid: i32) -> Option<PathBuf> {
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: bộ đệm đủ `PROC_PIDPATHINFO_MAXSIZE` byte.
    let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if len <= 0 {
        return None;
    }
    buf.truncate(len as usize);
    String::from_utf8(buf).ok().map(PathBuf::from)
}

/// App họp và phiên bản của tiến trình `pid` (chỉ tiến trình chính của gói).
fn identify(path: &Path) -> Option<(MeetingApp, Option<String>)> {
    let (id, version) = bundle_info(bundle_dir_of(path)?)?;
    Some((app_of_bundle_id(&id)?, version))
}

struct Window {
    node: AxNode,
    title: String,
    walk: Option<Walk<AxNode>>,
    tiles: Vec<TileRef<AxNode>>,
    last_full: Option<Instant>,
    stale: bool,
    /// Ô bắt đầu của lượt nhanh kế (xoay vòng khi hết ngân sách giữa chừng).
    next: usize,
}

struct Target {
    pid: i32,
    app: MeetingApp,
    version: Option<String>,
    windows: Vec<Window>,
}

#[derive(Default)]
struct Stats {
    full: Vec<f32>,
    fast: Vec<f32>,
    elements: Vec<u32>,
    since: Option<Instant>,
}

impl Stats {
    fn add(&mut self, pass: Pass, ms: f32, elements: u32) {
        match pass {
            Pass::Full => self.full.push(ms),
            Pass::Fast => self.fast.push(ms),
            Pass::Idle => return,
        }
        self.elements.push(elements);
        let since = *self.since.get_or_insert_with(Instant::now);
        if since.elapsed() >= STATS_EVERY {
            let q = |v: &mut Vec<f32>, p: f32| -> f32 {
                v.sort_by(f32::total_cmp);
                v.get(((v.len() as f32 - 1.0) * p).round().max(0.0) as usize).copied().unwrap_or(0.0)
            };
            self.elements.sort_unstable();
            let over = self.full.iter().chain(&self.fast).filter(|&&ms| ms > 30.0).count();
            eprintln!(
                "speaker-worker: bộ đọc: {} lượt đầy đủ (p50 {:.1} ms, p90 {:.1}, lớn nhất {:.1}), {} lượt nhanh (p50 {:.1} ms, p90 {:.1}, \
                 lớn nhất {:.1}), phần tử p90 {}, {over} lượt quá 30 ms",
                self.full.len(),
                q(&mut self.full, 0.5),
                q(&mut self.full, 0.9),
                q(&mut self.full, 1.0),
                self.fast.len(),
                q(&mut self.fast, 0.5),
                q(&mut self.fast, 0.9),
                q(&mut self.fast, 1.0),
                self.elements.get(self.elements.len() * 9 / 10).copied().unwrap_or(0)
            );
            *self = Stats::default();
        }
    }
}

/// Bộ đọc của một lần chạy worker (hay của `ax-record`).
pub struct LiveReader {
    recipes: Arc<Recipes>,
    marker: Option<PathBuf>,
    /// `ax-record`: chỉ đọc app này.
    only: Option<MeetingApp>,
    procs: HashMap<i32, ProcInfo>,
    /// App họp đang chạy (có công thức), theo thứ tự ưu tiên.
    running: Vec<(i32, MeetingApp, Option<String>)>,
    last_scan: Option<Instant>,
    target: Option<Target>,
    /// App mà chính bộ đọc đã bật `AXEnhancedUserInterface`.
    enhanced: Vec<EuiEntry>,
    /// Lần cuối thấy cửa sổ họp của từng pid (trả EUI của trình duyệt khi hết cửa sổ Meet, QĐ 28).
    meeting_seen: HashMap<i32, Instant>,
    /// Đã trả EUI còn sót của lần chạy trước (làm ở lượt đầu tiên có quyền, QĐ 28).
    restored: bool,
    tree: AxTree,
    failures: u32,
    stats: Stats,
}

impl LiveReader {
    pub fn new(recipes: Arc<Recipes>, marker: Option<PathBuf>, only: Option<MeetingApp>) -> Self {
        Self {
            recipes,
            marker,
            only,
            procs: HashMap::new(),
            running: Vec::new(),
            last_scan: None,
            target: None,
            enhanced: Vec::new(),
            meeting_seen: HashMap::new(),
            restored: false,
            tree: AxTree::new(),
            failures: 0,
            stats: Stats::default(),
        }
    }

    /// Trả `AXEnhancedUserInterface` còn sót từ lần chạy trước bị giết (file dấu, QĐ 8, 28). Chỉ khi có quyền Trợ năng (không có
    /// quyền thì lệnh đặt thất bại: giữ nguyên file dấu); chỉ bỏ khỏi dấu mục đã trả được hay mục mà pid không còn là đúng app.
    pub fn restore_leftovers(&mut self) {
        let Some(marker) = self.marker.clone() else { return };
        if !trusted() {
            return;
        }
        for entry in eui::read(&marker) {
            if !self.enhanced.contains(&entry) && reset_enhanced(entry) {
                let _ = eui::remove(&marker, entry.pid);
            }
        }
    }

    /// Trả mọi `AXEnhancedUserInterface` chính bộ đọc đã bật (tắt "Lấy tên", tạm dừng, dừng phiên, worker thoát). Mục trả không được
    /// (mất quyền giữa chừng) giữ trong file dấu cho lần sau.
    pub fn release_all(&mut self) {
        for entry in std::mem::take(&mut self.enhanced) {
            if reset_enhanced(entry)
                && let Some(m) = &self.marker
            {
                let _ = eui::remove(m, entry.pid);
            }
        }
        self.meeting_seen.clear();
        self.target = None;
    }

    /// Trình duyệt (Chrome, Edge): trả EUI sau [`BROWSER_EUI_IDLE`] không còn cửa sổ Meet (QĐ 28; Teams giữ tới hết phiên).
    fn release_idle_browsers(&mut self) {
        let now = Instant::now();
        let idle = |e: &EuiEntry, seen: &HashMap<i32, Instant>| {
            matches!(e.app, MeetingApp::MeetChrome | MeetingApp::MeetEdge)
                && seen.get(&e.pid).is_none_or(|t| now.duration_since(*t) >= BROWSER_EUI_IDLE)
        };
        let (gone, keep): (Vec<EuiEntry>, Vec<EuiEntry>) =
            std::mem::take(&mut self.enhanced).into_iter().partition(|e| idle(e, &self.meeting_seen));
        self.enhanced = keep;
        for entry in gone {
            self.meeting_seen.remove(&entry.pid);
            if reset_enhanced(entry)
                && let Some(m) = &self.marker
            {
                let _ = eui::remove(m, entry.pid);
            }
        }
    }

    /// Đọc tên tắt: trả EUI, không đọc gì.
    pub fn idle(&mut self) -> Sample {
        self.release_all();
        empty(ReaderStatus::Off, None, Pass::Idle)
    }

    fn scan(&mut self) {
        self.last_scan = Some(Instant::now());
        let pids = list_pids();
        let alive: std::collections::HashSet<i32> = pids.iter().copied().collect();
        self.procs.retain(|pid, _| alive.contains(pid));
        let mut running = Vec::new();
        for pid in pids {
            let Some(path) = pid_path(pid) else { continue };
            let entry = self.procs.entry(pid).or_insert_with(|| (PathBuf::new(), None));
            if entry.0 != path {
                *entry = (path.clone(), identify(&path));
            }
            if let Some((app, version)) = &entry.1
                && self.only.is_none_or(|o| o == *app)
                && self.recipes.app(Os::Macos, *app).is_some()
            {
                running.push((pid, *app, version.clone()));
            }
        }
        running.sort_by_key(|r| MeetingApp::ALL.iter().position(|a| *a == r.1));
        self.running = running;
    }

    /// Cửa sổ họp của app đầu tiên (theo ưu tiên) có cửa sổ họp; giữ trạng thái của cửa sổ còn đó.
    fn refresh_target(&mut self) {
        let previous = self.target.take();
        let mut old_windows = Vec::new();
        let mut old_pid = None;
        if let Some(t) = previous {
            old_pid = Some(t.pid);
            old_windows = t.windows;
        }
        let recipes = self.recipes.clone();
        for (pid, app, version) in self.running.clone() {
            let Some(recipe) = recipes.app(Os::Macos, app) else { continue };
            let Some(element) = AxNode::app(pid) else { continue };
            let nodes: Vec<(AxNode, String)> = element
                .elements("AXWindows")
                .into_iter()
                .filter_map(|w| {
                    let title = w.string("AXTitle").unwrap_or_default();
                    let ident = w.string("AXIdentifier").unwrap_or_default();
                    is_meeting_window(recipe, &title, &ident).then_some((w, title))
                })
                .take(MAX_WINDOWS)
                .collect();
            if nodes.is_empty() {
                continue;
            }
            if recipe.enhanced_ui {
                self.enable_enhanced(pid, app, &element);
            }
            let windows = nodes
                .into_iter()
                .map(|(node, title)| {
                    let kept = (old_pid == Some(pid))
                        .then(|| old_windows.iter().position(|w| w.node.0 == node.0))
                        .flatten();
                    match kept {
                        Some(i) => Window { title, ..old_windows.swap_remove(i) },
                        None => Window { node, title, walk: None, tiles: Vec::new(), last_full: None, stale: true, next: 0 },
                    }
                })
                .collect();
            self.target = Some(Target { pid, app, version, windows });
            return;
        }
    }

    /// Đặt `AXEnhancedUserInterface` (spec §6.2): chỉ khi đang `false`; ghi dấu trước (QĐ 8).
    fn enable_enhanced(&mut self, pid: i32, app: MeetingApp, element: &AxNode) {
        self.meeting_seen.insert(pid, Instant::now());
        if self.enhanced.iter().any(|e| e.pid == pid) {
            return;
        }
        if element.get_bool(EUI) == Some(true) {
            // Đã bật bởi công nghệ trợ năng khác (VoiceOver…): không giành, không trả.
            return;
        }
        let entry = EuiEntry { pid, app };
        if let Some(m) = &self.marker
            && let Err(e) = eui::add(m, entry)
        {
            eprintln!("speaker-worker: không ghi được dấu chế độ trợ năng ({:?}), không bật", e.kind());
            return;
        }
        element.set_bool(EUI, true);
        self.enhanced.push(entry);
    }

    /// Một lượt đọc. Một ngân sách (≤ [`MAX_ELEMENTS`] lệnh, ≤ [`PASS_BUDGET`]) cho cả lượt: duyệt cửa sổ, lấy mẫu mọi ô, ứng viên
    /// (QĐ 13); hết thì lượt sau đọc tiếp (lượt đầy đủ từ phần tử chưa duyệt, lượt nhanh từ ô chưa đọc).
    pub fn tick(&mut self, calibrate: bool) -> Sample {
        let started = Instant::now();
        let at = unix_ms();
        self.tree.reads = 0;
        self.tree.timeouts = 0;
        let rescan = self.last_scan.is_none_or(|t| t.elapsed() >= SCAN_EVERY);
        if rescan {
            self.scan();
        }
        let Some(&(_, first_app, _)) = self.running.first() else {
            self.target = None;
            self.release_idle_browsers();
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        // Chỉ gọi khi có app họp đang chạy.
        if !trusted() {
            self.target = None;
            return self.finish(empty(ReaderStatus::NoPermission, Some(first_app), Pass::Idle), at, started);
        }
        if !self.restored {
            self.restored = true;
            self.restore_leftovers();
        }
        if rescan || self.target.is_none() {
            self.refresh_target();
        }
        if let Some(t) = &self.target {
            self.meeting_seen.insert(t.pid, Instant::now());
        }
        self.release_idle_browsers();
        let recipes = self.recipes.clone();
        let Some(target) = self.target.as_mut() else {
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        let Some(recipe) = recipes.app(Os::Macos, target.app) else {
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        let mut budget = Budget::new(MAX_ELEMENTS, PASS_BUDGET);
        let mut tiles: Vec<TileSample> = Vec::new();
        let mut full = false;
        for (k, w) in target.windows.iter_mut().enumerate() {
            let due = w.stale || w.walk.is_some() || w.last_full.is_none_or(|t| t.elapsed() >= FULL_EVERY);
            if due && !budget.exhausted() {
                full = true;
                let walk = w.walk.get_or_insert_with(|| Walk::new(w.node.clone(), k as u32, recipe.web_only));
                if let Some(found) = walk.step(&mut self.tree, recipe, &mut budget) {
                    w.tiles = found;
                    w.walk = None;
                    w.last_full = Some(Instant::now());
                    w.stale = false;
                    w.next = 0;
                }
            }
            let round = sample_round(&mut self.tree, &w.tiles, recipe, w.next, calibrate, &mut budget);
            w.next = round.next;
            w.stale |= round.gone;
            tiles.extend(round.samples);
        }
        let (app, version) = (target.app, target.version.clone());
        self.failures = if self.tree.timeouts > 0 { self.failures + 1 } else { 0 };
        let status = if self.failures >= BLOCKED_AFTER { ReaderStatus::Blocked } else { ReaderStatus::Ok };
        let sample = Sample {
            app_version: version,
            tiles,
            ..empty(status, Some(app), if full { Pass::Full } else { Pass::Fast })
        };
        self.finish(sample, at, started)
    }

    fn finish(&mut self, mut s: Sample, at: u64, started: Instant) -> Sample {
        s.at_unix_ms = at;
        s.pass_ms = started.elapsed().as_secs_f32() * 1000.0;
        s.elements = self.tree.reads;
        self.stats.add(s.pass, s.pass_ms, s.elements);
        s
    }

    /// Số lệnh quá hạn chờ 0,2 s ở lượt vừa đọc (`ax-record stats`, Task 20).
    pub fn timeouts(&self) -> u32 {
        self.tree.timeouts
    }

    /// Cây của các cửa sổ họp đang đọc, định dạng fixture (`ax-record fixture`; có chữ của app họp).
    pub fn dump_windows(&mut self) -> Vec<String> {
        let recipes = self.recipes.clone();
        let Some(target) = &self.target else { return Vec::new() };
        let Some(recipe) = recipes.app(Os::Macos, target.app) else { return Vec::new() };
        let mut out = Vec::new();
        for w in &target.windows {
            out.extend(dump_lines(&mut self.tree, &w.node, &w.title, recipe));
        }
        out
    }
}

fn empty(status: ReaderStatus, app: Option<MeetingApp>, pass: Pass) -> Sample {
    Sample {
        at_unix_ms: 0,
        period_ms: 0,
        status,
        app,
        app_version: None,
        tiles: Vec::new(),
        pass,
        pass_ms: 0.0,
        elements: 0,
    }
}

/// Đặt lại `AXEnhancedUserInterface = false` nếu pid còn là đúng app đó (không đụng tiến trình khác dùng lại pid) và giá trị đang
/// bật (`eui::step_for`). `true` khi mục này xong việc (đọc được mà không phải bật, đã trả được, hay pid không còn là app đó) và được
/// bỏ khỏi file dấu; `false` khi không đọc được (app họp treo quá hạn chờ) hay đặt không được: giữ dấu, lần sau thử lại.
fn reset_enhanced(entry: EuiEntry) -> bool {
    let same = pid_path(entry.pid).and_then(|p| identify(&p)).is_some_and(|(app, _)| app == entry.app);
    if !same {
        return true;
    }
    let Some(el) = AxNode::app(entry.pid) else { return false };
    match eui::step_for(el.read_eui()) {
        eui::EuiStep::Drop => true,
        eui::EuiStep::Keep => false,
        eui::EuiStep::Reset => {
            el.set_bool(EUI, false);
            eui::reset_done(el.read_eui())
        }
    }
}

/// Chạy bộ đọc trên luồng riêng, QoS `utility`. Nhịp theo `Control` (QĐ 13); giữa hai lượt luồng ngủ bằng `next_turn` (thức khi tới
/// lượt, khi bật hay tắt "Lấy tên", khi dừng; đổi nhịp chỉ tính lại hạn; QĐ 27). "Lấy tên" tắt hay tạm dừng: trả `AXEnhancedUserInterface`, gửi một mẫu `Off`,
/// rồi ngủ không hạn tới khi trạng thái đổi. Dừng khi `stop` hay khi luồng chính thôi nhận mẫu, trả EUI trước khi dừng.
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, mut sink: SampleSink) -> Option<JoinHandle<()>> {
    std::thread::Builder::new()
        .name("speaker-reader".into())
        .spawn(move || {
            crate::platform::utility_qos_for_this_thread();
            set_process_timeout();
            let mut reader = LiveReader::new(setup.recipes, setup.eui_marker, None);
            let mut last = Instant::now();
            let mut c: ControlState = control.get();
            loop {
                let started = Instant::now();
                let mut sample = if c.enabled { reader.tick(c.calibrate) } else { reader.idle() };
                sample.period_ms = started.duration_since(last).as_millis().min(u128::from(u32::MAX)) as u32;
                last = started;
                if !sink(sample) {
                    break;
                }
                match next_turn(&control, c, started) {
                    Some(next) => c = next,
                    None => break,
                }
            }
            reader.release_all();
        })
        .ok()
}
```

`crates/speaker-worker/src/reader/mod.rs`: thay thân hàm `spawn` (Task 10) bằng:

```rust
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, sink: SampleSink) -> Option<std::thread::JoinHandle<()>> {
    #[cfg(target_os = "macos")]
    {
        macos::spawn(setup, control, sink)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (setup, control, sink);
        None
    }
}
```

và chú thích ngay trên hàm thành `/// Chạy bộ đọc trên luồng riêng (macOS: \`macos::spawn\`); nền tảng chưa có bộ đọc (Windows tới kế hoạch 05) thì \`None\`.`

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok.` (2 test mới của `reader::macos`, cộng các test `reader::` trước). Không test nào gọi `LiveReader` hay hàm FFI.

- [ ] **Step 6: Công cụ `ax-record` (chỉ macOS, chỉ dùng ở Task 20–21)**

`crates/speaker-worker/src/bin/ax-record.rs`:

```rust
//! Công cụ đo và ghi của bộ đọc tên (kế hoạch 04 Task 12, 20, 21; chỉ macOS): chạy đúng bộ đọc của `speaker-worker` (công thức build
//! sẵn hay `--recipe <file>`) trên một app họp đang chạy, `--rate` lượt mỗi giây, trong `--seconds` giây, rồi trả
//! `AXEnhancedUserInterface` và thoát. Chỉ đọc, không bấm gì. Tiến trình chạy công cụ phải có quyền Trợ năng (chạy từ Terminal:
//! quyền của Terminal).
//!
//!   ax-record stats <app> <ra.jsonl> [--rate 1|4] [--seconds 60] [--recipe <file>] [--marker <dấu.json>] [--calibrate]
//!       mỗi lượt một dòng {"t", "pass", "ms", "elements", "status", "tiles", "timeouts"}: không có tên người
//!   ax-record fixture <app> <ra.jsonl> [--seconds 60] [--recipe <file>] [--marker <dấu.json>]
//!       mỗi giây một ảnh chụp cây của cửa sổ họp, định dạng fixture: CÓ TÊN THẬT VÀ CHỮ CỦA APP HỌP, chỉ ghi vào $DATA, ẩn danh
//!       bằng scripts/speaker-recipes/make_fixture.py trước khi vào repo
//!
//! <app>: teams | zoom | meet_chrome | meet_edge (Meet, Zoom không có trong công thức build sẵn: cần `--recipe`).
//! `--calibrate`: mỗi lượt đọc cả ứng viên tự hiệu chỉnh, như worker khi đang tìm hay đã học được chỉ báo (`ControlState::calibrate`).

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("ax-record chỉ chạy trên macOS");
    std::process::exit(2);
}

#[cfg(target_os = "macos")]
fn main() -> anyhow::Result<()> {
    use std::io::Write;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use anyhow::{Context, bail};
    use speaker_protocol::MeetingApp;
    use speaker_worker::reader::macos::LiveReader;

    const USAGE: &str = "cách dùng: ax-record stats|fixture <teams|zoom|meet_chrome|meet_edge> <ra.jsonl> [--rate 1|4] \
                         [--seconds N] [--recipe <file>] [--marker <file>] [--calibrate]";
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        bail!("{USAGE}");
    }
    let (mode, out) = (args[1].as_str(), args[3].as_str());
    if mode != "stats" && mode != "fixture" {
        bail!("{USAGE}");
    }
    let app: MeetingApp = serde_json::from_value(serde_json::Value::String(args[2].clone())).context(USAGE)?;
    let opt = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let rate: u64 = opt("--rate").map_or(Ok(1), |v| v.parse()).context("--rate")?;
    let seconds: u64 = opt("--seconds").map_or(Ok(60), |v| v.parse()).context("--seconds")?;
    // Rà soát lần 2 B-N-E: đo cả đường đọc ứng viên mà worker dùng khi tìm hay đã học chỉ báo.
    let calibrate = args.iter().any(|a| a == "--calibrate");
    let recipe_json = match opt("--recipe") {
        Some(p) => std::fs::read_to_string(&p).with_context(|| format!("không đọc được {p}"))?,
        None => speaker_recipe::BUILTIN_JSON.to_string(),
    };
    let recipes = std::sync::Arc::new(speaker_recipe::parse(&recipe_json)?);
    // Hạn chờ 0,2 s cho cả tiến trình (QĐ 27), trước mọi lệnh Accessibility.
    speaker_worker::reader::macos::set_process_timeout();
    let mut reader = LiveReader::new(recipes, opt("--marker").map(std::path::PathBuf::from), Some(app));
    reader.restore_leftovers();
    let mut file = std::io::BufWriter::new(std::fs::File::create(out).with_context(|| format!("không tạo được {out}"))?);
    let period = Duration::from_millis(1_000 / rate.clamp(1, 4));
    let end = Instant::now() + Duration::from_secs(seconds);
    let mut result = Ok(());
    while Instant::now() < end && result.is_ok() {
        let started = Instant::now();
        let s = reader.tick(calibrate);
        let t = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs_f64();
        let line = if mode == "stats" {
            serde_json::json!({
                "t": t, "pass": format!("{:?}", s.pass), "ms": s.pass_ms, "elements": s.elements,
                "status": format!("{:?}", s.status), "tiles": s.tiles.len(), "timeouts": reader.timeouts(),
            })
        } else {
            serde_json::json!({"t": t, "lines": reader.dump_windows()})
        };
        result = writeln!(file, "{line}");
        std::thread::sleep(period.saturating_sub(started.elapsed()));
    }
    reader.release_all();
    result?;
    file.flush()?;
    Ok(())
}
```

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build -p speaker-worker --bin ax-record 2>&1 | tail -1`
Expected: `Finished`. **Không chạy** công cụ ở Task này.

- [ ] **Step 7: `xen_ke.py` đo bộ đọc thật (cho Task 20)**

Trong `bench/2026-10-26-nguoi-noi/tro-nang/xen_ke.py`:
- Chú thích đầu file, câu "Chế độ: …": thêm `R1`, `R4` (chạy `ax-record stats` của kế hoạch 04: bộ đọc thật, 1 hay 4 lượt mỗi giây).
- Sau dòng `AX = os.path.join(DT, "axtrace")` thêm:

```python
AXREC = os.environ.get("AX_RECORD", os.path.join(HERE, "..", "..", "..", "target", "release", "ax-record"))
APPKEY = {"teams": "teams", "chrome": "meet_chrome"}[sys.argv[1]]
# Meet không có trong công thức build sẵn (QĐ 32 của kế hoạch 04): dùng công thức riêng của thư mục fixture.
RECIPE = [] if APPKEY == "teams" else ["--recipe", os.path.join(HERE, "..", "..", "..", "scripts", "speaker-recipes", "fixtures", "meet-macos.recipes.json")]
```

- Trong `group`, dòng `if n.endswith("/axtrace"):` thành `if n.endswith("/axtrace") or n.endswith("/ax-record"):`.
- Trong `main`, sau nhánh `elif mode == "B0": …` thêm:

```python
        elif mode in ("R1", "R4"):
            out = os.path.join(DT, "out", f"{TAG}-{k}{mode}-reader.jsonl")
            marker = os.path.join(os.environ["DATA"], "out", "eui-marker.json")
            w = subprocess.Popen([AXREC, "stats", APPKEY, out, "--rate", mode[1], "--seconds", str(int(SEG)), "--marker", marker] + RECIPE + os.environ.get("AX_RECORD_ARGS", "").split())
```

- Ở cuối đoạn, thay `w.terminate()` + `w.wait()` bằng:

```python
            if mode.startswith("R"):
                w.wait(timeout=SEG + 15)
            else:
                w.terminate()
                w.wait()
```

(`ax-record` tự dừng sau `--seconds` và tự trả `AXEnhancedUserInterface`; `axtrace noaccess` sau đó vẫn chạy như cũ.)

Run: `cd $W && python3 -I -m py_compile bench/2026-10-26-nguoi-noi/tro-nang/xen_ke.py && echo ok`
Expected: `ok`.

- [ ] **Step 8: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && scripts/check-windows.sh 2>&1 | tail -2 && scripts/release/check-no-network.sh && git status --short`
Expected: sạch (Windows: `macos.rs` và `ax-record` bị `cfg` loại; `ax-record` trên Windows chỉ in thông báo); không mã mạng. Không commit.

---
### Task 13: Pipeline: `Speech` từ luồng VAD; client gửi phần tên, `SetNames`, `PauseNames`, mốc giờ phiên, log gợi ý lệch phiên bản, bậc tạm dừng tên

**Files:**
- Modify: `crates/pipeline/src/speaker.rs` (kiểu mới, `SpeechTrack`, `SpeakerLink.speech`, `SpeakerTap::{with_speech, speech_frame}`, `SpeakerUpdate::{Participants, Reader}`)
- Modify: `crates/pipeline/src/engine.rs` (`start_with_speaker`, dòng 559–566 ở HEAD; `vad_loop` ngay sau dòng `let prob = …`; `on_speaker`: hai nhánh tạm. Neo theo tên hàm: Task 1 không đổi số dòng của file này ngoài phần test cuối file)
- Modify: `crates/pipeline/src/speaker_client.rs` (gần như mọi phần: xem Step 3)
- Modify: `crates/pipeline/src/bin/fake_speaker_worker.rs` (lệnh kịch bản `named`, `long_name`; log `names`, `speech`, `set_names`, `pause_names`, `session unix=`)
- Test: `crates/pipeline/src/speaker.rs` (mod `tests`), `crates/pipeline/tests/speaker_client.rs` (cuối file)

- [ ] **Step 1: Viết test đỏ**

`crates/pipeline/src/speaker.rs`, cuối mod `tests`:

```rust
    /// QĐ 14 của kế hoạch 04: khoảng kết thúc sau 3 khung im; đang nói thì báo mỗi 16 khung (512 ms).
    #[test]
    fn speech_spans_close_after_three_quiet_frames_and_report_every_half_second() {
        let mut t = SpeechTrack::default();
        let got: Vec<(u64, u64)> = (0..40u64).filter_map(|f| t.push(f, (5..30).contains(&f))).collect();
        assert_eq!(got, [(160, 704), (160, 960)]);
    }

    /// Chỉ tiếng nói của âm thanh máy (spec §4.2 `Speech`): khung của micro không tính.
    #[test]
    fn the_tap_reports_machine_speech_but_not_mic_speech() {
        let (link, ends) = SpeakerLink::pair();
        let mut tap = SpeakerTap::new(link.segments, link.offered_end_ms).with_speech(link.speech);
        for f in 0..10u64 {
            tap.push_frame(f, &[Source::Mic; 512]);
            tap.speech_frame(f, f < 6);
        }
        assert_eq!(ends.speech.try_iter().count(), 0, "micro");
        for f in 10..20u64 {
            tap.push_frame(f, &[Source::System; 512]);
            tap.speech_frame(f, f < 16);
        }
        assert_eq!(ends.speech.try_iter().collect::<Vec<_>>(), [SpeechSpan { start_ms: 320, end_ms: 512 }]);
    }
```

`crates/pipeline/src/speaker_client.rs`, cuối mod `tests`:

```rust
    /// QĐ 26 (rà soát A-Q2): worker khác phiên bản giao thức thoát ngay ở `Load` (không giải mã được), không gửi được `Ready`; lý do
    /// chết ghi gợi ý kiểm bản worker. Sau `Ready` thì giữ lý do như cũ.
    #[test]
    fn closing_before_ready_hints_at_a_protocol_mismatch() {
        let why = before_ready(false, "speaker-worker đóng stdout".into());
        assert!(why.starts_with("speaker-worker đóng stdout trước Ready") && why.contains("khác phiên bản giao thức"), "{why}");
        assert_eq!(before_ready(true, "speaker-worker đóng stdout".into()), "speaker-worker đóng stdout");
    }

    /// QĐ 15 (rà soát lần 2 B-N-A): `PauseNames` đi trước các khung đang chờ trong hàng ghi (cờ của luồng ghi), nên quá tải nặng (hàng
    /// đầy đoạn) vẫn tạm dừng được; chỉ ghi một lần dù khung đánh thức cũng vào hàng.
    #[test]
    fn pause_is_written_before_the_queued_frames_and_only_once() {
        let (tx, rx) = mpsc::sync_channel::<Request>(WRITER_QUEUE);
        for i in 0..WRITER_QUEUE as u64 {
            tx.send(Request::Speech { start_ms: i, end_ms: i + 1 }).unwrap();
        }
        assert!(tx.try_send(Request::PauseNames).is_err(), "hàng đầy");
        let pause = Arc::new(AtomicBool::new(true));
        drop(tx);
        let (ctl, _ctl_rx) = mpsc::channel::<Ctl>();
        let mut out: Vec<u8> = Vec::new();
        write_loop(&mut out, rx, pause, ctl);
        let mut r = out.as_slice();
        assert_eq!(read_frame::<_, Request>(&mut r).unwrap(), Some(Request::PauseNames));
        let mut rest = 0;
        while let Some(req) = read_frame::<_, Request>(&mut r).unwrap() {
            assert_ne!(req, Request::PauseNames, "chỉ một lần");
            rest += 1;
        }
        assert_eq!(rest, WRITER_QUEUE);
    }
```

`crates/pipeline/tests/speaker_client.rs`: dòng 4 thành `use pipeline::speaker::{SpeakerLink, SpeakerUpdate, SpeechSpan, UPDATE_CHANNEL_CAP};`, dòng 6 thành `use speaker_protocol::{MeetingApp, NamesSetup, ReaderStatus, SegmentAudio, Source, SpeakerConfig};`; thêm cuối file:

```rust
fn names_on(f: &Fixture) -> SpeakerLaunch {
    let mut l = f.launch();
    l.names = NamesSetup {
        enabled: true,
        recipe_json: "{\"schema\":1}".into(),
        eui_marker: None,
    };
    l
}

/// Kế hoạch 04: `Load` mang phần tên; `Speech` của luồng VAD và `SetNames` của app tới worker.
#[test]
fn names_setup_speech_and_set_names_reach_the_worker() {
    let f = Fixture::new("names", &["ok"]);
    let (link, handle) = speaker_client::start(names_on(&f), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    assert!(handle.names_wanted());
    link.speech.try_send(SpeechSpan { start_ms: 0, end_ms: 512 }).unwrap();
    handle.set_names(false);
    wait_until("worker nhận Speech và SetNames", || {
        let e = f.events();
        e.contains("speech 0-512") && e.contains("set_names false")
    });
    assert!(f.events().contains("names enabled=true recipe=12"), "{}", f.events());
    drop(link);
}

/// QĐ 12: mọi lần chạy worker trong một phiên nhận cùng mốc giờ của phiên.
#[test]
fn every_run_of_a_session_gets_the_same_session_clock() {
    let f = Fixture::new("clock", &["crash_on:1", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || handle.starts() == 2 && handle.wait_ready(Duration::from_millis(10)));
    let events = f.events();
    let clocks: Vec<&str> = events.lines().filter(|l| l.starts_with("session unix=")).collect();
    assert_eq!(clocks.len(), 2, "{events}");
    assert_eq!(clocks[0], clocks[1]);
}

#[test]
fn names_participants_and_reader_state_are_forwarded() {
    let f = Fixture::new("named", &["named"]);
    let (link, handle) = speaker_client::start(names_on(&f), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    let seen = wait_for(&link.updates, "Reader", |u| matches!(u, SpeakerUpdate::Reader(_)));
    assert!(seen.iter().any(|u| matches!(u, SpeakerUpdate::Voices(v) if v[0].name.as_ref().map(|n| n.as_str()) == Some("Lan"))));
    assert!(seen.iter().any(|u| matches!(u, SpeakerUpdate::Participants(p) if p.len() == 2)));
    assert!(matches!(
        seen.last(),
        Some(SpeakerUpdate::Reader(r)) if r.state == ReaderStatus::NoPermission && r.app == Some(MeetingApp::Teams)
    ));
}

/// App coi khung của worker là dữ liệu chưa tin: tên quá 160 byte là worker hỏng (chạy lại).
#[test]
fn an_oversized_name_counts_as_a_broken_worker() {
    let f = Fixture::new("long-name", &["long_name", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại sau khung hỏng", || handle.starts() == 2);
}

/// Spec §11, QĐ 15: chậm hơn thời gian thực khi đang đọc tên thì trước hết tạm dừng đọc tên (`PauseNames`, giữ tên; không phải
/// `SetNames(false)`); vẫn chậm thì tắt.
#[test]
fn overload_first_pauses_the_names_then_turns_speaker_off() {
    let f = Fixture::new("slow-names", &["segment_delay_ms:400"]);
    let (link, handle) = speaker_client::start(names_on(&f), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let t0 = Instant::now();
    let mut id = 0u64;
    while handle.disabled().is_none() && t0.elapsed() < Duration::from_secs(12) {
        if let Err(TrySendError::Disconnected(_)) = link.segments.try_send(segment(id, id * 250, id * 250 + 200)) {
            break;
        }
        id += 1;
        std::thread::sleep((t0 + Duration::from_millis(id * 250)).saturating_duration_since(Instant::now()));
    }
    assert_eq!(wait_disabled(&handle), Disabled::Overload);
    assert!(handle.names_paused(), "bậc 1: tạm dừng đọc tên");
    assert!(t0.elapsed() >= Duration::from_secs(4), "hai lần chậm 2 s: {:?}", t0.elapsed());
    let events = f.events();
    assert!(events.contains("pause_names"), "{events}");
    assert!(!events.contains("set_names false"), "tạm dừng không xóa tên: {events}");
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p pipeline --lib -- speaker:: 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`SpeechTrack`, `SpeechSpan`, `with_speech` … chưa có).

- [ ] **Step 3: Viết mã**

**(a) `crates/pipeline/src/speaker.rs`.** Dòng 16 thành `use speaker_protocol::{MAX_EMBED_SAMPLES, MeetingApp, PersonName, ReaderStatus, SegmentAudio, Source, VoiceInfo, pcm_from_f32};`. Thêm sau `UPDATE_CHANNEL_CAP` (dòng 26):

```rust
/// Kênh `Speech` từ luồng VAD tới client (QĐ 14 của kế hoạch 04): 16 khoảng; đầy thì bỏ, không bao giờ chờ.
pub const SPEECH_CHANNEL_CAP: usize = 16;
/// Khoảng tiếng nói kết thúc sau chừng này khung im (96 ms).
pub const SPEECH_END_FRAMES: u32 = 3;
/// Đang nói thì báo khoảng mỗi chừng này khung (512 ms).
pub const SPEECH_REPORT_FRAMES: u32 = 16;

/// Khoảng có tiếng nói của âm thanh máy (`Request::Speech`), ms từ đầu phiên.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SpeechSpan {
    pub start_ms: u64,
    pub end_ms: u64,
}

/// Trạng thái bộ đọc tên (`Response::ReaderState`), tới luồng phụ đề rồi app (dòng mời cấp quyền). Không có tên người.
#[derive(Clone, Debug, PartialEq)]
pub struct ReaderInfo {
    pub app: Option<MeetingApp>,
    pub app_version: Option<String>,
    pub state: ReaderStatus,
    pub recipe_version: u32,
    pub learned: u32,
}

/// Khoảng tiếng nói theo từng khung VAD: mở ở khung có tiếng, đóng sau [`SPEECH_END_FRAMES`] khung im, báo phần đang mở mỗi
/// [`SPEECH_REPORT_FRAMES`] khung.
#[derive(Default)]
pub struct SpeechTrack {
    open: Option<u64>,
    last: u64,
    silent: u32,
    since: u32,
}

impl SpeechTrack {
    /// Khung `frame` (từ 0) có tiếng của máy không. Trả khoảng `[start_ms, end_ms)` cần báo.
    pub fn push(&mut self, frame: u64, speech: bool) -> Option<(u64, u64)> {
        match (self.open, speech) {
            (None, false) => None,
            (None, true) => {
                (self.open, self.last, self.silent, self.since) = (Some(frame), frame, 0, 0);
                None
            }
            (Some(start), true) => {
                (self.last, self.silent) = (frame, 0);
                self.since += 1;
                (self.since >= SPEECH_REPORT_FRAMES).then(|| {
                    self.since = 0;
                    (start * FRAME_MS, (frame + 1) * FRAME_MS)
                })
            }
            (Some(start), false) => {
                self.silent += 1;
                (self.silent >= SPEECH_END_FRAMES).then(|| {
                    self.open = None;
                    (start * FRAME_MS, (self.last + 1) * FRAME_MS)
                })
            }
        }
    }
}
```

Trong `SpeakerUpdate` thêm hai biến thể cuối:

```rust
    /// Người tham dự đọc được (kế hoạch 04), tới cùng mỗi `Voices` của worker.
    Participants(Vec<PersonName>),
    /// Trạng thái bộ đọc tên.
    Reader(ReaderInfo),
```

`SpeakerLink` thêm trường `pub speech: SyncSender<SpeechSpan>,` (sau `segments`), `LinkEnds` thêm `pub speech: Receiver<SpeechSpan>,`; trong `SpeakerLink::pair` thêm `let (speech_tx, speech_rx) = mpsc::sync_channel(SPEECH_CHANNEL_CAP);` và hai trường `speech: speech_tx,` / `speech: speech_rx,`. `SourceTrack` thêm:

```rust
    /// Cờ của khung mới nhất.
    pub fn last(&self) -> Option<Source> {
        self.tags.back().copied()
    }
```

`SpeakerTap`: thêm hai trường `speech: Option<SyncSender<SpeechSpan>>,` và `speech_track: SpeechTrack,` (trong `new`: `speech: None, speech_track: SpeechTrack::default(),`), và hai phương thức:

```rust
    /// Gửi thêm `Speech` (kế hoạch 04) qua kênh này.
    pub fn with_speech(mut self, tx: SyncSender<SpeechSpan>) -> Self {
        self.speech = Some(tx);
        self
    }

    /// Khung VAD `frame` vừa có xác suất `voiced` (≥ ngưỡng của bộ cắt câu). Tính là tiếng của máy khi cờ nguồn của khung không phải
    /// `Mic`. `try_send`, đầy thì bỏ: không bao giờ chờ.
    pub fn speech_frame(&mut self, frame: u64, voiced: bool) {
        let Some(tx) = &self.speech else { return };
        let machine = voiced && self.track.last() != Some(Source::Mic);
        if let Some((start_ms, end_ms)) = self.speech_track.push(frame, machine) {
            let _ = tx.try_send(SpeechSpan { start_ms, end_ms });
        }
    }
```

**(b) `crates/pipeline/src/engine.rs`.** Dòng 561: `Some(SpeakerTap::new(link.segments, link.offered_end_ms).with_speech(link.speech)),`. Trong `vad_loop`, ngay sau khối `let prob = match vad.prob(vad_frame) { … };`:

```rust
            // `Speech` cho bộ đọc tên (kế hoạch 04, spec §4.2): chỉ `try_send`, không chờ.
            if let Some(tap) = speaker.as_mut() {
                tap.speech_frame(frames - 1, prob >= cfg.segmenter.threshold);
            }
```

Trong `on_speaker` thêm nhánh tạm (Task 14 thay): `SpeakerUpdate::Participants(_) | SpeakerUpdate::Reader(_) => false,`.

**(c) `crates/pipeline/src/speaker_client.rs`.**
- Chú thích đầu file: thay câu "Kế hoạch 04 thêm bậc 'tạm dừng đọc tên' trước bước này." bằng "Khi đang đọc tên, lần chậm đầu chỉ tạm dừng đọc tên tới hết phiên (`PauseNames`: worker giữ tên đã chốt), chậm tiếp mới tắt (kế hoạch 04, QĐ 15)."; thêm gạch đầu dòng: "- Kế hoạch 04: `Load` mang `SpeakerLaunch::names`; `SessionStart` mang mốc giờ tính một lần mỗi phiên (QĐ 12); `Speech` của luồng VAD và `SetNames` (công tắc "Lấy tên", [`SpeakerHandle::set_names`]) đi qua luồng ghi khi worker sẵn sàng; worker đóng stdout hay gửi khung hỏng trước `Ready` thì lý do chết kèm gợi ý kiểm bản worker (QĐ 26); `Voices` vượt giới hạn tên là khung hỏng."
- Dòng 35–39 (`use`):

```rust
use crate::speaker::{LinkEnds, ReaderInfo, SpeakerLink, SpeakerUpdate, SpeechSpan, UPDATE_CHANNEL_CAP};
use speaker_protocol::{
    MAX_APP_VERSION_BYTES, NamesSetup, PROTOCOL_VERSION, Request, Response, SegmentAudio, SpeakerConfig, VoiceInfo,
    read_frame, voices_fit, write_frame,
};
```

- Thêm hằng sau `MAX_ERRORS_WITHOUT_SEGMENT`: `/// Khung chờ ghi xuống worker (kế hoạch 04: \`Speech\` mỗi 512 ms đi cùng đoạn).\nconst WRITER_QUEUE: usize = 8;`
- Dòng 41 `use std::io::{BufReader, BufWriter};` thành `use std::io::{BufReader, BufWriter, Write};`. Thay `fn write_loop` (cả hàm) bằng:

```rust
/// Luồng ghi: ghi các khung trong hàng xuống stdin của worker. Cờ `pause` bật (QĐ 15 của kế hoạch 04) thì `PauseNames` đi trước khung
/// kế tiếp, một lần cho cả lần chạy (khung `PauseNames` trong hàng chỉ để đánh thức, ghi rồi thì bỏ).
fn write_loop<W: Write>(mut out: W, requests: Receiver<Request>, pause: Arc<AtomicBool>, ctl: Sender<Ctl>) {
    let pause_frame = Request::PauseNames;
    let mut paused = false;
    for request in requests {
        let wake = matches!(request, Request::PauseNames);
        let mut frames: Vec<&Request> = Vec::with_capacity(2);
        if !paused && (pause.swap(false, Ordering::SeqCst) || wake) {
            paused = true;
            frames.push(&pause_frame);
        }
        if !wake {
            frames.push(&request);
        }
        for frame in frames {
            if let Err(e) = write_frame(&mut out, frame) {
                let _ = ctl.send(Ctl::Gone(format!("ghi cho speaker-worker lỗi: {e}")));
                return;
            }
        }
    }
}
```

- Thêm hàm ngay trước `fn too_big_voice`:

```rust
/// Lý do worker chết khi stdout đóng hay khung hỏng (QĐ 26 của kế hoạch 04): trước `Ready` thì kèm gợi ý kiểm bản worker, vì worker
/// khác phiên bản giao thức thoát ngay ở `Load` (stderr của worker có dòng `giao thức phiên bản N`).
fn before_ready(got_ready: bool, why: String) -> String {
    if got_ready {
        why
    } else {
        format!("{why} trước Ready (app và speaker-worker có thể khác phiên bản giao thức, kiểm bản speaker-worker)")
    }
}
```
- `SpeakerLaunch`: thêm trường cuối `/// Phần đọc tên gửi trong \`Load\` (kế hoạch 04). \`enabled\` lúc đầu phiên; đổi giữa phiên bằng [\`SpeakerHandle::set_names\`].\n    pub names: NamesSetup,`; trong `new` thêm `names: NamesSetup::off(),`.
- `State`: thêm `names_paused: bool,`. `SpeakerHandle`: thêm trường `/// "Lấy tên" mà app muốn (kế hoạch 04).\n    names: Arc<AtomicBool>,` và các phương thức:

```rust
    /// Công tắc "Lấy tên" đổi giữa phiên: client gửi `SetNames` khi worker sẵn sàng (cả các lần chạy lại).
    pub fn set_names(&self, on: bool) {
        self.names.store(on, Ordering::SeqCst);
    }

    pub fn names_wanted(&self) -> bool {
        self.names.load(Ordering::SeqCst)
    }

    /// Đọc tên đã bị tạm dừng tới hết phiên vì quá tải (spec §11).
    pub fn names_paused(&self) -> bool {
        self.get(|s| s.names_paused)
    }
```

- `start`: sau `let stop = handle.stop.clone();` thêm:

```rust
    handle.names.store(launch.names.enabled, Ordering::SeqCst);
    // Mốc giờ của phiên, một lần cho mọi lần chạy worker (QĐ 12 của kế hoạch 04).
    let session_unix_ms = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
```

và lời gọi thành `.spawn(move || supervise(&launch, &before_spawn, ends, &stop, &handle, session_unix_ms))`.
- `supervise`: thêm tham số `session_unix_ms: u64`; destructure `let LinkEnds { segments, speech, updates, offered_end_ms } = ends;`; thêm `let mut names_paused = false;` trước `loop`; thay hai dòng tạo và phục vụ `run` bằng:

```rust
        let names = NamesSetup {
            enabled: handle.names_wanted() && !names_paused,
            ..launch.names.clone()
        };
        let mut run = match Run::spawn(launch, updates.clone(), offset, max_voice.clone(), names, session_unix_ms) {
            Ok(run) => run,
            Err(e) => break Some(Disabled::Spawn(e)),
        };
```

```rust
        let outcome = run.serve(launch, &segments, &speech, &updates, &offered_end_ms, stop, handle, &mut names_paused);
```

- `Run`: thêm ba trường `/// \`SetNames\` đã gửi lần cuối (kể cả qua \`Load\`).\n    names_sent: Option<bool>,\n    /// Đã gửi \`PauseNames\` trong lần chạy này.\n    pause_sent: bool,\n    /// Cờ cho luồng ghi: ghi \`PauseNames\` trước khung kế tiếp (QĐ 15; không chờ hàng ghi có chỗ).\n    pause: Arc<AtomicBool>,`. `Run::spawn`: thêm tham số `names: NamesSetup, session_unix_ms: u64`; `mpsc::sync_channel::<Request>(2)` thành `mpsc::sync_channel::<Request>(WRITER_QUEUE)`; trong `Self { … }` thêm `names_sent: Some(names.enabled), pause_sent: false, pause,`; ngay trước `let writer = {` thêm `let pause = Arc::new(AtomicBool::new(false));` và trong khối đó `let pause_w = pause.clone();`, dòng `.spawn(move || write_loop(stdin, requests, ctl_tx))` thành `.spawn(move || write_loop(stdin, requests, pause_w, ctl_tx))`; `Request::Load { … }` thêm `names,` (thay `names: speaker_protocol::NamesSetup::off(),` của Task 1); `Request::SessionStart { unix_ms: SystemTime::now()… }` thành `Request::SessionStart { unix_ms: session_unix_ms }`.
- Thêm hai phương thức vào `impl Run`:

```rust
    /// `Speech` của luồng VAD sang worker (`try_send`: hàng ghi đầy thì bỏ khoảng đó).
    fn forward_speech(&self, speech: &Receiver<SpeechSpan>) {
        for span in speech.try_iter() {
            if let Some(w) = &self.to_writer {
                let _ = w.try_send(Request::Speech {
                    start_ms: span.start_ms,
                    end_ms: span.end_ms,
                });
            }
        }
    }

    /// Đồng bộ "Lấy tên" và tạm dừng với worker. Tạm dừng (QĐ 15): bật cờ để luồng ghi đưa `PauseNames` lên trước mọi khung đang
    /// chờ (hàng ghi có thể đầy đoạn khi quá tải, rà soát lần 2 B-N-A); khung `PauseNames` trong hàng chỉ để đánh thức luồng ghi khi
    /// nó đang chờ hàng trống (đầy thì bỏ: luồng ghi đang bận, sẽ thấy cờ trước khung kế tiếp). Worker giữ tên đã chốt; không bao giờ
    /// bật lại đọc tên trong phiên; người dùng tắt "Lấy tên" thì vẫn gửi `SetNames(false)` (xóa tên). `SetNames` đầy hàng thì thử lại ở
    /// vòng sau.
    fn sync_names(&mut self, want: bool, paused: bool) {
        if paused && want && self.names_sent == Some(true) && !self.pause_sent {
            self.pause.store(true, Ordering::SeqCst);
            if let Some(w) = &self.to_writer {
                let _ = w.try_send(Request::PauseNames);
            }
            self.pause_sent = true;
            return;
        }
        if self.names_sent == Some(want) || (paused && want) {
            return;
        }
        if let Some(w) = &self.to_writer
            && w.try_send(Request::SetNames { enabled: want }).is_ok()
        {
            self.names_sent = Some(want);
        }
    }
```

- `Run::serve`: chữ ký thêm `speech: &Receiver<SpeechSpan>,` (sau `segments`) và `names_paused: &mut bool` (cuối; thêm `#[allow(clippy::too_many_arguments)]` trên hàm). Ngay sau khối `if !ready && started.elapsed() >= launch.ready_timeout { … }` thêm:

```rust
            if ready {
                self.forward_speech(speech);
                self.sync_names(handle.names_wanted(), *names_paused);
            } else {
                while speech.try_recv().is_ok() {}
            }
```

Thay khối `if behind_since.is_some_and(|t| t.elapsed() >= launch.overload_after) { … return Outcome::Disable(Disabled::Overload); }` bằng:

```rust
                if behind_since.is_some_and(|t| t.elapsed() >= launch.overload_after) {
                    // Bậc 1 (spec §11, QĐ 15): đang đọc tên thì tạm dừng đọc tên tới hết phiên, đếm lại từ đầu.
                    if self.names_sent == Some(true) && !*names_paused {
                        *names_paused = true;
                        handle.update(|s| s.names_paused = true);
                        behind_since = Some(Instant::now());
                        log::warn!(
                            "nhận giọng: speaker-worker chậm hơn thời gian thực {:?} liền: tạm dừng đọc tên tới hết phiên",
                            launch.overload_after
                        );
                        continue;
                    }
                    log::warn!(
                        "nhận giọng: speaker-worker chậm hơn thời gian thực {:?} liền ({} đoạn chờ, đã gửi {sent}, bỏ {dropped})",
                        launch.overload_after,
                        self.waiting.len()
                    );
                    return Outcome::Disable(Disabled::Overload);
                }
```

- `read_loop`: thay khối `let response = match read_frame::<_, Response>(&mut stdout) { … };` bằng:

```rust
        let response = match read_frame::<_, Response>(&mut stdout) {
            Ok(Some(r)) => r,
            Ok(None) => break before_ready(got_ready, "speaker-worker đóng stdout".to_string()),
            Err(e) => break before_ready(got_ready, format!("khung từ speaker-worker hỏng: {e}")),
        };
```

và thay hai nhánh `Response::Voices { voices, .. } if voices.len() > MAX_VOICES_ON_WIRE => …` và `Response::Voices { voices, .. } => { … }` bằng:

```rust
            Response::Voices { voices, participants } if !voices_fit(&voices, &participants) => {
                break format!("Voices vượt giới hạn ({} giọng, {} người tham dự)", voices.len(), participants.len());
            }
            Response::Voices { voices, participants } => {
                let voices = voices
                    .into_iter()
                    .map(|v| VoiceInfo {
                        voice: map(v.voice),
                        ..v
                    })
                    .collect();
                if !forward(SpeakerUpdate::Voices(voices)) || !forward(SpeakerUpdate::Participants(participants)) {
                    break flooded();
                }
            }
            Response::ReaderState { app_version, .. } if app_version.as_ref().is_some_and(|v| v.len() > MAX_APP_VERSION_BYTES) => {
                break "ReaderState vượt giới hạn".into();
            }
            Response::ReaderState {
                app,
                app_version,
                state,
                recipe_version,
                learned,
            } => {
                if !forward(SpeakerUpdate::Reader(ReaderInfo {
                    app,
                    app_version,
                    state,
                    recipe_version,
                    learned,
                })) {
                    break flooded();
                }
            }
```

**(d) `crates/pipeline/src/bin/fake_speaker_worker.rs`.** Chú thích đầu file: thêm lệnh `named` (ở `Segment` đầu, sau `Assign`: `Voices` có giọng 1 tên "Lan", người tham dự "Lan", "Minh", rồi `ReaderState { Teams, NoPermission }`), `long_name` (ở `Segment` đầu: `Voices` có tên 200 byte); log thêm `names enabled=<bool> recipe=<số byte>`, `session unix=<ms>`, `speech <đầu>-<cuối>`, `set_names <bool>`, `pause_names`. `Plan` thêm `named: bool, long_name: bool`; `parse` thêm `"named" => p.named = true,`, `"long_name" => p.long_name = true,`. Nhánh `Request::Load { model_path, model_sha256, config, .. }` thành `Request::Load { model_path, model_sha256, config, names }` và, sau dòng `log(&format!("load model=…"))`:

```rust
                log(&format!("names enabled={} recipe={}", names.enabled, names.recipe_json.len()));
```

Nhánh `Request::SessionStart { .. } => { log("session"); … }` thành `Request::SessionStart { unix_ms } => { log(&format!("session unix={unix_ms}")); Vec::new() }`. Nhánh tạm của Task 1 `Request::Speech { .. } | Request::SetNames { .. } | Request::PauseNames => Vec::new(),` thay bằng:

```rust
            Request::Speech { start_ms, end_ms } => {
                log(&format!("speech {start_ms}-{end_ms}"));
                Vec::new()
            }
            Request::SetNames { enabled } => {
                log(&format!("set_names {enabled}"));
                Vec::new()
            }
            Request::PauseNames => {
                log("pause_names");
                Vec::new()
            }
```

Trong `reply`, trước `out` cuối hàm (sau khối `if plan.big_voices … else if seen.insert(voice) { … }`):

```rust
    if plan.named && segments == 1 {
        let name = speaker_protocol::PersonName::new;
        out.push(Response::Voices {
            voices: vec![VoiceInfo {
                name: name("Lan"),
                name_source: Some(speaker_protocol::NameSource::Indicator),
                ..VoiceInfo::new(voice, 1_000, false)
            }],
            participants: vec![name("Lan").unwrap(), name("Minh").unwrap()],
        });
        out.push(Response::ReaderState {
            app: Some(speaker_protocol::MeetingApp::Teams),
            app_version: Some("26276".into()),
            state: speaker_protocol::ReaderStatus::NoPermission,
            recipe_version: 1,
            learned: 0,
        });
    }
    if plan.long_name && segments == 1 {
        // Không qua `PersonName::new` (từ chối tên dài): dựng thẳng qua serde như một worker hỏng.
        let long: speaker_protocol::PersonName = serde_json::from_value(serde_json::json!("x".repeat(200))).unwrap();
        out.push(Response::Voices {
            voices: vec![VoiceInfo {
                name: Some(long),
                ..VoiceInfo::new(voice, 1_000, false)
            }],
            participants: Vec::new(),
        });
    }
```

(`serde_json` đã là phụ thuộc của `pipeline`, `crates/pipeline/Cargo.toml:19`.)

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p pipeline --lib 2>&1 | grep -E "^test result|FAILED|panicked" ; cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: lib 353 + 4 mới đạt; `speaker_client` 26 + 5 mới = 31 đạt (test cũ `labels_come_back…` vẫn thấy `session`, `load model=…` vì kiểm bằng `contains`).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p pipeline && cargo fmt -p pipeline -- --check && cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch. Không commit.

---

### Task 14: Luồng phụ đề: `EventSink::names`, `EventSink::reader`

**Files:**
- Modify: `crates/pipeline/src/subtitle.rs` (kiểu `Names`, `NamedVoice`)
- Modify: `crates/pipeline/src/engine.rs` (neo theo tên vì Task 13 đã chèn dòng ở `vad_loop` và `on_speaker`, số dòng ở HEAD lệch khoảng +5 sau đó: `trait EventSink`; `struct Composer` và `Composer::new`; `fn drain_speaker`; nhánh `Msg::Speaker`; `fn on_speaker`; thêm `emit_names` sau `fn emit_roster`; `struct Sink` của mod `tests`)

- [ ] **Step 1: Viết test đỏ**

`engine.rs`, mod `tests`: `struct Sink` thêm hai trường `names: Mutex<Vec<Names>>,` và `readers: Mutex<Vec<ReaderInfo>>,`; `impl EventSink for Sink` thêm:

```rust
        fn names(&self, n: &Names) {
            self.names.lock().unwrap().push(n.clone());
        }
        fn reader(&self, r: &ReaderInfo) {
            self.readers.lock().unwrap().push(r.clone());
        }
```

và thêm test (cuối mod; `use crate::speaker::ReaderInfo; use crate::subtitle::{NamedVoice, Names}; use speaker_protocol::{MeetingApp, PersonName, ReaderStatus};` ở đầu mod nếu chưa có):

```rust
    /// Kế hoạch 04: tên và người tham dự tới app một lần mỗi lần đổi (lặp lại không phát), sau bảng giọng của cùng vòng.
    #[test]
    fn names_and_participants_reach_the_sink_once_per_change() {
        let mut h = harness();
        let (link, ends) = SpeakerLink::pair();
        h.c.speaker_rx = Some(link.updates);
        let named = |name: Option<&str>| VoiceInfo {
            name: name.and_then(PersonName::new),
            ..VoiceInfo::new(1, 1_000, false)
        };
        let people = || SpeakerUpdate::Participants(vec![PersonName::new("Lan").unwrap(), PersonName::new("Minh").unwrap()]);
        ends.updates.send(SpeakerUpdate::Voices(vec![named(None)])).unwrap();
        ends.updates.send(people()).unwrap();
        h.c.drain_speaker();
        ends.updates.send(SpeakerUpdate::Voices(vec![named(Some("Lan"))])).unwrap();
        ends.updates.send(people()).unwrap();
        h.c.drain_speaker();
        ends.updates.send(SpeakerUpdate::Voices(vec![named(Some("Lan"))])).unwrap();
        h.c.drain_speaker();
        let names = h.sink.names.lock().unwrap();
        assert_eq!(names.len(), 2, "lần lặp lại không phát");
        assert!(names[0].voices.is_empty());
        assert_eq!(names[0].participants, ["Lan", "Minh"]);
        assert_eq!(
            names[1].voices,
            [NamedVoice {
                id: 1,
                name: "Lan".into(),
                room_index: None
            }]
        );
        assert!(!format!("{:?}", names[1]).contains("Lan"), "Debug không in tên");
    }

    #[test]
    fn reader_states_go_straight_to_the_sink() {
        let mut h = harness();
        h.feed(Msg::Speaker(SpeakerUpdate::Reader(ReaderInfo {
            app: Some(MeetingApp::Teams),
            app_version: None,
            state: ReaderStatus::NoPermission,
            recipe_version: 1,
            learned: 0,
        })));
        assert_eq!(h.sink.readers.lock().unwrap()[0].state, ReaderStatus::NoPermission);
    }

    /// QĐ 31 (rà soát B-N8): trạng thái `Off` ("Lấy tên" tắt) xóa tên tự động và người tham dự; `Paused` (quá tải) giữ tên.
    #[test]
    fn reader_off_clears_the_names_but_a_pause_keeps_them() {
        let mut h = harness();
        let lan = VoiceInfo {
            name: PersonName::new("Lan"),
            ..VoiceInfo::new(1, 1_000, false)
        };
        h.feed(Msg::Speaker(SpeakerUpdate::Voices(vec![lan])));
        let reader = |state| {
            SpeakerUpdate::Reader(ReaderInfo {
                app: None,
                app_version: None,
                state,
                recipe_version: 1,
                learned: 0,
            })
        };
        h.feed(Msg::Speaker(reader(ReaderStatus::Paused)));
        assert_eq!(h.sink.names.lock().unwrap().last().unwrap().voices.len(), 1, "tạm dừng giữ tên");
        h.feed(Msg::Speaker(reader(ReaderStatus::Off)));
        let last = h.sink.names.lock().unwrap().last().unwrap().clone();
        assert!(last.voices.is_empty() && last.participants.is_empty(), "tắt \"Lấy tên\": xóa tên");
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p pipeline --lib -- engine::tests::names_and engine::tests::reader_states engine::tests::reader_off 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`Names`, `NamedVoice`, `EventSink::names` chưa có).

- [ ] **Step 3: Viết mã**

`crates/pipeline/src/subtitle.rs`: thêm `use std::fmt;` và sau `struct Roster`:

```rust
/// Tên đọc từ app họp (spec 2026-10-26-phan-biet-nguoi-noi §6.6, §9; kế hoạch 04): tên của các giọng có tên và người tham dự. Tên
/// chưa qua `clean_name` của app. `Debug` không in tên.
#[derive(Clone, Default, PartialEq, Eq)]
pub struct Names {
    pub voices: Vec<NamedVoice>,
    pub participants: Vec<String>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct NamedVoice {
    pub id: u32,
    pub name: String,
    /// Một tên ở nhiều giọng (máy chung phòng): giọng thứ mấy.
    pub room_index: Option<u32>,
}

impl fmt::Debug for Names {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Names({} giọng có tên, {} người tham dự)", self.voices.len(), self.participants.len())
    }
}

impl fmt::Debug for NamedVoice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "NamedVoice({}, <{} ký tự>, {:?})", self.id, self.name.chars().count(), self.room_index)
    }
}
```

`engine.rs`:
- `use crate::speaker::{SpeakerLink, SpeakerTap, SpeakerUpdate, UPDATE_CHANNEL_CAP};` (dòng 41) thêm `ReaderInfo`; `use crate::subtitle::{…}` (dòng 45) thêm `NamedVoice, Names`; `use speaker_protocol::Source;` (dòng 54) thành `use speaker_protocol::{PersonName, ReaderStatus, Source};`.
- `EventSink`, sau `fn roster`:

```rust
    /// Tên đọc từ app họp của các giọng và người tham dự đổi (kế hoạch 04). Mặc định bỏ qua.
    fn names(&self, _names: &Names) {}
    /// Trạng thái bộ đọc tên (dòng mời cấp quyền, spec §6.7). Mặc định bỏ qua.
    fn reader(&self, _info: &ReaderInfo) {}
```

- `Composer`: thêm ba trường sau `roster`:

```rust
    /// Tên đọc từ app họp của từng giọng: (tên, số phòng) (kế hoạch 04).
    names: BTreeMap<u32, (Option<PersonName>, Option<u32>)>,
    participants: Vec<PersonName>,
    /// Tên hay người tham dự vừa đổi: phát `EventSink::names` một lần cho cả loạt.
    names_dirty: bool,
```

và trong `new`: `names: BTreeMap::new(), participants: Vec::new(), names_dirty: false,`.
- `on_speaker`: thay nhánh `SpeakerUpdate::Voices(voices) => { … }` bằng:

```rust
            SpeakerUpdate::Voices(voices) => {
                for v in voices {
                    self.roster.insert(v.voice, RosterVoice { id: v.voice, room: v.mic });
                    let named = (v.name, v.room_index);
                    if self.names.get(&v.voice) != Some(&named) {
                        self.names.insert(v.voice, named);
                        self.names_dirty = true;
                    }
                }
                true
            }
            SpeakerUpdate::Participants(p) => {
                if p != self.participants {
                    self.participants = p;
                    self.names_dirty = true;
                }
                false
            }
            SpeakerUpdate::Reader(info) => {
                // QĐ 31: "Lấy tên" tắt (`Off`) thì bỏ mọi tên tự động và người tham dự (kể cả của lần chạy worker trước); tạm dừng
                // vì quá tải (`Paused`) giữ tên.
                if info.state == ReaderStatus::Off
                    && (self.names.values().any(|(n, _)| n.is_some()) || !self.participants.is_empty())
                {
                    self.names.clear();
                    self.participants.clear();
                    self.names_dirty = true;
                }
                self.sink.reader(&info);
                false
            }
```

(bỏ nhánh tạm của Task 13); trong nhánh `SpeakerUpdate::Merged { from, into }` thêm `self.names_dirty |= self.names.remove(&from).is_some();` sau `self.roster.remove(&from);`.
- `drain_speaker`: sau `if roster_changed { self.emit_roster(); }` thêm `if std::mem::take(&mut self.names_dirty) { self.emit_names(); }`. `Msg::Speaker(update)` (chỉ test) thêm cùng dòng đó sau `emit_roster`.
- Sau `emit_roster`:

```rust
    fn emit_names(&self) {
        self.sink.names(&Names {
            voices: self
                .names
                .iter()
                .filter_map(|(&id, (name, room_index))| {
                    name.as_ref().map(|n| NamedVoice { id, name: n.as_str().to_string(), room_index: *room_index })
                })
                .collect(),
            participants: self.participants.iter().map(|p| p.as_str().to_string()).collect(),
        });
    }
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p pipeline --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: 360 đạt (353 + 4 của Task 13 + 3 mới).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p pipeline && cargo fmt -p pipeline -- --check && cargo clippy -p pipeline --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch. Không commit.

---

### Task 15: App: tên tự động, "· giọng k", người tham dự, dòng mời; `get_transcript` phát lại bảng

**Files:**
- Modify: `src-tauri/src/transcript/speakers.rs` (`Voice` dòng 89–99; `SpeakerBook` dòng 101–110; thêm `set_names`, `set_reader`; `voice_view` dòng 205–221; test)
- Modify: `src-tauri/src/transcript/store.rs` (thêm `names`, `reader` sau `roster` dòng 151–154)
- Modify: `src-tauri/src/session.rs` (`impl EventSink for TauriSink`, sau `fn roster` dòng 1008–1017)
- Modify: `src-tauri/src/i18n.rs` (trường `speaker_room_voice`)
- Modify: `src-tauri/src/commands.rs:172-174` (`get_transcript`)
- Test: `src-tauri/src/transcript/speakers.rs`, `src-tauri/src/speaker/mod.rs`

- [ ] **Step 1: Viết test đỏ**

`src-tauri/src/transcript/speakers.rs`, mod `tests` thêm (dùng `roster` có sẵn):

```rust
    use pipeline::subtitle::{NamedVoice, Names};
    use speaker_protocol::ReaderStatus;

    fn meeting(list: &[(u32, &str, Option<u32>)], participants: &[&str]) -> Names {
        Names {
            voices: list
                .iter()
                .map(|&(id, n, k)| NamedVoice { id, name: n.into(), room_index: k })
                .collect(),
            participants: participants.iter().map(|s| s.to_string()).collect(),
        }
    }

    /// Spec §6.6, §9: tên đọc từ app họp làm nhãn (nguồn `name`); tên đổi tay luôn thắng.
    #[test]
    fn meeting_names_label_voices_until_the_user_renames() {
        let mut b = SpeakerBook::default();
        b.apply(&roster(&[1, 2]));
        assert!(b.set_names(&meeting(&[(1, "Lan Nguyễn", None)], &["Lan Nguyễn", "Minh Trần"])));
        let v = b.view(&VI);
        assert_eq!((v.voices[0].label.as_str(), v.voices[0].source), ("Lan Nguyễn", NameSource::Name));
        assert_eq!(v.voices[1].label, "Người 2");
        assert_eq!(v.participants, ["Lan Nguyễn", "Minh Trần"]);
        b.rename(1, Some("Chị Lan".into())).unwrap();
        assert_eq!(b.view(&VI).voices[0].source, NameSource::User);
        assert!(!b.set_names(&meeting(&[(1, "Lan Nguyễn", None)], &["Lan Nguyễn", "Minh Trần"])), "không đổi gì");
    }

    #[test]
    fn a_shared_room_name_is_numbered_in_the_ui_language() {
        let mut b = SpeakerBook::default();
        b.apply(&roster(&[1, 2]));
        b.set_names(&meeting(&[(1, "Phòng A", Some(1)), (2, "Phòng A", Some(2))], &["Phòng A"]));
        let labels = |s| b.view(s).voices.into_iter().map(|v| v.label).collect::<Vec<_>>();
        assert_eq!(labels(&VI), ["Phòng A · giọng 1", "Phòng A · giọng 2"]);
        assert_eq!(labels(&EN), ["Phòng A · voice 1", "Phòng A · voice 2"]);
    }

    /// Rà soát A-N6 của 03: mọi tên tới từ app họp qua `clean_name`; trùng thì bỏ; rỗng hay quá dài sau làm sạch thì bỏ.
    #[test]
    fn meeting_names_are_cleaned_deduplicated_and_capped() {
        let mut b = SpeakerBook::default();
        b.apply(&roster(&[1, 2]));
        let long = "x".repeat(41);
        b.set_names(&meeting(&[(1, "\u{202E}Lan", None), (2, "\u{200B}", None)], &["Lan", "Lan", "\u{202E}Lan", long.as_str()]));
        let v = b.view(&VI);
        assert_eq!((v.voices[0].label.as_str(), v.voices[1].label.as_str()), ("Lan", "Người 2"));
        assert_eq!(v.participants, ["Lan"]);
        let many: Vec<String> = (0..80).map(|i| format!("Người tham dự {i}")).collect();
        let refs: Vec<&str> = many.iter().map(String::as_str).collect();
        b.set_names(&meeting(&[], &refs));
        assert_eq!(b.view(&VI).participants.len(), MAX_PARTICIPANTS);
    }

    /// Spec §6.7: dòng mời khi bộ đọc báo chưa có quyền; người dùng tắt tính năng thì thôi.
    #[test]
    fn ask_access_follows_the_reader() {
        let mut b = SpeakerBook::default();
        assert!(b.set_reader(ReaderStatus::NoPermission));
        assert!(b.view(&VI).ask_access);
        assert!(!b.set_reader(ReaderStatus::NoPermission), "không đổi");
        assert!(b.set_reader(ReaderStatus::Ok));
        assert!(!b.view(&VI).ask_access);
        b.turn_off();
        assert!(!b.set_reader(ReaderStatus::NoPermission));
        assert!(!b.view(&VI).ask_access);
        let mut b = SpeakerBook::default();
        b.set_reader(ReaderStatus::NoPermission);
        assert!(b.set_reader(ReaderStatus::Paused), "tạm dừng vì quá tải: không mời");
        assert!(!b.view(&VI).ask_access);
    }

    /// QĐ 31 (rà soát B-N8): người dùng tắt "Lấy tên" thì app tự xóa tên tự động, người tham dự, dòng mời (worker có thể đã chết).
    #[test]
    fn clearing_names_drops_auto_names_participants_and_the_prompt() {
        let mut b = SpeakerBook::default();
        b.apply(&roster(&[1]));
        b.set_names(&meeting(&[(1, "Lan Nguyễn", None)], &["Lan Nguyễn"]));
        b.set_reader(ReaderStatus::NoPermission);
        assert!(b.clear_names());
        let v = b.view(&VI);
        assert!(v.participants.is_empty() && !v.ask_access);
        assert_ne!(v.voices[0].label, "Lan Nguyễn");
        assert!(!b.clear_names(), "không còn gì để xóa");
    }

    /// Rà soát lần 2 B-Q-B: sau khi người dùng tắt "Lấy tên", worker chạy lại (sau tạm dừng, hay đúng lúc đang chờ chạy lại) có thể
    /// gửi `Voices` mà luồng phụ đề phát lại kèm các tên cũ của lần chạy trước: tên cũ KHÔNG được hiện lại, cũng không mời cấp quyền,
    /// tới khi người dùng bật lại "Lấy tên" (`allow_names`) hay phiên mới.
    #[test]
    fn names_stay_cleared_until_the_switch_is_turned_back_on() {
        let mut b = SpeakerBook::default();
        b.apply(&roster(&[1, 2]));
        b.set_names(&meeting(&[(1, "Lan Nguyễn", None)], &["Lan Nguyễn"]));
        b.clear_names();
        assert!(!b.set_names(&meeting(&[(1, "Lan Nguyễn", None)], &["Lan Nguyễn", "Minh Trần"])), "tên cũ phát lại: bỏ");
        assert!(!b.set_reader(ReaderStatus::NoPermission), "không mời khi \"Lấy tên\" tắt");
        let v = b.view(&VI);
        assert!(v.participants.is_empty() && !v.ask_access);
        assert_ne!(v.voices[0].label, "Lan Nguyễn");
        b.allow_names();
        assert!(b.set_names(&meeting(&[(2, "Minh Trần", None)], &["Minh Trần"])));
        assert_eq!(b.view(&VI).voices[1].label, "Minh Trần");
    }

    #[test]
    fn names_before_their_voice_apply_when_it_appears() {
        let mut b = SpeakerBook::default();
        b.set_names(&meeting(&[(3, "Minh Trần", None)], &[]));
        b.apply(&roster(&[3]));
        assert_eq!(b.view(&VI).voices[0].label, "Minh Trần");
    }
```

`src-tauri/src/speaker/mod.rs`, mod `tests` thêm:

```rust
    /// QĐ 20 của kế hoạch 04 (rà soát B-N12 của 03): cửa sổ chính mở hay tải lại giữa phiên thì nhận lại bảng người nói (có người
    /// tham dự) ngay khi đọc bản chép lời.
    #[test]
    fn reading_the_transcript_sends_the_roster_again() {
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let to_main = rosters(&app, crate::window::MAIN);
        let main = crate::test_support::window(&app, crate::window::MAIN);
        crate::test_support::invoke(&main, "get_transcript", serde_json::json!({})).unwrap();
        assert_eq!(wait_for(&to_main, 1).len(), 1);
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- transcript::speakers speaker:: 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`set_names`, `set_reader`, `MAX_PARTICIPANTS`, `speaker_room_voice` chưa có).

- [ ] **Step 3: Viết mã**

`src-tauri/src/i18n.rs`: trong `struct Strings` thêm sau `speaker_voice`:

```rust
    /// Một tên khớp nhiều giọng (máy chung phòng họp, spec 2026-10-26-phan-biet-nguoi-noi §6.6): `{name}` là tên, `{k}` thứ tự giọng.
    pub speaker_room_voice: &'static str,
```

giá trị: `EN` `"{name} · voice {k}"`, `VI` `"{name} · giọng {k}"`, `JA` `"{name} · 声{k}"`, `ZH` `"{name} · 声音{k}"`, `KO` `"{name} · 목소리 {k}"`; trong hàm liệt kê (dòng 186–235) thêm `speaker_room_voice,` vào phần destructure và `("speaker_room_voice", speaker_room_voice),` vào `vec![…]`.

`src-tauri/src/transcript/speakers.rs`:
- `use std::collections::BTreeMap;` thành `use std::collections::{BTreeMap, BTreeSet};`; thêm `use pipeline::subtitle::Names;` và `use speaker_protocol::ReaderStatus;`.
- Sau `MAX_NAME_BYTES` thêm `/// Người tham dự tối đa trong danh sách chọn tên (như giới hạn khung của giao thức).\npub const MAX_PARTICIPANTS: usize = 64;`.
- `struct Voice`: bỏ trường `auto_name` (cùng chú thích của nó).
- `struct SpeakerBook`: thêm sau `merged`:

```rust
    /// Tên đọc từ app họp (kế hoạch 04): giọng → (tên đã làm sạch, số phòng). Riêng khỏi `voices`, nên tên tới trước hay sau bảng
    /// giọng đều đúng.
    auto: BTreeMap<u32, (String, Option<u32>)>,
    /// Người dùng đã tắt "Lấy tên" trong phiên này (QĐ 31): bỏ mọi tên tự động tới sau (worker chạy lại có thể phát lại tên cũ) và
    /// không mời cấp quyền, tới khi bật lại (`allow_names`) hay phiên mới (`SpeakerBook` dựng mới mỗi phiên).
    names_off: bool,
```

- Thêm vào `impl SpeakerBook` (sau `merge`):

```rust
    /// Tên đọc từ app họp (`EventSink::names`): mọi tên qua [`clean_name`] (tên do người khác đặt); rỗng hay quá dài sau khi làm
    /// sạch thì bỏ. Người tham dự bỏ trùng, tối đa [`MAX_PARTICIPANTS`]. Tên đổi tay vẫn thắng (spec §6.6). Trả `true` khi cần vẽ lại.
    pub fn set_names(&mut self, names: &Names) -> bool {
        if self.off || self.names_off {
            return false;
        }
        let auto: BTreeMap<u32, (String, Option<u32>)> = names
            .voices
            .iter()
            .filter_map(|v| Some((v.id, (clean_name(&v.name).ok().flatten()?, v.room_index))))
            .collect();
        let mut seen = BTreeSet::new();
        let participants: Vec<String> = names
            .participants
            .iter()
            .filter_map(|p| clean_name(p).ok().flatten())
            .filter(|p| seen.insert(p.clone()))
            .take(MAX_PARTICIPANTS)
            .collect();
        let changed = auto != self.auto || participants != self.participants;
        self.auto = auto;
        self.participants = participants;
        changed
    }

    /// Trạng thái bộ đọc tên: dòng mời cấp quyền Trợ năng khi chưa có quyền (spec §6.7; QĐ 7 của kế hoạch 04). Trả `true` khi đổi.
    pub fn set_reader(&mut self, state: ReaderStatus) -> bool {
        let ask = !self.off && !self.names_off && state == ReaderStatus::NoPermission;
        let changed = ask != self.ask_access;
        self.ask_access = ask;
        changed
    }

    /// Người dùng tắt "Lấy tên" (QĐ 31): bỏ tên tự động, người tham dự, dòng mời; tên đổi tay giữ nguyên; từ đó bỏ mọi tên tự động
    /// tới sau cho tới `allow_names`. Trả `true` khi đổi.
    pub fn clear_names(&mut self) -> bool {
        let changed = !self.auto.is_empty() || !self.participants.is_empty() || self.ask_access;
        self.auto.clear();
        self.participants.clear();
        self.ask_access = false;
        self.names_off = true;
        changed
    }

    /// Người dùng bật lại "Lấy tên": nhận tên tự động trở lại.
    pub fn allow_names(&mut self) {
        self.names_off = false;
    }
```

- `voice_view`: thay khối `let (label, source) = match (&v.user_name, &v.auto_name) { … };` bằng:

```rust
        let (label, source) = match (&v.user_name, self.auto.get(&root)) {
            (Some(name), _) => (name.clone(), NameSource::User),
            (None, Some((name, None))) => (name.clone(), NameSource::Name),
            (None, Some((name, Some(k)))) => (
                s.speaker_room_voice.replace("{name}", name).replace("{k}", &k.to_string()),
                NameSource::Name,
            ),
            (None, None) => (s.speaker_voice.replace("{n}", &v.order.to_string()), NameSource::Voice),
        };
```

- Chú thích của `RosterView.participants`, `ask_access` bỏ "Kế hoạch 03: luôn rỗng/false" (giờ kế hoạch 04 đặt).

`src-tauri/src/transcript/store.rs`: `use` thêm `pipeline::subtitle::Names` và `speaker_protocol::ReaderStatus`; sau `pub fn roster(…)`:

```rust
    /// Tên đọc từ app họp và người tham dự của phiên `session` (`EventSink::names`). Trả bảng mới để phát khi đổi, dựng trong cùng
    /// lần khóa (QĐ 25 của 03). Làm sạch tên trong lúc khóa: khung của worker đã giới hạn ≤ 64 tên × 160 byte.
    pub fn names(&self, session: u64, names: &Names) -> Option<RosterView> {
        let mut current = self.lock();
        (current.meta.session == session && current.speakers.set_names(names)).then(|| current.roster_view())
    }

    /// Trạng thái bộ đọc tên của phiên `session` (dòng mời cấp quyền, spec §6.7). Trả bảng mới khi đổi.
    pub fn reader(&self, session: u64, state: ReaderStatus) -> Option<RosterView> {
        let mut current = self.lock();
        (current.meta.session == session && current.speakers.set_reader(state)).then(|| current.roster_view())
    }

    /// Người dùng tắt "Lấy tên" (QĐ 31): xóa tên tự động, người tham dự, dòng mời của phiên hiện tại. Trả bảng mới khi đổi.
    pub fn clear_names(&self) -> Option<RosterView> {
        let mut current = self.lock();
        current.speakers.clear_names().then(|| current.roster_view())
    }

    /// Người dùng bật lại "Lấy tên": bảng người nói nhận tên tự động trở lại.
    pub fn allow_names(&self) {
        self.lock().speakers.allow_names();
    }
```

`src-tauri/src/session.rs`: `use pipeline::subtitle::{…}` thêm `Names`; thêm `use pipeline::speaker::ReaderInfo;`; trong `impl EventSink for TauriSink<R>` sau `fn roster`:

```rust
    /// Tên đọc từ app họp (kế hoạch 04): bảng người nói tính lại trong một lần khóa, phát khi đổi. Không có tên trong log.
    fn names(&self, names: &Names) {
        if let Some(view) = self.app.try_state::<TranscriptStore>().and_then(|t| t.names(self.session, names)) {
            events::speaker_roster(&self.app, &view);
        }
    }

    /// Trạng thái bộ đọc tên: ghi log (không có tên) và dòng mời cấp quyền.
    fn reader(&self, info: &ReaderInfo) {
        log::info!(
            "đọc tên: {:?} ({:?}, công thức {}, tự học {})",
            info.state,
            info.app,
            info.recipe_version,
            info.learned
        );
        if let Some(view) = self.app.try_state::<TranscriptStore>().and_then(|t| t.reader(self.session, info.state)) {
            events::speaker_roster(&self.app, &view);
        }
    }
```

`src-tauri/src/commands.rs`, thay thân `get_transcript`:

```rust
pub fn get_transcript<R: Runtime>(app: AppHandle<R>) -> Transcript {
    let transcript = data::current(&app);
    // Cửa sổ chính mở hay tải lại giữa phiên: phát lại bảng người nói để có danh sách người tham dự (QĐ 20 của kế hoạch 04). Chỉ khi
    // phiên có giọng: bản phát hành không phát sự kiện mới nào.
    crate::speaker::emit_roster(&app);
    transcript
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: 927 đạt (919 + 7 của `speakers` + 1 của `speaker`), 6 bỏ qua. Test i18n hiện có (mọi khóa có đủ 5 ngôn ngữ, cùng chỗ giữ chỗ) đạt.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p meeting-translator && cargo fmt -p meeting-translator -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch. Không commit.

---

### Task 16: App: công thức build sẵn và "Lấy tên" vào worker; đổi "Lấy tên" giữa phiên; trả `AXEnhancedUserInterface` lúc mở app

**Files:**
- Modify: `src-tauri/Cargo.toml` (thêm `speaker-recipe`)
- Modify: `src-tauri/src/speaker/mod.rs` (dòng 70–112 `start_for_session`; thêm `EUI_MARKER_FILE`, `names_setup`, `names_changed`, `pub mod eui_macos`)
- Create: `src-tauri/src/speaker/eui_macos.rs`
- Modify: `src-tauri/src/actions.rs:50-54` (`commit_settings`), `src-tauri/src/lib.rs` (sau dòng 159 `let pidfile = …`)

- [ ] **Step 1: Viết test đỏ**

`src-tauri/Cargo.toml`, `[dependencies]` sau `speaker-protocol = …`: `speaker-recipe = { path = "../crates/speaker-recipe" }`.

`src-tauri/src/speaker/mod.rs`, mod `tests` thêm:

```rust
    /// Kế hoạch 04: phiên mang công thức build sẵn (hợp lệ), công tắc "Lấy tên" và file dấu `AXEnhancedUserInterface`.
    #[test]
    fn the_session_launch_carries_the_builtin_recipe_and_the_names_switch() {
        let app = crate::test_support::mock_app();
        let mut s = Settings::defaults(UiLanguage::Vi);
        let n = names_setup(app.handle(), &s);
        assert!(n.enabled, "bật sẵn (spec §8.3)");
        assert!(speaker_recipe::parse(&n.recipe_json).is_ok_and(|r| r.dropped.is_empty()));
        assert!(n.eui_marker.as_deref().is_some_and(|p| p.ends_with(EUI_MARKER_FILE)));
        s.speaker_names = false;
        assert!(!names_setup(app.handle(), &s).enabled);
    }

    /// QĐ 28 (rà soát B-Q6, B-N13): bản dev và bản cài dùng chung thư mục dữ liệu nên file dấu tách theo loại build (như `data-dev.db`).
    #[test]
    fn the_eui_marker_file_depends_on_the_build() {
        assert_eq!(eui_marker_file(true), "speaker-eui-dev.json");
        assert_eq!(eui_marker_file(false), "speaker-eui.json");
        assert_eq!(EUI_MARKER_FILE, eui_marker_file(cfg!(debug_assertions)));
    }

    /// Spec §8.3: tắt "Lấy tên" giữa phiên thì worker thôi đọc tên ngay (client gửi `SetNames`); bật lại cũng vậy.
    #[test]
    fn the_names_switch_reaches_the_running_worker() {
        let app = crate::test_support::mock_app();
        let handle = SpeakerHandle::default();
        handle.set_names(true);
        *app.state::<Running>().0.lock().unwrap() = Some(handle.clone());
        let mut next = app.state::<AppState>().settings();
        next.speaker_names = false;
        crate::actions::commit_settings(app.handle(), next.clone());
        assert!(!handle.names_wanted());
        next.speaker_names = true;
        crate::actions::commit_settings(app.handle(), next);
        assert!(handle.names_wanted());
    }
```

`src-tauri/src/speaker/eui_macos.rs` (phần test, mã ở Step 3):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_main_process_points_at_its_bundle() {
        let p = Path::new("/Applications/zoom.us.app/Contents/MacOS/zoom.us");
        assert_eq!(bundle_dir_of(p), Some(Path::new("/Applications/zoom.us.app")));
        assert_eq!(bundle_dir_of(Path::new("/usr/bin/true")), None);
    }

    fn write_marker(dir: &Path, pids: &[i32]) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let marker = dir.join("speaker-eui.json");
        let entries = pids.iter().map(|&pid| EuiEntry { pid, app: MeetingApp::Teams }).collect();
        std::fs::write(&marker, serde_json::to_vec(&EuiMarker { entries }).unwrap()).unwrap();
        marker
    }

    /// QĐ 28 (rà soát B-Q6): chỉ bỏ khỏi dấu mục đã trả được (pid 1) hay mục mà pid không còn là đúng app (pid 3); mục trả không được
    /// (pid 2: mất quyền giữa chừng) giữ cho lần sau.
    #[test]
    fn restore_keeps_entries_it_could_not_reset() {
        let dir = std::env::temp_dir().join(format!("eui-app-keep-{}", std::process::id()));
        let marker = write_marker(&dir, &[1, 2, 3]);
        let n = restore_with(&marker, |e| match e.pid {
            1 => Some(true),
            2 => Some(false),
            _ => None,
        });
        assert_eq!(n, 1);
        let left = serde_json::from_slice::<EuiMarker>(&std::fs::read(&marker).unwrap()).unwrap().entries;
        assert_eq!(left.iter().map(|e| e.pid).collect::<Vec<_>>(), [2]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Rà soát lần 3: ba kết quả đọc trước khi trả; app họp treo quá hạn chờ thì giữ mục để thử lại lần sau.
    #[test]
    fn reads_decide_drop_keep_or_reset() {
        assert_eq!(before_reset(Read::On), Some(true), "đang bật: đặt lại");
        assert_eq!(before_reset(Read::NotOn), None, "không phải bật: bỏ mục, không đặt gì");
        assert_eq!(before_reset(Read::Unknown), Some(false), "không đọc được: giữ mục");
    }

    #[test]
    fn restore_removes_the_marker_when_nothing_is_left() {
        let dir = std::env::temp_dir().join(format!("eui-app-gone-{}", std::process::id()));
        let marker = write_marker(&dir, &[std::process::id() as i32]);
        assert_eq!(restore_with(&marker, |_| None), 0);
        assert!(!marker.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- speaker:: 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`names_setup`, `EUI_MARKER_FILE`, `eui_marker_file`, `restore_with` chưa có).

- [ ] **Step 3: Viết mã**

`src-tauri/src/speaker/mod.rs`:
- Sau `DEV_MODEL_FILE`:

```rust
/// File dấu `AXEnhancedUserInterface` (QĐ 8, 28 của kế hoạch 04) trong thư mục dữ liệu của app, tách theo loại build.
pub const EUI_MARKER_FILE: &str = eui_marker_file(cfg!(debug_assertions));

/// Bản phát hành: `speaker-eui.json`. Bản debug: `speaker-eui-dev.json` (như `data-dev.db`, `db::db_file_name`): bản dev và bản cài
/// cùng identifier nên cùng thư mục dữ liệu; tách file để worker của bản này không trả EUI mà worker của bản kia đang giữ.
pub const fn eui_marker_file(debug: bool) -> &'static str {
    if debug { "speaker-eui-dev.json" } else { "speaker-eui.json" }
}

#[cfg(target_os = "macos")]
pub mod eui_macos;
```

- `use` thêm `speaker_protocol::NamesSetup`.
- Thêm hàm:

```rust
/// Phần tên của `Load` (kế hoạch 04): công tắc "Lấy tên", công thức build sẵn (kế hoạch 06 thay bằng bản đã kiểm chữ ký), file dấu.
fn names_setup<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> NamesSetup {
    NamesSetup {
        enabled: settings.speaker_names,
        recipe_json: speaker_recipe::BUILTIN_JSON.to_string(),
        eui_marker: app
            .path()
            .app_local_data_dir()
            .ok()
            .map(|d| d.join(EUI_MARKER_FILE).display().to_string()),
    }
}

/// Người dùng đổi "Lấy tên" (Cài đặt › Phụ đề › Người nói): worker của phiên đang chạy bật hay tắt đọc tên ngay (spec §8.3). Tắt thì
/// app tự xóa tên tự động, người tham dự, dòng mời ở bảng người nói và phát lại bảng, không chờ worker (worker có thể đã chết hay bị
/// tắt vì quá tải; QĐ 31).
pub fn names_changed<R: Runtime>(app: &AppHandle<R>, on: bool) {
    if let Some(running) = app.try_state::<Running>()
        && let Some(handle) = running.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref()
    {
        handle.set_names(on);
        log::info!("đọc tên: người dùng {} \"Lấy tên\"", if on { "bật" } else { "tắt" });
    }
    let Some(store) = app.try_state::<crate::transcript::store::TranscriptStore>() else { return };
    if on {
        store.allow_names();
    } else if let Some(view) = store.clear_names() {
        events::speaker_roster(app, &view);
    }
}
```

- `start_for_session`: sau `launch.model_sha256 = sha256;` thêm `launch.names = names_setup(app, &settings);`.

`src-tauri/src/actions.rs`, sau khối `if previous.speaker_diarization && !next.speaker_diarization { … }`:

```rust
    // "Lấy tên" đổi giữa phiên: worker bật hay tắt đọc tên ngay (kế hoạch 04).
    if previous.speaker_names != next.speaker_names {
        crate::speaker::names_changed(app, next.speaker_names);
    }
```

`src-tauri/src/speaker/eui_macos.rs`, trước mod `tests`:

```rust
//! Trả `AXEnhancedUserInterface` mà `speaker-worker` đã bật cho Teams, Chrome, Edge nếu lần chạy trước bị giết giữa chừng (spec
//! 2026-10-26-phan-biet-nguoi-noi §6.2 "lần mở app sau"; QĐ 8, 28 của kế hoạch 04): **chỉ khi app có quyền Trợ năng** (chưa có thì
//! không gọi API Trợ năng nào, giữ nguyên file dấu); với mỗi pid còn là đúng app (bundle id) thì đặt lại `false` và đọc lại; chỉ bỏ
//! khỏi dấu mục đã trả được hay mục mà pid không còn là đúng app. Gọi một lần lúc mở app, trên luồng nền. Không đọc cây, không đọc
//! chữ. `AXIsProcessTrusted` chỉ hỏi trạng thái, không hiện hộp hỏi quyền (khác `AXIsProcessTrustedWithOptions` có tùy chọn hỏi).

use std::path::{Path, PathBuf};

use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::bundle::{CFBundle, CFBundleGetIdentifier};
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::url::CFURL;
use speaker_protocol::{EuiEntry, EuiMarker};
#[cfg(test)]
use speaker_protocol::MeetingApp;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    /// `Boolean` (unsigned char) của header, không phải `bool`.
    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: *mut CFTypeRef) -> i32;
    fn AXUIElementSetAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: CFTypeRef) -> i32;
}

/// `…/X.app/Contents/MacOS/X` → `…/X.app` (như `speaker_worker::reader::macos::bundle_dir_of`; app không liên kết worker).
fn bundle_dir_of(exe: &Path) -> Option<&Path> {
    let macos = exe.parent()?;
    if macos.file_name()? != "MacOS" {
        return None;
    }
    let contents = macos.parent()?;
    if contents.file_name()? != "Contents" {
        return None;
    }
    let app = contents.parent()?;
    (app.extension()? == "app").then_some(app)
}

fn bundle_id_of_pid(pid: i32) -> Option<String> {
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: bộ đệm đủ `PROC_PIDPATHINFO_MAXSIZE` byte.
    let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if len <= 0 {
        return None;
    }
    buf.truncate(len as usize);
    let path = PathBuf::from(String::from_utf8(buf).ok()?);
    let bundle = CFBundle::new(CFURL::from_path(bundle_dir_of(&path)?, true)?)?;
    // SAFETY: luật get: chuỗi thuộc gói đang giữ.
    let id = unsafe { CFBundleGetIdentifier(bundle.as_concrete_TypeRef()) };
    (!id.is_null()).then(|| unsafe { CFString::wrap_under_get_rule(id) }.to_string())
}

/// Trả các mục còn sót khi app có quyền Trợ năng; trả số app đã đặt lại. Chưa có quyền: không làm gì, giữ file dấu.
pub fn restore(marker: &Path) -> usize {
    // SAFETY: hàm của ApplicationServices, không tham số; chỉ hỏi trạng thái quyền.
    if unsafe { AXIsProcessTrusted() } == 0 {
        return 0;
    }
    restore_with(marker, reset)
}

/// Đọc file dấu, gọi `reset` cho từng mục (`None`: pid không còn là đúng app; `Some(true)`: đã trả; `Some(false)`: trả không được),
/// ghi lại các mục trả không được; không còn mục nào thì xóa file. Trả số app đã đặt lại.
fn restore_with(marker: &Path, reset: impl Fn(EuiEntry) -> Option<bool>) -> usize {
    let entries = std::fs::read(marker)
        .ok()
        .and_then(|b| serde_json::from_slice::<EuiMarker>(&b).ok())
        .map(|m| m.entries)
        .unwrap_or_default();
    let mut restored = 0;
    let mut keep = Vec::new();
    for e in entries {
        match reset(e) {
            Some(true) => restored += 1,
            Some(false) => keep.push(e),
            None => {}
        }
    }
    if keep.is_empty() {
        let _ = std::fs::remove_file(marker);
    } else if let Ok(body) = serde_json::to_vec(&EuiMarker { entries: keep }) {
        let _ = std::fs::write(marker, body);
    }
    restored
}

/// Kết quả đọc `AXEnhancedUserInterface` (cùng luật với `speaker_worker::reader::eui::EuiRead`; app không liên kết worker).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Read {
    /// Đang bật.
    On,
    /// Đọc được mà không phải bật (`false`, hay không có giá trị Boolean).
    NotOn,
    /// Không đọc được (app họp treo quá hạn chờ, lỗi).
    Unknown,
}

/// Giá trị `AXEnhancedUserInterface` của phần tử, ba kết quả.
fn read_eui(el: &CFType, attr: &CFString) -> Read {
    let mut v: CFTypeRef = std::ptr::null();
    // SAFETY: phần tử và tên sống tới hết lời gọi; `v` theo luật copy (+1) hay NULL.
    let err = unsafe { AXUIElementCopyAttributeValue(el.as_CFTypeRef(), attr.as_concrete_TypeRef(), &mut v) };
    if err != 0 {
        return Read::Unknown;
    }
    if v.is_null() {
        return Read::NotOn;
    }
    // SAFETY: `v` là tham chiếu +1 vừa nhận.
    let on = unsafe { CFType::wrap_under_create_rule(v) }.downcast::<CFBoolean>().map(bool::from) == Some(true);
    if on { Read::On } else { Read::NotOn }
}

/// Việc với một mục theo lần đọc trước khi trả (kết quả cho `restore_with`): không phải bật thì xong, bỏ mục (`None`), không đặt gì;
/// không đọc được (app treo) thì giữ mục, thử lại lần sau (`Some(false)`); đang bật thì `Some(true)`: cần đặt lại.
fn before_reset(read: Read) -> Option<bool> {
    match read {
        Read::On => Some(true),
        Read::NotOn => None,
        Read::Unknown => Some(false),
    }
}

/// Đặt lại `AXEnhancedUserInterface = false` cho một mục rồi đọc lại, chỉ khi đang bật (cùng luật với worker; rà soát lần 2 B-N-D,
/// lần 3): đọc được mà không phải bật thì mục xong việc (`None`, bỏ khỏi dấu), không đặt `false` lặp lại mỗi lần mở app; không đọc
/// được (app treo quá hạn chờ) thì giữ mục (`Some(false)`).
fn reset(e: EuiEntry) -> Option<bool> {
    if bundle_id_of_pid(e.pid).as_deref() != Some(e.app.macos_bundle_id()) {
        return None;
    }
    // SAFETY: luật create; NULL khi lỗi.
    let el = unsafe { AXUIElementCreateApplication(e.pid) };
    if el.is_null() {
        return Some(false);
    }
    // SAFETY: `el` là tham chiếu +1 vừa tạo.
    let el = unsafe { CFType::wrap_under_create_rule(el) };
    let attr = CFString::from_static_string("AXEnhancedUserInterface");
    let before = before_reset(read_eui(&el, &attr));
    if before != Some(true) {
        return before;
    }
    // SAFETY: phần tử, tên, giá trị sống tới hết lời gọi. Mã trả về không dùng (−25208 dù đã đặt, `results/teams-chrome.md`): đọc
    // lại để biết.
    unsafe {
        AXUIElementSetAttributeValue(el.as_CFTypeRef(), attr.as_concrete_TypeRef(), CFBoolean::false_value().as_CFTypeRef())
    };
    Some(read_eui(&el, &attr) == Read::NotOn)
}
```

`src-tauri/src/lib.rs`, ngay sau dòng 159 (`let pidfile = handle.path().app_local_data_dir()?.join("sidecars-live.json");`):

```rust
    // Đọc tên (kế hoạch 04, QĐ 8, 28): trả `AXEnhancedUserInterface` còn sót nếu lần trước worker bị giết, chỉ khi có quyền Trợ
    // năng (`restore` tự kiểm; chưa có quyền thì giữ file dấu). Chỉ có file khi tính năng đã chạy, nên bản phát hành (tắt tới kế
    // hoạch 07) không làm gì.
    #[cfg(target_os = "macos")]
    {
        let marker = handle.path().app_local_data_dir()?.join(speaker::EUI_MARKER_FILE);
        if marker.exists() {
            std::thread::spawn(move || {
                let n = speaker::eui_macos::restore(&marker);
                log::info!("đọc tên: trả chế độ trợ năng cho {n} app còn sót từ lần chạy trước");
            });
        }
    }
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: 934 đạt (927 + 3 của `speaker` + 4 của `speaker::eui_macos`), 6 bỏ qua.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p meeting-translator && cargo fmt -p meeting-translator -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && scripts/check-windows.sh 2>&1 | tail -2 && git status --short`
Expected: sạch; `check-windows.sh` sạch (`eui_macos` có `cfg`). Không thêm chuỗi cờ dev nào (`AI_TRANSLATOR_DEV_*`): cổng `no-dev-gate` của bản phát hành không đổi. Không commit.

---
### Task 17: Mốc kiểm tổng của kế hoạch 04

**Files:** không (chỉ chạy kiểm)

- [ ] **Step 1: Định dạng, clippy cả workspace, Windows** (build nặng: cả workspace gồm `asr-worker`/whisper.cpp và app; kiểm đĩa 14 GiB)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -2 && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && scripts/check-windows.sh 2>&1 | tail -3`
Expected: fmt sạch; clippy `Finished`, 0 cảnh báo; `check-windows.sh` sạch.

- [ ] **Step 2: Test Rust** (build nặng: kiểm đĩa 14 GiB)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-protocol -p speaker-recipe -p speaker-worker -p audio-capture -p pipeline -p latency-bench 2>&1 | grep -E "^test result|FAILED|panicked" ; cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: mọi nhóm `ok`; `meeting-translator --lib` 934 đạt, 6 bỏ qua. Ghi tổng số vào ghi chú làm việc.

Run (model thật, bản debug, ~150 s; xác nhận nhúng không đổi): `cd $W && SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx RAYON_NUM_THREADS=2 CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- --ignored 2>&1 | grep -E "^test result|FAILED"`
Expected: 3 đạt (như 02b).

- [ ] **Step 3: Không mã mạng, phụ thuộc** (build nặng: `--release`, kiểm đĩa 18 GiB)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release -p speaker-worker 2>&1 | tail -1 && scripts/release/check-no-network.sh --binary target/release/speaker-worker speaker-worker speaker-protocol speaker-recipe && otool -L target/release/speaker-worker && node scripts/release/release-check.mjs deps-macos target/release/speaker-worker --min-os 14.2 2>&1 | tail -2; cargo deny check 2>&1 | tail -3; cargo audit 2>&1 | tail -3`
Expected: không mã mạng (bốn lớp; `ax-record` cùng gói nên lớp 3 kiểm cả nó); `otool -L` thêm `ApplicationServices.framework`, `CoreFoundation.framework` (thư viện hệ thống: `release-check deps-macos` chấp nhận mọi thứ dưới `/System/Library/` và `/usr/lib/`, `minos 14.2`); `cargo deny`: ok cả bốn mục; `cargo audit`: không lỗ hổng mới (so với mốc 02b).

- [ ] **Step 4: Giao diện, script**

Run: `cd $W && node_modules/.bin/vitest run 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `Tests  422 passed` (kế hoạch 04 không đổi mã giao diện); `tsc-ok`; `# fail 0`.

- [ ] **Step 5: Không có tên thật, không đường dẫn cá nhân trong repo**

Run: `cd $W && git status --short | awk '{print $2}' | xargs grep -rlnE "/Users/[A-Za-z0-9._-]+/|8:(live|orgid|guest):[.A-Za-z]*[0-9a-fA-F]{8}" 2>/dev/null; python3 -I -c "
import json, subprocess, sys
names = [k for k in json.load(open(sys.argv[1], encoding='utf-8'))]
files = subprocess.run(['git', 'ls-files', '-mo', '--exclude-standard'], capture_output=True, text=True).stdout.split()
hits = [f for f in files if any(n.lower() in open(f, encoding='utf-8', errors='ignore').read().lower() for n in names)]
print('tên thật trong', len(hits), 'file')
" $DATA/fixture-names.json`
Expected: dòng `grep` không in gì (không đường dẫn thư mục người dùng thật dạng `/Users/<tên>/`, không định danh tài khoản Teams thật có chuỗi hex; các mẫu cấm viết tay trong `make_fixture.py` và test `forbidden_in` như `/Users/x`, `8:live:.cid.x` không trúng mẫu này); `tên thật trong 0 file` (không in tên). Có file nào thì dừng, báo người điều phối (fixture: sửa `make_fixture.py` rồi sinh và duyệt lại theo Task 3 Step 2; file khác: thay bằng tên giả) trước khi đi tiếp.

- [ ] **Step 6: Đối chiếu**

Run: `cd $W && git status --short`
Expected: chỉ các file của bảng "Cấu trúc file" ở đầu file 04 (cộng hai file kế hoạch 04, 04b và hai file kết quả). Không commit.

---

### Task 18: Đo tự động: chi phí phần logic trên fixture; A-spk4 khi đọc tên bật

Bước này không đọc app nào trên máy: A-spk4 chạy với công thức **không có app nào** (bộ đọc chạy đủ đường: quét tiến trình, `Speech`, mốc giờ, `ReaderState`, nhưng không đọc cây Accessibility nào, không gọi `AXIsProcessTrusted`; lệnh Accessibility duy nhất là đặt hạn chờ trên phần tử hệ thống lúc luồng đọc bắt đầu, QĐ 27, không đọc gì); chi phí đọc cây thật đo ở Task 20 (cần chủ dự án).

**Files:**
- Create: `bench/2026-10-26-nguoi-noi/khong-app.recipes.json`
- Modify: `crates/latency-bench/src/session.rs` (cờ `--speaker-names-recipe`: `SessionArgs` dòng 79–84, khối dựng `SpeakerLaunch` dòng 641–656, `args_map` dòng 539–549, test)
- Modify: `crates/speaker-worker/src/names/track.rs` (test `#[ignore]` đo chi phí)
- Create: `$B/results/04-do.md`

- [ ] **Step 1: Cờ của `latency-bench session` (test đỏ, mã, xanh)**

`bench/2026-10-26-nguoi-noi/khong-app.recipes.json`:

```json
{ "schema": 1, "version": 1, "min_app_version": "0.3.2", "apps": [] }
```

`crates/latency-bench/src/session.rs`, test mới trong mod `tests` (cạnh test `speaker_worker` hiện có ở dòng ~906–924, dùng helper `args`, `args_map` sẵn có):

```rust
    #[test]
    fn the_names_recipe_flag_turns_names_on_and_is_recorded() {
        let a = args(&["--speaker-worker", "w", "--speaker-model", "e.onnx", "--speaker-names-recipe", "r.json"]);
        assert_eq!(a.speaker_names_recipe.as_deref(), Some(Path::new("r.json")));
        // `public_path` trả đường dẫn tính từ gốc repo (`cargo test` chạy trong `crates/latency-bench`), như test `speaker_worker` so
        // với `public_path(Path::new("s"))`. KHÔNG bỏ `public_path` cho test xanh: file JSON kết quả được commit, đường dẫn tuyệt đối
        // có tên thư mục người dùng (rà soát B-C1).
        assert_eq!(args_map(&a, Path::new("v.onnx"))["speaker_names_recipe"], public_path(Path::new("r.json")));
        assert_eq!(args_map(&args(&[]), Path::new("v.onnx"))["speaker_names_recipe"], "tắt");
    }
```

Mã: trong `SessionArgs`, sau `speaker_model`:

```rust
    /// Bật đọc tên với công thức này (kế hoạch 04 Task 18): như app khi "Lấy tên" bật. `khong-app.recipes.json` (không app nào) đo
    /// phần tốn của đường tên mà không đọc app nào trên máy.
    #[arg(long, requires = "speaker_worker")]
    pub speaker_names_recipe: Option<PathBuf>,
```

trong khối dựng `launch` (sau `let launch = …SpeakerLaunch::new(…);` đổi thành `let mut launch = …;`):

```rust
            if let Some(path) = &args.speaker_names_recipe {
                launch.names = speaker_protocol::NamesSetup {
                    enabled: true,
                    recipe_json: std::fs::read_to_string(path)
                        .with_context(|| format!("không đọc được công thức {}", path.display()))?,
                    eui_marker: None,
                };
            }
```

(thêm `use anyhow::Context;` nếu file chưa có), và trong `args_map`, sau mục `speaker_model`:

```rust
        (
            "speaker_names_recipe".to_string(),
            args.speaker_names_recipe.as_deref().map(public_path).unwrap_or_else(|| "tắt".into()),
        ),
```

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p latency-bench -- session:: 2>&1 | grep -E "^test result|FAILED"`
Expected: đỏ trước khi thêm mã (trường chưa có), xanh sau.

- [ ] **Step 2: Chi phí phần logic trên fixture**

`crates/speaker-worker/src/names/track.rs`, cuối mod `tests`:

```rust
    /// Kế hoạch 04 Task 18: thời gian của phần thuần mỗi lượt đọc (duyệt cây fixture, lấy mẫu ô, tín hiệu). Không gồm thời gian gọi
    /// Accessibility (đo ở Task 20). Chạy tay: `cargo test --release -p speaker-worker --lib -- --ignored names::track --nocapture`.
    #[test]
    #[ignore]
    fn logic_cost_per_pass_on_fixtures() {
        for (file, app) in [("teams-macos-people-closed.jsonl", MeetingApp::Teams), ("meet-chrome-macos.jsonl", MeetingApp::MeetChrome)] {
            // Meet tắt mặc định (QĐ 32): công thức riêng của thư mục fixture.
            let r = if app == MeetingApp::Teams { recipes() } else { crate::reader::extract::tests::meet_recipes() };
            let app = r.app(Os::Macos, app).unwrap();
            let snaps = fixture(file);
            let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
            let mut us: Vec<f64> = Vec::new();
            for _ in 0..20 {
                for s in &snaps {
                    let t0 = std::time::Instant::now();
                    let (_, tiles) = tiles_of(s, app);
                    let _ = tracker.push((s.t * 1000.0) as i64, &tiles, &BTreeMap::new(), false);
                    us.push(t0.elapsed().as_secs_f64() * 1e6);
                }
            }
            us.sort_by(f64::total_cmp);
            eprintln!("{file}: p50 {:.0} µs, p90 {:.0} µs, lớn nhất {:.0} µs ({} lượt)", us[us.len() / 2], us[us.len() * 9 / 10], us[us.len() - 1], us.len());
        }
    }

    /// Rà soát B-N12: phần chạy trên luồng chính của worker, cùng luồng nhúng giọng, ở ca xấu nhất: tự hiệu chỉnh đang tìm với 32 ô ×
    /// 16 ứng viên (tối đa `MAX_SERIES` 512 chuỗi), mỗi 5 s một lần đánh giá trên lưới 240 điểm; ghép tên và tách giọng trên 512 đoạn
    /// gần nhất. In thời gian của lần `push` tốn nhất (lần có đánh giá) và của `settle` + `find_split`.
    #[test]
    #[ignore]
    fn worst_case_cost_of_calibration_matching_and_split() {
        use crate::names::Spans;
        use crate::names::calibrate::Calibrator;
        use crate::names::matcher::{NameMatcher, SegRec};
        use crate::names::split::find_split;
        use speaker_protocol::SpeakerConfig;
        let mut speech = Spans::default();
        speech.add(0, 10_000_000);
        let me = TileSample { name: "Hoa Phạm".into(), is_self: true, muted: Some(true), label_speaking: false, anchors: vec![], candidates: vec![], slot: 9_999 };
        let tiles: Vec<TileSample> = std::iter::once(me)
            .chain((0..32u32).map(|i| TileSample {
                name: format!("Người {i}"),
                is_self: false,
                muted: Some(false),
                label_speaking: false,
                anchors: vec![],
                candidates: (0..16u64).map(|k| (k, u64::from(i) + k)).collect(),
                slot: i,
            }))
            .collect();
        let mut c = Calibrator::default();
        let mut worst_push = 0f64;
        let mut t = 0i64;
        while t < 120_000 {
            let t0 = std::time::Instant::now();
            c.push(t, 250, &tiles, false, &speech);
            worst_push = worst_push.max(t0.elapsed().as_secs_f64() * 1e3);
            t += 250;
        }
        let mut m = NameMatcher::default();
        for i in 0..512u64 {
            let s = i as i64 * 2_000;
            m.segment(SegRec::new(i, s, s + 1_500, Some((i % 8) as u32 + 1), false, Some(vec![1.0; 192]), true));
        }
        let now: Vec<ParticipantNow> = (0..32).map(|i| ParticipantNow { name: format!("Người {i}"), is_self: false, muted: Some(false), speaking: 1.0, via: Via::Indicator }).collect();
        let mut t = 0i64;
        while t < 1_030_000 {
            m.observe(t, 250, 900, &now[(t as usize / 2_000) % 32..][..1]);
            t += 250;
        }
        let cfg = SpeakerConfig { split: true, ..SpeakerConfig::default() };
        let t0 = std::time::Instant::now();
        m.settle(900, &speech, &std::collections::BTreeSet::new());
        let _ = find_split(&m, &cfg, &std::collections::BTreeSet::new(), &std::collections::BTreeSet::new());
        let settle_ms = t0.elapsed().as_secs_f64() * 1e3;
        eprintln!("xấu nhất: Calibrator::push {worst_push:.2} ms; settle + find_split (512 đoạn) {settle_ms:.2} ms");
    }
```

Run (build nặng `--release`: kiểm đĩa 18 GiB): `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test --release -p speaker-worker --lib -- --ignored names::track::tests::logic_cost names::track::tests::worst_case --nocapture 2>&1 | grep -E "µs|ms;|test result"`
Expected: hai dòng số của `logic_cost` (kỳ vọng dưới 1 ms mỗi lượt; phần tốn của bộ đọc thật nằm ở các lệnh Accessibility) và một dòng "xấu nhất" (kỳ vọng `Calibrator::push` vài ms ở lần đánh giá, `settle + find_split` dưới 10 ms; số này cộng vào khứ hồi nhãn của đoạn đang chờ nhúng); ghi vào `04-do.md` cùng số lệnh đọc tệ nhất mỗi lượt của test `a_whole_pass_with_calibration_stays_within_the_read_limit` (Task 4).

- [ ] **Step 3: A-spk4 khi đọc tên bật** (khoảng 40 phút; máy cắm điện, không chạy việc nặng khác; báo chủ dự án trước; không phát tiếng ra loa)

Dựng như kế hoạch 02b Task 4 (`results/02-do-tre.md`, mục "Điều kiện"): `speaker-worker` và `latency-bench` bản release với `MACOSX_DEPLOYMENT_TARGET=14.2`; `asr-worker` bản Metal (dựng lại chỉ khi `target/release/asr-worker` cũ hơn mã nguồn của nó).

Run (build nặng: kiểm đĩa 18 GiB): `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release -p speaker-worker -p latency-bench 2>&1 | tail -1`

Chỉ khi cần dựng lại `asr-worker` (build nặng: kiểm đĩa 18 GiB): `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release -p asr-worker --features metal,shared-encode 2>&1 | tail -1`

Rồi 12 lượt, mỗi session ba cặp xen kẽ theo thứ tự ABBA (tắt, bật; bật, tắt; tắt, bật) để khử lệch theo thứ tự chạy (kế hoạch 02 thấy "lượt bật nhanh hơn chưa rõ vì sao, nghi xung nhịp"; rà soát B-N11) (`tat` = không nhận giọng; `ten` = nhận giọng + đọc tên, công thức không app):

```sh
cd $W && S=$M/bench/phase0/data/latency L=$M/tools/llama-b11669/macos-arm64/llama-b11669/llama-server O=$DATA/out/04/a-spk4 && mkdir -p $O &&
TEN="--speaker-worker target/release/speaker-worker --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --speaker-names-recipe $B/khong-app.recipes.json" &&
for s in en mixed; do for i in 1 2 3; do order="tat ten"; [ $i = 2 ] && order="ten tat"; for mode in $order; do
  extra=""; [ $mode = ten ] && extra="$TEN"
  uptime >> $O/tai-may.txt
  target/release/latency-bench session --wav $S/$s.wav --truth $S/$s.truth.json --asr-worker target/release/asr-worker \
    --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server $L --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf \
    --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 $extra --out $O/$s-$mode-$i.json | tail -1
done; done; done
```

Expected: 12 file JSON. Lượt `ten`: log `speaker-worker` (cạnh file JSON, theo `log_path`; client chép stderr của worker vào đó) có dòng `speaker-worker: giao thức phiên bản 2`, dòng `speaker-worker: bộ đọc: NoMeeting, app None, 0 chỉ báo tự học` (Task 10 ghi khi trạng thái đổi), **không** có dòng `bộ đọc: … lượt đầy đủ` (dòng thống kê chỉ có khi đọc cây); `run.speaker_disabled` rỗng. Lượt `tat` không có log `speaker-worker`.

- [ ] **Step 4: Tính chênh lệch**

```sh
cd $W && $DATA/venv/bin/python -I -c "
import json, glob, statistics as st
rows = {}
for f in sorted(glob.glob('$DATA/out/04/a-spk4/*.json')):
    s, mode, _ = f.split('/')[-1][:-5].split('-')
    r = json.load(open(f))
    rows.setdefault(mode, []).append((r['summary']['a2_p50_ms'], r['summary']['a2_p90_ms'], r['summary']['a2_first_p50_ms'], r['run'], r['usage'].get('speaker-worker')))
for k, name in enumerate(['a2_p50', 'a2_p90', 'a2_first_p50']):
    off = st.mean(x[k] for x in rows['tat']); on = st.mean(x[k] for x in rows['ten'])
    print(name, round(off, 1), round(on, 1), '%+.1f' % (on - off))
on = rows['ten']
print('tắt giữa chừng', [x[3]['speaker_disabled'] for x in on])
print('speaker-worker RSS đỉnh MB', round(max(x[4]['peak_rss_mb'] for x in on) * 1.048576, 1), 'CPU tb %', round(st.mean(x[4]['avg_cpu_percent'] for x in on), 2))
"
```

Expected: ba dòng chênh. **Mức đạt A-spk4** (spec §11, §12): A2 p50 ≤ +20 ms, p90 ≤ +50 ms, chữ đầu ≤ +20 ms; không lượt `ten` nào bị tắt giữa chừng. Không đạt thì ghi số, không chỉnh mã trong Task này; nêu ở "Điều cần chủ dự án quyết".

- [ ] **Step 5: Ghi `$B/results/04-do.md`**

Nội dung (tiếng Việt, số thật từ Step 2–4 và số lệnh đọc tệ nhất của Task 4): câu hỏi (spec §11: đường tên không làm chậm phụ đề; ngân sách ≤ 30 ms mỗi lượt, đo phần tốn của app họp bằng số lệnh và năng lượng); điều kiện (máy, nguồn điện, bản dựng, công thức không app, thứ tự xen kẽ ABBA, tải máy); bảng 12 lượt (session, lượt, chế độ, A2 p50, p90, chữ đầu); trung bình và chênh so với mức đạt; chi phí phần logic (Step 2); RSS và %CPU của `speaker-worker` (chỉ đối chiếu); giới hạn (chưa đọc cây thật: phần đó ở Task 20, 21); chạy lại (lệnh Step 2–4).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p latency-bench -p speaker-worker -- --check && cargo clippy -p latency-bench -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch; thêm `bench/2026-10-26-nguoi-noi/khong-app.recipes.json`, `results/04-do.md`. Không commit.

---

### Task 19: Thử quyền Trợ năng với `speaker-worker` thật và dòng mời **(cần chủ dự án)**

Mục dời từ kế hoạch 02 (spec §6.2: "thử lại một lần với binary `speaker-worker` thật"), cộng spec §6.7. Người làm: chủ dự án (thao tác System Settings, mở Teams). Claude chỉ chuẩn bị và đọc log.

**Lưu ý trước khi làm:**
- Bản dev ký bằng chứng thư dev cố định nhưng **cùng bundle id** với app đã cài (`scripts/run-dev-app.sh`). Bật quyền Trợ năng cho "AI Translator" lúc dùng bản dev có thể làm app đã cài mất quyền (Gõ dịch). Sau khi thử: mở app đã cài, vào Cài đặt › Gõ dịch, cấp lại quyền nếu báo chưa cấp. **Không** bấm nút "xóa quyền cũ" (`tccutil reset`) trong bản dev: nút đó xóa quyền theo bundle id, tức cả của app đã cài.
- Bản dev dùng `data-dev.db` và khóa `db-key-dev` (QĐ 22 của 03): không đụng dữ liệu của app đã cài. Vẫn sao lưu `data.db` làm bảo hiểm phụ như 03b Task 23 Step 1 nếu muốn.
- Không mở cuộc họp thật có người khác; chỉ cửa sổ họp của chính chủ dự án (Teams: "Meet now" một mình).
- Không chạy bản dev và app đã cài cùng lúc với "Lấy tên" bật: hai worker có thể cùng đọc Teams. File dấu EUI đã tách theo loại build (`speaker-eui-dev.json` / `speaker-eui.json`, QĐ 28) nên không trả EUI của nhau, nhưng bước này chỉ thử một bản (rà soát B-N13).

- [ ] **Step 1: Chuẩn bị (Claude)**

Run: `cd $W && grep -q '^AI_TRANSLATOR_DEV_SPEAKER=true' .env && echo co-dev && ls -la src-tauri/binaries/ | grep speaker-worker && ls $DATA/models/eres2net-sv-en-voxceleb-16k.onnx`
Expected: `co-dev`; `speaker-worker-aarch64-apple-darwin` mới hơn `crates/speaker-worker/src/`. Thiếu thì (build release nặng) `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 scripts/copy-sidecars.sh` và đặt model vào thư mục model dev như 03b Task 23.

- [ ] **Step 2: Chưa có quyền: dòng mời** (chủ dự án)

1. System Settings › Privacy & Security › Accessibility: nếu có dòng "AI Translator" đang bật, ghi lại rồi tắt (để thử từ trạng thái chưa có quyền).
2. Mở Teams, bấm "Meet now" (một mình, mic và camera tắt).
3. `cd $W && scripts/run-dev-app.sh`; bấm Bắt đầu dịch (nguồn: âm thanh máy).
4. Ghi: thanh phụ đề có hiện dòng mời "… Mở Cài đặt ✕" trong ≤ 3 s không; khóa thanh thì dòng mời ẩn không; bấm "Mở Cài đặt" có mở Cài đặt › Phụ đề và cuộn tới nhóm Người nói không; "AI Translator" có tự xuất hiện trong danh sách Accessibility (công tắc tắt) không.

- [ ] **Step 3: Cấp quyền: tiến trình con hưởng quyền** (chủ dự án)

1. Bật công tắc "AI Translator" trong Accessibility (Touch ID nếu hỏi).
2. Ghi: dòng mời mất sau bao lâu (kỳ vọng ≤ 3 s, không cần khởi động lại); Cài đặt › Người nói báo "đã cấp".
3. Dừng dịch, thoát bản dev.

Claude đọc log (không có tên người): `cd $W && grep -h "đọc tên:\|bộ đọc:\|giao thức phiên bản" ~/Library/Logs/com.aitranslator.desktop/*.log 2>/dev/null | tail -20` (thư mục log của app, `src-tauri/src/logging.rs`; `speaker-worker.log` nằm cùng chỗ). Kỳ vọng: `speaker-worker: giao thức phiên bản 2`; `đọc tên: NoPermission (Some(Teams) …)` rồi `đọc tên: Ok`/`NoNames (Some(Teams) …)`; dòng "bộ đọc: N lượt đầy đủ …" sau 60 s; không có tên người nào.

- [ ] **Step 4: Trả chế độ trợ năng** (chủ dự án)

Giết **cùng lúc** app dev và worker để không ai kịp trả EUI (rà soát B-Q5: giết riêng worker thì client chạy lại worker sau 1 s, worker mới trả và bật lại EUI, rồi thoát êm xóa dấu, nên đường "app trả EUI lúc mở" không được thử).
1. Claude in hai pid (không giết gì): `cd $W && R=$(pwd) && pgrep -f "$R/target/AI Translator Dev[.]app/Contents/MacOS/meeting-translator" ; pgrep -f "$R/src-tauri/binaries/speaker-worke[r]"` và lệnh đọc EUI: `cd $B/tro-nang && swiftc -O -o axprobe axprobe.swift && ./axprobe read $(pgrep -x MSTeams) AXEnhancedUserInterface`. Expected: hai dòng, mỗi dòng **đúng một** số. `scripts/run-dev-app.sh` chép binary vào `AI Translator Dev.app/Contents/MacOS/` và mở gói đó (chính script tìm tiến trình bằng đúng mẫu này), nên dòng lệnh của app dev không chứa `target/debug/…` (rà soát lần 2 B-Q-A); bản dev chạy worker từ `src-tauri/binaries/` (`sidecar::paths::binaries_dir`, script cũng dọn theo mẫu này). Hai mẫu chứa đường dẫn của chính worktree này (`R=$(pwd)` sau `cd $W`, cùng dạng `root` của `run-dev-app.sh`; bản dev chạy với `CARGO_TARGET_DIR` mặc định `$W/target` như Step 2), nên không trúng app đã cài hay bản dev của worktree khác đang chạy trên máy (rà soát lần 3); `[.]` và `[r]` để mẫu không khớp chính dòng lệnh của shell đang chạy `pgrep`. **Thiếu pid nào hay có hơn một số thì dừng, không giết gì**: giết riêng worker thì client chạy lại worker sau 1 s, worker mới trả EUI và đường "app trả EUI lúc mở" không được thử.
2. Trong lúc đang dịch (Teams đang họp, EUI đọc được là `1`): chủ dự án chạy **một lệnh** `kill -9 <pid app dev> <pid speaker-worker>`.
3. Kiểm: file dấu còn: `ls ~/Library/Application\ Support/com.aitranslator.desktop/speaker-eui-dev.json` (bản debug, QĐ 28; thư mục `app_local_data_dir`); `./axprobe read $(pgrep -x MSTeams) AXEnhancedUserInterface` → `1` (chưa ai trả).
4. Mở lại bản dev (chưa bấm Bắt đầu dịch): file dấu mất trong ≤ 2 s; log có "trả chế độ trợ năng cho 1 app"; `./axprobe read …` → `0`.
5. Nếu bước 4 không đạt: ghi lại, rồi khôi phục bằng tay `./axprobe set $(pgrep -x MSTeams) AXEnhancedUserInterface 0` và xóa file dấu `speaker-eui-dev.json`.
6. Thử thêm (QĐ 28; rà soát lần 2 B-N-C: dấu chỉ có khi worker bật được EUI, tức khi **còn quyền**): (a) khi còn quyền, bắt đầu dịch lại và làm lại bước 1–3 (giết cả hai bằng một lệnh; dấu còn, EUI = `1`); (b) **rồi mới** tắt quyền Trợ năng của "AI Translator" trong System Settings; (c) mở lại bản dev (không bấm Bắt đầu dịch): file dấu phải **còn nguyên** và `./axprobe read …` vẫn `1` (chưa có quyền thì app không trả, không xóa dấu, không gọi API Trợ năng); (d) bật lại quyền, thoát rồi mở lại bản dev: dấu mất trong ≤ 2 s, EUI về `0`. Không đạt ở (c) hay (d) thì khôi phục như bước 5.
7. Teams: tắt "Meet now".

- [ ] **Step 5: Ghi kết quả (Claude)**

Tạo `$B/results/04-thu-that.md`, mục "Quyền Trợ năng với speaker-worker thật": ngày, máy, bản macOS, bản Teams; kết quả từng ý của Step 2–4 (có/không, thời gian); kết luận cho spec §6.2, §6.7. Không ghi tên người, không ghi đường dẫn cá nhân.

---

### Task 20: Teams thật: tên, chỉ báo, chi phí đọc, tác dụng phụ của chế độ trợ năng, fixture mới **(cần chủ dự án)**

Như kế hoạch 01 Task 12 (`results/teams-chrome.md`, mục "Điều kiện"): chủ phòng là Teams của chủ dự án (tài khoản cá nhân), hai khách tự động bằng `$B/truoc-spec/doc-ten/guests.py` (Chrome tự động, hồ sơ tạm, micro giả là file giọng đọc). Mọi bản ghi có tên thật nằm ở `$DATA/out/04/`, không vào repo.

- [ ] **Step 1: Tên trên phụ đề (thử A-spk3 sơ bộ)** (chủ dự án)

1. Teams "Meet now", mời hai khách theo hướng dẫn của `guests.py`; `xen_ke.py`-kiểu lịch nói: khách nói luân phiên 6 s, nghỉ 2 s, 5 phút.
2. Bản dev đang dịch (âm thanh máy). Ghi: sau bao nhiêu lượt mỗi khách có tên trên phụ đề; có dòng nào sai tên không; "Chọn người trong cuộc họp" có "Lan", "Minh" và tên chủ phòng không.
3. Xuất bản chép lời TXT vào `$DATA/out/04/teams-ban-chep.txt` (Pro dev) để Claude đếm dòng đúng tên/sai tên/chưa tên so với lịch nói (ghi bằng số, không chép tên thật vào repo).

- [ ] **Step 2: Chi phí mỗi lượt đọc và phần tốn của Teams** (Claude chạy, chủ dự án để cuộc họp chạy)

Run (build nặng `--release`: kiểm đĩa 18 GiB): `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release -p speaker-worker --bin ax-record 2>&1 | tail -1 && target/release/ax-record stats teams $DATA/out/04/teams-ax-4.jsonl --rate 4 --seconds 60 --marker $DATA/out/04/eui.json && python3 -I -c "
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
for p in ('Full', 'Fast'):
    ms = sorted(r['ms'] for r in rows if r['pass'] == p)
    if ms: print(p, len(ms), 'lượt, p50 %.1f ms, p90 %.1f, lớn nhất %.1f' % (ms[len(ms)//2], ms[len(ms)*9//10], ms[-1]), 'lệnh đọc lớn nhất', max(r['elements'] for r in rows if r['pass'] == p))
print('lượt có lệnh quá hạn chờ 0,2 s:', sum(1 for r in rows if r.get('timeouts', 0) > 0), '/', len(rows))
" $DATA/out/04/teams-ax-4.jsonl`
Lặp lệnh trên với `--calibrate` (đường đọc ứng viên mà worker dùng khi đang tìm hay đã học chỉ báo, `ControlState::calibrate`; rà soát lần 2 B-N-E), ra `$DATA/out/04/teams-ax-4-cal.jsonl`, rồi chạy lại đoạn Python với file đó.
Expected: lượt nhanh p90 ≤ 30 ms và mọi lượt ≤ 3 000 lệnh đọc (spec §6.2; ngân sách phủ cả lượt nhanh, QĐ 13); lượt đầy đủ ghi số (dừng giữa chừng khi quá 30 ms); số lượt có lệnh quá hạn chờ (QĐ 27: hạn chờ 0,2 s của cả tiến trình; kỳ vọng 0 khi Teams bình thường). Terminal chạy lệnh phải có quyền Trợ năng (chủ dự án cấp cho Terminal nếu chưa; ghi lại để tắt sau).

Rồi đo xen kẽ bằng số lệnh và năng lượng (A-spk5 phần app họp, spec §6.8): `cd $B/tro-nang && swiftc -O -o rus rus.swift && AXTRACE_PID=$(pgrep -x MSTeams) DATA=$DATA AX_RECORD=$W/target/release/ax-record $DATA/venv/bin/python -I xen_ke.py teams teams-04 50 A,R4,A,R1,A,R4` (khách nói suốt). Rồi một lượt `R4` có đọc ứng viên: `AX_RECORD_ARGS=--calibrate` (Step 7 của Task 12 nối biến này vào lệnh `ax-record`) với `xen_ke.py teams teams-04-cal 50 A,R4,A`; ghi riêng dòng "R4 có ứng viên". Kỳ vọng: phần thêm của Teams khi `R4` nhỏ hơn hẳn `B4` của kế hoạch 01 (1,19 tỉ lệnh/s, 371 mW); mục tiêu "vài chục mW" (`results/tong-hop.md`). Ghi bảng như Bảng 2 của `teams-chrome.md`.

- [ ] **Step 3: Các ca Teams spec §6.4 chưa thử** (chủ dự án)

1. Khách mở mic mà im lặng (dừng file giọng đọc của một khách, giữ mic mở): khung "đang nói" của ô đó có tắt không (bản ghi `ax-record fixture teams $DATA/out/04/teams-im.jsonl --seconds 30`).
2. Có video: khách bật camera giả (`guests.py` với cờ camera giả của Chrome): chỉ báo còn đúng không, số phần tử mỗi lượt.
3. Họp đông hơn số ô: chỉ làm được nếu có đủ khách (tài khoản thử chỉ có 2–3 Gmail, 1 Microsoft): ghi "chưa làm được, theo dõi qua báo cáo tình trạng (kế hoạch 06)".
4. Tài khoản công việc: không có tài khoản; ghi như trên. Lưu ý cho lúc có (rà soát A-NHỎ 6): tên hiển thị dạng "Họ, Tên" có dấu phẩy không khớp mẫu nhãn ô `(?P<name>[^,]{1,120}?)`, ô đó không có tên (an toàn); khi có bản ghi thì sửa mẫu qua công thức (`version` tăng).

- [ ] **Step 4: Tác dụng phụ của `AXEnhancedUserInterface`** (chủ dự án; spec §6.8)

Trong lúc bộ đọc đang chạy (EUI bật): kéo cửa sổ Teams, đổi kích thước, phóng to toàn màn hình rồi thoát, Mission Control, thu nhỏ vào Dock và mở lại, đổi Space. Ghi từng thao tác: bình thường hay lạ (giật, nhảy chỗ, hiệu ứng mất). Sau khi dừng dịch: `cd $B/tro-nang && swiftc -O -o axprobe axprobe.swift && ./axprobe read $(pgrep -x MSTeams) AXEnhancedUserInterface` → `0` (đã trả).

- [ ] **Step 5: Fixture Teams mới, độ trễ chốt** (Claude)

1. `target/release/ax-record fixture teams $DATA/out/04/teams-moi-watch.jsonl --seconds 60` trong lúc `xen_ke.py` ghi sự thật (`$B/truoc-spec/doc-ten/out/<tag>-truth.json`).
2. Đổi khóa `lines` thành `texts` cho script cũ: `python3 -I -c "import json,sys; [print(json.dumps({'t': r['t'], 'texts': r['lines']}, ensure_ascii=False)) for r in map(json.loads, open(sys.argv[1]))]" $DATA/out/04/teams-moi-watch.jsonl > $DATA/out/04/teams-moi-axtrace.jsonl`, rồi `$DATA/venv/bin/python -I $B/tro-nang/o_dang_noi.py teams $DATA/out/04/teams-moi-axtrace.jsonl <truth.json> --shift 0.6` và `--shift 0.9`: ghi khớp và độ trễ; chọn `delay_ms` của Teams (số có khớp cao nhất, làm tròn 100 ms) và sửa `scripts/speaker-recipes/recipes.json` nếu khác 900 (tăng `version` lên 2), chạy lại test của Task 2, 5.
3. Nếu bản ghi có video: ẩn danh theo đúng Task 3 Step 2 (`make_fixture.py names` dựng lại ánh xạ không in tên, `build` vào `$DATA/fixtures-review/teams-macos-video.jsonl`, `review` in theo trường) rồi **dừng chờ người điều phối hay chủ dự án duyệt**; chỉ sau khi duyệt mới chép vào `scripts/speaker-recipes/fixtures/`, thêm vào test `teams_frames_follow_who_speaks`, `fixture_tile_names_are_the_made_up_ones`, `a_whole_pass_with_calibration_stays_within_the_read_limit` (danh sách file) và vào `fixtures/README.md`; chạy lại test Task 3–5 (gồm `fixtures_have_no_account_ids_links_or_paths`).

- [ ] **Step 6: Ghi kết quả**

Thêm vào `$B/results/04-thu-that.md` mục "Teams": điều kiện, Step 1–5 (số), kết luận cho spec §6.4 (chỉ báo ô video), §6.6 (độ trễ Teams), §6.8 (chi phí, tác dụng phụ), §11 (≤ 30 ms). Dọn: khách rời, `guests.py` thoát, Teams rời cuộc họp, âm lượng trả về như trước, quyền Trợ năng của Terminal tắt lại nếu đã bật riêng cho bước này.

---

### Task 21: Meet (Chrome, Edge) và Zoom thật; fixture Zoom thật; tiêu chí bật lại Meet **(cần chủ dự án)**

Meet và Zoom **tắt mặc định** (không có trong `recipes.json`, QĐ 16, 32 của kế hoạch 04): bản dev không đọc chúng. Mọi lệnh đọc Meet ở Task này dùng `ax-record … --recipe scripts/speaker-recipes/fixtures/meet-macos.recipes.json` (Zoom: `zoom-macos-synthetic.recipes.json`).

- [ ] **Step 1: Meet trong Chrome, hai tài khoản** (chủ dự án)

Kế hoạch 01 chỉ thử một tài khoản vào hai cửa sổ; ô của người nói trong cửa sổ chủ phòng không đổi lần nào (spec §6.4). Lần này: chủ phòng là Chrome của chủ dự án (Gmail 1), người nói là Gmail 2 ở hồ sơ Chrome khác (`$B/truoc-spec/doc-ten/guest_chrome.sh`, micro giả), nói theo lịch 6 s/2 s.
1. `ax-record fixture meet_chrome $DATA/out/04/meet-2tk.jsonl --seconds 60 --recipe scripts/speaker-recipes/fixtures/meet-macos.recipes.json` (chỉ đọc vùng web của cửa sổ Meet).
2. `ax-record stats meet_chrome $DATA/out/04/meet-ax-4.jsonl --rate 4 --seconds 60 --recipe scripts/speaker-recipes/fixtures/meet-macos.recipes.json`: lượt nhanh p90 ≤ 30 ms, mọi lượt ≤ 3 000 lệnh?
3. Bản dev không đọc Meet (tắt mặc định), nên không thử tên trên phụ đề ở bước này. Tín hiệu mic và tự hiệu chỉnh cũng không chạy với Meet khi chưa nhận ra ô của chính người dùng (QĐ 24).
4. Claude phân tích fixture như Task 20 Step 5 (dùng `o_dang_noi.py meet`), **tách theo cửa sổ**: cửa sổ của chủ phòng (Gmail 1, chỗ người dùng nghe) và cửa sổ của người nói; trả lời câu của spec §6.4 "vì sao ô ở cửa sổ chủ phòng không đổi" (có đổi khi người nói là tài khoản khác không). Tìm **chỉ báo ở cửa sổ người nghe**: phần tử, hoạt hình, lớp CSS hay DOM nào trong ô của người ở xa (hay ngoài ô, như khung "đang trình bày", danh sách người tham gia) đổi đúng lúc người đó nói (chỉ ghi vai trò, lớp, vị trí; không chép chữ, không tên).
5. **Tiêu chí bật lại Meet** (QĐ 32): có chỉ báo ở cửa sổ người nghe mà một công thức mô tả được (vai trò, lớp hay id; không đọc chữ mọi phần tử, QĐ 3), và test mới chạy cả chuỗi fixture → `SpeakingTracker` → `NameMatcher` trên fixture hai tài khoản **chỉ ở cửa sổ người nghe** cho đúng tên người ở xa (như `meet_gives_no_name_in_the_listener_window` nhưng cho tên), Meet ≥ 0,80 ở cửa sổ đó. Đạt thì Claude đề xuất mục Meet mới cho `recipes.json` (sửa `meet-macos.recipes.json` trước, `version` tăng) và **hỏi chủ dự án** có bật Meet không ("Điều cần chủ dự án quyết" mục 16; đổi test `the_builtin_recipes_cover_only_teams_on_macos`). Không đạt thì Meet giữ tắt, ghi số vào `04-thu-that.md`. Fixture mới vào repo theo quy trình duyệt của Task 3 Step 2.
6. **Dấu nhận ô của chính người dùng trong Meet** (QĐ 24, rà soát A-Q8): trên bản ghi hai tài khoản, so ô của Gmail 1 trong cửa sổ của Gmail 1 với ô của Gmail 2: tìm phần tử hay chữ chỉ có ở ô "của mình" (nhãn "(Bạn)"/"(You)", nút ghim riêng, lớp CSS riêng; chỉ ghi vai trò, lớp, vị trí, không ghi tên). Có dấu ổn định thì đề xuất sửa `self_name` hay thêm điều kiện vào công thức Meet (`version` tăng), thêm assert số ô `is_self` cho fixture Meet mới (thay assert "0 ô" của `fixture_tile_names_are_the_made_up_ones`), rồi **hỏi chủ dự án** có bật lại tín hiệu mic và tự hiệu chỉnh cho Meet không ("Điều cần chủ dự án quyết" mục 12). Fixture mới vào repo theo đúng quy trình duyệt của Task 3 Step 2.

- [ ] **Step 2: Meet trong Edge** (chủ dự án; spec §6.2, §14: Edge chưa kiểm)

Lặp Step 1 ý 1, 2, 4 với Edge (`meet_edge`, cùng `--recipe`): ghi `AXEnhancedUserInterface` có dựng cây web không (`axprobe count <pid Edge> '^Meet'` trước và sau), tiêu đề cửa sổ có khớp `^Meet [–-] ` không, chỉ báo ở cửa sổ người nghe có giống Chrome không.

- [ ] **Step 3: Zoom bản cài** (chủ dự án)

1. Zoom họp với một khách (Zoom web qua `guests.py`, như nghiên cứu trước spec).
2. `ax-record fixture zoom $DATA/out/04/zoom.jsonl --seconds 60 --recipe scripts/speaker-recipes/fixtures/zoom-macos-synthetic.recipes.json` (bản build sẵn không có Zoom, QĐ 16); Claude xem vai trò thật của ô, mẫu nhãn thật (khớp mẫu tổng hợp không; giao diện tiếng Việt thì chữ gì), tiêu đề cửa sổ, và **khung chat có nằm trong cửa sổ họp không** (chỉ ghi vai trò, không chép chữ).
3. Đề xuất mục Zoom cho `recipes.json` (ô ràng buộc `role` thật; mẫu sửa nếu khác; `version` tăng) và **hỏi chủ dự án** có đưa Zoom vào bản build sẵn không ("Điều cần chủ dự án quyết" mục 4). Được đồng ý thì: thêm mục vào `recipes.json`, sửa test `the_builtin_recipes_cover_only_teams_on_macos` (Zoom có mặt); ẩn danh `zoom.jsonl` theo đúng Task 3 Step 2 (`build` vào `$DATA/fixtures-review/`, `review`, duyệt) thành `scripts/speaker-recipes/fixtures/zoom-macos.jsonl`; thay fixture và công thức tổng hợp trong test (`zoom_labels_give_name_mic_self_and_speaking`, `zoom_follows_the_active_speaker_label`, `fixture_tile_names_are_the_made_up_ones`, `a_whole_pass_with_calibration_stays_within_the_read_limit`) và trong `fixtures/README.md`; xóa `zoom-macos-synthetic.*`; chạy lại test Task 2–5.

- [ ] **Step 4: Giao diện Teams, Meet, Zoom tiếng Việt và ngôn ngữ khác** (chủ dự án, nếu đổi được ngôn ngữ app họp)

Đổi ngôn ngữ của Teams sang tiếng Việt (và nếu được, Nhật, Trung, Hàn): ghi tiêu đề cửa sổ họp, mẫu nhãn ô ("Context menu is available", "muted", "(Guest)" thành gì). Claude thêm mẫu vào `recipes.json` (spec §7.1: "mẫu nhãn theo 5 ngôn ngữ giao diện"; hiện chưa phủ, rà soát A-NHỎ 7), `version` tăng, thêm fixture nhỏ nếu có (qua quy trình duyệt của Task 3 Step 2). Ngôn ngữ không đổi được thì ghi vào "Để kế hoạch sau" (kế hoạch 06).

- [ ] **Step 5: A-spk4 khi đọc tên thật** (Claude chạy, chủ dự án để một cuộc họp Teams có khách nói, loa nhỏ)

Lặp Task 18 Step 3–4 với `--speaker-names-recipe scripts/speaker-recipes/recipes.json` thay `khong-app.recipes.json` (bộ đọc đọc cây Teams thật suốt các lượt `ten`). Mức đạt như Task 18. Ghi vào `04-do.md` mục "Khi đọc tên thật".

- [ ] **Step 6: Ghi kết quả, dọn**

Thêm vào `$B/results/04-thu-that.md` các mục "Meet (Chrome)", "Meet (Edge)", "Zoom", "Ngôn ngữ giao diện", với kết luận cho spec §6.1, §6.2, §6.4, §6.6, §14. Cập nhật spec (**chỉ khi chủ dự án duyệt**: kế hoạch này không sửa spec) ở các chỗ ghi "kế hoạch 04 chốt lại". Dọn: rời mọi cuộc họp, khách thoát, âm lượng, quyền của Terminal; `axprobe read` cho Chrome, Edge trả `0`.

---
