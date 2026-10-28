# RAM và CPU của nhúng giọng: các cách giảm (Task 9b)

Kế hoạch 01, Task 9b. Task 9 (`toc-do.md`) cho thấy nhúng giọng ERes2Net trên `candle-onnx` không đạt cả hai ngân sách của spec
`2026-10-26-phan-biet-nguoi-noi-design.md` §11 (CPU ≤ 5% một lõi trên M4 Pro khi người nói liên tục; RAM ≤ 150 MB). File này đo
từng cách giảm RAM và CPU, tìm nguyên nhân RSS khi chạy lâu cao hơn một lần nhúng đơn lẻ, rồi khuyến nghị cho kế hoạch 02. Mọi số
lấy từ đầu ra của các lệnh ở mục "Chạy lại"; MB là 10^6 byte. Spec không đổi ở đây: phần ngân sách chỉ là đề xuất cho Task 15 và
chủ dự án.

## Tóm tắt

- **Nguyên nhân chính của RAM** đúng như dự đoán: `simple_eval` của candle-onnx 0.11.0 giữ mọi tensor trung gian tới hết lượt.
  Bỏ mỗi tensor ngay sau lần dùng cuối (cách B, vá thư viện; hay cách B', chia đồ thị và gọi `simple_eval` từng nút, chỉ dùng API
  công khai; B' đã đo cả với candle-onnx 0.11.0 lấy thẳng từ crates.io, **không vá**) cho nhúng **giống hệt từng bit** bản gốc và
  hạ RSS đỉnh của một đoạn 8 s từ 1069–1305 MB xuống 181–212 MB.
- **Khi đưa cả đoạn 8 s vào model một lượt, không cách nào trên candle-onnx giữ được RAM ≤ 150 MB.** Chỉ nạp model (sau lần chạy
  thử 1 s) đã khoảng 100 MB; một lần nhúng 8 s với B' là 181–196 MB; chạy lâu cả cuộc họp (đoạn thật tới 7,94 s) là 411–465 MB.
  Dưới 150 MB chỉ thấy khi không đưa cả 8 s vào một lượt: B' + A theo cửa sổ (20 lần cùng đoạn 8 s: cửa sổ 2 s 124–125 MB, cửa sổ
  1 s 112–116 MB; nhưng chạy lâu với cửa sổ 2 s là 166 MB, và tụt độ chính xác ở một bản ghi), hay B' + A2 3 s (chạy lâu 147,3–149,1
  MB qua ba lần của tôi, kiểm độc lập 151,5 và 163,5 MB: **xấp xỉ 150 MB, dao động tới ~164 MB, không đảm bảo**; kèm tụt độ chính
  xác nhẹ).
- **RSS chạy lâu cao hơn vì allocator của macOS giữ bộ nhớ đã trả**, không phải vì tensor bị giữ: sau mỗi lần nhúng malloc chỉ
  còn dùng ~41 MB (không tăng qua 452 lần), nhưng `vmmap` thấy 840 MB vùng malloc **rỗng** vẫn bẩn và thường trú (bản gốc); đổi sang
  mimalloc thì phần dôi ra từ +400–440 MB còn +60–85 MB.
- **CPU không giảm** khi giải phóng tensor (8,0–8,3% một lõi so với 8,1–8,7%). Chỉ hai thứ giảm được CPU: (1) chỉ nhúng tối đa 4 s
  của mỗi đoạn (cách A2: 7,3% trên cuộc họp AMI, mọi lần nhúng xong ≤ 230 ms trên một bản ghi, xem giới hạn ở dưới, độ chính xác
  gần như không đổi); (2) bật Apple Accelerate cho phép nhân ma trận của candle (chỉ macOS, ngoài kế hoạch): 4,9–5,2%, cộng A2 4 s
  là 4,6%. onnxruntime (mốc, không đề xuất) tốn 1,9%.
- **Khuyến nghị chính cho kế hoạch 02:** B' (chạy đồ thị từng nút, trọng số chuyển một lần) + A2 4 s. Đo được: chạy lâu 198–208 MB,
  CPU 7,3% một lõi mỗi giây tiếng nói, độ chính xác trung bình −0,2 điểm, và 452/452 lần nhúng xong ≤ 230 ms ở cả bốn lần đo (hai
  bằng `probe`, hai bằng bản không vá). Giới hạn của "452/452": chỉ một bản ghi (IS1009a, 226 đoạn riêng biệt chạy hai vòng, nên 452
  không phải 452 mẫu độc lập), chỉ M4 Pro, worker chạy một mình (không có `asr-worker`, `llama-server` cùng lúc); đoạn chậm nhất
  201–205 ms, chỉ cách ngưỡng 230 ms 25–29 ms (11–13%). Cần chủ dự án quyết ngân sách thực tế (đề xuất ở cuối file).

## Điều kiện đo

- Máy: Apple M4 Pro, 12 lõi, 24 GB, macOS 26.6.2, cắm điện (AC Power, pin 100%, đã sạc đầy). Trong lúc đo có các dịch vụ hệ thống
  chạy nền (Storage Management, ApplicationsStorage, epsext, Microsoft Defender), tổng cộng khoảng 1,5–2 lõi, như ở Task 9; tôi
  không tắt chúng. Mỗi lúc chỉ chạy một phép đo; các lượt nhúng lại để chấm độ chính xác chạy riêng, không xen với phép đo RAM/CPU.
- Model: `eres2net-sv-en-voxceleb-16k.onnx` (sau `onnxsim`), 26.496.496 byte, SHA-256
  `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e`. Đồ thị: 349 nút (96 Conv, 64 Clip, 48 Add, 38 Mul, 29 Concat,
  16 Split, …), 198 initializer (26.392.016 byte `raw_data`), không có graph lồng (If/Loop/Scan).
- Bản build: release của workspace (`lto = true`, `codegen-units = 1`, `panic = "abort"`), Rust 1.98.1, nhánh `phan-biet-nguoi-noi`
  (commit nền `046c41e6` cộng các thay đổi chưa commit của kế hoạch 01). `RAYON_NUM_THREADS=2` ở mọi lần đo.
