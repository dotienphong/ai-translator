# Gợi ý bật dịch khi có cuộc họp (thiết kế)

Ngày 2026-11-01. Trạng thái: **đã duyệt (2026-11-01); đã viết mã cho Windows, chờ thử trên máy Windows thật**. Đã kiểm trên Linux: toàn bộ logic (crate `meeting-scan`, 39 test), cài đặt, lệnh, giao diện, 5 ngôn ngữ (`tsc`, `vitest`). Chưa biên dịch được ở môi trường soạn thảo (Linux): mã `cfg(windows)` (`audio_capture::windows::output_levels`, `meeting_scan::win`, `meeting_hint::sensor`, `meeting_hint::window`) và `acl_tests`; cần `cargo check`, `cargo test` trên Windows. Phạm vi dự kiến: `src-tauri/src/meeting_hint/` (mới), `src-tauri/src/settings/`, `src-tauri/src/tray.rs`, `crates/audio-capture`, `crates/speaker-worker` (chỉ chuyển mã dùng chung), `src/windows/hint/` (mới), `src/i18n/`, `docs/legal/`.

## 1. Mục tiêu

Hiện người dùng phải tự bấm phím tắt hoặc vào app bấm Bắt đầu mới có phụ đề. Khi họp trên Teams, Zoom hay Google Meet, app tự nhận ra cuộc họp đang có tiếng và hiện một cửa sổ nhỏ cạnh icon khay hỏi "Bật dịch?". Người dùng bấm một lần là dịch chạy. App **không tự bật dịch**.

Chủ dự án chốt (2026-11-01): chỉ Teams, Zoom, Google Meet (không Zalo, không Messenger); tín hiệu là app họp đang phát tiếng ra loa; Meet chạy trong trình duyệt nên đọc tiêu đề cửa sổ; kiểu gợi ý là cửa sổ nhỏ cạnh khay (kiểu A trong bản vẽ); **tạm thời chỉ làm cho Windows, macOS làm sau**; mặc định **bật**; ngưỡng tiếng liên tục **5 giây**; phải chạy được cả Teams, Meet và Zoom.

## 2. Khi nào gợi ý

Gợi ý khi **đủ cả bốn** điều kiện:

1. Một app họp **có mặt**: Teams hay Zoom có cửa sổ đang hiện hoặc đang có phiên âm thanh gán được về nó; Google Meet chỉ khi có cửa sổ Chrome hay Edge mà tiêu đề trang bắt đầu bằng "Meet -" hay "Meet –" (mục 3). YouTube hay trang khác trong cùng trình duyệt không có tiêu đề đó nên không bao giờ gợi ý.
2. App họp đó đang **phát tiếng ra loa** liên tục: cứ 500 ms đọc đỉnh âm lượng của phiên âm thanh thuộc app; trong cửa sổ trượt 5 giây, ít nhất 75% số mẫu có đỉnh lớn hơn 0,01. Tiếng "ting" thông báo ngắn không đủ.
3. App đang rảnh: không có phiên dịch (đang bắt đầu, đang chạy), không đang tải model, `capture_mode` có thu âm thanh máy (`playback` hay `both`; chế độ `mic` thì không gợi ý).
4. Cuộc họp này chưa được hỏi và app họp này chưa bị tắt gợi ý (mục 4).

## 3. Cách nhận biết (Windows; không đọc thêm gì ngoài danh sách viết cứng)

Mã nằm ở crate mới `crates/meeting-scan` (phần thuần Rust, test trên mọi nền tảng) và `audio_capture::windows::output_levels` (đọc phiên âm thanh).

