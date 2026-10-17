# AI Translator: Gõ dịch — soạn tin bằng tiếng mình, dán bản dịch vào ô nhập bất kỳ — Design

**Ngày:** 2026-10-17
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-17 (các quyết định ở mục 0). Làm trên nhánh `go-dich` (worktree `meeting-translator-work/go-dich`), **không merge, không push, không phát hành khi chưa được cho phép**.
**Quan hệ với spec khác:** thêm tính năng F11 vào spec gốc `2026-09-29-desktop-meeting-translator-design.md` (§3.1, §4.3, §4.6 mới, F10 phím tắt; mục 10). Dùng lại: hàm dịch và tiến trình phụ của §6.5 và §5, luật bản quyền của §6.8 và `2026-10-07-three-plans-single-device-design.md`, NSPanel của thanh phụ đề (§4.4), phím tắt toàn cục (F10), danh sách mã lỗi gửi/không gửi của `2026-10-17-diagnostics-reports-design.md` §1.

---

## 0. Yêu cầu và quyết định của chủ dự án

- **Yêu cầu gốc:** chat hay nhập chữ ở bất kỳ ô nhập nào (web, app) bằng tiếng Việt, app hiện bản dịch sang tiếng khác (ví dụ English); gõ xong thì có câu dịch hoàn chỉnh; bấm Enter một lần thì app đưa bản dịch vào ô nhập; người dùng xem lại, đúng thì bấm Enter lần nữa để gửi.
- **Nơi dùng:** cả bốn nhóm phải chạy tốt: chat trên trình duyệt, app chat desktop (phần lớn là Electron), app native của hệ điều hành, khung chat trong app họp.
- **Hướng kỹ thuật: ô soạn nổi riêng của app** (hướng B), không theo dõi ô nhập của app khác (hướng A). Lý do chủ dự án chấp nhận:
  - chạy giống nhau ở mọi app, vì không cần đọc ô nhập của app khác (đọc ô nhập của app Electron và trình soạn thảo trên web không chắc chắn);
  - gõ Telex/VNI trong ô của chính app nên luôn ra đúng chữ;
  - app không nghe bàn phím, không chặn phím Enter của hệ thống: hợp với cam kết quyền riêng tư, và trên Windows không cần hook bàn phím (dễ bị phần mềm diệt virus nghi ngờ khi app chưa ký);
  - đổi lại mỗi tin nhắn thêm một lần bấm phím tắt.
- **Gói:** dùng được ở **mọi gói còn hiệu lực** (Free trong thời gian dùng thử, gói trả phí còn hạn), **không trừ phút** hạn mức.
- **Ngôn ngữ đích:** một ngôn ngữ trong Cài đặt, riêng với ngôn ngữ đích của phụ đề. Mặc định "tiếng người bên kia", tính từ cài đặt phụ đề (mục 2.1); người dùng chọn riêng thì thôi đi theo phụ đề.
- **Phím tắt mặc định:** **⌃⌥G** trên macOS, **Ctrl+Alt+G** trên Windows, đổi được trong Cài đặt › Phím tắt. Chủ dự án hỏi có tổ hợp nào không trùng với bất kỳ thứ gì không; câu trả lời đã báo: không tổ hợp nào bảo đảm được điều đó (app nào cũng tự đặt phím tắt riêng), và tổ hợp càng dễ bấm thì càng hay bị dùng. Nhóm ⌃⌥ được chọn vì các phím tắt có sẵn của app đã dùng nhóm này (F10) và rất ít app khác đụng tới. Các tổ hợp đã loại: ⌥Space (ChatGPT desktop, Alfred), Alt+Space (menu cửa sổ Windows, PowerToys Run), Ctrl+Space và ⌃⌥Space (đổi bộ gõ), Alt+Z (phím chuyển của Unikey), Alt+D và Alt+E (trình duyệt trên Windows), Alt+S (gửi thư trong Outlook), Alt+A (chụp màn hình của WeChat PC). Bấm hai lần một phím bổ trợ (⌥⌥) không trùng nhưng phải nghe bàn phím, nên không làm.
- **Clipboard:** bản dịch nằm lại trong clipboard sau khi dán; app **không khôi phục** nội dung clipboard cũ. Đây là đường dự phòng khi tự dán không vào được, và tránh phải đoán lúc app kia đã dán xong.
- **Không dùng từ điển thuật ngữ:** từ điển hiện chỉ có một chiều (cho phụ đề); áp vào chiều ngược lại có thể ép ra bản dịch sai (mục "deadline → hạn chót" sẽ chèn chữ tiếng Việt vào câu tiếng Anh).
- **Tên tính năng:** "Gõ dịch" (en: "Type & Translate"); ja/zh/ko dịch theo cùng cách của spec 2026-10-12, không có người bản ngữ duyệt.
- **Nền tảng:** viết code cho cả macOS và Windows; thử tay macOS trước, Windows khi có máy (quyết định 2026-10-06: làm xong macOS trước).
- **Chi tiết thêm khi viết spec** (không có trong hội thoại duyệt; chủ dự án xem lúc đọc spec): giữ bản nháp khi đóng ô và chọn sẵn khi mở lại (mục 1.2); bấm ra ngoài ô thì đóng như Esc (mục 1.3); giới hạn 4000 ký tự và 400 token mỗi dòng, dịch tách theo dòng (mục 1.2, 3.3); lệnh dán chỉ dán kết quả Rust đã lưu, không nhận chữ từ giao diện (mục 3.6); thiếu quyền Trợ năng thì ô không đóng mà hiện hộp hướng dẫn (mục 4.2); bộ tiêu chí nghiệm thu GD1–GD6 (mục 8.2).

