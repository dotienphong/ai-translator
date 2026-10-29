# Bộ cây giao diện ghi sẵn của bộ đọc tên

Test của `crates/speaker-worker` (kế hoạch 04, spec 2026-10-26-phan-biet-nguoi-noi §12) đọc các file này thay cho Teams, Meet,
Zoom thật. Mỗi dòng của `*.jsonl` là một ảnh chụp `{"t": giây, "lines": [...]}`, mỗi phần tử một dòng
`độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp` (định dạng `axtrace` của `bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten`).
`*.truth.json` là sự thật (ai bật, tắt mic lúc nào).

| File | Nguồn | Ghi chú |
|---|---|---|
| `teams-macos-named-meeting.jsonl` | bản ghi Teams 26276 thật (macOS 26.6), cuộc họp **có tên tự đặt** (tiêu đề cửa sổ họp là tên cuộc họp, ở đây thay bằng "Họp thử nghiệm"), chỉ cửa sổ họp (`AXStandardWindow`), 20 s đầu; dòng 0 có AXSubrole thật (`ax-record fixture` ghi từ khi có luật `window_subrole`) | cho test nhận cửa sổ theo vai trò phụ; khách tự động "Khách An", "Khách Bình"; không có `*.truth.json`: khung Teams ở yên trên khách An suốt bản ghi vì cửa sổ họp lúc đó bị che (Teams không vẽ lại); không dùng làm sự thật về chỉ báo |
| `teams-macos-people-closed.jsonl` | bản ghi `teams-C` của kế hoạch 01 (Teams 26276, macOS 26.6, bảng People đóng) | 60 s đầu |
| `teams-macos-people-open.jsonl` | bản ghi `teams-B` (bảng People mở) | 60 s đầu |
| `meet-chrome-macos.jsonl` | bản ghi `chrome-B` (Chrome 156, hai cửa sổ Meet cùng tài khoản) | 40 s đầu, chỉ vùng web |
| `zoom-macos-synthetic.jsonl`, `zoom-macos-synthetic.recipes.json` | **tổng hợp** từ mô tả của spec §3, §6.4 | chỉ cho test thuần; công thức này không vào app; thay bằng bản ghi thật (kế hoạch 04 Task 21) |
| `meet-macos.recipes.json` | công thức Meet (Chrome, Edge) từ bản ghi `chrome-B` | không vào app (Meet tắt mặc định: cửa sổ người nghe không có chỉ báo); test thuần và `ax-record --recipe` |

Tên người là tên giả ("Lan", "Minh" là khách tự động; "Hoa Phạm" thay tên thật của chủ phòng); mã phòng Meet là `abc-defg-hij`;
định danh tài khoản Teams và UUID thành `anon-N`, `uuid-N`; lớp nền ô video `bkg_<base64>` của Teams (mã hóa một mảnh định danh
tài khoản) thành `bkg_anon-N`; lớp CSS nguyên tử của Teams đã bỏ. Dựng lại bằng `make_fixture.py` (`names`, `build`, `review`; test
`test_make_fixture.py`) với file ánh xạ tên nằm ngoài repo; fixture mới chỉ vào repo sau khi người duyệt xem bản in `review`.
Test `fixtures_have_no_account_ids_links_or_paths` (crate `speaker-worker`) chặn định danh tài khoản (cả dạng base64), email, liên
kết, đường dẫn, UUID trong mọi file ở đây. Không chép bản ghi gốc (có tên thật) vào repo.
