# Hiệu chỉnh nhận giọng trên âm thanh kiểu cuộc gọi (Meet/Teams)

Đo ngoại tuyến (không phát âm thanh, không đụng app nào). Câu hỏi: có tham số nào của nhận giọng (`SpeakerConfig`) giúp gán đúng
người theo DÒNG trên âm thanh kiểu Meet/Teams (nén Opus, 2–3 người, nói chồng, đoạn ngắn) mà không làm kém chỗ khác không.

## Kết luận ngắn

1. **Giữ nguyên tham số (θ = 0,35, gộp tắt) là lựa chọn an toàn; không có tham số nào cải thiện rõ.** Mọi cách chỉnh chỉ đổi
   "thiếu giọng" lấy "thừa giọng" (xem bảng θ): hạ θ thì hai người gộp một giọng, nâng θ thì một người tách nhiều giọng. Trên 144 bản
   ghi kiểu cuộc gọi, chỉnh θ tăng điểm trung bình tới +5 (θ = 0,45) nhưng giọng thừa tăng từ 17 lên 139 và bộ CV gốc giảm 9 điểm.
2. **Có đúng một cấu hình đạt luật của đề bài, ở mức biên:** `theta = 0,3625`, `min_update_ms = 0`, `merge_theta = 0,80`
   (các tham số khác như mặc định). Trên bộ kiểu cuộc gọi: mọi dòng **73,2 → 74,3 (+1,1)**, dòng ≥ 1 s 77,7 → 79,2; AMI 87,6 → 87,4
   (−0,2); CV gốc 88,0 → 91,1 (+3,1); số giọng thừa không tăng (17/8/3 → 17/8/3). Kiểm giữ lại: chọn trên lô A (8 hội thoại)
   rồi đo trên lô B (10 hội thoại khác): +0,99. Bootstrap theo hội thoại: chênh +1,07, khoảng tin cậy 95% [+0,27; +1,92]; 10 hội
   thoại tốt hơn, 6 kém hơn. **Nhưng đây là cải thiện nhỏ, cùng cơ chế "đổi một chút thiếu giọng lấy thừa giọng" (không phải sửa nhầm
   dòng), và phải bật luật gộp (đang tắt). Tôi không khuyến nghị đổi mặc định chỉ vì nó**; nếu chủ dự án vẫn muốn thì đây là cấu
   hình duy nhất để thử (tham số này nằm trong `speaker_config` của manifest, không cần phát hành app).
3. **Nhầm dòng không do tham số mà do cấu trúc**, theo thứ tự quan trọng:
   - **Hai người giống nhau bị gộp một giọng ("thiếu giọng")**: 54/144 bản ghi kiểu cuộc gọi, chiếm 2.519/3.963 dòng sai (64%);
     ở các bản ghi đó dòng đúng chỉ 55%. Cosine giữa hai tâm giọng THẬT của các cặp này là 0,5–0,63, cao hơn θ, nên không ngưỡng
     nào tách được mà không làm giọng khác vỡ. Đây là giới hạn của model nhúng (ERes2Net học trên giọng tiếng Anh) với giọng Việt.
   - **Đoạn ngắn**: dòng < 1 s đúng 64,9% (mọi bản ghi kiểu cuộc gọi); riêng dòng < 500 ms (không nhúng, lấy giọng của đoạn
     trước) đúng 47,9%.
   - **Nói chồng**: đúng 62,4% so với 75,3% khi một người nói.
   - **Đầu phiên**: 10 dòng đầu chỉ đúng 59,7% (cụm chưa ổn định) so với 86,9% từ dòng 30 trở đi (tính trên bản ghi có số giọng đúng).
   - Nén Opus 16–32 kbps hầu như không ảnh hưởng (72,9–76,3 so với 75,8 bản thường); **băng hẹp 8 kHz qua Opus 12 kbps là điều
     kiện xấu nhất** (65,1).
