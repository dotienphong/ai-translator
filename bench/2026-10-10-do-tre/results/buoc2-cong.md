# Bước 2: bản thử "dịch trong lúc người nói chưa dừng", số đo cho cổng (2026-10-12)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-02-ban-thu-pipeline.md`, Task 19; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §9 bước 2, §10. Cổng: chủ dự án chốt ngưỡng ngắt câu
(QĐ4) và (n, k) theo số đo này.

## Điều kiện đo

- Máy: Apple M4 Pro, 24.0 GB, macOS 26.6.2 Tahoe.
- Code: nhánh `dich-trong-luc-noi`, commit `c882ced`; `asr-worker` "asr-worker: backend=metal flash_attn=off decode_mode=shared"; `llama-server` b11146.
- Cấu hình: ngưỡng người dùng 50 ms (`--end-silence-ms 50`); ngưỡng của chế độ này theo nhãn; (n, k) mặc định là en, vi 2/1;
  zh 2/2; ja, ko 3/2; thận trọng là en, vi 3/1; zh 3/2; ja, ko 3/3; mạnh là 2/1 cho mọi tiếng; mọi ngưỡng khác là
  `PipelineConfig::default()`.
- Mốc: `buoc1-sau-*` của kế hoạch 01 (chế độ thường, 50 ms, sau A2–A5).
- Chủ dự án đã thoát ứng dụng nặng, dừng phiên Claude khác, xác nhận sẵn sàng không dùng máy trong lúc đo (qua team lead,
  trước khi bắt đầu); máy cắm sạc. Trước và sau lượt đo:

  ```
  [TRUOC 2026-10-12 05:23:13] total = 4096.00M  used = 2660.12M  free = 1435.88M  (encrypted) |  -InternalBattery-0 (id=23920739)	100%; charged; 0:00 remaining present: true | CPU usage: 2.45% user, 7.97% sys, 89.57% idle
  [SAU 2026-10-12 09:13:20] total = 3072.00M  used = 2087.19M  free = 984.81M  (encrypted) |  -InternalBattery-0 (id=23920739)	99%; finishing charge; (no estimate) present: true | CPU usage: 14.6% user, 15.70% sys, 70.22% idle
  ```

  (Giữa hai mốc trên, có một đoạn chủ dự án dùng máy trở lại trong lúc đo bộ "mạnh" — xem mục "Giới hạn".)

## Cách chạy

```
cargo build --release --locked -p latency-bench
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc2-es<N> -- --streaming --streaming-end-silence-ms <N>
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc2-es<T>-than-trong -- --streaming \
  --streaming-end-silence-ms <T> --tgt-agree en:3:1,vi:3:1,zh:3:2,ja:3:3,ko:3:3
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc2-es<T>-manh -- --streaming \
  --streaming-end-silence-ms <T> --tgt-agree en:2:1,vi:2:1,zh:2:1,ja:2:1,ko:2:1
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc2-es<T> -- --streaming --streaming-end-silence-ms <T>
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets <file.json>...
```

## Kết quả

### (a) Ngưỡng ngắt câu, gói Chuẩn, (n, k) mặc định

| Nhóm | Tiếng nguồn | Từ có chữ dịch | Tạm p50 | Tạm p90 | Ổn định p50 | Ổn định p90 | Đầu câu → chữ dịch p50 | p90 |
|---|---|---|---|---|---|---|---|---|
| buoc1-sau-chuan | en | 540 | 2048 | 4770 | 2751 | 5804 | 4432 | 6416 |
| buoc1-sau-chuan | ja | 1223 | 1909 | 4199 | 3744 | 7117 | 4075 | 6190 |
| buoc1-sau-chuan | ko | 409 | 1685 | 3849 | 3344 | 7907 | 3330 | 5137 |
| buoc1-sau-chuan | vi | 533 | 1097 | 3145 | 1247 | 3477 | 1839 | 5135 |
| buoc1-sau-chuan | zh | 936 | 1415 | 3437 | 3370 | 7375 | 2513 | 5473 |
| buoc2-es200-chuan | en | 541 | 652 | 1698 | 2097 | 4002 | 1282 | 1312 |
| buoc2-es200-chuan | ja | 1229 | 1091 | 3064 | 3833 | 8123 | 1292 | 5538 |
| buoc2-es200-chuan | ko | 389 | 704 | 1870 | 3407 | 7737 | 1298 | 1435 |
| buoc2-es200-chuan | vi | 571 | 696 | 2155 | 1718 | 3328 | 1290 | 2328 |
| buoc2-es200-chuan | zh | 936 | 817 | 1688 | 2161 | 4152 | 1289 | 1330 |
| buoc2-es400-chuan | en | 551 | 602 | 2705 | 1962 | 3990 | 1268 | 1307 |
| buoc2-es400-chuan | ja | 1226 | 1124 | 3824 | 4108 | 8540 | 1309 | 4686 |
| buoc2-es400-chuan | ko | 376 | 746 | 2736 | 3698 | 9291 | 1294 | 2094 |
| buoc2-es400-chuan | vi | 551 | 649 | 2738 | 1730 | 3500 | 1288 | 3259 |
| buoc2-es400-chuan | zh | 938 | 977 | 3480 | 2623 | 6082 | 1297 | 1338 |
| buoc2-es50-chuan | en | 540 | 581 | 1352 | 1944 | 3577 | 1275 | 1307 |
| buoc2-es50-chuan | ja | 1223 | 999 | 2472 | 3671 | 6792 | 1268 | 1815 |
| buoc2-es50-chuan | ko | 409 | 695 | 2233 | 3216 | 7797 | 1295 | 3352 |
| buoc2-es50-chuan | vi | 533 | 544 | 1420 | 1185 | 2753 | 1282 | 2122 |
| buoc2-es50-chuan | zh | 936 | 803 | 1586 | 2772 | 6145 | 1286 | 1328 |
| buoc2-es600-chuan | en | 531 | 589 | 3207 | 2101 | 4128 | 1271 | 1437 |
| buoc2-es600-chuan | ja | 1226 | 1203 | 3951 | 4473 | 10359 | 1309 | 5224 |
| buoc2-es600-chuan | ko | 374 | 780 | 2758 | 4564 | 11065 | 1293 | 2551 |
| buoc2-es600-chuan | vi | 547 | 341 | 3547 | 1673 | 3846 | 1302 | 4783 |
| buoc2-es600-chuan | zh | 954 | 831 | 3211 | 2653 | 5364 | 1294 | 1364 |

