# A5: flash attention của whisper với `audio_ctx` là bội của 256 (2026-10-11)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md`, Task 9–11; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §8 A5.

**Kết luận: KHÔNG GIỮ.** Cổng A4 không đạt: nhóm `ko-wbp` của gói turbo tệ hơn mốc 14,3% tương đối (CER 0,03535354 →
0,04040404, ngưỡng cho phép 10%), giống hệt nhau tới từng chữ số ở cả lượt bật và tắt flash attention (`turbo-fa` và
`turbo-fa-off` ra đúng cùng một số: 0,04040404040404041) — tức nguyên nhân là phép làm tròn `audio_ctx` lên bội của
256 (Task 9), không phải riêng flash attention (Task 10), đúng như spec đã lường trước khi yêu cầu lượt `-fa-off`
cũng phải đạt. Gói small đạt cả 4 lượt. Năm commit của A5 đã được revert:

| Commit gốc | Commit revert |
|---|---|
| `5e3bc28` | `6048311` |
| `0307b54` | `9e3bcab` |
| `37a28c6` | `f7018f6` |
| `c5c98dc` | `f76cde9` |
| `d7c3595` | `4c0733a` |

Flash attention giữ tắt, `audio_ctx` không còn làm tròn lên bội của 256.

## Thay đổi

- `asr_protocol::audio_ctx_for_samples` làm tròn lên bội của 256 (512, 768, 1024, 1280; 1500 khi đoạn dài hơn
  24,32 giây). Commit `5e3bc28`, đã revert bằng `6048311`.
- `asr-worker` bật flash attention mặc định khi chạy GPU trên macOS; khi bật thì làm tròn `audio_ctx` của mọi bên
  gọi. Commit `0307b54`, đã revert bằng `9e3bcab`.
- Rà soát chất lượng sau đó thêm 3 commit sửa lỗi/làm chắc trước khi chạy cổng: `37a28c6` (LID chế độ A qua
  effective_audio_ctx, siết cổng tất định, đã revert bằng `f7018f6`), `c5c98dc` (dọn chú thích, thêm test, đã revert
  bằng `f76cde9`), `d7c3595` (chặn cấu hình tạo đoạn chạm cửa sổ audio_ctx 1500 — chỉ có ý nghĩa khi flash attention
  bật, đã revert bằng `4c0733a`). Cả ba đã revert cùng đợt.

## Cổng tất định

`crates/asr-worker/tests/flash_attn_determinism.rs`: 5 đoạn (`audio_ctx` 512, 768, 1024), chép 12 lần xen kẽ, so cả
6 trường (chữ, token, no_speech_prob, avg_logprob, ngôn ngữ, xác suất ngôn ngữ — mở rộng so với bản gốc chỉ so
chữ/token, theo rà soát chất lượng sau Task 10).

| Model | Bật flash attention | Tắt | Bật và tắt cùng token |
|---|---|---|---|
| turbo q5_0 | ĐẠT | ĐẠT | 5/5 |
| small q5_1 | ĐẠT | ĐẠT | 5/5 |

Không có đoạn nào bật và tắt khác token ở cả hai model — cổng tất định ĐẠT hoàn toàn (nhưng không đủ để GIỮ, vì A4
không đạt — xem dưới).

## A4

Bốn lượt trên 548 clip của A4 (`latency-bench asr-eval`, `score_asr.py`), so mốc `a4_m4pro-{turbo,small}-final.json`
bằng `bench/phase1/acceptance/gates.py a4` (không nhóm nào xấu hơn quá 10% tương đối). Lấy nguyên văn từ
`target/do-tre/asr/gates.txt`:

### turbo-fa (bật flash attention) — KHÔNG ĐẠT

| Nhóm | Chỉ số | Mốc | Lượt này | Kết luận |
|---|---|---|---|---|
| en | WER | 0.064 | 0.062 | đạt |
| en-nb | WER | 0.105 | 0.097 | đạt |
| en-wb | WER | 0.054 | 0.054 | đạt |
| en-wbp | WER | 0.068 | 0.070 | đạt |
| ja | CER | 0.046 | 0.046 | đạt |
| ja-nb | CER | 0.050 | 0.050 | đạt |
| ja-wb | CER | 0.045 | 0.046 | đạt |
| ja-wbp | CER | 0.042 | 0.045 | đạt |
| ko | CER | 0.041 | 0.042 | đạt |
| ko-nb | CER | 0.041 | 0.043 | đạt |
| ko-wb | CER | 0.041 | 0.042 | đạt |
| ko-wbp | CER | 0.035 | 0.040 | XẤU HƠN QUÁ 10% |
| vi | WER | 0.085 | 0.081 | đạt |
| vi-nb | WER | 0.077 | 0.073 | đạt |
| vi-wb | WER | 0.087 | 0.083 | đạt |
| vi-wbp | WER | 0.063 | 0.059 | đạt |
| zh | CER | 0.061 | 0.056 | đạt |
| zh-nb | CER | 0.080 | 0.076 | đạt |
| zh-wb | CER | 0.056 | 0.051 | đạt |
| zh-wbp | CER | 0.074 | 0.072 | đạt |

