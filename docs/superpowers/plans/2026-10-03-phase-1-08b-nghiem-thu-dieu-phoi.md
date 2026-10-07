# Phase 1 · 08b: Nghiệm thu — điều phối và đo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Nghiệm thu Phase 1 (mục 2.8 của kế hoạch 00): A1–A7 (spec §3.3), tải máy (§8), ma trận thủ công, soak test, cài đặt, bảo mật (§11), hai điều kiện A4 còn thiếu (C13, Đ11), và đưa bảng đối chiếu của kế hoạch 00 về 100% (`xong`, hoặc `hoãn` có chủ dự án duyệt). Bàn giao: báo cáo nghiệm thu `bench/phase1/results/acceptance/report.md` và số liệu gốc trong `bench/`.

**Cách làm:** Agent chạy script của 08a và tổng hợp; người thao tác app họp, tai nghe, máy tham chiếu, máy Windows, proxy, bộ cài đã ký, giao dịch thật. Mỗi task ghi rõ: **ai làm**, **cần trước**, lệnh hay bước, **Expected**, và **ghi vào** (file kết quả). Bước của người đã viết ở kế hoạch trước thì 08b chỉ trỏ tới, không viết lại (QĐ12 của 08a).

**Công nghệ:** Không thêm thư viện. Dùng script ở `bench/phase1/acceptance/` (08a), `latency-bench`, `bench/phase0/latency/run_matrix.py`, `score_mt.py`, `score_asr.py` (Phase 0, 02b). Proxy cho A7: mitmproxy ở chế độ theo tiến trình (`--mode local:…`; người cài, ví dụ `brew install mitmproxy` hay `uv tool install mitmproxy`).

Làm sau 08a (`docs/superpowers/plans/2026-10-03-phase-1-08a-nghiem-thu-cong-cu.md`; dòng của bảng đối chiếu, QĐ, điểm cần chủ dự án quyết nằm ở đó). Thứ tự gợi ý:

```
Task 1 (agent) ─► Task 2 (đợt việc người của 01–07, gồm đợt Windows) ─┬─► Task 5 (A2, máy tham chiếu) ─┐
                 Task 3 (C13, người, làm được ngay) ─► Task 4 (A3, A4) ┤                                 │
                                                                        ├─► Task 6 (A5) ─► Task 7 (A7) ├─► Task 11
                                                                        ├─► Task 8 (A1)                 │
                                                       07b Task 13 ─────┴─► Task 9 (A6, T1, T2) ─► Task 10 (P1)
```

Task 3 làm được ngay, không chờ gì (Đ11). Task 4–9 chạy trên **bản ứng viên phát hành** (Task 1 Step 2): đổi bản thì chạy lại các cổng số liệu (Task 4, 5) và ghi lại SHA.

---

## Task 1: Chuẩn bị (agent)

**Ai làm:** agent. **Cần trước:** 08a xong.

**Files:**
- Create: `bench/phase1/results/acceptance/README.md`
- Create: `bench/phase1/results/acceptance/a1-matrix.md`, `a6-checklist.md` (chép từ mẫu)

- [ ] **Step 1: Bảng việc còn lại**

Run:
```bash
python3 bench/phase1/acceptance/mapping.py summary
```
Expected: dòng tổng và bảng "Việc chặn" (lúc lập kế hoạch: 357 dòng; `xong` 199; nhóm lớn nhất là "người", "Windows", "khác"). Dùng bảng này để giao việc ở Task 2.

- [ ] **Step 2: Chốt bản ứng viên phát hành**

Ghi vào `bench/phase1/results/acceptance/README.md`: commit (`git rev-parse HEAD`), tag nếu có (07b Task 13), tên và SHA-256 của `.dmg` và bộ cài Windows (bảng SHA-256 của 07b Task 15), ngày. Mọi task sau ghi kết quả của đúng bản này; có bản mới thì ghi thêm dòng và chạy lại các task có ghi "chạy lại khi đổi bản".

- [ ] **Step 3: Chép mẫu**

Run:
```bash
mkdir -p bench/phase1/results/acceptance
cp bench/phase1/acceptance/a1-matrix.template.md bench/phase1/results/acceptance/a1-matrix.md
cp bench/phase1/acceptance/a6-checklist.template.md bench/phase1/results/acceptance/a6-checklist.md
python3 bench/phase1/acceptance/report.py | sed -n 3p
```
Expected: `Kết luận: **CHƯA ĐẠT**`.

- [ ] **Step 4: Commit**

