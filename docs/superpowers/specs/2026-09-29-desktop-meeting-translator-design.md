# Meeting Translator (tên tạm): app desktop dịch phụ đề cuộc họp offline — Design

**Ngày:** 2026-09-29
**Trạng thái:** Bản nháp qua brainstorming, chờ PHONG duyệt
**Phạm vi:** Sản phẩm mới, repo mới `meeting-translator/`, gồm app desktop cho Windows và macOS. Sản phẩm **tách hẳn** khỏi AI Live Translator: thương hiệu, repo, người dùng và thanh toán đều riêng. Vì cùng chủ sở hữu nên được tham khảo cách làm bên đó, nhưng không dùng chung code hay hạ tầng. App Android không thuộc spec này.

---

## 1. Bối cảnh

- **Nguồn gốc ý tưởng:** ban đầu định port RTranslator (app dịch offline cho Android, Apache 2.0). Sau khi phân tích, hướng đi đổi sang **dịch cuộc họp trên máy tính**, vì Android không cho app bên thứ ba thu âm thanh cuộc gọi và VoIP:
  - `AudioPlaybackCapture` chỉ thu được `USAGE_MEDIA`, `USAGE_GAME` và `USAGE_UNKNOWN`.
  - Khi đang có cuộc gọi, mic của app thường chỉ nhận được im lặng.
- **Trên máy tính thì thu được âm thanh hệ thống:** Windows dùng WASAPI loopback, macOS dùng Core Audio process tap (từ macOS 14.2). Nhiều dự án chép lời cuộc họp chạy trên máy (Meetily, acta, whisper-meet…) đã chứng minh hướng này khả thi.
- **Benchmark 2026-09-29** trên Mac M4 Pro, 320 câu WMT24++; chi tiết ở `bench/2026-09-29-mt-benchmark/REPORT.md`:

  | Model | COMET (320 câu) | Ghi chú |
  |---|---|---|
  | **Hy-MT2-1.8B** | **0,837** | Cao nhất; không câu nào bị rỗng hoặc dài/ngắn bất thường |
  | HY-MT1.5-1.8B | 0,833 | |
  | MADLAD-3B | 0,779 | |
  | NLLB-600M | 0,736 | |

  - Tốc độ: Hy-MT2 Q8_0 chạy trên CPU 4 luồng mất **0,45 giây/câu**, RAM tối đa khoảng 4 GB.
  - Nén 8-bit làm COMET giảm nhiều nhất 0,006.
- **Đối thủ:** Teams, Zoom và Meet đều có phụ đề dịch, nhưng chỉ ở các gói trả phí cao và chạy trên cloud. Công cụ bên thứ ba cũng phần lớn chạy trên cloud.
- **Điểm khác biệt của sản phẩm:**
  - Xử lý hoàn toàn offline trên máy.
  - Dùng được với mọi app họp, không cần bot hay plugin.
  - Dịch tiếng Việt tốt.
  - Thêm một phút dịch không tốn chi phí.

## 2. Quyết định đã chốt

| # | Hạng mục | Quyết định |
|---|---|---|
| D1 | Sản phẩm | App desktop hiện **phụ đề dịch trực tiếp cho mọi âm thanh máy tính đang phát**: Teams, Zoom, Meet, Zalo PC, webinar, video. Không cần bot, plugin hay tài khoản trên các nền tảng họp. |
| D2 | Quan hệ với AI Live Translator | Sản phẩm hoàn toàn riêng |
| D3 | Nền tảng MVP | macOS 14.2+ trên Apple Silicon; Windows 10/11 64-bit (x64) |
| D4 | Công nghệ | **Tauri 2**: lõi Rust, giao diện React 18, TypeScript, Vite, Zustand. Engine là whisper.cpp và llama.cpp. |
| D5 | Model dịch | **Hy-MT2-1.8B** (Apache 2.0), định dạng GGUF |
| D6 | Model nhận dạng giọng nói | Whisper (MIT) chạy qua whisper.cpp |
| D7 | Nơi xử lý | 100% trên máy, âm thanh không rời khỏi máy |
| D8 | Ngôn ngữ giao diện | Tiếng Việt và English, đổi được trong Cài đặt |
| D9 | Chiều dịch | MVP chỉ dịch một chiều: âm thanh máy đang phát → phụ đề ngôn ngữ của người dùng. Nếu cả hai bên cùng cài app thì mỗi bên đều thấy phụ đề của phía kia. |
| D10 | Phân phối | Tải từ website của sản phẩm. Chưa lên Microsoft Store hay Mac App Store. |

**Đề xuất mặc định, PHONG xác nhận khi duyệt spec:**

| # | Hạng mục | Đề xuất |
|---|---|---|
| P1 | Kiếm tiền | **Không có quảng cáo.** Free: 30 phút dịch mỗi ngày. **Pro** (thuê bao tháng hoặc năm): dịch không giới hạn, từ điển thuật ngữ, lưu lịch sử và xuất bản chép lời. Giá chốt sau. |
| P2 | Bản quyền | **License key của Polar.sh**, dùng một tổ chức Polar mới cho thương hiệu mới. MVP không có tài khoản người dùng và không có backend riêng. |

## 3. Mục tiêu, phạm vi, tiêu chí thành công

### 3.1 Tính năng MVP

