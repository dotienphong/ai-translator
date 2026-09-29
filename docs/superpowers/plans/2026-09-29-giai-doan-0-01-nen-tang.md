# Giai đoạn 0 · 01: nền tảng (công cụ, workspace, asr-protocol, tải model)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Cài đúng phiên bản công cụ, dựng Cargo workspace, viết crate `asr-protocol` (giao thức giữa app và `asr-worker`, spec §6.4), và tải model cùng llama.cpp về máy.

**Kiến trúc:** Workspace ở gốc repo, gồm `crates/*` (sau này thêm `src-tauri`). Model và công cụ tải về nằm trong `models/` và `tools/`, không commit; SHA-256 được ghi lại.

**Công nghệ:** Rust 1.98.1, postcard 1.1.3, serde 1.0.229, thiserror 2.0.21; cargo-audit 0.22.2 và cargo-deny 0.20.2 (kiểm tra phụ thuộc theo §6.12); Python 3 (thư viện chuẩn) cho script tải.

Tổng quan: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`.

---

### Task 1: Cài công cụ trên macOS

- [ ] **Step 1: Cài Rust qua rustup**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.98.1 --profile minimal
source "$HOME/.cargo/env"
rustup component add clippy rustfmt
rustc --version
```
Expected: `rustc 1.98.1 (48a229cea 2026-09-01)`

- [ ] **Step 2: Cài Node 24 LTS (qua fnm, máy đã có), pnpm và protobuf**

Không đổi Node mặc định của máy. File `.node-version` ở gốc repo khóa phiên bản cho riêng repo này. fnm trên máy đã bật `--use-on-cd`, nên tự chuyển phiên bản khi vào thư mục repo.

```bash
fnm install 24.21.0
echo 24.21.0 > .node-version
fnm use
npm install -g pnpm@12.6.0
brew install protobuf
node --version && pnpm --version && protoc --version && cmake --version | head -1 && uv --version
```
Expected: `v24.21.0`, `12.6.0`, `libprotoc 36.2` (hoặc mới hơn), `cmake version 4.3.3`, `uv 0.11.25` (cmake và uv đã có trên máy; máy khác thì `brew install cmake uv`).

`protoc` cần cho build `candle-onnx`, cmake cần cho build whisper.cpp. Xcode (có libclang cho bindgen) đã cài: `xcode-select -p` in ra `/Applications/Xcode.app/Contents/Developer`.

- [ ] **Step 3: Cài công cụ kiểm tra phụ thuộc** (§6.12 yêu cầu chạy `cargo audit` và `cargo deny` sau mỗi lần cài hoặc nâng cấp thư viện; mất khoảng 3 phút)

```bash
cargo install --locked cargo-audit@0.22.2 cargo-deny@0.20.2
cargo audit --version && cargo deny --version
```
Expected: `cargo-audit-audit 0.22.2` và `cargo-deny 0.20.2`.

Chỉ cần cài trên Mac. `deny.toml` đã khai cả hai nền tảng phát hành, nên chạy trên Mac là kiểm được phụ thuộc của bản Windows.

### Task 2: Cài công cụ trên Windows (làm khi bắt đầu phần Windows của 03, 04, 05)

- [ ] **Step 1: Cài Visual Studio Build Tools bản mới nhất**, workload "Desktop development with C++", tải từ https://visualstudio.microsoft.com/downloads/ (mục Tools for Visual Studio).

