# Phân biệt người nói, kế hoạch 03: giao diện và dữ liệu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Chủ dự án chưa cho phép commit cho phần 03 của tính năng này. Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng bước "Mốc kiểm" (chạy đúng test, typecheck, lint liên quan; `git status --short` chỉ để đối chiếu). Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`. Chỉ commit khi chủ dự án nói rõ.

**Goal:** người dùng thấy ai đang nói: tên có màu ở dòng đầu mỗi lượt nói và vạch màu ở mọi câu trên thanh phụ đề và bản chép lời; đổi tên, chọn người trong cuộc họp, gộp hai người ngay trong phiên; nhóm "Người nói" ở Cài đặt › Phụ đề; nhãn trong Lịch sử và file xuất (Pro); chữ mới ở 5 ngôn ngữ. Tính năng **vẫn tắt với người dùng cuối** (chỉ bản debug có cờ dev mới chạy và mới thấy nhóm Cài đặt), tới kế hoạch 07.

**Architecture:** Bảng người nói của phiên (`SpeakerBook`, module mới `src-tauri/src/transcript/speakers.rs`) nằm trong `TranscriptStore`, cạnh bản chép lời trong bộ nhớ: nhận bảng giọng của engine (`speaker://roster` cũ, chỉ `{id, room}`), tính nhãn "Người N" theo thứ tự xuất hiện và ngôn ngữ giao diện, chỉ số màu, tên đổi tay, gộp tay; phát `speaker://roster` mới (`{voices: [{id, label, color, source, room, mergedInto}], participants, askAccess}`) cho hai cửa sổ. Đổi tên, gộp chỉ đổi cách hiện, không gửi worker, không chạm luồng phụ đề. Giao diện giữ giọng của từng dòng (`Subtitle.speaker`), tra bảng giọng (đối tượng giọng không đổi được giữ nguyên tham chiếu) và vẽ nhãn trong component memo của từng dòng: phụ đề không bao giờ chờ nhãn, nhãn đổi tại chỗ, chỉ dòng của giọng đổi mới vẽ lại. Lịch sử thêm cột `speaker TEXT` (nhãn lúc dừng phiên); xuất TXT, SRT (tùy chọn), Markdown có nhãn.

**Tech Stack:** Rust 1.98 (edition 2024), Tauri 2.12, rusqlite/SQLCipher (đã có); React 19.3, TypeScript 7.0, Vite 8.3, Vitest 5.0 (`react-dom/server` cho test component trong Node), zustand 5.0. **Không thêm thư viện mới** (Rust lẫn npm). Kiểm giao diện bằng trang xem trước `scripts/ui-preview` (IPC giả) và `scripts/ui-preview/check-i18n.mjs` (Chrome không đầu qua `website/tools/browser/cdp.mjs`, không cần Playwright).

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §8 (giao diện), §9 (dữ liệu), §10 (bảo mật, quyền riêng tư), §12 (kiểm thử, phần giao diện và dữ liệu), §13 mục 3; §4.4 (dòng đang nói), §4.5 (model, "đang tải"), §6.6–6.7 chỉ để biết dữ liệu mà kế hoạch 04 sẽ cấp. Mẫu đã duyệt: `bench/2026-10-26-nguoi-noi/truoc-spec/mock/` (4 ảnh, `mock.py`).

**Dựa trên:** kế hoạch 02 và 02b đã thực thi và đã commit (`05b57dfb`, `7c6af9b9` trên nhánh `phan-biet-nguoi-noi`): `Subtitle.speaker`, `LiveLine.speaker`, `EventSink::{speaker, roster}`, `SpeakerLabel {id, speaker}`, `Roster {voices: [RosterVoice {id, room}]}`, sự kiện `subtitle://speaker`, `speaker://roster` (`src-tauri/src/events.rs`), `TauriSink::{speaker, roster}` (`src-tauri/src/session.rs` dòng 994–1001), cờ dev `AI_TRANSLATOR_DEV_SPEAKER`, `crate::speaker::enabled()` (`src-tauri/src/speaker/mod.rs` dòng 27–37). Ghi chú chuyển sang 03: mục "Để kế hoạch sau" của file 02 và mục "Ghi cho kế hoạch 03 và 04" của `bench/2026-10-26-nguoi-noi/results/02-tong-hop.md`.

**Kế hoạch đi kèm:** `2026-10-26-phan-biet-nguoi-noi-03b-giao-dien.md` (Task 11–23: kiểu TypeScript, thanh phụ đề, bản chép lời, menu, Cài đặt, trang xem trước, nghiệm thu bằng ảnh, mốc kiểm tổng, thử app dev). File này (Task 0–10) là phần phía Rust cộng chữ i18n; chạy file này trước. Phủ spec, rủi ro và điều cần chủ dự án quyết của cả hai file ở cuối file này.

**Quy ước:**
- `W` = gốc worktree nhánh `phan-biet-nguoi-noi` (thư mục `meeting-translator-work/phan-biet-nguoi-noi`, cạnh thư mục chính); `M` = thư mục chính của repo (chỉ đọc); `DATA` = `$W/../data-nguoi-noi` (ngoài mọi repo: model nhúng giọng, dữ liệu đo); `B` = `$W/bench/2026-10-26-nguoi-noi`. Đặt bốn biến này theo máy của bạn trước khi chạy lệnh.
- Shell trở về thư mục chính sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd $W &&`** (hay đường dẫn tuyệt đối tương ứng).
- **Mọi lệnh cargo đặt `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0`.** Không `cargo clean`, không xóa gì trong `target/`. Lệnh `cargo test` có từ hai bộ lọc tên trở lên viết dạng `--lib -- a:: b::` (nhiều TESTNAME đứng trước `--` làm cargo báo lỗi).
- **Đĩa:** mỗi bước build nặng (ghi "build nặng": build lần đầu của `meeting-translator` sau khi đổi nhiều file, đổi `build.rs`, mọi lệnh `--release`) **bắt đầu bằng lệnh kiểm đĩa có điều kiện**, dừng thật khi thiếu: `avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; }` (ngưỡng **18** GiB cho lệnh `--release`). Lệnh dừng thì **báo chủ dự án** (không tự dọn).
- **Định dạng Rust:** mã mẫu của kế hoạch chưa qua `rustfmt` (`rustfmt.toml`: `max_width = 120`). Mỗi Mốc kiểm có Rust chạy `cargo fmt -p <crate>` **trước** `cargo fmt -p <crate> -- --check`; fmt chỉ đổi cách xuống dòng, không đổi mã.
- Test giao diện: `cd $W && node_modules/.bin/vitest run <file…>` (môi trường `node`, không jsdom). **Không chạy vitest ở `taskpolicy -b`** (ghi chú của dự án: chậm tới mức hết giờ). Typecheck: `cd $W && node_modules/.bin/tsc --noEmit`.
- Trang xem trước: `cd $W && node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431` chạy nền (Bash `run_in_background`), dừng khi xong Task (TaskStop) và kiểm không còn tiến trình Vite cổng 1431.
- Không mở hay đụng Teams, Chrome của người dùng, System Settings, âm lượng, micro của máy. Bước nào cần chạy app thật thì ghi **(cần chủ dự án)**.
- Repo GitHub công khai: không ghi đường dẫn cá nhân hay tên người thật vào file nào của repo. Tên trong dữ liệu mẫu ("Lan Nguyễn", "Minh Trần", "Hoa Phạm", "Tuấn Lê") là tên giả, như mẫu đã duyệt.
- Không đưa tên người nói (tên đổi tay, tên tham dự) vào log, `CommandError.message` hay báo cáo lỗi (spec §10).

---

## Quyết định thiết kế của kế hoạch này (ngoài chữ của spec)

1. **`color` là chỉ số 0–7, không phải mã màu.** Spec §8.1, §8.2 có hai bảng màu (nền tối của thanh phụ đề; nền sáng của cửa sổ chính, nền tối dùng bảng của thanh). Phía Rust gửi chỉ số theo thứ tự xuất hiện (`(N − 1) mod 8`); CSS định nghĩa `--spk-0` … `--spk-7` cho từng nơi (`overlay.css`; `tokens.css` sáng và tối). Đổi giao diện sáng/tối không cần phía Rust.
2. **"Người N": N là thứ tự xuất hiện trong phiên, không phải mã giọng** (spec §5.3 "lấy N theo thứ tự xuất hiện"; QĐ 8 của kế hoạch 02 tạm ghi N = mã). N theo thứ tự giọng vào bảng giọng của worker (không theo lần đầu hiện trên phụ đề): một giọng chỉ có ở đoạn bị lọc hay bị bỏ vẫn chiếm một số, nên có lúc giao diện hiện "Người 1", "Người 3". Khác cách N = mã khi worker chạy lại (mã cộng mã lớn nhất đã thấy) hay một mã không bao giờ vào bảng: theo thứ tự thì không nhảy số vì những lý do đó. Số không dùng lại khi worker gộp giọng. Nhãn tính ở phía Rust (spec §9 "label đã tính sẵn") bằng chuỗi `speaker_voice` của `src-tauri/src/i18n.rs` ("Người {n}", "Speaker {n}", "話者{n}", "说话人{n}", "화자 {n}"); đổi ngôn ngữ giao diện thì phát lại bảng.
3. **Bảng người nói nằm trong `TranscriptStore`**, không trong engine. Đổi tên, gộp tay chỉ đổi cách hiện (spec §5.4 "không gửi lại worker"), không gửi gì vào engine. Chúng dùng chung khóa của `TranscriptStore` với luồng phụ đề (luồng phụ đề giữ khóa đó ở mỗi `upsert`, `delta`, và từ nay ở `set_speaker`, `roster`); mỗi lần giữ khóa chỉ vài µs (như `get_transcript` vốn có), và `TauriSink::roster` tính bảng trong **một** lần khóa (QĐ 25), nên không làm chậm phụ đề thấy được (ưu tiên 1). Bản chép lời, Lịch sử và file xuất đọc nhãn từ cùng một chỗ.
4. **`speaker://roster` thêm ba trường ngoài spec §9:** `mergedInto` (giọng đã gộp tay hiện như giọng đích: nhãn, màu của giọng đó; giao diện coi hai giọng là một lượt nói), `askAccess` (hiện dòng mời cấp quyền Trợ năng, spec §6.7) và `rev` (số thứ tự của bảng, QĐ 25). `askAccess` và `participants` luôn rỗng/false ở kế hoạch 03: kế hoạch 04 (bộ đọc tên) bật. Đặt `askAccess` ở bảng người nói thay vì `AppStatus` để không đổi `AppStatus` (đổi nó phải sửa bốn helper test và bản giả) và vì nó là trạng thái của tính năng người nói.
5. **Dòng đang nói (ghi chú a của kế hoạch 02):** giữ đúng chữ spec §4.4 và mã của kế hoạch 02: dòng nối tiếp một câu (`extends`) mang giọng của câu đó; lượt nói mới (không `extends`) không có nhãn, không vạch cho tới khi đoạn đóng và có `Assign`. Không đổi cách vẽ khi dòng đang nói thay chỗ câu nó nối tiếp, nên ca thường (cùng người nói tiếp) không nhấp nháy. Ca người khác chen vào trong cửa sổ ghép 700 ms: chữ của người mới hiện tạm dưới màu người cũ cho tới khi câu chốt, rồi tách thành dòng mới có tên đúng, đổi một lần. Bỏ hẳn nhãn ở dòng đang nói thì vạch của câu cũ mất rồi hiện lại ở mỗi lần nối tiếp (nhấp nháy ở ca thường), nên không chọn.
6. **Câu chưa xác định (không nhãn) chen giữa hai câu cùng giọng:** câu sau lặp lại tên (coi là dòng đầu lượt mới). Thà lặp tên còn hơn để người đọc đoán câu chưa xác định thuộc ai.
7. **Khoảng lề của vạch màu:** khi bảng giọng có ít nhất một giọng, thanh phụ đề chừa lề trái bằng vạch cho mọi dòng (lớp `has-speakers` ở vùng chữ), để câu chưa xác định thẳng hàng với câu có vạch. Chữ dịch sang phải một lần khi giọng đầu tiên xuất hiện; tính năng tắt thì không có lớp này, thanh như hiện nay.
8. **Tắt "Phân biệt người nói" giữa phiên thì dừng nhận giọng ngay** (ưu tiên 3: người dùng tắt thì không còn phân tích giọng): thêm `SpeakerHandle::stop()` ở `pipeline::speaker_client` (cùng cờ dừng mà phiên dừng dùng; worker nhận `Shutdown`, không chạy lại), app giữ handle của phiên (`speaker::Running`), bỏ bảng người nói và phát bảng rỗng, giao diện thôi vẽ nhãn ngay. **Bật lại giữa phiên thì có tác dụng từ phiên sau** (engine chỉ nhận `SpeakerLink` lúc bắt đầu phiên; nối worker giữa phiên phải đổi engine, không đáng ở 03).
9. **Công tắc nội bộ vẫn quyết cuối cùng tới kế hoạch 07.** Hai khóa cài đặt `speakerDiarization`, `speakerNames` mặc định `true` (spec §8.3, §9) được ghi vào file cài đặt của mọi bản; nhận giọng chạy khi `speaker::active(settings) = speaker::enabled() && settings.speaker_diarization` (`enabled()` vẫn là cờ dev ở bản debug, `false` ở bản phát hành). **Nhóm "Người nói" ở Cài đặt › Phụ đề chỉ hiện khi `AppInfo.speakerAvailable` (= `enabled()`)**: bản phát hành không hiện gì mới. Lý do: hiện công tắc mà bật không có tác dụng là nói sai với người dùng; còn khóa mặc định `true` đã nằm sẵn trong file để kế hoạch 07 chỉ cần mở `enabled()` là "bật sẵn" (QĐ 4 của kế hoạch 02). Cổng `no-dev-gate` không đổi (không thêm chuỗi dev nào). **Bản phát hành vẫn có, nhưng vô hại:** ba lệnh IPC mới được đăng ký và cấp (`rename_speaker`, `merge_speakers` cho cửa sổ chính, `open_speaker_settings` cho thanh phụ đề; gọi khi không có phiên nhận giọng thì trả `speakerNotFound` hay chỉ mở Cài đặt); trường mới trong IPC (`Transcript.speakers` rỗng, `Transcript.speakersRev`, `ModelsView.speaker` = `unavailable`, `AppInfo.speakerAvailable` = `false`, `Navigate.focus`); hai khóa cài đặt mới trong file; migration số 2 của Lịch sử (QĐ 19). "Xóa toàn bộ dữ liệu" chỉ phát `speaker://roster` khi phiên có giọng (`speaker::emit_roster`), nên bản phát hành không phát sự kiện mới nào.
10. **Đổi tên, gộp chỉ khi phiên đang chạy.** Phiên vừa dừng và Lịch sử chỉ đọc (spec §8.2 nói Lịch sử không sửa được; Lịch sử ghi lúc dừng phiên nên sửa phiên vừa dừng sẽ làm bản chép lời lệch Lịch sử). Lệnh trả `speakerNotFound` khi phiên đã dừng hay giọng không còn.
11. **Tên đổi tay:** bỏ ký tự điều khiển (xuống dòng, tab: tên đi vào TXT, SRT, Markdown) và mọi ký tự định dạng không có hình của nhóm Unicode Cf (`is_hidden_format`: điều khiển hướng chữ U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069; ký tự rộng 0 và nối vô hình U+180E, U+200B, U+2060–U+2064, U+FEFF; định dạng cũ U+206A–U+206F; neo chú thích U+FFF9–U+FFFB; gạch nối mềm U+00AD; ký tự tag U+E0001, U+E0020–U+E007F, vốn giấu được cả một đoạn chữ; điều khiển định dạng U+13430–U+1343F, U+1BCA0–U+1BCA3, U+1D173–U+1D17A), **giữ** U+200C (ZWNJ) và U+200D (ZWJ) vì chữ Ba Tư, chữ Ấn và emoji ghép cần chúng, và giữ các ký tự Cf có hình (dấu số Ả Rập U+0600–U+0605, U+06DD, U+070F, U+0890–U+0891, U+08E2; dấu số Kaithi U+110BD, U+110CD). Bỏ tag thì cờ vùng (cờ Anh, Scotland, Wales) chỉ còn lá cờ đen 🏴: chấp nhận, vì tên dài tối đa 40 ký tự và chữ giấu bằng tag đi được vào file xuất; gộp khoảng trắng, cắt hai đầu, tối đa 40 ký tự (đếm ký tự, ô nhập `maxLength=40`); để trống rồi Lưu là trở về tên tự động. Đổi tên giọng đã gộp là đổi tên giọng đích. Chọn người trong danh sách tham dự là đổi tên bằng tên đó (nguồn `user`, thắng tên tự động như spec §6.6), qua cùng `clean_name` (tên người tham dự là tên người khác tự đặt). Giao diện còn bọc tên chèn vào câu (tiêu đề "Đổi tên “…”", nhãn cho trình đọc màn hình) bằng FSI…PDI (`isolateName`) và đặt `unicode-bidi: isolate` cho chỗ hiện tên.
12. **Lịch sử:** lưu nhãn lúc dừng phiên (đúng chỗ `history::save_if_enabled` đang chạy), tức sau mọi lần đổi tên, gộp (spec §9). Đọc lại thành bảng cố định (`VoiceView::saved`: màu theo thứ tự nhãn xuất hiện trong phiên đã lưu, nguồn `user`); hai giọng đặt trùng tên thì Lịch sử coi là một người.
13. **Sao chép (TXT, mọi gói) có nhãn như file TXT.** Nhãn đã hiện trên màn hình ở mọi gói; "tên người nói trong Lịch sử và file xuất đi theo Pro" (spec §1) giữ đúng vì Lịch sử và xuất file vốn là Pro. Chờ chủ dự án xác nhận (mục cuối).
14. **SRT:** ô "Thêm tên người nói" chỉ hiện khi bản chép lời có nhãn, mặc định tắt (file SRT như trước khi không chọn). TXT và Markdown luôn có nhãn khi có.
15. **Ghi chú (b) — tải model nhận giọng giữ khóa bảo trì:** kế hoạch 03 làm phần nhìn thấy: `ModelsView.speaker` (`unavailable` / `missing` / `downloading` / `ready`), Cài đặt › Phụ đề › Người nói ghi "đang tải" (spec §4.5) và Cài đặt › Model ghi "đang tải dữ liệu nhận giọng; tải, xóa, kiểm gói phải chờ", để lỗi `modelsBusy` có lý do nhìn thấy. **Gốc rễ (giữ khóa suốt lúc tải) và ghi chú (d) "tải cùng gói" để kế hoạch 07**, cùng lúc đăng model, mục `speaker` của `models.json` và `pnpm models:update`: trước 07 không manifest nào có mục `speaker` nên không có đường tải thật để thử, và đưa model vào job tải gói đổi cách tính "gói đủ chưa" / "có bản cập nhật" của mọi người dùng, phải chốt cùng bản manifest đăng lên. Trong lúc đó tính năng chỉ chạy ở bản dev (model của thư mục model dev, không qua tải).
16. **Ghi chú (c) — bấm Dừng mất nhãn của vài đoạn cuối:** chấp nhận (ưu tiên 1: phiên không chờ worker). Các câu đó không nhãn trong bản chép lời, Lịch sử và file xuất.
17. **Nút "Mở Cài đặt" của dòng mời cuộn tới nhóm Người nói:** `events::Navigate` thêm `focus: Option<&'static str>` (bỏ khỏi JSON khi `None`, sự kiện cũ không đổi), app store nhớ `settingsFocus`, Cài đặt › Phụ đề cuộn tới `#speaker-settings` rồi quên.
18. **"Xóa toàn bộ dữ liệu" giữa phiên:** bỏ tên người dùng gõ và các lần gộp (giữ số thứ tự, màu), phát lại bảng.
19. **Migration của Lịch sử chạy ở mọi bản**, kể cả bản phát hành chưa bật tính năng: cột rỗng được, câu cũ đọc như trước. App ≤ 0.3.1 gặp DB phiên bản 2 thì từ chối mở như mọi lần nâng schema (`db.rs` `Newer`); app không tự hạ phiên bản. Bản dev (debug) dùng file DB riêng `data-dev.db` nên không nâng DB của app đã cài trên máy chủ dự án: xem QĐ 22.
20. **Menu của nhãn là popover trong dòng** (định vị tuyệt đối dưới nhãn), `.transcript` bỏ `overflow: hidden` để menu của dòng cuối không bị cắt. Không có thao tác "tách" giọng (spec không có; rủi ro ở spec §14). **Bấm ra ngoài đóng menu ở `click`, không ở `mousedown`** (rà soát lần 2, B-Q-mới 2): menu của dòng gần cuối kéo dài vùng cuộn; đóng lúc nhấn làm vùng cuộn co lại và kẹp vị trí cuộn, nội dung dịch đi dưới con trỏ trước lúc thả, nên cú bấm vào nhãn dòng khác hay nút Xuất… bị mất. Đóng ở `click` (listener capture trên `document`) thì cú bấm tới đúng nút trước, menu gỡ sau; cú nhấn bắt đầu trong menu (kéo chọn chữ trong ô tên) và cú bấm lại chính nhãn không đóng menu ở đó. **Chỉ trả focus về nhãn khi đóng bằng Esc (focus đang trong menu), Lưu, chọn người hay gộp**, với `focus({ preventScroll: true })`; đóng bằng chuột thì để focus ở nơi trình duyệt đặt. Esc lúc bộ gõ đang ghép chữ (Nhật, Trung, Hàn) chỉ hủy chữ đang ghép, Enter kết thúc ghép chữ không gửi tên: phím bộ gõ là `isComposing` hay `keyCode` 229 (WebKit gửi phím kết thúc ghép chữ với `isComposing` false; rà soát lần 3). Cú nhấn bắt đầu trong menu được ghi lại ở mỗi `mousedown` và chỉ dùng cho `click` từ chuột (`detail > 0`): nhấn trong menu rồi thả ngoài cửa sổ (không có `click`) không làm cú bấm ra ngoài kế tiếp bị bỏ qua, kể cả khi đó là `click` từ bàn phím (rà soát lần 3). Không đặt lại ở `mouseup` (`click` tới sau `mouseup` và cần thông tin đó) hay `blur` của cửa sổ (thừa: cú bấm chuột nào cũng có `mousedown` đi trước). Logic này nằm trong hàm thuần `dismissal` (03b Task 18) để test trong Node. **Mở menu thì cuộn khung vừa đủ để thấy trọn menu** (nghiệm thu Task 21): sau `focus()` ô tên, `revealMenu` gọi `scrollIntoView({ block: "nearest" })` trên menu; ở cửa sổ 960×640 nhãn dòng thứ tư đã nằm trong khung nên `focus()` không cuộn, nửa dưới menu (cả mục "Gộp vào người khác ▸") ra ngoài mép cửa sổ. Vùng cuộn thật là khung `.content`; `nearest` không cuộn khi đã thấy trọn, không canh giữa làm nội dung nhảy, và không đụng việc trả focus (`preventScroll: true`, giữ nguyên) hay `dismissal`. Màn hình `transcript-speakers-menu` (nhãn dòng 4) và `transcript-speakers-menu-last` (nhãn dòng cuối) của `check-i18n` đo bằng DOM thật. **Sửa sau thử app dev thật (03b Task 23, ảnh `m9d-*`): menu đặt theo chỗ trống, lật lên khi thiếu chỗ dưới mà đủ chỗ trên** (`.speaker-menu.up`; hàm thuần `menuPlacement`, `menuScroll`, đo trong `useLayoutEffect` lúc mở và mỗi khi menu đổi chiều cao, như khi bung "Gộp vào người khác ▸"); thiếu cả hai phía thì mở xuống và đặt `scrollTop` của đúng khung cuộn. `scrollIntoView` không đáng tin ở WKWebView thật (và trước đây không chạy lại khi bung danh sách gộp, nên danh sách nằm dưới mép khung), nên `revealMenu` chỉ còn là dự phòng khi đặt `scrollTop` không làm khung nhúc nhích; các màn hình `transcript-speakers-menu-noscroll*`, `-merge*` của `check-i18n` kiểm khi `scrollIntoView` bị vô hiệu hóa.
21. **Không chụp lại ảnh website** (`scripts/ui-preview/shoot.mjs`): tính năng chưa phát hành. Trang xem trước có tham số mới `speakers=1` (mặc định không đổi gì), chỉ `check-i18n.mjs` dùng.
22. **Bản dev (debug) dùng file DB riêng `data-dev.db`; app đã cài không bị đụng. ĐÃ QUYẾT 2026-10-27** (mục 10 của "Điều cần chủ dự án quyết"), **làm ở Task 0b, trước Task 1.** Bản dev ký bằng đúng `identifier` của bản phát hành (`src-tauri/tauri.conf.json:5` `com.aitranslator.desktop`; `scripts/run-dev-app.sh` dòng 29, 48, 60), nên có cùng `app_local_data_dir` (`db.rs` `install`) và cùng kho khóa với app đã cài (mục `db-key`). Trước Task 0b nó dùng cả cùng `data.db` và cùng `db-key`: lần đầu bản dev của nhánh mở DB (gói Pro: ngay khi bấm Bắt đầu, vì `glossary::reload` đọc DB), migration số 2 sẽ nâng DB thật lên `user_version = 2`; sau đó app đã cài (0.3.1 và mọi bản từ `main` trước khi 03 được phát hành) gặp `DbError::Newer(2)`: từ điển thuật ngữ rỗng lặng lẽ (`glossary.rs:317-320`), Lịch sử của mọi phiên mới không được lưu (`history.rs:186-190` chỉ ghi log), màn hình Lịch sử báo `dataUnavailable`; nếu `main` thêm migration số 2 của riêng nó trước khi nhánh được gộp, DB đã bị nâng sẽ bỏ qua migration đó. Từ Task 0b, `db::DB_FILE = db::db_file_name(cfg!(debug_assertions))`: bản debug dùng `data-dev.db` (journal `data-dev.db-journal`, bản không đọc được `data-dev.db.unreadable-*`), bản phát hành giữ đúng `data.db`; thư mục dữ liệu và quyền hệ thống (TCC) vẫn dùng chung. **Khóa cũng tách (bổ sung 2026-10-27, cùng Task 0b):** `db::KEY_NAME = db::key_name(cfg!(debug_assertions))`: bản debug dùng mục khóa `db-key-dev`, bản phát hành giữ `db-key`; các mục khác của kho khóa (bản quyền, bộ đếm hạn mức, dấu di trú) vẫn dùng chung. Bản dev không mở, không nâng, không đổi tên, không xóa `data.db` của app đã cài, và không đọc, ghi, xóa mục `db-key`, cả khi "Xóa toàn bộ dữ liệu" (test `a_debug_build_leaves_the_installed_apps_files_alone`, `a_debug_build_leaves_the_installed_apps_key_alone`). **Lịch sử và từ điển của bản dev tách riêng và bắt đầu rỗng** (không chép dữ liệu thật sang). Hai đoạn lệnh sao lưu, khôi phục của 03b Task 23 giữ làm bảo hiểm phụ với kỳ vọng mới: sau khi thử, `data.db` của app đã cài không đổi byte (`cmp` với bản sao lưu) và có `data-dev.db` mới; `data.db` đổi thì dừng và khôi phục theo đúng quy trình cũ, **không bao giờ xóa DB trước khi có bản chép đã kiểm** (rà soát lần 2, A-Q1): Step 1 so từng file bằng `cmp` và ghi đường dẫn thư mục sao lưu vào file cố định `$DATA/db-backup-dang-dung.txt` (còn file đó thì từ chối sao lưu đè); bước khôi phục dùng đúng thư mục đó, dừng khi bản dev hay app đã cài còn chạy, khi thư mục sao lưu không có `data.db`, hay khi có `data.db.unreadable-*` mới; khôi phục bằng chép sang tên tạm, so `cmp`, dời `data.db` đã đổi vào thư mục sao lưu rồi mới đổi tên. **Đã tách cả khóa (`db-key-dev`):** bấm "Xóa toàn bộ dữ liệu" ở bản dev chỉ xóa `data-dev.db` và `db-key-dev`, không còn ảnh hưởng app đã cài (`data.db` và `db-key` giữ nguyên, kể cả Lịch sử). "Xóa model và dữ liệu" ở bản dev làm đúng việc đó và thêm xóa thư mục `models/` dùng chung với app đã cài (tải lại được, không mất Lịch sử). `settings.json` cũng dùng chung nhưng vô hại: app đã cài bỏ qua hai khóa mới và bản dev thêm lại mặc định.
23. **Dòng "Quyền Trợ năng" ở nhóm Người nói chỉ hiện trên macOS khi cả "Phân biệt người nói" và "Lấy tên" bật** (spec §8.3 và mẫu đã duyệt không đặt điều kiện này). Lý do: quyền Trợ năng chỉ dùng để đọc tên; khi không đọc tên thì không mời người dùng cấp một quyền không cần (ưu tiên 3). Gõ dịch vẫn có dòng quyền riêng ở Cài đặt › Gõ dịch.
24. **Chữ của nhãn dạng chip trên nền sáng pha 80% màu giọng với 20% `--text`** (`color: color-mix(in srgb, var(--spk) 80%, var(--text))`, có `color: var(--spk)` dự phòng ngay trước); chấm, vạch, viền và nền nhạt của chip giữ đúng màu spec §8.2. Lý do: chữ ~15 px đậm 600 phải đạt tương phản 4,5:1 (WCAG AA); với đúng màu spec, 6/8 màu không đạt trên nền chip (`#c25e00` 3,83; `#2f8a3b` 3,90; `#9a7a00` 3,67; `#0f8a7e` 3,79; `#1f6fd1` 4,38; `#c93a3a` 4,44). Sau khi pha (tính theo WCAG 2, nền chip = 9% màu giọng trên `#ffffff`): `#1f6fd1` 5,72; `#c25e00` 5,17; `#2f8a3b` 5,21; `#b8378f` 6,09; `#7048c9` 6,75; `#9a7a00` 4,95; `#0f8a7e` 5,07; `#c93a3a` 5,92; khi rê chuột (nền 16%) thấp nhất 4,55 (`#9a7a00`). Nền tối (`--text` = `#e8ecf1`): thấp nhất 6,89 (nền 9%), 5,99 (nền 16%). Đây là **lệch nhỏ so với mẫu đã duyệt** (chữ hơi đậm màu hơn), ghi ở mục 11 của "Điều cần chủ dự án quyết". `color-mix` đã có sẵn trong `main.css` (dòng 769, 884, 900…) nên WebView của app đã hỗ trợ (macOS 14 có Safari 17; WebView2 hiện hành).
25. **Bảng người nói có số thứ tự `rev` và được tính trong một lần khóa.** `TranscriptStore` tăng `rev` (không đặt lại giữa các phiên, giữ như `ui`) mỗi lần dựng `RosterView` để phát hay trả về, và cả khi bảng đổi mà không dựng bảng (`begin`, `clear`, `set_ui_language`; rà soát lần 2, A-N3: không thì bản chụp ngay sau đó có cùng `rev` với bảng cũ còn trên đường tới, và bảng cũ được nhận vì giao diện nhận bảng cùng `rev`); `TranscriptStore::roster` trả luôn bảng mới (`Option<RosterView>`) trong cùng lần khóa nhận bảng giọng của worker. Bảng được phát sau khi nhả khóa, trên luồng phụ đề và luồng chính, nên có thể tới giao diện không theo thứ tự (người dùng đổi tên đúng lúc worker báo giọng mới): giao diện bỏ bảng có `rev` nhỏ hơn bảng đã nhận, nên tên vừa đổi không "quay lại". `Transcript.speakersRev` (= `rev` lúc chụp) để `get_transcript` tới muộn không đè bảng mới hơn. Không phát sự kiện trong lúc giữ khóa (phát qua webview có thể lâu, giữ khóa thì chặn luồng phụ đề).

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `crates/pipeline/src/speaker_client.rs`, `crates/pipeline/tests/speaker_client.rs` | `SpeakerHandle::stop`, `is_stopped` (QĐ 8) |
| Sửa `src-tauri/src/i18n.rs` | chuỗi `speaker_voice` ("Người {n}"…) ở 5 ngôn ngữ |
| Sửa `src/i18n/{en,vi,ja,zh,ko}.ts`; tạo `src/i18n/speakers.test.ts` | 21 khóa mới |
| Tạo `src-tauri/src/transcript/speakers.rs`; sửa `src-tauri/src/transcript/mod.rs` | `SpeakerBook`, `VoiceView`, `RosterView` (có `rev`), `NameSource`, `SpeakerError`, `clean_name` (lọc ký tự định dạng vô hình) |
| Sửa `src-tauri/src/transcript/store.rs` | bảng người nói trong `TranscriptStore`, số thứ tự `rev`, `Transcript.speakers`, `Transcript.speakers_rev`, `speaker_label` |
| Sửa `src-tauri/src/settings/{mod.rs, patch.rs, migrate.rs}` | `speaker_diarization`, `speaker_names` |
| Sửa `src-tauri/src/speaker/mod.rs` | `active`, `Running`, `keep_running`, `session_ended`, `turn_off`, `language_changed`, `emit_roster`, `open_settings`, `rename`, `merge` |
| Sửa `src-tauri/src/{session.rs, actions.rs, events.rs, state.rs, lib.rs, test_support.rs, data.rs}` | nối bảng người nói vào phiên (bắt đầu, `TauriSink`, dừng), cài đặt, sự kiện, `AppInfo.speaker_available`, phát lại bảng sau khi xóa dữ liệu |
| Sửa `src-tauri/src/{commands.rs, errors.rs, acl_tests.rs, build.rs}`, `src-tauri/capabilities/{main,overlay}.json`, `src-tauri/src/{tray.rs, compose/mod.rs}` | `rename_speaker`, `merge_speakers` (main), `open_speaker_settings` (overlay), `Navigate.focus`, `speakerNotFound`, `speakerSame` |
| Sửa `src-tauri/src/db.rs`, `src-tauri/src/transcript/history.rs` | migration `speaker TEXT`, lưu và đọc nhãn; tên file `data-dev.db` của bản debug (Task 0b) |
| Sửa `src-tauri/src/{glossary.rs, license/store.rs}`, `.github/workflows/ci.yml` | Task 0b: test, chú thích theo `db::DB_FILE`; bước test bản release thêm `db::` |
| Sửa `src-tauri/src/transcript/export.rs` | nhãn trong TXT, SRT (tùy chọn), Markdown |
| Sửa `src-tauri/src/models/service.rs` | `ModelsView.speaker` (`SpeakerModel`), guard `SpeakerDownloading` |
| Sửa `src/lib/{ipc.ts, models.ts, fakeModels.ts}` | kiểu mới |
| Tạo `src/lib/speakers.ts`, `src/lib/speakers.test.ts` | bảng giọng giữ tham chiếu, giọng từng dòng, dòng đầu lượt, biến màu |
| Sửa `src/store/{overlay.ts, overlay.test.ts}` | bảng giọng, nhãn muộn, dòng mời của thanh phụ đề |
| Sửa `src/windows/overlay/{OverlayLine.tsx, LiveLineView.tsx, overlay.tsx, overlay.css}` + test; tạo `src/windows/overlay/{SpeakerAsk.tsx, SpeakerAsk.test.ts}` | vẽ nhãn, vạch, dòng mời |
| Sửa `src/store/{transcript.ts, transcript.test.ts, app.ts, app.test.ts}` | bảng giọng của bản chép lời, đổi tên, gộp, `srtSpeakers`, `settingsFocus` |
| Tạo `src/windows/main/{TranscriptRow.tsx, TranscriptRow.test.ts, SpeakerMenu.tsx, SpeakerMenu.test.ts}`; sửa `src/windows/main/TranscriptView.tsx` | chip, vạch, menu |
| Tạo `src/windows/main/settings/{SpeakerSettings.tsx, SpeakerSettings.test.ts}`; sửa `src/windows/main/settings/{SubtitleSettings.tsx, ModelSettings.tsx}` | nhóm "Người nói", ghi chú tải model |
| Sửa `src/styles/{tokens.css, main.css}` | bảng màu sáng/tối, chip, menu |
| Sửa test có dựng `Subtitle`, `LiveLine`, `Transcript`, `Settings`, `AppInfo`: `src/store/{overlay,transcript,library,app}.test.ts`, `src/lib/subtitleView.test.ts`, `src/windows/overlay/{OverlayLine,LiveLineView}.test.ts` | trường mới |
| Sửa `scripts/ui-preview/{tauri-mock.ts, check-i18n.mjs}` | dữ liệu người nói giả (`speakers=1`, `ask=1`, `speakermodel=`), màn hình và điều kiện kiểm |

