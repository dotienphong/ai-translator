# Meeting Translator (tên tạm): app desktop dịch phụ đề cuộc họp offline — Design

**Ngày:** 2026-09-29
**Trạng thái:** Bản nháp qua brainstorming, chờ PHONG duyệt
**Phạm vi:** Sản phẩm mới, repo mới `meeting-translator/`, gồm app desktop cho Windows và macOS, cùng một license server nhỏ để nhận thanh toán qua PayOS. Sản phẩm **tách hẳn** khỏi AI Live Translator: thương hiệu, repo, người dùng và thanh toán đều riêng. Vì cùng chủ sở hữu nên được tham khảo cách làm bên đó, nhưng không dùng chung code hay hạ tầng. App Android không thuộc spec này.

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
| D4 | Công nghệ | **Tauri 2**: lõi Rust, giao diện React 19, TypeScript, Vite, Zustand. Engine là whisper.cpp và llama.cpp. |
| D5 | Model dịch | **Hy-MT2-1.8B** (Apache 2.0), định dạng GGUF |
| D6 | Model nhận dạng giọng nói | Whisper (MIT) chạy qua whisper.cpp |
| D7 | Nơi xử lý | 100% trên máy, âm thanh không rời khỏi máy |
| D8 | Ngôn ngữ giao diện | Tiếng Việt và English, đổi được trong Cài đặt |
| D9 | Chiều dịch | MVP chỉ dịch một chiều: âm thanh máy đang phát → phụ đề ngôn ngữ của người dùng. Nếu cả hai bên cùng cài app thì mỗi bên đều thấy phụ đề của phía kia. |
| D10 | Phân phối | Tải từ website của sản phẩm. Chưa lên Microsoft Store hay Mac App Store. |
| D11 | Thanh toán | **MVP dùng PayOS**: khách chuyển khoản ngân hàng bằng mã VietQR, trả bằng VND. Khi bán ra nước ngoài thì thêm một cổng thanh toán quốc tế (§13). |
| D12 | Độ trễ mục tiêu | Trên máy khuyến nghị, **p50 ≤ 1,5 giây** (xem A2 và §8) |

**Đề xuất mặc định, PHONG xác nhận khi duyệt spec:**

| # | Hạng mục | Đề xuất |
|---|---|---|
| P1 | Kiếm tiền | **Không có quảng cáo.** Free: 30 phút dịch mỗi ngày. **Pro**: dịch không giới hạn, từ điển thuật ngữ, lưu lịch sử và xuất bản chép lời. Pro bán theo gói **trả trước 1 tháng hoặc 12 tháng** bằng VND, không tự gia hạn, vì PayOS không có thanh toán định kỳ. Giá chốt sau. |
| P2 | Bản quyền | License key do **license server riêng** của sản phẩm cấp, sau khi PayOS xác nhận đã nhận tiền. Mỗi key kích hoạt tối đa 2 máy, dùng được offline nhờ token có ký số (ân hạn 14 ngày). Không có tài khoản đăng nhập. Chi tiết ở §6.8. |

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
| A2 | **Độ trễ**, tính từ lúc người nói thực sự dừng câu đến lúc bản dịch hiện đủ. **Máy khuyến nghị: p50 ≤ 1,5 giây, p90 ≤ 2,5 giây**, và chữ dịch đầu tiên hiện trong ≤ 1,0 giây (p50). Máy tối thiểu: p50 ≤ 3,5 giây. |
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
  - **Bản quyền:** nhập key, trạng thái và ngày hết hạn, gia hạn, gỡ kích hoạt.
- **Nâng cấp Pro:** chọn gói 1 tháng hoặc 12 tháng, nhập email, quét mã VietQR hiện ngay trong app (§6.8).
  - **Quyền riêng tư:** bật/tắt lưu lịch sử, xóa toàn bộ dữ liệu.
- **Giới thiệu và giấy phép mã nguồn mở.**

### 4.4 Thanh phụ đề

- **Kiểu cửa sổ:** cửa sổ riêng, không viền, nền mờ bán trong suốt, **luôn nổi trên cùng**, không hiện trên taskbar hay Dock.
- **Nội dung:**
  - Hiện 1–3 dòng bản dịch gần nhất; tùy chọn hiện câu gốc chữ nhỏ ở phía trên.
  - **Bản dịch hiện dần từng chữ** trong lúc model đang dịch.
  - **Phụ đề tạm:** câu chưa chốt hiện màu nhạt hơn. Nếu người nói nói tiếp ngay (§6.3), phụ đề tạm được thay bằng bản dịch của cả câu đã ghép.
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

