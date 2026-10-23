# Cập nhật model bằng một lệnh pnpm, dấu chấm trên khay (thiết kế)

Ngày 2026-10-23. Nhánh `cap-nhat-model` (worktree `meeting-translator-work/cap-nhat-model`). Phạm vi: `scripts/models`,
`package.json`, `.github/workflows/ci.yml` (bước test), `bench/model-updates/`, `src-tauri/src/tray.rs`,
`src-tauri/src/tray_menu.rs`, `src-tauri/src/i18n.rs`, `src-tauri/src/models/service.rs`, spec chính §6.7,
`docs/release/phat-hanh.md`.

## 1. Mục tiêu

Chủ dự án muốn một lệnh pnpm kiểm xem các model đang phát hành có bản mới ở nguồn không. Nếu có, lệnh đưa bản mới lên
hệ thống, và người dùng được báo để tự cập nhật.

Hiện trạng:

- **Phía app đã có phần báo.** App kiểm `models.json` (manifest ký Ed25519, spec chính §6.7) lúc khởi động, và luồng nền
  xem lại mỗi giờ (tối đa một lần mỗi ngày, từ 0.2.1). Khi manifest có file mới cho gói đang dùng, cửa sổ chính hiện thông
  báo "Có bản mới của gói {pack} (dung lượng tải {size})" với hai nút Tải ngay, Để sau (`UpdateNotice.tsx`, ở Home và Cài
  đặt). App không tự tải.
- **Phía phát hành còn làm tay:** tải hay tự chuyển model, đưa lên R2 bằng rclone, dựng `body-N.json` bằng
  `build-manifest.mjs`, ký trong CI (`sign-manifest.yml`, khóa riêng chỉ có trong CI), rồi đăng `models.json` lên R2.

Chủ dự án chọn (2026-10-23):

1. Lệnh tự kiểm, tự chuẩn bị, tự chạy cổng kiểm chất lượng, rồi **hỏi y/N một lần** trước khi đăng (không đăng tự động
   hoàn toàn, không chỉ báo).
2. Giữ thông báo trong cửa sổ chính như hiện nay, không thêm thông báo của hệ điều hành; **thêm dấu chấm trên icon khay**
   khi có bản app mới hay bản model mới.
3. Lệnh chạy trên máy dev (không chạy cả luồng trong GitHub Actions), vì máy dev đã có rclone (remote `r2:`), `gh`,
   wrangler, dữ liệu thử `bench/phase0/data/` và GPU Metal để chấm; không phải đưa khóa R2 vào CI.

## 2. Ngoài phạm vi

- Họ model mới (ví dụ Hy-MT3, whisper v4) hay gói mới: lệnh chỉ theo dõi revision mới của **đúng repo và đúng file** đang
  dùng. Đổi họ model vẫn theo quy trình spec riêng như gói Nhanh.
- Nâng llama.cpp hay whisper.cpp trong app; đổi luật đề xuất gói (`recommend`).
- Tự đăng bản VAD mới (chỉ báo, mục 4.2).
- Thông báo của hệ điều hành (Notification Center, toast), email.
- Đo trên Windows (mục 10).
- Website: không đổi (việc nội bộ; website không được nêu tên model).

## 3. Lệnh

Thêm vào `package.json` ở gốc repo: `"models:update": "node scripts/models/update.mjs"`.

| Lệnh | Việc |
|---|---|
| `pnpm models:update` | Chạy đủ luồng ở mục 3.1 |
| `pnpm models:update --check` | Chỉ kiểm nguồn, in bảng "đang phát hành / mới nhất ở nguồn"; không tải, không đăng |
| `pnpm models:update --gate-only <id>` | Chạy cổng kiểm (mục 4.4) với file đang phát hành của `<id>`; dùng để thử cổng kiểm, không đăng |
| `pnpm models:update --rollback-to <S>` | Quay các model về như manifest số `S` đã phát hành, bằng một manifest số mới (mục 7.1) |

File mới:

- `scripts/models/upstream.json`: nguồn gốc từng file của manifest theo `id` (mục 4.1). Tách khỏi `models.config.json` vì
  `build-manifest.mjs` chép nguyên mục cấu hình vào manifest công khai.