| # | Tính năng |
|---|---|
| F1 | Phụ đề dịch trực tiếp từ âm thanh hệ thống |
| F2 | Người dùng chọn ngôn ngữ đích. Ngôn ngữ nguồn được **tự nhận diện trong tập ngôn ngữ người dùng chọn** (mặc định: English, 中文, 日本語, 한국어, Tiếng Việt), hoặc khóa cố định một ngôn ngữ. Câu nào đã là ngôn ngữ đích thì hiện câu gốc, không dịch. |
| F3 | Thanh phụ đề nổi, mô tả ở §4.4 |
| F4 | Bản chép lời của phiên: xem, tìm, sao chép. Xuất ra TXT, SRT, Markdown và lưu lịch sử là tính năng Pro; lưu lịch sử mặc định tắt. |
| F5 | Từ điển thuật ngữ (Pro), tối đa 500 cặp. Chỉ những thuật ngữ **có xuất hiện trong câu** mới được đưa vào prompt. |
| F6 | Quản lý model: có gói Chuẩn và gói Nhẹ, tự đề xuất gói theo cấu hình máy, tải tiếp được khi rớt mạng, kiểm tra SHA-256 |
| F7 | Giao diện tiếng Việt và English |
| F8 | Phân quyền Free và Pro bằng license key, dùng được khi offline |
| F9 | Tự cập nhật app |
| F10 | Phím tắt toàn cục và biểu tượng ở khay hệ thống (menu bar trên Mac). Phím tắt mặc định, đổi được trong Cài đặt: `Ctrl+Alt+T` / `⌃⌥T` để bắt đầu/dừng, `Ctrl+Alt+H` / `⌃⌥H` để ẩn/hiện phụ đề, `Ctrl+Alt+L` / `⌃⌥L` để khóa/mở khóa phụ đề. Ở Giai đoạn 0 kiểm tra xem có trùng phím tắt của Teams, Zoom, Meet không. |

### 3.2 Ngoài phạm vi MVP

- Dịch giọng của người dùng rồi phát vào cuộc họp (cần micro ảo)
- Bot tham gia cuộc họp, xử lý trên cloud
- Tóm tắt hoặc biên bản cuộc họp
- Phân biệt ai đang nói
- Ghi âm cuộc họp
- Thu âm từ micro
- Linux, Mac chip Intel, Windows ARM64
- Phát hành qua các kho ứng dụng
- App mobile
- Dịch chữ trên màn hình (OCR)

### 3.3 Tiêu chí nghiệm thu

| # | Tiêu chí |
|---|---|
| A1 | **Tương thích:** chạy được với Teams (app), Zoom (app), Google Meet (Chrome và Edge; thêm Safari trên Mac) và Zalo PC, trên cả hai hệ điều hành. Nghe được qua loa, tai nghe có dây và tai nghe Bluetooth. |
| A2 | **Độ trễ**, tính từ lúc người nói dừng câu đến lúc bản dịch hiện đủ. Máy khuyến nghị: p50 ≤ 2,5 giây, p90 ≤ 4 giây. Máy tối thiểu: p50 ≤ 5 giây. |
| A3 | **Chất lượng dịch**, chấm trên văn bản (không qua bước nhận dạng giọng nói), dùng bộ test của benchmark 2026-09-29. Gói Chuẩn: COMET Anh→Việt ≥ 0,83. Gói Nhẹ: ≥ 0,80. |
| A4 | **Chất lượng nhận dạng giọng nói:** đo mốc WER của gói Chuẩn trên bộ clip họp mẫu ở Giai đoạn 0. Sau mỗi lần đổi model hay engine, WER không được xấu hơn mốc quá 10%. |
| A5 | **Ổn định:** một phiên dịch liên tục 2 giờ không crash. RAM sau giờ đầu không tăng quá 10%. |
| A6 | **Cài đặt:** bộ cài ký số hợp lệ. Bản macOS đã notarize, mở không bị Gatekeeper chặn. Gỡ app sạch, người dùng chọn giữ hay xóa model. |
| A7 | **Quyền riêng tư:** kiểm tra qua proxy mạng, trong lúc dịch không có request mạng nào, trừ các việc chạy theo lịch: kiểm tra bản quyền, kiểm tra cập nhật app và manifest model. Không request nào chứa âm thanh hay nội dung chép lời. |

## 4. Trải nghiệm người dùng

### 4.1 Lần đầu mở app

1. **Chọn ngôn ngữ giao diện.** Mặc định theo hệ điều hành: tiếng Việt nếu máy dùng tiếng Việt, còn lại là English.
2. **Kiểm tra cấu hình** (RAM, GPU, dung lượng trống), rồi đề xuất **gói Chuẩn (khoảng 2,5 GB)** hoặc **gói Nhẹ (khoảng 1,3 GB)**, có ghi rõ dung lượng sẽ tải.
3. **Tải model.** Có thể tạm dừng rồi tải tiếp. Tải xong là dùng được ngay.
4. **Cấp quyền trên macOS:** hướng dẫn bật quyền "Ghi âm thanh hệ thống", kèm nút mở System Settings. Windows không cần bước này.
5. **Chọn ngôn ngữ đích** (mặc định theo ngôn ngữ giao diện) và tập ngôn ngữ nguồn.
6. **Nghe thử:** app phát một câu tiếng Anh mẫu để người dùng thấy phụ đề hiện lên, xác nhận app hoạt động. Trên macOS, tap mặc định loại trừ chính app (§6.1), nên riêng ở bước này tap tạm thời thu cả âm thanh của app.
7. **Thông báo quyền riêng tư:** âm thanh không rời khỏi máy. Người dùng tự chịu trách nhiệm thông báo cho người cùng họp nếu pháp luật hoặc quy định công ty yêu cầu.

### 4.2 Trong cuộc họp

1. Người dùng bấm **Bắt đầu**, qua nút, phím tắt hoặc menu khay. Thanh phụ đề hiện ra, kèm chỉ báo "đang nghe" (mức âm lượng) và chỉ báo độ trễ.
2. Với gói Free: khi còn 5 phút thì nhắc. Hết 30 phút thì dừng dịch, thanh phụ đề hiện thông báo và nút nâng cấp.
3. Người dùng bấm **Dừng** để kết thúc phiên, sau đó có thể mở bản chép lời của phiên.

### 4.3 Các màn hình