- **Phiên âm thanh:** liệt kê phiên của thiết bị phát mặc định (`IAudioSessionManager2`), lấy tiến trình của từng phiên (`IAudioSessionControl2::GetProcessId`) và đỉnh âm lượng (`IAudioMeterInformation`), kèm đỉnh của chính thiết bị. Chỉ xét phiên đang hoạt động; đỉnh từ 0,01 trở lên mới tính là có tiếng.
- **Gán phiên về app họp:** lần theo cây tiến trình cha (tối đa 4 cấp, bảng tiến trình dựng bằng ảnh chụp `CreateToolhelp32Snapshot`, chỉ giữ số hiệu, số hiệu cha và tên file) cho tới khi chính tiến trình hay một tổ tiên là file chạy trong danh sách viết cứng (`MeetingApp::windows_exe`: `ms-teams.exe`, `Zoom.exe`, `chrome.exe`, `msedge.exe`). Nhờ vậy tiếng phát từ `msedgewebview2.exe` con của `ms-teams.exe` (Teams mới), hay từ tiến trình dịch vụ âm thanh của trình duyệt, đều gán về đúng app. WebView2 của app khác (Spotify…) không gán về app họp nào.
- **App họp có mặt:** Teams, Zoom: có cửa sổ cấp cao nhất đang hiện của file chạy đó, hoặc đang có phiên âm thanh gán được. Meet: có cửa sổ của Chrome hay Edge mà tiêu đề bắt đầu bằng "Meet" rồi " - " hay " – " (`hint::is_meet_title`). Tiêu đề chỉ được đọc cho cửa sổ của Chrome và Edge; cửa sổ của mọi app khác không bao giờ bị đọc tiêu đề (có test đếm lần gọi). Tiêu đề không được lưu: chỉ giữ kết quả có hoặc không.
- **Không dựa vào công thức nhận giọng** để biết có họp hay không: file công thức đi kèm app chỉ có Teams, còn Zoom và Meet chỉ có khi tải thêm (và chỉ tải khi bật nhận giọng), nên gợi ý không phụ thuộc công tắc "Phân biệt người nói" hay manifest `speaker`. Công thức chỉ dùng cho **dự phòng** của Teams và Zoom (dòng dưới).
- **Dự phòng cho Teams và Zoom:** nếu không phiên nào gán được về bất kỳ app họp nào, thiết bị phát có tiếng, và app có cửa sổ họp theo công thức đang có (`winscan`, `is_meeting_window`), thì tính app đó có tiếng. Cho phép Teams chạy được ngay cả khi cách gán tiến trình trượt trên một bản Teams nào đó. Không áp cho trình duyệt (cửa sổ Meet bỏ ngỏ cạnh nhạc không phải là họp), và không bật khi Teams chỉ mở sẵn mà Spotify đang phát (không có cửa sổ họp theo công thức).
- **Xét theo từng trình duyệt:** Meet mở ở Edge, YouTube phát ở Chrome thì không gợi ý. Chrome và Edge là một app Google Meet khi tắt gợi ý ("Không hỏi lại với Google Meet" áp cho cả hai).
- **Chu kỳ:** chỉ chạy khi gợi ý bật **và** app đang rảnh; có phiên dịch thì dừng hẳn. Lấy mẫu âm lượng mỗi 500 ms; quét cửa sổ mỗi 2 giây khi đã thấy app họp, mỗi 5 giây khi chưa. Bảng tiến trình chỉ dựng khi có phiên đang có tiếng.
- **Hết cuộc họp:** app họp mất mặt hơn một phút, hay im tiếng hơn một phút. Mất mặt ngắn hơn (đổi tab trình duyệt) không tính là hết họp.
- **macOS: chưa làm** (chủ dự án 2026-11-01). Khi làm sẽ dùng `audio_capture::macos::audio_apps()` so với `MeetingApp::macos_bundle_id`, và Meet cần quyền Trợ năng. Mã mới đặt sau `cfg(windows)`; máy trạng thái (`hint`) và bộ quan sát (`probe`) thuần Rust để dùng lại.
- **Cần thử trên máy thật (chủ dự án):** Teams mới, Teams cũ (nếu còn dùng), Zoom, Meet trên Chrome và Edge: có hiện sau khoảng 5 giây có tiếng không. Log ghi số phiên thấy, số phiên gán được, app có mặt, app có tiếng (không có tên cuộc họp).
- **Chuyển mã:** `winscan` và `is_meeting_window` chuyển từ `speaker-worker` sang `meeting-scan` (speaker-worker dùng lại, hành vi không đổi, test đi theo).

