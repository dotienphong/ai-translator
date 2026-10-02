# Giai đoạn 1 · 04b: Quản lý model — nối vào app và giao diện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Phần cuối của kế hoạch 04 (mục 2.4 của kế hoạch 00): nối phần lõi của 04a vào app và giao diện. Gồm:
- `modelTier` là mã gói của manifest, chỉ đổi qua lệnh của quản lý model;
- dịch vụ model (`ModelService`): manifest đã nhận, việc tải chạy nền, sự kiện `models://state`, 8 lệnh cho cửa sổ chính, kiểm manifest lúc khởi động tối đa mỗi ngày một lần, hỏi trước khi tải bản mới;
- phiên dịch lấy model và ngưỡng của pipeline từ kho model; model hỏng thì băm lại; đổi gói trong lúc dịch không chạy hai bộ tiến trình phụ (ghi chú 8 của review cuối 02);
- giao diện: bước 2–3 của lần đầu mở (§4.1), Cài đặt › Model, nút "Xóa model và dữ liệu", lời mời cập nhật, tiến độ tải;
- kiểm tra chuẩn; bucket R2 staging (người); đợt Windows; cập nhật kế hoạch 00.

**Kiến trúc:**
- `ModelService` là trạng thái quản lý của app (`Arc<ModelService>`), giữ phần thay được trong test ở `Config` (thư mục, URL, khóa, cấu hình máy, dung lượng trống, đồng hồ). App thật dùng `Config::live`; app giả (`mock_app_full`) dùng thư mục tạm, khóa test, Mac 16 GB, đồng hồ giả.
- Test của dịch vụ chạy app bằng `MockRuntime` với ACL thật và gọi lệnh như giao diện gọi, cùng server HTTP giả của 04a: không mạng, không mở cửa sổ.
- Giao diện: store Zustand riêng cho model (`src/store/models.ts`), hàm thuần trong `src/lib/models.ts`, test bằng vitest; component mỏng, chỉ đọc store.

**Công nghệ:** Như 04a (bảng "Phiên bản đã chốt" của 04a). Không thêm crate hay gói npm nào.

Đọc trước 04a (`docs/superpowers/plans/2026-10-02-giai-doan-1-04a-quan-ly-model-loi.md`): các mục "Phiên bản đã chốt", "Cách đọc kế hoạch này", "Task → commit tham chiếu", "Dòng của bảng đối chiếu", "Quyết định", "Điểm cần chủ dự án quyết", "File giao nhau với kế hoạch 03" áp cho file này. Làm file này sau khi 04a đã commit hết.

## Quyết định (tiếp theo QĐ1–QĐ12 của 04a)

- **QĐ13. Phần "dữ liệu" của "Xóa model và dữ liệu".** Lệnh `delete_models_and_data` xóa cả thư mục model rồi gọi `models::commands::wipe_user_data`; lúc lập 04, `main` chưa có lịch sử hay từ điển (kế hoạch 03), nên hàm chỉ ghi log. 03 hay người dựng 04 sau 03 nối hàm xóa của 03 vào đó (04a, mục "File giao nhau"). Bản quyền và bộ đếm hạn mức trong kho khóa không bị đụng tới (Q14).
- **QĐ14. Tải xong một gói thì gói đó thành gói đang dùng.** Lý do duy nhất để tải một gói khác là đổi sang gói đó (§4.3: "gói đang dùng, dung lượng, tải lại hoặc xóa"). Gói đã tải thì đổi bằng nút "Dùng gói này" (`select_model_pack`).
- **QĐ15. Gói mới dùng từ phiên sau; không chạy hai bộ tiến trình phụ** (ghi chú 8 của review cuối 02). `LiveDeps::prepare` dùng lại bộ tiến trình phụ đang có khi phiên đang chạy; gói mới có tác dụng ở lần bắt đầu sau. Đang dịch bằng một gói thì không tải bản cập nhật đè lên nó và không xóa nó (`modelsInUse`); đang tải bản cập nhật của gói đang dùng thì không bắt đầu phiên (`modelsBusy`). Tải một gói khác trong lúc dịch vẫn được.
- **QĐ16. Tắt tiến trình phụ rảnh trước khi xóa hay tải đè model** (`SessionDeps::release_models`): Windows không cho đổi tên đè hay xóa file đang mở.
- **QĐ17. Model nạp lỗi (`modelBroken`) thì băm lại cả gói trên luồng nền**; file sai SHA-256 bị xóa, gói hiện "chưa tải" và người dùng tải lại (§9). Lúc bắt đầu phiên chỉ kiểm có file và đúng kích thước; sai kích thước là `modelBroken`.
- **QĐ18. "Xóa model và dữ liệu" bỏ gói đang dùng (`modelTier` thành `null`) nhưng không đưa app về lần đầu mở**; manifest vẫn giữ trong bộ nhớ để tải lại được ngay. Xác nhận hai bước ngay trong app (không dùng `window.confirm`).
- **QĐ19. Bước 3 tự bắt đầu tải** khi vào bước (hay tải tiếp phần dở của lần trước); người dùng đi tiếp được trong lúc model tải ở nền, tiến độ hiện ở màn hình chính. Mở lại app không tự tải tiếp; Cài đặt › Model và màn hình chính có nút Tiếp tục.
- **QĐ20. Dung lượng hiển thị theo đơn vị thập phân** (GB = 10⁹ byte), như spec ghi "khoảng 2,5 GB"; tiếng Việt dùng dấu phẩy thập phân.

---

## Task 7: `modelTier` là mã gói của manifest

QĐ3 (04a); ghi chú 8 của review cuối 02 (phần chặn ở gốc: `modelTier` không còn sửa được qua `update_settings`):
- `settings/mod.rs`: bỏ enum `ModelTier`; `model_tier: Option<String>`, kiểm như mã gói của manifest (chữ thường, số, `.`, `_`, `-`, tối đa 32 ký tự). File cài đặt cũ có `"standard"` hay `"lite"` vẫn đọc được.
- `settings/patch.rs`: `modelTier` vào danh sách khóa chỉ đọc.
- `sidecar/paths.rs`, `sidecar/mod.rs`, `session.rs`, `src/lib/ipc.ts`: theo kiểu mới.

**Files:**
- Sửa: `src-tauri/src/settings/mod.rs`
- Sửa: `src-tauri/src/settings/patch.rs`
- Sửa: `src-tauri/src/sidecar/paths.rs`
- Sửa: `src-tauri/src/sidecar/mod.rs`
- Sửa: `src-tauri/src/session.rs`
- Sửa: `src/lib/ipc.ts`

- [ ] **Step 1: Viết test**

Sửa `src-tauri/src/settings/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/settings/mod.rs
+++ b/src-tauri/src/settings/mod.rs
@@ -491,4 +491,29 @@ mod tests {
     }
 
+    /// Gói model là mã gói của manifest (Đ7): chữ thường, số, `.`, `_`, `-`, tối đa 32 ký tự.
+    #[test]
+    fn model_tier_is_a_pack_id() {
+        let mut s = valid();
+        for pack in ["standard", "lite", "hybrid-m1"] {
+            s.model_tier = Some(pack.into());
+            assert_eq!(s.validate(), Ok(()), "{pack}");
+        }
+        let mut s = valid();
+        s.model_tier = Some(String::new());
+        rejects(s, "modelTier", Reason::Empty);
+        let mut s = valid();
+        s.model_tier = Some("x".repeat(33));
+        rejects(s, "modelTier", Reason::TooLong);
+        let mut s = valid();
+        s.model_tier = Some("../Standard".into());
+        rejects(s, "modelTier", Reason::WrongType);
+        let value = serde_json::to_value(Settings {
+            model_tier: Some("lite".into()),
+            ..valid()
+        })
+        .unwrap();
+        assert_eq!(value["modelTier"], json!("lite"), "file cài đặt cũ vẫn đọc được");
+    }
+
     #[test]
     fn hotkeys_must_be_valid_and_distinct() {
```

Sửa `src-tauri/src/settings/patch.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/settings/patch.rs
+++ b/src-tauri/src/settings/patch.rs
@@ -206,4 +206,8 @@ mod tests {
             Err(Invalid::new("experimental.newFlag", Reason::UnknownKey))
         );
+        assert_eq!(
+            apply(&current(), &json!({ "modelTier": "lite" })),
+            Err(Invalid::new("modelTier", Reason::ReadOnly))
+        );
     }
 
```

Sửa `src-tauri/src/sidecar/paths.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/paths.rs
+++ b/src-tauri/src/sidecar/paths.rs
@@ -128,5 +128,5 @@ mod tests {
         assert_eq!(std.asr, Path::new("/m/ggml-large-v3-turbo-q5_0.bin"));
         assert_eq!(std.mt, Path::new("/m/Hy-MT2-1.8B-Q8_0.gguf"));
-        let lite = model_files(Path::new("/m"), Some(ModelTier::Lite));
+        let lite = model_files(Path::new("/m"), Some("lite"));
         assert_eq!(lite.asr, Path::new("/m/ggml-small-q5_1.bin"));
         assert_eq!(lite.vad, Path::new("/m/silero_vad_v6.2.3.onnx"));
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib -- settings:: sidecar:: 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 6 previous errors
error[E0277]: the trait bound `ModelTier: From<&str>` is not satisfied
error[E0308]: mismatched types
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/settings/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/settings/mod.rs
+++ b/src-tauri/src/settings/mod.rs
@@ -52,12 +52,4 @@ pub enum AudioSource {
 }
 
-/// Gói model (§6.7). `None` là chưa chọn; kế hoạch 04 đặt giá trị này.
-#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
-#[serde(rename_all = "lowercase")]
-pub enum ModelTier {
-    Standard,
-    Lite,
-}
-
 /// Giao diện sáng/tối (§4.3, nhóm Chung).
 #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
@@ -159,5 +151,7 @@ pub struct Settings {
     pub vad_end_silence_ms: u32,
     pub overlay: OverlaySettings,
-    pub model_tier: Option<ModelTier>,
+    /// Gói model đang dùng (§6.7): mã gói trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest, Đ7).
+    /// `None` là chưa có gói nào. Chỉ đổi qua lệnh của kế hoạch 04 (gói phải đã tải xong).
+    pub model_tier: Option<String>,
     pub hotkeys: Hotkeys,
     pub save_history: bool,
@@ -263,4 +257,13 @@ impl Settings {
             check_id("overlay.lastMonitor", key)?;
         }
+        if let Some(pack) = &self.model_tier {
+            check_id("modelTier", pack)?;
+            if pack.chars().count() > 32 {
+                return Err(Invalid::new("modelTier", Reason::TooLong));
+            }
+            if !crate::models::manifest::is_id(pack, 32) {
+                return Err(Invalid::new("modelTier", Reason::WrongType));
+            }
+        }
         hotkeys::check_all(&self.hotkeys.bindings()).map_err(|(action, error)| {
             let reason = match error {
```

Sửa `src-tauri/src/settings/patch.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/settings/patch.rs
+++ b/src-tauri/src/settings/patch.rs
@@ -12,6 +12,13 @@ use super::{Invalid, Reason, Settings};
 /// - `hotkeys`: phải đăng ký lại với hệ điều hành (lệnh `set_hotkey`);
 /// - `overlay.locked`: phải đổi cửa sổ sang click xuyên qua (lệnh `set_overlay_locked`);
-/// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển.
-const READ_ONLY: &[&str] = &["hotkeys", "overlay.locked", "overlay.positions", "overlay.lastMonitor"];
+/// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển;
+/// - `modelTier`: gói phải đã tải xong (lệnh `select_model_pack`, `download_models` của kế hoạch 04).
+const READ_ONLY: &[&str] = &[
+    "hotkeys",
+    "overlay.locked",
+    "overlay.positions",
+    "overlay.lastMonitor",
+    "modelTier",
+];
 
 /// Khóa là object con: bản sửa gửi object con thì ghép theo từng khóa con.
```

Sửa `src-tauri/src/sidecar/paths.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/paths.rs
+++ b/src-tauri/src/sidecar/paths.rs
@@ -8,6 +8,4 @@
 use std::path::{Path, PathBuf};
 
-use crate::settings::ModelTier;
-
 /// Target triple lúc build (build.rs đặt).
 pub const TARGET: &str = env!("SIDECAR_TARGET");
@@ -65,9 +63,10 @@ pub struct ModelFiles {
 }
 
-/// File model của một gói (§6.7). Chưa chọn gói (`modelTier` rỗng, kế hoạch 04 đặt) thì dùng gói Chuẩn.
-pub fn model_files(dir: &Path, tier: Option<ModelTier>) -> ModelFiles {
-    let (asr, mt) = match tier.unwrap_or(ModelTier::Standard) {
-        ModelTier::Standard => ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
-        ModelTier::Lite => ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
+/// Bản dev chưa tải gói nào qua manifest: file model của Giai đoạn 0 trong `models/` của repo, theo tên cố định
+/// (§6.7). Gói `lite` dùng bộ của gói Nhẹ, mọi gói khác (kể cả chưa chọn) dùng gói Chuẩn.
+pub fn model_files(dir: &Path, tier: Option<&str>) -> ModelFiles {
+    let (asr, mt) = match tier {
+        Some("lite") => ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
+        _ => ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
     };
     ModelFiles {
```

Sửa `src-tauri/src/sidecar/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/mod.rs
+++ b/src-tauri/src/sidecar/mod.rs
@@ -16,5 +16,5 @@ use tauri::{AppHandle, Manager, Runtime};
 
 use crate::errors::{self, CommandError};
-use crate::settings::{ModelTier, Settings};
+use crate::settings::Settings;
 
 /// Kết quả chuẩn bị: cách chạy hai tiến trình phụ, cộng những gì app cần nhớ.
@@ -22,5 +22,5 @@ use crate::settings::{ModelTier, Settings};
 pub struct Prepared {
     pub spec: SidecarSpec,
-    pub tier: Option<ModelTier>,
+    pub tier: Option<String>,
     /// Thư mục tiến trình phụ, và băm của từng file thực thi (theo đường dẫn), cho kiểm lại trước mỗi lần chạy và cho
     /// "lần đầu chạy".
@@ -166,5 +166,5 @@ pub fn prepare<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<Pr
         data.join("models")
     };
-    let models = paths::model_files(&models_dir, settings.model_tier);
+    let models = paths::model_files(&models_dir, settings.model_tier.as_deref());
     if let Some(missing) = paths::first_missing(&models) {
         return Err(CommandError::new(
@@ -201,5 +201,5 @@ pub fn prepare<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<Pr
     Ok(Prepared {
         spec,
-        tier: settings.model_tier,
+        tier: settings.model_tier.clone(),
         dir,
         hashes,
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -34,5 +34,5 @@ use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};
 use crate::capture::{CaptureEvent, LiveCapture, OnEvent};
 use crate::errors::{self, CommandError};
-use crate::settings::{AudioSource, Lang, ModelTier, Settings};
+use crate::settings::{AudioSource, Lang, Settings};
 use crate::sidecar::{self, first_run, integrity};
 use crate::state::{AppState, AppStatus, Loading, SessionStatus};
@@ -620,5 +620,5 @@ impl<R: Runtime> SidecarEvents for StatusEvents<R> {
 struct Live {
     manager: Arc<SidecarManager>,
-    tier: Option<ModelTier>,
+    tier: Option<String>,
     vad_model: PathBuf,
 }
```

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -14,3 +14,4 @@ export type Theme = "system" | "light" | "dark";
 export type UpdateChannel = "stable" | "beta";
-export type ModelTier = "standard" | "lite";
+// Mã gói model trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest).
+export type ModelTier = string;
 export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock";
