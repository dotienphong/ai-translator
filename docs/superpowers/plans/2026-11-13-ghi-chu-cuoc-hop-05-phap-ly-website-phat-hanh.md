# Ghi chú cuộc họp, kế hoạch 05: pháp lý, giấy phép, manifest, website, phát hành

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mọi thứ ngoài mã app mà bản phát hành có Ghi chú cuộc họp cần: văn bản pháp lý nói đúng dữ liệu nào rời máy, giấy phép model ghi chú, công cụ đăng gói ghi chú vào manifest, website năm ngôn ngữ, và runbook phát hành có tắt khẩn.

**Architecture:** không có mã chạy trong app. Bốn mảng độc lập: (1) `docs/legal` và spec gốc; (2) `licenses/models` và `scripts/release/notices.mjs`; (3) `scripts/models/notes-manifest.mjs` theo mẫu `speaker-manifest.mjs`; (4) `website/` và `docs/release/phat-hanh.md`. Tính năng phát hành theo hai bước như "Phân biệt người nói": app ra trước với gói Local "ngủ" (manifest chưa có mục `notes`), Cloud dùng được ngay; đăng mục `notes` là bật Local.

**Tech Stack:** Markdown, Node thuần (`node:test`), bộ sinh website sẵn có. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-11-11-ghi-chu-cuoc-hop-design.md` mục 9, 12; `website/README.md` (mục "Không công bố công nghệ lõi", "Năm ngôn ngữ"); `docs/legal/README.md`.

**Điều kiện trước:** kế hoạch 03 và 04 xong.

**Quy ước:** `W=/d/Dev/WORKSPACE/ai-translator-ghichu`. Test website: `cd $W/website && pnpm test`. Test script: `cd $W && node --test scripts/models/`.

## Global Constraints

- **Việc chỉ chủ dự án làm, kế hoạch này chỉ viết hướng dẫn, người thực hiện không chạy:** tải file lên R2, ký và đăng manifest, deploy website, đổi số phiên bản app, đặt ngày hiệu lực của văn bản pháp lý, merge vào `main`, push. Các bước đó mang nhãn **[CHỦ DỰ ÁN]**.
- Website **không nêu tên model, tên engine, định dạng hay mức lượng tử hóa** (test `không lộ công nghệ lõi`). Chỉ nói "model AI chạy trên máy" và "model cloud bạn chọn (ChatGPT, Gemini, DeepSeek)". Tên ba dịch vụ cloud là tên sản phẩm người dùng tự chọn, không phải công nghệ lõi của app; nếu test chặn một tên thì thêm ngoại lệ có chú thích lý do, không đổi câu thành mơ hồ.
- Website và văn bản pháp lý chỉ nói điều có thật. Số đo được phép nêu, luôn kèm điều kiện: "cuộc họp 60 phút, laptop Core i5 đời 13, 32 GB RAM: khoảng 14 phút với GPU tích hợp, khoảng 24 phút khi chỉ dùng CPU". Không nêu số về độ chính xác. Không nói Local "chính xác"; nói "bản nháp cần kiểm lại".
- Sửa một trang website thì sửa đủ **vi, en, ja, zh, ko** (pháp lý chỉ vi, en). Bản ja/zh/ko dịch từ bản en, cùng khung.
- Model ghi chú: Apache-2.0, nguồn `unsloth/Qwen3.5-4B-GGUF` bản `e87f176479d0855a907a41277aca2f8ee7a09523`, file `Qwen3.5-4B-Q4_K_M.gguf`, 2 740 937 888 byte, SHA-256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`.
- Không tạo crate hay gói npm mới, nên `about.toml` và `deny.toml` không đổi (Task 2 có bước xác nhận).

## Review Focus

