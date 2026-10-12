# Giao diện app thêm tiếng Nhật, Trung, Hàn

Ngày 2026-10-12. Spec chính (`2026-09-29-desktop-meeting-translator-design.md`) chỉ có giao diện tiếng Việt và English (D8, F7, §4.5); mục "Thêm ngôn ngữ giao diện" nằm ở Phase 3. Spec này đưa nó vào làm ngay: thêm **日本語, 中文 (giản thể), 한국어**, và khi mở app lần đầu thì ngôn ngữ giao diện lấy theo ngôn ngữ hệ điều hành.

## 1. Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| Q1 | Ba ngôn ngữ mới là `ja`, `zh`, `ko`. Mọi locale tiếng Trung (`zh-CN`, `zh-TW`, `zh-HK`, `zh-Hans`, `zh-Hant`, `zh`) đều ra giao diện **chữ giản thể**. | Chủ dự án chọn (2026-10-12). Khớp `lang.zh` (app chỉ có một ngôn ngữ Trung) và việc app chuẩn hóa chữ Trung nhận dạng được về giản thể (§6.4). Người dùng zh-TW đọc được. Không làm chữ phồn thể. |
| Q2 | EULA và Chính sách quyền riêng tư của `ja`, `zh`, `ko` hiện bản **English**, kèm một dòng báo. Chỉ `vi` dùng bản `vi`. | Chủ dự án chọn. Văn bản pháp lý chỉ có `vi` và `en`; bản dịch pháp lý cần người có chuyên môn duyệt. Người Nhật, Trung, Hàn không đọc được bản tiếng Việt để tick đồng ý. |
| Q3 | Làm trực tiếp trên nhánh `main`, không push. | Chủ dự án chọn. |
| Q4 | Từ điển tĩnh gói sẵn trong app, theo cách §4.5 đang làm. Không thêm thư viện i18n. | Mỗi từ điển khoảng 35 KB; `translate()` giữ đồng bộ; không phải qua quy trình kiểm phiên bản thư viện (§6.12). |

## 2. Nhận ngôn ngữ của máy

Hai hàm làm cùng một việc ở hai đầu và phải cho cùng kết quả:

- Rust: `ui_language_from_locale` (`src-tauri/src/i18n.rs`), dùng `sys_locale`. Đây là nơi **quyết định** giá trị mặc định của cài đặt (`Settings::defaults(i18n::system_ui_language())` ở `lib.rs`).
- TypeScript: `detectUiLanguage` (`src/i18n/index.ts`), dùng `navigator.languages`. Chỉ là ngôn ngữ tạm trước khi đọc được cài đặt (`fallbackLanguage` trong `appStore.ts`).

Quy tắc, giữ nguyên cách xét "locale đầu tiên" đang dùng: lấy phần ngôn ngữ chính (trước `-` hay `_`, không phân biệt hoa thường).

| Phần ngôn ngữ chính | Giao diện |
|---|---|
| `vi` | `vi` |
| `ja` | `ja` |
| `ko` | `ko` |
| `zh`, `yue` | `zh` (macOS báo `yue-Hant-HK` cho người dùng tiếng Quảng Đông; họ đọc chữ Hán) |
| còn lại, hoặc không có locale | `en` |

Phải so khớp cả phần chính, nên `video`, `jam`, `korean` không khớp. Ví dụ: `zh-Hant-TW` → `zh`, `zh_CN` → `zh`, `ja-JP` → `ja`, `ko-KR` → `ko`, `yue-HK` → `zh`, `fr-FR` → `en`, `en-US` → `en`.

- Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (đang làm cho `vi`/`en`): `Settings::defaults` ánh xạ `ja→Lang::Ja`, `zh→Lang::Zh`, `ko→Lang::Ko`.
- Bước 1 của onboarding vẫn hiện ô chọn (§4.1); giá trị chọn sẵn là ngôn ngữ máy, và đổi ô chọn vẫn đổi cả ngôn ngữ đích như hiện nay.
- Người đã có file cài đặt giữ nguyên ngôn ngữ đã lưu; chỉ máy mới hay máy chưa có cài đặt mới dùng ngôn ngữ của hệ điều hành. File cài đặt đọc từng khóa (`migrate::load`), giá trị lạ về mặc định, nên không cần migrate.
- Danh sách chọn ngôn ngữ giao diện (bước 1 onboarding và Cài đặt › Chung) dùng chung một hằng `UI_LANGUAGES = ["vi", "en", "ja", "zh", "ko"]` trong `src/i18n/index.ts`, nhãn là `lang.<mã>` (tên mỗi ngôn ngữ viết bằng chính nó, không đổi theo ngôn ngữ giao diện). Hiện hai nơi này gõ tay danh sách riêng (onboarding `vi, en`; Cài đặt `en, vi`), thống nhất về một thứ tự.

