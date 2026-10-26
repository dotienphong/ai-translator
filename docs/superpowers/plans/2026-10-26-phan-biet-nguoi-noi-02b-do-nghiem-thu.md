# Phân biệt người nói, kế hoạch 02b: đo, đóng gói, bảo mật, tổng kết

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Chủ dự án chưa cho phép commit cho tính năng này. Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng bước "Mốc kiểm" (`git status --short` chỉ để đối chiếu). Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`. Chỉ commit khi chủ dự án nói rõ.

**Phụ thuộc:** chạy **sau** `2026-10-26-phan-biet-nguoi-noi-02-worker-pipeline.md` (Task 0–19 xong, Task 19 Step 1–3 đạt). File này dùng `pipeline::speaker_client`, binary `speaker-worker`, `Engine::start_with_speaker` và `SessionMetrics::speaker_*` mà file 02 tạo. Quy ước (`W`, `M`, `DATA`, `B`, `CARGO_TARGET_DIR=$W/target`, `cd $W &&`, kiểm đĩa ≥ 22 GB trước build nặng, không đụng Teams, Chrome, âm lượng, micro) như file 02. **Mọi lệnh `cargo build --release` trên macOS đặt `MACOSX_DEPLOYMENT_TARGET=14.2`** như `scripts/release/build-sidecars-macos.sh` (file 02 cũng vậy): binary đo giống binary phát hành (macOS tối thiểu 14.2, `release-check.mjs deps-macos` kiểm được), và `target/release` không bị build lại vì đổi biến.

**Goal:** đo nhận giọng trên code thật qua worker thật (A-spk1, A-spk2), đo độ trễ xen kẽ bật/tắt (A-spk4), soak test ≥ 1 giờ có vết RSS cùng `asr-worker` và `llama-server` (A-spk5 phần worker), đóng gói `speaker-worker` vào gói app, thêm kiểm tra bảo mật vào CI, chuẩn bị đo trên Windows i5, rồi tổng kết và xin duyệt trước kế hoạch 03.

**Architecture:** `latency-bench speaker-eval --worker` cắt đoạn như app rồi gửi từng đoạn (tối đa 4 s đầu, thời lượng thật) cho `speaker-worker` qua `speaker_client`, ghi cùng định dạng JSONL để `score_spk.py` chấm. `latency-bench session --speaker-worker --speaker-model` chạy đúng `Engine::start_with_speaker` với `asr-worker`, `llama-server` thật; `--rss-trace` ghi RSS của các tiến trình phụ mỗi 5 s. Đóng gói theo đúng đường của `asr-worker` (`externalBin`, script dựng và ký, bảng SHA-256). CI thêm script kiểm cây phụ thuộc không có mã mạng.

**Tech Stack:** như file 02; `sysinfo` 0.39.6 (đã có trong `latency-bench`); Python 3.12 trong `$DATA/venv` (`score_spk.py`); `ffmpeg` (Homebrew); `swiftc` cho `$B/tro-nang/rus.swift`; mingw-w64 (`x86_64-w64-mingw32-gcc`, đã cài) cho gói Windows.

**Kết quả đo** ghi ở `$B/results/02-*.md`: `02-nhan-giong-worker.md` (Task 2), `02-do-tre.md` (Task 4), `02-soak.md` (Task 5), `02-windows.md` (Task 8), `02-tong-hop.md` (Task 9). Dữ liệu thô (JSONL, JSON của `session`, vết RSS) ở `$DATA/out/02/` (ngoài repo).

---

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `crates/latency-bench/src/speaker_eval.rs` | chế độ `--worker`: cắt đoạn như app, gửi qua `speaker_client`, đo khứ hồi, RSS, CPU của worker |
| Sửa `crates/latency-bench/src/session.rs` | cờ `--speaker-worker`, `--speaker-model`, `--rss-trace`; số đo nhận giọng trong `run` |
| Sửa `crates/latency-bench/src/main.rs` (chú thích) | nhắc chế độ mới |
| Sửa `scripts/copy-sidecars.sh`, `scripts/release/{build-sidecars-macos.sh, package-macos.sh, build-sidecars-windows.mjs, package-windows.mjs, windows.test.mjs, check-release-config.sh, notices.mjs}`, `src-tauri/release/{tauri.macos.json, tauri.windows.json}` | đóng gói và ký `speaker-worker` như `asr-worker` |
| Tạo `scripts/release/check-no-network.sh`; sửa `.github/workflows/ci.yml`, `scripts/check-windows.sh` | CI: không mã mạng trong worker; clippy Windows cho hai crate mới |
| Tạo `$B/results/02-{nhan-giong-worker,do-tre,soak,windows,tong-hop}.md`; sửa `$B/README.md` | kết quả, cách chạy lại |
| Sửa `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` | ghi số chốt "(chốt ở kế hoạch 02, …)" |

---

### Task 0: Mốc và bản dựng để đo

**Files:** không

- [ ] **Step 1: Phần 02 đã xong**

Run: `cd $W && git branch --show-current && df -h . | tail -1 && CARGO_TARGET_DIR=$W/target cargo test -p speaker-protocol -p speaker-worker -p pipeline -p latency-bench 2>&1 | grep -E "^test result|FAILED" | sort | uniq -c`
Expected: `phan-biet-nguoi-noi`; ≥ 22 GB trống; mọi dòng `ok`.

- [ ] **Step 2: Bản release để đo (build nặng)**

Run: `cd $W && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release -p speaker-worker -p latency-bench 2>&1 | tail -1 && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release -p asr-worker --features metal,shared-encode 2>&1 | tail -1 && ls -l target/release/speaker-worker target/release/latency-bench target/release/asr-worker && otool -l target/release/speaker-worker | grep -A4 LC_BUILD_VERSION | grep minos && ls $M/tools/llama-b11669/macos-arm64/llama-b11669/llama-server $M/models/ggml-large-v3-turbo-q5_0.bin $M/models/Hy-MT2-1.8B-Q8_0.gguf $M/bench/phase0/data/latency/en.wav $M/bench/phase0/data/latency/mixed.wav`
Expected: `Finished` hai lần; `minos 14.2`; đủ file. `asr-worker` phải là bản `metal,shared-encode` (bản CPU làm số đo lệch xa, ghi chú của dự án ngày 2026-10-24).

- [ ] **Step 3: Thư mục kết quả thô**

Run: `mkdir -p $DATA/out/02/{ami,vi,a-spk4,soak} && ls $DATA/out/02`
Expected: `a-spk4 ami soak vi`.

---

### Task 1: `latency-bench speaker-eval --worker`

**Files:**
- Sửa: `crates/latency-bench/Cargo.toml` (thêm `speaker-protocol`)
- Sửa: `crates/latency-bench/src/speaker_eval.rs` (`SpeakerEvalArgs`; `run`; tách `cut` khỏi `embed_all`; thêm `speaker_config`, `worker_eval`, `WorkerUsage`, `relabel`; test)
- Sửa: `crates/latency-bench/src/main.rs` (chú thích của `SpeakerEval`)

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `speaker_eval.rs`:

```rust
    #[test]
    fn worker_mode_needs_a_wav_and_conflicts_with_in_process_flags() {
        assert!(try_parse(&["--wav", "a.wav", "--worker", "w"]).is_ok());
        for extra in [
            &["--embeddings-out", "x.emb.json"][..],
            &["--window-s", "2"],
            &["--max-embed-s", "4"],
            &["--embed-from", "middle"],
            &["--max-embed-s", "4", "--embed-from", "middle"],
        ] {
            let mut args = vec!["--wav", "a.wav", "--worker", "w"];
            args.extend(extra);
            assert!(try_parse(&args).is_err(), "{extra:?}");
        }
        assert!(try_parse(&["--embeddings-in", "x.emb.json", "--worker", "w"]).is_err());
    }

    /// `Merged` của worker đổi nhãn các đoạn trước, như giao diện sẽ làm (và như `label_segments` của chế độ trong tiến trình).
    #[test]
    fn merges_relabel_earlier_rows() {
        let row = |voice| WorkerRow {
            start_ms: 0,
            end_ms: 1_000,
            voice,
            confidence: 1.0,
            round_ms: 1.0,
        };
        let mut rows = vec![row(Some(1)), row(Some(2)), row(None), row(Some(2))];
        relabel(&mut rows, 2, 1);
        assert_eq!(
            rows.iter().map(|r| r.voice).collect::<Vec<_>>(),
            [Some(1), Some(1), None, Some(1)]
        );
    }

    #[test]
    fn the_config_takes_the_threshold_flags() {
        let args = try_parse(&["--wav", "a.wav", "--theta", "0.4", "--merge-theta", "1.1"]).unwrap();
        let c = speaker_config(&args);
        assert_eq!((c.theta, c.merge_theta), (0.4, 1.1));
        assert_eq!(c.min_new_ms, SpeakerConfig::default().min_new_ms);
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p latency-bench speaker_eval 2>&1 | grep -E "^error" | head -3`
Expected: không có trường `worker`, không tìm thấy `WorkerRow`, `relabel`, `speaker_config`.

- [ ] **Step 3: Viết mã**

`crates/latency-bench/Cargo.toml`, thêm vào `[dependencies]` (cạnh `speaker-worker`):

```toml
speaker-protocol = { path = "../speaker-protocol" }
```

`speaker_eval.rs`:
- Chú thích đầu file thêm câu: "`--worker` chạy nhận giọng bằng tiến trình `speaker-worker` thật (giao thức, B', A2 4 s đầu) qua `pipeline::speaker_client`, như app (kế hoạch 02b): kết quả, thời gian khứ hồi, RSS và CPU là của worker."
- Thêm vào `use`:
  ```rust
  use std::sync::Arc;
  use std::sync::atomic::{AtomicBool, Ordering};
  use std::time::Duration;

  use pipeline::speaker::SpeakerUpdate;
  use pipeline::speaker_client::{self, SpeakerLaunch};
  use speaker_protocol::{MAX_EMBED_SAMPLES, SegmentAudio, Source, pcm_from_f32};
  use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
  ```
- Thêm trường cuối vào `SpeakerEvalArgs`:
  ```rust
      /// Nhận giọng bằng tiến trình `speaker-worker` thật (đường dẫn binary) thay vì trong tiến trình này: mỗi đoạn gửi tối đa 4 s
      /// đầu phần tiếng nói kèm thời lượng thật, như app. Cần `--wav`, `--vad-model`, `--speaker-model`.
      /// `embed_from` phải có trong danh sách: clap bỏ qua `requires = "max_embed_s"` của nó khi `--max-embed-s` xung đột với cờ
      /// đang có (như ghi chú ở `embed_from`); giá trị mặc định của `--embed-from` không tính là có cờ.
      #[arg(long, conflicts_with_all = ["embeddings_in", "embeddings_out", "window_s", "max_embed_s", "embed_from"])]
      worker: Option<PathBuf>,
  ```
- Thêm hàm, rồi trong `run` thay khối dựng `cfg` (từ `let mut cfg = SpeakerConfig::default();` tới hết `if let Some(v) = args.min_new_ms { … }`) bằng `let cfg = speaker_config(&args);`, và thêm ngay đầu `run`:
  ```rust
      if let Some(worker) = &args.worker {
          return worker_eval(&args, worker);
      }
  ```
  ```rust
  /// Ngưỡng của lượt chạy: mặc định của app, đè bằng các cờ.
  fn speaker_config(args: &SpeakerEvalArgs) -> SpeakerConfig {
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
      cfg
  }
  ```
- Tách phần đọc WAV, VAD, `Segmenter` của `embed_all` ra hàm riêng, và để `embed_all` gọi nó:
  ```rust
  /// Đọc WAV và cắt đoạn đúng như app (`SileroVad` + `Segmenter`). Trả mẫu và ranh giới tiếng nói (ms) của từng đoạn.
  fn cut(args: &SpeakerEvalArgs) -> Result<(Vec<f32>, Vec<(u64, u64)>)> {
      let wav = args.wav.as_ref().context("thiếu --wav")?;
      let (samples, rate) = crate::wavio::read_wav_mono(wav)?;
      ensure!(rate == 16_000, "{}: cần WAV 16 kHz, nhận {rate} Hz", wav.display());
      let mut vad = SileroVad::load(args.vad_model.as_ref().context("thiếu --vad-model")?)?;
      let config = PipelineConfig::default();
      let mut segmenter = Segmenter::new(SegmenterConfig {
          end_silence_ms: args.end_silence_ms,
          ..config.segmenter.clone()
      });
      let mut bounds = Vec::new();
      for frame in samples.as_chunks::<FRAME_SAMPLES>().0 {
          let p = vad.prob(frame)?;
          bounds.extend(segmenter.push(frame, p).into_iter().map(|s| (s.start_ms, s.end_ms)));
      }
      bounds.extend(segmenter.flush().map(|s| (s.start_ms, s.end_ms)));
      Ok((samples, bounds))
  }
  ```
  Trong `embed_all`, thay đoạn từ `let wav = args.wav.as_ref()…` tới hết `bounds.extend(segmenter.flush()…);` bằng:
  ```rust
      let (samples, bounds) = cut(args)?;
      let embedder = Embedder::load(args.speaker_model.as_ref().context("thiếu --speaker-model")?)?;
  ```
- Thêm chế độ worker (sau `embed_all`):
  ```rust
  /// Một đoạn qua worker: ranh giới, nhãn, độ tin, thời gian khứ hồi (gửi `Segment` tới lúc nhận `Assign`, gồm nhúng).
  struct WorkerRow {
      start_ms: u64,
      end_ms: u64,
      voice: Option<u32>,
      confidence: f32,
      round_ms: f64,
  }

  /// Hai giọng được gộp: nhãn của các đoạn trước đổi theo.
  fn relabel(rows: &mut [WorkerRow], from: u32, into: u32) {
      for r in rows.iter_mut().filter(|r| r.voice == Some(from)) {
          r.voice = Some(into);
      }
  }

  /// RSS đỉnh (MB, 10^6 byte) và CPU (ms) của một tiến trình từ lúc bắt đầu tới lúc dừng đo, lấy mẫu mỗi 100 ms bằng `sysinfo`
  /// (macOS, Windows).
  struct WorkerUsage {
      stop: Arc<AtomicBool>,
      thread: std::thread::JoinHandle<(f64, u64)>,
  }

  impl WorkerUsage {
      fn start(pid: u32) -> Self {
          let stop = Arc::new(AtomicBool::new(false));
          let flag = stop.clone();
          let thread = std::thread::spawn(move || {
              let (mut sys, pid) = (System::new(), Pid::from_u32(pid));
              let kind = ProcessRefreshKind::nothing().with_memory().with_cpu();
              let (mut peak, mut first, mut last) = (0.0f64, None, 0u64);
              loop {
                  sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), false, kind);
                  if let Some(p) = sys.process(pid) {
                      peak = peak.max(p.memory() as f64 / 1e6);
                      last = p.accumulated_cpu_time();
                      first.get_or_insert(last);
                  }
                  if flag.load(Ordering::SeqCst) {
                      break;
                  }
                  std::thread::sleep(Duration::from_millis(100));
              }
              (peak, last.saturating_sub(first.unwrap_or(last)))
          });
          Self { stop, thread }
      }

      fn stop(self) -> (f64, u64) {
          self.stop.store(true, Ordering::SeqCst);
          self.thread.join().unwrap_or((0.0, 0))
      }
  }

  /// Chế độ `--worker`: mỗi đoạn gửi tuần tự (chờ `Assign` rồi mới gửi đoạn sau, nên không bao giờ quá tải), ghi JSONL như chế độ
  /// trong tiến trình (`embed_ms` là thời gian khứ hồi).
  fn worker_eval(args: &SpeakerEvalArgs, worker: &Path) -> Result<()> {
      let (samples, bounds) = cut(args)?;
      let model = args.speaker_model.as_ref().context("thiếu --speaker-model")?;
      let log = args.out.with_extension("speaker-worker.log");
      // `SpeakerLaunch::new` đổi đường dẫn tương đối (như `target/release/speaker-worker`) sang tuyệt đối: worker chạy trong thư mục
      // của binary (file 02 Task 13).
      let mut launch = SpeakerLaunch::new(worker, model, &log, speaker_config(args));
      launch.overload_after = Duration::from_secs(3_600);
      let (link, handle) = speaker_client::start(launch, Box::new(|_| Ok(())));
      ensure!(
          handle.wait_ready(Duration::from_secs(60)),
          "speaker-worker không sẵn sàng: {:?}",
          handle.disabled()
      );
      let usage = WorkerUsage::start(handle.pid().context("không có pid của speaker-worker")?);
      let mut rows: Vec<WorkerRow> = Vec::with_capacity(bounds.len());
      for (i, &(start_ms, end_ms)) in bounds.iter().enumerate() {
          let a = ((start_ms * 16) as usize).min(samples.len());
          let b = ((end_ms * 16) as usize).min(samples.len());
          let speech = &samples[a..b];
          let t0 = Instant::now();
          link.segments
              .send(SegmentAudio {
                  segment_id: i as u64,
                  start_ms,
                  end_ms,
                  source: Source::System,
                  pcm: pcm_from_f32(&speech[..speech.len().min(MAX_EMBED_SAMPLES)]),
              })
              .context("speaker-worker đã tắt")?;
          loop {
              match link
                  .updates
                  .recv_timeout(Duration::from_secs(30))
                  .context("speaker-worker không trả lời")?
              {
                  SpeakerUpdate::Assign {
                      segment_id,
                      voice,
                      confidence,
                  } if segment_id == i as u64 => {
                      rows.push(WorkerRow {
                          start_ms,
                          end_ms,
                          voice,
                          confidence,
                          round_ms: t0.elapsed().as_secs_f64() * 1000.0,
                      });
                      break;
                  }
                  SpeakerUpdate::Merged { from, into } => relabel(&mut rows, from, into),
                  _ => {}
              }
          }
      }
      // `Merged` tới sau `Assign` của đoạn cuối: áp nốt (worker gửi chúng ngay sau `Assign`; 200 ms không có gì thì thôi).
      while let Ok(update) = link.updates.recv_timeout(Duration::from_millis(200)) {
          if let SpeakerUpdate::Merged { from, into } = update {
              relabel(&mut rows, from, into);
          }
      }
      let (peak_mb, cpu_ms) = usage.stop();
      // Worker chết giữa lượt thì client chạy lại và cộng khoảng bù vào mã giọng: kết quả không so được với mốc, nên báo lỗi
      // thay vì ghi số lệch.
      ensure!(
          handle.starts() == 1 && handle.disabled().is_none(),
          "speaker-worker chạy lại hay tắt giữa lượt (chạy {} lần, {:?}): kết quả không dùng được",
          handle.starts(),
          handle.disabled()
      );
      drop(link);
      write_file(&args.out, "", |out| {
          for r in &rows {
              writeln!(
                  out,
                  "{}",
                  serde_json::json!({
                      "start_ms": r.start_ms, "end_ms": r.end_ms, "voice": r.voice,
                      "confidence": r.confidence, "embed_ms": r.round_ms,
                  })
              )?;
          }
          Ok(())
      })?;
      let min_ms = speaker_config(args).min_embed_ms;
      let embedded: Vec<&WorkerRow> = rows.iter().filter(|r| r.end_ms - r.start_ms >= min_ms).collect();
      let ms: Vec<f32> = embedded.iter().map(|r| r.round_ms as f32).collect();
      let speech_ms: u64 = embedded.iter().map(|r| r.end_ms - r.start_ms).sum();
      let mut voices: Vec<u32> = rows.iter().filter_map(|r| r.voice).collect();
      voices.sort_unstable();
      voices.dedup();
      println!(
          "{} đoạn, {} có nhúng, {} giọng; khứ hồi p50 {:.1} ms, p90 {:.1} ms; xong ≤ 230 ms: {}/{}; speaker-worker RSS đỉnh {:.1} MB, CPU {:.2}% một lõi so với thời lượng tiếng nói của các đoạn có nhúng",
          rows.len(),
          embedded.len(),
          voices.len(),
          percentile(&ms, 50.0).unwrap_or(0.0),
          percentile(&ms, 90.0).unwrap_or(0.0),
          ms.iter().filter(|&&m| m <= 230.0).count(),
          ms.len(),
          peak_mb,
          if speech_ms > 0 { cpu_ms as f64 / speech_ms as f64 * 100.0 } else { 0.0 },
      );
      Ok(())
  }
  ```
  `write_file`, `percentile`, `Instant`, `Path` đã có trong file.

`main.rs`, chú thích của biến thể `SpeakerEval` thành: `/// Nhận giọng người nói trên một bản ghi: cắt đoạn như app, nhúng (trong tiến trình hay qua speaker-worker thật), phân cụm (spec 2026-10-26-phan-biet-nguoi-noi §12).`

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p latency-bench 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, thêm 3 test.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p latency-bench && CARGO_TARGET_DIR=$W/target cargo clippy -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 2: A-spk1 và A-spk2 qua worker thật

