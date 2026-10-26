# Phần tốn thêm của Teams và Chrome khi bật trợ năng, chỉ báo "đang nói" của Teams khi bảng People đóng (spec §6.4, §6.8)

Kế hoạch 01, Task 12. Hai câu hỏi của spec `2026-10-26-phan-biet-nguoi-noi-design.md`: (1) bật Accessibility để đọc tên và dấu
"đang nói" của Teams và của Chrome/Meet tốn thêm bao nhiêu CPU, RAM; đọc 4 lần mỗi giây có chịu được không, mỗi lượt đọc mất bao
lâu; nên bật suốt phiên hay chỉ quanh lượt đọc (§6.8). (2) Khi bảng People của Teams đóng, ô video có chỉ báo "đang nói" thật
(không phải nhãn mic Muted/Unmuted) dò được không (§6.4). Bản ghi cây giao diện có tên người nằm ở `truoc-spec/doc-ten/out/` và
`$DATA/out/`, không nằm trong git; dưới đây không ghi tên người (chủ phòng gọi là "chủ phòng", khách là Lan và Minh).

## Tóm tắt

- **Bật trợ năng mà không đọc thì không tốn gì đo được** (Teams và Chrome, CPU, số lệnh, năng lượng, RAM). **Phần tốn nằm ở việc
  đọc cây.** Đọc cả cửa sổ họp 4 lần mỗi giây bằng bộ đọc thử (`axtrace watch`): Teams tốn thêm 1,2 tỉ lệnh/giây (gấp 2,5) và khoảng
  0,45 W (gồm bộ đọc); Chrome với hai cửa sổ Meet tốn thêm 2,0 tỉ lệnh/giây (gấp 2,7) và khoảng 1,26 W, luồng chính của trình duyệt
  lên 27% một lõi (từ 3%). Đọc 1 lần mỗi giây: Teams khoảng 0,09 W, Chrome khoảng 0,26 W.
- **%CPU (thời gian) đánh lừa:** khi đọc 4 lần mỗi giây, %CPU của Teams và Chrome lại *giảm* (Teams 38 → 35%, Chrome 63–82 →
  48%), vì chip lên xung (xung hiệu dụng của Chrome 1,3 → 2,9 GHz) nên cùng việc tốn ít thời gian hơn. Kết luận dưới đây dựa trên
  số lệnh và năng lượng (`ri_instructions`, `ri_energy_nj` của `proc_pid_rusage`), %CPU chỉ để đối chiếu với kế hoạch.
- **Mỗi lượt đọc cả cửa sổ** mất 46–65 ms với Teams (133–184 nút) và 92–121 ms với hai cửa sổ Meet (390 nút), vượt giới hạn 30 ms
  của §6.2 dù cây nhỏ hơn nhiều so với 3 000 phần tử.
- **Chrome 156 không còn nhận `AXManualAccessibility`** (mã -25205, không đặt được, cây web không dựng sau 96 s). Đặt
  `AXEnhancedUserInterface` thì cây web dựng sau khoảng 2 s lần đầu và Chrome **gỡ cây khi đặt lại false**. Teams thì ngược lại:
  đặt lại false nhưng cây vẫn sống (cập nhật) tới khi Teams khởi động lại.
- **Teams, bảng People đóng: có chỉ báo nói ở ô video.** Một phần tử con không tên, lớp CSS `vdi-frame-occlusion`, xuất hiện trong ô
  của người đang nói; khớp sự thật 95–97% (r = 0,89–0,92), hiện sau nhãn mic 0,5–0,6 s (cần nghe thấy tiếng), khi nói chồng thì
  cả hai ô cùng có. `find_indicators.py` của kế hoạch không bắt được nó (dòng không tên gộp giữa các ô; cao nhất 0,35); phân tích
  theo ô (`tro-nang/o_dang_noi.py`) bắt được.

## Điều kiện

- Máy: Apple M4 Pro, 24 GB, macOS 26.6.2 (25G83). Ngày 2026-10-26, khoảng 16:50–18:05.
- **Nguồn điện:** ba lượt Teams A, B, C (16:51–16:58) cắm điện, chế độ High Power (`pmset -g custom`: `powermode 2` khi cắm). Từ
  16:58:55 máy chạy pin (chế độ Automatic, `powermode 0`; pin 100% → 90%), không phải do tôi rút; mọi lượt còn lại chạy pin.
  So sánh chỉ làm giữa các lượt cùng nguồn điện.
