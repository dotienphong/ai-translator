# Báo cáo Phase 0 (spike S1–S7)

Ngày: 2026-10-04. Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

Phạm vi đo: một máy duy nhất, MacBook Pro M4 Pro 24 GB, macOS 26.6.2. Không có số đo nào trên Windows, trên M1, hay trên máy tối thiểu (xem "Việc chưa kiểm").

## Kết luận

- **Cổng §13 chưa thỏa đầy đủ**, vì thiếu số liệu: S2, S3 và S5 trên Windows chưa làm; S6 mới đo trên M4 Pro; điều kiện p50 ≤ 3,5 giây trên máy tối thiểu chưa đo.
- **Mọi điều kiện đã đo đều đạt**: S1 và S4 đạt; 12/12 session S6 trên M4 Pro đạt A2 với dư địa khoảng gấp đôi; COMET đạt mức sàn A3 ở cả hai gói. Không có kết quả nào cho thấy phải sửa hướng thiết kế.
- **Chốt 2026-10-07: Phase 0 xong.** Chủ dự án báo đã thử trên Windows và đạt các mục Windows còn lại (S2 dòng 4–10, S5, S3 Task 16), xem mục "Chốt Phase 0" ở cuối. Chỉ còn chữ ký Developer ID, chủ dự án mua sau.
- **PHONG duyệt ngày 2026-10-04: qua cổng có điều kiện.** Phase 1 bắt đầu, và các mục chưa kiểm ở mục "Việc chưa kiểm" phải được đo khi có thiết bị. Trước khi phát hành bản beta đầu tiên, các mục có đánh dấu **(chặn phát hành)** phải xong. Rủi ro chính của đề xuất này: spec có thể phải sửa lại nếu máy yếu hơn không đạt (mục "Quyết định cần duyệt").
- **Quyết định cần ghi vào spec:** đã ghi ở Task 2 (commit `e181e1d`, `f5e2853`), gồm chế độ giải mã B làm mặc định, sàn `audio_ctx` 512, LID đoạn ngắn, luật lặp, luật `no_speech`, flash attention tắt, và các mục "chờ kết quả" của Windows và máy tham chiếu.

## Cổng §13

| Điều kiện | Kết quả | Bằng chứng |
|---|---|---|
| S1–S5 chạy được | **Chưa đủ.** S1 đạt (Mac); S3 đạt trên Mac; S4 đạt; S5 đạt trên Mac (người chạy xác nhận); S2, S3 Windows và S5 Windows chưa làm | `results/s5_overlay.md`, xem bảng giả định, "Việc chưa kiểm" |
| p50 ≤ 2,0 giây trên máy khuyến nghị, kể cả M1 cơ bản 16 GB | **Đạt trên M4 Pro** (p50 lớn nhất 1028 ms). M1 chưa đo | `results/latency/m4pro-chot-*.json` |
| p50 ≤ 3,5 giây trên máy tối thiểu | **Chưa đo** | không có |
| COMET Anh→Việt: Q8_0 ≥ 0,83, Q4_K_M ≥ 0,80 | **Đạt**: Q8_0 0,842 (dư 0,012), Q4_K_M 0,841 (dư 0,041) | `results/s7_mt_decisions.md` |

## Giả định ở §14

