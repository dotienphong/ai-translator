# Dịch trong lúc người nói chưa dừng · 04: Nghiệm thu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm bước 4 của spec §9:
- nghiệm thu theo bảng §10.2 trên M4 Pro (hai gói);
- thử tay trên app thật;
- hướng dẫn chủ dự án nghiệm thu trên máy Windows i5;
- sửa spec chính theo §12;
- ghi biên bản;
- hỏi chủ dự án trước khi merge.

**Không merge** khi chủ dự án chưa cho phép.

**Kiến trúc:** không có code mới.
- Phán quyết theo §10.2 dùng đúng bảng `summarize_sessions.py --targets` của kế hoạch 02 (Task 17), tức cách cổng duyệt đã dùng, để cổng và nghiệm thu không vênh nhau.
- Thêm một phép kiểm `streaming_auto_off`, vì bảng đó không kiểm khóa này.
- Phần còn lại là chạy đo, thử tay, sửa tài liệu và báo cáo.

**Công nghệ:**
- Python 3 (chỉ thư viện chuẩn), các script của `bench/2026-10-10-do-tre/` mà kế hoạch 01 và 02 đã viết.
- `latency-bench session` (kế hoạch 01 dựng, kế hoạch 02 thêm `--streaming`), app dev (`scripts/run-dev-app.sh`).
- `git bundle` để chuyển nhánh sang máy Windows mà không push.

**Spec:** `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`: §9 bước 4, §10.2, §12, QĐ8.

**Tổng quan:** `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md`: quy tắc nhánh, H7 (khóa `summary`), "Quy ước chung".

**Kế hoạch trước:**
- 01: `run_sessions.py`, `summarize_sessions.py`, mốc `buoc1-moc` và `buoc1-sau`.
- 02: cổng (Task 20), các tham số đã chốt (Task 21), cờ `--streaming`, bảng `--targets` (Task 17).
- 03: app và giao diện.

---

## Trạng thái đầu

- Kế hoạch 01, 02, 03 đã làm xong trên nhánh `dich-trong-luc-noi`.
- Ở cổng của kế hoạch 02, chủ dự án đã chốt `streaming.end_silence_ms` và các bộ (n, k). Nhiệm vụ cuối của kế hoạch 02 đã ghi giá trị đó vào `StreamingConfig::default()` và vào spec (QĐ4).
- Mọi lệnh chạy ở gốc worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi`.
- **Đo và thử tay:** trước khi đo hay thử tay, hỏi chủ dự án (qua điều phối viên), vì họ đang dùng máy. Nhờ chủ dự án:
  - thoát app nặng;
  - cắm sạc;
  - tạm dừng việc build nặng của phiên khác.
- **Không** `pkill`, `killall`. Tự ghi PID của tiến trình mình mở và chỉ `kill <PID>` đó.

## Tiêu chí (spec §10.2), cách áp dụng của kế hoạch này

Phán quyết lấy từ bảng `--targets` của `summarize_sessions.py` (kế hoạch 02, Task 17), áp cho nhóm lượt chạy gói Chuẩn bật chế độ này (`nghiem-thu-chuan`). Bảng đó tính:
- **trễ theo từ:** gộp mọi từ theo tiếng nguồn, trên cả 6 session; ngưỡng chữ tạm 1200 ms; chữ ổn định 2000 ms với en, vi, ko và 3000 ms với zh, ja;
- **từ đầu câu tới chữ dịch đầu tiên:** p90 gộp, ngưỡng 2000 ms;
- **độ nháy tầng ổn định:** gộp theo đơn vị, ngưỡng 10%;
- **A2 và CPU:** lấy session tệ nhất; ngưỡng A2 p50 2000, p90 3000, chữ đầu p50 1000 ms; CPU 30%.

Kế hoạch này kiểm thêm: **không session nào của M4 Pro có `streaming_auto_off` là `true`** (Task 2, Step 5).

Gói Nhẹ chỉ báo cáo (§10.2). Bảng vẫn in ✓/✗ cho gói Nhẹ, nhưng không tính vào kết luận.

## File sẽ tạo hoặc sửa

| File | Việc |
|---|---|
| `bench/2026-10-10-do-tre/results/nghiem-thu-*.json` (tạo) | Kết quả đo nghiệm thu (rút gọn) |
| `bench/2026-10-10-do-tre/results/nghiem-thu.md` (tạo) | Biên bản nghiệm thu |
| `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | Sửa theo §12 của spec mới |
| `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` | Dòng trạng thái |
| `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md` | Dòng trạng thái ở đầu file |

## Các task

