# Nhận giọng qua `speaker-worker` thật (A-spk1, A-spk2)

Kế hoạch 02b, Task 2. Chạy lại A-spk1 (AMI) và A-spk2 (tiếng Việt) bằng đúng đường của app: `latency-bench speaker-eval --worker`
cắt đoạn như app rồi gửi từng đoạn cho tiến trình `speaker-worker` qua `pipeline::speaker_client` (giao thức, PCM 16 bit, B',
A2 4 s đầu), chấm bằng `score_spk.py` như kế hoạch 01. Mọi số dưới đây lấy từ đầu ra của các lệnh ở mục "Chạy lại"; MB là 10^6 byte
(như `ram.md` và ngân sách 250 MB của spec §11). Phần trăm ghi một chữ số thập phân; chỗ sát ngưỡng ghi thêm số đoạn đúng trên tổng.

## Kết luận ngắn

- **A-spk1: đạt** (theo trung bình 4 bản ghi kiểm, cách đọc chủ dự án chốt 2026-10-26): dòng ≥ 1 s **91,6%** (≥ 85%), mọi dòng
  **84,8%** (≥ 80%). So với mốc A2 4 s đầu của kế hoạch 01 (91,8% / 84,9%): −0,2 / −0,1 điểm. Ba bản ghi giống mốc từng đoạn; riêng
  EN2002a.Mix-Headset kém hơn 4 đoạn (≥ 1 s) và 5 đoạn (mọi dòng). Theo từng bản ghi (chỉ để biết, không phải mức đạt): mọi dòng của
  EN2002a là 762/959 = 79,5%, thiếu 6 đoạn so với mức 80% (mốc A2 4 s thiếu 1).
- **A-spk2: đạt** (theo trung bình 8 bản ghi kiểm): dòng ≥ 1 s **93,9%** (≥ 85%), đúng bằng mốc nhúng cả đoạn của kế hoạch 01; nhãn
  của cả 8 bản ghi trùng mốc từng đoạn. Theo từng hội thoại vẫn như kế hoạch 01: 7/8 bản ≥ 85%, cv-vi-05 Opus 67,7% (hai người gộp
  một giọng). Đây là lần đầu đo A2 4 s trên tiếng Việt, nhưng dữ liệu gần như không có đoạn dài hơn 4 s nên A2 hầu như không cắt gì.
- **Độ trễ:** mọi lần khứ hồi xong ≤ 230 ms (2 438/2 438 đoạn có nhúng mỗi lượt, hai lượt); chậm nhất 224,3 ms (EN2002a, lượt 2),
  tức biên chỉ còn 5,7 ms khi máy đang tải 4–8.
- **Ngân sách tải (spec §11): không đạt trọn.** RAM ≤ 250 MB: **vượt ở 2/12 bản ghi** (cv-vi-05 Opus 259,8 và 257,4 MB ở cả hai lượt;
  ES2004a.Array1-01 251,5 MB ở lượt 1, 247,9 MB ở lượt 2). CPU ≤ 8% một lõi: AMI trung bình 7,6% (đạt), nhưng ES2004a.Array1-01
  8,01–8,10% và **mọi bản tiếng Việt 8,28–8,62%** (trung bình 8,4–8,5%): **vượt**. Nguyên nhân khả dĩ ở mục "Tải của worker".

## Điều kiện đo

- Máy: Apple M4 Pro (12 lõi: 8 hiệu năng, 4 tiết kiệm; 24 GB), macOS 26.6.2, Rust 1.98.1. Máy có người dùng khác trong lúc đo:
  `uptime` (trung bình 1 phút) 4,00–7,92 trên 12 lõi qua mọi lượt (ghi từng lượt ở bảng tải). Mỗi lúc chỉ chạy một phép đo.
- Bản build: `target/release/latency-bench` và `target/release/speaker-worker` dựng sẵn trước Task này, ở Task 1 (release,
  `MACOSX_DEPLOYMENT_TARGET=14.2`, `otool` đọc `minos 14.2` ở cả hai), nhánh `phan-biet-nguoi-noi`, commit nền `046c41e6` (trên
  `8ecbcf8a`) cộng các thay đổi chưa commit của kế hoạch 01–02. Task này không dựng lại (Step 1 bỏ qua): không file nguồn `.rs` hay
  `Cargo.toml` nào mới hơn hai binary.
- Worker: `RAYON_NUM_THREADS=2` do client đặt (log worker ghi "2 luồng tính toán"), θ = 0,35, gộp 1,10 (tắt), B', A2 4 s đầu
  (`MAX_EMBED_SAMPLES`), PCM 16 bit qua giao thức (`pcm_from_f32`), thời lượng thật của đoạn gửi kèm. Đoạn gửi tuần tự (chờ `Assign`
  rồi mới gửi đoạn sau), không theo nhịp thời gian thật, nên worker luôn bận; `overload_after` đặt 1 giờ.
