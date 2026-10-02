//! Nối `audio-capture` vào pipeline (spec §6.1, §6.2, §9): mở nguồn âm thanh theo cài đặt `audioSource`, đưa mẫu 16 kHz
//! mono cho `pipeline::engine`.
//!
//! - Nguồn được mở và chạy trên một luồng riêng ("capture"), để việc mở (tạo tap và aggregate device, lần đầu macOS có
//!   thể hỏi quyền) không chặn luồng VAD.
//! - Mỗi 500 ms luồng đó xem thiết bị phát mặc định đã đổi chưa (cắm tai nghe, Bluetooth, tai nghe đổi tần số mẫu) và
//!   luồng thu còn sống không (`AudioSource::failed`; macOS chỉ tap một app: app đó đã thoát); có thì mở lại nguồn (§9:
//!   khởi tạo lại trong ≤ 2 giây). Áp cho cả nguồn toàn hệ thống lẫn nguồn một app.
//! - macOS, tap chết mà không báo gì (`coreaudiod` khởi động lại, aggregate mất sau khi máy ngủ; Q-G của review 02 lần 2):
//!   số khung nhận được ([`CaptureStats::frames`]) không tăng suốt 3 giây trong khi app cần thu vẫn đang phát tiếng thì mở
//!   lại nguồn ([`StallWatch`]). Aggregate đặt `tapautostart`, nên lúc không app nào phát thì không có khung nào là
//!   bình thường; vì vậy chỉ xét khi có app phát. Mở lại 3 lần liên tiếp mà vẫn không có khung thì chờ lâu dần, tối đa
//!   30 giây ([`StallBackoff`]). Nguồn một app: app có tiến trình phát tiếng chưa được tap (helper mới, pid được cấp lại)
//!   thì cũng mở lại; tập chỉ thu nhỏ thì không. Quyết định của mỗi lần kiểm là hàm thuần [`on_tick`].
//! - Báo lỗi ([`FailurePolicy`]): lần mở đầu tiên lỗi thì báo ngay. Nguồn đã chạy được rồi mà lỗi (đang mở lại) thì chỉ báo
//!   khi lỗi kéo dài từ 10 giây, vì §9 đòi tự khởi tạo lại, không dừng phiên. Nguồn một app đã chạy được rồi mà app đó
//!   không phát tiếng nữa (đã đóng, Q-C của review 02 lần 2) thì không dừng phiên: thử lại mỗi 2 giây và báo
//!   [`CaptureEvent::WaitingForApp`] để màn hình chính hiện chỉ báo.
//! - macOS: nguồn trả mẫu toàn số 0 tuyệt đối suốt 3 giây trong khi app cần thu đang phát tiếng, và từ đầu phiên chưa có
//!   mẫu nào khác 0, thì nhiều khả năng app chưa được cấp quyền "Ghi âm thanh hệ thống" (§9): báo
//!   [`CaptureEvent::PermissionSuspected`], không dừng phiên. Đã có âm thanh thật một lần thì quyền đã có: cuộc họp im
//!   lặng sau đó không bị báo nhầm (Q-B của review 02 lần 2).
//! - Trong lúc nguồn chưa chạy hay đang mở lại, `ClockFiller` chèn im lặng theo đồng hồ thật, để thời gian phụ đề không
//!   lệch.
//! - Âm thanh chỉ nằm trong RAM (§10.1): không ghi xuống đĩa, không gửi đi đâu.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use audio_capture::preprocess::{ClockFiller, Preprocessor, RING_SAMPLES};
use audio_capture::{AudioSource as Source, CaptureStats};
use pipeline::engine::FrameSource;

use crate::errors;
use crate::settings::AudioSource;

/// Chu kỳ kiểm thiết bị phát và luồng thu (§6.2).
const WATCH_EVERY: Duration = Duration::from_millis(500);
/// Luồng thu xem cờ dừng sau mỗi bước chờ ngắn này.
const STEP: Duration = Duration::from_millis(50);
/// Mở nguồn lỗi thì thử lại sau chừng này.
const RETRY_AFTER: Duration = Duration::from_secs(2);
/// Nguồn đã chạy được rồi mà lỗi liên tục chừng này thì mới báo (§9: tự khởi tạo lại trong ≤ 2 giây).
const FAIL_AFTER: Duration = Duration::from_secs(10);
/// Mẫu toàn số 0 tuyệt đối chừng này (trong khi có app đang phát) thì nghi chưa có quyền (§9).
const ZERO_FOR: Duration = Duration::from_secs(3);
/// Không có khung mới chừng này trong khi app cần thu đang phát thì coi tap đã chết (Q-G của review 02 lần 2).
const STALL_FOR: Duration = Duration::from_secs(3);
/// Trần của thời gian chờ đó khi đã mở lại nhiều lần liên tiếp mà vẫn không có khung ([`StallBackoff`]).
const STALL_MAX: Duration = Duration::from_secs(30);
/// Nguồn một app: chu kỳ so tập tiến trình đang phát với tập đã tap.
#[cfg(target_os = "macos")]
const PIDS_EVERY: Duration = Duration::from_secs(2);
/// Chu kỳ ghi số liệu của luồng thu vào log (02c Task 8 đọc để kiểm tiền đề của `StallWatch`).
const STATS_EVERY: Duration = Duration::from_secs(60);
/// `LiveCapture` bị hủy thì chờ luồng thu tối đa chừng này, để tap cũ không còn chạy song song với phiên mới.
const JOIN_WITHIN: Duration = Duration::from_millis(500);

