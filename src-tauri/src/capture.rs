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
//!   [`CaptureEvent::WaitingForApp`] để màn hình chính hiện chỉ báo. Thiết bị phát biến mất sau khi đã thu được (Windows
//!   reset âm thanh, rút tai nghe, rút micro ở chế độ chỉ micro: [`source_lost`]) cũng không dừng phiên: thử lại mỗi 2 giây, báo
//!   [`CaptureEvent::WaitingForDevice`], thu lại được thì tắt chỉ báo (báo cáo thật `R-MTMA-4XCS`, 2026-10-30).
//! - macOS: nguồn trả mẫu toàn số 0 tuyệt đối suốt 3 giây trong khi app cần thu đang phát tiếng, và từ đầu phiên chưa có
//!   mẫu nào khác 0, thì nhiều khả năng app chưa được cấp quyền "Ghi âm thanh hệ thống" (§9): báo
//!   [`CaptureEvent::PermissionSuspected`], không dừng phiên. Đã có âm thanh thật một lần thì quyền đã có: cuộc họp im
//!   lặng sau đó không bị báo nhầm (Q-B của review 02 lần 2).
//! - Trong lúc nguồn chưa chạy hay đang mở lại, `ClockFiller` chèn im lặng theo đồng hồ thật, để thời gian phụ đề không
//!   lệch.
//! - Chế độ micro (spec 2026-10-24-nguon-micro §5.6): xin quyền micro trước khi mở (Core Audio tự hỏi thì `start` bị chặn
//!   suốt lúc hộp thoại mở), mở lại khi micro mặc định đổi, không kiểm tap chết (micro luôn có khung), `ZeroWatch` báo
//!   [`CaptureEvent::MicSilent`] mà không hỏi có app đang phát. Nguồn micro cho hai bản: bản cho whisper và bản đã lọc ồn
//!   cho VAD ([`FrameSource::read_with_vad`]).
//! - Chế độ âm thanh máy + micro (spec §5.3–5.6, kế hoạch 03): âm thanh máy theo các luật trên; micro do [`MicSide`] quản
//!   lý, lỗi không dừng phiên mà báo [`CaptureEvent::MicIssue`] và thử lại mỗi 2 giây; trộn bằng `DuckingMixer` (nhường lời
//!   −55 dBFS / −30 dB / giữ 300 ms). Mỗi loại nguồn có một `ZeroWatch` riêng, trên mẫu chưa trộn.
//! - Âm thanh chỉ nằm trong RAM (§10.1): không ghi xuống đĩa, không gửi đi đâu.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use audio_capture::duck::{DuckingMixer, GateParams, SpeechDetector};
use audio_capture::mic_chain::MicPreprocessor;
use audio_capture::preprocess::{ClockFiller, MAX_SKEW_SAMPLES, Preprocessor, RING_SAMPLES, drain_when_ready};
use audio_capture::{AudioSource as Source, CaptureStats, MicPermission};
use pipeline::engine::FrameSource;
// `Source` đã là tên của `audio_capture::AudioSource` trong file này: cờ nguồn của giao thức nhận giọng đặt tên khác.
use speaker_protocol::Source as SourceTag;

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
/// Bước chờ giữa hai lần xem luồng thu đã có mẫu chưa (spec 2026-10-10 §8, A3). Thiết bị thường trả mẫu mỗi 10 ms: chờ
/// 5 ms mỗi bước thì mẫu được đọc trễ trung bình khoảng 2,5 ms (trước là ngủ cố định 20 ms trước mỗi lần đọc, trễ trung
/// bình khoảng 10 ms), và lúc không có mẫu nào thì chỉ thức dậy 200 lần mỗi giây.
const POLL_STEP: Duration = Duration::from_millis(5);

/// Việc nguồn âm thanh báo cho phiên.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CaptureEvent {
    /// Không thu được âm thanh: phiên dừng với mã lỗi này (`errors`).
    Failed { code: &'static str, message: String },
    /// macOS: nghi chưa được cấp quyền ghi âm thanh hệ thống (`true`), hoặc đã có âm thanh thật trở lại (`false`).
    PermissionSuspected(bool),
    /// Nguồn một app: app đã chọn không phát tiếng nữa, đang chờ nó phát lại (`true`), hoặc đã thu lại được (`false`).
    WaitingForApp(bool),
    /// Thiết bị phát hay micro (chế độ chỉ micro) biến mất sau khi đã thu được (thiết bị bị rút, vô hiệu hóa, hay hệ thống âm
    /// thanh reset): đang chờ thiết bị trở lại (`true`), hoặc đã thu lại được (`false`). Phiên không dừng.
    WaitingForDevice(bool),
    /// Micro trả toàn số 0 tuyệt đối 3 giây từ đầu phiên (`true`), hoặc đã có tín hiệu (`false`): thiếu quyền micro hay
    /// micro đang tắt tiếng bằng phím cứng (spec 2026-10-24-nguon-micro §5.6, §7).
    MicSilent(bool),
    /// Chế độ âm thanh máy + micro: micro không mở được, kèm mã (`micPermission`, `micUnavailable`); `None` khi đã mở lại
    /// được. Phiên không dừng (spec §7).
    MicIssue(Option<&'static str>),
}

pub type OnEvent = Box<dyn Fn(CaptureEvent) + Send + Sync>;

/// Thu gì trong một phiên (spec 2026-10-24-nguon-micro §5.6): âm thanh máy theo `audioSource`, micro, hay cả hai.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CapturePlan {
    /// `include_self`: macOS, tap toàn hệ thống thu cả âm thanh của chính app (bước "Nghe thử").
    Playback { source: AudioSource, include_self: bool },
    /// `device`: `None` là micro mặc định. `noise_filter`: RNNoise cho bản VAD.
    Mic { device: Option<String>, noise_filter: bool },
    /// Âm thanh máy và micro, trộn có nhường lời (spec §5.3, §5.4).
    Both {
        source: AudioSource,
        device: Option<String>,
        noise_filter: bool,
    },
}

impl CapturePlan {
    pub fn has_mic(&self) -> bool {
        matches!(self, CapturePlan::Mic { .. } | CapturePlan::Both { .. })
    }
}

/// Nguồn âm thanh máy của plan, nếu có.
fn playback_source(plan: &CapturePlan) -> Option<&AudioSource> {
    match plan {
        CapturePlan::Playback { source, .. } | CapturePlan::Both { source, .. } => Some(source),
        CapturePlan::Mic { .. } => None,
    }
}

/// Lỗi khi quyền micro bị từ chối (ánh xạ ra `micPermission`).
const MIC_DENIED: &str = "chưa được phép dùng micro";
/// Lỗi WASAPI khi Windows tắt quyền micro cho app desktop.
const E_ACCESSDENIED: &str = "0x80070005";
/// Chờ người dùng trả lời hộp thoại quyền micro tối đa chừng này.
const MIC_PROMPT_WAIT: Duration = Duration::from_secs(120);
/// Nhường lời (spec mục 17): micro tắt hẳn khi khung âm thanh máy từ −55 dBFS, hoặc khi Silero trên âm thanh máy cho xác suất
/// có tiếng nói từ 0,5 (người online nói nhỏ); giữ thêm 300 ms. Khung dưới −80 dBFS (im lặng số) khỏi hỏi Silero.
const GATE: GateParams = GateParams {
    threshold_dbfs: -55.0,
    duck_db: f32::NEG_INFINITY,
    hold_ms: 300,
    speech_prob: 0.5,
    speech_floor_dbfs: -80.0,
};