- **Teams** 26276.505.5234.9924 (bundle `com.microsoft.teams2`, phần web chạy trong Edge WebView 154.0.4258.62), tài khoản Microsoft
  cá nhân (teams.live.com). Cuộc họp từ một đường dẫn họp có sẵn của tài khoản (mục Meet › Meeting links › Join). Chủ phòng: mic và
  camera tắt suốt. Hai khách Lan, Minh: `truoc-spec/doc-ten/guests.py` (Chrome tự động, hồ sơ tạm, micro giả là file giọng đọc máy
  lặp lại, camera tắt), bật/tắt mic bằng `#mic-button`. Lưới ba ô, không ô nào có video.
- **Chrome** 156.0.8078.48, đã chạy từ 23/10 (không khởi động lại, xem "Khác kế hoạch"), hồ sơ có tài khoản Google cá nhân. Meet:
  cửa sổ chủ phòng (mic, camera tắt) và cửa sổ người nói cùng tài khoản ("Đồng thời tham gia tại đây"; mic bật, camera tắt), hai
  cửa sổ đặt cạnh nhau (mỗi cửa sổ rộng 756 điểm). Người nói là giọng `say -v Samantha` qua loa, âm lượng 44 (mức gần 45 nhất
  macOS nhận); micro của Mac thu lại.
- **"Bật trợ năng":** Teams: `AXEnhancedUserInterface = true` (`axtrace` với `AXTRACE_EUI=1`). Chrome: như trên, vì
  `AXManualAccessibility` không có tác dụng (lượt `chrome-Bman`). **"Đọc":** `axtrace watch` duyệt mọi nút của cửa sổ họp, mỗi nút
  9 thuộc tính (mỗi thuộc tính một lần gọi), nhịp 0,25 s (4 lần/giây) hay 1 s; chỉ ghi khi cây đổi.
- **Chạy song song:** khi đo Teams, hai trình duyệt khách chiếm 1,0–1,3 lõi; khi đo Chrome, Teams nhàn rỗi (≤ 2% một lõi). Không
  biên dịch, không đo gì khác. App ở trước (ghi mỗi 2 s) luôn là app đang đo trong mọi lượt; không có thao tác người dùng trong
  lúc đo. Dịch vụ nền của macOS không tắt.
- Đơn vị: %CPU với một lõi = 100; RAM là RSS cộng dồn (MB = 2^20 byte, như `cpu_sample.py`); "tỉ lệnh/s" là số lệnh máy đã chạy
  mỗi giây; mW là năng lượng ước tính của nhân macOS chia thời gian.

## Bảng 1: các lượt 95 s theo kế hoạch (`cpu_sample.py`, %CPU)

Bảng của Step 9 (`ps`, trung bình và p90 trên 95 mẫu) cộng cột thời gian CPU tích lũy (`ps -o time`, đầu và cuối lượt). Teams =
`MSTeams` (tiến trình chính, cộng driver âm thanh gần như 0) + `Teams WebView` (mọi tiến trình WebView). Chrome = mọi tiến trình
Chrome của chủ dự án, cả các tab khác (khoảng 50 tiến trình, RSS 7–8 GB).

| Lượt | Nguồn | Trợ năng | Đọc | People | MSTeams tb / p90 | WebView tb / p90 | Tổng tb / p90 | RAM tổng tb | CPU tích lũy |
|---|---|---|---|---|---|---|---|---|---|
| teams-A | cắm | chưa đặt (Teams sạch) | không | mở | 16,6 / 19,0 | 19,7 / 36,6 | 36,3 / 48,6 | 1 043 MB | 18,3 + 20,1 |
| teams-B | cắm | EUI | 4/s | mở | 7,6 / 8,1 | 25,2 / 31,1 | 32,8 / 38,0 | 1 002 MB | 9,3 + 26,0 |
| teams-C | cắm | EUI | 4/s | đóng | 9,6 / 11,4 | 22,1 / 28,9 | 31,7 / 38,1 | 1 006 MB | 10,6 + 24,2 |
| teams-A2 | pin | EUI đặt lại false (cây vẫn sống) | không | đóng | 18,2 / 20,2 | 16,3 / 17,2 | 34,4 / 36,0 | 1 044 MB | 18,6 + 18,0 |
| teams-A3 | pin | chưa đặt (Teams vừa mở lại) | không | mở | 17,7 / 19,8 | 19,2 / 30,3 | 36,9 / 47,2 | 1 577 MB | 18,8 + 22,6 |
| teams-B0 | pin | EUI | không | mở | 17,8 / 19,9 | 18,7 / 26,0 | 36,5 / 43,0 | 1 429 MB | 19,0 + 20,7 |
| teams-B1 | pin | EUI | 1/s | mở | 18,0 / 20,2 | 18,0 / 27,3 | 36,0 / 45,1 | 1 381 MB | 16,7 + 21,7 |
| teams-B3 | pin | EUI | 4/s | mở | 7,9 / 9,1 | 25,6 / 34,5 | 33,5 / 42,0 | 1 600 MB | 9,4 + 26,2 |
| chrome-A | pin | chưa đặt (không có cây web) | không | | | | 55,6 / 73,6 | 7 490 MB | 63,7 |
| chrome-Bman | pin | `AXManualAccessibility` (không tác dụng) | 4/s (chỉ cây gốc) | | | | 45,8 / 55,7 | 7 464 MB | 53,0 |
| chrome-B | pin | EUI | 4/s | | | | 46,3 / 67,3 | 7 787 MB | 52,8 |

