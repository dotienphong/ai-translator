# Độ trễ của phụ đề dịch: đo hiện trạng và thử các cách làm nhanh hơn (2026-10-10)

Nghiên cứu cho yêu cầu "dịch nhanh nhất có thể, tức thì nếu được". Thiết kế rút ra từ đây:
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`.

**Máy và điều kiện:** MacBook Pro M4 Pro 24 GB, macOS 26.6.2, Metal. `llama-server` b11146 và `asr-worker` sidecar
của app (whisper.cpp 1.8.3 có vá, chế độ B, sàn `audio_ctx` 512). Model trong `models/` (Hy-MT2-1.8B Q8_0 và Q4_K_M,
whisper large-v3-turbo q5_0 và small q5_1). Khác với S6, **không kiểm soát tải nền** (máy đang dùng bình thường), nên
mọi số ở đây chỉ để so các cách với nhau, không thay mốc A2.

Thuật ngữ: *đoạn* là phần âm thanh VAD cắt ra; *chép từng phần* là chép đoạn đang mở khi người nói chưa dừng;
*chốt* là coi phần đầu của bản chép hay bản dịch là ổn định (không đổi nữa); LocalAgreement-2 chốt phần chung của hai
kết quả liền nhau.

## 0. Hiện trạng: độ trễ nằm ở đâu

Đọc code (`main` ac069a9) và mô phỏng segmenter của app trên 6 session S6 (`bench/phase0/data/latency/*.wav`).

**Sau khi người nói ngừng, ngưỡng 50 ms (mặc định của app), gói Chuẩn:** khoảng 30–60 ms thu âm và resample
(`capture.rs` ngủ cố định 20 ms trước mỗi lần đọc; rubato khối 1024 mẫu), khoảng 32 ms VAD còn báo "đang nói", 64 ms im
lặng (2 khung), 242 ms ASR (p50; turbo, encoder chiếm khoảng 85% vì sàn 512 cố định), 39 ms tới chữ dịch đầu (gồm
`/tokenize`), 10–20 ms tới màn hình: **chữ dịch đầu tiên khoảng 0,42–0,46 s** (gói Nhẹ 0,30–0,34 s), đủ câu thêm khoảng
0,25 s (p50) và 0,57 s (p90).

**Trong lúc người nói chưa dừng thì chưa có gì:** app chỉ chép lời khi đoạn đóng.

| Mô phỏng segmenter trên 6 session S6 | 300 ms (lúc đo A2) | 50 ms (mặc định app) |
|---|---|---|
| Số đoạn | 264 | 411 (+56%) |
| Độ dài tiếng nói mỗi đoạn p50 / p90 | 3184 / 6637 ms | 1760 / 4320 ms |
| Số đoạn mỗi câu p50 / p90 / lớn nhất | 2 / 4 / 7 | 3 / 6 / 12 (trần ghép là 3) |
| Từ đầu câu tới lúc đoạn đầu đóng p50 / p90 | 4928 / 7936 ms | 3072 / 5824 ms |
| Mỗi từ chờ đoạn của nó đóng, trung bình | 2351 ms | 1595 ms |

- Số A2 hiện có (p50 khoảng 1 s) đo **từ lúc người nói dừng**, với 300 ms; nó không thấy phần chờ trong lúc nói.
- Khi ghép câu (`Composer::grow`), bản dịch đang hiện bị xóa rồi dịch lại từ đầu; cờ hủy chỉ được kiểm khi có chữ mới.
- ASR và dịch chạy song song ở hai tiến trình nhưng dùng chung GPU, không điều phối.
- Máy Windows yếu (S6 2026-10-07, `bench/phase0/results/s6_windows.md`): riêng phần sau chỗ ngừng đã 1,3–4 s; ở đó sức
  máy là nút thắt.

## 1. Tốc độ thô của model dịch

`llama-bench -p 64,128 -n 32 -fa 0,1 -r 3` (Metal):

| Model | Đọc prompt 64 token | Sinh chữ | Flash attention |
|---|---|---|---|
| Hy-MT2 Q8_0 | khoảng 1390 token/s | 99–103 token/s (khoảng 10 ms/token) | gần như không đổi |
| Hy-MT2 Q4_K_M | khoảng 1340–1370 token/s | 134–146 token/s (khoảng 7 ms/token) | +9% sinh chữ |

Prompt của app được cache (`cache_prompt`), nên chữ dịch đầu ra sau khoảng 18 ms; thời gian dịch gần như tỉ lệ với độ dài
bản dịch.

## 2. Thử 1: dịch lại câu đang lớn dần (`mt_prefix.py`)

Chữ nguồn hoàn hảo (không qua ASR), mỗi bước thêm 2 từ hay 3 chữ (khoảng 0,6–0,8 s lời nói), Q8_0.

| Câu | Số bước | Dịch lại cả câu, p50 | Số từ dịch bị xóa qua các bước | Prefill + LocalAgreement-2, p50 | Chỉ hiện phần chung: số từ rút lại |
|---|---|---|---|---|---|
| en-1 | 16 | 340 ms | 90 | 150 ms | 34 |
| en-2 | 15 | 349 ms | 113 | 188 ms | 20 |
| ja-1 | 17 | 329 ms | 142 | 116 ms | 33 |
| zh-1 | 13 | 299 ms | 102 | 152 ms | 17 |
| ko-1 | 8 | 313 ms | 64 | 211 ms | 17 |
| vi-1 | 14 | 179 ms | 38 | 91 ms | 7 |

- Bản dịch của một câu nói dở đổi rất nhiều giữa các bước. Chỉ hiện phần chung của hai bản liền nhau giảm số từ bị rút
  lại 3–5 lần, nhưng tới gần cuối câu thường mới hiện được dưới một nửa bản cuối.
- **Prefill** (ép phần đã chốt làm đầu câu trả lời, `--prefill-assistant` mặc định bật ở b11146) nhanh gấp khoảng 2 mỗi
  bước, nhưng chốt sớm làm **sai nghĩa** bản cuối:
  - ja-1: "…sẽ có những thông tin mới về việc xác định mức giá mới. Sau đó, đội ngũ bán hàng sẽ đưa ra ý kiến…" (đúng:
    "chúng tôi muốn lắng nghe ý kiến của bộ phận kinh doanh trước khi đưa ra quyết định cuối cùng…").
  - zh-1: "…là phát hành phiên bản mới của sản phẩm trong vòng chưa đầy một giây…" (đúng: "giảm độ trễ… xuống dưới một
    giây").
  - en-1 thêm "lên trang web… hay không. Hoặc…"; ko-1 và vi-1 chỉ khác chữ.
  - Hệ quả cho thiết kế: chốt thận trọng (nhất là ja, ko, zh), và **luôn dịch lại cả câu, không ép, khi người nói ngừng**.
- llama-server b11146 trả lại cả phần prefill trong stream. Prefill có dấu cách ở cuối làm lệch token (mất chữ "mà" ở
  một phép thử), nên phần chốt không được kết thúc bằng khoảng trắng.

## 3. Speculative decoding

Chạy lại thử 1 với `--spec-type` ngram-simple, ngram-map-k, ngram-mod, ngram-cache: bản dịch giống hệt (greedy), thời
gian **không nhanh hơn** (ngram-map-k và ngram-cache còn chậm hơn 5–60%). Lý do: bản dịch khác ngôn ngữ với prompt nên
n-gram hầu như không khớp. Model nháp: Hunyuan-0.5B-Instruct cùng kích thước vocab nhưng khác BOS và tokenizer, chưa rõ
dùng được; ước tính lợi tối đa khoảng 1,2× với bản dịch 20–70 token (khảo sát, mục 7). Không theo hướng này.

## 4. Thử 2: chép từng phần (`asr_partials.py`)

6 clip FLEURS 6–12 s mỗi ngôn ngữ (bộ A4, băng rộng), tiền tố 1,0 s; 1,5 s; … (529 tiền tố), qua `latency-bench
asr-eval`. Độ trễ tính theo âm thanh, chưa cộng thời gian tính, giả định nói đều trong clip; so khớp bỏ dấu câu và
không phân biệt hoa thường.

| Thời gian mỗi lần chép, p50 | 0–2 s | 2–4 s | 4–6 s | 6–8 s | 8–10 s |
|---|---|---|---|---|---|
| turbo (gói Chuẩn) | 197 ms | 210 ms | 228 ms | 240 ms | 258 ms |
| small (gói Nhẹ) | 56 ms | 75 ms | 104 ms | 134 ms | 150 ms |
| Qwen3-ASR-0.6B (gồm HTTP) | 71 ms | 107 ms | 156 ms | 201 ms | 244 ms |

| Chốt bằng LocalAgreement-2, p50 / p90 (ms) và tỉ lệ chốt sai | en | vi | zh | ja | ko |
|---|---|---|---|---|---|
| turbo | 590 / 3906; 13/131 | 570 / 2621; 7/137 | 1060 / 4512; 11/240 | 1780 / 7920; 12/198 | 960 / 5200; 8/87 |
| small | 877 / 4775; 15/132 | 3494 / 7680; 44/136 | 2388 / 6682; 13/237 | 2917 / 7790; 53/196 | 1448 / 7335; 14/83 |
| Qwen3-ASR-0.6B | 947 / 3587; 18/131 | 1653 / 6760; 15/137 | 589 / 1550; 0/239 | 2234 / 7074; 27/192 | 920 / 6500; 2/86 |

- Với turbo, chữ tạm đúng gần như ngay khi được nói (p50 −0,1 tới 0,3 s), chữ chốt sau 0,6–1,8 s tùy tiếng.
- small không dùng được cho bản tạm tiếng Việt, Nhật, Trung (chốt chậm và sai nhiều).
- Turbo mất khoảng 200 ms cố định mỗi lần chép (encoder ở `audio_ctx` 512), nên nhịp 0,5 s đã chiếm khoảng 40% GPU
  chỉ riêng ASR.

## 5. Thử 3: mô phỏng dịch trong lúc nói (`stream_sim.py`)

Bản chép từng phần của turbo (thử 2), mỗi bước dịch bằng Q8_0. "Chờ hết câu" coi cả clip là một đoạn (cận trên, vì với
50 ms clip bị cắt ở các chỗ ngừng ngắn). Không mô phỏng hàng đợi.

Ba cột đầu: từ được nói → có bản dịch chứa nó trên màn hình, p50 / p90 (ms). Cột "rút lại": số từ dịch đã hiện rồi bị
thay, mỗi câu, theo ba cách hiện: mọi bản tạm / chỉ phần chung của hai bản dịch tạm liền nhau / chỉ dịch phần nguồn đã chốt.

| Tiếng | Chờ hết câu | Dịch bản tạm | Chỉ dịch phần nguồn đã chốt | Rút lại mỗi câu | Bản cuối | ASR + dịch mỗi bước, p50 |
|---|---|---|---|---|---|---|
| en | 4355 / 7905 | 667 / 3926 | 1148 / 4356 | 117 / 22 / 48 | khoảng 35 từ | 563 ms |
| vi | 4849 / 8850 | 474 / 1917 | 1182 / 4114 | 87 / 13 / 28 | khoảng 20 từ | 422 ms |
| zh | 4743 / 8691 | 1357 / 3171 | 1872 / 5950 | 145 / 21 / 46 | khoảng 38 từ | 1082 ms |
| ja | 4986 / 9063 | 659 / 3067 | 2400 / 8370 | 121 / 26 / 34 | khoảng 21 từ | 462 ms |
| ko | 5000 / 9550 | 470 / 2190 | 1607 / 5650 | 160 / 34 / 37 | khoảng 36 từ | 623 ms |

- Dịch bản tạm cho chữ chạy theo lời nói (khoảng 0,5–0,7 s; tiếng Trung 1,4 s vì bản dịch dài) nhưng nháy rất nhiều.
  Hiện phần chung của hai bản dịch liền nhau giảm nháy 5–8 lần.
- Mỗi bước tốn 0,4–0,6 s GPU (tiếng Trung khoảng 1,1 s), nên nhịp 0,5 s là quá tải ngay cả trên M4 Pro. Cần nhịp khoảng
  1 s, prefill để mỗi bước chỉ sinh phần mới, và nhường lượt cuối.

## 6. Thử 4: Qwen3-ASR (`qwen3_asr.py`)

Qwen3-ASR (Apache-2.0, 30 ngôn ngữ, có đủ en/vi/zh/ja/ko) được llama.cpp hỗ trợ từ b8769 (PR #19441), nên chạy ngay
trên `llama-server` b11146 của app với `--mmproj`. Bản 0.6B Q8_0 (ggml-org, 805 MB + mmproj 214 MB). Chấm bằng
`bench/phase0/asr/score_asr.py --allow-partial` trên 437 clip băng rộng của A4:

| Tiếng | Qwen3-ASR-0.6B | turbo (`a4_m4pro-turbo-final`) | small (`a4_m4pro-small-final`) | Thời gian p50: Qwen / turbo / small |
|---|---|---|---|---|
| en (WER) | 0,053 | 0,054 | 0,066 | 211 / 228 / 105 ms |
| vi (WER) | 0,093 | 0,087 | 0,225 | 279 / 315 / 177 ms |
| zh (CER) | 0,045 | 0,056 | 0,096 | 209 / 250 / 134 ms |
| ja (CER) | 0,100 | 0,045 | 0,131 | 280 / 340 / 173 ms |
| ko (CER) | 0,057 | 0,041 | 0,082 | 311 / 300 / 160 ms |

- Nhận đúng ngôn ngữ 437/437. Dạng ra `language Vietnamese<asr_text>…`. Không có `no_speech_prob`, nên bộ lọc ảo giác phải
  làm lại nếu dùng.
- Trên Mac không nhanh hơn turbo và kém ở ja, ko; tốt hơn hẳn small ở cả năm tiếng. Theo catalog của transcribe.cpp
  (chưa kiểm trên máy Windows của mình), trên CPU nhanh hơn turbo khoảng 5–6 lần. Đáng làm thành hướng riêng cho gói
  Nhẹ và máy chỉ có CPU; không phải lối tắt cho độ trễ trên Mac.

## 7. Khảo sát tài liệu (2026-10-10)

- **Mức trễ thực tế:** chưa hệ thống nào công bố bản dịch ổn định dưới khoảng 1,4 s. Seed LiveInterpret 2.0: AL
  1,37 s (zh→en) tới 2,7 s (bài dài) ([arXiv 2507.17527](https://arxiv.org/html/2507.17527v2)); Google Meet thiết kế
  cho 2–3 s ([Google](https://blog.google/products-and-platforms/products/workspace/google-meet-langauge-translation-ai/));
  IWSLT 2025 coi "trễ thấp" là StreamLAAL ≤ 2 s (en-de).
- **Chép từng phần trên Whisper:** LocalAgreement-2 ([whisper_streaming](https://arxiv.org/html/2307.14743)) làm được
  bằng API mức thấp của whisper.cpp mà `asr-worker` đã dùng; AlignAtt ([SimulStreaming](https://github.com/ufal/SimulStreaming))
  cần vá whisper.cpp (PR #3660 còn mở). WhisperKit báo bản tạm 0,45 s, bản chốt 1,7 s trên M3 Max nhưng nhờ encoder
  huấn luyện lại ([arXiv 2507.10860](https://arxiv.org/html/2507.10860v1)).
- **whisper.cpp:** bản mới nhất v1.9.5 (2026-10-06); lỗi flash attention với `audio_ctx` rút ngắn (#3941) vẫn chưa
  sửa. Né được nếu `audio_ctx` là bội của 256 (suy từ code, chưa thử). Core ML không dùng được với `audio_ctx` thay đổi.
- **Dịch đồng thời bằng LLM không huấn luyện lại:** chỉ còn dịch lại + luật chốt (LocalAgreement, chừa k chữ cuối) +
  prefill phần đã chốt + dịch lại cả câu ở cuối; tiếng Nhật, Hàn chỉ chốt ở ranh giới mệnh đề vì động từ và phủ định
  nằm cuối câu ([Arivazhagan 2020](https://arxiv.org/abs/1912.03393),
  [Google Translate](https://research.google/blog/stabilizing-live-speech-translation-in-google-translate/),
  [Koshkin 2024](https://arxiv.org/html/2406.13476v3)).
- **Hy-MT2:** không có chế độ streaming hay bản nhỏ hơn 1.8B
  ([Hy-MT2](https://github.com/Tencent-Hunyuan/Hy-MT2)); llama.cpp mới nhất b11541; lỗi keep-alive của stream vẫn mở
  (#29680), nên giữ cách mở kết nối mới mỗi request.
- **Model chép lời khác:** Qwen3-ASR (mục 6); Nemotron 3.5 ASR Streaming 0.6B (streaming thật, nhưng FLEURS vi WER 14,0,
  zh CER 18,9); Apple `SpeechTranscriber` không có tiếng Việt; Voxtral Realtime, Kyutai, SenseVoice, Parakeet v3 không
  có tiếng Việt; SeamlessStreaming và CarelessWhisper giấy phép phi thương mại. Số FLEURS của catalog
  [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp/tree/main/catalog).

## Cách chạy lại

Dữ liệu sinh ra nằm trong `bench/phase0/data/do-tre/` (không commit). Cần `models/`, `tools/` (`bench/phase0/fetch.py`),
bộ clip A4 (`bench/phase0/asr/build_clips.py`), `cargo build --release -p latency-bench` và sidecar
`src-tauri/binaries/asr-worker-aarch64-apple-darwin` (`scripts/copy-sidecars.sh`).

```sh
python3 bench/2026-10-10-do-tre/mt_prefix.py                                   # mục 2
python3 bench/2026-10-10-do-tre/mt_prefix.py -- --spec-type ngram-mod          # mục 3 (đổi kiểu)
llama-bench -m models/Hy-MT2-1.8B-Q8_0.gguf -m models/Hy-MT2-1.8B-Q4_K_M.gguf -p 64,128 -n 32 -fa 0,1 -r 3   # mục 1
python3 bench/2026-10-10-do-tre/asr_partials.py make                           # mục 4
python3 bench/2026-10-10-do-tre/asr_partials.py run turbo                      # và small
python3 bench/2026-10-10-do-tre/qwen3_asr.py bench/phase0/data/do-tre/partials/manifest.jsonl bench/phase0/data/do-tre/partials/out-qwen06.jsonl
python3 bench/2026-10-10-do-tre/asr_partials.py analyze bench/phase0/data/do-tre/partials/out-*.jsonl
python3 bench/2026-10-10-do-tre/stream_sim.py run && python3 bench/2026-10-10-do-tre/stream_sim.py analyze   # mục 5
python3 bench/2026-10-10-do-tre/qwen3_asr.py bench/phase0/data/asr/manifest.jsonl out-qwen06-wb.jsonl         # mục 6, rồi chấm:
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench/phase0/asr/score_asr.py --allow-partial out-qwen06-wb.jsonl
```

`score_asr.py` ghi `bench/phase0/results/a4_<nhãn>.json`; lần đo này không commit file đó (chỉ thử, không phải mốc).