/// Âm thanh máy không trả mẫu nào chừng này thì coi là im (tap macOS tự dừng khi không app nào phát): micro được xả ngay thay
/// vì chờ ghép cặp, nếu không giọng trong phòng trễ thêm 100 ms đúng lúc phía online chưa nói (spec mục 17: không thêm trễ).
const PLAYBACK_IDLE: Duration = Duration::from_millis(150);

/// Chu kỳ ghi log thời gian Silero của bộ nhường lời.
const SPEECH_LOG_EVERY: Duration = Duration::from_secs(60);

/// Đo thời gian mỗi lần Silero của bộ nhường lời chạy (chi phí trên luồng VAD, ngân sách ở spec mục 17), để ghi log mỗi phút
/// có lần chạy: người dùng và người kiểm đọc được số thật trên máy của mình, kể cả máy Windows yếu. Silero chỉ chạy ở khung
/// có thể là giọng nhỏ (`duck.rs`), nên số lần có thể ít hơn nhiều so với số khung.
#[derive(Default)]
struct SpeechTimer {
    since: Option<Instant>,
    calls: u32,
    total: Duration,
    max: Duration,
}

impl SpeechTimer {
    /// Ghi một lần chạy xong lúc `now`; qua `SPEECH_LOG_EVERY` từ lần đầu của cửa sổ thì trả dòng log và đếm lại.
    fn record(&mut self, took: Duration, now: Instant) -> Option<String> {
        let since = *self.since.get_or_insert(now);
        self.calls += 1;
        self.total += took;
        self.max = self.max.max(took);
        if now.duration_since(since) < SPEECH_LOG_EVERY {
            return None;
        }
        let line = format!(
            "nhường lời: Silero {} lần trong {} giây, trung bình {} µs, lớn nhất {} µs",
            self.calls,
            now.duration_since(since).as_secs(),
            (self.total / self.calls).as_micros(),
            self.max.as_micros()
        );
        *self = Self::default();
        Some(line)
    }
}

/// Silero VAD làm bộ phát hiện tiếng nói của bộ nhường lời (spec mục 17).
struct SileroSpeech {
    vad: pipeline::vad::SileroVad,
    timer: SpeechTimer,
}

impl SileroSpeech {
    fn new(vad: pipeline::vad::SileroVad) -> Self {
        Self {
            vad,
            timer: SpeechTimer::default(),
        }
    }
}

impl SpeechDetector for SileroSpeech {
    fn prob(&mut self, frame: &[f32]) -> anyhow::Result<f32> {
        let started = Instant::now();
        let prob = self.vad.prob(frame);
        if let Some(line) = self.timer.record(started.elapsed(), Instant::now()) {
            log::info!("{line}");
        }
        prob
    }

    fn reset(&mut self) -> anyhow::Result<()> {
        self.vad.reset()
    }
}

/// Silero riêng của bộ nhường lời, chỉ ở chế độ trộn. `LiveCapture` giữ nó qua các lần mở lại nguồn (mỗi bộ trộn mới tự
/// reset nó). Nạp lười trên luồng gọi `read_with_vad`, tức luồng VAD của engine (stack 8 MiB, đủ cho candle).
enum SpeechSlot {
    Off,
    Pending(PathBuf),
    Ready(Box<SileroSpeech>),
    Failed,
}

impl SpeechSlot {
    fn new(plan: &CapturePlan, model: Option<PathBuf>) -> Self {
        match (plan, model) {
            (CapturePlan::Both { .. }, Some(path)) => SpeechSlot::Pending(path),
            _ => SpeechSlot::Off,
        }
    }

    /// Bộ phát hiện, nạp ở lần gọi đầu. Nạp lỗi thì ghi cảnh báo một lần; từ đó không có bộ phát hiện (cổng theo năng lượng).
    fn get(&mut self) -> Option<&mut dyn SpeechDetector> {
        if let SpeechSlot::Pending(path) = self {
            let path = path.clone();
            *self = match pipeline::vad::SileroVad::load(&path) {
                Ok(vad) => SpeechSlot::Ready(Box::new(SileroSpeech::new(vad))),
                Err(e) => {
                    log::warn!("nhường lời: không nạp được VAD, chỉ hạ micro theo mức âm thanh máy: {e:#}");
                    SpeechSlot::Failed
                }
            };
        }
        match self {
            SpeechSlot::Ready(s) => Some(s.as_mut()),
            _ => None,
        }
    }
}

/// Việc phải làm sau một lần mở nguồn thất bại.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OnFailure {
    /// Thử lại sau, không báo gì.
    Retry,
    /// Báo lỗi: phiên dừng.
    Report,
    /// Nguồn một app: app không phát tiếng nữa; báo chỉ báo "đang chờ app", không dừng phiên, thử lại sau.
    Wait,
    /// Thiết bị phát biến mất sau khi đã thu được: báo chỉ báo "đang chờ thiết bị", không dừng phiên, thử lại sau.
    WaitDevice,
}

/// Khi nào một lần mở nguồn thất bại phải báo cho phiên (Q2 của review 02c, Q-C của review 02 lần 2).
#[derive(Debug, Default)]
pub struct FailurePolicy {
    ever_ok: bool,
    failing_since: Option<Instant>,
    reported: bool,
    waiting: bool,
    waiting_device: bool,
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

    /// Một lần mở thất bại lúc `now` vì thiết bị phát không còn ([`device_lost`]). Lần mở đầu tiên thì báo lỗi như mọi lỗi;
    /// đã thu được rồi thì không bao giờ dừng phiên: báo chỉ báo một lần, thử lại mãi.
    pub fn on_device_lost(&mut self, now: Instant) -> OnFailure {
        if !self.ever_ok {
            return self.on_failure(now, false);
        }
        self.failing_since = None;
        if std::mem::replace(&mut self.waiting_device, true) {
            OnFailure::Retry
        } else {
            OnFailure::WaitDevice
        }
    }