**Files:**
- Tạo: `$B/results/02-nhan-giong-worker.md`

- [ ] **Step 1: Bản release mới của `latency-bench` (build nặng)**

Run: `cd $W && df -h . | tail -1 && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release -p latency-bench -p speaker-worker 2>&1 | tail -1`
Expected: `Finished`.

- [ ] **Step 2: AMI, 4 bản ghi kiểm (A-spk1)**

Run (khoảng 15–25 phút):

```sh
cd $W && VAD=$M/models/silero_vad_v6.2.3.onnx MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx && \
for n in IS1009a.Mix-Headset EN2002a.Mix-Headset IS1009a.Array1-01 ES2004a.Array1-01; do
  target/release/latency-bench speaker-eval --wav $DATA/ami/$n.wav --vad-model $VAD --speaker-model $MODEL \
    --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 --out $DATA/out/02/ami/$n.jsonl \
    | tee $DATA/out/02/ami/$n.summary.txt
  $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/02/ami/$n.jsonl $DATA/out/$n.rttm > $DATA/out/02/ami/$n.score.json
done; cat $DATA/out/02/ami/*.score.json
```

Expected: 4 dòng tóm tắt (khứ hồi, `xong ≤ 230 ms`, RSS đỉnh, CPU) và 4 dòng JSON điểm.

- [ ] **Step 3: Trung bình và so với kế hoạch 01**

Run: `cd $W && $DATA/venv/bin/python -I -c "import json,glob; s=[json.load(open(f)) for f in sorted(glob.glob('$DATA/out/02/ami/*.score.json'))]; print(len(s), round(100*sum(x['line_1s'] for x in s)/len(s),1), round(100*sum(x['line_all'] for x in s)/len(s),1), [x['voices'] for x in s])"`
Expected: `4 <≥1 s> <mọi dòng> [số giọng]`. **Mức đạt A-spk1:** trung bình dòng ≥ 1 s ≥ 85%, mọi dòng ≥ 80% (spec §12, chủ dự án chốt đọc theo trung bình). Mốc kế hoạch 01 cho cấu hình này (A2 4 s đầu, `results/ram.md`): 91,8% và 84,9%. Lệch quá 0,5 điểm so với mốc thì tìm nguyên nhân trước khi ghi (PCM 16 bit thay cho f32, thứ tự đoạn), ghi rõ trong file kết quả.

- [ ] **Step 4: Tiếng Việt, 8 bản ghi kiểm (A-spk2)**

