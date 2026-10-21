# Gói model Nhanh (thiết kế)

Ngày 2026-10-21. Nhánh `goi-nhanh`. Phạm vi: `crates/pipeline` (prompt, cấu hình dịch), `crates/latency-bench`,
`src-tauri/src/models` và `sidecar/paths.rs`, giao diện từ điển thuật ngữ, `scripts/models`, bộ đo trong `bench/`.

## 1. Mục tiêu

Một số khách phản ánh chữ dịch "nhả" chậm và muốn gần như tức thì. App thêm gói model thứ ba, **Nhanh**, dùng một model
dịch nhỏ hơn Hy-MT2 cho cả năm ngôn ngữ, mọi chiều dịch. Người dùng tự chọn gói này khi chấp nhận bản dịch kém chính xác
hơn để đổi lấy tốc độ. Gói Chuẩn và gói Nhẹ giữ nguyên.

Chủ dự án đã chọn (2026-10-21): hướng "một model nhỏ cho mọi ngôn ngữ" (không ghép quickmt, không chưng cất model
riêng), model **NiuTrans LMT-60-0.6B** bản Q8_0, nhận dạng giọng nói **whisper large-v3-turbo** như gói Chuẩn, và chấp
nhận chất lượng thấp hơn mức sàn của gói Nhẹ với mức sàn riêng.

## 2. Số đo làm căn cứ

Đo ngày 2026-10-21 trên MacBook Pro M4 Pro, `llama-server` b11146, gọi `/v1/chat/completions` stream, greedy, repeat
penalty 1,05, bộ test `bench/2026-09-29-mt-benchmark/testset.jsonl` (320 câu có bản dịch chuẩn). Máy không để rảnh, các
lượt chạy lúc khác nhau, nên số tốc độ chỉ để so tương đối. COMET là `Unbabel/wmt22-comet-da`. Hy-MT2 Q8_0 ra 0,836,
khớp mốc 0,837 của benchmark 2026-09-29, nên cách đo dùng được.

Chất lượng (COMET):

| Model | en→vi | vi→en | vi→zh | vi→ja | vi→ko | Cả bộ |
|---|---|---|---|---|---|---|
| Hy-MT2-1.8B Q8_0 (gói Chuẩn) | 0,842 | 0,821 | 0,836 | 0,847 | 0,851 | 0,836 |
| Hy-MT2-1.8B Q4_K_M (gói Nhẹ) | 0,841 | 0,822 | 0,821 | 0,845 | 0,842 | 0,833 |
| LMT-60-0.6B Q8_0 | 0,783 | 0,799 | 0,788 | 0,797 | 0,773 | 0,789 |
| LMT-60-0.6B Q4_K_M | 0,775 | 0,795 | 0,787 | 0,798 | 0,754 | 0,783 |
| LMT-60-1.7B Q8_0 | 0,803 | 0,820 | 0,797 | 0,823 | 0,786 | 0,808 |
| quickmt (vi↔zh/ja/ko qua tiếng Anh) | 0,770 | 0,809 | 0,737 | 0,768 | 0,776 | 0,778 |

Thời gian tới hết câu, trung vị (ms), Metal:

| Model | en→vi | vi→en | vi→zh | vi→ja | vi→ko |
|---|---|---|---|---|---|
| Hy-MT2 Q8_0 | 471 | 254 | 262 | 539 | 656 |
| Hy-MT2 Q4_K_M | 313 | 187 | 163 | 269 | 291 |
| LMT-60-0.6B Q8_0 | 149 | 102 | 95 | 131 | 149 |
| LMT-60-1.7B Q8_0 | 306 | 214 | 208 | 288 | 352 |

- CPU 4 luồng, gần với máy Windows không có GPU tốt: LMT-0.6B mất 131–201 ms, Hy-MT2 Q8_0 mất 330–619 ms.
- Chữ đầu tiên: LMT-0.6B khoảng 20 ms, Hy-MT2 khoảng 50 ms. Thời gian tới chữ đầu gần như không đổi với người dùng (ASR
  và chờ đoạn đóng lớn hơn nhiều, `bench/2026-10-10-do-tre/README.md`). Cái đổi là **tốc độ chữ chạy ra**: cả câu xong
  sớm hơn khoảng 2 lần so với gói Nhẹ, 3 lần so với gói Chuẩn. Đó đúng là điều khách phản ánh.
