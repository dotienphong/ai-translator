# Ghi chú cuộc họp bằng AI (thiết kế)

Ngày 2026-11-11. Trạng thái: **chờ chủ dự án duyệt bản viết.** Bản sửa 2026-11-13: nguồn ghi chú theo model dịch đang chọn (G2), có DeepSeek, gợi ý và cảnh báo khi dùng Local (§7), ngưỡng đo tính theo mốc Cloud (§10). Phạm vi: app (`src-tauri/src/notes/` mới, `src-tauri/src/models/`, `settings/`, `db.rs`, `src/`), manifest model, tài liệu pháp lý (`docs/legal/`), website.

Spec này **sửa** ba chỗ của `2026-09-29-desktop-meeting-translator-design.md`: §3.2 ("Tóm tắt hoặc biên bản cuộc họp" là ngoài phạm vi), quyết định D7 và §10.1 (nơi xử lý, dữ liệu rời máy). Các chỗ cần sửa theo ở mục 12.

## 1. Vấn đề và mục tiêu

- App hiện dừng ở phụ đề và bản chép lời. Người đi họp cần kết quả cuối: tóm tắt, quyết định, việc cần làm. Sản phẩm cùng thị trường (VietNote) lấy cụm này làm tính năng chính, nhưng chép lời của họ chạy trên cloud.
- Mục tiêu: sau khi phiên dịch dừng, người dùng tạo được **ghi chú cuộc họp** từ bản chép lời, bằng đúng model mà họ đã chọn ở Cài đặt > Model: model trên máy, hoặc ChatGPT, Gemini, DeepSeek với API key của chính họ.
- Ràng buộc của chủ dự án: **không làm ảnh hưởng tính năng hiện có, không làm crash app**.

## 2. Quyết định đã chốt (2026-11-11)

| # | Hạng mục | Quyết định |
|---|---|---|
| G1 | Thời điểm | Chỉ tạo ghi chú **sau khi phiên dừng**. Không có tóm tắt cập nhật trong lúc họp. |
| G2 | Nguồn | **Theo model dịch đang chọn ở Cài đặt > Model** (`translation_provider`), không có lựa chọn nguồn riêng cho ghi chú. Chọn Cloud (ChatGPT, Gemini, DeepSeek) thì ghi chú tự dùng đúng model đó. Chọn Local thì app gợi ý chuyển sang Cloud (nhanh và chính xác hơn); nếu người dùng vẫn muốn Local thì cảnh báo: tốn nhiều tài nguyên, chậm, ghi chú có thể có sai sót. |
| G3 | Phát hành | Cloud và Local **cùng phát hành một lần**. Local là chế độ "bản nháp có cảnh báo" (chủ dự án chốt 2026-11-13 sau khi có mốc Cloud, mục 10.1). |
| G4 | Model local | **Không dùng Hy-MT2** (model chỉ dịch; S7 của spec gốc §6.5: thêm ngữ cảnh thì 325/538 bản dịch lẫn mẫu; context 2048). Dùng một model đa năng thứ hai, tải riêng ("gói ghi chú"), chọn ở mục 10. |
| G5 | Vị trí giao diện | Một mục điều hướng mới **"Ghi chú cuộc họp"** ngay dưới Giọng đọc (macOS không có Giọng đọc: ngay dưới Gõ dịch). Màn hình chỉ hiện dòng "Đang dùng: <model>" kèm liên kết tới Cài đặt > Model; việc đổi model làm ở đó. |
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
- Điểm chạm: đọc key từ `Keystore` (`OPENAI_KEY_ENTRY`, `GEMINI_KEY_ENTRY`, `DEEPSEEK_KEY_ENTRY`), đọc `translation_provider` và model cloud đang chọn, lệnh IPC mới trong `lib.rs` và `capabilities/main.json`, trường cài đặt mới, một bước migration, mục `notes` của manifest, giá trị `"notes"` trong kiểu `Screen`.

**`CloudNotes`:** HTTP client riêng (không dùng client dịch: client đó kẹp `max_tokens` 512 và timeout 25 s cho câu ngắn). Ba nhà cung cấp: OpenAI, Gemini, DeepSeek. Cùng endpoint, cùng danh sách model đã kiểm và cùng mục lưu key (`OPENAI_KEY_ENTRY`, `GEMINI_KEY_ENTRY`, `DEEPSEEK_KEY_ENTRY`) với đường dịch. DeepSeek theo kiểu OpenAI: tắt chế độ suy nghĩ (`thinking: disabled`), HTTP 402 là hết số dư (lỗi cụ thể, không thử lại). Không stream lên giao diện; timeout kết nối 10 s, mỗi request 120 s.

