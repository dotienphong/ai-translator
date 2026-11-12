# Chấm tay (kế hoạch 01, Task 9)

Chấm ngày 2026-11-12 cho hệ **qwen3-5-4b, cấu hình c16kb, chạy GPU** (hệ duy nhất qua cổng JSON, ngôn ngữ, `refs` và RAM). Chỉ có một hệ nên mã chữ cái xáo trên phiếu không che gì; người chấm không mở `key.json`.

## Kết quả (lệnh `grading.py score`)

| Hệ | Số mục | Việc cần làm bịa (`bia`) | `refs` đúng | Recall việc cần làm |
|---|---|---|---|---|
| qwen3-5-4b-c16kb-gpu | 361 | 56 | 99,6% | 100% (không có hệ khác để so, nên vô nghĩa) |

Cổng chấm tay của hệ local: `bia` ≤ 2 trên 20 bản chép lời, `refs` đúng ≥ 90%. **`refs` đạt; `bia` rớt rất xa (56 so với 2).**

## Chia theo ngôn ngữ (mục `action`)

| Ngôn ngữ | Việc cần làm | Sai (dung = 0) |
|---|---|---|
| en | 14 | 4 |
| zh | 6 | 6 |
| ja | 46 | 11 |
| ko | 48 | 15 |
| vi | 66 | 20 |
| Cộng | 180 | 56 (31%) |

## Cách chấm và giới hạn

- Năm agent model tầm trung chấm song song, mỗi agent một ngôn ngữ, từng mục một: đối chiếu `bang_chung` và bản chép lời; ja/ko/vi có thêm danh sách chuẩn (quyết định, việc, câu hỏi mở, bẫy). Không phải người chấm. Phiếu đã chấm nằm ở `$DATA/grading` để chủ dự án chấm lại.
- Tiêu chí "sai" khá chặt: mục `action` bị tính là bịa nếu bịa hẳn, sai người, sai hạn hoặc sai số, hoặc là điều đã làm xong/đã bị bác nhưng ghi như việc phải làm. Gộp "bịa" với "sai chi tiết" làm số `bia` lớn hơn nghĩa hẹp của spec (§10: "bịa việc cần làm").
- Một phần lớn lỗi bắt nguồn từ **bản dịch máy ở khâu trước** (ví dụ "sự cố" thành "khuyết tật", "nộp lại iOS" thành "hoàn lại thiết bị", hạn "thứ Hai 17/11" thành "thứ Sáu", "ngày 6/12" thành "June 6th", tăng thành giảm). Ghi chú trung thành với chữ đã dịch vẫn bị tính sai so với lời thoại gốc. Đó là điều người dùng sẽ gặp trong app, nên vẫn tính, nhưng nguyên nhân gốc nằm ở dịch chứ không riêng ở model ghi chú.
- Bộ zh là một buổi tọa đàm thật, hầu như không có việc được giao; cả 6 mục `action` đều là ý kiến chung bị ghi thành việc.
- Chưa có mốc so sánh với Cloud (không có khóa API), nên không biết một model lớn chấm theo tiêu chí này đạt bao nhiêu. Nếu Cloud cũng nhiều lỗi theo tiêu chí này thì ngưỡng của spec cần xem lại; đây là việc nên đo trước khi kết luận cuối.
- Chuẩn vs Nhẹ khác nhau ở bản dịch: số sai của bản Nhẹ cùng cỡ bản Chuẩn.