- Vì sao chọn 0.6B Q8_0: bản 1.7B không nhanh hơn gói Nhẹ; bản Q4_K_M của 0.6B chỉ nhanh hơn khoảng 5% mà mất thêm
  0,006 COMET (0,019 ở vi→ko).
- Các lượt đo trên dùng mẫu prompt có dấu chấm sau câu lệnh; model card dùng dấu hai chấm (§5.2). Số chính thức là số đo
  lại ở §8 với đúng mẫu của app.

Script và kết quả thô của lượt đo này được chép vào `bench/2026-10-21-goi-nhanh/` (§8.1).

## 3. Người dùng thấy gì

- Danh sách gói (bước chọn model lúc cài, và Cài đặt › Model) có thêm gói **Nhanh** (en: Fast). Gói không bao giờ được
  đề xuất tự động (`recommend` giữ nguyên), không có nhãn "Đề xuất".
- Ghi chú chất lượng của gói chỉ nói điều đã đo, kèm điều kiện. Câu chốt sau khi có số ở §8, theo khung:
  - vi: "Dịch nhanh nhất: trên MacBook M4 Pro, mỗi câu dịch xong nhanh khoảng {x} lần so với gói Chuẩn. Đổi lại, bản dịch
    kém chính xác hơn gói Chuẩn và gói Nhẹ, rõ nhất ở tiếng Hàn. Nhận dạng giọng nói giống gói Chuẩn, cần máy có RAM >= 16
    GB."
  - en: cùng ý.
  - Không nêu tên model hay engine (cùng quy tắc với website).
- Dung lượng tải: khoảng 0,8 GB nếu đã có gói Chuẩn (dùng chung file nhận dạng giọng nói), khoảng 1,4 GB nếu chưa. Cách
  hiện dung lượng còn phải tải đã có sẵn (`remainingBytes`).
- App bản cũ (0.1.17 trở xuống) thấy gói Nhanh với nhãn "Cần bản AI Translator mới hơn" và không chọn được (cơ chế
  `min_app_version` đã có).
- Mọi tính năng dùng model dịch đều chạy với gói Nhanh: phụ đề, dịch trong lúc người nói chưa dừng, Gõ dịch.
- Từ điển thuật ngữ: xem §6.1.

## 4. Manifest và gói

### 4.1 Cấu hình (`scripts/models/models.config.json`)

- Thêm file:
  - `lmt-60-0.6b-q8_0`: `tier: ["fast"]`, `kind: "mt"`, `prompt: "lmt"`, `file: "LMT-60-0.6B-Q8_0.gguf"`,
    `url: "lmt-60/LMT-60-0.6B-Q8_0.gguf"`, `version` là 7 ký tự đầu của revision Hugging Face, `license_id:
    "Apache-2.0"`, `min_app_version` là bản app đầu tiên hiểu trường `prompt` (`0.2.0`; chủ dự án chọn nâng thẳng lên 0.2.0 ngày 2026-10-21).
  - `lmt-60-license`: `kind: "license"`, văn bản Apache License 2.0, `file: "LMT-60-LICENSE.txt"`.
  - `notice-fast`: `kind: "license"`, `file: "NOTICE-fast.txt"`, ghi nguồn, bản quyền và việc đã đổi định dạng (§7).
- Thêm `"fast"` vào `tier` của các file dùng chung: whisper turbo, hai file giấy phép whisper, silero VAD và giấy phép của
  nó, `notice`. Kho model nhận file theo `id` và `sha256` (`store.rs`), nên đổi `tier` không làm gói đang dùng báo có bản
  mới, và người đã có gói Chuẩn không phải tải lại whisper turbo.
- Thêm gói `fast` vào cuối `packs` (tên vi "Nhanh", en "Fast", ghi chú theo §3).
- `NOTICE.txt` dùng chung **không đổi**, để gói Chuẩn và gói Nhẹ không báo cập nhật vô ích. Phần ghi công cho LMT nằm ở
  `NOTICE-fast.txt`.
- Phát hành bằng một phần thân mới `scripts/models/released/body-3.json`, `sequence` tăng lên.

### 4.2 Trường `prompt` (app)

- `FileEntry` thêm `prompt: Option<String>` (`#[serde(default)]`). Chỉ có nghĩa với `kind: "mt"`; với kind khác thì phải
  bỏ trống, ghi vào thì manifest không hợp lệ (`files[i].prompt`).