```bash
git add bench/phase1/results/acceptance
git commit -m "test(bench): chuẩn bị nghiệm thu Phase 1: bản ứng viên, mẫu ma trận A1 và danh sách A6 (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Đợt việc của người và Windows còn lại của 01–07 (cần người, máy Windows, tài khoản)

**Ai làm:** người, agent ghi kết quả và cập nhật bảng đối chiếu. **Cần trước:** Task 1.

Các bước đã viết ở kế hoạch gốc, kèm Expected; làm theo đúng thứ tự dưới đây (Mac trước, rồi một đợt Windows như mục 3 của kế hoạch 00, rồi tài khoản). Sau mỗi dòng: agent cập nhật dòng tương ứng của bảng đối chiếu theo Task 4 của kế hoạch 00 (`xong` kèm SHA của commit kết quả, hay `chờ` kèm lý do), rồi chạy lại Task 1 Step 1.

| # | Việc | Kế hoạch gốc | Ai, máy | Ghi vào |
|---|---|---|---|---|
| 1 | S1: thu âm trên macOS (app họp, tap một app, tai nghe, đổi thiết bị, từ chối quyền) | 0-04 Task 6 (C1) | người, Mac, máy thứ hai | `bench/phase0/results/s1_capture.md` |
| 2 | S5 trên Mac: thanh phụ đề trên app họp toàn màn hình, phím tắt trùng | 0-05 Task 3 (C5) | người, Mac | `bench/phase0/results/s5_overlay.md` |
| 3 | Thử tay nền app trên Mac (phần còn thiếu: Restart, Shut Down, khay › Thoát, Login Items, `settings.json` hỏng, Keychain) | 01 Task 24 | người, Mac | `bench/phase1/results/p01_app_shell_manual.md` |
| 4 | Pipeline với âm thanh thật trên Mac | 02c Task 8 | người, Mac | file của 02c Task 8 |
| 5 | Chạy lại A3, A4, S6 bằng code của app (máy rảnh) | 02b Task 7–9 | agent, Mac rảnh | `bench/phase0/results/gd1_*.md` |
| 6 | Thử tay phụ đề, bản chép lời, lịch sử, từ điển | 03b Task 8 | người, Mac | `bench/phase0/results/gd1_03_mac.md` |
| 7 | Staging license server, giao dịch thử | 05 Task 19–20 | người, Cloudflare, PayOS (T4, T5, P05-1) | theo 05 |
| 8 | Bucket R2, khóa và manifest staging | 04b Task 13 | người, Cloudflare | theo 04b |
| 9 | Bản quyền trên Mac với staging | 06b Task 6 | người, Mac | `bench/phase0/results/gd1_06_mac.md` |
| 10 | So `llama-server` tự build với b11146 (A3, S6) | 07a Task 13 | agent, Mac rảnh | theo 07a |
| 11 | Repo từ xa, CI, workflow phát hành lần đầu; thử `.dmg` | 07a Task 14–15 (T3) | người, GitHub | theo 07a |
| 12 | Đợt Windows: công cụ, S3, S2, S5, S4 trên Windows; phần Windows của 01, 02, 03, 04, 06, 07a | 0-01 Task 2; 0-03 Task 14–16; 0-04 Task 7–8; 0-05 Task 4; S4 (C4); 01 Task 25; 02c Task 9; 03b Task 9; 04b Task 14; 06b Task 7; 07a Task 16 | người, máy Windows có card rời, máy ảo không có Vulkan | file của từng task |
| 13 | Khóa production, R2, URL production, tên miền | 07b Task 11–12 (T7) | người | theo 07b |
| 14 | Lên production license server | 05 Task 21 | người | theo 05 |
| 15 | Ký thật, bản beta đầu tiên, cập nhật từ bản trước, Gatekeeper, SmartScreen | 07b Task 13–15 (T1, T2) | người, GitHub, Mac, Windows | theo 07b |
| 16 | C15: báo cáo Phase 0 và kết luận S3 | 0-00 Task 1, 0-03 Task 17 | agent, sau dòng 12 và Task 5 | `bench/phase0/REPORT.md`, `bench/phase0/results/s3_lid.md` |

- [ ] **Step 1: Làm lần lượt các dòng trên**, mỗi dòng theo Expected của kế hoạch gốc.
- [ ] **Step 2: Sau mỗi dòng, agent cập nhật bảng đối chiếu** (Task 4 của kế hoạch 00) và commit kết quả cùng bảng:

```bash
git add bench docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md
git commit -m "test: <việc vừa làm> (kế hoạch 08, Task 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Hai điều kiện A4 còn thiếu, C13 (cần người)

**Ai làm:** người thu và nghe; agent dựng clip, chấm, đề xuất mốc mới. **Cần trước:** không (Đ11). **Dòng:** 30, 31.

**Files:**
- Modify: `bench/phase0/asr/score_asr.py` (bảng `SPOKEN_GLOSS`, nếu nghe lại thấy cần)
- Create: `bench/phase0/results/a4_c13.md`

- [ ] **Step 1: Thu clip thật qua tai nghe Bluetooth** (người). Phát 20 clip FLEURS mỗi ngôn ngữ (en, vi, zh, ja, ko; lấy trong `bench/phase0/data/asr/` của bộ A4) qua loa ngoài, đeo tai nghe Bluetooth ở chế độ đàm thoại (HFP: bật micro của tai nghe trong một cuộc gọi thử), và cho app thu âm thanh hệ thống như khi họp. Cách đơn giản: một cuộc họp Zoom hai máy, máy A phát clip, máy B đeo tai nghe Bluetooth và chạy `latency-bench asr-eval` với nguồn thu là thiết bị tai nghe. Ghi tên tai nghe, codec nếu biết.
- [ ] **Step 2: Nghe lại 24 clip có chú thích Latin** trong bản chép chuẩn (zh 16, ja 3, ko 5; danh sách do `score_asr.py` in khi chạy với `--allow-partial` trên các clip đó, hay tìm `strip_latin_gloss` trong `score_asr.py`). Với mỗi clip, người ghi: người nói có đọc phần Latin không. Có đọc thì bỏ phần đó khỏi `SPOKEN_GLOSS` cho clip đó; không đọc thì giữ.
- [ ] **Step 3: Chấm lại** (agent) như 02b Task 8 Step 2 cho cả bộ cũ và clip Bluetooth thật, với nhãn `m4pro-<model>-c13`. Expected: các file `a4_m4pro-<model>-c13.json`; nhóm Bluetooth thật có WER/CER riêng.
- [ ] **Step 4: Ghi `a4_c13.md`** (agent): bảng so mốc cũ (`-final.json`) với kết quả mới, danh sách 24 clip và quyết định cho từng clip, và đề xuất mốc mới. Gửi chủ dự án duyệt. Chỉ khi chủ dự án duyệt mới thay mốc (mục 6.7 của kế hoạch 00) và ghi ngày duyệt vào dòng 30, 31.
- [ ] **Step 5: Commit**

