# Windows: bộ đọc tên UI Automation (kế hoạch 05)

Mục tiêu: trên Windows, đọc tên và chỉ báo "đang nói" của Teams (rồi Meet, Zoom) bằng UI Automation; đo chi phí đọc; chốt công thức.
**Chưa có bản ghi cây giao diện Windows nào trước kế hoạch này.** Công thức Windows ở dạng ứng viên (đoán từ macOS) cho tới Task 11.

## Dựng (Task 8, Task 9; macOS, mingw-w64)

| | |
|---|---|
| `speaker-worker.exe` (gnu, release, strip) | 6 162 944 byte |
| bản nén xz -9e | 1 545 556 byte; bộ cài 0.3.1 + bản nén = 22 646 915 byte (giới hạn 60 000 000) |
| `uia-record.exe` | 1 828 864 byte |
| DLL nhập của `speaker-worker.exe` | KERNEL32, kernel32, ntdll, api-ms-win-core-synch-l1-2-0, api-ms-win-crt-{environment,heap,locale,math,private,runtime,stdio,string}-l1-1-0, bcryptprimitives, ole32, oleaut32, user32; mới so với 02-windows.md: ole32.dll, user32.dll |
| nhập `ws2_32`, `winhttp`, `wininet`, `wsock` | 0 (cả `speaker-worker.exe` và `uia-record.exe`) |
| `win-pack-05.zip` | 979 518 byte, SHA-256 `ce7089e6fcc54da9b43f0de94bc871f53eca7a291a7f666140ddd3bd71e42a5e` |

SHA-256 của `uia-record.exe` trong gói: `9f309856b64c2f122fcd1416accc3a4e6d7a25e1682d7218d698a55ebc806fdd`.

Gói chưa chạy trên Windows (máy dựng không có PowerShell); `chay-05.ps1` chỉ cân ngoặc (71/71, 39/39, 16/16) và kiểm số nháy từng dòng.

## Task 10: bản ghi Teams trên Windows (2026-10-30, Claude chạy trên máy i5 của chủ dự án)

**Điều kiện.** Intel Core i5-1345U (2 lõi P + 8 lõi E, 12 luồng), 31,7 GB RAM, Windows 11 Pro 10.0.26300, cắm điện, chế độ
nguồn Balanced. Teams mới (MSIX `MSTeams` 26225.1806.5074.1452), tài khoản Microsoft cá nhân (Teams miễn phí), "Meet now",
chủ phòng tắt mic và camera. Công cụ dựng tại chỗ bằng MSVC (`cargo build --release -p speaker-worker`, HEAD `47bb85f2`),
không dùng gói `win-pack-05.zip`: thay `chay-05.ps1` bằng script tương đương ngoài repo (ghi `fixture` và `stats` song song,
`--rate 4`, 120 s, công thức ứng viên `teams-windows.recipes.json`). Hai khách (tên giả, Chrome tự động, micro giả phát giọng
đọc máy SAPI) chạy **trên cùng máy** chứ không phải máy Mac như kế hoạch, nên đồng hồ của sự thật và của bản ghi là một;
tải của hai Chrome khách cộng vào tải của máy trong lúc ghi (không ảnh hưởng mục chi phí đọc ở dưới, đo khi khách đã ngồi yên).
Khách vào bằng `https://teams.live.com/v2/?meetingjoin=true#/meet/<mã>?p=<mật mã>&anon=true`; ô "Join now" và các công tắc của
khách phải bấm bằng `element.click()` qua `/eval` (như `teams-chrome.md`). Chủ phòng điều khiển bằng UI Automation (Meet now,
Join now, Admit all, mở/đóng bảng People).

Hai lượt ghi, mỗi lượt 120 s, 480 ảnh chụp (đủ 4 ảnh/giây), kịch bản `run_schedule.py` 90 s, 26/26 lần bật/tắt mic khách thành
công. Bản ghi thô (có tên chủ phòng thật) ở ngoài repo.

Lưu ý chạy trên Windows PowerShell 5.1: tham số truyền cho chương trình ngoài bị **bỏ mất dấu `"` bên trong**, nên bộ chọn
`#mic-button[aria-label="Unmute mic"]` của kế hoạch tới `run_schedule.py` thành CSS sai (HTTP 500 ở `/eval`); dùng nháy đơn
`#mic-button[aria-label='Unmute mic']`. Python chạy `-I` bỏ qua `PYTHONIOENCODING`: cần `-X utf8` để in tiếng Việt.

| Mục (`tom_tat_do.py`) | People mở | People đóng |
|---|---|---|
| Lượt / trạng thái | 480 / `Ok` 480 | 480 / `Ok` 480 |
| Lượt đầy đủ: số, p50 / p90 / lớn nhất | 143; 30,7 / 34,3 / 42,8 ms | 99; 30,4 / 34,0 / 43,0 ms |
| Lượt nhanh: số, p50 / p90 / lớn nhất | 337; 13,6 / 16,2 / 20,6 ms | 381; 10,7 / 12,5 / 16,7 ms |
| Quá 30 ms; lệnh đọc p90 / lớn nhất | 127; 45 / 91 | 88; 25 / 110 |
| Số ô | 3 ô × 353, 0 ô × 122, 2 ô × 4, 1 ô × 1 | 3 ô × 392, 0 ô × 79, 1 ô × 7, 2 ô × 2 |
| Lệnh quá hạn / bị chặn | 0 / 0 | 0 / 0 |