Chênh lệch theo %CPU, đúng như kế hoạch hỏi: Teams A → B −3,5 điểm (−10%), A3 → B3 −3,4 điểm (−9%); Chrome A → B −9,3 điểm
(−17%). **Các số âm này không có nghĩa là đọc làm Teams, Chrome nhẹ đi:** Bảng 2 cho thấy chúng đến từ xung nhịp. Dấu hiệu ngay trong
bảng này: khi đọc 4 lần mỗi giây, `MSTeams` giảm một nửa %CPU dù không liên quan tới cây web, và hai trình duyệt khách (không bị
đọc) cũng giảm từ 119–122% xuống 107–109% (thời gian CPU tích lũy của mọi tiến trình "Google Chrome" trong các lượt Teams, gồm
cả Chrome của chủ dự án đang nhàn rỗi).

RAM: không thấy phần tăng vượt nhiễu. Teams: A 1 043 → B 1 002 → C 1 006 MB; A3 1 577, B0 1 429, B1 1 381, B3 1 600 MB (sau khi
Teams mở lại, dao động 1 381–1 600 MB, không theo chế độ). Chrome: tiến trình chính 460–510 MB ở mọi chế độ (đo xen kẽ); tổng
RSS của Chrome dao động ±300 MB theo các tab khác (một đoạn không trợ năng tự tăng 450 MB), nên +297 MB của chrome-B so với A nằm
trong dao động. Phép đo này chỉ cho biết phần RAM thêm, nếu có, nhỏ hơn khoảng 0,2 GB với Teams và 0,3 GB với Chrome.

## Bảng 2: đo xen kẽ bằng số lệnh và năng lượng (kết quả chính)

`tro-nang/xen_ke.py`, cùng một cuộc họp, các chế độ xen kẽ, mỗi đoạn 50 s (bỏ 5 s đầu), đều chạy pin. "Xung" là số chu kỳ chia
thời gian CPU (xung hiệu dụng). "Mọi tiến trình" là tổng năng lượng của mọi tiến trình của người dùng đọc được.

**Teams** (bảng People mở; khách nói luân phiên 6 s nói, 2 s nghỉ). Cây trợ năng của Teams đã bật từ trước trong phiên này và
không gỡ được (xem dưới), nên "không đọc" ở đây là cây có sẵn mà không ai đọc; theo Bảng 1, chế độ này (B0) ngang với Teams sạch (A3).

| Đoạn | Chế độ | Teams %CPU | Teams tỉ lệnh/s | Xung | Teams mW | Bộ đọc tỉ lệnh/s, mW | Mọi tiến trình mW |
|---|---|---|---|---|---|---|---|
| 0 | không đọc | 39,5 | 0,908 | 1,90 GHz | 166 | | 820 |
| 1 | đọc 4/s | 35,4 | 2,030 | 2,52 GHz | 511 | 0,280; 79 | 1 111 |
| 2 | không đọc | 38,0 | 0,783 | 1,83 GHz | 117 | | 560 |
| 3 | đọc 1/s | 36,9 | 1,061 | 1,92 GHz | 199 | 0,071; 20 | 611 |
| 4 | không đọc | 36,6 | 0,750 | 1,74 GHz | 105 | | 494 |
| 5 | đọc 4/s | 34,9 | 1,972 | 2,50 GHz | 490 | 0,276; 78 | 1 051 |

So với trung bình ba đoạn không đọc (0,814 tỉ lệnh/s, 129 mW): đọc 4/s thêm **1,19 tỉ lệnh/s (gấp 2,5) và 371 mW cho Teams, cộng
78 mW cho bộ đọc**; đọc 1/s thêm 0,25 tỉ lệnh/s (+30%), 70 mW cho Teams và 20 mW cho bộ đọc. Gần như toàn bộ phần thêm nằm ở
WebView (0,29–0,45 → 1,48–1,54 tỉ lệnh/s); tiến trình chính `MSTeams` chạy cùng số lệnh (0,46 so với 0,49 tỉ/s) nhưng %CPU giảm
một nửa vì lên xung. Hai trình duyệt khách: %CPU 118–132 → 100–101 trong khi số lệnh giữ 2,0–2,1 tỉ/s (đoạn đầu 2,8): cùng hiện
tượng.

