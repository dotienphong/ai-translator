# Phân biệt người nói, kế hoạch 04: đọc tên người nói trên macOS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Chủ dự án chưa cho phép commit cho phần 04 của tính năng này. Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng bước "Mốc kiểm" (chạy đúng test, clippy, fmt liên quan; `git status --short` chỉ để đối chiếu). Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`. Giữ nhánh `phan-biet-nguoi-noi`, không gộp `main`, không rebase. Chỉ commit khi chủ dự án nói rõ.

**Goal:** trên macOS, phụ đề hiện **tên thật** của người đang nói trong Teams (bản cài) khi đủ bằng chứng. Google Meet (Chrome, Edge) và Zoom (bản cài): mã đọc có sẵn và có test, nhưng **không** nằm trong công thức build sẵn (Meet: cửa sổ người nghe không có chỉ báo, QĐ 32; Zoom: chưa có bản ghi thật, QĐ 16) tới khi Task 21 đạt tiêu chí và chủ dự án đồng ý; không đủ thì giữ "Người N"; danh sách người tham dự cho mục "Chọn người trong cuộc họp"; dòng mời cấp quyền Trợ năng; tách giọng bị gộp theo tên khi số đo cho phép. Không làm chậm phụ đề, không đọc gì ngoài tên và chỉ báo nói trong cửa sổ họp. Tính năng **vẫn tắt với người dùng cuối** tới kế hoạch 07.

**Architecture:** Bộ đọc tên chạy trong `speaker-worker` (tiến trình phụ ưu tiên thấp, đã có từ kế hoạch 02), trên một luồng riêng, và **chỉ lấy mẫu**: mỗi lượt đọc trả tên, trạng thái mic, chữ "đang nói" và trạng thái các phần tử neo của từng ô người tham dự. Mọi logic theo thời gian (tín hiệu "đang nói", tự hiệu chỉnh, ghép tên vào giọng, tách giọng bị gộp, mốc giờ) là hàm thuần trong phiên của worker, test bằng **bộ cây giao diện ghi sẵn** (fixture ẩn danh từ bản ghi của kế hoạch 01) và dòng thời gian giả. Cách đọc cây là trait `Tree` dùng chung cho fixture và Accessibility thật (UI Automation ở kế hoạch 05). Công thức đọc là dữ liệu (crate mới `speaker-recipe`), build sẵn trong app, gửi cho worker qua `Load`; kế hoạch 06 chỉ thêm tải từ xa có ký số lên cùng định dạng. Tên tới app qua `Voices` của giao thức (phiên bản 2), qua luồng phụ đề (`EventSink::names`, `EventSink::reader`) vào bảng người nói của kế hoạch 03 (`clean_name` bắt buộc), không đổi kiểu `Roster` mà 03 đã dùng.

**Tech Stack:** Rust 1.98 (edition 2024). Không thêm crate mới nào vào `Cargo.lock`: `regex` 1.13.1 và `core-foundation` 0.10.1 đã có trong lock (app dùng) và là bản mới nhất trên crates.io (kiểm bằng `cargo search` ngày 2026-10-27); `libc` 0.2.189 như cả workspace. `serde_json` bản mới nhất trên crates.io là 1.0.154 nhưng crate mới dùng `serde_json.workspace` (1.0.151 trong lock) cho nhất quán, không thêm bản thứ hai vào lock (rà soát A-NHỎ 10). Python 3 cho script ẩn danh fixture (chạy `-I`). Không thêm gói npm.

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §6 (6.1–6.8), §5.3 (tách giọng bị gộp theo tên, đã duyệt), §7.1 (phần build sẵn), §4.1–4.2 (phần tên của worker và giao thức), §8.3, §9–§11, §12 (phần của 04), §13 mục 4, §14. Số đo nền: `bench/2026-10-26-nguoi-noi/results/{tong-hop,teams-chrome,quyen-tro-nang,nhan-giong-ami,nhan-giong-tieng-viet,02-tong-hop}.md`.

**Dựa trên:** kế hoạch 02, 02b, 03, 03b đã thực thi (HEAD `72614025` trên nhánh `phan-biet-nguoi-noi`): giao thức phiên bản 1 (`crates/speaker-protocol/src/lib.rs`), `Worker` (`crates/speaker-worker/src/session.rs`), client (`crates/pipeline/src/speaker_client.rs`), luồng phụ đề (`crates/pipeline/src/engine.rs`, `Composer::on_speaker` dòng 1867–1910), bảng người nói (`src-tauri/src/transcript/speakers.rs`: `RosterView.participants`, `ask_access`, `Voice.auto_name`, `NameSource::Name`, `clean_name` đã có nhưng chưa ai ghi), dòng mời và nhóm Cài đặt đã vẽ sẵn (`src/windows/overlay/SpeakerAsk.tsx`, `src/windows/main/settings/SpeakerSettings.tsx`). Ghi chú chuyển sang 04: "Để kế hoạch sau" của file 03 và mục "Ghi cho kế hoạch 03 và 04" của `results/02-tong-hop.md`.

**Kế hoạch đi kèm:** `2026-10-26-phan-biet-nguoi-noi-04b-doc-ten-macos-app.md` (Task 10–21: ráp vào worker, đo chọn ngưỡng tách giọng, bộ đọc Accessibility thật, pipeline, app, mốc kiểm tổng, đo, thử thật cần chủ dự án). File này (Task 0–9) là phần thuần: giao thức, công thức, fixture, duyệt cây, tín hiệu, mốc giờ, ghép tên, tách giọng, tự hiệu chỉnh; chạy file này trước. Số Task dùng chung cho hai file. **Phủ spec, "Để kế hoạch sau", rủi ro và điều cần chủ dự án quyết của cả hai file ở cuối file này.**

**Quy ước:**
- `W` = gốc worktree nhánh `phan-biet-nguoi-noi` (thư mục `meeting-translator-work/phan-biet-nguoi-noi`); `M` = thư mục chính của repo (chỉ đọc); `DATA` = `$W/../data-nguoi-noi` (ngoài mọi repo: model, cache nhúng, bản ghi cây có tên thật); `B` = `$W/bench/2026-10-26-nguoi-noi`. Đặt bốn biến này theo máy của bạn trước khi chạy lệnh.
- Shell trở về thư mục chính sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd $W &&`** (hay đường dẫn tuyệt đối tương ứng).
- **Mọi lệnh cargo đặt `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0`.** Không `cargo clean`, không xóa gì trong `target/`. Lệnh `cargo test` có từ hai bộ lọc tên trở lên viết dạng `--lib -- a:: b::`.
- **Đĩa:** mỗi bước build nặng (build lần đầu của `meeting-translator` sau khi đổi nhiều file, mọi lệnh `--release`) **bắt đầu bằng lệnh kiểm đĩa có điều kiện**, dừng thật khi thiếu: `avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; }` (ngưỡng **18** GiB cho lệnh `--release`). Lệnh dừng thì **báo chủ dự án** (không tự dọn).
- **Định dạng Rust:** mã mẫu chưa qua `rustfmt` (`max_width = 120`). Mỗi Mốc kiểm chạy `cargo fmt -p <crate>` **trước** `cargo fmt -p <crate> -- --check`.
- Không mở, không đọc, không bấm vào Teams, Chrome, Zoom, Edge của máy; không đổi System Settings, âm lượng, micro. Mọi test tự động dùng fixture. Bước nào phải đọc app thật ghi **(cần chủ dự án)** và nằm ở cuối file 04b.
- Repo GitHub công khai: không ghi đường dẫn cá nhân hay tên người thật vào file nào của repo. Tên trong fixture và test là tên giả ("Lan", "Minh" là khách tự động của kế hoạch 01; "Hoa Phạm", "Lan Nguyễn", "Minh Trần", "Tuấn Lê" như mẫu đã duyệt). Bản ghi gốc có tên thật nằm ở `$B/truoc-spec/doc-ten/out/` (đã `.gitignore`) và `$DATA`.
- Tên người không bao giờ vào log, `CommandError.message`, báo cáo lỗi: kiểu `PersonName` của giao thức che `Debug`; log của bộ đọc chỉ có số đếm, thời gian, trạng thái.
- `speaker-worker` không có mã mạng (CI kiểm 4 lớp `scripts/release/check-no-network.sh`): đừng viết tên API mạng, kể cả trong chú thích, ở `crates/speaker-worker/src`, `crates/speaker-protocol/src`, `crates/speaker-recipe/src`.

---

## Quyết định thiết kế của kế hoạch này (ngoài chữ của spec)

1. **Bộ đọc chỉ lấy mẫu, logic nằm trong phiên của worker.** Luồng đọc (I/O với Accessibility) trả `Sample` gồm các `TileSample {name, is_self, muted, label_speaking, anchors, candidates, slot}`; mọi thứ theo thời gian (`SpeakingTracker`, `Calibrator`, `NameMatcher`, tách giọng, `Clock`) chạy trên luồng chính của worker, thuần và tất định. Nhờ đó toàn bộ phần nhạy được test bằng fixture và dòng thời gian giả; luồng đọc chết hay treo không làm sai trạng thái tên.
2. **Trait `Tree` chung cho fixture và Accessibility thật** (`role`, `shape`, `text`, `children`). Duyệt cửa sổ (`Walk`), tìm ô, lấy mẫu ô viết một lần, chạy trên `FixtureTree` trong test và `AxTree` ở bộ đọc thật (Task 12); kế hoạch 05 thêm `UiaTree`.
3. **Đọc chữ có chọn lọc (ưu tiên 3).** Khi duyệt cây, mỗi phần tử chỉ được đọc "hình dạng" (vai trò, vai trò phụ, id, lớp; không có chữ). Chữ (tiêu đề, mô tả, giá trị) chỉ đọc ở: tiêu đề cửa sổ (để nhận cửa sổ họp, spec §6.1), tiêu đề vùng web, phần tử khớp hình dạng của ô, và phần tử bên trong ô. Với Chrome, Edge: phần trình duyệt bên ngoài `AXWebArea` (thẻ, thanh địa chỉ, dấu trang) chỉ đọc vai trò; chỉ vào vùng web có tiêu đề khớp Meet. Nhờ đó khung chat trong cửa sổ họp không bị đọc chữ. **Công thức không được có ô cần đọc chữ mà không ràng buộc hình dạng** (không vai trò, vai trò phụ, lớp hay id): `speaker_recipe::parse` bỏ mục đó (rà soát A-Q11), nên bộ đọc không bao giờ đọc chữ của mọi phần tử một cửa sổ.
4. **Crate mới `crates/speaker-recipe`** (định dạng, kiểm, biên dịch mẫu chữ, `Attrs`, `tidy_name`), dùng chung cho app và worker, `#![forbid(unsafe_code)]`, không I/O. File nguồn `scripts/speaker-recipes/recipes.json` nhúng vào crate (`BUILTIN_JSON`). **Ranh giới với kế hoạch 06:** 06 thêm phong bì ký (`format: ai-translator-speaker-recipes`, tiền tố ký riêng), tải, chống quay lui, lưu trên máy ở app, rồi gọi đúng `speaker_recipe::parse` lên phần thân và gửi thân đó trong `Load.names.recipe_json`; worker không đổi. Trường `version`, `min_app_version` đã có trong định dạng từ 04 (04 không kiểm `min_app_version`: bản build sẵn luôn hợp).
5. **Giao thức phiên bản 2.** `Load` thêm **một** trường `names: NamesSetup {enabled, recipe_json, eui_marker}` (gom `names_enabled`, `recipe_json` của spec §4.2 và đường dẫn dấu `AXEnhancedUserInterface`, QĐ 8), để mỗi chỗ dựng `Load` cũ chỉ thêm một dòng. Tên đi bằng kiểu `PersonName` (`Debug` chỉ in số ký tự). Thêm ở cuối: `Request::Speech`, `Request::SetNames`, `Request::PauseNames` (QĐ 15), `Response::ReaderState`, `ReaderStatus::Paused`; `Ready.reader_platform`; `VoiceInfo.{name, name_source, room_index}`; `Voices.participants`. Hằng giới hạn khung: tên ≤ 160 byte, ≤ 64 người tham dự, phiên bản app họp ≤ 32 byte, công thức ≤ 256 KB. **Không có cơ chế đọc `protocol_version` trước khi giải mã `Ready`** (bỏ ở vòng rà soát 1, A-Q2): worker lệch phiên bản không bao giờ tới được `Ready` (worker phiên bản 1 đọc `Load` phiên bản 2 thì thừa byte và thoát ngay, ngược lại thiếu byte), và app với worker luôn được đóng gói cùng nhau, kiểm băm (`SIDECAR_HASHES`) nên lệch phiên bản không xảy ra ở bản phát hành. Thay vào đó (QĐ 26): giữ `PROTOCOL_VERSION = 2` và `Ready.protocol_version`; worker ghi số phiên bản giao thức của nó vào stderr lúc khởi động; app thấy worker đóng stdout trước `Ready` thì ghi log gợi ý kiểm bản `speaker-worker`.
6. **Tên tới app không qua `Roster`.** Luồng phụ đề nhận `SpeakerUpdate::Voices` (giờ có tên), `SpeakerUpdate::Participants`, `SpeakerUpdate::Reader` và gọi hai hàm mới `EventSink::names(&Names)`, `EventSink::reader(&ReaderInfo)`. `Roster`, `RosterVoice` của kế hoạch 03 giữ nguyên (không phải sửa 12 chỗ dựng chúng). `SpeakerBook` giữ tên tự động trong một bảng riêng `auto` (thay trường `Voice.auto_name` chưa dùng), nên tên tới trước hay sau bảng giọng đều đúng.
7. **Chưa có quyền Trợ năng thì không thấy được cửa sổ họp** (không đọc được tiêu đề cửa sổ của app khác). Điều kiện "worker thấy cửa sổ họp" của dòng mời (spec §6.7) đổi thành "**một app họp trong danh sách viết cứng, có công thức build sẵn, đang chạy**" (hiện chỉ Teams; Chrome, Edge, Zoom khi có lại công thức, QĐ 16, 32). Chrome thường chạy suốt, nên dòng mời có thể hiện cả khi người dùng dịch video; dòng mời ẩn được tới hết phiên. Xem "Điều cần chủ dự án quyết" mục 1.
8. **`AXEnhancedUserInterface` (EUI):** đọc giá trị trước; chỉ đặt `true` khi đang `false` (không giành của một công nghệ trợ năng khác như VoiceOver), và chỉ trả `false` cho đúng những app chính mình đã bật. Trước khi đặt, worker ghi dấu `speaker-eui.json` (pid, app) trong thư mục dữ liệu của app (đường dẫn qua `Load`); trả lại khi tắt "Lấy tên", khi dừng phiên, khi worker thoát; worker chạy sau trả phần sót lúc bắt đầu luồng đọc; **app trả phần sót lúc mở** (spec §6.2 "lần mở app sau"). Trước khi trả, kiểm pid còn là đúng app (bundle id) để không đụng tiến trình khác dùng lại pid. Điều kiện quyền, file dấu tách theo loại build, trả EUI của trình duyệt khi hết cửa sổ họp: QĐ 28.
9. **Ngưỡng ghép tên là hằng của spec §6.6** (≥ 60% thời gian trùng, ≥ 3 s, ≥ 2 đoạn; đổi tên khi tên mới hơn ≥ 20% và ≥ 5 s) trong `names/matcher.rs`, cộng một ngưỡng ngoài spec: **bỏ tên khi tên đang gán xuống dưới 50%** thời gian trùng của giọng (ưu tiên 2: thà "Người N" còn hơn sai tên; trễ giữa 60% gán và 50% bỏ để tên không nhấp nháy). **Mỗi tên một giọng (ghép cặp tối ưu theo spec §6.6, sửa ở vòng rà soát 1, A-Q7):** sau luật trên mỗi giọng có tối đa một tên ứng viên (≥ 60%, hay ≥ 50% khi đang giữ tên), nên bài ghép cặp Hungarian tách thành từng nhóm "các giọng cùng ứng viên một tên" và lời giải tối ưu là: tên về giọng có nhiều thời gian trùng với tên đó nhất (bằng nhau: mã giọng nhỏ hơn). Hàm `best_matching` (duyệt có cắt tỉa, n ≤ 8, chỉ có trong test) giải bài ghép cặp tổng quát, và test `grouping_by_name_is_an_optimal_matching` so nó với cách nhóm trên 300 ma trận ngẫu nhiên, để luật đổi sau này không âm thầm phá tính tối ưu. Giọng thua vẫn mang tên kèm số "· giọng k" (**máy chung phòng**, spec §6.6 dòng kế) **chỉ khi** tâm nhúng của nó khác tâm của mọi giọng khác cùng tên (`cosine ≤ split_max_cosine`, tức là người khác ngồi cùng máy); tâm giống (một người bị phân cụm tách hai giọng) hay không đủ nhúng để so thì giọng thua không có tên. Bằng chứng tính khi dấu "đang nói" của khoảng thời gian của đoạn đã tới (chờ trễ của app cộng 0,5 s; quá 5 s không có lượt đọc thì đoạn không có bằng chứng). Xem "Điều cần chủ dự án quyết" mục 11.
10. **Tách giọng bị gộp (spec §5.3):** ngưỡng nằm trong `SpeakerConfig` (đổi được qua `speaker_config` của manifest): `split`, `split_share`, `split_min_ms`, `split_min_segments`, `split_max_cosine`. Thêm điều kiện không có trong spec: tâm nhúng của hai nhóm đoạn mang hai tên phải khác nhau (`cosine ≤ split_max_cosine`), để một người bị nhận nhầm hai tên (chỉ báo trễ, nói chồng) không bị tách; mỗi giọng tách tối đa một lần mỗi 60 s, tối đa 4 lần mỗi phiên. Đoạn đã chuyển sang giọng mới được gửi lại `Assign` (nhãn cũ đổi tại chỗ, `VoiceBook::assign` của 02 đã nhận nhãn lặp). **Mặc định `split = false` cho tới khi Task 11 đo đạt tiêu chí**; không đạt thì giữ `false` (như hiện nay: giọng gộp không có tên). **Giọng có dấu hiệu gộp không nhận tên trội** (QĐ 25).
11. **Tự hiệu chỉnh (spec §6.5) chỉ tương quan với tiếng nói chung của máy, như chữ spec** (vòng rà soát 1, A-Q10: bỏ cách cũ "tương quan cả với khoảng nói của từng giọng", vì cách đó học được phần tử trong ô Lan đổi theo giọng của Minh rồi gán tên Lan cho giọng Minh). Giới hạn đã biết: hai người ở xa nói luân phiên thì chỉ báo đúng của một người chỉ tương quan khoảng 0,30 với tiếng nói chung (r = (0,45 − 0,405)/√(0,2475 × 0,09) ≈ 0,30), dưới ngưỡng 0,6, nên tự hiệu chỉnh gần như chỉ học được khi một người ở xa nói (xem Rủi ro, "Điều cần chủ dự án quyết" mục 3). Bắt đầu khi có ≥ 10 s tiếng nói của máy mà không người tham dự nào "đang nói" theo tín hiệu 1–3, **và chỉ khi đã nhận ra ô của chính người dùng** (QĐ 24); bộ đọc đọc thêm các phần tử ứng viên (tối đa 16 mỗi ô) khi đang tìm hay khi đã học được chỉ báo (để theo chỉ báo đó). **Có thời hạn** (A-Q4): tìm quá 3 phút không học được gì thì ngừng; học được thì ngừng tìm (giữ chỉ báo đã học tới hết phiên); cả hai ca 10 phút sau mới tìm lại. Nhịp 4 lần/giây chỉ khi đang tìm.
12. **Mốc giờ chung.** Client tính giờ Unix của mốc 0 một lần mỗi phiên (lúc `speaker_client::start`), gửi trong mọi `SessionStart` kể cả khi worker chạy lại (trước đây mỗi lần chạy lại lấy giờ lúc đó, lệch hàng phút). Worker hiệu chỉnh bằng giờ nhận `Speech`: mốc = nhỏ nhất của (giờ nhận − `end_ms`) trên 64 `Speech` gần nhất, vì `Speech` được gửi ngay khi luồng VAD thấy; đồng hồ âm thanh trôi so với đồng hồ hệ thống thì mốc trôi theo.
13. **Nhịp đọc cụ thể (spec §6.2 "kế hoạch 04 định cụ thể"):** 1 lần/giây; **4 lần/giây khi** máy có tiếng nói trong 1,5 s gần nhất **và** (có giọng không phải giọng trong phòng nói trong 60 s gần nhất mà chưa có tên, **hoặc** đang tự hiệu chỉnh). Lượt đầy đủ (duyệt cửa sổ, tìm ô và neo) mỗi 3 s, hay ngay khi một ô không còn đọc được; lượt nhanh chỉ đọc lại nhãn ô và neo đã biết. Quét tiến trình mỗi 2 s. Giới hạn mỗi lượt (spec §6.2) đếm theo **lệnh đọc** (mỗi lần gọi `Tree`: vai trò, hình dạng, chữ, con), chặt hơn đếm phần tử: ≤ 3 000 lệnh và ≤ 30 ms cho **cả lượt**, gồm duyệt cửa sổ, lấy mẫu từng ô, đọc trong ô, tìm neo và ứng viên tự hiệu chỉnh (vòng rà soát 1, A-Q3/B-Q2). Hết ngân sách giữa chừng thì phần đang đọc dở bị bỏ, lượt sau đọc tiếp: lượt đầy đủ tiếp từ phần tử chưa duyệt, lượt nhanh tiếp từ ô chưa đọc (xoay vòng); một phần tử hay một ô tự nó vượt cả một lượt thì bị bỏ qua ở lượt đó để không kẹt.
14. **`Speech` từ luồng VAD:** khung có xác suất ≥ ngưỡng của bộ cắt câu (`segmenter.threshold`) và nguồn không phải `Mic`; báo khoảng khi nó kết thúc (sau 3 khung im) và mỗi 16 khung (512 ms) khi đang nói; kênh riêng 16 chỗ, `try_send`, đầy thì bỏ (không bao giờ chờ). Client chuyển `Speech` khi worker sẵn sàng; hàng ghi của client nới từ 2 lên 8 khung.
15. **Quá tải (spec §11), tách "tạm dừng" khỏi "tắt" (vòng rà soát 1, B-Q3):** lần đầu worker chậm hơn thời gian thực 30 s liền khi đang đọc tên thì client gửi `PauseNames` (tạm dừng đọc tên **tới hết phiên**, kể cả qua các lần chạy lại: worker chạy lại nhận `Load` với `names.enabled = false`), đặt lại mốc chậm; vẫn chậm 30 s nữa thì tắt tính năng như cũ. **Tạm dừng giữ tên đã chốt**: worker ngừng đọc (bộ đọc trả `AXEnhancedUserInterface` rồi ngủ), không lập bằng chứng mới, không tách giọng, nhưng `Voices` vẫn mang các tên đã gán (đóng băng); trạng thái bộ đọc là `Paused`. Còn `SetNames {enabled: false}` (người dùng tắt "Lấy tên") **xóa tên**, trạng thái `Off`; app cũng tự xóa tên tự động, người tham dự và dòng mời khi người dùng tắt "Lấy tên", kể cả khi worker đã chết (QĐ 31).
16. **Fixture:** từ bản ghi `axtrace watch` của kế hoạch 01 (`$B/truoc-spec/doc-ten/out/`), 60 s đầu, chỉ cửa sổ họp (Meet: chỉ cây con `AXWebArea`), bỏ các lớp CSS nguyên tử của Teams (`f…`, `___…`, `r…`). **Ẩn danh (vòng rà soát 1, A-C1):** ánh xạ tên thật → tên giả dựng tự động vào `$DATA` (không in tên ra màn hình); thay tên **chỉ trong các trường chữ** (tiêu đề, mô tả, giá trị, id, gợi ý, id DOM) theo ranh giới từ; thay **mọi định danh tài khoản Teams** (`8:live:…`, `8:orgid:…`, `8:guest:…`, `8:teamsvisitor:…`, `28:…`) và mọi UUID ở mọi trường bằng id giả ổn định (`anon-1`, `anon-2`…); thay mã phòng Meet; **dừng không ghi file** khi còn `8:live:`, `8:orgid:`, `8:guest:`, `8:teamsvisitor:`, `.cid.`, `@`, `http`, `/Users/`, `C:\Users`, một địa chỉ email, một UUID hay một tên thật trong ánh xạ. Fixture sinh vào `$DATA/fixtures-review/` trước; script in **các chuỗi khác nhau theo từng trường** của cả ba fixture; **chỉ chép vào repo sau khi người điều phối hay chủ dự án duyệt** bản in đó. Test Rust quét mọi fixture trong repo tìm các mẫu cấm và kiểm mọi tên ô thuộc danh sách tên giả (không đọc `$DATA`). **Zoom chưa có bản ghi** (dữ liệu trước spec không lưu): fixture Zoom tổng hợp từ mô tả của spec §3, §6.4 kèm một công thức Zoom tổng hợp riêng (`zoom-macos-synthetic.recipes.json`), **chỉ dùng cho test thuần**, không build vào app; mục Zoom **bỏ khỏi `recipes.json` build sẵn** tới khi có bản ghi thật ở Task 21 (cần chủ dự án; "Điều cần chủ dự án quyết" mục 4).
17. **Độ trễ theo app:** Teams 900 ms (build sẵn; ô video hiện 0,76–1,28 s sau lúc bật mic, mất 0,52–0,70 s sau lúc tắt); công thức Meet riêng (`fixtures/meet-macos.recipes.json`) 800 ms (0,5–1,2 s); công thức Zoom tổng hợp 500 ms (0,44–0,56 s). Chốt lại bằng bộ đọc thật ở Task 20, 21.
18. **Danh sách người tham dự gồm cả chính người dùng** (để người dùng đặt tên giọng micro của mình bằng một cú bấm); chính người dùng không bao giờ được tự gán cho giọng nào.
19. **Nhãn máy chung phòng** "Phòng A · giọng 1" là chuỗi i18n mới phía Rust (`speaker_room_voice`, 5 ngôn ngữ), như `speaker_voice` của 03.
20. **Cửa sổ chính mở hay tải lại giữa phiên** (rà soát B-N12 của 03): `get_transcript` phát lại `speaker://roster` khi phiên có giọng, nên danh sách người tham dự tới ngay; không thêm trường vào `Transcript`.
21. **Không dùng `AXObserver` ở 04.** Hỏi vòng có giới hạn (QĐ 13) đã nằm trong ngân sách thiết kế; chỉ thử `AXObserver` nếu số đo của Task 20 vượt.
22. **Windows:** worker Windows báo `reader_platform = Unsupported`, không đọc tên; kế hoạch 05 thêm `UiaTree` và bộ đọc.

Thêm ở vòng rà soát 1 (hai báo cáo rà soát độc lập A, B; người điều phối chốt):

23. **Tín hiệu "đang nói" theo từng ô (A-Q1, A-Q9).** Lịch sử trạng thái neo (`History`) khóa theo **từng ô** (tên, `TileSample::slot` = cửa sổ × 256 + thứ tự trong các ô cùng tên), rồi mới gộp theo tên (một người "đang nói" khi một ô của người đó đang nói). Cách cũ khóa theo tên làm trạng thái của các ô cùng tên xen nhau thành "đổi trạng thái" (fixture Meet có 4 ô cùng tên nên đạt 0,688 nhờ lỗi đó; khóa theo ô mà giữ cách đẩy cũ chỉ còn 0,545). Test so với sự thật đẩy mẫu **mỗi 250 ms bằng ảnh chụp gần nhất**, như bộ đọc thật (người rà đo: theo ô 0,890); ngưỡng Meet ≥ 0,80, **không có đường lùi hạ ngưỡng** (đỏ thì dừng, báo). Tín hiệu "khác trạng thái thường gặp nhất" (`deviation`) **không** lấy trạng thái thường gặp trên cả phiên (người nói 70% số lượt làm tín hiệu đảo chiều): nền của mỗi ô là trạng thái thường gặp nhất trong 40 lượt **máy im** gần nhất (không có `Speech` trong khoảng trễ của app cộng 1 s trước lượt đó), cần ≥ 10 lượt im mới có tín hiệu.
24. **Chính người dùng chưa nhận ra thì không dùng tín hiệu mic, không tự hiệu chỉnh (A-Q5, A-Q8).** Trên bản ghi Meet, 0/236 ô có dấu chính người dùng (ô của mình hiện tên tài khoản, không có "Bạn"/"You"). Ô người dùng không nhận ra thì có thể là "người ở xa duy nhất mở mic" hay bị tự hiệu chỉnh học. Nên: tín hiệu mic (spec §6.4 mục 3) chỉ dùng khi lượt đọc có **đúng một ô được nhận là chính người dùng**; tự hiệu chỉnh cũng vậy. Đoạn nguồn `Mic` là của người trong phòng hay chính người dùng: không bao giờ là bằng chứng cho tên nào (như trước, spec §5.5). Thêm: **tên không được gán chỉ nhờ tín hiệu mic**: tên phải có ≥ 1 s bằng chứng từ chỉ báo (công thức hay tự học) trên chính giọng đó (người không có ô, như người gọi bằng điện thoại hay họp đông hơn số ô, không mượn được tên của người duy nhất đang mở mic). Với Meet hiện nay, tín hiệu mic và tự hiệu chỉnh vì thế không chạy tới khi T21 tìm được dấu chính người dùng ("Điều cần chủ dự án quyết" mục 12).
25. **Giọng có dấu hiệu gộp không nhận tên (A-Q6).** Khi một tên thứ hai (không phải người dùng) trên cùng giọng có ≥ `split_share` thời gian trùng, ≥ `split_min_ms` và ≥ 2 đoạn bằng chứng (điều kiện của `find_split`, đếm đoạn như luật gán tên thay vì "đoạn mang riêng tên" để chặt hơn), giọng đó không nhận tên trội: thà "Người N" (ưu tiên 2). Tách giọng bật và tách được thì sau khi tách mỗi giọng một tên như trước.
26. **Lệch phiên bản giao thức (A-Q2).** Xem QĐ 5: không đọc `protocol_version` trước; worker in `speaker-worker: giao thức phiên bản 2` ra stderr lúc khởi động (app chép stderr của worker vào log); client gặp stdout đóng hay khung hỏng khi chưa có `Ready` thì lý do ghi kèm câu "trước Ready (app và speaker-worker có thể khác phiên bản giao thức, kiểm bản speaker-worker)".
27. **Luồng đọc không thức vô ích (B-Q4) và hạn chờ toàn cục (B-Q1).** `Control` có `Mutex` + `Condvar`: luồng đọc chờ tới lượt kế bằng `wait_timeout` (không ngủ từng 50 ms để xét `stop`); luồng chính đánh thức khi `ControlState` đổi hay khi dừng. "Lấy tên" tắt hay tạm dừng thì luồng đọc trả EUI, gửi **một** mẫu `Off` (phiên bỏ qua mẫu này: `Off` tới app chỉ do `SetNames(false)`, `Paused` do `PauseNames`), rồi ngủ hẳn tới khi trạng thái đổi. Hạn chờ 0,2 s đặt một lần cho cả tiến trình bằng `AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 0.2)` ở đầu luồng đọc và đầu `ax-record` (hạn chờ đặt trên phần tử app chỉ áp cho chính phần tử đó, header `AXUIElement.h`).
28. **EUI an toàn hơn (B-Q6, B-NHỎ N9, N13).** Trả EUI còn sót (worker lúc bắt đầu, app lúc mở) **chỉ khi `AXIsProcessTrusted()`**; chưa có quyền thì giữ nguyên file dấu, app không gọi API Trợ năng nào lúc mở. Chỉ xóa mục đã trả được (đọc lại thấy `false`) hay mục mà pid không còn là đúng app. Worker làm việc này ở lượt đầu tiên thấy có quyền, không ở đầu luồng. File dấu tách theo loại build: `speaker-eui.json` (bản phát hành), `speaker-eui-dev.json` (bản debug), như `data-dev.db`, để bản dev và bản cài không trả EUI của nhau. Trình duyệt (Chrome, Edge): trả EUI sau 30 s liền không còn cửa sổ Meet (spec §6.8 chính sách: "với trình duyệt, chỉ trong lúc dịch có cửa sổ Meet"); Teams giữ tới hết phiên (spec §6.2).
29. **Kênh sự kiện của worker có giới hạn (B-N7).** Khung của app đi qua kênh 32 chỗ (`sync_channel`; luồng stdin chờ khi đầy, áp lực ngược tới hàng ghi của client như trước); mẫu của bộ đọc gửi bằng `try_send`, đầy thì bỏ mẫu đó.
30. **`Speech` dài được cắt, không bỏ (B-N10).** Khoảng dài hơn 600 s (VAD có tiếng liên tục, như nhạc) thì worker dùng 600 s cuối; mốc giờ vẫn cập nhật theo `end_ms`.
31. **App xóa tên khi người dùng tắt "Lấy tên" (B-N8).** `speaker::names_changed(false)` xóa ngay tên tự động, người tham dự, dòng mời ở bảng người nói và phát lại bảng, không chờ worker (worker có thể đã chết hay bị tắt vì quá tải). Luồng phụ đề cũng xóa tên tự động khi nhận trạng thái bộ đọc `Off` (không xóa khi `Paused`).
32. **Meet tắt mặc định (rà soát lần 2 A-Q1; người điều phối chốt).** Chạy cả chuỗi fixture → `SpeakingTracker` → `NameMatcher` trên bản ghi Meet: chỉ báo chỉ có ở ô của tài khoản đang nói **trong chính cửa sổ của nó**; ở cửa sổ chủ phòng, tức chỗ người dùng ngồi nghe người ở xa, **0 ms bằng chứng, không tên** (đúng kết luận của kế hoạch 01, `results/teams-chrome.md`: "ô của người nói trong cửa sổ chủ phòng không đổi lần nào"); Teams cùng phép gán đúng Lan, Minh. Số khớp 0,890 của test Meet đo ô của chính người dùng, không phải người ở xa. Bật chế độ trợ năng của Chrome/Edge và đọc 1–4 lần/giây mà không gán được tên là bất lợi (tác động lên app khác, ưu tiên bảo mật), nên mục Meet **bỏ khỏi `recipes.json`** như Zoom; công thức Meet nằm ở `scripts/speaker-recipes/fixtures/meet-macos.recipes.json` cho test thuần (`meet_recipes()`) và cho `ax-record --recipe` ở Task 21. Khi Meet tắt: bộ đọc không coi Chrome, Edge là app họp (chỉ app có công thức mới vào danh sách đang chạy), nên không đọc cây Chrome, không đặt `AXEnhancedUserInterface` cho trình duyệt, không có dòng mời cấp quyền vì Chrome; toàn bộ mã đọc trình duyệt (vùng web, EUI trình duyệt và trả sau 30 s, đọc lại chữ tên) vẫn được xây và test nhưng nằm ngủ. Tiêu chí bật lại (Task 21 Step 1): tìm được chỉ báo dùng được **ở cửa sổ người nghe** (phần tử, hoạt hình hay DOM khác ô tên đổi theo người ở xa đang nói; test fixture mới ở cửa sổ người nghe cho tên đúng). Test `meet_gives_no_name_in_the_listener_window` ghim hành vi hiện nay. Xem "Điều cần chủ dự án quyết" mục 16.

## Cấu trúc file

"04" là file này (Task 0–9); "04b" là file đi kèm (Task 10–21).

| File | Việc | Task |
|---|---|---|
| Sửa `crates/speaker-protocol/src/lib.rs` | giao thức phiên bản 2, `PersonName`, `MeetingApp`, `NamesSetup`, `EuiMarker`, `PauseNames`, `ReaderStatus::Paused`, `voices_fit`, ngưỡng tách giọng trong `SpeakerConfig` | 04 T1 |
| Sửa `crates/speaker-worker/src/session.rs`, `crates/speaker-worker/tests/worker_process.rs`, `crates/pipeline/src/{speaker_client.rs, engine.rs, bin/fake_speaker_worker.rs}` | chỗ dựng kiểu cũ (thêm trường) | 04 T1 |
| Tạo `crates/speaker-recipe/{Cargo.toml, src/lib.rs}`; tạo `scripts/speaker-recipes/recipes.json`; sửa `scripts/release/check-no-network.sh` | công thức đọc build sẵn | 04 T2 |
| Tạo `scripts/speaker-recipes/make_fixture.py`, `scripts/speaker-recipes/fixtures/*.jsonl`, `*.truth.json`, `scripts/speaker-recipes/fixtures/{zoom-macos-synthetic,meet-macos}.recipes.json`, `scripts/speaker-recipes/fixtures/README.md` | bộ cây ghi sẵn ẩn danh (chỉ vào repo sau khi duyệt) | 04 T3 |
| Sửa `crates/speaker-worker/{Cargo.toml, src/lib.rs}`; tạo `crates/speaker-worker/src/reader/{mod.rs, tree.rs, extract.rs}` | cây, duyệt cửa sổ, tìm ô, lấy mẫu | 04 T3, T4; 04b T10, T12 |
| Tạo `crates/speaker-worker/src/names/{mod.rs, clock.rs, track.rs, matcher.rs, split.rs, calibrate.rs}` | tín hiệu, mốc giờ, ghép tên, tách giọng, tự hiệu chỉnh | 04 T5–T9 |
| Sửa `crates/speaker-worker/src/cluster.rs` | `Assignment.updated`, `OnlineClusterer::split` | 04 T8 |
| Sửa `crates/speaker-worker/src/{session.rs, main.rs}` | ráp vào worker, vòng sự kiện, luồng đọc stdin | 04b T10 |
| Tạo `crates/latency-bench/src/names_eval.rs`; sửa `crates/latency-bench/src/main.rs`; tạo `$B/results/04-ghep-ten.md` | đo, chọn ngưỡng tách giọng | 04b T11 |
| Tạo `crates/speaker-worker/src/reader/{macos.rs, eui.rs}`, `crates/speaker-worker/src/bin/ax-record.rs`; sửa `$B/tro-nang/xen_ke.py` | bộ đọc Accessibility thật, dấu EUI, công cụ ghi | 04b T12 |
| Sửa `crates/pipeline/src/{speaker.rs, speaker_client.rs, engine.rs, subtitle.rs}`, `crates/pipeline/tests/speaker_client.rs`, `crates/pipeline/src/bin/fake_speaker_worker.rs` | `Speech`, `SetNames`, mốc giờ, phiên bản, bậc tạm dừng tên, `EventSink::{names, reader}` | 04b T13, T14 |
| Sửa `src-tauri/src/transcript/{speakers.rs, store.rs}`, `src-tauri/src/{session.rs, i18n.rs, commands.rs, actions.rs, lib.rs}`, `src-tauri/src/speaker/mod.rs`; tạo `src-tauri/src/speaker/eui_macos.rs`; sửa `src-tauri/Cargo.toml` | tên tự động, người tham dự, dòng mời, `speakerNames` giữa phiên, trả EUI lúc mở app | 04b T15, T16 |
| Sửa `crates/latency-bench/src/{session.rs, speaker_eval.rs}`; tạo `$B/results/04-do.md` | đo tự động | 04b T18 |
| Tạo `$B/results/04-thu-that.md` | thử thật (cần chủ dự án) | 04b T19–T21 |

