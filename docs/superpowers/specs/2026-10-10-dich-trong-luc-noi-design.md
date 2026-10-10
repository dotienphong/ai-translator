# Dịch trong lúc người nói chưa dừng — Design

**Ngày:** 2026-10-10
**Trạng thái:**
- Chủ dự án đã duyệt thiết kế từng phần ngày 2026-10-10: kiểu hiện, máy yếu, cách làm, và ba phần (luồng xử lý; hiển thị và cài đặt; tự chỉnh, thứ tự làm, nghiệm thu).
- Ngưỡng ngắt câu của chế độ mới chưa chốt; chốt ở cổng sau bước 2 (§9).
- Làm trên nhánh `dich-trong-luc-noi`. Không merge vào `main` khi chủ dự án chưa cho phép.

**Phạm vi:**
- Crate `pipeline`: luồng xử lý và đo.
- `asr-worker`: chỉ việc bật lại flash attention (A5, §8).
- App Tauri: sự kiện, cài đặt, chọn chế độ.
- Giao diện thanh phụ đề và Cài đặt.
- `latency-bench`.

Không đổi model, giao thức `asr-protocol`, license server, gói hay hạn mức.

**Nghiên cứu:** `bench/2026-10-10-do-tre/README.md`. Số đo trong spec này lấy từ đó, trừ khi ghi khác. Tất cả đo trên M4 Pro, gói Chuẩn.

---

## 1. Bối cảnh

**Hiện nay** (spec chính §6.3–§7): app chỉ chép lời khi một đoạn đóng, tức là khi VAD thấy im lặng đủ ngưỡng (mặc định 50 ms). Sau đó app dịch cả đoạn.

**Đo trên M4 Pro, gói Chuẩn:**
- **Sau chỗ ngừng:** chữ dịch đầu tiên hiện sau khoảng 0,42–0,46 s; đủ câu thêm khoảng 0,25 s (p50).
- **Trong lúc người nói chưa dừng thì chưa có gì:**
  - Mỗi từ chờ trung bình 1,6 s để đoạn của nó đóng.
  - Từ đầu câu tới lúc đoạn đầu đóng: p50 3,1 s, p90 5,8 s.
  - Câu dài nói liền chờ tới 8 s, bằng độ dài đoạn tối đa.
- **Ngưỡng 50 ms làm câu vụn:** số đoạn tăng 56%. Mỗi lần ghép, bản dịch đang hiện bị xóa rồi dịch lại từ đầu.
- **A2 hiện có không thấy phần chờ trong lúc nói.** A2 (p50 ≤ 2,0 s, đạt khoảng 1 s) đo từ lúc người nói dừng, và đo với ngưỡng 300 ms.

**Không thể xuống 0 s:**
- Phải nghe xong một từ thì mới chép được từ đó.
- Dịch cần ngữ cảnh: tiếng Nhật và tiếng Hàn để động từ và phủ định ở cuối câu.
- Chưa hệ thống nào đã công bố cho bản dịch ổn định dưới khoảng 1,4 s. Google Meet đặt mục tiêu 2–3 s.

**Mục tiêu:**
- Chữ dịch tạm chạy theo lời nói, chậm khoảng 1 s.
- Phần ổn định chậm 1,5–3 s.
- Không còn những lúc phải chờ 5–8 s.
- Bản cuối giữ nguyên chất lượng.

## 2. Quyết định đã chốt

