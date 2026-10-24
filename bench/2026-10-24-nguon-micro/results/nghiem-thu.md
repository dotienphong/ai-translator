# Nghiệm thu nguồn micro (spec 2026-10-24-nguon-micro §11, §16)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-04-phat-hanh.md`. Commit ứng viên: `3dd31026` (mã app và
`crates/` không đổi từ `7660fece`).

## Offline (Task 7): A4-mic, A-trộn, A-ảo

**Kết quả: đạt cả ba**, số khớp đúng mốc đã chốt ở spec mục 16.

Điều kiện:
- MacBook Pro M4 Pro, macOS 26.6.2.
- `latency-bench mix-eval` chạy trên bản thu của spike (`data/scenes/`). `mix-eval` dùng chính `mic_chain::Limiter` và
  `duck::DuckingMixer` của app.
- `asr-worker` build như bản phát hành macOS: `MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p asr-worker
  --features metal,shared-encode`.
- Phương án của app: `CHOT2-mic` (chế độ micro, lọc ồn bật), `MOI-rnn-m600` (chế độ trộn). Định nghĩa trong
  `variants/chot-moi.json`, `both-chot-moi.json`.
- Mô hình: `ggml-large-v3-turbo-q5_0` (gói Chuẩn), `ggml-small-q5_1` (gói Nhẹ).
- Chấm bằng `score_mix.py`; riêng cảnh giọng thật dùng `score_doc.py`.

| Tiêu chí | Cảnh | Mốc | Mức đạt | Đo được | Kết quả |
|---|---|---|---|---|---|
| A4-mic giọng thật 1 m, Chuẩn | `doc-vi-1m` | lỗi 44,7% | ≤ 49,2% | 44,7% | Đạt |
| A4-mic giọng thật 1 m, Nhẹ | `doc-vi-1m` | 52,0% | ≤ 57,2% | 52,0% | Đạt |
| A4-mic điện thoại 1 m, Chuẩn | `s4-1m` | lỗi 30,0%, giữ 84% | ≤ 33,0%, ≥ 76,4% | 30,0%, 84% | Đạt |
| A4-mic điện thoại 1 m, Nhẹ | `s4-1m` | 39,3%, 76% | ≤ 43,2%, ≥ 69,1% | 39,3%, 76% | Đạt |
| A4-mic điện thoại 3 m, Chuẩn | `s4-3m` | lỗi 54,9%, giữ 44% | ≤ 60,4%, ≥ 40,0% | 54,9%, 44% | Đạt |
| A4-mic điện thoại 3 m, Nhẹ | `s4-3m` | 62,4%, 40% | ≤ 68,6%, ≥ 36,4% | 62,4%, 40% | Đạt |
| A4-mic phòng ồn, Chuẩn | `s7-on` | giữ câu ngắn 39,5%, lỗi 69,9% | ≥ 35,9%, ≤ 76,9% | 39,5%, 69,9% | Đạt |
| A4-mic phòng ồn, Nhẹ | `s7-on` | 42,1%, 73,5% | ≥ 38,3%, ≤ 80,9% | 42,1%, 73,5% | Đạt |
| A-ảo | `s6-on` (18,3 phút) | ≤ 1 câu / 10 phút | ≤ 1 | 1 câu = 0,55 / 10 phút (cả hai gói) | Đạt |
| A-trộn | `s1-loa` (5,4 phút) | online 9,8%, phòng 5,2% | ≤ 10,78%, ≤ 5,72% | 9,0%, 5,2% (hai lượt liên tiếp, giống nhau) | Đạt |

Theo dõi, không phải mức đạt:
- Lọc ồn tắt (`CHOT2-khong-m250`), gói Chuẩn: giọng thật 1 m 36,7%; điện thoại 1 m 30,4% / 76%; 3 m 71,2% / 36%; phòng ồn
  không còn câu nào. Khớp `gioi-han-muc.md`.
- Cảnh tiếng ù (`thu-tay-u`): giống lần chốt.

**Lượt đo đầu bị hỏng, đã bỏ.** Lần đầu, `asr-worker` được build không có `--features metal`, nên whisper chạy trên CPU
(BLAS) thay vì GPU Metal. Cùng dữ liệu và cùng mã chuỗi micro mà:
- giọng thật 1 m (gói Chuẩn) lên 52,7%;
- lỗi câu online ở cảnh trộn lên 16,7%, do một câu tiếng Hàn bị lặp đuôi khoảng 12 lần.

Dựng lại `asr-worker` đúng như bản phát hành thì mọi số về đúng mốc. Ghi nhận: kết quả whisper trên CPU khác GPU đủ để làm
sai mốc nghiệm thu. Máy Windows không có GPU dùng được sẽ chạy đường CPU và có thể cho số khác các mốc này. Các mốc đều đo
trên Metal.

