# Phân biệt người nói: thư mục đo của kế hoạch 01 (spike)

Script, công cụ và kết quả tóm tắt của kế hoạch 01 (`docs/superpowers/plans/2026-10-26-phan-biet-nguoi-noi-01-spike.md`) cho
spec `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md`. Công cụ của nghiên cứu trước spec nằm ở `truoc-spec/`
(xem `truoc-spec/README.md`). Dữ liệu và model **không nằm trong git**; tải lại bằng các script dưới đây.

## Câu hỏi cần trả lời (spec §13 mục 1)

1. fbank Rust khớp `kaldi-native-fbank`; ERes2Net trên `candle-onnx` khớp onnxruntime (test của `crates/speaker-worker`).
2. A-spk1: code Rust gán đúng người trên AMI tới mức nào; chọn θ và ngưỡng gộp (Task 7).
3. A-spk2: gán người nói tiếng Việt, kể cả bản qua Opus (Task 8).
4. Tốc độ và RAM trên macOS và Windows i5; nhận giọng có xong trước nhận dạng không (Task 9, 9b, 13).
5. App 0.3.1 đọc được manifest có khóa `speaker` (Task 10).
6. Tiến trình con có hưởng quyền Trợ năng của app không (Task 11).
7. Chi phí trợ năng của Teams và Chrome; bật suốt phiên hay quanh lượt đọc (Task 12).
8. Chỉ báo "đang nói" của Teams khi bảng People đóng; bộ đọc UI Automation trên Windows (Task 12, 13).

## Ba thư mục

- `$W`: gốc worktree/clone của repo (nhánh `phan-biet-nguoi-noi`); `$B=$W/bench/2026-10-26-nguoi-noi` là thư mục này. Trong git:
  script và kết quả tóm tắt ở đây, crate `crates/speaker-worker` (`fbank`, `embed`, `cluster`; fixture nhỏ ở `testdata/`) và
  lệnh `speaker-eval`, `embed-probe` của `crates/latency-bench`.
- `$M`: bản checkout chính của repo, chỉ đọc. Có `$M/models/silero_vad_v6.2.3.onnx` (VAD Silero; `/models/` bị `.gitignore`).
- `$DATA`: thư mục NGOÀI repo cho dữ liệu và model; đặt theo máy của bạn (trong phiên làm việc này đặt cạnh repo; mặc định của
  `setup_env.sh` và `fetch_ami.sh` là `$W/../data-nguoi-noi`, đặt biến `DATA` để đổi). Gồm: `venv/` (Python), `models/` (model nhúng
  giọng), `ami/` (bản ghi và RTTM của AMI), `cv-vi/` (Common Voice tiếng Việt, xem `results/nhan-giong-tieng-viet.md`), `out/` (cache nhúng `<tên>.emb.json`,
  kết quả `<tên>.jsonl`, nhãn `<tên>.rttm`, `tune-*.json`), `ram-probe*/` (thí nghiệm RAM, xem Lưu ý).

Model nhúng giọng: `prepare_model.py` tải ERes2Net (3D-Speaker, Apache-2.0, bản ONNX của sherpa-onnx), kiểm SHA-256 file gốc
(`c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5`), rút gọn đồ thị bằng `onnxsim` (candle-onnx không chạy
được bản gốc), ghi vào `$DATA/models`: `eres2net-sv-en-voxceleb-16k.onnx` (bản rút gọn, dùng để đo), `….orig.onnx` (bản gốc)
và `eres2net-sv-en-voxceleb-16k-LICENSE.txt`. SHA-256 của bản rút gọn lúc đo ghi ở `results/toc-do.md`; script in lại số này.

## Chạy lại

```sh
W=...  M=...  DATA=...   # đặt theo máy của bạn
B=$W/bench/2026-10-26-nguoi-noi; VAD=$M/models/silero_vad_v6.2.3.onnx; MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx
export DATA; mkdir -p $DATA/models $DATA/ami $DATA/cv-vi $DATA/out
cd $W
$B/setup_env.sh                                                           # 1. venv Python ở $DATA/venv (cần `uv`)
$DATA/venv/bin/python -I $B/prepare_model.py $DATA/models                 # 2. tải và rút gọn model nhúng giọng
$DATA/venv/bin/python -I $B/make_fixtures.py $MODEL crates/speaker-worker/testdata   # 3. fixture của crate (chỉ khi đổi model)
$B/fetch_ami.sh                                                           # 4. 4 cuộc họp AMI (CC BY 4.0) + RTTM
cargo build --release -p latency-bench                                    # 5. nhúng mọi bản ghi một lần, lưu cache
for w in $DATA/ami/*.wav; do n=$(basename $w .wav); m=${n%%.*}; cp $DATA/ami/$m.rttm $DATA/out/$n.rttm
  RAYON_NUM_THREADS=2 target/release/latency-bench speaker-eval --wav $w --vad-model $VAD --speaker-model $MODEL \
    --embeddings-out $DATA/out/$n.emb.json --out $DATA/out/$n.jsonl; done
cd $B && $DATA/venv/bin/python tune.py $W/target/release/latency-bench $DATA/out \
  --dev ES2004a.Mix-Headset,TS3003a.Mix-Headset \
  --test IS1009a.Mix-Headset,EN2002a.Mix-Headset,IS1009a.Array1-01,ES2004a.Array1-01 --out $DATA/out/tune-ami.json   # 6. chọn ngưỡng
```

