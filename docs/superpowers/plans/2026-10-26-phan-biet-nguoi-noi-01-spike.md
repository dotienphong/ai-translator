# Phân biệt người nói, kế hoạch 01: spike đo trước khi làm

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** có code nhận giọng thật (fbank Rust, ERes2Net trên `candle-onnx`, phân cụm trực tuyến), công cụ đo và đủ số đo để chốt ngưỡng và trả lời các câu hỏi mở của spec trước khi viết kế hoạch 02.

**Architecture:**
- **Code dùng lại ở kế hoạch 02, viết thật, có test:** crate mới `crates/speaker-worker` (thư viện): `fbank` (đặc trưng kiểu Kaldi), `embed` (`Embedder`), `cluster` (`SpeakerConfig`, `OnlineClusterer`). Kế hoạch 02 thêm binary `speaker-worker` và giao thức vào crate này.
- **Công cụ đo:** lệnh `latency-bench speaker-eval` (cắt đoạn đúng như app bằng `SileroVad` + `Segmenter`, nhúng, phân cụm, ghi JSONL); binary thăm dò `uia-probe` (UI Automation, chỉ Windows); script Python chấm điểm, chọn ngưỡng, dựng dữ liệu tiếng Việt, đo CPU, dò chỉ báo "đang nói"; app thử quyền Trợ năng của tiến trình con.
- **Dữ liệu và model không vào git:** nằm ở `$DATA` (ngoài repo). Fixture nhỏ cho test (≈ 150 KB) nằm trong `crates/speaker-worker/testdata/`.