- `scripts/models/update.mjs`: điều phối các bước, gọi công cụ ngoài.
- `scripts/models/update-lib.mjs`: logic thuần (so bản mới, dựng phần thân mới, đường dẫn R2, trạng thái chạy lại), có test.
- `scripts/models/update.test.mjs`: test (mục 9).

### 3.1. Luồng

1. **Kiểm điều kiện trước:**
   - Thư mục làm việc ở nhánh `main`, cây sạch, khớp `origin/main` (sau `git fetch`).
   - Có `rclone` với remote `r2:`, `gh` đăng nhập được (token của dotienphong), `wrangler`, `uv`, `cargo`, `curl`.
   - Có dữ liệu thử `bench/phase0/data/mt` và `bench/phase0/data/asr`.
   - `models.json` đang chạy trên R2 (đọc qua `https://releases.aitranslator.io.vn/models/models.json`) có `sequence`
     bằng `sequence` của `scripts/models/released/body-N.json` có số lớn nhất, chữ ký hợp lệ, và `body` giải mã ra trùng
     từng byte với `body-N.json`. Khác thì dừng: repo và R2 đang lệch nhau, cần người xem.
2. **Kiểm nguồn** (mục 4.1, 4.2). Không có gì mới thì in bảng rồi thoát mã 0.
3. **Chuẩn bị** (mục 4.3) vào `target/models-update/<id>/<revision>/`.
4. **Cổng kiểm** (mục 4.4). Không đạt thì in lý do, thoát mã khác 0, không đăng gì.
5. **In bảng cũ/mới**: revision, dung lượng, SHA-256, điểm từng chiều so với mốc, phần khác của file giấy phép (nếu có).
   Hỏi **"Đăng bản model mới cho người dùng? [y/N]"**. Chỉ `y` hay `Y` là đồng ý; Ctrl+C hay mọi câu khác là N.
6. **Đăng** (mục 5).
7. App của người dùng tự nhận manifest mới trong vòng một ngày và hiện thông báo như hiện nay; từ 0.2.6 có thêm dấu chấm
   trên khay (mục 6).

## 4. Phát hiện bản mới, chuẩn bị, cổng kiểm

### 4.1. `upstream.json`

Mỗi mục theo `id` của `models.config.json`:

- `source`: `hf-file` (file có sẵn trên Hugging Face), `hf-convert` (tự chuyển từ repo Hugging Face), `github-release`.
- `repo`; `path` (file theo dõi, trừ `hf-convert`); `revision` (commit đầy đủ hay tag).
- `content` (trừ `hf-convert`): định danh nội dung file nguồn, `sha256:<hex>` (file LFS, file tải từ GitHub) hay
  `blob:<mã blob git>` (file thường trên Hugging Face). `inputs` (chỉ `hf-convert`): định danh nội dung của từng file đầu
  vào, cùng dạng.
- `license`: giấy phép khai ở model card (ví dụ `apache-2.0`), hay `spdx_id` của repo GitHub.
- `version_prefix`: tiền tố của trường `version` trong manifest (`whisper.cpp-` cho whisper, rỗng cho mục khác).
- `convert` (chỉ `hf-convert`): bản llama.cpp (tag và commit), `outtype`, bản Python.
- `notice`: `id` của mục NOTICE ghi revision của mục này (dưới đây), nếu có.
- `gate`: `kind` (`mt`, `asr`, `none` không chạy cổng kiểm, `report` chỉ báo và đổi bằng tay), `prompt` (với `mt`, phải
  trùng `prompt` của `models.config.json`) và `baseline` (file mốc đang dùng, mục 4.4).
- `r2_dir`: thư mục trên R2 (`hy-mt2`, `lmt-60`, `whisper`, `silero-vad`).
- `history`: các lần phát hành của mục này, mỗi lần `{ sequence, revision, content hay inputs, baseline }` (`sequence` là
  số manifest đầu tiên có bản đó; ban đầu một dòng với số 1 hay số 3 cho LMT). Mỗi lần đăng thêm một dòng; `--rollback-to`
  đọc ở đây (mục 7.1).
