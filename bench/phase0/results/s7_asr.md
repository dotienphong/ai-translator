# S7 phần nhận dạng (A4): mốc và quyết định

Máy: MacBook Pro M4 Pro 24 GB (12 lõi: 8P + 4E), macOS 26.6.2, Metal, ngày 2026-09-30. whisper.cpp 1.8.3 (có vá), chế độ B, bộ clip FLEURS dev (548 clip: 437 wb và 111 nb, khoảng 15 phút mỗi ngôn ngữ, đã cắt lặng đầu cuối).

Các lượt (Task 10 và 11): mỗi lượt đủ 548 clip, một lần khởi động worker, không lỗi, log worker ghi `flash_attn=off`, mỗi lượt in `asr: metal (1.8.3), chế độ giải mã shared`.
- **mặc định** = `m4pro-<model>-shared`: chế độ B, tự nhận diện ngôn ngữ, `audio_ctx = min(1500, 50 × số giây + 64)`. Đây là mốc A4.
- **fullctx** = `--full-ctx`: `audio_ctx` = 1500 (cửa sổ 30 giây).
- **lock** = `--lock-language`: khóa ngôn ngữ đúng theo nhãn của clip.
- **sàn 512** = `--min-ctx 512`: `audio_ctx = max(công thức, 512)`.

Cách đọc: mọi WER/CER lấy nhóm `-wb` trừ khi ghi khác. Các bảng tự viết dùng dấu phẩy thập phân; "Bảng đầy đủ" ở cuối do script sinh nên giữ dấu chấm. Khoảng tin cậy 95% là bootstrap theo clip (hoặc theo câu) với 3000–4000 lần lấy mẫu lại, hạt giống cố định; việc phát hiện clip chép câu hai lần cũng là phân tích thêm ngoài `score_asr.py`, để đọc số chứ không thay quy tắc của kế hoạch. Các "đề xuất" chỉ là đề xuất từ số đo, chủ dự án duyệt sau.

## Tóm tắt

- **Mốc A4** (nhóm `-wb`, turbo / small): en WER 0,062 / 0,066; vi WER 0,103 / 0,224; zh CER 0,059 / 0,104; ja CER 0,045 / 0,131; ko CER 0,062 / 0,082.
- **Giả định 8 không đạt**: 5/10 ô vượt 10% (turbo en, vi, zh, ko; small ko). Lỗi thêm ở cửa sổ rút ngắn chủ yếu là chép thừa (chèn), gồm cả clip chép câu hai lần mà `long_hyp`, `_capped` và bộ cắt lặp của chế độ B không thấy.
- **Mức sàn `audio_ctx` 512**: giảm lỗi (turbo −6,4%, small −1,5% tổng số lỗi), không ô nào xấu đi đáng kể; chi phí p50 nhỏ (turbo +2,1%) nhưng dồn vào đoạn ngắn (turbo +49% ở đoạn dưới 5 giây). Đề xuất thêm vào §6.4; S6 đo với mức sàn.
- **Khóa ngôn ngữ**: không đổi chữ nào (0/548 clip), vì chế độ B tự nhận đúng 548/548 clip.
- **Gói Nhẹ (small)** kém rõ ở tiếng Việt (WER 22%), Nhật (CER 13%) và Trung (CER 10%); tiếng Anh ngang turbo, tiếng Hàn kém vừa (CER 0,082 so với 0,062).
- **Băng hẹp** làm lỗi tăng ở hầu hết ô, rõ nhất ở en và ja.

## Mốc A4 (cấu hình mặc định của app)

Số lấy từ nhóm `-wb`, tức mỗi câu một lần.
- Quyết định theo số thô. Mốc lưu ở `a4_m4pro-turbo-shared.json` và `a4_m4pro-small-shared.json`.
  - Ghi chú 2026-10-01: mốc hiện hành là `a4_m4pro-turbo-final.json` và `a4_m4pro-small-final.json` (cấu hình chốt: sàn `audio_ctx` 512, luật lặp mới; spec §3.3). File này giữ số của cấu hình cũ để so sánh; các số bên dưới không sửa.
- Cột `_capped` và `long_hyp` cho biết bao nhiêu lỗi đến từ clip lặp câu. Ở chế độ B, `long_hyp` bằng 0 ở cả 10 ô, `_capped` bằng số thô ở 9/10 ô (turbo vi: 0,100 so với 0,103), nên số thô và số chặn cho cùng kết luận. Nhưng hai cột này không thấy clip chép câu hai lần (số chèn không vượt độ dài ref). Quét riêng thấy các clip đó ở nhóm `-wb` (mục "Clip chép câu hai lần", có id): chúng làm cao số thô của turbo vi (0,103; bỏ bản lặp thứ hai còn 0,088), turbo ko (0,062; còn 0,044) và small zh (0,104; còn 0,098). Các ô còn lại không đổi.

| Ngôn ngữ | Chỉ số | Gói Chuẩn (turbo) | Gói Nhẹ (small) |
|---|---|---|---|
| en | WER | 0,062 | 0,066 |
| vi | WER | 0,103 | 0,224 |
| zh | CER | 0,059 | 0,104 |
| ja | CER | 0,045 | 0,131 |
| ko | CER | 0,062 | 0,082 |

Số thô vẫn là mốc, vì đó là hành vi thật của cấu hình hiện tại và giải mã tái lập được (lượt `lock` cho đúng từng ký tự như lượt mặc định ở cả 548 clip). Đề xuất: nếu thêm mức sàn 512 hoặc bộ cắt lặp hai bản (các mục bên dưới) thì đo lại mốc với cấu hình đó, vì hai thay đổi này sẽ hạ số thô ở ba ô trên.

Băng hẹp: so nhóm `-nb` với `-wbp` (cùng tập câu), không so với `-wb`. `-nb` tăng so với `-wbp` (lỗi tương đối): turbo en +67,6%, vi +46,8%, zh +9,0%, ja +19,4%, ko −61,5%; small en +79,1%, vi +14,9%, zh +12,8%, ja +41,6%, ko −7,3%.
- Mỗi ô chỉ có 18–26 câu nên khoảng tin cậy rộng. Loại được 0: turbo en, vi, ja; small en, ja. Các ô còn lại (zh cả hai model, vi small, ko cả hai model) không phân biệt được với 0.
- Hai ô ko âm không có nghĩa. Ở turbo, `wbp` chứa clip chép hai bản `ko-13932034022230918300` (76 trong 104 lỗi của `wbp`); bỏ bản lặp thì ko turbo là +17,6%. Sau khi bỏ bản lặp hai lần, turbo en còn +45,9% và vi còn +18,8%.
- Kết luận: băng hẹp làm lỗi tăng ở hầu hết ô (9/10 sau khi bỏ bản lặp), rõ nhất ở en (+46% đến +79%) và ja (+19% đến +42%); zh tăng ít (+9% đến +13%).

| Ngôn ngữ | Model | Số câu | nb (lỗi / ref) | wbp (lỗi / ref) | nb so với wbp | 95% (bootstrap theo câu) | nb so với wbp, bỏ bản lặp hai lần |
|---|---|---|---|---|---|---|---|
| en | turbo | 26 | 62 / 486 = 0,128 | 37 / 486 = 0,076 | +67,6% | [+18,2%; +164,7%] | 54 so với 37: +45,9% |
| en | small | 26 | 77 / 486 = 0,158 | 43 / 486 = 0,088 | +79,1% | [+34,9%; +151,5%] | 77 so với 43: +79,1% |
| vi | turbo | 20 | 69 / 509 = 0,136 | 47 / 509 = 0,092 | +46,8% | [+1,2%; +174,1%] | 38 so với 32: +18,8% |
| vi | small | 20 | 116 / 509 = 0,228 | 101 / 509 = 0,198 | +14,9% | [−1,1%; +37,0%] | 116 so với 101: +14,9% |
| zh | turbo | 26 | 73 / 908 = 0,080 | 67 / 908 = 0,074 | +9,0% | [−4,9%; +28,8%] | 73 so với 67: +9,0% |
| zh | small | 26 | 123 / 908 = 0,135 | 109 / 908 = 0,120 | +12,8% | [−1,2%; +29,6%] | 123 so với 109: +12,8% |
| ja | turbo | 18 | 43 / 858 = 0,050 | 36 / 858 = 0,042 | +19,4% | [+3,8%; +84,6%] | 43 so với 36: +19,4% |
| ja | small | 18 | 160 / 858 = 0,186 | 113 / 858 = 0,132 | +41,6% | [+10,0%; +100,0%] | 160 so với 113: +41,6% |
| ko | turbo | 21 | 40 / 990 = 0,040 | 104 / 990 = 0,105 | −61,5% | [−86,5%; +84,6%] | 40 so với 34: +17,6% |
| ko | small | 21 | 89 / 990 = 0,090 | 96 / 990 = 0,097 | −7,3% | [−51,0%; +79,5%] | 89 so với 96: −7,3% |

