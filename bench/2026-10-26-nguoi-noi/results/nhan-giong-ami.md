# Nhận giọng trên AMI bằng code Rust (A-spk1)

Kế hoạch 01, Task 7. Đo chất lượng gán người nói của code thật (`fbank` Rust, ERes2Net trên `candle-onnx`, `OnlineClusterer`)
trên 4 cuộc họp AMI (6 bản ghi), để chốt ngưỡng θ và ngưỡng gộp và trả lời A-spk1 của spec
`2026-10-26-phan-biet-nguoi-noi-design.md` §12. Mọi số dưới đây lấy từ đầu ra của `latency-bench speaker-eval`, `score_spk.py` và
`tune.py` (hoặc chạy lại đúng các lệnh đó trên cache nhúng). Phần trăm ghi một chữ số thập phân; những chỗ sát ngưỡng ghi thêm số
đoạn đúng trên tổng để thấy độ chênh thật. "Mục tiêu" của `tune.py` ghi ba chữ số ở dòng "chọn trên dev" và bốn chữ số ở bảng
mục tiêu theo θ.

## Điều kiện đo

- Máy: Apple M4 Pro (12 lõi, 24 GB), macOS 26.6.2. Rust 1.98.1.
- Bản build: `cargo build --release -p latency-bench` trên nhánh `phan-biet-nguoi-noi` (commit nền `046c41e6` cộng các thay đổi
  chưa commit của kế hoạch 01). Nhúng chạy trên CPU (`candle-onnx`, f32), `RAYON_NUM_THREADS=2`, mỗi lần một tiến trình.
- Cắt đoạn đúng như app: `SileroVad` (`silero_vad_v6.2.3.onnx`) và `Segmenter` với ngắt câu `end_silence_ms` = 50 ms (mặc định).
  Số đoạn khớp số đã đo trước spec (xem dưới), nên cách cắt giống nhau.
- Model nhúng giọng: ERes2Net (`eres2net-sv-en-voxceleb-16k.onnx`, sau `onnxsim`), SHA-256
  `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e`.
- Dữ liệu: AMI Meeting Corpus (CC BY 4.0), `Mix-Headset` của ES2004a, TS3003a, IS1009a, EN2002a và `Array1-01` của ES2004a,
  IS1009a; nhãn là RTTM `only_words` của pyannote AMI-diarization-setup. Dữ liệu và kết quả thô (cache nhúng `.emb.json`,
  JSONL, `tune-ami.json`) nằm ở thư mục dữ liệu ngoài repo.
- Cách chạy lại: `fetch_ami.sh`; `speaker-eval --wav … --embeddings-out …` cho từng bản ghi (một lần); `tune.py` (đọc cache,
  không cần model). Chấm bằng `score_spk.py`: giọng của app ghép với người thật theo thời lượng trùng (Hungarian, mỗi giọng một
  người). Bảng nhạy theo θ ở mục Kết luận chạy lại từ cache bằng `speaker-eval --embeddings-in … --theta <θ> --merge-theta 1.1`
  rồi `score_spk.py` (không cần model).
- Chia dev/kiểm: dev (chọn tham số) là `ES2004a.Mix-Headset`, `TS3003a.Mix-Headset`; kiểm (chỉ báo cáo) là `IS1009a.Mix-Headset`,
  `EN2002a.Mix-Headset`, `IS1009a.Array1-01`, `ES2004a.Array1-01`.

Số đoạn và thời gian nhúng (một lần, từ `speaker-eval --wav`):

| Bản ghi | Dài (độ dài WAV) | Đoạn | Có nhúng (≥ 500 ms) | Nhúng p50 / p90 | Nhúng / thời lượng tiếng nói |
|---|---|---|---|---|---|
| EN2002a.Mix-Headset | 35,7 phút (2142,7 s) | 961 | 756 | 78,8 / 230,5 ms | 5,3% |
| ES2004a.Array1-01 | 17,5 phút (1049,4 s) | 315 | 255 | 76,4 / 186,6 ms | 5,2% |
| ES2004a.Mix-Headset | 17,5 phút (1049,4 s) | 360 | 301 | 79,5 / 232,2 ms | 5,3% |
| IS1009a.Array1-01 | 14,0 phút (839,0 s) | 260 | 227 | 87,4 / 238,2 ms | 5,2% |
| IS1009a.Mix-Headset | 14,0 phút (838,8 s) | 261 | 226 | 93,3 / 267,0 ms | 5,3% |
| TS3003a.Mix-Headset | 25,1 phút (1505,6 s) | 549 | 454 | 65,8 / 122,0 ms | 5,4% |