- **Màn hình chính:**
  - Trạng thái: Sẵn sàng, Đang dịch hoặc Lỗi.
  - Nút Bắt đầu/Dừng.
  - Ngôn ngữ đích và tập ngôn ngữ nguồn.
  - Nguồn âm thanh: trên Windows là thiết bị phát; trên macOS là toàn hệ thống hoặc một app cụ thể.
  - Mức âm lượng vào.
  - Số phút còn lại trong ngày (gói Free).
- **Bản chép lời:** mỗi câu gồm giờ, câu gốc và bản dịch. Có tìm kiếm, sao chép, xuất file (Pro).
- **Lịch sử (Pro):** danh sách các phiên đã lưu, xóa từng phiên hoặc xóa tất cả.
- **Từ điển thuật ngữ (Pro):** thêm, sửa, xóa; nhập và xuất CSV.
- **Cài đặt:**
  - **Chung:** ngôn ngữ giao diện, khởi động cùng hệ thống, giao diện sáng/tối.
  - **Phụ đề:** cỡ chữ, số dòng, độ mờ nền, có hiện câu gốc hay không.
  - **Âm thanh:** nguồn âm thanh, độ nhạy ngắt câu.
  - **Model:** gói đang dùng, dung lượng, tải lại hoặc xóa.
  - **Phím tắt.**
  - **Bản quyền:** nhập key, trạng thái, gỡ kích hoạt.
  - **Quyền riêng tư:** bật/tắt lưu lịch sử, xóa toàn bộ dữ liệu.
- **Giới thiệu và giấy phép mã nguồn mở.**

### 4.4 Thanh phụ đề

- **Kiểu cửa sổ:** cửa sổ riêng, không viền, nền mờ bán trong suốt, **luôn nổi trên cùng**, không hiện trên taskbar hay Dock.
- **Nội dung:**
  - Hiện 1–3 dòng bản dịch gần nhất; tùy chọn hiện câu gốc chữ nhỏ ở phía trên.
  - **Bản dịch hiện dần từng chữ** trong lúc model đang dịch.
- **Di chuyển và kích thước:** kéo để di chuyển, kéo cạnh để đổi kích thước. App nhớ vị trí riêng cho từng màn hình.
- **Chế độ khóa:** cho click xuyên qua thanh phụ đề, để không cản thao tác trên cửa sổ họp. Mở khóa bằng phím tắt hoặc menu khay.
- **Nổi trên app họp đang toàn màn hình:**
  - macOS: đặt cửa sổ tham gia mọi Space, với cờ `fullScreenAuxiliary`.
  - Windows: đặt cửa sổ ở chế độ topmost.
- **Chỉ báo nhỏ:** đang nghe, không có âm thanh, hoặc đang trễ.

### 4.5 Ngôn ngữ giao diện

- **Chuỗi giao diện:** lưu trong từ điển có kiểu. `en` là nguồn chuẩn cho danh sách khóa; kiểu `Record` bắt `vi` phải có đủ mọi khóa. Đây là cách AI Live Translator đang làm, đã quen tay.
- **Đổi ngôn ngữ ngay**, không cần khởi động lại app.
- **Chuỗi phía Rust** (menu khay, thông báo hệ thống, khoảng 20 chuỗi) nằm trong một bảng nhỏ riêng, có đủ cả vi và en.

## 5. Kiến trúc tổng thể

```
┌──────────────── App: tiến trình chính Tauri, viết bằng Rust ────────────────┐
│                                                                                 │
│  Thu âm thanh ──► Tiền xử lý ──► VAD / cắt câu ──► Nhận dạng giọng nói ──┐   │
│  (WASAPI loopback  (16 kHz mono,   (Silero VAD)     (whisper-rs, GPU/CPU)  │   │
│   / Core Audio tap) ring buffer)                                           ▼   │
│                                                        Ghép phụ đề ◄── Dịch    │
│                                                        & bản chép lời  (client │
│                                                              │         HTTP)   │
│  Model · Bản quyền · Cài đặt · Lịch sử (SQLite) · Khay · Phím tắt     │   │    │
│                              │ lệnh/sự kiện Tauri                       │   │    │
│          ┌───────────────────┴────────────────────┐                     │   │    │
│   Cửa sổ chính (WebView, React)    Thanh phụ đề (WebView, trong suốt)  │   │    │
└─────────────────────────────────────────────────────────────────────────┼───┘
                                    HTTP 127.0.0.1 + API key ngẫu nhiên    │
                         ┌──────────────────────────────────────────────────▼──┐
                         │ Tiến trình phụ: llama-server (llama.cpp) + Hy-MT2 GGUF │
                         └─────────────────────────────────────────────────────────┘
```

**Vì sao chạy phần dịch thành tiến trình phụ (sidecar):**
1. Tránh lỗi trùng symbol ggml khi whisper.cpp và llama.cpp cùng nằm trong một file thực thi (đã có báo cáo lỗi ở cả C++ lẫn Rust).
2. Engine dịch có crash thì app vẫn chạy và tự khởi động lại engine.
3. Nâng phiên bản llama.cpp mà không phải build lại toàn bộ app.
4. `llama-server` đã có sẵn chế độ stream, chat template và các backend GPU.

## 6. Thiết kế thành phần

### 6.1 Thu âm thanh

- **Interface chung:** `trait AudioSource { fn start(&mut self, sink: RingProducer) -> Result<()>; fn stop(&mut self); fn format(&self) -> AudioFormat; }`
- **Windows:** dùng WASAPI shared-mode **endpoint loopback**.
  - **Chế độ tự động:** thu loopback của thiết bị phát mặc định (vai trò *Console*) và của thiết bị mặc định cho liên lạc (vai trò *Communications*, nếu khác thiết bị trên), rồi trộn lại. App họp có thể phát tiếng qua thiết bị Communications, nhất là khi dùng tai nghe Bluetooth.
  - Người dùng có thể chọn thủ công một thiết bị.
  - Lắng nghe `IMMNotificationClient` để tự khởi tạo lại khi thiết bị thay đổi.
  - **Không dùng process loopback** trong MVP, vì đã có báo cáo cách này chỉ nhận được im lặng với Teams.
  - Hệ quả: app thu **mọi** âm thanh của máy, kể cả tiếng thông báo hay video đang mở.