- Giá trị app này hiểu: `"hy-mt2"` và `"lmt"`. Bỏ trống nghĩa là `"hy-mt2"` (mọi file Hy-MT2 hiện có).
- Giá trị lạ (họ prompt của app tương lai) **không** làm cả manifest hỏng: gói chứa file đó bị coi như "cần app mới hơn"
  (`usable_by` trả `false`), giống `min_app_version`. Nhờ vậy manifest sau này thêm họ thứ ba không làm app 0.2.0 mất
  luôn gói Chuẩn và gói Nhẹ.
- App cũ bỏ qua khóa lạ, nên nếu chỉ dựa vào trường `prompt` thì app cũ sẽ dùng mẫu Hy-MT2 cho LMT. Điều đó không xảy ra
  vì file LMT đặt `min_app_version` mới (§4.1). Kiểm tra phát hành (`release-ready`, `manifest.test.mjs`) thêm luật: file
  `mt` có `prompt` khác `hy-mt2` thì `min_app_version` phải ≥ bản đầu tiên hiểu trường này.

### 4.3 Từ gói tới pipeline

- `ModelFiles` (`sidecar/paths.rs`) thêm `mt_prompt: PromptFamily`. `Store::resolve` lấy từ file `mt` của gói.
- Bản dev chưa tải gói nào (`model_files(dir, tier)`): `Some("fast")` dùng whisper turbo và `LMT-60-0.6B-Q8_0.gguf` trong
  `models/` của repo, họ `Lmt`; còn lại như cũ, họ `HyMt2`.
- Phiên dịch, Gõ dịch và bước làm nóng nhận họ prompt từ `ModelFiles` đang dùng. Đổi gói chỉ có hiệu lực từ phiên sau, như
  hiện nay ("Gói vừa chọn được dùng từ phiên dịch sau").

## 5. Prompt

### 5.1 Kiểu dữ liệu

`crates/pipeline/src/prompt.rs` thêm `pub enum PromptFamily { HyMt2, Lmt }`. Các hàm hiện có giữ nguyên chữ ký và giữ
nguyên chuỗi cho Hy-MT2. Thêm một điểm vào duy nhất cho nơi gọi:

```rust
pub fn build(family: PromptFamily, kind: PromptKind<'_>, text: &str, src: Lang, tgt: Lang) -> String
// PromptKind: Plain | Terminology(&[Term]) | Context(&str)
```

`translate::prompt_for`, `engine.rs` (làm nóng) và `latency-bench` gọi qua hàm này. Họ prompt đi trong
`MtConfig::prompt_family` (`#[serde(skip)]`, manifest không ghi đè được), không phải một trường mới của `Job`: `translate`,
`translate_live` và bước làm nóng đều đã nhận `&MtConfig`, còn `Job` được dựng ở hơn mười chỗ. `sidecar_key` đặt trường này
theo `ModelFiles::mt_prompt`; `LiveDeps::pipeline_config` lấy theo bộ tiến trình phụ đang có, nên phiên dịch và Gõ dịch luôn
dùng mẫu của model mà `llama-server` thật sự nạp.

### 5.2 Mẫu của LMT

Nguyên văn theo model card `NiuTrans/LMT-60-0.6B` (revision `dd18984`), một lượt `user`, chat template trong GGUF:

```
Translate the following text from {Nguồn} into {Đích}:
{Nguồn}: {text}
{Đích}:
```

- Tên ngôn ngữ tiếng Anh như mẫu tiếng Anh của Hy-MT2: English, Chinese, Japanese, Korean, Vietnamese. Không có nhánh
  tiếng Trung.
- Mẫu cần ngôn ngữ nguồn. Phụ đề có sẵn ngôn ngữ nguồn từ ASR; Gõ dịch nhận theo chữ viết (spec chính §4.6), nên đều có.
- Model card dùng beam 5. App giữ greedy vì phải stream; số đo §2 cũng greedy.
- `temperature` 0, repeat penalty 1,05, lần thử lại 1,15, hạn mức token như Hy-MT2 (min(4 × token gốc + 32, 512)).
- Không có thẻ `<think>`: template của Qwen3 chỉ chèn khối think khi `enable_thinking` được đặt `false`, app không đặt.
  Kiểm bằng spike S4 (§8.2).

### 5.3 Ngữ cảnh câu trước

LMT không có mẫu ngữ cảnh. Với họ `Lmt`, `PromptKind::Context` dùng mẫu thường (bỏ ngữ cảnh). Cờ này vốn mặc định tắt.

