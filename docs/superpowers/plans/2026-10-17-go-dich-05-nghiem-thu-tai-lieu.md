# Gõ dịch 05: nghiệm thu trên Mac, sửa spec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nghiệm thu Gõ dịch trên Mac theo GD1–GD6 (spec §8.2), có biên bản với số đo thật. Ghi tính năng vào spec gốc (F11, phím tắt F10, nhóm Cài đặt, §4.6 mới). Cập nhật spec Gõ dịch theo kết quả spike và nghiệm thu. Không merge, không push, không phát hành.

**Architecture:** Không viết mã tính năng mới. Dùng bản dev của nhánh `go-dich` (`scripts/run-dev-app.sh`) với model gói Chuẩn trên máy M4 Pro. Số liệu lấy từ log của app: dòng `Gõ dịch: … ms` cho GD2, dòng `kết thúc phiên dịch: … tổng p50 …` cho GD3. Kiểm mạng bằng proxy và `netaudit.py` của A7 (`bench/phase1/acceptance/`) cho GD5. GD6 tìm chữ mồi trong log và thư mục dữ liệu.

**Tech Stack:** macOS, `scripts/run-dev-app.sh`, `afplay`, `mitmdump` (mitmproxy 12), Python 3 (thư viện chuẩn), `bench/phase1/acceptance/netaudit.py`.

**Spec:** `docs/superpowers/specs/2026-10-17-go-dich-design.md` §8.2, §10. Tổng quan và quy tắc chung: `docs/superpowers/plans/2026-10-17-go-dich-00-tong-quan.md` (đọc trước). Cần kế hoạch 04 đã xong.

**Quy tắc chung:** như mục "Quy tắc chung cho mọi kế hoạch" của kế hoạch 00. Thêm:
- Nghiệm thu cần **chủ dự án** ngồi máy (gõ bằng bộ gõ thật, dùng các app chat thật, cấp quyền, nhập mật khẩu `sudo`). Người thực thi chuẩn bị, chạy lệnh, hướng dẫn từng bước, ghi biên bản. **Hỏi trước** khi chạy app hay thao tác tự động trên giao diện; không tự gõ hay bấm thay chủ dự án.
- Chỉ ghi số đo thật, kèm điều kiện đo (máy, bản, gói model). Tiêu chí không đạt thì ghi đúng như vậy, kèm lý do, để chủ dự án quyết; không nới tiêu chí.
- Không xóa Keychain vault của app. Không commit file HAR (có nội dung request).

## Cấu trúc file

| File | Việc |
|---|---|
| Create `bench/2026-10-17-go-dich/gd2-cau.txt` | 20 câu chat tiếng Việt cho GD2, GD3 |
| Create `bench/2026-10-17-go-dich/results/nghiem-thu-mac.md` | Biên bản GD1–GD6 trên Mac |
| Create `bench/2026-10-17-go-dich/results/gd5-mac.json` | Kết quả `netaudit.py` của GD5 |
| Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | §3.1 F10, F11; §4.3 nhóm Cài đặt "Gõ dịch"; §4.6 mới |
| Modify `docs/superpowers/specs/2026-10-17-go-dich-design.md` | Trạng thái; §3.2 tên file thật; §4.1 thời gian chờ đã chốt; §4.2 cách bật lại quyền |

---

### Task 0: Kiểm nhánh và mốc

**Files:** không sửa file.

