//! Core Audio process tap, macOS 14.2 trở lên (spec §6.1).
//!
//! Tạo tap, gắn tap vào một aggregate device riêng tư (chỉ chứa tap), rồi đọc mẫu qua IO block.
//!
//! `start` có thể chờ lâu mà chưa trả về:
//! - lần đầu, macOS hiện hộp thoại xin quyền "Ghi âm thanh hệ thống" và chờ người dùng trả lời;
//! - aggregate đặt `tapautostart`, nên `AudioDeviceStart` chờ tới khi có app bắt đầu phát tiếng.
//!
//! Nếu chưa được cấp quyền, tap chỉ trả im lặng (chưa kiểm; dòng 2 của Task 6 sẽ cho biết).

use crate::{AudioFormat, AudioSource, CaptureStats};
use anyhow::{Result, bail};
use block2::RcBlock;
use objc2::AllocAnyThread;
use objc2::rc::Retained;
use objc2_core_audio::{
    AudioDeviceCreateIOProcIDWithBlock, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID, AudioDeviceStart,
    AudioDeviceStop, AudioHardwareCreateAggregateDevice, AudioHardwareCreateProcessTap,
    AudioHardwareDestroyAggregateDevice, AudioHardwareDestroyProcessTap, AudioObjectGetPropertyData,
    AudioObjectGetPropertyDataSize, AudioObjectID, AudioObjectPropertyAddress, CATapDescription, CATapMuteBehavior,
    kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceIsStackedKey, kAudioAggregateDeviceNameKey,
    kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey,
    kAudioDevicePropertyStreamConfiguration, kAudioHardwarePropertyTranslatePIDToProcessObject,
    kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeInput,
    kAudioObjectSystemObject, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
};
use objc2_core_audio_types::{
    AudioBuffer, AudioBufferList, AudioStreamBasicDescription, AudioTimeStamp, kAudioFormatFlagIsFloat,
    kAudioFormatFlagIsNonInterleaved,
};
use objc2_core_foundation::{CFArray, CFBoolean, CFDictionary, CFString, CFType};
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
    /// Số kênh mỗi buffer: 1 nếu tách kênh, `channels` nếu xen kẽ.
    per_buffer: u32,
    /// Số buffer IO block phải nhận: `channels` nếu tách kênh, 1 nếu xen kẽ.
    buffers: usize,
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
        if asbd.mChannelsPerFrame == 0 || asbd.mSampleRate <= 0.0 {
            bail!("định dạng tap không hợp lệ (số kênh hoặc tần số bằng 0): {asbd:?}");
        }
        self.format = AudioFormat {
            sample_rate: asbd.mSampleRate.round() as u32,
            channels: asbd.mChannelsPerFrame as u16,
        };

        self.aggregate_id = create_aggregate_device(&tap_uid)?;

        let non_interleaved = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0;
        let channels = asbd.mChannelsPerFrame as usize;
        let (buffers, per_buffer) = tap_layout(non_interleaved, channels);
        // IO block nhận mọi luồng vào của aggregate. Nếu có luồng nào ngoài tap thì dừng với
        // thông báo rõ, thay vì ghi dữ liệu sai vào WAV. Không đọc được bố cục, hoặc bố cục rỗng:
        // bỏ qua phép kiểm này; on_io vẫn từ chối từng lượt không khớp và đếm vào `rejected_cycles`.
        let layout = input_layout(self.aggregate_id).unwrap_or_default();
        if !layout.is_empty() && layout != vec![per_buffer; buffers] {
            bail!("luồng vào của aggregate là {layout:?} (số kênh mỗi buffer), không khớp tap: {asbd:?}");
        }
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

