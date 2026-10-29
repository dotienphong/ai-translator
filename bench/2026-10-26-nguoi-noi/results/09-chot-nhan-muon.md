# Chốt nhãn muộn: số đo bằng bản Rust (0.3.3)

Spec `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §5.3. Thuật toán và mô phỏng ban đầu ở `08-hieu-chinh-nguoi-noi.md`
(mục "Thuật toán có thể thử") và `callsim_sweep.py` (`cluster_delay`).

## Cách chạy lại

```sh
M=...  DATA=...                      # đặt theo máy; DATA như README.md của thư mục này
cd $M && cargo build --release -p latency-bench
cd $M/bench/2026-10-26-nguoi-noi
$DATA/venv/bin/python late_eval.py $M/target/release/latency-bench $DATA     # không dùng -I (import callsim_sweep cùng thư mục)
# một bản ghi, một cấu hình:
$M/target/release/latency-bench speaker-eval --embeddings-in $DATA/out/<tên>.emb.json --late-relabel-ms 30000 --out ra.jsonl
$DATA/venv/bin/python -I score_spk.py ra.jsonl $DATA/out/<tên>.rttm
```

`--late-relabel-ms` mặc định lấy từ `SpeakerConfig::default()` (30 000); 0 tắt. Dòng JSONL của `speaker-eval` là nhãn SAU CÙNG của
mỗi đoạn (`label_segments` áp luôn các lần đổi nhãn muộn; chế độ `--worker` áp `Assign` thứ hai của worker thật).

## Kết quả

Ba bộ như `callsim_sweep.load_sets`: `call` = 144 bản kiểu cuộc gọi (`$DATA/callsim`), `ami` = 6 bản ghi AMI, `cv` = 12 bản Common Voice
tiếng Việt gốc. Chấm bằng `Rec.score` (cùng công thức `score_spk.py`). Cột cuối: điểm trung bình của bản Rust trừ bản mô phỏng Python
cùng độ trễ.

| bộ | cấu hình | mọi dòng % | ≥1 s % | tệ nhất % | giọng thừa | giọng thiếu | lệch với mô phỏng (điểm TB) |
|---|---|---|---|---|---|---|---|
| call (n=144) | mặc định cũ (tắt) | 73.2 | 77.7 | 33.7 | 17 | 63 | +0.00 (mô phỏng 73.2) |
| call (n=144) | chốt muộn 15 s | 75.6 | 79.1 | 33.7 | 17 | 63 | +0.19 (mô phỏng 75.4) |
| call (n=144) | chốt muộn 30 s | 75.8 | 79.3 | 33.7 | 17 | 63 | +0.02 (mô phỏng 75.7) |
| call (n=144) | chốt muộn 60 s | 75.9 | 79.5 | 33.7 | 17 | 63 | -0.14 (mô phỏng 76.1) |
| ami (n=6) | mặc định cũ (tắt) | 87.6 | 93.2 | 80.2 | 8 | 0 | +0.00 (mô phỏng 87.6) |
| ami (n=6) | chốt muộn 15 s | 87.6 | 93.5 | 79.8 | 8 | 0 | -0.10 (mô phỏng 87.7) |
| ami (n=6) | chốt muộn 30 s | 87.6 | 93.5 | 79.8 | 8 | 0 | -0.10 (mô phỏng 87.7) |
| ami (n=6) | chốt muộn 60 s | 87.8 | 93.4 | 79.8 | 8 | 0 | +0.04 (mô phỏng 87.7) |
| cv (n=12) | mặc định cũ (tắt) | 88.0 | 93.9 | 66.4 | 3 | 1 | +0.00 (mô phỏng 88.0) |
| cv (n=12) | chốt muộn 15 s | 90.9 | 94.8 | 69.6 | 3 | 1 | +0.27 (mô phỏng 90.7) |
| cv (n=12) | chốt muộn 30 s | 91.9 | 95.2 | 69.6 | 3 | 1 | +0.22 (mô phỏng 91.7) |
| cv (n=12) | chốt muộn 60 s | 92.6 | 96.0 | 68.8 | 3 | 1 | +0.34 (mô phỏng 92.2) |

Đọc kết quả (mặc định 30 s):

- Kiểu cuộc gọi +2,6 điểm trung bình (73,2 → 75,8), tiếng Việt gốc +3,9 (88,0 → 91,9), AMI không đổi (87,6; ≥1 s +0,3).
- Số giọng thừa và thiếu không đổi ở mọi bộ (chốt muộn không sửa tâm nên không mở hay đóng giọng).
- Bản tệ nhất: call không đổi (33,7, bản có số giọng sai nặng, chốt muộn không cứu được); cv 66,4 → 69,6; AMI 80,2 → 79,8 (giảm
  0,4 điểm ở một bản ghi, trung bình không đổi).
- Bản Rust sát mô phỏng trong ±0,5 điểm ở mọi ô (lớn nhất +0,34).
- Độ trễ dài hơn (60 s) chỉ hơn 15 s và 30 s từ 0,1 đến 0,7 điểm; 30 s giữ nhãn cũ đổi muộn không quá nửa phút nên chọn làm mặc định.

## Vì sao lần chạy đầu lệch mô phỏng 0,7 điểm (call)

Bản đầu bỏ qua đoạn nhúng được mà lúc gán chưa có giọng nào (đoạn 0,5–1,5 s ở đầu bản ghi, nhãn `None`); mô phỏng thì gán nhãn cho
chúng. Sau khi hàng đợi nhận cả đoạn chưa có giọng (`from: None` trong `LateChange`), Rust khớp mô phỏng (call 75,0 → 75,8 ở 30 s).
Các khác biệt còn lại nhỏ và theo hướng không đáng kể: tâm lúc chốt của Rust là tâm HIỆN CÓ khi đoạn đầu tiên kết thúc sau
`end_ms + 30 s` tới (mô phỏng cắt đúng ở `end_ms + 30 s`), và tâm của Rust chỉ gồm các đoạn đã thật sự vào tâm (mô phỏng cộng cả
đoạn 1,0–1,5 s lấy giọng của đoạn trước). Đoạn cuối bản ghi (chưa tới hạn) giữ nhãn gốc; thử mô phỏng bỏ chốt các đoạn đó chỉ đổi
điểm ≤ 0,12.

## Chi phí

Test `late_relabel_costs_under_a_millisecond_per_segment` (`crates/speaker-worker/src/session.rs`, bản debug): 2 000 đoạn, nhúng 192
chiều, bốn người xen kẽ, so `Worker::segment_with` với `late_relabel_ms` 0 và 30 000: chênh khoảng 0,02 ms mỗi đoạn (ngưỡng test 1 ms).
Chi phí là một lần chuẩn hóa nhúng và vài cosine mỗi đoạn tới hạn; hàng đợi giữ tối đa 512 đoạn (khoảng 400 KB RAM).

## Ngưỡng `theta` cho nhãn muộn (thử và bỏ, 2026-10-29)

Người rà mã độc lập hỏi nên chỉ đổi nhãn khi cosine với giọng gần nhất ≥ `theta`, để đoạn nhiễu không bị kéo sang giọng "gần nhất" tùy ý.
Đã cài thử và đo lại bằng `late_eval.py` (cùng bản ghi, chốt muộn 30 s, mặc định cũ → có ngưỡng; không có ngưỡng ở bảng trên):

| Bộ | Tắt | Không ngưỡng | Có ngưỡng `theta` |
|---|---|---|---|
| call (n=144) | 73,2 | 75,8 | 74,9 |
| ami (n=6) | 87,6 | 87,6 | 88,0 |
| cv (n=12) | 88,0 | 91,9 | 90,4 |

Có ngưỡng kém hơn ở call và cv, nên **không đặt ngưỡng** (chốt muộn chỉ dùng "giọng gần nhất"). Giới hạn 32 đổi nhãn mỗi lần gọi
(`MAX_CHANGES_PER_CALL`) được giữ: nó không đổi điểm, chỉ chặn một lượt `Assign` quá lớn làm đầy kênh cập nhật của app.