1. Chính sách hiện **không có dòng nào** về việc gửi chữ tới OpenAI, Google hay DeepSeek, dù dịch bằng model cloud đã có trên `main`. Mục mới phải phủ cả dịch cloud lẫn ghi chú cloud, và các câu "không gửi qua mạng" ở mục 2, 3 phải có ngoại lệ rõ (Task 1).
2. Trang "Dữ liệu và bảo mật": số nơi app kết nối phải khớp bảng (test `Dữ liệu và bảo mật: số nơi app kết nối…`) sau khi thêm ba nhà cung cấp cloud (Task 4).
3. `notes-manifest.mjs remove` phải cho manifest không còn khóa `notes` mà mọi khóa khác y nguyên: đây là công tắc tắt khẩn (Task 3).
4. Câu cũ trên website nói "mọi thứ xử lý trên máy", "không có gì rời máy" không kèm điều kiện: phải có luật `STALE_NOTES` chặn ở năm ngôn ngữ (Task 4).
5. App 0.6.18 trở về trước gặp manifest có khóa `notes`: phải bỏ qua khóa lạ ở gốc, không từ chối manifest (Task 3 có test với trình đọc của app cũ nếu repo có vector; không có thì ghi là điều kiện kiểm tay ở Task 5).

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `docs/legal/privacy.{vi,en}.md`, `docs/legal/eula.{vi,en}.md` (chỉ khi có câu sai), `docs/legal/README.md` | chính sách 1.15 |
| Sửa `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | các chỗ của spec §12 |
| Tạo `licenses/models/Notes-Apache-2.0-LICENSE.txt`; sửa `scripts/release/notices.mjs` (+ test của nó) | giấy phép model ghi chú |
| Tạo `scripts/models/notes-manifest.mjs`, `scripts/models/notes-manifest.test.mjs`; sửa `package.json` (script `models:notes`) | mục `notes` của manifest |
| Sửa `website/src/content/{vi,en,ja,zh,ko}/{home,features,solutions-meetings,pricing,faq,data-security}.mjs`, `website/src/strings.mjs` (nếu thẻ gói liệt kê tính năng), `website/test/site.test.mjs`, `website/test/i18n-content.test.mjs` | website |
| Sửa `docs/release/phat-hanh.md` | mục 20 |

---

### Task 1: Văn bản pháp lý và spec gốc

**Files:** sửa `docs/legal/privacy.vi.md`, `privacy.en.md`, `README.md`; đọc `eula.vi.md`, `eula.en.md`; sửa spec gốc

Nội dung phải có trong chính sách (vi; bản en cùng nghĩa, cùng số mục):

- **Mục 2 (Tóm tắt):** thêm một gạch đầu dòng: "**Model cloud do bạn tự bật** (mặc định tắt): nếu bạn chọn ChatGPT, Gemini hoặc DeepSeek ở Cài đặt › Model và nhập API key của chính bạn, ứng dụng gửi **chữ** cần dịch tới nhà cung cấp đó; và khi bạn bấm tạo ghi chú cuộc họp, ứng dụng gửi **bản dịch của phiên bạn chọn kèm nhãn người nói**. Âm thanh không bao giờ được gửi. Không gì trong số này đi qua máy chủ của chúng tôi."
- **Mục 3 (bảng dữ liệu ở lại trên máy):** hai dòng mới. "Ghi chú cuộc họp": lưu trong cơ sở dữ liệu mã hóa cùng Lịch sử (phiên chưa lưu Lịch sử: chỉ trong bộ nhớ tới khi đóng app); xóa cùng phiên, cùng "Xóa lịch sử" và "Xóa toàn bộ dữ liệu"; không có trong log hay báo cáo lỗi. "Ghi chú tạo bằng model trên máy": chữ chép lời và ghi chú không rời máy. Các dòng về chữ chép lời đang nói "không gửi qua mạng" thêm vế "trừ khi bạn bật model cloud (mục 16)".
- **Mục 4 (kết nối mạng):** thêm ba kết nối, mỗi kết nối chỉ có khi người dùng chọn nhà cung cấp đó: `api.openai.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`; nêu dữ liệu gửi (chữ cần dịch; bản dịch của phiên khi tạo ghi chú) và rằng app gọi thẳng, bằng key của người dùng.
- **Mục 6 (bên thứ ba):** một đoạn nói rõ OpenAI, Google, DeepSeek **không phải bên xử lý dữ liệu của chúng tôi**: người dùng dùng tài khoản và API key riêng, dữ liệu chịu điều khoản của nhà cung cấp đó, có thể được xử lý ngoài Việt Nam; chúng tôi không nhận, không lưu nội dung đó và không lưu API key trên máy chủ (key nằm trong kho khóa của hệ điều hành trên máy người dùng).
- **Mục 16 mới "Model cloud và ghi chú cuộc họp":** gom đủ: mặc định tắt; cái gì được gửi và cái gì không (âm thanh, câu gốc khi tạo ghi chú, glossary: kiểm lại trong mã `cloud_mt.rs` xem prompt dịch có chứa thuật ngữ của Từ điển không, có thì nói rõ); hộp đồng ý trước lần đầu tạo ghi chú bằng một nhà cung cấp, hỏi lại khi đổi nhà cung cấp; cách tắt (chọn lại Model trên máy; xóa key); ghi chú bằng model trên máy không gửi gì.
- Các mục 1 đến 15 giữ số. `README.md`: thêm đoạn "Chính sách 1.15 thêm model cloud và ghi chú cuộc họp" theo mẫu các đoạn trước, ghi rõ ngày hiệu lực do chủ dự án đặt lúc phát hành, và một câu hỏi cho luật sư: vai trò của nhà cung cấp cloud khi người dùng dùng key riêng.

- [ ] **Step 1:** Đọc `docs/legal/README.md` (mục "Đổi ngày hiệu lực" và danh sách test phụ thuộc số mục), `privacy.vi.md` cả file, và `src-tauri/src/cloud_mt.rs` phần dựng prompt (để viết đúng cái gì được gửi khi dịch).
- [ ] **Step 2:** Run: `cd $W && git grep -n -i "100%\|không rời\|không gửi\|never leaves\|not sent\|on your device" -- docs/legal/eula.vi.md docs/legal/eula.en.md`
Expected: danh sách câu. Câu nào thành sai khi người dùng bật model cloud thì sửa bằng cách thêm ngoại lệ dẫn tới chính sách mục 16 và nâng EULA lên 1.9; không có câu sai thì EULA giữ 1.8 và ghi "EULA không đổi" vào `README.md`.
- [ ] **Step 3:** Sửa hai bản chính sách theo danh sách trên; nâng số phiên bản ở đầu file lên 1.15, **không** đổi ngày hiệu lực (để nguyên dòng ngày cũ kèm ghi chú trong `README.md`).
- [ ] **Step 4:** Spec gốc `2026-09-29-desktop-meeting-translator-design.md`: bỏ dòng "Tóm tắt hoặc biên bản cuộc họp" ở §3.2 (dòng 105); thêm F14 "Ghi chú cuộc họp bằng AI" vào §3.1 dẫn tới spec 2026-11-11; D7 (dòng 56) và §10.1 thêm ngoại lệ "trừ chữ gửi tới model cloud do người dùng tự bật (dịch cloud, ghi chú cloud)"; §4.3 thêm màn hình; §6.6 bảng `notes`; §6.7 khóa `notes` của manifest; §6.9 các cài đặt `notes_auto`, `notes_template`, `notes_cloud_consent`, `notes_local_ack`.
- [ ] **Step 5:** Run: `cd $W && npx vitest run src/lib/legal.test.ts && cd website && pnpm test 2>&1 | tail -5`
Expected: PASS. Test website nào đỏ vì số mục hay câu của chính sách thì sửa trang tương ứng ở Task 4, ghi tên test vào ghi chú làm việc.
- [ ] **Step 6:** `git add -A && git commit -m "docs(phap-ly): chinh sach 1.15 them model cloud va ghi chu cuoc hop"`

---

### Task 2: Giấy phép model ghi chú

**Files:** tạo `licenses/models/Notes-Apache-2.0-LICENSE.txt`; sửa `scripts/release/notices.mjs` và test của nó

- [ ] **Step 1: Test đỏ**, cạnh test đang kiểm mục "Text-to-speech models" của `notices.mjs` (tìm bằng `git grep -ln "notices" -- scripts '*.test.mjs'`; chưa có test nào cho `notices.mjs` thì tạo `scripts/release/notices.test.mjs` gọi hàm sinh văn bản với thư mục gốc là repo): văn bản sinh ra có một mục tiêu đề `Meeting-notes model: Qwen3.5-4B (Apache-2.0), GGUF conversion by Unsloth`, chứa nguyên văn giấy phép Apache-2.0 và dòng `Source: https://huggingface.co/unsloth/Qwen3.5-4B-GGUF (revision e87f176479d0855a907a41277aca2f8ee7a09523)`.
- [ ] **Step 2:** Run: `node --test scripts/release/` → Expected: FAIL (thiếu mục).
- [ ] **Step 3:** Tạo file giấy phép: chép nguyên `licenses/models/TTS-Apache-2.0-LICENSE.txt` (cùng là Apache-2.0) rồi kiểm với file `LICENSE` của kho model gốc; kho gốc có file `NOTICE` thì nối nguyên văn vào cuối. Thêm mục vào `notices.mjs`. Thêm tên model vào dòng chú thích đầu file liệt kê các model.
- [ ] **Step 4:** Run: `node --test scripts/release/` → PASS. Run: `git diff --stat -- about.toml deny.toml Cargo.lock package.json pnpm-lock.yaml` → Expected: không dòng nào (ba kế hoạch 03–05 không thêm phụ thuộc).
- [ ] **Step 5:** `git add -A && git commit -m "docs(giay-phep): giay phep model ghi chu"`

