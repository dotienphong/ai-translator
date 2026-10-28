# Tốc độ và RAM của nhận giọng trên macOS (A-spk1, spec §11)

Kế hoạch 01, Task 9. Đo thời gian nhúng một đoạn, CPU và RAM của `Embedder` (ERes2Net trên `candle-onnx`, CPU, f32) trong lệnh
`latency-bench speaker-eval` trên macOS, để so với ngân sách ở spec `2026-10-26-phan-biet-nguoi-noi-design.md` mục 11 (CPU trung
bình ≤ 5% một lõi trên M4 Pro khi người nói liên tục; RAM ≤ 150 MB) và với thời gian nhận dạng (~230 ms mỗi đoạn trên M4 Pro,
spec §4.4). Mọi số dưới đây lấy từ đầu ra của `latency-bench speaker-eval` (dòng tóm tắt và file JSONL `--out`) và của
`/usr/bin/time -l`; MB là 10^6 byte. Phần Windows i5 để trống, chờ Task 13.

## Model

- File: `eres2net-sv-en-voxceleb-16k.onnx` (ERes2Net VoxCeleb, bản đã `onnxsim`, Task 1).
- Cỡ: 26.496.496 byte (26,5 MB).
- SHA-256: `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e` (tính lại bằng `shasum -a 256` trên file thật lúc đo).

## Điều kiện đo

- Máy: Apple M4 Pro, 12 lõi (8 lõi hiệu năng và 4 lõi tiết kiệm điện), 24 GB RAM, macOS 26.6.2. Cắm điện (`pmset`: AC Power, pin
  100%, đã sạc đầy).
- Bản build: `cargo build --release -p latency-bench` (Rust 1.98.1) trên nhánh `phan-biet-nguoi-noi`, commit nền `046c41e6` cộng
  các thay đổi chưa commit của kế hoạch 01. Binary được dựng lại ngay trước khi đo vì `speaker_eval.rs` mới hơn binary có sẵn.
- Số luồng: biến `RAYON_NUM_THREADS` (1 hoặc 2). Số đo cho thấy biến này có tác dụng: từ 1 lên 2 luồng, p50 mỗi đoạn giảm từ
  141 xuống 92–93 ms trong khi tổng CPU gần như không đổi (xem mục CPU). Không đo với số luồng mặc định (12).
- Dữ liệu: `IS1009a.Mix-Headset.wav` của AMI (838,8 s). Cắt đoạn đúng như app (`SileroVad` và `Segmenter`, ngắt câu 50 ms): 261
  đoạn, 226 đoạn có nhúng (≥ 500 ms), tổng thời lượng của 226 đoạn đó là 547,6 s (65,3% của cuộc họp), đoạn dài nhất 7,936 s
  (giới hạn của `Segmenter` là 8 s), thời lượng trung bình 2,42 s. Mọi lần chạy đều cho 261 đoạn, 226 có nhúng, 6 giọng.
- "Thời lượng tiếng nói" ở các bảng dưới là thời lượng của các đoạn có nhúng, đúng như dòng tóm tắt của lệnh. Thời gian nhúng của
  một đoạn (`embed_ms`) gồm cả tính fbank.
- Mỗi cấu hình đo 2 lần (trừ lần đo bão hòa, xem dưới); ghi cả hai lần. Hai lần lệch nhau hơn 5% ở đúng một số: p90 của 2 luồng
  (263,8 so với 279,4 ms, lệch 5,9%). Mọi số đã so khác (p50, max, p90 còn lại, các nhóm độ dài, CPU, RAM) lệch nhau tối đa 4,5%
  (p50 của nhóm 4–6 s, 1 luồng: 417,0 so với 399,1 ms).
- Máy đang được dùng trong lúc đo: các dịch vụ hệ thống (Storage Management, Microsoft Defender) chiếm khoảng 22–28% tổng CPU
  (`top`: 72–80% rảnh) suốt các lần đo thường; tôi không tắt chúng. Hai lần của mỗi cấu hình khớp nhau (xem trên), nhưng nhiễu nền có
  mặt ở mọi lần đo nên số tuyệt đối có thể chậm hơn chút ít so với một máy rảnh hoàn toàn.

## Thời gian nhúng mỗi đoạn

Cả cuộc họp (226 đoạn có nhúng). "Nhúng xong ≤ 230 ms" là số đoạn có `embed_ms` ≤ 230 trên 226.