4. **Thay đổi thuật toán đáng thử hơn tham số (đã mô phỏng, chưa cài): chốt nhãn muộn** (mục 6). Gán lại mỗi dòng bằng tâm giọng
   vào lúc 30 s sau khi dòng kết thúc (giao diện đã đổi nhãn dòng cũ khi gộp giọng, cùng cơ chế): mọi dòng **+2,5 trên bộ kiểu cuộc
   gọi (73,2 → 75,7), +3,7 trên CV gốc, +0,1 trên AMI, số giọng không đổi.** Cộng với cấu hình tham số ở mục 2: 77,0 / AMI 87,6 /
   CV 93,8. Không có bản kiểm trên máy thật.
5. Hạn chế của phép đo: 18 hội thoại cơ sở (từ 27 người nói Common Voice), nên nhiều bản ghi tương quan (cùng cặp giọng); giọng đọc
   câu có sẵn, không phải hội thoại tự nhiên; nói chồng là cộng hai clip; vọng loa là mô phỏng nhẹ.

## Dữ liệu dựng (ngoài git: `$DATA/callsim/`)

`build_callsim.py` (mới) dựng từ Common Voice tiếng Việt (CC0, cùng nguồn A-spk2), mỗi hội thoại ~240 s, người nói là `client_id`:
lượt 1 câu; 25% lượt là đoạn ngắn 0,4–0,95 s cắt từ giữa một câu ("vâng", "ừ"); 22% lượt vào CHỒNG lên cuối lượt trước 0,3–1,0 s
(cộng hai clip cùng mức); nghỉ giữa lượt 0,1–0,8 s; 15% lượt là người vừa nói nói tiếp. Mỗi hội thoại cơ sở ra 8 biến thể, RTTM
đúng cho từng biến thể (đã dùng `score_spk.py`/bản chấm tương đương):

| Biến thể | Cách làm |
|---|---|
| `clean` | 16 kHz thường |
| `opus16`, `opus24`, `opus32` | Opus (libopus, `-application voip`) 16/24/32 kbps rồi giải mã 16 kHz |
| `nb8k` | hạ mẫu 8 kHz rồi nâng lại 16 kHz |
| `nb8k-opus12` | 8 kHz qua Opus 12 kbps |
| `echo12`, `echo18` | kênh micro của S1: giọng S1 cộng vọng của người kia (giảm 12 hay 18 dB, trễ 80–200 ms), rồi Opus 24 kbps; RTTM gồm lượt S1 và lượt người kia dịch đúng độ trễ |

Lô A (`call2p-01..04`, `call3p-01..04`, seed 100, 64 bản ghi) và lô B (`callB2p-01..05`, `callB3p-01..05`, seed 200, 80 bản ghi) =
**144 bản ghi, 18 hội thoại** (9 hội thoại 2 người, 9 hội thoại 3 người; khoảng 20–30 lượt < 1 s mỗi hội thoại). Bộ gốc để so: **AMI
A-spk1** (6 bản ghi của `$DATA/out/`) và **CV A-spk2 gốc** (6 hội thoại, bản thường và Opus 24 kbps, 12 bản ghi, seed 0).

Nhúng cả đoạn (như các báo cáo trước) cho mọi bản ghi; bản nhúng chỉ 4 s đầu mỗi đoạn (`--max-embed-s 4`, như `speaker-worker`
thật) cho lô A, AMI và CV gốc. **Hai cách nhúng cho cùng kết luận** (bảng cuối).

## Cách chấm

Bản Python của `OnlineClusterer` (`callsim_sweep.py`), **kiểm khớp từng nhãn với `latency-bench speaker-eval --embeddings-in`**
(24 bản ghi × cấu hình mặc định, θ = 0,45/gộp 0,75/min_new 2500, θ = 0,3625/gộp 0,80: 0 lệch), cho phép quét cả `min_update_ms`,
`max_voices`, `min_embed_ms` mà CLI không có cờ. Chấm đúng công thức `score_spk.py` (Hungarian ghép giọng ↔ người; dòng đúng khi giọng
ứng với người nói nhiều nhất trong dòng). Cột "trung bình" là trung bình theo bản ghi; "tệ nhất" là một bản; "25% tệ" là trung bình
của một phần tư bản ghi tệ nhất; "thừa/thiếu" là TỔNG số giọng thừa/thiếu so với số người thật, cộng qua mọi bản ghi của bộ.

