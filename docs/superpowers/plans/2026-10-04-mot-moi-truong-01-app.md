# Một môi trường production · 01: App (Rust, giao diện, script chạy bản dev)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Gỡ mọi chỗ app chọn endpoint hay khóa theo kiểu build (debug = staging, release = production) để mọi bản build chỉ nói chuyện với production; đổi công tắc dev từ `AI_TRANSLATOR_DEV_FREE` (mặc định Pro) thành `AI_TRANSLATOR_DEV_PRO=true` (mặc định đi đường thật, đúng `true` mới là Pro); dựng cách `scripts/run-dev-app.sh` đọc `.env` an toàn.

**Kiến trúc:** Không thêm lớp nào. Ở mỗi module (`license/keys.rs`, `license/client.rs`, `models/signed.rs`, `models/source.rs`, `updater/source.rs`) bỏ enum môi trường, hằng `STAGING_URL` và biến ghi đè URL; còn một hằng `PRODUCTION_URL` và khối khóa `production`. `pro.rs` giữ `DevGate` nhưng chỉ cài khi bản debug có công tắc đúng `true`; mã công tắc nằm sau `cfg(debug_assertions)` và có một chuỗi chim hoàng yến để CI (kế hoạch 03) chặn khi nó lọt vào bản phát hành. Bản debug tắt tự cập nhật.

