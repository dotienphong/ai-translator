# Đo lại A-trộn với chuỗi micro mới (2026-10-24)

Kế hoạch 03, Task 1. Chuỗi micro mới (`gioi-han-muc.md`):
- bản cho whisper: lọc 80 Hz rồi bộ giới hạn mức;
- bản cho VAD: lọc 80 Hz, RNNoise khi bật lọc ồn, rồi `tanh`.

Số A-trộn chốt trước đó (6,1% / 3,7%) đo với `tanh` cho cả hai bản, không RNNoise.

## Điều kiện

- Như `tieng-vong.md`: cảnh 1 (`s1-loa`, nói lần lượt) và cảnh 2 (`s2-loa`, nói chồng); loa laptop 60%; M4 Pro; gói Chuẩn.
- Nhường lời B −55 dBFS / −30 dB / giữ 300 ms; VAD 0,5, đóng đoạn sau 500 ms.
- Phương án: `variants/both-chot-moi.json`, `variants/both-do-nhay.json`. Bản VAD đã lọc ồn của cảnh 1, 2 tạo bằng
  `latency-bench denoise`.

## Kết quả

| Phương án | Cảnh 1: lỗi online | Cảnh 1: lỗi trong phòng | Cảnh 2: lỗi online | Cảnh 2: lỗi trong phòng / giữ |
|---|---|---|---|---|
| Cách cũ, +20 dB `tanh`, VAD 600 (mốc cũ) | 6,1% | 3,7% | 20,4% | 76,3% / 26,7% |
| Cách mới, không RNNoise, VAD 600 | 9,8% | 4,2% | 20,6% | 81,7% / 26,7% |
| **Cách mới, RNNoise cho VAD, VAD 600 (như app)** | **9,0%** | **5,2%** | **23,4%** | **76,0% / 26,7%** |
| Cách mới, RNNoise cho VAD, VAD 400 | 9,0% | 5,2% | 25,3% | 76,0% / 26,7% |

**Độ nhạy của cách cũ ở cảnh 1** (chỉ đổi khuếch đại hay thời gian giữ):

| Cách cũ | Lỗi online | Lỗi trong phòng |
|---|---|---|
| +19 dB | 5,3% | 3,5% |
| +20 dB | 6,1% | 3,7% |
| +21 dB | 9,7% | 3,7% |
| +20 dB, giữ 250 ms | 6,1% | 3,7% |

- Cảnh 1 chỉ có khoảng 45 đoạn. Lệch 1 dB đã làm lỗi online chạy từ 5,3% đến 9,7%: vài câu whisper đổi chữ là đủ. Lỗi online
  của cách mới (9,0%) nằm trong dải này.
- Các câu khác nhau giữa cách cũ và cách mới phần lớn là đổi vài chữ hay dấu câu, theo cả hai chiều. Cách mới đúng hơn ở
  "競技場"; sai hơn ở "관응", "水把"; có một chỗ bịa thêm nửa câu tiếng Hàn.
- VAD 400 không khác 600 ở cảnh 1, và tệ hơn ở cảnh 2: giữ QĐ6 (600).

## Quyết định (chủ dự án, 2026-10-24)

- Chế độ trộn dùng cùng chuỗi micro mới với chế độ micro.
- Mốc A-trộn lấy số xấu nhất trong dải đo: online ≤ 9,8% × 1,10, trong phòng ≤ 5,2% × 1,10.
- Spec ghi rõ số này dao động ±3–4 điểm khi khuếch đại lệch 1 dB.