- [ ] **Step 2: Cài các công cụ còn lại bằng winget (PowerShell)**

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Kitware.CMake -e
winget install --id LLVM.LLVM -e
winget install --id KhronosGroup.VulkanSDK -e
winget install --id Google.Protobuf -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id astral-sh.uv -e
winget install --id Git.Git -e
```

- [ ] **Step 3: Đặt đường dẫn libclang cho bindgen, mở terminal mới rồi kiểm tra**

```powershell
setx LIBCLANG_PATH "C:\Program Files\LLVM\bin"
rustup toolchain install 1.98.1 --profile minimal --component clippy,rustfmt
npm install -g pnpm@12.6.0
rustc --version; cmake --version; clang --version; protoc --version; node --version; echo $env:VULKAN_SDK
```
Expected: `rustc 1.98.1`, `clang` in ra phiên bản, `protoc` dòng 36, `v24.x`, và `VULKAN_SDK` trỏ tới thư mục SDK. Nếu `protoc` chưa có trong PATH thì thêm thư mục `bin` của gói Protobuf vào PATH.

- [ ] **Step 4: Đưa repo sang máy Windows.** Repo chưa có remote, nên chọn một trong hai cách:
  - **Remote riêng tư** (GitHub hoặc GitLab, chế độ private; hỏi chủ dự án trước khi tạo): `git clone <url>` trên Windows, rồi đồng bộ bằng `git pull` và `git push`.
  - **`git bundle`**, không cần mạng:
    - Mac sang Windows: trên Mac chạy `git bundle create ~/mt.bundle --all`, chép file sang Windows, rồi `git clone mt.bundle meeting-translator`. Những lần sau thì chạy `git pull <file bundle mới> main`.
    - Windows về Mac: trên Windows chạy `git bundle create win.bundle main`, chép về Mac, rồi `git pull win.bundle main`.

### Task 3: Dựng workspace

**Files:**
- Create: `Cargo.toml`
- Create: `rust-toolchain.toml`
- Create: `rustfmt.toml`
- Create: `.cargo/config.toml`
- Create: `.gitignore`
- Create: `deny.toml`
- Đã có từ Task 1: `.node-version`

- [ ] **Step 1: Tạo `Cargo.toml` ở gốc repo**

```toml
[workspace]
resolver = "3"
members = ["crates/*"]

[workspace.package]
edition = "2024"
rust-version = "1.98"
publish = false

[workspace.dependencies]
anyhow = "1.0.104"
clap = { version = "4.6.7", features = ["derive"] }
hound = "3.5.1"
postcard = { version = "1.1.3", default-features = false, features = ["use-std"] }
rtrb = "0.4.0"
rubato = "5.0.0"
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1.0.151"
thiserror = "2.0.21"

[profile.release]
strip = true
lto = true
codegen-units = 1
panic = "abort"
```

- [ ] **Step 2: Tạo `rust-toolchain.toml`**

```toml
[toolchain]
channel = "1.98.1"
components = ["clippy", "rustfmt"]
```

- [ ] **Step 3: Tạo `rustfmt.toml`**

```toml
edition = "2024"
max_width = 120
```

- [ ] **Step 4: Tạo `.cargo/config.toml`**

Các biến này khóa mức CPU cho whisper.cpp trong `asr-worker` (spec §6.12). whisper-rs-sys chuyển mọi biến `GGML_*` sang CMake.

```toml
# whisper-rs-sys chuyển mọi biến môi trường GGML_* sang CMake. Khóa mức CPU cố định cho asr-worker,
# vì whisper.cpp link tĩnh nên không tự chọn biến thể CPU lúc chạy (spec §6.12).
# x64: AVX2, FMA, F16C, không AVX-512. arm64: mức Apple M1 (không i8mm, không SME).
[env]
GGML_NATIVE = "OFF"
GGML_CPU_ARM_ARCH = "armv8.4-a+fp16"
GGML_AVX = "ON"
GGML_AVX2 = "ON"
GGML_BMI2 = "ON"
GGML_FMA = "ON"
GGML_F16C = "ON"
GGML_AVX512 = "OFF"
```

- [ ] **Step 5: Tạo `.gitignore`**

```gitignore
# Rust
/target/

# Frontend
/node_modules/
/dist/

# Model, công cụ tải về và dữ liệu lớn của Giai đoạn 0 (xem bench/phase0/fetch.py)
/models/
/tools/
/bench/phase0/data/

# Tauri
/src-tauri/gen/

# Hệ điều hành
.DS_Store
```

- [ ] **Step 6: Tạo `deny.toml`**

Danh sách giấy phép lấy theo toàn bộ phụ thuộc lúc lập kế hoạch: app đóng nguồn nên không nhận GPL, LGPL hay AGPL. Nếu sau này `cargo deny check` báo giấy phép lạ thì dừng lại và hỏi, không tự thêm vào danh sách.

```toml
# Kiểm tra phụ thuộc Rust theo spec §6.12. Chạy `cargo deny check` sau mỗi lần cài hoặc nâng cấp thư viện.

[graph]
# Chỉ xét hai nền tảng phát hành. Phụ thuộc chỉ có trên Linux (gtk của Tauri) không vào bản build.
targets = ["aarch64-apple-darwin", "x86_64-pc-windows-msvc"]
all-features = true

[advisories]
ignore = []