## 1. Trải nghiệm người dùng

### 1.1 Luồng chính

1. Con trỏ đang ở ô chat của một app bất kỳ. Người dùng bấm ⌃⌥G (Ctrl+Alt+G).
2. Ô soạn hiện ra, con trỏ nằm sẵn trong ô gõ. App chat vẫn là app phía trước (macOS) hoặc được app ghi nhớ (Windows), mục 3.1.
3. Người dùng gõ, ví dụ "Mai mình gửi báo cáo nhé". Ngừng gõ 400 ms thì app dịch toàn bộ chữ đang có; bản dịch hiện dần bên dưới ô gõ. Gõ tiếp thì bản dịch cũ bị hủy và app dịch lại khi ngừng gõ lần sau.
4. **Enter lần 1:** ô soạn đóng, con trỏ về lại ô chat cũ, app dán bản dịch vào đó (mục 4). Không có gì được gửi đi.
5. Người dùng xem lại trong ô chat; **Enter lần 2** (do app chat xử lý) thì gửi.

### 1.2 Ô soạn

- **Vị trí:** giữa màn hình đang có con trỏ chuột theo chiều ngang, mép trên cách đỉnh màn hình 25% chiều cao màn hình (kiểu Spotlight). Không kéo được, không nhớ vị trí.
- **Kích thước:** rộng 560 px (logic); cao theo nội dung, từ 120 tới 420 px.
- **Nổi trên mọi cửa sổ**, kể cả app đang toàn màn hình, như thanh phụ đề (§4.4 của spec gốc).
- **Giao diện:** theo cài đặt sáng/tối và ngôn ngữ giao diện của app.
- **Nội dung, từ trên xuống:**
  - Dòng đầu: "Gõ dịch · → English" (tên ngôn ngữ đích theo ngôn ngữ giao diện) và chỉ báo trạng thái: "Đang nạp model…", "Đang dịch…", "Đã là English", hay để trống.
  - Ô gõ nhiều dòng, tự cao lên tối đa 6 dòng rồi cuộn trong ô.
  - Vạch ngăn, rồi bản dịch (chỉ đọc, chọn và sao chép được). Bản dịch chưa khớp chữ đang có (đang chờ hay đang dịch) hiện mờ.
  - Chân ô: gợi ý phím, "Enter: dán · Shift+Enter: xuống dòng · Esc: đóng" ("Enter: chép" khi không tự dán, mục 4.2); hoặc hộp lỗi/hộp quyền (mục 5, mục 4.2) thay chỗ gợi ý.
- **Bản nháp:** chữ trong ô gõ giữ trong bộ nhớ tới khi dán (hay chép) thành công. Đóng bằng Esc, bằng phím tắt hay bằng cách bấm ra ngoài thì giữ bản nháp; mở lại thấy chữ cũ, **được chọn sẵn toàn bộ** để gõ đè được ngay. Dán xong thì ô trống. Bản nháp mất khi thoát app.
- **Độ dài:** ô gõ nhận tối đa 4000 ký tự (giới hạn dữ liệu từ giao diện, §10.2 của spec gốc). Mỗi dòng (mục 3.3) quá 400 token thì báo "Dòng quá dài, hãy tách thành nhiều dòng hay nhiều tin", không dịch.

### 1.3 Phím và chuột trong ô soạn

| Thao tác | Tác dụng |
|---|---|
| Enter, bản dịch đã khớp chữ đang có | Dán (mục 4) |
| Enter, đang chờ hay đang dịch | Chân ô hiện "Đang dịch…"; dịch xong thì dán. Gõ thêm chữ hay Esc trong lúc chờ thì bỏ lần dán đó |
| Enter, câu đã là ngôn ngữ đích (mục 2.2) | Dán nguyên văn chữ đã gõ |
| Enter, dịch lỗi | Dịch lại; **không bao giờ dán câu gốc** khi dịch lỗi, để không lỡ gửi nhầm ngôn ngữ |
| Enter, ô trống (chỉ có khoảng trắng) | Đóng ô |
| Enter, đang bị chặn (bản quyền, model; mục 5) | Không làm gì |
| Enter khi bộ gõ đang chọn chữ (`isComposing`, ví dụ bộ gõ Nhật, Trung, Hàn) | Chỉ chốt chữ của bộ gõ, không dán |
| Shift+Enter | Xuống dòng |
| Esc | Đóng ô, không dán, giữ bản nháp |
| Phím tắt Gõ dịch khi ô đang mở | Như Esc |
| Bấm chuột ra ngoài ô (ô mất focus) | Như Esc |

