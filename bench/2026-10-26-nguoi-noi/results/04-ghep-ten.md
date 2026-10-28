# Ghép tên và tách giọng bị gộp (kế hoạch 04, Task 11)

Kế hoạch 04b, Task 11. Chạy phần ghép tên và tách giọng của `speaker_worker::session::Worker` (`segment_with`, `observe_at`: đúng mã
của app, không mô phỏng riêng) trên cache nhúng của kế hoạch 01, với bộ đọc tên giả dựng từ RTTM, để chốt ngưỡng tách giọng bị
gộp của spec §5.3 và đo ghép tên (§6.6). **Kết luận: tách giọng KHÔNG đạt tiêu chí, `split` giữ mặc định `false`** (mục "Kết luận
cho spec"). Mọi số dưới đây lấy từ `latency-bench speaker-names-eval` và `score_spk.py` trên dữ liệu ngoài repo; không có số nào bị
làm tròn khác các file kết quả trước (một chữ số thập phân cho %).

## Câu hỏi

- Spec §5.3: "ngưỡng và cách tách chốt ở kế hoạch 04 bằng dòng thời gian giả và bản ghi cây; không đạt thì giữ như hiện nay".
  Tách giọng bị gộp theo tên (hai tên cùng một giọng) có làm tăng đúng giọng trên các bản ghi bị gộp mà không làm hỏng các bản ghi
  khác không?
- Spec §6.6: ghép tên vào giọng đúng đến đâu khi chỉ báo "đang nói" trễ 0,6–1,3 s và mất 10% lượt đọc?

## Điều kiện

- Máy: Apple M4 Pro, macOS 26.6.2, Rust 1.98.1. Nhánh `phan-biet-nguoi-noi` (commit nền `72614025` cộng thay đổi chưa commit của
  kế hoạch 03, 04). Bản dựng `cargo build --release -p latency-bench` (`MACOSX_DEPLOYMENT_TARGET=14.2`).
- Dữ liệu: cache nhúng `.emb.json` và nhãn RTTM của kế hoạch 01 ở thư mục dữ liệu ngoài repo (`$DATA/out/`): AMI `ES2004a`,
  `TS3003a`, `IS1009a`, `EN2002a` (`Mix-Headset`); tiếng Việt seed 0 hội thoại 01–06 (thường và Opus) và seed 1 hội thoại 01–06
  (thường và Opus): 28 bản ghi. Giọng của app đúng như kế hoạch 01 (θ = 0,35, không gộp tự động): kiểm nhanh ở Step 5, `speaker-eval
  --embeddings-in` (cùng cache) và `speaker-names-eval` khi tắt tách giọng cho **cùng toàn bộ sáu chỉ số của `score_spk.py` ở cả 168 dòng** (0 lệch);
  `line_1s` của seed 0 và AMI khớp `nhan-giong-tieng-viet.md` (93,5 / 96,7 / 92,5 / 92,5 / 97,8 / 97,7 / 98,9 / 99,0 / 94,7 / **67,7** /
  97,7 / 97,7) và `nhan-giong-ami.md` (ES2004a 93,3; TS3003a 98,2).
- Mô phỏng chỉ báo (**không phải A-spk3**: A-spk3 đo bằng họp thật ở kế hoạch 07): mỗi người nói thật là một người tham dự cùng tên
  (công thức Teams build sẵn, độ trễ dời mốc 900 ms); chỉ báo bật `--on-ms` sau lúc bắt đầu nói, tắt `--off-ms` (600 ms) sau lúc
  thôi nói, lấy mẫu mỗi 250 ms, mất ngẫu nhiên `--miss` lượt (số giả ngẫu nhiên tất định, `--seed 1`). Ba độ trễ (600, 900, 1 300 ms;
  kế hoạch 01: Teams 760–1 280 ms) và hai mức mất (0, 0,1).
- Chấm tên: dòng ≥ 1 s, sau khi người nói thật của dòng đã nói ≥ 2 lượt (như A-spk3), theo nhãn cuối phiên (như bản chép lời);
  "đúng/sai/chưa tên" là % trên các dòng đó. Chấm giọng bằng `score_spk.py` (`line_1s`).
- Chia dev/kiểm như kế hoạch 01: dev (chọn tham số) là AMI `ES2004a`, `TS3003a`; tiếng Việt seed 0 hội thoại 01, 02 (thường, Opus);
  mọi bản seed 1. Kiểm (chỉ báo cáo): AMI `IS1009a`, `EN2002a`; tiếng Việt seed 0 hội thoại 03–06 (thường, Opus).

## Số đo tín hiệu trên fixture (Task 5 Step 4)

Độ khớp của `SpeakingTracker` với sự thật khi đẩy mẫu mỗi 250 ms bằng ảnh chụp gần nhất (như bộ đọc thật), trên fixture ẩn danh:
Teams (cửa sổ đóng) Lan 0,952, Minh 0,961; Teams (cửa sổ mở) Lan 0,957, Minh 0,957; Meet 0,890 (ngưỡng ≥ 0,80, đo ở ô của **chính
người dùng** trong cửa sổ của họ; ở cửa sổ chủ phòng Meet không có chỉ báo cho người ở xa nên Meet tắt mặc định, QĐ 32). Ngưỡng
không bị hạ, công thức không chỉnh.

## Ghép tên khi tắt tách giọng

Đúng / sai / chưa tên (%), 6 điều kiện, các bản ghi kiểm:

| Bản ghi | Dòng | 600 ms, 0 | 600 ms, 0,1 | 900 ms, 0 | 900 ms, 0,1 | 1 300 ms, 0 | 1 300 ms, 0,1 |
|---|---|---|---|---|---|---|---|
| IS1009a | 154 | 88,3 / 3,2 / 8,4 | 88,3 / 3,2 / 8,4 | 88,3 / 3,2 / 8,4 | 88,3 / 3,2 / 8,4 | 88,3 / 3,2 / 8,4 | 88,3 / 3,2 / 8,4 |
| EN2002a | 501 | 72,3 / 5,8 / 22,0 | 72,3 / 5,8 / 22,0 | 72,3 / 5,8 / 22,0 | 72,3 / 5,8 / 22,0 | 72,3 / 5,8 / 22,0 | 72,3 / 5,8 / 22,0 |
| cv-vi-03 | 81 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 |
| cv-vi-03-opus | 80 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 | 98,8 / 1,2 / 0,0 |
| cv-vi-04 | 85 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 |
| cv-vi-04-opus | 86 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 |
| cv-vi-05 | 85 | 96,5 / 3,5 / 0,0 | 96,5 / 3,5 / 0,0 | 96,5 / 3,5 / 0,0 | 96,5 / 3,5 / 0,0 | 96,5 / 3,5 / 0,0 | 96,5 / 3,5 / 0,0 |
| cv-vi-05-opus | 84 | 31,0 / 0,0 / 69,0 | 31,0 / 0,0 / 69,0 | 31,0 / 0,0 / 69,0 | 31,0 / 0,0 / 69,0 | 31,0 / 0,0 / 69,0 | 31,0 / 0,0 / 69,0 |
| cv-vi-06 | 82 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 |
| cv-vi-06-opus | 80 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 | 100,0 / 0,0 / 0,0 |

Các dòng **y hệt nhau ở cả sáu điều kiện** (từng byte của JSONL kết quả, đã kiểm bằng `cmp` ở hai bản ghi): ghép tên theo thời gian
trùng cộng dồn cả phiên nên chịu được chỉ báo trễ 0,6–1,3 s và mất 10% lượt đọc (giải thích khả dĩ, chưa kiểm: độ trễ lệch với mốc 900 ms của công thức chỉ dời
vài trăm ms trên mỗi lượt nói dài vài giây, vẫn trên ngưỡng 60%). Kiểm độ nhạy (ngoài kế hoạch, một lần, không ghi vào dữ liệu thô):
mất 0,3; 0,5; 0,8 không đổi kết quả ở `cv-vi-01`, mất 0,95 làm `cv-vi-01` không còn tên nào (0 / 0 / 100) còn `IS1009a` đổi ở 0,8
(92,2 / 5,8 / 1,9) và quay về 88,3 / 3,2 / 8,4 ở 0,95, nên dữ liệu không cho thấy một ngưỡng mất rõ ràng nào.

Tổng hợp cả 28 bản ghi (cùng số ở mọi điều kiện, nên chỉ ghi một cột kết quả cho mỗi điều kiện):

| Độ trễ | Mất | Đúng TB | Đúng thấp nhất | Sai TB | Sai lớn nhất | Chưa TB |
|---|---|---|---|---|---|---|
| 600 ms | 0 | 87,3 | 28,0 (cv-vi-05-opus) | 1,8 | 5,8 (ES2004a.Mix-Headset) | 10,8 |
| 600 ms | 0,1 | 87,3 | 28,0 (cv-vi-05-opus) | 1,8 | 5,8 (ES2004a.Mix-Headset) | 10,8 |
| 900 ms | 0 | 87,3 | 28,0 (cv-vi-05-opus) | 1,8 | 5,8 (ES2004a.Mix-Headset) | 10,8 |
| 900 ms | 0,1 | 87,3 | 28,0 (cv-vi-05-opus) | 1,8 | 5,8 (ES2004a.Mix-Headset) | 10,8 |
| 1 300 ms | 0 | 87,3 | 28,0 (cv-vi-05-opus) | 1,8 | 5,8 (ES2004a.Mix-Headset) | 10,8 |
| 1 300 ms | 0,1 | 87,3 | 28,0 (cv-vi-05-opus) | 1,8 | 5,8 (ES2004a.Mix-Headset) | 10,8 |

Hai điểm yếu **không do tách giọng**: (1) `cv-vi-05` Opus (seed 0) và ba bản gộp của seed 1 gộp hai người làm một giọng nên 57–71% dòng
"chưa tên" (spec: thà "Người N" còn hơn sai tên; đúng ưu tiên 2); (2) `ES2004a` (5,8%) và `EN2002a` (5,8%) có sai tên > 5% **ngay khi tắt
tách giọng** (AMI có nói chồng nhiều; chỉ báo giả không mô phỏng nói chồng). Tiêu chí "sai tên ≤ 5%" của kế hoạch vì vậy không thể đạt
cho hai bản AMI này bằng bất kỳ cấu hình tách giọng nào.

## Lưới ngưỡng tách giọng

Phần dev (18 bản ghi), 900 ms, mất 0; `Δ` là `line_1s` bật trừ tắt (điểm %). ĐẠT khi tệ nhất ≥ −1 điểm **và** sai tên lớn nhất ≤ 5,0%.

| `split_share` | `split_max_cosine` | Δ trung bình | Δ tệ nhất | Δ tốt nhất | Sai tên lớn nhất | Kết quả |
|---|---|---|---|---|---|---|
| 0,2 | 0,8 / 0,85 / 0,9 | +3,94 | −4,76 | +26,14 | 5,8% | loại |
| 0,25 | 0,8 / 0,85 / 0,9 | +3,81 | −4,76 | +25,00 | 5,8% | loại |
| 0,3 | 0,8 / 0,85 / 0,9 | +3,81 | −4,76 | +25,00 | 5,8% | loại |

Ba mức `split_max_cosine` cho **đúng cùng** số ở mọi `split_share` (điều kiện tâm khác nhau không bao giờ là cái chặn trên dữ liệu
này); chín cặp đều bị loại, bởi hai chỗ: (a) `cv-vi-06` Opus seed 1: 94,0 → 89,3 (−4,76 điểm; thêm một giọng, 3 người nhưng 4 giọng),
(b) sai tên lớn nhất 5,8% là của `ES2004a` và bằng nhau khi tắt (xem trên: không do tách giọng, nhưng tiêu chí của kế hoạch đếm mọi
bản). Chính điểm (a) đủ để loại cả chín cặp.

## Kiểm (tham khảo) và độ bền

Theo kế hoạch, Step 7 chỉ chạy khi có cặp ĐẠT ở Step 6; không có nên **không có cặp nào được chọn**. Để chủ dự án thấy bức tranh đầy
đủ, Step 7 vẫn được chạy trên cặp có mức tăng trung bình lớn nhất (`split_share` 0,2; `split_max_cosine` 0,8, cos không ảnh hưởng)
trên cả 28 bản ghi × 6 điều kiện (số thô trong `$DATA/out/04/`, tệp `*-chon.jsonl`). **Đây là số tham khảo, không phải cặp đã chốt.**

Ba tiêu chí đặt `split = true` làm mặc định:

1. **Bốn bản hỏng vì gộp (900 ms, mất 0): đạt 4/4.** `line_1s` tăng +28,0 (seed 0 05 Opus: 67,7 → 95,7), +20,2 (seed 1 04 Opus: 74,5 → 94,7),
   +21,8 (seed 1 05: 75,9 → 97,7), +26,1 (seed 1 05 Opus: 72,7 → 98,9); đúng tên tăng từ 28,0–41,7% lên 96,4–98,8%.
2. **Mọi bản khác: KHÔNG đạt.** `line_1s` giảm quá 1 điểm so với tắt ở cùng điều kiện ở **19/144** ô (24 bản không hỏng × 6 điều kiện):
   seed 0 `cv-vi-06` thường −2,3 (cả 6 điều kiện); seed 0 `cv-vi-06` Opus −2,3 ở 4 điều kiện, **−16,3** ở 900 ms mất 0,1 và −4,7 ở 1 300 ms
   mất 0,1; seed 1 `cv-vi-06` Opus −4,8 (mất 0; 1 300 ms mất 0,1 cũng −4,8) và −3,6 (600 và 900 ms mất 0,1); seed 0 `cv-vi-01` 900 ms mất 0,1 −2,2.
   Ở 900 ms, mất 0 đúng tên vẫn 100% (hoặc tăng) ở cả ba bản `cv-vi-06`: giọng bị tách thành thêm một giọng (3 người, 4–5 giọng) nên `line_1s`
   giảm; mất lượt đọc làm nặng thêm ở vài ô.
   Hai bản AMI có sai tên 5,8% cả khi tắt (xem trên).
3. **Sai tên > 5% khi bật mà ≤ 5% khi tắt: 1 ô** (`cv-vi-05` Opus, 1 300 ms, mất 0,1: 0,0% → 9,5%). Không đạt.

Bảng 28 bản ghi ở 900 ms, mất 0 (dev/kiểm, tắt và bật; "Đổi giọng" là số đoạn bị đổi giọng sau `Assign` đầu):

| Tập | Bản ghi | Phần | line_1s tắt | line_1s bật | Giọng tắt/bật/người | Đúng tên tắt → bật | Sai tắt → bật | Chưa tắt → bật | Đổi giọng |
|---|---|---|---|---|---|---|---|---|---|
| AMI | EN2002a | kiểm | 87,3 | 86,7 | 8/8/4 | 72,3 → 71,7 | 5,8 → 5,4 | 22,0 → 23,0 | 5 |
| AMI | ES2004a | dev | 93,3 | 93,3 | 5/5/4 | 93,7 → 93,7 | 5,8 → 5,8 | 0,5 → 0,5 | 0 |
| AMI | IS1009a | kiểm | 89,6 | 93,9 | 5/6/4 | 88,3 → 94,2 | 3,2 → 3,9 | 8,4 → 1,9 | 5 |
| AMI | TS3003a | dev | 98,2 | 98,2 | 4/4/4 | 98,2 → 98,2 | 1,8 → 1,8 | 0,0 → 0,0 | 0 |
| vi seed 0 | cv-vi-01 | dev | 93,5 | 93,5 | 5/5/4 | 94,0 → 94,0 | 4,8 → 4,8 | 1,2 → 1,2 | 0 |
| vi seed 0 | cv-vi-01-opus | dev | 96,7 | 96,7 | 5/5/4 | 96,4 → 96,4 | 2,4 → 2,4 | 1,2 → 1,2 | 0 |
| vi seed 0 | cv-vi-02 | dev | 92,5 | 92,5 | 4/4/4 | 100,0 → 100,0 | 0,0 → 0,0 | 0,0 → 0,0 | 0 |
| vi seed 0 | cv-vi-02-opus | dev | 92,5 | 100,0 | 4/4/4 | 95,1 → 100,0 | 4,9 → 0,0 | 0,0 → 0,0 | 5 |
| vi seed 0 | cv-vi-03 | kiểm | 97,8 | 97,8 | 3/3/3 | 98,8 → 98,8 | 1,2 → 1,2 | 0,0 → 0,0 | 0 |
| vi seed 0 | cv-vi-03-opus | kiểm | 97,7 | 97,7 | 3/3/3 | 98,8 → 98,8 | 1,2 → 1,2 | 0,0 → 0,0 | 0 |
| vi seed 0 | cv-vi-04 | kiểm | 98,9 | 98,9 | 3/3/3 | 100,0 → 100,0 | 0,0 → 0,0 | 0,0 → 0,0 | 0 |
| vi seed 0 | cv-vi-04-opus | kiểm | 99,0 | 99,0 | 3/3/3 | 100,0 → 100,0 | 0,0 → 0,0 | 0,0 → 0,0 | 0 |
| vi seed 0 | cv-vi-05 | kiểm | 94,7 | 94,7 | 4/4/4 | 96,5 → 96,5 | 3,5 → 3,5 | 0,0 → 0,0 | 0 |
| vi seed 0 | cv-vi-05-opus | kiểm | 67,7 | 95,7 | 3/4/4 | 31,0 → 96,4 | 0,0 → 3,6 | 69,0 → 0,0 | 3 |
| vi seed 0 | cv-vi-06 | kiểm | 97,7 | 95,5 | 4/5/3 | 100,0 → 100,0 | 0,0 → 0,0 | 0,0 → 0,0 | 8 |
| vi seed 0 | cv-vi-06-opus | kiểm | 97,7 | 95,3 | 3/4/3 | 100,0 → 100,0 | 0,0 → 0,0 | 0,0 → 0,0 | 8 |
| vi seed 1 | cv-vi-01 | dev | 97,5 | 97,5 | 4/4/3 | 98,6 → 98,6 | 1,4 → 1,4 | 0,0 → 0,0 | 0 |
| vi seed 1 | cv-vi-01-opus | dev | 98,8 | 98,8 | 3/3/3 | 98,6 → 98,6 | 1,4 → 1,4 | 0,0 → 0,0 | 0 |
| vi seed 1 | cv-vi-02 | dev | 95,1 | 95,1 | 4/4/4 | 98,6 → 98,6 | 1,4 → 1,4 | 0,0 → 0,0 | 0 |
| vi seed 1 | cv-vi-02-opus | dev | 96,3 | 96,3 | 4/4/4 | 98,6 → 98,6 | 1,4 → 1,4 | 0,0 → 0,0 | 0 |
| vi seed 1 | cv-vi-03 | dev | 93,5 | 93,5 | 4/4/3 | 97,7 → 97,7 | 1,2 → 1,2 | 1,2 → 1,2 | 0 |
| vi seed 1 | cv-vi-03-opus | dev | 92,4 | 92,4 | 5/5/3 | 96,5 → 96,5 | 1,2 → 1,2 | 2,4 → 2,4 | 0 |
| vi seed 1 | cv-vi-04 | dev | 93,5 | 93,5 | 6/6/3 | 97,6 → 97,6 | 1,2 → 1,2 | 1,2 → 1,2 | 0 |
| vi seed 1 | cv-vi-04-opus | dev | 74,5 | 94,7 | 4/5/3 | 41,7 → 96,4 | 1,2 → 1,2 | 57,1 → 2,4 | 3 |
| vi seed 1 | cv-vi-05 | dev | 75,9 | 97,7 | 3/4/3 | 30,9 → 97,5 | 1,2 → 1,2 | 67,9 → 1,2 | 3 |
| vi seed 1 | cv-vi-05-opus | dev | 72,7 | 98,9 | 2/3/3 | 28,0 → 98,8 | 1,2 → 1,2 | 70,7 → 0,0 | 4 |
| vi seed 1 | cv-vi-06 | dev | 100,0 | 100,0 | 3/3/3 | 100,0 → 100,0 | 0,0 → 0,0 | 0,0 → 0,0 | 0 |
| vi seed 1 | cv-vi-06-opus | dev | 94,0 | 89,3 | 3/4/3 | 95,9 → 100,0 | 4,1 → 0,0 | 0,0 → 0,0 | 4 |

## Kết luận cho spec

- **Tách giọng (spec §5.3): không đạt. Giữ `SpeakerConfig::default().split = false`, `split_share = 0,25`, `split_max_cosine = 0,85` như cũ**
  (không sửa `speaker-protocol`). Không hạ ngưỡng của kế hoạch.
- Tách giọng có tác dụng rõ nơi nó cần (+20 đến +28 điểm `line_1s` ở cả bốn bản hỏng vì gộp, đúng tên 28–42% → 96–99%), nhưng làm
  hỏng 19/144 ô của các bản không hỏng (tệ nhất −16,3 điểm), vì nó tách nhầm thêm một giọng cho người chưa bị gộp (ở ba bản `cv-vi-06` ngay cả khi chỉ báo không mất lượt nào), và mất 10% lượt đọc làm nặng thêm. Đề xuất
  cho chủ dự án: (a) giữ tắt cho tới kế hoạch 07 (họp thật, A-spk3), (b) nếu muốn tiếp, làm một vòng chặt điều kiện tách (ví dụ nâng
  `split_min_ms`, `split_min_segments`, hoặc chỉ tách giọng có dấu hiệu gộp lâu dài) rồi chạy lại lưới này, (c) cân nhắc đổi cách đo
  tiêu chí 2 và 3 sang "không kém hơn khi tắt" (mức sai tên 5,8% của `ES2004a`/`EN2002a` có ngay khi tắt tách giọng, nên tiêu chí
  tuyệt đối "≤ 5%" không thể đạt trên hai bản AMI này).
- Ghép tên (spec §6.6) khi tắt tách giọng: trung bình đúng 87,3%, sai 1,8%, chưa tên 10,8% trên 28 bản ghi, cùng số ở mọi độ trễ
  600–1 300 ms và mức mất 0–0,1; tên sai lớn nhất 5,8% (AMI nói chồng); ca "chưa tên" nhiều nhất là bản gộp hai người (không tên còn hơn
  sai tên).

## Giới hạn

- Chỉ báo là **giả lý tưởng**: dựng từ RTTM, không có nói chồng ngoài RTTM, không lệch mốc giờ giữa đồng hồ âm thanh và đồng hồ hệ
  thống, mất lượt ngẫu nhiên đều (không theo cụm), không đổi giao diện, không có ô trùng tên. Số thật (A-spk3, kế hoạch 07) sẽ kém hơn.
- Dữ liệu giọng đọc sạch: AMI là họp thật nhưng mic gần; tiếng Việt là Common Voice ghép (chỉ 3–4 người, đoạn ngắn).
- 28 bản ghi là 4 cuộc họp AMI cộng 12 hội thoại tiếng Việt mỗi seed, mỗi hội thoại có bản thường và bản Opus (hai bản cùng nội dung,
  không độc lập). Một dòng ≈ 1 điểm ở bản ngắn (80–100 dòng), nên chênh 1–2 điểm là một hai dòng.
- Các số của lưới chỉ dùng chỉ báo 900 ms, mất 0; độ bền (Step 7) chỉ đo với một cặp tham khảo.

## Chạy lại

```sh
# Dựng (đĩa còn ≥ 18 GiB)
CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release -p latency-bench
# Step 5 (tắt tách giọng, 28 bản × 3 độ trễ × 2 mức mất): mỗi bản
latency-bench speaker-names-eval --embeddings-in $f.emb.json --rttm $f.rttm --on-ms $on --miss $miss --out $j
# Step 6 (lưới, phần dev, 900 ms, mất 0): thêm --split --split-share {0.2,0.25,0.3} --split-max-cosine {0.8,0.85,0.9}
# Step 7 (28 bản × 6 điều kiện, cặp tham khảo): --split --split-share 0.2 --split-max-cosine 0.8
# Chấm giọng: $DATA/venv/bin/python -I $B/score_spk.py $j $f.rttm
```

Mỗi dòng tóm tắt của lệnh là một JSON (`file`, `on_ms`, `miss`, `split`, `lines`, `correct_pct`, `wrong_pct`, `unnamed_pct`, `voices`,
`moved`). Dữ liệu thô: `$DATA/out/04/{names,voices}.jsonl` (498 dòng mỗi file) và JSONL từng lượt chạy cạnh đó.