| Cấu hình | Lần | p50 (ms) | p90 (ms) | max (ms) | Thời gian nhúng / thời lượng tiếng nói | Nhúng xong ≤ 230 ms |
|---|---|---|---|---|---|---|
| 1 luồng | a | 141,3 | 421,3 | 683,3 | 8,1% (8,10%) | 155 (68,6%) |
| 1 luồng | b | 141,0 | 429,6 | 666,5 | 8,1% (8,11%) | 156 (69,0%) |
| 2 luồng | a | 92,4 | 263,8 | 423,0 | 5,2% (5,22%) | 195 (86,3%) |
| 2 luồng | b | 93,4 | 279,4 | 429,9 | 5,3% (5,29%) | 194 (85,8%) |
| 2 luồng, 4 tiến trình `yes` | a | 94,5 | 274,8 | 428,8 | 5,3% (5,34%) | 194 (85,8%) |
| 2 luồng, 4 tiến trình `yes` | b | 94,3 | 272,4 | 427,3 | 5,3% (5,30%) | 195 (86,3%) |

Số trong ngoặc ở cột "thời gian nhúng / thời lượng tiếng nói" là tính lại từ JSONL (tổng `embed_ms` chia tổng thời lượng) để thấy
chữ số thập phân thứ hai; dòng tóm tắt của lệnh chỉ in một chữ số.

Theo độ dài đoạn (từ JSONL; mỗi ô là lần a / lần b; thời gian tính bằng ms):

| Độ dài đoạn | Số đoạn | 1 luồng p50 | 1 luồng p90 | 1 luồng max | 2 luồng p50 | 2 luồng p90 | 2 luồng max | Xong ≤ 230 ms, 1 luồng | Xong ≤ 230 ms, 2 luồng |
|---|---|---|---|---|---|---|---|---|---|
| 0,5–2 s | 126 | 85,7 / 84,9 | 141,3 / 141,0 | 156,8 / 154,3 | 59,3 / 61,2 | 92,4 / 93,4 | 101,6 / 100,0 | 126 / 126 | 126 / 126 |
| 2–4 s | 64 | 237,6 / 240,5 | 303,2 / 308,8 | 328,4 / 322,2 | 150,5 / 154,8 | 189,5 / 194,5 | 206,6 / 209,1 | 29 / 30 | 64 / 64 |
| 4–6 s | 22 | 417,0 / 399,1 | 481,7 / 474,1 | 487,9 / 494,9 | 258,8 / 256,9 | 301,7 / 307,5 | 307,1 / 315,3 | 0 / 0 | 5 / 4 |
| 6–8 s | 14 | 598,4 / 600,7 | 642,2 / 643,2 | 683,3 / 666,5 | 373,8 / 380,2 | 405,2 / 397,5 | 423,0 / 429,9 | 0 / 0 | 0 / 0 |

Chi phí tỉ lệ gần tuyến tính với độ dài đoạn: 81,0 ms mỗi giây tiếng nói với 1 luồng, 52,2 ms mỗi giây với 2 luồng (lần a), và
tỉ lệ "thời gian nhúng / thời lượng" của từng nhóm độ dài chỉ dao động 7,9–8,4% (1 luồng) và 5,1–5,5% (2 luồng). Vì vậy đoạn
dài (6–8 s) tốn tối đa 0,42–0,43 s với 2 luồng và 0,67–0,68 s với 1 luồng.

Với 2 luồng, đoạn bắt đầu vượt 230 ms ở khoảng 4,4 s (230 ÷ 52,2 ms mỗi giây); với 1 luồng ở khoảng 2,8 s. Trong cuộc họp này số
đoạn có thời lượng ≥ 4,4 s là 31 trên 226 (13,7% số đoạn, 34,4% thời lượng tiếng nói) và ≥ 2,8 s là 74 trên 226 (32,7% số đoạn,
62,2% thời lượng tiếng nói).

## Khi máy bận

Kế hoạch dặn chạy 4 tiến trình `yes > /dev/null` song song để mô phỏng nhận dạng, dịch và app họp, rồi đo lại với 2 luồng (hai dòng
cuối của bảng trên). Kết quả: không đổi so với 2 luồng lúc thường (p50 94,5 và 94,3 so với 92,4 và 93,4 ms; p90 274,8 và 272,4
so với 263,8 và 279,4 ms; 5,3% và 5,3% so với 5,2% và 5,3%).

