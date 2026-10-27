# Độ trễ khi bật nhận giọng, đo xen kẽ bật/tắt (A-spk4, spec §11, §12)

Kế hoạch 02b, Task 4. Đo `latency-bench session` chạy đúng `Engine::start_with_speaker` với `asr-worker`, `llama-server` và
`speaker-worker` thật, xen kẽ tắt/bật nhận giọng trên cùng bản dựng và cùng đoạn âm thanh, theo giao thức nghiệm thu A2 của
nguồn micro (`bench/2026-10-24-nguon-micro/results/nghiem-thu.md`). Ngoài mức đạt A-spk4, file này ghi hai câu hỏi mở: khứ hồi
của nhãn khi chạy cùng hai tiến trình phụ (mốc 230 ms của kế hoạch 01) và hàng đợi dịch khi bật so với tắt (QĐ 12 của file 02),
cả khi dịch quá tải. Dữ liệu thô (JSON của `session`, log tiến trình phụ, tải máy) ở `$DATA/out/02/a-spk4/` (ngoài repo).

**Kết luận ngắn:** A-spk4 **đạt**, với khoảng cách lớn. Bật nhận giọng không làm chậm phụ đề; trên M4 Pro lượt bật còn nhanh hơn
lượt tắt một chút ở cả 6 cặp (A2 p50 −11,8 ms, p90 −26,4 ms, chữ đầu −18,2 ms). Phần nhanh hơn này không nên coi là lợi ích của
tính năng (xem mục "Vì sao bật lại nhanh hơn"). Hàng đợi dịch khi bật y hệt khi tắt, cả lúc dịch quá tải (2000 và 3000 ms); ở 3000 ms nhánh gộp khác giọng
chạy và câu gộp lẫn giọng không mang nhãn, đúng QĐ 12 của file 02.

## Điều kiện

- Máy: Apple M4 Pro, 12 lõi, 24 GB RAM, macOS 26.6.2. Cắm điện (`pmset`: AC Power, pin 100%, đã sạc đầy) suốt mọi lượt.
- Bản dựng: nhánh `phan-biet-nguoi-noi`, commit nền `046c41e6` cộng các thay đổi chưa commit của kế hoạch 01, 02 và 02b
  Task 1–3. `MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release -p speaker-worker -p latency-bench` và
  `cargo build --release -p asr-worker --features metal,shared-encode` (dựng sẵn lúc 04:09–04:18 ngày 2026-10-27, không file `.rs` nào của
  `latency-bench`, `pipeline`, `speaker-worker`, `speaker-protocol` mới hơn binary `latency-bench`; `speaker-worker` có `minos 14.2`). `asr-worker` là bản Metal: binary liên kết `Metal.framework`, log
  của mọi lượt in `backend=metal flash_attn=off decode_mode=shared`.
- Model: nhận dạng `ggml-large-v3-turbo-q5_0.bin` (gói Chuẩn), dịch `Hy-MT2-1.8B-Q8_0.gguf` qua `llama-server` b11669, nhúng giọng
  `eres2net-sv-en-voxceleb-16k.onnx` (cách B' + A2 4 s, `SpeakerConfig::default()`, θ = 0,35; worker chạy với
  `RAYON_NUM_THREADS=2` như app). VAD Silero v6.2.3.
- Tham số `session`: `--languages en,zh,ja,ko,vi --target vi --end-silence-ms 50` (ngắt câu 50 ms, mặc định của app), không bật
  dịch trong lúc nói. Lượt bật thêm `--speaker-worker target/release/speaker-worker --speaker-model …onnx`; lượt đo chờ worker sẵn
  sàng trước khi phát (app thì không chờ).
- Hai session S6 của phase 0 (`$M/bench/phase0/data/latency/`): `en` (183 s, 21 câu mốc, 50 đoạn) và `mixed` (192 s, 20 câu mốc,
  74 đoạn). Thứ tự chạy liền nhau, không nghỉ: `en` tắt 1, bật 1, tắt 2, bật 2, tắt 3, bật 3, rồi `mixed` cùng thứ tự (04:46–05:24).
