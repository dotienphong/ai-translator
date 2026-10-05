# A5: soak 2 giờ trên macOS (2026-10-06)

**Kết quả: A5 ĐẠT; tải máy ≤ 30%: ĐẠT** (`a5-mac.json`, `a5-mac.csv`).

- **Bản đo:** bản release `0.1.0` dựng từ `main` `864c59f`, **ký ad-hoc, không notarize** (chưa có Developer ID; spec `2026-10-05-macos-adhoc-signing-design.md`), cài vào `/Applications`. CDHash `ed2e7ecf0dc52444e9ae6bde4ae37c5610aa34d9`. Qua phép tự kiểm ở chế độ ad-hoc (không có dòng "không chính hãng" trong log), gói Pro X2.
- **Máy:** MacBook Pro M4 Pro (12 lõi), macOS 26.6.2, cắm sạc, mã máy `707254bd1029`.
- **Tải:** một video bài giảng tiếng Anh dài trên trình duyệt, phát qua loa, app thu âm thanh toàn hệ thống; nội dung thật, không lặp.
- **Đo:** `soak.py sample --app meeting-translator --every 10 --duration 7320`, giữ máy thức bằng `caffeinate -i`; 00:41:29 → 02:43:29 (+07:00). GPU lấy từ `ioreg` ("Device Utilization %") mỗi phút, không ghi tay từ Activity Monitor như sổ tay.

## Kết quả

| Tiêu chí | Kết quả |
|---|---|
| Thời gian | 7320 giây, 733 mẫu (đủ 2 giờ) |
| Tiến trình biến mất hay khởi động lại | Không (6 tên: app, `asr-worker`, `llama-server`, 3 loại `com.apple.WebKit.*`; 7 tiến trình) |
| RAM tổng: trung bình phút 55–60 | 2966 MiB |
| RAM tổng: lớn nhất sau giờ đầu | 3085 MiB, **tăng +4,0%** (ngưỡng ≤ 10%); đỉnh cả lượt 3100 MiB |
| CPU trung bình | 4,8% của 12 lõi (ngưỡng ≤ 30%) |
| Khung thu âm bị rơi | 0 (`silence_inserted`, `skipped`, `dropped`, `rejected_cycles` đều 0 ở cả 122 dòng số liệu thu) |
| Lỗi trong log của app trong cửa sổ đo | 0 (chỉ lỗi cập nhật định kỳ do chưa có bản trên R2) |

Theo từng 30 phút (RAM là tổng các tiến trình; GPU là phần trăm sử dụng thiết bị):

| Khoảng (phút) | RAM TB (MiB) | RAM lớn nhất (MiB) | GPU TB (%) | GPU lớn nhất (%) |
|---|---|---|---|---|
| 0–30 | 3025 | 3100 | 43 | 93 |
| 30–60 | 2972 | 3083 | 50 | 89 |
| 60–90 | 2972 | 3085 | 60 | 94 |
| 90–120 | 2977 | 3078 | 64 | 95 |

RAM giảm nhẹ sau 30 phút đầu rồi phẳng. GPU trung bình trên cả lượt 55%.

## Tổng kết phiên dịch (cả phiên, dài hơn cửa sổ đo)
Phiên chạy từ 00:40:45 tới 06:03:55 (5 giờ 23 phút; app để chạy tiếp sau khi đo xong) và kết thúc bằng: **6019 đoạn (lọc 32, bỏ 0), 5976 câu dịch, 0 lỗi**, 6 cùng ngôn ngữ, 1547 lần ghép; cắt đoạn p50 64 ms, p90 64 ms; nhận dạng p50 238 ms, p90 266 ms; dịch p50 230 ms, p90 440 ms; **tổng p50 480 ms, p90 736 ms**; 13 282 giây tiếng nói đã dịch. Số này gồm cả phần sau cửa sổ đo A5, nên dùng làm thông tin bổ sung (không có crash hay lỗi trong 5 giờ 23 phút), không phải số đo A5.

## Giới hạn
- Không phải bản ký Developer ID đã notarize; kết luận cho bản ký ad-hoc (cùng mã, khác chữ ký).
- GPU tăng dần theo khoảng (43 → 64%) có thể do độ dày giọng nói của video hay tải của trình duyệt phát video; chưa tách riêng, và A5 không đặt ngưỡng GPU.
- Chạy một lần trên một máy (M4 Pro); chưa có máy khác (M1, Windows).
