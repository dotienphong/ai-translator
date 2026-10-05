# Giai đoạn 1 · 04b: Quản lý model — nối vào app và giao diện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Phần cuối của kế hoạch 04 (mục 2.4 của kế hoạch 00): nối phần lõi của 04a vào app và giao diện. Gồm:
- `modelTier` là mã gói của manifest, chỉ đổi qua lệnh của quản lý model;
- dịch vụ model (`ModelService`): manifest đã nhận, việc tải chạy nền, sự kiện `models://state`, 9 lệnh cho cửa sổ chính, kiểm manifest lúc khởi động tối đa mỗi ngày một lần, hỏi trước khi tải bản mới; máy chưa được hỗ trợ hay ổ không đủ chỗ thì không cho tải;
- phiên dịch lấy model và ngưỡng của pipeline từ kho model; model hỏng thì băm lại; đổi gói trong lúc dịch không chạy hai bộ tiến trình phụ (ghi chú 8 của review cuối 02);
- giao diện: bước 2–3 của lần đầu mở (§4.1), Cài đặt › Model, nút "Xóa model và dữ liệu", lời mời cập nhật, tiến độ tải;
- kiểm tra chuẩn; bucket R2 staging (người); đợt Windows; cập nhật kế hoạch 00.

**Kiến trúc:**
- `ModelService` là trạng thái quản lý của app (`Arc<ModelService>`), giữ phần thay được trong test ở `Config` (thư mục, URL, khóa, cấu hình máy, dung lượng trống, đồng hồ). App thật dùng `Config::live`; app giả (`mock_app_full`) dùng thư mục tạm, khóa test, Mac 16 GB, đồng hồ giả.
- Test của dịch vụ chạy app bằng `MockRuntime` với ACL thật và gọi lệnh như giao diện gọi, cùng server HTTP giả của 04a (có lỗi giả "mạng chậm" để test tạm dừng và bận): không mạng, không mở cửa sổ.
- Mọi lệnh của quản lý model chạy ngoài luồng chính (`async` + `spawn_blocking`, hay luồng tải riêng).
- Giao diện: store Zustand riêng cho model (`src/store/models.ts`), hàm thuần trong `src/lib/models.ts`, test bằng vitest; component mỏng, chỉ đọc store.

**Công nghệ:** Như 04a (bảng "Phiên bản đã chốt" của 04a). Không thêm crate hay gói npm nào.

Đọc trước 04a (`docs/superpowers/plans/2026-10-02-giai-doan-1-04a-quan-ly-model-loi.md`): các mục "Phiên bản đã chốt", "Cách đọc kế hoạch này", "Task → commit tham chiếu", "Dòng của bảng đối chiếu", "Quyết định", "Điểm cần chủ dự án quyết", "Nối với kế hoạch 03", "Đã sửa theo review lần 1" áp cho file này. Làm file này sau khi 04a đã commit hết.

## Quyết định (tiếp theo QĐ1–QĐ12 của 04a)

- **QĐ13. Phần "dữ liệu" của "Xóa model và dữ liệu".** Lệnh `delete_models_and_data` xóa thư mục model rồi gọi `data::clear_all_data` của 03 (lịch sử, bản chép lời, từ điển, file DB không đọc được và journal), cùng việc với nút "Xóa toàn bộ dữ liệu". Xóa model bị từ chối (đang dịch, đang tải) thì không xóa dữ liệu. Xong thì cửa sổ chính bật `dataCleared` như nút của 03, nên bản chép lời, lịch sử và từ điển đang hiện bị bỏ. Bản quyền và bộ đếm hạn mức trong kho khóa không bị đụng tới (Q14).
- **QĐ14. Tải xong một gói thì gói đó thành gói đang dùng.** Lý do duy nhất để tải một gói khác là đổi sang gói đó (§4.3: "gói đang dùng, dung lượng, tải lại hoặc xóa"). Gói đã tải thì đổi bằng nút "Dùng gói này" (`select_model_pack`).
- **QĐ15. Gói mới dùng từ phiên sau; không chạy hai bộ tiến trình phụ** (ghi chú 8 của review cuối 02, Q4 của review lần 1). `modelTier` không sửa được qua `update_settings` (Task 7). Lần chạy sẵn khi mở cửa sổ chính (`prewarm`) không làm gì khi phiên đang bắt đầu hay đang chạy; chỉ lần bắt đầu phiên mới dựng bộ tiến trình phụ theo gói mới. Đang dịch bằng một gói thì không tải bản cập nhật đè lên nó và không xóa nó (`modelsInUse`). **Đang tải bản cập nhật của gói đang dùng thì không bắt đầu phiên được** (`modelsBusy`; chủ dự án quyết 2026-10-02). Tải một gói khác trong lúc dịch vẫn được. Luật này nằm ở `ModelService::begin_session`: `session::start_with` (mọi đường bắt đầu phiên: nút, khay, phím tắt, bước Nghe thử) đặt `Starting` bên trong nó, dưới khóa của dịch vụ, cùng khóa mà việc tải, xóa, kiểm giữ lúc kiểm "đang dịch" rồi bắt đầu; nên hoặc phiên bị từ chối, hoặc việc kia bị từ chối, không bao giờ cả hai cùng chạy (Q-A của review lần 2). `prewarm` cũng không chạy khi đang có việc như vậy, và lần chuẩn bị luôn gọi `ModelService::resolve`, kể cả khi tiến trình phụ đang chạy. Lần bắt đầu phiên chờ lần chạy sẵn đang nạp dở xong rồi mới chuẩn bị, để không có hai bộ tiến trình phụ cùng nạp khi người dùng vừa đổi gói (N-9 của review lần 2).
- **QĐ16. Tắt tiến trình phụ rảnh trước khi xóa hay tải đè model** (`SessionDeps::release_models`): Windows không cho đổi tên đè hay xóa file đang mở. Với việc tải, lệnh tắt chạy ở đầu luồng tải, không ở lệnh: tắt có thể phải chờ lần nạp model đang dở tới vài chục giây (Q2 của review lần 1). `session::release_models` chờ lần chạy sẵn đang nạp dở xong (tối đa 180 giây) rồi mới tắt; nếu không, lần chạy sẵn còn chạy `llama-server` sau lần tắt (Q-A của review lần 2).
- **QĐ17. Model nạp lỗi (`modelBroken`) thì băm lại cả gói trên luồng nền**; file sai SHA-256 bị xóa, gói hiện "chưa tải" và người dùng tải lại (§9). Lúc bắt đầu phiên chỉ kiểm có file và đúng kích thước; sai kích thước là `modelBroken`. Nút "Kiểm tra và tải lại" ở Cài đặt › Model cũng băm lại rồi chỉ tải phần thiếu hay hỏng, không xóa gói đang dùng trước (lệnh `verify_models`, N7 của review lần 1).
- **QĐ18. "Xóa model và dữ liệu" bỏ gói đang dùng (`modelTier` thành `null`) nhưng không đưa app về lần đầu mở** (chủ dự án đồng ý 2026-10-02). Xóa hết file trong thư mục model, nhưng ghi lại `manifest.json` (mốc chống quay lui về manifest cũ, N3 của review lần 1); manifest vẫn giữ trong bộ nhớ để tải lại được ngay. Xác nhận hai bước ngay trong app (không dùng `window.confirm`).
- **QĐ19. Bước 3 tự bắt đầu tải gói đã chọn** khi vào bước (`shouldAutoDownload`): gói chưa đủ, tải được, và không có việc tải nào đang chạy hay đang dừng giữa chừng của chính gói đó. Người dùng quay lại chọn gói khác trong lúc một gói đang tải thì bước 3 mời tạm dừng gói đó (N6 của review lần 1). Windows chưa dò xong GPU (`gpuKnown = false`) mà người dùng chưa tự chọn gói thì chờ kết quả dò rồi mới tự tải: gói chọn sẵn lúc đó chưa tính card rời (N-12 của review lần 2). Người dùng đi tiếp được trong lúc model tải ở nền; tiến độ hiện ở màn hình chính. Mở lại app không tự tải tiếp; Cài đặt › Model và màn hình chính có nút Tiếp tục.
- **QĐ20. Dung lượng hiển thị theo đơn vị thập phân** (GB = 10⁹ byte), như spec ghi "khoảng 2,5 GB"; tiếng Việt dùng dấu phẩy thập phân.
- **QĐ21. Máy chưa được hỗ trợ, gói cần app mới hơn, ổ không đủ chỗ thì không tải** (04a QĐ8). Phía Rust từ chối lệnh tải (`modelsUnsupported` với lý do `lowRam` hay `noAvx2`, `modelsAppTooOld`, `modelsNoSpace`); `PackView.enoughSpace` cho giao diện biết gói nào không vừa ổ; giao diện báo lý do (`downloadBlock`) và khóa nút tải.
- **QĐ22. Bộ tiến trình phụ nhận dạng bằng `sidecar::SidecarKey`**: gói, ba file model, ngưỡng của giám sát và của hai tiến trình phụ (Q-B của review lần 2). Bản cập nhật cùng mã gói có thể đổi tên file hay ngưỡng; so cả khóa này thì lần chuẩn bị sau dựng bộ mới, bộ cũ tắt khi không còn phiên nào dùng. Tính khóa chỉ kiểm có file và kích thước, nên lần chuẩn bị nào cũng tính.
- **QĐ23. Xóa và kiểm gói chạy dưới một trạng thái của dịch vụ** (`maintenance`, đặt bằng `begin_work` dưới khóa, cùng lúc kiểm "đang dịch", "đang tải"; N-10 của review lần 2). Trong lúc đó không tải được; nếu việc đụng gói đang dùng thì cũng không bắt đầu phiên và không chạy sẵn tiến trình phụ.

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
diff --git a/src-tauri/src/settings/mod.rs b/src-tauri/src/settings/mod.rs
index bacb7578c1482b83cb027aac3ae92b4c5bd7200b..8245ccb483090f02b01ccec614a5f0fe99bc0f94 100644
--- a/src-tauri/src/settings/mod.rs
+++ b/src-tauri/src/settings/mod.rs
@@ -531,4 +531,29 @@ mod tests {
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
diff --git a/src-tauri/src/settings/patch.rs b/src-tauri/src/settings/patch.rs
index 13825fb866b8250cb18365d29408e49e8d8dd861..54ade32ff6bd7049a569764e5befa5384a72cfb8 100644
--- a/src-tauri/src/settings/patch.rs
+++ b/src-tauri/src/settings/patch.rs
@@ -240,4 +240,8 @@ mod tests {
             Err(Invalid::new("revision", Reason::ReadOnly))
         );
+        assert_eq!(
+            apply(&current(), &json!({ "modelTier": "lite" })),
+            Err(Invalid::new("modelTier", Reason::ReadOnly))
+        );
     }
 