[licenses]
# App đóng nguồn: chỉ nhận giấy phép dễ dãi, và MPL-2.0 (copyleft theo từng file, dùng nguyên bản không sửa).
allow = [
    "0BSD",
    "Apache-2.0",
    "Apache-2.0 WITH LLVM-exception",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BSL-1.0",
    "CC0-1.0",
    "ISC",
    "MIT",
    "MIT-0",
    "MPL-2.0",
    "Unicode-3.0",
    "Unlicense",
    "Zlib",
]
confidence-threshold = 0.8
# Danh sách trên dùng cho cả workspace sau này, nên giấy phép chưa gặp không phải lỗi.
unused-allowed-license = "allow"

[licenses.private]
# Crate trong workspace không publish nên không khai giấy phép.
ignore = true

[bans]
multiple-versions = "allow"
wildcards = "allow"

[sources]
unknown-registry = "deny"
unknown-git = "deny"
```

### Task 4: Crate `asr-protocol` (TDD)

**Files:**
- Create: `crates/asr-protocol/Cargo.toml`
- Create: `crates/asr-protocol/src/lib.rs`

- [ ] **Step 1: Tạo `Cargo.toml` của crate**

```toml
[package]
name = "asr-protocol"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[dependencies]
postcard.workspace = true
serde.workspace = true
thiserror.workspace = true
```

- [ ] **Step 2: Viết test trước.** Tạo `crates/asr-protocol/src/lib.rs` chỉ gồm phần test sau:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample_request() -> Request {
        Request::Transcribe(TranscribeRequest {
            segment_id: 7,
            pcm: vec![0, 1, -1, i16::MAX, i16::MIN],
            languages: vec!["en".into(), "vi".into()],
            prompt_tokens: vec![50364, 123],
            audio_ctx: 214,
        })
    }

    #[test]
    fn roundtrip_request_and_response() {
        let mut buf = Vec::new();
        write_frame(&mut buf, &sample_request()).unwrap();
        let ready = Response::Ready {
            backend: "metal".into(),
            decode_mode: "shared".into(),
            whisper_version: "1.8.3".into(),
            system_info: "NEON = 1".into(),
        };
        write_frame(&mut buf, &ready).unwrap();
        let resp = Response::Result(TranscribeResult {
            segment_id: 7,
            lang: "vi".into(),
            lang_prob: 0.93,
            text: "xin chào".into(),
            tokens: vec![1, 2, 3],
            no_speech_prob: 0.01,
            lid_ms: 12.5,
            asr_ms: 240.0,
        });
        write_frame(&mut buf, &resp).unwrap();

        let mut r = Cursor::new(buf);
        let got_req: Request = read_frame(&mut r).unwrap().unwrap();
        let got_ready: Response = read_frame(&mut r).unwrap().unwrap();
        let got_resp: Response = read_frame(&mut r).unwrap().unwrap();
        assert_eq!(got_req, sample_request());
        assert_eq!(got_ready, ready);
        assert_eq!(got_resp, resp);
        assert!(read_frame::<_, Request>(&mut r).unwrap().is_none());
    }

    #[test]
    fn empty_stream_is_clean_eof() {
        let mut r = Cursor::new(Vec::<u8>::new());
        assert!(read_frame::<_, Request>(&mut r).unwrap().is_none());
    }

    #[test]
    fn truncated_length_is_an_error() {
        let mut r = Cursor::new(vec![3u8, 0]);
        assert!(matches!(read_frame::<_, Request>(&mut r), Err(FrameError::Io(_))));
    }

    #[test]
    fn truncated_payload_is_an_error() {
        let mut buf = Vec::new();
        write_frame(&mut buf, &sample_request()).unwrap();
        buf.truncate(buf.len() - 1);
        let mut r = Cursor::new(buf);
        assert!(matches!(read_frame::<_, Request>(&mut r), Err(FrameError::Io(_))));
    }

    #[test]
    fn oversized_length_is_rejected() {
        let mut buf = (MAX_FRAME_BYTES + 1).to_le_bytes().to_vec();
        buf.extend_from_slice(&[0; 8]);
        let mut r = Cursor::new(buf);
        assert!(matches!(read_frame::<_, Request>(&mut r), Err(FrameError::TooLarge(_))));
    }

    #[test]
    fn audio_ctx_matches_spec_formula() {
        assert_eq!(audio_ctx_for_samples(48_000), 214); // 3 giây
        assert_eq!(audio_ctx_for_samples(134_400), 484); // 8,4 giây (8 giây + 2 × 200 ms đệm)
        assert_eq!(audio_ctx_for_samples(16_000 * 30), 1500); // 30 giây, bị chặn ở 1500
        assert_eq!(audio_ctx_for_samples(1), 65); // làm tròn lên
    }
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p asr-protocol`
Expected: FAIL, lỗi biên dịch vì chưa có `Request`, `write_frame`, `read_frame`, `audio_ctx_for_samples`.