/// Chạy trên luồng IO: không cấp phát, không lock. Mỗi lần ghi một chunk gồm trọn các khung,
/// nên bên đọc không bao giờ thấy nửa khung; ring buffer đầy thì bỏ cả lượt.
unsafe fn on_io(io: &IoState, input: NonNull<AudioBufferList>) {
    let list = input.as_ptr();
    // Đọc mBuffers qua con trỏ gốc: mảng thật dài mNumberBuffers, không phải [AudioBuffer; 1].
    let count = unsafe { (*list).mNumberBuffers } as usize;
    let first = unsafe { &raw const (*list).mBuffers }.cast::<AudioBuffer>();
    let buffers = unsafe { std::slice::from_raw_parts(first, count) };
    if buffers.len() != io.buffers
        || buffers
            .iter()
            .any(|b| b.mData.is_null() || b.mNumberChannels != io.per_buffer)
    {
        // Kể cả lượt không có buffer nào (samples = 0): vẫn đếm là một lượt bị từ chối.
        let samples: u64 = buffers.iter().map(|b| b.mDataByteSize as u64 / 4).sum();
        io.stats.dropped.fetch_add(samples, Ordering::Relaxed);
        io.stats.rejected_cycles.fetch_add(1, Ordering::Relaxed);
        return;
    }
    let frames = buffers
        .iter()
        .map(|b| b.mDataByteSize as usize / 4 / io.per_buffer as usize)
        .min()
        .unwrap_or(0);
    let samples = frames * io.channels;
    let producer = unsafe { &mut *io.producer.get() };
    match producer.write_chunk_uninit(samples) {
        Ok(chunk) => {
            if io.non_interleaved {
                // SAFETY: mỗi buffer có ít nhất `frames` mẫu (min ở trên).
                chunk.fill_from_iter(
                    (0..frames).flat_map(|i| buffers.iter().map(move |b| unsafe { *b.mData.cast::<f32>().add(i) })),
                );
            } else {
                let data = unsafe { std::slice::from_raw_parts(buffers[0].mData.cast::<f32>(), samples) };
                chunk.fill_from_iter(data.iter().copied());
            }
        }
        Err(_) => {
            io.stats.dropped.fetch_add(samples as u64, Ordering::Relaxed);
        }
    }
    io.stats.frames.fetch_add(frames as u64, Ordering::Relaxed);
}

/// Bố cục buffer mà IO block nhận từ một tap: (số buffer, số kênh mỗi buffer).
/// Dạng tách kênh: mỗi kênh một buffer. Dạng xen kẽ: một buffer chứa mọi kênh.
fn tap_layout(non_interleaved: bool, channels: usize) -> (usize, u32) {
    if non_interleaved {
        (channels, 1)
    } else {
        (1, channels as u32)
    }
}

/// Số kênh của từng buffer vào mà IO proc của `device` sẽ nhận.
fn input_layout(device: AudioObjectID) -> Result<Vec<u32>> {
    let mut address = AudioObjectPropertyAddress {
        mSelector: kAudioDevicePropertyStreamConfiguration,
        mScope: kAudioObjectPropertyScopeInput,
        mElement: kAudioObjectPropertyElementMain,
    };
    let mut size = 0u32;
    check(
        unsafe {
            AudioObjectGetPropertyDataSize(
                device,
                NonNull::from(&mut address),
                0,
                std::ptr::null(),
                NonNull::from(&mut size),
            )
        },
        "AudioObjectGetPropertyDataSize",
    )?;
    // Vec<u64> để vùng nhớ căn 8 byte như AudioBufferList.
    let mut raw = vec![0u64; (size as usize).div_ceil(8).max(1)];
    check(
        unsafe {
            AudioObjectGetPropertyData(
                device,
                NonNull::from(&mut address),
                0,
                std::ptr::null(),
                NonNull::from(&mut size),
                NonNull::from(raw.as_mut_slice()).cast(),
            )
        },
        "AudioObjectGetPropertyData",
    )?;
    let list = raw.as_ptr().cast::<AudioBufferList>();
    let count = unsafe { (*list).mNumberBuffers } as usize;
    let fits = (raw.len() * 8).saturating_sub(8) / size_of::<AudioBuffer>();
    let first = unsafe { &raw const (*list).mBuffers }.cast::<AudioBuffer>();
    Ok((0..count.min(fits))
        .map(|i| unsafe { (*first.add(i)).mNumberChannels })
        .collect())
}

