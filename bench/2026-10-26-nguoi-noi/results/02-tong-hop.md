# Tổng hợp kế hoạch 02 (worker, pipeline, đo nghiệm thu): phân biệt người nói

Kế hoạch 02b, Task 9. Trả lời 11 câu hỏi của kế hoạch 02 và 02b bằng số trong các file kết quả của thư mục này
(`02-nhan-giong-worker.md`, `02-do-tre.md`, `02-soak.md`, `02-windows.md`) và kết quả Task 6 (đóng gói), Task 7 (bảo mật) của
02b, ghi lại ở đây vì hai Task đó không có file riêng. Không có số đo mới, trừ lượt chạy lại test ở mục "Mốc kiểm cuối". Mọi số
macOS đo trên Apple M4 Pro (12 lõi, 24 GB), macOS 26.6.2, máy có người dùng khác (tải máy ghi ở từng file). MB là 10^6 byte.
Spec đã sửa theo bảng này, mỗi chỗ ghi "(chốt ở kế hoạch 02, `results/02-<file>.md`)". **Chờ chủ dự án duyệt; kế hoạch 03 chỉ
viết sau khi duyệt.**

## Bảng trả lời

| # | Câu hỏi | Kết quả | File kết quả | Việc phải đổi trong spec |
|---|---|---|---|---|
| 1 | B' trong repo giống từng bit `simple_eval` (1, 2, 4, 8 s); onnxruntime cosine ≥ 0,999 (file 02 Task 4) | **Đạt.** Test `#[ignore]` chạy với model thật (`RAYON_NUM_THREADS=2`, bản debug): `steps_match_simple_eval_on_the_real_model` (so `to_bits` với `simple_eval` cả đồ thị ở 1, 2, 4, 8 s), `embedding_matches_onnxruntime` (cosine ≥ 0,999; test không in số), `windowed_embedding_against_the_whole_segment`: 3/3 đạt ở rà soát độc lập ngày 2026-10-26 (169,6 s) và chạy lại ngày 2026-10-27 trên mã hiện tại (144,4 s, mục "Mốc kiểm cuối") | Không có file riêng: test trong `crates/speaker-worker/src/embed.rs` | §4.1: B' đã có trong repo, test giống từng bit |
| 2 | A-spk1 qua worker thật (trung bình 4 bản ghi; mốc 91,8% / 84,9%) (02b Task 2) | **Đạt** theo trung bình: dòng ≥ 1 s **91,6%**, mọi dòng **84,8%** (−0,2 / −0,1 điểm so với mốc A2 4 s). Ba bản ghi trùng mốc từng đoạn; EN2002a.Mix-Headset kém 4 đoạn (≥ 1 s) và 5 đoạn (mọi dòng): mọi dòng 762/959 = 79,5%, thiếu 6 đoạn nếu đọc theo từng bản ghi (mốc thiếu 1). Nguyên nhân khả dĩ: PCM 16 bit của giao thức (`as i16` cắt về 0, lệch 1 LSB) lật vài đoạn có độ tin sát θ; hai lượt worker giống nhau từng bit (tất định) | `02-nhan-giong-worker.md` | §12: thêm "Kết quả kế hoạch 02" |
| 3 | A-spk2 qua worker thật, A2 4 s (trung bình 8 bản ghi) (02b Task 2) | **Đạt** theo trung bình: dòng ≥ 1 s **93,9%**, bằng mốc nhúng cả đoạn; nhãn của cả 8 bản trùng mốc từng đoạn. Theo từng hội thoại như kế hoạch 01: 7/8 bản ≥ 85%, cv-vi-05 Opus 67,7% (hai người gộp một giọng). A2 hầu như không cắt gì trên dữ liệu này (0–0,5% thời lượng; đoạn dài nhất 5,06 s), nên chưa có số cho người nói tiếng Việt liền đoạn dài | `02-nhan-giong-worker.md` | §12 |
| 4 | Tải của worker khi nhúng tuần tự (gửi liền nhau) (02b Task 2) | Khứ hồi p50 61,3–92,6 ms, p90 110,7–201,7 ms; **4 876/4 876 ≤ 230 ms** (hai lượt × 2 438 đoạn có nhúng), chậm nhất 224,3 ms (biên 5,7 ms, máy tải 4–8). **RSS đỉnh 163,1–259,8 MB: vượt 250 MB ở 2/12 bản ghi** (cv-vi-05 Opus 259,8 / 257,4; ES2004a.Array1-01 251,5 / 247,9). **CPU theo thời lượng tiếng nói:** AMI trung bình 7,6% (ES2004a.Array1-01 8,01–8,10%), tiếng Việt 8,28–8,62%: **vượt 8% nếu tính theo %CPU**. Phát theo thời gian thực (kiểm bổ sung, cùng hai bản ghi đã vượt): RSS đỉnh 147,6–198,0 MB, thấp hơn gửi liền nhau 23–41% | `02-nhan-giong-worker.md` (cả mục "Kiểm bổ sung theo thời gian thực") | §11 |
| 5 | A-spk4; khứ hồi của nhãn và tỉ lệ nhãn tới trước kết quả nhận dạng khi chạy cùng `asr-worker`, `llama-server` (02b Task 4) | **A-spk4 đạt** (6 cặp xen kẽ tắt/bật, S6 `en` và `mixed`): A2 p50 **−11,8 ms** (KTC 95% [−22,4; −1,2], mức ≤ +20), p90 **−26,4 ms** ([−34,2; −18,6], ≤ +50), chữ đầu **−18,2 ms** ([−28,2; −8,1], ≤ +20); cận trên của KTC dưới mức cả khi tách từng session. Lượt bật nhanh hơn ở mọi cặp, chưa rõ vì sao (giả thuyết xung nhịp, chưa kiểm): **không công bố là "bật làm nhanh hơn"**. Khứ hồi nhãn (12 lượt bật, 954 đoạn): p50 80,8–152,3 ms, p90 201,8–227,4 ms, **931/954 (97,6%) ≤ 230 ms**; **950/954 (99,6%) nhãn tới trước kết quả nhận dạng**, 4 nhãn muộn đi đường cập nhật muộn. Soak 92 phút: 2063/2135 (96,6%) ≤ 230 ms, 2129/2135 tới trước. Chỉ đo trên M4 Pro | `02-do-tre.md`, `02-soak.md` | §4.4 (số khứ hồi), §11 (A-spk4) |
| 6 | Hàng đợi dịch bật so với tắt (QĐ 12 của file 02), cả khi dịch quá tải (02b Task 4) | **Bật y hệt tắt ở mọi kịch bản đo.** Dịch kịp (S6, AMI 300 s): 0 câu gộp, 0 `Skip`, hàng dài nhất 1. Quá tải 2000 ms (AMI 300 s, 2 cặp): cùng 90 câu dịch, 6 câu gộp, 0 `Skip`, hàng dài nhất 3, chờ lâu nhất 5 376 / 5 280 ms khi bật so với 5 376 ms khi tắt; gộp khác giọng 0 (mọi lần gộp rơi vào dãy cùng giọng). Thêm 3000 ms (ngoài kế hoạch, 2 cặp): cùng 12 nhóm gộp (24 câu), 71 câu dịch, hàng dài nhất 3, chờ lâu nhất 8 928 ms, 0 `Skip`; mỗi lượt bật có 1 nhóm gộp khác giọng và câu gộp đó **không nhãn**. Cộng thêm test trong repo (300 cuộc ngẫu nhiên, các kiểu 1-2, 1-1-2-2, 1-1-2-3, 1-1-1-2) và mô phỏng độc lập 1 200 cuộc ngẫu nhiên bằng `MtQueue` thật (ngoài repo): bật chậm hơn tắt 0 lần, cách chia câu vào request khác tắt 0 lần | `02-do-tre.md` | §4.4: luật hai lượt, câu gộp khác giọng không nhãn |
| 7 | Soak ≥ 1 giờ (02b Task 5) | 92 phút (5537 s, bốn bản AMI ghép, 2135 đoạn), phát theo thời gian thực cùng `asr-worker` (Metal), `llama-server`. **RSS đỉnh `speaker-worker` 141,8 MB** (vết 5 s; 144,1 MB theo bộ lấy mẫu 0,5 s). **Không rò:** đỉnh 10% cuối 116,5 MB so với 10% đầu 137,0 MB (−20,5; mức ≤ +25), xu hướng −21 MB/giờ từ phút 10. Theo giờ đồng hồ: 5,79% một lõi, 0,921 tỉ lệnh/s, 255 mW. Theo giây tiếng nói (đoạn IS1009a): **8,55%** so với 7,09% khi gửi liền nhau, nhưng cùng 1,445 so với 1,448 tỉ lệnh và 443 so với 446 mJ; chỉ khác xung nhịp hiệu dụng (3,46 so với 4,01 GHz); cả soak 9,46%. Log worker: "2 luồng tính toán". Worker không tắt giữa chừng, không tiến trình phụ nào chạy lại, nhúng lỗi 0 | `02-soak.md` | §11 (RAM, CPU), §14 (allocator) |
| 8 | Đóng gói (02b Task 6, Task 8 Step 1) | **Đạt, dư nhiều.** `speaker-worker` macOS arm64 2 867 152 byte (gzip 1 013 910, xz 672 172); `.dmg` 0.3.1 9 980 110 byte, ước tính có worker ~10,99 MB. Windows: `speaker-worker.exe` (gnu) 4 483 584 byte (xz 1 063 628); bộ cài 0.3.1 21 101 359 byte, ước tính ~22,16 MB (bản phát hành dựng MSVC nên chỉ là ước tính). Giới hạn 60 000 000 byte. `minos 14.2`; ký thử ad-hoc đạt; macOS chỉ liên kết `libSystem`, `libiconv`; Windows chỉ nhập DLL hệ thống, không có `WS2_32.dll` | `02-windows.md` (phần Windows); macOS ghi ở đây | §4.1 (đóng gói, thư viện) |
| 9 | Bảo mật (02b Task 7; file 02 Task 1, 4, 13, 17) | **Đạt.** `scripts/release/check-no-network.sh --binary target/release/speaker-worker speaker-worker speaker-protocol`: sạch ở bốn lớp (cây phụ thuộc macOS và Windows, feature Windows, mã nguồn, ký hiệu nhập của binary); `asr-worker` cũng sạch. Ba lần thử âm tính đều mã 1: `pipeline` (lớp 1: `hyper`, `reqwest`, `tokio`…; lớp 2: `Win32_Networking`; lớp 3: `fake_llama_server.rs`), bản sao tạm chèn `TcpStream::connect` (và `libc::connect`) bị lớp 3 bắt, `--binary latency-bench` bị lớp 4 bắt (`_bind _connect _getaddrinfo _socket`). `cargo deny check` 0.20.2: ok cả bốn mục; `cargo audit` 0.22.2: 0 lỗ hổng, 6 cảnh báo đã có từ trước; `Cargo.lock` chỉ thêm `speaker-protocol`, `speaker-worker` (không crate bên thứ ba mới). Log chỉ có số đếm, mã đoạn, loại lỗi, thời gian; không in âm thanh, nhúng hay tên. Kiểm toàn vẹn trước mỗi lần chạy như `asr-worker` (cả thư mục `binaries/`, từ chối thư viện lạ; test `the_binary_and_the_model_are_checked_before_each_run`), worker tự băm byte model đã đọc (`Load.model_sha256`, `a_model_that_does_not_match_the_checked_sha256_is_refused`). Kênh stdin/stdout: khung ≤ 4 MiB, khung hỏng làm worker thoát và app coi worker đã chết; `Voices` ≤ 64 giọng; kênh nhãn tới luồng phụ đề ≤ 256, đầy thì coi worker chết; mã đoạn lạ bị bỏ qua; app là tiến trình cha nên khung của app được tin | Ghi ở đây | §4.1 (không mạng, kiểm toàn vẹn) |
| 10 | Windows i5 (02b Task 8) | **Chờ chủ dự án.** Gói gộp (kèm gói Task 13 của kế hoạch 01) `$DATA/win-pack-02.zip`, 57 500 248 byte, SHA-256 `0fc5f200486134b6331b4efbe78a551f9a8ae7906d570a3e1a1111a38e3a3448`; chạy `chay-tat-ca.ps1`, gửi lại `ket-qua-gui-lai.zip`. Chưa thử trên Windows (máy dựng không có PowerShell) | `02-windows.md` | §11, §14: giữ "chờ số đo" |
| 11 | Thử app dev có nhận giọng (file 02 Task 19 Step 4) | **Chưa chạy, chờ chủ dự án**: cần chủ dự án bấm Bắt đầu và cấp quyền ghi âm hệ thống cho bản dev, và `pnpm install` qua mạng | — | — |

