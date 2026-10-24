# Kết quả spike nguồn micro (2026-10-24)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`. Spec: `docs/superpowers/specs/2026-10-24-nguon-micro-design.md`
(mục 16 ghi các quyết định rút ra từ đây). Chi tiết ở các file cùng thư mục:
- `s-m4-macos.md`: quyền micro trên macOS.
- `thu-macos.md`: nhật ký thu, mức âm lượng, lệch đồng hồ.
- `tieng-vong.md`: chế độ trộn.
- `chong-on.md`: chống tiếng ồn, giọng ở xa, thời gian đóng đoạn.

## Điều kiện

- MacBook Pro M4 Pro, macOS 26.6.2.
- Micro "MacBook Pro Microphone" (tích hợp); loa "MacBook Pro Speakers" ở 60%.
- `asr-worker` có Metal (whisper.cpp 1.8.3): gói Chuẩn `ggml-large-v3-turbo-q5_0.bin`, gói Nhẹ `ggml-small-q5_1.bin`.
- Silero VAD v6.2.3.
- `latency-bench mix-eval`: dùng `Segmenter`, Silero và luật lọc của app; không có hàng đợi, ghép câu hay prompt của đoạn
  trước.
- "Người trong phòng" là loa điện thoại phát clip FLEURS (−26 dBFS mỗi clip, âm lượng điện thoại 70%), cộng một bài đọc
  tiếng Việt bằng giọng thật của chủ dự án ở 1 m.
- **Windows (Task 17) chưa đo.**

## Quyền micro trên macOS (S-M4)

- **Bị từ chối thì không có lỗi:** `start` vẫn chạy, 100% mẫu bằng 0.
  - Phát hiện bằng `AVCaptureDevice` (đọc đúng cả ba trạng thái), cộng bộ canh "toàn số 0" trong phiên.
  - Micro thật luôn có tiếng nền khoảng −46 đến −50 dBFS.
- **Ký lại ad-hoc thì quyền về `Undetermined`.** Mỗi bản cập nhật sẽ hỏi lại quyền Micro.
- **Chưa xin quyền mà gọi `start`:** Core Audio tự hiện hộp thoại và `start` chặn suốt lúc hộp thoại mở (đo 4,3 s). Nên gọi
  `request` trước.
- **Chưa làm:** dùng chung micro với Zoom/Meet; AirPods.

## Lệch đồng hồ

Micro và loa tích hợp trong 30 phút:
- trôi khoảng 0,1 ppm;
- dao động 20 ms, dưới ngưỡng 100 ms của `Mixer2`.

**Không cần** phương án dự phòng gắn micro vào aggregate của tap. Micro USB hay Bluetooth chưa đo.

## Tiếng vọng

| Phương án | Cảnh 1 (nói lần lượt): lỗi online | Cảnh 1: lỗi trong phòng | Cảnh 2 (nói chồng): lỗi online |
|---|---|---|---|
| Mốc không vọng | 8,5% | – | 10,1% |
| A, trộn thẳng | 22,3% | 7,4% | 24,5% |
| C, AEC3 | 10,1% | 8,7% | 28,6% |
| **B, −55 dBFS / −30 dB / giữ 300 ms** | 7,7% | 7,2% | 11,0% |
| **B + khuếch đại +20 dB + VAD 0,5 / 600 / đóng đoạn 500 ms (chốt)** | **6,1%** | **3,7%** | 20,4% |

- **Chọn B**, loại C. CPU: AEC3 và RNNoise mỗi thứ khoảng 0,3% một nhân trên M4 Pro.
- Khi hai bên nói chồng, mọi phương án đều mất phần lớn câu trong phòng (giữ 13–33%).

## Chống tiếng ồn và giọng ở xa

**Chữ ảo:** 18 phút chỉ có 9 loại tiếng ồn (gõ phím, bàn phím cơ, bấm bút, viết, gõ bàn, lật giấy, đặt cốc, kéo ghế, quạt)
sinh 0–1 câu ở mọi tổ hợp. Câu duy nhất ("Vợ có bút bi nữa…") xuất hiện cả khi không khuếch đại, nên có lẽ là tiếng người
thật trong phòng. **Đạt.**