---

### Task 3: `notes-manifest.mjs`

**Files:** tạo `scripts/models/notes-manifest.mjs`, `scripts/models/notes-manifest.test.mjs`; sửa `package.json`

**Interfaces (Produces):**
- `export const NOTES_ID = "notes-qwen35-4b";`
- `export function notesEntry({ file, bytes, sha256, version, minAppVersion, minRamMib = 15360, ctx = 16384, licenseId = "Apache-2.0" })` → `{ id, version, file, url: "notes/<12 ký tự đầu của sha256>/<tên file>", bytes, sha256, license_id, min_app_version, min_ram_mib, ctx }`; ném lỗi nêu tên trường đầu tiên sai. Luật như `manifest.rs` (kế hoạch 03 Task 1): `bytes` ≤ `4 << 30`, `min_ram_mib` 8192–65536, `ctx` 8192–32768, tên file an toàn, `min_app_version` dạng `x.y.z`.
- CLI: `node scripts/models/notes-manifest.mjs add --file <gguf> --min-app-version <x.y.z> [--min-ram-mib N] [--ctx N] [--released-dir <thư mục>]` và `… remove [--released-dir <thư mục>]`. Như `speaker-manifest.mjs`: không chạm mạng; ghi `body-<N+1>.json` chưa ký; in các việc tiếp theo cho người vận hành (tải file và giấy phép lên `models/notes/<sha12>/`, ký bằng workflow `sign-manifest.yml`, đăng).
- `package.json`: `"models:notes": "node scripts/models/notes-manifest.mjs"`.

