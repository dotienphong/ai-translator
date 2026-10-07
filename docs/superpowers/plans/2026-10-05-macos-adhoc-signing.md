# Bản macOS ký ad-hoc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bản release macOS ký ad-hoc (chưa có Developer ID) vẫn qua phép tự kiểm chữ ký và chạy được gói trả phí; có Team ID thì tự về chế độ chặt.

**Architecture:** `src-tauri/src/license/genuine.rs` chọn yêu cầu chữ ký theo hai biến lúc build (`AI_TRANSLATOR_TEAM_ID`, `AI_TRANSLATOR_MAC_SIGNING`): có Team ID hợp lệ thì yêu cầu Developer ID như cũ, không có mà cờ là `adhoc` thì chỉ yêu cầu `identifier "<bundle id>"`, còn lại thì khóa. Workflow `release.yml` đặt cờ khi `vars.APPLE_TEAM_ID` rỗng. Phần ký ad-hoc của `package-macos.sh` đã có sẵn, không sửa.

**Tech Stack:** Rust (crate `meeting-translator`, `security-framework`), GitHub Actions, Node `node:test`, tài liệu Markdown.

Spec: `docs/superpowers/specs/2026-10-05-macos-adhoc-signing-design.md`. Mọi lệnh chạy từ gốc repo `/Users/dtphong/Desktop/software_business/ai-translator`, trên Mac.

**Lệch nhỏ so với spec §3.3:** `release-check.mjs` và `check-release-config.sh` không đọc Team ID (đã grep), nên không cần sửa. Task 4 sửa lại câu đó trong spec cho khớp.

## Cấu trúc file

| File | Thay đổi |
|---|---|
| `src-tauri/src/license/genuine.rs` | Thêm `MAC_SIGNING`, `identifier_requirement`, `mac_requirement`; đổi `check_this_build` và `check_self` nhận bundle id; test mới |
| `src-tauri/src/license/app.rs:208` | Truyền `app.config().identifier` vào `check_this_build` |
| `.github/workflows/release.yml` | Đặt `AI_TRANSLATOR_MAC_SIGNING`; dòng tóm tắt khi ký không có chứng thư; chú thích đầu file |
| `scripts/release/workflow.test.mjs` | Hai test cho hai thay đổi trên |
| `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | Sửa dòng "Sửa hoặc ký lại file của app" ở §10.2 |
| `docs/superpowers/specs/2026-10-05-macos-adhoc-signing-design.md` | Sửa §3.3 |
| `docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md` | Sửa T1 (dòng 1059) và ghi chú A6 (dòng 553) |
| `docs/release/phat-hanh.md` | Thêm mục 5 về bản ký ad-hoc |
| `bench/phase1/results/gd1_adhoc_keychain.md` | Tạo ở Task 6, kết quả đo Keychain |

---

### Task 1: Chọn yêu cầu chữ ký theo biến build (logic thuần)

**Files:**
- Modify: `src-tauri/src/license/genuine.rs` (phần trên của file, và `mod tests` ở cuối)

- [ ] **Step 1: Viết test lỗi**

Trong `mod tests` của `genuine.rs`, thêm sau test `the_team_requirement_only_takes_a_real_team_id`:

```rust
    #[test]
    fn the_identifier_requirement_only_takes_a_plain_bundle_id() {
        assert_eq!(
            identifier_requirement("com.aitranslator.desktop").as_deref(),
            Some("identifier \"com.aitranslator.desktop\"")
        );
        assert_eq!(identifier_requirement("a\" or true"), None);
        assert_eq!(identifier_requirement("a b"), None);
        assert_eq!(identifier_requirement(""), None);
        assert_eq!(identifier_requirement(&"a".repeat(129)), None);
    }

    #[test]
    fn the_mac_mode_follows_the_build_variables() {
        let id = "com.aitranslator.desktop";
        let strict = team_requirement("ABCDE12345").unwrap();
        // Chặt: có Team ID hợp lệ thì cờ ad-hoc không có tác dụng.
        for flag in [None, Some("adhoc"), Some("khác")] {
            assert_eq!(mac_requirement(Some("ABCDE12345"), flag, id), Ok(strict.clone()));
        }
        // Ad-hoc: không có Team ID (hay rỗng) và cờ đúng chữ `adhoc`.
        let adhoc = Ok("identifier \"com.aitranslator.desktop\"".to_string());
        assert_eq!(mac_requirement(None, Some("adhoc"), id), adhoc);
        assert_eq!(mac_requirement(Some(""), Some("adhoc"), id), adhoc);
        // Khóa: thiếu cấu hình, hoặc cờ lạ.
        assert!(mac_requirement(None, None, id).is_err());
        assert!(mac_requirement(Some(""), None, id).is_err());
        assert!(mac_requirement(None, Some("ADHOC"), id).is_err());
        assert!(mac_requirement(None, Some(""), id).is_err());
        // Team ID đặt mà sai dạng không được rơi xuống chế độ lỏng hơn.
        assert!(mac_requirement(Some("abc"), Some("adhoc"), id).is_err());
        // Bundle id sai dạng thì ad-hoc cũng khóa.
        assert!(mac_requirement(None, Some("adhoc"), "a\" or true").is_err());
        assert!(mac_requirement(None, Some("adhoc"), "").is_err());
    }
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cargo test -p meeting-translator --lib genuine 2>&1 | tail -15`
Expected: FAIL, lỗi `cannot find function identifier_requirement` và `mac_requirement`.

- [ ] **Step 3: Viết code tối thiểu**

Trong `genuine.rs`, ngay sau dòng `pub const SIGNER: ...;` thêm:

```rust
/// Chế độ ký ad-hoc của macOS, đặt lúc build khi chưa có Developer ID (spec 2026-10-05): giá trị `adhoc`.
pub const MAC_SIGNING: Option<&str> = option_env!("AI_TRANSLATOR_MAC_SIGNING");
```

Ngay sau hàm `team_requirement` thêm:

```rust
/// Yêu cầu chữ ký chỉ ràng buộc bundle identifier, cho bản ký ad-hoc (không có Team ID để so).
pub fn identifier_requirement(identifier: &str) -> Option<String> {
    let ok = !identifier.is_empty()
        && identifier.len() <= 128
        && identifier.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-');
    ok.then(|| format!("identifier \"{identifier}\""))
}