| Task | Việc | Commit |
|---|---|---|
| 1 | Kiểm đầu vào: nhánh, các commit của 01–03, bộ kiểm như CI | không |
| 2 | Đo nghiệm thu trên M4 Pro, hai gói, bật và tắt chế độ này | `bench(do-tre): …` |
| 3 | Thử tay trên app dev (Mac) | `bench(do-tre): …` |
| 4 | Nghiệm thu trên máy Windows i5 (chủ dự án chạy) | `bench(do-tre): …` |
| 5 | Sửa spec chính theo §12 và dòng trạng thái | `docs(spec): …` |
| 6 | Báo cáo, hỏi chủ dự án trước khi merge | không |

---

## Task 1: Kiểm đầu vào

**Files:** không sửa file nào.

- [ ] **Step 1: Đúng nhánh, cây sạch**

```bash
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
```

Kỳ vọng: dòng đầu là `dich-trong-luc-noi`; `status` không in gì. Nếu có file chưa commit thì dừng và báo điều phối viên.

- [ ] **Step 2: Có đủ commit của kế hoạch 01–03 và quyết định của cổng**

```bash
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" log --oneline main..dich-trong-luc-noi
grep -n "QĐ4" "$W/docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md"
grep -n "end_silence_ms" "$W/crates/pipeline/src/config.rs" | head
```

Kỳ vọng:
- `log` có các commit `feat(latency-bench)`, `feat(pipeline)` (cả bước 1 lẫn bước 2), `feat(app)` hay `feat(overlay)` của kế hoạch 03.
- Dòng QĐ4 của spec ghi ngưỡng đã chốt; dòng này không còn chữ "chốt sau khi đo".
- `StreamingConfig::default()` có `end_silence_ms` bằng đúng ngưỡng đó.

Nếu thiếu thì dừng và báo điều phối viên.

- [ ] **Step 3: Bộ kiểm như CI**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo clippy --locked -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --locked --workspace
./scripts/check-windows.sh --locked
pnpm build && pnpm test
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py'
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
```

Kỳ vọng:
- mọi lệnh thoát 0;
- `cargo test` không có dòng `FAILED`;
- `pnpm test` in `Tests  … passed`.

Lệnh nào đỏ thì dừng, ghi nguyên văn lỗi và báo điều phối viên. Không sửa code ở kế hoạch này.

- [ ] **Step 4: Sidecar đúng bản của nhánh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
scripts/copy-sidecars.sh
cargo build --release --locked -p latency-bench
ls -la src-tauri/binaries/
```

Kỳ vọng: có `asr-worker-aarch64-apple-darwin` và `llama-server-aarch64-apple-darwin` vừa chép, kèm các `.dylib`.

---

## Task 2: Đo nghiệm thu trên M4 Pro

**Files:**
- Create: `bench/2026-10-10-do-tre/results/nghiem-thu-{chuan,nhe}-{en,zh,ja,ko,vi,mixed}.json`
- Create: `bench/2026-10-10-do-tre/results/nghiem-thu-thuong-chuan-{en,zh,ja,ko,vi,mixed}.json`
- Create: `bench/2026-10-10-do-tre/results/nghiem-thu.md`

- [ ] **Step 1: Hỏi chủ dự án và ghi điều kiện**

Gửi cho chủ dự án (qua điều phối viên): "Sắp đo nghiệm thu khoảng 70 phút (18 session × khoảng 3,5 phút). Anh thoát app nặng (Chrome, Teams, Slack, VS Code, bản dev), cắm sạc, và không dùng máy trong lúc đo nhé?"

Chờ chủ dự án đồng ý, rồi ghi điều kiện:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
mkdir -p target/do-tre
{ date '+[TRUOC %F %T]'; top -l 1 -n 0 | grep -E 'CPU usage|PhysMem'; pmset -g batt | head -2; } | tee target/do-tre/nghiem-thu-dieu-kien.txt
```

- [ ] **Step 2: Gói Chuẩn, bật chế độ này**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label nghiem-thu -- --streaming
```

- Không truyền `--streaming-end-silence-ms` hay `--tgt-agree`: lượt này đo đúng mặc định đã chốt ở cổng.
- `--end-silence-ms` để mặc định 50, tức giá trị mặc định của người dùng.

Kỳ vọng: 6 file `bench/2026-10-10-do-tre/results/nghiem-thu-chuan-*.json`.

- [ ] **Step 3: Gói Nhẹ, bật chế độ này**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label nghiem-thu -- --streaming
```

- [ ] **Step 4: Gói Chuẩn, tắt chế độ này**

Lượt này để thấy: tắt công tắc thì app chạy như sau bước 1, và A2 vẫn đạt.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label nghiem-thu-thuong
{ date '+[SAU %F %T]'; top -l 1 -n 0 | grep -E 'CPU usage|PhysMem'; pmset -g batt | head -2; } | tee -a target/do-tre/nghiem-thu-dieu-kien.txt
```