- **macOS:** dùng Core Audio process tap (`AudioHardwareCreateProcessTap`, macOS 14.2+), đọc qua aggregate device.
  - **Mặc định:** tap toàn hệ thống, trừ chính app.
  - **Tùy chọn:** chỉ tap một app họp được chọn từ danh sách các app đang phát âm thanh.
  - Khai báo `NSAudioCaptureUsageDescription` trong Info.plist.
  - Gọi API qua `objc2` và `coreaudio-sys`.
- **Ràng buộc realtime:** callback thu âm không cấp phát bộ nhớ và không lock; chỉ ghi vào ring buffer lock-free (crate `rtrb`). Ring buffer chứa được 30 giây âm thanh.

### 6.2 Tiền xử lý

Gộp về một kênh (mono), rồi resample từ tần số của thiết bị (thường 48 kHz) xuống 16 kHz bằng crate `rubato`. Sau đó chia thành khung 512 mẫu (32 ms) để đưa vào VAD.

### 6.3 VAD và cắt câu

- **Silero VAD** (MIT).
- **Tham số mặc định:**
  - Ngưỡng tiếng nói: 0,5.
  - Đoạn tiếng nói ngắn nhất: 250 ms.
  - **Im lặng 500 ms thì chốt câu.** Người dùng chỉnh được trong khoảng 300–1000 ms bằng mục "Độ nhạy ngắt câu".
  - **Mỗi đoạn dài tối đa 8 giây.** Nếu dài hơn, cắt cưỡng bức tại khung có năng lượng thấp nhất trong 1,5 giây cuối.
  - Thêm 200 ms đệm ở đầu và cuối mỗi đoạn.
- **Đầu ra:** `Segment { id, start_ms, end_ms, samples }`, với thời gian tính từ lúc bắt đầu phiên.
- **Cách chạy Silero:** qua VAD API của whisper.cpp hoặc qua crate ONNX riêng. Chốt ở Giai đoạn 0, mục S3.

### 6.4 Nhận dạng giọng nói

- **Engine:** whisper.cpp qua `whisper-rs`, chạy trong tiến trình chính. Dùng Metal trên macOS và Vulkan trên Windows; lỗi GPU thì tự chuyển sang CPU.
- **Model:**
  - Gói Chuẩn: `large-v3-turbo` bản q5_0, khoảng 550 MB.
  - Gói Nhẹ: `small` bản q5_1, khoảng 190 MB.
- **Chọn ngôn ngữ:**
  - Lấy xác suất ngôn ngữ của Whisper, chọn ngôn ngữ cao nhất **trong tập người dùng cho phép**.
  - Nếu xác suất cao nhất dưới 0,5 thì giữ ngôn ngữ của đoạn trước, để ngôn ngữ không nhảy qua lại.
  - Nếu người dùng khóa ngôn ngữ thì bỏ bước nhận diện.
- **Giải mã:** greedy, không dùng temperature fallback. Dùng tối đa 100 token của đoạn trước (cùng ngôn ngữ) làm prompt khởi đầu. Chặn các token không phải tiếng nói.
- **Lọc lỗi "ảo giác" của Whisper:**
  - Bỏ đoạn có `no_speech_prob > 0,6`.
  - Bỏ các câu lặp n-gram.
  - Bỏ các câu hay bị bịa ra khi chỉ có nhạc hoặc im lặng, ví dụ "Thank you for watching", "Hãy subscribe cho kênh", "[Music]".

### 6.5 Dịch

- **Tiến trình phụ `llama-server`:** khóa cố định một phiên bản llama.cpp.
  - macOS arm64: dùng Metal.
  - Windows x64: dùng backend Vulkan và CPU, nạp backend lúc chạy, lỗi GPU thì tự chuyển CPU.
- **Lệnh chạy:** `llama-server -m <gguf> --host 127.0.0.1 --port <cổng trống ngẫu nhiên> --api-key <ngẫu nhiên> -c 2048 -np 1 -ngl 99 --no-webui`. App gọi `/health` để biết server đã sẵn sàng.
- **Khi server lỗi:** tự khởi động lại, chờ lần lượt 1, 2, 5 giây giữa các lần. Quá 5 lần trong 10 phút thì báo lỗi, phụ đề chỉ hiện câu gốc.
- **API:** dùng `/v1/chat/completions` với `stream: true`, chat template lấy từ GGUF. Nếu template trong GGUF không dùng được, render template bằng `minijinja` phía Rust rồi gọi `/completion`. Chốt ở mục S4.
- **Mẫu prompt** lấy theo model card của Hy-MT2:
  - Khi câu có liên quan tới tiếng Trung, dùng mẫu tiếng Trung: `将以下文本翻译为{目标语言}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}`
  - Các trường hợp còn lại dùng mẫu tiếng Anh: `Translate the following text into {target}. Note that you should only output the translated result without any additional explanation:\n\n{text}`
  - **Thuật ngữ:** dùng mẫu "terminology" của Hy-MT2.
    - Chỉ lấy những mục trong từ điển có xuất hiện trong câu, tối đa 20 mục mỗi câu.
    - Trước khi so khớp, chuẩn hóa Unicode NFC và không phân biệt hoa thường.
    - Chữ Latin khớp theo ranh giới từ; chữ Trung, Nhật, Hàn khớp theo chuỗi con.
  - **Đưa câu trước vào làm ngữ cảnh** (mẫu "background information"): để dạng cờ thử nghiệm. Chỉ bật mặc định nếu ở mục S7 nó làm COMET tăng và độ trễ tăng không quá 20%.