/// Việc nguồn âm thanh báo cho phiên.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CaptureEvent {
    /// Không thu được âm thanh: phiên dừng với mã lỗi này (`errors`).
    Failed { code: &'static str, message: String },
    /// macOS: nghi chưa được cấp quyền ghi âm thanh hệ thống (`true`), hoặc đã có âm thanh thật trở lại (`false`).
    PermissionSuspected(bool),
    /// Nguồn một app: app đã chọn không phát tiếng nữa, đang chờ nó phát lại (`true`), hoặc đã thu lại được (`false`).
    WaitingForApp(bool),
}

pub type OnEvent = Box<dyn Fn(CaptureEvent) + Send + Sync>;

/// Việc phải làm sau một lần mở nguồn thất bại.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OnFailure {
    /// Thử lại sau, không báo gì.
    Retry,
    /// Báo lỗi: phiên dừng.
    Report,
    /// Nguồn một app: app không phát tiếng nữa; báo chỉ báo "đang chờ app", không dừng phiên, thử lại sau.
    Wait,
}

/// Khi nào một lần mở nguồn thất bại phải báo cho phiên (Q2 của review 02c, Q-C của review 02 lần 2).
#[derive(Debug, Default)]
pub struct FailurePolicy {
    ever_ok: bool,
    failing_since: Option<Instant>,
    reported: bool,
    waiting: bool,
}

impl FailurePolicy {
    /// Nguồn vừa chạy được. Trả `true` nếu trước đó đang chờ app phát tiếng lại (để tắt chỉ báo).
    pub fn on_ok(&mut self) -> bool {
        self.ever_ok = true;
        self.failing_since = None;
        self.reported = false;
        std::mem::take(&mut self.waiting)
    }

    /// Một lần mở thất bại lúc `now`. `app_not_playing`: nguồn một app mà app đó không phát tiếng. Mỗi đợt lỗi báo một
    /// lần.
    pub fn on_failure(&mut self, now: Instant, app_not_playing: bool) -> OnFailure {
        if self.ever_ok && app_not_playing {
            self.failing_since = None;
            return if std::mem::replace(&mut self.waiting, true) {
                OnFailure::Retry
            } else {
                OnFailure::Wait
            };
        }
        let since = *self.failing_since.get_or_insert(now);
        let due = !self.ever_ok || now.duration_since(since) >= FAIL_AFTER;
        if due && !self.reported {
            self.reported = true;
            return OnFailure::Report;
        }
        OnFailure::Retry
    }
}

/// Phát hiện tap chết không báo gì (Q-G của review 02 lần 2): số khung không tăng suốt `after` (mặc định [`STALL_FOR`]).
#[derive(Debug)]
pub struct StallWatch {
    frames: u64,
    since: Instant,
    after: Duration,
}

impl StallWatch {
    pub fn new(now: Instant) -> Self {
        Self::with_threshold(now, STALL_FOR)
    }

    pub fn with_threshold(now: Instant, after: Duration) -> Self {
        Self {
            frames: 0,
            since: now,
            after,
        }
    }

    /// Đổi thời gian chờ, giữ mốc đếm hiện tại.
    pub fn set_threshold(&mut self, after: Duration) {
        self.after = after;
    }

    /// Số khung hiện tại lúc `now`. Trả `true` nếu đã đứng yên đủ lâu mà app cần thu vẫn đang phát (`playing` chỉ được
    /// hỏi khi đã đứng yên đủ lâu).
    pub fn stalled(&mut self, frames: u64, now: Instant, playing: impl FnOnce() -> bool) -> bool {
        if frames != self.frames {
            self.frames = frames;
            self.since = now;
            return false;
        }
        if now.duration_since(self.since) < self.after {
            return false;
        }
        if playing() {
            return true;
        }
        // Không ai phát: không có khung là bình thường. Đếm lại từ đầu.
        self.since = now;
        false
    }
}

/// Mở lại vì tap chết mà số khung vẫn không tăng (Nhỏ-5 của review 02 lần 3): 3 lần đầu chờ [`STALL_FOR`], sau đó giãn
/// gấp đôi mỗi lần, tối đa [`STALL_MAX`], để một cấu hình mà tiền đề của `StallWatch` sai không làm dựng lại tap mỗi 3
/// giây suốt phiên. Các lần này không tính vào [`FailurePolicy`]: mở lại vẫn thành công.
#[derive(Debug, Default)]
pub struct StallBackoff {
    reopens: u32,
}

