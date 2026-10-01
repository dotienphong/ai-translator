//! Core Audio process tap, macOS 14.2 trở lên (spec §6.1).
//!
//! Tạo tap, gắn tap vào một aggregate device riêng tư (chỉ chứa tap), rồi đọc mẫu qua IO block.
//!
//! `start` có thể chờ lâu mà chưa trả về:
//! - lần đầu, macOS hiện hộp thoại xin quyền "Ghi âm thanh hệ thống" và chờ người dùng trả lời;
//! - aggregate đặt `tapautostart`, nên `AudioDeviceStart` chờ tới khi có app bắt đầu phát tiếng.
//!
//! Nếu chưa được cấp quyền, tap chỉ trả im lặng (chưa kiểm; dòng 2 của Task 6 sẽ cho biết).

use crate::{AudioApp, AudioFormat, AudioSource, CaptureStats};
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
    kAudioDevicePropertyNominalSampleRate, kAudioDevicePropertyStreamConfiguration,
    kAudioHardwarePropertyDefaultOutputDevice, kAudioHardwarePropertyProcessObjectList,
    kAudioHardwarePropertyTranslatePIDToProcessObject, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeInput, kAudioObjectSystemObject,
    kAudioProcessPropertyBundleID, kAudioProcessPropertyIsRunningOutput, kAudioProcessPropertyPID,
    kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
};
use objc2_core_audio_types::{
    AudioBuffer, AudioBufferList, AudioStreamBasicDescription, AudioTimeStamp, kAudioFormatFlagIsFloat,
    kAudioFormatFlagIsNonInterleaved,
};
use objc2_core_foundation::{CFArray, CFBoolean, CFDictionary, CFRetained, CFString, CFType};
use objc2_foundation::{NSArray, NSNumber};
use std::cell::UnsafeCell;
use std::ffi::{CStr, c_void};
use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::Arc;
use std::sync::atomic::Ordering;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TapTarget {
    /// Toàn hệ thống, trừ chính app (mặc định, spec §6.1).
    SystemExceptSelf,
    /// Toàn hệ thống, kể cả chính app: chỉ cho bước "Nghe thử" (§4.1 bước 6, Đ16 của kế hoạch 00), khi app tự phát câu mẫu.
    System,
    /// Chỉ một app: mọi tiến trình đang phát tiếng của app đó (`AudioApp::pids`). Trình duyệt và app Electron phát tiếng
    /// từ tiến trình helper, nên một app thường có nhiều pid.
    Processes(Vec<i32>),
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
        let processes: Vec<Retained<NSNumber>> = match &self.target {
            // App chưa từng phát âm thanh thì chưa có process object; khi đó không cần loại trừ.
            TapTarget::SystemExceptSelf => process_object(std::process::id() as i32)
                .ok()
                .into_iter()
                .map(NSNumber::new_u32)
                .collect(),
            TapTarget::System => Vec::new(),
            // Tiến trình vừa thoát thì bỏ qua; chỉ lỗi khi không còn tiến trình nào.
            TapTarget::Processes(pids) => {
                let objects: Vec<_> = pids
                    .iter()
                    .filter_map(|&pid| process_object(pid).ok())
                    .map(NSNumber::new_u32)
                    .collect();
                if objects.is_empty() {
                    bail!("không tiến trình nào trong {pids:?} còn phát âm thanh");
                }
                objects
            }
        };
        let list = NSArray::from_retained_slice(&processes);
        let description = unsafe {
            match self.target {
                TapTarget::SystemExceptSelf | TapTarget::System => {
                    CATapDescription::initStereoGlobalTapButExcludeProcesses(CATapDescription::alloc(), &list)
                }
                TapTarget::Processes(_) => {
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

    /// Chỉ tap một app mà mọi tiến trình của app đó đã thoát: tap không bao giờ có tiếng nữa, app phải mở lại nguồn (khi
    /// app họp mở lại, nó có pid mới). Tap toàn hệ thống không có cách tự báo chết: đổi thiết bị phát được phát hiện qua
    /// `default_output_signature`. Không dùng "không có khung mới trong 2 giây" làm dấu hiệu, vì aggregate đặt
    /// `tapautostart`: không app nào phát tiếng thì IO block không được gọi, dù tap vẫn sống.
    fn failed(&self) -> bool {
        match &self.target {
            TapTarget::Processes(pids) => self.aggregate_id != 0 && !pids.iter().any(|&pid| pid_alive(pid)),
            _ => false,
        }
    }
}

/// Tiến trình `pid` còn tồn tại (kể cả khi không có quyền gửi tín hiệu cho nó).
fn pid_alive(pid: i32) -> bool {
    // SAFETY: tín hiệu 0 chỉ kiểm tiến trình có tồn tại không, không gửi gì.
    let rc = unsafe { libc::kill(pid, 0) };
    rc == 0 || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
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

/// Thiết bị phát mặc định của hệ thống. App hỏi định kỳ để biết thiết bị đã đổi (cắm tai nghe, Bluetooth), rồi khởi tạo
/// lại việc thu (§9). Chỉ đọc thuộc tính của HAL, không cần quyền ghi âm thanh.
pub fn default_output_device() -> Result<AudioObjectID> {
    let mut id: AudioObjectID = 0;
    get_property(
        kAudioObjectSystemObject as AudioObjectID,
        kAudioHardwarePropertyDefaultOutputDevice,
        std::ptr::null(),
        0,
        &mut id,
    )?;
    Ok(id)
}

/// Tần số mẫu danh định của thiết bị. Tai nghe Bluetooth (AirPods) đổi tần số trên cùng thiết bị khi app họp mở micro
/// (chuyển sang chế độ đàm thoại), nên tần số là một phần của dấu hiệu thiết bị (`default_output_signature`).
pub fn nominal_sample_rate(device: AudioObjectID) -> Result<f64> {
    let mut rate: f64 = 0.0;
    get_property(
        device,
        kAudioDevicePropertyNominalSampleRate,
        std::ptr::null(),
        0,
        &mut rate,
    )?;
    Ok(rate)
}

/// Một tiến trình đang phát tiếng, theo Core Audio.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlayingProcess {
    pub pid: i32,
    /// Bundle ID mà Core Audio báo cho tiến trình (helper có bundle ID riêng).
    pub bundle_id: String,
    /// Đường dẫn binary (`proc_pidpath`), nếu đọc được.
    pub path: Option<PathBuf>,
}

/// Tên và bundle ID của một app: theo gói `.app` ngoài cùng (`Info.plist`), hoặc theo `NSRunningApplication`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppIdentity {
    pub name: Option<String>,
    pub bundle_id: Option<String>,
}

/// Gói `.app` ngoài cùng chứa `path`: helper của trình duyệt và app Electron nằm trong gói của app chính (ví dụ
/// `/Applications/Google Chrome.app/Contents/Frameworks/…/Google Chrome Helper.app/…`).
pub fn outer_app(path: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for part in path.components() {
        out.push(part);
        if part.as_os_str().to_string_lossy().ends_with(".app") {
            return Some(out);
        }
    }
    None
}

/// Gộp các tiến trình đang phát tiếng theo gói `.app` ngoài cùng (không có gói thì theo bundle ID), rồi lấy tên và bundle
/// ID của app: trước hết từ chính gói `.app` ngoài cùng (`bundle`), vì `NSRunningApplication` của một helper có thể trả
/// về chính helper (ví dụ `com.google.Chrome.helper`), làm bundle ID đã lưu đổi giữa các lần (Q-F của review 02 lần 2);
/// không có gói thì từ `running` (tìm ở tiến trình đó hoặc tối đa 3 tiến trình cha). Tách riêng khỏi Core Audio để test.
pub fn group_processes(
    processes: &[PlayingProcess],
    bundle: impl Fn(&Path) -> Option<AppIdentity>,
    running: impl Fn(i32) -> Option<AppIdentity>,
) -> Vec<AudioApp> {
    let mut groups: Vec<(String, Option<PathBuf>, Vec<&PlayingProcess>)> = Vec::new();
    for p in processes {
        let app = p.path.as_deref().and_then(outer_app);
        let key = app
            .as_ref()
            .map(|a| a.to_string_lossy().into_owned())
            .unwrap_or_else(|| p.bundle_id.clone());
        match groups.iter_mut().find(|(k, _, _)| *k == key) {
            Some((_, _, members)) => members.push(p),
            None => groups.push((key, app, vec![p])),
        }
    }
    let mut apps: Vec<AudioApp> = groups
        .into_iter()
        .map(|(_, app, members)| {
            let found = app
                .as_deref()
                .and_then(&bundle)
                .filter(|f| f.bundle_id.is_some())
                .or_else(|| members.iter().find_map(|p| running(p.pid)));
            let mut pids: Vec<i32> = members.iter().map(|p| p.pid).collect();
            pids.sort_unstable();
            AudioApp {
                pids,
                bundle_id: found
                    .as_ref()
                    .and_then(|f| f.bundle_id.clone())
                    .unwrap_or_else(|| members[0].bundle_id.clone()),
                name: found.and_then(|f| f.name),
            }
        })
        .collect();
    apps.sort_by(|a, b| a.bundle_id.cmp(&b.bundle_id));
    apps
}

/// Đường dẫn binary của tiến trình `pid`.
fn pid_path(pid: i32) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: `buf` có đúng `PROC_PIDPATHINFO_MAXSIZE` byte.
    let n = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    (n > 0).then(|| PathBuf::from(std::ffi::OsStr::from_bytes(&buf[..n as usize])))
}

/// Tiến trình cha của `pid`.
fn parent_pid(pid: i32) -> Option<i32> {
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = size_of::<libc::proc_bsdinfo>() as libc::c_int;
    // SAFETY: `info` đủ chỗ cho `PROC_PIDTBSDINFO`; hàm chỉ ghi vào đó.
    let n = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            0,
            (&mut info as *mut libc::proc_bsdinfo).cast(),
            size,
        )
    };
    (n == size && info.pbi_ppid > 1).then_some(info.pbi_ppid as i32)
}