**Chrome** (hai cửa sổ Meet; giọng đọc máy nói khoảng 45% thời gian). B0 = đặt `AXEnhancedUserInterface` mà không đọc.

| Đoạn | Chế độ | Chrome %CPU | Chrome tỉ lệnh/s | Xung | Chrome mW | Luồng chính %CPU | Bộ đọc tỉ lệnh/s, mW | Mọi tiến trình mW |
|---|---|---|---|---|---|---|---|---|
| 0 | không bật | 81,7 | 1,310 | 1,38 GHz | 129 | 3,2 | | 425 |
| 1 | đọc 4/s | 47,6 | 3,144 | 2,86 GHz | 1 142 | 26,9 | 0,515; 216 | 1 690 |
| 2 | bật, không đọc | 65,5 | 1,011 | 1,38 GHz | 71 | 2,7 | | 375 |
| 3 | đọc 1/s | 63,2 | 1,578 | 1,61 GHz | 312 | 11,2 | 0,131; 50 | 647 |
| 4 | không bật | 63,1 | 1,014 | 1,26 GHz | 75 | 2,6 | | 343 |
| 5 | đọc 4/s | 47,8 | 3,181 | 2,86 GHz | 1 152 | 27,1 | 0,509; 212 | 1 662 |

So với trung bình hai đoạn không bật (1,16 tỉ lệnh/s, 102 mW): **bật mà không đọc: không thêm gì** (1,01 tỉ lệnh/s, 71 mW); **đọc
4/s: thêm 2,0 tỉ lệnh/s (gấp 2,7), 1 045 mW cho Chrome và 214 mW cho bộ đọc**; đọc 1/s: thêm 0,42 tỉ lệnh/s, 210 mW và 50 mW. Phần
thêm nằm ở tiến trình chính của trình duyệt (0,07–0,09 → 2,23–2,26 tỉ lệnh/s); số lệnh của các tiến trình vẽ và GPU gần như
không đổi (renderer 0,49–0,74 → 0,46–0,48; tiến trình phụ 0,45–0,48 → 0,43–0,46 tỉ/s), nên không có dấu hiệu Chrome vẽ ít khung
hơn; phần giảm %CPU của chúng (34–37 → 12–14%, 25–27 → 9%) là do lên xung. Hai lượt xen kẽ trước đó chỉ đo thời gian CPU
(`chrome-AB`: 3 cặp không bật/đọc 4/s, 60 s; `chrome-M`: không bật, bật không đọc, 1/s, 4/s, không bật) cho cùng hình ảnh: luồng
chính 2,7–2,8% → 26,7–27,1%, tổng %CPU 62–68 → 48–50.

## Thời gian mỗi lượt đọc (`walk_ms`) và thời gian dựng cây

`walk_ms` của `axtrace watch`, chỉ có ở các lần đọc mà cây đổi (bộ đọc chỉ ghi khi đổi), đơn vị ms:

| Cửa sổ | Lượt | Nhịp | Số lần ghi | p50 | p90 | max |
|---|---|---|---|---|---|---|
| Teams, People mở (184 nút, 170 dòng có chữ) | teams-B (cắm) | 4/s | 42 | 51,8 | 60,9 | 66,7 |
| Teams, People đóng (133 nút, 124 dòng) | teams-C (cắm) | 4/s | 39 | 46,0 | 52,4 | 57,5 |
| Teams, People mở | teams-B3 (pin) | 4/s | 128 | 59,1 | 65,2 | 70,5 |
| Teams, People mở | teams-B1 (pin) | 1/s | 91 | 65,4 | 70,7 | 77,4 |
| Teams, People mở | xen kẽ, hai đoạn 4/s | 4/s | 30 + 29 | 54,5; 56,6 | 62,0; 66,8 | 68,7; 69,7 |
| Hai cửa sổ Meet (390 nút, 345 dòng) | chrome-B | 4/s | 138 | 91,9 | 102,4 | 119,2 |
| Hai cửa sổ Meet | xen kẽ, năm đoạn 4/s | 4/s | 83–110 | 93,9–95,9 | 101,6–106,0 | 107,5–119,5 |
| Hai cửa sổ Meet | xen kẽ, hai đoạn 1/s | 1/s | 31; 33 | 120,8; 119,0 | 125,3; 124,6 | 128,8; 132,0 |

