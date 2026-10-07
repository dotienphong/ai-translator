# S6 trên Windows: máy i5-1345U với GPU tích hợp, và cấu hình chỉ CPU

Ngày 2026-10-06 đến 2026-10-07. Kế hoạch: `docs/superpowers/plans/2026-09-29-phase-0-06-s6-do-tre.md`, Task 8 (bước 5 và 6, một phần) và Task 9 (một phần). Số gốc: `bench/phase0/results/latency/igpu-i5-1345u-*.json`, `cpu-i5-1345u-*.json`, `vram-igpu-i5-1345u-*.csv`.

## Máy và điều kiện đo

- Lenovo 21HE, Intel Core i5-1345U (2P + 8E, 12 luồng), RAM 31,7 GB, Intel Iris Xe (tích hợp, dùng chung RAM), Windows 11 Pro 10.0.26300, cắm điện, gói nguồn Balanced.
- `asr-worker` đã sửa cờ tối ưu MSVC (bản vá 0003, xem `s3_windows.md`), llama.cpp b11146 bản chính thức (`win-vulkan-x64`, `win-cpu-x64`), whisper.cpp 1.8.3 (có vá), session 180 giây × 6, cấu hình chốt (sàn `audio_ctx` 512, LID đoạn ngắn, luật lặp, ghép câu bật).
- Các lượt chạy tuần tự; mình không chạy việc nặng nào khác trong lúc đo, nhưng Docker Desktop và vài app nền của Windows vẫn mở, nên không kiểm soát được hoàn toàn nhiễu nền.
- Nhãn hạng là `thu`: **chỉ để tham khảo**, vì máy này không phải máy khuyến nghị cũng không phải máy tối thiểu của cổng §13. Cột A2 của `summarize.py` vì thế để trống; so sánh dưới đây là so tay.
- Máy mạnh hơn máy tối thiểu 8 GB trong spec (CPU 10 nhân đời 13, RAM 32 GB), nên **số của cấu hình chỉ CPU là cận trên tốt, không phải số của máy tối thiểu**.

## Kết quả (khoảng của 6 session: en, zh, ja, ko, vi, mixed; mỗi session 17–23 câu, đều ghép được 100% số câu)

| Cấu hình | p50 | p90 | Chữ đầu p50 | ASR p50 | Dịch p50 | RAM `asr-worker` / `llama-server` | CPU cả máy |
|---|---|---|---|---|---|---|---|
| iGPU, gói Chuẩn (turbo + Q8_0, Vulkan) | 2,72 – 5,38 s | 3,36 – 9,63 s | 1,53 – 1,93 s | 0,78 – 1,45 s | 1,08 – 2,71 s | 1124–1139 / 2499–2559 MB | 2–3% |
| iGPU, gói Nhẹ (small + Q4_K_M, Vulkan) | 1,34 – 2,55 s | 1,85 – 3,73 s | 0,91 – 1,03 s | 0,29 – 0,41 s | 0,58 – 1,52 s | 634–654 / 1702–1751 MB | 1–2% |
| Chỉ CPU, gói Nhẹ (small + Q4_K_M, `win-cpu-x64`) | 2,96 – 3,94 s | 3,87 – 6,21 s | 1,94 – 2,66 s | 1,38 – 2,04 s | 0,66 – 1,40 s | 339–342 / 2088–2139 MB | 32–46% |

Session `mixed` (cả năm ngôn ngữ): Chuẩn iGPU p50 3,36 s, Nhẹ iGPU 2,06 s, Nhẹ CPU 3,18 s.

VRAM (Windows, `vram_peak.py`): GPU tích hợp không có VRAM riêng (riêng lớn nhất = 0); bộ nhớ dùng chung lớn nhất: gói Chuẩn `asr-worker` 1040 MB, `llama-server` 2310 MB; gói Nhẹ 562 MB và 1502 MB.

Độ tin cậy: mốc dừng lệch tối đa 64 ms; luồng phát lại trễ tối đa 16 ms; chỉ vài đoạn bị bỏ qua (`no_speech` 1, `filler` 1–2, `same_lang` 1–2 mỗi cấu hình); LID nhầm 1 câu (vi, gói Chuẩn, sang ngôn ngữ đích) và 2 câu vi không có bản dịch ở đó. Hàng đợi dịch của gói Chuẩn có lúc đầy: p90 thời gian chờ trước luồng dịch 1,87 s (en), 1,97 s (ja), 3,67 s (zh), nên độ trễ của gói Chuẩn trên iGPU còn lớn hơn riêng thời gian dịch. Chưa mô phỏng §7 (hàng đợi tối đa 3, bỏ đoạn quá 20 giây), nên trên máy chậm số đo có thể bi quan hơn app thật.

## So với các mốc