| # | Giả định | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Core Audio tap thu được Zoom, Meet, Teams; quyền hoạt động với app đã ký, không sandbox | **Đạt** trên macOS 26.6.2 (Zoom, Meet trên Chrome/Safari/Edge, Teams, Zalo PC; tap theo `--pid`; tai nghe có dây và AirPods). Chữ ký ad-hoc kèm hardened runtime, không entitlement. Chưa kiểm: đổi thiết bị phát giữa chừng, chữ ký Developer ID | `results/s1_capture.md` |
| 2 | Endpoint loopback thu được Teams, kể cả thiết bị Communications | **Chưa kiểm** (cần máy Windows, kế hoạch 04 Task 7–8) | không có |
| 3 | Chat template trong GGUF dùng được với `/v1/chat/completions` | **Đạt** (`pass: true` cả hai file; token và template khớp bản tham chiếu `tencent/Hy-MT2-1.8B`; stream khớp completion; dừng đúng ở EOS) | `results/s4_template_Hy-MT2-1.8B-Q4_K_M.json`, `…-Q8_0.json` |
| 4 | Whisper turbo kịp thời gian thực trên M1 16 GB và card rời 6 GB | **Chưa kiểm.** Trên M4 Pro (Metal) turbo kịp: nhận dạng p50 229–254 ms | `results/latency/m4pro-chot-*.json` |
| 5 | Độ trễ đạt ngân sách §8 | **Đạt trên M4 Pro**: p50 764–1028 ms (Chuẩn), 613–844 ms (Nhẹ); p90 lớn nhất 1341 ms; chữ đầu p50 lớn nhất 686 ms. Máy khác chưa đo; spec ước tính M1 cơ bản nhiều khả năng không đạt với Q8_0 | `results/latency/m4pro-chot-*.json` |
| 6 | Q4_K_M giảm COMET ≤ 0,02 so với Q8_0 | **Đạt**: Anh→Việt −0,0004 [−0,009; +0,007]; không chiều nào giảm quá 0,02 (lớn nhất −0,015 ở ja→vi và vi→zh) | `results/s7_mt_decisions.md` |
| 7 | PayOS (không thuộc spike kỹ thuật) | **Kiểm một phần** (2026-10-01): PayOS không có sandbox, test bằng giao dịch nhỏ trên staging. Các mục còn lại ở kế hoạch Phase 1 · 05 | spec §14 mục 7 |
| 8 | Rút ngắn `audio_ctx` làm WER tăng ≤ 10% | **Không đạt theo từng ô.** Cấu hình mặc định: 5/10 ô vượt (turbo en, vi, zh, ko; small ko); bỏ bản chép hai lần còn 3/10. Với sàn 512: 3/10 ô vượt trên cùng bản build; ba ô này nằm ở clip dài hơn 9 giây, còn đoạn của app dài tối đa 8 giây. Sàn 512 giảm tổng lỗi (turbo −6,4%, small −1,5%) | `results/s7_asr.md`, `results/phase0_review_notes.md` |
| 9 | Chi phí nhận diện ngôn ngữ < 20% thời gian nhận dạng | **Đạt với chế độ B**: 0–2% thời gian chép lời. Chế độ A không đạt (small 11–19%, turbo 24–36%) | `results/s3_ab.md` |
| 10 | Truyền âm thanh qua stdin/stdout thêm ≤ 10 ms mỗi đoạn | **Đạt trên M4 Pro**: p50 0,4–0,9 ms, lớn nhất 2,9 ms. Chỉ có số ghi trong spec §6.4, không có file kết quả riêng | spec §6.4 |
| 11 | `transactionDateTime` của PayOS là giờ Việt Nam | **Đạt** ngày 2026-10-05: giao dịch thật 50.000 đ trên production, `paid_at` = 11:37:40 giờ Việt Nam, khớp giờ chuyển khoản | `bench/phase1/results/gd1_production_deploy.md` |

## Độ trễ và tài nguyên (S6)

Máy: Mac M4 Pro, cấu hình chốt (sàn 512, LID đoạn ngắn, luật lặp, ghép câu bật), 6 session mỗi gói. Cả 12 session đạt A2.

| Gói | p50 | p90 | Chữ dịch đầu, p50 | Nhận dạng p50 | Dịch p50 |
|---|---|---|---|---|---|
| Chuẩn (turbo + Q8_0) | 764–1028 ms | 940–1341 ms | 631–686 ms | 229–254 ms | 143–404 ms |
| Nhẹ (small + Q4_K_M) | 613–844 ms | 725–1142 ms | 517–565 ms | 90–139 ms | 119–281 ms |

- RAM đỉnh của hai tiến trình phụ (chưa tính app và WebView): Chuẩn 2909–3012 MiB (`asr-worker` 780–788, `llama-server` 2125–2225); Nhẹ 1861–1917 MiB.
- CPU cả máy 1,8–3,0%, vì GPU (Metal) làm phần nặng. Cột "Gói Nhẹ, chỉ CPU" của bảng ngân sách §8 chưa được đo.
- Dung lượng tiến trình phụ trong bộ cài macOS: 27,5 MB (nén lzma 7,7 MB), chưa tính model (`results/s3_size_macos-arm64.json`).
- Số này chỉ đại diện cho máy băng thông cao. M4 Pro không phải máy quyết định cổng.

## Chất lượng (S7)

