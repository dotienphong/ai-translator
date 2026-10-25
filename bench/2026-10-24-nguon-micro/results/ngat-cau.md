# Ngưỡng ngắt câu của chế độ có micro: 50, 100, 200, 300, 500 ms (2026-10-25)

Câu hỏi của chủ dự án: vì sao chế độ micro và Âm thanh máy + Micro mặc định 500 ms (thanh trượt bị khóa), và để 100 ms thì ảnh
hưởng gì. Đo offline bằng `latency-bench mix-eval` (bản whisper Chuẩn, `asr-worker` có Metal), cấu hình cuối của app, chỉ đổi
`end_silence_ms`: chế độ trộn `variants/ngat-cau-both.json` (`B-es*`), chế độ micro `variants/ngat-cau-mic.json` (`M-es*`, bộ giới
hạn mức, RNNoise cho VAD, `min_speech_ms` 400). M4 Pro. Đo độ chính xác nhận dạng, **chưa** đo chất lượng bản dịch.

## Chế độ Âm thanh máy + Micro (lỗi: WER/CER của chữ ghi được so với câu gốc, thấp hơn là tốt)

| Cảnh | Chỉ tiêu | 50 ms | 100 ms | 200 ms | 300 ms | 500 ms |
|---|---|---|---|---|---|---|
| `s1-loa` (nói lần lượt, 78 clip) | lỗi online | 8,4% | 6,4% | 5,8% | 5,5% | **4,2%** |
| | lỗi người trong phòng | 6,8% | 4,3% | 4,7% | 5,2% | 4,4% |
| `lon-thu-can` (thu thật, 144 clip) | lỗi online | 10,6% | 9,7% | 9,8% | 9,0% | **8,1%** |
| | lỗi người trong phòng | 9,9% | 10,3% | 8,6% | 7,9% | **7,5%** |
| | giữ câu trong phòng | 97,5% | 95,0% | 100% | 100% | 100% |
| `s2-loa` (nói chồng 30% thời gian) | lỗi online | 10,7% | **10,0%** | 11,7% | 12,4% | 21,6% |
| | lỗi người trong phòng | 67,3% | 63,7% | 62,7% | 63,2% | 69,1% |

Chữ ảo: 0 ở mọi mức, mọi cảnh.

## Chế độ chỉ Micro

| Cảnh | Chỉ tiêu | 50 ms | 100 ms | 200 ms | 300 ms | 500 ms |
|---|---|---|---|---|---|---|
| `doc-vi-1m` (chủ dự án đọc 15 dòng tiếng Việt, 1 m) | lỗi (WER) | 63,3% | 57,3% | 59,3% | 58,7% | **44,7%** |
| | số đoạn được giữ (cùng bài đọc) | 41 | 36 | 35 | 34 | 26 |
| `s4-1m` (giọng điện thoại, 1 m) | lỗi | 39,0% | 32,2% | 32,8% | 32,1% | **30,0%** |
| | giữ câu | 64% | 72% | 72% | 80% | 84% |
| `s6-on` (hỏi chữ ảo) | câu ảo | 1 | 1 | 1 | 1 | 1 |

(`s6-on`: một câu giống nhau ở mọi mức, nhiều khả năng là người thật nói trong phòng lúc bấm bút, như ghi ở `chong-on.md`.)

## Đọc kết quả

- **Vì sao 500 ms:** giọng người thật có nhiều quãng nghỉ ngắn giữa các cụm từ (khoảng 100–400 ms). Đóng đoạn sớm thì một câu
  bị cắt thành nhiều mẩu, whisper nhận từng mẩu ngắn nên sai nhiều hơn. Cùng một bài đọc 15 dòng: 41 đoạn ở 50 ms, 36 ở 100 ms,
  26 ở 500 ms; lỗi 63%, 57%, 45%.
- **Để 100 ms thì sao:**
  - chế độ chỉ Micro: lỗi tăng khoảng 12 điểm với giọng thật (57% so với 45%), 2 điểm với giọng điện thoại, giữ ít câu hơn (72% so
    với 84%);
  - chế độ Âm thanh máy + Micro, nói lần lượt: lỗi online tăng khoảng 1,5–2 điểm (6,4% so với 4,2%; 9,7% so với 8,1%), câu người
    trong phòng giữ 95% thay vì 100% ở bản thu thật;
  - chế độ Âm thanh máy + Micro, nói chồng: **tốt hơn hẳn** 500 ms (online 10,0% so với 21,6%), vì 500 ms gộp tiếng hai bên thành
    một đoạn dài.
- **Cái giá của 500 ms:** phụ đề hiện chậm hơn khoảng 400 ms so với 100 ms (đo ở A2: cắt đoạn p50 512 ms so với 64 ms).
- **Mức giữa (200–300 ms)** ở chế độ trộn: lỗi gần mức 500 ms (9,0% so với 8,1% ở bản thu thật; 5,5% so với 4,2% ở `s1-loa`),
  nhanh hơn 200–300 ms, và nói chồng không bị gộp (12,4% so với 21,6%). Ở chế độ chỉ Micro với giọng thật thì không có mức giữa
  nào tốt: 57–59% so với 45%.
- Giới hạn: bài đọc thật chỉ một người, 15 dòng; `s4-1m` 25 clip. Mẫu nhỏ, chênh 1–2 điểm là nhiễu.

Chế độ Âm thanh máy (không micro) không dùng mức này: giữ `vadEndSilenceMs` mặc định 50 ms, thanh trượt chỉnh tự do.