## Kết quả (cache nhúng cả đoạn)

Cấu hình mặc định: θ = 0,35, `min_new_ms` 1500, `min_update_ms` 1000, `min_embed_ms` 500, `max_voices` 8, gộp tắt.

### Theo θ (gộp tắt)

| θ | call: mọi dòng / ≥1 s | tệ nhất | 25% tệ | thừa / thiếu | AMI mọi dòng / ≥1 s | AMI thừa | CV mọi dòng / ≥1 s | CV tệ nhất | CV thừa / thiếu |
|---|---|---|---|---|---|---|---|---|---|
| 0,250 | 65,1 / 68,1 | 34 | 42,5 | 2 / 115 | 87,6 / 93,0 | 4 | 74,3 / 81,0 | 47 | 0 / 6 |
| 0,300 | 69,8 / 73,5 | 34 | 46,4 | 9 / 89 | 87,6 / 93,1 | 6 | 81,3 / 87,7 | 59 | 1 / 3 |
| 0,325 | 71,6 / 75,7 | 34 | 48,3 | 13 / 78 | 87,8 / 93,3 | 7 | 85,6 / 91,6 | 67 | 3 / 2 |
| **0,350 (mặc định)** | **73,2 / 77,7** | **34** | **49,6** | **17 / 63** | **87,6 / 93,2** | **8** | **88,0 / 93,9** | **66** | **3 / 1** |
| 0,375 | 76,1 / 81,7 | 37 | 52,4 | 23 / 43 | 87,3 / 93,1 | 9 | 89,1 / 94,5 | 76 | 7 / 0 |
| 0,400 | 78,2 / 84,6 | 35 | 57,7 | 46 / 25 | 87,6 / 93,3 | 10 | 84,4 / 89,2 | 67 | 17 / 0 |
| 0,425 | 78,3 / 85,4 | 47 | 61,3 | 83 / 16 | 86,7 / 92,8 | 12 | 82,8 / 87,5 | 61 | 23 / 0 |
| 0,450 | 79,0 / 86,9 | 47 | 66,9 | 139 / 7 | 85,6 / 92,0 | 19 | 79,0 / 84,4 | 60 | 31 / 0 |
| 0,500 | 75,1 / 84,7 | 60 | 66,7 | 323 / 0 | 84,7 / 91,9 | 21 | 71,2 / 77,4 | 58 | 48 / 0 |

(θ trong 0,3625 nằm giữa 0,35 và 0,375; số ở mục 2 và bảng ứng viên bên dưới.) Điểm trung bình tăng theo θ tới ~0,45 nhưng đều từ
việc tách bớt cặp giọng giống nhau; giá là giọng thừa (một người hiện thành 2–4 giọng, mà dòng trong từng giọng vẫn đúng người
theo Hungarian nên "mọi dòng" không phạt hết cái này; app thì hiện số giọng sai cho người dùng). Hai bộ gốc đều xấu đi từ θ ≥ 0,40.

### Các tham số khác (θ = 0,35 và 0,375; đủ lưới ở `$DATA/callsim/sweep-emb.json`)

| Tham số | Giá trị | call mọi dòng / ≥1 s (θ 0,35) | call thừa / thiếu | AMI | CV mọi dòng | Ghi chú |
|---|---|---|---|---|---|---|
| `min_new_ms` | 1000 | 79,5 / 84,9 | 81 / 17 | 84,9 (thừa 24) | 86,9 (thừa 19) | điểm call tăng 6 nhưng thừa 4,8 lần: không đạt |
| | 1500 (mặc định) | 73,2 / 77,7 | 17 / 63 | 87,6 | 88,0 | |
| | 2000 | 69,7 / 73,1 | 6 / 84 | 86,8 | 76,9 | thiếu nhiều hơn |
| `min_update_ms` | 0 | 73,3 / 77,9 | 17 / 64 | 87,4 | 88,4 | không khác |
| | 2000 | 72,8 / 77,4 | 17 / 54 | 87,4 | 85,3 (thừa 8) | |
| `min_embed_ms` | 700 | 70,3 / 77,7 | 17 / 63 | 87,0 | 85,1 | kém: đoạn 500–700 ms lấy giọng trước còn tệ hơn nhúng |
| | 1000 | 65,1 / 77,8 | 17 / 63 | 84,5 | 83,1 | kém hơn nữa |
| `max_voices` | 4 | 73,2 / 77,7 | 17 / 63 | 85,1 | 88,0 | AMI kém (họp 4–5 người) |
| | 3 | 73,4 / 77,9 | 11 / 63 | 77,3 | 75,6 | kém |
| `merge_theta` | 0,85 – 0,70 | 73,2–73,3 | 16 / 63 | 87,6 | 88,0 | gộp hầu như không kích hoạt |
| | 0,65 | 72,5 / 77,0 | 16 / 67 | 87,6 | 82,1 | gộp nhầm người thật |
| `--max-embed-s 4` (thời lượng nhúng tối đa) | 4 s | xem bảng cuối | | | | không đổi so với nhúng cả đoạn |

