//! Core Audio process tap, macOS 14.2 trở lên (spec §6.1).
//!
//! Tạo tap, gắn tap vào một aggregate device riêng tư, rồi đọc mẫu qua IO block.
//! Nếu người dùng chưa cấp quyền "Ghi âm thanh hệ thống", tap vẫn chạy nhưng chỉ trả im lặng.

use crate::{AudioFormat, AudioSource, CaptureStats};
use anyhow::{Context, Result, bail};
use block2::RcBlock;
use objc2::AllocAnyThread;
use objc2::rc::Retained;
use objc2_core_audio::{
    AudioDeviceCreateIOProcIDWithBlock, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID, AudioDeviceStart,
    AudioDeviceStop, AudioHardwareCreateAggregateDevice, AudioHardwareCreateProcessTap,
    AudioHardwareDestroyAggregateDevice, AudioHardwareDestroyProcessTap, AudioObjectGetPropertyData, AudioObjectID,
    AudioObjectPropertyAddress, CATapDescription, CATapMuteBehavior, kAudioAggregateDeviceIsPrivateKey,
    kAudioAggregateDeviceIsStackedKey, kAudioAggregateDeviceMainSubDeviceKey, kAudioAggregateDeviceNameKey,
    kAudioAggregateDeviceSubDeviceListKey, kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey,
    kAudioAggregateDeviceUIDKey, kAudioDevicePropertyDeviceUID, kAudioHardwarePropertyDefaultSystemOutputDevice,
    kAudioHardwarePropertyTranslatePIDToProcessObject, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject, kAudioSubDeviceUIDKey, kAudioSubTapDriftCompensationKey,
    kAudioSubTapUIDKey, kAudioTapPropertyFormat,
};
use objc2_core_audio_types::{
    AudioBufferList, AudioStreamBasicDescription, AudioTimeStamp, kAudioFormatFlagIsFloat,
    kAudioFormatFlagIsNonInterleaved,
};
use objc2_core_foundation::{CFArray, CFBoolean, CFDictionary, CFRetained, CFString, CFType};
use objc2_foundation::{NSArray, NSNumber};
use std::cell::UnsafeCell;
use std::ffi::{CStr, c_void};
use std::ptr::NonNull;
use std::sync::Arc;
use std::sync::atomic::Ordering;

#[derive(Clone, Copy, Debug)]
pub enum TapTarget {
    /// Toàn hệ thống, trừ chính app (mặc định, spec §6.1).
    SystemExceptSelf,
    /// Chỉ một app, theo pid.
    Process(i32),
}

type IoBlock = RcBlock<
    dyn Fn(
        NonNull<AudioTimeStamp>,
        NonNull<AudioBufferList>,
        NonNull<AudioTimeStamp>,
        NonNull<AudioBufferList>,
        NonNull<AudioTimeStamp>,
    ),
>;

pub struct MacTapSource {
    target: TapTarget,
    tap_id: AudioObjectID,
    aggregate_id: AudioObjectID,
    proc_id: AudioDeviceIOProcID,
    format: AudioFormat,
    stats: Arc<CaptureStats>,
    block: Option<IoBlock>,
}

/// Trạng thái dùng trong IO block. Chỉ luồng IO của Core Audio chạm vào `producer`.
struct IoState {
    producer: UnsafeCell<rtrb::Producer<f32>>,
    non_interleaved: bool,
    channels: usize,
    stats: Arc<CaptureStats>,
}

// SAFETY: Core Audio gọi IO block tuần tự trên một luồng IO; `producer` không được dùng ở nơi khác.
unsafe impl Send for IoState {}
unsafe impl Sync for IoState {}