- Máy có người dùng khác. Tải trung bình 1 phút (`uptime`) trước và sau mỗi lượt: 3,37–7,24 (Step 2), 3,67–8,07 (Step 4, 5).
  Tải nền chủ yếu do dịch vụ hệ thống (Storage Management, Spotlight lập chỉ mục, Microsoft Defender; `ps` lúc tải 8). Không
  lượt nào in "CẢNH BÁO": phát lại trễ so với thời gian thực tối đa 12–50 ms (ngưỡng cảnh báo 100 ms), không tiến trình phụ nào
  khởi động lại, không câu nào dịch lỗi. Không có tiến trình phụ của phiên khác chạy song song (kiểm `pgrep` trước mỗi lượt).
  Không lượt nào nhiễu rõ rệt (số của mỗi lượt nằm trong dải của các lượt cùng chế độ), nên không chạy lại lượt nào.

## Bảng 12 lượt (Step 2)

Thời gian tính bằng ms. "Chữ đầu" là `a2_first_p50_ms`. "Nhãn" là số `Assign` (tới khi đoạn còn chờ nhận dạng / tới muộn).
"Khứ hồi" là từ lúc gửi `Segment` tới lúc có trả lời (`SpeakerHandle::round_trip_ms`). Tải là `uptime` 1 phút trước → sau lượt.

| Session | Lượt | Chế độ | A2 p50 | A2 p90 | Chữ đầu p50 | Đầu câu → chữ p50 | Câu đo / câu | Đoạn | Nhãn (đúng lúc / muộn) | Khứ hồi p50 / p90 | ≤ 230 ms | Tải |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 1 | tắt | 763 | 950 | 418 | 5 460 | 21 / 21 | 50 | — | — | — | 7,24 → 4,91 |
| en | 1 | bật | 743 | 919 | 413 | 5 445 | 21 / 21 | 50 | 50 (50 / 0) | 152 / 227 | 46/50 | 4,91 → 4,54 |
| en | 2 | tắt | 756 | 909 | 422 | 5 488 | 21 / 21 | 50 | — | — | — | 4,54 → 3,59 |
| en | 2 | bật | 749 | 887 | 403 | 5 451 | 21 / 21 | 50 | 50 (50 / 0) | 152 / 221 | 47/50 | 3,59 → 3,67 |
| en | 3 | tắt | 774 | 913 | 433 | 5 462 | 21 / 21 | 50 | — | — | — | 3,67 → 3,37 |
| en | 3 | bật | 749 | 889 | 405 | 5 446 | 21 / 21 | 50 | 50 (49 / 1) | 152 / 219 | 48/50 | 3,37 → 3,76 |
| mixed | 1 | tắt | 558 | 714 | 409 | 3 457 | 20 / 20 | 74 | — | — | — | 3,76 → 4,75 |
| mixed | 1 | bật | 562 | 677 | 386 | 3 441 | 20 / 20 | 74 | 74 (74 / 0) | 106 / 217 | 71/74 | 4,75 → 3,71 |
| mixed | 2 | tắt | 564 | 710 | 393 | 3 450 | 20 / 20 | 74 | — | — | — | 3,71 → 4,01 |
| mixed | 2 | bật | 553 | 683 | 384 | 3 439 | 20 / 20 | 74 | 74 (73 / 1) | 106 / 217 | 72/74 | 4,01 → 3,96 |
| mixed | 3 | tắt | 564 | 698 | 408 | 3 463 | 20 / 20 | 74 | — | — | — | 3,96 → 5,08 |
| mixed | 3 | bật | 552 | 682 | 383 | 3 437 | 20 / 20 | 74 | 74 (73 / 1) | 112 / 216 | 72/74 | 5,08 → 4,15 |

Mọi lượt: 0 câu `Skip`, 0 câu dịch lỗi, 0 đoạn bị bỏ, hàng đợi dịch dài nhất 1 câu; số lần dịch 50 (`en`) và 73 (`mixed`, cộng 1
đoạn cùng ngôn ngữ đích không dịch) ở cả hai chế độ.

## Trung bình, chênh lệch và mức đạt