| # | Hạng mục | Quyết định |
|---|---|---|
| QĐ1 | Kiểu hiện | Hai tầng: phần ổn định giữ độ đậm bình thường, phần tạm nhạt hơn và có thể đổi. Khi người nói ngừng, bản dịch cả câu thay vào. |
| QĐ2 | Máy yếu | Tự động theo sức máy: tự giãn nhịp; không theo kịp thì tự về cách hiện nay. Có công tắc trong Cài đặt, mặc định bật. |
| QĐ3 | Cách làm | Dùng model hiện có, chép từng phần đoạn đang mở. Không đổi model. Lượt cuối giữ nguyên như hiện nay. |
| QĐ4 | Ngắt câu ở chế độ này | Chốt sau khi đo các ngưỡng 50, 200, 400 và 600 ms ở bước 2 (§9). |
| QĐ5 | Nơi hiện | Dòng đang nói chỉ có trên thanh phụ đề. Cửa sổ chính, bản chép lời, lịch sử và xuất file chỉ chứa bản cuối. |
| QĐ6 | Thứ tự | Bốn bước (§9): đo đúng và cải tiến nhanh; bản thử kèm cổng duyệt; hoàn thiện; nghiệm thu. |
| QĐ7 | Nghiệm thu | Theo bảng ở §10.2. |
| QĐ8 | Nhánh | Nhánh `dich-trong-luc-noi`. Không merge khi chủ dự án chưa cho phép. |

## 3. Thuật ngữ

- **Đoạn mở:** đoạn VAD đang ghi, khi người nói chưa ngừng đủ ngưỡng ngắt câu.
- **Lần chép từng phần:** gửi âm thanh của đoạn mở, từ đầu đoạn tới hiện tại, cho `asr-worker`.
- **Phần ổn định:** phần đầu đã chốt; không bị rút lại khi đoạn còn mở.
- **Phần tạm:** đuôi còn có thể đổi.
- **Lượt cuối:** khi đoạn đóng, chép lời cả đoạn rồi dịch cả câu, đúng như hiện nay.
- **Dòng đang nói:** dòng trên thanh phụ đề hiện bản tạm của đoạn mở.
- **Vòng cập nhật:** một lần chép từng phần, cộng lần dịch bản tạm đi kèm.
- **Nhịp T:** khoảng cách tối thiểu giữa hai lần chép từng phần.
- **Chế độ này:** dịch trong lúc người nói chưa dừng.
- **Chế độ thường:** cách app chạy hiện nay.
- **Khóa so khớp:** dạng chuẩn hóa NFC, chữ thường, bỏ dấu câu.
- **Đơn vị:** một chữ (ký tự không phải khoảng trắng) với tiếng Trung và tiếng Nhật; một từ (tách theo khoảng trắng) với các tiếng còn lại.

## 4. Luồng xử lý

### 4.1 Chép từng phần

- `Segmenter` thêm một hàm đọc ảnh chụp đoạn mở, gồm:
  - id mà đoạn sẽ nhận khi đóng (`next_id`);
  - `start_ms`;
  - âm thanh từ đầu phần đệm trước tới khung hiện tại;
  - độ dài tiếng nói.
- **Lần chép theo nhịp.** Luồng VAD tạo yêu cầu chép từng phần khi đủ tất cả điều kiện sau:
  - chế độ này đang bật (§6.3) và chưa tự tắt (§5);
  - đoạn mở đã có ít nhất `streaming.min_partial_speech_ms` tiếng nói (mặc định 1000);
  - từ lần chép từng phần trước đã qua ít nhất T (§5);
  - đã có thêm ít nhất `streaming.min_new_speech_ms` tiếng nói (mặc định 300);
  - hàng đợi nhận dạng không có đoạn đóng nào đang chờ.
- **Lần chép khi vừa hết tiếng nói.** Chỉ áp dụng khi ngưỡng ngắt câu của chế độ này lớn hơn 2 khung (64 ms).
  - Segmenter vừa thấy 2 khung im lặng sau tiếng nói, đoạn còn mở, và có tiếng nói mới từ lần chép từng phần trước: luồng VAD tạo ngay một lần chép từng phần, không chờ T.
  - Áp dụng cả với đoạn ngắn hơn `min_partial_speech_ms`, miễn đủ 250 ms tiếng nói.
  - Nhờ vậy chữ cuối câu hiện nhanh như ở ngưỡng 50 ms.