- [ ] **Step 4: Viết phần code.** Chèn đoạn sau vào đầu `crates/asr-protocol/src/lib.rs`, phía trên `#[cfg(test)]`:

```rust
//! Giao thức giữa tiến trình chính và `asr-worker` (spec §6.4).
//!
//! Mỗi khung gồm độ dài `u32` little-endian, theo sau là nội dung mã hóa bằng postcard.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

/// Âm thanh gửi cho `asr-worker` luôn là 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;

/// Một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB; 16 MiB là dư nhiều.
pub const MAX_FRAME_BYTES: u32 = 16 * 1024 * 1024;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Request {
    Load {
        model_path: String,
        use_gpu: bool,
        n_threads: u32,
    },
    Warmup,
    Transcribe(TranscribeRequest),
    Shutdown,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct TranscribeRequest {
    pub segment_id: u64,
    /// Âm thanh 16 kHz mono.
    pub pcm: Vec<i16>,
    /// Mã ngôn ngữ Whisper được phép, ví dụ `["en", "vi"]`. Một phần tử nghĩa là khóa ngôn ngữ.
    pub languages: Vec<String>,
    /// Tối đa 100 token của đoạn trước cùng ngôn ngữ, dùng làm prompt khởi đầu.
    pub prompt_tokens: Vec<i32>,
    pub audio_ctx: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Response {
    Ready {
        backend: String,
        /// `shared` (chế độ B: nhận diện ngôn ngữ và chép lời dùng chung một lượt encode) hoặc `split` (chế độ A).
        decode_mode: String,
        whisper_version: String,
        system_info: String,
    },
    WarmupDone {
        millis: f32,
    },
    Result(TranscribeResult),
    Error {
        segment_id: Option<u64>,
        message: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct TranscribeResult {
    pub segment_id: u64,
    pub lang: String,
    pub lang_prob: f32,
    pub text: String,
    pub tokens: Vec<i32>,
    pub no_speech_prob: f32,
    /// Thời gian nhận diện ngôn ngữ, 0 nếu ngôn ngữ bị khóa.
    pub lid_ms: f32,
    /// Thời gian chép lời (encode + decode).
    pub asr_ms: f32,
}

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error("lỗi I/O: {0}")]
    Io(#[from] io::Error),
    #[error("khung dài {0} byte, vượt giới hạn {MAX_FRAME_BYTES}")]
    TooLarge(u64),
    #[error("lỗi mã hóa: {0}")]
    Codec(#[from] postcard::Error),
}

pub fn write_frame<W: Write, T: Serialize>(w: &mut W, msg: &T) -> Result<(), FrameError> {
    let bytes = postcard::to_stdvec(msg)?;
    if bytes.len() as u64 > MAX_FRAME_BYTES as u64 {
        return Err(FrameError::TooLarge(bytes.len() as u64));
    }
    w.write_all(&(bytes.len() as u32).to_le_bytes())?;
    w.write_all(&bytes)?;
    w.flush()?;
    Ok(())
}

/// Đọc một khung. Trả `Ok(None)` khi luồng đóng đúng ở ranh giới giữa hai khung.
pub fn read_frame<R: Read, T: DeserializeOwned>(r: &mut R) -> Result<Option<T>, FrameError> {
    let mut len_buf = [0u8; 4];
    let got = read_up_to(r, &mut len_buf)?;
    if got == 0 {
        return Ok(None);
    }
    if got < len_buf.len() {
        return Err(io::Error::from(io::ErrorKind::UnexpectedEof).into());
    }
    let len = u32::from_le_bytes(len_buf);
    if len > MAX_FRAME_BYTES {
        return Err(FrameError::TooLarge(len as u64));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    Ok(Some(postcard::from_bytes(&buf)?))
}

fn read_up_to<R: Read>(r: &mut R, buf: &mut [u8]) -> io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match r.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(filled)
}

/// `audio_ctx = min(1500, 50 × số giây của đoạn + 64)` (spec §6.4). Làm tròn lên.
pub fn audio_ctx_for_samples(n_samples: usize) -> i32 {
    let frames = (n_samples as u64 * 50).div_ceil(SAMPLE_RATE as u64);
    (frames as i32 + 64).min(1500)
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p asr-protocol`
Expected: PASS, `test result: ok. 6 passed`