    /// Nguồn vừa chạy được. Trả `true` nếu trước đó đang chờ thiết bị trở lại (để tắt chỉ báo).
    pub fn take_device_wait(&mut self) -> bool {
        std::mem::take(&mut self.waiting_device)
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
        OnFailure::WaitDevice => Some(CaptureEvent::WaitingForDevice(true)),
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

/// Mẫu của một lần đọc: bản cho whisper, bản cho VAD (cùng độ dài), và mẫu chưa trộn của từng loại nguồn cho các bộ canh
/// "toàn số 0" (QĐ4 của kế hoạch 03).
#[derive(Default)]
struct Frames {
    asr: Vec<f32>,
    vad: Vec<f32>,
    playback: Vec<f32>,
    mic: Vec<f32>,
    /// Cờ nguồn của từng mẫu của `asr` (spec 2026-10-26-phan-biet-nguoi-noi §5.5).
    tags: Vec<SourceTag>,
}

impl Frames {
    fn clear(&mut self) {
        self.asr.clear();
        self.vad.clear();
        self.playback.clear();
        self.mic.clear();
        self.tags.clear();
    }
}

/// Bộ tiền xử lý của nguồn đang mở.
enum Pre {
    Playback(Preprocessor),
    /// Đóng hộp: chuỗi micro có bộ đệm khung của RNNoise, lớn hơn hẳn `Preprocessor`.
    Mic(Box<MicPreprocessor>),
    Both(Box<BothPre>),
}

impl Pre {
    /// `speech`: bộ phát hiện tiếng nói của bộ nhường lời; chỉ chế độ trộn dùng.
    fn drain(&mut self, f: &mut Frames, speech: Option<&mut dyn SpeechDetector>) -> anyhow::Result<()> {
        match self {
            Pre::Playback(p) => {
                let from = f.asr.len();
                p.drain(&mut f.asr)?;
                f.vad.extend_from_slice(&f.asr[from..]);
                f.playback.extend_from_slice(&f.asr[from..]);
                f.tags.resize(f.tags.len() + (f.asr.len() - from), SourceTag::System);
                Ok(())
            }
            Pre::Mic(m) => {
                let from = f.asr.len();
                m.drain(&mut f.asr, &mut f.vad)?;
                f.mic.extend_from_slice(&f.asr[from..]);
                f.tags.resize(f.tags.len() + (f.asr.len() - from), SourceTag::Mic);
                Ok(())
            }
            Pre::Both(b) => b.drain(f, speech),
        }
    }
}

/// Chế độ âm thanh máy + micro (QĐ3 của kế hoạch 03): âm thanh máy, micro nếu đang mở, và bộ trộn có nhường lời.
struct BothPre {
    playback: Preprocessor,
    mic: Option<MicPreprocessor>,
    mixer: DuckingMixer,
    pb: Vec<f32>,
    mic_asr: Vec<f32>,
    mic_vad: Vec<f32>,
    /// Lần cuối âm thanh máy trả mẫu; quá `idle_after` thì micro được xả ngay (tap macOS không trả khung khi không app nào phát).
    last_pb: Instant,
    idle_after: Duration,
    /// Phần bộ trộn xả khi gỡ micro, chờ lần `drain` kế tiếp để không mất.
    pending_asr: Vec<f32>,
    pending_vad: Vec<f32>,
    /// Cờ nguồn của phần xả chờ `pending_asr`.
    pending_tags: Vec<SourceTag>,
}

/// Bộ trộn của chế độ âm thanh máy + micro, có cờ nguồn (spec 2026-10-26-phan-biet-nguoi-noi §5.5).
fn tagging_mixer() -> DuckingMixer {
    let mut mixer = DuckingMixer::new(GATE, MAX_SKEW_SAMPLES);
    mixer.set_tagging(true);
    mixer
}

impl BothPre {
    fn new(playback: Preprocessor) -> Self {
        Self {
            playback,
            mic: None,
            mixer: tagging_mixer(),
            pb: Vec::new(),
            mic_asr: Vec::new(),
            mic_vad: Vec::new(),
            last_pb: Instant::now(),
            idle_after: PLAYBACK_IDLE,
            pending_asr: Vec::new(),
            pending_vad: Vec::new(),
            pending_tags: Vec::new(),
        }
    }

    fn attach_mic(&mut self, mic: MicPreprocessor) {
        self.mixer = tagging_mixer();
        self.mic = Some(mic);
    }

    /// Gỡ micro: xả phần còn trong bộ trộn (giữ cho lần `drain` kế tiếp), rồi âm thanh máy đi thẳng.
    fn detach_mic(&mut self) {
        self.mic = None;
        self.mixer.flush_into(&mut self.pending_asr, &mut self.pending_vad);
        self.mixer.take_tags(&mut self.pending_tags);
    }

    /// Tỉ lệ thời gian micro bị hạ, để ghi log (spec §5.6).
    fn ducked_ratio(&self) -> f32 {
        self.mixer.ducked_ratio()
    }

    fn drain(&mut self, f: &mut Frames, speech: Option<&mut dyn SpeechDetector>) -> anyhow::Result<()> {
        f.asr.append(&mut self.pending_asr);
        f.vad.append(&mut self.pending_vad);
        f.tags.append(&mut self.pending_tags);
        self.pb.clear();
        self.playback.drain(&mut self.pb)?;
        if !self.pb.is_empty() {
            self.last_pb = Instant::now();
        }
        f.playback.extend_from_slice(&self.pb);
        let Some(mic) = self.mic.as_mut() else {
            f.asr.extend_from_slice(&self.pb);
            f.vad.extend_from_slice(&self.pb);
            f.tags.resize(f.tags.len() + self.pb.len(), SourceTag::System);
            return Ok(());
        };
        self.mic_asr.clear();
        self.mic_vad.clear();
        mic.drain(&mut self.mic_asr, &mut self.mic_vad)?;
        f.mic.extend_from_slice(&self.mic_asr);
        self.mixer.push_playback(&self.pb);
        self.mixer.push_mic(&self.mic_asr, &self.mic_vad);
        self.mixer.drain_into_with(&mut f.asr, &mut f.vad, speech);
        if self.last_pb.elapsed() >= self.idle_after {
            self.mixer.release_mic(&mut f.asr, &mut f.vad);
        }
        self.mixer.take_tags(&mut f.tags);
        if let Some(e) = self.mixer.take_speech_error() {
            log::warn!("nhường lời: VAD lỗi, chỉ hạ micro theo mức âm thanh máy tới lần mở nguồn sau: {e}");
        }
        Ok(())
    }
}

/// Khi nào báo vấn đề của micro ở chế độ trộn: mỗi lần mã lỗi đổi, và một lần khi mở lại được.
#[derive(Debug, Default)]
struct MicReport {
    current: Option<&'static str>,
}

impl MicReport {
    /// Mở micro lỗi với `code`: trả sự kiện cần báo, nếu có.
    fn failed(&mut self, code: &'static str) -> Option<Option<&'static str>> {
        (self.current.replace(code) != Some(code)).then_some(Some(code))
    }

    /// Micro mở được: trả sự kiện xóa nếu trước đó đang báo lỗi.
    fn ok(&mut self) -> Option<Option<&'static str>> {
        self.current.take().map(|_| None)
    }
}

/// Đã có quyền micro chưa. `ask`: chưa hỏi thì hỏi (hộp thoại macOS; chỉ chế độ micro, vì ở chế độ trộn luồng thu còn phải
/// đọc âm thanh máy, và `start_with` đã hỏi trước). Không hỏi thì quyền chưa hỏi coi như chưa có.
fn ensure_mic_permission(ask: bool) -> anyhow::Result<()> {
    let permission = match audio_capture::mic_permission() {
        MicPermission::Undetermined if ask => audio_capture::request_mic_permission(MIC_PROMPT_WAIT)?,
        other => other,
    };
    if permission == MicPermission::Granted {
        Ok(())
    } else {
        anyhow::bail!("{MIC_DENIED}")
    }
}

/// Loại kết nối của micro sẽ mở, để ghi log (không ghi tên: tên có thể chứa tên người, spec §4).
fn mic_transport(device: Option<&str>) -> &'static str {
    audio_capture::list_input_devices()
        .ok()
        .and_then(|list| list.into_iter().find(|d| device.map_or(d.is_default, |id| d.id == id)))
        .map_or("unknown", |d| d.transport.as_str())
}

/// Micro đang chạy: nguồn, số liệu, và bộ tiền xử lý của nó.
struct OpenMic {
    source: Box<dyn Source>,
    stats: Arc<CaptureStats>,
    pre: MicPreprocessor,
}

/// Mở micro và chạy nó; lỗi thì dừng nguồn. `ask`: xem [`ensure_mic_permission`].
fn open_mic(device: Option<&str>, noise_filter: bool, ask: bool) -> anyhow::Result<OpenMic> {
    ensure_mic_permission(ask)?;
    let stats = Arc::new(CaptureStats::default());
    let mut source = audio_capture::mic_source(device.map(str::to_string), stats.clone())?;
    let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
    source.start(producer)?;
    let format = source.format();
    match MicPreprocessor::new(consumer, format, noise_filter) {
        Ok(pre) => {
            log::info!(
                "đang thu micro: {} Hz, {} kênh, kết nối {}, lọc ồn {noise_filter}",
                format.sample_rate,
                format.channels,
                mic_transport(device)
            );
            Ok(OpenMic { source, stats, pre })
        }
        Err(e) => {
            source.stop();
            Err(e)
        }
    }
}

fn start_mic(device: Option<&str>, noise_filter: bool) -> anyhow::Result<(Opened, Pre)> {
    let mic = open_mic(device, noise_filter, true)?;
    Ok((
        Opened {
            sources: vec![mic.source],
            stats: vec![mic.stats],
            tapped: None,
        },
        Pre::Mic(Box::new(mic.pre)),
    ))
}

/// Micro của chế độ trộn (QĐ5 của kế hoạch 03): mở, mở lại khi micro mặc định đổi hay luồng thu chết, thử lại mỗi 2 giây khi
/// lỗi; lỗi không dừng phiên mà báo [`CaptureEvent::MicIssue`].
struct MicSide {
    device: Option<String>,
    noise_filter: bool,
    source: Option<(Box<dyn Source>, Arc<CaptureStats>)>,
    signature: Option<String>,
    retry_at: Instant,
    report: MicReport,
}

impl MicSide {
    fn new(device: Option<String>, noise_filter: bool) -> Self {
        Self {
            device,
            noise_filter,
            source: None,
            signature: None,
            retry_at: Instant::now(),
            report: MicReport::default(),
        }
    }

