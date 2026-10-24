//! Thu micro trên macOS (spec 2026-10-24-nguon-micro §5.1). IO proc chạy thẳng trên thiết bị vào: cùng cách đọc mẫu với
//! aggregate device của tap (`macos::on_io`), nhưng không có tap, nên code tap không đổi.
//!
//! Quyền: lần đầu `AudioDeviceStart` trên micro, macOS hỏi quyền Micro theo `NSMicrophoneUsageDescription`. App ký với
//! hardened runtime phải có entitlement `com.apple.security.device.audio-input` (app đã có). Trạng thái quyền đọc qua
//! `AVCaptureDevice` ([`mic_permission`]).

use crate::macos::{IoBlock, IoState, check, get_property, input_layout, nominal_sample_rate, on_io};
use crate::{AudioFormat, AudioSource, CaptureStats, InputDevice, MicPermission, Transport};
use anyhow::{Result, anyhow, bail};
use block2::RcBlock;
use objc2_core_audio::{
    AudioDeviceCreateIOProcIDWithBlock, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID, AudioDeviceStart,
    AudioDeviceStop, AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectID,
    AudioObjectPropertyAddress, kAudioDevicePropertyDeviceIsAlive, kAudioDevicePropertyDeviceUID,
    kAudioDevicePropertyTransportType, kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE,
    kAudioDeviceTransportTypeBuiltIn, kAudioDeviceTransportTypeUSB, kAudioDeviceTransportTypeVirtual,
    kAudioHardwarePropertyDefaultInputDevice, kAudioHardwarePropertyDevices, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyName, kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject,
};
use objc2_core_audio_types::{AudioBufferList, AudioTimeStamp};
use objc2_core_foundation::{CFRetained, CFString};
use std::cell::UnsafeCell;
use std::ptr::NonNull;
use std::sync::Arc;
use std::time::Duration;

/// Micro cần thu.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MicTarget {
    /// Micro mặc định của hệ thống, đọc lúc `start`.
    Default,
    /// Micro theo UID (`kAudioDevicePropertyDeviceUID`).
    Uid(String),
}

pub struct MacInputSource {
    target: MicTarget,
    device: AudioObjectID,
    proc_id: AudioDeviceIOProcID,
    format: AudioFormat,
    stats: Arc<CaptureStats>,
    block: Option<IoBlock>,
}

impl MacInputSource {
    pub fn new(target: MicTarget, stats: Arc<CaptureStats>) -> Self {
        Self {
            target,
            device: 0,
            proc_id: None,
            format: AudioFormat {
                sample_rate: 0,
                channels: 0,
            },
            stats,
            block: None,
        }
    }
}

impl AudioSource for MacInputSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let device = match &self.target {
            MicTarget::Default => default_input_device()?,
            MicTarget::Uid(uid) => device_by_uid(uid)?,
        };
        let rate = nominal_sample_rate(device)?;
        let (non_interleaved, channels, per_buffer, buffers) = mic_layout(&input_layout(device)?)?;
        let io = Arc::new(IoState {
            producer: UnsafeCell::new(sink),
            non_interleaved,
            channels,
            per_buffer,
            buffers,
            stats: self.stats.clone(),
        });
        let block: IoBlock = RcBlock::new(
            move |_now: NonNull<AudioTimeStamp>,
                  input: NonNull<AudioBufferList>,
                  _input_time: NonNull<AudioTimeStamp>,
                  _output: NonNull<AudioBufferList>,
                  _output_time: NonNull<AudioTimeStamp>| {
                // SAFETY: chỉ luồng IO của Core Audio gọi khối này.
                unsafe { on_io(&io, input) };
            },
        );
        let mut proc_id: AudioDeviceIOProcID = None;
        check(
            unsafe {
                AudioDeviceCreateIOProcIDWithBlock(NonNull::from(&mut proc_id), device, None, RcBlock::as_ptr(&block))
            },
            "AudioDeviceCreateIOProcIDWithBlock",
        )?;
        self.device = device;
        self.proc_id = proc_id;
        self.block = Some(block);
        self.format = AudioFormat {
            sample_rate: rate.round() as u32,
            channels: channels as u16,
        };
        check(unsafe { AudioDeviceStart(device, self.proc_id) }, "AudioDeviceStart")
    }

    fn stop(&mut self) {
        if self.device != 0 {
            unsafe {
                AudioDeviceStop(self.device, self.proc_id);
                AudioDeviceDestroyIOProcID(self.device, self.proc_id);
            }
        }
        self.device = 0;
        self.proc_id = None;
        self.block = None;
    }

    fn format(&self) -> AudioFormat {
        self.format
    }

    /// Micro bị rút (USB, Bluetooth): thiết bị không còn "sống", app phải mở lại nguồn (spec §5.6).
    fn failed(&self) -> bool {
        if self.device == 0 {
            return false;
        }
        let mut alive: u32 = 1;
        get_property(
            self.device,
            kAudioDevicePropertyDeviceIsAlive,
            std::ptr::null(),
            0,
            &mut alive,
        )
        .is_err()
            || alive == 0
    }
}