Số đoạn đúng bằng số kỳ vọng (961, 315, 360, 260, 261, 549). Cột "Dài" là độ dài file WAV (đọc bằng `soundfile`, khớp `ffprobe`), không
phải thời điểm đoạn nói cuối cùng. Thời gian nhúng là trên CPU, 2 luồng, trong lúc cả cuộc họp được nhúng liên tục; không phải
số đo độ trễ trong app. Thời gian chạy cả bản ghi (VAD cộng nhúng) không được đo riêng nên không ghi ở đây.

## Ngưỡng chọn (chỉ trên dev)

Mục tiêu trên dev: trung bình `line_all` của hai bản ghi dev, trừ 0,03 cho mỗi giọng thừa so với số người thật. Lưới θ từ 0,20
đến 0,60 (bước 0,05), ngưỡng gộp trong {1,10 (không bao giờ gộp), 0,75, 0,70, 0,65, 0,60, 0,55, 0,50, 0,45}. Đầu ra `tune.py`:

```
chọn trên dev: θ=0.35 gộp=1.10 (mục tiêu 0.911)
  ở θ=0.35, gộp không đổi kết quả trên dev trong khoảng [0.45, 1.10] (1.10 = không bao giờ gộp); chọn mức thận trọng nhất 1.10
```

Ghi chú về ngưỡng:

- **θ = 0,35, không phải 0,40 mặc định của spec.** Không có hòa giữa các θ (không có dòng "θ hòa" trong đầu ra) và θ không chạm
  mép lưới (không có cảnh báo). Nhưng 0,35 hơn 0,40 rất ít: mục tiêu trung bình trên dev theo θ (đo ở mức gộp 1,10 và 0,70; hai mức
  cho cùng giá trị ở mọi θ) là 0,20: 0,8839; 0,25: 0,8958; 0,30: 0,9013; **0,35: 0,9110**; 0,40: 0,9100; 0,45: 0,8681; 0,50: 0,8298; 0,55: 0,7514;
  0,60: 0,7184. Đỉnh nằm trong lưới và khá phẳng quanh 0,35–0,40, dốc đứng từ 0,45 trở lên.
- **0,35 hơn 0,40 trên dev đúng 1 đoạn.** Độ chênh mục tiêu 0,0009 (0,910957 so với 0,910041) đến hoàn toàn từ TS3003a.Mix-Headset:
  517 so với 516 đoạn đúng trên 546 đoạn có người nói (94,69% so với 94,51%), tức 1/546 đoạn, chia đôi do lấy trung bình hai bản ghi dev.
  ES2004a.Mix-Headset giống hệt ở hai θ (324/358 đoạn đúng, 5 giọng, cùng mục tiêu 0,8750). Đây là bằng chứng rất mỏng cho 0,35.
- **Dung sai hòa không cứu được chỗ này.** `TIE = 1e-9` trong `tune.py` thực chất chỉ là "bằng nhau tuyệt đối" (hai mục tiêu khác nhau
  0,0009 không hòa), nên cơ chế phá hòa "chọn θ gần 0,40 nhất" không có tác dụng ở đây. Nếu coi 0,35 và 0,40 là hòa (ví dụ cho
  dung sai một đoạn) thì `tune.py` sẽ chọn 0,40, và khi đó EN2002a.Mix-Headset "mọi dòng" là 79,9% (không đạt mức 80%, xem mục Kết
  luận A-spk1).
- **Mức gộp 1,10 (không bao giờ gộp) là kết quả của luật phá hòa, không phải bằng chứng gộp có hại.** Trên dev, mọi mức gộp từ
  0,45 đến 1,10 cho đúng cùng kết quả, tức là luật gộp (kèm `merge_min_ms` mặc định 10 s) không bao giờ kích hoạt trên dev ở các
  mức này, nên dev không phân biệt được. `tune.py` chọn mức thận trọng nhất của nhóm hòa. Xem thêm mục "Điều cần biết" bên dưới.