**Dịch** (COMET, lượt không ngữ cảnh, `results/s7_mt_decisions.md`):
- Q8_0 từ 0,821 (vi→en) đến 0,851 (vi→ko); Q4_K_M từ 0,815 (ja→vi) đến 0,845 (vi→ja). Các số này là mốc chống thụt lùi của A3.
- Ngữ cảnh câu trước (§6.5): **giữ tắt**. Q8_0 tệ hơn có ý nghĩa ở cả 8 chiều (−0,035 đến −0,186) và có 325/538 câu nghi lẫn mẫu; Q4_K_M không chiều nào tốt hơn có ý nghĩa.
- Ngưỡng tỉ lệ token cho hậu xử lý đã đo cho 8 chiều; zh→vi bị một câu gốc 4 token kéo lên 6,6. Ngưỡng cho 12 chiều đã được áp vào spec (commit `22fa4fe`).

**Nhận dạng** (A4, FLEURS dev, 548 clip, chế độ B). Bảng dưới là mốc của cấu hình mặc định cũ, trước khi thêm sàn 512 và luật lặp mới (`results/s7_asr.md`). Mốc của cấu hình chốt nằm ở `results/a4_m4pro-{turbo,small}-final.json` và không chép lại ở đây:

| Ngôn ngữ | Chỉ số | Chuẩn (turbo) | Nhẹ (small) |
|---|---|---|---|
| en | WER | 0,062 | 0,066 |
| vi | WER | 0,103 | 0,224 |
| zh | CER | 0,059 | 0,104 |
| ja | CER | 0,045 | 0,131 |
| ko | CER | 0,062 | 0,082 |

- Chế độ B tốt hơn A ở cả 10 ô. A nhận sai ngôn ngữ (tiếng Nhật chỉ đúng 74–77%) và chạy vòng lặp; B nhận đúng 548/548 clip.
- Gói Nhẹ kém rõ ở vi (WER gấp 2,2 lần), ja (CER gấp 2,9 lần), zh (gấp 1,8 lần). Cần ghi chú khi chọn gói (§8).
- Băng hẹp làm lỗi tăng ở hầu hết ô, rõ nhất ở en (+46% đến +79%) và ja (+19% đến +42%).
- Còn việc cho người dùng: nghe lại 24 clip có chú thích Latin (zh 16, ja 3, ko 5) và sửa bản chuẩn nếu cần, vì A4 đòi bản chép đã được người kiểm (danh sách id ở `results/s7_asr.md`).
- Các số chỉ có một nguồn hoặc cách đo không rõ được liệt kê ở `results/phase0_review_notes.md`.

## Việc chưa kiểm

Các mục này **chưa có số đo**, vì thiếu thiết bị hoặc tài khoản. Chúng không phải kết quả "không đạt".

| Mục | Lý do | Ảnh hưởng | Mức |
|---|---|---|---|
| S2 và các task Windows: 01-T2, 03-T14..17, 04-T7..8 | Chưa làm trên máy Windows | Giả định 2, kết luận S3 trên Windows, build Windows | **chặn phát hành** |
| S5 trên Windows: thanh phụ đề nổi trên app toàn màn hình (05-T4) | Chưa làm trên máy Windows. Phần Mac (05-T2 Step 9, T3) đã thử, xem `results/s5_overlay.md` | §4.4 trên Windows | **chặn phát hành** |
| S6 trên M1 16 GB (06-T8..9) | Không có máy | Hạng máy khuyến nghị trên Mac (§8) | cần trước khi chốt hạng máy |
| S6 trên Windows card rời 6 GB và 4 GB | Không có máy | Ngưỡng VRAM 6 GB (§6.7, §8), giả định 4 | cần trước khi chốt hạng máy |
| S6 trên Windows 8 GB chỉ CPU (máy tối thiểu) | Không có máy | Điều kiện p50 ≤ 3,5 giây của cổng §13 | cần trước khi chốt hạng máy |
| S1 dòng 9: đổi thiết bị phát giữa chừng | Không ghi kết quả quan sát | Cách MVP khởi tạo lại tap (§6.1) | kiểm lại ở Phase 1 |
| S1 dòng 10: chữ ký Developer ID | Chưa có tài khoản Apple Developer | Ký, notarize bản phát hành (kế hoạch 1-07a) | **chặn phát hành** |
| Giả định 11: múi giờ `transactionDateTime` PayOS | Cần giao dịch thật trên staging | §6.8 | Phase 1 · 05 |

## Quyết định (PHONG duyệt 2026-10-04)