Reference:
- zh đã bỏ chú thích Latin trong ngoặc ở 19 clip, theo quy tắc (15 câu băng rộng và 4 bản băng hẹp của 4 trong số đó). Danh sách id nằm trong `bench/phase0/data/asr/a4_gloss.txt` (không commit; tám dòng giống nhau, mỗi lượt chấm một dòng) và chép bên dưới. Quy tắc giữ `AI` và `CEP`, vì model chép ra, tức người đọc có đọc. Trong bộ clip này chỉ `AI` xuất hiện và được giữ (1 clip, `zh-7748726541994053870`); `CEP` không có.
  - Băng rộng (15): zh-6493646763526361467, zh-4742596756523997399, zh-3890233952096932600, zh-8986468706138129615, zh-15475805778116836941, zh-12942277076838231941, zh-7153096397603898985, zh-3360514559788087381, zh-15498956202881691437, zh-12259551834745040618, zh-8882064931020870249, zh-132410827671079618, zh-12777520601088301837, zh-7694019024049504210, zh-14613085993617852640.
  - Băng hẹp (4): zh-15475805778116836941_nb, zh-12942277076838231941_nb, zh-3360514559788087381_nb, zh-14613085993617852640_nb.
- Việc cho người dùng: nghe lại 24 clip có chú thích Latin (zh 16, ja 3, ko 5) và sửa ref nếu cần. A4 đòi bản chép đã được người kiểm. Id (băng rộng):
  - zh (16): 15 id băng rộng ở trên và `zh-7748726541994053870` (giữ `(AI)`).
  - ja (3): ja-5737391341571244470 (Did Not Finish), ja-7382461951706957035 (KNP), ja-13024610670155213415 (NSW).
  - ko (5): ko-193172125984985515 (Number One, Manta), ko-13932034022230918300 (KNP), ko-11543408116050555970 (gap-year), ko-7047077616255316968 (Robin Uthappa), ko-17980731395936688752 (Vinson Massif).
- Quy tắc bỏ chú thích chỉ áp cho zh. Ref ja và ko giữ nguyên phần Latin trong ngoặc; nếu người đọc không đọc phần đó thì các chữ này tính là lỗi xóa (nhỏ: `KNP` là 3 trong 76 ký tự của `ko-13932034022230918300`).

## Giả định 8: rút ngắn `audio_ctx` làm WER/CER tăng không quá 10% (tương đối)

Quy tắc: với từng ngôn ngữ và từng model, (mặc định − fullctx) / fullctx ≤ 10%.
- Kết quả: **không đạt**. 5/10 ô vượt: turbo en +13,3%, vi +27,1%, zh +18,9%, ko +44,0%; small ko +15,5%. Đạt: turbo ja +4,0%; small en −4,2%, vi −0,6%, zh +9,6% (sát ngưỡng), ja −4,8%.
- Sau khi bỏ bản lặp thứ hai ở các clip chép câu hai lần, còn 3/10 ô vượt: turbo en +13,3%, turbo zh +18,9%, small ko +15,5%.

| Model | Nhóm | Chỉ số | Mặc định (lỗi / ref) | fullctx (lỗi / ref) | (mặc định − fullctx) / fullctx | 95% (bootstrap theo clip) | ≤ 10%? | Mặc định, bỏ bản lặp hai lần | (mặc định − fullctx) / fullctx khi đó | ≤ 10%? |
|---|---|---|---|---|---|---|---|---|---|---|
| turbo | en-wb | WER | 128 / 2066 = 0,062 | 113 / 2066 = 0,055 | +13,3% | [−4,7%; +36,6%] | KHÔNG ĐẠT | 128 = 0,062 | +13,3% | KHÔNG ĐẠT |
| turbo | vi-wb | WER | 230 / 2240 = 0,103 | 181 / 2240 = 0,081 | +27,1% | [+6,5%; +54,1%] | KHÔNG ĐẠT | 198 = 0,088 | +9,4% | đạt |
| turbo | zh-wb | CER | 214 / 3599 = 0,059 | 180 / 3599 = 0,050 | +18,9% | [+2,5%; +43,6%] | KHÔNG ĐẠT | 214 = 0,059 | +18,9% | KHÔNG ĐẠT |
| turbo | ja-wb | CER | 157 / 3509 = 0,045 | 151 / 3509 = 0,043 | +4,0% | [−13,8%; +27,9%] | đạt | 157 = 0,045 | +4,0% | đạt |
| turbo | ko-wb | CER | 252 / 4097 = 0,062 | 175 / 4097 = 0,043 | +44,0% | [−8,2%; +149,2%] | KHÔNG ĐẠT | 182 = 0,044 | +4,0% | đạt |
| small | en-wb | WER | 136 / 2066 = 0,066 | 142 / 2066 = 0,069 | −4,2% | [−12,8%; +5,2%] | đạt | 136 = 0,066 | −4,2% | đạt |
| small | vi-wb | WER | 502 / 2240 = 0,224 | 505 / 2240 = 0,225 | −0,6% | [−4,1%; +2,9%] | đạt | 502 = 0,224 | −0,6% | đạt |
| small | zh-wb | CER | 376 / 3599 = 0,104 | 343 / 3599 = 0,095 | +9,6% | [−2,6%; +25,9%] | đạt | 352 = 0,098 | +2,6% | đạt |
| small | ja-wb | CER | 459 / 3509 = 0,131 | 482 / 3509 = 0,137 | −4,8% | [−9,4%; +0,2%] | đạt | 459 = 0,131 | −4,8% | đạt |
| small | ko-wb | CER | 336 / 4097 = 0,082 | 291 / 4097 = 0,071 | +15,5% | [−1,4%; +47,1%] | KHÔNG ĐẠT | 336 = 0,082 | +15,5% | KHÔNG ĐẠT |

Đọc kết quả:
1. **Lỗi thêm ở cửa sổ rút ngắn chủ yếu là chép thừa (chèn), ít là chép sai.** Phần thay + xóa gần như không đổi giữa mặc định và fullctx (turbo vi 177 so với 164, zh 172 so với 162; ở ja và ko mặc định còn ít hơn), còn phần chèn tăng mạnh (turbo vi 53 so với 17, zh 42 so với 18, ko 93 so với 9). Một phần là clip chép câu hai lần (mục dưới); phần còn lại là lặp một phần, thường là cụm cuối câu chép hai lần, ví dụ turbo `zh-16107758687422588857` (12 lỗi, fullctx 0) và `zh-3802121691135715433` (15 lỗi, fullctx 5). Ngoại lệ: small ko có cả thay + xóa tăng (306 so với 280).
2. **Số đo chưa đủ chắc để chốt "≤ 10%" cho từng ô.** Mỗi ô chỉ có 70–102 câu; khoảng tin cậy 95% rộng hơn 40 điểm phần trăm ở 6/10 ô (ví dụ turbo en [−4,7%; +36,6%], turbo ko [−8,2%; +149,2%]), chỉ small vi và ja hẹp dưới 10 điểm. Chỉ turbo vi và zh loại được 0, tức hai ô này đúng là xấu đi. Các ô còn lại, gồm cả ô vượt ngưỡng ở turbo en, turbo ko và small ko, chứa 0. Ô turbo ko chủ yếu do một clip: `ko-13932034022230918300` chép hai lần, 76 lỗi ở mặc định và 6 ở fullctx, tức 70 trong 77 lỗi chênh lệch.
3. **Với mức sàn 512 vẫn còn 3/10 ô vượt** (bảng dưới): turbo zh +11,1%, turbo ko +45,1% (+5,1% nếu bỏ bản lặp hai lần của clip ở trên, vốn không bị sàn đụng tới vì `audio_ctx` của nó là 751), small ko +15,5%. Khoảng cách còn lại tới fullctx nằm ở các clip dài hơn 9 giây, mà sàn không đổi: turbo zh +20 lỗi ở 38 clip không đổi `audio_ctx` so với +0 ở 64 clip bị đổi; turbo ko +80 so với −1; small ko +42 so với +3. Nên phần này thuộc về chính công thức, không sửa được bằng sàn.
4. **fullctx là phương án tốt nhất về lỗi nhưng chậm.** ASR p50 (nhóm `wb`): turbo 334 → 884 ms (gấp 2,6 lần), small 147 → 237 ms (gấp 1,6 lần), so với lượt `lock` cùng phiên (cùng khối lượng việc như lượt mặc định). Ngân sách §8 cho nhận dạng ở gói Chuẩn là 0,3–0,6 s, turbo fullctx 0,88 s vượt.