## 6. Thuật ngữ, ngưỡng, hậu xử lý

### 6.1 Từ điển thuật ngữ

LMT không có mẫu "terminology". Làm một spike (S-T, §8.3) với mẫu ghép:

```
Reference the following translations:
{source} translates to {target}
…

Translate the following text from {Nguồn} into {Đích}:
{Nguồn}: {text}
{Đích}:
```

- **Đạt** nếu tỉ lệ câu có đủ thuật ngữ đích của LMT không thấp hơn của Hy-MT2 Q8_0 quá 10 điểm phần trăm, và COMET trên
  cùng các câu không thấp hơn mẫu thường của LMT quá 0,02. Đạt thì gói Nhanh dùng mẫu này.
- **Không đạt** thì với họ `Lmt`, `PromptKind::Terminology` dùng mẫu thường. Màn hình Từ điển thuật ngữ hiện dòng ghi chú
  khi gói đang dùng là gói Nhanh: vi "Gói Nhanh không áp dụng từ điển thuật ngữ. Đổi sang gói Chuẩn hoặc Nhẹ để dùng."
  (đủ năm ngôn ngữ giao diện). Từ điển vẫn lưu và sửa được.
- **Kết quả (2026-10-21): không đạt** (`bench/2026-10-21-goi-nhanh/terms.md`). Câu đủ thuật ngữ: Hy-MT2 66,7%, LMT mẫu ghép
  35,0%, LMT mẫu thường 20,0%; COMET 0,847 / 0,790 / 0,785. Đã làm nhánh "không đạt". Mẫu ghép vẫn nâng tỉ lệ từ 20% lên
  35% mà không làm COMET tụt: nếu chủ dự án muốn áp một phần thay vì tắt hẳn, chỉ cần đổi một nhánh của `prompt::build` và
  câu ghi chú.

### 6.2 Ngưỡng tỉ lệ token

`DEFAULT_RATIO_THRESHOLDS` (`config.rs`) được tính trên Hy-MT2, còn token đếm bằng tokenizer của model đang nạp. Với LMT
(tokenizer Qwen3) đo lại đủ 20 chiều bằng `bench/phase0/mt/build_ratio_set.py` và `ratio_stats.py`, cùng cách lấy (tỉ
lệ lớn nhất trên câu gốc ≥ 10 token, cộng 25%, làm tròn lên 0,1).

- `MtConfig` giữ hai bảng: `ratio_thresholds` (Hy-MT2, như cũ) và `ratio_thresholds_lmt`. `ratio_for` giữ chữ ký cũ và
  chọn bảng theo `self.prompt_family`.
- Khối `pipeline` của manifest có thể ghi đè `mt.ratio_thresholds_lmt` như khóa cũ. App 0.1.17 bỏ qua khóa lạ này: mọi
  struct của `PipelineConfig` là `#[serde(default)]` và không có `deny_unknown_fields` (`config.rs`), nên khối `pipeline`
  không hỏng.
- **Số đo (2026-10-21):** `DEFAULT_RATIO_THRESHOLDS_LMT` đủ 20 chiều (`bench/2026-10-21-goi-nhanh/ratio.md`). Trên bộ A3
  chạy có ngưỡng, chỉ một câu chạm ngưỡng (câu lỗi ở §8.4), không có lần thử lại thừa.

### 6.3 Hậu xử lý

Hậu xử lý (`postprocess.rs`: bỏ nhãn, phát hiện lời giải thích, cắt) chạy chung. Nhãn đích ("Vietnamese:") có thể bị
model lặp lại ở đầu bản dịch; nếu A3 cho thấy có, thêm nhãn của mẫu LMT vào danh sách nhãn cần bỏ. Lượt đo §2 có 1/332
câu dài bất thường; A3 phải đếm cột "Bị cắt", "Lỗi", "Nghi lẫn mẫu" như hai gói kia.

## 7. File model và giấy phép

- Không dùng GGUF của bên thứ ba. Tự chuyển từ `NiuTrans/LMT-60-0.6B` revision
  `dd189845cdc73346cef33c7a94f4b8bd8efdd4eb` bằng `convert_hf_to_gguf.py` của llama.cpp b11146 (cùng bản với
  `llama-server` của app), ra thẳng Q8_0 bằng `--outtype q8_0` (không qua `llama-quantize`). Chạy hai lần ra cùng SHA-256. Ghi lệnh, SHA-256 của file vào, phiên bản Python và thư viện vào
  `bench/2026-10-21-goi-nhanh/CONVERT.md` để dựng lại được.