## 4. Luật gợi ý

- **Mỗi cuộc họp hỏi một lần**, tính theo app. Hết cuộc họp (app họp mất mặt, hoặc im tiếng liên tục 60 giây) thì cuộc họp sau hỏi lại.
- **Bật dịch:** chạy như bấm phím tắt Bắt đầu (`actions::run_hotkey(app, HotkeyAction::ToggleSession)`), đóng cửa sổ gợi ý. Thiếu model, hết hạn gói, hay lỗi khác thì hiện đúng lỗi như khi bấm Bắt đầu ở cửa sổ chính.
- **Bỏ qua** (hoặc tự đóng sau 15 giây không ai bấm): đóng cửa sổ, coi cuộc họp này đã hỏi. Tự đóng sau 15 giây không ghi vào "đã tắt".
- **Không hỏi lại với <app>:** lưu app vào `meetingHint.ignoredApps`; gỡ lại ở Cài đặt › Chung.
- Người dùng tự bắt đầu dịch (phím tắt, menu khay, nút) khi cửa sổ gợi ý đang hiện: đóng cửa sổ ngay.
- Chỉ một cửa sổ gợi ý cùng lúc. Nhiều app họp cùng có tiếng: theo thứ tự `MeetingApp::ALL`.

## 5. Cửa sổ gợi ý

- Cửa sổ riêng, nhãn `hint`, cỡ cố định 296×168 px logic, không viền, luôn nổi, **không lấy focus** của app họp (cùng kỹ thuật với ô Gõ dịch: macOS NSPanel không kích hoạt, Windows `WS_EX_NOACTIVATE`; spec 2026-10-17-go-dich §3.1). Không hiện trên taskbar.
- **Vị trí:** Windows: sát góc dưới phải vùng làm việc của màn hình có icon khay, ngay trên taskbar, mũi tên chỉ vào icon (dùng `TrayIcon::rect` khi có, không có thì lấy góc). macOS: ngay dưới menu bar, gần icon. Dùng lại `overlay/placement.rs` cho phần chọn màn hình và chống tràn.
- **Nội dung** (bản vi): tiêu đề "Đang họp trên Microsoft Teams" (tên app: Microsoft Teams, Zoom, Google Meet), mô tả "Bật phụ đề dịch trực tiếp cho cuộc họp này?", nút **Bật dịch** (chính) và **Bỏ qua**, dòng nhỏ **Không hỏi lại với Teams** và nút đóng ✕ (cùng nghĩa Bỏ qua). Đủ năm ngôn ngữ vi/en/ja/zh/ko; bản ja/zh/ko chưa có người bản ngữ duyệt như các chuỗi khác.
- Không chứa tiêu đề cuộc họp hay tên người: chỉ có tên app.
- Giao diện React ở `src/windows/hint/`, cùng token CSS và i18n như các cửa sổ khác. Có `hint.html` làm điểm vào như `compose.html`, `overlay.html`.
- **Quyền (ACL):** `capabilities/hint.json` chỉ cấp ba lệnh `meeting_hint_view`, `meeting_hint_accept`, `meeting_hint_dismiss(ignoreApp)`; cập nhật `acl_tests.rs` để cửa sổ này không gọi được lệnh nào khác.

## 6. Cài đặt và quyền riêng tư

