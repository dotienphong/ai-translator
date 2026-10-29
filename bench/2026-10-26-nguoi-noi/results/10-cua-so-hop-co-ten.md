# 10. Cuộc họp Teams có tên tự đặt: nhận cửa sổ họp theo AXSubrole

Ngày 2026-10-29, macOS 26.6, Teams 26276, bản ghi trên cuộc họp thật với hai khách tự động ("Khách An", "Khách Bình") và chủ phòng.

## Lỗi

Công thức Teams nhận cửa sổ họp bằng `window_title` ("Meeting with ...", "Cuộc họp với ..."). Cuộc họp có tên tự đặt có cửa sổ họp mang chính tên cuộc họp, nên không khớp và bộ đọc kẹt `NoMeeting`. Nới `window_title` thành `.+` thì cửa sổ chính (lớn) bị quét liên tục.

## Cái đo được trên Teams thật (System Events, AXSubrole)

| Trạng thái cuộc họp | Cửa sổ | AXSubrole | Nội dung AX |
|---|---|---|---|
| cửa sổ họp đang thu nhỏ (minimized) | "Meeting compact view \| <tên>" | `AXSystemDialog` | có nút Leave, ghi chú "<tên> is speaking" ("Nobody is speaking"), nhưng ô người tham dự là `AXMenuItem` **không nhãn** (không đọc được tên từ ô) |
| | "<tên cuộc họp>" | `AXDialog` | **rỗng**: Chromium không dựng cây web của cửa sổ thu nhỏ |
| | "Meet" (cửa sổ chính) | `AXStandardWindow` | không phải họp |
| cửa sổ họp đang hiện | "<tên cuộc họp>" | **`AXStandardWindow`** | đủ: ô người tham dự có nhãn "Tên (Guest), Context menu is available", nút Leave |
| | "Meet" (cửa sổ chính) | `AXStandardWindow` | không phải họp |

Điều rút ra: `AXDialog` chỉ là cửa sổ họp lúc đã thu nhỏ, khi đó không có gì để đọc. Cửa sổ họp đọc được luôn là `AXStandardWindow`, cùng vai trò phụ với cửa sổ chính, nên vai trò phụ không tự phân biệt được hai cửa sổ.

## Cách sửa

- Công thức có trường tùy chọn `window_subrole` (danh sách mẫu regex, chỉ macOS, bắt buộc đi kèm `confirm_id`). Teams/macos: `["^AXStandardWindow$"]`, giữ luật tiêu đề cũ; `version` 2, `min_app_version` 0.3.4.
- Bộ đọc chỉ lấy tên khi thấy phần tử `confirm_id` (nút Leave) trong cửa sổ (cổng đã có). Cửa sổ chỉ nhận nhờ vai trò phụ mà lượt đầy đủ không thấy Leave được ghi nhớ "không phải họp": nghỉ đọc 30 giây hoặc tới khi tiêu đề đổi (hằng `SUBROLE_REPROBE`). Cửa sổ chính không bị quét mỗi 3 giây.
- Số cửa sổ họp tối đa mỗi app ở macOS từ 2 lên 3 (cửa sổ họp, cửa sổ chính, một cửa sổ rời).
- Cửa sổ nổi thu gọn (`AXSystemDialog`) và hộp thoại `AXDialog` không do luật này nhận: không có tên để đọc.
- `ax-record fixture` ghi AXSubrole thật của cửa sổ ở dòng 0 (trước kia ghi cứng `AXStandardWindow`).
- App cũ (0.3.2, 0.3.3) bỏ qua trường lạ (crate `speaker-recipe` không `deny_unknown_fields`), nên chặn bằng `min_app_version` 0.3.4: app cũ từ chối công thức số 2 (`speaker-ops::recipes`, test `min_app_version_must_be_present_well_formed_and_not_above_the_app`) và giữ công thức dựng sẵn.

## Cách chạy lại

```
cargo build --release -p speaker-worker --bin ax-record
target/release/ax-record stats teams <ra.jsonl> --rate 1 --seconds 60      # dùng công thức dựng sẵn mới
target/release/ax-record fixture teams <ra.jsonl> --seconds 30             # có tên thật: ghi vào $DATA, ẩn danh bằng make_fixture.py
```

Cần quyền Trợ năng của tiến trình chạy lệnh, cuộc họp Teams có tên đang mở và **cửa sổ họp không thu nhỏ** (thu nhỏ thì cửa sổ họp là `AXDialog` rỗng). Fixture trong repo: `scripts/speaker-recipes/fixtures/teams-macos-named-meeting.jsonl` (20 s, chỉ cửa sổ họp, tên chủ phòng thành "Hoa Phạm", tiêu đề thành "Họp thử nghiệm"). Test: `a_named_teams_meeting_window_is_found_by_its_subrole`, `subrole_windows_without_the_leave_button_or_of_other_subroles_have_no_tiles` (crate `speaker-worker`), `window_subrole_needs_confirm_id_and_macos` (crate `speaker-recipe`).

