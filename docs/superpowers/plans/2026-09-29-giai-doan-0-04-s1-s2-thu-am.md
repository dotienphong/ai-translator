# Giai đoạn 0 · 04: S1 (Core Audio tap trên macOS) và S2 (WASAPI loopback trên Windows)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Kiểm giả định 1 và 2 (§14): thu được âm thanh của Zoom, Meet và Teams, cùng Zalo PC theo A1.
- **macOS:** qua Core Audio process tap. Quyền `NSAudioCaptureUsageDescription` phải hoạt động với app đã ký, không chạy sandbox.
- **Windows:** qua endpoint loopback, kể cả khi app họp phát qua thiết bị Communications (tai nghe Bluetooth). Khi không có gì phát, luồng thu vẫn chèn đủ im lặng theo đồng hồ thật.

**Kiến trúc:** Crate `crates/audio-capture` có trait `AudioSource` (§6.1) và hai bản cài đặt:
- `macos.rs`: process tap gắn vào một aggregate device riêng tư, đọc mẫu bằng IO block.
- `windows.rs`: WASAPI loopback, đọc theo timer 10 ms; khoảng trống được chèn im lặng theo vị trí QPC.

Callback thu chỉ ghi vào ring buffer lock-free (`rtrb`). Phần logic thuần có test:
- `GapFiller`: chèn im lặng.
- `Mixer2`: trộn hai thiết bị.
- `MonoResampler`: về 16 kHz mono (§6.2).

Công cụ dòng lệnh `capture` ghi ra WAV 16 kHz mono và in mức âm lượng từng giây, dùng cho ma trận thử bằng tay.

**Công nghệ:**
- objc2 0.6.4, objc2-core-audio 0.3.2, objc2-core-foundation 0.3.2, objc2-foundation 0.3.2, block2 0.6.2 (macOS).
- windows 0.62.2 (Windows).
- rtrb 0.4.0, rubato 5.0.0, hound 3.5.1, clap 4.6.7.

Tổng quan: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`. Cần xong kế hoạch 01. Task 1–6 làm trên Mac (macOS 14.2 trở lên), Task 7–8 làm trên Windows.

---

### Task 1: Khung crate và `GapFiller` (TDD)

**Files:**
- Create: `crates/audio-capture/Cargo.toml`
- Create: `crates/audio-capture/src/lib.rs`
- Create: `crates/audio-capture/src/gapfill.rs`

Vì sao cần `GapFiller`:
- Khi máy không phát gì, WASAPI loopback không trả gói nào (§6.1).
- `GapFiller` so vị trí QPC của từng gói với số khung đã ghi, để chèn im lặng vào khoảng trống, hoặc bỏ phần gói chồng lên đoạn im lặng đã chèn. Lệch dưới 20 ms thì coi như liền mạch.
- Khi không có gói nào, cứ trễ quá 30 ms so với đồng hồ thì chèn im lặng cho kịp.

- [ ] **Step 1: Tạo `crates/audio-capture/Cargo.toml`**

```toml
[package]
name = "audio-capture"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[dependencies]
anyhow.workspace = true
clap.workspace = true
hound.workspace = true
rtrb.workspace = true
rubato.workspace = true

[target.'cfg(target_os = "macos")'.dependencies]
block2 = "0.6.2"
objc2 = "0.6.4"
objc2-core-audio = "0.3.2"
objc2-core-audio-types = "0.3.2"
objc2-core-foundation = "0.3.2"
objc2-foundation = "0.3.2"

[target.'cfg(windows)'.dependencies]
windows = { version = "0.62.2", features = [
    "Win32_Foundation",
    "Win32_Media_Audio",
    "Win32_Media_KernelStreaming",
    "Win32_Media_Multimedia",
    "Win32_System_Com",
    "Win32_System_Com_StructuredStorage",
    "Win32_System_Performance",
    "Win32_System_Variant",
] }
```

- [ ] **Step 2: Tạo `crates/audio-capture/src/lib.rs`** (các module khác thêm dần ở các task sau)

```rust
//! Thu âm thanh hệ thống (spec §6.1) và chuyển về 16 kHz mono (spec §6.2).

pub mod gapfill;

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
    /// Số mẫu bị bỏ vì ring buffer đầy.
    pub dropped: AtomicU64,
}

impl CaptureStats {
    pub fn snapshot(&self) -> [u64; 4] {
        [
            self.frames.load(Ordering::Relaxed),
            self.silence_inserted.load(Ordering::Relaxed),
            self.skipped.load(Ordering::Relaxed),
            self.dropped.load(Ordering::Relaxed),
        ]
    }
}
```

- [ ] **Step 3: Viết test trước.** Tạo `crates/audio-capture/src/gapfill.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;
    const TEN_MS: u64 = 100_000; // 100 ns

    #[test]
    fn contiguous_packets_need_no_fill() {
        let mut g = GapFiller::new(RATE);
        for i in 0..10 {
            assert_eq!(
                g.on_packet(i * TEN_MS, 480),
                PacketAction {
                    silence_before: 0,
                    skip: 0
                }
            );
        }
    }

    #[test]
    fn gap_between_packets_is_filled_with_silence() {
        let mut g = GapFiller::new(RATE);
        g.on_packet(0, 480); // 0–10 ms
        let a = g.on_packet(10 * TEN_MS, 480); // gói tiếp theo ở 100 ms
        assert_eq!(a.silence_before, 4_320); // 90 ms ở 48 kHz
    }

    #[test]
    fn small_jitter_is_ignored() {
        let mut g = GapFiller::new(RATE);
        g.on_packet(0, 480);
        assert_eq!(g.on_packet(TEN_MS + 50_000, 480).silence_before, 0); // trễ 5 ms
    }

    #[test]
    fn idle_time_becomes_silence_and_late_packet_is_trimmed() {
        let mut g = GapFiller::new(RATE);
        g.on_packet(0, 480); // next = 10 ms
        assert_eq!(g.on_idle(10 * TEN_MS), 2_880); // tới 100 − 30 = 70 ms: 60 ms im lặng
        // Gói tới muộn, bắt đầu ở 40 ms, trùng 30 ms (vượt dung sai 20 ms) với phần im lặng đã chèn.
        let a = g.on_packet(4 * TEN_MS, 480);
        assert_eq!(
            a,
            PacketAction {
                silence_before: 0,
                skip: 480
            }
        );
    }

    #[test]
    fn stream_that_never_plays_still_advances_with_the_clock() {
        let mut g = GapFiller::new(RATE);
        assert_eq!(g.on_idle(1_000), 0);
        assert_eq!(g.on_idle(1_000 + 10 * TEN_MS), 3_360); // 100 − 30 = 70 ms
    }
}
```

- [ ] **Step 4: Chạy test để thấy lỗi**

Run: `cargo test -p audio-capture`
Expected: FAIL, lỗi biên dịch vì chưa có `GapFiller` và `PacketAction`.

- [ ] **Step 5: Viết phần code** ở đầu `crates/audio-capture/src/gapfill.rs`:

```rust
//! Chèn im lặng khi WASAPI loopback không trả gói dữ liệu (spec §6.1).
//!
//! Khi không có âm thanh nào đang phát, Windows không gửi gói nào. Nếu tính thời gian theo số mẫu
//! thì dòng thời gian sẽ bị co lại, và VAD không bao giờ thấy đủ khoảng im lặng để chốt đoạn.
//! `GapFiller` giữ dòng thời gian theo đồng hồ QPC (đơn vị 100 ns, lấy từ `GetBuffer`).