- Hai công cụ:
  - `latency-bench embed-probe` (trong repo, Step 1): đọc đúng đoạn cần đo khỏi WAV, nạp `Embedder`, nhúng lặp `--repeat` lần.
  - `probe` (dự án thí nghiệm ngoài repo, thư mục `ram-probe/` trong thư mục dữ liệu): cùng việc, thêm các chế độ `orig` (candle-onnx
    như bản gốc), `free` (cách B), `weights` (B + trọng số một lần), `chunked` (cách B'), chế độ chạy lâu trên các đoạn thật của một
    cuộc họp, và vết bộ nhớ sau mỗi lần nhúng. `probe` dùng cùng profile release, cùng `candle-core` 0.11.0 với cùng feature mặc
    định; ở chế độ `orig` nó cho số khớp `embed-probe` (bảng Step 2), nên so trong cùng `probe` là công bằng. `probe` link bản
    candle-onnx đã vá (`[patch.crates-io]`); chế độ `orig` và `chunked` chạy với công tắc `FREE_INTERMEDIATES` tắt (hành vi như gốc).
  - `probe-registry` (dự án thí nghiệm riêng `ram-probe-registry/`, thêm ở vòng sửa): cùng mã nhưng link candle-onnx 0.11.0 thẳng
    từ crates.io, không `[patch]`, không công tắc; chỉ có `orig` và `chunked`. Dùng để xác nhận B' không cần bản vá.
- Đoạn đo: cắt từ `IS1009a.Mix-Headset.wav` (AMI), bắt đầu ở giây 120, dài 2, 3, 4, 8 s (tiếng nói thật). Chạy lâu: 226 đoạn có
  nhúng của chính bản ghi này (cắt bởi `SileroVad` + `Segmenter` như app, lấy ranh giới từ cache nhúng của Task 7; 547,6 s tiếng
  nói; đoạn dài nhất 7,94 s), một lượt (226 lần) hay hai lượt (452 lần, 1095,2 s).
- RSS đỉnh: "maximum resident set size" của `/usr/bin/time -l`. `probe` in thêm `ri_lifetime_max_phys_footprint` và, sau mỗi lần
  nhúng, RSS hiện tại cùng `malloc_zone_statistics` (byte malloc đang dùng và đang giữ).
- CPU mỗi lần nhúng: CPU (user + sys) của cả tiến trình trước và sau vòng nhúng, chia số lần; "% một lõi" là CPU đó chia độ dài
  đoạn (tức % một lõi khi người nói liên tục với đoạn dài như vậy). `probe` và các bảng Step 2, Step 4 (lần đo đầu) dùng
  `getrusage(RUSAGE_SELF)`; ở vòng sửa `embed-probe` chuyển sang `sysinfo` (`accumulated_cpu_time`, đo được cả Windows), và lần chạy
  lại cho % một lõi lệch số cũ tối đa 0,3 điểm (mục "Log"). p50, p90 là thời gian đồng hồ mỗi lần nhúng (gồm fbank).
- Mỗi cấu hình đo 2 lần, ghi cả hai (a / b). Riêng các lượt chạy lâu phụ, lượt có `--relief`, lượt mimalloc ba cấu hình cuối và
  lượt Accelerate + A2 chỉ chạy một lần (ghi rõ ở bảng). Các bảng Step 2, 3, 4 và mimalloc một lần 8 s chép từ đầu ra lúc đo (không
  lưu file); ở vòng sửa mỗi cấu hình được chạy lại một lần và lưu log (mục "Log", có so với số trong bảng).

## Step 2: mốc candle-onnx nguyên bản

`latency-bench embed-probe --repeat 20`, bốn lần cho 2, 4, 8 s (a, b, c, d), hai lần cho 3 s. Ô "RSS đỉnh" có nhiều số là các lần.

| Đoạn | RSS đỉnh (MB) | p50 (ms) | p90 (ms) | CPU mỗi lần (ms) | % một lõi |
|---|---|---|---|---|---|
| 2 s | 546,6 / 398,5 / 355,5 / 449,2 | 97,5 / 106,4 / 99,7 / 103,8 | 105,0 / 110,5 / 102,6 / 104,5 | 162,7 / 174,7 / 166,0 / 171,0 | 8,1–8,7 |
| 3 s | 691,6 / 691,6 | 151,8 / 146,9 | 156,9 / 150,9 | 251,0 / 243,7 | 8,1–8,4 |
| 4 s | 828,9 / 850,4 / 850,9 / 839,8 | 200,9 / 191,8 / 192,6 / 200,5 | 206,6 / 208,7 / 199,7 / 217,8 | 332,0 / 324,7 / 321,7 / 333,3 | 8,0–8,3 |
| 8 s | 1319,0 / 1309,7 / 1311,6 / 1318,1 | 410,2 / 396,1 / 404,3 / 412,4 | 418,5 / 414,6 / 412,3 / 422,1 | 670,4 / 661,1 / 667,4 / 678,2 | 8,3–8,5 |

Một lần nhúng đơn lẻ (`--repeat 1`, a / b): 1 s 228,5 / 229,3 MB (tức nạp model và chạy thử 1 s); 2 s 345,3 / 344,3 MB; 4 s
594,8 / 593,9 MB; 8 s 1160,8 / 1078,4 MB.

Cách đọc:

- Kế hoạch dự kiến xấp xỉ 0,5 / 0,7 / 1,3 GB; đo được 0,36–0,55 / 0,83–0,85 / 1,31–1,32 GB với 20 lần nhúng.
- 20 lần nhúng **cùng một đoạn** đã cho đỉnh cao hơn một lần (4 s: 829–851 so với 594 MB) và **lệch nhiều giữa các lần chạy** ở
  2 s (356–547 MB, lệch tới 54%), dù đầu vào giống hệt. Đây là dấu hiệu đầu tiên của hiệu ứng allocator (mục "Vì sao RSS chạy lâu
  cao hơn").
- CPU tuyến tính theo độ dài: khoảng 83 ms CPU mỗi giây đoạn (8,0–8,7% một lõi), khớp Task 9 (8,1–8,6%).

## Step 3: mốc onnxruntime

`rss_ort.py` (onnxruntime 1.31.0, Python 3.12.12, `intra_op_num_threads = 2`, fbank bằng `kaldi_native_fbank`), mỗi độ dài một tiến
trình, `--repeat 20`. RSS đỉnh gồm cả trình thông dịch Python và numpy: sau `import` đã 49,9–50,4 MB.

| Đoạn | RSS đỉnh cuối (MB) | Sau nạp model (MB) | p50 (ms) | p90 (ms) | CPU mỗi lần (ms) | % một lõi |
|---|---|---|---|---|---|---|
| 2 s | 139,6 / 140,0 | 114,5 / 114,2 | 18,7 / 18,7 | 19,3 / 19,2 | 37,7 / 37,5 | 1,9 / 1,9 |
| 4 s | 179,9 / 180,9 | 113,7 / 114,0 | 35,8 / 35,2 | 42,9 / 37,8 | 74,9 / 72,6 | 1,9 / 1,8 |
| 8 s | 256,4 / 267,6 | 115,8 / 128,0 | 74,6 / 74,7 | 81,0 / 78,2 | 151,2 / 149,6 | 1,9 / 1,9 |

Tắt CPU memory arena (một lần mỗi độ dài): 2 s 144,9 MB, 8 s 298,4 MB (không thấp hơn).

Cách đọc: onnxruntime nhanh hơn candle khoảng 5,3–5,5 lần (p50) và tốn ít CPU hơn 4,4 lần (1,9% so với 8,3% một lõi). Trừ ~50 MB
của Python, RAM của onnxruntime là ~90 MB (2 s) đến ~210 MB (8 s): **ngay cả onnxruntime cũng không đạt 150 MB với đoạn 8 s**. Đây
là mốc cho hướng onnxruntime (crate `ort` còn bản RC, trái spec chính §6.12; `sherpa-onnx` đóng gói onnxruntime), không phải đề xuất.

## Step 4: cách A, nhúng theo cửa sổ rồi lấy trung bình

`Embedder::embed_windowed` (có test) và cờ `--window-s` của `embed-probe`, `speaker-eval`. RAM/CPU (`embed-probe --repeat 20`):

| Đoạn, cửa sổ | RSS đỉnh (MB) | p50 (ms) | p90 (ms) | CPU mỗi lần (ms) | % một lõi |
|---|---|---|---|---|---|
| 4 s, cửa sổ 1 s | 331,9 / 332,1 | 216,8 / 226,5 | 234,8 / 229,8 | 346,1 / 354,7 | 8,7 / 8,9 |
| 8 s, cửa sổ 1 s | 331,3 / 331,8 | 428,8 / 431,9 | 450,8 / 434,9 | 678,5 / 678,1 | 8,5 / 8,5 |
| 4 s, cửa sổ 2 s | 548,0 / 521,1 | 207,9 / 202,2 | 214,6 / 210,3 | 341,1 / 334,9 | 8,5 / 8,4 |
| 8 s, cửa sổ 2 s | 550,6 / 565,9 | 417,2 / 411,8 | 425,0 / 428,6 | 685,5 / 676,8 | 8,6 / 8,5 |

Cosine giữa nhúng theo cửa sổ và nhúng cả đoạn (`embed-probe --cosine`, cùng đoạn tiếng nói thật):

| Đoạn | Cửa sổ 1 s | Cửa sổ 2 s |
|---|---|---|
| 2 s | 0,665840 | 1,000000 (một cửa sổ, đúng bằng `embed`) |
| 4 s | 0,817129 | 0,885112 |
| 8 s | 0,914735 | 0,954445 |

(Test `#[ignore]` với model thật trên fixture tổng hợp 6 s, cửa sổ 2 s: cosine 0,987574.)

Cách đọc: cửa sổ giới hạn RSS theo độ dài cửa sổ (8 s: 1310–1319 xuống 331 MB với cửa sổ 1 s, 551–566 MB với 2 s) nhưng **không giảm
CPU** (chi phí vẫn tỉ lệ tổng độ dài) và đổi nhúng (cosine 0,67–0,95 so với nhúng cả đoạn). Độ chính xác với cửa sổ 2 s: xem bảng
A-spk1 bên dưới.

## Step 4b: cách A2, chỉ nhúng tối đa X giây của đoạn dài

Cờ `--max-embed-s X` của `speaker-eval` (thời lượng dùng cho phân cụm vẫn là thời lượng thật của đoạn) và `--embed-from head|middle`
(X giây đầu, hay X giây ở giữa: bỏ đều hai đầu). RAM/CPU của một đoạn dài hơn X đúng bằng của đoạn X giây ở Step 2 (2 s, 3 s, 4 s).

Phần thời lượng tiếng nói còn phải nhúng, Σ min(d, X) / Σ d trên các đoạn có nhúng (từ cache của Task 7):

| Bản ghi | Tiếng nói có nhúng | X = 2 s | X = 3 s | X = 4 s |
|---|---|---|---|---|
| IS1009a.Mix-Headset | 547,6 s | 0,633 (100/226 đoạn dài hơn X) | 0,782 (68/226) | 0,881 (35/226) |
| EN2002a.Mix-Headset | 1548,2 s | 0,685 (264/756) | 0,815 (154/756) | 0,893 (88/756) |
| IS1009a.Array1-01 | 504,3 s | 0,670 (91/227) | 0,811 (54/227) | 0,893 (30/227) |
| ES2004a.Array1-01 | 474,0 s | 0,754 (89/255) | 0,896 (47/255) | 0,960 (20/255) |
| ES2004a.Mix-Headset | 612,8 s | 0,696 (117/301) | 0,835 (62/301) | 0,914 (37/301) |
| TS3003a.Mix-Headset | 623,9 s | 0,915 (74/454) | 0,979 (23/454) | 0,993 (5/454) |
| Cả 6 bản ghi | 4310,8 s | 0,719 | 0,846 | 0,916 |

Trên AMI, A2 giảm CPU ít (X = 4 s: còn 92%), vì phần lớn đoạn ngắn. Khi một người nói liên tục, đoạn thường dài (tới 8 s) nên A2
giảm nhiều hơn (một đoạn 8 s chỉ tốn như 4 s); chưa đo được trường hợp đó trên dữ liệu thật. Số CPU đo trực tiếp ở mục "Chạy lâu".

## Độ chính xác A-spk1 của các cách có đổi nhúng (A, A2)

Nhúng lại 4 bản ghi kiểm từ WAV (`speaker-eval --wav … --window-s 2` hay `--max-embed-s X [--embed-from middle]`, cache mới, không
ghi đè cache cũ), rồi chấm như `nhan-giong-ami.md`: `speaker-eval --embeddings-in … --theta 0.35 --merge-theta 1.1` + `score_spk.py`.
Cách B, B' không đổi nhúng (giống từng bit, xem dưới) nên giữ nguyên kết quả của `nhan-giong-ami.md`; B + A2 giống A2.

θ = 0,35, không gộp. Mỗi ô: dòng ≥ 1 s / mọi dòng / thời lượng / số giọng (người thật: 4).

| Cách | IS1009a.Mix-Headset | EN2002a.Mix-Headset | IS1009a.Array1-01 | ES2004a.Array1-01 | TB ≥ 1 s | TB mọi dòng | TB thời lượng |
|---|---|---|---|---|---|---|---|
| Nhúng cả đoạn (Task 7) | 89,6 / 85,7 / 75,0 / 5 | 87,3 / 80,2 / 64,9 / 8 | 96,9 / 85,7 / 79,1 / 4 | 94,2 / 88,7 / 79,5 / 6 | 92,0 | 85,1 | 74,6 |
| A, cửa sổ 2 s | 89,0 / 84,9 / 74,6 / 5 | 87,3 / 80,4 / 65,1 / 8 | 96,2 / 86,5 / 78,8 / 4 | 91,8 / 85,2 / 77,5 / 8 | 91,1 | 84,2 | 74,0 |
| A2, 2 s đầu | 90,9 / 88,8 / 76,6 / 8 | 84,7 / 78,0 / 62,3 / 8 | 93,8 / 83,3 / 76,8 / 6 | 92,4 / 86,5 / 77,9 / 8 | 90,4 | 84,2 | 73,4 |
| A2, 3 s đầu | 90,2 / 86,1 / 74,9 / 7 | 86,5 / 79,7 / 64,0 / 8 | 95,0 / 84,5 / 77,4 / 5 | 94,7 / 88,7 / 79,3 / 7 | 91,6 | 84,7 | 73,9 |
| A2, 3 s giữa | 89,0 / 85,3 / 74,6 / 5 | 86,3 / 79,5 / 63,6 / 8 | 96,9 / 85,7 / 78,6 / 4 | 93,6 / 88,1 / 79,1 / 6 | 91,4 | 84,6 | 74,0 |
| A2, 4 s đầu | 89,6 / 85,7 / 75,0 / 5 | 87,3 / 80,0 / 64,6 / 8 | 96,2 / 85,3 / 78,9 / 4 | 94,2 / 88,7 / 79,5 / 6 | 91,8 | 84,9 | 74,5 |
| A2, 4 s giữa | 89,6 / 85,7 / 74,9 / 5 | 86,9 / 80,1 / 64,2 / 8 | 96,9 / 85,7 / 78,6 / 4 | 93,6 / 88,4 / 79,3 / 6 | 91,7 | 85,0 | 74,3 |

"Mọi dòng" của EN2002a.Mix-Headset (959 đoạn tính điểm, cần ≥ 768 để đạt 80%), chỗ ràng buộc của A-spk1 theo từng bản ghi:

| Cách | θ = 0,35 | θ = 0,40 |
|---|---|---|
| Nhúng cả đoạn | 769 (đạt, hơn 1 đoạn) | 766 (thiếu 2) |
| A, cửa sổ 2 s | 771 (đạt) | 766 (thiếu 2) |
| A2, 2 s đầu | 748 (thiếu 20) | 721 (thiếu 47) |
| A2, 3 s đầu | 764 (thiếu 4) | 758 (thiếu 10) |
| A2, 3 s giữa | 762 (thiếu 6) | chưa chạy |
| A2, 4 s đầu | 767 (thiếu 1; 79,98%) | 765 (thiếu 3) |
| A2, 4 s giữa | 768 (vừa đủ) | chưa chạy |

Trung bình ở θ = 0,40 (≥ 1 s / mọi dòng): nhúng cả đoạn 92,0 / 85,1; cửa sổ 2 s 91,4 / 84,1; A2 2 s 89,8 / 82,9; A2 3 s 91,2 / 84,4;
A2 4 s 92,0 / 84,9.

Cách đọc:

- **A2 4 s: như nhúng cả đoạn trong sai số** (trung bình −0,2 điểm ở cả hai chỉ số với "đầu"; −0,3 / −0,1 với "giữa"; số giọng
  của cả 4 bản ghi y như nhúng cả đoạn). Theo cách đọc chặt nhất, "đầu" thiếu 1 đoạn trên 959 (nhúng cả đoạn hơn 1 đoạn), "giữa" vừa
  đủ: chênh 1–2 đoạn, đúng cỡ nhiễu đã thấy giữa θ 0,35 và 0,40 ở `nhan-giong-ami.md`. Không nên chọn "đầu" hay "giữa" theo chính
  phần kiểm này (chênh 1 đoạn và chọn trên phần kiểm là sai phương pháp).
- **A2 3 s: tụt nhẹ** (trung bình −0,4 điểm; EN2002a thiếu 4–6 đoạn, IS1009a.Mix-Headset 7 giọng thay vì 5 với "đầu").
- **A2 2 s: tụt rõ** (≥ 1 s trung bình −1,6 điểm; EN2002a ≥ 1 s 84,7% < 85% và mọi dòng thiếu 20 đoạn; 8 giọng ở 3/4 bản ghi). Loại.
- **A cửa sổ 2 s: trung bình tụt 0,9 điểm** cả hai chỉ số; EN2002a vẫn đạt (771), nhưng ES2004a.Array1-01 tụt 2,4 điểm (≥ 1 s) và
  3,5 điểm (mọi dòng), 8 giọng thay vì 6. Hơn ngưỡng "1–2 điểm" ở một bản ghi.

## Step 5: cách B, vá candle-onnx để bỏ tensor sau lần dùng cuối

Vá (ngoài repo, bản chép `candle-onnx` 0.11.0; trong `src/eval.rs` thêm 68 dòng, thay 2 dòng cũ): trước vòng duyệt nút,
`simple_eval_` tính với mỗi tên giá trị chỉ số nút dùng nó lần cuối (tên mà graph lồng của một nút dùng thì tính là dùng ở chính
nút đó; đầu ra không ai dùng thì bỏ ngay sau nút sinh ra nó; trừ đầu ra của graph); sau mỗi nút `values.remove` các tên đã hết
lần dùng. Trong graph lồng (nhánh `If`, gọi đệ quy với cùng bảng `values`) không bỏ gì, vì tên "dùng lần cuối" trong nhánh con có
thể còn được scope ngoài dùng.
Giới hạn: chỉ kiểm trên đồ thị ERes2Net (không có graph lồng). Initializer cũng được bỏ sau lần dùng cuối: candle-onnx 0.11.0 tạo
lại chúng từ `raw_data` ở mỗi lượt gọi (`get_tensor` → `Tensor::from_raw_buffer` → chép 26,4 MB mỗi lượt), nên bỏ là an toàn. Đọc
`eval.rs` cho thấy `Identity`, `Split` (`narrow`), `Reshape` trả tensor dùng chung bộ nhớ với đầu vào (đếm tham chiếu `Arc`), nên bỏ
một tên khỏi bảng chỉ giảm một tham chiếu; bộ nhớ chỉ được trả khi mọi tên trỏ tới nó đã bỏ. Các nút `Constant` (5 nút, đầu ra
được 64 nút `Clip` dùng) được giữ tới nút dùng cuối.

Biến thể đo thêm (ngoài kế hoạch, cùng dự án thí nghiệm):

- **B + trọng số một lần** (`weights`): lúc nạp, bỏ initializer khỏi graph, chuyển thành tensor một lần (`candle_onnx::eval::get_tensor`),
  mỗi lượt truyền vào như đầu vào (chép `Arc`, không chép dữ liệu).
- **B': chia đồ thị, không cần vá** (`chunked`, khúc 1 nút): lúc nạp, tách mỗi nút thành một graph con (đầu ra là các giá trị còn
  được nút sau dùng), tính tên nào hết lần dùng sau mỗi khúc, chuyển trọng số một lần; mỗi lượt gọi `candle_onnx::simple_eval` cho
  từng khúc và bỏ giá trị đã hết lần dùng. Chỉ dùng API công khai của candle-onnx 0.11.0; từ chối đồ thị có graph lồng. Các số B'
  trong bảng dưới và ở mục "Chạy lâu" (trừ dòng ghi "bản không vá") đo bằng `probe`, tức trên bản vá với công tắc tắt (`simple_eval`
  chạy như gốc). Để chắc B' không cần bản vá, đo lại bằng `probe-registry` (candle-onnx 0.11.0 từ crates.io): nhúng giống hệt từng
  bit chế độ `orig` cùng binary ở 2, 4, 8 s (lệch tối đa 0,00e0); 8 s × 20: 194,5 / 195,5 MB, p50 381,1 / 381,9 ms, p90 384,5 /
  386,6 ms, CPU 8,01 / 8,00% một lõi; một lần 8 s: 189,2 MB; chạy lâu B' + A2 4 s: xem mục "Chạy lâu". Một lượt kiểm độc lập
  (người rà, tự dựng bản không vá) ra số tương tự: 193,8 MB (8 s) và 199,2 MB (chạy lâu A2 4 s, 452/452 ≤ 230 ms, giống từng bit).
  Khúc 8 nút thử một lần (lượt kiểm nhanh, lúc máy đang chạy việc nhúng lại, nên chỉ dùng để so RSS): 4 s, `--repeat 2` đỉnh
  186,9 MB so với 153,9 MB của khúc 1 nút; nên dùng khúc 1.

Nhúng so với bản gốc (`probe --dump` ở chế độ `orig`, rồi `--compare`): `free`, `weights`, `chunked` ở 2 s và 8 s (`chunked` cả 4 s)
**lệch tối đa 0,00e0, tức giống hệt từng bit**; với cửa sổ 2 s, `free` và `chunked` cho cosine 1,000000 với `embed_windowed` của bản
gốc. Yêu cầu của kế hoạch (cosine ≥ 0,99999) đạt.

`probe --repeat 20` (a / b). "Sau nạp" là RSS sau khi nạp model và chạy thử 1 s.

| Cách | Đoạn | RSS đỉnh (MB) | p50 (ms) | p90 (ms) | CPU mỗi lần (ms) | % một lõi |
|---|---|---|---|---|---|---|
| Nguyên bản (`orig`; sau nạp 215,3–215,6) | 2 s | 339,5 / 538,4 | 100,0 / 103,7 | 102,5 / 107,4 | 165,2 / 171,1 | 8,26 / 8,55 |
| | 4 s | 847,7 / 849,9 | 197,0 / 197,9 | 205,2 / 204,8 | 328,5 / 328,2 | 8,21 / 8,21 |
| | 8 s | 1305,3 / 1302,4 | 407,3 / 407,8 | 421,5 / 416,7 | 674,3 / 673,9 | 8,43 / 8,42 |
| B (`free`; sau nạp 109,8–110,0) | 2 s | 121,3 / 144,5 | 98,0 / 101,1 | 99,1 / 102,7 | 161,2 / 164,9 | 8,06 / 8,25 |
| | 3 s | 158,6 / 148,6 | 147,2 / 149,2 | 151,0 / 150,6 | 243,0 / 243,7 | 8,10 / 8,12 |
| | 4 s | 178,0 / 176,8 | 198,1 / 194,4 | 200,4 / 200,0 | 327,2 / 324,4 | 8,18 / 8,11 |
| | 8 s | 212,1 / 211,7 | 384,3 / 382,5 | 387,6 / 385,3 | 645,2 / 640,3 | 8,06 / 8,00 |
| B + trọng số một lần (sau nạp 98,9–100,7) | 2 s | 120,2 / 130,6 | 100,8 / 100,0 | 101,6 / 103,2 | 165,8 / 164,9 | 8,29 / 8,25 |
| | 4 s | 157,3 / 165,5 | 195,9 / 196,4 | 197,3 / 199,4 | 323,9 / 325,8 | 8,10 / 8,14 |
| | 8 s | 202,3 / 192,6 | 385,3 / 374,7 | 391,2 / 384,3 | 647,3 / 635,2 | 8,09 / 7,94 |
| B' (`chunked`; sau nạp 100,4–104,0) | 2 s | 123,7 / 115,2 | 100,9 / 101,1 | 102,1 / 101,8 | 165,3 / 166,4 | 8,27 / 8,32 |
| | 3 s | 128,9 / 138,4 | 146,6 / 145,7 | 148,9 / 149,3 | 243,6 / 242,0 | 8,12 / 8,07 |
| | 4 s | 154,3 / 158,6 | 192,5 / 197,7 | 197,6 / 199,3 | 320,8 / 327,9 | 8,02 / 8,20 |
| | 8 s | 195,8 / 194,0 | 388,3 / 383,8 | 393,6 / 386,5 | 651,0 / 640,9 | 8,14 / 8,01 |
| B + A cửa sổ 2 s | 4 s | 144,9 / 144,7 | 201,9 / 203,2 | 203,9 / 204,1 | 328,6 / 331,2 | 8,22 / 8,28 |
| | 8 s | 149,3 / 148,4 | 409,3 / 408,5 | 412,6 / 410,9 | 664,2 / 666,3 | 8,30 / 8,33 |
| B + A cửa sổ 1 s | 8 s | 135,5 / 136,0 | 424,9 / 435,8 | 440,8 / 440,1 | 675,3 / 679,6 | 8,44 / 8,49 |
| B' + A cửa sổ 2 s | 4 s | 123,7 / 124,2 | 200,7 / 202,9 | 202,5 / 205,1 | 328,9 / 333,1 | 8,22 / 8,33 |
| | 8 s | 124,8 / 123,6 | 395,2 / 394,2 | 408,9 / 404,3 | 653,2 / 650,4 | 8,17 / 8,13 |
| B' + A cửa sổ 1 s | 8 s | 112,3 / 115,8 | 436,8 / 435,2 | 443,6 / 438,7 | 687,2 / 680,1 | 8,59 / 8,50 |

Một lần nhúng đơn lẻ (`--repeat 1`): nguyên bản 2 s 337,7 / 338,2, 4 s 585,9 / 691,2, 8 s 1068,6 / 1069,4 MB; B 2 s 119,1 / 119,1,
4 s 151,1 / 151,1, 8 s 186,2 / 186,5 MB; B' 2 s 110,9 / 110,9, 4 s 145,7 / 152,2, 8 s 190,3 / 181,0 MB.

Cách đọc:

- Giải phóng tensor hạ RSS đỉnh (20 lần) của 8 s từ 1302–1305 xuống 194–212 MB, của 4 s từ 848–850 xuống 154–178 MB, và hạ cả mức
  "sau nạp" (215 xuống 100–110 MB, vì lần chạy thử 1 s lúc nạp cũng tốn ít hơn). B và B' gần như ngang nhau; ở 4 s và 8 s B' thấp
  hơn B 16–24 MB nhờ không chép trọng số mỗi lượt (ở 2 s các lần đo chồng lên nhau).
- Trọng số một lần: hạ mức sau nạp ~10 MB và đỉnh 10–20 MB ở 4 s, 8 s; thời gian giảm không rõ (chép 26 MB chỉ tốn vài ms mỗi lượt).
- CPU gần như không đổi (8,0–8,3% so với 8,2–8,6%); p50 của 8 s nhanh hơn ~5% (382–388 so với 407–408 ms).
- B + A2 = B ở đoạn X giây: X = 3 s 148,6–158,6 MB, X = 4 s 176,8–178,0 MB. B' + A2 = B' ở đoạn X giây: X = 3 s 128,9–138,4 MB,
  X = 4 s 154,3–158,6 MB.

## Vì sao RSS chạy lâu cao hơn một lần nhúng đơn lẻ

Chạy lâu bằng `probe --segments`: nhúng lần lượt 226 đoạn thật của IS1009a.Mix-Headset (đọc từng đoạn khỏi WAV, không giữ WAV
trong bộ nhớ, không có Silero), `--trace` ghi bộ nhớ sau mỗi lần.

| Cấu hình | Số lần | RSS đỉnh (MB) | RSS sau mỗi lần nhúng, tối đa (MB) | malloc đang dùng sau mỗi lần, tối đa (MB) | malloc đang giữ, tối đa (MB) |
|---|---|---|---|---|---|
| Nguyên bản (a / b) | 226 | 1468,4 / 1512,7 | 1103,8 / 1143,9 | 41,5 / 41,5 | 599,8 / 629,1 |
| Nguyên bản, `malloc_zone_pressure_relief` sau mỗi lần (một lần) | 226 | 1475,1 | 1105,8 | 41,5 | 604,0 |
| Nguyên bản (một lần) | 452 | 1493,1 | 1144,7 | 41,5 | 608,2 |
| B (a / b) | 452 | 431,8 / 433,8 | 431,8 / 433,8 | 41,5 / 41,5 | 121,6 / 121,6 |
| B' (a / b) | 452 | 411,1 / 464,9 | 411,1 / 464,9 | 45,5 / 45,5 | 113,2 / 104,9 |

Bằng chứng:

1. **Không phải tensor bị giữ:** malloc đang dùng sau mỗi lần nhúng là 40,9–41,5 MB (nguyên bản) suốt 226 hay 452 lần, không tăng.
2. **Allocator giữ bộ nhớ đã trả:** từ lần nhúng đoạn dài đầu tiên trở đi, RSS lúc rảnh giữa hai lần nhúng vẫn 629–1144 MB (nguyên
   bản) và gần bằng phys_footprint (bộ nhớ bẩn, tính cho tiến trình). `vmmap -summary` ở cuối một lượt 226 lần (tiến trình chưa
   thoát): physical footprint 880,6 MB, trong đó vùng `MALLOC_SMALL (empty)` 500,2 MB bẩn và `MALLOC_LARGE (empty)` 339,4 MB
   bẩn; `DefaultMallocZone` cấp phát 39,0 MB, phân mảnh 500,7 MB (93%). Với B': footprint 284,1 MB, `MALLOC_LARGE (empty)` 215,7 MB.
3. **Đỉnh tăng theo bậc ở các đoạn dài:** vết của nguyên bản cho thấy đỉnh nhảy ở lần 4 (đoạn 5,79 s: 598 → 887 MB), lần 79 (5,70 s:
   887 → 1181 MB), lần 137 (7,68 s: 1356 → 1456 MB)…: mỗi đoạn dài cần khối mới cỡ khác, trong khi các vùng rỗng của lần trước vẫn
   thường trú. Một lần 8 s đơn lẻ chỉ 1069 MB; chạy lâu 1468–1513 MB (dôi 400–440 MB, khớp 0,4 GB của Task 9).
4. **`malloc_zone_pressure_relief(NULL, 0)` sau mỗi lần không giúp** (1475,1 MB; RSS cuối 948,9 MB).
5. **Đổi allocator thì phần dôi gần hết** (`probe` dựng với mimalloc 0.1.52 làm global allocator, ngoài repo):

| Cấu hình (mimalloc) | Một lần 8 s (MB) | 20 lần 8 s (MB) | Chạy lâu (MB) |
|---|---|---|---|
| Nguyên bản | 1061,8 / 1062,9 | chưa đo | 1124,6 / 1146,5 (226 lần) |
| B' | 204,4 / 201,4 | 219,7 / 214,9 | 239,0 / 239,8 (452 lần) |
| B' + A2 4 s (một lần) | | | 195,1 (452 lần) |
| B' + A cửa sổ 2 s (một lần) | | | 178,3 (452 lần) |
| B' + A2 3 s (một lần) | | | 201,2 (452 lần) |

**Kết luận:** phần RSS dôi ra khi chạy lâu là bộ nhớ đã trả mà allocator mặc định của macOS (libmalloc) giữ lại, bẩn và thường trú,
cộng phân mảnh giữa các đoạn dài ngắn khác nhau; không phải tensor chưa được giải phóng. Với mimalloc, phần dôi còn +60–85 MB
(nguyên bản) và +35–38 MB (B'), nhưng với các cấu hình đã giới hạn độ dài nhúng thì mimalloc không hơn malloc hệ thống (A2 4 s:
195 so với 198–208 MB; A2 3 s: 201 so với 147–149 MB). Chưa đo trên Windows (allocator khác).

## Chạy lâu: các cấu hình ứng viên

`probe --segments`, IS1009a.Mix-Headset, 452 lần (1095,2 s tiếng nói; nguyên bản 226 lần), malloc hệ thống. "% một lõi" là CPU chia
thời lượng thật của các đoạn (gồm cả đọc từng đoạn khỏi WAV, không đáng kể). "Xong ≤ 230 ms" đếm thời gian nhúng từng đoạn.

| Cấu hình | RSS đỉnh (MB) | p50 (ms) | p90 (ms) | % một lõi | Xong ≤ 230 ms |
|---|---|---|---|---|---|
| Nguyên bản (226 lần) | 1468,4 / 1512,7 | 93,9 / 94,0 | 274,5 / 278,2 | 8,69 / 8,61 | 194/226, 193/226 |
| Nguyên bản + A2 4 s (226 lần, một lần) | 999,4 | 93,0 | 198,9 | 7,48 | 225/226 |
| B | 431,8 / 433,8 | 91,3 / 89,2 | 254,7 / 259,8 | 8,38 / 8,31 | 392/452, 393/452 |
| B + trọng số một lần (một lần) | 491,2 | 92,7 | 254,6 | 8,33 | 396/452 |
| B' | 411,1 / 464,9 | 89,5 / 89,2 | 255,2 / 255,0 | 8,30 / 8,25 | 396/452, 394/452 |
| B' + A cửa sổ 2 s (một lần) | 165,8 | 90,4 | 266,0 | 8,32 | 390/452 |
| B' + A2 3 s (ba lần: lần đầu / hai lần ở vòng sửa) | 149,1 / 147,3 / 149,1 | 90,1 / 89,1 / 89,6 | 151,9 / 151,7 / 150,7 | 6,56 / 6,52 / 6,48 | 451/452, 452/452, 452/452 |
| **B' + A2 4 s** | **208,2 / 200,5** | 90,7 / 90,4 | 197,2 / 198,0 | **7,33 / 7,36** | **452/452, 452/452** |
| **B' + A2 4 s, bản không vá (`probe-registry`)** | **198,0 / 198,3** | 89,8 / 90,2 | 190,7 / 195,1 | **7,25 / 7,25** | **452/452, 452/452** |

B' + A2 3 s: một lượt kiểm độc lập (người rà, hai lần) ra 151,5 và 163,5 MB. Gộp lại: xấp xỉ 150 MB, dao động tới ~164 MB, **không
đảm bảo** ≤ 150 MB.

Giới hạn của các ô "452/452": chỉ một bản ghi (IS1009a.Mix-Headset, 226 đoạn riêng biệt chạy hai vòng, nên 452 lần không phải 452
mẫu độc lập), chỉ M4 Pro, worker chạy một mình (không có `asr-worker`, `llama-server` cùng lúc). Đoạn chậm nhất của B' + A2 4 s:
200,9 / 204,6 ms (`probe`) và 204,5 / 205,2 ms (bản không vá), tức biên 25–29 ms (11–13%) so với ngưỡng 230 ms.

Tỉ lệ CPU của A2 khớp phép tính ở Step 4b: 7,33/8,30 = 0,883 (dự kiến 0,881 cho X = 4 s); 6,56/8,30 = 0,790 (dự kiến 0,782).

## Ngoài kế hoạch: Apple Accelerate cho CPU (chỉ macOS)

`candle-core` có feature `accelerate` (crate `accelerate-src` 0.3.2, chỉ link framework Accelerate của hệ thống) dùng sgemm của Apple
cho phép nhân ma trận, kể cả trong conv2d. Dựng `probe` với feature này (ngoài repo), đo `--repeat 20`:

| Cách | Đoạn | RSS đỉnh (MB) | p50 (ms) | p90 (ms) | CPU mỗi lần (ms) | % một lõi |
|---|---|---|---|---|---|---|
| B' + Accelerate | 2 s | 119,0 / 112,6 | 66,8 / 66,9 | 68,7 / 69,1 | 99,5 / 99,1 | 4,97 / 4,95 |
| | 4 s | 156,2 / 156,1 | 130,2 / 128,7 | 133,9 / 134,8 | 197,3 / 197,8 | 4,93 / 4,94 |
| | 8 s | 198,0 / 198,6 | 258,5 / 253,9 | 263,4 / 263,3 | 409,0 / 403,6 | 5,11 / 5,05 |
| Nguyên bản + Accelerate | 2 s | 357,1 / 472,5 | 72,1 / 72,3 | 74,2 / 73,8 | 105,4 / 106,2 | 5,27 / 5,31 |
| | 4 s | 829,5 / 688,6 | 130,3 / 137,4 | 138,5 / 144,1 | 200,0 / 207,0 | 5,00 / 5,18 |
| | 8 s | 1238,5 / 1261,4 | 288,6 / 284,5 | 298,5 / 293,7 | 445,5 / 440,3 | 5,57 / 5,50 |

Chạy lâu (452 lần): B' + Accelerate 400,1 / 411,4 MB, p50 61,1 / 62,0 ms, p90 173,3 / 174,6 ms, 5,17 / 5,10% một lõi, xong ≤ 230 ms
436/452 và 438/452; B' + Accelerate + A2 4 s (một lần) 205,5 MB, p50 61,9 ms, p90 134,6 ms, **4,56% một lõi**, 452/452.

Nhúng lệch so với bản không Accelerate tối đa 2,26e-6 (2 s), 2,62e-6 (4 s), 3,70e-6 (8 s), cosine 1,0000000 (làm tròn 7 chữ số);
chưa chấm lại A-spk1 vì lệch cỡ này không đổi được quyết định phân cụm trừ trường hợp hòa sát.

## Bảng tổng hợp

Đoạn tiếng nói thật cắt từ IS1009a.Mix-Headset (giây 120), `--repeat 20`, 2 luồng. RSS đỉnh: khoảng của các lần đo. Cosine: so với
nhúng cả đoạn của bản gốc (1 nghĩa là giống từng bit, trừ dòng Accelerate). A-spk1: trung bình 4 bản ghi kiểm ở θ = 0,35, ≥ 1 s /
mọi dòng (nhúng cả đoạn: 92,0 / 85,1).

| Cách | 2 s: RSS / p50 / p90 | 4 s: RSS / p50 / p90 | 8 s: RSS / p50 / p90 | % một lõi | Cosine (2 / 4 / 8 s) | Chạy lâu (MB) | A-spk1 |
|---|---|---|---|---|---|---|---|
| Nguyên bản | 340–547 / 98–106 / 103–111 | 829–851 / 192–201 / 200–218 | 1302–1319 / 396–412 / 412–422 | 8,0–8,7 | 1 / 1 / 1 | 1468–1513 | 92,0 / 85,1 |
| onnxruntime (mốc, gồm ~50 MB Python) | 140 / 18,7 / 19,2–19,3 | 180–181 / 35,2–35,8 / 37,8–42,9 | 256–268 / 74,6–74,7 / 78,2–81,0 | 1,8–1,9 | chưa so | chưa đo | chưa đo |
| A cửa sổ 1 s | chưa đo | 332 / 217–227 / 230–235 | 331–332 / 429–432 / 435–451 | 8,5–8,9 | 0,666 / 0,817 / 0,915 | chưa đo | chưa đo |
| A cửa sổ 2 s | như nguyên bản | 521–548 / 202–208 / 210–215 | 551–566 / 412–417 / 425–429 | 8,4–8,6 | 1 / 0,885 / 0,954 | chưa đo | 91,1 / 84,2 |
| A2 X giây (đoạn dài hơn X như đoạn X giây) | X = 2: 340–547 / 98–106 | X = 3: 692 / 147–152; X = 4: 829–851 / 192–201 | — | 8,1–8,7 trên phần đã nhúng | (nhúng X giây đầu) | nguyên bản + A2 4 s: 999 | X = 2: 90,4 / 84,2; X = 3: 91,6 / 84,7; X = 4: 91,8 / 84,9 |
| B (vá candle-onnx) | 121–145 / 98–101 / 99–103 | 177–178 / 194–198 / 200 | 212 / 383–384 / 385–388 | 8,0–8,3 | 1 / 1 / 1 | 432–434 | như nguyên bản |
| B + A cửa sổ 2 s | như B | 145 / 202–203 / 204 | 148–149 / 409 / 411–413 | 8,2–8,3 | như A | chưa đo | như A |
| B + A2 X giây | — | X = 3: 149–159 / 147–149; X = 4: 177–178 / 194–198 | — | 8,1–8,2 trên phần đã nhúng | như A2 | chưa đo | như A2 |
| B' (chia đồ thị; đo bằng `probe`, công tắc tắt) | 115–124 / 101 / 102 | 154–159 / 193–198 / 198–199 | 194–196 / 384–388 / 387–394 | 8,0–8,3 | 1 / 1 / 1 | 411–465 | như nguyên bản |
| B', bản không vá (`probe-registry`) | — | — | 194,5–195,5 / 381–382 / 385–387 | 8,0 | 1 / 1 / 1 | — | như nguyên bản |
| B' + A cửa sổ 2 s | như B' | 124 / 201–203 / 203–205 | 124–125 / 394–395 / 404–409 | 8,1–8,3 | như A | 166 | như A |
| B' + A2 4 s | — | như B' 4 s | — | 7,3–7,4 (chạy lâu) | như A2 4 s | 198–208 (gồm bản không vá 198,0–198,3) | 91,8 / 84,9 |
| B' + A2 3 s | — | — | — | 6,5–6,6 (chạy lâu) | như A2 3 s | 147,3–149,1 (ba lần; kiểm độc lập 151,5 và 163,5) | 91,6 / 84,7 |
| B' + Accelerate (macOS) | 113–119 / 67 / 69 | 156 / 129–130 / 134–135 | 198–199 / 254–259 / 263 | 4,9–5,1 (20 lần), 5,1–5,2 (chạy lâu) | lệch ≤ 3,7e-6 | 400–411 | chưa chấm (lệch ≤ 3,7e-6) |
| B' + Accelerate + A2 4 s | — | như dòng trên 4 s | — | 4,6 (chạy lâu) | | 206 | như A2 4 s |

## So với ngân sách (spec §11), M4 Pro

| Ngân sách | Cấu hình tốt nhất đo được | Kết luận |
|---|---|---|
| RAM ≤ 150 MB | B' + A2 3 s chạy lâu: 147,3–149,1 MB (ba lần), kiểm độc lập 151,5 và 163,5 MB (tụt độ chính xác nhẹ). B' + A cửa sổ 2 s: 124–125 MB với 20 lần cùng đoạn 8 s, 165,8 MB chạy lâu. B' + A2 4 s: 198,0–208,2 MB. B' nhúng cả đoạn: 181–196 MB một lần 8 s, 411–465 MB chạy lâu | **Không đạt khi đưa cả đoạn 8 s vào model một lượt**, bằng bất kỳ cách nào (kể cả onnxruntime: ~210 MB cho 8 s sau khi trừ Python). Nhúng tối đa 3 s cho **xấp xỉ 150 MB, dao động tới ~164 MB, không đảm bảo**, đổi lấy độ chính xác |
| CPU ≤ 5% một lõi khi người nói liên tục | Không Accelerate: B' + A2 4 s 7,3% (AMI). Với Accelerate: B' + A2 4 s 4,6%, B' 4,9–5,2% (20 lần cùng đoạn và chạy lâu) | **Không đạt trên candle CPU thuần.** Đạt trên macOS nếu bật Accelerate kèm A2 4 s. Windows chưa đo |
| Nhận giọng xong trước nhận dạng (~230 ms) | B' + A2 4 s: 452/452 lần ≤ 230 ms ở bốn lần đo (p90 191–198 ms, chậm nhất 201–205 ms); B' nhúng cả đoạn: 394–396/452. Chỉ một bản ghi (226 đoạn chạy hai vòng, không phải 452 mẫu độc lập), chỉ M4 Pro, worker chạy một mình | **Đạt với A2 4 s trong điều kiện đó** (biên 25–29 ms, 11–13%; chưa đo khi chạy cùng `asr-worker`, `llama-server`) |

## Khuyến nghị cho kế hoạch 02

**Cách chính: B' + A2 4 s.** Trong `Embedder` (`crates/speaker-worker/src/embed.rs`):

1. Lúc nạp, tách đồ thị thành các graph con một nút, tính cho mỗi nút đầu vào cần lấy và các tên hết lần dùng sau nút đó, chuyển
   initializer thành tensor một lần (`candle_onnx::eval::get_tensor`), bỏ `raw_data` khỏi bộ nhớ; từ chối đồ thị có graph lồng.
   Mỗi lần nhúng gọi `candle_onnx::simple_eval` từng nút và bỏ giá trị đã hết lần dùng. Nhúng giống hệt từng bit bản gốc (có thể giữ
   test so với onnxruntime và thêm test so với `simple_eval` cả đồ thị).
2. Chỉ nhúng 4 s đầu (hay giữa) của phần tiếng nói mỗi đoạn; thời lượng cho phân cụm vẫn là thời lượng thật.

Đánh đổi: RAM chạy lâu 198–208 MB (so với 1,47–1,51 GB), CPU 7,3% một lõi (so với 8,6–8,7%), 452/452 lần xong ≤ 230 ms (một bản
ghi, M4 Pro, worker chạy một mình; chậm nhất 201–205 ms), độ chính xác trung bình −0,2 điểm (trong sai số; theo từng bản ghi EN2002a
lệch 1–2 đoạn quanh mức 80%). Không vá thư viện, không thêm phụ thuộc, giữ `candle-onnx` 0.11.0 cùng bản với `pipeline` (spec chính
§6.12, không ggml); đã kiểm với candle-onnx từ crates.io không vá. Bảo trì: khoảng 100 dòng dựa trên API công khai (`simple_eval`,
`GraphProto`, `get_tensor`); khi nâng candle-onnx phải chạy lại test giống-từng-bit. Trên Windows i5, Task 13 chỉ đo được CPU và độ
trễ của A2 (`speaker-eval … --max-embed-s 4`, đã thêm vào Task 13 Step 5); RAM của B' trên Windows để kế hoạch 02 đo sau khi B'
được viết trong repo, vì B' hiện chỉ có trong dự án thí nghiệm ngoài repo, chạy được trên macOS thôi (`proc_pid_rusage`,
`malloc_zone_statistics`, `[patch]`). Cũng phải đo lại trong `speaker-worker` thật (thêm giao thức, đọc cây giao diện).

