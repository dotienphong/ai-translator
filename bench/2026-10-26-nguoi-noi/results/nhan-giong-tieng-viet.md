# Nhận giọng tiếng Việt (A-spk2)

Kế hoạch 01, Task 8. Đo chất lượng gán người nói của code thật (`fbank` Rust, ERes2Net trên `candle-onnx`, `OnlineClusterer`) trên
hội thoại tiếng Việt nhiều người dựng từ Common Voice tiếng Việt, để trả lời A-spk2 của spec
`2026-10-26-phan-biet-nguoi-noi-design.md` §12. Mọi số dưới đây lấy từ đầu ra của `latency-bench speaker-eval`, `score_spk.py` và
`tune.py` (hoặc chạy lại đúng các lệnh đó trên cache nhúng). Cách chấm, cách đọc cột và ngưỡng θ giống `nhan-giong-ami.md`.

## Kết luận ngắn

Mức đạt của spec: dòng ≥ 1 s đúng người ≥ 85%. Ngưỡng dùng là θ = 0,35, gộp 1,10 (không bao giờ gộp), chủ dự án đã chốt mặc
định 0,35; ngưỡng do `tune.py` chọn riêng trên tiếng Việt cũng ra đúng bộ này.

- **Đọc theo trung bình: đạt.** Phần kiểm (8 bản ghi): dòng ≥ 1 s trung bình **93,9%** (ở θ = 0,40 là 87,4%: vẫn đạt nhưng sát).
- **Đọc theo từng hội thoại (chặt nhất, cách đã dùng cho A-spk1): không đạt.** 7/8 bản ghi kiểm đạt; một bản (hội thoại 05, bản
  Opus) chỉ **67,7%** vì hai người nói bị gộp làm một giọng. Dựng thêm 6 hội thoại bổ sung (`--seed 1`, ngoài phép đo chính thức,
  không chọn lại gì): 9/12 bản đạt ở θ = 0,35, tính cả hai lượt (24 bản ghi) **20/24 bản đạt**, trung bình **92,1%**. Cả 4 bản
  hỏng đều cùng một kiểu lỗi: hai người nói ghép vào một giọng (xem "Chỗ hỏng").
- Lỗi này là tính nhạy của phân cụm trực tuyến với cặp giọng giống nhau (cosine tâm cụm 0,6–0,7, có ca thấp hơn); không có bằng
  chứng riêng cho tiếng Việt. Opus có thể làm nặng thêm (làm hai giọng gần nhau hơn khoảng 0,03 cosine) nhưng không phải nguyên nhân
  duy nhất: bản thường của seed 1 hội thoại 05 cũng hỏng. Chi tiết và phương án ở "Kết luận A-spk2".

## Dữ liệu

| Mục | Giá trị |
|---|---|
| Corpus | Mozilla Common Voice, Scripted Speech, **tiếng Việt (`vi`), bản 22.0** |
| Giấy phép | CC0-1.0 (miễn phí, không cần ghi nguồn) |
| Nơi tải | Bản sao công khai của bên thứ ba trên Hugging Face: `fsicoli/common_voice_22_0` (revision `ae911de250fe9375d08e2daa2105b671d659d446`, sửa lần cuối 2025-08-11). Không cần tài khoản, không cần token, không phải đồng ý điều khoản (API báo `gated: false`, thẻ giấy phép `cc0-1.0`) |
| Ngày tải | 2026-10-26, qua HTTPS (`curl`) |
| File dùng | `transcript/vi/validated.tsv`, `audio/vi/train/vi_train_0.tar`, `audio/vi/dev/vi_dev_0.tar`, `audio/vi/test/vi_test_0.tar` (SHA-256 ở dưới); tổng 121 MB, giải nén 4.402 clip mp3 |
| Người nói | `client_id` (mã băm của phiên trình duyệt) trong `validated.tsv`: 182 mã có clip, **27 người có ≥ 15 câu** (15 người ≥ 30 câu; nhiều nhất 2.104 câu); dùng 27 người này |
| Không dùng | Clip `other` (chưa duyệt) và `invalidated`: không tải |

SHA-256 các file đã dùng:

```
cef0988e9fb41174a4407646eef6641944722be5541682b01091f92a4bf5279a  transcript/vi/validated.tsv
a6b67e3e03d0caa3219dea1c0c56021a351356884982bd937e8ea68e13cfa69b  audio/vi/train/vi_train_0.tar
8511f8bcb1716868d8a8e3f53647b731fee0bf20d8b909b1f0f495f1580c4d4b  audio/vi/dev/vi_dev_0.tar
701cff5731706b180adec93e40f635197908a6ab7210a47be003e7134bbdd401  audio/vi/test/vi_test_0.tar
```

Vì sao không dùng bản chính thức: kế hoạch ghi Common Voice tải qua Mozilla Data Collective, cần tài khoản và đồng ý điều khoản; việc
đó không được làm thay chủ dự án. Hai kho chính thức cũ `mozilla-foundation/common_voice_13_0` và `common_voice_17_0` trên Hugging
Face hiện chỉ còn `README.md` và `.gitattributes` (không có dữ liệu). Bản sao của bên thứ ba là CC0 nên được phát lại; **không so
được với bản gốc của Mozilla**, chỉ ghi lại SHA-256 các file đã dùng (cũng ở `$DATA/cv-vi/SHA256SUMS.txt`). `validated.tsv` của bản
sao có 5.760 dòng nhưng chỉ 4.402 dòng có audio (đúng bằng train + dev + test), nên `build_cv_vi.py` bỏ qua dòng không có file.

Corpus dự phòng đã xem nhưng không tải vì Common Voice đủ dùng: VIVOS (`AILAB-VNUHCM/vivos` trên Hugging Face, không cần đăng
nhập; thẻ giấy phép ở đó là `cc-by-nc-sa-4.0`, tức phi thương mại, không phải CC BY-SA).

## Cách dựng hội thoại

`build_cv_vi.py` (dựng đúng theo kế hoạch): mỗi hội thoại ~5 phút, 3–4 người chọn ngẫu nhiên từ 27 người; lượt nói 1–2 câu cách
nhau 0,25 s; 15% lượt là người vừa nói nói tiếp; nghỉ giữa lượt 0,15–1,2 s; 10% lượt (khi đổi người) chen vào cuối lượt trước
0,3–1,0 s (mô phỏng chen lời bằng cách cộng hai clip, không phải nói chồng thật); mỗi câu cắt im lặng hai đầu (chừa 0,1 s) và
chuẩn hóa về −26 dBFS. Bản thường là 16 kHz mono 16 bit; bản Opus là bản thường qua Opus 24 kbps (`libopus`, ffmpeg 9.0.2) rồi giải
mã lại 16 kHz. RTTM của hai bản giống nhau. `--n 6 --seed 0`; seed 0 là phép đo chính thức, seed 1 là bổ sung.

| Hội thoại (seed 0) | Dài | Lượt | Người | Câu dùng lại | Đoạn (thường) | Có nhúng (≥ 500 ms) |
|---|---|---|---|---|---|---|
| cv-vi-01 | 302 s | 69 | 4 | 1 | 109 | 106 |
| cv-vi-02 | 311 s | 63 | 4 | 0 | 148 | 129 |
| cv-vi-03 | 304 s | 61 | 3 | 6 | 118 | 107 |
| cv-vi-04 | 304 s | 68 | 3 | 22 | 135 | 129 |
| cv-vi-05 | 305 s | 61 | 4 | 0 | 125 | 114 |
| cv-vi-06 | 302 s | 54 | 3 | 1 | 151 | 135 |

"Câu dùng lại" là số câu bị lấy lần thứ hai trong cùng hội thoại khi người nói hết câu (người có 15–25 câu). Hội thoại 04 dùng
lại nhiều nhất (22 trong ~100 câu); câu giống nhau cho nhúng giống nhau nên có thể làm giọng của người đó gọn hơn một chút, nhưng
bản ghi này không thuộc nhóm hỏng. Hội thoại seed 1 dùng lại 0, 0, 6, 0, 6, 9 câu.

## Điều kiện đo