Chênh từng cặp = lượt bật trừ lượt tắt ngay trước nó (cùng session, cùng số lượt). Khoảng tin cậy 95% theo phân phối t của các
chênh từng cặp (6 cặp: t = 2,571; 3 cặp mỗi session: t = 4,303). Mức đạt của spec §11, §12: A2 p50 chậm thêm ≤ 20 ms, p90 ≤ 50 ms,
chữ đầu p50 ≤ 20 ms; so bằng chênh trung bình.

| Chỉ số | Tắt (tb 6 lượt) | Bật (tb 6 lượt) | Chênh tb | Chênh từng cặp (en 1–3, mixed 1–3) | KTC 95% | Mức đạt | Kết luận |
|---|---|---|---|---|---|---|---|
| A2 p50 | 663,1 | 651,3 | −11,8 | −20, −7, −25, +4, −11, −11 | [−22,4; −1,2] | ≤ +20 | **Đạt** |
| A2 p90 | 815,8 | 789,3 | −26,4 | −31, −22, −24, −37, −28, −16 | [−34,2; −18,6] | ≤ +50 | **Đạt** |
| Chữ đầu p50 | 413,9 | 395,8 | −18,2 | −5, −19, −28, −24, −8, −25 | [−28,2; −8,1] | ≤ +20 | **Đạt** |
| Đầu câu → chữ dịch p50 (theo dõi) | 4 463,2 | 4 443,1 | −20,2 | −15, −36, −16, −16, −12, −26 | [−29,9; −10,5] | — | — |

Theo từng session (3 cặp, khoảng tin cậy rộng hơn):

| Session | A2 p50: chênh tb [KTC 95%] | A2 p90 | Chữ đầu p50 |
|---|---|---|---|
| en | −17,4 [−40,6; +5,7] | −25,8 [−38,2; −13,4] | −17,3 [−46,3; +11,7] |
| mixed | −6,2 [−27,7; +15,3] | −27,0 [−53,3; −0,8] | −19,0 [−42,6; +4,5] |

Ngay cả cận trên của khoảng tin cậy (trường hợp xấu nhất mà số đo còn cho phép) cũng dưới mức đạt: gộp 6 cặp, A2 p50 tệ nhất
−1,2 ms (mức +20), p90 −18,6 ms (mức +50), chữ đầu −8,1 ms (mức +20); theo từng session tệ nhất +15,3 ms (A2 p50 của `mixed`)
và +11,7 ms (chữ đầu của `en`), vẫn dưới +20. Không có lượt bật nào bị tắt nhận giọng giữa chừng (`speaker_disabled` rỗng ở cả 6
lượt bật của Step 2 và 6 lượt bật của Step 4, 5 và phần thêm 3000 ms).

### Vì sao bật lại nhanh hơn

Bật nhanh hơn tắt ở 41/41 câu mốc (chênh A2 trung bình 3 lượt theo từng câu: `en` trung vị −21 ms, 21/21 câu; `mixed` trung vị
−13,5 ms, 20/20 câu). Không do cách ghép câu: với `mixed`, ranh giới mọi câu phụ đề giống hệt nhau giữa bật và tắt (49 câu, cùng
25 lần ghép); với `en`, bật tách thêm đúng một câu, ở chỗ worker gán hai giọng khác nhau cho hai đoạn liền nhau (41 câu so với 40, ghép 9 lần
so với 10; luật ghép câu không ghép hai giọng đã biết khác nhau), nhưng câu nào cũng nhanh hơn. Thời gian của từng bước cũng nhanh hơn khi bật, ở mọi cặp: nhận dạng p50 222–231 ms so với 230–241 ms, dịch p50
186–214 ms so với 191–221 ms; %CPU (thời gian CPU chia thời gian thực) của `llama-server` 24,4–28,6% so với 26,6–31,7%.
Giả thuyết (chưa kiểm, cần `powermetrics` có quyền quản trị): hoạt động CPU của `speaker-worker` giữ cụm lõi hiệu năng ở xung
nhịp cao hơn, nên phần chạy trên CPU của nhận dạng và dịch (chuẩn bị, gửi lệnh Metal, lấy mẫu) nhanh hơn chút ít; kế hoạch 01 đã
thấy xung nhịp đổi theo tải (Chrome 1,3 → 2,9 GHz khi bị đọc cây giao diện, `teams-chrome.md`). Thứ tự chạy (bật luôn sau tắt) khó giải thích được: lượt tắt chạy ngay sau
một lượt bật vẫn chậm trở lại. Hệ quả: số này cho thấy bật **không làm chậm** trên M4 Pro; không dùng nó để nói bật làm nhanh
hơn, và trên máy yếu (Windows i5, Task 8) kết quả có thể khác.

