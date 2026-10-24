# Nguồn micro 05: nhường lời theo tiếng nói của âm thanh máy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ở chế độ Âm thanh máy + Micro, micro bị tắt khi âm thanh máy có tiếng nói kể cả khi rất nhỏ (dưới −55 dBFS), để người online nói nhỏ không bị tiếng nền micro (+20 dB) lấn át. Không thêm độ trễ vào luồng âm thanh.

**Architecture:**
- `DuckingMixer` (crate `audio-capture`) nhận một bộ phát hiện tiếng nói tùy chọn, qua trait `SpeechDetector`: gom âm thanh máy thành khung 512 mẫu, hỏi bộ phát hiện, có tiếng thì giữ cổng hạ (`MicGate::hold`). Điều kiện năng lượng −55 dBFS giữ nguyên.
- App bọc Silero VAD (`pipeline::vad::SileroVad`) thành `SpeechDetector`. `LiveCapture` giữ nó, nạp lười trên luồng VAD của engine ở lần trộn đầu, và truyền vào lúc trộn.
- `latency-bench mix-eval` có cùng tùy chọn để đo offline.

**Tech Stack:** Rust (crate `audio-capture`, `pipeline`, `latency-bench`, `src-tauri`), Silero VAD qua candle-onnx, `score_mix.py` (uv, Python 3.12).

**Spec:** `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` mục 17 (ghi đè mục 16 ở phần tiếng vọng). Số liệu dẫn tới thiết kế: `bench/2026-10-24-nguon-micro/results/ao-tron.md`.

---

## Quy tắc chung

- **Worktree** `/Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro`, nhánh `nguon-micro`. **Mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro &&`.** Trước mỗi commit chạy `git branch --show-current` (phải ra `nguon-micro`); chỉ `git add` file của task.
- **Không merge, push, deploy, đẩy tag.** **Không phát tiếng ra loa, không mở micro** khi chưa hỏi chủ dự án (Task 6).
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Bench phải dùng `asr-worker` có Metal: `MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p asr-worker --features metal,shared-encode`. Kiểm `asr-worker.log` của mỗi lượt có `Metal total size`.
- **Ràng buộc của chủ dự án:** không làm chậm dịch và nhả chữ. Không thêm bộ đệm hay trễ nào; mọi đo đạc ở Task 5–6 phải báo chi phí.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `crates/audio-capture/src/duck.rs` | `SPEECH_FRAME`, trait `SpeechDetector`, `GateParams::speech_prob`, `MicGate::hold`, `DuckingMixer::{drain_into_with, flush_into_with, take_speech_error}` |
| Modify `src-tauri/src/capture.rs` | `GATE` mới; `SileroSpeech`, `SpeechSlot`; `Pre::drain` và `BothPre::drain` nhận bộ phát hiện; `LiveCapture::open` nhận đường dẫn model |
| Modify `src-tauri/src/session.rs` | `LiveDeps::vad_model`; `capture()` truyền model cho chế độ trộn |
| Modify `crates/latency-bench/src/mix_eval.rs` | `GateSpec::speech_prob`, `build_views_with`, `SileroSpeech` |
| Create `bench/2026-10-24-nguon-micro/variants/both-loi-noi.json` | Ba phương án so sánh |
| Create `bench/2026-10-24-nguon-micro/results/loi-noi.md` | Kết quả đo (Task 5, 6) |
| Modify `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` | Hai chỗ chữ của mục 17 (Task 0) |
| Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | §6.2 (Task 4) |

---

### Task 0: Mốc và sửa hai chỗ chữ của spec mục 17

**Files:** Modify `docs/superpowers/specs/2026-10-24-nguon-micro-design.md`

- [ ] **Step 1: Mốc**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git status --short | head && cargo test -p audio-capture --lib duck 2>&1 | grep "test result"`
Expected: `nguon-micro`, cây sạch, `test result: ok. 13 passed`.

- [ ] **Step 2: Sửa spec**

Hai chỗ (spec viết trước khi đọc mã):
- `mix-eval` đã có `duck_db: null` là tắt hẳn micro, nên không cần cờ `gate.mute`.
- Mỗi lần mở lại nguồn có bộ trộn mới, nên lỗi bộ phát hiện chỉ có hiệu lực tới lần mở kế tiếp.

```old
- `mix-eval`: phương án nhận `gate.speech_prob` (ngưỡng xác suất; không có thì như mục 16) và `gate.mute` (tắt hẳn micro
  khi hạ; JSON không ghi được âm vô cực).
```
```new
- `mix-eval`: phương án nhận `gate.speech_prob` (ngưỡng xác suất; không có thì như mục 16). Tắt hẳn micro khi hạ là
  `"duck_db": null`, đã có từ spike.
```