- Máy: Apple M4 Pro, macOS 26.6.2. Rust 1.98.1. Bản build `target/release/latency-bench` của nhánh `phan-biet-nguoi-noi` (commit
  nền `046c41e6` cộng các thay đổi chưa commit của kế hoạch 01), nhúng chạy trên CPU (`candle-onnx`, f32), `RAYON_NUM_THREADS=2`,
  mỗi lần một tiến trình, chạy tuần tự. Đã kiểm binary này cho đúng số của `nhan-giong-ami.md`: chấm lại từ cache AMI ở θ = 0,35
  cho `EN2002a.Mix-Headset` mọi dòng 0,80188 (769/959) và `IS1009a.Mix-Headset` 0,85657, trùng `tune-ami.json` tới mọi chữ số.
- Cắt đoạn đúng như app: `SileroVad` (`silero_vad_v6.2.3.onnx`) và `Segmenter` với ngắt câu 50 ms (mặc định). Model nhúng giọng:
  ERes2Net sau `onnxsim`, SHA-256 `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e`.
- Chia dev/kiểm đúng như kế hoạch Step 4: dev (chọn tham số) là hội thoại 01, 02 và bản Opus của chúng; kiểm (chỉ báo cáo) là
  03–06 và bản Opus của chúng. Cột "đúng/tổng" là số đoạn ≥ 1 s gán đúng trên tổng số đoạn ≥ 1 s có người nói theo RTTM.
- Dữ liệu dựng (WAV, RTTM) và cache nhúng ở `$DATA/out/vi/` (seed 0) và `$DATA/out/vi-seed1/`, ngoài git.

## Kết quả với θ = 0,35, không gộp (ngưỡng đã chốt, ngưỡng AMI)

| Hội thoại | Phần | Bản | ≥ 1 s | Mọi dòng | Thời lượng | Giọng/người | Trần | Đoạn ≥ 1 s đúng/tổng |
|---|---|---|---|---|---|---|---|---|
| cv-vi-01 | dev | thường | 93,5% | 90,8% | 89,7% | 5/4 | 95,8% | 86/92 |
| cv-vi-01 | dev | Opus | 96,7% | 94,5% | 93,1% | 5/4 | 95,8% | 89/92 |
| cv-vi-02 | dev | thường | 92,5% | 83,8% | 90,1% | 4/4 | 99,0% | 86/93 |
| cv-vi-02 | dev | Opus | 92,5% | 81,0% | 88,6% | 4/4 | 99,0% | 86/93 |
| cv-vi-03 | kiểm | thường | 97,8% | 91,5% | 93,7% | 3/3 | 97,7% | 87/89 |
| cv-vi-03 | kiểm | Opus | 97,7% | 92,4% | 93,9% | 3/3 | 97,7% | 86/88 |
| cv-vi-04 | kiểm | thường | 98,9% | 94,8% | 93,1% | 3/3 | 95,5% | 94/95 |
| cv-vi-04 | kiểm | Opus | 99,0% | 94,9% | 93,1% | 3/3 | 95,5% | 95/96 |
| cv-vi-05 | kiểm | thường | 94,7% | 89,6% | 93,4% | 4/4 | 98,0% | 89/94 |
| cv-vi-05 | kiểm | Opus | **67,7%** | 66,4% | 67,5% | 3/4 | 98,0% | 63/93 |
| cv-vi-06 | kiểm | thường | 97,7% | 88,1% | 91,2% | 4/3 | 98,2% | 86/88 |
| cv-vi-06 | kiểm | Opus | 97,7% | 88,2% | 92,0% | 3/3 | 98,2% | 84/86 |
| **Trung bình 8 bản ghi kiểm** | | | **93,9%** | **88,2%** | 89,7% | | | |
| Trung bình 4 bản thường / 4 bản Opus (kiểm) | | | 97,3% / 90,5% | 91,0% / 85,5% | 92,8% / 86,6% | | | |
| **Thấp nhất trong 8 bản ghi kiểm** | | | **67,7%** (05 Opus) | 66,4% (05 Opus) | 67,5% | | | |
| Số bản ghi kiểm đạt ≥ 85% (dòng ≥ 1 s) | | | **7/8** | | | | | |
| Trung bình cả 12 bản (dev và kiểm) | | | 93,9% | 88,0% | 90,0% | | | 11/12 đạt |

