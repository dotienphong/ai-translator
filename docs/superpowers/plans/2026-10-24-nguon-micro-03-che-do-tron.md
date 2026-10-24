# Nguồn micro, kế hoạch 03: chế độ Âm thanh máy + Micro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng chọn "Âm thanh máy + Micro" thì app dịch cả cuộc họp online lẫn người nói trong phòng. Micro được hạ
khi tiếng online đang phát (nhường lời B), để tiếng vọng không bị dịch hai lần.

**Architecture:**
- Luồng âm thanh máy (`Preprocessor`) và luồng micro (`MicPreprocessor`) được trộn bằng `DuckingMixer` của spike.
  Kết quả là hai bản trộn: bản cho whisper và bản cho VAD.
- Micro lỗi hay thiếu quyền thì phiên vẫn chạy với âm thanh máy. App đặt `micIssue` và thử mở lại micro mỗi 2 giây.
- Các bộ canh tách theo nguồn: tap chết chỉ xét âm thanh máy; "toàn số 0" có bộ riêng cho từng nguồn.

**Tech Stack:** Rust (`audio-capture::duck`, `mic_chain`), Tauri 2, React 19 + Zustand, Vitest; đo bằng
`latency-bench mix-eval`.

---

## Bối cảnh

- **Spec:** `docs/superpowers/specs/2026-10-24-nguon-micro-design.md`.
  - Đọc mục 3.1–3.4, 5.3–5.6, 7, 10, 11.
  - **Mục 16 ghi đè** các mục trước: B −55 dBFS / −30 dB / giữ 300 ms; VAD chế độ `both` 0,5 / 600 / 500; bộ giới hạn
    mức cho bản whisper, `tanh` cho bản VAD.
- **Kế hoạch 02 đã thực thi:** `docs/superpowers/plans/2026-10-24-nguon-micro-02-che-do-micro.md`. Chế độ `mic` chạy được
  trên Mac; thử tay ở `bench/2026-10-24-nguon-micro/results/thu-tay-mac.md`, sửa ở `results/gioi-han-muc.md`.
- **Worktree:** `/Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro`, nhánh `nguon-micro`.
  - Shell reset thư mục sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd <worktree> &&`**.
  - Không merge, push, deploy hay đẩy tag khi chủ dự án chưa cho phép.
- **Code đã có, dùng lại:**
  - `crates/audio-capture/src/duck.rs`:
    - `GateParams { threshold_dbfs, duck_db, hold_ms }`;
    - `DuckingMixer::new(params, max_skew)`, `push_playback`, `push_mic(asr, vad)` (hai bản dài bằng nhau),
      `drain_into(out, out_vad)`, `flush_into`, `ducked_ratio()`.
  - `crates/audio-capture/src/mic_chain.rs`: `MicPreprocessor::new(consumer, format, noise_filter)`, `drain(out, out_vad)`.
  - `crates/audio-capture/src/preprocess.rs`: `Preprocessor::drain(out)`, `MAX_SKEW_SAMPLES` (100 ms).
  - `src-tauri/src/capture.rs`:
    - `CapturePlan { Playback, Mic }`, `enum Pre`, `start_sources`, `start_mic`, `capture_loop`;
    - `LiveCapture::read_with_vad`, `ZeroWatch`, `Watch`, `FailurePolicy`, `CaptureEvent::MicSilent`.
  - `src-tauri/src/session.rs`: `plan_for`, `engine_config`, các hằng `MIC_*`, `start_with`, `capture_events`.
  - `src-tauri/src/state.rs`: `MicIssue::Suspected`.
- **Ngoài phạm vi:**
  - Pháp lý 1.8/1.5, website, sửa spec chính, `THIRD_PARTY_NOTICES`, A7, phát hành: kế hoạch 04.
  - Windows: Task 16 của kế hoạch 02 (thử cả chế độ `both` ở đó).

## Quyết định của kế hoạch

- **QĐ1, hỏi quyền micro ở `start_with` cho cả hai chế độ có micro.**
  - Quyền chưa hỏi thì `start_with` gọi `SessionDeps::request_mic_permission` (đang ở luồng nền) trước khi nạp model.
  - Lý do: ở chế độ `both`, hỏi trên luồng thu sẽ chặn luôn âm thanh máy suốt lúc hộp thoại mở.
  - Luồng thu của chế độ `both` không bao giờ hỏi: quyền chưa có thì báo `micIssue = "permission"`. Chế độ `mic` giữ cách hỏi
    trên luồng thu làm dự phòng.
- **QĐ2, chế độ `both` từ chối quyền thì vẫn bắt đầu phiên** với âm thanh máy và `micIssue = "permission"` (spec §7). Chỉ chế độ
  `mic` từ chối bắt đầu.
- **QĐ3, một bộ tiền xử lý `Pre::Both`** giữ `Preprocessor`, `Option<MicPreprocessor>` và `DuckingMixer`.
  - Chưa có micro thì âm thanh máy đi thẳng ra cả hai bản.
  - Micro được gắn hay gỡ giữa phiên. Gỡ thì xả hết phần còn trong mixer trước (`flush_into`).
- **QĐ4, `Pre::drain` ghi vào `Frames`:** bản cho whisper, bản cho VAD, và mẫu chưa trộn của từng loại nguồn. Bộ canh "toàn
  số 0" đọc mẫu chưa trộn: âm thanh máy cho `PermissionSuspected` (macOS), micro cho `MicSilent`.
- **QĐ5, micro của chế độ `both` do `MicSide` quản lý** trong vòng canh của `capture_loop`.
  - Mở, mở lại khi micro mặc định đổi hay luồng thu chết, thử lại mỗi 2 giây khi lỗi.
  - Báo `CaptureEvent::MicIssue(Some(code))` mỗi khi mã lỗi đổi, và `MicIssue(None)` khi mở lại được.
  - Lỗi âm thanh máy vẫn theo `FailurePolicy` như hiện nay. Âm thanh máy mở lại thì micro cũng mở lại.
- **QĐ6, VAD của chế độ `both`:** 0,5 / 600 / 500, cả khi tắt lọc ồn (spec mục 16 chỉ đo 600 cho chế độ trộn).
- **QĐ7, `micIssue` có thêm `"permission"` và `"unavailable"`.**
  - Một trường duy nhất. Sự kiện xóa chỉ xóa đúng loại của nó: `MicSilent(false)` chỉ xóa `suspected`; `MicIssue(None)` chỉ
    xóa `permission` và `unavailable`.
- **QĐ8, đo lại A-trộn trước khi chốt mã** (Task 1). Số chốt cũ (6,1% / 3,7%) đo với `tanh` cho cả hai bản, không RNNoise.
  Cảnh 1, 2 chưa có `mic-rnnoise.wav`: Task 1 tạo file đó.

## Cấu trúc file

| File | Việc |
|---|---|
| `bench/2026-10-24-nguon-micro/variants/both-chot-moi.json` (mới), `results/tron-moi.md` (mới) | Đo lại A-trộn |
| `src-tauri/src/settings/mod.rs`, `migrate.rs` | `CaptureMode::Both` |
| `src-tauri/src/state.rs` | `MicIssue::Permission`, `MicIssue::Unavailable` |
| `src-tauri/src/capture.rs` | `CapturePlan::Both`, `Frames`, `Pre::Both`, `MicSide`, `CaptureEvent::MicIssue`, hai `ZeroWatch` |
| `src-tauri/src/session.rs`, `test_support.rs`, `app_tests.rs` | `plan_for`, `engine_config`, hỏi quyền ở `start_with`, `capture_events` |
| `src/lib/ipc.ts`, `src/lib/audioSource.ts`, `src/lib/subtitleView.ts` | Kiểu, nhãn, ghi chú |
| `src/windows/main/settings/AudioSettings.tsx`, `src/windows/main/screens/Home.tsx` | Giao diện |
| `src/i18n/{en,vi,ja,zh,ko}.ts` | Chuỗi mới |
| `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs` | Cảnh xem trước |

---

### Task 0: Mốc ban đầu

- [ ] **Step 1:** Chạy test và kiểm.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test --workspace --locked 2>&1 | grep -E "^test result|FAILED|panicked" | awk '/test result/{split($0,a," ");p+=a[4];f+=a[6]} /FAILED|panicked/{print} END{print "passed",p,"failed",f}' && pnpm test 2>&1 | grep -E "Tests" && sh scripts/check-windows.sh --locked 2>&1 | tail -1
```

Expected: `failed 0`, Vitest xanh, clippy Windows `Finished`. Ghi lại số test.

---

### Task 1: Đo lại A-trộn với chuỗi micro mới

**Files:**
- Create: `bench/2026-10-24-nguon-micro/variants/both-chot-moi.json`
- Create: `bench/2026-10-24-nguon-micro/results/tron-moi.md`
- Modify: `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` (mục 16, dòng A-trộn)