Khoảng 0,24–0,35 ms mỗi nút (9 lần gọi mỗi nút). Bộ đọc này vượt giới hạn 30 ms mỗi lượt của §6.2 gấp 1,5–4 lần với cây chỉ
130–390 nút, nên giới hạn 3 000 phần tử không đi cùng 30 ms được nếu đọc theo cách này.

Dựng và gỡ cây (`tro-nang/axprobe`, đếm nút mà không đặt gì):

- Teams vừa mở: chỉ 11–12 nút gốc, không có `AXWebArea`, kể cả khi đọc nhiều lần: đọc không tự bật cây web. Đặt EUI: 184 nút sau
  0,069 s. Đặt lại EUI = false (`axtrace noaccess`, đọc lại thấy 0): cây vẫn đủ 128–133 nút sau 45 s không ai đọc và sau lượt
  `teams-A2` (95 s không đọc), và **vẫn cập nhật** (nhãn mic của khách đổi đúng khi khách bật, tắt mic). Cây chỉ mất khi Teams khởi động lại.
- Chrome lúc đầu: 114–116 nút, không có `AXWebArea` (trợ năng web đang tắt, dù Chrome đã chạy từ 23/10). Đặt
  `AXManualAccessibility`: mã -25205, `AXUIElementIsAttributeSettable` báo không đặt được, sau 96 s vẫn không có cây web. Đặt EUI:
  390 nút (2 `AXWebArea`) sau 2,06 s; các lần bật lại sau đó có cây ở lượt đọc thứ hai (0,25–0,5 s). Đặt lại EUI = false: còn 116
  nút, không `AXWebArea`, sau ≤ 8 s.
- Đặt EUI trên cả hai app trả mã -25208 (`kAXErrorNotImplemented`) dù giá trị thật sự đổi; `axtrace noaccess` in `-25205 -25208`.

## Chỉ báo "đang nói" của Teams khi bảng People đóng (§6.4)

**Theo kế hoạch** (`find_indicators.py` trên `teams-C`, 39 ảnh chụp, dời 0,6 s): dòng tương quan cao nhất của mỗi khách là nhãn
của ô video `AXMenuItem` "<tên> (Guest), Context menu is available" (+0,90 Lan, +0,72 Minh); khi khách tắt mic nhãn thành
"<tên> (Guest), muted, Context menu is available", nên đây chính là nhãn mic. Dòng không phải nhãn mic cao nhất: `AXGroup` /
`AXEmptyGroup`, không id, lớp `fui-Flex vdi-frame-occlusion ___1vvhwjq …` (+0,35 Lan, +0,25 Minh); còn lại ≤ 0,30. Theo đúng tiêu
chí của kế hoạch (≥ 0,6, không phải nhãn mic) thì **không** có. Lý do: dòng này không có tên và giống hệt nhau ở mọi ô, nên khi gộp
theo nội dung dòng thì "Lan nói" và "Minh nói" thành một dòng; và mỗi ảnh chụp chỉ có khi cây đổi.

**Theo ô** (`tro-nang/o_dang_noi.py teams`, lưới 0,25 s, dời 0,6 s): ô là `AXMenuItem` có mô tả bắt đầu bằng tên khách; chỉ báo là
có một con (độ sâu ô + 1, nằm sau nhóm chứa chữ tên, là con cuối của ô) `AXGroup`/`AXEmptyGroup`, không id, không chữ, lớp
`vdi-frame-occlusion`. Phần tử này chỉ có mặt khi người trong ô đang nói (như khung viền sáng quanh ô).

| Lượt | People | Khách | Khung: r, khớp | Nhãn mic: r, khớp | Khung hiện sau lúc bật mic (trung vị) | Nhãn đổi sau lúc bật mic | Khung mất sau lúc tắt mic |
|---|---|---|---|---|---|---|---|
| teams-C | đóng | Lan | +0,89; 95% | +1,00; 100% | 1,28 s | 0,63 s | 0,67 s |
| teams-C | đóng | Minh | +0,92; 97% | +0,98; 99% | 1,26 s | 0,71 s | 0,61 s |
| teams-B | mở | Lan | +0,91; 96% | +0,99; 99% | 1,17 s | 0,66 s | 0,70 s |
| teams-B | mở | Minh | +0,91; 96% | +0,99; 99% | 1,22 s | 0,72 s | 0,61 s |
| teams-B3 | mở | Lan | +0,94; 97% | +0,97; 99% | 0,79 s | 0,61 s | 0,52 s |
| teams-B3 | mở | Minh | +0,97; 99% | +0,97; 99% | 0,76 s | 0,51 s | 0,61 s |