- Cài đặt mới `meetingHint`: `enabled` (bool) và `ignoredApps` (danh sách `MeetingApp`). Đặt ở Cài đặt › Chung: công tắc "Gợi ý bật dịch khi có cuộc họp" và danh sách app đã tắt, có nút gỡ. File cài đặt cũ chưa có nhóm này lấy mặc định (`migrate::load`), không cần bước migrate. Menu khay: không thêm mục.
- **Mặc định **bật** (chủ dự án chốt 2026-11-01).**
- **Cam kết:** việc nhận biết chạy hoàn toàn trên máy, không gửi gì đi. Không ghi tiêu đề cửa sổ, tên người, đường dẫn file chạy vào đĩa hay log; log chỉ có số liệu (số phiên âm thanh thấy, số phiên gán được về app họp, kết quả gợi ý: hiện, bật, bỏ qua, tự đóng, tắt app). Báo cáo lỗi tự động không có thêm trường nào chứa tên app họp trừ khi đã có sẵn.
- **Chính sách quyền riêng tư:** cập nhật `docs/legal/privacy.vi.md` và `privacy.en.md` (nêu: app kiểm tra app họp đang chạy và có tiếng để gợi ý, chỉ trên máy, tắt được) và ghi vào changelog pháp lý theo quy trình hiện có, trước khi phát hành bản có tính năng này.

## 6b. An toàn: không được làm hỏng hay sập app (yêu cầu của chủ dự án 2026-11-01)

- **Bản release đặt `panic = "abort"`:** một lần panic ở bất kỳ luồng nào là sập cả app. Vì vậy `meeting-scan` và `meeting_hint` cấm `unwrap`, `expect`, chỉ số mảng, `panic!`, `unreachable!` bằng lint `clippy` (`deny`, trừ test); máy trạng thái dùng ba trường có tên thay vì mảng có chỉ số; mọi lỗi Win32, COM chỉ thành giá trị rỗng và một dòng log; khóa bị nhiễm độc thì dùng tiếp; trạng thái thiếu thì bỏ qua lượt lấy mẫu.
- **Không làm hỏng khởi động:** `meeting_hint::install` không bao giờ trả lỗi (không tạo được luồng thì ghi log và tắt tính năng). Cửa sổ gợi ý **không tạo lúc khởi động** mà tạo lần đầu cần hiện: không tốn bộ nhớ hay thời gian khởi động nếu không có cuộc họp, không tạo được thì chỉ ghi log.
- **Không đụng tới chức năng cũ:** chỉ đọc (phiên âm thanh, tiến trình, cửa sổ); không mở luồng âm thanh, không đổi cấu hình âm thanh, không gửi gì vào app họp. Chạy ở luồng riêng, chỉ khi gợi ý bật **và** app rảnh (không có phiên dịch, không nạp model); có phiên dịch thì không quét gì. Khi lỗi đọc âm thanh liên tiếp (máy không có loa) thì thưa ra 10 giây một lần. "Bật dịch" chỉ bắt đầu phiên nếu app còn rảnh, kẻo phím chuyển đổi dừng nhầm phiên người dùng vừa tự bật.
- **Tắt được:** Cài đặt › Chung. Cài đặt cũ chưa có nhóm `meetingHint` tự nhận mặc định (đã có test).

## 7. Không làm

- Không tự bật dịch (kể cả có công tắc), không dịch ngầm khi chưa bấm.
- Không nhận biết Zalo, Messenger, Slack huddle, Discord, Google Chat…; không nhận biết họp qua micro đang mở.
- Không gợi ý khi chỉ có YouTube, nhạc, video thường.
- Không thông báo hệ thống (toast), không đổi quyết định Q13.
- Không xin thêm quyền Trợ năng chỉ để gợi ý Meet trên macOS.

## 8. Kiểm thử