- **Yêu cầu dùng đúng `Transcribe` của giao thức bản 2**, không đổi `asr-protocol`:
  - `pcm` là âm thanh của ảnh chụp.
  - `languages`: lần chép đầu của đoạn dùng tập ngôn ngữ cho phép. Các lần sau dùng ngôn ngữ đã nhận ở lần đầu, để ngôn ngữ không nhảy qua lại.
  - `prompt_tokens`, `prev_lang` và `audio_ctx` tính đúng như lượt cuối.
- **Hàng đợi nhận dạng:**
  - Đoạn đóng luôn được xử lý trước.
  - Chỉ giữ tối đa một yêu cầu chép từng phần đang chờ; yêu cầu mới thay yêu cầu cũ.
  - Luật gộp và bỏ đoạn của §7 spec chính chỉ áp cho đoạn đóng.
- **Lọc:** kết quả đi qua đúng bộ lọc ảo giác của §6.4 spec chính. Bị lọc thì không cập nhật dòng đang nói.
- **Lỗi:** lần chép từng phần lỗi thì không gửi lại. Luật khởi động lại và đếm lỗi của `asr-worker` (§6.4 spec chính) giữ nguyên.

### 4.2 Chốt chữ nguồn

- **Phần ổn định** của chữ nguồn là phần chung dài nhất, theo khóa so khớp, của hai lần chép liền nhau (LocalAgreement-2), trừ `streaming.src_holdback` đơn vị cuối. Mặc định: 1 từ, hoặc 2 chữ với tiếng Trung và tiếng Nhật.
- **Hiển thị** dùng nguyên chữ của lần chép mới nhất.
- **Chỉ dài thêm.** Khi đoạn còn mở, phần ổn định không bao giờ rút lại.
  - Nếu lần chép mới không khớp phần đã chốt, phần tạm lấy các đơn vị của lần chép mới, từ vị trí bằng độ dài phần đã chốt trở đi.
  - Sai lệch được sửa ở lượt cuối.

### 4.3 Dịch bản tạm

- **Chữ nguồn đem dịch:** phần ổn định cộng phần tạm của lần chép mới nhất.
  - Đoạn mở có thể nối tiếp một câu còn trong cửa sổ ghép. Điều kiện xét theo luật ghép §6.3 spec chính, với ngôn ngữ của lần chép từng phần: cùng ngôn ngữ, chưa chốt, chưa đạt trần.
  - Khi nối tiếp, chữ nguồn đem dịch là câu đó nối với chữ của đoạn mở (cách nối như khi ghép), và dòng đang nói hiện thay chỗ câu đó (§6.1).
- **Request** như lượt cuối:
  - cùng mẫu prompt, cùng thuật ngữ có trong câu;
  - stream, temperature 0, repeat penalty 1,05;
  - `max_tokens` theo §6.5 spec chính, tính trên chữ nguồn đem dịch.
- **Prefill:** nếu đã có phần dịch đã chốt (§4.4), app gửi nó làm tin nhắn assistant cuối.
  - Phần prefill không được kết thúc bằng khoảng trắng; khoảng trắng cuối làm lệch token (đã đo).
  - `llama-server` b11146 stream lại cả phần prefill, nên client coi chữ stream về là toàn bộ bản dịch.
  - `--prefill-assistant` mặc định bật ở b11146, nên không cần đổi lệnh chạy.
- **Hậu xử lý** như lượt cuối (bỏ nhãn đầu câu, ngoặc kép). Bản dịch vi phạm luật độ dài hay luật khác của §6.5 spec chính thì bị bỏ. Không thử lại với repeat penalty cao hơn.
- **Dấu kết câu:** `.` `?` `!` `。` `？` `！` ở cuối bản dịch tạm không được hiện, vì câu chưa xong.
- **Câu đã là ngôn ngữ đích** thì không dịch; dòng đang nói chỉ hiện câu gốc, giống `same_lang`.