| Nhóm | Tiếng nguồn | Theo từ, tạm p50 (≤ 1200) | Theo từ, ổn định p50 (mục tiêu) |
|---|---|---|---|
| buoc1-sau-chuan | en | 2048 ✗ | 2751 ✗ (≤ 2000) |
| buoc1-sau-chuan | ja | 1909 ✗ | 3744 ✗ (≤ 3000) |
| buoc1-sau-chuan | ko | 1685 ✗ | 3344 ✗ (≤ 2000) |
| buoc1-sau-chuan | vi | 1097 ✓ | 1247 ✓ (≤ 2000) |
| buoc1-sau-chuan | zh | 1415 ✗ | 3370 ✗ (≤ 3000) |
| buoc2-es200-chuan | en | 652 ✓ | 2097 ✗ (≤ 2000) |
| buoc2-es200-chuan | ja | 1091 ✓ | 3833 ✗ (≤ 3000) |
| buoc2-es200-chuan | ko | 704 ✓ | 3407 ✗ (≤ 2000) |
| buoc2-es200-chuan | vi | 696 ✓ | 1718 ✓ (≤ 2000) |
| buoc2-es200-chuan | zh | 817 ✓ | 2161 ✓ (≤ 3000) |
| buoc2-es400-chuan | en | 602 ✓ | 1962 ✓ (≤ 2000) |
| buoc2-es400-chuan | ja | 1124 ✓ | 4108 ✗ (≤ 3000) |
| buoc2-es400-chuan | ko | 746 ✓ | 3698 ✗ (≤ 2000) |
| buoc2-es400-chuan | vi | 649 ✓ | 1730 ✓ (≤ 2000) |
| buoc2-es400-chuan | zh | 977 ✓ | 2623 ✓ (≤ 3000) |
| buoc2-es50-chuan | en | 581 ✓ | 1944 ✓ (≤ 2000) |
| buoc2-es50-chuan | ja | 999 ✓ | 3671 ✗ (≤ 3000) |
| buoc2-es50-chuan | ko | 695 ✓ | 3216 ✗ (≤ 2000) |
| buoc2-es50-chuan | vi | 544 ✓ | 1185 ✓ (≤ 2000) |
| buoc2-es50-chuan | zh | 803 ✓ | 2772 ✓ (≤ 3000) |
| buoc2-es600-chuan | en | 589 ✓ | 2101 ✗ (≤ 2000) |
| buoc2-es600-chuan | ja | 1203 ✗ | 4473 ✗ (≤ 3000) |
| buoc2-es600-chuan | ko | 780 ✓ | 4564 ✗ (≤ 2000) |
| buoc2-es600-chuan | vi | 341 ✓ | 1673 ✓ (≤ 2000) |
| buoc2-es600-chuan | zh | 831 ✓ | 2653 ✓ (≤ 3000) |

