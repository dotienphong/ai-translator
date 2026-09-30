# S3: chế độ giải mã A (split) so với B (shared) trên bộ clip A4

Máy: MacBook Pro M4 Pro 24 GB (12 lõi: 8P + 4E), macOS 26.6.2, Metal, ngày 2026-09-30. whisper.cpp 1.8.3 (có vá), `asr-worker` build `--features metal,shared-encode`, flash attention tắt, 4 luồng, `audio_ctx = min(1500, 50 × số giây + 64)`, tự nhận diện ngôn ngữ trong {en, zh, ja, ko, vi}.

Bộ clip: FLEURS dev, 548 clip (437 băng rộng `wb` và 111 băng hẹp `nb`: en 128, vi 99, zh 128, ja 88, ko 105), đã cắt lặng đầu cuối.

Bốn lượt, mỗi lượt đủ 548 clip, một lần khởi động worker, không lỗi: `m4pro-<small|turbo>-<split|shared>`. `split` là chế độ A (`ASR_MODE=split`), `shared` là chế độ B (mặc định). Mỗi lượt in đúng dòng `asr: metal (1.8.3), chế độ giải mã <split|shared>`, cứ 20 clip in tiến độ tới `540 clip`; log worker ghi `flash_attn=off` và đúng `decode_mode`; `system_info` không có `MATMUL_INT8` hay `SME`. Bảng ở cuối file là nguyên đầu ra của `score_asr.py` (80 dòng = 4 lượt × 20 nhóm, cột "Chế độ" khớp tên lượt). Số trong các bảng tự viết dùng dấu phẩy thập phân; bảng của script giữ dấu chấm.

Phần "số cho quy tắc" và các đề xuất chỉ là đề xuất từ số đo, chủ dự án duyệt sau.

## Điều kiện đo

| Lượt | Thời gian chạy | load 1 phút trước → sau | dải load (mẫu mỗi 15 s) |
|---|---|---|---|
| m4pro-small-split | 109 s | 1,68 → 19,41 | 1,12 – 26,23 |
| m4pro-small-shared | 91 s | 19,41 → 5,57 | 5,57 – 19,41 |
| m4pro-turbo-split | 218 s | 5,57 → 1,21 | 0,96 – 5,57 |
| m4pro-turbo-shared | 162 s | 1,21 → 1,77 | 1,16 – 2,19 |

- Máy cắm điện, macOS không ghi cảnh báo nhiệt hay hiệu năng; `caffeinate -i` giữ máy không ngủ; bốn lượt chạy tuần tự, không build hay việc nặng nào khác song song.
- Load 19–26 ở cuối lượt đầu (và dư âm ở đầu lượt thứ hai) không đến từ worker (worker chỉ có 5 luồng); nguồn thật không xác định được. Thời gian trung vị theo mỗi khối 60 clip liên tiếp vẫn phẳng ở cả bốn lượt (chỉ đổi theo thành phần ngôn ngữ), nên p50 không bị ảnh hưởng; không dùng số lớn nhất (max) của thời gian.
- Hai lượt cùng model chạy liền nhau, nên so A với B trong cùng model là công bằng. Thời gian tuyệt đối của turbo còn lệch theo phiên (xem `s7_asr.md`, mục điều kiện đo): đừng lấy mili giây của file này làm số cuối cho S6.

## Cách đọc số