impl MacTapSource {
    pub fn new(target: TapTarget, stats: Arc<CaptureStats>) -> Self {
        Self {
            target,
            tap_id: 0,
            aggregate_id: 0,
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

impl AudioSource for MacTapSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let processes: Vec<Retained<NSNumber>> = match self.target {
            // App chưa từng phát âm thanh thì chưa có process object; khi đó không cần loại trừ.
            TapTarget::SystemExceptSelf => process_object(std::process::id() as i32)
                .ok()
                .into_iter()
                .map(NSNumber::new_u32)
                .collect(),
            TapTarget::Process(pid) => vec![NSNumber::new_u32(process_object(pid)?)],
        };
        let list = NSArray::from_retained_slice(&processes);
        let description = unsafe {
            match self.target {
                TapTarget::SystemExceptSelf => {
                    CATapDescription::initStereoGlobalTapButExcludeProcesses(CATapDescription::alloc(), &list)
                }
                TapTarget::Process(_) => {
                    CATapDescription::initStereoMixdownOfProcesses(CATapDescription::alloc(), &list)
                }
            }
        };
        unsafe {
            description.setPrivate(true);
            description.setMuteBehavior(CATapMuteBehavior::Unmuted);
        }
        let tap_uid = unsafe { description.UUID() }.UUIDString().to_string();

        let mut tap_id: AudioObjectID = 0;
        check(
            unsafe { AudioHardwareCreateProcessTap(Some(&description), &mut tap_id) },
            "AudioHardwareCreateProcessTap",
        )?;
        self.tap_id = tap_id;

        let mut asbd: AudioStreamBasicDescription = unsafe { std::mem::zeroed() };
        get_property(tap_id, kAudioTapPropertyFormat, std::ptr::null(), 0, &mut asbd)?;
        if asbd.mFormatFlags & kAudioFormatFlagIsFloat == 0 || asbd.mBitsPerChannel != 32 {
            bail!("định dạng tap không phải float32: {asbd:?}");
        }
        self.format = AudioFormat {
            sample_rate: asbd.mSampleRate as u32,
            channels: asbd.mChannelsPerFrame as u16,
        };

        self.aggregate_id = create_aggregate_device(&tap_uid)?;

        let io = Arc::new(IoState {
            producer: UnsafeCell::new(sink),
            non_interleaved: asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0,
            channels: asbd.mChannelsPerFrame as usize,
            stats: self.stats.clone(),
        });
        let block: IoBlock = RcBlock::new(
            move |_now: NonNull<AudioTimeStamp>,
                  input: NonNull<AudioBufferList>,
                  _input_time: NonNull<AudioTimeStamp>,
                  _output: NonNull<AudioBufferList>,
                  _output_time: NonNull<AudioTimeStamp>| {
                // SAFETY: chỉ luồng IO gọi block này.
                unsafe { on_io(&io, input) };
            },
        );
        let mut proc_id: AudioDeviceIOProcID = None;
        check(
            unsafe {
                AudioDeviceCreateIOProcIDWithBlock(
                    NonNull::from(&mut proc_id),
                    self.aggregate_id,
                    None,
                    RcBlock::as_ptr(&block),
                )
            },
            "AudioDeviceCreateIOProcIDWithBlock",
        )?;
        self.proc_id = proc_id;
        self.block = Some(block);
        check(
            unsafe { AudioDeviceStart(self.aggregate_id, self.proc_id) },
            "AudioDeviceStart",
        )?;
        Ok(())
    }

    fn stop(&mut self) {
        unsafe {
            if self.aggregate_id != 0 {
                AudioDeviceStop(self.aggregate_id, self.proc_id);
                AudioDeviceDestroyIOProcID(self.aggregate_id, self.proc_id);
                AudioHardwareDestroyAggregateDevice(self.aggregate_id);
            }
            if self.tap_id != 0 {
                AudioHardwareDestroyProcessTap(self.tap_id);
            }
        }
        self.aggregate_id = 0;
        self.tap_id = 0;
        self.proc_id = None;
        self.block = None;
    }

    fn format(&self) -> AudioFormat {
        self.format
    }
}

impl Drop for MacTapSource {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Chạy trên luồng IO: không cấp phát, không lock.
unsafe fn on_io(io: &IoState, input: NonNull<AudioBufferList>) {
    let producer = unsafe { &mut *io.producer.get() };
    let list = unsafe { input.as_ref() };
    let buffers = unsafe { std::slice::from_raw_parts(list.mBuffers.as_ptr(), list.mNumberBuffers as usize) };
    let mut dropped = 0u64;
    let frames = if io.non_interleaved {
        let frames = buffers.first().map_or(0, |b| b.mDataByteSize as usize / 4);
        for i in 0..frames {
            for b in buffers {
                let sample = if b.mData.is_null() {
                    0.0
                } else {
                    unsafe { *(b.mData as *const f32).add(i) }
                };
                if producer.push(sample).is_err() {
                    dropped += 1;
                }
            }
        }
        frames
    } else {
        let Some(b) = buffers.first().filter(|b| !b.mData.is_null()) else {
            return;
        };
        let samples = unsafe { std::slice::from_raw_parts(b.mData as *const f32, b.mDataByteSize as usize / 4) };
        for &sample in samples {
            if producer.push(sample).is_err() {
                dropped += 1;
            }
        }
        samples.len() / io.channels.max(1)
    };
    io.stats.frames.fetch_add(frames as u64, Ordering::Relaxed);
    if dropped > 0 {
        io.stats.dropped.fetch_add(dropped, Ordering::Relaxed);
    }
}

fn create_aggregate_device(tap_uid: &str) -> Result<AudioObjectID> {
    let key = |k: &CStr| CFString::from_str(k.to_str().expect("khóa ASCII"));
    let output_uid = default_output_uid()?;
    let aggregate_uid = CFString::from_str(&format!("meeting-translator.tap.{}", std::process::id()));
    let name = CFString::from_str("Meeting Translator Tap");
    let tap_uid = CFString::from_str(tap_uid);

    let sub_device_value: [&CFType; 1] = [&output_uid];
    let sub_device = CFDictionary::<CFString, CFType>::from_slices(&[&key(kAudioSubDeviceUIDKey)], &sub_device_value);
    let sub_tap_values: [&CFType; 2] = [&tap_uid, CFBoolean::new(true)];
    let sub_tap = CFDictionary::<CFString, CFType>::from_slices(
        &[&key(kAudioSubTapUIDKey), &key(kAudioSubTapDriftCompensationKey)],
        &sub_tap_values,
    );
    let sub_devices = CFArray::from_objects(&[sub_device.as_opaque()]);
    let taps = CFArray::from_objects(&[sub_tap.as_opaque()]);

    let keys = [
        key(kAudioAggregateDeviceNameKey),
        key(kAudioAggregateDeviceUIDKey),
        key(kAudioAggregateDeviceMainSubDeviceKey),
        key(kAudioAggregateDeviceIsPrivateKey),
        key(kAudioAggregateDeviceIsStackedKey),
        key(kAudioAggregateDeviceTapAutoStartKey),
        key(kAudioAggregateDeviceSubDeviceListKey),
        key(kAudioAggregateDeviceTapListKey),
    ];
    let values: [&CFType; 8] = [
        &name,
        &aggregate_uid,
        &output_uid,
        CFBoolean::new(true),
        CFBoolean::new(false),
        CFBoolean::new(true),
        sub_devices.as_opaque(),
        taps.as_opaque(),
    ];
    let key_refs: Vec<&CFString> = keys.iter().map(|k| &**k).collect();
    let description = CFDictionary::<CFString, CFType>::from_slices(&key_refs, &values);

    let mut aggregate_id: AudioObjectID = 0;
    check(
        unsafe { AudioHardwareCreateAggregateDevice(description.as_opaque(), NonNull::from(&mut aggregate_id)) },
        "AudioHardwareCreateAggregateDevice",
    )?;
    Ok(aggregate_id)
}

fn default_output_uid() -> Result<CFRetained<CFString>> {
    let mut device: AudioObjectID = 0;
    get_property(
        kAudioObjectSystemObject as AudioObjectID,
        kAudioHardwarePropertyDefaultSystemOutputDevice,
        std::ptr::null(),
        0,
        &mut device,
    )?;
    let mut uid: *const CFString = std::ptr::null();
    get_property(device, kAudioDevicePropertyDeviceUID, std::ptr::null(), 0, &mut uid)?;
    let uid = NonNull::new(uid as *mut CFString).context("thiết bị ra không có UID")?;
    // SAFETY: Core Audio trả CFString đã retain; người gọi chịu trách nhiệm release.
    Ok(unsafe { CFRetained::from_raw(uid) })
}

fn process_object(pid: i32) -> Result<AudioObjectID> {
    let mut id: AudioObjectID = 0;
    get_property(
        kAudioObjectSystemObject as AudioObjectID,
        kAudioHardwarePropertyTranslatePIDToProcessObject,
        (&pid as *const i32).cast(),
        size_of::<i32>() as u32,
        &mut id,
    )?;
    if id == 0 {
        bail!("pid {pid} chưa có process object (chưa từng phát âm thanh)");
    }
    Ok(id)
}

fn get_property<T>(
    object: AudioObjectID,
    selector: u32,
    qualifier: *const c_void,
    qualifier_size: u32,
    out: &mut T,
) -> Result<()> {
    let mut address = AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    };
    let mut size = size_of::<T>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            object,
            NonNull::from(&mut address),
            qualifier_size,
            qualifier,
            NonNull::from(&mut size),
            NonNull::from(out).cast(),
        )
    };
    check(status, "AudioObjectGetPropertyData")
}

fn check(status: i32, what: &str) -> Result<()> {
    if status != 0 {
        let code = status.to_be_bytes();
        let fourcc: String = code
            .iter()
            .map(|&b| if b.is_ascii_graphic() { b as char } else { '.' })
            .collect();
        bail!("{what} lỗi OSStatus {status} ('{fourcc}')");
    }
    Ok(())
}
