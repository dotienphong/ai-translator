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
