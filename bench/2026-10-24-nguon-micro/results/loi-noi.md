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

## Đo lại với nhiều clip khác nhau (2026-10-25)

Lượt đo đầu chỉ có 30 clip khác nhau (câu mẫu lặp 48 lần), nên chênh 0,4–2 điểm ở trên nằm trong nhiễu của mẫu. Đo lại bằng
`build_lon.py` (`score_mix.py --subset` chấm riêng nửa chẵn và nửa lẻ của lịch clip để chỉnh trên nửa này, kiểm nửa kia; lượt này
không phải chỉnh gì nên cả hai nửa chỉ để kiểm độ ổn định). Mỗi clip FLEURS khác nhau, 4–12 giây, không phải băng hẹp.

**Cảnh số hóa `lon-h<dB>`:** 230 clip online, 40,3 phút. Âm thanh máy là track hạ `<dB>` dB, micro chỉ có tiếng nền phòng thật
(−45 dBFS, `im-lang`). Mức đạt theo spec mục 17: −36 và −46 dBFS không xấu hơn cách cũ quá 10%; −56 và −62 dBFS không xấu hơn
chế độ Âm thanh máy quá 10%.

| Giọng online | CU (cũ) | TAT | **LOINOI** | PB-app | Mức đạt | Nửa chẵn / nửa lẻ của LOINOI | Kết quả |
|---|---|---|---|---|---|---|---|
| −36 dBFS | 7,9% | 7,7% | **7,7%** | 10,1% | ≤ 8,69% | 6,3% / 9,1% (đạt cả hai) | **Đạt** |
| −46 dBFS | 8,6% | 7,4% | **7,8%** | 10,3% | ≤ 9,46% | 7,4% / 8,1% (đạt cả hai) | **Đạt** |
| −56 dBFS | 17,6% | 16,0% | **9,5%** | 11,8% | ≤ 12,98% | 9,4% / 9,9% (đạt cả hai) | **Đạt** |
| −62 dBFS | 83,9% | 78,1% | **15,0%** | 15,8% | ≤ 17,38% | 15,2% / 15,3% (đạt cả hai) | **Đạt** |

Chữ ảo: 0 ở cả bốn cảnh, cả bốn phương án.

**Bản thu thật `lon-thu-can`:** 144 clip (104 online, 40 trong phòng), 26,1 phút, loa 60%, micro tích hợp. Thu bằng
`run_scene_macos.sh`: không rớt khung, không chèn lặng. Tap và micro lệch cố định 1 020 ms (đo ở đầu, giữa, cuối), cắt 1 020 ms
đầu của hai file micro, sau đó độ trễ vọng 0 ms. Trong phòng 40 clip chỉ qua micro.

| Chỉ tiêu | CU (cũ) | TAT | **LOINOI** | PB-app | Mức đạt | Kết quả |
|---|---|---|---|---|---|---|
| Lỗi online | 8,0% | 8,1% | **8,4%** | 10,3% | ≤ CU × 1,10 = 8,8% | **Đạt** |
| Lỗi trong phòng | 7,5% | 7,5% | **7,5%** | (không nghe) | ≤ CU × 1,10 = 8,25% | **Đạt** |
| Giữ câu trong phòng | 100% | 100% | **100%** | 0% | 100% | **Đạt** |
| Chữ ảo (26 phút) | 0 | 0 | **0** | 0 | ≤ 1 mỗi 10 phút | **Đạt** |

Mốc A-trộn tuyệt đối của spec mục 16 (online ≤ 10,78%, phòng ≤ 5,72%) đo trên cảnh `s1-loa` 30 clip: `LOINOI` 4,4% / 4,4%, đạt.
Bộ clip mới có mức lỗi nền khác (phòng 7,5% với cả cách cũ), nên ở đây so với cách cũ trên cùng bộ clip.

**So từng clip với cách cũ và với chế độ Âm thanh máy** (kiểm dấu hai phía, chỉ tính clip có khác biệt):

| Cảnh | So với | Online: tốt hơn / tệ hơn / bằng | Tổng lỗi (LOINOI vs đối chứng) | p |
|---|---|---|---|---|
| `lon-thu-can` | CU | 5 / 8 / 91 | 258 vs 246 | 0,58 |
| `lon-thu-can` | CU, trong phòng | 0 / 0 / 40 | 96 vs 96 | 1,00 |
| `lon-thu-can` | PB-app | 36 / 15 / 53 | 258 vs 316 | 0,005 |
| `lon-h10` | CU | 23 / 25 / 182 | 507 vs 513 | 0,89 |
| `lon-h20` | CU | 38 / 33 / 159 | 521 vs 576 | 0,64 |
| `lon-h30` | CU | 134 / 18 / 78 | 604 vs 1 232 | < 0,001 |
| `lon-h36` | CU | 226 / 2 / 2 | 891 vs 5 700 | < 0,001 |
| `lon-h36` | PB-app | 67 / 79 / 84 | 891 vs 884 | 0,36 |

Đọc: ở mức giọng bình thường cách mới **không khác** cách cũ (không có chênh lệch có ý nghĩa; người trong phòng giống hệt);
ở giọng nhỏ cách mới tốt hơn hẳn và **ngang chế độ Âm thanh máy** (−62 dBFS: 891 so với 884 lỗi).