- [ ] **Step 1: Test đỏ** (`node:test`, theo `speaker-manifest.test.mjs`, dùng thư mục tạm và một file giả vài byte có SHA-256 tính trong test):
  - `add ghi body kế tiếp có khóa notes và giữ nguyên mọi khóa khác` (kể cả `speaker`, `tts`, `files`, `packs`)
  - `add hai lần thay mục cũ, không tạo hai mục`
  - `remove bỏ khóa notes và giữ nguyên mọi khóa khác`
  - `notesEntry từ chối ctx, min_ram_mib, bytes, tên file, min_app_version sai` (bảng)
  - `url nằm dưới notes/ theo 12 ký tự đầu của sha256`
  - `mục sinh ra đọc được bằng luật của app`: so từng trường với vector `notes_entry` trong test Rust của kế hoạch 03 Task 1 (chép các giá trị đó vào test, kèm chú thích dẫn file Rust).
- [ ] **Step 2:** Run: `node --test scripts/models/notes-manifest.test.mjs` → Expected: FAIL (module chưa có).
- [ ] **Step 3:** Cài, dùng lại `bumpBody`, `latestBody`, `publishedAtNow`, `serializeJson` của `update-lib.mjs`.
- [ ] **Step 4:** Run: `node --test scripts/models/` → Expected: PASS toàn bộ thư mục.
- [ ] **Step 5:** Run thử ở thư mục tạm với file thật: `cp -r scripts/models/released /tmp/rel && node scripts/models/notes-manifest.mjs add --file /d/Dev/WORKSPACE/ai-translator-data/ghi-chu/models/Qwen3.5-4B-Q4_K_M.gguf --min-app-version 0.6.19 --released-dir /tmp/rel && tail -c 600 /tmp/rel/body-*.json | tail -1`
Expected: mục `notes` có `"bytes": 2740937888` và `"sha256": "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"`. Không ghi gì vào `scripts/models/released` của repo. (`0.6.19` chỉ là ví dụ để chạy thử; số thật do chủ dự án chốt lúc phát hành.)
- [ ] **Step 6:** `git add -A && git commit -m "feat(models): lenh dang va go muc notes cua manifest"`

