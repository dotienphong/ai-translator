# S7 phần dịch: quyết định

Số liệu: `s7_mt.md`, chạy ngày 2026-09-30 trên Mac M4 Pro 24 GB, llama.cpp b11146.

## Mốc A3 (lượt chạy không có ngữ cảnh)

| Chiều | Q8_0 | Q4_K_M |
|---|---|---|
| en->vi | 0,842 | 0,841 |
| zh->vi | 0,829 | 0,831 |
| ja->vi | 0,830 | 0,815 |
| ko->vi | 0,834 | 0,822 |
| vi->en | 0,821 | 0,822 |
| vi->zh | 0,836 | 0,821 |
| vi->ja | 0,847 | 0,845 |
| vi->ko | 0,851 | 0,842 |

COMET của lượt "plain" (không có ngữ cảnh); Q8_0 là gói Chuẩn, Q4_K_M là gói Nhẹ. Anh/Trung/Nhật/Hàn→Việt và Việt→Anh mỗi chiều 100 câu, Việt→Trung/Nhật/Hàn mỗi chiều 40 câu. Đây là mốc cho quy tắc chống thụt lùi của A3 (mỗi chiều không được thấp hơn mốc quá 0,01).

- Mức sàn Anh→Việt (Q8_0 ≥ 0,83; Q4_K_M ≥ 0,80): đạt cả hai, không cần xem lại D5. Q8_0 0,842, chỉ dư 0,012 so với sàn; Q4_K_M 0,841, dư 0,041.
- Trung/Nhật/Hàn→Việt thấp hơn Anh→Việt quá 0,05: không có. Mức thấp hơn Anh→Việt: Q8_0 zh 0,013, ja 0,012, ko 0,008; Q4_K_M zh 0,010, ja 0,026, ko 0,020.
- Ghi chú về bộ test: 100 câu mới của mỗi chiều Trung/Nhật/Hàn→Việt phân theo domain là social 76, literary 16, news 6, speech 2 (ba chiều giống nhau). Bộ này thiên về văn nói đời thường, ít lời phát biểu, nên chỉ là đại diện gần đúng cho lời nói trong cuộc họp. Bộ cũ Anh→Việt và Việt→Anh không có câu speech nào.

## Giả định 6: Q4_K_M giảm COMET không quá 0,02 so với Q8_0

Quy tắc: đạt nếu chênh trung bình của "Hy-MT2-1.8B-Q4_K_M-plain − Q8_0" ở chiều Anh→Việt ≥ −0,02.
- Anh→Việt: −0,000 (−0,0004) [−0,009; +0,007]. Đạt (cận dưới của khoảng tin cậy vẫn trên −0,02).
- Các chiều giảm quá 0,02: không có. Chênh lớn nhất −0,015 (ja->vi, vi->zh). Khoảng tin cậy loại 0 ở ba chiều: ja->vi −0,015 [−0,029; −0,002], ko->vi −0,012 [−0,023; −0,002], vi->zh −0,015 [−0,028; −0,003]. Năm chiều còn lại chênh từ −0,008 đến +0,003, khoảng tin cậy chứa 0.

## Cờ ngữ cảnh câu trước (§6.5)

Quy tắc: chỉ bật mặc định khi thỏa cả ba điều kiện:
- với cả Q8_0 và Q4_K_M, chênh COMET "context − plain" dương và cận dưới 95% CI > 0 ở cả bốn chiều Anh/Trung/Nhật/Hàn→Việt;
- chênh p50 thời gian ≤ +20% ở mọi chiều, đo lúc máy rảnh;
- cột "Nghi lẫn mẫu" gần 0 (bản dịch không được chứa tiêu đề mẫu hay câu ngữ cảnh).

Nếu không thì giữ là cờ thử nghiệm, mặc định tắt.
- Kết quả: giữ tắt (cờ thử nghiệm, mặc định tắt). Điều kiện 1 (COMET) và 3 (nghi lẫn mẫu) không đạt; điều kiện 2 (thời gian) không đánh giá được vì số đo lúc máy bận, nhưng kết luận không phụ thuộc vào nó.
- Số câu dài gấp đôi (dịch luôn câu ngữ cảnh): Q8_0 170, Q4_K_M 4; theo chiều ở bảng dưới.
- Số câu nghi lẫn mẫu: Q8_0 325/538, Q4_K_M 8/538; theo chiều ở bảng dưới.

