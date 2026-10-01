//! WASAPI shared-mode endpoint loopback (spec §6.1). Code của kế hoạch 0-04, Task 7, thêm: chọn thiết bị theo id (người
//! dùng chọn tay), liệt kê thiết bị phát, và cờ `failed` khi luồng thu chết (thiết bị bị rút: `AUDCLNT_E_DEVICE_INVALIDATED`).
//!
//! Đọc theo timer 10 ms, không chờ sự kiện, vì loopback không báo sự kiện khi không có gì phát.
//! Khoảng trống được chèn im lặng theo đồng hồ QPC (`GapFiller`).

use crate::gapfill::GapFiller;
use crate::{AudioFormat, AudioSource, CaptureStats};
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
    AUDCLNT_STREAMFLAGS_LOOPBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, DEVICE_STATE_ACTIVE, ERole,
    IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, WAVEFORMATEX,
    eCommunications, eConsole, eRender,
};
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
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

pub struct LoopbackSource {
    endpoint: Endpoint,
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

/// Các thiết bị phát đang hoạt động, kèm tên hiển thị.
pub fn list_render_devices() -> Result<Vec<RenderDevice>> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let collection = unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)? };
        let mut devices = Vec::new();
        for i in 0..unsafe { collection.GetCount()? } {
            let device = unsafe { collection.Item(i)? };
            let id = pwstr_to_string(unsafe { device.GetId()? })?;
            let store = unsafe { device.OpenPropertyStore(STGM_READ)? };
            let name = unsafe { store.GetValue(&PKEY_Device_FriendlyName)? }.to_string();
            devices.push(RenderDevice { id, name });
        }
        Ok(devices)
    })
}

fn open_device(enumerator: &IMMDeviceEnumerator, endpoint: &Endpoint) -> Result<IMMDevice> {
    Ok(match endpoint {
        Endpoint::Default(role) => unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role.erole())? },
        Endpoint::Device(id) => unsafe { enumerator.GetDevice(&HSTRING::from(id.as_str()))? },
    })
}

impl LoopbackSource {
    pub fn new(endpoint: Endpoint, stats: Arc<CaptureStats>) -> Self {
        Self {
            endpoint,
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
}

impl AudioSource for LoopbackSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<AudioFormat, String>>();
        let endpoint = self.endpoint.clone();
        let (stop, failed, stats) = (self.stop.clone(), self.failed.clone(), self.stats.clone());
        self.thread = Some(std::thread::spawn(move || {
            if let Err(e) = capture_thread(&endpoint, sink, stop, stats, &ready_tx) {
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

    fn format(&self) -> AudioFormat {
        self.format
    }

    fn failed(&self) -> bool {
        self.failed.load(Ordering::SeqCst)
    }
}

impl Drop for LoopbackSource {
    fn drop(&mut self) {
        self.stop();
    }
}

fn capture_thread(
    endpoint: &Endpoint,
    mut sink: rtrb::Producer<f32>,
    stop: Arc<AtomicBool>,
    stats: Arc<CaptureStats>,
    ready: &mpsc::Sender<Result<AudioFormat, String>>,
) -> Result<()> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = open_device(&enumerator, endpoint)?;
        let client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None)? };

        let mix = unsafe { client.GetMixFormat()? };
        let (rate, channels) = unsafe { ((*mix).nSamplesPerSec, (*mix).nChannels) };
        unsafe { CoTaskMemFree(Some(mix as *const _)) };
        // Xin float32 ở cùng tần số và số kênh; WASAPI tự đổi định dạng nếu cần.
        let wanted = WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
            nChannels: channels,
            nSamplesPerSec: rate,
            nAvgBytesPerSec: rate * channels as u32 * 4,
            nBlockAlign: channels * 4,
            wBitsPerSample: 32,
            cbSize: 0,
        };
        let flags =
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
        unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 1_000_000, 0, &wanted, None)? };
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
}