**Dự phòng: B (vá candle-onnx).** Cùng mức RAM (đỉnh 8 s 212 MB, chạy lâu 432–434 MB, + A2 4 s ≈ B ở 4 s: 177–178 MB với 20 lần),
nhưng phải chép candle-onnx vào `third_party/` kèm README như `third_party/README.md` của whisper, thêm `[patch.crates-io]` cho cả
workspace (đổi luôn candle-onnx của `pipeline`/Silero trong app), và tự mang bản vá qua mỗi lần nâng bản. Gói crate trên crates.io
không kèm file LICENSE (chỉ ghi `MIT OR Apache-2.0` trong `Cargo.toml`), nên phải lấy LICENSE-MIT, LICENSE-APACHE từ repo
huggingface/candle. Chú thích trong `eval.rs` của chính candle-onnx nêu đúng ý tưởng bỏ giá trị trung gian, nên gửi bản vá lên
upstream là hướng dài hạn tốt hơn chép vào repo. Chỉ dùng B nếu B' gặp vấn đề (ví dụ chi phí gọi từng nút trên Windows, hay bản
candle-onnx sau đổi cách `simple_eval` xử lý graph không có `input`).

**Không khuyến nghị:** A cửa sổ 2 s làm cách chính (RAM 166 MB chạy lâu nhưng không giảm CPU và tụt 3,5 điểm ở ES2004a.Array1-01);
A2 2 s (tụt rõ); mimalloc (chỉ giúp khi nhúng cả đoạn; với A2 4 s không hơn).