(7 lần bật mic của Lan và 6 của Minh mỗi lượt.) Vì sao đây là chỉ báo nói chứ không phải nhãn mic: (1) là phần tử riêng, không phải
chữ của nhãn; (2) luôn hiện **sau** nhãn mic 0,2–0,65 s, tức là Teams phải nghe thấy tiếng; (3) lúc nói chồng (`teams-C`, 67,8 s)
cả hai ô có khung; (4) ô của chủ phòng (mic tắt) không lần nào có. Khi tắt mic, khung mất cùng lúc với nhãn. Điều **chưa** chứng
minh: khách trong phép thử luôn có tiếng khi mở mic (file giọng lặp lại), nên chưa thấy khung tắt khi mic mở mà im lặng.

Khi bảng People mở, chỉ báo ở bảng People vẫn như nghiên cứu trước: `AXGroup` id `roster-avatar-img-*` có lớp
`fui-StyledText ___ansmq00 fhuq1gn` khi nói, `___jc9uze0 f71fsbu` khi không (`find_indicators.py` trên `teams-B`: +0,67 Lan, +0,68
Minh; theo lưới thời gian +0,90, +0,91).

**Meet (thêm, cùng các bản ghi đo chi phí):** mỗi ô theo thứ tự cây có nhóm lớp `DYfzY cYKTje <mức>` (thanh âm lượng) rồi nhóm
`qg7mD …` (thêm lớp `BlxGDf` khi nói) rồi chữ tên. `find_indicators.py` trên `chrome-B`: dòng không tên cao nhất là nhóm `qg7mD`
có `BlxGDf` (+0,36). Theo ô (`o_dang_noi.py meet`, 4 bản ghi đọc 4/s): chỉ **một** ô đổi, là ô của người nói trong chính cửa sổ
của nó (cửa sổ có nút "Tắt micrô"): `BlxGDf` r = +0,43 đến +0,62, khớp 69–80%; thanh âm lượng đổi ≥ 2 lần trong 1 s: r = +0,46 đến
+0,60, khớp 73–80% (dưới ngưỡng 0,6 ở 3 trên 4 bản ghi). Ô của người nói trong cửa sổ chủ phòng không đổi lần nào trong phiên này,
khác nghiên cứu trước; chưa rõ vì sao (cùng một tài khoản vào hai lần).

## Kết luận cho spec

**§6.4 (Teams, bảng People đóng):** ô video **có** chỉ báo nói dò được, không phải nhãn mic: phần tử con không tên trong cùng ô với
chữ tên, xuất hiện khi người đó nói (lớp `vdi-frame-occlusion`), khớp 95–97% với dời 0,6 s, ổn định cả khi bảng People mở. Đề
xuất: tín hiệu 2 ("hành vi") của Teams dùng neo là **ô video** (phần tử con của `AXMenuItem` có tên, có mặt khi nói), đúng kiểu tự
hiệu chỉnh của §6.5 (không cần biết tên lớp); bảng People thành tín hiệu bổ sung khi đang mở; mẹo "mở bảng Người tham gia" không
còn cần. Trước khi dựa hẳn vào nó nên thử thêm: khách mở mic mà im lặng, cuộc họp đông hơn số ô hiển thị (người không có ô), có
video, và Teams tài khoản công việc.

**§6.8 (bật suốt phiên hay chỉ quanh lượt đọc):**

1. **Bật suốt phiên** (khi gặp cửa sổ họp), đặt lại false khi dừng phiên như §6.2. Lý do: bật mà không đọc không tốn gì đo được;
   Teams không gỡ cây khi đặt lại false (bật một lần là bật tới khi Teams khởi động lại, nên "bật quanh lượt đọc" không có tác dụng);
   Chrome gỡ cây được nhưng dựng lại mất 0,25–2 s, quá chậm cho nhịp 0,25–1 s. Với Chrome, đặt lại false khi dừng phiên có tác dụng
   thật; với Teams chỉ để trả trạng thái.
2. **Chi phí nằm ở số lần đọc nhân với số phần tử đọc mỗi lần.** Đọc cả cửa sổ 4 lần mỗi giây như bộ đọc thử là quá đắt để chạy suốt
   phiên: thêm khoảng 0,45 W (Teams) đến 1,26 W (Chrome, hai cửa sổ Meet), luồng chính Chrome bận 27% một lõi, mỗi lượt 46–121 ms
   (vượt 30 ms). Đọc 1 lần mỗi giây thì 0,09–0,26 W.