- `rejected` (không bắt buộc): các bản đã bị quay lại, mỗi bản `{ sequence, content hay inputs }`, do `--rollback-to` ghi
  (mục 7.1). Bản ở nguồn trùng một dòng ở đây thì lệnh báo "bỏ qua", không chuẩn bị, không đề nghị đăng lại. Muốn đăng lại
  thì xóa dòng đó bằng tay.

Giá trị ban đầu (theo `docs/superpowers/plans/2026-10-02-phase-1-04a-quan-ly-model-loi.md`, `CONVERT.md`):

| `id` | Nguồn | File theo dõi | Revision |
|---|---|---|---|
| `hy-mt2-1.8b-q8_0`, `hy-mt2-1.8b-q4_k_m` | `hf-file` `tencent/Hy-MT2-1.8B-GGUF` | `Hy-MT2-1.8B-Q8_0.gguf`, `Hy-MT2-1.8B-Q4_K_M.gguf` | `a0c709d9fac510f2c807aa3af52872340dc37a4a` |
| `lmt-60-0.6b-q8_0` | `hf-convert` `NiuTrans/LMT-60-0.6B` | mọi file trừ tài liệu (`*.md`), `.gitattributes`, file tên LICENSE/NOTICE/README, ảnh | `dd189845cdc73346cef33c7a94f4b8bd8efdd4eb` |
| `whisper-large-v3-turbo-q5_0`, `whisper-small-q5_1` | `hf-file` `ggerganov/whisper.cpp` | `ggml-large-v3-turbo-q5_0.bin`, `ggml-small-q5_1.bin` | `5359861c739e955e79d9a303bcbc70fb988958b1` |
| `silero-vad-v6.2.3` | `github-release` `snakers4/silero-vad` | `src/silero_vad/data/silero_vad.onnx` | `v6.2.3` |

File giấy phép lấy từ Hugging Face được theo dõi như một mục `hf-file` với cổng `none` (không chạy cổng kiểm; nội dung
đổi thì in phần khác ở bảng y/N): `hy-mt2-license` (`LICENSE.txt` của `tencent/Hy-MT2-1.8B-GGUF`) và `lmt-60-license`
(`LICENSE` của `Qwen/Qwen3-0.6B-Base`, revision `da87bfb608c14b7cf20ba1ce41287e8de496c0cd`). Các file giấy phép còn lại
(`whisper-license`, `whisper-cpp-license`, `silero-vad-license`) không theo dõi, đổi bằng tay.

`NOTICE.txt` và `NOTICE-fast.txt` là văn bản của mình nhưng ghi revision của model. Mỗi mục model trong `upstream.json` có
`notice` (`notice` hay `notice-fast`, hay không có). Khi đăng bản mới của mục đó, lệnh thay chuỗi revision cũ bằng revision
mới trong file NOTICE tương ứng (`scripts/models/NOTICE*.txt`; không thấy chuỗi cũ thì dừng), tăng `version` của mục NOTICE
lên 1 và đăng file NOTICE mới như mọi file khác (mục 5.1). NOTICE.txt nằm trong cả ba gói, nên người dùng gói Nhanh cũng
thấy thông báo cập nhật (tải vài KB) khi Hy-MT2 hay whisper đổi.

### 4.2. Phát hiện

So **nội dung file**, không so commit của repo, để một lần sửa README không bị coi là bản mới.

- Hugging Face: `GET https://huggingface.co/api/models/<repo>/revision/main?blobs=true` (đã thử 2026-10-23: trả `sha`,
  `cardData.license`, và mỗi file trong `siblings` có `lfs.sha256`, `size` với file LFS, `blobId` với file thường).
  - `hf-file`: bản mới khi `lfs.sha256` của file theo dõi khác `upstream.json`.
  - `hf-convert`: bản mới khi `lfs.sha256` hay `blobId` của bất kỳ file đầu vào nào khác, hay thêm, bớt file đầu vào.
  - File theo dõi không còn trong repo: dừng, báo cần người xem.
- GitHub: `GET https://api.github.com/repos/<repo>/releases/latest` lấy tag; tag khác thì tải file theo dõi ở tag đó, bản
  mới khi SHA-256 khác.

Luật dừng an toàn (không chạy cổng kiểm, không đăng):