```old
**Lỗi.** Silero của bộ trộn không nạp được hay chạy lỗi thì ghi cảnh báo một lần và dùng riêng điều kiện (a) cho tới hết
phiên. Phiên không dừng, không có mã lỗi mới.
```
```new
**Lỗi.**
- Silero của bộ trộn không nạp được: ghi cảnh báo một lần và dùng riêng điều kiện (a) tới hết phiên.
- Chạy lỗi giữa chừng: ghi cảnh báo và dùng riêng (a) tới lần mở nguồn kế tiếp, vì mỗi lần mở có bộ trộn mới.
- Phiên không dừng, không có mã lỗi mới.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add docs/superpowers/specs/2026-10-24-nguon-micro-design.md && git commit -m "docs(spec): mục 17 khớp mã (duck_db null, lỗi VAD theo lần mở nguồn)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: `duck.rs` — bộ phát hiện tiếng nói cho cổng

**Files:** Modify `crates/audio-capture/src/duck.rs`

- [ ] **Step 1: Test hỏng trước**

Thêm vào cuối `mod tests` (trước dấu `}` cuối file):

```rust
    /// Bộ phát hiện giả: trả lần lượt các xác suất trong `probs` (hết thì 0), đếm lần gọi và lần reset; `fail_at`: lần gọi
    /// thứ mấy (từ 0) trả lỗi.
    #[derive(Default)]
    struct FakeSpeech {
        probs: Vec<f32>,
        calls: usize,
        resets: usize,
        fail_at: Option<usize>,
    }

    impl SpeechDetector for FakeSpeech {
        fn prob(&mut self, frame: &[f32]) -> anyhow::Result<f32> {
            assert_eq!(frame.len(), SPEECH_FRAME);
            let i = self.calls;
            self.calls += 1;
            if self.fail_at == Some(i) {
                anyhow::bail!("hỏng");
            }
            Ok(self.probs.get(i).copied().unwrap_or(0.0))
        }

        fn reset(&mut self) -> anyhow::Result<()> {
            self.resets += 1;
            Ok(())
        }
    }

    /// Như `GATE` của app (spec mục 17).
    const APP: GateParams = GateParams {
        threshold_dbfs: -55.0,
        duck_db: f32::NEG_INFINITY,
        hold_ms: 300,
        speech_prob: 0.5,
    };
    /// Biên độ hằng 0,0008: −62 dBFS, dưới ngưỡng năng lượng.
    const QUIET: f32 = 0.0008;

    fn mix_with(params: GateParams, playback: &[f32], mic: &[f32], speech: &mut FakeSpeech) -> (Vec<f32>, DuckingMixer) {
        let mut m = DuckingMixer::new(params, usize::MAX);
        m.push_playback(playback);
        m.push_mic(mic, mic);
        let mut out = Vec::new();
        m.flush_into_with(&mut out, &mut Vec::new(), Some(speech as &mut dyn SpeechDetector));
        (out, m)
    }

    #[test]
    fn quiet_speech_mutes_the_mic_from_the_next_sample_and_holds() {
        let mut playback = vec![QUIET; 1_536];
        playback.resize(9_000, 0.0);
        let mut s = FakeSpeech {
            probs: vec![0.9, 0.9, 0.9],
            ..Default::default()
        };
        let (out, _) = mix_with(APP, &playback, &[0.3; 9_000], &mut s);
        // Khung 512 mẫu đầu chưa xong: micro chưa bị hạ.
        assert!((out[100] - (QUIET + 0.3)).abs() < 1e-6, "{}", out[100]);
        // Từ mẫu 512: micro tắt, chỉ còn âm thanh máy.
        assert!((out[600] - QUIET).abs() < 1e-6, "{}", out[600]);
        // Khung có tiếng cuối kết thúc ở mẫu 1 536; giữ 300 ms (30 khung 10 ms) tới khoảng mẫu 6 240.
        assert_eq!(out[6_000], 0.0);
        // Mở lại xong sau 50 ms.
        assert!((out[8_500] - 0.3).abs() < 1e-6, "{}", out[8_500]);
    }

    #[test]
    fn quiet_non_speech_does_not_duck() {
        let mut s = FakeSpeech {
            probs: vec![0.1; 20],
            ..Default::default()
        };
        let (out, _) = mix_with(APP, &[QUIET; 8_000], &[0.3; 8_000], &mut s);
        assert!(out.iter().all(|&v| (v - (QUIET + 0.3)).abs() < 1e-6));
        assert_eq!(s.calls, 8_000 / SPEECH_FRAME);
    }

    #[test]
    fn loud_playback_still_ducks_at_once_whatever_the_detector_says() {
        let mut s = FakeSpeech::default();
        let (out, _) = mix_with(APP, &[0.1; 1_600], &[0.3; 1_600], &mut s);
        assert!((out[100] - 0.4).abs() < 1e-6, "{}", out[100]);
        assert!((out[200] - 0.1).abs() < 1e-6, "{}", out[200]);
    }

    #[test]
    fn a_failing_detector_is_reported_once_and_the_gate_falls_back_to_energy() {
        let mut s = FakeSpeech {
            probs: vec![0.9; 20],
            fail_at: Some(0),
            ..Default::default()
        };
        let (out, mut m) = mix_with(APP, &[QUIET; 4_000], &[0.3; 4_000], &mut s);
        assert_eq!(s.calls, 1, "lỗi một lần thì không hỏi nữa");
        assert!(out.iter().all(|&v| (v - (QUIET + 0.3)).abs() < 1e-6));
        assert!(m.take_speech_error().unwrap().contains("hỏng"));
        assert_eq!(m.take_speech_error(), None);
    }

    #[test]
    fn the_detector_is_reset_once_per_mixer() {
        let mut s = FakeSpeech::default();
        let mut m = DuckingMixer::new(APP, usize::MAX);
        for _ in 0..3 {
            m.push_playback(&[QUIET; 600]);
            m.push_mic(&[0.0; 600], &[0.0; 600]);
            m.drain_into_with(&mut Vec::new(), &mut Vec::new(), Some(&mut s as &mut dyn SpeechDetector));
        }
        assert_eq!((s.resets, s.calls), (1, 1_800 / SPEECH_FRAME));
        let mut m2 = DuckingMixer::new(APP, usize::MAX);
        m2.push_playback(&[QUIET; 600]);
        m2.push_mic(&[0.0; 600], &[0.0; 600]);
        m2.drain_into_with(&mut Vec::new(), &mut Vec::new(), Some(&mut s as &mut dyn SpeechDetector));
        assert_eq!(s.resets, 2, "bộ trộn mới (mở lại nguồn) thì reset lại");
    }

    #[test]
    fn without_a_speech_threshold_the_detector_is_never_asked() {
        let mut s = FakeSpeech {
            probs: vec![1.0; 20],
            ..Default::default()
        };
        let params = GateParams {
            speech_prob: f32::INFINITY,
            ..APP
        };
        let (out, _) = mix_with(params, &[QUIET; 4_000], &[0.3; 4_000], &mut s);
        assert_eq!((s.calls, s.resets), (0, 0));
        assert!(out.iter().all(|&v| (v - (QUIET + 0.3)).abs() < 1e-6));
    }
```

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p audio-capture --lib duck 2>&1 | grep -E "^error|cannot find" | head -5`
Expected: lỗi biên dịch (`SpeechDetector`, `SPEECH_FRAME`, `speech_prob`, `flush_into_with` chưa có).

- [ ] **Step 2: Đầu file — doc, hằng số, trait, `GateParams`**

```old
//! - [`DuckingMixer`] ghép cặp mẫu Playback với mẫu micro như `Mixer2` (phần dư quá `max_skew` phát riêng), nhân micro với
//!   hệ số của cổng rồi cộng. Micro có hai bản thẳng hàng (cho whisper, cho VAD, spec §5.3): cùng một hệ số cho cả hai.
```
```new
//! - [`DuckingMixer`] ghép cặp mẫu Playback với mẫu micro như `Mixer2` (phần dư quá `max_skew` phát riêng), nhân micro với
//!   hệ số của cổng rồi cộng. Micro có hai bản thẳng hàng (cho whisper, cho VAD, spec §5.3): cùng một hệ số cho cả hai.
//! - Cổng kép (spec mục 17): ngoài năng lượng, một [`SpeechDetector`] tùy chọn (app: Silero VAD) nghe Playback theo khung
//!   [`SPEECH_FRAME`] mẫu; khung có tiếng nói thì cổng hạ như một khung to. Kết quả áp từ mẫu kế tiếp, không đọc trước, nên
//!   không thêm độ trễ; giọng nhỏ có thể lọt tối đa một hai khung đầu câu.
```

```old
/// Thời gian mở lại dần: 50 ms.
const RELEASE_SAMPLES: f32 = 800.0;
```
```new
/// Thời gian mở lại dần: 50 ms.
const RELEASE_SAMPLES: f32 = 800.0;
/// Khung của bộ phát hiện tiếng nói: 512 mẫu (32 ms), như Silero VAD.
pub const SPEECH_FRAME: usize = 512;

/// Bộ phát hiện tiếng nói trên Playback cho cổng (spec mục 17). Crate này không phụ thuộc `pipeline`: app và
/// `latency-bench` bọc Silero VAD bằng trait này.
pub trait SpeechDetector {
    /// Xác suất có tiếng nói của một khung [`SPEECH_FRAME`] mẫu.
    fn prob(&mut self, frame: &[f32]) -> anyhow::Result<f32>;
    /// Xóa state. [`DuckingMixer`] gọi ở lần dùng đầu tiên của mỗi bộ trộn (mỗi lần mở nguồn).
    fn reset(&mut self) -> anyhow::Result<()>;
}
```