| Nhóm | Đầu câu → chữ dịch p90 (≤ 2000) | Nháy ổn định (≤ 10%) | A2 p50 tệ nhất (≤ 2000) | A2 p90 tệ nhất (≤ 3000) | A2 chữ đầu p50 tệ nhất (≤ 1000) | CPU % tệ nhất (≤ 30) |
|---|---|---|---|---|---|---|
| buoc1-sau-chuan | 6176 ✗ | — | 780 ✓ | 972 ✓ | 494 ✓ | 4.4 ✓ |
| buoc2-es200-chuan | 1656 ✓ | 10.7% ✗ | 1137 ✓ | 1394 ✓ | 864 ✓ | 11.2 ✓ |
| buoc2-es400-chuan | 2976 ✗ | 17.3% ✗ | 1293 ✓ | 1964 ✓ | 906 ✓ | 12.6 ✓ |
| buoc2-es50-chuan | 1399 ✓ | 6.9% ✓ | 790 ✓ | 1133 ✓ | 592 ✓ | 10.0 ✓ |
| buoc2-es600-chuan | 3342 ✗ | 20.4% ✗ | 1468 ✓ | 2189 ✓ | 1263 ✗ | 14.8 ✓ |

So với mốc `buoc1-sau-chuan` (mỗi ô "mốc → bản thử (chênh)"):