```

Sửa `src-tauri/src/sidecar/paths.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/sidecar/paths.rs b/src-tauri/src/sidecar/paths.rs
index 7eef8a1a0e991b5453447673f985edab6335981d..7d925aec7056de9cdfabed811c33edc991b72df4 100644
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
diff --git a/src-tauri/src/settings/mod.rs b/src-tauri/src/settings/mod.rs
index 8245ccb483090f02b01ccec614a5f0fe99bc0f94..f994e1cc1940cc889f2b760fa1be45ebecc81c23 100644
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
@@ -189,5 +181,7 @@ pub struct Settings {
     pub vad_end_silence_ms: u32,
     pub overlay: OverlaySettings,
-    pub model_tier: Option<ModelTier>,
+    /// Gói model đang dùng (§6.7): mã gói trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest, Đ7).
+    /// `None` là chưa có gói nào. Chỉ đổi qua lệnh của kế hoạch 04 (gói phải đã tải xong).
+    pub model_tier: Option<String>,
     pub hotkeys: Hotkeys,
     pub save_history: bool,
@@ -302,4 +296,13 @@ impl Settings {
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
diff --git a/src-tauri/src/settings/patch.rs b/src-tauri/src/settings/patch.rs
index 54ade32ff6bd7049a569764e5befa5384a72cfb8..7a002def657db07cc82852816574b0e1bd134c8f 100644
--- a/src-tauri/src/settings/patch.rs
+++ b/src-tauri/src/settings/patch.rs
@@ -13,5 +13,6 @@ use super::{Invalid, Reason, Settings};
 /// - `overlay.locked`: phải đổi cửa sổ sang click xuyên qua (lệnh `set_overlay_locked`);
 /// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển;
-/// - `revision`: số thứ tự do `AppState` đặt.
+/// - `revision`: số thứ tự do `AppState` đặt;
+/// - `modelTier`: gói phải đã tải xong (lệnh `select_model_pack`, `download_models` của kế hoạch 04).
 const READ_ONLY: &[&str] = &[
     "hotkeys",
@@ -20,4 +21,5 @@ const READ_ONLY: &[&str] = &[
     "overlay.lastMonitor",
     "revision",
+    "modelTier",
 ];
 
```

Sửa `src-tauri/src/sidecar/paths.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/sidecar/paths.rs b/src-tauri/src/sidecar/paths.rs
index 7d925aec7056de9cdfabed811c33edc991b72df4..f79b26a216ad36331cd86a2474172e6a1473658b 100644
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
diff --git a/src-tauri/src/sidecar/mod.rs b/src-tauri/src/sidecar/mod.rs
index 3b26445d0ef5f6e1cd86808c72e69786b2fe3f66..b34964edcbac90458ac999f7f229f71cb0fb9694 100644
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
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index 253e10e4490031252d65c8129620ff4ce7dc7eef..969bd8ef8ec0b389a7e3b37adeb71d9c1753a77f 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -37,5 +37,5 @@ use crate::debug::{DebugLog, DebugSession};
 use crate::errors::{self, CommandError};
 use crate::glossary::{self, ActiveGlossary};
-use crate::settings::{AudioSource, Lang, ModelTier, Settings};
+use crate::settings::{AudioSource, Lang, Settings};
 use crate::sidecar::{self, first_run, integrity};
 use crate::state::{AppState, AppStatus, Loading, SessionStatus};
@@ -695,5 +695,5 @@ impl<R: Runtime> SidecarEvents for StatusEvents<R> {
 struct Live {
     manager: Arc<SidecarManager>,
-    tier: Option<ModelTier>,
+    tier: Option<String>,
     vad_model: PathBuf,
 }
```

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/ipc.ts b/src/lib/ipc.ts
index d6a23b669026f8a3f2751f73ad7c0be58cc65607..f1bc60755217bbd1c24a87a3ca1b12a666950fa1 100644
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -14,3 +14,4 @@ export type Theme = "system" | "light" | "dark";
 export type UpdateChannel = "stable" | "beta";
-export type ModelTier = "standard" | "lite";
+// Mã gói model trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest).
+export type ModelTier = string;
 export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock";
@@ -65,4 +66,5 @@ export interface Settings {
 // Bản sửa gửi cho `update_settings`. Không có `hotkeys` (dùng `set_hotkey`), `overlay.locked`
-// (dùng `set_overlay_locked`), `overlay.positions`, `overlay.lastMonitor` và `revision` (chỉ phía Rust ghi).
-export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental" | "revision">> & {
+// (dùng `set_overlay_locked`), `overlay.positions`, `overlay.lastMonitor` và `revision` (chỉ phía Rust ghi), `modelTier`
+// (lệnh của quản lý model).
+export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental" | "revision" | "modelTier">> & {
   overlay?: Partial<Omit<Settings["overlay"], "locked" | "positions" | "lastMonitor">>;
```

- [ ] **Step 4: Chạy test**

Run: `cargo test -p meeting-translator --lib -- settings:: sidecar:: 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 225 filtered out; finished in 0.35s
```

Run: `pnpm build 2>&1 | grep -E 'error|built in' | sed -E 's/ in [0-9]+ms//'; pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '`

Expected (lúc lập kế hoạch):

```text
✓ built
 Test Files  10 passed (10)
      Tests  98 passed (98)
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

Dòng 20, 33, 36, 37, 53, 57, 160, 161, 163, 223, 233, 246; QĐ9, QĐ13–QĐ18, QĐ21, QĐ23:
- `models/service.rs`: `ModelService` (đọc manifest đã lưu, tải manifest khi chưa có hay đã quá một ngày, tải gói trên luồng riêng, tiến độ tối đa 4 lần mỗi giây, tạm dừng, dùng gói đã tải, xóa gói, xóa hết mà giữ `manifest.json`, kiểm và băm lại một gói, "Để sau", file model cho phiên, băm lại khi nạp lỗi, ngưỡng pipeline), `check_on_startup`, `changed`. Từ chối tải khi máy chưa được hỗ trợ, gói cần app mới hơn, ổ không đủ chỗ; kiểm phiên đang chạy dưới khóa của dịch vụ (N5 của review lần 1). `begin_session` cho lần bắt đầu phiên, `begin_work` cho xóa và kiểm (QĐ15, QĐ23).
- `models/commands.rs`: 9 lệnh, chỉ cửa sổ `main` (§10.2); "Xóa model và dữ liệu" gọi `data::clear_all_data` của 03 (QĐ13): `get_models_state`, `load_models`, `download_models`, `pause_models_download`, `select_model_pack`, `delete_models`, `delete_models_and_data`, `dismiss_models_update`, `verify_models`. Lệnh có thể chặn (mạng, đĩa, cấu hình máy) là `async` và chạy trên `spawn_blocking`, kể cả `download_models` (Q2 của review lần 1).
- Mã lỗi mới (`errors.rs`) và câu báo lỗi vi/en (test `every_error_code_has_ui_text` và test i18n giữ chúng khớp).
- `actions.rs`: `set_model_tier`; `session.rs`: `release_models` (chờ lần chạy sẵn đang nạp dở), `start_with` bắt đầu phiên qua `ModelService::begin_session`, `prewarm` không chạy khi `busy()` (Q-A của review lần 2); `lib.rs`: quản lý dịch vụ và kiểm manifest lúc khởi động; `test_support.rs`: app giả có dịch vụ model (`mock_app_full`, `models_config`), `FakeDeps` đếm số lần `release_models`.

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

Test của dịch vụ chạy app giả với server HTTP giả của 04a: manifest ký bằng khóa test, nội dung file theo `store::tests::content`. Chúng kiểm:
- tải manifest và đề xuất gói; kiểm tối đa mỗi ngày một lần; không có nguồn; manifest bị sửa, cũ hơn hay mất mạng thì giữ bản cũ;
- tải xong thì gói thành gói đang dùng; tải lỗi rồi tải tiếp bằng `Range`; sai SHA-256; đủ dung lượng trống, và gói không vừa ổ được đánh dấu;
- tạm dừng rồi tiếp tục, lần sau gửi `Range` (lỗi giả "mạng chậm" giữ việc tải đủ lâu);
- đang tải thì lệnh tải, xóa gói, xóa hết, kiểm gói đều trả `modelsBusy`;
- tải bản cập nhật gói đang dùng: `toggle_session` trả `modelsBusy` và không chuẩn bị tiến trình phụ, tiến trình phụ được tắt đúng một lần; xóa gói đang dùng, xóa hết: mỗi việc tắt một lần;
- lần chạy sẵn đang nạp dở: việc tải đè chờ nó xong rồi mới tắt, và lần chạy sẵn mới không chạy trong lúc tải đè; trong lúc xóa (đang chờ lần chạy sẵn), không bắt đầu phiên và không tải được (Q-A, N-10 của review lần 2);
- gói cần app mới hơn bị từ chối; máy chưa được hỗ trợ (RAM thấp, không AVX2) bị từ chối, không request nào tới file model;
- bản cập nhật được hỏi chứ không tự tải, "Để sau"; bản mới đổi tên file thì file cũ bị dọn; không đè hay xóa gói đang dịch;
- xóa gói và xóa hết (chỉ còn `manifest.json`; từ điển của 03 cũng bị xóa); "Kiểm tra và tải lại" chỉ tải file hỏng; băm lại khi model hỏng.

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index c8a521804700ce5229620ce8ba1a74728578603e..291bba34341395f74703f3d23b2dd699010f9c0b 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -173,2 +173,14 @@ mod tests {
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
+                MODELS_UNSUPPORTED,
             ]
```

Sửa `src-tauri/src/models/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/models/mod.rs b/src-tauri/src/models/mod.rs
index fdb6d89a8801241aadc81e0bf6e41316f9f826b2..89c107d81b1e1753f75ba00cbeed1a7fc08ff7ca 100644
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
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index 7151909e71c803394d92aed0f20d181a5c5256d4..89b6e566f2895a4f19a448edfe3766a5f19220b8 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -6,3 +6,3 @@ use std::ops::ControlFlow;
 use std::path::PathBuf;
-use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
+use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
 use std::sync::{Arc, Condvar, Mutex};
@@ -28,2 +28,6 @@ use crate::glossary::ActiveGlossary;
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
+use crate::models::download::Retry;
+use crate::models::machine::Machine;
+use crate::models::manifest::Os;
+use crate::models::service::{Config as ModelsConfig, ModelService};
 use crate::overlay::placement::{Edge, Frame, Screen};
@@ -288,2 +292,4 @@ pub struct FakeDeps {
     pub capture_events: Arc<Mutex<Vec<OnEvent>>>,
+    /// Số lần `release_models` được gọi (tắt tiến trình phụ rảnh trước khi xóa hay tải đè model, kế hoạch 04).
+    pub releases: Arc<Mutex<usize>>,
     /// Số lần `shutdown` và `kill_all` được gọi.
@@ -429,2 +435,6 @@ impl SessionDeps for FakeDeps {
 
+    fn release_models(&self) {
+        *self.releases.lock().unwrap() += 1;
+    }
+
     fn shutdown(&self) {
@@ -445,3 +455,41 @@ pub fn mock_app() -> tauri::App<MockRuntime> {
 
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
@@ -494,2 +542,3 @@ pub fn mock_app_with(deps: FakeDeps) -> tauri::App<MockRuntime> {
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
    use sha2::Digest;
    use tauri::Listener;
    use tauri::test::MockRuntime;

    use crate::models::signed::tests::signed_with_test_key;
    use crate::models::store::tests::{content, real_sample};
    use crate::models::test_http::{FakeServer, Fault};
    use crate::test_support::{FakeDeps, MODELS_NOW, PrepareGate, invoke, mock_app_full, models_config, window};

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
        harness_with(FakeDeps::default(), change)
    }

    fn harness_with(deps: FakeDeps, change: impl FnOnce(&mut Config)) -> Harness {
        let server = FakeServer::start();
        publish(&server, &real_sample());
        let clock = Arc::new(AtomicU64::new(MODELS_NOW));
        let mut cfg = models_config(Some(server.url("models.json")), clock.clone());
        change(&mut cfg);
        let app = mock_app_full(deps, cfg);
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
        assert!(
            busy(h.call("verify_models", json!({ "pack": "lite" }))),
            "không băm lại gói đang dịch"
        );
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
        h.call(
            "add_glossary_entry",
            json!({ "source": "sprint", "target": "đợt chạy" }),
        )
        .unwrap();
        let view = h.call("delete_models_and_data", json!({})).unwrap();
        assert_eq!(
            h.call("list_glossary", json!({})).unwrap(),
            json!([]),
            "phần dữ liệu xóa bằng hàm của 03"
        );
        let left: Vec<String> = std::fs::read_dir(h.dir())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            left,
            ["manifest.json"],
            "chỉ còn manifest, mốc chống quay lui (N3 của review 04)"
        );
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

    /// Gói Nhẹ với file nhận dạng lớn hơn (2 000 byte), để tải chậm đủ lâu cho test tạm dừng và bận.
    fn slow_sample() -> Value {
        let mut body = real_sample();
        let small = &mut body["files"][1];
        small["bytes"] = 2_000.into();
        let sha = sha2::Sha256::digest(content("whisper-small", 2_000));
        small["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        body
    }

    fn slow_harness(deps: FakeDeps) -> Harness {
        let h = harness_with(deps, |_| {});
        publish(&h.server, &slow_sample());
        h.call("load_models", json!({})).unwrap();
        h
    }

    /// Chờ tới khi việc tải đã nhận được dữ liệu.
    fn wait_progress(h: &Harness) {
        let started = Instant::now();
        while h.call("get_models_state", json!({})).unwrap()["job"]["doneBytes"] == 0 {
            assert!(started.elapsed() < Duration::from_secs(10), "không có tiến độ");
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    /// §4.1 bước 3: tạm dừng rồi tải tiếp, từ chỗ đã dừng.
    #[test]
    fn pause_then_resume_continues_with_range() {
        let h = slow_harness(FakeDeps::default());
        h.server.fault(Fault::Slow(100));
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        wait_progress(&h);
        h.call("pause_models_download", json!({})).unwrap();
        let paused = h.wait("paused");
        assert_eq!(h.model_tier(), Value::Null);
        let kept = paused["packs"][1]["partialBytes"].as_u64().unwrap();
        assert!((1..2_000).contains(&kept), "{kept}");
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let ranges: Vec<_> = h
            .server
            .requests()
            .into_iter()
            .filter(|r| r.path.ends_with("ggml-small-q5_1.bin"))
            .map(|r| r.range)
            .collect();
        assert_eq!(ranges, [None, Some(format!("bytes={kept}-"))]);
        assert_eq!(h.model_tier(), "lite");
    }

    /// Đang tải thì không tải thêm, không xóa gói, không xóa hết (hai luồng không ghi cùng một file).
    #[test]
    fn nothing_else_runs_while_downloading() {
        let h = slow_harness(FakeDeps::default());
        h.server.fault(Fault::Slow(100));
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        let busy = |r: Result<Value, String>| r.unwrap_err().contains("\"code\":\"modelsBusy\"");
        assert!(busy(h.call("download_models", json!({ "pack": "standard" }))));
        assert!(busy(h.call("download_models", json!({ "pack": "lite" }))));
        assert!(busy(h.call("delete_models", json!({ "pack": "standard" }))));
        assert!(busy(h.call("delete_models_and_data", json!({}))));
        assert!(busy(h.call("verify_models", json!({ "pack": "lite" }))));
        h.wait("done");
    }

    /// Bản cập nhật của gói `standard` (đang dùng): file `whisper-turbo` cùng tên, khác nội dung, tải chậm.
    fn publish_update_of_standard(h: &Harness) {
        let mut newer = slow_sample();
        newer["sequence"] = 4.into();
        let turbo = &mut newer["files"][0];
        turbo["bytes"] = 2_000.into();
        let sha = sha2::Sha256::digest(content("whisper-turbo", 2_000));
        turbo["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        publish(&h.server, &newer);
        h.tick_days(1);
        h.call("load_models", json!({})).unwrap();
        h.server.fault(Fault::Slow(100));
    }

    /// `toggle_session` như giao diện gọi, nhưng có hạn: code sai có thể làm lần bắt đầu phiên chờ mãi (lần chạy sẵn bị
    /// chặn ở cổng của test), khi đó test đỏ thay vì treo.
    fn toggle_within(h: &Harness) -> Result<Value, String> {
        let (main, (tx, rx)) = (h.main(), std::sync::mpsc::channel());
        std::thread::spawn(move || tx.send(invoke(&main, "toggle_session", json!({}))));
        rx.recv_timeout(Duration::from_secs(10))
            .expect("toggle_session không trả về")
    }

    fn wait_for(what: &str, done: impl Fn() -> bool) {
        let started = Instant::now();
        while !done() {
            assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    /// Đang tải bản cập nhật của gói đang dùng: không bắt đầu phiên (QĐ15, chủ dự án quyết 2026-10-02), kiểm qua đường
    /// bắt đầu phiên thật (`toggle_session`, Q-A của review 04 lần 2); trước khi tải, tiến trình phụ đang rảnh được tắt
    /// để nhả file (QĐ16).
    #[test]
    fn updating_the_pack_in_use_blocks_sessions_and_releases_models() {
        let deps = FakeDeps::default();
        let (releases, prepares) = (deps.releases.clone(), deps.prepares.clone());
        let h = harness_with(deps, |_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        assert_eq!(*releases.lock().unwrap(), 0, "tải gói mới không cần tắt gì");
        publish_update_of_standard(&h);
        let started = h.call("download_models", json!({ "pack": "standard" })).unwrap();
        assert_eq!(started["job"]["replacesInUse"], true);
        let refused = toggle_within(&h).unwrap_err();
        assert!(refused.contains("\"code\":\"modelsBusy\""), "{refused}");
        assert_eq!(
            *prepares.lock().unwrap(),
            0,
            "không chuẩn bị tiến trình phụ trong lúc tải đè"
        );
        let busy = h.service().resolve(Some("standard")).unwrap_err();
        assert_eq!(
            busy.code,
            errors::MODELS_BUSY,
            "lần chạy sẵn đã qua cổng thì dừng ở resolve, không nạp tiếp"
        );
        h.wait("done");
        assert_eq!(*releases.lock().unwrap(), 1);
        assert_eq!(h.call("toggle_session", json!({})).unwrap()["session"], "running");
        h.call("toggle_session", json!({})).unwrap();
        h.call("delete_models", json!({ "pack": "standard" })).unwrap();
        assert_eq!(*releases.lock().unwrap(), 2, "xóa gói đang dùng");
        h.call("delete_models_and_data", json!({})).unwrap();
        assert_eq!(*releases.lock().unwrap(), 3, "xóa hết");
    }

    /// Q-A của review 04 lần 2: lần chạy sẵn đang nạp dở thì việc tải đè chờ nó xong rồi mới tắt tiến trình phụ (nếu
    /// không, nó còn chạy `llama-server` sau lần tắt); trong lúc tải đè, lần chạy sẵn mới không chạy.
    #[test]
    fn an_update_waits_for_a_prewarm_in_progress_and_stops_new_ones() {
        let gate = Arc::new(PrepareGate::default());
        let deps = FakeDeps {
            prepare_gate: Some(gate.clone()),
            ..FakeDeps::default()
        };
        let (releases, prepares) = (deps.releases.clone(), deps.prepares.clone());
        let h = harness_with(deps, |_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        crate::session::prewarm(h.app.handle());
        wait_for("lần chạy sẵn tới prepare", || gate.waiting() == 1);
        publish_update_of_standard(&h);
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(*releases.lock().unwrap(), 0, "chờ lần chạy sẵn đang nạp");
        gate.open();
        wait_for("tắt tiến trình phụ", || *releases.lock().unwrap() == 1);
        assert_eq!(
            h.call("get_models_state", json!({})).unwrap()["job"]["state"],
            "downloading"
        );
        crate::session::prewarm(h.app.handle());
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(*prepares.lock().unwrap(), 1, "đang tải đè: không chạy sẵn");
        h.wait("done");
    }

    /// N-10 của review 04 lần 2: trong lúc xóa (có thể phải chờ lần chạy sẵn đang nạp dở), không bắt đầu phiên và không
    /// tải được.
    #[test]
    fn deleting_blocks_sessions_and_downloads_until_done() {
        let gate = Arc::new(PrepareGate::default());
        let deps = FakeDeps {
            prepare_gate: Some(gate.clone()),
            ..FakeDeps::default()
        };
        let h = harness_with(deps, |_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        crate::session::prewarm(h.app.handle());
        wait_for("lần chạy sẵn tới prepare", || gate.waiting() == 1);
        let (service, handle) = (h.service(), h.app.handle().clone());
        let deleting = std::thread::spawn(move || service.delete_all(&handle).map(|_| ()));
        wait_for("đang xóa", || h.service().busy());
        let busy = |r: Result<Value, String>| r.unwrap_err().contains("\"code\":\"modelsBusy\"");
        assert!(busy(toggle_within(&h)));
        assert!(busy(h.call("download_models", json!({ "pack": "standard" }))));
        gate.open();
        deleting.join().unwrap().unwrap();
        assert!(!h.service().busy());
    }

    #[test]
    fn a_pack_for_a_newer_app_is_refused() {
        let h = harness(|_| {});
        let mut body = real_sample();
        body["files"][1]["min_app_version"] = "9.0.0".into();
        publish(&h.server, &body);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["packs"][1]["appTooOld"], true);
        let refused = h.call("download_models", json!({ "pack": "lite" })).unwrap_err();
        assert!(refused.contains("\"code\":\"modelsAppTooOld\""), "{refused}");
    }

    /// Chủ dự án quyết 2026-10-02: máy chưa được hỗ trợ thì không cho tải model; phía Rust từ chối lệnh.
    #[test]
    fn an_unsupported_machine_cannot_download() {
        for (ram, avx2, reason) in [(4_096, true, "lowRam"), (16_384, false, "noAvx2")] {
            let h = harness(|cfg| {
                cfg.machine = Box::new(move |_| crate::models::machine::Machine {
                    os: crate::models::manifest::Os::Windows,
                    ram_mib: ram,
                    avx2,
                    gpus: Vec::new(),
                    gpu_known: true,
                })
            });
            let view = h.call("load_models", json!({})).unwrap();
            assert_eq!(view["verdict"], json!({ "kind": "unsupported", "reason": reason }));
            let refused = h.call("download_models", json!({ "pack": "lite" })).unwrap_err();
            assert_eq!(
                refused,
                json!({ "code": "modelsUnsupported", "field": reason, "message": "máy chưa được hỗ trợ" }).to_string()
            );
            assert!(h.server.requests().iter().all(|r| r.path == "/models.json"));
        }
    }

    #[test]
    fn packs_that_do_not_fit_on_disk_are_marked() {
        let h = harness(|cfg| cfg.free_disk = Box::new(|_| Some(DISK_MARGIN + 1_400)));
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["packs"][0]["enoughSpace"], false, "gói Chuẩn cần 2 430 byte");
        assert_eq!(view["packs"][1]["enoughSpace"], true);
    }

    /// Bản mới đổi tên file: tải xong thì file bản cũ bị dọn.
    #[test]
    fn an_update_with_a_new_file_name_removes_the_old_file() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        let q4 = &mut newer["files"][3];
        q4["file"] = "Hy-MT2-1.8B-Q4_K_M-v2.gguf".into();
        q4["url"] = "files/Hy-MT2-1.8B-Q4_K_M-v2.gguf".into();
        q4["bytes"] = 1_101.into();
        let sha = sha2::Sha256::digest(content("hy-mt2-q4", 1_101));
        q4["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        publish(&h.server, &newer);
        h.tick_days(1);
        assert_eq!(h.call("load_models", json!({})).unwrap()["updateAvailable"], true);
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        assert!(h.dir().join("Hy-MT2-1.8B-Q4_K_M-v2.gguf").exists());
        assert!(!h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf").exists(), "bản cũ đã dọn");
    }

    /// "Tải lại" (N7 của review 04): băm lại, chỉ file hỏng phải tải lại; gói đang dùng không bị xóa trước.
    #[test]
    fn verifying_keeps_good_files_and_drops_broken_ones() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let view = h.call("verify_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(view["packs"][1]["complete"], true);
        let path = h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf");
        let mut bytes = std::fs::read(&path).unwrap();
        bytes[3] ^= 1;
        std::fs::write(&path, bytes).unwrap();
        let view = h.call("verify_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(view["packs"][1]["missingBytes"], 1_100, "chỉ file hỏng");
        let before = h.server.requests().len();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let fetched: Vec<_> = h.server.requests()[before..].iter().map(|r| r.path.clone()).collect();
        assert_eq!(fetched, ["/files/Hy-MT2-1.8B-Q4_K_M.gguf"]);
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
error: could not compile `meeting-translator` (lib test) due to 50 previous errors; 1 warning emitted
error[E0407]: method `release_models` is not a member of trait `SessionDeps`
error[E0425]: cannot find type `Arc` in this scope
error[E0425]: cannot find type `Config` in this scope
error[E0425]: cannot find type `ModelService` in this scope
error[E0425]: cannot find type `Mutex` in this scope
error[E0425]: cannot find type `PathBuf` in this scope
error[E0425]: cannot find value `DISK_MARGIN` in this scope
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
use super::recommend::{self, Unsupported, Verdict};
use super::signed::{self, Signed, TrustedKey};
use super::source::{self, FetchError};
use super::store::{self, PackStatus, ResolveError, Store};
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
    /// Ổ còn đủ chỗ cho phần còn phải tải cộng 1 GB (§6.7). Không đọc được dung lượng trống thì coi là đủ.
    pub enough_space: bool,
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
    /// Đang xóa hay kiểm một gói (`Some(true)`: gói đang dùng); đặt dưới khóa này cùng lúc kiểm "đang dịch", "đang tải"
    /// (N-10 của review 04 lần 2).
    maintenance: Option<bool>,
    rev: u64,
}

impl Inner {
    /// Có việc đang đụng tới file của gói đang dùng: tải bản cập nhật đè lên nó, hay xóa hoặc kiểm nó. Trong lúc đó không
    /// bắt đầu phiên và không chạy sẵn tiến trình phụ (QĐ15, Q-A của review 04 lần 2).
    fn touches_in_use(&self) -> bool {
        (self.job.state == JobState::Downloading && self.job.replaces_in_use) || self.maintenance == Some(true)
    }
}

/// Việc xóa hay kiểm đang chạy; hủy thì hết (`ModelService::begin_work`).
struct Work<'a>(&'a ModelService);

impl Drop for Work<'_> {
    fn drop(&mut self) {
        self.0.lock().maintenance = None;
    }
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
                maintenance: None,
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
    /// Xem [`Inner::touches_in_use`].
    pub fn busy(&self) -> bool {
        self.lock().touches_in_use()
    }

    /// Bắt đầu phiên dịch: `begin` (đặt trạng thái `Starting`) chạy dưới khóa của dịch vụ, cùng khóa mà `download`,
    /// `delete`, `delete_all`, `verify` giữ lúc kiểm "đang dịch" rồi bắt đầu việc của chúng. Vì vậy hoặc phiên thấy việc
    /// đó và bị từ chối (`modelsBusy`), hoặc việc đó thấy phiên và bị từ chối (`modelsInUse`); không có trường hợp cả hai
    /// cùng chạy (Q-A của review 04 lần 2).
    pub fn begin_session<T>(&self, begin: impl FnOnce() -> T) -> Result<T, CommandError> {
        let inner = self.lock();
        if inner.touches_in_use() {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang cập nhật model"));
        }
        Ok(begin())
    }

    /// Bắt đầu một việc xóa hay kiểm, dưới khóa của dịch vụ: từ chối khi việc đụng gói đang dùng mà phiên đang bắt đầu
    /// hay đang chạy (`modelsInUse`), hay khi đang tải hoặc đang có việc khác (`modelsBusy`).
    fn begin_work<R: Runtime>(&self, app: &AppHandle<R>, in_use: bool) -> Result<Work<'_>, CommandError> {
        let mut inner = self.lock();
        if in_use && session_active(app) {
            return Err(CommandError::new(errors::MODELS_IN_USE, None, "đang dịch bằng gói này"));
        }
        if inner.job.state == JobState::Downloading || inner.maintenance.is_some() {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang tải"));
        }
        inner.maintenance = Some(in_use);
        Ok(Work(self))
    }

    /// Cấu hình máy, với kết quả dò GPU nếu đã có.
    fn machine<R: Runtime>(&self, app: &AppHandle<R>) -> Machine {
        let gpus = app
            .try_state::<crate::sidecar::GpuProbe>()
            .and_then(|p| p.get(Duration::ZERO))
            .map(|o| o.gpus);
        (self.cfg.machine)(gpus.as_deref())
    }

    /// Ổ có đủ chỗ cho gói không (phần còn phải tải cộng [`DISK_MARGIN`]).
    fn fits(&self, status: &PackStatus) -> Result<(), (u64, u64)> {
        let need = status.missing_bytes.saturating_sub(status.partial_bytes) + DISK_MARGIN;
        match (self.cfg.free_disk)(&self.cfg.dir) {
            Some(free) if !status.complete && free < need => Err((need, free)),
            _ => Ok(()),
        }
    }

    pub fn view<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.ensure_loaded();
        let machine = self.machine(app);
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
                            enough_space: self.fits(&status).is_ok(),
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
        // Máy chưa được hỗ trợ thì không cho tải (chủ dự án quyết 2026-10-02; spec §8).
        if let Verdict::Unsupported { reason } = recommend::recommend(&self.machine(app), &m.recommend) {
            let field = match reason {
                Unsupported::LowRam => "lowRam",
                Unsupported::NoAvx2 => "noAvx2",
            };
            return Err(CommandError::new(
                errors::MODELS_UNSUPPORTED,
                Some(field),
                "máy chưa được hỗ trợ",
            ));
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
        if let Err((need, free)) = self.fits(&status) {
            return Err(CommandError::new(
                errors::MODELS_NO_SPACE,
                None,
                format!("cần {need} byte, còn {free}"),
            ));
        }
        {
            let mut inner = self.lock();
            if inner.job.state == JobState::Downloading || inner.maintenance.is_some() {
                return Err(CommandError::new(errors::MODELS_BUSY, None, "đang tải"));
            }
            // Kiểm phiên dưới khóa của dịch vụ: phiên bắt đầu sau lúc này thì thấy `busy()` (N5 của review 04).
            if replaces_in_use && session_active(app) {
                return Err(CommandError::new(errors::MODELS_IN_USE, None, "đang dịch bằng gói này"));
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
        // Tải đè file của gói đang dùng: tắt tiến trình phụ đang rảnh trước (Windows không cho đổi tên đè file đang mở).
        // Chạy ở luồng tải, không ở lệnh: tắt có thể phải chờ lần nạp model đang dở (Q2 của review 04).
        if self.lock().job.replaces_in_use {
            session::release_models(app);
        }
        let result = (|| -> Result<(), &'static str> {
            let client = self.client().ok_or(errors::MODELS_DOWNLOAD_FAILED)?;
            std::fs::create_dir_all(self.store.dir()).map_err(|_| errors::MODELS_DISK)?;
            for entry in &todo {
                let file_url = source::file_url(url, entry).ok_or(errors::MODELS_MANIFEST_INVALID)?;
                let job = self.store.job(entry, file_url);
                let part = std::fs::metadata(job.part()).map(|m| m.len()).unwrap_or(0);
                let before = self.lock().job.done_bytes.saturating_sub(part);
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
        let work = self.begin_work(app, in_use)?;
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
        drop(work);
        Ok(self.changed(app))
    }

    /// "Xóa model và dữ liệu" (§4.3, A6): xóa cả thư mục model, bỏ gói đang dùng. Bản quyền và bộ đếm hạn mức trong
    /// kho khóa giữ nguyên (Q14). Manifest vẫn giữ trong bộ nhớ, để tải lại được ngay mà không cần mạng.
    pub fn delete_all<R: Runtime>(&self, app: &AppHandle<R>) -> Result<ModelsView, CommandError> {
        let work = self.begin_work(app, true)?;
        session::release_models(app);
        // Giữ lại manifest đã nhận: nó là mốc chống quay lui về manifest cũ (N3 của review 04).
        let saved = std::fs::read(self.store.path(store::MANIFEST)).ok();
        self.store
            .delete_all()
            .map_err(|e| CommandError::new(errors::MODELS_DISK, None, e.to_string()))?;
        if let Some(raw) = saved
            && let Err(e) = self.store.save_manifest(&raw)
        {
            log::warn!("không ghi lại được manifest: {e}");
        }
        self.lock().job = Job::idle();
        actions::set_model_tier(app, None);
        log::info!("đã xóa model và dữ liệu");
        drop(work);
        Ok(self.changed(app))
    }

    /// "Tải lại" (§4.3): băm lại file của gói; file hỏng bị bỏ, để lần tải sau chỉ tải lại chúng. Gói đang dùng thì tắt
    /// tiến trình phụ đang rảnh trước.
    pub fn verify<R: Runtime>(&self, app: &AppHandle<R>, pack: &str) -> Result<ModelsView, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack))?;
        if manifest.manifest.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        let in_use = selected(app).as_deref() == Some(pack);
        let work = self.begin_work(app, in_use)?;
        if in_use {
            session::release_models(app);
        }
        let broken = self.store.verify_pack(&manifest.manifest, pack);
        if !broken.is_empty() {
            log::warn!("gói {pack} có file hỏng: {broken:?}");
        }
        drop(work);
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

/// Bắt đầu tải; việc tải chạy trên luồng riêng. Lệnh vẫn `async`: kiểm dung lượng trống, cấu hình máy, đọc kho có thể
/// chậm, và không lệnh nào của quản lý model chạy trên luồng chính (Q2 của review 04).
#[tauri::command]
pub async fn download_models<R: Runtime>(app: AppHandle<R>, pack: String) -> Result<ModelsView, CommandError> {
    tauri::async_runtime::spawn_blocking(move || service(&app).download(&app, &pack))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

/// "Tải lại": băm lại gói, bỏ file hỏng (băm 2,5 GB mất vài giây).
#[tauri::command]
pub async fn verify_models<R: Runtime>(app: AppHandle<R>, pack: String) -> Result<ModelsView, CommandError> {
    blocking(app, move |app, models| models.verify(app, &pack)).await?
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
        wipe_user_data(app)?;
        Ok(view)
    })
    .await?
}

#[tauri::command]
pub fn dismiss_models_update<R: Runtime>(app: AppHandle<R>, models: State<'_, Arc<ModelService>>) -> ModelsView {
    models.dismiss_update(&app)
}

/// Phần "dữ liệu" của nút "Xóa model và dữ liệu": lịch sử, bản chép lời và từ điển thuật ngữ, cùng việc với nút "Xóa
/// toàn bộ dữ liệu" của kế hoạch 03 (`data::clear_all_data`). Bản quyền và bộ đếm hạn mức trong kho khóa giữ nguyên
/// (Q14).
fn wipe_user_data<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    crate::data::clear_all_data(app)
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index 291bba34341395f74703f3d23b2dd699010f9c0b..9ed05a1285d671527fe1eb0c7dadb59bded78e02 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -65,2 +65,27 @@ pub const UNKNOWN: &str = "unknown";
 
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
+/// Máy chưa được hỗ trợ (§8: RAM dưới mức tối thiểu, CPU x64 không có AVX2): không cho tải model. `field` là lý do.
+pub const MODELS_UNSUPPORTED: &str = "modelsUnsupported";
+
 impl CommandError {
```

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/actions.rs b/src-tauri/src/actions.rs
index 5bcbf77c997b4c9f0d69fdee4ca299cf16a5711f..39e7a877717462f0d0f9def544183204610510db 100644
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -15,3 +15,3 @@ use crate::{events, hotkey_registry, login_item, overlay, session, system, tray,
 /// Lưu cài đặt mới rồi báo mọi nơi cần biết.
-fn commit_settings<R: Runtime>(app: &AppHandle<R>, mut next: Settings) -> Settings {
+pub(crate) fn commit_settings<R: Runtime>(app: &AppHandle<R>, mut next: Settings) -> Settings {
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
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index 969bd8ef8ec0b389a7e3b37adeb71d9c1753a77f..faf2a7da6c2b1d446aeab8625cf38e3ee912569e 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -37,4 +37,5 @@ use crate::debug::{DebugLog, DebugSession};
 use crate::errors::{self, CommandError};
 use crate::glossary::{self, ActiveGlossary};
+use crate::models::service::ModelService;
 use crate::settings::{AudioSource, Lang, Settings};
 use crate::sidecar::{self, first_run, integrity};
@@ -47,4 +48,6 @@ use crate::{actions, events, overlay, window};
 /// 10 phút nằm ở `supervisor.idle_shutdown_ms`.
 const TICK_EVERY: Duration = Duration::from_secs(30);
+/// Chờ lần chạy sẵn đang nạp dở tối đa chừng này (lần nạp đầu tiên tới 180 giây, §5) trước khi tắt tiến trình phụ.
+const PREWARM_WAIT: Duration = Duration::from_secs(180);
 /// Id phụ đề của phiên thứ n bắt đầu từ `n × ID_STRIDE` (không trùng giữa các phiên của một lần chạy app).
 const ID_STRIDE: u64 = 1_000_000;
@@ -74,4 +77,7 @@ pub trait SessionDeps: Send + Sync {
     /// Gọi định kỳ: tắt tiến trình phụ sau 10 phút không dịch.
     fn tick(&self) {}
+    /// Tắt tiến trình phụ đang rảnh để chúng nhả file model (trước khi xóa hay tải đè model, kế hoạch 04). Lần chuẩn bị
+    /// sau chạy lại chúng.
+    fn release_models(&self) {}
     /// Thoát app, bước 1: từ giờ không chạy thêm tiến trình phụ nào, kill các tiến trình đang chạy. Không chờ gì.
     fn shutdown(&self) {}
@@ -229,5 +235,6 @@ pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Resu
         return Ok(state.status());
     }
-    if let Err(e) = session.deps.check_quota() {
+    // Chưa bắt đầu được (hết hạn mức, đang cập nhật model): báo lỗi, trừ khi một phiên khác đang chạy.
+    let refuse = |e: CommandError| {
         let refused = state.update_status(|s| {
             if matches!(s.session, SessionStatus::Starting | SessionStatus::Running) {
@@ -242,20 +249,34 @@ pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Resu
             return Err(e);
         }
-        return Ok(state.status());
+        Ok(state.status())
+    };
+    if let Err(e) = session.deps.check_quota() {
+        return refuse(e);
     }
     let mut attempt = 0;
-    let begun = state.update_status(|s| {
-        if matches!(s.session, SessionStatus::Starting | SessionStatus::Running) {
-            return false;
-        }
-        attempt = session.attempt.fetch_add(1, Ordering::SeqCst) + 1;
-        s.session = SessionStatus::Starting;
-        s.session_error = None;
-        s.indicators = Indicators::default();
-        s.permission_suspected = false;
-        s.waiting_for_app = false;
-        s.overlay_visible = true;
-        true
-    });
+    let mut begin = || {
+        state.update_status(|s| {
+            if matches!(s.session, SessionStatus::Starting | SessionStatus::Running) {
+                return false;
+            }
+            attempt = session.attempt.fetch_add(1, Ordering::SeqCst) + 1;
+            s.session = SessionStatus::Starting;
+            s.session_error = None;
+            s.indicators = Indicators::default();
+            s.permission_suspected = false;
+            s.waiting_for_app = false;
+            s.overlay_visible = true;
+            true
+        })
+    };
+    // Đang tải bản cập nhật, xóa hay kiểm gói đang dùng thì không bắt đầu (QĐ15 của 04). Mọi đường bắt đầu phiên (nút,
+    // khay, phím tắt, bước Nghe thử) đều qua đây, kể cả khi tiến trình phụ đang chạy sẵn (Q-A của review 04 lần 2).
+    let begun = match app.try_state::<Arc<ModelService>>() {
+        Some(models) => match models.begin_session(begin) {
+            Ok(begun) => begun,
+            Err(e) => return refuse(e),
+        },
+        None => begin(),
+    };
     if !begun {
         return Ok(state.status());
@@ -488,4 +509,10 @@ pub fn prewarm<R: Runtime>(app: &AppHandle<R>) {
         return;
     }
+    // Đang tải bản cập nhật, xóa hay kiểm gói đang dùng: không chạy tiến trình phụ (Q-A của review 04 lần 2). Kiểm sau
+    // khi đặt cờ, nên `release_models` (chờ cờ này về `false`) không bỏ sót lần chạy sẵn nào.
+    if app.try_state::<Arc<ModelService>>().is_some_and(|m| m.busy()) {
+        session.prewarming.store(false, Ordering::SeqCst);
+        return;
+    }
     let app = app.clone();
     std::thread::spawn(move || {
@@ -529,4 +556,22 @@ pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
 }
 
+/// Tắt tiến trình phụ đang rảnh để nhả file model (kế hoạch 04). Gọi khi không có phiên nào chạy.
+pub fn release_models<R: Runtime>(app: &AppHandle<R>) {
+    if let Some(session) = app.try_state::<Session>() {
+        wait_for_prewarm(&session);
+        session.deps.release_models();
+    }
+}
+
+/// Chờ lần chạy sẵn đang nạp dở xong (tối đa [`PREWARM_WAIT`], hay tới khi app thoát). Trước khi tắt tiến trình phụ để
+/// tải đè hay xóa model: nếu không, lần chạy sẵn còn chạy `llama-server` sau lần tắt (Q-A của review 04 lần 2). Người
+/// gọi đã đặt việc đụng tới gói đang dùng (`ModelService::busy`), nên không lần chạy sẵn mới nào bắt đầu trong lúc chờ.
+fn wait_for_prewarm(session: &Session) {
+    let since = Instant::now();
+    while session.is_prewarming() && !session.closing.load(Ordering::SeqCst) && since.elapsed() < PREWARM_WAIT {
+        std::thread::sleep(Duration::from_millis(20));
+    }
+}
+
 /// Luồng nền gọi `tick` định kỳ.
 pub fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
@@ -820,4 +865,10 @@ impl<R: Runtime> SessionDeps for LiveDeps<R> {
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

Ba chỗ của mỗi lệnh (`commands.rs`, `build.rs`, `capabilities/main.json`) phải khớp; `acl_tests` kiểm điều đó và kiểm cửa sổ `overlay` không gọi được lệnh nào trong số này. Chín lệnh của 04 đứng sau các lệnh của 03.

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/commands.rs b/src-tauri/src/commands.rs
index 801f3fbc1b8e0e097d336434faa21438dc0ed48c..c41f5ebd519e0c3e90b60fa453ee1a127f23259d 100644
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -286,2 +286,11 @@ pub const MAIN_COMMANDS: &[&str] = &[
     "get_debug_sessions",
+    "get_models_state",
+    "load_models",
+    "download_models",
+    "pause_models_download",
+    "select_model_pack",
+    "delete_models",
+    "delete_models_and_data",
+    "dismiss_models_update",
+    "verify_models",
 ];
@@ -333,2 +342,11 @@ pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send +
         end_overlay_resize,
+        crate::models::commands::get_models_state,
+        crate::models::commands::load_models,
+        crate::models::commands::download_models,
+        crate::models::commands::pause_models_download,
+        crate::models::commands::select_model_pack,
+        crate::models::commands::delete_models,
+        crate::models::commands::delete_models_and_data,
+        crate::models::commands::dismiss_models_update,
+        crate::models::commands::verify_models,
     ]
```

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
index 568ad369f6eedca41db211f6fa2b905b52c0ce12..d8849f35e5e58aacaf3ba0c120eec237b2462313 100644
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -40,2 +40,11 @@ fn main() {
             "get_debug_sessions",
+            "get_models_state",
+            "load_models",
+            "download_models",
+            "pause_models_download",
+            "select_model_pack",
+            "delete_models",
+            "delete_models_and_data",
+            "dismiss_models_update",
+            "verify_models",
             "get_overlay_view",
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/capabilities/main.json b/src-tauri/capabilities/main.json
index 6c58d5ab82c7337d07fcff63fcd4333588c9ebb5..236241336f232e1cc053e90aa3fe0a31f364c863 100644
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -35,2 +35,11 @@
     "allow-get-debug-sessions",
+    "allow-get-models-state",
+    "allow-load-models",
+    "allow-download-models",
+    "allow-pause-models-download",
+    "allow-select-model-pack",
+    "allow-delete-models",
+    "allow-delete-models-and-data",
+    "allow-dismiss-models-update",
+    "allow-verify-models",
     "core:event:allow-listen",
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 219d56f81e28ae8fed30a4cdbe6645d92e82e954..a4f496e94b3d57e5bf3737bbd3704858b98d1984 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -148,2 +148,7 @@ fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
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
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 16aec8fdc9220eff9267e9f0273baec4ce0d11f2..e6e11c1142a2af08a1f0af5d4a03364d0b3062a4 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -253,2 +253,14 @@ export const en = {
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
+  "error.modelsUnsupported": "This computer does not meet the minimum requirements, so models cannot be downloaded.",
   "error.quotaExhausted": "The translation quota has been used up.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 046fbc8e0e839e15ab0fe05c2e210c2fb6c0adb5..3d6dac106b48c373910d8cd25be69b05b12e6005 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -253,2 +253,14 @@ export const vi: Record<MessageKey, string> = {
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
+  "error.modelsUnsupported": "Máy này chưa đạt cấu hình tối thiểu nên không tải được model.",
   "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
```

- [ ] **Step 5: Chạy test**

Run: `cargo test -p meeting-translator --lib models::service 2>&1 | grep -E '^test result'`

Expected (lúc lập kế hoạch):

```text
test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 280 filtered out; finished in 3.32s
```

Run: `cargo test -p meeting-translator --lib 2>&1 | grep -E '^test result'; pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '`

Expected (lúc lập kế hoạch; cả `acl_tests` và `errors::tests` đều chạy trong lệnh đầu):

```text
test result: ok. 300 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out; finished in 3.27s
 Test Files  10 passed (10)
      Tests  98 passed (98)
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

Dòng 233, 338; QĐ11, QĐ15, QĐ17, QĐ22; ghi chú 8 của review cuối 02:
- `sidecar/mod.rs`: file model của gói đang dùng lấy từ `ModelService::resolve` (kiểm có file và kích thước; đang tải bản cập nhật thì `modelsBusy`); `SidecarKey`, `sidecar_key`; bản dev chưa tải gói nào thì dùng `models/` của repo như 02; ngưỡng của giám sát và của hai tiến trình phụ theo manifest. Dò GPU xong thì báo lại trạng thái model (đề xuất theo VRAM).
- `session.rs`: `engine_config` nhận `PipelineConfig` (từ manifest; `vadEndSilenceMs` của người dùng vẫn đè); `SessionDeps::pipeline_config`; lỗi `modelBroken` (lúc bắt đầu hay giữa phiên) thì băm lại gói; `prewarm` không làm gì khi phiên đang bắt đầu hay đang chạy (QĐ15, Q4 của review lần 1), có test bằng `PrepareGate` của app giả; lần chuẩn bị luôn tính `sidecar::sidecar_key` (gọi `resolve`, kể cả khi tiến trình phụ đang chạy) và chỉ dùng lại bộ tiến trình phụ đang có khi cùng khóa (`reusable`; QĐ22, Q-B của review lần 2); lần bắt đầu phiên chờ lần chạy sẵn đang nạp dở xong (N-9). Có test cho cả hai.

**Files:**
- Sửa: `src-tauri/src/session.rs`
- Sửa: `src-tauri/src/models/service.rs`
- Sửa: `src-tauri/src/sidecar/mod.rs`
- Sửa: `src-tauri/src/sidecar/paths.rs`

- [ ] **Step 1: Viết test**

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index faf2a7da6c2b1d446aeab8625cf38e3ee912569e..6a8bd498bded0c68987df7f31b4789d404731c3c 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -907,17 +907,15 @@ mod tests {
     }
 
-    /// Q4-1 của review 02 lần 4: `LiveDeps::allow_retry` cho đúng `SidecarManager` đang dùng thử lại. Tiến trình phụ trỏ
-    /// tới một binary không có nên lỗi ngay; `max_failures` 0 nên bỏ cuộc ở lần lỗi đầu.
-    #[test]
-    fn allow_retry_reaches_the_live_manager() {
+    /// Tiến trình phụ trỏ tới binary không có: chạy là lỗi ngay; `max_failures` 0 nên bỏ cuộc ở lần lỗi đầu.
+    fn missing_sidecars(tag: &str) -> pipeline::supervisor::SidecarSpec {
         use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
-        use pipeline::supervisor::{AsrSpec, FakeClock, LlamaSpec, SidecarSpec};
+        use pipeline::supervisor::{AsrSpec, LlamaSpec, SidecarSpec};
         let missing = PathBuf::from("/khong/co/asr-worker");
-        let spec = SidecarSpec {
+        SidecarSpec {
             asr: AsrSpec {
                 exe_gpu: None,
                 exe_cpu: missing.clone(),
                 model: PathBuf::from("/khong/co/model.bin"),
-                log: std::env::temp_dir().join(format!("mt-allow-retry-{}.log", std::process::id())),
+                log: std::env::temp_dir().join(format!("mt-{tag}-{}.log", std::process::id())),
                 first_run: false,
                 require_shared: false,
@@ -927,5 +925,5 @@ mod tests {
                 exe: missing,
                 model: PathBuf::from("/khong/co/mt.gguf"),
-                log: std::env::temp_dir().join(format!("mt-allow-retry-llama-{}.log", std::process::id())),
+                log: std::env::temp_dir().join(format!("mt-{tag}-llama-{}.log", std::process::id())),
                 extra_args: Vec::new(),
                 first_run: false,
@@ -938,5 +936,13 @@ mod tests {
             asr_config: AsrConfig::default(),
             mt_config: MtConfig::default(),
-        };
+        }
+    }
+
+    /// Q4-1 của review 02 lần 4: `LiveDeps::allow_retry` cho đúng `SidecarManager` đang dùng thử lại. Tiến trình phụ trỏ
+    /// tới một binary không có nên lỗi ngay; `max_failures` 0 nên bỏ cuộc ở lần lỗi đầu.
+    #[test]
+    fn allow_retry_reaches_the_live_manager() {
+        use pipeline::supervisor::FakeClock;
+        let spec = missing_sidecars("allow-retry");
         let spawns = Arc::new(CountSpawns::default());
         let manager = SidecarManager::new(spec, Arc::new(FakeClock::default()), spawns.clone());
@@ -945,5 +951,5 @@ mod tests {
         *deps.live.lock().unwrap() = Some(Live {
             manager: manager.clone(),
-            tier: None,
+            key: sidecar::SidecarKey::default(),
             vad_model: PathBuf::new(),
         });
@@ -956,4 +962,42 @@ mod tests {
     }
 
+    /// Ghi chú 8 của review cuối 02 và Q-B của review 04 lần 2: lần chuẩn bị chỉ dùng lại bộ tiến trình phụ đang có khi
+    /// cùng gói, cùng file model và cùng ngưỡng; đổi gói, hay bản cập nhật đổi tên file hay ngưỡng, thì dựng bộ mới.
+    #[test]
+    fn sidecars_are_reused_only_for_the_same_pack_files_and_thresholds() {
+        let key = |tier: &str, mt: &str| sidecar::SidecarKey {
+            tier: Some(tier.into()),
+            models: sidecar::paths::ModelFiles {
+                asr: PathBuf::from("/m/asr.bin"),
+                mt: PathBuf::from(mt),
+                vad: PathBuf::from("/m/vad.onnx"),
+            },
+            ..sidecar::SidecarKey::default()
+        };
+        let manager = SidecarManager::new(
+            missing_sidecars("reuse"),
+            Arc::new(pipeline::supervisor::FakeClock::default()),
+            Arc::new(CountSpawns::default()),
+        );
+        let live = Live {
+            manager: manager.clone(),
+            key: key("lite", "/m/q4.gguf"),
+            vad_model: PathBuf::new(),
+        };
+        assert!(reusable(Some(&live), &key("lite", "/m/q4.gguf")).is_some_and(|m| Arc::ptr_eq(&m, &manager)));
+        assert!(reusable(Some(&live), &key("standard", "/m/q4.gguf")).is_none());
+        assert!(
+            reusable(Some(&live), &key("lite", "/m/q4-v2.gguf")).is_none(),
+            "bản cập nhật đổi tên file"
+        );
+        let mut other_threshold = key("lite", "/m/q4.gguf");
+        other_threshold.mt.max_tokens_cap += 1;
+        assert!(
+            reusable(Some(&live), &other_threshold).is_none(),
+            "ngưỡng mới của manifest"
+        );
+        assert!(reusable(None, &key("lite", "/m/q4.gguf")).is_none());
+    }
+
     /// Q4-2 của review 02 lần 4: `asr-worker` chạy lại được bằng GPU thì bỏ chỉ báo "Đang chạy bằng CPU".
     #[test]
@@ -1091,5 +1135,10 @@ mod tests {
         let mut settings = Settings::defaults(UiLanguage::Vi);
         settings.vad_end_silence_ms = 500;
-        let cfg = engine_config(&settings, 3_000_000, SharedGlossary::default());
+        let cfg = engine_config(
+            &settings,
+            PipelineConfig::default(),
+            3_000_000,
+            SharedGlossary::default(),
+        );
         assert_eq!(cfg.languages, ["en", "zh", "ja", "ko", "vi"]);
         assert_eq!(cfg.target, MtLang::Vi);
@@ -1100,8 +1149,88 @@ mod tests {
         settings.target_language = Lang::En;
         settings.experimental.translation_context = true;
-        let cfg = engine_config(&settings, 0, SharedGlossary::default());
+        let mut from_manifest = PipelineConfig::default();
+        from_manifest.queue.lag_warn_ms = 8_000;
+        from_manifest.segmenter.end_silence_ms = 900;
+        let cfg = engine_config(&settings, from_manifest, 0, SharedGlossary::default());
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
+    /// Ghi chú 8 của review cuối 02, Q4 của review 04: mở lại cửa sổ chính lúc phiên đang bắt đầu hay đang chạy thì không
+    /// chuẩn bị tiến trình phụ lần nữa. Nhờ vậy gói vừa đổi (bấm "Dùng gói này", hay một gói vừa tải xong) chỉ dùng từ
+    /// phiên sau, và không có bộ tiến trình phụ thứ hai.
+    #[test]
+    fn prewarm_does_nothing_while_a_session_starts_or_runs() {
+        use crate::test_support::{FakeDeps, PrepareGate, mock_app_with};
+        let gate = Arc::new(PrepareGate::default());
+        let deps = FakeDeps {
+            prepare_gate: Some(gate.clone()),
+            ..FakeDeps::default()
+        };
+        let prepares = deps.prepares.clone();
+        let app = mock_app_with(deps);
+        let handle = app.handle().clone();
+        let starting = std::thread::spawn(move || toggle(&handle));
+        let since = Instant::now();
+        while gate.waiting() == 0 {
+            assert!(
+                since.elapsed() < Duration::from_secs(10),
+                "lần bắt đầu không tới prepare"
+            );
+            std::thread::sleep(Duration::from_millis(5));
+        }
+        prewarm(app.handle());
+        std::thread::sleep(Duration::from_millis(100));
+        assert_eq!(*prepares.lock().unwrap(), 1, "đang bắt đầu: prewarm không chuẩn bị");
+        gate.open();
+        let status = starting.join().unwrap().unwrap();
+        assert_eq!(status.session, SessionStatus::Running);
+        prewarm(app.handle());
+        std::thread::sleep(Duration::from_millis(100));
+        assert_eq!(*prepares.lock().unwrap(), 1, "đang dịch: prewarm không chuẩn bị");
+        assert!(!app.state::<Session>().is_prewarming());
+        toggle(app.handle()).unwrap();
+        prewarm(app.handle());
+        let since = Instant::now();
+        while *prepares.lock().unwrap() < 2 {
+            assert!(since.elapsed() < Duration::from_secs(10), "rảnh: prewarm chuẩn bị");
+            std::thread::sleep(Duration::from_millis(5));
+        }
+    }
+
+    /// N-9 của review 04 lần 2: lần bắt đầu phiên chờ lần chạy sẵn đang nạp xong rồi mới chuẩn bị.
+    #[test]
+    fn a_start_waits_for_a_prewarm_in_progress() {
+        use crate::test_support::{FakeDeps, PrepareGate, mock_app_with};
+        let gate = Arc::new(PrepareGate::default());
+        let deps = FakeDeps {
+            prepare_gate: Some(gate.clone()),
+            ..FakeDeps::default()
+        };
+        let prepares = deps.prepares.clone();
+        let app = mock_app_with(deps);
+        prewarm(app.handle());
+        let since = Instant::now();
+        while gate.waiting() == 0 {
+            assert!(
+                since.elapsed() < Duration::from_secs(10),
+                "lần chạy sẵn không tới prepare"
+            );
+            std::thread::sleep(Duration::from_millis(5));
+        }
+        let handle = app.handle().clone();
+        let starting = std::thread::spawn(move || toggle(&handle));
+        std::thread::sleep(Duration::from_millis(200));
+        assert_eq!(*prepares.lock().unwrap(), 1, "chưa chuẩn bị khi lần chạy sẵn còn nạp");
+        gate.open();
+        assert_eq!(starting.join().unwrap().unwrap().session, SessionStatus::Running);
+        assert_eq!(*prepares.lock().unwrap(), 2);
+        toggle(app.handle()).unwrap();
     }
 
```

Sửa `src-tauri/src/models/service.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/models/service.rs b/src-tauri/src/models/service.rs
index 44758ef07449c5ef57490afb89f3b86a1ae1240c..4edf6b768784d61d8f1f379ede7738471793d2ca 100644
--- a/src-tauri/src/models/service.rs
+++ b/src-tauri/src/models/service.rs
@@ -1455,4 +1455,29 @@ mod tests {
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
error: could not compile `meeting-translator` (lib test) due to 12 previous errors
error[E0061]: this function takes 3 arguments but 4 arguments were supplied
error[E0422]: cannot find struct, variant or union type `SidecarKey` in module `sidecar`
error[E0425]: cannot find function `reusable` in this scope
error[E0433]: cannot find `SidecarKey` in `sidecar`
error[E0560]: struct `session::Live` has no field named `key`
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index 6a8bd498bded0c68987df7f31b4789d404731c3c..b69efcf3cf02603e7dd758a493202c8d1cb0c920 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -88,4 +88,8 @@ pub trait SessionDeps: Send + Sync {
         errors::SIDECAR_FAILED
     }
+    /// Ngưỡng của pipeline: mặc định, hay theo manifest model đã ký (kế hoạch 04, 02a QĐ21).
+    fn pipeline_config(&self) -> PipelineConfig {
+        PipelineConfig::default()
+    }
 }
 
@@ -142,7 +146,12 @@ fn code_of(settings: Lang) -> &'static str {
 }
 
-/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh; và từ điển thuật ngữ dùng chung.
-pub fn engine_config(settings: &Settings, id_base: u64, glossary: SharedGlossary) -> EngineConfig {
-    let mut pipeline = PipelineConfig::default();
+/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh; từ điển thuật ngữ dùng chung; các
+/// ngưỡng khác theo `pipeline`.
+pub fn engine_config(
+    settings: &Settings,
+    mut pipeline: PipelineConfig,
+    id_base: u64,
+    glossary: SharedGlossary,
+) -> EngineConfig {
     pipeline.segmenter.end_silence_ms = u64::from(settings.vad_end_silence_ms);
     let languages = match settings.source_lock {
@@ -191,6 +200,14 @@ fn show_overlay<R: Runtime>(app: &AppHandle<R>) {
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
@@ -286,4 +303,7 @@ pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Resu
     changed(app);
     let settings = state.settings();
+    // Lần chạy sẵn đang nạp dở (có thể của gói vừa đổi): chờ nó xong, để không có hai bộ tiến trình phụ cùng nạp (ghi chú
+    // 8 của review cuối 02, N-9 của review 04 lần 2).
+    wait_for_prewarm(&session);
     session.deps.allow_retry();
     if let Err(e) = session.deps.prepare(&settings) {
@@ -335,5 +355,5 @@ pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Resu
     });
     let engine = match Engine::start(
-        engine_config(&settings, n * ID_STRIDE, glossary),
+        engine_config(&settings, session.deps.pipeline_config(), n * ID_STRIDE, glossary),
         source,
         session.deps.vad(),
@@ -469,4 +489,5 @@ fn fail<R: Runtime>(app: &AppHandle<R>, n: u64, code: &str, message: &str) {
     }
     log::error!("phiên dịch dừng vì lỗi {code}: {message}");
+    check_broken_model(app, code);
     app.state::<AppState>().update_status(|s| {
         s.session = SessionStatus::Error;
@@ -506,4 +527,10 @@ pub fn prewarm<R: Runtime>(app: &AppHandle<R>) {
         return;
     };
+    // Phiên đang bắt đầu hay đang chạy đã có (hay đang dựng) tiến trình phụ của nó. Chuẩn bị theo cài đặt lúc này có thể
+    // dựng bộ thứ hai cho gói vừa đổi (ghi chú 8 của review cuối 02, Q4 của review 04): gói mới chỉ dùng từ phiên sau.
+    let session_status = app.state::<AppState>().status().session;
+    if matches!(session_status, SessionStatus::Starting | SessionStatus::Running) {
+        return;
+    }
     if session.prewarming.swap(true, Ordering::SeqCst) {
         return;
@@ -740,8 +767,15 @@ impl<R: Runtime> SidecarEvents for StatusEvents<R> {
 struct Live {
     manager: Arc<SidecarManager>,
-    tier: Option<String>,
+    key: sidecar::SidecarKey,
     vad_model: PathBuf,
 }
 
+/// Bộ tiến trình phụ đang có dùng lại được cho lần chuẩn bị theo `key` không: chỉ khi cùng gói, cùng file model và cùng
+/// ngưỡng. Khác thì dựng bộ mới (bộ cũ tắt khi phiên cuối còn dùng nó kết thúc), nên gói mới hay bản cập nhật của gói
+/// có tác dụng từ phiên sau (QĐ15 của 04, Q-B của review 04 lần 2).
+fn reusable(live: Option<&Live>, key: &sidecar::SidecarKey) -> Option<Arc<SidecarManager>> {
+    live.filter(|l| &l.key == key).map(|l| l.manager.clone())
+}
+
 /// Phần bên ngoài thật: tiến trình phụ (`pipeline::supervisor`), nguồn âm thanh (`capture`), Silero VAD.
 pub struct LiveDeps<R: Runtime> {
@@ -772,10 +806,7 @@ impl<R: Runtime> LiveDeps<R> {
 impl<R: Runtime> SessionDeps for LiveDeps<R> {
     fn prepare(&self, settings: &Settings) -> Result<(), CommandError> {
-        let running = {
-            let live = self.live.lock().unwrap();
-            live.as_ref()
-                .filter(|l| l.tier == settings.model_tier)
-                .map(|l| l.manager.clone())
-        };
+        // Kiểm file model mỗi lần (rẻ), kể cả khi tiến trình phụ đang chạy: bản cập nhật có thể đã đổi file hay ngưỡng.
+        let key = sidecar::sidecar_key(&self.app, settings)?;
+        let running = reusable(self.live.lock().unwrap().as_ref(), &key);
         // Chạm trước rồi mới hỏi còn chạy không: lần tắt khi rảnh (`SidecarManager::stop_if_idle`) kiểm lại "rảnh" dưới khóa
         // của tiến trình phụ, nên nó không tắt sau lần chạm này (Q5 của review 03).
@@ -790,6 +821,7 @@ impl<R: Runtime> SessionDeps for LiveDeps<R> {
         let manager = {
             let mut live = self.live.lock().unwrap();
-            // Đổi gói model thì dựng lại; tiến trình cũ tắt khi phiên cuối còn dùng nó kết thúc (`SidecarManager` bị hủy).
-            if live.as_ref().is_none_or(|l| l.tier != prepared.tier) {
+            // Khác gói, file model hay ngưỡng thì dựng lại; tiến trình cũ tắt khi phiên cuối còn dùng nó kết thúc
+            // (`SidecarManager` bị hủy).
+            if reusable(live.as_ref(), &prepared.key).is_none() {
                 *self.asr_gave_up.lock().unwrap() = None;
                 let events = Arc::new(StatusEvents {
@@ -807,5 +839,5 @@ impl<R: Runtime> SessionDeps for LiveDeps<R> {
                 *live = Some(Live {
                     manager,
-                    tier: prepared.tier,
+                    key: prepared.key,
                     vad_model: prepared.vad_model,
                 });
@@ -888,4 +920,11 @@ impl<R: Runtime> SessionDeps for LiveDeps<R> {
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
diff --git a/src-tauri/src/models/service.rs b/src-tauri/src/models/service.rs
index 4edf6b768784d61d8f1f379ede7738471793d2ca..4e50a5a8fd9a1cf6b3693c1329c85868edff8a24 100644
--- a/src-tauri/src/models/service.rs
+++ b/src-tauri/src/models/service.rs
@@ -741,4 +741,14 @@ pub fn check_on_startup<R: Runtime>(app: &AppHandle<R>) {
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
diff --git a/src-tauri/src/sidecar/mod.rs b/src-tauri/src/sidecar/mod.rs
index b34964edcbac90458ac999f7f229f71cb0fb9694..733271a15fc4d6ec9b18b1514ef8708d40a8bef4 100644
--- a/src-tauri/src/sidecar/mod.rs
+++ b/src-tauri/src/sidecar/mod.rs
@@ -8,19 +8,48 @@ pub mod probe;
 
 use std::path::{Path, PathBuf};
-use std::sync::{Condvar, Mutex};
+use std::sync::{Arc, Condvar, Mutex};
 use std::time::Duration;
 
-use pipeline::config::PipelineConfig;
+use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
 use pipeline::supervisor::{AsrSpec, GiveUpCause, LlamaSpec, SidecarSpec};
 use tauri::{AppHandle, Manager, Runtime};
 
 use crate::errors::{self, CommandError};
+use crate::models::service::ModelService;
 use crate::settings::Settings;
 
 /// Kết quả chuẩn bị: cách chạy hai tiến trình phụ, cộng những gì app cần nhớ.
+/// Những gì một bộ tiến trình phụ đang chạy dựa vào: gói, file model, ngưỡng của giám sát và của hai tiến trình phụ.
+/// Khác thì phải dựng bộ mới: bản cập nhật cùng mã gói có thể đổi tên file hay ngưỡng (Q-B của review 04 lần 2).
+#[derive(Clone, Debug, Default, PartialEq)]
+pub struct SidecarKey {
+    pub tier: Option<String>,
+    pub models: paths::ModelFiles,
+    pub supervisor: SupervisorConfig,
+    pub asr: AsrConfig,
+    pub mt: MtConfig,
+}
+
+/// [`SidecarKey`] cho cài đặt lúc này. Rẻ (chỉ kiểm có file và kích thước), nên lần chuẩn bị nào cũng gọi, kể cả khi
+/// tiến trình phụ đang chạy.
+pub fn sidecar_key<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<SidecarKey, CommandError> {
+    let models = resolve_models(app, settings)?;
+    let config = app
+        .try_state::<Arc<ModelService>>()
+        .map(|models| models.pipeline_config())
+        .unwrap_or_default();
+    Ok(SidecarKey {
+        tier: settings.model_tier.clone(),
+        models,
+        supervisor: config.supervisor,
+        asr: config.asr,
+        mt: config.mt,
+    })
+}
+
 #[derive(Debug)]
 pub struct Prepared {
     pub spec: SidecarSpec,
-    pub tier: Option<String>,
+    pub key: SidecarKey,
     /// Thư mục tiến trình phụ, và băm của từng file thực thi (theo đường dẫn), cho kiểm lại trước mỗi lần chạy và cho
     /// "lần đầu chạy".
@@ -124,4 +153,6 @@ pub fn start_gpu_probe<R: Runtime>(app: &AppHandle<R>) {
         app.state::<GpuProbe>()
             .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)));
+        // Đề xuất gói theo VRAM của card rời (kế hoạch 04) đổi theo kết quả dò.
+        crate::models::service::changed(&app);
     });
 }
@@ -134,4 +165,24 @@ fn seen_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
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
@@ -161,19 +212,7 @@ pub fn prepare<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<Pr
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
+    let key = sidecar_key(app, settings)?;
+    let models = &key.models;
     let logs = app.path().app_log_dir().map_err(path_error)?;
-    let config = PipelineConfig::default();
     let spec = SidecarSpec {
         asr: AsrSpec {
@@ -195,14 +234,14 @@ pub fn prepare<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> Result<Pr
             env: Vec::new(),
         },
-        supervisor: config.supervisor,
-        asr_config: config.asr,
-        mt_config: config.mt,
+        supervisor: key.supervisor.clone(),
+        asr_config: key.asr.clone(),
+        mt_config: key.mt.clone(),
     };
     Ok(Prepared {
+        vad_model: key.models.vad.clone(),
         spec,
-        tier: settings.model_tier.clone(),
+        key,
         dir,
         hashes,
-        vad_model: models.vad,
         seen_file,
         locks: verified.locks,
```

Sửa `src-tauri/src/sidecar/paths.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/sidecar/paths.rs b/src-tauri/src/sidecar/paths.rs
index f79b26a216ad36331cd86a2474172e6a1473658b..c14d9d973df49d9274f5750c6a2cd1ef17845abc 100644
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
@@ -56,5 +56,5 @@ pub fn binaries_dir() -> std::io::Result<PathBuf> {
 }
 
-#[derive(Clone, Debug, PartialEq, Eq)]
+#[derive(Clone, Debug, Default, PartialEq, Eq)]
 pub struct ModelFiles {
     pub asr: PathBuf,
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
test result: ok. 34 passed; 0 failed; 0 ignored; 0 measured; 273 filtered out; finished in 3.34s
```

- [ ] **Step 5: Định dạng, clippy, code Windows**

Run:

```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)' || true
./scripts/check-windows.sh 2>&1 | grep -E '^(warning|error)|Finished' | sed -E 's/ in [0-9.]+s$//'
rm -rf "${CARGO_TARGET_DIR:-target}/x86_64-pc-windows-msvc"
```

Expected:

```text
0
    Finished `dev` profile [unoptimized + debuginfo] target(s)
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/models/service.rs src-tauri/src/sidecar/mod.rs src-tauri/src/sidecar/paths.rs
git commit -q -m "feat(app): phiên dịch lấy model và ngưỡng từ kho model; model hỏng thì băm lại; gói mới dùng từ phiên sau (04 T9)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Giao diện: kiểu, store và chuỗi

Dòng 36, 37, 53, 163, 223; QĐ19–QĐ21:
- `src/lib/models.ts`: kiểu khớp `ModelsView` phía Rust; hàm thuần: định dạng dung lượng, gói đề xuất, gói chọn sẵn, phần còn phải tải, tiến độ, lý do không tải được (`downloadBlock`), bước 3 có tự tải không (`shouldAutoDownload`, N6 của review lần 1; chờ kết quả dò GPU trên Windows khi người dùng chưa tự chọn, N-12 của review lần 2).
- `src/store/models.ts`: store Zustand riêng (nghe `models://state`, bỏ trạng thái cũ theo `rev`, gọi 9 lệnh; `repair` băm lại rồi chỉ tải khi gói còn thiếu, N7; "Xóa model và dữ liệu" xong thì gọi `onDataCleared`, QĐ13).
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
    enoughSpace: true,
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
import {
  defaultChoice,
  downloadBlock,
  formatBytes,
  jobFor,
  progress,
  recommendedPack,
  remainingBytes,
  shouldAutoDownload,
} from "./models";

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

describe("tải được không", () => {
  const job = (state: "idle" | "downloading" | "paused" | "failed" | "done", pack: string | null) => ({
    state,
    pack,
    doneBytes: 0,
    totalBytes: 10,
    error: null,
    replacesInUse: false,
  });

  it("máy chưa hỗ trợ, gói cần app mới hơn, ổ không đủ chỗ thì không tải", () => {
    const lite = pack("lite", 1_326_000_000);
    expect(downloadBlock(view(), lite)).toBeNull();
    expect(downloadBlock(view({ verdict: { kind: "unsupported", reason: "noAvx2" } }), lite)).toBe("unsupported");
    expect(downloadBlock(view(), { ...lite, appTooOld: true })).toBe("appTooOld");
    expect(downloadBlock(view(), { ...lite, enoughSpace: false })).toBe("noSpace");
  });

  it("bước 3 tự tải gói vừa chọn, kể cả khi gói khác đang dừng giữa chừng", () => {
    expect(shouldAutoDownload(view(), "lite", true)).toBe(true);
    expect(shouldAutoDownload(view({ job: job("downloading", "standard") }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ job: job("paused", "standard") }), "lite", true)).toBe(true);
    expect(shouldAutoDownload(view({ job: job("failed", "standard") }), "lite", true)).toBe(true);
    expect(shouldAutoDownload(view({ job: job("paused", "lite") }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ job: job("failed", "lite") }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ job: job("done", "standard") }), "lite", true)).toBe(true);
    const done = view({ packs: [pack("lite", 1, { usable: true, complete: true })] });
    expect(shouldAutoDownload(done, "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ verdict: { kind: "unsupported", reason: "lowRam" } }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view(), null, true)).toBe(false);
  });

  it("Windows chưa dò xong GPU thì chỉ tự tải gói người dùng đã tự chọn", () => {
    const windows = (gpuKnown: boolean) =>
      view({ machine: { os: "windows", ramMib: 16_384, avx2: true, gpus: [], gpuKnown } });
    expect(shouldAutoDownload(windows(false), "lite", false)).toBe(false);
    expect(shouldAutoDownload(windows(false), "lite", true)).toBe(true);
    expect(shouldAutoDownload(windows(true), "lite", false)).toBe(true);
    expect(shouldAutoDownload(view(), "lite", false)).toBe(true);
  });
});
```

Tạo `src/store/models.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import { fakeModelsView, fakePack } from "../lib/fakeModels";
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
    delete_models_and_data: () => {
      if (fail.delete_models_and_data) throw error(fail.delete_models_and_data);
      return next({ usedBytes: 0 });
    },
    dismiss_models_update: () => next({ updateAvailable: false }),
    verify_models: () =>
      next({ packs: [fakePack("standard", 2_485_000_000), fakePack("lite", 1_326_000_000, { usable: true, missingBytes: 10 })] }),
  });
  let cleared = 0;
  const store = createModelsStore(fake.ipc, () => cleared++);
  return { fake, store, cleared: () => cleared };
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

  it("xóa model và dữ liệu xong thì báo cửa sổ chính bỏ dữ liệu đang hiện; lỗi thì không", async () => {
    const { store, cleared } = setup();
    expect(await store.getState().removeAll()).toBe(true);
    expect(cleared()).toBe(1);
    const failing = setup({ delete_models_and_data: "modelsInUse" });
    expect(await failing.store.getState().removeAll()).toBe(false);
    expect(failing.cleared()).toBe(0);
  });

  it("tải lại: băm lại trước, rồi chỉ tải khi gói còn thiếu", async () => {
    const { fake, store } = setup();
    expect(await store.getState().repair("lite")).toBe(true);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["verify_models", "download_models"]);
    expect(fake.calls[1]?.args).toEqual({ pack: "lite" });
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
      Tests  98 passed (98)
 FAIL  src/lib/models.test.ts [ src/lib/models.test.ts ]
 FAIL  src/store/models.test.ts [ src/store/models.test.ts ]
 Test Files  2 failed | 10 passed (12)
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
  // Ổ còn đủ chỗ cho phần còn phải tải cộng 1 GB (§6.7).
  enoughSpace: boolean;
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

export type DownloadBlock = "unsupported" | "appTooOld" | "noSpace";

// Lý do không tải được gói này (phía Rust cũng từ chối lệnh tải): máy chưa được hỗ trợ (chủ dự án quyết 2026-10-02),
// gói cần app mới hơn, ổ không đủ chỗ. `null` là tải được.
export function downloadBlock(view: ModelsView, pack: PackView): DownloadBlock | null {
  if (view.verdict?.kind === "unsupported") return "unsupported";
  if (pack.appTooOld) return "appTooOld";
  if (!pack.enoughSpace) return "noSpace";
  return null;
}

// Bước 3 của lần đầu mở: tự bắt đầu tải gói đã chọn khi gói chưa đủ, tải được, và không có việc tải nào đang chạy hay
// đang dừng giữa chừng của chính gói đó (người dùng đã bấm Tạm dừng thì không tự tải tiếp). Gói khác đang tạm dừng
// hay lỗi thì vẫn bắt đầu gói vừa chọn (N6 của review 04). `picked`: người dùng đã tự chọn gói. Chưa tự chọn mà
// Windows chưa dò xong GPU thì chờ: gói chọn sẵn lúc đó chưa tính card rời (N-12 của review 04 lần 2).
export function shouldAutoDownload(view: ModelsView, chosen: string | null, picked: boolean): boolean {
  const pack = packById(view, chosen);
  if (!pack || pack.complete || downloadBlock(view, pack)) return false;
  if (!picked && !view.machine.gpuKnown) return false;
  const job = view.job;
  if (job.state === "downloading") return false;
  return job.state === "idle" || job.state === "done" || job.pack !== pack.id;
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
  // "Tải lại": băm lại gói rồi tải phần thiếu hay hỏng; gói đang dùng không bị xóa trước (N7 của review 04).
  repair(pack: string): Promise<boolean>;
  dismissUpdate(): Promise<void>;
  dismissError(): void;
}

// `onDataCleared`: gọi khi "Xóa model và dữ liệu" xong. Phía Rust đã xóa cả lịch sử, bản chép lời và từ điển (như "Xóa toàn
// bộ dữ liệu" của kế hoạch 03), nên cửa sổ chính bỏ phần dữ liệu đang hiện.
export function createModelsStore(ipc: Ipc, onDataCleared: () => void = () => {}) {
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
          onDataCleared();
        });
      },

      async repair(pack) {
        if (!(await run(() => ipc.invoke("verify_models", { pack }), setView))) return false;
        const after = get().view?.packs.find((p) => p.id === pack);
        return after?.complete ? true : get().download(pack);
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
diff --git a/src/lib/ipc.ts b/src/lib/ipc.ts
index f1bc60755217bbd1c24a87a3ca1b12a666950fa1..9ef7a9fcef0b52c536975aac12a9dd6b399995ea 100644
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -3,2 +3,3 @@ import { listen } from "@tauri-apps/api/event";
 import type { UiLanguage } from "../i18n";
+import type { ModelsView } from "./models";
 
@@ -275,2 +276,14 @@ export interface Commands {
   end_overlay_resize: { args: undefined; result: null };
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
+  // "Tải lại": băm lại gói, bỏ file hỏng (để lần tải sau chỉ tải lại chúng).
+  verify_models: { args: { pack: string }; result: ModelsView };
 }
@@ -287,2 +300,4 @@ export interface Events {
   "audio://level": number;
+  // Trạng thái quản lý model (kế hoạch 04).
+  "models://state": ModelsView;
 }
```

Chuỗi giao diện của quản lý model, đặt ngay sau dòng `"onboarding.download.title"` (ít va chạm với 03):

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index e6e11c1142a2af08a1f0af5d4a03364d0b3062a4..289f6f63da701a04789b203fe7c956d06192dfff 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -180,2 +180,46 @@ export const en = {
   "onboarding.download.title": "Download the model",
+  "models.loading": "Loading the list of model packs…",
+  "models.retry": "Try again",
+  "models.machine": "This computer: {ram} of RAM, {disk} free on disk.",
+  "models.gpu": "Graphics card: {name}, {vram} of video memory.",
+  "models.gpuChecking": "Checking the graphics card…",
+  "models.unsupported.lowRam": "This computer has less than 8 GB of RAM, which AI Translator does not support yet.",
+  "models.unsupported.noAvx2": "This computer's processor lacks AVX2, which AI Translator needs. Speech recognition will not run on it.",
+  "models.unsupported.requirements": "Minimum: a Mac with Apple Silicon and 8 GB of RAM, or a Windows 10/11 x64 PC with 8 GB of RAM and a processor with AVX2. Models cannot be downloaded on this computer.",
+  "models.noSpace": "Not enough free disk space for this pack: it needs {size} free (download size plus 1 GB).",
+  "models.otherDownloading": "The {pack} pack is downloading. Pause it to download the pack you chose.",
+  "models.checking": "Checking the downloaded files…",
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
+  "models.redownload": "Check and download again",
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
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 3d6dac106b48c373910d8cd25be69b05b12e6005..9be2e9ac95dbf360d4f5a7ec016cf76d790eb742 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -180,2 +180,46 @@ export const vi: Record<MessageKey, string> = {
   "onboarding.download.title": "Tải model",
+  "models.loading": "Đang tải danh sách gói model…",
+  "models.retry": "Thử lại",
+  "models.machine": "Máy này: RAM {ram}, ổ đĩa còn trống {disk}.",
+  "models.gpu": "Card đồ họa: {name}, bộ nhớ đồ họa {vram}.",
+  "models.gpuChecking": "Đang kiểm tra card đồ họa…",
+  "models.unsupported.lowRam": "Máy này có RAM dưới 8 GB, AI Translator chưa hỗ trợ.",
+  "models.unsupported.noAvx2": "Bộ xử lý của máy này không có AVX2, là tập lệnh AI Translator cần. Nhận dạng giọng nói sẽ không chạy được.",
+  "models.unsupported.requirements": "Cấu hình tối thiểu: máy Mac chip Apple Silicon có RAM 8 GB, hoặc máy Windows 10/11 x64 có RAM 8 GB và bộ xử lý hỗ trợ AVX2. Máy này không tải được model.",
+  "models.noSpace": "Ổ đĩa không đủ chỗ cho gói này: cần trống {size} (dung lượng tải cộng 1 GB).",
+  "models.otherDownloading": "Đang tải gói {pack}. Tạm dừng gói đó để tải gói bạn vừa chọn.",
+  "models.checking": "Đang kiểm tra các file đã tải…",
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
+  "models.redownload": "Kiểm tra và tải lại",
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
 Test Files  12 passed (12)
      Tests  113 passed (113)
✓ built
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/fakeModels.ts src/lib/models.test.ts src/store/models.test.ts src/lib/models.ts src/store/models.ts src/lib/ipc.ts src/i18n/en.ts src/i18n/vi.ts
git commit -q -m "feat(ui): kiểu, store và chuỗi giao diện của quản lý model (04 T10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 11: Màn hình: bước 2–3, Cài đặt › Model, "Xóa model và dữ liệu", lời mời cập nhật

Dòng 33, 36, 37, 53, 57, 159, 163, 223, 224, 237; §4.1 bước 2–3, §4.3, §8; 04a QĐ8; QĐ18, QĐ19, QĐ21:
- Bước 2 (`ModelStep`): cấu hình máy; máy chưa được hỗ trợ thì báo lý do và cấu hình tối thiểu; danh sách gói kèm dung lượng tải, ghi chú chất lượng, nhãn "Đề xuất cho máy này", chọn sẵn gói đề xuất.
- Bước 3 (`DownloadStep`): tự bắt đầu tải gói đã chọn (`shouldAutoDownload`); đang tải gói khác thì mời tạm dừng gói đó; không tải được thì báo lý do (`BlockNote`); tiến độ, tạm dừng, tiếp tục, lỗi; đi tiếp được trong lúc tải.
- Cài đặt › Model (`ModelSettings`): gói đang dùng, dung lượng model, cấu hình máy, đổi gói, "Kiểm tra và tải lại" (`repair`), xóa; nút tải khóa khi `downloadBlock` có lý do; lời mời cập nhật.
- Cài đặt › Quyền riêng tư (`PrivacySettings.tsx` của 03): nút "Xóa model và dữ liệu" có bước xác nhận (`DeleteModelsAndData`), ngay sau thẻ "Xóa toàn bộ dữ liệu". Xóa xong thì bật `dataCleared` của store chính (`modelsStore.ts`, QĐ13).
- Nhóm Model có nội dung thật: bỏ câu mô tả tạm `settings.model.description` (như 03 đã làm với nhóm Phụ đề và Quyền riêng tư).
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
- Tạo: `src/windows/main/models/BlockNote.tsx`
- Tạo: `src/windows/main/onboarding/ModelSteps.tsx`
- Tạo: `src/windows/main/settings/ModelSettings.tsx`
- Tạo: `src/windows/main/settings/DeleteModelsAndData.tsx`
- Sửa: `src/windows/main/onboarding/Onboarding.tsx`
- Sửa: `src/windows/main/screens/SettingsScreen.tsx`
- Sửa: `src/windows/main/settings/PrivacySettings.tsx`
- Sửa: `src/i18n/en.ts`
- Sửa: `src/i18n/vi.ts`
- Sửa: `src/windows/main/screens/Home.tsx`
- Sửa: `src/windows/main/main.tsx`

- [ ] **Step 1: Viết test của `packBadges`**

Sửa `src/lib/models.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/models.test.ts b/src/lib/models.test.ts
index 6f17ddde654d91fe600378e2ec348634496688bd..11c0d789af9ea5a45346c68e13f086b80e4c3e41 100644
--- a/src/lib/models.test.ts
+++ b/src/lib/models.test.ts
@@ -6,4 +6,5 @@ import {
   formatBytes,
   jobFor,
+  packBadges,
   progress,
   recommendedPack,
@@ -104,2 +105,15 @@ describe("tải được không", () => {
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
      Tests  1 failed | 113 passed (114)
 FAIL  src/lib/models.test.ts > packBadges > đề xuất, đang dùng hay đã tải, cần app mới hơn
 Test Files  1 failed | 11 passed (12)
```

- [ ] **Step 2: Viết `packBadges`**

Sửa `src/lib/models.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/models.ts b/src/lib/models.ts
index 64e9f033a92e4fe61d4b5503317da8da16fa082b..0f96d3faa15182c7e3c1de23234af5ada7913c77 100644
--- a/src/lib/models.ts
+++ b/src/lib/models.ts
@@ -143,2 +143,14 @@ export function shouldAutoDownload(view: ModelsView, chosen: string | null, pick
   return job.state === "idle" || job.state === "done" || job.pack !== pack.id;
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
 Test Files  12 passed (12)
      Tests  114 passed (114)
```

- [ ] **Step 3: Store của cửa sổ chính và các component**

Tạo `src/windows/main/modelsStore.ts`:

```ts
import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { createModelsStore, type ModelsStoreState } from "../../store/models";
import { appStore } from "./appStore";

// Store quản lý model của cửa sổ chính, nối với lõi Rust thật (kế hoạch 04). "Xóa model và dữ liệu" xong thì bật
// `dataCleared` của store chính, như nút "Xóa toàn bộ dữ liệu": bản chép lời, lịch sử và từ điển đang hiện bị bỏ.
export const modelsStore = createModelsStore(tauriIpc, () => {
  appStore.setState({ dataCleared: false });
  appStore.setState({ dataCleared: true });
});

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
        <div role="alert">
          <p className="error-text">
            {t(verdict.reason === "lowRam" ? "models.unsupported.lowRam" : "models.unsupported.noAvx2")}
          </p>
          <p className="error-text">{t("models.unsupported.requirements")}</p>
        </div>
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

Tạo `src/windows/main/models/BlockNote.tsx`:

```tsx
import { downloadBlock, formatBytes, type ModelsView, type PackView, remainingBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";

// Vì sao gói này không tải được: cần app mới hơn, hay ổ không đủ chỗ (phần còn phải tải cộng 1 GB, §6.7). Máy chưa
// được hỗ trợ thì `MachineInfo` báo, kèm cấu hình tối thiểu.
export function BlockNote({ view, pack }: { view: ModelsView; pack: PackView }) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const block = downloadBlock(view, pack);
  if (block === "appTooOld") return <p className="error-text">{t("models.appTooOld")}</p>;
  if (block === "noSpace") {
    const size = formatBytes(remainingBytes(pack) + 1_073_741_824, lang);
    return <p className="error-text">{t("models.noSpace", { size })}</p>;
  }
  return null;
}
```

Tạo `src/windows/main/onboarding/ModelSteps.tsx`:

```tsx
import { useEffect } from "react";
import { defaultChoice, downloadBlock, localized, packById, shouldAutoDownload } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { BlockNote } from "../models/BlockNote";
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

// Bước 3 (§4.1): tải gói đã chọn; tạm dừng rồi tải tiếp được. Vào bước này thì tự bắt đầu tải gói đã chọn
// (`shouldAutoDownload`); người dùng đi tiếp được trong lúc model tải ở nền. Đang tải gói khác (người dùng quay lại
// chọn gói khác) thì mời tạm dừng gói đó; máy chưa được hỗ trợ hay ổ không đủ chỗ thì không tải và báo lý do.
export function DownloadStep() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const download = useModels((s) => s.download);
  const pause = useModels((s) => s.pause);
  const current = useApp((s) => s.settings?.modelTier ?? null);
  const chosen = view ? defaultChoice(view, choice, current) : null;
  const pack = packById(view, chosen);
  const auto = view !== null && shouldAutoDownload(view, chosen, choice !== null || current !== null);
  useEffect(() => {
    if (auto && chosen) void download(chosen);
  }, [auto, chosen, download]);
  if (!view) return <p className="hint">{t("models.loading")}</p>;
  if (!pack) {
    return (
      <>
        <ModelsError />
        <p className="hint">{t("models.noChoice")}</p>
      </>
    );
  }
  const job = view.job;
  const other = job.state === "downloading" && job.pack !== pack.id ? packById(view, job.pack) : undefined;
  const blocked = downloadBlock(view, pack) !== null;
  return (
    <>
      <ModelsError />
      {view.verdict?.kind === "unsupported" && <MachineInfo />}
      <BlockNote view={view} pack={pack} />
      {other && (
        <div className="row" role="status">
          <span>{t("models.otherDownloading", { pack: localized(other.name, lang) })}</span>
          <button onClick={() => void pause()}>{t("models.pause")}</button>
        </div>
      )}
      <DownloadPanel />
      {pack.complete ? (
        <p>{t("models.done")}</p>
      ) : (
        !blocked && <p className="hint">{t("models.continueHint")}</p>
      )}
    </>
  );
}
```

Tạo `src/windows/main/settings/ModelSettings.tsx`:

```tsx
import { useEffect } from "react";
import { defaultChoice, downloadBlock, formatBytes, localized, packById } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { BlockNote } from "../models/BlockNote";
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
  const repair = useModels((s) => s.repair);
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
            <button disabled={downloading} onClick={() => void repair(inUse.id)}>
              {t("models.redownload")}
            </button>
          )}
        </div>
        <p className="hint">{t("models.used", { size: formatBytes(view.usedBytes, lang) })}</p>
        <MachineInfo />
      </div>
      <DownloadPanel />
      <PackList view={view} choice={chosen?.id ?? null} onChoose={choose} />
      {chosen && <BlockNote view={view} pack={chosen} />}
      {chosen && (
        <div className="row">
          {chosen.usable && chosen.id !== current && (
            <button className="primary" onClick={() => void select(chosen.id)}>
              {t("models.use")}
            </button>
          )}
          {!chosen.complete && (
            <button
              className="primary"
              disabled={downloading || downloadBlock(view, chosen) !== null}
              onClick={() => void download(chosen.id)}
            >
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
diff --git a/src/windows/main/onboarding/Onboarding.tsx b/src/windows/main/onboarding/Onboarding.tsx
index d4241b85acb6a44f832636c36e39166c1e8f6eb2..be073bf4314f7b21d7ac4805babc8a5865e1e0d7 100644
--- a/src/windows/main/onboarding/Onboarding.tsx
+++ b/src/windows/main/onboarding/Onboarding.tsx
@@ -6,2 +6,3 @@ import { Notice } from "../Notice";
 import { ListenTest } from "./ListenTest";
+import { DownloadStep, ModelStep } from "./ModelSteps";
 import { TaskbarGuide } from "./TaskbarGuide";
@@ -103,2 +104,6 @@ function StepBody({ step, platform }: { step: Step; platform: "macos" | "windows
       );
+    case "model":
+      return <ModelStep />;
+    case "download":
+      return <DownloadStep />;
     case "languages":
```

Sửa `src/windows/main/screens/SettingsScreen.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/SettingsScreen.tsx b/src/windows/main/screens/SettingsScreen.tsx
index 48917e4c9182b493daa8271c60eafe6c0ead475b..ed0d185f3ecc78d63b1751e26ecde25b11094256 100644
--- a/src/windows/main/screens/SettingsScreen.tsx
+++ b/src/windows/main/screens/SettingsScreen.tsx
@@ -7,2 +7,3 @@ import { GeneralSettings } from "../settings/GeneralSettings";
 import { HotkeySettings } from "../settings/HotkeySettings";
+import { ModelSettings } from "../settings/ModelSettings";
 import { PrivacySettings } from "../settings/PrivacySettings";
@@ -12,5 +13,4 @@ const GROUPS: readonly SettingsGroup[] = ["general", "subtitles", "audio", "mode
 
-// Nhóm do kế hoạch khác làm: Model (04), Bản quyền (06).
+// Nhóm do kế hoạch khác làm: Bản quyền (06).
 const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {
-  model: "settings.model.description",
   license: "settings.license.description",
@@ -72,2 +72,3 @@ export function SettingsScreen() {
         {group === "hotkeys" && <HotkeySettings />}
+        {group === "model" && <ModelSettings />}
         {description && (
```

Sửa `src/windows/main/settings/PrivacySettings.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/settings/PrivacySettings.tsx b/src/windows/main/settings/PrivacySettings.tsx
index 9427263ff4e2a7676a8459e2b74230c586012387..886e1391afb731ed22a90923ed537ef2c037d3ab 100644
--- a/src/windows/main/settings/PrivacySettings.tsx
+++ b/src/windows/main/settings/PrivacySettings.tsx
@@ -1,8 +1,9 @@
 import { useState } from "react";
 import { useApp, useT } from "../appStore";
+import { DeleteModelsAndData } from "./DeleteModelsAndData";
 
 // Nhóm Cài đặt "Quyền riêng tư" (§4.3): bật/tắt lưu lịch sử (Pro, mặc định tắt), và nút xóa toàn bộ dữ liệu (lịch sử và
 // từ điển thuật ngữ), có bước xác nhận. Xóa dữ liệu không đụng tới bản quyền, hạn mức hay cài đặt, và dùng được ở mọi gói.
-// Kế hoạch 04 thêm nút "Xóa model và dữ liệu" vào nhóm này.
+// Ngay sau là nút "Xóa model và dữ liệu" của kế hoạch 04.
 export function PrivacySettings() {
   const t = useT();
@@ -57,4 +58,5 @@ export function PrivacySettings() {
         </div>
       </div>
+      <DeleteModelsAndData />
     </>
   );
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 289f6f63da701a04789b203fe7c956d06192dfff..0b4a0f07859b7bbb2387bf7ab6dae7d6f23a9c52 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -103,3 +103,2 @@ export const en = {
   "settings.group.privacy": "Privacy",
-  "settings.model.description": "Model pack in use, disk space, download again or delete.",
   "settings.license.description": "License key, status and expiry date, renew or deactivate.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 9be2e9ac95dbf360d4f5a7ec016cf76d790eb742..b650f397097429692157afa5b2b4c2a12edd5db3 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -103,3 +103,2 @@ export const vi: Record<MessageKey, string> = {
   "settings.group.privacy": "Quyền riêng tư",
-  "settings.model.description": "Gói model đang dùng, dung lượng, tải lại hoặc xóa.",
   "settings.license.description": "Key bản quyền, trạng thái và ngày hết hạn, gia hạn hoặc gỡ kích hoạt.",
```

Sửa `src/windows/main/screens/Home.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/Home.tsx b/src/windows/main/screens/Home.tsx
index b41c48c69e8abae704b53f23efaa44181e692b43..f53b90ee6439228e07d08209e51438295e293ed9 100644
--- a/src/windows/main/screens/Home.tsx
+++ b/src/windows/main/screens/Home.tsx
@@ -7,2 +7,4 @@ import { useTranscript } from "../dataStores";
 import { LanguagePicker } from "../LanguagePicker";
+import { DownloadPanel } from "../models/DownloadPanel";
+import { UpdateNotice } from "../models/UpdateNotice";
 
@@ -65,2 +67,5 @@ export function Home() {
             )}
+            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
+              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
+            )}
           </div>
@@ -84,3 +89,8 @@ export function Home() {
         )}
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
diff --git a/src/windows/main/main.tsx b/src/windows/main/main.tsx
index fb383434a108ee9b43d622cfaa85bd0b6858463d..650dd0760431cbd98c8cc71bf706d89701a3d200 100644
--- a/src/windows/main/main.tsx
+++ b/src/windows/main/main.tsx
@@ -7,2 +7,3 @@ import { appStore, fallbackLanguage } from "./appStore";
 import { transcriptStore } from "./dataStores";
+import { modelsStore } from "./modelsStore";
 
@@ -31,2 +32,8 @@ transcriptStore
 
+// Quản lý model (kế hoạch 04): lỗi ở đây chỉ ghi log, phần còn lại của cửa sổ vẫn dùng được.
+modelsStore
+  .getState()
+  .init()
+  .catch((e: unknown) => console.error("không khởi tạo được quản lý model", e));
+
 // Không đọc được cài đặt hay trạng thái (lệnh bị chặn, phía Rust lỗi) thì hiện câu báo theo ngôn ngữ của hệ
```

- [ ] **Step 5: Build và test**

Run: `pnpm build 2>&1 | grep -E 'error|built in' | sed -E 's/ in [0-9]+ms//'; pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '`

Expected (lúc lập kế hoạch):

```text
✓ built
 Test Files  12 passed (12)
      Tests  114 passed (114)
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/models.test.ts src/lib/models.ts src/windows/main/modelsStore.ts src/windows/main/models src/windows/main/onboarding/ModelSteps.tsx src/windows/main/settings/ModelSettings.tsx src/windows/main/settings/DeleteModelsAndData.tsx src/windows/main/onboarding/Onboarding.tsx src/windows/main/screens/SettingsScreen.tsx src/windows/main/settings/PrivacySettings.tsx src/i18n/en.ts src/i18n/vi.ts src/windows/main/screens/Home.tsx src/windows/main/main.tsx
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
cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -cE '^(warning|error)' || true
cargo test -p meeting-translator 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
cargo deny check 2>&1 | tail -1
pnpm test 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +(Test Files|Tests) '
pnpm audit 2>&1 | tail -1
node --test --test-reporter=tap scripts/models/manifest.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```

Expected (lúc lập kế hoạch, trên `main` `d63efc6` cộng 04):

```text
fmt ok
Done
✓ built
0
passed 304 failed 0 ignored 3
advisories ok, bans ok, licenses ok, sources ok
 Test Files  12 passed (12)
      Tests  114 passed (114)
No known vulnerabilities found
# tests 6
# pass 6
# fail 0
```

- [ ] **Step 3: Phần còn lại của mục 6.2** (build `asr-worker` với whisper.cpp và test của mọi crate: lâu, cần thêm vài GiB đĩa)

Run:

```bash
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | grep -E '^error' | grep -c . || true
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings 2>&1 | grep -E '^error' | grep -c . || true
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
cargo test -p asr-worker --features shared-encode 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
cargo build --release -p asr-worker --features metal,shared-encode 2>&1 | grep -E '^error|Finished' | sed -E 's/ in [0-9.]+(s|m [0-9]+s)$//'
cargo audit 2>&1 | grep -E '^(Crate|ID|warning|error):' | grep -v 'is locked' | sort | uniq -c | sort -rn | head -8
./scripts/check-windows.sh 2>&1 | grep -E '^(warning|error)|Finished' | sed -E 's/ in [0-9.]+s$//'
rm -rf "${CARGO_TARGET_DIR:-target}/x86_64-pc-windows-msvc"
pnpm -C server install --frozen-lockfile 2>&1 | grep -E 'ERR|Done' | sed -E 's/ in [0-9.]+m?s.*//'
pnpm -C server check 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | grep -E '^ +Tests |^# (pass|fail)' | head -4
pnpm -C server audit 2>&1 | tail -1
```

Expected (lúc lập kế hoạch; hai dòng đầu là số dòng lỗi của hai lệnh clippy: cảnh báo build script của `whisper-rs-sys` có từ trước, không làm clippy lỗi; `cargo audit` chỉ còn các cảnh báo đã cho phép từ trước):

```text
0
0
passed 659 failed 0 ignored 13
passed 42 failed 0 ignored 1
    Finished `release` profile [optimized] target(s)
   1 warning: 3 allowed warnings found
   1 ID:        RUSTSEC-2024-0436
   1 ID:        RUSTSEC-2024-0429
   1 ID:        RUSTSEC-2024-0370
   1 Crate:     proc-macro-error
   1 Crate:     paste
   1 Crate:     glib
    Finished `dev` profile [unoptimized + debuginfo] target(s)
Done
      Tests  360 passed (360)
No known vulnerabilities found
```

## Task 13: Bucket R2 staging, khóa staging, manifest staging (cần người)

> **Errata 2026-10-05 (một môi trường production, spec `2026-10-04-single-production-environment-design.md`): làm task này trên production.** Không tạo bucket staging hay khóa `stg-`. Thay đổi so với chữ dưới:
> - Step 1: dùng bucket production duy nhất (`docs/release/phat-hanh.md` mục 1.3, ví dụ `ai-translator-releases`), thư mục model đặt dưới bucket đó; hoặc một bucket model production riêng nếu muốn tách. Không có bucket `-staging`.
> - Step 3–4: không tạo khóa trên máy dev. Khóa `prod-` tạo theo `phat-hanh.md` mục 1.2 (máy không mạng, USB `KHOA`), rồi commit `body.json` vào repo và chạy workflow `Sign model manifest` (GitHub Actions) để ký; tải artifact `models.json` về.
> - Step 6: điền `PRODUCTION_URL` trong `src-tauri/src/models/source.rs` (không còn `STAGING_URL`).
> - Step 7: chạy `scripts/run-dev-app.sh` (bản dev nối manifest production như người dùng thật).

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

Kiểm phần thân đúng như app sẽ kiểm, trước khi ký (N9 của review lần 1):

```bash
MANIFEST_BODY="$HOME/ai-translator-staging/body.json" cargo test -p meeting-translator --lib check_manifest_body -- --ignored --nocapture 2>&1 | grep -E '^(standard|lite|sequence|so với)|test result'
```

Expected: `standard: 8 file, 2484912654 byte`, `lite: 8 file, 1325509202 byte`, `sequence 1`, `test result: ok. 1 passed`. Lỗi thì sửa `models.config.json`, không ký.

Từ bản thứ hai trở đi, thêm `MANIFEST_PREVIOUS=<phần thân của bản đang phát hành>` vào lệnh trên (N-8 của review lần 2). Expected thêm dòng `so với bản trước: sequence <cũ> -> <mới>, không đổi id`; bản mới đổi `id` của file model thì test đỏ với danh sách chỗ đổi, sửa `models.config.json` cho `id` giữ như cũ.

Expected của bước dựng: `body.json` có 10 file; `sha256` của 6 file model trùng `models/MANIFEST.json` (lúc lập kế hoạch: `394221709cd5…`, `ae85e4a935d7…`, `5c3fe0b1408a…`, `dc5f44fcf1fa…`, `a1d52d448f81…`, `1a153a22f450…`). Ba file LICENSE lúc lập kế hoạch có 1 063, 1 078 và 1 075 byte.

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

- [ ] **Step 5 (người hoặc agent có token): Upload.** Cấu trúc trên bucket theo trường `url` của manifest: `models.json` và `NOTICE.txt` ở gốc; `whisper/…`, `hy-mt2/…`, `silero-vad/…`. `wrangler r2 object put` chỉ nhận file tới 315 MB (tài liệu Cloudflare, "Upload objects"), nên chia làm hai phần (N-5 của review lần 2).

File nhỏ bằng `wrangler` (đã `wrangler login`):

```bash
cd "$HOME/ai-translator-staging/models"
B=ai-translator-models-staging
pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/models.json" --file models.json --remote
pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/NOTICE.txt" --file NOTICE.txt --remote
for f in ggml-small-q5_1.bin whisper-LICENSE.txt whisper.cpp-LICENSE.txt; do pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/whisper/$f" --file "$f" --remote; done
pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/hy-mt2/Hy-MT2-LICENSE.txt" --file Hy-MT2-LICENSE.txt --remote
for f in silero_vad_v6.2.3.onnx silero-vad-LICENSE.txt; do pnpm -C "$OLDPWD/server" exec wrangler r2 object put "$B/silero-vad/$f" --file "$f" --remote; done
```

Ba file lớn hơn 315 MB (`ggml-large-v3-turbo-q5_0.bin` 574 MB, `Hy-MT2-1.8B-Q4_K_M.gguf` 1,13 GB, `Hy-MT2-1.8B-Q8_0.gguf` 1,9 GB) bằng `rclone` (`brew install rclone`), qua API S3 của R2, tải lên nhiều phần. Khóa của API token R2 (Step 1) nhập vào biến môi trường trong terminal, không ghi vào file cấu hình hay kế hoạch:

```bash
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="https://<account id>.r2.cloudflarestorage.com"
read -r RCLONE_CONFIG_R2_ACCESS_KEY_ID; read -rs RCLONE_CONFIG_R2_SECRET_ACCESS_KEY; export RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
rclone copyto ggml-large-v3-turbo-q5_0.bin "r2:$B/whisper/ggml-large-v3-turbo-q5_0.bin" --s3-chunk-size 64M --progress
for f in Hy-MT2-1.8B-Q4_K_M.gguf Hy-MT2-1.8B-Q8_0.gguf; do rclone copyto "$f" "r2:$B/hy-mt2/$f" --s3-chunk-size 64M --progress; done
rclone lsl "r2:$B" | sort -k4
```

Expected:
- `rclone lsl` liệt kê đủ 10 object, kích thước đúng bằng file trong `$STG`. Lúc lập kế hoạch: `574041195 … whisper/ggml-large-v3-turbo-q5_0.bin`, `190085487 … whisper/ggml-small-q5_1.bin`, `1908528192 … hy-mt2/Hy-MT2-1.8B-Q8_0.gguf`, `1133080448 … hy-mt2/Hy-MT2-1.8B-Q4_K_M.gguf`, `2327524 … silero-vad/silero_vad_v6.2.3.onnx`.
- `curl -sI <URL gốc>/models.json` và `curl -sI -H 'Range: bytes=0-0' <URL gốc>/hy-mt2/Hy-MT2-1.8B-Q8_0.gguf` lần lượt trả `200` và `206` (R2 hỗ trợ `Range`).

- [ ] **Step 6: Ghi URL staging vào app.** Sửa `src-tauri/src/models/source.rs`: `pub const STAGING_URL: Option<&str> = Some("<URL gốc>/models.json");`. Chạy `cargo test -p meeting-translator --lib models::` (Expected: mọi test qua; test `dev_builds_read_staging_or_the_env_and_release_builds_production` tự theo hằng mới).
- [ ] **Step 7 (người): Thử thật trên Mac** với `pnpm tauri dev` (bản dev nhận khóa staging), từ một hồ sơ app sạch (đổi tên tạm `~/Library/Application Support/com.aitranslator.desktop/models` nếu có):
  - Lần đầu mở: bước 2 hiện máy (RAM, ổ trống), hai gói với "khoảng 2,5 GB" và "khoảng 1,3 GB", gói Chuẩn có nhãn "Đề xuất cho máy này" (máy 16 GB trở lên).
  - Bước 3 tự tải; bấm Tạm dừng rồi Tiếp tục: tải tiếp, không tải lại từ đầu (log của app ghi request có `Range`).
  - Rớt mạng thật: tắt Wi-Fi giữa lúc tải khoảng 20 giây rồi bật lại: tải tiếp; tắt quá lâu thì báo lỗi kèm nút Tiếp tục, bấm thì tải tiếp từ chỗ dừng.
  - Tải xong: bấm Bắt đầu ở màn hình chính dịch được, dùng model trong `~/Library/Application Support/com.aitranslator.desktop/models`.
  - Cài đặt › Model: hiện gói đang dùng, dung lượng; đổi sang gói Nhẹ (tải, tự dùng); xóa gói Chuẩn.
  - Ký lại manifest với `--sequence 2` sau khi đổi một ghi chú; ngày hôm sau mở app (hay xóa `state.json` trong thư mục model để giả qua một ngày): manifest mới được nhận; đổi một file model trên bucket thì app hỏi "Có bản mới…" chứ không tự tải.
  - Sửa một byte của `models.json` trên bucket: app báo "Danh sách model từ máy chủ không hợp lệ", vẫn dùng bản cũ.
  - Tải bản cập nhật của gói đang dùng ngay sau khi mở cửa sổ chính (lần chạy sẵn đang nạp): bấm Bắt đầu (cả nút lẫn phím tắt) trong lúc tải thì app báo đang cập nhật model, không bắt đầu phiên; `ps` không còn `llama-server` hay `asr-worker` sau khi lần chạy sẵn xong và việc tải bắt đầu (Q-A của review lần 2).
  - Bản cập nhật đổi tên một file của gói đang dùng (ví dụ file `mt` thành `…-v2.gguf`): tải xong, phiên sau dùng file mới (`ps` thấy `llama-server -m …-v2.gguf`), file cũ bị dọn (Q-B của review lần 2).
  - Dung lượng trống app hiện ở bước 2 so với Finder (Get Info của ổ) trên máy có iCloud Drive: ghi cả hai số; app ít hơn Finder nhiều tới mức chặn nhầm thì báo để đổi cách đo (04a QĐ8, N-11 của review lần 2).
  - Proxy công ty kiểu PAC/WPAD: bật "Automatic Proxy Configuration" với một file PAC trỏ tới proxy thử (ví dụ `mitmproxy` hay Squid trên máy khác) và chặn đi thẳng ra ngoài; ghi app có tải được manifest và model không. `reqwest` (`system-proxy`) đọc proxy tĩnh của hệ thống; nếu PAC không được dùng thì ghi vào "Kết quả thử" để quyết có cần hỗ trợ PAC không (A7).
  - Cài đặt › Quyền riêng tư › "Xóa model và dữ liệu": thư mục model chỉ còn `manifest.json`; lịch sử, bản chép lời và từ điển cũng mất (màn hình Lịch sử và Từ điển trống ngay, không cần mở lại app); app không quay về lần đầu mở; Keychain không bị đụng tới (06 kiểm thêm, Q14).
  Ghi kết quả vào mục "Kết quả thử" ở cuối file này.
- [ ] **Step 8: Commit**

```bash
git add src-tauri/keys/manifest-public-keys.json src-tauri/src/models/source.rs
git commit -m "feat(models): khóa công khai và URL manifest staging (04 T13)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 14: Đợt Windows (cần máy Windows và người)

Dòng 105, 161, 228, 303. Làm trong đợt Windows của kế hoạch 00 (mục 3), sau 02c Task 9.

- [ ] **Step 1:** `cargo test -p meeting-translator --lib models:: -- --nocapture` trên Windows: mọi test qua. `machine::tests` trên Windows chạy `this_windows_pc_reports_ram_disk_and_cpu` (test của Mac có `cfg(target_os = "macos")`, không chạy; N-6 của review lần 2) và in `RAM <số> MiB, AVX2 <true|false>`: ghi dòng đó vào "Kết quả thử". Lần đầu chạy, tường lửa Windows có thể hỏi về server giả trên `127.0.0.1`: chọn không cho phép mạng ngoài, test vẫn chạy vì chỉ dùng loopback.
- [ ] **Step 2:** `pnpm tauri dev` trên máy có card rời 6 GB và máy card 4 GB (hay một máy, đổi ngưỡng trong manifest staging): bước 2 hiện tên card, bộ nhớ đồ họa, đề xuất đúng gói (6 GB: Chuẩn; 4 GB: Nhẹ). Máy chỉ có GPU tích hợp: gói Nhẹ. Ghi heap `DEVICE_LOCAL` báo được của từng card (để chốt ngưỡng 5 632 MiB, C7).
- [ ] **Step 3:** Model nằm ở `%LOCALAPPDATA%\com.aitranslator.desktop\models` (không phải `%LOCALAPPDATA%\AI Translator`). Tải bản cập nhật gói đang dùng khi tiến trình phụ đang chạy sẵn (vừa mở cửa sổ chính): tiến trình phụ được tắt trước, đổi tên đè thành công.
- [ ] **Step 4:** Chọn gói Chuẩn trên card 4 GB: `llama-server` tự chuyển bớt lớp sang CPU, không lỗi hết bộ nhớ (dòng 303, cùng 08).
- [ ] **Step 5:** Máy không có AVX2 (máy ảo tắt AVX2 nếu có): bước 2 báo máy chưa được hỗ trợ, nút tải bị khóa.
- [ ] **Step 6:** Proxy công ty trên Windows: "Automatically detect settings" (WPAD) hay "Use setup script" (PAC) trỏ tới proxy thử, chặn đi thẳng ra ngoài: ghi app có tải được manifest và model không (như 04b Task 13 Step 7; A7).
- [ ] **Step 7:** Bước 3 của lần đầu mở trên máy có card rời 6 GB, đi qua bước 2 thật nhanh ngay lần chạy đầu: bước 3 chờ kết quả dò GPU rồi mới tự tải, và tải gói Chuẩn (N-12 của review lần 2).

## Task 15: Cập nhật kế hoạch 00

Task 2 của kế hoạch 00, cho kế hoạch 04:
- Trạng thái các dòng ở mục "Dòng của bảng đối chiếu" của 04a: `xong` kèm SHA commit cho phần đã có test; `chờ` cho phần chờ Task 13 (T4, T7), Task 14 (Windows), C6, C7; dòng 226 giữ cho CDA (Q15).
- Mục 2.4: trạng thái "đã làm trên Mac tới Task 12", SHA; ghi "Nhận từ 04" cho 06 (gói, `ModelService::resolve` không đụng kho khóa; "Xóa model và dữ liệu" không đụng kho khóa) và cho 07 (QĐ5: TLS của updater; khóa và URL production của manifest, một khóa kèm bản sao offline theo Q17; đổi khóa có kế hoạch thì một bản phát hành tin cả `kid` cũ lẫn mới rồi bản sau bỏ `kid` cũ, lộ khóa thì bản app mới chỉ tin `kid` mới ngay (04a QĐ10, N-7 của review 04 lần 2); bộ gỡ Windows xóa `%LOCALAPPDATA%\com.aitranslator.desktop`).
- Mục 6.2: thêm `node --test scripts/models/manifest.test.mjs`.
- Mục 2.2: N1 của review cuối 02 (bộ tắt khi rảnh) do 03 sửa (03a Task 12), không phải 04; ghi chú 8 (đổi gói lúc đang dịch) đã sửa ở 04 Task 7, 9, kèm SHA.
- Spec §6.7, §8, §9, §10.2, §15 đã sửa theo 04 và quyết định của chủ dự án ở commit `0edc828`; nếu lúc thực thi có đổi gì so với kế hoạch thì soạn đề xuất sửa spec (gửi chủ dự án, không tự sửa).

## Kết quả thử

Điền sau Task 13 (Mac, staging thật) và Task 14 (Windows), và mọi chỗ phải gộp với `main` (04a, "Cách đọc kế hoạch này"): ngày, máy, kết quả từng gạch đầu dòng, và mọi chỗ lệch so với Expected.
