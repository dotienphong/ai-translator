# Tỉ lệ token cho cặp không có tiếng Việt và câu gốc rất ngắn (Đ12)

Sinh bởi `bench/phase0/mt/ratio_stats.py` từ kết quả `latency-bench mt-eval` trên `testset_ratio.jsonl` (`build_ratio_set.py`).

## Hy-MT2-1.8B-Q8_0-plain.jsonl

| chiều | câu | câu gốc ≥ 10 token | tỉ lệ lớn nhất (≥ 10) | ngưỡng đề xuất | câu gốc < 3 token | token dịch lớn nhất (< 3) | hạn mức sinh (< 3) | lỗi |
|---|---|---|---|---|---|---|---|---|
| en->ja | 112 | 75 | 2.61 | 3.3 | 9 | 10 | 40 | 0 |
| en->ko | 112 | 75 | 2.50 | 3.2 | 9 | 9 | 40 | 0 |
| en->vi | 12 | 0 | — | — | 9 | 8 | 40 | 0 |
| en->zh | 112 | 75 | 1.54 | 2.0 | 9 | 3 | 40 | 0 |
| ja->en | 112 | 89 | 1.33 | 1.7 | 0 | — | — | 0 |
| ja->ko | 112 | 89 | 2.17 | 2.8 | 0 | — | — | 0 |
| ja->vi | 12 | 0 | — | — | 0 | — | — | 0 |
| ja->zh | 112 | 89 | 1.17 | 1.5 | 0 | — | — | 0 |
| ko->en | 112 | 94 | 1.46 | 1.9 | 2 | 3 | 40 | 0 |
| ko->ja | 112 | 94 | 1.60 | 2.0 | 2 | 4 | 40 | 0 |
| ko->vi | 12 | 0 | — | — | 2 | 5 | 40 | 0 |
| ko->zh | 112 | 94 | 1.00 | 1.3 | 2 | 3 | 40 | 0 |
| vi->en | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ja | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ko | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->zh | 12 | 0 | — | — | 0 | — | — | 0 |
| zh->en | 112 | 76 | 2.15 | 2.7 | 9 | 4 | 40 | 0 |
| zh->ja | 112 | 76 | 2.88 | 3.6 | 9 | 10 | 40 | 0 |
| zh->ko | 112 | 76 | 2.92 | 3.7 | 9 | 7 | 40 | 0 |
| zh->vi | 12 | 0 | — | — | 9 | 6 | 40 | 0 |

## Hy-MT2-1.8B-Q4_K_M-plain.jsonl

| chiều | câu | câu gốc ≥ 10 token | tỉ lệ lớn nhất (≥ 10) | ngưỡng đề xuất | câu gốc < 3 token | token dịch lớn nhất (< 3) | hạn mức sinh (< 3) | lỗi |
|---|---|---|---|---|---|---|---|---|
| en->ja | 112 | 75 | 2.22 | 2.8 | 9 | 7 | 40 | 0 |
| en->ko | 112 | 75 | 2.31 | 2.9 | 9 | 9 | 40 | 0 |
| en->vi | 12 | 0 | — | — | 9 | 8 | 40 | 0 |
| en->zh | 112 | 75 | 1.46 | 1.9 | 9 | 3 | 40 | 0 |
| ja->en | 112 | 89 | 1.33 | 1.7 | 0 | — | — | 0 |
| ja->ko | 112 | 89 | 1.85 | 2.4 | 0 | — | — | 0 |
| ja->vi | 12 | 0 | — | — | 0 | — | — | 0 |
| ja->zh | 112 | 89 | 1.11 | 1.4 | 0 | — | — | 0 |
| ko->en | 112 | 94 | 1.17 | 1.5 | 2 | 4 | 40 | 0 |
| ko->ja | 112 | 94 | 1.47 | 1.9 | 2 | 4 | 40 | 0 |
| ko->vi | 12 | 0 | — | — | 2 | 5 | 40 | 0 |
| ko->zh | 112 | 94 | 0.93 | 1.2 | 2 | 3 | 40 | 0 |
| vi->en | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ja | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->ko | 12 | 0 | — | — | 0 | — | — | 0 |
| vi->zh | 12 | 0 | — | — | 0 | — | — | 0 |
| zh->en | 112 | 76 | 2.08 | 2.6 | 9 | 4 | 40 | 0 |
| zh->ja | 112 | 76 | 3.00 | 3.8 | 9 | 7 | 40 | 0 |
| zh->ko | 112 | 76 | 2.92 | 3.7 | 9 | 7 | 40 | 0 |
| zh->vi | 12 | 0 | — | — | 9 | 6 | 40 | 0 |

## Đề xuất (điểm cần quyết 4 của 02a; đã quyết ngày 2026-10-02 và áp vào `crates/pipeline/src/config.rs` ở `22fa4fe`)

### Ngưỡng tỉ lệ token cho 12 chiều không có tiếng Việt

Lấy số lớn hơn của hai model ở cột "ngưỡng đề xuất" (tỉ lệ lớn nhất đo được trên câu gốc từ 10 token, cộng biên 25%, làm tròn
lên 0,1), để một cặp ngưỡng dùng chung cho cả gói Chuẩn lẫn gói Nhanh:

| chiều | Q8_0 | Q4_K_M | ngưỡng chọn (số lớn hơn) |
|---|---|---|---|
| en->ja | 3.3 | 2.8 | 3.3 |
| en->ko | 3.2 | 2.9 | 3.2 |
| en->zh | 2.0 | 1.9 | 2.0 |
| ja->en | 1.7 | 1.7 | 1.7 |
| ja->ko | 2.8 | 2.4 | 2.8 |
| ja->zh | 1.5 | 1.4 | 1.5 |
| ko->en | 1.9 | 1.5 | 1.9 |
| ko->ja | 2.0 | 1.9 | 2.0 |
| ko->zh | 1.3 | 1.2 | 1.3 |
| zh->en | 2.7 | 2.6 | 2.7 |
| zh->ja | 3.6 | 3.8 | 3.8 |
| zh->ko | 3.7 | 3.7 | 3.7 |

Dạng để thêm vào `DEFAULT_RATIO_THRESHOLDS`:

```rust
    ("en", "ja", 3.3),
    ("en", "ko", 3.2),
    ("en", "zh", 2.0),
    ("ja", "en", 1.7),
    ("ja", "ko", 2.8),
    ("ja", "zh", 1.5),
    ("ko", "en", 1.9),
    ("ko", "ja", 2.0),
    ("ko", "zh", 1.3),
    ("zh", "en", 2.7),
    ("zh", "ja", 3.8),
    ("zh", "ko", 3.7),
```

- Số câu gốc từ 10 token mỗi chiều là 75 tới 94 (xem cột "câu gốc ≥ 10 token"), đủ để ngưỡng có nghĩa nhưng không nhiều;
  chiều đuôi dài nhất là `zh->ja` (3,8) và `zh->ko` (3,7), vì tiếng Trung rất gọn so với tiếng Nhật và tiếng Hàn.
- Hai model gần nhau ở hầu hết chiều. Khác biệt đáng kể nhất: `ko->en` (Q8_0 1,9, Q4_K_M 1,5) và `ja->ko` (2,8 và 2,4), `en->ja`
  (3,3 và 2,8); riêng `zh->ja` thì Q4_K_M cao hơn (3,8 so với 3,6). Lấy số lớn hơn nên Q4_K_M có thêm biên ở ba chiều
  đầu, đổi lại luật bắt chuỗi lặp ở các chiều đó lỏng hơn mức Q4_K_M cần.
- Các ngưỡng này chỉ áp cho câu gốc từ 10 token (`ratio_min_source_tokens`); câu ngắn hơn chỉ chịu hạn mức sinh.

### Hạn mức sinh `4 × số token + 32` cho câu gốc dưới 3 token

Đủ, với biên rất rộng. Mọi câu gốc dưới 3 token trong bộ đo đều có đúng 2 token, nên hạn mức là 40. Token dịch lớn nhất là
10 (Q8_0: `en->ja` và `zh->ja`) và 9 (Q4_K_M: `en->ko`), tức hạn mức còn dư tối thiểu 30 token (Q8_0) và 31 token (Q4_K_M), cỡ
4 lần mức dùng thật. Không câu ngắn nào chạm hạn mức hay phải dịch lại (`attempts = 1` ở mọi câu dịch được). Câu gốc 0 hoặc 1
token (hạn mức 32 hoặc 36) không có trong bộ đo, nhưng token dịch lớn nhất 10 vẫn nằm xa hạn mức đó. Không cần đổi
`max_tokens_per_source_token` hay `max_tokens_extra`.

### Câu dịch lỗi (cột "lỗi")

Không còn câu lỗi: cả hai model dịch xong 1440/1440 câu, đều ở lần thử đầu (`attempts = 1`).

Lần đo trước (commit `9d6c7fd`) có 3 câu lỗi với Q8_0 và 9 với Q4_K_M, đều ở bước đếm token câu gốc (`attempts = 0`,
`src_tokens = 0`). Đó là lỗi của client, không phải của câu hay của model, và đã sửa ở `e591a1e`:
- `llama-server` b11146 đóng kết nối ngay sau mỗi response stream, dù header báo `Keep-Alive`;
- client trả kết nối đó về pool, và `/tokenize` của câu kế tiếp gửi lên kết nối đã bị đóng thì lỗi "connection closed before
  message completed".

Lần này đo lại từ đầu, sau khi sửa. Từ `7279c07`, câu lỗi có ghi lý do (trường `reason`).

So với lần đo trước, "tỉ lệ lớn nhất" và "ngưỡng đề xuất" không đổi ở cả 40 dòng. Chỉ đổi cột "lỗi" (về 0) và số câu được
tính, vì các câu lỗi lần trước nay đã được tính:
- cột "câu gốc ≥ 10 token": Q8_0 `ko->zh` 93 → 94; Q4_K_M `ja->en` 87 → 89, `ja->ko` 88 → 89, `ko->ja` 93 → 94,
  `ko->zh` 93 → 94;
- cột "câu gốc < 3 token": Q4_K_M `en->ko` 8 → 9.

Bảng ngưỡng ở trên vì vậy giữ nguyên.