**Chủ dự án cần quyết (Task 15):**

1. **Ngân sách RAM.** 150 MB không đạt khi đưa cả đoạn 8 s vào model một lượt. Đề xuất **250 MB** cho `speaker-worker` trên M4 Pro
   (đo được 198–208 MB cho phần nhúng khi chạy lâu với B' + A2 4 s; còn giao thức, đọc cây giao diện chưa đo). Nếu giữ 150 MB: A2 3 s
   cũng chỉ cho **xấp xỉ 150 MB, không đảm bảo** (147,3–149,1 MB qua ba lần của tôi; 151,5 và 163,5 MB ở lần kiểm độc lập), kèm tụt
   độ chính xác (trung bình −0,4 điểm, EN2002a thiếu 4–6 đoạn ở mức 80%, cần chốt lại θ); muốn chắc dưới 150 MB phải nhúng ngắn hơn
   nữa hay theo cửa sổ, đều tụt độ chính xác (A2 2 s tụt rõ; cửa sổ 2 s tụt 3,5 điểm ở một bản ghi và chạy lâu vẫn 166 MB).
2. **Ngân sách CPU.** Không Accelerate: đề xuất **8% một lõi** trên M4 Pro khi người nói liên tục (đo 7,3% trên AMI với A2 4 s;
   một người nói liên tục với đoạn dài có lẽ thấp hơn nhờ A2, chưa đo). Hoặc giữ 5% và bật `candle-core/accelerate` trên macOS
   (4,6%): cần quyết thêm vì feature của `candle-core` hợp nhất trong workspace nên Silero trong app cũng dùng Accelerate khi build
   chung (phải đo lại Silero),
   `accelerate-src` 0.3.2 là bản mới nhất nhưng đã cũ, và Windows không có tương đương nhẹ (MKL nặng). Ngân sách Windows i5 (10%)
   chờ Task 13.
3. **onnxruntime** (1,9% CPU, nhanh gấp 5 lần) chỉ nên xét lại khi crate `ort` có bản ổn định (spec chính §6.12).

**Đã quyết (Task 15, 2026-10-26):** chủ dự án chốt cách B' + A2 4 s, không bật Accelerate; ngân sách `speaker-worker` trên M4 Pro
RAM ≤ 250 MB, CPU ≤ 8% một lõi khi người nói liên tục; Windows i5 giữ ≤ 10% một lõi, chờ số đo. Spec §4.1, §5.2, §11 đã sửa;
tổng hợp ở `tong-hop.md`.

## Chạy lại

Trong repo (`$W` là worktree, `$DATA` thư mục dữ liệu, `$M` thư mục chính có Silero):

```
cd $W && cargo build --release -p latency-bench
# Step 2, Step 4 (RAM/CPU): thêm --window-s <s> cho cách A, --cosine để in cosine (lượt có --cosine không dùng để đo RSS)
RAYON_NUM_THREADS=2 /usr/bin/time -l target/release/latency-bench embed-probe --wav $DATA/ami/IS1009a.Mix-Headset.wav \
  --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --start-s 120 --seconds <2|3|4|8> --repeat 20
# Step 3
$DATA/venv/bin/python -I bench/2026-10-26-nguoi-noi/rss_ort.py --wav $DATA/ami/IS1009a.Mix-Headset.wav \
  --model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --start-s 120 --seconds <2|4|8> --repeat 20 [--no-arena]
# A-spk1 cho A, A2: nhúng lại từng bản ghi kiểm vào thư mục cache mới rồi chấm như nhan-giong-ami.md
RAYON_NUM_THREADS=2 target/release/latency-bench speaker-eval --wav $DATA/ami/<tên>.wav --vad-model $M/models/silero_vad_v6.2.3.onnx \
  --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --theta 0.35 --merge-theta 1.1 \
  [--window-s 2 | --max-embed-s <X> [--embed-from middle]] --embeddings-out $DATA/out/<cấu hình>/<tên>.emb.json --out <ra>.jsonl
target/release/latency-bench speaker-eval --embeddings-in $DATA/out/<cấu hình>/<tên>.emb.json --theta 0.35 --merge-theta 1.1 --out <ra>.jsonl
$DATA/venv/bin/python -I bench/2026-10-26-nguoi-noi/score_spk.py <ra>.jsonl $DATA/out/<tên>.rttm
```

Cache mới: `$DATA/out/{win2,cap2,cap3,cap4,cap3mid,cap4mid}/`. Cách B, B', các biến thể trọng số một lần, mimalloc, Accelerate và chế
độ chạy lâu nằm trong dự án thí nghiệm ngoài repo `$DATA/ram-probe/` (bản candle-onnx đã vá ở `candle-onnx-free/`, binary `probe`,
dựng bằng `CARGO_TARGET_DIR=$W/target cargo build --release --bin probe [--features accelerate|mimalloc]`), không vào git:
`probe --mode <orig|free|weights|chunked> --seconds <s> --repeat 20 [--window-s <s>]` cho bảng Step 5;
`probe --mode <…> --segments $DATA/out/IS1009a.Mix-Headset.emb.json --rounds 2 [--max-embed-s <X>] [--trace] [--relief] [--hold-s <s>]`
cho chạy lâu (`vmmap -summary <pid>` trong lúc `--hold-s`); `--dump`/`--compare` để so nhúng giữa hai bản build.

Bản không vá: `$DATA/ram-probe-registry/` (cùng `src/main.rs`, bỏ công tắc, không `[patch]`), dựng bằng
`CARGO_TARGET_DIR=$W/target cargo build --release --bin probe-registry`; chỉ có `--mode orig|chunked`. Toàn bộ lượt chạy lại ở vòng
sửa: `$DATA/ram-probe/rerun_round2.sh`.

## Log

Mọi đường dẫn dưới đây ở `$DATA/ram-probe/logs/` (ngoài repo). File `.txt` của lượt `embed-probe`, `probe` có cả đầu ra của
`/usr/bin/time -l`; lượt chạy lâu có vết `lr-<cấu hình>.tsv` và `lr-<cấu hình>.err` (đầu ra của `/usr/bin/time -l`).

| Bảng | Log |
|---|---|
| Step 2 (chạy lại một lần ở vòng sửa) | `step2-orig-{2,3,4,8}s.txt` (20 lần), `step2-orig-{1,2,4,8}s-r1.txt` (1 lần) |
| Step 3 (chạy lại) | `step3-ort-{2,4,8}s.txt`, `step3-ort-noarena-{2,8}s.txt` |
| Step 4 (chạy lại) | `step4-win{1,2}-{4,8}s.txt`, `step4-cosine.txt` |
| Step 5 (`probe`, lần đo đầu) | `m2-orig.txt`, `m2-free.txt` (`free`, `weights`, `chunked`), `m3.txt` (1 lần, 3 s, cửa sổ), `cosine.txt` |
| Bản không vá | `registry-orig-8s-r1.txt`, `registry-chunked-8s-r20-{a,b}.txt`, `registry-compare.txt` (so từng bit), `lr-registry-chunked-cap4-{a,b}.*` |
| Chạy lâu | `lr-orig-{a,b}`, `lr-orig-relief`, `lr-orig-r2`, `lr-orig-cap4`, `lr-free-{a,b}`, `lr-weights-a`, `lr-chunked-{a,b}`, `lr-chunked-win2`, `lr-chunked-cap3` (lần đầu), `lr-chunked-cap3-{b,c}` (vòng sửa), `lr-chunked-cap4-{a,b}`; `vmmap-orig.txt`, `vmmap-chunked.txt` |
| mimalloc | `lr-mi-*`, `mimalloc-{orig,chunked}-8s-r1.txt` (chạy lại một lần 8 s) |
| Accelerate | `accelerate.txt`, `lr-acc-chunked-{a,b}`, `lr-acc-chunked-cap4` |
| Độ chính xác (A, A2) | `../acc_runs.log`, `../acc_runs_mid.log`; cache ở `$DATA/out/{win2,cap2,cap3,cap4,cap3mid,cap4mid}/` |

Các bảng Step 2, 3, 4 và dòng mimalloc "một lần 8 s" chép từ đầu ra lúc đo đầu (không lưu file). Lần chạy lại một lần mỗi cấu hình
(ghi theo log, CPU của `embed-probe` lúc này đo bằng `sysinfo`), so với số trong bảng; **lệch hơn 15% được in đậm**, số trong bảng
giữ nguyên:

| Cấu hình | Trong bảng | Chạy lại (log) |
|---|---|---|
| Step 2, 2 s × 20 | RSS 355,5–546,6 MB; p50 97,5–106,4 ms; 8,1–8,7% | RSS 546,6 MB; p50 104,1 ms; 8,6% |
| Step 2, 3 s × 20 | 691,6 MB; 146,9–151,8 ms; 8,1–8,4% | 691,6 MB; 143,3 ms; 8,0% |
| Step 2, 4 s × 20 | 828,9–850,9 MB; 191,8–200,9 ms; 8,0–8,3% | 855,5 MB; 203,1 ms; 8,4% |
| Step 2, 8 s × 20 | 1309,7–1319,0 MB; 396,1–412,4 ms; 8,3–8,5% | 1311,6 MB; 410,4 ms; 8,5% |
| Step 2, một lần 1 / 2 / 4 / 8 s | 228,5–229,3 / 344,3–345,3 / 593,9–594,8 / 1078,4–1160,8 MB | 227,3 / **440,8** / 596,1 / 1079,0 MB |
| Step 4, cửa sổ 1 s, 4 s / 8 s | 331,9–332,1 / 331,3–331,8 MB; p50 8 s 428,8–431,9 ms | 359,3 / 360,0 MB (+8%); p50 8 s 451,0 ms |
| Step 4, cửa sổ 2 s, 4 s / 8 s | 521,1–548,0 / 550,6–565,9 MB | 549,1 / 556,3 MB |
| Step 4, cosine (6 cặp) | 0,665840 … 0,954445 | giống hệt 6 chữ số |
| Step 3, onnxruntime 2 / 4 / 8 s | 139,6–140,0 / 179,9–180,9 / 256,4–267,6 MB; p50 18,7 / 35,2–35,8 / 74,6–74,7 ms | 139,4 / 181,0 / 256,6 MB; p50 19,4 / 36,2 / 73,0 ms |
| Step 3, tắt arena 2 / 8 s | 144,9 / 298,4 MB | 148,4 / 298,7 MB |
| mimalloc, một lần 8 s, nguyên bản / B' | 1061,8–1062,9 / 201,4–204,4 MB | 1062,9 / 191,6 MB |

Lệch hơn 15% duy nhất: một lần nhúng 2 s (440,8 so với 344,3–345,3 MB, +28%). Cùng đoạn, cùng binary; giống hiện tượng RSS đỉnh dao
động giữa các lần chạy ở 2 s × 20 (355,5–546,6 MB), tức do allocator (mục "Vì sao RSS chạy lâu cao hơn"), không đổi kết luận nào.
CPU đo bằng `sysinfo` lệch số `getrusage` cũ tối đa 0,3 điểm (3 s: 8,0% so với 8,1–8,4%; 4 s: 8,4% so với 8,0–8,3%).

## Ghi cho kế hoạch 02

Chỉ ghi điều đã kiểm (mã nguồn đọc ngày 2026-10-26).

- **Số luồng.** `candle-core` 0.11.0 đọc `RAYON_NUM_THREADS` ở mỗi lần nhân ma trận (`src/utils.rs`, `rayon_num_threads` và
  `get_num_threads` khoảng dòng 326–346, gọi từ `src/cpu_backend/mod.rs` khoảng dòng 1409), còn pool toàn cục của rayon (các
  `par_iter` như trong conv2d) chỉ đọc biến này một lần lúc tạo. Vì vậy số luồng phải đặt bằng biến môi trường lúc app spawn worker,
  không qua `Load{threads}` hay `ThreadPoolBuilder::build_global` sau khi tiến trình đã chạy. Spec hiện có cả hai cách (§4.1
  `RAYON_NUM_THREADS=2`, §4.2 `Load {…, threads, …}`), cần thống nhất.
- **Ưu tiên thấp.** `candle-core` 0.11.0 có pool rayon riêng (`candle_pool`, `src/utils.rs` khoảng dòng 369–385) tự đặt
  `QOS_CLASS_USER_INTERACTIVE` cho luồng của nó; pool này chỉ dùng khi gọi `Device::with_context` (`src/device.rs` khoảng dòng 267).
  candle-onnx 0.11.0 không gọi hàm đó. Worker không được dùng `with_context`; QoS `utility` đặt cho luồng của pool rayon toàn cục
  bằng `start_handler`.
- **Còn thiếu về đo.** Chạy lâu mới 452 lần (~18 phút tiếng nói, một bản ghi): cần soak test ≥ 1 giờ có vết RSS. Allocator của
  Windows chưa đo. Mốc 230 ms đo khi worker chạy một mình, chưa đo cùng `asr-worker`, `llama-server`.
- **Viết B' trong repo.** Mô-đun riêng (ví dụ `crates/speaker-worker/src/onnx_steps.rs`) và `Embedder::from_model(ModelProto)`.
  Khi nạp: chép `opset_import`, `ir_version` vào graph con; giữ `ValueInfo` đầu vào để kiểm `x` (dtype, rank, chiều 80); kiểm mọi
  đầu vào của nút đều tìm được; từ chối tên trùng và graph lồng. Khi chạy: ngữ cảnh lỗi theo từng nút, `debug_assert!` cuối lượt.
  Test: `#[ignore]` với model thật so `to_bits` với `simple_eval` cả đồ thị ở 1, 2, 4, 8 s; đồ thị nhỏ tự dựng cho `Split` có đầu ra
  bỏ không, giá trị dùng bởi hai nút xa nhau, đầu ra đồ thị bị nút sau dùng, `Mul(a, a)`, `Clip` có đầu vào `""`, `Constant` dùng
  nhiều nơi, hai lượt liền nhau độ dài khác nhau; ca báo lỗi: có `If`, nút không theo thứ tự topo, `x` sai rank hay chiều 80; và
  test đếm tập giá trị còn sống sau mỗi nút (bỏ sót một giá trị chỉ làm RAM tăng mà nhúng vẫn giống từng bit, nên test so bit
  không bắt được).
- **B' rẻ và ít rủi ro hơn B.** Không fork, không `[patch]` (B đổi luôn candle-onnx của Silero trong app), không lo LICENSE. Rủi ro
  của B': dựa vào hành vi chưa ghi thành tài liệu (graph con không khai `input` vẫn chạy). Upstream: bản ổn định mới nhất trên
  crates.io là candle-onnx 0.11.0 (2026-06-26); `candle-onnx/src/eval.rs` trên nhánh main (đọc 2026-10-26) vẫn chỉ có chú thích
  "…remove intermediary values when they are not needed anymore" và `values.remove` lúc lấy đầu ra cuối, chưa bỏ giá trị trung gian
  trong vòng duyệt nút. Gửi bản B lên upstream là hướng dài hạn.
- **A2 trong worker.** Hằng `MAX_EMBED_SAMPLES` (4 s); app gửi tối đa 4 s tiếng nói kèm thời lượng thật của đoạn qua giao thức.
  Quyết `embed_windowed`: nếu không dùng cách A thì bỏ, hay gắn nhãn thí nghiệm.
- **Build chéo Windows** (kiểm clippy): cần `PKG_CONFIG_x86_64_pc_windows_msvc="$W/scripts/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1
  RUSTONIG_DYNAMIC_LIBONIG=1` (như Task 13).