- [ ] **Step 1: Nhánh, biên bản spike, mốc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git status --short && sed -n '/^| S1 /p;/^| S2 /p' bench/2026-10-17-go-dich/results/spike.md && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result' && pnpm test 2>&1 | grep Tests
```
Expected: `go-dich`, không có file đổi, S1 và S2 ghi `Đạt`, `passed` = N0 + 46 (bản 2026-10-17: 689), `Tests  321 passed`.

---

### Task 1: Chuẩn bị nghiệm thu

**Files:**
- Create: `bench/2026-10-17-go-dich/gd2-cau.txt`, `bench/2026-10-17-go-dich/results/nghiem-thu-mac.md`

- [ ] **Step 1: Hai mươi câu chat**

Tạo `bench/2026-10-17-go-dich/gd2-cau.txt` (mỗi dòng một câu, 5–30 từ, tin nhắn công việc thường gặp; GD2 và GD3 dùng):

```text
Mai mình gửi báo cáo nhé.
Anh ơi, chiều nay họp lúc mấy giờ vậy?
Em đã cập nhật file thiết kế, anh xem giúp em phần màu nút nhé.
Bên mình chốt lịch giao hàng vào thứ Sáu tuần sau được không ạ?
Cảm ơn chị, em nhận được hợp đồng rồi, chiều nay em ký và gửi lại.
Server bị chậm từ sáng, team đang kiểm tra, khoảng một tiếng nữa sẽ có thông tin.
Mình đề xuất dời buổi demo sang tuần sau để có thêm thời gian sửa lỗi đăng nhập.
Khách hàng muốn thêm tính năng xuất báo cáo ra Excel, anh ước lượng giúp em mất bao lâu?
Em xin nghỉ phép thứ Năm này vì có việc gia đình, công việc em đã bàn giao cho Minh.
Tài liệu hướng dẫn cài đặt đã có trên Drive, mọi người đọc trước buổi họp nhé.
Giá này đã gồm thuế chưa ạ?
Bạn gửi lại giúp mình đường link cuộc họp được không?
Hôm qua mình thử bản mới trên điện thoại thì thấy chữ bị tràn ở màn hình thanh toán.
Nếu không có gì thay đổi thì chúng ta giữ nguyên kế hoạch ra mắt vào đầu tháng Mười Một.
Chị cho em xin số tài khoản để em chuyển khoản tiền cọc ạ.
Lỗi này chỉ xảy ra khi người dùng đổi mật khẩu rồi đăng nhập lại trên hai thiết bị cùng lúc, em đã ghi các bước trong ticket.
Mọi người nhớ điền khảo sát trước năm giờ chiều nay nhé, cảm ơn cả nhà!
Anh duyệt giúp em yêu cầu mua thêm hai màn hình cho nhóm thiết kế.
Chúng tôi rất tiếc về sự chậm trễ và sẽ hoàn tiền cho đơn hàng trong vòng ba ngày làm việc.
Ok, để mình kiểm tra lại rồi báo bạn sau.
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && awk '{ print NF }' bench/2026-10-17-go-dich/gd2-cau.txt | sort -n | sed -n '1p;$p' && wc -l < bench/2026-10-17-go-dich/gd2-cau.txt
```
Expected: số từ nhỏ nhất ≥ 5, lớn nhất ≤ 30; `20` dòng.

- [ ] **Step 2: Biên bản mẫu**

Tạo `bench/2026-10-17-go-dich/results/nghiem-thu-mac.md` (các task sau điền vào; ô chưa đo để trống):

```markdown
# Nghiệm thu Gõ dịch trên Mac (spec 2026-10-17-go-dich §8.2)

**Ngày:** 
**Máy:** MacBook Pro M4 Pro, macOS 
**Bản:** nhánh `go-dich`, commit , bản dev (`scripts/run-dev-app.sh`, chứng thư "AI Translator Dev")
**Model:** gói Chuẩn
**Người thử:** chủ dự án; ghi biên bản: 

| # | Tiêu chí | Kết quả | Ghi chú |
|---|---|---|---|
| GD1 | Luồng chính ở 11 nơi | | |
| GD2 | p50 thời gian dịch ≤ 1,0 giây (20 câu) | | |
| GD3 | Trễ thêm của phụ đề khi vừa họp vừa gõ (không có ngưỡng) | (ghi nhận) | |
| GD4 | ⌃⌥G không làm app nào tự làm việc riêng | | |
| GD5 | Không request mạng nào do Gõ dịch | | |
| GD6 | Log không chứa chữ đã gõ hay bản dịch | | |

## GD1, GD4 — luồng chính và phím tắt ở từng nơi

| Nơi | Mở ô (⌃⌥G) | Gõ Telex đúng | Enter dán đúng ô, không gửi | Enter lần 2 gửi | GD4: ⌃⌥G không gây việc khác | Ghi chú |
|---|---|---|---|---|---|---|
| Messenger web, Chrome | | | | | | |
| Gmail (soạn thư), Chrome | | | | | | |
| Trang chat trên Safari () | | | | | | |
| Slack | | | | | | |
| Discord | | | | | | |
| Teams | | | | | | |
| Zalo PC | | | | | | |
| Telegram | | | | | | |
| iMessage hoặc Notes | | | | | | |
| Zoom, khung chat | | | | | | |
| Google Meet, khung chat | | | | | | |

## GD2 — thời gian dịch

## GD3 — phụ đề khi vừa họp vừa gõ