### 1.4 Cài đặt

Nhóm mới **"Gõ dịch"** trong Cài đặt:
- Công tắc **"Bật Gõ dịch"**, mặc định bật. Tắt thì gỡ đăng ký phím tắt (phím tắt đã chọn vẫn được lưu).
- **"Dịch sang"**: "Tự động (đang là: English)" hoặc một trong năm ngôn ngữ. "Tự động" tính theo mục 2.1 và ghi rõ kết quả hiện tại.
- **Chỉ macOS — "Tự dán vào ô đang gõ"**: công tắc, mặc định bật; kèm trạng thái quyền Trợ năng ("Đã cấp" / "Chưa cấp") và nút "Mở cài đặt Trợ năng". Windows không có mục này (luôn tự dán).
- Phím tắt nằm ở nhóm Phím tắt có sẵn, dòng mới "Mở Gõ dịch".

### 1.5 Gói và bản quyền

- Dùng được khi luật bắt đầu phiên (`License::start_block`, §6.8 của spec gốc) không chặn, **trừ** chặn vì hạn mức: Free còn trong dùng thử, hay gói trả phí còn hạn và key không xung đột. Hết phút của ngày (Free) hay của chu kỳ vẫn dùng được.
- Phải có hàm kiểm riêng (ví dụ `License::compose_block`) bỏ qua phần hạn mức nhưng giữ đủ mọi chặn khác. **Không** làm bằng cách gọi `start_block` rồi bỏ qua `QuotaExhausted`: nếu `start_block` trả `QuotaExhausted` trước khi xét các chặn khác thì một máy vừa hết phút vừa hết dùng thử sẽ lọt. Có test cho trường hợp này.
- Không cần mạng; không gọi license server khi dùng Gõ dịch (riêng trường hợp Free chưa có token dùng thử thì đi theo luật sẵn có: chặn với `TrialMissing`).
- Công tắc dev `AI_TRANSLATOR_DEV_PRO` không đổi gì thêm (Gõ dịch vốn không tính hạn mức).

## 2. Ngôn ngữ

### 2.1 Ngôn ngữ đích tự động ("tiếng người bên kia")

Cài đặt `compose.target = "auto"` (mặc định). Đầu vào: `target_language` (T), `source_languages`, `source_lock` của cài đặt phụ đề.

1. Lấy tập ngôn ngữ nguồn của phụ đề: `{source_lock}` nếu đang khóa, không thì `source_languages`. Bỏ T ra khỏi tập. Nếu còn **đúng một** ngôn ngữ L thì đích là L.
2. Nếu không: T khác English thì đích là **English**; T là English thì đích là **Tiếng Việt**.

Ví dụ: người dùng Việt (T = vi), nguồn tự nhận cả năm tiếng → English; khóa nguồn 日本語 → 日本語; T = en → Tiếng Việt. Đổi cài đặt phụ đề thì đích tự động đổi theo. Người dùng chọn một ngôn ngữ cụ thể thì giữ ngôn ngữ đó.

### 2.2 Nhận diện ngôn ngữ nguồn

Câu gõ không qua nhận dạng giọng nói nên không có ngôn ngữ do whisper báo. App nhận diện theo chữ viết (hàm thuần), xét theo thứ tự:

| Điều kiện (có ít nhất một ký tự…) | Kết quả |
|---|---|
| kana (Hiragana, Katakana) | `ja`, chắc chắn |
| Hangul | `ko`, chắc chắn |
| chữ Hán (không có kana) | `zh`, chắc chắn |
| chữ Latin mang dấu đặc trưng tiếng Việt: ă â đ ê ô ơ ư, hoặc nguyên âm mang dấu hỏi (U+0309) hay dấu nặng (U+0323) sau khi chuẩn hóa NFD | `vi`, chắc chắn |
| còn lại (Latin không dấu, số, ký hiệu) | **không chắc** |

- Chỉ khi nguồn **chắc chắn** trùng ngôn ngữ đích thì không dịch ("Đã là English…"; Enter dán nguyên văn).
- **Không chắc** thì vẫn dịch, không bao giờ bỏ qua; nguồn đưa vào `Job.src` là `vi` nếu đích khác `vi`, còn lại là `en`. Lý do: người Việt hay gõ không dấu; câu tiếng Anh gửi đi dịch sang English thì model trả gần như nguyên văn.
- Nguồn chỉ dùng để chọn mẫu prompt (mẫu tiếng Trung khi có tiếng Trung ở một phía, §6.5) và ngưỡng "bản dịch quá dài" của cặp ngôn ngữ (§6.5).