/// Chọn yêu cầu chữ ký của macOS theo biến lúc build (bảng ở spec 2026-10-05, mục 3.1). `Err` là lý do không chính hãng.
pub fn mac_requirement(team_id: Option<&str>, mac_signing: Option<&str>, identifier: &str) -> Result<String, String> {
    match team_id.filter(|t| !t.is_empty()) {
        Some(team) => team_requirement(team).ok_or_else(|| "Team ID sai dạng".to_string()),
        None if mac_signing == Some("adhoc") => {
            identifier_requirement(identifier).ok_or_else(|| "bundle id sai dạng".to_string())
        }
        None => Err("bản phát hành thiếu Team ID".to_string()),
    }
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cargo test -p meeting-translator --lib genuine 2>&1 | tail -15`
Expected: PASS, `the_identifier_requirement_only_takes_a_plain_bundle_id` và `the_mac_mode_follows_the_build_variables` đạt, các test cũ vẫn đạt.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/license/genuine.rs
git commit -m "feat(license): chọn yêu cầu chữ ký macOS theo biến build, thêm chế độ ad-hoc chỉ ràng buộc bundle id

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Nối vào phép tự kiểm và test trên chữ ký thật

**Files:**
- Modify: `src-tauri/src/license/genuine.rs` (`check_this_build`, ba `check_self`, `mod tests`)
- Modify: `src-tauri/src/license/app.rs:208`

- [ ] **Step 1: Viết test trên chữ ký ad-hoc thật (macOS)**

Trong `mod tests` của `genuine.rs`, thêm ở cuối (sau `signatures_are_checked_against_the_requirement`):

```rust
    /// Dựng một file thực thi nhỏ, ký ad-hoc với `identifier` (cần `cc` và `codesign`, đều có trên Mac đã cài công cụ
    /// dòng lệnh). Trả (thư mục tạm, đường dẫn file).
    #[cfg(target_os = "macos")]
    fn ad_hoc_binary(identifier: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        use std::process::Command;
        use std::sync::atomic::{AtomicUsize, Ordering};
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!("mt-adhoc-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("main.c");
        std::fs::write(&source, "int main(void) { return 0; }\n").unwrap();
        let bin = dir.join("bin");
        let built = Command::new("cc").arg(&source).arg("-o").arg(&bin).status().unwrap();
        assert!(built.success(), "cc không dựng được file thử");
        let signed = Command::new("codesign")
            .args(["--force", "--sign", "-", "--identifier", identifier])
            .arg(&bin)
            .status()
            .unwrap();
        assert!(signed.success(), "codesign ad-hoc lỗi");
        (dir, bin)
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn an_ad_hoc_signature_is_checked_against_the_bundle_identifier() {
        let id = "com.aitranslator.desktop.test";
        let (dir, bin) = ad_hoc_binary(id);
        platform::check_path(&bin, &identifier_requirement(id).unwrap()).unwrap();
        assert!(platform::check_path(&bin, &identifier_requirement("com.example.other").unwrap()).is_err());
        // Chữ ký ad-hoc không phải của một Team ID nào.
        assert!(platform::check_path(&bin, &team_requirement("ABCDE12345").unwrap()).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_byte_changed_after_signing_fails_the_ad_hoc_check() {
        let id = "com.aitranslator.desktop.test";
        let (dir, bin) = ad_hoc_binary(id);
        let requirement = identifier_requirement(id).unwrap();
        platform::check_path(&bin, &requirement).unwrap();
        // Byte cuối của trang đầu (16 KiB) nằm trong vùng mã được băm, và không phải đầu mục nên file vẫn đọc được.
        let mut bytes = std::fs::read(&bin).unwrap();
        assert!(bytes.len() > 16_384, "file thử quá nhỏ: {} byte", bytes.len());
        bytes[16_383] ^= 0xff;
        std::fs::write(&bin, bytes).unwrap();
        assert!(platform::check_path(&bin, &requirement).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
```

- [ ] **Step 2: Chạy test**

Run: `cargo test -p meeting-translator --lib genuine 2>&1 | tail -20`
Expected: PASS ngay (hai test này kiểm hành vi nền của `check_path`, đã có sẵn; chúng ghi lại cách chữ ký ad-hoc được kiểm). Nếu `a_byte_changed_after_signing_fails_the_ad_hoc_check` đỏ vì `assert!(bytes.len() > 16_384)`, đổi vị trí byte thành `bytes.len() / 2` và chạy lại; nếu đỏ ở `is_err`, báo cáo, đừng đoán.

- [ ] **Step 3: Đổi `check_this_build` và ba `check_self` nhận bundle id**

Trong `genuine.rs`:

(a) Hàm `check_this_build`:

```rust
/// Kiểm bản đang chạy. `identifier` là bundle identifier của app (`app.config().identifier`), chỉ macOS dùng.
pub fn check_this_build(identifier: &str) -> Genuineness {
    if cfg!(debug_assertions) {
        return Genuineness::Skipped;
    }
    platform::check_self(identifier)
}
```

(b) Mô-đun `platform` của macOS: đổi dòng import và `check_self`:

```rust
    use super::{Genuineness, MAC_SIGNING, TEAM_ID, mac_requirement};
```

```rust
    pub fn check_self(identifier: &str) -> Genuineness {
        let requirement = match mac_requirement(TEAM_ID, MAC_SIGNING, identifier) {
            Ok(requirement) => requirement,
            Err(why) => return Genuineness::NotGenuine(why),
        };
        let path = match SecCode::for_self(Flags::NONE).and_then(|c| c.path(Flags::NONE)) {
```

(giữ nguyên phần còn lại của hàm từ dòng `let path = match …` trở xuống; chỉ thay phần đầu hàm cũ gồm `let Some(requirement) = TEAM_ID.and_then(team_requirement) else { … };`)

(c) Mô-đun `platform` của Windows: `pub fn check_self() -> Genuineness {` thành `pub fn check_self(_identifier: &str) -> Genuineness {`.

(d) Mô-đun `platform` của hệ khác: `pub fn check_self() -> Genuineness {` thành `pub fn check_self(_identifier: &str) -> Genuineness {`.

(e) Trong test `the_team_requirement_only_takes_a_real_team_id`, đổi:

```rust
        if cfg!(debug_assertions) {
            assert_eq!(check_this_build("com.example.test"), Genuineness::Skipped, "bản debug bỏ qua");
        } else if TEAM_ID.is_none() && SIGNER.is_none() && MAC_SIGNING.is_none() {
            // Bản phát hành build thiếu cấu hình ký (chưa qua CI của 07): không chính hãng, chỉ chạy Free.
            assert!(matches!(check_this_build("com.example.test"), Genuineness::NotGenuine(_)));
        }
```

Trong `src-tauri/src/license/app.rs`, dòng 208:

```rust
        let genuine = super::genuine::check_this_build(&app.config().identifier);
```

- [ ] **Step 4: Build và chạy lại test**

Run: `cargo test -p meeting-translator --lib genuine 2>&1 | tail -20`
Expected: PASS.

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -20`
Expected: không cảnh báo.

Run: `./scripts/check-windows.sh -q --locked 2>&1 | tail -10`
Expected: không lỗi (kiểm bản Windows vẫn biên dịch với chữ ký mới của `check_self`; cần `rustup target add x86_64-pc-windows-msvc`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/license/genuine.rs src-tauri/src/license/app.rs
git commit -m "feat(license): app macOS ký ad-hoc chỉ kiểm chữ ký nguyên vẹn và bundle id, có Team ID thì kiểm chặt như cũ

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Workflow đặt cờ ad-hoc và ghi tóm tắt

**Files:**
- Modify: `.github/workflows/release.yml` (chú thích đầu file dòng 21; bước "Build app (Tauri không ký)" dòng 154-157; bước "Ký app, notarize, .dmg…" của job `macos-sign-app`)
- Test: `scripts/release/workflow.test.mjs`

- [ ] **Step 1: Viết hai test lỗi**

Thêm vào cuối `scripts/release/workflow.test.mjs`:

```js
test("job build app macOS: APPLE_TEAM_ID rỗng thì build ở chế độ ký ad-hoc, có thì chế độ chặt (spec 2026-10-05)", () => {
  const step = steps(workflows[0][1]).find((s) => s.startsWith("name: Build app (Tauri không ký)"));
  assert.ok(step, "không thấy bước build app macOS");
  assert.match(step, /AI_TRANSLATOR_TEAM_ID: \$\{\{ vars\.APPLE_TEAM_ID \}\}/);
  assert.match(step, /AI_TRANSLATOR_MAC_SIGNING: \$\{\{ vars\.APPLE_TEAM_ID == '' && 'adhoc' \|\| '' \}\}/);
});

test("job ký macOS: không có chứng thư thì tóm tắt của CI ghi bản ký ad-hoc, chưa notarize", () => {
  const step = steps(workflows[0][1]).find((s) => s.startsWith("name: Ký app, notarize, .dmg"));
  assert.ok(step, "không thấy bước ký app macOS");
  assert.match(step, /if \[ "\$HAS_APPLE_CERT" != "true" \]; then[\s\S]*ký ad-hoc, chưa notarize[\s\S]*>> "\$GITHUB_STEP_SUMMARY"/);
});
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `node --test scripts/release/workflow.test.mjs 2>&1 | tail -25`
Expected: FAIL ở hai test mới (không khớp mẫu); các test cũ đạt.

- [ ] **Step 3: Sửa workflow**

(a) Bước build app macOS (dòng 154-157). Thay:

```yaml
      - name: Build app (Tauri không ký)
        env:
          AI_TRANSLATOR_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}
```

bằng:

```yaml
      - name: Build app (Tauri không ký)
        env:
          AI_TRANSLATOR_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}
          # Chưa có Team ID (chưa có Developer ID) thì bản ký ad-hoc: app chỉ kiểm chữ ký còn nguyên vẹn (spec 2026-10-05).
          AI_TRANSLATOR_MAC_SIGNING: ${{ vars.APPLE_TEAM_ID == '' && 'adhoc' || '' }}
```

(b) Bước "Ký app, notarize, .dmg, kiểm dung lượng, SHA-256" của job `macos-sign-app`: ngay sau dòng `scripts/release/package-macos.sh sign` thêm:

```bash
          if [ "$HAS_APPLE_CERT" != "true" ]; then
            echo "Bản macOS ký ad-hoc, chưa notarize (chưa có Developer ID, spec 2026-10-05): khách phải bấm Open Anyway ở lần mở đầu." >> "$GITHUB_STEP_SUMMARY"
          fi
```

(giữ đúng độ thụt 10 khoảng trắng như các dòng `scripts/release/...` trong cùng khối `run: |`)

(c) Chú thích đầu file, dòng 21. Thay:

```yaml
#   APPLE_TEAM_ID         Team ID mà app tự kiểm trong chữ ký của mình (kế hoạch 06, AI_TRANSLATOR_TEAM_ID)
```

bằng:

```yaml
#   APPLE_TEAM_ID         Team ID mà app tự kiểm trong chữ ký của mình (kế hoạch 06, AI_TRANSLATOR_TEAM_ID). Để trống thì
#                         bản macOS ký ad-hoc và app chỉ kiểm chữ ký còn nguyên vẹn (spec 2026-10-05)
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | tail -15`
Expected: PASS toàn bộ (kể cả hai test mới).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml scripts/release/workflow.test.mjs
git commit -m "ci(release): bản macOS ký ad-hoc khi APPLE_TEAM_ID rỗng, tóm tắt ghi rõ chưa notarize

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Sửa spec và tài liệu

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 1084)
- Modify: `docs/superpowers/specs/2026-10-05-macos-adhoc-signing-design.md` (mục 3.3)
- Modify: `docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md` (dòng 553 và 1059)
- Modify: `docs/release/phat-hanh.md` (thêm cuối file)

- [ ] **Step 1: Spec gốc §10.2**

Dùng Edit. `old_string`:

```
macOS dùng `SecStaticCodeCheckValidity` kèm yêu cầu đúng Team ID. Windows dùng
```

`new_string`:

```
macOS dùng `SecStaticCodeCheckValidity` kèm yêu cầu đúng Team ID; khi chưa có Developer ID, bản ký ad-hoc (cờ build `AI_TRANSLATOR_MAC_SIGNING=adhoc`, chỉ khi không có Team ID) chỉ kiểm chữ ký còn nguyên vẹn và bundle id, và tự về chế độ chặt khi có Team ID (spec 2026-10-05; ai sửa file rồi ký ad-hoc lại thì qua được, rủi ro chấp nhận). Windows dùng
```

- [ ] **Step 2: Spec 2026-10-05, mục 3.3**

Dùng Edit. `old_string`:

```
- Các kiểm tra cấu hình phát hành (`release-check.mjs`, `check-release-config.sh`) chấp nhận chế độ ad-hoc một cách tường minh, và in dòng "bản ký ad-hoc, chưa notarize" vào tóm tắt của CI.
```

`new_string`:

```
- `release-check.mjs` và `check-release-config.sh` không đọc Team ID nên không đổi. Bước ký của CI in dòng "bản ký ad-hoc, chưa notarize" vào tóm tắt khi không có chứng thư.
```

- [ ] **Step 3: Kế hoạch 00, T1 và A6**

Dùng Edit trên `docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md`.

T1. `old_string`:

```
| T1 | Apple Developer ID (99 USD/năm) | Chưa có |
```

`new_string`:

```
| T1 | Apple Developer ID (99 USD/năm) | Chưa có, chưa có ngân sách (2026-10-05). macOS chạy ký ad-hoc theo `docs/superpowers/specs/2026-10-05-macos-adhoc-signing-design.md`: gói trả phí chạy được, Gatekeeper vẫn chặn lần mở đầu, không notarize |
```

A6 (dòng 553). `old_string`:

```
| Chờ T1, T2; trang hỗ trợ thuộc website (Q8);
```

`new_string`:

```
| Chờ T1, T2 (macOS ký ad-hoc, không notarize, nên Gatekeeper và "đã notarize" chưa đạt cho tới khi có Developer ID); trang hỗ trợ thuộc website (Q8);
```

- [ ] **Step 4: Mục 5 của `docs/release/phat-hanh.md`**

Thêm vào cuối file (sau một dòng trống):

```markdown

## 5. Bản macOS ký ad-hoc (chưa có Developer ID)

Chưa có Developer ID thì để biến `APPLE_TEAM_ID` của repo **rỗng** và không nạp secret `APPLE_*`. CI tự build app với
`AI_TRANSLATOR_MAC_SIGNING=adhoc` (spec `2026-10-05-macos-adhoc-signing-design.md`), ký ad-hoc, bỏ qua notarize, và ghi dòng
"Bản macOS ký ad-hoc, chưa notarize" vào tóm tắt của lần chạy.

- App ở chế độ này chỉ kiểm chữ ký còn nguyên vẹn và bundle id; gói trả phí chạy được. Lỗi `NotGenuine` thì xem log của app.
- Gatekeeper chặn lần mở đầu. Hướng dẫn cho khách: kéo app vào Applications, mở một lần (sẽ bị chặn), rồi vào System Settings ›
  Privacy & Security, cuối trang, bấm "Open Anyway" cạnh tên app. Từ macOS 15, bấm chuột phải › Open không còn dùng được.
- Có Developer ID thì đặt `APPLE_TEAM_ID` và các secret `APPLE_*` (mục 3, "Chứng thư ký mã"); không phải sửa code. Biến
  `APPLE_TEAM_ID` có giá trị thì app về chế độ chặt (yêu cầu đúng Team ID). **Đặt `APPLE_TEAM_ID` mà vẫn ký ad-hoc thì bản đó
  bị coi là không chính hãng và chỉ chạy Free**, nên đặt cùng lúc với secret chứng thư.
- Tạm đặt `APPLE_TEAM_ID` sai dạng cũng khóa (không tự hạ xuống chế độ ad-hoc), để lỗi cấu hình lộ ra ngay.
```

- [ ] **Step 5: Kiểm lại các chỗ vừa sửa**

Run: `git diff --stat && grep -n "ad-hoc" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md docs/release/phat-hanh.md docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md | cut -c1-120`
Expected: bốn file đã đổi; mỗi file có ít nhất một dòng chứa "ad-hoc" mới.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: ghi chế độ macOS ký ad-hoc vào spec §10.2, kế hoạch 00 (T1, A6) và quy trình phát hành

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Kiểm tra chuẩn

**Files:** không sửa file.

- [ ] **Step 1: Rust**

Run: `cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace 2>&1 | tail -15`
Expected: không lỗi định dạng, không cảnh báo, mọi test đạt (khoảng 790 test; 1 test bỏ qua như cũ).

- [ ] **Step 2: Test bản quyền ở bản release, như bước CI**

Run: `cargo test --release --locked -p meeting-translator --lib -- pro:: license:: --test-threads=1 2>&1 | tail -15`
Expected: PASS, gồm `the_team_requirement_only_takes_a_real_team_id` (nhánh bản release không có biến ký: `NotGenuine`).

Run: `AI_TRANSLATOR_MAC_SIGNING=adhoc cargo test --release --locked -p meeting-translator --lib -- pro:: license:: --test-threads=1 2>&1 | tail -15`
Expected: PASS (khi có cờ, test bỏ qua nhánh `NotGenuine`, không lỗi).

- [ ] **Step 3: Node và server**

Run: `node --test "scripts/release/*.test.mjs" "scripts/*.test.mjs" 2>&1 | tail -10`
Expected: PASS.

Run: `pnpm vitest run 2>&1 | tail -6`
Expected: PASS (138 test).

- [ ] **Step 4: Báo cáo**

Ghi số test của từng lệnh vào phần trả lời. Nếu lệnh nào đỏ, dừng và sửa trước khi sang Task 6.

---

### Task 6: Dựng bản ad-hoc thật và đo Keychain (người làm, agent hướng dẫn)

**Files:**
- Create: `bench/phase1/results/gd1_adhoc_keychain.md`

Việc này cần máy Mac của chủ dự án và key thật; agent không tự chạy mục B và C. Build sidecar mất khá lâu (compile whisper.cpp và llama.cpp).

- [ ] **Step 1: Dựng bản 1**

Run (agent):

```bash
scripts/release/build-sidecars-macos.sh
node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --llama-src target/release-work/llama.cpp
AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh
```

Expected: cuối cùng có `target/release-out/AI Translator_<version>_aarch64.dmg`, và dòng `TeamIdentifier=not set` trong đầu ra của `codesign -dv`.

Run: `cp -R "target/release/bundle/macos/AI Translator.app" /tmp/at-v1.app && codesign -dv /tmp/at-v1.app 2>&1 | grep -E "Signature|TeamIdentifier|Identifier="`
Expected: `Signature=adhoc`, `TeamIdentifier=not set`, `Identifier=com.aitranslator.desktop`.

Run (mô phỏng phép tự kiểm của app trên bản đóng gói thật: chữ ký nguyên vẹn kèm code lồng bên trong, và yêu cầu bundle id):
`codesign --verify --strict --deep -R "=identifier \"com.aitranslator.desktop\"" /tmp/at-v1.app && echo REQ_OK`
Expected: `REQ_OK`. Cú pháp `-R='=…'` (có dấu `=` dính liền) bị codesign từ chối; phải truyền giá trị thành đối số riêng như trên. Với bundle id sai (`-R '=identifier "com.wrong.id"'`) lệnh phải thất bại (exit 3), để chắc phép kiểm có ý nghĩa.

- [ ] **Step 2: Dựng bản 2 khác nhị phân**

Đổi tạm phiên bản để nhị phân khác bản 1, build lại, rồi hoàn tác:

```bash
sed -i '' 's/"version": "\([^"]*\)"/"version": "\1-adhoc2"/' src-tauri/tauri.conf.json
AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh build
AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh sign
cp -R "target/release/bundle/macos/AI Translator.app" /tmp/at-v2.app
git checkout src-tauri/tauri.conf.json
codesign -dvvv /tmp/at-v1.app 2>&1 | grep CDHash; codesign -dvvv /tmp/at-v2.app 2>&1 | grep CDHash
```

Expected: hai dòng `CDHash` khác nhau.

- [ ] **Step 3: Đo (người làm), ghi vào `bench/phase1/results/gd1_adhoc_keychain.md`**

Tắt bản dev và mọi bản `AI Translator` đang chạy. Chạy lần lượt, ghi từng hộp thoại hiện ra:

A. Mô phỏng khách tải về: `ditto /tmp/at-v1.app "/Applications/AI Translator.app"` rồi
`xattr -w com.apple.quarantine "0081;$(printf %x $(date +%s));Safari;" "/Applications/AI Translator.app"`. Mở app.
Ghi: Gatekeeper chặn không; "Open Anyway" có hiện ở Privacy & Security không; sau khi cho phép, app có mở không.

B. Trong bản 1: nhập key thật, thấy Professional; bấm Bắt đầu với một nguồn âm thanh để macOS hỏi quyền thu âm, cho phép;
thấy phụ đề. Ghi: có hộp thoại Keychain nào không (số lần), hộp thoại quyền thu âm.

C. Thoát hẳn bản 1. `rm -rf "/Applications/AI Translator.app"; ditto /tmp/at-v2.app "/Applications/AI Translator.app"`
(giữ `quarantine` như ở A nếu muốn đo cả đường tải về). Mở app. Ghi: Keychain có hỏi mật khẩu không (số lần);
quyền thu âm có hỏi lại không; còn Professional và hạn mức cũ không; nhập lại key có phải làm không.

Mẫu bảng:

```markdown
# Đo Keychain và quyền với bản macOS ký ad-hoc (2026-10-05)

Máy: <tên máy, macOS>. Bản 1 CDHash `<…>`, bản 2 CDHash `<…>`.

| Bước | Quan sát |
|---|---|
| A. Mở bản 1 có quarantine | |
| B. Nhập key, bắt đầu dịch | Hộp thoại Keychain: <số lần>. Quyền thu âm: <có/không> |
| C. Mở bản 2 thay bản 1 | Hộp thoại Keychain: <số lần>. Quyền thu âm hỏi lại: <có/không>. Còn Professional: <có/không> |

Kết luận: <có cần xử lý không>
```

- [ ] **Step 4: Quyết định theo kết quả**

- Bước C không hỏi gì và dữ liệu còn nguyên: ghi kết luận "không cần xử lý", commit file kết quả, xong.
- Bước C có hỏi mật khẩu Keychain hoặc quyền thu âm: ghi kết luận, commit file kết quả, rồi quay lại với chủ dự án để lập kế hoạch nhỏ cho bước 2 của spec mục 4 (`codesign -r`, hoặc chứng thư tự cấp cố định như `scripts/run-dev-signed.sh`). Đừng tự làm bước 3 (chuyển Keychain sang file).

- [ ] **Step 5: Commit**

```bash
git add bench/phase1/results/gd1_adhoc_keychain.md
git commit -m "docs(bench): đo Keychain và quyền thu âm khi cập nhật giữa hai bản macOS ký ad-hoc

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