impl Drop for MacInputSource {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Cách đọc buffer của IO proc từ bố cục luồng vào (`input_layout`): `(tách kênh, số kênh, số kênh mỗi buffer, số
/// buffer)`. Hỗ trợ một luồng nhiều kênh xen kẽ, hay nhiều luồng mỗi luồng một kênh; bố cục khác thì báo lỗi.
pub(crate) fn mic_layout(layout: &[u32]) -> Result<(bool, usize, u32, usize)> {
    match layout {
        [] | [0] => bail!("thiết bị không có luồng vào"),
        [n] => Ok((false, *n as usize, *n, 1)),
        many if many.iter().all(|&c| c == 1) => Ok((true, many.len(), 1, many.len())),
        other => bail!("bố cục luồng vào chưa hỗ trợ: {other:?}"),
    }
}

/// Micro mặc định của hệ thống.
pub fn default_input_device() -> Result<AudioObjectID> {
    let mut id: AudioObjectID = 0;
    get_property(
        kAudioObjectSystemObject as AudioObjectID,
        kAudioHardwarePropertyDefaultInputDevice,
        std::ptr::null(),
        0,
        &mut id,
    )?;
    if id == 0 {
        bail!("máy không có micro mặc định");
    }
    Ok(id)
}

/// Mọi thiết bị âm thanh (cả thiết bị chỉ phát).
fn all_devices() -> Result<Vec<AudioObjectID>> {
    let system = kAudioObjectSystemObject as AudioObjectID;
    let mut address = AudioObjectPropertyAddress {
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    };
    let mut size = 0u32;
    check(
        unsafe {
            AudioObjectGetPropertyDataSize(
                system,
                NonNull::from(&mut address),
                0,
                std::ptr::null(),
                NonNull::from(&mut size),
            )
        },
        "AudioObjectGetPropertyDataSize",
    )?;
    let mut ids = vec![0 as AudioObjectID; size as usize / size_of::<AudioObjectID>()];
    if !ids.is_empty() {
        check(
            unsafe {
                AudioObjectGetPropertyData(
                    system,
                    NonNull::from(&mut address),
                    0,
                    std::ptr::null(),
                    NonNull::from(&mut size),
                    NonNull::from(ids.as_mut_slice()).cast(),
                )
            },
            "AudioObjectGetPropertyData",
        )?;
        ids.truncate(size as usize / size_of::<AudioObjectID>());
    }
    Ok(ids)
}

/// Thuộc tính kiểu CFString của một đối tượng Core Audio.
fn string_property(object: AudioObjectID, selector: u32) -> Option<String> {
    let mut value: *const CFString = std::ptr::null();
    get_property(object, selector, std::ptr::null(), 0, &mut value).ok()?;
    // SAFETY: Core Audio trả một CFString đã retain (+1); `CFRetained` nhận quyền sở hữu và release khi xong.
    NonNull::new(value.cast_mut()).map(|p| unsafe { CFRetained::from_raw(p) }.to_string())
}

fn transport(device: AudioObjectID) -> Transport {
    let mut kind: u32 = 0;
    if get_property(
        device,
        kAudioDevicePropertyTransportType,
        std::ptr::null(),
        0,
        &mut kind,
    )
    .is_err()
    {
        return Transport::Other;
    }
    if kind == kAudioDeviceTransportTypeBuiltIn {
        Transport::BuiltIn
    } else if kind == kAudioDeviceTransportTypeUSB {
        Transport::Usb
    } else if kind == kAudioDeviceTransportTypeBluetooth || kind == kAudioDeviceTransportTypeBluetoothLE {
        Transport::Bluetooth
    } else if kind == kAudioDeviceTransportTypeVirtual {
        Transport::Virtual
    } else {
        Transport::Other
    }
}

/// Các thiết bị có luồng vào, kèm tên và loại kết nối.
pub fn list_capture_devices() -> Result<Vec<InputDevice>> {
    objc2::rc::autoreleasepool(|_| {
        let default = default_input_device().ok();
        let mut out = Vec::new();
        for id in all_devices()? {
            let channels: u32 = input_layout(id).unwrap_or_default().iter().sum();
            if channels == 0 {
                continue;
            }
            let Some(uid) = string_property(id, kAudioDevicePropertyDeviceUID) else {
                continue;
            };
            out.push(InputDevice {
                id: uid,
                name: string_property(id, kAudioObjectPropertyName).unwrap_or_default(),
                transport: transport(id),
                is_default: Some(id) == default,
            });
        }
        Ok(out)
    })
}

fn device_by_uid(uid: &str) -> Result<AudioObjectID> {
    for id in all_devices()? {
        if string_property(id, kAudioDevicePropertyDeviceUID).as_deref() == Some(uid) {
            return Ok(id);
        }
    }
    bail!("không tìm thấy micro {uid}")
}

/// Trạng thái quyền micro của app. Chỉ đọc, không hỏi người dùng.
pub fn mic_permission() -> MicPermission {
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    // SAFETY: hằng của AVFoundation, framework được liên kết lúc build.
    let Some(audio) = (unsafe { AVMediaTypeAudio }) else {
        return MicPermission::Undetermined;
    };
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) } {
        AVAuthorizationStatus::Authorized => MicPermission::Granted,
        AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => MicPermission::Denied,
        _ => MicPermission::Undetermined,
    }
}