---

### Task 0: Mốc ban đầu

**Files:** không

- [ ] **Step 1: Nhánh, trạng thái, đĩa, Node**

Run: `cd $W && git branch --show-current && git log --oneline -1 && git status --short | head && df -k /System/Volumes/Data | tail -1 | awk '{printf "%.1f GiB trống\n", $4/1048576}' && node --version && ls node_modules/.bin/vitest node_modules/.bin/tsc node_modules/.bin/vite`
Expected: `phan-biet-nguoi-noi`; commit mới nhất `7c6af9b9 build(speaker): …`; `git status --short` chỉ có hai file kế hoạch 03, 03b; còn trống ≥ 14 GiB (dưới thì dừng, báo chủ dự án); Node ≥ 24.21.0; ba file có. Thiếu `node_modules` thì **(cần chủ dự án)** chạy `pnpm install --frozen-lockfile` (cần mạng; kiểm đĩa trước).

- [ ] **Step 2: Test Rust của các crate sẽ sửa** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result|FAILED|panicked" ; CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: hai dòng `test result: ok`. Ghi số đạt/bỏ qua vào ghi chú làm việc (không vào repo); mốc đã biết của `meeting-translator --lib`: 865 đạt, 6 bỏ qua (`results/02-tong-hop.md`). Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 3: Test và typecheck giao diện**

Run: `cd $W && node_modules/.bin/vitest run 2>&1 | tail -5 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: `Test Files … passed`, `Tests … passed` (ghi số), rồi `tsc-ok`.

- [ ] **Step 4: Test script phát hành và cổng chống lọt**

Run: `cd $W && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 105` (hay số ghi được), `# fail 0`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short`
Expected: chỉ hai file kế hoạch: `?? docs/superpowers/plans/2026-10-26-phan-biet-nguoi-noi-03-giao-dien-du-lieu.md`, `?? docs/superpowers/plans/2026-10-26-phan-biet-nguoi-noi-03b-giao-dien.md`. Không commit.

---

### Task 0b: Bản debug dùng file DB riêng `data-dev.db` (ĐÃ LÀM 2026-10-27)

Chủ dự án duyệt mục 10 của "Điều cần chủ dự án quyết" (QĐ 22). Làm trước Task 1 để không lần chạy bản dev nào của nhánh nâng `data.db` của app đã cài.

**Files:** sửa `src-tauri/src/db.rs` (`pub const DB_FILE: &str = db_file_name(cfg!(debug_assertions))`, `pub const fn db_file_name(debug: bool) -> &'static str`; tên dự phòng của `log_name`; test `the_file_name_depends_on_the_build`, `debug_builds_use_their_own_file` và `a_debug_build_leaves_the_installed_apps_files_alone` (chỉ bản debug), `release_builds_keep_data_db` (chỉ bản release); **bổ sung cùng ngày, tách cả khóa:** `pub const KEY_NAME: &str = key_name(cfg!(debug_assertions))`, `pub const fn key_name(debug: bool) -> &'static str` (`db-key-dev` ở bản debug, `db-key` ở bản phát hành), test `the_key_name_depends_on_the_build`, `debug_builds_use_their_own_key` và `a_debug_build_leaves_the_installed_apps_key_alone` (chỉ bản debug), `release_builds_keep_db_key` (chỉ bản release)); `src-tauri/src/{glossary.rs, transcript/history.rs}` (test mở DB tạm bằng `db::DB_FILE`); `src-tauri/src/license/store.rs` (chú thích); `.github/workflows/ci.yml` (thêm `db::` vào bước test bản release, nhờ đó `release_builds_keep_data_db` và `release_builds_keep_db_key` chạy ở CI; `release.yml` không đổi).

- [x] **Mốc kiểm:** `cargo test -p meeting-translator --lib`: 871 đạt, 6 bỏ qua (mốc Task 0 cộng 3 test của bản debug cộng 3 test tách khóa; đây là mốc cho các Task sau); clippy, fmt, `scripts/check-windows.sh` sạch. Không commit.

---

### Task 1: `SpeakerHandle::stop`: dừng nhận giọng giữa phiên

**Files:**
- Modify: `crates/pipeline/src/speaker_client.rs:133-175` (kiểu `SpeakerHandle`), `:188-204` (hàm `start`)
- Test: `crates/pipeline/tests/speaker_client.rs` (thêm cuối file)

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `crates/pipeline/tests/speaker_client.rs`:

```rust
/// Kế hoạch 03 (QĐ 8): người dùng tắt "Phân biệt người nói" giữa phiên thì app dừng worker ngay qua `SpeakerHandle::stop`, như khi
/// phiên dừng: client thoát (luồng VAD thấy kênh đóng), worker không chạy lại, và đây không phải lỗi (`disabled` vẫn `None`).
#[test]
fn stop_from_the_handle_ends_the_worker_for_the_rest_of_the_session() {
    let f = Fixture::new("handle-stop", &["ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    assert!(!handle.is_stopped());
    let probe = link.segments.clone();
    handle.stop();
    assert!(handle.is_stopped());
    wait_until("client thoát", || {
        matches!(probe.try_send(segment(9, 0, 1_000)), Err(TrySendError::Disconnected(_)))
    });
    wait_until("worker thoát", || handle.pid().is_none());
    assert_eq!(handle.starts(), 1, "không chạy lại");
    assert_eq!(handle.disabled(), None, "dừng theo yêu cầu không phải lỗi");
    drop(link);
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p pipeline --test speaker_client -- stop_from_the_handle 2>&1 | grep -E "error\[|no method" | head -3`
Expected: `` error[E0599]: no method named `is_stopped` found for struct `SpeakerHandle` `` (và `stop`).

- [ ] **Step 3: Cài đặt**

Trong `crates/pipeline/src/speaker_client.rs`, thay khối từ dòng chú thích dưới đây tới hết hàm `wait_ready` (dòng 133–155):

```rust
/// Nhìn trạng thái của client từ ngoài (test, `latency-bench`). App không cần nó.
```

bằng:

```rust
/// Nhìn trạng thái của client từ ngoài (test, `latency-bench`), và dừng nó giữa phiên (app: người dùng tắt "Phân biệt người nói",
/// kế hoạch 03).
#[derive(Clone, Default)]
pub struct SpeakerHandle {
    shared: Arc<(Mutex<State>, Condvar)>,
    /// Cùng cờ với `StopOnDrop` của `SpeakerLink`: đặt thì luồng giám sát tắt worker và thoát.
    stop: Arc<AtomicBool>,
}

impl SpeakerHandle {
    fn update(&self, f: impl FnOnce(&mut State)) {
        let (m, cv) = &*self.shared;
        f(&mut m.lock().unwrap_or_else(|e| e.into_inner()));
        cv.notify_all();
    }

    fn get<T>(&self, f: impl FnOnce(&State) -> T) -> T {
        f(&self.shared.0.lock().unwrap_or_else(|e| e.into_inner()))
    }

    /// Dừng worker ngay và không chạy lại tới hết phiên, như khi phiên dừng (worker nhận `Shutdown`, luồng VAD thấy kênh đóng rồi
    /// thôi gửi đoạn). Không chờ. Phụ đề không bị ảnh hưởng: đoạn còn chờ nhãn thì không có nhãn.
    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    /// Đã gọi [`Self::stop`] chưa (test).
    pub fn is_stopped(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }

    /// Chờ worker sẵn sàng (hay client tắt) tối đa `timeout`; `true` khi đang sẵn sàng.
    pub fn wait_ready(&self, timeout: Duration) -> bool {
        let (m, cv) = &*self.shared;
        let guard = m.lock().unwrap_or_else(|e| e.into_inner());
        let (guard, _) = cv
            .wait_timeout_while(guard, timeout, |s| !s.ready && s.disabled.is_none())
            .unwrap_or_else(|e| e.into_inner());
        guard.ready && guard.disabled.is_none()
    }
```

Trong hàm `start` (dòng 188–191), thay hai dòng

```rust
    let stop = Arc::new(AtomicBool::new(false));
    let handle = SpeakerHandle::default();
```

bằng

```rust
    let handle = SpeakerHandle::default();
    let stop = handle.stop.clone();
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (mọi test của file, kể cả test mới; test thời gian chập chờn thì chạy lại với `-- --test-threads=1` trước khi kết luận).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy -p pipeline --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p pipeline && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p pipeline -- --check && git status --short`
Expected: `Finished …` không cảnh báo; `cargo fmt` có thể sửa cách xuống dòng, `--check` sau đó không in gì; `git status` có thêm `M crates/pipeline/src/speaker_client.rs`, `M crates/pipeline/tests/speaker_client.rs`. Không commit.

---

### Task 2: Chữ mới ở 5 ngôn ngữ

Mọi chữ mới của kế hoạch này vào một lần, để các Task sau biên dịch được (kiểu `MessageKey` lấy từ `en.ts`; `vi/ja/zh/ko` là `Record<MessageKey, string>`). Bản dịch ja/zh/ko theo bảng thuật ngữ đang có: "Quyền Trợ năng" = `アクセシビリティ` / `辅助功能` / `손쉬운 사용`; "Gõ dịch" = `入力翻訳` / `输入翻译` / `입력 번역`; "phiên" = `セッション` / `会话` / `세션`; "tải" = `ダウンロード` / `下载` / `다운로드`. Tiếng Trung giản thể (test chặn chữ phồn thể).

**Files:**
- Modify: `src/i18n/en.ts:609` (sau dòng `"error.updateBusy": …`), `src/i18n/vi.ts:609`, `src/i18n/ja.ts:610`, `src/i18n/zh.ts:610`, `src/i18n/ko.ts:610`
- Modify: `src-tauri/src/i18n.rs` (trường `speaker_voice`)
- Test: tạo `src/i18n/speakers.test.ts`; thêm test vào `src-tauri/src/i18n.rs`

- [ ] **Step 1: Viết test đỏ (giao diện)**

Tạo `src/i18n/speakers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { translate, UI_LANGUAGES, type UiLanguage } from "./index";

// Chữ của "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §8). Lời giải thích của "Lấy tên" nhắc đúng nhãn tự động mà
// phía Rust tính (`speaker_voice` ở src-tauri/src/i18n.rs): sửa một nơi thì sửa nơi kia.
const AUTO_LABEL: Record<UiLanguage, string> = { en: "Speaker 1", vi: "Người 1", ja: "話者1", zh: "说话人1", ko: "화자 1" };

describe("chữ của người nói", () => {
  it("lời giải thích của Lấy tên ghi đúng nhãn tự động của từng ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) {
      expect(translate(lang, "settings.speakers.names.hint"), lang).toContain(AUTO_LABEL[lang]);
    }
  });

  it("tên Teams, Meet, Zoom giữ nguyên ở mọi ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) {
      for (const app of ["Teams", "Meet", "Zoom"]) {
        expect(translate(lang, "settings.speakers.names"), `${lang} ${app}`).toContain(app);
        expect(translate(lang, "settings.speakers.names.hint"), `${lang} ${app}`).toContain(app);
      }
    }
  });

  it("đổi tên và menu điền đúng tên người nói", () => {
    for (const lang of UI_LANGUAGES) {
      expect(translate(lang, "transcript.speaker.rename", { name: "Lan" }), lang).toContain("Lan");
      expect(translate(lang, "transcript.speaker.menu", { name: "Lan" }), lang).toContain("Lan");
    }
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && node_modules/.bin/vitest run src/i18n/speakers.test.ts 2>&1 | tail -4`
Expected: `3 failed` (khóa chưa có, `translate` trả `undefined`).

- [ ] **Step 3: Thêm khóa vào `en.ts`**

Trong `src/i18n/en.ts`, thay dòng cuối

```ts
  "error.updateBusy": "Translation or a model download is running. Stop it, then restart to update.",
} as const;
```

bằng