    /// Một lần canh: gỡ micro khi nó chết hay micro mặc định đổi; mở micro khi tới giờ thử.
    fn tick(&mut self, now: Instant, shared: &Mutex<Option<Pre>>, on_event: &OnEvent) {
        let follows_default = self.device.is_none();
        let dead = self.source.as_ref().is_some_and(|(s, _)| s.failed())
            || (self.source.is_some() && follows_default && audio_capture::default_input_signature() != self.signature);
        if dead {
            log::info!("mở lại micro");
            self.close(shared);
            self.retry_at = now;
        }
        if self.source.is_some() || now < self.retry_at {
            return;
        }
        self.signature = audio_capture::default_input_signature();
        match open_mic(self.device.as_deref(), self.noise_filter, false) {
            Ok(mic) => {
                if let Some(Pre::Both(b)) = shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                    b.attach_mic(mic.pre);
                }
                self.source = Some((mic.source, mic.stats));
                if let Some(event) = self.report.ok() {
                    on_event(CaptureEvent::MicIssue(event));
                }
            }
            Err(e) => {
                self.retry_at = now + RETRY_AFTER;
                // Lỗi của micro: dùng luật mã lỗi của chế độ micro (`micPermission` hay `micUnavailable`).
                let as_mic = CapturePlan::Mic {
                    device: self.device.clone(),
                    noise_filter: self.noise_filter,
                };
                // Thử lại mỗi 2 giây có thể kéo dài cả phiên (quyền bị từ chối): chỉ ghi cảnh báo khi mã lỗi đổi (thử tay
                // kế hoạch 03: trước đó log có một dòng mỗi 2 giây).
                match self.report.failed(error_code(&as_mic, &e)) {
                    Some(event) => {
                        log::warn!("không mở được micro (chế độ trộn, phiên chạy tiếp với âm thanh máy): {e:#}");
                        on_event(CaptureEvent::MicIssue(event));
                    }
                    None => log::debug!("vẫn chưa mở được micro: {e:#}"),
                }
            }
        }
    }

    /// Số khung micro đã nhận, để ghi log.
    fn frames(&self) -> u64 {
        self.source
            .as_ref()
            .map_or(0, |(_, s)| s.frames.load(Ordering::Relaxed))
    }

    /// Dừng micro và gỡ nó khỏi bộ trộn (phần còn trong bộ trộn đi tiếp ở lần `drain` kế).
    fn close(&mut self, shared: &Mutex<Option<Pre>>) {
        if let Some(Pre::Both(b)) = shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            b.detach_mic();
        }
        if let Some((mut s, _)) = self.source.take() {
            s.stop();
        }
    }
}

fn start_plan(plan: &CapturePlan) -> anyhow::Result<(Opened, Pre)> {
    match plan {
        CapturePlan::Playback { source, include_self } => start_sources(source, *include_self),
        CapturePlan::Mic { device, noise_filter } => start_mic(device.as_deref(), *noise_filter),
        CapturePlan::Both { source, .. } => {
            let (opened, pre) = start_sources(source, false)?;
            let Pre::Playback(playback) = pre else {
                unreachable!("start_sources chỉ dựng Pre::Playback")
            };
            Ok((opened, Pre::Both(Box::new(BothPre::new(playback)))))
        }
    }
}