Gộp mọi đoạn của 8 bản kiểm (không lấy trung bình theo bản ghi): dòng ≥ 1 s 93,8%, mọi dòng 88,3%. "Trần" là mức đạt được nếu mỗi
đoạn gán đúng người nói nhiều nhất (95,5–99,0%), nên VAD và cách cắt đoạn không phải chỗ nghẽn: sai số nằm ở nhúng và phân cụm.

## Kết quả với θ = 0,40 (mặc định cũ của spec), không gộp

| Hội thoại | Phần | Bản | ≥ 1 s | Mọi dòng | Thời lượng | Giọng/người | Trần | Đoạn ≥ 1 s đúng/tổng |
|---|---|---|---|---|---|---|---|---|
| cv-vi-01 | dev | thường | 87,0% | 82,6% | 83,4% | 6/4 | 95,8% | 80/92 |
| cv-vi-01 | dev | Opus | 96,7% | 94,5% | 93,1% | 5/4 | 95,8% | 89/92 |
| cv-vi-02 | dev | thường | 90,3% | 82,4% | 88,9% | 5/4 | 99,0% | 84/93 |
| cv-vi-02 | dev | Opus | 97,8% | 91,8% | 95,1% | 5/4 | 99,0% | 91/93 |
| cv-vi-03 | kiểm | thường | 95,5% | 89,0% | 90,5% | 5/3 | 97,7% | 85/89 |
| cv-vi-03 | kiểm | Opus | 87,5% | 83,9% | 84,4% | 6/3 | 97,7% | 77/88 |
| cv-vi-04 | kiểm | thường | 89,5% | 83,7% | 84,0% | 4/3 | 95,5% | 85/95 |
| cv-vi-04 | kiểm | Opus | 97,9% | 92,7% | 91,9% | 3/3 | 95,5% | 94/96 |
| cv-vi-05 | kiểm | thường | 93,6% | 88,8% | 92,8% | 4/4 | 98,0% | 88/94 |
| cv-vi-05 | kiểm | Opus | 93,5% | 89,6% | 92,9% | 4/4 | 98,0% | 87/93 |
| cv-vi-06 | kiểm | thường | **71,6%** | 67,5% | 71,0% | 6/3 | 98,2% | 63/88 |
| cv-vi-06 | kiểm | Opus | **69,8%** | 66,7% | 70,9% | 6/3 | 98,2% | 60/86 |
| **Trung bình 8 bản ghi kiểm** | | | **87,4%** | **82,7%** | 84,8% | | | |
| **Thấp nhất trong 8 bản ghi kiểm** | | | **69,8%** (06 Opus) | 66,7% (06 Opus) | 70,9% | | | |
| Số bản ghi kiểm đạt ≥ 85% (dòng ≥ 1 s) | | | **6/8** | | | | | |
| Trung bình cả 12 bản (dev và kiểm) | | | 89,2% | 84,4% | 86,6% | | | 10/12 đạt |

θ = 0,40 hỏng theo hướng ngược: tách một người thành nhiều giọng (giọng thừa 12 trên 8 bản kiểm; hội thoại 06 là 6 giọng cho 3
người), trong khi θ = 0,35 chỉ thừa 1 và thiếu 1. Trung bình vẫn ≥ 85% nhưng chỉ sát (87,4%).

## Ngưỡng chọn trên tiếng Việt

`tune.py` chạy trên dev (hội thoại 01, 02 và bản Opus), đầu ra:

```
chọn trên dev: θ=0.35 gộp=1.10 (mục tiêu 0.860)
  ở θ=0.35, gộp không đổi kết quả trên dev trong khoảng [0.70, 1.10] (1.10 = không bao giờ gộp); chọn mức thận trọng nhất 1.10
```

**Ngưỡng tiếng Việt trùng ngưỡng AMI (θ = 0,35, gộp 1,10), nên kết quả của ngưỡng này chính là bảng θ = 0,35 ở trên.** Không có hòa giữa các
θ. Mục tiêu trung bình trên dev theo θ (gộp 1,10; trừ 0,03 mỗi giọng thừa): 0,20: 0,4390; 0,25: 0,5768; 0,30: 0,7317;
**0,35: 0,8601**; 0,40: 0,8408; 0,45: 0,7264; 0,50: 0,5783; 0,55: 0,4997; 0,60: 0,4615. Đỉnh ở 0,35, hơn 0,40 khoảng 0,02, và
dốc rất nhanh cả hai phía. Dev chỉ có hai hội thoại nên đỉnh này không chắc chắn; bảng nhạy dưới đây cho thấy cùng đỉnh trên phần kiểm
và trên hội thoại bổ sung.