Với mức sàn 512, cùng quy tắc (sàn 512 − fullctx) / fullctx ≤ 10%:

| Model | Nhóm | Chỉ số | Sàn 512 (lỗi / ref) | fullctx (lỗi / ref) | (sàn 512 − fullctx) / fullctx | ≤ 10%? | Sàn 512, bỏ bản lặp hai lần | khi đó | ≤ 10%? |
|---|---|---|---|---|---|---|---|---|---|
| turbo | en-wb | WER | 112 / 2066 = 0,054 | 113 / 2066 = 0,055 | −0,9% | đạt | 112 = 0,054 | −0,9% | đạt |
| turbo | vi-wb | WER | 195 / 2240 = 0,087 | 181 / 2240 = 0,081 | +7,7% | đạt | 195 = 0,087 | +7,7% | đạt |
| turbo | zh-wb | CER | 200 / 3599 = 0,056 | 180 / 3599 = 0,050 | +11,1% | KHÔNG ĐẠT | 200 = 0,056 | +11,1% | KHÔNG ĐẠT |
| turbo | ja-wb | CER | 157 / 3509 = 0,045 | 151 / 3509 = 0,043 | +4,0% | đạt | 157 = 0,045 | +4,0% | đạt |
| turbo | ko-wb | CER | 254 / 4097 = 0,062 | 175 / 4097 = 0,043 | +45,1% | KHÔNG ĐẠT | 184 = 0,045 | +5,1% | đạt |
| small | en-wb | WER | 136 / 2066 = 0,066 | 142 / 2066 = 0,069 | −4,2% | đạt | 136 = 0,066 | −4,2% | đạt |
| small | vi-wb | WER | 505 / 2240 = 0,225 | 505 / 2240 = 0,225 | +0,0% | đạt | 505 = 0,225 | +0,0% | đạt |
| small | zh-wb | CER | 345 / 3599 = 0,096 | 343 / 3599 = 0,095 | +0,6% | đạt | 345 = 0,096 | +0,6% | đạt |
| small | ja-wb | CER | 459 / 3509 = 0,131 | 482 / 3509 = 0,137 | −4,8% | đạt | 459 = 0,131 | −4,8% | đạt |
| small | ko-wb | CER | 336 / 4097 = 0,082 | 291 / 4097 = 0,071 | +15,5% | KHÔNG ĐẠT | 336 = 0,082 | +15,5% | KHÔNG ĐẠT |

Chèn và (thay + xóa) theo lượt, nhóm `wb`:

| Model | Nhóm | Chèn: mặc định / sàn 512 / fullctx | Thay + xóa: mặc định / sàn 512 / fullctx |
|---|---|---|---|
| turbo | en-wb | 22 / 7 / 10 | 106 / 105 / 103 |
| turbo | vi-wb | 53 / 21 / 17 | 177 / 174 / 164 |
| turbo | zh-wb | 42 / 28 / 18 | 172 / 172 / 162 |
| turbo | ja-wb | 32 / 32 / 17 | 125 / 125 / 134 |
| turbo | ko-wb | 93 / 93 / 9 | 159 / 161 / 166 |
| small | en-wb | 13 / 12 / 16 | 123 / 124 / 126 |
| small | vi-wb | 35 / 36 / 37 | 467 / 469 / 468 |
| small | zh-wb | 52 / 24 / 23 | 324 / 321 / 320 |
| small | ja-wb | 59 / 59 / 63 | 400 / 400 / 419 |
| small | ko-wb | 30 / 31 / 11 | 306 / 305 / 280 |

Đề xuất (chủ dự án duyệt):
- Giả định 8 không đạt như đang viết. Hai hướng: (a) giữ giả định và sửa cấu hình cho tới khi đạt (mức sàn 512, xử lý chép lặp ở mục "Clip chép câu hai lần", và có thể cần thêm đệm cho đoạn dài; rồi đo lại), hoặc (b) nới giả định, ví dụ tính trên cả năm ngôn ngữ thay vì từng ô (gộp: turbo mặc định so với fullctx +22,6%, sàn 512 +14,8%; small +2,6%), vì từng ô với 70–102 câu không đủ chắc để phân xử ngưỡng 10%.
- Không dùng fullctx làm mặc định cho gói Chuẩn (vượt ngân sách độ trễ).

## Mức sàn `audio_ctx` 512 so với công thức

Sàn chỉ đổi `audio_ctx` ở các đoạn ngắn hơn 8,96 giây: 185 trong 437 clip `wb` (42%), có `audio_ctx` công thức từ 229 đến 511 (trung vị 428). Ở 252 clip còn lại `audio_ctx` không đổi và văn bản giống hệt từng ký tự giữa hai lượt (0 clip đổi, cả turbo lẫn small), nên phép so sánh sạch.

- Chênh WER/CER theo ngôn ngữ và model (bảng ngay dưới): turbo en −12,5%, vi −15,2%, zh −6,5%, ja 0, ko +0,8% (+2 lỗi); tổng 5 ngôn ngữ −6,4% (981 → 918 lỗi trên 15511). Small en 0, vi +0,6% (+3 lỗi), zh −8,2%, ja 0, ko 0; tổng −1,5% (1809 → 1781). Khoảng tin cậy loại được 0 ở turbo en, turbo vi và small zh (đều giảm lỗi). Không ô nào xấu đi đáng kể.
- ASR p50 tăng bao nhiêu: toàn nhóm `wb`, so với lượt `lock` (cùng phiên, cùng khối lượng việc, chạy liền ngay trước): turbo +2,1% (334 → 341 ms), small −4,0% (147 → 141 ms, cỡ nhiễu). Chi phí dồn vào đoạn ngắn: turbo +49% (+88 ms) ở đoạn dưới 5 giây, +22% (+51 ms) ở 5–7 giây, +4% (+11 ms) ở 7–9 giây, 0 từ 9 giây; small chỉ +21% (+15 ms) ở đoạn dưới 5 giây, còn lại trong ±3%.
- Đề xuất cho §6.4: **thêm mức sàn** `audio_ctx = max(min(1500, 50 × số giây + 64), 512)`, chủ dự án duyệt. Lý do: giảm lỗi ở cả hai model, không xấu đi đáng kể ở ô nào, chi phí p50 nhỏ ở bộ clip này. Nếu thêm thì S6 (kế hoạch 06) đo với mức sàn đó, đặc biệt ở đoạn ngắn hơn 5 giây, nơi turbo tốn thêm khoảng 90 ms.