- **Tham số sinh:** temperature 0, repeat penalty 1,05 (giống benchmark). Số token tối đa = min(4 × số token câu gốc + 32, 512).
- **Hậu xử lý:**
  - Cắt khoảng trắng thừa.
  - Bỏ nhãn đầu câu như "Translation:" hay "译文：".
  - Bỏ ngoặc kép bao quanh nếu câu gốc không có.
  - Nếu bản dịch dài hơn 3 lần câu gốc, thử lại một lần. Vẫn lỗi thì hiện câu gốc, đánh dấu "chưa dịch được".
- **Bỏ qua bước dịch** khi ngôn ngữ câu gốc trùng ngôn ngữ đích.

### 6.6 Phụ đề và bản chép lời

- **Cấu trúc:** `Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status }`, với `status` thuộc `asr_done | translating | done | failed | skipped`.
- **Gửi sang giao diện qua sự kiện Tauri:**
  - `subtitle://upsert`: gửi cả đối tượng.
  - `subtitle://delta`: gửi từng token trong lúc đang dịch.
- **Hiển thị:** thanh phụ đề hiện N dòng gần nhất; cửa sổ chính hiện toàn bộ.
- **Lưu trữ:**
  - Bản chép lời nằm trong bộ nhớ theo từng phiên.
  - Khi bật "Lưu lịch sử" (Pro), bản chép lời được ghi vào SQLite (`rusqlite`) trong thư mục dữ liệu của app.
- **Xuất file:**
  - TXT, theo dạng `[giờ] câu gốc` rồi `→ bản dịch`.
  - SRT, chọn xuất câu gốc hoặc bản dịch.
  - Markdown.

### 6.7 Quản lý model

- **Manifest `models.json`** đặt trên CDN của thương hiệu (Cloudflare R2 + tên miền riêng), **ký bằng Ed25519**. Khóa công khai được build sẵn vào app.
  - Các trường: `id`, `tier`, `kind` (asr/mt/vad), `version`, `url`, `bytes`, `sha256`, `license_id`, `min_app_version`.
- **Hai gói model:**

  | Gói | Nhận dạng giọng nói | Dịch | VAD | Tổng |
  |---|---|---|---|---|
  | **Chuẩn** | whisper large-v3-turbo q5_0 | Hy-MT2-1.8B Q8_0 (1,91 GB) | silero-vad | khoảng 2,5 GB |
  | **Nhẹ** | whisper small q5_1 | Hy-MT2-1.8B Q4_K_M (1,13 GB) | silero-vad | khoảng 1,3 GB |

- **Đề xuất gói Chuẩn khi:**
  - máy Apple Silicon có RAM từ 16 GB; hoặc
  - máy Windows có RAM từ 16 GB và GPU hỗ trợ Vulkan với VRAM từ 4 GB.

  Các máy còn lại được đề xuất gói Nhẹ. Người dùng vẫn đổi được.
- **Tải model:**
  - Dùng HTTP Range để tải tiếp được khi rớt mạng.
  - Ghi ra file `*.part`, kiểm tra SHA-256, rồi mới đổi tên thành file chính thức.
  - Trước khi tải, kiểm tra dung lượng trống còn ít nhất bằng kích thước model cộng 1 GB.
- **Nơi lưu:**
  - macOS: `~/Library/Application Support/<bundle-id>/models`
  - Windows: `%LOCALAPPDATA%\<app>\models`
- **Tự host model:** Apache 2.0 và MIT cho phép phân phối lại. File LICENSE và NOTICE được đặt cạnh file model. Không tải từ Hugging Face hay GitHub của người khác.
- **Cập nhật model:** khi có mạng, app kiểm tra manifest lúc khởi động, tối đa một lần mỗi ngày. Có bản mới thì hỏi người dùng, không tự tải.

### 6.8 Bản quyền (Polar.sh license key)

- **Thiết lập bên Polar:**
  - Tạo một tổ chức Polar mới cho thương hiệu này.
  - Sản phẩm Pro gồm thuê bao tháng và thuê bao năm, kèm benefit **License Key**.
  - License key có tiền tố theo thương hiệu, **cho kích hoạt tối đa 2 máy**, hết hạn theo thuê bao và **tự bị thu hồi khi khách hủy thuê bao**.
- **Kích hoạt:** người dùng dán key. App gọi `POST /v1/customer-portal/license-keys/activate` với `{key, organization_id, label: <tên máy>}` và lưu lại `activation_id`.
- **Kiểm tra định kỳ:** mỗi lần khởi động, nếu có mạng (tối đa một lần mỗi ngày), app gọi `POST /v1/customer-portal/license-keys/validate` với `{key, organization_id, activation_id}`.
- **Ân hạn khi offline:** Pro vẫn còn hiệu lực trong **14 ngày** kể từ lần kiểm tra thành công gần nhất. Quá hạn thì về Free cho tới lần kiểm tra thành công tiếp theo.
- **Trạng thái lưu trên máy:** file trạng thái được ký HMAC bằng khóa sinh từ ID máy, đủ để chặn việc sửa file bằng tay. MVP chấp nhận rủi ro bị crack ở mức cơ bản.
- **Quota Free:** tính "phút dịch" bằng tổng độ dài các đoạn có tiếng nói, không tính lúc im lặng. Reset lúc 00:00 theo giờ máy. Lưu chung trong file trạng thái nói trên.
- **Chuyển máy:** nút "Gỡ kích hoạt" trong Cài đặt gọi API gỡ kích hoạt của Polar. Kiểm tra lại endpoint lúc triển khai.
- **Backend riêng:** MVP không cần. Nếu bị crack nhiều, Giai đoạn 2 có thể thêm một Worker nhỏ để ký token Ed25519.

### 6.9 Cài đặt

Lưu dạng JSON bằng `tauri-plugin-store`, có số phiên bản schema và bước migrate khi schema đổi.

