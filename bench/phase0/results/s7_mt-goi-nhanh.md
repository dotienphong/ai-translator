## Mốc theo lượt chạy

| Lượt chạy | Chiều | Số câu | COMET | chrF++ | Mức sàn (A3) | Tỉ lệ token lớn nhất | Ngưỡng đề xuất | Bị cắt | Lỗi | Nghi lẫn mẫu | p50 thời gian (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LMT-60-0.6B-Q8_0-plain | en->vi | 100 | 0.802 | 44.8 | 0.770 (đạt) | 3.43 | 4.3 | 0 | 1 | 0 | 213 |
| LMT-60-0.6B-Q8_0-plain | ja->vi | 100 | 0.780 | 34.6 | 0.752 (đạt) | 2.67 | 3.4 | 0 | 0 | 0 | 191 |
| LMT-60-0.6B-Q8_0-plain | ko->vi | 100 | 0.778 | 34.9 | 0.752 (đạt) | 1.78 | 2.3 | 0 | 0 | 0 | 184 |
| LMT-60-0.6B-Q8_0-plain | vi->en | 100 | 0.804 | 46.4 | — | 1.50 | 1.9 | 0 | 0 | 0 | 138 |
| LMT-60-0.6B-Q8_0-plain | vi->ja | 40 | 0.807 | 18.4 | — | 1.53 | 2.0 | 0 | 0 | 0 | 206 |
| LMT-60-0.6B-Q8_0-plain | vi->ko | 40 | 0.787 | 18.3 | — | 1.77 | 2.3 | 0 | 0 | 0 | 237 |
| LMT-60-0.6B-Q8_0-plain | vi->zh | 40 | 0.809 | 23.0 | — | 1.21 | 1.6 | 0 | 0 | 0 | 135 |
| LMT-60-0.6B-Q8_0-plain | zh->vi | 100 | 0.809 | 38.1 | 0.752 (đạt) | 2.79 | 3.5 | 0 | 0 | 0 | 180 |

## So sánh theo cặp (cùng tập câu)

| So sánh | Chiều | Số câu | Chênh COMET | 95% CI | Chênh p50 thời gian | Số câu dài gấp đôi |
|---|---|---|---|---|---|---|

## Ngưỡng tỉ lệ token đề xuất cho §6.5 (từ các lượt chạy không có ngữ cảnh)

| Chiều | Ngưỡng |
|---|---|
| en->vi | 4.3 |
| ja->vi | 3.4 |
| ko->vi | 2.3 |
| vi->en | 1.9 |
| vi->ja | 2.0 |
| vi->ko | 2.3 |
| vi->zh | 1.6 |
| zh->vi | 3.5 |