`min_new_ms` 1000 cho thấy rõ cơ chế: mở giọng sớm hơn thì bắt được người thứ hai sớm nhưng sinh nhiều giọng thừa.

### Ứng viên duy nhất đạt luật (θ 0,3625, min_update 0, gộp 0,80), so với mặc định

| Bộ | Mặc định: mọi dòng / ≥1 s / tệ nhất / thừa / thiếu | Ứng viên |
|---|---|---|
| call (144) | 73,2 / 77,7 / 33,7 / 17 / 63 | 74,3 / 79,2 / 36,6 / 17 / 57 |
| AMI (6) | 87,6 / 93,2 / 80,2 / 8 / 0 | 87,4 / 93,2 / 79,7 / 8 / 0 |
| CV gốc (12) | 88,0 / 93,9 / 66,4 / 3 / 1 | 91,1 / 96,5 / 86,5 / 3 / 0 |

Phần lớn lợi ở CV gốc là sửa một bản ghi hỏng (`cv-vi-05-opus`: hai người gộp một giọng, 66% → 87%), tức là đúng điểm nhạy đã ghi ở
`nhan-giong-tieng-viet.md`; không nên đọc là +3 điểm đều khắp.

### Theo biến thể nén / số người (mặc định, 144 bản ghi kiểu cuộc gọi)

| Nhóm | n | mọi dòng | ≥1 s | tệ nhất | thừa / thiếu |
|---|---|---|---|---|---|
| 2 người | 72 | 75,2 | 80,1 | 48,7 | 11 / 23 |
| 3 người | 72 | 71,3 | 75,4 | 33,7 | 6 / 40 |
| clean | 18 | 75,8 | 80,6 | 38,0 | 3 / 6 |
| opus32 | 18 | 75,6 | 80,0 | 37,5 | 2 / 7 |
| opus24 | 18 | 74,0 | 78,4 | 37,8 | 2 / 8 |
| opus16 | 18 | 73,0 | 77,6 | 37,1 | 1 / 8 |
| nb8k | 18 | 73,7 | 79,0 | 36,6 | 3 / 8 |
| nb8k-opus12 | 18 | 65,1 | 67,8 | 33,7 | 2 / 12 |
| echo12 (mic có vọng) | 18 | 74,4 | 78,8 | 37,6 | 2 / 6 |
| echo18 | 18 | 74,2 | 79,7 | 36,4 | 2 / 8 |

Nén Opus từ 16 kbps trở lên và vọng 12–18 dB (RTTM gán vọng cho người kia) chỉ làm điểm đổi 1–3 điểm; băng hẹp + Opus 12 kbps
làm giảm 10 điểm và thêm nhiều cặp bị gộp.

### Cả hai cách nhúng (cả đoạn so với 4 s đầu như worker thật), lô A + AMI + CV gốc

Mặc định: cả đoạn call 72,3 / AMI 87,6 / CV 88,0; 4 s đầu call 72,3 / AMI 87,6 / CV 87,9. Ứng viên: cả đoạn 73,5 (lô A) → 4 s đầu
73,4 (call), AMI 87,4, CV 91,0. Kết luận giống nhau; **nhúng chỉ 4 s đầu không làm kém đi**, nên giữ như worker đang làm.

