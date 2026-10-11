# Bước 1: mốc chế độ thường, đo bằng engine thật (2026-10-11)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md`, Task 3; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §9 bước 1 và §10.1. Đây là mốc mà các bước sau so với.

## Điều kiện đo

- Máy: Apple M4 Pro, 24.0 GB, macOS 26.6.2 Tahoe (lấy từ một file kết quả).
- Code: nhánh `dich-trong-luc-noi`, commit `5252ebb`, **chưa có A2–A5**.
  - `asr-worker` là sidecar do `scripts/copy-sidecars.sh` dựng (Metal, chế độ B, `flash_attn=off`, sàn `audio_ctx` 512).
  - `llama-server` b11146.
- Cấu hình:
  - ngưỡng ngắt câu 50 ms, là mặc định của app (`--end-silence-ms 50`);
  - ghép câu §6.3;
  - mọi ngưỡng khác là `PipelineConfig::default()`.
- Ngôn ngữ theo `bench/phase0/data/latency/sessions.json`: session `vi` dịch sang tiếng Anh, các session khác sang tiếng Việt.
- Chủ dự án đã thoát app nặng (Chrome, Teams, Slack, VS Code, bản dev/cài của AI Translator), cắm sạc, tạm dừng build ở phiên khác, không dùng máy trong lúc đo. Trước và sau lượt đo:

  ```
  [TRUOC 2026-10-11 06:44:40] total = 4096.00M  used = 3184.31M  free = 911.69M  (encrypted) |  -InternalBattery-0 (id=23920739)	100%; charged; 0:00 remaining present: true | CPU usage: 7.74% user, 22.58% sys, 69.67% idle
  [SAU 2026-10-11 07:45:10] total = 4096.00M  used = 3176.31M  free = 919.69M  (encrypted) |  -InternalBattery-0 (id=23920739)	100%; charged; 0:00 remaining present: true | CPU usage: 7.50% user, 13.12% sys, 79.37% idle
  ```

  **Giới hạn đã biết — CPU rảnh dưới ngưỡng khuyến nghị:** kế hoạch khuyến nghị CPU rảnh trên khoảng 90% trước khi đo. Ở
  Step 3 đo được **69,67% idle** (dòng TRUOC ở trên). Đo lại ngay sau đó hai lần nữa, cách nhau 5 giây: **81,1% idle**, rồi
  **81,81% idle**. Tức CPU rảnh dao động quanh mức 70–82% trong lúc chuẩn bị đo, không đạt ngưỡng ~90% kế hoạch khuyến
  nghị. Đã báo điều phối viên; chủ dự án quyết định chấp nhận mức này và cho đo luôn, không chờ thêm. Tiến trình chiếm
  CPU nhiều nhất lúc kiểm (`ps -Ao pid,pcpu,pmem,comm -r`): `StorageManagementService` (tác vụ hệ thống macOS, 88,8% một
  lõi lúc đo, có vẻ thoáng qua) và các tiến trình Microsoft Defender (`epsext`, `wdavdaemon*`, tổng khoảng 12%, có vẻ
  chạy nền thường trực trên máy này, không tắt được). Xem thêm mục Giới hạn.

## Cách chạy

```
cargo build --release --locked -p latency-bench
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-moc
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc1-moc
python3 bench/2026-10-10-do-tre/summarize_sessions.py bench/2026-10-10-do-tre/results/buoc1-moc-*.json
```

Bản đầy đủ (có `events`) nằm ở `target/do-tre/sessions/`, không commit. File trong thư mục này đã bỏ `events`.

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

## Nhận xét

- **So với mô phỏng của nghiên cứu** (`bench/2026-10-10-do-tre/README.md` §0, cùng ngưỡng 50 ms, gói Chuẩn):
  - chữ dịch đầu tiên sau chỗ ngừng là 0,42–0,46 s; ở đây `A2 chữ đầu p50` là 368–437 ms (6 session gói Chuẩn: thấp nhất
    `chuan-zh` 368 ms, cao nhất `chuan-ja` 437 ms) — khớp khá sát với mô phỏng, hơi thấp hơn một chút.
  - từ đầu câu tới lúc đoạn đầu đóng là p50 3 072 / p90 5 824 ms, chưa gồm ASR và dịch; ở đây "Đầu câu → chữ dịch" (đã
    gồm ASR và dịch, lấy từ bảng theo tiếng ở trên, gộp cả hai gói) là p50 1 729–4 435 ms, p90 4 567–6 425 ms — thấp
    nhất ở tiếng Việt/Trung (câu ngắn hơn), cao nhất ở tiếng Anh/Nhật (câu dài hơn, nhiều đoạn hơn mỗi câu). Vẫn cùng
    cỡ độ lớn với mô phỏng dù đã cộng thêm thời gian ASR và dịch thật.
