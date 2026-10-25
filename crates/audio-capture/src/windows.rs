//! WASAPI shared-mode endpoint loopback (spec §6.1). Code của kế hoạch 0-04, Task 7, thêm: chọn thiết bị theo id (người
//! dùng chọn tay), liệt kê thiết bị phát, và cờ `failed` khi luồng thu chết (thiết bị bị rút: `AUDCLNT_E_DEVICE_INVALIDATED`).
//!
//! Đọc theo timer 10 ms, không chờ sự kiện, vì loopback không báo sự kiện khi không có gì phát.
//! Khoảng trống được chèn im lặng theo đồng hồ QPC (`GapFiller`).
//!
//! Cũng thu micro (spec 2026-10-24-nguon-micro §5.2): cùng luồng thu, mở endpoint `eCapture` và bỏ cờ loopback.

use crate::gapfill::GapFiller;
use crate::{AudioFormat, AudioSource, CaptureStats, InputDevice, Transport};
use anyhow::{Context, Result, anyhow};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Duration;
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
use windows::Win32::Media::Audio::{
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
    AUDCLNT_STREAMFLAGS_LOOPBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, DEVICE_STATE_ACTIVE, EDataFlow, ERole,
    IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, WAVEFORMATEX,
    WAVEFORMATEXTENSIBLE, WAVEFORMATEXTENSIBLE_0, eCapture, eCommunications, eConsole, eRender,
};
use windows::Win32::Media::KernelStreaming::{
    SPEAKER_FRONT_CENTER, SPEAKER_FRONT_LEFT, SPEAKER_FRONT_RIGHT, WAVE_FORMAT_EXTENSIBLE,
};
use windows::Win32::Media::Multimedia::KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, STGM_READ,
};
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};
use windows::core::{HSTRING, PWSTR};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    /// Thiết bị phát mặc định.
    Console,
    /// Thiết bị mặc định cho liên lạc; app họp hay dùng thiết bị này với tai nghe Bluetooth.
    Communications,
}

impl Role {
    fn erole(self) -> ERole {
        match self {
            Role::Console => eConsole,
            Role::Communications => eCommunications,
        }
    }
}

/// Thiết bị để thu loopback.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Endpoint {
    /// Thiết bị mặc định của một vai trò (chế độ tự động, §6.1).
    Default(Role),
    /// Một thiết bị người dùng chọn tay, theo id endpoint (`AudioSource::Device` trong cài đặt).
    Device(String),
}

/// Một thiết bị phát đang hoạt động, cho danh sách ở Cài đặt › Âm thanh.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderDevice {
    pub id: String,
    pub name: String,
}

/// Micro để thu (spec 2026-10-24-nguon-micro §5.2).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MicEndpoint {
    /// Micro mặc định (vai trò Console: thiết bị Settings › Sound › Input đang chọn).
    Default,
    /// Một micro người dùng chọn, theo id endpoint.
    Device(String),
}

/// Thiết bị mà luồng thu WASAPI mở: loopback của một thiết bị phát, hay một micro.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Target {
    Loopback(Endpoint),
    Mic(MicEndpoint),
}

/// Phần chung của nguồn loopback và nguồn micro: luồng thu WASAPI chạy nền.
struct Wasapi {
    target: Target,
    format: AudioFormat,
    stats: Arc<CaptureStats>,
    stop: Arc<AtomicBool>,
    failed: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

/// Chạy `f` với COM ở chế độ MTA trên luồng hiện tại. Luồng đã khởi tạo COM ở chế độ STA (`RPC_E_CHANGED_MODE`, ví dụ
/// luồng giao diện) vẫn dùng được các API ở đây; khi đó không gọi `CoUninitialize`, vì lần khởi tạo đó không phải của hàm
/// này.
fn with_com<T>(f: impl FnOnce() -> Result<T>) -> Result<T> {
    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let owned = if hr == RPC_E_CHANGED_MODE {
        false
    } else {
        hr.ok()?;
        true
    };
    let result = f();
    if owned {
        unsafe { CoUninitialize() };
    }
    result
}

fn pwstr_to_string(p: PWSTR) -> Result<String> {
    let text = unsafe { p.to_string() };
    unsafe { CoTaskMemFree(Some(p.0 as *const _)) };
    Ok(text?)
}

/// Id của thiết bị phát mặc định cho một vai trò. Hai vai trò thường trỏ cùng một thiết bị; khi đó chỉ thu một lần, để
/// không cộng tiếng hai lần (spec §6.1). App hỏi hàm này định kỳ để biết thiết bị đã đổi chưa (§9).
pub fn default_endpoint_id(role: Role) -> Result<String> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role.erole())? };
        pwstr_to_string(unsafe { device.GetId()? })
    })
}