## Nhầm xảy ra ở loại đoạn nào (mặc định, kiểu cuộc gọi, 14.904 dòng có nhãn)

| Loại | n | đúng | ghi chú |
|---|---|---|---|
| dòng < 1 s | 4.948 | 64,9% | 500–1000 ms: 71,7%; < 500 ms (không nhúng): 47,9% |
| 1–2 s | 5.828 | 77,6% | |
| 2–4 s | 3.914 | 78,1% | |
| ≥ 4 s | 214 | 71,0% | thường là lượt dài bị nói chồng |
| một người nói | 12.750 | 75,3% | |
| nói chồng (người thứ hai > 15% độ dài dòng) | 2.154 | 62,4% | |
| 60 s đầu | 3.877 | 67,8% | |
| sau 60 s | 11.027 | 75,4% | |

Chỉ tính bản ghi số giọng ĐÚNG (73/144), tức lỗi thuần do gán dòng: dòng < 1 s 74,1%, 1–2 s 90,7%, 2–4 s 88,5%, nói chồng 72,5% (một
người 85,9%), 10 dòng đầu 59,7%, dòng 10–29 86,0%, từ 30 trở đi 86,9%. Vậy khi số giọng đã đúng, phần còn nhầm tập trung ở dòng
ngắn, nói chồng và vài chục giây đầu; khi số giọng thiếu (54 bản ghi), 45% dòng sai và đó là nguồn lỗi lớn nhất. Cùng thống kê trên
CV gốc: < 1 s 73,9%, 60 s đầu 70,2% so với 92,0% sau đó; AMI: < 1 s 79,3%, nói chồng 76,1%, 60 s đầu 57,5%.

Giải thích cho ca người dùng gặp (2 người, số giọng đúng, nhiều dòng nhầm): trùng với nhóm "số giọng đúng" ở trên, lỗi nằm ở dòng
ngắn (xác nhận, "vâng/ừ"), chỗ nói chồng và đầu phiên, không phải tham số.

## Thuật toán có thể thử (đã mô phỏng trên cache; KHÔNG cài)

Chạy `callsim_sweep.py algos` (kết quả trung bình mọi dòng, bộ call / AMI / CV gốc; số giọng không đổi ở mọi dòng):

| Thuật toán | call | AMI | CV gốc |
|---|---|---|---|
| mặc định | 73,2 | 87,6 | 88,0 |
| chốt nhãn muộn 5 s | 74,6 | 87,5 | 89,7 |
| chốt nhãn muộn 15 s | 75,4 | 87,7 | 90,7 |
| chốt nhãn muộn 30 s | 75,7 | 87,7 | 91,7 |
| chốt nhãn muộn 60 s | 76,1 | 87,7 | 92,2 |
| gán lại mọi đoạn theo tâm cuối (cận trên ngoại tuyến) | 76,7 | 87,6 | 93,1 |
| ứng viên tham số (mục 2) | 74,3 | 87,4 | 91,1 |
| ứng viên tham số + chốt muộn 30 s | 77,0 | 87,6 | 93,8 |
| trừ trung bình chạy trước khi so cosine (θ 0,05–0,40) | tới 81,1 (thừa 71) | 69–72 | 75–82 |

Đề xuất theo thứ tự đáng thử:

1. **Chốt nhãn muộn (lookback 15–30 s)**: dòng ở trạng thái "tạm" cho tới khi qua N giây, rồi gán lại bằng tâm lúc đó (phân cụm vẫn nhân
   quả). Sửa các dòng đầu phiên và dòng đoạn ngắn đã bị gán khi cụm chưa ổn định. Lợi +2 đến +3 điểm, không đổi số giọng, không
   cần model. Phải chịu nhãn đổi vài lần ở giao diện (đã có cơ chế đổi nhãn khi gộp giọng).
2. **Dùng nhãn nguồn mic/system**: ở chế độ "âm thanh máy + micro" giọng người dùng chỉ đến từ mic; phân cụm theo nguồn
   (mic: một giọng; system: các giọng còn lại) loại hẳn cặp "người dùng + một người" khỏi lỗi gộp giọng, vốn là nguồn lỗi lớn nhất.
   Chưa mô phỏng được vì file kiểu cuộc gọi hiện là một kênh; việc đo cần ghi hai kênh riêng.
