# Spike thuật ngữ S-T (spec gói Nhanh §6.1, §8.3), 2026-10-21

**Bộ câu:** `terms.jsonl`, 60 câu lấy từ bộ A3 (`testset_phase0.jsonl`): 30 en→vi, 10 mỗi chiều zh/ja/ko→vi, 86 cặp thuật
ngữ. Mỗi cặp chọn tay: chữ nguồn có nguyên văn trong câu gốc, chữ đích có nguyên văn trong bản dịch chuẩn (đã kiểm bằng
script, NFC, không phân biệt hoa thường).

**Cách chạy:** `term_eval.py`, `llama-server` b11146 trên Metal, greedy, repeat penalty 1,05, không stream. Hy-MT2 Q8_0 dùng
nguyên văn mẫu "terminology" của app (`prompt.rs`). LMT-60-0.6B Q8_0 (GGUF tự chuyển) dùng mẫu ghép của spec §6.1, và mẫu
thường để so. "Đủ thuật ngữ" là mọi chữ đích của câu đều có trong bản dịch. COMET là `wmt22-comet-da` (`comet_score.py`).

| Lượt | Câu đủ thuật ngữ | Thuật ngữ có trong bản dịch | COMET en→vi | ja→vi | ko→vi | zh→vi | Cả bộ |
|---|---|---|---|---|---|---|---|
| Hy-MT2 Q8_0, mẫu terminology | 40/60 = 66,7% | 65/86 = 75,6% | 0,854 | 0,814 | 0,850 | 0,856 | 0,847 |
| LMT, mẫu ghép thuật ngữ | 21/60 = 35,0% | 38/86 = 44,2% | 0,786 | 0,757 | 0,799 | 0,826 | 0,790 |
| LMT, mẫu thường | 12/60 = 20,0% | 26/86 = 30,2% | 0,780 | 0,779 | 0,788 | 0,804 | 0,785 |

## Kết luận: không đạt

- Ngưỡng 1 (tỉ lệ câu đủ thuật ngữ không thấp hơn Hy-MT2 quá 10 điểm): LMT thấp hơn 31,7 điểm. **Không đạt.**
- Ngưỡng 2 (COMET mẫu ghép không thấp hơn mẫu thường quá 0,02): 0,790 so với 0,785. Đạt, nhưng ngưỡng 1 đã hỏng.
- Theo spec §6.1, gói Nhanh không áp từ điển thuật ngữ (kế hoạch Task 8B) và màn hình Từ điển thuật ngữ hiện ghi chú.
- Ghi lại cho chủ dự án: mẫu ghép vẫn nâng tỉ lệ từ 20% lên 35% mà không làm COMET tụt. Nếu muốn áp một phần thay vì tắt hẳn,
  chỉ cần đổi một nhánh của `prompt::build` và câu ghi chú.

Bản dịch thô: `outputs/terms-*.jsonl`.