Đã có (chạy trên mọi nền tảng, `cargo test -p meeting-scan`): 39 test đơn vị và 21 test kịch bản từ đầu tới cuối (`tests/scenarios.rs`) mô phỏng cây tiến trình, phiên âm thanh, cửa sổ và tiêu đề như máy Windows thật, cho từng app: **Teams** (cuộc gọi, cuộc họp có tên tự đặt, cửa sổ ẩn xuống khay, tiếng từ WebView2 con, dự phòng khi không gán được tiến trình, Teams mở sẵn mà Spotify phát nhạc, tiếng "ting" thông báo), **Zoom** (tiếng từ tiến trình chính và tiến trình phụ, chưa vào họp), **Google Meet** (Chrome, Edge, tên cuộc họp tự đặt, YouTube cùng trình duyệt, Meet ở Edge mà YouTube ở Chrome, Gmail có tiếng báo, đổi tab rồi quay lại, hai cuộc họp liên tiếp); cùng một test ngẫu nhiên 400 000 lần lấy mẫu kiểm các bất biến an toàn (chỉ hiện khi bật, rảnh, app không bị tắt; không bao giờ hai cửa sổ cùng lúc; đóng ngay khi không còn cần). Đã thử phá logic có chủ ý (bỏ điều kiện dự phòng, nhận mọi tiêu đề là Meet, bỏ ngưỡng, hỏi lại mỗi lần, không lần theo tiến trình cha, ngưỡng 1 giây, tiếng trình duyệt đủ để có mặt): mỗi lỗi đều làm ít nhất một test đỏ.

**Công cụ kiểm trên máy thật:** `cargo run -p meeting-scan --example hint_probe --release` (Windows) in mỗi 500 ms những gì app thấy (tên tệp chạy của từng phiên âm thanh, đỉnh, app họp gán được, app có mặt, app có tiếng, `=> GỢI Ý` khi sẽ hiện). Chủ dự án chạy khi họp Teams, Zoom, Meet để xác nhận trước khi phát hành.

Kế hoạch ban đầu:

- **Test Rust (mọi nền tảng):** máy trạng thái gợi ý thuần (giờ giả, đầu vào là danh sách phiên âm thanh và cửa sổ họp giả): cửa sổ trượt 5 giây và ngưỡng 75%; tiếng ngắn không gợi ý; YouTube trong Chrome không gợi ý; mỗi cuộc họp một lần; im 60 giây thì cuộc họp sau hỏi lại; app trong `ignoredApps` không gợi ý; có phiên dịch hay chế độ micro thì không gợi ý; nhiều app cùng có tiếng theo thứ tự ưu tiên; tự đóng 15 giây không thêm vào "đã tắt". Test gán tiến trình con về app cha bằng cây tiến trình giả.
- **Test quyền riêng tư:** tiêu đề chỉ được hỏi cho file chạy trong danh sách viết cứng (test giả `Desktop` đếm số lần gọi `title`); không có chuỗi tiêu đề nào xuất hiện trong log (giống test của `winscan`).
- **ACL:** `acl_tests.rs` bắt cửa sổ `hint` gọi lệnh ngoài ba lệnh trên.
- **i18n:** test từ điển có sẵn bắt thiếu khóa `hint.*` ở ngôn ngữ nào.
- **Giao diện:** test vitest cho phần chọn nội dung (tên app, nút) và cho store.
- **Tay trên Windows (chủ dự án làm, tôi không có máy Windows):** họp thật trên Teams, Zoom, Meet (Chrome và Edge) → cửa sổ hiện cạnh khay sau khoảng 5 giây có tiếng, không cướp focus của app họp; YouTube không làm hiện; bấm Bật dịch thì phụ đề chạy; Bỏ qua thì cuộc họp đó không hỏi lại; Không hỏi lại với Teams có hiệu lực qua lần mở app sau; xem log không lộ tiêu đề.

## 9. Quyết định của chủ dự án (2026-11-01)

1. Mặc định **bật**. Vì vậy chính sách quyền riêng tư phải cập nhật trước khi phát hành (mục 6).
2. Ngưỡng tiếng liên tục **5 giây** (mục 2).
3. Phải làm cho cả Teams, Meet và Zoom: cách gán tiến trình qua cây tiến trình cha và dự phòng bằng tiếng của thiết bị phát (mục 3).
4. Chỉ Windows ở bản đầu; macOS để sau.