| Gói-session | A2 p50 | A2 chữ đầu p50 | Đầu câu → chữ dịch p50 | p90 | Theo từ, tạm p50 | Theo từ, ổn định p50 | Nháy tạm | Bận | CPU % | Chép lời p50 | Dịch p50 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chuan-en (es50) | 780 → 789 (+8) | 439 → 452 (+13) | 5473 → 1275 (-4198) | 6553 → 1312 (-5242) | 2123 → 632 (-1491) | 2776 → 1944 (-832) | 3.0% → 137.3% (+134.3) | 14.5% → 57.0% (+42.5) | 2.9 → 8.6 (+5.7) | 244 → 254 (+10) | 232 → 214 (-17) |
| chuan-ja (es50) | 738 → 790 (+52) | 494 → 592 (+98) | 4133 → 1270 (-2863) | 6374 → 1409 (-4965) | 2073 → 981 (-1091) | 3810 → 3761 (-49) | 44.2% → 242.1% (+197.9) | 18.4% → 63.2% (+44.8) | 3.5 → 9.7 (+6.2) | 253 → 266 (+13) | 289 → 278 (-11) |
| chuan-ko (es50) | 645 → 658 (+13) | 450 → 531 (+80) | 3146 → 1289 (-1857) | 5645 → 2230 (-3415) | 1640 → 664 (-976) | 3570 → 3482 (-88) | 34.2% → 217.4% (+183.2) | 18.6% → 63.9% (+45.3) | 3.5 → 10.0 (+6.5) | 251 → 266 (+14) | 286 → 271 (-15) |
| chuan-mixed (es50) | 600 → 644 (+44) | 423 → 458 (+35) | 3462 → 1276 (-2186) | 5149 → 3198 (-1951) | 1465 → 834 (-631) | 2494 → 2292 (-202) | 18.6% → 117.1% (+98.5) | 18.2% → 54.4% (+36.2) | 3.3 → 7.8 (+4.5) | 235 → 248 (+13) | 212 → 200 (-12) |
| chuan-vi (es50) | 469 → 443 (-26) | 397 → 379 (-18) | 1839 → 1282 (-557) | 5135 → 2122 (-3013) | 1097 → 544 (-553) | 1247 → 1185 (-62) | 3.8% → 108.5% (+104.7) | 16.9% → 40.9% (+24.0) | 2.1 → 4.3 (+2.2) | 238 → 233 (-4) | 107 → 96 (-12) |
| chuan-zh (es50) | 725 → 787 (+62) | 488 → 586 (+98) | 2485 → 1282 (-1202) | 5176 → 1318 (-3858) | 1469 → 805 (-664) | 3943 → 3246 (-697) | 51.1% → 183.8% (+132.7) | 22.8% → 61.2% (+38.5) | 4.4 → 9.6 (+5.2) | 243 → 261 (+18) | 275 → 265 (-10) |
| chuan-en (es200) | 780 → 1118 (+337) | 439 → 741 (+302) | 5473 → 1286 (-4186) | 6553 → 1315 (-5238) | 2123 → 693 (-1430) | 2776 → 2093 (-683) | 3.0% → 144.3% (+141.3) | 14.5% → 70.7% (+56.1) | 2.9 → 9.4 (+6.5) | 244 → 267 (+23) | 232 → 258 (+27) |
| chuan-ja (es200) | 738 → 1137 (+399) | 494 → 764 (+270) | 4133 → 1281 (-2852) | 6374 → 5689 (-685) | 2073 → 1087 (-986) | 3810 → 3936 (+126) | 44.2% → 237.4% (+193.2) | 18.4% → 76.3% (+57.9) | 3.5 → 11.1 (+7.6) | 253 → 307 (+54) | 289 → 353 (+64) |
| chuan-ko (es200) | 645 → 1090 (+445) | 450 → 864 (+413) | 3146 → 1301 (-1845) | 5645 → 1370 (-4276) | 1640 → 665 (-975) | 3570 → 3524 (-46) | 34.2% → 257.0% (+222.7) | 18.6% → 79.0% (+60.5) | 3.5 → 11.2 (+7.7) | 251 → 284 (+33) | 286 → 305 (+19) |
| chuan-mixed (es200) | 600 → 943 (+344) | 423 → 718 (+294) | 3462 → 1292 (-2170) | 5149 → 3406 (-1742) | 1465 → 896 (-569) | 2494 → 2713 (+219) | 18.6% → 169.3% (+150.7) | 18.2% → 73.8% (+55.6) | 3.3 → 9.8 (+6.5) | 235 → 274 (+39) | 212 → 274 (+62) |
| chuan-vi (es200) | 469 → 779 (+309) | 397 → 675 (+278) | 1839 → 1290 (-549) | 5135 → 2328 (-2807) | 1097 → 696 (-401) | 1247 → 1718 (+470) | 3.8% → 119.4% (+115.6) | 16.9% → 61.3% (+44.4) | 2.1 → 5.6 (+3.5) | 238 → 275 (+37) | 107 → 99 (-8) |
| chuan-zh (es200) | 725 → 1056 (+331) | 488 → 786 (+298) | 2485 → 1289 (-1196) | 5176 → 1324 (-3852) | 1469 → 786 (-683) | 3943 → 2176 (-1768) | 51.1% → 144.6% (+93.5) | 22.8% → 75.2% (+52.4) | 4.4 → 9.6 (+5.2) | 243 → 286 (+43) | 275 → 222 (-53) |
| chuan-en (es400) | 780 → 1167 (+386) | 439 → 792 (+353) | 5473 → 1271 (-4201) | 6553 → 1485 (-5068) | 2123 → 693 (-1430) | 2776 → 1994 (-782) | 3.0% → 182.9% (+179.9) | 14.5% → 72.6% (+58.0) | 2.9 → 10.2 (+7.3) | 244 → 268 (+24) | 232 → 371 (+140) |
| chuan-ja (es400) | 738 → 1293 (+554) | 494 → 906 (+412) | 4133 → 1308 (-2826) | 6374 → 3890 (-2484) | 2073 → 1117 (-955) | 3810 → 4250 (+439) | 44.2% → 281.5% (+237.3) | 18.4% → 82.7% (+64.3) | 3.5 → 12.5 (+9.0) | 253 → 302 (+49) | 289 → 465 (+176) |
| chuan-ko (es400) | 645 → 1167 (+522) | 450 → 888 (+437) | 3146 → 1294 (-1852) | 5645 → 1532 (-4113) | 1640 → 717 (-923) | 3570 → 3909 (+338) | 34.2% → 276.5% (+242.3) | 18.6% → 88.2% (+69.6) | 3.5 → 12.6 (+9.1) | 251 → 306 (+55) | 286 → 453 (+166) |
| chuan-mixed (es400) | 600 → 1100 (+500) | 423 → 822 (+399) | 3462 → 1300 (-2162) | 5149 → 5343 (+194) | 1465 → 982 (-482) | 2494 → 2978 (+484) | 18.6% → 199.7% (+181.1) | 18.2% → 76.0% (+57.8) | 3.3 → 10.7 (+7.4) | 235 → 280 (+44) | 212 → 347 (+135) |
| chuan-vi (es400) | 469 → 847 (+378) | 397 → 733 (+336) | 1839 → 1288 (-552) | 5135 → 3259 (-1876) | 1097 → 649 (-448) | 1247 → 1730 (+483) | 3.8% → 183.2% (+179.4) | 16.9% → 61.8% (+44.9) | 2.1 → 6.2 (+4.1) | 238 → 246 (+8) | 107 → 129 (+21) |
| chuan-zh (es400) | 725 → 1199 (+474) | 488 → 829 (+341) | 2485 → 1296 (-1189) | 5176 → 1331 (-3845) | 1469 → 942 (-527) | 3943 → 2639 (-1304) | 51.1% → 188.5% (+137.4) | 22.8% → 78.1% (+55.4) | 4.4 → 11.3 (+6.9) | 243 → 303 (+59) | 275 → 383 (+107) |
| chuan-en (es600) | 780 → 1321 (+540) | 439 → 962 (+523) | 5473 → 1271 (-4201) | 6553 → 1776 (-4777) | 2123 → 690 (-1433) | 2776 → 2134 (-642) | 3.0% → 172.7% (+169.7) | 14.5% → 78.1% (+63.6) | 2.9 → 11.1 (+8.2) | 244 → 251 (+8) | 232 → 486 (+254) |
| chuan-ja (es600) | 738 → 1404 (+666) | 494 → 1066 (+573) | 4133 → 1299 (-2834) | 6374 → 5245 (-1129) | 2073 → 1169 (-904) | 3810 → 4829 (+1018) | 44.2% → 318.4% (+274.2) | 18.4% → 83.2% (+64.8) | 3.5 → 14.8 (+11.3) | 253 → 296 (+43) | 289 → 533 (+244) |
| chuan-ko (es600) | 645 → 1356 (+711) | 450 → 1263 (+813) | 3146 → 1292 (-1853) | 5645 → 2130 (-3515) | 1640 → 745 (-895) | 3570 → 4778 (+1208) | 34.2% → 335.8% (+301.6) | 18.6% → 87.5% (+69.0) | 3.5 → 14.6 (+11.1) | 251 → 302 (+51) | 286 → 558 (+272) |
| chuan-mixed (es600) | 600 → 1271 (+671) | 423 → 1017 (+594) | 3462 → 1305 (-2157) | 5149 → 4015 (-1134) | 1465 → 1026 (-438) | 2494 → 3154 (+660) | 18.6% → 218.7% (+200.1) | 18.2% → 79.6% (+61.4) | 3.3 → 12.7 (+9.4) | 235 → 284 (+48) | 212 → 377 (+165) |
| chuan-vi (es600) | 469 → 1157 (+688) | 397 → 988 (+591) | 1839 → 1302 (-537) | 5135 → 4783 (-352) | 1097 → 341 (-757) | 1247 → 1673 (+426) | 3.8% → 197.3% (+193.5) | 16.9% → 66.0% (+49.2) | 2.1 → 6.7 (+4.6) | 238 → 276 (+39) | 107 → 260 (+153) |
| chuan-zh (es600) | 725 → 1468 (+743) | 488 → 1027 (+539) | 2485 → 1295 (-1190) | 5176 → 1376 (-3800) | 1469 → 790 (-679) | 3943 → 2638 (-1305) | 51.1% → 222.7% (+171.6) | 22.8% → 85.4% (+62.6) | 4.4 → 12.4 (+8.0) | 243 → 294 (+51) | 275 → 480 (+204) |