- Cắt đoạn như app: `SileroVad` (`silero_vad_v6.2.3.onnx`) và `Segmenter` ngắt câu 50 ms (mặc định). Model nhúng: ERes2Net sau
  `onnxsim`, SHA-256 `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e`.
- Khứ hồi: từ lúc gửi `Segment` tới lúc nhận `Assign` (gồm nhúng). RSS đỉnh và CPU của tiến trình worker lấy mẫu mỗi 100 ms bằng
  `sysinfo` từ lúc worker sẵn sàng (không tính nạp model) tới hết lượt; RSS lấy mẫu nên đỉnh thật có thể cao hơn một chút. CPU "% một
  lõi" là CPU của worker chia tổng thời lượng thật của các đoạn có nhúng (≥ 500 ms).
- Mỗi bản ghi chạy **hai lượt** (lượt 1 là số chính thức, lượt 2 để kiểm lặp lại). Điểm và nhãn của hai lượt giống nhau từng đoạn ở
  cả 12 bản ghi (độ tin lệch 0,0): đường worker là tất định. Không lượt nào có worker chạy lại hay tắt (lệnh báo lỗi nếu có).
- Dữ liệu và chia kiểm: như `nhan-giong-ami.md` (4 bản ghi kiểm AMI) và `nhan-giong-tieng-viet.md` (hội thoại 03–06 seed 0, bản thường
  và Opus). Kết quả thô ở `$DATA/out/02/{ami,vi}/` (lượt 2 ở `lan2/`), ngoài repo.

## A-spk1: AMI, 4 bản ghi kiểm

Mỗi ô: dòng ≥ 1 s (đúng/tổng), mọi dòng (đúng/tổng), thời lượng, giọng/người. Mốc là dòng "A2, 4 s đầu" của `ram.md` (cùng θ 0,35,
không gộp, nhúng trong tiến trình bằng f32).

| Bản ghi | ≥ 1 s | Mọi dòng | Thời lượng | Giọng/người | Mốc A2 4 s đầu (≥ 1 s / mọi dòng / thời lượng / giọng) | Lệch |
|---|---|---|---|---|---|---|
| IS1009a.Mix-Headset | 89,6% (147/164) | 85,7% (215/251) | 75,0% | 5/4 | 89,6 / 85,7 / 75,0 / 5 | 0 |
| EN2002a.Mix-Headset | 86,5% (436/504) | **79,5% (762/959)** | 64,3% | 8/4 | 87,3 (440/504) / 80,0 (767/959) / 64,6 / 8 | −0,8 / −0,5 / −0,3 |
| IS1009a.Array1-01 | 96,2% (154/160) | 85,3% (215/252) | 78,9% | 4/4 | 96,2 / 85,3 / 78,9 / 4 | 0 |
| ES2004a.Array1-01 | 94,2% (161/171) | 88,7% (275/310) | 79,5% | 6/4 | 94,2 / 88,7 / 79,5 / 6 | 0 |
| **Trung bình** | **91,6%** | **84,8%** | 74,4% | | 91,8 / 84,9 / 74,5 | −0,2 / −0,1 / −0,1 |

Đầu ra Step 3: `4 91.6 84.8 [8, 6, 4, 5]`. Để so thêm: nhúng cả đoạn (Task 7 kế hoạch 01) trung bình 92,0% / 85,1%, EN2002a mọi dòng
769/959.

**Vì sao EN2002a lệch.** Trung bình lệch dưới 0,5 điểm, nhưng EN2002a lệch 0,8 điểm ở dòng ≥ 1 s nên đã tìm nguyên nhân:

- Ranh giới 961 đoạn giống hệt mốc, thứ tự đoạn giống (gửi tuần tự theo chỉ số). 947/961 đoạn cùng nhãn; 14 đoạn khác nhãn, rải rác
  từ đoạn 416 tới 943, không lan thành dây chuyền, vẫn 8 giọng. Trong 14 đoạn, 4 đoạn có độ tin 0,351–0,356 ở một bên (sát θ = 0,35),
  4 đoạn có độ tin 0 ở cả hai bên (lấy nhãn của đoạn ngay trước) nên đổi theo đoạn đó.
- Nhúng trong tiến trình bằng f32 chạy lại hôm nay (cùng binary, `--max-embed-s 4`) trùng cache kế hoạch 01 từng bit (cả nhãn lẫn độ tin).
  Worker hai lượt cũng trùng nhau từng bit. Vậy độ lệch là hệ thống, không phải nhiễu giữa các lần chạy.