---

### Task 4: Website năm ngôn ngữ

**Files:** sửa `website/src/content/{vi,en,ja,zh,ko}/{home,features,solutions-meetings,pricing,faq,data-security}.mjs`; `website/test/site.test.mjs`; nếu cần `website/src/strings.mjs`, `website/src/build/build.mjs` (`keyFacts()`), ba file `llms*.txt` do bộ sinh tạo

Điều phải nói, giống nhau ở năm ngôn ngữ (chữ vi dưới đây là chữ chốt; en dịch sát; ja/zh/ko dịch từ en theo "Quy tắc dịch" của `website/README.md`):

| Trang | Thêm gì |
|---|---|
| `features` | Một mục "Ghi chú cuộc họp bằng AI" (id `meeting-notes`): "Sau khi họp xong, bấm một nút để có tóm tắt, quyết định, việc cần làm và câu hỏi còn mở. Mỗi ý dẫn về câu gốc trong bản chép lời để bạn kiểm lại." Hai cách tạo: "bằng model cloud bạn đã chọn để dịch (ChatGPT, Gemini hoặc DeepSeek, dùng API key của bạn): nhanh, vài giây tới dưới một phút" và "bằng model AI chạy trên máy: không gửi gì ra ngoài, chậm hơn nhiều và là bản nháp cần kiểm lại". Điều kiện: "Tạo ghi chú sau khi dừng phiên dịch; chưa có tóm tắt trong lúc họp." Hàng mới trong bảng so sánh gói: Free "3 lần trong thời gian dùng thử", các gói trả phí "Không giới hạn". |
| `solutions-meetings` | Một khối ngắn dẫn tới `features#meeting-notes`, cùng hai câu đầu của mục trên. |
| `home` | Một dòng trong danh sách tính năng chính: "Ghi chú cuộc họp: tóm tắt, quyết định, việc cần làm sau mỗi buổi họp." Khối "Máy chủ không có nội dung cuộc họp" giữ nguyên ý (vẫn đúng: không gì qua máy chủ của sản phẩm) và thêm câu: "Nếu bạn tự bật model cloud, chữ đi thẳng từ máy bạn tới nhà cung cấp bạn chọn." |
| `pricing` | Hàng "Ghi chú cuộc họp" trong bảng so sánh, như `features`; câu "Ghi chú không trừ thời lượng dịch." |
| `faq` | Ba câu: "Ghi chú cuộc họp có gửi nội dung cuộc họp đi đâu không?" (Local: không; Cloud: bản dịch của phiên bạn chọn kèm nhãn người nói, tới nhà cung cấp bạn chọn, bằng key của bạn; âm thanh và câu gốc không gửi; app hỏi trước lần đầu). "Tạo ghi chú bằng model trên máy mất bao lâu?" (số đo kèm điều kiện ở Global Constraints; cần máy từ 16 GB RAM; phải tải thêm một gói khoảng 2,6 GB). "Ghi chú có chính xác không?" (do AI tạo, có thể sai người nhận việc, hạn hay sót ý; luôn kiểm lại trước khi gửi; bản tạo bằng model trên máy là bản nháp). |
| `data-security` | Bảng nơi app kết nối: thêm ba dòng `api.openai.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, cột điều kiện "Chỉ khi bạn chọn model cloud này và nhập API key"; cập nhật **số nơi** ở câu mở đầu, dòng tóm tắt và mô tả trong `llms.txt`. Một mục "Model cloud và ghi chú cuộc họp" tóm tắt chính sách mục 16. Các câu "không rời máy" của trang thêm điều kiện "khi dùng model trên máy (mặc định)". |

Giới hạn phải nói thẳng (thêm vào bảng `need` của `site.test.mjs` cho trang `features` và `faq`, năm ngôn ngữ): "bản nháp", "kiểm lại", "sau khi dừng phiên", "16 GB".

- [ ] **Step 1: Test đỏ** trong `website/test/site.test.mjs`:
  - Luật `STALE_NOTES` (theo mẫu `STALE_SPEAKER`, kèm `STALE_NOTES_MUST_CATCH` và `STALE_NOTES_MUST_KEEP`), quét mọi nguồn chữ của `dist/` ở năm ngôn ngữ, chặn: câu khẳng định tuyệt đối rằng không chữ nào rời máy mà trong cùng đoạn không có điều kiện về model cloud ("không có gì rời máy", "100% trên máy", "nothing ever leaves your device", và cách nói tương đương ở ja/zh/ko); "chưa có tóm tắt cuộc họp", "không có biên bản cuộc họp"; "tóm tắt trong lúc họp", "tóm tắt theo thời gian thực". `MUST_KEEP`: "âm thanh không rời máy", "khi dùng model trên máy, chữ chép lời không rời máy".
  - `ghi chú cuộc họp: trang Tính năng có mục meeting-notes và nói đủ giới hạn` (năm ngôn ngữ; cụm bắt buộc ở trên).
  - `ghi chú cuộc họp: bảng so sánh gói có hàng ghi chú với "3" ở cột Free` (trang `features` và `pricing`).
  - `ghi chú cuộc họp: không trang nào nêu tên model trên máy` (không có "Qwen", "GGUF", "llama" trong `dist/`; nếu test `không lộ công nghệ lõi` đã phủ các từ này thì thêm ba từ vào danh sách của nó thay vì viết test mới).
  - Sửa kỳ vọng của test `Dữ liệu và bảo mật: số nơi app kết nối…` chỉ khi nó có số cứng; nếu nó tự đếm dòng bảng thì không đụng.
- [ ] **Step 2:** Run: `cd $W/website && pnpm test 2>&1 | tail -15` → Expected: các test mới FAIL.
- [ ] **Step 3:** Sửa sáu trang vi và en. Run `pnpm test` → các test vi/en xanh; `test/i18n-content.test.mjs` đỏ vì ja/zh/ko lệch khung.
- [ ] **Step 4:** Sửa sáu trang ja, zh, ko từ bản en. Run: `pnpm build && pnpm test 2>&1 | tail -8` → Expected: PASS toàn bộ.
- [ ] **Step 5:** Ảnh chụp: website **không** thêm ảnh màn hình Ghi chú ở kế hoạch này (script chụp chỉ chạy trên macOS; máy làm việc là Windows). Ghi vào `docs/release/phat-hanh.md` mục 20 một việc **[CHỦ DỰ ÁN]**: chụp `app-notes` bằng `scripts/ui-preview/shoot.mjs` trên macOS rồi thêm vào trang Tính năng. Run: `git status --short website/src/assets | wc -l` → Expected: `0`.
- [ ] **Step 6:** `git add -A && git commit -m "feat(website): ghi chu cuoc hop tren nam ngon ngu"`

---

### Task 5: Runbook phát hành

**Files:** sửa `docs/release/phat-hanh.md` (mục mới `## 20. Ghi chú cuộc họp: phát hành, bật gói trên máy, tắt khẩn`), theo đúng bố cục mục 16