Ngưỡng chọn cho (b) và lý do (chi tiết đầy đủ trong `target/do-tre/buoc2-chon.txt`):

Bước 1 (loại ngưỡng không đạt điều kiện tối thiểu — A2 p50/p90/chữ đầu, nháy ổn định ≤10%, CPU ≤30%, không có session tự tắt):
chỉ **es50** qua (A2 790/1133/592 ✓, nháy ổn định 6.9% ✓, CPU 10.0 ✓, 0 tự tắt). es200 loại vì nháy ổn định 10.7%>10%. es400 loại vì nháy ổn định 17.3%>10%. es600 loại vì A2 chữ đầu 1263>1000 và nháy ổn định 20.4%>10%. Bước 2 (tham khảo trên cả 4 ngưỡng, đếm ✓ ở bảng theo tiếng + ô p90 nhóm): es50 9/11, es200 8/11, es400 8/11, es600 6/11 — es50 dẫn đầu, nhất quán với bước 1. Vì chỉ một ngưỡng qua bước 1, T1 = es50 không cần xét bước 3; bước 4 không có ngưỡng thứ hai qua bộ lọc cùng T1 nên không có T2 — (b) chỉ đo một ngưỡng (50 ms).

### (b) (n, k), gói Chuẩn, ngưỡng 50

| Nhóm | Đầu câu → chữ dịch p90 (≤ 2000) | Nháy ổn định (≤ 10%) | A2 p50 tệ nhất (≤ 2000) | A2 p90 tệ nhất (≤ 3000) | A2 chữ đầu p50 tệ nhất (≤ 1000) | CPU % tệ nhất (≤ 30) |
|---|---|---|---|---|---|---|
| buoc2-es50-chuan (mặc định) | 1399 ✓ | 6.9% ✓ | 790 ✓ | 1133 ✓ | 592 ✓ | 10.0 ✓ |
| buoc2-es50-than-trong-chuan | 1439 ✓ | 1.3% ✓ | 839 ✓ | 1123 ✓ | 604 ✓ | 10.6 ✓ |
| buoc2-es50-manh-chuan | 1444 ✓ | 11.4% ✗ | 864 ✓ | 1157 ✓ | 596 ✓ | 10.5 ✓ |