**`LocalNotes`:** tiến trình phụ `llama-server` **thứ hai**, cùng binary đã ký và đã kiểm SHA-256, cổng trống và `LLAMA_API_KEY` ngẫu nhiên riêng, chỉ nghe `127.0.0.1`, context 16384 (theo mục `notes` của manifest), chạy với `--cache-ram 0`. Quy trình (cấu hình `c16kx`): chia đoạn ngân sách 12000 token, trích mục từng đoạn, gộp đoạn chỉ viết phần Tóm tắt (các mục gộp bằng máy), rồi lượt kiểm từng việc cần làm đọc ±1 câu gốc quanh `refs`; việc không còn `refs` bị bỏ, người nhận phải là người nói đã biết hay có trong lời thoại. Khởi động khi có việc, tắt khi xong hay bị hủy. **Không tự khởi động lại** khi chết.

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
    source TEXT NOT NULL,      -- local | openai | gemini | deepseek
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

- `notes_auto: bool` (mặc định `false`): tự tạo khi phiên dừng.
- `notes_template: NotesTemplate` (`meeting` mặc định, `lecture`, `brief`).
- `notes_cloud_consent: bool` (mặc định `false`): đã đồng ý gửi chữ chép lời khi dùng Cloud.
- `notes_local_ack: bool` (mặc định `false`): đã bấm "Không hỏi lại" ở cảnh báo Local.

Không có cài đặt nguồn riêng: nguồn là `translation_provider`. Model cloud và API key dùng chung với Nguồn dịch (`openai_model`, `gemini_model`, model DeepSeek và các lệnh IPC lưu key hiện có).

Máy dưới ngưỡng G8 mà `translation_provider` là `local`: tính năng ghi chú dẫn tới bước chọn Cloud và nhập API key; không tự đổi giá trị đã lưu.

## 7. Giao diện: màn hình "Ghi chú cuộc họp"

Mục điều hướng `notes` (khóa i18n `nav.notes`), sau `voice` trong `SCREENS`. Từ trên xuống:

1. **Chọn phiên:** phiên vừa dừng (trong bộ nhớ) đứng đầu; dưới là các phiên của Lịch sử (Pro), phiên đã có ghi chú có dấu.
2. **Thanh tạo:** chọn mẫu, dòng "Đang dùng: <model>" (`Local`, `ChatGPT · <model>`, `Gemini · <model>`, `DeepSeek · <model>`) kèm liên kết tới Cài đặt > Model, nút "Tạo ghi chú". Đang chạy: tiến độ theo đoạn và nút Hủy. Máy không có GPU dùng được mà chọn Local: dòng "có thể mất vài phút".
3. **Kết quả:** bốn khối Tóm tắt, Quyết định, Việc cần làm, Câu hỏi mở; sửa tay được. Nút đối chiếu ở mỗi ý mở khung bên phải hiện các câu gốc được tô sáng.
4. **Xuất:** Sao chép; Markdown và TXT (Pro, qua `transcript::export`).
5. **Thiết lập** (khối gập): gói ghi chú Local (tải, tiến độ, dung lượng, xóa); công tắc tự tạo. Model cloud và API key nằm ở Cài đặt > Model, không lặp ở đây.

**Khi model dịch là Local:** bấm "Tạo ghi chú" hiện hộp gợi ý: "Chuyển sang model cloud để ghi chú nhanh và chính xác hơn" (nút chuyển dẫn tới Cài đặt > Model), và lựa chọn "Vẫn dùng model trên máy". Chọn Local thì hiện cảnh báo: dùng nhiều tài nguyên của máy, tạo chậm (ghi số phút đo được cho phiên 60 phút), ghi chú có thể sai (nhất là người nhận, hạn, câu hỏi mở). Có nút "Không hỏi lại" (`notes_local_ack`). Kết quả Local mang nhãn "Bản nháp" và dòng nhắc kiểm lại trước khi gửi.

**Lần đầu mở (Local):** máy đạt G8 thấy bước tải gói ghi chú kèm dung lượng. Máy dưới ngưỡng không có lựa chọn Local; chỉ hiện hướng dẫn chọn Cloud và nhập API key; nút tải bị khóa và phía Rust cũng từ chối lệnh tải.