/// Dấu hiệu của thiết bị mà nguồn theo: micro mặc định, hay thiết bị phát mặc định.
fn device_signature(plan: &CapturePlan) -> Option<String> {
    if matches!(plan, CapturePlan::Mic { .. }) {
        audio_capture::default_input_signature()
    } else {
        audio_capture::default_output_signature()
    }
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

/// Như [`someone_playing`], theo plan. Micro: không dùng (micro không có khái niệm "app đang phát").
fn someone_playing_for(plan: &CapturePlan) -> bool {
    match plan {
        CapturePlan::Playback { source, .. } | CapturePlan::Both { source, .. } => someone_playing(source),
        CapturePlan::Mic { .. } => false,
    }
}

/// Lỗi mở nguồn cho thấy thiết bị âm thanh không còn (bị rút, vô hiệu hóa, hay hệ thống âm thanh đang reset), nên chờ nó
/// trở lại chứ không dừng phiên. Windows: `AUDCLNT_E_DEVICE_INVALIDATED` (0x88890004), `ERROR_NOT_FOUND` (0x80070490,
/// "Element not found": không còn thiết bị mặc định), `AUDCLNT_E_SERVICE_NOT_RUNNING` (0x88890010: dịch vụ Windows Audio
/// đang tắt). macOS: micro đã chọn không còn (`macos_input`).
fn device_lost(text: &str) -> bool {
    const MARKS: [&str; 4] = ["0x88890004", "0x80070490", "0x88890010", "không tìm thấy micro đã chọn"];
    let text = text.to_lowercase();
    MARKS.iter().any(|mark| text.contains(mark))
}

/// Lần mở nguồn thất bại vì thiết bị không còn ([`device_lost`]), cho cả thiết bị phát lẫn micro (chế độ chỉ micro). Từ chối
/// quyền, app không phát tiếng, và các lỗi khác thì không.
fn source_lost(plan: &CapturePlan, err: &anyhow::Error) -> bool {
    let code = error_code(plan, err);
    let device_error = match plan {
        CapturePlan::Mic { .. } => code == errors::MIC_UNAVAILABLE,
        CapturePlan::Playback { .. } | CapturePlan::Both { .. } => code == errors::CAPTURE_FAILED,
    };
    device_error && device_lost(&format!("{err:#}"))
}

/// Mã lỗi cho một lần mở nguồn thất bại.
fn error_code(plan: &CapturePlan, err: &anyhow::Error) -> &'static str {
    let text = format!("{err:#}");
    match plan {
        CapturePlan::Mic { .. } if text.contains(MIC_DENIED) || text.contains(E_ACCESSDENIED) => errors::MIC_PERMISSION,
        CapturePlan::Mic { .. } => errors::MIC_UNAVAILABLE,
        CapturePlan::Playback { source, .. } | CapturePlan::Both { source, .. } => {
            if matches!(source, AudioSource::App { .. }) && text.contains("không phát âm thanh") {
                errors::APP_NOT_PLAYING
            } else if cfg!(target_os = "macos") && text.contains("AudioHardwareCreateProcessTap") {
                // Tạo tap lỗi: thường là chưa cấp quyền "Ghi âm thanh hệ thống" (§9; chờ C1, dòng 2 của S1).
                errors::AUDIO_PERMISSION
            } else {
                errors::CAPTURE_FAILED
            }
        }
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
fn start_sources(source: &AudioSource, include_self: bool) -> anyhow::Result<(Opened, Pre)> {
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
        Ok(p) => Ok((opened, Pre::Playback(p))),
        Err(e) => {
            opened.sources.iter_mut().for_each(|s| s.stop());
            Err(e)
        }
    }
}

/// Chạy nguồn cho tới khi `stop`, mở lại khi thiết bị đổi hay luồng thu chết.
fn capture_loop(plan: CapturePlan, shared: Arc<Mutex<Option<Pre>>>, stop: Arc<AtomicBool>, on_event: Arc<OnEvent>) {
    let mut policy = FailurePolicy::default();
    let mut watch = Watch::new(Instant::now());
    // Thiết bị chọn tay (Windows) hay micro chọn tay không theo thiết bị mặc định.
    let follows_default = match &plan {
        CapturePlan::Playback { source, .. } | CapturePlan::Both { source, .. } => {
            !matches!(source, AudioSource::Device { .. })
        }
        CapturePlan::Mic { device, .. } => device.is_none(),
    };
    let mic_only = matches!(plan, CapturePlan::Mic { .. });
    // Chế độ trộn: micro mở và mở lại riêng, lỗi không dừng phiên (QĐ5 của kế hoạch 03).
    let mut mic_side = match &plan {
        CapturePlan::Both {
            device, noise_filter, ..
        } => Some(MicSide::new(device.clone(), *noise_filter)),
        _ => None,
    };
    while !stop.load(Ordering::SeqCst) {
        let signature = device_signature(&plan);
        let mut opened = match start_plan(&plan) {
            Ok((opened, preprocessor)) => {
                *shared.lock().unwrap_or_else(|e| e.into_inner()) = Some(preprocessor);
                if policy.on_ok() {
                    on_event(CaptureEvent::WaitingForApp(false));
                }
                if policy.take_device_wait() {
                    log::info!("thiết bị âm thanh đã trở lại, thu tiếp");
                    on_event(CaptureEvent::WaitingForDevice(false));
                }
                if let Some(mic) = mic_side.as_mut() {
                    mic.retry_at = Instant::now();
                    mic.tick(Instant::now(), &shared, &on_event);
                }
                opened
            }
            Err(e) => {
                let code = error_code(&plan, &e);
                let lost = source_lost(&plan, &e);
                let verdict = if lost {
                    policy.on_device_lost(Instant::now())
                } else {
                    policy.on_failure(Instant::now(), code == errors::APP_NOT_PLAYING)
                };
                // Chờ thiết bị có thể kéo dài hàng giờ: chỉ lần đầu vào log mức cảnh báo, không ghi mỗi 2 giây.
                if lost && verdict == OnFailure::Retry {
                    log::debug!("không mở được nguồn âm thanh (chờ thiết bị): {e:#}");
                } else {
                    log::warn!("không mở được nguồn âm thanh: {e:#}");
                }
                if let Some(event) = failure_event(verdict, code, format!("{e:#}")) {
                    on_event(event);
                }
                wait_or_stop(&stop, RETRY_AFTER);
                continue;
            }
        };
        if !mic_only {
            log::info!("đang thu âm thanh ({} nguồn)", opened.sources.len());
        }
        let frames = |o: &Opened| o.stats.iter().map(|s| s.frames.load(Ordering::Relaxed)).sum::<u64>();
        watch.opened(Instant::now());
        #[cfg(target_os = "macos")]
        let mut pids_at = Instant::now();
        let mut stats_at = Instant::now();
        while !wait_or_stop(&stop, WATCH_EVERY) {
            let now = Instant::now();
            if let Some(mic) = mic_side.as_mut() {
                mic.tick(now, &shared, &on_event);
            }
            #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
            let mut seen = Observed {
                device_changed: follows_default && device_signature(&plan) != signature,
                source_failed: opened.sources.iter().any(|s| s.failed()),
                ..Observed::default()
            };
            #[cfg(target_os = "macos")]
            if let (Some(tapped), Some(AudioSource::App { bundle_id })) = (&opened.tapped, playback_source(&plan))
                && now.duration_since(pids_at) >= PIDS_EVERY
            {
                pids_at = now;
                seen.new_process = pids_changed(tapped, playing_pids(bundle_id).as_deref());
            }
            let threshold = watch.threshold();
            let tick = watch.tick(
                now,
                frames(&opened),
                cfg!(target_os = "macos") && !mic_only,
                || someone_playing_for(&plan),
                seen,
            );
            if let Tick::Reopen(reason) = tick {
                log::info!("mở lại nguồn âm thanh: {reason:?} (chờ tap chết {threshold:?})");
                break;
            }
            if now.duration_since(stats_at) >= STATS_EVERY {
                stats_at = now;
                let all: Vec<[u64; 5]> = opened.stats.iter().map(|s| s.snapshot()).collect();
                let ducked = match shared.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
                    Some(Pre::Both(b)) => Some(b.ducked_ratio()),
                    _ => None,
                };
                log::info!(
                    "số liệu thu (frames, silence_inserted, skipped, dropped, rejected_cycles): {all:?}; khung micro {}; \
                     micro bị hạ {ducked:?}",
                    mic_side.as_ref().map_or(0, MicSide::frames)
                );
            }
        }
        if let Some(mic) = mic_side.as_mut() {
            mic.close(&shared);
        }
        *shared.lock().unwrap_or_else(|e| e.into_inner()) = None;
        opened.sources.iter_mut().for_each(|s| s.stop());
    }
}

/// Nguồn âm thanh thật của một phiên, cho `pipeline::engine`.
pub struct LiveCapture {
    plan: CapturePlan,
    shared: Arc<Mutex<Option<Pre>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    filler: ClockFiller,
    /// "Toàn số 0" trên mẫu chưa trộn của âm thanh máy (macOS: nghi thiếu quyền ghi âm thanh hệ thống) và của micro.
    zeros_playback: ZeroWatch,
    zeros_mic: ZeroWatch,
    on_event: Arc<OnEvent>,
    started: Instant,
    frames: Frames,
    /// Silero của bộ nhường lời (chế độ trộn, spec mục 17).
    speech: SpeechSlot,
    /// Bản VAD bỏ đi khi engine chỉ gọi `read`.
    unused: Vec<f32>,
}