- [ ] **Step 5: Kiểm tiêu chí và lập bảng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
R=bench/2026-10-10-do-tre/results
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets $R/nghiem-thu-chuan-*.json $R/nghiem-thu-nhe-*.json | tee target/do-tre/nghiem-thu-bang.md
grep -l '"streaming_auto_off": true' $R/nghiem-thu-chuan-*.json $R/nghiem-thu-nhe-*.json && echo "CÓ SESSION TỰ TẮT" || echo "không session nào tự tắt"
python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare buoc1-sau nghiem-thu $R/buoc1-sau-*.json $R/nghiem-thu-*.json > target/do-tre/nghiem-thu-so.md
python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare buoc1-sau nghiem-thu-thuong $R/buoc1-sau-chuan-*.json $R/nghiem-thu-thuong-chuan-*.json > target/do-tre/nghiem-thu-thuong-so.md
```

- Kết luận lấy từ dòng tóm của nhóm `nghiem-thu-chuan` và các dòng theo tiếng của nhóm đó trong bảng mục tiêu (✓/✗), cộng dòng kiểm tự tắt.
- `grep` cần in `không session nào tự tắt`. Nếu in `CÓ SESSION TỰ TẮT`, ghi tên file vào biên bản; đó là ô không đạt.
- Có ô không đạt thì vẫn ghi biên bản (Step 6) với kết quả thật, rồi báo chủ dự án ở Task 6. Không chỉnh tham số ở kế hoạch này, vì tham số đã chốt ở cổng.

- [ ] **Step 6: Biên bản**

Tạo `bench/2026-10-10-do-tre/results/nghiem-thu.md`. Thay mọi `‹…›` bằng số và chữ thật lấy từ các file ở Step 1–5. Không để lại `‹…›` nào.

```markdown
# Nghiệm thu "dịch trong lúc người nói chưa dừng" trên Mac M4 Pro (‹ngày›)

Spec: `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §10.2. Máy: MacBook Pro M4 Pro 24 GB,
macOS ‹phiên bản (`sw_vers -productVersion`)›. Code: nhánh `dich-trong-luc-noi` @ ‹`git rev-parse --short HEAD`›.
Tham số chốt ở cổng: `streaming.end_silence_ms` = ‹giá trị›, (n, k) = ‹bảng theo tiếng nguồn›.

## Điều kiện đo

‹nội dung target/do-tre/nghiem-thu-dieu-kien.txt, và các app nền còn chạy›

## Cách chạy

python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label nghiem-thu -- --streaming
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label nghiem-thu -- --streaming
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label nghiem-thu-thuong
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets …

## Kết quả theo tiêu chí (bảng `--targets`, gói Chuẩn quyết định)

‹bảng của target/do-tre/nghiem-thu-bang.md›

Tự tắt trên M4 Pro: ‹không session nào / tên file›.

Kết luận: ‹ĐẠT mọi ô của nhóm `nghiem-thu-chuan`, hoặc liệt kê ô ✗ kèm số›.

## So với sau bước 1 (chế độ thường, `buoc1-sau`)

‹bảng của target/do-tre/nghiem-thu-so.md›; ‹nhận xét 2–4 dòng: trễ theo từ, chữ đầu tiên từ lúc bắt đầu nói, CPU›.

## Tắt chế độ này

‹bảng của target/do-tre/nghiem-thu-thuong-so.md›; A2 ‹vẫn đạt / không đạt›; chênh so với `buoc1-sau` ‹số›.

## Giới hạn

- Câu đọc (FLEURS), không phải hội thoại thật; thời điểm nói của từ là xấp xỉ chia đều (§10.1).
- Một máy (M4 Pro). Máy Windows: Task 4.
```

- [ ] **Step 7: Commit**

```bash
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
test "$(git -C "$W" branch --show-current)" = "dich-trong-luc-noi" || { echo "SAI NHÁNH"; exit 1; }
git -C "$W" add bench/2026-10-10-do-tre/results/nghiem-thu-chuan-*.json bench/2026-10-10-do-tre/results/nghiem-thu-nhe-*.json \
  bench/2026-10-10-do-tre/results/nghiem-thu-thuong-chuan-*.json bench/2026-10-10-do-tre/results/nghiem-thu.md
git -C "$W" commit -F - <<'EOF'
bench(do-tre): nghiệm thu dịch trong lúc nói trên M4 Pro (hai gói, bật và tắt chế độ)

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
```

---

## Task 3: Thử tay trên app dev (Mac)

**Files:**
- Modify: `bench/2026-10-10-do-tre/results/nghiem-thu.md`, thêm mục "Thử tay trên app".

- [ ] **Step 1: Hỏi chủ dự án**