## Giấy phép (Task 6)

- `cargo deny check` (cargo-deny 0.20.2): `advisories ok, bans ok, licenses ok, sources ok`.
- `scripts/release/notices.mjs --no-llama` thoát 0. THIRD_PARTY_NOTICES có `nnnoiseless 0.5.2` (BSD-3-Clause) kèm bản quyền
  Joe Neeman, Mozilla, Jean-Marc Valin, Xiph.Org Foundation, Mark Borgerding.
- Test notices: 80 (script) và 3 (app) đạt.

## A2 (Task 8)

**Kết quả: đạt.** Phần do trộn và micro gây ra không làm chậm thêm (dưới 100 ms, thực tế không chậm hơn).

Điều kiện:
- MacBook Pro M4 Pro, macOS 26.6.2, loa tích hợp 60%, micro tích hợp.
- Bản dev từ commit `392cb1d6`, đóng gói bằng `scripts/run-dev-app.sh`, ký "Apple Development". Công tắc Pro của bản dev bật.
- Nội dung chỉ có track online: 100 giây đầu `online.wav` của cảnh `s1-luot` (5 câu: en, ja, vi, zh, zh). Track phát bằng
  `OnlinePlayer.app`; nguồn đặt là "Chỉ" app đó. Không phát track trong phòng, để mọi lượt cùng nội dung.
- Dịch sang tiếng Việt, gói Chuẩn. Số đo lấy từ dòng "kết thúc phiên dịch" trong log của app, ngày 2026-10-24 lúc
  23:49–00:01.

| Lượt | Chế độ | Ngắt câu | Đoạn | Cắt đoạn p50 | Nhận dạng p50 | Dịch p50 | Tổng p50 | Tổng p90 |
|---|---|---|---|---|---|---|---|---|
| 1 | Âm thanh máy | 50 ms (mặc định) | 19 | 64 ms | 219 ms | 220 ms | 448 ms | 723 ms |
| 2 | Âm thanh máy + Micro | 500 ms (khóa) | 8 | 512 ms | 236 ms | 487 ms | 1 056 ms | 1 344 ms |
| 3 | Âm thanh máy | 500 ms (đặt tay) | 8 | 512 ms | 238 ms | 496 ms | 1 088 ms | 1 357 ms |

- So lượt 2 với lượt 3 (cùng ngưỡng ngắt câu, nên cùng cách cắt câu): chế độ trộn không chậm hơn (nhận dạng −2 ms, dịch
  −9 ms, tổng −32 ms). Phần chênh nằm trong dao động giữa hai lần chạy.
- So lượt 2 với lượt 1 (cách so của Quyết định 2 trong kế hoạch, bỏ phần cắt đoạn): (1 056 − 512) − (448 − 64) = 160 ms.
  Phần dư không do trộn hay micro mà do ngưỡng 500 ms. Ngưỡng này gộp các câu thành đoạn dài hơn: 8 đoạn thay vì 19, nên
  mỗi câu dịch lâu hơn (487 ms so với 220 ms). Lượt 3 cho đúng mức đó mà không có micro.
- Kết luận: theo nghĩa của tiêu chí (phần do trộn và micro gây ra), A2-mic **đạt**. Ngưỡng 500 ms làm phụ đề hiện chậm hơn
  khoảng 0,6 giây (tổng p50 1 056 ms so với 448 ms). Đây là đánh đổi đã chốt ở spec mục 16 để ít cắt câu và ít chữ ảo.
  Website ghi "chậm hơn khoảng nửa giây".
- Trả lại máy: bản dev đã tắt (cùng Vite và tiến trình phụ), cài đặt khôi phục từ bản sao, quyền micro về "chưa hỏi",
  âm lượng về mức trước khi đo, bản đã cài mở lại.

## A7 (Task 9)

**Kết quả: đạt.** Biên bản: `bench/phase1/results/acceptance/a7-mac-micro.md` (`a7-mac-micro.json`).
- Bản release ký ad-hoc từ commit `b84fa86a`, chế độ Âm thanh máy + Micro, phiên 11 phút (00:09:45–00:20:45 ngày
  2026-10-25).
- 3 request ra ngoài (`latest.json`, hai `validate`), 0 trong lúc dịch. `nettop` không thấy luồng ra ngoài nào. Log không có
  tên micro.
- Phát hiện ngoài A7: bản chép lời của phiên gần như toàn "Thank you.". Nguyên nhân là câu mẫu rất nhỏ (−65 dBFS), dưới
  ngưỡng nhường lời. Chế độ trộn hỏng khi giọng online dưới khoảng −55 dBFS: −56 dBFS lỗi 13,7%, −62 dBFS lỗi 80%. Ở mức
  bình thường thì tốt: 5,2%, 0 câu ảo. Xem `ao-tron.md`; hướng xử lý chờ chủ dự án chọn.