"context − plain" trên 538 câu có câu liền trước trong cùng tài liệu (cùng tập câu cho hai lượt):

| Chiều | Số câu | Q8_0: chênh COMET (95% CI) | Q8_0: dài gấp đôi | Q8_0: nghi lẫn mẫu | Q4_K_M: chênh COMET (95% CI) | Q4_K_M: dài gấp đôi | Q4_K_M: nghi lẫn mẫu |
|---|---|---|---|---|---|---|---|
| en->vi | 87 | −0,170 [−0,194; −0,146] | 52 | 82 | −0,009 [−0,021; +0,001] | 0 | 0 |
| zh->vi | 85 | −0,035 [−0,059; −0,013] | 3 | 13 | +0,002 [−0,004; +0,008] | 0 | 0 |
| ja->vi | 85 | −0,170 [−0,207; −0,135] | 22 | 52 | −0,004 [−0,016; +0,006] | 0 | 0 |
| ko->vi | 85 | −0,152 [−0,187; −0,120] | 20 | 47 | −0,006 [−0,014; +0,002] | 0 | 1 |
| vi->en | 88 | −0,147 [−0,177; −0,117] | 29 | 58 | −0,017 [−0,035; −0,002] | 2 | 0 |
| vi->zh | 36 | −0,042 [−0,072; −0,018] | 1 | 1 | −0,001 [−0,011; +0,007] | 0 | 0 |
| vi->ja | 36 | −0,186 [−0,220; −0,156] | 20 | 36 | −0,071 [−0,115; −0,034] | 2 | 5 |
| vi->ko | 36 | −0,175 [−0,210; −0,145] | 23 | 36 | −0,021 [−0,053; +0,002] | 0 | 2 |
| Tổng | 538 | — | 170 | 325 | — | 4 | 8 |

1. COMET: không đạt. Q8_0 tệ hơn có ý nghĩa ở cả 8 chiều (từ −0,035 đến −0,186). Q4_K_M không chiều nào tốt hơn có ý nghĩa: trong bốn chiều Anh/Trung/Nhật/Hàn→Việt chỉ zh->vi có chênh dương (+0,002) nhưng cận dưới CI là −0,004; vi->en và vi->ja tệ hơn có ý nghĩa.
2. Thời gian: không đánh giá được. Cột thời gian trong `s7_mt.md` đo lúc máy bận (swap khoảng 11 GB, Docker), không đúng yêu cầu "đo lúc máy rảnh", nên không dùng số này. Kết luận không phụ thuộc vào điều kiện này vì điều kiện COMET đã không đạt.
3. Nghi lẫn mẫu: không đạt với Q8_0 (325/538, 60% số câu): bản dịch dính tiêu đề mẫu (mở đầu bằng `[` hoặc `【` ở 305 câu) và dịch luôn câu ngữ cảnh. Với Q4_K_M thì thấp nhưng khác 0 (8/538, dồn ở vi->ja 5/36 và vi->ko 2/36; ko->vi 1 câu chỉ thừa dấu `[` đầu câu) và còn ca lọt lưới, nên không coi là gần 0. Heuristic (xuống dòng, hoặc mở đầu bằng `[`/`【` mà câu gốc không có) bỏ sót ít nhất 2 câu dịch luôn câu ngữ cảnh mà không xuống dòng (`vi-en-183`, `vi-en-794`); tính thêm dấu hiệu "dài gấp đôi" thì Q4_K_M có ít nhất 10/538 câu đáng ngờ.

COMET không thấy câu ngữ cảnh khi chấm, nên dữ liệu này chỉ cho thấy "không có lợi, thêm rủi ro", chưa đủ để nói ngữ cảnh vô ích.

## Ngưỡng tỉ lệ token cho hậu xử lý (§6.5)

