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
- `force = true` để biến môi trường có sẵn trong shell hay CI không ghi đè được các giá trị này.
- Build script của whisper-rs-sys không tự chạy lại khi các biến đổi, nên sửa file này thì phải `cargo clean -p whisper-rs-sys`.

```toml
# whisper-rs-sys chuyển mọi biến môi trường GGML_* sang CMake. Khóa mức CPU cố định cho asr-worker,
# vì whisper.cpp link tĩnh nên không tự chọn biến thể CPU lúc chạy (spec §6.12).
# x64: AVX2, FMA, F16C, BMI2, không AVX-512. arm64: mức Apple M1 (không i8mm, không SME).
# `force = true`: biến môi trường của shell hay CI không ghi đè được các giá trị này.
# Build script của whisper-rs-sys không tự chạy lại khi các biến này đổi: sửa file này thì chạy
# `cargo clean -p whisper-rs-sys && cargo clean -p whisper-rs-sys --release` rồi mới build.
[env]
GGML_NATIVE = { value = "OFF", force = true }
GGML_CPU_ARM_ARCH = { value = "armv8.4-a+fp16", force = true }
GGML_AVX = { value = "ON", force = true }
GGML_AVX2 = { value = "ON", force = true }
GGML_BMI2 = { value = "ON", force = true }
GGML_FMA = { value = "ON", force = true }
GGML_F16C = { value = "ON", force = true }
GGML_AVX512 = { value = "OFF", force = true }
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
# tauri-build sinh quyền cho command của app từ build.rs (app manifest), mỗi lần build đều ghi lại
/src-tauri/permissions/autogenerated/

# Hệ điều hành
.DS_Store

# Python
__pycache__/
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
yanked = "deny"
unsound = "all"
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

Điểm chính của crate:
- Khung dài tối đa 16 MiB, kiểm ở cả bên ghi lẫn bên đọc; bên đọc kiểm trước khi cấp phát bộ nhớ.
- Khung còn byte thừa sau thông điệp thì báo lỗi `TrailingBytes`. Như vậy nếu `asr-worker` và app lệch phiên bản giao thức, lỗi hiện ra ngay thay vì giải mã sai mà không ai biết.
- postcard mã hóa enum theo thứ tự khai báo, nên chỉ được thêm biến thể ở cuối; test `variant_indices_are_pinned` giữ quy tắc này.
- `Debug` của `TranscribeRequest` và `TranscribeResult` chỉ in kích thước, không in âm thanh hay bản chép lời (§10.1, §10.2).
- Không dùng `unsafe` (`#![forbid(unsafe_code)]`).

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
            avg_logprob: -0.31,
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
        // Trên sàn: 50 × số giây + 64, làm tròn lên.
        assert_eq!(audio_ctx_for_samples(143_361), 513); // vừa quá 8,96 giây: 449 + 64
        assert_eq!(audio_ctx_for_samples(16_000 * 12), 664); // 12 giây: 600 + 64
        assert_eq!(audio_ctx_for_samples(16_000 * 30 - 1), 1500); // sát 30 giây, bị chặn ở 1500
        assert_eq!(audio_ctx_for_samples(16_000 * 30), 1500); // 30 giây
    }

    #[test]
    fn audio_ctx_has_a_floor() {
        assert_eq!(MIN_AUDIO_CTX, 512);
        // Công thức thuần cho 1 + 64 = 65, 214, 484: sàn nâng cả ba lên 512.
        assert_eq!(audio_ctx_for_samples(1), 512);
        assert_eq!(audio_ctx_for_samples(48_000), 512); // 3 giây
        assert_eq!(audio_ctx_for_samples(134_400), 512); // 8,4 giây (8 giây + 2 × 200 ms đệm)
        // Sàn hết tác dụng đúng ở 8,96 giây, nơi công thức cho 448 + 64 = 512.
        assert_eq!(audio_ctx_for_samples(143_360), 512);
        // Sàn là một cửa sổ hợp lệ, và phủ được đoạn dài nhất mà công thức còn để nguyên (8,96 giây).
        assert!((0..=1500).contains(&MIN_AUDIO_CTX));
        assert!(MIN_AUDIO_CTX as usize * 320 >= 143_360);
    }

    /// Mỗi lần `read` chỉ trả tối đa 1 byte, và cứ lần thứ hai lại báo `Interrupted` (giống pipe thật).
    struct Trickle<R> {
        inner: R,
        calls: usize,
    }

    impl<R: Read> Read for Trickle<R> {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            self.calls += 1;
            if self.calls.is_multiple_of(2) {
                return Err(io::ErrorKind::Interrupted.into());
            }
            let n = buf.len().min(1);
            self.inner.read(&mut buf[..n])
        }
    }

    #[test]
    fn survives_short_reads_and_interrupts() {
        let mut buf = Vec::new();
        write_frame(&mut buf, &sample_request()).unwrap();
        write_frame(&mut buf, &Request::Warmup).unwrap();
        let mut r = Trickle {
            inner: Cursor::new(buf),
            calls: 0,
        };
        assert_eq!(read_frame::<_, Request>(&mut r).unwrap().unwrap(), sample_request());
        assert_eq!(read_frame::<_, Request>(&mut r).unwrap().unwrap(), Request::Warmup);
        assert!(read_frame::<_, Request>(&mut r).unwrap().is_none());
    }

    /// Message có kích thước mã hóa đúng bằng `MAX_FRAME_BYTES` (1 byte biến thể + 1 byte Option + 4 byte độ dài chuỗi).
    fn message_of_exactly_max() -> Response {
        let msg = Response::Error {
            segment_id: None,
            message: "a".repeat(MAX_FRAME_BYTES as usize - 6),
        };
        assert_eq!(postcard::to_stdvec(&msg).unwrap().len(), MAX_FRAME_BYTES as usize);
        msg
    }

    #[test]
    fn frame_of_exactly_max_bytes_roundtrips() {
        let msg = message_of_exactly_max();
        let mut buf = Vec::new();
        write_frame(&mut buf, &msg).unwrap();
        let got: Response = read_frame(&mut Cursor::new(buf)).unwrap().unwrap();
        assert_eq!(got, msg);
    }

    #[test]
    fn write_rejects_oversized_message_and_writes_nothing() {
        let Response::Error {
            segment_id,
            mut message,
        } = message_of_exactly_max()
        else {
            unreachable!()
        };
        message.push('a'); // MAX + 1
        let mut out = Vec::new();
        let res = write_frame(&mut out, &Response::Error { segment_id, message });
        assert!(matches!(res, Err(FrameError::TooLarge(n)) if n == MAX_FRAME_BYTES as u64 + 1));
        assert!(out.is_empty());
    }

    #[test]
    fn write_frame_flushes_and_uses_le_length_prefix() {
        let mut w = std::io::BufWriter::new(Vec::new());
        write_frame(&mut w, &Request::Warmup).unwrap();
        // Không gọi flush: dữ liệu phải đã xuống Vec bên dưới. 4 byte độ dài LE, rồi chỉ số biến thể 1.
        assert_eq!(w.get_ref().as_slice(), &[1, 0, 0, 0, 1]);
    }

    /// Khóa chỉ số biến thể (postcard mã hóa enum theo thứ tự khai báo): đổi thứ tự sẽ làm test này đỏ.
    #[test]
    fn variant_indices_are_pinned() {
        fn index<T: Serialize>(v: &T) -> u8 {
            postcard::to_stdvec(v).unwrap()[0]
        }
        let load = Request::Load {
            model_path: String::new(),
            use_gpu: false,
            n_threads: 0,
        };
        let requests = [
            index(&load),
            index(&Request::Warmup),
            index(&sample_request()),
            index(&Request::Shutdown),
        ];
        assert_eq!(requests, [0, 1, 2, 3]);

        let ready = Response::Ready {
            backend: String::new(),
            decode_mode: String::new(),
            whisper_version: String::new(),
            system_info: String::new(),
        };
        let result = Response::Result(TranscribeResult {
            segment_id: 0,
            lang: String::new(),
            lang_prob: 0.0,
            text: String::new(),
            tokens: vec![],
            no_speech_prob: 0.0,
            lid_ms: 0.0,
            asr_ms: 0.0,
            avg_logprob: 0.0,
        });
        let error = Response::Error {
            segment_id: None,
            message: String::new(),
        };
        let warmup_done = Response::WarmupDone { millis: 0.0 };
        let responses = [index(&ready), index(&warmup_done), index(&result), index(&error)];
        assert_eq!(responses, [0, 1, 2, 3]);
    }

    #[test]
    fn trailing_bytes_in_a_frame_are_rejected() {
        // Warmup (chỉ số 1) kèm 2 byte thừa.
        let mut r = Cursor::new(vec![3, 0, 0, 0, 1, 0xAA, 0xBB]);
        assert!(matches!(
            read_frame::<_, Request>(&mut r),
            Err(FrameError::TrailingBytes(2))
        ));
    }

    #[test]
    fn debug_output_never_contains_audio_or_transcript() {
        let req = Request::Transcribe(TranscribeRequest {
            segment_id: 1,
            pcm: vec![12345; 1000],
            languages: vec!["vi".into()],
            prompt_tokens: vec![777; 3],
            audio_ctx: 100,
        });
        let s = format!("{req:?}");
        assert!(
            s.contains("<1000 mẫu>") && !s.contains("12345") && !s.contains("777"),
            "{s}"
        );
        let resp = Response::Result(TranscribeResult {
            segment_id: 1,
            lang: "vi".into(),
            lang_prob: 0.9,
            text: "bí mật cuộc họp".into(),
            tokens: vec![4242],
            no_speech_prob: 0.0,
            lid_ms: 0.0,
            asr_ms: 0.0,
            avg_logprob: -0.5,
        });
        let s = format!("{resp:?}");
        assert!(!s.contains("bí mật") && !s.contains("4242"), "{s}");
        assert!(s.contains("avg_logprob: -0.5"), "{s}");
    }

    /// `avg_logprob` nằm cuối struct: postcard mã hóa trường theo thứ tự khai báo, nên 4 byte cuối của phản hồi
    /// `Result` là `avg_logprob` (f32 little-endian). Thêm trường sau nó, hoặc đổi chỗ, sẽ làm test này đỏ. Test chỉ khóa
    /// bố cục, không bảo đảm tương thích giữa hai bản build khác nhau.
    #[test]
    fn avg_logprob_is_the_last_field_on_the_wire() {
        let result = TranscribeResult {
            segment_id: 1,
            lang: "vi".into(),
            lang_prob: 0.9,
            text: "xin chào".into(),
            tokens: vec![1, 2],
            no_speech_prob: 0.1,
            lid_ms: 1.0,
            asr_ms: 2.0,
            avg_logprob: -0.8125,
        };
        let bytes = postcard::to_stdvec(&result).unwrap();
        assert_eq!(bytes[bytes.len() - 4..], (-0.8125f32).to_le_bytes());
        assert_eq!(postcard::from_bytes::<TranscribeResult>(&bytes).unwrap(), result);
    }

    #[test]
    fn audio_ctx_is_total() {
        assert_eq!(audio_ctx_for_samples(0), MIN_AUDIO_CTX);
        assert_eq!(audio_ctx_for_samples(1 << 40), 1500);
        assert_eq!(audio_ctx_for_samples(usize::MAX), 1500);
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

#![forbid(unsafe_code)]

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{self, Read, Write};

/// Âm thanh gửi cho `asr-worker` luôn là 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;

/// Số mẫu tối thiểu của một đoạn: 100 ms. Ngắn hơn thì `log_mel_spectrogram` của whisper.cpp đọc 200 mẫu đầu và
/// whisper.cpp bỏ qua đoạn, nên `asr-worker` trả `Error`.
pub const MIN_PCM_SAMPLES: usize = SAMPLE_RATE as usize / 10;

/// Số mẫu tối đa của một đoạn: 30 giây, đúng cửa sổ mã hóa tối đa của Whisper (1500 vị trí, mỗi vị trí 20 ms).
/// Dài hơn thì `asr-worker` trả `Error`.
pub const MAX_PCM_SAMPLES: usize = SAMPLE_RATE as usize * 30;

/// Số token tối đa của `prompt_tokens`: 100 token của đoạn trước cùng ngôn ngữ (spec §6.4). Nhiều hơn thì `asr-worker`
/// trả `Error`, để hai chế độ giải mã xử lý prompt giống nhau.
pub const MAX_PROMPT_TOKENS: usize = 100;

/// Sàn của `audio_ctx` mà [`audio_ctx_for_samples`] áp dụng: 512 khung (10,24 giây). Đoạn ngắn hơn 8,96 giây, nơi công
/// thức `50 × số giây + 64` cho dưới 512, được nâng lên bằng mức này. Đây là đề xuất cho §6.4 (xem kế hoạch 00, Task 2);
/// spec hiện chỉ có công thức không sàn. Lý do:
/// - A4 (S7): với cửa sổ mã hóa ngắn, Whisper chép thừa (lặp cụm cuối câu, chép cả câu hai lần). Có sàn thì tổng lỗi
///   trên 5 ngôn ngữ giảm 6,4% ở turbo và 1,5% ở small, không ô nào xấu đi đáng kể.
/// - S6: không có sàn thì turbo nhận diện ngôn ngữ sai ở 22/60 đoạn tiếng Việt (đoạn dưới 1,3 giây sai hết, thành
///   tiếng Anh); có sàn thì 53/60 đoạn đúng.
///
/// Chi phí: turbo chậm thêm khoảng 90 ms ở đoạn dưới 5 giây, small khoảng 15 ms; từ 9 giây trở lên không đổi.
pub const MIN_AUDIO_CTX: i32 = 512;

/// Một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB; 16 MiB là dư nhiều.
pub const MAX_FRAME_BYTES: u32 = 16 * 1024 * 1024;

/// Yêu cầu từ app gửi cho `asr-worker`. Mỗi yêu cầu có đúng một phản hồi, trừ `Shutdown` (worker thoát, không phản hồi):
/// `Load` → `Ready` hoặc `Error`; `Warmup` → `WarmupDone` hoặc `Error`; `Transcribe` → `Result` hoặc `Error`.
///
/// postcard mã hóa enum theo chỉ số biến thể (thứ tự khai báo): chỉ thêm biến thể mới ở CUỐI, không đổi thứ tự.
/// Thêm hoặc bỏ trường cũng đổi định dạng trên dây, nên app và `asr-worker` luôn phải build cùng một lúc.
/// Test `variant_indices_are_pinned` sẽ đỏ nếu vi phạm.
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

#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct TranscribeRequest {
    pub segment_id: u64,
    /// Âm thanh 16 kHz mono, từ [`MIN_PCM_SAMPLES`] đến [`MAX_PCM_SAMPLES`] mẫu (0,1 đến 30 giây); ngoài khoảng này
    /// worker trả `Error`.
    pub pcm: Vec<i16>,
    /// Mã ngôn ngữ Whisper được phép, ví dụ `["en", "vi"]`. Một phần tử nghĩa là khóa ngôn ngữ.
    pub languages: Vec<String>,
    /// Tối đa [`MAX_PROMPT_TOKENS`] token của đoạn trước cùng ngôn ngữ, dùng làm prompt khởi đầu; nhiều hơn thì worker
    /// trả `Error`.
    pub prompt_tokens: Vec<i32>,
    /// Cửa sổ mã hóa, mỗi vị trí 20 ms, trong khoảng 0 đến 1500. 0 nghĩa là cửa sổ 30 giây; giá trị khác phải phủ hết
    /// `pcm` (`audio_ctx · 320 ≥ pcm.len()`), nếu không worker trả `Error` vì whisper.cpp sẽ lặng lẽ bỏ phần đuôi.
    /// Công thức thường dùng: [`audio_ctx_for_samples`].
    pub audio_ctx: i32,
}

