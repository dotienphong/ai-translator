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
use crate::names::calibrate::{CAL_SHIFT_MS, CAL_WINDOW_MS, Calibrator};
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
    /// Lượt đọc gần nhất có đúng một ô của chính người dùng (QĐ 24): `Calibrator::push` thoát sớm khi không, nên `active()` của nó
    /// có thể cũ; không có ô này thì không coi là đang tìm chỉ báo (bộ đọc không kẹt ở nhịp nhanh, không đọc ứng viên).
    self_seen: bool,
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
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
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
        self.clusterer.register(
            segment_id,
            end_ms,
            duration,
            source == Source::Mic,
            embedding.as_deref(),
            a.voice,
        );
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
            self.names.matcher.segment(
                SegRec::new(
                    segment_id,
                    start_ms as i64,
                    end_ms as i64,
                    Some(v),
                    source == Source::Mic,
                    embedding,
                    a.updated,
                )
                .guessed(a.confidence < self.clusterer.theta()),
            );
        }
        self.relabel_late(end_ms, &mut out);
        self.settle_names(&mut out);
        self.push_voices_if_changed(&mut out);
        out
    }

    /// Chốt nhãn muộn (spec §5.3): đoạn đã tới hạn mà giọng gần nhất đã khác thì phát lại `Assign` cho đoạn cũ, như đường tách giọng.
    /// Nhãn chỉ gắn sau khi chữ đã hiện; không có gì ở đây chờ nhãn.
    fn relabel_late(&mut self, now_ms: u64, out: &mut Vec<Response>) {
        for c in self.clusterer.take_late(now_ms) {
            self.names.matcher.relabel(c.segment_id, c.to);
            match c.from {
                Some(from) => self.move_tally(from, c.to, c.duration_ms, c.mic),
                None => self.add_tally(c.to, c.duration_ms, c.mic),
            }
            out.push(Response::Assign {
                segment_id: c.segment_id,
                voice: Some(c.to),
                confidence: 0.0,
            });
        }
    }

    fn room(&self) -> BTreeSet<u32> {
        self.tally.iter().filter(|(_, t)| t.room()).map(|(v, _)| *v).collect()
    }

    fn recipe(&self, app: MeetingApp) -> Option<&AppRecipe> {
        self.names.recipes.as_deref()?.app(self.os, app)
    }

    fn delay_ms(&self) -> i64 {
        self.names
            .app
            .and_then(|a| self.recipe(a))
            .map_or(DEFAULT_DELAY_MS, |r| i64::from(r.delay_ms))
    }

    fn voices(&self) -> Vec<VoiceInfo> {
        let named = if self.names.enabled {
            self.names.matcher.names()
        } else {
            BTreeMap::new()
        };
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
            voices
                .iter()
                .map(|v| (v.voice, v.mic, v.name.clone(), v.room_index))
                .collect(),
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
        self.add_tally(into, ms, mic);
    }

    fn add_tally(&mut self, voice: u32, ms: u64, mic: bool) {
        let t = self.tally.entry(voice).or_default();
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
        let Some(plan) = split::find_split(&self.names.matcher, &self.config, &room, &cooling) else {
            return;
        };
        let moved: Vec<(u64, Vec<f32>, bool)> = self
            .names
            .matcher
            .records()
            .filter(|s| plan.segments.contains(&s.id))
            .filter_map(|s| s.embedding.clone().map(|e| (s.dur() as u64, e, s.contributed)))
            .collect();
        let members: Vec<(u64, &[f32], bool)> = moved.iter().map(|(ms, e, c)| (*ms, e.as_slice(), *c)).collect();
        let Some(new) = self.clusterer.split(plan.voice, &members) else {
            return;
        };
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
            self.clusterer.note_moved(id);
            self.move_tally(plan.voice, new, ms, mic);
            out.push(Response::Assign {
                segment_id: id,
                voice: Some(new),
                confidence: 0.0,
            });
        }
        self.names.matcher.settle(delay, &self.names.speech, &room);
    }

    fn push_state(
        &mut self,
        app: Option<MeetingApp>,
        version: Option<String>,
        state: ReaderStatus,
        out: &mut Vec<Response>,
    ) {
        let recipe_version = self.names.recipes.as_ref().map_or(0, |r| r.version);
        let learned = self.names.calibrator.learned().len() as u32;
        let patterns = self.names.calibrator.patterns();
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
            patterns,
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
        let Some(at) = self.names.clock.to_session_ms(at_unix_ms) else {
            return out;
        };
        self.names.app = Some(app);
        let delay = self.delay_ms();
        let period = i64::from(period_ms);
        self.names.self_seen = tiles.iter().filter(|t| t.is_self).count() == 1;
        let explained = now.iter().any(|p| !p.is_self && p.speaking > 0.5);
        let matcher = &self.names.matcher;
        self.names
            .calibrator
            .push(at, period, tiles, explained, &self.names.speech, || {
                matcher.voice_spans(at - CAL_WINDOW_MS - CAL_SHIFT_MS)
            });
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
            self.names.self_seen = false;
            self.push_state(s.app, s.app_version, s.status, &mut out);
            return out;
        };
        let Some(kinds) = self
            .recipe(app)
            .map(|r| r.speaking.iter().map(|x| x.kind).collect::<Vec<SignalKind>>())
        else {
            return out;
        };
        let Some(at) = self.names.clock.to_session_ms(s.at_unix_ms) else {
            return out;
        };
        let delay = self.recipe(app).map_or(DEFAULT_DELAY_MS, |r| i64::from(r.delay_ms));
        let quiet = quiet_at(&self.names.speech, at, delay);
        let tracker = self
            .names
            .trackers
            .entry(app)
            .or_insert_with(|| SpeakingTracker::new(kinds));
        let now = tracker.push(at, &s.tiles, self.names.calibrator.learned(), quiet);
        self.observe_at(s.at_unix_ms, s.period_ms, app, s.app_version, &now, &s.tiles)
    }

    /// Bộ đọc nên làm gì (luồng chính đặt vào `Control` sau mỗi việc, QĐ 13).
    pub fn control_state(&self, now_unix_ms: u64) -> ControlState {
        let enabled = self.names.enabled && !self.names.paused;
        let now = self.names.clock.to_session_ms(now_unix_ms);
        let talking = now.is_some_and(|t| {
            self.names
                .speech
                .last_end()
                .is_some_and(|e| t - e <= FAST_AFTER_SPEECH_MS)
        });
        // Đọc nhanh khi đang tìm chỉ báo (có thời hạn, QĐ 11); đọc ứng viên khi đang tìm hay đã học được (để theo chỉ báo đó).
        let searching = self.names.calibrator.active() && self.names.self_seen;
        let learned = !self.names.calibrator.learned().is_empty();
        let needs = searching || now.is_some_and(|t| self.names.matcher.needs_names(t, &self.room()));
        ControlState {
            enabled,
            fast: enabled && talking && needs,
            calibrate: enabled && (searching || learned),
        }
    }

    /// Thứ để chạy luồng đọc: chỉ khi đọc tên bật, có công thức, và bản worker có bộ đọc. Windows: còn cần công thức có mục cho Windows
    /// (kế hoạch 05 QĐ 6): không có gì để đọc thì không nạp UI Automation (tiết kiệm bộ nhớ, tốc độ khởi động).
    pub fn reader_setup(&self) -> Option<ReaderSetup> {
        let recipes = self.names.recipes.clone()?;
        let has_work = self.os != Os::Windows || recipes.has_os(Os::Windows);
        (self.names.enabled && PLATFORM != ReaderPlatform::Unsupported && has_work).then(|| ReaderSetup {
            recipes,
            eui_marker: self.names.eui_marker.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reader::extract::TileSample;
    use crate::reader::{ControlState, PLATFORM, Pass, Sample};
    use speaker_protocol::NamesSetup;
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
                    shapes: vec![],
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
            let people: Vec<(&str, bool)> = talks
                .iter()
                .map(|&(n, ts)| (n, ts.iter().any(|&(s, e)| s + 900 <= t && t < e + 900)))
                .collect();
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

    /// Rà soát đợt A (A2): đủ `max_voices` giọng thì đoạn không giống giọng nào (sim < θ) bị ép vào giọng gần nhất với `confidence` dưới
    /// θ; nhãn "Người N" vẫn như cũ nhưng đoạn đoán không được cộng bằng chứng tên vào giọng sai.
    #[test]
    fn a_forced_guess_does_not_give_the_voice_a_name() {
        let mut w = named_worker(SpeakerConfig {
            max_voices: 1,
            ..SpeakerConfig::default()
        });
        let minh: &[(u64, u64)] = &[(5_000, 9_000), (15_000, 19_000)];
        let mut out = Vec::new();
        out.extend(replies(w.handle(seg_at(0, 0, 2_000, 100))));
        read(&mut w, 0, 5_000, &[("Lan", &[]), ("Minh", minh)], &mut out);
        let a1 = replies(w.handle(seg_at(1, 5_000, 9_000, -100)));
        assert!(
            matches!(a1[0], Response::Assign { voice: Some(1), confidence, .. } if confidence < 0.35),
            "bị ép vào giọng 1 với confidence dưới θ: {:?}",
            a1[0]
        );
        out.extend(a1);
        read(&mut w, 5_000, 15_000, &[("Lan", &[]), ("Minh", minh)], &mut out);
        out.extend(replies(w.handle(seg_at(2, 15_000, 19_000, -100))));
        read(&mut w, 15_000, 22_000, &[("Lan", &[]), ("Minh", minh)], &mut out);
        let (voices, _) = last_voices(&out);
        assert_eq!(voices.len(), 1);
        assert!(
            voices[0].name.is_none(),
            "đoạn đoán không lập bằng chứng tên: {:?}",
            voices[0].name
        );
    }

    /// Như trên với đoạn quá ngắn để nhúng (kế thừa giọng đoạn trước, `confidence` 0).
    #[test]
    fn short_inherited_segments_do_not_give_the_voice_a_name() {
        let mut w = named_worker(SpeakerConfig::default());
        let minh: &[(u64, u64)] = &[
            (5_000, 5_400),
            (6_000, 6_400),
            (7_000, 7_400),
            (8_000, 8_400),
            (9_000, 9_400),
            (10_000, 10_400),
            (11_000, 11_400),
            (12_000, 12_400),
        ];
        let mut out = Vec::new();
        out.extend(replies(w.handle(seg_at(0, 0, 2_000, 100))));
        read(&mut w, 0, 5_000, &[("Lan", &[]), ("Minh", minh)], &mut out);
        for (i, &(s, e)) in minh.iter().enumerate() {
            read(&mut w, s, e + 1_000, &[("Lan", &[]), ("Minh", minh)], &mut out);
            let a = replies(w.handle(seg_at(i as u64 + 1, s, e, 100)));
            assert!(matches!(a[0], Response::Assign { voice: Some(1), confidence, .. } if confidence == 0.0));
            out.extend(a);
        }
        read(&mut w, 13_000, 20_000, &[("Lan", &[]), ("Minh", minh)], &mut out);
        let (voices, _) = last_voices(&out);
        assert!(voices[0].name.is_none(), "{:?}", voices[0].name);
    }

    #[test]
    fn names_come_with_voices_once_the_evidence_is_enough() {
        let (_, out) = named_lan();
        let (voices, participants) = last_voices(&out);
        assert_eq!(voices[0].name, PersonName::new("Lan"));
        assert_eq!(
            (voices[0].name_source, voices[0].room_index),
            (Some(NameSource::Indicator), None)
        );
        assert_eq!(
            participants,
            [PersonName::new("Lan").unwrap(), PersonName::new("Minh").unwrap()]
        );
        let states: Vec<ReaderStatus> = out
            .iter()
            .filter_map(|r| match r {
                Response::ReaderState {
                    state, recipe_version, ..
                } => {
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
        assert!(r.iter().any(|x| matches!(
            x,
            Response::ReaderState {
                state: ReaderStatus::Off,
                app: None,
                ..
            }
        )));
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
        assert!(r.iter().any(|x| matches!(
            x,
            Response::ReaderState {
                state: ReaderStatus::Paused,
                ..
            }
        )));
        assert!(
            !r.iter().any(|x| matches!(x, Response::Voices { .. })),
            "tên giữ nguyên: không gửi lại Voices"
        );
        assert!(
            w.sample(teams(20_000, &[("Minh", true)])).is_empty(),
            "tạm dừng thì bỏ mẫu"
        );
        assert!(w.summary().contains("1 giọng có tên"), "{}", w.summary());
        assert!(!w.control_state(T0 + 20_000).enabled, "bộ đọc nghỉ");
        assert!(replies(w.handle(Request::SetNames { enabled: true })).is_empty());
        assert!(
            !w.control_state(T0 + 20_000).enabled,
            "bật lại \"Lấy tên\" không bỏ tạm dừng"
        );
        let r = replies(w.handle(Request::SetNames { enabled: false }));
        assert!(last_voices(&r).0[0].name.is_none(), "tắt \"Lấy tên\" vẫn xóa tên");
    }

    /// QĐ 30 (rà soát B-N10): `Speech` dài hơn 600 s (nhạc, phòng ồn) được cắt còn 600 s cuối, không bị bỏ: nhịp đọc và mốc giờ vẫn
    /// theo.
    #[test]
    fn a_very_long_speech_span_is_clipped_not_dropped() {
        let mut w = named_worker(SpeakerConfig::default());
        replies(w.handle(seg_at(0, 696_000, 700_000, 100)));
        replies(w.handle_at(
            Request::Speech {
                start_ms: 0,
                end_ms: 700_000,
            },
            T0 + 700_010,
        ));
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
        assert_eq!(
            count(w.sample(s(ReaderStatus::Off))),
            0,
            "mẫu Off của luồng đọc đang nghỉ không tới app (QĐ 31)"
        );
        assert_eq!(count(w.sample(s(ReaderStatus::NoPermission))), 1);
        assert_eq!(count(w.sample(s(ReaderStatus::NoPermission))), 0);
        assert_eq!(count(w.sample(s(ReaderStatus::NoMeeting))), 1);
        assert_eq!(
            count(w.sample(s(ReaderStatus::Ok))),
            1,
            "cửa sổ họp không có ô: NoNames"
        );
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
        let mut turns: Vec<(u64, u64, i16)> = lan
            .iter()
            .map(|&(s, e)| (s, e, 100))
            .chain(minh.iter().map(|&(s, e)| (s, e, 50)))
            .collect();
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
        let named: Vec<(u32, Option<&str>)> = voices
            .iter()
            .map(|v| (v.voice, v.name.as_ref().map(|n| n.as_str())))
            .collect();
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
        replies(w.handle_at(
            Request::Speech {
                start_ms: 3_000,
                end_ms: 4_000,
            },
            T0 + 4_010,
        ));
        assert!(w.control_state(T0 + 4_500).fast, "có tiếng, giọng 1 chưa có tên");
        assert!(!w.control_state(T0 + 6_000).fast, "im quá 1,5 s");
    }

    /// Điều (a) của Task 10: `Calibrator::push` thoát sớm khi lượt đọc không có đúng một ô `is_self`, `active()` giữ giá trị cũ. Phiên
    /// không để bộ đọc kẹt ở nhịp nhanh hay đọc ứng viên khi không còn nhận ra ô của người dùng.
    #[test]
    fn losing_the_self_tile_does_not_leave_the_reader_searching() {
        let mut w = named_worker(SpeakerConfig::default());
        replies(w.handle_at(
            Request::Speech {
                start_ms: 0,
                end_ms: 30_000,
            },
            T0 + 30_010,
        ));
        let with_self = |at: u64, me: usize| {
            let mut s = teams(at, &[("Ta", false), ("Lan", false)]);
            s.tiles[me].is_self = true;
            s
        };
        let mut out = Vec::new();
        for k in 0..60 {
            out.extend(w.sample(with_self(1_000 + k * 250, 0)));
        }
        let c = w.control_state(T0 + 16_000);
        assert!(c.fast && c.calibrate, "đang tìm chỉ báo: {c:?}");
        // Lượt đọc kế không còn nhận ra ô của mình (hai ô `is_self`): thôi tìm.
        let mut s = teams(16_000, &[("Ta", false), ("Lan", false)]);
        s.tiles.iter_mut().for_each(|t| t.is_self = true);
        w.sample(s);
        let c = w.control_state(T0 + 16_100);
        assert!(!c.fast && !c.calibrate, "không còn ô của mình: {c:?}");
        // Cửa sổ họp biến mất cũng vậy.
        w.sample(with_self(16_250, 0));
        assert!(w.control_state(T0 + 16_300).calibrate);
        w.sample(Sample {
            status: ReaderStatus::NoMeeting,
            tiles: vec![],
            ..teams(16_500, &[])
        });
        let c = w.control_state(T0 + 16_600);
        assert!(!c.fast && !c.calibrate, "{c:?}");
    }

    /// Kế hoạch 05 QĐ 6: Windows không có công thức cho Windows thì không có luồng đọc; có thì có. macOS không bị ảnh hưởng (công
    /// thức không có app nào vẫn chạy luồng đọc, như phép đo A-spk4 của kế hoạch 04).
    #[test]
    fn windows_reads_only_when_a_recipe_has_a_windows_entry() {
        const NO_APPS: &str = r#"{"schema":1,"version":1,"min_app_version":"0.3.2","apps":[]}"#;
        let teams_windows = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../scripts/speaker-recipes/fixtures/teams-windows.recipes.json"),
        )
        .unwrap();
        let reader_for = |os: Os, recipe: &str| {
            let (w, _) = worker();
            let mut w = w.with_os(os);
            replies(w.handle(Request::Load {
                model_path: "/m/tot.onnx".into(),
                model_sha256: None,
                config: SpeakerConfig::default(),
                names: NamesSetup {
                    recipe_json: recipe.into(),
                    ..names_on()
                },
            }));
            w.reader_setup().is_some()
        };
        assert!(!reader_for(Os::Windows, NO_APPS), "không có mục Windows: không đọc");
        assert!(reader_for(Os::Windows, &teams_windows), "có mục Windows: đọc");
        assert_eq!(reader_for(Os::Macos, NO_APPS), PLATFORM != ReaderPlatform::Unsupported);
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
    use std::sync::{Arc, Mutex};

    /// Bộ nhúng giả: dấu của mẫu đầu chọn vector (dương → A, âm → B, 0 → vector 0 không dùng được; PCM 7 → lỗi như đoạn không
    /// có đặc trưng); ghi số mẫu mỗi lần gọi.
    struct Fake(Arc<Mutex<Vec<usize>>>);

    impl Embed for Fake {
        fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
            self.0.lock().unwrap().push(samples.len());
            if (samples[0] - 7.0 / i16::MAX as f32).abs() < 1e-6 {
                anyhow::bail!("đoạn không có đặc trưng");
            }
            Ok(match samples[0] {
                // Giá trị PCM 50: vector D, cosine 0,8 với A (test gộp).
                v if (v - 50.0 / i16::MAX as f32).abs() < 1e-6 => vec![0.8, 0.6, 0.0],
                v if v > 0.0 => vec![1.0, 0.0, 0.0],
                v if v < 0.0 => vec![0.0, 1.0, 0.0],
                _ => vec![0.0, 0.0, 0.0],
            })
        }
    }

    fn worker() -> (Worker<Fake>, Arc<Mutex<Vec<usize>>>) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let c = calls.clone();
        let w = Worker::new(move |path: &Path, sha256: Option<&str>| {
            // `sai`: như bộ nạp thật khi byte đọc được khác SHA-256 app đã kiểm (`Embedder::load_checked`).
            if path.ends_with("hong.onnx") || sha256 == Some("sai") {
                anyhow::bail!("model hỏng")
            }
            Ok(Fake(c.clone()))
        });
        (w, calls)
    }

    fn load(w: &mut Worker<Fake>, path: &str, config: SpeakerConfig) -> Step {
        w.handle(Request::Load {
            model_path: path.into(),
            model_sha256: None,
            config,
            names: NamesSetup::off(),
        })
    }

    /// Đoạn `id` dài `ms` (thời lượng thật), PCM `pcm_len` mẫu toàn giá trị `value`.
    fn seg(id: u64, ms: u64, pcm_len: usize, value: i16, source: Source) -> Request {
        Request::Segment(SegmentAudio {
            segment_id: id,
            start_ms: 10_000,
            end_ms: 10_000 + ms,
            source,
            pcm: vec![value; pcm_len],
        })
    }

    fn replies(step: Step) -> Vec<Response> {
        match step {
            Step::Reply(r) => r,
            Step::Exit => panic!("không mong đợi Exit"),
        }
    }

    fn voices(list: &[(u32, bool)]) -> Response {
        Response::Voices {
            voices: list.iter().map(|&(voice, mic)| VoiceInfo::new(voice, 0, mic)).collect(),
            participants: Vec::new(),
        }
    }

    /// So `Voices` bỏ qua `speech_ms` (thay đổi theo từng đoạn).
    fn strip(rs: Vec<Response>) -> Vec<Response> {
        rs.into_iter()
            .map(|r| match r {
                Response::Voices { voices, participants } => Response::Voices {
                    voices: voices.into_iter().map(|v| VoiceInfo { speech_ms: 0, ..v }).collect(),
                    participants,
                },
                other => other,
            })
            .collect()
    }

    fn assign(id: u64, voice: Option<u32>, confidence: f32) -> Response {
        Response::Assign {
            segment_id: id,
            voice,
            confidence,
        }
    }

    #[test]
    fn load_reports_whether_the_model_is_usable() {
        let (mut w, _) = worker();
        let ready = |ok| {
            vec![Response::Ready {
                protocol_version: PROTOCOL_VERSION,
                model_ok: ok,
                reader_platform: crate::reader::PLATFORM,
            }]
        };
        assert_eq!(
            replies(load(&mut w, "/m/hong.onnx", SpeakerConfig::default())),
            ready(false)
        );
        assert_eq!(
            replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System))),
            [Response::Error {
                segment_id: Some(1),
                kind: ErrorKind::NotLoaded,
                message: "chưa nạp model".into()
            }]
        );
        assert_eq!(
            replies(load(&mut w, "/m/tot.onnx", SpeakerConfig::default())),
            ready(true)
        );
        // SHA-256 của `Load` tới bộ nạp; bộ nạp từ chối thì model không dùng được.
        let checked = Request::Load {
            model_path: "/m/tot.onnx".into(),
            model_sha256: Some("sai".into()),
            config: SpeakerConfig::default(),
            names: NamesSetup::off(),
        };
        assert_eq!(replies(w.handle(checked)), ready(false));
    }

    #[test]
    fn a_bad_config_falls_back_to_the_defaults() {
        let (mut w, _) = worker();
        let bad = SpeakerConfig {
            theta: f32::NAN,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", bad);
        assert_eq!(w.config(), &SpeakerConfig::default());
        let good = SpeakerConfig {
            theta: 0.5,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", good.clone());
        assert_eq!(w.config(), &good);
    }

    /// A2 (spec §5.2): chỉ nhúng tối đa 4 s đầu; thời lượng cho phân cụm là `end_ms − start_ms`, không phải số mẫu PCM.
    #[test]
    fn only_four_seconds_are_embedded_but_the_real_duration_clusters() {
        let (mut w, calls) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        // PCM 0,6 s nhưng đoạn thật dài 1,0 s: dưới `min_new_ms` (1,5 s) nên chưa mở giọng.
        assert_eq!(
            strip(replies(w.handle(seg(0, 1_000, 9_600, 100, Source::System)))),
            [assign(0, None, 0.0)]
        );
        // Cùng PCM nhưng đoạn thật dài 2,0 s: mở giọng 1.
        assert_eq!(
            strip(replies(w.handle(seg(1, 2_000, 9_600, 100, Source::System)))),
            [assign(1, Some(1), 1.0), voices(&[(1, false)])]
        );
        // Đoạn 6 s: app chỉ gửi 4 s đầu, worker nhúng đúng 4 s.
        replies(w.handle(seg(2, 6_000, MAX_EMBED_SAMPLES, 100, Source::System)));
        assert_eq!(*calls.lock().unwrap(), [9_600, 9_600, MAX_EMBED_SAMPLES]);
        // PCM dài hơn 4 s là lỗi của app.
        assert!(matches!(
            replies(w.handle(seg(3, 6_000, MAX_EMBED_SAMPLES + 1, 100, Source::System)))[..],
            [Response::Error {
                kind: ErrorKind::InvalidRequest,
                ..
            }]
        ));
    }

    #[test]
    fn short_segments_are_not_embedded_and_take_the_previous_voice() {
        let (mut w, calls) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        // 0,4 s < `min_embed_ms`: không gọi nhúng, lấy giọng trước, độ tin 0.
        assert_eq!(
            strip(replies(w.handle(seg(1, 400, 6_400, -100, Source::System)))),
            [assign(1, Some(1), 0.0)]
        );
        // 0,6 s nhưng PCM thiếu (dưới `MIN_SAMPLES`): cũng không nhúng.
        assert_eq!(
            strip(replies(w.handle(seg(2, 600, 7_000, -100, Source::System)))),
            [assign(2, Some(1), 0.0)]
        );
        assert_eq!(calls.lock().unwrap().len(), 1);
    }

    /// `Assign` trước, rồi `Voices` khi danh sách giọng đổi; không đổi thì chỉ `Assign`.
    #[test]
    fn voices_are_sent_only_when_the_list_changes() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)))),
            [assign(0, Some(1), 1.0), voices(&[(1, false)])]
        );
        assert_eq!(
            strip(replies(w.handle(seg(1, 2_000, 32_000, -100, Source::System)))),
            [assign(1, Some(2), 1.0), voices(&[(1, false), (2, false)])]
        );
        assert_eq!(
            strip(replies(w.handle(seg(2, 2_000, 32_000, 100, Source::System)))),
            [assign(2, Some(1), 1.0)]
        );
    }

    #[test]
    fn an_unusable_embedding_opens_no_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 0, Source::System)))),
            [assign(0, None, 0.0)]
        );
    }

    /// Nhúng lỗi (như đoạn im lặng, tiếng ù: `Embedder::embed` từ chối đoạn không có đặc trưng) không mở giọng: đoạn lấy giọng
    /// trước với độ tin 0, như đoạn quá ngắn; lỗi được đếm trong tóm tắt.
    #[test]
    fn an_embedding_error_opens_no_voice_and_takes_the_previous_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        // Chưa có giọng nào: không có giọng để lấy.
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 7, Source::System)))),
            [assign(0, None, 0.0)]
        );
        replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System)));
        assert_eq!(
            strip(replies(w.handle(seg(2, 2_000, 32_000, 7, Source::System)))),
            [assign(2, Some(1), 0.0)]
        );
        let s = w.summary();
        assert!(
            s.contains("1 lần nhúng (lỗi 2)") && s.contains("1 giọng còn sống"),
            "{s}"
        );
    }

    /// `Load` lần hai thả model cũ trước khi nạp model mới, để RAM không giữ hai model cùng lúc.
    #[test]
    fn a_second_load_drops_the_old_model_first() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct Counted(Arc<AtomicUsize>);
        impl Embed for Counted {
            fn embed(&self, _: &[f32]) -> Result<Vec<f32>> {
                Ok(vec![1.0, 0.0, 0.0])
            }
        }
        impl Drop for Counted {
            fn drop(&mut self) {
                self.0.fetch_sub(1, Ordering::SeqCst);
            }
        }

        let alive = Arc::new(AtomicUsize::new(0));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (a, s) = (alive.clone(), seen.clone());
        let mut w = Worker::new(move |_: &Path, _: Option<&str>| {
            s.lock().unwrap().push(a.load(Ordering::SeqCst));
            a.fetch_add(1, Ordering::SeqCst);
            Ok(Counted(a.clone()))
        });
        for _ in 0..3 {
            w.handle(Request::Load {
                model_path: "/m/tot.onnx".into(),
                model_sha256: None,
                config: SpeakerConfig::default(),
                names: NamesSetup::off(),
            });
        }
        // Mỗi lần bộ nạp chạy, không còn model nào sống; sau cùng chỉ còn model mới nhất.
        assert_eq!(*seen.lock().unwrap(), [0, 0, 0]);
        assert_eq!(alive.load(Ordering::SeqCst), 1);
        drop(w);
        assert_eq!(alive.load(Ordering::SeqCst), 0);
    }

    /// Giọng có ≥ 60% thời lượng từ micro là giọng trong phòng (spec §5.5); cờ đổi thì gửi lại `Voices`.
    #[test]
    fn a_voice_mostly_from_the_mic_is_in_the_room() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 100, Source::Mic)))),
            [assign(0, Some(1), 1.0), voices(&[(1, true)])]
        );
        // 2 s micro, rồi 2 s âm thanh máy: 50% < 60%, không còn là giọng trong phòng.
        let r = strip(replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System))));
        assert_eq!(r[1], voices(&[(1, false)]));
        // `Mixed` không tính là micro.
        let r = strip(replies(w.handle(seg(2, 2_000, 32_000, 100, Source::Mixed))));
        assert_eq!(r.len(), 1, "{r:?}");
    }

    /// Gộp (mặc định tắt, bật lại được qua `speaker_config`): `merged` của bộ phân cụm thành `Merged`, thời lượng cộng sang giọng
    /// giữ lại. A = (1,0,0), D = (0,8; 0,6; 0): cosine 0,8. θ 0,9 nên D mở giọng 2; gộp 0,7 khi cả hai ≥ 3 s nên giọng 2 gộp
    /// ngay vào giọng 1 (bằng thời lượng thì giữ giọng mở trước), mã của chính đoạn đổi theo thành 1. Danh sách giọng trước và sau
    /// đều là [1] nên không có `Voices`; app bỏ giọng 2 nhờ `Merged`.
    #[test]
    fn merges_are_reported() {
        let (mut w, _) = worker();
        let config = SpeakerConfig {
            theta: 0.9,
            merge_theta: 0.7,
            merge_min_ms: 3_000,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", config);
        replies(w.handle(seg(0, 4_000, 32_000, 100, Source::System)));
        let r = strip(replies(w.handle(seg(1, 4_000, 32_000, 50, Source::System))));
        assert_eq!(r, [assign(1, Some(1), 1.0), Response::Merged { from: 2, into: 1 }]);
    }

    #[test]
    fn session_start_forgets_every_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        assert!(replies(w.handle(Request::SessionStart { unix_ms: 1 })).is_empty());
        // Giọng cũ đã xóa: đoạn ngắn đầu tiên không có giọng nào để lấy.
        assert_eq!(
            strip(replies(w.handle(seg(1, 400, 6_400, 100, Source::System)))),
            [assign(1, None, 0.0)]
        );
    }

    #[test]
    fn bad_segments_are_rejected_without_panicking() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        let reversed = Request::Segment(SegmentAudio {
            segment_id: 9,
            start_ms: 5_000,
            end_ms: 4_000,
            source: Source::System,
            pcm: vec![1; 100],
        });
        assert!(matches!(
            replies(w.handle(reversed))[..],
            [Response::Error {
                segment_id: Some(9),
                kind: ErrorKind::InvalidRequest,
                ..
            }]
        ));
        assert!(matches!(
            replies(w.handle(seg(10, MAX_SEGMENT_MS + 1, 100, 1, Source::System)))[..],
            [Response::Error {
                kind: ErrorKind::InvalidRequest,
                ..
            }]
        ));
        assert_eq!(w.handle(Request::Shutdown), Step::Exit);
    }

    #[test]
    fn the_summary_has_only_counts() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        let s = w.summary();
        assert!(s.contains("1 đoạn") && s.contains("1 lần nhúng"), "{s}");
        assert!(!s.contains("100"), "không có mẫu âm thanh: {s}");
    }

    fn loaded(config: SpeakerConfig) -> Worker<Fake> {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", config);
        w
    }

    fn assigns(rs: &[Response]) -> Vec<(u64, Option<u32>)> {
        rs.iter()
            .filter_map(|r| match r {
                Response::Assign { segment_id, voice, .. } => Some((*segment_id, *voice)),
                _ => None,
            })
            .collect()
    }

    const VA: [f32; 3] = [1.0, 0.0, 0.0];
    const VB: [f32; 3] = [0.0, 1.0, 0.0];

    #[test]
    fn late_relabel_resends_assign_for_the_old_segment_and_moves_the_tally() {
        let mut w = loaded(SpeakerConfig::default());
        // Đoạn 2 (B, 1000 ms) sai ngay lúc đầu: giọng 1 của đoạn trước. B thật mở giọng 2 ở đoạn 3.
        let r1 = w.segment_with(1, 0, 2_000, Source::System, Some(VA.to_vec()));
        let r2 = w.segment_with(2, 2_000, 3_000, Source::Mic, Some(VB.to_vec()));
        let r3 = w.segment_with(3, 3_000, 5_000, Source::System, Some(VB.to_vec()));
        assert_eq!(assigns(&r1), [(1, Some(1))]);
        assert_eq!(assigns(&r2), [(2, Some(1))]);
        assert_eq!(assigns(&r3), [(3, Some(2))]);
        // Chưa tới hạn (3000 + 30 000): đoạn có giọng khác nhưng chưa đổi.
        let early = w.segment_with(4, 30_000, 32_000, Source::System, Some(VB.to_vec()));
        assert_eq!(assigns(&early), [(4, Some(2))]);
        // Tới hạn: đoạn 2 đổi sang giọng 2, ngay sau Assign của đoạn mới; đoạn 1 và 3 không đổi nên không phát lại.
        let due = w.segment_with(5, 33_000, 35_000, Source::System, Some(VB.to_vec()));
        assert_eq!(assigns(&due), [(5, Some(2)), (2, Some(2))]);
        assert!(matches!(due[1], Response::Assign { confidence, .. } if confidence == 0.0));
        let t = |v| w.tally[&v];
        assert_eq!((t(1).speech_ms, t(1).mic_ms), (2_000, 0));
        assert_eq!((t(2).speech_ms, t(2).mic_ms), (2_000 + 2_000 + 1_000 + 2_000, 1_000));
        // Không phát lại lần hai.
        let after = w.segment_with(6, 36_000, 38_000, Source::System, Some(VB.to_vec()));
        assert_eq!(assigns(&after), [(6, Some(2))]);
    }

    #[test]
    fn late_relabel_can_be_turned_off_in_the_config() {
        let mut w = loaded(SpeakerConfig {
            late_relabel_ms: 0,
            ..SpeakerConfig::default()
        });
        w.segment_with(1, 0, 2_000, Source::System, Some(VA.to_vec()));
        w.segment_with(2, 2_000, 3_000, Source::System, Some(VB.to_vec()));
        w.segment_with(3, 3_000, 5_000, Source::System, Some(VB.to_vec()));
        let due = w.segment_with(4, 100_000, 102_000, Source::System, Some(VB.to_vec()));
        assert_eq!(assigns(&due), [(4, Some(2))]);
    }

    /// Chi phí của chốt muộn trên chuỗi dài: chênh lệch mỗi đoạn dưới 1 ms (bản debug còn chậm hơn bản thật; ngưỡng rộng).
    #[test]
    fn late_relabel_costs_under_a_millisecond_per_segment() {
        let run = |late_relabel_ms: u64| {
            let mut w = loaded(SpeakerConfig {
                late_relabel_ms,
                ..SpeakerConfig::default()
            });
            let dim192 = |k: usize| -> Vec<f32> {
                // Bốn "người" trên vector 192 chiều, lệch nhẹ theo đoạn.
                (0..192)
                    .map(|i| if i % 4 == k % 4 { 1.0 } else { 0.0 } + ((i * 7 + k * 13) % 17) as f32 * 0.01)
                    .collect()
            };
            let t0 = std::time::Instant::now();
            let mut changed = 0usize;
            for k in 0..2_000usize {
                let start = k as u64 * 2_000;
                // Đầu phiên có một lỗi như thật: đoạn 1 (người thứ hai) quá ngắn để mở giọng nên mang giọng người thứ nhất; chốt
                // muộn phải sửa nó, nên bên "bật" có ít nhất một đổi nhãn.
                let (len, person) = match k {
                    0 => (1_800, 0),
                    1 => (1_000, 1),
                    2 => (1_800, 1),
                    _ => (1_800, (k / 3) % 4),
                };
                let rs = w.segment_with(k as u64, start, start + len, Source::System, Some(dim192(person)));
                changed += assigns(&rs).len().saturating_sub(1);
            }
            (t0.elapsed(), changed)
        };
        let (off, off_changed) = run(0);
        let (on, on_changed) = run(30_000);
        assert_eq!(off_changed, 0, "tắt thì không đổi nhãn nào");
        assert!(
            on_changed > 0,
            "bật mà không đổi nhãn nào: chuỗi thử không kiểm được nhánh chốt muộn"
        );
        let per_segment_ms = on.saturating_sub(off).as_secs_f64() * 1000.0 / 2_000.0;
        eprintln!("chốt muộn: tắt {off:?}, bật {on:?}, chênh {per_segment_ms:.4} ms mỗi đoạn");
        assert!(per_segment_ms < 1.0, "{per_segment_ms} ms mỗi đoạn");
    }
}