## Khứ hồi của nhãn khi chạy cùng `asr-worker`, `llama-server`

Câu hỏi mở của kế hoạch 01: mốc 230 ms (thời gian nhận dạng một đoạn, spec §4.4) khi chạy cùng hai tiến trình phụ.

| Dữ liệu | Lượt bật | Đoạn có trả lời | Khứ hồi p50 (ms) | Khứ hồi p90 (ms) | ≤ 230 ms | Nhãn tới trước kết quả nhận dạng |
|---|---|---|---|---|---|---|
| S6 `en` | 3 | 150 | 151,8 / 152,3 / 152,2 | 227,4 / 221,1 / 219,2 | 141/150 (94,0%) | 149/150 (99,3%) |
| S6 `mixed` | 3 | 222 | 106,1 / 106,4 / 111,8 | 217,0 / 217,0 / 215,7 | 215/222 (96,8%) | 220/222 (99,1%) |
| AMI `xen-ke.wav` (Step 4) | 2 | 194 | 80,8 / 85,8 | 204,6 / 215,9 | 192/194 (99,0%) | 194/194 (100%) |
| AMI `xen-ke.wav`, dịch quá tải 2000 ms (Step 5) | 2 | 194 | 83,0 / 85,7 | 211,5 / 208,8 | 191/194 (98,5%) | 193/194 (99,5%) |
| AMI `xen-ke.wav`, dịch quá tải 3000 ms (thêm) | 2 | 194 | 87,7 / 86,4 | 204,2 / 201,8 | 192/194 (99,0%) | 194/194 (100%) |
| Cộng | 12 | 954 | — | — | 931/954 (97,6%) | 950/954 (99,6%) |

- Thời gian nhận dạng thật của chính các đoạn (`asr_p50_ms` của các lượt bật): 222–231 ms (S6). Nhãn tới trước kết quả nhận dạng ở
  99,6% số đoạn; 4/954 nhãn tới muộn và đi qua đường cập nhật nhãn muộn, đúng thiết kế (spec §4.3).
- So với kế hoạch 01 (worker chạy một mình, đo thời gian nhúng, không giao thức; `ram.md`): nhúng p50 89,8–90,7 ms, p90
  190,7–198,0 ms, 452/452 ≤ 230 ms. Khi chạy cùng hai tiến trình phụ, p90 khứ hồi là 202–227 ms và 2,4% số đoạn quá 230 ms. Hai
  phép đo khác nhau (khứ hồi gồm giao thức và chờ trong worker; dữ liệu khác nhau), nên không tách được phần chậm thêm do chạy cùng.
  p50 của `en` cao hơn (152 ms) vì đoạn dài hơn: worker báo nhúng trung bình 150–153 ms (`en`), 121–122 ms (`mixed`), 113–115 ms
  (AMI) mỗi lần.

## Hàng đợi dịch (Step 3 và Step 4)

Dịch kịp lời nói (không ép chậm), bật so với tắt.