## Kết quả (θ = 0,35, không gộp)

Cột "≥ 1 s" là phần đoạn dài ≥ 1 s gán đúng người nói nhiều nhất trong đoạn; "mọi dòng" tính mọi đoạn có tiếng người nói theo
RTTM; "thời lượng" là phần thời lượng tiếng nói gán đúng người; "giọng/người" là số giọng app hiện ra so với số người thật;
"trần" là mức đạt được nếu mỗi đoạn gán đúng người nói nhiều nhất (đoạn có nhiều người nói không thể đúng cho tất cả).

| Bản ghi | Phần | ≥ 1 s | Mọi dòng | Thời lượng | Giọng/người | Trần |
|---|---|---|---|---|---|---|
| ES2004a.Mix-Headset | dev | 93,3% | 90,5% | 78,7% | 5/4 | 80,7% |
| TS3003a.Mix-Headset | dev | 98,2% | 94,7% | 92,5% | 4/4 | 94,2% |
| IS1009a.Mix-Headset | kiểm | 89,6% | 85,7% | 75,0% | 5/4 | 81,2% |
| EN2002a.Mix-Headset | kiểm | 87,3% | 80,2% | 64,9% | 8/4 | 69,4% |
| IS1009a.Array1-01 | kiểm | 96,9% | 85,7% | 79,1% | 4/4 | 81,2% |
| ES2004a.Array1-01 | kiểm | 94,2% | 88,7% | 79,5% | 6/4 | 82,9% |
| **Trung bình 4 bản ghi kiểm** | | **92,0%** | **85,1%** | **74,6%** | | |
| **Thấp nhất trong 4 bản ghi kiểm** | | **87,3%** (EN2002a) | **80,2%** (EN2002a) | 64,9% (EN2002a) | | |

Số đoạn được tính điểm (có người nói theo RTTM) của phần kiểm: IS1009a.Mix-Headset 251 (164 đoạn ≥ 1 s), EN2002a.Mix-Headset 959
(504), IS1009a.Array1-01 252 (160), ES2004a.Array1-01 310 (171). Một đoạn ứng với 0,4% đến 0,1% tùy bản ghi.

## So với nghiên cứu trước spec

Nghiên cứu trước spec (Python, cùng model ERes2Net, cùng cách cắt đoạn 50 ms, chế độ trực tuyến; `truoc-spec/nhan-giong/score-es50.txt`,
mục `eres2net_en_vox`: θ = 0,4, đoạn mới ≥ 1,5 s, không có luật "đoạn ngắn lấy nhãn trước", gán giọng gần nhất). Hiệu là
Rust trừ Python, đơn vị điểm phần trăm:

| Bản ghi | ≥ 1 s Python → Rust | Mọi dòng Python → Rust | Thời lượng Python → Rust | Giọng Python → Rust |
|---|---|---|---|---|
| IS1009a.Mix-Headset | 89,0 → 89,6 (+0,6) | 86,5 → 85,7 (−0,8) | 75,4 → 75,0 (−0,4) | 5 → 5 |
| EN2002a.Mix-Headset | 86,7 → 87,3 (+0,6) | 81,4 → 80,2 (−1,2) | 65,2 → 64,9 (−0,3) | 8 → 8 |
| IS1009a.Array1-01 | 96,2 → 96,9 (+0,7) | 87,7 → 85,7 (−2,0) | 79,3 → 79,1 (−0,2) | 5 → 4 |
| ES2004a.Array1-01 | 93,6 → 94,2 (+0,6) | 82,6 → 88,7 (+6,1) | 77,6 → 79,5 (+1,9) | 8 → 6 |
| ES2004a.Mix-Headset (dev) | 94,3 → 93,3 (−1,0) | 88,3 → 90,5 (+2,2) | 78,4 → 78,7 (+0,3) | 5 → 5 |
| TS3003a.Mix-Headset (dev) | 98,6 → 98,2 (−0,4) | 94,7 → 94,7 (0,0) | 92,7 → 92,5 (−0,2) | 4 → 4 |
| Trung bình 4 bản ghi kiểm | 91,4 → 92,0 (+0,6) | 84,6 → 85,1 (+0,5) | 74,4 → 74,6 (+0,2) | |