---

### Task 0: Mốc ban đầu

**Files:** không

- [ ] **Step 1: Nhánh, trạng thái, đĩa**

Run: `cd $W && git branch --show-current && git log --oneline -1 && git status --short | head -20 && df -k /System/Volumes/Data | tail -1 | awk '{printf "%.1f GiB trống\n", $4/1048576}'`
Expected: `phan-biet-nguoi-noi`; commit mới nhất `72614025 feat(speaker): giao diện người nói …`; `git status --short` chỉ có hai file kế hoạch 04, 04b (chưa track) và những gì chủ dự án báo trước; còn trống ≥ 14 GiB (dưới thì dừng, báo chủ dự án).

- [ ] **Step 2: Test Rust của các crate sẽ sửa** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-protocol 2>&1 | grep -E "^test result" ; cargo test -p speaker-worker 2>&1 | grep -E "^test result" ; cargo test -p pipeline --lib 2>&1 | grep -E "^test result" ; cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result" ; cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result"`
Expected (mốc đã biết, ghi lại số thật vào ghi chú làm việc, không vào repo): `speaker-protocol` 10 đạt; `speaker-worker` lib 65 đạt (cộng các test `#[ignore]` cần model), `worker_process` 9 đạt; `pipeline` lib 353 đạt; `speaker_client` 26 đạt; `meeting-translator --lib` 919 đạt, 6 bỏ qua. Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 3: Giao diện, script, kiểm không mã mạng**

Run: `cd $W && node_modules/.bin/vitest run 2>&1 | tail -4 && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)" && scripts/release/check-no-network.sh`
Expected: `Tests  422 passed`; `# pass` (ghi số), `# fail 0`; `không có mã mạng: speaker-worker speaker-protocol (…)`.

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && git status --short`
Expected: như Step 1. Không commit.

---

### Task 1: Giao thức phiên bản 2

**Files:**
- Modify: `crates/speaker-protocol/src/lib.rs` (hằng dòng 20–37; kiểu mới sau dòng 73; `SpeakerConfig` dòng 75–141; `Request` dòng 143–161; `VoiceInfo`, `Response` dòng 172–210; thêm `voices_fit` sau `read_frame` (dòng 238–266, không đổi); test dòng 281–494)
- Modify (chỗ dựng kiểu cũ): `crates/speaker-worker/src/session.rs`, `crates/speaker-worker/tests/worker_process.rs`, `crates/pipeline/src/speaker_client.rs`, `crates/pipeline/src/engine.rs` (test), `crates/pipeline/src/bin/fake_speaker_worker.rs`

- [ ] **Step 1: Viết test đỏ**

Trong `crates/speaker-protocol/src/lib.rs`, mod `tests`: thay `requests()` (dòng 296–309) và `responses()` (dòng 311–336) bằng:

```rust
    fn requests() -> Vec<Request> {
        vec![
            Request::Load {
                model_path: "/m/eres2net.onnx".into(),
                model_sha256: Some("ab".repeat(32)),
                config: SpeakerConfig::default(),
                names: NamesSetup {
                    enabled: true,
                    recipe_json: "{\"schema\":1}".into(),
                    eui_marker: Some("/d/speaker-eui.json".into()),
                },
            },
            Request::SessionStart {
                unix_ms: 1_793_000_000_000,
            },
            Request::Segment(sample_segment()),
            Request::Shutdown,
            Request::Speech {
                start_ms: 1_000,
                end_ms: 1_512,
            },
            Request::SetNames { enabled: false },
            Request::PauseNames,
        ]
    }

    fn responses() -> Vec<Response> {
        vec![
            Response::Ready {
                protocol_version: PROTOCOL_VERSION,
                model_ok: true,
                reader_platform: ReaderPlatform::MacOs,
            },
            Response::Assign {
                segment_id: 7,
                voice: Some(9),
                confidence: 0.5,
            },
            Response::Voices {
                voices: vec![VoiceInfo {
                    name: PersonName::new("Lan Nguyễn"),
                    name_source: Some(NameSource::Indicator),
                    room_index: Some(2),
                    ..VoiceInfo::new(9, 2_500, true)
                }],
                participants: vec![PersonName::new("Lan Nguyễn").unwrap(), PersonName::new("Minh Trần").unwrap()],
            },
            Response::Merged { from: 2, into: 1 },
            Response::Error {
                segment_id: Some(7),
                kind: ErrorKind::InvalidRequest,
                message: "đoạn sai".into(),
            },
            Response::ReaderState {
                app: Some(MeetingApp::Teams),
                app_version: Some("26276.505".into()),
                state: ReaderStatus::Ok,
                recipe_version: 1,
                learned: 0,
            },
        ]
    }
```

Thay thân `variant_indices_are_pinned` (dòng 359–373) bằng:

```rust
    fn variant_indices_are_pinned() {
        fn index<T: Serialize>(v: &T) -> u8 {
            postcard::to_stdvec(v).unwrap()[0]
        }
        assert_eq!(requests().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3, 4, 5, 6]);
        assert_eq!(responses().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3, 4, 5]);
        assert_eq!([Source::System, Source::Mic, Source::Mixed].map(|s| index(&s)), [0, 1, 2]);
        assert_eq!(
            [ErrorKind::NotLoaded, ErrorKind::InvalidRequest, ErrorKind::Internal].map(|k| index(&k)),
            [0, 1, 2]
        );
        assert_eq!(MeetingApp::ALL.map(|a| index(&a)), [0, 1, 2, 3]);
        assert_eq!(
            [ReaderPlatform::Unsupported, ReaderPlatform::MacOs, ReaderPlatform::Windows].map(|p| index(&p)),
            [0, 1, 2]
        );
        assert_eq!(
            [
                ReaderStatus::Off,
                ReaderStatus::NoMeeting,
                ReaderStatus::NoPermission,
                ReaderStatus::NoNames,
                ReaderStatus::NoSpeaking,
                ReaderStatus::Ok,
                ReaderStatus::Blocked,
                ReaderStatus::Paused
            ]
            .map(|s| index(&s)),
            [0, 1, 2, 3, 4, 5, 6, 7]
        );
        assert_eq!(
            [NameSource::Indicator, NameSource::Mic, NameSource::Learned].map(|s| index(&s)),
            [0, 1, 2]
        );
    }
```

Trong `protocol_version_comes_first_in_ready` (dòng 377–384) thêm trường `reader_platform: ReaderPlatform::Unsupported,` vào `Response::Ready`. Trong `the_default_config_is_the_one_chosen_in_plan_01_and_is_valid` (dòng 441–456) thêm ngay trước `assert_eq!(c.validate(), Ok(()));`:

```rust
        // Tách giọng bị gộp theo tên (spec §5.3, kế hoạch 04): mặc định chốt ở Task 11.
        assert_eq!(
            (c.split, c.split_share, c.split_min_ms, c.split_min_segments, c.split_max_cosine),
            (false, 0.25, 5_000, 3, 0.85)
        );
```

Trong `validate_names_the_first_bad_field` thêm trước dấu `}` cuối:

```rust
        assert_eq!(bad(|c| c.split_share = 0.6), "split_share");
        assert_eq!(bad(|c| c.split_share = 0.0), "split_share");
        assert_eq!(bad(|c| c.split_min_ms = 600_001), "split_min_ms");
        assert_eq!(bad(|c| c.split_min_segments = 0), "split_min_segments");
        assert_eq!(bad(|c| c.split_max_cosine = 1.5), "split_max_cosine");
```

Thêm vào cuối mod `tests`:

```rust
    /// Spec §10: tên người không bao giờ vào log, kể cả khi in cả khung bằng `{:?}`.
    #[test]
    fn names_never_show_in_debug_output() {
        let s = format!("{:?}", responses());
        assert!(!s.contains("Lan") && !s.contains("Minh"), "{s}");
        assert!(s.contains("<tên 10 ký tự>"), "{s}");
        let load = format!("{:?}", requests()[0]);
        assert!(!load.contains("schema") && !load.contains("speaker-eui"), "{load}");
    }

    /// Vòng rà soát 1 (A-Q2): worker khác phiên bản giao thức không bao giờ tới được `Ready`, vì `Load` của phiên bản kia không
    /// giải mã được (thừa hay thiếu byte): worker thoát ngay, app chỉ thấy stdout đóng trước `Ready` (QĐ 26 của kế hoạch 04: log gợi
    /// ý kiểm bản `speaker-worker`). Vì vậy không có cơ chế đọc `protocol_version` trước khi giải mã `Ready`.
    #[test]
    fn a_load_of_another_protocol_version_does_not_decode() {
        let frame = |body: &[u8]| {
            let mut f = (body.len() as u32).to_le_bytes().to_vec();
            f.extend_from_slice(body);
            f
        };
        let load = postcard::to_stdvec(&requests()[0]).unwrap();
        // Phiên bản sau thêm trường ở cuối `Load`: thừa byte.
        let mut longer = load.clone();
        longer.push(0);
        let got = read_frame::<_, Request>(&mut frame(&longer).as_slice());
        assert!(matches!(got, Err(FrameError::TrailingBytes(1))), "{got:?}");
        // Phiên bản trước không có phần cuối của `names`: thiếu byte.
        let shorter = &load[..load.len() - 3];
        assert!(read_frame::<_, Request>(&mut frame(shorter).as_slice()).is_err());
    }

    /// App coi khung của worker là dữ liệu chưa tin (đầu module): tên rỗng hay quá dài, quá nhiều người tham dự là khung hỏng.
    #[test]
    fn voices_fit_limits_names_and_participants() {
        let named = |name: &str| VoiceInfo {
            name: Some(PersonName(name.into())),
            ..VoiceInfo::new(1, 0, false)
        };
        let ok = PersonName::new("Lan").unwrap();
        assert!(voices_fit(&[named("Lan")], std::slice::from_ref(&ok)));
        assert!(!voices_fit(&[named("")], &[]));
        assert!(!voices_fit(&[named(&"x".repeat(MAX_NAME_BYTES + 1))], &[]));
        assert!(!voices_fit(&[], &vec![ok.clone(); MAX_PARTICIPANTS_ON_WIRE + 1]));
        assert!(!voices_fit(&vec![VoiceInfo::new(1, 0, false); MAX_VOICES_ON_WIRE + 1], &[]));
        assert_eq!(PersonName::new(""), None);
        assert_eq!(PersonName::new("x".repeat(MAX_NAME_BYTES + 1)), None);
    }

    /// Danh sách app viết cứng (spec §6.1): công thức đọc không thêm được app.
    #[test]
    fn meeting_apps_have_fixed_bundle_ids() {
        assert_eq!(
            MeetingApp::ALL.map(MeetingApp::macos_bundle_id),
            ["com.microsoft.teams2", "us.zoom.xos", "com.google.Chrome", "com.microsoft.edgemac"]
        );
        assert_eq!(
            MeetingApp::ALL.map(MeetingApp::windows_exe),
            ["ms-teams.exe", "Zoom.exe", "chrome.exe", "msedge.exe"]
        );
        let json = serde_json::to_string(&MeetingApp::MeetChrome).unwrap();
        assert_eq!(json, "\"meet_chrome\"");
    }
```

Test cuối dùng `serde_json`: thêm vào `crates/speaker-protocol/Cargo.toml` mục mới:

```toml
[dev-dependencies]
serde_json.workspace = true
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-protocol 2>&1 | grep -E "^error" | head -5`
Expected: lỗi biên dịch (`NamesSetup`, `ReaderPlatform`, `PersonName` … chưa có).

- [ ] **Step 3: Viết mã**

(a) Thay dòng 36–37 (chú thích `/// Phiên bản giao thức, …` và `pub const PROTOCOL_VERSION: u32 = 1;`) bằng:

```rust
/// Tên người tham dự dài tối đa 40 ký tự (spec §6.3); khung đếm theo byte cho rẻ (40 × 4).
pub const MAX_NAME_BYTES: usize = 160;
/// App coi `Voices` có nhiều người tham dự hơn chừng này là khung hỏng.
pub const MAX_PARTICIPANTS_ON_WIRE: usize = 64;
/// `ReaderState.app_version` dài tối đa chừng này byte.
pub const MAX_APP_VERSION_BYTES: usize = 32;
/// Công thức đọc tối đa 256 KB (spec §7.1).
pub const MAX_RECIPE_BYTES: usize = 256 * 1024;
/// Phiên bản giao thức, trường đầu của `Response::Ready`. App tắt nhận giọng nếu worker báo số khác. Kế hoạch 04: 2.
pub const PROTOCOL_VERSION: u32 = 2;
```

Sửa câu 6–7 của chú thích đầu file thành: `//! - Kế hoạch 02: phần nhận giọng (phiên bản 1). Kế hoạch 04: phần tên (\`Speech\`, \`SetNames\`, \`PauseNames\`, \`ReaderState\`,\n//!   trường tên của [\`VoiceInfo\`], người tham dự; phiên bản 2).`

(b) Thêm sau `impl fmt::Debug for SegmentAudio` (sau dòng 73):

```rust
/// Tên người (tên hiển thị đọc từ app họp, spec §6.3). Tên không bao giờ vào log: `Debug` chỉ in số ký tự.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct PersonName(String);

impl PersonName {
    /// `None` khi rỗng hay dài hơn [`MAX_NAME_BYTES`] byte.
    pub fn new(name: impl Into<String>) -> Option<Self> {
        let name = name.into();
        (!name.is_empty() && name.len() <= MAX_NAME_BYTES).then_some(Self(name))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Trong giới hạn của khung (tên tới từ worker chưa qua [`PersonName::new`]).
    pub fn fits(&self) -> bool {
        !self.0.is_empty() && self.0.len() <= MAX_NAME_BYTES
    }
}

impl fmt::Debug for PersonName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "<tên {} ký tự>", self.0.chars().count())
    }
}

/// App họp đọc được tên (spec §6.1). Danh sách viết cứng: công thức đọc chỉ thu hẹp, không thêm app.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum MeetingApp {
    Teams,
    Zoom,
    MeetChrome,
    MeetEdge,
}

impl MeetingApp {
    /// Theo thứ tự ưu tiên khi nhiều app cùng có cửa sổ họp.
    pub const ALL: [MeetingApp; 4] = [MeetingApp::Teams, MeetingApp::Zoom, MeetingApp::MeetChrome, MeetingApp::MeetEdge];

    pub fn macos_bundle_id(self) -> &'static str {
        match self {
            MeetingApp::Teams => "com.microsoft.teams2",
            MeetingApp::Zoom => "us.zoom.xos",
            MeetingApp::MeetChrome => "com.google.Chrome",
            MeetingApp::MeetEdge => "com.microsoft.edgemac",
        }
    }

    /// Tên file chạy trên Windows (kế hoạch 05).
    pub fn windows_exe(self) -> &'static str {
        match self {
            MeetingApp::Teams => "ms-teams.exe",
            MeetingApp::Zoom => "Zoom.exe",
            MeetingApp::MeetChrome => "chrome.exe",
            MeetingApp::MeetEdge => "msedge.exe",
        }
    }
}

/// Bộ đọc tên mà bản worker này có (`Ready`).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReaderPlatform {
    Unsupported,
    MacOs,
    Windows,
}

/// Trạng thái bộ đọc (spec §7.2; `ReaderState`), không có tên người. `Off`: "Lấy tên" tắt (tên đã xóa); `NoMeeting`: không có app
/// hay cửa sổ họp; `NoPermission`: có app họp đang chạy mà chưa có quyền Trợ năng (macOS); `NoNames`: có cửa sổ họp mà không
/// tìm thấy ô người tham dự; `NoSpeaking`: có tên mà máy có tiếng lâu không ai "đang nói"; `Blocked`: app họp không trả lời;
/// `Paused`: tạm dừng vì quá tải (`PauseNames`), tên đã chốt vẫn giữ.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReaderStatus {
    Off,
    NoMeeting,
    NoPermission,
    NoNames,
    NoSpeaking,
    Ok,
    Blocked,
    Paused,
}

/// Tên của giọng đến từ tín hiệu nào (spec §6.4): chỉ báo của công thức (chữ, phần tử neo), mic của người duy nhất mở mic, hay chỉ
/// báo tự học (6.5).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum NameSource {
    Indicator,
    Mic,
    Learned,
}

/// Phần đọc tên của `Load` (spec §4.2: `names_enabled`, `recipe_json`; QĐ 5, 8 của kế hoạch 04).
#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct NamesSetup {
    /// Công tắc "Lấy tên" lúc chạy worker; đổi giữa phiên bằng `SetNames`.
    pub enabled: bool,
    /// Phần thân công thức đọc (app đã kiểm; worker kiểm lại cấu trúc). Rỗng: không đọc tên.
    pub recipe_json: String,
    /// File dấu `AXEnhancedUserInterface` (macOS) trong thư mục dữ liệu của app.
    pub eui_marker: Option<String>,
}

impl NamesSetup {
    /// Không đọc tên (test, công cụ đo, bản không có công thức).
    pub fn off() -> Self {
        Self::default()
    }
}

// Debug viết tay: công thức dài, đường dẫn dấu có tên thư mục người dùng.
impl fmt::Debug for NamesSetup {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("NamesSetup")
            .field("enabled", &self.enabled)
            .field("recipe_json", &format_args!("<{} byte>", self.recipe_json.len()))
            .field("eui_marker", &self.eui_marker.is_some())
            .finish()
    }
}

/// Dấu các app mà worker đã bật `AXEnhancedUserInterface` (QĐ 8): file JSON, worker ghi trước khi bật, xóa sau khi trả.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
pub struct EuiMarker {
    pub entries: Vec<EuiEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct EuiEntry {
    pub pid: i32,
    pub app: MeetingApp,
}
```

(c) `SpeakerConfig`: thêm năm trường cuối struct (sau `merge_min_ms`):

```rust
    /// Tách giọng bị gộp theo tên thật (spec §5.3). Mặc định chốt ở kế hoạch 04 Task 11; `false` là như trước (giọng gộp không
    /// có tên).
    pub split: bool,
    /// Mỗi tên phải chiếm ít nhất phần này thời gian trùng của giọng (0 < x ≤ 0,5).
    pub split_share: f32,
    /// Mỗi tên phải có ít nhất chừng này ms trùng.
    pub split_min_ms: u64,
    /// Mỗi tên phải có ít nhất chừng này đoạn mang riêng tên đó.
    pub split_min_segments: u32,
    /// Tâm nhúng của hai nhóm đoạn phải khác nhau: cosine không quá số này (một người bị nhận hai tên thì hai tâm rất giống).
    pub split_max_cosine: f32,
```

Trong `Default` thêm sau `merge_min_ms: 10_000,`:

```rust
            split: false,
            split_share: 0.25,
            split_min_ms: 5_000,
            split_min_segments: 3,
            split_max_cosine: 0.85,
```

Trong `validate`, thêm vào cuối mảng `checks` (sau dòng `("merge_min_ms", …)`):

```rust
            ("split_share", self.split_share.is_finite() && self.split_share > 0.0 && self.split_share <= 0.5),
            ("split_min_ms", self.split_min_ms <= 600_000),
            ("split_min_segments", (1..=64).contains(&self.split_min_segments)),
            (
                "split_max_cosine",
                self.split_max_cosine.is_finite() && self.split_max_cosine > 0.0 && self.split_max_cosine <= 1.0,
            ),
```

(d) Thay enum `Request` (dòng 143–161) bằng:

```rust
/// Yêu cầu từ app. Thứ tự: `Load` → `Ready`; `SessionStart` (không trả lời); mỗi `Segment` → `Assign` hay `Error`, có thể kèm
/// `Merged`, `Voices`; `Speech`, `SetNames`, `PauseNames` (không trả lời, có thể kèm `Voices`, `ReaderState`); `Shutdown`: worker
/// thoát.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Request {
    Load {
        model_path: String,
        /// SHA-256 (hex chữ thường) mà app đã kiểm cho file model; worker băm đúng các byte nó đọc (spec §10). `None`: model dev.
        model_sha256: Option<String>,
        config: SpeakerConfig,
        /// Phần đọc tên (kế hoạch 04).
        names: NamesSetup,
    },
    /// Giờ hệ thống (ms Unix) của mốc 0 của phiên (client tính một lần mỗi phiên, QĐ 12 của kế hoạch 04); worker xóa mọi giọng.
    SessionStart {
        unix_ms: u64,
    },
    Segment(SegmentAudio),
    Shutdown,
    /// Khoảng có tiếng nói của âm thanh máy theo VAD, tính từ đầu phiên (spec §4.2): tự hiệu chỉnh, nhịp đọc, mốc giờ.
    Speech {
        start_ms: u64,
        end_ms: u64,
    },
    /// Bật/tắt đọc tên giữa phiên (công tắc "Lấy tên"). Tắt thì xóa mọi tên tự động, người tham dự, chỉ báo tự học.
    SetNames {
        enabled: bool,
    },
    /// Tạm dừng đọc tên tới hết phiên vì worker quá tải (spec §11, QĐ 15 của kế hoạch 04): ngừng đọc và ngừng lập bằng chứng, **giữ**
    /// các tên đã gán. `SetNames` sau đó vẫn có tác dụng (tắt thì xóa tên; bật không bỏ tạm dừng).
    PauseNames,
}
```

(e) Thay `VoiceInfo` và `Response` (dòng 172–210) bằng:

```rust
/// Một giọng đang sống (spec §4.2).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct VoiceInfo {
    pub voice: u32,
    /// Tổng thời lượng tiếng nói đã gán cho giọng này.
    pub speech_ms: u64,
    /// Giọng trong phòng: ≥ 60% thời lượng từ micro (spec §5.5).
    pub mic: bool,
    /// Tên đọc từ app họp (spec §6.6); `None`: chưa đủ bằng chứng.
    pub name: Option<PersonName>,
    pub name_source: Option<NameSource>,
    /// Một tên khớp nhiều giọng (máy chung phòng): thứ tự giọng 1, 2… theo thứ tự xuất hiện.
    pub room_index: Option<u32>,
}

impl VoiceInfo {
    /// Giọng chưa có tên.
    pub fn new(voice: u32, speech_ms: u64, mic: bool) -> Self {
        Self {
            voice,
            speech_ms,
            mic,
            name: None,
            name_source: None,
            room_index: None,
        }
    }
}

/// Phản hồi của worker. Cùng luật chỉ-thêm-ở-cuối như [`Request`].
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Response {
    Ready {
        /// Trường đầu tiên (test `protocol_version_comes_first_in_ready`). Worker khác phiên bản không tới được đây (test
        /// `a_load_of_another_protocol_version_does_not_decode`).
        protocol_version: u32,
        /// `false`: model không nạp được; worker vẫn sống nhưng trả `Error { NotLoaded }` cho mọi đoạn.
        model_ok: bool,
        reader_platform: ReaderPlatform,
    },
    /// `voice` là `None` khi đoạn quá ngắn (hay nhúng không dùng được) mà chưa có giọng nào. Có thể tới lần nữa cho đoạn cũ khi
    /// giọng được tách (kế hoạch 04, QĐ 10).
    Assign {
        segment_id: u64,
        voice: Option<u32>,
        confidence: f32,
    },
    /// Danh sách giọng đang sống và người tham dự đọc được, gửi khi có giọng mới, gộp, tách, cờ trong phòng đổi, tên đổi.
    Voices {
        voices: Vec<VoiceInfo>,
        participants: Vec<PersonName>,
    },
    Merged {
        from: u32,
        into: u32,
    },
    Error {
        segment_id: Option<u64>,
        kind: ErrorKind,
        message: String,
    },
    /// Trạng thái bộ đọc tên (spec §7.2), gửi khi đổi; không có tên người.
    ReaderState {
        app: Option<MeetingApp>,
        app_version: Option<String>,
        state: ReaderStatus,
        recipe_version: u32,
        /// Số chỉ báo tự học được (6.5).
        learned: u32,
    },
}
```

(f) Giữ nguyên `read_frame` (dòng 238–266); thêm ngay sau nó:

```rust
/// `Voices` trong giới hạn (app coi khung vượt là hỏng): ≤ 64 giọng, ≤ 64 người tham dự, mỗi tên không rỗng và ≤ 160 byte.
pub fn voices_fit(voices: &[VoiceInfo], participants: &[PersonName]) -> bool {
    voices.len() <= MAX_VOICES_ON_WIRE
        && participants.len() <= MAX_PARTICIPANTS_ON_WIRE
        && voices
            .iter()
            .filter_map(|v| v.name.as_ref())
            .chain(participants)
            .all(PersonName::fits)
}
```

- [ ] **Step 4: Sửa các chỗ dựng kiểu cũ (cả workspace biên dịch lại được)**

Chỉ thêm trường, không đổi hành vi (Task 10, 13 mới dùng các trường mới):

| File, dòng hiện tại | Sửa |
|---|---|
| `crates/speaker-worker/src/session.rs:17-20` (`use speaker_protocol::{…}`) | thêm `ReaderPlatform` vào danh sách; trong `mod tests` (sau `use super::*;`) thêm `use speaker_protocol::NamesSetup;` |
| `session.rs:94-98` (`Request::Load { model_path, model_sha256, config }`) | thành `Request::Load { model_path, model_sha256, config, names: _ }`; thêm một nhánh trước `Request::Shutdown`: `Request::Speech { .. } \| Request::SetNames { .. } \| Request::PauseNames => Step::Reply(Vec::new()),` |
| `session.rs:147-150` (`Response::Ready {…}` trong `load`) | thêm `reader_platform: ReaderPlatform::Unsupported,` |
| `session.rs:170-179` (thân `map` của `voices()`) | thành `.map(\|voice\| { let t = self.tally.get(&voice).copied().unwrap_or_default(); VoiceInfo::new(voice, t.speech_ms, t.room()) })` |
| `session.rs:243` | `out.push(Response::Voices { voices: self.voices(), participants: Vec::new() });` |
| `session.rs:288-292`, `:372-376`, `:521-525` (`Request::Load {` trong test) | thêm dòng `names: NamesSetup::off(),` |
| `session.rs:313-324` (helper `voices` của test) | `Response::Voices { voices: list.iter().map(\|&(voice, mic)\| VoiceInfo::new(voice, 0, mic)).collect(), participants: Vec::new() }` |
| `session.rs:330-332` (`strip`) | `Response::Voices { voices, participants } => Response::Voices { voices: voices.into_iter().map(\|v\| VoiceInfo { speech_ms: 0, ..v }).collect(), participants },` |
| `session.rs:350-353` (`ready` của test) | thêm `reader_platform: ReaderPlatform::Unsupported,` |
| `crates/speaker-worker/tests/worker_process.rs:159`, `:198`, `:250`, `:329`, `:377` (`Request::Load {`) | thêm `names: NamesSetup::off(),` và `NamesSetup` vào `use speaker_protocol::{…}` đầu file |
| `worker_process.rs:166-169`, `:205-208`, `:257-260` (`Response::Ready {…}`) | thêm `reader_platform: ReaderPlatform::Unsupported` (và `ReaderPlatform` vào `use`); Task 10 đổi thành `MacOs` trên macOS |
| `worker_process.rs:187`, `:363` | `Response::Voices { voices, .. } if voices.len() == 1` |
| `crates/pipeline/src/speaker_client.rs:419-423` (`Request::Load {` trong `Run::spawn`) | thêm `names: speaker_protocol::NamesSetup::off(),` (Task 13 thay bằng `launch.names`) |
| `speaker_client.rs:637-647` (`Response::Ready { protocol_version, model_ok }`) | `Response::Ready { protocol_version, model_ok, .. }` |
| `speaker_client.rs:635-707` (`match response` trong `read_loop`: không có nhánh đại diện không điều kiện, nhánh `_ if !ready` có điều kiện) | thêm trước dấu `}` đóng của `match`: `Response::ReaderState { .. } => {}` (Task 13 thay bằng nhánh thật). Thiếu nhánh này thì `cargo test -p pipeline` lỗi `E0004 non-exhaustive patterns` (rà soát A-C2.4) |
| `speaker_client.rs:663`, `:666` | `Response::Voices { voices, .. }` |
| `speaker_client.rs:724-726` (`too_big_voice`) | `Response::Voices { voices, .. } => …`; dòng cuối `Response::Ready { .. } \| Response::Error { .. } \| Response::ReaderState { .. } => None,` |
| `crates/pipeline/src/bin/fake_speaker_worker.rs:104-108` | `Request::Load { model_path, model_sha256, config, .. } => {` |
| `fake_speaker_worker.rs:116-119` | thêm `reader_platform: speaker_protocol::ReaderPlatform::Unsupported,` |
| `fake_speaker_worker.rs:189-196`, `:199-203`, `:204-206`, `:208-216` | mọi `VoiceInfo { voice, speech_ms: X, mic: false }` thành `VoiceInfo::new(voice, X, false)`; mọi `Response::Voices { voices: … }` thêm `participants: Vec::new(),` |
| `fake_speaker_worker.rs` (nhánh `match request` cuối) | thêm `Request::Speech { .. } \| Request::SetNames { .. } \| Request::PauseNames => Vec::new(),` trước nhánh `Shutdown` |
| `crates/pipeline/src/engine.rs:5681-5685`, `:5717-5721`, `:5742-5746`, `:5876-5880` (test) | `VoiceInfo { voice, speech_ms: 1_000, mic: false }` thành `VoiceInfo::new(voice, 1_000, false)`; `VoiceInfo { voice, speech_ms: 1_000, mic }` thành `VoiceInfo::new(voice, 1_000, mic)`; `VoiceInfo { voice: 1, speech_ms: 1_000, mic: false }` thành `VoiceInfo::new(1, 1_000, false)` |

Kiểm còn sót: `cd $W && grep -rn --include='*.rs' -E "VoiceInfo \{$|Response::Voices \{ voices \}" crates src-tauri/src`
Expected: chỉ còn định nghĩa `pub struct VoiceInfo {` ở `crates/speaker-protocol/src/lib.rs` và các chỗ có `..v`/`..VoiceInfo::new(…)`.

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-protocol 2>&1 | grep -E "^test result|FAILED|panicked" ; cargo test -p speaker-worker 2>&1 | grep -E "^test result|FAILED|panicked" ; cargo test -p pipeline --lib -- speaker 2>&1 | grep -E "^test result|FAILED" ; cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result|FAILED"`
Expected: `speaker-protocol` 14 đạt (10 cũ + 4 mới); `speaker-worker` lib 65, `worker_process` 9; `pipeline` các test `speaker` và `speaker_client` 26 đạt như mốc.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-protocol -p speaker-worker -p pipeline && cargo fmt -p speaker-protocol -p speaker-worker -p pipeline -- --check && cargo clippy -p speaker-protocol -p speaker-worker -p pipeline --all-targets -- -D warnings 2>&1 | tail -2 && git status --short`
Expected: fmt sạch; clippy `Finished`, 0 cảnh báo; `git status --short` thêm các file đã sửa ở bảng trên. Không commit.

---
### Task 2: Crate `speaker-recipe` và công thức build sẵn

**Files:**
- Create: `crates/speaker-recipe/Cargo.toml`, `crates/speaker-recipe/src/lib.rs`
- Create: `scripts/speaker-recipes/recipes.json`
- Modify: `scripts/release/check-no-network.sh:13`, `:25-27` (thêm `speaker-recipe` vào danh sách mặc định), `.github/workflows/ci.yml:61`

- [ ] **Step 1: Tạo crate với test đỏ**

`crates/speaker-recipe/Cargo.toml`:

```toml
[package]
name = "speaker-recipe"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

# Công thức đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.1): định dạng, kiểm, biên dịch mẫu chữ. Chỉ mô tả, không
# mã, không I/O. App (kế hoạch 06 thêm kiểm chữ ký trước `parse`) và `speaker-worker` dùng chung. Không có mã mạng.
[dependencies]
# Mẫu chữ thời gian tuyến tính (không làm treo được). Cùng bản `Cargo.lock` và app đang dùng; bản mới nhất trên crates.io
# (`cargo search regex`, 2026-10-27).
regex = "1.13.1"
serde.workspace = true
serde_json.workspace = true
speaker-protocol = { path = "../speaker-protocol" }
thiserror.workspace = true
```

`crates/speaker-recipe/src/lib.rs` (chỉ phần test trước; phần mã ở Step 3):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn teams() -> AppRecipe {
        parse(BUILTIN_JSON).unwrap().app(Os::Macos, MeetingApp::Teams).unwrap().clone()
    }

    /// Một mục Teams tối thiểu hợp lệ, cộng các mục `extra` (chuỗi JSON bắt đầu bằng dấu phẩy).
    fn with_apps(extra: &str) -> String {
        format!(
            r#"{{"schema":1,"version":3,"min_app_version":"0.3.2","apps":[{{"app":"teams","os":"macos","window_title":["^M"],"tile":{{"role":"AXMenuItem","label":"^(?P<name>.+)$"}},"name_from":"label","speaking":[{{"kind":"presence","anchor":{{"scope":"child","class_token":"x"}}}}],"delay_ms":900}}{extra}]}}"#
        )
    }

    /// QĐ 16, 32 của kế hoạch 04: bản build sẵn chỉ có Teams. Zoom chưa có bản ghi thật (rà soát A-Q11); Meet không có chỉ báo ở cửa
    /// sổ người nghe (rà soát lần 2 A-Q1). Task 21 thêm lại khi đạt tiêu chí và chủ dự án đồng ý.
    #[test]
    fn the_builtin_recipes_cover_only_teams_on_macos() {
        let r = parse(BUILTIN_JSON).unwrap();
        assert!(r.dropped.is_empty(), "{:?}", r.dropped);
        assert!(r.version >= 1);
        assert!(r.app(Os::Macos, MeetingApp::Teams).is_some());
        for app in [MeetingApp::Zoom, MeetingApp::MeetChrome, MeetingApp::MeetEdge] {
            assert!(r.app(Os::Macos, app).is_none(), "{app:?} tắt mặc định");
        }
        assert!(!r.has_os(Os::Windows), "kế hoạch 05 thêm Windows");
    }

    /// Spec §7.1: app trong công thức phải thuộc danh sách viết cứng, không thì bỏ cả mục đó; mục khác vẫn dùng.
    #[test]
    fn an_app_outside_the_list_drops_only_its_entry() {
        let json = with_apps(r#",{"app":"webex","os":"macos","window_title":["^W"],"tile":{"role":"AXGroup"},"name_from":"text","speaking":[{"kind":"presence","anchor":{"scope":"child","role":"AXGroup"}}],"delay_ms":500}"#);
        let r = parse(&json).unwrap();
        assert_eq!(r.apps.len(), 1);
        assert_eq!(r.dropped.len(), 1, "{:?}", r.dropped);
        assert_eq!(r.version, 3);
        let teams_entry = r#"{"app":"teams","os":"macos","window_title":["^M"],"tile":{"role":"AXMenuItem","label":"^(?P<name>.+)$"},"name_from":"label","speaking":[{"kind":"presence","anchor":{"scope":"child","class_token":"x"}}],"delay_ms":900}"#;
        let r = parse(&with_apps(&format!(",{teams_entry}"))).unwrap();
        assert_eq!((r.apps.len(), r.dropped.len()), (1, 1), "mục trùng app bị bỏ");
    }

    #[test]
    fn size_schema_and_pattern_limits_are_enforced() {
        // `Recipes` chứa `Regex` (không có `PartialEq`): so lỗi, không so cả `Result` (rà soát A-C2.1, lỗi E0369).
        assert_eq!(
            parse(&" ".repeat(speaker_protocol::MAX_RECIPE_BYTES + 1)).unwrap_err(),
            RecipeError::TooBig(speaker_protocol::MAX_RECIPE_BYTES + 1)
        );
        assert_eq!(
            parse(&with_apps("").replace("\"schema\":1", "\"schema\":2")).unwrap_err(),
            RecipeError::Schema(2)
        );
        assert!(matches!(parse("{"), Err(RecipeError::Json(_))));
        let long = with_apps("").replace("^M", &format!("^{}", "a".repeat(MAX_PATTERN_CHARS)));
        let r = parse(&long).unwrap();
        assert!(r.apps.is_empty() && r.dropped[0].contains("256"), "{:?}", r.dropped);
        let slow = with_apps("").replace("\"delay_ms\":900", "\"delay_ms\":9000");
        assert!(parse(&slow).unwrap().apps.is_empty());
    }

    #[test]
    fn signals_need_what_they_read() {
        let no_group = with_apps("").replace(r#"{"kind":"presence","anchor":{"scope":"child","class_token":"x"}}"#, r#"{"kind":"label"}"#);
        assert!(parse(&no_group).unwrap().apps.is_empty(), "chữ đang nói cần nhóm `speaking`");
        let no_anchor = with_apps("").replace(r#","anchor":{"scope":"child","class_token":"x"}"#, "");
        assert!(parse(&no_anchor).unwrap().apps.is_empty(), "tín hiệu hành vi cần phần tử neo");
        let shapeless = with_apps("").replace(r#""class_token":"x""#, r#""max_depth":2"#);
        assert!(parse(&shapeless).unwrap().apps.is_empty(), "neo không ràng buộc gì thì khớp mọi phần tử");
        let no_name = with_apps("").replace("(?P<name>.+)", "(.+)");
        assert!(parse(&no_name).unwrap().apps.is_empty(), "lấy tên từ nhãn cần nhóm `name`");
        let shapeless_tile = with_apps("").replace(r#""role":"AXMenuItem","label""#, r#""label""#);
        assert!(
            parse(&shapeless_tile).unwrap().apps.is_empty(),
            "ô không ràng buộc hình dạng thì bộ đọc phải đọc chữ mọi phần tử (QĐ 3): bỏ"
        );
    }

    /// Spec §6.3: bỏ hậu tố theo công thức, tối đa 40 ký tự; không còn gì thì không có tên.
    #[test]
    fn names_are_tidied_by_the_recipe() {
        let t = teams();
        assert_eq!(tidy_name("Minh (Guest)", &t).as_deref(), Some("Minh"));
        assert_eq!(tidy_name("  Lan \n Nguyễn  (Khách)", &t).as_deref(), Some("Lan Nguyễn"));
        assert_eq!(tidy_name(&"ạ".repeat(60), &t).map(|n| n.chars().count()), Some(MAX_NAME_CHARS));
        assert_eq!(tidy_name(" (Guest)", &t), None);
    }

    /// Ba dạng nhãn ô video của Teams trong bản ghi của kế hoạch 01 (`results/teams-chrome.md`).
    #[test]
    fn teams_tile_labels_give_name_mute_and_self() {
        let t = teams();
        let re = t.tile.label.as_ref().unwrap();
        let c = re.captures("Minh (Guest), Context menu is available").unwrap();
        assert_eq!((&c["name"], c.name("muted").is_none(), c.name("self").is_none()), ("Minh (Guest)", true, true));
        let c = re.captures("Lan (Guest), muted, Context menu is available").unwrap();
        assert_eq!((&c["name"], &c["muted"]), ("Lan (Guest)", "muted"));
        let c = re.captures("Myself video, Hoa Phạm, Muted, Has context menu").unwrap();
        assert_eq!((&c["name"], &c["muted"], &c["self"]), ("Hoa Phạm", "Muted", "Myself video"));
        assert!(re.captures("Chat, 3 unread").is_none());
    }

    #[test]
    fn matchers_check_every_given_field() {
        let m = Matcher {
            role: Some("AXGroup".into()),
            class_token: Some("oZRSLe".into()),
            ..Matcher::default()
        };
        let mut a = Attrs {
            role: "AXGroup".into(),
            classes: vec!["x".into(), "oZRSLe".into()],
            ..Attrs::default()
        };
        assert!(m.matches_shape(&a) && m.matches(&a) && !m.needs_text() && !m.shapeless());
        a.classes.pop();
        assert!(!m.matches_shape(&a));
        assert!(Matcher::default().shapeless());
        assert!(!teams().tile.shapeless(), "ô Teams ràng buộc vai trò");
        assert!(format!("{a:?}").starts_with("Attrs(AXGroup/"), "Debug không có chữ");
    }
}
```

