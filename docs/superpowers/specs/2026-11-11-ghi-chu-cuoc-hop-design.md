# Ghi chú cuộc họp bằng AI (thiết kế)

Ngày 2026-11-11. Trạng thái: **chờ chủ dự án duyệt bản viết** (thiết kế bằng lời đã được duyệt cùng ngày). Phạm vi: app (`src-tauri/src/notes/` mới, `src-tauri/src/models/`, `settings/`, `db.rs`, `src/`), manifest model, tài liệu pháp lý (`docs/legal/`), website.

Spec này **sửa** ba chỗ của `2026-09-29-desktop-meeting-translator-design.md`: §3.2 ("Tóm tắt hoặc biên bản cuộc họp" là ngoài phạm vi), quyết định D7 và §10.1 (nơi xử lý, dữ liệu rời máy). Các chỗ cần sửa theo ở mục 12.

## 1. Vấn đề và mục tiêu

- App hiện dừng ở phụ đề và bản chép lời. Người đi họp cần kết quả cuối: tóm tắt, quyết định, việc cần làm. Sản phẩm cùng thị trường (VietNote) lấy cụm này làm tính năng chính, nhưng chép lời của họ chạy trên cloud.
- Mục tiêu: sau khi phiên dịch dừng, người dùng tạo được **ghi chú cuộc họp** từ bản chép lời, bằng model trên máy (mặc định) hay bằng ChatGPT, Gemini với API key của chính họ.
- Ràng buộc của chủ dự án: **không làm ảnh hưởng tính năng hiện có, không làm crash app**.

## 2. Quyết định đã chốt (2026-11-11)

| # | Hạng mục | Quyết định |
|---|---|---|
| G1 | Thời điểm | Chỉ tạo ghi chú **sau khi phiên dừng**. Không có tóm tắt cập nhật trong lúc họp. |
| G2 | Nguồn | Người dùng chọn: Model trên máy / ChatGPT / Gemini. **Mặc định là Model trên máy.** |
| G3 | Phát hành | Cloud và Local **cùng phát hành một lần**. Việc đo model local (mục 10) là bước chặn đầu tiên. |
| G4 | Model local | **Không dùng Hy-MT2** (model chỉ dịch; S7 của spec gốc §6.5: thêm ngữ cảnh thì 325/538 bản dịch lẫn mẫu; context 2048). Dùng một model đa năng thứ hai, tải riêng ("gói ghi chú"), chọn ở mục 10. |
| G5 | Vị trí giao diện | Một mục điều hướng mới **"Ghi chú cuộc họp"** ngay dưới Giọng đọc (macOS không có Giọng đọc: ngay dưới Gõ dịch). **Mọi tính năng và thiết lập nằm trong màn hình này.** |
| G6 | Gói | Tính năng Pro. Không trừ phút dịch. Không đổi giá. |
| G7 | Free | **3 lần** tạo ghi chú trong 10 ngày dùng thử. |
| G8 | Ngưỡng máy cho Local | RAM từ **15 360 MiB** (máy "16 GB") trên cả macOS và Windows, **không đòi card rời**. Dưới ngưỡng chỉ dùng được Cloud. |

## 3. Kiến trúc

Module mới `src-tauri/src/notes/`:

- `engine.rs`: trait `NotesEngine { fn generate(&self, req: &NotesRequest, cancel: &AtomicBool) -> Result<String, NotesError> }`. Hai bản cài: `CloudNotes`, `LocalNotes`.
- `chunk.rs`: chia bản chép lời theo ngân sách token, giữ số thứ tự câu và nhãn người nói; tóm tắt từng đoạn rồi gộp (map-reduce). Bản chép lời vừa một lần gọi thì không chia.
- `schema.rs`: kiểu `Notes` (mục 5) và bộ đọc JSON chặt.
- `job.rs`: **một việc tại một thời điểm**, luồng riêng, tiến độ, hủy, timeout.
- `store.rs`: bảng `notes` (mục 5).
- `quota.rs`: bộ đếm 3 lần của Free (mục 8).

**Ranh giới với mã cũ** (khóa bằng test):

- Chỉ **đọc** `TranscriptStore::snapshot()` và `transcript::history::get()`. Không ghi ngược.
- Không sửa crate `pipeline`, `cloud_mt.rs`, `session.rs`, `capture.rs`. `notes` không phụ thuộc `pipeline::translate::Mt`.
- Điểm chạm: đọc key từ `Keystore` (`OPENAI_KEY_ENTRY`, `GEMINI_KEY_ENTRY`), lệnh IPC mới trong `lib.rs` và `capabilities/main.json`, trường cài đặt mới, một bước migration, mục `notes` của manifest, giá trị `"notes"` trong kiểu `Screen`.