| Dữ liệu | Chế độ | Lượt | Đoạn | Câu dịch | Gộp | Gộp khác giọng | `Skip` | Hàng dài nhất | Chờ lâu nhất (ms) | Nhãn |
|---|---|---|---|---|---|---|---|---|---|---|
| S6 `en`, `mixed` (Step 2) | tắt | 6 | 50 / 74 | 50 / 73 | 0 | 0 | 0 | 1 | 0 | — |
| S6 `en`, `mixed` (Step 2) | bật | 6 | 50 / 74 | 50 / 73 | 0 | 0 | 0 | 1 | 0 | 372 |
| AMI `xen-ke.wav` (Step 4) | tắt | 1 | 97 | 97 | 0 | 0 | 0 | 1 | 96 | — |
| AMI `xen-ke.wav` (Step 4) | bật | 1 | 97 | 97 | 0 | 0 | 0 | 1 | 0 | 97 |
| AMI `xen-ke.wav` (Step 4) | tắt | 2 | 97 | 97 | 0 | 0 | 0 | 1 | 0 | — |
| AMI `xen-ke.wav` (Step 4) | bật | 2 | 97 | 97 | 0 | 0 | 0 | 1 | 0 | 97 |

`xen-ke.wav`: 300 s đầu của AMI `IS1009a.Mix-Headset.wav` (bốn người), truth rỗng nên không tính A2, chỉ đếm. M4 Pro dịch kịp nên
không có tồn đọng ở cả hai chế độ (dịch p50 118–126 ms), đúng như kế hoạch dự kiến; trường hợp dịch chậm hơn lời nói đo ở mục sau.

## Hàng đợi dịch quá tải (Step 5)

Cùng `xen-ke.wav`, mỗi lần dịch chờ thêm `--mt-extra-ms 2000` (dịch p50 2 156–2 160 ms, chậm hơn nhịp câu). Có quá tải thật: lượt
tắt có gộp 6 > 0 và hàng dài nhất 3 ≥ 3, nên giữ 2000 ms như kế hoạch, không tăng.

| Lượt | Chế độ | Đoạn | Câu dịch | Gộp | Gộp khác giọng | `Skip` | Hàng dài nhất | Chờ lâu nhất (ms) | Nhãn (đúng lúc / muộn) | Tải |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | tắt | 97 | 90 | 6 | 0 | 0 | 3 | 5 376 | — | 4,25 → 4,19 |
| 1 | bật | 97 | 90 | 6 | 0 | 0 | 3 | 5 376 | 97 (97 / 0) | 4,19 → 6,53 |
| 2 | tắt | 97 | 90 | 6 | 0 | 0 | 3 | 5 376 | — | 6,53 → 3,67 |
| 2 | bật | 97 | 90 | 6 | 0 | 0 | 3 | 5 280 | 97 (96 / 1) | 3,67 → 4,21 |

- **Bật không tệ hơn tắt:** hàng dài nhất bằng nhau (3), câu chờ lâu nhất bằng hoặc ngắn hơn (5 376 và 5 280 ms so với 5 376 ms ở
  cả hai lượt tắt), cùng 0 câu `Skip`, cùng 6 câu gộp và 90 câu dịch. Ba lần gộp (mỗi lần hai câu vào câu trước) rơi vào đúng cùng các câu ở cả bốn lượt.
- **Gộp khác giọng = 0, khác mong đợi của kế hoạch (> 0).** Cả ba lần gộp của lượt bật đều nằm trong dãy câu cùng một giọng (nhãn
  của các câu bị gộp: 2 và 2, 2 và 2, 1 và 1). Trong 300 s này worker gán nhãn cho cả 95 câu phụ đề và chỉ có 13 chỗ hai câu liền
  nhau khác giọng; hàng đầy đúng lúc một người nói nhiều câu liền, nên lượt 1 của `merge_runs` (không gộp hai giọng khác nhau) đã
  gộp đúng như cách gộp lúc tắt và lượt 2 (gộp cả câu khác giọng) không phải chạy. Như vậy ở 2000 ms phép đo chưa thử nhánh gộp khác
  giọng trên tiếng thật (nhánh đó tới đây mới có test mô phỏng của file 02, QĐ 12); mục sau thử ở 3000 ms.

### Thêm ngoài kế hoạch: quá tải nặng hơn, `--mt-extra-ms 3000`

Để thử nhánh gộp khác giọng trên tiếng thật, chạy thêm cùng `xen-ke.wav` với `--mt-extra-ms 3000` (bậc kế tiếp mà Step 5 dùng khi
chưa quá tải), xen kẽ tắt/bật hai lần (06:05–06:25, tải 4,10–5,54). Dữ liệu thô: `$DATA/out/02/a-spk4/qua-tai-3000/`.