- Đầu vào khác nhau duy nhất là PCM 16 bit của giao thức. WAV 16 bit được đọc thành k/32768; `pcm_from_f32` nhân 32767 rồi cắt về
  phía 0 (`as i16`), worker chia 32767, nên gần như mọi mẫu khác 0 co 1 LSB về 0 (EN2002a: 31 874 332 trên 31 874 369 mẫu khác 0 đổi;
  RMS tín hiệu 452 LSB, tức sai lệch cỡ −53 dB so với tín hiệu). Ở ba bản ghi giống mốc, độ tin của các đoạn cùng nhãn vẫn lệch
  (trung bình 1,3e-4 và 3,1e-4 ở hai bản IS1009a; 5,6e-3 ở ES2004a.Array1-01, gồm vài đoạn có độ tin 0 ở một bên): nhúng đổi ít, chỉ
  đủ lật các đoạn sát ngưỡng. EN2002a là bản ghi có nhiều đoạn sát ngưỡng nhất (đã thấy ở
  bảng nhạy θ của `nhan-giong-ami.md`: 0,35 → 0,37 mất 2 đoạn).
- Chưa chứng minh trực tiếp được bằng cách nhúng f32 trên âm thanh đã qua đúng phép đổi đó: VAD cũng chạy trên âm thanh này và cắt
  ra 960 đoạn thay vì 961, nên không so từng đoạn được (riêng điều này cho thấy sai lệch 1 LSB đủ đổi một ranh giới VAD).
- App cũng gửi PCM 16 bit (cùng công thức với `asr-worker`), nên số của worker mới là số đại diện cho app. Không có bằng chứng làm
  tròn thay cho cắt sẽ cho điểm cao hơn; chiều lệch (kém đi) ở EN2002a nhiều khả năng là ngẫu nhiên của các ca sát ngưỡng.

## A-spk2: tiếng Việt, 8 bản ghi kiểm

Mốc là bảng θ = 0,35 của `nhan-giong-tieng-viet.md` (nhúng cả đoạn, trong tiến trình, f32).

| Hội thoại | Bản | ≥ 1 s | Mọi dòng | Thời lượng | Giọng/người | Mốc ≥ 1 s (nhúng cả đoạn) | Lệch |
|---|---|---|---|---|---|---|---|
| cv-vi-03 | thường | 97,8% (87/89) | 91,5% | 93,7% | 3/3 | 97,8% (87/89) | 0 |
| cv-vi-04 | thường | 98,9% (94/95) | 94,8% | 93,1% | 3/3 | 98,9% (94/95) | 0 |
| cv-vi-05 | thường | 94,7% (89/94) | 89,6% | 93,4% | 4/4 | 94,7% (89/94) | 0 |
| cv-vi-06 | thường | 97,7% (86/88) | 88,1% | 91,2% | 4/3 | 97,7% (86/88) | 0 |
| cv-vi-03 | Opus | 97,7% (86/88) | 92,4% | 93,9% | 3/3 | 97,7% (86/88) | 0 |
| cv-vi-04 | Opus | 99,0% (95/96) | 94,9% | 93,1% | 3/3 | 99,0% (95/96) | 0 |
| cv-vi-05 | Opus | **67,7% (63/93)** | 66,4% | 67,5% | 3/4 | 67,7% (63/93) | 0 |
| cv-vi-06 | Opus | 97,7% (84/86) | 88,2% | 92,0% | 3/3 | 97,7% (84/86) | 0 |
| **Trung bình 8 bản** | | **93,9%** | 88,2% | 89,7% | | 93,9% | 0 |
| Trung bình thường / Opus | | 97,3% / 90,5% | | | | 97,3% / 90,5% | |
| Số bản ≥ 85% (dòng ≥ 1 s) | | 7/8 | | | | 7/8 | |

Đầu ra Step 4: `8 93.9 [97.7, 97.8, 99.0, 98.9, 67.7, 94.7, 97.7, 97.7]` (thứ tự tên file: Opus trước bản thường của cùng hội thoại).

Nhãn của worker trùng nhãn nhúng cả đoạn từng đoạn ở cả 8 bản ghi (ranh giới giống hệt; độ tin lệch trung bình 1,3e-3 đến 4,2e-3 do
PCM 16 bit và đoạn dài hơn 4 s). **A2 4 s gần như không được thử trên dữ liệu này:** mỗi hội thoại có 0–1 đoạn dài hơn 4 s (dài nhất
5,06 s), đoạn có nhúng trung bình 1,3–1,7 s, phần A2 cắt bỏ 0–0,5% thời lượng tiếng nói. Kết quả "A2 4 s trên tiếng Việt bằng nhúng cả
đoạn" chỉ đúng cho lời đọc theo câu ngắn; người nói tiếng Việt liên tục với đoạn dài chưa có số.

## Tải của worker

Mỗi ô: lượt 1 / lượt 2. "Tải máy" là `uptime` trung bình 1 phút trước → sau lượt. "Phần nhúng" là tổng min(độ dài, 4 s) chia tổng
thời lượng các đoạn có nhúng, tức phần việc còn lại sau A2.

