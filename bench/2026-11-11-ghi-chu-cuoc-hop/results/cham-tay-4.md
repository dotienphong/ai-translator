# Chấm tay vòng 4 (2026-11-13): mốc Cloud so với Local c16kx

Mốc Cloud: **DeepSeek `deepseek-v4-flash`** (chế độ không suy nghĩ), chạy đúng đường Cloud của app (`run_notes.py cloud`: đọc bản dịch, gộp đoạn đầy đủ, `map.txt`). DeepSeek không phải nguồn của spec (G2 chỉ có ChatGPT và Gemini); ở đây chỉ là mốc "model lớn trên cloud" vì chủ dự án có sẵn key. Bộ thử gửi đi là dữ liệu công khai (QMSum, VCSum) và bản họp tổng hợp.

Phiếu mù chung hai hệ (mã chữ xáo theo bản), 757 mục, 4 agent model tầm trung chấm theo ngôn ngữ, tiêu chí và cột `loai_loi` như vòng 3. Phiếu đã chấm ở `$DATA/grading4`.

## Kết quả (lệnh `grading.py score`)

| Hệ | Số mục | Việc cần làm sai | Bịa hẳn | Sai chi tiết | `refs` đúng | Recall việc cần làm |
|---|---|---|---|---|---|---|
| DeepSeek v4-flash (Cloud) | 403 | 20 / 207 (10%) | 10 | 10 | 100% | 93,6% |
| qwen3-5-4b c16kx (Local) | 354 | 40 / 177 (23%) | 8 | 32 | 100% | 59,2% |

c16kx được chấm 48 sai ở vòng 3 và 40 ở vòng này (42 ở vòng 2): lệch giữa các lượt chấm cỡ ± 4–8.

## Việc cần làm theo ngôn ngữ (số việc / sai / bịa hẳn)

| Ngôn ngữ | Cloud | Local |
|---|---|---|
| en | 19 / 5 / 5 | 9 / 3 / 3 |
| ja | 46 / 3 / 1 | 50 / 11 / 0 |
| ko | 63 / 2 / 1 | 53 / 9 / 2 |
| vi | 79 / 10 / 3 | 65 / 17 / 3 |
| zh | 0 | 0 |

| | Cloud | Local |
|---|---|---|
| Quyết định sai | 13 / 120 | 25 / 94 |
| Câu hỏi mở sai | 30 / 76 | 44 / 83 |
| Phiên 60 phút chậm nhất | 13 s | 840 s |

## Đọc kết quả

- **Ngưỡng "bịa ≤ 1 mỗi 10 cuộc họp" không thực tế với tiêu chí chấm này:** chính model cloud cũng bịa hẳn 10 việc trên 20 bản (nhiều nhất ở en: lời gợi ý chung bị ghi thành việc). Về bịa hẳn, Local (8) ngang Cloud.
- **Khoảng cách thật nằm ở chi tiết và độ đủ:** Local sai chi tiết gấp ba (32 so với 10) và tìm được ít việc thật hơn hẳn (recall 59% so với 94%). Quyết định cũng sai gấp đôi.
- Cloud sai chi tiết ít dù đọc cùng bản dịch máy như Local: model lớn hiểu ngữ cảnh tốt hơn và ít chép theo lỗi dịch.