1. **Chế độ B gom câu lặp về một bản, chế độ A không.**
   - B cắt vòng lặp token khi dãy kết thúc bằng 3 bản liên tiếp của cùng một mẫu 9–64 token (4 bản nếu mẫu không quá 8 token), và có trần số token theo độ dài đoạn (16 + 20 × số giây). A gọi `whisper_full` không kiểm lặp, nên chạy tới 220 token.
   - Vì vậy ở các clip lặp, chênh lệch A/B gồm cả hiệu ứng này, và số thô của A do vài clip quyết định. A có 35 clip `long_hyp` ở small và 35 ở turbo (B: 0); 14 (small) và 24 (turbo) clip chạy hết 220 token. Ví dụ small `en-wb` chỉ có 2 clip lặp nhưng WER thô 0,185 so với 0,078 khi chặn; turbo `ja-wbp` thô 2,366 so với 0,290 khi chặn.
   - Khi so A với B hãy đọc cột `capped`, không đọc số thô. `long_hyp` là số chèn lớn hơn độ dài ref, nên gồm cả clip ra sai ngôn ngữ (xem mục tiếng Nhật), không chỉ lặp câu.
   - Giới hạn của B: B không bắt được câu lặp đúng hai bản (cần 3 bản), và `long_hyp`, `capped` cũng không thấy trường hợp này (số chèn không vượt độ dài ref). `long_hyp = 0` ở B không có nghĩa là không còn clip lặp. Quét riêng (so hai nửa của bản chép, giống nhau từ 85%) thấy ở B: turbo 6 clip, small 2 clip; id và ảnh hưởng ở `s7_asr.md`, mục "Clip chép câu hai lần". Hai lượt A cũng có các clip này, nên chúng không tạo chênh lệch A/B.
2. **`no_speech > 0,6` chỉ có nghĩa ở chế độ B.**
   - Ở A giá trị lấy từ `whisper_full` và luôn gần 0: small p50 1,1e-6, lớn nhất 3,8e-4; turbo lớn nhất 1,6e-7. Cột của A (0% ở mọi dòng) không chứng minh gì, và bộ lọc `no_speech_prob > 0,6` ở §6.4 không có tác dụng ở A.
   - Ở B giá trị lấy ngay sau SOT. Small: p50 0,049, p99 0,43, lớn nhất 0,5965 (`en-16690374876533597237_nb`), 4 clip trên 0,5 và không clip nào trên 0,6 (cách ngưỡng 0,0035). Nên 0% clip có tiếng nói bị lọc nhầm, nhưng biên an toàn hẹp.
   - Turbo ở B cho ≈ 1e-11 ở mọi clip (p50 1,1e-11, lớn nhất 4,0e-11). Trên clip có tiếng nói bộ lọc không bao giờ kích hoạt (không lọc nhầm). Bộ clip này không có đoạn im lặng, nhiễu hay nhạc, nên chưa biết bộ lọc có bắt được ảo giác của turbo hay không; cần một phép thử riêng (xem mục đề xuất).
   - Giá trị phụ thuộc `audio_ctx` (số liệu Task 11, `s7_asr.md`): small có thêm 1 clip vượt 0,6 ở hai cấu hình khác, `en-9810650684898829002_nb` (3,6 giây, băng hẹp): 0,378 ở mặc định (`audio_ctx` 244), 0,613 ở sàn 512, 0,757 ở fullctx. Bản chép của clip này là ảo giác ở cả ba cấu hình (ví dụ "Yes, I think you're gonna be able to do that." so với ref "U.S. President George W. Bush welcomed the announcement."), nên bộ lọc lọc đúng, nhưng ngưỡng 0,6 nằm sát phân phối của small.
3. **Tiếng Nhật ở chế độ A.**
   - Theo ghi chú của kế hoạch, bản ghi ja có nền nhiễu cao, nên ngưỡng cắt lặng −35 dB gần như không cắt được gì (ngưỡng theo nền nhiễu đã thử và bị loại vì cắt vào tiếng nói). LID của A chỉ nhìn 3 giây đầu, phần nhiều là nhiễu, nên A nhận đúng ngôn ngữ chỉ 74% ở small (ja-wb 76%) và 77% ở turbo: 23 clip small (19 thành en, 4 thành ko) và 20 clip turbo (đều thành en) bị nhận sai rồi chép ra tiếng khác. B nhìn cả đoạn nên nhận đúng 88/88 ở cả hai model.
   - Vì vậy số ja của A gồm cả lỗi nhận diện ngôn ngữ: ja-wb small A 0,745 thô (0,333 khi chặn), B 0,131; turbo A 0,834 thô (0,269 khi chặn), B 0,045. Theo từng clip, toàn bộ 23 clip ja (small) và 20 clip (turbo) có bản chép của A khác B đều là clip A nhận sai ngôn ngữ; 65 (small) và 68 (turbo) clip ja còn lại có bản chép giống hệt. Số ja của A chỉ dùng để so A với B, không dùng để so model hay lấy mốc.
   - Đọc kèm lượt `--lock-language` của Task 11 (chế độ B, `s7_asr.md`): khóa ngôn ngữ không đổi chữ nào ở 88 clip ja (CER ja-wb turbo 0,045, small 0,131, bằng hệt lượt tự nhận diện), vì B tự nhận đúng 100%. Nghĩa là số ja của B không chứa lỗi nhận diện; phần chênh giữa A và B ở tiếng Nhật đến từ nhận diện sai ở A (và lặp câu), không từ model hay bộ giải mã. Không chạy `--lock-language` ở chế độ A vì ngoài kế hoạch.