@@ -54,4 +55,5 @@ export interface Settings {
 // Bản sửa gửi cho `update_settings`. Không có `hotkeys` (dùng `set_hotkey`), `overlay.locked`
-// (dùng `set_overlay_locked`), `overlay.positions` và `overlay.lastMonitor` (chỉ phía Rust ghi).
-export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental">> & {
+// (dùng `set_overlay_locked`), `overlay.positions` và `overlay.lastMonitor` (chỉ phía Rust ghi), `modelTier` (lệnh
+// của quản lý model).
+export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental" | "modelTier">> & {
   overlay?: Partial<Omit<Settings["overlay"], "locked" | "positions" | "lastMonitor">>;
```

- [ ] **Step 4: Chạy test**

Run: `cargo test -p meeting-translator --lib -- settings:: sidecar:: 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 52 passed; 0 failed; 0 ignored; 0 measured; 154 filtered out; finished in 0.36s
```

Run: `pnpm build 2>&1 | grep -E 'error|built in' | sed -E 's/ in [0-9]+ms//'; pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '`

Expected (lúc lập kế hoạch):

```text
✓ built
 Test Files  5 passed (5)
      Tests  64 passed (64)
```

- [ ] **Step 5: Định dạng, clippy**

Run: `cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)'`

Expected:

```text
0
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/settings/mod.rs src-tauri/src/settings/patch.rs src-tauri/src/sidecar/paths.rs src-tauri/src/sidecar/mod.rs src-tauri/src/session.rs src/lib/ipc.ts
git commit -q -m "feat(settings): modelTier là mã gói của manifest, chỉ đổi qua lệnh quản lý model (04 T7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Dịch vụ model, lệnh và sự kiện `models://state`

Dòng 20, 33, 36, 37, 57, 160, 161, 163, 233, 246; QĐ9, QĐ13–QĐ16, QĐ18:
- `models/service.rs`: `ModelService` (đọc manifest đã lưu, tải manifest khi chưa có hay đã quá một ngày, tải gói trên luồng riêng, tiến độ tối đa 4 lần mỗi giây, tạm dừng, dùng gói đã tải, xóa gói, xóa hết, "Để sau", file model cho phiên, băm lại khi nạp lỗi, ngưỡng pipeline), `check_on_startup`, `changed`.
- `models/commands.rs`: 8 lệnh, chỉ cửa sổ `main` (§10.2): `get_models_state`, `load_models`, `download_models`, `pause_models_download`, `select_model_pack`, `delete_models`, `delete_models_and_data`, `dismiss_models_update`. Lệnh có thể chặn lâu chạy trên `spawn_blocking`.
- Mã lỗi mới (`errors.rs`) và câu báo lỗi vi/en (test `every_error_code_has_ui_text` và test i18n giữ chúng khớp).
- `actions.rs`: `set_model_tier`; `session.rs`: `release_models`; `lib.rs`: quản lý dịch vụ và kiểm manifest lúc khởi động; `test_support.rs`: app giả có dịch vụ model (`mock_app_full`, `models_config`).

**Files:**
- Sửa: `src-tauri/src/errors.rs`
- Sửa: `src-tauri/src/models/mod.rs`
- Sửa: `src-tauri/src/test_support.rs`
- Tạo: `src-tauri/src/models/service.rs`
- Tạo: `src-tauri/src/models/commands.rs`
- Sửa: `src-tauri/src/actions.rs`
- Sửa: `src-tauri/src/session.rs`
- Sửa: `src-tauri/src/commands.rs`
- Sửa: `src-tauri/build.rs`
- Sửa: `src-tauri/capabilities/main.json`
- Sửa: `src-tauri/src/lib.rs`
- Sửa: `src/i18n/en.ts`
- Sửa: `src/i18n/vi.ts`

- [ ] **Step 1: Viết test**

Test của dịch vụ chạy app giả với server HTTP giả của 04a: manifest ký bằng khóa test, nội dung file theo `store::tests::content`. Chúng kiểm: tải manifest và đề xuất gói; kiểm tối đa mỗi ngày một lần; không có nguồn; manifest bị sửa, cũ hơn hay mất mạng thì giữ bản cũ; tải xong thì gói thành gói đang dùng; tải lỗi rồi tải tiếp bằng `Range`; sai SHA-256; đủ dung lượng trống; bản cập nhật được hỏi chứ không tự tải, "Để sau"; không đè hay xóa gói đang dịch; xóa gói và xóa hết; băm lại khi model hỏng.

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -160,2 +160,13 @@ mod tests {
                 UNKNOWN,
+                MODELS_NO_SOURCE,
+                MODELS_OFFLINE,
+                MODELS_MANIFEST_INVALID,
+                MODELS_UNKNOWN_PACK,
+                MODELS_APP_TOO_OLD,
+                MODELS_NO_SPACE,
+                MODELS_BUSY,
+                MODELS_IN_USE,
+                MODELS_DOWNLOAD_FAILED,
+                MODELS_CHECKSUM,
+                MODELS_DISK,
             ]
```

Sửa `src-tauri/src/models/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/mod.rs
+++ b/src-tauri/src/models/mod.rs
@@ -2,8 +2,10 @@
 //! xuất gói theo máy, xóa model.
 
+pub mod commands;
 pub mod download;
 pub mod machine;
 pub mod manifest;
 pub mod recommend;
+pub mod service;
 pub mod signed;
 pub mod source;
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -5,2 +5,3 @@
 use std::ops::ControlFlow;
+use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
 use std::sync::{Arc, Condvar, Mutex};
@@ -23,2 +24,6 @@ use crate::errors::{self, CommandError};
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
+use crate::models::download::Retry;
+use crate::models::machine::Machine;
+use crate::models::manifest::Os;
+use crate::models::service::{Config as ModelsConfig, ModelService};
 use crate::overlay::{OverlaySurface, Surface};
@@ -352,3 +357,41 @@ pub fn mock_app() -> tauri::App<MockRuntime> {
 
+/// Giờ giả mặc định của quản lý model trong app giả (giây Unix, 2026-09-21).
+pub const MODELS_NOW: u64 = 1_790_000_000;
+
+/// Quản lý model của app giả: thư mục tạm riêng cho mỗi app, khóa test của bộ vector, máy Mac 16 GB, ổ đĩa còn trống,
+/// đồng hồ `clock`, không chờ thật trước khi thử lại. `source`: URL manifest (server giả), `None` là chưa có nguồn.
+pub fn models_config(source: Option<reqwest::Url>, clock: Arc<AtomicU64>) -> ModelsConfig {
+    static NEXT: AtomicUsize = AtomicUsize::new(0);
+    let dir = std::env::temp_dir().join(format!(
+        "mt-models-app-{}-{}",
+        std::process::id(),
+        NEXT.fetch_add(1, Ordering::SeqCst)
+    ));
+    let _ = std::fs::remove_dir_all(&dir);
+    ModelsConfig {
+        dir,
+        source,
+        keys: crate::models::signed::tests::test_keys(),
+        app_version: "0.1.0".into(),
+        retry: Retry {
+            retries: 3,
+            backoff: vec![Duration::ZERO],
+        },
+        machine: Box::new(|_| Machine {
+            os: Os::Macos,
+            ram_mib: 16_384,
+            avx2: true,
+            gpus: Vec::new(),
+            gpu_known: true,
+        }),
+        free_disk: Box::new(|_| Some(1 << 40)),
+        now: Box::new(move || clock.load(Ordering::SeqCst)),
+    }
+}
+
 pub fn mock_app_with(deps: FakeDeps) -> tauri::App<MockRuntime> {
+    mock_app_full(deps, models_config(None, Arc::new(AtomicU64::new(MODELS_NOW))))
+}
+
+pub fn mock_app_full(deps: FakeDeps, models: ModelsConfig) -> tauri::App<MockRuntime> {
     let builder = mock_builder();
@@ -375,2 +418,3 @@ pub fn mock_app_with(deps: FakeDeps) -> tauri::App<MockRuntime> {
         .manage(Session::new(Arc::new(deps)))
+        .manage(Arc::new(ModelService::new(models)))
         .invoke_handler(commands::handler())
```

Tạo `src-tauri/src/models/service.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Dịch vụ model của app (spec F6, §4.1 bước 2–3, §4.3 nhóm Model, §6.7, §9): giữ manifest đã nhận, việc tải đang chạy,
//! và phát trạng thái cho cửa sổ chính qua sự kiện `models://state`.
//!
//! - Manifest: đọc bản đã lưu lúc khởi động, rồi tải bản mới nếu chưa có bản nào hay đã qua một ngày từ lần kiểm trước
//!   ([`ModelService::load`]). Lỗi mạng không xóa bản đang có.
//! - Tải một gói: chạy trên luồng riêng, từng file một ([`super::download`]); xong thì gói thành gói đang dùng
//!   (`modelTier`). Tiến trình phụ đang mở model bị tắt trước khi tải bản cập nhật đè lên file đang dùng.
//! - Gói mới dùng từ phiên sau: phiên đang chạy giữ gói cũ (`session.rs`, ghi chú 8 của review cuối 02).
//! - Bản cập nhật: manifest mới có bản khác của file thuộc gói đang dùng thì giao diện hỏi trước khi tải (§6.7); "Để
//!   sau" nhớ theo `sequence` của manifest.
//! - Phần thay được trong test (thư mục, URL, khóa, cấu hình máy, dung lượng trống, đồng hồ) nằm trong [`Config`].

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    use serde_json::{Value, json};
    use tauri::Listener;
    use tauri::test::MockRuntime;

    use crate::models::signed::tests::signed_with_test_key;
    use crate::models::store::tests::{content, real_sample};
    use crate::models::test_http::{FakeServer, Fault};
    use crate::test_support::{FakeDeps, MODELS_NOW, invoke, mock_app_full, models_config, window};

    const DAY: u64 = 24 * 3600;

    struct Harness {
        app: tauri::App<MockRuntime>,
        server: FakeServer,
        clock: Arc<AtomicU64>,
        events: Arc<Mutex<Vec<Value>>>,
    }

    impl Harness {
        fn main(&self) -> tauri::WebviewWindow<MockRuntime> {
            window(&self.app, "main")
        }

        fn call(&self, cmd: &str, args: Value) -> Result<Value, String> {
            invoke(&self.main(), cmd, args)
        }

        fn service(&self) -> Arc<ModelService> {
            self.app.state::<Arc<ModelService>>().inner().clone()
        }

        fn dir(&self) -> PathBuf {
            self.service().store().dir().to_path_buf()
        }

        /// Chờ việc tải về trạng thái `state`.
        fn wait(&self, state: &str) -> Value {
            let started = Instant::now();
            loop {
                let view = self.call("get_models_state", json!({})).unwrap();
                if view["job"]["state"] == state {
                    return view;
                }
                assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {view}");
                std::thread::sleep(Duration::from_millis(10));
            }
        }

        fn model_tier(&self) -> Value {
            self.call("get_settings", json!({})).unwrap()["modelTier"].clone()
        }

        fn tick_days(&self, days: u64) {
            self.clock.fetch_add(days * DAY, Ordering::SeqCst);
        }
    }

    /// Đặt manifest (ký bằng khóa test) và nội dung các file của nó lên server giả.
    fn publish(server: &FakeServer, body: &Value) {
        server.put("models.json", &signed_with_test_key(body));
        for f in body["files"].as_array().unwrap() {
            let (id, bytes) = (f["id"].as_str().unwrap(), f["bytes"].as_u64().unwrap());
            server.put(f["url"].as_str().unwrap(), &content(id, bytes));
        }
    }

    fn harness(change: impl FnOnce(&mut Config)) -> Harness {
        let server = FakeServer::start();
        publish(&server, &real_sample());
        let clock = Arc::new(AtomicU64::new(MODELS_NOW));
        let mut cfg = models_config(Some(server.url("models.json")), clock.clone());
        change(&mut cfg);
        let app = mock_app_full(FakeDeps::default(), cfg);
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        app.listen_any(STATE_EVENT, move |e| {
            sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
        });
        Harness {
            app,
            server,
            clock,
            events,
        }
    }

    fn manifest_requests(h: &Harness) -> usize {
        h.server.requests().iter().filter(|r| r.path == "/models.json").count()
    }

    /// §4.1 bước 2: lần đầu mở app tải manifest, liệt kê gói kèm dung lượng, và đề xuất gói theo máy.
    #[test]
    fn loads_the_manifest_and_recommends_a_pack() {
        let h = harness(|_| {});
        let view = h.call("get_models_state", json!({})).unwrap();
        assert_eq!(view["packs"], json!([]));
        assert_eq!(view["hasSource"], true);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["sequence"], 3);
        assert_eq!(view["manifestError"], Value::Null);
        let packs = view["packs"].as_array().unwrap();
        assert_eq!(packs.len(), 2);
        assert_eq!(
            (&packs[0]["id"], &packs[0]["bytes"], &packs[0]["usable"]),
            (&json!("standard"), &json!(500 + 1900 + 20 + 10), &json!(false))
        );
        assert_eq!(packs[1]["name"], json!({ "vi": "Nhẹ", "en": "Lite" }));
        assert_eq!(view["verdict"], json!({ "kind": "recommend", "pack": "standard" }));
        assert_eq!(view["machine"]["ramMib"], 16_384);
        assert!(h.dir().join("manifest.json").exists(), "lưu để dùng khi không có mạng");
        let events = h.events.lock().unwrap();
        assert!(events.iter().any(|e| e["checking"] == true));
        assert_eq!(events.last().unwrap()["sequence"], 3);
    }

    /// §6.7: kiểm manifest tối đa mỗi ngày một lần.
    #[test]
    fn checks_the_manifest_at_most_once_a_day() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("load_models", json!({})).unwrap();
        assert_eq!(manifest_requests(&h), 1);
        h.clock.fetch_add(DAY - 1, Ordering::SeqCst);
        h.call("load_models", json!({})).unwrap();
        assert_eq!(manifest_requests(&h), 1);
        h.clock.fetch_add(1, Ordering::SeqCst);
        h.call("load_models", json!({})).unwrap();
        assert_eq!(manifest_requests(&h), 2);
        assert_eq!(
            h.service().store().state().last_check,
            Some(MODELS_NOW + DAY),
            "ghi lần kiểm"
        );
    }

    #[test]
    fn without_a_source_nothing_is_fetched() {
        let h = harness(|cfg| cfg.source = None);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["manifestError"], "modelsNoSource");
        assert_eq!(view["hasSource"], false);
        assert!(h.server.requests().is_empty());
        assert_eq!(
            h.call("download_models", json!({ "pack": "lite" })).unwrap_err(),
            json!({ "code": "modelsNoSource", "field": null, "message": "chưa có manifest" }).to_string()
        );
    }

    /// Manifest bị sửa hay cũ hơn bị từ chối; bản đang có vẫn dùng được. Mất mạng cũng giữ bản đang có.
    #[test]
    fn a_bad_or_older_manifest_is_refused_and_the_old_one_kept() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        let mut tampered = signed_with_test_key(&real_sample());
        let at = tampered.len() / 2;
        tampered[at] ^= 1;
        h.server.put("models.json", &tampered);
        h.tick_days(1);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["manifestError"], "modelsManifestInvalid");
        assert_eq!(view["sequence"], 3);
        let mut older = real_sample();
        older["sequence"] = 2.into();
        publish(&h.server, &older);
        h.tick_days(1);
        assert_eq!(
            h.call("load_models", json!({})).unwrap()["manifestError"],
            "modelsManifestInvalid"
        );
        h.server.fault(Fault::Status(503));
        h.tick_days(1);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["manifestError"], "modelsOffline");
        assert_eq!(view["sequence"], 3);
    }

    /// §4.1 bước 3: tải xong là dùng được ngay (gói thành gói đang dùng).
    #[test]
    fn downloading_a_pack_makes_it_the_pack_in_use() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        let started = h.call("download_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(started["job"]["state"], "downloading");
        assert_eq!(started["job"]["totalBytes"], 200 + 1100 + 20 + 10);
        let done = h.wait("done");
        assert_eq!(done["job"]["doneBytes"], 200 + 1100 + 20 + 10);
        assert_eq!(h.model_tier(), "lite");
        let lite = &done["packs"][1];
        assert_eq!((&lite["usable"], &lite["complete"]), (&json!(true), &json!(true)));
        assert_eq!(
            done["packs"][0]["missingBytes"],
            500 + 1900,
            "VAD và giấy phép dùng chung"
        );
        assert_eq!(
            std::fs::read(h.dir().join("ggml-small-q5_1.bin")).unwrap(),
            content("whisper-small", 200)
        );
        let files = h.service().resolve(Some("lite")).unwrap();
        assert_eq!(files.mt, h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf"));
        assert_eq!(
            h.call("select_model_pack", json!({ "pack": "standard" })).unwrap_err(),
            json!({ "code": "modelMissing", "field": "pack", "message": "standard" }).to_string()
        );
        assert_eq!(
            h.call("update_settings", json!({ "patch": { "modelTier": "standard" } }))
                .unwrap_err(),
            json!({ "code": "readOnly", "field": "modelTier",
                    "message": "cài đặt `modelTier` không hợp lệ (ReadOnly)" })
            .to_string()
        );
        assert_eq!(
            h.call("download_models", json!({ "pack": "hybrid" })).unwrap_err(),
            json!({ "code": "modelsUnknownPack", "field": "pack", "message": "hybrid" }).to_string()
        );
    }

    /// §9: tải lỗi thì thử lại 3 lần rồi báo lỗi; bấm tải lần nữa thì tải tiếp từ phần đã có.
    #[test]
    fn a_failed_download_can_be_resumed() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.server.fault(Fault::DropAfter(100));
        for _ in 0..3 {
            h.server.fault(Fault::Status(503));
        }
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        let failed = h.wait("failed");
        assert_eq!(failed["job"]["error"], "modelsDownloadFailed");
        assert_eq!(failed["packs"][1]["partialBytes"], 100);
        assert_eq!(h.model_tier(), Value::Null);
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let ranges: Vec<_> = h
            .server
            .requests()
            .into_iter()
            .filter(|r| r.path.ends_with("ggml-small-q5_1.bin"))
            .map(|r| r.range)
            .collect();
        assert_eq!(ranges.first(), Some(&None));
        assert_eq!(
            ranges.last(),
            Some(&Some("bytes=100-".into())),
            "tải tiếp, không tải lại từ đầu"
        );
        assert_eq!(h.model_tier(), "lite");
    }

    #[test]
    fn a_wrong_sha256_is_reported() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        for _ in 0..4 {
            h.server.fault(Fault::Corrupt);
        }
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(h.wait("failed")["job"]["error"], "modelsChecksum");
    }

    /// §6.7: trước khi tải, dung lượng trống phải đủ phần còn phải tải cộng 1 GB.
    #[test]
    fn a_download_needs_free_space_plus_one_gigabyte() {
        let h = harness(|cfg| cfg.free_disk = Box::new(|_| Some(DISK_MARGIN + 1_000)));
        h.call("load_models", json!({})).unwrap();
        let refused = h.call("download_models", json!({ "pack": "lite" })).unwrap_err();
        assert!(refused.contains("\"code\":\"modelsNoSpace\""), "{refused}");
        let h = harness(|cfg| cfg.free_disk = Box::new(|_| Some(DISK_MARGIN + 1_330)));
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
    }

    /// §6.7: có bản mới thì hỏi trước, không tự tải; "Để sau" nhớ theo số manifest; tải thì thay bản cũ.
    #[test]
    fn an_update_is_offered_not_downloaded() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        let q4 = &mut newer["files"][3];
        q4["version"] = "2".into();
        q4["bytes"] = 1_101.into();
        let sha = sha2::Sha256::digest(content("hy-mt2-q4", 1_101));
        use sha2::Digest;
        q4["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        publish(&h.server, &newer);
        h.tick_days(1);
        let requests = h.server.requests().len();
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["updateAvailable"], true);
        assert_eq!(view["packs"][1]["missingBytes"], 1_101);
        assert_eq!(
            h.server.requests().len(),
            requests + 1,
            "chỉ tải manifest, không tự tải model"
        );
        assert!(h.service().resolve(Some("lite")).is_ok(), "bản cũ vẫn dùng được");
        let view = h.call("dismiss_models_update", json!({})).unwrap();
        assert_eq!(view["updateAvailable"], false);
        newer["sequence"] = 5.into();
        publish(&h.server, &newer);
        h.tick_days(1);
        assert_eq!(h.call("load_models", json!({})).unwrap()["updateAvailable"], true);
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        let done = h.wait("done");
        assert_eq!(done["updateAvailable"], false);
        assert_eq!(
            std::fs::read(h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf")).unwrap(),
            content("hy-mt2-q4", 1_101)
        );
    }

    /// Đang dịch bằng gói thì không tải đè hay xóa gói đó (ghi chú 8 của review cuối 02).
    #[test]
    fn the_pack_in_use_is_not_replaced_during_a_session() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        newer["files"][3]["sha256"] = "cd".repeat(32).into();
        publish(&h.server, &newer);
        h.tick_days(1);
        h.call("load_models", json!({})).unwrap();
        h.call("toggle_session", json!({})).unwrap();
        let busy = |r: Result<Value, String>| r.unwrap_err().contains("\"code\":\"modelsInUse\"");
        assert!(busy(h.call("download_models", json!({ "pack": "lite" }))));
        assert!(busy(h.call("delete_models", json!({ "pack": "lite" }))));
        assert!(busy(h.call("delete_models_and_data", json!({}))));
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        assert_eq!(h.model_tier(), "standard", "gói mới dùng từ phiên sau");
        h.call("toggle_session", json!({})).unwrap();
    }

    #[test]
    fn deleting_packs_and_everything() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        let view = h.call("delete_models", json!({ "pack": "standard" })).unwrap();
        assert_eq!(view["packs"][0]["usable"], false);
        assert_eq!(view["packs"][1]["complete"], true, "gói Nhẹ còn VAD và giấy phép");
        assert_eq!(h.model_tier(), "standard", "xóa gói đang dùng không tự đổi gói");
        h.call("select_model_pack", json!({ "pack": "lite" })).unwrap();
        assert_eq!(h.model_tier(), "lite");
        let view = h.call("delete_models_and_data", json!({})).unwrap();
        assert!(!h.dir().exists());
        assert_eq!(h.model_tier(), Value::Null);
        assert_eq!(view["packs"][1]["usable"], false);
        assert_eq!(view["sequence"], 3, "danh sách gói vẫn còn để tải lại");
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
    }

    /// §9: model nạp lỗi thì băm lại; file hỏng bị bỏ, gói hiện "chưa tải" để người dùng tải lại.
    #[test]
    fn a_broken_model_is_found_by_hashing_again() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let path = h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf");
        let mut bytes = std::fs::read(&path).unwrap();
        bytes[0] ^= 1;
        std::fs::write(&path, bytes).unwrap();
        assert!(
            h.service().resolve(Some("lite")).is_ok(),
            "lúc bắt đầu chỉ kiểm kích thước"
        );
        h.service().verify_selected(h.app.handle());
        let view = h.call("get_models_state", json!({})).unwrap();
        assert_eq!(view["packs"][1]["usable"], false);
        let missing = h.service().resolve(Some("lite")).unwrap_err();
        assert_eq!(missing.code, errors::MODEL_MISSING);
        std::fs::write(h.dir().join("ggml-small-q5_1.bin"), b"ngan").unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        std::fs::write(h.dir().join("ggml-small-q5_1.bin"), b"ngan").unwrap();
        assert_eq!(
            h.service().resolve(Some("lite")).unwrap_err().code,
            errors::MODEL_BROKEN,
            "sai kích thước"
        );
    }

    #[test]
    fn pausing_without_a_download_does_nothing() {
        let h = harness(|_| {});
        let view = h.call("pause_models_download", json!({})).unwrap();
        assert_eq!(view["job"]["state"], "idle");
        assert!(!h.service().busy());
    }
}
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib models::service 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 34 previous errors; 1 warning emitted
error[E0425]: cannot find type `Arc` in this scope
error[E0425]: cannot find type `Config` in this scope
error[E0425]: cannot find type `ModelService` in this scope
error[E0425]: cannot find type `Mutex` in this scope
error[E0425]: cannot find type `PathBuf` in this scope
error[E0425]: cannot find value `DISK_MARGIN` in this scope
error[E0425]: cannot find value `MODELS_APP_TOO_OLD` in this scope
```

- [ ] **Step 3: Viết code của dịch vụ và lệnh**

Thêm vào `src-tauri/src/models/service.rs` (giữa các dòng `//!` đầu file và khối test):