| Bản ghi | Đoạn có nhúng | Đoạn TB / phần nhúng | Khứ hồi p50 (ms) | p90 (ms) | Chậm nhất (ms) | Xong ≤ 230 ms | RSS đỉnh (MB) | CPU % một lõi | Tải máy |
|---|---|---|---|---|---|---|---|---|---|
| IS1009a.Mix-Headset | 226 | 2,42 s / 88,1% | 92,6 / 90,8 | 201,7 / 193,2 | 211,4 / 211,3 | 226/226, 226/226 | 198,0 / 199,3 | 7,49 / 7,30 | 4,40→4,37 / 4,79→4,49 |
| EN2002a.Mix-Headset | 756 | 2,05 s / 89,3% | 75,7 / 76,6 | 191,3 / 192,0 | 214,9 / 224,3 | 756/756, 756/756 | 163,1 / 163,6 | 7,50 / 7,49 | 4,37→5,45 / 4,49→5,01 |
| IS1009a.Array1-01 | 227 | 2,22 s / 89,3% | 87,3 / 87,3 | 192,2 / 197,1 | 205,3 / 208,0 | 227/227, 227/227 | 207,6 / 213,5 | 7,47 / 7,48 | 5,45→7,92 / 5,01→4,61 |
| ES2004a.Array1-01 | 255 | 1,86 s / 96,0% | 75,5 / 77,1 | 183,4 / 186,5 | 201,6 / 201,4 | 255/255, 255/255 | **251,5** / 247,9 | **8,01 / 8,10** | 7,92→7,45 / 4,61→4,37 |
| cv-vi-03 | 107 | 1,67 s / 100% | 77,5 / 78,8 | 134,7 / 135,1 | 188,3 / 188,1 | 107/107, 107/107 | 181,9 / 183,9 | **8,39 / 8,48** | 6,64→6,14 / 4,00→4,22 |
| cv-vi-04 | 129 | 1,57 s / 99,5% | 75,3 / 75,5 | 128,6 / 131,4 | 201,8 / 201,1 | 129/129, 129/129 | 234,0 / 232,7 | **8,39 / 8,47** | 6,14→5,64 / 4,22→4,17 |
| cv-vi-05 | 114 | 1,71 s / 100% | 77,2 / 78,7 | 142,2 / 144,9 | 190,8 / 199,2 | 114/114, 114/114 | 243,3 / 243,0 | **8,34 / 8,46** | 5,64→5,62 / 4,17→4,42 |
| cv-vi-06 | 135 | 1,34 s / 100% | 63,6 / 63,0 | 113,4 / 119,7 | 184,4 / 182,8 | 135/135, 135/135 | 178,2 / 186,6 | **8,56 / 8,62** | 5,62→5,25 / 4,42→4,89 |
| cv-vi-03 Opus | 108 | 1,66 s / 100% | 77,8 / 76,4 | 136,2 / 137,3 | 200,9 / 197,7 | 108/108, 108/108 | 184,8 / 181,4 | **8,52 / 8,46** | 5,25→5,06 / 4,89→5,01 |
| cv-vi-04 Opus | 131 | 1,55 s / 99,5% | 74,1 / 76,7 | 129,2 / 130,7 | 192,4 / 200,7 | 131/131, 131/131 | 211,3 / 215,8 | **8,39 / 8,56** | 5,06→4,83 / 5,01→5,32 |
| cv-vi-05 Opus | 115 | 1,69 s / 100% | 77,2 / 76,2 | 142,7 / 141,3 | 197,1 / 199,8 | 115/115, 115/115 | **259,8 / 257,4** | **8,49 / 8,38** | 4,83→4,47 / 5,32→6,21 |
| cv-vi-06 Opus | 135 | 1,33 s / 100% | 61,3 / 61,4 | 110,7 / 112,2 | 167,1 / 166,7 | 135/135, 135/135 | 173,8 / 173,9 | **8,39 / 8,28** | 4,47→4,47 / 6,21→5,86 |
| **AMI, trung bình CPU / RSS lớn nhất** | | | | | | | 251,5 / 247,9 | 7,62 / 7,59 | |
| **Tiếng Việt, trung bình CPU / RSS lớn nhất** | | | | | | | 259,8 / 257,4 | 8,43 / 8,46 | |

So với ngân sách spec §11 (`speaker-worker` trên M4 Pro: RAM ≤ 250 MB, CPU trung bình ≤ 8% một lõi khi người nói liên tục) và với mốc
chạy lâu của kế hoạch 01 (`ram.md`, B' + A2 4 s, IS1009a.Mix-Headset 452 lần, worker chạy một mình trong tiến trình thử: RSS
198,0–208,2 MB, p50 89,8–90,7 ms, p90 190,7–198,0 ms, CPU 7,25–7,36%, 452/452 ≤ 230 ms, chậm nhất 200,9–205,2 ms):

- **Cùng bản ghi IS1009a.Mix-Headset, worker thật khớp mốc:** RSS 198,0–199,3 MB, p50 90,8–92,6 ms, p90 193,2–201,7 ms, CPU
  7,30–7,49%. Giao thức và tiến trình riêng thêm rất ít (CPU 0–0,2 điểm, p50 0–3 ms; chênh nằm trong nhiễu của máy đang tải).
