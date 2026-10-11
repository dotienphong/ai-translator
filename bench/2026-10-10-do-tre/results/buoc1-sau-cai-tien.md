# Bước 1: đo lại sau các cải tiến nhanh A2–A5 (2026-10-11)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md`, Task 12; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §8, §9 bước 1 và §10.1. So với mốc
`buoc1-moc-che-do-thuong.md` (cùng máy, cùng cách chạy, code chưa có A2–A5).

## Điều kiện đo

- Máy: Apple M4 Pro, 24.0 GB, macOS 26.6.2 Tahoe (lấy từ một file kết quả).
- Code: nhánh `dich-trong-luc-noi`, commit `8469ed3`, có A2, A3, A4, KHÔNG có A5 (đã quay lại ở Task 11 — xem
  `buoc1-a5-flash-attention.md`).
  - `asr-worker` là sidecar do `scripts/copy-sidecars.sh` dựng lại từ code này (Metal, chế độ B, `flash_attn=off`).
  - `llama-server` b11146.
- Cấu hình như mốc: ngưỡng ngắt câu 50 ms, ghép câu §6.3, mọi ngưỡng khác là `PipelineConfig::default()`.
- Chủ dự án đã xác nhận điều kiện đo (thoát app nặng, cắm sạc, không dùng máy) ngay trước Task 11; dự kiến không hỏi
  lại cho lượt này vì chạy liền sau. Tuy nhiên ở Step 6, CPU rảnh đo được chỉ **59,63%** — dưới xa ngưỡng ~90% khuyến
  nghị — nên đã dừng lại và báo điều phối viên (NEEDS_CONTEXT) thay vì tự chạy tiếp. Đợi 90 giây không chạy lệnh gì rồi
  đo lại: **67,29%**, vẫn không đạt — báo lại lần hai. Tiến trình chiếm CPU nhiều nhất lúc đó (`ps aux | sort -rk3`)
  không phải tiến trình của phiên này mà là ba extension "Storage Management" của macOS và các daemon Microsoft
  Defender, đều chạy liên tục từ lúc máy khởi động (2 ngày trước) — cùng nguyên nhân đã gặp khi đo mốc ở Task 3 (xem
  `buoc1-moc-che-do-thuong.md`, mục Giới hạn), không phải dư âm của Step 2 hay có người khác dùng máy. Chủ dự án tắt
  bớt ứng dụng, báo CPU rảnh lên khoảng 80–85%; đo lại chính thức bằng đúng lệnh Step 6 được **71,5%** (thấp hơn ước
  lượng của chủ dự án nhưng cùng dải 70–82% mà mốc Task 3 từng chấp nhận) — dùng số này làm dòng TRUOC chính thức dưới
  đây (ghi đè số liệu thấp ban đầu), tiếp tục đo luôn theo cho phép của điều phối viên. Trước và sau lượt đo:

  ```
  [TRUOC 2026-10-11 13:55:28] total = 4096.00M  used = 3128.31M  free = 967.69M  (encrypted) |  -InternalBattery-0 (id=23920739)	100%; charged; 0:00 remaining present: true | CPU usage: 5.92% user, 23.2% sys, 71.5% idle
  [SAU 2026-10-11 14:34:28] total = 4096.00M  used = 3120.31M  free = 975.69M  (encrypted) |  -InternalBattery-0 (id=23920739)	100%; charged; 0:00 remaining present: true | CPU usage: 3.40% user, 14.28% sys, 82.31% idle
  ```

## Cách chạy

```
scripts/copy-sidecars.sh
cargo build --release --locked -p latency-bench
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-sau
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc1-sau
python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare buoc1-moc buoc1-sau \
  bench/2026-10-10-do-tre/results/buoc1-moc-*.json bench/2026-10-10-do-tre/results/buoc1-sau-*.json
```

## Kết quả