/// Các endpoint đang hoạt động theo chiều `flow`: (id, tên hiển thị).
fn active_endpoints(flow: EDataFlow) -> Result<Vec<(String, String)>> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let collection = unsafe { enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)? };
        let mut devices = Vec::new();
        for i in 0..unsafe { collection.GetCount()? } {
            let device = unsafe { collection.Item(i)? };
            let id = pwstr_to_string(unsafe { device.GetId()? })?;
            let store = unsafe { device.OpenPropertyStore(STGM_READ)? };
            let name = unsafe { store.GetValue(&PKEY_Device_FriendlyName)? }.to_string();
            devices.push((id, name));
        }
        Ok(devices)
    })
}

/// Các thiết bị phát đang hoạt động, kèm tên hiển thị.
pub fn list_render_devices() -> Result<Vec<RenderDevice>> {
    Ok(active_endpoints(eRender)?
        .into_iter()
        .map(|(id, name)| RenderDevice { id, name })
        .collect())
}

/// Id của micro mặc định (vai trò Console). App hỏi định kỳ để biết micro mặc định đã đổi (spec §5.6).
pub fn default_capture_endpoint_id() -> Result<String> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)? };
        pwstr_to_string(unsafe { device.GetId()? })
    })
}

/// Các micro đang hoạt động. Loại kết nối chưa đọc trên Windows (kế hoạch 02 quyết có cần không).
pub fn list_capture_devices() -> Result<Vec<InputDevice>> {
    let default = default_capture_endpoint_id().ok();
    Ok(active_endpoints(eCapture)?
        .into_iter()
        .map(|(id, name)| InputDevice {
            is_default: default.as_deref() == Some(id.as_str()),
            id,
            name,
            transport: Transport::Other,
        })
        .collect())
}

/// Khóa quyền micro của Windows (Settings › Privacy & security › Microphone). `Value` = "Deny" ở khóa gốc là tắt cho mọi
/// app; ở khóa con `NonPackaged` là tắt "Let desktop apps access your microphone" (spec 2026-10-24-nguon-micro §3.4).
const MIC_CONSENT: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

/// Trạng thái quyền micro: "Deny" ở một trong hai khóa thì bị từ chối; không đọc được khóa thì coi là được phép (lỗi mở
/// thật sẽ tới từ WASAPI, `E_ACCESSDENIED`).
pub fn mic_permission() -> crate::MicPermission {
    let denied = [MIC_CONSENT.to_string(), format!(r"{MIC_CONSENT}\NonPackaged")]
        .iter()
        .any(|path| consent_value(path).as_deref() == Some("Deny"));
    if denied {
        crate::MicPermission::Denied
    } else {
        crate::MicPermission::Granted
    }
}

/// Giá trị `Value` (REG_SZ, "Allow" hay "Deny") của một khóa dưới HKCU; `None` nếu không đọc được.
fn consent_value(path: &str) -> Option<String> {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_SZ, RegGetValueW};
    use windows::core::w;
    let mut buf = [0u16; 64];
    let mut size = std::mem::size_of_val(&buf) as u32;
    // SAFETY: `buf` và `size` sống suốt lời gọi; `size` là số byte của `buf`.
    let rc = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            &HSTRING::from(path),
            w!("Value"),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if rc != ERROR_SUCCESS {
        return None;
    }
    let len = (size as usize / 2).saturating_sub(1);
    Some(String::from_utf16_lossy(&buf[..len]))
}