- [ ] **Step 6: Kiểm tra định dạng và clippy**

Run: `cargo fmt --all -- --check && cargo clippy -p asr-protocol --all-targets -- -D warnings`
Expected: không có lỗi, không có cảnh báo.

- [ ] **Step 7: Kiểm tra phụ thuộc**

Run: `cargo deny check && cargo audit`
Expected:
- `cargo deny check` in ra `advisories ok, bans ok, licenses ok, sources ok`.
- `cargo audit` in ra `Scanning Cargo.lock for vulnerabilities (14 crate dependencies)` và không báo lỗ hổng nào.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml rust-toolchain.toml rustfmt.toml .cargo/config.toml .gitignore deny.toml .node-version crates/asr-protocol Cargo.lock
git commit -m "feat(asr-protocol): giao thức stdin/stdout giữa app và asr-worker"
```

### Task 5: Tải model và llama.cpp

**Files:**
- Create: `bench/phase0/fetch.py`
- Create: `bench/phase0/README.md`
- Create: `bench/phase0/results/models-manifest.json` (do script sinh ra, copy từ `models/MANIFEST.json`)

- [ ] **Step 1: Tạo `bench/phase0/fetch.py`**

```python
"""Tải model và llama.cpp cho Giai đoạn 0; ghi kích thước và SHA-256 vào models/MANIFEST.json.

Dùng:  python3 bench/phase0/fetch.py [--only whisper,mt,vad,llama]
Tải tiếp được khi rớt mạng (HTTP Range). Chỉ dùng thư viện chuẩn của Python.
"""
import argparse
import hashlib
import json
import os
import platform
import tarfile
import urllib.request
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "models")
TOOLS = os.path.join(ROOT, "tools")
HF = "https://huggingface.co"
# llama.cpp v0.5.0 là bản ổn định mới nhất, tương ứng build b11146 (spec §6.12).
LLAMA_TAG = "b11146"
LLAMA_URL = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}"