```bash
git add bench/phase0/results/a4_c13.md bench/phase0/results/a4_m4pro-*-c13.json bench/phase0/asr/score_asr.py
git commit -m "test(bench): hai điều kiện A4 còn thiếu: clip Bluetooth thật, nghe lại 24 clip có chú thích Latin (C13, kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: A3, A4 chống thụt lùi lần cuối (agent, máy rảnh; chạy lại khi đổi bản)

**Ai làm:** agent. **Cần trước:** Task 1 Step 2; Task 2 dòng 10 (biết cách chạy `latency-bench` với tiến trình phụ của bản phát hành). **Dòng:** 27, 28, 29, 121, 297.

- [ ] **Step 1: Dịch và chấm A3** theo 02b Task 7 Step 1–3, trên commit của bản ứng viên, với tiến trình phụ của bản phát hành (cách chỉ đường dẫn ở 07a Task 13), nhãn `gd1-08`. Expected: `bench/phase0/results/s7_mt-gd1-08.json`.
- [ ] **Step 2: Cổng A3**

Run:
```bash
python3 bench/phase1/acceptance/gates.py a3 --report bench/phase0/results/s7_mt-gd1-08.json --baseline bench/phase0/results/s7_mt.json --out bench/phase1/results/acceptance/a3.json | tail -1
```
Expected: `A3: ĐẠT`. Không đạt thì dừng: tìm thay đổi nào gây thụt lùi (model, engine, prompt), báo controller; không đổi mốc.

- [ ] **Step 3: Chép lời và chấm A4** theo 02b Task 8 Step 1–2, nhãn `m4pro-turbo-gd1-08`, `m4pro-small-gd1-08`.
- [ ] **Step 4: Cổng A4** (mốc là `-final.json`, hay mốc mới nếu chủ dự án đã duyệt ở Task 3)

Run:
```bash
for m in turbo small; do
  python3 bench/phase1/acceptance/gates.py a4 --result bench/phase0/results/a4_m4pro-$m-gd1-08.json --baseline-turbo bench/phase0/results/a4_m4pro-turbo-final.json --baseline-small bench/phase0/results/a4_m4pro-small-final.json --out bench/phase1/results/acceptance/a4-$m.json | sed -n '1p;$p'
done
```
Expected: `Gói (suy từ số đo): turbo`, `A4: ĐẠT`, `Gói (suy từ số đo): small`, `A4: ĐẠT`. Gói do `gates.py` suy từ số đo (mốc gần hơn) và ghi vào JSON; `report.py` đọc gói đó, không đọc tên file (Q1 của review lần 2). Gói suy ra khác tên file nghĩa là chép nhầm kết quả: kiểm lại nhãn ở Step 3. Mốc mới đã duyệt ở Task 3 thì thay đường dẫn của `--baseline-turbo`, `--baseline-small`.

- [ ] **Step 5: Flash attention** (dòng 121): xem trạng thái `ggml-org/whisper.cpp#3941` (mask cho phần đệm). Đã có bản sửa trong bản phát hành của whisper.cpp đang dùng thì ghi đề xuất bật lại cho controller (đổi engine: phải chạy lại Step 3–4); chưa có thì ghi "vẫn tắt, upstream chưa sửa" kèm ngày vào dòng 121.
- [ ] **Step 6: Commit**