Lưu ý: 4 tiến trình `yes` chỉ chiếm khoảng 3 lõi của 12 (`top` ngay trước lúc đo: 48,7% rảnh, 6,2% user, 45,2% sys; `yes` chủ yếu
tốn thời gian hệ thống), nên không tranh lõi với 2 luồng nhúng. Tải này không làm máy bão hòa; nó cho thấy kết quả không đổi khi
còn lõi trống chứ không cho biết gì về lúc hết lõi.

Phép đo thêm, ngoài kế hoạch, để thấy lúc hết lõi: 12 tiến trình `yes` (bằng số lõi, `top`: 0,0% rảnh, 97,2% sys), 2 luồng, **chỉ một
lần**. Kết quả: p50 1579,9 ms, p90 1966,9 ms, max 2252,5 ms, thời gian nhúng / thời lượng tiếng nói 64,5% (64,47%), không đoạn nào
xong ≤ 230 ms, thời gian chạy 362,6 s (so với 34,0–34,8 s lúc thường), CPU tổng 89,1 s (so với 52–53 s). Lần đo thứ hai tôi dừng
sau khoảng 4 phút vì máy không còn lõi rảnh (tải trung bình hơn 124); số của lần đó không dùng. Đây là tải
cực đoan, không giống một cuộc họp thật (nhận dạng và dịch chạy chủ yếu trên GPU); số này chỉ cho thấy khi 2 luồng nhúng bị giành hết
CPU thì mỗi đoạn chậm hơn khoảng 17 lần ở p50, và đúng là tình huống mà phần "Khi quá tải" của spec §11 (bỏ đoạn, tạm dừng) phải xử lý.

## CPU

Lệnh tự đo `embed_ms` theo thời gian thực (wall-clock), nên với 2 luồng con số "5,2–5,3%" là phần thời gian đồng hồ dành cho nhúng, **không
phải mức dùng CPU**: trong lúc nhúng, 2 luồng cùng chạy. Để có mức dùng CPU thật, lấy CPU tổng của tiến trình (`user` + `sys` của
`/usr/bin/time -l`) trừ CPU nền của cùng lệnh trên một WAV im lặng dài 838,8 s (Silero chạy hết cuộc họp, nạp model và chạy thử, không có
đoạn nào để nhúng): nền là 5,54 và 5,51 s (1 luồng), 5,42 và 5,62 s (2 luồng); lấy trung bình mỗi cặp. Phần CPU còn lại là của nhúng (gồm fbank).

| Cấu hình | Lần | Thời gian chạy | CPU tổng (user + sys) | CPU nhúng ước tính | % một lõi theo mỗi giây tiếng nói (547,6 s) | % một lõi theo mỗi giây cuộc họp (838,8 s) |
|---|---|---|---|---|---|---|
| 1 luồng | a | 49,74 s | 49,68 s | 44,2 s | 8,06% | 5,26% |
| 1 luồng | b | 50,28 s | 50,24 s | 44,7 s | 8,17% | 5,33% |
| 2 luồng | a | 34,04 s | 51,97 s | 46,5 s | 8,48% | 5,54% |
| 2 luồng | b | 34,66 s | 52,77 s | 47,3 s | 8,63% | 5,63% |
| 2 luồng, 4 tiến trình `yes` | a | 34,84 s | 53,01 s | 47,5 s | 8,67% | 5,66% |
| 2 luồng, 4 tiến trình `yes` | b | 34,65 s | 52,66 s | 47,1 s | 8,61% | 5,62% |
| 2 luồng, 12 tiến trình `yes` (một lần) | a | 362,59 s | 89,11 s | 83,6 s | 15,27% | 9,97% |

Nền của các dòng "máy bận" lấy từ lần đo im lặng lúc thường (chưa đo nền khi máy bận), nên các dòng này kém chắc hơn.

Cách đọc:

- Với 1 luồng, thời gian đồng hồ của nhúng (44,34 và 44,43 s) khớp CPU nhúng ước tính (44,2 và 44,7 s), nên cách trừ nền là hợp lý.
- Với 2 luồng, tổng CPU nhúng (46,5–47,3 s) chỉ hơn 1 luồng (44,2–44,7 s) khoảng 4–7%, còn thời gian đồng hồ giảm từ 44,3–44,4 s xuống
  28,6–29,0 s: hai luồng rút ngắn độ trễ mỗi đoạn mà gần như không tốn thêm CPU.