## 3. Từ điển phía giao diện (`src/i18n/`)

- `UiLanguage = "en" | "vi" | "ja" | "zh" | "ko"`. `dictionaries` thành `Record<UiLanguage, Record<MessageKey, string>>`, nên thiếu một khóa ở bất kỳ ngôn ngữ nào là lỗi biên dịch.
- Ba file mới `ja.ts`, `zh.ts`, `ko.ts`, mỗi file đủ mọi khóa của `en.ts` (khoảng 480). `en.ts` vẫn là nguồn chuẩn cho danh sách khóa.
- Câu xem trước phụ đề (`settings.subtitles.preview.*`, cả nhóm `live`): câu gốc và câu dịch khác ngôn ngữ nhau (en.ts: gốc tiếng Nhật, dịch English; vi.ts: gốc English, dịch tiếng Việt). Ở ba bản mới, **câu gốc là English** và câu dịch bằng ngôn ngữ giao diện. Giữ nguyên cấu trúc `stable` + `tail` của nhóm `live` (test `SubtitlePreview.test.ts` kiểm).
- Văn phong: lịch sự trung tính, ngắn như bản English. Tiếng Nhật dùng thể です・ます. Tiếng Trung dùng chữ giản thể và dấu câu toàn chiều rộng. Tiếng Hàn dùng thể 합쇼체 (`-합니다` / `-하세요`). Tên sản phẩm "AI Translator", tên gói (Free, Monthly, Yearly) và các từ `Pro`, `Beta` giữ nguyên chữ Latin như bản vi.
- **Bảng thuật ngữ** (cố định cho cả ba ngôn ngữ, để các màn hình nhất quán):

| English trong en.ts | ja | zh (giản thể) | ko |
|---|---|---|---|
| Subtitles / Subtitle bar | 字幕 / 字幕バー | 字幕 / 字幕条 | 자막 / 자막 바 |
| Translation | 翻訳 | 翻译 | 번역 |
| Original | 原文 | 原文 | 원문 |
| Source language | 音声の言語 | 源语言 | 원본 언어 |
| Target language | 翻訳先の言語 | 目标语言 | 번역 언어 |
| Transcript | 文字起こし | 转写记录 | 대본 |
| Glossary | 用語集 | 术语表 | 용어집 |
| Model / Model pack | モデル / モデルパック | 模型 / 模型包 | 모델 / 모델 팩 |
| License / License key | ライセンス / ライセンスキー | 许可证 / 许可证密钥 | 라이선스 / 라이선스 키 |
| Upgrade to Pro | Pro にアップグレード | 升级到 Pro | Pro로 업그레이드 |
| Settings | 設定 | 设置 | 설정 |
| Shortcuts | ショートカット | 快捷键 | 단축키 |

- **Không có người bản ngữ duyệt:** bản dịch do Claude viết, kiểm bằng test cấu trúc (mục 7), chưa qua người bản ngữ. Ghi rõ trong spec; nên nhờ người bản ngữ đọc trước khi nói công khai app có các ngôn ngữ này.

## 4. Chuỗi phía Rust (`src-tauri/src/i18n.rs`)

- `settings::UiLanguage` thêm `Ja`, `Zh`, `Ko` (`serde rename_all = "lowercase"` ra `ja`, `zh`, `ko`, cùng dạng với `Lang`).
- Thêm hằng `JA`, `ZH`, `KO` kiểu `Strings` (21 trường: menu khay, chú thích khay, tên cửa sổ, tiêu đề và tên cột file xuất bản chép lời). `strings()` khớp đủ năm nhánh nên thêm biến thể mà quên chuỗi thì không biên dịch được.
- Các test hiện có (đủ chuỗi, cùng tham số, đã được dịch) chạy cho cả năm ngôn ngữ thay vì hai.

## 5. Các chỗ đang giả định hai ngôn ngữ