## 3. Kiến trúc

### 3.1 Cửa sổ ô soạn

- Cửa sổ WebView thứ ba, nhãn **`compose`**, trang `compose.html` (khai trong `vite.config.ts` cạnh `overlay.html`), tạo **ẩn sẵn lúc mở app** để bấm phím tắt là hiện ngay. Tạo bằng code như cửa sổ chính (`window.rs`), không có viền, không hiện trên taskbar hay Dock.
- **macOS:** chuyển thành NSPanel bằng `tauri-nspanel` (đang dùng cho thanh phụ đề, `overlay/macos.rs`):
  - kiểu **không kích hoạt app** (`NonactivatingPanel`, cùng cách xử lý `_setPreventsActivation:` của thanh phụ đề) nhưng **nhận được bàn phím** (`canBecomeKeyWindow` = true), giống Spotlight, Raycast;
  - level nổi trên cửa sổ thường, `canJoinAllSpaces` và `fullScreenAuxiliary`;
  - vì app chat vẫn là app phía trước suốt lúc ô soạn mở, ẩn ô soạn thì cửa sổ của app chat nhận lại bàn phím; không cần nhớ cửa sổ trước.
- **Windows:** cửa sổ topmost, kiểu tool window (không có trên taskbar). Ngay trước khi hiện, app ghi lại cửa sổ đang ở phía trước (`GetForegroundWindow`) để dán vào đúng cửa sổ đó (mục 4.3). Tiến trình nhận phím tắt toàn cục được phép đưa cửa sổ của mình lên trước.
- Hiện: đặt vị trí (mục 1.2) theo màn hình đang có con trỏ chuột, hiện, đưa focus vào ô gõ. Ẩn: không hủy cửa sổ.
- Mất focus (macOS: panel thôi là key window; Windows: cửa sổ mất kích hoạt) thì ẩn, như Esc.

### 3.2 Mô-đun Rust `src-tauri/src/compose/`

| File | Việc |
|---|---|
| `mod.rs` | Tạo, hiện, ẩn cửa sổ; việc của phím tắt; trạng thái (yêu cầu dịch hiện tại và kết quả của nó, cửa sổ trước trên Windows); các lệnh IPC (mục 3.6) |
| `target.rs` | Ngôn ngữ đích tự động (mục 2.1). Hàm thuần, có test |
| `detect.rs` | Nhận diện nguồn theo chữ viết (mục 2.2). Hàm thuần, có test |
| `worker.rs` | Luồng dịch của ô soạn (mục 3.3) |
| `paste.rs` | Trait `Paster` (ghi clipboard, kiểm quyền, gửi phím dán) với ba bản: macOS, Windows, bản giả cho test (mục 4) |

Phía giao diện: `src/compose/` (React, trang riêng), dùng chung kho chuỗi i18n và theme của app.

### 3.3 Dịch

- Dùng lại nguyên `pipeline::translate::translate()` với `Job { text, src, tgt, context: None, terms: &[], cancel }`: cùng mẫu prompt, tham số sinh, hậu xử lý, ngưỡng "bản dịch quá dài" và lần thử lại như phụ đề (§6.5).
- **Tách theo dòng:** chữ gõ được tách theo dấu xuống dòng; mỗi dòng có chữ được dịch riêng, lần lượt trong cùng một yêu cầu; dòng trống giữ nguyên; ghép lại bằng đúng các dấu xuống dòng gốc. Nhờ vậy giữ được bố cục tin nhiều dòng mà không phụ thuộc model có giữ dấu xuống dòng hay không, và mỗi dòng nằm gọn trong giới hạn token (mục 1.2). Nhận diện nguồn (mục 2.2) chạy trên cả đoạn, một lần.
- **Một luồng nền riêng** cho ô soạn, mỗi lúc tối đa một yêu cầu. Yêu cầu mới bật cờ hủy của yêu cầu cũ (cách của bản dịch tạm, §6.5). Mỗi yêu cầu có `id` tăng dần; kết quả của `id` cũ bị bỏ.
- Chữ dịch về dần qua sự kiện **`compose://delta`** (`id`, chỉ số dòng, phần chữ mới) và **`compose://done`** (`id`, kết quả: bản dịch đủ, "đã là ngôn ngữ đích", lỗi kèm mã). Sự kiện chỉ gửi cho cửa sổ `compose`.
- Thời gian chờ 400 ms sau lần gõ cuối nằm ở giao diện; giao diện gửi yêu cầu kèm toàn bộ chữ đang có.

### 3.4 Tiến trình phụ

