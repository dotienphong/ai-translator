//! Giao thức giữa app và tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.2), cùng kiểu với
//! `asr-protocol`: mỗi khung là độ dài `u32` little-endian rồi nội dung postcard, tối đa [`MAX_FRAME_BYTES`].
//!
//! - postcard mã hóa enum theo chỉ số biến thể: chỉ thêm biến thể ở CUỐI (test `variant_indices_are_pinned`). Thêm hay bỏ
//!   trường cũng đổi định dạng: app và worker luôn build cùng nhau, và [`PROTOCOL_VERSION`] tăng mỗi lần đổi bất kỳ kiểu nào.
//! - Kế hoạch 02: phần nhận giọng (phiên bản 1). Kế hoạch 04: phần tên (`Speech`, `SetNames`, `PauseNames`, `ReaderState`,
//!   trường tên của [`VoiceInfo`], người tham dự; phiên bản 2).
//! - Log không bao giờ chứa âm thanh hay tên người: `Debug` của [`SegmentAudio`] viết tay.
//! - Mô hình đe dọa của kênh: worker đọc khung của app (tiến trình cha); app đọc khung của worker, tiến trình chạy bộ đọc
//!   protobuf và (kế hoạch 04) đọc giao diện app khác, nên app coi khung của worker là dữ liệu chưa tin: giới hạn kích thước
//!   khung, từ chối khung hỏng hay lạ (bỏ worker, chạy lại), giới hạn độ dài danh sách ([`MAX_VOICES_ON_WIRE`]).

#![forbid(unsafe_code)]

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{self, Read, Write};

/// Âm thanh gửi cho worker luôn là 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;
/// Chỉ nhúng tối đa 4 s đầu phần tiếng nói của mỗi đoạn (cách A2, spec §5.2). App gửi tối đa chừng này mẫu; worker từ chối
/// đoạn dài hơn.
pub const MAX_EMBED_SAMPLES: usize = SAMPLE_RATE as usize * 4;
/// Ngắn hơn thì không nhúng (spec §5.2). Nguồn sự thật duy nhất của ngưỡng 0,5 s: `speaker_worker::embed::MIN_SAMPLES` và
/// [`SpeakerConfig::validate`] dùng số này.
pub const MIN_EMBED_MS: u64 = 500;
/// Thời lượng tối đa của một đoạn (`end_ms − start_ms`): `PipelineConfig` cho `segmenter.max_segment_ms` tới 28 s (mặc định 8 s).
pub const MAX_SEGMENT_MS: u64 = 30_000;
/// Một đoạn 4 s dạng `i16` sau postcard khoảng 200 KB; 4 MiB là dư nhiều (spec §4.2).
pub const MAX_FRAME_BYTES: u32 = 4 * 1024 * 1024;
/// Số giọng đang sống tối đa mà [`SpeakerConfig::validate`] nhận.
pub const MAX_VOICES: usize = 32;
/// App coi `Voices` có nhiều giọng hơn chừng này là khung hỏng.
pub const MAX_VOICES_ON_WIRE: usize = 64;
/// Tên người tham dự dài tối đa 40 ký tự (spec §6.3); khung đếm theo byte cho rẻ (40 × 4).
pub const MAX_NAME_BYTES: usize = 160;
/// App coi `Voices` có nhiều người tham dự hơn chừng này là khung hỏng.
pub const MAX_PARTICIPANTS_ON_WIRE: usize = 64;
/// `ReaderState.app_version` dài tối đa chừng này byte.
pub const MAX_APP_VERSION_BYTES: usize = 32;
/// Công thức đọc tối đa 256 KB (spec §7.1).
pub const MAX_RECIPE_BYTES: usize = 256 * 1024;
/// Phiên bản giao thức, trường đầu của `Response::Ready`. App tắt nhận giọng nếu worker báo số khác. Kế hoạch 06: 3
/// (`ReaderState.patterns`).
pub const PROTOCOL_VERSION: u32 = 3;
/// `ReaderState.patterns` có tối đa chừng này mẫu (spec §6.5, §7.2); app coi nhiều hơn là khung hỏng.
pub const MAX_LEARNED_PATTERNS: usize = 4;
/// Đường đi trong ô của một mẫu chỉ báo dài tối đa chừng này chỉ số.
pub const MAX_PATTERN_PATH: usize = 8;
/// Một mẫu chỉ báo có tối đa chừng này trạng thái (thường gặp nhất trước).
pub const MAX_PATTERN_STATES: usize = 3;
/// Một trạng thái có tối đa chừng này lớp.
pub const MAX_PATTERN_CLASSES: usize = 6;
/// Vai trò, vai trò phụ hay một lớp dài tối đa chừng này byte.
pub const MAX_PATTERN_TOKEN_BYTES: usize = 32;

/// Nguồn của âm thanh (spec §5.5): `System` khi micro bị hạ hay im, `Mic` khi âm thanh máy dưới ngưỡng nhường lời và micro có
/// tiếng, `Mixed` khi cả hai có tiếng. Đoạn lấy nguồn chiếm đa số khung.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Source {
    #[default]
    System,
    Mic,
    Mixed,
}