**Thành phần nằm ngoài app:** một license server nhỏ làm việc với PayOS (chi tiết ở §6.8). App chỉ gọi server này khi mua, kích hoạt và kiểm tra bản quyền. Âm thanh và nội dung chép lời không bao giờ đi qua server.

```
App ──HTTPS──► License server (Cloudflare Worker + D1) ◄──webhook── PayOS ◄── khách quét VietQR
                      │ tạo link thanh toán ─────────────────────────► PayOS
                      └─ gửi email chứa license key
```

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
  - **Im lặng 300 ms thì chốt đoạn**, để đạt mục tiêu độ trễ ở A2. Người dùng chỉnh được trong khoảng 200–800 ms bằng mục "Độ nhạy ngắt câu".
  - **Mỗi đoạn dài tối đa 8 giây.** Nếu dài hơn, cắt cưỡng bức tại khung có năng lượng thấp nhất trong 1,5 giây cuối.
  - Thêm 200 ms đệm ở đầu và cuối mỗi đoạn.
- **Ghép câu và phụ đề tạm:** ngưỡng 300 ms dễ cắt giữa câu, ở những chỗ người nói ngừng nghỉ tự nhiên.
  - Nếu đoạn vừa chốt không kết thúc bằng dấu câu kết thúc (`.` `?` `!` `。` `？` `！`), phụ đề được đánh dấu **tạm**.
  - Nếu tiếng nói tiếp tục trong vòng 700 ms, đoạn sau được ghép vào: nối chữ của hai đoạn, dịch lại cả câu, rồi thay phụ đề tạm.
  - Phụ đề được chốt khi có dấu câu kết thúc, hoặc khi im lặng quá 700 ms.
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
- **Rút ngắn cửa sổ mã hóa (`audio_ctx`):** mặc định whisper.cpp luôn mã hóa một cửa sổ 30 giây, kể cả khi đoạn chỉ dài 3 giây. App đặt `audio_ctx = min(1500, 50 × số giây của đoạn + 64)`, vì mỗi giây tương ứng 50 khung. Cách này giảm mạnh thời gian mã hóa, nhưng có thể làm giảm độ chính xác, nên phải đo WER ở mục S7.
- **Làm nóng:** khi bắt đầu phiên, chạy thử một lần trên một đoạn im lặng để nạp sẵn kernel GPU.
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
- **Tăng tốc:** bật `cache_prompt` để dùng lại KV cache của phần hướng dẫn cố định ở đầu prompt. Khi bắt đầu phiên, gửi một request làm nóng.
- **Hậu xử lý:**
  - Cắt khoảng trắng thừa.
  - Bỏ nhãn đầu câu như "Translation:" hay "译文：".
  - Bỏ ngoặc kép bao quanh nếu câu gốc không có.
  - Nếu bản dịch dài hơn 3 lần câu gốc, thử lại một lần. Vẫn lỗi thì hiện câu gốc, đánh dấu "chưa dịch được".
- **Bỏ qua bước dịch** khi ngôn ngữ câu gốc trùng ngôn ngữ đích.

### 6.6 Phụ đề và bản chép lời

- **Cấu trúc:** `Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status }`, với `status` thuộc `asr_done | translating | done | failed | skipped`, cộng thêm cờ `provisional` cho phụ đề tạm (§6.3).
- **Gửi sang giao diện qua sự kiện Tauri:**
  - `subtitle://upsert`: gửi cả đối tượng.
  - `subtitle://delta`: gửi từng token trong lúc đang dịch.
- **Hiển thị:** thanh phụ đề hiện N dòng gần nhất; cửa sổ chính hiện toàn bộ.
- **Lưu trữ:**
  - Bản chép lời nằm trong bộ nhớ theo từng phiên.
  - Khi bật "Lưu lịch sử" (Pro), bản chép lời được ghi vào SQLite **đã mã hóa** trong thư mục dữ liệu của app. Mã hóa bằng SQLCipher qua `rusqlite`, khóa lưu trong kho khóa của hệ điều hành (§10.2).
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

### 6.8 Thanh toán (PayOS) và bản quyền