Mục 20 gồm, theo thứ tự:

- **20.1 Hai bước và các công tắc.** Bước 1: phát hành app (Cloud dùng được ngay; Local "ngủ" vì manifest chưa có `notes`). Bước 2: đăng manifest có `notes` (bật Local). Công tắc: khóa `notes` của manifest (tắt Local từ xa); `notes.min_ram_mib` (đổi ngưỡng không cần phát hành app); không có công tắc từ xa cho Cloud (tắt bằng bản app mới).
- **20.2 Điều kiện trước bước 1** (danh sách kiểm): ba kế hoạch 03–05 xong, `cargo test`, `vitest`, `pnpm test` của website xanh; thử tay sáu mục của kế hoạch 04 Task 7 trên Windows và macOS; chạy thật DeepSeek, và **[CHỦ DỰ ÁN]** chạy thật một lần với key Gemini và ChatGPT (chưa ai chạy hai nhà cung cấp này cho ghi chú); chính sách 1.15 có ngày hiệu lực; `THIRD_PARTY_NOTICES.txt` của bản build có mục model ghi chú.
- **20.3 Phát hành app [CHỦ DỰ ÁN]:** merge, đổi số phiên bản, build, ký, đăng theo mục 2. Deploy website sau cùng.
- **20.4 Bật Local [CHỦ DỰ ÁN]:** tải `Qwen3.5-4B-Q4_K_M.gguf` cùng `LICENSE` (và `NOTICE` nếu có) lên R2 dưới `models/notes/00fe7986ff5f/`; kiểm `sha256sum` của file trên R2 sau khi tải; `pnpm models:notes add --file … --min-app-version <bản vừa phát hành>`; ký bằng workflow `sign-manifest.yml`; đăng; mở app bản phát hành trên một máy ≥ 16 GB: thấy khối "Gói ghi chú trên máy", tải, tạo một ghi chú; mở trên máy < 16 GB (hay hạ tạm `min_ram_mib` trong một manifest thử): thấy câu `notes.pack.ramTooLow`.
- **20.5 Kiểm app cũ:** mở app 0.6.18 sau khi manifest có `notes`: vẫn tải và dùng model như cũ (khóa lạ ở gốc bị bỏ qua).
- **20.6 Tắt khẩn, từ nhẹ tới nặng:** (a) `pnpm models:notes remove`, ký, đăng: Local ẩn ở lần app kiểm manifest kế tiếp; ghi chú đã tạo còn nguyên; (b) nâng `min_ram_mib`; (c) phát hành app không có mục điều hướng (sửa `SCREENS`).
- **20.7 Việc còn nợ sau phát hành:** ảnh `app-notes` cho website (macOS); đo Local trên máy 16 GB thật và máy chỉ CPU khác; người bản ngữ duyệt chuỗi ja/zh/ko.

