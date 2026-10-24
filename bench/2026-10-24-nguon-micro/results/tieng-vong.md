# Đo tiếng vọng: chế độ âm thanh máy + micro (Task 18, 2026-10-24)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`, Task 18. Spec §5.4, §6.3.

**Điều kiện:**
- Bản thu: `s1-loa` (cảnh 1, nói lần lượt, 5,4 phút) và `s2-loa` (cảnh 2, khoảng 30% nói chồng, 4 phút). Xem `thu-macos.md`.
- `latency-bench mix-eval`:
  - `asr-worker` có Metal (`--features metal,shared-encode`), model gói Chuẩn `ggml-large-v3-turbo-q5_0.bin`;
  - Silero VAD v6.2.3, `end_silence_ms` 50;
  - luật lọc mặc định của app.
- Chấm: `score_mix.py` (WER cho en và vi, CER cho zh, ja, ko; trung bình các tiếng).
- **Cảnh 3 (tai nghe có dây) không thu** vì không có thiết bị. Mốc "không có tiếng vọng" lấy từ `doi-chung-playback`:
  whisper nghe thẳng bản số của tiếng online, tức điều kiện còn sạch hơn đeo tai nghe.

## Độ trễ vọng

`score_mix.py --echo-delay`: −20 ms (cảnh 1), −10 ms (cảnh 2). Micro đi trước âm thanh máy trong hai file vì đường thu
qua tap trễ hơn đường micro. Lệnh `aec` vì thế chạy với `--delay-ms 0` (AEC3 không nhận số âm).

AEC3 (`sonora`) và RNNoise mỗi thứ tốn khoảng 0,3% một nhân trên M4 Pro.

## Kết quả (rút gọn; bảng đầy đủ ở `data/results/<cảnh>/echo/score.md`)

| Phương án | C1: lỗi online | C1: lỗi trong phòng | C1: giữ trong phòng | C2: lỗi online | C2: lỗi trong phòng | C2: giữ trong phòng |
|---|---|---|---|---|---|---|
| Mốc không vọng (`doi-chung-playback`) | 8,5% | – | – | 10,1% | – | – |
| Chỉ micro (`doi-chung-mic`) | 14,8% | 6,4% | 100% | 55,6% | 51,0% | 53,3% |
| A, trộn thẳng | 22,3% | 7,4% | 100% | 24,5% | 65,7% | 33,3% |
| C, AEC3 rồi trộn | 10,1% | 8,7% | 100% | 28,6% | 69,8% | 26,7% |
| **B, ngưỡng −55 dBFS, hạ 30 dB, giữ 300 ms** | **7,7%** | **7,2%** | **100%** | **11,0%** | **69,2%** | **26,7%** |
| B, ngưỡng −55, hạ 12 dB, giữ 300 ms | 7,1% | 7,2% | 100% | 11,9% | 63,6% | 26,7% |
| B, ngưỡng −55, tắt hẳn micro, giữ 150 ms | 7,8% | 7,2% | 100% | 11,1% | 68,6% | 26,7% |

Mọi phương án B với ngưỡng −55 dBFS đều cho lỗi online 7,1–8,5% ở cảnh 1 và 11,0–12,4% ở cảnh 2. Ngưỡng −45 và
−35 dBFS kém hơn một chút. Không phương án nào sinh chữ ảo.

## Áp luật chốt (spec §6.3)

- **Mức đạt của B:**
  - **Cảnh 1, lỗi online:** 7,7% ≤ 8,5% × 1,10 = 9,35%. **Đạt.**
  - **Cảnh 1, giữ câu trong phòng:** 100% (chỉ micro cũng 100%). **Đạt.**
  - Cảnh 2 (kiểm thêm): lỗi online 11,0% ≤ 10,1% × 1,10 = 11,1%. Đạt sát mức.
- **Có nâng lên C không:** không.
  - **Cảnh 2, lỗi trong phòng:** C 69,8% so với B 69,2%, không tốt hơn B (điều kiện là tốt hơn ít nhất 20%).
  - **Lỗi online:** C kém B ở cả hai cảnh (10,1% so với 7,7%; 28,6% so với 11,0%).
- **Chọn: B, ngưỡng −55 dBFS, hạ 30 dB, giữ 300 ms.** Đây là bộ có tổng lỗi online của hai cảnh thấp nhất trong các bộ
  giữ 100% câu trong phòng ở cảnh 1.

**Giới hạn đã biết (đúng như spec ghi):** khi hai bên nói chồng, cả B lẫn C đều mất phần lớn câu trong phòng (giữ khoảng
20–33% ở cảnh 2). Chỉ micro giữ được 53%, nhưng lại hỏng tiếng online.

## Bước 6: VAD chặt hơn và khuếch đại micro ở chế độ trộn

`variants/both-vad.json`: B đã chọn × khuếch đại {0, +20 dB} × VAD {0,5; 0,6; 0,7} × {250, 400, 600 ms}.

| Phương án | C1: lỗi online | C1: lỗi trong phòng | C2: lỗi online | C2: lỗi trong phòng |
|---|---|---|---|---|
| B, VAD mặc định (0,5 / 250), khuếch đại 0 | 7,7% | 7,2% | 11,0% | 69,2% |
| B, 0,5 / 600, khuếch đại 0 | 7,3% | 6,8% | 10,4% | 69,6% |
| B, 0,5 / 250, **+20 dB** | 12,1% | 5,9% | 14,6% | 66,4% |
| B, 0,5 / 400, +20 dB | 8,3% | 5,9% | 12,4% | 66,4% |
| **B, 0,5 / 600, +20 dB** | **7,9%** | **5,4%** | **11,6%** | **66,0%** |
| B, 0,6 / 600, +20 dB | 7,9% | 5,4% | 12,3% | 66,0% |
| B, 0,7 / 600, +20 dB | 8,6% | 5,1% | 11,7% | 65,8% |

- **Khuếch đại +20 dB kèm `min_speech_ms` 600 ms không hại tiếng online:**
  - cảnh 1: 7,9% so với 7,7%, tệ thêm 2,6% (tương đối);
  - cảnh 2: 11,6% so với 11,0%, tệ thêm 5,5%, sát mức 5% của §6.3;
  - lỗi câu trong phòng giảm (cảnh 1 từ 7,2% xuống 5,4%).
- **Khuếch đại +20 dB với `min_speech_ms` 250 ms thì hại tiếng online** (cảnh 1: 12,1%). Nếu chọn khuếch đại micro thì
  phải đi kèm `min_speech_ms` từ 600 ms.
