# Windows: nhúng giọng bằng ONNX Runtime thay candle (bước 1A, 2026-10-30)

Câu hỏi: `speaker-worker` trên i5 vượt ngân sách CPU và làm chậm phụ đề (`02-windows.md`, `07-nghiem-thu.md` mục Windows). Đổi bộ
chạy model sang ONNX Runtime **chỉ trên Windows** (macOS giữ candle, không biên dịch phần mới) có đưa A-spk4, A-spk5 về mức đạt
không, mà không đổi kết quả gán giọng?

Máy, cách đo, dữ liệu: như `02-windows.md` (A-spk5) và mục "A-spk4 trên i5" của `07-nghiem-thu.md` (gói Nhẹ của máy, phiên S6
`en`, `mixed`). Worker mới dựng tại chỗ (`cargo build --release -p speaker-worker`, nhánh `speaker/ort-windows`), so với worker của
bản cài 0.5.1.

## Chọn bộ chạy

Đo riêng một lần nhúng ERes2Net (cùng file model, đầu vào `[1, T, 80]`), ghim lõi bằng `start /AFFINITY`:

| Bộ chạy | Lõi P, đoạn 4 s | Lõi E, đoạn 4 s | Ghi chú |
|---|---|---|---|
| candle 0.11 (bản 0.5.1, 2 luồng) | nhúng tb 244 ms (đoạn ≤ 4 s, trong worker) | 376 ms | |
| candle dựng `+avx2,+fma,+f16c` | 227 ms | 379 ms | CPU chỉ giảm ~3%: không đáng đổi |
| tract 0.23.9 (thuần Rust, 1 luồng) | 371 ms | 675 ms | chậm hơn candle |
| ONNX Runtime 1.31.1, 1 luồng | 141 ms (CPU 133 ms) | 319 ms | |
| **ONNX Runtime 1.31.1, 2 luồng** | **79,5 ms** (CPU 158 ms) | **171,5 ms** | chọn |

Ràng buộc và cách làm (`crates/speaker-worker/src/ort.rs`):
- Crate `ort` chưa có bản ổn định (mới nhất `2.0.0-rc.15`), trái spec §6.12: gọi thẳng C API ổn định của ONNX Runtime (bảng con trỏ
  `OrtApi`, chỉ số lấy từ `onnxruntime_c_api.h` 1.31.1, yêu cầu `ORT_API_VERSION` 31), không thêm crate nào.
- **Bản chính thức của Microsoft bật telemetry mặc định** (`Privacy.md` trong gói 1.31.1). Kiểm chính DLL Windows 1.31.1 (gói zip
  và wheel PyPI, cùng commit `6af1a93`): không nhập WinHTTP/Winsock, không có chuỗi `WinHttpOpen` hay địa chỉ 1DS
  (`events.data.microsoft.com`), có `EventRegister`: telemetry là sự kiện TraceLogging/ETW, Windows có thể gửi về Microsoft theo
  thiết lập dữ liệu chẩn đoán của máy (tài liệu nêu bộ gửi 1DS qua HTTPS cho các bản khác). Không hợp với worker không gửi gì: bản phát hành dựng `onnxruntime.dll` từ mã nguồn tag `v1.31.1` với `--no_telemetry`
  (`build-sidecars-windows.mjs`), CRT tĩnh, và `release-check.mjs deps-windows --no-network` chặn DLL nhập Winsock/WinHTTP/WinINet.
  Worker vẫn đặt `ORT_DISABLE_TELEMETRY=1` (đầu `main`, trước khi có luồng) và gọi `DisableTelemetryEvents`.
- Worker nạp `onnxruntime.dll` cạnh nó bằng đường dẫn tuyệt đối (`LoadLibraryExW`, chỉ tìm DLL phụ thuộc ở thư mục đó và System32),
  không import thẳng (vẫn đạt `--no-local-libs`, `/DEPENDENTLOADFLAG:0x800`). App đã kiểm SHA-256 mọi file trong thư mục tiến trình
  phụ, kể cả DLL này. Không có DLL dùng được thì worker dùng candle như cũ và ghi bộ chạy ra log (`bộ chạy model …`).
- Phiên dựng từ chính các byte model đã băm; tắt spinning của bộ luồng và arena bộ nhớ; 2 luồng như `RAYON_NUM_THREADS` app đặt.