## Kết quả thật (bản release, công thức mới, cửa sổ họp hiện)

| Tốc độ | Lượt | Ô thấy | Lượt nhanh p50 / p90 / max | Lượt đầy đủ p50 / p90 | Lệnh quá hạn | CPU (user+sys / 60 s) |
|---|---|---|---|---|---|---|
| 1 lượt/s | 60 | 3 ô (chủ phòng, An, Bình) | 5,6 / 13,0 / 15,8 ms | 37,7 / 41,0 ms | 0 | 0,47 s (0,8%) |
| 4 lượt/s | 237 | 3 ô | 5,2 / 11,8 / 17,2 ms | 30,1 / 30,4 ms | 0 | 0,68 s (1,1%) |

- Lượt đầu (lạnh, bật `AXEnhancedUserInterface`): 280–490 ms, 105 lệnh. Lượt đầy đủ ổn định đọc 123 phần tử (cửa sổ họp); thỉnh thoảng 138–147 phần tử là lần hỏi lại cửa sổ chính mỗi 30 giây, không phải mỗi 3 giây.
- Lượt đầy đủ ở 1 lượt/s vượt ngân sách 30 ms một chút (123 lệnh, ~0,3 ms mỗi lệnh Accessibility của Teams); lượt nhanh trong ngân sách. Chưa so với bản trước sửa trên cùng cửa sổ.
- Tên đọc được: "Khách An (Guest)", "Khách Bình (Guest)" và chủ phòng (nhãn "Myself video, ..."), qua cùng bộ đọc (`LiveReader`) ghi vào fixture.

## Chỉ báo "đang nói" (đo lại, cửa sổ họp ở trên cùng)

Lần ghi đầu cho thấy khung đứng yên vì cửa sổ họp bị che (Terminal ở trước) hay thu nhỏ: Teams không vẽ lại ô video thì cây AX không đổi. Cách đo đúng: Teams là app trước nhất, cửa sổ họp được `AXRaise`, không thu nhỏ, không bị che (ảnh chụp màn hình kiểm trước khi ghi).

Ghi `ax-record fixture` mỗi giây, so khung `vdi-frame-occlusion` trong ô của An, Bình với lịch (`lich.json`, mốc `t0.json`, vòng 630 s tính theo thời gian trôi). Tiêu chí: tại mỗi ảnh chụp thuộc một lượt nói, khung có đúng ở ô người đang nói và không ở ô khác. Có dời lịch một độ trễ để tìm độ trễ của chỉ báo.

| Bảng People | Ảnh chụp | Ảnh trong lượt nói | Khớp tốt nhất | Độ trễ chỉ báo (lúc bắt đầu nói tới lúc khung hiện) |
|---|---|---|---|---|
| đóng | 209 (3,5 phút, 37 lượt bắt đầu) | 170 | 93,4% khi dời 1,5 s (92,9% khi dời 1 s) | trung vị 1,27 s, 0,27 đến 3,14 s |
| mở | 100 (22 lượt bắt đầu) | 79 | 94,9% khi dời 1,25 s | trung vị 1,52 s, p90 2,52 s, max 3,46 s |

- Khung đổi theo người nói ở cả hai trạng thái; khi bảng People mở, khung vẫn ở ô video (không chỉ ở ảnh đại diện trong bảng). Độ khớp 93–95% (lấy mẫu 1 giây, mỗi lần chuyển lượt có một đến hai ảnh có cả hai khung hay không khung) gần ngưỡng cũ 95–97% của nghiên cứu 26/10; chưa chạy `SpeakingTracker` (250 ms) trên bản ghi mới nên số không so thẳng được.
- Độ trễ 1,3 đến 1,5 s nằm trên khoảng 0,76–1,28 s của nghiên cứu cũ, vì gồm cả chu kỳ lấy mẫu 1 giây và độ trễ phát của khách tự động; công thức đặt `delay_ms` 900.
- Chi phí đọc với bảng People mở (bản debug của worker in ra): lượt nhanh p50 8,5 ms, p90 13,5 ms; lượt đầy đủ p50 30 ms, p90 39,5 ms.
- Chưa chạy `latency-bench speaker-names-eval`: công cụ này ghép tên trên bộ nhúng giọng của bản ghi âm có nhãn (cache `.emb.json`), không nhận bản ghi cây này. Ghép tên thật (đúng/sai/chưa tên) cần âm thanh thật của cuộc họp qua `speaker-canary`/A-spk3, không có trong phiên này (loa tắt, không thu).

## Chưa chắc

- Nếu người dùng thu nhỏ cửa sổ họp: cây rỗng (cửa sổ họp là `AXDialog`), bộ đọc không có tên; cửa sổ thu gọn chỉ có ghi chú "X is speaking" không kèm ô có nhãn. Đề xuất: coi đó là trạng thái "không có tên", đừng đoán.
- Cửa sổ họp bị cửa sổ khác che hoàn toàn cũng làm cây đứng yên (quan sát được ở lần ghi đầu): chỉ báo mất, khác với việc bộ đọc hỏng.