| Lượt | Chế độ | Đoạn | Câu dịch | Gộp | Gộp khác giọng | `Skip` | Hàng dài nhất | Chờ lâu nhất (ms) | Nhãn (đúng lúc / muộn) | Khứ hồi p50 / p90 | Tải |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | tắt | 97 | 71 | 24 | 0 | 0 | 3 | 8 928 | — | — | 5,54 → 4,10 |
| 1 | bật | 97 | 71 | 24 | 1 | 0 | 3 | 8 928 | 97 (97 / 0) | 87,7 / 204,2 | 4,10 → 5,16 |
| 2 | tắt | 97 | 71 | 24 | 0 | 0 | 3 | 8 928 | — | — | 5,16 → 4,29 |
| 2 | bật | 97 | 71 | 24 | 1 | 0 | 3 | 8 928 | 97 (97 / 0) | 86,4 / 201,8 | 4,29 → 4,54 |

- Dịch p50 3 189–3 199 ms. Quá tải nặng hơn rõ: 24 câu gộp trong 12 nhóm, câu chờ lâu nhất 8,9 s, vẫn 0 câu `Skip` (ngưỡng 20 s).
- **Bật vẫn y hệt tắt:** cả bốn lượt có đúng cùng 12 nhóm gộp (cùng câu đầu, cùng các câu bị gộp vào), cùng hàng dài nhất 3, cùng
  câu chờ lâu nhất 8 928 ms, cùng 71 câu dịch, 0 `Skip`.
- **Nhánh gộp khác giọng chạy đúng QĐ 12:** ở cả hai lượt bật có đúng 1 nhóm gộp lẫn giọng (một câu giọng 2 và hai câu giọng 3); câu
  gộp ra **không có nhãn** (`speaker` rỗng), đúng luật "câu gộp từ hai giọng đã biết khác nhau không mang nhãn". Đó là câu không nhãn
  duy nhất trong 95 câu phụ đề của mỗi lượt bật; 11 nhóm còn lại chỉ có một giọng và giữ nhãn.

## Tải của `speaker-worker` (chỉ để đối chiếu)

`usage.speaker-worker` của `session`: RSS đỉnh trong lúc phát (đổi MiB sang MB 10^6) và %CPU trung bình theo thời gian (thời gian
CPU tích lũy chia thời gian thực, phần trăm một lõi). Số theo lệnh, năng lượng và RSS dài hạn: Task 5 (`02-soak.md`).

| Dữ liệu | Lượt bật | RSS đỉnh (MB) | CPU tb (% một lõi) |
|---|---|---|---|
| S6 `en` | 3 | 153,0 / 155,9 / 163,6 | 6,60 / 6,48 / 6,49 |
| S6 `mixed` | 3 | 142,5 / 140,7 / 146,2 | 7,54 / 7,49 / 7,53 |
| AMI `xen-ke.wav` (Step 4) | 2 | 145,9 / 152,2 | 4,84 / 4,90 |
| AMI `xen-ke.wav`, quá tải 2000 ms (Step 5) | 2 | 152,2 / 154,2 | 4,85 / 4,85 |
| AMI `xen-ke.wav`, quá tải 3000 ms (thêm) | 2 | 160,3 / 150,2 | 4,86 / 4,82 |

Dưới ngân sách RAM ≤ 250 MB và CPU ≤ 8% một lõi của spec §11 trong mọi lượt (%CPU tính trên cả session, gồm khoảng lặng). RSS đỉnh và CPU của `asr-worker` (675–730 MiB, ≤ 1,3%) và RSS của `llama-server` (2 068–2 173 MiB) không khác giữa
bật và tắt.

## Kết luận

- **A-spk4 đạt** trên M4 Pro: chênh trung bình 6 cặp A2 p50 −11,8 ms (mức ≤ +20), p90 −26,4 ms (≤ +50), chữ đầu −18,2 ms (≤ +20);
  cận trên của khoảng tin cậy 95% cũng dưới mức ở cả gộp lẫn từng session. Không lượt bật nào bị tắt nhận giọng giữa chừng.