```bash
git add bench/phase0/results bench/phase1/results/acceptance
git commit -m "test(bench): A3, A4 chống thụt lùi trên bản ứng viên phát hành (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: A2, RAM, VRAM trên máy tham chiếu (cần người, máy tham chiếu; chạy lại khi đổi bản)

**Ai làm:** người mượn máy, mở Terminal; agent đưa lệnh và tổng hợp. **Cần trước:** Task 1 Step 2. **Dòng:** 12, 26, 209, 225, 227, 228.

Máy (C6, C7, C8): Mac M1 16 GB; Mac chip cơ bản đời mới (M2–M5); Mac Apple Silicon 8 GB (hạng tối thiểu, gói Nhẹ; N4 của review lần 1); laptop Windows card rời 6 GB và 4 GB; máy Windows 8 GB chỉ có CPU (hạng tối thiểu); GPU tích hợp. Mỗi máy đóng app nặng, cắm sạc (mục 6.9 của kế hoạch 00). Chỉ máy đúng một hạng của §8 ghi kết quả cổng vào `bench/phase1/results/acceptance/`: Mac, laptop Windows card rời ≥ 6 GB (khuyến nghị, Windows chạy `asr-worker-vulkan`), máy Windows chỉ CPU (tối thiểu, `asr-worker-cpu`). Card 4 GB và GPU tích hợp cũng chạy Vulkan, mà `gates.py` không phân biệt được với card rời ≥ 6 GB (QĐ3 của 08a), nên ghi `--out` của hai máy này ra `bench/phase1/results/a2-<tên-máy>.json`, ngoài `acceptance/` (chỉ để đề xuất gói, dòng 303).

- [ ] **Step 1: Đo S6** theo kế hoạch 0-06 Task 8–9 (Windows có thêm `vram-sample.ps1`), với `latency-bench` và `asr-worker` build từ commit của bản ứng viên, và `llama-server` của bản ứng viên: đặt binary lấy từ bộ cài vào `tools/llama-b11146/<biến thể>/` rồi thêm `--llama-variant <biến thể>`, đúng cách của 07a Task 13 Step 2 và 4 (Q5 của review lần 1). Lệnh: `python3 bench/phase0/latency/run_matrix.py --machine <tên-máy> --tier <khuyennghi|toithieu> --package <chuan|nhe> --llama-variant <biến thể>`. Expected: 6 file mỗi gói, `bench/phase0/results/latency/<tên-máy>-<hạng>-<gói>-<session>.json` (nhãn có hạng máy; session là `en`, `vi`, `zh`, `ja`, `ko`, `mixed`); Windows thêm `vram-<tên-máy>-<gói>.csv`. Máy khuyến nghị đo ít nhất gói Chuẩn, máy tối thiểu ít nhất gói Nhẹ (§8). `<tên-máy>` khác cho mỗi máy và không trùng tên của lượt cũ trong thư mục (ví dụ thêm ngày: `m1-16g-1010`); đo lại một session thì ghi đè đúng file đó (cùng nhãn).
- [ ] **Step 2: Cổng A2** cho từng máy (QĐ3 của 08a)

Run (liệt kê đúng file của lượt này, theo nhãn; N6 của review lần 2):
```bash
ls bench/phase0/results/latency/<tên-máy>-<hạng>-*.json
python3 bench/phase1/acceptance/gates.py a2 bench/phase0/results/latency/<tên-máy>-<hạng>-*.json --out bench/phase1/results/acceptance/a2-<tên-máy>.json
```
Expected: `ls` in đúng các file của Step 1 (6 hay 12 file, cộng file `-nomerge` nếu có), không file nào của lượt khác. Lệnh cổng in dòng đầu `Máy: <hệ điều hành> | <CPU> | <RAM> GB | <số lõi> lõi; hạng: <hạng>` khớp với máy đang đo (người đối chiếu với Giới thiệu về máy này / Settings › System › About), không có dòng `Thiếu session: …`, và dòng cuối `A2: ĐẠT`. Gói, máy do `gates.py` đọc từ chính các file (model, `machine`); hạng trong nhãn chỉ để đối chiếu (Q2 của review lần 2):
  - `nhãn ghi … mà máy là … (macOS, … GB)` hay `(Windows, … GB, vulkan|cpu)`: hạng do công cụ suy từ máy (RAM ≥ 15 GB, vì Windows ghi RAM dùng được, máy 16 GB báo 15,3–15,9 GB; Windows thêm backend: Vulkan là có card) khác nhãn. Kiểm máy trước khi đo lại: RAM lắp (Giới thiệu về máy này / Settings › System › About) và card (Device Manager › Display adapters). Nhãn sai thì đo lại với `--tier` đúng; máy Windows có card rời ≥ 6 GB mà backend là `cpu` thì `asr-worker-vulkan` không chạy được trên máy đó: ghi lỗi, báo controller, không đổi hạng để cho qua (Q1, N2 của review lần 3).
  - `nhãn ghi session … mà câu đo là …`: file của session khác bị đổi tên hay chép nhầm; đo lại session đó.
  - `trùng session …`: có file của lượt cũ hay của biến thể cùng nhãn; bỏ file thừa khỏi lệnh (đổi tên máy, hay xóa file cũ chưa commit), chạy lại.
  - `chỉ đo được …`, `phát lại trễ …`, `mốc dừng lệch …`: lượt đo không đáng tin (máy bận): đóng app nặng, đo lại session đó.
  - Windows chia hạng theo GPU (§8) mà file không ghi GPU: ghi tên card và VRAM của máy vào `bench/phase0/results/s6_latency.md` cạnh kết quả (Step 3).
  Máy nào không đạt thì ghi vào C8 (chọn phương án ở §8, Q15) cho chủ dự án; không sửa ngưỡng. `report.py` cần một máy hạng khuyến nghị và một máy hạng tối thiểu, hai máy khác nhau (đọc `tier`, `machine` trong `a2-*.json`).

- [ ] **Step 2b: Số của app thật** (người; QĐ3 của 08a). Cài bản ứng viên trên cùng máy, chọn cùng gói với S6 (khuyến nghị: Chuẩn; tối thiểu: Nhẹ), mở bảng debug (Giới thiệu, bấm 5 lần vào dòng phiên bản). Với **từng** file WAV mà S6 đã dùng (`bench/phase0/data/latency/` của kế hoạch 0-06; 6 file, một mỗi session): bấm Bắt đầu, phát đúng file đó bằng QuickTime (Windows: Media Player) qua loa, đợi câu cuối hiện, đọc p50, p90 của bước `total`, rồi Dừng; mỗi file một phiên. Agent ghi vào `bench/phase1/results/acceptance/a2-<tên-máy>-app.md` một bảng, mỗi dòng một file: `| session | file WAV | S6 p50 | S6 p90 | app p50 | app p90 | chênh p50 | chênh p90 |`, với số S6 lấy từ `summary.shown_p50_ms`, `summary.shown_p90_ms` của đúng file `<tên-máy>-<hạng>-<gói>-<session>.json` (N6 của review lần 2). Expected: mỗi dòng chênh không quá 300 ms; dòng nào chênh nhiều hơn thì tìm nguyên nhân (đường thu, IPC, vẽ chữ) và ghi giải thích dưới bảng trước khi kết luận A2.

- [ ] **Step 3: RAM, VRAM, mức CPU cố định**: ghi `peak_rss_mb`, `peak_footprint_mb` (từ `usage` của các file JSON) và VRAM đỉnh (`vram_peak.py`) vào `bench/phase0/results/s6_latency.md` theo kế hoạch 0-06. Máy CPU thiếu RAM thì thử `--no-repack` (dòng 227). Máy tối thiểu x64 (AVX2, không AVX-512) chạy được bản phát hành là bằng chứng cho dòng 209. Ngưỡng VRAM, đề xuất gói đổi thì sửa manifest theo Task 4 của kế hoạch 00, không phát hành lại app.
- [ ] **Step 4: Commit**

```bash
git add bench/phase0/results bench/phase1/results/acceptance
git commit -m "test(bench): A2, RAM, VRAM trên máy tham chiếu <tên-máy> (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: A5 soak 2 giờ và tải máy (cần người)

**Ai làm:** người chạy app và phát âm thanh; agent lấy mẫu và tổng hợp. **Cần trước:** Task 1 Step 2. **Dòng:** 32, 229, 306.

Một lượt trên Mac khuyến nghị (`a5-mac`) và một lượt trên Windows có card rời (`a5-win`); máy tối thiểu chạy 30 phút để xem RAM (điểm cần quyết 2 của 08a). Tên file chỉ để người đọc: mỗi dòng CSV ghi hệ điều hành và mã máy lúc lấy mẫu, `report.py` đọc `os` trong `a5-*.json` (Q1 của review lần 2). Mọi lệnh chạy trên chính máy đo.

- [ ] **Step 1: Kiểm tên tiến trình** (người mở bản ứng viên đã cài, bấm Bắt đầu với một video bất kỳ; agent chạy)

Run (macOS):
```bash
ps -A -o comm= | grep -i -e translator -e asr-worker -e llama-server | xargs -I{} basename "{}" | sort -u
```
Run (Windows, PowerShell):
```powershell
Get-Process | Where-Object { $_.ProcessName -match 'translator|asr-worker|llama-server' } | Select-Object -ExpandProperty ProcessName -Unique
```
Expected: tên của app (ví dụ `meeting-translator` hay `AI Translator`), `asr-worker` (Windows: `asr-worker-vulkan` hay `asr-worker-cpu`) và `llama-server`. Tên app khác `meeting-translator` thì dùng tên đó cho `--app` ở Step 2, thêm `--require <tên app>,asr-worker,llama-server,<WebView>` ở Step 3 (`<WebView>` là `com.apple.WebKit` trên macOS, `msedgewebview2` trên Windows), và cho 08b Task 7.