**`CloudNotes`:** HTTP client riêng (không dùng client dịch: client đó kẹp `max_tokens` 512 và timeout 25 s cho câu ngắn). Cùng hai endpoint và cùng danh sách model đã kiểm của spec 2026-11-07. Không stream lên giao diện; timeout kết nối 10 s, mỗi request 120 s.

**`LocalNotes`:** tiến trình phụ `llama-server` **thứ hai**, cùng binary đã ký và đã kiểm SHA-256, cổng trống và `LLAMA_API_KEY` ngẫu nhiên riêng, chỉ nghe `127.0.0.1`, context do mục `notes` của manifest quy định. Khởi động khi có việc, tắt khi xong hay bị hủy. **Không tự khởi động lại** khi chết.

## 4. Luật ưu tiên và chống crash

- **Phiên dịch luôn thắng.** Bắt đầu phiên khi đang tạo ghi chú: Cloud chạy tiếp; Local bị hủy ngay, tiến trình phụ ghi chú bị tắt trước khi `asr-worker` và `llama-server` dịch khởi động, giao diện báo "đã tạm dừng, tạo lại sau khi họp xong".
- Đang có phiên dịch thì không bắt đầu được việc Local (nút mờ kèm lý do). Cloud vẫn được.
- Trước khi nạp model ghi chú, app tắt tiến trình phụ đang rảnh (cơ chế có sẵn cho lúc tải đè model), dựng lại khi bắt đầu phiên hay mở Gõ dịch.
- Mọi lỗi là `CommandError`; module không có `unwrap`, `expect`, `panic` ngoài test (clippy `deny` trong module).
- JSON sai định dạng: thử lại một lần; vẫn sai thì lưu và hiện bản văn thô ở khối Tóm tắt, không báo lỗi.
- Tiến trình ghi chú hết RAM hay chết: việc đó lỗi một lần với mã `notesEngineFailed`; app và phiên dịch không bị ảnh hưởng.
- Tính năng mặc định không chạy gì cho tới khi người dùng bấm. Người dùng cũ cập nhật app không đổi hành vi nào (`#[serde(default)]`).
- **Công tắc tắt khẩn:** manifest không có mục `notes` thì lựa chọn Model trên máy ẩn. Đọc lỏng như mục `speaker`: mục sai chỉ làm mất ghi chú Local.

## 5. Dữ liệu

**Đầu ra của model** (`Notes`):

```json
{ "summary": "…",
  "decisions": [{ "text": "…", "refs": [12, 13] }],
  "action_items": [{ "text": "…", "owner": "Lan", "due": "…", "refs": [40] }],
  "open_questions": [{ "text": "…", "refs": [51] }] }
```

- `refs` là số thứ tự câu (`seq`) trong bản chép lời đưa vào prompt. Số không tồn tại thì bỏ. Mục không còn `refs` vẫn giữ nhưng không có nút đối chiếu.
- `owner` chỉ nhận tên có trong bảng người nói của phiên (F13) hay tên xuất hiện trong lời thoại; còn lại để trống.
- Ghi chú viết bằng ngôn ngữ đích của phiên.

**Migration 2 → 3** (chỉ thêm, không sửa bảng cũ):

```sql
CREATE TABLE notes (
    session_id INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    source TEXT NOT NULL,      -- local | openai | gemini
    model TEXT NOT NULL,
    lang TEXT NOT NULL,
    template TEXT NOT NULL,
    body_json TEXT NOT NULL,
    edited INTEGER NOT NULL DEFAULT 0
);
```

- Mỗi phiên một bản. Tạo lại thì hỏi trước khi ghi đè (bản đã sửa tay được cảnh báo riêng).
- Xóa phiên, "Xóa lịch sử", "Xóa toàn bộ dữ liệu" xóa luôn ghi chú (CASCADE).
- Phiên chưa lưu Lịch sử: ghi chú chỉ nằm trong bộ nhớ, mất khi đóng app. Giao diện nói rõ và mời sao chép hay xuất.

## 6. Cài đặt

Thêm vào `Settings`, đều có `#[serde(default)]`:

- `notes_provider: NotesProvider` (`local` mặc định, `openai`, `gemini`).
- `notes_auto: bool` (mặc định `false`): tự tạo khi phiên dừng.
- `notes_template: NotesTemplate` (`meeting` mặc định, `lecture`, `brief`).
- `notes_cloud_consent: bool` (mặc định `false`): đã đồng ý gửi chữ chép lời khi dùng Cloud.

Model cloud dùng chung `openai_model`, `gemini_model`. API key dùng chung với Nguồn dịch qua hai lệnh IPC hiện có.