```rust
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use pipeline::config::PipelineConfig;
use reqwest::Url;
use reqwest::blocking::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use super::download::{self, DownloadError, Pause, Retry};
use super::machine::{self, Machine};
use super::manifest::Localized;
use super::recommend::{self, Verdict};
use super::signed::{self, Signed, TrustedKey};
use super::source::{self, FetchError};
use super::store::{ResolveError, Store};
use crate::errors::{self, CommandError};
use crate::settings::Settings;
use crate::sidecar::paths::ModelFiles;
use crate::sidecar::probe::GpuInfo;
use crate::state::{AppState, SessionStatus};
use crate::{actions, session, window};

/// Sự kiện trạng thái model, chỉ gửi cửa sổ chính.
pub const STATE_EVENT: &str = "models://state";
/// Chừa thêm chừng này dung lượng trống ngoài phần còn phải tải (§6.7: "kích thước model cộng 1 GB").
pub const DISK_MARGIN: u64 = 1 << 30;
/// Báo tiến độ tải cho giao diện tối đa chừng này một lần.
const PROGRESS_EVERY: Duration = Duration::from_millis(250);

type MachineFn = dyn Fn(Option<&[GpuInfo]>) -> Machine + Send + Sync;
type FreeDiskFn = dyn Fn(&Path) -> Option<u64> + Send + Sync;
type NowFn = dyn Fn() -> u64 + Send + Sync;

pub struct Config {
    pub dir: PathBuf,
    pub source: Option<Url>,
    pub keys: Vec<TrustedKey>,
    pub app_version: String,
    pub retry: Retry,
    pub machine: Box<MachineFn>,
    pub free_disk: Box<FreeDiskFn>,
    /// Giờ hiện tại, giây Unix.
    pub now: Box<NowFn>,
}

impl Config {
    /// Cấu hình thật: `app_local_data_dir/models`, URL và khóa theo loại bản.
    pub fn live<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        Ok(Self {
            dir: app.path().app_local_data_dir()?.join("models"),
            source: source::manifest_url(),
            keys: signed::trusted_keys(),
            app_version: app.package_info().version.to_string(),
            retry: Retry::default(),
            machine: Box::new(machine::detect),
            free_disk: Box::new(machine::free_disk_bytes),
            now: Box::new(|| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0)
            }),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JobState {
    Idle,
    Downloading,
    Paused,
    Failed,
    Done,
}

/// Việc tải gần nhất.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub state: JobState,
    pub pack: Option<String>,
    pub done_bytes: u64,
    pub total_bytes: u64,
    /// Mã lỗi (`error.<mã>`) khi `state` là `failed`.
    pub error: Option<String>,
    /// Việc này tải đè file của gói đang dùng (bản cập nhật): trong lúc tải không bắt đầu phiên được.
    pub replaces_in_use: bool,
}

impl Job {
    fn idle() -> Self {
        Self {
            state: JobState::Idle,
            pack: None,
            done_bytes: 0,
            total_bytes: 0,
            error: None,
            replaces_in_use: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackView {
    pub id: String,
    pub name: Localized,
    pub note: Localized,
    pub bytes: u64,
    pub usable: bool,
    pub complete: bool,
    pub missing_bytes: u64,
    pub partial_bytes: u64,
    /// Gói cần app bản mới hơn (`min_app_version`).
    pub app_too_old: bool,
}

/// Trạng thái gửi giao diện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsView {
    pub rev: u64,
    pub has_source: bool,
    pub checking: bool,
    /// Mã lỗi của lần tải manifest gần nhất.
    pub manifest_error: Option<String>,
    pub sequence: Option<u64>,
    pub packs: Vec<PackView>,
    pub machine: Machine,
    pub verdict: Option<Verdict>,
    pub free_disk_bytes: Option<u64>,
    pub used_bytes: u64,
    pub job: Job,
    /// Gói đang dùng có bản mới trong manifest, người dùng chưa bấm "Để sau".
    pub update_available: bool,
}

struct Inner {
    manifest: Option<Signed>,
    /// Đã đọc bản manifest lưu trên đĩa chưa.
    loaded: bool,
    checking: bool,
    manifest_error: Option<String>,
    job: Job,
    rev: u64,
}

pub struct ModelService {
    cfg: Config,
    store: Store,
    /// Tạo lúc dùng lần đầu: client đồng bộ của reqwest giữ một luồng riêng.
    client: OnceLock<Option<Client>>,
    inner: Mutex<Inner>,
    pause: Arc<Pause>,
}

fn fetch_code(e: &FetchError) -> &'static str {
    match e {
        FetchError::Network(_) | FetchError::Http(_) => errors::MODELS_OFFLINE,
        FetchError::Signed(_) | FetchError::Rollback { .. } | FetchError::Conflict(_) => {
            errors::MODELS_MANIFEST_INVALID
        }
    }
}

fn download_code(e: &DownloadError) -> &'static str {
    match e {
        DownloadError::Checksum | DownloadError::TooLong => errors::MODELS_CHECKSUM,
        DownloadError::Io(_) => errors::MODELS_DISK,
        DownloadError::Http(_) | DownloadError::Network(_) | DownloadError::Paused => errors::MODELS_DOWNLOAD_FAILED,
    }
}

fn session_active<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<AppState>()
        .is_some_and(|s| matches!(s.status().session, SessionStatus::Starting | SessionStatus::Running))
}

fn selected<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    app.try_state::<AppState>().and_then(|s| s.settings().model_tier)
}

impl ModelService {
    pub fn new(cfg: Config) -> Self {
        Self {
            store: Store::new(&cfg.dir),
            cfg,
            client: OnceLock::new(),
            inner: Mutex::new(Inner {
                manifest: None,
                loaded: false,
                checking: false,
                manifest_error: None,
                job: Job::idle(),
                rev: 0,
            }),
            pause: Arc::new(Pause::default()),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    fn client(&self) -> Option<&Client> {
        self.client
            .get_or_init(|| {
                download::client()
                    .map_err(|e| log::error!("không tạo được client HTTP: {e}"))
                    .ok()
            })
            .as_ref()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Đọc manifest đã lưu (một lần).
    fn ensure_loaded(&self) {
        let mut inner = self.lock();
        if !inner.loaded {
            inner.loaded = true;
            inner.manifest = self.store.load_manifest(&self.cfg.keys);
        }
    }

    pub fn manifest(&self) -> Option<Signed> {
        self.ensure_loaded();
        self.lock().manifest.clone()
    }

    /// Đang tải bản cập nhật đè lên file của gói đang dùng.
    pub fn busy(&self) -> bool {
        let inner = self.lock();
        inner.job.state == JobState::Downloading && inner.job.replaces_in_use
    }

    pub fn view<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.ensure_loaded();
        let gpus = app
            .try_state::<crate::sidecar::GpuProbe>()
            .and_then(|p| p.get(Duration::ZERO))
            .map(|o| o.gpus);
        let machine = (self.cfg.machine)(gpus.as_deref());
        let selected = selected(app);
        let state = self.store.state();
        let inner = self.lock();
        let manifest = inner.manifest.as_ref().map(|s| &s.manifest);
        let packs: Vec<PackView> = manifest
            .map(|m| {
                m.packs
                    .iter()
                    .map(|p| {
                        let status = self.store.pack_status(m, &p.id);
                        PackView {
                            id: p.id.clone(),
                            name: p.name.clone(),
                            note: p.note.clone(),
                            bytes: m.pack_bytes(&p.id),
                            usable: status.usable,
                            complete: status.complete,
                            missing_bytes: status.missing_bytes,
                            partial_bytes: status.partial_bytes,
                            app_too_old: !m.usable_by(&p.id, &self.cfg.app_version),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();
        let update_available = match (manifest, &selected) {
            (Some(m), Some(pack)) => {
                let current = packs.iter().find(|p| &p.id == pack);
                current.is_some_and(|p| p.usable && !p.complete && !p.app_too_old)
                    && m.sequence > state.dismissed_sequence
            }
            _ => false,
        };
        ModelsView {
            rev: inner.rev,
            has_source: self.cfg.source.is_some(),
            checking: inner.checking,
            manifest_error: inner.manifest_error.clone(),
            sequence: manifest.map(|m| m.sequence),
            packs,
            verdict: manifest.map(|m| recommend::recommend(&machine, &m.recommend)),
            machine,
            free_disk_bytes: (self.cfg.free_disk)(&self.cfg.dir),
            used_bytes: self.store.used_bytes(),
            job: inner.job.clone(),
            update_available,
        }
    }

    /// Báo trạng thái mới cho cửa sổ chính.
    pub fn changed<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.lock().rev += 1;
        let view = self.view(app);
        if let Err(e) = app.emit_to(EventTarget::webview_window(window::MAIN), STATE_EVENT, &view) {
            log::warn!("không gửi được sự kiện {STATE_EVENT}: {e}");
        }
        view
    }

    /// Đọc manifest đã lưu; tải bản mới nếu chưa có bản nào hay đã tới lúc kiểm (tối đa mỗi ngày một lần, §6.7). Chặn
    /// trong lúc gọi mạng: gọi từ luồng nền.
    pub fn load<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.ensure_loaded();
        let (Some(url), Some(client)) = (self.cfg.source.clone(), self.client()) else {
            let mut inner = self.lock();
            if inner.manifest.is_none() {
                inner.manifest_error = Some(errors::MODELS_NO_SOURCE.into());
            }
            drop(inner);
            return self.changed(app);
        };
        let now = (self.cfg.now)();
        let due = self.lock().manifest.is_none() || source::due(&self.store.state(), now);
        if !due {
            return self.view(app);
        }
        self.lock().checking = true;
        self.changed(app);
        let fetched = source::fetch(client, &url, &self.cfg.keys);
        let outcome = fetched.and_then(|(raw, new)| {
            let current = self.lock().manifest.clone();
            let newer = source::accept(current.as_ref(), &new)?;
            if newer {
                self.store
                    .save_manifest(&raw)
                    .map_err(|e| FetchError::Network(format!("không lưu được manifest: {e}")))?;
            }
            Ok((newer, new))
        });
        let mut inner = self.lock();
        inner.checking = false;
        match outcome {
            Ok((newer, new)) => {
                if newer {
                    log::info!("nhận manifest model số {} (khóa {})", new.manifest.sequence, new.kid);
                    inner.manifest = Some(new);
                }
                inner.manifest_error = None;
                drop(inner);
                let mut state = self.store.state();
                state.last_check = Some(now);
                if let Err(e) = self.store.save_state(&state) {
                    log::warn!("không ghi được trạng thái kiểm manifest: {e}");
                }
            }
            Err(e) => {
                log::warn!("không cập nhật được manifest model: {e}");
                inner.manifest_error = Some(fetch_code(&e).into());
                drop(inner);
            }
        }
        self.changed(app)
    }

    /// Bắt đầu tải gói `pack` trên luồng riêng; xong thì gói đó thành gói đang dùng.
    pub fn download<R: Runtime>(self: &Arc<Self>, app: &AppHandle<R>, pack: &str) -> Result<ModelsView, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODELS_NO_SOURCE, None, "chưa có manifest"))?;
        let m = &manifest.manifest;
        if m.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        if !m.usable_by(pack, &self.cfg.app_version) {
            return Err(CommandError::new(errors::MODELS_APP_TOO_OLD, Some("pack"), pack));
        }
        let url = self
            .cfg
            .source
            .clone()
            .ok_or_else(|| CommandError::new(errors::MODELS_NO_SOURCE, None, "chưa có URL manifest"))?;
        let todo: Vec<_> = m
            .files_of(pack)
            .into_iter()
            .filter(|f| !self.store.is_installed(f))
            .cloned()
            .collect();
        let status = self.store.pack_status(m, pack);
        // File sẽ đè lên file của gói đang dùng (cùng tên): bản cập nhật.
        let in_use: Vec<String> = selected(app)
            .map(|s| m.files_of(&s).iter().map(|f| f.file.clone()).collect())
            .unwrap_or_default();
        let replaces_in_use = todo
            .iter()
            .any(|f| in_use.contains(&f.file) && self.store.path(&f.file).exists());
        if replaces_in_use && session_active(app) {
            return Err(CommandError::new(errors::MODELS_IN_USE, None, "đang dịch bằng gói này"));
        }
        let need = status.missing_bytes.saturating_sub(status.partial_bytes) + DISK_MARGIN;
        if let Some(free) = (self.cfg.free_disk)(&self.cfg.dir)
            && free < need
        {
            return Err(CommandError::new(
                errors::MODELS_NO_SPACE,
                None,
                format!("cần {need} byte, còn {free}"),
            ));
        }
        {
            let mut inner = self.lock();
            if inner.job.state == JobState::Downloading {
                return Err(CommandError::new(errors::MODELS_BUSY, None, "đang tải"));
            }
            inner.job = Job {
                state: JobState::Downloading,
                pack: Some(pack.to_string()),
                done_bytes: m.pack_bytes(pack) - status.missing_bytes + status.partial_bytes,
                total_bytes: m.pack_bytes(pack),
                error: None,
                replaces_in_use,
            };
        }
        self.pause.clear();
        if replaces_in_use {
            session::release_models(app);
        }
        let view = self.changed(app);
        let (service, app, pack) = (self.clone(), app.clone(), pack.to_string());
        std::thread::spawn(move || service.run_download(&app, &manifest, &url, &pack, todo));
        Ok(view)
    }

    fn run_download<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        manifest: &Signed,
        url: &Url,
        pack: &str,
        todo: Vec<super::manifest::FileEntry>,
    ) {
        let m = &manifest.manifest;
        let result = (|| -> Result<(), &'static str> {
            let client = self.client().ok_or(errors::MODELS_DOWNLOAD_FAILED)?;
            std::fs::create_dir_all(self.store.dir()).map_err(|_| errors::MODELS_DISK)?;
            for entry in &todo {
                let file_url = source::file_url(url, entry).ok_or(errors::MODELS_MANIFEST_INVALID)?;
                let job = self.store.job(entry, file_url);
                let before = self.lock().job.done_bytes - std::fs::metadata(job.part()).map(|m| m.len()).unwrap_or(0);
                let mut last = Instant::now();
                let pause = self.pause.clone();
                download::download(
                    client,
                    &job,
                    &self.pause,
                    &self.cfg.retry,
                    &mut |wait| download::sleep_unless_paused(&pause, wait),
                    &mut |n| {
                        self.lock().job.done_bytes = before + n;
                        if last.elapsed() >= PROGRESS_EVERY {
                            last = Instant::now();
                            self.changed(app);
                        }
                    },
                )
                .map_err(|e| {
                    log::warn!("tải {} không xong: {e}", entry.file);
                    if e == DownloadError::Paused {
                        "paused"
                    } else {
                        download_code(&e)
                    }
                })?;
                self.store.mark_installed(entry).map_err(|_| errors::MODELS_DISK)?;
                self.lock().job.done_bytes = before + entry.bytes;
            }
            Ok(())
        })();
        {
            let mut inner = self.lock();
            match result {
                Ok(()) => {
                    inner.job.state = JobState::Done;
                    inner.job.done_bytes = inner.job.total_bytes;
                }
                Err("paused") => inner.job.state = JobState::Paused,
                Err(code) => {
                    inner.job.state = JobState::Failed;
                    inner.job.error = Some(code.to_string());
                }
            }
        }
        if result.is_ok() {
            log::info!("đã tải xong gói model {pack}");
            if let Err(e) = self.store.cleanup(m) {
                log::warn!("không dọn được file model cũ: {e}");
            }
            actions::set_model_tier(app, Some(pack.to_string()));
        }
        self.changed(app);
    }

    pub fn pause<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        if self.lock().job.state == JobState::Downloading {
            self.pause.request();
        }
        self.view(app)
    }

    /// Dùng gói đã tải (gói mới có tác dụng từ phiên sau).
    pub fn select<R: Runtime>(&self, app: &AppHandle<R>, pack: &str) -> Result<Settings, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODEL_MISSING, Some("pack"), "chưa có manifest"))?;
        if manifest.manifest.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        if !self.store.pack_status(&manifest.manifest, pack).usable {
            return Err(CommandError::new(errors::MODEL_MISSING, Some("pack"), pack));
        }
        Ok(actions::set_model_tier(app, Some(pack.to_string())))
    }

    /// Xóa một gói (giữ file còn dùng chung với gói khác đã tải).
    pub fn delete<R: Runtime>(&self, app: &AppHandle<R>, pack: &str) -> Result<ModelsView, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack))?;
        let m = &manifest.manifest;
        if m.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        let in_use = selected(app).as_deref() == Some(pack);
        if in_use && session_active(app) {
            return Err(CommandError::new(errors::MODELS_IN_USE, None, "đang dịch bằng gói này"));
        }
        if self.lock().job.state == JobState::Downloading {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang tải"));
        }
        if in_use {
            session::release_models(app);
        }
        let keep: Vec<&str> = m
            .packs
            .iter()
            .map(|p| p.id.as_str())
            .filter(|p| *p != pack && self.store.pack_status(m, p).usable)
            .collect();
        self.store
            .delete_pack(m, pack, &keep)
            .map_err(|e| CommandError::new(errors::MODELS_DISK, None, e.to_string()))?;
        {
            let mut inner = self.lock();
            if inner.job.pack.as_deref() == Some(pack) {
                inner.job = Job::idle();
            }
        }
        Ok(self.changed(app))
    }

    /// "Xóa model và dữ liệu" (§4.3, A6): xóa cả thư mục model, bỏ gói đang dùng. Bản quyền và bộ đếm hạn mức trong
    /// kho khóa giữ nguyên (Q14). Manifest vẫn giữ trong bộ nhớ, để tải lại được ngay mà không cần mạng.
    pub fn delete_all<R: Runtime>(&self, app: &AppHandle<R>) -> Result<ModelsView, CommandError> {
        if session_active(app) {
            return Err(CommandError::new(errors::MODELS_IN_USE, None, "đang dịch"));
        }
        if self.lock().job.state == JobState::Downloading {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang tải"));
        }
        session::release_models(app);
        self.store
            .delete_all()
            .map_err(|e| CommandError::new(errors::MODELS_DISK, None, e.to_string()))?;
        self.lock().job = Job::idle();
        actions::set_model_tier(app, None);
        log::info!("đã xóa model và dữ liệu");
        Ok(self.changed(app))
    }

    /// "Để sau" với bản cập nhật của manifest hiện tại.
    pub fn dismiss_update<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        if let Some(sequence) = self.manifest().map(|s| s.manifest.sequence) {
            let mut state = self.store.state();
            state.dismissed_sequence = sequence;
            if let Err(e) = self.store.save_state(&state) {
                log::warn!("không ghi được trạng thái model: {e}");
            }
        }
        self.changed(app)
    }

    /// File model của gói đang dùng, cho tiến trình phụ (§9: chỉ kiểm có file và đúng kích thước).
    pub fn resolve(&self, pack: Option<&str>) -> Result<ModelFiles, CommandError> {
        if self.busy() {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang cập nhật model"));
        }
        let missing = |what: String| CommandError::new(errors::MODEL_MISSING, None, what);
        let pack = pack.ok_or_else(|| missing("chưa chọn gói".into()))?;
        let manifest = self.manifest().ok_or_else(|| missing("chưa có manifest".into()))?;
        self.store.resolve(&manifest.manifest, pack).map_err(|e| match e {
            ResolveError::Missing(_) => missing(e.to_string()),
            ResolveError::Broken(_) => CommandError::new(errors::MODEL_BROKEN, None, e.to_string()),
        })
    }

    /// Model nạp lỗi (§9): băm lại đầy đủ file của gói; file hỏng bị bỏ để người dùng tải lại.
    pub fn verify_selected<R: Runtime>(&self, app: &AppHandle<R>) {
        let (Some(pack), Some(manifest)) = (selected(app), self.manifest()) else {
            return;
        };
        let broken = self.store.verify_pack(&manifest.manifest, &pack);
        if !broken.is_empty() {
            log::warn!("gói {pack} có file hỏng: {broken:?}");
        }
        self.changed(app);
    }

    /// Ngưỡng của pipeline theo manifest (02a QĐ21).
    pub fn pipeline_config(&self) -> PipelineConfig {
        self.manifest()
            .map(|s| s.manifest.pipeline_config())
            .unwrap_or_default()
    }
}

/// Lúc khởi động: đọc manifest đã lưu và kiểm bản mới (tối đa mỗi ngày một lần), trên luồng nền.
pub fn check_on_startup<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(service) = app.try_state::<Arc<ModelService>>() {
            service.load(&app);
        }
    });
}

/// Báo trạng thái model mới (ví dụ khi `--probe` vừa có kết quả).
pub fn changed<R: Runtime>(app: &AppHandle<R>) {
    if let Some(service) = app.try_state::<Arc<ModelService>>() {
        service.changed(app);
    }
}
```