- [ ] **Step 1: Tạo bản VAD đã lọc ồn cho cảnh 1, 2**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && D=bench/2026-10-24-nguon-micro/data/scenes && cargo build --release --locked -p latency-bench 2>&1 | tail -1 && for s in s1-loa s2-loa; do ./target/release/latency-bench denoise --input $D/$s/mic-raw.wav --reference $D/$s/mic.wav --out $D/$s/mic-rnnoise.wav | tail -1; done
```

Expected: mỗi cảnh in "lệch so với … mẫu, đã bù".

- [ ] **Step 2: Phương án**

Tạo `bench/2026-10-24-nguon-micro/variants/both-chot-moi.json`:

```json
[
 {"name": "CU-g20-m600", "mode": "both", "gain_db": 20,
  "gate": {"threshold_dbfs": -55, "duck_db": -30, "hold_ms": 300},
  "vad": {"threshold": 0.5, "min_speech_ms": 600, "end_silence_ms": 500}},
 {"name": "MOI-khong-loc-m600", "mode": "both", "limiter": true, "vad_tanh": true,
  "gate": {"threshold_dbfs": -55, "duck_db": -30, "hold_ms": 300},
  "vad": {"threshold": 0.5, "min_speech_ms": 600, "end_silence_ms": 500}},
 {"name": "MOI-rnn-m600", "mode": "both", "limiter": true, "vad_tanh": true, "mic_vad": "mic-rnnoise.wav",
  "gate": {"threshold_dbfs": -55, "duck_db": -30, "hold_ms": 300},
  "vad": {"threshold": 0.5, "min_speech_ms": 600, "end_silence_ms": 500}},
 {"name": "MOI-rnn-m400", "mode": "both", "limiter": true, "vad_tanh": true, "mic_vad": "mic-rnnoise.wav",
  "gate": {"threshold_dbfs": -55, "duck_db": -30, "hold_ms": 300},
  "vad": {"threshold": 0.5, "min_speech_ms": 400, "end_silence_ms": 500}}
]
```

`CU-g20-m600` là phương án chốt cũ (cho lại 6,1% / 3,7%); dùng để kiểm cách chấm không đổi.

- [ ] **Step 3: Chạy `mix-eval` (gói Chuẩn) trên cảnh 1, 2**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && W=$PWD M=/Users/dtphong/Desktop/software_business/ai-translator B=bench/2026-10-24-nguon-micro && for s in s1-loa s2-loa; do ./target/release/latency-bench mix-eval --scene $B/data/scenes/$s --variants $B/variants/both-chot-moi.json --asr-worker $W/target/release/asr-worker --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --vad-model $M/models/silero_vad_v6.2.3.onnx --out $B/data/results/$s/tron-moi > $B/data/results/$s-tron-moi.log 2>&1; echo "$s xong"; done
```

Chạy nền (`run_in_background`); mất vài phút.

- [ ] **Step 4: Chấm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && B=bench/2026-10-24-nguon-micro && for s in s1-loa s2-loa; do echo "== $s"; uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" python $B/score_mix.py --scene $B/data/scenes/$s --results $B/data/results/$s/tron-moi 2>&1 | grep -v "+su" | grep -E "^\| [A-Z]"; done
```

Expected: `CU-g20-m600` ở cảnh 1 cho lỗi online 6,1% và lỗi trong phòng 3,7%. Lệch thì dừng: cách chấm hay bản thu đã đổi.

- [ ] **Step 5: Quyết `min_speech_ms` cho chế độ `both`**

- `MOI-rnn-m600` (đúng như app sau Task 3–4) không xấu hơn `CU-g20-m600` quá 10% ở cả lỗi online lẫn lỗi trong phòng của
  cảnh 1: giữ QĐ6 (600).
- `MOI-rnn-m400` tốt hơn rõ ở lỗi trong phòng mà lỗi online không xấu hơn quá 10%: đổi QĐ6 sang 400 và ghi vào spec.
- Cả hai đều xấu hơn quá 10%: **dừng, báo chủ dự án** kèm bảng số, không làm tiếp Task 2.

- [ ] **Step 6: Ghi kết quả và sửa spec**

Viết `bench/2026-10-24-nguon-micro/results/tron-moi.md` theo mẫu của `gioi-han-muc.md`. Gồm điều kiện đo, bảng bốn phương án
× hai cảnh, và quyết định ở Step 5.

Trong spec mục 16, thay dòng A-trộn bằng số mới:

```markdown
  - **A-trộn:** cảnh 1 (nói lần lượt), lỗi online ≤ <số mới> × 1,10, lỗi trong phòng ≤ <số mới> × 1,10 (đo lại với bộ giới
    hạn mức và RNNoise cho bản VAD, `results/tron-moi.md`; cách cũ 6,1% / 3,7%).
```

(thay `<số mới>` bằng số của phương án đã chọn ở Step 5).

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git add bench/2026-10-24-nguon-micro/variants/both-chot-moi.json bench/2026-10-24-nguon-micro/results/tron-moi.md docs/superpowers/specs/2026-10-24-nguon-micro-design.md && git commit -m "$(cat <<'EOF'
docs(bench): đo lại A-trộn với bộ giới hạn mức và RNNoise cho bản VAD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Settings `captureMode: "both"`, `MicIssue` hai loại mới

**Files:**
- Modify: `src-tauri/src/settings/mod.rs` (enum `CaptureMode`, test `serializes_with_camel_case_keys_of_spec`)
- Modify: `src-tauri/src/settings/migrate.rs` (test `an_old_file_without_mic_keys_keeps_the_playback_mode`)
- Modify: `src-tauri/src/state.rs` (enum `MicIssue`)

- [ ] **Step 1: Test**

Trong `settings/mod.rs`, test `serializes_with_camel_case_keys_of_spec` thêm:

```rust
        assert_eq!(serde_json::to_value(CaptureMode::Both).unwrap(), json!("both"));
```

Trong `migrate.rs`, đoạn cuối của `an_old_file_without_mic_keys_keeps_the_playback_mode` đổi `"both"` thành giá trị lạ, và thêm
trường hợp `"both"` đọc được:

```rust
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "captureMode": "both" }));
        assert_eq!(load(raw, defaults()).settings.capture_mode, CaptureMode::Both);
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "captureMode": "stereo" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.capture_mode, CaptureMode::Playback);
        assert_eq!(loaded.rejected, ["captureMode"]);
```

Trong `state.rs`, thêm vào `mod tests` (hoặc tạo `mod tests` nếu chưa có, với `use super::*;`):

```rust
    #[test]
    fn mic_issues_serialize_as_the_ui_expects() {
        for (issue, name) in [
            (MicIssue::Suspected, "suspected"),
            (MicIssue::Permission, "permission"),
            (MicIssue::Unavailable, "unavailable"),
        ] {
            assert_eq!(serde_json::to_value(issue).unwrap(), serde_json::json!(name));
        }
    }
```

- [ ] **Step 2: Chạy để thấy lỗi**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib 2>&1 | grep -E "^error" | head -3
```

Expected: `no variant named Both`, `no variant named Permission`.

- [ ] **Step 3: Cài đặt**

`settings/mod.rs`:

```rust
/// Thu gì (spec 2026-10-24-nguon-micro §3.1).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMode {
    /// Âm thanh máy theo `audioSource` (như trước khi có micro).
    Playback,
    /// Chỉ micro (`micDevice`).
    Mic,
    /// Âm thanh máy và micro, trộn có nhường lời (họp lai, spec §5.3, §5.4).
    Both,
}
```

`state.rs`, enum `MicIssue`:

```rust
/// Vấn đề của micro (`AppStatus::mic_issue`, spec 2026-10-24-nguon-micro §7).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MicIssue {
    /// Micro trả toàn số 0 từ đầu phiên: thiếu quyền micro hoặc micro đang tắt tiếng bằng phím cứng.
    Suspected,
    /// Chế độ âm thanh máy + micro: chưa được phép dùng micro; phiên chạy với âm thanh máy.
    Permission,
    /// Chế độ âm thanh máy + micro: không mở được micro (không có, bị rút, bị giữ độc quyền); phiên chạy với âm thanh máy và
    /// thử lại mỗi 2 giây.
    Unavailable,
}
```

Sửa chú thích của trường `mic_issue` trong `AppStatus`: bỏ câu "Kế hoạch 03 của spec đó thêm …".