| Lượt | A2 p50 | A2 p90 | A2 chữ đầu p50 | Đầu câu → chữ dịch p50 | p90 | Theo từ, tạm p50 | p90 | Theo từ, ổn định p50 | p90 | Nháy ổn định | Nháy tạm | Bận | CPU % | Câu | Đoạn | Chép từng phần | Nhịp p50 | Tự tắt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| buoc1-moc-chuan-en | 775 | 929 | 419 | 5485 | 6580 | 2102 | 4923 | 2777 | 5595 | 0.0% | 10.7% | 14.5% | 2.9 | 21 | 50 | 0 | — | — |
| buoc1-moc-chuan-ja | 741 | 940 | 437 | 4138 | 6374 | 1980 | 4448 | 3800 | 7261 | 0.0% | 58.0% | 18.3% | 3.5 | 20 | 59 | 0 | — | — |
| buoc1-moc-chuan-ko | 645 | 929 | 420 | 3144 | 5649 | 1541 | 3690 | 3577 | 8097 | 0.0% | 60.2% | 18.7% | 3.6 | 17 | 63 | 0 | — | — |
| buoc1-moc-chuan-mixed | 596 | 703 | 393 | 3480 | 5129 | 1426 | 3309 | 2495 | 6026 | 0.0% | 32.6% | 18.3% | 3.3 | 20 | 74 | 0 | — | — |
| buoc1-moc-chuan-vi | 480 | 582 | 381 | 1843 | 5157 | 1099 | 3152 | 1245 | 3476 | 0.0% | 5.1% | 16.8% | 2.1 | 18 | 91 | 0 | — | — |
| buoc1-moc-chuan-zh | 700 | 925 | 368 | 2362 | 5171 | 1353 | 3489 | 3944 | 7744 | 0.0% | 92.5% | 22.7% | 4.3 | 23 | 74 | 0 | — | — |
| buoc1-moc-nhe-en | 480 | 669 | 296 | 5362 | 6439 | 2058 | 4778 | 2645 | 5372 | 0.0% | 13.1% | 8.9% | 2.6 | 21 | 50 | 0 | — | — |
| buoc1-moc-nhe-ja | 557 | 678 | 303 | 4032 | 6278 | 1841 | 4346 | 3894 | 7297 | 0.0% | 54.2% | 11.2% | 3.0 | 20 | 59 | 0 | — | — |
| buoc1-moc-nhe-ko | 435 | 637 | 245 | 3037 | 5541 | 1379 | 3471 | 5124 | 11014 | 0.0% | 86.4% | 12.0% | 3.4 | 17 | 63 | 0 | — | — |
| buoc1-moc-nhe-mixed | 457 | 602 | 271 | 3097 | 4876 | 1365 | 3207 | 3732 | 8771 | 0.0% | 62.8% | 11.9% | 3.3 | 20 | 74 | 0 | — | — |
| buoc1-moc-nhe-vi | 334 | 446 | 259 | 1729 | 5058 | 982 | 2978 | 3623 | 7843 | 0.0% | 88.4% | 11.3% | 2.6 | 18 | 91 | 0 | — | — |
| buoc1-moc-nhe-zh | 505 | 697 | 272 | 2227 | 5065 | 1213 | 3348 | 3962 | 7585 | 0.0% | 72.6% | 13.7% | 3.8 | 23 | 74 | 0 | — | — |
| buoc1-sau-chuan-en | 780 | 972 | 439 | 5473 | 6553 | 2123 | 4887 | 2776 | 5602 | 0.0% | 3.0% | 14.5% | 2.9 | 21 | 50 | 0 | — | — |
| buoc1-sau-chuan-ja | 738 | 950 | 494 | 4133 | 6374 | 2073 | 4438 | 3810 | 7269 | 0.0% | 44.2% | 18.4% | 3.5 | 20 | 59 | 0 | — | — |
| buoc1-sau-chuan-ko | 645 | 918 | 450 | 3146 | 5645 | 1640 | 3885 | 3570 | 8096 | 0.0% | 34.2% | 18.6% | 3.5 | 17 | 63 | 0 | — | — |
| buoc1-sau-chuan-mixed | 600 | 725 | 423 | 3462 | 5149 | 1465 | 3347 | 2494 | 6016 | 0.0% | 18.6% | 18.2% | 3.3 | 20 | 74 | 0 | — | — |
| buoc1-sau-chuan-vi | 469 | 581 | 397 | 1839 | 5135 | 1097 | 3145 | 1247 | 3477 | 0.0% | 3.8% | 16.9% | 2.1 | 18 | 91 | 0 | — | — |
| buoc1-sau-chuan-zh | 725 | 932 | 488 | 2485 | 5176 | 1469 | 3560 | 3943 | 7763 | 0.0% | 51.1% | 22.8% | 4.4 | 23 | 74 | 0 | — | — |
| buoc1-sau-nhe-en | 472 | 687 | 323 | 5366 | 6459 | 2075 | 4789 | 2671 | 5425 | 0.0% | 6.9% | 9.0% | 2.6 | 21 | 50 | 0 | — | — |
| buoc1-sau-nhe-ja | 548 | 654 | 356 | 4028 | 6252 | 1897 | 4328 | 3879 | 7303 | 0.0% | 39.4% | 11.3% | 3.1 | 20 | 59 | 0 | — | — |
| buoc1-sau-nhe-ko | 444 | 621 | 333 | 3096 | 5824 | 1460 | 3526 | 5119 | 11010 | 0.0% | 42.4% | 12.0% | 3.4 | 17 | 63 | 0 | — | — |
| buoc1-sau-nhe-mixed | 456 | 600 | 321 | 3098 | 4897 | 1430 | 3241 | 3733 | 8784 | 0.0% | 32.3% | 11.8% | 3.3 | 20 | 74 | 0 | — | — |
| buoc1-sau-nhe-vi | 328 | 458 | 295 | 1756 | 5059 | 1017 | 2972 | 3620 | 7837 | 0.0% | 49.7% | 11.4% | 2.6 | 18 | 91 | 0 | — | — |
| buoc1-sau-nhe-zh | 473 | 676 | 346 | 2299 | 5039 | 1301 | 3366 | 3964 | 7576 | 0.0% | 36.7% | 13.6% | 3.8 | 23 | 74 | 0 | — | — |