Các khóa chính:
- `uiLanguage`, `targetLanguage`, `sourceLanguages[]`, `sourceLock?`
- `audioSource`, `vadEndSilenceMs`
- `overlay.{fontSize, lines, opacity, showSource, locked, positions}`
- `modelTier`
- `hotkeys`
- `saveHistory`
- `launchAtLogin`
- `theme`

### 6.10 Giao diện

- **Công nghệ:** React 18, TypeScript, Vite, Zustand, cùng bộ công cụ quen thuộc với AI Live Translator.
- **Hai cửa sổ `main` và `overlay`,** mỗi cửa sổ có entry HTML riêng. Giao tiếp với lõi Rust qua `invoke` (lệnh) và sự kiện Tauri; store Zustand đăng ký nhận sự kiện.
- **Nhận diện thương hiệu mới**, không dùng lại nhận diện của AI Live Translator.
- **Trợ năng:** chữ phóng to được, đủ tương phản cho phụ đề.

### 6.11 Đóng gói, ký số, cập nhật

- **Bộ cài (Tauri bundler):**
  - Windows: NSIS `.exe`, kèm bootstrapper WebView2.
  - macOS: `.dmg` cho arm64.
  - Mục tiêu dung lượng bộ cài ≤ 60 MB, vì model tải riêng.
- **Ký số:**
  - **Windows:** chứng thư ký mã (loại OV hoặc dịch vụ ký trên cloud). Lúc đầu SmartScreen vẫn có thể cảnh báo cho tới khi app tích đủ uy tín.
  - **macOS:** Developer ID Application, bật hardened runtime và notarize.
- **macOS không chạy sandbox**, vì phân phối trực tiếp. App cần process tap, và cần bật `macOSPrivateApi` để làm cửa sổ trong suốt. Vì vậy hiện chưa thể lên Mac App Store, khớp với quyết định D10.
- **Tự cập nhật:** dùng `tauri-plugin-updater`.
  - File manifest cập nhật đặt trên CDN, ký bằng khóa cập nhật.
  - Kiểm tra lúc khởi động và mỗi 24 giờ; cài bản mới ở lần thoát app kế tiếp.
  - Có hai kênh: stable và beta.
- **File đi kèm:** các bản `llama-server` đặt ở `src-tauri/binaries/llama-server-<target-triple>`, kèm thư viện backend của ggml.

## 7. Luồng xử lý, đa luồng và chống nghẽn

- **Các luồng:**
  1. Callback thu âm thanh (realtime), ghi vào ring buffer.
  2. Luồng tiền xử lý và VAD.
  3. Worker nhận dạng giọng nói: mỗi lần xử lý một đoạn, chạy trên GPU.
  4. Runtime `tokio`: lo phần dịch (HTTP stream), sự kiện giao diện, tải model, bản quyền.
  5. Tiến trình phụ `llama-server`.
- **Hàng đợi đoạn âm thanh (VAD → nhận dạng)** chứa tối đa 3 đoạn.
  - Khi đầy, gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây.
  - Chỉ bỏ đoạn khi độ trễ vượt 20 giây. Đoạn bị bỏ được đánh dấu "[bỏ qua đoạn]" trong bản chép lời.
- **Độ trễ** tính bằng thời điểm hiện tại trừ `end_ms` của đoạn đang xử lý. Vượt 6 giây thì hiện chỉ báo "Đang trễ".
- **Hàng đợi dịch** chứa tối đa 3 câu.
  - Khi đầy, gộp các câu liên tiếp cùng ngôn ngữ vào một request.
  - Câu nào đã chờ quá 20 giây thì bỏ qua bước dịch, chỉ hiện câu gốc (`skipped`), để bắt kịp tốc độ nói.
- **Số đo từng phiên**, lưu trên máy và không gửi đi đâu: thời gian của từng bước (cắt đoạn, nhận dạng, dịch, tổng thể). Xem được trong bảng debug ẩn và trong log để hỗ trợ khi người dùng báo lỗi.

## 8. Hiệu năng và cấu hình máy

| Hạng máy | macOS | Windows | Gói model |
|---|---|---|---|
| Khuyến nghị | Apple Silicon M1 trở lên, RAM 16 GB | Windows 10/11 x64, RAM 16 GB, GPU hỗ trợ Vulkan với VRAM ≥ 4 GB (NVIDIA, AMD, Intel Arc) | Chuẩn |
| Tối thiểu | Apple Silicon, RAM 8 GB | RAM 8 GB, CPU 4 nhân có AVX2 | Nhẹ |
| Chưa hỗ trợ trong MVP | Mac chip Intel | ARM64, CPU không có AVX2, RAM < 8 GB | — |

**Ngân sách độ trễ**, tính từ lúc người nói dừng câu đến lúc bản dịch hiện đủ:

| Bước | Gói Chuẩn (GPU) | Gói Nhẹ (CPU) |
|---|---|---|
| Im lặng để chốt câu | 0,5 s | 0,5 s |
| Nhận dạng giọng nói | 0,4–0,8 s | 0,8–1,5 s |
| Dịch (Hy-MT2) | 0,2–0,6 s | 0,5–1,5 s |
| Hiển thị | < 0,05 s | < 0,05 s |
| **Tổng** | **≈ 1,2–2,0 s** | **≈ 1,8–3,5 s** |

Mốc thực tế: Hy-MT2 Q8_0 chạy trên CPU 4 luồng của M4 Pro mất 0,45 giây/câu (benchmark 2026-09-29).

**RAM ước tính (RSS), cần kiểm chứng ở mục S6:**

| Thành phần | Gói Chuẩn | Gói Nhẹ |
|---|---|---|
| App và WebView | khoảng 0,3 GB | khoảng 0,3 GB |
| Whisper | 1–1,5 GB (turbo) | khoảng 0,4 GB (small) |
| `llama-server` | 2,5–4 GB (Q8_0; đo được tối đa 3,95 GB trên CPU với context 2048) | 1,5–2,5 GB |
| **Tổng** | **khoảng 4–6 GB** | **khoảng 2,2–3,2 GB** |