**Vì sao cần license server riêng:**
- PayOS chỉ lo việc nhận tiền, không cấp license key.
- Khóa API của PayOS (client id, api key, checksum key) bắt buộc nằm trên server, không được nhúng vào app.
- Server viết bằng TypeScript + Hono, chạy trên Cloudflare Workers, lưu dữ liệu ở D1 (SQLite), dùng **tài khoản Cloudflare riêng** của sản phẩm.

**Chuẩn bị cho việc thêm cổng thanh toán quốc tế:**
- Phần thanh toán trên server nằm sau interface `PaymentProvider`, gồm `create_checkout`, `verify_webhook` và `get_payment_status`. PayOS là cài đặt đầu tiên.
- Thêm một cổng khác chỉ cần viết thêm một cài đặt và một endpoint webhook. License, token bản quyền và app đều không phải sửa.
- Bảng đơn hàng lưu thêm `provider` và `currency`. Mỗi gói Pro có giá riêng theo từng loại tiền.
- License chỉ quan tâm `expires_at`, không quan tâm tiền đến từ đâu. Vì vậy cả hai kiểu thanh toán đều dùng chung được:
  - Gói trả trước của PayOS: mỗi lần trả tiền cộng thêm 30 hoặc 365 ngày.
  - Thuê bao tự gia hạn của cổng quốc tế: mỗi webhook gia hạn cộng thêm một kỳ; khách hủy thì ngừng cộng.

**API của license server:**

| Endpoint | Việc làm |
|---|---|
| `POST /v1/checkout` `{plan: "pro_1m" \| "pro_12m", email, license_key?}` | Tạo đơn với `orderCode` duy nhất, gọi PayOS `POST /v2/payment-requests`, trả về `checkoutUrl`, `qrCode` và `order_token` (mã ngẫu nhiên để app hỏi trạng thái đơn). Khi gia hạn thì truyền thêm `license_key` đang có. |
| `POST /v1/webhooks/payos` | Kiểm tra chữ ký webhook bằng checksum key. Đánh dấu đơn đã trả tiền (idempotent theo `orderCode`). Cấp license mới, hoặc gia hạn license cũ thêm 30 hay 365 ngày, tính từ max(hôm nay, ngày hết hạn). Gửi email chứa key. |
| `GET /v1/orders/{orderCode}?token=…` | App hỏi trạng thái đơn. Khi đơn đã trả tiền thì trả về key. |
| `POST /v1/licenses/activate` `{key, device_id_hash, device_label}` | Kích hoạt, tối đa 2 máy mỗi key. Trả về token bản quyền. |
| `POST /v1/licenses/validate` `{key, activation_id}` | Trả về token mới nếu license còn hiệu lực |
| `POST /v1/licenses/deactivate` `{key, activation_id}` | Gỡ kích hoạt để chuyển máy |

**Chữ ký khi tạo link thanh toán:** theo tài liệu PayOS, ký HMAC-SHA256 bằng checksum key trên chuỗi các trường `amount`, `cancelUrl`, `description`, `orderCode`, `returnUrl` xếp theo thứ tự chữ cái.

**Token bản quyền:**
- Ký bằng Ed25519. Khóa công khai build sẵn vào app, nên app kiểm tra được token ngay cả khi offline.
- Token gồm: `kid` (mã của khóa đã ký token, để đổi được khóa khi cần, §10.2), `license_id`, `plan`, `expires_at`, `activation_id`, `device_id_hash`, `issued_at`, và `refresh_before` (= `issued_at` + 14 ngày).
- `device_id_hash` là mã băm SHA-256 của ID phần cứng: IOPlatformUUID trên macOS, MachineGuid trên Windows.
- Quá `refresh_before` mà vẫn chưa làm mới được token (ví dụ vì offline lâu) thì app về Free.
- Quá `expires_at` thì app về Free và nhắc gia hạn.

**Mua ngay trong app:**
1. Người dùng mở "Nâng cấp Pro", chọn gói, nhập email.
2. App **hiện mã VietQR ngay trong app** (lấy từ `qrCode`), kèm nút mở trang thanh toán của PayOS.
3. Người dùng quét mã bằng app ngân hàng.
4. App hỏi trạng thái đơn mỗi 3 giây, tối đa 15 phút. Khi đơn đã trả tiền, app **tự kích hoạt trên máy đang dùng**.
5. Key cũng được gửi qua email, để kích hoạt máy thứ hai hoặc cài lại máy.