### Bảng nhạy theo θ

Chạy lại từ cache nhúng, không gộp, cùng cách chấm. Chỉ để mô tả, không dùng để chọn θ. Cột "24 bản" gồm cả 12 bản seed 0 (dev và kiểm) và
12 bản seed 1.

| θ | Kiểm seed 0 (8 bản): TB ≥ 1 s | Thấp nhất | Số bản < 85% | 24 bản: TB ≥ 1 s | 24 bản: TB mọi dòng | 24 bản: số bản < 85% (≥ 1 s) | 24 bản: giọng thừa / thiếu |
|---|---|---|---|---|---|---|---|
| 0,25 | 87,6% | 69,3% | 3 | 77,4% | 72,7% | 14/24 | 0 / 14 |
| 0,30 | 90,8% | 68,8% | 2 | 85,7% | 81,1% | 11/24 | 2 / 5 |
| **0,35** | **93,9%** | 67,7% | 1 | **92,1%** | **87,5%** | **4/24** | 11 / 2 |
| 0,40 | 87,4% | 69,8% | 2 | 88,5% | 84,0% | 6/24 | 39 / 0 |
| 0,45 | 83,5% | 65,9% | 3 | 84,7% | 78,9% | 10/24 | 63 / 0 |
| 0,50 | 76,9% | 64,8% | 7 | 80,0% | 73,5% | 19/24 | 101 / 0 |

θ = 0,35 là điểm tốt nhất của lưới theo các cột trung bình và số bản < 85%; θ ≤ 0,30 gộp giọng (giọng thiếu), θ ≥ 0,40 tách giọng
(giọng thừa). Không θ nào làm hết các bản ≥ 85%: bản thấp nhất của phần kiểm luôn 65–70% bất kể θ (ở cột này 0,35 thấp hơn 0,25–0,40 từ 1 đến 2 điểm).

## Chênh lệch bản Opus so với bản thường

Hiệu "Opus trừ thường" của dòng ≥ 1 s / mọi dòng, điểm phần trăm, mỗi hội thoại một dòng:

| Hội thoại | θ = 0,35 seed 0 | θ = 0,40 seed 0 | θ = 0,35 seed 1 |
|---|---|---|---|
| 01 | +3,3 / +3,7 | +9,8 / +11,9 | +1,2 / +0,9 |
| 02 | 0,0 / −2,8 | +7,5 / +9,4 | +1,3 / +0,9 |
| 03 | 0,0 / +0,8 | −8,0 / −5,1 | −1,2 / −0,9 |
| 04 | 0,0 / +0,1 | +8,4 / +9,0 | −19,1 / −18,3 |
| 05 | **−26,9 / −23,2** | −0,1 / +0,8 | −3,1 / −5,4 |
| 06 | −0,1 / +0,2 | −1,8 / −0,9 | −6,0 / −3,4 |
| Trung bình dòng ≥ 1 s (6 hội thoại) | −4,0 | +2,6 | −4,5 |

Opus không làm giảm đều: ở θ = 0,35 seed 0, bốn trong sáu hội thoại chênh không quá 0,1 điểm, một hội thoại +3,3, một −26,9 (hội thoại 05);
bỏ hội thoại 05 thì Opus hơn thường +0,6 điểm, nên cả mức giảm trung bình đến từ một biến cố gộp giọng. Ở θ = 0,40 chênh lệch lên
xuống cả hai chiều tới ±8–10 điểm (phân cụm trực tuyến phụ thuộc đường đi: một đoạn đầu khác đi là cả cụm khác đi). Tuy vậy các
biến cố gộp ở θ = 0,35 đều rơi vào bản Opus hoặc nặng hơn ở bản Opus (seed 0 hội thoại 05 và seed 1 hội thoại 04 chỉ ở bản Opus;
seed 1 hội thoại 05 hỏng ở cả hai bản, Opus nặng hơn: 72,7% so với 75,9%). Cosine giữa hai tâm cụm gần nhau nhất tăng khi qua Opus ở
11/12 hội thoại (seed 0 và 1; trung bình +0,03, nhiều nhất +0,07 ở seed 1 hội thoại 05: 0,63 → 0,70) và cosine trong người gần như
không đổi (0,61–0,67), tức Opus kéo các giọng lại gần nhau hơn một chút, đủ để đổi kết quả khi θ nằm sát. Số mẫu quá ít để nói
chắc về tác động lên độ chính xác.

