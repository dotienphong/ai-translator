# Nghe dịch trực tiếp (đọc bản dịch ra loa, hạ tiếng họp)

Ngày: 2026-11-02. Nhánh: `feat/vieneu-tts-v3-turbo`. Dựa trên `2026-11-02-doc-ban-dich-tts-design.md` (giọng đọc đã có: nút "Nghe" ở bản chép lời).

## 1. Mục tiêu

Trong họp trực tiếp, khung dịch nổi (overlay) có nút **Nghe dịch**. Khi bật:

- Tiếng cuộc họp phát ra loa bị **hạ nhỏ** (mức chỉnh được), thay vào đó mỗi câu dịch vừa chốt được **đọc thành tiếng** (Anh → Việt thì nghe tiếng Việt).
- Chỉ đọc bản dịch của **tiếng máy** (khách nói). Lời của người dùng (micro) hiện chữ như cũ, **không đọc**.
- Chỉ ngôn ngữ đích Việt và Anh (giọng đọc hiện có).

Ví dụ thành công: họp Anh–Việt, khách nói tiếng Anh, người dùng thấy chữ Việt trên overlay, nghe tiếng Việt, vẫn nghe thoang thoáng giọng khách ở mức nhỏ; tắt nút thì mọi thứ trở lại như cũ.

### Ràng buộc cứng (do người dùng yêu cầu)

1. **Không làm ảnh hưởng tính năng đang chạy.** Khi nút tắt (mặc định), đường dữ liệu hiện có (thu, VAD, nhận dạng, dịch, phụ đề, lưu bản chép lời) không đổi hành vi và không đổi độ trễ.
2. **Tuyệt đối không làm app crash.** Mọi mã mới là phụ: lỗi của nó chỉ làm tính năng này tự tắt, không bao giờ làm sập hay kẹt phần còn lại (§7).

### Không làm (YAGNI)

- Không đọc lời micro; không đọc ngôn ngữ ngoài Việt/Anh; không chọn giọng/tốc độ riêng; không tách riêng từng ứng dụng để chọn hạ app nào.
- macOS: chưa làm (§9).

## 2. Kết quả thử nghiệm (Windows, 2026-11-02)

Phát âm sin liên tục từ một tiến trình, đo mức loopback RMS (gốc 0,136):

| Việc làm | Mức thu | So với gốc |
|---|---|---|
| Âm lượng riêng của app phát = 0,15 | 0,075 | ≈ 55% |
| Âm lượng chung = 0,075 (app 1,0) | 0,027 | ≈ 20% |
| Khôi phục | 0,136 | 100% |

Kết luận:
- **Cả hai cách đều làm nhỏ phần thu loopback** trên máy này; phải bù ở phía thu.
- Mức giảm **không tỉ lệ với số đặt** (đường cong âm lượng hoặc hiệu ứng của driver), nên bù theo **mức đo thực**, không bằng `1/mức đặt`.
- Hạ âm lượng chung cũng làm nhỏ tiếng đọc của chính app, nên dùng **âm lượng riêng từng ứng dụng, trừ app mình** (cách B).

## 3. Kiến trúc

Ba khối nhỏ, giao tiếp qua giao diện hẹp, mỗi khối thử được riêng:

1. **`audio-ducking`** (crate mới, chỉ Windows, `cfg(windows)`): hạ và trả âm lượng riêng của các ứng dụng. Không phụ thuộc phần còn lại của app.
2. **Bù mức thu (AGC)** trong `audio-capture` hoặc `capture.rs`: nâng lại mức tiếng thu khi đang hạ. Đứng sau công tắc; công tắc tắt thì không chạy mã nào.
3. **Hàng đợi đọc dịch** (`listen-queue`, mã giao diện + một lệnh Tauri): nhận câu dịch chốt xong có nhãn nguồn, đọc lần lượt bằng giọng đọc hiện có.

Lõi Rust điều phối trạng thái bật/tắt (`ListenService`): bật → hạ âm → báo overlay; tắt/lỗi/thoát → trả âm → báo overlay.