impl LiveCapture {
    /// `speech_model`: đường dẫn Silero VAD cho bộ nhường lời; chỉ dùng ở chế độ trộn.
    pub fn open(plan: CapturePlan, on_event: OnEvent, speech_model: Option<PathBuf>) -> Self {
        let speech = SpeechSlot::new(&plan, speech_model);
        let shared = Arc::new(Mutex::new(None));
        let stop = Arc::new(AtomicBool::new(false));
        let on_event = Arc::new(on_event);
        let thread = {
            let (shared, stop, on_event, plan) = (shared.clone(), stop.clone(), on_event.clone(), plan.clone());
            std::thread::Builder::new()
                .name("capture".into())
                .spawn(move || capture_loop(plan, shared, stop, on_event))
                .ok()
        };
        Self {
            plan,
            shared,
            stop,
            thread,
            filler: ClockFiller::new(200),
            zeros_playback: ZeroWatch::default(),
            zeros_mic: ZeroWatch::default(),
            on_event,
            started: Instant::now(),
            frames: Frames::default(),
            speech,
            unused: Vec::new(),
        }
    }
}

impl LiveCapture {
    /// Thân của `read_with_vad` và `read_tagged`. `tags`: nơi nhận cờ nguồn của từng mẫu mới của `out` (spec
    /// 2026-10-26-phan-biet-nguoi-noi §5.5); `None` thì không ghi cờ nào (tính năng tắt: hành vi thu y hệt trước).
    fn read_into(
        &mut self,
        out: &mut Vec<f32>,
        vad_out: &mut Vec<f32>,
        tags: Option<&mut Vec<SourceTag>>,
        timeout: Duration,
    ) -> anyhow::Result<bool> {
        self.frames.clear();
        // `drain_when_ready` chờ tới khi vector nó giữ có mẫu: cho nó giữ bản cho whisper, và trong mỗi lần đọc thì đổi bản đó
        // vào `frames` để `Pre::drain` ghi đủ bốn phần.
        let (shared, frames, speech) = (&self.shared, &mut self.frames, &mut self.speech);
        let mut asr = std::mem::take(&mut frames.asr);
        drain_when_ready(&mut asr, timeout, POLL_STEP, |buf| {
            std::mem::swap(&mut frames.asr, buf);
            let result = match shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                Some(p) => p.drain(frames, speech.get()),
                None => Ok(()),
            };
            std::mem::swap(&mut frames.asr, buf);
            result
        })?;
        self.frames.asr = asr;
        let now = Instant::now();
        if self.plan.has_mic()
            && let Some(silent) = self.zeros_mic.push(&self.frames.mic, now, || true)
        {
            (self.on_event)(CaptureEvent::MicSilent(silent));
        }
        if cfg!(target_os = "macos")
            && let Some(source) = playback_source(&self.plan)
            && let Some(suspected) = self
                .zeros_playback
                .push(&self.frames.playback, now, || someone_playing(source))
        {
            (self.on_event)(CaptureEvent::PermissionSuspected(suspected));
        }
        let silence = self
            .filler
            .silence_before(self.started.elapsed(), self.frames.asr.len());
        out.extend(std::iter::repeat_n(0.0, silence));
        out.extend_from_slice(&self.frames.asr);
        vad_out.extend(std::iter::repeat_n(0.0, silence));
        vad_out.extend_from_slice(&self.frames.vad);
        if let Some(tags) = tags {
            tags.resize(tags.len() + silence, SourceTag::System);
            tags.extend_from_slice(&self.frames.tags);
        }
        Ok(!self.stop.load(Ordering::SeqCst))
    }
}