| Phiên | Gõ dịch | Số câu dịch | dịch p50 / p90 (ms) | tổng p50 / p90 (ms) |
|---|---|---|---|---|
| A | không | | | |
| B | một tin mỗi khoảng 10 giây | | | |

## GD5 — mạng

## GD6 — log

## Windows

Chưa thử: chờ máy Windows (spec §8.2: chạy lại GD1, GD4, GD5, GD6).
```

- [ ] **Step 3: App dev sẵn sàng**

Như Step 2 của Task 9, kế hoạch 03: `src-tauri/binaries/` có hai tiến trình phụ (chép từ thư mục chính nếu trống); máy có model gói Chuẩn; app dùng được Gõ dịch (gói còn hiệu lực, hay `.env` của worktree chỉ có `AI_TRANSLATOR_DEV_PRO=true`; **không chép `.env` của thư mục chính**). Hỏi chủ dự án rồi chạy:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && ls src-tauri/binaries/ && scripts/run-dev-app.sh
```

Trong app: Cài đặt › Model đang là gói Chuẩn; Cài đặt › Gõ dịch: bật, "Dịch sang" Tự động (đang là English), tự dán bật, quyền Trợ năng "Đã cấp" (chưa cấp thì bấm "Mở cài đặt Trợ năng" và bật "AI Translator Dev"). Ghi ngày, bản macOS, commit (`git log --oneline -1`) vào đầu biên bản.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add bench/2026-10-17-go-dich/gd2-cau.txt bench/2026-10-17-go-dich/results/nghiem-thu-mac.md && git commit -q -m "docs(go-dich): câu thử và biên bản mẫu cho nghiệm thu GD1–GD6" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: GD1, GD4 — luồng chính và phím tắt ở mười một nơi

**Files:**
- Modify: `bench/2026-10-17-go-dich/results/nghiem-thu-mac.md`

Chủ dự án làm ở từng nơi của bảng GD1 (spec §8.2). Nơi nào máy không có app hay tài khoản: ghi "không có", không tính là không đạt; chủ dự án quyết có cần thử thêm không.

- [ ] **Step 1: Ở mỗi nơi**

1. Đặt con trỏ vào ô chat (hay ô soạn thư). **GD4 trước:** bấm ⌃⌥G và nhìn app đó: nó không được tự làm việc riêng của nó cùng lúc (mở menu, đổi chế độ, chèn ký tự lạ vào ô chat…). Chỉ có ô soạn hiện ra.
2. Gõ bằng Telex: "Mai mình gửi báo cáo nhé". Ở **một** nơi bất kỳ (ghi nơi nào), gõ thêm câu có chữ mồi cho GD6: "Mã kiểm thử RIENGTU-GD6 nhé".
3. Chờ bản dịch hiện rõ, bấm Enter. **Đạt khi** ô soạn đóng, bản dịch vào đúng ô chat, **không có gì bị gửi đi**.
4. Xem lại rồi bấm Enter (của app chat). **Đạt khi** tin được gửi.
5. Ghi từng ô của bảng: `Đạt`, `Không đạt` (kèm hiện tượng), hay `không có`.

- [ ] **Step 2: Điền biên bản, commit**

Điền bảng GD1, GD4 và dòng GD1, GD4 của bảng tổng (GD1 đạt khi mọi nơi có app đều đạt; nơi không đạt ghi lý do để chủ dự án quyết).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add bench/2026-10-17-go-dich/results/nghiem-thu-mac.md && git commit -q -m "docs(go-dich): kết quả GD1, GD4 trên Mac" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: GD2 — thời gian dịch

**Files:**
- Modify: `bench/2026-10-17-go-dich/results/nghiem-thu-mac.md`

Spec §8.2: thời gian từ lúc gửi yêu cầu tới `compose://done`, đọc từ log (dòng `Gõ dịch: <ký tự> ký tự, <dòng> dòng, <ms> ms, đã dịch`, đo từ lúc luồng dịch nhận yêu cầu), 20 câu của `gd2-cau.txt`, tiến trình phụ đã nạp: **p50 ≤ 1,0 giây**. Không có phiên phụ đề trong lúc đo.

- [ ] **Step 1: Nạp sẵn**

Mở TextEdit, ⌃⌥G, gõ "chào", chờ bản dịch, Esc. (Lần đầu có thể có "Đang nạp model…": không tính lần này.)