- [ ] **Step 1:** Viết mục 20 theo dàn ý trên; mọi lệnh chép từ kế hoạch 05 Task 3 và từ mục 13, 16 của chính file này (không bịa tên bucket, tên workflow hay cờ lệnh: lấy đúng chữ đang có ở mục 16.5).
- [ ] **Step 2:** Run: `cd $W && git grep -n "models/speaker\|sign-manifest" -- docs/release/phat-hanh.md | head -5` rồi so tên bucket, đường dẫn và tên workflow trong mục 20 với kết quả → Expected: trùng cách viết.
- [ ] **Step 3:** `git add -A && git commit -m "docs(phat-hanh): muc 20 ghi chu cuoc hop"`

---

### Task 6: Kiểm cuối cả nhánh

- [ ] **Step 1:** Run: `cd $W && CARGO_TARGET_DIR=/d/Dev/WORKSPACE/ai-translator/target cargo test --manifest-path src-tauri/Cargo.toml --lib 2>&1 | tail -3 && cargo clippy --manifest-path src-tauri/Cargo.toml --lib --tests 2>&1 | tail -3 && npx tsc --noEmit && npx vitest run 2>&1 | tail -4 && node --test scripts/models/ scripts/release/ 2>&1 | tail -4 && (cd website && pnpm build && pnpm test 2>&1 | tail -4)`
Expected: mọi bộ 0 failed.
- [ ] **Step 2:** Run: `git grep -n -i "qwen\|gguf\|llama" -- website/src src/i18n | head` → Expected: không dòng nào.
- [ ] **Step 3:** Run: `git grep -n "sk-\|AIza\|DEEPSEEK_APIKEY" -- . ':!docs/superpowers' ':!*.test.*' ':!src-tauri/src' | head` → Expected: không có giá trị khóa thật nào (chỉ chuỗi giả của test nếu có).
- [ ] **Step 4:** Báo chủ dự án: danh sách việc **[CHỦ DỰ ÁN]** của mục 20.2 đến 20.4, các mục thử tay chưa làm được, và mọi `Ruling:` đã ghi trong sổ. Không merge, không push.