- [ ] **Step 4: Chạy tới khi biên dịch được**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo build -p meeting-translator --tests 2>&1 | grep -E "^error" -A6 | head -30
```

Các `match` trên `CaptureMode` (ở `session.rs::plan_for`) báo thiếu nhánh `Both`: tạm thêm
`CaptureMode::Both => todo!("Task 4")`. Task 4 thay bằng mã thật. Đây là chỗ duy nhất được để `todo!`; Task 4 phải xóa nó.

- [ ] **Step 5: Chạy test, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib settings 2>&1 | grep "test result" && cargo test -p meeting-translator --lib mic_issues 2>&1 | grep "test result" && git add src-tauri/src && git commit -m "$(cat <<'EOF'
feat(settings): captureMode both, micIssue permission và unavailable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `capture.rs`: `Frames`, `Pre::Both`, `MicSide`, `CapturePlan::Both`

**Files:**
- Modify: `src-tauri/src/capture.rs`

- [ ] **Step 1: Viết test cho phần thuần**

Thêm vào `mod tests` của `capture.rs`:

```rust
    fn both() -> CapturePlan {
        CapturePlan::Both {
            source: AudioSource::System,
            device: None,
            noise_filter: true,
        }
    }

    /// Spec 2026-10-24-nguon-micro §5.6: chế độ trộn có micro; lỗi mở âm thanh máy vẫn theo mã của âm thanh máy.
    #[test]
    fn the_both_plan_uses_the_mic_and_playback_error_codes() {
        assert!(both().has_mic());
        let other = anyhow::anyhow!("AudioDeviceStart lỗi OSStatus 1");
        assert_eq!(error_code(&both(), &other), errors::CAPTURE_FAILED);
    }

    /// Chưa có micro: âm thanh máy đi thẳng ra cả hai bản; mẫu chưa trộn của âm thanh máy được giữ cho bộ canh.
    #[test]
    fn without_a_mic_the_both_preprocessor_passes_playback_through() {
        let (mut producer, consumer) = rtrb::RingBuffer::new(16_000);
        let playback = Preprocessor::new(vec![(consumer, AudioFormat { sample_rate: 16_000, channels: 1 })]).unwrap();
        let mut pre = Pre::Both(Box::new(BothPre::new(playback)));
        for _ in 0..1_600 {
            producer.push(0.25).unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f).unwrap();
        assert_eq!((f.asr.len(), f.vad.len(), f.playback.len(), f.mic.len()), (1_600, 1_600, 1_600, 0));
        assert!(f.asr.iter().chain(&f.vad).all(|&v| v == 0.25));
    }

    /// Có micro: tiếng online đang phát thì micro bị hạ (−30 dB); mẫu chưa trộn của micro vẫn nguyên để canh "toàn số 0".
    #[test]
    fn with_a_mic_the_both_preprocessor_ducks_the_mic_under_playback() {
        let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
        let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let format = AudioFormat { sample_rate: 16_000, channels: 1 };
        let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
        both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
        let mut pre = Pre::Both(Box::new(both));
        // Micro: sin 300 Hz biên độ 0,001 (lọc 80 Hz giữ nguyên; tín hiệu DC sẽ bị lọc mất và test không còn ý nghĩa).
        for i in 0..8_000 {
            pb_in.push(if i % 2 == 0 { 0.1 } else { -0.1 }).unwrap();
            mic_in.push(0.001 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin()).unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f).unwrap();
        assert_eq!(f.asr.len(), f.vad.len());
        assert!(!f.asr.is_empty() && !f.mic.is_empty());
        let mic_level = |x: &[f32]| x.iter().map(|v| v.abs()).sum::<f32>() / x.len() as f32;
        // Bỏ 1 600 mẫu đầu (bộ giới hạn và cổng vừa khởi động): phần còn lại, hiệu giữa bản trộn và âm thanh máy chỉ còn micro
        // đã hạ.
        let rest: Vec<f32> = f.asr[1_600..].iter().zip(&f.playback[1_600..]).map(|(a, p)| a - p).collect();
        assert!(mic_level(&rest) < 0.01 * 0.1, "micro phải bị hạ: {}", mic_level(&rest));
        assert!(f.mic.iter().any(|&v| v != 0.0));
    }

    /// Gỡ micro giữa chừng: phần còn trong mixer được xả, sau đó âm thanh máy lại đi thẳng.
    #[test]
    fn detaching_the_mic_flushes_the_mixer() {
        let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
        let (_mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let format = AudioFormat { sample_rate: 16_000, channels: 1 };
        let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
        both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
        let mut pre = Pre::Both(Box::new(both));
        for _ in 0..800 {
            pb_in.push(0.2).unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f).unwrap();
        let Pre::Both(b) = &mut pre else { unreachable!() };
        b.detach_mic(&mut f);
        assert_eq!(f.asr.len(), 800, "phần chờ micro được xả ra");
        for _ in 0..160 {
            pb_in.push(0.2).unwrap();
        }
        pre.drain(&mut f).unwrap();
        assert_eq!(f.asr.len(), 960);
    }

    /// `MicSide` báo mỗi lần mã lỗi đổi, và báo hết lỗi khi mở lại được (QĐ5).
    #[test]
    fn mic_issues_are_reported_once_per_change() {
        let mut r = MicReport::default();
        assert_eq!(r.failed(errors::MIC_PERMISSION), Some(Some(errors::MIC_PERMISSION)));
        assert_eq!(r.failed(errors::MIC_PERMISSION), None);
        assert_eq!(r.failed(errors::MIC_UNAVAILABLE), Some(Some(errors::MIC_UNAVAILABLE)));
        assert_eq!(r.ok(), Some(None));
        assert_eq!(r.ok(), None);
    }
```

(thêm `use audio_capture::AudioFormat;` vào module test nếu cần).

- [ ] **Step 2: Chạy để thấy lỗi biên dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib capture 2>&1 | grep -E "^error" | head -5
```

- [ ] **Step 3: Kiểu mới**

1. `use audio_capture::duck::{DuckingMixer, GateParams};` và `use audio_capture::preprocess::MAX_SKEW_SAMPLES;` (thêm vào dòng
   `use audio_capture::preprocess::{…}` hiện có).

2. `CapturePlan` thêm biến thể và `has_mic`:

```rust
    /// Âm thanh máy và micro, trộn có nhường lời (spec §5.3, §5.4).
    Both { source: AudioSource, device: Option<String>, noise_filter: bool },
```

```rust
    pub fn has_mic(&self) -> bool {
        matches!(self, CapturePlan::Mic { .. } | CapturePlan::Both { .. })
    }
```

3. `CaptureEvent` thêm:

```rust
    /// Chế độ âm thanh máy + micro: micro không mở được, kèm mã (`micPermission`, `micUnavailable`); `None` khi đã mở lại
    /// được. Phiên không dừng (spec §7).
    MicIssue(Option<&'static str>),
```

4. Hằng của cổng, cạnh `MIC_PROMPT_WAIT`:

```rust
/// Nhường lời (spec mục 16): khung âm thanh máy từ −55 dBFS là có tiếng; khi đó micro hạ −30 dB, giữ thêm 300 ms.
const GATE: GateParams = GateParams {
    threshold_dbfs: -55.0,
    duck_db: -30.0,
    hold_ms: 300,
};
```

5. `Frames` và `Pre` mới (thay `enum Pre` và `impl Pre` hiện có):

```rust
/// Mẫu của một lần đọc: bản cho whisper, bản cho VAD (cùng độ dài), và mẫu chưa trộn của từng loại nguồn cho các bộ canh
/// "toàn số 0" (QĐ4 của kế hoạch 03).
#[derive(Default)]
struct Frames {
    asr: Vec<f32>,
    vad: Vec<f32>,
    playback: Vec<f32>,
    mic: Vec<f32>,
}

impl Frames {
    fn clear(&mut self) {
        self.asr.clear();
        self.vad.clear();
        self.playback.clear();
        self.mic.clear();
    }
}

/// Bộ tiền xử lý của nguồn đang mở.
enum Pre {
    Playback(Preprocessor),
    /// Đóng hộp: chuỗi micro có bộ đệm khung của RNNoise, lớn hơn hẳn `Preprocessor`.
    Mic(Box<MicPreprocessor>),
    Both(Box<BothPre>),
}

impl Pre {
    fn drain(&mut self, f: &mut Frames) -> anyhow::Result<()> {
        match self {
            Pre::Playback(p) => {
                let from = f.asr.len();
                p.drain(&mut f.asr)?;
                f.vad.extend_from_slice(&f.asr[from..]);
                f.playback.extend_from_slice(&f.asr[from..]);
                Ok(())
            }
            Pre::Mic(m) => {
                let from = f.asr.len();
                m.drain(&mut f.asr, &mut f.vad)?;
                f.mic.extend_from_slice(&f.asr[from..]);
                Ok(())
            }
            Pre::Both(b) => b.drain(f),
        }
    }
}

/// Chế độ âm thanh máy + micro (QĐ3): âm thanh máy, micro nếu đang mở, và bộ trộn có nhường lời.
struct BothPre {
    playback: Preprocessor,
    mic: Option<MicPreprocessor>,
    mixer: DuckingMixer,
    pb: Vec<f32>,
    mic_asr: Vec<f32>,
    mic_vad: Vec<f32>,
}

impl BothPre {
    fn new(playback: Preprocessor) -> Self {
        Self {
            playback,
            mic: None,
            mixer: DuckingMixer::new(GATE, MAX_SKEW_SAMPLES),
            pb: Vec::new(),
            mic_asr: Vec::new(),
            mic_vad: Vec::new(),
        }
    }

    fn attach_mic(&mut self, mic: MicPreprocessor) {
        self.mixer = DuckingMixer::new(GATE, MAX_SKEW_SAMPLES);
        self.mic = Some(mic);
    }

    /// Gỡ micro: xả phần còn trong bộ trộn vào `f`, rồi âm thanh máy đi thẳng.
    fn detach_mic(&mut self, f: &mut Frames) {
        self.mic = None;
        self.mixer.flush_into(&mut f.asr, &mut f.vad);
    }

    /// Tỉ lệ thời gian micro bị hạ, để ghi log (spec §5.6).
    fn ducked_ratio(&self) -> f32 {
        self.mixer.ducked_ratio()
    }

    fn drain(&mut self, f: &mut Frames) -> anyhow::Result<()> {
        self.pb.clear();
        self.playback.drain(&mut self.pb)?;
        f.playback.extend_from_slice(&self.pb);
        let Some(mic) = self.mic.as_mut() else {
            f.asr.extend_from_slice(&self.pb);
            f.vad.extend_from_slice(&self.pb);
            return Ok(());
        };
        self.mic_asr.clear();
        self.mic_vad.clear();
        mic.drain(&mut self.mic_asr, &mut self.mic_vad)?;
        f.mic.extend_from_slice(&self.mic_asr);
        self.mixer.push_playback(&self.pb);
        self.mixer.push_mic(&self.mic_asr, &self.mic_vad);
        self.mixer.drain_into(&mut f.asr, &mut f.vad);
        Ok(())
    }
}
```

6. `MicReport` (hàm thuần cho QĐ5), đặt sau `BothPre`:

```rust
/// Khi nào báo vấn đề của micro ở chế độ trộn: mỗi lần mã lỗi đổi, và một lần khi mở lại được.
#[derive(Debug, Default)]
struct MicReport {
    current: Option<&'static str>,
}

impl MicReport {
    /// Mở micro lỗi với `code`: trả sự kiện cần báo, nếu có.
    fn failed(&mut self, code: &'static str) -> Option<Option<&'static str>> {
        (self.current.replace(code) != Some(code)).then_some(Some(code))
    }

    /// Micro mở được: trả sự kiện xóa nếu trước đó đang báo lỗi.
    fn ok(&mut self) -> Option<Option<&'static str>> {
        self.current.take().map(|_| None)
    }
}
```

- [ ] **Step 4: Mở micro không hỏi quyền; `MicSide`**

1. Đổi `ensure_mic_permission` nhận cờ `ask`:

```rust
/// Đã có quyền micro chưa. `ask`: chưa hỏi thì hỏi (hộp thoại macOS; chỉ chế độ `mic`, vì ở chế độ trộn luồng thu còn phải
/// đọc âm thanh máy). Không hỏi thì quyền chưa hỏi coi như chưa có.
fn ensure_mic_permission(ask: bool) -> anyhow::Result<()> {
    let permission = match audio_capture::mic_permission() {
        MicPermission::Undetermined if ask => audio_capture::request_mic_permission(MIC_PROMPT_WAIT)?,
        other => other,
    };
    if permission == MicPermission::Granted {
        Ok(())
    } else {
        anyhow::bail!("{MIC_DENIED}")
    }
}
```

2. Tách phần mở micro khỏi `start_mic`:

```rust
/// Micro đang chạy: nguồn, số liệu, và bộ tiền xử lý của nó.
struct OpenMic {
    source: Box<dyn Source>,
    stats: Arc<CaptureStats>,
    pre: MicPreprocessor,
}

/// Mở micro và chạy nó; lỗi thì dừng nguồn. `ask`: xem [`ensure_mic_permission`].
fn open_mic(device: Option<&str>, noise_filter: bool, ask: bool) -> anyhow::Result<OpenMic> {
    ensure_mic_permission(ask)?;
    let stats = Arc::new(CaptureStats::default());
    let mut source = audio_capture::mic_source(device.map(str::to_string), stats.clone())?;
    let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
    source.start(producer)?;
    let format = source.format();
    match MicPreprocessor::new(consumer, format, noise_filter) {
        Ok(pre) => {
            log::info!(
                "đang thu micro: {} Hz, {} kênh, kết nối {}, lọc ồn {noise_filter}",
                format.sample_rate,
                format.channels,
                mic_transport(device)
            );
            Ok(OpenMic { source, stats, pre })
        }
        Err(e) => {
            source.stop();
            Err(e)
        }
    }
}

fn start_mic(device: Option<&str>, noise_filter: bool) -> anyhow::Result<(Opened, Pre)> {
    let mic = open_mic(device, noise_filter, true)?;
    Ok((
        Opened {
            sources: vec![mic.source],
            stats: vec![mic.stats],
            tapped: None,
        },
        Pre::Mic(Box::new(mic.pre)),
    ))
}
```

3. `MicSide`:

```rust
/// Micro của chế độ trộn (QĐ5): mở, mở lại khi micro mặc định đổi hay luồng thu chết, thử lại mỗi 2 giây khi lỗi; lỗi không
/// dừng phiên mà báo `CaptureEvent::MicIssue`.
struct MicSide {
    device: Option<String>,
    noise_filter: bool,
    source: Option<(Box<dyn Source>, Arc<CaptureStats>)>,
    signature: Option<String>,
    retry_at: Instant,
    report: MicReport,
}

impl MicSide {
    fn new(device: Option<String>, noise_filter: bool) -> Self {
        Self {
            device,
            noise_filter,
            source: None,
            signature: None,
            retry_at: Instant::now(),
            report: MicReport::default(),
        }
    }

    /// Một lần canh: mở micro khi tới giờ thử, gỡ micro khi nó chết hay micro mặc định đổi.
    fn tick(&mut self, now: Instant, shared: &Mutex<Option<Pre>>, on_event: &OnEvent) {
        let follows_default = self.device.is_none();
        let dead = self.source.as_ref().is_some_and(|(s, _)| s.failed())
            || (self.source.is_some() && follows_default && audio_capture::default_input_signature() != self.signature);
        if dead {
            log::info!("mở lại micro");
            self.close(shared);
            self.retry_at = now;
        }
        if self.source.is_some() || now < self.retry_at {
            return;
        }
        self.signature = audio_capture::default_input_signature();
        match open_mic(self.device.as_deref(), self.noise_filter, false) {
            Ok(mic) => {
                if let Some(Pre::Both(b)) = shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                    b.attach_mic(mic.pre);
                }
                self.source = Some((mic.source, mic.stats));
                if let Some(event) = self.report.ok() {
                    on_event(CaptureEvent::MicIssue(event));
                }
            }
            Err(e) => {
                log::warn!("không mở được micro (chế độ trộn, phiên chạy tiếp với âm thanh máy): {e:#}");
                self.retry_at = now + RETRY_AFTER;
                // Lỗi của micro: dùng luật mã lỗi của chế độ micro (`micPermission` hay `micUnavailable`).
                let as_mic = CapturePlan::Mic {
                    device: self.device.clone(),
                    noise_filter: self.noise_filter,
                };
                if let Some(event) = self.report.failed(error_code(&as_mic, &e)) {
                    on_event(CaptureEvent::MicIssue(event));
                }
            }
        }
    }

    /// Số khung micro đã nhận, để ghi log.
    fn frames(&self) -> u64 {
        self.source.as_ref().map_or(0, |(_, s)| s.frames.load(Ordering::Relaxed))
    }

    /// Dừng micro và gỡ nó khỏi bộ trộn (phần còn trong bộ trộn bị bỏ: nguồn đang đóng hay mở lại).
    fn close(&mut self, shared: &Mutex<Option<Pre>>) {
        if let Some(Pre::Both(b)) = shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            b.detach_mic(&mut Frames::default());
        }
        if let Some((mut s, _)) = self.source.take() {
            s.stop();
        }
    }
}
```

Trong `error_code`, lỗi của âm thanh máy ở chế độ trộn theo luật của `Playback`: thêm `CapturePlan::Both { source, .. }` vào
nhánh đó.

```rust
        CapturePlan::Playback { source, .. } | CapturePlan::Both { source, .. } => {
```

4. `start_plan`:

```rust
fn start_plan(plan: &CapturePlan) -> anyhow::Result<(Opened, Pre)> {
    match plan {
        CapturePlan::Playback { source, include_self } => start_sources(source, *include_self),
        CapturePlan::Mic { device, noise_filter } => start_mic(device.as_deref(), *noise_filter),
        CapturePlan::Both { source, .. } => {
            let (opened, pre) = start_sources(source, false)?;
            let Pre::Playback(playback) = pre else {
                unreachable!("start_sources chỉ dựng Pre::Playback")
            };
            Ok((opened, Pre::Both(Box::new(BothPre::new(playback)))))
        }
    }
}
```

5. Các hàm theo plan:
   - `device_signature`: chỉ `CapturePlan::Mic { .. }` theo micro mặc định; `Playback` và `Both` theo thiết bị phát:
     `if matches!(plan, CapturePlan::Mic { .. }) { default_input_signature() } else { default_output_signature() }`.
   - `someone_playing_for`: thêm `CapturePlan::Both { source, .. } => someone_playing(source)`.
   - `capture_loop`, `follows_default`: thêm `CapturePlan::Both { source, .. } => !matches!(source, AudioSource::Device { .. })`.
   - `capture_loop`, `check_stall`: `cfg!(target_os = "macos") && !matches!(plan, CapturePlan::Mic { .. })`.
   - `capture_loop`, log "đang thu âm thanh": điều kiện `!matches!(plan, CapturePlan::Mic { .. })`.
   - `capture_loop`, nhánh nguồn một app (`if let (Some(tapped), CapturePlan::Playback { source: AudioSource::App { bundle_id }
     , .. })`): thêm dòng tương tự cho `CapturePlan::Both`, hoặc lấy `source` qua hàm phụ:

```rust
/// Nguồn âm thanh máy của plan, nếu có.
fn playback_source(plan: &CapturePlan) -> Option<&AudioSource> {
    match plan {
        CapturePlan::Playback { source, .. } | CapturePlan::Both { source, .. } => Some(source),
        CapturePlan::Mic { .. } => None,
    }
}
```

     và viết `if let (Some(tapped), Some(AudioSource::App { bundle_id })) = (&opened.tapped, playback_source(&plan))`.

6. `capture_loop`: tạo `MicSide` cho chế độ trộn và gọi nó trong vòng canh.
   - Trước `while !stop…` ngoài cùng:

```rust
    let mut mic_side = match &plan {
        CapturePlan::Both { device, noise_filter, .. } => Some(MicSide::new(device.clone(), *noise_filter)),
        _ => None,
    };
```

   - Ngay sau khi gắn `preprocessor` vào `shared` (nhánh `Ok` của `start_plan`), mở micro lần đầu:

```rust
                if let Some(mic) = mic_side.as_mut() {
                    mic.retry_at = Instant::now();
                    mic.tick(Instant::now(), &shared, &on_event);
                }
```

   - Trong vòng `while !wait_or_stop(&stop, WATCH_EVERY)`, đầu vòng: `if let Some(mic) = mic_side.as_mut() { mic.tick(now,
     &shared, &on_event); }`.
   - Dòng log số liệu mỗi 60 giây: thêm micro và tỉ lệ hạ:

```rust
                let ducked = match shared.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
                    Some(Pre::Both(b)) => Some(b.ducked_ratio()),
                    _ => None,
                };
                log::info!(
                    "số liệu thu (frames, silence_inserted, skipped, dropped, rejected_cycles): {all:?}; khung micro {}; \
                     micro bị hạ {ducked:?}",
                    mic_side.as_ref().map_or(0, MicSide::frames)
                );
```

   - Trước khi dừng nguồn âm thanh máy (cuối vòng ngoài): `if let Some(mic) = mic_side.as_mut() { mic.close(&shared); }` đặt
     **trước** dòng `*shared.lock()… = None;`.
   - Đổi chữ ký: `capture_loop(…, on_event: Arc<OnEvent>)` giữ nguyên; truyền `&on_event` (kiểu `&Arc<OnEvent>`, tự deref thành
     `&OnEvent` khi gọi `MicSide::tick` nếu khai `on_event: &OnEvent`).

- [ ] **Step 5: `LiveCapture` đọc `Frames`, hai bộ canh "toàn số 0"**

Thay các trường `buf`, `vad_buf`, `zeros` của `LiveCapture` bằng:

```rust
    frames: Frames,
    /// "Toàn số 0" trên mẫu chưa trộn của âm thanh máy (macOS: nghi thiếu quyền ghi âm thanh hệ thống) và của micro.
    zeros_playback: ZeroWatch,
    zeros_mic: ZeroWatch,
```

(khởi tạo `Frames::default()`, `ZeroWatch::default()` hai lần). Thân `read_with_vad`:

```rust
    fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        self.frames.clear();
        let (shared, frames) = (&self.shared, &mut self.frames);
        let mut asr = std::mem::take(&mut frames.asr);
        drain_when_ready(&mut asr, timeout, POLL_STEP, |buf| {
            std::mem::swap(&mut frames.asr, buf);
            let result = match shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                Some(p) => p.drain(frames),
                None => Ok(()),
            };
            std::mem::swap(&mut frames.asr, buf);
            result
        })?;
        self.frames.asr = asr;
        let now = Instant::now();
        if self.plan.has_mic()
            && let Some(silent) = self.zeros_mic.push(&self.frames.mic, now, || true)
        {
            (self.on_event)(CaptureEvent::MicSilent(silent));
        }
        if cfg!(target_os = "macos")
            && let Some(source) = playback_source(&self.plan)
            && let Some(suspected) = self.zeros_playback.push(&self.frames.playback, now, || someone_playing(source))
        {
            (self.on_event)(CaptureEvent::PermissionSuspected(suspected));
        }
        let silence = self.filler.silence_before(self.started.elapsed(), self.frames.asr.len());
        out.extend(std::iter::repeat_n(0.0, silence));
        out.extend_from_slice(&self.frames.asr);
        vad_out.extend(std::iter::repeat_n(0.0, silence));
        vad_out.extend_from_slice(&self.frames.vad);
        Ok(!self.stop.load(Ordering::SeqCst))
    }
```

`drain_when_ready` chờ tới khi `buf` (ở đây là `frames.asr` mượn tạm) có mẫu. Hai lần `swap` cho closure ghi thẳng vào
`frames` mà `drain_when_ready` vẫn thấy độ dài của bản cho whisper.

Chế độ trộn mà micro chưa mở được: `ZeroWatch` của micro nhận mảng rỗng và không báo gì (`push` bỏ qua mảng rỗng). Đúng ý: lúc
đó đã có `MicIssue`.

Thêm một dòng vào chú thích đầu file (sau gạch đầu dòng "Chế độ micro"): "Chế độ âm thanh máy + micro (spec §5.3–5.6, kế hoạch
03): âm thanh máy theo luật như trên; micro do `MicSide` quản lý, lỗi không dừng phiên mà báo `CaptureEvent::MicIssue`; trộn
bằng `DuckingMixer` (nhường lời −55 dBFS / −30 dB / 300 ms)."