Trên macOS, `soak.py sample` dừng với lỗi `macOS không có responsibility_get_pid_responsible_for_pid …` nếu bản macOS này không còn hàm đó: ghi lại, báo controller, không đo A5 thiếu WebView (N4 của review lần 3). Rồi kiểm các tiến trình `soak.py` sẽ tính (Windows: `py -3` thay cho `python3`):
```bash
python3 bench/phase1/acceptance/soak.py pids --app <tên app>
```
Expected: mỗi dòng một `pid tên`: app, `asr-worker…`, `llama-server`, cộng WebView của app: macOS 2–4 dòng `com.apple.WebKit.*` (chỉ của app; Safari, Mail đang mở không có trong danh sách: `soak.py` hỏi hệ điều hành tiến trình chịu trách nhiệm, N1 của review lần 2), Windows vài dòng `msedgewebview2` (con cháu của app). Không cần đóng app khác. macOS không có dòng `com.apple.WebKit` nào thì hàm của libSystem không gán được WebKit cho app: `summarize` sẽ báo `THIẾU tiến trình bắt buộc ở mẫu đầu: com.apple.WebKit` (WebView là tiến trình bắt buộc mặc định); ghi lại, báo controller, không đo tiếp.

- [ ] **Step 2: Phát 2 giờ và lấy mẫu.** Người phát một bản ghi cuộc họp hay hội thảo tiếng Anh dài hơn 2 giờ, nói liên tục (ví dụ một buổi họp công khai, bài giảng), qua loa ở âm lượng thường, app họp mở như khi họp (Zoom hay Meet không bắt buộc). Bấm Bắt đầu, rồi agent chạy:

```bash
python3 bench/phase1/acceptance/soak.py sample --app <tên app ở Step 1> --every 10 --duration 7320 --out bench/phase1/results/acceptance/a5-mac.csv
```
Expected: sau khoảng 2 giờ 2 phút in `733 mẫu, ghi …`. Trong lúc chạy, người không dùng máy cho việc nặng khác; ghi GPU từ Activity Monitor (Window › GPU History) hay Task Manager (tab Performance) mỗi 30 phút vào `a5-mac.md` (QĐ6 của 08a).

- [ ] **Step 3: Tổng hợp**

Run:
```bash
python3 bench/phase1/acceptance/soak.py summarize bench/phase1/results/acceptance/a5-mac.csv --out bench/phase1/results/acceptance/a5-mac.json
```
Expected: dòng đầu `Nơi đo: mac, máy <mã 12 ký tự>` (một nơi; `NHIỀU NƠI/KHÔNG RÕ` là CSV lẫn mẫu của máy khác: lấy mẫu lại vào file mới), không có dòng `THIẾU tiến trình bắt buộc…`, `Số mẫu: 733; thời gian: 7320 giây (đủ 2 giờ)`, `Biến mất: không; khởi động lại: không`, RAM tăng không quá `+10.0%`, `A5: ĐẠT; tải máy ≤ 30%: ĐẠT` (tải máy chỉ là tiêu chí trên máy khuyến nghị). App crash hay tiến trình phụ khởi động lại thì xem log của app (Cài đặt › Giới thiệu › mở thư mục log), sửa theo superpowers:systematic-debugging, chạy lại.

- [ ] **Step 4: Windows**: lặp Step 1–3 trên máy Windows có card rời, tên file `a5-win.*`; Expected như trên với `Nơi đo: win, …`. Máy tối thiểu: `--duration 1800` ở `sample`, `--hours 0.5` ở `summarize`, ghi ra `bench/phase1/results/a5-min-30m.csv` và `.json`, ngoài thư mục `acceptance/`: lượt này chỉ để xem RAM, còn `report.py` gom mọi `a5-*.json` trong `acceptance/` và đòi mỗi file đạt 2 giờ.
- [ ] **Step 5: Commit**

```bash
git add bench/phase1/results/acceptance
git commit -m "test(bench): A5 soak 2 giờ và tải máy trên Mac và Windows (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: A7 qua proxy, log không có chữ chép lời (cần người)

**Ai làm:** người cài proxy và chứng chỉ gốc, thao tác app; agent kiểm nhật ký. **Cần trước:** Task 1 Step 2; bản ứng viên có URL license server, manifest, `latest.json` thật (Task 2 dòng 7, 8, 13, 14). **Dòng:** 7, 34, 83, 248, 249, 315.

- [ ] **Step 1: Kiểm cách mitmproxy khớp tên tiến trình** (người, trên máy thử, trước khi cài chứng chỉ; mỗi hệ điều hành một lần). Chế độ `local:<tên>` có thể khớp nguyên tên hay một phần tên, và trên Windows tên có đuôi `.exe`; lệnh ở Step 3 dựa vào kết quả này. Dùng `curl` với `http://` (không TLS, không cần chứng chỉ):

Run (cửa sổ 1, lần lượt từng dòng, mỗi lần Ctrl+C rồi dòng sau):
```bash
mitmdump --mode local:curl
mitmdump --mode local:cur
```
Run (cửa sổ 2, mỗi lần cửa sổ 1 đang chạy; Windows dùng `curl.exe`):
```bash
curl -s -o /dev/null http://example.com/
```
Expected: với `local:curl`, cửa sổ 1 in một dòng có `GET http://example.com/` (chế độ `local` chạy được). Với `local:cur`: có dòng `GET` nghĩa là mitmproxy khớp một phần tên, `asr-worker` ở Step 3 bắt được `asr-worker-vulkan`, `asr-worker-cpu`; không có dòng nào nghĩa là khớp nguyên tên, Step 3 phải liệt kê đúng tên đầy đủ ở 08b Task 6 Step 1 (Windows: thử thêm `local:curl.exe`; dòng nào bắt được thì dùng dạng tên đó, ví dụ `asr-worker-vulkan.exe`). Ghi kết quả (khớp một phần hay nguyên tên, có `.exe` hay không) vào `bench/phase1/results/acceptance/a7-<máy>.md`.