| Nhóm | Tiếng nguồn | Theo từ, tạm p50 (≤ 1200) | Theo từ, ổn định p50 (mục tiêu) |
|---|---|---|---|
| buoc2-es50-chuan (mặc định) | en | 581 ✓ | 1944 ✓ (≤ 2000) |
| buoc2-es50-chuan (mặc định) | ja | 999 ✓ | 3671 ✗ (≤ 3000) |
| buoc2-es50-chuan (mặc định) | ko | 695 ✓ | 3216 ✗ (≤ 2000) |
| buoc2-es50-chuan (mặc định) | vi | 544 ✓ | 1185 ✓ (≤ 2000) |
| buoc2-es50-chuan (mặc định) | zh | 803 ✓ | 2772 ✓ (≤ 3000) |
| buoc2-es50-than-trong-chuan | en | 624 ✓ | 2576 ✗ (≤ 2000) |
| buoc2-es50-than-trong-chuan | ja | 1012 ✓ | 3734 ✗ (≤ 3000) |
| buoc2-es50-than-trong-chuan | ko | 714 ✓ | 3326 ✗ (≤ 2000) |
| buoc2-es50-than-trong-chuan | vi | 556 ✓ | 1247 ✓ (≤ 2000) |
| buoc2-es50-than-trong-chuan | zh | 819 ✓ | 3332 ✗ (≤ 3000) |
| buoc2-es50-manh-chuan | en | 587 ✓ | 1943 ✓ (≤ 2000) |
| buoc2-es50-manh-chuan | ja | 975 ✓ | 3119 ✗ (≤ 3000) |
| buoc2-es50-manh-chuan | ko | 666 ✓ | 2607 ✗ (≤ 2000) |
| buoc2-es50-manh-chuan | vi | 545 ✓ | 1202 ✓ (≤ 2000) |
| buoc2-es50-manh-chuan | zh | 818 ✓ | 2732 ✓ (≤ 3000) |

Nhận xét: "thận trọng" (n,k cao hơn) giảm nháy ổn định đáng kể (1.3% so với 6.9% mặc định) nhưng ĐÁNH ĐỔI bằng trễ ổn định cao hơn ở hầu hết các tiếng, kể cả en (2576, không còn đạt mục tiêu ≤2000) và zh (3332, không còn đạt ≤3000) — mặc định đang đạt cả hai. "Mạnh" (n,k thấp hơn, đo khi máy không hoàn toàn rảnh — xem "Giới hạn") giảm trễ ổn định cho ja/ko (3671→3119, 3216→2607) nhưng vẫn CHƯA đạt mục tiêu, và làm nháy ổn định vượt ngưỡng 10% (11.4%) — không đạt điều kiện tối thiểu như ngưỡng 200/400/600 đã bị loại ở (a).

### (c) Gói Nhẹ, ngưỡng 50

| Nhóm | Tiếng nguồn | Theo từ, tạm p50 (≤ 1200) | Theo từ, ổn định p50 (mục tiêu) |
|---|---|---|---|
| buoc1-sau-nhe | en | 1944 ✗ | 2688 ✗ (≤ 2000) |
| buoc1-sau-nhe | ja | 1783 ✗ | 4014 ✗ (≤ 3000) |
| buoc1-sau-nhe | ko | 1526 ✗ | 4853 ✗ (≤ 2000) |
| buoc1-sau-nhe | vi | 1017 ✓ | 3620 ✗ (≤ 2000) |
| buoc1-sau-nhe | zh | 1256 ✗ | 3747 ✗ (≤ 3000) |
| buoc2-es50-nhe | en | 512 ✓ | 1806 ✓ (≤ 2000) |
| buoc2-es50-nhe | ja | 859 ✓ | 3827 ✗ (≤ 3000) |
| buoc2-es50-nhe | ko | 560 ✓ | 4206 ✗ (≤ 2000) |
| buoc2-es50-nhe | vi | 678 ✓ | 2883 ✗ (≤ 2000) |
| buoc2-es50-nhe | zh | 602 ✓ | 2920 ✓ (≤ 3000) |

| Nhóm | Đầu câu → chữ dịch p90 (≤ 2000) | Nháy ổn định (≤ 10%) | A2 p50 tệ nhất (≤ 2000) | A2 p90 tệ nhất (≤ 3000) | A2 chữ đầu p50 tệ nhất (≤ 1000) | CPU % tệ nhất (≤ 30) |
|---|---|---|---|---|---|---|
| buoc1-sau-nhe | 6063 ✗ | — | 548 ✓ | 687 ✓ | 356 ✓ | 3.8 ✓ |
| buoc2-es50-nhe | 1793 ✓ | 11.1% ✗ | 568 ✓ | 795 ✓ | 385 ✓ | 10.8 ✓ |

So với mốc `buoc1-sau-nhe` (mỗi ô "mốc → bản thử (chênh)"):