- Lượt bật nhanh hơn lượt tắt ở mọi cặp và mọi câu; nhiều khả năng do xung nhịp CPU (chưa kiểm), không phải lợi ích của tính năng.
- Khứ hồi của nhãn khi chạy cùng hai tiến trình phụ: p50 81–152 ms, p90 202–227 ms, 97,6% số đoạn ≤ 230 ms; 99,6% nhãn tới trước
  kết quả nhận dạng. p90 dưới 230 ms ở mọi lượt.
- Hàng đợi dịch: khi dịch kịp, cả hai chế độ không có tồn đọng; khi dịch quá tải, bật y hệt tắt: ở 2000 ms hàng dài nhất 3, chờ lâu
  nhất 5,3–5,4 s, 0 `Skip`; ở 3000 ms (thêm) cùng 12 nhóm gộp, chờ lâu nhất 8,9 s, 0 `Skip`. Nhánh gộp khác giọng không chạy ở 2000 ms
  (mọi lần gộp rơi vào dãy cùng giọng), chạy ở 3000 ms (1 nhóm mỗi lượt bật, câu gộp không nhãn), đúng QĐ 12.

## Ghi cho Task 9 (tổng hợp)

- Không có điều nào chạm ngưỡng "Điều cần chủ dự án duyệt" của Step 3, Step 5: khứ hồi p90 cao nhất 227,4 ms (dưới 230), số câu `Skip`
  khi bật bằng khi tắt (0), hàng đợi và câu chờ khi bật không dài hơn khi tắt ở mọi kịch bản.
- Cần nói rõ khi dùng số: lượt bật nhanh hơn lượt tắt trên M4 Pro, chưa rõ nguyên nhân (giả thuyết xung nhịp); không công bố như lợi
  ích. Trên Windows i5 (Task 8 không đo `session`) chưa có số A-spk4.
- Phần 3000 ms là ngoài kế hoạch (kế hoạch chỉ tăng bậc khi chưa quá tải); thêm vì ở 2000 ms nhánh gộp khác giọng không chạy.

## Chạy lại

Đường dẫn như kế hoạch 02b (`W`, `M`, `DATA`); chạy trong `$W`, bản dựng như mục "Điều kiện".

```sh
S=$M/bench/phase0/data/latency; L=$M/tools/llama-b11669/macos-arm64/llama-b11669/llama-server
SPK="--speaker-worker target/release/speaker-worker --speaker-model $DATA/models/eres2net-sv-en-voxceleb-16k.onnx"
# Step 2: 12 lượt; mỗi session tắt/bật xen kẽ 3 lần ($extra rỗng khi tắt, "$SPK" khi bật)
target/release/latency-bench session --wav $S/<en|mixed>.wav --truth $S/<en|mixed>.truth.json \
  --asr-worker target/release/asr-worker --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --llama-server $L \
  --mt-model $M/models/Hy-MT2-1.8B-Q8_0.gguf --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 $extra \
  --out $DATA/out/02/a-spk4/<session>-<off|on>-<i>.json
# Step 4: 300 s đầu AMI, truth rỗng
ffmpeg -loglevel error -y -i $DATA/ami/IS1009a.Mix-Headset.wav -t 300 -ar 16000 -ac 1 -c:a pcm_s16le xen-ke.wav
echo '[]' > xen-ke.truth.json   # rồi chạy như trên với --wav xen-ke.wav --truth xen-ke.truth.json, 2 × (tắt, bật)
# Step 5: như Step 4, thêm --mt-extra-ms 2000; phần thêm: --mt-extra-ms 3000, ra $DATA/out/02/a-spk4/qua-tai-3000/
```

Chênh lệch tính bằng script Step 3 của kế hoạch 02b (đầu ra lưu ở `$DATA/out/02/a-spk4/step3.txt`); khoảng tin cậy, bảng từng lượt
và so từng câu tính lại từ cùng các file JSON. Tải máy mỗi lượt: `$DATA/out/02/a-spk4/tai-may.tsv`.