Máy dưới ngưỡng G8 mà cài đặt là `local`: app coi như chưa chọn nguồn và dẫn tới bước nhập API key; không tự đổi giá trị đã lưu.

## 7. Giao diện: màn hình "Ghi chú cuộc họp"

Mục điều hướng `notes` (khóa i18n `nav.notes`), sau `voice` trong `SCREENS`. Từ trên xuống:

1. **Chọn phiên:** phiên vừa dừng (trong bộ nhớ) đứng đầu; dưới là các phiên của Lịch sử (Pro), phiên đã có ghi chú có dấu.
2. **Thanh tạo:** chọn mẫu, huy hiệu nguồn (`Local`, `ChatGPT · <model>`, `Gemini · <model>`), nút "Tạo ghi chú". Đang chạy: tiến độ theo đoạn và nút Hủy. Máy không có GPU dùng được mà chọn Local: dòng "có thể mất vài phút".
3. **Kết quả:** bốn khối Tóm tắt, Quyết định, Việc cần làm, Câu hỏi mở; sửa tay được. Nút đối chiếu ở mỗi ý mở khung bên phải hiện các câu gốc được tô sáng.
4. **Xuất:** Sao chép; Markdown và TXT (Pro, qua `transcript::export`).
5. **Thiết lập** (khối gập): nguồn; gói ghi chú (tải, tiến độ, dung lượng, xóa); model cloud và ô API key; công tắc tự tạo.

**Lần đầu mở:** máy đạt G8 thấy bước tải gói ghi chú kèm dung lượng. Máy dưới ngưỡng thấy "Model trên máy" mờ kèm lý do và bước nhập API key; nút tải bị khóa và phía Rust cũng từ chối lệnh tải.

**Lần đầu dùng Cloud:** hộp đồng ý nói rõ chữ chép lời của phiên sẽ gửi tới nhà cung cấp đã chọn bằng key của người dùng.

**Cloud lỗi** (thiếu key, mạng, 401/403/429/5xx, timeout): hiện lỗi cụ thể với hai nút "Thử lại" và "Dùng model trên máy" (chỉ khi gói đã tải và máy đạt G8). Không tự chuyển ngầm.

Chuỗi giao diện đủ vi, en, ja, zh, ko.

## 8. Gói và hạn mức

- Pro: không giới hạn số lần, hỏi qua `pro::require` / `pro::is_pro`.
- Free (đang dùng thử): **3 lần**, đếm trên máy cạnh bộ đếm Free hiện có. Tính một lần khi việc **hoàn tất**; hủy hay lỗi không tính; tạo lại cho cùng phiên tính thêm một lần. Hết lượt thì hiện lời mời nâng cấp.
- Free không có Lịch sử nên chỉ tạo được cho phiên vừa dừng; xuất file vẫn là Pro, sao chép thì được.
- Không trừ phút dịch ở mọi gói.

## 9. Quyền riêng tư

- **Local:** chữ chép lời và ghi chú không rời máy. Tiến trình phụ ghi chú không mở cổng ngoài `127.0.0.1`.
- **Cloud:** chỉ sau `notes_cloud_consent`; gửi chữ chép lời (chỉ bản dịch kèm nhãn người nói, không gửi câu gốc) của đúng phiên được chọn tới OpenAI hay Google bằng key của người dùng. Không gửi âm thanh, không gửi qua server của sản phẩm.
- Chữ ghi chú và prompt không vào log, không vào báo cáo lỗi; bộ che dữ liệu của diagnostics coi chúng như chữ chép lời.
- Ghi chú lưu trong SQLite mã hóa hiện có.

## 10. Đo model local (bước chặn)

- **Ứng viên:** 2–3 model đa ngôn ngữ cỡ 4B, giấy phép cho phép phân phối lại, bản ổn định mới nhất lúc đo (spec gốc §6.12), lượng tử hóa Q4.
- **Bộ thử:** bản chép lời do chính app tạo (có lỗi nhận dạng, có nhãn người nói), 5 ngôn ngữ, ba độ dài 10, 30, 60 phút.
- **Chỉ số:** tỉ lệ JSON hợp lệ; tỉ lệ `refs` trỏ đúng câu; việc cần làm bịa và sót (người chấm); đúng ngôn ngữ đầu ra; thời gian tạo; RAM đỉnh. Mốc so sánh: model mặc định của Gemini và ChatGPT trên cùng bộ thử.
- **Ngưỡng đạt** (chốt trước khi đo): JSON hợp lệ sau tối đa một lần thử lại ≥ 98%; `refs` đúng ≥ 90%; việc cần làm bịa ≤ 1 mỗi 10 cuộc họp (đo: ≤ 2 trên 20 bản); đúng ngôn ngữ đầu ra ở mọi bản (20/20); phiên 60 phút xong trong ≤ 3 phút có GPU và ≤ 10 phút chỉ CPU trên máy 16 GB; RAM đỉnh của tiến trình ghi chú ≤ 6 GiB.
- **Không ứng viên nào đạt:** dừng, báo chủ dự án xem lại G3.
- Kết quả ghi ở `bench/2026-11-11-ghi-chu-cuoc-hop/`.