- [ ] **Step 6: Chạy test, clippy hai nền tảng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib capture 2>&1 | grep -E "^test result|FAILED|panicked|^error" -A3 | head -20 && cargo clippy -p meeting-translator --all-targets --locked -- -D warnings 2>&1 | grep -E "^(warning|error)" -A6 | head -20 && sh scripts/check-windows.sh --locked 2>&1 | tail -1
```

`session.rs::capture_events` báo thiếu nhánh `CaptureEvent::MicIssue`: tạm thêm `CaptureEvent::MicIssue(_) => {}` (Task 4 nối).

Test `with_a_mic_the_both_preprocessor_ducks_the_mic_under_playback` không đạt vì bộ giới hạn của micro (nhân tới ×10) làm mẫu
micro sau trộn lớn hơn mức ước: đo mức thật bằng `println!`. Mức đúng là `0,001 × 10 × 10^(−30/20)` ≈ 0,0003. Sửa ngưỡng của
test theo công thức đó (×2 dư), không bỏ test.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo fmt -p meeting-translator && git add src-tauri/src && git commit -m "$(cat <<'EOF'
feat(capture): chế độ âm thanh máy + micro (DuckingMixer, MicSide, Frames, hai bộ canh toàn số 0)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Phiên dịch chế độ trộn, hỏi quyền ở `start_with`, `micIssue`

**Files:**
- Modify: `src-tauri/src/session.rs` (`plan_for`, `engine_config`, hằng, `start_with`, `capture_events`, test)
- Modify: `src-tauri/src/app_tests.rs`

- [ ] **Step 1: Test**

Trong `session.rs`, `mod tests`, thêm:

```rust
    /// Spec 2026-10-24-nguon-micro mục 16 (lớp 4), QĐ6 của kế hoạch 03: chế độ trộn dùng VAD 0,5 / 600 / 500, cả khi tắt lọc ồn.
    #[test]
    fn the_both_plan_uses_the_mixed_vad_parameters() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.capture_mode = CaptureMode::Both;
        for noise_filter in [true, false] {
            settings.mic_noise_filter = noise_filter;
            let plan = plan_for(&settings, StartOptions::default());
            assert_eq!(
                plan,
                CapturePlan::Both {
                    source: AudioSource::System,
                    device: None,
                    noise_filter
                }
            );
            let cfg = engine_config(&settings, &plan, PipelineConfig::default(), 0, SharedGlossary::default(), true);
            let seg = cfg.pipeline.segmenter;
            assert_eq!((seg.threshold, seg.min_speech_ms, seg.end_silence_ms), (0.5, 600, 500));
        }
        assert_eq!(
            plan_for(&settings, StartOptions::LISTEN_TEST),
            CapturePlan::Playback {
                source: AudioSource::System,
                include_self: true
            },
            "Nghe thử luôn âm thanh máy"
        );
    }