## Quyết định của kế hoạch 02 cần chủ dự án biết

Chép ngắn mục "Quyết định thiết kế" của file 02 (đầy đủ ở đó).

1. **Giao thức tối thiểu** (`PROTOCOL_VERSION = 1`): `Load {model_path, config, model_sha256}`, `SessionStart`, `Segment`,
   `Shutdown`; `Ready {protocol_version, model_ok}`, `Assign`, `Voices {voices: [VoiceInfo {voice, speech_ms, mic}]}`, `Merged`,
   `Error {segment_id, kind, message}`. `Speech`, `SetNames`, `ReaderState`, tên, `participants` để kế hoạch 04.
2. `SpeakerConfig` nằm ở `speaker-protocol` (app kiểm `speaker_config` của manifest bằng đúng luật của worker).
3. Cờ nguồn gắn cho từng mẫu ở bộ trộn; luồng VAD lấy đa số theo khung rồi theo đoạn.
4. **Cờ dev:** chỉ bản debug có `AI_TRANSLATOR_DEV_SPEAKER=true` mới bật; bản phát hành luôn tắt (cổng `no-dev-gate` chặn chuỗi này
   lọt vào bản phát hành). Không thêm khóa cài đặt ở 02; kế hoạch 03 thay bằng `speakerDiarization`.