Không dùng `-I` cho `tune.py` (nó `import score_spk` cùng thư mục). Chấm một bản ghi với ngưỡng khác, từ cache (không cần model
hay WAV, dưới 1 s; `--merge-theta` lớn hơn 1, ví dụ 1,1, là không bao giờ gộp), rồi chấm (7):

```sh
$W/target/release/latency-bench speaker-eval --embeddings-in $DATA/out/<tên>.emb.json --theta <θ> --merge-theta 1.1 --out $DATA/out/<tên>.jsonl
$DATA/venv/bin/python -I $B/score_spk.py $DATA/out/<tên>.jsonl $DATA/out/<tên>.rttm
```

Các cờ khác của `speaker-eval` (`--end-silence-ms`, `--merge-min-ms`, `--min-new-ms`, `--window-s`, `--max-embed-s`,
`--embed-from`): `target/release/latency-bench speaker-eval --help`.

`build_cv_vi.py` (Task 8, tiếng Việt từ Common Voice 22.0 tiếng Việt, bản thường và bản qua Opus): `python -I build_cv_vi.py $DATA/cv-vi
$DATA/out/vi --n 6 --seed 0`, rồi `speaker-eval` và `tune.py` như trên (kế hoạch 01, Task 8 Step 3–4). Dữ liệu tải công khai từ bản
sao CC0 trên Hugging Face, không cần tài khoản; lệnh tải, nguồn, SHA-256 và các lệnh nhúng, chấm, `tune.py` ở mục "Cách chạy lại" của
`results/nhan-giong-tieng-viet.md`. Test của script (clip tổng hợp, không cần dữ liệu thật): `python -B -m unittest test_build_cv_vi`.

**Tốc độ và RAM** (macOS; chi tiết và mọi biến thể ở mục "Chạy lại" của `results/ram.md`):

```sh
cd $W && RAYON_NUM_THREADS=2 /usr/bin/time -l target/release/latency-bench speaker-eval --wav $DATA/ami/IS1009a.Mix-Headset.wav \
  --vad-model $VAD --speaker-model $MODEL --out /dev/null        # RAM đỉnh gồm cả Silero và âm thanh cả cuộc họp
RAYON_NUM_THREADS=2 /usr/bin/time -l target/release/latency-bench embed-probe --wav $DATA/ami/IS1009a.Mix-Headset.wav \
  --speaker-model $MODEL --start-s 120 --seconds <2|3|4|8> --repeat 20 [--window-s <s> [--cosine]]   # --cosine: lượt đó không dùng đo RSS
$DATA/venv/bin/python -I $B/rss_ort.py --wav $DATA/ami/IS1009a.Mix-Headset.wav --model $MODEL \
  --start-s 120 --seconds <2|4|8> --repeat 20 [--no-arena]        # mốc onnxruntime (không phải đề xuất dùng)
```

**Kế hoạch 02 (qua `speaker-worker` thật)**, bản dựng release với `MACOSX_DEPLOYMENT_TARGET=14.2`, `asr-worker` dựng với
`--features metal,shared-encode`; lệnh đầy đủ ở mục "Chạy lại" của từng file `results/02-*.md`:

```sh
cd $W && target/release/latency-bench speaker-eval --wav $DATA/ami/<tên>.wav --vad-model $VAD --speaker-model $MODEL \
  --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 --out $DATA/out/02/ami/<tên>.jsonl   # A-spk1, A-spk2 (Task 2)
cd $W && target/release/latency-bench session --wav <wav> --truth <truth.json> --asr-worker target/release/asr-worker \
  --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server <llama-server b11669> --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf \
  --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 [--mt-extra-ms 2000] \
  [--speaker-worker target/release/speaker-worker --speaker-model $MODEL] [--rss-trace <rss.tsv>] --out <ra>.json  # A-spk4, soak (Task 4, 5)
```