Tạo `src-tauri/src/models/commands.rs`:

```rust
//! Lệnh của quản lý model, chỉ cửa sổ `main` gọi được (§10.2). Lệnh có thể chặn lâu (gọi mạng, xóa vài GB) là `async`
//! và chạy trên luồng của `spawn_blocking`; việc tải chạy trên luồng riêng, lệnh trả về ngay.

use std::sync::Arc;

use tauri::{AppHandle, Manager, Runtime, State};

use super::service::{ModelService, ModelsView};
use crate::errors::{self, CommandError};
use crate::settings::Settings;

fn service<R: Runtime>(app: &AppHandle<R>) -> Arc<ModelService> {
    app.state::<Arc<ModelService>>().inner().clone()
}

async fn blocking<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    f: impl FnOnce(&AppHandle<R>, &ModelService) -> T + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(move || f(&app, &service(&app)))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))
}

#[tauri::command]
pub fn get_models_state<R: Runtime>(app: AppHandle<R>, models: State<'_, Arc<ModelService>>) -> ModelsView {
    models.view(&app)
}

/// Đọc manifest; tải bản mới nếu chưa có hay đã quá một ngày (§6.7).
#[tauri::command]
pub async fn load_models<R: Runtime>(app: AppHandle<R>) -> Result<ModelsView, CommandError> {
    blocking(app, |app, models| models.load(app)).await
}

#[tauri::command]
pub fn download_models<R: Runtime>(app: AppHandle<R>, pack: String) -> Result<ModelsView, CommandError> {
    service(&app).download(&app, &pack)
}

#[tauri::command]
pub fn pause_models_download<R: Runtime>(app: AppHandle<R>, models: State<'_, Arc<ModelService>>) -> ModelsView {
    models.pause(&app)
}

#[tauri::command]
pub fn select_model_pack<R: Runtime>(
    app: AppHandle<R>,
    models: State<'_, Arc<ModelService>>,
    pack: String,
) -> Result<Settings, CommandError> {
    models.select(&app, &pack)
}

#[tauri::command]
pub async fn delete_models<R: Runtime>(app: AppHandle<R>, pack: String) -> Result<ModelsView, CommandError> {
    blocking(app, move |app, models| models.delete(app, &pack)).await?
}

/// Nút "Xóa model và dữ liệu" (§4.3, A6).
#[tauri::command]
pub async fn delete_models_and_data<R: Runtime>(app: AppHandle<R>) -> Result<ModelsView, CommandError> {
    blocking(app, |app, models| {
        let view = models.delete_all(app)?;
        wipe_user_data(app);
        Ok(view)
    })
    .await?
}

#[tauri::command]
pub fn dismiss_models_update<R: Runtime>(app: AppHandle<R>, models: State<'_, Arc<ModelService>>) -> ModelsView {
    models.dismiss_update(&app)
}

/// Phần "dữ liệu" của nút "Xóa model và dữ liệu": lịch sử và từ điển thuật ngữ, cùng việc với nút "Xóa toàn bộ dữ
/// liệu" của kế hoạch 03. Bản quyền và bộ đếm hạn mức trong kho khóa giữ nguyên (Q14). Lúc lập kế hoạch 04, `main`
/// chưa có lịch sử hay từ điển: hàm chỉ ghi log. Khi 03 đã vào `main`, gọi hàm xóa dữ liệu của 03 ở đây.
fn wipe_user_data<R: Runtime>(_app: &AppHandle<R>) {
    log::info!("xóa dữ liệu người dùng: chưa có lịch sử hay từ điển để xóa");
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -56,2 +56,25 @@ pub const UNKNOWN: &str = "unknown";
 
+// Mã lỗi của quản lý model (kế hoạch 04, spec §6.7, §9).
+/// Bản này chưa có URL manifest (bản dev chưa cấu hình staging; bản phát hành chờ kế hoạch 07).
+pub const MODELS_NO_SOURCE: &str = "modelsNoSource";
+/// Không tải được manifest (mất mạng, server lỗi).
+pub const MODELS_OFFLINE: &str = "modelsOffline";
+/// Manifest sai chữ ký, sai định dạng, hay cũ hơn bản đã có.
+pub const MODELS_MANIFEST_INVALID: &str = "modelsManifestInvalid";
+pub const MODELS_UNKNOWN_PACK: &str = "modelsUnknownPack";
+/// Gói cần app bản mới hơn (`min_app_version`).
+pub const MODELS_APP_TOO_OLD: &str = "modelsAppTooOld";
+/// Không đủ dung lượng trống: phần còn phải tải cộng 1 GB (§6.7).
+pub const MODELS_NO_SPACE: &str = "modelsNoSpace";
+/// Đang tải model, hay đang cập nhật model của gói đang dùng.
+pub const MODELS_BUSY: &str = "modelsBusy";
+/// Đang dịch bằng gói này: dừng dịch trước khi cập nhật hay xóa nó.
+pub const MODELS_IN_USE: &str = "modelsInUse";
+/// Tải model không xong sau 3 lần thử lại (§9); phần đã tải được giữ để tải tiếp.
+pub const MODELS_DOWNLOAD_FAILED: &str = "modelsDownloadFailed";
+/// File tải về sai SHA-256 sau 3 lần thử lại (§9).
+pub const MODELS_CHECKSUM: &str = "modelsChecksum";
+/// Không ghi hay xóa được file trong thư mục model.
+pub const MODELS_DISK: &str = "modelsDisk";
+
 impl CommandError {
```

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -15,3 +15,3 @@ use crate::{events, hotkey_registry, login_item, overlay, session, system, tray,
 /// Lưu cài đặt mới rồi báo mọi nơi cần biết.
-fn commit_settings<R: Runtime>(app: &AppHandle<R>, next: Settings) -> Settings {
+pub(crate) fn commit_settings<R: Runtime>(app: &AppHandle<R>, next: Settings) -> Settings {
     let state = app.state::<AppState>();
@@ -57,2 +57,10 @@ pub fn update_settings<R: Runtime>(app: &AppHandle<R>, patch: &Value) -> Result<
 
+/// Đổi gói model đang dùng (kế hoạch 04: gói đã tải xong, hay `None` sau khi xóa hết model). Không đi qua
+/// `update_settings` vì `modelTier` là khóa chỉ đọc ở đó.
+pub(crate) fn set_model_tier<R: Runtime>(app: &AppHandle<R>, pack: Option<String>) -> Settings {
+    let mut next = app.state::<AppState>().settings();
+    next.model_tier = pack;
+    commit_settings(app, next)
+}
+
 pub fn set_hotkey<R: Runtime>(
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -69,4 +69,7 @@ pub trait SessionDeps: Send + Sync {
     /// Gọi định kỳ: tắt tiến trình phụ sau 10 phút không dịch.
     fn tick(&self) {}
+    /// Tắt tiến trình phụ đang rảnh để chúng nhả file model (trước khi xóa hay tải đè model, kế hoạch 04). Lần chuẩn bị
+    /// sau chạy lại chúng.
+    fn release_models(&self) {}
     /// Thoát app, bước 1: từ giờ không chạy thêm tiến trình phụ nào, kill các tiến trình đang chạy. Không chờ gì.
     fn shutdown(&self) {}
@@ -463,4 +466,11 @@ pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
 }
 
+/// Tắt tiến trình phụ đang rảnh để nhả file model (kế hoạch 04). Gọi khi không có phiên nào chạy.
+pub fn release_models<R: Runtime>(app: &AppHandle<R>) {
+    if let Some(session) = app.try_state::<Session>() {
+        session.deps.release_models();
+    }
+}
+
 /// Luồng nền gọi `tick` định kỳ.
 pub fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
@@ -741,4 +751,10 @@ impl<R: Runtime> SessionDeps for LiveDeps<R> {
     }
 
+    fn release_models(&self) {
+        if let Some(manager) = self.current() {
+            manager.stop(true);
+        }
+    }
+
     fn shutdown(&self) {
         pipeline::process::begin_shutdown();
```

- [ ] **Step 4: Đăng ký lệnh, quyền, khởi động, câu báo lỗi**

Ba chỗ của mỗi lệnh (`commands.rs`, `build.rs`, `capabilities/main.json`) phải khớp; `acl_tests` kiểm điều đó và kiểm cửa sổ `overlay` không gọi được lệnh nào trong số này.

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -120,2 +120,10 @@ pub const MAIN_COMMANDS: &[&str] = &[
     "open_audio_permission_settings",
+    "get_models_state",
+    "load_models",
+    "download_models",
+    "pause_models_download",
+    "select_model_pack",
+    "delete_models",
+    "delete_models_and_data",
+    "dismiss_models_update",
 ];
@@ -141,2 +149,10 @@ pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send +
         get_overlay_view,
+        crate::models::commands::get_models_state,
+        crate::models::commands::load_models,
+        crate::models::commands::download_models,
+        crate::models::commands::pause_models_download,
+        crate::models::commands::select_model_pack,
+        crate::models::commands::delete_models,
+        crate::models::commands::delete_models_and_data,
+        crate::models::commands::dismiss_models_update,
     ]
```

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -24,2 +24,10 @@ fn main() {
             "open_audio_permission_settings",
+            "get_models_state",
+            "load_models",
+            "download_models",
+            "pause_models_download",
+            "select_model_pack",
+            "delete_models",
+            "delete_models_and_data",
+            "dismiss_models_update",
             "get_overlay_view",
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -19,2 +19,10 @@
     "allow-open-audio-permission-settings",
+    "allow-get-models-state",
+    "allow-load-models",
+    "allow-download-models",
+    "allow-pause-models-download",
+    "allow-select-model-pack",
+    "allow-delete-models",
+    "allow-delete-models-and-data",
+    "allow-dismiss-models-update",
     "core:event:allow-listen",
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -132,2 +132,7 @@ fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
     sidecar::start_gpu_probe(&handle);
+    // Quản lý model (kế hoạch 04): đọc manifest đã lưu, kiểm bản mới tối đa mỗi ngày một lần.
+    app.manage(Arc::new(models::service::ModelService::new(
+        models::service::Config::live(&handle)?,
+    )));
+    models::service::check_on_startup(&handle);
     app.manage(session::Session::new(Arc::new(session::LiveDeps::new(handle.clone()))));
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -167,2 +167,13 @@ export const en = {
   "error.modelBroken": "The model is damaged. Please download it again.",
+  "error.modelsNoSource": "This build has no model download address yet.",
+  "error.modelsOffline": "Could not reach the model server. Check your internet connection and try again.",
+  "error.modelsManifestInvalid": "The model list from the server is not valid and was ignored. Try again later.",
+  "error.modelsUnknownPack": "This model pack does not exist.",
+  "error.modelsAppTooOld": "This model pack needs a newer version of AI Translator.",
+  "error.modelsNoSpace": "Not enough free disk space. The download needs its size plus 1 GB free.",
+  "error.modelsBusy": "Models are being downloaded. Wait until the download finishes.",
+  "error.modelsInUse": "Stop translating before updating or deleting the model pack in use.",
+  "error.modelsDownloadFailed": "The download did not finish. Press Resume to continue where it stopped.",
+  "error.modelsChecksum": "A downloaded file was damaged. Press Resume to download it again.",
+  "error.modelsDisk": "Could not write the model files to disk.",
   "error.quotaExhausted": "The translation quota has been used up.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -167,2 +167,13 @@ export const vi: Record<MessageKey, string> = {
   "error.modelBroken": "Model bị hỏng. Hãy tải lại model.",
+  "error.modelsNoSource": "Bản này chưa có địa chỉ tải model.",
+  "error.modelsOffline": "Không kết nối được máy chủ model. Kiểm tra kết nối mạng rồi thử lại.",
+  "error.modelsManifestInvalid": "Danh sách model từ máy chủ không hợp lệ nên đã bị bỏ qua. Thử lại sau.",
+  "error.modelsUnknownPack": "Không có gói model này.",
+  "error.modelsAppTooOld": "Gói model này cần bản AI Translator mới hơn.",
+  "error.modelsNoSpace": "Không đủ dung lượng trống. Cần trống bằng dung lượng tải cộng thêm 1 GB.",
+  "error.modelsBusy": "Đang tải model. Chờ tải xong rồi thử lại.",
+  "error.modelsInUse": "Dừng dịch trước khi cập nhật hay xóa gói model đang dùng.",
+  "error.modelsDownloadFailed": "Tải chưa xong. Bấm Tiếp tục để tải tiếp từ chỗ đã dừng.",
+  "error.modelsChecksum": "Một file tải về bị hỏng. Bấm Tiếp tục để tải lại file đó.",
+  "error.modelsDisk": "Không ghi được file model xuống ổ đĩa.",
   "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
```

- [ ] **Step 5: Chạy test**

Run: `cargo test -p meeting-translator --lib models::service 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 206 filtered out; finished in 0.56s
```

Run: `cargo test -p meeting-translator --lib 2>&1 | grep -E '^test result'; pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '`

Expected (lúc lập kế hoạch; cả `acl_tests` và `errors::tests` đều chạy trong lệnh đầu):

```text
test result: ok. 217 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 1.00s
 Test Files  5 passed (5)
      Tests  64 passed (64)
```

- [ ] **Step 6: Định dạng, clippy**

Run: `cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)'`

Expected:

```text
0
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/errors.rs src-tauri/src/models/mod.rs src-tauri/src/test_support.rs src-tauri/src/models/service.rs src-tauri/src/models/commands.rs src-tauri/src/actions.rs src-tauri/src/session.rs src-tauri/src/commands.rs src-tauri/build.rs src-tauri/capabilities/main.json src-tauri/src/lib.rs src/i18n/en.ts src/i18n/vi.ts
git commit -q -m "feat(models): dịch vụ model, lệnh và sự kiện models://state: tải gói, tạm dừng, cập nhật, xóa (04 T8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: Phiên dịch dùng kho model

Dòng 233, 338; QĐ11, QĐ15, QĐ17; ghi chú 8 của review cuối 02:
- `sidecar/mod.rs`: file model của gói đang dùng lấy từ `ModelService::resolve` (kiểm có file và kích thước; đang tải bản cập nhật thì `modelsBusy`); bản dev chưa tải gói nào thì dùng `models/` của repo như 02; ngưỡng của giám sát và của hai tiến trình phụ theo manifest. Dò GPU xong thì báo lại trạng thái model (đề xuất theo VRAM).
- `session.rs`: `engine_config` nhận `PipelineConfig` (từ manifest; `vadEndSilenceMs` của người dùng vẫn đè); `SessionDeps::pipeline_config`; lỗi `modelBroken` (lúc bắt đầu hay giữa phiên) thì băm lại gói; `LiveDeps::prepare` giữ bộ tiến trình phụ đang có khi phiên đang chạy (`reuse_current`).

**Files:**
- Sửa: `src-tauri/src/session.rs`
- Sửa: `src-tauri/src/models/service.rs`
- Sửa: `src-tauri/src/sidecar/mod.rs`
- Sửa: `src-tauri/src/sidecar/paths.rs`

- [ ] **Step 1: Viết test**

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -977,5 +977,5 @@ mod tests {
         let mut settings = Settings::defaults(UiLanguage::Vi);
         settings.vad_end_silence_ms = 500;
-        let cfg = engine_config(&settings, 3_000_000);
+        let cfg = engine_config(&settings, PipelineConfig::default(), 3_000_000);
         assert_eq!(cfg.languages, ["en", "zh", "ja", "ko", "vi"]);
         assert_eq!(cfg.target, MtLang::Vi);
@@ -986,8 +986,31 @@ mod tests {
         settings.target_language = Lang::En;
         settings.experimental.translation_context = true;
-        let cfg = engine_config(&settings, 0);
+        let mut from_manifest = PipelineConfig::default();
+        from_manifest.queue.lag_warn_ms = 8_000;
+        from_manifest.segmenter.end_silence_ms = 900;
+        let cfg = engine_config(&settings, from_manifest, 0);
         assert_eq!(cfg.languages, ["ja"], "khóa ngôn ngữ nguồn thì bỏ nhận diện (§6.4)");
         assert_eq!(cfg.target, MtLang::En);
         assert!(cfg.translation_context);
+        assert_eq!(cfg.pipeline.queue.lag_warn_ms, 8_000, "ngưỡng theo manifest");
+        assert_eq!(
+            cfg.pipeline.segmenter.end_silence_ms, 500,
+            "vadEndSilenceMs của người dùng đè manifest"
+        );
+    }
+
+    /// Ghi chú 8 của review cuối 02: đổi gói trong lúc đang dịch thì không dựng bộ tiến trình phụ thứ hai.
+    #[test]
+    fn a_new_pack_waits_for_the_next_session() {
+        assert!(reuse_current(Some("lite"), Some("lite"), false));
+        assert!(
+            !reuse_current(Some("lite"), Some("standard"), false),
+            "chưa dịch: dựng theo gói mới"
+        );
+        assert!(
+            reuse_current(Some("lite"), Some("standard"), true),
+            "đang dịch: giữ gói cũ"
+        );
+        assert!(!reuse_current(None, Some("lite"), false));
     }
 
```

Sửa `src-tauri/src/models/service.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/service.rs
+++ b/src-tauri/src/models/service.rs
@@ -722,4 +722,8 @@ mod tests {
 
     fn harness(change: impl FnOnce(&mut Config)) -> Harness {
+        harness_with(FakeDeps::default(), change)
+    }
+
+    fn harness_with(deps: FakeDeps, change: impl FnOnce(&mut Config)) -> Harness {
         let server = FakeServer::start();
         publish(&server, &real_sample());
@@ -727,5 +731,5 @@ mod tests {
         let mut cfg = models_config(Some(server.url("models.json")), clock.clone());
         change(&mut cfg);
-        let app = mock_app_full(FakeDeps::default(), cfg);
+        let app = mock_app_full(deps, cfg);
         let events = Arc::new(Mutex::new(Vec::new()));
         let sink = events.clone();
@@ -1048,4 +1052,29 @@ mod tests {
     }
 
+    /// §9: phiên không bắt đầu được vì model nạp lỗi thì app băm lại file của gói đang dùng.
+    #[test]
+    fn a_session_failing_on_a_broken_model_hashes_the_pack_again() {
+        let deps = FakeDeps {
+            prepare_error: Some(errors::MODEL_BROKEN),
+            ..FakeDeps::default()
+        };
+        let h = harness_with(deps, |_| {});
+        h.call("load_models", json!({})).unwrap();
+        h.call("download_models", json!({ "pack": "lite" })).unwrap();
+        h.wait("done");
+        let path = h.dir().join("ggml-small-q5_1.bin");
+        let mut bytes = std::fs::read(&path).unwrap();
+        bytes[0] ^= 1;
+        std::fs::write(&path, bytes).unwrap();
+        let refused = h.call("toggle_session", json!({})).unwrap_err();
+        assert!(refused.contains("\"code\":\"modelBroken\""), "{refused}");
+        let started = Instant::now();
+        while h.call("get_models_state", json!({})).unwrap()["packs"][1]["usable"] == true {
+            assert!(started.elapsed() < Duration::from_secs(10), "không băm lại");
+            std::thread::sleep(Duration::from_millis(10));
+        }
+        assert!(!path.exists(), "file hỏng bị xóa để tải lại");
+    }
+
     #[test]
     fn pausing_without_a_download_does_nothing() {
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib -- session:: models::service 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -8`

Expected (lúc lập kế hoạch):

```text
error: could not compile `meeting-translator` (lib test) due to 6 previous errors
error[E0061]: this function takes 2 arguments but 3 arguments were supplied
error[E0425]: cannot find function `reuse_current` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -80,4 +80,8 @@ pub trait SessionDeps: Send + Sync {
         errors::SIDECAR_FAILED
     }
+    /// Ngưỡng của pipeline: mặc định, hay theo manifest model đã ký (kế hoạch 04, 02a QĐ21).
+    fn pipeline_config(&self) -> PipelineConfig {
+        PipelineConfig::default()
+    }
 }
 
@@ -134,7 +138,6 @@ fn code_of(settings: Lang) -> &'static str {
 }
 
-/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh.
-pub fn engine_config(settings: &Settings, id_base: u64) -> EngineConfig {
-    let mut pipeline = PipelineConfig::default();
+/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh; các ngưỡng khác theo `pipeline`.
+pub fn engine_config(settings: &Settings, mut pipeline: PipelineConfig, id_base: u64) -> EngineConfig {
     pipeline.segmenter.end_silence_ms = u64::from(settings.vad_end_silence_ms);
     let languages = match settings.source_lock {
@@ -182,6 +185,14 @@ fn show_overlay<R: Runtime>(app: &AppHandle<R>) {
 }
 
+/// Model nạp lỗi (§9): băm lại file của gói đang dùng trên luồng nền; file hỏng thì gói hiện "chưa tải" để tải lại.
+fn check_broken_model<R: Runtime>(app: &AppHandle<R>, code: &str) {
+    if code == errors::MODEL_BROKEN {
+        crate::models::service::verify_in_background(app);
+    }
+}
+
 /// Báo lỗi của lần bắt đầu số `attempt`, trừ khi người dùng đã hủy lần đó (trạng thái đã về `idle`, hay đã sang lần sau).
 fn start_failed<R: Runtime>(app: &AppHandle<R>, attempt: u64, code: &str) -> AppStatus {
+    check_broken_model(app, code);
     let session = app.state::<Session>();
     app.state::<AppState>().update_status(|s| {
@@ -286,5 +297,5 @@ pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Resu
     });
     let engine = match Engine::start(
-        engine_config(&settings, n * ID_STRIDE),
+        engine_config(&settings, session.deps.pipeline_config(), n * ID_STRIDE),
         source,
         session.deps.vad(),
@@ -385,4 +396,5 @@ fn fail<R: Runtime>(app: &AppHandle<R>, n: u64, code: &str, message: &str) {
     }
     log::error!("phiên dịch dừng vì lỗi {code}: {message}");
+    check_broken_model(app, code);
     app.state::<AppState>().update_status(|s| {
         s.session = SessionStatus::Error;
@@ -660,12 +672,23 @@ impl<R: Runtime> LiveDeps<R> {
 }
 
+/// Dùng lại bộ tiến trình phụ đang có thay vì dựng bộ mới theo gói trong cài đặt: cùng gói, hay đang có phiên chạy
+/// (gói mới dùng từ phiên sau; không chạy hai bộ tiến trình phụ cùng lúc, ghi chú 8 của review cuối 02).
+fn reuse_current(current: Option<&str>, wanted: Option<&str>, in_session: bool) -> bool {
+    current == wanted || in_session
+}
+
 impl<R: Runtime> SessionDeps for LiveDeps<R> {
     fn prepare(&self, settings: &Settings) -> Result<(), CommandError> {
+        let in_session = self.app.state::<AppState>().status().session == SessionStatus::Running;
         let running = {
             let live = self.live.lock().unwrap();
             live.as_ref()
-                .filter(|l| l.tier == settings.model_tier)
+                .filter(|l| reuse_current(l.tier.as_deref(), settings.model_tier.as_deref(), in_session))
                 .map(|l| l.manager.clone())
         };
+        if in_session && let Some(manager) = &running {
+            manager.touch();
+            return Ok(());
+        }
         if let Some(manager) = running.filter(|m| m.running()) {
             manager.touch();
@@ -774,4 +797,11 @@ impl<R: Runtime> SessionDeps for LiveDeps<R> {
             .map_or(errors::SIDECAR_FAILED, sidecar::give_up_code)
     }
+
+    fn pipeline_config(&self) -> PipelineConfig {
+        self.app
+            .try_state::<Arc<crate::models::service::ModelService>>()
+            .map(|models| models.pipeline_config())
+            .unwrap_or_default()
+    }
 }
 
```

Sửa `src-tauri/src/models/service.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/models/service.rs
+++ b/src-tauri/src/models/service.rs
@@ -643,4 +643,14 @@ pub fn check_on_startup<R: Runtime>(app: &AppHandle<R>) {
 }
 
+/// Model nạp lỗi (§9): băm lại file của gói đang dùng trên luồng nền.
+pub fn verify_in_background<R: Runtime>(app: &AppHandle<R>) {
+    let app = app.clone();
+    std::thread::spawn(move || {
+        if let Some(service) = app.try_state::<Arc<ModelService>>() {
+            service.verify_selected(&app);
+        }
+    });
+}
+
 /// Báo trạng thái model mới (ví dụ khi `--probe` vừa có kết quả).
 pub fn changed<R: Runtime>(app: &AppHandle<R>) {
```

Sửa `src-tauri/src/sidecar/mod.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/mod.rs
+++ b/src-tauri/src/sidecar/mod.rs
@@ -8,12 +8,12 @@ pub mod probe;
 
 use std::path::{Path, PathBuf};
-use std::sync::{Condvar, Mutex};
+use std::sync::{Arc, Condvar, Mutex};
 use std::time::Duration;
 
-use pipeline::config::PipelineConfig;
 use pipeline::supervisor::{AsrSpec, GiveUpCause, LlamaSpec, SidecarSpec};
 use tauri::{AppHandle, Manager, Runtime};
 
 use crate::errors::{self, CommandError};
+use crate::models::service::ModelService;
 use crate::settings::Settings;
 
@@ -124,4 +124,6 @@ pub fn start_gpu_probe<R: Runtime>(app: &AppHandle<R>) {
         app.state::<GpuProbe>()
             .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)));
+        // Đề xuất gói theo VRAM của card rời (kế hoạch 04) đổi theo kết quả dò.
+        crate::models::service::changed(&app);
     });
 }
@@ -134,4 +136,24 @@ fn seen_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
 }
 
+/// File model của gói đang dùng, theo kho model (kế hoạch 04; lúc bắt đầu chỉ kiểm có file và đúng kích thước, §9).
+/// Bản dev chưa tải gói nào qua manifest thì dùng file của Giai đoạn 0 trong `models/` của repo, như trước.
+fn resolve_models<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<paths::ModelFiles, CommandError> {
+    let pack = settings.model_tier.as_deref();
+    let resolved = match app.try_state::<Arc<ModelService>>() {
+        Some(models) => models.resolve(pack),
+        None => Err(CommandError::new(errors::MODEL_MISSING, None, "chưa có quản lý model")),
+    };
+    match resolved {
+        Err(e) if e.code == errors::MODEL_MISSING && tauri::is_dev() => {
+            let dev = paths::model_files(&paths::dev_models_dir(), pack);
+            match paths::first_missing(&dev) {
+                None => Ok(dev),
+                Some(_) => Err(e),
+            }
+        }
+        other => other,
+    }
+}
+
 /// Dựng cách chạy cho gói model trong cài đặt. Kiểm SHA-256 trước, rồi mới chạy `--probe` (Windows): không chạy binary
 /// nào chưa kiểm.
@@ -161,19 +183,10 @@ pub fn prepare<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<Pr
         true
     };
-    let models_dir = if tauri::is_dev() {
-        paths::dev_models_dir()
-    } else {
-        data.join("models")
-    };
-    let models = paths::model_files(&models_dir, settings.model_tier.as_deref());
-    if let Some(missing) = paths::first_missing(&models) {
-        return Err(CommandError::new(
-            errors::MODEL_MISSING,
-            None,
-            format!("thiếu {}", missing.display()),
-        ));
-    }
+    let models = resolve_models(app, settings)?;
     let logs = app.path().app_log_dir().map_err(path_error)?;
-    let config = PipelineConfig::default();
+    let config = app
+        .try_state::<Arc<ModelService>>()
+        .map(|models| models.pipeline_config())
+        .unwrap_or_default();
     let spec = SidecarSpec {
         asr: AsrSpec {
```

Sửa `src-tauri/src/sidecar/paths.rs` (áp bằng `git apply`):

```diff
--- a/src-tauri/src/sidecar/paths.rs
+++ b/src-tauri/src/sidecar/paths.rs
@@ -3,6 +3,6 @@
 //! - Tiến trình phụ: bản dev ở `src-tauri/binaries/`, tên kèm target triple (`scripts/copy-sidecars.sh` chép vào); bản
 //!   phát hành nằm cạnh file chạy của app, tên không kèm triple (Tauri `externalBin` bỏ triple khi đóng gói, kế hoạch 07).
-//! - Model: bản dev đọc `MT_MODELS_DIR`, không đặt thì `<repo>/models`; bản phát hành ở `app_local_data_dir/models`
-//!   (kế hoạch 04 tải về đó).
+//! - Model: theo kho model của kế hoạch 04 (`app_local_data_dir/models`, `models::store`). Bản dev chưa tải gói nào
+//!   thì dùng file của Giai đoạn 0 ở `MT_MODELS_DIR`, không đặt thì `<repo>/models`.
 
 use std::path::{Path, PathBuf};
@@ -84,5 +84,5 @@ pub fn dev_models_dir() -> PathBuf {
 }
 
-/// File model đầu tiên còn thiếu (§9: lúc bắt đầu chỉ kiểm có file; kích thước và SHA-256 theo manifest là việc của 04).
+/// File model đầu tiên còn thiếu (bản dev, file của Giai đoạn 0 không có trong kho model).
 pub fn first_missing(files: &ModelFiles) -> Option<&Path> {
     [&files.asr, &files.mt, &files.vad]
```

- [ ] **Step 4: Chạy test**

Run: `cargo test -p meeting-translator --lib -- session:: models::service 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 22 passed; 0 failed; 0 ignored; 0 measured; 199 filtered out; finished in 0.54s
```

- [ ] **Step 5: Định dạng, clippy, code Windows**

Run:

```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -E '^(warning|error)'
./scripts/check-windows.sh 2>&1 | grep -E '^(warning|error)|Finished' | sed -E 's/ in [0-9.]+s$//'
rm -rf "${CARGO_TARGET_DIR:-target}/x86_64-pc-windows-msvc"
```

Expected:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s)
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/models/service.rs src-tauri/src/sidecar/mod.rs src-tauri/src/sidecar/paths.rs
git commit -q -m "feat(app): phiên dịch lấy model và ngưỡng từ kho model; model hỏng thì băm lại; gói mới dùng từ phiên sau (04 T9)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Giao diện: kiểu, store và chuỗi

Dòng 36, 37, 53, 163; QĐ20:
- `src/lib/models.ts`: kiểu khớp `ModelsView` phía Rust; hàm thuần: định dạng dung lượng, gói đề xuất, gói chọn sẵn, phần còn phải tải, tiến độ.
- `src/store/models.ts`: store Zustand riêng (nghe `models://state`, bỏ trạng thái cũ theo `rev`, gọi 8 lệnh).
- `src/lib/ipc.ts`: lệnh và sự kiện mới. `src/i18n`: khối `models.*`.
- `src/lib/fakeModels.ts`: dữ liệu giả cho test (như `fakeIpc.ts`).

**Files:**
- Tạo: `src/lib/fakeModels.ts`
- Tạo: `src/lib/models.test.ts`
- Tạo: `src/store/models.test.ts`
- Tạo: `src/lib/models.ts`
- Tạo: `src/store/models.ts`
- Sửa: `src/lib/ipc.ts`
- Sửa: `src/i18n/en.ts`
- Sửa: `src/i18n/vi.ts`

- [ ] **Step 1: Viết test**

Tạo `src/lib/fakeModels.ts`:

```ts
import type { ModelsView, PackView } from "./models";

// Dữ liệu giả của quản lý model cho test (chỉ dùng trong file *.test.ts): hai gói như manifest staging, máy Mac 16 GB.

export function fakePack(id: string, bytes: number, extra: Partial<PackView> = {}): PackView {
  return {
    id,
    name: { vi: id === "lite" ? "Nhẹ" : "Chuẩn", en: id === "lite" ? "Lite" : "Standard" },
    note: { vi: "ghi chú", en: "note" },
    bytes,
    usable: false,
    complete: false,
    missingBytes: bytes,
    partialBytes: 0,
    appTooOld: false,
    ...extra,
  };
}

export function fakeModelsView(extra: Partial<ModelsView> = {}): ModelsView {
  return {
    rev: 1,
    hasSource: true,
    checking: false,
    manifestError: null,
    sequence: 3,
    packs: [fakePack("standard", 2_485_000_000), fakePack("lite", 1_326_000_000)],
    machine: { os: "macos", ramMib: 16_384, avx2: true, gpus: [], gpuKnown: true },
    verdict: { kind: "recommend", pack: "standard" },
    freeDiskBytes: 100_000_000_000,
    usedBytes: 0,
    job: { state: "idle", pack: null, doneBytes: 0, totalBytes: 0, error: null, replacesInUse: false },
    updateAvailable: false,
    ...extra,
  };
}
```

Tạo `src/lib/models.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeModelsView, fakePack } from "./fakeModels";
import { defaultChoice, formatBytes, jobFor, progress, recommendedPack, remainingBytes } from "./models";

const pack = fakePack;
const view = fakeModelsView;

describe("formatBytes", () => {
  it("theo đơn vị thập phân, tiếng Việt dùng dấu phẩy", () => {
    expect(formatBytes(2_485_000_000, "vi")).toBe("2,5 GB");
    expect(formatBytes(2_485_000_000, "en")).toBe("2.5 GB");
    expect(formatBytes(1_000_000_000, "en")).toBe("1 GB");
    expect(formatBytes(190_085_487, "vi")).toBe("190 MB");
    expect(formatBytes(2_327_524, "en")).toBe("2.3 MB");
    expect(formatBytes(11_639, "en")).toBe("12 KB");
    expect(formatBytes(0, "vi")).toBe("0 KB");
  });
});

describe("chọn gói", () => {
  it("đề xuất theo máy; máy chưa hỗ trợ thì gói nhỏ nhất", () => {
    expect(recommendedPack(view())).toBe("standard");
    expect(recommendedPack(view({ verdict: { kind: "recommend", pack: "lite" } }))).toBe("lite");
    expect(recommendedPack(view({ verdict: { kind: "unsupported", reason: "lowRam" } }))).toBe("lite");
    expect(recommendedPack(view({ verdict: null }))).toBe("lite");
    expect(recommendedPack(view({ packs: [] }))).toBeNull();
  });

  it("gói cần app mới hơn thì không đề xuất", () => {
    const packs = [pack("standard", 2_485_000_000, { appTooOld: true }), pack("lite", 1_326_000_000)];
    expect(recommendedPack(view({ packs }))).toBe("lite");
  });

  it("chọn sẵn: gói người dùng vừa chọn, rồi gói đang dùng, rồi gói đề xuất", () => {
    expect(defaultChoice(view(), "lite", "standard")).toBe("lite");
    expect(defaultChoice(view(), null, "lite")).toBe("lite");
    expect(defaultChoice(view(), "khong-co", null)).toBe("standard");
    expect(defaultChoice(view(), null, null)).toBe("standard");
  });
});

describe("tiến độ tải", () => {
  it("phần còn phải tải trừ phần dở; tiến độ trong 0–1", () => {
    expect(remainingBytes(pack("lite", 1_000, { missingBytes: 800, partialBytes: 300 }))).toBe(500);
    expect(remainingBytes(pack("lite", 1_000, { missingBytes: 100, partialBytes: 300 }))).toBe(0);
    const job = { state: "downloading" as const, pack: "lite", doneBytes: 250, totalBytes: 1_000, error: null, replacesInUse: false };
    expect(progress(job)).toBe(0.25);
    expect(progress({ ...job, totalBytes: 0 })).toBe(0);
    expect(progress({ ...job, doneBytes: 2_000 })).toBe(1);
    expect(jobFor(view({ job }), "lite")).toEqual(job);
    expect(jobFor(view({ job }), "standard")).toBeNull();
    expect(jobFor(view(), "lite")).toBeNull();
  });
});
```

Tạo `src/store/models.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import { fakeModelsView } from "../lib/fakeModels";
import type { Settings } from "../lib/ipc";
import { createModelsStore } from "./models";

function setup(fail: Partial<Record<string, string>> = {}) {
  let rev = 1;
  const next = (extra = {}) => fakeModelsView({ rev: ++rev, ...extra });
  const error = (code: string) => ({ code, field: null, message: "lỗi giả" });
  const fake = fakeIpc({
    get_models_state: () => fakeModelsView({ rev: 1, sequence: null, packs: [] }),
    load_models: () => {
      if (fail.load_models) throw error(fail.load_models);
      return next();
    },
    download_models: ({ pack }) => {
      if (fail.download_models) throw error(fail.download_models);
      return next({ job: { state: "downloading", pack, doneBytes: 0, totalBytes: 10, error: null, replacesInUse: false } });
    },
    pause_models_download: () => next(),
    select_model_pack: () => ({}) as Settings,
    delete_models: () => next(),
    delete_models_and_data: () => next({ usedBytes: 0 }),
    dismiss_models_update: () => next({ updateAvailable: false }),
  });
  const store = createModelsStore(fake.ipc);
  return { fake, store };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("store quản lý model", () => {
  it("init nghe sự kiện, đọc trạng thái, rồi tải manifest ở nền", async () => {
    const { fake, store } = setup();
    const off = await store.getState().init();
    expect(fake.listenerCount("models://state")).toBe(1);
    await flush();
    expect(fake.calls.map((c) => c.cmd)).toEqual(["get_models_state", "load_models"]);
    expect(store.getState().view?.sequence).toBe(3);
    off();
    expect(fake.listenerCount("models://state")).toBe(0);
  });

  it("bỏ trạng thái cũ hơn trạng thái đang có", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    await flush();
    fake.emit("models://state", fakeModelsView({ rev: 50, usedBytes: 7 }));
    fake.emit("models://state", fakeModelsView({ rev: 49, usedBytes: 9 }));
    expect(store.getState().view?.usedBytes).toBe(7);
  });

  it("tải gói: trạng thái mới từ lệnh; lỗi thì hiện mã lỗi", async () => {
    const { store } = setup();
    expect(await store.getState().download("lite")).toBe(true);
    expect(store.getState().view?.job).toMatchObject({ state: "downloading", pack: "lite" });
    const failing = setup({ download_models: "modelsNoSpace" });
    expect(await failing.store.getState().download("lite")).toBe(false);
    expect(failing.store.getState().error).toEqual({ code: "modelsNoSpace", field: null });
    failing.store.getState().dismissError();
    expect(failing.store.getState().error).toBeNull();
  });

  it("lỗi mạng lúc tải manifest không làm init lỗi", async () => {
    const { store } = setup({ load_models: "modelsOffline" });
    await store.getState().init();
    await flush();
    expect(store.getState().error?.code).toBe("modelsOffline");
    expect(store.getState().view?.packs).toEqual([]);
  });

  it("chọn gói, xóa hết thì bỏ lựa chọn, để sau thì tắt lời mời cập nhật", async () => {
    const { fake, store } = setup();
    store.getState().choose("lite");
    expect(store.getState().choice).toBe("lite");
    expect(await store.getState().select("lite")).toBe(true);
    expect(await store.getState().removeAll()).toBe(true);
    expect(store.getState().choice).toBeNull();
    await store.getState().dismissUpdate();
    expect(store.getState().view?.updateAvailable).toBe(false);
    expect(await store.getState().remove("standard")).toBe(true);
    await store.getState().pause();
    expect(fake.calls.map((c) => c.cmd)).toEqual([
      "select_model_pack",
      "delete_models_and_data",
      "dismiss_models_update",
      "delete_models",
      "pause_models_download",
    ]);
    expect(fake.calls[0]?.args).toEqual({ pack: "lite" });
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ *(FAIL|Test Files|Tests) ' | sort -u`

Expected (lúc lập kế hoạch):

```text
      Tests  64 passed (64)
 FAIL  src/lib/models.test.ts [ src/lib/models.test.ts ]
 FAIL  src/store/models.test.ts [ src/store/models.test.ts ]
 Test Files  2 failed | 5 passed (7)
```

- [ ] **Step 3: Viết code**

Tạo `src/lib/models.ts`:

```ts
import type { UiLanguage } from "../i18n";

// Kiểu dữ liệu của quản lý model (kế hoạch 04), khớp `src-tauri/src/models/service.rs` (`ModelsView`), `machine.rs`
// và `recommend.rs`; cùng các hàm thuần để hiển thị.

export interface Localized {
  vi: string;
  en: string;
}

export interface PackView {
  id: string;
  name: Localized;
  // Ghi chú chất lượng khi chọn gói (§8).
  note: Localized;
  bytes: number;
  // Mọi file đã có (có thể là bản cũ hơn manifest): dùng được.
  usable: boolean;
  // Mọi file đã có đúng bản trong manifest.
  complete: boolean;
  missingBytes: number;
  partialBytes: number;
  appTooOld: boolean;
}

export interface Gpu {
  name: string;
  discrete: boolean;
  vramMib: number;
}

export interface Machine {
  os: "macos" | "windows";
  ramMib: number;
  avx2: boolean;
  gpus: Gpu[];
  // Windows: đã có kết quả dò GPU.
  gpuKnown: boolean;
}

export type Verdict = { kind: "recommend"; pack: string } | { kind: "unsupported"; reason: "lowRam" | "noAvx2" };

export type JobState = "idle" | "downloading" | "paused" | "failed" | "done";

export interface Job {
  state: JobState;
  pack: string | null;
  doneBytes: number;
  totalBytes: number;
  // Mã lỗi (`error.<mã>`) khi `state` là "failed".
  error: string | null;
  // Đang tải đè file của gói đang dùng (bản cập nhật).
  replacesInUse: boolean;
}

export interface ModelsView {
  rev: number;
  hasSource: boolean;
  checking: boolean;
  manifestError: string | null;
  sequence: number | null;
  packs: PackView[];
  machine: Machine;
  verdict: Verdict | null;
  freeDiskBytes: number | null;
  usedBytes: number;
  job: Job;
  updateAvailable: boolean;
}

// Dung lượng theo đơn vị thập phân như spec ("khoảng 2,5 GB"): GB từ 1 GB, MB từ 1 MB, còn lại KB. Tiếng Việt dùng
// dấu phẩy thập phân.
export function formatBytes(bytes: number, lang: UiLanguage): string {
  const [value, unit] =
    bytes >= 1e9 ? [bytes / 1e9, "GB"] : bytes >= 1e6 ? [bytes / 1e6, "MB"] : [Math.max(bytes, 0) / 1e3, "KB"];
  const digits = value >= 10 ? 0 : 1;
  const text = value.toFixed(digits).replace(/\.0$/, "");
  return `${lang === "vi" ? text.replace(".", ",") : text} ${unit}`;
}

export function localized(text: Localized, lang: UiLanguage): string {
  return text[lang];
}

export function packById(view: ModelsView | null, id: string | null): PackView | undefined {
  return id ? view?.packs.find((p) => p.id === id) : undefined;
}

// Gói được đề xuất cho máy này; máy chưa được hỗ trợ thì gói nhỏ nhất.
export function recommendedPack(view: ModelsView): string | null {
  const usable = view.packs.filter((p) => !p.appTooOld);
  const verdict = view.verdict;
  if (verdict?.kind === "recommend" && usable.some((p) => p.id === verdict.pack)) return verdict.pack;
  const smallest = [...usable].sort((a, b) => a.bytes - b.bytes)[0];
  return smallest?.id ?? null;
}

// Gói chọn sẵn ở bước 2: gói người dùng đã chọn, gói đang dùng, rồi gói được đề xuất.
export function defaultChoice(view: ModelsView, choice: string | null, current: string | null): string | null {
  for (const id of [choice, current]) if (packById(view, id)) return id;
  return recommendedPack(view);
}

// Số byte còn phải tải của gói (trừ phần đã tải dở).
export function remainingBytes(pack: PackView): number {
  return Math.max(0, pack.missingBytes - pack.partialBytes);
}

// Tiến độ 0–1 của việc tải.
export function progress(job: Job): number {
  if (job.totalBytes <= 0) return 0;
  return Math.min(1, Math.max(0, job.doneBytes / job.totalBytes));
}

// Việc tải đang dở của gói này (đang tải, tạm dừng hay lỗi).
export function jobFor(view: ModelsView, pack: string): Job | null {
  return view.job.pack === pack && view.job.state !== "idle" ? view.job : null;
}
```

Tạo `src/store/models.ts`:

```ts
import { createStore } from "zustand/vanilla";
import type { Ipc } from "../lib/ipc";
import type { ModelsView } from "../lib/models";
import { type UiError, toUiError } from "./app";

// Store quản lý model của cửa sổ chính (kế hoạch 04): bản sao `ModelsView` do phía Rust gửi (sự kiện `models://state`
// và kết quả lệnh), cùng gói người dùng đang chọn ở bước 2 của lần đầu mở và ở Cài đặt › Model. Như store chính, mọi
// thay đổi đi qua lệnh `invoke`; store chỉ nhận kết quả.

export interface ModelsStoreState {
  view: ModelsView | null;
  // Gói đang chọn trên giao diện (chưa tải); `null` là theo gói chọn sẵn (`defaultChoice`).
  choice: string | null;
  error: UiError | null;
  init(): Promise<() => void>;
  load(): Promise<void>;
  choose(pack: string): void;
  download(pack: string): Promise<boolean>;
  pause(): Promise<void>;
  select(pack: string): Promise<boolean>;
  remove(pack: string): Promise<boolean>;
  removeAll(): Promise<boolean>;
  dismissUpdate(): Promise<void>;
  dismissError(): void;
}

export function createModelsStore(ipc: Ipc) {
  return createStore<ModelsStoreState>()((set, get) => {
    // Kết quả của lệnh có thể tới sau một sự kiện mới hơn: bỏ bản có `rev` nhỏ hơn bản đang có.
    function setView(view: ModelsView) {
      const current = get().view;
      if (current && view.rev < current.rev) return;
      set({ view });
    }

    async function run<T>(call: () => Promise<T>, apply: (result: T) => void): Promise<boolean> {
      try {
        apply(await call());
        set({ error: null });
        return true;
      } catch (e) {
        set({ error: toUiError(e) });
        return false;
      }
    }

    return {
      view: null,
      choice: null,
      error: null,

      // Nghe sự kiện trước, đọc trạng thái, rồi tải manifest ở nền (có thể chờ mạng; lỗi nằm trong `manifestError`).
      async init() {
        const off = await ipc.listen("models://state", setView);
        try {
          setView(await ipc.invoke("get_models_state"));
        } catch (e) {
          off();
          throw e;
        }
        void get().load();
        return off;
      },

      async load() {
        await run(() => ipc.invoke("load_models"), setView);
      },

      choose(pack) {
        set({ choice: pack });
      },

      download(pack) {
        return run(() => ipc.invoke("download_models", { pack }), setView);
      },

      async pause() {
        await run(() => ipc.invoke("pause_models_download"), setView);
      },

      // Cài đặt mới tới cửa sổ chính qua sự kiện `settings://changed`.
      select(pack) {
        return run(
          () => ipc.invoke("select_model_pack", { pack }),
          () => {},
        );
      },

      remove(pack) {
        return run(() => ipc.invoke("delete_models", { pack }), setView);
      },

      removeAll() {
        return run(() => ipc.invoke("delete_models_and_data"), (view) => {
          setView(view);
          set({ choice: null });
        });
      },

      async dismissUpdate() {
        await run(() => ipc.invoke("dismiss_models_update"), setView);
      },

      dismissError() {
        set({ error: null });
      },
    };
  });
}

export type ModelsStore = ReturnType<typeof createModelsStore>;
```

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -3,2 +3,3 @@ import { listen } from "@tauri-apps/api/event";
 import type { UiLanguage } from "../i18n";
+import type { ModelsView } from "./models";
 
@@ -170,2 +171,12 @@ export interface Commands {
   get_overlay_view: { args: undefined; result: OverlayView };
+  // Quản lý model (kế hoạch 04). `load_models` tải manifest nếu chưa có hay đã quá một ngày; `download_models` trả về
+  // ngay, tiến độ tới qua sự kiện `models://state`; tải xong thì gói thành gói đang dùng.
+  get_models_state: { args: undefined; result: ModelsView };
+  load_models: { args: undefined; result: ModelsView };
+  download_models: { args: { pack: string }; result: ModelsView };
+  pause_models_download: { args: undefined; result: ModelsView };
+  select_model_pack: { args: { pack: string }; result: Settings };
+  delete_models: { args: { pack: string }; result: ModelsView };
+  delete_models_and_data: { args: undefined; result: ModelsView };
+  dismiss_models_update: { args: undefined; result: ModelsView };
 }
@@ -182,2 +193,4 @@ export interface Events {
   "audio://level": number;
+  // Trạng thái quản lý model (kế hoạch 04).
+  "models://state": ModelsView;
 }
```

Chuỗi giao diện của quản lý model, đặt ngay sau dòng `"onboarding.download.title"` (ít va chạm với 03):

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -113,2 +113,42 @@ export const en = {
   "onboarding.download.title": "Download the model",
+  "models.loading": "Loading the list of model packs…",
+  "models.retry": "Try again",
+  "models.machine": "This computer: {ram} of RAM, {disk} free on disk.",
+  "models.gpu": "Graphics card: {name}, {vram} of video memory.",
+  "models.gpuChecking": "Checking the graphics card…",
+  "models.unsupported.lowRam": "This computer has less than 8 GB of RAM, which AI Translator does not support yet. You can still try the Lite pack, but translation may be slow or stop.",
+  "models.unsupported.noAvx2": "This computer's processor lacks AVX2, which AI Translator needs. Speech recognition will not run on it.",
+  "models.recommended": "Recommended for this computer",
+  "models.size": "Download size: {size}",
+  "models.installed": "Downloaded",
+  "models.inUse": "In use",
+  "models.appTooOld": "Needs a newer version of AI Translator",
+  "models.chooseHint": "You can change the pack later in Settings › Model.",
+  "models.download": "Download",
+  "models.downloadAndUse": "Download and use",
+  "models.use": "Use this pack",
+  "models.pause": "Pause",
+  "models.resume": "Resume",
+  "models.redownload": "Download again",
+  "models.delete": "Delete",
+  "models.progress": "{done} of {total} downloaded",
+  "models.downloading": "Downloading the {pack} pack…",
+  "models.paused": "Download paused.",
+  "models.done": "Download complete. AI Translator is ready to translate.",
+  "models.continueHint": "You can go on: the download continues in the background.",
+  "models.noChoice": "Go back one step and choose a model pack first.",
+  "models.update": "A new version of the {pack} pack is available ({size} to download).",
+  "models.updateNow": "Download now",
+  "models.updateLater": "Later",
+  "models.current": "Pack in use",
+  "models.none": "No model pack is ready yet.",
+  "models.used": "Disk space used by models: {size}",
+  "models.nextSession": "A newly chosen pack is used from the next translation session.",
+  "models.openSettings": "Open Model settings",
+  "models.deleteAll": "Delete models and data",
+  "models.deleteAll.hint": "Deletes all downloaded models together with your history and glossary. Your license and remaining quota are kept. On macOS, do this before removing the app.",
+  "models.deleteAll.ask": "Delete all models and data? You will need to download a model pack again before translating.",
+  "models.deleteAll.confirm": "Delete everything",
+  "models.deleteAll.cancel": "Cancel",
+  "models.deleteAll.done": "Models and data were deleted.",
   "onboarding.permission.title": "Allow system audio recording",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -113,2 +113,42 @@ export const vi: Record<MessageKey, string> = {
   "onboarding.download.title": "Tải model",
+  "models.loading": "Đang tải danh sách gói model…",
+  "models.retry": "Thử lại",
+  "models.machine": "Máy này: RAM {ram}, ổ đĩa còn trống {disk}.",
+  "models.gpu": "Card đồ họa: {name}, bộ nhớ đồ họa {vram}.",
+  "models.gpuChecking": "Đang kiểm tra card đồ họa…",
+  "models.unsupported.lowRam": "Máy này có RAM dưới 8 GB, AI Translator chưa hỗ trợ. Bạn vẫn có thể thử gói Nhẹ, nhưng dịch có thể chậm hoặc bị dừng.",
+  "models.unsupported.noAvx2": "Bộ xử lý của máy này không có AVX2, là tập lệnh AI Translator cần. Nhận dạng giọng nói sẽ không chạy được.",
+  "models.recommended": "Đề xuất cho máy này",
+  "models.size": "Dung lượng tải: {size}",
+  "models.installed": "Đã tải",
+  "models.inUse": "Đang dùng",
+  "models.appTooOld": "Cần bản AI Translator mới hơn",
+  "models.chooseHint": "Bạn có thể đổi gói sau trong Cài đặt › Model.",
+  "models.download": "Tải về",
+  "models.downloadAndUse": "Tải và dùng",
+  "models.use": "Dùng gói này",
+  "models.pause": "Tạm dừng",
+  "models.resume": "Tiếp tục",
+  "models.redownload": "Tải lại",
+  "models.delete": "Xóa",
+  "models.progress": "Đã tải {done} trên {total}",
+  "models.downloading": "Đang tải gói {pack}…",
+  "models.paused": "Đã tạm dừng tải.",
+  "models.done": "Đã tải xong. AI Translator đã sẵn sàng để dịch.",
+  "models.continueHint": "Bạn có thể đi tiếp: model vẫn tiếp tục tải ở nền.",
+  "models.noChoice": "Quay lại bước trước và chọn một gói model.",
+  "models.update": "Có bản mới của gói {pack} (dung lượng tải {size}).",
+  "models.updateNow": "Tải ngay",
+  "models.updateLater": "Để sau",
+  "models.current": "Gói đang dùng",
+  "models.none": "Chưa có gói model nào sẵn sàng.",
+  "models.used": "Dung lượng model đang chiếm: {size}",
+  "models.nextSession": "Gói vừa chọn được dùng từ phiên dịch sau.",
+  "models.openSettings": "Mở Cài đặt › Model",
+  "models.deleteAll": "Xóa model và dữ liệu",
+  "models.deleteAll.hint": "Xóa mọi model đã tải cùng lịch sử và từ điển thuật ngữ. Bản quyền và hạn mức còn lại được giữ nguyên. Trên macOS, hãy bấm nút này trước khi gỡ app.",
+  "models.deleteAll.ask": "Xóa mọi model và dữ liệu? Bạn sẽ phải tải lại một gói model trước khi dịch.",
+  "models.deleteAll.confirm": "Xóa hết",
+  "models.deleteAll.cancel": "Hủy",
+  "models.deleteAll.done": "Đã xóa model và dữ liệu.",
   "onboarding.permission.title": "Cho phép ghi âm thanh hệ thống",
```

- [ ] **Step 4: Chạy test và build**

Run: `pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '; pnpm build 2>&1 | grep -E 'error|built in' | sed -E 's/ in [0-9]+ms//'`

Expected (lúc lập kế hoạch):

```text
 Test Files  7 passed (7)
      Tests  74 passed (74)
✓ built
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/fakeModels.ts src/lib/models.test.ts src/store/models.test.ts src/lib/models.ts src/store/models.ts src/lib/ipc.ts src/i18n/en.ts src/i18n/vi.ts
git commit -q -m "feat(ui): kiểu, store và chuỗi giao diện của quản lý model (04 T10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 11: Màn hình: bước 2–3, Cài đặt › Model, "Xóa model và dữ liệu", lời mời cập nhật

Dòng 33, 36, 37, 53, 57, 159, 163, 223, 224, 237; §4.1 bước 2–3, §4.3, §8; QĐ8, QĐ18, QĐ19:
- Bước 2 (`ModelStep`): cấu hình máy, cảnh báo máy chưa được hỗ trợ, danh sách gói kèm dung lượng tải, ghi chú chất lượng, nhãn "Đề xuất cho máy này", chọn sẵn gói đề xuất.
- Bước 3 (`DownloadStep`): tự bắt đầu tải gói đã chọn, tiến độ, tạm dừng, tiếp tục, lỗi; đi tiếp được trong lúc tải.
- Cài đặt › Model (`ModelSettings`): gói đang dùng, dung lượng model, cấu hình máy, đổi gói, tải lại, xóa; lời mời cập nhật.
- Cài đặt › Quyền riêng tư: nút "Xóa model và dữ liệu" có bước xác nhận (`DeleteModelsAndData`).
- Màn hình chính: lời mời cập nhật, tiến độ tải, nút mở Cài đặt › Model khi thiếu model, model hỏng, hay hết bộ nhớ (§9: đề xuất gói Nhẹ).
- `packBadges` (hàm thuần, có test) chọn nhãn cạnh tên gói.

**Files:**
- Sửa: `src/lib/models.test.ts`
- Sửa: `src/lib/models.ts`
- Tạo: `src/windows/main/modelsStore.ts`
- Tạo: `src/windows/main/models/MachineInfo.tsx`
- Tạo: `src/windows/main/models/PackList.tsx`
- Tạo: `src/windows/main/models/DownloadPanel.tsx`
- Tạo: `src/windows/main/models/UpdateNotice.tsx`
- Tạo: `src/windows/main/models/ModelsError.tsx`
- Tạo: `src/windows/main/onboarding/ModelSteps.tsx`
- Tạo: `src/windows/main/settings/ModelSettings.tsx`
- Tạo: `src/windows/main/settings/DeleteModelsAndData.tsx`
- Sửa: `src/windows/main/onboarding/Onboarding.tsx`
- Sửa: `src/windows/main/screens/SettingsScreen.tsx`
- Sửa: `src/windows/main/screens/Home.tsx`
- Sửa: `src/windows/main/main.tsx`

- [ ] **Step 1: Viết test của `packBadges`**

Sửa `src/lib/models.test.ts` (áp bằng `git apply`):

```diff
--- a/src/lib/models.test.ts
+++ b/src/lib/models.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest";
 import { fakeModelsView, fakePack } from "./fakeModels";
-import { defaultChoice, formatBytes, jobFor, progress, recommendedPack, remainingBytes } from "./models";
+import { defaultChoice, formatBytes, jobFor, packBadges, progress, recommendedPack, remainingBytes } from "./models";
 
 const pack = fakePack;
@@ -53,2 +53,15 @@ describe("tiến độ tải", () => {
   });
 });
+
+describe("packBadges", () => {
+  it("đề xuất, đang dùng hay đã tải, cần app mới hơn", () => {
+    const standard = pack("standard", 2_485_000_000, { usable: true });
+    const lite = pack("lite", 1_326_000_000, { usable: true, appTooOld: true });
+    const v = view({ packs: [standard, lite] });
+    expect(packBadges(v, standard, "standard")).toEqual(["recommended", "inUse"]);
+    expect(packBadges(v, standard, "lite")).toEqual(["recommended", "installed"]);
+    expect(packBadges(v, lite, "standard")).toEqual(["installed", "appTooOld"]);
+    const unsupported = view({ verdict: { kind: "unsupported", reason: "lowRam" } });
+    expect(packBadges(unsupported, pack("lite", 1), null)).toEqual([]);
+  });
+});
```

Run: `pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ *(FAIL|Test Files|Tests) ' | sort -u`

Expected (lúc lập kế hoạch):

```text
      Tests  1 failed | 74 passed (75)
 FAIL  src/lib/models.test.ts > packBadges > đề xuất, đang dùng hay đã tải, cần app mới hơn
 Test Files  1 failed | 6 passed (7)
```

- [ ] **Step 2: Viết `packBadges`**

Sửa `src/lib/models.ts` (áp bằng `git apply`):

```diff
--- a/src/lib/models.ts
+++ b/src/lib/models.ts
@@ -117,2 +117,14 @@ export function jobFor(view: ModelsView, pack: string): Job | null {
   return view.job.pack === pack && view.job.state !== "idle" ? view.job : null;
 }
+
+export type PackBadge = "recommended" | "inUse" | "installed" | "appTooOld";
+
+// Nhãn cạnh tên gói: đề xuất cho máy này, đang dùng, đã tải, cần app mới hơn.
+export function packBadges(view: ModelsView, pack: PackView, current: string | null): PackBadge[] {
+  const badges: PackBadge[] = [];
+  if (recommendedPack(view) === pack.id && view.verdict?.kind === "recommend") badges.push("recommended");
+  if (pack.usable && pack.id === current) badges.push("inUse");
+  else if (pack.usable) badges.push("installed");
+  if (pack.appTooOld) badges.push("appTooOld");
+  return badges;
+}
```

Run: `pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '`

Expected (lúc lập kế hoạch):

```text
 Test Files  7 passed (7)
      Tests  75 passed (75)
```

- [ ] **Step 3: Store của cửa sổ chính và các component**

Tạo `src/windows/main/modelsStore.ts`:

```ts
import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { createModelsStore, type ModelsStoreState } from "../../store/models";

// Store quản lý model của cửa sổ chính, nối với lõi Rust thật (kế hoạch 04).
export const modelsStore = createModelsStore(tauriIpc);

export function useModels<T>(selector: (state: ModelsStoreState) => T): T {
  return useStore(modelsStore, selector);
}
```

Tạo `src/windows/main/models/MachineInfo.tsx`:

```tsx
import { formatBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { useModels } from "../modelsStore";

// Cấu hình máy (§4.1 bước 2): RAM, dung lượng trống, card rời (Windows), và cảnh báo máy chưa được hỗ trợ (§8).
export function MachineInfo() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const view = useModels((s) => s.view);
  if (!view) return null;
  const { machine, verdict } = view;
  const discrete = machine.gpus.filter((g) => g.discrete);
  return (
    <>
      <p className="hint">
        {t("models.machine", {
          ram: formatBytes(machine.ramMib * 1_048_576, lang),
          disk: view.freeDiskBytes === null ? "?" : formatBytes(view.freeDiskBytes, lang),
        })}
      </p>
      {machine.os === "windows" && !machine.gpuKnown && <p className="hint">{t("models.gpuChecking")}</p>}
      {discrete.map((g) => (
        <p key={g.name} className="hint">
          {t("models.gpu", { name: g.name, vram: formatBytes(g.vramMib * 1_048_576, lang) })}
        </p>
      ))}
      {verdict?.kind === "unsupported" && (
        <p className="error-text" role="alert">
          {t(verdict.reason === "lowRam" ? "models.unsupported.lowRam" : "models.unsupported.noAvx2")}
        </p>
      )}
    </>
  );
}
```

Tạo `src/windows/main/models/PackList.tsx`:

```tsx
import type { MessageKey } from "../../../i18n";
import { formatBytes, localized, type ModelsView, packBadges, remainingBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";

const BADGES: Record<ReturnType<typeof packBadges>[number], MessageKey> = {
  recommended: "models.recommended",
  inUse: "models.inUse",
  installed: "models.installed",
  appTooOld: "models.appTooOld",
};

// Danh sách gói để chọn (§4.1 bước 2, Cài đặt › Model): tên, dung lượng còn phải tải, ghi chú chất lượng (§8).
export function PackList({
  view,
  choice,
  onChoose,
}: {
  view: ModelsView;
  choice: string | null;
  onChoose: (pack: string) => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const current = useApp((s) => s.settings?.modelTier ?? null);
  return (
    <div className="packs" role="radiogroup" aria-label={t("onboarding.model.title")}>
      {view.packs.map((pack) => (
        <div key={pack.id} className="card">
          <div className="row">
            <label>
              <input
                type="radio"
                name="model-pack"
                checked={choice === pack.id}
                disabled={pack.appTooOld}
                onChange={() => onChoose(pack.id)}
              />{" "}
              <strong>{localized(pack.name, lang)}</strong>
            </label>
            <span className="hint">
              {t("models.size", { size: formatBytes(pack.usable ? remainingBytes(pack) : pack.bytes, lang) })}
            </span>
            {packBadges(view, pack, current).map((b) => (
              <span key={b} className="badge">
                {t(BADGES[b])}
              </span>
            ))}
          </div>
          <p className="hint">{localized(pack.note, lang)}</p>
        </div>
      ))}
    </div>
  );
}
```

Tạo `src/windows/main/models/DownloadPanel.tsx`:

```tsx
import { errorKey } from "../../../i18n";
import { formatBytes, localized, packById, progress } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { useModels } from "../modelsStore";

// Tiến độ tải (§4.1 bước 3, Cài đặt › Model): thanh tiến độ, tạm dừng, tiếp tục, lỗi (§9).
export function DownloadPanel() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const view = useModels((s) => s.view);
  const download = useModels((s) => s.download);
  const pause = useModels((s) => s.pause);
  if (!view) return null;
  const job = view.job;
  if (job.state === "idle" || !job.pack) return null;
  const pack = packById(view, job.pack);
  const name = pack ? localized(pack.name, lang) : job.pack;
  const amounts = { done: formatBytes(job.doneBytes, lang), total: formatBytes(job.totalBytes, lang) };
  return (
    <div className="card" role="status">
      {job.state === "downloading" && <p>{t("models.downloading", { pack: name })}</p>}
      {job.state === "paused" && <p>{t("models.paused")}</p>}
      {job.state === "done" && <p>{t("models.done")}</p>}
      {job.state === "failed" && job.error && <p className="error-text">{t(errorKey(job.error))}</p>}
      <div className="row">
        <meter min={0} max={1} value={progress(job)} aria-label={t("models.progress", amounts)} />
        <span className="hint">{t("models.progress", amounts)}</span>
        {job.state === "downloading" && <button onClick={() => void pause()}>{t("models.pause")}</button>}
        {(job.state === "paused" || job.state === "failed") && (
          <button className="primary" onClick={() => void download(job.pack ?? "")}>
            {t("models.resume")}
          </button>
        )}
      </div>
    </div>
  );
}
```

Tạo `src/windows/main/models/UpdateNotice.tsx`:

```tsx
import { formatBytes, localized, packById, remainingBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { useModels } from "../modelsStore";

// Có bản mới của gói đang dùng (§6.7): hỏi trước khi tải, không tự tải.
export function UpdateNotice() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const current = useApp((s) => s.settings?.modelTier ?? null);
  const view = useModels((s) => s.view);
  const download = useModels((s) => s.download);
  const dismiss = useModels((s) => s.dismissUpdate);
  const pack = packById(view, current);
  if (!view?.updateAvailable || !pack || view.job.state === "downloading") return null;
  return (
    <div className="notice" role="status">
      <span>{t("models.update", { pack: localized(pack.name, lang), size: formatBytes(remainingBytes(pack), lang) })}</span>
      <button className="primary" onClick={() => void download(pack.id)}>
        {t("models.updateNow")}
      </button>
      <button onClick={() => void dismiss()}>{t("models.updateLater")}</button>
    </div>
  );
}
```

Tạo `src/windows/main/models/ModelsError.tsx`:

```tsx
import { errorKey } from "../../../i18n";
import { useT } from "../appStore";
import { useModels } from "../modelsStore";

// Lỗi của lệnh quản lý model gần nhất, và lỗi tải manifest (mất mạng, chưa có nguồn) kèm nút thử lại.
export function ModelsError() {
  const t = useT();
  const error = useModels((s) => s.error);
  const manifestError = useModels((s) => s.view?.manifestError ?? null);
  const dismiss = useModels((s) => s.dismissError);
  const load = useModels((s) => s.load);
  const code = error?.code ?? manifestError;
  if (!code) return null;
  return (
    <div className="notice error" role="alert">
      <span>{t(errorKey(code))}</span>
      {code === "modelsOffline" && <button onClick={() => void load()}>{t("models.retry")}</button>}
      {error && <button onClick={dismiss}>{t("common.dismiss")}</button>}
    </div>
  );
}
```

Tạo `src/windows/main/onboarding/ModelSteps.tsx`:

```tsx
import { useEffect } from "react";
import { defaultChoice, packById } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { DownloadPanel } from "../models/DownloadPanel";
import { MachineInfo } from "../models/MachineInfo";
import { ModelsError } from "../models/ModelsError";
import { PackList } from "../models/PackList";
import { useModels } from "../modelsStore";

// Bước 2 của lần đầu mở (§4.1): kiểm tra cấu hình, đề xuất gói kèm dung lượng tải và ghi chú chất lượng (§8).
export function ModelStep() {
  const t = useT();
  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const choose = useModels((s) => s.choose);
  const current = useApp((s) => s.settings?.modelTier ?? null);
  if (!view || (view.packs.length === 0 && view.checking)) return <p className="hint">{t("models.loading")}</p>;
  const chosen = defaultChoice(view, choice, current);
  return (
    <>
      <ModelsError />
      <MachineInfo />
      {view.packs.length > 0 && <PackList view={view} choice={chosen} onChoose={choose} />}
      <p className="hint">{t("models.chooseHint")}</p>
    </>
  );
}

// Bước 3 (§4.1): tải gói đã chọn; tạm dừng rồi tải tiếp được. Vào bước này thì tự bắt đầu tải nếu gói chưa có và chưa
// có việc tải nào; người dùng đi tiếp được trong lúc model tải ở nền.
export function DownloadStep() {
  const t = useT();
  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const download = useModels((s) => s.download);
  const current = useApp((s) => s.settings?.modelTier ?? null);
  const chosen = view ? defaultChoice(view, choice, current) : null;
  const pack = packById(view, chosen);
  const idle = view?.job.state === "idle";
  const needed = pack !== undefined && !pack.complete;
  useEffect(() => {
    if (idle && needed && chosen) void download(chosen);
  }, [idle, needed, chosen, download]);
  if (!view) return <p className="hint">{t("models.loading")}</p>;
  if (!pack) {
    return (
      <>
        <ModelsError />
        <p className="hint">{t("models.noChoice")}</p>
      </>
    );
  }
  return (
    <>
      <ModelsError />
      <DownloadPanel />
      {pack.complete ? <p>{t("models.done")}</p> : <p className="hint">{t("models.continueHint")}</p>}
    </>
  );
}
```

Tạo `src/windows/main/settings/ModelSettings.tsx`:

```tsx
import { useEffect } from "react";
import { defaultChoice, formatBytes, localized, packById } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { DownloadPanel } from "../models/DownloadPanel";
import { MachineInfo } from "../models/MachineInfo";
import { ModelsError } from "../models/ModelsError";
import { PackList } from "../models/PackList";
import { UpdateNotice } from "../models/UpdateNotice";
import { useModels } from "../modelsStore";

// Nhóm Cài đặt "Model" (§4.3): gói đang dùng, dung lượng, đổi gói, tải lại hoặc xóa.
export function ModelSettings() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const current = useApp((s) => s.settings?.modelTier ?? null);
  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const choose = useModels((s) => s.choose);
  const load = useModels((s) => s.load);
  const download = useModels((s) => s.download);
  const select = useModels((s) => s.select);
  const remove = useModels((s) => s.remove);
  useEffect(() => {
    void load();
  }, [load]);
  if (!view) return <p className="hint">{t("models.loading")}</p>;
  const inUse = packById(view, current);
  const chosen = packById(view, defaultChoice(view, choice, current));
  const downloading = view.job.state === "downloading";
  return (
    <>
      <ModelsError />
      <UpdateNotice />
      <div className="card">
        <div className="row">
          <span>{t("models.current")}</span>
          <strong>{inUse?.usable ? localized(inUse.name, lang) : t("models.none")}</strong>
          {inUse && (
            <button disabled={downloading} onClick={() => void remove(inUse.id).then((ok) => ok && download(inUse.id))}>
              {t("models.redownload")}
            </button>
          )}
        </div>
        <p className="hint">{t("models.used", { size: formatBytes(view.usedBytes, lang) })}</p>
        <MachineInfo />
      </div>
      <DownloadPanel />
      <PackList view={view} choice={chosen?.id ?? null} onChoose={choose} />
      {chosen && (
        <div className="row">
          {chosen.usable && chosen.id !== current && (
            <button className="primary" onClick={() => void select(chosen.id)}>
              {t("models.use")}
            </button>
          )}
          {!chosen.complete && (
            <button className="primary" disabled={downloading || chosen.appTooOld} onClick={() => void download(chosen.id)}>
              {t(chosen.usable ? "models.download" : "models.downloadAndUse")}
            </button>
          )}
          {chosen.usable && (
            <button disabled={downloading} onClick={() => void remove(chosen.id)}>
              {t("models.delete")}
            </button>
          )}
        </div>
      )}
      <p className="hint">{t("models.nextSession")}</p>
    </>
  );
}
```

Tạo `src/windows/main/settings/DeleteModelsAndData.tsx`:

```tsx
import { useState } from "react";
import { useT } from "../appStore";
import { useModels } from "../modelsStore";

// Nút "Xóa model và dữ liệu" của nhóm Quyền riêng tư (§4.3, A6): hỏi lại trong app trước khi xóa. Bản quyền và hạn
// mức còn lại được giữ (Q14).
export function DeleteModelsAndData() {
  const t = useT();
  const removeAll = useModels((s) => s.removeAll);
  const [step, setStep] = useState<"idle" | "ask" | "done">("idle");
  return (
    <div className="card">
      <div className="row">
        <span>{t("models.deleteAll")}</span>
        {step !== "ask" && <button onClick={() => setStep("ask")}>{t("models.deleteAll")}</button>}
      </div>
      <p className="hint">{t("models.deleteAll.hint")}</p>
      {step === "ask" && (
        <div className="row" role="alert">
          <span className="error-text">{t("models.deleteAll.ask")}</span>
          <button className="primary" onClick={() => void removeAll().then((ok) => setStep(ok ? "done" : "idle"))}>
            {t("models.deleteAll.confirm")}
          </button>
          <button onClick={() => setStep("idle")}>{t("models.deleteAll.cancel")}</button>
        </div>
      )}
      {step === "done" && (
        <p className="hint" role="status">
          {t("models.deleteAll.done")}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Nối vào các màn hình**

Sửa `src/windows/main/onboarding/Onboarding.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/onboarding/Onboarding.tsx
+++ b/src/windows/main/onboarding/Onboarding.tsx
@@ -5,2 +5,3 @@ import { LanguagePicker } from "../LanguagePicker";
 import { Notice } from "../Notice";
+import { DownloadStep, ModelStep } from "./ModelSteps";
 import { TaskbarGuide } from "./TaskbarGuide";
@@ -102,2 +103,6 @@ function StepBody({ step, platform }: { step: Step; platform: "macos" | "windows
       );
+    case "model":
+      return <ModelStep />;
+    case "download":
+      return <DownloadStep />;
     case "languages":
```

Sửa `src/windows/main/screens/SettingsScreen.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/screens/SettingsScreen.tsx
+++ b/src/windows/main/screens/SettingsScreen.tsx
@@ -6,3 +6,5 @@ import { AudioSettings } from "../settings/AudioSettings";
 import { GeneralSettings } from "../settings/GeneralSettings";
+import { DeleteModelsAndData } from "../settings/DeleteModelsAndData";
 import { HotkeySettings } from "../settings/HotkeySettings";
+import { ModelSettings } from "../settings/ModelSettings";
 
@@ -13,3 +15,2 @@ const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {
   subtitles: "settings.subtitles.description",
-  model: "settings.model.description",
   license: "settings.license.description",
@@ -70,2 +71,4 @@ export function SettingsScreen() {
         {group === "hotkeys" && <HotkeySettings />}
+        {group === "model" && <ModelSettings />}
+        {group === "privacy" && <DeleteModelsAndData />}
         {description && (
```

Sửa `src/windows/main/screens/Home.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/screens/Home.tsx
+++ b/src/windows/main/screens/Home.tsx
@@ -6,2 +6,4 @@ import { useApp, useT } from "../appStore";
 import { LanguagePicker } from "../LanguagePicker";
+import { DownloadPanel } from "../models/DownloadPanel";
+import { UpdateNotice } from "../models/UpdateNotice";
 
@@ -63,2 +65,5 @@ export function Home() {
             )}
+            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
+              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
+            )}
           </div>
@@ -76,3 +81,8 @@ export function Home() {
         ))}
+        {status.suggestLite && (
+          <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
+        )}
       </div>
+      <UpdateNotice />
+      <DownloadPanel />
       <div className="card">
```

Sửa `src/windows/main/main.tsx` (áp bằng `git apply`):

```diff
--- a/src/windows/main/main.tsx
+++ b/src/windows/main/main.tsx
@@ -6,2 +6,3 @@ import { App } from "./App";
 import { appStore, fallbackLanguage } from "./appStore";
+import { modelsStore } from "./modelsStore";
 
@@ -26,2 +27,8 @@ root.render(
 // điều hành, thay vì để cửa sổ trắng trơn.
+// Quản lý model (kế hoạch 04): lỗi ở đây chỉ ghi log, phần còn lại của cửa sổ vẫn dùng được.
+modelsStore
+  .getState()
+  .init()
+  .catch((e: unknown) => console.error("không khởi tạo được quản lý model", e));
+
 appStore
```

- [ ] **Step 5: Build và test**

Run: `pnpm build 2>&1 | grep -E 'error|built in' | sed -E 's/ in [0-9]+ms//'; pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '`

Expected (lúc lập kế hoạch):

```text
✓ built
 Test Files  7 passed (7)
      Tests  75 passed (75)
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/models.test.ts src/lib/models.ts src/windows/main/modelsStore.ts src/windows/main/models src/windows/main/onboarding/ModelSteps.tsx src/windows/main/settings/ModelSettings.tsx src/windows/main/settings/DeleteModelsAndData.tsx src/windows/main/onboarding/Onboarding.tsx src/windows/main/screens/SettingsScreen.tsx src/windows/main/screens/Home.tsx src/windows/main/main.tsx
git commit -q -m "feat(ui): bước 2–3 của lần đầu mở, Cài đặt › Model, nút Xóa model và dữ liệu, lời mời cập nhật model (04 T11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 12: Kiểm tra chuẩn

Mục 6.2 của kế hoạch 00, cộng test của `scripts/models/`. Không có commit, trừ khi một lệnh làm đổi file (khi đó dừng và báo).

- [ ] **Step 1: Kiểm đĩa**

Run: `df -h / | tail -1`

Expected: còn trống từ 6 GiB trở lên; ít hơn thì dừng và báo. `cargo build --release -p asr-worker` và `check-windows.sh` cần thêm vài GiB.

- [ ] **Step 2: Phần của app và giao diện**

Run:

```bash
cargo fmt --all -- --check && echo fmt ok
pnpm install --frozen-lockfile 2>&1 | grep -E 'ERR|Done' | sed -E 's/ in [0-9]+ms.*//'
pnpm build 2>&1 | grep -E 'error|built in' | sed -E 's/ in [0-9]+ms//'
cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)'
cargo test -p meeting-translator 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
cargo deny check 2>&1 | tail -1
pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '
pnpm audit 2>&1 | tail -1
node --test --test-reporter=tap scripts/models/manifest.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```

Expected (lúc lập kế hoạch, trên `45de838` cộng 04; nếu 03 đã vào `main` thì số test lớn hơn):

```text
fmt ok
Done
✓ built
0
passed 219 failed 0 ignored 2
advisories ok, bans ok, licenses ok, sources ok
 Test Files  7 passed (7)
      Tests  75 passed (75)
No known vulnerabilities found
# tests 6
# pass 6
# fail 0
```

- [ ] **Step 3: Phần còn lại của mục 6.2.** Chạy đúng khối lệnh ở mục 6.2 của kế hoạch 00 (`cargo clippy --workspace …`, `cargo test --workspace`, các lệnh của `asr-worker`, `cargo audit`, `./scripts/check-windows.sh`, `pnpm -C server …`). 04 không đụng `crates/`, `server/` hay `asr-worker`, nên các lệnh đó cho kết quả như trên `main` trước 04, trừ `cargo test --workspace`: thêm 61 test của app (lúc lập kế hoạch, thư viện của app có 160 test trước 04 và 221 sau 04, trong đó 2 test bỏ qua có từ trước), tức khoảng 561 qua và 11 bỏ qua nếu `main` lúc đó có 500 qua và 11 bỏ qua. **Lúc lập kế hoạch chưa chạy được bước này**: ổ đĩa máy dev chỉ còn khoảng 6 GiB trong khi kế hoạch 03 build song song, còn build `asr-worker` (whisper.cpp) và test của mọi crate cần thêm vài GiB. Sau `check-windows.sh`, xóa `target/x86_64-pc-windows-msvc` nếu đĩa chật.

## Task 13: Bucket R2 staging, khóa staging, manifest staging (cần người)

Dòng 5, 157, 158, 162, 258; Đ8; QĐ10, QĐ12. Tạo bucket, gắn tên miền và tạo API token là bước của người trên dashboard Cloudflare (tài khoản của sản phẩm, T4). Phần còn lại agent làm được, theo đúng thứ tự dưới.

**Files:**
- Sửa: `src-tauri/keys/manifest-public-keys.json` (khối `staging`)
- Sửa: `src-tauri/src/models/source.rs` (`STAGING_URL`)

- [ ] **Step 1 (người): Tạo bucket.** Trên dashboard Cloudflare của sản phẩm: R2 › Create bucket, tên `ai-translator-models-staging`. Bật public access: dùng URL `r2.dev` của bucket (staging dùng tạm, R16), hoặc gắn tên miền staging nếu đã có (T7). Ghi lại URL gốc công khai, ví dụ `https://pub-<id>.r2.dev`. Tạo API token R2 phạm vi chỉ bucket này (Object Read & Write) nếu muốn upload bằng `wrangler`; không dán token vào file hay kế hoạch.
- [ ] **Step 2: Gom file staging ngoài repo.**

```bash
STG="$HOME/ai-translator-staging/models"
mkdir -p "$STG"
for f in ggml-large-v3-turbo-q5_0.bin ggml-small-q5_1.bin Hy-MT2-1.8B-Q8_0.gguf Hy-MT2-1.8B-Q4_K_M.gguf Hy-MT2-LICENSE.txt silero_vad_v6.2.3.onnx; do cp "models/$f" "$STG/"; done
curl -fsSL https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE -o "$STG/whisper-LICENSE.txt"
curl -fsSL https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.3/LICENSE -o "$STG/whisper.cpp-LICENSE.txt"
curl -fsSL https://raw.githubusercontent.com/snakers4/silero-vad/v6.2.3/LICENSE -o "$STG/silero-vad-LICENSE.txt"
cp scripts/models/NOTICE.txt "$STG/"
node scripts/models/build-manifest.mjs --dir "$STG" --sequence 1 > "$STG/../body.json"
```

Expected: `body.json` có 10 file; `sha256` của 6 file model trùng `models/MANIFEST.json` (lúc lập kế hoạch: `394221709cd5…`, `ae85e4a935d7…`, `5c3fe0b1408a…`, `dc5f44fcf1fa…`, `a1d52d448f81…`, `1a153a22f450…`). Ba file LICENSE lúc lập kế hoạch có 1 063, 1 078 và 1 075 byte.

- [ ] **Step 3: Tạo khóa staging** (khóa riêng chỉ nằm ngoài repo, quyền 0600; không in ra terminal):

```bash
node scripts/models/gen-manifest-key.mjs stg-2026-10-1 --out "$HOME/.config/ai-translator/manifest-stg-2026-10-1.jwk"
```

Expected: stdout là một dòng `{"kid":"stg-2026-10-1","x":"…"}`. Thêm đúng dòng đó vào mảng `"staging"` của `src-tauri/keys/manifest-public-keys.json`. Chủ dự án tự chọn nơi giữ bản sao file JWK (staging; không phải bí mật production).

- [ ] **Step 4: Ký manifest staging**

```bash
node scripts/models/sign-manifest.mjs --key "$HOME/.config/ai-translator/manifest-stg-2026-10-1.jwk" --body "$HOME/ai-translator-staging/body.json" --out "$HOME/ai-translator-staging/models/models.json"
```

Expected: `Đã ký …/models.json: kid stg-2026-10-1, sequence 1.`

- [ ] **Step 5 (người hoặc agent có token): Upload.** Cấu trúc trên bucket theo trường `url` của manifest: `models.json` và `NOTICE.txt` ở gốc; `whisper/…`, `hy-mt2/…`, `silero-vad/…`. Ví dụ với `wrangler` (đã `wrangler login`):

```bash
cd "$HOME/ai-translator-staging/models"
B=ai-translator-models-staging
pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/models.json" --file models.json --remote
pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/NOTICE.txt" --file NOTICE.txt --remote
for f in ggml-large-v3-turbo-q5_0.bin ggml-small-q5_1.bin whisper-LICENSE.txt whisper.cpp-LICENSE.txt; do pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/whisper/$f" --file "$f" --remote; done
for f in Hy-MT2-1.8B-Q8_0.gguf Hy-MT2-1.8B-Q4_K_M.gguf Hy-MT2-LICENSE.txt; do pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/hy-mt2/$f" --file "$f" --remote; done
for f in silero_vad_v6.2.3.onnx silero-vad-LICENSE.txt; do pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/silero-vad/$f" --file "$f" --remote; done
```

`wrangler r2 object put` có giới hạn kích thước một lần upload; nếu file Q8_0 (1,9 GB) bị từ chối thì upload bằng dashboard hay `rclone` với API token R2 của Step 1.

Expected: `curl -sI <URL gốc>/models.json` và `curl -sI -H 'Range: bytes=0-0' <URL gốc>/hy-mt2/Hy-MT2-1.8B-Q8_0.gguf` lần lượt trả `200` và `206` (R2 hỗ trợ `Range`).

- [ ] **Step 6: Ghi URL staging vào app.** Sửa `src-tauri/src/models/source.rs`: `pub const STAGING_URL: Option<&str> = Some("<URL gốc>/models.json");`. Chạy `cargo test -p meeting-translator --lib models::` (Expected: mọi test qua; test `dev_builds_read_staging_or_the_env_and_release_builds_production` tự theo hằng mới).
- [ ] **Step 7 (người): Thử thật trên Mac** với `pnpm tauri dev` (bản dev nhận khóa staging), từ một hồ sơ app sạch (đổi tên tạm `~/Library/Application Support/com.aitranslator.desktop/models` nếu có):
  - Lần đầu mở: bước 2 hiện máy (RAM, ổ trống), hai gói với "khoảng 2,5 GB" và "khoảng 1,3 GB", gói Chuẩn có nhãn "Đề xuất cho máy này" (máy 16 GB trở lên).
  - Bước 3 tự tải; bấm Tạm dừng rồi Tiếp tục: tải tiếp, không tải lại từ đầu (log của app ghi request có `Range`).
  - Rớt mạng thật: tắt Wi-Fi giữa lúc tải khoảng 20 giây rồi bật lại: tải tiếp; tắt quá lâu thì báo lỗi kèm nút Tiếp tục, bấm thì tải tiếp từ chỗ dừng.
  - Tải xong: bấm Bắt đầu ở màn hình chính dịch được, dùng model trong `~/Library/Application Support/com.aitranslator.desktop/models`.
  - Cài đặt › Model: hiện gói đang dùng, dung lượng; đổi sang gói Nhẹ (tải, tự dùng); xóa gói Chuẩn.
  - Ký lại manifest với `--sequence 2` sau khi đổi một ghi chú; ngày hôm sau mở app (hay xóa `state.json` trong thư mục model để giả qua một ngày): manifest mới được nhận; đổi một file model trên bucket thì app hỏi "Có bản mới…" chứ không tự tải.
  - Sửa một byte của `models.json` trên bucket: app báo "Danh sách model từ máy chủ không hợp lệ", vẫn dùng bản cũ.
  - Cài đặt › Quyền riêng tư › "Xóa model và dữ liệu": thư mục model biến mất; Keychain không bị đụng tới (06 kiểm thêm, Q14).
  Ghi kết quả vào mục "Kết quả thử" ở cuối file này.
- [ ] **Step 8: Commit**

```bash
git add src-tauri/keys/manifest-public-keys.json src-tauri/src/models/source.rs
git commit -m "feat(models): khóa công khai và URL manifest staging (04 T13)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 14: Đợt Windows (cần máy Windows và người)

Dòng 105, 161, 228, 303. Làm trong đợt Windows của kế hoạch 00 (mục 3), sau 02c Task 9.

- [ ] **Step 1:** `cargo test -p meeting-translator --lib models::` trên Windows: mọi test qua, kể cả `machine::tests` (RAM, ổ trống thật của Windows; test `this_mac_reports_ram_disk_and_cpu` chỉ đúng trên Mac thì đánh dấu lại cho Windows theo kết quả, ghi vào đây). Lần đầu chạy, tường lửa Windows có thể hỏi về server giả trên `127.0.0.1`: chọn không cho phép mạng ngoài, test vẫn chạy vì chỉ dùng loopback.
- [ ] **Step 2:** `pnpm tauri dev` trên máy có card rời 6 GB và máy card 4 GB (hay một máy, đổi ngưỡng trong manifest staging): bước 2 hiện tên card, bộ nhớ đồ họa, đề xuất đúng gói (6 GB: Chuẩn; 4 GB: Nhẹ). Máy chỉ có GPU tích hợp: gói Nhẹ. Ghi heap `DEVICE_LOCAL` báo được của từng card (để chốt ngưỡng 5 632 MiB, C7).
- [ ] **Step 3:** Model nằm ở `%LOCALAPPDATA%\com.aitranslator.desktop\models` (không phải `%LOCALAPPDATA%\AI Translator`). Tải bản cập nhật gói đang dùng khi tiến trình phụ đang chạy sẵn (vừa mở cửa sổ chính): tiến trình phụ được tắt trước, đổi tên đè thành công.
- [ ] **Step 4:** Chọn gói Chuẩn trên card 4 GB: `llama-server` tự chuyển bớt lớp sang CPU, không lỗi hết bộ nhớ (dòng 303, cùng 08).
- [ ] **Step 5:** Máy không có AVX2 (máy ảo tắt AVX2 nếu có): bước 2 báo máy chưa được hỗ trợ.

## Task 15: Cập nhật kế hoạch 00

Task 2 của kế hoạch 00, cho kế hoạch 04:
- Trạng thái các dòng ở mục "Dòng của bảng đối chiếu" của 04a: `xong` kèm SHA commit cho phần đã có test; `chờ` cho phần chờ Task 13 (T4, T7), Task 14 (Windows), C6, C7; dòng 226 giữ cho CDA (Q15).
- Mục 2.4: trạng thái "đã làm trên Mac tới Task 12", SHA; ghi "Nhận từ 04" cho 06 (gói, `ModelService::resolve` không đụng kho khóa; "Xóa model và dữ liệu" không đụng kho khóa) và cho 07 (QĐ5: TLS của updater; khóa và URL production của manifest; bộ gỡ Windows xóa `%LOCALAPPDATA%\com.aitranslator.desktop`); "Nhận từ 04" cho 03 nếu 03 làm sau (QĐ13).
- Mục 6.2: thêm `node --test scripts/models/manifest.test.mjs`.
- Spec §6.7: soạn đề xuất sửa theo QĐ2 (gửi chủ dự án, không tự sửa).

## Kết quả thử

Điền sau Task 13 (Mac, staging thật) và Task 14 (Windows): ngày, máy, kết quả từng gạch đầu dòng, và mọi chỗ lệch so với Expected.