1. **Có qua cổng không?** **Qua có điều kiện.** Phase 1 bắt đầu. Các mục ở "Việc chưa kiểm" được đo khi có thiết bị; mục đánh dấu **(chặn phát hành)** phải xong trước bản beta đầu tiên. Rủi ro đã chấp nhận: spec có thể phải sửa lại nếu máy yếu hơn không đạt.
2. **M1 cơ bản không đạt thì chọn phương án nào ở §8?** **Bỏ qua**, vì không có máy M1 để đo. M1 cơ bản giữ trạng thái "chưa xác nhận" (spec §8). Hai phương án ở §8 (nâng hạng khuyến nghị lên M2 trở lên, hoặc dùng Q4_K_M cho bước dịch trên máy băng thông thấp) chỉ chọn khi có số đo, ví dụ từ người thử beta dùng M1.
3. **Ngưỡng VRAM 6 GB cho đề xuất gói Chuẩn trên Windows.** **Giữ nguyên 6 GB** như đã duyệt 2026-10-02 (ước tính 4,2–5 GB cho gói Chuẩn). Ghi là "chờ đo" và đo lại khi có máy.

## Việc phát sinh

- **Từ chối quyền thu âm thanh trên macOS không báo lỗi**, chỉ cho dữ liệu toàn số 0 (S1 dòng 2). MVP (§9) phát hiện thiếu quyền bằng im lặng kéo dài khi biết có app đang phát, và hiện hướng dẫn cấp quyền.
- **Hardened runtime**: `tccd` ghi lỗi về entitlement `audio-input` của dịch vụ Microphone, nhưng không ảnh hưởng thu bằng tap (dịch vụ AudioCapture). Không cần thêm entitlement `audio-input` cho app thu âm thanh hệ thống.
- **`no_speech_prob` với turbo luôn khoảng 1e-11**, nên bộ lọc §6.4 không bao giờ kích hoạt. MVP cần bộ lọc câu ảo giác quen thuộc, và phép thử trên im lặng, nhiễu và nhạc.
- **Lặp đôi** (model chép cả câu hai lần): luật 2 bản bắt được 3 clip trong A4 nhưng đổi lại lời nói lặp thật từ 16 token trở lên chỉ hiện một lần (6/80 cặp thử). Xem lại ở MVP.
- **Ghép câu zh và ja**: Whisper gần như không đặt dấu câu cuối câu cho hai tiếng này, nên luật ghép nối nhầm khoảng 7/18 lần với zh. Cần dữ liệu hội thoại thật để chọn luật tốt hơn.
- **Lần đầu chạy một binary mới trên macOS** mất khoảng 15 giây kiểm tra. Thời gian chờ `/health` phải từ 30 giây trở lên, và giao diện báo "đang chuẩn bị lần đầu". Đo lại với bản đã ký và notarize.
- **Số dùng trong spec chỉ có một nguồn** (flash attention 5–13%, 15 giây kiểm tra, LID đoạn 1 giây, luật lặp, `avg_logprob` −0,25): xem `results/phase0_review_notes.md`.
- Việc cho Phase 1: danh sách "việc cho MVP" ở spec (Task 2 của kế hoạch 00), gồm giao thức `asr-protocol`, Job Object và process group cho tiến trình phụ, và các mẫu `.gitignore` cho khóa ký trước khi tạo `server/`.

## Cập nhật 2026-10-07: số đo trên Windows (i5-1345U, Iris Xe, 32 GB)

Không đổi quyết định đã duyệt ngày 2026-10-04. Chỉ ghi thêm số đo và các mục còn mở. Máy này là laptop Windows có GPU tích hợp, không phải máy tham chiếu nào trong kế hoạch.