- Giấy phép trên model card hay của repo khác `upstream.json`: dừng, chờ người xem.
- **VAD** (`gate.kind` là `report`): chỉ báo có bản mới. VAD không có bộ đo chất lượng, và bản mới có thể đổi giao diện
  ONNX mà app đang gọi; đổi VAD làm tay.
- Một nguồn không đọc được (lỗi mạng, 403 do giới hạn lượt gọi API): dòng đó báo "DỪNG", các nguồn khác vẫn được kiểm.
- Bản trùng một dòng `rejected`: báo "bỏ qua" (mục 4.1).

### 4.3. Chuẩn bị

- `hf-file`: tải file theo revision mới qua `https://huggingface.co/<repo>/resolve/<revision>/<path>`, kiểm SHA-256 khớp
  `lfs.sha256`.
- `hf-convert`: làm lại đúng các bước của `bench/2026-10-21-goi-nhanh/CONVERT.md` (clone llama.cpp đúng tag trong
  `convert`, `uv venv` Python 3.12 với đúng các gói, `snapshot_download` theo revision mới,
  `convert_hf_to_gguf.py --outtype q8_0`). Chạy chuyển hai lần; SHA-256 hai lần phải trùng, không trùng thì dừng.
- File giấy phép (`hf-file`, cổng `none`): tải như `hf-file`, kiểm mã blob git tự tính (không qua `git hash-object`, vì
  `.gitattributes` của repo đổi xuống dòng); in phần khác so với bản đang phát hành.
- Bản chuẩn bị xong mà SHA-256 trùng file đang phát hành (thường gặp ở `hf-convert` khi nguồn chỉ đổi tệp phụ): không
  chạy cổng kiểm, không đăng file đó. Nếu mọi mục đều như vậy, lệnh hỏi "Ghi nhận revision mới vào upstream.json? [y/N]"
  rồi chỉ commit `upstream.json` (không ký, không đăng manifest), để lần kiểm sau không đề nghị lại. Có mục khác cần đăng
  thì phần ghi nhận này đi chung commit đăng.
- Tải file lớn: phần dở được giữ khi lỗi mạng, lần chạy sau tải tiếp; chỉ tải lại từ đầu khi máy chủ không cho tải tiếp.

### 4.4. Cổng kiểm

Dùng công cụ đã có, chạy bằng `llama-server` và `asr-worker` **đúng bản app đang phát hành** (bản llama.cpp b11146 trong
`tools/`, `asr-worker` build từ workspace ở commit của `main`).

1. **Chạy thử**: model mới phải nạp được và dịch hay nhận dạng ra chữ trên vài câu đầu của bộ thử. Không nạp được
   (thường vì cần llama.cpp mới hơn) thì dừng: "cần nâng engine trong app; không đăng".
2. **Dịch (`gate: mt`, A3)**:
   - Dịch bộ thử A3 bằng `latency-bench mt-eval` (code dịch của app, đúng họ prompt của gói) ra
     `bench/phase0/data/mt/outputs-update-<id>-<rev7>/`, chấm COMET bằng `score_mt.py --label update-<id>-<rev7>
     --baseline <mốc>`.
   - Mốc là kết quả của **model đang phát hành**, ghi ở `gate.baseline`: ban đầu `bench/phase0/results/s7_mt-gd1-a3.json`
     (Hy-MT2 Q8_0, Q4_K_M; chạy bằng `mt-eval`, COMET trùng `s7_mt.json`, có cột `failed`) và
     `bench/phase0/results/s7_mt-goi-nhanh.json` (LMT).
   - Đạt khi: mỗi chiều không thấp hơn mốc quá 0,01 (`REGRESSION` của `score_mt.py`); Anh→Việt không dưới mức sàn
     (`FLOOR`: Q8_0 0,83, Q4_K_M 0,80, LMT 0,77); số câu lỗi (lặp, lạc đề) không nhiều hơn mốc.
   - Môi trường COMET theo `bench/2026-10-21-goi-nhanh/README.md` (`unbabel-comet==2.2.7`, Python 3.12, CPU), dựng bằng
     `uv` trong `target/models-update/venv-comet/`.
3. **Nhận dạng (`gate: asr`, A4)**: `latency-bench asr-eval` rồi `score_asr.py`. Mốc ban đầu
   `bench/phase0/results/a4_m4pro-turbo-final.json` và `a4_m4pro-small-final.json`. Đạt khi mỗi nhóm không xấu hơn mốc quá
   10% tương đối (`A4_RELATIVE` của `gates.py`).