Máy: MacBook Pro M4 Pro, macOS 26.6.2, `asr-worker` có Metal (mọi `asr-worker.log` có `Metal total size`), gói Chuẩn. Dữ liệu và
kết quả không commit (`data/`).

## Giảm chi phí Silero (2026-10-25)

Trong app, Silero gọi ở mọi khung tốn trung bình 1,7 ms mỗi khung (xem "Đo trong app" ở `nghiem-thu.md`), nên thử bỏ các khung
không cần hỏi. Hai núm, mỗi cái tắt/bật độc lập trong `variants/*.json` của `mix-eval`:

- bỏ khung to (từ −55 dBFS; cổng năng lượng đã hạ micro rồi) — luôn bật;
- bỏ khung im lặng (dưới `speech_floor_dbfs`), và (đã thử rồi gỡ) xóa state Silero sau `speech_reset_gap` khung bỏ qua.

Lưới thử trên `lon-h36` (giọng −62 dBFS, cảnh khó nhất; lỗi online, 230 clip), đối chiếu `LOINOI` chưa tối ưu 15,0% và mức đạt
≤ 17,38%:

| Biến thể | Mức im lặng | Xóa state sau | Silero được hỏi | Lỗi online |
|---|---|---|---|---|
| V0 | −80 dBFS | 16 khung | 43 192 / 75 550 | **21,4% (trượt)** |
| **V1** | **−80 dBFS** | **không xóa** | 43 192 / 75 550 | **12,7%** |
| V2 | −120 dBFS | 16 khung | 58 024 / 75 550 | 15,4% |
| V3 | −120 dBFS | không xóa | 58 024 / 75 550 | 13,7% |
| V4 | không bỏ | không xóa | 73 559 / 75 550 | 16,7% |

Đọc:
- Lần tối ưu đầu (V0) xấu đi vì xóa state sau 0,5 giây nghỉ: câu nhỏ mở đầu sau khoảng nghỉ gặp Silero chưa "ấm", vài khung
  đầu không vượt 0,5, nên micro (đã khuếch đại +20 dB) lọt vào đầu câu. Bỏ việc xóa (V1, V3) tốt hơn hẳn (V0 → V1: −8,7 điểm).
- Bỏ khung im lặng (−80 dBFS, V1 so với V3) không xấu hơn: 12,7% so với 13,7%.
- Chênh 1–2 điểm giữa V1, V3, V4, LOINOI (12,7, 13,7, 16,7, 15,0) nằm trong nhiễu của whisper tham lam; quyết định dựa trên
  V0 (chênh lớn, có cơ chế giải thích) và V1 không kém ở bất kỳ cảnh nào.

**Chọn V1** (mức im lặng −80 dBFS, không xóa state giữa chừng), chạy lại trên các cảnh còn lại với bản mã cuối
(`variants/both-loi-noi.json`, phương án `LOINOI-app`):

| Cảnh | LOINOI (Silero mọi khung) | **LOINOI-app (V1)** | Mức đạt | Silero được hỏi |
|---|---|---|---|---|
| `lon-h10` (−36 dBFS) | 7,7% | **7,7%** | ≤ 8,69% | 13 742 / 75 550 (18%) |
| `lon-h20` (−46 dBFS) | 7,8% | **7,4%** | ≤ 9,46% | 21 314 / 75 550 (28%) |
| `lon-h30` (−56 dBFS) | 9,5% | **8,9%** | ≤ 12,98% | 35 113 / 75 550 (46%) |
| `lon-h36` (−62 dBFS) | 15,0% | **12,7%** | ≤ 17,38% | 43 192 / 75 550 (57%) |
| `lon-thu-can` online | 8,4% | **8,1%** | ≤ 8,8% | 3 169 / 49 031 (6%) |
| `lon-thu-can` trong phòng | 7,5% | **7,5%** | ≤ 8,25% | |
| `lon-thu-can` giữ câu trong phòng | 100% | **100%** | 100% | |
| Chữ ảo (mọi cảnh) | 0 | **0** | ≤ 1 mỗi 10 phút | |

Ở cảnh −62 dBFS, kiểm riêng nửa chẵn / nửa lẻ của lịch clip: V1 14,9% / 11,6% (cả hai ≤ 17,38%). Số kết quả của V1 lúc
chạy lưới và lúc chạy lại bằng mã cuối giống hệt nhau (cả năm cảnh). `asr-worker` có Metal.

## Kết luận

Tất cả tiêu chí của kế hoạch 05 **đạt** khi đo trên mẫu đủ lớn (230 clip số hóa và 144 clip thu thật), cả với cấu hình
cuối của app (`LOINOI-app`, bỏ khung to và khung im lặng số, không xóa state Silero). Ba chỗ trượt ở lượt đo đầu
(78 clip, trong đó chỉ 30 clip khác nhau) là nhiễu của mẫu nhỏ, không phải lỗi của thiết kế; ngưỡng và mức đạt không chỉnh. Chỉ bản tối ưu
chi phí (V0) phải sửa. Việc còn lại của kế hoạch 05 là Task 6 (A2 và tình huống A7 trên app thật) và Task 7.