/// Tên hiển thị và bundle ID đọc từ `Info.plist` của gói `app` (`NSBundle`; tên theo ngôn ngữ của máy nếu gói có bản
/// dịch: `CFBundleDisplayName`, rồi `CFBundleName`, rồi tên gói bỏ đuôi `.app`).
pub fn bundle_identity(app: &Path) -> Option<AppIdentity> {
    use objc2_foundation::{NSBundle, NSString};
    let bundle = NSBundle::bundleWithPath(&NSString::from_str(app.to_str()?))?;
    let bundle_id = bundle.bundleIdentifier().map(|s| s.to_string());
    let name = ["CFBundleDisplayName", "CFBundleName"]
        .iter()
        .find_map(|key| {
            let value = bundle.objectForInfoDictionaryKey(&NSString::from_str(key))?;
            let value = value.downcast::<NSString>().ok()?.to_string();
            (!value.trim().is_empty()).then_some(value)
        })
        .or_else(|| {
            app.file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .filter(|s| !s.is_empty())
        });
    Some(AppIdentity { name, bundle_id })
}

/// Tên hiển thị (`localizedName`) và bundle ID của app chứa `pid`: thử chính `pid`, rồi đi lên tối đa 3 tiến trình cha
/// (helper do app chính chạy). Bỏ tên rỗng.
pub fn app_identity(pid: i32) -> Option<AppIdentity> {
    let mut current = Some(pid);
    for _ in 0..4 {
        let p = current?;
        if let Some(app) = objc2_app_kit::NSRunningApplication::runningApplicationWithProcessIdentifier(p) {
            let name = app
                .localizedName()
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty());
            if name.is_some() {
                return Some(AppIdentity {
                    name,
                    bundle_id: app.bundleIdentifier().map(|s| s.to_string()),
                });
            }
        }
        current = parent_pid(p);
    }
    None
}