- Mở ô soạn thì gọi `session::prewarm` như khi mở cửa sổ chính: chạy cả hai tiến trình phụ, `asr-worker` trước rồi `llama-server`, **giữ đúng thứ tự VRAM** của §5 và §6.5. Không làm chế độ "chỉ chạy `llama-server`": phiên phụ đề bắt đầu sau đó sẽ nạp whisper khi VRAM đã bị chiếm, dễ hết bộ nhớ trên máy Windows ít VRAM.
- Cái giá: trong lúc dùng ô soạn, app giữ khoảng 2,9 GiB RAM cho hai tiến trình phụ của gói Chuẩn (§8). Luật tắt sau 10 phút rảnh giữ nguyên; mỗi yêu cầu dịch của ô soạn gọi `SidecarManager::touch()` để tính lại từ đầu.
- Tiến trình phụ chưa sẵn sàng: ô soạn ghi "Đang nạp model…"; người dùng vẫn gõ được; sẵn sàng thì luồng dịch chạy yêu cầu mới nhất.
- **Khi đang có phiên phụ đề:** ô soạn dùng chung `llama-server` (một slot, `-np 1`), qua một client riêng từ `SidecarManager::mt()`. Yêu cầu của ô soạn xếp hàng chung với phụ đề. Vì chỉ dịch khi người dùng ngừng gõ, mỗi lần dịch có thể làm một câu phụ đề trễ thêm khoảng một lượt dịch (cỡ 0,5 giây). Chấp nhận; đo ở nghiệm thu (mục 8.2).

### 3.5 Cài đặt và phím tắt

- Khóa mới trong `Settings`: `compose.enabled` (bool, mặc định `true`), `compose.target` (`"auto"` hay mã ngôn ngữ, mặc định `"auto"`), `compose.autoPaste` (bool, mặc định `true`; chỉ có tác dụng trên macOS). Cài đặt cũ thiếu khóa thì nhận mặc định (`settings/migrate.rs`).
- `HotkeyAction::Compose` (khóa `compose`), mặc định `Ctrl+Alt+G` (macOS hiện là ⌃⌥G). Đi qua đúng luật kiểm và đổi phím tắt có sẵn (`hotkeys::check_all`, `rebind`): phải có Ctrl, Alt hay ⌘/Win, không trùng việc khác của app; Windows từ chối đăng ký thì báo như các phím tắt khác. `compose.enabled = false` thì không đăng ký phím này.

### 3.6 Lệnh IPC và phân quyền

- Lệnh của cửa sổ `compose` (tên chốt ở kế hoạch): xin dịch (`text` → `id`); dán (`id`): Rust dán **kết quả đã lưu của `id` đó**, không nhận chữ từ giao diện, nên cửa sổ ô soạn không gửi được chữ tùy ý vào app khác; đóng; đổi chiều cao (giới hạn 120–420); mở cài đặt Trợ năng (macOS); đặt "luôn chỉ chép" (`compose.autoPaste = false`); mở cửa sổ chính ở một màn hình (Model, Nâng cấp, Bản quyền).
- File quyền mới `src-tauri/capabilities/compose.json`: cửa sổ `compose` chỉ được gọi các lệnh trên; không lệnh nào của cửa sổ chính hay thanh phụ đề. `acl_tests` thêm test cho cửa sổ này, và test rằng hai cửa sổ cũ không gọi được lệnh của ô soạn.

### 3.7 Phiên bản thư viện

Các API cần thêm: pasteboard và gửi phím (`CGEventPost`), kiểm quyền Trợ năng (`AXIsProcessTrusted`, `AXIsProcessTrustedWithOptions`) trên macOS; clipboard, `SendInput`, `SetForegroundWindow` trên Windows. Kế hoạch chọn crate theo §6.12 của spec gốc: ưu tiên mở rộng crate đang có (dòng `objc2` 0.6 / `objc2-*` 0.3, thêm feature của `windows` 0.62) trước khi thêm crate mới; plugin Tauri (nếu dùng, ví dụ clipboard) phải cùng dòng với Tauri core và không cấp quyền cho cửa sổ nào; build lại toàn bộ và chạy test sau khi thêm.

## 4. Dán vào app khác

### 4.1 Trình tự chung

Khi giao diện gọi lệnh dán với `id` đã xong:
1. Lấy chữ cần dán: bản dịch của `id`, hay chữ gốc nếu kết quả là "đã là ngôn ngữ đích".
2. Kiểm có tự dán được không (macOS: `compose.autoPaste` và quyền Trợ năng; Windows: luôn được). Không được thì sang mục 4.2.
3. Ghi chữ vào clipboard (dạng văn bản thuần).
4. Ẩn ô soạn. macOS: chờ một khoảng cố định để cửa sổ của app chat nhận lại bàn phím (con số chốt ở spike S2, mục 7). Windows: đưa cửa sổ đã ghi về phía trước và chờ như mục 4.3.
5. Gửi ⌘V (macOS) hay Ctrl+V (Windows).
6. Xóa bản nháp. Clipboard giữ bản dịch (mục 0).