4. Kết quả đo (JSON, bảng Markdown) lưu ở `bench/model-updates/<ngày>-<id>-<rev7>/`. Khi đăng xong, `gate.baseline` của
   mục đó trỏ sang kết quả này, thành mốc cho lần sau.

## 5. Đăng

Chỉ chạy sau khi người vận hành gõ `y`.

### 5.1. Tải lên R2

- Đường dẫn mới có revision: `models/<r2_dir>/<12 ký tự đầu revision>/<file>`, ví dụ
  `models/hy-mt2/9f3c2a1b4d5e/Hy-MT2-1.8B-Q8_0.gguf`. `url` trong manifest là phần sau `models/` (tương đối so với URL của
  manifest; `is_model_url` của app nhận thư mục con).
- `id` và `file` giữ nguyên (luật trong `models.config.json`: đổi `id` thì gói đang dùng thành chưa tải); chỉ `url`,
  `version`, `bytes`, `sha256` đổi. App thay file tại chỗ theo đúng luồng cập nhật đã có (spec chính §6.7).
- Lệnh: `rclone copyto <file> r2:ai-translator-releases/models/<đường dẫn> --s3-no-check-bucket`.
- Không bao giờ ghi đè: đường dẫn đã có object thì chỉ chấp nhận khi SHA-256 trùng (chạy lại sau lần bị ngắt), khác thì
  dừng.
- Kiểm lại bằng `curl` qua tên miền công khai (tải đủ file, so SHA-256). Không dùng urllib của Python: Cloudflare trả 403.
- File cũ trên R2 giữ nguyên, để quay lại được (mục 7).

### 5.2. Phần thân manifest mới

- `scripts/models/released/body-(N+1).json` dựng từ `body-N.json`: chỉ thay các mục đã đổi, `sequence` = N+1,
  `published_at` = giờ UTC hiện tại (dạng `build-manifest.mjs`). Các phần khác giữ nguyên.
- Cập nhật `models.config.json` (`version`, `url` của mục đã đổi) và `upstream.json` (revision, SHA-256, `gate.baseline`,
  thêm dòng `history`). Mục có `notice` thì sửa file NOTICE và mục NOTICE như mục 4.1 (đường dẫn R2
  `models/notice/<version>/<file>`).
- Chạy trên máy đúng bài kiểm của CI trước khi đẩy:
  `MANIFEST_BODY=… MANIFEST_PREVIOUS=… cargo test --locked -p meeting-translator --lib check_manifest_body -- --ignored`.

### 5.3. Commit, đẩy, ký

- Một commit trên `main` gồm phần thân mới, `models.config.json`, `upstream.json` và kết quả đo, ví dụ
  `chore(models): Hy-MT2 Q8_0 lên revision 9f3c2a1 (manifest số 4)`. Đẩy `origin main`.
- `gh workflow run sign-manifest.yml --ref main -f body=scripts/models/released/body-(N+1).json
  -f previous=scripts/models/released/body-N.json`, tìm lượt chạy vừa tạo, `gh run watch --exit-status`.
- `gh run download <lượt> -n models-manifest` vào `target/models-update/signed/`.
- Kiểm trên máy bằng `verifyEnvelope` của `scripts/models/lib.mjs`: phong bì đúng định dạng; `kid` thuộc khối
  `production` của `src-tauri/keys/manifest-public-keys.json`; chữ ký hợp lệ; `body` giải mã ra trùng từng byte với dạng
  gọn `JSON.stringify(JSON.parse(body-(N+1).json))` (CI ký dạng gọn, như `sign-manifest.mjs`). Sai bất kỳ điều nào: dừng
  hẳn, không đăng (dấu hiệu bất thường). Mục 3.1 bước 1 so `body-N.json` với manifest đang chạy theo cùng cách.

### 5.4. Đăng manifest

- Sao lưu `models.json` đang chạy vào `target/models-update/backup/models-seq-N.json`.
- `wrangler r2 object put ai-translator-releases/models/models.json --file <bản đã ký> --content-type application/json
  --cache-control no-cache --remote`.