4. Cột `lid_fallback` (lang_prob < 0,5, worker giữ ngôn ngữ của clip trước, nên kết quả phụ thuộc thứ tự clip trong manifest): A có 8 clip ở small (ja 3, vi 3, zh 2) và 2 clip ở turbo (ko 1, zh 1); B có 0.
5. `nb` so với `wbp` chỉ đọc được ở chế độ B (xem `s7_asr.md`); ở A các nhóm này bị vài clip lặp hoặc nhận sai ngôn ngữ chi phối (ví dụ small `en-wbp` thô 0,597, chặn 0,142).

## Nhận xét A/B

- **Chất lượng: B thấp hơn A ở cả 10 ô** (2 model × 5 ngôn ngữ, nhóm `wb`), cả số thô (B thấp hơn 21% đến 95%) lẫn số chặn (B thấp hơn 16% đến 83%); bảng bên dưới.
- **Nguồn chênh lệch chỉ có hai loại: A nhận sai ngôn ngữ và A chạy vòng lặp.** Trong 548 clip, văn bản chuẩn hóa của A khác B ở 53 clip (small) và 56 clip (turbo); mọi clip khác nhau đều có A nhận sai ngôn ngữ hoặc A lặp (`long_hyp`), không có clip nào khác nhau mà A vừa nhận đúng ngôn ngữ vừa không lặp. Ở clip mà cả hai chế độ nhận đúng ngôn ngữ (508 clip small, 507 clip turbo), bản chép giống hệt từng ký tự ở 495 và 489 clip; các clip còn lại (13 và 18) đều là clip A chạy vòng lặp (số token của A gấp hơn 1,5 lần B, phần lớn chạm trần 220). Tức là bộ giải mã tự viết ở B cho đúng kết quả của `whisper_full` khi A không gặp nhận diện sai hay vòng lặp.

| Model | Ngôn ngữ | Clip | A nhận sai ngôn ngữ | A `long_hyp` | Văn bản A ≠ B |
|---|---|---|---|---|---|
| small | en | 128 | 0 | 2 | 2 |
| small | vi | 99 | 5 | 0 | 5 |
| small | zh | 128 | 9 | 19 | 20 |
| small | ja | 88 | 23 | 11 | 23 |
| small | ko | 105 | 3 | 3 | 3 |
| turbo | en | 128 | 0 | 6 | 6 |
| turbo | vi | 99 | 8 | 2 | 8 |
| turbo | zh | 128 | 13 | 17 | 20 |
| turbo | ja | 88 | 20 | 8 | 20 |
| turbo | ko | 105 | 0 | 2 | 2 |

- **Nhận diện ngôn ngữ:** B nhận đúng 548/548 clip ở cả hai model (A: small 508, turbo 507). A nhận sai small 40 clip và turbo 41 clip (7,3% và 7,5% bộ clip), thành en, zh, ko hay vi.
- **Thời gian: B nhanh hơn và gần như không tốn cho nhận diện ngôn ngữ.** p50 của LID + ASR mỗi clip (nhóm `wb`, cùng phiên chạy liền nhau): small 168 → 148 ms (−12%), turbo 361 → 265 ms (−27%). LID/ASR: B 0–2% ở mọi nhóm; A 24–36% ở turbo (vượt 20% ở cả 5 ngôn ngữ) và 11–19% ở small (en 19%, sát ngưỡng 20%). IPC p50 0,4–0,9 ms; lớn nhất trong bốn lượt là 2,9 ms (giả định 10: ≤ 10 ms).
- **Giới hạn của phép đo:** FLEURS là câu đọc dài 3–28 s, nên LID của B nhìn cả câu; đoạn do VAD cắt ngắn hơn và nhiễu hơn, nơi nhận diện khó hơn, cần xem lại ở S6. Chỉ đo trên Mac (Metal).