```

Nếu Task 1 đổi QĐ6 sang 400, sửa `600` ở test này thành `400`.

Trong `app_tests.rs`, sau `the_mic_mode_needs_the_mic_permission`:

```rust
/// Spec 2026-10-24-nguon-micro §7, QĐ1, QĐ2 của kế hoạch 03: chế độ trộn mà quyền bị từ chối vẫn bắt đầu phiên; quyền chưa
/// hỏi thì hỏi trước khi nạp model.
#[test]
fn the_both_mode_starts_without_the_mic_permission_and_asks_when_undetermined() {
    use crate::capture::CapturePlan;
    use audio_capture::MicPermission;
    let deps = FakeDeps::default();
    let (plans, permission, requests) = (deps.capture_plans.clone(), deps.mic_permission.clone(), deps.mic_requests.clone());
    *permission.lock().unwrap() = Some(MicPermission::Denied);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    invoke(&main, "update_settings", json!({ "patch": { "captureMode": "both" } })).unwrap();
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    assert_eq!(*requests.lock().unwrap(), 0, "đã từ chối thì không hỏi lại");
    assert!(matches!(plans.lock().unwrap()[0], CapturePlan::Both { .. }));
    invoke(&main, "toggle_session", json!({})).unwrap();
    *permission.lock().unwrap() = Some(MicPermission::Undetermined);
    invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(*requests.lock().unwrap(), 1, "chưa hỏi thì hỏi lúc bắt đầu");
}