fn open_device(enumerator: &IMMDeviceEnumerator, endpoint: &Endpoint) -> Result<IMMDevice> {
    Ok(match endpoint {
        Endpoint::Default(role) => unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role.erole())? },
        Endpoint::Device(id) => unsafe { enumerator.GetDevice(&HSTRING::from(id.as_str()))? },
    })
}

fn open_target(enumerator: &IMMDeviceEnumerator, target: &Target) -> Result<IMMDevice> {
    Ok(match target {
        Target::Loopback(endpoint) => open_device(enumerator, endpoint)?,
        Target::Mic(MicEndpoint::Default) => unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)? },
        Target::Mic(MicEndpoint::Device(id)) => unsafe { enumerator.GetDevice(&HSTRING::from(id.as_str()))? },
    })
}

impl Wasapi {
    fn new(target: Target, stats: Arc<CaptureStats>) -> Self {
        Self {
            target,
            format: AudioFormat {
                sample_rate: 0,
                channels: 0,
            },
            stats,
            stop: Arc::new(AtomicBool::new(false)),
            failed: Arc::new(AtomicBool::new(false)),
            thread: None,
        }
    }

    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<AudioFormat, String>>();
        let target = self.target.clone();
        let (stop, failed, stats) = (self.stop.clone(), self.failed.clone(), self.stats.clone());
        self.thread = Some(std::thread::spawn(move || {
            if let Err(e) = capture_thread(&target, sink, stop, stats, &ready_tx) {
                failed.store(true, Ordering::SeqCst);
                let _ = ready_tx.send(Err(format!("{e:#}")));
            }
        }));
        self.format = ready_rx
            .recv_timeout(Duration::from_secs(5))
            .context("luồng thu không phản hồi")?
            .map_err(|e| anyhow!(e))?;
        Ok(())
    }

    fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for Wasapi {
    fn drop(&mut self) {
        self.stop();
    }
}

pub struct LoopbackSource(Wasapi);

impl LoopbackSource {
    pub fn new(endpoint: Endpoint, stats: Arc<CaptureStats>) -> Self {
        Self(Wasapi::new(Target::Loopback(endpoint), stats))
    }
}

impl AudioSource for LoopbackSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        self.0.start(sink)
    }

    fn stop(&mut self) {
        self.0.stop();
    }

    fn format(&self) -> AudioFormat {
        self.0.format
    }

    fn failed(&self) -> bool {
        self.0.failed.load(Ordering::SeqCst)
    }
}

/// Nguồn micro (spec 2026-10-24-nguon-micro §5.2): WASAPI shared mode trên endpoint thu, không cờ loopback.
pub struct InputSource(Wasapi);

impl InputSource {
    pub fn new(endpoint: MicEndpoint, stats: Arc<CaptureStats>) -> Self {
        Self(Wasapi::new(Target::Mic(endpoint), stats))
    }
}

impl AudioSource for InputSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        self.0.start(sink)
    }

    fn stop(&mut self) {
        self.0.stop();
    }

    fn format(&self) -> AudioFormat {
        self.0.format
    }

    fn failed(&self) -> bool {
        self.0.failed.load(Ordering::SeqCst)
    }
}

/// Số byte phần mở rộng của `WAVEFORMATEXTENSIBLE` sau `WAVEFORMATEX` (`cbSize`).
const EXTENSIBLE_CB_SIZE: u16 = (size_of::<WAVEFORMATEXTENSIBLE>() - size_of::<WAVEFORMATEX>()) as u16;