**Các quy tắc khác:**
- **Gia hạn:** PayOS không tự trừ tiền định kỳ. App nhắc trước 7 ngày và khi đã hết hạn. Nút "Gia hạn" tạo đơn mới gắn với key hiện có.
- **Kiểm tra định kỳ:** mỗi lần khởi động, nếu có mạng (tối đa một lần mỗi ngày), app gọi `validate` để lấy token mới.
- **Quota Free:** tính "phút dịch" bằng tổng độ dài các đoạn có tiếng nói, không tính lúc im lặng. Reset lúc 00:00 theo giờ máy. Lưu trong kho khóa của hệ điều hành (Keychain trên macOS, DPAPI trên Windows), có chống chỉnh lùi đồng hồ (§10.2). MVP chấp nhận rủi ro bị lách ở mức cơ bản.
- **Trong app:** interface `LicenseProvider` (activate, validate, deactivate) được cài đặt bằng một client gọi license server.
- **Giới hạn:** PayOS chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng VND, nên MVP chỉ bán được cho khách ở Việt Nam.

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

- **Công nghệ:** React 19, TypeScript, Vite, Zustand, cùng bộ công cụ quen thuộc với AI Live Translator.
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

### 6.12 Quy tắc chọn phiên bản thư viện

- **Luôn dùng bản ổn định mới nhất** của công nghệ và thư viện bên thứ ba tại thời điểm cài. Không dùng bản beta, rc hay nightly, trừ khi bắt buộc; khi đó phải ghi rõ lý do.
- **Trước khi chốt một phiên bản, phải kiểm tra kỹ tương thích và xung đột:**
  - Đọc release notes và changelog, xem có thay đổi phá vỡ tương thích (breaking change) nào ảnh hưởng tới app không.
  - Kiểm tra peer dependency và yêu cầu về phiên bản. Ví dụ:
    - Thư viện React phải hỗ trợ React 19.
    - Mọi plugin Tauri phải cùng dòng phiên bản với Tauri core.
    - Crate Rust phải chạy được với bản Rust stable đang dùng (MSRV).
    - Node.js phải đúng phiên bản Vite yêu cầu.
  - Không được có hai bản của cùng một thư viện gốc, và không trùng symbol (ví dụ hai bản ggml, xem §5).
  - Engine mới phải chạy đúng với model:
    - llama.cpp mới phải nạp và chạy đúng GGUF của Hy-MT2.
    - `whisper-rs` phải đi kèm whisper.cpp có đủ các tính năng cần dùng (VAD, `audio_ctx`).
- **Sau mỗi lần cài hoặc nâng cấp:**
  - Build lại toàn bộ và chạy hết test.
  - Chạy `cargo audit`, `cargo deny` và `pnpm audit`.
  - Nếu có đụng tới engine hoặc model thì chạy lại benchmark (§11).
- **Khóa phiên bản:**
  - Commit lockfile (`Cargo.lock`, `pnpm-lock.yaml`), và ghi rõ phiên bản llama.cpp, whisper.cpp đang dùng.
  - Chỉ nâng cấp khi chủ động quyết định, không để phiên bản tự nhảy.
- **Bài học từ benchmark 2026-09-29:** với `transformers` 5.x, MADLAD dịch ra ký tự vô nghĩa, trong khi bản 4.57 chạy đúng. Vì vậy dùng bản mới nhất vẫn phải kiểm chứng bằng test chạy thật.

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
| Khuyến nghị | Apple Silicon M1 trở lên, RAM 16 GB (riêng M1 cơ bản phải xác nhận ở S6) | Windows 10/11 x64, RAM 16 GB, GPU hỗ trợ Vulkan với VRAM ≥ 4 GB (NVIDIA, AMD, Intel Arc) | Chuẩn |
| Tối thiểu | Apple Silicon, RAM 8 GB | RAM 8 GB, CPU 4 nhân có AVX2 | Nhẹ |
| Chưa hỗ trợ trong MVP | Mac chip Intel | ARM64, CPU không có AVX2, RAM < 8 GB | — |

**Ngân sách độ trễ**, tính từ lúc người nói dừng câu đến lúc bản dịch hiện đủ:

| Bước | Gói Chuẩn (GPU) | Gói Nhẹ (CPU) |
|---|---|---|
| Im lặng để chốt đoạn (§6.3) | 0,3 s | 0,3 s |
| Nhận dạng giọng nói (`audio_ctx` rút ngắn) | 0,3–0,6 s | 0,6–1,2 s |
| Dịch (stream, có `cache_prompt`) | 0,2–0,5 s | 0,4–1,2 s |
| Hiển thị | < 0,05 s | < 0,05 s |
| **Tổng** | **≈ 0,8–1,45 s** | **≈ 1,3–2,75 s** |

Bảng trên là ước tính; riêng bước dịch đã có số đo thật (dòng dưới). **Mục tiêu p50 ≤ 1,5 giây chỉ đạt được trên máy khuyến nghị có GPU, và còn rất ít dư địa**, nên phải đo thật ở mục S6. Nếu máy M1 cơ bản không đạt thì nâng hạng máy khuyến nghị lên M1 Pro, M2 trở lên.

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
| Khách đã chuyển khoản nhưng webhook của PayOS đến chậm hoặc bị mất | App vẫn đang chờ; server có đơn chưa xác nhận | App hỏi trạng thái đơn mỗi 3 giây. Server tự đối soát bằng `GET /v2/payment-requests/{id}` mỗi 5 phút cho các đơn chưa xác nhận. |
| Webhook bị gửi trùng | Trùng `orderCode` | Xử lý idempotent: mỗi đơn chỉ cấp hoặc gia hạn license một lần |
| Khách chuyển thiếu tiền, hoặc link thanh toán hết hạn | Trạng thái đơn trả về từ PayOS | Không cấp license, hiện hướng dẫn liên hệ hỗ trợ |
| Tải model thất bại | Lỗi HTTP hoặc sai SHA-256 | Thử lại 3 lần, cho phép tải tiếp sau |
| Bản dịch lỗi (quá dài, có kèm lời giải thích) | Tỉ lệ độ dài, mẫu nhận dạng | Thử lại một lần, sau đó hiện câu gốc |

## 10. Quyền riêng tư, bảo mật, pháp lý

### 10.1 Quyền riêng tư và pháp lý

- **Âm thanh** chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng.
- **App chỉ kết nối mạng để:** tải manifest và model, kiểm tra cập nhật, gọi license server của sản phẩm (khi mua, kích hoạt, kiểm tra bản quyền). MVP **không có analytics và không gửi báo cáo crash**. Log nằm trên máy; khi cần hỗ trợ, người dùng tự gửi.
- **Tiến trình phụ** chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy.
- **Khóa API của PayOS** (client id, api key, checksum key) chỉ nằm trên license server, được lưu dưới dạng secret, không bao giờ có trong app.
- **Lịch sử chép lời** mặc định tắt, chỉ lưu trên máy, xóa toàn bộ được bằng một nút.
- **Luật Bảo vệ dữ liệu cá nhân 2025 (Việt Nam):**
  - App không có tài khoản đăng nhập.
  - License server chỉ lưu email (để gửi và khôi phục key), thông tin đơn hàng, license và mã băm của ID máy.
  - Việc chuyển khoản do ngân hàng và PayOS xử lý; server không nhận số tài khoản ngân hàng của khách.
  - Khi mua, người dùng tick đồng ý cho xử lý email vào đúng mục đích này.
  - Chính sách quyền riêng tư phải ghi rõ dữ liệu nào được lưu, lưu bao lâu, và cách yêu cầu xóa.
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

### 10.2 Bảo mật và chống sao chép

**Giới hạn cần nói rõ:**
- Không app desktop nào chống crack được tuyệt đối. App chạy offline thì càng dễ bị crack hơn.
- Model và engine đều là mã nguồn mở, nên không ngăn được một team giỏi tự làm một app tương tự.

**Mục tiêu:**
1. Làm cho việc crack và clone tốn công tới mức không đáng làm.
2. Bảo vệ người dùng khỏi các bản giả mạo.
3. Bảo vệ thương hiệu bằng pháp lý.

**Nguyên tắc:**
- **App không chứa bí mật nào.** Trong app chỉ có khóa công khai (để kiểm tra token bản quyền, manifest model và bản cập nhật). Mọi khóa bí mật nằm trên server hoặc trong hệ thống ký của CI.
- **Không đầu tư quá tay vào chống crack.** Biện pháp nặng có thể làm app chậm và chặn nhầm người dùng thật. Lợi thế thật của sản phẩm là chất lượng dịch tiếng Việt, tốc độ cải tiến, thương hiệu và kênh bán.