/// Micro của chế độ trộn lỗi (QĐ7): `micIssue` theo mã; mở lại được thì xóa; `MicSilent(false)` không xóa lỗi quyền.
#[test]
fn mic_issue_events_set_and_clear_only_their_own_kind() {
    use crate::capture::CaptureEvent;
    use crate::state::MicIssue;
    let deps = FakeDeps::default();
    let events = deps.capture_events.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::start(app.handle()).unwrap();
    let current = events.lock().unwrap().remove(0);
    let issue = || app.state::<AppState>().status().mic_issue;
    current(CaptureEvent::MicIssue(Some(errors::MIC_PERMISSION)));
    assert_eq!(issue(), Some(MicIssue::Permission));
    current(CaptureEvent::MicSilent(false));
    assert_eq!(issue(), Some(MicIssue::Permission));
    current(CaptureEvent::MicIssue(Some(errors::MIC_UNAVAILABLE)));
    assert_eq!(issue(), Some(MicIssue::Unavailable));
    current(CaptureEvent::MicIssue(None));
    assert_eq!(issue(), None);
    current(CaptureEvent::MicSilent(true));
    current(CaptureEvent::MicIssue(None));
    assert_eq!(issue(), Some(MicIssue::Suspected));
}
```

- [ ] **Step 2: Chạy để thấy lỗi**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib both 2>&1 | grep -E "panicked|not yet implemented|test result" | head -5
```

Expected: `not yet implemented: Task 4` (nhánh tạm của Task 2).

- [ ] **Step 3: Cài đặt**

1. Hằng, cạnh `MIC_END_SILENCE_MS`:

```rust
/// Chế độ trộn (spec mục 16): tiếng nói ngắn nhất dài hơn chế độ micro, vì bản trộn đã khuếch đại làm VAD mở đoạn vì tiếng
/// vọng còn sót.
const BOTH_MIN_SPEECH_MS: u64 = 600;
```

2. `plan_for`, thay nhánh tạm:

```rust
        CaptureMode::Both => CapturePlan::Both {
            source: settings.audio_source.clone(),
            device: settings.mic_device.clone(),
            noise_filter: settings.mic_noise_filter,
        },
```

3. `engine_config`, thay khối `if let CapturePlan::Mic { noise_filter, .. } = plan { … }`:

```rust
    let mic_speech_ms = match plan {
        CapturePlan::Playback { .. } => None,
        CapturePlan::Mic { noise_filter: true, .. } => Some(MIC_MIN_SPEECH_MS),
        CapturePlan::Mic { noise_filter: false, .. } => Some(MIC_MIN_SPEECH_MS_UNFILTERED),
        CapturePlan::Both { .. } => Some(BOTH_MIN_SPEECH_MS),
    };
    if let Some(min_speech_ms) = mic_speech_ms {
        pipeline.segmenter.threshold = MIC_VAD_THRESHOLD;
        pipeline.segmenter.min_speech_ms = min_speech_ms;
        pipeline.segmenter.end_silence_ms = MIC_END_SILENCE_MS;
    }
```

4. `start_with`, thay khối kiểm quyền (sau `let plan = plan_for(…)`):

```rust
    // Quyền micro (spec 2026-10-24-nguon-micro §3.4, §7; QĐ1, QĐ2 của kế hoạch 03): chưa hỏi thì hỏi ở đây, trước khi nạp
    // model (ở chế độ trộn, hỏi trên luồng thu sẽ chặn cả âm thanh máy). Chế độ micro mà không có quyền thì không bắt đầu;
    // chế độ trộn chạy với âm thanh máy và báo `micIssue`.
    if plan.has_mic() {
        let mut permission = session.deps.mic_permission();
        if permission == MicPermission::Undetermined {
            permission = session.deps.request_mic_permission();
        }
        if permission == MicPermission::Denied && matches!(plan, CapturePlan::Mic { .. }) {
            return refuse(CommandError::new(
                errors::MIC_PERMISSION,
                None,
                "chưa được phép dùng micro",
            ));
        }
    }
```

5. `capture_events`, thay hai nhánh micro:

```rust
        CaptureEvent::MicSilent(silent) => {
            let current = app.state::<Session>().sessions.load(Ordering::SeqCst) == n;
            if current {
                app.state::<AppState>().update_status(|s| {
                    if silent {
                        s.mic_issue = Some(MicIssue::Suspected);
                    } else if s.mic_issue == Some(MicIssue::Suspected) {
                        s.mic_issue = None;
                    }
                });
                changed(&app);
            }
        }
        CaptureEvent::MicIssue(code) => {
            let current = app.state::<Session>().sessions.load(Ordering::SeqCst) == n;
            if current {
                app.state::<AppState>().update_status(|s| match code {
                    Some(errors::MIC_PERMISSION) => s.mic_issue = Some(MicIssue::Permission),
                    Some(_) => s.mic_issue = Some(MicIssue::Unavailable),
                    None if matches!(s.mic_issue, Some(MicIssue::Permission | MicIssue::Unavailable)) => s.mic_issue = None,
                    None => {}
                });
                changed(&app);
            }
        }
```

6. Log của `start_with`: `"phiên dịch {n}: nguồn {}"` dùng `match &plan { Playback => "âm thanh máy", Mic => "micro", Both =>
   "âm thanh máy + micro" }`.

- [ ] **Step 4: Chạy toàn bộ test app, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo fmt -p meeting-translator && cargo test -p meeting-translator --locked 2>&1 | grep -E "^test result|FAILED|panicked" | head -3 && cargo clippy -p meeting-translator --all-targets --locked -- -D warnings 2>&1 | tail -1 && sh scripts/check-windows.sh --locked 2>&1 | tail -1 && git grep -n 'todo!("Task 4")' src-tauri/src; git add src-tauri/src && git commit -m "$(cat <<'EOF'
feat(session): chế độ trộn (VAD 0,5/600/500), hỏi quyền micro ở start_with, micIssue theo loại

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: test xanh; `git grep todo!("Task 4")` không in gì.

---

### Task 5: Frontend: kiểu, nhãn, ghi chú

**Files:**
- Modify: `src/lib/ipc.ts`, `src/lib/audioSource.ts`, `src/lib/audioSource.test.ts`, `src/lib/subtitleView.ts`,
  `src/lib/subtitleView.test.ts`

- [ ] **Step 1: Test**