/// Một đoạn VAD gửi cho worker (spec §4.2).
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct SegmentAudio {
    /// Id đoạn của `Segmenter` (chưa cộng `id_base` của phiên).
    pub segment_id: u64,
    /// Ranh giới tiếng nói, tính từ đầu phiên, không gồm đệm. `end_ms − start_ms` là thời lượng thật dùng cho phân cụm.
    pub start_ms: u64,
    pub end_ms: u64,
    pub source: Source,
    /// PCM 16 kHz `i16`: tối đa [`MAX_EMBED_SAMPLES`] mẫu đầu của phần tiếng nói `[start_ms, end_ms)`, không đệm (A2).
    pub pcm: Vec<i16>,
}

// Debug viết tay: âm thanh không bao giờ vào log (spec §5.6, §10).
impl fmt::Debug for SegmentAudio {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SegmentAudio")
            .field("segment_id", &self.segment_id)
            .field("start_ms", &self.start_ms)
            .field("end_ms", &self.end_ms)
            .field("source", &self.source)
            .field("pcm", &format_args!("<{} mẫu>", self.pcm.len()))
            .finish()
    }
}

/// Tên người (tên hiển thị đọc từ app họp, spec §6.3). Tên không bao giờ vào log: `Debug` chỉ in số ký tự.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct PersonName(String);

impl PersonName {
    /// `None` khi rỗng hay dài hơn [`MAX_NAME_BYTES`] byte.
    pub fn new(name: impl Into<String>) -> Option<Self> {
        let name = name.into();
        (!name.is_empty() && name.len() <= MAX_NAME_BYTES).then_some(Self(name))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Trong giới hạn của khung (tên tới từ worker chưa qua [`PersonName::new`]).
    pub fn fits(&self) -> bool {
        !self.0.is_empty() && self.0.len() <= MAX_NAME_BYTES
    }
}

impl fmt::Debug for PersonName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "<tên {} ký tự>", self.0.chars().count())
    }
}

/// App họp đọc được tên (spec §6.1). Danh sách viết cứng: công thức đọc chỉ thu hẹp, không thêm app.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum MeetingApp {
    Teams,
    Zoom,
    MeetChrome,
    MeetEdge,
}

impl MeetingApp {
    /// Theo thứ tự ưu tiên khi nhiều app cùng có cửa sổ họp.
    pub const ALL: [MeetingApp; 4] = [
        MeetingApp::Teams,
        MeetingApp::Zoom,
        MeetingApp::MeetChrome,
        MeetingApp::MeetEdge,
    ];

    pub fn macos_bundle_id(self) -> &'static str {
        match self {
            MeetingApp::Teams => "com.microsoft.teams2",
            MeetingApp::Zoom => "us.zoom.xos",
            MeetingApp::MeetChrome => "com.google.Chrome",
            MeetingApp::MeetEdge => "com.microsoft.edgemac",
        }
    }

    /// Tên file chạy trên Windows (kế hoạch 05).
    pub fn windows_exe(self) -> &'static str {
        match self {
            MeetingApp::Teams => "ms-teams.exe",
            MeetingApp::Zoom => "Zoom.exe",
            MeetingApp::MeetChrome => "chrome.exe",
            MeetingApp::MeetEdge => "msedge.exe",
        }
    }
}

/// Bộ đọc tên mà bản worker này có (`Ready`).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReaderPlatform {
    Unsupported,
    MacOs,
    Windows,
}

/// Trạng thái bộ đọc (spec §7.2; `ReaderState`), không có tên người. `Off`: "Lấy tên" tắt (tên đã xóa); `NoMeeting`: không có app
/// hay cửa sổ họp; `NoPermission`: có app họp đang chạy mà chưa có quyền Trợ năng (macOS); `NoNames`: có cửa sổ họp mà không
/// tìm thấy ô người tham dự; `NoSpeaking`: có tên mà máy có tiếng lâu không ai "đang nói"; `Blocked`: app họp không trả lời;
/// `Paused`: tạm dừng vì quá tải (`PauseNames`), tên đã chốt vẫn giữ.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReaderStatus {
    Off,
    NoMeeting,
    NoPermission,
    NoNames,
    NoSpeaking,
    Ok,
    Blocked,
    Paused,
}

/// Tên của giọng đến từ tín hiệu nào (spec §6.4): chỉ báo của công thức (chữ, phần tử neo), mic của người duy nhất mở mic, hay chỉ
/// báo tự học (6.5).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum NameSource {
    Indicator,
    Mic,
    Learned,
}

/// Một trạng thái của phần tử chỉ báo tự học: vai trò phụ và các lớp, **không có chữ** (không tên, không nhãn).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct PatternState {
    pub subrole: String,
    pub classes: Vec<String>,
}

/// Mô tả một chỉ báo "đang nói" mà bộ tự hiệu chỉnh tìm được (spec §6.5), để người vận hành cập nhật công thức: vai trò, vị trí
/// trong ô (chỉ số con theo đường đi) và các trạng thái đã thấy. Không có tên người, không có chữ của app họp. Giới hạn: `MAX_*`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct LearnedPattern {
    pub role: String,
    pub path: Vec<u16>,
    pub states: Vec<PatternState>,
}