- **Độ trễ: đạt.** Mọi đoạn có nhúng xong ≤ 230 ms ở cả 24 lượt (2 × 2 438 lần). Nhưng lần chậm nhất 224,3 ms (EN2002a, lượt 2),
  chậm hơn mức 200,9–205,2 ms của kế hoạch 01; biên chỉ còn 5,7 ms (2,5%) khi máy tải 4–8. Chưa đo khi chạy cùng `asr-worker`,
  `llama-server` (Task 4, 5).
- **RAM: không đạt ở 2/12 bản ghi.** cv-vi-05 Opus 259,8 / 257,4 MB (vượt ~10 MB, 4%, cả hai lượt); ES2004a.Array1-01 251,5 MB ở
  lượt 1 (247,9 MB ở lượt 2). Các bản còn lại 163,1–243,3 MB. RSS đỉnh không theo độ dài bản ghi (EN2002a dài 36 phút: 163 MB;
  cv-vi-05 Opus dài 5 phút: 260 MB) và lặp lại khá sát giữa hai lượt (chênh tối đa 8,4 MB), nên có lẽ phụ thuộc chuỗi cỡ đoạn mà allocator macOS gặp
  (giống hiện tượng vùng malloc rỗng vẫn thường trú ở `ram.md`); **đây là giả thuyết, chưa kiểm**. Mốc 198–208 MB của kế hoạch 01 chỉ
  đo trên một bản ghi nên đã đánh giá thấp mức đỉnh. Soak ≥ 1 giờ (Task 5) sẽ có vết RSS theo thời gian.
- **CPU: không đạt trên tiếng Việt và ES2004a.Array1-01; đạt theo trung bình AMI.** CPU mỗi giây tiếng nói đi theo phần việc A2 còn
  để lại: ba bản AMI có phần nhúng 88–89% cho 7,30–7,50%; ES2004a.Array1-01 96% cho 8,01–8,10%; tiếng Việt 99,5–100% cho 8,28–8,62%,
  ngang mức B' nhúng cả đoạn không A2 của kế hoạch 01 (8,25–8,30%, `ram.md`) cộng thêm phần cố định mỗi đoạn (đoạn tiếng Việt ngắn,
  1,3–1,7 s). Tức ngân sách 8% chỉ đạt khi đủ nhiều đoạn dài hơn 4 s (người nói liên tục như spec ghi); với hội thoại lượt ngắn, worker
  cần khoảng 8,3–8,6% một lõi mỗi giây tiếng nói. Yếu tố chưa tách được: worker chạy pool tính toán ở QoS `utility` và máy đang tải 4–8,
  nên một phần việc có thể chạy trên lõi tiết kiệm (tốn thời gian CPU hơn cho cùng việc).
- CPU ở đây tính trên thời lượng tiếng nói, không phải giờ đồng hồ; trong cuộc họp thật có khoảng lặng nên CPU theo giờ thấp hơn (Task 5
  ghi số đó). Không dùng điều này để coi là đạt.

**Cần chủ dự án quyết** (không tự đổi ngân sách hay mã): (1) RAM ≤ 250 MB đang vượt tới ~260 MB ở một bản ghi: nâng ngân sách, hay
tìm cách giảm (allocator, giới hạn khác), hay chờ số soak của Task 5; (2) CPU ≤ 8%: giữ mức này kèm điều kiện "đoạn dài" và ghi thêm
số cho hội thoại lượt ngắn (~8,5%), hay đổi ngân sách, hay giảm tải (ví dụ A2 3 s, bỏ nhúng đoạn ngắn: đều đổi độ chính xác, xem
`ram.md` và spec §14).

## Kết luận

| Mục | Mức đạt | Kết quả | Kết luận |
|---|---|---|---|
| A-spk1 (AMI, 4 bản ghi kiểm, theo trung bình) | ≥ 1 s ≥ 85%, mọi dòng ≥ 80% | 91,6% / 84,8% | **Đạt** |
| A-spk1 theo từng bản ghi (chỉ để biết) | như trên | EN2002a mọi dòng 79,5% (762/959, thiếu 6 đoạn) | không đạt (mốc A2 4 s: thiếu 1) |
| A-spk2 (tiếng Việt, 8 bản ghi kiểm, theo trung bình) | ≥ 1 s ≥ 85% | 93,9% | **Đạt** |
| A-spk2 theo từng hội thoại (chỉ để biết) | như trên | 7/8 bản, thấp nhất 67,7% | không đạt (như kế hoạch 01) |
| Nhận giọng xong trước nhận dạng | ≤ 230 ms | 4 876/4 876, chậm nhất 224,3 ms | **Đạt**, biên mỏng |
| RAM `speaker-worker` (spec §11) | ≤ 250 MB | 163,1–259,8 MB | **Không đạt** ở 2/12 bản ghi |
| CPU `speaker-worker` (spec §11) | ≤ 8% một lõi | AMI TB 7,6% (8,0–8,1% ở ES2004a.Array1-01); tiếng Việt 8,28–8,62% | **Không đạt** trên tiếng Việt và một bản AMI |