## Chỗ hỏng: hai người nói gộp thành một giọng

Ma trận thời lượng (giây) giọng của app (hàng) × người thật (cột) ở θ = 0,35 cho các bản dưới 85%:

| Bản ghi | Mô tả |
|---|---|
| cv-vi-05 Opus (seed 0) | Giọng 1 nhận cả S3 (75,4 s) và S4 (57,1 s); giọng 2 là S1, giọng 3 là S2 (mở ở giây 98). Cặp S3–S4 có cosine tâm cụm 0,60 (0,56 ở bản thường, không gộp) |
| cv-vi-05 (seed 1) | Giọng 2 nhận cả S1 (44,8 s) và S3 (85,7 s); cặp S1–S3 cosine 0,63. Một giọng thừa sinh từ 5,2 s của S1 |
| cv-vi-05 Opus (seed 1) | Như trên, nhưng chỉ còn 2 giọng cho 3 người; cosine 0,70 |
| cv-vi-04 Opus (seed 1) | Giọng 1 nhận cả S1 (42,2 s) và S2 (63,9 s), dù cosine tâm cụm S1–S2 thấp hơn 0,44 (bản thường: 6 giọng cho 3 người nhưng giọng thừa nhỏ, 93,5%): không chỉ do cặp giống nhau mà còn do thứ tự đoạn đầu |

Khoảng cách giữa người nói thật: lấy nhúng của các đoạn có nhúng (≥ 500 ms) mà ≥ 90% thời lượng nói thuộc một người (RTTM), tính tâm cụm
của từng người (trung bình nhúng đã chuẩn hóa), rồi lấy cosine giữa hai tâm cụm gần nhau nhất. Cosine trung bình giữa nhúng
của một người và tâm cụm của chính người đó (trong người) là 0,61–0,67 ở mọi hội thoại.

| Hội thoại | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| Seed 0, cặp gần nhất, bản thường | 0,57 | 0,39 | 0,62 | 0,31 | 0,56 | 0,52 |
| Seed 0, cặp gần nhất, bản Opus | 0,55 | 0,42 | 0,66 | 0,32 | 0,60 | 0,53 |
| Seed 1, cặp gần nhất, bản thường | 0,26 | 0,37 | 0,44 | 0,44 | 0,63 | 0,34 |
| Seed 1, cặp gần nhất, bản Opus | 0,28 | 0,40 | 0,48 | 0,46 | 0,70 | 0,38 |

Cặp có cosine ≥ 0,55 xuất hiện ở 3/6 hội thoại seed 0 (01, 03, 05) và 1/6 seed 1 (05); ở θ = 0,35 bị gộp ở seed 0 hội thoại 05 (bản Opus) và ở seed 1
hội thoại 05 (cả hai bản), còn hội thoại 01 và 03 của seed 0 (cặp 0,57 và 0,62 đến 0,66) vẫn tách đúng vì kết quả còn phụ thuộc đoạn đầu mở giọng. Nghĩa là rủi ro chính thuộc phân cụm trực tuyến (một khi hai người gộp thì không tách lại được),
không phải một mức nhận giọng thấp đều khắp.

## Kết luận A-spk2

Mức đạt của spec: dòng ≥ 1 s đúng người ≥ 85%, hội thoại dựng từ Common Voice tiếng Việt, 3–4 người.

**Kết luận: đạt theo trung bình, không đạt theo từng hội thoại.**