**Lần đầu dùng Cloud:** hộp đồng ý nói rõ chữ chép lời của phiên sẽ gửi tới nhà cung cấp đã chọn bằng key của người dùng.

**Cloud lỗi** (thiếu key, mạng, 401/402/403/429/5xx, timeout): hiện lỗi cụ thể với hai nút "Thử lại" và "Dùng model trên máy" (chỉ khi gói đã tải và máy đạt G8). Không tự chuyển ngầm.

Chuỗi giao diện đủ vi, en, ja, zh, ko.

## 8. Gói và hạn mức

- Pro: không giới hạn số lần, hỏi qua `pro::require` / `pro::is_pro`.
- Free (đang dùng thử): **3 lần**, đếm trên máy cạnh bộ đếm Free hiện có. Tính một lần khi việc **hoàn tất**; hủy hay lỗi không tính; tạo lại cho cùng phiên tính thêm một lần. Hết lượt thì hiện lời mời nâng cấp.
- Free không có Lịch sử nên chỉ tạo được cho phiên vừa dừng; xuất file vẫn là Pro, sao chép thì được.
- Không trừ phút dịch ở mọi gói.

## 9. Quyền riêng tư

- **Local:** chữ chép lời và ghi chú không rời máy. Tiến trình phụ ghi chú không mở cổng ngoài `127.0.0.1`.
- **Cloud:** chỉ sau `notes_cloud_consent`; gửi chữ chép lời (chỉ bản dịch kèm nhãn người nói, không gửi câu gốc) của đúng phiên được chọn tới nhà cung cấp mà người dùng đã chọn ở Cài đặt > Model (OpenAI, Google hay DeepSeek) bằng key của người dùng. Hộp đồng ý gọi đúng tên nhà cung cấp đó và hiện lại khi đổi nhà cung cấp. Không gửi âm thanh, không gửi qua server của sản phẩm.
- Chữ ghi chú và prompt không vào log, không vào báo cáo lỗi; bộ che dữ liệu của diagnostics coi chúng như chữ chép lời.
- Ghi chú lưu trong SQLite mã hóa hiện có.

## 10. Đo model local (bước chặn)

- **Ứng viên:** 2–3 model đa ngôn ngữ cỡ 4B, giấy phép cho phép phân phối lại, bản ổn định mới nhất lúc đo (spec gốc §6.12), lượng tử hóa Q4.
- **Bộ thử:** bản chép lời do chính app tạo (có lỗi nhận dạng, có nhãn người nói), 5 ngôn ngữ, ba độ dài 10, 30, 60 phút.
- **Chỉ số:** tỉ lệ JSON hợp lệ; tỉ lệ `refs` trỏ đúng câu; việc cần làm bịa và sót (người chấm); đúng ngôn ngữ đầu ra; thời gian tạo; RAM đỉnh. Mốc so sánh: DeepSeek (đã đo, mục 10.1); Gemini và ChatGPT chưa đo.
- **Ngưỡng đạt** (chốt trước khi đo): JSON hợp lệ sau tối đa một lần thử lại ≥ 98%; `refs` đúng ≥ 90%; việc cần làm bịa hẳn: ban đầu ≤ 1 mỗi 10 cuộc họp, **nay tính theo mốc Cloud** (không tệ hơn Cloud đo cùng bộ thử, chủ dự án chốt 2026-11-13); sai chi tiết và độ đủ không có ngưỡng đạt/trượt mà công bố làm số cảnh báo; đúng ngôn ngữ đầu ra ở mọi bản (20/20); phiên 60 phút xong trong ≤ 15 phút (900 s), có hay không có GPU (chủ dự án nới ngày 2026-11-12; trước là ≤ 3 phút có GPU, ≤ 10 phút chỉ CPU); RAM đỉnh của tiến trình ghi chú ≤ 6 GiB.
- **Không ứng viên nào đạt:** dừng, báo chủ dự án xem lại G3.
- Kết quả ghi ở `bench/2026-11-11-ghi-chu-cuoc-hop/`.

### 10.1 Kết quả đo (2026-11-13, ba vòng): chưa đạt

Chi tiết: `bench/2026-11-11-ghi-chu-cuoc-hop/results/tong-hop.md`.