Có thể giảm RAM bằng cách hạ context xuống 1024 và dùng mmap.

**Mục tiêu tải máy:** CPU trung bình ≤ 30% trên máy khuyến nghị khi người trong cuộc họp nói liên tục, để app họp vẫn chạy mượt.

## 9. Xử lý lỗi

| Tình huống | Cách phát hiện | Cách xử lý |
|---|---|---|
| macOS chưa cấp quyền ghi âm thanh hệ thống | Tạo tap bị lỗi, hoặc buffer toàn im lặng kèm trạng thái quyền | Hiện màn hình hướng dẫn, có nút mở System Settings |
| Đang dịch mà hơn 60 giây không có âm thanh vào | Mức RMS | Thanh phụ đề hiện "Không nghe thấy âm thanh" kèm gợi ý cách sửa |
| Thiết bị phát thay đổi (cắm tai nghe, kết nối Bluetooth) | `IMMNotificationClient` trên Windows / listener của Core Audio trên macOS | Tự khởi tạo lại việc thu âm trong ≤ 2 giây |
| Model thiếu hoặc hỏng | Kiểm tra SHA-256 lúc khởi động | Đề nghị tải lại |
| `llama-server` không chạy hoặc bị crash | Mã thoát, hoặc `/health` báo lỗi | Tự khởi động lại theo §6.5. Quá giới hạn thì báo lỗi, chỉ hiện câu gốc. |
| GPU khởi tạo lỗi | Log của backend | Tự chuyển sang CPU, báo "Đang chạy bằng CPU (chậm hơn)" |
| Thiếu RAM | RAM trống thấp, hoặc `llama-server` hết bộ nhớ | Đề xuất chuyển sang gói Nhẹ |
| Trễ dồn lại | Độ trễ > 6 giây | Hiện chỉ báo và áp dụng chính sách ở §7 |
| Hết quota Free | Bộ đếm phút | Dừng dịch, hiện "Đã dùng hết 30 phút hôm nay" kèm nút nâng cấp |
| License không hợp lệ, hết hạn hoặc bị thu hồi | Kết quả `validate` | Về Free, báo rõ lý do |
| Mất mạng đúng lúc cần kiểm tra license | Lỗi mạng | Giữ Pro trong 14 ngày ân hạn |
| Tải model thất bại | Lỗi HTTP hoặc sai SHA-256 | Thử lại 3 lần, cho phép tải tiếp sau |
| Bản dịch lỗi (quá dài, có kèm lời giải thích) | Tỉ lệ độ dài, mẫu nhận dạng | Thử lại một lần, sau đó hiện câu gốc |

## 10. Quyền riêng tư, bảo mật, pháp lý

- **Âm thanh** chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng.
- **App chỉ kết nối mạng để:** tải manifest và model, kiểm tra cập nhật, gọi API license của Polar. MVP **không có analytics và không gửi báo cáo crash**. Log nằm trên máy; khi cần hỗ trợ, người dùng tự gửi.
- **Tiến trình phụ** chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy.
- **Lịch sử chép lời** mặc định tắt, chỉ lưu trên máy, xóa toàn bộ được bằng một nút.
- **Luật Bảo vệ dữ liệu cá nhân 2025 (Việt Nam):** app không thu thập dữ liệu cá nhân, vì không có tài khoản. Email và thanh toán do Polar xử lý với vai trò merchant of record. Chính sách quyền riêng tư phải ghi rõ điều này.
- **Giấy phép bên thứ ba**, liệt kê ở màn hình Giới thiệu và file `THIRD_PARTY_NOTICES`:
  - Hy-MT2: Apache 2.0, kèm LICENSE và NOTICE. Nếu tự nén lại model thì phải ghi chú là đã sửa đổi.
  - Trọng số Whisper: MIT.
  - whisper.cpp, llama.cpp, ggml: MIT.
  - Silero VAD: MIT.
  - Tauri: MIT/Apache 2.0.
  - React: MIT.
  - Font chữ.
- **Không dùng tài sản nào của RTranslator** (NLLB, HY-MT1.5, bộ từ điển GPL…). Nếu có chép code từ RTranslator thì phải giữ thông báo Apache 2.0.
- **Nhãn hiệu:** chỉ nhắc tên Teams, Zoom, Meet để mô tả khả năng tương thích, kèm câu miễn trừ "không liên kết với các công ty này".

## 11. Kiểm thử

- **Unit test (`cargo test`):**
  - Resample và gộp kênh.
  - Cắt câu với tín hiệu tổng hợp: im lặng, tiếng nói, nhạc, đoạn bị cắt ở 8 giây.
  - Chọn ngôn ngữ trong tập cho phép, và cơ chế giữ ngôn ngữ đoạn trước.
  - Tạo prompt: nhánh tiếng Trung và không tiếng Trung; khớp thuật ngữ tiếng Việt có dấu và chữ Trung, Nhật, Hàn.
  - Hậu xử lý bản dịch.
  - Các trạng thái của phụ đề.
  - Bộ đếm quota và reset theo ngày.
  - Trạng thái bản quyền: ân hạn, thu hồi.
  - Manifest và SHA-256.
- **Test giao diện (`vitest`):** i18n đủ khóa cả vi lẫn en; hiển thị thanh phụ đề; các hàm xuất file.
- **Test tích hợp:**
  - Chạy pipeline từ file WAV (không cần thu âm thật), kiểm tra phụ đề có xuất hiện, đúng thứ tự, đúng thời gian.
  - Vòng đời tiến trình phụ: khởi động, giả lập crash, tự khởi động lại.