## Số cho quy tắc chọn chế độ (Task 17)

Nhóm `wb`, cùng bố cục bảng ở Task 17, thêm cột số chặn. "B so với A" là (B − A) / A.

| Model | Nhóm | Chỉ số | A (split) thô | B (shared) thô | B so với A (thô) | A chặn | B chặn | B so với A (chặn) | A long_hyp | B long_hyp | A nhận đúng | B nhận đúng | A LID/ASR | B LID/ASR |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| turbo | en-wb | WER | 0,295 | 0,062 | −79,0% | 0,077 | 0,062 | −19,5% | 3 | 0 | 100,0% | 100,0% | 36% | 1% |
| turbo | vi-wb | WER | 0,283 | 0,103 | −63,7% | 0,179 | 0,100 | −44,0% | 2 | 0 | 92,4% | 100,0% | 26% | 1% |
| turbo | zh-wb | CER | 0,855 | 0,059 | −93,0% | 0,158 | 0,059 | −62,4% | 13 | 0 | 90,2% | 100,0% | 32% | 1% |
| turbo | ja-wb | CER | 0,834 | 0,045 | −94,6% | 0,269 | 0,045 | −83,4% | 5 | 0 | 77,1% | 100,0% | 24% | 0% |
| turbo | ko-wb | CER | 0,190 | 0,062 | −67,7% | 0,082 | 0,062 | −24,6% | 2 | 0 | 100,0% | 100,0% | 27% | 1% |
| small | en-wb | WER | 0,185 | 0,066 | −64,5% | 0,078 | 0,066 | −16,0% | 2 | 0 | 100,0% | 100,0% | 19% | 2% |
| small | vi-wb | WER | 0,283 | 0,224 | −20,8% | 0,283 | 0,224 | −20,8% | 0 | 0 | 93,7% | 100,0% | 11% | 1% |
| small | zh-wb | CER | 0,731 | 0,104 | −85,7% | 0,202 | 0,104 | −48,7% | 14 | 0 | 93,1% | 100,0% | 14% | 2% |
| small | ja-wb | CER | 0,745 | 0,131 | −82,4% | 0,333 | 0,131 | −60,7% | 8 | 0 | 75,7% | 100,0% | 13% | 2% |
| small | ko-wb | CER | 0,235 | 0,082 | −65,0% | 0,102 | 0,082 | −19,2% | 2 | 0 | 97,6% | 100,0% | 12% | 2% |

Kiểm ba điều kiện của quy tắc chọn B làm mặc định:
1. B nhận đúng ngôn ngữ không kém A ở mọi ngôn ngữ, với cả turbo và small: đạt. B 100% ở cả 10 ô; A từ 75,7% (small ja) đến 100%.
2. WER/CER của B không xấu hơn A quá 2% (tương đối) ở mọi ngôn ngữ: đạt. B thấp hơn A ở cả 10 ô, cả số thô (−20,8% đến −94,6%) lẫn số chặn (−16,0% đến −83,4%).
3. LID/ASR của B dưới 20%: đạt, 0–2% ở mọi nhóm (A: turbo 24–36%, small 11–19%).

Đề xuất (chủ dự án duyệt):
- Giữ B làm mặc định, theo số đo này. A chỉ là phương án dự phòng (khi không dùng được bản vá whisper.cpp), và khi đó phải chấp nhận nhận diện sai ngôn ngữ ở khoảng 7% số clip (tiếng Nhật 23–26%), cộng với lặp câu nếu không thêm bộ cắt lặp.
- Bộ lọc `no_speech_prob > 0,6` ở §6.4 chỉ có tác dụng ở B. Với turbo nó luôn ≈ 0 trên clip có tiếng nói, nên đề xuất một phép thử nhỏ trên im lặng, nhiễu và nhạc nền (ngoài bộ clip này) trước khi coi bộ lọc là có hiệu lực ở gói Chuẩn.
- Bộ cắt vòng lặp của B không bắt được câu lặp hai bản: xem đề xuất ở `s7_asr.md`.