| Model | Nhóm | Chỉ số | Công thức (lỗi / ref) | Sàn 512 (lỗi / ref) | 512 so với công thức | 95% (bootstrap) | Clip bị sàn đổi ctx | Clip đổi văn bản | Lỗi trên clip bị đổi ctx: công thức → 512 |
|---|---|---|---|---|---|---|---|---|---|
| turbo | en-wb | WER | 128 / 2066 = 0,062 | 112 / 2066 = 0,054 | −12,5% | [−26,2%; −0,9%] | 56 / 102 | 9 | 66 → 50 |
| turbo | vi-wb | WER | 230 / 2240 = 0,103 | 195 / 2240 = 0,087 | −15,2% | [−30,6%; −0,5%] | 23 / 79 | 7 | 75 → 40 |
| turbo | zh-wb | CER | 214 / 3599 = 0,059 | 200 / 3599 = 0,056 | −6,5% | [−19,2%; +1,6%] | 64 / 102 | 23 | 89 → 75 |
| turbo | ja-wb | CER | 157 / 3509 = 0,045 | 157 / 3509 = 0,045 | +0,0% | [+0,0%; +0,0%] | 13 / 70 | 2 | 5 → 5 |
| turbo | ko-wb | CER | 252 / 4097 = 0,062 | 254 / 4097 = 0,062 | +0,8% | [+0,0%; +2,5%] | 29 / 84 | 5 | 34 → 36 |
| turbo | cả 5 ngôn ngữ | | 981 / 15511 = 0,063 | 918 / 15511 = 0,059 | −6,4% | | 185 / 437 | | 269 → 206 |
| small | en-wb | WER | 136 / 2066 = 0,066 | 136 / 2066 = 0,066 | +0,0% | [−4,1%; +3,3%] | 56 / 102 | 4 | 62 → 62 |
| small | vi-wb | WER | 502 / 2240 = 0,224 | 505 / 2240 = 0,225 | +0,6% | [−0,2%; +1,8%] | 23 / 79 | 5 | 105 → 108 |
| small | zh-wb | CER | 376 / 3599 = 0,104 | 345 / 3599 = 0,096 | −8,2% | [−18,4%; −0,3%] | 64 / 102 | 14 | 184 → 153 |
| small | ja-wb | CER | 459 / 3509 = 0,131 | 459 / 3509 = 0,131 | +0,0% | [+0,0%; +0,0%] | 13 / 70 | 0 | 27 → 27 |
| small | ko-wb | CER | 336 / 4097 = 0,082 | 336 / 4097 = 0,082 | +0,0% | [+0,0%; +0,0%] | 29 / 84 | 1 | 76 → 76 |
| small | cả 5 ngôn ngữ | | 1809 / 15511 = 0,117 | 1781 / 15511 = 0,115 | −1,5% | | 185 / 437 | | 454 → 426 |

- Sàn sửa các clip chép thừa ở đoạn ngắn: turbo `vi-1658250308905379666` 22 → 5 lỗi (60 → 30 token), `vi-12887163887499710126` 18 → 3, `en-8259791173436815888` 18 → 7, `zh-16107758687422588857` 12 → 0; small `zh-552168923751802251` 18 → 4 (38 → 21 token), `zh-7434894266661195533` 16 → 2 (26 → 13 token).
- Tác dụng phụ lên bộ lọc `no_speech_prob > 0,6` (§6.4) ở small: sàn 512 đẩy `no_speech_prob` của một clip băng hẹp, `en-9810650684898829002_nb` (3,6 giây), từ 0,378 lên 0,613, nên clip này bị lọc (cột `no_speech > 0,6` của `small-minctx512` ở nhóm `en-nb` là 4%). Bản chép của clip này là ảo giác ở mọi cấu hình, nên không có clip đúng nào bị lọc nhầm. Turbo vẫn ≈ 0 ở mọi lượt.
- Sàn không sửa được mọi ca và có thể đẩy ca khác sang: small `zh-17449495458038572773_nb` chép một bản ở lượt mặc định nhưng chép hai bản (96 token, 42 lỗi) khi `audio_ctx` = 512. Clip ko dài 13,7 giây của turbo (`audio_ctx` 751) không đổi.

Thời gian theo độ dài đoạn (p50 của `asr_ms`; công thức = lượt `lock`, cùng phiên với lượt sàn 512, không dùng lượt mặc định của Task 10 vì turbo ở Task 11 chạy chậm hơn khoảng 24% cho cùng việc, xem mục điều kiện đo):

| Model | Độ dài đoạn (s) | Số clip wb | ctx công thức (trung vị) | ASR p50: công thức (lượt `lock`, cùng phiên) | ASR p50: sàn 512 | Chênh |
|---|---|---|---|---|---|---|
| turbo | 0–5 | 24 | 271 | 179 ms | 268 ms | +49,3% (+88 ms) |
| turbo | 5–7 | 60 | 373 | 228 ms | 278 ms | +22,2% (+51 ms) |
| turbo | 7–9 | 102 | 466 | 281 ms | 291 ms | +3,8% (+11 ms) |
| turbo | 9–12 | 122 | 570 | 354 ms | 353 ms | −0,1% (−0 ms) |
| turbo | từ 12 | 129 | 796 | 523 ms | 508 ms | −2,9% (−15 ms) |
| turbo | mọi clip wb | 437 | | 334 ms | 341 ms | +2,1% (+7 ms) |
| small | 0–5 | 24 | 271 | 71 ms | 85 ms | +20,5% (+15 ms) |
| small | 5–7 | 60 | 373 | 97 ms | 97 ms | −0,1% (−0 ms) |
| small | 7–9 | 102 | 466 | 119 ms | 117 ms | −2,1% (−3 ms) |
| small | 9–12 | 122 | 570 | 153 ms | 154 ms | +0,5% (+1 ms) |
| small | từ 12 | 129 | 796 | 224 ms | 218 ms | −2,7% (−6 ms) |
| small | mọi clip wb | 437 | | 147 ms | 141 ms | −4,0% (−6 ms) |

- Trong 185 clip bị đổi `audio_ctx`, mỗi clip turbo chậm hơn trung vị 33 ms (tỉ số 1,13), small 2 ms (1,02); 252 clip không đổi thì chênh trung vị không quá 2 ms (đối chứng nhiễu).
- FLEURS có ít đoạn ngắn: ngắn nhất 3,3 giây, chỉ 24/437 clip dưới 5 giây. Đoạn do VAD cắt thường ngắn hơn, nên tác động lên p50 và p90 của app còn phải xem ở S6. Với sàn, mọi đoạn dưới 9 giây tốn gần bằng một đoạn 9 giây (turbo khoảng 270–290 ms).
- Hướng thử tiếp (rẻ, `--min-ctx` đã có): quét sàn cao hơn (768, 1024) trên zh và ko để xem khoảng cách tới fullctx có khép lại không. Khoảng cách còn lại tới fullctx nằm ở các clip dài hơn 9 giây, mà sàn không đổi (mục Giả định 8), nên có thể cần thêm đệm lớn hơn 64 khung trong chính công thức; việc này cần thêm cờ, ngoài phạm vi kế hoạch.

## Clip chép câu hai lần

`long_hyp` và `_capped` không thấy trường hợp này: model chép cả câu hai lần rồi mới dừng, số chèn chỉ bằng hoặc dưới độ dài ref. Bộ cắt vòng lặp của chế độ B cũng không bắt, vì cần 3 bản liên tiếp (mẫu 9–64 token); mẫu dài hơn 64 token thì không bắt dù bao nhiêu bản. Phát hiện riêng: chia bản chép (sau chuẩn hóa) thành hai nửa ở khoảng giữa, nếu hai nửa giống nhau từ 85%, bản chép dài hơn ref ít nhất 1,5 lần và mỗi nửa có ít nhất 8 từ hay ký tự thì coi là chép hai lần.

| Lượt | Clip chép hai lần (lỗi → lỗi nếu chỉ giữ bản đầu) |
|---|---|
| turbo mặc định | băng rộng: `ko-13932034022230918300` (76 → 6, 140 token), `vi-1658250308905379666` (22 → 5), `vi-12887163887499710126` (18 → 3); băng hẹp: `vi-12090846728876801190_nb` (18 → 2), `vi-12887163887499710126_nb` (17 → 2), `en-10146705666908229607_nb` (8 → 0) |
| turbo sàn 512 | `ko-13932034022230918300` (76 → 6); `audio_ctx` của clip này là 751, sàn không đụng tới |
| turbo fullctx | không có |
| small mặc định | `zh-552168923751802251` (18 → 8; hai bản giống 88%), `zh-7434894266661195533` (16 → 2) |
| small sàn 512 | `zh-17449495458038572773_nb` (42 → 7, 96 token; ở lượt mặc định clip này chép một bản) |
| small fullctx | không có |