- Trong cuộc họp AMI này người nói chiếm 65,3% thời gian. Khi người nói liên tục (điều kiện của ngân sách), mức dùng CPU là số ở cột "mỗi giây
  tiếng nói": 8,06–8,17% một lõi (1 luồng), 8,48–8,63% một lõi (2 luồng).

## RAM

`maximum resident set size` và `peak memory footprint` của `/usr/bin/time -l` (MB; byte chia 10^6). Mỗi ô ghi lần a / lần b.

| Phép đo | RSS đỉnh | Peak footprint |
|---|---|---|
| Đọc cache nhúng (`--embeddings-in`): không model, không WAV, không Silero | 10,5 / 10,5 | 2,7 / 2,7 |
| WAV im lặng 1 s: nạp model nhúng và Silero, chạy thử 1 s (không đoạn nào) | 228,1 / 228,1 | 218,8 / 218,8 |
| WAV im lặng 838,8 s: như trên cộng cả WAV trong bộ nhớ, không đoạn nào (bốn lần: 1 luồng và 2 luồng, mỗi loại hai lần) | 339,3 đến 340,2 | 330,1 đến 331,0 |
| Đoạn dài 1,92 s (WAV 2,6 s, một đoạn nhúng) | 341,8 / 342,1 | 332,5 / 332,8 |
| Đoạn dài 3,71 s (WAV 4,6 s, một đoạn nhúng) | 579,6 / 579,6 | 570,4 / 570,5 |
| Đoạn dài 7,90 s (WAV 8,6 s, một đoạn nhúng) | 1092,4 / 1104,1 | 1083,7 / 1095,4 |
| Đoạn 140 s liền của cuộc họp (47 đoạn, 41 có nhúng, trong đó đoạn dài nhất 7,94 s), 2 luồng | 1497,9 / 1503,2 | 1487,8 / 1493,0 |
| Cả cuộc họp 838,8 s, 1 luồng | 1541,5 / 1539,1 | 1350,6 / 1310,4 |
| Cả cuộc họp 838,8 s, 2 luồng | 1555,9 / 1542,5 | 1544,7 / 1531,3 |
| Cả cuộc họp, 2 luồng, 4 tiến trình `yes` | 1479,8 / 1474,4 | 1320,6 / 1284,1 |
| Cả cuộc họp, 2 luồng, 12 tiến trình `yes` (một lần) | 1369,9 | 1373,2 |

Cách đọc:

- **Đường cơ sở "không model":** chạy `--embeddings-in` chỉ cho thấy tiến trình trống (10,5 MB), vì chế độ này cũng bỏ qua WAV và Silero. Mốc dùng được để
  trừ là hai dòng im lặng: nạp model và Silero rồi chạy thử 1 s đã tốn 228,1 MB; cộng WAV cả cuộc họp trong bộ nhớ thì 339,3–340,2 MB, tức chênh 111–112 MB
  (gồm WAV đã nạp vào bộ nhớ; không tách riêng các phần khác). Vì thế số 1,54 GB của cả cuộc họp là cận trên cho phần nhúng, nhưng trừ phần WAV vẫn còn khoảng 1,4 GB.
- **RAM theo độ dài đoạn (một đoạn mỗi lần chạy, WAV nhỏ):** 1,92 s: 342 MB; 3,71 s: 580 MB; 7,90 s: 1092–1104 MB. Mỗi giây đoạn thêm tốn khoảng
  122–133 MB (từ 1,92 s lên 3,71 s tăng 238 MB; từ 3,71 s lên 7,90 s tăng 513–525 MB).
- **Tiến trình chạy lâu tốn nhiều hơn một lần nhúng đơn lẻ:** đoạn 140 s (nhiều đoạn, gồm đoạn 7,94 s, WAV chỉ 4,5 MB) cho 1,50 GB, nhiều hơn
  khoảng 0,4 GB so với đoạn 7,90 s chạy một mình (1,09–1,10 GB). Phần dôi ra không đến từ WAV. Nguyên nhân (bộ nhớ đã trả không được hệ điều hành
  lấy lại giữa các lần gọi, hay các tensor trung gian của những lần gọi trước chưa được giải phóng hết lúc đo đỉnh) chưa được khảo sát; để Task 9b.
