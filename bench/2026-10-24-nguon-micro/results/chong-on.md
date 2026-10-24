# Đo chống tiếng ồn ở micro (Task 19, 2026-10-24)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`, Task 19. Spec §5.7, §6.3.

**Điều kiện:**
- Bản thu (xem `thu-macos.md`):
  - `s4-1m`, `s4-3m`: điện thoại phát câu FLEURS ở 1 m và 3 m, phòng yên tĩnh.
  - `s6-on`: 18 phút chỉ có tiếng ồn, 9 loại.
  - `s7-on`: điện thoại 1 m, kèm gõ phím, bấm bút, gõ bàn.
- `mix-eval` và cách chấm như `tieng-vong.md`.
- Các lớp được đo:
  - Lớp 1: lọc 80 Hz, luôn bật.
  - Lớp 2: không lọc / RNNoise (`nnnoiseless` 0.5.2) / DeepFilterNet3 (CLI `deep-filter` v0.5.6 cho macOS arm64, SHA-256
    `4601e7f4e4c03e59a4c5b5000216ef3add3e808799cfccd95e14e83ea4611081`, chạy với `-D`).
  - Lớp 3: whisper nghe bản chỉ lọc 80 Hz, hoặc nghe bản đã lọc ồn ("cả hai").
  - Lớp 4: VAD {0,5; 0,6; 0,7} × {250, 400, 600 ms}.
  - Lớp 5: `ShortUnsure` dò trong `score_mix.py`.
  - **Thêm sau Task 16:** khuếch đại micro cố định {0, +10, +20 dB} kèm chặn mềm `tanh`.
- Tổng 135 tổ hợp × 13 bộ `ShortUnsure`.
- **Sửa cách chấm trong lúc đo:**
  - Cảnh 7: tương quan đường bao bị tiếng ồn đánh lừa (13,1 s). Độ lệch thật 33,1 s, xác nhận bằng ba cách độc lập: độ trùng
    thời gian, chữ khớp, và 7 câu ngắn khớp chính xác. Ghi tay ở `data/scenes/s7-on/offsets.json`. Clip nằm sau lúc dừng
    thu không được chấm.
  - Đoạn nằm ngoài khung track (điện thoại tự phát lại sau khi track hết) không tính là chữ ảo.

## Kết quả

| Tổ hợp | Ảo trong 18 phút (cảnh 6) | 1 m: lỗi / giữ | 3 m: lỗi / giữ | Cảnh 7: giữ câu ngắn / lỗi câu dài |
|---|---|---|---|---|
| Không lọc, 0 dB, VAD mặc định (app hiện nay) | 1 | 74,2% / 28% | 89,4% / 8% | 10,5% / 87,8% |
| Không lọc, +20 dB, 0,5 / 600 | 1 | **36,3% / 68%** | 68,5% / 36% | **0%** / 99,2% |
| RNNoise cho VAD, 0 dB, 0,5 / 250 | 1 | 48,4% / 48% | 76,9% / 20% | 36,8% / 88,1% |
| **RNNoise cho VAD, +20 dB, 0,5 / 400** | 1 | 42,0% / 68% | **65,8% / 36%** | **42,1%** / **75,9%** |
| RNNoise cho VAD, +20 dB, 0,5 / 600 | 1 | 41,5% / 68% | 66,4% / 36% | 21,1% / 76,6% |
| RNNoise "cả hai", +20 dB, 0,5 / 250 | 1 | 63,9% / 40% | 84,7% / 16% | 44,7% / 85,2% |
| DeepFilterNet cho VAD, +20 dB (tốt nhất) | 1 | 86,2% / 16% | 100% / 0% | 2,6% / 100% |
| DeepFilterNet "cả hai", +20 dB (tốt nhất) | 1 | 89,1% / 12% | 100% / 0% | 2,6% / 100% |

Lỗi theo tiếng của tổ hợp RNNoise, +20 dB, 0,5 / 400, ở 1 m: ko 18%, zh 15%, en 35%, **ja 72%, vi 70%**.

**Chữ ảo:**
- Mọi tổ hợp đều chỉ có **1 câu ảo trong 18 phút** tiếng ồn (0,55 câu mỗi 10 phút): "Vợ có bút bi nữa của anh muộn", lúc
  bấm bút.
- Cả 9 loại tiếng ồn (gõ phím, bàn phím cơ, bấm bút, viết, gõ bàn, lật giấy, đặt cốc, kéo ghế, quạt) đều bị VAD và luật lọc
  hiện có của app chặn, kể cả khi khuếch đại +20 dB.

