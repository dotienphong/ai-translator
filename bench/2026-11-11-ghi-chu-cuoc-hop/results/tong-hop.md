# Tổng hợp: đo model local cho ghi chú cuộc họp

Ngày đo: 2026-11-11 đến 2026-11-12. Máy đo và cách chạy lại: `../README.md`.

## Kết luận

**Không ứng viên nào đạt.** Hệ tốt nhất là `qwen3-5-4b` cấu hình `c16kb`: đạt JSON (100%), ngôn ngữ (20/20), `refs` (99,6% chấm tay) và RAM đỉnh (5174 MiB trên iGPU, 5889 MiB chỉ CPU), nhưng **rớt hai cổng**:

1. **Thời gian.** Phiên 60 phút chậm nhất mất 662 s trên iGPU và 1335 s chỉ CPU; ngưỡng là 600 s chỉ CPU (và 180 s khi có GPU rời, chưa đo được).
2. **Việc cần làm bịa.** Chấm tay 180 việc cần làm, 56 sai (31%); ngưỡng là ≤ 2 trên 20 bản (≤ 1 mỗi 10 cuộc họp). Một phần do lỗi dịch máy (MT) sinh ra, nhưng mức này xa ngưỡng nên nới thời gian không giải quyết được.

Theo spec §10, dừng và báo chủ dự án xem lại **G3** (Cloud và Local cùng phát hành). Kế hoạch 03 (engine Local) chưa viết, chờ quyết định.

## Bảng đối chiếu ngưỡng (đầy đủ ở `tu-dong.md`)

| Hệ | Bản | JSON hợp lệ | Ngôn ngữ | 60 phút chậm nhất | RSS đỉnh (MiB) | Cổng rớt |
|---|---|---|---|---|---|---|
| qwen3-5-4b c16kb gpu | 20 | 100% | 20/20 | 662 s | 5174 | thời gian |
| qwen3-5-4b c16kb cpu | 5 | 100% | 5/5 | 1335 s | 5889 | thời gian |
| qwen3-5-4b c8kb gpu | 20 | 95,4% | 20/20 | 1127 s | 6211 | JSON, thời gian |
| qwen3-5-4b c8kb cpu | 5 | 91,2% | 5/5 | 1856 s | 6457 | JSON, thời gian, RAM |
| qwen3-5-4b c8k gpu | 20 | 82,0% | 20/20 | 807 s | 5603 | JSON, thời gian |
| qwen3-5-4b c8k cpu | 5 | 69,2% | 5/5 | 1602 s | 6289 | JSON, thời gian, RAM |
| qwen3-5-4b c16k gpu | 12 | 88,9% | 11/12 | 886 s | 5181 | JSON, ngôn ngữ, thời gian |
| qwen3-4b-instruct-2507 c8k gpu | 11 | 53,1% | 7/11 | 1041 s | 8265 | JSON, ngôn ngữ, thời gian, RAM |

Ngưỡng dùng để chấm: JSON ≥ 98%; đúng ngôn ngữ ở mọi bản; gpu ≤ 180 s; cpu ≤ 600 s và RSS ≤ 6144 MiB. Máy đo chỉ có iGPU nên cổng thời gian lấy mốc CPU (600 s); mốc GPU rời 180 s ghi là **chưa đo**.

## Chấm tay (hệ `qwen3-5-4b c16kb`, chi tiết ở `cham-tay.md`)

- 361 mục việc cần làm/quyết định được chấm; 56 bịa (tiêu chí chặt). `refs` đúng 99,6%.
- Việc cần làm theo ngôn ngữ (đúng/bịa): en 14/4, zh 6/6, ja 46/11, ko 48/15, vi 66/20; tổng 180, bịa 56 (31%).
- Chỉ số "sót" không có ý nghĩa (100%) vì bộ thử không có danh sách đáp án đủ cho en/zh.

## Thông số của hệ tốt nhất (từ `candidates.json`)

| Mục | Giá trị |
|---|---|
| Model | unsloth/Qwen3.5-4B-GGUF, Q4_K_M, Apache-2.0 |
| Revision | `e87f176479d0855a907a41277aca2f8ee7a09523` |
| Tệp | `Qwen3.5-4B-Q4_K_M.gguf`, 2 740 937 888 byte |
| sha256 | `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4` |
| Cấu hình | `c16kb`: context 16384, đoạn 12000, trần map 2000, trần reduce 3000 |
| `server_args` | `[]` |
| `request_extra` | `{"chat_template_kwargs":{"enable_thinking":false}}` |
| llama.cpp | b11146 (bản app đang khóa; chạy được, không cần binary riêng) |

Ứng viên còn lại: `qwen3-4b-instruct-2507` (unsloth, revision `a06e946bb6b655725eafa393f4a9745d460374c9`, 2 497 281 120 byte, sha256 `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597`) kém hẳn: dừng ở 11/20 bản. Gemma 4 E4B loại vì nặng hơn 4 GiB.

## Chưa đo / hạn chế

- **Card đồ họa rời** (mốc 180 s): chưa đo.
- **Mốc Cloud** (Gemini, ChatGPT) trên cùng bộ thử: chưa đo (chưa có key API), nên độ chặt của tiêu chí "bịa" chưa có điểm neo.
- **Nhiễu nhận dạng giọng nói:** bộ thử dựng từ chữ (QMSum, VCSum, bản tổng hợp ja/ko/vi) rồi dịch bằng MT của app, không thu qua app. Kết quả lạc quan về nhiễu ASR, nhưng có thêm lỗi do MT.
- **Gói Nhẹ** chỉ đo một nửa (lượng tử hóa của MT; không có ASR Nhẹ).
- **Máy 16 GB chỉ CPU:** chưa có máy; thời gian CPU đo trên máy 32 GB, 12 luồng.
- Không đủ bản: `qwen3-4b-instruct` 11/20; `c16k` 12/20; `c8k`, `c8kb` chạy CPU chỉ 5 bản 60 phút/30 phút.

## Quyết định cần chủ dự án (G3)

1. Nới cổng thời gian (vd 20 phút CPU): vẫn không đạt vì việc cần làm bịa 31%.
2. Chỉ phát hành Cloud trước; Local sau, khi có model/máy tốt hơn.
3. Cloud mặc định; Local tùy chọn, giới hạn ở tóm tắt và câu hỏi mở, không tạo việc cần làm.

**Khuyến nghị:** phương án 3 (hoặc 2). Trước khi chốt, đo mốc Cloud (cần key API do chủ dự án đặt qua biến môi trường shell) để biết 31% bịa có phải do tiêu chí chặt hay do model.