/// Định dạng float32 xin WASAPI, cùng tần số và số kênh với định dạng mix; WASAPI tự đổi định dạng nếu cần. Luôn dùng
/// `WAVEFORMATEXTENSIBLE`: `WAVEFORMATEX` thường chỉ hợp lệ tới 2 kênh, nên micro mảng 4 kênh (Intel Smart Sound) hay loa
/// 5.1 bị `Initialize` từ chối bằng `E_INVALIDARG` (0.2.10). `mask` là `dwChannelMask` của định dạng mix nếu có.
fn float_format(rate: u32, channels: u16, mask: Option<u32>) -> WAVEFORMATEXTENSIBLE {
    let mask = mask.unwrap_or(match channels {
        1 => SPEAKER_FRONT_CENTER,
        2 => SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT,
        // Không gán loa nào cho kênh (KSAUDIO_SPEAKER_DIRECTOUT): hợp lệ với mọi số kênh.
        _ => 0,
    });
    WAVEFORMATEXTENSIBLE {
        Format: WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_EXTENSIBLE as u16,
            nChannels: channels,
            nSamplesPerSec: rate,
            nAvgBytesPerSec: rate * channels as u32 * 4,
            nBlockAlign: channels * 4,
            wBitsPerSample: 32,
            cbSize: EXTENSIBLE_CB_SIZE,
        },
        Samples: WAVEFORMATEXTENSIBLE_0 {
            wValidBitsPerSample: 32,
        },
        dwChannelMask: mask,
        SubFormat: KSDATAFORMAT_SUBTYPE_IEEE_FLOAT,
    }
}

fn capture_thread(
    target: &Target,
    mut sink: rtrb::Producer<f32>,
    stop: Arc<AtomicBool>,
    stats: Arc<CaptureStats>,
    ready: &mpsc::Sender<Result<AudioFormat, String>>,
) -> Result<()> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = open_target(&enumerator, target)?;
        let client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None)? };

        let mix = unsafe { client.GetMixFormat()? };
        // SAFETY: `mix` do `GetMixFormat` cấp, hợp lệ tới `CoTaskMemFree`; phần mở rộng chỉ đọc khi tag và `cbSize` nói có.
        let (rate, channels, mask) = unsafe {
            let m = std::ptr::read_unaligned(mix);
            let extensible = m.wFormatTag as u32 == WAVE_FORMAT_EXTENSIBLE && m.cbSize >= EXTENSIBLE_CB_SIZE;
            let mask = extensible.then(|| std::ptr::read_unaligned(mix.cast::<WAVEFORMATEXTENSIBLE>()).dwChannelMask);
            (m.nSamplesPerSec, m.nChannels, mask)
        };
        unsafe { CoTaskMemFree(Some(mix as *const _)) };
        let wanted = float_format(rate, channels, mask);
        let mut flags = AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
        if matches!(target, Target::Loopback(_)) {
            flags |= AUDCLNT_STREAMFLAGS_LOOPBACK;
        }
        unsafe {
            client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                flags,
                1_000_000,
                0,
                (&raw const wanted).cast(),
                None,
            )?
        };
        let capture: IAudioCaptureClient = unsafe { client.GetService()? };
        unsafe { client.Start()? };
        let _ = ready.send(Ok(AudioFormat {
            sample_rate: rate,
            channels,
        }));

        let channels = channels as usize;
        let mut gaps = GapFiller::new(rate);
        let push_silence = |sink: &mut rtrb::Producer<f32>, frames: u32| {
            for _ in 0..frames as usize * channels {
                if sink.push(0.0).is_err() {
                    stats.dropped.fetch_add(1, Ordering::Relaxed);
                }
            }
            stats.silence_inserted.fetch_add(frames as u64, Ordering::Relaxed);
        };

        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(10));
            let mut got_packet = false;
            while unsafe { capture.GetNextPacketSize()? } > 0 {
                let mut data = std::ptr::null_mut();
                let mut frames = 0u32;
                let mut buffer_flags = 0u32;
                let mut qpc = 0u64;
                unsafe { capture.GetBuffer(&mut data, &mut frames, &mut buffer_flags, None, Some(&mut qpc))? };
                let action = gaps.on_packet(qpc, frames);
                if action.silence_before > 0 {
                    push_silence(&mut sink, action.silence_before);
                }
                let keep = frames - action.skip;
                if buffer_flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                    for _ in 0..keep as usize * channels {
                        let _ = sink.push(0.0);
                    }
                } else {
                    let samples = unsafe { std::slice::from_raw_parts(data as *const f32, frames as usize * channels) };
                    for &s in &samples[action.skip as usize * channels..] {
                        if sink.push(s).is_err() {
                            stats.dropped.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
                unsafe { capture.ReleaseBuffer(frames)? };
                stats.frames.fetch_add(keep as u64, Ordering::Relaxed);
                stats.skipped.fetch_add(action.skip as u64, Ordering::Relaxed);
                got_packet = true;
            }
            if !got_packet {
                let silence = gaps.on_idle(qpc_now_hns()?);
                if silence > 0 {
                    push_silence(&mut sink, silence);
                }
            }
        }
        unsafe { client.Stop()? };
        Ok(())
    })
}