Gửi: "Sắp mở bản dev của app khoảng 20 phút, phát một video tiếng Anh và một video tiếng Nhật trên YouTube để xem thanh phụ đề. App sẽ dùng loa và có cửa sổ hiện lên. Anh cho chạy nhé?"

Chờ đồng ý.

- [ ] **Step 2: Chạy app dev**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
sed -n 1,40p scripts/run-dev-app.sh
scripts/run-dev-app.sh > target/do-tre/dev-app.log 2>&1 &
echo $! > target/do-tre/dev-app.pid
```

Đọc phần đầu script trước khi chạy, để biết nó cần biến môi trường hay đối số gì. Nếu cần, làm theo hướng dẫn trong script.

- [ ] **Step 3: Kịch bản thử và kết quả mong đợi**

Làm lần lượt; ghi ĐẠT/KHÔNG ĐẠT kèm ghi chú cho từng dòng:

| # | Làm | Mong đợi (spec) |
|---|---|---|
| 1 | Cài đặt › Phụ đề | Có công tắc "Dịch trong lúc người nói chưa dừng", đang bật; khung xem trước có mẫu hai tầng (§6.3); không có ghi chú "Máy này chưa đủ nhanh" |
| 2 | Bắt đầu dịch, phát video tiếng Anh nói liền | Thanh phụ đề có dòng đang nói, cập nhật khoảng mỗi 1 s khi người nói chưa dừng; phần cuối nhạt hơn; câu gốc cũng hai tầng nếu đang bật hiện câu gốc (§6.1) |
| 3 | Người nói ngừng | Dòng chuyển sang bản cuối tại chỗ, không trống rồi gõ lại; giống nhau thì chỉ hết nhạt (§6.1, §4.5) |
| 4 | Phát video tiếng Nhật | Như 2 và 3; phần ổn định dài ra chậm hơn tiếng Anh (n=3) |
| 5 | Mở cửa sổ chính › Bản chép lời | Chỉ có câu cuối, không có dòng đang nói (QĐ5) |
| 6 | Tắt công tắc khi đang dịch | Từ đoạn kế tiếp không còn dòng đang nói; chữ hiện sau mỗi chỗ ngừng như trước (§6.3) |
| 7 | Bật lại công tắc khi đang dịch | Dòng đang nói quay lại từ đoạn kế tiếp |
| 8 | Bấm ✕ trên thanh phụ đề khi đang có dòng đang nói | Phiên dừng; dòng đang nói biến mất; app không treo (§6.2 `live-end` khi dừng phiên) |
| 9 | Dịch liên tục 20 phút với video dài | Không crash; mở Activity Monitor xem CPU của app, `asr-worker`, `llama-server` |
| 10 | Mở `~/Library/Logs/com.aitranslator.desktop/` (thư mục log của app) | Không có chữ chép hay chữ dịch nào trong log (§6.4, spec chính §10.2); chỉ có số đo |

- [ ] **Step 4: Dừng app dev**

Thoát bằng menu khay › Thoát. Sau đó, nếu tiến trình vẫn còn:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
kill "$(cat target/do-tre/dev-app.pid)" 2>/dev/null; sleep 1; ps -p "$(cat target/do-tre/dev-app.pid)" >/dev/null && echo "còn chạy" || echo "đã dừng"
```

- [ ] **Step 5: Ghi vào biên bản và commit**

Thêm vào cuối `bench/2026-10-10-do-tre/results/nghiem-thu.md`. Thay `‹…›` bằng kết quả thật:

```markdown
## Thử tay trên app (bản dev, ‹ngày›)

| # | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Công tắc, khung xem trước | ‹ĐẠT/KHÔNG ĐẠT› | ‹…› |
| 2 | Dòng đang nói, tiếng Anh | ‹…› | ‹…› |
| 3 | Bản cuối thay vào | ‹…› | ‹…› |
| 4 | Tiếng Nhật | ‹…› | ‹…› |
| 5 | Bản chép lời chỉ có câu cuối | ‹…› | ‹…› |
| 6 | Tắt công tắc khi đang dịch | ‹…› | ‹…› |
| 7 | Bật lại | ‹…› | ‹…› |
| 8 | ✕ khi đang có dòng đang nói | ‹…› | ‹…› |
| 9 | 20 phút liên tục | ‹…› | CPU: ‹…› |
| 10 | Log không có nội dung | ‹…› | ‹…› |
```

```bash
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
test "$(git -C "$W" branch --show-current)" = "dich-trong-luc-noi" || { echo "SAI NHÁNH"; exit 1; }
git -C "$W" add bench/2026-10-10-do-tre/results/nghiem-thu.md
git -C "$W" commit -F - <<'EOF'
bench(do-tre): thử tay dịch trong lúc nói trên app dev (Mac)

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
```