- `curl` lại URL công khai, so trùng từng byte với bản đã ký. Lỗi mạng hay DNS thì in gợi ý kiểm
  `dig @8.8.8.8 releases.aitranslator.io.vn` (sự cố DNSSEC io.vn 2026-10-22).

## 6. App 0.2.6: dấu chấm trên khay và mục menu

### 6.1. Luật

Dấu chấm hiện khi menu khay có ít nhất một mục cập nhật:

| Mục menu | Điều kiện | Bấm vào |
|---|---|---|
| Khởi động lại để cập nhật (đã có) | `update_ready` và không đang dịch | như hiện nay |
| **Có bản cập nhật gói model** (mới) | `updateAvailable` của `ModelsView` (gói đang dùng có file mới, chưa bấm Để sau) và không đang tải model và không đang dịch | mở cửa sổ chính ở Home, nơi có `UpdateNotice` |

- Đang dịch thì ẩn cả dấu chấm lẫn hai mục, như luật hiện có của mục khởi động lại (§6.11 "app đang rảnh"). Dừng dịch
  thì hiện lại.
- Bấm Để sau, hay tải xong gói, thì mục model biến mất; dấu chấm còn nếu bản app mới đang chờ.

### 6.2. Vẽ dấu chấm

Không thêm file ảnh. Hàm thuần `with_badge(rgba, width, height, style)` vẽ lên ảnh gốc lúc chạy:

- **macOS**: icon template 44×44 (`icons/tray-template.png`, chỉ dùng kênh alpha). Chấm đặc bán kính khoảng 5 px ở góc
  trên phải, khoét viền trong suốt 2 px quanh chấm để tách khỏi hình khung phụ đề. Vẫn là template: hệ thống tự tô màu
  theo menu bar sáng, tối.
- **Windows**: icon màu của app (`default_window_icon`). Chấm đỏ `#E5484D` có viền trắng ở góc trên phải, đường kính khoảng
  35% cạnh icon.

### 6.3. Chỗ sửa

- `tray_menu.rs`: `TrayItem::ModelUpdate` (id `model-update`), `TrayModel.model_update`, hàm `has_badge(model)`; mục mới
  đứng cạnh mục khởi động lại, trước Thoát.
- `tray.rs`: `create` dựng icon theo trạng thái ban đầu; `refresh` gọi `set_icon` **chỉ khi** trạng thái dấu chấm đổi (giữ
  trạng thái trước trong state của app), để icon không nháy; `on_menu_event` của `ModelUpdate` mở cửa sổ chính ở Home.
