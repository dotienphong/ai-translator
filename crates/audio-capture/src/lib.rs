//! Thu âm thanh hệ thống (spec §6.1) và chuyển về 16 kHz mono (spec §6.2).

pub mod duck;
pub mod gapfill;
pub mod highpass;
pub mod mic_chain;
pub mod mix;
pub mod preprocess;
pub mod resample;

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "macos")]
pub mod macos_input;
#[cfg(windows)]
pub mod windows;

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

/// Nguồn âm thanh. Callback thu âm chỉ ghi mẫu float32 xen kẽ (interleaved) vào ring buffer,
/// không cấp phát bộ nhớ và không lock (spec §6.1).
pub trait AudioSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> anyhow::Result<()>;
    fn stop(&mut self);
    /// Hợp lệ sau khi `start` thành công.
    fn format(&self) -> AudioFormat;
    /// Luồng thu đã chết (ví dụ thiết bị bị rút): app phải khởi tạo lại việc thu (§9).
    fn failed(&self) -> bool {
        false
    }
}

/// Một app đang phát âm thanh (macOS: tùy chọn chỉ tap app họp, §6.1).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioApp {
    /// Mọi tiến trình đang phát tiếng của app, kể cả tiến trình helper cùng gói `.app` (trình duyệt, app Electron).
    pub pids: Vec<i32>,
    /// Bundle ID của app chính; không tìm được app chính thì là bundle ID mà Core Audio báo cho tiến trình.
    pub bundle_id: String,
    /// Tên hiển thị (`NSRunningApplication.localizedName`); `None` nếu không có.
    pub name: Option<String>,
}

/// Dấu hiệu của thiết bị phát mặc định: đổi thì app khởi tạo lại việc thu trong ≤ 2 giây (§9). App hỏi định kỳ (mỗi 500 ms)
/// thay cho listener của Core Audio và `IMMNotificationClient`: cùng kết quả, không có callback chạy trên luồng của hệ
/// thống. `None` nếu không đọc được.
///
/// macOS: id của thiết bị kèm tần số mẫu danh định (`<id>@<Hz>`), vì tai nghe Bluetooth đổi tần số trên cùng thiết bị.
pub fn default_output_signature() -> Option<String> {
    #[cfg(target_os = "macos")]
    return macos::default_output_device().ok().map(|id| {
        let rate = macos::nominal_sample_rate(id).unwrap_or(0.0);
        format!("{id}@{rate:.0}")
    });
    #[cfg(windows)]
    return {
        use crate::windows::{Role, default_endpoint_id};
        let console = default_endpoint_id(Role::Console).ok()?;
        let communications = default_endpoint_id(Role::Communications).unwrap_or_default();
        Some(format!("{console}|{communications}"))
    };
    #[allow(unreachable_code)]
    None
}

/// Cách micro nối với máy. Log và báo cáo lỗi chỉ ghi loại này, không ghi tên micro, vì tên có thể chứa tên người
/// (spec 2026-10-24-nguon-micro §4).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Transport {
    BuiltIn,
    Usb,
    Bluetooth,
    Virtual,
    Other,
}

impl Transport {
    pub fn as_str(self) -> &'static str {
        match self {
            Transport::BuiltIn => "builtin",
            Transport::Usb => "usb",
            Transport::Bluetooth => "bluetooth",
            Transport::Virtual => "virtual",
            Transport::Other => "other",
        }
    }
}

/// Một micro (thiết bị có luồng vào), cho bộ chọn ở Cài đặt › Âm thanh.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InputDevice {
    /// macOS: UID của thiết bị; Windows: id endpoint.
    pub id: String,
    pub name: String,
    pub transport: Transport,
    pub is_default: bool,
}

/// Quyền dùng micro của app (spec 2026-10-24-nguon-micro §3.4).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MicPermission {
    Granted,
    Denied,
    Undetermined,
}

/// Trạng thái quyền micro của app (spec 2026-10-24-nguon-micro §3.4). Chỉ đọc, không hỏi người dùng. Windows không có
/// trạng thái "chưa hỏi": công tắc quyền micro cho app desktop chỉ bật hay tắt.
pub fn mic_permission() -> MicPermission {
    #[cfg(target_os = "macos")]
    return macos_input::mic_permission();
    #[cfg(windows)]
    return windows::mic_permission();
    #[allow(unreachable_code)]
    MicPermission::Denied
}