FILES = {
    "whisper": [
        ("ggml-large-v3-turbo-q5_0.bin", f"{HF}/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"),
        ("ggml-small-q5_1.bin", f"{HF}/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin"),
    ],
    "mt": [
        ("Hy-MT2-1.8B-Q8_0.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/main/Hy-MT2-1.8B-Q8_0.gguf"),
        ("Hy-MT2-1.8B-Q4_K_M.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/main/Hy-MT2-1.8B-Q4_K_M.gguf"),
        ("Hy-MT2-LICENSE.txt", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/main/LICENSE.txt"),
    ],
    "vad": [
        ("silero_vad_v6.2.3.onnx",
         "https://raw.githubusercontent.com/snakers4/silero-vad/v6.2.3/src/silero_vad/data/silero_vad.onnx"),
    ],
}


def llama_archives():
    system, machine = platform.system(), platform.machine().lower()
    if system == "Darwin" and machine == "arm64":
        return [f"llama-{LLAMA_TAG}-bin-macos-arm64.tar.gz"]
    if system == "Windows" and machine in ("amd64", "x86_64"):
        return [f"llama-{LLAMA_TAG}-bin-win-vulkan-x64.zip", f"llama-{LLAMA_TAG}-bin-win-cpu-x64.zip"]
    raise SystemExit(f"Giai đoạn 0 chỉ hỗ trợ macOS arm64 và Windows x64, máy này là {system} {machine}")


def download(url, dest):
    if os.path.exists(dest):
        print("đã có", os.path.basename(dest))
        return
    part = dest + ".part"
    have = os.path.getsize(part) if os.path.exists(part) else 0
    req = urllib.request.Request(url, headers={"User-Agent": "meeting-translator-phase0"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    with urllib.request.urlopen(req) as resp, open(part, "ab" if have and resp.status == 206 else "wb") as f:
        total = int(resp.headers.get("Content-Length", 0)) + (have if resp.status == 206 else 0)
        done = have if resp.status == 206 else 0
        while chunk := resp.read(1 << 20):
            f.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r{os.path.basename(dest)}: {done / total:6.1%}", end="", flush=True)
    print()
    os.replace(part, dest)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 22):
            h.update(chunk)
    return h.hexdigest()


def extract(archive, into):
    os.makedirs(into, exist_ok=True)
    if archive.endswith(".zip"):
        with zipfile.ZipFile(archive) as z:
            z.extractall(into)
    else:
        with tarfile.open(archive) as t:
            t.extractall(into, filter="data")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="whisper,mt,vad,llama")
    groups = ap.parse_args().only.split(",")
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(TOOLS, exist_ok=True)
    manifest_path = os.path.join(MODELS, "MANIFEST.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    for group in groups:
        if group == "llama":
            for name in llama_archives():
                archive = os.path.join(TOOLS, name)
                download(f"{LLAMA_URL}/{name}", archive)
                variant = name.removeprefix(f"llama-{LLAMA_TAG}-bin-").split(".")[0]
                extract(archive, os.path.join(TOOLS, f"llama-{LLAMA_TAG}", variant))
                manifest[name] = {"bytes": os.path.getsize(archive), "sha256": sha256(archive), "url": f"{LLAMA_URL}/{name}"}
            continue
        for name, url in FILES[group]:
            dest = os.path.join(MODELS, name)
            download(url, dest)
            manifest[name] = {"bytes": os.path.getsize(dest), "sha256": sha256(dest), "url": url}
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=1)
    for name, info in sorted(manifest.items()):
        print(f"{info['bytes'] / 1e6:10.1f} MB  {info['sha256'][:16]}…  {name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Tạo `bench/phase0/README.md`**

```markdown
# Giai đoạn 0: công cụ đo và kết quả

Kế hoạch: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`.

- `fetch.py`: tải model và llama.cpp b11146 vào `models/` và `tools/` (không commit), ghi SHA-256.
- `mt/`: S4 (`check_template.py`) và S7 phần dịch (`build_testset.py`, `translate.py`, `score_mt.py`).
- `asr/`: bộ clip A4 (`build_clips.py`) và chấm WER/CER (`score_asr.py`).
- `latency/`: S6 (`build_sessions.py`, `summarize.py`, `vram-sample.ps1`).
- `vad/`: xác suất VAD tham chiếu bằng onnxruntime (`ref_probs.py`).
- `results/`: kết quả nhỏ (JSON, Markdown), được commit.
- `data/`: dữ liệu lớn (âm thanh, bản dịch), không commit.

Các công cụ Rust nằm trong workspace: `latency-bench latency` (S6) và `latency-bench asr-eval` (A4).
```

- [ ] **Step 3: Chạy trên Mac** (khoảng 4 GB)

Run: `python3 bench/phase0/fetch.py`
Expected: mỗi file có một dòng tiến độ, cuối cùng là bảng (SHA-256 rút gọn thay bằng `…` ở đây):
```
    1133.1 MB  …  Hy-MT2-1.8B-Q4_K_M.gguf
    1908.5 MB  …  Hy-MT2-1.8B-Q8_0.gguf
       0.0 MB  …  Hy-MT2-LICENSE.txt
     574.0 MB  …  ggml-large-v3-turbo-q5_0.bin
     190.1 MB  …  ggml-small-q5_1.bin
      11.2 MB  …  llama-b11146-bin-macos-arm64.tar.gz
       2.3 MB  …  silero_vad_v6.2.3.onnx
```

- [ ] **Step 4: Kiểm tra `llama-server` chạy được**

Run: `tools/llama-b11146/macos-arm64/llama-b11146/llama-server --version`
Expected: dòng `version: 0.5.0-dev (build 11146, commit 7fe450e19)`.

- [ ] **Step 5: Ghi lại manifest và commit**

```bash
mkdir -p bench/phase0/results
cp models/MANIFEST.json bench/phase0/results/models-manifest.json
git add bench/phase0/fetch.py bench/phase0/README.md bench/phase0/results/models-manifest.json
git commit -m "chore(bench): script tải model và llama.cpp b11146 cho Giai đoạn 0"
```

- [ ] **Step 6: Trên Windows** (khi bắt đầu phần Windows), chạy `python bench\phase0\fetch.py`. Script tải bản `win-vulkan-x64` và `win-cpu-x64` của llama.cpp.