3. **Khuyến nghị cho bộ đọc của kế hoạch 02:** (a) không đọc cả cửa sổ ở nhịp nhanh: tìm ô và neo cạnh tên bằng một lượt đầy đủ mỗi
   vài giây (hoặc khi cây đổi cấu trúc), rồi ở nhịp nhanh chỉ đọc các phần tử chỉ báo đã biết (vài chục phần tử, ít thuộc tính, gom
   bằng `AXUIElementCopyMultipleAttributeValues`); (b) nhịp mặc định 1 lần mỗi giây, 4 lần mỗi giây chỉ khi có tiếng nói và đang cần
   gán tên (§6.2 đã chia 4/1 theo tiếng; nên siết thêm điều kiện "đang cần"); (c) thử `AXObserver` (thông báo đổi giá trị) thay cho
   hỏi vòng (chưa đo). **Số đo này chưa đủ để chốt nhịp cho bộ đọc thật**, vì chi phí phụ thuộc cách đọc; cần đo lại bằng bộ đọc
   của kế hoạch 02 với mục tiêu ≤ 30 ms mỗi lượt và phần năng lượng thêm cỡ vài chục mW.
4. **Sửa §6.2 cho Chrome:** dùng `AXEnhancedUserInterface` thay `AXManualAccessibility` (Chrome 156 không nhận thuộc tính sau), bỏ câu
   "trình duyệt không cho đặt lại; còn bật tới khi khởi động lại trình duyệt" (với EUI, Chrome gỡ cây khi đặt lại false). Edge chưa
   kiểm. EUI có tác dụng phụ đã biết với cửa sổ của một số app (hiệu ứng, kéo cửa sổ); trong lúc đo tôi không thấy gì lạ nhưng
   không kiểm có chủ đích. Chính sách quyền riêng tư và trang hỗ trợ (§6.8) nên nói: với trình duyệt, trợ năng chỉ bật khi đang dịch có
   cửa sổ Meet; với Teams, đã bật thì còn bật tới khi Teams khởi động lại (không tốn gì khi không ai đọc).
5. Đo tải ở §11 phải dùng số lệnh hay năng lượng, không dùng %CPU: thêm tải làm chip lên xung, %CPU của mọi tiến trình khác giảm theo.

## Giới hạn

- Một máy, một phiên. Bảng 1: mỗi cấu hình một lượt 95 s; Bảng 2: mỗi chế độ 1–3 đoạn 50 s. Nguồn điện đổi giữa chừng (cắm → pin);
  chỉ so trong cùng nguồn.
- Không phải họp thật: giọng đọc máy, khách tự động (Teams, 3 người), một tài khoản vào hai cửa sổ (Meet); không ai bật camera.
  Có video hay họp đông thì cây lớn hơn và chi phí đọc lớn hơn.
- Bộ đọc là `axtrace` (đọc mọi nút, 9 thuộc tính, mỗi thuộc tính một lần gọi), không phải bộ đọc thật; con số chi phí đọc là cận
  trên cho cách đọc thô này.
- Năng lượng là ước tính của nhân macOS (`ri_energy_nj`), dùng để so tương đối giữa các đoạn; không đo bằng `powermetrics` (cần sudo).
- Teams: trong đo xen kẽ cây đã bật sẵn, "không đọc" ngang với Teams sạch chỉ dựa vào Bảng 1 (B0 so với A3, %CPU, cùng nguồn pin).
- Chrome: số là tổng mọi tiến trình Chrome của chủ dự án, gồm các tab khác; RAM không tách được phần của trợ năng.
- Chỉ báo Teams: chưa thử mic mở mà im lặng. Chỉ báo Meet: ô ở cửa sổ chủ phòng không đổi, chưa giải thích được.
- Không đo trực tiếp hiệu ứng lên khung hình (giật, chậm) của Teams hay Meet; chỉ suy từ số lệnh của tiến trình vẽ (không giảm).

## Khác kế hoạch

- **Lượt A của Teams** chạy `run_schedule.py` bản sửa không chạy `axtrace watch` (kế hoạch để watch nhịp 1 s; `axtrace` luôn đặt
  `AXManualAccessibility` nên lượt đó không còn là "chưa bật"). Chỉ khác ở dòng tạo tiến trình watch.
- **Không khởi động lại Chrome:** `session.restore_on_startup` của cả hai hồ sơ đang dùng không được đặt (mặc định, khác 1), nên theo
  điều kiện được giao tôi không khởi động lại. Nhưng Chrome lúc đầu không có cây web (đếm nút không đặt gì), nên lượt A sạch vẫn làm
  được. Lượt B theo kế hoạch (`AXManualAccessibility`) không dựng được cây, đổi tên thành `chrome-Bman`, làm lại bằng EUI.
- **Teams khởi động lại một lần** (khoảng 17:05, sau khi đã rời cuộc họp, không trong cuộc gọi) để có đường cơ sở sạch thứ hai (`teams-A3`),
  sau khi thấy Teams không gỡ cây khi đặt lại false. Thêm các lượt B0, B1, A2 và đo xen kẽ bằng `rus` (số lệnh, năng lượng) khi thấy
  %CPU đi ngược.