## 4. Hạ âm lượng (Windows)

- Dùng `IAudioSessionManager2` trên thiết bị phát mặc định (cả Console và Communications như chế độ thu tự động §6.1): liệt kê phiên, đặt `ISimpleAudioVolume` của **mọi phiên có pid khác pid của app (và tiến trình con của nó)**.
- Hạ phiên mới xuất hiện giữa chừng bằng cách **hỏi định kỳ mỗi 500 ms** (`tick`), như cách app đã hỏi đổi thiết bị phát (§9 của spec chính), thay cho `IAudioSessionNotification`: cùng kết quả, không có callback COM chạy trên luồng của hệ thống (giảm rủi ro crash).
- Mức đặt: thanh 0–100% (phần trăm tiếng họp còn lại) ánh xạ qua `session_scalar(level) = (level/100)²` (một hàm duy nhất, chỉnh lại sau khi nghe thử trên máy thật). Mặc định 10%.
- "Tiến trình của app" gồm cả cây tiến trình con (WebView2 phát tiếng đọc nằm ở tiến trình con), tính bằng `CreateToolhelp32Snapshot`.
- **Sổ khôi phục**: trước khi đổi, ghi (id phiên, pid, âm lượng gốc, cờ tắt tiếng gốc) vào file `listen-duck.json` trong thư mục dữ liệu app (ghi nguyên tử). Trả âm theo sổ khi: tắt nút, thoát app, lỗi của tính năng, và **khi app khởi động lần sau nếu sổ còn** (đề phòng sập). Chỉ trả cho phiên còn tồn tại và còn đúng pid/tên tiến trình; không trả nếu người dùng đã tự đổi (so với mức mình đã đặt).
- Không đụng micro, không đụng thiết bị thu, không đổi âm lượng chung.

## 5. Bù mức thu (AGC)

- Khi công tắc bật, trong `capture.rs::Pre::drain` (chỗ đã chặn thu tiếng đọc): nhân mẫu dòng nhận dạng và VAD với hệ số `g`, `1 ≤ g ≤ 10` (tối đa +20 dB), cập nhật chậm.
- `g` ước lượng từ tỉ số giữa **mức tiếng máy trung bình ngay trước khi hạ** (cửa sổ ~10 s, chỉ khung có tiếng) và mức hiện tại; làm mượt, có trần, có hạ dần khi tiếng quá lớn (chống cắt đỉnh: `clamp` về [-1, 1]).
- Công tắc tắt: nhánh này không chạy, mã hiện có không đổi hành vi (có test so sánh đầu ra bit-bit khi tắt).

## 6. Đọc dịch

- Nguồn dữ liệu: câu dịch chốt xong (không đọc phần đang dịch dở).
- **Câu của micro hay của máy** (điều chỉnh sau khi đọc code, 2026-11-02): nhãn nguồn `System | Mic | Mixed` chỉ nằm trong bộ nhận giọng, nên **không thêm trường vào phụ đề**. Overlay dùng thứ nó đã có: chế độ thu (`captureMode`, thêm vào `OverlayView`) và bảng người nói (`RosterVoice.room`: giọng có từ 60% thời lượng từ micro).
  - `captureMode = playback`: mọi câu là tiếng máy, đọc hết. `mic`: không có gì để đọc, nút mờ.
  - `captureMode = both`: câu có `speaker` thuộc giọng `room` thì **không đọc**; giọng không `room` thì đọc. Câu chưa có `speaker` (nhãn giọng tới muộn) được giữ tối đa 1500 ms chờ nhãn; hết hạn mà vẫn chưa có thì **đọc** (ưu tiên không mất ý khách). Nếu phiên không bật nhận giọng thì không có nhãn nào: mọi câu bị đọc, và overlay hiện ghi chú một lần "chưa phân biệt được lời của bạn".
  - Hệ quả so với bản đầu: không có trường hợp `Mixed` riêng; đoạn lẫn hai nguồn được xếp theo giọng chiếm đa số.