5. **Model chưa đăng R2:** manifest đọc khóa `speaker` lỏng; bản dev dùng model của thư mục model dev; đăng model, mục `speaker`
   của `models.json` và `pnpm models:update` để kế hoạch 07 (cần khóa của chủ dự án).
6. **Khởi động lại và quá tải:** chạy lại sau 1 s, 2 s; chết lần thứ 3 thì tắt tới hết phiên. Quá tải = còn đoạn chưa có nhãn
   liên tục 30 s (kể cả worker treo): tắt tới hết phiên, không chạy lại.
7. Giọng của phụ đề = giọng nhiều thời lượng nhất trong một nhóm đoạn; phụ đề gồm hai nhóm đã biết khác giọng thì không nhãn.
8. Sự kiện `subtitle://speaker`, `speaker://roster`, trường `speaker` trong `subtitle://upsert` và `subtitle://live`; `label`,
   `color` để kế hoạch 03.
9. `embed_windowed` giữ lại chỉ để chạy lại số đo của kế hoạch 01.
10. Kết quả đo ở `results/02-*.md`. 11. Đóng gói, CI kiểm không mã mạng, đo: file 02b.
12. **Hàng đợi dịch gộp câu khác giọng khi tồn đọng, câu gộp không nhãn.** `merge_runs` gộp hai lượt: lượt 1 gộp các dãy cùng
    giọng (hay chưa biết giọng); nếu sau lượt 1 hàng còn **nhiều câu hơn số câu mà cách gộp lúc TẮT để lại**
    (`MtQueue::runs_when_off`) thì lượt 2 gộp như khi tắt, kể cả câu khác giọng, và câu gộp lẫn giọng không mang nhãn. Nhờ đó
    hàng đợi dịch không bao giờ dài hơn, câu không chờ lâu hơn và không thêm câu `Skip` so với khi tắt (test, mô phỏng, đo ở dòng
    6). Hệ quả: luật "không gộp hai giọng khác nhau" (spec §4.4) chỉ còn đúng khi dịch kịp, hoặc khi dãy câu gộp được chỉ có một
    giọng. Ưu tiên 1 (tốc độ) hơn ưu tiên 2 (đúng tên). Bản chữ cũ "tồn ≥ 2 × `mt_max_waiting` mới gộp khác giọng" đã bỏ.