/// Xin quyền micro: macOS hiện hộp thoại nếu chưa hỏi lần nào; đã trả lời rồi thì trả ngay kết quả cũ. Chờ tối đa `wait`.
pub fn request_mic_permission(wait: Duration) -> Result<bool> {
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeAudio};
    // SAFETY: như `mic_permission`.
    let Some(audio) = (unsafe { AVMediaTypeAudio }) else {
        bail!("không đọc được AVMediaTypeAudio");
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let handler = RcBlock::new(move |granted: Bool| {
        let _ = tx.send(granted.as_bool());
    });
    // SAFETY: AVFoundation giữ (copy) khối tới khi gọi xong; khối chỉ gửi qua kênh, gọi từ hàng đợi nào cũng được.
    unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(audio, &handler) };
    rx.recv_timeout(wait)
        .map_err(|_| anyhow!("không có trả lời sau {wait:?}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_interleaved_stream() {
        assert_eq!(mic_layout(&[2]).unwrap(), (false, 2, 2, 1));
        assert_eq!(mic_layout(&[1]).unwrap(), (false, 1, 1, 1));
    }

    #[test]
    fn several_mono_streams_are_read_as_separate_channels() {
        assert_eq!(mic_layout(&[1, 1, 1]).unwrap(), (true, 3, 1, 3));
    }

    #[test]
    fn no_input_or_mixed_layouts_are_rejected() {
        assert!(mic_layout(&[]).is_err());
        assert!(mic_layout(&[0]).is_err());
        assert!(mic_layout(&[2, 1]).is_err());
    }

    /// Đọc danh sách micro của máy thật; không mở micro nên không hỏi quyền.
    #[test]
    #[ignore = "đọc thiết bị âm thanh của máy thật"]
    fn the_default_mic_is_listed() {
        let devices = list_capture_devices().unwrap();
        assert!(devices.iter().filter(|d| d.is_default).count() <= 1, "{devices:?}");
        if default_input_device().is_ok() {
            assert!(devices.iter().any(|d| d.is_default), "{devices:?}");
        }
        assert!(crate::default_input_signature().is_some_and(|s| s.contains('@')));
        println!("{devices:?}");
    }
}