/// Xin quyền micro. macOS: hiện hộp thoại nếu chưa hỏi lần nào, chờ trả lời tối đa `wait`; đã trả lời rồi thì trả ngay kết
/// quả cũ. Windows: không có hộp thoại, trả trạng thái hiện có. Gọi trước khi mở micro (spec mục 16: để Core Audio tự
/// hỏi thì `start` bị chặn suốt lúc hộp thoại mở).
pub fn request_mic_permission(wait: std::time::Duration) -> anyhow::Result<MicPermission> {
    #[cfg(target_os = "macos")]
    return Ok(if macos_input::request_mic_permission(wait)? {
        MicPermission::Granted
    } else {
        MicPermission::Denied
    });
    #[allow(unreachable_code)]
    {
        let _ = wait;
        Ok(mic_permission())
    }
}

/// Nguồn micro (spec 2026-10-24-nguon-micro §5.1, §5.2). `id`: `None` là micro mặc định.
pub fn mic_source(id: Option<String>, stats: Arc<CaptureStats>) -> anyhow::Result<Box<dyn AudioSource>> {
    #[cfg(target_os = "macos")]
    return Ok(Box::new(macos_input::MacInputSource::new(
        id.map_or(macos_input::MicTarget::Default, macos_input::MicTarget::Uid),
        stats,
    )));
    #[cfg(windows)]
    return Ok(Box::new(windows::InputSource::new(
        id.map_or(windows::MicEndpoint::Default, windows::MicEndpoint::Device),
        stats,
    )));
    #[allow(unreachable_code)]
    {
        let _ = (id, stats);
        anyhow::bail!("chỉ hỗ trợ macOS và Windows")
    }
}

/// Các micro đang dùng được.
pub fn list_input_devices() -> anyhow::Result<Vec<InputDevice>> {
    #[cfg(target_os = "macos")]
    return macos_input::list_capture_devices();
    #[cfg(windows)]
    return windows::list_capture_devices();
    #[allow(unreachable_code)]
    {
        anyhow::bail!("chỉ hỗ trợ macOS và Windows")
    }
}

/// Dấu hiệu của micro mặc định: đổi thì mở lại nguồn micro (spec §5.6). `None` nếu không đọc được hay máy không có micro.
pub fn default_input_signature() -> Option<String> {
    #[cfg(target_os = "macos")]
    return macos_input::default_input_device().ok().map(|id| {
        let rate = macos::nominal_sample_rate(id).unwrap_or(0.0);
        format!("{id}@{rate:.0}")
    });
    #[cfg(windows)]
    return windows::default_capture_endpoint_id().ok();
    #[allow(unreachable_code)]
    None
}

/// Số liệu chẩn đoán, cập nhật từ luồng thu.
#[derive(Default, Debug)]
pub struct CaptureStats {
    /// Số khung (frame) nhận từ thiết bị.
    pub frames: AtomicU64,
    /// Số khung im lặng tự chèn vào khoảng trống (Windows, spec §6.1).
    pub silence_inserted: AtomicU64,
    /// Số khung bị bỏ vì trùng với phần im lặng đã chèn.
    pub skipped: AtomicU64,
    /// Số mẫu bị bỏ vì ring buffer đầy, hoặc vì lượt IO bị từ chối (macOS).
    pub dropped: AtomicU64,
    /// Số lượt IO bị từ chối vì bố cục buffer không khớp tap, kể cả lượt không có buffer nào (macOS).
    pub rejected_cycles: AtomicU64,
}

impl CaptureStats {
    /// Thứ tự: frames, silence_inserted, skipped, dropped, rejected_cycles.
    pub fn snapshot(&self) -> [u64; 5] {
        [
            self.frames.load(Ordering::Relaxed),
            self.silence_inserted.load(Ordering::Relaxed),
            self.skipped.load(Ordering::Relaxed),
            self.dropped.load(Ordering::Relaxed),
            self.rejected_cycles.load(Ordering::Relaxed),
        ]
    }
}