- [ ] **Step 2: Hai mươi câu**

Với `i` từ 1 tới 20: chép câu thứ `i` vào clipboard rồi chủ dự án bấm ⌃⌥G, ⌘V vào ô soạn (bản nháp cũ đang được chọn sẵn nên bị thay), chờ bản dịch hiện rõ, Esc. Người thực thi chép từng câu bằng:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && i=1 && sed -n "${i}p" bench/2026-10-17-go-dich/gd2-cau.txt | tr -d '\n' | pbcopy && echo "đã chép câu $i"
```
(đổi `i=1` thành số của câu kế tiếp mỗi lần).

- [ ] **Step 3: Tính p50**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && python3 - "$HOME/Library/Logs/com.aitranslator.desktop/app.log" <<'EOF'
import re, statistics, sys
pattern = re.compile(r"Gõ dịch: (\d+) ký tự, (\d+) dòng, (\d+) ms, đã dịch")
rows = [m.groups() for line in open(sys.argv[1], encoding="utf-8", errors="replace") if (m := pattern.search(line))]
last = [int(ms) for _, _, ms in rows[-20:]]
print(f"{len(last)} lần; p50 {statistics.median(last):.0f} ms; nhỏ nhất {min(last)} ms; lớn nhất {max(last)} ms")
print("từng lần (ms):", " ".join(map(str, last)))
EOF
```
Expected: `20 lần`. Nếu ít hơn 20 hay có lần lỗi (dòng `Gõ dịch:` không kết thúc bằng `đã dịch`), làm lại các câu thiếu. **Đạt khi** p50 ≤ 1000 ms.

- [ ] **Step 4: Điền biên bản, commit**

Ghi vào mục GD2: p50, nhỏ nhất, lớn nhất, dãy 20 số, điều kiện đo (không có phiên phụ đề, gói Chuẩn, đã nạp sẵn); dòng GD2 của bảng tổng: `Đạt` hay `Không đạt`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add bench/2026-10-17-go-dich/results/nghiem-thu-mac.md && git commit -q -m "docs(go-dich): kết quả GD2 trên Mac" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: GD3, GD5, GD6 — vừa họp vừa gõ, qua proxy

**Files:**
- Modify: `bench/2026-10-17-go-dich/results/nghiem-thu-mac.md`
- Create: `bench/2026-10-17-go-dich/results/gd5-mac.json`

Hai phiên phụ đề 5 phút với cùng nguồn tiếng (`public/listen-test-en.wav` phát lặp bằng `afplay`; nguồn âm thanh của app là toàn hệ thống): phiên A không dùng Gõ dịch, phiên B dùng Gõ dịch một tin mỗi khoảng 10 giây (spec §8.2 GD3). Cả hai chạy khi proxy đang bắt lưu lượng của app. `netaudit.py` đối chiếu mốc với dòng `bắt đầu phiên dịch`/`kết thúc phiên dịch:` trong log, nên GD5 lấy cửa sổ của phiên B: mọi request trong lúc đó phải là việc chạy theo lịch có trong danh sách cho phép. Gõ dịch không được tạo request nào (spec §6).

Sổ tay gốc của proxy: `bench/phase1/acceptance/RUNBOOK-mac.md`, mục A7. Bước 1 của sổ tay (kiểm cách khớp tên) đã làm ở A7 ngày 2026-10-06 (khớp một phần tên), không cần làm lại.

- [ ] **Step 1: Bật proxy (chủ dự án nhập mật khẩu `sudo`)**

Thoát app dev (menu bar › Thoát). Cài chứng chỉ gốc của mitmproxy (sổ tay A7, bước 2; **phải gỡ ở Step 6**):

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem
```

Cửa sổ Terminal riêng, chạy proxy theo tiến trình của app (sổ tay A7, bước 3; HAR ghi vào thư mục tạm, không để ở `$HOME`):

```bash
mitmdump --mode local:meeting-translator,asr-worker,llama-server --set hardump=/private/tmp/gd5.har
```

Chạy lại app: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && scripts/run-dev-app.sh`. Cài đặt › Bản quyền › **Kiểm tra ngay**, rồi xác nhận dòng `POST …/validate` hiện trong log của `mitmdump` (để HAR có request **trước** cửa sổ đo).

- [ ] **Step 2: Phiên A (không Gõ dịch)**