- `find_indicators.py` (đúng mã kế hoạch) không bắt được chỉ báo ô video; thêm `tro-nang/o_dang_noi.py` phân tích theo ô.
- Khách Teams vào bằng trình duyệt: trang "launcher" của đường dẫn mời không còn chuyển sang trình duyệt khi bấm "Continue on this
  browser" trong Chrome tự động, đường `teams.live.com/_#/meet/…` trả `API_DEPRECATED`; vào được bằng
  `https://teams.live.com/v2/?meetingjoin=true#/meet/<mã họp>?p=<mật mã>&anon=true` (trang `light-meetings`). Ô "Join now" và các
  công tắc của khách đôi khi phải bấm bằng `element.click()` qua `/eval`.

## Chạy lại

Công cụ: `truoc-spec/doc-ten/` (`axtrace`, `guests.py`, `run_schedule.py`), `cpu_sample.py`, `find_indicators.py`, `tro-nang/`
(`axprobe.swift`, `rus.swift`, `xen_ke.py`, `o_dang_noi.py`). Tiến trình chạy phải có quyền Trợ năng. Lưu âm lượng trước khi phát
giọng và trả lại sau.

```sh
cd $B/truoc-spec/doc-ten && swiftc -O -o axtrace axtrace.swift     # và tạo audio/lan.wav, audio/minh.wav như kế hoạch, Step 3
cd $B/tro-nang && swiftc -O -o axprobe axprobe.swift && swiftc -O -o rus rus.swift
# Teams: chủ phòng vào họp (mic, camera tắt); khách: $DATA/venv/bin/python -I guests.py & rồi /open, /fill, /click như trên; nhận vào
./axprobe count <pid MSTeams> '^Meeting'                             # Teams sạch: ~12 nút, 0 AXWebArea
$DATA/venv/bin/python -I $B/cpu_sample.py 95 $DATA/out/teams-A.csv MSTeams "Teams WebView"   # song song với run_schedule.py
AXTRACE_PID=<pid MSTeams> DATA=$DATA $DATA/venv/bin/python -I xen_ke.py teams teams-R 50 A,B4,A,B1,A,B4
# Chrome: hai cửa sổ Meet cùng tài khoản (chủ phòng tắt mic, camera; người nói mở mic), loa ~45%
./axprobe settable <pid Chrome> AXManualAccessibility; ./axprobe time <pid Chrome> AXEnhancedUserInterface '^Meet' 300
AXTRACE_PID=<pid Chrome> DATA=$DATA $DATA/venv/bin/python -I xen_ke.py chrome chrome-R 50 A,B4,B0,B1,A,B4
# Chỉ báo
cd $B && $DATA/venv/bin/python -I find_indicators.py truoc-spec/doc-ten/out/teams-C-watch.jsonl truoc-spec/doc-ten/out/teams-C-truth.json
$DATA/venv/bin/python -I tro-nang/o_dang_noi.py teams truoc-spec/doc-ten/out/teams-C-watch.jsonl truoc-spec/doc-ten/out/teams-C-truth.json
$DATA/venv/bin/python -I tro-nang/o_dang_noi.py meet truoc-spec/doc-ten/out/chrome-B-watch.jsonl truoc-spec/doc-ten/out/chrome-B-truth.json
```

Số trong bảng: `$DATA/out/<lượt>.csv` (Bảng 1, đoạn Python của Step 9), `$DATA/out/teams-R.json`, `chrome-R.json` (Bảng 2),
`walk_ms` trong `truoc-spec/doc-ten/out/*-watch.jsonl`.

## Dọn

Chủ phòng đã rời mọi cuộc họp (ba lần vào Teams, hai lần vào Meet); khách đã rời và `guests.py` đã thoát; đã đóng các cửa sổ Meet mở thêm.
Âm lượng trả về mức trước đo (ra 88, vào 47; Teams đã tự nâng mức vào lên 100 trong cuộc gọi). Teams: EUI = false nhưng cây trợ
năng vẫn sống tới lần khởi động lại Teams sau (không tốn gì đo được khi không ai đọc); cửa sổ chính thu nhỏ như lúc đầu. Chrome:
EUI = false, đã gỡ cây (không có `AXWebArea`). Camera không bật trong cuộc họp nào (kiểm bằng `kCMIODevicePropertyDeviceIsRunningSomewhere`
trước mỗi ảnh chụp); ở màn hình chờ của Meet, xem trước camera tự bật khoảng 1–3 s mỗi lần mở cửa sổ (4 lần) trước khi tôi tắt
bằng ⌘E, không truyền đi.