13. **Thử quyền Trợ năng với binary `speaker-worker` thật dời sang kế hoạch 04** (02 chưa có bộ đọc tên). Spec §6.2 đã ghi đúng
    điều này (kiểm ngày 2026-10-27).
14. **Kênh nhãn có giới hạn:** 256 cập nhật, đầy thì coi worker chết; luồng phụ đề xử lý tối đa 64 cập nhật mỗi vòng.
15. Cờ nguồn thiếu không làm kẹt âm thanh (đệm `System`, log một lần mỗi phiên).

## Điều cần chủ dự án quyết

1. **Ngân sách RAM ≤ 250 MB (spec §11).** Gửi đoạn liền nhau (02b Task 2) thì RSS đỉnh lên 259,8 MB (cv-vi-05 Opus) và 251,5 MB
   (ES2004a.Array1-01): vượt. Phát theo thời gian thực như app (kiểm bổ sung trên đúng hai bản ghi đó, và soak 92 phút) thì đỉnh
   chỉ 137–198 MB, không rò. **Đề nghị:** chấm ngân sách RAM theo thời gian thực (đạt, biên ≥ 52 MB), ghi số gửi liền nhau để
   biết. Lưu ý (`02-soak.md`): khi worker vừa bị chậm, các đoạn tồn có thể tới worker gần liền nhau; ca này chưa đo riêng.