Biên của A-spk1 theo trung bình: dòng ≥ 1 s hơn mức 6,6 điểm, mọi dòng hơn 4,8 điểm. So với kế hoạch 01, chất lượng nhận giọng qua
worker thật không thụt lùi ngoài mức lệch nhỏ do PCM 16 bit ở một bản ghi sát ngưỡng.

## Chạy lại

```sh
W=...  M=...  DATA=...   # đặt theo máy của bạn
B=$W/bench/2026-10-26-nguoi-noi
# Step 1 (Task 1 đã dựng; chỉ chạy nếu nguồn đổi)
cd $W && df -h . | tail -1 && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release -p latency-bench -p speaker-worker 2>&1 | tail -1
# Step 2: AMI, 4 bản ghi kiểm (A-spk1)
cd $W && VAD=$M/models/silero_vad_v6.2.3.onnx MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx && \
for n in IS1009a.Mix-Headset EN2002a.Mix-Headset IS1009a.Array1-01 ES2004a.Array1-01; do
  target/release/latency-bench speaker-eval --wav $DATA/ami/$n.wav --vad-model $VAD --speaker-model $MODEL \
    --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 --out $DATA/out/02/ami/$n.jsonl \
    | tee $DATA/out/02/ami/$n.summary.txt
  $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/02/ami/$n.jsonl $DATA/out/$n.rttm > $DATA/out/02/ami/$n.score.json
done; cat $DATA/out/02/ami/*.score.json
# Step 3: trung bình (glob chỉ thấy lượt 1; lượt 2 để ở thư mục con lan2/)
cd $W && $DATA/venv/bin/python -I -c "import json,glob; s=[json.load(open(f)) for f in sorted(glob.glob('$DATA/out/02/ami/*.score.json'))]; print(len(s), round(100*sum(x['line_1s'] for x in s)/len(s),1), round(100*sum(x['line_all'] for x in s)/len(s),1), [x['voices'] for x in s])"
# Step 4: tiếng Việt, 8 bản ghi kiểm (A-spk2)
cd $W && VAD=$M/models/silero_vad_v6.2.3.onnx MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx && \
for n in cv-vi-03 cv-vi-04 cv-vi-05 cv-vi-06 cv-vi-03-opus cv-vi-04-opus cv-vi-05-opus cv-vi-06-opus; do
  target/release/latency-bench speaker-eval --wav $DATA/out/vi/$n.wav --vad-model $VAD --speaker-model $MODEL \
    --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 --out $DATA/out/02/vi/$n.jsonl \
    | tee $DATA/out/02/vi/$n.summary.txt
  $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/02/vi/$n.jsonl $DATA/out/vi/$n.rttm > $DATA/out/02/vi/$n.score.json
done && $DATA/venv/bin/python -I -c "import json,glob; s=[json.load(open(f)) for f in sorted(glob.glob('$DATA/out/02/vi/*.score.json'))]; print(len(s), round(100*sum(x['line_1s'] for x in s)/len(s),1), [round(100*x['line_1s'],1) for x in s])"
# So từng đoạn với mốc kế hoạch 01: chấm lại cache (không cần model), rồi so nhãn hai file JSONL theo thứ tự đoạn
cd $W && target/release/latency-bench speaker-eval --embeddings-in $DATA/out/cap4/<tên>.emb.json --theta 0.35 --merge-theta 1.1 --out <ra>.jsonl   # AMI, A2 4 s đầu
cd $W && target/release/latency-bench speaker-eval --embeddings-in $DATA/out/vi/<tên>.emb.json --theta 0.35 --merge-theta 1.1 --out <ra>.jsonl    # tiếng Việt, nhúng cả đoạn
```

Lượt 2 chạy đúng các lệnh Step 2 và Step 4 với tên ra `<tên>.lan2.*`, sau đó dời vào `$DATA/out/02/{ami,vi}/lan2/`. Trước và sau mỗi
bản ghi ghi `uptime` vào `<tên>.uptime.txt`. Các bảng so từng đoạn, phân bố độ dài đoạn và khứ hồi chậm nhất do script tạm tính từ các
file JSONL này (không nằm trong thư mục này).

## Kiểm bổ sung theo thời gian thực

Phần này nằm ngoài kế hoạch, làm ngày 2026-10-27 sau soak (Task 5). Ở trên, hai bản ghi vượt 250 MB khi gửi đoạn liền nhau:
cv-vi-05 Opus (259,8 / 257,4 MB) và ES2004a.Array1-01 (251,5 / 247,9 MB). Soak phát theo thời gian thực thì chỉ lên 141,8 MB; riêng
IS1009a là 197 MB khi gửi liền nhau, 137 MB theo thời gian thực. Phần này kiểm thẳng hai bản ghi đã vượt, phát theo thời gian thực
như app. Không dựng lại gì, không sửa mã.