Không xác nhận được ô kia đã nhận chữ hay chưa: hệ điều hành không báo. Bản dịch luôn nằm trong clipboard để người dùng tự dán khi cần (mục 5).

### 4.2 macOS: quyền Trợ năng

- Gửi phím vào app khác (`CGEventPost`) cần quyền **Trợ năng** (Accessibility). App kiểm bằng `AXIsProcessTrusted()` **mỗi lần** trước khi dán, vì quyền có thể mất sau khi cập nhật (mục 9).
- `compose.autoPaste = true` mà chưa có quyền (lần đầu, hay quyền mất sau cập nhật): **ô soạn không đóng**. App chép bản dịch vào clipboard ngay, rồi chân ô hiện hộp: "Đã chép bản dịch. Muốn app tự dán, hãy cấp quyền Trợ năng." với hai nút:
  - **"Bật tự dán"**: gọi `AXIsProcessTrustedWithOptions` có hỏi (để app hiện trong danh sách) và mở System Settings › Quyền riêng tư & Bảo mật › Trợ năng;
  - **"Luôn chỉ chép"**: đặt `compose.autoPaste = false`.
  - Bản dịch đã chép thành công nên bản nháp được xóa như khi dán (mục 1.2). Enter hay Esc lúc hộp đang hiện thì đóng ô; người dùng bấm ⌘V ở ô chat. Lần dán sau mà vẫn chưa có quyền thì hộp lại hiện.
- `compose.autoPaste = false`: Enter chép vào clipboard rồi đóng ô, không hỏi gì; chân ô ghi "Enter: chép · ⌘V để dán".
- Phím ⌘V gửi bằng mã phím của chữ "v" trên bố cục bàn phím đang dùng; không tìm được thì dùng mã phím V của bố cục ANSI.
- Lời hướng dẫn bật lại quyền sau khi cập nhật (gỡ mục cũ rồi thêm lại, hay cách khác) chốt theo kết quả spike S3 (mục 7).

### 4.3 Windows

- Không cần quyền. Trước khi gửi Ctrl+V (`SendInput`), app đưa cửa sổ đã ghi ở mục 3.1 về phía trước (`SetForegroundWindow`) và chờ tới khi nó là cửa sổ phía trước (tối đa 300 ms). Cửa sổ đó không còn, hay quá 300 ms vẫn chưa lên trước, thì chỉ chép (không gửi phím, để Ctrl+V không rơi vào cửa sổ khác) rồi đóng ô.
- App kia chạy quyền admin thì Windows chặn phím giả từ app thường (UIPI): dán không vào, và app không biết. Bản dịch vẫn trong clipboard.

## 5. Xử lý lỗi

| Tình huống | Ô soạn làm gì |
|---|---|
| Chưa có model, hay đang tải, xóa, kiểm model (`ModelService::busy`) | Hộp lỗi ghi lý do, nút "Mở Model" (mở cửa sổ chính ở Cài đặt › Model hay màn hình tải model) |
| Hết dùng thử, Free chưa đăng ký được dùng thử, giờ máy chỉnh lùi, key xung đột, gói hết hạn, bị thu hồi, cần làm mới (mục 1.5) | Hộp lỗi ghi lý do theo cùng chữ của màn hình chính, nút "Nâng cấp" hay "Mở Bản quyền" tùy lý do |
| Tiến trình phụ không chạy được (đã quá số lần khởi động lại, §6.5) | "Chưa dịch được: bộ dịch đang lỗi"; Enter thử lại |
| Một dòng dịch hỏng cả hai lần thử | "Chưa dịch được"; Enter dịch lại; không dán câu gốc |
| Dòng quá 400 token | "Dòng quá dài…" (mục 1.2) |
| macOS thiếu quyền Trợ năng | Mục 4.2 |
| Ô kia không nhận phím giả (ô mật khẩu khi macOS bật Secure Input, app quyền admin trên Windows, app chặn dán) | App không phát hiện được; bản dịch vẫn trong clipboard. Ghi trong trang hỗ trợ |
| Phím tắt bị app khác giữ (Windows) | Báo ở Cài đặt › Phím tắt như các phím tắt khác. macOS không báo được (mục 9) |

- Mọi mã lỗi mới của Gõ dịch (ví dụ quá dài) thuộc danh sách **không gửi** báo cáo lỗi (spec 2026-10-17-diagnostics-reports §1); test bắt buộc phân loại mã mới đã có sẵn sẽ buộc việc này. Tiến trình phụ chết trong lúc ô soạn đang dịch vẫn được báo cáo như hiện nay (`sidecar_died`), vì báo cáo đó không chứa chữ.

## 6. Quyền riêng tư và pháp lý