---

## Task 4: Nghiệm thu trên máy Windows i5 (chủ dự án chạy)

Tiêu chí (spec §10.2): trên máy Windows yếu (i5-1345U, GPU tích hợp và chỉ CPU), chế độ này tự tắt từ đầu phiên, và số đo không kém mốc S6 trên Windows (`bench/phase0/results/s6_windows.md`).

**Files:**
- Create: `bench/2026-10-10-do-tre/results/nghiem-thu-win-*.json`
- Modify: `bench/2026-10-10-do-tre/results/nghiem-thu.md`, thêm mục "Máy Windows i5".

- [ ] **Step 1: Hỏi chủ dự án cách đưa nhánh sang máy Windows**

Không push khi chưa được hỏi (repo là PUBLIC). Gửi:

"Để nghiệm thu trên máy Windows i5, cần đưa nhánh `dich-trong-luc-noi` sang máy đó. Cách đề xuất là một file `git bundle`, anh tự chép sang máy Windows (không cần push). Hoặc anh cho phép push nhánh lên GitHub. Anh chọn cách nào?"

Chờ chủ dự án trả lời. Nếu chọn bundle:

```bash
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" bundle create "$W/target/do-tre/dich-trong-luc-noi.bundle" main..dich-trong-luc-noi main
git -C "$W" bundle verify "$W/target/do-tre/dich-trong-luc-noi.bundle"
ls -la "$W/target/do-tre/dich-trong-luc-noi.bundle"
```

Báo chủ dự án đường dẫn file bundle.

Nếu chủ dự án cho push, **chỉ** push nhánh này, đúng lệnh sau:

```bash
git -C /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi push -u origin dich-trong-luc-noi
```

- [ ] **Step 2: Hướng dẫn chủ dự án chạy trên Windows**

Gửi nguyên văn khối dưới (PowerShell, ở thư mục repo trên máy Windows; cần Rust, Python 3.12 và bộ công cụ như lúc đo S6 Windows):

```powershell
# 1. Lấy nhánh (bundle; nếu đã push thì: git fetch origin dich-trong-luc-noi)
git fetch <đường dẫn>\dich-trong-luc-noi.bundle dich-trong-luc-noi:dich-trong-luc-noi
git switch dich-trong-luc-noi

# 2. Build như lúc đo S6 Windows: latency-bench và hai bản asr-worker
cargo build --release --locked -p latency-bench
cargo build --release --locked -p asr-worker --features vulkan,shared-encode
Copy-Item target\release\asr-worker.exe target\asr-worker-vulkan.exe -Force
cargo build --release --locked -p asr-worker --features shared-encode
Copy-Item target\release\asr-worker.exe target\asr-worker-cpu.exe -Force

# 3. Model, llama.cpp b11146 (win-vulkan-x64, win-cpu-x64) và session như lúc đo S6 (bench/phase0/fetch.py, bench/phase0/data/latency/)

# 4. Gói Nhẹ, chế độ thường: so với mốc S6 Windows (iGPU, llama CPU như app: -ngl 0)
python bench\2026-10-10-do-tre\run_sessions.py --pack nhe --label nghiem-thu-win-thuong --asr-worker target\asr-worker-vulkan.exe --llama-server <thư mục llama-b11146 win-cpu-x64>\llama-server.exe

# 5. Gói Nhẹ, bật chế độ này: máy yếu phải tự tắt (summary.streaming_auto_off = true) mà không kém lượt 4
python bench\2026-10-10-do-tre\run_sessions.py --pack nhe --label nghiem-thu-win --asr-worker target\asr-worker-vulkan.exe --llama-server <thư mục llama-b11146 win-cpu-x64>\llama-server.exe -- --streaming

# 6. Thử app trên máy này (bản dev hoặc bản build của nhánh):
#    Cài đặt › Phụ đề phải có ghi chú "Máy này chưa đủ nhanh, app đang dịch sau mỗi câu."
#    và khi dịch, thanh phụ đề không có dòng đang nói.
```

- Lượt 5 dùng `latency-bench`, nên engine luôn được báo là máy đủ sức (công cụ đo bật `--streaming` là chạy). Việc tự tắt ở đây phải đến từ luật nhịp (§5), và `summary.streaming_auto_off` phải là `true`.
- Việc tắt ngay từ đầu phiên trên máy chỉ có GPU tích hợp là luật của app (kế hoạch 03), nên được kiểm ở bước 6 trên app.
- Nhờ chủ dự án gửi lại các file `bench\2026-10-10-do-tre\results\nghiem-thu-win-*.json` và ảnh chụp Cài đặt › Phụ đề.

- [ ] **Step 3: So và ghi biên bản**