2. **Ngân sách CPU ≤ 8% một lõi.** Theo %CPU: vượt ở tiếng Việt gửi liền nhau (8,3–8,6%) và ở soak (8,55% trên đoạn IS1009a, 9,46%
   cả lượt). Theo việc thật: cùng bản ghi, soak và gửi liền nhau có cùng số lệnh (1,445 so với 1,448 tỉ mỗi giây tiếng nói) và
   cùng năng lượng (443 so với 446 mJ), chỉ khác xung nhịp (3,46 so với 4,01 GHz). **Đề nghị:** diễn giải ngân sách theo số lệnh
   và năng lượng (như spec §6.8 đã làm với Teams, Chrome), mốc M4 Pro khoảng 1,45 tỉ lệnh và 445 mJ mỗi giây tiếng nói. Cần chủ
   dự án chốt cách hiểu; không tự đổi ngân sách.
3. **A-spk4:** đạt với khoảng cách lớn; lượt bật nhanh hơn chưa rõ vì sao (nghi xung nhịp). Đề nghị: ghi "bật không làm chậm",
   không công bố "bật làm nhanh hơn".
4. **Phiên bản `libc` 0.2.189 → 0.2.191 và `sha2` 0.11.0 → 0.11.1** (lệch quy tắc "bản ổn định mới nhất"): đang giữ bản workspace;
   đề nghị nâng ở đợt cập nhật phụ thuộc của kế hoạch 07, rồi build và test lại toàn workspace.
5. **Số lần chạy lại worker:** mặc định 2 lần (sau 1 s, 2 s), tắt ở lần chết thứ 3. Muốn đủ 1, 2, 5 s thì `max_deaths = 4`.
6. **Kích thước gói:** không vượt (~10,99 MB và ~22,16 MB so với 60 MB); không cần quyết.
7. **Duyệt các quyết định thiết kế** ở mục trên, nhất là QĐ 12 (gộp câu khác giọng khi tồn đọng, câu gộp không nhãn), QĐ 13 (thử
   Trợ năng dời sang kế hoạch 04) và QĐ 14 (kênh nhãn có giới hạn); cùng giao thức tối thiểu, cờ dev, model chưa đăng R2, khởi
   động lại và quá tải.
8. **Cho phép commit** phần đã làm của tính năng chưa (đang để ở working tree).

## Còn mở

- **A-spk4 và hàng đợi dịch khi dịch chậm mới đo trên M4 Pro.** Máy yếu nhất là Windows i5 4 lõi; nghiệm thu độ trễ trên i5 ở kế
  hoạch 05/07 (Task 8 chỉ đo `speaker-eval`).
- **Windows i5 (02b Task 8):** chờ chủ dự án chạy `win-pack-02.zip`; RAM của B' và allocator Windows, CPU (≤ 10% một lõi), độ
  chính xác, phần UI Automation của kế hoạch 01.
- **Đăng model** lên R2, mục `speaker` của `models.json`, `pnpm models:update`, LICENSE/NOTICE: kế hoạch 07.
- **Thử app dev (file 02 Task 19 Step 4):** chưa chạy.
- **Bộ trộn `audio-capture` luôn gắn cờ nguồn kể cả khi tính năng tắt:** chi phí một `push` và vài phép nhân, cộng mỗi mẫu 16 kHz;
  chưa đo riêng (A-spk4 đo cả đường khi tắt và bật nên không thấy chậm, nhưng không tách được phần này).
- **`release.yml`:** job `macos-app` (dòng 188) và `windows-app` (dòng 392) chỉ chạy `-- pro:: license::`, không có `speaker::`
  (`ci.yml` có, cùng `diagnostics::`). Thêm ở kế hoạch 07, vì `speaker::` có test cổng `release_builds_never_enable_speaker`.
- **Ngoài phạm vi nhưng đáng biết:** footprint của `llama-server` tăng 288 → 2 627 MB trong 92 phút soak (RSS giữ 2,07–2,23 GB);
  nghi bộ nhớ đệm prompt, chưa kiểm. Lượt tắt nhận giọng cũng có `llama-server` như nhau. Có thể đáng lo cho buổi họp dài.
- Khứ hồi biên mỏng: gửi liền nhau chậm nhất 224,3 ms; chạy cùng hai tiến trình phụ thì 2,4–3,4% số đoạn quá 230 ms (luật đúng cả
  khi nhãn muộn).