- Kiểm token như S4 (§8.2) trước khi dùng file.
- File đặt trên R2 cạnh model hiện có (`lmt-60/`), manifest ghi đường dẫn tương đối như Hy-MT2.
- Giấy phép: model card ghi Apache-2.0, nền là `Qwen/Qwen3-0.6B-Base` (Apache-2.0). Repo NiuTrans không có file LICENSE,
  nên `LMT-60-LICENSE.txt` là văn bản Apache License 2.0 lấy từ repo Qwen3 (ghim revision). Repo GitHub `NiuTrans/LMT` cũng
  không có file giấy phép (kiểm ngày 2026-10-21): quyền dùng chỉ dựa vào nhãn `license: apache-2.0` trên model card (§11). `NOTICE-fast.txt` ghi: nguồn
  và revision của NiuTrans, "Copyright NiuTrans", nền Qwen3 của Alibaba Cloud, và câu "đã chuyển sang định dạng GGUF và
  lượng tử hóa Q8_0" (Apache-2.0 §4(b) yêu cầu ghi chú file đã sửa).
- `THIRD_PARTY_NOTICES.txt` của app không đổi (model không đóng gói trong app).

## 8. Nghiệm thu

### 8.1 Bộ đo

`bench/2026-10-21-goi-nhanh/`: README (máy, điều kiện, cách chạy), các script của lượt đo §2 (`measure_llama.py`,
`comet_score.py`, `measure_quickmt.py`), kết quả thô `out-*.jsonl` và bảng. Không chép file model.

### 8.2 Spike trước khi viết code app

- **S4-LMT:** chạy `bench/phase0/mt/check_template.py` với GGUF tự chuyển: token prompt trùng tokenizer Hugging Face, bản
  dịch stream trùng `/completion` nạp token Hugging Face, dừng ở EOS. Không đạt thì dừng và báo chủ dự án.
- **Tốc độ M4 Pro:** đo lại bảng §2 với đúng mẫu §5.2, máy rảnh như S6, để chốt số {x} trong ghi chú gói.

### 8.3 Spike thuật ngữ (S-T)

Bộ 60 câu từ bộ test A3 (30 en→vi, 10 mỗi chiều zh/ja/ko→vi), mỗi câu một đến ba cặp thuật ngữ lấy từ bản dịch chuẩn,
ghi vào `bench/2026-10-21-goi-nhanh/terms.jsonl`. Chấm: thuật ngữ đích có trong bản dịch (NFC, không phân biệt hoa
thường), và COMET. Ngưỡng ở §6.1.

### 8.4 A3 (chất lượng)

- Dịch bộ test A3 bằng `latency-bench mt-eval` (code dịch của app) với GGUF tự chuyển, họ `Lmt`. Ghi cột gói Nhanh vào
  bảng mốc của spec chính §3.3 (A3) và `bench/phase0/results/`.
- **Mức sàn gói Nhanh:** en→vi ≥ 0,77. Chiều zh/ja/ko→vi không thấp hơn en→vi quá 0,05 (luật như hai gói kia).
- **Chống thụt lùi:** như hai gói kia, từng chiều không thấp hơn mốc mới quá 0,01.
- Không đạt sàn thì dừng, báo chủ dự án, không phát hành gói.

### 8.5 Test tự động

- `manifest.rs`: đọc `prompt`; `prompt` ở file không phải `mt` là lỗi; giá trị lạ làm gói thành không dùng được mà
  manifest vẫn đọc được; gói ba người dùng chung file với gói Chuẩn.
- `store.rs`/`service.rs`: `resolve` trả đúng họ; thêm `fast` vào `tier` của file đã tải không tạo bản cập nhật; xóa gói
  Nhanh giữ file dùng chung với gói còn lại.
- `prompt.rs`: chuỗi mẫu LMT nguyên văn cho vài cặp; Hy-MT2 không đổi chuỗi nào (các test hiện có giữ nguyên).
- `translate.rs`: `ratio_for` theo họ; thuật ngữ và ngữ cảnh với họ `Lmt` theo §5.3, §6.1.
- `scripts/models`: `build-manifest` và luật `min_app_version` của §4.2.
- Giao diện: ghi chú ở màn hình Từ điển thuật ngữ (nếu §6.1 không đạt), đủ khóa i18n năm ngôn ngữ.
- Chạy toàn bộ: `cargo test` workspace, `cargo clippy`, `pnpm test`, test của `scripts/`.