/// Phản hồi của `asr-worker`. Cùng quy tắc chỉ-thêm-ở-cuối như [`Request`].
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

#[derive(Serialize, Deserialize, Clone, PartialEq)]
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
    /// Trung bình log-xác suất của các token văn bản đã sinh. Không tính token đặc biệt, kể cả EOT: cố ý khác OpenAI
    /// (OpenAI cộng cả log-xác suất của EOT rồi chia cho số token cộng 1). Bỏ EOT thì trung bình âm hơn một chút, rõ ở
    /// đoạn ngắn, nên luật bên dưới chặt hơn một chút. Không có token nào thì là 0,0. Chế độ B bỏ log-xác suất của phần
    /// bị `cut_loop` gom; chế độ A không có `cut_loop` nên trung bình gồm cả token lặp.
    ///
    /// Cùng `no_speech_prob`, dùng để bỏ đoạn không có tiếng nói theo luật đề xuất cho §6.4 (xem kế hoạch 00, Task 2;
    /// spec hiện chỉ có `no_speech_prob > 0,6`): bỏ khi `no_speech_prob > 0,6` **và** `avg_logprob < −1`. Trên A4
    /// (548 clip) luật bỏ đúng 1 clip, small `en-9810650684898829002_nb`, có bản chép là ảo giác; turbo 0 clip.
    ///
    /// Nằm cuối struct để bố cục trên dây dễ đọc và dễ kiểm (postcard mã hóa trường theo thứ tự khai báo). Việc này
    /// không cho lợi ích tương thích: thêm hay bỏ trường nào cũng đổi định dạng, nên app và `asr-worker` luôn phải build
    /// cùng nhau (xem [`Request`]). Test `avg_logprob_is_the_last_field_on_the_wire` chỉ khóa bố cục.
    pub avg_logprob: f32,
}