Bấm Bắt đầu. Phát tiếng 5 phút:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && end=$((SECONDS + 300)); while [ $SECONDS -lt $end ]; do afplay public/listen-test-en.wav; done; echo HET-5-PHUT
```

Thấy `HET-5-PHUT` thì bấm Dừng.

- [ ] **Step 3: Phiên B (có Gõ dịch)**

Mở TextEdit. Bấm Bắt đầu và **ghi giờ Bắt đầu** (`date +%Y-%m-%dT%H:%M:%S%z`, rồi sửa múi giờ thành dạng `+07:00`). Chạy lệnh phát tiếng như Step 2. Trong 5 phút đó, chủ dự án mỗi khoảng 10 giây: ⌃⌥G, gõ (hay dán) một câu của `gd2-cau.txt` theo thứ tự, chờ bản dịch, Enter (bản dịch vào TextEdit). Thấy `HET-5-PHUT` thì bấm Dừng và **ghi giờ Dừng**. Bấm Cài đặt › Bản quyền › **Kiểm tra ngay**, xác nhận dòng `POST …/validate` mới trong log của `mitmdump`. Chép một cụm 3–5 từ của một bản dịch tiếng Anh đang có trong TextEdit (cho GD6).

- [ ] **Step 4: Thoát app, dừng proxy, gỡ chứng chỉ**

Thoát app (menu bar › Thoát), dừng `mitmdump` bằng Ctrl+C (HAR chỉ ghi khi dừng), rồi gỡ chứng chỉ (sổ tay A7, bước 6) và kiểm đã gỡ:

```bash
sudo security delete-certificate -c mitmproxy -t /Library/Keychains/System.keychain; security find-certificate -c mitmproxy /Library/Keychains/System.keychain >/dev/null 2>&1 && echo "CÒN CHỨNG CHỈ" || echo "ĐÃ GỠ CHỨNG CHỈ"
```
Expected: `ĐÃ GỠ CHỨNG CHỈ`.

- [ ] **Step 5: GD3 — đọc số của hai phiên**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && grep 'kết thúc phiên dịch:' "$HOME/Library/Logs/com.aitranslator.desktop/app.log" | tail -2
```
Expected: hai dòng (phiên A rồi phiên B), mỗi dòng có `… câu dịch` và ` dịch p50 … ms, p90 … ms;` và ` tổng p50 … ms, p90 … ms;`. Ghi vào bảng GD3. Mức trễ thêm là hiệu `tổng` p50 và p90 của B trừ A. Không có ngưỡng đạt (spec §8.2).

- [ ] **Step 6: GD5 — `netaudit.py`**

Thay hai giờ bằng giờ đã ghi ở Step 3 (dạng `2026-10-18T09:00:00+07:00`):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && python3 bench/phase1/acceptance/netaudit.py /private/tmp/gd5.har \
  --allow bench/phase1/results/acceptance/a7-allow.json \
  --app-log "$HOME/Library/Logs/com.aitranslator.desktop/app.log" \
  --start <giờ Bắt đầu của phiên B> --stop <giờ Dừng của phiên B> \
  --out bench/2026-10-17-go-dich/results/gd5-mac.json