- **Benchmark (`bench/`):** đo chất lượng (COMET, chrF++) và độ trễ từng bước cho mỗi gói model. Chạy trước mỗi lần đổi model hoặc engine. Ngưỡng theo A2–A4. Kết quả gốc nằm ở `bench/2026-09-29-mt-benchmark/`.
- **Test thủ công theo ma trận:**
  - Hệ điều hành: macOS 14, 15, 26; Windows 10, 11.
  - App họp: Teams, Zoom, Meet (Chrome, Edge, Safari), Zalo PC.
  - Thiết bị phát: loa, tai nghe có dây, tai nghe Bluetooth.
  - Hiển thị: app họp ở chế độ toàn màn hình, và máy có nhiều màn hình.
- **Soak test:** phát liên tục 2 giờ âm thanh cuộc họp, theo dõi RAM, CPU và GPU (tiêu chí A5).
- **Cài đặt và cập nhật:** cài mới, nâng cấp từ bản trước, gỡ app; kiểm tra chữ ký qua Gatekeeper và SmartScreen.

## 12. Cấu trúc repo

```
meeting-translator/
├── src/                          # Giao diện: React + TypeScript
│   ├── windows/main/             # Cửa sổ chính (các màn hình ở §4.3)
│   ├── windows/overlay/          # Thanh phụ đề
│   ├── components/  store/  lib/ipc.ts
│   └── i18n/                     # Từ điển en (chuẩn) + vi
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── audio/{mod,windows,macos,resample}.rs
│   │   ├── pipeline/{vad,segmenter,asr,translate,prompt,postprocess,subtitle}.rs
│   │   ├── sidecar/llama.rs      # Chạy và giám sát llama-server
│   │   ├── models/{manifest,download,store}.rs
│   │   ├── license/{polar,state,quota}.rs
│   │   ├── transcript/{store,export}.rs
│   │   ├── overlay/{macos,windows}.rs  # Hành vi cửa sổ native
│   │   └── settings.rs  tray.rs  hotkeys.rs  i18n.rs
│   ├── binaries/                 # llama-server theo target triple
│   └── tauri.conf.json
├── bench/                        # Đánh giá chất lượng và độ trễ
│   └── 2026-09-29-mt-benchmark/  # Kết quả gốc của lần chọn model
├── tests/fixtures/audio/         # Clip âm thanh cuộc họp mẫu
└── docs/superpowers/specs/
```

## 13. Lộ trình

**Giai đoạn 0: spike, bắt buộc làm trước MVP**

| # | Việc cần làm |
|---|---|
| S1 | Dùng Core Audio tap trên macOS để thu âm thanh Zoom, Meet và Teams |
| S2 | Dùng loopback trên Windows để thu âm thanh Teams, Zoom và Meet, kể cả thiết bị Communications và tai nghe Bluetooth |
| S3 | Chạy `whisper-rs` với VAD và cơ chế chọn ngôn ngữ; chốt cách chạy Silero |
| S4 | Chạy `llama-server` với Hy-MT2 qua `/v1/chat/completions` ở chế độ stream; kiểm tra chat template |
| S5 | Cho thanh phụ đề nổi trên app đang toàn màn hình, trên cả Mac và Windows |
| S6 | Đo độ trễ tổng thể và RAM cho cả hai gói model |
| S7 | Benchmark Q4_K_M so với Q8_0, whisper turbo so với small, và thử cờ ngữ cảnh câu trước |

**Tiêu chí qua spike:** S1–S5 chạy được, và S6 đạt ngân sách ở §8 trên máy khuyến nghị. Nếu không đạt thì quay lại sửa spec trước khi làm tiếp.

**Giai đoạn 1: MVP.** Làm F1–F10 và đạt A1–A7.

**Giai đoạn 2: mở rộng**, thứ tự tùy phản hồi của người dùng:
- Phân biệt ai đang nói.
- Hỗ trợ Windows ARM64.
- Thu âm thanh theo từng app trên Windows.
- Dịch hai chiều bằng giọng nói (micro ảo).
- Tóm tắt và biên bản cuộc họp (cần thêm một LLM).
- Token bản quyền ký số qua một backend nhỏ.
- Gói cho doanh nghiệp: nhiều máy, cài đặt tập trung.
- Thêm ngôn ngữ giao diện.

## 14. Giả định cần kiểm chứng trong spike

1. Core Audio process tap thu được âm thanh của Zoom, Meet và Teams trên macOS 14.2+. Quyền `NSAudioCaptureUsageDescription` hoạt động với app đã ký nhưng không chạy sandbox. (S1)
2. Endpoint loopback thu được Teams trên Windows 10/11, kể cả khi Teams phát tiếng qua thiết bị Communications. (S2)
3. File GGUF của Hy-MT2 có chat template dùng được với `/v1/chat/completions`. (S4)
4. Whisper large-v3-turbo chạy kịp thời gian thực trên máy M1 16 GB và trên laptop Windows có GPU tích hợp dùng Vulkan. (S6)
5. Độ trễ tổng thể đạt ngân sách ở §8. (S6)
6. Bản Q4_K_M của Hy-MT2 giảm COMET không quá 0,02 so với Q8_0. (S7)
7. API license key của Polar có endpoint gỡ kích hoạt, và trạng thái key đổi ngay khi khách hủy thuê bao. (Kiểm tra trên Polar sandbox trước khi làm §6.8.)

## 15. Việc còn mở (không chặn phần kỹ thuật)

- **Tên sản phẩm, logo, tên miền, bundle identifier.** Trong code tạm dùng `meeting-translator`, sau đổi bằng cấu hình.
- **Chốt P1 và P2:** giá Pro theo tháng và năm, có bán gói trọn đời không, và hạn mức Free (đề xuất 30 phút/ngày).
- **Thiết lập Polar:** tạo tổ chức mới, sản phẩm Pro và benefit license key.
- **Giấy tờ cho phát hành:** mua chứng thư ký mã cho Windows; tài khoản Apple Developer (99 USD/năm).
- **Website:** trang tải app, trang giá, chính sách quyền riêng tư và điều khoản sử dụng. Phần này sẽ có spec riêng.