impl FrameSource for LiveCapture {
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        let mut unused = std::mem::take(&mut self.unused);
        unused.clear();
        let more = self.read_with_vad(out, &mut unused, timeout);
        self.unused = unused;
        more
    }

    fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        self.read_into(out, vad_out, None, timeout)
    }

    fn read_tagged(
        &mut self,
        out: &mut Vec<f32>,
        vad_out: &mut Vec<f32>,
        tags: &mut Vec<SourceTag>,
        timeout: Duration,
    ) -> anyhow::Result<bool> {
        self.read_into(out, vad_out, Some(tags), timeout)
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
    use audio_capture::AudioFormat;

    fn both() -> CapturePlan {
        CapturePlan::Both {
            source: AudioSource::System,
            device: None,
            noise_filter: true,
        }
    }

    /// Spec 2026-10-24-nguon-micro §5.6: chế độ trộn có micro; lỗi mở âm thanh máy vẫn theo mã của âm thanh máy.
    #[test]
    fn the_both_plan_uses_the_mic_and_playback_error_codes() {
        assert!(both().has_mic());
        let other = anyhow::anyhow!("AudioDeviceStart lỗi OSStatus 1");
        assert_eq!(error_code(&both(), &other), errors::CAPTURE_FAILED);
    }

    /// Chưa có micro: âm thanh máy đi thẳng ra cả hai bản; mẫu chưa trộn của âm thanh máy được giữ cho bộ canh.
    #[test]
    fn without_a_mic_the_both_preprocessor_passes_playback_through() {
        let (mut producer, consumer) = rtrb::RingBuffer::new(16_000);
        let format = AudioFormat {
            sample_rate: 16_000,
            channels: 1,
        };
        let playback = Preprocessor::new(vec![(consumer, format)]).unwrap();
        let mut pre = Pre::Both(Box::new(BothPre::new(playback)));
        for _ in 0..1_600 {
            producer.push(0.25).unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(
            (f.asr.len(), f.vad.len(), f.playback.len(), f.mic.len()),
            (1_600, 1_600, 1_600, 0)
        );
        assert!(f.asr.iter().chain(&f.vad).all(|&v| v == 0.25));
    }

    /// Có micro: tiếng online đang phát thì micro bị tắt (spec mục 17); mẫu chưa trộn của micro vẫn nguyên để canh "toàn số 0".
    #[test]
    fn with_a_mic_the_both_preprocessor_ducks_the_mic_under_playback() {
        let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
        let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let format = AudioFormat {
            sample_rate: 16_000,
            channels: 1,
        };
        let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
        both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
        let mut pre = Pre::Both(Box::new(both));
        // Micro: sin 300 Hz biên độ 0,001 (lọc 80 Hz giữ nguyên; tín hiệu DC sẽ bị lọc mất và test không còn ý nghĩa).
        for i in 0..8_000 {
            pb_in.push(if i % 2 == 0 { 0.1 } else { -0.1 }).unwrap();
            mic_in
                .push(0.001 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
                .unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.asr.len(), f.vad.len());
        assert!(f.asr.len() > 1_600 && !f.mic.is_empty());
        let level = |x: &[f32]| x.iter().map(|v| v.abs()).sum::<f32>() / x.len() as f32;
        // Bỏ 1 600 mẫu đầu (bộ giới hạn và cổng vừa khởi động). Phần còn lại, hiệu giữa bản trộn và âm thanh máy chỉ còn micro
        // đã tắt: gần 0.
        let rest: Vec<f32> = f.asr[1_600..]
            .iter()
            .zip(&f.playback[1_600..])
            .map(|(a, p)| a - p)
            .collect();
        let unducked = level(&f.mic[1_600..]);
        assert!(
            level(&rest) < unducked * 0.05,
            "micro phải bị hạ: {} so với {unducked}",
            level(&rest)
        );
    }

    /// Gỡ micro giữa chừng: phần còn trong bộ trộn được xả, sau đó âm thanh máy lại đi thẳng.
    #[test]
    fn detaching_the_mic_flushes_the_mixer() {
        let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
        let (_mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let format = AudioFormat {
            sample_rate: 16_000,
            channels: 1,
        };
        let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
        both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
        let mut pre = Pre::Both(Box::new(both));
        for _ in 0..800 {
            pb_in.push(0.2).unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert!(f.asr.is_empty(), "chưa có micro để ghép, chưa quá 100 ms");
        let Pre::Both(b) = &mut pre else { unreachable!() };
        b.detach_mic();
        assert!(f.asr.is_empty(), "phần xả được giữ cho lần drain kế, không bị bỏ");
        for _ in 0..160 {
            pb_in.push(0.2).unwrap();
        }
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.asr.len(), 960, "800 mẫu đã xả + 160 mẫu mới, đúng thứ tự thời gian");
        assert_eq!(f.vad.len(), 960);
    }

    /// Âm thanh máy im (tap macOS không trả khung): micro không bị giữ lại chờ ghép cặp, và sau đó không trễ mãi.
    #[test]
    fn an_idle_playback_releases_the_mic_at_once() {
        let format = AudioFormat {
            sample_rate: 16_000,
            channels: 1,
        };
        let run = |idle_after: Duration| {
            let (_pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
            let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
            let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
            both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
            both.idle_after = idle_after;
            for _ in 0..800 {
                mic_in.push(0.05).unwrap();
            }
            let mut f = Frames::default();
            both.drain(&mut f, None).unwrap();
            (f.asr.len(), f.vad.len())
        };
        assert_eq!(
            run(Duration::from_secs(3_600)),
            (0, 0),
            "Playback vừa mới thôi nên chờ ghép cặp như cũ"
        );
        assert_eq!(
            run(Duration::ZERO),
            (800, 800),
            "Playback đã im: micro đi ngay, không chờ đủ 100 ms"
        );
    }

    /// `MicSide` báo mỗi lần mã lỗi đổi, và báo hết lỗi khi mở lại được (QĐ5 của kế hoạch 03).
    #[test]
    fn mic_issues_are_reported_once_per_change() {
        let mut r = MicReport::default();
        assert_eq!(r.failed(errors::MIC_PERMISSION), Some(Some(errors::MIC_PERMISSION)));
        assert_eq!(r.failed(errors::MIC_PERMISSION), None);
        assert_eq!(r.failed(errors::MIC_UNAVAILABLE), Some(Some(errors::MIC_UNAVAILABLE)));
        assert_eq!(r.ok(), Some(None));
        assert_eq!(r.ok(), None);
    }

    fn playback(source: AudioSource) -> CapturePlan {
        CapturePlan::Playback {
            source,
            include_self: false,
        }
    }

    #[test]
    fn capture_errors_map_to_ui_codes() {
        let app = playback(AudioSource::App {
            bundle_id: "us.zoom.xos".into(),
        });
        let not_playing = anyhow::anyhow!("us.zoom.xos không phát âm thanh");
        assert_eq!(error_code(&app, &not_playing), errors::APP_NOT_PLAYING);
        let other = anyhow::anyhow!("AudioDeviceStart lỗi OSStatus 1");
        assert_eq!(
            error_code(&playback(AudioSource::System), &other),
            errors::CAPTURE_FAILED
        );
        #[cfg(target_os = "macos")]
        {
            let tap = anyhow::anyhow!("AudioHardwareCreateProcessTap lỗi OSStatus 560947818");
            assert_eq!(
                error_code(&playback(AudioSource::System), &tap),
                errors::AUDIO_PERMISSION
            );
        }
    }

    /// Spec 2026-10-24-nguon-micro §7, QĐ5, QĐ6 của kế hoạch 02: lỗi mở micro ánh xạ ra hai mã riêng.
    #[test]
    fn mic_errors_map_to_their_own_codes() {
        let mic = CapturePlan::Mic {
            device: None,
            noise_filter: true,
        };
        let denied = anyhow::anyhow!("{MIC_DENIED}");
        assert_eq!(error_code(&mic, &denied), errors::MIC_PERMISSION);
        let wasapi = anyhow::anyhow!("Initialize: Access is denied. (0x80070005)");
        assert_eq!(error_code(&mic, &wasapi), errors::MIC_PERMISSION);
        let gone = anyhow::anyhow!("không tìm thấy micro usb-1");
        assert_eq!(error_code(&mic, &gone), errors::MIC_UNAVAILABLE);
    }

    /// Chế độ chỉ micro: micro mất giữa phiên (rút micro USB, Windows reset âm thanh) cũng chỉ hiện chỉ báo chờ thiết bị,
    /// không dừng phiên. Từ chối quyền thì không phải mất thiết bị: vẫn báo lỗi quyền.
    #[test]
    fn a_microphone_that_disappears_counts_as_a_lost_device_but_a_denied_one_does_not() {
        let mic = CapturePlan::Mic {
            device: None,
            noise_filter: true,
        };
        let gone = anyhow::anyhow!("Element not found. (0x80070490)");
        assert!(source_lost(&mic, &gone));
        let invalidated = anyhow::anyhow!("0x88890004");
        assert!(source_lost(&mic, &invalidated));
        let mac_gone = anyhow::anyhow!("không tìm thấy micro đã chọn");
        assert!(source_lost(&mic, &mac_gone));
        let denied = anyhow::anyhow!("Initialize: Access is denied. (0x80070005)");
        assert!(!source_lost(&mic, &denied));
        let unknown = anyhow::anyhow!("lỗi lạ");
        assert!(!source_lost(&mic, &unknown));
        // Thiết bị phát thì cũng vậy; nguồn một app không phát tiếng không phải mất thiết bị.
        assert!(source_lost(&playback(AudioSource::System), &invalidated));
        let not_playing = anyhow::anyhow!("us.zoom.xos không phát âm thanh");
        let app = playback(AudioSource::App {
            bundle_id: "us.zoom.xos".into(),
        });
        assert!(!source_lost(&app, &not_playing));
    }

    /// Micro: số 0 tuyệt đối 3 giây từ đầu phiên thì báo, không cần hỏi có app đang phát (micro thật luôn có tiếng nền).
    #[test]
    fn three_seconds_of_exact_zeros_from_the_mic_are_reported() {
        let t0 = Instant::now();
        let mut z = ZeroWatch::default();
        assert_eq!(z.push(&[0.0; 160], t0, || true), None);
        assert_eq!(z.push(&[0.0; 160], t0 + Duration::from_secs(3), || true), Some(true));
        assert_eq!(z.push(&[0.001; 160], t0 + Duration::from_secs(4), || true), Some(false));
    }

    #[test]
    fn plans_say_whether_they_use_the_mic() {
        assert!(!playback(AudioSource::System).has_mic());
        let mic = CapturePlan::Mic {
            device: Some("x".into()),
            noise_filter: false,
        };
        assert!(mic.has_mic());
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

    /// Báo cáo thật `R-MTMA-4XCS` (2026-10-30): Windows reset âm thanh giữa phiên (micro `0x80070490`, thiết bị phát
    /// `0x88890004`), app thử 10 giây rồi dừng phiên. Thiết bị mất sau khi đã thu được thì không dừng phiên: báo chỉ báo một
    /// lần, thử lại mãi, thu lại được thì tắt chỉ báo. Lần mở đầu tiên thì vẫn báo lỗi ngay.
    #[test]
    fn a_device_that_disappears_after_the_start_only_shows_an_indicator() {
        let t0 = Instant::now();
        let at = |s: u64| t0 + Duration::from_secs(s);
        let mut p = FailurePolicy::default();
        assert_eq!(p.on_device_lost(at(0)), OnFailure::Report, "chưa từng thu được");
        let mut p = FailurePolicy::default();
        p.on_ok();
        assert_eq!(p.on_device_lost(at(0)), OnFailure::WaitDevice);
        for s in [2, 10, 60, 3_600] {
            assert_eq!(p.on_device_lost(at(s)), OnFailure::Retry, "giây {s}");
        }
        assert!(!p.on_ok(), "chỉ báo của app là việc khác");
        assert!(p.take_device_wait(), "thu lại được: tắt chỉ báo");
        assert!(!p.take_device_wait());
        assert_eq!(
            p.on_device_lost(at(4_000)),
            OnFailure::WaitDevice,
            "lần mất sau lại báo"
        );
    }

    #[test]
    fn only_the_windows_codes_for_a_gone_audio_device_count_as_lost() {
        for text in [
            "0x88890004",
            "Element not found. (0x80070490)",
            "mở thiết bị: The audio endpoint device has been unplugged. (0x88890004)",
            "0x88890010",
        ] {
            assert!(device_lost(text), "{text}");
        }
        for text in [
            "0x80070005",
            "không phát âm thanh",
            "AudioHardwareCreateProcessTap",
            "E_INVALIDARG (0x80070057)",
        ] {
            assert!(!device_lost(text), "{text}");
        }
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
            failure_event(OnFailure::WaitDevice, errors::CAPTURE_FAILED, "x".into()),
            Some(CaptureEvent::WaitingForDevice(true))
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

    /// Âm thanh máy rất nhỏ (−62 dBFS) mà bộ phát hiện báo có tiếng nói: micro bị tắt (spec mục 17). Không có bộ phát hiện
    /// thì micro không bị hạ (dưới ngưỡng năng lượng).
    #[test]
    fn quiet_playback_with_speech_mutes_the_mic() {
        struct Always;
        impl SpeechDetector for Always {
            fn prob(&mut self, _: &[f32]) -> anyhow::Result<f32> {
                Ok(1.0)
            }
            fn reset(&mut self) -> anyhow::Result<()> {
                Ok(())
            }
        }
        fn run(speech: Option<&mut dyn SpeechDetector>) -> (f32, f32) {
            let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
            let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
            let format = AudioFormat {
                sample_rate: 16_000,
                channels: 1,
            };
            let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
            both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
            let mut pre = Pre::Both(Box::new(both));
            for i in 0..8_000 {
                pb_in.push(if i % 2 == 0 { 0.0008 } else { -0.0008 }).unwrap();
                mic_in
                    .push(0.001 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
                    .unwrap();
            }
            let mut f = Frames::default();
            pre.drain(&mut f, speech).unwrap();
            let level = |x: &[f32]| x.iter().map(|v| v.abs()).sum::<f32>() / x.len() as f32;
            let rest: Vec<f32> = f.asr[1_600..]
                .iter()
                .zip(&f.playback[1_600..])
                .map(|(a, p)| a - p)
                .collect();
            (level(&rest), level(&f.mic[1_600..]))
        }
        let (muted, mic) = run(Some(&mut Always as &mut dyn SpeechDetector));
        assert!(muted < mic * 0.01, "micro phải tắt: {muted} so với {mic}");
        let (open, mic) = run(None);
        assert!(
            open > mic * 0.5,
            "không có bộ phát hiện thì micro mở: {open} so với {mic}"
        );
    }

    /// Bộ phát hiện chỉ được chuẩn bị ở chế độ trộn và khi có đường dẫn model; model hỏng thì không có bộ phát hiện, không
    /// panic, và không nạp lại.
    #[test]
    fn the_speech_slot_is_only_armed_in_both_mode_and_survives_a_missing_model() {
        let both = CapturePlan::Both {
            source: AudioSource::System,
            device: None,
            noise_filter: true,
        };
        let playback = CapturePlan::Playback {
            source: AudioSource::System,
            include_self: false,
        };
        assert!(matches!(
            SpeechSlot::new(&playback, Some("x.onnx".into())),
            SpeechSlot::Off
        ));
        assert!(matches!(SpeechSlot::new(&both, None), SpeechSlot::Off));
        let mut slot = SpeechSlot::new(&both, Some(PathBuf::from("/không/có/model.onnx")));
        assert!(slot.get().is_none());
        assert!(matches!(slot, SpeechSlot::Failed));
        assert!(slot.get().is_none());
    }

    /// Bộ đo thời gian Silero của bộ nhường lời: báo một dòng log mỗi `SPEECH_LOG_EVERY` (60 giây) khi có lần chạy, rồi đếm lại.
    #[test]
    fn the_speech_timer_reports_once_per_minute_and_starts_over() {
        let t0 = Instant::now();
        let mut t = SpeechTimer::default();
        assert!(t.record(Duration::from_micros(200), t0).is_none());
        assert!(
            t.record(Duration::from_micros(1_800), t0 + Duration::from_secs(30))
                .is_none()
        );
        let line = t.record(Duration::from_micros(400), t0 + SPEECH_LOG_EVERY).unwrap();
        assert!(line.contains("3 lần"), "{line}");
        assert!(line.contains("trung bình 800 µs"), "{line}");
        assert!(line.contains("lớn nhất 1800 µs"), "{line}");
        // Đếm lại: lần chạy kế tiếp mở cửa sổ mới.
        assert!(
            t.record(
                Duration::from_micros(200),
                t0 + SPEECH_LOG_EVERY + Duration::from_secs(1)
            )
            .is_none()
        );
        assert!(
            t.record(
                Duration::from_micros(200),
                t0 + SPEECH_LOG_EVERY + Duration::from_secs(70)
            )
            .is_some()
        );
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §5.5: mỗi mẫu của bản cho whisper có đúng một cờ nguồn. Âm thanh máy đi thẳng là
    /// `System`; micro là `Mic`; micro bị hạ dưới âm thanh máy to là `System`.
    #[test]
    fn every_drained_sample_has_one_source_tag() {
        let format = AudioFormat {
            sample_rate: 16_000,
            channels: 1,
        };
        let (mut producer, consumer) = rtrb::RingBuffer::new(16_000);
        let mut pre = Pre::Both(Box::new(BothPre::new(
            Preprocessor::new(vec![(consumer, format)]).unwrap(),
        )));
        for _ in 0..1_600 {
            producer.push(0.25).unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.tags.len(), f.asr.len());
        assert!(f.tags.iter().all(|&t| t == SourceTag::System));

        let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let mut pre = Pre::Mic(Box::new(MicPreprocessor::new(mic_out, format, false).unwrap()));
        for i in 0..8_000 {
            mic_in
                .push(0.1 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
                .unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.tags.len(), f.asr.len());
        assert!(f.tags.iter().all(|&t| t == SourceTag::Mic));

        let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
        let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
        both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
        let mut pre = Pre::Both(Box::new(both));
        for i in 0..8_000 {
            pb_in.push(if i % 2 == 0 { 0.1 } else { -0.1 }).unwrap();
            mic_in
                .push(0.1 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
                .unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.tags.len(), f.asr.len());
        assert!(f.tags[1_600..].iter().all(|&t| t == SourceTag::System));
    }
}
