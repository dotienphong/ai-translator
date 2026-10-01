# Bảng đổi mã commit (2026-10-01)

Ngày 2026-10-01, lịch sử repo được viết lại để đổi tên và email tác giả của mọi commit sang tài khoản `dotienphong`. Nội dung file không đổi, nhưng mọi mã commit đều đổi.

Spec, kế hoạch và ghi chú viết trước ngày đó nhắc tới mã commit cũ. Dùng bảng dưới đây để tra mã mới tương ứng.

| Mã cũ | Mã mới | Tiêu đề commit |
|---|---|---|
| `4875042` | `455e7d0` | docs: design spec cho app desktop dịch phụ đề cuộc họp offline |
| `f530626` | `d57ff0a` | docs(spec): bỏ Polar, phần bản quyền không phụ thuộc nhà cung cấp |
| `8259dc2` | `e69df32` | docs(spec): thanh toán qua PayOS và mục tiêu độ trễ p50 ≤ 1,5 giây |
| `bb52c83` | `b1dda74` | docs(spec): tách PaymentProvider để sau này thêm cổng thanh toán quốc tế |
| `2badfaa` | `9648aac` | docs(spec): bỏ giới hạn không dùng Polar cho cổng thanh toán quốc tế |
| `d6c819e` | `4f3a1da` | docs(spec): thêm mục bảo mật và chống sao chép, quy tắc phiên bản thư viện, React 19 |
| `853fdd7` | `21852fd` | docs(spec): chốt D10, phát hành bộ cài .exe và .dmg qua website, chưa lên Microsoft Store |
| `c1bf80f` | `8a02d5f` | docs(spec): sửa các điểm rà soát trước khi duyệt |
| `611f875` | `2b27ea5` | docs(spec): giữ mức sàn A3 gói Chuẩn 0,83; thêm lỗi và test cho máy Windows không có Vulkan |
| `81712fb` | `39260d1` | docs(spec): p50 ≤ 2 giây, ngưỡng VRAM 6 GB, tách whisper thành tiến trình phụ asr-worker |
| `70ffc69` | `ecae35c` | docs(plan): kế hoạch Giai đoạn 0 (spike S1–S7), spec chuyển sang đã duyệt |
| `e22c56b` | `69df517` | feat(asr-protocol): giao thức stdin/stdout giữa app và asr-worker |
| `63a77d5` | `036b33f` | docs(plan): README của bench/phase0 liệt kê đủ các script |
| `3a99dfd` | `15babf6` | docs(plan): áp các sửa từ review asr-protocol vào kế hoạch 00, 01, 03 |
| `1d11b87` | `0649213` | fix(asr-protocol): che âm thanh và bản chép trong Debug, báo lỗi khung thừa byte, thêm test |
| `59dd866` | `7675617` | build: khóa cứng mức CPU của whisper.cpp, cargo-deny chặn crate bị yank và unsound, bỏ qua __pycache__ |
| `b687388` | `b812667` | docs(plan): sửa cách đọc mã thoát của asr-worker trên Windows |
| `f639f9d` | `0afb47f` | chore(bench): script tải model và llama.cpp b11146 cho Giai đoạn 0 |
| `1cca7bf` | `8cb8d37` | docs(plan): fetch.py ghim phiên bản, kiểm SHA-256, thử lại khi rớt mạng; máy tham chiếu dùng Python 3.12 |
| `320185a` | `4cbb955` | fix(bench): fetch.py ghim phiên bản, kiểm kích thước và SHA-256, thử lại khi rớt mạng |
| `fb60cb0` | `be6b215` | fix(bench): fetch.py thử lại khi HTTP 5xx/429, giải nén lại khi mất llama-server, dừng khi file lớn hơn bản ghim |
| `a981ba9` | `5eba9c4` | docs(plan): cập nhật fetch.py trong kế hoạch 01, cách có lệnh uv trên máy tham chiếu |
| `1ed7f08` | `4057af3` | feat(bench): chạy llama-server và dựng prompt Hy-MT2 giống app |
| `8a37c3c` | `f025f0f` | docs(plan): common.py bỏ qua proxy, dọn llama-server khi lỗi, bắt stream cụt; score_mt đếm bản dịch bị cắt |
| `2a451c8` | `f6bd2c3` | fix(bench): common.py bỏ qua proxy, dọn llama-server khi khởi động lỗi, báo lỗi khi stream cụt |
| `b7ad55f` | `c3cda1e` | docs(plan): ghi việc sửa spec về lần chạy đầu của binary mới trên macOS |
| `1d33406` | `6b58416` | test(bench): S4 kiểm tra chat template Hy-MT2 trên llama-server b11146 |
| `52f41d5` | `bbc4576` | fix(bench): chạy llama-server với --no-ui thay cho --no-webui đã deprecated |
| `67d0697` | `106c236` | docs(plan): --no-ui cho llama-server; translate.py bỏ dòng viết dở khi chạy tiếp; score_mt không lỗi khi thiếu en->vi |
| `cb217d2` | `3525a69` | docs(plan): build_testset ghim commit WMT24++ và kiểm SHA-256 |
| `8d2dde1` | `274794d` | docs(plan): S4 so token, tham chiếu bằng token Hugging Face, kiểm dừng ở EOS, ghi phiên bản công cụ |
| `4cdc4ca` | `90da22f` | fix(bench): S4 so token và dừng ở EOS, ghim tokenizer, ghi phiên bản công cụ |
| `7643d6f` | `bc10c71` | fix(bench): bỏ định nghĩa count_tokens trùng trong common.py |
| `3c1ba51` | `e13c56a` | docs(plan): ghi phạm vi của kết luận S4 |
| `58c3977` | `855b763` | fix(bench): S4 trả mã 2 khi thiếu llama-server, ghi rõ dấu cách toàn khổ và cảnh báo EOS vô hại |
| `0ea40e3` | `99c5419` | docs(plan): đồng bộ common.py và check_template.py trong kế hoạch 02 |
| `a3a96a4` | `814bb64` | feat(bench): bộ test A3 gồm benchmark cũ và ba chiều Trung/Nhật/Hàn→Việt |
| `a91e1ba` | `cc1e3ac` | docs(plan): build_clips ghim commit FLEURS, kiểm kích thước và SHA-256 qua fetch.ensure |
| `1ab5490` | `b98c919` | feat(bench): dịch bộ test A3 qua llama-server với prompt của app |
| `3ac8e49` | `2225a8b` | docs(plan): score_mt đếm bản dịch nghi lẫn mẫu prompt; cờ ngữ cảnh xét cả tiêu chí này; đo thời gian lúc máy rảnh |
| `434f3f1` | `6b5b551` | test(bench): S7 mốc COMET A3 cho Q8_0 và Q4_K_M, ngưỡng tỉ lệ token |
| `3e70c05` | `52cde11` | docs(bench): quyết định S7 phần dịch (mốc A3, Q4_K_M, cờ ngữ cảnh, ngưỡng token) |
| `ec1b253` | `8ff7197` | docs(plan): asr_client kill worker sau 5 giây khi không thoát, asr-worker giữ log của whisper.cpp ra stderr |
| `c25c8e3` | `a6bf782` | feat(pipeline): cắt đoạn theo VAD (300 ms im lặng, tối đa 8 giây, đệm 200 ms) |
| `6b84120` | `9e0d286` | docs(plan): segmenter giữ phần dư sau cắt cưỡng bức, test kiểm nội dung samples; cập nhật số test |
| `d0114a9` | `301f4e2` | fix(pipeline): giữ phần dư sau cắt cưỡng bức, flush đệm đuôi như chốt thường, test kiểm nội dung samples |
| `81e0d72` | `4fb5635` | docs(pipeline): phần đệm cũng có thể ngắn hơn ở cuối phiên (flush) |
| `5656c46` | `ae22394` | docs(pipeline): ngắt dòng doc của Segment::samples |
| `9ffd71f` | `a3e52a6` | feat(pipeline): Silero VAD v6.2.3 chạy bằng candle-onnx, khớp onnxruntime |
| `3ea0408` | `30b74e0` | docs(plan): ASR_FLASH_ATTN=0 để tắt flash attention khi thử Vulkan; số đo VAD thật |
| `91780f2` | `e87a0a6` | docs(plan): VAD detach state, test chạy dài, vad_probe --paced; ngoại lệ paste chuyển lên Task 2 |
| `4737b5d` | `eb6ca1c` | fix(pipeline): VAD detach state (rò bộ nhớ), kiểm tên input/output, test chạy dài và so từng khung, vad_probe --paced |
| `3df81bf` | `73b2e38` | docs(plan): VAD debug_assert state đã detach, ngữ cảnh lỗi lúc nạp, vad_probe báo file ngắn, tiêu chí p99 Windows |
| `f3f78aa` | `345de32` | fix(pipeline): VAD kiểm state đã detach, thêm ngữ cảnh lỗi lúc nạp, vad_probe báo file quá ngắn; ghi chú stack và cách tạo dữ liệu thử |
| `4bf28b0` | `799138c` | feat(asr-worker): chọn ngôn ngữ trong tập cho phép, giữ ngôn ngữ trước khi không chắc |
| `42338d6` | `3b307e9` | feat(asr-worker): tiến trình phụ whisper.cpp qua stdin/stdout, chế độ nhận diện ngôn ngữ riêng (A) |
| `c80aa09` | `10fb6a3` | fix(asr-worker): tắt flash attention mặc định (whisper.cpp sai khi rút ngắn audio_ctx), kiểm đầu vào transcribe, đặt audio_ctx cho state nhận diện lúc nạp |
| `404cbce` | `e98e39e` | docs(plan): tắt flash attention mặc định (whisper.cpp thiếu mask phần đệm), kiểm đầu vào transcribe, audio_ctx của state nhận diện đặt lúc nạp |
| `61de082` | `b699a47` | fix(asr-worker): audio_ctx trong [0, 1500] và luôn phủ hết đoạn; chế độ B không tạo state nhận diện ngôn ngữ |
| `1650053` | `9d3104a` | docs(plan): audio_ctx trong [0, 1500] và phủ hết đoạn, chế độ B không tạo state nhận diện, sửa chữ Task 4 và Task 15 |
| `c64e1af` | `b750ae0` | feat(pipeline): client chạy và gọi asr-worker |
| `6fca53c` | `c92f1a4` | feat(bench): bộ clip A4 từ FLEURS, 15 phút mỗi ngôn ngữ, kèm bản băng hẹp |
| `42a1735` | `c7b232d` | feat(bench): latency-bench asr-eval và chấm WER/CER cho A4 |
| `e412422` | `2232729` | docs(plan): bộ clip lọc theo độ dài thật, asr-eval --min-ctx, Task 11 thêm lượt sàn audio_ctx 512, số chạy thử tiếng Hàn |
| `64a0f10` | `c44e761` | fix(bench): chấm A4 đổi zh về giản thể, bỏ chú thích Latin, nhóm wbp, cột lặp câu và lid_fallback, kiểm đủ clip |
| `d7008d2` | `b48f559` | fix(bench): bộ clip cắt lặng đầu cuối, nb xếp sau wb, băng hẹp 300–3400 Hz µ-law, manifest riêng khi chạy một phần |
| `8db0d8b` | `c317954` | fix(bench,pipeline): asr-eval ghi .part rồi đổi tên, log theo lượt, lỗi nêu clip, ghi audio_ctx; client kiểm segment_id và báo mã thoát worker; hằng khoảng mẫu trong asr-protocol |
| `c1e9eed` | `0dfcd71` | docs(plan): chấm A4 có zh giản thể, nhóm wbp, cột lặp câu; bộ clip cắt lặng và nb giống HFP; số clip và bảng tiếng Hàn mới |
| `6d4e6d0` | `839d803` | fix(bench): quy tắc chú thích Latin zh giữ AI và CEP, nhận chữ có dấu; asr-eval xóa log cũ khi bắt đầu lượt |
| `434b217` | `c6cddf7` | docs(plan): quy tắc chú thích Latin zh, log theo lượt, số clip mới ở Task 10, ghi chú đọc số tiếng Nhật, danh sách chú thích ra a4_gloss.txt |
| `158f9e3` | `ca1c6cd` | build(third_party): vá whisper.cpp 1.8.3 và whisper-rs 0.16 để đặt audio_ctx trước khi encode |
| `4760ec5` | `1335a68` | feat(asr-worker): chế độ B dùng chung một lượt encode cho nhận diện ngôn ngữ và chép lời |
| `5fca94a` | `2cf35df` | docs(plan): Task 8 git add -f cho Cargo.lock của whisper-rs, số chế độ B thật, ý nghĩa lang_prob và no_speech_prob ở hai chế độ |
| `8f24130` | `03e0d18` | fix(asr-worker): chế độ B bắt vòng lặp tới 64 token, giới hạn token theo độ dài đoạn, gom câu lặp về một bản; từ chối prompt quá 100 token; README third_party ghi cách build lại |
| `ee90f67` | `1828bc0` | docs(plan): chế độ B bắt vòng lặp tới 64 token, trần token theo độ dài đoạn, gom câu lặp; MAX_PROMPT_TOKENS; ghi chú đọc số A/B |
| `27f315e` | `4dea8c2` | test(bench): ước lượng dung lượng các tiến trình phụ trong bộ cài macOS |
| `86b4449` | `2e7790d` | build: cấm link whisper.cpp ngoài asr-worker trong cargo-deny |
| `dcfb2d6` | `9bb4698` | docs(third_party): dựng lại có kiểm sha256; sửa whisper.cpp thì xóa build cũ ở cả profile release |
| `7c6c81d` | `e1e7742` | docs(plan): Task 8 dựng lại có kiểm sha256 và xóa build cũ ở cả profile release; Task 9 sửa Expected của bước test trước, phạm vi của luật lặp |
| `dc6fb55` | `167a910` | feat(audio-capture): trait AudioSource và chèn im lặng theo đồng hồ QPC |
| `f0ddd5d` | `86fa390` | feat(audio-capture): trộn hai thiết bị có bù lệch đồng hồ |
| `4332533` | `6995573` | feat(audio-capture): gộp kênh và resample về 16 kHz bằng rubato |
| `3ddd509` | `649247a` | feat(audio-capture): Core Audio process tap qua aggregate device riêng tư (macOS 14.2+) |
| `af6e36b` | `d1f973b` | feat(audio-capture): công cụ capture và Capture.app đã ký cho S1 |
| `59a1d62` | `78f6552` | docs(plan): kế hoạch 04 sửa Expected của Task 3 và Task 5 theo lúc thực thi |
| `144afee` | `013b1af` | feat(pipeline): mẫu prompt Hy-MT2 (Anh, Trung, ngữ cảnh) giống S4 |
| `c23b91f` | `732776e` | feat(pipeline): đọc stream SSE của llama-server |
| `2298fc6` | `57dbb13` | feat(pipeline): chạy llama-server theo §6.5 và dịch qua /v1/chat/completions (stream) |
| `ab6d1e4` | `8644f3d` | feat(latency-bench): phân vị và ghép đoạn với mốc dừng câu |
| `d2420c3` | `0c9fe64` | feat(app): frontend React 19 cho spike S5 (cửa sổ điều khiển và thanh phụ đề) |
| `619f217` | `22f04ed` | feat(app): spike S5 thanh phụ đề nổi (NSPanel trên macOS, topmost trên Windows) |
| `69c1c90` | `e924ec4` | fix(audio-capture): aggregate chỉ chứa tap và kiểm bố cục luồng vào; IO đọc theo từng buffer; báo khi start đang chờ; chống alias tới 7,5 kHz; resampler giữ khung dở; GapFiller không cộng dồn lệch đồng hồ |
| `a74bdf5` | `85ccb7e` | fix(pipeline): llama-server bỏ qua proxy của môi trường, kiểm [DONE] và trả finish_reason, lỗi HTTP kèm thân response, log append |
| `10681c1` | `8e256f2` | test(latency-bench): phân vị với đầu vào chưa sắp, biên cửa sổ ghép và chọn đoạn gần nhất |
| `81945e4` | `d9c049e` | docs(plan): kế hoạch 04 lưu ý chạy ma trận S1 và bản sửa aggregate chỉ chứa tap; kế hoạch 06 bỏ qua proxy, kiểm [DONE], finish_reason, số test mới |
| `6150605` | `51cc9b3` | fix(app): overlay thật sự non-activating (StyleMask cộng bit), webview trong suốt và không focus lúc tạo, vùng kéo deep, ACL cho command của app, Windows focusable(false) |
| `fef5b4c` | `4410be1` | docs(plan): kế hoạch 05 overlay non-activating (add_style_mask), ACL app manifest, Windows focusable(false), comment dist/, dòng thử F10 và focus |
| `dd78b33` | `2075d54` | feat(latency-bench): đo độ trễ tổng thể theo A2, kèm RAM và CPU |
| `11f8767` | `ef1c3a4` | fix(audio-capture): GapFiller giữ dòng thời gian theo số khung đã ghi và chỉnh từng khung khi lệch; resampler không phát lại khi lỗi; test on_io bằng buffer giả; test ca biên có assert |
| `89b511e` | `2997265` | fix(latency-bench): câu không có bản dịch không gồm câu không ghép được; ghi lệch mốc dừng của từng câu |
| `787490f` | `df07d6e` | feat(bench): session phát lại S6, chạy theo máy và gói, tổng hợp và lấy mẫu VRAM |
| `7079450` | `8e23701` | fix(latency-bench): báo lỗi của luồng MT trước lỗi của luồng ASR |
| `702a65e` | `6a4c83c` | docs(plan): kế hoạch 04 test ca biên và on_io giả, GapFiller fix3; kế hoạch 06 Task 5–6 mốc thật bằng Silero VAD, max_tokens theo §6.5, số test mới |
| `3787dbe` | `b9587dc` | test(bench): S3 so sánh chế độ A và B trên bộ clip A4 |
| `d722579` | `d782771` | test(bench): mốc A4 cho turbo và small, thí nghiệm audio_ctx và khóa ngôn ngữ |
| `8e3f37b` | `9366fd3` | feat(latency-bench): mô phỏng ghép câu và phụ đề tạm §6.3; LID nhầm sang ngôn ngữ đích không tính là hiện nhanh |
| `68acd68` | `c200bb5` | fix(latency-bench): đo CPU bằng thời gian CPU tích lũy, RAM đỉnh từ lúc nạp model, thời gian chờ hàng đợi; dọn tiến trình con khi panic |
| `7629dd2` | `c6e32b4` | fix(bench): session S6 chuẩn hóa mức và khoảng lặng thật 0,4–1,6 s, mốc dừng tinh chỉnh; summarize không kết luận khi lượt đo không đáng tin |
| `ca0eb51` | `21486b9` | docs(plan): kế hoạch 06 ghép câu §6.3, cách đo CPU/RAM/hàng đợi, session chuẩn hóa mức âm và khoảng lặng, mốc dừng tinh chỉnh, Task 7 thêm lượt sàn 512; kế hoạch 00 kết quả A4 |
| `5fc6d67` | `8b03980` | test(bench): S6 trên Mac M4 Pro, gói Chuẩn và gói Nhẹ |
| `0dc5aac` | `c483608` | fix(bench): mốc dừng tinh chỉnh dùng cả dải cao (âm xát); lệch mốc tính so với mốc VAD; summarize không kết luận lượt nomerge |
| `a2a62d1` | `33bd6f0` | test(bench): tính lại kết quả S6 trên M4 Pro với mốc dừng đã sửa |
| `ffb37b7` | `5156d78` | docs(plan): kết quả S6 trên M4 Pro (đã tính lại với mốc dừng sửa), mốc dừng dùng cả dải cao, lệch mốc so với VAD, đường dẫn tương đối; kế hoạch 00 thêm kết quả S6 |
| `ca86a52` | `e7a6038` | docs(spec): bấm X thu cửa sổ chính xuống khay, thoát qua menu khay; bước hướng dẫn ghim icon khay ở lần đầu mở |
| `954b3c2` | `a78214d` | docs(spec): ⌘Q và Quit ở Dock không thoát app trên Mac; không chặn thoát khi tắt máy, đăng xuất hay cập nhật |
| `af5b41a` | `8a20e55` | feat(asr-protocol): mức sàn audio_ctx 512, avg_logprob trong kết quả |
| `0a81364` | `866542f` | feat(asr-worker): LID bám ngôn ngữ trước với đoạn ngắn, bắt câu chép hai lần, mồi dấu câu cho zh/ja |
| `2786aee` | `3498f5e` | perf(asr-worker): chọn token ở chế độ B kèm log-xác suất tốn 3 đến 5 ms mỗi đoạn thay vì 8 ms |
| `0fd5e92` | `bf61660` | fix(asr-worker): tắt mồi zh/ja mặc định (ASR_PRIMER=1 để bật), bắt mẫu lặp tới 112 token |
| `76b0158` | `e0b2e52` | feat(latency-bench): bỏ đoạn theo luật no_speech của OpenAI (kèm avg_logprob < −1) |
| `e6ccf14` | `bff7e80` | test(bench): mốc A4 với cấu hình chốt (sàn 512, luật lặp mới) |
| `4b267c0` | `9312db0` | test(bench): S6 trên M4 Pro với cấu hình chốt (sàn 512, LID đoạn ngắn, luật lặp và no_speech mới) |
| `1cfc718` | `ea56d6e` | docs(asr): ghi rõ luật mới là đề xuất cho §6.4, nghĩa --min-ctx sau khi có sàn, avg_logprob không tính EOT; score_asr dùng luật no_speech mới |
| `67fb3ca` | `4a128d9` | test(bench): ghi min_audio_ctx vào config của 12 kết quả S6 cấu hình chốt |
| `9d488c3` | `64bb4c7` | docs(plan): chốt các vấn đề mở sau S3/S6 (sàn audio_ctx 512, LID đoạn ngắn, luật lặp 2 bản, no_speech theo OpenAI, mồi zh/ja tắt), mốc A4 và S6 cấu hình chốt, số test mới |
| `e181e1d` | `73c989a` | docs(spec): cập nhật theo kết quả Giai đoạn 0 |
| `84d9c7b` | `e634215` | docs(code): comment dẫn tới luật mới của spec §6.3–§6.5 |
| `f5e2853` | `3407c27` | docs(spec): sửa theo review (số liệu, trạng thái Giai đoạn 0 và đích MVP, nguồn số đo) |
| `d334a8e` | `ecae8d9` | docs(plan): sinh lại khối code sau khi comment dẫn tới spec §6.3–§6.5 |
| `3f085a9` | `11f4e6a` | docs(spec): giữ audio-capture và pipeline là crate riêng; gửi email qua Resend |
| `78888a8` | `69134f1` | docs(plan): tổng quan Giai đoạn 1 (MVP) |
| `1308119` | `a191024` | docs(plan): Giai đoạn 1 · 05 license server |
| `0488b00` | `28531cd` | docs(plan): Giai đoạn 1 · 01 nền app |
| `09db06e` | `5347944` | docs(plan): Giai đoạn 1 · 05 sửa theo review |
| `9badb34` | `a9f6ceb` | docs(plan): Giai đoạn 1 · 01 sửa theo review |
| `8220575` | `3fc3ed0` | docs(plan): Giai đoạn 1 · 05 sửa theo review lần 2 |
| `dc82599` | `c5621ea` | docs(plan): Giai đoạn 1 · 05 phân loại lỗi email |
| `47f5939` | `f58d296` | docs(plan): Giai đoạn 1 · 01 sửa theo review lần 2 |
| `0016c4b` | `49cd20e` | docs(plan): Giai đoạn 1 · 01 sửa theo review lần 3 |
| `6fc16e6` | `5a4369f` | docs(plan): Giai đoạn 1 · 01 chốt tauri-plugin-autostart 2.7.0 và single-instance 2.5.2 |
| `b221f3c` | `79af301` | docs(plan): Giai đoạn 1 · 02 pipeline trong app |
| `6804a7c` | `532edc9` | docs(spec): chốt tên, 4 gói và hạn mức, lưu dữ liệu 1 năm; đưa các điểm lệch nhỏ của kế hoạch 01, 02, 05 vào spec |
| `07694e2` | `a413e33` | docs(plan): Giai đoạn 1 · 01 chốt tên AI Translator và bundle id |
| `10bb011` | `b8ea5aa` | docs(plan): kế hoạch 00 cập nhật quyết định của chủ dự án |
| `868dcfa` | `b573e4b` | docs(spec): luật hạn mức chặt hơn sau review; giữ dữ liệu vĩnh viễn |
| `1f4d225` | `7c0a7cd` | docs(plan): kế hoạch 00 theo review spec |
| `cbb177d` | `c552c15` | docs(plan): Giai đoạn 1 · 01 thêm test tắt autostart |
| `dc4ac49` | `0b77fe1` | docs(spec): cờ quota_fresh, bản ghi đánh dấu có quota_epoch, đồng hồ thật của Free; sửa theo review lần 2 |
| `c75ec18` | `d407ac4` | docs(plan): kế hoạch 00 theo review lần 2 của spec |
| `d3dc512` | `a8273f5` | docs(spec): tách luật Free, cửa sổ quota_fresh 15 phút, khóa bộ đếm có activation_id; sửa theo review lần 3 |
| `1389e8f` | `0af562c` | docs(plan): kế hoạch 00 theo review lần 3 của spec |
| `7458783` | `7926d1c` | docs(spec): đường cứu bằng quota_epoch, mốc của cửa sổ quota_fresh; sửa theo review lần 4 |
| `fa71112` | `c02bb5c` | docs(plan): kế hoạch 00 theo review lần 4 của spec |