- **Không có request mạng nào** từ Gõ dịch: dịch chạy trên máy; luật bản quyền dùng token đã lưu. Danh sách kết nối của A7 (§3.3 của spec gốc) không đổi.
- **Chữ gõ và bản dịch chỉ nằm trong bộ nhớ**: không vào bản chép lời, lịch sử, file nào trên đĩa, log hay báo cáo lỗi. Log của Gõ dịch chỉ ghi số liệu (số ký tự, số dòng, thời gian dịch, kết quả, mã lỗi), không bao giờ ghi chữ. Có test: chạy luồng dịch và dán với chữ đánh dấu, rồi kiểm log và hàng đợi báo cáo không chứa chữ đó. Không dựa vào bước che dữ liệu của báo cáo lỗi để giấu chữ.
- **App chỉ ghi vào clipboard**, không đọc clipboard, và không đọc chữ hay nội dung gì từ app khác. Quyền Trợ năng chỉ dùng để gửi phím dán.
- **Chính sách quyền riêng tư** (hiện là bản 1.3): có thể cần thêm một câu về việc ghi vào clipboard và xin quyền Trợ năng trên Mac. Chủ dự án quyết có sửa không, và sửa thì nâng phiên bản chính sách theo quy trình của `docs/legal`.

## 7. Spike trên macOS (làm trước kế hoạch chi tiết)

Ghi kết quả vào `bench/2026-10-17-go-dich/results/spike.md`.

| # | Câu hỏi | Đạt khi |
|---|---|---|
| S1 | Gõ trong WebView nằm trong NSPanel không kích hoạt app | Gõ "Mai mình gửi báo cáo nhé" ra đúng từng chữ với bộ gõ Telex có sẵn của macOS và với EVKey hoặc OpenKey; bộ gõ Nhật: Enter chỉ chốt chữ (`isComposing`) |
| S2 | Ẩn ô soạn thì bàn phím về đúng ô chat cũ, và ⌘V vào đúng chỗ | Không cần bấm chuột, bản dịch vào đúng ô nhập, không có gì bị gửi, ở: Messenger web trên Chrome, Slack, Zalo PC, khung chat của Zoom, và một app đang toàn màn hình. Ghi thời gian chờ cần thiết ở bước 4 của mục 4.1 |
| S3 | Quyền Trợ năng với bản ký ad-hoc qua một lần cập nhật | Chỉ ghi nhận, không có điều kiện đạt: cấp quyền cho bản ký bằng `scripts/run-dev-signed.sh`, build lại (chữ ký đổi), xem `AXIsProcessTrusted`, mục trong System Settings, các bước cần làm để bật lại; thử `tccutil reset Accessibility com.aitranslator.desktop` có cần quyền admin không |

S1 hay S2 không đạt thì dừng lại, báo chủ dự án và xem lại thiết kế trước khi làm tiếp.

## 8. Kiểm thử và nghiệm thu

### 8.1 Test tự động

- **Rust:**
  - `target.rs`: các trường hợp của mục 2.1 (khóa nguồn, tập còn một ngôn ngữ sau khi bỏ T, T = en, T = vi, chọn riêng).
  - `detect.rs`: từng dòng của bảng mục 2.2, chữ trộn (Nhật có Hán và kana, tiếng Việt có tên riêng tiếng Anh), tiếng Việt không dấu, chuỗi chỉ có số và ký hiệu, NFC và NFD.
  - Luồng dịch: tách và ghép dòng, giữ dòng trống, hủy yêu cầu cũ, bỏ kết quả của `id` cũ, giới hạn 400 token, `touch()`, bản dịch giả qua trait `Mt` có sẵn.
  - Luồng dán với `Paster` giả: có quyền thì ghi clipboard rồi gửi phím; thiếu quyền thì chỉ chép và không ẩn ô; `autoPaste = false`; chỉ dán kết quả đã lưu của đúng `id`; `id` lạ hay chưa xong thì từ chối.
  - Bản quyền: `compose_block` không chặn khi chỉ hết hạn mức; chặn khi vừa hết hạn mức vừa hết dùng thử; chặn đủ các lý do còn lại của `StartBlock`.
  - Phím tắt và cài đặt: mặc định `Ctrl+Alt+G`, kiểm trùng với năm phím tắt cũ, `enabled = false` thì không đăng ký, cài đặt cũ nhận mặc định.
  - ACL của cửa sổ `compose` (mục 3.6); phân loại mã lỗi mới (mục 5); log và báo cáo không chứa chữ (mục 6).
- **TypeScript (Vitest):** chờ 400 ms; Enter khi đã khớp, đang dịch, đã là đích, lỗi, ô trống, bị chặn; Enter khi `isComposing`; Shift+Enter; Esc; giữ bản nháp và chọn sẵn khi mở lại; hộp quyền; chuỗi i18n đủ năm ngôn ngữ (kiểu `Record` sẵn có bắt).
- **Giao diện:** ảnh chụp ô soạn ở các trạng thái (trống, đang nạp, đang dịch, đã dịch, đã là đích, lỗi, hộp quyền; sáng và tối) bằng `scripts/ui-preview` và Playwright.