Khoảng trên phần kiểm: Python dòng ≥ 1 s 86,7% đến 96,2%, mọi dòng 81,4% đến 87,7%; Rust dòng ≥ 1 s 87,3% đến 96,9%, mọi dòng
80,2% đến 88,7%. Không chỉ số nào của Rust thấp hơn Python quá 3 điểm (mức giảm lớn nhất là 2,0 điểm, "mọi dòng" của
IS1009a.Array1-01), nên **không chạy** lượt phụ `--min-new-ms 1000` mà kế hoạch dành cho trường hợp thấp hơn rõ. Code Rust
tái lập được kết quả Python trong sai số vài điểm.

Chênh lệch lớn nhất, ở chiều có lợi cho Rust (ES2004a.Array1-01, mọi dòng +6,1 và 8 giọng còn 6), chưa giải thích được. θ khác
(Rust 0,35 so với Python 0,4) không đủ: chạy lại Rust ở θ = 0,40 trên cùng cache thì bản ghi này vẫn hơn Python 4,2 điểm ở "mọi dòng"
(86,8% so với 82,6%; 7 giọng so với 8). Khác biệt còn lại có thể nằm ở cách gán đoạn ngắn: Python (`score2.py::online`, tham số
"ngắn < 0,0 s lấy nhãn trước" nghĩa là không dùng luật này) nhúng mọi đoạn rồi gán giọng gần nhất, kể cả đoạn dưới 500 ms và đoạn
chưa đủ dài để mở giọng; Rust lấy giọng của đoạn trước cho đoạn < 500 ms (không nhúng, không đổi tâm) và cho đoạn 0,5–1,5 s không giống
giọng nào (cosine < θ). Đây chỉ là giả thuyết: cache không có nhúng của đoạn < 500 ms nên không kiểm được bằng số liệu hiện có.

## Kết luận A-spk1

Mức đạt của spec: dòng ≥ 1 s ≥ 85% và mọi dòng ≥ 80% trên phần kiểm.

**Kết luận: đạt sát ngưỡng, và chỉ với θ ≤ 0,35.**

- **Đọc theo từng bản ghi kiểm (chặt nhất): đạt sát ngưỡng ở θ = 0,35 (và 0,25; 0,30), không đạt ở θ ≥ 0,37.** Dòng ≥ 1 s thấp nhất
  là 87,3% (EN2002a.Mix-Headset) ≥ 85%; mọi dòng thấp nhất là 80,2% (EN2002a.Mix-Headset) ≥ 80%.
- **Đọc theo trung bình 4 bản ghi kiểm: đạt** (92,0% và 85,1% ở θ = 0,35; cũng đạt ở mọi θ trong 0,25–0,45 của bảng dưới).
- **Chỗ sát ngưỡng là "mọi dòng" của EN2002a.Mix-Headset.** 80,2% trên 959 đoạn tính điểm: 80% ứng với 767,2 đoạn nên cần ít nhất
  768 đoạn đúng; kết quả là 769, tức hơn mức tối thiểu đúng 1 đoạn (0,1%). Bản ghi này khó nhất (36 phút, 4 người, 8 giọng hiện ra,
  trần 69,4% vì nhiều đoạn có từ hai người nói). Chạy lại với θ nhích lên là mất mức: ở θ = 0,37 là 767/959 (79,98%, hiện làm tròn
  thành 80,0% nhưng thiếu 1 đoạn), ở θ = 0,40 (mặc định cũ của spec và của code, trước Task 15) là 766/959 (79,9%, thiếu 2 đoạn). Các bản
  ghi kiểm khác đều đạt ở mọi θ đã thử, và dòng ≥ 1 s thấp nhất luôn ≥ 86,5% trong 0,25–0,45; chỗ ràng buộc chỉ là "mọi dòng" của
  EN2002a.

### Bảng nhạy theo θ (4 bản ghi kiểm)