| Mục | Trạng thái | Chi tiết |
|---|---|---|
| S3 trên Windows: build hai bản `asr-worker`, `--probe`, thư viện nạp, chép lời Vulkan và CPU, VAD đúng nhịp, dung lượng | **Làm xong trên máy này** | `results/s3_windows.md`. Mới đo trên GPU tích hợp, chưa có card rời. Task 16 (máy không có Vulkan) và Task 17 (`s3_lid.md`) chưa làm |
| S2 trên Windows | **Một phần** | `results/s2_capture.md`: dòng 1–3 đạt về số đo; dòng 4–10 cần Teams, Zoom, Meet, Zalo và tai nghe Bluetooth **trên Windows**. Chủ dự án báo đã thử các app này trên MacBook (đạt), nhưng đó là S1 của macOS, không thay được S2. Giả định 2 vẫn **chưa kiểm** (chặn phát hành) |
| S5 trên Windows | **Chưa làm** | Cần người nhìn thanh phụ đề trên app toàn màn hình (chặn phát hành) |
| S6 trên Windows | **Một phần** | `results/s6_windows.md`: iGPU Chuẩn và Nhẹ, và CPU Nhẹ. Chủ dự án quyết định (2026-10-07) **bỏ qua** máy tối thiểu 8 GB chỉ CPU, card rời 6 GB và 4 GB, M1, vì không tìm được máy; các mục này giữ trạng thái chưa đo, chỉ đo khi có số từ người thử beta |

Phát hiện mới, cần xử lý trước khi phát hành:

- **`asr-worker` build trên Windows (MSVC) không được tối ưu.** Crate `cmake` ghi đè mất `/O2 /Ob2 /DNDEBUG`, làm chép lời bằng CPU chậm khoảng 14 lần (`small`: 26 giây thay vì 1,8 giây cho clip 11,5 giây). Đã sửa bằng bản vá `third_party/patches/0003-whisper-rs-sys-msvc-optimization-flags.patch`; CI phát hành (`build-sidecars-windows.mjs`) cần build lại bằng bản đã sửa, và nên kiểm `CMAKE_C_FLAGS_RELEASE` trong `CMakeCache.txt` có `/O2`. Chưa chạy CI để xác nhận.
- **Đường dẫn quá dài làm hỏng build CMake** (`FTK1011` ở `target\...\whisper-rs-sys-<hash>\out\build\...`) dù `LongPathsEnabled = 1`. Cần kiểm thư mục làm việc của runner Windows.
- **`--probe` trên GPU tích hợp báo `device_local_bytes` bằng cỡ RAM** (17 GB trên máy 32 GB), nên đề xuất gói theo VRAM (§6.7) phải xét `device_type`.
- **`crates/asr-worker/src/probe.rs` chưa có trong repo** dù `main.rs` và `Cargo.toml` đã trỏ tới nên bản build có feature `vulkan` không biên dịch được. Đã tạo file (chưa commit).
- **Gói Chuẩn trên Iris Xe không đạt A2** (p50 2,7–5,4 giây; bước dịch là nút thắt). Gói Nhẹ chỉ CPU đạt ngưỡng 3,5 giây ở 5/6 session trên máy mạnh hơn máy tối thiểu, nên điều kiện của cổng §13 vẫn chưa được xác nhận.

## Chốt Phase 0 (2026-10-07)

Chủ dự án báo ngày 2026-10-07: đã tự thử trên máy Windows và **đạt** các mục Windows còn lại. Không kèm log hay ảnh.

| Mục | Trạng thái |
|---|---|
| S2 dòng 4–10: Teams, Zoom, Meet (Chrome, Edge), Zalo PC, tai nghe Bluetooth, rút tai nghe, Windows 10 | Đạt (chủ dự án báo). Giả định 2 coi là đạt |
| S5 trên Windows: thanh phụ đề nổi trên app toàn màn hình (0-05 Task 4) | Đạt (chủ dự án báo) |
| S3 Task 16: Windows không có Vulkan, `asr-worker-cpu` chạy thay | Đạt (chủ dự án báo) |
| S1 dòng 10 và mọi việc cần chữ ký Developer ID | **Còn lại duy nhất.** Chưa có tài khoản Apple Developer; chủ dự án mua sau. Tới lúc đó bản macOS ký ad-hoc (`docs/superpowers/specs/2026-10-05-macos-adhoc-signing-design.md`) |

Các mục bỏ qua vì không có máy (S6 trên M1 16 GB, card rời 6 GB và 4 GB, máy 8 GB chỉ CPU; S1 dòng 9) giữ trạng thái chưa đo, không tính là nợ của Phase 0. Lượt fullctx chạy lại (C12) không chặn việc nào nên không làm.

Các phát hiện ở mục "Cập nhật 2026-10-07" đã xử lý: bản vá MSVC `0003` có trong repo, `probe.rs` đã commit, đề xuất gói xét `device_type` (`src-tauri/src/models/machine.rs`), máy chỉ có GPU tích hợp chạy `llama-server` bằng CPU (`69d35f3`).