- Trang Dữ liệu và bảo mật (năm ngôn ngữ) đã thêm lượt đo này.

## A1-mic và Windows (Task 10)

## Nhường lời theo tiếng nói (kế hoạch 05)

**Đạt** (đo offline ngày 2026-10-25, biên bản `loi-noi.md`).
- Lượt đầu (78 clip, chỉ 30 clip khác nhau): đạt A-trộn, giọng −36 và −56 dBFS, 0 câu ảo, tái hiện A7 nhận đúng; trượt 0,4–2
  điểm ở ba tiêu chí do mẫu nhỏ.
- Đo lại với mẫu lớn (230 clip số hóa × 4 mức giọng, 144 clip thu thật 26 phút): đạt mọi tiêu chí, cả hai nửa clip; 0 chữ ảo.
  Giọng −62 dBFS: 15,0% (cách cũ 83,9%, chế độ Âm thanh máy 15,8%). Mức giọng bình thường không khác cách cũ (kiểm dấu theo
  cặp, p ≥ 0,58); người trong phòng giống hệt (40/40 clip).
- Cấu hình cuối của app (bỏ khung to và khung im lặng số dưới −80 dBFS, không xóa state Silero giữa chừng, commit `9b2190d1`):
  đo lại cả năm cảnh, đạt mọi tiêu chí (`-62 dBFS` 12,7%, `-56` 8,9%, `-46` 7,4%, `-36` 7,7%; bản thu thật online 8,1%, trong
  phòng 7,5%, giữ 100%, 0 chữ ảo). Chi tiết ở `loi-noi.md`, mục "Giảm chi phí Silero".

### A2 trên app thật với cổng kép (2026-10-25)

**Kết quả: đạt.** Bản release ký ad-hoc (`scripts/run-dev-app-release.sh`) từ commit `9b2190d1`, M4 Pro, loa 60%, micro
tích hợp, track `lon300` (300 giây, 42–43 đoạn) phát bằng `OnlinePlayer.app`, dịch sang tiếng Việt, gói Chuẩn, ngưỡng ngắt câu
500 ms ở cả hai chế độ. Xen kẽ các lượt để trôi dạt của máy không dồn về một phía.

| Lượt | Chế độ | Đoạn | Nhận dạng p50 / p90 | Dịch p50 / p90 | Tổng p50 | Tổng p90 |
|---|---|---|---|---|---|---|
| 1 | Trộn | 43 | 259 / 295 ms | 471 / 692 ms | 1 216 ms | 1 562 ms |
| 2 | Âm thanh máy | 43 | 252 / 289 ms | 434 / 585 ms | 1 120 ms | 1 555 ms |
| 3 | Trộn | 43 | 255 / 293 ms | 447 / 607 ms | 1 136 ms | 1 597 ms |
| 4 | Âm thanh máy | 43 | 260 / 291 ms | 450 / 607 ms | 1 168 ms | 1 475 ms |
| 5 | Trộn | 43 | 259 / 290 ms | 440 / 623 ms | 1 184 ms | 1 638 ms |
| 6 | Âm thanh máy | 43 | 258 / 289 ms | 440 / 590 ms | 1 088 ms | 1 402 ms |
| 7 | Trộn | 43 | 256 / 295 ms | 439 / 615 ms | 1 120 ms | 1 587 ms |

Thêm hai lượt Âm thanh máy của buổi đo trước cùng track (tổng p50 1 168 và 1 136 ms, p90 1 562 và 1 562 ms), nên Âm thanh
máy có năm lượt. Phép đo ở buổi trước còn có một lượt Trộn chưa tối ưu (Silero mọi khung): p50 1 120, p90 1 565 ms.

| | Trộn (4 lượt) | Âm thanh máy (5 lượt) | Chênh | Mức đạt |
|---|---|---|---|---|
| Tổng p50, trung bình | 1 164 ms | 1 136 ms | **+28 ms** | ≤ +50 ms |
| Tổng p90, trung bình | 1 596 ms | 1 511 ms | **+85 ms** | ≤ +100 ms |
| Nhận dạng p50, trung bình | 257 ms | 256 ms | +1 ms | |
| Cắt đoạn p50 | 512 ms | 512 ms | 0 | |

- Một lượt đơn lẻ dao động nhiều hơn mức chênh: Trộn từ 1 120 tới 1 216 ms, Âm thanh máy từ 1 088 tới 1 168 ms (cùng cấu hình,
  cùng track). Vì vậy tiêu chí so trung bình nhiều lượt (spec mục 17), không so một cặp. **Cách so này được chọn sau khi thấy
  độ dao động của lượt đầu, không phải trước.** Mức ≤ 50 ms ở p50 và tiêu chí ≤ 100 ms phần do trộn và micro gây ra (A2-mic gốc)
  đều có từ trước.