**Loại:**
- `ShortUnsure`: không giảm thêm chữ ảo, chỉ làm mất câu ngắn.
- DeepFilterNet3: lọc mất cả giọng ở xa; tốn khoảng 3,4% một nhân.
- AGC: kém khuếch đại cố định ở mọi cảnh.
- Cho whisper nghe bản đã lọc: luôn tệ hơn.

**Cấu hình chốt cho chế độ chỉ micro:**
- lọc 80 Hz;
- khuếch đại +20 dB, chặn mềm;
- RNNoise chỉ cho VAD;
- VAD 0,5 / 400 ms / **đóng đoạn sau 500 ms**.

| Cấu hình | Giọng thật 1 m (WER) | Điện thoại 1 m: lỗi / giữ | Điện thoại 3 m: lỗi / giữ | Phòng ồn (cảnh 7): câu ngắn / lỗi |
|---|---|---|---|---|
| App hiện nay, gói Chuẩn | 59,3% | 74,2% / 28% | 89,4% / 8% | 10,5% / 87,8% |
| **Chốt, gói Chuẩn** | **44,0%** | **33,5% / 80%** | **55,3% / 44%** | **39,5% / 69,9%** |
| **Chốt, gói Nhẹ** | **58,0%** | **40,9% / 68%** | **63,2% / 36%** | **42,1% / 74,2%** |

Lỗi theo tiếng ở 1 m, gói Chuẩn: zh 13%, en 19%, vi 32%, ko 42%, ja 62%. Gói Nhẹ: en 17%, ko 19%, zh 20%, vi 66%, ja 83%.

**Mốc A4-mic** (chống thụt lùi 10% tương đối): là hai dòng "Chốt" ở bảng trên.

**Sửa sau thử tay** (`thu-tay-mac.md`, `gioi-han-muc.md`): bản cho whisper dùng bộ giới hạn mức thay `tanh`, lọc 80 Hz
chạy trước khuếch đại; tắt lọc ồn thì `min_speech_ms` 250. Đo lại, mọi số bằng hoặc tốt hơn. Mốc A4-mic mới ở spec mục 16:
- gói Chuẩn: 44,7%; 30,0% / 84%; 54,9% / 44%; 39,5% / 69,9%;
- gói Nhẹ: 52,0%; 39,3% / 76%; 62,4% / 40%; 42,1% / 73,5%.

## So với mức đạt ban đầu của spec §6.3

| Mức | Ban đầu | Đo được (chốt, gói Chuẩn) | |
|---|---|---|---|
| Chữ ảo | ≤ 1 câu mỗi 10 phút | 0,55 câu mỗi 10 phút | Đạt |
| Câu ngắn khi phòng ồn | ≥ 80% | 39,5% | Không đạt |
| Câu thường khi phòng ồn | lỗi ≤ lỗi 1 m × 1,15 | 69,9% so với 38,5% | Không đạt |
| B: lỗi online cảnh 1 | ≤ mốc × 1,10 | 6,1% so với 9,35% | Đạt |

Chủ dự án chốt ngày 2026-10-24: dùng cấu hình trên, **hạ mục tiêu nghiệm thu về mức đo được** (chống thụt lùi), và chọn
đóng đoạn sau 500 ms ở chế độ trộn.

## Việc còn mở

- Task 17 (Windows): quyền, mức micro, CPU của RNNoise trên i5.
- Dùng chung micro với Zoom/Meet; AirPods; micro USB.
- Giọng thật tiếng Anh, Trung, Nhật, Hàn ở 1 m (chỉ mới có bài đọc tiếng Việt).
- Luật `Hallucination` phải bắt được câu **chứa** cụm quảng cáo kênh ("Hãy subscribe cho kênh Ghiền Mì Gõ…"): câu này lọt
  qua hai lần khi khuếch đại.
- Phụ đề ở chế độ có micro chậm hơn khoảng 0,45 s (đóng đoạn sau 500 ms): đo A2 thật ở kế hoạch 03.
