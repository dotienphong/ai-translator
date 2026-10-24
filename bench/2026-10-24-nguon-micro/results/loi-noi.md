# Nhường lời theo tiếng nói của âm thanh máy: đo offline (2026-10-25)

Spec nguồn micro mục 17; kế hoạch `docs/superpowers/plans/2026-10-25-nguon-micro-05-nhuong-loi-theo-tieng-noi.md`, Task 5.
Commit `1c7288cf`. MacBook Pro M4 Pro, macOS 26.6.2, `asr-worker` có Metal (mọi `asr-worker.log` có `Metal total size`),
gói Chuẩn, phương án `variants/both-loi-noi.json`:

- `CU`: cách cũ của mục 16 (hạ −30 dB khi âm thanh máy ≥ −55 dBFS);
- `TAT`: chỉ đổi sang tắt hẳn micro, chưa có Silero;
- `LOINOI`: cách mới của app (tắt hẳn micro khi ≥ −55 dBFS hoặc Silero ≥ 0,5);
- `PB-app`: chế độ Âm thanh máy (mốc).

## Kết quả: lỗi online (câu `s1-loa` kèm lỗi trong phòng)

| Cảnh | Ý nghĩa | CU | TAT | **LOINOI** | PB-app | Mức đạt của kế hoạch | Đạt? |
|---|---|---|---|---|---|---|---|
| `s1-loa` | A-trộn, nói lần lượt | 9,0% / 5,2% | 4,2% / 4,4% | **4,4% / 4,4%** | 8,5% / – | online ≤ 10,78%, phòng ≤ 5,72% | **Đạt** |
| `s2-loa` | nói chồng (báo cáo) | 23,4% / 76,0% | 21,6% / 69,1% | 21,6% / 69,1% (giữ 26,7%) | 10,1% / – | so với CU | Tốt hơn CU |
| `nen-h10` | online −36 dBFS | 5,1% | 4,9% | **4,9%** | 8,2% | ≤ CU × 1,10 = 5,61% | **Đạt** |
| `nen-h20` | online −46 dBFS | 5,8% | 6,8% | **6,8%** | 9,1% | ≤ CU × 1,10 = 6,38% | **Trượt 0,4 điểm** |
| `nen-h30` | online −56 dBFS | 13,7% | 12,0% | **7,3%** | 9,1% | ≤ PB-app × 1,10 = 10,0% | **Đạt** |
| `nen-h36` | online −62 dBFS | 80,0% | 72,1% | **15,8%** | 12,5% | ≤ PB-app × 1,10 = 13,75% | **Trượt 2,05 điểm** |
| `ao-tron-can` | A-ảo, 0 câu ảo; lỗi ≤ 5,2% × 1,10 | 5,2% | 4,9% | **6,2%** (0 câu ảo) | 8,5% | ≤ 5,72% | **0 câu ảo đạt; lỗi trượt 0,5 điểm** |
| `he-thong-mic` | tái hiện A7 | sai (câu lạ) | sai (câu lạ) | **đúng** | đúng | chép đúng câu mẫu | **Đạt** |

`nen-h*`: giọng online hạ 10, 20, 30, 36 dB, micro chỉ có tiếng nền phòng thật (−45 dBFS). `he-thong-mic`: bản thu tap toàn
hệ thống cùng micro của `Capture.app` (câu mẫu −65 dBFS, như A7).

Tái hiện A7 (`he-thong-mic`, 4 đoạn có tiếng):
- `CU` và `TAT`: "and we will stay to find the best system…", "The results of the activity of the system is the same as
  the local government." (câu lạ, như phiên A7);
- `LOINOI`: "Analysis will be posted to a public website.", "The results of plotting analysis will be posted to a public
  website.", "…planning analysis… the public website.", "The results of plotting analysis will be posted to a public website.";
- `PB-app`: đúng ở cả bốn đoạn.

## Nguyên nhân ba chỗ trượt

| Chỗ trượt | Do đâu |
|---|---|
| `nen-h20` (+1,0 so với CU) | Do bước đổi sang **tắt hẳn** (TAT cũng 6,8%), không do Silero. 17/78 clip khác CU, đa số khác dấu câu hay một từ tiếng Hàn; câu tiếng Nhật và tiếng Việt ở LOINOI còn tốt hơn CU. |
| `ao-tron-can` (+1,0 so với CU, +1,3 so với TAT) | Do Silero. Chỉ 4/78 clip khác CU, trong đó 1 clip tiếng Hàn bị whisper chép lặp một cụm; 2 clip tiếng Việt và 1 clip tiếng Anh gần như giống nhau (LOINOI không tệ hơn). |
| `nen-h36` (+3,3 so với PB-app) | Đầu câu lọt tiếng nền micro: 2/92 đoạn mở đầu bằng chữ lạ ("I mean, there's a lot of meaning.", "I'm not saying…"); `PB-app` 0/135. Đúng điều spec mục 17 đã nêu trước (một hai khung đầu câu giọng nhỏ lọt qua). 30/78 clip khác PB-app, nhưng phần lớn là khác dấu câu hay một từ tiếng Hàn/Nhật. |

## Ghi chú về độ tin cậy

- Mỗi cảnh chỉ 78 clip, trong đó nhiều clip ngắn; whisper chạy tham lam (greedy), nên đổi vài mẫu âm thanh có thể đổi một
  từ hay một dấu câu của cả clip. Chênh 0,4–1 điểm ở `nen-h20` và `ao-tron-can` tương đương một hai từ.
- Mức đạt "≤ 1,10 × mốc" ở kế hoạch là quy ước chống thụt lùi của spike (spec mục 16). Với mẫu nhỏ như vậy, mức này chặt
  hơn độ phân giải của phép đo.
- Cả ba chỗ trượt đều có `LOINOI` tốt hơn hẳn cách cũ ở trường hợp mà thiết kế nhắm tới: `nen-h30` 13,7% → 7,3%,
  `nen-h36` 80,0% → 15,8%; A7 được nhận đúng.
- Chưa đo chi phí và A2 trên app thật (Task 6).

## Kết luận

Chưa đủ mức đạt theo kế hoạch: ba tiêu chí trượt 0,4–2 điểm. Theo kế hoạch, dừng và báo chủ dự án; không tự chỉnh ngưỡng.
Dữ liệu (không commit): `data/results/<cảnh>/loi-noi/`.