```old
    /// Giữ mức hạ thêm chừng này sau khung có tiếng cuối cùng.
    pub hold_ms: u32,
}
```
```new
    /// Giữ mức hạ thêm chừng này sau khung có tiếng cuối cùng.
    pub hold_ms: u32,
    /// Bộ phát hiện tiếng nói (nếu có) cho xác suất từ mức này trở lên là "có tiếng" (spec mục 17). `f32::INFINITY`: không
    /// dùng bộ phát hiện.
    pub speech_prob: f32,
}
```

```old
        threshold_dbfs: f32::INFINITY,
        duck_db: 0.0,
        hold_ms: 0,
    };
```
```new
        threshold_dbfs: f32::INFINITY,
        duck_db: 0.0,
        hold_ms: 0,
        speech_prob: f32::INFINITY,
    };
```

```old
            threshold_dbfs: -45.0,
            duck_db: -20.0,
            hold_ms: 300,
        }
```
```new
            threshold_dbfs: -45.0,
            duck_db: -20.0,
            hold_ms: 300,
            speech_prob: f32::INFINITY,
        }
```

- [ ] **Step 3: `MicGate` — lưu ngưỡng xác suất, thêm `hold`**

```old
pub struct MicGate {
    threshold_sq: f32,
```
```new
pub struct MicGate {
    threshold_sq: f32,
    speech_prob: f32,
```

```old
        Self {
            threshold_sq: threshold * threshold,
            duck,
```
```new
        Self {
            threshold_sq: threshold * threshold,
            speech_prob: p.speech_prob,
            duck,
```

Thêm ngay sau hàm `next` (sau dòng `        applied` và `    }` đóng `next`, trước `}` đóng `impl MicGate`). Edit: `old_string` = 

```old
        if !loud && self.holding == 0 && self.gain < 1.0 {
            self.gain = (self.gain + self.release_step).min(1.0);
        }
        applied
    }
}
```
```new
        if !loud && self.holding == 0 && self.gain < 1.0 {
            self.gain = (self.gain + self.release_step).min(1.0);
        }
        applied
    }

    /// Playback có tiếng nói (bộ phát hiện, spec mục 17): hạ từ mẫu kế tiếp và giữ như sau một khung to.
    pub fn hold(&mut self) {
        self.holding = self.hold_frames;
        self.gain = self.duck;
    }

    /// Ngưỡng xác suất tiếng nói; `f32::INFINITY` là không dùng bộ phát hiện.
    pub fn speech_prob(&self) -> f32 {
        self.speech_prob
    }
}
```

- [ ] **Step 4: `DuckingMixer` — trường mới**

```old
    max_skew: usize,
    mic_samples: u64,
    ducked_samples: u64,
}
```
```new
    max_skew: usize,
    mic_samples: u64,
    ducked_samples: u64,
    /// Playback đang gom cho khung kế tiếp của bộ phát hiện.
    speech_buf: Vec<f32>,
    /// Đã reset bộ phát hiện cho bộ trộn này chưa.
    speech_started: bool,
    /// Bộ phát hiện đã lỗi: từ đó cổng chỉ còn theo năng lượng.
    speech_failed: bool,
    speech_error: Option<String>,
}
```

```old
            max_skew: max_skew_samples,
            mic_samples: 0,
            ducked_samples: 0,
        }
```
```new
            max_skew: max_skew_samples,
            mic_samples: 0,
            ducked_samples: 0,
            speech_buf: Vec::with_capacity(SPEECH_FRAME),
            speech_started: false,
            speech_failed: false,
            speech_error: None,
        }
```

- [ ] **Step 5: `DuckingMixer` — `drain_into_with`, `flush_into_with`, nghe tiếng nói**

Thay cả hai hàm `drain_into` và `flush_into` (từ dòng doc `/// Ghi phần ghép được vào` tới hết `flush_into`):

```old
    /// Ghi phần ghép được vào `out` (cho whisper) và `out_vad` (cho VAD); phần dư quá `max_skew` phát riêng.
    pub fn drain_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        let paired = self.playback.len().min(self.mic.len());
        for ((p, m), v) in self
            .playback
            .drain(..paired)
            .zip(self.mic.drain(..paired))
            .zip(self.mic_vad.drain(..paired))
        {
            let g = self.gate.next(p);
            self.mic_samples += 1;
            if g < 1.0 {
                self.ducked_samples += 1;
            }
            out.push((p + g * m).clamp(-1.0, 1.0));
            out_vad.push((p + g * v).clamp(-1.0, 1.0));
        }
        let extra = self.playback.len().saturating_sub(self.max_skew);
        self.flush_playback(extra, out, out_vad);
        let extra = self.mic.len().saturating_sub(self.max_skew);
        self.flush_mic(extra, out, out_vad);
    }

    /// Phát hết phần còn lại (khi dừng, hay cuối file).
    pub fn flush_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        self.drain_into(out, out_vad);
        self.flush_playback(self.playback.len(), out, out_vad);
        self.flush_mic(self.mic.len(), out, out_vad);
    }
```
```new
    /// Ghi phần ghép được vào `out` (cho whisper) và `out_vad` (cho VAD); phần dư quá `max_skew` phát riêng.
    pub fn drain_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        self.drain_into_with(out, out_vad, None);
    }

    /// Như [`Self::drain_into`], có bộ phát hiện tiếng nói nghe Playback (spec mục 17).
    pub fn drain_into_with(
        &mut self,
        out: &mut Vec<f32>,
        out_vad: &mut Vec<f32>,
        mut speech: Option<&mut (dyn SpeechDetector + '_)>,
    ) {
        let paired = self.playback.len().min(self.mic.len());
        for _ in 0..paired {
            let (Some(p), Some(m), Some(v)) = (self.playback.pop_front(), self.mic.pop_front(), self.mic_vad.pop_front())
            else {
                break;
            };
            let g = self.gate.next(p);
            self.mic_samples += 1;
            if g < 1.0 {
                self.ducked_samples += 1;
            }
            out.push((p + g * m).clamp(-1.0, 1.0));
            out_vad.push((p + g * v).clamp(-1.0, 1.0));
            self.listen(p, &mut speech);
        }
        let extra = self.playback.len().saturating_sub(self.max_skew);
        self.flush_playback(extra, out, out_vad, &mut speech);
        let extra = self.mic.len().saturating_sub(self.max_skew);
        self.flush_mic(extra, out, out_vad);
    }

    /// Phát hết phần còn lại (khi dừng, hay cuối file).
    pub fn flush_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        self.flush_into_with(out, out_vad, None);
    }

    /// Như [`Self::flush_into`], có bộ phát hiện tiếng nói.
    pub fn flush_into_with(
        &mut self,
        out: &mut Vec<f32>,
        out_vad: &mut Vec<f32>,
        mut speech: Option<&mut (dyn SpeechDetector + '_)>,
    ) {
        self.drain_into_with(out, out_vad, speech.as_deref_mut());
        self.flush_playback(self.playback.len(), out, out_vad, &mut speech);
        self.flush_mic(self.mic.len(), out, out_vad);
    }

    /// Lỗi của bộ phát hiện tiếng nói, nếu có, đúng một lần. Từ lúc lỗi, bộ trộn này chỉ hạ theo năng lượng.
    pub fn take_speech_error(&mut self) -> Option<String> {
        self.speech_error.take()
    }

    /// Đưa một mẫu Playback cho bộ phát hiện; đủ một khung thì hỏi, có tiếng nói thì giữ cổng hạ.
    fn listen(&mut self, p: f32, speech: &mut Option<&mut (dyn SpeechDetector + '_)>) {
        let Some(detector) = speech.as_deref_mut() else {
            return;
        };
        if self.speech_failed || self.gate.speech_prob() == f32::INFINITY {
            return;
        }
        if !self.speech_started {
            self.speech_started = true;
            if let Err(e) = detector.reset() {
                self.speech_fail(e);
                return;
            }
        }
        self.speech_buf.push(p);
        if self.speech_buf.len() < SPEECH_FRAME {
            return;
        }
        match detector.prob(&self.speech_buf) {
            Ok(prob) if prob >= self.gate.speech_prob() => self.gate.hold(),
            Ok(_) => {}
            Err(e) => self.speech_fail(e),
        }
        self.speech_buf.clear();
    }

    fn speech_fail(&mut self, e: anyhow::Error) {
        self.speech_failed = true;
        self.speech_error = Some(format!("{e:#}"));
    }
```

