# Chấm tay vòng 3 (2026-11-13): c16kx so với c16ky

Phiếu mù chung cho hai hệ trên 20 bản (mã chữ xáo theo bản, người chấm không mở bảng giải mã); 694 mục. Bốn agent model tầm trung chấm theo ngôn ngữ (vi, ko, ja, en+zh), cùng tiêu chí chặt của vòng 1–2, thêm cột `loai_loi` cho việc cần làm sai:
- `bia` (bịa hẳn): không có căn cứ trong lời gốc — không ai nhận/được giao, chỉ là ý kiến, việc đã xong hay đã bác, hay bịa hoàn toàn. Đây là nghĩa hẹp của "việc cần làm bịa" trong spec §10.
- `chi_tiet`: có việc thật như vậy nhưng ghi sai người nhận, hạn, số liệu hay nội dung.

Phiếu đã chấm và báo cáo của người chấm ở `$DATA/grading3`.

## Kết quả (lệnh `grading.py score`)

| Hệ | Số mục | Việc cần làm sai | Bịa hẳn | Sai chi tiết | `refs` đúng | Recall việc cần làm |
|---|---|---|---|---|---|---|
| qwen3-5-4b-c16kx-gpu | 354 | 48 / 177 (27%) | 7 | 41 | 100% | 72,8% |
| qwen3-5-4b-c16ky-gpu | 340 | 41 / 163 (25%) | 10 | 31 | 97,3% | 67,7% |

Recall tính trên hợp các việc đúng mà hai hệ tìm được trong lượt chấm này (không so được với vòng 2). c16kx được chấm 48 sai ở vòng này, 42 ở vòng 2: hai lượt chấm cùng hệ lệch ± 6 mục.

## Việc cần làm theo ngôn ngữ (số việc / sai / bịa hẳn)

| Ngôn ngữ | c16kx | c16ky |
|---|---|---|
| en | 9 / 2 / 2 | 10 / 4 / 4 |
| ja | 50 / 12 / 0 | 55 / 13 / 1 |
| ko | 53 / 16 / 2 | 42 / 12 / 1 |
| vi | 65 / 18 / 3 | 56 / 12 / 4 |
| zh | 0 | 0 |

## Các mục khác

| | c16kx | c16ky |
|---|---|---|
| Quyết định sai | 35 / 94 | 16 / 78 |
| Câu hỏi mở sai (phần lớn: đã được trả lời trong buổi) | 44 / 83 | 62 / 99 |

## Đọc kết quả

- **Đọc lời gốc (c16ky)** giảm lỗi sai chi tiết (41 → 31) và quyết định sai (35 → 16), nhưng tìm ít việc hơn (recall 68% so với 73%), bịa hẳn nhiều hơn chút (7 → 10) và câu hỏi mở sai nhiều hơn. Tổng việc cần làm sai gần như ngang (48 → 41), trong phạm vi lệch của người chấm.
- **Theo nghĩa hẹp của spec** (bịa hẳn), cả hai vẫn rớt: 7 và 10 trên 20 bản, ngưỡng ≤ 2.
- Lỗi còn lại chủ yếu là sai hạn, sai người nhận, ghi việc đã xong như việc phải làm. Model 4B trên máy đã chạm trần ở cỡ 25% việc cần làm có lỗi.