- [ ] **Step 2: Danh sách cho phép** (agent): chép `bench/phase1/acceptance/a7-allow.template.json` thành `bench/phase1/results/acceptance/a7-allow.json`, thay `LICENSE_HOST`, `MODELS_HOST`, `UPDATE_HOST` bằng máy chủ thật của bản ứng viên (đọc từ cấu hình build của 04, 06, 07b), sửa đường dẫn manifest và `latest.json` cho khớp. Giữ từ mồi mặc định.
- [ ] **Step 3: Proxy theo tiến trình của app** (người, Mac; QĐ7 của 08a, Q4 của review lần 1): cài và tin chứng chỉ gốc của mitmproxy (`~/.mitmproxy/mitmproxy-ca-cert.pem`, theo hướng dẫn của mitmproxy), rồi chạy

```bash
mitmdump --mode local:meeting-translator,asr-worker,llama-server --set hardump=$HOME/a7.har
```
(tên theo kết quả Step 1: khớp nguyên tên thì liệt kê đủ tên ở 08b Task 6 Step 1, ví dụ `local:meeting-translator,asr-worker-vulkan,llama-server`; lần đầu macOS hỏi cho phép network extension của mitmproxy). Không đặt proxy hệ thống, không mở trình duyệt: chế độ này chỉ bắt lưu lượng của app và tiến trình phụ.

Giới hạn (N7 của review lần 2; QĐ7 và điểm cần quyết 7 của 08a): chế độ `local` không bắt WebView của app (`com.apple.WebKit.Networking`, `msedgewebview2` mang tên riêng và dùng chung với app khác, nên không đưa vào danh sách), và HAR chỉ ghi luồng HTTP. Phần đó kiểm bằng lưu lượng theo tiến trình suốt phiên ở Step 4, mục 2.
- [ ] **Step 4: Thao tác** (người, ghi giờ đồng hồ của máy, có múi giờ, theo dạng `2026-10-10T09:00:00+07:00`; lấy bằng `date +%Y-%m-%dT%H:%M:%S%z` trên macOS, `Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"` trên Windows):
  1. Mở app (bản ứng viên, có gói trả phí để có `validate`); bấm Cài đặt › Bản quyền › Kiểm tra ngay (để nhật ký có một request ra ngoài **trước** Bắt đầu).
  2. **Bắt đầu** (ghi giờ). Ngay sau đó agent chạy trên máy thử, trong một cửa sổ riêng, để ghi lưu lượng ra ngoài của từng tiến trình của app mỗi 5 giây suốt phiên (N7 của review lần 2, N5 của lần 3; Windows: `py -3`):
     ```bash
     python3 bench/phase1/acceptance/soak.py pids --app <tên app>
     nettop -P -x -t external -L 0 -s 5 -J bytes_in,bytes_out -p <pid 1> -p <pid 2> … > "$HOME/a7-nettop.csv"
     ```
     (mỗi pid ở dòng trên một `-p`; `-t external` bỏ lưu lượng loopback giữa app và hai tiến trình phụ). Windows (PowerShell), với `$p` là mảng các pid ở dòng trên:
     ```powershell
     $p = @(<pid 1>, <pid 2>, …); while ($true) { Get-Date -Format o; Get-NetTCPConnection -OwningProcess $p -ErrorAction SilentlyContinue | Where-Object { $_.RemoteAddress -notin '127.0.0.1','::1','0.0.0.0','::' } | Format-Table -HideTableHeaders OwningProcess,RemoteAddress,RemotePort,State; Get-NetUDPEndpoint -OwningProcess $p -ErrorAction SilentlyContinue | Format-Table -HideTableHeaders OwningProcess,LocalAddress,LocalPort; Start-Sleep 5 } *> "$HOME\a7-conn.txt"
     ```
     Rồi người phát câu mẫu `public/listen-test-en.wav` của repo nhiều lần trong 15 phút bằng QuickTime (file có sẵn, không qua mạng), cùng một file video tiếng Anh có sẵn trên máy.
  3. Ngay trước khi bấm Dừng, agent dừng lệnh ghi ở mục 2 (Ctrl+C). Expected: macOS, mỗi lần ghi là một khối `,bytes_in,bytes_out,` rồi một dòng `<tên>.<pid>,<byte vào>,<byte ra>,` cho mỗi tiến trình (số cộng dồn từ lúc tiến trình chạy): của WebView (`com.apple.WebKit.*`) và hai tiến trình phụ, hai số không tăng từ khối đầu tới khối cuối; của app, chỉ tăng ở lúc có request trong HAR (license server, manifest). Windows: không dòng nào mang pid của `msedgewebview2` hay hai tiến trình phụ; dòng của app chỉ có `RemotePort` 443; không có UDP nào ngoài `127.0.0.1`, `::1`. Agent chép phần liên quan vào `a7-<máy>.md`. Khác thế thì ghi lại (tiến trình, lúc nào, địa chỉ, cổng hay số byte) và xử lý như một vi phạm (Step 5).
  4. **Dừng** (ghi giờ). Bấm Cài đặt › Bản quyền › Kiểm tra ngay lần nữa (để nhật ký có request **sau** Dừng; `netaudit.py` đòi cửa sổ phiên nằm trong nhật ký, Q3 của review lần 2). Xuất bản chép lời ra file (TXT), mở Lịch sử.
  5. Thoát app, dừng mitmdump (HAR được ghi khi dừng), **gỡ chứng chỉ gốc của mitmproxy**.
  6. Agent mở file bản chép lời vừa xuất, chép một cụm 3–5 từ của bản dịch tiếng Việt của câu mẫu vào `canaries` của `a7-allow.json` (N2 của review lần 1).
- [ ] **Step 5: Kiểm** (agent, chạy trên chính máy thử: kết quả ghi hệ điều hành, mã máy của máy chạy lệnh và SHA-256 của HAR; Windows: `py -3`)