Bảng "Ngưỡng tỉ lệ token đề xuất" của `s7_mt.md`, lấy từ hai lượt chạy không có ngữ cảnh: tỉ lệ token lớn nhất đo được (token bản dịch chia token câu gốc), cộng biên 25%, làm tròn lên 0,1. Không bản dịch nào bị cắt ở 512 token.

| Chiều | Ngưỡng |
|---|---|
| en->vi | 4,4 |
| ja->vi | 3,5 |
| ko->vi | 3,5 |
| vi->en | 1,6 |
| vi->ja | 2,2 |
| vi->ko | 2,2 |
| vi->zh | 1,2 |
| zh->vi | 6,6 |

Ghi chú: zh->vi 6,6 chỉ do một câu gốc 4 token, `zh-vi-888` (大厅里寂静无声, bản dịch đúng, 21 token, tỉ lệ 5,25). Bỏ riêng câu này thì tỉ lệ lớn nhất của zh->vi là 3,50 (ngưỡng 4,4). Câu gốc rất ngắn làm tỉ lệ dao động mạnh.

Ý kiến cho §6.5 (để chủ dự án quyết, chưa sửa spec): ngưỡng chỉ theo tỉ lệ bị câu rất ngắn kéo lên; zh->vi có 26/100 câu gốc dưới 10 token. Hai cách:
1. Ngưỡng dạng `tỉ lệ × số token câu gốc + hằng số`, lấy tỉ lệ từ các câu gốc từ 10 token trở lên.
2. Chỉ áp tỉ lệ khi câu gốc từ khoảng 10 token trở lên; câu gốc ngắn hơn chỉ chịu hạn mức sinh của §6.5 (`4 × số token câu gốc + 32`, tức tối đa 68 token khi câu gốc dưới 10 token).

Số liệu hỗ trợ (tính bằng script tạm ngoài repo, từ `bench/phase0/data/mt/outputs/*-plain.jsonl`; thư mục `data/` không commit):

| Chiều | Câu gốc < 10 token | Tỉ lệ lớn nhất, mọi câu | Tỉ lệ lớn nhất, câu gốc ≥ 10 token | Ngưỡng tương ứng |
|---|---|---|---|---|
| en->vi | 13/100 | 3,45 | 3,45 | 4,4 |
| ja->vi | 6/100 | 2,79 | 2,79 | 3,5 |
| ko->vi | 6/100 | 2,79 | 2,79 | 3,5 |
| vi->en | 1/100 | 1,25 | 1,10 | 1,4 |
| vi->ja | 3/40 | 1,74 | 1,74 | 2,2 |
| vi->ko | 3/40 | 1,68 | 1,68 | 2,2 |
| vi->zh | 3/40 | 0,95 | 0,95 | 1,2 |
| zh->vi | 26/100 | 5,25 | 3,40 | 4,3 |

- Chỉ hai chiều đổi khi chỉ tính câu gốc từ 10 token trở lên: zh->vi 6,6 → 4,3 và vi->en 1,6 → 1,4. Sáu chiều còn lại giữ nguyên.
- Mốc 10 token không nhạy: tỉ lệ lớn nhất của zh->vi là 3,50 với mốc từ 5 đến 8 token, 3,44 với mốc 9, 3,40 với mốc 10 đến 15.
- Cách 1: với tỉ lệ ở cột "Ngưỡng tương ứng", hằng số nhỏ nhất để cả benchmark lọt là 3,8 token ở zh->vi (làm tròn 4, tức `4,3 × số token câu gốc + 4`); bảy chiều còn lại không cần hằng số. Hằng số này chỉ vừa đủ cho một câu (`zh-vi-888`), nên nếu chọn cách này thì cần thêm biên.
- Cách 2: hạn mức sinh `4 × số token câu gốc + 32` không cắt bản dịch nào trong 1240 bản dịch không ngữ cảnh (lớn nhất đạt 0,61 hạn mức, và 0,46 với câu gốc dưới 10 token).
- Hạn chế của cả hai: benchmark không có câu gốc dưới 3 token (ngắn nhất: ja->vi 3, zh->vi 4, en->vi 5, các chiều còn lại 7 đến 8), nên chưa kiểm được các câu ngắn hơn nữa, như lời đáp "Vâng", "OK".