| Chỗ | Hiện tại | Sau khi đổi |
|---|---|---|
| `pickLegal` / `loadLegal` (`src/lib/legal.ts`) | thiếu bản ngôn ngữ thì dùng bản `vi` | thiếu bản thì dùng bản `en`; `vi` dùng bản `vi`. `loadLegal` trả thêm ngôn ngữ thực sự dùng để giao diện biết có rơi về English không |
| `LegalDocument` (`src/windows/main/LegalDocument.tsx`) | chỉ hiện văn bản | khi văn bản không cùng ngôn ngữ giao diện thì thêm một dòng báo (khóa mới `legal.fallbackNote`, đã dịch đủ năm ngôn ngữ, nội dung: "Văn bản này hiện bằng English" tương ứng). Bước 1b của onboarding dùng thành phần này nên có dòng báo |
| `Localized` (`src/lib/models.ts`: tên gói, ghi chú chất lượng từ manifest) | `{ vi, en }`, `localized()` đọc `text[lang]` | giữ `{ vi, en }` (manifest và server không đổi); ba ngôn ngữ mới dùng `en` |
| `<html lang>` (`main.tsx`, `overlay.tsx`) | `root.lang = uiLanguage` | hàm `htmlLang()`: `en`, `vi`, `ja`, `zh-Hans`, `ko`. Cần để WebView chọn đúng font CJK (chữ Hán Nhật và Hán Trung có hình khác nhau) và trình đọc màn hình đọc đúng giọng |
| Font | `--font` và font thanh phụ đề (`overlay.css`) là font hệ thống, không có font CJK riêng | **không thêm font**; thuộc tính `lang` làm WebView chọn Hiragino/PingFang/Apple SD Gothic Neo (macOS), Yu Gothic UI/Microsoft YaHei UI/Malgun Gothic (Windows). Xem mục 7 về phần chưa kiểm được trên Windows |
| `formatBytes` | dấu phẩy thập phân chỉ cho `vi` | không đổi (ja/zh/ko dùng dấu chấm như English) |
| `UpgradeScreen` (`toLocaleString("vi-VN")`) | định dạng tiền VND, không theo ngôn ngữ giao diện | không đổi: giá luôn là VND |
| `?? "vi"` / `?? "en"` khi chưa có cài đặt | dự phòng | không đổi |

## 6. macOS: câu hỏi quyền hệ thống

Câu hỏi quyền "Ghi âm thanh hệ thống" (`NSAudioCaptureUsageDescription`) do macOS hiện, lấy từ `InfoPlist.strings` theo ngôn ngữ của hệ thống (đang có `en`, `vi`). Thêm ba bản, cùng nội dung và cùng câu "âm thanh không rời khỏi máy":

- `src-tauri/macos/ja.lproj/`, `zh-Hans.lproj/`, `ko.lproj/` (thư mục tiếng Trung giản thể của macOS là `zh-Hans`, không phải `zh`).
- `src-tauri/Info.plist`: `CFBundleLocalizations` thêm `ja`, `zh-Hans`, `ko`.
- `src-tauri/tauri.conf.json`: `bundle.macOS.files` thêm ba dòng `Resources/<lproj>/InfoPlist.strings`.
- `scripts/run-dev-app.sh`: vòng `for lang in en vi` chép cả ba thư mục mới (ở đây `lang` là tên thư mục lproj).
- Test `the_audio_permission_prompt_is_localized` (`src-tauri/src/app_tests.rs`) mở rộng cho ba bản mới và kiểm `Info.plist` liệt kê đủ.

Windows: bản phát hành không dùng trình cài có giao diện chọn ngôn ngữ (cài bằng `install.ps1`, chạy `/S`), nên không có gì để thêm.

## 7. Kiểm chứng

- **`vitest`** (`src/i18n/i18n.test.ts`, mở rộng):
  - Mỗi ngôn ngữ có đúng các khóa của `en`, cùng tham số `{…}`, không chuỗi rỗng, không thừa khoảng trắng.
  - Mỗi chuỗi của `ja`/`zh`/`ko` có ít nhất một ký tự của hệ chữ đó (ja: kana hoặc Hán; zh: Hán; ko: Hangul), trừ danh sách tên riêng cố định (tên sản phẩm, tên gói, `Pro`, `Beta`, nhãn kỹ thuật như `SRT`, `CSV`). Test này bắt chuỗi còn sót tiếng Anh. Câu gốc English của phần xem trước phụ đề nằm trong danh sách trừ.
  - Chuỗi tiếng Việt giữ test "đã được dịch" như hiện nay; thêm test tương tự cho ba ngôn ngữ mới (không chuỗi nào trùng English trừ danh sách trừ).
  - `detectUiLanguage`: bảng ví dụ ở mục 2, **cùng bảng** với test Rust để hai bản không lệch.
  - `pickLegal`/`loadLegal`: `vi` → bản `vi`; `en` → `en`; `ja`/`zh`/`ko` → `en` kèm cờ rơi về; không có bản nào thì `null`.
  - `localized()`: ba ngôn ngữ mới lấy `en`.
  - `htmlLang()`.
