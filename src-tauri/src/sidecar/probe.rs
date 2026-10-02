//! Windows: chọn `asr-worker-vulkan` hay `asr-worker-cpu` theo kết quả `asr-worker-vulkan --probe` (spec §6.4). Lệnh này
//! in danh sách GPU dạng JSON (kế hoạch 0-03, Task 14) rồi thoát. Máy không có `vulkan-1.dll` thì tiến trình không chạy
//! được (mã `0xC0000135`, STATUS_DLL_NOT_FOUND): dùng bản CPU. Driver lỗi lúc dò cũng chỉ làm tiến trình phụ này chết.

use serde::Deserialize;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    /// `discrete`, `integrated`, `virtual`, `cpu` hoặc `other`.
    pub device_type: String,
    pub device_local_bytes: u64,
    pub vendor_id: u32,
}

/// Kết quả `--probe`: có GPU dùng được không, và danh sách GPU để đề xuất gói theo VRAM (kế hoạch 04).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ProbeOutcome {
    pub usable: bool,
    pub gpus: Vec<GpuInfo>,
}

/// Danh sách GPU trong stdout của `--probe`; đọc không được thì rỗng.
pub fn parse_gpus(probe_stdout: &str) -> Vec<GpuInfo> {
    serde_json::from_str(probe_stdout.trim()).unwrap_or_default()
}

fn any_usable(gpus: &[GpuInfo]) -> bool {
    gpus.iter()
        .any(|g| matches!(g.device_type.as_str(), "discrete" | "integrated"))
}

/// Có GPU chạy được Vulkan không: card rời hoặc GPU tích hợp.
pub fn usable_gpu(probe_stdout: &str) -> bool {
    any_usable(&parse_gpus(probe_stdout))
}

/// Thời gian chờ `--probe`: binary đã từng chạy thì 10 giây; binary mới (vừa cài hay cập nhật) thì 60 giây, vì lần đầu
/// Windows Defender quét file có thể lâu (Q7 của review 02c).
pub fn probe_timeout(first_run: bool) -> Duration {
    Duration::from_secs(if first_run { 60 } else { 10 })
}

/// stdout của `--probe` giữ tối đa chừng này byte (danh sách thiết bị chỉ vài KiB); phần sau đọc rồi bỏ.
pub const PROBE_STDOUT_MAX: u64 = 64 * 1024;

/// Đọc hết `source` nhưng chỉ giữ `max` byte đầu (N-2 của review 02 lần 2): tiến trình in mãi không làm app hết bộ nhớ,
/// và vẫn không bị nghẽn vì pipe đầy.
pub fn read_capped(mut source: impl std::io::Read, max: u64) -> String {
    use std::io::Read;
    let mut kept = Vec::new();
    let _ = (&mut source).take(max).read_to_end(&mut kept);
    let _ = std::io::copy(&mut source, &mut std::io::sink());
    String::from_utf8_lossy(&kept).into_owned()
}