### 8.6 Thử tay

- Mac (Claude làm được, báo trước vì máy đang dùng): tải gói Nhanh khi đã có gói Chuẩn (chỉ tải phần còn thiếu), dịch
  phụ đề en→vi và vi→ja, Gõ dịch, đổi lại gói Chuẩn, xóa gói Nhanh không xóa whisper turbo.
- Windows i5 (chủ dự án): đo thời gian hết câu của gói Nhanh so với gói Nhẹ trên cùng máy; đọc dòng `gpu=` trong báo cáo.

## 9. Phát hành

Thứ tự bắt buộc, vì app cũ phải thấy gói Nhanh là "cần bản mới hơn" trước khi manifest có gói này:

1. Gộp `goi-nhanh` vào `main`, phát hành app 0.2.0 theo quy trình 5 bước (đẩy tag cần chủ dự án cho phép).
2. Tải `LMT-60-0.6B-Q8_0.gguf`, `LMT-60-LICENSE.txt`, `NOTICE-fast.txt` lên R2 (chủ dự án chạy lệnh, hoặc cho phép).
3. Dựng `body-3.json` bằng `build-manifest.mjs`, ký trong CI (`sign-manifest.yml`, secret chỉ có trong CI), tải
   `models.json` mới lên R2.
4. Kiểm trên máy thật: app 0.2.0 thấy gói Nhanh và tải được; app 0.1.17 thấy nhãn "cần bản mới hơn".

Không push, không đẩy tag, không deploy khi chủ dự án chưa cho phép từng bước.

## 10. Ngoài phạm vi

- Website (`website/`): chưa nhắc gói Nhanh. Làm sau khi có số đo Windows, theo quy tắc chỉ nói điều có thật và không nêu
  tên model.
- Không đổi luật đề xuất gói, không đề xuất gói Nhanh cho máy yếu.
- Không thêm engine mới (CTranslate2, quickmt), không chưng cất model riêng.
- Không làm gói Nhanh với whisper small.

## 11. Rủi ro

- Chất lượng thấp hơn rõ ở tiếng Hàn (A3: Việt→Hàn 0,787 so với 0,851; Hàn→Việt 0,778 so với 0,834). Ghi chú gói phải nói thẳng điều này.
- Với người dùng, chữ đầu tiên gần như không sớm hơn (§2). Nếu khách thật sự phàn nàn về lúc chữ bắt đầu hiện thì gói này
  không giải quyết; khi đó cần bật "Dịch trong lúc người nói chưa dừng". Thử đầu cuối bằng engine thật (2026-10-21,
  `bench/2026-10-21-goi-nhanh/README.md`): A2 p50 giảm 16–34% (en 789 xuống 523 ms), CPU còn khoảng một nửa, nhưng thời gian
  từ đầu câu tới chữ dịch gần như không đổi (en 5496 và 5470 ms); bật chế độ dịch trong lúc nói thì còn 1270 ms.
- Model của bên nhỏ (NiuTrans), chưa có cộng đồng dùng rộng: có thể có lỗi lặp hay dịch lạc đề chưa thấy trên 332 câu. A3
  đếm các lỗi này; bản phát hành ghi gói là thử nghiệm nếu cột "Lỗi" khác 0.
- Windows chưa đo: số tốc độ ở ghi chú gói chỉ nói về Mac cho tới khi có số Windows.
- Giấy phép chỉ được khai ở metadata của model card, không có file LICENSE ở repo Hugging Face lẫn GitHub của NiuTrans. Đây
  là cách khai phổ biến trên Hugging Face, nhưng yếu hơn một file giấy phép. Chủ dự án quyết có cần hỏi NiuTrans xác nhận
  trước khi phát hành không.
- A3 có 1 câu lỗi trên 620 (§8.4): theo luật ở trên, ghi chú gói nói gói đang thử nghiệm.
- Câu nhiều dòng: trong S4, câu tiếng Nhật có hai câu cách dòng thì LMT chỉ dịch câu đầu. Phụ đề hầu như là một dòng, nhưng
  Gõ dịch có thể gửi văn bản nhiều dòng (Gõ dịch tách theo dòng trước khi dịch, spec chính §4.6, nên ảnh hưởng nhỏ).