- `models/service.rs`: `changed()` gọi thêm `tray::refresh` (hiện chỉ `actions.rs` gọi), để cờ model tới khay.
- `i18n.rs`: chuỗi `tray_model_update` cho năm ngôn ngữ (vi "Có bản cập nhật gói model", en "Model pack update
  available", và ja, zh, ko).
- React: không đổi.

### 6.4. Phát hành

0.2.6 theo quy trình năm bước (`docs/release/phat-hanh.md`, ghi nhớ quy trình phát hành). Đẩy tag cần chủ dự án cho phép.
Phần script (mục 3–5) độc lập với phần app: thông báo trong cửa sổ chính chạy ở mọi bản từ 0.2.1, nên script dùng được
trước khi có 0.2.6.

## 7. Xử lý lỗi, chạy lại, quay lại bản cũ

Lệnh dừng ngay ở bước lỗi, in lý do bằng tiếng Việt kèm cách sửa, thoát mã khác 0. Không bao giờ in khóa, token hay nội
dung `rclone.conf`.

`target/models-update/state.json` ghi các bước đã xong (đã tải lên, mã commit, mã lượt chạy CI, đã đăng) theo
`sequence` đích. Chạy lại thì lệnh kiểm lại trạng thái thật (object trên R2, commit trên `origin/main`, lượt chạy CI,
`models.json` công khai) rồi làm tiếp từ bước dở; không tải lại, không tăng `sequence` hai lần.

| Lúc lỗi | Trạng thái để lại | Làm gì tiếp |
|---|---|---|
| Kiểm điều kiện, kiểm nguồn, chuẩn bị, cổng kiểm | chưa đăng gì | sửa nguyên nhân rồi chạy lại |
| Đã tải lên R2, chưa commit | file mới trên R2, chưa manifest nào trỏ tới (vô hại) | chạy lại; bước tải lên được bỏ qua vì SHA trùng |
| Đã đẩy commit, CI ký lỗi | `body-(N+1)` trên `main`, chưa đăng | chạy lại: chạy lại workflow, không commit lần hai |
| Bản đã ký không khớp hay chữ ký sai | không đăng | dừng hẳn, cần người xem |
| Đã đăng, `curl` kiểm lại không khớp | `models.json` mới có thể lỗi | đăng lại bản đã ký trong `target/models-update/signed/`; nếu chính bản đó hỏng, quay lại bằng `--rollback-to N` (mục 7.1), không đăng bản sao lưu số N vì app từ chối `sequence` cũ |

### 7.1. Quay lại bản trước: `--rollback-to <S>`

App chỉ nhận manifest có `sequence` lớn hơn bản đã nhận, nên không gỡ được manifest đã đăng. Quay lại là đăng manifest số
M+1 (M là số đang chạy) có các mục model lấy từ `body-S.json`. File cũ không bao giờ bị xóa trên R2 (mục 5.1), nên quay về
được mọi bản còn file.

1. Kiểm điều kiện như mục 3.1 bước 1. `S` phải nhỏ hơn M và `scripts/models/released/body-S.json` phải có.
2. Dựng `body-(M+1)` từ `body-M.json`: mỗi `id` có ở cả hai bản mà phần nội dung (`file`, `version`, `url`, `bytes`,
   `sha256`) khác nhau thì lấy năm trường đó của `body-S`; các trường khác (`tier`, `min_app_version`, `prompt`…) giữ như
   `body-M`. Lấy nguyên mục là sai: từ số 2 lên số 3, whisper turbo, VAD và các file giấy phép chỉ đổi `tier` (thêm gói
   Nhanh), nên chép nguyên mục của số 2 sẽ làm gói Nhanh thiếu file. `id` chỉ có ở `body-M` (gói thêm sau số S) giữ nguyên;
   `id` chỉ có ở `body-S` (đã bỏ) thì dừng, quay lại kiểu đó làm tay. `packs`, `recommend`, `pipeline` giữ như `body-M`.
   Không có mục nào khác phần nội dung thì báo "không có gì để quay lại" và thoát mã 0 (ví dụ `--rollback-to 2` lúc đang
   ở số 3).
3. Kiểm từng file được lấy lại vẫn còn trên R2: `curl` qua tên miền công khai, tải đủ, so `bytes` và `sha256`. Thiếu hay
   sai thì dừng.
4. Bỏ qua cổng kiểm: các file này đã từng phát hành và đã qua cổng kiểm lúc đó.
5. In bảng "đang chạy / sẽ quay về" theo từng `id` (revision, SHA-256, dung lượng) và hỏi
   **"Quay các model về như manifest số S? [y/N]"**.
6. Trả `models.config.json` (`version`, `url` theo `body-S`) và `upstream.json` (revision, SHA-256, `gate.baseline` theo
   dòng `history` của bản đó) về bản cũ, thêm một dòng `history` mới với số M+1, và thêm bản đang bị quay lại vào
   `rejected` của mục đó (mục 4.1), để lần kiểm sau không đề nghị đăng lại bản vừa gỡ.
7. Kiểm `check_manifest_body` trên máy, commit (ví dụ `chore(models): quay lại model như manifest số 3 (manifest số 5)`),
   đẩy, ký trong CI, kiểm chữ ký, đăng như mục 5.3, 5.4. Dùng chung `state.json` và luật chạy lại.

Phía người dùng (trong vòng một ngày, theo nhịp kiểm của app):

- Chưa tải bản mới: file trên máy khớp lại manifest, thông báo và dấu chấm tự biến mất.
- Đã tải bản mới: thấy thông báo "Có bản mới của gói…" và phải tải lại bản cũ. Lúc cập nhật, app thay file tại chỗ nên
  trên máy không còn bản cũ.
- Đã bấm Để sau ở số M: thông báo hiện lại, vì số M+1 lớn hơn.

Từ lúc đăng bản mới tới khi app nhận bản quay lại (tối đa khoảng một ngày), vẫn có người tải bản mới; quay lại sớm thì ít
người phải tải hai lần.

## 8. Tài liệu

- Spec chính §6.7: thêm đoạn phát hành bản model mới bằng `pnpm models:update` và luật dấu chấm khay.
- `docs/release/phat-hanh.md`: mục 13 "Cập nhật model bằng `pnpm models:update`": điều kiện máy, cách chạy, chạy lại khi
  lỗi, quay lại bản cũ bằng `--rollback-to`.

## 9. Kiểm thử

`node --test scripts/models/update.test.mjs`, thêm vào bước "Script phát hành và script manifest model" của `ci.yml`.

- So bản mới bằng JSON mẫu của API Hugging Face và GitHub: đổi README không tính; đổi `lfs.sha256` hay `blobId` của file
  đầu vào thì tính; thêm, bớt file đầu vào của `hf-convert` thì tính; file theo dõi biến mất thì dừng; đổi giấy phép thì
  dừng; VAD mới thì chỉ báo.
- Dựng `body-(N+1)`: chỉ đổi đúng mục, `sequence` cộng 1, `id` và `file` giữ nguyên, các phần khác trùng.
- Đường dẫn R2 theo revision; luật object đã có (SHA trùng thì bỏ qua, khác thì dừng).
- Kiểm bản đã ký: khóa lạ, chữ ký sai, `body` khác một byte đều bị từ chối.
- `state.json`: chạy lại từ từng bước dở.
- `--rollback-to`: chỉ đổi đúng các `id` khác nhau giữa `body-S` và `body-M`; `id` mới sau số S giữ nguyên; `id` đã bỏ
  thì dừng; không có gì khác thì thoát mã 0; `S` không nhỏ hơn M hay thiếu `body-S` thì lỗi; file trên R2 thiếu hay sai
  SHA thì dừng; `upstream.json` lấy lại đúng dòng `history` và thêm dòng mới.
- Câu trả lời y/N: chỉ `y`, `Y` là đồng ý.
- Các bước gọi ra ngoài (rclone, gh, wrangler, curl, cargo, uv, git) đi qua một lớp `run()` để test thay bằng bản giả và
  ghi lại lệnh đã gọi; test không đụng mạng thật.
- Rust: `menu_lines` và `has_badge` cho mọi tổ hợp; điểm ảnh của `with_badge` (tâm chấm, viền, điểm ngoài không đổi) cho
  cả hai kiểu; `changed()` của `ModelService` cập nhật cờ model.
- Thử thật trước khi dùng: `pnpm models:update --check` trên máy chủ dự án phải báo không có bản mới cho cả bốn nguồn;
  `--gate-only` với model đang phát hành phải đạt.
- Thử tay khay trên Mac: sao lưu rồi sửa tạm `sha256` của file MT trong `installed.json` (gói vẫn dùng được nhưng "chưa
  đủ", như khi có bản mới; đổi tên file thì gói thành "không dùng được" nên không có dấu chấm) để thấy dấu chấm và mục
  menu, rồi trả bản sao lưu. Bản dev dùng chung thư mục model với app thật của chủ dự án, nên báo trước khi làm.

## 10. Rủi ro

- Cổng kiểm chỉ chạy trên Mac (M4 Pro), không đo Windows. Rủi ro thấp (cùng bản llama.cpp, cùng kiến trúc model, chỉ khác
  trọng số) nhưng vẫn có.
- COMET trên 620 câu bắt được thụt lùi trung bình, không bắt hết lỗi hiếm (lặp, lạc đề trên câu chưa gặp).
- Bản mới ở nguồn đến bất kỳ lúc nào; lệnh chỉ chạy khi người vận hành gọi, không có lịch tự chạy.
- Lệnh đẩy commit lên `main`; người vận hành phải chạy ở thư mục chính, không có phiên khác đang sửa `main` cùng lúc.

## 11. Quy tắc làm việc

Làm trên worktree `cap-nhat-model`. Không đẩy `main`, không chạy workflow ký, không ghi lên R2, không đẩy tag khi chủ dự án
chưa cho phép từng bước. Lần chạy thật đầu tiên chỉ có `--check`.