- A2 4 s chưa được thử trên tiếng Việt nói liền với đoạn dài (dữ liệu hiện có toàn đoạn ngắn).
- Vì sao RSS theo thời gian thực thấp hơn gửi liền nhau: giả thuyết allocator thu hồi trong khoảng lặng, chưa kiểm (`vmmap`).

## Ghi cho kế hoạch 03 và 04

**Kế hoạch 03 (giao diện, dữ liệu):**

- Dòng đang nói mang nhãn của câu nó nối tiếp (`extends`), kể cả khi người khác vừa chen vào: đó là cách hiện tại; xét lại khi vẽ
  nhãn.
- Tải model nhận giọng giữ khóa bảo trì (`begin_work`): trong lúc đó bấm tải gói model sẽ gặp `modelsBusy` mà giao diện không hiện
  gì. Phải xử lý trước khi bật sẵn cho mọi người. Spec §4.5 "tải cùng gói model đang dùng" chưa có Task nào.
- Bấm Dừng có thể mất nhãn của vài đoạn cuối (đoạn còn chờ worker khi phiên dừng).
- `label`, `color`, `source` của bảng người nói, chữ "Người N" ở 5 ngôn ngữ, cài đặt `speakerDiarization` thay cờ dev, Lịch sử,
  xuất file (mục "Để kế hoạch sau" của file 02).

**Kế hoạch 04 (đọc tên macOS):**

- Khi `Ready` thêm trường ở 04 (`reader_platform`), app gặp worker lệch phiên bản sẽ báo khung hỏng chứ không báo lệch phiên
  bản. Gợi ý: app đọc hai varint đầu (chỉ số biến thể, `protocol_version`) trước khi giải mã đủ.
- Thử quyền Trợ năng với binary `speaker-worker` thật (QĐ 13).
- `Speech`, `SetNames`, `ReaderState`, tên trong `VoiceInfo`, `participants`; bậc "tạm dừng đọc tên" khi quá tải; tách giọng bị
  gộp theo tên.

## Mốc kiểm cuối (02b Task 9 Step 4)

Chạy ngày 2026-10-27 trên bản làm việc hiện tại (`CARGO_INCREMENTAL=0`, máy tải 2,3–3,9; đĩa trống 20,17 GiB trước, 20,06 GiB sau):

- `cargo fmt --all -- --check`: sạch. `cargo clippy --workspace --all-targets -- -D warnings`: `Finished`, 0 cảnh báo.
- `cargo test -p speaker-protocol -p speaker-worker -p audio-capture -p pipeline -p latency-bench`: **746 đạt, 0 lỗi, 14 bỏ qua**
  (`#[ignore]`, cần model hay chạy tay), 28 nhóm test đều `ok`.
- `cargo test -p meeting-translator --lib`: **865 đạt, 0 lỗi, 6 bỏ qua**.
- Test `#[ignore]` với model thật (`SPEAKER_MODEL=…eres2net-sv-en-voxceleb-16k.onnx RAYON_NUM_THREADS=2 cargo test -p speaker-worker
  --lib -- --ignored`, bản debug): **3 đạt** trong 144,4 s (`steps_match_simple_eval_on_the_real_model`,
  `embedding_matches_onnxruntime`, `windowed_embedding_against_the_whole_segment`): câu 1 đạt trên mã hiện tại.
- `node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs` (Node 24.21.0): **105 đạt, 0 lỗi**.
- `scripts/release/check-no-network.sh`: "không có mã mạng: speaker-worker speaker-protocol (cây phụ thuộc hai nền tảng, feature
  Windows, mã nguồn)"; thêm `--binary target/release/speaker-worker`: sạch.
- `git status --short`: chỉ có file của kế hoạch 01, 02, 02b (83 dòng, không đổi so với trước Task này ngoài nội dung ba file của
  Task này). Không commit.

## Chạy lại

Lệnh đầy đủ ở mục "Chạy lại" của từng file: `02-nhan-giong-worker.md` (`speaker-eval --worker`, kể cả phần thời gian thực),
`02-do-tre.md` (`session --speaker-worker --speaker-model`, quá tải `--mt-extra-ms`), `02-soak.md` (`session … --rss-trace`,
`tro-nang/rus`), `02-windows.md` (dựng bằng mingw-w64, gói Windows). Bảo mật: `scripts/release/check-no-network.sh --binary
target/release/speaker-worker speaker-worker speaker-protocol`, `cargo deny check`, `cargo audit`. Test giống từng bit:
`SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx RAYON_NUM_THREADS=2 cargo test -p speaker-worker -- --ignored`.