`flush_playback` cũng cho bộ phát hiện nghe (Playback phát riêng vẫn là Playback):

```old
    fn flush_playback(&mut self, n: usize, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        for p in self.playback.drain(..n) {
            self.gate.next(p);
            let p = p.clamp(-1.0, 1.0);
            out.push(p);
            out_vad.push(p);
        }
    }
```
```new
    fn flush_playback(
        &mut self,
        n: usize,
        out: &mut Vec<f32>,
        out_vad: &mut Vec<f32>,
        speech: &mut Option<&mut (dyn SpeechDetector + '_)>,
    ) {
        for _ in 0..n {
            let Some(p) = self.playback.pop_front() else {
                break;
            };
            self.gate.next(p);
            self.listen(p, speech);
            let p = p.clamp(-1.0, 1.0);
            out.push(p);
            out_vad.push(p);
        }
    }
```

- [ ] **Step 6: Test xanh, clippy**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p audio-capture --lib duck 2>&1 | grep -E "test result|FAILED|panicked" && cargo clippy -p audio-capture --all-targets -- -D warnings 2>&1 | tail -2`
Expected: `test result: ok. 19 passed`; clippy sạch. Nếu `cargo test -p audio-capture` báo crate khác (`latency-bench`, `src-tauri`) lỗi vì `GateParams` thiếu `speech_prob`: Task 2 và Task 3 sửa; ở bước này chỉ chạy `-p audio-capture`.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add crates/audio-capture/src/duck.rs && git commit -m "feat(audio-capture): cổng nhường lời nghe thêm bộ phát hiện tiếng nói trên âm thanh máy (spec mục 17)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: App — Silero của bộ nhường lời

**Files:** Modify `src-tauri/src/capture.rs`, `src-tauri/src/session.rs`

- [ ] **Step 1: Test hỏng trước (`capture.rs`, cuối `mod tests`)**

```rust
    /// Âm thanh máy rất nhỏ (−62 dBFS) mà bộ phát hiện báo có tiếng nói: micro bị tắt (spec mục 17). Không có bộ phát hiện
    /// thì micro không bị hạ (dưới ngưỡng năng lượng).
    #[test]
    fn quiet_playback_with_speech_mutes_the_mic() {
        struct Always;
        impl SpeechDetector for Always {
            fn prob(&mut self, _: &[f32]) -> anyhow::Result<f32> {
                Ok(1.0)
            }
            fn reset(&mut self) -> anyhow::Result<()> {
                Ok(())
            }
        }
        fn run(speech: Option<&mut dyn SpeechDetector>) -> (f32, f32) {
            let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
            let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
            let format = AudioFormat {
                sample_rate: 16_000,
                channels: 1,
            };
            let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
            both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
            let mut pre = Pre::Both(Box::new(both));
            for i in 0..8_000 {
                pb_in.push(if i % 2 == 0 { 0.0008 } else { -0.0008 }).unwrap();
                mic_in
                    .push(0.001 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
                    .unwrap();
            }
            let mut f = Frames::default();
            pre.drain(&mut f, speech).unwrap();
            let level = |x: &[f32]| x.iter().map(|v| v.abs()).sum::<f32>() / x.len() as f32;
            let rest: Vec<f32> = f.asr[1_600..].iter().zip(&f.playback[1_600..]).map(|(a, p)| a - p).collect();
            (level(&rest), level(&f.mic[1_600..]))
        }
        let (muted, mic) = run(Some(&mut Always as &mut dyn SpeechDetector));
        assert!(muted < mic * 0.01, "micro phải tắt: {muted} so với {mic}");
        let (open, mic) = run(None);
        assert!(open > mic * 0.5, "không có bộ phát hiện thì micro mở: {open} so với {mic}");
    }

    /// Bộ phát hiện chỉ được chuẩn bị ở chế độ trộn và khi có đường dẫn model; model hỏng thì không có bộ phát hiện, không
    /// panic, và không nạp lại.
    #[test]
    fn the_speech_slot_is_only_armed_in_both_mode_and_survives_a_missing_model() {
        let both = CapturePlan::Both {
            source: AudioSource::System,
            device: None,
            noise_filter: true,
        };
        let playback = CapturePlan::Playback {
            source: AudioSource::System,
            include_self: false,
        };
        assert!(matches!(SpeechSlot::new(&playback, Some("x.onnx".into())), SpeechSlot::Off));
        assert!(matches!(SpeechSlot::new(&both, None), SpeechSlot::Off));
        let mut slot = SpeechSlot::new(&both, Some(PathBuf::from("/không/có/model.onnx")));
        assert!(slot.get().is_none());
        assert!(matches!(slot, SpeechSlot::Failed));
        assert!(slot.get().is_none());
    }
```

Đổi bốn chỗ `pre.drain(&mut f).unwrap();` trong `mod tests` thành `pre.drain(&mut f, None).unwrap();`. Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && grep -c "pre.drain(&mut f).unwrap();" src-tauri/src/capture.rs` → `4` trước khi sửa, `0` sau.

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib capture 2>&1 | grep -E "^error" | head -5`
Expected: lỗi biên dịch (`SpeechDetector`, `SpeechSlot`, `drain` nhận hai tham số).

- [ ] **Step 2: `GATE` và import**

```old
use audio_capture::duck::{DuckingMixer, GateParams};
```
```new
use audio_capture::duck::{DuckingMixer, GateParams, SpeechDetector};
```

```old
use std::thread::JoinHandle;
```
```new
use std::path::PathBuf;
use std::thread::JoinHandle;
```
(Đã kiểm 2026-10-25: `capture.rs` chưa import `PathBuf`.)

```old
/// Nhường lời (spec mục 16): khung âm thanh máy từ −55 dBFS là có tiếng; khi đó micro hạ −30 dB, giữ thêm 300 ms.
const GATE: GateParams = GateParams {
    threshold_dbfs: -55.0,
    duck_db: -30.0,
    hold_ms: 300,
};
```
```new
/// Nhường lời (spec mục 17): micro tắt hẳn khi khung âm thanh máy từ −55 dBFS, hoặc khi Silero trên âm thanh máy cho xác suất
/// có tiếng nói từ 0,5 (người online nói nhỏ); giữ thêm 300 ms.
const GATE: GateParams = GateParams {
    threshold_dbfs: -55.0,
    duck_db: f32::NEG_INFINITY,
    hold_ms: 300,
    speech_prob: 0.5,
};

/// Silero VAD làm bộ phát hiện tiếng nói của bộ nhường lời (spec mục 17).
struct SileroSpeech(pipeline::vad::SileroVad);

impl SpeechDetector for SileroSpeech {
    fn prob(&mut self, frame: &[f32]) -> anyhow::Result<f32> {
        self.0.prob(frame)
    }

    fn reset(&mut self) -> anyhow::Result<()> {
        self.0.reset()
    }
}

/// Silero riêng của bộ nhường lời, chỉ ở chế độ trộn. `LiveCapture` giữ nó qua các lần mở lại nguồn (mỗi bộ trộn mới tự
/// reset nó). Nạp lười trên luồng gọi `read_with_vad`, tức luồng VAD của engine (stack 8 MiB, đủ cho candle).
enum SpeechSlot {
    Off,
    Pending(PathBuf),
    Ready(SileroSpeech),
    Failed,
}

impl SpeechSlot {
    fn new(plan: &CapturePlan, model: Option<PathBuf>) -> Self {
        match (plan, model) {
            (CapturePlan::Both { .. }, Some(path)) => SpeechSlot::Pending(path),
            _ => SpeechSlot::Off,
        }
    }

    /// Bộ phát hiện, nạp ở lần gọi đầu. Nạp lỗi thì ghi cảnh báo một lần; từ đó không có bộ phát hiện (cổng theo năng lượng).
    fn get(&mut self) -> Option<&mut dyn SpeechDetector> {
        if let SpeechSlot::Pending(path) = self {
            let path = path.clone();
            *self = match pipeline::vad::SileroVad::load(&path) {
                Ok(vad) => SpeechSlot::Ready(SileroSpeech(vad)),
                Err(e) => {
                    log::warn!("nhường lời: không nạp được VAD, chỉ hạ micro theo mức âm thanh máy: {e:#}");
                    SpeechSlot::Failed
                }
            };
        }
        match self {
            SpeechSlot::Ready(s) => Some(s),
            _ => None,
        }
    }
}
```

- [ ] **Step 3: `Pre::drain`, `BothPre::drain`**

```old
impl Pre {
    fn drain(&mut self, f: &mut Frames) -> anyhow::Result<()> {
```
```new
impl Pre {
    /// `speech`: bộ phát hiện tiếng nói của bộ nhường lời; chỉ chế độ trộn dùng.
    fn drain(&mut self, f: &mut Frames, speech: Option<&mut dyn SpeechDetector>) -> anyhow::Result<()> {
```

```old
            Pre::Both(b) => b.drain(f),
```
```new
            Pre::Both(b) => b.drain(f, speech),
```

```old
    fn drain(&mut self, f: &mut Frames) -> anyhow::Result<()> {
        self.pb.clear();
```
```new
    fn drain(&mut self, f: &mut Frames, speech: Option<&mut dyn SpeechDetector>) -> anyhow::Result<()> {
        self.pb.clear();
```

```old
        self.mixer.push_mic(&self.mic_asr, &self.mic_vad);
        self.mixer.drain_into(&mut f.asr, &mut f.vad);
        Ok(())
```
```new
        self.mixer.push_mic(&self.mic_asr, &self.mic_vad);
        self.mixer.drain_into_with(&mut f.asr, &mut f.vad, speech);
        if let Some(e) = self.mixer.take_speech_error() {
            log::warn!("nhường lời: VAD lỗi, chỉ hạ micro theo mức âm thanh máy tới lần mở nguồn sau: {e}");
        }
        Ok(())
```

Sửa chú thích của test `with_a_mic_the_both_preprocessor_ducks_the_mic_under_playback` (mức hạ giờ là tắt hẳn):

```old
    /// Có micro: tiếng online đang phát thì micro bị hạ (−30 dB); mẫu chưa trộn của micro vẫn nguyên để canh "toàn số 0".
```
```new
    /// Có micro: tiếng online đang phát thì micro bị tắt (spec mục 17); mẫu chưa trộn của micro vẫn nguyên để canh "toàn số 0".
```

```old
        // Bỏ 1 600 mẫu đầu (bộ giới hạn và cổng vừa khởi động). Phần còn lại, hiệu giữa bản trộn và âm thanh máy chỉ còn micro
        // đã hạ: micro sau bộ giới hạn khoảng 0,01 × 2/π, hạ −30 dB còn khoảng 0,0002.
```
```new
        // Bỏ 1 600 mẫu đầu (bộ giới hạn và cổng vừa khởi động). Phần còn lại, hiệu giữa bản trộn và âm thanh máy chỉ còn micro
        // đã tắt: gần 0.
```

- [ ] **Step 4: `LiveCapture`**

```old
    /// Bản VAD bỏ đi khi engine chỉ gọi `read`.
```
```new
    /// Silero của bộ nhường lời (chế độ trộn, spec mục 17).
    speech: SpeechSlot,
    /// Bản VAD bỏ đi khi engine chỉ gọi `read`.
```

```old
impl LiveCapture {
    pub fn open(plan: CapturePlan, on_event: OnEvent) -> Self {
        let shared = Arc::new(Mutex::new(None));
```
```new
impl LiveCapture {
    /// `speech_model`: đường dẫn Silero VAD cho bộ nhường lời; chỉ dùng ở chế độ trộn.
    pub fn open(plan: CapturePlan, on_event: OnEvent, speech_model: Option<PathBuf>) -> Self {
        let speech = SpeechSlot::new(&plan, speech_model);
        let shared = Arc::new(Mutex::new(None));
```

```old
            frames: Frames::default(),
            unused: Vec::new(),
        }
```
```new
            frames: Frames::default(),
            speech,
            unused: Vec::new(),
        }
```

```old
        let (shared, frames) = (&self.shared, &mut self.frames);
```
```new
        let (shared, frames, speech) = (&self.shared, &mut self.frames, &mut self.speech);
```

```old
                Some(p) => p.drain(frames),
```
```new
                Some(p) => p.drain(frames, speech.get()),
```

- [ ] **Step 5: `session.rs` — truyền model**

Thêm vào khối `impl<R: Runtime> LiveDeps<R> {` (khối inherent, không phải `impl SessionDeps for`), ngay sau dòng mở khối:

```rust
    /// Đường dẫn model VAD của bộ tiến trình phụ đang dùng (rỗng nếu chưa có).
    fn vad_model(&self) -> PathBuf {
        self.live
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.vad_model.clone())
            .unwrap_or_default()
    }
```

```old
    fn vad(&self) -> VadFactory {
        let path = self
            .live
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.vad_model.clone())
            .unwrap_or_default();
        Box::new(move || Ok(Box::new(SileroVad::load(&path)?) as _))
    }

    fn capture(&self, plan: &CapturePlan, on_event: OnEvent) -> Box<dyn FrameSource> {
        Box::new(LiveCapture::open(plan.clone(), on_event))
    }
```
```new
    fn vad(&self) -> VadFactory {
        let path = self.vad_model();
        Box::new(move || Ok(Box::new(SileroVad::load(&path)?) as _))
    }

    fn capture(&self, plan: &CapturePlan, on_event: OnEvent) -> Box<dyn FrameSource> {
        // Chế độ trộn: bộ nhường lời có Silero riêng (spec 2026-10-24-nguon-micro mục 17). `start_with` gọi `manager()` (nạp
        // `live`) trước khi mở nguồn, nên đường dẫn đã có.
        let model = Some(self.vad_model()).filter(|p| !p.as_os_str().is_empty());
        Box::new(LiveCapture::open(plan.clone(), on_event, model))
    }
```

Kiểm thứ tự trong `start_with`: Run `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && grep -n "manager()\|deps.capture(&plan\|ensure_started" src-tauri/src/session.rs | head`. Expected: lần gọi tạo `live` (qua `manager`/`ensure_started`) nằm trước `session.deps.capture(&plan`. Nếu không, dừng và báo.

- [ ] **Step 6: Test xanh, clippy hai nền tảng**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib 2>&1 | grep -E "test result|FAILED|panicked" | tail -3 && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -2 && sh scripts/check-windows.sh 2>&1 | tail -2`
Expected: mọi test đạt (kể cả hai test mới); clippy macOS và Windows sạch.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add src-tauri/src/capture.rs src-tauri/src/session.rs && git commit -m "feat(capture): chế độ trộn tắt micro khi âm thanh máy có tiếng nói (Silero riêng, nạp lười trên luồng VAD)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `mix-eval` — tùy chọn `speech_prob`

**Files:** Modify `crates/latency-bench/src/mix_eval.rs`

- [ ] **Step 1: Test hỏng trước (cuối `mod tests`)**

```rust
    /// `gate.speech_prob` với bộ phát hiện: âm thanh máy nhỏ có tiếng nói làm micro tắt (spec mục 17).
    #[test]
    fn a_speech_threshold_mutes_the_mic_under_quiet_speech() {
        struct Always;
        impl SpeechDetector for Always {
            fn prob(&mut self, _: &[f32]) -> anyhow::Result<f32> {
                Ok(1.0)
            }
            fn reset(&mut self) -> anyhow::Result<()> {
                Ok(())
            }
        }
        let v = variant(
            r#"{"name": "x", "mode": "both", "highpass": false,
                "gate": {"threshold_dbfs": -55, "duck_db": null, "hold_ms": 300, "speech_prob": 0.5}}"#,
        );
        assert_eq!(v.gate.unwrap().speech_prob, Some(0.5));
        let (asr, _) = build_views_with(&v, &[0.0008; 2_000], &[0.3; 2_000], &[0.3; 2_000], Some(&mut Always as &mut dyn SpeechDetector));
        assert!((asr[1_000] - 0.0008).abs() < 1e-6, "{}", asr[1_000]);
        let (asr, _) = build_views(&v, &[0.0008; 2_000], &[0.3; 2_000], &[0.3; 2_000]);
        assert!((asr[1_000] - 0.3008).abs() < 1e-6, "không có bộ phát hiện: {}", asr[1_000]);
    }
```

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p latency-bench --lib mix_eval 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch.

- [ ] **Step 2: Mã**

```old
use audio_capture::duck::{DuckingMixer, GateParams};
```
```new
use audio_capture::duck::{DuckingMixer, GateParams, SpeechDetector};
```

```old
    pub duck_db: Option<f32>,
    pub hold_ms: u32,
}
```
```new
    pub duck_db: Option<f32>,
    pub hold_ms: u32,
    /// Ngưỡng xác suất tiếng nói của Silero trên âm thanh máy (spec mục 17); không có thì chỉ theo năng lượng.
    #[serde(default)]
    pub speech_prob: Option<f32>,
}

/// Silero VAD làm bộ phát hiện tiếng nói của bộ nhường lời, như app (`src-tauri/src/capture.rs`).
struct SileroSpeech(SileroVad);

impl SpeechDetector for SileroSpeech {
    fn prob(&mut self, frame: &[f32]) -> anyhow::Result<f32> {
        self.0.prob(frame)
    }

    fn reset(&mut self) -> anyhow::Result<()> {
        self.0.reset()
    }
}
```

```old
/// Luồng cho whisper và luồng cho VAD của một phương án, cùng độ dài.
pub fn build_views(v: &Variant, playback: &[f32], mic: &[f32], mic_vad: &[f32]) -> (Vec<f32>, Vec<f32>) {
```
```new
/// Luồng cho whisper và luồng cho VAD của một phương án, cùng độ dài.
pub fn build_views(v: &Variant, playback: &[f32], mic: &[f32], mic_vad: &[f32]) -> (Vec<f32>, Vec<f32>) {
    build_views_with(v, playback, mic, mic_vad, None)
}

/// Như [`build_views`], có bộ phát hiện tiếng nói cho cổng (chỉ dùng khi `gate.speech_prob` có giá trị).
pub fn build_views_with(
    v: &Variant,
    playback: &[f32],
    mic: &[f32],
    mic_vad: &[f32],
    speech: Option<&mut dyn SpeechDetector>,
) -> (Vec<f32>, Vec<f32>) {
```

```old
            let params = v.gate.map_or(GateParams::OFF, |g| GateParams {
                threshold_dbfs: g.threshold_dbfs,
                duck_db: g.duck_db.unwrap_or(f32::NEG_INFINITY),
                hold_ms: g.hold_ms,
            });
            // Offline: ghép theo chỉ số, không phát riêng phần dư giữa chừng.
            let mut mixer = DuckingMixer::new(params, usize::MAX);
            mixer.push_playback(playback);
            mixer.push_mic(&mic, &mic_vad);
            let (mut asr, mut vad) = (Vec::new(), Vec::new());
            mixer.flush_into(&mut asr, &mut vad);
            (asr, vad)
```
```new
            let params = v.gate.map_or(GateParams::OFF, |g| GateParams {
                threshold_dbfs: g.threshold_dbfs,
                duck_db: g.duck_db.unwrap_or(f32::NEG_INFINITY),
                hold_ms: g.hold_ms,
                speech_prob: g.speech_prob.unwrap_or(f32::INFINITY),
            });
            // Offline: ghép theo chỉ số, không phát riêng phần dư giữa chừng.
            let mut mixer = DuckingMixer::new(params, usize::MAX);
            mixer.push_playback(playback);
            mixer.push_mic(&mic, &mic_vad);
            let (mut asr, mut vad) = (Vec::new(), Vec::new());
            mixer.flush_into_with(&mut asr, &mut vad, speech);
            if let Some(e) = mixer.take_speech_error() {
                eprintln!("{}: bộ phát hiện tiếng nói lỗi: {e}", v.name);
            }
            (asr, vad)
```

Trong `run`:

```old
        let (asr_view, vad_view) = build_views(v, &playback, &mic, &mic_vad);
```
```new
        let mut speech = match v.gate.and_then(|g| g.speech_prob) {
            Some(_) => Some(SileroSpeech(SileroVad::load(&args.vad_model)?)),
            None => None,
        };
        let (asr_view, vad_view) = build_views_with(
            v,
            &playback,
            &mic,
            &mic_vad,
            speech.as_mut().map(|s| s as &mut dyn SpeechDetector),
        );
```

- [ ] **Step 3: Test xanh, clippy, build release**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p latency-bench --lib 2>&1 | grep -E "test result|FAILED" && cargo clippy -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1 && cargo build --release --locked -p latency-bench 2>&1 | tail -1 && MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p asr-worker --features metal,shared-encode 2>&1 | tail -1 && otool -L target/release/asr-worker | grep -c Metal`
Expected: test đạt, clippy sạch, hai `Finished`, số cuối ≥ 1.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add crates/latency-bench/src/mix_eval.rs && git commit -m "feat(bench): mix-eval đo cổng nhường lời có Silero (gate.speech_prob)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Spec chính §6.2

**Files:** Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

- [ ] **Step 1: Sửa câu nhường lời**

```old
Chế độ Âm thanh máy + Micro trộn trước VAD bằng `DuckingMixer`: âm thanh máy vượt −55 dBFS thì micro bị hạ −30 dB, giữ 300 ms. Không khử vọng (AEC).
```
```new
Chế độ Âm thanh máy + Micro trộn trước VAD bằng `DuckingMixer`: micro bị tắt khi khung âm thanh máy từ −55 dBFS, hoặc khi một Silero VAD riêng nghe âm thanh máy cho xác suất có tiếng nói từ 0,5 (người online nói nhỏ); giữ 300 ms. Không đệm hay trễ thêm. Không khử vọng (AEC) (spec nguồn micro §17).
```

- [ ] **Step 2: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs(spec): spec chính §6.2 ghi cổng nhường lời theo tiếng nói" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Đo offline — A-trộn, A-nhỏ, A-ảo, tái hiện A7

**Files:** Create `bench/2026-10-24-nguon-micro/variants/both-loi-noi.json`, `bench/2026-10-24-nguon-micro/results/loi-noi.md`

Không phát tiếng. Dữ liệu có sẵn trong `bench/2026-10-24-nguon-micro/data/scenes/`: `s1-loa`, `s2-loa` (A-trộn), `nen-h10` / `h20` / `h30` / `h36` (giọng online −36 / −46 / −56 / −62 dBFS trên tiếng nền phòng), `ao-tron-can` (A-ảo trộn), `he-thong-mic` (tái hiện A7, không có lịch clip).

- [ ] **Step 1: Phương án**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cat > bench/2026-10-24-nguon-micro/variants/both-loi-noi.json <<'EOF'
[
 {"name": "CU", "mode": "both", "limiter": true, "vad_tanh": true, "mic_vad": "mic-rnnoise.wav",
  "gate": {"threshold_dbfs": -55, "duck_db": -30, "hold_ms": 300},
  "vad": {"threshold": 0.5, "min_speech_ms": 600, "end_silence_ms": 500}},
 {"name": "TAT", "mode": "both", "limiter": true, "vad_tanh": true, "mic_vad": "mic-rnnoise.wav",
  "gate": {"threshold_dbfs": -55, "duck_db": null, "hold_ms": 300},
  "vad": {"threshold": 0.5, "min_speech_ms": 600, "end_silence_ms": 500}},
 {"name": "LOINOI", "mode": "both", "limiter": true, "vad_tanh": true, "mic_vad": "mic-rnnoise.wav",
  "gate": {"threshold_dbfs": -55, "duck_db": null, "hold_ms": 300, "speech_prob": 0.5},
  "vad": {"threshold": 0.5, "min_speech_ms": 600, "end_silence_ms": 500}},
 {"name": "PB-app", "mode": "playback", "vad": {"threshold": 0.5, "min_speech_ms": 250, "end_silence_ms": 50}}
]
EOF
```
`CU` là cách cũ (mục 16), `TAT` chỉ đổi sang tắt hẳn, `LOINOI` là cách mới của app, `PB-app` là mốc chế độ Âm thanh máy.

- [ ] **Step 2: Chạy (nền, khoảng 30–40 phút)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && W=$PWD M=/Users/dtphong/Desktop/software_business/ai-translator B=$PWD/bench/2026-10-24-nguon-micro D=$B/data; for s in s1-loa s2-loa nen-h10 nen-h20 nen-h30 nen-h36 ao-tron-can he-thong-mic; do $W/target/release/latency-bench mix-eval --scene $D/scenes/$s --variants $B/variants/both-loi-noi.json --asr-worker $W/target/release/asr-worker --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --vad-model $M/models/silero_vad_v6.2.3.onnx --out $D/results/$s/loi-noi > $D/results/$s-loi-noi.log 2>&1; echo "$s xong"; done
```
Chạy bằng `run_in_background`, chờ thông báo. Sau đó `grep -L "Metal total size" $D/results/*/loi-noi/asr-worker.log` phải không in gì.

- [ ] **Step 3: Chấm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/bench/2026-10-24-nguon-micro && for s in s1-loa s2-loa nen-h10 nen-h20 nen-h30 nen-h36 ao-tron-can; do echo "== $s"; uv run --no-project --python 3.12 --with numpy==2.5.4 --with jiwer==4.0.0 --with opencc==1.4.2 python score_mix.py --scene data/scenes/$s --results data/results/$s/loi-noi 2>&1 | grep -E '^\| (Phương án|CU|TAT|LOINOI|PB-app) \|'; done; for v in CU LOINOI; do echo "== he-thong-mic $v"; python3 -c "
import json
for l in open('data/results/he-thong-mic/loi-noi/$v.jsonl'):
    x=json.loads(l); print(x['start_ms'], x['verdict'], x['text'][:90])"; done
```

Đạt (spec mục 17), với `LOINOI`:

| Tiêu chí | Cảnh | Mức đạt |
|---|---|---|
| A-trộn | `s1-loa` | online ≤ 10,78%, trong phòng ≤ 5,72% |
| A-trộn (báo cáo) | `s2-loa` | so với `CU` (mục 16 đo: 23,4% / 76,0% / giữ 26,7%) |
| A-nhỏ | `nen-h30`, `nen-h36` | lỗi ≤ `PB-app` cùng cảnh × 1,10 |
| A-nhỏ | `nen-h10`, `nen-h20` | lỗi ≤ `CU` cùng cảnh × 1,10 |
| A-ảo | `ao-tron-can` | 0 câu ảo; lỗi ≤ 5,2% × 1,10 |
| Tái hiện A7 | `he-thong-mic` | `LOINOI` chép đúng câu mẫu ("…plotting analysis will be posted to a public website.") ở các đoạn có tiếng; `CU` sai như trước |

Tiêu chí nào không đạt: **dừng**, ghi số, báo chủ dự án (đừng tự chỉnh ngưỡng).

- [ ] **Step 4: Biên bản**

Tạo `bench/2026-10-24-nguon-micro/results/loi-noi.md`:

```markdown
# Nhường lời theo tiếng nói của âm thanh máy: đo offline (2026-10-25)

Spec nguồn micro mục 17; kế hoạch `docs/superpowers/plans/2026-10-25-nguon-micro-05-nhuong-loi-theo-tieng-noi.md`, Task 5.
Commit `<mã>`. M4 Pro, macOS 26.6.2, `asr-worker` có Metal, gói Chuẩn, phương án `variants/both-loi-noi.json`.

| Cảnh | Ý nghĩa | CU (mục 16) | TAT | LOINOI (app) | PB-app | Đạt? |
|---|---|---|---|---|---|---|
| … một dòng mỗi cảnh, cột lỗi online / trong phòng / câu ảo như `score_mix.py` in … |

Tái hiện A7 (`he-thong-mic`): `CU` …; `LOINOI` ….

Kết luận: …
```

Điền số thật. Thêm một dòng tóm tắt và đường dẫn vào `results/nghiem-thu.md` (mục mới "Nhường lời theo tiếng nói (kế hoạch 05)").

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add bench/2026-10-24-nguon-micro/variants/both-loi-noi.json bench/2026-10-24-nguon-micro/results/loi-noi.md bench/2026-10-24-nguon-micro/results/nghiem-thu.md && git commit -m "docs(bench): đo offline nhường lời theo tiếng nói (A-trộn, A-nhỏ, A-ảo, tái hiện A7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Thử trên app thật — A2 và tình huống A7 (phát tiếng qua loa)

**Files:** Modify `bench/2026-10-24-nguon-micro/results/loi-noi.md`, `bench/2026-10-24-nguon-micro/results/nghiem-thu.md`

**Hỏi chủ dự án trước** (phát tiếng qua loa khoảng 5 phút, mở micro, điều khiển chuột). Dùng bản dev (`scripts/run-dev-app.sh`, ký "Apple Development"), cách làm và script như Task 8 của kế hoạch 04: `chay-a2.sh` và `OnlinePlayer.app` trong scratchpad. Sao lưu `settings.json`, thoát bản đã cài trước khi chạy, trả máy sau khi xong.

- [ ] **Step 1: A2 (chế độ trộn, nguồn "Chỉ OnlinePlayer", 100 giây đầu `online.wav` của `s1-luot`)**

Đặt `captureMode: both`, nguồn `{"kind":"app","bundleId":"com.aitranslator.test.onlineplayer"}`. Chạy `chay-a2.sh <toạ độ Bắt đầu> <toạ độ Dừng>` (lấy toạ độ bằng ảnh chụp màn hình). Đọc dòng "kết thúc phiên dịch" và "số liệu thu".

Đạt:
- tổng p50 ≤ 1 076 ms (1 056 + 20);
- nhận dạng p50 và dịch p50 trong khoảng ±30 ms của lượt A2 cũ (236 ms, 487 ms);
- dòng "số liệu thu" có `micro bị hạ` > 0;
- không có dòng "nhường lời: không nạp được VAD".

- [ ] **Step 2: Tình huống A7 (nguồn toàn hệ thống, câu mẫu −65 dBFS)**

Đặt nguồn `{"kind":"system"}`, vẫn chế độ trộn. Phát `public/listen-test-en.wav` lặp lại (cách 1 giây) qua loa 60% trong khoảng 60 giây; Bắt đầu, rồi Dừng. Xem bản chép lời (màn Bản chép lời, nút Sao chép tất cả, rồi `pbpaste`; trả lại clipboard cũ sau đó).

Đạt:
- phần lớn câu là "The result(s) of plotting analysis will be posted to a public website.", không còn chuỗi "Thank you.";
- `micro bị hạ` > 0.

- [ ] **Step 3: Trả máy, ghi kết quả, commit**

Thoát bản dev (Vite và tiến trình phụ tắt theo), khôi phục `settings.json`, đưa quyền micro về "chưa hỏi" (`tccutil reset Microphone com.aitranslator.desktop`), âm lượng về mức cũ, mở lại bản đã cài.

Ghi hai bảng (A2, A7) vào `loi-noi.md` và dòng tóm tắt vào `nghiem-thu.md`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add bench/2026-10-24-nguon-micro/results/loi-noi.md bench/2026-10-24-nguon-micro/results/nghiem-thu.md && git commit -m "docs(bench): A2 và tình huống A7 với nhường lời theo tiếng nói" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kiểm cuối và quay lại kế hoạch 04

- [ ] **Step 1: Toàn bộ test và clippy**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test --workspace 2>&1 | grep -E "^test result|FAILED|panicked" | grep -v "ok\." | head; cargo test --workspace 2>&1 | grep -c "^test result: ok"; cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -1; sh scripts/check-windows.sh 2>&1 | tail -1; pnpm exec vitest run 2>&1 | tail -3
```
Expected: không dòng lỗi nào; clippy hai nền tảng sạch; JS đạt.

- [ ] **Step 2: Memory**

Sửa `~/.claude/projects/-Users-dtphong-Desktop-software-business-ai-translator/memory/nguon-micro-2026-10-24.md` và dòng của nó trong `MEMORY.md`: kế hoạch 05 xong (commit, kết quả chính). Tiếp theo là Task 10–12 của kế hoạch 04. Windows (Task 10 của kế hoạch 04) phải đo thêm chi phí Silero của bộ nhường lời trên i5: p95 ≤ 2 ms mỗi khung, đọc thời gian bằng một example tạm như cách đo M4 Pro ở spec mục 17.

- [ ] **Step 3: Báo chủ dự án**

Tóm tắt: số A-trộn, A-nhỏ, A-ảo, A2, tình huống A7. Rồi hỏi tiếp về Windows (Task 10 của kế hoạch 04).