Chép các file chủ dự án gửi vào `bench/2026-10-10-do-tre/results/`, rồi:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
R=bench/2026-10-10-do-tre/results
python3 bench/2026-10-10-do-tre/summarize_sessions.py $R/nghiem-thu-win-thuong-nhe-*.json $R/nghiem-thu-win-nhe-*.json
python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare nghiem-thu-win-thuong nghiem-thu-win $R/nghiem-thu-win-thuong-nhe-*.json $R/nghiem-thu-win-nhe-*.json
grep -h '"streaming_auto_off"' $R/nghiem-thu-win-nhe-*.json
```

Thêm vào cuối `nghiem-thu.md`, thay `‹…›` bằng số thật:

```markdown
## Máy Windows i5-1345U (chủ dự án đo, ‹ngày›)

Code: nhánh `dich-trong-luc-noi` @ ‹hash›, chuyển bằng ‹bundle / push›. Gói Nhẹ, `asr-worker` Vulkan (iGPU), `llama-server` CPU.

| Session | A2 p50 chế độ thường | A2 p50 khi bật | Mốc S6 Windows (s6_windows.md, "Whisper iGPU + Llama CPU") | streaming_auto_off |
|---|---|---|---|---|
| ‹en…mixed› | ‹…› | ‹…› | ‹…› | ‹true/false› |

- App: ghi chú "Máy này chưa đủ nhanh…" ‹có / không›; dòng đang nói ‹không xuất hiện / xuất hiện›.
- Kết luận: ‹ĐẠT nếu tự tắt và A2 khi bật không kém lượt chế độ thường quá độ lệch giữa hai lượt S6 cũ (0–0,1 s); nếu không thì ghi rõ›.
- Ghi chú: mốc S6 Windows đo bằng công cụ cũ (`latency`), lượt này bằng `session` (engine thật). So chính là lượt 4 với lượt 5 trên cùng công cụ.
```

```bash
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
test "$(git -C "$W" branch --show-current)" = "dich-trong-luc-noi" || { echo "SAI NHÁNH"; exit 1; }
git -C "$W" add bench/2026-10-10-do-tre/results/nghiem-thu-win-*.json bench/2026-10-10-do-tre/results/nghiem-thu.md
git -C "$W" commit -F - <<'EOF'
bench(do-tre): nghiệm thu dịch trong lúc nói trên máy Windows i5 (chủ dự án đo)

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
```

---

## Task 5: Sửa spec chính theo §12 và dòng trạng thái

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
- Modify: `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` (phần **Trạng thái**)
- Modify: `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md` (dòng trạng thái ngay dưới tiêu đề)

Dùng Edit, thay đúng chỗ. Mọi `‹…›` lấy từ `nghiem-thu.md` và từ quyết định ở cổng.

- [ ] **Step 1: Spec chính, phần "Trạng thái" ở đầu file**

Thêm một gạch đầu dòng vào cuối danh sách **Trạng thái**:

```markdown
- Sửa ngày ‹ngày›: dịch trong lúc người nói chưa dừng (spec `2026-10-10-dich-trong-luc-noi-design.md`, nghiệm thu `bench/2026-10-10-do-tre/results/nghiem-thu.md`); sửa các mục §3.3, §4.3, §4.4, §6.3–§6.6, §7, §8 theo §12 của spec đó.
```

- [ ] **Step 2: §3.3 (sau dòng A2 của bảng tiêu chí)**

Thêm ngay dưới bảng tiêu chí A1–A7, trước "**Mốc đo ở Phase 0**":

```markdown
**Chế độ dịch trong lúc người nói chưa dừng** (spec 2026-10-10 §10.2; công cụ đo `latency-bench session` chạy engine thật): trên máy khuyến nghị, chữ tạm p50 ≤ 1,2 s và chữ ổn định p50 ≤ 2,0 s (en, vi, ko) hay ≤ 3,0 s (zh, ja) sau lời nói; chữ dịch đầu tiên tính từ lúc bắt đầu nói p90 ≤ 2,0 s; độ nháy tầng ổn định ≤ 10%. A2 tính như cũ. Đo ngày ‹ngày› trên M4 Pro: ‹ĐẠT N/N hoặc tóm tắt›.
```

- [ ] **Step 3: §4.3, nhóm Cài đặt "Phụ đề"**

Trong gạch đầu dòng **Phụ đề:** của §4.3, thêm vào cuối câu (trước dấu chấm cuối):

```markdown
; công tắc "Dịch trong lúc người nói chưa dừng" (mặc định bật, có tác dụng từ đoạn kế tiếp), kèm ghi chú "Máy này chưa đủ nhanh, app đang dịch sau mỗi câu." khi máy bị tắt chế độ này (spec 2026-10-10 §6.3)
```

- [ ] **Step 4: §4.4, mục "Nội dung"**

Thêm gạch đầu dòng mới ngay sau dòng "**Phụ đề tạm:** …":

```markdown
  - **Dòng đang nói** (chế độ dịch trong lúc người nói chưa dừng, spec 2026-10-10 §6.1): khi người nói chưa dừng, câu đang nói hiện thành một dòng cập nhật tại chỗ khoảng mỗi ‹nhịp p50 đo được› giây, câu gốc và bản dịch đều hai tầng (phần ổn định đậm bình thường, phần tạm mờ 0,65). Khi người nói ngừng, bản cuối thay vào đúng chỗ. Ở chế độ này phụ đề tạm không còn nhạt cả dòng. Dòng đang nói chỉ có trên thanh phụ đề; bản chép lời, lịch sử và xuất file chỉ chứa bản cuối.