**`ShortUnsure` (lớp 5):** không giảm thêm chữ ảo (vốn chỉ còn 1), chỉ làm mất thêm câu ngắn. Ví dụ RNNoise, +20 dB,
0,5 / 600 với `+su0.8-400`: câu ngắn ở cảnh 7 từ 21,1% xuống 18,4%. **Không cần.**

**DeepFilterNet3:** lọc mạnh tới mức coi giọng ở xa là tiếng ồn. Ở cảnh 4 1 m, chỉ 2,9% khung 10 ms còn trên −45 dBFS
(RNNoise còn 6,0%, bản gốc 71,8%). Đã kiểm lệch thời gian: 0 ms, nên không phải lỗi căn. Thêm vào đó, nó tốn khoảng 3,4%
một nhân trên M4 Pro, gấp khoảng 10 lần RNNoise (0,27%), và thư viện ít được bảo trì. **Loại.**

## Áp luật chốt (spec §6.3)

| Mức | Cần | Tổ hợp tốt nhất (RNNoise cho VAD, +20 dB, 0,5 / 400) | Kết quả |
|---|---|---|---|
| Chữ ảo (cảnh 6) | ≤ 1 câu mỗi 10 phút | 0,55 | **Đạt** (mọi tổ hợp) |
| Câu ngắn (cảnh 7) | giữ ≥ 80% | 42,1% | **Không đạt** |
| Câu thường có ồn (cảnh 7) | lỗi ≤ lỗi 1 m × 1,15 = 48,3% | 75,9% | **Không đạt** |
| Không hại khi yên tĩnh (1 m) | ≤ không lọc × 1,05 | 42,0% so với 36,3% (không lọc, +20 dB) | **Không đạt** (RNNoise tệ hơn 16% khi phòng yên tĩnh); so với app hiện nay (74,2%) thì tốt hơn nhiều |
| CPU lớp 2 | ≤ 10% một nhân (i5) | RNNoise 0,27% (M4 Pro); i5 chưa đo | Gần như chắc đạt |

**Không tổ hợp nào đạt đủ mức.** Theo kế hoạch: dừng, báo chủ dự án.

## Điều đã rõ

1. **Chữ ảo do tiếng ồn không phải vấn đề.** Đây là mối lo chính của chủ dự án, và đã đạt với mọi tổ hợp, kể cả cấu hình
   app hiện nay.
2. **Vấn đề thật là giọng ở xa bị nhỏ và nhận sai.** Micro MacBook nhận giọng người thật cách 1 m chỉ khoảng −45 dBFS:
   - với VAD và mức khuếch đại hiện nay, app bỏ gần 3/4 số câu (giữ 28%);
   - **khuếch đại +20 dB là thay đổi có tác dụng lớn nhất** (giữ từ 28% lên 68%);
   - **RNNoise chỉ cho VAD** giúp rõ khi phòng ồn (câu ngắn ở cảnh 7 từ 0% lên 42%, khi đã khuếch đại), nhưng làm tệ hơn
     một chút khi phòng yên tĩnh.
3. **Cho whisper nghe bản đã lọc luôn tệ hơn** (đúng như nghiên cứu): RNNoise "cả hai" 63,9% so với 42,0% ở 1 m.
4. **Ngay cả tổ hợp tốt nhất vẫn sai nhiều:** 36–42% ở 1 m trong phòng yên tĩnh, đặc biệt tiếng Nhật và tiếng Việt khoảng
   70%. Lỗi ở mức này đến từ chất lượng âm thanh (loa điện thoại, khoảng cách, vang phòng), không do tiếng ồn.
5. **`min_speech_ms` 600 ms (cần cho chế độ trộn khi khuếch đại, xem `tieng-vong.md`) làm mất một nửa câu ngắn** (42% xuống
   21%). Nếu dùng thì chế độ chỉ micro nên giữ 400 ms, còn chế độ trộn dùng 600 ms.

## Giới hạn của lượt đo này

- Giọng "người trong phòng" là loa điện thoại phát lại clip FLEURS, không phải người thật nói. Đã đo giọng thật của chủ
  dự án ở 1 m: nhỏ hơn điện thoại khoảng 7–8 dB, nhưng chưa đo lỗi nhận dạng trên giọng thật.
- Chỉ có micro MacBook, chưa thử micro USB, micro hội nghị hay AirPods.
- Khuếch đại là mức cố định, chưa thử tự cân mức (AGC) thật.
- Windows (Task 17) chưa đo.
