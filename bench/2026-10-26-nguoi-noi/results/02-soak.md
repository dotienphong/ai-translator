# Soak ≥ 1 giờ có vết RSS (A-spk5 phần worker)

Kế hoạch 02b, Task 5. Một lượt `latency-bench session` dài 92 phút chạy đúng `Engine::start_with_speaker` với `asr-worker`,
`llama-server` và `speaker-worker` thật, phát âm thanh theo thời gian thực như app. Lượt này ghi RSS của ba tiến trình phụ mỗi 5 s
(`--rss-trace`) và chụp số lệnh, năng lượng bằng `rus` để tìm rò bộ nhớ và đo tải dài hạn. Truth rỗng nên lượt này không tính A2,
chỉ đo tải. MB là 10^6 byte (như `ram.md` và ngân sách 250 MB của spec §11). Dữ liệu thô, script và đầu ra phân tích nằm ở
`$DATA/out/02/soak/` (ngoài repo).

## Kết luận ngắn

- **Không rò RSS: đạt.** Đỉnh RSS của `speaker-worker` ở 10% cuối lượt là 116,5 MB, thấp hơn đỉnh ở 10% đầu (137,0 MB) 20,5 MB.
  Mức đạt là không cao hơn quá 25 MB. Nửa sau lượt có đỉnh 132,2 MB, nửa đầu 141,8 MB. Từ phút 10 trở đi RSS có xu hướng giảm
  (−21 MB/giờ). Vết RSS dao động theo từng đoạn tiếng nói, không tăng dần và không đứng thành cao nguyên.
- **Ngân sách RAM ≤ 250 MB: đạt trong lượt này.** Đỉnh 141,8 MB theo vết 5 s và 144,1 MB theo bộ lấy mẫu 0,5 s của `session`.
  Cùng bản ghi IS1009a.Mix-Headset, khi gửi các đoạn liền nhau như Task 2 thì RSS đỉnh là 196,8–199,3 MB. Khi phát theo thời gian
  thực trong soak, đỉnh của chính đoạn IS1009a chỉ 137,0 MB. Vì vậy mức khoảng 200 MB của kế hoạch 01 và các đỉnh 251–260 MB của
  Task 2 nhiều khả năng là hệ quả của cách đo gửi liền nhau, chưa phải mức app gặp. Đây là suy luận, chưa kiểm cho các bản ghi đã
  vượt 250 MB ở Task 2 (xem "Việc còn mở").
- **Nhãn suốt 92 phút ổn định:** 2135 nhãn, 2129 nhãn tới trước kết quả nhận dạng, 6 nhãn muộn (0,28%). Khứ hồi p50 87,2 ms, p90
  209,8 ms, 2063/2135 lần (96,6%) ≤ 230 ms. Worker không bị tắt giữa chừng, không tiến trình phụ nào khởi động lại, nhúng lỗi 0.