**Tech Stack:** Rust 1.98.1, `candle-core`/`candle-onnx` 0.11.0 (cùng bản với `pipeline`), `realfft` 3.5.0, `windows` 0.62.2 (UI Automation); Python 3.12 qua `uv` (`kaldi-native-fbank==1.22.4`, `onnx==1.23.2`, `onnxsim==0.8.1`, `onnxruntime==1.31.0`, `numpy==2.5.4`, `scipy==1.18.1`, `soundfile==0.14.0`, `playwright==1.64.1`); `ffmpeg` (Homebrew); Swift (`swiftc`) cho công cụ macOS.

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` mục 3, 5, 6.2, 6.4, 6.8, 11, 12, 13 (kế hoạch 01), 14.

**Quy ước:**
- `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/phan-biet-nguoi-noi` (worktree, nhánh `phan-biet-nguoi-noi`).
- `M=/Users/dtphong/Desktop/software_business/ai-translator` (thư mục chính: `models/silero_vad_v6.2.3.onnx`, không có trong git).
- `DATA=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi` (ngoài mọi repo: venv, model nhúng giọng, AMI, Common Voice, kết quả thô).
- `B=$W/bench/2026-10-26-nguoi-noi` (script và kết quả tóm tắt, có trong git). Công cụ của nghiên cứu trước spec ở `$B/truoc-spec/`.
- Mọi lệnh bắt đầu bằng `cd $W &&` (hay đường dẫn tuyệt đối), vì shell trở về thư mục chính sau mỗi lệnh.
- Không push, không merge, không deploy.
- Task có nhãn **(cần chủ dự án)**: hỏi trước khi chạy. Các task này mở app họp, dùng tài khoản của chủ dự án, phát tiếng ra loa hay cần máy Windows.
- **Bài học từ nghiên cứu trước spec** (xem `$B/truoc-spec/README.md`): Chrome tự động và Chrome thường cùng bundle id, luôn nhắm theo pid; `meet.google.com/new` vào phòng ngay với camera, micro bật; Dock che thanh điều khiển Meet ở đáy màn hình; Chrome không cho tắt lại `AXManualAccessibility`. Không chụp màn hình có camera. Xong việc thì trả máy như cũ (âm lượng, clipboard, app đã mở, cài đặt Zoom/Teams).

---

## Cấu trúc file

| File | Việc |
|---|---|
| Tạo `crates/speaker-worker/Cargo.toml`, `src/lib.rs` | crate mới (thư viện; kế hoạch 02 thêm binary) |
| Tạo `crates/speaker-worker/src/fbank.rs` | `Fbank`: fbank 80 dải kiểu Kaldi, `compute_raw`, `compute` (trừ trung bình) |
| Tạo `crates/speaker-worker/src/embed.rs` | `Embedder` (ERes2Net qua `candle-onnx`), `cosine`, `DIM`, `MIN_SAMPLES` |
| Tạo `crates/speaker-worker/src/cluster.rs` | `SpeakerConfig`, `Assignment`, `OnlineClusterer` (spec §5.2–§5.4) |
| Tạo `crates/speaker-worker/src/bin/uia-probe.rs` | thăm dò UI Automation trên Windows (`list`, `dump`, `watch`) |
| Tạo `crates/speaker-worker/testdata/{signal.f32, fbank_ref.f32, embed_ref.f32}` | fixture so với `kaldi-native-fbank` và onnxruntime |
| Tạo `crates/latency-bench/src/speaker_eval.rs`; sửa `src/main.rs`, `Cargo.toml` | lệnh `speaker-eval` |
| Sửa `src-tauri/src/models/manifest.rs` (phần test) | test: khóa `speaker` ở gốc manifest không làm app hiện tại lỗi; `kind` lạ thì lỗi |
| Tạo `$B/README.md` | điều kiện đo, cách chạy lại |
| Tạo `$B/setup_env.sh` | venv Python ở `$DATA/venv` |
| Tạo `$B/prepare_model.py` | tải ERes2Net, `onnxsim`, SHA-256, LICENSE |
| Tạo `$B/make_fixtures.py` | sinh fixture của crate |
| Tạo `$B/fetch_ami.sh` | tải 4 cuộc họp AMI và nhãn |
| Tạo `$B/score_spk.py`, `$B/test_score_spk.py` | chấm JSONL của `speaker-eval` với RTTM |
| Tạo `$B/tune.py` | chọn θ và ngưỡng gộp trên dev, báo trên phần kiểm |
| Tạo `$B/build_cv_vi.py` | dựng hội thoại tiếng Việt từ Common Voice, bản qua Opus |
| Tạo `$B/tcc-probe/{parent.swift, child.swift, make-app.sh}` | thử tiến trình con có hưởng quyền Trợ năng của app không |
| Tạo `$B/cpu_sample.py` | lấy mẫu CPU, RAM của tiến trình theo tên |
| Tạo `$B/find_indicators.py` | dò phần tử nào trong cây giao diện đổi theo người đang nói |
| Tạo `$B/results/*.md` | kết quả từng phần và tổng hợp |

---

### Task 0: Mốc ban đầu

**Files:** không

- [ ] **Step 1: Kiểm nhánh, build và test các crate sẽ sửa**

Run: `cd $W && git branch --show-current && cargo test -p pipeline -p latency-bench 2>&1 | tail -5 && cargo test -p meeting-translator --lib models::manifest 2>&1 | tail -3`
Expected: `phan-biet-nguoi-noi`; mọi test `ok`. Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 2: Kiểm build Windows của crate sẽ có code Windows**

Run: `cd $W && cargo check -p pipeline --target x86_64-pc-windows-msvc 2>&1 | tail -2`
Expected: `Finished`. Target đã cài sẵn; `check` không link nên không cần MSVC.

- [ ] **Step 3: Tạo thư mục dữ liệu ngoài repo**

Run: `mkdir -p /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/{models,ami,cv-vi,out} && ls /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi`
Expected: `ami cv-vi models out`.

---

### Task 1: Môi trường Python, model nhúng giọng và fixture

**Files:** Tạo `$B/setup_env.sh`, `$B/prepare_model.py`, `$B/make_fixtures.py`, `crates/speaker-worker/testdata/*`

- [ ] **Step 1: Viết `$B/setup_env.sh`**

```bash
#!/bin/sh
# Môi trường Python cho các script đo của kế hoạch 01 (ngoài repo, ở $DATA/venv).
set -eu
DATA=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi
uv venv -q -p 3.12 "$DATA/venv"
uv pip install -q -p "$DATA/venv/bin/python" \
  kaldi-native-fbank==1.22.4 onnx==1.23.2 onnxsim==0.8.1 onnxruntime==1.31.0 \
  numpy==2.5.4 scipy==1.18.1 soundfile==0.14.0 playwright==1.64.1
"$DATA/venv/bin/python" -c "import kaldi_native_fbank, onnxsim, onnxruntime, scipy; print('ok')"
```

Run: `cd $W && chmod +x bench/2026-10-26-nguoi-noi/setup_env.sh && bench/2026-10-26-nguoi-noi/setup_env.sh`
Expected: `ok`.

- [ ] **Step 2: Viết `$B/prepare_model.py`**

```python
"""Tải model nhúng giọng ERes2Net (3D-Speaker, Apache-2.0) bản ONNX của sherpa-onnx, rút gọn đồ thị bằng onnxsim để
candle-onnx chạy được (spec 2026-10-26-phan-biet-nguoi-noi §4.5, §5.1), ghi SHA-256 và LICENSE.

python -I prepare_model.py <thư mục ra>
"""
import hashlib
import os
import sys
import urllib.request

import onnx
import onnxsim

URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/"
       "3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx")
SHA_GOC = "c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5"
LICENSE_URL = "https://raw.githubusercontent.com/modelscope/3D-Speaker/main/LICENSE"
TEN = "eres2net-sv-en-voxceleb-16k"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    goc = os.path.join(out, TEN + ".orig.onnx")
    if not os.path.exists(goc):
        urllib.request.urlretrieve(URL, goc)
    assert sha256(goc) == SHA_GOC, "SHA-256 của file tải về không khớp"
    m, ok = onnxsim.simplify(onnx.load(goc))
    assert ok, "onnxsim không kiểm được đồ thị đã rút gọn"
    names = ([i.name for i in m.graph.input], [o.name for o in m.graph.output])
    assert names == (["x"], ["embedding"]), names
    dich = os.path.join(out, TEN + ".onnx")
    onnx.save(m, dich)
    urllib.request.urlretrieve(LICENSE_URL, os.path.join(out, TEN + "-LICENSE.txt"))
    print(f"{dich}\n  sha256 {sha256(dich)}\n  {os.path.getsize(dich)} byte")


if __name__ == "__main__":
    main()
```

Run: `cd $W && /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/venv/bin/python -I bench/2026-10-26-nguoi-noi/prepare_model.py /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/models`
Expected: in đường dẫn `…/models/eres2net-sv-en-voxceleb-16k.onnx`, một dòng `sha256 …`, cỡ ≈ 26 MB. Ghi SHA-256 vào `$B/results/toc-do.md` ở Task 9.

- [ ] **Step 3: Viết `$B/make_fixtures.py`**

```python
"""Sinh fixture cho crates/speaker-worker/testdata (spec §5.1): tín hiệu tất định 1,5 s, fbank tham chiếu của
kaldi-native-fbank (chưa trừ trung bình), và nhúng tham chiếu của onnxruntime (đặc trưng đã trừ trung bình theo thời gian,
như sherpa-onnx làm với model 3D-Speaker). Mọi file là f32 little-endian liền nhau.

python -I make_fixtures.py <model .onnx đã rút gọn> <thư mục testdata>
"""
import os
import sys

import kaldi_native_fbank as knf
import numpy as np
import onnxruntime as ort


def signal():
    rng = np.random.default_rng(0)
    t = np.arange(24_000) / 16_000
    chirp = np.sin(2 * np.pi * (150 + 900 * t) * t)
    tone = 0.5 * np.sin(2 * np.pi * 440 * t) * (t > 0.6)
    noise = 0.05 * rng.standard_normal(t.size)
    return (0.3 * (chirp + tone) + noise).astype(np.float32)


def fbank(x):
    o = knf.FbankOptions()
    o.frame_opts.dither = 0
    o.frame_opts.samp_freq = 16_000
    o.mel_opts.num_bins = 80
    f = knf.OnlineFbank(o)
    f.accept_waveform(16_000, x.tolist())
    f.input_finished()
    return np.stack([f.get_frame(i) for i in range(f.num_frames_ready)]).astype(np.float32)


def main():
    model, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    x = signal()
    feats = fbank(x)
    norm = feats - feats.mean(axis=0, keepdims=True)
    emb = ort.InferenceSession(model, providers=["CPUExecutionProvider"]).run(None, {"x": norm[None]})[0].ravel()
    x.tofile(os.path.join(out, "signal.f32"))
    feats.tofile(os.path.join(out, "fbank_ref.f32"))
    emb.astype(np.float32).tofile(os.path.join(out, "embed_ref.f32"))
    print(f"signal {x.size}, fbank {feats.shape}, embed {emb.shape}")


if __name__ == "__main__":
    main()
```

Run: `cd $W && D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && $D/venv/bin/python -I bench/2026-10-26-nguoi-noi/make_fixtures.py $D/models/eres2net-sv-en-voxceleb-16k.onnx crates/speaker-worker/testdata && ls -la crates/speaker-worker/testdata`
Expected: `signal 24000, fbank (148, 80), embed (192,)`; ba file, tổng ≈ 144 KB.

- [ ] **Step 4: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/setup_env.sh bench/2026-10-26-nguoi-noi/prepare_model.py bench/2026-10-26-nguoi-noi/make_fixtures.py crates/speaker-worker/testdata && git commit -m "chore(bench): môi trường đo, chuẩn bị model nhúng giọng và fixture"
```

---

### Task 2: Crate `speaker-worker` và fbank kiểu Kaldi

**Files:** Tạo `crates/speaker-worker/Cargo.toml`, `crates/speaker-worker/src/lib.rs`, `crates/speaker-worker/src/fbank.rs`

- [ ] **Step 1: Kiểm `realfft` là bản ổn định mới nhất (spec chính §6.12)**

Run: `cargo search realfft --limit 1`
Expected: `realfft = "3.5.0"`. Bản khác thì dùng bản đó và ghi lại trong commit.

- [ ] **Step 2: Tạo `crates/speaker-worker/Cargo.toml`**

```toml
[package]
name = "speaker-worker"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

# Nhận giọng và đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §4.1). Không chứa ggml, không có mã mạng.
[dependencies]
anyhow.workspace = true
candle-core = "0.11.0"
candle-onnx = "0.11.0"
realfft = "3.5.0"
serde.workspace = true
serde_json.workspace = true

[target.'cfg(windows)'.dependencies]
# Thăm dò UI Automation (bin/uia-probe.rs, spike kế hoạch 01).
windows = { version = "0.62.2", features = [
    "Win32_Foundation",
    "Win32_System_Com",
    "Win32_System_Ole",
    "Win32_System_Threading",
    "Win32_System_Variant",
    "Win32_UI_Accessibility",
    "Win32_UI_WindowsAndMessaging",
] }
```

- [ ] **Step 3: Tạo `crates/speaker-worker/src/lib.rs`**

```rust
//! Nhận giọng người nói (spec 2026-10-26-phan-biet-nguoi-noi §5): đặc trưng fbank, nhúng giọng ERes2Net, phân cụm trực tuyến.
//! Kế hoạch 02 thêm giao thức, đọc tên từ app họp và binary `speaker-worker`.

pub mod cluster;
pub mod embed;
pub mod fbank;
```

Tạo tạm `src/embed.rs` và `src/cluster.rs` rỗng (chỉ một dòng `//! Viết ở Task 3.` và `//! Viết ở Task 4.`) để crate build được.

- [ ] **Step 4: Viết test của fbank (chưa có code)**

Tạo `crates/speaker-worker/src/fbank.rs` chỉ có phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn read_f32(name: &str) -> Vec<f32> {
        let path = format!("{}/testdata/{name}", env!("CARGO_MANIFEST_DIR"));
        let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
        bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect()
    }

    #[test]
    fn frame_count_follows_kaldi_snip_edges() {
        assert_eq!(Fbank::num_frames(399), 0);
        assert_eq!(Fbank::num_frames(400), 1);
        assert_eq!(Fbank::num_frames(559), 1);
        assert_eq!(Fbank::num_frames(560), 2);
        assert_eq!(Fbank::num_frames(24_000), 148);
    }

    #[test]
    fn povey_window_starts_at_zero_and_peaks_in_the_middle() {
        let f = Fbank::new();
        assert!(f.window[0].abs() < 1e-6);
        assert!((f.window[FRAME_LEN / 2] - 1.0).abs() < 1e-3);
    }

    #[test]
    fn every_mel_bank_has_weights_in_zero_one() {
        let f = Fbank::new();
        assert_eq!(f.banks.len(), NUM_BINS);
        for (first, w) in &f.banks {
            assert!(!w.is_empty());
            assert!(first + w.len() <= FFT_LEN / 2);
            assert!(w.iter().all(|&x| x > 0.0 && x <= 1.0));
        }
    }

    #[test]
    fn matches_kaldi_native_fbank() {
        let signal = read_f32("signal.f32");
        let reference = read_f32("fbank_ref.f32");
        let ours = Fbank::new().compute_raw(&signal);
        assert_eq!(ours.len(), reference.len());
        let max = ours.iter().zip(&reference).map(|(a, b)| (a - b).abs()).fold(0.0f32, f32::max);
        let mean = ours.iter().zip(&reference).map(|(a, b)| (a - b).abs()).sum::<f32>() / ours.len() as f32;
        assert!(max < 2e-3 && mean < 1e-4, "sai lệch lớn nhất {max}, trung bình {mean}");
    }

    #[test]
    fn compute_removes_the_mean_of_each_bin() {
        let feats = Fbank::new().compute(&read_f32("signal.f32"));
        let n = feats.len() / NUM_BINS;
        for b in 0..NUM_BINS {
            let mean = (0..n).map(|f| feats[f * NUM_BINS + b]).sum::<f32>() / n as f32;
            assert!(mean.abs() < 1e-4, "dải {b}: trung bình {mean}");
        }
    }

    #[test]
    fn too_short_input_gives_no_frames() {
        assert!(Fbank::new().compute(&[0.0; 100]).is_empty());
    }
}
```

- [ ] **Step 5: Chạy test, thấy lỗi biên dịch**

Run: `cd $W && cargo test -p speaker-worker fbank 2>&1 | tail -5`
Expected: lỗi `cannot find type Fbank` (chưa có code).

- [ ] **Step 6: Viết code fbank (đặt trên phần test trong cùng file)**

```rust
//! Đặc trưng fbank kiểu Kaldi cho model nhúng giọng (spec 2026-10-26-phan-biet-nguoi-noi §5.1): 80 dải mel, khung 25 ms, bước
//! 10 ms (`snip_edges`), bỏ thành phần DC, nhấn tần 0,97, cửa sổ povey, đệm tới 512, phổ công suất, log; không dither. Khớp
//! `kaldi-native-fbank` với `dither = 0` và các mặc định còn lại (test `matches_kaldi_native_fbank`). Mẫu đầu vào trong [-1, 1]
//! (model 3D-Speaker dùng `normalize_samples = 1`, không nhân 32768).

use std::sync::Arc;

use realfft::{RealFftPlanner, RealToComplex};

pub const FRAME_LEN: usize = 400;
pub const FRAME_SHIFT: usize = 160;
pub const NUM_BINS: usize = 80;
const FFT_LEN: usize = 512;
const SAMPLE_RATE: f32 = 16_000.0;
const PREEMPH: f32 = 0.97;
const LOW_FREQ: f32 = 20.0;

pub struct Fbank {
    window: Vec<f32>,
    /// Mỗi dải mel: chỉ số bin FFT đầu tiên có trọng số và các trọng số liên tiếp.
    banks: Vec<(usize, Vec<f32>)>,
    fft: Arc<dyn RealToComplex<f32>>,
}

fn mel(freq: f32) -> f32 {
    1127.0 * (1.0 + freq / 700.0).ln()
}

impl Default for Fbank {
    fn default() -> Self {
        Self::new()
    }
}

impl Fbank {
    pub fn new() -> Self {
        let window = (0..FRAME_LEN)
            .map(|i| {
                let a = 2.0 * std::f64::consts::PI * i as f64 / (FRAME_LEN - 1) as f64;
                (0.5 - 0.5 * a.cos()).powf(0.85) as f32
            })
            .collect();
        let bin_width = SAMPLE_RATE / FFT_LEN as f32;
        let (low, high) = (mel(LOW_FREQ), mel(SAMPLE_RATE / 2.0));
        let delta = (high - low) / (NUM_BINS + 1) as f32;
        let banks = (0..NUM_BINS)
            .map(|b| {
                let left = low + b as f32 * delta;
                let center = left + delta;
                let right = center + delta;
                let mut first = None;
                let mut weights = Vec::new();
                // Như Kaldi: chỉ xét FFT_LEN / 2 bin đầu (không có bin Nyquist).
                for i in 0..FFT_LEN / 2 {
                    let m = mel(bin_width * i as f32);
                    if m > left && m < right {
                        let w = if m <= center { (m - left) / (center - left) } else { (right - m) / (right - center) };
                        first.get_or_insert(i);
                        weights.push(w);
                    }
                }
                (first.unwrap_or(0), weights)
            })
            .collect();
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(FFT_LEN);
        Self { window, banks, fft }
    }

    /// Số khung của `len` mẫu (`snip_edges` của Kaldi: chỉ khung đủ 400 mẫu).
    pub fn num_frames(len: usize) -> usize {
        if len < FRAME_LEN { 0 } else { 1 + (len - FRAME_LEN) / FRAME_SHIFT }
    }

    /// Log fbank chưa chuẩn hóa: `num_frames × NUM_BINS` giá trị, theo hàng.
    pub fn compute_raw(&self, samples: &[f32]) -> Vec<f32> {
        let frames = Self::num_frames(samples.len());
        let mut out = Vec::with_capacity(frames * NUM_BINS);
        let mut input = self.fft.make_input_vec();
        let mut spectrum = self.fft.make_output_vec();
        let mut scratch = self.fft.make_scratch_vec();
        let mut power = vec![0.0f32; FFT_LEN / 2 + 1];
        let mut x = [0.0f32; FRAME_LEN];
        for f in 0..frames {
            let frame = &samples[f * FRAME_SHIFT..f * FRAME_SHIFT + FRAME_LEN];
            let mean = frame.iter().sum::<f32>() / FRAME_LEN as f32;
            for (dst, src) in x.iter_mut().zip(frame) {
                *dst = src - mean;
            }
            for i in (1..FRAME_LEN).rev() {
                x[i] -= PREEMPH * x[i - 1];
            }
            x[0] -= PREEMPH * x[0];
            input.fill(0.0);
            for i in 0..FRAME_LEN {
                input[i] = x[i] * self.window[i];
            }
            self.fft
                .process_with_scratch(&mut input, &mut spectrum, &mut scratch)
                .expect("độ dài bộ đệm FFT cố định");
            for (p, c) in power.iter_mut().zip(&spectrum) {
                *p = c.re * c.re + c.im * c.im;
            }
            for (first, weights) in &self.banks {
                let energy: f32 = weights.iter().zip(&power[*first..]).map(|(w, p)| w * p).sum();
                out.push(energy.max(f32::EPSILON).ln());
            }
        }
        out
    }

    /// Log fbank đã trừ trung bình theo thời gian của từng dải (`feature_normalize_type: global-mean`).
    pub fn compute(&self, samples: &[f32]) -> Vec<f32> {
        let mut feats = self.compute_raw(samples);
        let frames = feats.len() / NUM_BINS;
        for b in 0..NUM_BINS {
            let mean = (0..frames).map(|f| feats[f * NUM_BINS + b]).sum::<f32>() / frames.max(1) as f32;
            for f in 0..frames {
                feats[f * NUM_BINS + b] -= mean;
            }
        }
        feats
    }
}
```

- [ ] **Step 7: Chạy test, thấy đạt**

Run: `cd $W && cargo test -p speaker-worker fbank 2>&1 | tail -5`
Expected: `test result: ok. 6 passed`. Nếu `matches_kaldi_native_fbank` trượt: in vài giá trị đầu của hai bên, so từng bước (cửa sổ, nhấn tần, dải mel) với mã nguồn `kaldi-native-fbank` (`feature-window.cc`, `mel-computations.cc`); không nới ngưỡng để cho qua.

- [ ] **Step 8: Clippy và fmt**

Run: `cd $W && cargo fmt -p speaker-worker && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -3`
Expected: không cảnh báo.

- [ ] **Step 9: Commit**

```bash
cd $W && git add crates/speaker-worker Cargo.lock && git commit -m "feat(speaker): crate speaker-worker và fbank kiểu Kaldi"
```

---

### Task 3: `Embedder` (ERes2Net trên `candle-onnx`)

**Files:** Sửa `crates/speaker-worker/src/embed.rs`

- [ ] **Step 1: Viết test**

Ghi đè `crates/speaker-worker/src/embed.rs` bằng phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::fbank::tests::read_f32;

    #[test]
    fn cosine_of_parallel_orthogonal_and_opposite_vectors() {
        assert!((cosine(&[1.0, 2.0], &[2.0, 4.0]) - 1.0).abs() < 1e-6);
        assert!(cosine(&[1.0, 0.0], &[0.0, 3.0]).abs() < 1e-6);
        assert!((cosine(&[1.0, 0.0], &[-1.0, 0.0]) + 1.0).abs() < 1e-6);
        assert_eq!(cosine(&[0.0, 0.0], &[1.0, 0.0]), 0.0);
    }

    /// Cần model thật: `SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx cargo test -p speaker-worker -- --ignored`.
    /// Chạy trên luồng stack 16 MiB vì candle-onnx cần stack lớn ở bản debug.
    #[test]
    #[ignore]
    fn embedding_matches_onnxruntime() {
        let path = std::env::var("SPEAKER_MODEL").expect("đặt SPEAKER_MODEL");
        std::thread::Builder::new()
            .stack_size(16 << 20)
            .spawn(move || {
                let e = Embedder::load(std::path::Path::new(&path)).unwrap();
                let ours = e.embed(&read_f32("signal.f32")).unwrap();
                let reference = read_f32("embed_ref.f32");
                assert_eq!(ours.len(), DIM);
                let c = cosine(&ours, &reference);
                assert!(c >= 0.999, "cosine {c}");
                assert!(e.embed(&[0.0; MIN_SAMPLES - 1]).is_err());
            })
            .unwrap()
            .join()
            .unwrap();
    }
}
```

Để `read_f32` dùng được từ module khác, trong `fbank.rs` đổi `mod tests` thành `pub(crate) mod tests`.

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cd $W && cargo test -p speaker-worker embed 2>&1 | tail -3`
Expected: lỗi `cannot find function cosine`.

- [ ] **Step 3: Viết code (trên phần test)**

```rust
//! Nhúng giọng ERes2Net (3D-Speaker, Apache-2.0) bằng candle-onnx (spec 2026-10-26-phan-biet-nguoi-noi §5.1): fbank đã trừ
//! trung bình → model → vector 192 chiều. Model là bản ONNX của sherpa-onnx đã rút gọn bằng onnxsim (bench/…/prepare_model.py):
//! bản chưa rút gọn có op `ReduceProd`, candle-onnx không chạy được.
//!
//! Bản debug cần stack lớn cho mỗi lần suy luận: tạo và dùng `Embedder` trên luồng có stack từ 8 MiB.

use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result, ensure};
use candle_core::{Device, Tensor};

use crate::fbank::{Fbank, NUM_BINS};

pub const DIM: usize = 192;
/// Ngắn hơn 0,5 s thì không nhúng (spec §5.2).
pub const MIN_SAMPLES: usize = 8_000;
/// Đoạn dài hơn chỉ lấy 30 s đầu.
pub const MAX_SAMPLES: usize = 16_000 * 30;
const INPUT: &str = "x";
const OUTPUT: &str = "embedding";

pub struct Embedder {
    model: candle_onnx::onnx::ModelProto,
    fbank: Fbank,
    device: Device,
}

impl Embedder {
    pub fn load(path: &Path) -> Result<Self> {
        let model = candle_onnx::read_file(path).with_context(|| format!("không đọc được {}", path.display()))?;
        let graph = model.graph.as_ref().context("model ONNX không có graph")?;
        ensure!(graph.input.iter().any(|i| i.name == INPUT), "model không có input `{INPUT}`");
        ensure!(graph.output.iter().any(|o| o.name == OUTPUT), "model không có output `{OUTPUT}`");
        let embedder = Self { model, fbank: Fbank::new(), device: Device::Cpu };
        // Chạy thử, để model sai hay op không được hỗ trợ lộ ra ngay lúc nạp.
        let probe: Vec<f32> = (0..16_000).map(|i| 0.1 * (i as f32 * 0.05).sin()).collect();
        let v = embedder.embed(&probe).context("chạy thử model nhúng giọng lúc nạp thất bại")?;
        ensure!(v.iter().all(|x| x.is_finite()), "nhúng chạy thử có giá trị không hữu hạn");
        Ok(embedder)
    }

    /// Nhúng phần tiếng nói của một đoạn (16 kHz, [-1, 1]); từ `MIN_SAMPLES` mẫu.
    pub fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
        ensure!(samples.len() >= MIN_SAMPLES, "đoạn quá ngắn để nhúng: {} mẫu", samples.len());
        let samples = &samples[..samples.len().min(MAX_SAMPLES)];
        let feats = self.fbank.compute(samples);
        let frames = feats.len() / NUM_BINS;
        let x = Tensor::from_vec(feats, (1, frames, NUM_BINS), &self.device)?;
        let mut outputs = candle_onnx::simple_eval(&self.model, HashMap::from([(INPUT.to_string(), x)]))?;
        let v = outputs
            .remove(OUTPUT)
            .context("thiếu output embedding")?
            .flatten_all()?
            .to_vec1::<f32>()?;
        ensure!(v.len() == DIM, "nhúng có {} chiều, cần {DIM}", v.len());
        Ok(v)
    }
}

/// Cosine của hai vector; 0 khi một vector bằng 0.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na * nb) }
}
```

- [ ] **Step 4: Chạy test thường và test cần model**

Run: `cd $W && cargo test -p speaker-worker embed 2>&1 | tail -3 && SPEAKER_MODEL=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/models/eres2net-sv-en-voxceleb-16k.onnx cargo test -p speaker-worker --release embedding_matches_onnxruntime -- --ignored 2>&1 | tail -3`
Expected: cả hai `ok`. Trượt cosine thì kiểm lại fixture (Task 1 Step 3 dùng đúng file `.onnx` đã rút gọn) trước khi sửa code.

- [ ] **Step 5: Clippy, fmt, commit**

```bash
cd $W && cargo fmt -p speaker-worker && cargo clippy -p speaker-worker --all-targets -- -D warnings && git add crates/speaker-worker && git commit -m "feat(speaker): nhúng giọng ERes2Net bằng candle-onnx"
```

---

### Task 4: Phân cụm trực tuyến (`SpeakerConfig`, `OnlineClusterer`)

**Files:** Sửa `crates/speaker-worker/src/cluster.rs`

- [ ] **Step 1: Viết test**

Ghi đè `crates/speaker-worker/src/cluster.rs` bằng phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const A: [f32; 3] = [1.0, 0.0, 0.0];
    const B: [f32; 3] = [0.0, 1.0, 0.0];
    const NEAR_A: [f32; 3] = [0.95, 0.1, 0.0];

    fn run(cfg: SpeakerConfig, steps: &[(u64, Option<&[f32]>)]) -> Vec<Assignment> {
        let mut c = OnlineClusterer::new(cfg);
        steps.iter().map(|(ms, e)| c.assign(*ms, *e)).collect()
    }

    #[test]
    fn first_long_segment_opens_voice_1() {
        let a = run(SpeakerConfig::default(), &[(2000, Some(&A))]);
        assert_eq!(a[0].voice, Some(1));
    }

    #[test]
    fn similar_joins_and_different_long_opens_a_new_voice() {
        let a = run(SpeakerConfig::default(), &[(2000, Some(&A)), (2000, Some(&NEAR_A)), (2000, Some(&B))]);
        let voices: Vec<_> = a.iter().map(|x| x.voice).collect();
        assert_eq!(voices, [Some(1), Some(1), Some(2)]);
    }

    #[test]
    fn short_segment_takes_the_previous_voice_even_with_an_embedding() {
        let a = run(
            SpeakerConfig::default(),
            &[(2000, Some(&A)), (2000, Some(&B)), (300, None), (300, Some(&A))],
        );
        assert_eq!(a[2].voice, Some(2));
        assert_eq!(a[3].voice, Some(2));
        assert_eq!(a[3].confidence, 0.0);
    }

    #[test]
    fn mid_length_unlike_anyone_takes_the_previous_voice_and_opens_none() {
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        c.assign(2000, Some(&A));
        assert_eq!(c.assign(1000, Some(&B)).voice, Some(1));
        assert_eq!(c.voice_count(), 1);
    }

    #[test]
    fn mid_length_like_an_existing_voice_joins_it() {
        let a = run(SpeakerConfig::default(), &[(2000, Some(&A)), (2000, Some(&B)), (1000, Some(&A))]);
        assert_eq!(a[2].voice, Some(1));
    }

    #[test]
    fn nothing_yet_and_too_short_to_open_gives_none() {
        let a = run(SpeakerConfig::default(), &[(1000, Some(&A))]);
        assert_eq!(a[0].voice, None);
    }

    #[test]
    fn at_the_voice_limit_a_new_speaker_goes_to_the_nearest_voice() {
        let cfg = SpeakerConfig { max_voices: 2, ..SpeakerConfig::default() };
        let c2 = [0.3, 0.0, 0.954];
        let a = run(cfg, &[(2000, Some(&A)), (2000, Some(&B)), (2000, Some(&c2))]);
        assert_eq!(a[2].voice, Some(1));
    }

    #[test]
    fn similar_voices_merge_once_both_have_enough_speech() {
        let cfg = SpeakerConfig { theta: 0.9, merge_theta: 0.7, merge_min_ms: 3000, ..SpeakerConfig::default() };
        let d = [0.8, 0.6, 0.0];
        let a = run(cfg, &[(4000, Some(&A)), (4000, Some(&d))]);
        assert_eq!(a[1].merged, vec![(2, 1)]);
        assert_eq!(a[1].voice, Some(1));
    }

    #[test]
    fn short_voices_do_not_merge() {
        let cfg = SpeakerConfig { theta: 0.9, merge_theta: 0.7, merge_min_ms: 10_000, ..SpeakerConfig::default() };
        let d = [0.8, 0.6, 0.0];
        let a = run(cfg, &[(4000, Some(&A)), (4000, Some(&d))]);
        assert!(a[1].merged.is_empty());
        assert_eq!(a[1].voice, Some(2));
    }

    #[test]
    fn same_input_gives_same_output() {
        let steps: Vec<(u64, Option<&[f32]>)> =
            vec![(2000, Some(&A)), (800, Some(&B)), (2500, Some(&B)), (300, None), (1600, Some(&NEAR_A))];
        assert_eq!(run(SpeakerConfig::default(), &steps), run(SpeakerConfig::default(), &steps));
    }

    #[test]
    fn config_reads_partial_json_and_keeps_defaults() {
        let cfg: SpeakerConfig = serde_json::from_str(r#"{"theta": 0.45}"#).unwrap();
        assert_eq!(cfg.theta, 0.45);
        assert_eq!(cfg.max_voices, SpeakerConfig::default().max_voices);
    }
}
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cd $W && cargo test -p speaker-worker cluster 2>&1 | tail -3`
Expected: lỗi `cannot find type SpeakerConfig`.

- [ ] **Step 3: Viết code (trên phần test)**

```rust
//! Phân cụm giọng trực tuyến, nhân quả (spec 2026-10-26-phan-biet-nguoi-noi §5.2–§5.4): mỗi đoạn VAD vào một giọng đã có, mở
//! giọng mới, hay lấy giọng của đoạn trước. Tâm của giọng là tổng nhúng đã chuẩn hóa nhân thời lượng. Hai giọng rất giống nhau
//! và đều đã nói đủ lâu thì gộp. Kết quả tất định với cùng chuỗi đoạn.

use serde::{Deserialize, Serialize};

use crate::embed::cosine;

/// Ngưỡng của nhận giọng; đổi được qua khóa `speaker_config` của manifest (spec §4.5). Thiếu khóa nào thì dùng mặc định.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SpeakerConfig {
    /// Cosine tối thiểu để vào một giọng đã có.
    pub theta: f32,
    /// Ngắn hơn thì không dùng nhúng, lấy giọng của đoạn trước.
    pub min_embed_ms: u64,
    /// Từ độ dài này mới được mở giọng mới.
    pub min_new_ms: u64,
    /// Từ độ dài này mới cập nhật tâm của giọng.
    pub min_update_ms: u64,
    pub max_voices: usize,
    /// Cosine giữa hai tâm để tự gộp.
    pub merge_theta: f32,
    /// Mỗi giọng phải có ít nhất chừng này tiếng nói mới được tự gộp.
    pub merge_min_ms: u64,
}

impl Default for SpeakerConfig {
    fn default() -> Self {
        Self {
            theta: 0.40,
            min_embed_ms: 500,
            min_new_ms: 1500,
            min_update_ms: 1000,
            max_voices: 8,
            merge_theta: 0.70,
            merge_min_ms: 10_000,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Assignment {
    /// `None` khi chưa có giọng nào và đoạn quá ngắn để mở giọng.
    pub voice: Option<u32>,
    /// Cosine với giọng được chọn; 1 khi mở giọng mới; 0 khi lấy giọng của đoạn trước.
    pub confidence: f32,
    /// Các cặp (giọng bị gộp, giọng giữ lại) vừa gộp ở lần gọi này, theo thứ tự.
    pub merged: Vec<(u32, u32)>,
}

struct Voice {
    id: u32,
    sum: Vec<f32>,
    speech_ms: u64,
}

pub struct OnlineClusterer {
    cfg: SpeakerConfig,
    voices: Vec<Voice>,
    next_id: u32,
    prev: Option<u32>,
}

fn normalized(e: &[f32]) -> Vec<f32> {
    let n = e.iter().map(|x| x * x).sum::<f32>().sqrt();
    if n == 0.0 { e.to_vec() } else { e.iter().map(|x| x / n).collect() }
}

impl OnlineClusterer {
    pub fn new(cfg: SpeakerConfig) -> Self {
        Self { cfg, voices: Vec::new(), next_id: 1, prev: None }
    }

    pub fn voice_count(&self) -> usize {
        self.voices.len()
    }

    /// Gán một đoạn có `speech_ms` tiếng nói; `embedding` là `None` khi đoạn không được nhúng.
    pub fn assign(&mut self, speech_ms: u64, embedding: Option<&[f32]>) -> Assignment {
        let Some(raw) = embedding.filter(|_| speech_ms >= self.cfg.min_embed_ms) else {
            return Assignment { voice: self.prev, confidence: 0.0, merged: Vec::new() };
        };
        let e = normalized(raw);
        let best = self
            .voices
            .iter()
            .enumerate()
            .map(|(i, v)| (i, cosine(&v.sum, &e)))
            .fold(None, |acc: Option<(usize, f32)>, x| match acc {
                Some(a) if a.1 >= x.1 => Some(a),
                _ => Some(x),
            });
        let (voice, confidence) = match best {
            Some((i, sim)) if sim >= self.cfg.theta => {
                if speech_ms >= self.cfg.min_update_ms {
                    let v = &mut self.voices[i];
                    for (s, x) in v.sum.iter_mut().zip(&e) {
                        *s += x * speech_ms as f32;
                    }
                    v.speech_ms += speech_ms;
                }
                (Some(self.voices[i].id), sim)
            }
            _ if speech_ms >= self.cfg.min_new_ms && self.voices.len() < self.cfg.max_voices => {
                let id = self.next_id;
                self.next_id += 1;
                self.voices.push(Voice { id, sum: e.iter().map(|x| x * speech_ms as f32).collect(), speech_ms });
                (Some(id), 1.0)
            }
            Some((i, sim)) if speech_ms >= self.cfg.min_new_ms => (Some(self.voices[i].id), sim),
            _ => (self.prev, 0.0),
        };
        let merged = self.merge();
        let voice = voice.map(|v| merged.iter().fold(v, |v, &(from, into)| if v == from { into } else { v }));
        self.prev = voice;
        Assignment { voice, confidence, merged }
    }

    fn merge(&mut self) -> Vec<(u32, u32)> {
        let mut out = Vec::new();
        loop {
            let mut best: Option<(usize, usize, f32)> = None;
            for i in 0..self.voices.len() {
                for j in i + 1..self.voices.len() {
                    let (a, b) = (&self.voices[i], &self.voices[j]);
                    if a.speech_ms < self.cfg.merge_min_ms || b.speech_ms < self.cfg.merge_min_ms {
                        continue;
                    }
                    let s = cosine(&a.sum, &b.sum);
                    if s >= self.cfg.merge_theta && best.is_none_or(|(_, _, bs)| s > bs) {
                        best = Some((i, j, s));
                    }
                }
            }
            let Some((i, j, _)) = best else { break };
            let (keep, drop) = if self.voices[i].speech_ms >= self.voices[j].speech_ms { (i, j) } else { (j, i) };
            let dropped = self.voices.remove(drop);
            let keep = if drop < keep { keep - 1 } else { keep };
            for (s, x) in self.voices[keep].sum.iter_mut().zip(&dropped.sum) {
                *s += x;
            }
            self.voices[keep].speech_ms += dropped.speech_ms;
            out.push((dropped.id, self.voices[keep].id));
        }
        out
    }
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd $W && cargo test -p speaker-worker cluster 2>&1 | tail -3`
Expected: `test result: ok. 11 passed`.

- [ ] **Step 5: Clippy, fmt, commit**

```bash
cd $W && cargo fmt -p speaker-worker && cargo clippy -p speaker-worker --all-targets -- -D warnings && git add crates/speaker-worker && git commit -m "feat(speaker): phân cụm giọng trực tuyến"
```

---

### Task 5: Lệnh `latency-bench speaker-eval`

**Files:** Tạo `crates/latency-bench/src/speaker_eval.rs`; sửa `crates/latency-bench/src/main.rs`, `crates/latency-bench/Cargo.toml`

- [ ] **Step 1: Thêm phụ thuộc**

Trong `crates/latency-bench/Cargo.toml`, mục `[dependencies]`, thêm sau dòng `serde_json.workspace = true`:

```toml
# Nhận giọng người nói (spec 2026-10-26-phan-biet-nguoi-noi §12, lệnh `speaker-eval`).
speaker-worker = { path = "../speaker-worker" }
```

- [ ] **Step 2: Viết `crates/latency-bench/src/speaker_eval.rs`**

```rust
//! Lệnh `speaker-eval` (spec 2026-10-26-phan-biet-nguoi-noi §12, A-spk1, A-spk2): cắt đoạn đúng như app (`SileroVad` +
//! `Segmenter`), nhúng phần tiếng nói của từng đoạn, phân cụm trực tuyến; ghi mỗi đoạn một dòng JSON để `score_spk.py` chấm
//! với RTTM. `--embeddings-out` lưu đoạn và nhúng để chạy lại phân cụm với ngưỡng khác (`--embeddings-in`, không cần model).
//! Khi hai giọng được gộp, nhãn của các đoạn trước cũng đổi, như giao diện sẽ làm.

use std::io::Write;
use std::path::PathBuf;
use std::time::Instant;

use anyhow::{Context, Result, ensure};
use clap::Args;
use pipeline::config::PipelineConfig;
use pipeline::segmenter::{FRAME_SAMPLES, Segmenter, SegmenterConfig};
use pipeline::vad::SileroVad;
use serde::{Deserialize, Serialize};
use speaker_worker::cluster::{OnlineClusterer, SpeakerConfig};
use speaker_worker::embed::Embedder;

#[derive(Args)]
pub struct SpeakerEvalArgs {
    /// WAV 16 kHz (gộp về mono). Không cần khi có `--embeddings-in`.
    #[arg(long)]
    wav: Option<PathBuf>,
    #[arg(long)]
    vad_model: Option<PathBuf>,
    #[arg(long)]
    speaker_model: Option<PathBuf>,
    /// Ngưỡng im lặng chốt đoạn (mặc định của app: 50 ms).
    #[arg(long, default_value_t = 50)]
    end_silence_ms: u64,
    #[arg(long)]
    embeddings_out: Option<PathBuf>,
    #[arg(long)]
    embeddings_in: Option<PathBuf>,
    /// File JSONL kết quả.
    #[arg(long)]
    out: PathBuf,
    #[arg(long)]
    theta: Option<f32>,
    #[arg(long)]
    merge_theta: Option<f32>,
    #[arg(long)]
    merge_min_ms: Option<u64>,
    #[arg(long)]
    min_new_ms: Option<u64>,
}

#[derive(Serialize, Deserialize)]
struct CachedSegment {
    start_ms: u64,
    end_ms: u64,
    embedding: Option<Vec<f32>>,
    embed_ms: f64,
}

pub fn run(args: SpeakerEvalArgs) -> Result<()> {
    let segments: Vec<CachedSegment> = match &args.embeddings_in {
        Some(p) => serde_json::from_reader(std::io::BufReader::new(
            std::fs::File::open(p).with_context(|| format!("không mở được {}", p.display()))?,
        ))?,
        None => embed_all(&args)?,
    };
    if let Some(p) = &args.embeddings_out {
        serde_json::to_writer(std::io::BufWriter::new(std::fs::File::create(p)?), &segments)?;
    }
    let mut cfg = SpeakerConfig::default();
    if let Some(v) = args.theta {
        cfg.theta = v;
    }
    if let Some(v) = args.merge_theta {
        cfg.merge_theta = v;
    }
    if let Some(v) = args.merge_min_ms {
        cfg.merge_min_ms = v;
    }
    if let Some(v) = args.min_new_ms {
        cfg.min_new_ms = v;
    }
    let mut clusterer = OnlineClusterer::new(cfg);
    let mut voices: Vec<(Option<u32>, f32)> = Vec::with_capacity(segments.len());
    for s in &segments {
        let a = clusterer.assign(s.end_ms - s.start_ms, s.embedding.as_deref());
        for &(from, into) in &a.merged {
            for (v, _) in voices.iter_mut() {
                if *v == Some(from) {
                    *v = Some(into);
                }
            }
        }
        voices.push((a.voice, a.confidence));
    }
    let mut out = std::io::BufWriter::new(std::fs::File::create(&args.out)?);
    for (s, (voice, confidence)) in segments.iter().zip(&voices) {
        writeln!(
            out,
            "{}",
            serde_json::json!({
                "start_ms": s.start_ms, "end_ms": s.end_ms, "voice": voice,
                "confidence": confidence, "embed_ms": s.embed_ms,
            })
        )?;
    }
    let mut ms: Vec<f64> = segments.iter().filter(|s| s.embedding.is_some()).map(|s| s.embed_ms).collect();
    ms.sort_by(f64::total_cmp);
    let speech_ms: u64 = segments.iter().filter(|s| s.embedding.is_some()).map(|s| s.end_ms - s.start_ms).sum();
    let total: f64 = ms.iter().sum();
    let pct = |p: f64| ms.get(((ms.len() as f64 - 1.0) * p).round() as usize).copied().unwrap_or(0.0);
    println!(
        "{} đoạn, {} có nhúng, {} giọng; nhúng p50 {:.1} ms, p90 {:.1} ms; thời gian nhúng / thời lượng tiếng nói {:.1}%",
        segments.len(),
        ms.len(),
        clusterer.voice_count(),
        pct(0.5),
        pct(0.9),
        if speech_ms > 0 { total / speech_ms as f64 * 100.0 } else { 0.0 },
    );
    Ok(())
}

fn embed_all(args: &SpeakerEvalArgs) -> Result<Vec<CachedSegment>> {
    let wav = args.wav.as_ref().context("thiếu --wav")?;
    let (samples, rate) = crate::wavio::read_wav_mono(wav)?;
    ensure!(rate == 16_000, "{}: cần WAV 16 kHz, nhận {rate} Hz", wav.display());
    let mut vad = SileroVad::load(args.vad_model.as_ref().context("thiếu --vad-model")?)?;
    let embedder = Embedder::load(args.speaker_model.as_ref().context("thiếu --speaker-model")?)?;
    let config = PipelineConfig::default();
    let mut segmenter = Segmenter::new(SegmenterConfig { end_silence_ms: args.end_silence_ms, ..config.segmenter.clone() });
    let mut bounds = Vec::new();
    for frame in samples.chunks_exact(FRAME_SAMPLES) {
        let p = vad.prob(frame)?;
        bounds.extend(segmenter.push(frame, p).into_iter().map(|s| (s.start_ms, s.end_ms)));
    }
    bounds.extend(segmenter.flush().map(|s| (s.start_ms, s.end_ms)));
    let min_ms = SpeakerConfig::default().min_embed_ms;
    bounds
        .into_iter()
        .map(|(start_ms, end_ms)| {
            if end_ms - start_ms < min_ms {
                return Ok(CachedSegment { start_ms, end_ms, embedding: None, embed_ms: 0.0 });
            }
            let a = (start_ms * 16) as usize;
            let b = ((end_ms * 16) as usize).min(samples.len());
            let t0 = Instant::now();
            let e = embedder.embed(&samples[a..b])?;
            Ok(CachedSegment { start_ms, end_ms, embedding: Some(e), embed_ms: t0.elapsed().as_secs_f64() * 1000.0 })
        })
        .collect()
}
```

- [ ] **Step 3: Nối lệnh vào `main.rs`**

Trong `crates/latency-bench/src/main.rs`: thêm `mod speaker_eval;` sau `mod session_replay;`; thêm vào enum `Command`, sau `MixEval(...)`:

```rust
    /// Nhận giọng người nói trên một bản ghi: cắt đoạn như app, nhúng, phân cụm (spec 2026-10-26-phan-biet-nguoi-noi §12).
    SpeakerEval(speaker_eval::SpeakerEvalArgs),
```

và trong `match command`, sau `Command::MixEval(args) => mix_eval::run(args),`:

```rust
            Command::SpeakerEval(args) => speaker_eval::run(args),
```

Sửa dòng mô tả đầu file thành: `//! Công cụ đo: `latency` (S6), `asr-eval` (S7, A4), `mt-eval` (A3, qua đúng code dịch của app), `session` (đo bằng` / `//! `pipeline::Engine` thật, spec 2026-10-10 §10.1), `speaker-eval` (nhận giọng, spec 2026-10-26-phan-biet-nguoi-noi §12).`

- [ ] **Step 4: Build và chạy thử trên một cuộc họp AMI ngắn**

Tải trước một file (Task 7 tải đủ):

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && curl -sSfL -o $D/ami/IS1009a.Mix-Headset.wav https://groups.inf.ed.ac.uk/ami/AMICorpusMirror//amicorpus/IS1009a/audio/IS1009a.Mix-Headset.wav && cd $W && cargo build --release -p latency-bench 2>&1 | tail -1 && RAYON_NUM_THREADS=2 target/release/latency-bench speaker-eval --wav $D/ami/IS1009a.Mix-Headset.wav --vad-model /Users/dtphong/Desktop/software_business/ai-translator/models/silero_vad_v6.2.3.onnx --speaker-model $D/models/eres2net-sv-en-voxceleb-16k.onnx --embeddings-out $D/out/IS1009a.Mix-Headset.emb.json --out $D/out/IS1009a.Mix-Headset.jsonl && head -2 $D/out/IS1009a.Mix-Headset.jsonl`
Expected: dòng tóm tắt dạng `261 đoạn, … có nhúng, … giọng; nhúng p50 … ms`; số đoạn bằng 261 (khớp nghiên cứu trước spec); hai dòng JSON có `voice`.

- [ ] **Step 5: Chạy lại từ cache với ngưỡng khác**

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W && target/release/latency-bench speaker-eval --embeddings-in $D/out/IS1009a.Mix-Headset.emb.json --theta 0.5 --out /dev/null`
Expected: in dòng tóm tắt trong < 1 s, không cần model.

- [ ] **Step 6: Clippy, fmt, commit**

```bash
cd $W && cargo fmt -p latency-bench && cargo clippy -p latency-bench --all-targets -- -D warnings && git add crates/latency-bench Cargo.lock && git commit -m "feat(bench): lệnh speaker-eval đo nhận giọng người nói"
```

---

### Task 6: Chấm điểm và chọn ngưỡng (Python)

**Files:** Tạo `$B/score_spk.py`, `$B/test_score_spk.py`, `$B/tune.py`

- [ ] **Step 1: Viết test `$B/test_score_spk.py`**

```python
"""python -I -m unittest test_score_spk (chạy trong bench/2026-10-26-nguoi-noi)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score_spk import score  # noqa: E402

TURNS = [(0.0, 2.0, "A"), (2.0, 4.0, "B")]


def segs(*rows):
    return [{"start_ms": a, "end_ms": b, "voice": v} for a, b, v in rows]


class ScoreTest(unittest.TestCase):
    def test_perfect_labels(self):
        s = score(segs((0, 2000, 1), (2000, 4000, 2)), TURNS)
        self.assertAlmostEqual(s["time"], 1.0)
        self.assertAlmostEqual(s["line_all"], 1.0)
        self.assertEqual(s["voices"], 2)

    def test_label_names_do_not_matter(self):
        s = score(segs((0, 2000, 7), (2000, 4000, 3)), TURNS)
        self.assertAlmostEqual(s["line_all"], 1.0)

    def test_one_voice_for_everyone_is_half_right(self):
        s = score(segs((0, 2000, 1), (2000, 4000, 1)), TURNS)
        self.assertAlmostEqual(s["time"], 0.5)
        self.assertAlmostEqual(s["line_all"], 0.5)

    def test_unlabelled_segment_counts_as_wrong(self):
        s = score(segs((0, 2000, 1), (2000, 4000, None)), TURNS)
        self.assertAlmostEqual(s["line_all"], 0.5)

    def test_segment_spanning_two_speakers_lowers_purity(self):
        s = score(segs((1000, 3000, 1)), TURNS)
        self.assertAlmostEqual(s["purity"], 0.5)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd $W/bench/2026-10-26-nguoi-noi && /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/venv/bin/python -m unittest test_score_spk 2>&1 | tail -2`
Expected: `ModuleNotFoundError: No module named 'score_spk'`.

- [ ] **Step 3: Viết `$B/score_spk.py`**

```python
"""Chấm gán người nói (A-spk1, A-spk2; spec 2026-10-26-phan-biet-nguoi-noi §12): so JSONL của `latency-bench speaker-eval`
với RTTM. Giọng của app được ghép với người thật theo thời lượng trùng (Hungarian), mỗi giọng một người.

Chỉ số:
- time: phần thời lượng tiếng nói (theo RTTM, trong các đoạn) gán đúng người;
- line_1s / line_all: phần đoạn (dài ≥ 1 s / mọi đoạn) có giọng ứng với người nói nhiều nhất trong đoạn;
- voices: số giọng app hiện ra; purity: trần nếu mỗi đoạn gán đúng người nói nhiều nhất.

python -I score_spk.py <ra.jsonl> <nhãn.rttm>
"""
import json
import sys

import numpy as np
from scipy.optimize import linear_sum_assignment


def read_rttm(path):
    turns = []
    with open(path) as f:
        for line in f:
            p = line.split()
            if p and p[0] == "SPEAKER":
                start, dur = float(p[3]), float(p[4])
                turns.append((start, start + dur, p[7]))
    return turns


def read_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def overlap(seg, turns):
    s, e = seg["start_ms"] / 1000, seg["end_ms"] / 1000
    out = {}
    for ts, te, spk in turns:
        o = min(e, te) - max(s, ts)
        if o > 0:
            out[spk] = out.get(spk, 0.0) + o
    return out


def score(segs, turns):
    speakers = sorted({t[2] for t in turns})
    index = {s: i for i, s in enumerate(speakers)}
    labels = sorted({s["voice"] for s in segs if s["voice"] is not None})
    lindex = {v: i for i, v in enumerate(labels)}
    m = np.zeros((max(len(labels), 1), len(speakers)))
    total = purity = 0.0
    ovs = [overlap(s, turns) for s in segs]
    for s, o in zip(segs, ovs):
        if not o:
            continue
        total += sum(o.values())
        purity += max(o.values())
        if s["voice"] is not None:
            for spk, v in o.items():
                m[lindex[s["voice"]], index[spk]] += v
    rows, cols = linear_sum_assignment(-m)
    mapping = {labels[r]: speakers[c] for r, c in zip(rows, cols) if r < len(labels)}
    correct = sum(m[r, c] for r, c in zip(rows, cols))
    n_all = ok_all = n_1s = ok_1s = 0
    for s, o in zip(segs, ovs):
        if not o:
            continue
        hit = mapping.get(s["voice"]) == max(o, key=o.get)
        n_all += 1
        ok_all += hit
        if s["end_ms"] - s["start_ms"] >= 1000:
            n_1s += 1
            ok_1s += hit
    return {
        "time": correct / total if total else 0.0,
        "line_1s": ok_1s / n_1s if n_1s else 0.0,
        "line_all": ok_all / n_all if n_all else 0.0,
        "voices": len(labels),
        "speakers": len(speakers),
        "purity": purity / total if total else 0.0,
    }


def main():
    s = score(read_jsonl(sys.argv[1]), read_rttm(sys.argv[2]))
    print(json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd $W/bench/2026-10-26-nguoi-noi && /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/venv/bin/python -m unittest test_score_spk 2>&1 | tail -2`
Expected: `OK` (5 test).

- [ ] **Step 5: Viết `$B/tune.py`**

```python
"""Chọn θ và ngưỡng gộp trên phần dev, báo trên phần kiểm với đúng ngưỡng đó (kế hoạch 01, chốt tham số; spec §5.3, §5.4).
Chạy `latency-bench speaker-eval --embeddings-in` (không cần model) cho mỗi bộ ngưỡng.

python -I tune.py <latency-bench> <thư mục có <tên>.emb.json và <tên>.rttm> --dev a,b --test c,d [--out kết-quả.json]
Mục tiêu trên dev: trung bình line_all, trừ 0,03 cho mỗi giọng thừa (so với số người thật).
"""
import argparse
import itertools
import json
import os
import subprocess
import tempfile

from score_spk import read_jsonl, read_rttm, score

THETAS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55]
MERGES = [0.60, 0.65, 0.70, 0.75, 1.10]  # 1,10: không bao giờ gộp


def evaluate(binary, folder, name, theta, merge):
    with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as f:
        out = f.name
    subprocess.run(
        [binary, "speaker-eval", "--embeddings-in", os.path.join(folder, name + ".emb.json"),
         "--theta", str(theta), "--merge-theta", str(merge), "--out", out],
        check=True, capture_output=True,
    )
    s = score(read_jsonl(out), read_rttm(os.path.join(folder, name + ".rttm")))
    os.unlink(out)
    return s


def objective(s):
    return s["line_all"] - 0.03 * max(0, s["voices"] - s["speakers"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("binary")
    ap.add_argument("folder")
    ap.add_argument("--dev", required=True)
    ap.add_argument("--test", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    dev, test = a.dev.split(","), a.test.split(",")
    best = None
    for theta, merge in itertools.product(THETAS, MERGES):
        v = sum(objective(evaluate(a.binary, a.folder, n, theta, merge)) for n in dev) / len(dev)
        if best is None or v > best[0]:
            best = (v, theta, merge)
    _, theta, merge = best
    print(f"chọn trên dev: θ={theta} gộp={merge} (mục tiêu {best[0]:.3f})")
    rows = {}
    for n in dev + test:
        s = evaluate(a.binary, a.folder, n, theta, merge)
        rows[n] = s
        tag = " (dev)" if n in dev else ""
        print(f"  {n + tag:30s} dòng ≥1 s {s['line_1s']:.1%} | mọi dòng {s['line_all']:.1%} | thời lượng {s['time']:.1%}"
              f" | {s['voices']}/{s['speakers']} giọng | trần {s['purity']:.1%}")
    if a.out:
        with open(a.out, "w") as f:
            json.dump({"theta": theta, "merge": merge, "rows": rows}, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/score_spk.py bench/2026-10-26-nguoi-noi/test_score_spk.py bench/2026-10-26-nguoi-noi/tune.py && git commit -m "chore(bench): chấm gán người nói và chọn ngưỡng"
```

---

### Task 7: Đo trên AMI (A-spk1 với code Rust)

**Files:** Tạo `$B/fetch_ami.sh`, `$B/results/nhan-giong-ami.md`

- [ ] **Step 1: Viết `$B/fetch_ami.sh`**

```bash
#!/bin/sh
# Tải 4 cuộc họp AMI (CC BY 4.0) và nhãn người nói của pyannote AMI-diarization-setup (spec 2026-10-26-phan-biet-nguoi-noi §3).
set -eu
DATA=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/ami
M=https://groups.inf.ed.ac.uk/ami/AMICorpusMirror//amicorpus
R=https://raw.githubusercontent.com/pyannote/AMI-diarization-setup/main/only_words/rttms/test
mkdir -p "$DATA"
for m in ES2004a TS3003a IS1009a EN2002a; do
  [ -f "$DATA/$m.Mix-Headset.wav" ] || curl -sSfL -o "$DATA/$m.Mix-Headset.wav" "$M/$m/audio/$m.Mix-Headset.wav"
  curl -sSfL -o "$DATA/$m.rttm" "$R/$m.rttm"
done
for m in ES2004a IS1009a; do
  [ -f "$DATA/$m.Array1-01.wav" ] || curl -sSfL -o "$DATA/$m.Array1-01.wav" "$M/$m/audio/$m.Array1-01.wav"
done
ls -la "$DATA"
```

Run: `cd $W && chmod +x bench/2026-10-26-nguoi-noi/fetch_ami.sh && bench/2026-10-26-nguoi-noi/fetch_ami.sh`
Expected: 6 file `.wav`, 4 file `.rttm`.

- [ ] **Step 2: Nhúng mọi bản ghi (một lần), lưu cache**

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W && for w in $D/ami/*.wav; do n=$(basename $w .wav); m=${n%%.*}; cp $D/ami/$m.rttm $D/out/$n.rttm; RAYON_NUM_THREADS=2 target/release/latency-bench speaker-eval --wav $w --vad-model /Users/dtphong/Desktop/software_business/ai-translator/models/silero_vad_v6.2.3.onnx --speaker-model $D/models/eres2net-sv-en-voxceleb-16k.onnx --embeddings-out $D/out/$n.emb.json --out $D/out/$n.jsonl; done`
Expected: 6 dòng tóm tắt; số đoạn: EN2002a.Mix-Headset 961, ES2004a.Array1-01 315, ES2004a.Mix-Headset 360, IS1009a.Array1-01 260, IS1009a.Mix-Headset 261, TS3003a.Mix-Headset 549 (khớp `truoc-spec/nhan-giong/score-es50.txt`). Lệch thì kiểm `end_silence_ms` = 50.

- [ ] **Step 3: Chọn ngưỡng trên dev, báo trên phần kiểm**

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W/bench/2026-10-26-nguoi-noi && $D/venv/bin/python -I tune.py $W/target/release/latency-bench $D/out --dev ES2004a.Mix-Headset,TS3003a.Mix-Headset --test IS1009a.Mix-Headset,EN2002a.Mix-Headset,IS1009a.Array1-01,ES2004a.Array1-01 --out $D/out/tune-ami.json`
Expected: dòng `chọn trên dev: θ=… gộp=…` và 6 dòng kết quả. So với nghiên cứu trước spec (ERes2Net Python: dòng ≥ 1 s 87–96%, mọi dòng 81–88% trên phần kiểm). Thấp hơn rõ (> 3 điểm) thì kiểm luật độ dài đoạn (Rust lấy giọng trước cho đoạn 0,5–1,5 s không giống ai; Python chọn giọng gần nhất): chạy thêm một lượt với `--min-new-ms 1000` để xem ảnh hưởng, ghi cả hai.

- [ ] **Step 4: Ghi `$B/results/nhan-giong-ami.md`**

Nội dung: điều kiện (máy, bản build, ngắt câu 50 ms, `RAYON_NUM_THREADS=2`), ngưỡng chọn, bảng 6 dòng (dòng ≥ 1 s, mọi dòng, thời lượng, số giọng/số người, trần), so với nghiên cứu trước spec, kết luận A-spk1 (mức đạt: dòng ≥ 1 s ≥ 85%, mọi dòng ≥ 80% trên phần kiểm).

- [ ] **Step 5: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/fetch_ami.sh bench/2026-10-26-nguoi-noi/results/nhan-giong-ami.md && git commit -m "docs(bench): nhận giọng trên AMI bằng code Rust"
```

---

### Task 8: Dữ liệu tiếng Việt từ Common Voice và A-spk2

**Files:** Tạo `$B/build_cv_vi.py`, `$B/results/nhan-giong-tieng-viet.md`

- [ ] **Step 1: Có dữ liệu Common Voice tiếng Việt (cần chủ dự án nếu phải đăng nhập)**

Common Voice (CC0) phát hành qua Mozilla Data Collective, cần tài khoản và đồng ý điều khoản. Hỏi chủ dự án tải bộ "Common Voice Scripted Speech – Vietnamese" (bản mới nhất), giải nén vào `$DATA/cv-vi/` sao cho có `$DATA/cv-vi/validated.tsv` và `$DATA/cv-vi/clips/*.mp3`. Không có dữ liệu thì bỏ Step 2–4, ghi A-spk2 "chưa đo, chờ dữ liệu" và chuyển sang Task 9.

Run (sau khi có dữ liệu): `head -1 /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/cv-vi/validated.tsv | tr '\t' '\n' | head -12 && ffmpeg -hide_banner -encoders 2>/dev/null | grep -c libopus`
Expected: có cột `client_id`, `path`; `1` (ffmpeg có libopus).

- [ ] **Step 2: Viết `$B/build_cv_vi.py`**

```python
"""Dựng hội thoại tiếng Việt nhiều người từ Common Voice (CC0, có mã người nói `client_id`) cho A-spk2 (spec
2026-10-26-phan-biet-nguoi-noi §12). Mỗi hội thoại ~5 phút, 3–4 người; lượt nói 1–2 câu (cách nhau 0,25 s); 15% lượt là
cùng người nói tiếp; khoảng nghỉ giữa lượt 0,15–1,2 s; 10% lượt chen vào cuối lượt trước 0,3–1,0 s. Mỗi câu cắt im lặng hai
đầu và chuẩn hóa về −26 dBFS. Ra: <tên>.wav (16 kHz mono 16 bit), <tên>.rttm, và <tên>-opus.wav (qua Opus 24 kbps rồi giải
mã lại, giả tiếng qua app họp) cùng <tên>-opus.rttm.

python -I build_cv_vi.py <thư mục CV (validated.tsv, clips/)> <thư mục ra> [--n 6] [--seed 0]
"""
import argparse
import csv
import os
import random
import shutil
import subprocess
import tempfile

import numpy as np
import soundfile as sf

SR = 16_000


def load_clip(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    peak = np.max(np.abs(x)) if x.size else 0.0
    if peak > 0:
        idx = np.where(np.abs(x) > 0.02 * peak)[0]
        x = x[max(0, idx[0] - 1600): idx[-1] + 1600]
    rms = np.sqrt(np.mean(x ** 2)) + 1e-9
    return x * (10 ** (-26 / 20) / rms)


def speakers(cv_dir, min_clips):
    by = {}
    with open(os.path.join(cv_dir, "validated.tsv"), newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            by.setdefault(row["client_id"], []).append(os.path.join(cv_dir, "clips", row["path"]))
    return {k: v for k, v in by.items() if len(v) >= min_clips}


def build(rng, pool, cv_speakers, seconds):
    chosen = rng.sample(pool, rng.choice([3, 4]))
    queues = {s: rng.sample(cv_speakers[s], len(cv_speakers[s])) for s in chosen}
    label = {s: f"S{i + 1}" for i, s in enumerate(chosen)}
    pieces, turns, t, prev = [], [], 0.0, None
    while t < seconds:
        spk = prev if prev is not None and rng.random() < 0.15 else rng.choice([s for s in chosen if s != prev])
        clips = []
        for _ in range(rng.choice([1, 2])):
            if not queues[spk]:
                queues[spk] = rng.sample(cv_speakers[spk], len(cv_speakers[spk]))
            clips.append(load_clip(queues[spk].pop()))
        gap = np.zeros(int(0.25 * SR), dtype=np.float32)
        audio = np.concatenate([c if i == 0 else np.concatenate([gap, c]) for i, c in enumerate(clips)])
        if turns and spk != prev and rng.random() < 0.10:
            start = max(0.0, t - rng.uniform(0.3, 1.0))
        else:
            start = t + rng.uniform(0.15, 1.2)
        pieces.append((start, audio))
        turns.append((start, len(audio) / SR, label[spk]))
        t = start + len(audio) / SR
        prev = spk
    mix = np.zeros(int((t + 1.0) * SR), dtype=np.float32)
    for start, audio in pieces:
        a = int(start * SR)
        mix[a: a + len(audio)] += audio
    peak = np.max(np.abs(mix))
    if peak > 0.99:
        mix *= 0.99 / peak
    return mix, turns


def write(out, name, mix, turns):
    sf.write(os.path.join(out, name + ".wav"), mix, SR, subtype="PCM_16")
    with open(os.path.join(out, name + ".rttm"), "w") as f:
        for start, dur, spk in turns:
            f.write(f"SPEAKER {name} 1 {start:.3f} {dur:.3f} <NA> <NA> {spk} <NA> <NA>\n")


def opus(out, name):
    src = os.path.join(out, name + ".wav")
    with tempfile.TemporaryDirectory() as tmp:
        ogg = os.path.join(tmp, "x.ogg")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-c:a", "libopus", "-b:a", "24k", ogg], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", ogg, "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16",
                        os.path.join(out, name + "-opus.wav")], check=True)
    shutil.copy(os.path.join(out, name + ".rttm"), os.path.join(out, name + "-opus.rttm"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cv_dir")
    ap.add_argument("out")
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--seconds", type=float, default=300.0)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rng = random.Random(a.seed)
    cv_speakers = speakers(a.cv_dir, 15)
    pool = sorted(cv_speakers)
    print(f"{len(pool)} người có ≥ 15 câu")
    for k in range(a.n):
        name = f"cv-vi-{k + 1:02d}"
        mix, turns = build(rng, pool, cv_speakers, a.seconds)
        write(a.out, name, mix, turns)
        opus(a.out, name)
        print(f"{name}: {len(mix) / SR:.0f} s, {len(turns)} lượt, {len({t[2] for t in turns})} người")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Dựng 6 hội thoại, nhúng, chấm với ngưỡng đã chọn ở Task 7**

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W/bench/2026-10-26-nguoi-noi && $D/venv/bin/python -I build_cv_vi.py $D/cv-vi $D/out/cv && for w in $D/out/cv/*.wav; do n=$(basename $w .wav); RAYON_NUM_THREADS=2 $W/target/release/latency-bench speaker-eval --wav $w --vad-model /Users/dtphong/Desktop/software_business/ai-translator/models/silero_vad_v6.2.3.onnx --speaker-model $D/models/eres2net-sv-en-voxceleb-16k.onnx --embeddings-out $D/out/cv/$n.emb.json --out $D/out/cv/$n.jsonl; done`
Expected: `… người có ≥ 15 câu` (cần ≥ 8), 6 dòng hội thoại, 12 dòng tóm tắt nhúng.

Rồi chấm bằng ngưỡng của Task 7 (đọc `theta`, `merge` trong `$D/out/tune-ami.json`), cho cả bản thường và bản Opus:

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W/bench/2026-10-26-nguoi-noi && TH=$($D/venv/bin/python -c "import json;print(json.load(open('$D/out/tune-ami.json'))['theta'])") && MG=$($D/venv/bin/python -c "import json;print(json.load(open('$D/out/tune-ami.json'))['merge'])") && for e in $D/out/cv/*.emb.json; do n=$(basename $e .emb.json); $W/target/release/latency-bench speaker-eval --embeddings-in $e --theta $TH --merge-theta $MG --out $D/out/cv/$n.jsonl > /dev/null; echo "$n $($D/venv/bin/python -I score_spk.py $D/out/cv/$n.jsonl $D/out/cv/$n.rttm)"; done`
Expected: 12 dòng JSON chỉ số.

- [ ] **Step 4: Kiểm ngưỡng có hợp tiếng Việt không**

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W/bench/2026-10-26-nguoi-noi && $D/venv/bin/python -I tune.py $W/target/release/latency-bench $D/out/cv --dev cv-vi-01,cv-vi-02,cv-vi-01-opus,cv-vi-02-opus --test cv-vi-03,cv-vi-04,cv-vi-05,cv-vi-06,cv-vi-03-opus,cv-vi-04-opus,cv-vi-05-opus,cv-vi-06-opus --out $D/out/tune-cv.json`
Expected: ngưỡng chọn trên tiếng Việt và kết quả phần kiểm. Ghi cả hai cách (ngưỡng AMI và ngưỡng tiếng Việt) vào kết quả.

- [ ] **Step 5: Ghi `$B/results/nhan-giong-tieng-viet.md`**

Nội dung: phiên bản Common Voice, số người, cách dựng (tóm tắt từ docstring), bảng 12 dòng với ngưỡng AMI, kết quả với ngưỡng chọn trên tiếng Việt, chênh lệch bản Opus, kết luận A-spk2 (mức đạt: dòng ≥ 1 s ≥ 85%). Không đạt thì ghi phương án ở spec §14 sẽ thử (TitaNet-small, CAM++ zh_en) và hỏi chủ dự án có thử ngay trong kế hoạch này không.

- [ ] **Step 6: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/build_cv_vi.py bench/2026-10-26-nguoi-noi/results/nhan-giong-tieng-viet.md && git commit -m "docs(bench): nhận giọng trên hội thoại tiếng Việt dựng từ Common Voice"
```

---

### Task 9: Tốc độ và RAM trên macOS

**Files:** Tạo `$B/results/toc-do.md`

- [ ] **Step 1: Đo với 1 và 2 luồng, lấy RAM đỉnh**

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W && for n in 1 2; do echo "== $n luồng"; RAYON_NUM_THREADS=$n /usr/bin/time -l target/release/latency-bench speaker-eval --wav $D/ami/IS1009a.Mix-Headset.wav --vad-model /Users/dtphong/Desktop/software_business/ai-translator/models/silero_vad_v6.2.3.onnx --speaker-model $D/models/eres2net-sv-en-voxceleb-16k.onnx --out /dev/null 2>&1 | grep -E "đoạn|maximum resident"; done`
Expected: hai dòng tóm tắt (p50, p90 nhúng; phần trăm thời gian nhúng / thời lượng tiếng nói) và RAM đỉnh mỗi lượt. RAM đỉnh gồm cả Silero và âm thanh của cả cuộc họp nên chỉ là cận trên.

- [ ] **Step 2: Đo khi máy bận như lúc họp**

Chạy song song một tải giả (4 luồng `yes > /dev/null`) để mô phỏng nhận dạng, dịch và app họp cùng chạy, rồi đo lại với 2 luồng:

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W && for i in 1 2 3 4; do (yes > /dev/null &) ; done; RAYON_NUM_THREADS=2 target/release/latency-bench speaker-eval --wav $D/ami/IS1009a.Mix-Headset.wav --vad-model /Users/dtphong/Desktop/software_business/ai-translator/models/silero_vad_v6.2.3.onnx --speaker-model $D/models/eres2net-sv-en-voxceleb-16k.onnx --out /dev/null; pkill -x yes`
Expected: dòng tóm tắt; `pkill -x yes` chỉ tắt các tiến trình `yes` vừa mở.

- [ ] **Step 3: Ghi `$B/results/toc-do.md`**

Nội dung: SHA-256 và cỡ model (Task 1), bảng p50/p90 mỗi đoạn và % thời gian nhúng / thời lượng tiếng nói (1 luồng, 2 luồng, 2 luồng khi máy bận), RAM đỉnh; ước tính CPU trung bình khi người nói liên tục = % thời gian nhúng (ngân sách spec §11: ≤ 5% một lõi trên M4 Pro); so với nhận dạng (~230 ms mỗi đoạn trên M4 Pro): nhận giọng có xong trước không. Để trống phần Windows i5 cho Task 13.

- [ ] **Step 4: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/results/toc-do.md && git commit -m "docs(bench): tốc độ và RAM nhận giọng trên macOS"
```

---

### Task 10: App hiện tại đọc manifest có khóa `speaker`

**Files:** Sửa `src-tauri/src/models/manifest.rs` (module `tests`)

- [ ] **Step 1: Viết hai test**

Trong `src-tauri/src/models/manifest.rs`, module `tests`, thêm sau test `unknown_keys_are_ignored_and_missing_keys_rejected`:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.5: model nhúng giọng đi ở khóa mới `speaker` ở gốc phần thân; app không biết
    /// khóa này (bản 0.3.1 trở về trước) vẫn đọc được manifest và các gói như cũ.
    #[test]
    fn a_speaker_entry_at_the_root_does_not_break_this_app() {
        let mut value = sample();
        value["speaker"] = json!({
            "id": "eres2net-voxceleb", "version": "1", "file": "eres2net-sv-en-voxceleb-16k.onnx",
            "url": "files/eres2net-sv-en-voxceleb-16k.onnx", "bytes": 26_000_000, "sha256": "cd".repeat(32),
            "license_id": "Apache-2.0", "min_app_version": "0.4.0"
        });
        value["speaker_config"] = json!({ "theta": 0.4 });
        let m = parse(&value).unwrap();
        assert_eq!(m.files_of("standard").len(), 4);
    }

    /// Vì sao không đưa model nhúng giọng vào `files`: một `kind` lạ làm app hiện tại từ chối cả manifest.
    #[test]
    fn an_unknown_kind_in_files_breaks_this_app() {
        let mut value = sample();
        value["files"][0]["kind"] = json!("speaker");
        assert!(matches!(parse(&value), Err(Invalid(e)) if e.starts_with("json:")));
    }
```

- [ ] **Step 2: Chạy test**

Run: `cd $W && cargo test -p meeting-translator --lib models::manifest 2>&1 | tail -3`
Expected: mọi test `ok`, gồm hai test mới. Nếu `a_speaker_entry_at_the_root_does_not_break_this_app` trượt: app hiện tại không bỏ qua khóa gốc lạ; dừng, ghi vào `results/tong-hop.md` và báo chủ dự án (spec §4.5 phải đổi cách giao model).

- [ ] **Step 3: Commit**

```bash
cd $W && git add src-tauri/src/models/manifest.rs && git commit -m "test(models): manifest có khóa speaker vẫn đọc được ở app hiện tại"
```

---

### Task 11: Tiến trình con có hưởng quyền Trợ năng không (cần chủ dự án)

**Files:** Tạo `$B/tcc-probe/parent.swift`, `$B/tcc-probe/child.swift`, `$B/tcc-probe/make-app.sh`, `$B/results/quyen-tro-nang.md`

- [ ] **Step 1: Viết `$B/tcc-probe/parent.swift`**

```swift
// App cha của phép thử (spec 2026-10-26-phan-biet-nguoi-noi §6.2): ghi quyền Trợ năng của chính nó, rồi chạy tiến trình con
// nằm trong cùng gói .app (giống app chạy speaker-worker) và chờ con ghi kết quả. Log: ~/Library/Logs/tcc-probe.log.
import ApplicationServices
import Foundation

let log = NSHomeDirectory() + "/Library/Logs/tcc-probe.log"

func write(_ s: String) {
    let line = "\(Date()) \(s)\n"
    if let h = FileHandle(forWritingAtPath: log) {
        h.seekToEndOfFile()
        h.write(line.data(using: .utf8)!)
        h.closeFile()
    } else {
        FileManager.default.createFile(atPath: log, contents: line.data(using: .utf8))
    }
}

write("cha: AXIsProcessTrusted = \(AXIsProcessTrusted())")
let child = Process()
child.executableURL = URL(fileURLWithPath: Bundle.main.bundlePath + "/Contents/MacOS/tcc-child")
child.arguments = [log]
do {
    try child.run()
    child.waitUntilExit()
    write("cha: con thoát với mã \(child.terminationStatus)")
} catch {
    write("cha: không chạy được con: \(error)")
}
```

- [ ] **Step 2: Viết `$B/tcc-probe/child.swift`**

```swift
// Tiến trình con: ghi AXIsProcessTrusted và thử đọc thật danh sách cửa sổ của Finder qua Accessibility.
import AppKit
import ApplicationServices

let log = CommandLine.arguments[1]

func write(_ s: String) {
    let h = FileHandle(forWritingAtPath: log)!
    h.seekToEndOfFile()
    h.write("\(Date()) \(s)\n".data(using: .utf8)!)
    h.closeFile()
}

let trusted = AXIsProcessTrusted()
var result = "không thấy Finder"
if let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first {
    let el = AXUIElementCreateApplication(finder.processIdentifier)
    var value: AnyObject?
    let r = AXUIElementCopyAttributeValue(el, kAXWindowsAttribute as CFString, &value)
    result = "đọc cửa sổ Finder: mã \(r.rawValue) (0 là được), \((value as? [AXUIElement])?.count ?? -1) cửa sổ"
}
write("con: AXIsProcessTrusted = \(trusted), \(result)")
```

- [ ] **Step 3: Viết `$B/tcc-probe/make-app.sh`**

```bash
#!/bin/sh
# Dựng TccProbe.app (bundle id com.aitranslator.tccprobe), ký ad-hoc kèm hardened runtime như bản phát hành của app.
set -eu
cd "$(dirname "$0")"
APP=TccProbe.app
rm -rf "$APP" && mkdir -p "$APP/Contents/MacOS"
swiftc -O -o "$APP/Contents/MacOS/tcc-parent" parent.swift
swiftc -O -o "$APP/Contents/MacOS/tcc-child" child.swift
cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.aitranslator.tccprobe</string>
  <key>CFBundleName</key><string>TccProbe</string>
  <key>CFBundleExecutable</key><string>tcc-parent</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
EOF
codesign --force --options runtime -s - "$APP/Contents/MacOS/tcc-child"
codesign --force --options runtime -s - "$APP"
codesign -dv "$APP" 2>&1 | grep -E "Identifier|Signature"
```

Thêm `/bench/2026-10-26-nguoi-noi/tcc-probe/TccProbe.app/` vào `.gitignore` (dưới dòng của spike nguồn micro).

- [ ] **Step 4: Chạy khi chưa có quyền**

Run: `cd $W/bench/2026-10-26-nguoi-noi/tcc-probe && chmod +x make-app.sh && ./make-app.sh && rm -f ~/Library/Logs/tcc-probe.log && open -W TccProbe.app && cat ~/Library/Logs/tcc-probe.log`
Expected: `Signature=adhoc`; cha `false`, con `false`, mã đọc Finder khác 0.

- [ ] **Step 5: Chủ dự án cấp quyền (cần chủ dự án)**

Nhờ chủ dự án: System Settings › Privacy & Security › Accessibility › nút "+" › chọn `$B/tcc-probe/TccProbe.app` › bật. Rồi chạy lại:

Run: `cd $W/bench/2026-10-26-nguoi-noi/tcc-probe && rm -f ~/Library/Logs/tcc-probe.log && open -W TccProbe.app && cat ~/Library/Logs/tcc-probe.log`
Expected (điều cần biết): cha `true`; con `true` và mã đọc Finder `0` thì tiến trình con hưởng quyền của app. Con `false` thì ghi lại, spec §14 chuyển sang phương án dự phòng (đọc tên trong tiến trình chính, luồng riêng).

- [ ] **Step 6: Thử thêm sau khi ký lại (giống cập nhật app)**

Run: `cd $W/bench/2026-10-26-nguoi-noi/tcc-probe && ./make-app.sh && rm -f ~/Library/Logs/tcc-probe.log && open -W TccProbe.app && cat ~/Library/Logs/tcc-probe.log`
Expected: ghi lại kết quả (dự kiến cả hai `false` vì cdhash đổi, như lỗi Gõ dịch đã gặp).

- [ ] **Step 7: Dọn và ghi kết quả**

Run: `tccutil reset Accessibility com.aitranslator.tccprobe; rm -rf $W/bench/2026-10-26-nguoi-noi/tcc-probe/TccProbe.app ~/Library/Logs/tcc-probe.log`

Ghi `$B/results/quyen-tro-nang.md`: macOS, kết quả ba lần chạy, kết luận cho spec §6.2.

- [ ] **Step 8: Commit**

```bash
cd $W && git add .gitignore bench/2026-10-26-nguoi-noi/tcc-probe bench/2026-10-26-nguoi-noi/results/quyen-tro-nang.md && git commit -m "docs(bench): tiến trình con và quyền Trợ năng trên bản ký ad-hoc"
```

---

### Task 12: Phần tốn thêm của Teams, Chrome và chỉ báo nói của Teams khi bảng People đóng (cần chủ dự án)

**Files:** Tạo `$B/cpu_sample.py`, `$B/find_indicators.py`, `$B/results/teams-chrome.md`

- [ ] **Step 1: Viết `$B/cpu_sample.py`**

```python
"""Lấy mẫu CPU (%, một lõi = 100) và RAM (MB) mỗi giây của các tiến trình có tên chứa chuỗi cho trước, cộng dồn theo chuỗi;
ghi CSV (spec 2026-10-26-phan-biet-nguoi-noi §6.8, §11).

python -I cpu_sample.py <số giây> <ra.csv> <chuỗi tên>...   (ví dụ: MSTeams "Teams WebView" "Google Chrome")
"""
import subprocess
import sys
import time


def main():
    seconds, out, patterns = int(sys.argv[1]), sys.argv[2], [p.lower() for p in sys.argv[3:]]
    end = time.time() + seconds
    with open(out, "w") as f:
        f.write("t,pattern,cpu,rss_mb\n")
        while time.time() < end:
            t = time.time()
            rows = subprocess.run(["ps", "-A", "-o", "%cpu=,rss=,comm="], capture_output=True, text=True).stdout
            parsed = [r.split(None, 2) for r in rows.splitlines()]
            for p in patterns:
                cpu = sum(float(x[0]) for x in parsed if len(x) == 3 and p in x[2].lower())
                rss = sum(float(x[1]) for x in parsed if len(x) == 3 and p in x[2].lower()) / 1024
                f.write(f"{t:.1f},{p},{cpu:.1f},{rss:.0f}\n")
            time.sleep(max(0.0, 1.0 - (time.time() - t)))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Viết `$B/find_indicators.py`**

```python
"""Dò phần tử nào trong cây giao diện đổi theo người đang nói (spec §6.4, §6.5): với mỗi dòng của bản ghi `axtrace watch` hay
`uia-probe watch`, tính tương quan giữa việc dòng đó có mặt và việc từng khách đang mở mic (dời 0,6 s), in các dòng tương quan
cao nhất cho mỗi khách. Dòng có tên khách in kèm; dòng không có tên nhưng tương quan cao cũng in (chỉ báo cạnh tên).

python -I find_indicators.py <watch.jsonl> <truth.json> [--top 12] [--shift 0.6]
"""
import argparse
import json
from collections import defaultdict

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("watch")
    ap.add_argument("truth")
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--shift", type=float, default=0.6)
    a = ap.parse_args()
    truth = json.load(open(a.truth))
    t0 = truth["t0"]
    snaps = [json.loads(line) for line in open(a.watch)]
    lines_key = "texts" if "texts" in snaps[0] else "lines"
    events = sorted(truth["steps"], key=lambda s: s["t"])
    guests = sorted({s["g"] for s in events})

    def on(g, t):
        state = False
        for s in events:
            if s["t"] - t0 > t:
                break
            if s["g"] == g:
                state = s["on"]
        return state

    ts = [s["t"] - t0 for s in snaps]
    target = {g: np.array([on(g, t - a.shift) for t in ts], dtype=float) for g in guests}
    presence = defaultdict(lambda: np.zeros(len(snaps)))
    for k, s in enumerate(snaps):
        for line in set(s[lines_key]):
            presence[line][k] = 1.0
    for g in guests:
        y = target[g]
        if y.std() == 0:
            continue
        scored = []
        for line, v in presence.items():
            if v.std() == 0:
                continue
            scored.append((float(np.corrcoef(v, y)[0, 1]), line))
        scored.sort(reverse=True)
        print(f"\n== {g}: {len(snaps)} ảnh chụp")
        for c, line in scored[: a.top]:
            print(f"  {c:+.2f}  {line[:200]}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Hỏi chủ dự án và chuẩn bị (cần chủ dự án)**

Hỏi chủ dự án cho phép và nhờ chuẩn bị:
- Teams: chủ dự án tự mở cuộc họp "Meet now" bằng tài khoản Microsoft cá nhân trên Mac, tắt mic và camera, gửi đường dẫn mời. Khách Lan và Minh vào bằng `$B/truoc-spec/doc-ten/guests.py`; chủ dự án bấm "Admit" (hoặc cho phép Claude bấm qua Accessibility).
- Chrome: chủ dự án tự khởi động lại Chrome trước phần Chrome (để trợ năng của Chrome đang tắt), mở một phòng Meet bằng tài khoản Google, tắt camera; một cửa sổ Chrome thứ hai cùng tài khoản vào phòng làm người nói (giọng đọc máy qua loa, âm lượng 45%), như nghiên cứu trước spec. Hoặc dùng 2 Gmail thử nếu đã tạo.
- Lưu âm lượng hiện tại (`osascript -e 'get volume settings'`) để trả lại.

Dựng lại công cụ và giọng đọc của khách (không nằm trong git), và bỏ qua chúng trong git:

Run: `cd $W/bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten && swiftc -O -o axtrace axtrace.swift && mkdir -p audio out && say -v Samantha -o audio/lan.aiff "Hello everyone, this is Lan speaking. I want to talk about the project timeline for next quarter. We need to finish the design review before the end of the month, and then start the implementation. I think the team is ready, but we should confirm the budget with finance first." && say -v Daniel -o audio/minh.aiff "Hi, this is Minh. Thanks for the update. I have a few concerns about the testing phase. Last time we did not have enough devices, so the test took much longer than planned. I suggest we book the lab two weeks in advance." && for f in lan minh; do afconvert -f WAVE -d LEI16@48000 -c 1 audio/$f.aiff audio/$f.wav; done && ls audio`
Expected: `lan.aiff lan.wav minh.aiff minh.wav`.

Thêm vào `.gitignore` (dưới dòng của Task 11): `/bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten/axtrace`, `/bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten/audio/`, `/bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten/out/` (bản ghi có tên người, không commit).

`guests.py` mở Chrome tự động cho khách (Zoom web, Teams web); chạy nền: `cd $B/truoc-spec/doc-ten && $DATA/venv/bin/python -I guests.py &`, rồi điều khiển như `truoc-spec/README.md`. Cần trình duyệt Chrome của Playwright: `$DATA/venv/bin/python -m playwright install chrome` nếu chưa có (dùng Chrome đã cài thì bỏ qua).

- [ ] **Step 4: Teams, lượt A (chưa bật trợ năng)**

Teams vừa mở lại (chưa bị đặt `AXEnhancedUserInterface`). Chạy cùng lúc lấy mẫu CPU và kịch bản nói (khách tắt mic lúc bắt đầu):

Run: `cd $W/bench/2026-10-26-nguoi-noi && D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && ($D/venv/bin/python -I cpu_sample.py 95 $D/out/teams-A.csv MSTeams "Teams WebView" &) && cd truoc-spec/doc-ten && $D/venv/bin/python -I run_schedule.py com.microsoft.teams2 teams-A 'sel:#mic-button[aria-label="Unmute mic"]||#mic-button[aria-label="Mute mic"]' 1.0`
Expected: `xong teams-A: 90 s, 26 lần bật/tắt`. (`run_schedule.py` vẫn chạy `axtrace watch` nhịp 1 s nhưng không đặt `AXTRACE_EUI`, nên cây web của Teams không được dựng; lượt này chỉ dùng số CPU.)

- [ ] **Step 5: Teams, lượt B (bật trợ năng, đọc 4 lần mỗi giây, bảng People mở)**

Run: `cd $W/bench/2026-10-26-nguoi-noi && D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && AXTRACE_EUI=1 truoc-spec/doc-ten/axtrace find com.microsoft.teams2 "^People$" && ($D/venv/bin/python -I cpu_sample.py 95 $D/out/teams-B.csv MSTeams "Teams WebView" &) && cd truoc-spec/doc-ten && AXTRACE_WIN="^Meeting" $D/venv/bin/python -I run_schedule.py com.microsoft.teams2 teams-B 'sel:#mic-button[aria-label="Unmute mic"]||#mic-button[aria-label="Mute mic"]' 0.25`
Expected: `xong teams-B`. Mở bảng People trước lượt này (bấm "People" trong cửa sổ họp). `axtrace` phải được build trước: `cd $B/truoc-spec/doc-ten && swiftc -O -o axtrace axtrace.swift`.

- [ ] **Step 6: Teams, lượt C (bật trợ năng, bảng People đóng): tìm chỉ báo ở ô video**

Đóng bảng People, chạy lại như Step 5 với tag `teams-C` (không cần `cpu_sample`), rồi dò:

Run: `cd $W/bench/2026-10-26-nguoi-noi && D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && $D/venv/bin/python -I find_indicators.py truoc-spec/doc-ten/out/teams-C-watch.jsonl truoc-spec/doc-ten/out/teams-C-truth.json`
Expected: danh sách dòng tương quan cao nhất cho Lan và Minh. Điều cần biết: có dòng nào (không phải nhãn mic "Muted/Unmuted") tương quan ≥ 0,6 với lúc nói không. Ghi vai trò, id, lớp CSS và vị trí so với chữ tên của dòng đó; không ghi tên người.

- [ ] **Step 7: Trả Teams về như cũ**

Run: `cd $W/bench/2026-10-26-nguoi-noi && truoc-spec/doc-ten/axtrace noaccess com.microsoft.teams2`
Expected: in hai mã (Teams có thể không cho đặt lại; ghi lại). Chủ dự án rời cuộc họp; thoát Teams nếu trước đó Teams không chạy.

- [ ] **Step 8: Chrome, lượt A rồi B**

Trình duyệt vừa khởi động lại. Lượt A: lấy mẫu 95 s trong lúc cửa sổ thứ hai phát giọng đọc máy (dùng `$B/truoc-spec/doc-ten/say_run.py` hay `say` lặp), không đọc cây. Lượt B: đặt trợ năng và đọc cây cửa sổ Meet 4 lần mỗi giây trong 95 s, cùng phát giọng đọc:

Run (A): `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W/bench/2026-10-26-nguoi-noi && $D/venv/bin/python -I cpu_sample.py 95 $D/out/chrome-A.csv "Google Chrome"`
Run (B): `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && cd $W/bench/2026-10-26-nguoi-noi && P=$(pgrep -f "^/Applications/Google Chrome.app/Contents/MacOS/Google Chrome$" | head -1) && (AXTRACE_PID=$P AXTRACE_WIN="^Meet" timeout 95 truoc-spec/doc-ten/axtrace watch com.google.Chrome $D/out/chrome-B-watch.jsonl 0.25 &) && $D/venv/bin/python -I cpu_sample.py 95 $D/out/chrome-B.csv "Google Chrome"`
Expected: hai file CSV. `"Google Chrome"` gồm cả tiến trình Helper (Renderer). Không có `timeout` (macOS) thì dùng `gtimeout` hay tự dừng `axtrace` bằng `kill` sau 95 s.

- [ ] **Step 9: Tính và ghi `$B/results/teams-chrome.md`**

Run: `D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && $D/venv/bin/python -c "
import csv,statistics as st,sys
for f in ['teams-A','teams-B','chrome-A','chrome-B']:
    rows=list(csv.DictReader(open('$D/out/'+f+'.csv')))
    for p in sorted({r['pattern'] for r in rows}):
        c=[float(r['cpu']) for r in rows if r['pattern']==p]; m=[float(r['rss_mb']) for r in rows if r['pattern']==p]
        print(f, p, 'CPU tb', round(st.mean(c),1), 'p90', round(sorted(c)[int(len(c)*.9)],1), 'RAM tb', round(st.mean(m)))"`
Expected: bảng 6–8 dòng.

Ghi: CPU và RAM trung bình, p90 của Teams và Chrome ở lượt A, B; chênh lệch; thời gian mỗi lượt đọc (`walk_ms` trong file watch); kết quả chỉ báo nói của Teams khi bảng People đóng (Step 6); kết luận cho spec §6.4 (Teams) và §6.8 (bật suốt phiên hay chỉ quanh lượt đọc). Trả âm lượng về giá trị đã lưu.

- [ ] **Step 10: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/cpu_sample.py bench/2026-10-26-nguoi-noi/find_indicators.py bench/2026-10-26-nguoi-noi/results/teams-chrome.md && git commit -m "docs(bench): chi phí trợ năng của Teams, Chrome và chỉ báo nói của Teams"
```

---

### Task 13: Windows: thăm dò UI Automation và tốc độ trên i5 (cần chủ dự án)

**Files:** Tạo `crates/speaker-worker/src/bin/uia-probe.rs`, `$B/results/windows-uia.md`; sửa `$B/results/toc-do.md`

- [ ] **Step 1: Viết `crates/speaker-worker/src/bin/uia-probe.rs`**

```rust
//! Spike kế hoạch 01 (spec 2026-10-26-phan-biet-nguoi-noi §6.2): đọc cây UI Automation của cửa sổ họp trên Windows, ghi JSON
//! như `axtrace` của macOS, để tìm tên người tham dự và chỉ báo "đang nói" của Teams, Chrome, Edge.
//!
//!   uia-probe list
//!   uia-probe dump <exe> <chữ trong tiêu đề> <ra.json>
//!   uia-probe watch <exe> <chữ trong tiêu đề> <ra.jsonl> [giây]
//!
//! Mỗi phần tử một dòng `độ sâu|ControlType|Name|AutomationId|ClassName|HelpText`. Chỉ đọc, không bấm gì.

#[cfg(not(windows))]
fn main() {
    eprintln!("uia-probe chỉ chạy trên Windows");
    std::process::exit(2);
}

#[cfg(windows)]
fn main() -> anyhow::Result<()> {
    win::run()
}

#[cfg(windows)]
mod win {
    use std::io::Write;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use anyhow::{Context, Result, bail};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement};
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible};
    use windows::core::{BOOL, BSTR, PWSTR};

    const MAX_NODES: usize = 40_000;
    const MAX_DEPTH: usize = 60;

    struct Win {
        hwnd: HWND,
        pid: u32,
        exe: String,
        title: String,
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let list = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
        list.push(hwnd);
        true.into()
    }

    fn exe_name(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            ok.then(|| String::from_utf16_lossy(&buf[..len as usize]).rsplit('\\').next().unwrap_or("").to_lowercase())
        }
    }

    fn windows_list() -> Vec<Win> {
        let mut hwnds: Vec<HWND> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut hwnds as *mut Vec<HWND> as isize));
        }
        hwnds
            .into_iter()
            .filter_map(|hwnd| unsafe {
                if !IsWindowVisible(hwnd).as_bool() {
                    return None;
                }
                let mut buf = [0u16; 512];
                let n = GetWindowTextW(hwnd, &mut buf);
                if n <= 0 {
                    return None;
                }
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                Some(Win {
                    hwnd,
                    pid,
                    exe: exe_name(pid).unwrap_or_default(),
                    title: String::from_utf16_lossy(&buf[..n as usize]),
                })
            })
            .collect()
    }

    fn find(exe: &str, title: &str) -> Result<Win> {
        let (exe, title) = (exe.to_lowercase(), title.to_lowercase());
        windows_list()
            .into_iter()
            .find(|w| w.exe == exe && w.title.to_lowercase().contains(&title))
            .with_context(|| format!("không thấy cửa sổ của {exe} có tiêu đề chứa \"{title}\""))
    }

    fn text(r: windows::core::Result<BSTR>) -> String {
        r.map(|b| b.to_string()).unwrap_or_default().replace(['|', '\n', '\r'], " ")
    }

    fn walk(auto: &IUIAutomation, root: &IUIAutomationElement) -> Result<Vec<String>> {
        let walker = unsafe { auto.RawViewWalker()? };
        let mut out = Vec::new();
        let mut stack = vec![(root.clone(), 0usize)];
        while let Some((el, depth)) = stack.pop() {
            if out.len() >= MAX_NODES {
                break;
            }
            let ct = unsafe { el.CurrentControlType() }.map(|c| c.0).unwrap_or(0);
            out.push(format!(
                "{depth}|{ct}|{}|{}|{}|{}",
                text(unsafe { el.CurrentName() }),
                text(unsafe { el.CurrentAutomationId() }),
                text(unsafe { el.CurrentClassName() }),
                text(unsafe { el.CurrentHelpText() }),
            ));
            if depth < MAX_DEPTH {
                let mut kids = Vec::new();
                let mut child = unsafe { walker.GetFirstChildElement(&el) }.ok();
                while let Some(c) = child {
                    child = unsafe { walker.GetNextSiblingElement(&c) }.ok();
                    kids.push(c);
                }
                for c in kids.into_iter().rev() {
                    stack.push((c, depth + 1));
                }
            }
        }
        Ok(out)
    }

    fn now() -> f64 {
        SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
    }

    pub fn run() -> Result<()> {
        let args: Vec<String> = std::env::args().collect();
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
        let auto: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)? };
        match args.get(1).map(String::as_str) {
            Some("list") => {
                for w in windows_list() {
                    println!("{}\t{}\t{}", w.pid, w.exe, w.title);
                }
            }
            Some("dump") if args.len() >= 5 => {
                let w = find(&args[2], &args[3])?;
                let root = unsafe { auto.ElementFromHandle(w.hwnd)? };
                let t0 = Instant::now();
                let lines = walk(&auto, &root)?;
                let ms = t0.elapsed().as_secs_f64() * 1000.0;
                let json = serde_json::json!({ "title": w.title, "walk_ms": ms, "n": lines.len(), "lines": lines });
                std::fs::write(&args[4], serde_json::to_string(&json)?)?;
                println!("{} phần tử, {ms:.0} ms → {}", lines.len(), args[4]);
            }
            Some("watch") if args.len() >= 5 => {
                let interval = args.get(5).map(|s| s.parse::<f64>()).transpose()?.unwrap_or(0.25);
                let mut file = std::fs::File::create(&args[4])?;
                let mut last: Vec<String> = Vec::new();
                loop {
                    let t0 = Instant::now();
                    let stamp = now();
                    let w = find(&args[2], &args[3])?;
                    let root = unsafe { auto.ElementFromHandle(w.hwnd)? };
                    let lines = walk(&auto, &root)?;
                    let ms = t0.elapsed().as_secs_f64() * 1000.0;
                    if lines != last {
                        let json = serde_json::json!({ "t": stamp, "walk_ms": ms, "n": lines.len(), "lines": lines });
                        writeln!(file, "{}", serde_json::to_string(&json)?)?;
                        last = lines;
                    }
                    let left = interval - t0.elapsed().as_secs_f64();
                    if left > 0.0 {
                        std::thread::sleep(Duration::from_secs_f64(left));
                    }
                }
            }
            _ => bail!(
                "cách dùng: uia-probe list | dump <exe> <chữ trong tiêu đề> <ra.json> | watch <exe> <chữ trong tiêu đề> <ra.jsonl> [giây]"
            ),
        }
        Ok(())
    }
}
```

- [ ] **Step 2: Kiểm biên dịch cho Windows và macOS**

Run: `cd $W && cargo check -p speaker-worker --bins --target x86_64-pc-windows-msvc 2>&1 | tail -3 && cargo build -p speaker-worker --bins 2>&1 | tail -1 && target/debug/uia-probe; echo "mã $?"`
Expected: `Finished` hai lần; trên macOS in `uia-probe chỉ chạy trên Windows`, `mã 2`. Lỗi kiểu dữ liệu của crate `windows` thì đối chiếu chữ ký trong `~/.cargo/registry/src/*/windows-0.62.2/src/Windows/Win32/...` và sửa.

- [ ] **Step 3: Commit**

```bash
cd $W && cargo fmt -p speaker-worker && cargo clippy -p speaker-worker --all-targets -- -D warnings && cargo clippy -p speaker-worker --bins --target x86_64-pc-windows-msvc -- -D warnings && git add crates/speaker-worker Cargo.lock && git commit -m "feat(speaker): công cụ thăm dò UI Automation trên Windows"
```

- [ ] **Step 4: Có binary Windows (cần chủ dự án)**

Cần `uia-probe.exe` và `latency-bench.exe`. Hỏi chủ dự án chọn:
- **(a)** Máy Windows có Rust: chủ dự án checkout nhánh `phan-biet-nguoi-noi` (phải được cho phép push) rồi `cargo build --release -p speaker-worker -p latency-bench`.
- **(b)** Build chéo trên Mac bằng `cargo-xwin` (tải CRT và SDK của Microsoft, chủ dự án phải đồng ý điều khoản): `cargo install cargo-xwin` rồi `cargo xwin build --release --target x86_64-pc-windows-msvc -p speaker-worker -p latency-bench`.
- **(c)** Đẩy nhánh để CI build (cần cho phép push và một job tạm).

Chép sang máy Windows: hai file `.exe`, `$DATA/models/eres2net-sv-en-voxceleb-16k.onnx`, `$M/models/silero_vad_v6.2.3.onnx`, `$DATA/ami/IS1009a.Mix-Headset.wav`.

- [ ] **Step 5: Tốc độ trên i5 (cần chủ dự án)**

Chủ dự án chạy trong PowerShell, gửi lại đầu ra:

```powershell
$env:RAYON_NUM_THREADS=1; .\latency-bench.exe speaker-eval --wav IS1009a.Mix-Headset.wav --vad-model silero_vad_v6.2.3.onnx --speaker-model eres2net-sv-en-voxceleb-16k.onnx --out out1.jsonl
$env:RAYON_NUM_THREADS=2; .\latency-bench.exe speaker-eval --wav IS1009a.Mix-Headset.wav --vad-model silero_vad_v6.2.3.onnx --speaker-model eres2net-sv-en-voxceleb-16k.onnx --out out2.jsonl
```

Ghi vào `$B/results/toc-do.md` phần Windows: tên CPU, p50/p90, % thời gian nhúng / thời lượng tiếng nói; so với ngân sách ≤ 10% một lõi (spec §11).

- [ ] **Step 6: Teams trên Windows (cần chủ dự án)**

- Đồng hồ hai máy phải khớp: chủ dự án chạy `w32tm /resync` (PowerShell quản trị) hoặc kiểm giờ Windows với Mac lệch < 0,2 s.
- Chủ dự án mở "Meet now" bằng Teams trên Windows (tài khoản Microsoft cá nhân), tắt mic và camera, gửi đường dẫn mời. Trên Mac, Claude cho Lan và Minh vào bằng `guests.py`; chủ dự án bấm Admit trên Windows; mở bảng People.
- Chủ dự án chạy `.\uia-probe.exe list`, gửi dòng của `ms-teams.exe`; rồi `.\uia-probe.exe watch ms-teams.exe "<chữ trong tiêu đề cửa sổ họp>" teams-win.jsonl 0.25` và để chạy.
- Trên Mac, Claude chạy kịch bản nói của khách mà không ghi cây: `run_schedule.py` với bundle id giả để `axtrace watch` không tìm thấy app (ví dụ `none.app`), tag `teams-win`:

Run: `cd $W/bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten && /Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi/venv/bin/python -I run_schedule.py none.app teams-win 'sel:#mic-button[aria-label="Unmute mic"]||#mic-button[aria-label="Mute mic"]'`
Expected: `xong teams-win`; `axtrace` in "app không chạy" (bình thường).

- Lặp lại khi bảng People đóng (tag `teams-win-c`, file `teams-win-c.jsonl`).
- Chủ dự án dừng `uia-probe` (Ctrl+C), gửi hai file `.jsonl` về; chép vào `$DATA/out/`.

Run: `cd $W/bench/2026-10-26-nguoi-noi && D=/Users/dtphong/Desktop/software_business/meeting-translator-work/data-nguoi-noi && for t in teams-win teams-win-c; do $D/venv/bin/python -I find_indicators.py $D/out/$t.jsonl truoc-spec/doc-ten/out/$t-truth.json; done`
Expected: dòng tương quan cao nhất cho Lan, Minh ở hai lượt; tên người tham dự có nằm trong `Name` không; thời gian mỗi lượt đọc (`walk_ms`).

- [ ] **Step 7: Meet trên Chrome Windows (cần chủ dự án)**

Chủ dự án mở phòng Meet bằng Chrome trên Windows (tài khoản Google, camera tắt) và chạy `.\uia-probe.exe watch chrome.exe "Meet" meet-win.jsonl 0.25`. Trên Mac, cửa sổ Chrome cùng tài khoản (hoặc Gmail thử) vào phòng, mở mic, Claude phát giọng đọc máy qua loa bằng `say_run.py` (âm lượng 45%; hỏi trước). Gửi file về, chạy `find_indicators.py` (truth là file `*-truth.json` do `say_run.py` ghi).

- [ ] **Step 8: Ghi `$B/results/windows-uia.md` và commit**

Ghi: phiên bản Windows, Teams, Chrome; tên người có trong cây không và ở thuộc tính nào; chỉ báo nói tìm được (vai trò, AutomationId, ClassName, vị trí so với tên) cho Teams (bảng People mở, đóng) và Meet; thời gian mỗi lượt đọc; khó khăn gặp phải.

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/results/windows-uia.md bench/2026-10-26-nguoi-noi/results/toc-do.md && git commit -m "docs(bench): UI Automation trên Windows và tốc độ nhận giọng trên i5"
```