```
**Đạt khi** kết quả có `A7: ĐẠT`, không dòng `VI PHẠM`; mọi request "trong lúc dịch" đều là việc chạy theo lịch của danh sách cho phép (`during_session: true`). Ghi số request ra ngoài, số request trong cửa sổ và từng request trong cửa sổ (giờ, đường dẫn) vào mục GD5. Rồi xóa HAR:

```bash
rm -f /private/tmp/gd5.har && echo DA-XOA-HAR
```

- [ ] **Step 7: GD6 — log và dữ liệu không có chữ đã gõ**

Thay `<cụm bản dịch>` bằng cụm 3–5 từ đã chép ở Step 3:

```bash
grep -rlI -e "RIENGTU-GD6" -e "bàn giao cho Minh" -e "hoàn tiền cho đơn hàng" -e "<cụm bản dịch>" "$HOME/Library/Logs/com.aitranslator.desktop" "$HOME/Library/Application Support/com.aitranslator.desktop" 2>/dev/null | wc -l && grep -c 'Gõ dịch:' "$HOME/Library/Logs/com.aitranslator.desktop/app.log"
```
**Đạt khi** dòng đầu là `0` (không file nào chứa chữ mồi, chữ đã gõ hay bản dịch); dòng sau lớn hơn 0 (log có số liệu của Gõ dịch). Ghi vào mục GD6.

- [ ] **Step 8: Điền biên bản, commit**

Điền mục GD3, GD5, GD6 và ba dòng tương ứng của bảng tổng.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git status --short && git add bench/2026-10-17-go-dich/results/nghiem-thu-mac.md bench/2026-10-17-go-dich/results/gd5-mac.json && git commit -q -m "docs(go-dich): kết quả GD3, GD5, GD6 trên Mac" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `git status` chỉ có hai file trên (không có HAR).

---

### Task 5: Sửa spec gốc và spec Gõ dịch

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
- Modify: `docs/superpowers/specs/2026-10-17-go-dich-design.md`

Spec §10 của Gõ dịch. Spec gốc chỉ thêm tóm tắt và trỏ về spec Gõ dịch; §3.2 của spec gốc không đổi ("dịch giọng của người dùng rồi phát vào cuộc họp" vẫn ngoài phạm vi; Gõ dịch là dịch chữ).

- [ ] **Step 1: Spec gốc §3.1**

Trong `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`, tìm dòng (duy nhất):

```markdown
| F10 | Phím tắt toàn cục và biểu tượng ở khay hệ thống (menu bar trên Mac). Phím tắt mặc định, đổi được trong Cài đặt: `Ctrl+Alt+T` / `⌃⌥T` để bắt đầu/dừng, `Ctrl+Alt+H` / `⌃⌥H` để ẩn/hiện phụ đề, `Ctrl+Alt+L` / `⌃⌥L` để khóa/mở khóa phụ đề, `Ctrl+Alt+PageUp` / `Ctrl+Alt+PageDown` (`⌃⌥PageUp` / `⌃⌥PageDown`) để cuộn phụ đề lên/xuống xem câu cũ (§4.4). Không chọn Ctrl+Alt+mũi tên vì driver Intel trên Windows dùng tổ hợp đó để xoay màn hình. Ở Phase 0 kiểm tra xem có trùng phím tắt của Teams, Zoom, Meet không. |
```

thay bằng:

```markdown
| F10 | Phím tắt toàn cục và biểu tượng ở khay hệ thống (menu bar trên Mac). Phím tắt mặc định, đổi được trong Cài đặt: `Ctrl+Alt+T` / `⌃⌥T` để bắt đầu/dừng, `Ctrl+Alt+H` / `⌃⌥H` để ẩn/hiện phụ đề, `Ctrl+Alt+L` / `⌃⌥L` để khóa/mở khóa phụ đề, `Ctrl+Alt+PageUp` / `Ctrl+Alt+PageDown` (`⌃⌥PageUp` / `⌃⌥PageDown`) để cuộn phụ đề lên/xuống xem câu cũ (§4.4), `Ctrl+Alt+G` / `⌃⌥G` để mở ô soạn Gõ dịch (F11; chỉ đăng ký khi bật Gõ dịch). Không chọn Ctrl+Alt+mũi tên vì driver Intel trên Windows dùng tổ hợp đó để xoay màn hình. Ở Phase 0 kiểm tra xem có trùng phím tắt của Teams, Zoom, Meet không. |
| F11 | **Gõ dịch** (spec `2026-10-17-go-dich-design.md`, §4.6): ở ô nhập của app bất kỳ, bấm phím tắt (F10) để mở ô soạn nổi, gõ tin nhắn bằng tiếng của mình; bản dịch hiện dần. Enter dán bản dịch vào ô nhập cũ (macOS cần quyền Trợ năng, thiếu thì chỉ chép vào clipboard), Enter lần nữa (của app chat) thì gửi. Ngôn ngữ đích mặc định là tiếng người bên kia, tính từ cài đặt phụ đề. Dùng được ở mọi gói còn hiệu lực, không trừ phút; dịch trên máy, không gửi chữ đi đâu. |
```

- [ ] **Step 2: Spec gốc §4.3**

Cùng file, tìm dòng (duy nhất):

```markdown
  - **Âm thanh:** nguồn âm thanh, độ nhạy ngắt câu.
```

thay bằng:

```markdown
  - **Gõ dịch** (F11): bật/tắt (tắt thì gỡ phím tắt của nó, phím vẫn giữ); "Dịch sang": Tự động (tiếng người bên kia, ghi rõ đang là ngôn ngữ nào) hay một trong năm ngôn ngữ; chỉ macOS: "Tự dán vào ô đang gõ", kèm trạng thái quyền Trợ năng và nút mở trang Trợ năng (spec 2026-10-17-go-dich §1.4). Phím tắt đổi ở nhóm Phím tắt.
  - **Âm thanh:** nguồn âm thanh, độ nhạy ngắt câu.