**Số đo ở file này dùng `onnxruntime.dll` của bản chính thức** (đã kiểm SHA-256 gói), vì lệnh dựng ONNX Runtime từ mã nguồn trên máy
này bị bộ kiểm duyệt tự động của phiên làm việc chặn; worker chạy với `ORT_DISABLE_TELEMETRY=1`. Bản tự dựng `--no_telemetry` chưa
đo (cùng mã nguồn, cùng cờ tối ưu; cần đo lại khi có).

## Kết quả gán giọng

`score_spk.py` trên AMI IS1009a: **giống hệt candle từng đoạn** (261/261 đoạn cùng nhãn giọng; dòng ≥ 1 s 89,6%, mọi dòng 86,1%,
5 giọng). Test `onnxruntime_engine_matches_candle_on_the_real_model` (Windows, `#[ignore]`, cần model và DLL): cosine giữa hai bộ chạy
≥ 0,99999 ở 1, 2, 4, 8 s, và ≥ 0,999 so với bản tham chiếu `embed_ref.f32`.

## A-spk5 (worker)

| Điều kiện | candle 0.5.1 | ONNX Runtime |
|---|---|---|
| Không ghim, máy rảnh | trung vị 16,1% (12,5–26,7; 8 lượt) | **4,87 / 5,06 / 5,68 / 6,08 / 6,87%** (5 lượt sạch) |
| Ghim lõi P | 13,49% (2 lượt) | **5,62 / 5,52%** |
| Ghim lõi E | 20,70% (2 lượt) | **11,75 / 11,48%** |
| Nhúng trung bình (không ghim) | 230–430 ms | 97 ms |
| Khứ hồi p50 / p90 (không ghim) | 178–388 / 430–856 ms | 62–81 / 157–197 ms |
| Xong ≤ 230 ms | 64–139 / 226 | 211–223 / 226 |
| RAM đỉnh (`PeakWorkingSet64`) | 77–79 MB | 112 MB (RSS `sysinfo` 100–103 MB) |

Ngân sách ≤ 10% một lõi: **đạt** khi không ghim và ở lõi P; ở lõi E (trường hợp xấu nhất, khi Windows dồn worker ưu tiên thấp sang
lõi E) 11,75%, hơi trên mức theo %CPU, nhưng lõi E tốn ít năng lượng hơn cho cùng việc (spec đo ngân sách theo lệnh và năng lượng ở
Task 9; chưa có công cụ đo năng lượng trên Windows). RAM ≤ 250 MB: đạt.

Hai lượt không ghim và một lượt lõi P khác (8,9–10,1%, 6,73%) **không tính**: chạy trùng lúc dựng `cargo check`/clippy trên cùng máy;
đã chạy lại (hai lượt `ort-3`, một lượt `P-ort-3` ở bảng trên).

## A-spk4 (phiên thật)

Như mục "A-spk4 trên i5" của `07-nghiem-thu.md` (cùng tiến trình phụ 0.5.1, cùng model gói Nhẹ, `khong-app.recipes.json`), lượt bật
dùng worker ONNX Runtime. 12 cặp: lượt 1–3 lúc 22:10–22:49, lượt 4–6 lúc 22:50–23:29 (thêm vì khoảng tin cậy của 6 cặp đầu quá rộng do
hai lượt tắt nhiễu). Tải `LoadPercentage` 0–68% trước/sau lượt (máy có người dùng), không tiến trình phụ lạ chen.