```

- [ ] **Step 5: §6.3, sau gạch đầu dòng "Im lặng 50 ms thì chốt đoạn"**

```markdown
  - **Chế độ dịch trong lúc người nói chưa dừng** (spec 2026-10-10 §4.7): ngưỡng đóng đoạn là max(`vadEndSilenceMs`, ‹giá trị chốt ở cổng› ms); vừa có 2 khung im lặng thì chép từng phần thêm một lần, nên chữ cuối câu vẫn hiện nhanh. Cửa sổ ghép tính lại theo ngưỡng này.
```

- [ ] **Step 6: §6.4, thêm mục mới ngay trước "**Làm nóng:**"**

```markdown
- **Chép từng phần** (spec 2026-10-10 §4.1–§4.2): khi đoạn VAD còn mở, app gửi âm thanh từ đầu đoạn tới hiện tại bằng đúng `Transcribe` (không đổi giao thức), theo nhịp tự chỉnh 0,7–2 s; ngôn ngữ nhận ở lần chép đầu của đoạn được giữ cho các lần sau; đoạn đóng luôn được chép trước. Chữ nguồn được chốt bằng LocalAgreement-2 (chừa 1 từ, hay 2 chữ với zh, ja).
```

(Mục flash attention của §6.4 đã được kế hoạch 01, Task 11 sửa theo kết quả A5; không sửa lại ở đây.)

- [ ] **Step 7: §6.5, thêm mục mới ngay trước "**Bỏ qua bước dịch**"**

```markdown
- **Bản dịch tạm** (spec 2026-10-10 §4.3–§4.6): mỗi lúc tối đa một yêu cầu, yêu cầu mới hủy yêu cầu cũ; phần dịch đã chốt (LocalAgreement-n, (n, k) theo tiếng nguồn: ‹bảng chốt ở cổng›) được gửi làm tin nhắn assistant cuối (prefill; `llama-server` b11146 stream lại cả phần đó); một lần thử, không thử lại; dấu kết câu ở cuối không hiện. Việc của lượt cuối luôn được ưu tiên và dịch không prefill, nên chất lượng bản lưu không đổi.
```

- [ ] **Step 8: §6.6, gạch đầu dòng "Gửi sang giao diện qua sự kiện Tauri"**

Thêm hai dòng con:

```markdown
  - `subtitle://live`: dòng đang nói (`LiveLine`: phần ổn định và phần tạm của câu gốc và bản dịch là các chuỗi riêng), chỉ gửi cho thanh phụ đề.
  - `subtitle://live-end`: gỡ dòng đang nói (bản cuối đã chốt, đoạn bị lọc hay bị bỏ, chế độ tự tắt, dừng phiên).
```

- [ ] **Step 9: §7, cuối danh sách "Các luồng và tiến trình"**

Thêm gạch đầu dòng ngay sau danh sách bảy luồng:

```markdown
- **Chế độ dịch trong lúc người nói chưa dừng** (spec 2026-10-10 §4.6, §5): hàng đợi nhận dạng có thêm một ô cho lần chép từng phần (mới thay cũ, đoạn đóng luôn đi trước); luồng dịch xen yêu cầu bản tạm giữa các câu cuối nhưng không bao giờ chặn câu cuối. Nhịp T = 1,5 × trung vị 8 vòng gần nhất, kẹp 0,7–2 s; trung vị vượt 1,3 s thì tự tắt tới hết phiên. Máy Windows chỉ có GPU tích hợp hay `asr-worker` chạy CPU thì tắt từ đầu phiên.
```

- [ ] **Step 10: §8, sau bảng "Đo được trên Mac M4 Pro"**

```markdown
**Dịch trong lúc người nói chưa dừng, đo ‹ngày› trên M4 Pro** (`bench/2026-10-10-do-tre/results/nghiem-thu.md`, `latency-bench session`):