```ts
  "error.updateBusy": "Translation or a model download is running. Stop it, then restart to update.",

  // Phân biệt người nói (spec 2026-10-26-phan-biet-nguoi-noi §8).
  "overlay.speakers.ask": "Allow Accessibility access to show speaker names",
  "overlay.speakers.dismiss": "Hide until this session ends",
  "transcript.speaker.menu": "Speaker {name}: rename or merge",
  "transcript.speaker.rename": "Rename “{name}”",
  "transcript.speaker.rename.placeholder": "Speaker name",
  "transcript.speaker.rename.save": "Save",
  "transcript.speaker.participants": "Pick someone from the meeting",
  "transcript.speaker.merge": "Merge into another speaker",
  "transcript.export.srtSpeakers": "Add speaker names",
  "settings.speakers.title": "Speakers",
  "settings.speakers.diarization": "Tell speakers apart",
  "settings.speakers.diarization.hint": "Each person gets a color in the subtitles. Voices are told apart on this computer only; nothing is stored or sent, and it is cleared when the session ends.",
  "settings.speakers.names": "Get names from Teams, Meet, Zoom",
  "settings.speakers.names.hint": "Shows who is speaking, read from the meeting window (Teams and Zoom desktop apps, Meet in Chrome or Edge). Chat is never read and the screen is never captured. Until a name can be read, “Speaker 1”, “Speaker 2” are shown.",
  "settings.speakers.permission.granted": "Granted (shared with Type & Translate).",
  "settings.speakers.permission.missing": "Not granted. Needed to read names in the meeting window (shared with Type & Translate). If you turned it on before and it still shows as not granted (usually after an update), the button clears the old permission so you can turn it on once more.",
  "settings.speakers.model.downloading": "Downloading voice data. Speakers are told apart from the next session after it finishes.",
  "settings.speakers.model.missing": "Voice data is not downloaded yet. The app downloads it when you start translating.",
  "settings.model.speakerDownloading": "Downloading voice data for telling speakers apart. Downloading, deleting or checking models waits until it finishes.",
  "error.speakerNotFound": "This speaker can no longer be changed: the session has stopped or the speaker is gone.",
  "error.speakerSame": "A speaker cannot be merged into themselves.",
} as const;
```

- [ ] **Step 4: Thêm khóa vào `vi.ts`**

Trong `src/i18n/vi.ts`, thay

```ts
  "error.updateBusy": "Đang dịch hay đang tải model. Dừng việc đó rồi khởi động lại để cập nhật.",
};
```

bằng

```ts
  "error.updateBusy": "Đang dịch hay đang tải model. Dừng việc đó rồi khởi động lại để cập nhật.",

  "overlay.speakers.ask": "Cho phép quyền Trợ năng để hiện tên người nói",
  "overlay.speakers.dismiss": "Ẩn tới hết phiên",
  "transcript.speaker.menu": "Người nói {name}: đổi tên hoặc gộp",
  "transcript.speaker.rename": "Đổi tên “{name}”",
  "transcript.speaker.rename.placeholder": "Tên người nói",
  "transcript.speaker.rename.save": "Lưu",
  "transcript.speaker.participants": "Chọn người trong cuộc họp",
  "transcript.speaker.merge": "Gộp vào người khác",
  "transcript.export.srtSpeakers": "Thêm tên người nói",
  "settings.speakers.title": "Người nói",
  "settings.speakers.diarization": "Phân biệt người nói",
  "settings.speakers.diarization.hint": "Mỗi người một màu trên phụ đề. Nhận giọng ngay trên máy; không lưu, không gửi đi, hết phiên thì xóa.",
  "settings.speakers.names": "Lấy tên từ Teams, Meet, Zoom",
  "settings.speakers.names.hint": "Hiện tên người đang nói, đọc từ cửa sổ cuộc họp (Teams và Zoom bản cài, Meet trong Chrome hoặc Edge). Không đọc chat, không chụp màn hình. Chưa đọc được tên thì hiện “Người 1”, “Người 2”.",
  "settings.speakers.permission.granted": "Đã cấp (dùng chung với Gõ dịch).",
  "settings.speakers.permission.missing": "Chưa cấp. Cần để đọc tên trong cửa sổ cuộc họp (dùng chung với Gõ dịch). Nếu trước đó đã bật mà vẫn báo chưa cấp (thường sau khi cập nhật), nút bên cạnh sẽ xóa quyền cũ để bạn bật lại một lần.",
  "settings.speakers.model.downloading": "Đang tải dữ liệu nhận giọng. Tải xong thì từ phiên dịch sau app sẽ phân biệt người nói.",
  "settings.speakers.model.missing": "Chưa có dữ liệu nhận giọng. App tự tải khi bạn bắt đầu dịch.",
  "settings.model.speakerDownloading": "Đang tải dữ liệu nhận giọng người nói. Tải, xóa hay kiểm model sẽ phải chờ tới khi xong.",
  "error.speakerNotFound": "Không đổi được người nói này: phiên đã dừng hoặc người nói không còn trong phiên.",
  "error.speakerSame": "Không gộp được một người vào chính họ.",
};
```

- [ ] **Step 5: Thêm khóa vào `ja.ts`**

Trong `src/i18n/ja.ts`, thay

```ts
  "error.updateBusy": "翻訳またはモデルのダウンロードを実行中です。停止してから、再起動して更新してください。",
};
```

bằng

```ts
  "error.updateBusy": "翻訳またはモデルのダウンロードを実行中です。停止してから、再起動して更新してください。",

  "overlay.speakers.ask": "話者の名前を表示するには、アクセシビリティを許可してください",
  "overlay.speakers.dismiss": "このセッションが終わるまで非表示",
  "transcript.speaker.menu": "話者 {name}：名前の変更または統合",
  "transcript.speaker.rename": "「{name}」の名前を変更",
  "transcript.speaker.rename.placeholder": "話者の名前",
  "transcript.speaker.rename.save": "保存",
  "transcript.speaker.participants": "会議の参加者から選ぶ",
  "transcript.speaker.merge": "別の話者に統合",
  "transcript.export.srtSpeakers": "話者名を付ける",
  "settings.speakers.title": "話者",
  "settings.speakers.diarization": "話者を区別する",
  "settings.speakers.diarization.hint": "字幕で人ごとに色を分けます。声の区別はこのパソコン上だけで行い、保存も送信もせず、セッションが終わると消去します。",
  "settings.speakers.names": "Teams、Meet、Zoom から名前を取得",
  "settings.speakers.names.hint": "会議ウィンドウから話している人の名前を読み取って表示します（インストール版の Teams と Zoom、Chrome または Edge の Meet）。チャットは読まず、画面も撮影しません。名前を読み取れるまでは「話者1」「話者2」と表示します。",
  "settings.speakers.permission.granted": "許可済みです（入力翻訳と共通）。",
  "settings.speakers.permission.missing": "未許可です。会議ウィンドウの名前を読み取るのに必要です（入力翻訳と共通）。以前に許可したのに未許可と表示される場合（多くはアップデート後）、横のボタンで古い許可を消去してから、もう一度許可してください。",
  "settings.speakers.model.downloading": "声の識別データをダウンロード中です。完了すると、次のセッションから話者を区別します。",
  "settings.speakers.model.missing": "声の識別データはまだありません。翻訳を開始するとアプリが自動でダウンロードします。",
  "settings.model.speakerDownloading": "話者を区別するための声のデータをダウンロード中です。モデルのダウンロード、削除、確認は完了まで待機します。",
  "error.speakerNotFound": "この話者は変更できません。セッションが終了したか、話者がいなくなりました。",
  "error.speakerSame": "話者を同じ話者に統合することはできません。",
};
```

- [ ] **Step 6: Thêm khóa vào `zh.ts`**

Trong `src/i18n/zh.ts`, thay

```ts
  "error.updateBusy": "翻译或模型下载正在进行。请先停止，再重启以更新。",
};
```

bằng

```ts
  "error.updateBusy": "翻译或模型下载正在进行。请先停止，再重启以更新。",

  "overlay.speakers.ask": "允许辅助功能权限以显示说话人姓名",
  "overlay.speakers.dismiss": "本次会话结束前不再显示",
  "transcript.speaker.menu": "说话人 {name}：重命名或合并",
  "transcript.speaker.rename": "重命名“{name}”",
  "transcript.speaker.rename.placeholder": "说话人姓名",
  "transcript.speaker.rename.save": "保存",
  "transcript.speaker.participants": "从会议参与者中选择",
  "transcript.speaker.merge": "合并到其他说话人",
  "transcript.export.srtSpeakers": "加上说话人姓名",
  "settings.speakers.title": "说话人",
  "settings.speakers.diarization": "区分说话人",
  "settings.speakers.diarization.hint": "字幕中每个人显示不同颜色。声音只在本机区分，不保存、不发送，会话结束即清除。",
  "settings.speakers.names": "从 Teams、Meet、Zoom 获取姓名",
  "settings.speakers.names.hint": "从会议窗口读取并显示正在说话的人的姓名（安装版 Teams 和 Zoom，Chrome 或 Edge 中的 Meet）。不读取聊天，不截屏。读取到姓名之前显示“说话人1”“说话人2”。",
  "settings.speakers.permission.granted": "已授权（与输入翻译共用）。",
  "settings.speakers.permission.missing": "未授权。读取会议窗口中的姓名需要此权限（与输入翻译共用）。如果之前已开启但仍显示未授权（通常在更新后），旁边的按钮会清除旧的授权，请再开启一次。",
  "settings.speakers.model.downloading": "正在下载声音识别数据。下载完成后，从下次会话开始区分说话人。",
  "settings.speakers.model.missing": "还没有声音识别数据。开始翻译时应用会自动下载。",
  "settings.model.speakerDownloading": "正在下载用于区分说话人的声音数据。下载、删除或检查模型需等到完成。",
  "error.speakerNotFound": "无法更改此说话人：会话已结束，或该说话人已不在会话中。",
  "error.speakerSame": "无法将说话人合并到同一个说话人。",
};
```

- [ ] **Step 7: Thêm khóa vào `ko.ts`**

Trong `src/i18n/ko.ts`, thay

```ts
  "error.updateBusy": "번역 또는 모델 다운로드가 진행 중입니다. 중지한 다음 다시 시작하여 업데이트하세요.",
};
```

bằng

```ts
  "error.updateBusy": "번역 또는 모델 다운로드가 진행 중입니다. 중지한 다음 다시 시작하여 업데이트하세요.",

  "overlay.speakers.ask": "말하는 사람의 이름을 표시하려면 손쉬운 사용 권한을 허용하세요",
  "overlay.speakers.dismiss": "이번 세션이 끝날 때까지 숨기기",
  "transcript.speaker.menu": "화자 {name}: 이름 바꾸기 또는 합치기",
  "transcript.speaker.rename": "“{name}” 이름 바꾸기",
  "transcript.speaker.rename.placeholder": "화자 이름",
  "transcript.speaker.rename.save": "저장",
  "transcript.speaker.participants": "회의 참가자 중에서 선택",
  "transcript.speaker.merge": "다른 화자와 합치기",
  "transcript.export.srtSpeakers": "화자 이름 넣기",
  "settings.speakers.title": "화자",
  "settings.speakers.diarization": "화자 구분",
  "settings.speakers.diarization.hint": "자막에서 사람마다 다른 색으로 표시합니다. 목소리 구분은 이 컴퓨터에서만 하며, 저장하거나 보내지 않고 세션이 끝나면 지웁니다.",
  "settings.speakers.names": "Teams, Meet, Zoom에서 이름 가져오기",
  "settings.speakers.names.hint": "회의 창에서 말하는 사람의 이름을 읽어 표시합니다(설치형 Teams와 Zoom, Chrome 또는 Edge의 Meet). 채팅은 읽지 않으며 화면을 캡처하지 않습니다. 이름을 읽기 전에는 “화자 1”, “화자 2”로 표시합니다.",
  "settings.speakers.permission.granted": "허용되었습니다(입력 번역과 함께 사용).",
  "settings.speakers.permission.missing": "허용되지 않았습니다. 회의 창에서 이름을 읽으려면 필요합니다(입력 번역과 함께 사용). 이전에 허용했는데도 허용되지 않음으로 표시되면(주로 업데이트 후) 옆의 버튼이 이전 권한을 지우니 한 번 더 허용하세요.",
  "settings.speakers.model.downloading": "목소리 구분 데이터를 다운로드하는 중입니다. 완료되면 다음 세션부터 화자를 구분합니다.",
  "settings.speakers.model.missing": "목소리 구분 데이터가 아직 없습니다. 번역을 시작하면 앱이 자동으로 다운로드합니다.",
  "settings.model.speakerDownloading": "화자 구분에 쓰는 목소리 데이터를 다운로드하는 중입니다. 모델 다운로드, 삭제, 확인은 완료될 때까지 기다립니다.",
  "error.speakerNotFound": "이 화자는 바꿀 수 없습니다. 세션이 끝났거나 화자가 더 이상 없습니다.",
  "error.speakerSame": "화자를 같은 화자와 합칠 수 없습니다.",
};
```

- [ ] **Step 8: Chạy, thấy xanh (giao diện)**

Run: `cd $W && node_modules/.bin/vitest run src/i18n 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test của `src/i18n` đạt (gồm `speakers.test.ts`, `dictionaries.test.ts` kiểm đủ khóa, cùng tham số, hệ chữ, giản thể; `i18n.test.ts` kiểm tiếng Việt đã dịch), rồi `tsc-ok`. Test hệ chữ đỏ ở khóa nào thì sửa đúng chuỗi đó (không thêm vào danh sách trừ).

- [ ] **Step 9: Viết test đỏ (phía Rust)**

Trong `src-tauri/src/i18n.rs`, thêm vào cuối `mod tests` (trước `}` cuối file):

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §9: nhãn tự động "Người N" theo ngôn ngữ giao diện. Cùng nhãn với lời giải thích của
    /// "Lấy tên" ở `src/i18n/speakers.test.ts`.
    #[test]
    fn the_automatic_speaker_label_has_its_number() {
        let got: Vec<String> = LANGUAGES
            .iter()
            .map(|(_, s)| s.speaker_voice.replace("{n}", "3"))
            .collect();
        assert_eq!(got, ["Speaker 3", "Người 3", "話者3", "说话人3", "화자 3"]);
    }
```

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- i18n:: 2>&1 | grep -E "error\[|no field" | head -2`
Expected: `` error[E0609]: no field `speaker_voice` on type … ``.

- [ ] **Step 10: Cài đặt (phía Rust)**

Trong `src-tauri/src/i18n.rs`:

1. Sau dòng `    pub export_failed: &'static str,` (dòng 40) thêm:

```rust
    /// Nhãn tự động của một giọng chưa có tên (spec 2026-10-26-phan-biet-nguoi-noi §9): `{n}` là thứ tự xuất hiện trong phiên.
    pub speaker_voice: &'static str,
```

2. Trong năm hằng, sau dòng `export_failed: …,` của từng hằng thêm đúng một dòng:
   - `EN` (sau dòng 66): `    speaker_voice: "Speaker {n}",`
   - `VI` (sau dòng 92): `    speaker_voice: "Người {n}",`
   - `JA` (sau dòng 118): `    speaker_voice: "話者{n}",`
   - `ZH` (sau dòng 144): `    speaker_voice: "说话人{n}",`
   - `KO` (sau dòng 170): `    speaker_voice: "화자 {n}",`

3. Trong `Strings::all`, thêm `speaker_voice,` sau `export_failed,` trong mẫu `let Strings { … } = *self;`, và thêm `("speaker_voice", speaker_voice),` sau `("export_failed", export_failed),` trong `vec![…]`.

- [ ] **Step 11: Chạy, thấy xanh (phía Rust)**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- i18n:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (gồm `every_string_is_filled_in_every_language`, `placeholders_match_english` (`{n}` ở cả năm), `other_languages_are_actually_translated`, `cjk_strings_are_written_in_their_own_script`, test mới).

- [ ] **Step 12: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: `cargo fmt` có thể sửa cách xuống dòng, `--check` sau đó không in gì; thêm `M src-tauri/src/i18n.rs`, `M src/i18n/{en,vi,ja,zh,ko}.ts`, `?? src/i18n/speakers.test.ts`. Không commit.

---

### Task 3: Bảng người nói của phiên (`transcript/speakers.rs`)

Logic thuần, không I/O: thứ tự xuất hiện, nhãn "Người N", chỉ số màu, tên đổi tay, gộp tay, tắt giữa phiên, quên tên khi xóa dữ liệu.

**Files:**
- Create: `src-tauri/src/transcript/speakers.rs`
- Modify: `src-tauri/src/transcript/mod.rs`

- [ ] **Step 1: Viết test đỏ**

Trong `src-tauri/src/transcript/mod.rs`, thay

```rust
pub mod export;
pub mod history;
pub mod store;
```

bằng

```rust
pub mod export;
pub mod history;
pub mod speakers;
pub mod store;
```

Tạo `src-tauri/src/transcript/speakers.rs` chỉ với phần test (phần cài đặt thêm ở Step 3, phía trên):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::{EN, VI};
    use pipeline::subtitle::RosterVoice;

    fn roster(ids: &[u32]) -> Roster {
        Roster {
            voices: ids.iter().map(|&id| RosterVoice { id, room: false }).collect(),
        }
    }

    fn labels(book: &SpeakerBook) -> Vec<(u32, String, u32)> {
        book.view(&VI).voices.into_iter().map(|v| (v.id, v.label, v.color)).collect()
    }

    /// Spec §5.3, §8.1: "Người N" và màu theo thứ tự xuất hiện; giọng thứ 9 quay lại màu đầu; nhãn theo ngôn ngữ giao diện.
    #[test]
    fn voices_are_numbered_and_colored_in_order_of_appearance() {
        let mut book = SpeakerBook::default();
        assert!(book.apply(&roster(&[1, 2])));
        assert_eq!(labels(&book), [(1, "Người 1".into(), 0), (2, "Người 2".into(), 1)]);
        assert!(book.apply(&roster(&(1..=9).collect::<Vec<_>>())));
        assert_eq!(labels(&book)[8], (9, "Người 9".into(), 0), "8 màu rồi quay lại");
        assert_eq!(book.view(&EN).voices[2].label, "Speaker 3");
    }

    /// QĐ 2: worker chạy lại (mã giọng cộng mã lớn nhất đã thấy) hay một mã không bao giờ tới giao diện: số vẫn liền nhau.
    #[test]
    fn the_number_follows_appearance_not_the_voice_id() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[4]));
        book.apply(&roster(&[4, 7]));
        assert_eq!(labels(&book), [(4, "Người 1".into(), 0), (7, "Người 2".into(), 1)]);
    }

    #[test]
    fn the_same_roster_twice_changes_nothing() {
        let mut book = SpeakerBook::default();
        assert!(book.apply(&roster(&[1])));
        assert!(!book.apply(&roster(&[1])), "giao diện không phải vẽ lại");
        assert!(
            book.apply(&Roster {
                voices: vec![RosterVoice { id: 1, room: true }],
            }),
            "giọng trong phòng đổi"
        );
        assert!(book.view(&VI).voices[0].room);
    }

    /// Worker gộp giọng 2 vào 1 (`Merged`): engine đã gắn lại nhãn các câu; giọng 2 rời bảng, số thứ tự không dùng lại.
    #[test]
    fn a_voice_merged_away_by_the_worker_leaves_and_its_number_is_not_reused() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        assert!(book.apply(&roster(&[1])));
        assert_eq!(labels(&book), [(1, "Người 1".into(), 0)]);
        book.apply(&roster(&[1, 3]));
        assert_eq!(labels(&book)[1], (3, "Người 3".into(), 2));
    }

    /// Spec §8.2: đổi tên áp cho mọi câu của giọng; tên người dùng thắng tên tự động; để trống là trở về tên tự động.
    #[test]
    fn renaming_wins_over_the_automatic_label_and_empty_restores_it() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        book.rename(2, "  Hoa\tPhạm ").unwrap();
        let v = &book.view(&VI).voices[1];
        assert_eq!((v.label.as_str(), v.source, v.color), ("Hoa Phạm", NameSource::User, 1));
        book.rename(2, "").unwrap();
        let v = &book.view(&VI).voices[1];
        assert_eq!((v.label.as_str(), v.source), ("Người 2", NameSource::Voice));
    }

    /// QĐ 11: bỏ ký tự điều khiển (tên đi vào TXT, SRT, Markdown), gộp khoảng trắng, tối đa 40 ký tự (không đếm byte).
    #[test]
    fn names_are_cleaned_and_limited_to_40_characters() {
        assert_eq!(clean_name(" Lan \n Nguyễn\u{0007} "), Ok(Some("Lan Nguyễn".into())));
        assert_eq!(clean_name(" \t\n"), Ok(None));
        let forty = "ễ".repeat(40);
        assert_eq!(clean_name(&forty), Ok(Some(forty.clone())));
        assert_eq!(clean_name(&format!("{forty}a")), Err(SpeakerError::TooLong));
    }

    /// QĐ 11: ký tự định dạng không có hình (đảo hướng chữ, rộng 0, gạch nối mềm, tag…) bị bỏ, kể cả trong tên người tham dự do người
    /// khác đặt; ZWNJ, ZWJ và ký tự Cf có hình được giữ.
    #[test]
    fn hidden_format_characters_are_dropped_but_joiners_are_kept() {
        assert_eq!(
            clean_name("\u{202E}Lan\u{2066}Ng\u{200B}uyễn\u{2069}\u{200F}\u{FEFF}\u{00AD}"),
            Ok(Some("LanNguyễn".into()))
        );
        assert_eq!(clean_name("\u{202A}\u{202C}"), Ok(None), "chỉ có ký tự vô hình: như tên rỗng");
        assert_eq!(
            clean_name("\u{180E}A\u{206A}\u{206F}n\u{FFF9}\u{FFFB}\u{E0001}\u{13430}\u{1BCA0}\u{1D173}"),
            Ok(Some("An".into())),
            "phần còn lại của nhóm Cf không có hình (rà soát lần 2, A-N4)"
        );
        // Ký tự tag U+E0020–U+E007F chép được cả một đoạn chữ ASCII mà không nhìn thấy.
        let tagged: String = "Lan"
            .chars()
            .chain("hidden".chars().map(|c| char::from_u32(0xE0000 + u32::from(c)).unwrap()))
            .collect();
        assert_eq!(clean_name(&tagged), Ok(Some("Lan".into())), "chữ giấu bằng tag");
        let ayah = "\u{06DD}\u{0661}";
        assert_eq!(clean_name(ayah), Ok(Some(ayah.into())), "Cf có hình (dấu hết câu kinh, chữ số Ả Rập) được giữ");
        let coder = "👩\u{200D}💻 An";
        assert_eq!(clean_name(coder), Ok(Some(coder.into())), "ZWJ của emoji ghép");
        let persian = "می\u{200C}خواهم";
        assert_eq!(clean_name(persian), Ok(Some(persian.into())), "ZWNJ của chữ Ba Tư");
    }

    /// Spec §5.4, §8.2: gộp tay chỉ đổi cách hiện: giọng 2 hiện như giọng 1 (nhãn, màu); đổi tên giọng 2 là đổi tên giọng 1; gộp
    /// tiếp giọng 1 vào giọng 3 thì giọng 2 cũng theo.
    #[test]
    fn merging_shows_one_voice_as_another() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2, 3]));
        book.merge(2, 1).unwrap();
        let v = book.view(&VI).voices;
        assert_eq!((v[1].label.as_str(), v[1].color, v[1].merged_into), ("Người 1", 0, Some(1)));
        book.rename(2, "Lan").unwrap();
        assert_eq!(book.view(&VI).voices[0].label, "Lan", "đổi tên giọng đã gộp là đổi tên giọng đích");
        book.merge(1, 3).unwrap();
        let v = book.view(&VI).voices;
        assert_eq!(v.iter().map(|x| x.merged_into).collect::<Vec<_>>(), [Some(3), Some(3), None]);
        assert!(v.iter().all(|x| x.label == "Người 3" && x.color == 2), "{v:?}");
    }

    /// Gộp tay 2 vào 1, rồi worker gộp giọng 1 đi (`Merged`, giọng 1 rời bảng): bỏ lần gộp tay đó, giọng 2 hiện lại như chính nó,
    /// không trỏ tới một giọng không còn trong bảng.
    #[test]
    fn a_manual_merge_into_a_voice_the_worker_removed_is_dropped() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2, 3]));
        book.merge(2, 1).unwrap();
        assert!(book.apply(&roster(&[2, 3])));
        let v = book.view(&VI).voices;
        assert_eq!(
            v.iter().map(|x| (x.id, x.label.as_str(), x.merged_into)).collect::<Vec<_>>(),
            [(2, "Người 2", None), (3, "Người 3", None)]
        );
    }

    #[test]
    fn unknown_or_same_voices_are_refused() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        assert_eq!(book.rename(9, "x"), Err(SpeakerError::NotFound));
        assert_eq!(book.merge(1, 9), Err(SpeakerError::NotFound));
        assert_eq!(book.merge(1, 1), Err(SpeakerError::Same));
        book.merge(2, 1).unwrap();
        assert_eq!(book.merge(2, 1), Err(SpeakerError::Same), "đã gộp rồi");
        assert_eq!(book.rename(1, &"a".repeat(41)), Err(SpeakerError::TooLong));
    }

    /// QĐ 8: tắt giữa phiên thì bỏ hết, kể cả tên đã đổi; bảng giọng tới muộn bị bỏ qua.
    #[test]
    fn turning_off_drops_everything_and_ignores_later_rosters() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1]));
        book.rename(1, "Lan").unwrap();
        book.turn_off();
        assert_eq!(book.view(&VI), RosterView::default());
        assert!(book.is_empty());
        assert!(!book.apply(&roster(&[1, 2])));
        assert_eq!(book.rename(1, "Lan"), Err(SpeakerError::NotFound));
    }

    /// QĐ 18: "Xóa toàn bộ dữ liệu" giữa phiên bỏ tên người dùng gõ và các lần gộp; số thứ tự, màu giữ nguyên.
    #[test]
    fn forgetting_names_keeps_numbers_and_colors() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1, 2]));
        book.rename(1, "Lan").unwrap();
        book.merge(2, 1).unwrap();
        book.forget_names();
        assert_eq!(labels(&book), [(1, "Người 1".into(), 0), (2, "Người 2".into(), 1)]);
    }

    /// Spec §9 (cộng `mergedInto`, `askAccess`, `rev` của QĐ 4): tên trường của `speaker://roster`. `rev` do `TranscriptStore` đặt
    /// (QĐ 25); bảng của `SpeakerBook` có `rev` 0.
    #[test]
    fn the_roster_event_has_the_fields_of_the_spec() {
        let mut book = SpeakerBook::default();
        book.apply(&roster(&[1]));
        assert_eq!(
            serde_json::to_value(book.view(&VI)).unwrap(),
            serde_json::json!({
                "voices": [{ "id": 1, "label": "Người 1", "color": 0, "source": "voice", "room": false, "mergedInto": null }],
                "participants": [],
                "askAccess": false,
                "rev": 0
            })
        );
    }

    /// QĐ 12: Lịch sử đọc lại nhãn đã lưu thành một giọng cố định, màu theo thứ tự.
    #[test]
    fn a_saved_label_becomes_a_fixed_voice() {
        let v = VoiceView::saved(10, "Lan".into());
        assert_eq!(
            (v.id, v.label.as_str(), v.color, v.source, v.room, v.merged_into),
            (10, "Lan", 1, NameSource::User, false, None)
        );
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- transcript::speakers 2>&1 | grep -E "^error" | head -3`
Expected: `` error[E0412]: cannot find type `Roster` … `` / `` cannot find type `SpeakerBook` … `` (chưa có phần cài đặt).

- [ ] **Step 3: Cài đặt**

Thêm vào **đầu** `src-tauri/src/transcript/speakers.rs` (trên `#[cfg(test)]`):

```rust
//! Bảng người nói của phiên (spec 2026-10-26-phan-biet-nguoi-noi §8, §9; kế hoạch 03): nhãn "Người N" theo thứ tự xuất hiện, chỉ số
//! màu, tên đổi tay, gộp tay. Chỉ trong RAM, theo phiên (`TranscriptStore`); không có giọng hay dấu vân giọng (spec §5.6, §10). Đổi
//! tên, gộp chỉ đổi cách hiện, không gửi worker (spec §5.4). Tên người dùng gõ không bao giờ vào log hay thông báo lỗi.

use std::collections::BTreeMap;

use pipeline::subtitle::Roster;
use serde::Serialize;

use crate::i18n::Strings;

/// Số màu của bảng (spec §8.1, §8.2): giọng thứ N lấy màu `(N − 1) mod 8`.
pub const PALETTE_SIZE: u32 = 8;
/// Tên dài tối đa, tính theo ký tự (spec §8.2, ô "Đổi tên"; §6.3, tên đọc từ app họp).
pub const MAX_NAME_CHARS: usize = 40;

/// Tên lấy từ đâu (spec §9).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NameSource {
    /// Tên đọc từ app họp (kế hoạch 04).
    Name,
    /// Chưa có tên: "Người N".
    Voice,
    /// Người dùng đổi tên hay chọn từ danh sách người tham dự; nhãn đã lưu ở Lịch sử.
    User,
}

/// Một giọng như giao diện vẽ (`speaker://roster`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceView {
    pub id: u32,
    /// Nhãn đã tính sẵn: tên đổi tay, tên đọc từ app họp, hay "Người N" theo ngôn ngữ giao diện.
    pub label: String,
    /// Chỉ số trong bảng 8 màu (0–7); giao diện chọn mã màu theo nền (QĐ 1).
    pub color: u32,
    pub source: NameSource,
    /// Giọng trong phòng (spec §5.5).
    pub room: bool,
    /// Đã gộp tay vào giọng này: nhãn, màu, nguồn là của giọng đó (QĐ 4).
    pub merged_into: Option<u32>,
}