```

- [ ] **Step 3: Spec gốc §4.6 mới**

Cùng file, tìm dòng (duy nhất):

```markdown
## 5. Kiến trúc tổng thể
```

thay bằng:

```markdown
### 4.6 Ô soạn Gõ dịch

Tóm tắt của F11; chi tiết, quyết định và nghiệm thu ở `docs/superpowers/specs/2026-10-17-go-dich-design.md`.

- **Luồng:** con trỏ ở ô chat của app bất kỳ, bấm ⌃⌥G (Ctrl+Alt+G): ô soạn nổi hiện giữa màn hình có con trỏ chuột (rộng 560 px, mép trên ở 25% chiều cao màn hình, nổi cả trên app toàn màn hình), con trỏ nằm sẵn trong ô gõ, app chat vẫn ở phía trước. Ngừng gõ 400 ms thì app dịch toàn bộ chữ đang có; bản dịch hiện dần bên dưới ô gõ. Enter: ô đóng, bản dịch được dán vào ô chat cũ, không gửi gì. Enter lần nữa (của app chat) thì gửi.
- **Phím:** Enter dán (đang dịch thì dịch xong mới dán; dịch lỗi thì dịch lại, không bao giờ dán câu gốc; câu đã là ngôn ngữ đích thì dán nguyên văn; ô trống thì đóng). Shift+Enter xuống dòng. Enter khi bộ gõ đang chọn chữ thuộc về bộ gõ. Esc, phím tắt lần nữa hay bấm ra ngoài thì đóng mà giữ bản nháp; mở lại thì bản nháp được chọn sẵn.
- **Dịch:** cùng hàm dịch, prompt và hậu xử lý của phụ đề (§6.5), không ngữ cảnh, không thuật ngữ; tách theo dòng; tối đa 4000 ký tự, 400 token mỗi dòng. Ngôn ngữ nguồn nhận theo chữ viết; câu chắc chắn đã là ngôn ngữ đích thì không dịch. Mở ô soạn thì chạy sẵn hai tiến trình phụ đúng thứ tự của §5.
- **Dán:** chép bản dịch vào clipboard (giữ lại, không khôi phục nội dung cũ) rồi gửi ⌘V (macOS, cần quyền Trợ năng; thiếu quyền thì chỉ chép và ô soạn hiện hướng dẫn) hay Ctrl+V (Windows, sau khi đưa cửa sổ trước về phía trước).
- **Gói và quyền riêng tư:** dùng được ở mọi gói còn hiệu lực, không trừ phút, không gọi mạng. Chữ gõ và bản dịch chỉ nằm trong bộ nhớ; log chỉ ghi số liệu.
- **Cài đặt:** nhóm "Gõ dịch" (§4.3); phím tắt ở nhóm Phím tắt (F10).