// Debug viết tay: âm thanh và nội dung chép lời không bao giờ được vào log (spec §10.1, §10.2).
impl fmt::Debug for TranscribeRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TranscribeRequest")
            .field("segment_id", &self.segment_id)
            .field("pcm", &format_args!("<{} mẫu>", self.pcm.len()))
            .field("languages", &self.languages)
            .field("prompt_tokens", &format_args!("<{} token>", self.prompt_tokens.len()))
            .field("audio_ctx", &self.audio_ctx)
            .finish()
    }
}

impl fmt::Debug for TranscribeResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TranscribeResult")
            .field("segment_id", &self.segment_id)
            .field("lang", &self.lang)
            .field("lang_prob", &self.lang_prob)
            .field("text", &format_args!("<{} ký tự>", self.text.chars().count()))
            .field("tokens", &format_args!("<{} token>", self.tokens.len()))
            .field("no_speech_prob", &self.no_speech_prob)
            .field("lid_ms", &self.lid_ms)
            .field("asr_ms", &self.asr_ms)
            .field("avg_logprob", &self.avg_logprob)
            .finish()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error("lỗi I/O: {0}")]
    Io(#[from] io::Error),
    #[error("khung dài {0} byte, vượt giới hạn {MAX_FRAME_BYTES}")]
    TooLarge(u64),
    #[error("lỗi mã hóa: {0}")]
    Codec(#[from] postcard::Error),
    #[error("khung còn {0} byte thừa sau thông điệp")]
    TrailingBytes(usize),
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
///
/// Sau `FrameError::Io` hoặc `FrameError::TooLarge` luồng đã mất đồng bộ: bên gọi phải bỏ luồng và khởi động lại
/// tiến trình phụ. Sau `Codec` hoặc `TrailingBytes` cả khung đã được đọc hết, nên luồng vẫn đồng bộ.
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
    let (msg, rest) = postcard::take_from_bytes::<T>(&buf)?;
    if !rest.is_empty() {
        return Err(FrameError::TrailingBytes(rest.len()));
    }
    Ok(Some(msg))
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

/// `audio_ctx = min(1500, max(MIN_AUDIO_CTX, ceil(50 × số giây của đoạn) + 64))`. Làm tròn lên. Công thức của spec §6.4
/// là `min(1500, 50 × số giây + 64)`; sàn [`MIN_AUDIO_CTX`] là đề xuất cho §6.4 (xem kế hoạch 00, Task 2), giải thích ở
/// hằng đó.
pub fn audio_ctx_for_samples(n_samples: usize) -> i32 {
    let frames = (n_samples as u64).saturating_mul(50).div_ceil(SAMPLE_RATE as u64);
    frames.saturating_add(64).max(MIN_AUDIO_CTX as u64).min(1500) as i32
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p asr-protocol`
Expected: PASS, `test result: ok. 16 passed`

Bản cuối có thêm những thứ rút ra lúc thực thi các kế hoạch sau: `MIN_PCM_SAMPLES`, `MAX_PCM_SAMPLES`, `MAX_PROMPT_TOKENS`; mức sàn `MIN_AUDIO_CTX` (512) trong `audio_ctx_for_samples`; `avg_logprob` ở cuối `TranscribeResult`. Xem kế hoạch 03 và kế hoạch 00, Task 2.

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

Cách script tải:
- Mọi file được ghim phiên bản: model trên Hugging Face ghim theo commit, Silero theo tag, llama.cpp theo build. Script khai sẵn kích thước và SHA-256 của từng file.
- File được tải vào `.part`, kiểm kích thước và SHA-256 xong mới đổi tên. File đã có được kiểm lại ở mỗi lần chạy; khác bản đã ghim thì script dừng, không tự ghi đè.
- Rớt mạng thì tự thử lại 4 lần, có timeout; vẫn chưa xong thì chạy lại lệnh để tải tiếp.
- Cần Python 3.12 trở lên (giải nén an toàn bằng `tarfile` với `filter="data"`). `python3` của Homebrew trên máy này đủ mới; `python3` có sẵn của macOS là 3.9, không chạy được bước giải nén.

- [ ] **Step 1: Tạo `bench/phase0/fetch.py`**

```python
"""Tải model và llama.cpp cho Giai đoạn 0 vào models/ và tools/, kiểm kích thước và SHA-256, ghi models/MANIFEST.json.

Dùng:  python3 bench/phase0/fetch.py [--only whisper,mt,vad,llama]
- Cần Python 3.12 trở lên, vì giải nén an toàn bằng `tarfile` với `filter="data"`. python3 có sẵn của macOS là 3.9,
  nên trên máy chưa có Python mới thì chạy: uv run --no-project --python 3.12 python bench/phase0/fetch.py
- Mọi file đều ghim phiên bản, kèm kích thước và SHA-256:
  - file vừa tải được kiểm trước khi đổi tên từ `.part`;
  - file đã có được kiểm lại ở mỗi lần chạy.
- Rớt mạng thì chạy lại lệnh, script tải tiếp bằng HTTP Range.
- Chỉ dùng thư viện chuẩn của Python.
"""
import argparse
import glob
import hashlib
import http.client
import json
import os
import platform
import shutil
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "models")
TOOLS = os.path.join(ROOT, "tools")
HF = "https://huggingface.co"
WHISPER_REV = "5359861c739e955e79d9a303bcbc70fb988958b1"  # commit của repo ggerganov/whisper.cpp trên Hugging Face
HYMT2_REV = "a0c709d9fac510f2c807aa3af52872340dc37a4a"  # commit của repo tencent/Hy-MT2-1.8B-GGUF
# llama.cpp v0.5.0 là bản ổn định mới nhất (spec §6.12): build b11146 = commit 7fe450e19 = tag v0.5.0.
# `llama-server --version` in "0.5.0-dev (build 11146, commit 7fe450e19)".
LLAMA_TAG = "b11146"
LLAMA_URL = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}"
TIMEOUT = 30  # giây, cho mỗi lần kết nối và mỗi lần chờ dữ liệu
RETRIES = 4
USER_AGENT = "meeting-translator-phase0"

# Mỗi mục: (tên file, URL, số byte, SHA-256).
FILES = {
    "whisper": [
        ("ggml-large-v3-turbo-q5_0.bin", f"{HF}/ggerganov/whisper.cpp/resolve/{WHISPER_REV}/ggml-large-v3-turbo-q5_0.bin",
         574041195, "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"),
        ("ggml-small-q5_1.bin", f"{HF}/ggerganov/whisper.cpp/resolve/{WHISPER_REV}/ggml-small-q5_1.bin",
         190085487, "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"),
    ],
    "mt": [
        ("Hy-MT2-1.8B-Q8_0.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/{HYMT2_REV}/Hy-MT2-1.8B-Q8_0.gguf",
         1908528192, "5c3fe0b1408a5ceb0143184ef247b11b579c525f4b02b060e6c851bb76fef1a4"),
        ("Hy-MT2-1.8B-Q4_K_M.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/{HYMT2_REV}/Hy-MT2-1.8B-Q4_K_M.gguf",
         1133080448, "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699"),
        ("Hy-MT2-LICENSE.txt", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/{HYMT2_REV}/LICENSE.txt",
         11639, "a1d52d448f81c584a47c583e19dfab2d3851c7c84431b07baee093c1113ed114"),
    ],
    "vad": [
        ("silero_vad_v6.2.3.onnx",
         "https://raw.githubusercontent.com/snakers4/silero-vad/v6.2.3/src/silero_vad/data/silero_vad.onnx",
         2327524, "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"),
    ],
}
# Gói llama.cpp theo nền tảng: (tên file, số byte, SHA-256), lấy từ trang release b11146.
LLAMA = {
    "macos-arm64": [
        (f"llama-{LLAMA_TAG}-bin-macos-arm64.tar.gz",
         11189714, "1ad3f9eff80edb9dbef4259ad564d1720612ef7eea48fa4afed0e54f5f3d5711"),
    ],
    "windows-x64": [
        (f"llama-{LLAMA_TAG}-bin-win-vulkan-x64.zip",
         32127004, "55a378aa095b466979d85075234f66d7655c7a7483222af0c006c0e55b4d7bd6"),
        (f"llama-{LLAMA_TAG}-bin-win-cpu-x64.zip",
         18560055, "14cf1303ca9ac3abd94816850532f9f9a69ac66fbaca3776fc6f9061c2fac1d1"),
    ],
}


def llama_archives():
    system, machine = platform.system(), platform.machine().lower()
    if system == "Darwin" and machine == "arm64":
        return LLAMA["macos-arm64"]
    if system == "Windows" and machine in ("amd64", "x86_64"):
        return LLAMA["windows-x64"]
    raise SystemExit(f"Giai đoạn 0 chỉ hỗ trợ macOS arm64 và Windows x64, máy này là {system} {machine}")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 22):
            h.update(chunk)
    return h.hexdigest()


