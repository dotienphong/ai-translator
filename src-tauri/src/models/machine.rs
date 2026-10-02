//! Cấu hình máy cho bước kiểm tra cấu hình (spec §4.1 bước 2, §8; Đ13 của kế hoạch 00): RAM, dung lượng trống, CPU có
//! AVX2 không (bản build x64 cần AVX2, §6.12), và card rời theo `asr-worker-vulkan --probe` (Windows).

use std::path::Path;

use serde::Serialize;

use super::manifest::Os;
use crate::sidecar::probe::GpuInfo;

/// Một GPU dò được, rút gọn cho đề xuất gói và giao diện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub discrete: bool,
    /// Heap `DEVICE_LOCAL` lớn nhất, MiB.
    pub vram_mib: u64,
}

impl From<&GpuInfo> for Gpu {
    fn from(g: &GpuInfo) -> Self {
        Self {
            name: g.name.clone(),
            discrete: g.device_type == "discrete",
            vram_mib: g.device_local_bytes >> 20,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Machine {
    pub os: Os,
    pub ram_mib: u64,
    /// x64: CPU có AVX2. Apple Silicon luôn `true`.
    pub avx2: bool,
    pub gpus: Vec<Gpu>,
    /// Windows: đã có kết quả `--probe`. macOS luôn `true` (không cần dò).
    pub gpu_known: bool,
}

/// Máy đang chạy. `gpus`: kết quả `--probe` (Windows), `None` nếu chưa dò xong.
pub fn detect(gpus: Option<&[GpuInfo]>) -> Machine {
    Machine {
        os: if cfg!(windows) { Os::Windows } else { Os::Macos },
        ram_mib: total_ram_bytes().unwrap_or(0) >> 20,
        avx2: has_avx2(),
        gpus: gpus.unwrap_or_default().iter().map(Gpu::from).collect(),
        gpu_known: cfg!(not(windows)) || gpus.is_some(),
    }
}

#[cfg(target_arch = "x86_64")]
fn has_avx2() -> bool {
    std::arch::is_x86_feature_detected!("avx2")
}

#[cfg(not(target_arch = "x86_64"))]
fn has_avx2() -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn total_ram_bytes() -> Option<u64> {
    let mut value: u64 = 0;
    let mut len = std::mem::size_of::<u64>();
    // SAFETY: `hw.memsize` là số 64 bit; `value` và `len` sống suốt lời gọi.
    let rc = unsafe {
        libc::sysctlbyname(
            c"hw.memsize".as_ptr(),
            (&mut value as *mut u64).cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    (rc == 0 && value > 0).then_some(value)
}

#[cfg(windows)]
pub fn total_ram_bytes() -> Option<u64> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // SAFETY: `dwLength` đã đặt đúng kích thước của struct.
    unsafe { GlobalMemoryStatusEx(&mut status) }.ok()?;
    Some(status.ullTotalPhys)
}

/// Thư mục gần nhất đã có (thư mục model có thể chưa được tạo).
fn existing_ancestor(path: &Path) -> Option<&Path> {
    path.ancestors().find(|p| p.is_dir())
}

/// Dung lượng trống cho người dùng hiện tại trên ổ chứa `path`. Trên APFS, `f_bavail` không tính phần "purgeable"
/// (bản sao iCloud, cache) mà Finder có tính, nên số này có thể nhỏ hơn số Finder hiện (N-11 của review 04 lần 2; 04b
/// Task 13 Step 7 so hai số).
#[cfg(target_os = "macos")]
pub fn free_disk_bytes(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let dir = existing_ancestor(path)?;
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    // `statfs` (không phải `statvfs`): trên macOS số khối của `statfs` là 64 bit, không bị cắt với ổ lớn.
    // SAFETY: struct C toàn số, giá trị 0 hợp lệ.
    let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c` là chuỗi C hợp lệ, `stat` sống suốt lời gọi.
    let rc = unsafe { libc::statfs(c.as_ptr(), &mut stat) };
    (rc == 0).then(|| stat.f_bavail * u64::from(stat.f_bsize))
}

#[cfg(windows)]
pub fn free_disk_bytes(path: &Path) -> Option<u64> {
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::HSTRING;
    let dir = existing_ancestor(path)?;
    let mut free = 0u64;
    // SAFETY: `free` sống suốt lời gọi; hai tham số còn lại không dùng.
    unsafe { GetDiskFreeSpaceExW(&HSTRING::from(dir.as_os_str()), Some(&mut free), None, None) }.ok()?;
    Some(free)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn this_mac_reports_ram_disk_and_cpu() {
        let m = detect(None);
        assert_eq!(m.os, Os::Macos);
        assert!(m.ram_mib >= 4_096, "{}", m.ram_mib);
        assert!(m.avx2, "Apple Silicon luôn đủ");
        assert!(m.gpu_known && m.gpus.is_empty());
        let free = free_disk_bytes(&std::env::temp_dir()).unwrap();
        assert!(free > 0);
        let missing = std::env::temp_dir().join("mt-khong-co/models/con");
        assert_eq!(
            free_disk_bytes(&missing).map(|b| b > 0),
            Some(true),
            "dùng thư mục cha đã có"
        );
    }

    /// Chạy ở đợt Windows (04b Task 14). Có AVX2 hay không tùy máy, nên chỉ in ra để ghi vào "Kết quả thử".
    #[test]
    #[cfg(windows)]
    fn this_windows_pc_reports_ram_disk_and_cpu() {
        let m = detect(None);
        assert_eq!(m.os, Os::Windows);
        assert!(m.ram_mib >= 4_096, "{}", m.ram_mib);
        assert!(!m.gpu_known, "chưa có kết quả dò GPU");
        assert!(detect(Some(&[])).gpu_known);
        println!("RAM {} MiB, AVX2 {}", m.ram_mib, m.avx2);
        let free = free_disk_bytes(&std::env::temp_dir()).unwrap();
        assert!(free > 0);
        let missing = std::env::temp_dir().join("mt-khong-co/models/con");
        assert_eq!(
            free_disk_bytes(&missing).map(|b| b > 0),
            Some(true),
            "dùng thư mục cha đã có"
        );
    }

    #[test]
    fn probe_gpus_become_discrete_flags_and_mib() {
        let info = GpuInfo {
            name: "NVIDIA GeForce RTX 4050 Laptop GPU".into(),
            device_type: "discrete".into(),
            device_local_bytes: 6_425_673_728,
            vendor_id: 4318,
        };
        let m = detect(Some(&[info]));
        assert_eq!(
            m.gpus,
            [Gpu {
                name: "NVIDIA GeForce RTX 4050 Laptop GPU".into(),
                discrete: true,
                vram_mib: 6_128
            }]
        );
        assert!(m.gpu_known);
    }
}