- Peak footprint ở cả cuộc họp: 1 luồng 1,31–1,35 GB, 2 luồng 1,53–1,54 GB; nghĩa là mức đỉnh khác nhau theo số luồng và theo lần chạy ở cỡ vài trăm MB.

## So với ngân sách (spec §11)

Trên M4 Pro, mọi số lấy từ các bảng trên.

| Ngân sách | Đo được | Kết luận |
|---|---|---|
| CPU `speaker-worker` trung bình ≤ 5% một lõi khi người nói liên tục | Nhúng tốn 8,06–8,17% một lõi (1 luồng) và 8,48–8,63% một lõi (2 luồng) mỗi giây tiếng nói; 5,26–5,33% và 5,54–5,63% nếu tính theo mỗi giây của cuộc họp AMI này (người nói 65,3% thời gian). Thời gian đồng hồ của nhúng với 2 luồng là 5,22–5,29% thời lượng tiếng nói | **Không đạt** theo điều kiện "người nói liên tục". Ngay cả theo mỗi giây cuộc họp AMI, cả hai cấu hình đều trên 5%. Chưa tính chi phí giao thức, đọc cây giao diện, Windows |
| RAM ≤ 150 MB | Chỉ nạp model, Silero và chạy thử 1 s đã 228,1 MB; một đoạn 7,9 s đỉnh 1,09–1,10 GB; nhiều đoạn liên tiếp đỉnh 1,50 GB (140 s) tới 1,54–1,56 GB (cả cuộc họp) | **Không đạt**, vượt gấp 1,5 lần ngay lúc mới nạp, gấp khoảng 7 lần ở đoạn 8 s đơn lẻ và 10 lần khi chạy lâu |
| Nhận giọng xong trước nhận dạng (~230 ms mỗi đoạn) | Số đoạn nhúng xong ≤ 230 ms: 195 và 194 trên 226 (86,3% và 85,8%) với 2 luồng; 155 và 156 (68,6% và 69,0%) với 1 luồng. p50 92,4–93,4 ms (2 luồng). p90 263,8–279,4 ms (2 luồng), tức quá 230 ms. Đoạn 6–8 s: p50 373,8–380,2 ms, p90 397,5–405,2 ms, max 423,0–429,9 ms, không đoạn nào xong ≤ 230 ms | **Đạt với đoạn ngắn, không đạt với đoạn dài.** Với 2 luồng, mọi đoạn dưới 4 s xong trước 230 ms (190 trên 190 đoạn), 5 và 4 trên 22 đoạn 4–6 s xong trước 230 ms, không đoạn 6–8 s nào. Con số "~100 ms" trong spec §4.4 đúng cho p50 (92–93 ms) chứ không đúng cho đoạn dài |

Về ý nghĩa của kết luận thứ ba: tôi không có thời gian nhận dạng của chính các đoạn này (230 ms là số của spec), và thời gian nhận dạng cũng có thể
tăng theo độ dài đoạn nên đoạn dài chưa chắc bị vượt như phép so sánh với một hằng số. Theo spec §4.3 pipeline không bao giờ chờ nhãn nên chậm hơn nhận
dạng không làm chậm phụ đề; nhãn đến muộn thì đi qua sự kiện `subtitle://speaker` (§4.3), và luật ghép câu §4.4 coi đoạn chưa có nhãn là `None`.

Số 1 luồng cho thấy một phương án không dùng song song sẽ không kịp: p50 141,3 ms và chỉ 68,6–69,0% số đoạn xong ≤ 230 ms.

## Phần Windows i5

Chờ Task 13 (chưa đo; ngân sách là CPU ≤ 10% một lõi, RAM ≤ 150 MB).

## Chạy lại

```
cd $W && RAYON_NUM_THREADS=<1|2> /usr/bin/time -l target/release/latency-bench speaker-eval \
  --wav $DATA/ami/IS1009a.Mix-Headset.wav --vad-model $M/models/silero_vad_v6.2.3.onnx \
  --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --out <file.jsonl>
```

Các WAV nền và đoạn ngắn (im lặng 1 s và 838,8 s, các đoạn cắt từ AMI) tạo bằng `ffmpeg` (`anullsrc` cho im lặng, `-ss`/`-t` cho đoạn cắt). Nền CPU lấy từ WAV
im lặng cùng cách chạy. Tải giả: `yes > /dev/null` chạy nền, tắt bằng `pkill -x yes` sau khi đo (kiểm `pgrep -x yes` rỗng trước và sau).