- **`cargo test`:** `ui_language_from_locale` theo bảng mục 2; `Settings::defaults` cho ba ngôn ngữ mới (ngôn ngữ đích đúng); chuỗi Rust của năm ngôn ngữ; cài đặt `uiLanguage: "ja"` ghi rồi đọc lại; test lproj mục 6. `cargo clippy` và `tsc --noEmit` sạch.
- **Chụp ảnh bằng `scripts/ui-preview`** (cổng 1430, IPC giả) ở `ja`, `zh`, `ko`, mỗi ngôn ngữ ở sáng và tối: các màn Trang chủ, Bản chép lời, Thuật ngữ, Cài đặt (đủ các nhóm), Nâng cấp, onboarding (bước ngôn ngữ, điều khoản, mô hình), thanh phụ đề. Tìm chữ tràn, cắt, xuống dòng xấu ở thanh bên khi cửa sổ hẹp, nhãn nút dài hơn bản English. Sửa CSS ở đúng chỗ tràn, không thêm mẹo chung.
- **Thử app dev thật trên Mac (lần đầu mở):** xóa file cài đặt, mở với `-AppleLanguages "(ja)"`, `(zh-Hant)`, `(ko)`, `(vi)`, `(fr)`; kiểm bước 1 chọn sẵn đúng, ngôn ngữ đích đúng, tên menu khay đúng. Chạy `run-dev-app.sh` để thấy câu hỏi quyền macOS bằng ngôn ngữ mới (nếu máy cho phép đổi ngôn ngữ hệ thống mà không phiền; nếu không, kiểm qua `plutil` và nội dung file).
- **Chưa kiểm được trong phiên này: Windows.** Không có máy Windows, nên chưa biết font CJK (Yu Gothic UI, Microsoft YaHei UI, Malgun Gothic) hiện thế nào ở cỡ chữ 14 px và trên thanh phụ đề. Chủ dự án thử tay ở lần nghiệm thu Windows tiếp theo (mở app với ngôn ngữ hiển thị Windows là Nhật/Trung/Hàn, đi hết onboarding, mở Cài đặt, chạy một phiên dịch có thanh phụ đề).

## 8. Không làm trong spec này

- Chữ phồn thể (Q1).
- Bản dịch EULA và Chính sách quyền riêng tư (Q2).
- Menu app của macOS (About, Edit, Window, Quit…): §4.5 để English của các mục có sẵn.
- Manifest model, server, email giao dịch: giữ `vi`/`en`.
- **Website:** nói "giao diện app có tiếng Việt và English" ở `website/src/content/{vi,en}/{about,faq,home}.mjs` và `website/src/build/build.mjs`. Hiện vẫn đúng, nên **chưa sửa**. Sửa sau khi bản phát hành chứa tính năng này ra (nội dung website chỉ được nói điều có thật). Việc đó làm riêng, theo `website/README.md`.
- Người dùng có ngôn ngữ ngoài năm ngôn ngữ này vẫn thấy English (như bản `vi`/`en` hiện nay).

## 9. Cập nhật spec chính (cùng đợt)

- D8: "Tiếng Việt, English, 日本語, 中文, 한국어; đổi được trong Cài đặt". F7 tương tự.
- §4.1 bước 1: "Mặc định theo hệ điều hành: tiếng Việt, 日本語, 中文 (mọi locale tiếng Trung, chữ giản thể) hay 한국어 nếu máy dùng ngôn ngữ đó, còn lại là English." Thêm một dòng ở bước 1b: ngôn ngữ chưa có bản pháp lý riêng thì hiện bản English, kèm dòng báo.
- §4.5: `en` là nguồn chuẩn; kiểu `Record` bắt cả bốn ngôn ngữ còn lại đủ khóa; chuỗi Rust có đủ năm ngôn ngữ; thêm ghi chú bản dịch ja/zh/ko chưa có người bản ngữ duyệt.
- Mục test giao diện (§11): i18n đủ khóa cả năm ngôn ngữ.
- Sơ đồ thư mục (§12, `src/i18n/`): "Từ điển en (chuẩn) + vi, ja, zh, ko".
- §13 Phase 3: bỏ dòng "Thêm ngôn ngữ giao diện" (đã làm); ghi chú ở chỗ đó trỏ tới spec này.