| Mốc | Kết quả |
|---|---|
| A2 (p50 ≤ 2,0 s, p90 ≤ 3,0 s, chữ đầu p50 ≤ 1,0 s), gói Chuẩn trên iGPU | **Không đạt** ở mọi session (p50 nhỏ nhất 2,72 s). Bước dịch Q8_0 trên Iris Xe là nút thắt chính (1,1–2,7 s mỗi câu) |
| A2, gói Nhẹ trên iGPU | **Gần ngưỡng nhưng chưa đạt**: p50 vượt 2,0 s ở 5/6 session (2,06–2,55 s; riêng vi 1,34 s), p90 vượt 3,0 s ở 5/6 session, chữ đầu 0,91–1,03 s (chỉ ja, 1,03 s, vượt 1,0 s) |
| Ngưỡng máy tối thiểu p50 ≤ 3,5 s, gói Nhẹ chỉ CPU | **Đạt ở 5/6 session** (en 2,96; ja 3,27; ko 3,37; mixed 3,18; vi 2,97) và **không đạt ở zh (3,94 s)**. Ja (3,27 s) và ko (3,37 s) chỉ dưới ngưỡng một chút, sát vùng "sát ngưỡng" (3,4–3,5 s) mà mẫu `s6_latency.md` coi là chưa đạt chắc chắn; p90 lên tới 6,2 s |
| CPU ≤ 30% cả máy (§8, máy khuyến nghị) | Chỉ CPU: 32–46%, vượt. Không áp dụng chính thức vì đây không phải máy khuyến nghị |

## Kết luận và việc còn lại

- **Giả định 4 (gói Chuẩn trên GPU tích hợp):** số đo ủng hộ việc **không đề xuất gói Chuẩn cho GPU tích hợp** (ví dụ Iris Xe), nhất quán với đề xuất theo VRAM/loại thiết bị ở §6.7. Chưa đo GPU tích hợp mạnh hơn (Arc, Radeon 780M…).
- **Gói Nhẹ trên GPU tích hợp** gần đạt A2 và chắc chắn đạt ngưỡng 3,5 s của máy tối thiểu.
- **Máy tối thiểu (Windows 8 GB, chỉ CPU):** vẫn **chưa đo**. Trên một máy CPU mạnh hơn nhiều, gói Nhẹ chỉ CPU đã chỉ đạt ngưỡng 3,5 s ở 5/6 session, và RAM của hai tiến trình phụ khoảng 2,4 GB. Máy 8 GB thật (CPU 4 nhân, đời cũ hơn) nhiều khả năng chậm hơn, nên điều kiện p50 ≤ 3,5 s của cổng §13 vẫn là **rủi ro chưa giải quyết**, không nên coi kết quả này là đủ để qua cổng.
- **Chưa đo:** card rời 6 GB và 4 GB (ngưỡng VRAM §6.7), M1 16 GB, máy 8 GB chỉ CPU thật.
- **Lưu ý khi dùng số cũ:** nếu có số `asr-worker-cpu` nào trên Windows do bản build trước bản vá 0003 sinh ra thì không dùng được (chậm gấp khoảng 14 lần); xem `s3_windows.md`.

## Llama chạy CPU, Whisper chạy iGPU (2026-10-07)

Cùng máy, gói Nhẹ (small + Q4_K_M), session en, ja, mixed, mỗi cấu hình một lượt. Chỉ khác `--llama-args="-ngl 0"` (llama-server chạy CPU, `asr-worker` vẫn Vulkan). Số gốc: `latency/opt-i5-1345u-thu-nhe-*.json` (cả hai Vulkan) và `latency/opt-i5-1345u-thu-nhe-ngl-0-*.json` (llama CPU).

| Cấu hình | p50 (en / ja / mixed) | p90 | Dịch p50 |
|---|---|---|---|
| Whisper iGPU + Llama iGPU | 2,39 / 2,28 / 2,06 s | 3,21 / 3,58 / 3,08 s | 1,28 / 1,51 / 1,19 s |
| Whisper iGPU + **Llama CPU** | **1,84 / 2,02 / 1,82 s** | **2,49 / 2,61 / 2,83 s** | **0,88 / 1,18 / 0,91 s** |

- Đo riêng `llama-server` (3 câu × 2 lượt): CPU sinh 44 tok/s, Vulkan Iris Xe 27 tok/s; xử lý prompt Vulkan nhanh hơn (~205 so với 300–400 ms) nhưng sinh chữ chậm hơn nên tổng mỗi câu CPU 0,84–1,09 s, Vulkan 1,02–1,32 s.
- Khi hai engine cùng dùng iGPU, log `llama-server` của app ghi những lần xử lý prompt 5–8 token mất 1,6–2,6 s (bình thường ~100 ms): nghi tranh chấp GPU với `asr-worker`.
- Mỗi cấu hình chỉ một lượt. Độ lặp lại: lượt cả hai Vulkan hôm nay so với lượt hôm qua (`igpu-i5-1345u-thu-nhe-*`) lệch p50 chỉ 0–0,1 s (en 2,49 → 2,39; ja 2,28 → 2,28; mixed 2,06 → 2,06), nhỏ hơn mức cải thiện 0,2–0,55 s của Llama CPU. Vẫn chưa phải kết luận thống kê.
- Áp dụng vào app: máy Windows chỉ có GPU tích hợp (không có card rời) thì `llama-server` chạy `-ngl 0` (`src-tauri/src/sidecar/mod.rs`, `probe::only_integrated_gpu`). Card rời và macOS giữ nguyên.