`src/lib/audioSource.test.ts`, trong `describe("nhãn micro", …)`:

```ts
  it("chế độ trộn: nguồn âm thanh máy + micro", () => {
    expect(bothLabel({ kind: "system" }, null, devices, "macos", null, t)).toBe(
      "Toàn hệ thống, trừ app này + Micro: MacBook Pro Microphone",
    );
  });
```

(import `bothLabel`). `src/lib/subtitleView.test.ts`, trong test ghi chú lúc đang dịch:

```ts
    expect(overlayNotes(status({ micIssue: "permission" }))).toEqual(["micPermission"]);
    expect(overlayNotes(status({ micIssue: "unavailable" }))).toEqual(["micUnavailable"]);
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec vitest run src/lib 2>&1 | grep -E "Tests|×" | head -5
```

- [ ] **Step 3: Cài đặt**

`ipc.ts`:

```ts
export type CaptureMode = "playback" | "mic" | "both";
export type MicIssue = "suspected" | "permission" | "unavailable";
```

`audioSource.ts`, sau `micLabel`:

```ts
// Nhãn của chế độ trộn (spec 2026-10-24-nguon-micro §3.3): "<nguồn âm thanh máy> + Micro: <tên>".
export function bothLabel(
  source: AudioSource,
  micDevice: string | null,
  devices: readonly InputDevice[] | null,
  platform: AppInfo["platform"],
  options: readonly AudioSourceOption[] | null,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  return t("home.audioSource.both", {
    source: sourceLabel(source, platform, options, t),
    mic: micLabel(micDevice, devices, t),
  });
}
```

`subtitleView.ts`: thêm `| "micPermission" | "micUnavailable"` vào `OverlayNote` (sau `"micSilent"`), và trong `overlayNotes`
thay dòng `micSilent` bằng:

```ts
    if (status.micIssue === "suspected") notes.push("micSilent");
    if (status.micIssue === "permission") notes.push("micPermission");
    if (status.micIssue === "unavailable") notes.push("micUnavailable");
```

- [ ] **Step 4:** Thêm khóa i18n (Task 7) trước khi chạy test, vì `audioSource.test.ts` dùng bản dịch thật. Chạy test và commit
  sau Task 7.

---

### Task 6: Cài đặt › Âm thanh và màn hình chính

**Files:**
- Modify: `src/windows/main/settings/AudioSettings.tsx`, `src/windows/main/screens/Home.tsx`

- [ ] **Step 1: `AudioSettings.tsx`**

1. `const mic = settings?.captureMode === "mic";` thành:

```tsx
  const mode = settings?.captureMode ?? "playback";
  const usesMic = mode !== "playback";
  const usesPlayback = mode !== "mic";
```

   Thay mọi chỗ dùng `mic`:
   - khối bộ chọn âm thanh máy: `{usesPlayback && (…)}`;
   - khối micro: `{usesMic && (…)}`;
   - `useEffect` nạp danh sách micro: phụ thuộc `usesMic`;
   - `pauseMs`, `disabled`, `hint` của thanh trượt: dùng `usesMic`.
2. `chooseMode`: hỏi quyền khi `captureMode !== "playback"` (thay điều kiện `captureMode !== "mic"`).
3. Thêm lựa chọn: `<option value="both">{t("settings.audio.mode.both")}</option>` sau lựa chọn `mic`.
4. Ở chế độ trộn, ghi chú nhường lời ngay dưới bộ chọn micro:

```tsx
          {mode === "both" && (
            <p className="field-note" role="note">
              {t("settings.audio.both.hint")}
            </p>
          )}
```

- [ ] **Step 2: `Home.tsx`**

1. Nhãn nguồn:

```tsx
  const source =
    settings.captureMode === "mic"
      ? micLabel(settings.micDevice, inputDevices, t)
      : settings.captureMode === "both"
        ? bothLabel(settings.audioSource, settings.micDevice, inputDevices, info.platform, audioSources, t)
        : sourceLabel(settings.audioSource, info.platform, audioSources, t);
```

   (import `bothLabel`). `needsMicNames`: `settings?.captureMode !== "playback" && inputDevices === null` (thêm điều kiện
   `settings !== null`). `needsNames`: `settings.captureMode !== "mic"` thay cho `=== "playback"`.
2. Ghi chú micro của chế độ trộn, sau khối `micIssue === "suspected"`:

```tsx
        {session === "running" && status.micIssue === "permission" && (
          <div className="hero-alert" role="alert">
            <Icon name="alert" />
            <span>
              {t("home.micIssue.permission")}
              {info.platform === "macos" && ` ${t("settings.audio.micPermission.reopen")}`}
            </span>
            <button onClick={() => void openMicSettings()}>{t("common.openMicSettings")}</button>
          </div>
        )}
        {session === "running" && status.micIssue === "unavailable" && (
          <div className="hero-alert" role="alert">
            <Icon name="alert" />
            <span>{t("home.micIssue.unavailable")}</span>
          </div>
        )}
```

- [ ] **Step 3:** Chạy `pnpm exec tsc --noEmit` sau Task 7 (cần khóa i18n).

---

### Task 7: Chuỗi năm ngôn ngữ

**Files:** `src/i18n/{en,vi,ja,zh,ko}.ts`

Đặt mỗi khóa cạnh nhóm cùng tiền tố. Ngoặc kép bên trong dùng ngoặc cong như các chuỗi hiện có; tiếng Nhật dùng `「」`.

| Khóa | vi | en | ja | zh | ko |
|---|---|---|---|---|---|
| `settings.audio.mode.both` | Âm thanh máy + Micro | Computer audio + Microphone | コンピューターの音声 + マイク | 电脑音频 + 麦克风 | 컴퓨터 오디오 + 마이크 |
| `settings.audio.both.hint` | Khi người online đang nói, micro được hạ xuống để không dịch hai lần. Người trong phòng nói chen lúc đó có thể bị bỏ sót. Đeo tai nghe cho kết quả tốt nhất. | While someone online is speaking, the microphone is turned down so nothing is translated twice. People in the room who speak at the same moment may be missed. Headphones give the best results. | オンラインの参加者が話している間は、二重に翻訳しないようマイクの音量を下げます。その間に部屋の人が話すと拾われないことがあります。ヘッドホンを使うと最もよい結果になります。 | 线上的人说话时，麦克风会被调低，避免同一句话翻译两次。这时房间里的人插话可能会被漏掉。戴耳机效果最好。 | 온라인 참가자가 말하는 동안에는 두 번 번역되지 않도록 마이크 음량을 낮춥니다. 그때 방 안의 사람이 끼어들어 말하면 누락될 수 있습니다. 헤드폰을 쓰면 가장 좋습니다. |
| `home.audioSource.both` | {source} + {mic} | {source} + {mic} | {source} + {mic} | {source} + {mic} | {source} + {mic} |
| `home.micIssue.permission` | Chưa được phép dùng micro: đang chỉ dịch âm thanh máy. | The microphone isn't allowed: only computer audio is being translated. | マイクが許可されていません。コンピューターの音声だけを翻訳しています。 | 未获准使用麦克风：目前只翻译电脑音频。 | 마이크 권한이 없습니다. 지금은 컴퓨터 오디오만 번역합니다. |
| `home.micIssue.unavailable` | Không mở được micro: đang chỉ dịch âm thanh máy, app sẽ tự thử lại. | Couldn't open the microphone: only computer audio is being translated. The app keeps retrying. | マイクを開けません。コンピューターの音声だけを翻訳しています。アプリが自動で再試行します。 | 无法打开麦克风：目前只翻译电脑音频，应用会自动重试。 | 마이크를 열 수 없습니다. 지금은 컴퓨터 오디오만 번역하며, 앱이 자동으로 다시 시도합니다. |
| `overlay.note.micPermission` | Micro chưa được phép | Microphone not allowed | マイクが許可されていません | 麦克风未获准 | 마이크 권한 없음 |
| `overlay.note.micUnavailable` | Không mở được micro | Microphone unavailable | マイクを開けません | 无法打开麦克风 | 마이크를 열 수 없음 |

`settings.audio.mode.hint` sửa thành (năm ngôn ngữ):

| vi | en | ja | zh | ko |
|---|---|---|---|---|
| Âm thanh máy: họp online, video. Micro: người nói trong phòng (họp tại chỗ, nghe giảng). Âm thanh máy + Micro: họp lai, có cả người online lẫn người trong phòng. Đổi có tác dụng từ phiên dịch sau. | Computer audio: online meetings, videos. Microphone: people speaking in the room (in-person meetings, lectures). Computer audio + Microphone: hybrid meetings with people online and in the room. Changes apply from the next session. | コンピューターの音声：オンライン会議や動画。マイク：その場で話す人（対面の会議、講義）。コンピューターの音声 + マイク：オンラインと対面が混ざった会議。変更は次の翻訳セッションから反映されます。 | 电脑音频：线上会议、视频。麦克风：房间里说话的人（线下会议、讲座）。电脑音频 + 麦克风：线上和线下结合的混合会议。更改从下一次翻译会话起生效。 | 컴퓨터 오디오: 온라인 회의, 동영상. 마이크: 같은 공간에서 말하는 사람(대면 회의, 강의). 컴퓨터 오디오 + 마이크: 온라인과 대면이 섞인 하이브리드 회의. 변경 사항은 다음 번역 세션부터 적용됩니다. |