**Kết luận: theo thời gian thực, RSS của `speaker-worker` không vượt 250 MB ở cả hai bản ghi.** Đỉnh là 147,6–198,0 MB qua 5 lượt,
còn cách mức 250 MB ít nhất 52 MB. Cùng đầu vào, đỉnh theo thời gian thực thấp hơn khi gửi liền nhau 23–41%. Như vậy hai lần vượt
250 MB ở bảng "Tải của worker" là hệ quả của cách đo gửi liền nhau, không phải mức app gặp (khớp với soak). Hàng RAM của bảng "Kết
luận" ở trên vẫn đúng cho cách đo đó; theo thời gian thực thì đạt trên hai bản ghi này.

**Cách đo.** Dùng `latency-bench session` như Task 4/5: `Engine::start_with_speaker` với `asr-worker` (Metal), `llama-server` b11669
(Hy-MT2 1.8B Q8_0) và `speaker-worker` thật, phát WAV theo thời gian thực, `--end-silence-ms 50`, `--rss-trace` mỗi 5 s, truth rỗng
`[]` (không tính A2). Dùng cùng binary với Task 1–5, máy và bản dựng như mục "Điều kiện đo". Đầu vào như sau:

- cv-vi-05 Opus dài 305 s nên giữ nguyên file (trùng file của Task 2). Hai lượt với `--target en`: nguồn tiếng Việt, dịch sang
  tiếng Anh như một cuộc họp thật. Với `--target vi` lượt này sẽ bỏ bước dịch, `llama-server` không chạy.
- ES2004a.Array1-01 dài 1049 s nên cắt 300 s đầu (`ffmpeg -t 300`), chạy hai lượt với `--target vi`. Để so cùng đầu vào, chạy thêm
  hai lượt gửi liền nhau (`speaker-eval --worker`, như Task 2) trên đúng file đã cắt. Kết quả là 214,7 MB, tức đỉnh 251,5 MB của Task
  2 rơi sau giây 300. Vì vậy chạy thêm một lượt theo thời gian thực trên **cả bản ghi** (1049 s).

RSS đỉnh lấy từ vết 5 s (`--rss-trace`). Ở cả 5 lượt, số này trùng với đỉnh của bộ lấy mẫu 0,5 s của `session`
(`usage.speaker-worker`, đã đổi MiB sang MB). Khứ hồi là số `session` in ra: tính trên **mọi** đoạn gửi cho worker, kể cả đoạn ngắn
không nhúng. Khứ hồi của `speaker-eval` chỉ tính đoạn có nhúng, nên hai loại p50/p90 không so thẳng được. "Tải máy" là `uptime`
trung bình 1 phút, trước → sau lượt.

| Bản ghi (đầu vào) | Cách gửi | Lượt | RSS đỉnh (MB) | Footprint đỉnh (MB) | Khứ hồi p50 / p90 (ms) | ≤ 230 ms | Tải máy |
|---|---|---|---|---|---|---|---|
| cv-vi-05 Opus (305 s) | liền nhau (Task 2) | 1 / 2 | **259,8 / 257,4** | | 77,2 / 142,7; 76,2 / 141,3 | 115/115, 115/115 | 4,83→4,47 / 5,32→6,21 |
| cv-vi-05 Opus (305 s) | thời gian thực | 1 | 198,0 (giây 48) | 218,4 | 103,1 / 170,0 | 125/125 | 1,23→1,99 |
| cv-vi-05 Opus (305 s) | thời gian thực | 2 | 191,1 (giây 228) | 163,4 | 96,0 / 161,3 | 125/125 | 1,37→2,01 |
| ES2004a.Array1-01 (1049 s) | liền nhau (Task 2) | 1 / 2 | **251,5** / 247,9 | | 75,5 / 183,4; 77,1 / 186,5 | 255/255, 255/255 | 7,92→7,45 / 4,61→4,37 |
| ES2004a.Array1-01 (1049 s) | thời gian thực | 1 | 147,6 (giây 710) | 145,9 | 93,0 / 204,3 | **306/315** | 3,66→2,67 |
| ES2004a.Array1-01 (300 s đầu) | liền nhau | 1 / 2 | 214,7 / 214,8 | | 62,9 / 113,5; 62,8 / 121,2 | 51/51, 51/51 | 2,31→2,17 / 2,17→2,32 |
| ES2004a.Array1-01 (300 s đầu) | thời gian thực | 1 | 164,8 (giây 186) | 151,2 | 70,3 / 138,9 | 65/65 | 1,99→1,37 |
| ES2004a.Array1-01 (300 s đầu) | thời gian thực | 2 | 154,6 (giây 187) | 167,1 | 92,9 / 156,2 | 65/65 | 2,01→2,31 |

