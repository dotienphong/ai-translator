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

### Task 11, hướng 1: hàng của bảng People làm "ô" (2026-10-31)

Công thức `scripts/speaker-recipes/fixtures/teams-windows-people.recipes.json` (ứng viên, chưa vào `recipes.json`): ô là `TreeItem`
của bảng People với nhãn `<Tên>[ (Unverified)], <Vai trò>, Muted|Unmuted` (`Organizer`, `Meeting guest`; hàng tiêu đề
"In this meeting, N total" không khớp), neo `descendant` `id_prefix: roster-avatar-img-`, tín hiệu `deviation`, `delay_ms` 900.
Kiểm bằng hai bản ghi bảng mở, kịch bản bật/tắt mic khác nhau (kịch bản 1: `run_schedule.py` 120 s; kịch bản 2: 81 s, lượt dài,
lượt ngắn, đổi lượt, nói chồng, câu 1,5 s), tên giả, `names::track::tests::teams_windows_people_panel_follows_who_speaks`:

| Bản ghi | Đủ ba người (a) | Khớp Lan (b) | Khớp Minh (b) |
|---|---|---|---|
| `teams-windows-people-open` (60 s đầu) | 1,000 | 0,979 | 0,992 |
| `teams-windows-people-open-2` (85 s) | 1,000 | 0,917 | 0,929 |

(c) hàng tiêu đề không khớp nên không đọc chữ ngoài phạm vi; `make_fixture.py` giữ lớp nguyên tử của `roster-avatar-img-*` vì chính
chúng là chỉ báo (trước khi giữ, độ khớp 0,68). Đạt (a), (b) cho công thức này.

Giới hạn: (1) chỉ chạy khi người dùng mở bảng People; đóng bảng thì không có ô nào, phụ đề là "Người N". (2) Hàng của chủ phòng
không có `roster-avatar-img-*` trong cây (chưa có tín hiệu cho chủ phòng đang nói); hàng không có dấu nhận chính người dùng
(`is_self` luôn sai). (3) Chỉ kiểm nhãn tiếng Anh. (4) Cả hai kịch bản bật mic khi nói, nên bản ghi không phân biệt "nói" với "mic
mở"; việc đó dựa vào thí nghiệm phân biệt ở trên (Lan mở mic suốt, lớp đổi theo nhịp nói, tương quan ±1,00). (5) Một Teams, một
máy, hai khách tự động cùng máy.

### Task 11: khi bảng People đóng (2026-10-31)

Câu hỏi: đóng bảng People thì phụ đề còn đúng tên không. Thử bốn hướng trên cùng máy, Teams `26225.1806.5074.1452`, hai khách tự động.

- **Giữ tên đã gán (đạt).** `NameMatcher` chỉ xóa tên khi `SetNames(false)`; hết hàng để đọc (`now` rỗng) không làm mất tên. Test
  `names_given_while_the_panel_was_open_stay_after_it_closes`: tên gán lúc bảng mở còn nguyên cho các đoạn sau, giọng mới lúc bảng
  đóng vẫn là "Người N". Chưa kiểm ở mức app (giao diện khi trạng thái `NoNames`).
- **Phụ đề trực tiếp của Teams (đạt, chưa nối vào bộ đọc chạy thật).** Bật "Language and speech › Show live captions": nhóm `Live
  Captions` trong cây UI Automation của cửa sổ họp có từng dòng `Text` tên người nói rồi `Text` lời (`fui-ChatMessageCompact__body`),
  **không phụ thuộc bảng People**. Đã cài tín hiệu `caption` (`SignalKind::Caption`): ô là một dòng phụ đề (`name_from: text`), trạng
  thái là băm các chữ tĩnh của ô (chỉ băm, lời họp không ra khỏi bộ đọc), chỉ dòng cuối tính, "đang nói" khi chữ của nó đổi hay dòng
  mới xuất hiện trong 1 s. Công thức ứng viên `teams-windows-captions.recipes.json` (`delay_ms` 2 400: Teams nhận dạng rồi mới hiện chữ).
  Test `teams_windows_live_captions_follow_who_speaks` qua `SpeakingTracker` thật:

  | Bản ghi | Khớp Lan | Khớp Minh |
  |---|---|---|
  | `teams-windows-captions-closed` (85 s, bảng đóng; độ trễ 2,4 s chọn trên bản này) | 0,863 | 0,881 |
  | `teams-windows-captions-open` (34 s, bản ghi khác; kiểm ngoài mẫu) | 0,915 | 0,954 |

  Còn thiếu để chạy thật: (1) một công thức mỗi app/hệ điều hành, nên chưa dùng được cùng lúc với công thức bảng People (hai độ trễ
  0,9 s và 2,4 s, hai bộ neo); cần nhiều biến thể cho một app (`Sample`/`TileSample`, bộ theo dõi và độ trễ theo biến thể, `LiveReader`
  Windows). (2) Người dùng phải bật phụ đề của Teams (Teams gửi âm thanh lên dịch vụ của Microsoft để làm phụ đề). (3) Lớp
  `fui-ChatMessageCompact__body` có thể trùng với khung chat của họp (chưa kiểm khi chat mở). (4) Chưa kiểm tiếng Việt và nói chồng.
- **Hai nguồn chạy cùng lúc (đã nối vào bộ đọc, 2026-10-31).** Công thức cho phép tối đa 3 mục cho một app trên Windows
  (`Recipes::variants`; bản app cũ giữ mục đầu và bỏ các mục sau, nên bảng People đứng trước, phụ đề đứng sau). `LiveReader` Windows
  đọc từng nguồn trong cùng một ngân sách; `TileSample::variant` ghi nguồn; `Worker` giữ một `SpeakingTracker` cho mỗi (app, nguồn)
  và mỗi nguồn dời bằng chứng theo độ trễ riêng (0,9 s và 2,4 s) rồi cộng vào cùng một người (`observe_groups`); độ trễ chờ bằng
  chứng của đoạn lấy nguồn chậm nhất. File `teams-windows-sources.recipes.json` (ứng viên, chưa vào `recipes.json`).
  Test `teams_windows_two_sources_together_follow_who_speaks` (trên cả bốn bản ghi, kể cả `captions-open` có cả hai nguồn):

  | Bản ghi | Lan | Minh |
  |---|---|---|
  | `people-open` (chỉ bảng) | 0,960 | 0,951 |
  | `people-open-2` (chỉ bảng) | 0,914 | 0,914 |
  | `captions-closed` (chỉ phụ đề) | 0,859 | 0,877 |
  | `captions-open` (cả hai) | 0,950 | 0,967 |

  Test phiên `windows_names_a_voice_from_live_captions_alone`: bảng đóng, chỉ phụ đề, giọng của Lan vẫn có tên. Chạy thật
  (`uia-record stats` với công thức hai nguồn, bảng People mở và phụ đề bật, 36 s, 144 lượt): 3 ô của bảng cộng 2–7 dòng phụ đề, 0 lệnh
  quá hạn, lượt nhanh p50 7,3 ms (lớn nhất 14,3), lượt đầy đủ p50 30,1 ms (ngân sách 30).

- **Chỉ trạng thái mic (không bật).** Nhãn ô video vẫn có `muted` khi bảng đóng (2 ô khách ở 360/360 ảnh), nhưng `NameMatcher` cần chỉ báo
  làm bằng chứng (QĐ 24); bản ghi của ta bật mic đúng lúc nói nên không đo được độ sai của "mic mở nhưng im".
- **Bảng People thu nhỏ/kéo sang bên:** không cần code, chưa thử.

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