**Các biện pháp trong MVP:**

| Mối đe dọa | Biện pháp |
|---|---|
| Crack để dùng Pro miễn phí | Kiểm tra bản quyền ở nhiều chỗ trong code Rust, không dồn vào một biến đúng/sai duy nhất. Bản phát hành bật `strip`, `lto`, `codegen-units = 1`, `panic = "abort"`, và làm rối các chuỗi liên quan tới bản quyền. |
| Sửa hoặc ký lại file của app | Lúc khởi động, app tự kiểm chữ ký số của chính nó. macOS dùng `SecStaticCodeCheckValidity` kèm yêu cầu đúng Team ID. Windows dùng `WinVerifyTrust` và so tên chủ chứng thư. Chữ ký không hợp lệ thì app chỉ chạy chế độ Free, báo "Bản cài không chính hãng" kèm link tải chính thức. Bản build dev bỏ qua bước này. |
| Chỉnh lùi đồng hồ máy để lách quota Free hoặc hạn dùng | App lưu mốc thời gian lớn nhất từng thấy. Nếu giờ hiện tại nhỏ hơn mốc đó quá 10 phút thì: không reset quota ngày, coi token là phải kiểm tra online lại, và nhắc người dùng chỉnh giờ. |
| Sửa trạng thái bản quyền và quota trên máy | Lưu trong kho khóa của hệ điều hành (Keychain trên macOS; DPAPI hoặc Credential Manager trên Windows), không lưu file thường. |
| Chia sẻ hoặc bán lại key | Mỗi key tối đa 2 máy. Nếu trong 30 ngày có hơn 3 lần gỡ rồi kích hoạt lại thì khóa tạm key và yêu cầu liên hệ hỗ trợ. Key sinh ngẫu nhiên với ít nhất 128 bit, có ký tự kiểm tra để phát hiện gõ sai. |
| Dò key hoặc spam license server | Giới hạn request theo IP và theo key, ví dụ `activate` ≤ 10 lần/giờ/IP, `validate` ≤ 30 lần/giờ/key. Vượt ngưỡng thì trả `429`. |
| Bị clone, đổi thương hiệu rồi bán lại | **Pháp lý:** đăng ký nhãn hiệu (tên và logo) tại Cục Sở hữu trí tuệ Việt Nam, mở rộng ra quốc tế sau. EULA cấm dịch ngược, cấm phân phối lại, cấm đổi thương hiệu. Có sẵn quy trình yêu cầu Microsoft Store và nhà cung cấp hosting gỡ bản nhái. **Kỹ thuật:** logic quan trọng (prompt, cắt và ghép câu, khớp thuật ngữ) nằm trong Rust đã biên dịch; JavaScript chỉ lo hiển thị và được rút gọn. Manifest model, bản cập nhật và token đều ký bằng khóa riêng, nên bản nhái không dùng được hạ tầng của sản phẩm. |
| Bản giả có cài mã độc | Ký số và notarize mọi bản phát hành. Chỉ phát hành qua tên miền chính thức (và Microsoft Store nếu D10 chốt như vậy). Website công bố mã SHA-256 của từng bộ cài và cảnh báo về bản giả. |
| Tấn công qua giao diện WebView | **Capabilities của Tauri 2:** cửa sổ `overlay` chỉ nhận sự kiện phụ đề và chỉ gọi được lệnh di chuyển và khóa của chính nó; cửa sổ `main` chỉ được cấp đúng các lệnh nó cần. **CSP chặt:** chỉ nạp tài nguyên đóng gói trong app, không `unsafe-eval`, không tải script từ bên ngoài. Link ngoài mở bằng trình duyệt của hệ thống. Tắt devtools ở bản phát hành. Mọi dữ liệu từ giao diện gửi xuống Rust đều được kiểm tra kiểu và phạm vi. |
| Thay tiến trình dịch, hoặc chèn thư viện giả | Trước khi chạy `llama-server`, kiểm tra SHA-256 của nó và của các thư viện ggml, theo một danh sách build sẵn vào app. Windows: gọi `SetDefaultDllDirectories` để chỉ nạp DLL từ thư mục app và System32. macOS: hardened runtime có bật library validation, mọi `.dylib` ký cùng Team ID. |
| Lộ nội dung cuộc họp | Lịch sử chép lời được mã hóa bằng SQLCipher, khóa ngẫu nhiên lưu trong kho khóa của hệ điều hành. Log không bao giờ chứa nội dung chép lời. File xuất ra do người dùng chủ động tạo và tự quản lý. |
| Tấn công license server | Chỉ dùng HTTPS. Kiểm tra chữ ký webhook và xử lý idempotent (§6.8). Dùng prepared statement của D1, kiểm tra mọi input. Secret lưu bằng Wrangler secrets. Ghi nhật ký mọi thay đổi license, cảnh báo khi có nhiều lần kiểm tra thất bại. |
| Lộ khóa ký token | Token có trường `kid`. App build sẵn 2 khóa công khai: khóa đang dùng và khóa dự phòng. Nếu khóa bị lộ, server chuyển sang khóa dự phòng, và bản cập nhật app kế tiếp mang theo một khóa dự phòng mới. |
| Rủi ro chuỗi cung ứng | Không khóa ký nào (ký mã, cập nhật, token, manifest) nằm trên máy dev. Bản phát hành được build và ký trong CI, từ tag đã commit, dùng secret của CI hoặc dịch vụ ký trên cloud. CI chạy `cargo audit`, `cargo deny`, `pnpm audit`, và bật Dependabot. llama.cpp và whisper.cpp được build trong CI từ tag đã khóa, có kiểm tra checksum. |