Gói Windows của kế hoạch 02 (Task 8, gộp gói Task 13 của kế hoạch 01): dựng bằng mingw-w64 như `results/02-windows.md`, đóng gói
ngoài repo ở `$DATA/win-pack-02.zip`; trên Windows chạy `powershell -ExecutionPolicy Bypass -File .\chay-tat-ca.ps1` rồi gửi lại
`ket-qua-gui-lai.zip`.

**Test**: `cd $B && $DATA/venv/bin/python -m unittest test_score_spk test_tune` (hay `python -I test_score_spk.py`);
`cd $W && cargo test -p speaker-worker -p latency-bench`; test cần model thật:
`SPEAKER_MODEL=$MODEL cargo test -p speaker-worker --release -- --ignored`.

## Các công cần người (hỏi chủ dự án trước; trả máy như cũ)

- Task 8: đã làm xong, không cần người nữa. Bản chính thức của Common Voice qua Mozilla Data Collective cần tài khoản và đồng ý
  điều khoản (không dùng); đã tải bản sao CC0 công khai trên Hugging Face vào `$DATA/cv-vi/` (`validated.tsv`, `clips/*.mp3`); cần
  `ffmpeg` có libopus. Công cụ `build_cv_vi.py` (có test `test_build_cv_vi.py`).
- Task 11: đã làm xong (macOS). Cần chạm Touch ID một lần để bật công tắc Trợ năng cho app thử `TccProbe.app` (System Settings).
  Công cụ `$B/tcc-probe/` (`parent.swift`, `child.swift`, `make-app.sh`; `TccProbe.app` bị `.gitignore`); kết quả ở
  `results/quyen-tro-nang.md`.
- Task 12: đã làm xong (macOS, Teams và Chrome/Meet). Cần máy có Teams đăng nhập tài khoản Microsoft cá nhân và Chrome đăng nhập
  tài khoản Google; phát giọng đọc máy qua loa (âm lượng ~45%), lưu và trả lại âm lượng. Khách Teams vào bằng `guests.py` qua
  `teams.live.com/v2/?meetingjoin=true#/meet/<mã>?p=<mật mã>&anon=true` (trang launcher không còn chuyển sang trình duyệt). Công cụ:
  `truoc-spec/doc-ten/` (`axtrace.swift`, `guests.py`, `run_schedule.py`), `cpu_sample.py`, `find_indicators.py` và `tro-nang/`
  (`axprobe.swift`: đọc, đặt, đếm cây trợ năng; `rus.swift`: số lệnh, chu kỳ, năng lượng mỗi tiến trình; `xen_ke.py`: đo xen kẽ
  các chế độ; `o_dang_noi.py`: chỉ báo nói theo ô; binary `axprobe`, `rus` bị `.gitignore`). Kết quả ở `results/teams-chrome.md`.
  Chưa làm: chỉ báo Teams khi khách mở mic mà im lặng, họp đông, có video; Edge; đo lại chi phí bằng bộ đọc thật của kế hoạch 02.
- Task 13: cần máy Windows (i5) do chủ dự án chạy. Mã `crates/speaker-worker/src/bin/uia-probe.rs` đã có (chỉ chạy trên
  Windows). File chạy Windows dựng từ macOS bằng mingw-w64 (target `x86_64-pc-windows-gnu`, không dùng `cargo-xwin` vì nó đòi
  chấp nhận điều khoản của Microsoft), đóng gói ngoài repo ở `$DATA/win-pack/` (+ `win-pack.zip`) cùng script `chay-toc-do.ps1` và
  hướng dẫn tiếng Việt. Phần Windows i5 của `results/toc-do.md` chờ kết quả `ket-qua-windows.zip` gửi về.
- Task 10 (hai test manifest có khóa `speaker` trong `src-tauri/src/models/manifest.rs`): không cần người; chạy bằng
  `cd $W && cargo test -p meeting-translator --lib models::manifest`.

Bài học khi thử trên máy thật (Chrome tự động và Chrome thường cùng bundle id nên nhắm theo pid; `meet.google.com/new` vào phòng
ngay với camera, micro bật; Dock che thanh điều khiển Meet; Chrome không cho tắt lại `AXManualAccessibility`): xem mục "Lưu ý khi
thử trên máy thật" của `truoc-spec/README.md`. Không chụp màn hình có camera. Task 12 thấy thêm: Chrome 156 không còn nhận
`AXManualAccessibility` (dùng `AXEnhancedUserInterface`; Chrome gỡ cây khi đặt lại false), Teams giữ cây trợ năng tới khi khởi động
lại; `%CPU` bị xung nhịp làm sai khi so tải, dùng số lệnh hay năng lượng (`tro-nang/rus`); ở màn hình chờ của Meet, xem trước camera
tự bật, tắt ngay bằng ⌘E (kiểm camera bằng CoreMediaIO trước mỗi ảnh chụp).

## Kết quả (`results/`)