Run:
```bash
python3 bench/phase1/acceptance/netaudit.py "$HOME/a7.har" --allow bench/phase1/results/acceptance/a7-allow.json --app-log "$HOME/Library/Logs/com.aitranslator.desktop/app.log" --start <giờ Bắt đầu> --stop <giờ Dừng> --out bench/phase1/results/acceptance/a7-mac.json
```
(Windows: `--app-log "$env:LOCALAPPDATA\com.aitranslator.desktop\logs\app.log"`.) Expected: dòng `Cửa sổ phiên đã kiểm (mốc đã ghi hợp với log của app): <Bắt đầu> … <Dừng>` lệch mốc người ghi không quá vài giây (lệch nhiều là người ghi sai giờ: công cụ đã kiểm theo cửa sổ rộng hơn, ghi chú vào `a7-<máy>.md`; N3 của review lần 3), `Request ra ngoài: N; trong lúc dịch: M` với N ≥ 3 (trước, trong và sau phiên), không dòng `VI PHẠM` nào, `A7: ĐẠT`. `log của app không có phiên dịch nào trùng mốc …` là sai file log hay sai ngày; `phiên dịch trong log của app chưa có dòng kết thúc` là app thoát giữa phiên: làm lại Step 4. `--start`, `--stop` không có múi giờ thì lệnh báo lỗi ngay; `mốc Dừng không sau mốc Bắt đầu` là chép đảo hai mốc; `cửa sổ phiên dịch không nằm trong khoảng thời gian của nhật ký (sai múi giờ?)` là ghi sai múi giờ hay thiếu bước Kiểm tra ngay ở Step 4: sửa mốc (không sửa HAR) rồi chạy lại. Vi phạm "máy chủ không có trong danh sách cho phép" với máy chủ của trình duyệt hay app khác nghĩa là proxy không lọc theo tiến trình: làm lại Step 3, không thêm máy chủ đó vào danh sách. Có vi phạm thì ghi lỗi (request nào, lúc nào), sửa ở kế hoạch sở hữu code đó, chạy lại cả task. Không commit file HAR (QĐ10 của 08a); xóa `$HOME/a7.har` sau khi kiểm.

- [ ] **Step 6: Log không có chữ chép lời** (agent, dòng 315)

Run (macOS):
```bash
grep -rli -e "plotting analysis" -e "public website" "$HOME/Library/Logs/com.aitranslator.desktop" | wc -l
```
Expected: `0`. Lặp Step 1, 3–6 trên Windows (mitmproxy chế độ `local` cũng chạy trên Windows; log ở `%LOCALAPPDATA%\com.aitranslator.desktop\logs` hay đường dẫn trong Cài đặt › Giới thiệu), ghi `a7-win.json`. `report.py` gom mọi `a7-*.json` và đọc `os` trong nội dung (do `netaudit.py` ghi trên máy chạy lệnh, nên Step 5 phải chạy trên chính máy thử): A7 đạt khi có `mac` và `win` và mọi file đạt.

- [ ] **Step 7: Commit**

```bash
git add bench/phase1/results/acceptance
git commit -m "test(bench): A7 qua proxy và log không có chữ chép lời (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: A1 ma trận thủ công (cần người, Mac, Windows, app họp, tai nghe)

**Ai làm:** người; agent ghi. **Cần trước:** Task 1, Task 2 dòng 12 (đợt Windows). **Dòng:** 1, 3, 25, 298–305.

- [ ] **Step 1: Thử từng ô của `a1-matrix.md`** (27 ô; QĐ11 của 08a): bắt đầu cuộc họp thật hay cuộc gọi thử (hai máy hay hai tài khoản), người nói tiếng Anh ở đầu bên kia, chọn thiết bị phát của ô đó. Đạt khi: phụ đề dịch hiện đúng, đủ câu, không chậm thấy rõ; thanh phụ đề nổi trên app họp (cả khi toàn màn hình), không lấy focus; trên hai màn hình thì kéo thanh sang màn hình kia được. Ghi `đạt`, hay `không đạt` kèm lý do ở cột Ghi chú.
- [ ] **Step 2: Các ô đặc biệt của §11** (ghi thêm dòng vào cuối ma trận, cùng định dạng):
  - Windows không có Vulkan (máy ảo): app mở được, dùng `asr-worker-cpu`, `llama-server` chạy bằng CPU, báo "Đang chạy bằng CPU" (dòng 302).
  - Card rời 4 GB và 6 GB: app đề xuất đúng gói; chọn gói Chuẩn trên card 4 GB không lỗi hết bộ nhớ (dòng 303).
  - Khoảng lặng dài trên Windows (tạm dừng video 2 phút): câu cuối vẫn được chốt, thời gian phụ đề không lệch (dòng 304).
  - Khay: X ẩn cửa sổ, phiên không dừng; Thoát ở khay thì không còn tiến trình phụ; `⌘Q`, Quit ở Dock không thoát; tắt máy, đăng xuất không bị chặn; bước 8 trên Windows mở đúng trang Taskbar (dòng 305).
- [ ] **Step 3: Kiểm**

Run:
```bash
python3 bench/phase1/acceptance/report.py | grep "A1 Tương thích"
```
Expected: `| A1 Tương thích | đạt | N ô: đạt N, không đạt 0, chưa thử 0 | … |`.

- [ ] **Step 4: Commit**

```bash
git add bench/phase1/results/acceptance/a1-matrix.md
git commit -m "test(bench): A1 ma trận thủ công trên macOS và Windows (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: A6 cài đặt, bảo mật, Keychain (cần người; T1, T2)

**Ai làm:** người; agent ghi. **Cần trước:** 07b Task 13 (bản ký thật), Task 2 dòng 15. **Dòng:** 33, 307, 308.