| Cách đọc | θ = 0,35 (đã chốt) | θ = 0,40 |
|---|---|---|
| Trung bình 8 bản ghi kiểm (seed 0) | **93,9%: đạt** | 87,4%: đạt (sát) |
| Từng bản ghi kiểm đạt ≥ 85% | **7/8: không đạt** (thấp nhất 67,7%) | 6/8: không đạt (thấp nhất 69,8%) |
| Cả 12 bản seed 0 (dev và kiểm) | 93,9%; 11/12 bản đạt | 89,2%; 10/12 |
| Bổ sung seed 1 (12 bản), chỉ để biết độ ổn định | 90,4%; 9/12 bản đạt | 87,8%; 8/12 |
| Cả 24 bản (seed 0 và 1) | **92,1%**; 20/24 bản đạt | 88,5%; 18/24 |

- Trung bình (cách đọc của spec nếu hiểu "dòng ≥ 1 s đúng người" là chỉ số gộp): đạt ở cả hai θ, thoải mái ở 0,35 (93,9%, tính cả
  hai seed vẫn 92,1%), sát ở 0,40.
- Từng hội thoại (cách đọc chặt nhất, đã dùng cho A-spk1 ở `nhan-giong-ami.md`): không đạt. Khoảng 1 trong 6 bản ghi hỏng (4/24 ở θ = 0,35)
  với mức rơi rất sâu (67–76%), do hai người nói gộp thành một giọng. Người dùng gặp lỗi này sẽ thấy hai người mang chung một nhãn
  suốt cuộc họp, và một lần gộp không tự tách lại được.
- So với AMI (tiếng Anh, họp thật, 4 bản kiểm trung bình 92,0%, thấp nhất 87,3%): tiếng Việt không thấp hơn về trung bình
  (93,9%, trên dữ liệu sạch hơn); thấp nhất kém hơn (67,7% so với 87,3%); trong hội thoại 5 phút 3–4 người, một lần gộp ảnh hưởng gần hết
  hội thoại. Không có bằng chứng "tiếng Việt kém hơn tiếng Anh" như rủi ro đầu tiên ở spec §14; có bằng chứng về rủi ro gộp giọng giống nhau.

**Phương án ở spec §14 nếu coi cách đọc chặt là mức đạt:** thử TitaNet-small hoặc CAM++ `zh_en` (vá đồ thị cho `candle-onnx`), và chỉnh θ.
θ đã được chỉnh: 0,35 là điểm tốt nhất của lưới theo trung bình và số bản < 85% (bảng nhạy), và không θ nào hết bản thấp nhất, nên chỉnh θ không còn dư địa. Phần còn lại của §14 là đổi model nhúng;
việc đó **chưa làm**, vì kế hoạch dặn hỏi chủ dự án trước. **Chủ dự án cần quyết**: (1) chấp nhận kết quả theo trung bình và ghi rủi ro
gộp giọng vào spec (kèm cách khắc phục cho người dùng: menu dự kiến ở spec §13, kế hoạch 03, chỉ có đổi tên và gộp, chưa có tách một giọng thành hai), hay (2) thử ngay
TitaNet-small và CAM++ `zh_en` trong kế hoạch này trên đúng bộ 12 bản ghi (cache dựng sẵn ở `$DATA/out/vi/`; cần nhúng lại bằng model mới).

**Đã quyết (Task 15, 2026-10-26):** chủ dự án chọn (1): chấp nhận kết quả theo trung bình, ghi rủi ro gộp giọng giống nhau vào spec
(§12, §14); không thử model khác trong kế hoạch này. Tổng hợp ở `tong-hop.md`.

## Giới hạn của phép đo

- **Giọng đọc sạch.** Câu đọc theo kịch bản, thu bằng micro máy người dùng; không có tiếng ồn phòng họp, vọng, nhiều người
  chung một micro, hay giọng nói tự nhiên (ngắt, ngập ngừng, "ừ", "dạ"). Không đại diện cho tiếng ồn phòng họp.
- **Không có nói chồng thật.** "Chen lời" chỉ là cộng hai câu vào nhau trong 0,3–1,0 s. Nhãn RTTM theo biên lượt, gồm cả phần chừa
  0,1 s hai đầu mỗi câu và 0,25 s giữa hai câu trong một lượt (im lặng nằm trong RTTM); chấm theo thời lượng trùng nên ảnh hưởng không đáng kể.