impl StallBackoff {
    /// Thời gian đứng yên phải chờ trước khi coi là tap chết, sau `reopens` lần mở lại liên tiếp không có khung nào.
    pub fn threshold(&self) -> Duration {
        match self.reopens {
            0..=2 => STALL_FOR,
            n => STALL_FOR.saturating_mul(1 << (n - 2).min(8)).min(STALL_MAX),
        }
    }

    /// Vừa mở lại vì tap chết. Trả `true` đúng một lần, ở lần bắt đầu giãn (để ghi cảnh báo một lần).
    pub fn on_stall_reopen(&mut self) -> bool {
        self.reopens += 1;
        self.reopens == 3
    }

    /// Nguồn đã có khung: đếm lại từ đầu.
    pub fn on_frames(&mut self) {
        self.reopens = 0;
    }
}

/// Nguồn một app: trong các tiến trình đang phát tiếng của app (`None`: app không phát gì lúc này) có tiến trình chưa được
/// tap. Tập chỉ thu nhỏ (một helper ngừng phát) thì tap cũ vẫn đúng, không mở lại (Nhỏ-6 của review 02 lần 3).
pub fn pids_changed(tapped: &[i32], playing: Option<&[i32]>) -> bool {
    playing.is_some_and(|p| p.iter().any(|pid| !tapped.contains(pid)))
}

/// Việc của một lần kiểm (mỗi 500 ms) khi nguồn đang chạy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tick {
    Continue,
    /// Mở lại nguồn, kèm lý do để ghi log.
    Reopen(Reopen),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reopen {
    /// Thiết bị phát mặc định đã đổi, hoặc luồng thu đã dừng.
    Device,
    /// Tap chết: không có khung mới trong khi app cần thu vẫn đang phát.
    Stalled,
    /// Nguồn một app: app có tiến trình phát tiếng chưa được tap.
    NewProcess,
}

/// Những gì một lần kiểm thấy.
#[derive(Clone, Copy, Debug, Default)]
pub struct Observed {
    pub device_changed: bool,
    pub source_failed: bool,
    pub stalled: bool,
    pub new_process: bool,
}

/// Quyết định của một lần kiểm (Nhỏ-3 của review 02 lần 3): hàm thuần, tách khỏi `capture_loop` để test được.
pub fn on_tick(seen: Observed) -> Tick {
    if seen.device_changed || seen.source_failed {
        Tick::Reopen(Reopen::Device)
    } else if seen.stalled {
        Tick::Reopen(Reopen::Stalled)
    } else if seen.new_process {
        Tick::Reopen(Reopen::NewProcess)
    } else {
        Tick::Continue
    }
}

/// Phần kiểm của `capture_loop` cho các lần mở nối tiếp nhau (Nhỏ-1, Nhỏ-2 của review 02 lần 4): `StallWatch` của lần mở
/// hiện tại, với thời gian chờ theo [`StallBackoff`]. Có khung trở lại thì bậc chờ về đầu ngay trong lần mở đó.
#[derive(Debug)]
pub struct Watch {
    backoff: StallBackoff,
    stall: StallWatch,
    frames: u64,
}

impl Watch {
    pub fn new(now: Instant) -> Self {
        Self {
            backoff: StallBackoff::default(),
            stall: StallWatch::new(now),
            frames: 0,
        }
    }

    /// Vừa mở (hay mở lại) nguồn: đếm khung lại từ đầu, chờ theo bậc hiện tại.
    pub fn opened(&mut self, now: Instant) {
        self.stall = StallWatch::with_threshold(now, self.backoff.threshold());
        self.frames = 0;
    }

    /// Thời gian chờ đang dùng.
    pub fn threshold(&self) -> Duration {
        self.stall.after
    }

    /// Một lần kiểm: `frames` là số khung của lần mở này, `check_stall` là có xét tap chết không (macOS), `playing` chỉ
    /// được hỏi khi số khung đã đứng yên đủ lâu. `seen` là những dấu hiệu khác (thiết bị, luồng thu, tiến trình mới).
    pub fn tick(
        &mut self,
        now: Instant,
        frames: u64,
        check_stall: bool,
        playing: impl FnOnce() -> bool,
        seen: Observed,
    ) -> Tick {
        if frames > self.frames {
            self.frames = frames;
            self.backoff.on_frames();
            self.stall.set_threshold(self.backoff.threshold());
        }
        let stalled = check_stall && self.stall.stalled(frames, now, playing);
        let tick = on_tick(Observed { stalled, ..seen });
        if tick == Tick::Reopen(Reopen::Stalled) && self.backoff.on_stall_reopen() {
            log::warn!("mở lại 3 lần liên tiếp mà vẫn không có khung: từ giờ chờ lâu dần trước khi mở lại");
        }
        tick
    }
}

/// Việc báo cho phiên sau một lần mở nguồn thất bại (hàm thuần, như [`on_tick`]).
pub fn failure_event(verdict: OnFailure, code: &'static str, message: String) -> Option<CaptureEvent> {
    match verdict {
        OnFailure::Report => Some(CaptureEvent::Failed { code, message }),
        OnFailure::Wait => Some(CaptureEvent::WaitingForApp(true)),
        OnFailure::Retry => None,
    }
}