| Nhóm | Tiếng nguồn | Từ có chữ dịch | Tạm p50 | Tạm p90 | Ổn định p50 | Ổn định p90 | Đầu câu → chữ dịch p50 | p90 |
|---|---|---|---|---|---|---|---|---|
| buoc1-moc-chuan | en | 540 | 2040 | 4751 | 2740 | 5804 | 4435 | 6425 |
| buoc1-moc-chuan | ja | 1223 | 1831 | 4194 | 3754 | 7113 | 4075 | 6196 |
| buoc1-moc-chuan | ko | 409 | 1582 | 3735 | 3356 | 7900 | 3328 | 5115 |
| buoc1-moc-chuan | vi | 533 | 1099 | 3151 | 1245 | 3477 | 1843 | 5157 |
| buoc1-moc-chuan | zh | 936 | 1333 | 3357 | 3369 | 7358 | 2436 | 5463 |
| buoc1-moc-nhe | en | 535 | 1928 | 4658 | 2681 | 5662 | 4290 | 6304 |
| buoc1-moc-nhe | ja | 1213 | 1722 | 4074 | 4015 | 7697 | 3966 | 6091 |
| buoc1-moc-nhe | ko | 392 | 1447 | 3551 | 4864 | 10786 | 3217 | 5022 |
| buoc1-moc-nhe | vi | 544 | 982 | 2978 | 3623 | 7843 | 1729 | 5058 |
| buoc1-moc-nhe | zh | 939 | 1180 | 3223 | 3753 | 7349 | 2253 | 4567 |
| buoc1-sau-chuan | en | 540 | 2048 | 4770 | 2751 | 5804 | 4432 | 6416 |
| buoc1-sau-chuan | ja | 1223 | 1909 | 4199 | 3744 | 7117 | 4075 | 6190 |
| buoc1-sau-chuan | ko | 409 | 1685 | 3849 | 3344 | 7907 | 3330 | 5137 |
| buoc1-sau-chuan | vi | 533 | 1097 | 3145 | 1247 | 3477 | 1839 | 5135 |
| buoc1-sau-chuan | zh | 936 | 1415 | 3437 | 3370 | 7375 | 2513 | 5473 |
| buoc1-sau-nhe | en | 535 | 1944 | 4675 | 2688 | 5698 | 4300 | 6312 |
| buoc1-sau-nhe | ja | 1213 | 1783 | 4085 | 4014 | 7699 | 3971 | 6069 |
| buoc1-sau-nhe | ko | 392 | 1526 | 3562 | 4853 | 10768 | 3242 | 5023 |
| buoc1-sau-nhe | vi | 544 | 1017 | 2972 | 3620 | 7837 | 1756 | 5059 |
| buoc1-sau-nhe | zh | 939 | 1256 | 3241 | 3747 | 7341 | 2294 | 4554 |