## Bảng của `score_asr.py`

Nguyên đầu ra của `score_asr.py bench/phase0/data/asr/out-m4pro-{small,turbo}-{split,shared}.jsonl` (80 dòng). Nhóm: `<ngôn ngữ>` gộp cả hai băng (không lấy làm mốc, vì một phần tư số câu bị đếm hai lần), `-wb` băng rộng, `-nb` băng hẹp, `-wbp` bản băng rộng của đúng các câu có bản `nb`. `capped` là lỗi mỗi clip bị chặn ở độ dài ref; `long_hyp` là số clip có số chèn lớn hơn độ dài ref.

| Kết quả | Chế độ | Nhóm | Số clip | WER/CER | capped | long_hyp | Nhận đúng ngôn ngữ | lid_fallback | LID p50 (ms) | ASR p50 (ms) | LID/ASR | IPC p50/max (ms) | no_speech > 0,6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| m4pro-small-split | split | en | 128 | WER 0.180 | 0.092 | 2 | 100% | 0 | 21 | 110 | 19% | 0.4/1.0 | 0% |
| m4pro-small-split | split | en-nb | 26 | WER 0.158 | 0.152 | 0 | 100% | 0 | 21 | 105 | 20% | 0.4/0.9 | 0% |
| m4pro-small-split | split | en-wb | 102 | WER 0.185 | 0.078 | 2 | 100% | 0 | 21 | 111 | 19% | 0.4/1.0 | 0% |
| m4pro-small-split | split | en-wbp | 26 | WER 0.597 | 0.142 | 2 | 100% | 0 | 21 | 109 | 19% | 0.4/0.8 | 0% |
| m4pro-small-split | split | ja | 88 | CER 0.754 | 0.361 | 11 | 74% | 3 | 21 | 160 | 13% | 0.8/2.2 | 0% |
| m4pro-small-split | split | ja-nb | 18 | CER 0.794 | 0.476 | 3 | 67% | 0 | 21 | 169 | 12% | 0.7/1.2 | 0% |
| m4pro-small-split | split | ja-wb | 70 | CER 0.745 | 0.333 | 8 | 76% | 3 | 21 | 159 | 13% | 0.8/2.2 | 0% |
| m4pro-small-split | split | ja-wbp | 18 | CER 0.428 | 0.282 | 2 | 83% | 1 | 21 | 168 | 12% | 0.8/1.3 | 0% |
| m4pro-small-split | split | ko | 105 | CER 0.234 | 0.110 | 3 | 97% | 0 | 21 | 169 | 12% | 0.5/1.3 | 0% |
| m4pro-small-split | split | ko-nb | 21 | CER 0.232 | 0.143 | 1 | 95% | 0 | 21 | 169 | 12% | 0.5/0.9 | 0% |
| m4pro-small-split | split | ko-wb | 84 | CER 0.235 | 0.102 | 2 | 98% | 0 | 21 | 169 | 12% | 0.6/1.3 | 0% |
| m4pro-small-split | split | ko-wbp | 21 | CER 0.186 | 0.117 | 1 | 95% | 0 | 21 | 171 | 12% | 0.6/0.9 | 0% |
| m4pro-small-split | split | vi | 99 | WER 0.273 | 0.273 | 0 | 95% | 3 | 21 | 181 | 11% | 0.6/1.6 | 0% |
| m4pro-small-split | split | vi-nb | 20 | WER 0.228 | 0.228 | 0 | 100% | 1 | 21 | 170 | 12% | 0.5/0.8 | 0% |
| m4pro-small-split | split | vi-wb | 79 | WER 0.283 | 0.283 | 0 | 94% | 2 | 21 | 184 | 11% | 0.6/1.6 | 0% |
| m4pro-small-split | split | vi-wbp | 20 | WER 0.198 | 0.198 | 0 | 100% | 0 | 21 | 169 | 12% | 0.6/1.1 | 0% |
| m4pro-small-split | split | zh | 128 | CER 0.765 | 0.215 | 19 | 93% | 2 | 21 | 152 | 14% | 0.5/1.2 | 0% |
| m4pro-small-split | split | zh-nb | 26 | CER 0.900 | 0.265 | 5 | 92% | 1 | 21 | 163 | 13% | 0.5/1.2 | 0% |
| m4pro-small-split | split | zh-wb | 102 | CER 0.731 | 0.202 | 14 | 93% | 1 | 21 | 150 | 14% | 0.5/1.2 | 0% |
| m4pro-small-split | split | zh-wbp | 26 | CER 0.680 | 0.267 | 4 | 92% | 1 | 21 | 137 | 15% | 0.4/1.2 | 0% |
| m4pro-small-shared | shared | en | 128 | WER 0.083 | 0.082 | 0 | 100% | 0 | 3 | 107 | 2% | 0.4/1.2 | 0% |
| m4pro-small-shared | shared | en-nb | 26 | WER 0.158 | 0.152 | 0 | 100% | 0 | 3 | 103 | 3% | 0.4/0.8 | 0% |
| m4pro-small-shared | shared | en-wb | 102 | WER 0.066 | 0.066 | 0 | 100% | 0 | 3 | 108 | 2% | 0.4/1.2 | 0% |
| m4pro-small-shared | shared | en-wbp | 26 | WER 0.088 | 0.088 | 0 | 100% | 0 | 3 | 106 | 3% | 0.4/0.8 | 0% |
| m4pro-small-shared | shared | ja | 88 | CER 0.142 | 0.142 | 0 | 100% | 0 | 3 | 186 | 1% | 0.8/2.5 | 0% |
| m4pro-small-shared | shared | ja-nb | 18 | CER 0.186 | 0.186 | 0 | 100% | 0 | 3 | 206 | 1% | 0.8/1.2 | 0% |
| m4pro-small-shared | shared | ja-wb | 70 | CER 0.131 | 0.131 | 0 | 100% | 0 | 3 | 177 | 2% | 0.8/2.5 | 0% |
| m4pro-small-shared | shared | ja-wbp | 18 | CER 0.132 | 0.132 | 0 | 100% | 0 | 3 | 198 | 1% | 0.8/1.9 | 0% |
| m4pro-small-shared | shared | ko | 105 | CER 0.084 | 0.084 | 0 | 100% | 0 | 3 | 166 | 2% | 0.5/1.3 | 0% |
| m4pro-small-shared | shared | ko-nb | 21 | CER 0.090 | 0.090 | 0 | 100% | 0 | 3 | 166 | 2% | 0.5/0.9 | 0% |
| m4pro-small-shared | shared | ko-wb | 84 | CER 0.082 | 0.082 | 0 | 100% | 0 | 3 | 166 | 2% | 0.6/1.3 | 0% |
| m4pro-small-shared | shared | ko-wbp | 21 | CER 0.097 | 0.097 | 0 | 100% | 0 | 3 | 168 | 2% | 0.5/1.0 | 0% |
| m4pro-small-shared | shared | vi | 99 | WER 0.225 | 0.225 | 0 | 100% | 0 | 3 | 176 | 2% | 0.6/2.4 | 0% |
| m4pro-small-shared | shared | vi-nb | 20 | WER 0.228 | 0.228 | 0 | 100% | 0 | 3 | 162 | 2% | 0.5/0.9 | 0% |
| m4pro-small-shared | shared | vi-wb | 79 | WER 0.224 | 0.224 | 0 | 100% | 0 | 3 | 191 | 1% | 0.6/2.4 | 0% |
| m4pro-small-shared | shared | vi-wbp | 20 | WER 0.198 | 0.198 | 0 | 100% | 0 | 3 | 167 | 2% | 0.5/1.5 | 0% |
| m4pro-small-shared | shared | zh | 128 | CER 0.111 | 0.110 | 0 | 100% | 0 | 3 | 147 | 2% | 0.5/2.9 | 0% |
| m4pro-small-shared | shared | zh-nb | 26 | CER 0.135 | 0.135 | 0 | 100% | 0 | 3 | 157 | 2% | 0.4/1.3 | 0% |
| m4pro-small-shared | shared | zh-wb | 102 | CER 0.104 | 0.104 | 0 | 100% | 0 | 3 | 146 | 2% | 0.5/2.9 | 0% |
| m4pro-small-shared | shared | zh-wbp | 26 | CER 0.120 | 0.120 | 0 | 100% | 0 | 3 | 152 | 2% | 0.5/1.3 | 0% |
| m4pro-turbo-split | split | en | 128 | WER 0.438 | 0.097 | 6 | 100% | 0 | 84 | 237 | 35% | 0.4/1.1 | 0% |
| m4pro-turbo-split | split | en-nb | 26 | WER 1.047 | 0.183 | 3 | 100% | 0 | 84 | 238 | 35% | 0.4/0.9 | 0% |
| m4pro-turbo-split | split | en-wb | 102 | WER 0.295 | 0.077 | 3 | 100% | 0 | 84 | 237 | 36% | 0.4/1.1 | 0% |
| m4pro-turbo-split | split | en-wbp | 26 | WER 0.076 | 0.076 | 0 | 100% | 0 | 84 | 221 | 38% | 0.4/0.8 | 0% |
| m4pro-turbo-split | split | ja | 88 | CER 1.251 | 0.275 | 8 | 77% | 0 | 84 | 348 | 24% | 0.8/1.5 | 0% |
| m4pro-turbo-split | split | ja-nb | 18 | CER 2.956 | 0.298 | 3 | 78% | 0 | 84 | 363 | 23% | 0.8/1.2 | 0% |
| m4pro-turbo-split | split | ja-wb | 70 | CER 0.834 | 0.269 | 5 | 77% | 0 | 84 | 344 | 24% | 0.8/1.5 | 0% |
| m4pro-turbo-split | split | ja-wbp | 18 | CER 2.366 | 0.290 | 2 | 78% | 0 | 84 | 353 | 24% | 0.9/1.4 | 0% |
| m4pro-turbo-split | split | ko | 105 | CER 0.161 | 0.074 | 2 | 100% | 1 | 84 | 312 | 27% | 0.6/1.4 | 0% |
| m4pro-turbo-split | split | ko-nb | 21 | CER 0.040 | 0.040 | 0 | 100% | 1 | 84 | 314 | 27% | 0.5/0.9 | 0% |
| m4pro-turbo-split | split | ko-wb | 84 | CER 0.190 | 0.082 | 2 | 100% | 0 | 84 | 312 | 27% | 0.6/1.4 | 0% |
| m4pro-turbo-split | split | ko-wbp | 21 | CER 0.105 | 0.105 | 0 | 100% | 0 | 84 | 314 | 27% | 0.6/1.0 | 0% |
| m4pro-turbo-split | split | vi | 99 | WER 0.264 | 0.178 | 2 | 92% | 0 | 84 | 317 | 27% | 0.6/2.6 | 0% |
| m4pro-turbo-split | split | vi-nb | 20 | WER 0.183 | 0.175 | 0 | 90% | 0 | 84 | 298 | 28% | 0.6/1.0 | 0% |
| m4pro-turbo-split | split | vi-wb | 79 | WER 0.283 | 0.179 | 2 | 92% | 0 | 84 | 324 | 26% | 0.7/2.6 | 0% |
| m4pro-turbo-split | split | vi-wbp | 20 | WER 0.261 | 0.185 | 1 | 95% | 0 | 84 | 295 | 29% | 0.6/1.0 | 0% |
| m4pro-turbo-split | split | zh | 128 | CER 0.824 | 0.166 | 17 | 90% | 1 | 84 | 261 | 32% | 0.5/1.4 | 0% |
| m4pro-turbo-split | split | zh-nb | 26 | CER 0.700 | 0.195 | 4 | 88% | 1 | 84 | 258 | 33% | 0.5/1.3 | 0% |
| m4pro-turbo-split | split | zh-wb | 102 | CER 0.855 | 0.158 | 13 | 90% | 0 | 84 | 261 | 32% | 0.5/1.4 | 0% |
| m4pro-turbo-split | split | zh-wbp | 26 | CER 0.721 | 0.193 | 3 | 85% | 0 | 84 | 258 | 33% | 0.5/1.4 | 0% |
| m4pro-turbo-shared | shared | en | 128 | WER 0.074 | 0.074 | 0 | 100% | 0 | 2 | 222 | 1% | 0.4/1.2 | 0% |
| m4pro-turbo-shared | shared | en-nb | 26 | WER 0.128 | 0.128 | 0 | 100% | 0 | 2 | 217 | 1% | 0.4/0.9 | 0% |
| m4pro-turbo-shared | shared | en-wb | 102 | WER 0.062 | 0.062 | 0 | 100% | 0 | 2 | 227 | 1% | 0.4/1.2 | 0% |
| m4pro-turbo-shared | shared | en-wbp | 26 | WER 0.076 | 0.076 | 0 | 100% | 0 | 2 | 216 | 1% | 0.4/0.9 | 0% |
| m4pro-turbo-shared | shared | ja | 88 | CER 0.046 | 0.046 | 0 | 100% | 0 | 2 | 342 | 0% | 0.8/1.5 | 0% |
| m4pro-turbo-shared | shared | ja-nb | 18 | CER 0.050 | 0.050 | 0 | 100% | 0 | 2 | 353 | 0% | 0.8/1.3 | 0% |
| m4pro-turbo-shared | shared | ja-wb | 70 | CER 0.045 | 0.045 | 0 | 100% | 0 | 2 | 342 | 0% | 0.8/1.5 | 0% |
| m4pro-turbo-shared | shared | ja-wbp | 18 | CER 0.042 | 0.042 | 0 | 100% | 0 | 2 | 351 | 0% | 0.8/1.5 | 0% |
| m4pro-turbo-shared | shared | ko | 105 | CER 0.057 | 0.057 | 0 | 100% | 0 | 2 | 304 | 1% | 0.5/1.4 | 0% |
| m4pro-turbo-shared | shared | ko-nb | 21 | CER 0.040 | 0.040 | 0 | 100% | 0 | 2 | 305 | 1% | 0.5/0.9 | 0% |
| m4pro-turbo-shared | shared | ko-wb | 84 | CER 0.062 | 0.062 | 0 | 100% | 0 | 2 | 302 | 1% | 0.6/1.4 | 0% |
| m4pro-turbo-shared | shared | ko-wbp | 21 | CER 0.105 | 0.105 | 0 | 100% | 0 | 2 | 306 | 1% | 0.5/1.0 | 0% |
| m4pro-turbo-shared | shared | vi | 99 | WER 0.109 | 0.105 | 0 | 100% | 0 | 2 | 304 | 1% | 0.6/1.7 | 0% |
| m4pro-turbo-shared | shared | vi-nb | 20 | WER 0.136 | 0.128 | 0 | 100% | 0 | 2 | 290 | 1% | 0.6/0.9 | 0% |
| m4pro-turbo-shared | shared | vi-wb | 79 | WER 0.103 | 0.100 | 0 | 100% | 0 | 2 | 317 | 1% | 0.6/1.7 | 0% |
| m4pro-turbo-shared | shared | vi-wbp | 20 | WER 0.092 | 0.086 | 0 | 100% | 0 | 2 | 290 | 1% | 0.6/1.0 | 0% |
| m4pro-turbo-shared | shared | zh | 128 | CER 0.064 | 0.064 | 0 | 100% | 0 | 2 | 242 | 1% | 0.5/1.3 | 0% |
| m4pro-turbo-shared | shared | zh-nb | 26 | CER 0.080 | 0.080 | 0 | 100% | 0 | 2 | 236 | 1% | 0.5/1.3 | 0% |
| m4pro-turbo-shared | shared | zh-wb | 102 | CER 0.059 | 0.059 | 0 | 100% | 0 | 2 | 243 | 1% | 0.5/1.3 | 0% |
| m4pro-turbo-shared | shared | zh-wbp | 26 | CER 0.074 | 0.074 | 0 | 100% | 0 | 2 | 237 | 1% | 0.5/1.3 | 0% |