- Hàng đợi **đọc hết từng câu**, theo thứ tự, qua `tts_speak` hiện có (một câu tại một thời điểm). Câu rỗng/quá 4000 byte bỏ qua như cũ.
- Dồn câu: overlay hiện "còn N câu"; nút **Bỏ qua** xóa phần chờ và đọc tiếp từ câu mới nhất. Tắt "Nghe dịch" xóa hàng đợi và dừng ngay.
- Đọc bằng Web Audio của overlay (cửa sổ riêng, store riêng); cờ chặn thu tiếng đọc (`mark_playing`) vẫn dùng như hiện nay.
- Ngôn ngữ đích không phải Việt/Anh, hoặc giọng đọc chưa cài: nút bị mờ kèm lý do.

## 7. An toàn và chống crash

- **Mặc định tắt**, không lưu "bật" qua lần mở app (mỗi phiên bật lại thủ công; mức thanh trượt thì nhớ).
- Mọi lệnh Tauri mới trả `Result`, không `unwrap`/`expect`/`panic` trên đường chạy. Mã COM của hạ âm chạy trên **một luồng riêng**, bọc `catch_unwind`; panic hoặc lỗi COM ⇒ trả âm theo sổ, tính năng tự tắt, báo lỗi `listenFailed` lên overlay.
- Nút phản hồi sự kiện lỗi từ lõi: về trạng thái tắt, thông báo ngắn. Không có vòng thử lại vô hạn.
- Luồng hạ âm không chặn luồng thu hay luồng giao diện; thao tác COM có thời hạn (watchdog); quá hạn ⇒ coi là lỗi.
- Không thêm thư viện nặng; dùng crate `windows` đã có (cùng bản). Không thêm sidecar.
- Log chỉ ghi số lượng và mã lỗi, không có chữ.

## 8. Giao diện

- Overlay có nút **Nghe dịch** (bật/tắt) và, khi bật, thanh **mức tiếng họp** (0–100%), chỉ báo "còn N câu" và nút **Bỏ qua**.
- Chuỗi giao diện đủ 5 ngôn ngữ (en/vi/ja/zh/ko), có test song song như hiện nay.
- Nút "Nghe" trên bản chép lời giữ nguyên.

## 9. Giai đoạn

1. **Windows** (spec này): `audio-ducking`, AGC, nhãn nguồn, hàng đợi, UI.
2. **macOS**: không có âm lượng riêng từng app; cần thử riêng (khả năng: tap tắt tiếng app họp rồi tự phát lại nhỏ). Trong lúc chưa làm, nút ẩn trên macOS.

## 10. Kiểm thử

- Đơn vị: ánh xạ mức; sổ khôi phục (ghi, đọc, trả, sổ hỏng, phiên đã mất); lọc phiên (loại pid của app và tiến trình con); AGC (hệ số, trần, đầu ra bit-bit khi tắt); quy tắc nguồn System/Mic/Mixed; hàng đợi (thứ tự, bỏ qua, dừng); store nút; ACL lệnh mới; parity i18n.
- Giả lập COM: `audio-ducking` đặt sau trait để test không cần thiết bị âm thanh.
- Trên máy thật: bật/tắt nhiều lần, sập giả (kill tiến trình) rồi mở lại để kiểm sổ khôi phục; mở app họp thật; đo độ chính xác nhận dạng có/không hạ âm và độ trễ từ chữ dịch tới lúc nghe.
- Hồi quy: toàn bộ test hiện có (tsc, vitest, cargo test) phải pass; so sánh đường chạy khi tắt.

## 11. Rủi ro

- Hiệu ứng âm thanh của driver làm đường cong khác nhau theo máy ⇒ AGC theo mức đo thay vì công thức, và kiểm trên máy thật.
- Ứng dụng đặt lại âm lượng của chính nó (Teams, Zoom) trong lúc họp ⇒ nghe thông báo phiên và áp lại; nếu không được, chỉ mất hiệu ứng hạ, không lỗi.
- Tiếng đọc lọt vào phần thu ⇒ đã có cờ chặn thu; kiểm lại khi hạ âm.