/// Phần đọc tên của `Load` (spec §4.2: `names_enabled`, `recipe_json`; QĐ 5, 8 của kế hoạch 04).
#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct NamesSetup {
    /// Công tắc "Lấy tên" lúc chạy worker; đổi giữa phiên bằng `SetNames`.
    pub enabled: bool,
    /// Phần thân công thức đọc (app đã kiểm; worker kiểm lại cấu trúc). Rỗng: không đọc tên.
    pub recipe_json: String,
    /// File dấu `AXEnhancedUserInterface` (macOS) trong thư mục dữ liệu của app.
    pub eui_marker: Option<String>,
}

impl NamesSetup {
    /// Không đọc tên (test, công cụ đo, bản không có công thức).
    pub fn off() -> Self {
        Self::default()
    }
}

// Debug viết tay: công thức dài, đường dẫn dấu có tên thư mục người dùng.
impl fmt::Debug for NamesSetup {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("NamesSetup")
            .field("enabled", &self.enabled)
            .field("recipe_json", &format_args!("<{} byte>", self.recipe_json.len()))
            .field("eui_marker", &self.eui_marker.is_some())
            .finish()
    }
}

/// Dấu các app mà worker đã bật `AXEnhancedUserInterface` (QĐ 8): file JSON, worker ghi trước khi bật, xóa sau khi trả.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
pub struct EuiMarker {
    pub entries: Vec<EuiEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct EuiEntry {
    pub pid: i32,
    pub app: MeetingApp,
}

/// Ngưỡng của nhận giọng (spec §5.2–§5.4); đổi được qua khóa `speaker_config` của manifest (§4.5). Thiếu khóa nào thì dùng
/// mặc định.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SpeakerConfig {
    /// Cosine tối thiểu để vào một giọng đã có.
    pub theta: f32,
    /// Ngắn hơn thì không dùng nhúng, lấy giọng của đoạn trước.
    pub min_embed_ms: u64,
    /// Từ độ dài này mới được mở giọng mới.
    pub min_new_ms: u64,
    /// Từ độ dài này mới cập nhật tâm của giọng.
    pub min_update_ms: u64,
    /// Số giọng đang sống tối đa; đủ rồi thì đoạn không giống giọng nào vào giọng gần nhất. Mã giọng không bao giờ dùng lại nên
    /// có thể lớn hơn số này.
    pub max_voices: usize,
    /// Cosine giữa hai tâm để tự gộp; lớn hơn 1 là không bao giờ gộp (mặc định 1,10: kế hoạch 01 không thấy gộp giúp gì).
    pub merge_theta: f32,
    /// Mỗi giọng phải có ít nhất chừng này tiếng nói mới được tự gộp.
    pub merge_min_ms: u64,
    /// Tách giọng bị gộp theo tên thật (spec §5.3). Mặc định chốt ở kế hoạch 04 Task 11; `false` là như trước (giọng gộp không
    /// có tên).
    pub split: bool,
    /// Mỗi tên phải chiếm ít nhất phần này thời gian trùng của giọng (0 < x ≤ 0,5).
    pub split_share: f32,
    /// Mỗi tên phải có ít nhất chừng này ms trùng.
    pub split_min_ms: u64,
    /// Mỗi tên phải có ít nhất chừng này đoạn mang riêng tên đó.
    pub split_min_segments: u32,
    /// Tâm nhúng của hai nhóm đoạn phải khác nhau: cosine không quá số này (một người bị nhận hai tên thì hai tâm rất giống).
    pub split_max_cosine: f32,
}

impl Default for SpeakerConfig {
    fn default() -> Self {
        // Chốt ở kế hoạch 01 (results/nhan-giong-ami.md, nhan-giong-tieng-viet.md).
        Self {
            theta: 0.35,
            min_embed_ms: MIN_EMBED_MS,
            min_new_ms: 1_500,
            min_update_ms: 1_000,
            max_voices: 8,
            merge_theta: 1.10,
            merge_min_ms: 10_000,
            split: false,
            split_share: 0.25,
            split_min_ms: 5_000,
            split_min_segments: 3,
            split_max_cosine: 0.85,
        }
    }
}

impl SpeakerConfig {
    /// Trả tên trường đầu tiên vô lý. App (manifest) và worker (`Load`) cùng gọi; sai thì dùng [`SpeakerConfig::default`].
    pub fn validate(&self) -> Result<(), String> {
        let checks = [
            ("theta", self.theta.is_finite() && self.theta > 0.0 && self.theta <= 1.0),
            (
                "min_embed_ms",
                (MIN_EMBED_MS..=MAX_SEGMENT_MS).contains(&self.min_embed_ms),
            ),
            (
                "min_new_ms",
                (self.min_embed_ms..=MAX_SEGMENT_MS).contains(&self.min_new_ms),
            ),
            (
                "min_update_ms",
                (self.min_embed_ms..=MAX_SEGMENT_MS).contains(&self.min_update_ms),
            ),
            ("max_voices", (1..=MAX_VOICES).contains(&self.max_voices)),
            (
                "merge_theta",
                self.merge_theta.is_finite() && self.merge_theta > 0.0 && self.merge_theta <= 2.0,
            ),
            ("merge_min_ms", self.merge_min_ms <= 3_600_000),
            (
                "split_share",
                self.split_share.is_finite() && self.split_share > 0.0 && self.split_share <= 0.5,
            ),
            ("split_min_ms", self.split_min_ms <= 600_000),
            ("split_min_segments", (1..=64).contains(&self.split_min_segments)),
            (
                "split_max_cosine",
                self.split_max_cosine.is_finite() && self.split_max_cosine > 0.0 && self.split_max_cosine <= 1.0,
            ),
        ];
        match checks.iter().find(|(_, ok)| !ok) {
            Some((name, _)) => Err((*name).to_string()),
            None => Ok(()),
        }
    }
}