/// Thời điểm hiện tại theo QPC, đơn vị 100 ns (cùng đơn vị với `GetBuffer`).
fn qpc_now_hns() -> Result<u64> {
    let (mut counter, mut freq) = (0i64, 0i64);
    unsafe {
        QueryPerformanceCounter(&mut counter)?;
        QueryPerformanceFrequency(&mut freq)?;
    }
    Ok((counter as u128 * 10_000_000 / freq as u128) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cần Windows có thiết bị phát: danh sách không lỗi, và thiết bị mặc định nằm trong danh sách.
    #[test]
    #[ignore = "cần máy Windows có thiết bị phát"]
    fn the_default_device_is_listed() {
        let devices = list_render_devices().unwrap();
        let default = default_endpoint_id(Role::Console).unwrap();
        assert!(devices.iter().any(|d| d.id == default), "{devices:?}");
    }

    /// Định dạng xin WASAPI luôn là `WAVEFORMATEXTENSIBLE` float32 đủ phần mở rộng, kể cả khi hơn 2 kênh (micro mảng 4
    /// kênh bị `E_INVALIDARG` ở 0.2.10 khi xin `WAVEFORMATEX` thường).
    #[test]
    fn the_requested_format_is_extensible_float() {
        for (channels, mix_mask, mask) in [(1, None, 0x4), (2, None, 0x3), (4, None, 0), (4, Some(0x33), 0x33)] {
            let f = float_format(48_000, channels, mix_mask);
            assert_eq!({ f.Format.wFormatTag } as u32, WAVE_FORMAT_EXTENSIBLE);
            assert_eq!({ f.Format.cbSize }, 22);
            assert_eq!({ f.Format.nChannels }, channels);
            assert_eq!({ f.Format.nBlockAlign }, channels * 4);
            assert_eq!({ f.Format.nAvgBytesPerSec }, 48_000 * channels as u32 * 4);
            assert_eq!(unsafe { f.Samples.wValidBitsPerSample }, 32);
            assert_eq!({ f.dwChannelMask }, mask);
            assert_eq!({ f.SubFormat }, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
        }
    }

    /// Cần Windows có micro: mọi micro đang hoạt động mở được (khởi tạo WASAPI rồi dừng ngay).
    #[test]
    #[ignore = "cần máy Windows có micro"]
    fn every_active_mic_opens() {
        for device in list_capture_devices().unwrap() {
            let (ready, _) = mpsc::channel();
            let (sink, _source) = rtrb::RingBuffer::<f32>::new(48_000);
            let stop = Arc::new(AtomicBool::new(true));
            let target = Target::Mic(MicEndpoint::Device(device.id.clone()));
            let result = capture_thread(&target, sink, stop, Arc::new(CaptureStats::default()), &ready);
            assert!(result.is_ok(), "{}: {result:?}", device.name);
        }
    }
}