- `nhan-giong-ami.md`: A-spk1. Chất lượng gán người nói của code Rust trên 4 cuộc họp AMI (6 bản ghi); ngưỡng θ và ngưỡng gộp chọn
  trên dev, báo trên phần kiểm; so với nghiên cứu trước spec; bảng nhạy theo θ.
- `toc-do.md`: Task 9. Thời gian nhúng mỗi đoạn, CPU và RAM trên macOS (1, 2 luồng, khi máy bận), so với ngân sách spec §11;
  mục Windows i5 chờ Task 13.
- `ram.md`: Task 9b. Các cách giảm RAM và CPU của nhúng giọng (mốc nguyên bản, onnxruntime, cửa sổ, cắt X giây, giải phóng tensor
  trung gian), nguyên nhân RSS chạy lâu cao hơn, khuyến nghị cho kế hoạch 02, mục "Chạy lại" và "Log".

- `nhan-giong-tieng-viet.md`: A-spk2 (Task 8). Chất lượng gán người nói trên hội thoại tiếng Việt dựng từ Common Voice 22.0 tiếng Việt
  (6 hội thoại, bản thường và Opus; θ = 0,35 và 0,40; ngưỡng chọn trên tiếng Việt trùng ngưỡng AMI); kết luận đạt theo trung bình,
  không đạt theo từng hội thoại (hai người nói gộp một giọng); bảng nhạy theo θ, hội thoại bổ sung seed 1, giới hạn.

- `quyen-tro-nang.md`: Task 11. Tiến trình con trong gói `.app` có hưởng quyền Trợ năng của app cha không (có), và quyền còn
  sau khi ký lại (mất khi cdhash đổi); điều kiện và giới hạn của phép thử.

- `teams-chrome.md`: Task 12. Phần tốn thêm của Teams và Chrome khi bật trợ năng và khi đọc cây (CPU, RAM, số lệnh, năng lượng;
  bật mà không đọc thì không tốn, đọc cả cửa sổ 4 lần/giây thì tốn 0,45–1,26 W), thời gian mỗi lượt đọc, dựng và gỡ cây; chỉ báo
  "đang nói" ở ô video Teams khi bảng People đóng (có, khớp 95–97%); kết luận cho spec §6.2, §6.4, §6.8.

- `tong-hop.md`: Task 15. Bảng trả lời 9 câu hỏi của kế hoạch 01, quyết định của chủ dự án, phần còn chờ (Windows, Task 13),
  điều cần duyệt và ghi cho kế hoạch 02.

Kế hoạch 02 (file `02-*.md`, đo qua `speaker-worker` thật):

- `02-nhan-giong-worker.md`: A-spk1, A-spk2 qua worker (02b Task 2), tải của worker khi gửi đoạn liền nhau, kiểm bổ sung RSS theo
  thời gian thực.
- `02-do-tre.md`: A-spk4 xen kẽ tắt/bật, khứ hồi của nhãn khi chạy cùng `asr-worker`, `llama-server`, hàng đợi dịch bật so với tắt
  kể cả khi dịch quá tải (02b Task 4).
- `02-soak.md`: soak 92 phút có vết RSS của ba tiến trình phụ, CPU, số lệnh, năng lượng (02b Task 5).
- `02-windows.md`: dựng `speaker-worker` cho Windows, ước tính bộ cài, gói đo trên i5; số đo trên i5 chờ chủ dự án (02b Task 8).
- `02-tong-hop.md`: bảng trả lời 11 câu hỏi của kế hoạch 02, đóng gói, bảo mật, điều cần chủ dự án quyết, còn mở (02b Task 9).

Chưa có: `windows-uia.md` (Task 13).

## Lưu ý

- Nhúng giọng tốn RAM theo độ dài đoạn (`candle_onnx::simple_eval` giữ mọi tensor trung gian); số đo ở `results/toc-do.md` và
  `ram.md`. Đừng chạy nhiều lượt nhúng song song, và đo RAM mỗi cấu hình trong một tiến trình riêng.
- Thí nghiệm B và B' của `ram.md` (vá `candle-onnx`, chia đồ thị, mimalloc, Accelerate, chạy lâu) nằm ở `$DATA/ram-probe/` và
  `$DATA/ram-probe-registry/`, **ngoài git**: `ram.md` dẫn tới đó (cùng thư mục `logs/`); muốn dựng lại phải có thư mục ấy.
- Đừng `cargo clean` trong worktree: `target/` được dùng lại (các thí nghiệm ngoài repo dựng bằng `CARGO_TARGET_DIR=$W/target`),
  build lại từ đầu tốn thời gian và đĩa (kế hoạch đòi còn ≥ 25 GB trống khi dựng thí nghiệm RAM).