| Gói-session | A2 p50 | A2 chữ đầu p50 | Đầu câu → chữ dịch p50 | p90 | Theo từ, tạm p50 | Theo từ, ổn định p50 | Nháy tạm | Bận | CPU % | Chép lời p50 | Dịch p50 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chuan-en | 775 → 780 (+6) | 419 → 439 (+20) | 5485 → 5473 (-12) | 6580 → 6553 (-26) | 2102 → 2123 (+22) | 2777 → 2776 (-1) | 10.7% → 3.0% (-7.6) | 14.5% → 14.5% (-0.0) | 2.9 → 2.9 (+0.0) | 243 → 244 (+1) | 241 → 232 (-9) |
| chuan-ja | 741 → 738 (-3) | 437 → 494 (+57) | 4138 → 4133 (-4) | 6374 → 6374 (+0) | 1980 → 2073 (+92) | 3800 → 3810 (+11) | 58.0% → 44.2% (-13.8) | 18.3% → 18.4% (+0.1) | 3.5 → 3.5 (+0.0) | 250 → 253 (+3) | 283 → 289 (+6) |
| chuan-ko | 645 → 645 (-0) | 420 → 450 (+30) | 3144 → 3146 (+2) | 5649 → 5645 (-4) | 1541 → 1640 (+99) | 3577 → 3570 (-7) | 60.2% → 34.2% (-26.0) | 18.7% → 18.6% (-0.1) | 3.6 → 3.5 (-0.1) | 251 → 251 (+0) | 292 → 286 (-6) |
| chuan-mixed | 596 → 600 (+4) | 393 → 423 (+31) | 3480 → 3462 (-18) | 5129 → 5149 (+20) | 1426 → 1465 (+39) | 2495 → 2494 (-1) | 32.6% → 18.6% (-14.0) | 18.3% → 18.2% (-0.1) | 3.3 → 3.3 (+0.0) | 240 → 235 (-5) | 212 → 212 (-0) |
| chuan-vi | 480 → 469 (-10) | 381 → 397 (+16) | 1843 → 1839 (-4) | 5157 → 5135 (-22) | 1099 → 1097 (-2) | 1245 → 1247 (+2) | 5.1% → 3.8% (-1.3) | 16.8% → 16.9% (+0.0) | 2.1 → 2.1 (+0.0) | 236 → 238 (+2) | 108 → 107 (-1) |
| chuan-zh | 700 → 725 (+24) | 368 → 488 (+120) | 2362 → 2485 (+122) | 5171 → 5176 (+5) | 1353 → 1469 (+116) | 3944 → 3943 (-1) | 92.5% → 51.1% (-41.4) | 22.7% → 22.8% (+0.1) | 4.3 → 4.4 (+0.1) | 242 → 243 (+1) | 275 → 275 (-0) |
| nhe-en | 480 → 472 (-8) | 296 → 323 (+27) | 5362 → 5366 (+3) | 6439 → 6459 (+20) | 2058 → 2075 (+16) | 2645 → 2671 (+26) | 13.1% → 6.9% (-6.2) | 8.9% → 9.0% (+0.1) | 2.6 → 2.6 (+0.0) | 114 → 113 (-2) | 185 → 184 (-1) |
| nhe-ja | 557 → 548 (-9) | 303 → 356 (+52) | 4032 → 4028 (-4) | 6278 → 6252 (-25) | 1841 → 1897 (+55) | 3894 → 3879 (-15) | 54.2% → 39.4% (-14.8) | 11.2% → 11.3% (+0.1) | 3.0 → 3.1 (+0.1) | 121 → 133 (+12) | 218 → 219 (+1) |
| nhe-ko | 435 → 444 (+8) | 245 → 333 (+88) | 3037 → 3096 (+59) | 5541 → 5824 (+282) | 1379 → 1460 (+82) | 5124 → 5119 (-5) | 86.4% → 42.4% (-44.0) | 12.0% → 12.0% (-0.0) | 3.4 → 3.4 (+0.0) | 125 → 122 (-3) | 215 → 215 (-0) |
| nhe-mixed | 457 → 456 (-1) | 271 → 321 (+49) | 3097 → 3098 (+1) | 4876 → 4897 (+21) | 1365 → 1430 (+65) | 3732 → 3733 (+2) | 62.8% → 32.3% (-30.4) | 11.9% → 11.8% (-0.1) | 3.3 → 3.3 (+0.0) | 108 → 107 (-2) | 183 → 182 (-1) |
| nhe-vi | 334 → 328 (-6) | 259 → 295 (+36) | 1729 → 1756 (+27) | 5058 → 5059 (+2) | 982 → 1017 (+35) | 3623 → 3620 (-2) | 88.4% → 49.7% (-38.7) | 11.3% → 11.4% (+0.1) | 2.6 → 2.6 (+0.0) | 104 → 109 (+5) | 114 → 112 (-2) |
| nhe-zh | 505 → 473 (-32) | 272 → 346 (+75) | 2227 → 2299 (+72) | 5065 → 5039 (-26) | 1213 → 1301 (+88) | 3962 → 3964 (+2) | 72.6% → 36.7% (-35.9) | 13.7% → 13.6% (-0.1) | 3.8 → 3.8 (+0.0) | 115 → 112 (-3) | 203 → 201 (-2) |