/// Theo dõi chuỗi mẫu toàn số 0 tuyệt đối (Q4 của review 02c). Đã nhận một mẫu khác 0 trong phiên thì tắt hẳn (Q-B của
/// review 02 lần 2): quyền đã có, số 0 sau đó là cuộc họp im lặng.
#[derive(Debug, Default)]
pub struct ZeroWatch {
    zero_since: Option<Instant>,
    suspected: bool,
    heard: bool,
}

impl ZeroWatch {
    /// Mẫu thật vừa nhận (không gồm im lặng do `ClockFiller` chèn). `someone_playing` chỉ được gọi khi chuỗi số 0 đã đủ
    /// dài. Trả trạng thái mới khi nó đổi.
    pub fn push(&mut self, samples: &[f32], now: Instant, someone_playing: impl FnOnce() -> bool) -> Option<bool> {
        if samples.is_empty() || self.heard {
            return None;
        }
        if samples.iter().any(|&x| x != 0.0) {
            self.heard = true;
            self.zero_since = None;
            return std::mem::take(&mut self.suspected).then_some(false);
        }
        let since = *self.zero_since.get_or_insert(now);
        if !self.suspected && now.duration_since(since) >= ZERO_FOR {
            if someone_playing() {
                self.suspected = true;
                return Some(true);
            }
            // Không app nào phát: số 0 là im lặng thật. Đếm lại từ đầu.
            self.zero_since = Some(now);
        }
        None
    }
}

/// Nguồn của cài đặt hiện tại. `include_self`: macOS, tap toàn hệ thống thu cả âm thanh của chính app (bước "Nghe thử",
/// §4.1 bước 6, Đ16 của kế hoạch 00); Windows, loopback vốn thu mọi âm thanh của máy nên không đổi gì.
fn open_sources(source: &AudioSource, include_self: bool) -> anyhow::Result<Opened> {
    #[cfg(target_os = "macos")]
    {
        use audio_capture::macos::{MacTapSource, TapTarget};
        let mut tapped = None;
        let target = match source {
            AudioSource::App { bundle_id } => {
                let pids = playing_pids(bundle_id).ok_or_else(|| anyhow::anyhow!("{bundle_id} không phát âm thanh"))?;
                tapped = Some(pids.clone());
                TapTarget::Processes(pids)
            }
            _ if include_self => TapTarget::System,
            _ => TapTarget::SystemExceptSelf,
        };
        let stats = Arc::new(CaptureStats::default());
        Ok(Opened {
            sources: vec![Box::new(MacTapSource::new(target, stats.clone()))],
            stats: vec![stats],
            tapped,
        })
    }
    #[cfg(windows)]
    {
        let _ = include_self;
        use audio_capture::windows::{Endpoint, LoopbackSource, Role, default_endpoint_id};
        let mut stats = Vec::new();
        let mut open = |endpoint: Endpoint| -> Box<dyn Source> {
            let s = Arc::new(CaptureStats::default());
            stats.push(s.clone());
            Box::new(LoopbackSource::new(endpoint, s))
        };
        let sources = match source {
            AudioSource::Device { id } => vec![open(Endpoint::Device(id.clone()))],
            _ => {
                // Chế độ tự động (§6.1): Console, cộng Communications nếu là thiết bị khác.
                let mut sources = vec![open(Endpoint::Default(Role::Console))];
                if default_endpoint_id(Role::Console)? != default_endpoint_id(Role::Communications)? {
                    sources.push(open(Endpoint::Default(Role::Communications)));
                }
                sources
            }
        };
        Ok(Opened {
            sources,
            stats,
            tapped: None,
        })
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (source, include_self);
        anyhow::bail!("chỉ hỗ trợ macOS và Windows")
    }
}

/// Các nguồn vừa mở, số liệu của từng nguồn, và (nguồn một app, macOS) tập tiến trình đã tap.
struct Opened {
    sources: Vec<Box<dyn Source>>,
    stats: Vec<Arc<CaptureStats>>,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    tapped: Option<Vec<i32>>,
}

/// macOS: các tiến trình đang phát tiếng của app `bundle_id` (đã sắp xếp), `None` nếu app không phát gì.
#[cfg(target_os = "macos")]
fn playing_pids(bundle_id: &str) -> Option<Vec<i32>> {
    audio_capture::macos::audio_apps()
        .ok()?
        .into_iter()
        .find(|a| a.bundle_id == bundle_id)
        .map(|a| a.pids)
}

/// App cần thu có đang phát tiếng không (macOS): nguồn một app thì chỉ xét chính app đó, nguồn toàn hệ thống thì xét
/// mọi app khác. Windows không cần: loopback không phụ thuộc quyền, và không có khung khi im lặng là bình thường.
fn someone_playing(source: &AudioSource) -> bool {
    #[cfg(target_os = "macos")]
    return match source {
        AudioSource::App { bundle_id } => playing_pids(bundle_id).is_some(),
        _ => audio_capture::macos::audio_apps().is_ok_and(|apps| !apps.is_empty()),
    };
    #[allow(unreachable_code)]
    {
        let _ = source;
        false
    }
}