Mọi lượt "0 ô" là **lượt đầy đủ** (`Full|0` 122 và 79; lượt nhanh luôn có 3 ô), lặp đều khoảng 3 s một lần thành dãy 2–5 lượt
liền: lượt đầy đủ trên Windows tốn ~30 ms, đúng ngân sách 30 ms của một lượt, nên bị cắt giữa chừng và cần vài lượt mới đi
hết cây. Không phải mất người; nhưng nếu tracker coi "lượt đầy đủ hết ngân sách, 0 ô" là "không ai trong họp" thì cần xem lại
(commit `399ce7d2` đã sửa phần báo `NoNames` của trường hợp này).

## Task 11: công thức Teams Windows (Step 1–4; dừng ở tiêu chí)

**Hình dạng (Step 3, nhánh không cần):** công thức đoán từ macOS khớp ngay. Ô là `MenuItem` (sâu 18) với nhãn
`<Tên> (Guest), muted, Context menu is available` (khách) và `Myself video, <Tên>, Muted, Has context menu` (chủ phòng);
`tile.label` và `name_suffixes` hiện có đọc đúng tên cả ba người. `hangup-button` có ở cả 480/480 ảnh của hai bản ghi
(`confirm_id` giữ). Tiêu đề cửa sổ họp `Meeting with <tên chủ phòng> | Microsoft Teams` khớp `^Meeting with `.

**Chỉ báo "đang nói" (Step 4):** `find_indicators.py` trên cả hai bản ghi: dòng tương quan cao nhất với từng khách (+0,93 …
+0,95) là **nhãn ô mất chữ "muted"**, tức tín hiệu mic, không phải chỉ báo nói. **Không có** phần tử `vdi-frame-occlusion`
(chỉ báo của Teams macOS) hay phần tử nào khác trong ô video đổi theo lúc nói: 0/480 ảnh có lớp đó ở cả hai bản ghi; mọi hình
dạng trong ô có mặt ở 480/480 ảnh. Bản ghi People mở có thêm `roster-avatar-img-<id>` (bảng People) đổi lớp
(`___jc9uze0 f71fsbu` ↔ `___ansmq00 fhuq1gn`, 116/110 ảnh ở lớp thứ hai), tương quan +0,92/+0,93.

Vì kịch bản của kế hoạch chỉ mở mic khi nói (âm thanh khách phát liên tục), mic và nói trùng nhau; thêm một **thí nghiệm phân
biệt** (ngoài kế hoạch): khách Lan mở mic suốt 80 s, âm thanh 6 câu xen 8 s im. Nhãn ô của Lan "không muted" ở 320/320 ảnh;
lớp `roster-avatar-img` của Lan đổi theo nhịp nói (dãy 5,0 / 6,0 / 5,0 / 6,0 / 7,0 / 6,0 s ở lớp "nói", 7–8 s ở lớp thường),
và là **dòng duy nhất** trong cây đổi cùng nhịp (tương quan ±1,00; không dòng nào trong ô video). Kết luận: trên Teams Windows
bản này, **chỉ báo "đang nói" chỉ có ở bảng People** (lớp của ảnh đại diện), ô video chỉ có trạng thái mic.

**Tiêu chí:** (a) đủ ba ô: lượt nhanh luôn đủ; trên cây ghi (`cay-*.jsonl`) chưa chạy test Rust của Step 7–8 vì (b) đã trượt.
(b) khung "đang nói" ở ô video khớp ≥ 0,85 ở **cả hai** bản ghi: **không đạt** (không có khung nào để khớp; định dạng công
thức chỉ cho neo `child`/`descendant` của ô). Theo kế hoạch: **giữ tắt**, không sửa `recipes.json`, không hạ ngưỡng; chưa ẩn
danh hay chép fixture vào repo (Step 5–9 không làm). Hướng có thể (chủ dự án quyết, mỗi hướng là việc riêng):
1. Lấy hàng của bảng People (`TreeItem`, nhãn `<Tên> (Unverified), Meeting guest, Muted|Unmuted`) làm "ô", neo `descendant`
   `id_prefix: roster-avatar-img-`, tín hiệu `deviation` (không cần tên lớp CSS): chỉ chạy khi người dùng mở bảng People.
2. Chỉ dùng tín hiệu mic (tín hiệu 3, `matcher.rs`): đúng khi chỉ một người ở xa mở mic; họp thật nhiều người để mic mở thì
   không gán được.
3. Giữ Teams Windows ngoài công thức: phụ đề hiện "Người N", người dùng đổi tên tay.

## Task 12: chi phí đọc (2026-10-30)

Cuộc họp mở, ba người, không ai nói, bảng People đóng, máy không dùng. Mỗi mức 60 s, hai vòng. CPU của Teams = `ms-teams` cộng
các `msedgewebview2` có dòng lệnh thuộc `MSTeams` (không tính WebView2 của AI Translator). Đọc bằng `uia-record stats`.

| Mức | Teams (% một lõi), vòng 1 / 2 | Teams thêm so với không đọc | `uia-record` tự dùng |
|---|---|---|---|
| Không đọc | 25,2 / 25,4 | — | — |
| 1 lần/giây | 25,8 / 27,0 | +0,6 / +1,6 | 0,52 / 0,39% |
| 4 lần/giây | 30,2 / 25,9 | +5,0 / +0,5 | 1,07 / 1,12% |

Bộ đọc tự tốn ~1% một lõi ở 4 lần/giây. Phần Teams tốn thêm nằm trong biên nhiễu của hai vòng (0,5–5 điểm); chưa đo năng
lượng (Windows không có `powermetrics`; cần PresentMon/ETW hay đồng hồ đo điện ngoài).

## Task 13: Meet (Chrome, Edge) và Zoom trên Windows

**Chờ chủ dự án.**