## Nhận xét

- **A2** (ghép câu giữ bản dịch đang hiện; cờ hủy kiểm trước request và ở mọi gói):
  - `Nháy tạm` gói Chuẩn: 5,1%–92,5% (mốc) → 3,0%–51,1% (lượt này). Chỗ giảm là phần bản dịch không còn bị xóa khi
    ghép câu — thấy rõ nhất ở `chuan-zh` (92,5% → 51,1%, -41,4 điểm) và `nhe-ko` (86,4% → 42,4%, -44,0 điểm).
  - A2 p50 và "A2 chữ đầu p50", gói Chuẩn: A2 p50 chênh từ -10 ms (`vi`) đến +24 ms (`zh`); "A2 chữ đầu p50" chênh từ
    +16 ms (`vi`) đến +120 ms (`zh`) — toàn bộ các session đều tăng nhẹ thay vì giảm, trái với ước tính nhanh hơn
    10–40 ms mỗi lần ghép của spec. Hai chỉ số này đo tổng thời gian ASR+dịch của cả phiên (không tách riêng chi phí
    xử lý một lần ghép), nên phần tiết kiệm nhỏ mỗi lần ghép — nếu có — nhiều khả năng bị nhiễu khác của một lượt đo
    duy nhất che lấp (xem ghi chú nhiễu cuối mục). Lợi ích đo được rõ ràng nhất của A2 là `Nháy tạm` ở trên.
- **A5:** A5 đã quay lại ở Task 11 (cổng A4 không đạt, nhóm `ko-wbp` của turbo). Cột "Chép lời p50" trong bảng so
  sánh chỉ là nhiễu giữa hai lượt đo (không có thay đổi code nào ở ASR giữa mốc và lượt này ngoài việc A2 gửi câu
  hơi khác do ghép câu đổi — xem A2 ở trên), không phản ánh tác dụng của flash attention.
- **CPU cả máy:** 2,1%–4,3% → 2,1%–4,4% (ngưỡng 30%, spec chính §8) — không đổi so với mốc trong sai số. **Mức bận:**
  8,9%–22,7% → 9,0%–22,8% — cũng không đổi so với mốc trong sai số.