/// Yêu cầu từ app. Thứ tự: `Load` → `Ready`; `SessionStart` (không trả lời); mỗi `Segment` → `Assign` hay `Error`, có thể kèm
/// `Merged`, `Voices`; `Speech`, `SetNames`, `PauseNames` (không trả lời, có thể kèm `Voices`, `ReaderState`); `Shutdown`: worker
/// thoát.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Request {
    Load {
        model_path: String,
        /// SHA-256 (hex chữ thường) mà app đã kiểm cho file model; worker băm đúng các byte nó đọc (spec §10). `None`: model dev.
        model_sha256: Option<String>,
        config: SpeakerConfig,
        /// Phần đọc tên (kế hoạch 04).
        names: NamesSetup,
    },
    /// Giờ hệ thống (ms Unix) của mốc 0 của phiên (client tính một lần mỗi phiên, QĐ 12 của kế hoạch 04); worker xóa mọi giọng.
    SessionStart {
        unix_ms: u64,
    },
    Segment(SegmentAudio),
    Shutdown,
    /// Khoảng có tiếng nói của âm thanh máy theo VAD, tính từ đầu phiên (spec §4.2): tự hiệu chỉnh, nhịp đọc, mốc giờ.
    Speech {
        start_ms: u64,
        end_ms: u64,
    },
    /// Bật/tắt đọc tên giữa phiên (công tắc "Lấy tên"). Tắt thì xóa mọi tên tự động, người tham dự, chỉ báo tự học.
    SetNames {
        enabled: bool,
    },
    /// Tạm dừng đọc tên tới hết phiên vì worker quá tải (spec §11, QĐ 15 của kế hoạch 04): ngừng đọc và ngừng lập bằng chứng, **giữ**
    /// các tên đã gán. `SetNames` sau đó vẫn có tác dụng (tắt thì xóa tên; bật không bỏ tạm dừng).
    PauseNames,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    /// `Segment` khi model chưa nạp được.
    NotLoaded,
    /// Yêu cầu sai (thời lượng âm, đoạn quá dài, PCM quá 4 s): lỗi của app.
    InvalidRequest,
    Internal,
}

/// Một giọng đang sống (spec §4.2).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct VoiceInfo {
    pub voice: u32,
    /// Tổng thời lượng tiếng nói đã gán cho giọng này.
    pub speech_ms: u64,
    /// Giọng trong phòng: ≥ 60% thời lượng từ micro (spec §5.5).
    pub mic: bool,
    /// Tên đọc từ app họp (spec §6.6); `None`: chưa đủ bằng chứng.
    pub name: Option<PersonName>,
    pub name_source: Option<NameSource>,
    /// Một tên khớp nhiều giọng (máy chung phòng): thứ tự giọng 1, 2… theo thứ tự xuất hiện.
    pub room_index: Option<u32>,
}

impl VoiceInfo {
    /// Giọng chưa có tên.
    pub fn new(voice: u32, speech_ms: u64, mic: bool) -> Self {
        Self {
            voice,
            speech_ms,
            mic,
            name: None,
            name_source: None,
            room_index: None,
        }
    }
}