A4: KHÔNG ĐẠT, mã thoát 1.

### turbo-fa-off (tắt flash attention, vẫn làm tròn audio_ctx) — KHÔNG ĐẠT

| Nhóm | Chỉ số | Mốc | Lượt này | Kết luận |
|---|---|---|---|---|
| en | WER | 0.064 | 0.062 | đạt |
| en-nb | WER | 0.105 | 0.097 | đạt |
| en-wb | WER | 0.054 | 0.054 | đạt |
| en-wbp | WER | 0.068 | 0.070 | đạt |
| ja | CER | 0.046 | 0.046 | đạt |
| ja-nb | CER | 0.050 | 0.050 | đạt |
| ja-wb | CER | 0.045 | 0.046 | đạt |
| ja-wbp | CER | 0.042 | 0.045 | đạt |
| ko | CER | 0.041 | 0.042 | đạt |
| ko-nb | CER | 0.041 | 0.043 | đạt |
| ko-wb | CER | 0.041 | 0.042 | đạt |
| ko-wbp | CER | 0.035 | 0.040 | XẤU HƠN QUÁ 10% |
| vi | WER | 0.085 | 0.082 | đạt |
| vi-nb | WER | 0.077 | 0.075 | đạt |
| vi-wb | WER | 0.087 | 0.083 | đạt |
| vi-wbp | WER | 0.063 | 0.059 | đạt |
| zh | CER | 0.061 | 0.056 | đạt |
| zh-nb | CER | 0.080 | 0.077 | đạt |
| zh-wb | CER | 0.056 | 0.051 | đạt |
| zh-wbp | CER | 0.074 | 0.070 | đạt |

A4: KHÔNG ĐẠT, mã thoát 1.

### small-fa (bật flash attention) — ĐẠT

| Nhóm | Chỉ số | Mốc | Lượt này | Kết luận |
|---|---|---|---|---|
| en | WER | 0.082 | 0.081 | đạt |
| en-nb | WER | 0.148 | 0.148 | đạt |
| en-wb | WER | 0.066 | 0.065 | đạt |
| en-wbp | WER | 0.088 | 0.084 | đạt |
| ja | CER | 0.142 | 0.144 | đạt |
| ja-nb | CER | 0.186 | 0.190 | đạt |
| ja-wb | CER | 0.131 | 0.133 | đạt |
| ja-wbp | CER | 0.132 | 0.133 | đạt |
| ko | CER | 0.083 | 0.082 | đạt |
| ko-nb | CER | 0.087 | 0.084 | đạt |
| ko-wb | CER | 0.082 | 0.082 | đạt |
| ko-wbp | CER | 0.097 | 0.098 | đạt |
| vi | WER | 0.226 | 0.230 | đạt |
| vi-nb | WER | 0.230 | 0.224 | đạt |
| vi-wb | WER | 0.225 | 0.231 | đạt |
| vi-wbp | WER | 0.196 | 0.194 | đạt |
| zh | CER | 0.104 | 0.105 | đạt |
| zh-nb | CER | 0.134 | 0.132 | đạt |
| zh-wb | CER | 0.096 | 0.098 | đạt |
| zh-wbp | CER | 0.120 | 0.119 | đạt |

A4: ĐẠT, mã thoát 0.

### small-fa-off (tắt flash attention, vẫn làm tròn audio_ctx) — ĐẠT

| Nhóm | Chỉ số | Mốc | Lượt này | Kết luận |
|---|---|---|---|---|
| en | WER | 0.082 | 0.081 | đạt |
| en-nb | WER | 0.148 | 0.148 | đạt |
| en-wb | WER | 0.066 | 0.065 | đạt |
| en-wbp | WER | 0.088 | 0.084 | đạt |
| ja | CER | 0.142 | 0.144 | đạt |
| ja-nb | CER | 0.186 | 0.190 | đạt |
| ja-wb | CER | 0.131 | 0.133 | đạt |
| ja-wbp | CER | 0.132 | 0.133 | đạt |
| ko | CER | 0.083 | 0.082 | đạt |
| ko-nb | CER | 0.087 | 0.084 | đạt |
| ko-wb | CER | 0.082 | 0.081 | đạt |
| ko-wbp | CER | 0.097 | 0.098 | đạt |
| vi | WER | 0.226 | 0.224 | đạt |
| vi-nb | WER | 0.230 | 0.224 | đạt |
| vi-wb | WER | 0.225 | 0.224 | đạt |
| vi-wbp | WER | 0.196 | 0.194 | đạt |
| zh | CER | 0.104 | 0.105 | đạt |
| zh-nb | CER | 0.134 | 0.132 | đạt |
| zh-wb | CER | 0.096 | 0.098 | đạt |
| zh-wbp | CER | 0.120 | 0.119 | đạt |