| Gói | Chữ tạm p50 | Chữ ổn định p50 | Chữ đầu từ lúc bắt đầu nói p90 | A2 p50 | CPU |
|---|---|---|---|---|---|
| Chuẩn | ‹khoảng giữa các session› | ‹…› | ‹…› | ‹…› | ‹…› |
| Nhẹ | ‹…› | ‹…› | ‹…› | ‹…› | ‹…› |
```

- [ ] **Step 11: Dòng trạng thái của spec mới và kế hoạch 00**

`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`, phần **Trạng thái**, thêm gạch đầu dòng cuối:

```markdown
- Đã triển khai và nghiệm thu ngày ‹ngày› (`bench/2026-10-10-do-tre/results/nghiem-thu.md`); đã sửa spec chính theo §12. Chờ chủ dự án cho phép merge vào `main`.
```

`docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md`, ngay dưới dòng tiêu đề, thêm:

```markdown
**Trạng thái:** đã làm xong 01–04 ngày ‹ngày›; chờ chủ dự án cho phép merge.
```

- [ ] **Step 12: Không còn `‹` nào ở các file vừa sửa, rồi commit**

```bash
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
grep -n "‹" "$W/docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md" "$W/docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md" "$W/docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md" "$W/bench/2026-10-10-do-tre/results/nghiem-thu.md" || echo "sạch"
test "$(git -C "$W" branch --show-current)" = "dich-trong-luc-noi" || { echo "SAI NHÁNH"; exit 1; }
git -C "$W" add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md
git -C "$W" commit -F - <<'EOF'
docs(spec): spec chính có chế độ dịch trong lúc người nói chưa dừng (§3.3, §4.3, §4.4, §6.3–§6.6, §7, §8)

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
```

Kỳ vọng: lệnh `grep` in `sạch`. Nếu còn `‹` thì điền nốt trước khi commit.

---

## Task 6: Báo cáo, hỏi chủ dự án trước khi merge

**Files:** không sửa file nào.

- [ ] **Step 1: Tóm tắt cho chủ dự án**

Gửi (qua điều phối viên), bằng tiếng Việt:
- kết quả theo §10.2, kèm số chính và các ô không đạt (nếu có);
- thử tay Mac và Windows;
- các commit trên nhánh: `git -C <worktree> log --oneline main..dich-trong-luc-noi`;
- những việc còn để sau (§13 spec).

Câu hỏi cuối, nguyên văn: "Anh cho phép merge nhánh `dich-trong-luc-noi` vào `main` chưa? Khi anh cho phép, tôi merge cục bộ, không push."

- [ ] **Step 2: Không merge khi chưa có câu trả lời "cho phép"**

Kết thúc kế hoạch ở đây. Merge là việc riêng, chỉ làm sau khi chủ dự án trả lời cho phép (QĐ8). Khi đó vẫn kiểm `git -C /Users/dtphong/Desktop/software_business/ai-translator branch --show-current` và hỏi lại nếu thư mục chính đang có phiên khác làm.

---

## Tự rà

| Mục của spec | Task |
|---|---|
| §9 bước 4: nghiệm thu theo §10.2 | 2 (đo M4 Pro, bảng `--targets`), 4 (Windows) |
| §10.2: chữ tạm, chữ ổn định, chữ đầu từ lúc bắt đầu nói, độ nháy | 2 Step 5 (`--targets` của kế hoạch 02 Task 17, cùng cách với cổng) |
| §10.2: bản cuối (A2, CPU ≤ 30%; A3/A4 không phải chấm lại, trừ khi A5 bật) | 2 Step 5 (A2, CPU), 2 Step 4 (tắt chế độ); A4 đã chấm ở kế hoạch 01 Task 11 |
| §10.2: gói Nhẹ chỉ báo cáo | 2 Step 3, phần "Tiêu chí" |
| §5: M4 Pro không tự tắt | 2 Step 5 (`grep streaming_auto_off`) |
| §10.2: máy Windows yếu tự tắt, không kém mốc S6 Windows | 4 |
| §11: đo bằng A1 ở bước 4 | 2 |
| §6, QĐ5 trên app thật | 3 (dòng 1–8, 10) |
| §12: sửa spec chính | 5 |
| QĐ8: không merge khi chưa cho phép | 6 |

- **Tên dùng chung:**
  - khóa `summary` của H7;
  - tên file `<nhãn>-<gói>-<session>.json` của `run_sessions.py` (kế hoạch 01, Task 2);
  - cờ `--streaming` (H9) và bảng `--targets` (kế hoạch 02, Task 16–17).
- **Chỗ trống `‹…›`:** chỉ có ở biên bản và đoạn sửa spec. Đó là số đo hay quyết định chỉ có lúc chạy, và mỗi chỗ ghi rõ lấy từ đâu. Task 5 Step 12 kiểm không còn chỗ nào.