- Ảnh hưởng lên số đo: turbo vi 230 → 198 lỗi, turbo ko 252 → 182, small zh 376 → 352 nếu chỉ giữ bản đầu.
- fullctx không có clip nào chép hai lần ở cả hai model, sàn 512 sửa hầu hết, nên đây là hiện tượng của cửa sổ rút ngắn, không phải của clip hay model. Cả 8 clip của lượt mặc định (6 turbo, 2 small) cũng bị lặp ở chế độ A (Task 10), nơi không có bộ cắt nên chạy tới 220 token, nên đây không phải lỗi riêng của chế độ B.
- Đề xuất (chủ dự án duyệt): (a) bộ lọc câu lặp của §6.4 (chưa cài ở Giai đoạn 0) phải bắt được bản chép hai lần; 8 clip trên là ca thử; hoặc (b) hạ ngưỡng `cut_loop` xuống 2 bản cho mẫu dài (ví dụ từ 16 token) và nâng `MAX_LOOP_PERIOD`. Cả hai cần thử với lời nói có lặp thật (người nói nhắc lại nguyên câu dài) để kiểm lọc nhầm. Sau đó đo lại mốc A4.

## Khóa ngôn ngữ so với tự nhận diện

- Chênh WER/CER do nhận diện sai ngôn ngữ: **bằng 0** ở cả hai model và mọi ngôn ngữ. Khóa ngôn ngữ không đổi chữ nào ở cả 548 clip (0 clip khác văn bản, kể cả văn bản thô), vì tự nhận diện của chế độ B đã đúng 548/548 clip (`lang_prob` nhỏ nhất: turbo 0,990; small 0,936 ở `en-15483908465225335228`). Hai lượt `lock` đạt Expected: "Nhận đúng ngôn ngữ" 100% ở mọi dòng, LID p50 bằng 0.
- Lợi ích duy nhất của khóa là bỏ bước nhận diện: LID p50 1,7 ms (turbo) và 2,7 ms (small) xuống 0, tức LID/ASR từ 1–2% về 0%.
- Nghĩa là số ja, zh, vi ở B không chứa lỗi nhận diện. Lỗi nhận diện ngôn ngữ chỉ có ở chế độ A (nhận sai 7,3–7,5% số clip, ja 23–26%: `s3_ab.md`).
- Giới hạn: FLEURS là câu đọc dài 3–28 giây, nên nhận diện trên cả đoạn dễ. Đoạn do VAD cắt ngắn hơn và nhiễu hơn có thể nhận sai nhiều hơn; đo ở S6.
- Đề xuất (chủ dự án duyệt): giữ tự nhận diện làm mặc định ở chế độ B (đúng 100% trên bộ clip này); khóa ngôn ngữ chỉ là tùy chọn tiết kiệm vài mili giây và phòng nhận sai ở đoạn ngắn hay nhiễu (chưa đo).

| Model | Nhóm | Chỉ số | Tự nhận diện | Khóa ngôn ngữ | Clip khác văn bản | Nhận đúng (tự nhận diện) | lang_prob nhỏ nhất | LID p50 (ms): tự nhận diện → khóa |
|---|---|---|---|---|---|---|---|---|
| turbo | en-wb | WER | 0,062 | 0,062 | 0 / 128 | 100,0% | 0,999 | 1,7 → 0,0 |
| turbo | vi-wb | WER | 0,103 | 0,103 | 0 / 99 | 100,0% | 0,996 | 1,7 → 0,0 |
| turbo | zh-wb | CER | 0,059 | 0,059 | 0 / 128 | 100,0% | 0,995 | 1,6 → 0,0 |
| turbo | ja-wb | CER | 0,045 | 0,045 | 0 / 88 | 100,0% | 0,990 | 1,7 → 0,0 |
| turbo | ko-wb | CER | 0,062 | 0,062 | 0 / 105 | 100,0% | 0,997 | 1,7 → 0,0 |
| small | en-wb | WER | 0,066 | 0,066 | 0 / 128 | 100,0% | 0,936 | 2,7 → 0,0 |
| small | vi-wb | WER | 0,224 | 0,224 | 0 / 99 | 100,0% | 0,980 | 2,7 → 0,0 |
| small | zh-wb | CER | 0,104 | 0,104 | 0 / 128 | 100,0% | 0,971 | 2,7 → 0,0 |
| small | ja-wb | CER | 0,131 | 0,131 | 0 / 88 | 100,0% | 0,970 | 2,8 → 0,0 |
| small | ko-wb | CER | 0,082 | 0,082 | 0 / 105 | 100,0% | 0,956 | 2,7 → 0,0 |

## Turbo so với small

| Ngôn ngữ | Chỉ số | turbo | small | small so với turbo | small − turbo | turbo bỏ bản lặp hai lần | small bỏ bản lặp hai lần | small so với turbo khi đó | ASR p50: turbo / small (ms, phiên 1) | small/turbo |
|---|---|---|---|---|---|---|---|---|---|---|
| en | WER | 0,062 | 0,066 | +6,2% | 0,004 | 0,062 | 0,066 | +6,2% | 227 / 108 | 0,47 |
| vi | WER | 0,103 | 0,224 | +118,3% | 0,121 | 0,088 | 0,224 | +153,5% | 317 / 191 | 0,60 |
| zh | CER | 0,059 | 0,104 | +75,7% | 0,045 | 0,059 | 0,098 | +64,5% | 243 / 146 | 0,60 |
| ja | CER | 0,045 | 0,131 | +192,4% | 0,086 | 0,045 | 0,131 | +192,4% | 342 / 177 | 0,52 |
| ko | CER | 0,062 | 0,082 | +33,3% | 0,021 | 0,044 | 0,082 | +84,6% | 302 / 166 | 0,55 |

- Small kém rõ rệt ở vi (WER 0,224, gấp 2,2 lần turbo; gấp 2,5 lần nếu bỏ bản lặp hai lần), ja (CER 0,131, gấp 2,9 lần) và zh (0,104, gấp 1,8 lần). Ko kém vừa (+33%). En gần ngang (0,066 so với 0,062, +6% tương đối, 8 từ trên 2066).
- Có cần ghi chú cho gói Nhẹ: **có, đề xuất** ghi chú chất lượng. Gói Nhẹ chép sai khoảng 1 từ trong 4–5 từ tiếng Việt (WER 22%), 13% ký tự tiếng Nhật, 10% tiếng Trung; tiếng Anh và tiếng Hàn chấp nhận được (WER 6,6%, CER 8,2%). Nên khuyến nghị gói Chuẩn cho người dùng chính là tiếng Việt, Nhật, Trung.
- Tốc độ: ASR p50 của small bằng 0,47–0,60 lần turbo (phiên 1; turbo 227–342 ms, small 108–191 ms).

## Điều kiện đo

Sáu lượt của Task 11 chạy tuần tự trên máy không có việc nặng khác (không build, không hai lượt chồng nhau; `caffeinate -i` giữ máy không ngủ; cắm điện, macOS không ghi cảnh báo nhiệt hay hiệu năng; RAM trống 79–80%). Bốn lượt của Task 10: xem `s3_ab.md`.

| Lượt | Thời gian chạy | load 1 phút trước → sau | dải load (mẫu mỗi 15 s) |
|---|---|---|---|
| m4pro-small-fullctx | 140 s | 2,06 → 1,72 | 1,63 – 2,32 |
| m4pro-small-lock | 90 s | 1,72 → 2,38 | 1,55 – 2,46 |
| m4pro-small-minctx512 | 91 s | 2,38 → 1,42 | 1,46 – 2,45 |
| m4pro-turbo-fullctx | 485 s | 1,42 → 1,97 | 1,04 – 2,22 |
| m4pro-turbo-lock | 204 s | 1,97 → 2,12 | 1,68 – 2,31 |
| m4pro-turbo-minctx512 | 215 s | 2,12 → 1,37 | 1,39 – 2,12 |

- Load yên và phẳng (1,0–2,5) suốt sáu lượt, nhưng thời gian của turbo vẫn lệch theo phiên: cho cùng khối lượng việc, turbo ở Task 11 (lượt `lock`) chậm hơn lượt mặc định của Task 10 khoảng 24% (tỉ số ASR theo từng clip: trung vị 1,24, p10–p90 1,19–1,33; đều khắp lượt, không theo thời điểm), còn small gần như không đổi (1,02). Nguyên nhân không xác định được; tải trung bình không cho thấy, nghi do trạng thái xung nhịp hay nhiệt sau lượt `fullctx` dài. Hệ quả:
  - Chỉ so thời gian giữa các lượt liền nhau cùng phiên (đã dùng lượt `lock` làm mốc thời gian cho sàn 512 và fullctx, cộng thêm đối chứng nội bộ là nhóm clip không đổi `audio_ctx`).
  - Mili giây tuyệt đối của turbo (Task 10: p50 227–342 ms; Task 11 `lock`: 286–453 ms) là khoảng, không phải một số; S6 phải đo lại trong điều kiện có kiểm soát.