- [ ] **Step 1: Danh sách A6**: làm từng mục của `a6-checklist.md` trên bản ký thật (07b Task 13–15 đã có lệnh và Expected cho Gatekeeper, SmartScreen, cập nhật từ bản trước). Đánh `[x]` mục đạt.
- [ ] **Step 2: Bảo mật của §11 với bản ký thật** (06b Task 6 Step 7, 06b Task 7 Step 4, 07b Task 15): sửa một byte trong file thực thi hay ký lại bằng chứng thư khác: app chỉ chạy Free, báo "Bản cài không chính hãng"; thay `asr-worker` hay `llama-server` bằng file khác: app từ chối chạy. Ghi vào `a6-checklist.md` (thêm mục, cùng định dạng).
- [ ] **Step 3: Hộp thoại Keychain và mutex của `License`** (`notes-for-plan08.md`): với bản đã ký, thử ba lúc (lần đầu mở; sau khi nâng bản qua tự cập nhật; sau khi đổi chữ ký, ví dụ cài bản ký ad-hoc đè lên bản ký thật): macOS có hỏi quyền Keychain không, và trong lúc hộp thoại đang mở thì cửa sổ chính, khay, thanh phụ đề có đứng không (bấm thử Bắt đầu từ khay hay phím tắt). Đứng thì báo controller: sửa trước khi phát hành (ghi Keychain sau khi thả mutex, đổi `tick`, `add_usage`, `resolve_*` của 06). Thêm mục kết quả vào `a6-checklist.md`.
- [ ] **Step 4: Kiểm và commit**

Run:
```bash
python3 bench/phase1/acceptance/report.py | grep "A6 Cài đặt"
```
Expected: `| A6 Cài đặt | đạt | N/N mục | … |`.

```bash
git add bench/phase1/results/acceptance/a6-checklist.md
git commit -m "test(bench): A6 cài đặt, gỡ, bản không chính hãng, hộp thoại Keychain với bản ký thật (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Mua thật một đơn trên production (cần người; P1)

**Ai làm:** người (chủ dự án hay người được giao), tiền thật. **Cần trước:** Task 2 dòng 14 (production), dòng 15 (bản beta đã ký). **Dòng:** Nhận từ 06 ở mục 2.8 của kế hoạch 00.

Đơn thật đầu tiên của production (`1000001`) được mua ở 05 Task 21 Step 12 (bằng lệnh, kích hoạt máy giả). Task này mua qua app đã ký để kiểm luồng của app. Theo điểm cần quyết 5 của 08a: bản beta đã ký có trước 05 Task 21 Step 12 thì gộp hai việc (mua đơn `1000001` bằng app, ghi kết quả cho cả hai, chỉ một đơn); 05 đã làm xong thì đây là đơn thứ hai. Hỏi chủ dự án trước khi mua.

- [ ] **Step 1**: Trên bản beta đã ký, mua gói Professional bằng VietQR như 06b Task 6 Step 3, nhưng với production. Expected như ở đó: app tự kích hoạt, email có key, Cài đặt › Bản quyền hiện "Professional" và hạn 30 ngày. Theo điểm cần quyết 5 của 08a cho phần sau giao dịch.
- [ ] **Step 2**: Ghi vào `bench/phase1/results/acceptance/p1-production.md`: ngày, gói, thời gian từ lúc chuyển tới lúc kích hoạt, email có tới không. Không ghi key, email hay mã đơn thật. Commit:

```bash
git add bench/phase1/results/acceptance/p1-production.md
git commit -m "test: mua thật một đơn trên production (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 11: Báo cáo nghiệm thu và bảng đối chiếu 100% (agent; chủ dự án duyệt)

**Ai làm:** agent; chủ dự án duyệt `hoãn` và phát hành. **Cần trước:** Task 3–10. **Dòng:** 322 và mọi dòng còn lại.

- [ ] **Step 1: Bảng đối chiếu** theo Task 5 của kế hoạch 00 (Step 2–4: yêu cầu spec mới, đọc lại spec, mục 5 và mục 8). Dòng nào không làm kịp thì soạn đề xuất `hoãn` kèm lý do, gửi chủ dự án; chủ dự án duyệt thì ghi trạng thái `hoãn` và đúng cụm "chủ dự án duyệt YYYY-MM-DD" (ngày duyệt) vào Ghi chú (QĐ2 của 08a; `mapping.py` không nhận ngày khác, không nhận "gửi chủ dự án duyệt …", "chờ chủ dự án duyệt …", và báo dòng sai khoảng trắng như `|  12|` là lỗi định dạng).

Run:
```bash
python3 bench/phase1/acceptance/mapping.py check | tail -1; echo "mã thoát: ${PIPESTATUS[0]}"
```
Expected: `đủ 100%` và `mã thoát: 0`.

- [ ] **Step 2: Báo cáo**

Run:
```bash
python3 bench/phase1/acceptance/report.py --out bench/phase1/results/acceptance/report.md | sed -n 3p
```
Expected: `Kết luận: **ĐẠT**`. Còn dòng `chưa có số liệu` hay `không đạt` thì quay lại task tương ứng. Cột Chi tiết ghi phần còn thiếu theo **nội dung** file (`thiếu: win`, `thiếu: small`, `thiếu hạng: toithieu`, `hai hạng phải đo trên hai máy khác nhau`): có file mang tên đúng mà vẫn báo thiếu nghĩa là file đó chép nhầm từ lượt khác (Q1 của review lần 2).

- [ ] **Step 3: Kiểm tra chuẩn (mục 6.2 của kế hoạch 00) trên Mac và Windows** ở đúng commit sẽ phát hành, cộng `python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'` (Expected: `OK`).
- [ ] **Step 4: Cập nhật kế hoạch 00**: mục 2.8 (trạng thái, file 08a, 08b), mục 6.2 (thêm lệnh test của `bench/phase1/acceptance/`), mục 5 (C1–C15 đã có kết quả), và dòng 322 (`xong` kèm SHA của commit báo cáo).
- [ ] **Step 5: Commit, rồi gửi chủ dự án xin duyệt phát hành** (Task 5 Step 6 của kế hoạch 00)

```bash
git add bench/phase1/results/acceptance docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md
git commit -m "docs(plan): nghiệm thu Phase 1: báo cáo A1–A7, bảng đối chiếu đủ 100% (kế hoạch 08)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