### 10.1 Kết quả đo (2026-11-12): không đạt

Chi tiết: `bench/2026-11-11-ghi-chu-cuoc-hop/results/tong-hop.md`.

- Hệ tốt nhất: `qwen3-5-4b` (Q4_K_M, Apache-2.0), cấu hình `c16kb`. Đạt JSON 100%, ngôn ngữ 20/20, `refs` 99,6%, RAM đỉnh 5889 MiB.
- **Rớt thời gian:** phiên 60 phút 662 s (iGPU), 1335 s (chỉ CPU) so với ngưỡng 600 s. Mốc 180 s của GPU rời chưa đo được (máy đo chỉ có iGPU).
- **Rớt việc cần làm bịa:** 56/180 (31%), ngưỡng ≤ 2/20 bản. Một phần do lỗi dịch máy trong bộ thử.
- Chưa đo: mốc Cloud, nhiễu nhận dạng giọng nói, máy 16 GB chỉ CPU, gói Nhẹ (mới một nửa).
- Theo luật dừng ở trên: **G3 chờ chủ dự án quyết định lại.** Không làm kế hoạch 03 (engine Local) trước đó.

## 11. Rủi ro

1. **llama.cpp đang khóa (b11146) có thể chưa chạy được model đời mới.** Ưu tiên ứng viên chạy được trên bản đang khóa. Nếu không có: đóng kèm một binary `llama-server` riêng cho ghi chú (bộ cài nặng hơn), **không nâng bản dùng cho đường dịch** trong phạm vi spec này.
2. **Chưa có máy Windows 16 GB chỉ CPU và máy 8 GB để đo** (spec gốc §8). Ngưỡng G8 nằm trong manifest (`notes.min_ram_mib`) để đổi mà không phát hành lại app.
3. **Model nhỏ bịa việc cần làm.** Giảm bằng `refs` bắt buộc, nút đối chiếu, và dòng nhắc "kiểm lại trước khi gửi" dưới kết quả.
4. **Bản chép lời gói Nhẹ kém ở vi, ja, ko, zh** (spec gốc §8) làm ghi chú kém theo. Bộ thử phải có bản chép lời của gói Nhẹ.

## 12. Chỗ phải sửa theo

- Spec gốc: §3.2 bỏ dòng "Tóm tắt hoặc biên bản cuộc họp"; thêm F14 vào §3.1; D7 và §10.1 ghi ngoại lệ Cloud của ghi chú; §4.3 thêm màn hình; §6.6 bảng `notes`; §6.7 mục `notes` của manifest; §6.9 bốn cài đặt mới.
- `docs/legal/`: chính sách quyền riêng tư (vi, en) thêm mục ghi chú cuộc họp; EULA nếu có câu "xử lý 100% trên máy".
- `THIRD_PARTY_NOTICES`, `about.toml`, `deny.toml`: giấy phép model ghi chú; LICENSE và NOTICE đặt cạnh file model trên R2.
- Website: trang chủ, trang giải pháp họp, bảng giá, đủ 5 ngôn ngữ; chỉ nêu số đã đo; **không nêu tên model** (`website/README.md`).
- `docs/release/phat-hanh.md`: bước đăng gói ghi chú và ký manifest.

## 13. Kiểm thử

- Đơn vị: `chunk` (ranh giới, giữ `seq`), `schema` (JSON hỏng, `refs` lạ, `owner` lạ), `quota` (3 lần, hủy không tính), migration 2 → 3 trên DB của bản cũ, cài đặt cũ đọc được.
- Tích hợp với engine giả: hủy giữa chừng; bắt đầu phiên khi Local đang chạy; tiến trình ghi chú chết; Cloud trả 401, 429, timeout.
- Ranh giới: test khóa `notes` không phụ thuộc `pipeline::translate` và không gọi hàm ghi của `TranscriptStore`.
- Hồi quy: toàn bộ test hiện có và lượt đo độ trễ A2 trước và sau, không đổi.
- ACL: lệnh IPC mới chỉ cấp cho cửa sổ `main`.

## 14. Ngoài phạm vi

Tóm tắt trong lúc họp; hỏi đáp trên bản chép lời; xuất Word, PDF; ghi chú từ file ghi âm hay video; đồng bộ ghi chú lên server.