- **Cùng đầu vào, đỉnh RSS giảm khi phát theo thời gian thực:** cv-vi-05 Opus từ 257,4–259,8 xuống 191,1–198,0 MB (−23 đến −26%);
  ES2004a.Array1-01 cả bản ghi từ 247,9–251,5 xuống 147,6 MB (−40 đến −41%); 300 s đầu từ 214,7–214,8 xuống 154,6–164,8 MB (−23 đến −28%).
  Soak trên IS1009a cho mức giảm tương tự (197 → 137 MB, −30%). RSS theo thời gian thực dao động lên xuống theo đoạn và không tăng
  dần. Ví dụ ở ES2004a cả bản ghi, đỉnh của mỗi 100 s nằm trong khoảng 68,5–147,6 MB, không mẫu nào trên 200 MB.
- **Lặp lại:** giữa các lượt chạy cùng đầu vào theo thời gian thực, đỉnh lệch tới khoảng 20 MB. Với 300 s đầu của ES2004a.Array1-01,
  hai lượt riêng cho 164,8 và 154,6 MB, còn 300 s đầu của lượt cả bản ghi cho 141,6 MB. Cả bản ghi ES2004a chỉ chạy một lượt. Tính
  cả độ lệch này, đỉnh cao nhất (198,0 MB) vẫn cách 250 MB khoảng 50 MB.
- **Footprint** (`phys_footprint`) có lúc cao hơn RSS: cv-vi-05 Opus lượt 1 lên 218,4 MB trong khi RSS là 198,0 MB. Số này vẫn dưới
  250 MB. Spec §11 và các bảng ở trên tính theo RSS; footprint chỉ ghi để biết.
- **Độ trễ (ghi để biết, không phải mục tiêu của phần này):** ở lượt ES2004a.Array1-01 cả bản ghi, 9/315 khứ hồi vượt 230 ms (p90
  204,3 ms) và 1 nhãn đến sau chữ (314/315 trước chữ). Lượt này chạy cùng `asr-worker` và `llama-server`, máy tải 2,7–3,7. Gửi liền
  nhau khi worker chạy một mình thì 255/255 lần ≤ 230 ms. Hiện tượng này khớp với soak (96,6% ≤ 230 ms, 6/2135 nhãn muộn). Bốn lượt
  dài 300–305 s đều 100% ≤ 230 ms và không có nhãn muộn.
- **CPU theo giờ đồng hồ** (`usage.speaker-worker.avg_cpu_percent`, chỉ để biết): cv-vi-05 Opus 6,68 / 6,60%; ES2004a.Array1-01
  300 s đầu 2,58 / 2,82%; cả bản ghi 4,62%. Phần này không đánh giá ngân sách CPU (xem soak: dùng số lệnh và năng lượng).
- **Điều kiện:** máy M4 Pro như trên, tải lúc bắt đầu 1,2–3,7, thấp hơn lúc đo Task 2 (4–8). RSS ít phụ thuộc tải, nhưng không loại
  trừ hẳn được ảnh hưởng của tải. Cả 5 lượt `session` thoát mã 0, không tiến trình phụ nào khởi động lại (`sidecar_restarts` 0),
  `feed_lag_max_ms` 17,3–88,1 (dưới ngưỡng cảnh báo 100 ms). Trước mỗi lượt không có tiến trình đo nào của phiên khác.
  Không đụng Teams, Chrome, âm lượng, micro.

Chạy lại (dữ liệu thô, script `chay.sh` và `phan-tich.py` ở `$DATA/out/02/rss-thoi-gian-thuc/`, ngoài repo):

```sh
R=$DATA/out/02/rss-thoi-gian-thuc; L=<llama-server b11669>; echo '[]' > $R/rong.truth.json
ffmpeg -loglevel error -y -i $DATA/ami/ES2004a.Array1-01.wav -t 300 -ar 16000 -ac 1 -c:a pcm_s16le $R/ES2004a.Array1-01-300s.wav
# một lượt theo thời gian thực (<wav>: cv-vi-05-opus.wav với --target en; ES2004a.Array1-01-300s.wav hay cả bản ghi với --target vi)
cd $W && target/release/latency-bench session --wav <wav> --truth $R/rong.truth.json --asr-worker target/release/asr-worker \
  --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server $L --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf \
  --languages en,zh,ja,ko,vi --target <en|vi> --end-silence-ms 50 \
  --speaker-worker target/release/speaker-worker --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx \
  --rss-trace $R/<tên>.rss.tsv --out $R/<tên>.json
# gửi liền nhau trên đúng file đã cắt (như Task 2)
cd $W && target/release/latency-bench speaker-eval --wav $R/ES2004a.Array1-01-300s.wav --vad-model $M/models/silero_vad_v6.2.3.onnx \
  --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --worker target/release/speaker-worker --theta 0.35 --merge-theta 1.1 \
  --out $R/ES2004a.Array1-01-300s.b2b-1.jsonl
python3 -I $R/phan-tich.py $R
```