### 8.2 Nghiệm thu (thử tay, máy M4 Pro, gói Chuẩn)

| # | Tiêu chí |
|---|---|
| GD1 | Ở mỗi nơi sau, cả luồng của mục 1.1 chạy đúng (phím tắt mở ô, gõ Telex, Enter dán bản dịch vào đúng ô, Enter lần 2 gửi): Messenger web và Gmail trên Chrome; một trang chat trên Safari; Slack; Discord; Teams; Zalo PC; Telegram; iMessage hoặc Notes; khung chat của Zoom; khung chat của Google Meet. Nơi nào không đạt thì ghi lý do để chủ dự án quyết |
| GD2 | Thời gian từ lúc gửi yêu cầu tới `compose://done` (đọc từ log), 20 câu chat thật tiếng Việt từ 5 tới 30 từ, tiến trình phụ đã nạp: p50 ≤ 1,0 giây |
| GD3 | Vừa có phiên phụ đề vừa gõ (một tin mỗi khoảng 10 giây trong 5 phút): đo A2 (§3.3 của spec gốc) có và không có Gõ dịch, ghi lại mức trễ thêm để chủ dự án xem; không có ngưỡng đạt |
| GD4 | Bấm ⌃⌥G ở từng app của GD1: không app nào tự làm việc riêng của nó cùng lúc (kiểm trùng phím trên macOS) |
| GD5 | Proxy mạng (công cụ của A7) trong lúc dùng Gõ dịch: không có request nào |
| GD6 | Sau khi dùng, log của app không chứa chữ đã gõ hay bản dịch |

Windows: chạy lại GD1, GD4, GD5, GD6 khi có máy.

## 9. Rủi ro chủ dự án đã chấp nhận

- **Clipboard bị ghi đè** bằng bản dịch, không khôi phục.
- **Bản Mac ký ad-hoc:** sau mỗi lần cập nhật, quyền Trợ năng có thể phải bật lại bằng tay trong System Settings (không phải hộp thoại chỉ bấm "Cho phép"), tới khi có Developer ID. Thiếu quyền thì Gõ dịch vẫn chạy ở chế độ chép.
- **RAM:** khoảng 2,9 GiB trong lúc dùng ô soạn và 10 phút sau đó.
- **Phụ đề trễ thêm** một chút khi vừa họp vừa gõ (mục 3.4).
- **Dán không vào mà app không biết** ở ô mật khẩu, app quyền admin (Windows), app chặn dán; người dùng tự dán từ clipboard.
- **macOS không báo trùng phím tắt;** chỉ thử tay (GD4) mới thấy, và người dùng tự đổi phím.
- **Nhận diện nguồn theo chữ viết** không phân biệt được tiếng Việt không dấu với tiếng Anh; luật "không chắc thì vẫn dịch" làm câu tiếng Anh cũng đi qua model.
- **Windows** chưa thử tay ở lần phát hành đầu có tính năng này (theo quyết định 2026-10-06).

## 10. Spec gốc, website, phát hành

- **Spec gốc** (sửa trên nhánh này, cùng đợt code):
  - §3.1: thêm **F11 Gõ dịch** (tóm tắt mục 1, trỏ về spec này); F10 thêm ⌃⌥G / Ctrl+Alt+G.
  - §4.3: thêm nhóm Cài đặt "Gõ dịch" (mục 1.4).
  - §4.6 mới "Ô soạn Gõ dịch": tóm tắt mục 1 và trỏ về spec này.
  - §3.2 không đổi: "dịch giọng của người dùng rồi phát vào cuộc họp" vẫn ngoài phạm vi; Gõ dịch là dịch chữ.
- **Website:** giới thiệu tính năng sau khi phát hành, chỉ nói điều có thật, không nêu công nghệ lõi (CLAUDE.md, `website/README.md`); bảng gói ghi tính năng có ở mọi gói. Trang hỗ trợ: cách cấp quyền Trợ năng, trường hợp dán không vào (mục 5).
- **Phát hành:** theo quy trình phát hành sẵn có, chỉ khi chủ dự án cho phép.

## 11. Không làm

- Theo dõi hay đọc ô nhập của app khác, chặn phím Enter của hệ thống (hướng A, mục 0).
- Phím tắt kiểu bấm hai lần một phím bổ trợ (cần nghe bàn phím).
- Khôi phục clipboard cũ sau khi dán.
- Từ điển thuật ngữ cho Gõ dịch; từ điển hai chiều.
- Đổi nhanh ngôn ngữ đích trên ô soạn; nhớ ngôn ngữ đích theo từng app.
- Lưu lịch sử tin đã soạn.
- Mục Gõ dịch trong menu khay; dòng gợi ý phím tắt trên màn hình chính (có thể làm sau nếu người dùng không tìm ra tính năng).
- Chạy riêng `llama-server` không kèm `asr-worker` để tiết kiệm RAM.
- Kéo hay nhớ vị trí ô soạn.