- Hệ tốt nhất: `qwen3-5-4b` (Q4_K_M, Apache-2.0), cấu hình `c16kx`: lời nhắc chặt cho việc cần làm, gộp đoạn chỉ viết tóm tắt, lượt kiểm từng việc đọc câu gốc. Đạt JSON 100%, ngôn ngữ 20/20, `refs` 100%, phiên 60 phút 840 s (iGPU), RAM đỉnh 4315 MiB.
- **Rớt việc cần làm bịa:** chấm tách hai loại (vòng 3): 7 việc bịa hẳn trên 20 bản (ngưỡng ≤ 2) và 41 việc có thật nhưng sai người nhận, hạn hay chi tiết; tổng 48/177. Cho model đọc lời gốc thay vì bản dịch (`c16ky`) không hơn rõ ràng: sai chi tiết giảm nhưng sót việc và bịa hẳn tăng.
- `llama-server` của tiến trình ghi chú phải chạy với `--cache-ram 0` (mặc định giữ tới 8 GiB bộ đệm prompt trên RAM).
- **Mốc Cloud** (DeepSeek `deepseek-v4-flash`, chấm mù chung, 2026-11-13): bịa hẳn 10/20 bản, sai chi tiết 10, recall 94%; Local `c16kx` cùng lượt: bịa hẳn 8, sai chi tiết 32, recall 59%. Ngưỡng "bịa ≤ 1 mỗi 10 cuộc họp" model cloud cũng không đạt với tiêu chí chấm này; khoảng cách Local–Cloud nằm ở chi tiết và độ đủ.
- Chưa đo: mốc Gemini/ChatGPT, chỉ CPU với cấu hình mới, máy 16 GB, nhiễu nhận dạng giọng nói.
- **Quyết định (2026-11-13):** Cloud cũng không đạt ngưỡng gốc (bịa hẳn 10/20), nên ngưỡng thành "không tệ hơn Cloud"; Local đạt về bịa hẳn (8 so với 10). Local kém ở sai chi tiết và độ đủ, vì vậy Local ra mắt như bản nháp có cảnh báo (G2, mục 7) và Cloud là đường khuyến nghị. G3 được giữ.
- **Chỉ CPU (đo 2026-11-13, i5-1345U, không dùng iGPU):** phiên 60 phút (bản ko) xong trong 1465 s (khoảng 24 phút), RAM đỉnh 4846 MiB. Vượt ngưỡng 900 s, nên cảnh báo Local nói "có thể mất hơn 20 phút với cuộc họp dài khi máy không có GPU"; với GPU tích hợp là 840 s. Một bản đo, một máy: ghi là số tham khảo, không cam kết.

## 11. Rủi ro

1. **llama.cpp đang khóa (b11146) có thể chưa chạy được model đời mới.** Ưu tiên ứng viên chạy được trên bản đang khóa. Nếu không có: đóng kèm một binary `llama-server` riêng cho ghi chú (bộ cài nặng hơn), **không nâng bản dùng cho đường dịch** trong phạm vi spec này.
2. **Chưa có máy Windows 16 GB chỉ CPU và máy 8 GB để đo** (spec gốc §8). Ngưỡng G8 nằm trong manifest (`notes.min_ram_mib`) để đổi mà không phát hành lại app.
3. **Model nhỏ bịa việc cần làm.** Giảm bằng `refs` bắt buộc, nút đối chiếu, và dòng nhắc "kiểm lại trước khi gửi" dưới kết quả.
4. **Bản chép lời gói Nhẹ kém ở vi, ja, ko, zh** (spec gốc §8) làm ghi chú kém theo. Bộ thử phải có bản chép lời của gói Nhẹ.

## 12. Chỗ phải sửa theo

- Spec gốc: §3.2 bỏ dòng "Tóm tắt hoặc biên bản cuộc họp"; thêm F14 vào §3.1; D7 và §10.1 ghi ngoại lệ Cloud của ghi chú; §4.3 thêm màn hình; §6.6 bảng `notes`; §6.7 mục `notes` của manifest; §6.9 bốn cài đặt mới.
- `docs/legal/`: chính sách quyền riêng tư (vi, en) thêm mục ghi chú cuộc họp, nêu cả OpenAI, Google và DeepSeek là nơi nhận chữ chép lời khi người dùng chọn; EULA nếu có câu "xử lý 100% trên máy".
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