---

### Task 14: README của thư mục đo

**Files:** Tạo `$B/README.md`

- [ ] **Step 1: Viết `$B/README.md`**

Nội dung (ngắn): mục đích (kế hoạch 01 của spec 2026-10-26-phan-biet-nguoi-noi); ba thư mục `$W`, `$M`, `$DATA` và cái gì nằm ở đâu; thứ tự chạy lại: `setup_env.sh` → `prepare_model.py` → `make_fixtures.py` → `fetch_ami.sh` → `latency-bench speaker-eval` (lệnh ở Task 7 Step 2) → `tune.py` → `build_cv_vi.py`; các công cụ cần người (Task 11–13) và lưu ý ở `truoc-spec/README.md`; danh sách file `results/`.

- [ ] **Step 2: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/README.md && git commit -m "docs(bench): README kế hoạch 01 phân biệt người nói"
```

---

### Task 15: Tổng hợp, ghi tham số chốt vào spec, xin duyệt

**Files:** Tạo `$B/results/tong-hop.md`; sửa `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md`

- [ ] **Step 1: Viết `$B/results/tong-hop.md`**

Một bảng trả lời từng câu hỏi của kế hoạch 01 (spec §13 mục 1), mỗi dòng: câu hỏi, kết quả (số), file kết quả, việc phải đổi trong spec (nếu có):
1. fbank Rust khớp Kaldi; ERes2Net trên `candle-onnx` khớp onnxruntime (Task 2, 3).
2. A-spk1 trên AMI bằng code Rust; ngưỡng chọn (Task 7).
3. A-spk2 tiếng Việt, bản Opus (Task 8).
4. Tốc độ, RAM macOS và Windows i5; nhận giọng có xong trước nhận dạng không; có cần tự tắt trên máy yếu (Task 9, 13).
5. App 0.3.1 đọc manifest có khóa `speaker` (Task 10).
6. Tiến trình con hưởng quyền Trợ năng (Task 11).
7. Chi phí trợ năng của Teams, Chrome; bật suốt phiên hay quanh lượt đọc (Task 12).
8. Chỉ báo nói của Teams khi bảng People đóng (Task 12, 13).
9. Bộ đọc UI Automation trên Windows thấy tên và chỉ báo (Task 13).

- [ ] **Step 2: Sửa spec theo kết quả**

Chỉ sửa các chỗ có số đo mới, mỗi chỗ ghi "(chốt ở kế hoạch 01, `results/<file>`)":
- §5.3: θ; §5.4: ngưỡng gộp, `merge_min_ms`.
- §6.2: tiến trình con và quyền Trợ năng (hoặc chuyển sang phương án dự phòng ở §14 nếu Task 11 cho kết quả không).
- §6.4: tín hiệu của Teams khi bảng People đóng; tín hiệu trên Windows.
- §6.6: độ trễ dời mốc theo từng app (Zoom, Teams, Meet; macOS và Windows) lấy từ trễ của dấu "đang nói" đo ở nghiên cứu trước spec và Task 12, 13.
- §6.8: Teams bật trợ năng suốt phiên hay quanh lượt đọc.
- §11: số CPU, RAM đo được.
- §12: mức đạt A-spk2 nếu cần chỉnh theo số đo (ghi rõ lý do; không hạ mức mà không hỏi chủ dự án).
- §14: rủi ro nào đã hết, rủi ro mới.

- [ ] **Step 3: Commit**

```bash
cd $W && git add bench/2026-10-26-nguoi-noi/results/tong-hop.md docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md && git commit -m "docs(spec): chốt tham số phân biệt người nói theo kết quả spike"
```

- [ ] **Step 4: Xin chủ dự án duyệt**

Báo chủ dự án bảng tổng hợp (tiếng Việt, ngắn), các chỗ đã sửa trong spec, và điều cần quyết (nếu A-spk2 không đạt, nếu tiến trình con không hưởng quyền, nếu Teams chậm rõ khi bật trợ năng). Sau khi duyệt mới viết kế hoạch 02.