Run:

```sh
cd $W && VAD=$M/models/silero_vad_v6.2.3.onnx MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx && \
for n in cv-vi-03 cv-vi-04 cv-vi-05 cv-vi-06 cv-vi-03-opus cv-vi-04-opus cv-vi-05-opus cv-vi-06-opus; do
  target/release/latency-bench speaker-eval --wav $DATA/out/vi/$n.wav --vad-model $VAD --speaker-model $MODEL \
    --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 --out $DATA/out/02/vi/$n.jsonl \
    | tee $DATA/out/02/vi/$n.summary.txt
  $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/02/vi/$n.jsonl $DATA/out/vi/$n.rttm > $DATA/out/02/vi/$n.score.json
done && $DATA/venv/bin/python -I -c "import json,glob; s=[json.load(open(f)) for f in sorted(glob.glob('$DATA/out/02/vi/*.score.json'))]; print(len(s), round(100*sum(x['line_1s'] for x in s)/len(s),1), [round(100*x['line_1s'],1) for x in s])"
```

Expected: `8 <trung bình ≥ 1 s> [8 số]`. **Mức đạt A-spk2:** trung bình dòng ≥ 1 s ≥ 85%. Mốc kế hoạch 01 (nhúng cả đoạn, `results/nhan-giong-tieng-viet.md`): 93,9%; đây là lần đầu đo A2 4 s trên tiếng Việt.

- [ ] **Step 5: Ghi `$B/results/02-nhan-giong-worker.md`**