**Để Giai đoạn 2**, và chỉ làm khi thấy bị crack nhiều thật: chống debug, làm rối code sâu hơn, kiểm tra toàn vẹn nhiều lớp, phát hiện gian lận phía server bằng phân tích hành vi.

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
- **License server:**
  - Unit test: tính và kiểm tra chữ ký HMAC-SHA256 với dữ liệu mẫu của PayOS; webhook idempotent; tính ngày gia hạn (từ max(hôm nay, ngày hết hạn)); giới hạn 2 máy; ký và kiểm tra token Ed25519.
  - Test tích hợp với PayOS trên môi trường test nếu có; nếu không có thì dùng giao dịch với số tiền nhỏ.
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
- **Bảo mật (§10.2):**
  - Sửa một byte trong file thực thi, hoặc ký lại bằng chứng thư khác: app chỉ chạy chế độ Free và báo "Bản cài không chính hãng".
  - Các token sau đều bị từ chối: sai chữ ký, của máy khác, đã quá `refresh_before` hoặc `expires_at`, có `kid` lạ.
  - Chỉnh lùi đồng hồ máy: app phát hiện, không reset quota, yêu cầu kiểm tra online.
  - Gỡ rồi kích hoạt lại quá ngưỡng: key bị khóa tạm.
  - Cửa sổ `overlay` gọi một lệnh không được cấp, ví dụ lệnh bản quyền: Tauri chặn lại.
  - Thay `llama-server` bằng một file khác: app từ chối chạy.
  - Mở file lịch sử bằng công cụ SQLite bên ngoài: không đọc được nếu không có khóa.
  - Log của một phiên dịch không chứa nội dung chép lời.
  - License server: vượt giới hạn request thì trả `429`; input độc hại (ví dụ SQL injection) bị từ chối; webhook sai chữ ký bị từ chối.
  - CI: `cargo audit`, `cargo deny` và `pnpm audit` không còn lỗ hổng mức cao.

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
│   │   ├── license/{provider,state,quota}.rs
│   │   ├── security/{integrity,clock,keystore}.rs  # Tự kiểm chữ ký, chống lùi giờ, kho khóa (§10.2)
│   │   ├── transcript/{store,export}.rs
│   │   ├── overlay/{macos,windows}.rs  # Hành vi cửa sổ native
│   │   └── settings.rs  tray.rs  hotkeys.rs  i18n.rs
│   ├── capabilities/{main,overlay}.json  # Quyền của từng cửa sổ (§10.2)
│   ├── binaries/                 # llama-server theo target triple
│   └── tauri.conf.json
├── server/                       # License server: Cloudflare Worker (TypeScript, Hono) + D1
│   └── src/{checkout,webhook-payos,licenses,token,reconcile}.ts
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
| S7 | Benchmark Q4_K_M so với Q8_0, whisper turbo so với small, đo WER khi rút ngắn `audio_ctx`, và thử cờ ngữ cảnh câu trước |