**Công nghệ:** Rust (crate `meeting-translator`, `src-tauri/`), TypeScript (chuỗi giao diện), POSIX sh, Node `node --test`. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-04-single-production-environment-design.md` (mục 2, 3). Kế hoạch này là 01 trong 3 kế hoạch của đợt; 02 (server) và 03 (script, CI, tài liệu) độc lập với nhau, làm được song song. Kế hoạch 03 Task 2 cần chuỗi chim hoàng yến `mt-dev-pro-gate-v1` và tên biến `AI_TRANSLATOR_DEV_PRO` mà Task 1 ở đây đặt.

## Điều chỉnh so với spec (đã đối chiếu code)

Spec viết trước khi đọc hết code; ba chỗ sau lệch, kế hoạch 03 Task 5 sửa lại spec cho khớp:

1. **Tên hằng:** giữ `PRODUCTION_URL` (không đổi thành `LICENSE_URL`), vì `scripts/release/release-ready.mjs` và test của nó tìm đúng dòng `pub const PRODUCTION_URL: Option<&str> = …;`.
2. **Biến ghi đè URL có ba cái, không phải hai:** `AI_TRANSLATOR_LICENSE_URL` (`license/client.rs`), `AT_MODELS_URL` (`models/source.rs`), `AI_TRANSLATOR_UPDATE_URL` (`updater/source.rs`). Cả ba bị gỡ.
3. **Không thêm trường `devPro` vào `AppStatus`:** `LicenseView.dev_override` (giao diện: `devOverride`) đã có và đã hiện một dòng nhắc ở `LicenseSettings.tsx`. Dùng lại, chỉ đổi câu chữ thành "DEV · Pro giả lập".

## Cấu trúc file

| File | Việc |
|---|---|
| `src-tauri/src/pro.rs` | Công tắc `AI_TRANSLATOR_DEV_PRO`, `DevGate`, chuỗi chim hoàng yến |
| `src-tauri/src/license/app.rs` | Cảnh báo lúc khởi động khi công tắc bật; sửa doc |
| `src-tauri/src/license/keys.rs` | Bỏ `LicenseEnv`; chỉ đọc khối `production` |
| `src-tauri/src/license/client.rs` | `for_this_build()` chỉ production; bỏ `STAGING_URL`, `URL_ENV` |
| `src-tauri/src/models/signed.rs` | Bỏ `KeyEnv`; chỉ đọc khối `production` |
| `src-tauri/src/models/source.rs` | Bỏ `STAGING_URL`, `URL_ENV`, tham số `dev` |
| `src-tauri/src/updater/source.rs` | Chỉ production; bản debug không tự cập nhật; bỏ `URL_ENV` |
| `src-tauri/keys/{license,manifest,updater}-public-keys.json` | Chỉ còn khối `production` |
| `src/i18n/{en,vi}.ts` | Câu "DEV · Pro giả lập" |
| `Cargo.toml` | `debug-assertions = false` tường minh ở profile release |
| `scripts/read-dev-env.sh` (mới), `scripts/dev-env.test.mjs` (mới), `scripts/run-dev-app.sh`, `.env.example` (mới), `.gitignore` | Đọc `.env` an toàn |

Quy ước chung: mọi lệnh chạy ở gốc repo `/Users/dtphong/Desktop/software_business/ai-translator`. Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Không đụng `src-tauri/keys/manifest-public-keys.json` trước Task 4 (file đang có thay đổi chưa commit, Task 4 ghi đè theo spec).

---

## Task 1: Công tắc dev trong `pro.rs`

**Files:**
- Modify: `src-tauri/src/pro.rs` (doc đầu file, hằng, `DevGate`, `default_gate`, `dev_override`, `install_dev_gate`, `mod tests`)
- Modify: `src-tauri/src/license/app.rs` (doc đầu file; cảnh báo trong `install`)
- Modify: `src-tauri/src/license/manager.rs:150` và `:280` (hai dòng doc)
- Modify: `src-tauri/src/lib.rs:131-132` (comment)

- [ ] **Step 1: Viết test (thay ba test cũ trong `mod tests` của `pro.rs`)**

Thay đúng khối này:

```rust
    /// Q1 của review 03 lần 1: bản release không có `DevGate`, nên mặc định là Free. Chạy cả với `--release` ở 03b
    /// Task 7.
    #[test]
    fn the_dev_gate_exists_only_in_debug_builds() {
        assert_eq!(default_gate().is_some(), cfg!(debug_assertions));
        let app = tauri::test::mock_app();
        app.manage(AppState::new(
            crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi),
            crate::settings::migrate::FileMeta::current(),
            false,
        ));
        install_default_gate(app.handle());
        assert_eq!(is_pro(app.handle()), cfg!(debug_assertions));
        assert_eq!(app.state::<AppState>().status().pro, cfg!(debug_assertions));
    }

    /// Bản phát hành không bao giờ chạy Pro không giới hạn nhờ biến môi trường (QĐ17 của 06); bản debug thì có, trừ khi
    /// `AI_TRANSLATOR_DEV_FREE=1`. Chạy cả với `--release` ở 06b Task 5.
    #[test]
    fn only_a_debug_build_runs_unlimited() {
        let asked_free = std::env::var("AI_TRANSLATOR_DEV_FREE").as_deref() == Ok("1");
        assert_eq!(dev_override(), cfg!(debug_assertions) && !asked_free);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_dev_gate_is_pro_unless_asked_to_be_free() {
        assert!(DevGate::from_value(None).is_pro());
        assert!(DevGate::from_value(Some("0")).is_pro());
        assert!(DevGate::from_value(Some("")).is_pro());
        assert!(!DevGate::from_value(Some("1")).is_pro());
    }
```

bằng khối này:

```rust
    /// Bản phát hành không có `DevGate`, nên mặc định là Free; bản debug chỉ có khi công tắc dev bật (spec 2026-10-04,
    /// §2.2). Chạy cả với `--release` (CI: "Test bản quyền ở bản release").
    #[test]
    fn the_dev_gate_exists_only_in_a_debug_build_with_the_switch_on() {
        assert_eq!(default_gate().is_some(), dev_override());
        let app = tauri::test::mock_app();
        app.manage(AppState::new(
            crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi),
            crate::settings::migrate::FileMeta::current(),
            false,
        ));
        install_default_gate(app.handle());
        assert_eq!(is_pro(app.handle()), dev_override());
        assert_eq!(app.state::<AppState>().status().pro, dev_override());
    }

    /// Bản phát hành không bao giờ chạy Pro không giới hạn nhờ biến môi trường (QĐ17 của 06); bản debug chỉ khi
    /// `AI_TRANSLATOR_DEV_PRO=true`. Chạy cả với `--release`.
    #[test]
    fn only_a_debug_build_with_the_switch_on_runs_unlimited() {
        let on = std::env::var("AI_TRANSLATOR_DEV_PRO").as_deref() == Ok("true");
        assert_eq!(dev_override(), cfg!(debug_assertions) && on);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_switch_is_on_only_for_the_exact_value_true() {
        assert!(switch_on(Some("true")));
        for value in [
            None,
            Some(""),
            Some("1"),
            Some("TRUE"),
            Some("True"),
            Some("yes"),
            Some(" true"),
            Some("true "),
        ] {
            assert!(!switch_on(value), "{value:?}");
        }
        assert!(DevGate.is_pro());
    }
```

- [ ] **Step 2: Chạy test, thấy nó không biên dịch**

Run: `cargo test --locked -p meeting-translator --lib pro:: 2>&1 | tail -15`
Expected: lỗi biên dịch `cannot find function \`switch_on\` in this scope` (và `DevGate` không phải giá trị).

- [ ] **Step 3: Cài đặt**

Trong `src-tauri/src/pro.rs`, sửa bốn chỗ (đúng chuỗi cũ → mới).

3a. Đoạn doc:

Cũ:
```rust
//! Kế hoạch 03 chỉ có bản tạm `DevGate`, **chỉ có trong bản debug** (`cfg(debug_assertions)`): luôn là Pro, trừ khi chạy
//! app với biến môi trường `AI_TRANSLATOR_DEV_FREE=1` (để thử bằng tay giao diện khi bị khóa Pro). Bản release không cài
//! gate nào, tức là Free, cho tới khi kế hoạch 06 cài trạng thái bản quyền thật bằng [`install_gate`] (một lần, ở đúng chỗ
//! của [`install_default_gate`]: `app.manage` không thay được state đã có), gọi [`refresh`] mỗi khi trạng thái bản quyền
//! đổi, và thêm kiểm tra ở nhiều chỗ theo §10.2.
```
Mới:
```rust
//! Mặc định mọi bản build đi đường thật: Free cho tới khi có token bản quyền thật (`license::app::install` cài
//! `LicenseGate` bằng [`install_gate`] một lần; `app.manage` không thay được state đã có), và [`refresh`] chạy mỗi khi
//! trạng thái bản quyền đổi. Riêng **bản debug** có công tắc dev (spec 2026-10-04, §2.2): đặt biến môi trường
//! `AI_TRANSLATOR_DEV_PRO` đúng bằng `true` thì cài `DevGate`, Pro không giới hạn, vẫn nối production cho mọi thứ khác.
//! Mã đọc công tắc nằm sau `cfg(debug_assertions)`: bản phát hành không có code đó và không có cả chuỗi tên biến
//! (`release-check.mjs no-dev-gate` chặn nếu nó lọt vào, spec §3).
```

3b. Hằng:

Cũ:
```rust
/// Biến môi trường của bản tạm: `1` thì app chạy như gói Free. Chỉ bản debug đọc biến này.
#[cfg(debug_assertions)]
pub const DEV_FREE_ENV: &str = "AI_TRANSLATOR_DEV_FREE";
```
Mới:
```rust
/// Biến môi trường của công tắc dev: đúng `true` thì bản debug chạy như Pro không giới hạn. Chỉ bản debug có biến này.
#[cfg(debug_assertions)]
pub const DEV_PRO_ENV: &str = "AI_TRANSLATOR_DEV_PRO";

/// Chuỗi chim hoàng yến, nằm trong lời cảnh báo của `license::app::install`: chỉ có trong bản debug. Binary bản phát hành
/// mà có chuỗi này là mã dev đã lọt vào (`release-check.mjs no-dev-gate`).
#[cfg(debug_assertions)]
pub const DEV_GATE_CANARY: &str = "mt-dev-pro-gate-v1";
```

3c. `DevGate`:

Cũ:
```rust
/// Bản tạm của kế hoạch 03, chỉ có trong bản debug: Pro, trừ khi `AI_TRANSLATOR_DEV_FREE=1`.
#[cfg(debug_assertions)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DevGate {
    pro: bool,
}

#[cfg(debug_assertions)]
impl DevGate {
    /// Theo giá trị của biến `AI_TRANSLATOR_DEV_FREE` (không có thì `None`).
    pub fn from_value(value: Option<&str>) -> Self {
        Self {
            pro: value != Some("1"),
        }
    }

    pub fn from_env() -> Self {
        Self::from_value(std::env::var(DEV_FREE_ENV).ok().as_deref())
    }
}

#[cfg(debug_assertions)]
impl ProGate for DevGate {
    fn is_pro(&self) -> bool {
        self.pro
    }
}
```
Mới:
```rust
/// Công tắc dev bật khi nào: chỉ giá trị đúng `true` (phân biệt hoa thường). `1`, `TRUE`, `yes`, chuỗi rỗng, có khoảng
/// trắng thừa, hay không đặt biến đều là tắt.
#[cfg(debug_assertions)]
fn switch_on(value: Option<&str>) -> bool {
    value == Some("true")
}

/// Cổng Pro của bản debug khi công tắc dev bật: luôn là Pro.
#[cfg(debug_assertions)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DevGate;

#[cfg(debug_assertions)]
impl ProGate for DevGate {
    fn is_pro(&self) -> bool {
        true
    }
}
```

3d. `default_gate`, `dev_override`, `install_dev_gate`:

Cũ:
```rust
/// Gate lúc khởi động: bản debug là `DevGate`; bản release không có gate nào (Free) cho tới khi kế hoạch 06 cài trạng thái
/// bản quyền thật.
pub fn default_gate() -> Option<Box<dyn ProGate>> {
    #[cfg(debug_assertions)]
    {
        Some(Box::new(DevGate::from_env()))
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}

/// Bản debug chạy Pro không giới hạn (`DevGate` là Pro): không đặt `AI_TRANSLATOR_DEV_FREE=1`. Bản phát hành luôn `false`.
/// Kế hoạch 06 dùng để chọn gate và bỏ hạn mức ở bản debug (`license::app::install`).
pub fn dev_override() -> bool {
    #[cfg(debug_assertions)]
    {
        DevGate::from_env().is_pro()
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// Cài `DevGate` Pro (chỉ bản debug, khi [`dev_override`]). Bản phát hành không làm gì: không có `DevGate`.
pub fn install_dev_gate<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(debug_assertions)]
    install_gate(app, Box::new(DevGate::from_value(None)));
    #[cfg(not(debug_assertions))]
    let _ = app;
}
```
Mới:
```rust
/// Gate dựng sẵn lúc khởi động: chỉ bản debug có công tắc dev bật mới có `DevGate`; còn lại không có gate nào (Free) cho
/// tới khi `license::app::install` cài trạng thái bản quyền thật.
pub fn default_gate() -> Option<Box<dyn ProGate>> {
    #[cfg(debug_assertions)]
    {
        dev_override().then(|| Box::new(DevGate) as Box<dyn ProGate>)
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}

/// Công tắc dev đang bật: chỉ bản debug có `AI_TRANSLATOR_DEV_PRO=true`. Bản phát hành luôn `false`.
/// `license::app::install` dùng để chọn gate và bỏ hạn mức.
pub fn dev_override() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_PRO_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// Cài `DevGate` Pro (chỉ bản debug, khi [`dev_override`]). Bản phát hành không làm gì: không có `DevGate`.
pub fn install_dev_gate<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(debug_assertions)]
    install_gate(app, Box::new(DevGate));
    #[cfg(not(debug_assertions))]
    let _ = app;
}
```

3e. `src-tauri/src/license/app.rs`: doc đầu file, dòng 9-10.

Cũ:
```rust
//! - Bản debug không đặt `AI_TRANSLATOR_DEV_FREE=1` thì chạy Pro không giới hạn (`DevGate`, kế hoạch 03); đặt biến này
//!   thì dùng trạng thái bản quyền thật, như bản phát hành.
```
Mới:
```rust
//! - Mặc định, kể cả bản debug, dùng trạng thái bản quyền thật. Riêng bản debug đặt `AI_TRANSLATOR_DEV_PRO=true` thì chạy
//!   Pro không giới hạn (`DevGate`, `pro.rs`), vẫn nối production cho mọi thứ khác.
```
Dòng 1-2 của file: đổi `thay `DevGate` của kế hoạch\n//! 03 ở bản phát hành` thành `thay `DevGate` ở bản phát hành`: sửa cụm "`DevGate` của kế hoạch\n//! 03" thành "`DevGate`" (xuống dòng giữ nguyên chỗ hợp lý, `cargo fmt` không đụng comment).

Trong hàm `install` thêm cảnh báo ngay sau `let dev = pro::dev_override();`:

Cũ:
```rust
    let dev = pro::dev_override();
    let license = License::new(
```
Mới:
```rust
    let dev = pro::dev_override();
    #[cfg(debug_assertions)]
    if dev {
        log::warn!(
            "{}: bản debug giả lập Pro không giới hạn ({}=true); không dùng để đo hạn mức hay thử luồng mua",
            pro::DEV_GATE_CANARY,
            pro::DEV_PRO_ENV
        );
    }
    let license = License::new(
```

3f. `src-tauri/src/license/manager.rs`:
- dòng 150: `/// Bản debug chạy Pro không giới hạn (`DevGate`, kế hoạch 03).` → `/// Công tắc dev (`AI_TRANSLATOR_DEV_PRO=true`, chỉ bản debug) đang bật: Pro không giới hạn (`DevGate`).`
- dòng 280: `/// Bản debug: Pro không giới hạn (`DevGate`).` → `/// Công tắc dev bật (chỉ bản debug): Pro không giới hạn (`DevGate`).`

3g. `src-tauri/src/lib.rs` dòng 131-132:

Cũ:
```rust
    // Điểm kiểm tra Pro duy nhất (Đ6), theo trạng thái bản quyền thật (kế hoạch 06); bản debug không đặt
    // `AI_TRANSLATOR_DEV_FREE=1` thì Pro không giới hạn.
```
Mới:
```rust
    // Điểm kiểm tra Pro duy nhất (Đ6), theo trạng thái bản quyền thật (kế hoạch 06); riêng bản debug đặt
    // `AI_TRANSLATOR_DEV_PRO=true` thì Pro không giới hạn.
```

- [ ] **Step 4: Chạy test, thấy pass (debug và release)**

Run: `cargo test --locked -p meeting-translator --lib pro:: 2>&1 | tail -15`
Expected: `test result: ok.` gồm `the_switch_is_on_only_for_the_exact_value_true`, `only_a_debug_build_with_the_switch_on_runs_unlimited`.

Run: `cargo test --release --locked -p meeting-translator --lib -- pro:: license:: --test-threads=1 2>&1 | tail -8`
Expected: `test result: ok.` (bản release không có `switch_on`, test debug-only không biên dịch, các test còn lại đạt).

Run: `AI_TRANSLATOR_DEV_PRO=true cargo test --locked -p meeting-translator --lib pro:: 2>&1 | tail -6`
Expected: `ok.` (hai test so sánh với `dev_override()` vẫn đạt khi công tắc bật).

- [ ] **Step 5: Kiểm không còn tên biến cũ**

Run: `git grep -nE "DEV_FREE|DevGate::from_(env|value)" -- src-tauri src scripts`
Expected: không dòng nào.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/pro.rs src-tauri/src/license/app.rs src-tauri/src/license/manager.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat(dev): công tắc AI_TRANSLATOR_DEV_PRO=true thay cho DEV_FREE, mặc định đi đường thật

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Khóa kiểm token chỉ có khối `production` (`license/keys.rs`)

**Files:**
- Modify: `src-tauri/src/license/keys.rs` (viết lại, giữ nguyên `decode_key`, `KeysError`, API công khai trừ chữ ký `from_json`)
- Modify: `src-tauri/keys/license-public-keys.json`

- [ ] **Step 1: Viết test mới trước (thay toàn bộ `mod tests` của `keys.rs`)**

Thay mọi thứ từ `#[cfg(test)]\nmod tests {` tới hết file bằng:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "_note": "ghi chú",
        "staging": {
            "a": {"kid": "stg-2026-10-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}
        },
        "production": {
            "a": {"kid": "prod-2026-10-1", "x": "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"},
            "b": {"kid": "prod-2026-10-2", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}
        },
        "retired": [{"kid": "prod-2026-09-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}],
        "something_new": 1
    }"#;

    #[test]
    fn only_the_production_slots_are_read() {
        let keys = PublicKeys::from_json(SAMPLE).unwrap();
        assert!(keys.get("prod-2026-10-1").is_some() && keys.get("prod-2026-10-2").is_some());
        assert!(
            keys.get("stg-2026-10-1").is_none(),
            "khối `staging` còn sót trong file cũ không bao giờ được tin"
        );
        assert!(keys.get("prod-2026-09-1").is_none(), "khóa đã bỏ (`retired`) không dùng");
    }

    #[test]
    fn a_missing_block_is_empty_and_bad_keys_are_refused() {
        assert!(PublicKeys::from_json("{}").unwrap().is_empty());
        // Chỉ có khối `staging`: `production` rỗng, không mượn khóa của staging.
        let only_staging =
            r#"{"staging": {"a": {"kid": "stg-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}}}"#;
        assert!(PublicKeys::from_json(only_staging).unwrap().is_empty());
        assert_eq!(PublicKeys::from_json("[]"), Err(KeysError::NotObject));
        assert_eq!(
            PublicKeys::from_json(r#"{"production": {"a": {"kid": "k", "x": "AAAA"}}}"#),
            Err(KeysError::BadKey("k".into()))
        );
        assert_eq!(
            PublicKeys::from_json(r#"{"production": {"a": {"kid": "k"}}}"#),
            Err(KeysError::BadEnv("production".into()))
        );
    }

    /// File build sẵn đọc được, và chỉ có khối `production` (cùng các khóa ghi chú bắt đầu bằng `_`).
    #[test]
    fn the_embedded_file_parses_and_has_only_the_production_block() {
        PublicKeys::from_json(EMBEDDED).unwrap();
        let root: Value = serde_json::from_str(EMBEDDED).unwrap();
        for (name, _) in root.as_object().unwrap() {
            assert!(name == "production" || name.starts_with('_'), "khối lạ {name}");
        }
    }

    /// Bản chép của app phải khớp `server/keys/public-keys.json` khi file đó đã có (sau kế hoạch 05, Task 21): cùng các
    /// khóa của `production`.
    #[test]
    fn the_app_copy_matches_the_server_file_when_it_exists() {
        let server = concat!(env!("CARGO_MANIFEST_DIR"), "/../server/keys/public-keys.json");
        let Ok(text) = std::fs::read_to_string(server) else {
            return;
        };
        assert_eq!(
            PublicKeys::from_json(EMBEDDED).unwrap(),
            PublicKeys::from_json(&text).unwrap(),
            "chép lại server/keys/public-keys.json vào src-tauri/keys/license-public-keys.json"
        );
    }
}
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test --locked -p meeting-translator --lib license::keys 2>&1 | tail -12`
Expected: lỗi `this function takes 2 arguments but 1 argument was supplied` ở `PublicKeys::from_json`.

- [ ] **Step 3: Sửa phần mã (không phải test) của `keys.rs`**

3a. Doc đầu file (4 dòng đầu) thay bằng:

```rust
//! Khóa công khai kiểm token bản quyền (spec §10.2, "Khóa ký token"): hai ô `a`, `b` (khóa đang ký và khóa dự phòng) của
//! production, tra theo `kid`. File `src-tauri/keys/license-public-keys.json` chép nguyên từ `server/keys/public-keys.json`
//! của license server (kế hoạch 05): app chỉ đọc khối `production`, bỏ qua `retired` (khóa đã bỏ), `_note`, mọi khối cũ
//! như `staging` và mọi khóa lạ ở gốc file (spec 2026-10-04: chỉ có một môi trường).
```

3b. Xóa enum `LicenseEnv` và `impl LicenseEnv` (từ doc `/// Môi trường của license server…` tới `}` đóng của `impl`). Thêm ngay trước `/// File khóa công khai build sẵn vào app.`:

```rust
/// Khối khóa của file: mọi bản build chỉ tin khóa production.
const BLOCK: &str = "production";

```

3c. `from_json` và `embedded` thành:

```rust
    /// Đọc khối `production` của file theo định dạng `server/keys/public-keys.json`:
    /// `{"production": {"a": {"kid", "x"}, "b": …}}`. Khối không có thì rỗng (chưa triển khai production).
    pub fn from_json(text: &str) -> Result<Self, KeysError> {
        let root: Value = serde_json::from_str(text).map_err(|_| KeysError::NotObject)?;
        let root = root.as_object().ok_or(KeysError::NotObject)?;
        let Some(block) = root.get(BLOCK) else {
            return Ok(Self::default());
        };
        let slots = block.as_object().ok_or_else(|| KeysError::BadEnv(BLOCK.into()))?;
        let mut keys = HashMap::new();
        for slot in slots.values() {
            let (Some(kid), Some(x)) = (
                slot.get("kid").and_then(Value::as_str),
                slot.get("x").and_then(Value::as_str),
            ) else {
                return Err(KeysError::BadEnv(BLOCK.into()));
            };
            keys.insert(kid.to_string(), decode_key(kid, x)?);
        }
        Ok(Self(keys))
    }

    /// Khóa production build sẵn trong app.
    pub fn embedded() -> Self {
        Self::from_json(EMBEDDED).unwrap_or_else(|e| {
            log::error!("file khóa công khai build sẵn hỏng: {e}");
            Self::default()
        })
    }
```

- [ ] **Step 4: Ghi lại file khóa build sẵn**

Ghi đè `src-tauri/keys/license-public-keys.json`:

```json
{
  "_note": "Khóa công khai kiểm token bản quyền (spec §6.8, §10.2), chép nguyên từ server/keys/public-keys.json (kế hoạch 05, Task 21). Chỉ có một môi trường, production, với hai ô a, b (khóa đang ký và khóa dự phòng). App bỏ qua `retired` và `_note`. Ô trống thì mọi token đều `unknown_kid` (gói Free).",
  "production": {}
}
```

- [ ] **Step 5: Chạy test**

Run: `cargo test --locked -p meeting-translator --lib license:: 2>&1 | tail -10`
Expected: `test result: ok.` (kể cả `license::manager`, `license::token`, `license::app` vẫn xanh).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/keys.rs src-tauri/keys/license-public-keys.json
git commit -m "$(cat <<'EOF'
refactor(license): khóa kiểm token chỉ có khối production, bỏ LicenseEnv

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Client license chỉ nối production (`license/client.rs`)

**Files:**
- Modify: `src-tauri/src/license/client.rs` (doc đầu file, hằng, `for_this_build`, thêm một test)

- [ ] **Step 1: Viết test**

Trong `mod tests` của `client.rs`, ngay sau test `only_https_is_accepted_and_http_only_for_this_machine_in_debug`, thêm:

```rust
    /// Mọi bản build (debug lẫn phát hành) nói chuyện với production và chỉ production (spec 2026-10-04, §2.1).
    #[test]
    fn every_build_talks_to_the_production_url_only() {
        assert_eq!(HttpApi::for_this_build().configured(), PRODUCTION_URL.is_some());
    }
```

- [ ] **Step 2: Sửa mã**

2a. Doc đầu file, dòng 5-6.

Cũ:
```rust
//! - Chỉ `https`, không theo redirect. Bản debug cho thêm `http://127.0.0.1` và `http://localhost` (chạy `wrangler dev`
//!   cục bộ) qua biến `AI_TRANSLATOR_LICENSE_URL`.
```
Mới:
```rust
//! - Chỉ `https`, không theo redirect. Mọi bản build, kể cả bản debug, chỉ nói chuyện với server production
//!   (`PRODUCTION_URL`); không còn biến môi trường nào đổi địa chỉ (spec 2026-10-04, §1). `accept_base` vẫn nhận `http`
//!   tới máy này, chỉ để test dựng server giả.
```

2b. Hằng.

Cũ:
```rust
/// Địa chỉ license server của từng môi trường. Điền sau khi triển khai (kế hoạch 05, Task 19 cho staging, Task 21 cho
/// production; tên miền chờ T7). Chưa có thì app chỉ dùng được token đã lưu và gói Free.
pub const STAGING_URL: Option<&str> = None;
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản debug: trỏ sang server khác (ví dụ `http://127.0.0.1:8787` của `wrangler dev`).
pub const URL_ENV: &str = "AI_TRANSLATOR_LICENSE_URL";
```
Mới:
```rust
/// Địa chỉ license server production. Điền sau khi triển khai (kế hoạch 05, Task 21; tên miền chờ T7). Chưa có thì app
/// chỉ dùng được token đã lưu và gói Free.
pub const PRODUCTION_URL: Option<&str> = None;
```

2c. `for_this_build`.

Cũ:
```rust
    /// Server của bản build này: debug là staging (hay `AI_TRANSLATOR_LICENSE_URL`), phát hành là production.
    pub fn for_this_build() -> Self {
        let base = if cfg!(debug_assertions) {
            std::env::var(URL_ENV)
                .ok()
                .and_then(|u| accept_base(&u, true))
                .or_else(|| STAGING_URL.and_then(|u| accept_base(u, false)))
        } else {
            PRODUCTION_URL.and_then(|u| accept_base(u, false))
        };
        Self::new(base)
    }
```
Mới:
```rust
    /// Server của mọi bản build, debug lẫn phát hành: production.
    pub fn for_this_build() -> Self {
        Self::new(PRODUCTION_URL.and_then(|u| accept_base(u, false)))
    }
```

- [ ] **Step 3: Chạy test**

Run: `cargo test --locked -p meeting-translator --lib license::client 2>&1 | tail -10`
Expected: `test result: ok.`

- [ ] **Step 4: Kiểm không còn tên cũ**

Run: `git grep -nE "AI_TRANSLATOR_LICENSE_URL|STAGING_URL|URL_ENV" -- src-tauri/src/license`
Expected: không dòng nào.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/license/client.rs
git commit -m "$(cat <<'EOF'
refactor(license): client chỉ nối production, bỏ STAGING_URL và AI_TRANSLATOR_LICENSE_URL

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Manifest model chỉ có khóa và URL production (`models/signed.rs`, `models/source.rs`)

**Files:**
- Modify: `src-tauri/src/models/signed.rs`
- Modify: `src-tauri/src/models/source.rs`
- Modify: `src-tauri/src/models/download.rs:16` (doc)
- Modify: `src/lib/fakeModels.ts:3` (comment)
- Overwrite: `src-tauri/keys/manifest-public-keys.json` (đang có thay đổi chưa commit thêm khóa `stg-2026-10-1`: bỏ, đúng spec §5)

- [ ] **Step 1: Viết test**

1a. `models/source.rs`: thay test `dev_builds_read_staging_or_the_env_and_release_builds_production` bằng:

```rust
    #[test]
    fn every_build_reads_the_production_url_and_only_https() {
        assert_eq!(
            manifest_url_from(Some("https://cdn.example/models.json")).map(String::from),
            Some("https://cdn.example/models.json".into())
        );
        assert!(manifest_url_from(Some("http://cdn.example/models.json")).is_none());
        assert!(
            manifest_url_from(Some("http://127.0.0.1:9000/models.json")).is_none(),
            "không còn ngoại lệ cho máy này"
        );
        assert!(manifest_url_from(Some("không phải url")).is_none());
        assert!(manifest_url_from(None).is_none());
        assert_eq!(manifest_url().is_some(), PRODUCTION_URL.is_some());
    }
```

1b. `models/signed.rs`, trong `mod tests`:

- `test_keys()`: thay hai dòng

```rust
        let wrapped = serde_json::json!({ "staging": public });
        keys_from_json(&wrapped.to_string(), KeyEnv::Staging).unwrap()
```
bằng
```rust
        let wrapped = serde_json::json!({ "production": public });
        keys_from_json(&wrapped.to_string()).unwrap()
```

- Thay hai test `built_in_keys_parse_and_contain_no_test_key` và `bad_key_files_are_rejected` bằng:

```rust
    /// Khóa build sẵn đọc được và không có khóa test nào; file chỉ có khối `production` (cùng các khóa ghi chú `_…`).
    #[test]
    fn built_in_keys_parse_and_contain_no_test_key() {
        let keys = keys_from_json(KEYS_JSON).unwrap();
        assert!(keys.iter().all(|k| !k.kid.starts_with("test-")));
        let root: Value = serde_json::from_str(KEYS_JSON).unwrap();
        for (name, _) in root.as_object().unwrap() {
            assert!(name == "production" || name.starts_with('_'), "khối lạ {name}");
        }
        assert!(!KEYS_JSON.contains("\"d\""), "không có khóa riêng");
    }

    #[test]
    fn bad_key_files_are_rejected() {
        let one = |x: &str| format!(r#"{{ "production": [{{ "kid": "prod-1", "x": "{x}" }}] }}"#);
        assert!(keys_from_json(&one("AAAA")).is_err(), "khóa ngắn");
        assert!(keys_from_json(r#"{ "production": [{ "kid": "PROD", "x": "" }] }"#).is_err());
        assert!(keys_from_json(r#"{ "production": [{ "kid": "a", "x": "b", "d": "c" }] }"#).is_err());
        assert_eq!(keys_from_json(r#"{ "_note": "x" }"#), Ok(Vec::new()));
    }

    /// Khối `staging` còn sót trong file cũ bị bỏ qua, không bao giờ được tin (spec 2026-10-04, §2.1).
    #[test]
    fn a_leftover_staging_block_is_never_trusted() {
        let text = r#"{ "staging": [{ "kid": "stg-1", "x": "ElNgklAMnOnhixubC1wYADxWSLwlk4AaNgNzRhIvWm4" }], "production": [] }"#;
        assert_eq!(keys_from_json(text), Ok(Vec::new()));
    }
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test --locked -p meeting-translator --lib models:: 2>&1 | tail -12`
Expected: lỗi biên dịch (`manifest_url_from` nhận 2 tham số, `keys_from_json` nhận 2 tham số).

- [ ] **Step 3: Sửa `models/signed.rs`**

3a. Dòng 6 (ví dụ phong bì): `"kid": "stg-2026-10-1"` → `"kid": "prod-2026-10-1"`.

3b. Doc dòng 13-15.

Cũ:
```rust
//! - Khóa công khai: `src-tauri/keys/manifest-public-keys.json`. Bản dev (`tauri::is_dev()`) chỉ nhận khối
//!   `staging`, bản phát hành chỉ nhận `production` (mục 6.5 của kế hoạch 00). Khóa `test-*` chỉ có trong test,
//!   không bao giờ build vào app. Script ký và bộ vector: `scripts/models/`.
```
Mới:
```rust
//! - Khóa công khai: `src-tauri/keys/manifest-public-keys.json`, khối `production` cho mọi bản build (spec 2026-10-04,
//!   §2.1). Khóa `test-*` chỉ có trong test, không bao giờ build vào app. Script ký và bộ vector: `scripts/models/`.
```

3c. `/// Khóa công khai build sẵn, cả hai môi trường.` → `/// Khóa công khai build sẵn.`

3d. Xóa enum `KeyEnv` và `impl KeyEnv` (từ `#[derive(Clone, Copy, Debug, PartialEq, Eq)]` đứng trước `pub enum KeyEnv` tới dấu `}` đóng của `impl KeyEnv`, gồm hai hàm `current` và `key`).

3e. `keys_from_json`.

Cũ:
```rust
/// Đọc khóa công khai của một môi trường từ file JSON dạng `{ "staging": [{ "kid", "x" }], "production": [...] }`. Khóa
/// bắt đầu bằng `_` (ghi chú) và các khối khác bị bỏ qua.
pub fn keys_from_json(text: &str, env: KeyEnv) -> Result<Vec<TrustedKey>, String> {
```
Mới:
```rust
/// Đọc khóa công khai production từ file JSON dạng `{ "production": [{ "kid", "x" }] }`. Khóa bắt đầu bằng `_` (ghi
/// chú) và các khối khác (kể cả `staging` còn sót) bị bỏ qua.
pub fn keys_from_json(text: &str) -> Result<Vec<TrustedKey>, String> {
```
và trong thân: `.get(env.key())` → `.get("production")`.

3f. `trusted_keys`:

Cũ: `keys_from_json(KEYS_JSON, KeyEnv::current()).unwrap_or_else(|e| {`
Mới: `keys_from_json(KEYS_JSON).unwrap_or_else(|e| {`

- [ ] **Step 4: Sửa `models/source.rs`**

4a. Doc đầu file, hai bullet đầu.

Cũ:
```rust
//! - Bản dev đọc URL staging (biến môi trường [`URL_ENV`] đè được, để trỏ tới server thử trên máy); bản phát hành chỉ
//!   đọc URL production. Chưa có URL thì app báo "chưa có nguồn model" và không gọi mạng.
//! - URL phải là `https`; riêng bản dev cho `http` tới `127.0.0.1` hay `localhost` (server thử).
```
Mới:
```rust
//! - Mọi bản build, kể cả bản debug, chỉ đọc URL production (spec 2026-10-04, §2.1); không còn biến môi trường nào đổi
//!   URL. Chưa có URL thì app báo "chưa có nguồn model" và không gọi mạng.
//! - URL phải là `https`.
```

4b. Hằng.

Cũ:
```rust
/// URL `models.json` của bucket staging (R2). Task 12 của kế hoạch 04 (cần người) điền sau khi tạo bucket.
pub const STAGING_URL: Option<&str> = None;
/// URL `models.json` production: kế hoạch 07 điền khi có tên miền (T7) và manifest ký trong CI (T3).
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản dev: biến môi trường này đè URL staging.
pub const URL_ENV: &str = "AT_MODELS_URL";
```
Mới:
```rust
/// URL `models.json` production: kế hoạch 07 điền khi có tên miền (T7) và manifest ký trong CI (T3).
pub const PRODUCTION_URL: Option<&str> = None;
```

4c. Hai hàm.

Cũ:
```rust
/// URL manifest theo loại bản và biến môi trường (hàm thuần, để test).
pub fn manifest_url_from(dev: bool, env: Option<String>) -> Option<Url> {
    let text = if dev {
        env.or_else(|| STAGING_URL.map(String::from))
    } else {
        PRODUCTION_URL.map(String::from)
    }?;
    let url = Url::parse(&text).ok()?;
    let ok = url.scheme() == "https" || (dev && url.scheme() == "http" && is_loopback(&url));
    ok.then_some(url)
}

/// URL manifest của bản đang chạy.
pub fn manifest_url() -> Option<Url> {
    manifest_url_from(tauri::is_dev(), std::env::var(URL_ENV).ok())
}
```
Mới:
```rust
/// URL manifest từ một chuỗi cấu hình (hàm thuần, để test): chỉ `https`.
pub fn manifest_url_from(text: Option<&str>) -> Option<Url> {
    let url = Url::parse(text?).ok()?;
    (url.scheme() == "https").then_some(url)
}

/// URL manifest của mọi bản build: production.
pub fn manifest_url() -> Option<Url> {
    manifest_url_from(PRODUCTION_URL)
}
```
(`is_loopback` vẫn dùng ở `file_url`, giữ import.)

- [ ] **Step 5: Các file nhỏ**

- `src-tauri/src/models/download.rs:15-16`: thay `(server thử\n//!   của test, `AT_MODELS_URL` của bản dev)` bằng `(server thử\n//!   của test)`.
- `src/lib/fakeModels.ts:3`: `như manifest staging` → `như manifest production`.
- Ghi đè `src-tauri/keys/manifest-public-keys.json`:

```json
{
  "_note": "Khóa công khai kiểm manifest model (spec §6.7, §10.2; spec 2026-10-04: chỉ một môi trường). Mọi bản build chỉ nhận khối production. Không bao giờ có khóa riêng (d) ở đây. Thêm khóa: scripts/models/gen-manifest-key.mjs.",
  "production": []
}
```

- [ ] **Step 6: Chạy test**

Run: `cargo test --locked -p meeting-translator --lib models:: 2>&1 | tail -10`
Expected: `test result: ok.`

Run: `git grep -nE "AT_MODELS_URL|KeyEnv|STAGING_URL" -- src-tauri/src/models src`
Expected: không dòng nào.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/models/signed.rs src-tauri/src/models/source.rs src-tauri/src/models/download.rs src-tauri/keys/manifest-public-keys.json src/lib/fakeModels.ts
git commit -m "$(cat <<'EOF'
refactor(models): manifest model chỉ có khóa và URL production, bỏ khóa stg-2026-10-1 và AT_MODELS_URL

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Cập nhật tự động chỉ production, bản debug không tự cập nhật (`updater/source.rs`)

**Files:**
- Modify: `src-tauri/src/updater/source.rs`
- Overwrite: `src-tauri/keys/updater-public-keys.json`

- [ ] **Step 1: Viết test (thay các test và helper của `mod tests`, giữ `TEST_PUBKEY` và `endpoint_per_channel`)**

Thay helper `keys`, và bốn test `dev_builds_read_staging_or_the_env_and_release_builds_only_production`, `only_https_except_loopback_http_in_dev`, `public_key_per_environment_and_only_the_tauri_format`, `the_shipped_key_file_has_no_private_key` bằng:

```rust
    fn keys(production: &str) -> String {
        serde_json::json!({ "_note": "x", "production": production }).to_string()
    }

    #[test]
    fn the_base_url_is_the_production_one() {
        assert_eq!(
            base_from(Some("https://releases.example.com/desktop/")).unwrap().as_str(),
            "https://releases.example.com/desktop/"
        );
        assert_eq!(base_from(None), None);
    }

    #[test]
    fn only_https_without_query_or_fragment() {
        let at = |url: &str| base_from(Some(url)).is_some();
        assert!(at("https://r.example.com"));
        assert!(!at("http://r.example.com"));
        assert!(!at("http://127.0.0.1:8788"), "không còn ngoại lệ cho máy này");
        assert!(!at("http://localhost:8788"));
        assert!(!at("file:///tmp/x"));
        assert!(!at("https://r.example.com/?a=1"));
        assert!(!at("https://r.example.com/#x"));
        assert!(!at("không phải URL"));
    }

    /// Bản debug không tự cập nhật: bản phát hành không được ghi đè bản dev đang code (spec 2026-10-04, §2.1).
    #[test]
    fn debug_builds_never_self_update() {
        if cfg!(debug_assertions) {
            assert_eq!(for_this_build(), None);
        }
    }

    #[test]
    fn public_key_comes_from_production_and_only_the_tauri_format() {
        let key = TEST_PUBKEY.trim();
        assert_eq!(public_key_from(&keys(key)).as_deref(), Some(key));
        let leftover = serde_json::json!({ "staging": key, "production": "" }).to_string();
        assert_eq!(public_key_from(&leftover), None, "khối `staging` còn sót không bao giờ được tin");
        let b64 = |s: &str| base64::engine::general_purpose::STANDARD.encode(s);
        let raw = base64::engine::general_purpose::STANDARD.decode(
            String::from_utf8(base64::engine::general_purpose::STANDARD.decode(key).unwrap())
                .unwrap()
                .lines()
                .nth(1)
                .unwrap(),
        );
        let raw = raw.unwrap();
        let good_line = base64::engine::general_purpose::STANDARD.encode(&raw);
        let mut short = raw.clone();
        short.pop();
        let mut not_ed = raw.clone();
        not_ed[0] = b'X';
        for bad in [
            "".to_string(),
            "không phải base64".to_string(),
            b64(&format!(
                "untrusted comment: x\n{}",
                base64::engine::general_purpose::STANDARD.encode(&short)
            )),
            b64(&format!(
                "untrusted comment: x\n{}",
                base64::engine::general_purpose::STANDARD.encode(&not_ed)
            )),
            b64(&format!("comment: x\n{good_line}")),
            b64(&format!("untrusted comment: x\n{good_line}\nthừa")),
        ] {
            assert_eq!(public_key_from(&keys(&bad)), None, "{bad}");
        }
        assert_eq!(public_key_from("{}"), None);
        assert_eq!(public_key_from("không phải JSON"), None);
    }

    #[test]
    fn the_shipped_key_file_has_no_private_key() {
        let keys: serde_json::Value = serde_json::from_str(KEYS).unwrap();
        let names: Vec<_> = keys.as_object().unwrap().keys().cloned().collect();
        assert_eq!(names, ["_note", "production"]);
        let value = keys["production"].as_str().unwrap();
        assert!(value.is_empty() || public_key_from(KEYS).is_some());
        assert!(
            !KEYS.contains("secret key"),
            "khóa riêng của minisign không bao giờ nằm trong app"
        );
    }
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test --locked -p meeting-translator --lib updater::source 2>&1 | tail -12`
Expected: lỗi `this function takes 4 arguments but 1 argument was supplied` ở `base_from`.

- [ ] **Step 3: Sửa mã `updater/source.rs`**

3a. Doc đầu file, bullet đầu.

Cũ:
```rust
//! - Bản dev: URL staging ([`URL_ENV`] đè được, cho phép `http` tới `127.0.0.1` hay `localhost` để thử với server trên
//!   máy) và khóa `staging`. Bản phát hành: chỉ URL production (`https`) và khóa `production`.
```
Mới:
```rust
//! - Chỉ URL production (`https`) và khóa `production` (spec 2026-10-04, §2.1). Không còn biến môi trường nào đổi URL.
//!   **Bản debug không tự cập nhật** (`for_this_build` trả `None`): bản phát hành không được ghi đè bản dev đang code.
```

3b. Bỏ dòng `use crate::models::download::is_loopback;`.

3c. Hằng.

Cũ:
```rust
/// URL gốc của bucket bản cập nhật staging. Task 12 của kế hoạch 07b (cần người) điền.
pub const STAGING_URL: Option<&str> = None;
/// URL gốc production: Task 12 của kế hoạch 07b điền khi có tên miền (T7) hay URL công khai của bucket production.
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản dev: biến môi trường này đè URL staging.
pub const URL_ENV: &str = "AI_TRANSLATOR_UPDATE_URL";
```
Mới:
```rust
/// URL gốc production: Task 12 của kế hoạch 07b điền khi có tên miền (T7) hay URL công khai của bucket production.
pub const PRODUCTION_URL: Option<&str> = None;
```

3d. `base_from`, `public_key_from`, `for_this_build`.

Cũ `base_from`:
```rust
/// URL gốc theo loại bản (hàm thuần, để test). Không có query hay fragment.
pub fn base_from(dev: bool, env: Option<String>, staging: Option<&str>, production: Option<&str>) -> Option<Url> {
    let text = if dev {
        env.or_else(|| staging.map(String::from))
    } else {
        production.map(String::from)
    }?;
    let url = Url::parse(&text).ok()?;
    let scheme_ok = url.scheme() == "https" || (dev && url.scheme() == "http" && is_loopback(&url));
    (scheme_ok && url.query().is_none() && url.fragment().is_none()).then_some(url)
}
```
Mới:
```rust
/// URL gốc từ một chuỗi cấu hình (hàm thuần, để test): chỉ `https`, không có query hay fragment.
pub fn base_from(production: Option<&str>) -> Option<Url> {
    let url = Url::parse(production?).ok()?;
    (url.scheme() == "https" && url.query().is_none() && url.fragment().is_none()).then_some(url)
}
```

`public_key_from`: đổi doc `/// Khóa công khai của một môi trường trong file khóa (`staging` hay `production`). Chỉ nhận…` thành `/// Khóa công khai production trong file khóa. Chỉ nhận…`; chữ ký `pub fn public_key_from(json: &str, dev: bool) -> Option<String> {` thành `pub fn public_key_from(json: &str) -> Option<String> {`; dòng `let key = keys.get(if dev { "staging" } else { "production" })?.as_str()?.trim();` thành `let key = keys.get("production")?.as_str()?.trim();`.

`for_this_build`:

Cũ:
```rust
/// Nguồn của bản đang chạy; `None` thì tự cập nhật tắt.
pub fn for_this_build() -> Option<Source> {
    let dev = cfg!(debug_assertions);
    let base = base_from(dev, std::env::var(URL_ENV).ok(), STAGING_URL, PRODUCTION_URL)?;
    let pubkey = public_key_from(KEYS, dev)?;
    Some(Source { base, pubkey })
}
```
Mới:
```rust
/// Nguồn của bản đang chạy; `None` thì tự cập nhật tắt (bản debug luôn tắt, hay thiếu URL hoặc khóa production).
pub fn for_this_build() -> Option<Source> {
    if cfg!(debug_assertions) {
        return None;
    }
    let base = base_from(PRODUCTION_URL)?;
    let pubkey = public_key_from(KEYS)?;
    Some(Source { base, pubkey })
}
```

- [ ] **Step 4: Ghi lại file khóa updater**

Ghi đè `src-tauri/keys/updater-public-keys.json`:

```json
{
  "_note": "Khóa công khai kiểm bản cập nhật (tauri-plugin-updater, spec §6.11, §10.2; kế hoạch 07b): nội dung file `.key.pub` mà `tauri signer generate` tạo (base64 một dòng). Chỉ có production (spec 2026-10-04); chuỗi rỗng thì tắt tự cập nhật. Không bao giờ có khóa riêng ở đây.",
  "production": ""
}
```

- [ ] **Step 5: Chạy test**

Run: `cargo test --locked -p meeting-translator --lib updater:: 2>&1 | tail -10`
Expected: `test result: ok.`

Run: `git grep -nE "AI_TRANSLATOR_UPDATE_URL|STAGING_URL|URL_ENV" -- src-tauri/src`
Expected: không dòng nào.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/updater/source.rs src-tauri/keys/updater-public-keys.json
git commit -m "$(cat <<'EOF'
refactor(updater): nguồn cập nhật chỉ production, bản debug không tự cập nhật

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Câu chữ giao diện và thông báo lỗi

**Files:**
- Modify: `src/i18n/en.ts:317`, `src/i18n/vi.ts:317`
- Modify: `src-tauri/src/errors.rs:73`

- [ ] **Step 1: Sửa**

`src/i18n/en.ts:317`:
```ts
  "settings.license.devOverride": "DEV · Simulated Pro: no limits, not a real licence.",
```
`src/i18n/vi.ts:317`:
```ts
  "settings.license.devOverride": "DEV · Pro giả lập: không giới hạn, không phải bản quyền thật.",
```

**Không đưa tên biến `AI_TRANSLATOR_DEV_PRO` vào chuỗi giao diện.** Bundle giao diện được nhúng vào binary bản phát hành (cả bản dịch en và vi), nên chuỗi đó sẽ làm cổng `no-dev-gate` (kế hoạch 03) báo lỗi nhầm trên bản chính thức. Chuỗi "DEV · Pro giả lập" tự nó không nằm trong danh sách chặn.
`src-tauri/src/errors.rs:73`:

Cũ: `/// Bản này chưa có URL manifest (bản dev chưa cấu hình staging; bản phát hành chờ kế hoạch 07).`
Mới: `/// Bản này chưa có URL manifest production (chờ kế hoạch 07 và tên miền T7).`

- [ ] **Step 2: Chạy test giao diện**

Run: `pnpm test 2>&1 | tail -12`
Expected: toàn bộ test vitest đạt (có test so khớp khóa giữa `en.ts` và `vi.ts`, vẫn đạt vì hai file cùng đổi).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts src/i18n/vi.ts src-tauri/src/errors.rs
git commit -m "$(cat <<'EOF'
chore(ui): nhãn "DEV · Pro giả lập" cho công tắc dev, sửa chú thích lỗi manifest

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Khóa cứng `debug-assertions` ở profile release

**Files:**
- Modify: `Cargo.toml` (`[profile.release]`)
- Create: `scripts/release/profile.test.mjs`

- [ ] **Step 1: Viết test**

Tạo `scripts/release/profile.test.mjs`:

```js
// Bản phát hành không được có `debug_assertions`: mã công tắc dev (`pro.rs`) nằm sau `cfg(debug_assertions)`, nên nếu
// profile release bật nó thì công tắc `AI_TRANSLATOR_DEV_PRO` sẽ có mặt trong bản chính thức (spec 2026-10-04, §3 lớp 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const toml = readFileSync(new URL("../../Cargo.toml", import.meta.url), "utf8");

/** Phần thân của một bảng `[tên]` cho tới bảng kế tiếp. */
function table(name) {
  const start = toml.indexOf(`[${name}]`);
  assert.notEqual(start, -1, `thiếu [${name}]`);
  const rest = toml.slice(start + name.length + 2);
  const next = rest.search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

test("profile release đặt debug-assertions = false tường minh", () => {
  assert.match(table("profile.release"), /^debug-assertions = false$/m);
});

test("không có profile nào khác của bản phát hành bật debug-assertions", () => {
  assert.doesNotMatch(toml, /debug-assertions\s*=\s*true/);
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `node --test scripts/release/profile.test.mjs 2>&1 | tail -15`
Expected: test đầu FAIL (`The input did not match the regular expression /^debug-assertions = false$/m`).

- [ ] **Step 3: Sửa `Cargo.toml`**

Cũ:
```toml
[profile.release]
strip = true
lto = true
codegen-units = 1
panic = "abort"
```
Mới:
```toml
[profile.release]
strip = true
lto = true
codegen-units = 1
panic = "abort"
# Tường minh (mặc định cũng là false): mã công tắc dev nằm sau cfg(debug_assertions), bản phát hành không được có nó.
debug-assertions = false
```

- [ ] **Step 4: Chạy lại**

Run: `node --test scripts/release/profile.test.mjs 2>&1 | tail -8`
Expected: 2 test `pass`.

Run: `cargo metadata --locked --format-version 1 --no-deps >/dev/null && echo "Cargo.toml hợp lệ"`
Expected: `Cargo.toml hợp lệ`.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml scripts/release/profile.test.mjs
git commit -m "$(cat <<'EOF'
build(release): khóa debug-assertions = false ở profile release, kèm test

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Đọc `.env` an toàn cho `scripts/run-dev-app.sh`

**Files:**
- Create: `scripts/read-dev-env.sh`
- Create: `scripts/dev-env.test.mjs`
- Create: `.env.example`
- Modify: `scripts/run-dev-app.sh` (thêm đọc `.env` và cảnh báo trước `open -W`)
- Modify: `.gitignore` (thêm `!.env.example`)
- Modify: `.github/workflows/ci.yml:53` (chạy test mới ở job macOS)

- [ ] **Step 1: Viết test**

Tạo `scripts/dev-env.test.mjs`:

```js
// Test của scripts/read-dev-env.sh: chỉ nhận khóa trong danh sách cho phép, không chạy nội dung `.env` như lệnh shell
// (spec 2026-10-04, §2.3). Chạy: `node --test scripts/dev-env.test.mjs` (macOS, cần /bin/sh).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./read-dev-env.sh", import.meta.url));

function read(t, content) {
  const dir = mkdtempSync(join(tmpdir(), "dev-env-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, ".env");
  if (content !== null) writeFileSync(file, content);
  const r = spawnSync("sh", [script, file], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr, dir };
}

test("nhận AI_TRANSLATOR_DEV_PRO, bỏ dòng trống và chú thích", (t) => {
  const r = read(t, "# ghi chú\n\nAI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(r.status, 0);
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=true\n");
});

test("không có file thì không in gì và không lỗi", (t) => {
  const r = read(t, null);
  assert.deepEqual([r.status, r.out], [0, ""]);
});

test("khóa lạ bị bỏ qua, chỉ báo tên khóa (không in giá trị)", (t) => {
  const r = read(t, "SECRET_TOKEN=abc123\nMT_LOG=1\nAI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=true\n");
  assert.match(r.err, /SECRET_TOKEN/);
  assert.doesNotMatch(r.err, /abc123/);
});

test("không chạy nội dung .env như lệnh shell", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dev-env-inj-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marker = join(dir, "da-chay");
  const r = read(
    t,
    `AI_TRANSLATOR_DEV_PRO=true; touch ${marker}\n$(touch ${marker})\n\`touch ${marker}\`\nAI_TRANSLATOR_DEV_PRO=$(touch ${marker})\n`,
  );
  assert.equal(existsSync(marker), false, "lệnh trong .env đã bị chạy");
  // Giá trị lạ vẫn được chuyển nguyên văn cho app, và app chỉ coi đúng `true` là bật (pro.rs, switch_on).
  assert.match(r.out, /^AI_TRANSLATOR_DEV_PRO=true; touch /m);
});

test("khóa có khoảng trắng hay sai chữ hoa không được nhận; dòng không có dấu = bị bỏ qua", (t) => {
  const r = read(t, " AI_TRANSLATOR_DEV_PRO=true\nAI_TRANSLATOR_DEV_PRO =true\nai_translator_dev_pro=true\nAI_TRANSLATOR_DEV_PRO\n");
  assert.equal(r.out, "");
});

test("dòng kết thúc CRLF và dòng cuối không có xuống dòng vẫn đọc đúng", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_PRO=true\r\nAI_TRANSLATOR_DEV_PRO=false");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=true\nAI_TRANSLATOR_DEV_PRO=false\n");
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `node --test scripts/dev-env.test.mjs 2>&1 | tail -15`
Expected: FAIL (không có `read-dev-env.sh`; `sh` báo `No such file or directory`).

- [ ] **Step 3: Tạo `scripts/read-dev-env.sh`**

```sh
#!/bin/sh
# Đọc `.env` của bản dev (spec 2026-10-04, §2.3) và in ra stdout các dòng `KEY=VALUE` có KEY nằm trong danh sách cho phép.
# KHÔNG `source` file: nội dung `.env` không bao giờ được chạy như lệnh shell. Khóa lạ bị bỏ qua và chỉ báo tên khóa ở
# stderr (không in giá trị, vì `.env` có thể chứa thứ khác). Giá trị chuyển nguyên văn; app tự quyết (`pro.rs` chỉ coi
# đúng `true` là bật).
#
#   sh scripts/read-dev-env.sh .env
set -eu
file=${1:-}
if [ -z "$file" ] || [ ! -f "$file" ]; then
  exit 0
fi
allowed="AI_TRANSLATOR_DEV_PRO"
while IFS= read -r line || [ -n "$line" ]; do
  line=$(printf '%s' "$line" | tr -d '\r')
  case "$line" in
    '' | '#'*) continue ;;
  esac
  case "$line" in
    *=*) ;;
    *)
      echo "bỏ qua một dòng .env không có dấu '='" >&2
      continue
      ;;
  esac
  key=${line%%=*}
  value=${line#*=}
  case " $allowed " in
    *" $key "*) printf '%s=%s\n' "$key" "$value" ;;
    *) echo "bỏ qua khóa .env không được phép: $key" >&2 ;;
  esac
done <"$file"
```

Run: `chmod +x scripts/read-dev-env.sh`

- [ ] **Step 4: Chạy test**

Run: `node --test scripts/dev-env.test.mjs 2>&1 | tail -15`
Expected: 6 test `pass`.

- [ ] **Step 5: Nối vào `scripts/run-dev-app.sh`**

Trước dòng `open -W "$@" "$app"`, ngay sau vòng `for name in $(env | sed ... MT_ ...)`:

Cũ:
```sh
set --
for name in $(env | sed -n 's/^\(MT_[A-Za-z0-9_]*\)=.*/\1/p'); do
  set -- "$@" --env "$name=$(printenv "$name")"
done
open -W "$@" "$app"
```
Mới:
```sh
set --
for name in $(env | sed -n 's/^\(MT_[A-Za-z0-9_]*\)=.*/\1/p'); do
  set -- "$@" --env "$name=$(printenv "$name")"
done
# `.env` ở gốc repo (đã gitignore, mẫu: `.env.example`): chỉ các khóa trong danh sách cho phép, không `source` (spec
# 2026-10-04, §2.3). Biến `AI_TRANSLATOR_DEV_PRO` đặt trong shell KHÔNG được chuyển; chỉ `.env` mới bật công tắc.
dev_pro=off
pairs=$(sh "$root/scripts/read-dev-env.sh" "$root/.env")
oldifs=$IFS
IFS='
'
for pair in $pairs; do
  set -- "$@" --env "$pair"
  if [ "$pair" = "AI_TRANSLATOR_DEV_PRO=true" ]; then dev_pro=on; fi
done
IFS=$oldifs
if [ "$dev_pro" = on ]; then
  echo "================================================================" >&2
  echo "CẢNH BÁO: AI_TRANSLATOR_DEV_PRO=true. Bản này GIẢ LẬP Pro không giới hạn." >&2
  echo "Không dùng để đo hạn mức hay thử luồng mua; muốn thử đường thật thì đặt false." >&2
  echo "================================================================" >&2
fi
open -W "$@" "$app"
```

Cập nhật chú thích đầu script: thêm vào đoạn "App mở bằng `open` không thừa hưởng biến môi trường…" một dòng: `# Công tắc Pro của bản dev đặt trong \`.env\` (xem \`.env.example\`).`

- [ ] **Step 6: `.env.example` và `.gitignore`**

Tạo `.env.example`:

```sh
# Mẫu cho `.env` (không commit `.env`). `scripts/run-dev-app.sh` chỉ đọc các khóa dưới đây; khóa khác bị bỏ qua.
#
# Công tắc Pro của BẢN DEV (bản debug). Chỉ đúng `true` mới bật; mọi giá trị khác là tắt.
#   false (mặc định): dev kích hoạt Pro thật như người dùng thật, nối server production.
#   true:  app giả lập Pro không giới hạn, vẫn nối production cho mọi thứ khác; không tạo bản ghi nào ở server.
# Bản phát hành không có công tắc này (không có cả mã đọc nó).
AI_TRANSLATOR_DEV_PRO=false
```

`.gitignore`: dòng 28 `.env*` giữ nguyên, thêm ngay sau:

```
!.env.example
```

Run: `git check-ignore -v .env .env.local .env.example; echo "exit=$?"`
Expected: `.env` và `.env.local` được liệt kê là bị ignore; `.env.example` không (dòng `!.env.example`).

- [ ] **Step 7: Chạy thử script (không mở app)**

Run: `printf 'AI_TRANSLATOR_DEV_PRO=true\nSECRET=x\n' > /tmp/mt-env-check && sh scripts/read-dev-env.sh /tmp/mt-env-check; rm /tmp/mt-env-check`
Expected: stdout `AI_TRANSLATOR_DEV_PRO=true`, stderr `bỏ qua khóa .env không được phép: SECRET`.

Run: `sh -n scripts/run-dev-app.sh && echo "cú pháp sh hợp lệ"`
Expected: `cú pháp sh hợp lệ`.

- [ ] **Step 8: CI chạy test mới**

`.github/workflows/ci.yml` dòng 53 (job macOS):

Cũ: `        run: node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs`
Mới: `        run: node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/dev-env.test.mjs`

(Job Windows giữ nguyên: script `.sh` chỉ dành cho macOS.)

- [ ] **Step 9: Commit**

```bash
git add scripts/read-dev-env.sh scripts/dev-env.test.mjs scripts/run-dev-app.sh .env.example .gitignore .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
feat(dev): run-dev-app.sh đọc .env an toàn (danh sách cho phép, không source), thêm .env.example

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Kiểm toàn bộ phần app

**Files:** không sửa file (trừ khi có lỗi).

- [ ] **Step 1: Định dạng và clippy**

Run: `cargo fmt --all -- --check && echo "fmt ok"`
Expected: `fmt ok`. (Lỗi thì chạy `cargo fmt --all` rồi commit riêng `style: cargo fmt`.)

Run: `cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -15`
Expected: kết thúc `Finished`, không cảnh báo (đặc biệt không có `unused import` ở `models/source.rs`, `updater/source.rs`).

- [ ] **Step 2: Test toàn workspace và bản release**

Run: `cargo test --locked --workspace 2>&1 | tail -15`
Expected: mọi `test result: ok.`

Run: `cargo test --release --locked -p meeting-translator --lib -- pro:: license:: --test-threads=1 2>&1 | tail -8`
Expected: `test result: ok.`

- [ ] **Step 3: Giao diện và script**

Run: `pnpm build 2>&1 | tail -6 && pnpm test 2>&1 | tail -8`
Expected: build thành công; vitest đạt hết.

Run: `node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/dev-env.test.mjs 2>&1 | tail -12`
Expected: `fail 0`. **Lưu ý:** `scripts/models/manifest.test.mjs` còn test staging cũ cho tới khi kế hoạch 03 Task 1 xong; nếu nó fail ở đây thì không phải lỗi của kế hoạch này, ghi lại và tiếp tục.

- [ ] **Step 4: Không còn dấu vết staging trong app**

Run: `git grep -niE "staging|\bstg\b|AI_TRANSLATOR_(LICENSE|UPDATE)_URL|AT_MODELS_URL|DEV_FREE" -- src-tauri/src src-tauri/keys src scripts/run-dev-app.sh Cargo.toml`
Expected: chỉ còn các dòng có chủ ý trong test (chuỗi `staging` ở `a_leftover_staging_block_is_never_trusted`, `SAMPLE`, `only_staging`, `leftover`). Dòng nào khác thì sửa.

Run: `git grep -nE "AI_TRANSLATOR_DEV_PRO|AI_TRANSLATOR_DEV_FREE|mt-dev-pro-gate-v1" -- src index.html overlay.html public src-tauri/tauri.conf.json`
Expected: không dòng nào. Giao diện và cấu hình được nhúng vào binary bản phát hành; chuỗi của công tắc chỉ được nằm trong mã Rust sau `cfg(debug_assertions)`, `scripts/` và tài liệu.

- [ ] **Step 5: Nghiệm thu thủ công (cần máy macOS, báo trước vì chiếm máy)**

1. `scripts/run-dev-app.sh` không có `.env`: app mở, ở **gói Free** (tính năng Pro bị khóa), không lỗi khởi động, log không có `mt-dev-pro-gate-v1`.
2. Tạo `.env` với `AI_TRANSLATOR_DEV_PRO=true`: script in khung CẢNH BÁO, app mở với nhãn "DEV · Pro giả lập" ở Cài đặt › Bản quyền, dùng được tính năng Pro không hạn mức; log có dòng `mt-dev-pro-gate-v1: bản debug giả lập Pro…`.
3. `.env` với `AI_TRANSLATOR_DEV_PRO=1` (hay `TRUE`): vẫn Free.
4. Bản debug có chứa chuỗi chim hoàng yến (chứng tỏ cổng quét của kế hoạch 03 có cái để bắt): `strings target/debug/meeting-translator | grep -c mt-dev-pro-gate-v1` in số lớn hơn 0.

- [ ] **Step 6: Ghi kết quả**

Không commit gì thêm nếu mọi bước sạch. Báo lại: số test của mỗi lệnh, và kết quả 4 điểm nghiệm thu thủ công.

---

## Tự rà soát (đối chiếu spec)

| Yêu cầu của spec | Task |
|---|---|
| §2.1 gỡ chọn endpoint theo build: `client.rs`, `keys.rs`, `models/*`, `updater/source.rs`, các `*-public-keys.json` | 2, 3, 4, 5 |
| §2.1 bỏ biến ghi đè URL | 3, 4, 5 (cả ba biến) |
| §2.1 bản debug không tự cập nhật | 5 |
| §2.1 `errors.rs` | 6 |
| §2.2 `pro.rs`: `DEV_PRO_ENV`, mặc định đảo, chỉ `true` | 1 |
| §2.2 nhãn "DEV · Pro giả lập", log cảnh báo | 1 (log), 6 (nhãn; dùng lại `devOverride`) |
| §2.2 `genuine.rs` giữ nguyên | không đổi |
| §2.3 `run-dev-app.sh` đọc `.env` không `source`, cảnh báo, `.env.example`, `!.env.example` | 8 |
| §3 lớp 1 (biên dịch loại bỏ) | 1 |
| §3 lớp 2 (khóa profile) | 7 |
| §3 lớp 3 (chim hoàng yến) | 1 (hằng và log); quét ở kế hoạch 03 |
| §3 lớp 4 (cổng CI) | kế hoạch 03 Task 2, 3 |
| §3 lớp 5–8 | 1, 8 (và `devOverride` ở giao diện) |
| §6 test Rust, nghiệm thu thủ công 1–3 | 1–5, 9 |

Phần không thuộc kế hoạch này: server (kế hoạch 02), script ký khóa, cổng quét binary, sửa spec gốc, `CLAUDE.md` (kế hoạch 03).