/// Các app đang phát âm thanh, cho tùy chọn "chỉ tap một app họp" (§6.1). Không cần quyền ghi âm thanh. Chạy trong một
/// `autoreleasepool`: hàm được gọi từ luồng nền của app (không có pool riêng), và `NSBundle`, `NSRunningApplication` trả
/// về đối tượng autorelease.
pub fn audio_apps() -> Result<Vec<AudioApp>> {
    objc2::rc::autoreleasepool(|_| audio_apps_inner())
}

fn audio_apps_inner() -> Result<Vec<AudioApp>> {
    let system = kAudioObjectSystemObject as AudioObjectID;
    let mut address = AudioObjectPropertyAddress {
        mSelector: kAudioHardwarePropertyProcessObjectList,
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
    let mut playing = Vec::new();
    for id in ids {
        // Tiến trình vừa thoát giữa chừng thì bỏ qua nó, không làm hỏng cả danh sách.
        let mut running: u32 = 0;
        if get_property(
            id,
            kAudioProcessPropertyIsRunningOutput,
            std::ptr::null(),
            0,
            &mut running,
        )
        .is_err()
            || running == 0
        {
            continue;
        }
        let mut pid: i32 = 0;
        if get_property(id, kAudioProcessPropertyPID, std::ptr::null(), 0, &mut pid).is_err() {
            continue;
        }
        let mut bundle: *const CFString = std::ptr::null();
        if get_property(id, kAudioProcessPropertyBundleID, std::ptr::null(), 0, &mut bundle).is_err() {
            continue;
        }
        // SAFETY: Core Audio trả một CFString đã retain (+1); `CFRetained` nhận quyền sở hữu và release khi xong.
        let bundle_id = NonNull::new(bundle.cast_mut())
            .map(|p| unsafe { CFRetained::from_raw(p) }.to_string())
            .unwrap_or_default();
        if pid != std::process::id() as i32 && !bundle_id.is_empty() {
            playing.push(PlayingProcess {
                pid,
                bundle_id,
                path: pid_path(pid),
            });
        }
    }
    Ok(group_processes(&playing, bundle_identity, app_identity))
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
mod hal {
    use super::*;

    /// Đọc danh sách app và thiết bị phát của máy thật; không tạo tap nên không hỏi quyền.
    #[test]
    #[ignore = "đọc thiết bị âm thanh của máy thật"]
    fn default_device_and_audio_apps_can_be_read() {
        let device = default_output_device().unwrap();
        assert_ne!(device, 0);
        assert!(nominal_sample_rate(device).unwrap() > 0.0);
        assert!(crate::default_output_signature().unwrap().contains('@'));
        let apps = audio_apps().unwrap();
        assert!(
            apps.iter()
                .all(|a| !a.pids.is_empty() && a.pids.iter().all(|&p| p > 0) && !a.bundle_id.is_empty()),
            "{apps:?}"
        );
        println!("{apps:?}");
    }

    /// Tiến trình của chính test có `proc_pidpath`, cha của nó còn sống, và một pid không tồn tại thì không sống.
    #[test]
    fn process_helpers_read_the_running_process() {
        let me = std::process::id() as i32;
        assert!(pid_path(me).is_some_and(|p| p.is_absolute()));
        assert!(pid_alive(me));
        assert!(!pid_alive(i32::MAX - 7), "pid không tồn tại");
        assert!(parent_pid(me).is_none_or(|p| p > 1));
    }
}

#[cfg(test)]
mod grouping {
    use super::*;

    fn proc(pid: i32, bundle_id: &str, path: &str) -> PlayingProcess {
        PlayingProcess {
            pid,
            bundle_id: bundle_id.into(),
            path: Some(PathBuf::from(path)),
        }
    }

    /// Tên và bundle ID đọc từ `Info.plist` của một gói `.app` có sẵn trên mọi máy macOS. Chỉ đọc file, không cần quyền.
    #[test]
    fn a_bundle_names_its_app() {
        let id = bundle_identity(Path::new("/System/Applications/Calculator.app")).unwrap();
        assert_eq!(id.bundle_id.as_deref(), Some("com.apple.calculator"));
        assert!(id.name.is_some_and(|n| !n.is_empty()));
        assert_eq!(bundle_identity(Path::new("/khong/co.app")), None);
    }

    /// Bảng các app đang phát tiếng của máy này, để người thử ở 02c Task 8 so với app thật (tên, bundle ID, pid). Đọc
    /// thuộc tính của Core Audio HAL, không cần quyền; bỏ qua mặc định vì kết quả tùy máy.
    #[test]
    #[ignore = "in bảng app đang phát tiếng của máy này"]
    fn print_the_playing_apps() {
        for app in audio_apps().unwrap() {
            println!("{:?}\t{}\t{:?}", app.name, app.bundle_id, app.pids);
        }
    }

    #[test]
    fn the_outer_app_bundle_is_found() {
        let chrome = "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/\
                      Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)";
        assert_eq!(
            outer_app(Path::new(chrome)),
            Some(PathBuf::from("/Applications/Google Chrome.app"))
        );
        assert_eq!(outer_app(Path::new("/usr/libexec/coreaudiod")), None);
    }

    /// Q9 của review 02b: các tiến trình helper gộp vào app chính; tên lấy từ `NSRunningApplication`, đi lên tiến trình
    /// cha khi helper không có tên.
    #[test]
    fn helper_processes_are_grouped_under_their_app() {
        let processes = [
            proc(
                300,
                "com.google.Chrome.helper",
                "/Applications/Google Chrome.app/Contents/Frameworks/x.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/h",
            ),
            proc(200, "us.zoom.xos", "/Applications/zoom.us.app/Contents/MacOS/zoom.us"),
            proc(
                301,
                "com.google.Chrome.helper",
                "/Applications/Google Chrome.app/Contents/Frameworks/x.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/h",
            ),
            PlayingProcess {
                pid: 400,
                bundle_id: "com.example.tool".into(),
                path: None,
            },
        ];
        // Gói `.app` ngoài cùng cho tên và bundle ID của app chính, kể cả khi `NSRunningApplication` của helper trả về
        // chính helper (Q-F của review 02 lần 2).
        let bundle = |app: &Path| match app.to_str()? {
            "/Applications/Google Chrome.app" => Some(AppIdentity {
                name: Some("Google Chrome".into()),
                bundle_id: Some("com.google.Chrome".into()),
            }),
            // Gói đọc không được bundle ID: dùng `NSRunningApplication`.
            _ => Some(AppIdentity {
                name: None,
                bundle_id: None,
            }),
        };
        let running = |pid: i32| match pid {
            300 | 301 => Some(AppIdentity {
                name: Some("Google Chrome Helper".into()),
                bundle_id: Some("com.google.Chrome.helper".into()),
            }),
            200 => Some(AppIdentity {
                name: Some("zoom.us".into()),
                bundle_id: Some("us.zoom.xos".into()),
            }),
            _ => None,
        };
        let apps = group_processes(&processes, bundle, running);
        assert_eq!(
            apps,
            [
                AudioApp {
                    pids: vec![400],
                    bundle_id: "com.example.tool".into(),
                    name: None
                },
                AudioApp {
                    pids: vec![300, 301],
                    bundle_id: "com.google.Chrome".into(),
                    name: Some("Google Chrome".into())
                },
                AudioApp {
                    pids: vec![200],
                    bundle_id: "us.zoom.xos".into(),
                    name: Some("zoom.us".into())
                },
            ]
        );
    }
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
