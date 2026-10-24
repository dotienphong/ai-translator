# Spike nguồn micro (2026-10-24)

Căn cứ của `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` §6. Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`.

## Thư mục

- `build_scene.py`: dựng track (`online.wav`, `room.wav`, `schedule.json`) từ clip FLEURS và câu ngắn dựng bằng `say`.
  Mọi clip được đưa về cùng mức −26 dBFS (FLEURS gốc chênh nhau tới 40 dB).
- `cues/`: lời nhắc tạo tiếng ồn cho cảnh 6 và 7.
- `run_scene_macos.sh`: phát track và thu một cảnh bằng `target/Capture.app`.
- `make_variants.py`, `variants/`: phương án cho `latency-bench mix-eval`.
- `score_mix.py`, `test_score_mix.py`: chấm một cảnh.
- `results/`: kết quả S-M4, bảng điểm, kết luận (`ket-qua.md`).
- `data/` (không có trong git): track, bản thu (có giọng người thật), kết quả `mix-eval`.

## Chạy lại

```bash
W=<worktree>; M=<thư mục chính có models/ và bench/phase0/data/>
B=$W/bench/2026-10-24-nguon-micro; D=$B/data
cd $W && cargo build --release -p latency-bench && crates/audio-capture/macos/make-app.sh capture
# asr-worker phải build có Metal như bản phát hành; không có feature thì chạy CPU, chậm khoảng 4 lần.
MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p asr-worker --features metal,shared-encode
uv run --no-project --python 3.12 --with "numpy==2.5.4" python $B/build_scene.py --fleurs $M/bench/phase0/data/asr/manifest.jsonl --out $D/tracks
$B/run_scene_macos.sh bench/2026-10-24-nguon-micro/data/scenes/s1-loa --tracks bench/2026-10-24-nguon-micro/data/tracks/s1-luot
./target/release/latency-bench denoise --input $D/scenes/<cảnh>/mic-raw.wav --reference $D/scenes/<cảnh>/mic.wav --out $D/scenes/<cảnh>/mic-rnnoise.wav
./target/release/latency-bench aec --playback $D/scenes/<cảnh>/playback.wav --mic $D/scenes/<cảnh>/mic.wav --out $D/scenes/<cảnh>/mic-aec.wav --delay-ms <đo bằng score_mix.py --echo-delay>
./target/release/latency-bench mix-eval --scene $D/scenes/<cảnh> --variants $B/variants/echo.json --asr-worker $W/target/release/asr-worker \
  --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --vad-model $M/models/silero_vad_v6.2.3.onnx --out $D/results/<cảnh>/echo
uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" \
  python $B/score_mix.py --scene $D/scenes/<cảnh> --results $D/results/<cảnh>/echo
```

`--asr-worker` phải là đường dẫn tuyệt đối.

## Ghi chú

- `mix-eval` không chạy hàng đợi, ghép câu, bước dịch hay prompt của đoạn trước: chỉ đo chữ của từng đoạn.
- `latency-bench` có vài crate trùng hai phiên bản (`base64`, `getrandom`, `hashbrown`, `syn`, `thiserror`), đều là Rust
  thuần, không có mã native, không có ggml. Chấp nhận được vì công cụ này không vào app.
- RNNoise (`nnnoiseless` 0.5.2) hạ tiếng ồn nền nhỏ (−60 dBFS) còn chưa tới 1%, nhưng tiếng ồn trắng to (−25 dBFS) chỉ
  còn khoảng 70%–86%: nó coi tiếng ồn băng rộng to là có thể là tiếng nói. Trễ 10 ms, `denoise` tự bù.
- Chạy thử trên cảnh giả lập (2026-10-24, M4 Pro, track `s1-luot`, tiếng vọng giả trễ 60 ms, mức 0,3): `--echo-delay`
  đo đúng 60 ms; AEC3 và RNNoise mỗi thứ tốn khoảng 0,3% một nhân; `mix-eval` 6 phương án hết 1,5 phút. Lượt này thấy
  whisper bịa câu "Hãy subscribe cho kênh…" ở một đoạn ngay trước tiếng online khi micro bị hạ: cần xem lại trên bản thu
  thật (Task 18).