A4: ĐẠT, mã thoát 0.

## Tốc độ chép lời

Nguyên văn từ `target/do-tre/asr/toc-do.txt`:

```
turbo, clip ≤ 8,96 giây (audio_ctx 512, như đoạn thường của app): p50 bật 212 ms, tắt 239 ms, nhanh hơn 11.2%
turbo, mọi clip: p50 bật 314 ms, tắt 339 ms, nhanh hơn 7.4%
small, clip ≤ 8,96 giây (audio_ctx 512, như đoạn thường của app): p50 bật 95 ms, tắt 107 ms, nhanh hơn 11.3%
small, mọi clip: p50 bật 129 ms, tắt 147 ms, nhanh hơn 12.7%
```

Không ảnh hưởng quyết định, vì cổng A4 đã không đạt.

## Điều tra riêng: 3 clip dài hơn 24,32 giây (audio_ctx = 1500)

A4 có 3 clip dài hơn 24,32 giây, nhận `audio_ctx = 1500` (cửa sổ đầy đủ) ở mọi lượt: `vi-9936956711547566830`
(24,82s), `vi-4446382519192965870` (28,32s), `ko-9841627196035473804` (27,44s). Một rà soát chất lượng trước đó
(đọc mã nguồn whisper.cpp đã vendor) đã xác định: cửa sổ 1500 vẫn đọc K/V cross-attention CHƯA được ghi của đoạn
chép trước — tái diễn lỗi ggml-org/whisper.cpp#3941 — khi bật flash attention, không chỉ là "còn đệm vô hại".

Kiểm riêng 3 clip này ở cả 4 lượt (lấy từ `target/do-tre/asr/out-m4pro-{turbo,small}-{fa,fa-off}.jsonl`), so
`avg_logprob` bật so với tắt:

| Clip | turbo: bật | turbo: tắt | small: bật | small: tắt |
|---|---|---|---|---|
| `vi-9936956711547566830` (24,82s) | −0,161 | −0,154 | **−0,839** | −0,448 |
| `vi-4446382519192965870` (28,32s) | −0,238 | −0,289 | −0,510 | −0,389 |
| `ko-9841627196035473804` (27,44s) | −0,045 | −0,052 | −0,215 | −0,163 |

Rõ nhất ở clip `vi-9936956711547566830` với gói **small**: lượt bật flash attention cho bản chép bị cụt/biến dạng
nặng ở cuối câu ("...ASOP KIA TION TÖP AUCHALIA NERX DX INC CÁT TÂN NUYU", avg_logprob −0,839), còn lượt tắt cho bản
chép đầy đủ hơn nhiều ("...các tình nguyên viên đủ điều kiện đã được tiến dụng theo chương trình tìm kiếm nhân sự
của Sporting Shooter...", avg_logprob −0,448). Đây là biểu hiện thật của hạn chế đã biết.

Hai clip còn lại của small cũng lệch cùng chiều (bật tệ hơn tắt) nhưng nhẹ hơn nhiều, không đến mức biến dạng rõ.
Ở gói turbo, chênh lệch giữa bật/tắt trên cả 3 clip đều nhỏ và không theo chiều cố định (`vi-4446382519192965870`
bật lại *tốt hơn* tắt) — chỉ là khác biệt chính tả/dấu câu thông thường giữa hai lượt chạy, không phải dấu hiệu
biến dạng.

Lưu ý: đây KHÔNG phải nguyên nhân khiến cổng A4 không đạt (nguyên nhân là nhóm `ko-wbp`, không liên quan tới 3 clip
dài này) — nhưng là bằng chứng thực nghiệm xác nhận hạn chế cửa sổ 1500 là có thật, không chỉ là lo xa trên lý
thuyết. Việc quay lại A5 lần này cũng loại bỏ luôn rủi ro này (vì flash attention tắt).

## Giới hạn

- Chỉ đo trên M4 Pro (Metal). Windows (Vulkan) chưa đo.
- Câu đọc của FLEURS (A4), không phải hội thoại thật.
- Nhóm `ko-wbp` là một nhóm con nhỏ của A4 (số clip ít), nên một vài ký tự lệch có thể đổi CER tương đối khá nhiều;
  không loại trừ khả năng đây một phần là nhiễu thống kê trên mẫu nhỏ, nhưng theo đúng tiêu chí cổng đã chốt
  (`bench/phase1/acceptance/gates.py a4`, ngưỡng 10% tương đối, không phân biệt cỡ mẫu), kết quả là KHÔNG ĐẠT.