/// Mã lỗi cho một lần mở nguồn thất bại.
fn error_code(source: &AudioSource, err: &anyhow::Error) -> &'static str {
    let text = format!("{err:#}");
    if matches!(source, AudioSource::App { .. }) && text.contains("không phát âm thanh") {
        errors::APP_NOT_PLAYING
    } else if cfg!(target_os = "macos") && text.contains("AudioHardwareCreateProcessTap") {
        // Tạo tap lỗi: thường là chưa cấp quyền "Ghi âm thanh hệ thống" (§9; chờ C1, dòng 2 của S1).
        errors::AUDIO_PERMISSION
    } else {
        errors::CAPTURE_FAILED
    }
}

/// Chờ `d`, trả `true` nếu được yêu cầu dừng trong lúc chờ.
fn wait_or_stop(stop: &AtomicBool, d: Duration) -> bool {
    let deadline = Instant::now() + d;
    while Instant::now() < deadline {
        if stop.load(Ordering::SeqCst) {
            return true;
        }
        std::thread::sleep(STEP);
    }
    stop.load(Ordering::SeqCst)
}

/// Mở các nguồn và chạy chúng; lỗi thì dừng những nguồn đã chạy.
fn start_sources(source: &AudioSource, include_self: bool) -> anyhow::Result<(Opened, Preprocessor)> {
    let mut opened = open_sources(source, include_self)?;
    let mut rings = Vec::new();
    for s in &mut opened.sources {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        if let Err(e) = s.start(producer) {
            opened.sources.iter_mut().for_each(|s| s.stop());
            return Err(e);
        }
        rings.push((consumer, s.format()));
    }
    match Preprocessor::new(rings) {
        Ok(p) => Ok((opened, p)),
        Err(e) => {
            opened.sources.iter_mut().for_each(|s| s.stop());
            Err(e)
        }
    }
}

/// Chạy nguồn cho tới khi `stop`, mở lại khi thiết bị đổi hay luồng thu chết.
fn capture_loop(
    source: AudioSource,
    include_self: bool,
    shared: Arc<Mutex<Option<Preprocessor>>>,
    stop: Arc<AtomicBool>,
    on_event: Arc<OnEvent>,
) {
    let mut policy = FailurePolicy::default();
    let mut watch = Watch::new(Instant::now());
    // Thiết bị chọn tay (Windows) không theo thiết bị mặc định.
    let follows_default = !matches!(source, AudioSource::Device { .. });
    while !stop.load(Ordering::SeqCst) {
        let signature = audio_capture::default_output_signature();
        let mut opened = match start_sources(&source, include_self) {
            Ok((opened, preprocessor)) => {
                *shared.lock().unwrap_or_else(|e| e.into_inner()) = Some(preprocessor);
                if policy.on_ok() {
                    on_event(CaptureEvent::WaitingForApp(false));
                }
                opened
            }
            Err(e) => {
                let code = error_code(&source, &e);
                log::warn!("không mở được nguồn âm thanh: {e:#}");
                let verdict = policy.on_failure(Instant::now(), code == errors::APP_NOT_PLAYING);
                if let Some(event) = failure_event(verdict, code, format!("{e:#}")) {
                    on_event(event);
                }
                wait_or_stop(&stop, RETRY_AFTER);
                continue;
            }
        };
        log::info!("đang thu âm thanh ({} nguồn)", opened.sources.len());
        let frames = |o: &Opened| o.stats.iter().map(|s| s.frames.load(Ordering::Relaxed)).sum::<u64>();
        watch.opened(Instant::now());
        #[cfg(target_os = "macos")]
        let mut pids_at = Instant::now();
        let mut stats_at = Instant::now();
        while !wait_or_stop(&stop, WATCH_EVERY) {
            let now = Instant::now();
            #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
            let mut seen = Observed {
                device_changed: follows_default && audio_capture::default_output_signature() != signature,
                source_failed: opened.sources.iter().any(|s| s.failed()),
                ..Observed::default()
            };
            #[cfg(target_os = "macos")]
            if let (Some(tapped), AudioSource::App { bundle_id }) = (&opened.tapped, &source)
                && now.duration_since(pids_at) >= PIDS_EVERY
            {
                pids_at = now;
                seen.new_process = pids_changed(tapped, playing_pids(bundle_id).as_deref());
            }
            let threshold = watch.threshold();
            let tick = watch.tick(
                now,
                frames(&opened),
                cfg!(target_os = "macos"),
                || someone_playing(&source),
                seen,
            );
            if let Tick::Reopen(reason) = tick {
                log::info!("mở lại nguồn âm thanh: {reason:?} (chờ tap chết {threshold:?})");
                break;
            }
            if now.duration_since(stats_at) >= STATS_EVERY {
                stats_at = now;
                let all: Vec<[u64; 5]> = opened.stats.iter().map(|s| s.snapshot()).collect();
                log::info!("số liệu thu (frames, silence_inserted, skipped, dropped, rejected_cycles): {all:?}");
            }
        }
        *shared.lock().unwrap_or_else(|e| e.into_inner()) = None;
        opened.sources.iter_mut().for_each(|s| s.stop());
    }
}