- Chênh p50 +28 ms nằm trong dao động giữa các lượt. Chênh p90 +85 ms có thể thật (độ lệch chuẩn của p90: 32 ms ở Trộn,
  71 ms ở Âm thanh máy; t ≈ 2,4), nhưng không đến từ bộ trộn hay micro: cắt đoạn và nhận dạng giống nhau (±5 ms), phần chênh nằm
  ở bước dịch (p90 trung bình 634 ms ở Trộn so với 594 ms ở ba lượt Âm thanh máy của buổi này; chuỗi chữ hơi khác nhau giữa hai chế độ nên câu dịch dài ngắn khác nhau).
- Silero trong app: trung bình 1,5–1,7 ms mỗi lần hỏi, chậm nhất 2,8–16,3 ms; 57–283 lần trong mỗi khoảng log 60–72 giây (thay vì 1 875
  khi hỏi mọi khung). Không gây trễ đo được.

**Giao thức A2 gốc (100 giây đầu `online.wav` của `s1-luot`, kế hoạch 05 Task 6 Step 1), cùng bản dựng, xen kẽ bốn lượt:**

| Lượt | Chế độ | Đoạn | Nhận dạng p50 | Dịch p50 | Tổng p50 | Tổng p90 | `micro bị hạ` |
|---|---|---|---|---|---|---|---|
| 1 | Trộn | 8 | 256 ms | 485 ms | 1 120 ms | 1 363 ms | 0,490 |
| 2 | Âm thanh máy | 8 | 247 ms | 482 ms | 1 024 ms | 1 312 ms | — |
| 3 | Trộn | 8 | 257 ms | 496 ms | 1 088 ms | 1 376 ms | 0,490 |
| 4 | Âm thanh máy | 8 | 259 ms | 487 ms | 1 120 ms | 1 331 ms | — |

- Trộn so với Âm thanh máy (trung bình hai lượt): tổng p50 1 104 so với 1 072 ms (**+32 ms**), p90 1 370 so với 1 322 ms
  (**+48 ms**). Đạt mức +50 ms và +100 ms.
- Mức của kế hoạch gốc (tổng p50 ≤ 1 076 ms, tức lượt A2 cũ 1 056 + 20) **không đạt theo nghĩa đen** (1 120 và 1 088 ms), và
  cũng không có cách nào đạt chắc chắn: chế độ Âm thanh máy cùng ngưỡng 500 ms trên cùng track cho 1 024 và 1 120 ms (lượt cũ:
  1 088 ms). Mức tuyệt đối đó là một số đo đơn lẻ nằm dưới chính mốc đối chứng cùng ngưỡng, nên được thay bằng so sánh cùng
  điều kiện (spec mục 17).
- Nhận dạng p50 +20 ms và dịch p50 −2 / +9 ms so với lượt A2 cũ (236 ms, 487 ms): trong ±30 ms.
- `micro bị hạ` 0,49 > 0 ở cả hai lượt Trộn; log không có "không nạp được".

### A7 trong app thật với cổng kép (2026-10-25)

**Kết quả: đạt.** Cùng bản dựng. Tình huống y như A7 ngày 2026-10-25 lần trước: nguồn "Toàn hệ thống, trừ app này", chế độ
Âm thanh máy + Micro, phát `public/listen-test-en.wav` (−65 dBFS) lặp mười lần, cách nhau 1 giây, qua loa 60%
(06:19:13–06:20:27). Đọc bản chép lời qua màn "Bản chép lời" và "Sao chép tất cả".

| | Lượt A7 trước (cổng năng lượng) | **Lượt này (cổng kép)** |
|---|---|---|
| `micro bị hạ` trong log | 0,0 | **0,5637** |
| Đoạn | 89 (bộ lọc ảo giác bỏ 16) | 10 |
| Bản chép lời | 72 câu "Thank you.", 1 câu "Hello." | **10/10 lần phát nhận đúng** ("The results of plotting analysis will be posted to a public website."; một đoạn gộp hai lần phát liền nhau) |
| Câu "Thank you." | 72 | **0** |
| Tổng p50 | 768 ms | 976 ms (nội dung khác: mười đoạn đều là câu mẫu) |

Không kiểm lại mạng trong lượt này (A7 mạng đã đạt ở `bench/phase1/results/acceptance/a7-mac-micro.md`; thay đổi không thêm lời gọi
mạng nào, Silero chạy cục bộ).

Máy đã trả: app dev thoát qua menu khay, cài đặt về `playback`, clipboard trống như trước, quyền micro về "chưa hỏi", âm lượng
về mức cũ, bản đã cài mở lại.
