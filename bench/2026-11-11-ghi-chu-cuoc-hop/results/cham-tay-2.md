# Chấm tay vòng 2 (2026-11-13): c16kb so với c16kx

Phiếu mù chung cho hai hệ trên 20 bản chép lời (mã chữ cái xáo theo từng bản, người chấm không mở bảng giải mã); 715 mục. Bốn agent model tầm trung chấm theo ngôn ngữ (vi, ko, ja, en+zh) với cùng tiêu chí chặt như vòng 1 (`cham-tay.md`): `action` sai nếu bịa, không ai nhận/được giao, sai người, sai hạn, sai số liệu, hay việc đã xong/đã bác. Phiếu đã chấm và báo cáo của người chấm ở `$DATA/grading2`.

## Kết quả (lệnh `grading.py score`)

| Hệ | Số mục | Việc cần làm sai (`bia`) | `refs` đúng | Recall việc cần làm |
|---|---|---|---|---|
| qwen3-5-4b-c16kb-gpu | 361 | 60 / 180 (33%) | 99,2% | 81,8% |
| qwen3-5-4b-c16kx-gpu | 354 | 42 / 177 (24%) | 100% | 82,4% |

Lần chấm này cho c16kb 60 sai (vòng 1 chấm cùng hệ ra 56): sai lệch giữa hai lượt chấm cỡ ± 4 mục.

## Việc cần làm theo ngôn ngữ (số việc / số sai)

| Ngôn ngữ | c16kb | c16kx |
|---|---|---|
| en | 14 / 7 | 9 / 3 |
| zh | 6 / 6 | 0 / 0 |
| ja | 46 / 11 | 50 / 11 |
| ko | 48 / 15 | 53 / 9 |
| vi | 66 / 21 | 65 / 19 |
| Cộng | 180 / 60 | 177 / 42 |

## Đọc kết quả

- c16kx giảm việc sai 30% (60 → 42) mà không giảm số việc thật tìm được (recall 82% cả hai): lời nhắc chặt bỏ hết "việc" bịa ở buổi tọa đàm zh, giảm ở ko và en.
- **Vẫn rớt xa ngưỡng** (≤ 2 trên 20 bản). Lỗi còn lại ở ja và vi gần như không giảm: người chấm ghi phần lớn là sai hạn, sai người, sai chi tiết do **bản dịch máy ở khâu trước** ("June 6th" thay vì 6/12, "điều chỉnh lịch làm việc" thay vì "sửa bug tính giờ nghỉ"), và việc đã xong vẫn ghi như việc phải làm. Lượt kiểm chỉ sửa người nhận và hạn, nên không chữa được nội dung bị dịch sai.
- `question` sai nhiều ở cả hai hệ (38/77 và 43/83), chủ yếu là câu hỏi đã được trả lời ngay trong buổi; không thuộc cổng nào nhưng là điểm yếu cần biết.