### 4.4 Chốt phần dịch

- **Đơn vị** tính theo ngôn ngữ đích: chữ với đích tiếng Trung và tiếng Nhật; từ với các đích còn lại.
- **Phần dịch ổn định** là phần chung dài nhất của n bản dịch tạm liền nhau đã xong, trừ k đơn vị cuối. Bản bị hủy giữa chừng không tính.

  Mặc định theo tiếng nguồn:

  | Tiếng nguồn | n | k |
  |---|---|---|
  | en, vi | 2 | 1 |
  | zh | 2 | 2 |
  | ja, ko | 3 | 2 |

- **Chỉ dài thêm.** Khi đoạn còn mở, phần dịch ổn định không bao giờ rút lại.
- Các giá trị trên chỉ là điểm xuất phát. Bước 2 (§9) chỉnh lại theo số đo trễ và độ nháy, vì chốt sớm có thể làm sai nghĩa. Nghiên cứu §2 đã thấy điều này với câu tiếng Nhật và tiếng Trung.

### 4.5 Lượt cuối

- **Khi đoạn đóng**, các bước sau giữ nguyên §6.3–§6.6 và §7 spec chính: chép lời cả đoạn, lọc, ghép câu, dịch cả câu không prefill, rồi chốt phụ đề.
- **Trong lúc lượt cuối của đoạn chưa xong**, dòng đang nói vẫn giữ chữ đang hiện.
- **App gỡ dòng đang nói** khi một trong các việc sau xảy ra:
  - phụ đề tương ứng đã chốt (`done`, `failed`, `same_lang` hay `skipped`); đó là phụ đề mới của đoạn, hoặc câu được ghép thêm đoạn đó;
  - đoạn bị lọc hay bị bỏ.

### 4.6 Ưu tiên

- **`asr-worker`:** đoạn đóng trước, lần chép từng phần sau (§4.1).
- **Dịch:**
  - Mỗi lúc chỉ có tối đa một yêu cầu dịch bản tạm; yêu cầu mới hủy yêu cầu cũ.
  - Việc dịch của lượt cuối (§7 spec chính) luôn được ưu tiên. Khi có việc của lượt cuối cần chạy, yêu cầu dịch bản tạm đang chạy bị hủy.
  - Không gửi yêu cầu bản tạm nào khi hàng đợi dịch còn việc của lượt cuối.
- **Cờ hủy** được kiểm ở mỗi gói chữ stream về, kể cả khi hậu xử lý đang giữ chữ, và trước khi gửi request (A2, §8).
- **`llama-server`** giữ `-np 1`.

### 4.7 Ngắt câu ở chế độ này

- Ngưỡng im lặng để đóng đoạn ở chế độ này là giá trị lớn hơn của `vadEndSilenceMs` (người dùng chỉnh) và `streaming.end_silence_ms`.
- `streaming.end_silence_ms` được chốt ở cổng sau bước 2, chọn một trong 50, 200, 400 và 600 ms (QĐ4).
- Cửa sổ ghép giữ công thức max(700 ms, ngưỡng + 400 ms) của §6.3 spec chính, tính với ngưỡng đang dùng.
- Chế độ thường giữ nguyên `vadEndSilenceMs`.

## 5. Tự chỉnh theo sức máy

- **Đo một vòng cập nhật:** từ lúc gửi lần chép từng phần tới lúc bản dịch tạm của nó xong. Vòng bị hủy thì không tính.
- **Nhịp T:**
  - Lấy trung vị của tối đa `streaming.cycle_window` vòng gần nhất (mặc định 8).
  - T = `streaming.cadence_factor` × trung vị (mặc định 1,5), kẹp trong khoảng [`streaming.min_cadence_ms`, `streaming.max_cadence_ms`] (mặc định [700, 2000]).
  - Như vậy GPU bận không quá khoảng 65%. Khi chưa đủ 3 vòng, T = 1000 ms.