/// Nguồn âm thanh thật của một phiên, cho `pipeline::engine`.
pub struct LiveCapture {
    source: AudioSource,
    shared: Arc<Mutex<Option<Preprocessor>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    filler: ClockFiller,
    zeros: ZeroWatch,
    on_event: Arc<OnEvent>,
    started: Instant,
    buf: Vec<f32>,
}

impl LiveCapture {
    pub fn open(source: AudioSource, include_self: bool, on_event: OnEvent) -> Self {
        let shared = Arc::new(Mutex::new(None));
        let stop = Arc::new(AtomicBool::new(false));
        let on_event = Arc::new(on_event);
        let thread = {
            let (shared, stop, on_event, source) = (shared.clone(), stop.clone(), on_event.clone(), source.clone());
            std::thread::Builder::new()
                .name("capture".into())
                .spawn(move || capture_loop(source, include_self, shared, stop, on_event))
                .ok()
        };
        Self {
            source,
            shared,
            stop,
            thread,
            filler: ClockFiller::new(200),
            zeros: ZeroWatch::default(),
            on_event,
            started: Instant::now(),
            buf: Vec::new(),
        }
    }
}

impl FrameSource for LiveCapture {
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        std::thread::sleep(timeout.min(Duration::from_millis(20)));
        self.buf.clear();
        if let Some(p) = self.shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            p.drain(&mut self.buf)?;
        }
        if cfg!(target_os = "macos")
            && let Some(suspected) = self
                .zeros
                .push(&self.buf, Instant::now(), || someone_playing(&self.source))
        {
            (self.on_event)(CaptureEvent::PermissionSuspected(suspected));
        }
        let silence = self.filler.silence_before(self.started.elapsed(), self.buf.len());
        out.extend(std::iter::repeat_n(0.0, silence));
        out.extend_from_slice(&self.buf);
        Ok(!self.stop.load(Ordering::SeqCst))
    }
}