**Tiêu chí qua spike:** S1–S5 chạy được, và S6 đạt **p50 ≤ 1,5 giây** trên máy khuyến nghị, đo cả trên máy M1 cơ bản 16 GB. Nếu M1 cơ bản không đạt thì nâng hạng máy khuyến nghị (§8). Nếu cả máy mạnh hơn cũng không đạt thì quay lại sửa spec.

**Giai đoạn 1: MVP.** Làm F1–F10, license server và tích hợp PayOS (§6.8), đạt A1–A7.

**Giai đoạn 2: mở rộng**, thứ tự tùy phản hồi của người dùng:
- Phân biệt ai đang nói.
- Hỗ trợ Windows ARM64.
- Thu âm thanh theo từng app trên Windows.
- Dịch hai chiều bằng giọng nói (micro ảo).
- Tóm tắt và biên bản cuộc họp (cần thêm một LLM).
- **Bán ra nước ngoài:** thêm một cổng thanh toán quốc tế, kiểu merchant of record để cổng đó lo thuế ở các nước (có thể cân nhắc Polar). Có giá bằng USD và thuê bao tự gia hạn. Trong app, khách ở Việt Nam thấy mã VietQR; khách nước ngoài được mở trang thanh toán của cổng quốc tế.
- Gói cho doanh nghiệp: nhiều máy, cài đặt tập trung.
- Thêm ngôn ngữ giao diện.

## 14. Giả định cần kiểm chứng trong spike

1. Core Audio process tap thu được âm thanh của Zoom, Meet và Teams trên macOS 14.2+. Quyền `NSAudioCaptureUsageDescription` hoạt động với app đã ký nhưng không chạy sandbox. (S1)
2. Endpoint loopback thu được Teams trên Windows 10/11, kể cả khi Teams phát tiếng qua thiết bị Communications. (S2)
3. File GGUF của Hy-MT2 có chat template dùng được với `/v1/chat/completions`. (S4)
4. Whisper large-v3-turbo chạy kịp thời gian thực trên máy M1 16 GB và trên laptop Windows có GPU tích hợp dùng Vulkan. (S6)
5. Độ trễ tổng thể đạt ngân sách ở §8. (S6)
6. Bản Q4_K_M của Hy-MT2 giảm COMET không quá 0,02 so với Q8_0. (S7)
7. PayOS (kiểm tra trước khi làm §6.8):
   - Đăng ký được với loại hình kinh doanh của PHONG.
   - Webhook và cách ký HMAC-SHA256 đúng như tài liệu.
   - Có môi trường test; nếu không có thì test bằng giao dịch nhỏ.
   - Mô tả đơn cần ngắn (với một số ngân hàng tối đa 9 ký tự), nên dùng mã dạng `MT` cộng số đơn.
8. Rút ngắn `audio_ctx` không làm WER tăng quá 10% so với cửa sổ 30 giây đầy đủ. (S7)

## 15. Việc còn mở (không chặn phần kỹ thuật)

- **Tên sản phẩm, logo, tên miền, bundle identifier.** Trong code tạm dùng `meeting-translator`, sau đổi bằng cấu hình.
- **Chốt P1:** giá gói Pro 1 tháng và 12 tháng (VND), có bán gói trọn đời không, và hạn mức Free (đề xuất 30 phút/ngày).
- **PayOS:** đăng ký tài khoản (doanh nghiệp, hộ kinh doanh hoặc cá nhân) và liên kết tài khoản ngân hàng nhận tiền.
- **Hóa đơn điện tử và thuế** khi bán phần mềm cho khách ở Việt Nam: cần hỏi kế toán. PayOS có trường thông tin người mua và API hóa đơn để tích hợp.
- **Thanh toán quốc tế:** PayOS chỉ nhận chuyển khoản từ ngân hàng Việt Nam, nên MVP chỉ bán cho khách ở Việt Nam. Muốn bán ra nước ngoài thì chọn thêm một nhà cung cấp sau MVP (có thể cân nhắc Polar).
- **Dịch vụ gửi email** chứa license key.
- **Tài khoản Cloudflare riêng** cho license server.
- **Giấy tờ cho phát hành:** mua chứng thư ký mã cho Windows; tài khoản Apple Developer (99 USD/năm).
- **Website:** trang tải app, trang giá, chính sách quyền riêng tư và điều khoản sử dụng. Phần này sẽ có spec riêng.