## 5. Kiến trúc tổng thể
```

- [ ] **Step 4: Spec Gõ dịch theo spike và nghiệm thu**

Sửa `docs/superpowers/specs/2026-10-17-go-dich-design.md` ở bốn chỗ:

1. Ngay sau dòng bắt đầu bằng `**Trạng thái:**` (dòng 4), thêm một dòng, điền ngày thật từ biên bản:
   `**Nghiệm thu:** trên Mac ngày <ngày ở biên bản>, kết quả ở `bench/2026-10-17-go-dich/results/nghiem-thu-mac.md` (spike ở `results/spike.md`). Windows chưa thử.`
2. Mục 3.2. Trong `docs/superpowers/specs/2026-10-17-go-dich-design.md`, tìm dòng (duy nhất):

```markdown
| `paste.rs` | Trait `Paster` (ghi clipboard, kiểm quyền, gửi phím dán) với ba bản: macOS, Windows, bản giả cho test (mục 4) |
```

thay bằng:

```markdown
| `native_macos.rs`, `native_windows.rs` | Bản thật của trait `Native` (khai trong `mod.rs`): hiện, ẩn, đổi chiều cao cửa sổ, ghi clipboard, kiểm và hỏi quyền, gửi phím dán; bản giả cho test là `test_support::FakeNative` (mục 4). Kế hoạch gộp việc cửa sổ và việc dán vào một trait vì cả hai cần đúng cửa sổ của từng hệ điều hành |
```

   Cùng file, cùng mục, tìm dòng (duy nhất):

```markdown
Phía giao diện: `src/compose/` (React, trang riêng), dùng chung kho chuỗi i18n và theme của app.
```

thay bằng:

```markdown
Phía giao diện: `compose.html` và `src/windows/compose/` (React, trang riêng, cạnh `src/windows/main/`, `src/windows/overlay/`), store `src/store/compose.ts`, phần thuần `src/lib/compose.ts`; dùng chung kho chuỗi i18n và theme của app.
```

3. Mục 4.1, ở dòng bắt đầu bằng `4. Ẩn ô soạn. macOS: chờ một khoảng cố định` (dòng 171): đổi "(con số chốt ở spike S2, mục 7)" thành "<N> ms (chốt ở spike S2, `results/spike.md`)", với `<N>` là `PASTE_DELAY` đã chốt trong biên bản spike.
4. Mục 4.2, dòng bắt đầu bằng `- Lời hướng dẫn bật lại quyền sau khi cập nhật` (dòng 186): thay cả dòng bằng kết luận của spike S3 (mục "Kết luận cho spec §4.2" của `results/spike.md`), nói rõ câu hướng dẫn ở Cài đặt › Gõ dịch (`settings.compose.permission.missing`) đã khớp kết luận đó chưa.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && grep -n 'F11\|### 4.6\|\*\*Gõ dịch\*\* (F11)' docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && grep -n 'Nghiệm thu:\|native_macos.rs\|src/windows/compose' docs/superpowers/specs/2026-10-17-go-dich-design.md && grep -c 'spike S2, mục 7\|chốt theo kết quả spike S3' docs/superpowers/specs/2026-10-17-go-dich-design.md
```
Expected: spec gốc có dòng F11, dòng F10 có `⌃⌥G`, mục `### 4.6`, dòng `**Gõ dịch** (F11)` ở §4.3; spec Gõ dịch có dòng `Nghiệm thu:`, `native_macos.rs`, `src/windows/compose`; số cuối là `0` (không còn chỗ chờ spike).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add docs/superpowers/specs && git commit -q -m "docs(spec): F11 Gõ dịch vào spec gốc; spec Gõ dịch theo spike và nghiệm thu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: Kết thúc

**Files:** không sửa file.

- [ ] **Step 1: Kiểm toàn bộ lần cuối**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo fmt --all -- --check && echo FMT-OK && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | grep -E '^(error|warning)|Finished' && sh scripts/check-windows.sh --locked 2>&1 | grep -E '^(error|warning)|Finished' && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result' && pnpm build 2>&1 | tail -1 && pnpm test 2>&1 | grep Tests && git status --short
```
Expected: `FMT-OK`, hai lần `Finished`, `passed` = N0 + 46 (689), `✓ built`, `Tests  321 passed`, không file nào chưa commit.

- [ ] **Step 2: Dọn tiến trình**

Thoát app dev nếu còn chạy. Kiểm không còn tiến trình do mình mở:

```bash
pgrep -fl "AI Translator Dev.app" || echo "KHONG-CON-APP"; lsof -nP -iTCP:1420 -sTCP:LISTEN || echo "CONG-1420-DA-DONG"; pgrep -fl mitmdump || echo "KHONG-CON-MITMDUMP"
```
Expected: ba dòng `KHONG-CON-APP`, `CONG-1420-DA-DONG`, `KHONG-CON-MITMDUMP`.

- [ ] **Step 3: Báo chủ dự án**

Báo (tiếng Việt): kết quả từng tiêu chí GD1–GD6 kèm số đo, nơi nào không đạt và lý do, đường dẫn biên bản, các commit trên nhánh `go-dich`. Nêu các việc còn chờ chủ dự án quyết, **không tự làm**:
- merge nhánh `go-dich` vào `main`, push, phát hành (quy trình phát hành sẵn có);
- xóa nhánh nháp `go-dich-proto`;
- chính sách quyền riêng tư có thêm câu về clipboard và quyền Trợ năng không (spec §6; nâng phiên bản chính sách theo `docs/legal`);
- website và trang hỗ trợ sau khi phát hành (spec §10: chỉ nói điều có thật, không nêu công nghệ lõi);
- thử trên Windows khi có máy (GD1, GD4, GD5, GD6).