impl VoiceView {
    /// Nhãn đã lưu ở Lịch sử, đọc lại thành giọng thứ `order` (từ 1) của phiên đó: màu theo thứ tự, nguồn `user` (QĐ 12).
    pub fn saved(order: u32, label: String) -> Self {
        Self {
            id: order,
            label,
            color: (order.max(1) - 1) % PALETTE_SIZE,
            source: NameSource::User,
            room: false,
            merged_into: None,
        }
    }
}

/// Bảng người nói gửi giao diện (`speaker://roster`, spec §9).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterView {
    /// Các giọng đang có trong phiên, theo mã tăng dần (tức thứ tự xuất hiện).
    pub voices: Vec<VoiceView>,
    /// Tên người tham dự đọc được (kế hoạch 04), cho mục "Chọn người trong cuộc họp". Kế hoạch 03: luôn rỗng.
    pub participants: Vec<String>,
    /// Hiện dòng mời cấp quyền Trợ năng trên thanh phụ đề (spec §6.7). Kế hoạch 04 đặt; kế hoạch 03: luôn `false`.
    pub ask_access: bool,
    /// Số thứ tự của bảng (QĐ 25): tăng dần trong lần chạy của app, `TranscriptStore` đặt; giao diện bỏ bảng có `rev` nhỏ hơn bảng đã
    /// nhận. `SpeakerBook::view` để 0.
    pub rev: u64,
}

/// Lỗi của đổi tên, gộp. Thông báo không có tên người.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum SpeakerError {
    #[error("không có giọng này trong phiên đang chạy")]
    NotFound,
    #[error("tên dài quá 40 ký tự")]
    TooLong,
    #[error("gộp một giọng vào chính nó")]
    Same,
}

#[derive(Clone, Debug, Default)]
struct Voice {
    /// Thứ tự xuất hiện trong phiên, từ 1 ("Người N", màu).
    order: u32,
    room: bool,
    /// Còn trong bảng giọng của worker (giọng bị worker gộp đi thì không).
    live: bool,
    user_name: Option<String>,
    /// Tên đọc từ app họp (kế hoạch 04 đặt).
    auto_name: Option<String>,
}

#[derive(Debug, Default)]
pub struct SpeakerBook {
    voices: BTreeMap<u32, Voice>,
    /// Gộp tay: giọng → giọng nó hiện như. Đích luôn là giọng không bị gộp (một bước).
    merged: BTreeMap<u32, u32>,
    participants: Vec<String>,
    ask_access: bool,
    /// Người dùng tắt "Phân biệt người nói" giữa phiên: bỏ mọi bảng giọng tới sau (QĐ 8).
    off: bool,
}

impl SpeakerBook {
    /// Bảng giọng mới của worker (`EventSink::roster`). Giọng mới nhận thứ tự kế tiếp, xét theo mã tăng dần (mã tăng theo thứ tự xuất
    /// hiện). Trả `true` khi giao diện cần vẽ lại.
    pub fn apply(&mut self, roster: &Roster) -> bool {
        if self.off {
            return false;
        }
        let mut incoming = roster.voices.clone();
        incoming.sort_by_key(|v| v.id);
        let mut changed = false;
        for v in &incoming {
            let next = self.voices.len() as u32 + 1;
            let voice = self.voices.entry(v.id).or_insert_with(|| Voice {
                order: next,
                ..Voice::default()
            });
            if !voice.live || voice.room != v.room {
                voice.live = true;
                voice.room = v.room;
                changed = true;
            }
        }
        for (id, voice) in self.voices.iter_mut() {
            if voice.live && !incoming.iter().any(|v| v.id == *id) {
                voice.live = false;
                changed = true;
            }
        }
        // Giọng đích của một lần gộp tay vừa bị worker gộp đi: bỏ lần gộp đó (giọng hiện lại như chính nó), không trỏ tới giọng ma.
        let voices = &self.voices;
        let before = self.merged.len();
        self.merged.retain(|_, into| voices.get(into).is_some_and(|v| v.live));
        changed | (self.merged.len() != before)
    }

    /// Đổi tên giọng `id` (giọng đã gộp thì đổi tên giọng đích); `name` rỗng sau khi làm sạch là trở về tên tự động.
    pub fn rename(&mut self, id: u32, name: &str) -> Result<(), SpeakerError> {
        let root = self.live_root(id)?;
        let name = clean_name(name)?;
        self.voices.get_mut(&root).ok_or(SpeakerError::NotFound)?.user_name = name;
        Ok(())
    }

    /// Gộp tay giọng `from` vào `into`: từ giờ `from` (và mọi giọng đã gộp vào `from`) hiện như `into`.
    pub fn merge(&mut self, from: u32, into: u32) -> Result<(), SpeakerError> {
        let (from, into) = (self.live_root(from)?, self.live_root(into)?);
        if from == into {
            return Err(SpeakerError::Same);
        }
        for target in self.merged.values_mut() {
            if *target == from {
                *target = into;
            }
        }
        self.merged.insert(from, into);
        Ok(())
    }

    /// Người dùng tắt giữa phiên: bỏ hết, kể cả tên đã đổi; bảng giọng tới sau bị bỏ qua tới phiên sau.
    pub fn turn_off(&mut self) {
        *self = SpeakerBook {
            off: true,
            ..SpeakerBook::default()
        };
    }

    /// "Xóa toàn bộ dữ liệu": bỏ tên người dùng gõ và các lần gộp; số thứ tự, màu giữ nguyên.
    pub fn forget_names(&mut self) {
        for voice in self.voices.values_mut() {
            voice.user_name = None;
        }
        self.merged.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.voices.is_empty()
    }

    /// Bảng như giao diện vẽ, nhãn tự động theo `s` (ngôn ngữ giao diện).
    pub fn view(&self, s: &Strings) -> RosterView {
        RosterView {
            voices: self
                .voices
                .iter()
                .filter(|(_, v)| v.live)
                .filter_map(|(&id, _)| self.voice_view(id, s))
                .collect(),
            participants: self.participants.clone(),
            ask_access: self.ask_access,
            rev: 0,
        }
    }

    fn voice_view(&self, id: u32, s: &Strings) -> Option<VoiceView> {
        let root = self.root(id);
        let v = self.voices.get(&root)?;
        let (label, source) = match (&v.user_name, &v.auto_name) {
            (Some(name), _) => (name.clone(), NameSource::User),
            (None, Some(name)) => (name.clone(), NameSource::Name),
            (None, None) => (s.speaker_voice.replace("{n}", &v.order.to_string()), NameSource::Voice),
        };
        Some(VoiceView {
            id,
            label,
            color: (v.order.max(1) - 1) % PALETTE_SIZE,
            source,
            room: v.room,
            merged_into: (root != id).then_some(root),
        })
    }

    /// Giọng `id` hiện như giọng nào (gộp tay một bước).
    fn root(&self, id: u32) -> u32 {
        self.merged.get(&id).copied().unwrap_or(id)
    }

    /// Như [`Self::root`], cho giọng đang có trong phiên; không có (hay đã tắt) thì `NotFound`.
    fn live_root(&self, id: u32) -> Result<u32, SpeakerError> {
        if self.off || !self.voices.get(&id).is_some_and(|v| v.live) {
            return Err(SpeakerError::NotFound);
        }
        Ok(self.root(id))
    }
}

/// Ký tự định dạng không có hình (Unicode Cf) bị bỏ khỏi tên (QĐ 11): điều khiển hướng chữ (U+061C, U+200E, U+200F,
/// U+202A–U+202E, U+2066–U+2069), ký tự rộng 0 và nối vô hình (U+180E, U+200B, U+2060–U+2064, U+FEFF), định dạng cũ đã bỏ
/// (U+206A–U+206F), neo chú thích (U+FFF9–U+FFFB), gạch nối mềm (U+00AD), ký tự tag (U+E0001, U+E0020–U+E007F: giấu được cả một
/// đoạn chữ; cờ vùng như cờ Anh còn lại 🏴), điều khiển định dạng của chữ tượng hình Ai Cập (U+13430–U+1343F), tốc ký Duployan
/// (U+1BCA0–U+1BCA3) và ký hiệu nhạc (U+1D173–U+1D17A). Giữ U+200C (ZWNJ) và U+200D (ZWJ): chữ Ba Tư, chữ Ấn và emoji ghép cần
/// chúng. Các ký tự Cf còn lại có hình (dấu số Ả Rập U+0600–U+0605, U+06DD, U+070F, U+0890–U+0891, U+08E2; dấu số Kaithi U+110BD,
/// U+110CD) nên được giữ.
fn is_hidden_format(c: char) -> bool {
    matches!(
        c,
        '\u{00AD}'
            | '\u{061C}'
            | '\u{180E}'
            | '\u{200B}'
            | '\u{200E}'
            | '\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{206F}'
            | '\u{FEFF}'
            | '\u{FFF9}'..='\u{FFFB}'
            | '\u{13430}'..='\u{1343F}'
            | '\u{1BCA0}'..='\u{1BCA3}'
            | '\u{1D173}'..='\u{1D17A}'
            | '\u{E0001}'
            | '\u{E0020}'..='\u{E007F}'
    )
}

/// Tên người dùng gõ hay chọn từ danh sách người tham dự (QĐ 11): bỏ ký tự định dạng vô hình, bỏ ký tự điều khiển, gộp khoảng trắng,
/// cắt hai đầu. Rỗng thì `None` (trở về tên tự động); dài hơn 40 ký tự thì lỗi (ô nhập đã chặn ở 40). Kế hoạch 04: tên tự động và tên
/// người tham dự cũng phải qua hàm này.
pub fn clean_name(raw: &str) -> Result<Option<String>, SpeakerError> {
    let visible: String = raw.chars().filter(|&c| !is_hidden_format(c)).collect();
    let name = visible
        .split(|c: char| c.is_whitespace() || c.is_control())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(SpeakerError::TooLong);
    }
    Ok((!name.is_empty()).then_some(name))
}

```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- transcript::speakers 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 14 passed`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy -p meeting-translator --lib --tests -- -D warnings 2>&1 | grep -E "^(warning|error)" | head -5 ; CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: không dòng `warning`/`error` (trường `auto_name`, `participants`, `ask_access` chưa ai ghi: nếu clippy báo `dead_code` cho chúng thì thêm `#[allow(dead_code)] // kế hoạch 04 đặt` ngay trên đúng trường đó, không tắt cảnh báo cho cả module); thêm `?? src-tauri/src/transcript/speakers.rs`, `M src-tauri/src/transcript/mod.rs`. Không commit.

---

### Task 4: `TranscriptStore` giữ bảng người nói; `Transcript.speakers`

**Files:**
- Modify: `src-tauri/src/transcript/store.rs` (phần trên `#[cfg(test)]`, và thêm test)
- Modify: `src-tauri/src/transcript/history.rs:158-164, :220-235, :260`, `src-tauri/src/transcript/export.rs:239-259, :302` (thêm `speakers: Vec::new()` vào các chỗ dựng `Transcript`, để còn biên dịch)

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `mod tests` của `src-tauri/src/transcript/store.rs` (trước `}` cuối file):

```rust
    use crate::transcript::speakers::NameSource;

    fn voices(ids: &[u32]) -> Roster {
        Roster {
            voices: ids
                .iter()
                .map(|&id| pipeline::subtitle::RosterVoice { id, room: false })
                .collect(),
        }
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §9: bản chép lời giữ giọng từng câu và bảng người nói của phiên; nhãn tới muộn sửa đúng
    /// câu; sự kiện của phiên khác bị bỏ.
    #[test]
    fn the_transcript_keeps_the_speakers_of_the_session() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.set_ui_language(UiLanguage::Vi);
        store.upsert(1, &sub(1, "Một", Status::Done));
        store.upsert(1, &sub(2, "Hai", Status::Done));
        assert!(store.roster(1, &voices(&[5])).is_some());
        store.set_speaker(1, &SpeakerLabel { id: 2, speaker: Some(5) });
        store.set_speaker(2, &SpeakerLabel { id: 1, speaker: Some(5) });
        assert!(store.roster(2, &voices(&[6])).is_none(), "bảng của phiên khác bị bỏ");
        assert!(store.roster(1, &voices(&[5])).is_none(), "bảng không đổi: không phát lại");
        let t = store.snapshot();
        assert_eq!(t.lines.iter().map(|l| l.speaker).collect::<Vec<_>>(), [None, Some(5)]);
        assert_eq!(t.speakers.len(), 1);
        assert_eq!(t.speaker_label(&t.lines[1]), Some("Người 1"));
        assert_eq!(t.speaker_label(&t.lines[0]), None);
    }

    /// Spec §8.2, QĐ 10: đổi tên, gộp áp cho mọi câu của giọng trong phiên đang chạy; sau khi dừng thì chỉ đọc. Ngôn ngữ giao diện
    /// đổi thì nhãn tự động đổi theo.
    #[test]
    fn renaming_and_merging_work_only_while_the_session_runs() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.set_ui_language(UiLanguage::Vi);
        store.roster(1, &voices(&[1, 2]));
        let view = store.rename_speaker(1, "Lan").unwrap();
        assert_eq!(view.voices[0].label, "Lan");
        let view = store.merge_speakers(2, 1).unwrap();
        assert_eq!((view.voices[1].label.as_str(), view.voices[1].merged_into), ("Lan", Some(1)));
        assert_eq!(store.roster_view().voices, view.voices);
        store.set_ui_language(UiLanguage::En);
        store.rename_speaker(1, "").unwrap();
        assert_eq!(store.roster_view().voices[0].label, "Speaker 1");
        store.end(1, 10).unwrap();
        assert_eq!(store.rename_speaker(1, "Lan"), Err(SpeakerError::NotFound));
        assert_eq!(store.merge_speakers(1, 2), Err(SpeakerError::NotFound));
        assert_eq!(
            TranscriptStore::default().rename_speaker(1, "Lan"),
            Err(SpeakerError::NotFound),
            "chưa có phiên"
        );
    }

    #[test]
    fn a_new_session_forgets_the_speakers_but_keeps_the_ui_language() {
        let store = TranscriptStore::default();
        store.set_ui_language(UiLanguage::Ja);
        store.begin(1, 0, "vi");
        store.roster(1, &voices(&[1]));
        assert!(store.has_speakers());
        store.begin(2, 0, "vi");
        assert!(!store.has_speakers());
        store.roster(2, &voices(&[3]));
        assert_eq!(store.snapshot().speakers[0].label, "話者1");
    }

    /// QĐ 8: tắt "Phân biệt người nói" giữa phiên thì bảng người nói rỗng; câu đã có không còn nhãn (bản chép lời, Lịch sử, file xuất).
    #[test]
    fn turning_speakers_off_drops_the_labels() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.upsert(
            1,
            &Subtitle {
                speaker: Some(1),
                ..sub(1, "Một", Status::Done)
            },
        );
        store.roster(1, &voices(&[1]));
        let off = store.speakers_off();
        assert!(off.voices.is_empty() && off.rev > 0, "{off:?}");
        let t = store.snapshot();
        assert_eq!(t.speaker_label(&t.lines[0]), None);
        assert!(store.roster(1, &voices(&[1, 2])).is_none(), "bảng tới muộn bị bỏ");
    }

    /// QĐ 25: mỗi bảng dựng ra có `rev` lớn hơn bảng trước, kể cả qua phiên mới; bản chụp ghi `rev` của bảng mới nhất đã dựng.
    #[test]
    fn every_roster_gets_a_larger_rev_across_sessions() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        let first = store.roster(1, &voices(&[1])).unwrap();
        let renamed = store.rename_speaker(1, "Lan").unwrap();
        assert!(renamed.rev > first.rev);
        assert_eq!(store.snapshot().speakers_rev, renamed.rev);
        store.begin(2, 0, "vi");
        let next = store.roster(2, &voices(&[4])).unwrap();
        assert!(next.rev > renamed.rev, "không đặt lại giữa các phiên");
    }

    /// QĐ 25, rà soát lần 2 (A-N3): phiên mới, "Xóa toàn bộ dữ liệu" và đổi ngôn ngữ đổi bảng mà không dựng bảng để phát; bản chụp
    /// sau đó phải mới hơn mọi bảng đã phát trước, để bảng cũ tới muộn (cùng `rev` với bản chụp) không đè lên bản chụp.
    #[test]
    fn a_snapshot_after_a_new_session_or_a_clear_is_newer_than_any_roster_sent_before() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        let sent = store.roster(1, &voices(&[1])).unwrap();
        store.begin(2, 0, "vi");
        assert!(store.snapshot().speakers_rev > sent.rev, "phiên mới");
        let sent = store.roster(2, &voices(&[2])).unwrap();
        store.clear();
        assert!(store.snapshot().speakers_rev > sent.rev, "xóa dữ liệu");
        let sent = store.roster_view();
        store.set_ui_language(UiLanguage::En);
        assert!(store.snapshot().speakers_rev > sent.rev, "đổi ngôn ngữ");
    }

    /// QĐ 18: "Xóa toàn bộ dữ liệu" bỏ cả tên người dùng đã gõ.
    #[test]
    fn clear_forgets_the_names_typed_by_the_user() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.roster(1, &voices(&[1]));
        store.rename_speaker(1, "Lan").unwrap();
        store.clear();
        assert_eq!(store.roster_view().voices[0].source, NameSource::Voice);
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- transcript::store 2>&1 | grep -E "^error" | head -3`
Expected: `` error[E0599]: no method named `set_ui_language` … `` (và các hàm mới khác).

- [ ] **Step 3: Cài đặt `store.rs`**

Thay toàn bộ phần trên `#[cfg(test)]` của `src-tauri/src/transcript/store.rs` bằng:

```rust
//! Bản chép lời của phiên, trong bộ nhớ (spec §6.6 "Lưu trữ", F4): mọi phụ đề của phiên đang chạy hoặc phiên vừa dừng,
//! theo đúng luật của thanh phụ đề (`upsert` thay cả đối tượng, `delta` nối chữ dịch, `replaces` xóa phụ đề đã gộp), nhưng
//! không giới hạn số dòng. Cửa sổ chính đọc bản này khi mở màn hình Bản chép lời; khi phiên dừng, app lưu nó vào lịch sử
//! nếu bật "Lưu lịch sử" và đang là Pro (`history.rs`). Phiên mới bắt đầu thì bản cũ bị thay.
//!
//! Bảng người nói của phiên (spec 2026-10-26-phan-biet-nguoi-noi §9, `speakers.rs`) cũng ở đây: giọng từng câu (`Subtitle::speaker`,
//! nhãn tới muộn sửa tại chỗ), nhãn, màu, tên đổi tay, gộp tay. Bản chép lời, Lịch sử và file xuất đọc nhãn từ đây.

use std::collections::BTreeMap;
use std::sync::Mutex;

use pipeline::subtitle::{Delta, Roster, SpeakerLabel, Subtitle};
use serde::Serialize;

use super::speakers::{RosterView, SpeakerBook, SpeakerError, VoiceView};
use crate::i18n::{self, Strings};
use crate::settings::UiLanguage;

/// Bản chép lời của một phiên.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    /// Số của phiên trong lần chạy này của app (`session::Session`); 0 là chưa có phiên nào.
    pub session: u64,
    /// Giờ Unix (ms) lúc bắt đầu phiên. `start_ms`, `end_ms` của từng dòng tính từ mốc này.
    pub started_at: u64,
    /// Giờ Unix (ms) lúc phiên dừng; `None` khi phiên còn chạy.
    pub ended_at: Option<u64>,
    /// Mã ngôn ngữ đích của phiên (`vi`, `en`…).
    pub target_lang: String,
    /// Theo thứ tự `id`, tức thứ tự câu.
    pub lines: Vec<Subtitle>,
    /// Người nói của phiên (spec 2026-10-26-phan-biet-nguoi-noi §9): `lines[i].speaker` là `id` trong danh sách này. Rỗng khi phiên
    /// không có nhận giọng. Lịch sử: dựng lại từ nhãn đã lưu (`VoiceView::saved`).
    pub speakers: Vec<VoiceView>,
    /// `rev` của bảng người nói mới nhất đã dựng lúc chụp (QĐ 25): giao diện không để bản chụp tới muộn đè bảng mới hơn. Lịch sử: 0.
    pub speakers_rev: u64,
}

impl Transcript {
    /// Nhãn người nói của một câu (đã tính đổi tên, gộp); `None` khi chưa xác định hay giọng không có trong bảng.
    pub fn speaker_label(&self, line: &Subtitle) -> Option<&str> {
        let id = line.speaker?;
        self.speakers.iter().find(|v| v.id == id).map(|v| v.label.as_str())
    }
}

#[derive(Default)]
struct Current {
    meta: Transcript,
    lines: BTreeMap<u64, Subtitle>,
    speakers: SpeakerBook,
    /// Ngôn ngữ giao diện cho nhãn "Người N"; `None` là English. Giữ qua các phiên.
    ui: Option<UiLanguage>,
    /// Số thứ tự của bảng người nói (QĐ 25): tăng ở mỗi lần dựng bảng và mỗi lần bảng đổi mà không dựng (phiên mới, xóa dữ liệu,
    /// đổi ngôn ngữ), giữ qua các phiên.
    rev: u64,
}

impl Current {
    fn strings(&self) -> &'static Strings {
        i18n::strings(self.ui.unwrap_or(UiLanguage::En))
    }

    /// Bảng người nói để phát hay trả về: số thứ tự mới, lớn hơn mọi bảng trước.
    fn roster_view(&mut self) -> RosterView {
        self.rev += 1;
        RosterView {
            rev: self.rev,
            ..self.speakers.view(self.strings())
        }
    }

    /// Đổi tên, gộp chỉ trong phiên đang chạy (QĐ 10 của kế hoạch 03): phiên đã dừng đã lưu Lịch sử, Lịch sử chỉ đọc.
    fn running(&self) -> Result<(), SpeakerError> {
        if self.meta.session == 0 || self.meta.ended_at.is_some() {
            return Err(SpeakerError::NotFound);
        }
        Ok(())
    }
}

/// Bản chép lời của phiên hiện tại (hoặc vừa dừng). Quản lý bằng `app.manage`; luồng phụ đề của engine ghi vào, lệnh
/// của giao diện đọc ra.
#[derive(Default)]
pub struct TranscriptStore(Mutex<Current>);

impl TranscriptStore {
    fn lock(&self) -> std::sync::MutexGuard<'_, Current> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Phiên `session` bắt đầu: bỏ bản của phiên trước, cả bảng người nói; giữ ngôn ngữ giao diện; số thứ tự bảng tăng (bảng rỗng
    /// của phiên mới mới hơn mọi bảng của phiên trước, kể cả bảng còn đang trên đường tới giao diện; rà soát lần 2, A-N3).
    pub fn begin(&self, session: u64, started_at: u64, target_lang: &str) {
        let mut current = self.lock();
        let (ui, rev) = (current.ui, current.rev + 1);
        *current = Current {
            meta: Transcript {
                session,
                started_at,
                ended_at: None,
                target_lang: target_lang.to_string(),
                lines: Vec::new(),
                speakers: Vec::new(),
                speakers_rev: 0,
            },
            lines: BTreeMap::new(),
            speakers: SpeakerBook::default(),
            ui,
            rev,
        };
    }

    /// Một `subtitle://upsert` của phiên `session`. Sự kiện của phiên khác (tới muộn) bị bỏ.
    pub fn upsert(&self, session: u64, subtitle: &Subtitle) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        for id in &subtitle.replaces {
            current.lines.remove(id);
        }
        current.lines.insert(subtitle.id, subtitle.clone());
    }

    /// Một `subtitle://delta` của phiên `session`: nối vào chữ dịch của phụ đề cùng `id`.
    pub fn delta(&self, session: u64, delta: &Delta) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        if let Some(line) = current.lines.get_mut(&delta.id) {
            line.tgt_text.push_str(&delta.text);
        }
    }

    /// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker` của phiên `session`): sửa đúng câu đó.
    pub fn set_speaker(&self, session: u64, label: &SpeakerLabel) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        if let Some(line) = current.lines.get_mut(&label.id) {
            line.speaker = label.speaker;
        }
    }

    /// Bảng giọng mới của worker cho phiên `session` (`EventSink::roster`). Trả bảng người nói mới để phát, dựng trong cùng lần khóa
    /// (QĐ 25); `None` khi không có gì đổi hay đó không phải phiên hiện tại.
    pub fn roster(&self, session: u64, roster: &Roster) -> Option<RosterView> {
        let mut current = self.lock();
        (current.meta.session == session && current.speakers.apply(roster)).then(|| current.roster_view())
    }

    /// Bảng người nói hiện có, như giao diện vẽ (`speaker://roster`).
    pub fn roster_view(&self) -> RosterView {
        self.lock().roster_view()
    }

    /// Phiên hiện tại có giọng nào chưa.
    pub fn has_speakers(&self) -> bool {
        !self.lock().speakers.is_empty()
    }

    /// Ngôn ngữ giao diện cho nhãn "Người N": đặt lúc bắt đầu phiên, và khi người dùng đổi ngôn ngữ (`speaker::language_changed`).
    /// Nhãn tự động đổi nên số thứ tự bảng tăng.
    pub fn set_ui_language(&self, lang: UiLanguage) {
        let mut current = self.lock();
        current.ui = Some(lang);
        current.rev += 1;
    }

    /// Đổi tên giọng `id` (spec §8.2). Trả bảng người nói mới để phát.
    pub fn rename_speaker(&self, id: u32, name: &str) -> Result<RosterView, SpeakerError> {
        let mut current = self.lock();
        current.running()?;
        current.speakers.rename(id, name)?;
        Ok(current.roster_view())
    }

    /// Gộp tay giọng `from` vào `into` (spec §5.4, §8.2). Trả bảng người nói mới để phát.
    pub fn merge_speakers(&self, from: u32, into: u32) -> Result<RosterView, SpeakerError> {
        let mut current = self.lock();
        current.running()?;
        current.speakers.merge(from, into)?;
        Ok(current.roster_view())
    }

    /// Người dùng tắt "Phân biệt người nói" (QĐ 8 của kế hoạch 03): bỏ bảng người nói; câu đã có không còn nhãn ở bản chép lời,
    /// Lịch sử, file xuất. Trả bảng rỗng để phát.
    pub fn speakers_off(&self) -> RosterView {
        let mut current = self.lock();
        current.speakers.turn_off();
        current.roster_view()
    }

    /// Phiên `session` dừng lúc `ended_at`. Trả bản chép lời để lưu lịch sử; `None` nếu đó không phải phiên hiện tại hay
    /// đã dừng rồi.
    pub fn end(&self, session: u64, ended_at: u64) -> Option<Transcript> {
        let mut current = self.lock();
        if session == 0 || current.meta.session != session || current.meta.ended_at.is_some() {
            return None;
        }
        current.meta.ended_at = Some(ended_at);
        Some(snapshot(&current))
    }

    /// Bản chép lời hiện có, cho giao diện và để xuất file.
    pub fn snapshot(&self) -> Transcript {
        snapshot(&self.lock())
    }

    /// Xóa toàn bộ dữ liệu (§4.3, Quyền riêng tư): bỏ cả bản chép lời trong bộ nhớ và tên người dùng đã đặt cho người nói (QĐ 18).
    /// Phiên đang chạy vẫn ghi tiếp các câu sau.
    pub fn clear(&self) {
        let mut current = self.lock();
        current.lines.clear();
        current.speakers.forget_names();
        current.rev += 1;
    }
}

fn snapshot(current: &Current) -> Transcript {
    Transcript {
        lines: current.lines.values().cloned().collect(),
        speakers: current.speakers.view(current.strings()).voices,
        speakers_rev: current.rev,
        ..current.meta.clone()
    }
}

```

- [ ] **Step 4: Sửa các chỗ dựng `Transcript` để còn biên dịch**

Trong `src-tauri/src/transcript/history.rs`, hàm `get` (dòng 158–164): thêm `speakers: Vec::new(),` và `speakers_rev: 0,` sau `lines: lines.collect::<Result<_, _>>()?,`; trong test, hàm `transcript` (dòng 221): thêm `speakers: Vec::new(),` và `speakers_rev: 0,` sau khối `lines: vec![…],`. Trong `src-tauri/src/transcript/export.rs`, test `transcript()` (dòng 240): thêm `speakers: Vec::new(),` và `speakers_rev: 0,` sau khối `lines: vec![…],`. (Các chỗ dùng `..transcript()` không cần sửa.)

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- transcript:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (test cũ của `store`, `history`, `export` và 7 test mới của `store`).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy -p meeting-translator --lib --tests -- -D warnings 2>&1 | grep -E "^(warning|error)" | head -5 ; CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: không cảnh báo; thêm `M src-tauri/src/transcript/{store,history,export}.rs`. Không commit.

---

### Task 5: Hai khóa cài đặt `speakerDiarization`, `speakerNames`

**Files:**
- Modify: `src-tauri/src/settings/mod.rs:266` (trường), `:338` (mặc định), test `defaults_follow_spec`, `serializes_with_camel_case_keys_of_spec`
- Test: `src-tauri/src/settings/patch.rs`, `src-tauri/src/settings/migrate.rs`

- [ ] **Step 1: Viết test đỏ**

Trong `src-tauri/src/settings/mod.rs`, test `defaults_follow_spec`: thêm trước dòng `assert_eq!(\n            vi.hotkeys.bindings()…`:

```rust
        assert!(
            vi.speaker_diarization && vi.speaker_names,
            "phân biệt người nói và lấy tên bật sẵn (spec 2026-10-26-phan-biet-nguoi-noi §8.3)"
        );
```

Test `serializes_with_camel_case_keys_of_spec`: thêm `"speakerDiarization",` và `"speakerNames",` sau `"micEndSilenceMs",` trong danh sách khóa.

Trong `src-tauri/src/settings/patch.rs`, thêm sau test `the_live_switch_is_a_boolean`:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §8.3: hai công tắc người nói đổi được từ giao diện, chỉ nhận bool.
    #[test]
    fn the_speaker_switches_are_booleans() {
        let off = apply(&current(), &json!({ "speakerDiarization": false, "speakerNames": false })).unwrap();
        assert!(!off.speaker_diarization && !off.speaker_names);
        assert_eq!(
            apply(&current(), &json!({ "speakerNames": "yes" })),
            Err(Invalid::new("speakerNames", Reason::WrongType))
        );
    }
```

Trong `src-tauri/src/settings/migrate.rs`, thêm sau test `an_old_file_without_the_live_switch_keeps_it_off`:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §8.3, §9: file của bản trước chưa có hai công tắc người nói thì cả hai bật (bật sẵn),
    /// không phải ghi lại file; giá trị đã lưu được giữ.
    #[test]
    fn an_old_file_without_the_speaker_switches_gets_them_on() {
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "theme": "dark" }));
        let loaded = load(raw, defaults());
        assert!(loaded.settings.speaker_diarization && loaded.settings.speaker_names);
        assert!(loaded.rejected.is_empty());
        assert!(!loaded.needs_save(), "khóa thiếu thì không phải ghi lại file");
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "speakerDiarization": false }));
        let loaded = load(raw, defaults());
        assert!(!loaded.settings.speaker_diarization && loaded.settings.speaker_names);
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- settings:: 2>&1 | grep -E "^error" | head -2`
Expected: `` error[E0609]: no field `speaker_diarization` … ``.

- [ ] **Step 3: Cài đặt**

Trong `src-tauri/src/settings/mod.rs`, sau trường `pub translate_while_speaking: bool,` (dòng 266) thêm:

```rust
    /// "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §8.3, §9), mặc định bật. Chỉ có tác dụng khi bản này có tính năng
    /// (`speaker::enabled()`; bản phát hành: tắt tới kế hoạch 07). Tắt giữa phiên thì dừng nhận giọng ngay (`speaker::turn_off`); bật
    /// thì có tác dụng từ phiên sau. File của bản trước chưa có khóa này thì lấy mặc định (`migrate::load`), không cần bước migrate.
    pub speaker_diarization: bool,
    /// "Lấy tên từ Teams, Meet, Zoom" (spec §8.3), mặc định bật; chỉ có nghĩa khi "Phân biệt người nói" bật. Bộ đọc tên: kế hoạch 04.
    pub speaker_names: bool,
```

Trong `Settings::defaults`, sau dòng `translate_while_speaking: false,` (dòng 338) thêm:

```rust
            speaker_diarization: true,
            speaker_names: true,
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- settings:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: `test result: ok` (cả app: không test nào khác so sánh nguyên văn JSON cài đặt; có thì thêm hai khóa vào đúng chỗ đó); thêm `M src-tauri/src/settings/{mod,patch,migrate}.rs`. Không commit.

---

### Task 6: Nối bảng người nói vào phiên; `speaker::active`; tắt giữa phiên; đổi ngôn ngữ

**Files:**
- Modify: `src-tauri/src/speaker/mod.rs` (đầu file, `start_for_session`, hàm mới, test)
- Modify: `src-tauri/src/events.rs:7` (import), `:35` (doc), `:108-111` (`speaker_roster`)
- Modify: `src-tauri/src/session.rs:464-466` (bắt đầu phiên), `:994-1001` (`TauriSink`), `:606` (`stop_engine`), test `speaker_events_reach_both_windows` (dòng 1789–1830)
- Modify: `src-tauri/src/actions.rs:46-49` (`commit_settings`), `src-tauri/src/data.rs:181-183` (`clear_all_data`)
- Modify: `src-tauri/src/state.rs:162-170` (`AppInfo`), `src-tauri/src/commands.rs:85-93` (`get_app_info`), `src-tauri/src/lib.rs:146`, `src-tauri/src/test_support.rs:670`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `mod tests` của `src-tauri/src/speaker/mod.rs`:

```rust
    /// Kế hoạch 03 (QĐ 9): cài đặt "Phân biệt người nói" bật sẵn; tắt thì không phiên nào có nhận giọng; bật thì theo công tắc nội bộ
    /// của bản này (bản phát hành: tắt).
    #[test]
    fn the_settings_switch_only_turns_speaker_off() {
        let mut s = Settings::defaults(UiLanguage::Vi);
        assert!(s.speaker_diarization && s.speaker_names, "bật sẵn (spec §8.3)");
        assert_eq!(active(&s), enabled());
        assert!(wanted(true, &s), "bản có tính năng, cài đặt bật");
        assert!(!wanted(false, &s), "bản không có tính năng");
        s.speaker_diarization = false;
        assert!(!active(&s));
        assert!(!wanted(true, &s), "cài đặt tắt thắng công tắc nội bộ");
    }

    /// Kế hoạch 03: bản phát hành không chạy nhận giọng dù cài đặt bật (CI chạy test này ở bản release, bộ lọc `speaker::`).
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_never_activate_speaker_whatever_the_settings() {
        assert!(!active(&Settings::defaults(UiLanguage::Vi)));
    }

    /// Các bảng `speaker://roster` mà cửa sổ `label` nhận được.
    fn rosters(app: &tauri::App<tauri::test::MockRuntime>, label: &str) -> Arc<Mutex<Vec<String>>> {
        use tauri::Listener;
        let got = Arc::new(Mutex::new(Vec::new()));
        let sink = got.clone();
        crate::test_support::window(app, label).listen(events::SPEAKER_ROSTER, move |e| {
            sink.lock().unwrap().push(e.payload().to_string());
        });
        got
    }

    fn wait_for(got: &Mutex<Vec<String>>, n: usize) -> Vec<String> {
        let since = std::time::Instant::now();
        while got.lock().unwrap().len() < n {
            assert!(
                since.elapsed() < std::time::Duration::from_secs(10),
                "chưa nhận đủ {n} bảng"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        got.lock().unwrap().clone()
    }

    /// Phiên 1 của app giả có một giọng ("Người 1").
    fn one_voice(app: &tauri::App<tauri::test::MockRuntime>) {
        use pipeline::subtitle::{Roster, RosterVoice};
        let store = app.state::<TranscriptStore>();
        store.begin(1, 0, "vi");
        store.set_ui_language(UiLanguage::Vi);
        let view = store.roster(
            1,
            &Roster {
                voices: vec![RosterVoice { id: 1, room: false }],
            },
        );
        assert!(view.is_some());
    }

    /// QĐ 8: tắt "Phân biệt người nói" giữa phiên thì dừng worker ngay, bỏ bảng người nói, hai cửa sổ nhận bảng rỗng.
    #[test]
    fn turning_the_switch_off_mid_session_stops_the_worker_and_clears_the_labels() {
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let handle = SpeakerHandle::default();
        *app.state::<Running>().0.lock().unwrap() = Some(handle.clone());
        let (to_main, to_overlay) = (
            rosters(&app, crate::window::MAIN),
            rosters(&app, crate::overlay::LABEL),
        );
        let mut next = app.state::<AppState>().settings();
        next.speaker_diarization = false;
        crate::actions::commit_settings(app.handle(), next);
        assert!(handle.is_stopped(), "worker của phiên bị dừng");
        assert!(app.state::<Running>().0.lock().unwrap().is_none());
        for got in [wait_for(&to_main, 1), wait_for(&to_overlay, 1)] {
            let view: serde_json::Value = serde_json::from_str(&got[0]).unwrap();
            assert_eq!(view["voices"], serde_json::json!([]), "{view}");
            assert!(view["rev"].as_u64().unwrap() > 1, "bảng mới hơn bảng của giọng đầu: {view}");
        }
        assert!(app.state::<TranscriptStore>().roster_view().voices.is_empty());
    }

    /// Rà soát A-N3: công tắc tắt đúng lúc phiên đang bắt đầu (trước khi handle được giữ, `turn_off` chưa thấy nó): worker vừa chạy
    /// bị dừng ngay. Thử như bản có tính năng (`enabled = true`; trong `cargo test` [`enabled`] luôn `false`), nên test đỏ nếu
    /// `keep_running` bỏ qua cài đặt (rà soát lần 2, A-N2) hay dừng cả khi cài đặt bật.
    #[test]
    fn a_worker_started_after_the_switch_went_off_is_stopped_at_once() {
        let app = crate::test_support::mock_app();
        let kept = SpeakerHandle::default();
        keep_running_with(app.handle(), &kept, true);
        assert!(!kept.is_stopped(), "cài đặt bật: worker chạy tiếp");
        let mut next = app.state::<AppState>().settings();
        next.speaker_diarization = false;
        crate::actions::commit_settings(app.handle(), next);
        assert!(kept.is_stopped(), "tắt giữa phiên: `turn_off` dừng worker đang giữ");
        let late = SpeakerHandle::default();
        keep_running_with(app.handle(), &late, true);
        assert!(late.is_stopped(), "worker bắt đầu sau khi tắt: dừng ngay");
        assert!(app.state::<Running>().0.lock().unwrap().is_some(), "vẫn giữ tới khi phiên dừng");
    }

    /// Rà soát A-N4: phiên dừng thì bỏ handle; tắt công tắc sau đó không dừng nhầm handle cũ, không ghi log sai.
    #[test]
    fn a_stopped_session_leaves_no_worker_handle_behind() {
        let app = crate::test_support::mock_app();
        let handle = SpeakerHandle::default();
        *app.state::<Running>().0.lock().unwrap() = Some(handle.clone());
        session_ended(app.handle());
        assert!(app.state::<Running>().0.lock().unwrap().is_none());
        assert!(handle.is_stopped());
    }

    /// QĐ 9: "Xóa toàn bộ dữ liệu" chỉ phát `speaker://roster` khi phiên có giọng (bản phát hành không phát sự kiện mới).
    #[test]
    fn clearing_data_announces_speakers_only_when_there_are_some() {
        let app = crate::test_support::mock_app();
        let to_main = rosters(&app, crate::window::MAIN);
        emit_roster(app.handle());
        std::thread::sleep(std::time::Duration::from_millis(100));
        assert!(to_main.lock().unwrap().is_empty(), "chưa có giọng: không phát");
        one_voice(&app);
        emit_roster(app.handle());
        assert_eq!(wait_for(&to_main, 1).len(), 1);
    }

    /// Spec §9: nhãn "Người N" tính sẵn theo ngôn ngữ giao diện; đổi ngôn ngữ thì hai cửa sổ nhận nhãn mới.
    #[test]
    fn a_new_ui_language_relabels_the_automatic_names() {
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let to_main = rosters(&app, crate::window::MAIN);
        let mut next = app.state::<AppState>().settings();
        next.ui_language = UiLanguage::En;
        crate::actions::commit_settings(app.handle(), next);
        let got = wait_for(&to_main, 1);
        assert!(got[0].contains(r#""label":"Speaker 1""#), "{got:?}");
    }

    /// QĐ 9: giao diện chỉ hiện nhóm Cài đặt "Người nói" khi bản này có tính năng.
    #[test]
    fn the_app_info_says_whether_the_speaker_settings_show() {
        let app = crate::test_support::mock_app();
        let main = crate::test_support::window(&app, crate::window::MAIN);
        let info = crate::test_support::invoke(&main, "get_app_info", serde_json::json!({})).unwrap();
        assert_eq!(info["speakerAvailable"], serde_json::json!(enabled()));
    }
```

Trong `src-tauri/src/session.rs`, test `speaker_events_reach_both_windows`: thay đoạn từ `let sink = TauriSink {` tới hết hàm bằng:

```rust
        app.state::<TranscriptStore>().begin(1, 0, "vi");
        let sink = TauriSink {
            app: app.handle().clone(),
            session: 1,
            asr_code: Arc::new(crate::test_support::FakeDeps::default()),
        };
        sink.speaker(&SpeakerLabel {
            id: 1_000_007,
            speaker: Some(2),
        });
        sink.roster(&Roster {
            voices: vec![RosterVoice { id: 2, room: false }],
        });
        // Cùng bảng lần nữa: không có gì đổi, không phát lại.
        sink.roster(&Roster {
            voices: vec![RosterVoice { id: 2, room: false }],
        });
        let since = Instant::now();
        while to_overlay.lock().unwrap().len() < 2 || to_main.lock().unwrap().len() < 2 {
            assert!(since.elapsed() < Duration::from_secs(10), "chưa nhận đủ");
            std::thread::sleep(Duration::from_millis(5));
        }
        std::thread::sleep(Duration::from_millis(50));
        for got in [to_overlay, to_main] {
            let got = got.lock().unwrap().clone();
            assert_eq!(got.len(), 2, "{got:?}");
            assert_eq!(got[0], r#"subtitle://speaker {"id":1000007,"speaker":2}"#);
            // Giọng 2 là giọng đầu tiên của phiên: "Người 1" (QĐ 2), nhãn English vì app giả chưa đặt ngôn ngữ cho bản chép lời.
            // `rev` 2: `begin` tăng lên 1 (QĐ 25), bảng đầu tiên dựng ra là 2.
            assert_eq!(
                got[1],
                r#"speaker://roster {"voices":[{"id":2,"label":"Speaker 1","color":0,"source":"voice","room":false,"mergedInto":null}],"participants":[],"askAccess":false,"rev":2}"#
            );
        }
        assert_eq!(app.state::<TranscriptStore>().roster_view().voices.len(), 1);
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- speaker:: session::tests::speaker_events 2>&1 | grep -E "^error" | head -3`
Expected: `` error[E0425]: cannot find function `active` … ``, `` cannot find type `Running` … ``.

- [ ] **Step 3: Cài đặt `speaker/mod.rs`**

1. Thay chú thích đầu file (dòng 1–7) bằng:

```rust
//! Nhận giọng người nói trong app (spec 2026-10-26-phan-biet-nguoi-noi §4; kế hoạch 02, 03): bật cho phiên nào, tìm `speaker-worker`
//! và model, kiểm SHA-256 trước mỗi lần chạy (§10.2), rồi chạy `pipeline::speaker_client` cho phiên. Phiên không chờ worker.
//!
//! **Tới kế hoạch 07: tính năng TẮT với người dùng cuối.** Công tắc nội bộ [`enabled`]: chỉ bản debug bật được, bằng
//! `AI_TRANSLATOR_DEV_SPEAKER=true` trong `.env` (đọc qua `scripts/run-dev-app.sh`, cùng cơ chế `AI_TRANSLATOR_DEV_PRO`, spec
//! 2026-10-04 §2). Mã đọc biến nằm sau `cfg(debug_assertions)`; bản phát hành không có chuỗi tên biến (`release-check.mjs
//! no-dev-gate` chặn). Kế hoạch 03 thêm cài đặt `speakerDiarization` (mặc định bật): phiên có nhận giọng khi [`active`], tức công
//! tắc nội bộ bật **và** cài đặt bật; giao diện chỉ hiện nhóm Cài đặt "Người nói" khi [`enabled`] (`AppInfo::speaker_available`).
```

2. Thay khối `use` (dòng 9–18) bằng:

```rust
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use pipeline::speaker::SpeakerLink;
use pipeline::speaker_client::{self, BeforeSpawn, SpeakerHandle, SpeakerLaunch};
use tauri::{AppHandle, Manager, Runtime};

use crate::events;
use crate::models::service::ModelService;
use crate::settings::{Settings, UiLanguage};
use crate::sidecar::{integrity, paths};
use crate::state::AppState;
use crate::transcript::store::TranscriptStore;
```

3. Thay chú thích của `enabled`

```rust
/// Nhận giọng có bật cho phiên mới không. Bản phát hành: luôn `false` ở kế hoạch 02.
```

bằng:

```rust
/// Bản này có tính năng không (công tắc nội bộ). Bản phát hành: luôn `false` tới kế hoạch 07; bản debug: theo cờ dev.
```

4. Sau hàm `switch_on` thêm:

```rust
/// Phiên mới có nhận giọng không: bản này có tính năng ([`enabled`]) và người dùng bật "Phân biệt người nói" (spec §8.3).
pub fn active(settings: &Settings) -> bool {
    wanted(enabled(), settings)
}

/// Phần quyết định của [`active`], nhận công tắc nội bộ làm tham số: trong `cargo test` [`enabled`] luôn `false` (không có cờ dev),
/// nên test cần hàm này để thử nhánh "bản có tính năng" (rà soát lần 2, A-N2).
fn wanted(enabled: bool, settings: &Settings) -> bool {
    enabled && settings.speaker_diarization
}

/// Client nhận giọng của phiên gần nhất, để tắt giữa phiên ([`turn_off`]). `start_for_session` thay ở mỗi phiên.
#[derive(Default)]
pub struct Running(Mutex<Option<SpeakerHandle>>);
```

5. Trong `start_for_session`, thay

```rust
    if !enabled() {
        return None;
    }
```

bằng

```rust
    let settings = app.try_state::<AppState>()?.settings();
    if !active(&settings) {
        return None;
    }
```

và thay đoạn từ `let locks: Arc<Mutex<Vec<File>>> = Arc::default();` tới `Some(link)` (cuối hàm) bằng:

```rust
    let locks: Arc<Mutex<Vec<File>>> = Arc::default();
    let check_app = app.clone();
    let before_spawn: BeforeSpawn = Box::new(move |launch: &SpeakerLaunch| {
        let expected = launch.model_sha256.as_deref();
        // Model của kho hỏng mà đúng kích thước: bỏ để phiên sau tải lại (không thì tính năng tắt lặng lẽ mãi).
        let discard = || expected.is_some_and(|sha| models.discard_speaker_model(&check_app, sha));
        check_before_spawn(launch, expected, integrity::SIDECAR_HASHES, &locks, &discard)
    });
    let (link, handle) = speaker_client::start(launch, before_spawn);
    log::info!("nhận giọng: bật cho phiên này");
    keep_running(app, &handle);
    Some(link)
```

6. Sau hàm `start_for_session` thêm:

```rust
/// Người dùng tắt "Phân biệt người nói" (Cài đặt › Phụ đề; QĐ 8 của kế hoạch 03): dừng worker của phiên ngay (không chạy lại tới hết
/// phiên), bỏ bảng người nói và báo hai cửa sổ thôi vẽ nhãn. Bật lại thì có tác dụng từ phiên sau. Không có phiên thì chỉ bỏ bảng
/// người nói của phiên vừa dừng.
pub fn turn_off<R: Runtime>(app: &AppHandle<R>) {
    let handle = app
        .try_state::<Running>()
        .and_then(|r| r.0.lock().unwrap_or_else(|e| e.into_inner()).take());
    if let Some(handle) = handle
        && !handle.is_stopped()
    {
        handle.stop();
        log::info!("nhận giọng: người dùng tắt, dừng worker của phiên");
    }
    if let Some(store) = app.try_state::<TranscriptStore>() {
        events::speaker_roster(app, &store.speakers_off());
    }
}

/// Giữ handle của phiên để tắt được giữa phiên ([`turn_off`]). Người dùng vừa tắt công tắc trong lúc phiên đang bắt đầu (`turn_off` chưa
/// thấy handle, rà soát A-N3): dừng ngay, để không phân tích giọng khi người dùng đã tắt (ưu tiên 3). Đọc cài đặt **sau** khi giữ
/// handle, nên mọi lần tắt hoặc thấy handle, hoặc bị lần đọc này thấy.
fn keep_running<R: Runtime>(app: &AppHandle<R>, handle: &SpeakerHandle) {
    keep_running_with(app, handle, enabled());
}

/// [`keep_running`] với công tắc nội bộ làm tham số (để test, xem [`wanted`]).
fn keep_running_with<R: Runtime>(app: &AppHandle<R>, handle: &SpeakerHandle, enabled: bool) {
    if let Some(running) = app.try_state::<Running>() {
        *running.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle.clone());
    }
    let on = app.try_state::<AppState>().is_some_and(|s| wanted(enabled, &s.settings()));
    if !on {
        handle.stop();
        log::info!("nhận giọng: công tắc đã tắt lúc phiên bắt đầu, dừng worker");
    }
}

/// Phiên dừng (`session::stop_engine`): bỏ handle của phiên (client đã dừng cùng `SpeakerLink`), để lần tắt công tắc sau đó không dừng
/// nhầm và không ghi log sai (rà soát A-N4).
pub fn session_ended<R: Runtime>(app: &AppHandle<R>) {
    if let Some(running) = app.try_state::<Running>()
        && let Some(handle) = running.0.lock().unwrap_or_else(|e| e.into_inner()).take()
    {
        handle.stop();
    }
}

/// Ngôn ngữ giao diện vừa đổi: nhãn "Người N" theo ngôn ngữ mới (spec §9: nhãn tính sẵn ở phía Rust).
pub fn language_changed<R: Runtime>(app: &AppHandle<R>, lang: UiLanguage) {
    let Some(store) = app.try_state::<TranscriptStore>() else {
        return;
    };
    store.set_ui_language(lang);
    if store.has_speakers() {
        events::speaker_roster(app, &store.roster_view());
    }
}

/// Gửi lại bảng người nói hiện có cho hai cửa sổ (sau "Xóa toàn bộ dữ liệu", QĐ 18), chỉ khi phiên có giọng: bản phát hành (không có
/// nhận giọng) không phát sự kiện mới nào (QĐ 9).
pub fn emit_roster<R: Runtime>(app: &AppHandle<R>) {
    if let Some(store) = app.try_state::<TranscriptStore>()
        && store.has_speakers()
    {
        events::speaker_roster(app, &store.roster_view());
    }
}
```

- [ ] **Step 4: Cài đặt sự kiện, phiên, cài đặt, `AppInfo`**

`src-tauri/src/events.rs`:
- Dòng 7: `use pipeline::subtitle::{LiveEnd, LiveLine, Roster, SpeakerLabel};` → `use pipeline::subtitle::{LiveEnd, LiveLine, SpeakerLabel};`, và thêm `use crate::transcript::speakers::RosterView;` vào nhóm `use crate::…`.
- Chú thích của `SPEAKER_ROSTER` (dòng 35): thay dòng

```rust
/// Bảng giọng của phiên (`pipeline::subtitle::Roster`). Cửa sổ chính và thanh phụ đề.
```

bằng

```rust
/// Bảng người nói của phiên (`transcript::speakers::RosterView`, spec 2026-10-26-phan-biet-nguoi-noi §9): nhãn, màu, nguồn tên, `rev`.
/// Cửa sổ chính và thanh phụ đề.
```

- Hàm `speaker_roster`: đổi tham số `roster: &Roster` thành `roster: &RosterView`.

`src-tauri/src/session.rs`:
- Trong khối bắt đầu phiên (dòng 464–466), thay

```rust
    if let Some(transcript) = app.try_state::<TranscriptStore>() {
        transcript.begin(n, now_ms(), code_of(settings.target_language));
    }
```

bằng

```rust
    if let Some(transcript) = app.try_state::<TranscriptStore>() {
        // Ngôn ngữ của nhãn "Người N" (spec 2026-10-26-phan-biet-nguoi-noi §9) không đặt ở đây: `begin` giữ ngôn ngữ đặt lúc khởi
        // động (`lib.rs`) hay lần đổi gần nhất (`speaker::language_changed`). `settings` đọc trước `prepare` (có thể hàng chục
        // giây): đặt lại từ nó sẽ đè ngôn ngữ người dùng vừa đổi trong lúc nạp model (rà soát mã 03, mục 1).
        transcript.begin(n, now_ms(), code_of(settings.target_language));
    }
```

(Bản đầu của kế hoạch gọi `transcript.set_ui_language(settings.ui_language)` ngay sau `begin`; rà soát mã 03, mục 1 bỏ lời gọi đó, test `session::tests::a_ui_language_change_while_the_session_starts_is_kept`.) Ngôn ngữ đặt một lần lúc khởi động, trong `setup` của `src-tauri/src/lib.rs`, trước khi tạo cửa sổ: thay `app.manage(transcript::store::TranscriptStore::default());` bằng

```rust
    // Nhãn "Người N" theo ngôn ngữ giao diện (spec 2026-10-26-phan-biet-nguoi-noi §9): đặt một lần ở đây, trước khi có cửa sổ;
    // từ đó chỉ `speaker::language_changed` đổi (rà soát mã 03, mục 1).
    let transcript = transcript::store::TranscriptStore::default();
    transcript.set_ui_language(settings.ui_language);
    app.manage(transcript);
```

- Trong `impl EventSink for TauriSink`, thay hai hàm `speaker`, `roster` (dòng 994–1001) bằng:

```rust
    /// Nhãn đổi muộn (spec 2026-10-26-phan-biet-nguoi-noi §4.3): sửa câu trong bản chép lời rồi báo hai cửa sổ.
    fn speaker(&self, label: &SpeakerLabel) {
        if let Some(transcript) = self.app.try_state::<TranscriptStore>() {
            transcript.set_speaker(self.session, label);
        }
        events::subtitle_speaker(&self.app, label);
    }

    /// Bảng giọng của worker: bảng người nói của phiên (nhãn "Người N", màu, tên đổi tay) tính lại trong một lần khóa (QĐ 25); chỉ báo
    /// giao diện khi có gì đổi. Phát sau khi nhả khóa; `rev` cho giao diện bỏ bảng tới muộn.
    fn roster(&self, roster: &Roster) {
        if let Some(view) = self
            .app
            .try_state::<TranscriptStore>()
            .and_then(|t| t.roster(self.session, roster))
        {
            events::speaker_roster(&self.app, &view);
        }
    }
```

- Trong `stop_engine` (dòng 594–611), thay hai dòng (606–607)

```rust
    session.deps.end_session();
    // Lưu lịch sử nếu bật "Lưu lịch sử" và là Pro (F4). Chạy ngay ở đây, cả khi thoát app, để không mất phiên cuối.
```

bằng

```rust
    session.deps.end_session();
    // Nhận giọng dừng cùng engine: bỏ handle của phiên (kế hoạch 03 phân biệt người nói, rà soát A-N4).
    crate::speaker::session_ended(app);
    // Lưu lịch sử nếu bật "Lưu lịch sử" và là Pro (F4). Chạy ngay ở đây, cả khi thoát app, để không mất phiên cuối.
```

`src-tauri/src/actions.rs`, trong `commit_settings`, sau khối `if previous.translate_while_speaking != next.translate_while_speaking { … }` thêm:

```rust
    // "Phân biệt người nói" tắt: dừng nhận giọng của phiên ngay (spec 2026-10-26-phan-biet-nguoi-noi §8.3; QĐ 8 của kế hoạch 03).
    // Bật lại thì có tác dụng từ phiên sau.
    if previous.speaker_diarization && !next.speaker_diarization {
        crate::speaker::turn_off(app);
    }
    // Nhãn "Người N" theo ngôn ngữ giao diện mới.
    if previous.ui_language != next.ui_language {
        crate::speaker::language_changed(app, next.ui_language);
    }
```

`src-tauri/src/data.rs`, trong `clear_all_data`, thay

```rust
    if let Some(transcript) = app.try_state::<TranscriptStore>() {
        transcript.clear();
    }
```

bằng

```rust
    if let Some(transcript) = app.try_state::<TranscriptStore>() {
        transcript.clear();
    }
    // Tên người dùng đặt cho người nói cũng đã bỏ (QĐ 18 của kế hoạch 03 phân biệt người nói): hai cửa sổ vẽ lại nhãn tự động.
    crate::speaker::emit_roster(app);
```

`src-tauri/src/state.rs`, trong `AppInfo`, sau `pub launched_at_login: bool,` thêm:

```rust
    /// Bản này có "Phân biệt người nói" không (`speaker::enabled()`; bản phát hành: không, tới kế hoạch 07). Giao diện chỉ hiện nhóm
    /// Cài đặt "Người nói" khi có (QĐ 9 của kế hoạch 03 phân biệt người nói).
    pub speaker_available: bool,
```

`src-tauri/src/commands.rs`, `get_app_info`: thêm `speaker_available: crate::speaker::enabled(),` sau `launched_at_login: state.launched_at_login(),`.

`src-tauri/src/lib.rs`: sau `app.manage(transcript::store::TranscriptStore::default());` thêm `app.manage(speaker::Running::default());`.

`src-tauri/src/test_support.rs`: sau `.manage(TranscriptStore::default())` thêm `.manage(crate::speaker::Running::default())`.

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- speaker:: session:: actions:: data:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (gồm 7 test mới của `speaker::` ở bản debug, `speaker_events_reach_both_windows` đã sửa, test cũ của `speaker::`).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && grep -n "AI_TRANSLATOR_DEV_SPEAKER" src-tauri/src/speaker/mod.rs && git status --short`
Expected: `test result: ok`; clippy `Finished` không cảnh báo; `--check` của fmt không in gì; `grep` in các dòng chú thích `//!` ở đầu file (không vào binary) và đúng một dòng mã, `pub const DEV_SPEAKER_ENV …` ngay dưới `#[cfg(debug_assertions)]` (cổng `no-dev-gate` quét binary nên không đổi); thêm các file của Task này trong `git status`. Không commit.

---

### Task 7: Lệnh `rename_speaker`, `merge_speakers`, `open_speaker_settings`; quyền của cửa sổ

Spec §8.4: cửa sổ `overlay` thêm **đúng một** lệnh không tham số `open_speaker_settings`; cửa sổ `main` thêm `rename_speaker`, `merge_speakers`. ACL của Tauri chặn mọi lệnh không được cấp.

**Files:**
- Modify: `src-tauri/src/events.rs:60-66` (`Navigate.focus`), `src-tauri/src/tray.rs:206-236`, `src-tauri/src/compose/mod.rs:514-529` (thêm `focus: None`)
- Modify: `src-tauri/src/speaker/mod.rs` (`open_settings`, `rename`, `merge`, `speaker_error` + test)
- Modify: `src-tauri/src/errors.rs` (`SPEAKER_NOT_FOUND`, `SPEAKER_SAME` + test), `src-tauri/src/commands.rs` (lệnh, `MAIN_COMMANDS`, `OVERLAY_COMMANDS`, `handler`), `src-tauri/build.rs`, `src-tauri/capabilities/{main,overlay}.json`
- Test: `src-tauri/src/acl_tests.rs`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `src-tauri/src/acl_tests.rs`:

```rust
/// Spec 2026-10-26-phan-biet-nguoi-noi §8.4, §12: thanh phụ đề chỉ thêm đúng một lệnh không tham số, `open_speaker_settings`: hiện
/// cửa sổ chính ở Cài đặt › Phụ đề, nhóm Người nói, không đọc hay đổi dữ liệu. Cửa sổ khác không gọi được nó. Đổi tên, gộp người nói
/// chỉ cửa sổ chính gọi được; thông báo lỗi không có tên người.
#[test]
fn the_overlay_only_gains_open_speaker_settings() {
    use std::sync::{Arc, Mutex};
    use tauri::Listener;
    let before: &[&str] = &[
        "get_overlay_view",
        "hide_overlay",
        "begin_overlay_resize",
        "overlay_resize_move",
        "end_overlay_resize",
    ];
    let added: Vec<&&str> = OVERLAY_COMMANDS.iter().filter(|c| !before.contains(c)).collect();
    assert_eq!(added, [&"open_speaker_settings"], "overlay chỉ thêm đúng một lệnh");
    let app = mock_app();
    let (main, overlay) = (window(&app, "main"), window(&app, "overlay"));
    let (compose, stranger) = (window(&app, "compose"), window(&app, "stranger"));
    let got = Arc::new(Mutex::new(Vec::<String>::new()));
    {
        let got = got.clone();
        main.listen(crate::events::NAVIGATE, move |e| got.lock().unwrap().push(e.payload().to_string()));
    }
    for other in [&main, &compose, &stranger] {
        let result = invoke(other, "open_speaker_settings", json!({}));
        assert!(denied(&result), "{} không được gọi: {result:?}", other.label());
    }
    invoke(&overlay, "open_speaker_settings", json!({})).expect("overlay gọi được");
    let since = std::time::Instant::now();
    while got.lock().unwrap().is_empty() {
        assert!(since.elapsed() < std::time::Duration::from_secs(10), "cửa sổ chính chưa nhận app://navigate");
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert_eq!(
        got.lock().unwrap()[0],
        r#"{"screen":"settings","settingsGroup":"subtitles","focus":"speakers"}"#
    );
    let args = json!({ "id": 1, "name": "Lan Nguyễn", "from": 1, "into": 2 });
    for cmd in ["rename_speaker", "merge_speakers"] {
        for other in [&overlay, &compose, &stranger] {
            let result = invoke(other, cmd, args.clone());
            assert!(denied(&result), "{} không được gọi {cmd}: {result:?}", other.label());
        }
        // Cửa sổ chính gọi được; chưa có phiên nên là lỗi của lệnh, không phải bị chặn, và không có tên người trong lỗi.
        let err = invoke(&main, cmd, args.clone()).unwrap_err();
        assert!(!denied(&Err(err.clone())), "{cmd}: {err}");
        assert!(err.contains("\"code\":\"speakerNotFound\""), "{cmd}: {err}");
        assert!(!err.contains("Lan"), "{cmd}: lỗi không có tên người: {err}");
    }
}
```

Trong `src-tauri/src/errors.rs`, test `every_error_code_has_ui_text`: thêm `SPEAKER_NOT_FOUND,` và `SPEAKER_SAME,` sau `SUPPORT_INVALID,` trong mảng mã (khóa `error.speakerNotFound`, `error.speakerSame` đã có từ Task 2).

Thêm vào cuối `mod tests` của `src-tauri/src/speaker/mod.rs`:

```rust
    /// Rà soát A-N11: lỗi của đổi tên, gộp có mã riêng, câu báo đúng việc; thông báo không có tên người.
    #[test]
    fn rename_and_merge_errors_have_their_own_codes() {
        assert_eq!(speaker_error(SpeakerError::Same).code, crate::errors::SPEAKER_SAME);
        assert_eq!(speaker_error(SpeakerError::NotFound).code, crate::errors::SPEAKER_NOT_FOUND);
        let long = speaker_error(SpeakerError::TooLong);
        assert_eq!((long.code.as_str(), long.field.as_deref()), ("tooLong", Some("name")));
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- acl_tests:: errors:: 2>&1 | grep -E "^error|FAILED|panicked" | head -3`
Expected: `` error[E0425]: cannot find value `SPEAKER_NOT_FOUND` … `` (và `SPEAKER_SAME`; `` cannot find function `speaker_error` `` trong test của `speaker::`).

- [ ] **Step 3: `Navigate.focus` và `open_settings`**

`src-tauri/src/events.rs`, thay struct `Navigate` (dòng 60–66) bằng:

```rust
/// Yêu cầu cửa sổ chính mở một màn hình, ví dụ khi bấm dòng báo lỗi phím tắt ở menu khay.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Navigate {
    pub screen: &'static str,
    pub settings_group: Option<&'static str>,
    /// Phần cần cuộn tới trong màn hình: `"speakers"` là nhóm Người nói ở Cài đặt › Phụ đề (spec 2026-10-26-phan-biet-nguoi-noi
    /// §6.7). `None` thì không có trong JSON (sự kiện cũ không đổi).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<&'static str>,
}
```

Thêm `focus: None,` vào bảy chỗ dựng `events::Navigate` (ngay dưới dòng `settings_group: …,`):

Run: `cd $W && perl -0pi -e 's/^([ \t]*)settings_group: (Some\("[a-z]+"\)|None),\n/$1settings_group: $2,\n$1focus: None,\n/mg' src-tauri/src/tray.rs src-tauri/src/compose/mod.rs && grep -c "focus: None," src-tauri/src/tray.rs src-tauri/src/compose/mod.rs`
Expected: `src-tauri/src/tray.rs:3`, `src-tauri/src/compose/mod.rs:4`.

`src-tauri/src/speaker/mod.rs`: thêm `use crate::actions;` vào nhóm `use crate::…`, và sau hàm `emit_roster` thêm:

```rust
/// Nút "Mở Cài đặt" của dòng mời cấp quyền trên thanh phụ đề (spec §6.7, §8.4): hiện cửa sổ chính ở Cài đặt › Phụ đề và cuộn tới
/// nhóm Người nói. Không đọc hay đổi dữ liệu gì (việc menu khay vốn làm được).
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) {
    actions::open_main_at(
        app,
        events::Navigate {
            screen: "settings",
            settings_group: Some("subtitles"),
            focus: Some("speakers"),
        },
    );
}
```

- [ ] **Step 4: Mã lỗi, việc dữ liệu, lệnh**

`src-tauri/src/errors.rs`, sau hằng `SUPPORT_INVALID` thêm:

```rust
/// Đổi tên hay gộp người nói khi phiên đã dừng, chưa có phiên, hay giọng không còn (spec 2026-10-26-phan-biet-nguoi-noi §8.2).
pub const SPEAKER_NOT_FOUND: &str = "speakerNotFound";
/// Gộp một người nói vào chính họ (giao diện không cho làm; lỗi phòng hờ, rà soát A-N11).
pub const SPEAKER_SAME: &str = "speakerSame";
```

`src-tauri/src/speaker/mod.rs` (không đặt ở `data.rs`: chú thích đầu `data.rs` nói mọi việc ở đó có thể chặn và chạy qua `spawn_blocking`, còn hai việc này chỉ giữ một khóa ngắn; rà soát A-N11): thêm vào nhóm `use crate::…` `use crate::errors::{self, CommandError};`, `use crate::transcript::speakers::{RosterView, SpeakerError};`, và đổi `use crate::settings::{Settings, UiLanguage};` thành `use crate::settings::{Invalid, Reason, Settings, UiLanguage};`; sau hàm `open_settings` thêm:

```rust
// ---- Đổi tên, gộp (spec 2026-10-26-phan-biet-nguoi-noi §8.2) trong phiên đang chạy. Không phải tính năng Pro. Chỉ một lần khóa ngắn
// của `TranscriptStore`, nên lệnh chạy thẳng, không qua `spawn_blocking`. ----

/// Lỗi của đổi tên, gộp cho giao diện; thông báo không có tên người.
fn speaker_error(e: SpeakerError) -> CommandError {
    match e {
        SpeakerError::TooLong => Invalid::new("name", Reason::TooLong).into(),
        SpeakerError::Same => CommandError::new(errors::SPEAKER_SAME, None, e.to_string()),
        SpeakerError::NotFound => CommandError::new(errors::SPEAKER_NOT_FOUND, None, e.to_string()),
    }
}

/// Đổi tên một giọng, áp cho mọi câu của giọng trong phiên; phát bảng mới cho hai cửa sổ. Tên không vào log.
pub fn rename<R: Runtime>(app: &AppHandle<R>, id: u32, name: &str) -> Result<RosterView, CommandError> {
    let store = app
        .try_state::<TranscriptStore>()
        .ok_or_else(|| speaker_error(SpeakerError::NotFound))?;
    let view = store.rename_speaker(id, name).map_err(speaker_error)?;
    events::speaker_roster(app, &view);
    Ok(view)
}

/// Gộp tay giọng `from` vào `into` (chỉ đổi cách hiện, không gửi worker); phát bảng mới cho hai cửa sổ.
pub fn merge<R: Runtime>(app: &AppHandle<R>, from: u32, into: u32) -> Result<RosterView, CommandError> {
    let store = app
        .try_state::<TranscriptStore>()
        .ok_or_else(|| speaker_error(SpeakerError::NotFound))?;
    let view = store.merge_speakers(from, into).map_err(speaker_error)?;
    events::speaker_roster(app, &view);
    Ok(view)
}
```

`src-tauri/src/commands.rs`: thêm `use crate::transcript::speakers::RosterView;` vào nhóm `use crate::…`; sau lệnh `export_transcript` (sau dòng 197) thêm:

```rust
// ---- Người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.2, §8.4). ----

/// Đổi tên một giọng (≤ 40 ký tự; rỗng là trở về tên tự động), áp cho mọi câu của giọng trong phiên đang chạy. Trả bảng người nói
/// mới (cũng phát `speaker://roster`). Chỉ cửa sổ chính.
#[tauri::command]
pub fn rename_speaker<R: Runtime>(app: AppHandle<R>, id: u32, name: String) -> Result<RosterView, CommandError> {
    crate::speaker::rename(&app, id, &name)
}

/// Gộp tay giọng `from` vào `into` trong phiên đang chạy. Chỉ cửa sổ chính.
#[tauri::command]
pub fn merge_speakers<R: Runtime>(app: AppHandle<R>, from: u32, into: u32) -> Result<RosterView, CommandError> {
    crate::speaker::merge(&app, from, into)
}

/// Nút "Mở Cài đặt" của dòng mời cấp quyền trên thanh phụ đề: không tham số, chỉ hiện cửa sổ chính ở Cài đặt › Phụ đề › Người
/// nói. Lệnh duy nhất kế hoạch 03 thêm cho cửa sổ `overlay` (spec §8.4).
#[tauri::command]
pub fn open_speaker_settings<R: Runtime>(app: AppHandle<R>) {
    crate::speaker::open_settings(&app);
}
```

Trong `MAIN_COMMANDS`, sau `"export_transcript",` thêm `"rename_speaker",` và `"merge_speakers",`. Trong `OVERLAY_COMMANDS`, sau `"end_overlay_resize",` thêm `"open_speaker_settings",`. Trong `handler()`, sau `export_transcript,` thêm `rename_speaker,` `merge_speakers,`; sau `end_overlay_resize,` thêm `open_speaker_settings,`.

`src-tauri/build.rs`: trong danh sách `.commands(&[…])`, sau `"export_transcript",` thêm `"rename_speaker",` `"merge_speakers",`; sau `"end_overlay_resize",` thêm `"open_speaker_settings",`.

`src-tauri/capabilities/main.json`: sau `"allow-export-transcript",` thêm `"allow-rename-speaker",` và `"allow-merge-speakers",`.

`src-tauri/capabilities/overlay.json`: thay dòng `description` bằng `"description": "Thanh phụ đề: chỉ đọc phần cài đặt của nó, nghe sự kiện, kéo, kéo cạnh để đổi kích thước, ẩn cửa sổ của chính nó (spec §4.4, §10.2), và mở Cài đặt › Phụ đề › Người nói từ dòng mời cấp quyền (spec 2026-10-26-phan-biet-nguoi-noi §8.4).",`; sau `"allow-end-overlay-resize",` thêm `"allow-open-speaker-settings",`.

- [ ] **Step 5: Chạy, thấy xanh** (build nặng: kiểm đĩa trước; `build.rs` đổi nên crate dựng lại)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- acl_tests:: errors:: speaker:: compose:: tray:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (gồm `capabilities_grant_exactly_the_fixed_lists`, `each_window_only_reaches_its_own_commands` (main không gọi được `open_speaker_settings`, overlay không gọi được hai lệnh mới của main), test mới).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: `test result: ok`; clippy sạch; `--check` của fmt không in gì; thêm `M src-tauri/{build.rs, capabilities/main.json, capabilities/overlay.json, src/{acl_tests,commands,errors,events,tray}.rs, src/compose/mod.rs, src/speaker/mod.rs}`. Không commit.

---

### Task 8: Lịch sử: cột `speaker`, lưu và đọc nhãn

**Files:**
- Modify: `src-tauri/src/db.rs:36-64` (`MIGRATIONS`) + test
- Modify: `src-tauri/src/transcript/history.rs:73-105` (`save`), `:130-165` (`get`) + test

- [ ] **Step 1: Viết test đỏ**

Thêm vào `mod tests` của `src-tauri/src/db.rs` (sau test `a_database_of_a_newer_app_is_refused`):

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §9: DB của bản trước (phiên bản 1) được nâng lên: cột `speaker` thêm vào `lines`, rỗng ở
    /// các câu cũ; phiên cũ và câu cũ còn nguyên.
    #[test]
    fn an_old_database_gains_an_empty_speaker_column() {
        let dir = temp_dir("v1");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let key = [7u8; KEY_BYTES];
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", to_hex(&key)))
                .unwrap();
            conn.execute_batch(MIGRATIONS[0]).unwrap();
            conn.execute_batch(
                "PRAGMA user_version = 1;
                 INSERT INTO sessions (id, started_at, ended_at, target_lang) VALUES (1, 0, 1000, 'vi');
                 INSERT INTO lines (session_id, seq, start_ms, end_ms, src_lang, src_text, tgt_text, status)
                 VALUES (1, 0, 0, 900, 'en', 'Hello', 'Xin chào', 'done');",
            )
            .unwrap();
        }
        let conn = open_with_key(&path, &key).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!((version, SCHEMA_VERSION), (2, 2));
        let (text, speaker): (String, Option<String>) = conn
            .query_row("SELECT tgt_text, speaker FROM lines WHERE session_id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((text.as_str(), speaker), ("Xin chào", None));
        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }
```

Thêm vào `mod tests` của `src-tauri/src/transcript/history.rs` (trước `}` cuối file):

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §8.2, §9 (QĐ 12): nhãn lúc ghi (đã đổi tên, gộp) được lưu cùng câu, đọc lại thành một bảng
    /// cố định theo thứ tự xuất hiện; câu không nhãn vẫn không nhãn.
    #[test]
    fn speaker_labels_are_saved_and_read_back() {
        use crate::transcript::speakers::{NameSource, VoiceView};
        let (mut c, dir) = conn("speakers");
        let mut t = transcript(1_000, "Hello.");
        t.lines[1].speaker = Some(7);
        t.lines[2].speaker = Some(9);
        t.lines[3].speaker = Some(7);
        t.speakers = vec![
            VoiceView {
                id: 7,
                label: "Lan Nguyễn".into(),
                color: 3,
                source: NameSource::User,
                room: false,
                merged_into: None,
            },
            VoiceView {
                id: 9,
                label: "Người 2".into(),
                color: 1,
                source: NameSource::Voice,
                room: false,
                merged_into: None,
            },
        ];
        let id = save(&mut c, &t).unwrap().unwrap();
        let stored: Vec<Option<String>> = c
            .prepare("SELECT speaker FROM lines WHERE session_id = ?1 ORDER BY seq")
            .unwrap()
            .query_map([id], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(
            stored,
            [None, Some("Lan Nguyễn".into()), Some("Người 2".into()), Some("Lan Nguyễn".into())]
        );
        let back = get(&c, id).unwrap();
        let labels: Vec<Option<&str>> = back.lines.iter().map(|l| back.speaker_label(l)).collect();
        assert_eq!(labels, [None, Some("Lan Nguyễn"), Some("Người 2"), Some("Lan Nguyễn")]);
        assert_eq!(
            back.speakers.iter().map(|v| (v.id, v.color)).collect::<Vec<_>>(),
            [(1, 0), (2, 1)],
            "bảng cố định theo thứ tự nhãn xuất hiện"
        );
        let _ = std::fs::remove_dir_all(dir);
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- db:: transcript::history 2>&1 | grep -E "panicked|FAILED" | head -4`
Expected: `an_old_database_gains_an_empty_speaker_column` đỏ (`no such column: speaker` hay `(1, 1)` khác `(2, 2)`), `speaker_labels_are_saved_and_read_back` đỏ (`no such column: speaker`).

- [ ] **Step 3: Cài đặt migration**

Trong `src-tauri/src/db.rs`, thay dòng kết thúc mảng `MIGRATIONS`

```rust
    ) WITHOUT ROWID;",
];
```

bằng

```rust
    ) WITHOUT ROWID;",
    // 1 → 2: nhãn người nói của từng câu (spec 2026-10-26-phan-biet-nguoi-noi §9): nhãn lúc dừng phiên (sau đổi tên, gộp), rỗng khi
    // chưa xác định hay phiên không có nhận giọng. Vẫn trong SQLCipher, vẫn chỉ khi có Pro và bật "Lưu lịch sử".
    "ALTER TABLE lines ADD COLUMN speaker TEXT;",
];
```

- [ ] **Step 4: Cài đặt lưu và đọc**

Trong `src-tauri/src/transcript/history.rs`:
- Thêm `use super::speakers::VoiceView;` sau `use super::store::Transcript;`.
- Trong `save`, thay câu `INSERT INTO lines …` và vòng lặp bằng:

```rust
        let mut insert = tx.prepare(
            "INSERT INTO lines (session_id, seq, start_ms, end_ms, src_lang, src_text, tgt_text, status, speaker)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )?;
        for (seq, line) in t.lines.iter().enumerate() {
            insert.execute(params![
                id,
                seq as i64,
                line.start_ms as i64,
                line.end_ms as i64,
                line.src_lang,
                line.src_text,
                line.tgt_text,
                status_name(line.status),
                t.speaker_label(line)
            ])?;
        }
```

- Trong `get`, thay từ `let mut stmt = conn.prepare(` tới hết hàm bằng:

```rust
    let mut stmt = conn.prepare(
        "SELECT seq, start_ms, end_ms, src_lang, src_text, tgt_text, status, speaker FROM lines
         WHERE session_id = ?1 ORDER BY seq",
    )?;
    let rows = stmt.query_map([id], |r| {
        let line = Subtitle {
            id: r.get::<_, i64>(0)? as u64,
            start_ms: r.get::<_, i64>(1)? as u64,
            end_ms: r.get::<_, i64>(2)? as u64,
            src_lang: r.get(3)?,
            src_text: r.get(4)?,
            tgt_text: r.get(5)?,
            status: status_from(&r.get::<_, String>(6)?),
            provisional: false,
            replaces: Vec::new(),
            speaker: None,
        };
        Ok((line, r.get::<_, Option<String>>(7)?))
    })?;
    // Nhãn đã lưu thành một bảng cố định theo thứ tự xuất hiện (QĐ 12 của kế hoạch 03 phân biệt người nói): mã là thứ tự.
    let mut speakers: Vec<VoiceView> = Vec::new();
    let mut lines = Vec::new();
    for row in rows {
        let (mut line, label) = row?;
        if let Some(label) = label.filter(|l| !l.is_empty()) {
            let voice = match speakers.iter().find(|v| v.label == label) {
                Some(v) => v.id,
                None => {
                    let order = speakers.len() as u32 + 1;
                    speakers.push(VoiceView::saved(order, label));
                    order
                }
            };
            line.speaker = Some(voice);
        }
        lines.push(line);
    }
    Ok(Transcript {
        session: 0,
        started_at: started_at as u64,
        ended_at: Some(ended_at as u64),
        target_lang,
        lines,
        speakers,
        speakers_rev: 0,
    })
}
```

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- db:: transcript:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (gồm `a_new_database_is_encrypted_and_has_the_schema` với `SCHEMA_VERSION` = 2, test lịch sử cũ và hai test mới). Nếu SQLCipher từ chối `ALTER TABLE … ADD COLUMN` trên bảng `WITHOUT ROWID` (không dự kiến: SQLite hỗ trợ) thì dừng, báo chủ dự án kèm thông báo lỗi; không tự đổi sang dựng lại bảng.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- app_tests:: 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: `test result: ok` (test lưu lịch sử qua phiên giả vẫn đạt); `--check` của fmt không in gì; thêm `M src-tauri/src/db.rs`, `M src-tauri/src/transcript/history.rs`. Không commit.

---

### Task 9: Xuất file có nhãn người nói

**Files:**
- Modify: `src-tauri/src/transcript/export.rs:119-196` (`txt`, `srt`, `markdown`) + test
- Modify: `src-tauri/src/data.rs:82-97` (`export_transcript`), `src-tauri/src/commands.rs:184-197`

- [ ] **Step 1: Viết test đỏ**

Trong `src-tauri/src/transcript/export.rs`, `mod tests`:
- thêm `use crate::transcript::speakers::VoiceView;` sau `use crate::i18n::{EN, VI};`;
- trong test `srt_uses_session_offsets_and_the_chosen_text`, đổi ba lần gọi `srt(&…, SrtText::…, &…)` thành có thêm tham số `false` trước `&VI`/`&EN`: `srt(&transcript(), SrtText::Translation, false, &VI)`, `srt(&transcript(), SrtText::Source, false, &EN)`, `srt(&empty, SrtText::Source, false, &VI)`;
- thêm cuối `mod tests`:

```rust
    fn with_speakers() -> Transcript {
        let mut t = transcript();
        t.lines[0].speaker = Some(1);
        t.lines[1].speaker = Some(2);
        t.speakers = vec![
            VoiceView::saved(1, "Lan".into()),
            VoiceView::saved(2, "Minh *Trần*".into()),
        ];
        t
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §9: có nhãn thì TXT `[giờ] Lan: câu gốc`, Markdown `**Lan:** …` (tên được thoát), SRT
    /// thêm `Lan: ` chỉ khi chọn; câu không có nhãn như cũ.
    #[test]
    fn speaker_labels_prefix_the_lines_that_have_one() {
        let t = with_speakers();
        let txt = txt(&t, HANOI, &VI);
        assert!(
            txt.starts_with(
                "[14:05:01] Lan: Good morning, everyone.\n→ Chào buổi sáng mọi người.\n\n\
                 [14:05:09] Minh *Trần*: Xin chào.\n\n\
                 [14:05:15] [bỏ qua đoạn]\n\n"
            ),
            "{txt}"
        );
        let md = markdown(&t, HANOI, &VI);
        assert!(
            md.contains("| 14:05:01 | **Lan:** Good morning, everyone. | Chào buổi sáng mọi người. |\n"),
            "{md}"
        );
        assert!(md.contains("| 14:05:09 | **Minh \\*Trần\\*:** Xin chào. |  |\n"), "{md}");
        assert!(md.contains("| 14:05:15 | \\[bỏ qua đoạn\\] |  |\n"), "{md}");
        assert_eq!(
            srt(&t, SrtText::Translation, false, &VI),
            srt(&transcript(), SrtText::Translation, false, &VI),
            "không chọn tiền tố: như cũ"
        );
        let named = srt(&t, SrtText::Translation, true, &VI);
        assert!(
            named.starts_with(
                "1\n00:00:01,000 --> 00:00:03,500\nLan: Chào buổi sáng mọi người.\n\n\
                 2\n00:00:09,450 --> 00:00:11,950\nMinh *Trần*: Xin chào.\n\n\
                 3\n00:00:15,000 --> 00:00:17,500\n[bỏ qua đoạn]\n\n"
            ),
            "{named}"
        );
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- transcript::export 2>&1 | grep -E "^error" | head -2`
Expected: `error[E0061]: this function takes 3 arguments but 4 arguments were supplied` (hàm `srt`).

- [ ] **Step 3: Cài đặt**

Trong `src-tauri/src/transcript/export.rs`:
- Chú thích đầu file: thêm đoạn sau đoạn "Câu theo trạng thái…":

```rust
//!
//! Người nói (spec 2026-10-26-phan-biet-nguoi-noi §9): câu có nhãn thì TXT ghi `[giờ] Lan: câu gốc`, Markdown `**Lan:** câu gốc`
//! (tên được thoát), SRT thêm `Lan: ` trước chữ khi người dùng chọn. Câu không có nhãn như cũ.
```

- Thay hàm `txt` bằng:

```rust
pub fn txt(t: &Transcript, utc_offset_minutes: i32, s: &Strings) -> String {
    let mut out = String::new();
    for line in &t.lines {
        let who = t.speaker_label(line).map(|l| format!("{l}: ")).unwrap_or_default();
        out.push_str(&format!(
            "[{}] {who}{}\n",
            clock(t, line, utc_offset_minutes),
            source(line, s)
        ));
        if let Some(tgt) = translation(line, s) {
            out.push_str(&format!("→ {tgt}\n"));
        }
        out.push('\n');
    }
    out
}
```

- Thay hàm `srt` bằng:

```rust
/// `speakers`: thêm `Lan: ` trước chữ của câu có nhãn (ô "Thêm tên người nói").
pub fn srt(t: &Transcript, text: SrtText, speakers: bool, s: &Strings) -> String {
    let mut out = String::new();
    let mut n = 0;
    for line in &t.lines {
        let body = match text {
            SrtText::Source => source(line, s),
            SrtText::Translation => match line.status {
                Status::Failed => source(line, s),
                _ => translation(line, s).unwrap_or_else(|| source(line, s)),
            },
        };
        if body.trim().is_empty() {
            continue;
        }
        let who = match t.speaker_label(line) {
            Some(label) if speakers => format!("{label}: "),
            _ => String::new(),
        };
        n += 1;
        out.push_str(&format!(
            "{n}\n{} --> {}\n{who}{}\n\n",
            srt_time(line.start_ms),
            srt_time(line.end_ms.max(line.start_ms)),
            body.trim()
        ));
    }
    out
}
```

- Trong hàm `markdown`, thay vòng `for line in &t.lines { … }` bằng:

```rust
    for line in &t.lines {
        let who = t
            .speaker_label(line)
            .map(|l| format!("**{}:** ", escape_markdown(l)))
            .unwrap_or_default();
        out.push_str(&format!(
            "| {} | {who}{} | {} |\n",
            clock(t, line, utc_offset_minutes),
            escape_markdown(&source(line, s)),
            translation(line, s).map(|t| escape_markdown(&t)).unwrap_or_default()
        ));
    }
```

`src-tauri/src/data.rs`, hàm `export_transcript`: thêm tham số `srt_speakers: bool` sau `srt_text: SrtText,`; thay chú thích của hàm bằng

```rust
/// Xuất ra file (Pro): hỏi chỗ lưu rồi ghi. `srt_speakers`: SRT có tên người nói. Trả đường dẫn đã ghi, `None` nếu người dùng hủy.
```

và đổi dòng `Format::Srt => (export::srt(&t, srt_text, s), files::SRT),` thành `Format::Srt => (export::srt(&t, srt_text, srt_speakers, s), files::SRT),`.

`src-tauri/src/commands.rs`, lệnh `export_transcript`: thêm tham số `srt_speakers: Option<bool>,` sau `srt_text: SrtText,` (không có thì `false`, như bản giao diện cũ), và đổi lời gọi thành `data::export_transcript(app, source, format, srt_text, srt_speakers.unwrap_or(false), utc_offset_minutes)`.

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- transcript:: app_tests:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (test xuất cũ không đổi kết quả khi không có nhãn; `app_tests` gọi `export_transcript` không có `srtSpeakers` vẫn đạt).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: clippy sạch (nếu báo `too_many_arguments` ở `data::export_transcript` thì gom `format`, `srt_text`, `srt_speakers` vào một struct `ExportOptions { format, srt_text, srt_speakers }` trong `data.rs` và dùng ở cả hai chỗ gọi; không thêm `allow`); fmt sạch. Không commit.

---

### Task 10: Trạng thái model nhận giọng (`ModelsView.speaker`)

Ghi chú (b), (d) của kế hoạch 02 và QĐ 15: phần nhìn thấy làm ở đây; gốc rễ để kế hoạch 07.

**Files:**
- Modify: `src-tauri/src/models/service.rs:139-157` (`ModelsView`), `:159-178` (`Inner`), `:236-247` (khởi tạo `Inner`), `:394-445` (`view`), `:865-917` (`download_speaker_model`) + test

- [ ] **Step 1: Viết test đỏ**

Thêm vào `mod tests` của `src-tauri/src/models/service.rs`, ngay sau test `the_speaker_model_is_downloaded_once`:

```rust
    /// Kế hoạch 03 (QĐ 15): trạng thái model nhận giọng tới giao diện, để Cài đặt ghi "đang tải" (spec §4.5) và lỗi `modelsBusy`
    /// lúc đang tải có lý do nhìn thấy.
    #[test]
    fn the_speaker_model_state_reaches_the_ui() {
        let state = |h: &Harness| h.call("get_models_state", json!({})).unwrap()["speaker"].clone();
        let plain = harness(|_| {});
        publish(&plain.server, &real_sample());
        plain.call("load_models", json!({})).unwrap();
        assert_eq!(state(&plain), "unavailable", "manifest chưa có mục speaker");

        let h = harness(|_| {});
        let bytes = 64u64;
        let sha: String = Sha256::digest(content("eres2net-voxceleb", bytes))
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let mut body = real_sample();
        body["speaker"] = json!({
            "id": "eres2net-voxceleb", "version": "1", "file": "eres2net.onnx", "url": "files/eres2net.onnx",
            "bytes": bytes, "sha256": sha, "license_id": "Apache-2.0", "min_app_version": "0.1.0"
        });
        publish(&h.server, &body);
        h.server.put("files/eres2net.onnx", &content("eres2net-voxceleb", bytes));
        h.call("load_models", json!({})).unwrap();
        assert_eq!(state(&h), "missing");
        h.service().lock().speaker_downloading = true;
        assert_eq!(state(&h), "downloading");
        h.service().lock().speaker_downloading = false;
        assert!(h.service().download_speaker_model(h.app.handle()));
        assert_eq!(state(&h), "ready");
        assert!(!h.service().lock().speaker_downloading, "tải xong thì hết cờ");
        // Rà soát A-N1: thả guard (lối ra sớm, panic) là hết cờ.
        let service = h.service();
        {
            let _guard = SpeakerDownloading::start(&service);
            assert!(service.lock().speaker_downloading);
        }
        assert!(!service.lock().speaker_downloading);
    }
```

(`Harness` là kiểu mà `harness(…)` trả về, `src-tauri/src/models/service.rs` dòng 1026; `lock()` là hàm riêng của `ModelService`, dòng 266, gọi được từ `mod tests` cùng file.)

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- models::service::tests::the_speaker_model_state 2>&1 | grep -E "^error" | head -2`
Expected: `` error[E0609]: no field `speaker_downloading` on type `Inner` ``.

- [ ] **Step 3: Cài đặt**

Trong `src-tauri/src/models/service.rs`:
- Trước `/// Trạng thái gửi giao diện.` (dòng 139) thêm:

```rust
/// Model nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.5), cho Cài đặt › Phụ đề › Người nói và Cài đặt › Model (kế hoạch 03).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SpeakerModel {
    /// Manifest không có mục `speaker` dùng được (chưa đăng: kế hoạch 07; hay cần app mới hơn). Bản dev dùng model của thư mục model
    /// dev, không hiện gì.
    Unavailable,
    /// Có trong manifest, máy chưa tải: tải nền khi bắt đầu phiên.
    Missing,
    /// Đang tải. Việc tải này giữ khóa bảo trì (`begin_work`): tải, xóa, kiểm gói trong lúc đó gặp `modelsBusy` (kế hoạch 07 bỏ).
    Downloading,
    Ready,
}
```

- Trong `ModelsView`, sau `pub update_available: bool,` thêm:

```rust
    /// Model nhận giọng (kế hoạch 03).
    pub speaker: SpeakerModel,
```

- Trong `Inner`, sau `tray_shown: Option<bool>,` thêm:

```rust
    /// Đang tải model nhận giọng (`download_speaker_model`), cho `ModelsView::speaker`.
    speaker_downloading: bool,
```

  và trong khởi tạo `Inner { … }` (dòng 236–247), sau `tray_shown: None,` thêm `speaker_downloading: false,`.

- Trong `view`, trước `ModelsView {` thêm:

```rust
        let speaker = match manifest.and_then(|m| m.speaker_model(&self.cfg.app_version)) {
            None => SpeakerModel::Unavailable,
            Some(entry) if self.store.is_installed(&entry) => SpeakerModel::Ready,
            Some(_) if inner.speaker_downloading => SpeakerModel::Downloading,
            Some(_) => SpeakerModel::Missing,
        };
```

  và trong `ModelsView { … }` thêm `speaker,` sau `update_available,`.

- Sau `impl Drop for Work<'_> { … }` (dòng 189–193) thêm guard của cờ (rà soát A-N1: lối ra sớm `create_dir_all` hay panic giữa lúc tải không để cờ kẹt ở `true`):

```rust
/// Cờ "đang tải model nhận giọng" (`ModelsView::speaker`) bật trong lúc giữ; thả ra (kể cả lối ra sớm hay panic) thì tắt.
struct SpeakerDownloading<'a>(&'a ModelService);

impl<'a> SpeakerDownloading<'a> {
    fn start(service: &'a ModelService) -> Self {
        service.lock().speaker_downloading = true;
        Self(service)
    }
}

impl Drop for SpeakerDownloading<'_> {
    fn drop(&mut self) {
        self.0.lock().speaker_downloading = false;
    }
}
```

- Trong `download_speaker_model`: ngay sau khối `if std::fs::create_dir_all(self.store.dir()).is_err() { return false; }` thêm

```rust
        let downloading = SpeakerDownloading::start(self);
        self.changed(app);
```

  và thay hai dòng cuối hàm

```rust
        drop(work);
        installed
```

  bằng

```rust
        drop(downloading);
        drop(work);
        self.changed(app);
        installed
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib -- models:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (test so nguyên văn `ModelsView` nếu có thì thêm `"speaker": "unavailable"` vào đúng chỗ đó).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt -p meeting-translator -- --check && git status --short`
Expected: `test result: ok` (ghi số đạt; phải hơn mốc Task 0b đúng số test mới); clippy sạch; `--check` của fmt không in gì. Không commit.

---

**Tiếp theo:** file `2026-10-26-phan-biet-nguoi-noi-03b-giao-dien.md`, Task 11.

---

## Phủ spec (cả file 03 và 03b)

"03 T5" là Task 5 của file này; "03b T14" là Task 14 của file 03b.

| Mục spec | Nội dung | Task |
|---|---|---|
| §8.1 | tên có màu ở dòng đầu mỗi lượt (0,56 em, đậm), vạch màu 0,16 em ở mọi câu, câu sau của cùng người không lặp tên | 03b T12 (`decorate`), T14, T15, T21 |
| §8.1 | bảng 8 màu cho nền tối; giọng N lấy màu theo thứ tự xuất hiện | 03 T3 (chỉ số màu, QĐ 1, 2); 03b T14 (CSS), T21 (màu đo bằng `getComputedStyle`) |
| §8.1 | giọng chưa xác định: chưa nhãn, chưa vạch; có `Assign` thì gắn ngay đúng dòng; tên đổi (đổi tay, gộp, tên thật về muộn) thì đổi tại chỗ | 03 T4, T6 (`set_speaker`, phát bảng khi đổi); 03b T12, T13 (`setSpeaker`, `mergeVoices`), T14 (memo theo dòng) |
| §8.1, §6.7 | dòng mời cấp quyền ở trên cùng, nền mờ, chữ nhỏ; "Mở Cài đặt" và ✕ (ẩn tới hết phiên); thanh đã khóa thì không hiện | 03 T7 (`open_speaker_settings`); 03b T13 (`askDismissed`), T15, T20, T21. Điều kiện hiện (`askAccess`): kế hoạch 04 |
| §8.1 | công tắc "Phân biệt người nói" tắt thì thanh như hiện nay | 03 T5, T6 (`active`, `turn_off`); 03b T14 (không giọng thì markup cũ), T20 (điều kiện `overlay`) |
| §8.2 | bản chép lời: chip có chấm màu ở đầu mỗi lượt, vạch trái; bảng màu đậm cho nền sáng, nền tối dùng bảng của thanh | 03b T17, T21 |
| §8.2 | menu: "Đổi tên" ≤ 40 ký tự, "Chọn người trong cuộc họp" (`participants`), "Gộp vào người khác ▸"; áp cho mọi câu của giọng trong phiên | 03 T3, T4, T7; 03b T16, T18, T21 |
| §8.2 | Lịch sử hiện nhãn đã lưu, không sửa được | 03 T8; 03b T17 (không `onSpeaker`), T20 (`history-speakers`) |
| §8.3 | nhóm "Người nói": hai công tắc bật sẵn, đúng chữ spec; "Lấy tên" tắt khi "Phân biệt" tắt; "Quyền Trợ năng" chỉ macOS, dùng chung với Gõ dịch; không thêm tab | 03 T2, T5; 03b T19, T21 |
| §8.4 | chữ mới đủ 5 ngôn ngữ; `check-i18n` đạt | 03 T2; 03b T20, T21 |
| §8.4, §10 | `overlay` thêm đúng một lệnh không tham số `open_speaker_settings` (chỉ hiện cửa sổ chính ở Cài đặt › Phụ đề); `main` thêm `rename_speaker`, `merge_speakers` và hai khóa cài đặt | 03 T5, T7 (test ACL `the_overlay_only_gains_open_speaker_settings`) |
| §9 | `Subtitle.speaker` (đã có ở 02); `subtitle://speaker`; `speaker://roster {voices: [{id, label, color, source, room}], participants}`, `label` tính sẵn | 03 T3, T4, T6; khác chữ spec: `color` là chỉ số (QĐ 1), thêm `mergedInto`, `askAccess`, `rev` (QĐ 4, QĐ 25: bảng tới muộn không đè bảng mới) |
| §9 | bản chép lời trong bộ nhớ giữ `speaker` từng dòng và bảng người nói của phiên; đổi tên, gộp sửa bảng này | 03 T4 |
| §9 | Lịch sử: cột `speaker TEXT` rỗng được, nhãn lúc ghi (sau đổi tên), trong SQLCipher, chỉ khi Pro và bật "Lưu lịch sử" | 03 T8 (`save_if_enabled` không đổi điều kiện) |
| §9 | xuất TXT `[giờ] Lan: …`, SRT tùy chọn tiền tố, Markdown `**Lan:** …`; không nhãn thì như cũ | 03 T9; 03b T16, T17 |
| §9 | cài đặt `speakerDiarization`, `speakerNames` = `true`; dòng mời đã ẩn chỉ nhớ trong phiên | 03 T5; 03b T13 |
| §4.4 | dòng đang nói mang giọng của câu nó nối tiếp; lượt mới chưa nhãn | (kế hoạch 02) + 03b T14, T15, T20 (`overlay-speakers-live`); QĐ 5 (ghi chú a) |
| §4.5 | chưa có model thì tính năng tắt lặng lẽ, Cài đặt ghi "đang tải" | 03 T10; 03b T19 (ghi chú b, phần nhìn thấy) |
| §4.5 | tải model cùng gói đang dùng | để kế hoạch 07 (QĐ 15, ghi chú d) |
| §10 | không lưu giọng (không đổi); tên chỉ trong RAM và Lịch sử mã hóa (Pro); tên không vào log, thông báo lỗi; không quyền mới | 03 T3 (`SpeakerError` không có tên; `clean_name` bỏ ký tự điều khiển và định dạng vô hình), T7 (test lỗi không có tên), T8; 03b T12, T17, T18 (cô lập hướng chữ của tên); không thêm entitlement hay capability nào khác. Dữ liệu của app đã cài khi chạy bản dev: QĐ 22 |
| §12 | test migration Lịch sử, xuất file, sự kiện tới giao diện, capability `overlay` chỉ thêm `open_speaker_settings` | 03 T6, T7, T8, T9 |
| §12, A-spk7 | phần capability `overlay` | 03 T7 |
| §13 mục 3 | thanh phụ đề, bản chép lời, menu đổi tên và gộp, Cài đặt, Lịch sử, xuất file, 5 ngôn ngữ | toàn bộ file 03 và 03b |
| Ghi chú (c) của 02 | bấm Dừng mất nhãn vài đoạn cuối | chấp nhận (QĐ 16) |

## Để kế hoạch sau

- **Kế hoạch 04 (đọc tên macOS):** điều kiện của dòng mời (`RosterView.ask_access`: đang dịch, worker thấy cửa sổ họp, chưa có quyền, "Lấy tên" bật); tên tự động vào `SpeakerBook` (trường `auto_name` đã có, nguồn `name`) và `participants`; nhãn "Phòng A · giọng 1" cho một tên khớp nhiều giọng (spec §6.6: thêm chuỗi i18n phía Rust như `speaker_voice`); dùng `speakerNames` (`Load.names_enabled`, `SetNames`); thử quyền Trợ năng với binary `speaker-worker` thật; bậc "tạm dừng đọc tên" khi quá tải. Nút "Mở Cài đặt" và cuộn tới nhóm Người nói đã nối sẵn ở 03. **Tên tự động (`auto_name`) và tên người tham dự (`participants`) phải đi qua `transcript::speakers::clean_name`** (bỏ ký tự điều khiển và định dạng vô hình, ≤ 40 ký tự; rà soát A-N6); bỏ trùng `participants` ở phía Rust (giao diện vẫn chịu được tên trùng, rà soát B-N6). `get_transcript` chưa trả `participants` (rà soát B-N12): cửa sổ chính mở hay tải lại giữa phiên thì "Chọn người trong cuộc họp" trống tới bảng kế tiếp; khi có `participants` thật thì thêm chúng vào `Transcript` hay phát lại bảng khi cửa sổ chính mở. **Bản dev dùng file DB riêng `data-dev.db` (QĐ 22, Task 0b), nên chạy bản dev không còn cần sao lưu, khôi phục `data.db`**, trừ khi nhánh đó đổi hành vi này (tên file DB, tên mục khóa, thư mục dữ liệu); khi đó dùng lại hai đoạn lệnh của 03b Task 23 Step 1 và Step 3. Bản dev cũng có mục khóa riêng `db-key-dev` (QĐ 22), nên bấm "Xóa toàn bộ dữ liệu" ở bản dev không còn ảnh hưởng `data.db` và `db-key` của app đã cài ("Xóa model và dữ liệu" còn xóa thư mục `models/` dùng chung, tải lại được).
- **Kế hoạch 05 (Windows):** bộ đọc UI Automation (Windows không có dòng "Quyền Trợ năng": đã đúng ở 03b T19). **Bản dev trên Windows cũng dùng file DB riêng** (`%LOCALAPPDATA%\com.aitranslator.desktop\data-dev.db`, QĐ 22, Task 0b), nên không cần sao lưu, khôi phục `data.db` của app đã cài trước khi chạy bản dev, trừ khi nhánh đó đổi hành vi này (khi đó viết lại hai đoạn lệnh của 03b Task 23 bằng PowerShell với cùng các lớp an toàn: so bản chép bằng `Get-FileHash`, đường dẫn sao lưu cố định, kiểm hai app đã thoát bằng `Get-Process`, kiểm `data.db.unreadable-*` mới, chép sang tên tạm rồi `Move-Item`, không xóa trước khi chép xong). Mục khóa DB của bản dev trong Credential Manager cũng riêng (`db-key-dev`, QĐ 22), nên bấm "Xóa toàn bộ dữ liệu" ở bản dev không còn ảnh hưởng `data.db` và `db-key` của app đã cài.
- **Kế hoạch 06:** báo cáo `speaker_health`; bộ che báo cáo lỗi thêm luật kiểm tên người (spec §10).
- **Kế hoạch 07:** mở `speaker::enabled()` cho bản phát hành (giữ hai khóa cài đặt); đăng model, mục `speaker` của `models.json`, `pnpm models:update`; sửa gốc rễ ghi chú (b) (không giữ khóa bảo trì suốt lúc tải model nhận giọng) và làm ghi chú (d) "tải cùng gói" (QĐ 15); thêm `speaker::` vào bước test bản phát hành của `release.yml` (`results/02-tong-hop.md`, "Còn mở"); chính sách quyền riêng tư, website (có thể chụp lại ảnh với `speakers=1`), nghiệm thu A-spk1–7.
- **Chưa xếp kế hoạch nào (spec không có):** thao tác "tách" một giọng bị gộp (spec §14), bỏ một lần gộp tay, tìm kiếm theo tên người nói trong bản chép lời.

## Rủi ro và điều chưa biết

| Rủi ro | Cách xử lý trong kế hoạch |
|---|---|
| `ALTER TABLE lines ADD COLUMN speaker TEXT` trên bảng `WITHOUT ROWID` của SQLCipher chưa chạy thử trên DB thật | Test nâng DB phiên bản 1 (03 T8) chạy đúng SQLCipher của app; lỗi thì dừng, báo chủ dự án, không tự đổi cách migrate |
| **Bản dev của nhánh nâng `data.db` thật của máy chủ dự án lên phiên bản 2** (cùng `identifier`, cùng thư mục dữ liệu, cùng khóa): app đã cài (0.3.1, mọi bản từ `main` trước khi 03 phát hành) gặp `DbError::Newer(2)`: từ điển rỗng lặng lẽ, Lịch sử phiên mới không lưu, màn hình Lịch sử báo `dataUnavailable`; nếu `main` có migration số 2 riêng trước khi gộp thì DB đã bị nâng bỏ qua migration đó | **ĐÃ QUYẾT 2026-10-27, chặn tận gốc ở Task 0b (trước Task 1):** bản debug dùng `data-dev.db`, bản phát hành giữ `data.db`; app đã cài không bị đụng; Lịch sử và từ điển của bản dev tách riêng, bắt đầu rỗng (QĐ 22, mục 10 dưới). Sao lưu của 03b Task 23 giữ làm bảo hiểm phụ: sau khi thử `data.db` phải không đổi byte. Khóa cũng tách (`db-key-dev`, bổ sung cùng ngày): bấm "Xóa toàn bộ dữ liệu" ở bản dev không còn xóa khóa của app đã cài (QĐ 22) |
| **Chính bước khôi phục xóa mất bản DB duy nhất** (rà soát lần 2, A-Q1): sao lưu hỏng mà không ai thấy, `$DATA` rỗng, chọn nhầm thư mục sao lưu, bản dev còn ghi `data.db-journal` lúc khôi phục, khóa DB bị thay (`data.db.unreadable-*` mới); khởi động lại máy giữa hai bước (app đã cài tự mở) | Từ Task 0b bước khôi phục chỉ chạy khi `data.db` đổi byte (bình thường không đổi; Lịch sử, từ điển của bản dev nằm ở `data-dev.db`, không bị dời). Hai đoạn lệnh của 03b Task 23 chạy bằng `bash -euo pipefail`: `cmp` từng file, đường dẫn sao lưu ghi vào file cố định, `pgrep` cả hai app trước khi đụng DB, dừng khi có `data.db.unreadable-*` mới, khôi phục bằng chép sang tên tạm rồi `mv`, `data.db` đã đổi dời vào `ban-dev/` chứ không xóa; cảnh báo ở đầu Task 23. Chưa chạy thử thật (cần chủ dự án) |
| App ≤ 0.3.1 gặp DB phiên bản 2 thì từ chối mở Lịch sử và từ điển (`DbError::Newer`) nếu người dùng tự cài bản cũ hơn | Như mọi lần nâng schema; app không tự hạ phiên bản (QĐ 19) |
| Markup của `react-dom/server` cho biến CSS (`style="--spk:var(--spk-1)"`) và tên thuộc tính `maxlength` | Test so markup theo cách React 19 vẽ; nếu khác (ví dụ thêm `;` cuối) thì sửa chuỗi kỳ vọng theo kết quả thật của lần chạy đỏ đầu tiên, không đổi mã |
| Vẽ thanh phụ đề: `decorate` chạy O(n) mỗi lần danh sách dòng đổi (≤ 1000 dòng, cùng bậc với `visibleRows` đang có), chưa đo | Giao diện chạy trong webview, không chạm luồng phụ đề (A-spk4 đo pipeline, đã đạt ở 02); dòng memo chỉ vẽ lại dòng đổi. Muốn có số thì đo bằng React Profiler lúc thử app dev (03b T23) |
| `color-mix()` của chip (macOS 14 = Safari 17, WebView2) | Cả hai hỗ trợ, và `main.css` đã dùng `color-mix` từ trước; chữ chip có `color: var(--spk)` dự phòng ngay trước (QĐ 24); chưa thử trên Windows thật (kế hoạch 05) |
| Dòng mời đè lên lời nhắc ở góc phải khi cả hai dài | Dòng mời đặt thấp hơn hàng chỉ báo (03b T14); màn hình `overlay-speakers-ask-notes` kiểm hai khối không giao nhau ở 5 ngôn ngữ (03b T20, T21); điều kiện thật ở kế hoạch 04 |
| Bảng người nói tới giao diện không theo thứ tự (đổi tên đúng lúc worker báo giọng mới) làm tên vừa đổi "quay lại" | `rev` tăng dần, giao diện bỏ bảng cũ hơn; `get_transcript` mang `speakersRev` (QĐ 25; 03 T4, 03b T13, T16) |
| Worker tự gộp giọng đích của một lần gộp tay (ca hiếm: tự gộp mặc định tắt, `merge_theta` 1,10) | Bỏ lần gộp tay đó, giọng hiện lại như chính nó (03 T3); tên đổi tay của giọng bị worker gộp đi mất lặng lẽ (các câu của nó đã sang giọng kia) |
| Bật tự gộp của worker (`merge_theta` dưới 1,10) khi chưa sửa: worker gộp giọng R vào Q thì tên người dùng đặt cho R không sang Q (câu cũ của R thành "Người Q") và các giọng đã gộp tay vào R bị tách ra lại, vì bảng giọng không cho biết R gộp vào đâu (rà soát mã 03, mục 6) | Chưa sửa ở 03 (spec §5.4 để tự gộp tắt). **Phải xử lý trước khi bật tự gộp:** đưa `from → into` của `Merged` vào `EventSink` (hay `Roster`) để `SpeakerBook` chuyển `user_name` sang Q (nếu Q chưa có tên) và trỏ lại các lần gộp tay vào Q |
| WebView của thanh phụ đề tải lại giữa phiên (tiến trình WebContent chết): câu mới không có nhãn người nói tới lần bảng người nói đổi kế tiếp, vì thanh chỉ nhận bảng qua sự kiện (rà soát mã 03, mục 8) | Chấp nhận: đánh đổi để giữ ACL của thanh phụ đề hẹp (chỉ thêm `open_speaker_settings`, không có lệnh đọc bảng; ưu tiên 3). Thanh tạo một lần lúc khởi động, ẩn hay hiện chứ không đóng, nên bình thường không xảy ra |
| Menu ở dòng gần đáy làm trang dài thêm (không lật lên trên) | Cuộn được; ảnh 03b T21 |
| Người khác chen vào trong cửa sổ ghép 700 ms: chữ của người mới hiện tạm dưới màu người cũ trên dòng đang nói | Đúng chữ spec §4.4, đổi một lần khi câu chốt (QĐ 5) |
| Bật lại "Phân biệt người nói" giữa phiên không có tác dụng tới phiên sau, không có chữ báo | Xem "Điều cần chủ dự án quyết" mục 2 |
| `Manifest::speaker_model` ghi cảnh báo mỗi lần `ModelsView` dựng nếu mục `speaker` của manifest sai dạng (lúc tải, `changed()` chạy 4 lần mỗi giây) | Chỉ khi manifest ký sai; mục `speaker` chỉ có từ kế hoạch 07, sửa cùng lúc nếu thấy |
| Hai giọng được đặt trùng tên thì Lịch sử coi là một người | Ghi ở QĐ 12; tên do người dùng chọn |
| Tên có ký tự định dạng hai chiều (U+202E…), kể cả tên người tham dự do người khác đặt | `clean_name` bỏ ký tự định dạng vô hình, giữ ZWJ, ZWNJ (QĐ 11; test 03 T3); giao diện bọc tên chèn vào câu bằng FSI…PDI và `unicode-bidi: isolate` (03b T12, T14, T17, T18). Tên tự động của kế hoạch 04 phải qua cùng `clean_name` |
| `check-i18n.mjs` 5 ngôn ngữ chạy lâu (vài phút) và cần Google Chrome | Lọc bằng `ONLY=` (03b T21); không cài Playwright |

## Điều cần chủ dự án quyết

Mặc định ghi ở mỗi mục là cách kế hoạch này làm nếu chủ dự án không nói khác.

1. **Sao chép (mọi gói) có nhãn người nói** (QĐ 13). Mặc định: có, như file TXT. Cách khác: chỉ khi Pro (thêm `pro::is_pro` ở `data::transcript_text`, bỏ nhãn khi Free; khoảng 10 dòng và một test).
2. **Bật lại "Phân biệt người nói" giữa phiên** có tác dụng từ phiên sau (QĐ 8). Mặc định: không thêm chữ nào (giữ đúng chữ spec §8.3). Cách khác: thêm ghi chú "Áp dụng từ phiên dịch sau" dưới công tắc khi đang dịch và công tắc vừa bật (một khóa i18n, 5 ngôn ngữ).
3. **Nhóm "Người nói" chỉ hiện khi bản này có tính năng** (`AppInfo.speakerAvailable` = `speaker::enabled()`, QĐ 9): bản phát hành không thấy gì mới tới kế hoạch 07. Mặc định như vậy.
4. **Ghi chú (b) và (d) của kế hoạch 02 để kế hoạch 07** (QĐ 15): 03 chỉ hiện trạng thái "đang tải". Mặc định như vậy; muốn làm ngay ở 03 thì thêm một Task đưa model nhận giọng vào job tải gói (đổi `ModelService`, khoảng 1 ngày làm và test).
5. **SRT mặc định không có tên** (ô "Thêm tên người nói" tắt, QĐ 14). TXT, Markdown luôn có tên khi có nhãn.
6. **"Người N" theo thứ tự xuất hiện**, không theo mã giọng (QĐ 2; khác chữ QĐ 8 của kế hoạch 02, đúng chữ spec §5.3).
7. **Lọc ký tự định dạng hai chiều trong tên** (U+202A–U+202E, U+2066–U+2069, U+200E, U+200F…; giữ ZWJ, ZWNJ): người điều phối đã chọn làm ngay ở 03 (QĐ 11; rà soát A-N6, B-N8). Chủ dự án xem lại danh sách ký tự bị bỏ nếu muốn khác.
8. **Đổi tên, gộp chỉ trong phiên đang chạy** (QĐ 10): phiên vừa dừng chỉ đọc như Lịch sử.
9. **Cho phép commit** phần 03 khi xong (đang để ở working tree như kế hoạch này dặn).
10. **Cho bản debug dùng file DB riêng để chặn tận gốc việc bản dev nâng DB của app đã cài** (QĐ 22; rà soát A-C1)? Ví dụ trong `db::install`, dưới `cfg(debug_assertions)`, dùng tên file khác (như `data-dev.db`), giữ nguyên `identifier` để quyền hệ thống (TCC) và kho khóa vẫn dùng chung. **ĐÃ DUYỆT 2026-10-27: có.** Làm ở Task 0b (trước Task 1): bản debug dùng `data-dev.db`, bản phát hành giữ `data.db`; thư mục dữ liệu và quyền hệ thống vẫn dùng chung; khóa DB riêng (`db-key-dev`, bổ sung cùng ngày: bấm "Xóa toàn bộ dữ liệu" ở bản dev không xóa `db-key` của app đã cài); Lịch sử và từ điển của bản dev tách khỏi app đã cài, bắt đầu rỗng. Sao lưu, khôi phục của 03b Task 23 giữ làm bảo hiểm phụ (`data.db` phải không đổi byte sau khi thử).
11. **Xem lại: chữ của nhãn dạng chip trên nền sáng đậm màu hơn mẫu đã duyệt một chút** (pha 80% màu giọng với 20% màu chữ, QĐ 24) để đạt tương phản 4,5:1; chấm, vạch, viền giữ đúng màu spec §8.2. Mặc định: dùng màu đã pha. Cách khác: giữ đúng màu mẫu cho chữ (6/8 màu dưới 4,5:1).
12. **Xem lại: dòng "Quyền Trợ năng" ẩn khi tắt "Lấy tên"** (QĐ 23; spec §8.3 không đặt điều kiện). Mặc định: ẩn, vì quyền chỉ cần để đọc tên. Cách khác: luôn hiện trên macOS (sửa một điều kiện ở 03b T19 và hai test).