| Session | Lượt | Chế độ | A2 p50 | A2 p90 | Chữ đầu p50 | Nhãn (đúng lúc / muộn) | Khứ hồi p50 / p90 | ≤ 230 ms | CPU worker tb, RSS |
|---|---|---|---|---|---|---|---|---|---|
| en | 1 | tắt | 1835 | 2524 | 741 | — | — | — | — |
| en | 1 | bật | 1817 | 2428 | 766 | 51 (49 / 2) | 94 / 164 | 48/50 | 4,4%, 96 MB |
| en | 2 | tắt | 2076 | 2662 | 798 | — | — | — | — |
| en | 2 | bật | 1813 | 2472 | 779 | 51 (50 / 1) | 94 / 231 | 45/50 | 5,5%, 95 MB |
| en | 3 | tắt | 1812 | 2410 | 757 | — | — | — | — |
| en | 3 | bật | 1823 | 2401 | 753 | 51 (50 / 1) | 93 / 156 | 49/50 | 4,2%, 93 MB |
| en | 4 | tắt | 1885 | 3174 | 806 | — | — | — | — |
| en | 4 | bật | 1802 | 2411 | 754 | 51 (50 / 1) | 94 / 162 | 49/50 | 4,3%, 92 MB |
| en | 5 | tắt | 1809 | 2438 | 747 | — | — | — | — |
| en | 5 | bật | 1800 | 2403 | 748 | 51 (50 / 1) | 94 / 156 | 49/50 | 4,3%, 94 MB |
| en | 6 | tắt | 2086 | 3095 | 809 | — | — | — | — |
| en | 6 | bật | 1813 | 2461 | 792 | 51 (49 / 2) | 94 / 168 | 47/50 | 4,8%, 92 MB |
| mixed | 1 | tắt | 1641 | 2372 | 945 | — | — | — | — |
| mixed | 1 | bật | 1650 | 2365 | 992 | 77 (74 / 3) | 91 / 175 | 73/74 | 6,1%, 95 MB |
| mixed | 2 | tắt | 1656 | 2885 | 1150 | — | — | — | — |
| mixed | 2 | bật | 1710 | 2462 | 1006 | 77 (72 / 5) | 101 / 255 | 63/74 | 8,1%, 94 MB |
| mixed | 3 | tắt | 1601 | 2407 | 933 | — | — | — | — |
| mixed | 3 | bật | 1610 | 2416 | 957 | 77 (73 / 4) | 94 / 175 | 72/74 | 6,4%, 93 MB |
| mixed | 4 | tắt | 1611 | 2393 | 952 | — | — | — | — |
| mixed | 4 | bật | 1643 | 2405 | 1010 | 77 (74 / 3) | 94 / 172 | 72/74 | 6,3%, 96 MB |
| mixed | 5 | tắt | 1632 | 2393 | 929 | — | — | — | — |
| mixed | 5 | bật | 1609 | 2381 | 981 | 77 (72 / 5) | 94 / 184 | 71/74 | 6,6%, 75 MB |
| mixed | 6 | tắt | 1616 | 2373 | 944 | — | — | — | — |
| mixed | 6 | bật | 1625 | 2400 | 992 | 77 (73 / 4) | 93 / 169 | 73/74 | 6,2%, 77 MB |

Mọi lượt: đủ câu đo (21/21, 20/20), 0 khởi động lại, 0 `Skip`, 0 câu dịch lỗi, hàng đợi dịch dài nhất 1, `feed_lag_max_ms` 5–34.

| Chỉ số (12 cặp) | Chênh tb | Từng cặp (en 1–6, mixed 1–6) | KTC 95% | Mức | Kết luận |
|---|---|---|---|---|---|
| A2 p50 | −45,5 | −18, −263, +11, −83, −10, −273, +9, +54, +8, +32, −23, +9 | [−108,4; +17,4] | ≤ +20 | **đạt** |
| A2 p90 | −176,7 | −96, −190, −9, −763, −35, −634, −7, −423, +9, +12, −12, +27 | [−335,9; −17,5] | ≤ +50 | **đạt** |
| Chữ đầu p50 | +1,4 | +25, −19, −4, −52, +1, −17, +46, −144, +24, +58, +52, +48 | [−31,5; +34,2] | ≤ +20 | **chưa đạt** (cận trên +34,2) |

Theo session: `en` A2 p50 −105,8 [−241,6; +30,0], chữ đầu −11,2 [−38,0; +15,6]; `mixed` A2 p50 +14,8 [−12,4; +42,0], chữ đầu +14,0
[−67,9; +95,8]. Ở `mixed`, chữ đầu của lượt bật chậm hơn +24 … +58 ms ở 5/6 cặp (cặp còn lại −144 do lượt tắt nhiễu): nhiều khả năng do
lúc kết thúc câu, nhúng (2 luồng) tranh lõi P với phần CPU của nhận dạng; `en` không thấy. Các chênh âm lớn của A2 (−263, −273,
−763, −634) là lượt **tắt** bị nhiễu (tải máy), không phải bật làm nhanh hơn.

So với candle 0.5.1 trên cùng máy (`07-nghiem-thu.md`): A2 p50 +12,9 → −45,5; p90 +49,4 → −176,7; chữ đầu +17,6 → +1,4 (trung bình);
nhãn tới đúng lúc 35–55% → 94–98%; khứ hồi p50 300–411 → 91–101 ms; CPU worker cả phiên 14–18% → 4,2–8,1% (mức spec ≤ 8%).

## ONNX Runtime 1 luồng (2026-10-31)

Đổi `ort::THREADS` từ số luồng rayon (2) xuống 1; đo lại cùng điều kiện (DLL chính thức của Microsoft, chưa phải bản tự dựng).

