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

## A7 (Task 9)

## A1-mic và Windows (Task 10)