Chạy lại từ cache nhúng, không gộp giọng (`--merge-theta 1.1`; ở θ = 0,35 và 0,40 gộp 0,70 cho kết quả giống hệt, xem "Điều cần biết"),
cùng cách chấm như trên. Mỗi dòng là một lượt `speaker-eval --embeddings-in <tên>.emb.json --theta <θ> --merge-theta 1.1 --out <ra>.jsonl`
cho từng bản ghi kiểm rồi `score_spk.py <ra>.jsonl <tên>.rttm`. Cột "đúng/tổng" là số đoạn gán đúng của EN2002a.Mix-Headset (959 đoạn
tính điểm, cần ≥ 768 để đạt 80%). Bản ghi thấp nhất ở mọi dòng của bảng là EN2002a.Mix-Headset, cả hai chỉ số.

| θ | Mọi dòng thấp nhất (EN2002a) | đúng/tổng | Trung bình mọi dòng | Dòng ≥ 1 s thấp nhất (EN2002a) | Trung bình dòng ≥ 1 s | Đạt A-spk1 theo từng bản ghi |
|---|---|---|---|---|---|---|
| 0,25 | 80,9% | 776/959 | 85,8% | 87,5% | 92,0% | đạt |
| 0,30 | 80,3% | 770/959 | 85,6% | 86,9% | 92,0% | đạt |
| **0,35 (chọn)** | **80,2%** | 769/959 | 85,1% | 87,3% | 92,0% | **đạt (hơn 1 đoạn)** |
| 0,37 | 80,0% (thật 79,98%) | 767/959 | 84,7% | 87,1% | 91,8% | không đạt (thiếu 1 đoạn) |
| 0,40 (mặc định cũ) | 79,9% | 766/959 | 85,1% | 86,5% | 92,0% | không đạt (thiếu 2 đoạn) |
| 0,45 | 79,6% | 763/959 | 82,7% | 86,9% | 90,4% | không đạt (thiếu 5 đoạn) |

Đọc bảng: mức "mọi dòng" của EN2002a giảm dần theo θ (80,9% xuống 79,6%), còn "dòng ≥ 1 s" gần như phẳng (86,5% đến 87,5%) và
luôn trên 85%. Chênh lệch giữa các θ chỉ vài đoạn trên 959, nên phép đo có độ phân giải thô và chưa được kiểm định thống kê. Kết
luận "chỉ với θ ≤ 0,35" đúng cho các θ đã thử (0,25–0,45); chưa thử θ nằm giữa 0,35 và 0,37. Bảng này không dùng để chọn θ (chọn chỉ
trên dev, như trên).

## Điều cần biết

Các số sau lấy từ lượt chạy bổ sung trên cùng cache nhúng (cùng lệnh `speaker-eval --embeddings-in` và `score_spk.py`), **không dùng
để chọn tham số** (chọn chỉ trên dev, như trên); ghi để kế hoạch 02 biết giới hạn của phép đo.

1. **Luật gộp giọng chưa được AMI kiểm chứng.** Ở ngưỡng gộp 0,70 và `merge_min_ms` mặc định 10 s, kết quả của cả 6 bản ghi
   giống hệt "không bao giờ gộp", ở cả θ = 0,35 và θ = 0,40: luật không kích hoạt lần nào. Hạ ngưỡng xuống 0,50 (θ = 0,35) làm
   EN2002a.Mix-Headset kém đi (dòng ≥ 1 s 86,3% so với 87,3%; mọi dòng 78,6% so với 80,2%) và không đổi 5 bản ghi còn lại.
   Vì vậy giá trị `gộp=1.10` ở trên không có nghĩa đã chứng minh gộp là có hại ở 0,70, và cũng không có bằng chứng gộp giúp gì.