- **Mỗi người có một kênh thu riêng.** Mỗi `client_id` là một phiên trình duyệt với một micro và một căn phòng, nên đặc trưng kênh
  (micro, vọng, nền) khác nhau giữa người nói và giống nhau trong cùng một người; mô hình có thể dựa vào đó. Điều này làm số đo
  lạc quan hơn so với corpus thu cùng điều kiện (như VIVOS) và có thể không còn đúng khi mọi người chung phòng và chung micro;
  ngược lại một mã có thể gồm nhiều người dùng chung máy, hoặc một người có nhiều mã, làm nhãn nhiễu và số đo thận trọng hơn.
  Chiều nào mạnh hơn thì chưa đo được.
- **Cỡ mẫu nhỏ và không độc lập.** 6 hội thoại seed 0 (12 bản gồm Opus) và 6 hội thoại bổ sung, dựng từ cùng 27 người (nhiều người ở nhiều hội
  thoại), nên nhiều hội thoại chung cặp giọng; một lần gộp giọng đổi trung bình vài điểm. Không có kiểm định thống kê.
- **Hội thoại ngắn (5 phút), cuộc họp thật dài hơn.** Phân cụm trực tuyến càng dài càng có dịp gộp hoặc tách nhầm (AMI 14–36 phút
  có 4–8 giọng cho 4 người).
- Opus 24 kbps qua ffmpeg `libopus` là mô phỏng gần đúng âm thanh đi qua app họp; không phải Zoom, Teams hay Meet thật.
- Bản sao Common Voice của bên thứ ba, không đối chiếu được với bản của Mozilla (xem "Dữ liệu").

## Cách chạy lại

```sh
W=...  M=...  DATA=...   # đặt theo máy của bạn
B=$W/bench/2026-10-26-nguoi-noi; VAD=$M/models/silero_vad_v6.2.3.onnx; MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx
H=https://huggingface.co/datasets/fsicoli/common_voice_22_0/resolve/ae911de250fe9375d08e2daa2105b671d659d446
mkdir -p $DATA/cv-vi/tars $DATA/cv-vi/clips && cd $DATA/cv-vi
curl -sSfL -o validated.tsv $H/transcript/vi/validated.tsv
for s in train dev test; do curl -sSfL -o tars/vi_${s}_0.tar $H/audio/vi/$s/vi_${s}_0.tar; tar xf tars/vi_${s}_0.tar -C clips --strip-components=1; done
cd $B && $DATA/venv/bin/python -I build_cv_vi.py $DATA/cv-vi $DATA/out/vi --n 6 --seed 0       # seed 1: --seed 1 và thư mục vi-seed1
cd $W && for w in $DATA/out/vi/*.wav; do n=$(basename $w .wav)
  RAYON_NUM_THREADS=2 target/release/latency-bench speaker-eval --wav $w --vad-model $VAD --speaker-model $MODEL \
    --embeddings-out $DATA/out/vi/$n.emb.json --out $DATA/out/vi/$n.jsonl; done
# chấm một bản ghi với ngưỡng bất kỳ, từ cache (không cần model hay WAV)
$W/target/release/latency-bench speaker-eval --embeddings-in $DATA/out/vi/<tên>.emb.json --theta 0.35 --merge-theta 1.10 --out <ra>.jsonl
$DATA/venv/bin/python -I $B/score_spk.py <ra>.jsonl $DATA/out/vi/<tên>.rttm
cd $B && $DATA/venv/bin/python tune.py $W/target/release/latency-bench $DATA/out/vi \
  --dev cv-vi-01,cv-vi-02,cv-vi-01-opus,cv-vi-02-opus \
  --test cv-vi-03,cv-vi-04,cv-vi-05,cv-vi-06,cv-vi-03-opus,cv-vi-04-opus,cv-vi-05-opus,cv-vi-06-opus --out $DATA/out/tune-vi.json
cd $B && $DATA/venv/bin/python -B -m unittest test_build_cv_vi                                 # test của script dựng
```

Các bảng nhạy theo θ, hiệu Opus, cosine tâm cụm và ma trận nhầm lẫn ở trên do script tạm tính từ cùng cache nhúng (gọi `tune.evaluate` và
`score_spk`), không nằm trong thư mục này; chạy lại bằng đúng các lệnh trên với từng θ cho ra các số của bảng chính.