- **Tải theo giờ đồng hồ** (giây 120 → giây 5484): `speaker-worker` dùng 5,79% một lõi, 0,921 tỉ lệnh/s, 255 mW. Tính theo mỗi giây
  tiếng nói, worker chạy cùng số lệnh và tốn cùng năng lượng như khi gửi đoạn liền nhau (1,445 so với 1,448 tỉ lệnh, 443 so với 446
  mJ trên IS1009a). Tuy vậy %CPU theo thời gian cao hơn: 8,55% so với 7,09%, vì xung nhịp hiệu dụng thấp hơn (3,46 so với 4,01 GHz).
  Cả lượt tính theo cách này là 9,46%. Đúng như spec §6.8, không nên kết luận về ngân sách CPU 8% bằng %CPU (xem mục "CPU, số lệnh,
  năng lượng").

## Điều kiện

- Máy: Apple M4 Pro, 12 lõi (8 hiệu năng, 4 tiết kiệm), 24 GB RAM, macOS 26.6.2. Cắm điện suốt lượt (`pmset`: AC Power, pin 100%,
  đã sạc đầy).
- Bản dựng: dùng nguyên các binary của Task 1–4, Task này không dựng lại. Nhánh `phan-biet-nguoi-noi`, commit nền `046c41e6` cộng
  các thay đổi chưa commit của kế hoạch 01, 02 và 02b Task 1–3. `latency-bench` và `speaker-worker` là bản release dựng với
  `MACOSX_DEPLOYMENT_TARGET=14.2`; `asr-worker` dựng với `--features metal,shared-encode`. Log ghi `asr-worker: backend=metal
  flash_attn=off decode_mode=shared`, và `soak.speaker-worker.log` ghi `speaker-worker: 2 luồng tính toán`.
- Model: nhận dạng dùng `ggml-large-v3-turbo-q5_0.bin`; dịch dùng `Hy-MT2-1.8B-Q8_0.gguf` qua `llama-server` b11669; nhúng giọng
  dùng `eres2net-sv-en-voxceleb-16k.onnx` (B' + A2 4 s, `SpeakerConfig::default()`, θ = 0,35, `max_voices` 8); VAD là Silero v6.2.3.
  Tham số: `--languages en,zh,ja,ko,vi --target vi --end-silence-ms 50`, không bật dịch trong lúc nói.
- Âm thanh: `soak.wav` ghép liền bốn bản AMI theo thứ tự IS1009a.Mix-Headset (0–839 s), EN2002a.Mix-Headset (839–2982 s),
  ES2004a.Mix-Headset (2982–4031 s), TS3003a.Mix-Headset (4031–5537 s). Tổng 5537 s (92,3 phút). Tiếng nói (tổng độ dài các câu
  phụ đề) chiếm 3480 s, tức 63,9% thời gian. Bốn cuộc họp là bốn nhóm người, mỗi nhóm 4 người, nên một phiên có nhiều người hơn trần
  8 giọng. Cuối lượt worker còn 8 giọng; 1/2075 câu không mang nhãn. Đây là tình huống nhân tạo để đo tải, không dùng để chấm độ
  chính xác.
- Thời gian: 06:29:50 → 08:02:14 ngày 2026-10-27 (session 5536,6 s). Lượt chờ worker sẵn sàng rồi mới phát (app thì không chờ).
- Vết: `rss.tsv` có 1048 mẫu cho mỗi tiến trình, mỗi 5 s, từ giây 0 tới 5533. pid của ba tiến trình không đổi suốt lượt. Bộ lấy mẫu
  của `session` (`usage.*`) đo khoảng mỗi 0,5 s (10 938 mẫu). `rus` chụp lần đầu ở giây 120 và lần cuối ở giây 5480; ngoài hai lần
  kế hoạch yêu cầu, một script nền chụp thêm mỗi 60 s (`rus-chuoi.jsonl`) để xem xu hướng. Mọi ảnh chụp chỉ đọc đúng ba pid của
  lượt đo.
- Máy có người dùng khác. Tải trung bình 1 phút (`uptime`, mỗi 60 s, 92 mẫu): nhỏ nhất 0,80, trung vị 3,45, p90 5,10, lớn nhất
  19,22. Tải theo từng 10 phút: trung bình 1,16–5,57. Hai đợt tải cao: lúc bắt đầu (12,4) và khoảng 07:10–07:11 (19,2), cả hai do
  Storage Management (`ApplicationsStorageExtension`, `StorageManagementService`, `storagekitd`, `CacheDeleteExtension`) và Microsoft
  Defender (`ps` mỗi 5 phút). Ngoài ra có Spotlight (`mds_stores`, `mdworker`) và các ứng dụng của người dùng chạy suốt lượt.
  Không đụng Teams, Chrome, âm lượng, micro.
- `session` in một dòng "CẢNH BÁO: phát lại chậm hơn thời gian thực tới 103 ms" (`feed_lag_max_ms` 103, ngưỡng cảnh báo 100 ms),
  nhiều khả năng rơi vào một đợt tải cao. Lượt này không tính A2, và khứ hồi của nhãn đo từ lúc gửi đoạn, nên cảnh báo này không làm
  sai số nào dưới đây.

## RSS của ba tiến trình phụ

Đơn vị MB. Số lấy từ `rss.tsv` (mỗi 5 s). "Đầu" là mẫu ở giây 0, lúc model đã nạp và chưa có đoạn nào. "10% đầu/cuối" là đỉnh của
105 mẫu đầu và 105 mẫu cuối. Cột cuối là đỉnh theo bộ lấy mẫu 0,5 s của `session` (`usage.*.peak_rss_mb`, đổi MiB sang MB).

| Tiến trình | Đỉnh (giây) | Đầu | Cuối | Nửa đầu: đỉnh / trung vị | Nửa sau: đỉnh / trung vị | 10% đầu / 10% cuối (chênh) | Đỉnh lấy mẫu 0,5 s |
|---|---|---|---|---|---|---|---|
| `speaker-worker` | **141,8** (2070) | 54,3 | 52,5 | 141,8 / 94,1 | 132,2 / 78,0 | 137,0 / 116,5 (**−20,5**) | 144,1 |
| `asr-worker` | 713,4 (1358) | 712,8 | 684,4 | 713,4 / 704,8 | 701,2 / 693,8 | 712,9 / 696,5 (−16,4) | 713,4 |
| `llama-server` | 2 228,6 (1622) | 2 113,3 | 2 072,3 | 2 228,6 / 2 156,1 | 2 183,6 / 2 089,9 | 2 199,0 / 2 112,6 (−86,4) | 2 228,6 |

- `speaker-worker`: không mẫu nào vượt 250 MB. Đường hồi quy của RSS theo thời gian từ phút 10 tới cuối có độ dốc −21,0 MB/giờ. Đỉnh
  theo từng bản ghi: IS1009a 137,0, EN2002a 141,8, ES2004a 132,2, TS3003a 119,3 (trung vị lần lượt 97,5 / 92,3 / 82,2 / 76,3).
- Footprint (`phys_footprint`, phần bộ nhớ bẩn tính cho tiến trình) của `speaker-worker`: ảnh chụp mỗi 60 s cho đỉnh 104,6 MB, bộ lấy
  mẫu 0,5 s cho đỉnh 117,4 MB; giá trị lúc cuối là 73,1 MB. Footprint cũng không tăng dần.
- `asr-worker` và `llama-server` có RSS ổn định (biên độ 4–7%) và không tăng dần. **Ngoài phạm vi nhưng cần ghi lại:** footprint của
  `llama-server` tăng gần như đều suốt lượt, 288 → 2 627 MB (đỉnh 2 710 MB theo bộ lấy mẫu), trong khi RSS của nó giữ ở 2,07–2,23 GB.
  `asr-worker` thì không như vậy (754 → 795 MB). Hiện tượng này không thuộc nhận giọng: lượt tắt nhận giọng cũng có `llama-server`
  như nhau. 24 lượt dài 3–5 phút của Task 4 có footprint đỉnh 414–436 MiB, khớp với đầu đường tăng này. Chưa tìm nguyên nhân; ứng viên là bộ nhớ đệm prompt của
  `llama-server` (chưa kiểm). Nên xem riêng vì app chạy cả buổi họp dài.

### `speaker-worker` theo từng 10 phút (bảng thưa)

"Tại mốc" là mẫu ngay tại hoặc trước phút đó; "đỉnh 10 phút" là đỉnh trong 10 phút kể từ mốc. CPU, số lệnh và năng lượng lấy từ
`rus-chuoi.jsonl` (ảnh mỗi 60 s), tính theo giờ đồng hồ.

| Phút | Bản ghi đang phát | RSS tại mốc | Đỉnh 10 phút | Đỉnh tích lũy | CPU (% một lõi) | Tỉ lệnh/s | mW |
|---|---|---|---|---|---|---|---|
| 0 | IS1009a | 54,3 | 137,0 | 137,0 | 5,98 | 1,010 | 312 |
| 10 | IS1009a → EN2002a (phút 14) | 89,6 | 140,3 | 140,3 | 6,36 | 1,059 | 315 |
| 20 | EN2002a | 76,4 | 132,6 | 140,3 | 7,02 | 1,123 | 324 |
| 30 | EN2002a | 108,1 | 141,8 | 141,8 | 7,14 | 1,079 | 300 |
| 40 | EN2002a | 101,0 | 131,3 | 141,8 | 5,86 | 0,931 | 248 |
| 50 | EN2002a → ES2004a (phút 49,7) | 75,6 | 132,2 | 141,8 | 4,46 | 0,711 | 191 |
| 60 | ES2004a | 69,7 | 132,0 | 141,8 | 6,42 | 1,046 | 283 |
| 70 | ES2004a → TS3003a (phút 67,2) | 94,6 | 119,3 | 141,8 | 4,81 | 0,731 | 183 |
| 80 | TS3003a | 61,2 | 116,5 | 141,8 | 4,28 | 0,650 | 163 |
| 90 | TS3003a (tới phút 92,2) | 76,3 | 98,7 | 141,8 | — | — | — |

Số lệnh và năng lượng theo giờ đi theo mật độ tiếng nói của từng bản ghi. Không thấy xu hướng tăng theo thời gian chạy.

## Khứ hồi và nhãn suốt lượt dài

Số từ `run.*` của `soak.json` và log của worker.

| Chỉ số | Soak (92 phút) | Task 4 (S6 và AMI 300 s, 12 lượt bật) |
|---|---|---|
| Nhãn (`Assign`) / đoạn | 2135 / 2135 | 954 / 954 |
| Tới trước kết quả nhận dạng / muộn | 2129 / **6** (0,28% muộn) | 950 / 4 (0,42%) |
| Khứ hồi p50 / p90 (ms) | **87,2 / 209,8** | 80,8–152,3 / 201,8–227,4 |
| Khứ hồi ≤ 230 ms | **2063/2135 (96,6%)** | 931/954 (97,6%) |
| Tắt nhận giọng giữa chừng | không | không |
| Nhúng (worker) | 1724 lần trên 2135 đoạn (đoạn < 0,5 s không nhúng), lỗi 0, trung bình 114,5 ms | — |

- Nhận dạng p50 226,1 ms; dịch p50 132,5 ms; 2114 câu dịch, 0 lỗi, 0 `Skip`. Hàng đợi dịch dài nhất 1 câu, câu chờ lâu nhất 480 ms,
  0 lần gộp. Không tiến trình phụ nào khởi động lại.
- `run.*` chỉ có số gộp của cả lượt, không có khứ hồi từng đoạn theo thời gian, nên chưa xem được khứ hồi có chậm dần không. Hai chỉ
  báo gián tiếp không cho thấy chậm dần: CPU và số lệnh theo từng 10 phút không tăng, và p90 của soak nằm trong dải của Task 4.

## CPU, số lệnh, năng lượng

`rus` chụp ở giây 120 và giây 5484, khoảng 5363 s, theo giờ đồng hồ (lệnh Step 4 của kế hoạch; đầu ra ở `step4.txt`):

| Tiến trình | CPU (% một lõi) | Tỉ lệnh/s | mW |
|---|---|---|---|
| `speaker-worker` | 5,79 | 0,921 | 255 |
| `llama-server` | 24,03 | 5,238 | 692 |
| `asr-worker` | 0,95 | 0,055 | 9 |

"mW" là năng lượng do nhân macOS ước tính (`ri_energy_nj`) chia cho thời gian. `asr-worker` nhận dạng trên GPU (Metal), và phần GPU
nhiều khả năng không nằm trong số này (chưa kiểm). Bộ lấy mẫu của `session` cho `speaker-worker` 5,72% một lõi trên cả lượt.

**Theo mỗi giây tiếng nói, có so với cách gửi liền nhau (ngoài kế hoạch).** Ngân sách CPU ≤ 8% của spec §11 tính theo thời lượng
tiếng nói, và Task 2 đo bằng cách gửi các đoạn liền nhau. Để so cùng cách tính, tôi chạy lại `speaker-eval --worker` trên
IS1009a.Mix-Headset (gửi liền nhau, 24 s, tải 1,2–1,5, `rus` mỗi 0,5 s). Kết quả lượt này: RSS đỉnh 196,8 MB, khứ hồi p50 89,9 ms,
p90 189,9 ms, 226/226 ≤ 230 ms, CPU 7,11% (khớp Task 2). Tôi đem nó so với đoạn IS1009a của soak. Mẫu số là tổng độ dài các câu
≥ 0,5 s (với soak đây là số xấp xỉ, vì 44 lần ghép câu làm vài câu gồm hai đoạn); "xung hiệu dụng" là số chu kỳ chia thời gian CPU.

| Cách chạy | CPU mỗi giây tiếng nói | Tỉ lệnh mỗi giây tiếng nói | mJ mỗi giây tiếng nói | Xung hiệu dụng (GHz) | Lệnh/chu kỳ |
|---|---|---|---|---|---|
| IS1009a, gửi liền nhau (worker một mình) | 7,09% | 1,448 | 446 | 4,01 | 5,10 |
| IS1009a trong soak (thời gian thực, cùng hai tiến trình phụ) | 8,55% | 1,445 | 443 | 3,46 | 4,88 |
| Cả soak (bốn bản ghi) | 9,46% | 1,506 | 417 | 3,29 | 4,84 |

Trên cùng bản ghi, việc thật của worker không đổi: số lệnh và năng lượng mỗi giây tiếng nói lệch dưới 0,5%. Phần %CPU tăng thêm
(+1,5 điểm) đến hoàn toàn từ xung nhịp: khi phát theo thời gian thực, worker chạy từng đợt ngắn giữa các khoảng lặng với QoS
`utility`, cùng lúc với `llama-server`. Giả thuyết là lõi chưa kịp lên xung, hoặc việc chạy trên lõi tiết kiệm (chưa kiểm). Vì
vậy %CPU theo thời gian của app thật sẽ cao hơn số đo bằng cách gửi liền nhau (soak 8,6–9,5% so với 7,1% của lượt hôm nay và 7,6% trung bình AMI của Task 2) dù năng lượng như nhau. Nếu ngân sách
8% hiểu theo %CPU thì lượt này **vượt**. Nếu hiểu theo việc thật (số lệnh, năng lượng) thì lượt này **bằng** cách đo của Task 2.
Chọn cách hiểu là việc của chủ dự án (Task 9). Không tự đổi ngân sách.

## Allocator macOS và ngân sách RAM

- Kế hoạch 01 (`ram.md`) đo B' + A2 4 s chạy lâu bằng cách gửi 452 đoạn liền nhau, được 198–208 MB. Task 2 đo cùng cách qua worker
  thật, được 163–260 MB tùy bản ghi. Giải thích của `ram.md`: libmalloc giữ lại các vùng đã trả (bẩn, vẫn thường trú).
- Trong soak, phát theo thời gian thực, RSS lên khi có đoạn rồi xuống trở lại: theo từng 10 phút, mức tại mốc là 54–108 MB và đỉnh
  là 99–142 MB, lúc kết thúc còn 52,5 MB, tức gần mức ngay sau khi nạp model (54,3 MB). Không thấy cao nguyên khoảng 200 MB như khi
  gửi liền nhau, kể cả trên đúng bản ghi IS1009a: soak cho 137,0 MB, gửi liền nhau hôm nay cho 196,8 MB.
- Giả thuyết (chưa kiểm, cần `vmmap` lúc đang chạy): khi có khoảng lặng giữa các đoạn, phần bộ nhớ allocator đã đánh dấu là trả được
  thì được thu hồi thật. Khi gửi liền nhau, đoạn sau tới ngay nên các vùng rỗng vẫn thường trú. Áp lực bộ nhớ của máy (thêm
  `llama-server` khoảng 2,1 GB) cũng có thể góp phần; điều này không tách được trong lượt này.
- Giới hạn: vết 5 s và bộ lấy mẫu 0,5 s có thể bỏ sót đỉnh ngắn hơn 0,5 s (Task 2 lấy mẫu 100 ms). Hai bộ lấy mẫu ra số gần nhau
  (141,8 và 144,1 MB), nên phần bỏ sót có lẽ nhỏ, nhưng chưa đo được.
- Với ngân sách ≤ 250 MB: soak AMI 92 phút **đạt**, biên khoảng 106 MB, và **không rò**. Các ca vượt 250 MB ở Task 2 (cv-vi-05 Opus
  259,8 MB, ES2004a.Array1-01 251,5 MB) đều đo bằng cách gửi liền nhau và chưa được chạy theo thời gian thực.

## Việc còn mở (cho Task 9 và chủ dự án)

- Ngân sách RAM: soak cho thấy chạy thời gian thực thấp hơn nhiều so với gửi liền nhau. Muốn chốt thì nên chạy `session` có nhận giọng
  (khoảng 5 phút mỗi bản) trên cv-vi-05 Opus và ES2004a.Array1-01, hai bản đã vượt 250 MB ở Task 2. Cũng cần xét trường hợp app gửi
  dồn nhiều đoạn sau khi bị quá tải, vì khi đó các đoạn tới gần liền nhau.
- Ngân sách CPU: chọn đo theo %CPU (soak 8,6–9,5% mỗi giây tiếng nói) hay theo số lệnh, năng lượng (bằng Task 2) (spec §6.8).
- `llama-server`: footprint tăng 288 → 2 627 MB trong 92 phút (ngoài tính năng này); nên kiểm riêng trước khi phát hành cho buổi họp
  dài.
- Windows chưa đo (allocator khác).

## Chạy lại

Đường dẫn như kế hoạch 02b (`W`, `M`, `DATA`, `B`). Chạy trong `$W` với bản dựng như mục "Điều kiện".

```sh
# Step 1: soak.wav (5537 s) và truth rỗng
cd $DATA/out/02/soak && ffmpeg -loglevel error -y -i $DATA/ami/IS1009a.Mix-Headset.wav -i $DATA/ami/EN2002a.Mix-Headset.wav \
  -i $DATA/ami/ES2004a.Mix-Headset.wav -i $DATA/ami/TS3003a.Mix-Headset.wav -filter_complex concat=n=4:v=0:a=1 \
  -ar 16000 -ac 1 -c:a pcm_s16le soak.wav && echo '[]' > soak.truth.json
# Step 2: rus
cd $W && mkdir -p $DATA/bin && swiftc -O -o $DATA/bin/rus $B/tro-nang/rus.swift
# Step 3: lượt soak (lệnh session như kế hoạch, thêm 2>&1 vào log.txt), chạy nền bằng script: chụp rus ở giây 120
# (rus-dau.json) và khi vết RSS tới giây ≥ 5477 (rus-cuoi.json); thêm rus mỗi 60 s (rus-chuoi.jsonl), uptime mỗi 60 s
# (tai-may.tsv), ps mỗi 5 phút (ps-top.txt). Script: $DATA/out/02/soak/chay-soak.sh (đặt lại đường dẫn ở đầu file).
zsh $DATA/out/02/soak/chay-soak.sh
# Step 4: lệnh phân tích của kế hoạch (đầu ra: step4.txt); phân tích đủ (ba tiến trình, bảng 10 phút, lọc theo pid, tải máy):
python3 -I $DATA/out/02/soak/phan-tich-soak.py $DATA/out/02/soak > $DATA/out/02/soak/phan-tich.txt
# Ngoài kế hoạch: IS1009a gửi liền nhau có rus mỗi 0,5 s (ra $DATA/out/02/soak/them-b2b/)
zsh $DATA/out/02/soak/them-b2b.sh
```

Bảng "theo mỗi giây tiếng nói" tính từ `them-b2b/IS1009a.jsonl`, `them-b2b/rus.jsonl`, `rus-chuoi.jsonl` và các câu phụ đề trong
`soak.json` (`start_ms`, `end_ms`; gốc thời gian của session lệch khoảng 4 s so với lúc script bắt đầu).