| Cấu hình | A-spk5 không ghim | lõi P | lõi E | RAM đỉnh |
|---|---|---|---|---|
| candle 0.5.1 | 16,1% | 13,5% | 20,7% | — |
| ORT 2 luồng | 4,9–6,9% | 5,6% | 11,5% | ~112 MB |
| ORT 1 luồng | 3,6–3,7% | 3,6% | 7,8% | ~102 MB |

- Nhãn giọng 261 đoạn giống hệt bản 2 luồng ở cả 6 lượt (không ghim, lõi P, lõi E). Khứ hồi lõi P p50 ~73 ms, 225/226 đoạn xong ≤ 230 ms.
- A-spk4 (12 cặp): A2 p50 +1,6 [−24,3; +27,5] (không đạt, 2 luồng đạt); A2 p90 +7,5 [−3,9; +18,9] đạt; chữ đầu p50 +13,7 [−9,1; +36,5]
  (không đạt). Phiên `en` đạt cả ba chỉ số; phiên `mixed` chậm thêm ~+45 ms ở chữ đầu (5/6 cặp), giống bản 2 luồng.
- Độ trễ này không đổi theo số luồng dù worker chỉ ~5% CPU, nên nhiều khả năng không do tranh CPU mà do đường xử lý khi bật nhận diện
  (chưa xác minh). A-spk5 lõi E nay đạt (7,8% ≤ 10%).
- Chọn 1 luồng.

## DLL tự dựng và nguyên nhân phiên `mixed` chậm (2026-10-31)

DLL tự dựng (`--no_telemetry`, CRT tĩnh, ONNX Runtime 1.31.1, 17,3 MB): nhập `KERNEL32`, `ADVAPI32`, `api-ms-win-core-path`, `dbghelp`,
`SETUPAPI`, `dxgi`; không DLL mạng, không chuỗi endpoint telemetry (còn nhật ký ETW cục bộ của ORT). Cùng worker 1 luồng:
A-spk5 3,6–3,7% (P 3,6%, E 7,8%), RAM ~100 MB, nhãn giống hệt DLL chính thức. A-spk4 12 cặp: A2 p50 +23,7 [+5,1; +42,4],
p90 +6,9 [−10,0; +23,7], chữ đầu p50 +26,1 [+2,3; +50,0]; phiên `en` đạt cả ba, `mixed` +50/+58 ms ở p50.

Nguyên nhân `mixed` (so từng câu, 6 cặp): 19/20 câu chỉ chậm thêm ~10–30 ms; một câu tiếng Hàn (bắt đầu 33,5 s) chậm thêm
+1,4 s chữ đầu ở cả 6/6 lượt bật. Ở câu đó nhận diện đổi giọng giữa câu (giọng 3 → 4 lúc 35,8 s), nên theo luật hàng dịch
(`queue.rs`: hai giọng đã biết khác nhau không gộp thành một dòng) câu bị tách hai dòng; phần cuối câu hiện chữ qua dòng gộp
muộn hơn. Chữ đầu của dòng đầu hiện cùng lúc (35,89 s) ở cả hai chế độ. Bỏ câu đó, độ lệch p50 còn +23 (chữ đầu) và +20 (A2)
ms, trung bình 6 cặp, từng cặp −18…+65. Vậy phần lớn "không đạt" là một câu lật hạng trung vị, không phải chi phí CPU, và đến
từ chuyện đổi giọng giữa câu (có thể là nhận nhầm: phiên `mixed` ghép nhiều clip, worker báo 8 giọng còn sống).

## Kết luận và việc còn lại

- A-spk5 (worker) đạt khi không ghim và ở lõi P; lõi E 11,5–11,8% với 2 luồng (7,8% với 1 luồng). Gán giọng giống hệt candle.
- A-spk4: A2 p50, p90 đạt; chữ đầu p50 chưa đạt theo cận trên (+34,2 so với +20), trung bình +1,4 ms. Hướng thử tiếp (mỗi hướng đo lại
  12 cặp): 1 luồng cho ONNX Runtime trên Windows (ít tranh lõi lúc kết thúc câu; nhúng 4 s vẫn ~141 ms ở lõi P), hay để worker chạy
  EcoQoS (dồn sang lõi E, nhường lõi P cho nhận dạng và dịch).
- Phải dựng `onnxruntime.dll` từ mã nguồn (`--no_telemetry`) và đo lại bằng chính DLL đó trước khi phát hành; CI Windows
  (`release.yml`) đã có bước này nhưng chưa chạy thật.
- `SHIPS_ON_WINDOWS` vẫn `false`: bật Windows còn chờ đọc tên (bước 2) hoặc quyết bật chỉ với "Người N".