- **A2:** ngưỡng là p50 ≤ 2 000 ms, p90 ≤ 3 000 ms, chữ đầu p50 ≤ 1 000 ms. **ĐẠT cả 12/12 session**, dư địa lớn (hơn gấp
  đôi ngưỡng p50 ở session cao nhất). Lớn nhất: p50 775 ms (`buoc1-moc-chuan-en`), p90 940 ms (`buoc1-moc-chuan-ja`),
  chữ đầu p50 437 ms (`buoc1-moc-chuan-ja`).
  - Mốc S6 cũ đo với ngưỡng 300 ms (`bench/phase1/results/s6-a2-2026-10-04.md`); ở đây là 50 ms, nên câu vụn hơn và ghép nhiều hơn.
- **Độ nháy của tầng tạm** (`Nháy tạm`): khoảng 5,1%–92,5% qua 12 lượt, trung bình khoảng 53%, dao động rất mạnh theo
  tiếng — thấp nhất `buoc1-moc-chuan-vi` (5,1%), cao nhất `buoc1-moc-chuan-zh` (92,5%). Chủ yếu do ghép câu xóa bản dịch
  đang hiện; A2 (Task 5) nhắm vào chỗ này.
- **CPU cả máy:** khoảng 2,1%–4,3% (ngưỡng 30%, spec chính §8), xa dưới ngưỡng nhiều lần. **Mức bận** (thời gian chép
  lời và dịch chia thời gian phiên): khoảng 8,9%–22,7% — gói Chuẩn trung bình khoảng 18%, gói Nhẹ khoảng 11,5% (model
  nhỏ hơn nên xử lý nhanh hơn).
- **Hai cảnh báo chẩn đoán mới** (kiểm `run.utterances_without_pieces` và `run.failed`/`run.skipped` của cả 12 file):
  `run.failed` = 2 chỉ ở `buoc1-moc-chuan-zh` (khớp dòng "CẢNH BÁO: 2 câu dịch thất bại hoặc bị bỏ qua trong lượt đo"
  lúc chạy Step 4); 11 file còn lại `failed` = `skipped` = 0. `run.utterances_without_pieces` = 0 ở cả 12 file — không
  xuất hiện ở ngưỡng 50 ms, đúng như dự đoán vì S6 không có khoảng lặng dưới 416 ms.

## Giới hạn

- Một máy (M4 Pro). Câu đọc của FLEURS, không phải hội thoại thật (spec 2026-10-10 §14).
- Thời điểm nói của từng từ là xấp xỉ: chia đều độ dài câu cho số đơn vị của bản chép cuối (spec §10.1).
- `latency-bench` phát WAV 16 kHz thẳng vào engine, nên không gồm phần thu âm và resample (A3).
- CPU rảnh lúc đo chỉ khoảng 70–82% (ba lần đo ở Step 3: 69,67%, 81,1%, 81,81% idle), dưới ngưỡng ~90% kế hoạch khuyến
  nghị. Nguyên nhân: `StorageManagementService` (tác vụ hệ thống macOS, có vẻ thoáng qua) và Microsoft Defender (tổng
  khoảng 12% CPU, có vẻ chạy nền thường trực, không tắt được). Chủ dự án đã quyết định chấp nhận và đo luôn thay vì chờ
  máy rảnh hơn. Đây là giới hạn đã biết của lượt đo này: số liệu có thể nhiễu nhẹ hơn mức lý tưởng so với một lượt đo có
  CPU rảnh ≥ 90%. Tuy vậy phát trễ đo được (`feed_lag_max_ms`) vẫn dưới 100 ms và không có lần khởi động lại sidecar nào
  ở cả 12 lượt (xem Step 6), nên mức nhiễu này được coi là chấp nhận được và không làm mất hiệu lực của mốc.