def fetch_into(url, part, have, size, name):
    """Tải phần còn thiếu vào `part`. Server bỏ qua Range (trả 200) thì ghi lại từ đầu."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if have:
        req.add_header("Range", f"bytes={have}-")
    tty = sys.stdout.isatty()
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        resumed = have > 0 and resp.status == 206
        done, shown = (have if resumed else 0), -1
        with open(part, "ab" if resumed else "wb") as f:
            while chunk := resp.read(1 << 20):
                f.write(chunk)
                done += len(chunk)
                pct = done * 100 // size
                if tty:
                    print(f"\r{name}: {pct:3d}%", end="", flush=True)
                elif pct // 10 > shown:  # không phải terminal (log, CI): in mỗi 10%
                    shown = pct // 10
                    print(f"{name}: {pct}%", flush=True)
    if tty:
        print()


def download(url, dest, size, sha):
    """Tải về `dest.part`, kiểm kích thước và SHA-256, rồi mới đổi tên thành `dest`."""
    name, part = os.path.basename(dest), dest + ".part"
    for attempt in range(1, RETRIES + 1):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        if have > size:  # dư byte thì không thể là bản đang ghim: tải lại từ đầu
            os.remove(part)
            have = 0
        if have < size:
            try:
                fetch_into(url, part, have, size, name)
            except urllib.error.HTTPError as e:
                if e.code == 416:  # server không nhận Range này
                    os.remove(part)
                    print(f"{name}: server trả 416, tải lại từ đầu")
                    continue
                if e.code < 500 and e.code != 429:
                    raise
                print(f"{name}: HTTP {e.code} (lần {attempt}/{RETRIES})")
                time.sleep(2 * attempt)
                continue
            except (OSError, http.client.HTTPException) as e:
                print(f"{name}: {e} (lần {attempt}/{RETRIES})")
                time.sleep(2 * attempt)
                continue
        got = os.path.getsize(part)
        if got > size:
            os.remove(part)
            raise SystemExit(f"{name}: server trả {got} byte, nhiều hơn bản đã ghim ({size}); kiểm lại URL và mã ghim")
        if got < size:  # kết nối đóng sớm: lần sau tải tiếp phần còn thiếu
            print(f"{name}: mới nhận {got}/{size} byte (lần {attempt}/{RETRIES})")
            continue
        if sha256(part) != sha:
            os.remove(part)
            raise SystemExit(f"{name}: SHA-256 không khớp bản đã ghim; đã xóa file tải dở, chạy lại để tải từ đầu")
        os.replace(part, dest)
        return
    raise SystemExit(f"{name}: chưa tải xong sau {RETRIES} lần; chạy lại để tải tiếp từ file .part")


def ensure(url, dest, size, sha):
    """Tải nếu chưa có. File đã có mà khác bản đã ghim thì dừng, không tự ghi đè."""
    if not os.path.exists(dest):
        download(url, dest, size, sha)
    elif os.path.getsize(dest) != size or sha256(dest) != sha:
        raise SystemExit(f"{os.path.basename(dest)}: khác bản đã ghim (kích thước hoặc SHA-256); xóa file rồi chạy lại")
    else:
        print("đã có", os.path.basename(dest))
    return {"bytes": size, "sha256": sha, "url": url}


def extract(archive, into):
    """Giải nén vào thư mục tạm rồi mới đổi tên, để lần chạy bị ngắt giữa chừng không để lại thư mục thiếu file.

    Thư mục đích đã có `llama-server` thì bỏ qua; có thư mục mà mất `llama-server` (ví dụ bị xóa nhầm) thì giải nén lại.
    """
    exe = "llama-server.exe" if archive.endswith(".zip") else "llama-server"
    if glob.glob(os.path.join(into, "**", exe), recursive=True):
        return
    shutil.rmtree(into, ignore_errors=True)
    tmp = into + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    if archive.endswith(".zip"):
        with zipfile.ZipFile(archive) as z:
            z.extractall(tmp)  # zipfile tự bỏ `..` và đường dẫn tuyệt đối
    else:
        with tarfile.open(archive) as t:
            t.extractall(tmp, filter="data")
    os.replace(tmp, into)


def load_manifest(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        print(f"bỏ qua {path} bị hỏng ({e}), ghi lại từ đầu")
        return {}


def save_manifest(path, manifest):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    os.replace(tmp, path)


def main():
    if hasattr(sys.stdout, "reconfigure"):  # console Windows không phải lúc nào cũng UTF-8
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="whisper,mt,vad,llama")
    groups = [g.strip() for g in ap.parse_args().only.split(",") if g.strip()]
    unknown = sorted(set(groups) - set(FILES) - {"llama"})
    if unknown:
        raise SystemExit(f"nhóm không hợp lệ: {unknown}; chọn trong: {', '.join([*FILES, 'llama'])}")
    archives = llama_archives() if "llama" in groups else []  # báo sớm nếu nền tảng không hỗ trợ
    if any(name.endswith(".tar.gz") for name, _, _ in archives) and not hasattr(tarfile, "data_filter"):
        raise SystemExit("cần Python 3.12 trở lên để giải nén an toàn; chạy: "
                         "uv run --no-project --python 3.12 python bench/phase0/fetch.py")
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(TOOLS, exist_ok=True)
    manifest_path = os.path.join(MODELS, "MANIFEST.json")
    manifest = load_manifest(manifest_path)
    for group in groups:
        if group == "llama":
            for name, size, sha in archives:
                archive = os.path.join(TOOLS, name)
                manifest[name] = ensure(f"{LLAMA_URL}/{name}", archive, size, sha)
                variant = name.removeprefix(f"llama-{LLAMA_TAG}-bin-").split(".")[0]
                extract(archive, os.path.join(TOOLS, f"llama-{LLAMA_TAG}", variant))
            continue
        for name, url, size, sha in FILES[group]:
            manifest[name] = ensure(url, os.path.join(MODELS, name), size, sha)
    save_manifest(manifest_path, manifest)
    for name, info in sorted(manifest.items()):
        print(f"{info['bytes'] / 1e6:10.1f} MB  {info['sha256'][:16]}…  {name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Tạo `bench/phase0/README.md`**

```markdown
# Giai đoạn 0: công cụ đo và kết quả

Kế hoạch: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`.

- `fetch.py`: tải model và llama.cpp b11146 vào `models/` và `tools/` (không commit), kiểm kích thước và SHA-256 đã ghim trong script. Chạy `python3 bench/phase0/fetch.py`, cần Python 3.12 trở lên, tải khoảng 3,8 GB.
- `mt/`: S4 (`check_template.py`) và S7 phần dịch (`build_testset.py`, `translate.py`, `score_mt.py`).
- `asr/`: bộ clip A4 (`build_clips.py`) và chấm WER/CER (`score_asr.py`).
- `latency/`: S6 (`build_sessions.py`, `run_matrix.py`, `summarize.py`, `vram-sample.ps1`, `vram_peak.py`).
- `vad/`: xác suất VAD tham chiếu bằng onnxruntime (`ref_probs.py`).
- `size/`: ước lượng dung lượng bộ cài, phần tiến trình phụ (`sidecar_size.py`).
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

- [ ] **Step 6: Trên Windows** (khi bắt đầu phần Windows), chạy `python bench\phase0\fetch.py`. Script tải bản `win-vulkan-x64` và `win-cpu-x64` của llama.cpp; hai file này cũng đã ghim kích thước và SHA-256 trong script.