impl Drop for LiveCapture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Chờ luồng thu dừng tap (tối đa 500 ms), để tap của phiên cũ không chạy song song với phiên mới. Luồng kẹt lâu hơn
        // (ví dụ đang chờ hộp thoại quyền lần đầu) thì bỏ mặc: nó tự dừng khi lệnh đang chờ trả về.
        let Some(thread) = self.thread.take() else { return };
        let deadline = Instant::now() + JOIN_WITHIN;
        while !thread.is_finished() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        if thread.is_finished() {
            let _ = thread.join();
        } else {
            log::warn!("luồng thu chưa dừng sau {JOIN_WITHIN:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_errors_map_to_ui_codes() {
        let app = AudioSource::App {
            bundle_id: "us.zoom.xos".into(),
        };
        let not_playing = anyhow::anyhow!("us.zoom.xos không phát âm thanh");
        assert_eq!(error_code(&app, &not_playing), errors::APP_NOT_PLAYING);
        let other = anyhow::anyhow!("AudioDeviceStart lỗi OSStatus 1");
        assert_eq!(error_code(&AudioSource::System, &other), errors::CAPTURE_FAILED);
        #[cfg(target_os = "macos")]
        {
            let tap = anyhow::anyhow!("AudioHardwareCreateProcessTap lỗi OSStatus 560947818");
            assert_eq!(error_code(&AudioSource::System, &tap), errors::AUDIO_PERMISSION);
        }
    }

    /// Q2 của review 02c: lần mở đầu lỗi thì báo ngay; nguồn đã chạy rồi mà lỗi thì chỉ báo khi lỗi kéo dài 10 giây.
    #[test]
    fn failures_are_reported_at_once_only_before_the_first_success() {
        let t0 = Instant::now();
        let at = |s: u64| t0 + Duration::from_secs(s);
        let mut p = FailurePolicy::default();
        assert_eq!(p.on_failure(at(0), false), OnFailure::Report, "lần mở đầu tiên");
        assert_eq!(p.on_failure(at(2), false), OnFailure::Retry, "đã báo rồi");
        let mut p = FailurePolicy::default();
        p.on_ok();
        assert_eq!(p.on_failure(at(0), false), OnFailure::Retry);
        assert_eq!(p.on_failure(at(9), false), OnFailure::Retry);
        assert_eq!(p.on_failure(at(10), false), OnFailure::Report, "lỗi liên tục 10 giây");
        assert_eq!(p.on_failure(at(12), false), OnFailure::Retry);
        p.on_ok();
        assert_eq!(
            p.on_failure(at(20), false),
            OnFailure::Retry,
            "chạy lại được thì đếm lại từ đầu"
        );
        assert_eq!(p.on_failure(at(31), false), OnFailure::Report);
    }

    /// Q-C của review 02 lần 2: nguồn một app. Lần mở đầu mà app không phát tiếng thì báo lỗi (`appNotPlaying`); đã thu
    /// được rồi mà app đóng thì không bao giờ dừng phiên: báo chỉ báo một lần, thử lại mãi, thu lại được thì tắt chỉ báo.
    #[test]
    fn an_app_that_stops_playing_after_the_start_only_shows_an_indicator() {
        let t0 = Instant::now();
        let at = |s: u64| t0 + Duration::from_secs(s);
        let mut p = FailurePolicy::default();
        assert_eq!(p.on_failure(at(0), true), OnFailure::Report, "chưa từng thu được");
        let mut p = FailurePolicy::default();
        assert!(!p.on_ok());
        assert_eq!(p.on_failure(at(0), true), OnFailure::Wait);
        for s in [2, 10, 60, 600] {
            assert_eq!(p.on_failure(at(s), true), OnFailure::Retry, "giây {s}");
        }
        assert!(p.on_ok(), "thu lại được: tắt chỉ báo");
        assert!(!p.on_ok());
        assert_eq!(p.on_failure(at(700), true), OnFailure::Wait, "lần đóng sau lại báo");
    }

    /// Q-G của review 02 lần 2: số khung đứng yên 3 giây trong khi app cần thu đang phát thì tap đã chết; không ai phát
    /// thì không có khung là bình thường.
    #[test]
    fn frames_that_stop_while_an_app_plays_mean_a_dead_tap() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let mut w = StallWatch::new(at(0));
        assert!(!w.stalled(10, at(500), || panic!("đang có khung thì không hỏi")));
        assert!(!w.stalled(10, at(3_000), || panic!("chưa đủ 3 giây")));
        assert!(!w.stalled(10, at(3_600), || false), "không ai phát");
        assert!(!w.stalled(10, at(6_000), || true), "đếm lại từ lúc thấy không ai phát");
        assert!(w.stalled(10, at(6_600), || true));
        assert!(!w.stalled(11, at(7_000), || true), "có khung mới");
    }

    /// Q-G của review 02 lần 2: nguồn một app mở lại khi tập tiến trình đang phát khác tập đã tap; app tạm không phát gì
    /// thì giữ nguyên tap.
    #[test]
    fn a_changed_set_of_playing_processes_reopens_an_app_source() {
        assert!(!pids_changed(&[300, 301], Some(&[300, 301])));
        assert!(pids_changed(&[300, 301], Some(&[300, 302])), "helper mới");
        assert!(pids_changed(&[300], Some(&[300, 301])));
        assert!(!pids_changed(&[300], None), "app đang im lặng");
        assert!(
            !pids_changed(&[300, 301], Some(&[300])),
            "một helper ngừng phát: tap cũ vẫn đúng"
        );
    }

    /// Nhỏ-5 của review 02 lần 3: mở lại 3 lần liên tiếp mà vẫn không có khung thì giãn thời gian chờ gấp đôi, tối đa 30
    /// giây; có khung thì đếm lại từ đầu.
    #[test]
    fn repeated_stall_reopens_back_off_up_to_30_seconds() {
        let mut b = StallBackoff::default();
        let mut seen = Vec::new();
        let mut warned = Vec::new();
        for _ in 0..7 {
            seen.push(b.threshold().as_secs());
            warned.push(b.on_stall_reopen());
        }
        assert_eq!(seen, [3, 3, 3, 6, 12, 24, 30]);
        assert_eq!(
            warned,
            [false, false, true, false, false, false, false],
            "cảnh báo một lần"
        );
        assert_eq!(b.threshold(), STALL_MAX);
        b.on_frames();
        assert_eq!(b.threshold(), STALL_FOR);
    }

    /// Nhỏ-1, Nhỏ-2 của review 02 lần 4: phần kiểm qua nhiều lần mở. Tap chết 3 lần liên tiếp thì lần mở sau chờ 6 giây
    /// (chưa coi là chết ở giây 3); có khung trở lại thì ngay trong lần mở đó bậc chờ về 3 giây. Thiết bị đổi thì mở lại
    /// ngay, không chờ.
    #[test]
    fn the_watch_backs_off_across_reopens_and_resets_on_frames() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let none = Observed::default();
        let mut w = Watch::new(t0);
        // Lần mở đầu có nhiều khung rồi tap chết: lần mở sau đếm khung lại từ 0 (W1 của review 02 lần 5).
        w.opened(at(0));
        assert_eq!(w.tick(at(100), 1_000, true, || true, none), Tick::Continue);
        assert_eq!(w.tick(at(3_000), 1_000, true, || true, none), Tick::Continue);
        assert_eq!(
            w.tick(at(3_100), 1_000, true, || true, none),
            Tick::Reopen(Reopen::Stalled)
        );
        let mut clock = 3_500;
        for _ in 0..2 {
            w.opened(at(clock));
            assert_eq!(w.threshold(), STALL_FOR);
            assert_eq!(w.tick(at(clock + 2_900), 0, true, || true, none), Tick::Continue);
            assert_eq!(
                w.tick(at(clock + 3_000), 0, true, || true, none),
                Tick::Reopen(Reopen::Stalled)
            );
            clock += 3_500;
        }
        w.opened(at(clock));
        assert_eq!(w.threshold(), Duration::from_secs(6));
        assert_eq!(
            w.tick(at(clock + 3_000), 0, true, || true, none),
            Tick::Continue,
            "đang chờ lâu hơn"
        );
        // Có khung trở lại trong cùng lần mở: bậc chờ về đầu, đếm lại từ lúc có khung.
        assert_eq!(w.tick(at(clock + 3_500), 10, true, || true, none), Tick::Continue);
        assert_eq!(w.threshold(), STALL_FOR);
        assert_eq!(w.tick(at(clock + 6_400), 10, true, || true, none), Tick::Continue);
        assert_eq!(
            w.tick(at(clock + 6_500), 10, true, || true, none),
            Tick::Reopen(Reopen::Stalled)
        );
        // Không xét tap chết (Windows) thì không bao giờ mở lại vì số khung đứng yên.
        w.opened(at(20_000));
        assert_eq!(
            w.tick(at(60_000), 0, false, || panic!("không hỏi"), none),
            Tick::Continue
        );
        let device = Observed {
            device_changed: true,
            ..none
        };
        assert_eq!(
            w.tick(at(60_100), 0, true, || true, device),
            Tick::Reopen(Reopen::Device)
        );
    }

    /// Nhỏ-3 của review 02 lần 3: quyết định của một lần kiểm và việc báo sau một lần mở thất bại.
    #[test]
    fn the_watch_decisions() {
        let none = Observed::default();
        assert_eq!(on_tick(none), Tick::Continue);
        let device = Observed {
            device_changed: true,
            stalled: true,
            ..none
        };
        assert_eq!(on_tick(device), Tick::Reopen(Reopen::Device));
        let failed = Observed {
            source_failed: true,
            ..none
        };
        assert_eq!(on_tick(failed), Tick::Reopen(Reopen::Device));
        let stalled = Observed {
            stalled: true,
            new_process: true,
            ..none
        };
        assert_eq!(on_tick(stalled), Tick::Reopen(Reopen::Stalled));
        let new_process = Observed {
            new_process: true,
            ..none
        };
        assert_eq!(on_tick(new_process), Tick::Reopen(Reopen::NewProcess));
        assert_eq!(
            failure_event(OnFailure::Wait, errors::APP_NOT_PLAYING, "x".into()),
            Some(CaptureEvent::WaitingForApp(true))
        );
        assert_eq!(
            failure_event(OnFailure::Report, errors::CAPTURE_FAILED, "x".into()),
            Some(CaptureEvent::Failed {
                code: errors::CAPTURE_FAILED,
                message: "x".into()
            })
        );
        assert_eq!(
            failure_event(OnFailure::Retry, errors::CAPTURE_FAILED, "x".into()),
            None
        );
    }

    /// Q4 của review 02c: mẫu toàn 0 tuyệt đối 3 giây trong khi có app phát tiếng thì nghi thiếu quyền.
    #[test]
    fn three_seconds_of_exact_zeros_while_an_app_plays_suggest_a_missing_permission() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let zeros = [0.0f32; 320];
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&zeros, at(0), || true), None);
        assert_eq!(w.push(&[], at(5_000), || panic!("không mẫu nào thì không hỏi")), None);
        assert_eq!(w.push(&zeros, at(2_999), || true), None);
        assert_eq!(w.push(&zeros, at(3_000), || true), Some(true));
        assert_eq!(w.push(&zeros, at(4_000), || true), None, "chỉ báo một lần");
        assert_eq!(
            w.push(&[0.0, 0.01], at(4_100), || true),
            Some(false),
            "có âm thanh thật"
        );
        // Không app nào phát: số 0 là im lặng thật, không báo.
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&zeros, at(0), || false), None);
        assert_eq!(w.push(&zeros, at(3_500), || false), None);
        assert_eq!(w.push(&zeros, at(6_000), || false), None);
        // Tiếng rất nhỏ nhưng khác 0 thì không phải dấu hiệu.
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&[1e-7; 320], at(0), || true), None);
        assert_eq!(w.push(&[1e-7; 320], at(5_000), || true), None);
    }

    /// Q-B của review 02 lần 2: đã có âm thanh thật trong phiên thì quyền đã có; cuộc họp im lặng lâu sau đó (số 0 tuyệt
    /// đối) không bị báo nhầm, kể cả khi app vẫn được tính là đang phát.
    #[test]
    fn silence_after_real_audio_is_not_a_missing_permission() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let zeros = [0.0f32; 320];
        let mut w = ZeroWatch::default();
        assert_eq!(w.push(&[0.02; 320], at(0), || true), None);
        for ms in [100, 3_100, 10_000, 600_000] {
            assert_eq!(w.push(&zeros, at(ms), || panic!("không còn hỏi")), None, "{ms} ms");
        }
    }
}