fn create_aggregate_device(tap_uid: &str) -> Result<AudioObjectID> {
    let key = |k: &CStr| CFString::from_str(k.to_str().expect("khóa ASCII"));
    let aggregate_uid = CFString::from_str(&format!("meeting-translator.tap.{tap_uid}"));
    let name = CFString::from_str("Meeting Translator Tap");
    let tap_uid = CFString::from_str(tap_uid);

    let sub_tap_values: [&CFType; 2] = [&tap_uid, CFBoolean::new(true)];
    let sub_tap = CFDictionary::<CFString, CFType>::from_slices(
        &[&key(kAudioSubTapUIDKey), &key(kAudioSubTapDriftCompensationKey)],
        &sub_tap_values,
    );
    let taps = CFArray::from_objects(&[sub_tap.as_opaque()]);

    // Chỉ có tap, không có sub-device: nếu thiết bị ra có micro (AirPods, tai nghe USB),
    // aggregate sẽ không bật micro đó và IO block chỉ nhận luồng của tap.
    let keys = [
        key(kAudioAggregateDeviceNameKey),
        key(kAudioAggregateDeviceUIDKey),
        key(kAudioAggregateDeviceIsPrivateKey),
        key(kAudioAggregateDeviceIsStackedKey),
        key(kAudioAggregateDeviceTapAutoStartKey),
        key(kAudioAggregateDeviceTapListKey),
    ];
    let values: [&CFType; 6] = [
        &name,
        &aggregate_uid,
        CFBoolean::new(true),
        CFBoolean::new(false),
        CFBoolean::new(true),
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

#[cfg(test)]
mod synthetic {
    //! Kiểm on_io bằng AudioBufferList dựng tay trong bộ nhớ. Không gọi Core Audio.
    use super::*;

    fn buf(channels: u32, data: &[f32]) -> AudioBuffer {
        AudioBuffer {
            mNumberChannels: channels,
            mDataByteSize: (data.len() * 4) as u32,
            mData: data.as_ptr() as *mut c_void,
        }
    }

    /// AudioBufferList thật sự có `bufs.len()` phần tử, căn 8 byte như Core Audio.
    fn make_list(bufs: &[AudioBuffer]) -> Vec<u64> {
        let bytes = 8 + bufs.len().max(1) * size_of::<AudioBuffer>();
        let mut raw = vec![0u64; bytes.div_ceil(8)];
        let list = raw.as_mut_ptr().cast::<AudioBufferList>();
        unsafe {
            (*list).mNumberBuffers = bufs.len() as u32;
            let first = (&raw mut (*list).mBuffers).cast::<AudioBuffer>();
            for (i, b) in bufs.iter().enumerate() {
                first.add(i).write(AudioBuffer {
                    mNumberChannels: b.mNumberChannels,
                    mDataByteSize: b.mDataByteSize,
                    mData: b.mData,
                });
            }
        }
        raw
    }

    /// Dựng `IoState` bằng đúng `tap_layout` mà `start()` dùng.
    fn state(non_interleaved: bool, channels: usize, ring: usize) -> (IoState, rtrb::Consumer<f32>) {
        let (p, c) = rtrb::RingBuffer::new(ring);
        let (buffers, per_buffer) = tap_layout(non_interleaved, channels);
        let io = IoState {
            producer: UnsafeCell::new(p),
            non_interleaved,
            channels,
            per_buffer,
            buffers,
            stats: Arc::new(CaptureStats::default()),
        };
        (io, c)
    }

    fn run(io: &IoState, bufs: &[AudioBuffer]) {
        let mut raw = make_list(bufs);
        unsafe { on_io(io, NonNull::new(raw.as_mut_ptr().cast()).unwrap()) };
    }

    fn drain(c: &mut rtrb::Consumer<f32>) -> Vec<f32> {
        let mut v = Vec::new();
        while let Ok(x) = c.pop() {
            v.push(x);
        }
        v
    }

    #[test]
    fn interleaved_stereo_one_buffer() {
        let (io, mut c) = state(false, 2, 64);
        let d = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        run(&io, &[buf(2, &d)]);
        assert_eq!(drain(&mut c), d);
        assert_eq!(io.stats.snapshot(), [3, 0, 0, 0, 0]);
    }

    #[test]
    fn non_interleaved_two_buffers_are_interleaved_in_the_ring() {
        let (io, mut c) = state(true, 2, 64);
        let (l, r) = ([1.0, 2.0, 3.0], [10.0, 20.0, 30.0]);
        run(&io, &[buf(1, &l), buf(1, &r)]);
        assert_eq!(drain(&mut c), [1.0, 10.0, 2.0, 20.0, 3.0, 30.0]);
        assert_eq!(io.stats.snapshot(), [3, 0, 0, 0, 0]);
    }

    #[test]
    fn non_interleaved_uses_the_shortest_buffer_and_never_reads_past_it() {
        let (io, mut c) = state(true, 2, 64);
        let (l, r) = ([1.0, 2.0, 3.0], [10.0, 20.0]);
        run(&io, &[buf(1, &l), buf(1, &r)]);
        assert_eq!(drain(&mut c), [1.0, 10.0, 2.0, 20.0]);
        assert_eq!(io.stats.snapshot()[0], 2);
    }

    #[test]
    fn extra_input_stream_is_rejected_whole() {
        // Aggregate kéo theo luồng thứ hai (micro): không được ghi gì, đếm mẫu rơi.
        let (io, mut c) = state(false, 2, 64);
        let (tap, mic) = ([1.0, 2.0, 3.0, 4.0, 5.0, 6.0], [0.5, 0.5]);
        run(&io, &[buf(2, &tap), buf(1, &mic)]);
        assert!(drain(&mut c).is_empty());
        assert_eq!(io.stats.snapshot(), [0, 0, 0, 8, 1]);
    }

    #[test]
    fn wrong_channel_count_is_rejected() {
        let (io, mut c) = state(false, 2, 64);
        let mono = [1.0, 2.0, 3.0];
        run(&io, &[buf(1, &mono)]);
        assert!(drain(&mut c).is_empty());
        assert_eq!(io.stats.snapshot(), [0, 0, 0, 3, 1]);
    }

    #[test]
    fn null_data_is_rejected() {
        let (io, mut c) = state(false, 2, 64);
        let b = AudioBuffer {
            mNumberChannels: 2,
            mDataByteSize: 24,
            mData: std::ptr::null_mut(),
        };
        run(&io, &[b]);
        assert!(drain(&mut c).is_empty());
        assert_eq!(io.stats.snapshot(), [0, 0, 0, 6, 1]);
    }

    #[test]
    fn full_ring_drops_the_whole_callback_never_half_a_frame() {
        let (io, mut c) = state(false, 2, 4);
        let d = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        run(&io, &[buf(2, &d)]);
        assert!(drain(&mut c).is_empty());
        assert_eq!(io.stats.snapshot(), [3, 0, 0, 6, 0]);
        // Ring còn chỗ cho đúng 2 khung: lượt sau ghi trọn.
        run(&io, &[buf(2, &d[..4])]);
        assert_eq!(drain(&mut c), [1.0, 2.0, 3.0, 4.0]);
    }

    #[test]
    fn empty_and_partial_frame_buffers() {
        let (io, mut c) = state(false, 2, 64);
        run(&io, &[buf(2, &[])]);
        // 3 mẫu, 2 kênh: chỉ 1 khung trọn, mẫu lẻ bỏ.
        let d = [1.0, 2.0, 3.0];
        run(&io, &[buf(2, &d)]);
        assert_eq!(drain(&mut c), [1.0, 2.0]);
        assert_eq!(io.stats.snapshot(), [1, 0, 0, 0, 0]);
    }

    #[test]
    fn zero_buffers_is_rejected() {
        let (io, mut c) = state(false, 2, 64);
        run(&io, &[]);
        assert!(drain(&mut c).is_empty());
        // Không mẫu nào rơi, nhưng lượt này vẫn được đếm là bị từ chối.
        assert_eq!(io.stats.snapshot(), [0, 0, 0, 0, 1]);
    }

    #[test]
    fn review_wraps_around_the_ring_end() {
        // Ring 6 chỗ: ghi 4, đọc 4, ghi tiếp 4 -> chunk vắt qua cuối ring (hai slice).
        let (io, mut c) = state(false, 2, 6);
        run(&io, &[buf(2, &[1.0, 2.0, 3.0, 4.0])]);
        assert_eq!(drain(&mut c), [1.0, 2.0, 3.0, 4.0]);
        run(&io, &[buf(2, &[5.0, 6.0, 7.0, 8.0])]);
        assert_eq!(drain(&mut c), [5.0, 6.0, 7.0, 8.0]);
        let (io, mut c) = state(true, 2, 6);
        run(&io, &[buf(1, &[1.0, 2.0]), buf(1, &[10.0, 20.0])]);
        assert_eq!(drain(&mut c), [1.0, 10.0, 2.0, 20.0]);
        run(&io, &[buf(1, &[3.0, 4.0]), buf(1, &[30.0, 40.0])]);
        assert_eq!(drain(&mut c), [3.0, 30.0, 4.0, 40.0]);
    }

    #[test]
    fn review_non_interleaved_extra_buffer_is_rejected() {
        let (io, mut c) = state(true, 2, 64);
        run(&io, &[buf(1, &[1.0]), buf(1, &[2.0]), buf(1, &[3.0])]);
        assert!(drain(&mut c).is_empty());
        assert_eq!(io.stats.snapshot(), [0, 0, 0, 3, 1]);
    }

    #[test]
    fn review_leftover_samples_are_not_counted_anywhere() {
        // Ghi nhận hành vi hiện tại: mẫu lẻ và phần dư của buffer dài hơn không vào ring, cũng không vào `dropped`.
        let (io, mut c) = state(true, 2, 64);
        run(&io, &[buf(1, &[1.0, 2.0, 3.0]), buf(1, &[10.0, 20.0])]);
        assert_eq!(drain(&mut c).len(), 4);
        assert_eq!(io.stats.snapshot(), [2, 0, 0, 0, 0]);
    }
}
