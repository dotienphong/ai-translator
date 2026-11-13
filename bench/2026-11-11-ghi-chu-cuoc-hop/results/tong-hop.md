# Tổng hợp: đo model local cho ghi chú cuộc họp

Ngày đo: 2026-11-11 đến 2026-11-13 (ba vòng Local, một vòng mốc Cloud). Máy đo và cách chạy lại: `../README.md`.

## Kết luận

**Local chưa đạt ngưỡng của spec, nhưng ngưỡng bịa của spec cũng không thực tế.** Mốc Cloud (DeepSeek `deepseek-v4-flash`, vòng 4, `cham-tay-4.md`) chấm mù cùng Local cho kết quả:

| | Cloud (DeepSeek) | Local `qwen3-5-4b c16kx` |
|---|---|---|
| Việc cần làm bịa hẳn (ngưỡng ≤ 2 / 20 bản) | 10 | 8 |
| Việc có thật nhưng sai chi tiết | 10 | 32 |
| Việc cần làm sai / tổng | 20 / 207 (10%) | 40 / 177 (23%) |
| Recall việc cần làm | 94% | 59% |
| Phiên 60 phút chậm nhất | 13 s | 840 s (iGPU) |

- Về **bịa hẳn**, Local ngang model cloud; cả hai đều rớt ngưỡng ≤ 2/20, nên ngưỡng này nên viết lại theo mốc Cloud.
- Khoảng cách thật là **chi tiết và độ đủ**: Local sai chi tiết gấp ba và sót khoảng 40% việc thật.
- Hệ tốt nhất cho Local vẫn là `c16kx` (vòng 2): đạt mọi cổng tự động (JSON 100%, ngôn ngữ 20/20, 840 s, RAM đỉnh 4315 MiB). Vòng 3 (`c16ky`, đọc lời gốc) không hơn rõ ràng.

Ngày 2026-11-12 chủ dự án nới cổng thời gian lên **15 phút (900 s)** cho phiên 60 phút. Chạy chỉ CPU chưa đo với cấu hình mới (`c16kb` chỉ CPU: 1335 s).

Theo spec §10, G3 chờ chủ dự án quyết định lại. Kế hoạch 03 (engine Local) chưa viết.

## Vòng 1 và vòng 2

| | Vòng 1: `c16kb` | Vòng 2: `c16kx` |
|---|---|---|
| Lời nhắc map | `map.txt` | `map_v2.txt`: chỉ ghi việc có người nhận/được giao |
| Gộp đoạn | model viết lại mọi mục | model chỉ viết tóm tắt; mục gộp bằng máy |
| Lượt kiểm | không | từng việc, đọc câu gốc ± 1 câu kèm bản dịch; bỏ việc không có lời giao/nhận, sửa người nhận và hạn |
| `llama-server` | mặc định | `--cache-ram 0` (mặc định giữ tới 8 GiB bộ đệm prompt trên RAM) |
| 60 phút chậm nhất (iGPU) | 662 s | 840 s |
| RSS đỉnh | 5174 MiB | 4315 MiB |
| Việc cần làm sai (chấm mù chung) | 60 / 180 (33%) | 42 / 177 (24%) |
| Recall việc cần làm | 81,8% | 82,4% |

Hai cấu hình thử giữa chừng: `c16kv` (kiểm từng việc, model viết lại nội dung: ko-60 1076 s, RSS 12 GiB, 2 bản ja sai ngôn ngữ) và `c16kw` (kiểm theo lô: nhanh hơn nhưng gần như không bỏ việc nào, ko-60 vẫn 955 s). Số liệu ở `tu-dong.md`; chấm tay ở `cham-tay.md` (vòng 1), `cham-tay-2.md` (vòng 2) , `cham-tay-3.md` (vòng 3, tách bịa hẳn với sai chi tiết) và `cham-tay-4.md` (mốc Cloud).

## Bảng đối chiếu ngưỡng tự động (đầy đủ ở `tu-dong.md`)