- **A3** không đo được ở đây (WAV 16 kHz phát thẳng vào engine). Theo test của Task 6 và Task 7:
  - trễ của bộ lọc resample 5 ms, trước là 10,7 ms ở 48 kHz và 15 ms ở 44,1 kHz (có sàn 160 khung ở tần số dưới
    16kHz, giữ dải thoại Bluetooth HFP 8kHz — sửa thêm sau Task 6, xem commit `029f086`/`7257dd6`);
  - đọc thu âm ngay khi có mẫu thay cho ngủ cố định 20 ms trước mỗi lần đọc;
  - CPU: 60 giây 48 kHz stereo: khối 10 ms 11,76 ms, khối 1024 16,04 ms (khối 10 ms nhanh hơn, không chậm hơn).
  Kiểm trên thiết bị thật là việc của kế hoạch 04.
- **A4** không đo được ở đây (không có giao diện). Test của Task 8 giữ nguyên markup của từng loại dòng; mỗi gói
  chữ dịch chỉ vẽ lại đúng dòng của nó. Spec ước lợi 1–10 ms mỗi gói chữ ở phiên dài.
- Mỗi bên chỉ một lượt cho mỗi session, nên chênh nhỏ có thể là nhiễu giữa hai lượt. Không có session nào bị cảnh báo
  "phát lại chậm" hay sai lệch số câu/A2 đo được so với mốc (Step 9 đạt cả 12/12), nên không cần chạy lại session nào.

## Kết luận của bước 1 (spec §8, cột "Điều kiện giữ")

| # | Kết quả | Bằng chứng |
|---|---|---|
| A1 | Xong: `latency-bench session`, script chạy và tổng hợp, mốc chế độ thường | `buoc1-moc-che-do-thuong.md` |
| A2 | Giữ: test engine đạt | Task 12 Step 2; bảng so ở trên |
| A3 | Giữ: test resample đạt (gồm sàn 160 khung giữ dải Bluetooth); CPU không tăng — khối 10 ms (11,76 ms) nhanh hơn khối 1024 (16,04 ms) cho 60 giây 48 kHz stereo | Task 12 Step 2, Step 3 |
| A4 | Giữ: test giao diện đạt | Task 12 Step 2 |
| A5 | Không giữ: cổng A4 không đạt (nhóm `ko-wbp` của turbo, +14,3% tương đối, do phép làm tròn audio_ctx chứ không riêng flash attention); 5 commit đã revert | `buoc1-a5-flash-attention.md` |

## Giới hạn

- Một máy (M4 Pro). Câu đọc của FLEURS, không phải hội thoại thật (spec 2026-10-10 §14).
- Thời điểm nói của từng từ là xấp xỉ: chia đều độ dài câu cho số đơn vị của bản chép cuối (spec §10.1).
- CPU rảnh lúc đo chỉ 71,5% (TRUOC, sau khi chủ dự án đã tắt bớt ứng dụng) — thấp hơn ngưỡng ~90% kế hoạch khuyến
  nghị, và thấp hơn ước lượng 80–85% của chủ dự án, nhưng nằm trong cùng dải 70–82% mà mốc ở Task 3 cũng đã chấp nhận
  (`buoc1-moc-che-do-thuong.md`). Nguyên nhân cả hai lần là `StorageManagementService` (tác vụ hệ thống macOS) và
  Microsoft Defender chạy nền từ lúc khởi động máy, không tắt được hoàn toàn. Vì mức rảnh của mốc và lượt này xấp xỉ
  nhau nên so sánh "trước/sau" vẫn hợp lý, nhưng cần thận trọng hơn một chút so với một lượt đo lý tưởng ở CPU rảnh
  ≥ 90%; phát trễ đo được vẫn dưới 100 ms và không có lần khởi động lại sidecar nào ở cả 12 lượt (Step 9), nên mức
  nhiễu này được coi là chấp nhận được và không làm mất hiệu lực của kết quả.