| Gói-session | A2 p50 | A2 chữ đầu p50 | Đầu câu → chữ dịch p50 | p90 | Theo từ, tạm p50 | Theo từ, ổn định p50 | Nháy tạm | Bận | CPU % | Chép lời p50 | Dịch p50 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| nhe-en | 472 → 534 (+63) | 323 → 332 (+9) | 5366 → 1168 (-4198) | 6459 → 1535 (-4924) | 2075 → 552 (-1523) | 2671 → 1854 (-817) | 6.9% → 134.3% (+127.4) | 9.0% → 37.5% (+28.5) | 2.6 → 7.9 (+5.3) | 113 → 126 (+13) | 184 → 172 (-12) |
| nhe-ja | 548 → 568 (+21) | 356 → 370 (+14) | 4028 → 1173 (-2855) | 6252 → 1949 (-4304) | 1897 → 866 (-1031) | 3879 → 3696 (-184) | 39.4% → 274.9% (+235.5) | 11.3% → 45.1% (+33.8) | 3.1 → 9.9 (+6.8) | 133 → 140 (+7) | 219 → 211 (-8) |
| nhe-ko | 444 → 474 (+31) | 333 → 367 (+34) | 3096 → 1203 (-1893) | 5824 → 2241 (-3582) | 1460 → 522 (-939) | 5119 → 4552 (-567) | 42.4% → 259.5% (+217.1) | 12.0% → 46.1% (+34.1) | 3.4 → 10.8 (+7.4) | 122 → 126 (+4) | 215 → 222 (+8) |
| nhe-mixed | 456 → 452 (-3) | 321 → 333 (+12) | 3098 → 1183 (-1916) | 4897 → 1572 (-3326) | 1430 → 679 (-751) | 3733 → 3086 (-647) | 32.3% → 159.9% (+127.6) | 11.8% → 37.5% (+25.7) | 3.3 → 8.5 (+5.2) | 107 → 106 (-1) | 182 → 180 (-2) |
| nhe-vi | 328 → 372 (+44) | 295 → 320 (+24) | 1756 → 1199 (-557) | 5059 → 2617 (-2442) | 1017 → 678 (-339) | 3620 → 2883 (-737) | 49.7% → 206.8% (+157.2) | 11.4% → 30.3% (+18.9) | 2.6 → 5.6 (+3.0) | 109 → 121 (+12) | 112 → 126 (+14) |
| nhe-zh | 473 → 521 (+48) | 346 → 385 (+38) | 2299 → 1190 (-1109) | 5039 → 1223 (-3816) | 1301 → 596 (-705) | 3964 → 3045 (-919) | 36.7% → 165.8% (+129.1) | 13.6% → 40.9% (+27.3) | 3.8 → 9.4 (+5.6) | 112 → 117 (+5) | 201 → 202 (+2) |

Gói Nhẹ ở ngưỡng 50 cũng vượt ngưỡng nháy ổn định (11.1%>10%, tương tự "mạnh") — kém hơn gói Chuẩn (6.9%) ở cùng ngưỡng/cùng (n,k) mặc định, và chỉ đạt mục tiêu trễ ổn định ở 2/5 tiếng (en, zh) so với 3/5 của gói Chuẩn.

### Kiểm cảm quan

Xem 6 câu (3 ja + 3 zh) ở `buoc2-es50-chuan`: 4/6 câu, phần dịch "ổn định" là tiền tố đúng nghĩa của bản dịch cuối (không sai nghĩa, chỉ là câu bị cắt ngắn). 2/6 câu (1 ja, 1 zh) có hiện tượng engine viết lại cấu trúc câu khi nghe đủ ngữ cảnh — không sai nghĩa cốt lõi nhưng đổi cấu trúc câu đáng kể so với phần đã hiển thị (ví dụ phần ổn định ở dạng cụm danh từ/chủ đề, bản cuối viết lại thành câu đầy đủ với cấu trúc chủ-vị khác hẳn). Không phát hiện trường hợp nào phần ổn định mang nghĩa SAI hẳn hoặc trái ngược với bản cuối.

## So với mục tiêu §10.2 (gói Chuẩn, cấu hình đề xuất: ngưỡng 50 ms, (n,k) mặc định)

| Chỉ số | Mục tiêu | Số đo | Đạt |
|---|---|---|---|
| Trễ của chữ tạm, theo từ, p50 | ≤ 1 200 ms mọi tiếng | en 581, ja 999, ko 695, vi 544, zh 803 | Đạt cả 5 tiếng |
| Trễ của chữ ổn định, theo từ, p50 | ≤ 2 000 ms en, vi, ko; ≤ 3 000 ms zh, ja | en 1944, ja 3671, ko 3216, vi 1185, zh 2772 | Đạt en, vi, zh; KHÔNG đạt ja (3671>3000), ko (3216>2000) |
| Từ lúc bắt đầu nói tới chữ dịch đầu tiên, p90 | ≤ 2 000 ms | 1399 | Đạt |
| Độ nháy tầng ổn định | ≤ 10% | 6.9% | Đạt |
| A2 (p50, p90, chữ đầu p50), session tệ nhất | ≤ 2 000, 3 000, 1 000 ms | 790, 1133, 592 | Đạt cả 3 |
| CPU cả máy, session tệ nhất | ≤ 30% | 10.0% | Đạt |
| Tự tắt trên M4 Pro | không xảy ra | 0/42 lượt đo tự tắt | Đạt |
| Gói Nhẹ (chỉ báo cáo) | — | tạm p50 gộp 683 ms, ổn định p50 gộp 3076 ms, A2 p50 tệ nhất 568 ms | — |

## Đề xuất cho cổng