2. **θ = 0,40 (spec) và 0,35 (chọn) gần như ngang nhau trên dev** (mục tiêu 0,9100 so với 0,9110; đúng 1 đoạn, xem "Ghi chú về
   ngưỡng"). Trên phần kiểm, 0,40 tốt hơn ở IS1009a.Mix-Headset (dòng ≥ 1 s 91,5% so với 89,6%; mọi dòng 87,3% so với 85,7%) và
   IS1009a.Array1-01 (mọi dòng 86,5% so với 85,7%), kém hơn ở ES2004a.Array1-01 (mọi dòng 86,8% so với 88,7%; 7 giọng so với 6) và
   EN2002a.Mix-Headset (mọi dòng 79,9% so với 80,2%). Chênh lệch chỉ vài điểm, hai chiều lẫn lộn, và chưa kiểm định thống kê; trung
   bình 4 bản ghi kiểm bằng nhau (mọi dòng 85,1% ở cả hai θ). Ngang nhau về trung bình không có nghĩa là ngang nhau về mức đạt: chỉ
   ở EN2002a mà 0,35 đạt và 0,40 không đạt mức "mọi dòng ≥ 80%" theo từng bản ghi (769 so với 766 trên 959 đoạn, cần 768), nên chọn
   giữa hai θ quyết định A-spk1 theo cách đọc chặt nhất (xem mục tiếp theo).
3. **Số giọng hiện ra nhiều hơn số người ở 4 trên 6 bản ghi** (5/4, 5/4, 8/4, 6/4; chỉ TS3003a và IS1009a.Array1-01 đúng 4/4).
   EN2002a chạm trần `max_voices` = 8. Người dùng sẽ thấy giọng thừa; nhãn "đúng người" ở các bảng trên vẫn tính giọng thừa là sai
   (Hungarian mỗi giọng một người).
4. **Đo trên tiếng Anh, bản ghi họp AMI.** Chưa có số cho tiếng Việt (Task riêng của
   kế hoạch) và chưa có số cho cuộc họp thực qua app (âm thanh nén bởi Zoom, Meet, Teams).

## Quyết định cho kế hoạch 02 / Task 15

Chỉ ghi vấn đề; chưa đổi mặc định trong code hay trong spec. Quyết định để lại cho Task 15 của kế hoạch 01 (ghi tham số chốt vào
spec, xin duyệt) và chủ dự án, trước khi viết kế hoạch 02.

**Vấn đề.** `SpeakerConfig::default().theta` trong `crates/speaker-worker/src/cluster.rs` và spec §5.3 hiện là θ = 0,40 (spec ghi
"chọn trên dev AMI", nhưng phép chọn trên dev ở trên cho 0,35). Với θ = 0,40, A-spk1 theo từng bản ghi kiểm **không đạt**: mọi dòng
của EN2002a.Mix-Headset là 79,9% (766/959, cần 768). Chỉ θ ≤ 0,35 đạt (bảng nhạy ở trên). Theo trung bình 4 bản ghi kiểm, cả hai θ đạt.

**Hai lựa chọn.**

1. **Đổi mặc định thành 0,35** (sửa `SpeakerConfig::default()` và spec §5.3, ghi "chốt ở kế hoạch 01, `results/nhan-giong-ami.md`").
   Được: khớp phép chọn trên dev, A-spk1 đạt theo cách đọc chặt nhất, và 0,35 cho ít giọng thừa hơn 0,40 ở hai bản ghi
   (IS1009a.Mix-Headset 5 so với 6; ES2004a.Array1-01 6 so với 7; bốn bản ghi còn lại bằng nhau). Mất/rủi ro: đạt chỉ hơn 1 đoạn
   (0,1%) trên một bản ghi; lợi thế của 0,35 trên dev là đúng 1 đoạn; và 0,40 chính xác hơn ở IS1009a.Mix-Headset (mọi dòng 87,3%
   so với 85,7%).
2. **Giữ 0,40** và ghi mốc chống thụt lùi A-spk1 ở θ = 0,35 (kế hoạch 02 chạy lại phép đo này với θ = 0,35 làm cổng, không phải
   θ mặc định). Được: giữ giá trị spec đã duyệt. Mất/rủi ro: mặc định của app không phải điểm đã đạt A-spk1 theo từng bản ghi; spec
   phải ghi rõ điều này thay vì ghi "chọn trên dev".

Người quyết: chủ dự án, ở Task 15.

**Đã quyết (Task 15, 2026-10-26):** chủ dự án chọn lựa chọn 1, θ = 0,35. `SpeakerConfig::default()` và spec §5.3 đã
đổi; ngưỡng gộp mặc định đổi thành 1,10 (tắt), spec §5.4. Tổng hợp ở `tong-hop.md`.