- **Tự tắt:**
  - Khi trung vị của 8 vòng gần nhất lớn hơn `streaming.auto_off_cycle_ms` (mặc định 1300), chế độ này tắt tới hết phiên.
  - Từ đoạn kế tiếp, app chạy như chế độ thường, và ngưỡng ngắt câu trở về `vadEndSilenceMs`.
  - App báo cho giao diện (§6.3) và ghi log sự kiện này (không kèm nội dung).
- **Tắt ngay từ đầu phiên** khi máy là:
  - Windows chỉ có GPU tích hợp (`probe::only_integrated_gpu`, cũng là lúc `llama-server` chạy `-ngl 0`); hoặc
  - máy có `asr-worker` báo backend `Cpu`.

  Lý do: S6 trên Windows đo riêng lượt cuối đã mất 1,3–4 s.
- **Cấu hình:** mọi ngưỡng ở mục này và ở §4 nằm trong `PipelineConfig.streaming`, đổi được qua manifest (§6.7 spec chính). Giá trị vô lý thì giữ mặc định.

## 6. Hiển thị và cài đặt

### 6.1 Thanh phụ đề

- **Vị trí:** dòng đang nói nằm sau dòng cuối. Nếu nó nối tiếp một câu còn trong cửa sổ ghép (§4.3), nó nằm đúng chỗ câu đó, và câu đó tạm ẩn.
- **Hai tầng:**
  - Câu gốc (nếu đang bật "hiện câu gốc") và bản dịch đều chia hai phần.
  - Phần ổn định giữ độ đậm bình thường. Phần tạm có độ mờ 0,65, giống `.provisional` hiện nay.
  - Chữ dịch tạm vẫn hiện dần từng chữ khi stream.
- **Phụ đề tạm:** ở chế độ này, phụ đề tạm (`provisional`, §6.3 spec chính) không còn nhạt cả dòng. Chỉ phần tạm của dòng đang nói nhạt.
- **Khi lượt cuối xong:** app gỡ dòng đang nói, phụ đề cuối hiện đúng chỗ đó. Nếu hai bản giống nhau, người xem chỉ thấy phần nhạt chuyển thành bình thường. Không có hiệu ứng chuyển.
- **Cuộn và khóa:** tự cuộn, nút "Mới nhất" và khóa thanh như §4.4 spec chính. Dòng đang nói tính như một dòng.
- **Hiệu năng:** dòng đang nói cập nhật dày, nên chỉ vẽ lại dòng có thay đổi (A4, §8).

### 6.2 Sự kiện

- **Thêm `subtitle://live`**, chở `LiveLine { id, extends, src_lang, src_stable, src_tail, tgt_stable, tgt_tail, tgt_src_units }`:
  - `id`: id của đoạn mở, cũng là id đoạn nhận khi đóng.
  - `extends`: id của phụ đề tạm mà dòng đang nói nối tiếp, nếu có.
  - Phần ổn định và phần tạm gửi thành hai chuỗi riêng, không gửi chỉ số, để tránh lệch giữa UTF-8 và UTF-16.
  - `tgt_src_units`: số đơn vị nguồn mà bản dịch đang hiện được dịch từ đó. Chỉ dùng để đo (§10.1); giao diện bỏ qua.
- **Thêm `subtitle://live-end { id }`**, phát khi gỡ dòng đang nói (§4.5), khi chế độ này tự tắt và khi dừng phiên.
- **`subtitle://upsert` và `subtitle://delta`** của lượt cuối giữ nguyên.
- Chỉ luồng phụ đề phát các sự kiện này (§7 spec chính), nên thứ tự luôn đúng.
- Cửa sổ chính bỏ qua `subtitle://live` (QĐ5).

### 6.3 Cài đặt