- **QĐ4, ngưỡng ngắt câu của chế độ này:** 50 ms, vì đây là NGƯỠNG DUY NHẤT trong bốn ngưỡng đã thử (50/200/400/600) qua được điều kiện chất lượng tối thiểu (nháy ổn định ≤10%): 200 ms đạt 10.7%, 400 ms đạt 17.3%, 600 ms đạt 20.4% (và còn không đạt A2 chữ đầu), đều vượt. 50 ms cũng dẫn đầu về số mục tiêu đạt ở bảng theo tiếng (9/11 điểm so với 8/8/6 của ba ngưỡng còn lại) và có trễ ổn định thấp nhất trong bốn ngưỡng ở hầu hết các tiếng.
- **(n, k) theo tiếng nguồn:** giữ mặc định (en, vi 2/1; zh 2/2; ja, ko 3/2), KHÔNG đổi sang "thận trọng" hay "mạnh". "Thận trọng" giảm nháy nhưng làm trễ ổn định xấu đi ở 4/5 tiếng (kể cả en, zh vốn đang đạt mục tiêu ở mặc định). "Mạnh" cải thiện trễ ổn định cho ja/ko nhưng vẫn chưa đủ đạt mục tiêu, trong khi làm nháy ổn định vượt hẳn ngưỡng 10% (11.4%) — vi phạm điều kiện tối thiểu. Kiểm cảm quan ở mặc định không phát hiện vấn đề nghiêm trọng (chỉ 2/6 câu có viết lại cấu trúc, không sai nghĩa).
- **Mục tiêu §10.2:** CHƯA đạt hết. Mục "Trễ của chữ ổn định, theo từ, p50" chưa đạt ở hai tiếng **ja** (3671 ms, mục tiêu ≤3000) và **ko** (3216 ms, mục tiêu ≤2000) ở cấu hình đề xuất. Theo spec §9, đây là mục trễ cần quay lại thiết kế trước bước 3. Nguyên nhân thấy được từ số đo: thử giảm (n,k) cho hai tiếng này xuống mức thấp nhất đã thử (2/1, như "mạnh") có cải thiện (ja 3671→3119, ko 3216→2607) nhưng vẫn không đủ đạt mục tiêu, trong khi làm nháy ổn định toàn nhóm vượt 10%; thử tăng (n,k) lên cao nhất ("thận trọng", 3/3) lại làm trễ của chính ja/ko tăng thêm (3671→3734, 3216→3326) thay vì giảm. Vấn đề có vẻ không chỉ nằm ở tham số (n,k) mà có thể do đặc tính cấu trúc câu/trật tự từ của ja, ko khiến việc dịch cần nghe đủ ngữ cảnh dài hơn mới ổn định. Hướng sửa đề xuất: thử thêm các cặp (n,k) trung gian chưa đo (ví dụ 2/2 cho ja/ko) ở một lượt đo bổ sung, hoặc xem xét nới mục tiêu trễ ổn định riêng cho ja/ko nếu đây là giới hạn vốn có của kiến trúc hiện tại, hoặc cải thiện logic "chốt ổn định" (không chỉ dựa thuần vào đếm n lần liên tiếp giống nhau).

## Giới hạn

- Một máy (M4 Pro). Câu đọc của FLEURS, không phải hội thoại thật (spec §14).
- Thời điểm nói của từng từ là xấp xỉ: chia đều độ dài câu cho số đơn vị của bản chép cuối (spec §10.1).
- Tầng ổn định của dòng đang nói tính theo tỉ lệ (spec §10.1); tầng tạm dựa vào việc gắn dòng với phần chữ của lượt cuối
  (QĐ10 của kế hoạch 02).
- `latency-bench` phát WAV 16 kHz thẳng vào engine, nên không gồm phần thu âm và resample (A3), và không có thanh phụ đề
  (vẽ dòng là việc của kế hoạch 03).
- Lượt đo bộ "mạnh" (gói Chuẩn, ngưỡng 50): lần đo đầu gặp cảnh báo máy đang bận ("phát lại chậm hơn thời gian thực tới
  207 ms") do chủ dự án dùng máy trở lại giữa chừng (ngoài kế hoạch chuẩn bị máy ban đầu); đã dừng, dọn tiến trình phụ,
  và sau khi chủ dự án xác nhận tiếp tục, đã chạy lại TOÀN BỘ 6 phiên từ đầu — số liệu "mạnh" trong báo cáo này là của
  lượt chạy lại (không gặp lại cảnh báo). Tuy vậy, CPU% và một phần độ trễ của riêng lượt "mạnh" vẫn có thể không so
  sánh ngang hàng trực tiếp với các lượt khác (đo lúc máy hoàn toàn rảnh): độ nháy ổn định/chất lượng dịch không phụ
  thuộc tốc độ máy nên vẫn đáng tin, nhưng CPU%/một số độ trễ nên được xem là tham khảo.