en.ts dùng dấu nháy thẳng cho "isn't", "Couldn't" (như các chuỗi hiện có).

- [ ] **Step 1:** Thêm khóa. **Step 2:** chạy:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec tsc --noEmit && pnpm test 2>&1 | grep -E "Tests|FAIL"
```

Expected: tsc không lỗi; Vitest xanh, có ba test mới của Task 5.

- [ ] **Step 3: Commit Task 5–7**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git add src && git commit -m "$(cat <<'EOF'
feat(ui): chế độ Âm thanh máy + Micro (cài đặt, nhãn, ghi chú micIssue), năm ngôn ngữ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Xem trước giao diện và `check-i18n`

**Files:** `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs`

- [ ] **Step 1: Bản giả**

`tauri-mock.ts`:
- `captureMode`: `param("capture") === "mic" ? "mic" : param("capture") === "both" ? "both" : "playback"`.
- `micIssue`: `(["suspected", "permission", "unavailable"] as const).find((v) => v === param("micissue")) ?? null`.
- Chú thích tham số: `capture=mic|both`, `micissue=suspected|permission|unavailable`.
- Khối `notes` của overlay: `micIssue: n.includes("micSilent") ? "suspected" : n.includes("micPermission") ? "permission" :
  n.includes("micUnavailable") ? "unavailable" : null`.

- [ ] **Step 2: Cảnh mới trong `check-i18n.mjs`**

```js
  ["settings-audio-both", "screen=settings&group=audio&capture=both"],
  ["home-both-mic-permission", "screen=home&session=running&capture=both&micissue=permission"],
  ["home-both-mic-unavailable", "screen=home&session=running&capture=both&micissue=unavailable"],
```

và trong `OVERLAYS`: `["overlay-mic-permission", "session=running&notes=micPermission"]`.

- [ ] **Step 3: Chạy**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && (node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 --strictPort > /dev/null 2>&1 &) && for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:1431/ && break; perl -e 'select(undef,undef,undef,0.5)'; done; ONLY=settings-audio,home,overlay node scripts/ui-preview/check-i18n.mjs vi en ja zh ko 2>&1 | tail -3; lsof -ti tcp:1431 | xargs kill
```

Expected: "Đạt: vi, en, ja, zh, ko". Xem ảnh `vi.960x640.settings-audio-both.png`, `vi.960x640.home-both-mic-permission.png`
(chữ không tràn, cả hai bộ chọn hiện).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git add scripts/ui-preview && git commit -m "$(cat <<'EOF'
test(ui-preview): cảnh chế độ trộn và micIssue permission, unavailable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Kiểm toàn bộ

- [ ] **Step 1:**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test --workspace --locked 2>&1 | grep -E "^test result|FAILED|panicked" | awk '/test result/{split($0,a," ");p+=a[4];f+=a[6]} /FAILED|panicked/{print} END{print "passed",p,"failed",f}' && cargo clippy --workspace --all-targets --locked -- -D warnings 2>&1 | tail -1 && sh scripts/check-windows.sh --locked 2>&1 | tail -1 && cargo fmt --all --check && pnpm test 2>&1 | grep Tests && pnpm build 2>&1 | tail -1
```

Expected: `failed 0`, số test lớn hơn Task 0; clippy hai nền tảng sạch; build được.

---

### Task 10: Thử tay chế độ trộn trên Mac

**Cần chủ dự án cho phép** phát tiếng qua loa và mở micro. Lần trước chủ dự án ủy quyền cho Claude điều khiển chuột ảo
(`cliclick`) và phát tiếng (`say`, `afplay`).

Lưu ý khi điều khiển:
- Bản dev mở bằng `MT_DEV_SIGN_IDENTITY="Apple Development: …" sh scripts/run-dev-app.sh` (chạy nền). Bản đã cài phải thoát
  trước.
- Terminal hay giành focus: mỗi lần bấm, chạy `open "<worktree>/target/AI Translator Dev.app"` ngay trước `cliclick`.
- Âm thanh máy được tap theo toàn hệ thống trừ chính app, nên `afplay` và `say` vừa được tap vừa vọng vào micro: đúng là tình
  huống của cổng nhường lời.

- [ ] **Step 1:** Cài đặt › Âm thanh → "Âm thanh máy + Micro": cả hai bộ chọn hiện, có ghi chú nhường lời, thanh trượt khóa ở
  500 ms.
- [ ] **Step 2 (tiếng vọng):** bắt đầu phiên, `afplay` 30 giây track online của cảnh 1
  (`bench/2026-10-24-nguon-micro/data/tracks/s1-luot/online.wav`) qua loa ở 60%. Bản chép lời: mỗi câu online **một lần**, không
  có bản sao lệch giờ.
- [ ] **Step 3 (người trong phòng):** dừng `afplay`; trong lúc không có âm thanh máy, `say -v Linh` hai câu (thiết bị phát
  `say` cũng bị tap, nên câu xuất hiện một lần qua âm thanh máy; kiểm không bị nhân đôi). Ghi lại: chế độ này không có cách
  giả "người trong phòng" thuần túy trên một máy; ghi rõ hạn chế vào kết quả.
- [ ] **Step 4 (thiếu quyền):** `tccutil reset Microphone com.aitranslator.desktop`, thoát và mở lại bản dev. Bắt đầu phiên
  ở chế độ trộn: macOS hỏi quyền (QĐ1). Chọn "Don't Allow": phiên **vẫn chạy**, màn hình chính có ghi chú
  `home.micIssue.permission` kèm nút, thanh phụ đề có ghi chú, âm thanh máy vẫn được dịch. Bật lại quyền, chọn "Quit & Reopen".
- [ ] **Step 5 (A2):** so tổng độ trễ p50 trong dòng log "kết thúc phiên dịch: … tổng p50 …" giữa:
  - một phiên chế độ Âm thanh máy;
  - một phiên chế độ trộn.

  Cả hai phát cùng 60 giây track online. Kỳ vọng: chế độ trộn chậm hơn khoảng 450 ms do đóng đoạn sau 500 ms (spec mục 16), cộng
  không quá 100 ms (A2). Ghi số.
- [ ] **Step 6:** Ghi `bench/2026-10-24-nguon-micro/results/thu-tay-tron-mac.md`, commit. Trả cài đặt và âm lượng về như cũ,
  tắt mọi tiến trình đã mở, cập nhật memory.

---

## Tự rà kế hoạch

- **Spec §3.1, §3.2:** ba chế độ (Task 2, 6); hai bộ chọn và ghi chú nhường lời (Task 6, 7).
- **§3.3:** nhãn "Toàn hệ thống + Micro: {tên}" (Task 5, 6); ghi chú ở màn hình chính và thanh phụ đề (Task 5, 6).
- **§3.4:** hỏi quyền khi chọn chế độ có micro (Task 6) và lúc bắt đầu phiên nếu chưa hỏi (Task 4).
- **§5.3:** bộ tiền xử lý có hai bản trộn, cổng nhân cùng hệ số cho hai bản micro (Task 3, dùng `DuckingMixer` của spike).
- **§5.4:** `DuckingMixer`, `MicGate`, tham số chốt của mục 16 (Task 3). §5.5 (khử vọng) không làm (mục 16).
- **§5.6:**
  - tap chết chỉ xét âm thanh máy;
  - `ZeroWatch` riêng cho từng nguồn;
  - mở lại micro khi micro mặc định đổi;
  - micro lỗi không dừng phiên;
  - log tỉ lệ hạ.
  Tất cả ở Task 3.
- **§7:** bảng ba tình huống ở cột chế độ `both` (Task 3, 4, 6).
- **§10 (capture.rs):** test `Watch` chỉ đếm khung âm thanh máy được bảo đảm bằng thiết kế: `opened.stats` chỉ có nguồn âm thanh
  máy, khung micro nằm ở `MicSide`. Các test còn lại ở Task 3.
- **§11:** A-trộn đo lại ở Task 1; A2 ở Task 10; A7 và A1-mic thuộc kế hoạch 04.
- **Còn cho kế hoạch 04:** pháp lý, website, sửa spec chính, `THIRD_PARTY_NOTICES`, nghiệm thu mục 11, phát hành.