- **Công tắc:** Cài đặt › Phụ đề thêm công tắc **"Dịch trong lúc người nói chưa dừng"** (`translateWhileSpeaking`), mặc định bật. Đổi khi đang dịch thì có tác dụng từ đoạn kế tiếp.
- **Ghi chú dưới công tắc** khi chế độ bị tắt từ đầu (§5) hoặc vừa tự tắt:
  - vi: "Máy này chưa đủ nhanh, app đang dịch sau mỗi câu."
  - en: "This computer isn't fast enough, so the app translates after each sentence."
- **Khung xem trước** của nhóm Phụ đề hiện mẫu hai tầng.
- Chuỗi giao diện có đủ tiếng Việt và tiếng Anh (§4.5 spec chính).

### 6.4 Lưu trữ và quyền riêng tư

- Bản tạm chỉ nằm trong bộ nhớ. Nó không vào bản chép lời, lịch sử, xuất file hay log (§10.2 spec chính). Log chỉ ghi số đo thời gian.
- Hạn mức tính như cũ, bằng `speech_ms` của lượt cuối.

## 7. Lỗi

| Tình huống | Xử lý |
|---|---|
| Lần chép từng phần lỗi, hết giờ, hay `asr-worker` khởi động lại | Bỏ lần đó, không gửi lại; vòng sau làm tiếp. Luật khởi động lại và đếm lỗi của §6.4 spec chính giữ nguyên. |
| Dịch bản tạm lỗi, bị cắt ở `max_tokens`, hay vi phạm luật của §6.5 spec chính | Bỏ kết quả đó, giữ chữ đang hiện, không thử lại. |
| `llama-server` không dùng được | Như §6.5 spec chính; dòng đang nói chỉ hiện câu gốc. |
| Máy không theo kịp | Tự tắt (§5). |
| Đoạn bị lọc hay bị bỏ ở lượt cuối | Gỡ dòng đang nói. |

## 8. Cải tiến nhanh (bước 1)