3. **Đoạn ngắn**: bỏ qua nhúng không giúp (bảng `min_embed_ms`). Có thể chỉ cho đoạn < 1 s chọn giọng gần nhất khi cosine rõ ràng
   hơn giọng liền trước một biên, còn không thì giữ giọng trước; hoặc tạm đánh dấu "chưa chắc" (độ tin thấp) thay vì hiện tên.
4. **Cặp giọng giống nhau** (nguồn lỗi lớn nhất): cần model nhúng tốt hơn cho tiếng Việt (hoặc tinh chỉnh) hoặc chuẩn hóa nhúng theo
   phiên. Thử trừ trung bình chạy thô cho ra call tốt hơn nhưng AMI và CV xấu đi nhiều (69–72 và 75–82), nên chưa đủ; cần bản làm kỹ
   (trung bình theo corpus, LDA/PLDA nhẹ) và đo riêng.
5. **Cập nhật tâm sớm**: `min_update_ms` 0 gần như không đổi (±0,1), nên không phải hướng chính.

## Cách chạy lại

```sh
W=...  M=...  DATA=...   # đặt theo máy; B=$W/bench/2026-10-26-nguoi-noi
B=$W/bench/2026-10-26-nguoi-noi; PY=$DATA/venv/bin/python; export DATA
cd $B
# 1. dựng dữ liệu (cần ffmpeg có libopus); ra $DATA/callsim/ (không dùng -I vì script nạp build_cv_vi cùng thư mục)
nice -n 10 $PY build_callsim.py $DATA/cv-vi $DATA/callsim                                   # lô A: seed 100, 4 hội thoại 2 người + 4 hội thoại 3 người
nice -n 10 $PY build_callsim.py $DATA/cv-vi $DATA/callsim --n2 5 --n3 5 --seed 200 --tag B  # lô B
# 2. nhúng một lần mỗi bản ghi, lưu cache (cần $W/target/release/latency-bench; lô B chỉ nhúng cả đoạn)
W=$W M=$M DATA=$DATA $B/callsim_embed.sh                  # $DATA/callsim/<tên>.emb.json và $DATA/callsim/emb4/ (chỉ 4 s đầu)
W=$W M=$M DATA=$DATA $B/callsim_embed4_orig.sh            # nhúng lại AMI/CV gốc kiểu 4 s đầu -> $DATA/out/emb4, $DATA/out/vi/emb4
# 3. kiểm bản Python khớp binary, rồi quét, phân tích
$PY callsim_sweep.py check $W/target/release/latency-bench $DATA/callsim call2p-01-clean call3p-02-opus16
$PY callsim_sweep.py sweep    $DATA --out $DATA/callsim/sweep-emb.json    # lưới θ × (min_new, min_update, min_embed, merge, max_voices)
$PY callsim_sweep.py dense    $DATA --out $DATA/callsim/dense-emb.json    # 1.320 cấu hình, in các cấu hình đạt luật
$PY callsim_sweep.py variants $DATA                                       # bảng theo biến thể (thêm --theta/--min-new-ms, --cache emb4)
$PY callsim_sweep.py errors   $DATA;  $PY callsim_sweep.py good $DATA     # nhầm theo loại đoạn / khi số giọng đúng
$PY callsim_sweep.py algos    $DATA;  $PY callsim_sweep.py center $DATA   # thuật toán thử
```

Chấm một bản bằng binary như cũ (θ khác, cache): `latency-bench speaker-eval --embeddings-in $DATA/callsim/<tên>.emb.json --theta
0.3625 --merge-theta 0.8 --out x.jsonl` rồi `score_spk.py x.jsonl $DATA/callsim/<tên>.rttm`. `min_update_ms`, `max_voices`,
`min_embed_ms` chỉ chạy được qua `callsim_sweep.py` (CLI không có cờ).

File mới trong `$B`: `build_callsim.py`, `callsim_embed.sh`, `callsim_embed4_orig.sh`, `callsim_sweep.py`; không sửa file nào có theo dõi.