Nội dung: điều kiện (máy, macOS, commit nền `8ecbcf8a` cộng thay đổi chưa commit của kế hoạch 01–02, bản release, `RAYON_NUM_THREADS=2` do client đặt, θ 0,35, gộp 1,10, A2 4 s đầu, PCM 16 bit qua giao thức); bảng AMI (4 bản ghi: dòng ≥ 1 s, mọi dòng, thời lượng, số giọng; trung bình; so với "A2, 4 s đầu" của `ram.md`); bảng tiếng Việt (8 bản ghi; trung bình; so với nhúng cả đoạn của `nhan-giong-tieng-viet.md`); bảng tải của worker mỗi bản ghi (khứ hồi p50, p90, số đoạn xong ≤ 230 ms trên số đoạn có nhúng, RSS đỉnh, CPU % một lõi so với thời lượng tiếng nói) so với ngân sách RAM ≤ 250 MB, CPU ≤ 8% một lõi (spec §11); kết luận đạt/không đạt A-spk1, A-spk2; mục "Chạy lại" chép đúng các lệnh Step 2–4.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short bench/2026-10-26-nguoi-noi/results/`
Expected: `?? …/results/02-nhan-giong-worker.md` (thư mục `results/` có thể đang `??` cả thư mục từ kế hoạch 01). Không commit.

---

### Task 3: `latency-bench session` có nhận giọng và vết RSS

**Files:**
- Sửa: `crates/latency-bench/src/session.rs` (`SessionArgs` dòng 41–80; `TimedMt` (cờ `--mt-extra-ms` của kịch bản dịch quá tải); `sidecar_pids` dòng 302–321; `args_map`; `RunInfo` dòng 466–503; `run` dòng 515–640; thêm `spawn_rss_trace`, `speaker_counts`; test)

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `session.rs`:

`mod tests` đã có `struct Cli` (bọc `SessionArgs`) và `fn args(extra)` (dùng `Cli::parse_from`, panic khi lỗi); thêm bản trả lỗi
cạnh `args`, cùng bộ cờ gốc:

```rust
    fn try_args(extra: &[&str]) -> Result<SessionArgs, clap::Error> {
        let base = [
            "latency-bench",
            "--wav",
            "s.wav",
            "--truth",
            "s.truth.json",
            "--asr-worker",
            "bin/asr-worker",
            "--asr-model",
            "models/a.bin",
            "--llama-server",
            "bin/llama-server",
            "--mt-model",
            "models/m.gguf",
            "--out",
            "out/x.json",
        ];
        Cli::try_parse_from(base.iter().chain(extra)).map(|c| c.args)
    }

    #[test]
    fn the_speaker_flags_come_together() {
        assert!(args(&[]).speaker_worker.is_none());
        assert!(try_args(&["--speaker-worker", "s"]).is_err());
        assert!(try_args(&["--speaker-model", "e.onnx"]).is_err());
        let a = args(&["--speaker-worker", "s", "--speaker-model", "e.onnx", "--rss-trace", "t.tsv"]);
        assert_eq!(a.speaker_model.as_deref(), Some(Path::new("e.onnx")));
        assert_eq!(a.rss_trace.as_deref(), Some(Path::new("t.tsv")));
        assert_eq!(args_map(&a, Path::new("v.onnx"))["speaker_worker"], public_path(Path::new("s")));
        assert_eq!(args_map(&args(&[]), Path::new("v.onnx"))["speaker_worker"], "tắt");
    }

    #[test]
    fn speaker_counts_come_from_the_engine_metrics() {
        let metrics = SessionMetrics {
            speaker_assigns: 10,
            speaker_on_time: 8,
            speaker_late: 2,
            ..SessionMetrics::default()
        };
        assert_eq!(
            speaker_counts(&metrics, Some(pipeline::speaker_client::Disabled::Overload)),
            (10, 8, 2, Some("Overload".to_string()))
        );
        assert_eq!(speaker_counts(&SessionMetrics::default(), None), (0, 0, 0, None));
    }

    /// Mốc 230 ms của spec §4.4, §11, đo khi chạy cùng hai tiến trình phụ (`SpeakerHandle::round_trip_ms`).
    #[test]
    fn round_trips_are_summarized_against_230_ms() {
        let (p50, p90, within, total) = round_trip_stats(&[100.0, 200.0, 300.0]);
        assert_eq!((p50, within, total), (Some(200.0), 2, 3));
        assert!(p90.is_some_and(|v| v > 200.0 && v <= 300.0));
        assert_eq!(round_trip_stats(&[]), (None, None, 0, 0));
    }

    /// Kịch bản dịch quá tải (Task 4 Step 5, QĐ 12 của file 02): `--mt-extra-ms` cộng vào mỗi lần dịch; mặc định 0 (như app);
    /// ghi vào `args` của file kết quả.
    #[test]
    fn the_overload_flag_defaults_to_the_app_speed() {
        assert_eq!(args(&[]).mt_extra_ms, 0);
        let a = args(&["--mt-extra-ms", "2000"]);
        assert_eq!(a.mt_extra_ms, 2_000);
        assert_eq!(args_map(&a, Path::new("v.onnx"))["mt_extra_ms"], "2000");
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p latency-bench session 2>&1 | grep -E "^error" | head -3`
Expected: không có trường `speaker_worker`, `mt_extra_ms`, không tìm thấy `speaker_counts`, `round_trip_stats`.

- [ ] **Step 3: Viết mã**

`SessionArgs`, thêm sau `prompt`:

```rust
    /// `speaker-worker` (binary): bật nhận giọng như app (spec 2026-10-26-phan-biet-nguoi-noi §4.3). Không có thì tắt.
    #[arg(long, requires = "speaker_model")]
    pub speaker_worker: Option<PathBuf>,
    /// Model nhúng giọng (`eres2net-sv-en-voxceleb-16k.onnx`), đi cùng `--speaker-worker`.
    #[arg(long, requires = "speaker_worker")]
    pub speaker_model: Option<PathBuf>,
    /// Ghi RSS của các tiến trình phụ mỗi 5 s vào file TSV (soak test, spec §11, §14).
    #[arg(long)]
    pub rss_trace: Option<PathBuf>,
    /// Kịch bản dịch quá tải (Task 4 Step 5): chờ thêm chừng này ms trước mỗi lần dịch (kể cả lần làm nóng), để dịch chậm hơn
    /// lời nói trên máy nhanh. 0 = như app. Lượt có cờ này không dùng để so tải hay độ trễ A2.
    #[arg(long, default_value_t = 0)]
    pub mt_extra_ms: u64,
```

`TimedMt`: thêm trường `extra: Duration`; trong `stream`, trước `let started = Instant::now();`:
```rust
        if !self.extra.is_zero() {
            std::thread::sleep(self.extra);
        }
```
(đặt trước `started` nên mức bận dịch `mt_busy` không tính phần chờ.) Trong `run`, literal `TimedMt { … }` thêm
`extra: Duration::from_millis(args.mt_extra_ms),`.

`sidecar_pids`: danh sách `["asr-worker", "llama-server"]` thành `["asr-worker", "llama-server", "speaker-worker"]`.

`args_map`: thêm ba mục
```rust
        (
            "speaker_worker".to_string(),
            args.speaker_worker.as_deref().map(public_path).unwrap_or_else(|| "tắt".into()),
        ),
        (
            "speaker_model".to_string(),
            args.speaker_model.as_deref().map(public_path).unwrap_or_default(),
        ),
        ("mt_extra_ms".to_string(), args.mt_extra_ms.to_string()),
```
(`public_path(path: &Path) -> String` ở `latency.rs`.)

`RunInfo`, thêm trường cuối:

```rust
    /// Nhận giọng (kế hoạch 02b): số `Assign`, số tới khi đoạn còn chờ nhận dạng (nhãn có ngay ở lần phát đầu), số tới muộn; lý do
    /// client tắt giữa chừng, nếu có.
    speaker_assigns: usize,
    speaker_on_time: usize,
    speaker_late: usize,
    speaker_disabled: Option<String>,
    /// Khứ hồi của nhãn khi chạy cùng `asr-worker`, `llama-server` (gửi `Segment` → có trả lời, `SpeakerHandle::round_trip_ms`):
    /// p50, p90 (ms), số đoạn xong ≤ 230 ms trên số đoạn có trả lời (spec §4.4, §11).
    speaker_round_p50_ms: Option<f64>,
    speaker_round_p90_ms: Option<f64>,
    speaker_round_within_230: usize,
    speaker_round_count: usize,
    /// Hàng đợi dịch (QĐ 12 của kế hoạch 02): số câu bị gộp vào câu khác, số lần gộp hai câu đã biết khác giọng, số câu chờ dịch
    /// nhiều nhất cùng lúc, câu chờ lâu nhất (ms, giờ âm thanh). Ghi cả khi tắt nhận giọng để so.
    mt_merges: usize,
    mt_merges_across_voices: usize,
    mt_queue_max: usize,
    mt_wait_max_ms: u64,
```

Hàm mới (cạnh `sidecar_pids`):

```rust
/// Số đo nhận giọng của lượt chạy (khóa `run`).
fn speaker_counts(
    metrics: &SessionMetrics,
    disabled: Option<pipeline::speaker_client::Disabled>,
) -> (usize, usize, usize, Option<String>) {
    (
        metrics.speaker_assigns,
        metrics.speaker_on_time,
        metrics.speaker_late,
        disabled.map(|d| format!("{d:?}")),
    )
}

/// p50, p90 (ms), số lần ≤ 230 ms và tổng số lần khứ hồi.
fn round_trip_stats(values: &[f32]) -> (Option<f64>, Option<f64>, usize, usize) {
    (
        percentile(values, 50.0).map(|v| ms(f64::from(v))),
        percentile(values, 90.0).map(|v| ms(f64::from(v))),
        values.iter().filter(|&&v| v <= 230.0).count(),
        values.len(),
    )
}

/// Vết RSS của các tiến trình phụ (`asr-worker`, `llama-server`, `speaker-worker`) mỗi 5 s, TSV `t_s, name, pid, rss_mb`
/// (MB = 10^6 byte). Tìm lại pid ở mỗi lần: tiến trình phụ có thể đã chạy lại.
fn spawn_rss_trace(path: PathBuf, stop: Arc<AtomicBool>) -> std::thread::JoinHandle<Result<()>> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    std::thread::spawn(move || {
        let mut out = std::io::BufWriter::new(std::fs::File::create(&path)?);
        writeln!(out, "t_s\tname\tpid\trss_mb")?;
        let (t0, mut sys) = (Instant::now(), System::new());
        while !stop.load(Ordering::Relaxed) {
            for (name, pid) in sidecar_pids().into_iter().filter(|(n, _)| n != "latency-bench") {
                let p = Pid::from_u32(pid);
                sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[p]), true, ProcessRefreshKind::nothing().with_memory());
                if let Some(process) = sys.process(p) {
                    writeln!(
                        out,
                        "{:.0}\t{name}\t{pid}\t{:.1}",
                        t0.elapsed().as_secs_f64(),
                        process.memory() as f64 / 1e6
                    )?;
                }
            }
            out.flush()?;
            for _ in 0..50 {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
        Ok(())
    })
}
```

`run`, ba chỗ:
1. Sau `manager.begin_session();`:
   ```rust
       // Nhận giọng như app; lượt đo chờ worker sẵn sàng (app thì không) để số đo gồm cả nó từ đầu.
       let speaker = match (&args.speaker_worker, &args.speaker_model) {
           (Some(exe), Some(model)) => {
               let launch = pipeline::speaker_client::SpeakerLaunch::new(
                   exe,
                   model,
                   &log_path(&args.out, "speaker-worker"),
                   speaker_protocol::SpeakerConfig::default(),
               );
               let (link, handle) = pipeline::speaker_client::start(launch, Box::new(|_| Ok(())));
               if !handle.wait_ready(Duration::from_secs(60)) {
                   bail!("speaker-worker không sẵn sàng: {:?}", handle.disabled());
               }
               Some((link, handle))
           }
           _ => None,
       };
       let (speaker_link, speaker_handle) = match speaker {
           Some((link, handle)) => (Some(link), Some(handle)),
           None => (None, None),
       };
   ```
2. Sau dòng `let sampler = spawn_sampler(…);`:
   ```rust
       let trace = args.rss_trace.clone().map(|path| spawn_rss_trace(path, stop_sampler.clone()));
   ```
   Đổi `Engine::start(` thành `Engine::start_with_speaker(` và thêm đối số cuối `speaker_link,` (sau `recorder.clone(),`).
3. Sau `let usage = sampler.join()…?;`:
   ```rust
       if let Some(trace) = trace {
           trace.join().map_err(|_| anyhow!("luồng ghi vết RSS panic"))??;
       }
   ```
   và trong literal `RunInfo { … }` (trước `..RunInfo::default()`) không thêm gì; ngay sau literal:
   ```rust
       (run.speaker_assigns, run.speaker_on_time, run.speaker_late, run.speaker_disabled) =
           speaker_counts(&metrics, speaker_handle.as_ref().and_then(|h| h.disabled()));
       let rounds = speaker_handle.as_ref().map(|h| h.round_trip_ms()).unwrap_or_default();
       (
           run.speaker_round_p50_ms,
           run.speaker_round_p90_ms,
           run.speaker_round_within_230,
           run.speaker_round_count,
       ) = round_trip_stats(&rounds);
       (run.mt_merges, run.mt_merges_across_voices) = (metrics.mt_merges, metrics.mt_merges_across_voices);
       (run.mt_queue_max, run.mt_wait_max_ms) = (metrics.mt_queue_max, metrics.mt_wait_max_ms);
   ```
   (`let mut run = RunInfo { … }` đã là `mut`.) Ngay sau khối in `CẢNH BÁO: tiến trình phụ khởi động lại`, thêm:
   ```rust
       if report.run.speaker_assigns > 0 || report.run.speaker_disabled.is_some() {
           println!(
               "  nhận giọng: {} nhãn ({} trước khi có chữ, {} muộn); khứ hồi p50 {:?} ms, p90 {:?} ms, ≤ 230 ms: {}/{}{}",
               report.run.speaker_assigns,
               report.run.speaker_on_time,
               report.run.speaker_late,
               report.run.speaker_round_p50_ms,
               report.run.speaker_round_p90_ms,
               report.run.speaker_round_within_230,
               report.run.speaker_round_count,
               report.run.speaker_disabled.as_deref().map(|d| format!("; tắt giữa chừng: {d}")).unwrap_or_default()
           );
       }
       println!(
           "  hàng đợi dịch: gộp {} câu ({} lần khác giọng), {} câu bỏ bước dịch; dài nhất {} câu, chờ lâu nhất {} ms",
           report.run.mt_merges,
           report.run.mt_merges_across_voices,
           report.run.skipped,
           report.run.mt_queue_max,
           report.run.mt_wait_max_ms
       );
   ```

Thêm `use std::time::Duration;` nếu chưa có (đã có trong `use std::time::{Duration, Instant};`).

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p latency-bench 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, thêm 4 test.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p latency-bench && CARGO_TARGET_DIR=$W/target cargo clippy -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 4: A-spk4: độ trễ xen kẽ bật/tắt

**Files:**
- Tạo: `$B/results/02-do-tre.md`

Giao thức như nghiệm thu A2 của nguồn micro (`bench/2026-10-24-nguon-micro/results/nghiem-thu.md`): cùng bản dựng, cùng session, xen kẽ tắt/bật nhiều lượt, so trung bình (một lượt đơn lẻ dao động hơn mức cần so). Máy cắm điện, không chạy việc nặng khác; báo chủ dự án trước (khoảng 90 phút gồm Step 4 và Step 5, CPU và GPU bận, không phát tiếng ra loa). Ngoài độ trễ, Task này đo hai câu hỏi mở: khứ hồi của nhãn khi chạy cùng hai tiến trình phụ (mốc 230 ms) và hàng đợi dịch khi bật so với tắt (QĐ 12 của file 02: số câu gộp, số lần gộp khác giọng, số câu `Skip`; Step 5 thêm kịch bản dịch quá tải: hàng dài nhất, câu chờ lâu nhất).

- [ ] **Step 1: Bản release mới (build nặng)**

Run: `cd $W && df -h . | tail -1 && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release -p latency-bench -p speaker-worker 2>&1 | tail -1 && pmset -g batt | head -1`
Expected: `Finished`; nguồn "AC Power" (chạy pin thì ghi vào kết quả, đừng trộn hai nguồn điện).

- [ ] **Step 2: 12 lượt xen kẽ**

Run (chạy nền vì dài hơn 10 phút; chờ thông báo xong):

```sh
cd $W && S=$M/bench/phase0/data/latency && L=$M/tools/llama-b11669/macos-arm64/llama-b11669/llama-server && \
for s in en mixed; do for i in 1 2 3; do for mode in off on; do
  extra=""; [ $mode = on ] && extra="--speaker-worker target/release/speaker-worker --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx"
  target/release/latency-bench session --wav $S/$s.wav --truth $S/$s.truth.json --asr-worker target/release/asr-worker \
    --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server $L --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf \
    --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 $extra --out $DATA/out/02/a-spk4/$s-$mode-$i.json \
    | tee -a $DATA/out/02/a-spk4/log.txt
done; done; done
```

Expected: 12 file JSON; lượt `on` in dòng "nhận giọng: N nhãn (…)". Lượt nào in "CẢNH BÁO" (phát lại chậm, tiến trình phụ khởi động lại) thì chạy lại lượt đó và ghi lại.

- [ ] **Step 3: Tính chênh lệch**

Run:

```sh
cd $W && $DATA/venv/bin/python -I -c "
import json, glob, statistics as st
rows = {}
for f in sorted(glob.glob('$DATA/out/02/a-spk4/*.json')):
    s, mode, _ = f.split('/')[-1][:-5].split('-')
    r = json.load(open(f))
    rows.setdefault(mode, []).append((r['summary']['a2_p50_ms'], r['summary']['a2_p90_ms'], r['summary']['a2_first_p50_ms'], r['run'], r['usage'].get('speaker-worker')))
for k in (0, 1, 2):
    off = st.mean(x[k] for x in rows['off']); on = st.mean(x[k] for x in rows['on'])
    print(['a2_p50','a2_p90','a2_first_p50'][k], round(off,1), round(on,1), '+%.1f' % (on - off))
on_runs = rows['on']
print('nhãn', sum(x[3]['speaker_assigns'] for x in on_runs), 'đúng lúc', sum(x[3]['speaker_on_time'] for x in on_runs), 'muộn', sum(x[3]['speaker_late'] for x in on_runs), 'tắt', [x[3]['speaker_disabled'] for x in on_runs])
print('khứ hồi p50', [x[3]['speaker_round_p50_ms'] for x in on_runs], 'p90', [x[3]['speaker_round_p90_ms'] for x in on_runs], '≤ 230 ms', sum(x[3]['speaker_round_within_230'] for x in on_runs), '/', sum(x[3]['speaker_round_count'] for x in on_runs))
for mode in ('off', 'on'):
    print('hàng đợi dịch', mode, 'gộp', sum(x[3]['mt_merges'] for x in rows[mode]), 'khác giọng', sum(x[3]['mt_merges_across_voices'] for x in rows[mode]), 'Skip', sum(x[3]['skipped'] for x in rows[mode]))
# usage.*.peak_rss_mb của session là MiB (1 048 576 byte, latency.rs); đổi sang MB 10^6 như ram.md và ngân sách 250 MB.
print('speaker-worker RSS đỉnh MB', round(max(x[4]['peak_rss_mb'] for x in on_runs) * 1.048576, 1), 'CPU tb %', round(st.mean(x[4]['avg_cpu_percent'] for x in on_runs), 2))
"
```

Expected: ba dòng `tên tắt bật +chênh`, dòng nhãn, dòng khứ hồi, hai dòng hàng đợi dịch, dòng tải. **Mức đạt A-spk4** (spec §11, §12): A2 p50 chênh ≤ +20 ms, p90 ≤ +50 ms, chữ đầu (`a2_first_p50`) ≤ +20 ms. Không có lượt `on` nào bị tắt giữa chừng (`speaker_disabled` rỗng). Khứ hồi và hàng đợi dịch: ghi số, không có mức đạt riêng (spec chưa đặt); khứ hồi p90 trên 230 ms hay số câu `Skip` khi bật nhiều hơn khi tắt thì nêu ở "Điều cần chủ dự án duyệt" của Task 9.

- [ ] **Step 4: Hàng đợi dịch khi hai người nói xen kẽ (QĐ 12 của file 02)**

Hai session S6 ở Step 2 có thể ít đổi người nói, nên đo thêm trên 5 phút đầu của một cuộc họp AMI bốn người (người nói đổi liên tục; truth rỗng: không tính A2, chỉ đếm), xen kẽ tắt/bật hai lần (khoảng 20 phút, chạy nền):

```sh
cd $W && X=$DATA/out/02/a-spk4/xen-ke && mkdir -p $X && \
ffmpeg -loglevel error -y -i $DATA/ami/IS1009a.Mix-Headset.wav -t 300 -ar 16000 -ac 1 -c:a pcm_s16le $X/xen-ke.wav && \
echo '[]' > $X/xen-ke.truth.json && L=$M/tools/llama-b11669/macos-arm64/llama-b11669/llama-server && \
for i in 1 2; do for mode in off on; do
  extra=""; [ $mode = on ] && extra="--speaker-worker target/release/speaker-worker --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx"
  target/release/latency-bench session --wav $X/xen-ke.wav --truth $X/xen-ke.truth.json --asr-worker target/release/asr-worker \
    --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server $L --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf \
    --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 $extra --out $X/$mode-$i.json | tee -a $X/log.txt
done; done && \
$DATA/venv/bin/python -I -c "
import json, glob
for f in sorted(glob.glob('$X/*-*.json')):
    r = json.load(open(f))['run']
    print(f.split('/')[-1], 'gộp', r['mt_merges'], 'khác giọng', r['mt_merges_across_voices'], 'Skip', r['skipped'], 'dịch', r['translated'], 'nhãn', r['speaker_assigns'])
"
```

Expected: 4 dòng. Lượt `off` có `khác giọng` 0 (không có nhãn); lượt `on` có `nhãn` > 0. Ghi số `gộp`, `khác giọng`, `Skip` của hai chế độ vào `02-do-tre.md` (mục "Hàng đợi dịch"). M4 Pro thường dịch kịp nên có thể không có tồn đọng (mọi số 0 ngoài `dịch`, `nhãn`): ghi đúng như vậy; trường hợp dịch chậm hơn lời nói đo ở Step 5 bằng cách ép dịch chậm (02b Task 8 không đo session trên i5).

- [ ] **Step 5: Kịch bản dịch quá tải, hai người nói xen kẽ (QĐ 12 của file 02, ưu tiên 1)**

M4 Pro thường dịch kịp, nên Step 4 có thể không có tồn đọng. Step này ép dịch chậm hơn lời nói bằng `--mt-extra-ms 2000` (mỗi lần dịch chờ thêm 2 s) trên cùng file `xen-ke.wav` của Step 4, xen kẽ tắt/bật hai lần (khoảng 25 phút, chạy nền). Câu hỏi: khi bật, hàng đợi dịch có dài hơn, câu có chờ lâu hơn, có nhiều câu `Skip` hơn khi tắt không (QĐ 12: gộp câu cùng giọng xong mà hàng còn dài hơn cách gộp lúc tắt thì `merge_runs` gộp ngay cả câu khác giọng, nên hàng đầy thì gộp y hệt khi tắt và mong đợi là không).

```sh
cd $W && X=$DATA/out/02/a-spk4/xen-ke && Q=$DATA/out/02/a-spk4/qua-tai && mkdir -p $Q && \
L=$M/tools/llama-b11669/macos-arm64/llama-b11669/llama-server && \
for i in 1 2; do for mode in off on; do
  extra=""; [ $mode = on ] && extra="--speaker-worker target/release/speaker-worker --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx"
  target/release/latency-bench session --wav $X/xen-ke.wav --truth $X/xen-ke.truth.json --asr-worker target/release/asr-worker \
    --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server $L --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf \
    --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 --mt-extra-ms 2000 $extra --out $Q/$mode-$i.json | tee -a $Q/log.txt
done; done && \
$DATA/venv/bin/python -I -c "
import json, glob
for f in sorted(glob.glob('$Q/*-*.json')):
    r = json.load(open(f))['run']
    print(f.split('/')[-1], 'hàng dài nhất', r['mt_queue_max'], 'chờ lâu nhất ms', r['mt_wait_max_ms'], 'Skip', r['skipped'], 'gộp', r['mt_merges'], 'khác giọng', r['mt_merges_across_voices'], 'dịch', r['translated'], 'nhãn', r['speaker_assigns'])
"
```

Expected: 4 dòng. Phải có quá tải thật: lượt `off` có `gộp` > 0 và `hàng dài nhất` ≥ 3; không có thì tăng `--mt-extra-ms` (3000, rồi 4000), chạy lại cả bốn lượt và ghi giá trị đã dùng. Lượt `on` có `nhãn` > 0 và `khác giọng` > 0 (người nói đổi liên tục). Mong đợi (QĐ 12): bật không tệ hơn tắt, tức `hàng dài nhất` khi bật ≤ khi tắt, `chờ lâu nhất` và `Skip` khi bật nằm trong mức dao động giữa hai lượt tắt (hai lượt cùng chế độ lệch nhau do thời điểm nhận dạng). Bật tệ hơn rõ (hàng dài hơn, chờ lâu hơn quá mức dao động, hay nhiều `Skip` hơn) thì ghi số và nêu ở "Điều cần chủ dự án duyệt" của Task 9. Ghi bảng bốn lượt vào `02-do-tre.md` (mục "Hàng đợi dịch quá tải").

- [ ] **Step 6: Ghi `$B/results/02-do-tre.md`**

Nội dung: điều kiện (máy, nguồn điện, bản dựng, `asr-worker` Metal + shared-encode, model, hai session S6 en và mixed, ngưỡng im lặng 50 ms, thứ tự xen kẽ); bảng 12 lượt (session, lượt, chế độ, A2 p50, p90, chữ đầu, số đoạn, nhãn đúng lúc/muộn, khứ hồi p50/p90); bảng trung bình và chênh lệch so với mức đạt; khứ hồi của nhãn khi chạy cùng `asr-worker`, `llama-server` (p50, p90, số đoạn ≤ 230 ms) và tỉ lệ nhãn tới trước kết quả nhận dạng (câu hỏi mở của kế hoạch 01: mốc 230 ms khi chạy cùng hai tiến trình phụ); mục "Hàng đợi dịch" (Step 3 và Step 4: gộp, gộp khác giọng, `Skip`, bật so với tắt); mục "Hàng đợi dịch quá tải" (Step 5: `--mt-extra-ms` đã dùng, hàng dài nhất, câu chờ lâu nhất, `Skip`, gộp, gộp khác giọng, bật so với tắt); RSS đỉnh và %CPU trung bình (thời gian) của `speaker-worker` trong các lượt bật (chỉ để đối chiếu, xem Task 5 cho số theo lệnh và năng lượng); kết luận; mục "Chạy lại".

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && git status --short bench/2026-10-26-nguoi-noi/results/`
Expected: thêm `02-do-tre.md`. Không commit.

---

### Task 5: Soak test ≥ 1 giờ có vết RSS (A-spk5 phần worker)

**Files:**
- Tạo: `$B/results/02-soak.md`

- [ ] **Step 1: Âm thanh dài hơn 1 giờ từ AMI**

Run: `cd $DATA/out/02/soak && ffmpeg -loglevel error -y -i $DATA/ami/IS1009a.Mix-Headset.wav -i $DATA/ami/EN2002a.Mix-Headset.wav -i $DATA/ami/ES2004a.Mix-Headset.wav -i $DATA/ami/TS3003a.Mix-Headset.wav -filter_complex concat=n=4:v=0:a=1 -ar 16000 -ac 1 -c:a pcm_s16le soak.wav && echo '[]' > soak.truth.json && python3 -c "import wave; w=wave.open('soak.wav'); print(round(w.getnframes()/w.getframerate()))"`
Expected: số giây ≥ 3600. Dưới 3600 thì thêm `$DATA/ami/IS1009a.Array1-01.wav` vào cuối (`-i …`, `concat=n=5`). Truth rỗng: `session` không tính A2 cho lượt này (chỉ đo tải).

- [ ] **Step 2: Dựng `rus` (đo số lệnh và năng lượng)**

Run: `cd $W && mkdir -p $DATA/bin && swiftc -O -o $DATA/bin/rus $B/tro-nang/rus.swift && $DATA/bin/rus speaker-worker | head -c 200`
Expected: một dòng JSON (`{"t":…,"p":[]}` khi chưa có worker chạy).

- [ ] **Step 3: Chạy soak (nền, khoảng 65–75 phút)**

Báo chủ dự án trước (máy bận hơn 1 giờ). Chạy nền:

```sh
cd $W && S=$DATA/out/02/soak && L=$M/tools/llama-b11669/macos-arm64/llama-b11669/llama-server && \
( sleep 120 && $DATA/bin/rus speaker-worker asr-worker llama-server > $S/rus-dau.json ) & \
target/release/latency-bench session --wav $S/soak.wav --truth $S/soak.truth.json --asr-worker target/release/asr-worker \
  --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server $L --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf \
  --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 \
  --speaker-worker target/release/speaker-worker --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx \
  --rss-trace $S/rss.tsv --out $S/soak.json | tee $S/log.txt
```

Ngay trước khi lượt chạy kết thúc (theo dõi `tail -1 $S/rss.tsv`: giây ≥ thời lượng WAV − 60), chụp lần hai: `cd $W && $DATA/bin/rus speaker-worker asr-worker llama-server > $DATA/out/02/soak/rus-cuoi.json`.
Expected: lượt chạy xong, dòng "nhận giọng: N nhãn", không "tắt giữa chừng"; `rss.tsv` có khoảng 700+ dòng mỗi tiến trình.

- [ ] **Step 4: Phân tích vết RSS và số lệnh**

Run:

```sh
cd $W && $DATA/venv/bin/python -I -c "
import csv, json
rows = [r for r in csv.DictReader(open('$DATA/out/02/soak/rss.tsv'), delimiter='\t') if r['name'] == 'speaker-worker']
t = [float(r['t_s']) for r in rows]; m = [float(r['rss_mb']) for r in rows]
n = len(m); half = n // 2; tenth = max(1, n // 10)
print('mẫu', n, 'thời gian', t[-1] - t[0], 's; RSS đỉnh', max(m), 'MB; đỉnh 10% đầu', max(m[:tenth]), '10% cuối', max(m[-tenth:]), '; nửa đầu', max(m[:half]), 'nửa sau', max(m[half:]))
a = {p['pat']: p for p in json.load(open('$DATA/out/02/soak/rus-dau.json'))['p']}
b = {p['pat']: p for p in json.load(open('$DATA/out/02/soak/rus-cuoi.json'))['p']}
dt = json.load(open('$DATA/out/02/soak/rus-cuoi.json'))['t'] - json.load(open('$DATA/out/02/soak/rus-dau.json'))['t']
for k in a:
    if k in b:
        print(k, 'CPU %.2f%% một lõi' % (100 * (b[k]['cpu_s'] - a[k]['cpu_s']) / dt), 'tỉ lệnh/s %.3f' % ((b[k]['instr'] - a[k]['instr']) / dt / 1e9), 'mW %.0f' % ((b[k]['energy_nj'] - a[k]['energy_nj']) / dt / 1e6))
"
```

Expected: RSS đỉnh của `speaker-worker` và so sánh đầu/cuối; dòng CPU, số lệnh, năng lượng cho từng tiến trình phụ. **Mức đạt** (spec §11, chủ dự án duyệt): RSS ≤ 250 MB suốt lượt; không tăng dần (đỉnh 10% cuối không vượt đỉnh 10% đầu quá 25 MB; nếu vượt, ghi và báo chủ dự án, đừng tự đổi ngân sách). CPU: ngân sách ≤ 8% một lõi khi người nói liên tục được đo theo thời lượng tiếng nói ở Task 2; ở đây ghi CPU theo giờ đồng hồ (AMI có khoảng 65% thời gian là tiếng nói) để đối chiếu, cùng số lệnh và năng lượng (spec §6.8: không kết luận bằng %CPU khi so tải giữa các chế độ).

- [ ] **Step 5: Ghi `$B/results/02-soak.md`**

Nội dung: điều kiện (thời lượng, các bản ghi ghép, bản dựng, nguồn điện, các tiến trình chạy cùng, dòng "speaker-worker: 2 luồng tính toán" trong `soak.speaker-worker.log`); bảng RSS của `speaker-worker`, `asr-worker`, `llama-server` (đỉnh, đầu, cuối, nửa đầu, nửa sau); khứ hồi của nhãn suốt lượt dài (`run.speaker_round_*` của `soak.json`); đồ thị dạng bảng thưa (mỗi 10 phút một dòng RSS của `speaker-worker`); CPU, số lệnh, năng lượng của ba tiến trình; nhãn đúng lúc/muộn của lượt dài; kết luận về allocator macOS (RSS chạy lâu so với 198–208 MB của kế hoạch 01, `results/ram.md`) và ngân sách RAM ≤ 250 MB; mục "Chạy lại".

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short bench/2026-10-26-nguoi-noi/results/`
Expected: thêm `02-soak.md`. Không commit.

---

### Task 6: Đóng gói `speaker-worker` vào gói app

**Files:**
- Sửa: `scripts/copy-sidecars.sh`
- Sửa: `scripts/release/build-sidecars-macos.sh` (`sign_and_check` dòng 33–46; khối build sau `asr-worker` dòng 53–58; khối chép dòng 99–103)
- Sửa: `scripts/release/package-macos.sh` (vòng kiểm file dòng 51–56)
- Sửa: `src-tauri/release/tauri.macos.json`, `src-tauri/release/tauri.windows.json` (`externalBin`)
- Sửa: `scripts/release/build-sidecars-windows.mjs` (`steps` dòng 59–113; `signAndCheck` dòng 236–248), `scripts/release/windows.test.mjs` (test đầu, dòng 16–51)
- Sửa: `scripts/release/package-windows.mjs` (`SIDECARS` dòng 32)
- Sửa: `scripts/release/check-release-config.sh`
- Sửa: `scripts/release/notices.mjs` (dòng 235 và chú thích đầu file)

- [ ] **Step 1: Sửa test của script Windows trước**

`windows.test.mjs`, test đầu: danh sách tham số cuối của các bước `cargo` thành `["vulkan,shared-encode", "shared-encode", "speaker-worker"]`; danh sách đích chép thành:

```js
    [
      join("O", `asr-worker-vulkan-${TRIPLE}.exe`),
      join("O", `asr-worker-cpu-${TRIPLE}.exe`),
      join("O", `speaker-worker-${TRIPLE}.exe`),
      join("O", `llama-server-${TRIPLE}.exe`),
    ],
```

Đổi tiêu đề test thành `"build Windows: asr-worker và speaker-worker CRT tĩnh + DEPENDENTLOADFLAG; llama.cpp CRT động kèm runtime; đủ cờ llama.cpp đã chốt"`.

Run: `cd $W && node --test scripts/release/windows.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 1`.

- [ ] **Step 2: Sửa các script và cấu hình**

`build-sidecars-windows.mjs`, trong `steps`, ngay sau dòng chép bản CPU, `` { copy: [exe, join(out, `asr-worker-cpu-${TRIPLE}.exe`)] }, ``:

```js
    // speaker-worker (spec 2026-10-26-phan-biet-nguoi-noi §4.1): Rust thuần, không ggml; CRT tĩnh như asr-worker.
    { run: ["cargo", "build", "--release", "--locked", "-p", "speaker-worker"], env: crt, cwd: root },
    { copy: [join(target, "release", "speaker-worker.exe"), join(out, `speaker-worker-${TRIPLE}.exe`)] },
```

và trong `signAndCheck`: `const workers = files.filter((f) => /(asr-worker-(vulkan|cpu)|speaker-worker)-/.test(f));`. Chú thích đầu file thêm một gạch: `//   - speaker-worker: nhận giọng người nói (Rust thuần, candle), CRT tĩnh như asr-worker.`

`package-windows.mjs`: `const SIDECARS = ["asr-worker-vulkan", "asr-worker-cpu", "speaker-worker", "llama-server"];`.

`tauri.macos.json`: `"externalBin": ["binaries/asr-worker", "binaries/llama-server", "binaries/speaker-worker"],`. `tauri.windows.json`: `"externalBin": ["binaries/asr-worker-vulkan", "binaries/asr-worker-cpu", "binaries/llama-server", "binaries/speaker-worker"],`.

`build-sidecars-macos.sh`: chú thích đầu file thêm gạch `#   - speaker-worker: nhận giọng người nói (Rust thuần, candle, không ggml), macOS tối thiểu 14.2 như asr-worker;` và đổi "Build hai tiến trình phụ" thành "Build ba tiến trình phụ"; `for name in asr-worker llama-server; do` (trong `sign_and_check`) thành `for name in asr-worker llama-server speaker-worker; do`; sau dòng `(cd "$root" && cargo build --release --locked -p asr-worker --features metal,shared-encode)`:

```sh

echo "== speaker-worker"
(cd "$root" && cargo build --release --locked -p speaker-worker)
```

và sau `cp "$target/release/asr-worker" "$out/asr-worker-$triple"`: `cp "$target/release/speaker-worker" "$out/speaker-worker-$triple"`.

`package-macos.sh`: `for f in "asr-worker-$triple" "llama-server-$triple" "speaker-worker-$triple"; do`.

`copy-sidecars.sh`: chú thích đầu file đổi "Chép hai tiến trình phụ" thành "Chép ba tiến trình phụ" và thêm dòng `#   speaker-worker luôn được build (release) và chép (spec 2026-10-26-phan-biet-nguoi-noi §4.1).`; sau khối `if … fi` chọn `asr`:

```sh
(cd "$root" && MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release -p speaker-worker)
speaker="${CARGO_TARGET_DIR:-$root/target}/release/speaker-worker"
```

và sau `cp "$asr" "$out/asr-worker-$triple"`: `cp "$speaker" "$out/speaker-worker-$triple"`.

`check-release-config.sh`: sau `placeholder llama-server-aarch64-apple-darwin` thêm `placeholder speaker-worker-aarch64-apple-darwin`; dòng `copied "$target/debug" asr-worker llama-server THIRD_PARTY_NOTICES.txt` thành `copied "$target/debug" asr-worker llama-server speaker-worker THIRD_PARTY_NOTICES.txt`; vòng Windows `for name in asr-worker-vulkan asr-worker-cpu llama-server; do` thành `for name in asr-worker-vulkan asr-worker-cpu llama-server speaker-worker; do`; dòng `copied "$target/x86_64-pc-windows-msvc/debug" asr-worker-vulkan.exe …` thêm `speaker-worker.exe` sau `llama-server.exe`.

`notices.mjs`: `const rust = mergeAbout([cargoAbout("src-tauri/Cargo.toml"), cargoAbout("crates/asr-worker/Cargo.toml"), cargoAbout("crates/speaker-worker/Cargo.toml")]);` và chú thích đầu file: "cho app, asr-worker và speaker-worker (ba binary được phát hành có code Rust)".

- [ ] **Step 3: Chạy test và kiểm cấu hình đóng gói**

Run: `cd $W && node --test "scripts/release/*.test.mjs" 2>&1 | grep -E "^# (pass|fail)" && df -h . | tail -1 && CARGO_TARGET_DIR=$W/target scripts/release/check-release-config.sh 2>&1 | tail -3`
Expected: `# fail 0`; còn ≥ 22 GB; `hai cấu hình đóng gói hợp lệ` (script tạo file giả cho tiến trình phụ chưa có rồi tự xóa). Script cần `THIRD_PARTY_NOTICES.txt` ở gốc repo (chỉ kiểm file được chép vào gói), mà `$W` chưa có (file bị gitignore): chép tạm bản của thư mục chính trước khi chạy, `cp $M/THIRD_PARTY_NOTICES.txt $W/`, chạy xong thì `rm $W/THIRD_PARTY_NOTICES.txt`. Không chạy `notices.mjs` ở đây: nó cần `pnpm install --frozen-lockfile` (mạng, `node_modules`), hỏi chủ dự án trước; CI chạy nó ở mỗi lần đẩy. Các test `node --test` không cần `node_modules`.

- [ ] **Step 4: Ký thử, thư viện liên kết, kích thước**

Run: `cd $W && otool -l target/release/speaker-worker | grep -A4 LC_BUILD_VERSION | grep minos && cp target/release/speaker-worker $DATA/out/02/speaker-worker-ky-thu && codesign --force --sign - --options runtime --identifier com.aitranslator.desktop.speaker-worker $DATA/out/02/speaker-worker-ky-thu && codesign --verify --strict $DATA/out/02/speaker-worker-ky-thu && node scripts/release/release-check.mjs deps-macos $DATA/out/02/speaker-worker-ky-thu && ls -l target/release/speaker-worker && gzip -9 -c target/release/speaker-worker | wc -c && xz -9e -c target/release/speaker-worker | wc -c && gh release view v0.3.1 --json assets --jq '.assets[] | select((.name | endswith(".dmg")) or (.name | endswith("_x64-setup.exe"))) | "\(.name) \(.size)"'`
Expected: `minos 14.2` (binary dựng với `MACOSX_DEPLOYMENT_TARGET=14.2` như `build-sidecars-macos.sh`; thấy `minos 11.0` nghĩa là bản này dựng thiếu biến, dựng lại theo Task 0 Step 2 trước khi đi tiếp: `release-check.mjs` coi `minos` dưới 14.2 là lỗi); ký và kiểm đạt; `deps-macos` không báo lỗi (chỉ thư viện hệ thống, tối thiểu 14.2); kích thước binary, bản nén gzip (gần cách nén của `.dmg`) và xz (gần LZMA của bộ cài NSIS); kích thước `.dmg` và bộ cài Windows (`…_x64-setup.exe`) của 0.3.1 (lệnh `gh` cần `GH_TOKEN`; không có thì hỏi chủ dự án hai con số). Cả hai có cùng giới hạn **60 000 000 byte** (`package-macos.sh`: `size "$dmg" --max-bytes 60000000`; `package-windows.mjs`: `checkSize(bytes, 60_000_000)`). Ước tính: `.dmg` 0.3.1 + gzip của worker macOS; bộ cài Windows 0.3.1 + xz của worker macOS (ước tính thô: bản Windows CRT tĩnh có thể lớn hơn; Task 8 Step 1 tính lại với `speaker-worker.exe` thật). **Ước tính nào vượt 60 000 000 byte thì dừng và báo chủ dự án**; không tự đổi giới hạn.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short scripts src-tauri/release`
Expected: các file ở danh sách "Files" của Task này (không có `THIRD_PARTY_NOTICES.txt`: đã xóa bản chép tạm). Không commit. Ghi kích thước (binary, gzip, xz, hai ước tính so với 60 000 000 byte) vào `02-tong-hop.md` (Task 9).

---

### Task 7: Bảo mật (A-spk7 phần thuộc kế hoạch 02)

**Files:**
- Tạo: `scripts/release/check-no-network.sh`
- Sửa: `.github/workflows/ci.yml` (job `macos`, sau bước "cargo clippy"), `scripts/check-windows.sh` (dòng `cargo clippy …` cuối), `scripts/release/build-sidecars-macos.sh` (`sign_and_check`, đã sửa ở Task 6)

Spec §4.1 chỉ đòi "`cargo tree` không có `reqwest`, `hyper`…", nhưng tên crate không bắt được mạng trong `std` (`std::net`), trong `libc`/`rustix` (đều đã có trong cây của `speaker-worker`) hay feature `Win32_Networking_*` của crate `windows` (cờ feature không hiện thành tên crate). Script kiểm bốn lớp rẻ, báo mọi lớp hỏng rồi mới thoát mã 1. Đã thử từng lớp trên cây hiện tại (ngày 2026-10-26): `speaker-worker` sạch cả bốn; `pipeline` (có `reqwest`) đỏ ở lớp 1 và 2; `asr-worker` bản phát hành không nhập hàm socket nào, `latency-bench` (có `reqwest`) nhập 3.

- [ ] **Step 1: Viết script kiểm**

`scripts/release/check-no-network.sh`:

```sh
#!/bin/sh
# Kiểm package không có mã mạng (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §10: speaker-worker chỉ nói chuyện với app qua
# stdin/stdout). Bốn lớp, mỗi lớp rẻ, báo mọi lớp hỏng rồi mới thoát mã 1:
#   1. cây phụ thuộc lúc chạy (`cargo tree -e normal`, macOS arm64 và Windows x64) không có crate mạng;
#   2. không bật feature mạng của `windows`/`windows-sys` (cờ feature không hiện thành tên crate);
#   3. mã nguồn của package không nhắc API mạng của std, libc, rustix, Windows (kể cả trong chú thích: đừng viết tên API mạng
#      trong chú thích của các crate này);
#   4. (`--binary <file>`, macOS, sau khi build release) binary không nhập hàm socket nào (`nm -u`; Rust trên macOS bỏ phần
#      `std::net` không dùng khi liên kết).
# Chỉ đọc metadata và file, không build.
#
#   scripts/release/check-no-network.sh [--binary <file>] [package...]
# Không có gì: lớp 1–3 cho speaker-worker và speaker-protocol. Chỉ `--binary`: chỉ lớp 4, không gọi cargo (job ký của
# release.yml không cài Rust).
#
# `NO_NETWORK_SRC_ROOT` (mặc định gốc repo): nơi tìm `crates/<package>/src` cho lớp 3; chỉ để tự kiểm script trên bản sao tạm.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
src_root=${NO_NETWORK_SRC_ROOT:-$root}
binary=""
if [ "${1:-}" = "--binary" ]; then
  binary=$2
  shift 2
fi
if [ "$#" -eq 0 ] && [ -z "$binary" ]; then
  set -- speaker-worker speaker-protocol
fi
banned_crates='^(reqwest|hyper|hyper-util|h2|h3|ureq|tokio|mio|socket2|rustls|native-tls|openssl|openssl-sys|curl|curl-sys|isahc|attohttpc|tungstenite|quinn)$'
banned_src='std::net|TcpStream|TcpListener|UdpSocket|ToSocketAddrs|\bsocket\(|\bconnect\(|getaddrinfo|rustix::net|Win32_Networking|WinHttp|WinINet'
fail=0
for pkg in "$@"; do
  for target in aarch64-apple-darwin x86_64-pc-windows-msvc; do
    # Gán riêng: `cargo tree` lỗi (tên package sai…) thì `set -e` dừng script, không lặng lẽ coi là sạch.
    tree=$(cd "$root" && cargo tree --locked -p "$pkg" -e normal --target "$target" --prefix none --format '{p}')
    bad=$(printf '%s\n' "$tree" | awk '{print $1}' | sort -u | grep -E "$banned_crates" || true)
    if [ -n "$bad" ]; then
      echo "$pkg ($target): crate mạng trong cây phụ thuộc: $(printf '%s' "$bad" | tr '\n' ' ')" >&2
      fail=1
    fi
  done
  features=$(cd "$root" && cargo tree --locked -p "$pkg" -e features --target x86_64-pc-windows-msvc)
  feat=$(printf '%s\n' "$features" | grep -oE 'Win32_Networking[A-Za-z_]*' | sort -u || true)
  if [ -n "$feat" ]; then
    echo "$pkg: feature mạng của windows/windows-sys: $(printf '%s' "$feat" | tr '\n' ' ')" >&2
    fail=1
  fi
  if [ ! -d "$src_root/crates/$pkg/src" ]; then
    echo "$pkg: không thấy $src_root/crates/$pkg/src" >&2
    fail=1
  else
    hits=$(grep -rnE "$banned_src" "$src_root/crates/$pkg/src" || true)
    if [ -n "$hits" ]; then
      echo "$pkg: mã nguồn nhắc API mạng:" >&2
      printf '%s\n' "$hits" >&2
      fail=1
    fi
  fi
done
if [ -n "$binary" ]; then
  syms=$(nm -u "$binary" | grep -E '^_(socket|connect|getaddrinfo|sendto|recvfrom|sendmsg|recvmsg|bind|listen|accept)$' || true)
  if [ -n "$syms" ]; then
    echo "$binary nhập hàm mạng: $(printf '%s' "$syms" | tr '\n' ' ')" >&2
    fail=1
  fi
fi
if [ "$fail" -ne 0 ]; then
  exit 1
fi
what=""
if [ "$#" -gt 0 ]; then
  what="$* (cây phụ thuộc hai nền tảng, feature Windows, mã nguồn)"
fi
if [ -n "$binary" ]; then
  what="${what:+$what; }binary $binary"
fi
echo "không có mã mạng: $what"
```

Run: `cd $W && chmod +x scripts/release/check-no-network.sh && scripts/release/check-no-network.sh --binary target/release/speaker-worker speaker-worker speaker-protocol`
Expected: `không có mã mạng: speaker-worker speaker-protocol (cây phụ thuộc hai nền tảng, feature Windows, mã nguồn); binary target/release/speaker-worker`.

- [ ] **Step 2: Thấy script bắt được mã mạng ở từng lớp (thử âm tính)**

Mỗi lệnh dưới đây phải in lỗi và `mã 1`; lệnh nào in "không có mã mạng" thì lớp đó hỏng, sửa script trước khi đi tiếp.

```sh
cd $W && scripts/release/check-no-network.sh pipeline; echo "mã $?"
```

Expected: dòng "pipeline (aarch64-apple-darwin): crate mạng…" (lớp 1, có `reqwest`, `hyper`, `tokio`…), "pipeline: feature mạng của windows/windows-sys: Win32_Networking…" (lớp 2) và "pipeline: mã nguồn nhắc API mạng:" (lớp 3, `src/bin/fake_llama_server.rs`); `mã 1`.

```sh
cd $W && T=$(mktemp -d) && mkdir -p $T/crates/speaker-protocol/src && cp -R crates/speaker-protocol/src/. $T/crates/speaker-protocol/src/ && \
printf '\nfn _thu_mang() {\n    let _ = std::net::TcpStream::connect("127.0.0.1:9");\n}\n' >> $T/crates/speaker-protocol/src/lib.rs && \
NO_NETWORK_SRC_ROOT=$T scripts/release/check-no-network.sh speaker-protocol; echo "mã $?"; rm -rf $T
```

Expected: "speaker-protocol: mã nguồn nhắc API mạng:" kèm dòng `std::net::TcpStream::connect` của bản sao tạm (lớp 3; bản sao nằm ngoài repo, repo không đổi); `mã 1`.

```sh
cd $W && scripts/release/check-no-network.sh --binary target/release/latency-bench; echo "mã $?"
```

Expected: "target/release/latency-bench nhập hàm mạng: _socket _connect …" (lớp 4; `latency-bench` có `reqwest`); `mã 1`.

- [ ] **Step 3: Đưa vào CI, bản phát hành và kiểm kiểu Windows**

`ci.yml`, job `macos`, thêm bước ngay sau bước `cargo clippy` (lớp 1–3; CI không build release `speaker-worker`):

```yaml
      - name: speaker-worker không có mã mạng (spec 2026-10-26-phan-biet-nguoi-noi §4.1)
        run: scripts/release/check-no-network.sh speaker-worker speaker-protocol
```

`scripts/release/build-sidecars-macos.sh`, cuối hàm `sign_and_check` (sau hai dòng `node … release-check.mjs`), thêm lớp 4 trên chính binary sẽ đóng gói (chỉ `--binary`: không gọi cargo, vì `sign_and_check` cũng chạy trong job ký của `release.yml`, job đó không cài Rust):

```sh
  "$root/scripts/release/check-no-network.sh" --binary "$out/speaker-worker-$triple"
```

`scripts/check-windows.sh`, dòng cuối: `cargo clippy -p meeting-translator -p pipeline -p audio-capture -p speaker-worker -p speaker-protocol --target x86_64-pc-windows-msvc --all-targets "$@" \`.

Run: `cd $W && CARGO_TARGET_DIR=$W/target ./scripts/check-windows.sh 2>&1 | tail -1 && node --test scripts/release/workflow.test.mjs 2>&1 | grep -E "^# (pass|fail)" && sh -n scripts/release/build-sidecars-macos.sh && sh -n scripts/release/check-no-network.sh && echo "cú pháp sh đạt"`
Expected: `Finished`; `# fail 0`; `cú pháp sh đạt`.

- [ ] **Step 4: `cargo deny`, `cargo audit`**

Run: `cd $W && cargo deny check 2>&1 | tail -4; cargo audit 2>&1 | tail -4`
Expected: `advisories ok, bans ok, licenses ok, sources ok`; `cargo audit` không có lỗ hổng mới (chỉ các mục đã bỏ qua có lý do trong `deny.toml`, `.cargo/audit.toml`). Chưa cài công cụ thì dùng đúng bản của CI (`cargo-deny@0.20.2`, `cargo-audit@0.22.2`) và hỏi chủ dự án trước khi cài. Kế hoạch 02 không thêm crate bên thứ ba mới vào `Cargo.lock` (`rayon`, `prost`, `libc`, `sha2` đã có), nên `licenses` không đổi.

- [ ] **Step 5: Log và báo cáo không có âm thanh hay tên**

Run: `cd $W && grep -rn "log::\(info\|warn\|error\)\|eprintln!" crates/speaker-worker/src crates/pipeline/src/speaker.rs crates/pipeline/src/speaker_client.rs crates/pipeline/src/voices.rs src-tauri/src/speaker | grep -v "^.*//"`
Expected: từng dòng chỉ in số đếm, mã đoạn, mã lỗi (`kind`), thời gian, lý do (`Disabled`, `e.root_cause()` của nạp model hay nhúng); không dòng nào in `pcm`, `samples`, `embedding`, tên. Có dòng in dữ liệu khác thì sửa trước khi đi tiếp. Báo cáo lỗi (`src-tauri/src/diagnostics/`) chưa gửi gì của nhận giọng ở kế hoạch 02 (log của app chỉ có các dòng trên; `speaker-worker.log` là file riêng chưa vào báo cáo); báo cáo `speaker_health` là kế hoạch 06.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short scripts .github`
Expected: `?? scripts/release/check-no-network.sh`, ` M .github/workflows/ci.yml`, ` M scripts/check-windows.sh`, ` M scripts/release/build-sidecars-macos.sh` (sửa ở Task 6 và 7), và các file khác của Task 6. Không commit; ghi kết quả vào `02-tong-hop.md` (mục "Bảo mật": bốn lớp của Step 1, ba lần thử âm tính của Step 2, `cargo deny`, `cargo audit`, log).

---

### Task 8: Windows i5 (cần chủ dự án)

**Files:**
- Tạo (ngoài repo): `$DATA/win-pack-02/` và `$DATA/win-pack-02.zip`
- Tạo: `$B/results/02-windows.md`

Mục tiêu: RAM của B' và allocator Windows khi chạy lâu, tốc độ và CPU của nhúng qua worker thật trên i5 (ngân sách ≤ 10% một lõi, spec §11), độ chính xác giữ nguyên. Bổ sung cho gói Task 13 của kế hoạch 01 (chưa chạy); nếu chủ dự án chưa chạy gói cũ, gộp chung một lần.

- [ ] **Step 1: Dựng file chạy Windows bằng mingw-w64 (build nặng)**

Như gói của kế hoạch 01 (target `x86_64-pc-windows-gnu`, oniguruma biên dịch tĩnh bằng `x86_64-w64-mingw32-gcc`; không dùng `cargo-xwin`).

Run: `cd $W && df -h . | tail -1 && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release --target x86_64-pc-windows-gnu -p speaker-worker -p latency-bench 2>&1 | tail -1 && x86_64-w64-mingw32-objdump -p target/x86_64-pc-windows-gnu/release/speaker-worker.exe | grep "DLL Name" | sort -u && ls -l target/x86_64-pc-windows-gnu/release/speaker-worker.exe && xz -9e -c target/x86_64-pc-windows-gnu/release/speaker-worker.exe | wc -c`
Expected: `Finished`; chỉ DLL của Windows (`KERNEL32.dll`, `api-ms-win-crt-*`, `ntdll.dll`, …), không DLL lạ. Có `WS2_32.dll` hay không thì chỉ ghi lại (std của Rust trên Windows có thể giữ import này dù không gọi hàm mạng nào; đối chiếu với `latency-bench.exe` cùng thư mục, có mạng), không coi là lỗi: lớp kiểm mạng chính là Task 7. Kích thước `.exe` và bản nén xz: tính lại ước tính bộ cài Windows của Task 6 Step 4 (bộ cài 0.3.1 + xz của `.exe` này; bản gnu, bản phát hành dựng bằng MSVC CRT tĩnh nên chỉ là ước tính); vượt 60 000 000 byte thì báo chủ dự án. Lỗi biên dịch C của mingw thì ghi lỗi vào `02-windows.md` và hỏi chủ dự án chọn đường khác (máy Windows có Rust, hay CI).

- [ ] **Step 2: Đóng gói**

Run: `mkdir -p $DATA/win-pack-02 && cd $W && cp target/x86_64-pc-windows-gnu/release/speaker-worker.exe target/x86_64-pc-windows-gnu/release/latency-bench.exe $DATA/models/eres2net-sv-en-voxceleb-16k.onnx $M/models/silero_vad_v6.2.3.onnx $DATA/ami/IS1009a.Mix-Headset.wav $DATA/win-pack-02/ && ls $DATA/win-pack-02`
Expected: 5 file.

Viết `$DATA/win-pack-02/chay-02.ps1` (ngoài repo, theo mẫu `$DATA/win-pack/chay-toc-do.ps1`: UTF-8, kiểm đủ file, `Unblock-File`, ghi thông số máy bằng `Get-CimInstance Win32_Processor`, `Win32_ComputerSystem`, `Win32_OperatingSystem`, nén kết quả thành `ket-qua-02.zip`). Script chạy hai lượt và ghi đầu ra:

```powershell
.\latency-bench.exe speaker-eval --wav IS1009a.Mix-Headset.wav --vad-model silero_vad_v6.2.3.onnx `
  --speaker-model eres2net-sv-en-voxceleb-16k.onnx --worker .\speaker-worker.exe --theta 0.35 --merge-theta 1.1 `
  --out worker-1.jsonl *>&1 | Tee-Object -FilePath worker-1.txt
.\latency-bench.exe speaker-eval --wav IS1009a.Mix-Headset.wav --vad-model silero_vad_v6.2.3.onnx `
  --speaker-model eres2net-sv-en-voxceleb-16k.onnx --worker .\speaker-worker.exe --theta 0.35 --merge-theta 1.1 `
  --out worker-2.jsonl *>&1 | Tee-Object -FilePath worker-2.txt
```

kèm `README-02.txt` tiếng Việt (chạy `powershell -ExecutionPolicy Bypass -File .\chay-02.ps1`, không cần quyền quản trị, không mạng, không ghi âm; gửi lại `ket-qua-02.zip`). Nén: `cd $DATA && zip -qr win-pack-02.zip win-pack-02 && ls -l win-pack-02.zip`.

- [ ] **Step 3: Chủ dự án chạy trên i5 (cần chủ dự án)**

Gửi chủ dự án `win-pack-02.zip` (đường dẫn trên máy) và hướng dẫn trong `README-02.txt`. Chờ `ket-qua-02.zip`.

- [ ] **Step 4: Ghi `$B/results/02-windows.md`**

Chép `ket-qua-02.zip` vào `$DATA/out/02/windows/`, giải nén, chấm: `cd $W && $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/02/windows/worker-1.jsonl $DATA/out/IS1009a.Mix-Headset.rttm`. Ghi: máy (CPU, RAM, Windows), hai dòng tóm tắt (khứ hồi p50/p90, xong ≤ 230 ms, RSS đỉnh, CPU % một lõi so với thời lượng tiếng nói), điểm (phải gần bằng bản macOS của cùng bản ghi ở Task 2), so ngân sách Windows i5 ≤ 10% một lõi và RAM ≤ 250 MB; khuyến nghị nếu vượt (1 luồng, bỏ đoạn < 1 s, tự tắt trên máy yếu: spec §14). Chưa có kết quả thì ghi "chờ chủ dự án" và để Task 9 nêu là việc còn mở.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short bench/2026-10-26-nguoi-noi/results/`
Expected: thêm `02-windows.md`. Không commit.

---

### Task 9: Tổng hợp, sửa spec, xin duyệt

**Files:**
- Tạo: `$B/results/02-tong-hop.md`
- Sửa: `$B/README.md` (mục "Kết quả", "Chạy lại"), `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md`

- [ ] **Step 1: Viết `$B/results/02-tong-hop.md`**

Một bảng: câu hỏi → kết quả (số) → file → việc phải đổi trong spec:
1. B' trong repo giống từng bit `simple_eval` (1, 2, 4, 8 s); onnxruntime cosine ≥ 0,999 (file 02 Task 4).
2. A-spk1 qua worker thật (trung bình 4 bản ghi; so mốc 91,8% / 84,9%) (Task 2).
3. A-spk2 qua worker thật, A2 4 s (trung bình 8 bản ghi) (Task 2).
4. Tải của worker khi nhúng tuần tự: khứ hồi p50/p90, ≤ 230 ms, RSS đỉnh, CPU % một lõi theo thời lượng tiếng nói (Task 2).
5. A-spk4: chênh A2 p50, p90, chữ đầu (Task 4); khứ hồi của nhãn (p50, p90, số đoạn ≤ 230 ms) và tỉ lệ nhãn tới trước kết quả nhận dạng khi chạy cùng `asr-worker`, `llama-server` (câu hỏi mở của kế hoạch 01).
6. Hàng đợi dịch bật so với tắt (QĐ 12 của file 02): số câu gộp, số lần gộp khác giọng, số câu `Skip` (Task 4 Step 3, 4), và kịch bản dịch quá tải (Task 4 Step 5: hàng dài nhất, chờ lâu nhất).
7. Soak ≥ 1 giờ: RSS đỉnh, xu hướng, CPU, số lệnh, năng lượng, số luồng thật của worker (Task 5).
8. Đóng gói: kích thước binary, bản nén, ước tính `.dmg` và bộ cài Windows so với giới hạn 60 000 000 byte, `minos 14.2`, ký ad-hoc, thư viện liên kết (Task 6, Task 8 Step 1).
9. Bảo mật: không mã mạng theo bốn lớp (cây phụ thuộc hai nền tảng, feature Windows, mã nguồn, ký hiệu nhập của binary) cùng ba lần thử âm tính, `cargo deny`, `cargo audit`, log; kiểm toàn vẹn trước mỗi lần chạy worker như `asr-worker` (cả thư mục `binaries/`, từ chối thư viện lạ), worker tự băm byte model đã đọc (`Load.model_sha256`); mô hình đe dọa của kênh stdin/stdout (khung ≤ 4 MiB, khung hỏng làm worker thoát và app coi worker đã chết, `Voices` ≤ 64 giọng, kênh nhãn tới luồng phụ đề ≤ 256 và đầy thì coi worker chết, mã đoạn lạ bị bỏ qua, không mạng; app là tiến trình cha nên khung của app được tin) (Task 7, file 02 Task 1, 4, 13, 17).
10. Windows i5 (Task 8; chưa có thì "chờ chủ dự án").
11. Thử app dev có nhận giọng (file 02 Task 19 Step 4, nếu chủ dự án đã cho chạy).

Thêm mục "Quyết định của kế hoạch 02 cần chủ dự án biết" (chép mục "Quyết định thiết kế" của file 02, ngắn; nhấn mạnh QĐ 12 hàng đợi dịch gộp khác giọng khi tồn đọng, QĐ 13 thử Trợ năng dời sang kế hoạch 04, QĐ 14 kênh nhãn có giới hạn), "Điều cần chủ dự án quyết" (chép mục cùng tên ở cuối file 02: phiên bản `libc`, `sha2`, số lần chạy lại worker; thêm kích thước gói nếu vượt), "Còn mở" (ít nhất: A-spk4 và hàng đợi dịch khi dịch chậm mới đo trên M4 Pro, máy yếu nhất là Windows i5 4 lõi, nghiệm thu ở kế hoạch 05/07; Windows i5 nếu Task 8 chưa có kết quả; đăng model ở kế hoạch 07) và "Ghi cho kế hoạch 03 và 04".

- [ ] **Step 2: Sửa spec theo số đo**

Chỉ sửa chỗ có số mới, mỗi chỗ ghi "(chốt ở kế hoạch 02, `results/02-<file>.md`)": §4.1 (worker thật: B', ưu tiên, số luồng đã kiểm; kiểm toàn vẹn cả thư mục và worker tự băm model), §4.2 (giao thức tối thiểu ở 02: `Load` mang `config`, `model_sha256`; `VoiceInfo` có `speech_ms`; `Error` có `segment_id`; phần để 04), §4.4 (khứ hồi và tỉ lệ nhãn đúng lúc khi chạy cùng hai tiến trình phụ; ngoại lệ hàng đợi dịch gộp khác giọng khi tồn ≥ 2 × `mt_max_waiting`, câu gộp không nhãn), §11 (A-spk4, RAM soak, CPU; Windows nếu có), §12 ("Kết quả kế hoạch 02": A-spk1, A-spk2 qua worker), §14 (rủi ro allocator: đã đo soak hay còn mở; Windows). **Không sửa §6.2** (thử Trợ năng dời sang kế hoạch 04): người điều phối sửa câu đó riêng; ở đây chỉ kiểm câu đó đã nói "dời sang kế hoạch 04", chưa thì nêu trong báo cáo Step 5. Không hạ mức nghiệm thu nào; số không đạt thì ghi và đưa vào "Điều cần chủ dự án duyệt".

- [ ] **Step 3: README của thư mục đo**

`$B/README.md`: mục "Kết quả" thêm năm file `02-*.md` (một dòng mỗi file); mục "Chạy lại" thêm `speaker-eval --worker` (Task 2), `session --speaker-worker --speaker-model [--rss-trace]` (Task 4, 5), gói Windows của kế hoạch 02 (Task 8).

- [ ] **Step 4: Mốc kiểm cuối**

Run: `cd $W && cargo fmt --all -- --check && CARGO_TARGET_DIR=$W/target cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target cargo test -p speaker-protocol -p speaker-worker -p audio-capture -p pipeline -p latency-bench 2>&1 | grep -E "^test result|FAILED" | sort | uniq -c && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED" && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)" && scripts/release/check-no-network.sh && git status --short`
Expected: mọi kiểm đạt; `git status` chỉ có file của kế hoạch 01, 02, 02b. Không commit.

- [ ] **Step 5: Xin chủ dự án duyệt**

Báo chủ dự án (tiếng Việt, ngắn): bảng tổng hợp, chỗ đã sửa spec, các quyết định của kế hoạch 02 cần duyệt (giao thức tối thiểu, cờ dev, model chưa đăng R2, khởi động lại và quá tải, **hàng đợi dịch gộp câu khác giọng khi tồn đọng và câu gộp không nhãn (QĐ 12)**, **thử quyền Trợ năng với binary `speaker-worker` thật dời sang kế hoạch 04 (QĐ 13; spec §6.2 vốn ghi kế hoạch 02)**, kênh nhãn có giới hạn (QĐ 14)), việc còn mở (A-spk4 trên i5, Windows, đăng model ở kế hoạch 07), và điều cần quyết (phiên bản `libc` 0.2.189 → 0.2.191 và `sha2` 0.11.0 → 0.11.1 lúc nào; số lần chạy lại worker; kích thước gói nếu vượt; A-spk4, RAM nếu không đạt). Hỏi luôn: cho phép commit phần đã làm của tính năng chưa. **Chỉ viết kế hoạch 03 sau khi chủ dự án duyệt.**

---

Phủ spec, "Để kế hoạch sau" và "Rủi ro" của cả hai file: ở cuối `2026-10-26-phan-biet-nguoi-noi-02-worker-pipeline.md`.