- Văn bản thì tái lập hoàn toàn: lượt `lock` khớp lượt mặc định từng ký tự ở cả 548 clip, và ở lượt sàn 512 các clip không đổi `audio_ctx` cũng khớp từng ký tự, nên chênh WER/CER trong file này không chứa nhiễu giữa các lần chạy.

## Bảng đầy đủ

Nguyên nội dung `bench/phase0/data/asr/a4_table.md` (160 dòng = 8 lượt × 20 nhóm; lệnh ở Task 11, Step 1):

| Kết quả | Chế độ | Nhóm | Số clip | WER/CER | capped | long_hyp | Nhận đúng ngôn ngữ | lid_fallback | LID p50 (ms) | ASR p50 (ms) | LID/ASR | IPC p50/max (ms) | no_speech > 0,6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
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
| m4pro-small-fullctx | shared | en | 128 | WER 0.085 | 0.084 | 0 | 100% | 0 | 3 | 202 | 1% | 0.4/1.1 | 1% |
| m4pro-small-fullctx | shared | en-nb | 26 | WER 0.152 | 0.148 | 0 | 100% | 0 | 3 | 199 | 2% | 0.4/0.9 | 4% |
| m4pro-small-fullctx | shared | en-wb | 102 | WER 0.069 | 0.069 | 0 | 100% | 0 | 3 | 203 | 1% | 0.4/1.1 | 0% |
| m4pro-small-fullctx | shared | en-wbp | 26 | WER 0.084 | 0.084 | 0 | 100% | 0 | 3 | 196 | 2% | 0.4/0.8 | 0% |
| m4pro-small-fullctx | shared | ja | 88 | CER 0.144 | 0.144 | 0 | 100% | 0 | 3 | 271 | 1% | 0.8/1.5 | 0% |
| m4pro-small-fullctx | shared | ja-nb | 18 | CER 0.172 | 0.172 | 0 | 100% | 0 | 3 | 289 | 1% | 0.8/1.2 | 0% |
| m4pro-small-fullctx | shared | ja-wb | 70 | CER 0.137 | 0.137 | 0 | 100% | 0 | 3 | 263 | 1% | 0.8/1.5 | 0% |
| m4pro-small-fullctx | shared | ja-wbp | 18 | CER 0.136 | 0.136 | 0 | 100% | 0 | 3 | 281 | 1% | 0.8/1.4 | 0% |
| m4pro-small-fullctx | shared | ko | 105 | CER 0.074 | 0.074 | 0 | 100% | 0 | 3 | 260 | 1% | 0.6/1.3 | 0% |
| m4pro-small-fullctx | shared | ko-nb | 21 | CER 0.084 | 0.084 | 0 | 100% | 0 | 3 | 261 | 1% | 0.5/1.1 | 0% |
| m4pro-small-fullctx | shared | ko-wb | 84 | CER 0.071 | 0.071 | 0 | 100% | 0 | 3 | 259 | 1% | 0.6/1.3 | 0% |
| m4pro-small-fullctx | shared | ko-wbp | 21 | CER 0.065 | 0.065 | 0 | 100% | 0 | 3 | 266 | 1% | 0.6/1.0 | 0% |
| m4pro-small-fullctx | shared | vi | 99 | WER 0.223 | 0.223 | 0 | 100% | 0 | 3 | 272 | 1% | 0.6/1.7 | 0% |
| m4pro-small-fullctx | shared | vi-nb | 20 | WER 0.214 | 0.214 | 0 | 100% | 0 | 3 | 257 | 1% | 0.6/0.9 | 0% |
| m4pro-small-fullctx | shared | vi-wb | 79 | WER 0.225 | 0.225 | 0 | 100% | 0 | 3 | 274 | 1% | 0.6/1.7 | 0% |
| m4pro-small-fullctx | shared | vi-wbp | 20 | WER 0.193 | 0.193 | 0 | 100% | 0 | 3 | 255 | 1% | 0.6/1.0 | 0% |
| m4pro-small-fullctx | shared | zh | 128 | CER 0.104 | 0.104 | 0 | 100% | 0 | 3 | 242 | 1% | 0.5/1.4 | 0% |
| m4pro-small-fullctx | shared | zh-nb | 26 | CER 0.137 | 0.137 | 0 | 100% | 0 | 3 | 235 | 1% | 0.5/1.4 | 0% |
| m4pro-small-fullctx | shared | zh-wb | 102 | CER 0.095 | 0.095 | 0 | 100% | 0 | 3 | 243 | 1% | 0.5/1.3 | 0% |
| m4pro-small-fullctx | shared | zh-wbp | 26 | CER 0.121 | 0.121 | 0 | 100% | 0 | 3 | 237 | 1% | 0.5/1.3 | 0% |
| m4pro-small-lock | shared | en | 128 | WER 0.083 | 0.082 | 0 | 100% | 0 | 0 | 106 | 0% | 0.4/1.6 | 0% |
| m4pro-small-lock | shared | en-nb | 26 | WER 0.158 | 0.152 | 0 | 100% | 0 | 0 | 103 | 0% | 0.4/0.9 | 0% |
| m4pro-small-lock | shared | en-wb | 102 | WER 0.066 | 0.066 | 0 | 100% | 0 | 0 | 107 | 0% | 0.4/1.6 | 0% |
| m4pro-small-lock | shared | en-wbp | 26 | WER 0.088 | 0.088 | 0 | 100% | 0 | 0 | 108 | 0% | 0.4/0.9 | 0% |
| m4pro-small-lock | shared | ja | 88 | CER 0.142 | 0.142 | 0 | 100% | 0 | 0 | 192 | 0% | 0.8/1.7 | 0% |
| m4pro-small-lock | shared | ja-nb | 18 | CER 0.186 | 0.186 | 0 | 100% | 0 | 0 | 206 | 0% | 0.8/1.3 | 0% |
| m4pro-small-lock | shared | ja-wb | 70 | CER 0.131 | 0.131 | 0 | 100% | 0 | 0 | 180 | 0% | 0.8/1.7 | 0% |
| m4pro-small-lock | shared | ja-wbp | 18 | CER 0.132 | 0.132 | 0 | 100% | 0 | 0 | 196 | 0% | 0.8/1.4 | 0% |
| m4pro-small-lock | shared | ko | 105 | CER 0.084 | 0.084 | 0 | 100% | 0 | 0 | 167 | 0% | 0.5/1.5 | 0% |
| m4pro-small-lock | shared | ko-nb | 21 | CER 0.090 | 0.090 | 0 | 100% | 0 | 0 | 167 | 0% | 0.5/0.9 | 0% |
| m4pro-small-lock | shared | ko-wb | 84 | CER 0.082 | 0.082 | 0 | 100% | 0 | 0 | 167 | 0% | 0.6/1.5 | 0% |
| m4pro-small-lock | shared | ko-wbp | 21 | CER 0.097 | 0.097 | 0 | 100% | 0 | 0 | 169 | 0% | 0.5/1.0 | 0% |
| m4pro-small-lock | shared | vi | 99 | WER 0.225 | 0.225 | 0 | 100% | 0 | 0 | 181 | 0% | 0.6/1.7 | 0% |
| m4pro-small-lock | shared | vi-nb | 20 | WER 0.228 | 0.228 | 0 | 100% | 0 | 0 | 166 | 0% | 0.6/0.9 | 0% |
| m4pro-small-lock | shared | vi-wb | 79 | WER 0.224 | 0.224 | 0 | 100% | 0 | 0 | 187 | 0% | 0.7/1.7 | 0% |
| m4pro-small-lock | shared | vi-wbp | 20 | WER 0.198 | 0.198 | 0 | 100% | 0 | 0 | 164 | 0% | 0.6/1.0 | 0% |
| m4pro-small-lock | shared | zh | 128 | CER 0.111 | 0.110 | 0 | 100% | 0 | 0 | 149 | 0% | 0.5/1.4 | 0% |
| m4pro-small-lock | shared | zh-nb | 26 | CER 0.135 | 0.135 | 0 | 100% | 0 | 0 | 160 | 0% | 0.5/1.3 | 0% |
| m4pro-small-lock | shared | zh-wb | 102 | CER 0.104 | 0.104 | 0 | 100% | 0 | 0 | 147 | 0% | 0.5/1.4 | 0% |
| m4pro-small-lock | shared | zh-wbp | 26 | CER 0.120 | 0.120 | 0 | 100% | 0 | 0 | 151 | 0% | 0.5/1.4 | 0% |
| m4pro-small-minctx512 | shared | en | 128 | WER 0.082 | 0.081 | 0 | 100% | 0 | 3 | 106 | 3% | 0.4/1.1 | 1% |
| m4pro-small-minctx512 | shared | en-nb | 26 | WER 0.148 | 0.144 | 0 | 100% | 0 | 3 | 104 | 3% | 0.4/0.9 | 4% |
| m4pro-small-minctx512 | shared | en-wb | 102 | WER 0.066 | 0.066 | 0 | 100% | 0 | 3 | 106 | 3% | 0.4/1.1 | 0% |
| m4pro-small-minctx512 | shared | en-wbp | 26 | WER 0.088 | 0.088 | 0 | 100% | 0 | 3 | 98 | 3% | 0.4/0.9 | 0% |
| m4pro-small-minctx512 | shared | ja | 88 | CER 0.142 | 0.142 | 0 | 100% | 0 | 3 | 185 | 1% | 0.8/1.5 | 0% |
| m4pro-small-minctx512 | shared | ja-nb | 18 | CER 0.186 | 0.186 | 0 | 100% | 0 | 3 | 205 | 1% | 0.8/1.3 | 0% |
| m4pro-small-minctx512 | shared | ja-wb | 70 | CER 0.131 | 0.131 | 0 | 100% | 0 | 3 | 177 | 2% | 0.8/1.5 | 0% |
| m4pro-small-minctx512 | shared | ja-wbp | 18 | CER 0.132 | 0.132 | 0 | 100% | 0 | 3 | 200 | 1% | 0.8/1.4 | 0% |
| m4pro-small-minctx512 | shared | ko | 105 | CER 0.083 | 0.083 | 0 | 100% | 0 | 3 | 166 | 2% | 0.5/1.3 | 0% |
| m4pro-small-minctx512 | shared | ko-nb | 21 | CER 0.087 | 0.087 | 0 | 100% | 0 | 3 | 167 | 2% | 0.5/0.9 | 0% |
| m4pro-small-minctx512 | shared | ko-wb | 84 | CER 0.082 | 0.082 | 0 | 100% | 0 | 3 | 165 | 2% | 0.6/1.3 | 0% |
| m4pro-small-minctx512 | shared | ko-wbp | 21 | CER 0.097 | 0.097 | 0 | 100% | 0 | 3 | 166 | 2% | 0.6/1.0 | 0% |
| m4pro-small-minctx512 | shared | vi | 99 | WER 0.226 | 0.226 | 0 | 100% | 0 | 3 | 178 | 2% | 0.6/1.8 | 0% |
| m4pro-small-minctx512 | shared | vi-nb | 20 | WER 0.230 | 0.230 | 0 | 100% | 0 | 3 | 165 | 2% | 0.6/0.9 | 0% |
| m4pro-small-minctx512 | shared | vi-wb | 79 | WER 0.225 | 0.225 | 0 | 100% | 0 | 3 | 188 | 1% | 0.6/1.8 | 0% |
| m4pro-small-minctx512 | shared | vi-wbp | 20 | WER 0.196 | 0.196 | 0 | 100% | 0 | 3 | 168 | 2% | 0.6/1.1 | 0% |
| m4pro-small-minctx512 | shared | zh | 128 | CER 0.111 | 0.110 | 0 | 100% | 0 | 3 | 135 | 2% | 0.5/1.4 | 0% |
| m4pro-small-minctx512 | shared | zh-nb | 26 | CER 0.173 | 0.165 | 0 | 100% | 0 | 3 | 132 | 2% | 0.5/1.3 | 0% |
| m4pro-small-minctx512 | shared | zh-wb | 102 | CER 0.096 | 0.096 | 0 | 100% | 0 | 3 | 135 | 2% | 0.5/1.4 | 0% |
| m4pro-small-minctx512 | shared | zh-wbp | 26 | CER 0.120 | 0.120 | 0 | 100% | 0 | 3 | 133 | 2% | 0.5/1.4 | 0% |
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
| m4pro-turbo-fullctx | shared | en | 128 | WER 0.063 | 0.063 | 0 | 100% | 0 | 2 | 672 | 0% | 0.4/1.3 | 0% |
| m4pro-turbo-fullctx | shared | en-nb | 26 | WER 0.099 | 0.099 | 0 | 100% | 0 | 2 | 672 | 0% | 0.4/0.9 | 0% |
| m4pro-turbo-fullctx | shared | en-wb | 102 | WER 0.055 | 0.055 | 0 | 100% | 0 | 2 | 673 | 0% | 0.4/1.3 | 0% |
| m4pro-turbo-fullctx | shared | en-wbp | 26 | WER 0.068 | 0.068 | 0 | 100% | 0 | 2 | 671 | 0% | 0.4/0.9 | 0% |
| m4pro-turbo-fullctx | shared | ja | 88 | CER 0.046 | 0.046 | 0 | 100% | 0 | 2 | 887 | 0% | 0.8/1.5 | 0% |
| m4pro-turbo-fullctx | shared | ja-nb | 18 | CER 0.058 | 0.058 | 0 | 100% | 0 | 2 | 883 | 0% | 0.8/1.3 | 0% |
| m4pro-turbo-fullctx | shared | ja-wb | 70 | CER 0.043 | 0.043 | 0 | 100% | 0 | 2 | 887 | 0% | 0.8/1.5 | 0% |
| m4pro-turbo-fullctx | shared | ja-wbp | 18 | CER 0.045 | 0.045 | 0 | 100% | 0 | 2 | 890 | 0% | 0.9/1.4 | 0% |
| m4pro-turbo-fullctx | shared | ko | 105 | CER 0.043 | 0.043 | 0 | 100% | 0 | 2 | 916 | 0% | 0.6/1.3 | 0% |
| m4pro-turbo-fullctx | shared | ko-nb | 21 | CER 0.042 | 0.042 | 0 | 100% | 0 | 2 | 917 | 0% | 0.5/0.9 | 0% |
| m4pro-turbo-fullctx | shared | ko-wb | 84 | CER 0.043 | 0.043 | 0 | 100% | 0 | 2 | 915 | 0% | 0.6/1.3 | 0% |
| m4pro-turbo-fullctx | shared | ko-wbp | 21 | CER 0.034 | 0.034 | 0 | 100% | 0 | 2 | 911 | 0% | 0.6/1.0 | 0% |
| m4pro-turbo-fullctx | shared | vi | 99 | WER 0.078 | 0.078 | 0 | 100% | 0 | 2 | 990 | 0% | 0.7/1.8 | 0% |
| m4pro-turbo-fullctx | shared | vi-nb | 20 | WER 0.065 | 0.065 | 0 | 100% | 0 | 3 | 1132 | 0% | 0.6/0.9 | 0% |
| m4pro-turbo-fullctx | shared | vi-wb | 79 | WER 0.081 | 0.081 | 0 | 100% | 0 | 2 | 938 | 0% | 0.7/1.8 | 0% |
| m4pro-turbo-fullctx | shared | vi-wbp | 20 | WER 0.059 | 0.059 | 0 | 100% | 0 | 2 | 885 | 0% | 0.6/1.0 | 0% |
| m4pro-turbo-fullctx | shared | zh | 128 | CER 0.056 | 0.056 | 0 | 100% | 0 | 2 | 896 | 0% | 0.5/1.3 | 0% |
| m4pro-turbo-fullctx | shared | zh-nb | 26 | CER 0.079 | 0.079 | 0 | 100% | 0 | 2 | 853 | 0% | 0.5/1.3 | 0% |
| m4pro-turbo-fullctx | shared | zh-wb | 102 | CER 0.050 | 0.050 | 0 | 100% | 0 | 2 | 904 | 0% | 0.5/1.3 | 0% |
| m4pro-turbo-fullctx | shared | zh-wbp | 26 | CER 0.069 | 0.069 | 0 | 100% | 0 | 2 | 930 | 0% | 0.5/1.3 | 0% |
| m4pro-turbo-lock | shared | en | 128 | WER 0.074 | 0.074 | 0 | 100% | 0 | 0 | 281 | 0% | 0.4/1.2 | 0% |
| m4pro-turbo-lock | shared | en-nb | 26 | WER 0.128 | 0.128 | 0 | 100% | 0 | 0 | 267 | 0% | 0.4/0.9 | 0% |
| m4pro-turbo-lock | shared | en-wb | 102 | WER 0.062 | 0.062 | 0 | 100% | 0 | 0 | 286 | 0% | 0.4/1.2 | 0% |
| m4pro-turbo-lock | shared | en-wbp | 26 | WER 0.076 | 0.076 | 0 | 100% | 0 | 0 | 277 | 0% | 0.4/0.9 | 0% |
| m4pro-turbo-lock | shared | ja | 88 | CER 0.046 | 0.046 | 0 | 100% | 0 | 0 | 453 | 0% | 0.8/1.6 | 0% |
| m4pro-turbo-lock | shared | ja-nb | 18 | CER 0.050 | 0.050 | 0 | 100% | 0 | 0 | 446 | 0% | 0.8/1.2 | 0% |
| m4pro-turbo-lock | shared | ja-wb | 70 | CER 0.045 | 0.045 | 0 | 100% | 0 | 0 | 453 | 0% | 0.8/1.6 | 0% |
| m4pro-turbo-lock | shared | ja-wbp | 18 | CER 0.042 | 0.042 | 0 | 100% | 0 | 0 | 443 | 0% | 0.8/1.4 | 0% |
| m4pro-turbo-lock | shared | ko | 105 | CER 0.057 | 0.057 | 0 | 100% | 0 | 0 | 375 | 0% | 0.5/1.3 | 0% |
| m4pro-turbo-lock | shared | ko-nb | 21 | CER 0.040 | 0.040 | 0 | 100% | 0 | 0 | 385 | 0% | 0.5/0.9 | 0% |
| m4pro-turbo-lock | shared | ko-wb | 84 | CER 0.062 | 0.062 | 0 | 100% | 0 | 0 | 373 | 0% | 0.6/1.3 | 0% |
| m4pro-turbo-lock | shared | ko-wbp | 21 | CER 0.105 | 0.105 | 0 | 100% | 0 | 0 | 369 | 0% | 0.6/1.1 | 0% |
| m4pro-turbo-lock | shared | vi | 99 | WER 0.109 | 0.105 | 0 | 100% | 0 | 0 | 385 | 0% | 0.6/1.8 | 0% |
| m4pro-turbo-lock | shared | vi-nb | 20 | WER 0.136 | 0.128 | 0 | 100% | 0 | 0 | 352 | 0% | 0.6/0.9 | 0% |
| m4pro-turbo-lock | shared | vi-wb | 79 | WER 0.103 | 0.100 | 0 | 100% | 0 | 0 | 395 | 0% | 0.7/1.8 | 0% |
| m4pro-turbo-lock | shared | vi-wbp | 20 | WER 0.092 | 0.086 | 0 | 100% | 0 | 0 | 347 | 0% | 0.6/1.1 | 0% |
| m4pro-turbo-lock | shared | zh | 128 | CER 0.064 | 0.064 | 0 | 100% | 0 | 0 | 296 | 0% | 0.5/1.4 | 0% |
| m4pro-turbo-lock | shared | zh-nb | 26 | CER 0.080 | 0.080 | 0 | 100% | 0 | 0 | 292 | 0% | 0.5/1.4 | 0% |
| m4pro-turbo-lock | shared | zh-wb | 102 | CER 0.059 | 0.059 | 0 | 100% | 0 | 0 | 298 | 0% | 0.5/1.4 | 0% |
| m4pro-turbo-lock | shared | zh-wbp | 26 | CER 0.074 | 0.074 | 0 | 100% | 0 | 0 | 292 | 0% | 0.5/1.4 | 0% |
| m4pro-turbo-minctx512 | shared | en | 128 | WER 0.064 | 0.064 | 0 | 100% | 0 | 2 | 294 | 1% | 0.4/1.2 | 0% |
| m4pro-turbo-minctx512 | shared | en-nb | 26 | WER 0.105 | 0.105 | 0 | 100% | 0 | 2 | 329 | 1% | 0.4/0.9 | 0% |
| m4pro-turbo-minctx512 | shared | en-wb | 102 | WER 0.054 | 0.054 | 0 | 100% | 0 | 2 | 292 | 1% | 0.4/1.2 | 0% |
| m4pro-turbo-minctx512 | shared | en-wbp | 26 | WER 0.068 | 0.068 | 0 | 100% | 0 | 2 | 280 | 1% | 0.4/0.9 | 0% |
| m4pro-turbo-minctx512 | shared | ja | 88 | CER 0.046 | 0.046 | 0 | 100% | 0 | 2 | 455 | 0% | 0.8/1.7 | 0% |
| m4pro-turbo-minctx512 | shared | ja-nb | 18 | CER 0.050 | 0.050 | 0 | 100% | 0 | 2 | 438 | 0% | 0.8/1.2 | 0% |
| m4pro-turbo-minctx512 | shared | ja-wb | 70 | CER 0.045 | 0.045 | 0 | 100% | 0 | 2 | 455 | 0% | 0.8/1.7 | 0% |
| m4pro-turbo-minctx512 | shared | ja-wbp | 18 | CER 0.042 | 0.042 | 0 | 100% | 0 | 2 | 454 | 0% | 0.9/1.4 | 0% |
| m4pro-turbo-minctx512 | shared | ko | 105 | CER 0.058 | 0.058 | 0 | 100% | 0 | 2 | 378 | 1% | 0.6/1.3 | 0% |
| m4pro-turbo-minctx512 | shared | ko-nb | 21 | CER 0.041 | 0.041 | 0 | 100% | 0 | 2 | 378 | 1% | 0.5/0.9 | 0% |
| m4pro-turbo-minctx512 | shared | ko-wb | 84 | CER 0.062 | 0.062 | 0 | 100% | 0 | 2 | 376 | 1% | 0.6/1.3 | 0% |
| m4pro-turbo-minctx512 | shared | ko-wbp | 21 | CER 0.106 | 0.106 | 0 | 100% | 0 | 2 | 378 | 1% | 0.6/1.0 | 0% |
| m4pro-turbo-minctx512 | shared | vi | 99 | WER 0.085 | 0.085 | 0 | 100% | 0 | 2 | 387 | 1% | 0.6/1.7 | 0% |
| m4pro-turbo-minctx512 | shared | vi-nb | 20 | WER 0.077 | 0.077 | 0 | 100% | 0 | 2 | 367 | 1% | 0.6/1.2 | 0% |
| m4pro-turbo-minctx512 | shared | vi-wb | 79 | WER 0.087 | 0.087 | 0 | 100% | 0 | 2 | 392 | 1% | 0.6/1.7 | 0% |
| m4pro-turbo-minctx512 | shared | vi-wbp | 20 | WER 0.063 | 0.063 | 0 | 100% | 0 | 2 | 359 | 1% | 0.6/1.1 | 0% |
| m4pro-turbo-minctx512 | shared | zh | 128 | CER 0.061 | 0.061 | 0 | 100% | 0 | 2 | 324 | 1% | 0.5/1.4 | 0% |
| m4pro-turbo-minctx512 | shared | zh-nb | 26 | CER 0.080 | 0.080 | 0 | 100% | 0 | 2 | 310 | 1% | 0.5/1.3 | 0% |
| m4pro-turbo-minctx512 | shared | zh-wb | 102 | CER 0.056 | 0.056 | 0 | 100% | 0 | 2 | 327 | 1% | 0.5/1.4 | 0% |
| m4pro-turbo-minctx512 | shared | zh-wbp | 26 | CER 0.074 | 0.074 | 0 | 100% | 0 | 2 | 304 | 1% | 0.5/1.4 | 0% |