Thêm `"crates/speaker-recipe"` không cần sửa `Cargo.toml` gốc (`members = ["crates/*", "src-tauri"]`).

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-recipe 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`parse`, `AppRecipe`, `BUILTIN_JSON` … chưa có; file `recipes.json` chưa có).

- [ ] **Step 3: Viết công thức build sẵn và mã**

`scripts/speaker-recipes/recipes.json` (số liệu: `results/teams-chrome.md`, spec §3, §6.1, §6.4; QĐ 17 cho độ trễ). **Chỉ có Teams.** Không có mục Zoom (QĐ 16: chờ bản ghi thật ở Task 21; công thức Zoom tổng hợp cho test nằm riêng ở `fixtures/zoom-macos-synthetic.recipes.json`, Task 3) và **không có mục Meet** (QĐ 32: ở cửa sổ người nghe không có chỉ báo, không gán được tên người ở xa; công thức Meet nằm riêng ở `fixtures/meet-macos.recipes.json` cho test và thử thật, Task 3):

```json
{
  "schema": 1,
  "version": 1,
  "min_app_version": "0.3.2",
  "apps": [
    {
      "app": "teams",
      "os": "macos",
      "window_title": ["^Meeting with ", "^Meeting in ", "^Cuộc họp với ", "^Cuộc họp trong "],
      "confirm_id": "hangup-button",
      "enhanced_ui": true,
      "tile": {
        "role": "AXMenuItem",
        "label": "^(?:(?P<self>Myself video), )?(?P<name>[^,]{1,120}?)(?:, (?P<muted>[Mm]uted))?, (?:Context menu is available|Has context menu)$"
      },
      "name_from": "label",
      "name_suffixes": ["\\s*\\((?:Guest|Khách|Host|Organizer|Người tổ chức|External|Bên ngoài)\\)$"],
      "mic": { "muted_values": ["muted", "Muted"], "absent_means_unmuted": true },
      "speaking": [
        { "kind": "presence", "anchor": { "scope": "child", "role": "AXGroup", "class_token": "vdi-frame-occlusion" } }
      ],
      "delay_ms": 900
    }
  ]
}
```

`crates/speaker-recipe/src/lib.rs`, đặt trước mod `tests`:

```rust
//! Công thức đọc tên người nói từ app họp (spec 2026-10-26-phan-biet-nguoi-noi §7.1): định dạng, kiểm, biên dịch mẫu chữ. Chỉ mô
//! tả, không mã. App và `speaker-worker` dùng chung; worker kiểm lại mọi công thức app gửi.
//!
//! - Bản build sẵn: `scripts/speaker-recipes/recipes.json`, nhúng vào [`BUILTIN_JSON`].
//! - Giới hạn an toàn: cả file ≤ 256 KB; mỗi mẫu chữ ≤ 256 ký tự, crate `regex` (thời gian tuyến tính); app phải thuộc danh sách
//!   viết cứng (`speaker_protocol::MeetingApp`), không thì bỏ cả mục; mục sai nào bị bỏ riêng mục đó, mục khác vẫn dùng.
//! - Kế hoạch 06 thêm phong bì ký, tải từ xa, chống quay lui ở app, rồi gọi [`parse`] lên phần thân như bản build sẵn.
//! - Công thức không có tên người; lý do bỏ mục (`Recipes::dropped`) không chứa chữ đọc từ app họp. [`Attrs`] có thể chứa chữ của
//!   app họp nên `Debug` chỉ in vai trò.

#![forbid(unsafe_code)]

use std::fmt;

use regex::{Regex, RegexBuilder};
use serde::Deserialize;
pub use speaker_protocol::MeetingApp;
use speaker_protocol::MAX_RECIPE_BYTES;

/// Công thức build sẵn trong app.
pub const BUILTIN_JSON: &str = include_str!("../../../scripts/speaker-recipes/recipes.json");
/// Phiên bản định dạng app này đọc.
pub const SCHEMA: u32 = 1;
pub const MAX_PATTERN_CHARS: usize = 256;
pub const MAX_APPS: usize = 16;
pub const MAX_SIGNALS: usize = 8;
pub const MAX_PATTERNS: usize = 16;
pub const MAX_DELAY_MS: u32 = 5_000;
pub const MAX_ANCHOR_DEPTH: u32 = 8;
/// Tên dài tối đa 40 ký tự (spec §6.3).
pub const MAX_NAME_CHARS: usize = 40;
/// Bộ nhớ tối đa của một mẫu chữ đã biên dịch.
const REGEX_SIZE_LIMIT: usize = 1 << 20;

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Windows,
}

impl Os {
    /// Hệ điều hành đang chạy; `None` trên nền tảng không có bộ đọc.
    pub fn current() -> Option<Os> {
        if cfg!(target_os = "macos") {
            Some(Os::Macos)
        } else if cfg!(windows) {
            Some(Os::Windows)
        } else {
            None
        }
    }
}

/// Thuộc tính một phần tử giao diện mà bộ đọc dùng (macOS: AXRole, AXSubrole, AXTitle, AXDescription, AXValue, AXIdentifier,
/// AXDOMIdentifier, AXDOMClassList; Windows ở kế hoạch 05). Có thể chứa chữ của app họp: không in ra log.
#[derive(Clone, Default, PartialEq, Eq, Hash)]
pub struct Attrs {
    pub role: String,
    pub subrole: String,
    pub title: String,
    pub desc: String,
    pub value: String,
    pub ident: String,
    pub dom_id: String,
    pub classes: Vec<String>,
}

impl Attrs {
    /// Nhãn: mô tả, không có thì tiêu đề.
    pub fn label(&self) -> &str {
        if self.desc.is_empty() { &self.title } else { &self.desc }
    }

    pub fn has_text(&self) -> bool {
        !(self.title.is_empty() && self.desc.is_empty() && self.value.is_empty())
    }
}

impl fmt::Debug for Attrs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Attrs({}/{}, {} lớp, có chữ: {})", self.role, self.subrole, self.classes.len(), self.has_text())
    }
}

/// Điều kiện khớp một phần tử; trường `None` là không xét.
#[derive(Debug, Clone, Default)]
pub struct Matcher {
    pub role: Option<String>,
    pub subrole: Option<String>,
    /// Một lớp trong `AXDOMClassList`.
    pub class_token: Option<String>,
    /// Tiền tố của `AXIdentifier` hay `AXDOMIdentifier`.
    pub id_prefix: Option<String>,
    /// Mẫu chữ trên nhãn ([`Attrs::label`]); nhóm `name`, `muted`, `self`, `speaking` nếu có.
    pub label: Option<Regex>,
}

impl Matcher {
    /// Khớp phần không cần chữ: vai trò, vai trò phụ, lớp, id (QĐ 3 của kế hoạch 04: chữ chỉ đọc khi phần này đã khớp).
    pub fn matches_shape(&self, a: &Attrs) -> bool {
        self.role.as_ref().is_none_or(|r| a.role == *r)
            && self.subrole.as_ref().is_none_or(|r| a.subrole == *r)
            && self.class_token.as_ref().is_none_or(|c| a.classes.iter().any(|x| x == c))
            && self
                .id_prefix
                .as_ref()
                .is_none_or(|p| a.ident.starts_with(p.as_str()) || a.dom_id.starts_with(p.as_str()))
    }

    /// Cần đọc chữ (nhãn) mới biết có khớp không.
    pub fn needs_text(&self) -> bool {
        self.label.is_some()
    }

    /// Khớp đủ; `a` phải đã có chữ khi [`Matcher::needs_text`].
    pub fn matches(&self, a: &Attrs) -> bool {
        self.matches_shape(a) && self.label.as_ref().is_none_or(|re| re.is_match(a.label()))
    }

    /// Không ràng buộc hình dạng nào: bộ đọc phải đọc chữ của mọi phần tử để khớp.
    pub fn shapeless(&self) -> bool {
        self.role.is_none() && self.subrole.is_none() && self.class_token.is_none() && self.id_prefix.is_none()
    }
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NameFrom {
    /// Nhóm `name` của mẫu nhãn ô (Teams, Zoom).
    Label,
    /// Chữ tĩnh đầu tiên trong ô (Meet).
    Text,
}

/// Trạng thái mic đọc từ nhóm `muted` của nhãn ô (tín hiệu 3, spec §6.4).
#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct MicRule {
    pub muted_values: Vec<String>,
    /// Nhãn không có nhóm `muted` nghĩa là mic mở (Teams chỉ ghi "muted" khi tắt).
    #[serde(default)]
    pub absent_means_unmuted: bool,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SignalKind {
    /// Tín hiệu 1: nhóm `speaking` của mẫu nhãn ô không rỗng.
    Label,
    /// Tín hiệu 2: phần tử neo chỉ có mặt khi nói.
    Presence,
    /// Tín hiệu 2: phần tử neo đổi trạng thái ≥ 2 lần trong 1 s.
    Flicker,
    /// Tín hiệu 2: phần tử neo khác trạng thái thường gặp nhất của chính nó.
    Deviation,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    /// Con trực tiếp của ô.
    Child,
    /// Phần tử bên trong ô, sâu tối đa `max_depth`.
    Descendant,
}

#[derive(Debug, Clone)]
pub struct Anchor {
    pub scope: Scope,
    pub matcher: Matcher,
    pub max_depth: u32,
}

#[derive(Debug, Clone)]
pub struct Signal {
    pub kind: SignalKind,
    pub anchor: Option<Anchor>,
}

/// Công thức của một app trên một hệ điều hành.
#[derive(Debug, Clone)]
pub struct AppRecipe {
    pub app: MeetingApp,
    pub os: Os,
    /// Cửa sổ họp: tiêu đề khớp một mẫu, hay id cửa sổ khớp `window_id`.
    pub window_title: Vec<Regex>,
    pub window_id: Option<Regex>,
    /// Chỉ đọc trong vùng web (`AXWebArea`) có tiêu đề khớp `window_title` (trình duyệt).
    pub web_only: bool,
    /// Đặt `AXEnhancedUserInterface` khi gặp cửa sổ họp (spec §6.2).
    pub enhanced_ui: bool,
    /// Id phải có trong cửa sổ (Teams: nút rời cuộc gọi); không có thì không phải cửa sổ họp.
    pub confirm_id: Option<String>,
    pub tile: Matcher,
    pub name_from: NameFrom,
    pub name_suffixes: Vec<Regex>,
    /// Tên thô khớp mẫu này là chính người dùng.
    pub self_name: Option<Regex>,
    pub mic: Option<MicRule>,
    /// Theo thứ tự ưu tiên (spec §6.4).
    pub speaking: Vec<Signal>,
    /// Độ trễ của chỉ báo so với lúc nói (spec §6.6), ms.
    pub delay_ms: u32,
}

#[derive(Debug, Clone)]
pub struct Recipes {
    pub version: u32,
    pub min_app_version: String,
    pub apps: Vec<AppRecipe>,
    /// Lý do bỏ từng mục (cho log), không có chữ của app họp.
    pub dropped: Vec<String>,
}

impl Recipes {
    pub fn app(&self, os: Os, app: MeetingApp) -> Option<&AppRecipe> {
        self.apps.iter().find(|a| a.os == os && a.app == app)
    }

    pub fn has_os(&self, os: Os) -> bool {
        self.apps.iter().any(|a| a.os == os)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RecipeError {
    #[error("công thức dài {0} byte, vượt 256 KB")]
    TooBig(usize),
    #[error("công thức không đúng dạng JSON: {0}")]
    Json(String),
    #[error("công thức có schema {0}, bản này đọc schema {SCHEMA}")]
    Schema(u32),
}

#[derive(Deserialize)]
struct RawRecipes {
    schema: u32,
    version: u32,
    #[serde(default)]
    min_app_version: String,
    apps: Vec<serde_json::Value>,
}

#[derive(Deserialize, Default)]
struct RawMatcher {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    subrole: Option<String>,
    #[serde(default)]
    class_token: Option<String>,
    #[serde(default)]
    id_prefix: Option<String>,
    #[serde(default)]
    label: Option<String>,
}

fn one() -> u32 {
    1
}

#[derive(Deserialize)]
struct RawAnchor {
    scope: Scope,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    subrole: Option<String>,
    #[serde(default)]
    class_token: Option<String>,
    #[serde(default)]
    id_prefix: Option<String>,
    #[serde(default = "one")]
    max_depth: u32,
}

#[derive(Deserialize)]
struct RawSignal {
    kind: SignalKind,
    #[serde(default)]
    anchor: Option<RawAnchor>,
}

#[derive(Deserialize)]
struct RawApp {
    app: MeetingApp,
    os: Os,
    #[serde(default)]
    window_title: Vec<String>,
    #[serde(default)]
    window_id: Option<String>,
    #[serde(default)]
    web_only: bool,
    #[serde(default)]
    enhanced_ui: bool,
    #[serde(default)]
    confirm_id: Option<String>,
    tile: RawMatcher,
    name_from: NameFrom,
    #[serde(default)]
    name_suffixes: Vec<String>,
    #[serde(default)]
    self_name: Option<String>,
    #[serde(default)]
    mic: Option<MicRule>,
    speaking: Vec<RawSignal>,
    delay_ms: u32,
}

/// Đọc và kiểm một công thức (phần thân; kế hoạch 06 kiểm chữ ký trước). Lỗi cả file (quá lớn, không phải JSON, schema khác) thì
/// `Err`; mục sai thì bỏ riêng mục đó (`Recipes::dropped`).
pub fn parse(json: &str) -> Result<Recipes, RecipeError> {
    if json.len() > MAX_RECIPE_BYTES {
        return Err(RecipeError::TooBig(json.len()));
    }
    let raw: RawRecipes = serde_json::from_str(json).map_err(|e| RecipeError::Json(e.to_string()))?;
    if raw.schema != SCHEMA {
        return Err(RecipeError::Schema(raw.schema));
    }
    let mut apps: Vec<AppRecipe> = Vec::new();
    let mut dropped = Vec::new();
    for (i, value) in raw.apps.into_iter().enumerate() {
        if i >= MAX_APPS {
            dropped.push(format!("mục {i}: quá {MAX_APPS} mục"));
            continue;
        }
        let compiled = serde_json::from_value::<RawApp>(value)
            .map_err(|e| format!("sai dạng ({e})"))
            .and_then(compile_app);
        match compiled {
            Ok(a) if apps.iter().any(|b| b.app == a.app && b.os == a.os) => dropped.push(format!("mục {i}: trùng app")),
            Ok(a) => apps.push(a),
            Err(why) => dropped.push(format!("mục {i}: {why}")),
        }
    }
    Ok(Recipes {
        version: raw.version,
        min_app_version: raw.min_app_version,
        apps,
        dropped,
    })
}

fn pattern(s: &str) -> Result<Regex, String> {
    if s.chars().count() > MAX_PATTERN_CHARS {
        return Err(format!("mẫu chữ dài quá {MAX_PATTERN_CHARS} ký tự"));
    }
    RegexBuilder::new(s)
        .size_limit(REGEX_SIZE_LIMIT)
        .build()
        .map_err(|_| "mẫu chữ sai".to_string())
}

fn patterns(list: &[String]) -> Result<Vec<Regex>, String> {
    if list.len() > MAX_PATTERNS {
        return Err(format!("quá {MAX_PATTERNS} mẫu chữ"));
    }
    list.iter().map(|s| pattern(s)).collect()
}

fn has_group(re: &Option<Regex>, name: &str) -> bool {
    re.as_ref().is_some_and(|re| re.capture_names().flatten().any(|n| n == name))
}

fn compile_app(r: RawApp) -> Result<AppRecipe, String> {
    let tile = Matcher {
        role: r.tile.role,
        subrole: r.tile.subrole,
        class_token: r.tile.class_token,
        id_prefix: r.tile.id_prefix,
        label: r.tile.label.as_deref().map(pattern).transpose()?,
    };
    if r.name_from == NameFrom::Label && !has_group(&tile.label, "name") {
        return Err("lấy tên từ nhãn mà mẫu nhãn không có nhóm `name`".into());
    }
    if r.speaking.is_empty() || r.speaking.len() > MAX_SIGNALS {
        return Err(format!("cần 1–{MAX_SIGNALS} tín hiệu đang nói"));
    }
    if r.delay_ms > MAX_DELAY_MS {
        return Err(format!("độ trễ quá {MAX_DELAY_MS} ms"));
    }
    if r.window_title.is_empty() && r.window_id.is_none() {
        return Err("không có quy tắc nhận cửa sổ họp".into());
    }
    if tile.shapeless() {
        // QĐ 3 của kế hoạch 04 (rà soát A-Q11): ô không ràng buộc vai trò, lớp hay id thì bộ đọc phải đọc chữ (hay coi là ô) mọi
        // phần tử của cửa sổ họp, kể cả khung chat.
        return Err("ô phải có vai trò, vai trò phụ, lớp hay id".into());
    }
    let mut speaking = Vec::new();
    for s in r.speaking {
        let anchor = match (s.kind, s.anchor) {
            (SignalKind::Label, _) => {
                if !has_group(&tile.label, "speaking") {
                    return Err("tín hiệu chữ mà mẫu nhãn không có nhóm `speaking`".into());
                }
                None
            }
            (_, None) => return Err("tín hiệu hành vi cần phần tử neo".into()),
            (_, Some(a)) => {
                if a.role.is_none() && a.subrole.is_none() && a.class_token.is_none() && a.id_prefix.is_none() {
                    return Err("phần tử neo phải có vai trò, lớp hay id".into());
                }
                if a.max_depth == 0 || a.max_depth > MAX_ANCHOR_DEPTH {
                    return Err(format!("độ sâu của neo phải trong 1–{MAX_ANCHOR_DEPTH}"));
                }
                Some(Anchor {
                    scope: a.scope,
                    max_depth: if a.scope == Scope::Child { 1 } else { a.max_depth },
                    matcher: Matcher {
                        role: a.role,
                        subrole: a.subrole,
                        class_token: a.class_token,
                        id_prefix: a.id_prefix,
                        label: None,
                    },
                })
            }
        };
        speaking.push(Signal { kind: s.kind, anchor });
    }
    Ok(AppRecipe {
        app: r.app,
        os: r.os,
        window_title: patterns(&r.window_title)?,
        window_id: r.window_id.as_deref().map(pattern).transpose()?,
        web_only: r.web_only,
        enhanced_ui: r.enhanced_ui,
        confirm_id: r.confirm_id,
        tile,
        name_from: r.name_from,
        name_suffixes: patterns(&r.name_suffixes)?,
        self_name: r.self_name.as_deref().map(pattern).transpose()?,
        mic: r.mic,
        speaking,
        delay_ms: r.delay_ms,
    })
}

/// Làm gọn tên đọc từ ô (spec §6.3): ký tự điều khiển thành khoảng trắng, bỏ hậu tố theo công thức, gộp khoảng trắng, tối đa 40
/// ký tự. App còn làm sạch lần nữa bằng `clean_name` (ký tự định dạng vô hình) trước khi hiện.
pub fn tidy_name(raw: &str, app: &AppRecipe) -> Option<String> {
    let mut name: String = raw.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    name = name.trim().to_string();
    for re in &app.name_suffixes {
        name = re.replace(&name, "").into_owned();
    }
    let joined = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let cut: String = joined.chars().take(MAX_NAME_CHARS).collect();
    let cut = cut.trim_end().to_string();
    (!cut.is_empty()).then_some(cut)
}

/// Tên thô là chính người dùng (spec §6.6: "(me)" của Zoom, "Bạn"/"You" của Meet; Teams dùng nhóm `self` của nhãn).
pub fn is_self_name(raw: &str, app: &AppRecipe) -> bool {
    app.self_name.as_ref().is_some_and(|re| re.is_match(raw.trim()))
}
```

Sửa `scripts/release/check-no-network.sh`: dòng 13 thành `# Không có gì: lớp 1–3 cho speaker-worker, speaker-protocol và speaker-recipe. Chỉ \`--binary\`: chỉ lớp 4, không gọi cargo (job ký của`; dòng 26 thành `  set -- speaker-worker speaker-protocol speaker-recipe`. Sửa `.github/workflows/ci.yml:61` thành `        run: scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe`.

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-recipe 2>&1 | grep -E "^test result|FAILED|panicked" && scripts/release/check-no-network.sh`
Expected: `test result: ok. 7 passed`; `không có mã mạng: speaker-worker speaker-protocol speaker-recipe (…)`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-recipe && cargo fmt -p speaker-recipe -- --check && cargo clippy -p speaker-recipe --all-targets -- -D warnings 2>&1 | tail -1 && cargo deny check 2>&1 | tail -3 && git status --short`
Expected: sạch; `cargo deny`: `advisories ok, bans ok, licenses ok, sources ok` (không crate mới nào trong lock); thêm `?? crates/speaker-recipe/`, `?? scripts/speaker-recipes/`, ` M scripts/release/check-no-network.sh`, ` M .github/workflows/ci.yml`. Không commit.

---
### Task 3: Bộ cây giao diện ghi sẵn (fixture) và trait `Tree`

**Files:**
- Create: `scripts/speaker-recipes/make_fixture.py`, `scripts/speaker-recipes/fixtures/README.md`
- Create (sinh bằng script vào `$DATA/fixtures-review/`, duyệt, rồi chép): `scripts/speaker-recipes/fixtures/{teams-macos-people-closed,teams-macos-people-open,meet-chrome-macos}.jsonl` và `.truth.json` tương ứng; viết tay: `scripts/speaker-recipes/fixtures/zoom-macos-synthetic.jsonl`, `scripts/speaker-recipes/fixtures/zoom-macos-synthetic.recipes.json`, `scripts/speaker-recipes/fixtures/meet-macos.recipes.json`
- Create: `crates/speaker-worker/src/reader/mod.rs`, `crates/speaker-worker/src/reader/tree.rs`
- Modify: `crates/speaker-worker/Cargo.toml` (thêm `speaker-recipe`), `crates/speaker-worker/src/lib.rs`
- Ngoài repo: `$DATA/fixture-names.json` (ánh xạ tên thật → tên giả; **không bao giờ chép vào `$W`**), `$DATA/fixtures-review/` (fixture chờ duyệt và bản in `review.txt`)

- [ ] **Step 1: Script ẩn danh**

`scripts/speaker-recipes/make_fixture.py`:

```python
"""Dựng fixture cây giao diện ẩn danh cho bộ đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §12; kế hoạch 04 Task 3, QĐ 16) từ bản
ghi `axtrace watch` của kế hoạch 01 (có tên thật và định danh tài khoản, nằm ngoài git).

python3 -I make_fixture.py names <ánh xạ.json> <teams-watch.jsonl>... --meet <chrome-watch.jsonl>...
    Dựng ánh xạ {"tên thật": "tên giả"} mà không in tên nào: tên sau "Myself video, " (Teams) và chữ tĩnh đầu tiên trong ô có lớp
    `oZRSLe` (Meet, trừ "Lan", "Minh", "Bạn", "You") → "Hoa Phạm"; tên hồ sơ Chrome (đuôi tiêu đề cửa sổ sau "Google Chrome - ")
    → "Hoa". Chỉ in số tên. File ánh xạ nằm ở $DATA, không bao giờ vào repo.
python3 -I make_fixture.py build <watch.jsonl> <truth.json> <ra.jsonl> --names <ánh xạ.json> --window <regex tiêu đề cửa sổ>
        [--web-area] [--seconds 60] [--title <tiêu đề thay cho cửa sổ>]
    - Chỉ giữ cửa sổ có tiêu đề khớp `--window`; `--web-area`: chỉ giữ cây con của `AXWebArea` có tiêu đề khớp (bỏ thẻ, thanh địa
      chỉ, dấu trang của trình duyệt). `--title`: thay tiêu đề dòng cửa sổ (tiêu đề Chrome có tên hồ sơ).
    - Bỏ lớp CSS nguyên tử của Teams (`f…`, `___…`, `r…`); giữ lớp có nghĩa (`vdi-frame-occlusion`, `oZRSLe`…).
    - Mọi định danh tài khoản Teams (`8:live:…`, `8:orgid:…`, `8:guest:…`, `8:teamsvisitor:…`, bot `28:<id>`) và mọi UUID, ở mọi
      trường, thành id giả ổn định (`anon-1`, `uuid-1`…, cùng chuỗi gốc cùng id giả).
    - Tên trong ánh xạ chỉ thay trong các trường chữ (title, desc, value, ident, help, dom), theo ranh giới từ (không đụng vai trò,
      lớp); mã phòng Meet thành `abc-defg-hij`.
    - Dừng, không ghi file, khi file ra còn một mẫu cấm (`8:live:`, `8:orgid:`, `8:guest:`, `8:teamsvisitor:`, `28:<id>`, `.cid.`,
      `@`, `http`, `/Users/`, `C:\\Users`, `C:/Users` (so sau khi bỏ thoát JSON, không phân biệt hoa thường), UUID) hay một tên thật của
      ánh xạ (không phân biệt hoa thường); chỉ in tên của phép kiểm và số lần.
    - Ghi `<ra>` (mỗi dòng {"t": giây từ ảnh chụp đầu, "lines": [...]}) và `<ra bỏ .jsonl>.truth.json` ({"steps": [{"t", "who",
      "on"}]}; khách tự động "lan", "minh" thành "Lan", "Minh"; giọng đọc máy "nguoinoi" giữ nguyên).
python3 -I make_fixture.py review <fixture.jsonl>...
    In các chuỗi khác nhau theo từng trường (title, desc, value, ident, help, dom, lớp) của mọi file, cho người duyệt xem trước khi
    chép vào repo.
"""
import argparse
import json
import re
import sys

ATOMIC = re.compile(r"^(?:f[0-9a-z]{5,8}|___[0-9a-z]{5,9}|r[0-9a-z]{6,8})$")
MEET_CODE = re.compile(r"\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b")
GUESTS = {"lan": "Lan", "minh": "Minh"}
# Định danh tài khoản Teams (MRI): "8:live:.cid.…", "8:orgid:<uuid>", "8:guest:<uuid>", "8:teamsvisitor:…"; bot "28:<id>" (bắt
# đầu bằng chữ, hay là UUID). Không đi sau chữ, số hay ":" (giờ "10:28:15" không bị thay).
MRI = re.compile(r"(?<![0-9A-Za-z:])(?:8:[A-Za-z]+:[\w.:\-]+|28:(?:[A-Za-z][\w.:\-]*|[0-9A-Fa-f]{8}-[\w.:\-]+))")
# Id bot: sau "28:" là chữ cái hay UUID; không phải chữ số (thời lượng "28:30") hay sau ":" (giờ "1:28:15").
BOT = re.compile(r"(?<![0-9A-Za-z:])28:(?:[A-Za-z]|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-)")
UUID = re.compile(r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}")
FORBIDDEN = ["8:live:", "8:orgid:", "8:guest:", "8:teamsvisitor:", ".cid.", "@", "http", "/users/", "c:\\users", "c:/users"]
FIELD_NAMES = ["title", "desc", "value", "ident", "help", "dom", "lớp"]
# Trường có chữ: title, desc, value, ident, help, dom (định dạng `độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp`).
TEXT_FIELDS = range(3, 9)


def fields(line):
    f = line.split("|", 9)
    return f if len(f) == 10 else None


def strip_classes(f):
    f[9] = " ".join(c for c in f[9].split() if not ATOMIC.match(c))


def meeting_lines(lines, title_re, web_area, new_title):
    out, keep, web_depth = [], False, None
    for line in lines:
        f = fields(line)
        if f is None:
            continue
        d = int(f[0])
        if d == 0:
            keep = f[1] == "AXWindow" and bool(title_re.search(f[3]))
            web_depth = None
            if keep:
                if new_title is not None:
                    f[3], f[4] = new_title, ""
                out.append(f)
            continue
        if not keep:
            continue
        if web_area:
            if web_depth is not None and d <= web_depth:
                web_depth = None
            if web_depth is None:
                if f[1] == "AXWebArea" and title_re.search(f[3]):
                    web_depth = d
                    out.append(f)
                continue
        out.append(f)
    return out


def word(name):
    return re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)")


class Anonymizer:
    def __init__(self, names):
        # Tên dài thay trước (một tên có thể là phần của tên khác).
        self.names = [(word(real), fake) for real, fake in sorted(names.items(), key=lambda kv: -len(kv[0]))]
        self.ids = {}

    def fake_id(self, prefix, m):
        key = m.group(0)
        if key not in self.ids:
            self.ids[key] = f"{prefix}-{sum(1 for v in self.ids.values() if v.startswith(prefix)) + 1}"
        return self.ids[key]

    def line(self, f):
        strip_classes(f)
        for i in range(1, 10):
            f[i] = MRI.sub(lambda m: self.fake_id("anon", m), f[i])
            f[i] = UUID.sub(lambda m: self.fake_id("uuid", m), f[i])
        for i in TEXT_FIELDS:
            for pattern, fake in self.names:
                f[i] = pattern.sub(fake, f[i])
            f[i] = MEET_CODE.sub("abc-defg-hij", f[i])
        return "|".join(f)


def leaks(text, real_names):
    r"""Tên các phép kiểm còn trúng và số lần; không trả chuỗi trúng. Văn bản là JSON: `\\` (dấu `\` đã thoát) quy về `\` trước khi
    so, để đường dẫn Windows `C:\\Users` trong JSON vẫn bị bắt (rà soát lần 2 A-NHỎ 1)."""
    low = text.lower().replace("\\\\", "\\")
    found = {f"mẫu cấm {p!r}": low.count(p) for p in FORBIDDEN if p in low}
    if BOT.search(text):
        found["định danh 28:"] = len(BOT.findall(text))
    if UUID.search(text):
        found["UUID"] = len(UUID.findall(text))
    hits = sum(len(re.findall(r"(?<!\w)" + re.escape(r.lower()) + r"(?!\w)", low)) for r in real_names)
    if hits:
        found["tên thật trong ánh xạ"] = hits
    return found


def cmd_names(a):
    found = set()
    myself = re.compile(r"Myself video, ([^,|]+)")
    for path in a.teams:
        for line in open(path, encoding="utf-8"):
            for snap_line in json.loads(line)["texts"] if line.strip() else []:
                found.update(m.group(1).strip() for m in myself.finditer(snap_line))
    host = {n: "Hoa Phạm" for n in found}
    profiles = set()
    for path in a.meet:
        for line in open(path, encoding="utf-8"):
            if not line.strip():
                continue
            pending = None
            for x in json.loads(line)["texts"]:
                f = fields(x)
                if f is None:
                    continue
                d = int(f[0])
                if d == 0 and " - Google Chrome - " in f[3]:
                    profiles.add(f[3].rsplit(" - Google Chrome - ", 1)[1].strip())
                if pending is not None and d <= pending:
                    pending = None
                if "oZRSLe" in f[9].split():
                    pending = d
                elif pending is not None and f[1] == "AXStaticText" and f[5].strip():
                    name = f[5].strip()
                    if name not in ("Lan", "Minh", "Bạn", "You"):
                        host[name] = "Hoa Phạm"
                    pending = None
    for p in profiles:
        host.setdefault(p, "Hoa")
    host = {k: v for k, v in host.items() if k}
    json.dump(host, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(host)} tên trong ánh xạ → {a.out}")


def cmd_build(a):
    names = json.load(open(a.names, encoding="utf-8"))
    anon = Anonymizer(names)
    title_re = re.compile(a.window)
    snaps = [json.loads(line) for line in open(a.watch, encoding="utf-8") if line.strip()]
    t0 = snaps[0]["t"]
    out = []
    for s in snaps:
        if s["t"] - t0 > a.seconds:
            break
        lines = meeting_lines(s["texts"], title_re, a.web_area, a.title)
        out.append({"t": round(s["t"] - t0, 3), "lines": [anon.line(f) for f in lines]})
    truth = json.load(open(a.truth, encoding="utf-8"))
    steps = [
        {"t": round(x["t"] - t0, 3), "who": GUESTS.get(x["g"], x["g"]), "on": x["on"]}
        for x in truth["steps"]
        if x["t"] - t0 <= a.seconds + 5
    ]
    body = "\n".join(json.dumps(o, ensure_ascii=False) for o in out) + "\n"
    truth_body = json.dumps({"steps": steps}, ensure_ascii=False, indent=1) + "\n"
    found = leaks(body + truth_body, names.keys())
    if found:
        sys.exit(f"không ghi file: {found}")
    open(a.out, "w", encoding="utf-8").write(body)
    open(re.sub(r"\.jsonl$", ".truth.json", a.out), "w", encoding="utf-8").write(truth_body)
    print(f"{len(out)} ảnh chụp, {sum(len(o['lines']) for o in out)} dòng, {len(body)} byte, {len(anon.ids)} id giả → {a.out}")


def cmd_review(a):
    for path in a.files:
        by_field = [set() for _ in FIELD_NAMES]
        for line in open(path, encoding="utf-8"):
            if not line.strip():
                continue
            for x in json.loads(line)["lines"]:
                f = fields(x)
                if f is None:
                    continue
                for k, i in enumerate(range(3, 10)):
                    values = f[i].split() if i == 9 else [f[i]]
                    by_field[k].update(v for v in values if v)
        print(f"== {path}")
        for name, values in zip(FIELD_NAMES, by_field):
            print(f"-- {name}: {len(values)} chuỗi khác nhau")
            for v in sorted(values):
                print(f"   {v}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("names")
    n.add_argument("out")
    n.add_argument("teams", nargs="+")
    n.add_argument("--meet", nargs="+", default=[])
    b = sub.add_parser("build")
    b.add_argument("watch")
    b.add_argument("truth")
    b.add_argument("out")
    b.add_argument("--names", required=True)
    b.add_argument("--window", required=True)
    b.add_argument("--web-area", action="store_true")
    b.add_argument("--seconds", type=float, default=60.0)
    b.add_argument("--title")
    r = sub.add_parser("review")
    r.add_argument("files", nargs="+")
    a = ap.parse_args()
    {"names": cmd_names, "build": cmd_build, "review": cmd_review}[a.cmd](a)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Ánh xạ tên (ngoài repo, không in tên), sinh ba fixture vào `$DATA`, in để duyệt**

Dựng ánh xạ tự động (chỉ in số tên):

Run: `cd $W && D=$B/truoc-spec/doc-ten/out && mkdir -p $DATA/fixtures-review && python3 -I scripts/speaker-recipes/make_fixture.py names $DATA/fixture-names.json $D/teams-C-watch.jsonl $D/teams-B-watch.jsonl --meet $D/chrome-B-watch.jsonl`
Expected: `… tên trong ánh xạ → …/fixture-names.json` với 2–4 tên. **Không mở file ánh xạ, không in nội dung của nó.**

Sinh ba fixture vào `$DATA/fixtures-review/` (chưa vào repo):

Run: `cd $W && D=$B/truoc-spec/doc-ten/out R=$DATA/fixtures-review M=scripts/speaker-recipes/make_fixture.py && python3 -I $M build $D/teams-C-watch.jsonl $D/teams-C-truth.json $R/teams-macos-people-closed.jsonl --names $DATA/fixture-names.json --window '^Meeting with ' --seconds 60 && python3 -I $M build $D/teams-B-watch.jsonl $D/teams-B-truth.json $R/teams-macos-people-open.jsonl --names $DATA/fixture-names.json --window '^Meeting with ' --seconds 60 && python3 -I $M build $D/chrome-B-watch.jsonl $D/chrome-B-truth.json $R/meet-chrome-macos.jsonl --names $DATA/fixture-names.json --window '^Meet [–-] ' --web-area --seconds 40 --title 'Meet - abc-defg-hij - Google Chrome'`
Expected: ba dòng "… ảnh chụp, … dòng, … byte, … id giả → …" (người rà đo với script cũ: People đóng 23 ảnh chụp ~164 KB, People mở 26 ảnh chụp ~262 KB, Meet 59 ảnh chụp ~797 KB; People mở có id giả > 0 vì bảng People có định danh tài khoản trong `AXDOMIdentifier`). Script dừng với "không ghi file: {…}": **không nới mẫu cấm, không sửa tay file ra**; nếu là tên thật thiếu trong ánh xạ thì báo người điều phối (không in tên), nếu là mẫu cấm khác (`@`, `http`…) thì báo người điều phối kèm tên phép kiểm và số lần để quyết cách thay.

In để duyệt rồi **dừng, chờ người điều phối hay chủ dự án duyệt** (kiểm: không có tên thật, định danh tài khoản, email, đường dẫn, chữ riêng tư; chỉ có tên giả, giờ, `abc-defg-hij`, `anon-N`, `uuid-N`, nhãn giao diện):

Run: `cd $W && python3 -I scripts/speaker-recipes/make_fixture.py review $DATA/fixtures-review/*.jsonl > $DATA/fixtures-review/review.txt && wc -l $DATA/fixtures-review/review.txt`
Expected: một file in theo trường của cả ba fixture. Gửi đường dẫn `$DATA/fixtures-review/review.txt` (file ngoài repo) cho người điều phối. **Chỉ khi được duyệt**: `cd $W && mkdir -p scripts/speaker-recipes/fixtures && cp $DATA/fixtures-review/*.jsonl $DATA/fixtures-review/*.truth.json scripts/speaker-recipes/fixtures/`. Chưa được duyệt thì các Task sau dùng fixture nào cũng chưa chạy được: dừng ở đây.

- [ ] **Step 3: Fixture và công thức Zoom tổng hợp (viết tay, theo spec §3, §6.1, §6.4; chỉ cho test thuần), công thức Meet riêng**

`scripts/speaker-recipes/fixtures/zoom-macos-synthetic.jsonl` (6 dòng):

```
{"t":0.0,"lines":["0|AXWindow|AXStandardWindow|Zoom Meeting|||zm.meeting.window.main|||","1|AXGroup||||||||","2|AXButton||Lan Nguyễn, Computer audio unmuted, Video off, active speaker|Lan Nguyễn, Computer audio unmuted, Video off, active speaker|||||","2|AXButton||Minh Trần, Computer audio muted, Video off|Minh Trần, Computer audio muted, Video off|||||","2|AXButton||Hoa Phạm (me), Computer audio muted, Video off|Hoa Phạm (me), Computer audio muted, Video off|||||","1|AXButton||Leave|Leave|||||"]}
{"t":1.0,"lines":["0|AXWindow|AXStandardWindow|Zoom Meeting|||zm.meeting.window.main|||","1|AXGroup||||||||","2|AXButton||Lan Nguyễn, Computer audio unmuted, Video off, active speaker|Lan Nguyễn, Computer audio unmuted, Video off, active speaker|||||","2|AXButton||Minh Trần, Computer audio muted, Video off|Minh Trần, Computer audio muted, Video off|||||","2|AXButton||Hoa Phạm (me), Computer audio muted, Video off|Hoa Phạm (me), Computer audio muted, Video off|||||","1|AXButton||Leave|Leave|||||"]}
{"t":2.0,"lines":["0|AXWindow|AXStandardWindow|Zoom Meeting|||zm.meeting.window.main|||","1|AXGroup||||||||","2|AXButton||Lan Nguyễn, Computer audio unmuted, Video off|Lan Nguyễn, Computer audio unmuted, Video off|||||","2|AXButton||Minh Trần, Computer audio unmuted, Video off, active speaker|Minh Trần, Computer audio unmuted, Video off, active speaker|||||","2|AXButton||Hoa Phạm (me), Computer audio muted, Video off|Hoa Phạm (me), Computer audio muted, Video off|||||","1|AXButton||Leave|Leave|||||"]}
{"t":3.0,"lines":["0|AXWindow|AXStandardWindow|Zoom Meeting|||zm.meeting.window.main|||","1|AXGroup||||||||","2|AXButton||Lan Nguyễn, Computer audio muted, Video off|Lan Nguyễn, Computer audio muted, Video off|||||","2|AXButton||Minh Trần, Computer audio unmuted, Video off, active speaker|Minh Trần, Computer audio unmuted, Video off, active speaker|||||","2|AXButton||Hoa Phạm (me), Computer audio muted, Video off|Hoa Phạm (me), Computer audio muted, Video off|||||","1|AXButton||Leave|Leave|||||"]}
{"t":4.0,"lines":["0|AXWindow|AXStandardWindow|Zoom Meeting|||zm.meeting.window.main|||","1|AXGroup||||||||","2|AXButton||Lan Nguyễn, Computer audio muted, Video off|Lan Nguyễn, Computer audio muted, Video off|||||","2|AXButton||Minh Trần, Computer audio unmuted, Video off, active speaker|Minh Trần, Computer audio unmuted, Video off, active speaker|||||","2|AXButton||Hoa Phạm (me), Computer audio muted, Video off|Hoa Phạm (me), Computer audio muted, Video off|||||","1|AXButton||Leave|Leave|||||"]}
{"t":5.0,"lines":["0|AXWindow|AXStandardWindow|Zoom Meeting|||zm.meeting.window.main|||","1|AXGroup||||||||","2|AXButton||Lan Nguyễn, Computer audio muted, Video off|Lan Nguyễn, Computer audio muted, Video off|||||","2|AXButton||Minh Trần, Computer audio muted, Video off|Minh Trần, Computer audio muted, Video off|||||","2|AXButton||Hoa Phạm (me), Computer audio muted, Video off|Hoa Phạm (me), Computer audio muted, Video off|||||","1|AXButton||Leave|Leave|||||"]}
```

`scripts/speaker-recipes/fixtures/zoom-macos-synthetic.recipes.json` (công thức Zoom tổng hợp, chỉ test đọc; **không** nhúng vào app, không nằm trong `recipes.json`; ô ràng buộc vai trò `AXButton` như fixture tổng hợp, để không đọc chữ mọi phần tử, QĐ 3):

```json
{
  "schema": 1,
  "version": 1,
  "min_app_version": "0.3.2",
  "apps": [
    {
      "app": "zoom",
      "os": "macos",
      "window_id": "^zm\\.meeting\\.window\\.main$",
      "window_title": ["^Zoom Meeting", "^Cuộc họp Zoom"],
      "tile": {
        "role": "AXButton",
        "label": "^(?P<name>[^,]{1,120}), Computer audio (?P<muted>muted|unmuted)(?:, Video (?:on|off))?(?P<speaking>, active speaker)?$"
      },
      "name_from": "label",
      "name_suffixes": ["\\s*\\((?:me|tôi|Host|Chủ trì|Co-host|Đồng chủ trì|Guest|Khách)\\)$"],
      "self_name": "\\((?:me|tôi)\\)$",
      "mic": { "muted_values": ["muted"], "absent_means_unmuted": false },
      "speaking": [{ "kind": "label" }],
      "delay_ms": 500
    }
  ]
}
```

`scripts/speaker-recipes/fixtures/meet-macos.recipes.json` (công thức Meet trong Chrome, Edge từ bản ghi của kế hoạch 01; **không** nhúng vào app, không nằm trong `recipes.json`, QĐ 32: chỉ báo chỉ có ở ô của người đang nói trong chính cửa sổ của họ, cửa sổ người nghe không có. Dùng cho test thuần và cho `ax-record --recipe` ở Task 21):

```json
{
  "schema": 1,
  "version": 1,
  "min_app_version": "0.3.2",
  "apps": [
    {
      "app": "meet_chrome",
      "os": "macos",
      "window_title": ["^Meet [–-] "],
      "web_only": true,
      "enhanced_ui": true,
      "tile": { "role": "AXGroup", "class_token": "oZRSLe" },
      "name_from": "text",
      "self_name": "^(?:Bạn|You)$",
      "speaking": [
        { "kind": "flicker", "anchor": { "scope": "descendant", "class_token": "DYfzY", "max_depth": 6 } },
        { "kind": "deviation", "anchor": { "scope": "descendant", "class_token": "qg7mD", "max_depth": 6 } }
      ],
      "delay_ms": 800
    },
    {
      "app": "meet_edge",
      "os": "macos",
      "window_title": ["^Meet [–-] "],
      "web_only": true,
      "enhanced_ui": true,
      "tile": { "role": "AXGroup", "class_token": "oZRSLe" },
      "name_from": "text",
      "self_name": "^(?:Bạn|You)$",
      "speaking": [
        { "kind": "flicker", "anchor": { "scope": "descendant", "class_token": "DYfzY", "max_depth": 6 } },
        { "kind": "deviation", "anchor": { "scope": "descendant", "class_token": "qg7mD", "max_depth": 6 } }
      ],
      "delay_ms": 800
    }
  ]
}
```

`scripts/speaker-recipes/fixtures/README.md`:

```markdown
# Bộ cây giao diện ghi sẵn của bộ đọc tên

Test của `crates/speaker-worker` (kế hoạch 04, spec 2026-10-26-phan-biet-nguoi-noi §12) đọc các file này thay cho Teams, Meet,
Zoom thật. Mỗi dòng của `*.jsonl` là một ảnh chụp `{"t": giây, "lines": [...]}`, mỗi phần tử một dòng
`độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp` (định dạng `axtrace` của `bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten`).
`*.truth.json` là sự thật (ai bật, tắt mic lúc nào).

| File | Nguồn | Ghi chú |
|---|---|---|
| `teams-macos-people-closed.jsonl` | bản ghi `teams-C` của kế hoạch 01 (Teams 26276, macOS 26.6, bảng People đóng) | 60 s đầu |
| `teams-macos-people-open.jsonl` | bản ghi `teams-B` (bảng People mở) | 60 s đầu |
| `meet-chrome-macos.jsonl` | bản ghi `chrome-B` (Chrome 156, hai cửa sổ Meet cùng tài khoản) | 40 s đầu, chỉ vùng web |
| `zoom-macos-synthetic.jsonl`, `zoom-macos-synthetic.recipes.json` | **tổng hợp** từ mô tả của spec §3, §6.4 | chỉ cho test thuần; công thức này không vào app; thay bằng bản ghi thật (kế hoạch 04 Task 21) |
| `meet-macos.recipes.json` | công thức Meet (Chrome, Edge) từ bản ghi `chrome-B` | không vào app (Meet tắt mặc định: cửa sổ người nghe không có chỉ báo); test thuần và `ax-record --recipe` |

Tên người là tên giả ("Lan", "Minh" là khách tự động; "Hoa Phạm" thay tên thật của chủ phòng); mã phòng Meet là `abc-defg-hij`;
định danh tài khoản Teams và UUID thành `anon-N`, `uuid-N`; lớp CSS nguyên tử của Teams đã bỏ. Dựng lại bằng `make_fixture.py`
(`names`, `build`, `review`) với file ánh xạ tên nằm ngoài repo; fixture mới chỉ vào repo sau khi người duyệt xem bản in `review`.
Test `fixtures_have_no_account_ids_links_or_paths` (crate `speaker-worker`) chặn định danh tài khoản, email, liên kết, đường dẫn,
UUID trong mọi file ở đây. Không chép bản ghi gốc (có tên thật) vào repo.
```

- [ ] **Step 4: Viết test đỏ cho `Tree`**

`crates/speaker-worker/Cargo.toml`, mục `[dependencies]`, thêm sau `serde_json.workspace = true`:

```toml
serde.workspace = true
# Công thức đọc tên (kế hoạch 04): định dạng, mẫu chữ, `Attrs`.
speaker-recipe = { path = "../speaker-recipe" }
```

`crates/speaker-worker/src/lib.rs`: thêm `pub mod reader;` (sau `pub mod platform;`); sửa câu cuối của chú thích đầu file thành `Không chứa ggml, không có mã mạng. Kế hoạch 04 thêm đọc tên (\`reader\`, \`names\`).`

`crates/speaker-worker/src/reader/mod.rs`:

```rust
//! Bộ đọc tên người nói từ app họp (spec 2026-10-26-phan-biet-nguoi-noi §6.1–§6.2): cây giao diện (`tree`), duyệt cửa sổ và lấy
//! mẫu ô (`extract`). Chỉ đọc; không bấm, không gõ gì trong app họp.

pub mod tree;
```

`crates/speaker-worker/src/reader/tree.rs` (phần test; mã ở Step 6):

```rust
#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn fixture_path(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../scripts/speaker-recipes/fixtures").join(name)
    }

    pub(crate) fn fixture(name: &str) -> Vec<Snapshot> {
        let path = fixture_path(name);
        read_snapshots(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
    }

    /// Sự thật của một fixture: (giây, ai, bật mic hay tắt), theo thời gian.
    pub(crate) fn truth(name: &str) -> Vec<(f64, String, bool)> {
        let path = fixture_path(&name.replace(".jsonl", ".truth.json"));
        let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let mut steps: Vec<(f64, String, bool)> = v["steps"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| (s["t"].as_f64().unwrap(), s["who"].as_str().unwrap().to_string(), s["on"].as_bool().unwrap()))
            .collect();
        steps.sort_by(|a, b| a.0.total_cmp(&b.0));
        steps
    }

    #[test]
    fn lines_nest_by_depth_even_with_gaps() {
        let lines: Vec<String> = [
            "0|AXWindow|AXStandardWindow|Meeting with Hoa Phạm||||||",
            "6|AXWebArea||Meeting with Hoa Phạm||||||",
            "21|AXMenuItem||Lan (Guest), Context menu is available|Lan (Guest), Context menu is available|||||fui-Flex",
            "22|AXGroup|AXEmptyGroup|||||||fui-Flex vdi-frame-occlusion",
            "21|AXMenuItem||Minh (Guest), Context menu is available|Minh (Guest), Context menu is available|||||fui-Flex",
            "0|AXWindow|AXStandardWindow|Chat||||||",
        ]
        .map(String::from)
        .to_vec();
        let (mut t, roots) = FixtureTree::parse(&lines);
        assert_eq!(roots, [0, 5]);
        assert_eq!(t.children(&0), [1]);
        assert_eq!(t.children(&1), [2, 4]);
        assert_eq!(t.children(&2), [3]);
        let s = t.shape(&3).unwrap();
        assert_eq!(s.role, "AXGroup");
        assert_eq!(s.classes, ["fui-Flex", "vdi-frame-occlusion"]);
        assert!(!s.has_text(), "hình dạng không có chữ");
        let mut a = t.shape(&2).unwrap();
        assert!(t.text(&2, &mut a));
        assert!(a.label().starts_with("Lan"));
        assert_eq!(t.texts_read, [2], "ghi lại phần tử đã đọc chữ");
        assert_eq!(t.title(5), "Chat");
    }

    #[test]
    fn the_fixtures_load_in_time_order() {
        for name in [
            "teams-macos-people-closed.jsonl",
            "teams-macos-people-open.jsonl",
            "meet-chrome-macos.jsonl",
            "zoom-macos-synthetic.jsonl",
        ] {
            let snaps = fixture(name);
            assert!(snaps.len() >= 5, "{name}: {} ảnh chụp", snaps.len());
            assert!(snaps.windows(2).all(|w| w[0].t <= w[1].t), "{name}");
            assert!(snaps.iter().all(|s| !s.lines.is_empty()), "{name}");
        }
        assert!(!truth("teams-macos-people-closed.jsonl").is_empty());
    }

    /// Có chuỗi dạng UUID (8-4-4-4-12 chữ số hex) không; viết tay để crate không cần `regex`.
    fn has_uuid(s: &str) -> bool {
        let b = s.as_bytes();
        (0..b.len()).any(|i| {
            let mut j = i;
            for (k, n) in [8, 4, 4, 4, 12].into_iter().enumerate() {
                if k > 0 {
                    if b.get(j) != Some(&b'-') {
                        return false;
                    }
                    j += 1;
                }
                for _ in 0..n {
                    if !b.get(j).is_some_and(u8::is_ascii_hexdigit) {
                        return false;
                    }
                    j += 1;
                }
            }
            true
        })
    }

    /// Định danh bot Teams `28:<id>`: "28:" không đi sau chữ, số hay ":" (giờ "1:28:15", "10:28:15"), theo sau là chữ cái hay UUID
    /// (không phải chữ số: thời lượng cuộc gọi "28:30" không bị chặn; rà soát lần 3).
    fn has_bot_id(s: &str) -> bool {
        let b = s.as_bytes();
        s.match_indices("28:").any(|(i, _)| {
            let before = i.checked_sub(1).map(|j| b[j]);
            let rest = &b[i + 3..];
            let guid = rest.len() > 8 && rest[..8].iter().all(u8::is_ascii_hexdigit) && rest[8] == b'-';
            !before.is_some_and(|c| c.is_ascii_alphanumeric() || c == b':')
                && (rest.first().is_some_and(u8::is_ascii_alphabetic) || guid)
        })
    }

    /// Mẫu cấm đầu tiên có trong văn bản của một fixture. Văn bản là JSON: `\\` (dấu `\` đã thoát) quy về `\` trước khi so, để
    /// `C:\\Users` trong JSON vẫn bị bắt (rà soát lần 2 A-NHỎ 1).
    fn forbidden_in(text: &str) -> Option<String> {
        let low = text.to_lowercase().replace("\\\\", "\\");
        let bad = ["8:live:", "8:orgid:", "8:guest:", "8:teamsvisitor:", ".cid.", "@", "http", "/users/", "c:\\users", "c:/users"];
        if let Some(b) = bad.iter().find(|b| low.contains(*b)) {
            return Some((*b).to_string());
        }
        if has_bot_id(text) {
            return Some("28:<id>".into());
        }
        has_uuid(text).then(|| "UUID".into())
    }

    /// QĐ 16 (rà soát A-C1): fixture công khai không có định danh tài khoản Teams, email, liên kết, đường dẫn người dùng, UUID.
    /// Quét mọi file trong thư mục fixture của repo (không đọc `$DATA`), để fixture ghi lại sau này (kế hoạch 06) cũng bị chặn.
    #[test]
    fn fixtures_have_no_account_ids_links_or_paths() {
        let dir = fixture_path("");
        let mut files = 0;
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            let text = std::fs::read_to_string(&path).unwrap();
            assert_eq!(forbidden_in(&text), None, "{}", path.display());
            files += 1;
        }
        assert!(files >= 10, "{files} file");
        // Chính phép kiểm bắt được từng mẫu (cả dạng thoát của JSON), và không bắt id giả, giờ.
        for bad in [
            r#"{"dom":"roster-avatar-img-8:live:.cid.x"}"#,
            r#"{"p":"C:\\Users\\x"}"#,
            "C:/Users/x",
            "/Users/x",
            "28:bot-abc",
            "28:123e4567-e89b-12d3-a456-426614174000",
            "a@b.co",
            "HTTPS://x",
            "x-123e4567-e89b-12d3-a456-426614174000",
        ] {
            assert!(forbidden_in(bad).is_some(), "{bad}");
        }
        assert_eq!(forbidden_in("anon-1 uuid-2 17:26 10:28:15 1:28:15 28:30 abc-defg-hij"), None);
        assert!(has_bot_id("28:bot-abc") && has_bot_id("x 28:123e4567-e89b"));
        assert!(!has_bot_id("28:30") && !has_bot_id("1:28:15") && !has_bot_id("10:28:15"));
    }
}
```

- [ ] **Step 5: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader::tree 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`FixtureTree`, `read_snapshots`, `Snapshot`, `Tree` chưa có).

- [ ] **Step 6: Viết mã**

`crates/speaker-worker/src/reader/tree.rs`, trước mod `tests`:

```rust
//! Cây giao diện mà bộ đọc tên duyệt (spec §6.2), qua trait [`Tree`]: bộ cây ghi sẵn ([`FixtureTree`], test và `pnpm
//! recipes:update` của kế hoạch 06) và Accessibility thật (`macos::AxTree`, kế hoạch 04 Task 12; UI Automation ở kế hoạch 05)
//! dùng chung mã duyệt và lấy mẫu (`extract`).
//!
//! Đọc chữ có chọn lọc (QĐ 3 của kế hoạch 04): [`Tree::shape`] không có chữ; [`Tree::text`] chỉ được gọi cho tiêu đề cửa sổ,
//! tiêu đề vùng web, phần tử khớp hình dạng của ô và phần tử bên trong ô.

use std::path::Path;

use serde::Deserialize;
use speaker_recipe::Attrs;

pub trait Tree {
    type Node: Clone;
    /// Chỉ vai trò (rẻ nhất): trên đường tới vùng web của trình duyệt chỉ đọc chừng này.
    fn role(&mut self, node: &Self::Node) -> Option<String>;
    /// Vai trò, vai trò phụ, id, lớp; tiêu đề, mô tả, giá trị để trống. `None` khi phần tử không còn.
    fn shape(&mut self, node: &Self::Node) -> Option<Attrs>;
    /// Điền tiêu đề, mô tả, giá trị vào `attrs`. `false` khi phần tử không còn.
    fn text(&mut self, node: &Self::Node, attrs: &mut Attrs) -> bool;
    fn children(&mut self, node: &Self::Node) -> Vec<Self::Node>;
}

/// Một ảnh chụp của bộ cây ghi sẵn: giây từ đầu bản ghi và các dòng `độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp`.
#[derive(Deserialize, Clone)]
pub struct Snapshot {
    pub t: f64,
    pub lines: Vec<String>,
}

pub fn read_snapshots(path: &Path) -> std::io::Result<Vec<Snapshot>> {
    std::fs::read_to_string(path)?
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).map_err(std::io::Error::other))
        .collect()
}

/// Cây dựng từ một ảnh chụp. Nút là chỉ số; `texts_read` ghi những nút đã bị đọc chữ (test quyền riêng tư).
#[derive(Default)]
pub struct FixtureTree {
    nodes: Vec<(Attrs, Vec<usize>)>,
    pub texts_read: Vec<usize>,
}

impl FixtureTree {
    /// Dòng độ sâu d là con của dòng gần nhất phía trước có độ sâu nhỏ hơn (bản ghi bỏ nút không có chữ hay lớp, nên "con" có thể
    /// là cháu thật; neo tìm theo độ sâu tối đa nên vẫn đúng). Trả cây và các gốc (cửa sổ, độ sâu nhỏ nhất).
    pub fn parse(lines: &[String]) -> (Self, Vec<usize>) {
        let mut tree = FixtureTree::default();
        let mut roots = Vec::new();
        let mut stack: Vec<(usize, u32)> = Vec::new();
        for line in lines {
            let f: Vec<&str> = line.splitn(10, '|').collect();
            if f.len() < 10 {
                continue;
            }
            let Ok(depth) = f[0].parse::<u32>() else { continue };
            let attrs = Attrs {
                role: f[1].into(),
                subrole: f[2].into(),
                title: f[3].into(),
                desc: f[4].into(),
                value: f[5].into(),
                ident: f[6].into(),
                dom_id: f[8].into(),
                classes: f[9].split_whitespace().map(String::from).collect(),
            };
            let id = tree.nodes.len();
            tree.nodes.push((attrs, Vec::new()));
            while stack.last().is_some_and(|&(_, d)| d >= depth) {
                stack.pop();
            }
            match stack.last() {
                Some(&(parent, _)) => tree.nodes[parent].1.push(id),
                None => roots.push(id),
            }
            stack.push((id, depth));
        }
        (tree, roots)
    }

    /// Tiêu đề, id của một nút (cửa sổ): bộ đọc thật đọc riêng hai thuộc tính này để nhận cửa sổ họp (spec §6.1).
    pub fn title(&self, node: usize) -> &str {
        &self.nodes[node].0.title
    }

    pub fn ident(&self, node: usize) -> &str {
        &self.nodes[node].0.ident
    }
}

impl Tree for FixtureTree {
    type Node = usize;

    fn role(&mut self, node: &usize) -> Option<String> {
        self.nodes.get(*node).map(|n| n.0.role.clone())
    }

    fn shape(&mut self, node: &usize) -> Option<Attrs> {
        self.nodes.get(*node).map(|n| Attrs {
            title: String::new(),
            desc: String::new(),
            value: String::new(),
            ..n.0.clone()
        })
    }

    fn text(&mut self, node: &usize, attrs: &mut Attrs) -> bool {
        let Some(n) = self.nodes.get(*node) else { return false };
        self.texts_read.push(*node);
        attrs.title = n.0.title.clone();
        attrs.desc = n.0.desc.clone();
        attrs.value = n.0.value.clone();
        true
    }

    fn children(&mut self, node: &usize) -> Vec<usize> {
        self.nodes.get(*node).map(|n| n.1.clone()).unwrap_or_default()
    }
}
```

- [ ] **Step 7: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader::tree 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 3 passed`. `fixtures_have_no_account_ids_links_or_paths` đỏ thì **không** sửa test hay fixture bằng tay: sửa `make_fixture.py`, chạy lại Step 2 (gồm bước duyệt).

- [ ] **Step 8: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && du -ch scripts/speaker-recipes/fixtures/* | tail -1 && git status --short`
Expected: sạch; tổng fixture dưới 2,5 MB; thêm `?? crates/speaker-worker/src/reader/`, `?? scripts/speaker-recipes/` (đã có từ Task 2). `$DATA/fixture-names.json` không nằm trong `$W`. Không commit.

---

### Task 4: Duyệt cửa sổ họp, tìm ô và neo, lấy mẫu ô

**Files:**
- Create: `crates/speaker-worker/src/reader/extract.rs`
- Modify: `crates/speaker-worker/src/reader/mod.rs` (thêm `pub mod extract;`)

- [ ] **Step 1: Viết test đỏ**

`crates/speaker-worker/src/reader/mod.rs`: thêm dòng `pub mod extract;` trước `pub mod tree;`.

`crates/speaker-worker/src/reader/extract.rs` (phần test; mã ở Step 3):

```rust
#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::reader::tree::tests::{fixture, fixture_path};
    use crate::reader::tree::{FixtureTree, Snapshot};
    use speaker_recipe::{BUILTIN_JSON, MeetingApp, Os, Recipes, parse};
    use std::collections::BTreeSet;

    /// Tên giả được phép trong fixture (QĐ 16).
    pub(crate) const FAKE_NAMES: [&str; 6] = ["Lan", "Minh", "Hoa Phạm", "Lan Nguyễn", "Minh Trần", "Tuấn Lê"];

    pub(crate) fn recipes() -> Recipes {
        parse(BUILTIN_JSON).unwrap()
    }

    /// Công thức trong thư mục fixture (không có trong bản build sẵn); mọi mục phải hợp lệ.
    fn fixture_recipes(file: &str) -> Recipes {
        let r = parse(&std::fs::read_to_string(fixture_path(file)).unwrap()).unwrap();
        assert!(r.dropped.is_empty(), "{file}: {:?}", r.dropped);
        r
    }

    /// Công thức Zoom tổng hợp (QĐ 16): chỉ cho test.
    pub(crate) fn zoom_recipes() -> Recipes {
        fixture_recipes("zoom-macos-synthetic.recipes.json")
    }

    /// Công thức Meet (QĐ 32: tắt mặc định, không có trong bản build sẵn): test thuần và `ax-record --recipe`.
    pub(crate) fn meet_recipes() -> Recipes {
        fixture_recipes("meet-macos.recipes.json")
    }

    /// Mọi ô của mọi cửa sổ họp trong một ảnh chụp, đọc như lượt đầy đủ rồi lấy mẫu (như bộ đọc thật ở lượt đầu).
    pub(crate) fn tiles_of(snap: &Snapshot, app: &AppRecipe) -> (FixtureTree, Vec<TileSample>) {
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let mut out = Vec::new();
        let mut index = 0;
        for w in roots {
            let (title, ident) = (tree.title(w).to_string(), tree.ident(w).to_string());
            if !is_meeting_window(app, &title, &ident) {
                continue;
            }
            let tiles = Walk::new(w, index, app.web_only).step(&mut tree, app, &mut Budget::unlimited()).unwrap();
            index += 1;
            let round = sample_round(&mut tree, &tiles, app, 0, false, &mut Budget::unlimited());
            assert!(!round.gone);
            out.extend(round.samples);
        }
        (tree, out)
    }

    /// Đếm lệnh đọc (mỗi lần gọi `Tree`), như số lệnh Accessibility của bộ đọc thật.
    struct Counting<'a> {
        tree: &'a mut FixtureTree,
        calls: u32,
    }

    impl Tree for Counting<'_> {
        type Node = usize;

        fn role(&mut self, n: &usize) -> Option<String> {
            self.calls += 1;
            self.tree.role(n)
        }

        fn shape(&mut self, n: &usize) -> Option<Attrs> {
            self.calls += 1;
            self.tree.shape(n)
        }

        fn text(&mut self, n: &usize, a: &mut Attrs) -> bool {
            self.calls += 1;
            self.tree.text(n, a)
        }

        fn children(&mut self, n: &usize) -> Vec<usize> {
            self.calls += 1;
            self.tree.children(n)
        }
    }

    fn lines(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn teams_tiles_give_three_people_their_mics_and_the_user() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut lan_open, mut lan_muted) = (false, false);
        for snap in fixture("teams-macos-people-closed.jsonl") {
            let (_, tiles) = tiles_of(&snap, app);
            let names: BTreeSet<&str> = tiles.iter().map(|t| t.name.as_str()).collect();
            assert_eq!(names, BTreeSet::from(["Hoa Phạm", "Lan", "Minh"]), "ảnh chụp {}", snap.t);
            let me: Vec<&TileSample> = tiles.iter().filter(|t| t.is_self).collect();
            assert_eq!(me.len(), 1);
            assert_eq!((me[0].name.as_str(), me[0].muted), ("Hoa Phạm", Some(true)));
            assert_eq!(me[0].anchors, [None], "ô của chủ phòng (mic tắt) không lần nào có khung đang nói");
            let lan = tiles.iter().find(|t| t.name == "Lan").unwrap();
            lan_open |= lan.muted == Some(false);
            lan_muted |= lan.muted == Some(true);
        }
        assert!(lan_open && lan_muted, "mic của Lan có lúc mở, lúc tắt");
    }

    #[test]
    fn teams_speaking_frames_appear_on_guest_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let frames = fixture("teams-macos-people-closed.jsonl")
            .iter()
            .flat_map(|s| tiles_of(s, app).1)
            .filter(|t| t.anchors[0].is_some())
            .map(|t| t.name)
            .collect::<BTreeSet<_>>();
        assert_eq!(frames, BTreeSet::from(["Lan".to_string(), "Minh".to_string()]));
    }

    /// QĐ 3: ngoài vùng web của trình duyệt (dấu trang, thẻ khác) không đọc chữ; vùng web khác (Gmail) không đi vào.
    #[test]
    fn meet_reads_text_only_inside_its_web_area() {
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        let snap = Snapshot {
            t: 0.0,
            lines: lines(&[
                "0|AXWindow|AXStandardWindow|Meet - abc-defg-hij - Google Chrome||||||",
                "1|AXGroup||||||||BrowserRootView",
                "2|AXButton||Gemini API_KEY|Gemini API_KEY||||view_1028|BookmarkButton",
                "2|AXWebArea||Meet - abc-defg-hij||||||",
                "3|AXGroup||||||||oZRSLe",
                "4|AXGroup|AXEmptyGroup|||||||DYfzY cYKTje gjg47c",
                "4|AXGroup|AXEmptyGroup|||||||qg7mD KXY1yb",
                "5|AXStaticText||||Lan Nguyễn||||",
                "2|AXWebArea||Gmail - Hộp thư||||||",
                "3|AXStaticText||||thư riêng||||",
            ]),
        };
        let (tree, tiles) = tiles_of(&snap, app);
        assert_eq!(tiles.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), ["Lan Nguyễn"]);
        assert!(tiles[0].anchors.iter().all(Option::is_some), "hai neo của Meet");
        assert!(!tree.texts_read.contains(&2), "không đọc chữ của dấu trang");
        assert!(!tree.texts_read.contains(&9), "không đọc chữ trong vùng web khác");
    }

    #[test]
    fn meet_fixture_finds_four_tiles_with_both_anchors() {
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        for snap in fixture("meet-chrome-macos.jsonl") {
            let (_, tiles) = tiles_of(&snap, app);
            assert_eq!(tiles.len(), 4, "hai cửa sổ, mỗi cửa sổ hai ô (ảnh chụp {})", snap.t);
            assert!(tiles.iter().all(|t| t.name == "Hoa Phạm" && t.anchors.iter().all(Option::is_some)));
        }
    }

    #[test]
    fn zoom_labels_give_name_mic_self_and_speaking() {
        let r = zoom_recipes();
        let app = r.app(Os::Macos, MeetingApp::Zoom).unwrap();
        let snaps = fixture("zoom-macos-synthetic.jsonl");
        let (_, tiles) = tiles_of(&snaps[0], app);
        let get = |n: &str| tiles.iter().find(|t| t.name == n).unwrap().clone();
        assert_eq!((get("Lan Nguyễn").muted, get("Lan Nguyễn").label_speaking), (Some(false), true));
        assert_eq!((get("Minh Trần").muted, get("Minh Trần").label_speaking), (Some(true), false));
        assert!(get("Hoa Phạm").is_self, "hậu tố (me) là chính người dùng");
        let (_, later) = tiles_of(&snaps[3], app);
        assert!(later.iter().any(|t| t.name == "Minh Trần" && t.label_speaking));
    }

    /// Spec §6.1: cửa sổ Teams phải có nút rời cuộc gọi mới là cửa sổ họp.
    #[test]
    fn a_teams_window_without_the_leave_button_has_no_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let tile = "1|AXMenuItem||Lan (Guest), Context menu is available|Lan (Guest), Context menu is available|||||";
        let without = Snapshot { t: 0.0, lines: lines(&["0|AXWindow|AXStandardWindow|Meeting with Hoa Phạm||||||", tile]) };
        assert!(tiles_of(&without, app).1.is_empty());
        let with = Snapshot {
            t: 0.0,
            lines: lines(&[
                "0|AXWindow|AXStandardWindow|Meeting with Hoa Phạm||||||",
                tile,
                "1|AXButton||Leave|Leave||||hangup-button|fui-Button",
            ]),
        };
        assert_eq!(tiles_of(&with, app).1.len(), 1);
    }

    /// Spec §6.2: vượt giới hạn thì dừng lượt đó, lượt sau đọc tiếp; kết quả như đọc một lượt.
    #[test]
    fn a_small_budget_finishes_over_several_passes_with_the_same_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let snap = &fixture("teams-macos-people-closed.jsonl")[0];
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let names = |tiles: &[TileRef<usize>]| tiles.iter().map(|t| t.name.clone()).collect::<Vec<_>>();
        let full = Walk::new(roots[0], 0, false).step(&mut tree, app, &mut Budget::unlimited()).unwrap();
        let mut walk = Walk::new(roots[0], 0, false);
        let mut passes = 0;
        let small = loop {
            passes += 1;
            let mut budget = Budget::new(10, Duration::from_secs(1));
            if let Some(t) = walk.step(&mut tree, app, &mut budget) {
                assert!(budget.used() <= 10);
                break t;
            }
        };
        assert!(passes > 5, "{passes} lượt");
        assert_eq!(names(&small), names(&full));
    }

    #[test]
    fn tile_samples_never_print_names() {
        let s = TileSample {
            name: "Lan Nguyễn".into(),
            is_self: false,
            muted: Some(false),
            label_speaking: true,
            anchors: vec![Some(1)],
            candidates: vec![],
            slot: 0,
        };
        assert!(!format!("{s:?}").contains("Lan"));
    }

    /// QĐ 16, 24: mọi tên ô trong fixture là tên giả; ô chính người dùng chỉ là "Hoa Phạm"; Meet chưa nhận ra ô của người dùng
    /// (0 ô, ghim lại để QĐ 24 không bị quên khi T21 thêm dấu nhận).
    #[test]
    fn fixture_tile_names_are_the_made_up_ones() {
        let (r, z, m) = (recipes(), zoom_recipes(), meet_recipes());
        let cases = [
            ("teams-macos-people-closed.jsonl", r.app(Os::Macos, MeetingApp::Teams).unwrap()),
            ("teams-macos-people-open.jsonl", r.app(Os::Macos, MeetingApp::Teams).unwrap()),
            ("meet-chrome-macos.jsonl", m.app(Os::Macos, MeetingApp::MeetChrome).unwrap()),
            ("zoom-macos-synthetic.jsonl", z.app(Os::Macos, MeetingApp::Zoom).unwrap()),
        ];
        for (file, app) in cases {
            let mut selves = 0;
            for snap in fixture(file) {
                for t in tiles_of(&snap, app).1 {
                    assert!(FAKE_NAMES.contains(&t.name.as_str()), "{file}: tên ô không phải tên giả");
                    if t.is_self {
                        assert_eq!(t.name, "Hoa Phạm", "{file}");
                        selves += 1;
                    }
                }
            }
            if file.starts_with("meet") {
                assert_eq!(selves, 0, "Meet: chưa nhận ra ô của chính người dùng (QĐ 24)");
            } else {
                assert!(selves > 0, "{file}: có ô của chính người dùng");
            }
        }
    }

    /// Spec §6.2, QĐ 13 (rà soát A-Q3, B-Q2): một lượt (duyệt cửa sổ, lấy mẫu mọi ô, ứng viên tự hiệu chỉnh) không quá
    /// [`MAX_ELEMENTS`] lệnh đọc trên mọi ảnh chụp của mọi fixture, và mọi lệnh đều đi qua ngân sách. In số lệnh tệ nhất (Task 18 chép
    /// vào `results/04-do.md`).
    #[test]
    fn a_whole_pass_with_calibration_stays_within_the_read_limit() {
        let (r, z, m) = (recipes(), zoom_recipes(), meet_recipes());
        let cases = [
            ("teams-macos-people-closed.jsonl", r.app(Os::Macos, MeetingApp::Teams).unwrap()),
            ("teams-macos-people-open.jsonl", r.app(Os::Macos, MeetingApp::Teams).unwrap()),
            ("meet-chrome-macos.jsonl", m.app(Os::Macos, MeetingApp::MeetChrome).unwrap()),
            ("zoom-macos-synthetic.jsonl", z.app(Os::Macos, MeetingApp::Zoom).unwrap()),
        ];
        for (file, app) in cases {
            let mut worst = 0;
            for snap in fixture(file) {
                let (mut tree, roots) = FixtureTree::parse(&snap.lines);
                let mut t = Counting { tree: &mut tree, calls: 0 };
                let mut budget = Budget::new(MAX_ELEMENTS, Duration::from_secs(60));
                for (k, w) in roots.into_iter().enumerate() {
                    let (title, ident) = (t.tree.title(w).to_string(), t.tree.ident(w).to_string());
                    if !is_meeting_window(app, &title, &ident) {
                        continue;
                    }
                    if let Some(tiles) = Walk::new(w, k as u32, app.web_only).step(&mut t, app, &mut budget) {
                        sample_round(&mut t, &tiles, app, 0, true, &mut budget);
                    }
                }
                assert!(t.calls <= MAX_ELEMENTS, "{file} ảnh chụp {}: {} lệnh", snap.t, t.calls);
                assert_eq!(t.calls, budget.used(), "mọi lệnh đi qua ngân sách");
                worst = worst.max(t.calls);
            }
            eprintln!("{file}: một lượt đầy đủ có ứng viên, tệ nhất {worst} lệnh đọc");
        }
    }

    /// Hết ngân sách giữa các ô: lượt sau đọc tiếp từ ô chưa đọc (xoay vòng); một ô tự nó vượt cả ngân sách còn nguyên khi đứng đầu
    /// lượt thì bị bỏ qua ở lượt đó để không kẹt; ngân sách đã bị dùng bớt thì không bỏ qua.
    #[test]
    fn a_small_budget_rotates_over_the_tiles() {
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        let snap = &fixture("meet-chrome-macos.jsonl")[0];
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let tiles = Walk::new(roots[0], 0, true).step(&mut tree, app, &mut Budget::unlimited()).unwrap();
        assert_eq!(tiles.len(), 2);
        let cost = |i: usize, tree: &mut FixtureTree| {
            let mut b = Budget::unlimited();
            assert!(matches!(sample_tile(tree, &tiles[i], app, true, &mut b), TileRead::Sample(_)));
            b.used()
        };
        let (c0, c1) = (cost(0, &mut tree), cost(1, &mut tree));
        let mut b = Budget::new(c0 + 1, Duration::from_secs(60));
        let first = sample_round(&mut tree, &tiles, app, 0, true, &mut b);
        assert_eq!((first.samples.len(), first.next, first.gone), (1, 1, false));
        let mut b = Budget::new(c1 + 1, Duration::from_secs(60));
        let second = sample_round(&mut tree, &tiles, app, first.next, true, &mut b);
        assert_eq!(second.samples[0].slot, tiles[1].slot, "lượt sau bắt đầu từ ô chưa đọc");
        let mut tiny = Budget::new(3, Duration::from_secs(60));
        let stuck = sample_round(&mut tree, &tiles, app, 0, true, &mut tiny);
        assert_eq!((stuck.samples.len(), stuck.next, stuck.gone), (0, 1, false));
        // Còn c0 − 1 lệnh: thiếu một lệnh cho ô 0.
        let mut used = Budget::new(c0 + 1, Duration::from_secs(60));
        assert!(used.take() && used.take());
        let kept = sample_round(&mut tree, &tiles, app, 0, true, &mut used);
        assert_eq!((kept.samples.len(), kept.next), (0, 0), "ngân sách đã dùng bớt: không bỏ qua ô 0");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader::extract 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`Walk`, `Budget`, `sample_tile` … chưa có).

- [ ] **Step 3: Viết mã**

`crates/speaker-worker/src/reader/extract.rs`, trước mod `tests`:

```rust
//! Duyệt cửa sổ họp, tìm ô người tham dự và phần tử neo, lấy mẫu từng ô (spec §6.2–§6.4), viết một lần cho mọi [`Tree`].
//!
//! - Ngân sách ([`Budget`], QĐ 13): ≤ [`MAX_ELEMENTS`] lệnh đọc (mỗi lần gọi [`Tree`]) và ≤ [`PASS_BUDGET`] cho **cả lượt**: duyệt
//!   cửa sổ, lấy mẫu ô, đọc trong ô, tìm neo, ứng viên. Mọi lệnh đi qua [`Metered`]; hết ngân sách thì phần đang đọc dở bị bỏ.
//! - Lượt đầy đủ ([`Walk`]): duyệt theo chiều sâu; hết ngân sách thì dừng, lượt sau đi tiếp từ phần tử chưa duyệt. Tìm ô (phần tử
//!   khớp `tile` của công thức), tên của ô, phần tử neo của tín hiệu đổi trạng thái.
//! - Lượt nhanh ([`sample_round`], [`sample_tile`]): đọc lại nhãn ô, chữ tên (Meet), các neo đã biết; tín hiệu "có mặt" tìm lại neo
//!   trong con của ô. Hết ngân sách thì lượt sau đọc tiếp từ ô chưa đọc (xoay vòng).
//! - Chữ chỉ đọc ở tiêu đề vùng web, phần tử khớp hình dạng của ô, bên trong ô (QĐ 3 của kế hoạch 04). Không gì ngoài tên, mic,
//!   chữ "đang nói" và trạng thái neo ra khỏi module này (spec §6.3).

use std::collections::VecDeque;
use std::collections::hash_map::DefaultHasher;
use std::fmt;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};

use speaker_recipe::{Anchor, AppRecipe, Attrs, NameFrom, Scope, SignalKind, is_self_name, tidy_name};

use super::tree::Tree;

/// Giới hạn mỗi lượt (spec §6.2: 3 000 phần tử), đếm theo lệnh đọc: mỗi phần tử tốn ít nhất một lệnh nên chặt hơn.
pub const MAX_ELEMENTS: u32 = 3_000;
pub const PASS_BUDGET: Duration = Duration::from_millis(30);
pub const MAX_TILES: usize = 32;
/// Số phần tử tối đa đọc bên trong một ô (tìm tên, neo, ứng viên).
pub const MAX_TILE_NODES: usize = 64;
pub const MAX_DEPTH: u32 = 64;
/// Ứng viên tự hiệu chỉnh tối đa mỗi ô (spec §6.5).
pub const MAX_CANDIDATES: usize = 16;
/// Ứng viên nằm trong ô, sâu tối đa chừng này.
const CANDIDATE_DEPTH: usize = 4;

/// Ngân sách của một lượt đọc: số lệnh đọc và thời gian.
pub struct Budget {
    left: u32,
    deadline: Option<Instant>,
    used: u32,
    exhausted: bool,
}

impl Budget {
    pub fn new(reads: u32, time: Duration) -> Self {
        Self {
            left: reads,
            deadline: Some(Instant::now() + time),
            used: 0,
            exhausted: false,
        }
    }

    pub fn unlimited() -> Self {
        Self {
            left: u32::MAX,
            deadline: None,
            used: 0,
            exhausted: false,
        }
    }

    /// Trừ một lệnh đọc; `false` (và từ đó [`Budget::exhausted`]) khi hết lệnh hay hết giờ.
    pub fn take(&mut self) -> bool {
        if self.exhausted || self.left == 0 || self.deadline.is_some_and(|d| Instant::now() >= d) {
            self.exhausted = true;
            return false;
        }
        self.left -= 1;
        self.used += 1;
        true
    }

    pub fn used(&self) -> u32 {
        self.used
    }

    pub fn exhausted(&self) -> bool {
        self.exhausted
    }
}

/// Cây đọc qua ngân sách: mỗi lệnh trừ một đơn vị; hết thì trả rỗng, người gọi xem [`Budget::exhausted`] để bỏ phần đọc dở.
struct Metered<'a, T: Tree> {
    tree: &'a mut T,
    budget: &'a mut Budget,
}

impl<T: Tree> Tree for Metered<'_, T> {
    type Node = T::Node;

    fn role(&mut self, n: &T::Node) -> Option<String> {
        if self.budget.take() { self.tree.role(n) } else { None }
    }

    fn shape(&mut self, n: &T::Node) -> Option<Attrs> {
        if self.budget.take() { self.tree.shape(n) } else { None }
    }

    fn text(&mut self, n: &T::Node, a: &mut Attrs) -> bool {
        self.budget.take() && self.tree.text(n, a)
    }

    fn children(&mut self, n: &T::Node) -> Vec<T::Node> {
        if self.budget.take() { self.tree.children(n) } else { Vec::new() }
    }
}

/// Một ô tìm được ở lượt đầy đủ: phần tử của ô, tên (đã làm gọn), có phải chính người dùng, neo của từng tín hiệu (chỉ tín hiệu
/// đổi trạng thái; tín hiệu "có mặt" tìm lại mỗi lượt).
#[derive(Clone)]
pub struct TileRef<N> {
    pub node: N,
    pub name: String,
    pub is_self: bool,
    pub anchors: Vec<Option<N>>,
    /// Vị trí của ô: thứ tự cửa sổ × 256 + thứ tự trong các ô cùng tên của cửa sổ đó (khóa lịch sử theo từng ô, QĐ 23).
    pub slot: u32,
    /// Phần tử chữ tên (Meet, `NameFrom::Text`): lượt nhanh đọc lại chữ này mỗi lần.
    pub name_node: Option<N>,
}

/// Mẫu của một ô ở một lượt đọc: đúng những gì ra khỏi bộ đọc (spec §6.3).
#[derive(Clone, PartialEq)]
pub struct TileSample {
    pub name: String,
    pub is_self: bool,
    pub muted: Option<bool>,
    /// Tín hiệu 1: nhóm `speaking` của nhãn ô không rỗng.
    pub label_speaking: bool,
    /// Theo thứ tự `speaking` của công thức: trạng thái neo (`Some(1)`: có mặt; tín hiệu đổi trạng thái: băm của vai trò và lớp);
    /// `None`: không có hay không đọc được.
    pub anchors: Vec<Option<u64>>,
    /// Chỉ khi tự hiệu chỉnh: (khóa vị trí trong ô, trạng thái) của tối đa [`MAX_CANDIDATES`] phần tử không có chữ.
    pub candidates: Vec<(u64, u64)>,
    /// Như [`TileRef::slot`].
    pub slot: u32,
}

// Debug viết tay: tên không vào log.
impl fmt::Debug for TileSample {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TileSample")
            .field("name", &format_args!("<{} ký tự>", self.name.chars().count()))
            .field("is_self", &self.is_self)
            .field("muted", &self.muted)
            .field("label_speaking", &self.label_speaking)
            .field("anchors", &self.anchors)
            .field("candidates", &self.candidates.len())
            .field("slot", &self.slot)
            .finish()
    }
}

/// Cửa sổ có phải cửa sổ họp của app không (spec §6.1): id khớp `window_id`, hay tiêu đề khớp một mẫu.
pub fn is_meeting_window(app: &AppRecipe, title: &str, ident: &str) -> bool {
    app.window_id.as_ref().is_some_and(|re| re.is_match(ident)) || app.window_title.iter().any(|re| re.is_match(title))
}

/// Lượt đầy đủ trên một cửa sổ họp, dừng được giữa chừng.
pub struct Walk<N> {
    /// (phần tử, độ sâu, đã ở trong vùng được đọc chữ chưa).
    stack: Vec<(N, u32, bool)>,
    tiles: Vec<TileRef<N>>,
    confirmed: bool,
    window: u32,
}

impl<N: Clone> Walk<N> {
    /// `window`: thứ tự của cửa sổ họp trong lượt đọc (phần cửa sổ của [`TileRef::slot`]).
    pub fn new(node: N, window: u32, web_only: bool) -> Self {
        Self {
            stack: vec![(node, 0, !web_only)],
            tiles: Vec::new(),
            confirmed: false,
            window,
        }
    }

    /// Đi tiếp trong ngân sách; `Some(ô)` khi đã duyệt xong cả cửa sổ. Phần tử đọc dở lúc hết ngân sách được đọc lại từ đầu ở lượt
    /// sau; phần tử đầu tiên của lượt mà tự nó vượt cả phần ngân sách còn lại thì bị bỏ qua (không kẹt mãi ở nó).
    pub fn step<T: Tree<Node = N>>(&mut self, t: &mut T, app: &AppRecipe, budget: &mut Budget) -> Option<Vec<TileRef<N>>> {
        let mut visited = 0u32;
        while let Some(entry) = self.stack.pop() {
            if budget.exhausted() {
                self.stack.push(entry);
                return None;
            }
            let mark = (self.stack.len(), self.tiles.len(), self.confirmed);
            self.visit(&mut Metered { tree: &mut *t, budget: &mut *budget }, app, entry.clone());
            if budget.exhausted() {
                self.stack.truncate(mark.0);
                self.tiles.truncate(mark.1);
                self.confirmed = mark.2;
                if visited > 0 {
                    self.stack.push(entry);
                }
                return None;
            }
            visited += 1;
        }
        let tiles = std::mem::take(&mut self.tiles);
        Some(if app.confirm_id.is_some() && !self.confirmed { Vec::new() } else { tiles })
    }

    fn visit<T: Tree<Node = N>>(&mut self, t: &mut T, app: &AppRecipe, (node, depth, inside): (N, u32, bool)) {
        if depth > MAX_DEPTH {
            return;
        }
        if !inside {
            // Ngoài vùng web của trình duyệt: chỉ đọc vai trò (QĐ 3); chỉ vào vùng web có tiêu đề khớp.
            if t.role(&node).as_deref() == Some("AXWebArea") {
                let mut a = Attrs::default();
                if t.text(&node, &mut a) && app.window_title.iter().any(|re| re.is_match(&a.title)) {
                    for c in t.children(&node).into_iter().rev() {
                        self.stack.push((c, depth + 1, true));
                    }
                }
                return;
            }
            for c in t.children(&node).into_iter().rev() {
                self.stack.push((c, depth + 1, false));
            }
            return;
        }
        let Some(mut a) = t.shape(&node) else { return };
        if app.confirm_id.as_ref().is_some_and(|id| a.ident == *id || a.dom_id == *id) {
            self.confirmed = true;
        }
        if self.tiles.len() < MAX_TILES && app.tile.matches_shape(&a) {
            if app.tile.needs_text() {
                t.text(&node, &mut a);
            }
            if app.tile.matches(&a) {
                if let Some(mut tile) = tile_ref(t, node, &a, app) {
                    let same = self.tiles.iter().filter(|x| x.name == tile.name).count().min(255) as u32;
                    tile.slot = self.window * 256 + same;
                    self.tiles.push(tile);
                }
                return;
            }
        }
        for c in t.children(&node).into_iter().rev() {
            self.stack.push((c, depth + 1, true));
        }
    }
}

fn tile_ref<T: Tree>(t: &mut T, node: T::Node, a: &Attrs, app: &AppRecipe) -> Option<TileRef<T::Node>> {
    let caps = app.tile.label.as_ref().and_then(|re| re.captures(a.label()));
    let (raw, name_node) = match app.name_from {
        NameFrom::Label => (caps.as_ref()?.name("name")?.as_str().to_string(), None),
        NameFrom::Text => {
            let (n, text) = first_text(t, &node)?;
            (text, Some(n))
        }
    };
    let label_self = caps.as_ref().is_some_and(|c| c.name("self").is_some());
    let is_self = label_self || is_self_name(&raw, app);
    let name = tidy_name(&raw, app)?;
    let anchors = app
        .speaking
        .iter()
        .map(|s| match (s.kind, &s.anchor) {
            (SignalKind::Flicker | SignalKind::Deviation, Some(an)) => find_anchor(t, &node, an),
            _ => None,
        })
        .collect();
    Some(TileRef {
        node,
        name,
        is_self,
        anchors,
        slot: 0,
        name_node,
    })
}

/// Phần tử neo đầu tiên trong ô (theo chiều rộng), chỉ đọc hình dạng.
fn find_anchor<T: Tree>(t: &mut T, tile: &T::Node, anchor: &Anchor) -> Option<T::Node> {
    let depth = if anchor.scope == Scope::Child { 1 } else { anchor.max_depth };
    let mut queue: VecDeque<(T::Node, u32)> = t.children(tile).into_iter().map(|c| (c, 1)).collect();
    let mut seen = 0;
    while let Some((n, d)) = queue.pop_front() {
        seen += 1;
        if seen > MAX_TILE_NODES {
            break;
        }
        if t.shape(&n).is_some_and(|a| anchor.matcher.matches_shape(&a)) {
            return Some(n);
        }
        if d < depth {
            queue.extend(t.children(&n).into_iter().map(|c| (c, d + 1)));
        }
    }
    None
}

/// Chữ tĩnh đầu tiên trong ô (tên của ô Meet) và phần tử chứa nó.
fn first_text<T: Tree>(t: &mut T, tile: &T::Node) -> Option<(T::Node, String)> {
    let mut stack: Vec<T::Node> = t.children(tile).into_iter().rev().collect();
    let mut seen = 0;
    while let Some(n) = stack.pop() {
        seen += 1;
        if seen > MAX_TILE_NODES {
            break;
        }
        let Some(mut a) = t.shape(&n) else { continue };
        if a.role == "AXStaticText" && t.text(&n, &mut a) && !a.value.trim().is_empty() {
            return Some((n, a.value));
        }
        stack.extend(t.children(&n).into_iter().rev());
    }
    None
}

/// Trạng thái của một phần tử neo hay ứng viên: băm của vai trò, vai trò phụ, lớp (không có chữ).
fn state_of(a: &Attrs) -> u64 {
    let mut h = DefaultHasher::new();
    (&a.role, &a.subrole, &a.classes).hash(&mut h);
    h.finish()
}

/// Ứng viên tự hiệu chỉnh (spec §6.5): phần tử không có chữ trong ô, khóa là vị trí (chỉ số con theo đường đi) và vai trò.
fn candidates<T: Tree>(t: &mut T, tile: &T::Node) -> Vec<(u64, u64)> {
    let mut out = Vec::new();
    let mut queue: VecDeque<(T::Node, Vec<u16>)> =
        t.children(tile).into_iter().enumerate().map(|(i, c)| (c, vec![i as u16])).collect();
    let mut seen = 0;
    while let Some((n, path)) = queue.pop_front() {
        seen += 1;
        if seen > MAX_TILE_NODES || out.len() >= MAX_CANDIDATES {
            break;
        }
        let Some(mut a) = t.shape(&n) else { continue };
        if !t.text(&n, &mut a) {
            continue;
        }
        if !a.has_text() {
            let mut h = DefaultHasher::new();
            (&path, &a.role).hash(&mut h);
            out.push((h.finish(), state_of(&a)));
        }
        if path.len() < CANDIDATE_DEPTH {
            for (i, c) in t.children(&n).into_iter().enumerate() {
                let mut p = path.clone();
                p.push(i as u16);
                queue.push_back((c, p));
            }
        }
    }
    out
}

/// Kết quả lấy mẫu một ô ở lượt nhanh.
#[derive(Debug)]
pub enum TileRead {
    Sample(TileSample),
    /// Ô không còn: lượt sau duyệt lại cả cửa sổ.
    Gone,
    /// Hết ngân sách giữa chừng: bỏ phần đọc dở, lượt sau đọc lại ô này.
    OutOfBudget,
}

/// Lượt nhanh của một ô: nhãn (tên, mic, chữ "đang nói"), chữ tên (Meet), trạng thái neo, và ứng viên khi `calibrate`; mọi lệnh
/// đọc trừ vào `budget`.
pub fn sample_tile<T: Tree>(
    t: &mut T,
    tile: &TileRef<T::Node>,
    app: &AppRecipe,
    calibrate: bool,
    budget: &mut Budget,
) -> TileRead {
    let read = read_tile(&mut Metered { tree: t, budget: &mut *budget }, tile, app, calibrate);
    if budget.exhausted() {
        return TileRead::OutOfBudget;
    }
    read.map_or(TileRead::Gone, TileRead::Sample)
}

fn read_tile<T: Tree>(t: &mut T, tile: &TileRef<T::Node>, app: &AppRecipe, calibrate: bool) -> Option<TileSample> {
    let mut a = t.shape(&tile.node)?;
    if app.tile.needs_text() && !t.text(&tile.node, &mut a) {
        return None;
    }
    let caps = app.tile.label.as_ref().and_then(|re| re.captures(a.label()));
    let (name, is_self) = match app.name_from {
        NameFrom::Label => {
            let raw = caps.as_ref()?.name("name")?.as_str();
            let label_self = caps.as_ref().is_some_and(|c| c.name("self").is_some());
            (tidy_name(raw, app)?, label_self || is_self_name(raw, app))
        }
        NameFrom::Text => {
            // Đọc lại chữ tên mỗi lượt (rà soát A-NHỎ 8): Meet sắp lại ô hay dùng lại phần tử thì trạng thái neo không bị gán cho
            // tên cũ tới lượt đầy đủ sau.
            let n = tile.name_node.as_ref()?;
            let mut na = t.shape(n)?;
            if !t.text(n, &mut na) {
                return None;
            }
            (tidy_name(&na.value, app)?, is_self_name(&na.value, app))
        }
    };
    let muted = app.mic.as_ref().and_then(|m| match caps.as_ref().and_then(|c| c.name("muted")) {
        Some(v) => Some(m.muted_values.iter().any(|x| x == v.as_str())),
        None => m.absent_means_unmuted.then_some(false),
    });
    let label_speaking = caps
        .as_ref()
        .and_then(|c| c.name("speaking"))
        .is_some_and(|m| !m.as_str().is_empty());
    let anchors = app
        .speaking
        .iter()
        .zip(&tile.anchors)
        .map(|(s, known)| match (s.kind, &s.anchor) {
            (SignalKind::Presence, Some(an)) => find_anchor(t, &tile.node, an).map(|_| 1),
            (SignalKind::Flicker | SignalKind::Deviation, _) => {
                known.as_ref().and_then(|n| t.shape(n)).map(|a| state_of(&a))
            }
            _ => None,
        })
        .collect();
    let candidates = if calibrate { candidates(t, &tile.node) } else { Vec::new() };
    Some(TileSample {
        name,
        is_self,
        muted,
        label_speaking,
        anchors,
        candidates,
        slot: tile.slot,
    })
}

/// Một lượt nhanh trên các ô đã biết của một cửa sổ.
#[derive(Debug)]
pub struct Round {
    pub samples: Vec<TileSample>,
    /// Ô bắt đầu của lượt sau (xoay vòng khi hết ngân sách giữa chừng).
    pub next: usize,
    /// Một ô không còn: duyệt lại cả cửa sổ.
    pub gone: bool,
}

/// Lượt nhanh bắt đầu từ ô `from`, xoay vòng qua mọi ô trong ngân sách (spec §6.2: vượt thì lượt sau đọc tiếp). Ô đầu tiên của lượt
/// mà vượt cả ngân sách còn nguyên thì bị bỏ qua ở lượt này để lượt sau không kẹt ở nó; ngân sách đã bị phần duyệt cửa sổ dùng bớt
/// thì không bỏ qua ô nào (lượt sau đọc lại từ chính ô đó).
pub fn sample_round<T: Tree>(
    t: &mut T,
    tiles: &[TileRef<T::Node>],
    app: &AppRecipe,
    from: usize,
    calibrate: bool,
    budget: &mut Budget,
) -> Round {
    let n = tiles.len();
    let fresh = budget.used() == 0;
    let mut samples = Vec::new();
    for k in 0..n {
        let i = (from + k) % n;
        match sample_tile(t, &tiles[i], app, calibrate, budget) {
            TileRead::Sample(s) => samples.push(s),
            TileRead::Gone => {
                return Round {
                    samples,
                    next: 0,
                    gone: true,
                };
            }
            TileRead::OutOfBudget => {
                let next = if k == 0 && fresh { (i + 1) % n } else { i };
                return Round {
                    samples,
                    next,
                    gone: false,
                };
            }
        }
    }
    Round {
        samples,
        next: 0,
        gone: false,
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- reader:: --nocapture 2>&1 | grep -E "^test result|FAILED|panicked|lệnh đọc"`
Expected: `test result: ok. 14 passed` (3 của `tree`, 11 của `extract`); dòng `--nocapture` của `a_whole_pass_with_calibration_stays_within_the_read_limit` in số lệnh tệ nhất của từng fixture: **ghi vào ghi chú làm việc** (Task 18 chép vào `results/04-do.md`). Vượt 3 000 thì test đỏ: dừng, báo (không nới `MAX_ELEMENTS`). Nếu `teams_tiles_…` hay `fixture_tile_names_are_the_made_up_ones` đỏ vì tên trong fixture không phải tên giả thì dừng, báo người điều phối (ánh xạ tự động của Task 3 Step 2 sót tên; không sửa test, không sửa fixture bằng tay).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && scripts/release/check-no-network.sh && git status --short`
Expected: sạch; không mã mạng. Không commit.

---
### Task 5: Tín hiệu "đang nói" theo thời gian (`SpeakingTracker`)

**Files:**
- Create: `crates/speaker-worker/src/names/mod.rs`, `crates/speaker-worker/src/names/track.rs`
- Modify: `crates/speaker-worker/src/lib.rs` (thêm `pub mod names;`)

- [ ] **Step 1: Viết test đỏ**

`crates/speaker-worker/src/lib.rs`: thêm `pub mod names;` (sau `pub mod fbank;`).

`crates/speaker-worker/src/names/mod.rs`:

```rust
//! Phần thuần của đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §5.3, §6.4–§6.6): tín hiệu "đang nói" theo thời gian (`track`),
//! mốc giờ (`clock`), ghép tên vào giọng (`matcher`), tách giọng bị gộp (`split`), tự hiệu chỉnh (`calibrate`). Chạy trên luồng
//! chính của worker, tất định, test bằng fixture và dòng thời gian giả. Chỉ trong RAM, xóa khi phiên mới (§5.6). Tên không vào log.

use std::fmt;

pub mod track;

/// Người tham dự đang "nói" theo tín hiệu nào (spec §6.4).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Via {
    None,
    /// Tín hiệu 1, 2 của công thức.
    Indicator,
    /// Tín hiệu 3: người ở xa duy nhất đang mở mic (chỉ tính khi máy có tiếng).
    Mic,
    /// Chỉ báo tự học (6.5).
    Learned,
}

/// Một người tham dự ở một lượt đọc (spec §6.3: tên, mic, mức nói, có phải chính người dùng).
#[derive(Clone, PartialEq)]
pub struct ParticipantNow {
    pub name: String,
    pub is_self: bool,
    pub muted: Option<bool>,
    /// 1 khi đang nói theo `via`, 0 khi không.
    pub speaking: f32,
    pub via: Via,
}

// Debug viết tay: tên không vào log.
impl fmt::Debug for ParticipantNow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ParticipantNow(<{} ký tự>, tôi: {}, mic tắt: {:?}, nói: {} qua {:?})", self.name.chars().count(), self.is_self, self.muted, self.speaking, self.via)
    }
}
```

`crates/speaker-worker/src/names/track.rs` (phần test; mã ở Step 3):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::reader::extract::tests::{meet_recipes, recipes, tiles_of, zoom_recipes};
    use crate::reader::tree::tests::{fixture, truth};
    use speaker_recipe::{MeetingApp, Os, Recipes};
    use std::collections::BTreeSet;

    fn on_at(truth: &[(f64, String, bool)], who: &str, t: f64) -> bool {
        // `rfind` thay `filter().last()` (clippy `double_ended_iterator_last`, rà soát A-C2.3).
        truth.iter().rfind(|(at, w, _)| *at <= t && w == who).is_some_and(|(_, _, on)| *on)
    }

    /// Có ai trong sự thật đang bật mic ở khoảng [t − 1,6 s, t − 0,6 s] (như `quiet_at` của bộ đọc thật: trễ chỉ báo cộng 1 s).
    fn anyone_on(truth: &[(f64, String, bool)], t: f64) -> bool {
        let who: BTreeSet<&str> = truth.iter().map(|x| x.1.as_str()).collect();
        who.into_iter().any(|w| (0..=4).any(|k| on_at(truth, w, t - 0.6 - 0.25 * f64::from(k))))
    }

    /// Như `bench/2026-10-26-nguoi-noi/tro-nang/o_dang_noi.py`: lưới 0,25 s; ở mỗi điểm đẩy ảnh chụp gần nhất vào bộ theo dõi (như bộ
    /// đọc thật đọc đều 250 ms, QĐ 23), sự thật dời 0,6 s; tính khớp từ giây thứ 1 tới ảnh chụp cuối. Trả phần điểm khớp của người
    /// tham dự `name` so với người nói thật `who`.
    fn agreement(r: &Recipes, file: &str, app: MeetingApp, name: &str, who: &str) -> f64 {
        let app = r.app(Os::Macos, app).unwrap();
        let snaps = fixture(file);
        let truth = truth(file);
        let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
        let (mut hits, mut n) = (0usize, 0usize);
        let mut t = snaps[0].t;
        let end = snaps.last().unwrap().t;
        while t < end {
            let i = snaps.partition_point(|s| s.t <= t) - 1;
            let (_, tiles) = tiles_of(&snaps[i], app);
            let now = tracker.push((t * 1000.0) as i64, &tiles, &BTreeMap::new(), !anyone_on(&truth, t));
            if t >= snaps[0].t + 1.0 {
                let speaking = now.iter().any(|p| p.name == name && p.speaking > 0.5);
                hits += usize::from(speaking == on_at(&truth, who, t - 0.6));
                n += 1;
            }
            t += 0.25;
        }
        hits as f64 / n as f64
    }

    /// Kế hoạch 01 (`results/teams-chrome.md`): khung "đang nói" ở ô video Teams khớp sự thật 95–97% (dời 0,6 s).
    #[test]
    fn teams_frames_follow_who_speaks() {
        for file in ["teams-macos-people-closed.jsonl", "teams-macos-people-open.jsonl"] {
            for who in ["Lan", "Minh"] {
                let a = agreement(&recipes(), file, MeetingApp::Teams, who, who);
                eprintln!("{file} {who}: {a:.3}");
                assert!(a >= 0.90, "{file} {who}: {a:.3}");
            }
        }
    }

    /// Kế hoạch 01: ô của người nói trong cửa sổ của chính nó khớp 69–80% với từng tín hiệu (thanh âm lượng, lớp sáng); ở đây gộp
    /// hai tín hiệu, lịch sử theo từng ô rồi gộp theo tên (QĐ 23). Người rà đo cách này (theo ô, 250 ms): 0,890. Không có đường lùi
    /// hạ ngưỡng: đỏ thì dừng, báo. **Số này đo ô của tài khoản đang nói trong chính cửa sổ của nó** (khi dùng thật là ô của chính
    /// người dùng); ở cửa sổ người nghe không có chỉ báo: xem `meet_gives_no_name_in_the_listener_window` (Task 7) và QĐ 32.
    #[test]
    fn meet_level_bar_and_highlight_follow_the_voice() {
        let a = agreement(&meet_recipes(), "meet-chrome-macos.jsonl", MeetingApp::MeetChrome, "Hoa Phạm", "nguoinoi");
        eprintln!("meet: {a:.3}");
        assert!(a >= 0.80, "{a:.3}");
    }

    #[test]
    fn zoom_follows_the_active_speaker_label() {
        let r = zoom_recipes();
        let app = r.app(Os::Macos, MeetingApp::Zoom).unwrap();
        let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
        let who = |tracker: &mut SpeakingTracker, s: &crate::reader::tree::Snapshot| {
            let now = tracker.push((s.t * 1000.0) as i64, &tiles_of(s, app).1, &BTreeMap::new(), true);
            now.into_iter().filter(|p| p.speaking > 0.5).map(|p| (p.name, p.via)).collect::<Vec<_>>()
        };
        let snaps = fixture("zoom-macos-synthetic.jsonl");
        assert_eq!(who(&mut tracker, &snaps[0]), [("Lan Nguyễn".to_string(), Via::Indicator)]);
        assert_eq!(who(&mut tracker, &snaps[3]), [("Minh Trần".to_string(), Via::Indicator)]);
        assert!(who(&mut tracker, &snaps[5]).is_empty());
    }

    #[test]
    fn flicker_needs_two_changes_within_a_second_and_deviation_a_quiet_baseline() {
        let mut h = History::default();
        h.push(0, Some(1), true);
        h.push(400, Some(2), true);
        assert!(!h.flickering(), "một lần đổi");
        h.push(800, Some(1), true);
        assert!(h.flickering());
        h.push(2_000, Some(1), true);
        assert!(!h.flickering(), "các lần đổi cũ hơn 1 s bị quên");
        let mut d = History::default();
        for i in 0..9 {
            d.push(i * 250, Some(7), true);
        }
        d.push(2_250, Some(8), false);
        assert!(!d.deviating(), "chưa đủ 10 lượt máy im");
        d.push(2_500, Some(7), true);
        d.push(2_750, Some(8), false);
        assert!(d.deviating(), "khác nền của các lượt máy im");
        for i in 0..60 {
            d.push(3_000 + i * 250, Some(8), false);
        }
        assert!(d.deviating(), "lượt có tiếng không vào nền");
    }

    fn tile(name: &str, slot: u32, anchor: Option<u64>, candidates: Vec<(u64, u64)>) -> TileSample {
        TileSample {
            name: name.into(),
            is_self: false,
            muted: None,
            label_speaking: false,
            anchors: vec![anchor],
            candidates,
            slot,
        }
    }

    #[test]
    fn the_same_name_in_two_windows_is_one_participant() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Presence]);
        let tiles = [tile("Lan", 0, None, vec![]), tile("Lan", 256, Some(1), vec![])];
        let now = tracker.push(0, &tiles, &BTreeMap::new(), true);
        assert_eq!(now.len(), 1);
        assert_eq!((now[0].speaking, now[0].via), (1.0, Via::Indicator));
    }

    /// QĐ 23 (rà soát A-Q1): hai ô cùng tên, mỗi ô đứng yên ở trạng thái riêng, không được coi là "đổi trạng thái".
    #[test]
    fn two_tiles_with_the_same_name_keep_separate_histories() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Flicker]);
        let mut last = Vec::new();
        for i in 0..8 {
            let tiles = [tile("Minh", 0, Some(1), vec![]), tile("Minh", 1, Some(2), vec![])];
            last = tracker.push(i * 250, &tiles, &BTreeMap::new(), true);
        }
        assert_eq!((last.len(), last[0].via), (1, Via::None));
    }

    /// Rà soát A-Q9: người nói 70% số lượt đọc (nhịp 4/s khi có tiếng làm lượt có tiếng chiếm đa số) không bị đảo chiều, vì nền lấy
    /// từ các lượt máy im (QĐ 23).
    #[test]
    fn a_talker_at_seventy_percent_is_not_inverted() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Deviation]);
        let mut wrong = 0;
        for i in 0..200i64 {
            let talking = i % 10 < 7;
            let state = if talking { 2 } else { 1 };
            let now = tracker.push(i * 250, &[tile("Lan", 0, Some(state), vec![])], &BTreeMap::new(), !talking);
            if i >= 40 && (now[0].speaking > 0.5) != talking {
                wrong += 1;
            }
        }
        assert_eq!(wrong, 0);
    }

    #[test]
    fn a_learned_candidate_makes_its_participant_speak() {
        let mut tracker = SpeakingTracker::new(vec![SignalKind::Presence]);
        let learned = BTreeMap::from([("Lan".to_string(), 42u64)]);
        let mut last = Vec::new();
        for i in 0..20 {
            last = tracker.push(i * 250, &[tile("Lan", 0, None, vec![(42, 1)])], &learned, true);
        }
        assert_eq!(last[0].via, Via::None);
        let now = tracker.push(5_000, &[tile("Lan", 0, None, vec![(42, 2)])], &learned, false);
        assert_eq!((now[0].speaking, now[0].via), (1.0, Via::Learned));
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::track 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`SpeakingTracker`, `History` chưa có).

- [ ] **Step 3: Viết mã**

`crates/speaker-worker/src/names/track.rs`, trước mod `tests`:

```rust
//! Tín hiệu "đang nói" của từng người tham dự qua các lượt đọc (spec §6.4): chữ trong nhãn ô (tín hiệu 1); phần tử neo có mặt,
//! đổi trạng thái ≥ 2 lần trong 1 s, hay khác trạng thái nền của chính nó (tín hiệu 2); chỉ báo tự học (6.5). Tín hiệu mic (3) cần
//! tiếng nói của máy nên nằm ở `matcher`. Lịch sử khóa theo **từng ô** (tên, `slot`), rồi mới gộp các ô cùng tên thành một người
//! (QĐ 23 của kế hoạch 04). Nền của tín hiệu "khác trạng thái thường gặp" chỉ lấy từ các lượt máy im (`quiet_at`, Task 6).

use std::collections::{BTreeMap, VecDeque};

use speaker_recipe::SignalKind;

use super::{ParticipantNow, Via};
use crate::reader::extract::TileSample;

pub const FLICKER_WINDOW_MS: i64 = 1_000;
pub const FLICKER_CHANGES: usize = 2;
/// Nền của tín hiệu "khác trạng thái thường gặp": chừng này lượt máy im gần nhất.
pub const DEVIATION_BASELINE: usize = 40;
/// Cần ít nhất chừng này lượt máy im mới có nền.
pub const DEVIATION_MIN_QUIET: usize = 10;
/// Lịch sử của ô không còn thấy quá chừng này thì bỏ.
pub const HISTORY_KEEP_MS: i64 = 300_000;
/// Khóa lịch sử của chỉ báo tự học (không trùng chỉ số tín hiệu của công thức).
const LEARNED: usize = usize::MAX;

#[derive(Default)]
struct History {
    last: Option<Option<u64>>,
    changes: VecDeque<i64>,
    /// Trạng thái ở các lượt máy im gần nhất: nền của tín hiệu "khác trạng thái thường gặp" (rà soát A-Q9: lấy trên cả phiên thì
    /// người nói nhiều làm tín hiệu đảo chiều).
    quiet: VecDeque<Option<u64>>,
    updated_ms: i64,
}

impl History {
    fn push(&mut self, at_ms: i64, state: Option<u64>, quiet: bool) {
        if self.last.is_some_and(|l| l != state) {
            self.changes.push_back(at_ms);
        }
        self.last = Some(state);
        self.updated_ms = at_ms;
        while self.changes.front().is_some_and(|&t| t <= at_ms - FLICKER_WINDOW_MS) {
            self.changes.pop_front();
        }
        if quiet {
            self.quiet.push_back(state);
            if self.quiet.len() > DEVIATION_BASELINE {
                self.quiet.pop_front();
            }
        }
    }

    fn flickering(&self) -> bool {
        self.changes.len() >= FLICKER_CHANGES
    }

    fn deviating(&self) -> bool {
        if self.quiet.len() < DEVIATION_MIN_QUIET {
            return false;
        }
        let mut counts: BTreeMap<Option<u64>, usize> = BTreeMap::new();
        for s in &self.quiet {
            *counts.entry(*s).or_default() += 1;
        }
        // Bằng số lần thì trạng thái có khóa nhỏ hơn là nền (tất định).
        let base = counts.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map(|(s, _)| *s);
        self.last.is_some_and(|l| Some(l) != base)
    }
}

pub struct SpeakingTracker {
    kinds: Vec<SignalKind>,
    /// Khóa: (tên, `slot` của ô, chỉ số tín hiệu).
    history: BTreeMap<(String, u32, usize), History>,
}

impl SpeakingTracker {
    /// `kinds`: loại của từng tín hiệu trong công thức, theo thứ tự (`TileSample::anchors` cùng thứ tự).
    pub fn new(kinds: Vec<SignalKind>) -> Self {
        Self {
            kinds,
            history: BTreeMap::new(),
        }
    }

    /// Một lượt đọc lúc `at_ms`; `learned`: chỉ báo tự học của từng người (khóa ứng viên); `quiet`: máy im ở lượt này
    /// (`quiet_at`). Trả mỗi người tham dự một dòng, theo tên.
    pub fn push(
        &mut self,
        at_ms: i64,
        tiles: &[TileSample],
        learned: &BTreeMap<String, u64>,
        quiet: bool,
    ) -> Vec<ParticipantNow> {
        let mut now: BTreeMap<String, ParticipantNow> = BTreeMap::new();
        for tile in tiles {
            let mut by_signal = false;
            for (i, kind) in self.kinds.iter().enumerate() {
                let state = tile.anchors.get(i).copied().flatten();
                let on = match kind {
                    SignalKind::Label => tile.label_speaking,
                    SignalKind::Presence => state.is_some(),
                    SignalKind::Flicker | SignalKind::Deviation => {
                        let h = self.history.entry((tile.name.clone(), tile.slot, i)).or_default();
                        h.push(at_ms, state, quiet);
                        if *kind == SignalKind::Flicker { h.flickering() } else { h.deviating() }
                    }
                };
                by_signal |= on;
            }
            let by_learned = match learned.get(&tile.name) {
                Some(key) => {
                    let state = tile.candidates.iter().find(|(k, _)| k == key).map(|&(_, s)| s);
                    let h = self.history.entry((tile.name.clone(), tile.slot, LEARNED)).or_default();
                    h.push(at_ms, state, quiet);
                    h.deviating() || h.flickering()
                }
                None => false,
            };
            let via = if by_signal {
                Via::Indicator
            } else if by_learned {
                Via::Learned
            } else {
                Via::None
            };
            let p = now.entry(tile.name.clone()).or_insert_with(|| ParticipantNow {
                name: tile.name.clone(),
                is_self: false,
                muted: None,
                speaking: 0.0,
                via: Via::None,
            });
            p.is_self |= tile.is_self;
            p.muted = match (p.muted, tile.muted) {
                (Some(false), _) | (_, Some(false)) => Some(false),
                (a, b) => a.or(b),
            };
            if via == Via::Indicator || (via == Via::Learned && p.via == Via::None) {
                p.via = via;
                p.speaking = 1.0;
            }
        }
        self.history.retain(|_, h| at_ms - h.updated_ms <= HISTORY_KEEP_MS);
        now.into_values().collect()
    }
}
```

`names/mod.rs`: thêm `use` cần cho `track.rs` không có gì thêm (đã có `pub mod track;`).

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::track --nocapture 2>&1 | grep -E "^test result|FAILED|panicked|: 0\.[0-9]{3}"`
Expected: `test result: ok. 8 passed`; các dòng số khớp: Teams bốn dòng ≥ 0,900 (người rà đo 0,952–0,961), Meet ≥ 0,800 (người rà đo theo ô, đẩy 250 ms, cách tính `deviation` cũ: 0,890; con số với nền lượt máy im chưa đo). **Ghi bốn số Teams và số Meet vào ghi chú làm việc** (Task 11 chép vào `results/04-ghep-ten.md`). **Không hạ ngưỡng, không chỉnh công thức cho vừa fixture** (QĐ 23): Teams dưới 0,90 hay Meet dưới 0,80 thì dừng, báo người điều phối kèm số.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch; thêm `?? crates/speaker-worker/src/names/`. Không commit.

---

### Task 6: Khoảng thời gian (`Spans`) và mốc giờ chung (`Clock`)

**Files:**
- Modify: `crates/speaker-worker/src/names/mod.rs` (thêm `Spans`, `pub mod clock;`)
- Modify: `crates/speaker-worker/src/names/track.rs` (thêm `quiet_at`: máy im ở một lượt đọc, nền của tín hiệu `deviation`, QĐ 23)
- Create: `crates/speaker-worker/src/names/clock.rs`

- [ ] **Step 1: Viết test đỏ**

`crates/speaker-worker/src/names/mod.rs`: thêm `pub mod clock;` trước `pub mod track;`, và cuối file:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spans_merge_overlapping_and_touching_pieces() {
        let mut s = Spans::default();
        s.add(1_000, 2_000);
        s.add(3_000, 4_000);
        s.add(1_500, 3_000);
        s.add(5_000, 5_000);
        assert_eq!(s.iter().copied().collect::<Vec<_>>(), [(1_000, 4_000)]);
        s.add(500, 600);
        assert_eq!(s.iter().copied().collect::<Vec<_>>(), [(500, 600), (1_000, 4_000)]);
        assert_eq!(s.overlap(550, 1_500), 50 + 500);
        assert!(s.covers(1_000) && !s.covers(4_000) && !s.covers(700));
        assert_eq!(s.last_end(), Some(4_000));
        s.prune(1_000);
        assert_eq!(s.iter().copied().collect::<Vec<_>>(), [(1_000, 4_000)]);
    }

    #[test]
    fn intersections_count_only_time_in_both_and_in_the_window() {
        let mut a = Spans::default();
        a.add(0, 10_000);
        let mut b = Spans::default();
        b.add(2_000, 3_000);
        b.add(8_000, 12_000);
        assert_eq!(a.intersect(&b, 0, 20_000), 1_000 + 2_000);
        assert_eq!(a.intersect(&b, 2_500, 9_000), 500 + 1_000);
    }
}
```

`crates/speaker-worker/src/names/clock.rs` (phần test):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_speech_the_session_start_is_zero() {
        let mut c = Clock::default();
        assert_eq!(c.to_session_ms(5_000), None);
        c.start(1_000);
        assert_eq!(c.to_session_ms(5_000), Some(4_000));
    }

    /// QĐ 12: mốc là giờ nhận `Speech` sớm nhất so với `end_ms` của nó (luồng VAD gửi ngay khi thấy).
    #[test]
    fn the_earliest_speech_receipt_sets_zero() {
        let mut c = Clock::default();
        c.start(1_000);
        c.speech(500, 1_700);
        assert_eq!(c.zero_unix_ms(), Some(1_200));
        c.speech(1_000, 2_050);
        assert_eq!(c.zero_unix_ms(), Some(1_050));
        c.speech(1_500, 2_900);
        assert_eq!(c.zero_unix_ms(), Some(1_050), "nhận muộn không đổi mốc");
    }

    #[test]
    fn the_window_forgets_old_receipts_so_the_zero_can_drift() {
        let mut c = Clock::default();
        c.start(0);
        c.speech(1_000, 1_010);
        for i in 0..CLOCK_WINDOW as u64 {
            c.speech(2_000 + i * 500, 2_000 + i * 500 + 40);
        }
        assert_eq!(c.zero_unix_ms(), Some(40), "mẫu 10 ms đã ra khỏi cửa sổ 64 mẫu");
        c.start(9_999);
        assert_eq!(c.zero_unix_ms(), Some(9_999), "phiên mới quên mọi mẫu");
    }
}
```

`crates/speaker-worker/src/names/track.rs`, cuối mod `tests`:

```rust

    #[test]
    fn quiet_means_no_machine_speech_within_the_delay_and_a_second() {
        let mut speech = Spans::default();
        speech.add(10_000, 12_000);
        assert!(!quiet_at(&speech, 13_000, 900), "tiếng kết thúc 1 s trước, trễ 0,9 s");
        assert!(quiet_at(&speech, 14_000, 900));
        assert!(quiet_at(&speech, 9_999, 900), "chưa có tiếng");
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::tests names::clock names::track::tests::quiet 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`Spans`, `Clock`, `quiet_at` chưa có).

- [ ] **Step 3: Viết mã**

`crates/speaker-worker/src/names/mod.rs`: thêm `use std::collections::VecDeque;` và trước mod `tests`:

```rust
/// Các khoảng thời gian [đầu, cuối) theo ms của phiên, tăng dần, đã gộp chỗ chồng và chỗ chạm nhau.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Spans(VecDeque<(i64, i64)>);

impl Spans {
    pub fn add(&mut self, start: i64, end: i64) {
        if end <= start {
            return;
        }
        let at = self.0.partition_point(|&(s, _)| s < start);
        self.0.insert(at, (start, end));
        let mut merged: VecDeque<(i64, i64)> = VecDeque::with_capacity(self.0.len());
        for &(s, e) in &self.0 {
            match merged.back_mut() {
                Some(last) if s <= last.1 => last.1 = last.1.max(e),
                _ => merged.push_back((s, e)),
            }
        }
        self.0 = merged;
    }

    /// Thời gian chung với [start, end).
    pub fn overlap(&self, start: i64, end: i64) -> i64 {
        self.0.iter().map(|&(s, e)| (e.min(end) - s.max(start)).max(0)).sum()
    }

    /// Thời gian có ở cả hai, trong [start, end).
    pub fn intersect(&self, other: &Spans, start: i64, end: i64) -> i64 {
        let mut total = 0;
        for &(a0, a1) in &self.0 {
            for &(b0, b1) in &other.0 {
                total += (a1.min(b1).min(end) - a0.max(b0).max(start)).max(0);
            }
        }
        total
    }

    pub fn covers(&self, t: i64) -> bool {
        self.0.iter().any(|&(s, e)| s <= t && t < e)
    }

    pub fn last_end(&self) -> Option<i64> {
        self.0.back().map(|&(_, e)| e)
    }

    /// Bỏ các khoảng kết thúc trước `before`.
    pub fn prune(&mut self, before: i64) {
        while self.0.front().is_some_and(|&(_, e)| e <= before) {
            self.0.pop_front();
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = &(i64, i64)> {
        self.0.iter()
    }
}
```

`crates/speaker-worker/src/names/track.rs`: dòng `use super::{ParticipantNow, Via};` thành `use super::{ParticipantNow, Spans, Via};`; thêm sau hằng `HISTORY_KEEP_MS`:

```rust
/// Máy "im" ở một lượt khi không có tiếng nói trong khoảng trễ của app cộng chừng này trước lượt đó.
pub const QUIET_MARGIN_MS: i64 = 1_000;

/// Máy im ở lượt đọc lúc `at_ms`: không có tiếng nói (theo `Speech`) trong [`at_ms` − trễ − 1 s, `at_ms`].
pub fn quiet_at(speech: &Spans, at_ms: i64, delay_ms: i64) -> bool {
    speech.overlap(at_ms - delay_ms - QUIET_MARGIN_MS, at_ms + 1) == 0
}
```

`crates/speaker-worker/src/names/clock.rs`, trước mod `tests`:

```rust
//! Mốc giờ chung giữa đoạn âm thanh (ms từ đầu phiên, theo đồng hồ âm thanh) và lượt đọc của bộ đọc tên (giờ hệ thống), QĐ 12 của
//! kế hoạch 04: `SessionStart.unix_ms` (client tính một lần mỗi phiên), hiệu chỉnh bằng giờ nhận `Speech`: mốc = nhỏ nhất của
//! (giờ nhận − `end_ms`) trên [`CLOCK_WINDOW`] `Speech` gần nhất (luồng VAD gửi ngay khi thấy, nên trễ nhỏ nhất gần 0; đồng hồ âm
//! thanh trôi thì mốc trôi theo).

use std::collections::VecDeque;

pub const CLOCK_WINDOW: usize = 64;

#[derive(Default)]
pub struct Clock {
    session_unix_ms: Option<u64>,
    receipts: VecDeque<i64>,
}

impl Clock {
    /// Phiên mới (`SessionStart`): quên mọi mẫu.
    pub fn start(&mut self, unix_ms: u64) {
        self.session_unix_ms = Some(unix_ms);
        self.receipts.clear();
    }

    /// Một `Speech` kết thúc ở `end_ms` của phiên, tới lúc `recv_unix_ms`.
    pub fn speech(&mut self, end_ms: u64, recv_unix_ms: u64) {
        self.receipts.push_back(recv_unix_ms as i64 - end_ms as i64);
        while self.receipts.len() > CLOCK_WINDOW {
            self.receipts.pop_front();
        }
    }

    /// Giờ Unix của mốc 0 của phiên.
    pub fn zero_unix_ms(&self) -> Option<i64> {
        self.receipts.iter().min().copied().or(self.session_unix_ms.map(|v| v as i64))
    }

    /// Giờ hệ thống sang ms của phiên.
    pub fn to_session_ms(&self, unix_ms: u64) -> Option<i64> {
        self.zero_unix_ms().map(|z| unix_ms as i64 - z)
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::tests names::clock names::track::tests::quiet 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 6 passed`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch. Không commit.

---

### Task 7: Ghép tên vào giọng (`NameMatcher`)

**Files:**
- Create: `crates/speaker-worker/src/names/matcher.rs`
- Modify: `crates/speaker-worker/src/names/mod.rs` (thêm `pub mod matcher;`)

- [ ] **Step 1: Viết test đỏ (dòng thời gian giả)**

`names/mod.rs`: thêm `pub mod matcher;` sau `pub mod clock;`.

`crates/speaker-worker/src/names/matcher.rs` (phần test):

```rust
#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    const ROOMLESS: BTreeSet<u32> = BTreeSet::new();

    pub(crate) fn person(name: &str, speaking: bool) -> ParticipantNow {
        ParticipantNow {
            name: name.into(),
            is_self: false,
            muted: None,
            speaking: if speaking { 1.0 } else { 0.0 },
            via: if speaking { Via::Indicator } else { Via::None },
        }
    }

    /// Lượt đọc mỗi 250 ms trong [from, to) (giờ của lượt đọc); mỗi người nói trong các khoảng `talks` (giờ tiếng nói); chỉ báo hiện
    /// trễ `delay` ms sau lúc nói, như Teams (spec §6.6).
    pub(crate) fn read(m: &mut NameMatcher, from: i64, to: i64, delay: i64, people: &[(&str, &[(i64, i64)])]) {
        let mut t = from;
        while t < to {
            let now: Vec<ParticipantNow> = people
                .iter()
                .map(|(n, talks)| person(n, talks.iter().any(|&(s, e)| s + delay <= t && t < e + delay)))
                .collect();
            m.observe(t, 250, delay, &now);
            t += 250;
        }
    }

    pub(crate) fn seg(id: u64, s: i64, e: i64, voice: u32) -> SegRec {
        SegRec::new(id, s, e, Some(voice), false, None, true)
    }

    fn seg_e(id: u64, s: i64, e: i64, voice: u32, emb: [f32; 3]) -> SegRec {
        SegRec::new(id, s, e, Some(voice), false, Some(emb.to_vec()), true)
    }

    fn name_of(m: &NameMatcher, voice: u32) -> Option<String> {
        m.names().get(&voice).map(|n| n.name.clone())
    }

    const LAN: &[(i64, i64)] = &[(0, 4_000), (10_000, 14_000)];

    #[test]
    fn a_voice_gets_the_name_that_speaks_with_it_after_two_segments() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        read(&mut m, 0, 6_000, 900, &[("Lan", LAN), ("Minh", &[])]);
        assert!(!m.settle(900, &Spans::default(), &ROOMLESS), "một đoạn chưa đủ (spec §6.6: ≥ 2 đoạn)");
        assert_eq!(name_of(&m, 1), None);
        m.segment(seg(1, 10_000, 14_000, 1));
        read(&mut m, 6_000, 16_000, 900, &[("Lan", LAN), ("Minh", &[])]);
        assert!(m.settle(900, &Spans::default(), &ROOMLESS));
        let names = m.names();
        assert_eq!(names[&1].name, "Lan");
        assert_eq!((names[&1].room_index, names[&1].source), (None, NameSource::Indicator));
        assert_eq!(m.participants(), ["Lan", "Minh"]);
    }

    #[test]
    fn a_segment_waits_for_the_late_indicator() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        read(&mut m, 0, 4_000, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(m.records().next().unwrap().attributed, None, "dấu đang nói của cuối đoạn chưa tới");
        read(&mut m, 4_000, 5_750, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(m.records().next().unwrap().attributed.as_deref(), Some("Lan"));
    }

    /// Nói chồng cả hai lượt: mỗi tên 50% < 60%, không gán (thà "Người N" còn hơn sai tên).
    #[test]
    fn overlapping_speakers_leave_the_voice_unnamed() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 1));
        read(&mut m, 0, 16_000, 900, &[("Lan", LAN), ("Minh", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1), None);
    }

    /// Spec §6.6: một tên khớp nhiều giọng khác hẳn nhau (máy chung phòng, tâm nhúng cosine 0) giữ tên kèm số theo thứ tự xuất hiện.
    #[test]
    fn one_name_on_two_voices_is_a_shared_room() {
        let mut m = NameMatcher::default();
        let room: &[(i64, i64)] = &[(0, 4_000), (5_000, 9_000), (10_000, 14_000), (15_000, 19_000)];
        m.segment(seg_e(0, 0, 4_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(1, 5_000, 9_000, 2, [0.0, 1.0, 0.0]));
        m.segment(seg_e(2, 10_000, 14_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(3, 15_000, 19_000, 2, [0.0, 1.0, 0.0]));
        read(&mut m, 0, 21_000, 900, &[("Phòng A", room)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        let names = m.names();
        assert_eq!((names[&1].name.as_str(), names[&1].room_index), ("Phòng A", Some(1)));
        assert_eq!((names[&2].name.as_str(), names[&2].room_index), ("Phòng A", Some(2)));
    }

    /// QĐ 9 (rà soát A-Q7): một người bị phân cụm tách thành hai giọng giống nhau (cosine 0,95 > `split_max_cosine` 0,85): mỗi tên
    /// một giọng, chỉ giọng có nhiều thời gian trùng hơn mang tên, không đánh số như máy chung phòng.
    #[test]
    fn one_person_split_into_two_similar_voices_names_only_one() {
        let mut m = NameMatcher::default();
        let lan: &[(i64, i64)] = &[(0, 4_000), (5_000, 9_000), (10_000, 14_000), (15_000, 17_000)];
        m.segment(seg_e(0, 0, 4_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(1, 5_000, 9_000, 2, [0.95, 0.31, 0.0]));
        m.segment(seg_e(2, 10_000, 14_000, 1, [1.0, 0.0, 0.0]));
        m.segment(seg_e(3, 15_000, 17_000, 2, [0.95, 0.31, 0.0]));
        read(&mut m, 0, 20_000, 900, &[("Lan", lan)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        let names = m.names();
        assert_eq!((names[&1].name.as_str(), names[&1].room_index), ("Lan", None));
        assert_eq!(names.get(&2), None, "tâm giống: cùng một người");
    }

    /// Rà soát lần 2 A-Q2: một người bị tách hai giọng giống nhau; giọng 1 mang tên trước. Giọng 2 vượt giọng 1 (15,5 s so với
    /// 11,6 s, hơn 33% nhưng chỉ hơn 3,9 s) thì giọng 1 vẫn giữ tên, mọi dòng cũ của nó không đổi; chỉ khi giọng 2 hơn ≥ 20% và ≥ 5 s
    /// (19,4 s so với 11,6 s) tên mới chuyển (spec §6.6, chống nhảy tên).
    #[test]
    fn the_name_stays_on_its_voice_until_another_voice_beats_it_by_the_switch_rule() {
        let mut m = NameMatcher::default();
        let a = [1.0, 0.0, 0.0];
        let b = [0.95, 0.31, 0.0];
        let one: &[(i64, i64)] = &[(0, 4_000), (5_000, 9_000), (10_000, 14_000)];
        let two: &[(i64, i64)] = &[(15_000, 19_000), (20_000, 24_000), (25_000, 29_000), (30_000, 34_000), (35_000, 39_000)];
        for (i, &(s, e)) in one.iter().enumerate() {
            m.segment(seg_e(i as u64, s, e, 1, a));
        }
        for (i, &(s, e)) in two.iter().enumerate() {
            m.segment(seg_e(10 + i as u64, s, e, 2, b));
        }
        let lan: Vec<(i64, i64)> = one.iter().chain(two).copied().collect();
        read(&mut m, 0, 16_000, 900, &[("Lan", lan.as_slice())]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!((name_of(&m, 1).as_deref(), name_of(&m, 2)), (Some("Lan"), None), "t = 16 s");
        read(&mut m, 16_000, 36_000, 900, &[("Lan", lan.as_slice())]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!((name_of(&m, 1).as_deref(), name_of(&m, 2)), (Some("Lan"), None), "t = 36 s: giọng 2 chưa thắng theo luật đổi tên");
        read(&mut m, 36_000, 42_000, 900, &[("Lan", lan.as_slice())]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!((name_of(&m, 1), name_of(&m, 2).as_deref()), (None, Some("Lan")), "t = 42 s: giọng 2 hơn ≥ 20% và ≥ 5 s");
    }

    /// QĐ 32 (rà soát lần 2 A-Q1): chuỗi đầy đủ fixture → `SpeakingTracker` (250 ms) → `NameMatcher` trên bản ghi Meet (đoạn = các
    /// khoảng nói thật của giọng đọc máy, trễ của công thức Meet). Chỉ báo chỉ có ở ô của tài khoản đang nói **trong chính cửa sổ của
    /// nó** (cửa sổ 0, khi dùng thật là ô của chính người dùng); ở cửa sổ chủ phòng (cửa sổ 1, chỗ người dùng nghe người ở xa) không có
    /// bằng chứng nào nên không có tên. Ghim hành vi thật, không hạ chuẩn ghép tên cho vừa; Meet tắt mặc định tới khi T21 tìm được
    /// chỉ báo dùng được ở cửa sổ người nghe.
    #[test]
    fn meet_gives_no_name_in_the_listener_window() {
        use crate::names::track::{SpeakingTracker, quiet_at};
        use crate::reader::extract::tests::{meet_recipes, tiles_of};
        use crate::reader::tree::tests::{fixture, truth};
        use speaker_recipe::{MeetingApp, Os};
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        let snaps = fixture("meet-chrome-macos.jsonl");
        let mut talks: Vec<(i64, i64)> = Vec::new();
        let mut open = None;
        for (t, who, on) in truth("meet-chrome-macos.jsonl") {
            let ms = (t * 1000.0) as i64;
            match (on, open) {
                (true, None) if who == "nguoinoi" => open = Some(ms),
                (false, Some(start)) if who == "nguoinoi" => {
                    talks.push((start, ms));
                    open = None;
                }
                _ => {}
            }
        }
        assert!(!talks.is_empty());
        let mut speech = Spans::default();
        for &(s, e) in &talks {
            speech.add(s, e);
        }
        let delay = i64::from(app.delay_ms);
        let run = |listener: bool| {
            let mut m = NameMatcher::default();
            for (i, &(s, e)) in talks.iter().enumerate() {
                m.segment(seg(i as u64, s, e, 1));
            }
            let mut tracker = SpeakingTracker::new(app.speaking.iter().map(|s| s.kind).collect());
            let end = (snaps.last().unwrap().t * 1000.0) as i64;
            let mut t = (snaps[0].t * 1000.0) as i64;
            while t < end {
                let i = snaps.partition_point(|s| (s.t * 1000.0) as i64 <= t) - 1;
                let tiles: Vec<_> =
                    tiles_of(&snaps[i], app).1.into_iter().filter(|x| (x.slot >= 256) == listener).collect();
                let now = tracker.push(t, &tiles, &BTreeMap::new(), quiet_at(&speech, t, delay));
                m.observe(t, 250, delay, &now);
                t += 250;
            }
            m.settle(delay, &speech, &ROOMLESS);
            let evidence: i64 = m.totals().values().flat_map(|t| t.values()).map(|e| e.ms).sum();
            (m.names().len(), evidence)
        };
        let (named, evidence) = run(true);
        eprintln!("meet, cửa sổ người nghe: {named} giọng có tên, bằng chứng {evidence} ms");
        assert_eq!((named, evidence), (0, 0), "cửa sổ người nghe không có chỉ báo");
        let (named, evidence) = run(false);
        eprintln!("meet, cửa sổ của người đang nói: {named} giọng có tên, bằng chứng {evidence} ms");
        assert!(named == 1 && evidence > 0, "chỉ báo chỉ có ở cửa sổ của chính người đang nói");
    }

    /// QĐ 25 (rà soát A-Q6): giọng gộp 2:1 (Lan 3 đoạn khoảng 11,6 s, Minh 2 đoạn khoảng 5,75 s) không nhận tên trội khi chưa tách.
    #[test]
    fn a_merged_voice_with_a_dominant_name_stays_unnamed() {
        let mut m = NameMatcher::default();
        let lan: &[(i64, i64)] = &[(0, 4_000), (10_000, 14_000), (20_000, 24_000)];
        let minh: &[(i64, i64)] = &[(5_000, 8_000), (15_000, 18_000)];
        for (i, &(s, e)) in [lan[0], minh[0], lan[1], minh[1], lan[2]].iter().enumerate() {
            m.segment(seg(i as u64, s, e, 1));
        }
        read(&mut m, 0, 26_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        let t = &m.totals()[&1];
        assert!(t["Lan"].ms > 11_000 && t["Minh"].ms > 5_000, "Lan {}, Minh {}", t["Lan"].ms, t["Minh"].ms);
        assert_eq!(name_of(&m, 1), None);
    }

    /// QĐ 9: với luật hiện nay mỗi giọng có tối đa một tên ứng viên; khi đó "tên về giọng có nhiều thời gian trùng nhất" cho đúng
    /// tổng của ghép cặp tối ưu (như Hungarian). Kiểm trên 300 ma trận giả ngẫu nhiên tất định, tới 8 giọng, 5 tên.
    #[test]
    fn grouping_by_name_is_an_optimal_matching() {
        let mut seed = 7u64;
        let mut next = |m: u64| {
            seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
            (seed >> 33) % m
        };
        for _ in 0..300 {
            let (n, k) = (1 + next(8) as usize, 1 + next(5) as usize);
            let mut w = vec![vec![0i64; k]; n];
            for row in &mut w {
                if next(4) > 0 {
                    row[next(k as u64) as usize] = 1 + next(20_000) as i64;
                }
            }
            let mut by_name = vec![0i64; k];
            for row in &w {
                for (j, &x) in row.iter().enumerate() {
                    by_name[j] = by_name[j].max(x);
                }
            }
            assert_eq!(by_name.iter().sum::<i64>(), best_matching(&w), "{w:?}");
        }
    }

    #[test]
    fn voice_names_never_print_names() {
        let n = VoiceName {
            name: "Lan Nguyễn".into(),
            room_index: Some(1),
            source: NameSource::Indicator,
        };
        assert!(!format!("{n:?}").contains("Lan"));
    }

    #[test]
    fn the_user_and_room_voices_never_get_a_name() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 1));
        let mut t = 0;
        while t < 16_000 {
            let mut me = person("Hoa Phạm", LAN.iter().any(|&(s, e)| s + 900 <= t && t < e + 900));
            me.is_self = true;
            m.observe(t, 250, 900, &[me]);
            t += 250;
        }
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1), None, "chính người dùng");
        assert_eq!(m.participants(), ["Hoa Phạm"], "vẫn có trong danh sách chọn tên");
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 1));
        read(&mut m, 0, 16_000, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &BTreeSet::from([1]));
        assert_eq!(name_of(&m, 1), None, "giọng trong phòng (spec §5.5)");
    }

    /// Spec §6.6: đổi tên đã gán chỉ khi tên mới hơn ≥ 20% và ≥ 5 s; QĐ 9: tên cũ dưới 50% thì bỏ tên trong lúc chờ.
    /// Lan ngắn (dưới `split_min_ms` nên không phải dấu hiệu gộp, QĐ 25), rồi Minh nói nhiều trên cùng giọng.
    #[test]
    fn a_new_name_needs_twenty_percent_and_five_seconds_more() {
        let mut m = NameMatcher::default();
        let lan: &[(i64, i64)] = &[(0, 2_000), (3_000, 5_000)];
        let minh: &[(i64, i64)] = &[(10_000, 14_000), (15_000, 19_000), (20_000, 24_000)];
        for (i, &(s, e)) in lan.iter().chain(minh).enumerate() {
            m.segment(seg(i as u64, s, e, 1));
        }
        read(&mut m, 0, 7_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1).as_deref(), Some("Lan"));
        read(&mut m, 7_000, 21_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        // Lan 3,75 s, Minh 7,75 s: Minh 67% nhưng chỉ hơn 4 s; Lan 33% < 50%: bỏ tên, chưa đổi.
        assert_eq!(name_of(&m, 1), None);
        read(&mut m, 21_000, 26_000, 900, &[("Lan", lan), ("Minh", minh)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1).as_deref(), Some("Minh"), "Minh 11,6 s, hơn 7,9 s và gấp ba");
    }

    /// Tín hiệu 3 (spec §6.4): chỉ khi đúng một người ở xa mở mic, chỉ phần máy có tiếng, chỉ khi lượt đọc nhận ra đúng một ô của
    /// chính người dùng (QĐ 24), và tên phải có ≥ [`MIN_INDICATOR_MS`] bằng chứng chỉ báo trên giọng đó (người không có ô không mượn
    /// được tên của người duy nhất đang mở mic, rà soát A-Q5).
    #[test]
    fn the_mic_signal_needs_one_open_mic_machine_speech_the_user_tile_and_some_indicator() {
        let mut speech = Spans::default();
        speech.add(0, 4_000);
        speech.add(10_000, 14_000);
        // `open`: ai mở mic; `me`: có ô của chính người dùng; `frame`: Lan có khung "đang nói" ở 1,5 s đầu.
        let run = |open: &[&str], me: bool, frame: bool| {
            let mut m = NameMatcher::default();
            m.segment(seg(0, 0, 4_000, 1));
            m.segment(seg(1, 10_000, 14_000, 1));
            let mut t = 0;
            while t < 16_000 {
                let mut now: Vec<ParticipantNow> = ["Lan", "Minh"]
                    .iter()
                    .map(|n| {
                        let talking = frame && *n == "Lan" && (900..2_400).contains(&t);
                        ParticipantNow { muted: Some(!open.contains(n)), ..person(n, talking) }
                    })
                    .collect();
                if me {
                    now.push(ParticipantNow { is_self: true, muted: Some(true), ..person("Hoa Phạm", false) });
                }
                m.observe(t, 250, 900, &now);
                t += 250;
            }
            m.settle(900, &speech, &ROOMLESS);
            m.names().get(&1).map(|n| (n.name.clone(), n.source))
        };
        assert_eq!(run(&["Lan"], true, true), Some(("Lan".into(), NameSource::Mic)));
        assert_eq!(run(&["Lan", "Minh"], true, true), None, "hai người mở mic");
        assert_eq!(run(&["Lan"], false, true), None, "chưa nhận ra ô của người dùng: không dùng mic");
        assert_eq!(run(&["Lan"], true, false), None, "chỉ có mic, không lần nào có khung: có thể là người không có ô");
    }

    #[test]
    fn worker_merges_and_relabels_move_the_evidence() {
        let mut m = NameMatcher::default();
        m.segment(seg(0, 0, 4_000, 1));
        m.segment(seg(1, 10_000, 14_000, 2));
        read(&mut m, 0, 16_000, 900, &[("Lan", LAN)]);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!((name_of(&m, 1), name_of(&m, 2)), (None, None), "mỗi giọng một đoạn");
        m.merged(2, 1);
        m.settle(900, &Spans::default(), &ROOMLESS);
        assert_eq!(name_of(&m, 1).as_deref(), Some("Lan"));
        m.relabel(1, 3);
        m.settle(900, &Spans::default(), &ROOMLESS);
        // Giọng 1 giữ tên (Lan vẫn 100% thời gian trùng của nó, QĐ 9); giọng 3 mới có một đoạn: chưa đủ.
        assert_eq!((name_of(&m, 1).as_deref(), name_of(&m, 3)), (Some("Lan"), None));
    }

    #[test]
    fn the_same_timeline_gives_the_same_names() {
        let run = || {
            let mut m = NameMatcher::default();
            m.segment(seg(0, 0, 4_000, 1));
            m.segment(seg(1, 10_000, 14_000, 1));
            read(&mut m, 0, 16_000, 900, &[("Lan", LAN), ("Minh", &[(4_000, 6_000)])]);
            m.settle(900, &Spans::default(), &ROOMLESS);
            m.names()
        };
        assert_eq!(run(), run());
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::matcher 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`NameMatcher`, `SegRec` chưa có).

- [ ] **Step 3: Viết mã**

`crates/speaker-worker/src/names/matcher.rs`, trước mod `tests`:

```rust
//! Ghép tên vào giọng (spec §6.6): cộng dồn thời gian trùng giữa các đoạn của mỗi giọng và khoảng "đang nói" của từng người tham
//! dự (đã dời theo độ trễ của app), gán tên khi đủ cả ba điều kiện, chống nhảy tên, đánh số khi một tên khớp nhiều giọng. Bằng
//! chứng của một đoạn tính khi dấu "đang nói" của khoảng thời gian đó đã tới (QĐ 9 của kế hoạch 04). Mỗi tên một giọng (ghép cặp
//! tối ưu, QĐ 9); giọng có dấu hiệu gộp không nhận tên (QĐ 25); tín hiệu mic cần ô của chính người dùng và bằng chứng chỉ báo (QĐ 24).
//! Không gán chính người dùng, không gán giọng trong phòng (§5.5). Thuần, tất định; tên không vào log.

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fmt;

use speaker_protocol::{NameSource, SpeakerConfig};

use super::{ParticipantNow, Spans, Via};
use crate::embed::cosine;

/// Gán khi một tên chiếm ≥ 60% thời gian trùng của giọng, có ≥ 3 s, từ ≥ 2 đoạn (spec §6.6).
pub const NAME_SHARE: f64 = 0.60;
pub const NAME_MIN_MS: i64 = 3_000;
pub const NAME_MIN_SEGMENTS: u32 = 2;
/// Bỏ tên đang gán khi nó xuống dưới 50% (QĐ 9, ngoài spec).
pub const NAME_DROP_SHARE: f64 = 0.50;
/// Đổi tên khi tên mới hơn tên cũ ≥ 20% và ≥ 5 s (spec §6.6).
pub const SWITCH_RATIO: f64 = 1.20;
pub const SWITCH_MIN_MS: i64 = 5_000;
/// Đoạn được tính bằng chứng khi lượt đọc mới nhất (đã trừ trễ) qua cuối đoạn chừng này.
pub const SETTLE_MARGIN_MS: i64 = 500;
/// Giữ khoảng "đang nói" chừng này.
pub const KEEP_SPEAKING_MS: i64 = 180_000;
/// Giữ bản ghi của chừng này đoạn gần nhất (tách giọng, đổi nhãn); tổng bằng chứng giữ cả phiên.
pub const KEEP_SEGMENTS: usize = 512;
/// Đoạn "mang tên" một người khi tên đó phủ ≥ 70% đoạn và không tên nào khác phủ ≥ 30% (tách giọng, §5.3).
pub const ATTRIBUTE_SHARE: f64 = 0.70;
pub const ATTRIBUTE_OTHER: f64 = 0.30;
pub const MAX_PARTICIPANTS: usize = 64;
/// Giọng "đang nói gần đây" (nhịp đọc nhanh, QĐ 13).
pub const RECENT_VOICE_MS: i64 = 60_000;
/// Tên phải có ít nhất chừng này bằng chứng từ chỉ báo (công thức hay tự học) trên giọng, không chỉ từ tín hiệu mic (QĐ 24).
pub const MIN_INDICATOR_MS: i64 = 1_000;

/// Ngưỡng lấy từ `SpeakerConfig` (đổi được qua `speaker_config` của manifest): dấu hiệu gộp (QĐ 25) và "tâm khác nhau" của máy
/// chung phòng (QĐ 9).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SplitRule {
    pub share: f64,
    pub min_ms: i64,
    pub max_cosine: f32,
}

impl SplitRule {
    pub fn from_config(c: &SpeakerConfig) -> Self {
        Self {
            share: f64::from(c.split_share),
            min_ms: c.split_min_ms as i64,
            max_cosine: c.split_max_cosine,
        }
    }
}

impl Default for SplitRule {
    fn default() -> Self {
        Self::from_config(&SpeakerConfig::default())
    }
}

/// Một đoạn đã có giọng.
#[derive(Clone)]
pub struct SegRec {
    pub id: u64,
    pub start_ms: i64,
    pub end_ms: i64,
    pub voice: Option<u32>,
    /// Đoạn từ micro: không bao giờ là bằng chứng cho tên (người trong phòng không có trên cửa sổ họp, spec §5.5).
    pub mic: bool,
    /// Nhúng của đoạn (tách giọng, §5.3); chỉ khi đọc tên bật, xóa cùng phiên (§5.6).
    pub embedding: Option<Vec<f32>>,
    /// Đoạn đã vào tâm của giọng (`Assignment::updated`).
    pub contributed: bool,
    settled: bool,
    evidence: Vec<(String, [i64; 3])>,
    /// Tên mà đoạn mang riêng (xem [`ATTRIBUTE_SHARE`]).
    pub attributed: Option<String>,
}

impl SegRec {
    pub fn new(
        id: u64,
        start_ms: i64,
        end_ms: i64,
        voice: Option<u32>,
        mic: bool,
        embedding: Option<Vec<f32>>,
        contributed: bool,
    ) -> Self {
        Self {
            id,
            start_ms,
            end_ms,
            voice,
            mic,
            embedding,
            contributed,
            settled: false,
            evidence: Vec::new(),
            attributed: None,
        }
    }

    pub fn dur(&self) -> i64 {
        (self.end_ms - self.start_ms).max(0)
    }
}

/// Bằng chứng của một tên cho một giọng: ms trùng, số đoạn, ms theo tín hiệu (chỉ báo, mic, tự học).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Evidence {
    pub ms: i64,
    pub segs: u32,
    pub by: [i64; 3],
}

impl Evidence {
    fn apply(&mut self, by: [i64; 3], sign: i64) {
        for (a, b) in self.by.iter_mut().zip(by) {
            *a += sign * b;
        }
        self.ms += sign * by.iter().sum::<i64>();
        self.segs = if sign > 0 { self.segs + 1 } else { self.segs.saturating_sub(1) };
    }

    pub fn source(&self) -> NameSource {
        let [ind, mic, learned] = self.by;
        if mic > ind && mic >= learned {
            NameSource::Mic
        } else if learned > ind {
            NameSource::Learned
        } else {
            NameSource::Indicator
        }
    }
}

fn slot(via: Via) -> usize {
    match via {
        Via::Mic => 1,
        Via::Learned => 2,
        Via::None | Via::Indicator => 0,
    }
}

/// Tên của một giọng như worker gửi trong `Voices`.
#[derive(Clone, PartialEq)]
pub struct VoiceName {
    pub name: String,
    pub room_index: Option<u32>,
    pub source: NameSource,
}

// Debug viết tay: tên không vào log (rà soát A-NHỎ 5).
impl fmt::Debug for VoiceName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "VoiceName(<{} ký tự>, số {:?}, {:?})", self.name.chars().count(), self.room_index, self.source)
    }
}

/// Tâm (tổng nhúng đã chuẩn hóa nhân thời lượng) của các đoạn; `None` khi ít hơn `min` nhúng dùng được. Dùng chung với `split`.
pub(crate) fn centroid_of<'a>(recs: impl IntoIterator<Item = &'a SegRec>, min: usize) -> Option<Vec<f32>> {
    let mut sum: Option<Vec<f32>> = None;
    let mut n = 0;
    for s in recs {
        let Some(e) = &s.embedding else { continue };
        let norm = e.iter().map(|x| x * x).sum::<f32>().sqrt();
        if !(norm.is_finite() && norm > 0.0) {
            continue;
        }
        let acc = sum.get_or_insert_with(|| vec![0.0; e.len()]);
        if acc.len() != e.len() {
            continue;
        }
        let w = s.dur() as f32 / norm;
        for (a, x) in acc.iter_mut().zip(e) {
            *a += x * w;
        }
        n += 1;
    }
    if n >= min { sum } else { None }
}

/// Tổng thời gian trùng lớn nhất khi mỗi tên về tối đa một giọng (ghép cặp tối ưu như Hungarian), bằng duyệt có cắt tỉa cho n ≤ 8:
/// `w[v][k]` là thời gian trùng của giọng `v` với tên `k` (0: không phải ứng viên). Chỉ test dùng, để kiểm cách nhóm theo tên của
/// [`NameMatcher`] vẫn tối ưu khi luật đổi.
#[cfg(test)]
pub(crate) fn best_matching(w: &[Vec<i64>]) -> i64 {
    fn go(w: &[Vec<i64>], v: usize, used: &mut [bool], sum: i64, best: &mut i64) {
        if v == w.len() {
            *best = (*best).max(sum);
            return;
        }
        let rest: i64 = w[v..].iter().map(|r| r.iter().copied().max().unwrap_or(0).max(0)).sum();
        if sum + rest <= *best {
            return;
        }
        go(w, v + 1, used, sum, best);
        for (k, &x) in w[v].iter().enumerate() {
            if x > 0 && !used[k] {
                used[k] = true;
                go(w, v + 1, used, sum + x, best);
                used[k] = false;
            }
        }
    }
    let mut best = 0;
    go(w, 0, &mut vec![false; w.first().map_or(0, Vec::len)], 0, &mut best);
    best
}

#[derive(Default)]
pub struct NameMatcher {
    spans: BTreeMap<(String, Via), Spans>,
    participants: Vec<(String, bool)>,
    segs: VecDeque<SegRec>,
    totals: BTreeMap<u32, BTreeMap<String, Evidence>>,
    names: BTreeMap<u32, String>,
    /// Tên vừa bỏ (QĐ 9): tên mới phải thắng tên này theo luật đổi tên mới được gán.
    held: BTreeMap<u32, String>,
    last_obs_ms: Option<i64>,
    rule: SplitRule,
}

impl NameMatcher {
    /// Ngưỡng từ `SpeakerConfig` của `Load` (mặc định: `SpeakerConfig::default()`).
    pub fn set_rule(&mut self, rule: SplitRule) {
        self.rule = rule;
    }

    /// Tắt "Lấy tên": bỏ mọi tên, bằng chứng, người tham dự; bản ghi đoạn giữ lại nhưng không còn bằng chứng.
    pub fn clear_names(&mut self) {
        self.spans.clear();
        self.participants.clear();
        self.totals.clear();
        self.names.clear();
        self.held.clear();
        self.last_obs_ms = None;
        for s in &mut self.segs {
            s.settled = true;
            s.evidence.clear();
            s.attributed = None;
        }
    }

    pub fn is_self(&self, name: &str) -> bool {
        self.participants.iter().any(|(n, me)| n == name && *me)
    }

    pub fn last_obs_ms(&self) -> Option<i64> {
        self.last_obs_ms
    }

    /// Một lượt đọc lúc `at_ms` (giờ phiên), cách lượt trước `period_ms`; `delay_ms`: chỉ báo của app trễ chừng này so với lúc nói.
    pub fn observe(&mut self, at_ms: i64, period_ms: i64, delay_ms: i64, now: &[ParticipantNow]) {
        for p in now {
            match self.participants.iter().position(|(n, _)| *n == p.name) {
                Some(i) => self.participants[i].1 |= p.is_self,
                None if self.participants.len() < MAX_PARTICIPANTS => self.participants.push((p.name.clone(), p.is_self)),
                None => {}
            }
        }
        let half = period_ms.clamp(2, 1_000) / 2;
        let (start, end) = (at_ms - delay_ms - half, at_ms - delay_ms + half);
        let speaking: Vec<(String, Via)> = now
            .iter()
            .filter(|p| !p.is_self && p.speaking > 0.5 && p.via != Via::None)
            .map(|p| (p.name.clone(), p.via))
            .collect();
        if speaking.is_empty() {
            // Tín hiệu 3 (spec §6.4): chỉ khi đúng một người ở xa đang mở mic, và lượt đọc nhận ra đúng một ô của chính người dùng
            // (QĐ 24: không thì ô của người dùng có thể là "người ở xa duy nhất mở mic"); phần máy có tiếng tính lúc lập bằng chứng.
            let me = now.iter().filter(|p| p.is_self).count();
            let open: Vec<&ParticipantNow> = now.iter().filter(|p| !p.is_self && p.muted == Some(false)).collect();
            if me == 1
                && let [only] = open[..]
            {
                self.spans.entry((only.name.clone(), Via::Mic)).or_default().add(start, end);
            }
        } else {
            for (name, via) in speaking {
                self.spans.entry((name, via)).or_default().add(start, end);
            }
        }
        self.last_obs_ms = Some(self.last_obs_ms.map_or(at_ms, |l| l.max(at_ms)));
        for s in self.spans.values_mut() {
            s.prune(at_ms - KEEP_SPEAKING_MS);
        }
    }

    /// Đoạn vừa có giọng (`Assign`).
    pub fn segment(&mut self, rec: SegRec) {
        self.segs.push_back(rec);
        while self.segs.len() > KEEP_SEGMENTS {
            self.segs.pop_front();
        }
    }

    /// Giọng của đoạn `id` đổi (tách giọng): bằng chứng của nó sang giọng mới.
    pub fn relabel(&mut self, id: u64, voice: u32) {
        let Some(i) = self.segs.iter().position(|s| s.id == id) else { return };
        let old = self.segs[i].voice.replace(voice);
        if self.segs[i].settled {
            let ev = self.segs[i].evidence.clone();
            if let Some(old) = old {
                self.apply(old, &ev, -1);
            }
            self.apply(voice, &ev, 1);
        }
    }

    /// Worker gộp giọng `from` vào `into`.
    pub fn merged(&mut self, from: u32, into: u32) {
        for s in self.segs.iter_mut().filter(|s| s.voice == Some(from)) {
            s.voice = Some(into);
        }
        if let Some(moved) = self.totals.remove(&from) {
            let dst = self.totals.entry(into).or_default();
            for (name, e) in moved {
                let d = dst.entry(name).or_default();
                d.ms += e.ms;
                d.segs += e.segs;
                for (a, b) in d.by.iter_mut().zip(e.by) {
                    *a += b;
                }
            }
        }
        self.names.remove(&from);
        self.held.remove(&from);
    }

    fn apply(&mut self, voice: u32, ev: &[(String, [i64; 3])], sign: i64) {
        let t = self.totals.entry(voice).or_default();
        for (name, by) in ev {
            t.entry(name.clone()).or_default().apply(*by, sign);
        }
    }

    fn overlaps(&self, start: i64, end: i64, speech: &Spans) -> Vec<(String, [i64; 3])> {
        let mut by: BTreeMap<String, [i64; 3]> = BTreeMap::new();
        for ((name, via), spans) in &self.spans {
            let ms = if *via == Via::Mic { spans.intersect(speech, start, end) } else { spans.overlap(start, end) };
            if ms > 0 {
                by.entry(name.clone()).or_default()[slot(*via)] += ms;
            }
        }
        by.into_iter().collect()
    }

    /// Lập bằng chứng cho các đoạn mà dấu "đang nói" của khoảng thời gian đó đã tới, rồi gán lại tên. `delay_ms`: trễ của app;
    /// `speech`: tiếng nói của máy (tín hiệu mic); `room`: giọng trong phòng. Trả `true` khi tên của giọng nào đó đổi.
    pub fn settle(&mut self, delay_ms: i64, speech: &Spans, room: &BTreeSet<u32>) -> bool {
        if let Some(last) = self.last_obs_ms {
            let ready: Vec<usize> = self
                .segs
                .iter()
                .enumerate()
                .filter(|(_, s)| !s.settled && s.voice.is_some() && last - delay_ms >= s.end_ms + SETTLE_MARGIN_MS)
                .map(|(i, _)| i)
                .collect();
            for i in ready {
                let (start, end, mic, voice) = {
                    let s = &self.segs[i];
                    (s.start_ms, s.end_ms, s.mic, s.voice)
                };
                let ev = if mic { Vec::new() } else { self.overlaps(start, end, speech) };
                let dur = (end - start).max(1) as f64;
                let total = |by: &[i64; 3]| by.iter().sum::<i64>() as f64;
                let attributed = ev
                    .iter()
                    .find(|(_, by)| total(by) >= ATTRIBUTE_SHARE * dur)
                    .filter(|(n, _)| ev.iter().all(|(m, by)| m == n || total(by) < ATTRIBUTE_OTHER * dur))
                    .map(|(n, _)| n.clone());
                if let Some(v) = voice {
                    self.apply(v, &ev, 1);
                }
                let s = &mut self.segs[i];
                s.settled = true;
                s.evidence = ev;
                s.attributed = attributed;
            }
        }
        self.reassign(room)
    }

    fn reassign(&mut self, room: &BTreeSet<u32>) -> bool {
        let before = self.names.clone();
        let mut wanted: BTreeMap<u32, String> = BTreeMap::new();
        let voices: Vec<u32> = self.totals.keys().copied().collect();
        for &v in &voices {
            if room.contains(&v) {
                continue;
            }
            let t = &self.totals[&v];
            let total: i64 = t.values().map(|e| e.ms.max(0)).sum();
            let best = t
                .iter()
                .filter(|(n, _)| !self.is_self(n))
                .max_by(|a, b| a.1.ms.cmp(&b.1.ms).then(b.0.cmp(a.0)))
                .map(|(n, e)| (n.clone(), *e));
            let ms_of = |name: &str| t.get(name).map_or(0, |e| e.ms);
            let qualifies = |e: &Evidence| {
                e.ms >= NAME_MIN_MS
                    && e.segs >= NAME_MIN_SEGMENTS
                    && total > 0
                    && e.ms as f64 >= NAME_SHARE * total as f64
                    && e.by[0] + e.by[2] >= MIN_INDICATOR_MS
            };
            let beats = |n: &str, e: &Evidence, old: &str| {
                n == old || (e.ms as f64 >= SWITCH_RATIO * ms_of(old) as f64 && e.ms - ms_of(old) >= SWITCH_MIN_MS)
            };
            // QĐ 25: một tên khác (không phải người dùng) chiếm phần đáng kể của giọng: dấu hiệu gộp, không nhận tên trội.
            let merged = |winner: &str| {
                t.iter().any(|(n, e)| {
                    n != winner
                        && !self.is_self(n)
                        && e.ms >= self.rule.min_ms
                        && e.ms as f64 >= self.rule.share * total as f64
                        && e.segs >= NAME_MIN_SEGMENTS
                })
            };
            let current = self.names.get(&v).cloned();
            let anchor = current.clone().or_else(|| self.held.get(&v).cloned());
            let next = match best {
                Some((n, e)) if qualifies(&e) && anchor.as_deref().is_none_or(|old| beats(&n, &e, old)) => Some(n),
                _ => current.filter(|old| total > 0 && ms_of(old) as f64 >= NAME_DROP_SHARE * total as f64),
            };
            if let Some(n) = next.filter(|n| !merged(n)) {
                wanted.insert(v, n);
            }
        }
        let chosen = self.one_voice_per_name(&wanted);
        for v in voices {
            match chosen.get(&v) {
                Some(n) => {
                    self.held.remove(&v);
                    self.names.insert(v, n.clone());
                }
                None => {
                    if let Some(old) = self.names.remove(&v) {
                        self.held.insert(v, old);
                    }
                }
            }
        }
        self.names != before
    }

    /// Mỗi tên một giọng (spec §6.6, QĐ 9). Mỗi giọng có tối đa một tên ứng viên nên ghép cặp tối ưu là: tên về giọng có nhiều thời
    /// gian trùng với tên đó nhất (bằng nhau: mã nhỏ hơn; test `grouping_by_name_is_an_optimal_matching`), trừ khi một giọng đang mang
    /// tên đó và giọng kia chưa hơn nó theo luật đổi tên (≥ 20% và ≥ 5 s). Giọng thua giữ tên kèm số (máy chung phòng) chỉ khi tâm
    /// nhúng của nó khác tâm của mọi giọng khác cùng tên (`cosine ≤ split_max_cosine`).
    fn one_voice_per_name(&self, wanted: &BTreeMap<u32, String>) -> BTreeMap<u32, String> {
        let mut by_name: BTreeMap<&str, Vec<u32>> = BTreeMap::new();
        for (v, n) in wanted {
            by_name.entry(n.as_str()).or_default().push(*v);
        }
        let mut out = BTreeMap::new();
        for (name, voices) in by_name {
            let ms = |v: u32| self.totals.get(&v).and_then(|t| t.get(name)).map_or(0, |e| e.ms);
            let most = |list: Vec<u32>| list.into_iter().max_by(|a, b| ms(*a).cmp(&ms(*b)).then(b.cmp(a)));
            let Some(best) = most(voices.clone()) else { continue };
            // Chống nhảy tên giữa các giọng (spec §6.6; rà soát lần 2 A-Q2): giọng đang mang tên giữ tên trừ khi giọng khác hơn nó
            // ≥ 20% và ≥ 5 s thời gian trùng với tên đó.
            let holder = most(voices.iter().copied().filter(|v| self.names.get(v).map(String::as_str) == Some(name)).collect());
            let winner = match holder {
                Some(h)
                    if h != best
                        && !(ms(best) as f64 >= SWITCH_RATIO * ms(h) as f64 && ms(best) - ms(h) >= SWITCH_MIN_MS) =>
                {
                    h
                }
                _ => best,
            };
            out.insert(winner, name.to_string());
            if voices.len() < 2 {
                continue;
            }
            let centroids: BTreeMap<u32, Option<Vec<f32>>> = voices
                .iter()
                .map(|&v| (v, centroid_of(self.segs.iter().filter(|s| s.voice == Some(v)), 1)))
                .collect();
            for &v in voices.iter().filter(|&&v| v != winner) {
                let distinct = centroids[&v].as_ref().is_some_and(|c| {
                    voices
                        .iter()
                        .filter(|&&o| o != v)
                        .all(|o| centroids[o].as_ref().is_some_and(|d| cosine(c, d) <= self.rule.max_cosine))
                });
                if distinct {
                    out.insert(v, name.to_string());
                }
            }
        }
        out
    }

    /// Tên đang gán, theo giọng (thứ tự mã giọng = thứ tự xuất hiện), kèm số khi một tên ở nhiều giọng (máy chung phòng).
    pub fn names(&self) -> BTreeMap<u32, VoiceName> {
        let mut count: BTreeMap<&str, u32> = BTreeMap::new();
        for n in self.names.values() {
            *count.entry(n.as_str()).or_default() += 1;
        }
        let mut index: BTreeMap<&str, u32> = BTreeMap::new();
        self.names
            .iter()
            .map(|(&v, n)| {
                let room_index = (count[n.as_str()] > 1).then(|| {
                    let k = index.entry(n.as_str()).or_default();
                    *k += 1;
                    *k
                });
                let source = self.totals.get(&v).and_then(|t| t.get(n)).map_or(NameSource::Indicator, Evidence::source);
                (v, VoiceName { name: n.clone(), room_index, source })
            })
            .collect()
    }

    /// Người tham dự đã thấy trong phiên (kể cả chính người dùng, QĐ 18), theo thứ tự thấy.
    pub fn participants(&self) -> Vec<String> {
        self.participants.iter().map(|(n, _)| n.clone()).collect()
    }

    /// Có giọng (không phải trong phòng) nói trong 60 s gần nhất mà chưa có tên (nhịp đọc nhanh, QĐ 13).
    pub fn needs_names(&self, now_ms: i64, room: &BTreeSet<u32>) -> bool {
        self.segs
            .iter()
            .rev()
            .take_while(|s| s.end_ms >= now_ms - RECENT_VOICE_MS)
            .filter_map(|s| s.voice)
            .any(|v| !room.contains(&v) && !self.names.contains_key(&v))
    }

    pub fn records(&self) -> impl Iterator<Item = &SegRec> {
        self.segs.iter()
    }

    pub fn totals(&self) -> &BTreeMap<u32, BTreeMap<String, Evidence>> {
        &self.totals
    }

    pub fn named_voices(&self) -> usize {
        self.names.len()
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::matcher 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 15 passed`. Dòng `--nocapture` của `meet_gives_no_name_in_the_listener_window` (chạy lại với `-- names::matcher::tests::meet --nocapture`): cửa sổ người nghe 0 giọng có tên, 0 ms; cửa sổ người nói 1 giọng có tên (người rà đo 14 813 ms): ghi vào ghi chú làm việc. Cửa sổ người nghe mà có tên hay bằng chứng thì dừng, báo (bản ghi khác với kết luận của kế hoạch 01).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch. Không commit.

---
### Task 8: Tách giọng bị gộp theo tên (spec §5.3)

**Files:**
- Modify: `crates/speaker-worker/src/cluster.rs` (`Assignment` dòng 10–19, `assign` dòng 74–133, thêm `split`)
- Create: `crates/speaker-worker/src/names/split.rs`
- Modify: `crates/speaker-worker/src/names/mod.rs` (thêm `pub mod split;`)

- [ ] **Step 1: Viết test đỏ**

`crates/speaker-worker/src/cluster.rs`, cuối mod `tests`:

```rust
    /// Kế hoạch 04 (spec §5.3): tách các đoạn D khỏi giọng 1 (A và D, cosine 0,8, cùng vào giọng 1 ở θ 0,35): đoạn D mới vào giọng
    /// mới, đoạn A ở lại giọng 1.
    #[test]
    fn split_moves_members_out_of_the_old_centroid_into_a_new_voice() {
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        for e in [&A, &D, &A, &D] {
            let r = c.assign(2_000, Some(e));
            assert_eq!((r.voice, r.updated), (Some(1), true));
        }
        assert_eq!(c.split(1, &[(2_000, &D, true), (2_000, &D, true)]), Some(2));
        assert_eq!(c.voice_ids(), [1, 2]);
        assert_eq!(c.assign(2_000, Some(&D)).voice, Some(2));
        assert_eq!(c.assign(2_000, Some(&A)).voice, Some(1));
    }

    #[test]
    fn split_respects_the_voice_limit_and_needs_usable_embeddings() {
        let cfg = SpeakerConfig {
            max_voices: 1,
            ..SpeakerConfig::default()
        };
        let mut c = OnlineClusterer::new(cfg);
        c.assign(2_000, Some(&A));
        assert_eq!(c.split(1, &[(2_000, &D, true)]), None, "đã đủ giọng");
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        c.assign(2_000, Some(&A));
        assert_eq!(c.split(1, &[(2_000, &[f32::NAN, 0.0, 0.0], true)]), None, "không nhúng nào dùng được");
        assert_eq!(c.split(9, &[(2_000, &D, true)]), None, "giọng không có");
        assert_eq!(c.voice_count(), 1);
    }

    #[test]
    fn only_segments_that_reach_the_centroid_say_so() {
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        assert!(c.assign(2_000, Some(&A)).updated, "mở giọng");
        assert!(!c.assign(800, Some(&A)).updated, "dưới min_update_ms");
        assert!(!c.assign(300, None).updated, "không nhúng");
    }
```

`names/mod.rs`: thêm `pub mod split;` sau `pub mod matcher;`.

`crates/speaker-worker/src/names/split.rs` (phần test):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::names::Spans;
    use crate::names::matcher::tests::read;
    use crate::names::matcher::SegRec;

    const A: [f32; 3] = [1.0, 0.0, 0.0];
    /// Cosine 0,8 với A: hai người giống giọng (như cặp 0,60–0,70 của `results/nhan-giong-tieng-viet.md`, ở đây đơn giản hóa).
    const D: [f32; 3] = [0.8, 0.6, 0.0];
    const LAN: &[(i64, i64)] = &[(0, 4_000), (10_000, 14_000), (20_000, 24_000)];
    const MINH: &[(i64, i64)] = &[(5_000, 9_000), (15_000, 19_000), (25_000, 29_000)];

    fn split_on() -> SpeakerConfig {
        SpeakerConfig {
            split: true,
            ..SpeakerConfig::default()
        }
    }

    /// Giọng 1 nhận cả Lan (nhúng `lan`) và Minh (nhúng `minh`) xen kẽ; chỉ báo trễ 900 ms.
    fn merged(lan: [f32; 3], minh: [f32; 3], minh_turns: &[(i64, i64)]) -> NameMatcher {
        let mut m = NameMatcher::default();
        let mut turns: Vec<(i64, i64, [f32; 3])> = LAN.iter().map(|&(s, e)| (s, e, lan)).collect();
        turns.extend(minh_turns.iter().map(|&(s, e)| (s, e, minh)));
        turns.sort_by_key(|t| t.0);
        for (id, (s, e, emb)) in turns.into_iter().enumerate() {
            m.segment(SegRec::new(id as u64, s, e, Some(1), false, Some(emb.to_vec()), true));
        }
        read(&mut m, 0, 31_000, 900, &[("Lan", LAN), ("Minh", minh_turns)]);
        m.settle(900, &Spans::default(), &BTreeSet::new());
        m
    }

    #[test]
    fn two_alternating_names_with_different_voices_split_the_voice() {
        let m = merged(A, D, MINH);
        assert_eq!(m.names().get(&1), None, "giọng gộp không có tên (mỗi tên 50%)");
        let plan = find_split(&m, &split_on(), &BTreeSet::new(), &BTreeSet::new()).unwrap();
        assert_eq!(plan, SplitPlan { voice: 1, name: "Minh".into(), segments: vec![1, 3, 5] });
    }

    #[test]
    fn one_person_seen_under_two_names_is_not_split() {
        let m = merged(A, A, MINH);
        assert_eq!(find_split(&m, &split_on(), &BTreeSet::new(), &BTreeSet::new()), None, "hai tâm giống hệt");
    }

    #[test]
    fn a_one_sided_overlap_is_not_split() {
        let m = merged(A, D, &MINH[..1]);
        assert_eq!(find_split(&m, &split_on(), &BTreeSet::new(), &BTreeSet::new()), None, "Minh chỉ một đoạn");
    }

    #[test]
    fn split_plans_never_print_names() {
        let plan = SplitPlan { voice: 1, name: "Minh Trần".into(), segments: vec![1, 3] };
        assert!(!format!("{plan:?}").contains("Minh"));
    }

    #[test]
    fn room_voices_cooling_voices_and_the_default_config_never_split() {
        let m = merged(A, D, MINH);
        let one = BTreeSet::from([1]);
        assert_eq!(find_split(&m, &split_on(), &one, &BTreeSet::new()), None, "giọng trong phòng");
        assert_eq!(find_split(&m, &split_on(), &BTreeSet::new(), &one), None, "vừa tách trong 60 s");
        assert_eq!(find_split(&m, &SpeakerConfig::default(), &BTreeSet::new(), &BTreeSet::new()), None, "mặc định tắt");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- cluster:: names::split 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`updated`, `split`, `find_split`, `SplitPlan` chưa có).

- [ ] **Step 3: Viết mã**

`cluster.rs`, struct `Assignment`: thêm trường cuối:

```rust
    /// Đoạn đã vào tâm của giọng được chọn (mở giọng, hay vào giọng với thời lượng ≥ `min_update_ms`): tách giọng (kế hoạch 04)
    /// trừ đúng các đoạn này khỏi tâm cũ.
    pub updated: bool,
```

Trong `assign`: nhánh trả sớm (dòng 80–84) thêm `updated: false,`. Thay khối `let (voice, confidence) = match best { … };` (dòng 97–120) bằng:

```rust
        let (voice, confidence, updated) = match best {
            Some((i, sim)) if sim >= self.cfg.theta => {
                let updated = speech_ms >= self.cfg.min_update_ms;
                if updated {
                    let v = &mut self.voices[i];
                    for (s, x) in v.sum.iter_mut().zip(&e) {
                        *s += x * speech_ms as f32;
                    }
                    v.speech_ms = v.speech_ms.saturating_add(speech_ms);
                }
                (Some(self.voices[i].id), sim, updated)
            }
            _ if speech_ms >= self.cfg.min_new_ms && self.voices.len() < self.cfg.max_voices => {
                let id = self.next_id;
                self.next_id += 1;
                self.voices.push(Voice {
                    id,
                    sum: e.iter().map(|x| x * speech_ms as f32).collect(),
                    speech_ms,
                });
                (Some(id), 1.0, true)
            }
            Some((i, sim)) if speech_ms >= self.cfg.min_new_ms => (Some(self.voices[i].id), sim, false),
            _ => (self.prev, 0.0, false),
        };
```

và `Assignment { voice, confidence, merged }` ở cuối hàm thành `Assignment { voice, confidence, merged, updated }`. Thêm phương thức sau `assign`:

```rust
    /// Tách giọng `from` (spec §5.3, kế hoạch 04): mở giọng mới từ `members` (thời lượng thật, nhúng, đoạn đã vào tâm của `from`
    /// chưa) và trừ khỏi tâm của `from` đúng các đoạn đã vào tâm. `None` (không đổi gì) khi đã đủ `max_voices`, `from` không còn,
    /// hay không nhúng nào dùng được. Mã giọng mới như giọng mở bình thường (tăng dần, không dùng lại).
    pub fn split(&mut self, from: u32, members: &[(u64, &[f32], bool)]) -> Option<u32> {
        if self.voices.len() >= self.cfg.max_voices {
            return None;
        }
        let i = self.voices.iter().position(|v| v.id == from)?;
        let dim = self.voices[i].sum.len();
        let usable: Vec<(u64, Vec<f32>, bool)> = members
            .iter()
            .filter_map(|&(ms, e, contributed)| {
                normalized(e).filter(|e| e.len() == dim).map(|e| (ms.min(MAX_SPEECH_MS), e, contributed))
            })
            .collect();
        if usable.is_empty() {
            return None;
        }
        let mut sum = vec![0.0f32; dim];
        let mut speech = 0u64;
        for (ms, e, contributed) in &usable {
            for (s, x) in sum.iter_mut().zip(e) {
                *s += x * *ms as f32;
            }
            speech = speech.saturating_add(*ms);
            if *contributed {
                let v = &mut self.voices[i];
                for (s, x) in v.sum.iter_mut().zip(e) {
                    *s -= x * *ms as f32;
                }
                v.speech_ms = v.speech_ms.saturating_sub(*ms);
            }
        }
        let id = self.next_id;
        self.next_id += 1;
        self.voices.push(Voice {
            id,
            sum,
            speech_ms: speech,
        });
        Some(id)
    }
```

`crates/speaker-worker/src/names/split.rs`, trước mod `tests`:

```rust
//! Tách giọng bị gộp theo tên thật (spec §5.3, đã duyệt; QĐ 10 của kế hoạch 04): một giọng trùng với hai tên, mỗi tên một phần đáng
//! kể thời gian trùng (`split_share`, `split_min_ms`, `split_min_segments` đoạn mang riêng tên đó), xen kẽ theo thời gian (≥ 2 lần
//! đổi), và tâm nhúng của hai nhóm đoạn khác nhau (cosine ≤ `split_max_cosine`): tách nhóm mang tên ít thời gian hơn sang giọng mới.
//! Mỗi giọng tách tối đa một lần mỗi 60 s, tối đa 4 lần mỗi phiên (worker giữ đếm). Thuần, tất định.

use std::collections::BTreeSet;
use std::fmt;

use speaker_protocol::SpeakerConfig;

use super::matcher::{NameMatcher, SegRec, centroid_of};
use crate::embed::cosine;

pub const SPLIT_COOLDOWN_MS: i64 = 60_000;
pub const MAX_SPLITS: u32 = 4;
/// Mỗi nhóm cần ít nhất chừng này nhúng để so tâm.
pub const MIN_EMBEDDINGS: usize = 2;

#[derive(Clone, PartialEq)]
pub struct SplitPlan {
    pub voice: u32,
    /// Tên của nhóm đoạn chuyển sang giọng mới.
    pub name: String,
    /// Id các đoạn chuyển sang giọng mới (theo thứ tự thời gian).
    pub segments: Vec<u64>,
}

// Debug viết tay: tên không vào log (rà soát A-NHỎ 5).
impl fmt::Debug for SplitPlan {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SplitPlan(giọng {}, <tên {} ký tự>, đoạn {:?})", self.voice, self.name.chars().count(), self.segments)
    }
}

/// Giọng đầu tiên (theo mã) cần tách, nếu có. `room`: giọng trong phòng (không tách); `cooling`: giọng vừa tách trong 60 s.
pub fn find_split(
    m: &NameMatcher,
    cfg: &SpeakerConfig,
    room: &BTreeSet<u32>,
    cooling: &BTreeSet<u32>,
) -> Option<SplitPlan> {
    if !cfg.split {
        return None;
    }
    for (&voice, totals) in m.totals() {
        if room.contains(&voice) || cooling.contains(&voice) {
            continue;
        }
        let total: i64 = totals.values().map(|e| e.ms.max(0)).sum();
        if total <= 0 {
            continue;
        }
        let recs: Vec<&SegRec> = m.records().filter(|s| s.voice == Some(voice) && s.attributed.is_some()).collect();
        let count = |n: &str| recs.iter().filter(|s| s.attributed.as_deref() == Some(n)).count() as u32;
        let mut names: Vec<(&String, i64)> = totals
            .iter()
            .filter(|(n, e)| {
                !m.is_self(n)
                    && e.ms >= cfg.split_min_ms as i64
                    && e.ms as f64 >= f64::from(cfg.split_share) * total as f64
                    && count(n) >= cfg.split_min_segments
            })
            .map(|(n, e)| (n, e.ms))
            .collect();
        if names.len() < 2 {
            continue;
        }
        names.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
        let (major, minor) = (names[0].0.as_str(), names[1].0.as_str());
        let order: Vec<&str> = recs
            .iter()
            .filter_map(|s| s.attributed.as_deref())
            .filter(|n| *n == major || *n == minor)
            .collect();
        if order.windows(2).filter(|w| w[0] != w[1]).count() < 2 {
            continue;
        }
        let of = |name: &str| centroid_of(recs.iter().copied().filter(|s| s.attributed.as_deref() == Some(name)), MIN_EMBEDDINGS);
        let (Some(a), Some(b)) = (of(major), of(minor)) else { continue };
        if cosine(&a, &b) > cfg.split_max_cosine {
            continue;
        }
        let segments = recs.iter().filter(|s| s.attributed.as_deref() == Some(minor)).map(|s| s.id).collect();
        return Some(SplitPlan {
            voice,
            name: minor.to_string(),
            segments,
        });
    }
    None
}

```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- cluster:: names::split 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok.`: mọi test cũ của `cluster` cộng 3 test mới, và 5 test của `names::split`. Rồi kiểm `latency-bench` (phụ thuộc `speaker-worker`; không dùng `Assignment`, chỉ để chắc phần đổi của crate không làm vỡ nó) vẫn biên dịch: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo check -p latency-bench 2>&1 | tail -1` → `Finished`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch. Không commit.

---

### Task 9: Tự hiệu chỉnh (spec §6.5)

**Files:**
- Create: `crates/speaker-worker/src/names/calibrate.rs`
- Modify: `crates/speaker-worker/src/names/mod.rs` (thêm `pub mod calibrate;`)

- [ ] **Step 1: Viết test đỏ**

`names/mod.rs`: thêm `pub mod calibrate;` trước `pub mod clock;`.

`crates/speaker-worker/src/names/calibrate.rs` (phần test):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn tile(name: &str, candidates: Vec<(u64, u64)>) -> TileSample {
        TileSample {
            name: name.into(),
            is_self: false,
            muted: None,
            label_speaking: false,
            anchors: vec![None],
            candidates,
            slot: 0,
        }
    }

    /// Ô của chính người dùng (QĐ 24: chưa nhận ra ô này thì không tự hiệu chỉnh).
    fn me() -> TileSample {
        TileSample {
            is_self: true,
            slot: 1,
            ..tile("Hoa Phạm", vec![])
        }
    }

    /// Mỗi 4 s: nói 1,5 s, im 2,5 s; 80 s.
    fn bursts() -> Spans {
        let mut s = Spans::default();
        for k in 0..20 {
            s.add(k * 4_000, k * 4_000 + 1_500);
        }
        s
    }

    #[test]
    fn an_element_that_changes_with_speech_is_learned() {
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        let mut was_active = false;
        while t < 80_000 {
            let talking = speech.covers(t - CAL_SHIFT_MS);
            let noise = if (t / 3_300) % 2 == 0 { 1 } else { 2 };
            c.push(t, 250, &[me(), tile("Lan", vec![(7, if talking { 2 } else { 1 }), (8, noise)])], false, &speech);
            was_active |= c.active();
            t += 250;
        }
        assert!(was_active, "≥ 10 s tiếng nói không ai đang nói");
        assert_eq!(c.learned().get("Lan"), Some(&7));
        assert_eq!(c.learned().len(), 1);
        assert!(!c.active(), "học được thì thôi tìm (rà soát A-Q4)");
    }

    /// QĐ 11 (rà soát A-Q10): máy lúc nào cũng có tiếng (Lan và Minh nói luân phiên); phần tử trong ô Lan đổi đúng lúc giọng của
    /// Minh nói. Tự hiệu chỉnh chỉ tương quan với tiếng nói chung (spec §6.5) nên không học (cách cũ "tương quan theo từng giọng" học
    /// nhầm phần tử này thành chỉ báo của Lan). Giới hạn đã biết: chỉ báo đúng của người nói luân phiên cũng không học được (r ≈ 0,30,
    /// mục Rủi ro).
    #[test]
    fn an_element_that_follows_another_voice_is_not_learned() {
        let mut speech = Spans::default();
        speech.add(0, 80_000);
        let mut minh = Spans::default();
        for k in 0..20 {
            minh.add(k * 4_000 + 2_000, k * 4_000 + 3_500);
        }
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let state = if minh.covers(t - CAL_SHIFT_MS) { 2 } else { 1 };
            c.push(t, 250, &[me(), tile("Lan", vec![(7, state)])], false, &speech);
            t += 250;
        }
        assert!(c.learned().is_empty());
    }

    #[test]
    fn nothing_is_learned_while_the_recipe_explains_speech() {
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let talking = speech.covers(t - CAL_SHIFT_MS);
            c.push(t, 250, &[me(), tile("Lan", vec![(7, if talking { 2 } else { 1 })])], true, &speech);
            t += 250;
        }
        assert!(!c.active() && c.learned().is_empty());
    }

    /// QĐ 24: lượt đọc không nhận ra ô của chính người dùng (Meet hiện nay) thì không tự hiệu chỉnh.
    #[test]
    fn nothing_is_learned_without_the_user_tile() {
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let talking = speech.covers(t - CAL_SHIFT_MS);
            c.push(t, 250, &[tile("Lan", vec![(7, if talking { 2 } else { 1 })])], false, &speech);
            t += 250;
        }
        assert!(!c.active() && c.learned().is_empty());
    }

    #[test]
    fn an_element_that_changes_in_silence_is_not_learned() {
        let speech = bursts();
        let mut c = Calibrator::default();
        // `i64` rõ ràng: `rem_euclid` không gọi được trên số nguyên chưa rõ kiểu (rà soát A-C2.2, lỗi E0689).
        let mut t: i64 = 0;
        while t < 80_000 {
            let quiet_middle = (2_500..3_500).contains(&(t.rem_euclid(4_000)));
            c.push(t, 250, &[me(), tile("Lan", vec![(7, if quiet_middle { 2 } else { 1 })])], false, &speech);
            t += 250;
        }
        assert!(c.active());
        assert!(c.learned().is_empty());
    }

    /// Rà soát A-Q4: tìm quá 3 phút không học được gì thì ngừng (bộ đọc thôi đọc nhanh, thôi đọc ứng viên), 10 phút sau mới thử lại.
    #[test]
    fn the_search_stops_after_three_minutes_and_retries_after_ten() {
        let mut speech = Spans::default();
        speech.add(0, 1_000_000);
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        let (mut started, mut stopped, mut restarted) = (None, None, None);
        while t < 1_000_000 {
            c.push(t, 250, &[me(), tile("Lan", vec![(7, 1)])], false, &speech);
            match (c.active(), started, stopped, restarted) {
                (true, None, _, _) => started = Some(t),
                (false, Some(_), None, _) => stopped = Some(t),
                (true, Some(_), Some(_), None) => restarted = Some(t),
                _ => {}
            }
            t += 250;
        }
        let (s, e, r) = (started.unwrap(), stopped.unwrap(), restarted.unwrap());
        assert_eq!(e - s, CAL_MAX_SEARCH_MS);
        assert!(r - e >= CAL_RETRY_AFTER_MS, "{}", r - e);
        assert!(c.learned().is_empty());
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::calibrate 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch (`Calibrator` chưa có).

- [ ] **Step 3: Viết mã**

`crates/speaker-worker/src/names/calibrate.rs`, trước mod `tests`:

```rust
//! Tự hiệu chỉnh (spec §6.5; QĐ 11, 24 của kế hoạch 04). Chỉ khi lượt đọc nhận ra đúng một ô của chính người dùng. Bắt đầu tìm khi
//! máy có ≥ 10 s tiếng nói mà không người ở xa nào "đang nói" theo tín hiệu 1–3 (công thức không tìm thấy hay ngừng khớp); từ đó
//! bộ đọc gửi thêm trạng thái các phần tử không chữ trong mỗi ô (`TileSample::candidates`). Mỗi 5 s, với 60 s gần nhất, lưới
//! 250 ms, tiếng nói dời 0,6 s: phần tử nào có hệ số tương quan ≥ 0,6 giữa "khác trạng thái thường gặp nhất" và **tiếng nói chung
//! của máy** (như chữ spec), và ≥ 90% số lần đổi nằm trong lúc có tiếng, thì thành chỉ báo của người tham dự có ô chứa nó tới hết
//! phiên. Học được thì thôi tìm, tìm quá 3 phút không học được thì cũng ngừng; cả hai ca 10 phút sau mới tìm lại (rà soát A-Q4). Mẫu tìm được
//! không có tên người (khóa vị trí); kế hoạch 06 gửi kèm báo cáo tình trạng.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use super::Spans;
use crate::reader::extract::TileSample;

pub const CAL_WINDOW_MS: i64 = 60_000;
pub const CAL_GRID_MS: i64 = 250;
pub const CAL_SHIFT_MS: i64 = 600;
pub const CAL_MIN_R: f64 = 0.6;
pub const CAL_ONLY_IN_SPEECH: f64 = 0.9;
pub const CAL_START_AFTER_MS: i64 = 10_000;
pub const CAL_EVERY_MS: i64 = 5_000;
/// Tìm tối đa chừng này mỗi lần; không học được thì ngừng.
pub const CAL_MAX_SEARCH_MS: i64 = 180_000;
/// Ngừng vì không học được thì chừng này sau mới thử lại.
pub const CAL_RETRY_AFTER_MS: i64 = 600_000;
pub const MAX_LEARNED: usize = 16;
/// Số chuỗi (người, phần tử) tối đa đang theo dõi.
pub const MAX_SERIES: usize = 512;
/// Một chuỗi cần ít nhất chừng này mẫu mới được xét.
const MIN_SAMPLES: usize = 8;

#[derive(Default)]
pub struct Calibrator {
    active: bool,
    unexplained_ms: i64,
    searching_since: i64,
    retry_at: Option<i64>,
    series: BTreeMap<(String, u64), VecDeque<(i64, u64)>>,
    learned: BTreeMap<String, u64>,
    last_eval: Option<i64>,
}

impl Calibrator {
    pub fn active(&self) -> bool {
        self.active
    }

    /// Chỉ báo tự học của từng người tham dự (khóa ứng viên).
    pub fn learned(&self) -> &BTreeMap<String, u64> {
        &self.learned
    }

    /// Một lượt đọc lúc `at_ms`, cách lượt trước `period_ms`. `explained`: có người ở xa đang nói theo tín hiệu 1–3 hay chỉ báo tự
    /// học; `speech`: tiếng nói của máy.
    pub fn push(&mut self, at_ms: i64, period_ms: i64, tiles: &[TileSample], explained: bool, speech: &Spans) {
        if tiles.iter().filter(|t| t.is_self).count() != 1 {
            // QĐ 24: chưa nhận ra (đúng một) ô của chính người dùng thì ô đó có thể bị học: không tự hiệu chỉnh.
            return;
        }
        if !self.active {
            if self.retry_at.is_some_and(|r| at_ms < r) {
                return;
            }
            if explained {
                self.unexplained_ms = 0;
            } else if speech.covers(at_ms - CAL_SHIFT_MS) {
                self.unexplained_ms += period_ms.clamp(0, 1_000);
            }
            if self.unexplained_ms < CAL_START_AFTER_MS {
                return;
            }
            self.active = true;
            self.searching_since = at_ms;
            self.last_eval = None;
        }
        if at_ms - self.searching_since >= CAL_MAX_SEARCH_MS {
            self.stop(Some(at_ms + CAL_RETRY_AFTER_MS));
            return;
        }
        for tile in tiles.iter().filter(|t| !t.is_self) {
            let mut keys: BTreeSet<u64> =
                self.series.keys().filter(|(n, _)| *n == tile.name).map(|(_, k)| *k).collect();
            keys.extend(tile.candidates.iter().map(|(k, _)| *k));
            for key in keys {
                let id = (tile.name.clone(), key);
                if !self.series.contains_key(&id) && self.series.len() >= MAX_SERIES {
                    continue;
                }
                // Phần tử không có ở lượt này: trạng thái 0 (chỉ báo kiểu "chỉ có mặt khi nói").
                let state = tile.candidates.iter().find(|(k, _)| *k == key).map_or(0, |&(_, s)| s);
                let s = self.series.entry(id).or_default();
                s.push_back((at_ms, state));
                while s.front().is_some_and(|&(t, _)| t < at_ms - CAL_WINDOW_MS) {
                    s.pop_front();
                }
            }
        }
        if self.last_eval.is_none_or(|t| at_ms - t >= CAL_EVERY_MS) {
            self.last_eval = Some(at_ms);
            if self.evaluate(at_ms, speech) {
                // Học được thì thôi tìm, 10 phút sau mới tìm tiếp cho người khác (rà soát lần 2 A-C1: không đặt hạn thì sau 10 s tiếng
                // nói chưa giải thích được lại tìm ngay).
                self.stop(Some(at_ms + CAL_RETRY_AFTER_MS));
            }
        }
    }

    /// Thôi tìm: bỏ chuỗi đang theo dõi; `retry_at`: không tìm lại trước lúc này.
    fn stop(&mut self, retry_at: Option<i64>) {
        self.active = false;
        self.unexplained_ms = 0;
        self.retry_at = retry_at;
        self.series.clear();
    }

    /// `true` khi học được chỉ báo mới.
    fn evaluate(&mut self, at_ms: i64, speech: &Spans) -> bool {
        let grid: Vec<i64> = (0..CAL_WINDOW_MS / CAL_GRID_MS).map(|i| at_ms - CAL_WINDOW_MS + i * CAL_GRID_MS).collect();
        let target: Vec<f64> = grid.iter().map(|&t| f64::from(u8::from(speech.covers(t - CAL_SHIFT_MS)))).collect();
        let mut best: BTreeMap<String, (f64, u64)> = BTreeMap::new();
        for ((name, key), s) in &self.series {
            if self.learned.contains_key(name) || s.len() < MIN_SAMPLES {
                continue;
            }
            let mode = mode_of(s);
            let x: Vec<f64> = grid
                .iter()
                .map(|&t| state_at(s, t).map_or(0.0, |st| f64::from(u8::from(st != mode))))
                .collect();
            let r = pearson(&x, &target);
            let changes: Vec<i64> = s.iter().zip(s.iter().skip(1)).filter(|(a, b)| a.1 != b.1).map(|(_, b)| b.0).collect();
            if changes.is_empty() {
                continue;
            }
            // Lần đổi lúc tắt tới sau khi hết tiếng (trễ của app): tính là "có tiếng" nếu máy có tiếng trong 1 s trước đó.
            let in_speech = changes
                .iter()
                .filter(|&&t| speech.covers(t - CAL_SHIFT_MS) || speech.covers(t - CAL_SHIFT_MS - 1_000))
                .count() as f64
                / changes.len() as f64;
            if r >= CAL_MIN_R && in_speech >= CAL_ONLY_IN_SPEECH && best.get(name).is_none_or(|b| r > b.0) {
                best.insert(name.clone(), (r, *key));
            }
        }
        let mut learned_new = false;
        for (name, (_, key)) in best {
            if self.learned.len() < MAX_LEARNED {
                self.learned.insert(name, key);
                learned_new = true;
            }
        }
        learned_new
    }
}

/// Trạng thái thường gặp nhất; bằng số lần thì giá trị nhỏ hơn (tất định).
fn mode_of(s: &VecDeque<(i64, u64)>) -> u64 {
    let mut counts: BTreeMap<u64, usize> = BTreeMap::new();
    for &(_, st) in s {
        *counts.entry(st).or_default() += 1;
    }
    counts.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map_or(0, |(st, _)| *st)
}

/// Trạng thái ở lượt đọc gần nhất không sau `t`.
fn state_at(s: &VecDeque<(i64, u64)>, t: i64) -> Option<u64> {
    let i = s.partition_point(|&(at, _)| at <= t);
    (i > 0).then(|| s[i - 1].1)
}

fn pearson(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len().min(y.len()) as f64;
    if n < 2.0 {
        return 0.0;
    }
    let (mx, my) = (x.iter().sum::<f64>() / n, y.iter().sum::<f64>() / n);
    let (mut sxy, mut sxx, mut syy) = (0.0, 0.0, 0.0);
    for (a, b) in x.iter().zip(y) {
        sxy += (a - mx) * (b - my);
        sxx += (a - mx) * (a - mx);
        syy += (b - my) * (b - my);
    }
    if sxx == 0.0 || syy == 0.0 { 0.0 } else { sxy / (sxx * syy).sqrt() }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p speaker-worker --lib -- names::calibrate 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 6 passed`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short`
Expected: sạch. Không commit.

---
## Phủ spec (cả file 04 và 04b)

Số Task dùng chung cho hai file: Task 0–9 ở file này, Task 10–21 ở file 04b; "T5" là Task 5.

| Mục spec | Yêu cầu | Task |
|---|---|---|
| §4.1 | bộ đọc tên ở trong `speaker-worker`, luồng riêng, QoS `utility`, không chặn phụ đề; worker lỗi thì chỉ worker chết | T10 (vòng sự kiện, luồng stdin riêng, mẫu qua kênh), T12 (luồng `speaker-reader`) |
| §4.1 | không có mã mạng (4 lớp) | T2 (thêm `speaker-recipe` vào kiểm), T17 (lớp 4 trên binary release) |
| §4.2 | `Load {names_enabled, recipe_json}` | T1 (`NamesSetup`, QĐ 5), T10, T13, T16 |
| §4.2 | `Ready.reader_platform` | T1, T10 |
| §4.2 | `Speech`, `SetNames`; thêm `PauseNames` (tạm dừng giữ tên, QĐ 15) | T1, T10, T13 (luồng VAD, client, `SpeakerHandle::set_names`, bậc 1 quá tải) |
| §4.2 | `VoiceInfo.{name, name_source, room_index}`, `Voices.participants`, `ReaderState` | T1, T10, T13, T14, T15 |
| §4.2 | thêm ở cuối, tăng `PROTOCOL_VERSION`, chỉ số biến thể ghim; log không có tên | T1 (`variant_indices_are_pinned`, `PersonName`, `a_load_of_another_protocol_version_does_not_decode`), T10 (stderr in phiên bản), T13 (log gợi ý khi đóng trước `Ready`, QĐ 26), T4, T5, T7, T8, T14 (`Debug` viết tay: `TileSample`, `ParticipantNow`, `VoiceName`, `SplitPlan`) |
| §5.3 | tách giọng bị gộp theo tên; ngưỡng và cách tách chốt bằng số đo; không đạt thì giữ như hiện nay | T7 (đoạn "mang tên"), T8 (`OnlineClusterer::split`, `find_split`), T10 (gửi lại `Assign`), T11 (đo, tiêu chí, mặc định) |
| §5.5 | giọng trong phòng không nhận tên | T7, T10 |
| §5.6 | nhúng của đoạn gần đây chỉ trong RAM, xóa ở `SessionStart` | T7 (`SegRec`, ≤ 512 đoạn), T10 (`Names::new_session`) |
| §6.1 | danh sách app viết cứng (bundle id), công thức chỉ thu hẹp | T1 (`MeetingApp`), T2 (app lạ bỏ cả mục), T12 (`app_of_bundle_id`) |
| §6.1 | cửa sổ họp: Teams theo tiêu đề và nút rời, Zoom theo id/tiêu đề, Meet theo tiêu đề; chỉ đọc cửa sổ họp; ≤ 2 cửa sổ; quét tiến trình mỗi 2 s | T2, T4 (`is_meeting_window`, `confirm_id`), T12 (`SCAN_EVERY`, `MAX_WINDOWS`). Bản build sẵn chỉ có Teams: Zoom (QĐ 16) và Meet (QĐ 32) chỉ có công thức riêng cho test và `ax-record --recipe` tới T21. "Ưu tiên cửa sổ có tiếng nói khớp": xem Rủi ro |
| §6.2 | `AXUIElementCreateApplication`, hạn chờ 0,2 s, `AXEnhancedUserInterface` cho Teams, Chrome, Edge, đặt lại khi dừng, dấu để lần mở app sau trả | T12 (`AxNode`, hạn chờ đặt trên phần tử hệ thống cho cả tiến trình `set_process_timeout`, QĐ 27; `enable_enhanced`, `release_all`, `restore_leftovers` chỉ khi có quyền, `eui.rs`), T16 (`eui_macos::restore` lúc mở app, chỉ khi có quyền; file dấu theo loại build, QĐ 28) |
| §6.2 | lượt đầy đủ mỗi vài giây, lượt nhanh chỉ đọc chỉ báo đã biết, gom thuộc tính bằng `AXUIElementCopyMultipleAttributeValues`; ≤ 3 000 phần tử, ≤ 30 ms, vượt thì lượt sau đọc tiếp | T4 (`Budget` đếm mọi lệnh đọc của cả lượt qua `Metered`; `Walk`, `sample_round` xoay vòng; test `a_whole_pass_with_calibration_stays_within_the_read_limit`, `a_small_budget_rotates_over_the_tiles`), T12 (`FULL_EVERY`, `AxTree::many`, một ngân sách cho cả `tick`) |
| §6.2 | nhịp 1/giây, 4/giây khi có tiếng và đang cần gán tên (kế hoạch 04 định cụ thể) | T10 (`control_state`, QĐ 13), T12 |
| §6.2 | đo lại bằng bộ đọc thật; thử quyền với binary `speaker-worker` thật | T19, T20, T21 |
| §6.3 | chỉ lấy tên, mic, mức nói, chính người dùng; làm gọn tên (hậu tố, 40 ký tự); không chat, không ảnh, không gì khác | T2 (`tidy_name`), T4 (`TileSample`, đọc chữ chọn lọc QĐ 3, test `meet_reads_text_only_inside_its_web_area`), T5 |
| §6.4 | tín hiệu theo thứ tự: chữ, hành vi (có mặt, đổi ≥ 2 lần/1 s, khác thường gặp), mic (một người ở xa mở mic), tự hiệu chỉnh | T2 (`SignalKind`), T4, T5 (`SpeakingTracker` theo từng ô, nền "thường gặp" từ lượt máy im, QĐ 23), T6 (`quiet_at`), T7 (mic chỉ khi nhận ra ô người dùng và có bằng chứng chỉ báo, QĐ 24), T9 |
| §6.4 | Teams: neo là ô video; bảng People bổ sung; chưa thử mic mở im lặng, đông hơn số ô, video, tài khoản công việc | T2 (công thức), T5 (fixture People đóng và mở), T20 Step 3 |
| §6.4 | Meet: tìm hiểu ô ở cửa sổ chủ phòng; tự hiệu chỉnh là đường lùi | T7 (`meet_gives_no_name_in_the_listener_window`: cửa sổ người nghe 0 ms bằng chứng, không tên), T5, T9, T21 Step 1. **Meet tắt mặc định** (QĐ 32) tới khi T21 tìm được chỉ báo ở cửa sổ người nghe; tự hiệu chỉnh và tín hiệu mic cũng không chạy với Meet khi chưa nhận ra ô người dùng (QĐ 24) |
| §6.5 | ghi đổi trạng thái của phần tử gần tên, tương quan ≥ 0,6 với tiếng nói (dời 0,6 s, 60 s), chỉ đổi khi có tiếng, dùng tới hết phiên | T9 (chỉ tiếng nói chung như spec, QĐ 11; tìm có thời hạn; cần ô người dùng, QĐ 24), T10 (`calibrate` trong `Control`: đọc ứng viên khi đang tìm hay đã học), T4 (ứng viên) |
| §6.5 | mẫu chỉ báo kèm báo cáo tình trạng | để kế hoạch 06 (xem dưới) |
| §6.6 | cộng dồn thời gian trùng sau khi dời trễ theo app; gán khi ≥ 60%, ≥ 3 s, ≥ 2 đoạn; mỗi tên một giọng (Hungarian); máy chung phòng "· giọng k"; chống nhảy tên; bỏ qua người dùng và giọng trong phòng; tên đổi tay thắng | T7 (QĐ 9: `one_voice_per_name` là ghép cặp tối ưu vì mỗi giọng tối đa một ứng viên, test so `best_matching`; máy chung phòng chỉ khi tâm nhúng khác nhau; QĐ 25 giọng gộp không nhận tên), T2 (trễ theo app, QĐ 17), T15 (nhãn "· giọng k", tên đổi tay thắng) |
| §6.6 | độ trễ build sẵn chốt lại bằng bộ đọc thật | T20 Step 5, T21 |
| §6.7 | `AXIsProcessTrusted`; dòng mời khi đang dịch, có app họp, chưa có quyền, "Lấy tên" bật (thanh chưa khóa: 03b); dùng chung nút `tccutil reset` và luồng của Gõ dịch, không luồng riêng | T12 (`NoPermission`), T15 (`set_reader`, `ask_access`), T19; QĐ 7 |
| §6.8 | trợ năng bật suốt phiên, đặt lại khi dừng; không bấm, không gõ; đo bằng số lệnh và năng lượng; tác dụng phụ của EUI; với trình duyệt chỉ khi có cửa sổ Meet | T12 (trình duyệt: trả EUI sau 30 s không còn cửa sổ Meet, QĐ 28; luồng đọc ngủ hẳn khi tắt, QĐ 27), T16, T20 Step 2, Step 4 |
| §7.1 | công thức build sẵn trong app: nguồn `scripts/speaker-recipes/recipes.json`, nhúng lúc build; nội dung (tiêu đề, tìm tên, chỉ báo, chính người dùng, mic, hậu tố, trễ); mẫu chữ `regex`, ≤ 256 ký tự, file ≤ 256 KB, app ngoài danh sách bỏ cả mục | T2 (thêm: ô phải ràng buộc hình dạng), T16 (`names_setup`) |
| §7.1 | mẫu nhãn theo 5 ngôn ngữ giao diện của app họp | **Chưa phủ đủ** (rà soát A-NHỎ 7): bản build sẵn có tiêu đề cửa sổ Teams tiếng Anh và tiếng Việt, nhãn ô chỉ tiếng Anh; T21 Step 4 ghi nhãn các ngôn ngữ đổi được, phần còn lại ở "Để kế hoạch sau" (kế hoạch 06) |
| §7.1 | phong bì ký, tải mỗi 6 giờ, chống quay lui, `pnpm recipes:update` | kế hoạch 06 (ranh giới: QĐ 4) |
| §8.3 | "Lấy tên" bật sẵn, tắt theo "Phân biệt"; đổi giữa phiên có tác dụng ngay | 03 (giao diện), T16 (`names_changed` → `SetNames`) |
| §9 | `speaker://roster` có `participants`, `source: "name"`, nhãn tính sẵn | T15 |
| §10 | không bí mật mới, không entitlement mới; đọc trong phạm vi; công thức chỉ mô tả; tên không vào log; `clean_name` cho mọi tên từ app họp; app coi khung worker là chưa tin; app họp treo: chờ tối đa 0,2 s mỗi lệnh | T1 (`voices_fit`), T2, T3 (fixture không có định danh tài khoản, test quét), T4, T12 (hạn chờ cả tiến trình, QĐ 27), T13 (khung vượt giới hạn là worker hỏng), T15, T16 (chưa có quyền thì app không gọi API Trợ năng, QĐ 28), T17 Step 5 |
| §11 | không làm chậm phụ đề (A-spk4 khi đọc tên bật); ≤ 30 ms mỗi lượt (cả lượt nhanh, QĐ 13); quá tải: tạm dừng đọc tên (giữ tên đã chốt) rồi mới tắt | T18 (xen kẽ ABBA; chi phí logic gồm ghép tên, tách giọng, tự hiệu chỉnh), T21 Step 5, T20 Step 2, T4, T10 (`PauseNames`), T13 (QĐ 15), T15 (`Paused` giữ tên) |
| §12 | bộ đọc trên cây ghi sẵn (tên giả); ghép tên trên dòng thời gian giả (trễ, nói chồng, máy chung phòng, người dùng, giọng trong phòng, đổi tay); công thức (giới hạn mẫu, kích thước, app ngoài danh sách); giao thức | T3–T5, T7, T2, T1, T15 |
| §12 | công thức: chữ ký, tiền tố riêng, chống quay lui | kế hoạch 06 |
| §13 mục 4 | bộ đọc Zoom, Teams, Meet (Chrome, Edge), tự hiệu chỉnh, ghép tên, tách giọng, dòng mời, công thức build sẵn, bộ test cây ghi sẵn | toàn bộ file 04 và 04b; công thức build sẵn chỉ bật Teams (Meet, Zoom: mã và test có, tắt mặc định, QĐ 16, 32) |
| §14 | Teams chưa thử, Meet chủ phòng, Edge chưa kiểm, đọc cây tốn thêm | T20, T21 |

## Để kế hoạch sau

- **Kế hoạch 05 (Windows):** `UiaTree` hiện thực trait `Tree` (Name, ControlType, AutomationId, ClassName vào `Attrs`), bộ đọc UI Automation trên luồng riêng như `reader::macos` (không cần `AXEnhancedUserInterface`, không file dấu), mục `"os": "windows"` trong `recipes.json`, `ReaderPlatform::Windows`, fixture ghi bằng `uia-probe` (đổi sang định dạng fixture), dòng mời không có trên Windows (03b đã đúng). `Worker::with_os` và `Os::current()` đã sẵn.
- **Kế hoạch 06 (vận hành):** phong bì ký của công thức (`format: ai-translator-speaker-recipes`, tiền tố ký riêng, cùng khóa manifest trong CI), tải lúc mở và mỗi 6 giờ, kiểm `schema`, `min_app_version`, chống quay lui (`version` của định dạng đã có), lưu trên máy, rồi `speaker_recipe::parse` và gửi thân trong `Load.names.recipe_json` (worker không đổi); `pnpm recipes:update` chạy bộ fixture của `scripts/speaker-recipes/fixtures/` (test Rust của Task 4, 5) trước khi hỏi y/N; báo cáo `speaker_health` từ `ReaderState` (app, phiên bản app họp, trạng thái, phiên bản công thức, số chỉ báo tự học) và số phút đọc được tên; **mẫu chỉ báo tự học (spec §6.5) cần mô tả đọc được** (vai trò, lớp, vị trí so với chữ tên): kế hoạch 04 chỉ giữ khóa băm của vị trí, 06 thêm phần mô tả vào `TileSample::candidates` và `ReaderState`; kiểm tra tự động hằng ngày (`tools/speaker-canary/`) dùng `ax-record`; **mẫu nhãn theo 5 ngôn ngữ giao diện của app họp** (spec §7.1, chưa phủ ở 04: nhãn ô chỉ tiếng Anh) thêm dần qua `pnpm recipes:update` từ bản ghi T21 Step 4 và báo cáo `speaker_health`; fixture mới qua `make_fixture.py` (`build` rồi `review`, duyệt trước khi vào repo).
- **Kế hoạch 07 (phát hành):** mở `speaker::enabled()`; chính sách quyền riêng tư nói đúng chế độ trợ năng của Teams (bật tới khi Teams khởi động lại) và trình duyệt (chỉ trong lúc dịch có cửa sổ Meet); website; nghiệm thu A-spk3 (tên thật, kịch bản tự động, Teams, Meet, Zoom × macOS, Windows), A-spk5 (gồm số đo của T20), A-spk6, A-spk7; sửa spec chính (§15 của spec).
- **Sau T21 (cần bản ghi thật):** đưa mục Zoom vào `recipes.json` build sẵn (QĐ 16); **bật lại Meet** khi tìm được chỉ báo dùng được ở cửa sổ người nghe (QĐ 32) và chủ dự án đồng ý; dấu nhận ô của chính người dùng trong Meet (QĐ 24) để bật tín hiệu mic và tự hiệu chỉnh cho Meet.
- **Chưa xếp kế hoạch nào:** khi nhiều app họp cùng có cửa sổ họp, ưu tiên cửa sổ có tiếng nói khớp (spec §6.1; 04 đọc app đầu theo thứ tự Teams, Zoom, Meet Chrome, Meet Edge); `AXObserver` thay hỏi vòng (QĐ 21); thao tác "tách" giọng bằng tay.

## Rủi ro và điều chưa biết

| Rủi ro | Cách xử lý trong kế hoạch |
|---|---|
| **Kế hoạch chưa được biên dịch hay chạy.** Mã mẫu viết theo mã thật ở HEAD `72614025` và API đọc trực tiếp trong mã nguồn đã tải về (`core-foundation` 0.10.1: `CFArray::from_CFTypes`, `get_all_values`, `CFType::downcast`, `CFBundle::new`, `CFBundleGetIdentifier`, `CFBundleGetValueForInfoDictionaryKey`; `libc` 0.2.189: `proc_listallpids`, `proc_pidpath`, `PROC_PIDPATHINFO_MAXSIZE`) | Người thực thi sửa lỗi biên dịch nhỏ (mượn, kiểu) **không đổi hành vi**; đổi hành vi thì dừng, báo. Số test mong đợi ở mỗi Step là ước tính từ số test thêm; lệch thì ghi số thật |
| **Meet không gán được tên cho người ở xa** (rà soát lần 2 A-Q1): chỉ báo chỉ có ở ô của tài khoản đang nói trong chính cửa sổ của nó; ở cửa sổ chủ phòng (chỗ người dùng nghe) 0 ms bằng chứng, không tên. Số khớp 0,890 (theo ô, đẩy 250 ms, nền lượt máy im) đo ô của chính người dùng. Fixture Meet là một tài khoản vào hai cửa sổ | **Meet tắt mặc định** (QĐ 32): không đọc Chrome/Edge, không đặt EUI, không dòng mời vì Chrome; test `meet_gives_no_name_in_the_listener_window` ghim hành vi; ngưỡng test 0,80 giữ, không hạ (QĐ 23); T21 Step 1 thử hai tài khoản, tìm chỉ báo ở cửa sổ người nghe; "Điều cần chủ dự án quyết" mục 16 |
| **Zoom chưa có bản ghi**: mẫu nhãn và vai trò của ô chưa biết (fixture và công thức Zoom chỉ là tổng hợp); chưa biết khung chat có nằm trong cửa sổ họp không | Mục Zoom **bỏ khỏi bản build sẵn** (QĐ 16); `parse` bỏ mọi ô không ràng buộc hình dạng (QĐ 3); T21 Step 3 ghi bản ghi thật rồi mới thêm; "Điều cần chủ dự án quyết" mục 4 |
| Tiêu đề cửa sổ họp Teams khác "Meeting with …" (cuộc họp lên lịch, giao diện tiếng Việt và ngôn ngữ khác) chưa biết | Không khớp thì không đọc ("Người N", an toàn); T21 Step 4 bổ sung mẫu |
| Dòng mời hiện khi app họp có công thức đang chạy mà không họp (QĐ 7: chưa có quyền thì không thấy cửa sổ). Với Meet tắt (QĐ 32) chỉ còn Teams; bật lại Meet thì Chrome, Edge (thường chạy suốt) cũng gây dòng mời | Dòng mời ẩn được tới hết phiên; "Điều cần chủ dự án quyết" mục 1, 16 |
| `AXEnhancedUserInterface` có tác dụng phụ với cửa sổ (chưa kiểm có chủ đích); người dùng VoiceOver | Không giành khi đã bật, chỉ trả cho app mình bật (QĐ 8); T20 Step 4 kiểm tác dụng phụ |
| Mốc giờ lệch (đồng hồ âm thanh trôi, luồng giám sát chuyển `Speech` sau tới 200 ms) | Mốc lấy nhỏ nhất trên 64 `Speech` (QĐ 12); trễ app 500–900 ms lớn hơn nhiều; T20 Step 5 đo khớp thật |
| Tách giọng chỉ đo trên mô phỏng (chỉ báo lý tưởng từ RTTM, giọng đọc sạch); thật có nói chồng, trễ đổi, tách nhầm | Thêm điều kiện tâm khác nhau, 60 s nghỉ, tối đa 4 lần (QĐ 10); mặc định chỉ bật nếu T11 đạt cả ba tiêu chí; có thể tắt qua `speaker_config` của manifest không cần phát hành |
| **Tách giọng KHÔNG đạt tiêu chí ở Task 11** (đã đo, `results/04-ghep-ten.md`): 9/9 cặp (share × cos) bị loại; ở cặp tham khảo (0,2; 0,8): 19/144 ô tệ hơn > 1 điểm `line_1s` (tệ nhất −16,3), 1 ô sai tên 0 → 9,5%; bốn bản hỏng vì gộp tăng +20…+28 điểm; hai bản AMI đã sai tên 5,8% ngay khi tắt nên tiêu chí "sai tên ≤ 5%" không đạt được bằng cách nào | Giữ `split = false` (mặc định hiện tại); chỉ xét lại ở kế hoạch 07 bằng họp thật, hoặc chặt `split_min_ms`/`split_min_segments` rồi chạy lại lưới; cân nhắc đổi tiêu chí 2–3 sang "không kém hơn khi tắt" (chủ dự án quyết) |
| Tự hiệu chỉnh chưa có dữ liệu thật; tối đa 16 ứng viên mỗi ô (ô Meet có hơn 20 nhóm rỗng). **Chỉ tương quan với tiếng nói chung (QĐ 11) nên hai người ở xa nói luân phiên thì chỉ báo đúng chỉ đạt r ≈ 0,30 < 0,6: gần như chỉ học được khi một người ở xa nói** | Chỉ chạy khi tín hiệu công thức không giải thích được ≥ 10 s tiếng nói, khi nhận ra ô người dùng, tối đa 3 phút mỗi lần; T21 Step 1 xem có học được không; "Điều cần chủ dự án quyết" mục 3 |
| **Meet không nhận ra ô của chính người dùng** (0/236 ô trên bản ghi: ô của mình hiện tên tài khoản, rà soát A-Q8) | Tín hiệu mic và tự hiệu chỉnh không chạy khi chưa nhận ra đúng một ô người dùng (QĐ 24), nên với Meet chỉ còn chỉ báo của công thức; chỉ báo của ô người dùng lúc người dùng nói chồng vẫn có thể thành bằng chứng cho giọng ở xa đang nói cùng lúc (đoạn của chính người dùng là nguồn `Mic`, không bao giờ là bằng chứng), nhưng luật ≥ 60% chặn tên sai khi nói chồng không chiếm đa số; T21 Step 1 tìm dấu nhận với hai tài khoản; "Điều cần chủ dự án quyết" mục 12 |
| Mẫu nhãn ô Teams `(?P<name>[^,]{1,120}?)` không khớp tên hiển thị có dấu phẩy ("Họ, Tên" hay gặp ở tài khoản công việc, rà soát A-NHỎ 6) | Không khớp thì ô đó không có tên (an toàn, mất phủ); T20 Step 3 thử tài khoản công việc, sửa mẫu qua công thức |
| Một người bị phân cụm tách hai giọng; máy chung phòng | Mỗi tên một giọng; giọng thua chỉ mang tên kèm số khi tâm nhúng khác hẳn (QĐ 9); thà "Người N" |
| Hai bản (debug và bản cài) cùng chạy đọc tên cùng lúc | File dấu EUI tách theo loại build (QĐ 28) nên không trả EUI của nhau; mỗi bản chỉ trả EUI chính nó bật (bản sau thấy EUI đã bật thì không giành); lưu ý ở đầu T19 |
| Nhiều app họp có cửa sổ họp cùng lúc: chỉ đọc app đầu theo thứ tự ưu tiên | Ca hiếm; "Để kế hoạch sau" |
| Bản dev cùng bundle id với app đã cài: cấp quyền Trợ năng cho bản dev có thể làm app đã cài mất quyền (Gõ dịch); nút `tccutil reset` ở bản dev xóa quyền của cả hai | Lưu ý ở đầu T19; không bấm nút đó ở bản dev |
| Fixture công khai (~1–2,5 MB) chứa lớp CSS, cấu trúc cây của Teams, Meet và tên giả; bản ghi gốc có định danh tài khoản Microsoft (`8:live:.cid.…`) trong `AXDOMIdentifier` của bảng People (rà soát A-C1) | Ẩn danh bằng script: thay mọi định danh tài khoản và UUID, thay tên chỉ trong trường chữ theo ranh giới từ, dừng khi còn mẫu cấm (T3); bản in theo trường được người điều phối hay chủ dự án duyệt trước khi vào repo; test Rust quét mọi fixture; kiểm lại ở T17 Step 5 |
| Tên dài hơn 40 ký tự bị cắt; hai người cùng tiền tố 40 ký tự thì trùng tên | Như spec §6.3; ca hiếm |
| `AXUIElementCopyMultipleAttributeValues` trả giá trị lỗi cho thuộc tính không có (đọc ra rỗng); hành vi với Chrome 156 và Teams chưa thử bằng mã này | T20 Step 2 (số phần tử, thời gian); `ax-record fixture` so với fixture cũ |

## Điều cần chủ dự án quyết

Mặc định ghi ở mỗi mục là cách kế hoạch này làm nếu chủ dự án không nói khác. Mục ghi **[ĐỔI MẶC ĐỊNH ở vòng rà soát 1]** là mục mà người điều phối đã đổi mặc định theo hai báo cáo rà soát; mục ghi **[MỚI]** thêm ở vòng đó.

1. **Dòng mời cấp quyền khi chưa có quyền** (QĐ 7), gồm cả **Chrome/Edge** khi Meet được bật lại: chưa có quyền thì không đọc được tiêu đề cửa sổ của app khác, nên không biết có cửa sổ họp hay không. Mặc định: mời khi đang dịch và một trong các app có công thức build sẵn đang chạy (hiện chỉ Teams vì Meet, Zoom tắt, mục 4, 16); nếu bật lại Meet thì kể cả khi chỉ Chrome hay Edge chạy mà người dùng đang dịch video chứ không họp (dòng mời ẩn được bằng ✕ tới hết phiên). Cách khác: chỉ Teams (và Zoom), người dùng Meet tự vào Cài đặt; hay Chrome/Edge chỉ mời sau khi người dùng bật "Lấy tên" có chủ ý.
2. **Bỏ tên khi tên xuống dưới 50% thời gian trùng của giọng** (QĐ 9, ngoài spec). Mặc định: có (thà "Người N" còn hơn sai tên). Cách khác: giữ tên tới khi tên khác thắng theo luật đổi tên.
3. **[ĐỔI MẶC ĐỊNH ở vòng rà soát 1] Tự hiệu chỉnh chỉ tương quan với tiếng nói chung của máy** (QĐ 11, đúng chữ spec §6.5). Mặc định cũ (tương quan cả với khoảng nói của từng giọng) đã bỏ vì học nhầm chỉ báo của người khác (rà soát A-Q10). Hệ quả: hai người ở xa nói luân phiên thì chỉ báo đúng chỉ đạt r ≈ 0,30, không học được; tự hiệu chỉnh gần như chỉ có tác dụng khi một người ở xa nói. Cách khác: thêm lại tương quan theo giọng kèm ràng buộc (giọng chưa mang tên người khác, mỗi giọng một ô), cần dữ liệu thật trước.
4. **[ĐỔI MẶC ĐỊNH ở vòng rà soát 1] Zoom trong công thức build sẵn trước khi có bản ghi thật.** Mặc định mới: **bỏ** mục Zoom khỏi `recipes.json` tới khi có bản ghi T21 Step 3 (công thức Zoom tổng hợp chỉ dùng cho test thuần). Mặc định cũ (giữ Zoom, ô không ràng buộc hình dạng nên đọc chữ mọi phần tử cửa sổ Zoom) đã bỏ (rà soát A-Q11). Cách khác: giữ Zoom với ô ràng buộc vai trò đoán trước (`AXButton`), chấp nhận có thể không tìm thấy ô.
5. **Tách giọng bị gộp theo tên**: mặc định theo kết quả T11 (bật nếu đạt cả ba tiêu chí, không thì giữ tắt như hiện nay). Chủ dự án xem `results/04-ghep-ten.md` trước khi phát hành.
6. **Danh sách "Chọn người trong cuộc họp" có cả tên của chính người dùng** (QĐ 18). Mặc định: có.
7. **Đưa fixture ẩn danh từ bản ghi của kế hoạch 01 vào repo công khai** (`scripts/speaker-recipes/fixtures/`, tên giả, mã phòng giả, định danh tài khoản và UUID đã thay, lớp CSS của Teams và Meet). Mặc định: có, **chỉ sau khi người điều phối hay chủ dự án duyệt bản in `review`** của T3 Step 2 (bộ test này là lớp chống vỡ của spec §7.1, §12).
8. **[ĐỔI MẶC ĐỊNH ở vòng rà soát 1] Quá tải: tạm dừng đọc tên tới hết phiên và giữ các tên đã chốt** (QĐ 15, `PauseNames`). Mặc định cũ (gửi `SetNames(false)`, xóa mọi tên đang hiện) đã bỏ (rà soát B-Q3). Cách khác: thử bật lại sau vài phút; hay xóa tên khi tạm dừng.
9. **Lịch cho ba bước cần chủ dự án** (T19: khoảng 20 phút; T20: khoảng 90 phút với hai khách tự động; T21: khoảng 2 giờ, cần Gmail thứ hai và Zoom).
10. **Cho phép commit** phần 04 khi xong (đang để ở working tree như kế hoạch này dặn).
11. **[MỚI] Mỗi tên một giọng (ghép cặp tối ưu theo spec §6.6)** (QĐ 9). Mặc định: theo spec, tên về giọng có nhiều thời gian trùng nhất; giọng khác cùng tên chỉ mang tên kèm số "· giọng k" (máy chung phòng) khi tâm nhúng khác hẳn (`cosine ≤ split_max_cosine`), không thì "Người N" (một người bị tách hai giọng). Cách khác: đánh số mọi giọng cùng tên như kế hoạch vòng 1 (người bị tách hai giọng hiện "Lan · giọng 1/2").
12. **[MỚI] Meet chưa nhận ra ô của chính người dùng** (QĐ 24). Mặc định: tín hiệu mic và tự hiệu chỉnh không chạy khi chưa nhận ra đúng một ô người dùng (với Meet hiện nay: không chạy), tới khi T21 Step 1 tìm được dấu nhận trên bản ghi hai tài khoản. Cách khác: coi ô mang tên tài khoản Google của người dùng là ô "tôi" (cần app biết tên tài khoản, chưa có cách lấy không xin thêm quyền).
13. **[MỚI] Tên không được gán chỉ nhờ tín hiệu mic** (QĐ 24, chặt hơn spec §6.4 mục 3). Mặc định: tên cần ≥ 1 s bằng chứng chỉ báo trên giọng đó. Cách khác: dùng tín hiệu mic một mình khi số ô bằng số người tham dự app họp báo (cần đọc thêm bảng People).
14. **[MỚI] Giọng có dấu hiệu gộp không nhận tên trội** (QĐ 25). Mặc định: có (thà "Người N"). Cách khác: nhận tên trội khi ≥ 60% như spec, chấp nhận người ít nói hơn mang tên người kia.
15. **[MỚI] Chế độ trợ năng của trình duyệt trả sau 30 s không còn cửa sổ Meet** (QĐ 28; chữ chính sách §6.8). Mặc định: có; Teams giữ tới hết phiên. Cách khác: giữ cả trình duyệt tới hết phiên (đúng chữ §6.2, chính sách phải sửa ở kế hoạch 07).
16. **[MỚI, vòng rà soát 2; ĐỔI MẶC ĐỊNH] Meet (Chrome, Edge) tắt mặc định** (QĐ 32). Bản ghi cho thấy ở cửa sổ người nghe không có chỉ báo nào (0 ms bằng chứng, không tên); chỉ ô của chính người dùng có chỉ báo. Mặc định (khuyến nghị): **tắt** (bỏ mục Meet khỏi `recipes.json`): không đọc Chrome, Edge, không đặt chế độ trợ năng cho trình duyệt, không có dòng mời vì Chrome; mã đọc trình duyệt và EUI vẫn được xây, có test, nằm ngủ. Tiêu chí để đề xuất bật lại: Task 21 Step 1 tìm được chỉ báo dùng được ở cửa sổ người nghe (phần tử, hoạt hình hay DOM khác ô tên) và test fixture ở cửa sổ người nghe cho tên đúng. Cách khác: bật Meet như kế hoạch vòng 1 (tốn trợ năng và đọc Chrome 1–4 lần/giây, gần như không gán được tên người ở xa).