/// Phản hồi của worker. Cùng luật chỉ-thêm-ở-cuối như [`Request`].
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Response {
    Ready {
        /// Trường đầu tiên (test `protocol_version_comes_first_in_ready`). Worker khác phiên bản không tới được đây (test
        /// `a_load_of_another_protocol_version_does_not_decode`).
        protocol_version: u32,
        /// `false`: model không nạp được; worker vẫn sống nhưng trả `Error { NotLoaded }` cho mọi đoạn.
        model_ok: bool,
        reader_platform: ReaderPlatform,
    },
    /// `voice` là `None` khi đoạn quá ngắn (hay nhúng không dùng được) mà chưa có giọng nào. Có thể tới lần nữa cho đoạn cũ khi
    /// giọng được tách (kế hoạch 04, QĐ 10).
    Assign {
        segment_id: u64,
        voice: Option<u32>,
        confidence: f32,
    },
    /// Danh sách giọng đang sống và người tham dự đọc được, gửi khi có giọng mới, gộp, tách, cờ trong phòng đổi, tên đổi.
    Voices {
        voices: Vec<VoiceInfo>,
        participants: Vec<PersonName>,
    },
    Merged {
        from: u32,
        into: u32,
    },
    Error {
        segment_id: Option<u64>,
        kind: ErrorKind,
        message: String,
    },
    /// Trạng thái bộ đọc tên (spec §7.2), gửi khi đổi; không có tên người.
    ReaderState {
        app: Option<MeetingApp>,
        app_version: Option<String>,
        state: ReaderStatus,
        recipe_version: u32,
        /// Số chỉ báo tự học được (6.5).
        learned: u32,
        /// Mô tả các chỉ báo tự học (tối đa [`MAX_LEARNED_PATTERNS`]), không có tên người (kế hoạch 06, spec §7.2).
        patterns: Vec<LearnedPattern>,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error("lỗi I/O: {0}")]
    Io(#[from] io::Error),
    #[error("khung dài {0} byte, vượt giới hạn {MAX_FRAME_BYTES}")]
    TooLarge(u64),
    #[error("lỗi mã hóa: {0}")]
    Codec(#[from] postcard::Error),
    #[error("khung còn {0} byte thừa sau thông điệp")]
    TrailingBytes(usize),
}

/// Ghi một khung rồi `flush`. Khung quá [`MAX_FRAME_BYTES`] thì không ghi gì.
pub fn write_frame<W: Write, T: Serialize>(w: &mut W, msg: &T) -> Result<(), FrameError> {
    let bytes = postcard::to_stdvec(msg)?;
    if bytes.len() as u64 > MAX_FRAME_BYTES as u64 {
        return Err(FrameError::TooLarge(bytes.len() as u64));
    }
    w.write_all(&(bytes.len() as u32).to_le_bytes())?;
    w.write_all(&bytes)?;
    w.flush()?;
    Ok(())
}

/// Đọc một khung. `Ok(None)` khi luồng đóng đúng ở ranh giới giữa hai khung. Mọi lỗi khác: bên đọc bỏ luồng (worker thoát; app
/// coi worker đã chết).
pub fn read_frame<R: Read, T: DeserializeOwned>(r: &mut R) -> Result<Option<T>, FrameError> {
    let mut len_buf = [0u8; 4];
    let mut filled = 0;
    while filled < len_buf.len() {
        match r.read(&mut len_buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.into()),
        }
    }
    if filled == 0 {
        return Ok(None);
    }
    if filled < len_buf.len() {
        return Err(io::Error::from(io::ErrorKind::UnexpectedEof).into());
    }
    let len = u32::from_le_bytes(len_buf);
    if len > MAX_FRAME_BYTES {
        return Err(FrameError::TooLarge(len as u64));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    let (msg, rest) = postcard::take_from_bytes::<T>(&buf)?;
    if !rest.is_empty() {
        return Err(FrameError::TrailingBytes(rest.len()));
    }
    Ok(Some(msg))
}

/// `Voices` trong giới hạn (app coi khung vượt là hỏng): ≤ 64 giọng, ≤ 64 người tham dự, mỗi tên không rỗng và ≤ 160 byte.
pub fn voices_fit(voices: &[VoiceInfo], participants: &[PersonName]) -> bool {
    voices.len() <= MAX_VOICES_ON_WIRE
        && participants.len() <= MAX_PARTICIPANTS_ON_WIRE
        && voices
            .iter()
            .filter_map(|v| v.name.as_ref())
            .chain(participants)
            .all(PersonName::fits)
}

/// `ReaderState.patterns` trong giới hạn (app coi khung vượt là hỏng): ≤ 4 mẫu, mỗi mẫu đường đi ≤ 8, ≤ 3 trạng thái, mỗi trạng thái
/// ≤ 6 lớp, mỗi vai trò, vai trò phụ, lớp ≤ 32 byte.
pub fn patterns_fit(patterns: &[LearnedPattern]) -> bool {
    let token = |s: &String| s.len() <= MAX_PATTERN_TOKEN_BYTES;
    patterns.len() <= MAX_LEARNED_PATTERNS
        && patterns.iter().all(|p| {
            token(&p.role)
                && p.path.len() <= MAX_PATTERN_PATH
                && p.states.len() <= MAX_PATTERN_STATES
                && p.states
                    .iter()
                    .all(|s| token(&s.subrole) && s.classes.len() <= MAX_PATTERN_CLASSES && s.classes.iter().all(token))
        })
}

/// Mẫu f32 trong [-1, 1] sang PCM 16 bit, cùng công thức `pipeline::engine` dùng cho `asr-worker` (nhân `i16::MAX`, chặn biên).
pub fn pcm_from_f32(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}

/// Ngược lại của [`pcm_from_f32`]: chia `i16::MAX`, chặn ở -1 (`i16::MIN` hơi vượt).
pub fn f32_from_pcm(pcm: &[i16]) -> Vec<f32> {
    pcm.iter().map(|&v| (v as f32 / i16::MAX as f32).max(-1.0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample_segment() -> SegmentAudio {
        SegmentAudio {
            segment_id: 7,
            start_ms: 1_000,
            end_ms: 3_500,
            source: Source::Mic,
            pcm: vec![0, 1, -1, i16::MAX, i16::MIN],
        }
    }

    fn requests() -> Vec<Request> {
        vec![
            Request::Load {
                model_path: "/m/eres2net.onnx".into(),
                model_sha256: Some("ab".repeat(32)),
                config: SpeakerConfig::default(),
                names: NamesSetup {
                    enabled: true,
                    recipe_json: "{\"schema\":1}".into(),
                    eui_marker: Some("/d/speaker-eui.json".into()),
                },
            },
            Request::SessionStart {
                unix_ms: 1_793_000_000_000,
            },
            Request::Segment(sample_segment()),
            Request::Shutdown,
            Request::Speech {
                start_ms: 1_000,
                end_ms: 1_512,
            },
            Request::SetNames { enabled: false },
            Request::PauseNames,
        ]
    }

    fn responses() -> Vec<Response> {
        vec![
            Response::Ready {
                protocol_version: PROTOCOL_VERSION,
                model_ok: true,
                reader_platform: ReaderPlatform::MacOs,
            },
            Response::Assign {
                segment_id: 7,
                voice: Some(9),
                confidence: 0.5,
            },
            Response::Voices {
                voices: vec![VoiceInfo {
                    name: PersonName::new("Lan Nguyễn"),
                    name_source: Some(NameSource::Indicator),
                    room_index: Some(2),
                    ..VoiceInfo::new(9, 2_500, true)
                }],
                participants: vec![
                    PersonName::new("Lan Nguyễn").unwrap(),
                    PersonName::new("Minh Trần").unwrap(),
                ],
            },
            Response::Merged { from: 2, into: 1 },
            Response::Error {
                segment_id: Some(7),
                kind: ErrorKind::InvalidRequest,
                message: "đoạn sai".into(),
            },
            Response::ReaderState {
                app: Some(MeetingApp::Teams),
                app_version: Some("26276.505".into()),
                state: ReaderStatus::Ok,
                recipe_version: 1,
                learned: 1,
                patterns: vec![LearnedPattern {
                    role: "AXGroup".into(),
                    path: vec![2, 0],
                    states: vec![PatternState {
                        subrole: String::new(),
                        classes: vec!["vdi-frame-occlusion".into()],
                    }],
                }],
            },
        ]
    }

    #[test]
    fn requests_and_responses_roundtrip() {
        let mut buf = Vec::new();
        for r in requests() {
            write_frame(&mut buf, &r).unwrap();
        }
        for r in responses() {
            write_frame(&mut buf, &r).unwrap();
        }
        let mut cur = Cursor::new(buf);
        for r in requests() {
            assert_eq!(read_frame::<_, Request>(&mut cur).unwrap().unwrap(), r);
        }
        for r in responses() {
            assert_eq!(read_frame::<_, Response>(&mut cur).unwrap().unwrap(), r);
        }
        assert!(read_frame::<_, Request>(&mut cur).unwrap().is_none());
    }

    /// postcard mã hóa enum theo thứ tự khai báo: đổi thứ tự là đổi định dạng trên dây.
    #[test]
    fn variant_indices_are_pinned() {
        fn index<T: Serialize>(v: &T) -> u8 {
            postcard::to_stdvec(v).unwrap()[0]
        }
        assert_eq!(requests().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3, 4, 5, 6]);
        assert_eq!(responses().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3, 4, 5]);
        assert_eq!(
            [Source::System, Source::Mic, Source::Mixed].map(|s| index(&s)),
            [0, 1, 2]
        );
        assert_eq!(
            [ErrorKind::NotLoaded, ErrorKind::InvalidRequest, ErrorKind::Internal].map(|k| index(&k)),
            [0, 1, 2]
        );
        assert_eq!(MeetingApp::ALL.map(|a| index(&a)), [0, 1, 2, 3]);
        assert_eq!(
            [
                ReaderPlatform::Unsupported,
                ReaderPlatform::MacOs,
                ReaderPlatform::Windows
            ]
            .map(|p| index(&p)),
            [0, 1, 2]
        );
        assert_eq!(
            [
                ReaderStatus::Off,
                ReaderStatus::NoMeeting,
                ReaderStatus::NoPermission,
                ReaderStatus::NoNames,
                ReaderStatus::NoSpeaking,
                ReaderStatus::Ok,
                ReaderStatus::Blocked,
                ReaderStatus::Paused
            ]
            .map(|s| index(&s)),
            [0, 1, 2, 3, 4, 5, 6, 7]
        );
        assert_eq!(
            [NameSource::Indicator, NameSource::Mic, NameSource::Learned].map(|s| index(&s)),
            [0, 1, 2]
        );
    }

    /// `protocol_version` là trường đầu của `Ready`: app đọc được số này trước mọi trường khác.
    #[test]
    fn protocol_version_comes_first_in_ready() {
        let ready = Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: false,
            reader_platform: ReaderPlatform::Unsupported,
        };
        let bytes = postcard::to_stdvec(&ready).unwrap();
        assert_eq!(bytes[..2], [0, PROTOCOL_VERSION as u8]);
    }

    #[test]
    fn oversized_truncated_and_unknown_frames_are_errors() {
        let mut big = (MAX_FRAME_BYTES + 1).to_le_bytes().to_vec();
        big.extend([0; 8]);
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(big)),
            Err(FrameError::TooLarge(_))
        ));
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![3u8, 0])),
            Err(FrameError::Io(_))
        ));
        // `Shutdown` (chỉ số 3) kèm 2 byte thừa.
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![3, 0, 0, 0, 3, 0xAA, 0xBB])),
            Err(FrameError::TrailingBytes(2))
        ));
        // Chỉ số biến thể lạ.
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![1, 0, 0, 0, 9])),
            Err(FrameError::Codec(_))
        ));
    }

    #[test]
    fn a_frame_larger_than_the_limit_is_not_written_but_four_seconds_fit_easily() {
        let big = Request::Segment(SegmentAudio {
            pcm: vec![i16::MAX; MAX_FRAME_BYTES as usize / 2],
            ..sample_segment()
        });
        let mut out = Vec::new();
        assert!(matches!(write_frame(&mut out, &big), Err(FrameError::TooLarge(_))));
        assert!(out.is_empty());
        let four = Request::Segment(SegmentAudio {
            pcm: vec![i16::MIN; MAX_EMBED_SAMPLES],
            ..sample_segment()
        });
        write_frame(&mut out, &four).unwrap();
        assert!(out.len() < MAX_FRAME_BYTES as usize / 10, "{} byte", out.len());
    }

    #[test]
    fn debug_output_never_contains_audio() {
        let s = format!(
            "{:?}",
            Request::Segment(SegmentAudio {
                pcm: vec![12345; 100],
                ..sample_segment()
            })
        );
        assert!(s.contains("<100 mẫu>") && !s.contains("12345"), "{s}");
    }

    /// Ngưỡng chốt ở kế hoạch 01 (results/nhan-giong-ami.md, nhan-giong-tieng-viet.md): θ 0,35, gộp tắt (1,10).
    #[test]
    fn the_default_config_is_the_one_chosen_in_plan_01_and_is_valid() {
        let c = SpeakerConfig::default();
        assert_eq!(
            (
                c.theta,
                c.min_embed_ms,
                c.min_new_ms,
                c.min_update_ms,
                c.max_voices,
                c.merge_theta,
                c.merge_min_ms
            ),
            (0.35, 500, 1_500, 1_000, 8, 1.10, 10_000)
        );
        // Tách giọng bị gộp theo tên (spec §5.3, kế hoạch 04): mặc định chốt ở Task 11.
        assert_eq!(
            (
                c.split,
                c.split_share,
                c.split_min_ms,
                c.split_min_segments,
                c.split_max_cosine
            ),
            (false, 0.25, 5_000, 3, 0.85)
        );
        assert_eq!(c.validate(), Ok(()));
    }

    #[test]
    fn validate_names_the_first_bad_field() {
        let bad = |change: fn(&mut SpeakerConfig)| {
            let mut c = SpeakerConfig::default();
            change(&mut c);
            c.validate().unwrap_err()
        };
        assert_eq!(bad(|c| c.theta = f32::NAN), "theta");
        assert_eq!(bad(|c| c.theta = -0.1), "theta");
        assert_eq!(bad(|c| c.theta = 0.0), "theta");
        assert_eq!(bad(|c| c.theta = 1.5), "theta");
        // Ngắn hơn 0,5 s thì `Embedder::embed` từ chối: hai nguồn sự thật phải khớp (MIN_EMBED_MS).
        assert_eq!(bad(|c| c.min_embed_ms = 499), "min_embed_ms");
        assert_eq!(bad(|c| c.min_new_ms = 400), "min_new_ms");
        assert_eq!(bad(|c| c.min_update_ms = 499), "min_update_ms");
        assert_eq!(bad(|c| c.max_voices = 0), "max_voices");
        assert_eq!(bad(|c| c.max_voices = MAX_VOICES + 1), "max_voices");
        assert_eq!(bad(|c| c.merge_theta = f32::INFINITY), "merge_theta");
        assert_eq!(bad(|c| c.merge_min_ms = u64::MAX), "merge_min_ms");
        assert_eq!(bad(|c| c.split_share = 0.6), "split_share");
        assert_eq!(bad(|c| c.split_share = 0.0), "split_share");
        assert_eq!(bad(|c| c.split_min_ms = 600_001), "split_min_ms");
        assert_eq!(bad(|c| c.split_min_segments = 0), "split_min_segments");
        assert_eq!(bad(|c| c.split_max_cosine = 1.5), "split_max_cosine");
    }

    #[test]
    fn pcm_conversion_roundtrips_within_one_step() {
        let x = [0.0f32, 0.5, -0.5, 1.0, -1.0, 2.0, -2.0];
        let back = f32_from_pcm(&pcm_from_f32(&x));
        for (a, b) in x.iter().map(|v| v.clamp(-1.0, 1.0)).zip(&back) {
            assert!((a - b).abs() <= 1.0 / i16::MAX as f32, "{a} {b}");
        }
        assert_eq!(f32_from_pcm(&[i16::MIN]), [-1.0]);
    }

    #[test]
    fn the_a2_cap_is_four_seconds_and_the_embedding_floor_half_a_second() {
        assert_eq!(MAX_EMBED_SAMPLES, 64_000);
        assert_eq!(MIN_EMBED_MS, 500);
    }

    /// Spec §10: tên người không bao giờ vào log, kể cả khi in cả khung bằng `{:?}`.
    #[test]
    fn names_never_show_in_debug_output() {
        let s = format!("{:?}", responses());
        assert!(!s.contains("Lan") && !s.contains("Minh"), "{s}");
        assert!(s.contains("<tên 10 ký tự>"), "{s}");
        let load = format!("{:?}", requests()[0]);
        assert!(!load.contains("schema") && !load.contains("speaker-eui"), "{load}");
    }

    /// Vòng rà soát 1 (A-Q2): worker khác phiên bản giao thức không bao giờ tới được `Ready`, vì `Load` của phiên bản kia không
    /// giải mã được (thừa hay thiếu byte): worker thoát ngay, app chỉ thấy stdout đóng trước `Ready` (QĐ 26 của kế hoạch 04: log gợi
    /// ý kiểm bản `speaker-worker`). Vì vậy không có cơ chế đọc `protocol_version` trước khi giải mã `Ready`.
    #[test]
    fn a_load_of_another_protocol_version_does_not_decode() {
        let frame = |body: &[u8]| {
            let mut f = (body.len() as u32).to_le_bytes().to_vec();
            f.extend_from_slice(body);
            f
        };
        let load = postcard::to_stdvec(&requests()[0]).unwrap();
        // Phiên bản sau thêm trường ở cuối `Load`: thừa byte.
        let mut longer = load.clone();
        longer.push(0);
        let got = read_frame::<_, Request>(&mut frame(&longer).as_slice());
        assert!(matches!(got, Err(FrameError::TrailingBytes(1))), "{got:?}");
        // Phiên bản trước không có phần cuối của `names`: thiếu byte.
        let shorter = &load[..load.len() - 3];
        assert!(read_frame::<_, Request>(&mut frame(shorter).as_slice()).is_err());
    }

    /// App coi khung của worker là dữ liệu chưa tin (đầu module): tên rỗng hay quá dài, quá nhiều người tham dự là khung hỏng.
    #[test]
    fn voices_fit_limits_names_and_participants() {
        let named = |name: &str| VoiceInfo {
            name: Some(PersonName(name.into())),
            ..VoiceInfo::new(1, 0, false)
        };
        let ok = PersonName::new("Lan").unwrap();
        assert!(voices_fit(&[named("Lan")], std::slice::from_ref(&ok)));
        assert!(!voices_fit(&[named("")], &[]));
        assert!(!voices_fit(&[named(&"x".repeat(MAX_NAME_BYTES + 1))], &[]));
        assert!(!voices_fit(&[], &vec![ok.clone(); MAX_PARTICIPANTS_ON_WIRE + 1]));
        assert!(!voices_fit(
            &vec![VoiceInfo::new(1, 0, false); MAX_VOICES_ON_WIRE + 1],
            &[]
        ));
        assert_eq!(PersonName::new(""), None);
        assert_eq!(PersonName::new("x".repeat(MAX_NAME_BYTES + 1)), None);
    }

    #[test]
    fn patterns_fit_limits() {
        let state = |classes: usize| PatternState {
            subrole: String::new(),
            classes: vec!["x".into(); classes],
        };
        let pattern = |path: usize, states: Vec<PatternState>| LearnedPattern {
            role: "AXGroup".into(),
            path: vec![0; path],
            states,
        };
        let ok = pattern(MAX_PATTERN_PATH, vec![state(MAX_PATTERN_CLASSES); MAX_PATTERN_STATES]);
        assert!(patterns_fit(&[]));
        assert!(patterns_fit(&vec![ok.clone(); MAX_LEARNED_PATTERNS]));
        assert!(!patterns_fit(&vec![ok.clone(); MAX_LEARNED_PATTERNS + 1]));
        assert!(!patterns_fit(&[pattern(MAX_PATTERN_PATH + 1, vec![])]));
        assert!(!patterns_fit(&[pattern(0, vec![state(0); MAX_PATTERN_STATES + 1])]));
        assert!(!patterns_fit(&[pattern(0, vec![state(MAX_PATTERN_CLASSES + 1)])]));
        let mut long = ok;
        long.role = "x".repeat(MAX_PATTERN_TOKEN_BYTES + 1);
        assert!(!patterns_fit(&[long]));
    }

    /// Danh sách app viết cứng (spec §6.1): công thức đọc không thêm được app.
    #[test]
    fn meeting_apps_have_fixed_bundle_ids() {
        assert_eq!(
            MeetingApp::ALL.map(MeetingApp::macos_bundle_id),
            [
                "com.microsoft.teams2",
                "us.zoom.xos",
                "com.google.Chrome",
                "com.microsoft.edgemac"
            ]
        );
        assert_eq!(
            MeetingApp::ALL.map(MeetingApp::windows_exe),
            ["ms-teams.exe", "Zoom.exe", "chrome.exe", "msedge.exe"]
        );
        let json = serde_json::to_string(&MeetingApp::MeetChrome).unwrap();
        assert_eq!(json, "\"meet_chrome\"");
    }
}