| Hệ | Bản | JSON hợp lệ | Ngôn ngữ | 60 phút chậm nhất | RSS đỉnh (MiB) | Cổng tự động |
|---|---|---|---|---|---|---|
| qwen3-5-4b c16ky gpu | 20 | 99,6% | 20/20 | 870 s | 4259 | đạt |
| qwen3-5-4b c16kx gpu | 20 | 100% | 20/20 | 840 s | 4315 | đạt |
| qwen3-5-4b c16kb gpu | 20 | 100% | 20/20 | 662 s | 5174 | đạt |
| qwen3-5-4b c16kb cpu | 5 | 100% | 5/5 | 1335 s | 5889 | thời gian |
| qwen3-5-4b c16kw gpu | 20 | 100% | 20/20 | 955 s | 4108 | thời gian |
| qwen3-5-4b c16kv gpu | 20 | 100% | 18/20 | 1076 s | 12354 | ngôn ngữ, thời gian |
| qwen3-5-4b c8kb gpu | 20 | 95,4% | 20/20 | 1127 s | 6211 | JSON, thời gian |
| qwen3-5-4b c8k gpu | 20 | 82,0% | 20/20 | 807 s | 5603 | JSON |
| qwen3-4b-instruct-2507 c8k gpu | 11 | 53,1% | 7/11 | 1041 s | 8265 | JSON, ngôn ngữ, thời gian, RAM |

Ngưỡng: JSON ≥ 98%; đúng ngôn ngữ ở mọi bản; phiên 60 phút ≤ 900 s; RSS ≤ 6144 MiB.

## Vì sao việc cần làm vẫn sai

Người chấm ghi phần lớn lỗi còn lại ở ja và vi là sai hạn, sai người, sai chi tiết **do bản dịch máy ở khâu trước** (vd hạn "6/12" thành "June 6th"), và việc đã xong vẫn ghi như việc phải làm. Model ghi chú đọc bản dịch nên chép theo lỗi dịch. Tiêu chí chấm chặt: gộp "bịa" với "sai chi tiết".

## Thông số của hệ tốt nhất (từ `candidates.json`)

| Mục | Giá trị |
|---|---|
| Model | unsloth/Qwen3.5-4B-GGUF, Q4_K_M, Apache-2.0 |
| Revision | `e87f176479d0855a907a41277aca2f8ee7a09523` |
| Tệp | `Qwen3.5-4B-Q4_K_M.gguf`, 2 740 937 888 byte |
| sha256 | `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4` |
| Cấu hình | `c16kx`: context 16384, đoạn 12000, trần map 2000; reduce chỉ tóm tắt; kiểm từng việc ± 1 câu |
| `server_args` | `[]`, cộng `--cache-ram 0` |
| `request_extra` | `{"chat_template_kwargs":{"enable_thinking":false}}` |
| llama.cpp | b11146 (bản app đang khóa) |

## Chưa đo / hạn chế

- **Mốc Cloud của chính spec** (Gemini, ChatGPT): chưa đo; mốc đã đo là DeepSeek v4-flash (cùng tầm model mặc định của hai nguồn đó, không phải số của chính chúng).
- Vòng 3 đã thử ghi chú đọc lời gốc (`c16ky`): không hơn rõ ràng (xem `cham-tay-3.md`).
- **Chỉ CPU với `c16kx`**, **máy 16 GB**, **card rời**: chưa đo.
- **Nhiễu nhận dạng giọng nói:** bộ thử dựng từ chữ rồi dịch bằng MT của app, không thu qua app.
- **Gói Nhẹ** chỉ đo một nửa (lượng tử hóa của MT).
- Chấm tay do agent, không phải người; hai lượt chấm cùng hệ lệch ± 4 mục.

## Quyết định cần chủ dự án (G3)

1. Chỉ phát hành Cloud trước; Local sau.
2. Cloud mặc định; Local tùy chọn, ghi rõ "bản nháp, kiểm lại việc cần làm", có nút đối chiếu câu gốc, hệ `c16kx`; sửa ngưỡng bịa của spec thành "không tệ hơn mốc Cloud".
3. Giữ G3 (cùng phát hành, Local mặc định): không khuyên, vì Local sót khoảng 40% việc thật.
