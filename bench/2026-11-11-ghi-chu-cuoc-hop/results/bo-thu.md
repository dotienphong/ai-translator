# Bộ thử của spike ghi chú cuộc họp

Dựng ngày 2026-11-12 bằng `make_raw.py` rồi `build_set.py`. Bản chép lời nằm ngoài git, ở `$DATA/raw` và `$DATA/set`; file này chỉ có số.

## Cách dựng (khác với kế hoạch)

Kế hoạch 01 muốn ghi 7,5 giờ âm thanh qua app. Chủ dự án đã ủy quyền cho người điều phối tự quyết (2026-11-11 21:11), và bộ thử được dựng từ **nguồn chữ**:

1. Lấy một cuộc họp dạng chữ cho mỗi ngôn ngữ nguồn.
2. Cắt câu, gán giờ theo tốc độ nói (ký tự/giây: en 14, vi 12, zh 5, ja 4,5, ko 5; nghỉ 0,3 giây giữa hai câu). Các số này chốt trước khi đo model ghi chú.
3. Dịch từng câu bằng chính model dịch của app, qua `llama-server` b11146, đúng prompt và tham số của `crates/pipeline` (temperature 0, repeat_penalty 1,05, thử lại 1,15, max_tokens = min(4 × số token nguồn + 32, 512)).
4. Ghi ra đúng định dạng "Xuất Markdown" của app, nên `notes_lib.parse_markdown_export` và mọi bước sau chạy như kế hoạch.

Chiều dịch: en, zh, ja, ko → vi; vi → en.

| Gói | Model dịch | Phần đã dịch |
|---|---|---|
| Chuẩn | bản lượng tử 8 bit của gói Chuẩn | 61 phút đầu |
| Nhẹ | bản lượng tử 4 bit của gói Nhẹ | 31 phút đầu |

## Nguồn

| Ngôn ngữ | Nguồn | Giấy phép |
|---|---|---|
| en | Một cuộc họp nghiên cứu thật (ICSI) trong QMSum, `data/Academic/test`, dòng 0. Đã bỏ nhãn `{disfmarker}`, `{vocalsound}`… | Kho QMSum: MIT |
| zh | Một buổi tọa đàm thật trong VCSum (id 136; 4 người nói, 167 lượt, 26 291 ký tự), bản chép lời do ASR | Kho VCSum: MIT |
| ja, ko, vi | Cuộc họp tự viết cho spike này (ja 415, ko 362, vi 415 câu), kèm danh sách chuẩn: quyết định, việc cần làm, câu hỏi mở và các "bẫy" (điều được nêu rồi bị rút lại, số bị sửa) | Của dự án |

Số mục trong danh sách chuẩn (quyết định / việc cần làm / câu hỏi mở / bẫy): ja 11/20/5/10, ko 12/24/4/14, vi 13/34/5/17.

## 20 bản chép lời

Kết quả `build_set.py` (cắt 10, 30, 60 phút đầu của bản Chuẩn; 30 phút đầu của bản Nhẹ):

| File | Số câu | Bị bỏ | Không có bản dịch |
|---|---|---|---|
| en-chuan-10 | 136 | 0 | 0 |
| en-chuan-30 | 456 | 0 | 0 |
| en-chuan-60 | 944 | 0 | 0 |
| en-nhe-30 | 456 | 0 | 0 |
| zh-chuan-10 | 93 | 0 | 0 |
| zh-chuan-30 | 260 | 0 | 0 |
| zh-chuan-60 | 521 | 0 | 0 |
| zh-nhe-30 | 260 | 0 | 0 |
| ja-chuan-10 | 89 | 0 | 0 |
| ja-chuan-30 | 216 | 0 | 0 |
| ja-chuan-60 | 407 | 0 | 0 |
| ja-nhe-30 | 216 | 0 | 0 |
| ko-chuan-10 | 61 | 0 | 0 |
| ko-chuan-30 | 177 | 0 | 0 |
| ko-chuan-60 | 358 | 0 | 0 |
| ko-nhe-30 | 177 | 0 | 0 |
| vi-chuan-10 | 71 | 0 | 0 |
| vi-chuan-30 | 196 | 0 | 0 |
| vi-chuan-60 | 411 | 0 | 0 |
| vi-nhe-30 | 196 | 0 | 0 |

Không câu nào dịch hỏng ("(chưa dịch được)" = 0 trong cả mười file gốc).

## Giới hạn

- **Không có lỗi nhận dạng giọng nói.** Chữ nguồn sạch hơn chữ app thật sự chép được (trừ zh, vốn là bản ASR). Số chất lượng đo trên bộ này là số lạc quan.
- **Gói Nhẹ chỉ đo một nửa.** Trong app, Nhẹ khác Chuẩn ở cả model nhận dạng lẫn model dịch; ở đây chỉ khác model dịch.
- **ja, ko, vi là họp tự viết.** Chúng có cấu trúc rõ hơn họp thật; bù lại có danh sách chuẩn để chấm "bịa" và độ phủ chính xác hơn.
- **Giờ là giờ ước lượng** theo tốc độ nói. Bản en dày nhất (944 câu trong 60 phút) nên nó quyết định thời gian xấu nhất.
- Mỗi ngôn ngữ chỉ có một cuộc họp, cắt thành bốn độ dài; các bản 10, 30, 60 phút không độc lập với nhau.
