# Bộ giới hạn mức thay cho `tanh`, và câu ngắn khi tắt lọc ồn (2026-10-24)

Sau thử tay (`thu-tay-mac.md`). Chủ dự án chọn làm theo đề xuất của Claude cho hai phát hiện:
- khuếch đại +20 dB kèm `tanh` bão hòa khi micro to;
- câu một hai chữ bị bỏ ở chế độ micro.

## Điều kiện

- Như `ket-qua.md`: M4 Pro, `latency-bench mix-eval`, VAD 0,5, đóng đoạn sau 500 ms.
- Năm cảnh của spike, thêm cảnh `thu-tay-u`: 12 giây thu lúc thử tay, tiếng ù trầm −8 đến −14 dBFS suốt bản thu, giọng
  "Linh" của macOS đọc "Doanh thu tháng này tăng khoảng mười phần trăm so với tháng trước", rồi "Đúng rồi", "Cảm ơn".
- Phương án có trong `variants/limiter.json`, `limiter2.json`, `chot-moi.json`. Script: `data/chay-limiter.sh`.

## Các phương án đã thử (gói Chuẩn)

Mọi phương án đều lọc 80 Hz **trước** khuếch đại. Bản VAD qua RNNoise, trừ chỗ ghi "không lọc".

| Phương án | Giọng thật 1 m (WER) | Điện thoại 1 m: lỗi / giữ | 3 m: lỗi / giữ | Phòng ồn: câu ngắn / lỗi | Ảo, cảnh 6 | Cảnh có tiếng ù |
|---|---|---|---|---|---|---|
| Chốt cũ: `tanh` cả hai bản, lọc 80 Hz sau | 44,0% | 33,5% / 80% | 55,3% / 44% | 39,5% / 69,9% | 1 | "Doanh thủ… 1000%…" và một câu ảo |
| Bộ giới hạn trần 0,5 cả hai bản | 48,0% | 34,2% / 72% | 55,1% / 44% | 39,5% / 70,7% | 1 | "10% so với tháng trước" (đoạn mở muộn 1,8 giây) |
| Bộ giới hạn trần 0,9 cả hai bản | 44,0% | 30,1% / 84% | 55,1% / 44% | 39,5% / 69,9% | 1 | như trên |
| Whisper: bộ giới hạn trần 0,5; VAD: `tanh` | 48,0% | 32,6% / 76% | 54,6% / 44% | 39,5% / 70,7% | 1 | đúng nguyên câu |
| **Whisper: bộ giới hạn trần 0,9; VAD: `tanh` (chốt mới)** | **44,7%** | **30,0% / 84%** | **54,9% / 44%** | **39,5% / 69,9%** | **1** | **đúng nguyên câu** |

- Bộ giới hạn ở bản VAD làm bản đó nhỏ đi, và Silero kém nhạy hơn: ở cảnh có tiếng ù, đoạn mở muộn và mất nửa câu.
- Bản VAD không cần âm thanh trung thực nên giữ `tanh`. Bản whisper cần không méo nên dùng bộ giới hạn.
- Trần 0,5 làm bộ giới hạn hạ mức cả phần câu sau một đỉnh vừa phải (điện thoại 1 m có đỉnh khoảng −5 dBFS sau khuếch đại),
  nên giữ ít câu hơn. Trần 0,9 thì không.
- Ở cảnh có tiếng ù, mọi phương án đều mất "Đúng rồi" và "Cảm ơn".

## Chốt mới, hai gói

| | Giọng thật 1 m | Điện thoại 1 m: lỗi / giữ | 3 m: lỗi / giữ | Phòng ồn: câu ngắn / lỗi | Ảo, cảnh 6 |
|---|---|---|---|---|---|
| Gói Chuẩn, cũ | 44,0% | 33,5% / 80% | 55,3% / 44% | 39,5% / 69,9% | 1 |
| **Gói Chuẩn, mới** | **44,7%** | **30,0% / 84%** | **54,9% / 44%** | **39,5% / 69,9%** | **1** |
| Gói Nhẹ, cũ | 58,0% | 40,9% / 68% | 63,2% / 36% | 42,1% / 74,2% | 1 |
| **Gói Nhẹ, mới** | **52,0%** | **39,3% / 76%** | **62,4% / 40%** | **42,1% / 73,5%** | **1** |

Mọi số bằng hoặc tốt hơn cách cũ. Giọng thật gói Chuẩn kém hơn 0,7 điểm, trong ngưỡng chống thụt lùi 10%.

## Lọc ồn tắt: `min_speech_ms` 250

| Gói Chuẩn | Giọng thật 1 m | Điện thoại 1 m | 3 m | Phòng ồn | Ảo, cảnh 6 | Cảnh có tiếng ù |
|---|---|---|---|---|---|---|
| Lọc ồn tắt, 250 ms | 36,7% | 30,4% / 76% | 71,2% / 36% | 0% / 97,5% | 1 | không có đoạn nào |

- Phòng yên tĩnh: tốt ngang hay tốt hơn lọc ồn bật, và không thêm chữ ảo khi gõ phím.
- Phòng ồn hay có tiếng ù: gần như không còn câu nào. Ghi chú dưới công tắc nói đúng điều này.

## Đổi trong app

- `crates/audio-capture/src/mic_chain.rs`: `Limiter` (tới +20 dB, trần 0,9, đường bao hạ dần 300 ms). Lọc 80 Hz trước khuếch
  đại. Bản VAD giữ `tanh`. Test `loud_rumble_does_not_crush_the_voice`: giọng 300 Hz cạnh tiếng ù 50 Hz −8 dBFS giữ nguyên tỉ
  lệ với tiếng ù; với `tanh` cũ tỉ lệ này tụt khoảng 16 dB.
- `src-tauri/src/session.rs`: chế độ micro tắt lọc ồn thì `min_speech_ms` 250.
- Ghi chú dưới công tắc "Lọc tiếng ồn micro", năm ngôn ngữ: câu một hai chữ có thể bị bỏ; phòng yên tĩnh thì tắt để giữ.