const HNS_PER_SEC: u64 = 10_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PacketAction {
    /// Số khung im lặng cần ghi trước gói này.
    pub silence_before: u32,
    /// Số khung đầu gói cần bỏ, vì trùng với phần im lặng đã chèn.
    pub skip: u32,
}

pub struct GapFiller {
    rate: u64,
    next: Option<u64>,
    /// Lệch trong khoảng này coi là liền mạch (jitter).
    tolerance: u64,
    /// Khi rảnh, chỉ chèn im lặng tới `now - idle_lag`, để chừa chỗ cho gói tới muộn.
    idle_lag: u64,
}

impl GapFiller {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            rate: sample_rate as u64,
            next: None,
            tolerance: 200_000,
            idle_lag: 300_000,
        }
    }

    fn to_hns(&self, frames: u64) -> u64 {
        frames * HNS_PER_SEC / self.rate
    }

    fn to_frames(&self, hns: u64) -> u64 {
        hns * self.rate / HNS_PER_SEC
    }

    /// Gọi cho mỗi gói nhận được. `qpc`: vị trí QPC của khung đầu gói (100 ns).
    pub fn on_packet(&mut self, qpc: u64, frames: u32) -> PacketAction {
        let duration = self.to_hns(frames as u64);
        let Some(next) = self.next else {
            self.next = Some(qpc + duration);
            return PacketAction {
                silence_before: 0,
                skip: 0,
            };
        };
        if qpc > next + self.tolerance {
            self.next = Some(qpc + duration);
            PacketAction {
                silence_before: self.to_frames(qpc - next) as u32,
                skip: 0,
            }
        } else if qpc + self.tolerance < next {
            let skip = self.to_frames(next - qpc).min(frames as u64) as u32;
            self.next = Some(next.max(qpc + duration));
            PacketAction {
                silence_before: 0,
                skip,
            }
        } else {
            // Liền mạch: bám theo QPC để lệch đồng hồ thiết bị không cộng dồn thành glitch.
            self.next = Some(qpc + duration);
            PacketAction {
                silence_before: 0,
                skip: 0,
            }
        }
    }

    /// Gọi định kỳ khi không có gói nào. Trả số khung im lặng cần ghi.
    pub fn on_idle(&mut self, now: u64) -> u32 {
        let Some(next) = self.next else {
            self.next = Some(now);
            return 0;
        };
        if now <= next + self.idle_lag {
            return 0;
        }
        let frames = self.to_frames(now - self.idle_lag - next);
        self.next = Some(next + self.to_hns(frames));
        frames as u32
    }
}
```

- [ ] **Step 6: Chạy lại test**

Run: `cargo test -p audio-capture`
Expected: PASS, `test result: ok. 5 passed`

- [ ] **Step 7: Commit**

```bash
git add crates/audio-capture Cargo.lock
git commit -m "feat(audio-capture): trait AudioSource và chèn im lặng theo đồng hồ QPC"
```

### Task 2: Trộn hai thiết bị, `Mixer2` (TDD)

**Files:**
- Create: `crates/audio-capture/src/mix.rs`
- Modify: `crates/audio-capture/src/lib.rs`

Chế độ tự động trên Windows thu cả thiết bị Console và Communications rồi trộn lại (§6.1). Hai thiết bị có đồng hồ riêng, nên `Mixer2` chờ bên chậm tối đa `max_skew` mẫu. Quá mức đó thì phần dư được phát riêng, coi bên kia là im lặng. Tổng được chặn trong [−1, 1].

- [ ] **Step 1: Thêm module** vào `crates/audio-capture/src/lib.rs`, ngay dưới `pub mod gapfill;`:

```rust
pub mod mix;
```

- [ ] **Step 2: Viết test trước.** Tạo `crates/audio-capture/src/mix.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairs_are_summed() {
        let mut m = Mixer2::new(100);
        m.push_a(&[0.1, 0.2]);
        m.push_b(&[0.3, 0.4, 0.5]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert_eq!(out.len(), 2);
        assert!((out[0] - 0.4).abs() < 1e-6 && (out[1] - 0.6).abs() < 1e-6);
    }

    #[test]
    fn waits_for_the_other_side_within_skew() {
        let mut m = Mixer2::new(100);
        m.push_a(&[0.1; 50]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn excess_beyond_skew_is_emitted_alone() {
        let mut m = Mixer2::new(100);
        m.push_a(&[0.1; 150]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert_eq!(out.len(), 50);
    }

    #[test]
    fn sum_is_clamped() {
        let mut m = Mixer2::new(10);
        m.push_a(&[0.9]);
        m.push_b(&[0.9]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert_eq!(out, vec![1.0]);
    }
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p audio-capture mix`
Expected: FAIL, lỗi biên dịch vì chưa có `Mixer2`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/audio-capture/src/mix.rs`:

```rust
//! Trộn hai luồng 16 kHz mono từ hai thiết bị (Console và Communications, spec §6.1).
//!
//! Hai thiết bị có đồng hồ riêng, nên lệch dần. Mẫu của hai phía được cộng từng cặp; nếu một phía
//! dư quá `max_skew` mẫu so với phía kia thì phần dư được phát riêng, để độ trễ không tăng mãi.

use std::collections::VecDeque;

pub struct Mixer2 {
    a: VecDeque<f32>,
    b: VecDeque<f32>,
    max_skew: usize,
}

impl Mixer2 {
    pub fn new(max_skew_samples: usize) -> Self {
        Self {
            a: VecDeque::new(),
            b: VecDeque::new(),
            max_skew: max_skew_samples,
        }
    }

    pub fn push_a(&mut self, samples: &[f32]) {
        self.a.extend(samples);
    }

    pub fn push_b(&mut self, samples: &[f32]) {
        self.b.extend(samples);
    }

    pub fn drain_into(&mut self, out: &mut Vec<f32>) {
        let paired = self.a.len().min(self.b.len());
        out.extend(
            self.a
                .drain(..paired)
                .zip(self.b.drain(..paired))
                .map(|(x, y)| (x + y).clamp(-1.0, 1.0)),
        );
        if self.a.len() > self.max_skew {
            let excess = self.a.len() - self.max_skew;
            out.extend(self.a.drain(..excess));
        }
        if self.b.len() > self.max_skew {
            let excess = self.b.len() - self.max_skew;
            out.extend(self.b.drain(..excess));
        }
    }
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p audio-capture`
Expected: PASS, `test result: ok. 9 passed`

- [ ] **Step 6: Commit**

```bash
git add crates/audio-capture
git commit -m "feat(audio-capture): trộn hai thiết bị có bù lệch đồng hồ"
```

### Task 3: Về 16 kHz mono, `MonoResampler` (TDD)

**Files:**
- Create: `crates/audio-capture/src/resample.rs`
- Modify: `crates/audio-capture/src/lib.rs`

Cách làm theo §6.2: gộp các kênh thành một kênh (lấy trung bình), rồi resample bằng rubato (FFT, khối 1024 mẫu đầu vào). Nếu đầu vào đã là 16 kHz thì chỉ gộp kênh.

- [ ] **Step 1: Thêm module** vào `crates/audio-capture/src/lib.rs`, ngay dưới `pub mod mix;`:

```rust
pub mod resample;
```

- [ ] **Step 2: Viết test trước.** Tạo `crates/audio-capture/src/resample.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn sine(rate: u32, channels: u16, freq: f32, seconds: f32) -> Vec<f32> {
        let n = (rate as f32 * seconds) as usize;
        (0..n)
            .flat_map(|i| {
                let v = 0.5 * (2.0 * std::f32::consts::PI * freq * i as f32 / rate as f32).sin();
                std::iter::repeat_n(v, channels as usize)
            })
            .collect()
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    #[test]
    fn stereo_48k_becomes_mono_16k_with_same_pitch_and_level() {
        let mut r = MonoResampler::new(48_000, 2).unwrap();
        let mut out = Vec::new();
        r.process(&sine(48_000, 2, 440.0, 1.0), &mut out).unwrap();
        assert!(out.len() > 15_000 && out.len() <= 16_000, "len = {}", out.len());
        // Bỏ phần khởi động của bộ lọc rồi so mức và tần số.
        let steady = &out[2_000..];
        assert!((rms(steady) - 0.5 / 2f32.sqrt()).abs() < 0.02);
        let crossings = steady.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count() as f32;
        let hz = crossings / (steady.len() as f32 / 16_000.0);
        assert!((hz - 440.0).abs() < 5.0, "hz = {hz}");
    }

    #[test]
    fn mono_16k_passes_through() {
        let mut r = MonoResampler::new(16_000, 1).unwrap();
        let input = sine(16_000, 1, 300.0, 0.1);
        let mut out = Vec::new();
        r.process(&input, &mut out).unwrap();
        assert_eq!(out, input);
    }
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p audio-capture resample`
Expected: FAIL, lỗi biên dịch vì chưa có `MonoResampler`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/audio-capture/src/resample.rs`:

```rust
//! Gộp về mono rồi resample xuống 16 kHz bằng rubato (spec §6.2).
//! Chạy ở luồng tiền xử lý, không chạy trong callback thu âm.

use anyhow::{Result, anyhow};
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler, WindowFunction};

pub const TARGET_RATE: u32 = 16_000;
const CHUNK: usize = 1024;

pub struct MonoResampler {
    channels: usize,
    inner: Option<Fft<f32>>,
    /// Khung dở dang (chưa đủ số kênh) từ lần gọi trước.
    partial: Vec<f32>,
    pending: Vec<f32>,
    scratch: Vec<f32>,
}

impl MonoResampler {
    pub fn new(input_rate: u32, channels: u16) -> Result<Self> {
        let inner = if input_rate == TARGET_RATE {
            None
        } else {
            // sub_chunks = 1: khối FFT đủ lớn để bộ lọc chống alias cắt gần 8 kHz.
            Some(
                Fft::<f32>::new_custom(
                    input_rate as usize,
                    TARGET_RATE as usize,
                    CHUNK,
                    1,
                    1,
                    WindowFunction::BlackmanHarris2,
                    FixedSync::Input,
                )
                .map_err(|e| anyhow!("không tạo được bộ resample: {e}"))?,
            )
        };
        Ok(Self {
            channels: channels.max(1) as usize,
            inner,
            partial: Vec::new(),
            pending: Vec::new(),
            scratch: Vec::new(),
        })
    }

    /// Nhận mẫu xen kẽ theo định dạng thiết bị (không cần chia hết cho số kênh),
    /// ghi thêm mẫu 16 kHz mono vào `out`.
    pub fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>) -> Result<()> {
        let scale = 1.0 / self.channels as f32;
        let mut input = interleaved;
        if !self.partial.is_empty() {
            let take = (self.channels - self.partial.len()).min(input.len());
            self.partial.extend_from_slice(&input[..take]);
            input = &input[take..];
            if self.partial.len() == self.channels {
                self.pending.push(self.partial.iter().sum::<f32>() * scale);
                self.partial.clear();
            }
        }
        let frames = input.chunks_exact(self.channels);
        let rest = frames.remainder();
        self.pending.extend(frames.map(|f| f.iter().sum::<f32>() * scale));
        self.partial.extend_from_slice(rest);
        let Some(resampler) = self.inner.as_mut() else {
            out.append(&mut self.pending);
            return Ok(());
        };
        let mut start = 0;
        loop {
            let need = resampler.input_frames_next();
            if self.pending.len() - start < need {
                break;
            }
            let cap = resampler.output_frames_max();
            self.scratch.resize(cap, 0.0);
            let input =
                InterleavedSlice::new(&self.pending[start..start + need], 1, need).map_err(|e| anyhow!("{e}"))?;
            let mut output = InterleavedSlice::new_mut(&mut self.scratch, 1, cap).map_err(|e| anyhow!("{e}"))?;
            let (_, written) = resampler
                .process_into_buffer(&input, &mut output, None)
                .map_err(|e| anyhow!("resample lỗi: {e}"))?;
            out.extend_from_slice(&self.scratch[..written]);
            start += need;
        }
        self.pending.drain(..start);
        Ok(())
    }
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p audio-capture`
Expected: PASS, `test result: ok. 11 passed`

- [ ] **Step 6: Commit**

```bash
git add crates/audio-capture
git commit -m "feat(audio-capture): gộp kênh và resample về 16 kHz bằng rubato"
```

### Task 4: macOS, Core Audio process tap

**Files:**
- Create: `crates/audio-capture/src/macos.rs`
- Modify: `crates/audio-capture/src/lib.rs`

Các bước trong code:
1. Tạo `CATapDescription`.
   - Mặc định là tap stereo toàn hệ thống, trừ chính tiến trình này.
   - Nếu có `--pid` thì chỉ tap app đó.
   - Tap để private, và không tắt tiếng của app gốc.
2. Gọi `AudioHardwareCreateProcessTap`.
3. Tạo aggregate device riêng tư:
   - thiết bị chính là thiết bị phát mặc định;
   - danh sách tap chứa UUID của tap, có bù trôi đồng hồ;
   - tap tự khởi động.
4. Đọc định dạng của tap (`kAudioTapPropertyFormat`).
5. Đăng ký IO block (`AudioDeviceCreateIOProcIDWithBlock`). Block này chỉ đẩy mẫu vào ring buffer, xử lý được cả dạng xen kẽ (interleaved) lẫn tách kênh.

Chưa được cấp quyền thì tap vẫn chạy nhưng chỉ trả về im lặng.

- [ ] **Step 1: Thêm module** vào `crates/audio-capture/src/lib.rs`, dưới `pub mod resample;` và cách một dòng trống (giống bản cuối ở Task 7), để `cargo fmt` không xếp lại thứ tự:

```rust
#[cfg(target_os = "macos")]
pub mod macos;
```

- [ ] **Step 2: Tạo `crates/audio-capture/src/macos.rs`**

```rust
//! Core Audio process tap, macOS 14.2 trở lên (spec §6.1).
//!
//! Tạo tap, gắn tap vào một aggregate device riêng tư (chỉ chứa tap), rồi đọc mẫu qua IO block.
//!
//! `start` có thể chờ lâu mà chưa trả về:
//! - lần đầu, macOS hiện hộp thoại xin quyền "Ghi âm thanh hệ thống" và chờ người dùng trả lời;
//! - aggregate đặt `tapautostart`, nên `AudioDeviceStart` chờ tới khi có app bắt đầu phát tiếng.
//!
//! Nếu chưa được cấp quyền, tap chỉ trả im lặng.

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
        self.format = AudioFormat {
            sample_rate: asbd.mSampleRate as u32,
            channels: asbd.mChannelsPerFrame as u16,
        };

        self.aggregate_id = create_aggregate_device(&tap_uid)?;

        let non_interleaved = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0;
        let channels = asbd.mChannelsPerFrame as usize;
        let (buffers, per_buffer) = if non_interleaved {
            (channels, 1)
        } else {
            (1, channels as u32)
        };
        // IO block nhận mọi luồng vào của aggregate. Nếu có luồng nào ngoài tap thì dừng với
        // thông báo rõ, thay vì ghi dữ liệu sai vào WAV. Rỗng: để phép kiểm trong on_io lo.
        let layout = input_layout(self.aggregate_id)?;
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
        let samples: u64 = buffers.iter().map(|b| b.mDataByteSize as u64 / 4).sum();
        io.stats.dropped.fetch_add(samples, Ordering::Relaxed);
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
    let aggregate_uid = CFString::from_str(&format!("meeting-translator.tap.{}", std::process::id()));
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
```

- [ ] **Step 3: Build và clippy**

Run: `cargo clippy -p audio-capture --all-targets -- -D warnings && cargo test -p audio-capture`
Expected: không có cảnh báo; `test result: ok. 11 passed`.

- [ ] **Step 4: Commit**

```bash
git add crates/audio-capture
git commit -m "feat(audio-capture): Core Audio process tap qua aggregate device riêng tư (macOS 14.2+)"
```

### Task 5: Công cụ `capture` và `Capture.app`

**Files:**
- Create: `crates/audio-capture/src/bin/capture.rs`
- Create: `crates/audio-capture/macos/make-app.sh`

Tham số của `capture`:
- `--seconds N` (mặc định 20) và `--out <file.wav>`.
- `--pid <pid>`: chỉ trên macOS.
- `--role console|communications|both`: chỉ trên Windows. `both` là chế độ tự động của §6.1: chỉ thu thêm thiết bị Communications khi nó khác thiết bị Console.

Mỗi giây, công cụ in RMS và đánh dấu `(im lặng)` khi RMS dưới 0,0005. Cuối cùng nó in số khung nhận, số khung im lặng đã chèn, số khung bỏ và số mẫu rơi.

Trên macOS, quyền thu âm thanh hệ thống gắn với app bundle. Vì vậy `make-app.sh` đóng gói binary thành `target/Capture.app` có `Info.plist` khai `NSAudioCaptureUsageDescription`, rồi ký với hardened runtime. Mặc định là ký ad-hoc; muốn ký thật thì đặt `SIGN_IDENTITY`.

- [ ] **Step 1: Tạo `crates/audio-capture/src/bin/capture.rs`**

```rust
//! Công cụ cho spike S1 (macOS) và S2 (Windows): thu âm thanh hệ thống trong N giây,
//! ghi ra WAV 16 kHz mono, và in mức âm lượng (RMS) của từng giây.

use anyhow::Result;
use audio_capture::mix::Mixer2;
use audio_capture::resample::{MonoResampler, TARGET_RATE};
use audio_capture::{AudioSource, CaptureStats};
use clap::Parser;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 48 kHz × 2 kênh × 30 giây (spec §6.1).
const RING_SAMPLES: usize = 48_000 * 2 * 30;
const SILENT_RMS: f32 = 0.000_5;

#[derive(Parser)]
struct Args {
    #[arg(long, default_value_t = 20)]
    seconds: u64,
    #[arg(long)]
    out: PathBuf,
    /// macOS: chỉ thu một app theo pid. Mặc định thu toàn hệ thống, trừ chính công cụ này.
    #[arg(long)]
    pid: Option<i32>,
    /// Windows: console, communications, hoặc both (chế độ tự động của §6.1: thu thêm thiết bị
    /// Communications khi nó khác thiết bị Console).
    #[arg(long, default_value = "console")]
    role: String,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let mut sources = make_sources(&args)?;
    let stats: Vec<Arc<CaptureStats>> = sources.iter().map(|(_, s)| s.clone()).collect();
    let mut consumers = Vec::new();
    let mut resamplers = Vec::new();
    for (source, _) in sources.iter_mut() {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        // start() có thể chờ lâu: macOS hiện hộp thoại xin quyền ở lần đầu, và với tapautostart
        // AudioDeviceStart chờ tới khi có app phát tiếng. In trước để biết đang kẹt ở đâu.
        println!("đang khởi động nguồn (macOS: có thể đang chờ trả lời hộp thoại quyền, hoặc chờ app phát tiếng)...");
        source.start(producer)?;
        let format = source.format();
        println!("nguồn: {} Hz, {} kênh", format.sample_rate, format.channels);
        resamplers.push(MonoResampler::new(format.sample_rate, format.channels)?);
        consumers.push(consumer);
    }

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut wav = hound::WavWriter::create(&args.out, spec)?;
    let mut mixer = Mixer2::new(TARGET_RATE as usize / 10);
    let mut second = Vec::with_capacity(TARGET_RATE as usize);
    let (mut seconds_done, mut silent_seconds) = (0u64, 0u64);
    let started = Instant::now();
    let mut raw = Vec::new();
    let mut mono: Vec<Vec<f32>> = vec![Vec::new(); consumers.len()];

    while started.elapsed() < Duration::from_secs(args.seconds) {
        std::thread::sleep(Duration::from_millis(20));
        for (i, consumer) in consumers.iter_mut().enumerate() {
            raw.clear();
            let available = consumer.slots();
            if available > 0 {
                let chunk = consumer.read_chunk(available)?;
                let (a, b) = chunk.as_slices();
                raw.extend_from_slice(a);
                raw.extend_from_slice(b);
                chunk.commit_all();
            }
            resamplers[i].process(&raw, &mut mono[i])?;
        }
        let mut mixed = Vec::new();
        if mono.len() == 1 {
            mixed.append(&mut mono[0]);
        } else {
            mixer.push_a(&mono[0]);
            mixer.push_b(&mono[1]);
            mono.iter_mut().for_each(Vec::clear);
            mixer.drain_into(&mut mixed);
        }
        for s in mixed {
            wav.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
            second.push(s);
            if second.len() == TARGET_RATE as usize {
                let rms = (second.iter().map(|x| x * x).sum::<f32>() / second.len() as f32).sqrt();
                seconds_done += 1;
                if rms < SILENT_RMS {
                    silent_seconds += 1;
                }
                println!(
                    "giây {seconds_done:>3}: rms = {rms:.4}{}",
                    if rms < SILENT_RMS { "  (im lặng)" } else { "" }
                );
                second.clear();
            }
        }
    }
    for (source, _) in sources.iter_mut() {
        source.stop();
    }
    wav.finalize()?;
    println!(
        "xong: {seconds_done} giây, {silent_seconds} giây im lặng, file {}",
        args.out.display()
    );
    let elapsed = started.elapsed().as_secs_f64();
    for (i, s) in stats.iter().enumerate() {
        let [frames, inserted, skipped, dropped] = s.snapshot();
        println!(
            "nguồn {i}: {frames} khung nhận (≈ {:.0} khung/giây, so với tần số ở dòng `nguồn:`), {inserted} khung im lặng chèn thêm, {skipped} khung bỏ, {dropped} mẫu rơi",
            frames as f64 / elapsed
        );
    }
    Ok(())
}

type Source = (Box<dyn AudioSource>, Arc<CaptureStats>);

#[cfg(target_os = "macos")]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::macos::{MacTapSource, TapTarget};
    let target = args.pid.map_or(TapTarget::SystemExceptSelf, TapTarget::Process);
    let stats = Arc::new(CaptureStats::default());
    Ok(vec![(Box::new(MacTapSource::new(target, stats.clone())), stats)])
}

#[cfg(windows)]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::windows::{LoopbackSource, Role, default_endpoint_id};
    let roles = match args.role.as_str() {
        "console" => vec![Role::Console],
        "communications" => vec![Role::Communications],
        "both" if default_endpoint_id(Role::Console)? == default_endpoint_id(Role::Communications)? => {
            println!("Console và Communications là cùng một thiết bị, chỉ thu một lần");
            vec![Role::Console]
        }
        "both" => vec![Role::Console, Role::Communications],
        other => anyhow::bail!("role không hợp lệ: {other}"),
    };
    Ok(roles
        .into_iter()
        .map(|role| {
            let stats = Arc::new(CaptureStats::default());
            (
                Box::new(LoopbackSource::new(role, stats.clone())) as Box<dyn AudioSource>,
                stats,
            )
        })
        .collect())
}

#[cfg(not(any(target_os = "macos", windows)))]
fn make_sources(_args: &Args) -> Result<Vec<Source>> {
    anyhow::bail!("chỉ hỗ trợ macOS và Windows")
}
```

- [ ] **Step 2: Tạo `crates/audio-capture/macos/make-app.sh`** rồi `chmod +x crates/audio-capture/macos/make-app.sh`

```bash
#!/usr/bin/env bash
# S1: đóng gói công cụ capture thành Capture.app có Info.plist (NSAudioCaptureUsageDescription),
# ký với hardened runtime, để kiểm giả định 1 (§14): quyền thu âm thanh hệ thống với app đã ký, không sandbox.
# Dùng: crates/audio-capture/macos/make-app.sh  (SIGN_IDENTITY="Developer ID Application: …" để ký thật)
set -euo pipefail
cd "$(dirname "$0")/../../.."
APP=target/Capture.app
cargo build --release -p audio-capture --bin capture
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp target/release/capture "$APP/Contents/MacOS/capture"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.meetingtranslator.capture</string>
  <key>CFBundleName</key><string>Capture</string>
  <key>CFBundleExecutable</key><string>capture</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>14.2</string>
  <key>NSAudioCaptureUsageDescription</key>
  <string>Meeting Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.</string>
</dict>
</plist>
PLIST
codesign --force --options runtime --sign "${SIGN_IDENTITY:--}" "$APP"
codesign --verify --verbose=2 "$APP"
# Mở qua `open` để app tự xin quyền theo Info.plist của nó; chạy thẳng binary từ Terminal thì quyền lại tính cho Terminal.
echo "Chạy thử: open -W --stdout \"$PWD/target/s1.log\" --stderr \"$PWD/target/s1.err\" $APP --args --seconds 20 --out \"$PWD/target/s1.wav\""
```

- [ ] **Step 3: Đóng gói và kiểm tra chữ ký**

Run:
```bash
crates/audio-capture/macos/make-app.sh
codesign -d --entitlements - target/Capture.app; codesign -dv target/Capture.app 2>&1 | grep -E 'flags|Signature'
```
Expected:
- `make-app.sh` in `target/Capture.app: valid on disk` và `satisfies its Designated Requirement`. Trước đó có thể có dòng `replacing existing signature`: linker đã gắn sẵn chữ ký ad-hoc cho binary arm64, và `codesign --force` thay nó.
- Lệnh xem entitlements chỉ in dòng `Executable=…/capture`, tức không có entitlement nào, kể cả `com.apple.security.app-sandbox`.
- `flags=0x10002(adhoc,runtime)` và `Signature=adhoc`.

- [ ] **Step 4: Kiểm tra phụ thuộc**

Run: `cargo deny check && cargo audit`
Expected: `advisories ok, bans ok, licenses ok, sources ok`; `cargo audit` không báo lỗ hổng.

- [ ] **Step 5: Commit**

```bash
git add crates/audio-capture Cargo.lock
git commit -m "feat(audio-capture): công cụ capture và Capture.app đã ký cho S1"
```

### Task 6: S1, ma trận thử trên macOS

**Files:**
- Create: `bench/phase0/results/s1_capture.md`

Chuẩn bị:
- Máy thứ hai (hoặc điện thoại) vào cùng cuộc họp và nói liên tục. Máy Mac chỉ nghe, tắt micro.
- Mở app qua `open`, để macOS xin quyền theo `Info.plist` của `Capture.app`. Nếu chạy thẳng binary từ Terminal thì quyền lại tính cho Terminal.
- Lệnh chạy một lần thử (đổi tên file cho từng dòng của ma trận):

```bash
open -W --stdout "$PWD/target/s1.log" --stderr "$PWD/target/s1.err" target/Capture.app \
  --args --seconds 30 --out "$PWD/target/s1-<tên>.wav"
cat target/s1.log target/s1.err
python3 -c "import wave, sys; w = wave.open(sys.argv[1]); print(w.getnframes() / w.getframerate(), 'giây')" target/s1-<tên>.wav
```

Muốn macOS hỏi quyền lại từ đầu: `tccutil reset AudioCapture dev.meetingtranslator.capture`. Nếu `tccutil` không nhận tên dịch vụ này, vào System Settings → Privacy & Security → Screen & System Audio Recording để gỡ quyền.

Lưu ý khi chạy (rút ra từ review lúc thực thi):
- Chạy qua `Capture.app` (lệnh `open` ở trên), không chạy thẳng binary `capture` từ Terminal. Chạy thẳng thì macOS hỏi quyền cho Terminal chứ không phải cho app.
- Lần đầu, `start()` chờ tới khi người dùng trả lời hộp thoại quyền. Nó cũng chờ tới khi có app bắt đầu phát tiếng (`tapautostart`), nên hãy cho một video phát trong lúc chạy, kể cả ở dòng 2. Công cụ in một dòng báo đang chờ.
- Đừng build lại app giữa các dòng của ma trận. Chữ ký ad-hoc gắn với cdhash của binary, nên mỗi lần build lại macOS sẽ hỏi quyền lại.
- Dòng 8 (tai nghe có micro, ví dụ AirPods): aggregate chỉ chứa tap, nên không được bật micro của tai nghe (không chuyển sang HFP). WAV phải đúng tốc độ.
- Nếu dòng 1 không hiện hộp thoại, hoặc mọi giây đều im lặng dù đã cho phép, thử ký kèm entitlement `com.apple.security.device.audio-input`, để xem lỗi có phải do hardened runtime không. Ghi kết quả vào cột ghi chú.

- [ ] **Step 1: Chạy từng dòng của ma trận và điền cột kết quả**

| # | Tình huống | Cách chạy | Đạt khi |
|---|---|---|---|
| 1 | Lần đầu chạy, bấm Cho phép khi macOS hỏi quyền | lệnh trên, đang phát một video YouTube | có hộp thoại xin quyền với đúng câu trong `Info.plist`; các giây có tiếng có RMS > 0,0005; file WAV nghe rõ, đúng tốc độ, dài 30 giây (±0,2) |
| 2 | Từ chối quyền (sau khi `tccutil reset`) | lệnh trên | app không crash; mọi giây đều `(im lặng)`. Ghi lại để MVP báo lỗi thiếu quyền (§9) |
| 3 | Zoom (app), tap toàn hệ thống | lệnh trên | nghe rõ giọng người nói ở máy thứ hai |
| 4 | Google Meet trên Chrome | lệnh trên | như dòng 3 |
| 5 | Google Meet trên Safari | lệnh trên | như dòng 3 |
| 6 | Microsoft Teams (app mới) | lệnh trên | như dòng 3 |
| 6a | Google Meet trên Edge | lệnh trên | như dòng 3 |
| 6b | Cuộc gọi Zalo PC | lệnh trên | như dòng 3 |
| 7 | Chỉ tap Zoom, trong lúc YouTube đang phát ở Chrome | thêm `--pid $(pgrep -x zoom.us)` sau `--args` | file WAV chỉ có tiếng Zoom, không có tiếng YouTube |
| 8 | Tai nghe có dây, rồi AirPods (hoặc tai nghe Bluetooth khác) | lệnh trên với Zoom | thu được như dòng 3 với cả hai thiết bị phát |
| 9 | Đổi thiết bị phát giữa chừng (loa → tai nghe) | lệnh trên, đổi ở giây 10 | ghi lại: tap tiếp tục, im lặng hay lỗi. MVP cần biết để khởi tạo lại (§6.1) |
| 10 | Ký bằng Developer ID (nếu đã có tài khoản) | `SIGN_IDENTITY="Developer ID Application: …" crates/audio-capture/macos/make-app.sh` rồi làm lại dòng 1 và 3 | như dòng 1 và 3 |

- [ ] **Step 2: Ghi `bench/phase0/results/s1_capture.md`**: phiên bản macOS, bản của từng app họp, bảng trên với cột kết quả, và kết luận cho giả định 1.

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/results/s1_capture.md
git commit -m "test(bench): S1 thu âm thanh Zoom, Meet, Teams bằng Core Audio tap"
```

### Task 7: Windows, WASAPI loopback

Máy: laptop Windows 11 đã làm Task 2 của kế hoạch 01. Thêm một máy Windows 10 cho Task 8 nếu có.

**Files:**
- Create: `crates/audio-capture/src/windows.rs`
- Modify: `crates/audio-capture/src/lib.rs`

Luồng thu của mỗi thiết bị:
1. Khởi tạo COM ở chế độ MTA.
2. Lấy thiết bị phát mặc định của vai trò (Console hoặc Communications).
3. Xin định dạng float32 ở tần số và số kênh của mix format, với cờ `LOOPBACK | AUTOCONVERTPCM | SRC_DEFAULT_QUALITY` và bộ đệm 100 ms.
4. Cứ 10 ms thì đọc hết các gói đang có:
   - Gói gắn cờ `SILENT` được ghi thành số 0.
   - Vị trí QPC của từng gói được đưa qua `GapFiller`.
   - Không có gói nào thì gọi `GapFiller::on_idle` với QPC hiện tại.

`default_endpoint_id` cho biết hai vai trò có trỏ cùng một thiết bị không.

- [ ] **Step 1: Tạo `crates/audio-capture/src/windows.rs`**

```rust
//! WASAPI shared-mode endpoint loopback (spec §6.1).
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
use windows::Win32::Media::Audio::{
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
    AUDCLNT_STREAMFLAGS_LOOPBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, ERole, IAudioCaptureClient, IAudioClient,
    IMMDeviceEnumerator, MMDeviceEnumerator, WAVEFORMATEX, eCommunications, eConsole, eRender,
};
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
};
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    /// Thiết bị phát mặc định.
    Console,
    /// Thiết bị mặc định cho liên lạc; app họp hay dùng thiết bị này với tai nghe Bluetooth.
    Communications,
}

pub struct LoopbackSource {
    role: Role,
    format: AudioFormat,
    stats: Arc<CaptureStats>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Role {
    fn erole(self) -> ERole {
        match self {
            Role::Console => eConsole,
            Role::Communications => eCommunications,
        }
    }
}

/// Id của thiết bị phát mặc định cho một vai trò. Hai vai trò thường trỏ cùng một thiết bị; khi đó chỉ
/// thu một lần, để không cộng tiếng hai lần (spec §6.1).
pub fn default_endpoint_id(role: Role) -> Result<String> {
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
    let result = (|| -> Result<String> {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role.erole())? };
        let id = unsafe { device.GetId()? };
        let text = unsafe { id.to_string() };
        unsafe { CoTaskMemFree(Some(id.0 as *const _)) };
        Ok(text?)
    })();
    unsafe { CoUninitialize() };
    result
}

impl LoopbackSource {
    pub fn new(role: Role, stats: Arc<CaptureStats>) -> Self {
        Self {
            role,
            format: AudioFormat {
                sample_rate: 0,
                channels: 0,
            },
            stats,
            stop: Arc::new(AtomicBool::new(false)),
            thread: None,
        }
    }
}

impl AudioSource for LoopbackSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<AudioFormat, String>>();
        let role = self.role.erole();
        let stop = self.stop.clone();
        let stats = self.stats.clone();
        self.thread = Some(std::thread::spawn(move || {
            if let Err(e) = capture_thread(role, sink, stop, stats, &ready_tx) {
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
}

impl Drop for LoopbackSource {
    fn drop(&mut self) {
        self.stop();
    }
}

fn capture_thread(
    role: ERole,
    mut sink: rtrb::Producer<f32>,
    stop: Arc<AtomicBool>,
    stats: Arc<CaptureStats>,
    ready: &mpsc::Sender<Result<AudioFormat, String>>,
) -> Result<()> {
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
    let result = (|| -> Result<()> {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role)? };
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
    })();
    unsafe { CoUninitialize() };
    result
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
```

- [ ] **Step 2: Sửa `crates/audio-capture/src/lib.rs`** thành bản cuối:

```rust
//! Thu âm thanh hệ thống (spec §6.1) và chuyển về 16 kHz mono (spec §6.2).

pub mod gapfill;
pub mod mix;
pub mod resample;

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(windows)]
pub mod windows;

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
    /// Số mẫu bị bỏ vì ring buffer đầy.
    pub dropped: AtomicU64,
}

impl CaptureStats {
    pub fn snapshot(&self) -> [u64; 4] {
        [
            self.frames.load(Ordering::Relaxed),
            self.silence_inserted.load(Ordering::Relaxed),
            self.skipped.load(Ordering::Relaxed),
            self.dropped.load(Ordering::Relaxed),
        ]
    }
}
```

- [ ] **Step 3: Build, test, clippy** (PowerShell)

```powershell
cargo test -p audio-capture
cargo clippy -p audio-capture --all-targets -- -D warnings
cargo build --release -p audio-capture --bin capture
```
Expected: `test result: ok. 11 passed`; clippy không có cảnh báo; có file `target\release\capture.exe`.

- [ ] **Step 4: Commit**

```powershell
git add crates/audio-capture
git commit -m "feat(audio-capture): WASAPI loopback đọc theo timer, chèn im lặng theo QPC"
```

### Task 8: S2, ma trận thử trên Windows

**Files:**
- Create: `bench/phase0/results/s2_capture.md`

Chuẩn bị:
- Máy thứ hai vào cùng cuộc họp và nói liên tục.
- Lệnh chạy một lần thử:

```powershell
target\release\capture.exe --seconds 30 --role <console|communications|both> --out target\s2-<tên>.wav
python -c "import wave, sys; w = wave.open(sys.argv[1]); print(w.getnframes() / w.getframerate(), 'giây')" target\s2-<tên>.wav
```

Với mọi dòng: số mẫu rơi phải bằng 0, file WAV dài 30 giây (±0,2), nghe rõ, đúng tốc độ.

- [ ] **Step 1: Chạy từng dòng của ma trận và điền cột kết quả**

| # | Tình huống | `--role` | Đạt khi |
|---|---|---|---|
| 1 | Loa của máy, YouTube đang phát | `console` | các giây có tiếng có RMS > 0,0005 |
| 2 | Không phát gì trong 30 giây | `console` | mọi giây `(im lặng)`; "khung im lặng chèn thêm" gần 30 × tần số của thiết bị; file vẫn dài đủ 30 giây |
| 3 | Phát YouTube, dừng ở giây 10, phát lại ở giây 20 | `console` | giây 11–20 im lặng; file dài đủ 30 giây, tiếng sau giây 20 không bị lệch thời gian |
| 4 | Teams, thiết bị mặc định | `both` | in "Console và Communications là cùng một thiết bị, chỉ thu một lần"; nghe rõ giọng máy thứ hai |
| 5 | Teams với tai nghe Bluetooth, micro đang bật (tai nghe chuyển sang chế độ đàm thoại HFP) | `both` | in hai dòng `nguồn: …`; nghe rõ giọng máy thứ hai trong file đã trộn |
| 6 | Như dòng 5 nhưng chỉ thu Console | `console` | ghi lại: có mất tiếng Teams không. Dòng này cho thấy vì sao cần chế độ `both` |
| 7 | Zoom với tai nghe Bluetooth | `both` | như dòng 5 |
| 8 | Google Meet trên Chrome, rồi trên Edge, tai nghe có dây | `both` | nghe rõ ở cả hai trình duyệt |
| 8a | Cuộc gọi Zalo PC, tai nghe Bluetooth | `both` | như dòng 5 |
| 9 | Rút tai nghe giữa chừng | `both` | ghi lại: tiếp tục, im lặng hay lỗi. MVP cần `IMMNotificationClient` (§6.1) |
| 10 | Windows 10 (nếu có máy): lặp lại dòng 2, 4, 5 | | như trên |

- [ ] **Step 2: Ghi `bench/phase0/results/s2_capture.md`**:
  - phiên bản Windows, bản của từng app họp, tên tai nghe Bluetooth;
  - bảng trên với cột kết quả;
  - kết luận cho giả định 2.

- [ ] **Step 3: Commit**

```powershell
git add bench/phase0/results/s2_capture.md
git commit -m "test(bench): S2 thu âm thanh Teams, Zoom, Meet bằng WASAPI loopback"
```