| # | Việc | Lợi ước tính | Điều kiện giữ |
|---|---|---|---|
| A1 | Đo bằng engine thật: `latency-bench` có thêm chế độ chạy `pipeline::Engine` với `SampleSource` phát WAV theo thời gian thực, và một `EventSink` ghi mọi sự kiện kèm thời điểm. Thêm các chỉ số ở §10.1. Đo lại mốc chế độ thường với ngưỡng 50 ms. | Số đo khớp với app | — |
| A2 | Khi ghép câu, không xóa bản dịch đang hiện mà giữ tới khi bản mới dài hơn. Kiểm cờ hủy ở mỗi gói stream, kể cả khi hậu xử lý đang giữ chữ, và trước khi gửi request. | Bớt nháy; nhanh hơn 10–40 ms mỗi lần ghép | Test engine đạt |
| A3 | Thu âm: bỏ khoảng ngủ cố định 20 ms trước mỗi lần đọc (`src-tauri/src/capture.rs`); resample theo khối nhỏ hơn 1024 mẫu. | Khoảng 25 ms | CPU không tăng đáng kể; test resample đạt |
| A4 | Thanh phụ đề: memo theo từng dòng, chỉ cập nhật dòng có thay đổi. | 1–10 ms mỗi gói chữ ở phiên dài | Test giao diện đạt |
| A5 | Bật lại flash attention của whisper.cpp, với `audio_ctx` làm tròn lên bội của 256 để không có hàng đệm (né lỗi #3941). | Chép lời nhanh hơn 5–13% | Đạt test tất định: cùng một đoạn, chép sau các đoạn khác nhau, phải ra cùng token. Chạy lại A4 không xấu quá mốc. Không đạt thì giữ tắt. Theo kết quả, sửa mục "Flash attention: tắt" ở §6.4 spec chính. |

## 9. Thứ tự làm và cổng

1. **Bước 1:** làm A1–A5 (§8). Kết quả của bước này là mốc của chế độ thường, đo bằng engine thật với ngưỡng 50 ms, cho cả hai gói, trên 6 session S6.
2. **Bước 2: bản thử trong `pipeline`**, gồm §4–§5, chưa có giao diện.
   - Đo bằng A1 trên 6 session S6 cho cả hai gói, với `streaming.end_silence_ms` lần lượt là 50, 200, 400, 600, và vài bộ (n, k) của §4.4.
   - **Cổng:** chủ dự án chốt ngưỡng ngắt câu và các tham số theo số đo. Nếu không đạt các mục tiêu trễ ở §10.2 thì quay lại thiết kế trước khi sang bước 3.
3. **Bước 3: hoàn thiện trong app:**
   - sự kiện mới và dòng hai tầng;
   - công tắc trong Cài đặt;
   - tự chỉnh nhịp và tự tắt;
   - `PipelineConfig.streaming` đọc từ manifest;
   - chuỗi giao diện tiếng Việt và tiếng Anh;
   - test.
4. **Bước 4:** nghiệm thu (§10), rồi sửa spec chính (§12). Chỉ merge vào `main` khi chủ dự án cho phép (QĐ8).

## 10. Đo và nghiệm thu

### 10.1 Chỉ số (A1)

- **Thời điểm nói của từng từ:**
  - Chưa có mốc thời gian cho từng từ. Vì vậy chia đều khoảng `start_ms`–`end_ms` của câu trong `*.truth.json` cho các đơn vị của bản chép cuối.
  - Đây là xấp xỉ, giống cách tính trong nghiên cứu.
- **Trễ của chữ tạm, theo từ:**
  - Lấy thời điểm đầu tiên dòng đang nói có bản dịch với `tgt_src_units` phủ tới từ đó. "Phủ" nghĩa là phần nguồn đã dịch khớp tiền tố của bản chép cuối tới từ đó, theo khóa so khớp.
  - Trừ đi thời điểm nói của từ.
  - Từ chỉ có bản dịch ở lượt cuối thì lấy thời điểm lượt cuối hiện chữ dịch đầu tiên.
- **Trễ của chữ ổn định, theo từ (xấp xỉ theo tỉ lệ):**
  - Lấy thời điểm đầu tiên mà phần dịch ổn định có số đơn vị ít nhất bằng (vị trí của từ ÷ số đơn vị của câu nguồn) × số đơn vị của bản cuối.
  - Trừ đi thời điểm nói của từ.
  - Nếu không có thời điểm như vậy thì lấy thời điểm lượt cuối hiện xong.
- **Từ lúc bắt đầu nói tới chữ dịch đầu tiên:** với mỗi câu của truth, lấy thời điểm đầu tiên có chữ dịch (ở tầng nào cũng được) trừ `start_ms`.
- **Độ nháy:**
  - Tầng ổn định: số đơn vị của phần dịch đã ổn định mà bản cuối thay đổi (không khớp tiền tố của bản cuối), chia cho số đơn vị của bản cuối.
  - Tầng tạm: tổng số đơn vị bị rút lại giữa các lần cập nhật, chia cho số đơn vị của bản cuối. Chỉ báo cáo, không đặt ngưỡng.
- **Mức bận:** tổng thời gian chép lời (`asr_ms`) và thời gian stream bản dịch, chia cho thời gian phiên. Chỉ báo cáo.
- A2 hiện có (tính từ lúc người nói dừng) vẫn tính như cũ.

### 10.2 Tiêu chí

Áp dụng trên M4 Pro, gói Chuẩn, 6 session S6, với chế độ này bật.

| Chỉ số | Mục tiêu |
|---|---|
| Trễ của chữ tạm, theo từ | p50 ≤ 1,2 s |
| Trễ của chữ ổn định, theo từ | p50 ≤ 2,0 s với en, vi, ko; ≤ 3,0 s với zh, ja |
| Từ lúc bắt đầu nói tới chữ dịch đầu tiên | p90 ≤ 2,0 s |
| Độ nháy của tầng ổn định | ≤ 10% số đơn vị của bản cuối |
| Bản cuối | A2 vẫn đạt. CPU cả máy ≤ 30% (§8 spec chính). Lượt cuối không đổi code của bước dịch, nên không phải chấm lại A3. Chỉ chấm lại A4 khi A5 bật flash attention. |
| Gói Nhẹ, trên M4 Pro | Báo cáo số đo, không đặt ngưỡng riêng |
| Máy Windows yếu (i5-1345U, GPU tích hợp và chỉ CPU) | Chế độ này tự tắt từ đầu phiên; số đo không kém mốc S6 trên Windows. Chủ dự án chạy đo trên máy đó. |

## 11. Kiểm thử

- **Unit test** trong crate `pipeline`:
  - chốt chữ nguồn và chốt phần dịch: từ và chữ CJK, dấu tiếng Việt, dấu câu, giữ lại đuôi, chỉ dài thêm;
  - prefill không có khoảng trắng ở cuối;
  - điều khiển nhịp và tự tắt;
  - ưu tiên và hủy: việc của lượt cuối hủy yêu cầu bản tạm đang chạy;
  - chuyển từ dòng đang nói sang phụ đề cuối, trong các trường hợp: ghép câu, bị lọc, bị bỏ, dừng phiên. Dùng harness `Composer` có sẵn trong `engine.rs`.
- **Engine** với `fake_asr_worker` và `fake_llama_server` (đã có): chạy luồng chép từng phần và dịch bản tạm, kể cả việc `llama-server` stream lại phần prefill.
- **Giao diện** qua `scripts/ui-preview` và Playwright:
  - dòng hai tầng;
  - dòng nối tiếp một câu đang ghép;
  - bản cuối thay vào;
  - khung xem trước;
  - công tắc và ghi chú.
- **Đo:** dùng A1 ở các bước 1, 2 và 4.

## 12. Việc sửa spec chính khi xong

| Mục | Nội dung cần sửa |
|---|---|
| §3.3 | A2 và các tiêu chí mới |
| §4.3 | Cài đặt › Phụ đề |
| §4.4 | Dòng đang nói |
| §6.3 | Ngưỡng ngắt câu ở chế độ này |
| §6.4 | Chép từng phần; flash attention theo kết quả A5 |
| §6.5 | Bản tạm, prefill |
| §6.6 | Sự kiện mới |
| §7 | Ưu tiên, hàng đợi |
| §8 | Ngân sách độ trễ |

## 13. Ngoài phạm vi

- Qwen3-ASR (mục 6 của README nghiên cứu): thành hướng riêng cho gói Nhẹ và máy chỉ có CPU.
- Tự đổi model dịch sang Q4_K_M trên Mac băng thông thấp.
- Speculative decoding: đo không thấy nhanh hơn.
- AlignAtt: cần vá whisper.cpp.
- Dòng đang nói ở cửa sổ chính (QĐ5).
- Sàn `audio_ctx` thấp hơn cho lần chép từng phần.

## 14. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Chốt sớm làm sai nghĩa (đã thấy ở câu tiếng Nhật và tiếng Trung) | Chọn n, k thận trọng cho ja, ko, zh; lượt cuối không ép prefill; chỉnh ở bước 2 |
| GPU bận làm app họp giật hay tốn pin | Nhịp tự chỉnh (GPU bận không quá khoảng 65%); công tắc tắt |
| Số đo trên câu đọc (FLEURS) khác với hội thoại thật | Ghi rõ giới hạn này; đo thêm khi có bản ghi hội thoại được phép dùng |
| `engine.rs` đã dài 2286 dòng | Phần mới (chốt chữ, nhịp) đặt ở module riêng; `Composer` chỉ thêm phần nối |
| Sàn `audio_ctx` 512 làm mỗi lần chép từng phần tốn khoảng 200 ms với turbo | Chấp nhận; nhịp tự chỉnh; thử sàn thấp hơn ở một đợt sau (§13) |