/// Chạy `exe --probe`, chờ tối đa `timeout`. `usable`: có GPU dùng được; `false` khi lỗi chạy, mã thoát khác 0, hay danh
/// sách không có GPU nào dùng được. `None`: quá giờ; bên gọi không nên nhớ kết quả này, để lần sau dò lại. stdout được
/// đọc trên luồng riêng, để tiến trình in nhiều không bị nghẽn vì pipe đầy.
pub fn run_probe(exe: &Path, timeout: Duration) -> Option<ProbeOutcome> {
    let mut cmd = Command::new(exe);
    cmd.arg("--probe")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(dir) = exe.parent().filter(|d| !d.as_os_str().is_empty()) {
        cmd.current_dir(dir);
    }
    pipeline::process::configure(&mut cmd);
    let Ok(mut child) = pipeline::process::spawn(&mut cmd, exe) else {
        return Some(ProbeOutcome::default());
    };
    let reader = child
        .stdout
        .take()
        .map(|stdout| std::thread::spawn(move || read_capped(stdout, PROBE_STDOUT_MAX)));
    let started = Instant::now();
    let result = loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break Some(true),
            Ok(Some(status)) => {
                log::info!("{} --probe thoát với {status}: dùng bản CPU", exe.display());
                break Some(false);
            }
            Ok(None) if started.elapsed() < timeout => std::thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                log::warn!(
                    "{} --probe quá {timeout:?}: lần này dùng bản CPU, lần sau dò lại",
                    exe.display()
                );
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                break Some(false);
            }
        }
    };
    pipeline::process::release(child.id());
    let out = reader.and_then(|r| r.join().ok()).unwrap_or_default();
    result.map(|ok| {
        let gpus = if ok { parse_gpus(&out) } else { Vec::new() };
        ProbeOutcome {
            usable: any_usable(&gpus),
            gpus,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// N-2 của review 02 lần 2: chỉ giữ 64 KiB đầu của stdout, nhưng vẫn đọc hết phần còn lại.
    #[test]
    fn probe_output_is_capped() {
        let mut big = std::io::Cursor::new(vec![b'x'; 3 * PROBE_STDOUT_MAX as usize]);
        let kept = read_capped(&mut big, PROBE_STDOUT_MAX);
        assert_eq!(kept.len() as u64, PROBE_STDOUT_MAX);
        assert_eq!(
            big.position(),
            3 * PROBE_STDOUT_MAX,
            "đọc hết, không để tiến trình nghẽn"
        );
        assert_eq!(read_capped(&b"[]"[..], PROBE_STDOUT_MAX), "[]");
    }

    #[test]
    fn discrete_or_integrated_gpus_are_usable() {
        let discrete = r#"[{"name":"NVIDIA GeForce RTX 4050 Laptop GPU","device_type":"discrete","device_local_bytes":6425673728,"vendor_id":4318}]"#;
        assert!(usable_gpu(discrete));
        let integrated =
            r#"[{"name":"Intel(R) UHD","device_type":"integrated","device_local_bytes":268435456,"vendor_id":32902}]"#;
        assert!(usable_gpu(integrated));
    }

    /// Kế hoạch 04 đề xuất gói theo VRAM của card rời: danh sách GPU giữ lại đủ trường.
    #[test]
    fn probe_output_keeps_the_gpu_list() {
        let two = r#"[{"name":"Intel(R) UHD","device_type":"integrated","device_local_bytes":268435456,"vendor_id":32902},
            {"name":"NVIDIA GeForce RTX 4050 Laptop GPU","device_type":"discrete","device_local_bytes":6425673728,"vendor_id":4318}]"#;
        let gpus = parse_gpus(two);
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[1].device_local_bytes, 6_425_673_728);
        assert!(parse_gpus("vulkan-1.dll not found").is_empty());
    }

    #[test]
    fn no_gpu_software_renderer_or_garbage_means_cpu() {
        assert!(!usable_gpu("[]"), "bản CPU in []");
        let llvmpipe = r#"[{"name":"llvmpipe","device_type":"cpu","device_local_bytes":0,"vendor_id":65541}]"#;
        assert!(!usable_gpu(llvmpipe));
        assert!(!usable_gpu(""));
        assert!(!usable_gpu("vulkan-1.dll not found"));
    }

    #[cfg(unix)]
    #[test]
    fn a_probe_that_fails_or_hangs_means_cpu() {
        // `false` thoát với mã 1. `yes` in mãi không thoát: stdout được đọc trên luồng riêng nên không nghẽn, quá thời gian
        // chờ thì bị kill, và kết quả là "chưa biết" (không nhớ).
        let usable = |exe: &str, timeout: Duration| run_probe(Path::new(exe), timeout).map(|o| o.usable);
        assert_eq!(usable("/usr/bin/false", Duration::from_secs(5)), Some(false));
        assert_eq!(usable("/usr/bin/yes", Duration::from_millis(200)), None);
        assert_eq!(usable("/khong/co/file", Duration::from_secs(1)), Some(false));
        // `true` thoát 0 mà không in danh sách GPU nào.
        assert_eq!(
            run_probe(Path::new("/usr/bin/true"), Duration::from_secs(5)),
            Some(ProbeOutcome::default())
        );
    }

    #[test]
    fn a_new_binary_gets_a_longer_probe() {
        assert_eq!(probe_timeout(true), Duration::from_secs(60));
        assert_eq!(probe_timeout(false), Duration::from_secs(10));
    }
}
