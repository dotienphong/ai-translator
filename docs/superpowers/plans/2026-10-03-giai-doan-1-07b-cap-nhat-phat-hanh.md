# Giai đoạn 1 · 07b: Tự cập nhật, khóa production và phát hành

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần còn lại của kế hoạch 07 (mục 2.7 của kế hoạch 00) sau 07a:
- Tự cập nhật bằng `tauri-plugin-updater` (F9, spec §6.11): kênh stable và beta theo `updateChannel` (§6.9); kiểm lúc mở app và mỗi 24 giờ; tải nền; cài ở lần thoát kế tiếp; khi app rảnh thì mời khởi động lại ở cửa sổ chính và menu khay (Q13). Khởi động lại qua `AppHandle::request_restart`, không bị chặn thoát (01 QĐ7, §4.3). TLS của hệ điều hành (`native-tls`) như phần mạng của 04, 06.
- Bản cập nhật ký bằng khóa minisign của Tauri, chữ ký gắn phiên bản (`requireSignedVersion`). Manifest cập nhật (`latest.json`) của từng kênh trên R2; job `publish` của `release.yml` đăng bản sau khi người duyệt, không bao giờ ghi đè bản đã phát hành.
- Khóa production theo Q17: một khóa ký bản cập nhật, một khóa ký manifest model, tạo trên máy không nối mạng, nhập thẳng vào secret, bản sao offline mã hóa bằng passphrase; quy trình đổi khóa và lộ khóa (`docs/release/phat-hanh.md`).
- Khóa công khai production của manifest model, `PRODUCTION_URL` của manifest model và của bản cập nhật, khối production của license (05 Task 21), tên miền website trong `EXTERNAL_HOSTS`: điền ở task của người, và job `publish` không đăng gì khi còn thiếu (`release-ready.mjs`).
- Chuỗi phát hành cuối: tag `vX.Y.Z` hay `vX.Y.Z-beta.N` → build và ký (07a) → đăng lên R2 → bản nháp GitHub Release.
- Phần thử của người: cập nhật thật từ bản trước, Gatekeeper và SmartScreen, đo lại thời gian chờ lần đầu với bản đã notarize (dòng 150), kiểm bảng SHA-256 trên bản đã cài, THIRD_PARTY_NOTICES trên cây cuối.
- Việc 07a để lại cho 07b: giá trị `Run` trên Windows có dấu nháy (01, mục 2.7).

Không làm ở đây: chọn dịch vụ ký Windows và tài khoản Apple (điểm cần quyết 1, 2 của 07a), website và trang tải (Q8), bản stable đầu tiên (sau khi 08 nghiệm thu đạt).

**Kiến trúc:**
- `src-tauri/src/updater/`:
  - `source.rs`: URL gốc và khóa công khai của bản build này. Bản dev dùng staging (biến `AI_TRANSLATOR_UPDATE_URL` đè được, cho phép `http` tới máy mình), bản phát hành chỉ dùng production. Thiếu URL hay khóa thì tắt tự cập nhật, không gọi mạng.
  - `backend.rs`: ba trait (`Backend`, `Found`, `Install`) và bản thật bọc plugin. Plugin kiểm phiên bản, kiểm chữ ký, ghi file chỉ sau khi chữ ký đúng.
  - `mod.rs`: luồng nền và trạng thái (`Updater`), cài lúc thoát, khởi động lại để cập nhật.
- Plugin chỉ dùng từ Rust: không cửa sổ nào được cấp lệnh của plugin (`acl_tests`). Giao diện chỉ thấy `AppStatus.updateReady` và lệnh `restart_to_update`.
- Bản đã tải nằm ở `app_local_data_dir/updates/<phiên bản>.bin`, cài trong `RunEvent::Exit` sau khi kill tiến trình phụ và lưu lịch sử. Windows: plugin chạy bộ cài NSIS (passive) rồi thoát tiến trình; chỉ khi khởi động lại để cập nhật thì bộ cài mở lại app.
- R2: `<URL gốc>/<phiên bản>/<file>` (không bao giờ ghi đè) và `<URL gốc>/<stable|beta>/latest.json` (ghi sau cùng, `no-cache`). Script ở `scripts/release/` (Node 24, không gói npm nào), có test `node --test`; test của app cho plugin thật đọc đúng `latest.json` mà script sinh.

**Công nghệ:** Thêm crate `tauri-plugin-updater` 2.13.1 (bảng dưới). Không thêm gói npm nào: không dùng `@tauri-apps/plugin-updater` (plugin không cấp cho webview). `pnpm-lock.yaml` và `server/pnpm-lock.yaml` giữ nguyên; wrangler 4.145.0 của `server/` dùng để tải lên R2.

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.7). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (§4.3, §6.9, §6.11, §10.2, Q13, Q17). Kế hoạch trước: `2026-10-02-giai-doan-1-07a-ci-dong-goi.md`.

---

## Phiên bản đã chốt (kiểm ngày 2026-10-03, theo §6.12)

Kiểm bằng API công khai của crates.io (ngày phát hành, giấy phép, MSRV, bản ổn định mới nhất). Mọi bản đã ra ít nhất 1 ngày.

| Crate | Phiên bản | Ngày | Giấy phép | Ghi chú |
|---|---|---|---|---|
| `tauri-plugin-updater` | 2.13.1 | 2026-09-29 | Apache-2.0 OR MIT | Bản ổn định mới nhất (3.0.0-alpha không dùng). MSRV 1.90 (repo 1.98.1). Cần `tauri` ^2.12 (repo 2.12.1, cùng dòng 2.x), `reqwest` ^0.13 (cùng bản 0.13 của app, không thêm bản thứ hai). `default-features = false` + `native-tls` + `system-proxy`: bỏ `rustls-tls` và `zip` (QĐ1) |
| `minisign-verify` | 0.2.5 | 2026-03-03 | MIT | Kéo theo plugin (`^0.2`); 0.3.0 mới hơn nhưng plugin chưa nhận |
| `osakit` | 0.3.1 | 2025-03-01 | MIT OR Apache-2.0 | Chỉ macOS: plugin xin quyền admin qua AppleScript khi không ghi được vào thư mục của `.app` |
| `objc2-osa-kit` | 0.3.2 | 2025-10-04 | Zlib OR Apache-2.0 OR MIT | Chỉ macOS, theo `osakit`; cùng dòng `objc2` 0.6 của app |
| `tar` | 0.4.46 | 2026-05-18 | MIT OR Apache-2.0 | Chỉ macOS: giải nén `.app.tar.gz` |
| `filetime` | 0.2.29 | 2026-05-12 | MIT OR Apache-2.0 | Theo `tar` |
| `xattr` | 1.6.1 | 2025-09-21 | MIT OR Apache-2.0 | Theo `tar` |

Mọi crate khác mà plugin cần (`base64` 0.22, `semver`, `time`, `tempfile`, `infer`, `http`, `url`, `zip` không bật) đã có trong `Cargo.lock`. Giấy phép đều nằm trong allow-list của `deny.toml`; THIRD_PARTY_NOTICES tự có thêm các crate này (Task 9).

## Cách đọc kế hoạch này

- **Thứ tự và trạng thái đầu.** Làm trên `main` sau khi 07a đã thực thi (cây code `46b8521`, trùng chuỗi tham chiếu `plan07a-r3` của 07a, trên `0d9e243`). Task 0 sửa vài file của 07a theo review cuối thực thi 07a, vì 07b cũng sửa `release.yml` và dùng `take-artifact.mjs`. Lúc lập kế hoạch, mọi task dựng trên `plan07a-r3`. Trước mỗi task, `git status` phải sạch.
- **Khối code.** Như 07a: "Tạo `<file>`" chép nguyên khối vào file mới; "Thay toàn bộ `<file>` bằng" ghi đè cả file; "Sửa `<file>` (áp bằng `git apply`)" là bản vá chuẩn có dòng `index` đầy đủ, lưu khối vào file tạm rồi `git apply <file tạm>` từ gốc repo (lỗi thì `git apply --3way`; vẫn lỗi thì dừng); "Run:" kèm khối `bash` chạy cả khối từ gốc repo.
- **Khối Expected.** Output thật, lấy từ một lần chạy lại toàn bộ các task trên một clone sạch (`0d9e243` cộng chuỗi tham chiếu của 07a), bằng chính các khối của file này (`$S/p07b-gen/run.py`, `S=/Users/dtphong/Desktop/software_business/meeting-translator-work`). Thêm `$S/p07b-gen/check_md.py` đọc file này như implementer, áp mọi khối Tạo/Thay toàn bộ/Sửa lên một clone sạch: cây sau mỗi Task 0–8 khớp đúng commit tham chiếu. Đường dẫn đã đổi về gốc repo. Thời gian chạy khác; số test, tên lỗi phải giống. `target/` phải là thư mục thật, không phải symlink: Tauri từ chối `current_exe()` có symlink, nên test của Task 2 đỏ. Lần chạy lại đầy đủ (có build) chạy trên chuỗi trước khi thêm Task 0; Task 0 chỉ đổi script và workflow, nên sau đó chạy lại toàn bộ các lệnh không build trên chuỗi cuối (Expected của Task 0, các lệnh Node, vitest, actionlint); output của các lệnh build Rust giữ từ lần trước, cùng mã Rust.
- **Không có khóa thật nào.** Task 1 và 2 dùng một khóa thử tạo lúc lập kế hoạch: chỉ khóa công khai và các chữ ký nằm trong `src-tauri/src/updater/testdata/`, khóa riêng đã xóa ngay sau khi ký. Khóa production chỉ tạo ở Task 11 (người).
- **Không mở app, không bật hộp thoại quyền.** Thử app đã đóng gói và cập nhật thật là Task 13–14 (người).
- **Task cần người hay Windows** ghi rõ ở tiêu đề: Task 11–15. Số task bắt đầu từ 0 (Task 0 thêm sau review cuối 07a), các số khác giữ như bản trước để khớp review.

## Bảng task và commit tham chiếu

Chuỗi commit dựng lúc lập kế hoạch nằm ở `$S/p07-repo`, nhánh `plan07b-r6` (trên `plan07a-r3` của 07a). Sau mỗi task, so cây: `git diff --stat <commit tham chiếu> HEAD` phải rỗng (cần `git fetch $S/p07-repo plan07b-r6` một lần).

| Task | Nội dung | Commit tham chiếu |
|---|---|---|
| 0 | Siết 07a theo review cuối thực thi (job có secret, nhận artifact) | `949ca5d` |
| 1 | Plugin cập nhật, nguồn bản cập nhật, khóa công khai | `555fb6f` |
| 2 | Kiểm và tải qua plugin, test với plugin thật | `48ec83d` |
| 3 | Luồng nền, cài lúc thoát, khởi động lại, menu khay | `9591240` |
| 4 | Lời mời ở cửa sổ chính | `1f76cc5` |
| 5 | Windows: giá trị `Run` có dấu nháy | `875c7c7` |
| 6 | Script manifest theo kênh, đăng bản, kiểm cấu hình production | `52d821d` |
| 7 | Job `publish` và `github-release` | `c5e55f0` |
| 8 | Tài liệu phát hành và khóa; khóa manifest production | `7360e0a` |
| 9 | Kiểm tra chuẩn | không có commit |
| 10 | Cập nhật kế hoạch 00 | commit riêng |
| 11 | Khóa production (người, máy không nối mạng) | commit khóa công khai |
| 12 | R2, URL production, tên miền (người) | commit URL |
| 13 | Ký thật và bản beta đầu tiên (người, GitHub, Mac, Windows) | commit `version` |
| 14 | Thử cập nhật từ bản trước (người, Mac, Windows) | không có commit |
| 15 | Gatekeeper, SmartScreen, thời gian chờ lần đầu, bảng SHA-256, giấy phép trên bản đã cài (người) | không có commit |

## Task 0: Siết 07a theo review cuối thực thi

Ba điểm Nhỏ của review cuối thực thi 07a (`W/review-exec-07a.md`), sửa ở đây vì 07b cũng sửa `release.yml` và job đăng bản nhận artifact qua `take-artifact.mjs` (QĐ22):
- N-1: bước có `TAURI_SIGNING_PRIVATE_KEY` của `update-signatures` cài `pnpm` trong cùng khối `run`. Tách thành bước cài riêng không có secret; `windows-bundle` cũng vậy (bước ký sẽ có secret của dịch vụ ký ở Task 13). Test chung: mọi bước có `secrets.` của mọi workflow không chạy `pnpm install`.
- N-2: `notary.p8` ghi trước rồi mới `chmod 600`: tạo với `umask 077`. `macos-keychain.sh` không xóa file P12 tạm khi `security import` lỗi: file tạm nằm trong `RUNNER_TEMP`, xóa trong `trap`.
- N-3: luật `macos-arm64`, `windows-x64`, `release` của `take-artifact.mjs` chỉ cho phép bộ cài theo mẫu, nhận mọi phiên bản, và không bắt buộc `.sig`: nay bắt buộc đúng bộ cài của đúng phiên bản (`--version`, mặc định `version` của `tauri.conf.json`), `release` bắt buộc cả hai chữ ký.

**Files:**
- Create: `scripts/release/workflow.test.mjs`
- Modify: `scripts/release/signing.test.mjs`, `scripts/release/take-artifact.test.mjs`, `.github/workflows/release.yml`, `scripts/release/macos-keychain.sh`, `scripts/release/take-artifact.mjs`

- [ ] **Step 1: Test trước**

Tạo `scripts/release/workflow.test.mjs`:

```js
// Luật chung cho mọi bước có secret của các workflow (review cuối 07a: N-1, N-2): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflows = ["release", "sign-manifest"].map((name) => [
  name,
  readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
]);

/** Các bước của mọi job, mỗi bước là đoạn YAML từ `- ` tới bước kế tiếp. */
function steps(yml) {
  return yml.split("\n      - ").slice(1);
}

test("bước có secret không cài gói: cài ở một bước riêng không có secret", () => {
  for (const [name, yml] of workflows) {
    for (const step of steps(yml).filter((s) => s.includes("secrets."))) {
      assert.doesNotMatch(step, /pnpm (-C \S+ )?install/, `${name}: ${step}`);
    }
  }
});

test("file chứa bí mật được tạo với quyền 0600 ngay từ đầu (umask 077), không chmod sau khi đã ghi", () => {
  for (const [name, yml] of workflows) {
    for (const line of yml.split("\n").filter((l) => /printf '%s' "\$[A-Z0-9_]+" >/.test(l))) {
      assert.match(line, /^\s+\(umask 077; printf '%s' "\$[A-Z0-9_]+" > "[^"]+"\)$/, `${name}: ${line}`);
    }
  }
  assert.match(workflows[0][1], /umask 077; printf '%s' "\$APPLE_API_KEY_P8"/);
});
```

Sửa `scripts/release/signing.test.mjs` (áp bằng `git apply`):

```diff
diff --git a/scripts/release/signing.test.mjs b/scripts/release/signing.test.mjs
index 9673cb097b42ae47ecedb76b8ec0ffdc650ebcbc..0512a8a31bb3c83c46e113317f1dcc57c6c76e66 100644
--- a/scripts/release/signing.test.mjs
+++ b/scripts/release/signing.test.mjs
@@ -130,7 +130,10 @@ exit 0
     encoding: "utf8",
   });
   const log = existsSync(calls) ? readFileSync(calls, "utf8") : "";
-  return { ...r, log, keychain: join(dir, "release.keychain-db") };
+  // File P12 tạm nằm trong RUNNER_TEMP và không bao giờ còn lại, kể cả khi `security import` lỗi (N-2 của review cuối 07a).
+  const p12 = /security import (\S+) /.exec(log)?.[1];
+  if (p12) assert.equal(p12.startsWith(`${dir}/`), true, `file P12 tạm ngoài RUNNER_TEMP: ${p12}`);
+  return { ...r, log, keychain: join(dir, "release.keychain-db"), leftovers: p12 && existsSync(p12) ? [p12] : [] };
 }
 
 test("keychain: nhận đúng chứng thư Developer ID hợp lệ, in lệnh đặt biến, giữ keychain", (t) => {
@@ -149,6 +152,7 @@ test("keychain: nhận đúng chứng thư Developer ID hợp lệ, in lệnh đ
   assert.equal(existsSync(r.keychain), true);
   assert.doesNotMatch(r.log, /delete-keychain/);
   assert.match(r.log, /security import .* -f pkcs12 .* -T \/usr\/bin\/codesign/);
+  assert.deepEqual(r.leftovers, []);
 });
 
 test("keychain: không có Developer ID, import lỗi, hay tên có dấu nháy đơn thì báo lỗi và xóa keychain", (t) => {
@@ -163,6 +167,7 @@ test("keychain: không có Developer ID, import lỗi, hay tên có dấu nháy
     assert.equal(r.stdout, "");
     assert.match(r.log, /delete-keychain/);
     assert.equal(existsSync(r.keychain), false);
+    assert.deepEqual(r.leftovers, [], "file P12 tạm đã bị xóa");
   }
   const bad = runKeychain(t, { identities: [], arg: "nope" });
   assert.equal(bad.status, 1);
```

Sửa `scripts/release/take-artifact.test.mjs` (áp bằng `git apply`):

```diff
diff --git a/scripts/release/take-artifact.test.mjs b/scripts/release/take-artifact.test.mjs
index c3e4ddf334be075f88f955a91cb36810a77500cc..12f7692503fa7bf30ca8384016fc0675563d9421 100644
--- a/scripts/release/take-artifact.test.mjs
+++ b/scripts/release/take-artifact.test.mjs
@@ -86,19 +86,45 @@ test("tên DLL và bộ cài chặt: không %, nháy, &, thư mục con", (t) =>
     "THIRD_PARTY_NOTICES-macos.txt", "AI Translator_0.2.0-beta.1_x64-setup.exe", "SHA256SUMS-windows.txt",
     "sidecar-sha256-windows.json", "THIRD_PARTY_NOTICES-windows.txt",
   ];
+  const v = "0.2.0-beta.1";
   put(out, files);
   put(out, ["AI Translator.app.tar.gz.sig", "AI Translator_0.2.0-beta.1_x64-setup.exe.sig"]);
-  assert.deepEqual(plan("release", out).errors, []);
+  assert.deepEqual(plan("release", out, v).errors, []);
   const mac = tempDir(t);
   put(mac, files.slice(0, 5));
-  assert.deepEqual(plan("macos-arm64", mac).errors, []);
+  assert.deepEqual(plan("macos-arm64", mac, v).errors, []);
   put(mac, ["AI Translator_0.2.0-beta.1_x64-setup.exe"]);
-  assert.match(plan("macos-arm64", mac).errors[0], /file lạ: AI Translator_0.2.0-beta.1_x64-setup.exe/);
+  assert.match(plan("macos-arm64", mac, v).errors[0], /file lạ: AI Translator_0.2.0-beta.1_x64-setup.exe/);
   const pct = tempDir(t);
-  put(pct, [...files, "%TAURI_SIGNING_PRIVATE_KEY%.sig"]);
-  assert.match(plan("release", pct).errors[0], /ký tự không cho phép/);
+  put(pct, [...files, "AI Translator.app.tar.gz.sig", "AI Translator_0.2.0-beta.1_x64-setup.exe.sig", "%KEY%.sig"]);
+  assert.match(plan("release", pct, v).errors[0], /ký tự không cho phép/);
   put(out, ["AI Translator_9_aarch64.dmg"]);
-  assert.match(plan("release", out).errors[0], /file lạ/);
+  assert.match(plan("release", out, v).errors[0], /file lạ/);
+});
+
+test("bộ cài và chữ ký bắt buộc, đúng phiên bản của bản phát hành (N-3 của review cuối 07a)", (t) => {
+  const v = "0.2.0";
+  const mac = ["AI Translator.app.tar.gz", "SHA256SUMS-macos.txt", "sidecar-sha256-macos.json", "THIRD_PARTY_NOTICES-macos.txt"];
+  const win = ["SHA256SUMS-windows.txt", "sidecar-sha256-windows.json", "THIRD_PARTY_NOTICES-windows.txt"];
+  const noDmg = tempDir(t);
+  put(noDmg, mac);
+  assert.deepEqual(plan("macos-arm64", noDmg, v).errors, ["thiếu AI Translator_0.2.0_aarch64.dmg"]);
+  const other = tempDir(t);
+  put(other, [...mac, "AI Translator_0.1.9_aarch64.dmg"]);
+  assert.deepEqual(plan("macos-arm64", other, v).errors, [
+    "file lạ: AI Translator_0.1.9_aarch64.dmg",
+    "thiếu AI Translator_0.2.0_aarch64.dmg",
+  ]);
+  const noExe = tempDir(t);
+  put(noExe, win);
+  assert.deepEqual(plan("windows-x64", noExe, v).errors, ["thiếu AI Translator_0.2.0_x64-setup.exe"]);
+  const unsigned = tempDir(t);
+  put(unsigned, [...mac, ...win, "AI Translator_0.2.0_aarch64.dmg", "AI Translator_0.2.0_x64-setup.exe"]);
+  assert.deepEqual(plan("release", unsigned, v).errors, [
+    "thiếu AI Translator.app.tar.gz.sig",
+    "thiếu AI Translator_0.2.0_x64-setup.exe.sig",
+  ]);
+  assert.match(plan("release", unsigned).errors[0], /cần phiên bản/);
 });
 
 test("job có secret chỉ tải artifact theo tên vào $RUNNER_TEMP/in/, chỉ take-artifact đọc ở đó, mọi artifact đó đều có luật", () => {
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^✖|^ℹ (tests|pass|fail)' | sed -E 's/ \([0-9.]+ms\)//' | sort -u
```

Expected (lúc lập kế hoạch: năm test đỏ):
```text
ℹ fail 5
ℹ pass 36
ℹ tests 41
✖ bước có secret không cài gói: cài ở một bước riêng không có secret
✖ bộ cài và chữ ký bắt buộc, đúng phiên bản của bản phát hành (N-3 của review cuối 07a)
✖ failing tests:
✖ file chứa bí mật được tạo với quyền 0600 ngay từ đầu (umask 077), không chmod sau khi đã ghi
✖ keychain: không có Developer ID, import lỗi, hay tên có dấu nháy đơn thì báo lỗi và xóa keychain
✖ keychain: nhận đúng chứng thư Developer ID hợp lệ, in lệnh đặt biến, giữ keychain
```

- [ ] **Step 2: Sửa**

Sửa `.github/workflows/release.yml` (áp bằng `git apply`):

```diff
diff --git a/.github/workflows/release.yml b/.github/workflows/release.yml
index d9f1aadbb10bc156418608788e49c126b1c8f847..5919e0005d880e1c3eb5278811f7be8c05ecee01 100644
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -207,8 +207,7 @@ jobs:
             eval "$(scripts/release/macos-keychain.sh import)"
           fi
           if [ "$HAS_NOTARY_KEY" = "true" ]; then
-            printf '%s' "$APPLE_API_KEY_P8" > "$RUNNER_TEMP/notary.p8"
-            chmod 600 "$RUNNER_TEMP/notary.p8"
+            (umask 077; printf '%s' "$APPLE_API_KEY_P8" > "$RUNNER_TEMP/notary.p8")
             export APPLE_API_KEY_PATH="$RUNNER_TEMP/notary.p8"
           fi
           unset P12 P12_PASSWORD APPLE_API_KEY_P8
@@ -379,12 +378,13 @@ jobs:
           node scripts/release/take-artifact.mjs windows-sidecars-signed "$RUNNER_TEMP/in/windows-sidecars-signed" src-tauri/binaries
           node scripts/release/take-artifact.mjs windows-app "$RUNNER_TEMP/in/windows-app" target
           node scripts/release/take-artifact.mjs windows-sidecars "$RUNNER_TEMP/in/windows-sidecars" target/release-work/unsigned
+      - name: Tauri CLI cho tauri bundle (không secret, không chạy script cài đặt)
+        run: pnpm install --frozen-lockfile --ignore-scripts
       - name: Bộ cài NSIS, ký, kiểm, SHA-256
         env:
           MT_WINDOWS_SIGN_CMD: ${{ vars.MT_WINDOWS_SIGN_CMD }}
         run: |
           cp target/release-work/unsigned/THIRD_PARTY_NOTICES.txt .
-          pnpm install --frozen-lockfile --ignore-scripts
           node scripts/release/package-windows.mjs bundle
           cp target/release/bundle/nsis/*-setup.exe "$MT_RELEASE_OUT/"
           node scripts/release/release-check.mjs table src-tauri/binaries --target x86_64-pc-windows-msvc \
@@ -425,12 +425,13 @@ jobs:
         run: |
           node scripts/release/take-artifact.mjs macos-arm64 "$RUNNER_TEMP/in/macos-arm64" target/release-out
           node scripts/release/take-artifact.mjs windows-x64 "$RUNNER_TEMP/in/windows-x64" target/release-out
+      - name: Tauri CLI cho tauri signer (không secret, không chạy script cài đặt)
+        run: pnpm install --frozen-lockfile --ignore-scripts
       - name: Ký .app.tar.gz và bộ cài Windows (tauri signer, gắn phiên bản)
         env:
           TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
           TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
         run: |
-          pnpm install --frozen-lockfile --ignore-scripts
           node scripts/release/sign-updates.mjs --dir target/release-out
           ls target/release-out
       - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
```

Sửa `scripts/release/macos-keychain.sh` (áp bằng `git apply`):

```diff
diff --git a/scripts/release/macos-keychain.sh b/scripts/release/macos-keychain.sh
index 73db9deeddc97ee8583e38b22123620f0480bb8f..339f30aa7560a4c1d6ecaba2a8f886df95610abc 100755
--- a/scripts/release/macos-keychain.sh
+++ b/scripts/release/macos-keychain.sh
@@ -9,16 +9,18 @@
 # (build-sidecars-macos.sh, package-macos.sh). Mật khẩu keychain ngẫu nhiên, chỉ sống trong lệnh `import`. CI nạp chứng thư
 # ngay trước bước ký và xóa ngay sau đó, nên các bước biên dịch không bao giờ thấy chứng thư.
 set -eu
-keychain="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/release.keychain-db"
+tmp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
+keychain="$tmp/release.keychain-db"
 case "${1:-}" in
   import)
     pass=$(openssl rand -hex 24)
     security create-keychain -p "$pass" "$keychain"
-    # Lỗi ở bất kỳ bước nào sau đây thì xóa keychain vừa tạo.
-    trap 'security delete-keychain "$keychain" 2>/dev/null || true' EXIT
+    # File P12 tạm (mktemp: 0600) nằm trong thư mục tạm của job. Lỗi ở bất kỳ bước nào sau đây thì xóa keychain vừa tạo
+    # và file P12 (N-2 của review cuối 07a: trước đây `security import` lỗi thì file P12 còn lại).
+    cert=$(mktemp "$tmp/p12.XXXXXX")
+    trap 'security delete-keychain "$keychain" 2>/dev/null || true; rm -f "$cert"' EXIT
     security set-keychain-settings -lut 3600 "$keychain"
     security unlock-keychain -p "$pass" "$keychain"
-    cert=$(mktemp)
     printf '%s' "$P12" | base64 --decode >"$cert"
     security import "$cert" -f pkcs12 -k "$keychain" -P "$P12_PASSWORD" -T /usr/bin/codesign >/dev/null
     rm -f "$cert"
```

Sửa `scripts/release/take-artifact.mjs` (áp bằng `git apply`):

```diff
diff --git a/scripts/release/take-artifact.mjs b/scripts/release/take-artifact.mjs
index 70fe9148d1851c52ed0f1526c89284c6b2879dad..3100c17e0c9736d23cdcea6f34274a8be3cce75c 100644
--- a/scripts/release/take-artifact.mjs
+++ b/scripts/release/take-artifact.mjs
@@ -2,7 +2,10 @@
 // Nhận một artifact trong job có secret (QA của review 07a lần 2). Job có secret tải artifact vào một thư mục TRỐNG ngoài
 // checkout (`$RUNNER_TEMP/in/<tên>`), rồi script này chép vào chỗ dùng CHỈ các file đúng tên chờ đợi của artifact đó.
 //
-//   node scripts/release/take-artifact.mjs <tên artifact> <thư mục đã tải> <thư mục đích>
+//   node scripts/release/take-artifact.mjs <tên artifact> <thư mục đã tải> <thư mục đích> [--version <X.Y.Z[-beta.N]>]
+//
+// Bộ cài (`macos-arm64`, `windows-x64`, `release`) phải có đúng file của đúng phiên bản: `--version`, mặc định là `version`
+// của tauri.conf.json trong checkout; `release` phải có cả hai chữ ký bản cập nhật (N-3 của review cuối 07a).
 //
 // Lý do: artifact đến từ job không secret, là job mà build script hay crate bị chiếm có thể điều khiển. Tải thẳng vào gốc
 // checkout thì artifact ghi đè được script của repo sẽ chạy ngay sau đó với secret. Ở đây:
@@ -17,30 +20,31 @@ import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "n
 import { dirname, join } from "node:path";
 import { pathToFileURL } from "node:url";
 
+import { root } from "./versions.mjs";
+
 const MAC = "aarch64-apple-darwin";
 const WIN = "x86_64-pc-windows-msvc";
-const VERSION = String.raw`\d+\.\d+\.\d+(?:-beta\.\d+)?`;
 const DLL = /^[A-Za-z0-9._-]+\.dll$/;
 
 const mac = [`asr-worker-${MAC}`, `llama-server-${MAC}`];
 const win = [`asr-worker-vulkan-${WIN}.exe`, `asr-worker-cpu-${WIN}.exe`, `llama-server-${WIN}.exe`];
-const macOut = [
+const macOut = (v) => [
+  `AI Translator_${v}_aarch64.dmg`,
   "AI Translator.app.tar.gz",
   "SHA256SUMS-macos.txt",
   "sidecar-sha256-macos.json",
   "THIRD_PARTY_NOTICES-macos.txt",
-  new RegExp(`^AI Translator_${VERSION}_aarch64\\.dmg$`),
 ];
-const winOut = [
+const winOut = (v) => [
+  `AI Translator_${v}_x64-setup.exe`,
   "SHA256SUMS-windows.txt",
   "sidecar-sha256-windows.json",
   "THIRD_PARTY_NOTICES-windows.txt",
-  new RegExp(`^AI Translator_${VERSION}_x64-setup\\.exe$`),
 ];
 
 /**
- * Luật của từng artifact: `required` là đường dẫn phải có, `allowed` là đường dẫn hay mẫu tên (RegExp, chỉ ở thư mục gốc
- * của mẫu) được phép có thêm. Đường dẫn dùng `/`.
+ * Luật của từng artifact: `required` là đường dẫn phải có, `allowed` là mẫu tên (RegExp, chỉ ở thư mục `dir`) được phép có
+ * thêm. Đường dẫn dùng `/`. Luật của bộ cài là hàm của phiên bản.
  */
 export const RULES = {
   "macos-sidecars": { required: [...mac.map((f) => `src-tauri/binaries/${f}`), "THIRD_PARTY_NOTICES.txt"], allowed: [] },
@@ -52,13 +56,13 @@ export const RULES = {
   },
   "windows-sidecars-signed": { required: win, allowed: [{ dir: "", name: DLL }] },
   "windows-app": { required: ["release/meeting-translator.exe", "release-work/binaries-before-build.json"], allowed: [] },
-  "macos-arm64": { required: macOut.filter((x) => typeof x === "string"), allowed: [{ dir: "", name: macOut.at(-1) }] },
-  "windows-x64": { required: winOut.filter((x) => typeof x === "string"), allowed: [{ dir: "", name: winOut.at(-1) }] },
-  // Artifact `release` của job update-signatures: như trên, cộng chữ ký bản cập nhật (07b dùng ở job đăng bản).
-  release: {
-    required: [...macOut, ...winOut].filter((x) => typeof x === "string"),
-    allowed: [macOut.at(-1), winOut.at(-1), /\.sig$/].map((name) => ({ dir: "", name })),
-  },
+  "macos-arm64": (v) => ({ required: macOut(v), allowed: [] }),
+  "windows-x64": (v) => ({ required: winOut(v), allowed: [] }),
+  // Artifact `release` của job update-signatures: như trên, cộng hai chữ ký bản cập nhật (07b dùng ở job đăng bản).
+  release: (v) => ({
+    required: [...macOut(v), ...winOut(v), "AI Translator.app.tar.gz.sig", `AI Translator_${v}_x64-setup.exe.sig`],
+    allowed: [],
+  }),
 };
 
 const SAFE_NAME = /^[A-Za-z0-9._ -]+$/;
@@ -78,9 +82,13 @@ function walk(dir, prefix = "") {
 }
 
 /** Kiểm nội dung đã tải theo luật; trả `{ files, errors }`, `files` là các đường dẫn sẽ chép. */
-export function plan(name, from) {
-  const rule = RULES[name];
+export function plan(name, from, version) {
+  let rule = RULES[name];
   if (!rule) return { files: [], errors: [`artifact lạ: ${name}`] };
+  if (typeof rule === "function") {
+    if (!version) return { files: [], errors: [`${name}: cần phiên bản (--version hay tauri.conf.json)`] };
+    rule = rule(version);
+  }
   const entries = walk(from);
   const dirs = new Set();
   for (const p of [...rule.required, ...rule.allowed.map((a) => (a.dir ? `${a.dir}/x` : "x"))]) {
@@ -114,8 +122,8 @@ export function plan(name, from) {
 }
 
 /** Chép các file của artifact `name` từ `from` vào `to`, sau khi kiểm hết. Lỗi thì không chép gì. */
-export function take(name, from, to, log = console.log) {
-  const { files, errors } = plan(name, from);
+export function take(name, from, to, log = console.log, version = undefined) {
+  const { files, errors } = plan(name, from, version);
   if (errors.length > 0) throw new Error(`${name}: ${errors.join("; ")}`);
   for (const rel of files) {
     const dest = join(to, rel);
@@ -129,9 +137,12 @@ export function take(name, from, to, log = console.log) {
 
 if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
   try {
-    const [name, from, to] = process.argv.slice(2);
-    if (!name || !from || !to) throw new Error("dùng: take-artifact.mjs <tên artifact> <thư mục đã tải> <thư mục đích>");
-    take(name, from, to);
+    const args = process.argv.slice(2);
+    const i = args.indexOf("--version");
+    const version = i >= 0 ? args.splice(i, 2)[1] : JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version;
+    const [name, from, to] = args;
+    if (!name || !from || !to) throw new Error("dùng: take-artifact.mjs <tên artifact> <thư mục đã tải> <thư mục đích> [--version <v>]");
+    take(name, from, to, console.log, version);
   } catch (error) {
     console.error(`LỖI: ${error.message}`);
     process.exitCode = 1;
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^ℹ (tests|pass|fail)'
target/release-work/tools/actionlint .github/workflows/*.yml && echo "actionlint: sạch"
target/release-work/tools/shellcheck-v0.11.0/shellcheck -x scripts/release/*.sh && echo "shellcheck: sạch"
```

Expected (lúc lập kế hoạch):
```text
ℹ tests 41
ℹ pass 41
ℹ fail 0
actionlint: sạch
shellcheck: sạch
```

- [ ] **Step 3: Commit**

Run:
```bash
git add scripts/release/workflow.test.mjs scripts/release/signing.test.mjs scripts/release/take-artifact.test.mjs .github/workflows/release.yml scripts/release/macos-keychain.sh scripts/release/take-artifact.mjs
git commit -q -m "fix(release): siết job có secret theo review cuối 07a: cài gói ở bước không có khóa, file bí mật tạo 0600 ngay từ đầu, file P12 tạm luôn bị xóa, bộ cài và chữ ký bắt buộc đúng phiên bản khi nhận artifact" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
fix(release): siết job có secret theo review cuối 07a: cài gói ở bước không có khóa, file bí mật tạo 0600 ngay từ đầu, file P12 tạm luôn bị xóa, bộ cài và chữ ký bắt buộc đúng phiên bản khi nhận artifact
```

## Task 1: Plugin cập nhật, nguồn bản cập nhật, khóa công khai

Thêm `tauri-plugin-updater` (QĐ1), đăng ký với khóa công khai của bản build này, cấu hình `requireSignedVersion` và chế độ cài `passive` trên Windows (QĐ4). `source.rs` chọn URL gốc và khóa theo loại bản (QĐ3). Lệnh của plugin không cấp cho cửa sổ nào; app giả của test cũng đăng ký plugin, để `acl_tests` thấy lệnh bị chặn chứ không phải chưa có.

**Files:**
- Modify: `src-tauri/Cargo.toml`, `Cargo.lock`, `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src-tauri/src/acl_tests.rs`, `src-tauri/src/test_support.rs`
- Create: `src-tauri/keys/updater-public-keys.json`, `src-tauri/src/updater/mod.rs`, `src-tauri/src/updater/source.rs`, `src-tauri/src/updater/testdata/test.key.pub`

- [ ] **Step 1: Thêm crate.** Bản vá của `Cargo.lock` chính là kết quả của `cargo add tauri-plugin-updater@2.13.1 --no-default-features --features native-tls,system-proxy` lúc lập kế hoạch; áp bản vá thay vì chạy `cargo add`, để các crate kéo theo đúng bản ở bảng "Phiên bản đã chốt".

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index 8bce8fe4d0ab3457ed7428ab47ce8c799cbe6283..791e546a3ecdfca5a2dea112c7ff85f33063321f 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -56,6 +56,9 @@ libc = "0.2.189"
 chrono = { version = "0.4.45", default-features = false, features = ["clock", "serde"] }
 # Vẽ mã VietQR của đơn thành SVG ngay trong app (license/purchase.rs, spec §6.8 "Mua ngay trong app"). Không kéo crate nào.
 qrcode = { version = "0.14.1", default-features = false, features = ["svg"] }
+# Tự cập nhật (kế hoạch 07b, spec §6.11): TLS của hệ điều hành và proxy của hệ thống như `reqwest` ở trên; bỏ `zip` (chỉ
+# cần cho bộ cài `.msi.zip`/`.nsis.zip` cũ), bỏ `rustls-tls`. Lệnh của plugin không cấp cho cửa sổ nào (acl_tests).
+tauri-plugin-updater = { version = "2.13.1", default-features = false, features = ["native-tls", "system-proxy"] }
 
 [target.'cfg(target_os = "macos")'.dependencies]
 # Bản quyền (kế hoạch 06): app tự kiểm chữ ký của gói `.app` (`SecStaticCodeCheckValidity`, license/genuine.rs, §10.2).
```

Sửa `Cargo.lock` (áp bằng `git apply`):

```diff
diff --git a/Cargo.lock b/Cargo.lock
index 58609bfe44b8dfe7af26642a33197d2fba369dee..a2d4547bc8d0a7f52b3113a22e6a795bd925d32d 100644
--- a/Cargo.lock
+++ b/Cargo.lock
@@ -1743,6 +1743,16 @@ dependencies = [
  "rustc_version",
 ]
 
+[[package]]
+name = "filetime"
+version = "0.2.29"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "5c287a33c7f0a620c38e641e7f60827713987b3c0f26e8ddc9462cc69cf75759"
+dependencies = [
+ "cfg-if",
+ "libc",
+]
+
 [[package]]
 name = "find-msvc-tools"
 version = "0.1.14"
@@ -3180,6 +3190,7 @@ dependencies = [
  "tauri-plugin-opener",
  "tauri-plugin-single-instance",
  "tauri-plugin-store",
+ "tauri-plugin-updater",
  "thiserror 2.0.21",
  "windows",
  "windows-native-keyring-store",
@@ -3222,6 +3233,12 @@ version = "0.2.1"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "68354c5c6bd36d73ff3feceb05efa59b6acb7626617f4962be322a825e61f79a"
 
+[[package]]
+name = "minisign-verify"
+version = "0.2.5"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "22f9645cb765ea72b8111f36c522475d2daa0d22c957a9826437e97534bc4e9e"
+
 [[package]]
 name = "miniz_oxide"
 version = "0.8.9"
@@ -3691,6 +3708,18 @@ dependencies = [
  "objc2-foundation",
 ]
 
+[[package]]
+name = "objc2-osa-kit"
+version = "0.3.2"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "f112d1746737b0da274ef79a23aac283376f335f4095a083a267a082f21db0c0"
+dependencies = [
+ "bitflags 2.13.2",
+ "objc2",
+ "objc2-app-kit",
+ "objc2-foundation",
+]
+
 [[package]]
 name = "objc2-quartz-core"
 version = "0.3.2"
@@ -3901,6 +3930,20 @@ dependencies = [
  "windows-sys 0.61.2",
 ]
 
+[[package]]
+name = "osakit"
+version = "0.3.1"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "732c71caeaa72c065bb69d7ea08717bd3f4863a4f451402fc9513e29dbd5261b"
+dependencies = [
+ "objc2",
+ "objc2-foundation",
+ "objc2-osa-kit",
+ "serde",
+ "serde_json",
+ "thiserror 2.0.21",
+]
+
 [[package]]
 name = "pango"
 version = "0.18.3"
@@ -5486,6 +5529,17 @@ dependencies = [
  "syn 2.0.119",
 ]
 
+[[package]]
+name = "tar"
+version = "0.4.46"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "3f6221d9a6003c78398e3b239969f352578258df48c8eb051caadae0015bc840"
+dependencies = [
+ "filetime",
+ "libc",
+ "xattr",
+]
+
 [[package]]
 name = "target-lexicon"
 version = "0.12.16"
@@ -5780,6 +5834,37 @@ dependencies = [
  "tracing",
 ]
 
+[[package]]
+name = "tauri-plugin-updater"
+version = "2.13.1"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "3cb0b2ea3e85ca287990d3859a29cc5cb18024240fd78f62e027fb7963670f18"
+dependencies = [
+ "base64 0.22.1",
+ "dirs 7.0.0",
+ "flate2",
+ "futures-util",
+ "http",
+ "infer",
+ "log",
+ "minisign-verify",
+ "osakit",
+ "percent-encoding",
+ "reqwest",
+ "semver",
+ "serde",
+ "serde_json",
+ "tar",
+ "tauri",
+ "tauri-plugin",
+ "tempfile",
+ "thiserror 2.0.21",
+ "time",
+ "tokio",
+ "url",
+ "windows-sys 0.61.2",
+]
+
 [[package]]
 name = "tauri-runtime"
 version = "2.12.1"
@@ -7220,6 +7305,16 @@ version = "0.13.2"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "ea6fc2961e4ef194dcbfe56bb845534d0dc8098940c7e5c012a258bfec6701bd"
 
+[[package]]
+name = "xattr"
+version = "1.6.1"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "32e45ad4206f6d2479085147f02bc2ef834ac85886624a23575ae137c8aa8156"
+dependencies = [
+ "libc",
+ "rustix",
+]
+
 [[package]]
 name = "xkeysym"
 version = "0.2.1"
```

Run:
```bash
cargo tree --locked --target all -e normal -i tauri-plugin-updater | head -2
cargo tree --locked --target all -i rustls 2>&1 | head -1
cargo tree --locked --target all -e normal -i reqwest --depth 0 | head -1
```

Expected (lúc lập kế hoạch: không có `rustls`, một bản `reqwest`):
```text
error: package ID specification `tauri-plugin-updater` did not match any packages
error: package ID specification `rustls` did not match any packages
reqwest v0.13.5
```

- [ ] **Step 2: Khóa công khai và nguồn bản cập nhật**

Tạo `src-tauri/keys/updater-public-keys.json`:

```json
{
  "_note": "Khóa công khai kiểm bản cập nhật (tauri-plugin-updater, spec §6.11, §10.2; kế hoạch 07b): nội dung file `.key.pub` mà `tauri signer generate` tạo (base64 một dòng). Bản dev dùng `staging`, bản phát hành chỉ dùng `production`; chuỗi rỗng thì tắt tự cập nhật. Không bao giờ có khóa riêng ở đây.",
  "staging": "",
  "production": ""
}
```

Khóa thử cho test (Task 2 dùng chữ ký của nó). Lúc lập kế hoạch tạo bằng các lệnh dưới đây trong một thư mục tạm, rồi xóa khóa riêng; đừng chạy lại (khóa mới sẽ không khớp các chữ ký của Task 2), chỉ chép file:

```text
pnpm tauri signer generate --ci -p test-only -w $TMP/test.key
cp $TMP/test.key.pub src-tauri/src/updater/testdata/test.key.pub
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=test-only pnpm tauri signer sign -f $TMP/test.key --app-version 0.9.0 src-tauri/src/updater/testdata/update-0.9.0.bin
…   (các chữ ký khác của Task 2: --app-version 0.8.0, không --app-version, và một khóa thứ hai)
rm -rf $TMP
```

Tạo `src-tauri/src/updater/testdata/test.key.pub`:

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IENGRURCMDFGNDEwQzA3NUUKUldSZUJ3eEJIN0R0endsL0ZoejgvK2dvMHd2ZnA2MGZCL0U5WC9WMkVkTllDOEJkRytqWTd4bzIK
```

Tạo `src-tauri/src/updater/source.rs`:

```rust
//! Nguồn bản cập nhật của bản build này (spec §6.11, §10.2; kế hoạch 07b): URL gốc trên CDN và khóa công khai.
//!
//! - Bản dev: URL staging ([`URL_ENV`] đè được, cho phép `http` tới `127.0.0.1` hay `localhost` để thử với server trên
//!   máy) và khóa `staging`. Bản phát hành: chỉ URL production (`https`) và khóa `production`.
//! - Thiếu URL hay khóa thì tắt tự cập nhật: không gọi mạng, không hiện gì.
//! - Manifest của mỗi kênh ở `<gốc>/<stable|beta>/latest.json`; bộ cài của mỗi bản ở `<gốc>/<phiên bản>/`
//!   (`scripts/release/update-manifest.mjs`).

use base64::Engine;
use reqwest::Url;

use crate::models::download::is_loopback;
use crate::settings::UpdateChannel;

/// URL gốc của bucket bản cập nhật staging. Task 12 của kế hoạch 07b (cần người) điền.
pub const STAGING_URL: Option<&str> = None;
/// URL gốc production: Task 12 của kế hoạch 07b điền khi có tên miền (T7) hay URL công khai của bucket production.
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản dev: biến môi trường này đè URL staging.
pub const URL_ENV: &str = "AI_TRANSLATOR_UPDATE_URL";

const KEYS: &str = include_str!("../../keys/updater-public-keys.json");

/// URL gốc và khóa công khai mà bản build này dùng.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Source {
    pub base: Url,
    pub pubkey: String,
}

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

/// Khóa công khai của một môi trường trong file khóa (`staging` hay `production`). Chỉ nhận đúng dạng của
/// `tauri signer generate`: base64 của hai dòng `untrusted comment: …` và khóa minisign Ed25519 (42 byte, bắt đầu
/// `Ed`). Chuỗi rỗng, sai dạng hay thiếu khóa là `None`.
pub fn public_key_from(json: &str, dev: bool) -> Option<String> {
    let keys: serde_json::Value = serde_json::from_str(json).ok()?;
    let key = keys.get(if dev { "staging" } else { "production" })?.as_str()?.trim();
    let text = base64::engine::general_purpose::STANDARD.decode(key).ok()?;
    let text = String::from_utf8(text).ok()?;
    let mut lines = text.lines();
    let comment = lines.next()?;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(lines.next()?.trim())
        .ok()?;
    let rest_empty = lines.all(|l| l.trim().is_empty());
    (comment.starts_with("untrusted comment:") && raw.len() == 42 && raw.starts_with(b"Ed") && rest_empty)
        .then(|| key.to_string())
}

/// URL `latest.json` của một kênh.
pub fn endpoint(base: &Url, channel: UpdateChannel) -> Url {
    let name = match channel {
        UpdateChannel::Stable => "stable",
        UpdateChannel::Beta => "beta",
    };
    let text = format!("{}/{name}/latest.json", base.as_str().trim_end_matches('/'));
    Url::parse(&text).expect("URL gốc hợp lệ cộng đường dẫn cố định vẫn hợp lệ")
}

/// Nguồn của bản đang chạy; `None` thì tự cập nhật tắt.
pub fn for_this_build() -> Option<Source> {
    let dev = cfg!(debug_assertions);
    let base = base_from(dev, std::env::var(URL_ENV).ok(), STAGING_URL, PRODUCTION_URL)?;
    let pubkey = public_key_from(KEYS, dev)?;
    Some(Source { base, pubkey })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Khóa công khai của khóa thử trong `testdata/` (Task 3 tạo, khóa riêng đã xóa ngay sau khi ký).
    pub const TEST_PUBKEY: &str = include_str!("testdata/test.key.pub");

    fn keys(staging: &str, production: &str) -> String {
        serde_json::json!({ "_note": "x", "staging": staging, "production": production }).to_string()
    }

    #[test]
    fn dev_builds_read_staging_or_the_env_and_release_builds_only_production() {
        let staging = Some("https://staging.example.com/releases");
        let production = Some("https://releases.example.com/desktop/");
        let env = Some("http://127.0.0.1:8788/r".to_string());
        assert_eq!(
            base_from(true, None, staging, production).unwrap().as_str(),
            "https://staging.example.com/releases"
        );
        assert_eq!(
            base_from(true, env.clone(), staging, production).unwrap().as_str(),
            "http://127.0.0.1:8788/r"
        );
        assert_eq!(
            base_from(false, env, staging, production).unwrap().as_str(),
            "https://releases.example.com/desktop/"
        );
        assert_eq!(base_from(false, None, staging, None), None);
        assert_eq!(base_from(true, None, None, production), None);
    }

    #[test]
    fn only_https_except_loopback_http_in_dev() {
        let at = |dev, url: &str| base_from(dev, Some(url.into()), Some(url), Some(url)).is_some();
        assert!(at(false, "https://r.example.com"));
        assert!(!at(false, "http://r.example.com"));
        assert!(!at(false, "http://127.0.0.1:8788"));
        assert!(at(true, "http://localhost:8788"));
        assert!(!at(true, "http://r.example.com"));
        assert!(!at(true, "file:///tmp/x"));
        assert!(!at(false, "https://r.example.com/?a=1"));
        assert!(!at(false, "https://r.example.com/#x"));
        assert!(!at(false, "không phải URL"));
    }

    #[test]
    fn endpoint_per_channel() {
        for base in ["https://r.example.com/desktop", "https://r.example.com/desktop/"] {
            let base = Url::parse(base).unwrap();
            assert_eq!(
                endpoint(&base, UpdateChannel::Stable).as_str(),
                "https://r.example.com/desktop/stable/latest.json"
            );
            assert_eq!(
                endpoint(&base, UpdateChannel::Beta).as_str(),
                "https://r.example.com/desktop/beta/latest.json"
            );
        }
    }

    #[test]
    fn public_key_per_environment_and_only_the_tauri_format() {
        let key = TEST_PUBKEY.trim();
        assert_eq!(public_key_from(&keys(key, ""), true).as_deref(), Some(key));
        assert_eq!(
            public_key_from(&keys(key, ""), false),
            None,
            "bản phát hành không mượn khóa staging"
        );
        assert_eq!(public_key_from(&keys("", key), false).as_deref(), Some(key));
        assert_eq!(
            public_key_from(&keys("", key), true),
            None,
            "bản dev không nhận khóa production"
        );
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
            assert_eq!(public_key_from(&keys(&bad, &bad), true), None, "{bad}");
        }
        assert_eq!(public_key_from("{}", true), None);
        assert_eq!(public_key_from("không phải JSON", true), None);
    }

    #[test]
    fn the_shipped_key_file_has_no_private_key() {
        let keys: serde_json::Value = serde_json::from_str(KEYS).unwrap();
        let names: Vec<_> = keys.as_object().unwrap().keys().cloned().collect();
        assert_eq!(names, ["_note", "production", "staging"]);
        for env in ["staging", "production"] {
            let value = keys[env].as_str().unwrap();
            assert!(
                value.is_empty() || public_key_from(KEYS, env == "staging").is_some(),
                "{env}"
            );
        }
        assert!(
            !KEYS.contains("secret key"),
            "khóa riêng của minisign không bao giờ nằm trong app"
        );
    }
}
```

Tạo `src-tauri/src/updater/mod.rs`:

```rust
//! Tự cập nhật app (F9, spec §6.11; kế hoạch 07b) bằng `tauri-plugin-updater`.
//!
//! - `source`: URL gốc và khóa công khai của bản build này; thiếu một trong hai thì tắt tự cập nhật.
//! - Plugin chỉ dùng từ Rust: không cửa sổ nào được cấp lệnh của plugin (`acl_tests`).
//! - `requireSignedVersion` bật trong `tauri.conf.json`: chữ ký phải gắn đúng phiên bản mà manifest báo, để manifest
//!   bị sửa không ghép được số phiên bản mới với bộ cài cũ.

pub mod source;

use tauri::Runtime;
use tauri::plugin::TauriPlugin;

/// Plugin với khóa công khai của bản build này (chuỗi rỗng khi chưa có khóa; khi đó app không bao giờ gọi plugin).
pub fn plugin<R: Runtime>() -> TauriPlugin<R, tauri_plugin_updater::Config> {
    let pubkey = source::for_this_build().map(|s| s.pubkey).unwrap_or_default();
    tauri_plugin_updater::Builder::new().pubkey(pubkey).build()
}
```

- [ ] **Step 3: Cấu hình và đăng ký plugin**

Sửa `src-tauri/tauri.conf.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/tauri.conf.json b/src-tauri/tauri.conf.json
index 013835b8908e8201b41ca5fd16ae0254fc975736..9e1c9c4b93109a08939f6890909a2f9d4cefaca2 100644
--- a/src-tauri/tauri.conf.json
+++ b/src-tauri/tauri.conf.json
@@ -16,6 +16,13 @@
       "csp": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src ipc: http://ipc.localhost"
     }
   },
+  "plugins": {
+    "updater": {
+      "pubkey": "",
+      "requireSignedVersion": true,
+      "windows": { "installMode": "passive" }
+    }
+  },
   "bundle": {
     "active": false,
     "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 1c368a3f2a6929bf175244d04431cef0f4f11b7b..89f63a05a7bf56b83fecbae39dff00a8b0e5839b 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -36,6 +36,7 @@ pub mod system;
 pub mod transcript;
 pub mod tray;
 pub mod tray_menu;
+pub mod updater;
 pub mod window;
 
 #[cfg(test)]
@@ -84,7 +85,8 @@ pub fn run() {
                 .build(),
         )
         .plugin(hotkey_registry::plugin())
-        .plugin(navigation::plugin());
+        .plugin(navigation::plugin())
+        .plugin(updater::plugin());
     #[cfg(target_os = "macos")]
     let builder = builder.plugin(tauri_nspanel::init()).menu(window::app_menu);
     builder
```

Sửa `src-tauri/src/acl_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/acl_tests.rs b/src-tauri/src/acl_tests.rs
index 848c4a277a4c105b2265f2ac51e3de6452d6faed..f4327b32bd1627d34eaa46fd280f20c2ca0e940c 100644
--- a/src-tauri/src/acl_tests.rs
+++ b/src-tauri/src/acl_tests.rs
@@ -44,6 +44,10 @@ const FORBIDDEN: &[&str] = &[
     "plugin:dialog|save",
     "plugin:dialog|open",
     "plugin:dialog|message",
+    "plugin:updater|check",
+    "plugin:updater|download",
+    "plugin:updater|install",
+    "plugin:updater|download_and_install",
 ];
 
 /// Lệnh của app có tác dụng ra ngoài app (mở Finder, System Settings, Settings của Windows).
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index 14e96f94b731bca65514feb3f2fa90881fe82412..d330033feb7c3680e1c184c7fcfc36b002657945 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -498,7 +498,8 @@ pub fn mock_app_with(deps: FakeDeps) -> tauri::App<MockRuntime> {
 }
 
 pub fn mock_app_full(deps: FakeDeps, models: ModelsConfig) -> tauri::App<MockRuntime> {
-    let builder = mock_builder();
+    // Plugin cập nhật như app thật, để `acl_tests` thấy lệnh của nó bị chặn chứ không phải chưa đăng ký.
+    let builder = mock_builder().plugin(crate::updater::plugin());
     #[cfg(target_os = "macos")]
     let builder = builder.plugin(tauri_nspanel::init());
     let surface = FakeSurface::default();
```

Run: `cargo test -p meeting-translator --lib -- updater:: acl_tests 2>&1 | grep -E '^test |^test result'`

Expected (lúc lập kế hoạch):
```text
test updater::source::tests::only_https_except_loopback_http_in_dev ... ok
test updater::source::tests::endpoint_per_channel ... ok
test updater::source::tests::dev_builds_read_staging_or_the_env_and_release_builds_only_production ... ok
test updater::source::tests::the_shipped_key_file_has_no_private_key ... ok
test updater::source::tests::public_key_per_environment_and_only_the_tauri_format ... ok
test acl_tests::capabilities_grant_exactly_the_fixed_lists ... ok
test acl_tests::outside_effects_only_reach_the_fake_opener ... ok
test acl_tests::each_window_only_reaches_its_own_commands ... ok
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 403 filtered out; finished in 0.82s
```

Run: `cargo deny check 2>&1 | tail -1`

Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 4: Commit**

Run:
```bash
git add Cargo.lock src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/keys/updater-public-keys.json src-tauri/src/lib.rs src-tauri/src/acl_tests.rs src-tauri/src/test_support.rs src-tauri/src/updater
git commit -q -m "feat(app): tauri-plugin-updater 2.13.1 (TLS của hệ điều hành), nguồn bản cập nhật và khóa công khai theo loại bản; lệnh của plugin không cấp cho cửa sổ nào (§6.11, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(app): tauri-plugin-updater 2.13.1 (TLS của hệ điều hành), nguồn bản cập nhật và khóa công khai theo loại bản; lệnh của plugin không cấp cho cửa sổ nào (§6.11, §10.2)
```

## Task 2: Kiểm và tải qua plugin

`backend.rs`: bản thật gọi `updater_builder().endpoints([…])` với bộ so phiên bản theo kênh (QĐ20: chỉ bản mới hơn, kênh stable không nhận bản pre-release), `check`, `download` (plugin kiểm chữ ký và phiên bản đã ký), rồi mới ghi file qua một file tạm và trả SHA-256 của các byte đã kiểm. Test chạy plugin thật trên app giả với khóa thử và một server HTTP giả của 04 (`models::test_http`): manifest là đúng file `latest.json` mà `update-manifest.mjs` của Task 6 sinh (test của Task 6 so lại từng byte).

**Files:**
- Create: `src-tauri/src/updater/backend.rs`, `src-tauri/src/updater/testdata/update-0.9.0.bin`, `src-tauri/src/updater/testdata/update-0.9.0.sig`, `src-tauri/src/updater/testdata/signed-as-0.8.0.sig`, `src-tauri/src/updater/testdata/no-version.sig`, `src-tauri/src/updater/testdata/other-key.sig`, `src-tauri/src/updater/testdata/latest.json`
- Modify: `src-tauri/src/updater/mod.rs`

- [ ] **Step 1: Dữ liệu thử** (bộ cài giả, bốn chữ ký: đúng, ký cho bản 0.8.0, không gắn phiên bản, của khóa khác)

Tạo `src-tauri/src/updater/testdata/update-0.9.0.bin`:

```
Bản cập nhật thử 0.9.0 (không phải bộ cài thật)
```

Tạo `src-tauri/src/updater/testdata/update-0.9.0.sig`:

```
dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZUJ3eEJIN0R0enhlcVN1S2RDTHFNa2RKRU5ENHZRdmFZOWN6Kzgyb2hCcjBFZlVlYnI5RnpOS1NmMlhqd0wyVWg2U0hXU2N0Skd0dFJJczJ4c0E2elFHaytYODFRYlFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk3CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgl2ZXJzaW9uOjAuOS4wCmc0QXdITEpHZHVSZU1HVElrQWNiNjFwR1ByMFRXWi9KUzVoa2xTZ3FiNG5SMTR3RmlZZzNXemJwQVU1Nkd1dEJRQndaN2RMMGVwb0RWNE04ZFNoZUNBPT0K
```

Tạo `src-tauri/src/updater/testdata/signed-as-0.8.0.sig`:

```
dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZUJ3eEJIN0R0ejdnVGRKRXczSWdiWGgrZkwzSnprZXVJdzV3SUJKaXU4OGRPZ1BUMDZma2VzbXZRR0E4YVRudEZXY2VpTU5GMkxiNm1pYzJDbFZNTmIvSFN2MUdTc0FzPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk3CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgl2ZXJzaW9uOjAuOC4wCkp4M3hzTkxpbjV4UDBqQmdYT010aWYyUVcxUVlRNER4U0V4K1BVaFE1aS9hV0kweUhXYTMrS3VYcGc1WWg5Tk5Eb3lDUHJoL2pLZW02R2gzblR4a0J3PT0K
```

Tạo `src-tauri/src/updater/testdata/no-version.sig`:

```
dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZUJ3eEJIN0R0ejV0ZGVrcmNzMXFlWGpRb3BaQ2Z6UUdiVnVUbkgwdWhqNnJ2Vnc2OThxZjhNVE01YWRHSHI2NzYybFc1T3JZamo5d0RPL1gyblMrdndmcncydnM4Ynd3PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk3CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgpSUEcyOHVJVkxVZE5XS2srV3Q3aUsrMTljd3o5NVpUbzJQMkNkcEI3NjBKOGkzbmZYbStuT0xrblVkb2tITlp2TmdWek80eitmNlhFaFk1cUxZQ2VEZz09Cg==
```

Tạo `src-tauri/src/updater/testdata/other-key.sig`:

```
dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTd3E5VkMvbEhBZ1JZZWp4Z2kzZU5FRmg5M0pSbVdCK05FNXhtS1p4d3hQWmxyWFBUVndBdWRtaHZOQ0RudDlacStHQ1dXMzd1Qjk2T3BXb1Y1THQ1elRCNUU2NG40VVE4PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk4CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgl2ZXJzaW9uOjAuOS4wCnYyVzlMNmwxaTE2ZE5MckpVdEJlNTMwMnJzeFBPSXU2bDBLc21oSzg0RGl2aWNFeThUUU5DSW5jTmJjSkFiMmVDVHlOeTZyNFpwMWxhWFRDeEhlM0N3PT0K
```

Tạo `src-tauri/src/updater/testdata/latest.json`:

```json
{
  "version": "0.9.0",
  "notes": "Bản thử",
  "pub_date": "2026-10-03T00:00:00Z",
  "platforms": {
    "darwin-aarch64-app": {
      "url": "https://releases.example.com/desktop/0.9.0/AI%20Translator.app.tar.gz",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZUJ3eEJIN0R0enhlcVN1S2RDTHFNa2RKRU5ENHZRdmFZOWN6Kzgyb2hCcjBFZlVlYnI5RnpOS1NmMlhqd0wyVWg2U0hXU2N0Skd0dFJJczJ4c0E2elFHaytYODFRYlFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk3CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgl2ZXJzaW9uOjAuOS4wCmc0QXdITEpHZHVSZU1HVElrQWNiNjFwR1ByMFRXWi9KUzVoa2xTZ3FiNG5SMTR3RmlZZzNXemJwQVU1Nkd1dEJRQndaN2RMMGVwb0RWNE04ZFNoZUNBPT0K"
    },
    "darwin-aarch64": {
      "url": "https://releases.example.com/desktop/0.9.0/AI%20Translator.app.tar.gz",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZUJ3eEJIN0R0enhlcVN1S2RDTHFNa2RKRU5ENHZRdmFZOWN6Kzgyb2hCcjBFZlVlYnI5RnpOS1NmMlhqd0wyVWg2U0hXU2N0Skd0dFJJczJ4c0E2elFHaytYODFRYlFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk3CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgl2ZXJzaW9uOjAuOS4wCmc0QXdITEpHZHVSZU1HVElrQWNiNjFwR1ByMFRXWi9KUzVoa2xTZ3FiNG5SMTR3RmlZZzNXemJwQVU1Nkd1dEJRQndaN2RMMGVwb0RWNE04ZFNoZUNBPT0K"
    },
    "windows-x86_64-nsis": {
      "url": "https://releases.example.com/desktop/0.9.0/AI%20Translator_0.9.0_x64-setup.exe",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZUJ3eEJIN0R0enhlcVN1S2RDTHFNa2RKRU5ENHZRdmFZOWN6Kzgyb2hCcjBFZlVlYnI5RnpOS1NmMlhqd0wyVWg2U0hXU2N0Skd0dFJJczJ4c0E2elFHaytYODFRYlFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk3CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgl2ZXJzaW9uOjAuOS4wCmc0QXdITEpHZHVSZU1HVElrQWNiNjFwR1ByMFRXWi9KUzVoa2xTZ3FiNG5SMTR3RmlZZzNXemJwQVU1Nkd1dEJRQndaN2RMMGVwb0RWNE04ZFNoZUNBPT0K"
    },
    "windows-x86_64": {
      "url": "https://releases.example.com/desktop/0.9.0/AI%20Translator_0.9.0_x64-setup.exe",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSZUJ3eEJIN0R0enhlcVN1S2RDTHFNa2RKRU5ENHZRdmFZOWN6Kzgyb2hCcjBFZlVlYnI5RnpOS1NmMlhqd0wyVWg2U0hXU2N0Skd0dFJJczJ4c0E2elFHaytYODFRYlFZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwOTkxOTk3CWZpbGU6dXBkYXRlLTAuOS4wLmJpbgl2ZXJzaW9uOjAuOS4wCmc0QXdITEpHZHVSZU1HVElrQWNiNjFwR1ByMFRXWi9KUzVoa2xTZ3FiNG5SMTR3RmlZZzNXemJwQVU1Nkd1dEJRQndaN2RMMGVwb0RWNE04ZFNoZUNBPT0K"
    }
  }
}
```

- [ ] **Step 2: Code và test**

Tạo `src-tauri/src/updater/backend.rs`:

```rust
//! Kiểm và tải bản cập nhật qua `tauri-plugin-updater` (kế hoạch 07b). Phần điều phối (`super`) chỉ thấy ba trait ở
//! đây, để test dùng bản giả; bản thật bọc plugin.
//!
//! Plugin lo phần an ninh: kiểm chữ ký minisign của file tải về bằng khóa công khai build sẵn, và vì `requireSignedVersion`
//! bật, phiên bản ghi trong chữ ký phải đúng phiên bản mà manifest báo. Chữ ký sai thì `download` lỗi và không file nào
//! được ghi. App đặt bộ so phiên bản ([`accepts`]): chỉ nhận bản mới hơn bản đang chạy, và kênh stable không nhận bản
//! pre-release, vì manifest không ký nên ai ghi được CDN có thể đặt một bản beta (chữ ký vẫn đúng) vào kênh stable.

use std::path::Path;
use std::time::Duration;

use reqwest::Url;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::settings::UpdateChannel;

/// Chờ manifest tối đa chừng này. Tải bộ cài không giới hạn thời gian (file vài chục MB, mạng chậm).
pub const CHECK_TIMEOUT: Duration = Duration::from_secs(30);

/// Có nhận một bản ở kênh `channel` không: phải mới hơn bản đang chạy theo semver (`newer`; không hạ cấp, không cài lại),
/// và kênh stable không nhận bản pre-release (`X.Y.Z-beta.N`).
pub fn accepts(newer: bool, pre_release: bool, channel: UpdateChannel) -> bool {
    newer && (channel == UpdateChannel::Beta || !pre_release)
}

/// Hỏi manifest của một kênh.
pub trait Backend: Send + Sync + 'static {
    /// `Ok(None)`: không có bản nào mà kênh này nhận ([`accepts`]).
    fn check(&self, endpoint: &Url, channel: UpdateChannel) -> Result<Option<Box<dyn Found>>, String>;
}

/// Một bản mới hơn mà manifest báo, chưa tải.
pub trait Found: Send {
    fn version(&self) -> &str;
    /// Tải, kiểm chữ ký, rồi mới ghi vào `dest` (ghi file tạm rồi đổi tên). Lỗi thì `dest` không đổi.
    fn download(self: Box<Self>, dest: &Path) -> Result<Downloaded, String>;
}

/// Bản đã tải: cách cài, và SHA-256 của đúng các byte đã kiểm chữ ký, để lúc cài so lại file trên đĩa.
pub struct Downloaded {
    pub installer: Box<dyn Install>,
    pub sha256: [u8; 32],
}

/// Cài một bản đã tải. macOS: thay gói `.app` tại chỗ. Windows: chạy bộ cài NSIS (`/UPDATE`, chế độ passive) rồi
/// thoát tiến trình ngay (`std::process::exit(0)` trong plugin); `restart` thì bộ cài mở lại app sau khi cài.
pub trait Install: Send + Sync {
    fn install(&self, bytes: &[u8], restart: bool) -> Result<(), String>;
}

/// Bản thật: plugin của app (khóa công khai nạp lúc đăng ký plugin, `super::plugin`).
pub struct PluginBackend<R: Runtime>(pub AppHandle<R>);

impl<R: Runtime> Backend for PluginBackend<R> {
    fn check(&self, endpoint: &Url, channel: UpdateChannel) -> Result<Option<Box<dyn Found>>, String> {
        let updater = self
            .0
            .updater_builder()
            .endpoints(vec![endpoint.clone()])
            .map_err(|e| e.to_string())?
            .version_comparator(move |current, release| {
                accepts(release.version > current, !release.version.pre.is_empty(), channel)
            })
            .timeout(CHECK_TIMEOUT)
            .build()
            .map_err(|e| e.to_string())?;
        let update = tauri::async_runtime::block_on(updater.check()).map_err(|e| e.to_string())?;
        Ok(update.map(|u| Box::new(PluginFound(u)) as Box<dyn Found>))
    }
}

struct PluginFound(Update);

impl Found for PluginFound {
    fn version(&self) -> &str {
        &self.0.version
    }

    fn download(self: Box<Self>, dest: &Path) -> Result<Downloaded, String> {
        let bytes = tauri::async_runtime::block_on(self.0.download(|_, _| {}, || {})).map_err(|e| e.to_string())?;
        write_atomically(dest, &bytes)?;
        Ok(Downloaded {
            installer: Box::new(PluginInstall(self.0)),
            sha256: Sha256::digest(&bytes).into(),
        })
    }
}

struct PluginInstall(Update);

impl Install for PluginInstall {
    fn install(&self, bytes: &[u8], restart: bool) -> Result<(), String> {
        self.0
            .clone()
            .restart_after_install(restart)
            .install(bytes)
            .map_err(|e| e.to_string())
    }
}

/// Ghi `bytes` vào `dest` qua một file tạm cùng thư mục, để không bao giờ có `dest` ghi dở.
pub fn write_atomically(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = dest.parent().ok_or("đường dẫn không có thư mục cha")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dest.with_extension("part");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dest).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::test_http::{FakeServer, Fault};
    use crate::settings::UpdateChannel;
    use crate::updater::source::tests::TEST_PUBKEY;
    use tauri::test::{MockRuntime, mock_builder};

    const PAYLOAD: &[u8] = include_bytes!("testdata/update-0.9.0.bin");
    const SIG: &str = include_str!("testdata/update-0.9.0.sig");
    /// `latest.json` mà `scripts/release/update-manifest.mjs` sinh cho bản 0.9.0 (test của script so đúng file này).
    const LATEST: &str = include_str!("testdata/latest.json");
    const FIXTURE_BASE: &str = "https://releases.example.com/desktop";

    /// App giả có plugin cập nhật với khóa thử; phiên bản app là 0.1.0 (`tauri.conf.json`).
    fn app() -> tauri::App<MockRuntime> {
        mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().pubkey(TEST_PUBKEY.trim()).build())
            .build(tauri::generate_context!(test = true))
            .expect("dựng được app giả")
    }

    /// Server giả phục vụ `latest.json` (đổi URL gốc sang server) và hai bộ cài, với chữ ký `sig`.
    fn serve(version: &str, sig: &str) -> FakeServer {
        let server = FakeServer::start();
        let base = server.url("/desktop").to_string();
        let manifest = LATEST
            .replace(FIXTURE_BASE, base.trim_end_matches('/'))
            .replace("\"version\": \"0.9.0\"", &format!("\"version\": \"{version}\""))
            .replace(SIG.trim(), sig.trim());
        server.put("desktop/stable/latest.json", manifest.as_bytes());
        server.put("desktop/0.9.0/AI%20Translator.app.tar.gz", PAYLOAD);
        server.put("desktop/0.9.0/AI%20Translator_0.9.0_x64-setup.exe", PAYLOAD);
        server
    }

    fn dest() -> std::path::PathBuf {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("mt-updater-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("update.bin")
    }

    fn check(server: &FakeServer, app: &tauri::App<MockRuntime>) -> Result<Option<Box<dyn Found>>, String> {
        check_on(server, app, UpdateChannel::Stable)
    }

    fn check_on(
        server: &FakeServer,
        app: &tauri::App<MockRuntime>,
        channel: UpdateChannel,
    ) -> Result<Option<Box<dyn Found>>, String> {
        PluginBackend(app.handle().clone()).check(&server.url("/desktop/stable/latest.json"), channel)
    }

    #[test]
    fn finds_downloads_and_verifies_the_manifest_the_release_script_writes() {
        let app = app();
        let server = serve("0.9.0", SIG);
        let found = check(&server, &app).unwrap().expect("0.9.0 mới hơn 0.1.0");
        assert_eq!(found.version(), "0.9.0");
        let dest = dest();
        let downloaded = found.download(&dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), PAYLOAD);
        assert_eq!(downloaded.sha256, <[u8; 32]>::from(Sha256::digest(PAYLOAD)), "SHA-256 của đúng các byte đã kiểm");
        assert!(!dest.with_extension("part").exists());
        let installer = if cfg!(windows) { "x64-setup.exe" } else { "app.tar.gz" };
        assert!(
            server.requests().iter().any(|r| r.path.ends_with(installer)),
            "{:?}",
            server.requests()
        );
    }

    #[test]
    fn no_update_when_the_manifest_is_not_newer() {
        let app = app();
        for version in ["0.1.0", "0.0.9", "0.1.0-beta.1"] {
            let server = serve(version, SIG);
            assert!(check(&server, &app).unwrap().is_none(), "{version}");
        }
    }

    /// Manifest không ký: ai ghi được CDN có thể đặt bản beta (chữ ký vẫn đúng) vào `stable/latest.json`.
    #[test]
    fn the_stable_channel_never_takes_a_pre_release() {
        let app = app();
        let server = serve("0.9.0-beta.1", SIG);
        assert!(check_on(&server, &app, UpdateChannel::Stable).unwrap().is_none());
        let found = check_on(&server, &app, UpdateChannel::Beta).unwrap().expect("kênh beta nhận bản beta");
        assert_eq!(found.version(), "0.9.0-beta.1");
    }

    #[test]
    fn accepts_only_newer_and_no_pre_release_on_stable() {
        use UpdateChannel::{Beta, Stable};
        assert!(accepts(true, false, Stable) && accepts(true, false, Beta));
        assert!(accepts(true, true, Beta));
        assert!(!accepts(true, true, Stable), "beta vào stable");
        assert!(!accepts(false, false, Stable) && !accepts(false, true, Beta), "không mới hơn");
    }

    #[test]
    fn bad_signatures_never_reach_the_disk() {
        let app = app();
        for (name, sig) in [
            ("ký cho bản 0.8.0", include_str!("testdata/signed-as-0.8.0.sig")),
            ("chữ ký không gắn phiên bản", include_str!("testdata/no-version.sig")),
            ("khóa khác", include_str!("testdata/other-key.sig")),
        ] {
            let server = serve("0.9.0", sig);
            let found = check(&server, &app).unwrap().expect("manifest báo bản mới");
            let dest = dest();
            assert!(found.download(&dest).is_err(), "{name}");
            assert!(!dest.exists() && !dest.with_extension("part").exists(), "{name}");
        }
        // File bị đổi trên đường đi.
        let server = serve("0.9.0", SIG);
        let found = check(&server, &app).unwrap().unwrap();
        server.fault(Fault::Corrupt);
        let dest = dest();
        assert!(found.download(&dest).is_err());
        assert!(!dest.exists());
    }

    #[test]
    fn server_errors_are_errors_not_no_update() {
        let app = app();
        let server = serve("0.9.0", SIG);
        server.fault(Fault::Status(500));
        assert!(check(&server, &app).is_err());
        let empty = FakeServer::start();
        assert!(check(&empty, &app).is_err(), "404");
        let broken = FakeServer::start();
        broken.put("desktop/stable/latest.json", b"{\"version\": 1}");
        assert!(check(&broken, &app).is_err());
    }
}
```

Sửa `src-tauri/src/updater/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/updater/mod.rs b/src-tauri/src/updater/mod.rs
index 3af811751c30513d7b0fb96de23187d72ef96fcc..de3a5c689ca35343087c4e6871cd39c332cda6be 100644
--- a/src-tauri/src/updater/mod.rs
+++ b/src-tauri/src/updater/mod.rs
@@ -5,6 +5,7 @@
 //! - `requireSignedVersion` bật trong `tauri.conf.json`: chữ ký phải gắn đúng phiên bản mà manifest báo, để manifest
 //!   bị sửa không ghép được số phiên bản mới với bộ cài cũ.
 
+pub mod backend;
 pub mod source;
 
 use tauri::Runtime;
```

Run: `cargo test -p meeting-translator --lib -- updater::backend 2>&1 | grep -E '^test |^test result'`

Expected (lúc lập kế hoạch):
```text
test updater::backend::tests::accepts_only_newer_and_no_pre_release_on_stable ... ok
test updater::backend::tests::the_stable_channel_never_takes_a_pre_release ... ok
test updater::backend::tests::server_errors_are_errors_not_no_update ... ok
test updater::backend::tests::no_update_when_the_manifest_is_not_newer ... ok
test updater::backend::tests::finds_downloads_and_verifies_the_manifest_the_release_script_writes ... ok
test updater::backend::tests::bad_signatures_never_reach_the_disk ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 411 filtered out; finished in 0.02s
```

- [ ] **Step 3: Commit**

Run:
```bash
git add src-tauri/src/updater
git commit -q -m "feat(app): kiểm và tải bản cập nhật qua plugin; chữ ký sai, không gắn phiên bản hay của khóa khác thì không file nào được ghi; kênh stable không nhận bản beta (§6.11, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(app): kiểm và tải bản cập nhật qua plugin; chữ ký sai, không gắn phiên bản hay của khóa khác thì không file nào được ghi; kênh stable không nhận bản beta (§6.11, §10.2)
```

## Task 3: Luồng nền, cài lúc thoát, khởi động lại, menu khay

`Updater` (QĐ5–QĐ9, QĐ21): kiểm 60 giây sau khi mở app rồi mỗi 24 giờ theo giờ máy, đổi kênh thì kiểm ngay, lỗi mạng thì thử lại ở lần thức sau (mỗi giờ); tải vào `app_local_data_dir/updates/`, giữ SHA-256 của các byte đã kiểm chữ ký; báo `AppStatus.update_ready`. `on_exit` cài bản đã tải sau `kill_all` và `save_on_exit`, chỉ khi người dùng chủ động thoát (`actions::quit` gọi `prepare_quit`, hàm này gọi `updater::user_quits`; tách riêng để test gọi được mà không thoát app) hay khởi động lại để cập nhật (QĐ7), và chỉ khi SHA-256 của file trên đĩa còn khớp. Lệnh `restart_to_update` và mục menu khay (QĐ10, QĐ11) chỉ chạy khi có bản đã tải và app rảnh, dừng như Thoát ở menu khay rồi `request_restart`.

**Files:**
- Modify: `src-tauri/src/updater/mod.rs` (thay toàn bộ), `src-tauri/src/errors.rs`, `src-tauri/src/state.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`, `src-tauri/src/actions.rs`, `src-tauri/src/i18n.rs`, `src-tauri/src/tray_menu.rs`, `src-tauri/src/tray.rs`, `src-tauri/src/app_tests.rs`

- [ ] **Step 1: Test của app trước** (lệnh, đổi kênh, thứ tự lúc thoát)

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index a8c8cad51c5f1c48c9093c2816b7e87a96095d63..735f3363c9af87243f40e8c765ad2caf01bdd2ae 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -1595,3 +1595,127 @@ fn activating_a_full_key_returns_its_devices() {
     let bad = invoke(&main, "activate_license", json!({ "key": "abc" })).unwrap_err();
     assert!(bad.contains("licenseInvalidKey"), "{bad}");
 }
+
+// Tự cập nhật (kế hoạch 07b): lệnh khởi động lại, đổi kênh, cài ở lúc thoát.
+
+/// Việc của `kill_all` giả và của bản cập nhật giả, cùng một chỗ để so thứ tự.
+static UPDATE_LOG: std::sync::LazyLock<crate::updater::tests::Log> = std::sync::LazyLock::new(Default::default);
+
+fn kill_all_into_update_log() {
+    UPDATE_LOG.lock().unwrap().push("kill_all".into());
+}
+
+/// App giả có tự cập nhật với bản giả: manifest báo bản 0.2.0.
+fn app_with_update(log: crate::updater::tests::Log) -> tauri::App<tauri::test::MockRuntime> {
+    use crate::updater::tests::{Answer, NOW, fake_with_log};
+    let app = mock_app_with(FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    });
+    let clock = Arc::new(std::sync::atomic::AtomicU64::new(NOW));
+    let (updater, _log, _dir) = fake_with_log(vec![Answer::Newer("0.2.0")], clock, log);
+    app.manage(Arc::new(updater));
+    app
+}
+
+fn updater_of(app: &tauri::App<tauri::test::MockRuntime>) -> Arc<crate::updater::Updater> {
+    app.state::<Arc<crate::updater::Updater>>().inner().clone()
+}
+
+#[test]
+fn restart_to_update_needs_a_download_and_an_idle_app() {
+    use std::sync::atomic::{AtomicBool, Ordering};
+    static RESTARTED: AtomicBool = AtomicBool::new(false);
+    fn fake_restart(_: &tauri::AppHandle<tauri::test::MockRuntime>) {
+        RESTARTED.store(true, Ordering::SeqCst);
+    }
+    let code = |r: Result<Value, String>| -> String {
+        serde_json::from_str::<Value>(&r.unwrap_err())
+            .map(|v| v["code"].as_str().unwrap_or("").to_string())
+            .unwrap_or_default()
+    };
+    // Bản build không có nguồn cập nhật: không có `Updater`.
+    let plain = mock_app();
+    assert_eq!(
+        code(invoke(&window(&plain, "main"), "restart_to_update", json!({}))),
+        errors::UPDATE_NOT_READY
+    );
+
+    let log = crate::updater::tests::Log::default();
+    let app = app_with_update(log.clone());
+    let main = window(&app, "main");
+    assert_eq!(
+        code(invoke(&main, "restart_to_update", json!({}))),
+        errors::UPDATE_NOT_READY
+    );
+    assert_eq!(
+        invoke(&main, "get_app_status", json!({})).unwrap()["updateReady"],
+        Value::Null
+    );
+
+    assert!(updater_of(&app).tick(crate::settings::UpdateChannel::Stable));
+    crate::updater::publish(app.handle());
+    assert_eq!(
+        invoke(&main, "get_app_status", json!({})).unwrap()["updateReady"],
+        "0.2.0"
+    );
+
+    session::start(app.handle()).unwrap();
+    assert_eq!(
+        code(invoke(&main, "restart_to_update", json!({}))),
+        errors::UPDATE_BUSY,
+        "đang dịch"
+    );
+    session::stop(app.handle());
+    assert!(!RESTARTED.load(Ordering::SeqCst));
+
+    crate::updater::restart_to_update(app.handle(), fake_restart).unwrap();
+    wait_until("gọi khởi động lại", || RESTARTED.load(Ordering::SeqCst));
+    // Sau đó `RunEvent::Exit` cài bản mới, và báo bộ cài Windows mở lại app.
+    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, || {});
+    assert!(
+        log.lock()
+            .unwrap()
+            .contains(&"install 0.2.0 [bộ cài 0.2.0] restart=true".to_string()),
+        "{:?}",
+        log.lock().unwrap()
+    );
+}
+
+/// Thoát ở menu khay cũng cài bản đã tải, sau khi kill tiến trình phụ và lưu lịch sử; bộ cài Windows không mở lại app.
+/// `RunEvent::Exit` mà người dùng không yêu cầu (tắt máy, đăng xuất) thì không cài.
+#[test]
+fn a_user_quit_installs_the_download_after_killing_sidecars() {
+    let app = app_with_update(UPDATE_LOG.clone());
+    updater_of(&app).tick(crate::settings::UpdateChannel::Stable);
+    UPDATE_LOG.lock().unwrap().clear();
+    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, kill_all_into_update_log);
+    assert_eq!(*UPDATE_LOG.lock().unwrap(), ["kill_all"], "tắt máy, đăng xuất: không cài");
+    UPDATE_LOG.lock().unwrap().clear();
+    // Phần đồng bộ của Thoát ở menu khay (`actions::quit` gọi rồi mới dừng phiên và thoát).
+    crate::actions::prepare_quit(app.handle());
+    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, kill_all_into_update_log);
+    assert_eq!(
+        *UPDATE_LOG.lock().unwrap(),
+        ["kill_all", "install 0.2.0 [bộ cài 0.2.0] restart=false"]
+    );
+}
+
+#[test]
+fn changing_the_update_channel_wakes_the_updater() {
+    let app = app_with_update(Default::default());
+    let updater = updater_of(&app);
+    let waiter = updater.clone();
+    let started = Instant::now();
+    let done = std::thread::spawn(move || waiter.wait(Duration::from_secs(30)));
+    std::thread::sleep(Duration::from_millis(50));
+    let main = window(&app, "main");
+    invoke(
+        &main,
+        "update_settings",
+        json!({ "patch": { "updateChannel": "beta" } }),
+    )
+    .unwrap();
+    done.join().unwrap();
+    assert!(started.elapsed() < Duration::from_secs(10), "đổi kênh thì kiểm ngay");
+}
```

Run:
```bash
cargo test -p meeting-translator --lib -- app_tests::restart 2>&1 | grep -E '^error\[' | sort | uniq -c
```

Expected (lúc lập kế hoạch: chưa biên dịch được, chưa có `updater::tests`, `Updater`, `publish`, `restart_to_update`):
```text
   1 error[E0425]: cannot find function `prepare_quit` in module `crate::actions`
   1 error[E0425]: cannot find function `publish` in module `crate::updater`
   1 error[E0425]: cannot find function `restart_to_update` in module `crate::updater`
   2 error[E0425]: cannot find type `Updater` in module `crate::updater`
   1 error[E0425]: cannot find value `UPDATE_BUSY` in module `errors`
   2 error[E0425]: cannot find value `UPDATE_NOT_READY` in module `errors`
   1 error[E0432]: unresolved import `crate::updater::tests`
   3 error[E0433]: cannot find `tests` in `updater`
```

- [ ] **Step 2: Điều phối**

Thay toàn bộ `src-tauri/src/updater/mod.rs`:

```rust
//! Tự cập nhật app (F9, spec §6.11; kế hoạch 07b) bằng `tauri-plugin-updater`.
//!
//! - `source`: URL gốc và khóa công khai của bản build này; thiếu một trong hai thì tắt tự cập nhật.
//! - `backend`: kiểm manifest của kênh, tải và kiểm chữ ký (plugin); test dùng bản giả.
//! - Ở đây: kiểm sau khi mở app 1 phút rồi mỗi 24 giờ (giờ máy lùi thì kiểm lại), đổi kênh thì kiểm ngay; có bản mới
//!   thì tải nền vào `app_local_data_dir/updates/`, rồi báo `AppStatus::update_ready`. Cài ở lần thoát kế tiếp do người
//!   dùng chủ động (Thoát ở menu khay, [`user_quits`]), không cài khi hệ điều hành đóng app (tắt máy, đăng xuất: bộ cài có
//!   thể bị kill giữa chừng); [`install_on_exit`] chạy sau khi đã kill tiến trình phụ và lưu lịch sử. Khi app rảnh, cửa
//!   sổ chính và menu khay mời khởi động lại ([`restart_to_update`], đi qua `AppHandle::request_restart`, không bị chặn
//!   thoát).
//! - Trước khi cài, so SHA-256 của file trên đĩa với SHA-256 của đúng các byte đã kiểm chữ ký lúc tải: plugin không kiểm
//!   chữ ký lúc cài, nên file bị thay trong lúc chờ (vài giờ, vài ngày) thì không cài, xóa.
//! - Lỗi mạng hay lỗi tải thì thử lại ở lần thức kế tiếp (mỗi giờ), không hiện gì.
//! - Plugin chỉ dùng từ Rust: không cửa sổ nào được cấp lệnh của plugin (`acl_tests`).
//! - `requireSignedVersion` bật trong `tauri.conf.json`: chữ ký phải gắn đúng phiên bản mà manifest báo, để manifest
//!   bị sửa không ghép được số phiên bản mới với bộ cài cũ.

pub mod backend;
pub mod source;

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::models::service::ModelService;
use crate::settings::UpdateChannel;
use crate::state::{AppState, SessionStatus};
use crate::{actions, overlay, session};
use backend::{Backend, Downloaded, Install, PluginBackend};
use sha2::{Digest, Sha256};
use source::Source;

/// Kiểm lại sau chừng này giây (§6.11: mỗi 24 giờ).
pub const CHECK_EVERY_SECS: u64 = 24 * 3600;
/// Lần kiểm đầu sau khi mở app: chờ một chút để không tranh mạng với các việc lúc khởi động.
pub const FIRST_CHECK_AFTER: Duration = Duration::from_secs(60);
/// Luồng nền thức dậy mỗi giờ để xem đã tới hạn chưa (máy ngủ thì đồng hồ đơn điệu dừng, nên so theo giờ máy).
pub const WAKE_EVERY: Duration = Duration::from_secs(3600);

/// Plugin với khóa công khai của bản build này (chuỗi rỗng khi chưa có khóa; khi đó app không bao giờ gọi plugin).
pub fn plugin<R: Runtime>() -> TauriPlugin<R, tauri_plugin_updater::Config> {
    let pubkey = source::for_this_build().map(|s| s.pubkey).unwrap_or_default();
    tauri_plugin_updater::Builder::new().pubkey(pubkey).build()
}

/// Đã tới lúc kiểm chưa: chưa kiểm được lần nào, đã qua 24 giờ, hay giờ máy lùi về trước lần kiểm.
pub fn due(last: Option<u64>, now: u64) -> bool {
    last.is_none_or(|last| now < last || now - last >= CHECK_EVERY_SECS)
}

/// Bản đã tải, chữ ký đúng, chờ cài.
struct Pending {
    version: String,
    channel: UpdateChannel,
    file: PathBuf,
    installer: Box<dyn Install>,
    /// SHA-256 của các byte đã kiểm chữ ký lúc tải.
    sha256: [u8; 32],
}

#[derive(Default)]
struct Inner {
    /// Lần kiểm thành công gần nhất (giây Unix) và kênh của lần đó.
    last_check: Option<u64>,
    checked_channel: Option<UpdateChannel>,
    pending: Option<Pending>,
    /// Người dùng chủ động thoát hay khởi động lại để cập nhật: chỉ khi đó mới cài lúc thoát.
    user_exit: bool,
    /// Đang khởi động lại để cập nhật: Windows cho bộ cài mở lại app sau khi cài.
    restart: bool,
    woken: bool,
}

/// Trạng thái tự cập nhật, quản lý bằng `app.manage(Arc<Updater>)`; không có khi tự cập nhật tắt.
pub struct Updater {
    source: Source,
    backend: Box<dyn Backend>,
    dir: PathBuf,
    now: Box<dyn Fn() -> u64 + Send + Sync>,
    inner: Mutex<Inner>,
    wake: Condvar,
}

impl Updater {
    /// `dir`: nơi ghi bản đã tải. Bản tải ở lần chạy trước bị xóa: nó chỉ cài được qua đối tượng của plugin trong bộ
    /// nhớ, và lần chạy này sẽ kiểm lại.
    pub fn new(
        source: Source,
        backend: Box<dyn Backend>,
        dir: PathBuf,
        now: Box<dyn Fn() -> u64 + Send + Sync>,
    ) -> Self {
        let _ = std::fs::remove_dir_all(&dir);
        Self {
            source,
            backend,
            dir,
            now,
            inner: Mutex::new(Inner::default()),
            wake: Condvar::new(),
        }
    }

    /// Phiên bản đã tải xong, chờ cài.
    pub fn ready(&self) -> Option<String> {
        self.inner.lock().unwrap().pending.as_ref().map(|p| p.version.clone())
    }

    /// Một lượt của luồng nền với kênh đang chọn. Trả `true` khi bản chờ cài đổi (phải báo lại giao diện).
    pub fn tick(&self, channel: UpdateChannel) -> bool {
        let mut changed = false;
        {
            let mut inner = self.inner.lock().unwrap();
            // Đổi kênh: bản đã tải của kênh cũ không cài nữa (ví dụ từ beta về stable).
            if inner.pending.as_ref().is_some_and(|p| p.channel != channel) {
                drop_pending(&mut inner);
                changed = true;
            }
            if inner.checked_channel == Some(channel) && !due(inner.last_check, (self.now)()) {
                return changed;
            }
        }
        let endpoint = source::endpoint(&self.source.base, channel);
        let found = match self.backend.check(&endpoint, channel) {
            Ok(found) => found,
            Err(e) => {
                log::warn!("không kiểm được bản cập nhật ({endpoint}): {e}");
                return changed;
            }
        };
        let Some(found) = found else {
            self.checked(channel);
            // Không có bản nào mới hơn bản đang chạy: bản đã tải (nếu có) đã bị rút khỏi kênh, không cài nữa.
            let mut inner = self.inner.lock().unwrap();
            if inner.pending.is_some() {
                log::info!("bản cập nhật đã tải không còn trong kênh, bỏ");
                drop_pending(&mut inner);
                changed = true;
            }
            return changed;
        };
        let version = found.version().to_string();
        if self.ready().as_deref() == Some(version.as_str()) {
            self.checked(channel);
            return changed;
        }
        log::info!("có bản cập nhật {version}, đang tải");
        let file = self.dir.join(format!("{version}.bin"));
        match found.download(&file) {
            Ok(Downloaded { installer, sha256 }) => {
                self.checked(channel);
                let mut inner = self.inner.lock().unwrap();
                drop_pending(&mut inner);
                inner.pending = Some(Pending {
                    version,
                    channel,
                    file,
                    installer,
                    sha256,
                });
                true
            }
            Err(e) => {
                log::warn!("không tải được bản cập nhật {version}: {e}");
                changed
            }
        }
    }

    fn checked(&self, channel: UpdateChannel) {
        let mut inner = self.inner.lock().unwrap();
        inner.last_check = Some((self.now)());
        inner.checked_channel = Some(channel);
    }

    /// Đánh thức luồng nền (đổi kênh).
    pub fn wake(&self) {
        self.inner.lock().unwrap().woken = true;
        self.wake.notify_all();
    }

    /// Chờ tới khi bị đánh thức hay hết `timeout`.
    pub fn wait(&self, timeout: Duration) {
        let inner = self.inner.lock().unwrap();
        let (mut inner, _) = self.wake.wait_timeout_while(inner, timeout, |i| !i.woken).unwrap();
        inner.woken = false;
    }

    /// Cài bản đã tải (lúc app thoát). Windows: hàm không trả về khi bộ cài chạy được (plugin thoát tiến trình).
    pub fn install_pending(&self) {
        let (pending, restart) = {
            let mut inner = self.inner.lock().unwrap();
            if inner.pending.is_some() && !inner.user_exit {
                log::info!("app thoát không do người dùng (tắt máy, đăng xuất): không cài, lần mở sau kiểm lại");
                return;
            }
            (inner.pending.take(), inner.restart)
        };
        let Some(pending) = pending else { return };
        log::info!("cài bản cập nhật {}", pending.version);
        let result = std::fs::read(&pending.file).map_err(|e| e.to_string()).and_then(|bytes| {
            if <[u8; 32]>::from(Sha256::digest(&bytes)) != pending.sha256 {
                return Err("file trên đĩa khác bản đã kiểm chữ ký lúc tải, không cài".into());
            }
            pending.installer.install(&bytes, restart)
        });
        if let Err(e) = result {
            log::error!("không cài được bản cập nhật {}: {e}", pending.version);
        }
        let _ = std::fs::remove_file(&pending.file);
    }

    /// Người dùng chủ động thoát (menu khay): lần thoát này được cài bản đã tải.
    pub fn allow_install(&self) {
        self.inner.lock().unwrap().user_exit = true;
    }

    fn set_restart(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.user_exit = true;
        inner.restart = true;
    }
}

fn drop_pending(inner: &mut Inner) {
    if let Some(old) = inner.pending.take() {
        let _ = std::fs::remove_file(&old.file);
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Bật tự cập nhật khi bản build này có nguồn (URL gốc và khóa), rồi chạy luồng nền. Gọi một lần trong `setup`, sau khi
/// có `AppState`.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(source) = source::for_this_build() else {
        log::info!("tự cập nhật tắt: bản build này chưa có URL gốc hay khóa công khai");
        return Ok(());
    };
    let dir = app.path().app_local_data_dir()?.join("updates");
    let updater = Arc::new(Updater::new(
        source,
        Box::new(PluginBackend(app.clone())),
        dir,
        Box::new(unix_now),
    ));
    app.manage(updater.clone());
    let app = app.clone();
    std::thread::spawn(move || {
        updater.wait(FIRST_CHECK_AFTER);
        loop {
            let channel = app.state::<AppState>().settings().update_channel;
            if updater.tick(channel) {
                publish(&app);
            }
            updater.wait(WAKE_EVERY);
        }
    });
    Ok(())
}

/// Ghi phiên bản chờ cài vào trạng thái app, báo giao diện và menu khay.
pub fn publish<R: Runtime>(app: &AppHandle<R>) {
    let ready = app.try_state::<Arc<Updater>>().and_then(|u| u.ready());
    app.state::<AppState>().update_status(|s| s.update_ready = ready);
    actions::status_changed(app);
}

/// Người dùng vừa đổi kênh cập nhật: kiểm ngay.
pub fn channel_changed<R: Runtime>(app: &AppHandle<R>) {
    if let Some(updater) = app.try_state::<Arc<Updater>>() {
        updater.wake();
    }
}

/// Người dùng chọn Thoát (menu khay): cho phép cài bản đã tải lúc thoát.
pub fn user_quits<R: Runtime>(app: &AppHandle<R>) {
    if let Some(updater) = app.try_state::<Arc<Updater>>() {
        updater.allow_install();
    }
}

/// Lúc app thoát (`RunEvent::Exit`), sau khi đã kill tiến trình phụ và lưu lịch sử. Chỉ cài khi người dùng chủ động thoát
/// hay khởi động lại để cập nhật.
pub fn install_on_exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(updater) = app.try_state::<Arc<Updater>>() {
        updater.install_pending();
    }
}

/// Khởi động lại để cập nhật (cửa sổ chính, menu khay). Chỉ khi đã có bản tải xong và app rảnh: không đang dịch, không
/// đang tải model. Dừng như Thoát ở menu khay rồi gọi `restart` (bản thật: `AppHandle::request_restart`; test truyền
/// bản giả). `RunEvent::Exit` sau đó cài bản mới.
pub fn restart_to_update<R: Runtime>(app: &AppHandle<R>, restart: fn(&AppHandle<R>)) -> Result<(), CommandError> {
    let Some(updater) = app.try_state::<Arc<Updater>>() else {
        return Err(CommandError::new(errors::UPDATE_NOT_READY, None, "tự cập nhật tắt"));
    };
    if updater.ready().is_none() {
        return Err(CommandError::new(
            errors::UPDATE_NOT_READY,
            None,
            "chưa có bản cập nhật đã tải",
        ));
    }
    let session = app.state::<AppState>().status().session;
    let models_busy = app.try_state::<Arc<ModelService>>().is_some_and(|m| m.busy());
    if !matches!(session, SessionStatus::Idle | SessionStatus::Error) || models_busy {
        return Err(CommandError::new(
            errors::UPDATE_BUSY,
            None,
            format!("đang dịch hay đang tải model ({session:?}, model: {models_busy})"),
        ));
    }
    updater.set_restart();
    overlay::remember_position(app);
    log::info!("khởi động lại để cập nhật");
    let app = app.clone();
    std::thread::spawn(move || {
        session::shutdown(&app);
        restart(&app);
    });
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::path::Path;
    use std::sync::atomic::{AtomicU64, Ordering};

    use backend::Found;
    use reqwest::Url;

    pub const NOW: u64 = 1_790_000_000;

    /// Kết quả giả cho một lần `check`.
    pub enum Answer {
        Newer(&'static str),
        NewerButDownloadFails(&'static str),
        UpToDate,
        Offline,
    }

    /// Mọi việc bản giả ghi lại: `check <url>`, `download <phiên bản>`, `install <phiên bản> <nội dung> <restart>`.
    pub type Log = Arc<Mutex<Vec<String>>>;

    pub struct FakeBackend {
        answers: Mutex<VecDeque<Answer>>,
        log: Log,
    }

    impl Backend for FakeBackend {
        fn check(&self, endpoint: &Url, _channel: UpdateChannel) -> Result<Option<Box<dyn Found>>, String> {
            self.log.lock().unwrap().push(format!("check {endpoint}"));
            match self.answers.lock().unwrap().pop_front().unwrap_or(Answer::UpToDate) {
                Answer::Newer(v) => Ok(Some(Box::new(FakeFound(v, true, self.log.clone())))),
                Answer::NewerButDownloadFails(v) => Ok(Some(Box::new(FakeFound(v, false, self.log.clone())))),
                Answer::UpToDate => Ok(None),
                Answer::Offline => Err("mất mạng".into()),
            }
        }
    }

    struct FakeFound(&'static str, bool, Log);

    impl Found for FakeFound {
        fn version(&self) -> &str {
            self.0
        }

        fn download(self: Box<Self>, dest: &Path) -> Result<Downloaded, String> {
            self.2.lock().unwrap().push(format!("download {}", self.0));
            if !self.1 {
                return Err("rớt mạng".into());
            }
            let bytes = format!("bộ cài {}", self.0);
            backend::write_atomically(dest, bytes.as_bytes())?;
            Ok(Downloaded {
                installer: Box::new(FakeInstall(self.0, self.2)),
                sha256: Sha256::digest(bytes.as_bytes()).into(),
            })
        }
    }

    struct FakeInstall(&'static str, Log);

    impl Install for FakeInstall {
        fn install(&self, bytes: &[u8], restart: bool) -> Result<(), String> {
            let text = String::from_utf8_lossy(bytes);
            self.1
                .lock()
                .unwrap()
                .push(format!("install {} [{text}] restart={restart}", self.0));
            Ok(())
        }
    }

    /// Updater với bản giả, thư mục tạm riêng, đồng hồ `clock`.
    pub fn fake(answers: Vec<Answer>, clock: Arc<AtomicU64>) -> (Updater, Log, PathBuf) {
        fake_with_log(answers, clock, Log::default())
    }

    /// Như [`fake`], ghi vào `log` có sẵn (test của app ghi cả việc khác vào cùng chỗ, để so thứ tự).
    pub fn fake_with_log(answers: Vec<Answer>, clock: Arc<AtomicU64>, log: Log) -> (Updater, Log, PathBuf) {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "mt-updates-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let source = Source {
            base: Url::parse("https://releases.example.com/desktop/").unwrap(),
            pubkey: "khóa".into(),
        };
        let backend = FakeBackend {
            answers: Mutex::new(answers.into()),
            log: log.clone(),
        };
        let updater = Updater::new(
            source,
            Box::new(backend),
            dir.clone(),
            Box::new(move || clock.load(Ordering::SeqCst)),
        );
        (updater, log, dir)
    }

    fn take(log: &Log) -> Vec<String> {
        std::mem::take(&mut *log.lock().unwrap())
    }

    const STABLE: &str = "check https://releases.example.com/desktop/stable/latest.json";
    const BETA: &str = "check https://releases.example.com/desktop/beta/latest.json";

    #[test]
    fn due_after_a_day_or_when_the_clock_goes_back() {
        assert!(due(None, NOW));
        assert!(!due(Some(NOW), NOW + CHECK_EVERY_SECS - 1));
        assert!(due(Some(NOW), NOW + CHECK_EVERY_SECS));
        assert!(due(Some(NOW), NOW - 1));
    }

    #[test]
    fn checks_once_a_day_and_downloads_each_version_once() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0"), Answer::Newer("0.2.0")], clock.clone());
        assert!(u.tick(UpdateChannel::Stable));
        assert_eq!(take(&log), [STABLE, "download 0.2.0"]);
        assert_eq!(u.ready().as_deref(), Some("0.2.0"));
        assert_eq!(std::fs::read_to_string(dir.join("0.2.0.bin")).unwrap(), "bộ cài 0.2.0");
        clock.store(NOW + CHECK_EVERY_SECS - 1, Ordering::SeqCst);
        assert!(!u.tick(UpdateChannel::Stable));
        assert!(take(&log).is_empty(), "chưa tới 24 giờ thì không gọi mạng");
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(!u.tick(UpdateChannel::Stable), "manifest vẫn báo 0.2.0: không tải lại");
        assert_eq!(take(&log), [STABLE]);
    }

    #[test]
    fn a_newer_release_replaces_the_downloaded_one() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0"), Answer::Newer("0.2.1")], clock.clone());
        u.tick(UpdateChannel::Stable);
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(u.tick(UpdateChannel::Stable));
        assert_eq!(u.ready().as_deref(), Some("0.2.1"));
        assert!(!dir.join("0.2.0.bin").exists());
        assert!(dir.join("0.2.1.bin").exists());
        assert_eq!(take(&log), [STABLE, "download 0.2.0", STABLE, "download 0.2.1"]);
    }

    #[test]
    fn network_errors_retry_at_the_next_wake_and_keep_the_download() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, _dir) = fake(
            vec![
                Answer::Offline,
                Answer::NewerButDownloadFails("0.2.0"),
                Answer::Newer("0.2.0"),
                Answer::Offline,
            ],
            clock.clone(),
        );
        assert!(!u.tick(UpdateChannel::Stable));
        assert!(!u.tick(UpdateChannel::Stable), "lỗi tải: chưa có gì để cài");
        assert_eq!(u.ready(), None);
        assert!(
            u.tick(UpdateChannel::Stable),
            "lần thức sau thử lại ngay, không chờ 24 giờ"
        );
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(!u.tick(UpdateChannel::Stable));
        assert_eq!(u.ready().as_deref(), Some("0.2.0"), "mất mạng không bỏ bản đã tải");
        assert_eq!(
            take(&log),
            [STABLE, STABLE, "download 0.2.0", STABLE, "download 0.2.0", STABLE]
        );
    }

    #[test]
    fn a_release_pulled_from_the_channel_is_not_installed() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, _log, dir) = fake(vec![Answer::Newer("0.2.0"), Answer::UpToDate], clock.clone());
        u.tick(UpdateChannel::Stable);
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(u.tick(UpdateChannel::Stable));
        assert_eq!(u.ready(), None);
        assert!(!dir.join("0.2.0.bin").exists());
    }

    #[test]
    fn switching_channel_drops_the_download_and_checks_at_once() {
        let clock = Arc::new(AtomicU64::new(NOW));
        // Kênh mới không kiểm được (mất mạng): bản đã tải của kênh cũ vẫn phải bỏ.
        let (u, log, dir) = fake(vec![Answer::Newer("0.3.0-beta.1"), Answer::Offline], clock);
        u.tick(UpdateChannel::Beta);
        assert_eq!(take(&log), [BETA, "download 0.3.0-beta.1"]);
        assert!(u.tick(UpdateChannel::Stable), "bản beta đã tải bị bỏ khi về stable");
        assert_eq!(u.ready(), None);
        assert!(!dir.join("0.3.0-beta.1.bin").exists());
        assert_eq!(take(&log), [STABLE], "kiểm kênh mới ngay, không chờ 24 giờ");
    }

    #[test]
    fn installs_the_downloaded_file_once_and_cleans_up() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0")], clock);
        u.allow_install();
        u.install_pending();
        assert!(take(&log).is_empty(), "chưa có bản nào thì không cài gì");
        u.tick(UpdateChannel::Stable);
        take(&log);
        u.install_pending();
        assert_eq!(take(&log), ["install 0.2.0 [bộ cài 0.2.0] restart=false"]);
        assert!(!dir.join("0.2.0.bin").exists());
        u.install_pending();
        assert!(take(&log).is_empty(), "chỉ cài một lần");
    }

    #[test]
    fn exiting_without_the_user_asking_installs_nothing() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0")], clock);
        u.tick(UpdateChannel::Stable);
        take(&log);
        u.install_pending();
        assert!(take(&log).is_empty(), "tắt máy, đăng xuất: không cài");
        assert_eq!(u.ready().as_deref(), Some("0.2.0"));
        assert!(dir.join("0.2.0.bin").exists());
    }

    #[test]
    fn a_file_changed_on_disk_is_never_installed() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0")], clock);
        u.tick(UpdateChannel::Stable);
        take(&log);
        std::fs::write(dir.join("0.2.0.bin"), "bộ cài khác").unwrap();
        u.allow_install();
        u.install_pending();
        assert!(take(&log).is_empty(), "không cài file đã bị thay");
        assert!(!dir.join("0.2.0.bin").exists(), "file bị thay đã xóa");
        assert_eq!(u.ready(), None);
    }

    #[test]
    fn a_new_run_forgets_the_previous_download() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, _log, dir) = fake(vec![Answer::Newer("0.2.0")], clock.clone());
        u.tick(UpdateChannel::Stable);
        assert!(dir.join("0.2.0.bin").exists());
        let source = u.source.clone();
        let again = Updater::new(
            source,
            Box::new(FakeBackend {
                answers: Mutex::default(),
                log: Log::default(),
            }),
            dir.clone(),
            Box::new(|| NOW),
        );
        assert_eq!(again.ready(), None);
        assert!(!dir.exists());
    }

    #[test]
    fn wake_ends_the_wait_early() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, _log, _dir) = fake(vec![], clock);
        let u = Arc::new(u);
        let waiter = u.clone();
        let started = std::time::Instant::now();
        let handle = std::thread::spawn(move || waiter.wait(Duration::from_secs(30)));
        std::thread::sleep(Duration::from_millis(50));
        u.wake();
        handle.join().unwrap();
        assert!(started.elapsed() < Duration::from_secs(10));
        let started = std::time::Instant::now();
        u.wait(Duration::from_millis(50));
        assert!(
            started.elapsed() >= Duration::from_millis(50),
            "đánh thức chỉ có tác dụng một lần"
        );
    }
}
```

- [ ] **Step 3: Nối vào app**

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index 7c66a97592f58c45fc155dfc9dd6a651ead06af1..b59a7580d7181ffb085b29e4a04218dde4f774b3 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -63,6 +63,12 @@ pub const FILE_TOO_LARGE: &str = "fileTooLarge";
 /// Lỗi bên trong app không thuộc loại nào ở trên (ví dụ một tác vụ nền dừng bất thường).
 pub const UNKNOWN: &str = "unknown";
 
+// Mã lỗi của tự cập nhật (kế hoạch 07b, spec §6.11).
+/// Khởi động lại để cập nhật khi chưa có bản nào tải xong.
+pub const UPDATE_NOT_READY: &str = "updateNotReady";
+/// Khởi động lại để cập nhật khi đang dịch hay đang tải model: dừng việc đó trước.
+pub const UPDATE_BUSY: &str = "updateBusy";
+
 // Mã lỗi của quản lý model (kế hoạch 04, spec §6.7, §9).
 /// Bản này chưa có URL manifest (bản dev chưa cấu hình staging; bản phát hành chờ kế hoạch 07).
 pub const MODELS_NO_SOURCE: &str = "modelsNoSource";
```

Sửa `src-tauri/src/state.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/state.rs b/src-tauri/src/state.rs
index e8b21e4236d2dbc632cfd4713caa9c3c147e689e..65f5a0d3d35461f59762812e5d7f95533698b25f 100644
--- a/src-tauri/src/state.rs
+++ b/src-tauri/src/state.rs
@@ -61,6 +61,9 @@ pub struct AppStatus {
     pub quota_warning: bool,
     /// Thời điểm hạn mức được reset (giây Unix), để báo khi hết hạn mức; `None` khi không giới hạn.
     pub quota_reset_at: Option<i64>,
+    /// Phiên bản app mới đã tải xong, sẽ cài ở lần thoát kế tiếp (§6.11; kế hoạch 07b). Khi app rảnh, cửa sổ chính và menu
+    /// khay mời khởi động lại để cập nhật. Đặt bởi `updater::publish`.
+    pub update_ready: Option<String>,
     /// Tăng mỗi lần trạng thái đổi. Giao diện bỏ trạng thái có `rev` nhỏ hơn trạng thái đã có (kết quả của một lệnh có thể
     /// tới sau sự kiện `app://status` mới hơn).
     pub rev: u64,
@@ -137,6 +140,7 @@ impl AppState {
                 pro: false,
                 quota_warning: false,
                 quota_reset_at: None,
+                update_ready: None,
                 rev: 0,
             }),
             launched_at_login,
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 89f63a05a7bf56b83fecbae39dff00a8b0e5839b..0c1ae3eabe6c69a30a55488436f51b94f9d089bf 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -157,6 +157,8 @@ fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
         models::service::Config::live(&handle)?,
     )));
     models::service::check_on_startup(&handle);
+    // Tự cập nhật (kế hoạch 07b): kiểm 1 phút sau khi mở rồi mỗi 24 giờ, tải nền; tắt khi bản build chưa có nguồn.
+    updater::install(&handle)?;
     app.manage(session::Session::new(Arc::new(session::LiveDeps::new(handle.clone()))));
     session::spawn_ticker(&handle);
 
@@ -208,9 +210,13 @@ pub(crate) fn handle_run_event<R: tauri::Runtime>(app: &AppHandle<R>, event: Run
 /// App thoát (`RunEvent::Exit`): lưới an toàn kill tiến trình phụ còn sống (Thoát ở menu khay đã tắt chúng), rồi lưu lịch
 /// sử của phiên còn chạy khi app thoát không qua menu khay: tắt máy, đăng xuất, cập nhật (Q3 của review 03). Tách riêng,
 /// nhận hàm kill, để test gọi được mà không kill tiến trình của test khác (N-A của review 03 lần 2).
+///
+/// Cuối cùng cài bản cập nhật đã tải (kế hoạch 07b). Phải sau hai việc trên: trên Windows plugin chạy bộ cài rồi thoát
+/// tiến trình ngay (`std::process::exit`), không quay lại đây; bộ cài thay file của app, nên tiến trình phụ phải tắt trước.
 pub(crate) fn on_exit<R: tauri::Runtime>(app: &AppHandle<R>, kill_all: fn()) {
     kill_all();
     session::save_on_exit(app);
+    updater::install_on_exit(app);
 }
 
 /// Windows: chỉ nạp DLL từ thư mục hệ thống và thư mục của app, không từ thư mục hiện hành hay `PATH` (chống DLL
```

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/commands.rs b/src-tauri/src/commands.rs
index 3d141204959a64130976f738c5b3b35175b1a127..365800224a14aaf303f3bc06c10ef942e1f724ca 100644
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -337,6 +337,12 @@ pub fn end_overlay_resize<R: Runtime>(app: AppHandle<R>) {
     overlay::end_resize(&app);
 }
 
+/// Khởi động lại để cài bản cập nhật đã tải (kế hoạch 07b): chỉ khi app rảnh.
+#[tauri::command]
+pub fn restart_to_update<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
+    crate::updater::restart_to_update(&app, |app| app.request_restart())
+}
+
 /// Lệnh của cửa sổ `main`.
 pub const MAIN_COMMANDS: &[&str] = &[
     "get_settings",
@@ -388,6 +394,7 @@ pub const MAIN_COMMANDS: &[&str] = &[
     "cancel_checkout",
     "open_checkout_page",
     "recover_license",
+    "restart_to_update",
 ];
 
 /// Lệnh của cửa sổ `overlay`.
@@ -441,6 +448,7 @@ pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send +
         cancel_checkout,
         open_checkout_page,
         recover_license,
+        restart_to_update,
         get_overlay_view,
         hide_overlay,
         begin_overlay_resize,
```

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
index f56b69886d8875a3195aeac0ea796fba0bc84490..a1f6f1f271ff1503c643e3a013f97e83e06ca524 100644
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -61,6 +61,7 @@ fn main() {
             "cancel_checkout",
             "open_checkout_page",
             "recover_license",
+            "restart_to_update",
             "get_overlay_view",
             "hide_overlay",
             "begin_overlay_resize",
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/capabilities/main.json b/src-tauri/capabilities/main.json
index 38cfcf6c19c350fbb04e8b2e7d03ceccccd93bda..b80113db7fc84b15192f3f80f2634ca9b85636ad 100644
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -53,6 +53,7 @@
     "allow-cancel-checkout",
     "allow-open-checkout-page",
     "allow-recover-license",
+    "allow-restart-to-update",
     "core:event:allow-listen",
     "core:event:allow-unlisten",
     "core:webview:allow-set-webview-zoom"
```

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/actions.rs b/src-tauri/src/actions.rs
index 39e7a877717462f0d0f9def544183204610510db..16ecf324ab9e36a9fd63d352c92a38ee07c06fd9 100644
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -10,7 +10,7 @@ use crate::hotkeys::HotkeyAction;
 use crate::login_item::LoginItems;
 use crate::settings::{self, Settings, persist};
 use crate::state::{AppState, AppStatus, OverlayView};
-use crate::{events, hotkey_registry, login_item, overlay, session, system, tray, window};
+use crate::{events, hotkey_registry, login_item, overlay, session, system, tray, updater, window};
 
 /// Lưu cài đặt mới rồi báo mọi nơi cần biết.
 pub(crate) fn commit_settings<R: Runtime>(app: &AppHandle<R>, mut next: Settings) -> Settings {
@@ -27,6 +27,9 @@ pub(crate) fn commit_settings<R: Runtime>(app: &AppHandle<R>, mut next: Settings
     if previous.ui_language != next.ui_language || previous.overlay.locked != next.overlay.locked {
         tray::refresh(app);
     }
+    if previous.update_channel != next.update_channel {
+        updater::channel_changed(app);
+    }
     next
 }
 
@@ -261,11 +264,18 @@ pub fn open_audio_permission_settings<R: Runtime>(app: &AppHandle<R>) -> Result<
     system::open_audio_permission_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
 }
 
+/// Phần đồng bộ của Thoát ở menu khay, trước khi dừng phiên và thoát: nhớ vị trí thanh phụ đề, và cho phép cài bản cập nhật
+/// đã tải vì người dùng chủ động thoát (khác tắt máy, đăng xuất; kế hoạch 07b). Tách riêng để test gọi được mà không thoát.
+pub(crate) fn prepare_quit<R: Runtime>(app: &AppHandle<R>) {
+    overlay::remember_position(app);
+    log::info!("thoát theo yêu cầu từ menu khay");
+    updater::user_quits(app);
+}
+
 /// Thoát hẳn, chỉ gọi từ menu khay (§4.3): nhớ vị trí thanh phụ đề, dừng phiên, tắt hai tiến trình phụ, rồi thoát.
 /// Dừng phiên có thể chờ tới 2 giây (câu đang dịch), nên việc đó chạy trên luồng riêng.
 pub fn quit<R: Runtime>(app: &AppHandle<R>) {
-    overlay::remember_position(app);
-    log::info!("thoát theo yêu cầu từ menu khay");
+    prepare_quit(app);
     let app = app.clone();
     std::thread::spawn(move || {
         session::shutdown(&app);
```

Sửa `src-tauri/src/i18n.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/i18n.rs b/src-tauri/src/i18n.rs
index 58f0253768a4f14e2c771da877d30f502977fd5c..648f9fa3cc7c5bad84b58adcba9564645c389e84 100644
--- a/src-tauri/src/i18n.rs
+++ b/src-tauri/src/i18n.rs
@@ -16,6 +16,8 @@ pub struct Strings {
     pub tray_unlock_overlay: &'static str,
     pub tray_open_main: &'static str,
     pub tray_quit: &'static str,
+    /// Có bản cập nhật đã tải và app rảnh (kế hoạch 07b).
+    pub tray_restart_to_update: &'static str,
     /// Dòng báo trong menu khay khi có phím tắt không đăng ký được.
     pub tray_hotkey_failed: &'static str,
     /// Chú thích icon khay: `{app}` là tên app, `{status}` là trạng thái.
@@ -41,6 +43,7 @@ pub const EN: Strings = Strings {
     tray_unlock_overlay: "Unlock subtitles",
     tray_open_main: "Open main window",
     tray_quit: "Quit",
+    tray_restart_to_update: "Restart to update",
     tray_hotkey_failed: "Some shortcuts could not be registered",
     tray_tooltip: "{app}: {status}",
     status_idle: "Ready",
@@ -63,6 +66,7 @@ pub const VI: Strings = Strings {
     tray_unlock_overlay: "Mở khóa phụ đề",
     tray_open_main: "Mở cửa sổ chính",
     tray_quit: "Thoát",
+    tray_restart_to_update: "Khởi động lại để cập nhật",
     tray_hotkey_failed: "Có phím tắt không đăng ký được",
     tray_tooltip: "{app}: {status}",
     status_idle: "Sẵn sàng",
@@ -89,6 +93,7 @@ impl Strings {
             tray_unlock_overlay,
             tray_open_main,
             tray_quit,
+            tray_restart_to_update,
             tray_hotkey_failed,
             tray_tooltip,
             status_idle,
@@ -110,6 +115,7 @@ impl Strings {
             ("tray_unlock_overlay", tray_unlock_overlay),
             ("tray_open_main", tray_open_main),
             ("tray_quit", tray_quit),
+            ("tray_restart_to_update", tray_restart_to_update),
             ("tray_hotkey_failed", tray_hotkey_failed),
             ("tray_tooltip", tray_tooltip),
             ("status_idle", status_idle),
```

Sửa `src-tauri/src/tray_menu.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/tray_menu.rs b/src-tauri/src/tray_menu.rs
index 483d97c9882f8dad02206397fa1a566a1232b7d9..4c6473ad94b5636a4e7182d9a7649bdc8597c437 100644
--- a/src-tauri/src/tray_menu.rs
+++ b/src-tauri/src/tray_menu.rs
@@ -10,16 +10,18 @@ pub enum TrayItem {
     Overlay,
     Lock,
     OpenMain,
+    RestartToUpdate,
     Quit,
 }
 
 impl TrayItem {
-    pub const ALL: [TrayItem; 6] = [
+    pub const ALL: [TrayItem; 7] = [
         Self::HotkeyWarning,
         Self::Session,
         Self::Overlay,
         Self::Lock,
         Self::OpenMain,
+        Self::RestartToUpdate,
         Self::Quit,
     ];
 
@@ -30,6 +32,7 @@ impl TrayItem {
             Self::Overlay => "overlay-visible",
             Self::Lock => "overlay-lock",
             Self::OpenMain => "open-main",
+            Self::RestartToUpdate => "restart-to-update",
             Self::Quit => "quit",
         }
     }
@@ -46,6 +49,8 @@ pub struct TrayModel {
     pub overlay_visible: bool,
     pub locked: bool,
     pub hotkeys_failed: bool,
+    /// Có bản cập nhật đã tải (kế hoạch 07b). Dòng mời chỉ hiện khi không dịch (§6.11: "app đang rảnh").
+    pub update_ready: bool,
 }
 
 /// Các dòng của menu theo thứ tự; `None` là đường kẻ ngang.
@@ -78,6 +83,9 @@ pub fn menu_lines(strings: &Strings, model: TrayModel) -> Vec<Option<(TrayItem,
     lines.push(None);
     lines.push(Some((TrayItem::OpenMain, strings.tray_open_main)));
     lines.push(None);
+    if model.update_ready && !model.running {
+        lines.push(Some((TrayItem::RestartToUpdate, strings.tray_restart_to_update)));
+    }
     lines.push(Some((TrayItem::Quit, strings.tray_quit)));
     lines
 }
@@ -102,6 +110,7 @@ mod tests {
             overlay_visible: true,
             locked: false,
             hotkeys_failed: false,
+            update_ready: false,
         };
         assert_eq!(
             lines(&menu_lines(&i18n::VI, model)),
@@ -124,6 +133,7 @@ mod tests {
             overlay_visible: false,
             locked: true,
             hotkeys_failed: true,
+            update_ready: true,
         };
         assert_eq!(
             lines(&menu_lines(&i18n::EN, model)),
@@ -160,10 +170,37 @@ mod tests {
                 TrayItem::Overlay => 2,
                 TrayItem::Lock => 3,
                 TrayItem::OpenMain => 4,
-                TrayItem::Quit => 5,
+                TrayItem::RestartToUpdate => 5,
+                TrayItem::Quit => 6,
             };
             assert_eq!(position, index, "{item:?}");
         }
-        assert_eq!(TrayItem::ALL.len(), 6);
+        assert_eq!(TrayItem::ALL.len(), 7);
+    }
+
+    #[test]
+    fn restart_to_update_only_when_idle() {
+        let model = |running| TrayModel {
+            running,
+            overlay_visible: false,
+            locked: false,
+            hotkeys_failed: false,
+            update_ready: true,
+        };
+        assert_eq!(
+            lines(&menu_lines(&i18n::VI, model(false)))[4..],
+            [
+                ("open-main", "Mở cửa sổ chính"),
+                ("---", "---"),
+                ("restart-to-update", "Khởi động lại để cập nhật"),
+                ("quit", "Thoát")
+            ]
+        );
+        assert!(
+            !lines(&menu_lines(&i18n::EN, model(true)))
+                .iter()
+                .any(|(id, _)| *id == "restart-to-update"),
+            "đang dịch thì không mời"
+        );
     }
 }
```

Sửa `src-tauri/src/tray.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/tray.rs b/src-tauri/src/tray.rs
index c517856cf8adfc6358bb93b92ec0510cb37f29c9..07b76a4ec9fdaffd73082cc9f208427bc120c50c 100644
--- a/src-tauri/src/tray.rs
+++ b/src-tauri/src/tray.rs
@@ -10,7 +10,7 @@ use crate::hotkeys::HotkeyAction;
 use crate::i18n::{self, Strings};
 use crate::state::{AppState, SessionStatus};
 use crate::tray_menu::{TrayItem, TrayModel, menu_lines};
-use crate::{actions, events, window};
+use crate::{actions, events, updater, window};
 
 pub const TRAY_ID: &str = "main";
 
@@ -23,6 +23,7 @@ fn model<R: Runtime>(app: &AppHandle<R>) -> (TrayModel, &'static Strings) {
         overlay_visible: status.overlay_visible,
         locked: settings.overlay.locked,
         hotkeys_failed: !status.hotkey_failures.is_empty(),
+        update_ready: status.update_ready.is_some(),
     };
     (model, i18n::strings(settings.ui_language))
 }
@@ -101,6 +102,11 @@ fn on_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
         Some(TrayItem::Overlay) => actions::run_hotkey(app, HotkeyAction::ToggleOverlay),
         Some(TrayItem::Lock) => actions::run_hotkey(app, HotkeyAction::ToggleLock),
         Some(TrayItem::OpenMain) => window::show_main(app),
+        Some(TrayItem::RestartToUpdate) => {
+            if let Err(e) = updater::restart_to_update(app, |app| app.request_restart()) {
+                log::warn!("không khởi động lại để cập nhật được: {}", e.message);
+            }
+        }
         Some(TrayItem::Quit) => actions::quit(app),
         None => log::warn!("mục menu khay lạ: {id}"),
     }
```

Run:
```bash
cargo test -p meeting-translator --lib -- updater:: tray_menu app_tests::restart app_tests::a_user_quit app_tests::the_exit app_tests::changing_the_update 2>&1 | grep -E '^test |^test result'
```

Expected (lúc lập kế hoạch):
```text
test updater::backend::tests::accepts_only_newer_and_no_pre_release_on_stable ... ok
test tray_menu::tests::all_lists_every_item_in_menu_order ... ok
test tray_menu::tests::item_ids_roundtrip ... ok
test tray_menu::tests::idle_menu_in_vietnamese ... ok
test tray_menu::tests::restart_to_update_only_when_idle ... ok
test tray_menu::tests::labels_follow_state_in_english ... ok
test updater::source::tests::only_https_except_loopback_http_in_dev ... ok
test updater::source::tests::endpoint_per_channel ... ok
test updater::source::tests::dev_builds_read_staging_or_the_env_and_release_builds_only_production ... ok
test updater::source::tests::public_key_per_environment_and_only_the_tauri_format ... ok
test updater::source::tests::the_shipped_key_file_has_no_private_key ... ok
test updater::backend::tests::the_stable_channel_never_takes_a_pre_release ... ok
test updater::backend::tests::server_errors_are_errors_not_no_update ... ok
test updater::backend::tests::no_update_when_the_manifest_is_not_newer ... ok
test updater::tests::due_after_a_day_or_when_the_clock_goes_back ... ok
test updater::tests::a_new_run_forgets_the_previous_download ... ok
test updater::tests::a_newer_release_replaces_the_downloaded_one ... ok
test updater::tests::exiting_without_the_user_asking_installs_nothing ... ok
test updater::tests::a_release_pulled_from_the_channel_is_not_installed ... ok
test updater::tests::network_errors_retry_at_the_next_wake_and_keep_the_download ... ok
test updater::backend::tests::bad_signatures_never_reach_the_disk ... ok
test updater::backend::tests::finds_downloads_and_verifies_the_manifest_the_release_script_writes ... ok
test updater::tests::checks_once_a_day_and_downloads_each_version_once ... ok
test updater::tests::switching_channel_drops_the_download_and_checks_at_once ... ok
test updater::tests::a_file_changed_on_disk_is_never_installed ... ok
test updater::tests::installs_the_downloaded_file_once_and_cleans_up ... ok
test app_tests::a_user_quit_installs_the_download_after_killing_sidecars ... ok
test app_tests::restart_to_update_needs_a_download_and_an_idle_app ... ok
test app_tests::changing_the_update_channel_wakes_the_updater ... ok
test updater::tests::wake_ends_the_wait_early ... ok
test app_tests::the_exit_event_saves_the_running_session_to_history ... ok
test result: ok. 31 passed; 0 failed; 0 ignored; 0 measured; 401 filtered out; finished in 0.28s
```

Run:
```bash
cargo test -p meeting-translator --lib -q 2>&1 | grep '^test result'
cargo clippy -p meeting-translator --all-targets -q -- -D warnings; echo "clippy: $?"
./scripts/check-windows.sh -q; echo "check-windows: $?"
```

Expected (lúc lập kế hoạch):
```text
test result: ok. 429 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out; finished in 4.05s
clippy: 0
check-windows: 0
```

- [ ] **Step 4: Commit**

Run:
```bash
git add src-tauri/build.rs src-tauri/capabilities/main.json src-tauri/src/actions.rs src-tauri/src/app_tests.rs src-tauri/src/commands.rs src-tauri/src/errors.rs src-tauri/src/i18n.rs src-tauri/src/lib.rs src-tauri/src/state.rs src-tauri/src/tray.rs src-tauri/src/tray_menu.rs src-tauri/src/updater/mod.rs
git commit -q -m "feat(app): tự cập nhật: kiểm 1 phút sau khi mở rồi mỗi 24 giờ, đổi kênh thì kiểm ngay, tải nền; cài khi người dùng thoát (không khi tắt máy, đăng xuất) sau khi tắt tiến trình phụ và so lại SHA-256; khởi động lại để cập nhật khi app rảnh, ở menu khay và qua lệnh (§6.11, Q13)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(app): tự cập nhật: kiểm 1 phút sau khi mở rồi mỗi 24 giờ, đổi kênh thì kiểm ngay, tải nền; cài khi người dùng thoát (không khi tắt máy, đăng xuất) sau khi tắt tiến trình phụ và so lại SHA-256; khởi động lại để cập nhật khi app rảnh, ở menu khay và qua lệnh (§6.11, Q13)
```

## Task 4: Lời mời ở cửa sổ chính

Thanh báo của cửa sổ chính (`Notice`, có ở cả khung chính lẫn các bước lần đầu mở) mời khởi động lại khi có bản đã tải và app không đang bắt đầu hay đang dịch; "Để sau" ẩn lời mời của đúng bản đó trong lần chạy này (menu khay vẫn còn mục). Lỗi của lệnh (`updateBusy`, `updateNotReady`) hiện ở thanh báo lỗi như mọi lệnh khác.

**Files:**
- Modify: `src/lib/ipc.ts`, `src/store/app.ts`, `src/store/app.test.ts`, `src/windows/main/Notice.tsx`, `src/i18n/vi.ts`, `src/i18n/en.ts`, `src/lib/subtitleView.test.ts`, `src/store/overlay.test.ts`, `src/store/transcript.test.ts`

- [ ] **Step 1: Test trước**

Sửa `src/store/app.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.test.ts b/src/store/app.test.ts
index 5a832316d220425fe43394544dd5b4e7db8891a4..1c76d9488af487235dcada4f7de95e13f02a01ef 100644
--- a/src/store/app.test.ts
+++ b/src/store/app.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from "vitest";
 import { fakeIpc } from "../lib/fakeIpc";
 import type { AppInfo, AppStatus, Ipc, Settings } from "../lib/ipc";
-import { canOpenScreens, createAppStore, levelToMeter, toUiError } from "./app";
+import { canOpenScreens, createAppStore, levelToMeter, toUiError, updateInvite } from "./app";
 
 const settings: Settings = {
   uiLanguage: "vi",
@@ -45,6 +45,7 @@ const status: AppStatus = {
   pro: true,
   quotaWarning: false,
   quotaResetAt: null,
+  updateReady: null,
   rev: 1,
 };
 const info: AppInfo = {
@@ -59,11 +60,13 @@ const info: AppInfo = {
 let failToggle: "model" | "acl" | null = null;
 let failLoginItems = false;
 let failOnboarding = false;
+let failRestart = false;
 
 function setup() {
   failToggle = null;
   failLoginItems = false;
   failOnboarding = false;
+  failRestart = false;
   const fake = fakeIpc({
     get_settings: () => settings,
     get_app_status: () =>
@@ -91,6 +94,10 @@ function setup() {
     get_debug_sessions: () => [],
     open_audio_permission_settings: () => null,
     set_overlay_locked: ({ locked }) => ({ ...settings, overlay: { ...settings.overlay, locked } }),
+    restart_to_update: () => {
+      if (failRestart) throw { code: "updateBusy", field: null, message: "…" };
+      return null;
+    },
     open_login_items_settings: () => {
       if (failLoginItems) throw { code: "openFailed", field: null, message: "…" };
       return null;
@@ -452,4 +459,31 @@ describe("app store", () => {
     await store.getState().setSourceLanguage("ja", false);
     expect(fake.calls.length).toBe(before);
   });
+
+  it("mời cập nhật khi đã tải xong và app rảnh; Để sau ẩn đúng bản đó", () => {
+    const ready = { ...status, updateReady: "0.2.0" };
+    expect(updateInvite({ status, updateDismissed: null })).toBeNull();
+    expect(updateInvite({ status: null, updateDismissed: null })).toBeNull();
+    expect(updateInvite({ status: ready, updateDismissed: null })).toBe("0.2.0");
+    expect(updateInvite({ status: { ...ready, session: "error" }, updateDismissed: null })).toBe("0.2.0");
+    expect(updateInvite({ status: { ...ready, session: "running" }, updateDismissed: null })).toBeNull();
+    expect(updateInvite({ status: { ...ready, session: "starting" }, updateDismissed: null })).toBeNull();
+    expect(updateInvite({ status: ready, updateDismissed: "0.2.0" })).toBeNull();
+    expect(updateInvite({ status: { ...ready, updateReady: "0.2.1" }, updateDismissed: "0.2.0" })).toBe("0.2.1");
+  });
+
+  it("restartToUpdate gọi lệnh; lỗi hiện ở thanh báo lỗi; dismissUpdate nhớ bản đang mời", async () => {
+    const { fake, store } = setup();
+    await store.getState().init();
+    fake.emit("app://status", { ...status, updateReady: "0.2.0", rev: 5 });
+    await store.getState().restartToUpdate();
+    expect(fake.calls.at(-1)).toEqual({ cmd: "restart_to_update", args: undefined });
+    expect(store.getState().error).toBeNull();
+    failRestart = true;
+    await store.getState().restartToUpdate();
+    expect(store.getState().error?.code).toBe("updateBusy");
+    store.getState().dismissUpdate();
+    expect(store.getState().updateDismissed).toBe("0.2.0");
+    expect(updateInvite(store.getState())).toBeNull();
+  });
 });
```

Run: `pnpm test 2>&1 | grep -E 'Test Files|Tests |updateInvite is not|is not a function' | sort -u`

Expected (lúc lập kế hoạch: `updateInvite` chưa có):
```text
      Tests  2 failed | 128 passed (130)
 Test Files  1 failed | 14 passed (15)
TypeError: store.getState(...).restartToUpdate is not a function
TypeError: updateInvite is not a function
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
```

- [ ] **Step 2: Code**

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/ipc.ts b/src/lib/ipc.ts
index 877369c8d34761e03bdb819b94bcd769aeb6b433..52e8fcf172b038de374e377f5a19c079364c72f7 100644
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -104,6 +104,8 @@ export interface AppStatus {
   quotaWarning: boolean;
   // Thời điểm hạn mức được reset (giây Unix); `null` khi không giới hạn.
   quotaResetAt: number | null;
+  // Phiên bản app mới đã tải xong, cài ở lần thoát kế tiếp (kế hoạch 07b); `null` khi chưa có.
+  updateReady: string | null;
   // Tăng mỗi lần trạng thái đổi: trạng thái có `rev` nhỏ hơn trạng thái đang có là cũ, bỏ qua.
   rev: number;
 }
@@ -367,6 +369,7 @@ export interface Commands {
   cancel_checkout: { args: undefined; result: null };
   open_checkout_page: { args: undefined; result: null };
   recover_license: { args: { email: string }; result: null };
+  restart_to_update: { args: undefined; result: null };
   hide_overlay: { args: undefined; result: null };
   begin_overlay_resize: { args: { edge: ResizeEdge }; result: null };
   overlay_resize_move: { args: undefined; result: null };
```

Sửa `src/store/app.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.ts b/src/store/app.ts
index d42df4978f53c50bac114ed287674f97a1966d8f..2b5bc0cf44204101c717349429003531bacc9b1d 100644
--- a/src/store/app.ts
+++ b/src/store/app.ts
@@ -53,6 +53,8 @@ export interface AppStoreState {
   debugSessions: DebugSession[] | null;
   // Vừa xóa xong toàn bộ dữ liệu (Cài đặt › Quyền riêng tư), để báo lại.
   dataCleared: boolean;
+  // Phiên bản cập nhật mà người dùng đã bấm "Để sau" (chỉ trong lần chạy này; menu khay vẫn còn mục khởi động lại).
+  updateDismissed: string | null;
   init(): Promise<() => void>;
   navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;
   setOnboardingStep(step: number): void;
@@ -74,6 +76,9 @@ export interface AppStoreState {
   loadDebugSessions(): Promise<void>;
   dismissError(): void;
   dismissNotice(): void;
+  // Khởi động lại để cài bản cập nhật đã tải (kế hoạch 07b). Lỗi (đang dịch, đang tải model) hiện ở thanh báo lỗi.
+  restartToUpdate(): Promise<void>;
+  dismissUpdate(): void;
 }
 
 // Đã xong các bước lần đầu mở chưa. Chưa xong thì `App` chỉ hiện `Onboarding`, nên đổi `screen` không có
@@ -82,6 +87,15 @@ export function canOpenScreens(state: Pick<AppStoreState, "settings">): boolean
   return state.settings?.onboardingDone === true;
 }
 
+// Phiên bản để mời khởi động lại cập nhật (§6.11, Q13): có bản đã tải, app rảnh (không đang bắt đầu hay đang dịch), và
+// người dùng chưa bấm "Để sau" cho đúng bản đó. Đang dịch thì không mời; dừng dịch thì lời mời hiện lại.
+export function updateInvite(state: Pick<AppStoreState, "status" | "updateDismissed">): string | null {
+  const status = state.status;
+  if (!status?.updateReady) return null;
+  if (status.session === "starting" || status.session === "running") return null;
+  return state.updateDismissed === status.updateReady ? null : status.updateReady;
+}
+
 // Lỗi từ `invoke`: `CommandError` của app, hoặc chuỗi lỗi của Tauri (sai tham số, bị ACL chặn).
 export function toUiError(e: unknown): UiError {
   if (typeof e === "object" && e !== null && typeof (e as CommandError).code === "string") {
@@ -135,6 +149,7 @@ export function createAppStore(ipc: Ipc) {
       audioSources: null,
       debugSessions: null,
       dataCleared: false,
+      updateDismissed: null,
 
       // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
       async init() {
@@ -316,6 +331,17 @@ export function createAppStore(ipc: Ipc) {
       dismissNotice() {
         set({ notice: null });
       },
+
+      async restartToUpdate() {
+        await run(
+          () => ipc.invoke("restart_to_update"),
+          () => {},
+        );
+      },
+
+      dismissUpdate() {
+        set({ updateDismissed: get().status?.updateReady ?? null });
+      },
     };
   });
 }
```

Sửa `src/windows/main/Notice.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/Notice.tsx b/src/windows/main/Notice.tsx
index 8f432fdfe3bb265bedec1daef424fdc68d742279..79b814b5f3636d84b5118483d1abeee4af7778f1 100644
--- a/src/windows/main/Notice.tsx
+++ b/src/windows/main/Notice.tsx
@@ -1,11 +1,12 @@
 import { errorKey } from "../../i18n";
 import { licenseNotice } from "../../lib/license";
-import { canOpenScreens } from "../../store/app";
+import { canOpenScreens, updateInvite } from "../../store/app";
 import { useApp, useT } from "./appStore";
 import { useLicense } from "./licenseStore";
 
 // Thông báo trong app (Q13 của kế hoạch 00: MVP không dùng thông báo hệ thống): lời nhắc từ phía Rust
-// (vừa bỏ qua ⌘Q; mục Login Items đang bị tắt), lỗi của lệnh gần nhất, và phím tắt không đăng ký được.
+// (vừa bỏ qua ⌘Q; mục Login Items đang bị tắt), lời mời khởi động lại để cập nhật (kế hoạch 07b), lỗi của lệnh gần
+// nhất, và phím tắt không đăng ký được.
 // Đặt ở cả khung cửa sổ chính (`Shell`) lẫn các bước lần đầu mở (`Onboarding`). Trong các bước lần đầu
 // mở thì không có nút "Mở cài đặt" (`canOpenScreens`), vì chưa mở được màn hình Cài đặt.
 // Hai vùng live (`status` cho lời nhắc, `alert` cho lỗi) luôn có trong DOM, nội dung mới chèn vào sau, để trình đọc
@@ -25,9 +26,21 @@ export function Notice() {
   // hạn (7 ngày), bị thu hồi.
   const license = useLicense((s) => licenseNotice(s.view));
   const renewable = license === "license.notice.expired" || license === "license.notice.renewSoon";
+  const update = useApp(updateInvite);
+  const restartToUpdate = useApp((s) => s.restartToUpdate);
+  const dismissUpdate = useApp((s) => s.dismissUpdate);
   return (
     <>
       <div role="status">
+        {update && (
+          <div className="notice">
+            <span>{t("notice.updateReady", { version: update })}</span>
+            <button className="primary" onClick={() => void restartToUpdate()}>
+              {t("notice.restartToUpdate")}
+            </button>
+            <button onClick={dismissUpdate}>{t("notice.updateLater")}</button>
+          </div>
+        )}
         {notice?.kind === "quitFromTray" && (
           <div className="notice">
             <span>{t("notice.quitFromTray")}</span>
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 22ef5f70a0b7ce071329beaa9a6e46e7a172145b..1a21fd6a5789c359dea654f56262c9615388e4ba 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -291,6 +291,9 @@ export const vi: Record<MessageKey, string> = {
   "notice.quitFromTray": "AI Translator vẫn chạy ở menu bar. Muốn thoát, chọn Thoát ở biểu tượng trên menu bar.",
   "notice.loginItemsApproval": "AI Translator đang bị tắt ở System Settings › General › Login Items & Extensions (macOS 14: Login Items), nên sẽ không tự mở khi đăng nhập. Hãy bật lại ở đó.",
   "notice.openLoginItems": "Mở Login Items",
+  "notice.updateReady": "Bản {version} đã tải xong và sẽ được cài khi bạn thoát app. Khởi động lại ngay để cập nhật?",
+  "notice.restartToUpdate": "Khởi động lại",
+  "notice.updateLater": "Để sau",
 
   "plan.free": "Free",
   "plan.pro": "Professional",
@@ -420,4 +423,6 @@ export const vi: Record<MessageKey, string> = {
   "error.licenseConsentRequired": "Vui lòng đồng ý cho xử lý email để tiếp tục.",
   "error.licenseEmailInvalid": "Địa chỉ email không hợp lệ.",
   "error.unknown": "Có lỗi xảy ra.",
+  "error.updateNotReady": "Chưa có bản cập nhật nào tải xong.",
+  "error.updateBusy": "Đang dịch hay đang tải model. Dừng việc đó rồi khởi động lại để cập nhật.",
 };
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index c06b7e46d225383f97a02cdf3ee935b9a30bb1d2..d300a3246a8e30cccff831ad73e8d5cb17fce8c8 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -291,6 +291,9 @@ export const en = {
   "notice.quitFromTray": "AI Translator keeps running in the menu bar. To quit, choose Quit from the menu bar icon.",
   "notice.loginItemsApproval": "AI Translator is turned off in System Settings › General › Login Items & Extensions (Login Items on macOS 14), so it will not open when you log in. Turn it on there.",
   "notice.openLoginItems": "Open Login Items",
+  "notice.updateReady": "Version {version} has been downloaded and will be installed when you quit. Restart now to update?",
+  "notice.restartToUpdate": "Restart",
+  "notice.updateLater": "Later",
 
   "plan.free": "Free",
   "plan.pro": "Professional",
@@ -420,6 +423,8 @@ export const en = {
   "error.licenseConsentRequired": "Please agree to the processing of your email to continue.",
   "error.licenseEmailInvalid": "This email address is not valid.",
   "error.unknown": "Something went wrong.",
+  "error.updateNotReady": "No update has finished downloading yet.",
+  "error.updateBusy": "Translation or a model download is running. Stop it, then restart to update.",
 } as const;
 
 export type MessageKey = keyof typeof en;
```

Sửa `src/lib/subtitleView.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/subtitleView.test.ts b/src/lib/subtitleView.test.ts
index eccd900b948b0aa5574594af6ecf4a2b5e07679b..82f858c00753e87c5429d50f1607bc7bbf93e5c9 100644
--- a/src/lib/subtitleView.test.ts
+++ b/src/lib/subtitleView.test.ts
@@ -37,6 +37,7 @@ const status = (patch: Partial<AppStatus>): AppStatus => ({
   pro: true,
   quotaWarning: false,
   quotaResetAt: null,
+  updateReady: null,
   rev: 1,
   ...patch,
 });
```

Sửa `src/store/overlay.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/overlay.test.ts b/src/store/overlay.test.ts
index e8e258629720ee543689d5ed4dfcc22ef4ec5da5..fa36b452de7948cc19723719dcc05c1c18d1d673 100644
--- a/src/store/overlay.test.ts
+++ b/src/store/overlay.test.ts
@@ -110,6 +110,7 @@ const status = (session: AppStatus["session"], rev: number): AppStatus => ({
   pro: true,
   quotaWarning: false,
   quotaResetAt: null,
+  updateReady: null,
   rev,
 });
 
```

Sửa `src/store/transcript.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/transcript.test.ts b/src/store/transcript.test.ts
index 36781eb95cc6c2f98a8058ffc615ebb6b650edb9..b277bb59c32f8b9a3c30c75c756f7c107ccd9db5 100644
--- a/src/store/transcript.test.ts
+++ b/src/store/transcript.test.ts
@@ -29,6 +29,7 @@ const status = (session: AppStatus["session"], rev: number): AppStatus => ({
   pro: true,
   quotaWarning: false,
   quotaResetAt: null,
+  updateReady: null,
   rev,
 });
 
```

Run:
```bash
pnpm test 2>&1 | grep -E 'Test Files|Tests '
pnpm build >/dev/null 2>&1; echo "build: $?"
```

Expected (lúc lập kế hoạch):
```text
 Test Files  15 passed (15)
      Tests  130 passed (130)
build: 0
```

- [ ] **Step 3: Commit**

Run:
```bash
git add src/i18n/en.ts src/i18n/vi.ts src/lib/ipc.ts src/lib/subtitleView.test.ts src/store/app.test.ts src/store/app.ts src/store/overlay.test.ts src/store/transcript.test.ts src/windows/main/Notice.tsx
git commit -q -m "feat(ui): cửa sổ chính mời khởi động lại để cập nhật khi đã tải xong và app rảnh, có Để sau (§6.11, Q13)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(ui): cửa sổ chính mời khởi động lại để cập nhật khi đã tải xong và app rảnh, có Để sau (§6.11, Q13)
```

## Task 5: Windows: giá trị `Run` có dấu nháy

Việc 01 để lại (mục 2.7 của kế hoạch 00): `auto-launch` 0.6.0 ghi `C:\Users\…\AI Translator\meeting-translator.exe --autostart` không có dấu nháy, mà thư mục cài đặt per-user của NSIS có dấu cách. Sau `enable()`, app ghi lại giá trị có nháy, ở `HKLM` hay `HKCU` (chỗ nào plugin đã ghi), bằng crate `windows` sẵn có (QĐ17). Hàm thuần `quoted_run_value` có test trên mọi nền tảng; phần registry kiểm biên dịch bằng `check-windows.sh`, thử thật ở Task 14.

**Files:**
- Modify: `src-tauri/src/login_item.rs`

- [ ] **Step 1: Code và test**

Sửa `src-tauri/src/login_item.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/login_item.rs b/src-tauri/src/login_item.rs
index 231c8273968e351d571eee13bc2b86de17d1f47a..6625bb9e89ebc08629d3e8def101f62f90d1bee4 100644
--- a/src-tauri/src/login_item.rs
+++ b/src-tauri/src/login_item.rs
@@ -14,6 +14,8 @@
 //! `HKCU`, nên `is_enabled()` đã là trạng thái thật. `enable()` ghi `HKLM` trước (mọi người dùng), chỉ
 //! khi không có quyền mới ghi `HKCU`; `disable()` xóa cả hai, nhưng không có quyền admin thì mục ở
 //! `HKLM` còn nguyên. Vì vậy sau khi tắt, app hỏi lại và báo lỗi nếu vẫn còn bật.
+//! Giá trị mà `auto-launch` ghi không có dấu nháy quanh đường dẫn, mà thư mục cài đặt có dấu cách; sau khi bật, app ghi
+//! lại giá trị có nháy ([`quoted_run_value`], kế hoạch 07b).
 //!
 //! Việc bật/tắt và hỏi trạng thái đi qua trait `LoginItem`, để test dùng bản giả
 //! (`test_support::FakeLoginItem`) mà không đụng LaunchAgent, Login Items hay registry thật.
@@ -34,6 +36,16 @@ pub fn autostart_name<'a>(identifier: &'a str, product_name: &'a str) -> &'a str
     }
 }
 
+/// Windows: `auto-launch` ghi giá trị trong `Run` dạng `<đường dẫn exe> --autostart`, không có dấu nháy. Thư mục cài
+/// đặt của NSIS có dấu cách (`%LOCALAPPDATA%\AI Translator\`), nên Windows tách ở dấu cách đầu tiên và thử chạy
+/// `C:\Users\…\AI` trước (lỗi kiểu "unquoted path": ai đặt được file ở đó thì chạy được lúc đăng nhập). Trả giá trị
+/// có nháy khi `value` đúng là `<exe>` theo sau là hết chuỗi hay một dấu cách; `None` khi đã có nháy hay không phải
+/// đường dẫn của app.
+pub fn quoted_run_value(value: &str, exe: &str) -> Option<String> {
+    let rest = value.strip_prefix(exe)?;
+    (!exe.is_empty() && (rest.is_empty() || rest.starts_with(' '))).then(|| format!("\"{exe}\"{rest}"))
+}
+
 /// Đường dẫn LaunchAgent mà `auto-launch` (dùng bởi `tauri-plugin-autostart`) tạo cho app.
 pub fn launch_agent_path(home: &Path, app_name: &str) -> PathBuf {
     home.join("Library/LaunchAgents").join(format!("{app_name}.plist"))
@@ -110,7 +122,10 @@ struct Native<R: Runtime>(AppHandle<R>);
 
 impl<R: Runtime> LoginItem for Native<R> {
     fn enable(&self) -> Result<(), String> {
-        self.0.autolaunch().enable().map_err(|e| e.to_string())
+        self.0.autolaunch().enable().map_err(|e| e.to_string())?;
+        #[cfg(windows)]
+        quote_run_values(&self.0.package_info().name);
+        Ok(())
     }
 
     fn disable(&self) -> Result<(), String> {
@@ -128,6 +143,61 @@ impl<R: Runtime> LoginItem for Native<R> {
     }
 }
 
+/// Windows: ghi lại giá trị trong `Run` (cả `HKLM` lẫn `HKCU`, chỗ nào `auto-launch` đã ghi) với đường dẫn trong dấu
+/// nháy. Lỗi chỉ ghi log: mục khởi động vẫn chạy được như trước.
+#[cfg(windows)]
+fn quote_run_values(name: &str) {
+    use windows::Win32::System::Registry::{
+        HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, REG_SZ, RRF_RT_REG_SZ, RegGetValueW, RegSetKeyValueW,
+    };
+    use windows::core::{HSTRING, w};
+
+    let Ok(exe) = std::env::current_exe() else { return };
+    let exe = exe.display().to_string();
+    let key = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
+    let name = HSTRING::from(name);
+    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
+        let read = |root: HKEY| -> Option<String> {
+            let mut buf = vec![0u16; 4096];
+            let mut size = (buf.len() * 2) as u32;
+            // SAFETY: `buf` và `size` sống suốt lời gọi; `size` là số byte của `buf`.
+            let rc = unsafe {
+                RegGetValueW(
+                    root,
+                    key,
+                    &name,
+                    RRF_RT_REG_SZ,
+                    None,
+                    Some(buf.as_mut_ptr().cast()),
+                    Some(&mut size),
+                )
+            };
+            rc.is_ok().then(|| {
+                let chars = (size as usize / 2).saturating_sub(1);
+                String::from_utf16_lossy(&buf[..chars.min(buf.len())])
+            })
+        };
+        let Some(quoted) = read(root).and_then(|value| quoted_run_value(&value, &exe)) else {
+            continue;
+        };
+        let data: Vec<u16> = quoted.encode_utf16().chain(std::iter::once(0)).collect();
+        // SAFETY: `data` sống suốt lời gọi; số byte gồm cả ký tự kết thúc.
+        let rc = unsafe {
+            RegSetKeyValueW(
+                root,
+                key,
+                &name,
+                REG_SZ.0,
+                Some(data.as_ptr().cast()),
+                (data.len() * 2) as u32,
+            )
+        };
+        if rc.is_err() {
+            log::warn!("không ghi được giá trị Run có dấu nháy: {rc:?}");
+        }
+    }
+}
+
 /// Cài bản thật. Gọi một lần ở đầu `setup`.
 pub fn install<R: Runtime>(app: &AppHandle<R>) {
     app.manage(LoginItems(Box::new(Native(app.clone()))));
@@ -151,6 +221,28 @@ mod tests {
         }
     }
 
+    #[test]
+    fn run_values_get_quotes_around_the_app_path() {
+        let exe = r"C:\Users\An\AppData\Local\AI Translator\meeting-translator.exe";
+        assert_eq!(
+            quoted_run_value(&format!("{exe} --autostart"), exe).as_deref(),
+            Some(r#""C:\Users\An\AppData\Local\AI Translator\meeting-translator.exe" --autostart"#)
+        );
+        assert_eq!(quoted_run_value(exe, exe), Some(format!("\"{exe}\"")));
+        assert_eq!(
+            quoted_run_value(&format!("\"{exe}\" --autostart"), exe),
+            None,
+            "đã có nháy"
+        );
+        assert_eq!(
+            quoted_run_value(&format!("{exe}x --autostart"), exe),
+            None,
+            "exe khác cùng tiền tố"
+        );
+        assert_eq!(quoted_run_value(r"C:\Khac\app.exe --autostart", exe), None);
+        assert_eq!(quoted_run_value(" --autostart", ""), None);
+    }
+
     #[test]
     fn only_enabled_status_counts() {
         assert!(effective(true, Some(AgentStatus::Enabled)));
```

Run:
```bash
cargo test -p meeting-translator --lib -- login_item 2>&1 | grep -E '^test |^test result'
./scripts/check-windows.sh -q; echo "check-windows: $?"
```

Expected (lúc lập kế hoạch):
```text
test login_item::tests::system_reports_missing_agent ... ignored, hỏi dịch vụ Background Task Management của macOS
test login_item::tests::approval_is_needed_only_when_the_system_asks_for_it ... ok
test login_item::tests::from_raw_matches_sm_app_service_status ... ok
test login_item::tests::only_enabled_status_counts ... ok
test login_item::tests::launch_agent_is_named_after_the_bundle_identifier ... ok
test login_item::tests::run_values_get_quotes_around_the_app_path ... ok
test app_tests::startup_follows_the_system_when_login_items_turned_it_off ... ok
test app_tests::enabling_launch_at_login_blocked_in_login_items_shows_a_notice ... ok
test result: ok. 7 passed; 0 failed; 1 ignored; 0 measured; 425 filtered out; finished in 0.92s
check-windows: 0
```

- [ ] **Step 2: Commit**

Run:
```bash
git add src-tauri/src/login_item.rs
git commit -q -m "fix(app): Windows: giá trị khởi động cùng hệ thống trong Run có dấu nháy quanh đường dẫn (thư mục cài đặt có dấu cách)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
fix(app): Windows: giá trị khởi động cùng hệ thống trong Run có dấu nháy quanh đường dẫn (thư mục cài đặt có dấu cách)
```

## Task 6: Script manifest theo kênh, đăng bản, kiểm cấu hình production

- `update-manifest.mjs`: `latest.json` (dạng tĩnh của plugin, bốn khóa nền tảng) cho kênh stable và beta (QĐ8, QĐ12).
- `release-ready.mjs`: `--tag` kiểm tag khớp `version` của `tauri.conf.json` (kể cả bản beta, QĐ13); không `--tag` thì kiểm đủ bảy giá trị production.
- `publish-release.mjs`: đăng một bản lên R2 bằng wrangler của `server/`; `latest.json` của kênh ghi sau các file của bản, rồi dấu `<phiên bản>/published.json`; từ chối nếu đã có dấu đó hay kênh đã báo bản này (QĐ12); `--dry-run` không gọi mạng.

**Files:**
- Create: `scripts/release/update-manifest.test.mjs`, `scripts/release/update-manifest.mjs`, `scripts/release/release-ready.test.mjs`, `scripts/release/release-ready.mjs`, `scripts/release/publish-release.test.mjs`, `scripts/release/publish-release.mjs`

- [ ] **Step 1: Test trước**

Tạo `scripts/release/update-manifest.test.mjs`:

```js
// Test của update-manifest.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { artifactNames, channelsFor, compareVersions, main, parseVersion, releaseManifest } from "./update-manifest.mjs";
import { root } from "./versions.mjs";

const cmp = (a, b) => compareVersions(parseVersion(a), parseVersion(b));

test("phiên bản: chỉ X.Y.Z hay X.Y.Z-beta.N; bản beta nhỏ hơn bản stable cùng số", () => {
  assert.equal(parseVersion("1.2.3").beta, null);
  assert.equal(parseVersion("1.2.3-beta.4").beta, 4);
  for (const bad of ["1.2", "v1.2.3", "1.2.3-rc.1", "01.2.3", "1.2.3-beta", "1.2.3+build"]) assert.equal(parseVersion(bad), null, bad);
  assert.equal(cmp("0.2.0-beta.1", "0.2.0"), -1);
  assert.equal(cmp("0.2.0-beta.2", "0.2.0-beta.10"), -1);
  assert.equal(cmp("0.10.0", "0.9.9"), 1);
  assert.equal(cmp("0.2.0", "0.2.0"), 0);
});

test("bản stable vào stable, và vào beta khi mới hơn bản beta đang có; bản beta chỉ vào beta", () => {
  assert.deepEqual(channelsFor("0.2.0", { stable: null, beta: null }), ["stable", "beta"]);
  assert.deepEqual(channelsFor("0.2.0", { stable: "0.1.0", beta: "0.3.0-beta.1" }), ["stable"]);
  assert.deepEqual(channelsFor("0.3.0", { stable: "0.2.0", beta: "0.3.0-beta.1" }), ["stable", "beta"]);
  assert.deepEqual(channelsFor("0.3.0-beta.2", { stable: "0.2.0", beta: "0.3.0-beta.1" }), ["beta"]);
  assert.throws(() => channelsFor("0.2.0", { stable: "0.2.0", beta: null }), /stable đã có 0.2.0/);
  assert.throws(() => channelsFor("0.3.0-beta.1", { stable: null, beta: "0.3.0" }), /beta đã có 0.3.0/);
  assert.throws(() => channelsFor("0.3", { stable: null, beta: null }), /sai dạng/);
});

test("latest.json có bốn khóa nền tảng, URL theo phiên bản, chữ ký nguyên văn", () => {
  const names = artifactNames("AI Translator", "0.2.0");
  assert.deepEqual(names, { mac: "AI Translator.app.tar.gz", windows: "AI Translator_0.2.0_x64-setup.exe" });
  const m = releaseManifest({
    version: "0.2.0",
    baseUrl: "https://cdn.example/releases/",
    names,
    signatures: { mac: "SIG-MAC", windows: "SIG-WIN" },
    notes: "Sửa lỗi",
    pubDate: "2026-10-03T00:00:00Z",
  });
  assert.deepEqual(Object.keys(m.platforms), ["darwin-aarch64-app", "darwin-aarch64", "windows-x86_64-nsis", "windows-x86_64"]);
  assert.equal(m.platforms["darwin-aarch64-app"].url, "https://cdn.example/releases/0.2.0/AI%20Translator.app.tar.gz");
  assert.equal(m.platforms["windows-x86_64"].url, "https://cdn.example/releases/0.2.0/AI%20Translator_0.2.0_x64-setup.exe");
  assert.equal(m.platforms["windows-x86_64-nsis"].signature, "SIG-WIN");
  assert.equal(m.version, "0.2.0");
});

test("CLI: đọc file .sig, ghi latest.json của từng kênh; thiếu chữ ký hay URL không https thì lỗi", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "update-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ["AI Translator.app.tar.gz", "AI Translator_0.2.0_x64-setup.exe"]) {
    writeFileSync(join(dir, name), "x");
    writeFileSync(join(dir, `${name}.sig`), `sig of ${name}\n`);
  }
  const base = ["--version", "0.2.0", "--dir", dir, "--out", join(dir, "out"), "--pub-date", "2026-10-03T00:00:00Z"];
  assert.deepEqual(main([...base, "--base-url", "https://cdn.example/releases"]), ["stable", "beta"]);
  const stable = JSON.parse(readFileSync(join(dir, "out", "stable", "latest.json"), "utf8"));
  assert.equal(stable.platforms["darwin-aarch64"].signature, "sig of AI Translator.app.tar.gz");
  assert.deepEqual(stable, JSON.parse(readFileSync(join(dir, "out", "beta", "latest.json"), "utf8")));
  assert.throws(() => main([...base, "--base-url", "http://cdn.example/releases"]), /phải là https/);
  rmSync(join(dir, "AI Translator.app.tar.gz.sig"));
  assert.throws(() => main([...base, "--base-url", "https://cdn.example/releases"]), /thiếu chữ ký/);
});

test("sinh đúng từng byte file mẫu mà test của app cho plugin cập nhật thật đọc", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "update-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const testdata = join(root, "src-tauri/src/updater/testdata");
  for (const name of Object.values(artifactNames("AI Translator", "0.9.0"))) {
    copyFileSync(join(testdata, "update-0.9.0.bin"), join(dir, name));
    copyFileSync(join(testdata, "update-0.9.0.sig"), join(dir, `${name}.sig`));
  }
  writeFileSync(join(dir, "notes.md"), "Bản thử\n");
  main([
    ...["--version", "0.9.0", "--base-url", "https://releases.example.com/desktop", "--dir", dir],
    ...["--notes-file", join(dir, "notes.md"), "--pub-date", "2026-10-03T00:00:00Z", "--out", join(dir, "out")],
  ]);
  assert.equal(readFileSync(join(dir, "out", "stable", "latest.json"), "utf8"), readFileSync(join(testdata, "latest.json"), "utf8"));
});
```

Tạo `scripts/release/release-ready.test.mjs`:

```js
// Test của release-ready.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { isUpdaterKey, main, readinessErrors, rustProductionUrl, tagErrors } from "./release-ready.mjs";
import { root } from "./versions.mjs";

const TEST_PUBKEY = readFileSync(join(root, "src-tauri/src/updater/testdata/test.key.pub"), "utf8").trim();
const FILES = [
  "src-tauri/keys/updater-public-keys.json",
  "src-tauri/keys/manifest-public-keys.json",
  "src-tauri/keys/license-public-keys.json",
  "src-tauri/src/updater/source.rs",
  "src-tauri/src/models/source.rs",
  "src-tauri/src/license/client.rs",
  "src-tauri/src/navigation.rs",
  "src-tauri/tauri.conf.json",
];

/** Bản sao các file mà script đọc, từ repo thật (chưa có giá trị production nào). */
function copy(t) {
  const dir = mkdtempSync(join(tmpdir(), "release-ready-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const f of FILES) cpSync(join(root, f), join(dir, f));
  return dir;
}

function edit(dir, file, change) {
  const path = join(dir, file);
  writeFileSync(path, change(readFileSync(path, "utf8")));
}

const jwk = (kid) => ({ kid, x: "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg" });
const setUrl = (url) => (text) => text.replace(/^pub const PRODUCTION_URL: Option<&str> = None;/m, `pub const PRODUCTION_URL: Option<&str> = Some("${url}");`);

/** Điền đủ mọi giá trị production. */
function fill(dir) {
  edit(dir, "src-tauri/keys/updater-public-keys.json", (t) => JSON.stringify({ ...JSON.parse(t), production: TEST_PUBKEY }));
  edit(dir, "src-tauri/keys/manifest-public-keys.json", (t) => JSON.stringify({ ...JSON.parse(t), production: [jwk("prod-1")] }));
  edit(dir, "src-tauri/keys/license-public-keys.json", (t) =>
    JSON.stringify({ ...JSON.parse(t), production: { a: jwk("prod-2026-10-1"), b: jwk("prod-2026-10-2") } }),
  );
  edit(dir, "src-tauri/src/updater/source.rs", setUrl("https://releases.example.com/desktop"));
  edit(dir, "src-tauri/src/models/source.rs", setUrl("https://releases.example.com/models/models.json"));
  edit(dir, "src-tauri/src/license/client.rs", setUrl("https://api.example.com"));
  edit(dir, "src-tauri/src/navigation.rs", (t) => t.replace('    "pay.payos.vn",\n', '    "pay.payos.vn",\n    "example.com",\n'));
}

test("đọc PRODUCTION_URL của file Rust và khóa công khai của tauri signer", () => {
  assert.equal(rustProductionUrl('pub const PRODUCTION_URL: Option<&str> = Some("https://a.example");\n'), "https://a.example");
  assert.equal(rustProductionUrl("pub const PRODUCTION_URL: Option<&str> = None;\n"), null);
  assert.throws(() => rustProductionUrl("const X: u8 = 1;"), /không thấy/);
  assert.equal(isUpdaterKey(TEST_PUBKEY), true);
  assert.equal(isUpdaterKey(""), false);
  assert.equal(isUpdaterKey(Buffer.from("untrusted comment: x\nRWQ=").toString("base64")), false);
  assert.equal(isUpdaterKey(undefined), false);
});

test("repo hiện tại chưa đủ: báo đúng bảy giá trị còn thiếu", (t) => {
  const errors = readinessErrors(copy(t));
  assert.equal(errors.length, 7, errors.join("\n"));
  for (const part of ["updater-public-keys", "updater/source.rs", "models/source.rs", "manifest-public-keys", "license/client.rs", "license-public-keys", "EXTERNAL_HOSTS"]) {
    assert.ok(errors.some((e) => e.includes(part)), part);
  }
});

test("điền đủ thì qua; từng giá trị thiếu hay sai thì bị bắt", (t) => {
  const dir = copy(t);
  fill(dir);
  assert.deepEqual(readinessErrors(dir), []);
  assert.deepEqual(readinessErrors(dir, { baseUrl: "https://releases.example.com/desktop/" }), []);
  assert.match(readinessErrors(dir, { baseUrl: "https://other.example.com" })[0], /khác URL gốc build sẵn/);
  for (const [file, change, message] of [
    ["src-tauri/src/updater/source.rs", (s) => s.replace("https://releases", "http://releases"), /updater\/source.rs/],
    ["src-tauri/keys/license-public-keys.json", (s) => JSON.stringify({ ...JSON.parse(s), production: { a: jwk("p") } }), /hai ô a, b/],
    ["src-tauri/keys/manifest-public-keys.json", (s) => JSON.stringify({ ...JSON.parse(s), production: [{ ...jwk("p"), d: "bí mật" }] }), /manifest-public-keys/],
    ["src-tauri/keys/updater-public-keys.json", (s) => JSON.stringify({ ...JSON.parse(s), production: "abc" }), /updater-public-keys/],
  ]) {
    const one = copy(t);
    fill(one);
    edit(one, file, change);
    const errors = readinessErrors(one);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], message);
  }
});

test("--tag: tag phải đúng v<version> của tauri.conf.json, kể cả bản beta", (t) => {
  assert.deepEqual(tagErrors("v0.2.0", "0.2.0"), []);
  assert.deepEqual(tagErrors("v0.2.0-beta.1", "0.2.0-beta.1"), []);
  assert.deepEqual(tagErrors("v0.2.0-beta.1", "0.2.0"), ["tag v0.2.0-beta.1 không khớp version 0.2.0 trong tauri.conf.json"]);
  assert.match(tagErrors("v0.2.0-rc.1", "0.2.0-rc.1")[0], /chỉ nhận X.Y.Z hay X.Y.Z-beta.N/);
  const dir = copy(t);
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  main(["--tag", "v0.1.0"], dir);
  assert.deepEqual(lines, ["tag v0.1.0 khớp tauri.conf.json"]);
  assert.throws(() => main(["--tag", "v0.1.1"], dir), /không khớp/);
  assert.throws(() => main([], dir), /chưa có khóa production/);
});
```

Tạo `scripts/release/publish-release.test.mjs`:

```js
// Test của publish-release.mjs: `node --test "scripts/release/*.test.mjs"`. Chỉ chạy `--dry-run`: không gọi mạng.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { contentType, main, uploadPlan } from "./publish-release.mjs";

test("file của bản tải lên trước, rồi manifest của kênh, cuối cùng dấu đã đăng của bản", () => {
  const plan = uploadPlan({
    bucket: "b",
    version: "0.2.0",
    files: ["AI Translator.app.tar.gz", "AI Translator.app.tar.gz.sig", "SHA256SUMS-macos.txt"],
    channels: ["stable", "beta"],
  });
  assert.deepEqual(
    plan.map((s) => s.key),
    [
      "b/0.2.0/AI Translator.app.tar.gz",
      "b/0.2.0/AI Translator.app.tar.gz.sig",
      "b/0.2.0/SHA256SUMS-macos.txt",
      "b/stable/latest.json",
      "b/beta/latest.json",
      "b/0.2.0/published.json",
    ],
  );
  assert.equal(plan.at(-1).type, "application/json");
  assert.equal(plan.at(-1).file, "manifests/published.json");
  assert.equal(contentType("x.exe"), "application/vnd.microsoft.portable-executable");
  assert.equal(contentType("x.tar.gz"), "application/gzip");
  assert.equal(contentType("x.dmg"), "application/x-apple-diskimage");
  assert.equal(contentType("x.bin"), "application/octet-stream");
});

/** Repo giả chỉ có tauri.conf.json với `version`, và thư mục artifact `release` như job update-signatures tạo. */
function fixture(t, version) {
  const dir = mkdtempSync(join(tmpdir(), "publish-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "src-tauri"), { recursive: true });
  writeFileSync(join(repo, "src-tauri/tauri.conf.json"), JSON.stringify({ productName: "AI Translator", version }));
  const out = join(dir, "release");
  mkdirSync(out);
  for (const name of ["AI Translator.app.tar.gz", `AI Translator_${version}_x64-setup.exe`]) {
    writeFileSync(join(out, name), "x");
    writeFileSync(join(out, `${name}.sig`), `sig ${name}`);
  }
  writeFileSync(join(out, `AI Translator_${version}_aarch64.dmg`), "dmg");
  return { repo, out };
}

test("--dry-run: in lệnh wrangler theo đúng thứ tự, manifest trỏ tới đúng URL, không gọi mạng", async (t) => {
  const { repo, out } = fixture(t, "0.1.0-beta.1");
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  const args = ["--tag", "v0.1.0-beta.1", "--dir", out, "--bucket", "rel", "--base-url", "https://cdn.example/r/", "--dry-run"];
  assert.deepEqual(await main(args, { repo }), { version: "0.1.0-beta.1", channels: ["beta"] });
  const keys = lines.filter((l) => l.startsWith("(dry-run)")).map((l) => l.split(" put ")[1].split(" --file")[0]);
  assert.deepEqual(keys, [
    "rel/0.1.0-beta.1/AI Translator.app.tar.gz",
    "rel/0.1.0-beta.1/AI Translator.app.tar.gz.sig",
    "rel/0.1.0-beta.1/AI Translator_0.1.0-beta.1_aarch64.dmg",
    "rel/0.1.0-beta.1/AI Translator_0.1.0-beta.1_x64-setup.exe",
    "rel/0.1.0-beta.1/AI Translator_0.1.0-beta.1_x64-setup.exe.sig",
    "rel/beta/latest.json",
    "rel/0.1.0-beta.1/published.json",
  ]);
  assert.match(lines.at(-1), / --cache-control no-cache$/);
  const beta = JSON.parse(readFileSync(join(out, "manifests", "beta", "latest.json"), "utf8"));
  assert.equal(beta.platforms["windows-x86_64"].url, "https://cdn.example/r/0.1.0-beta.1/AI%20Translator_0.1.0-beta.1_x64-setup.exe");
  assert.equal(beta.platforms["darwin-aarch64"].signature, "sig AI Translator.app.tar.gz");
});

test("tag lệch tauri.conf.json, thiếu tham số hay URL không https thì không đăng gì", async (t) => {
  const { repo, out } = fixture(t, "0.1.0");
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  const base = ["--dir", out, "--bucket", "rel", "--dry-run"];
  await assert.rejects(main(["--tag", "v0.1.1", ...base, "--base-url", "https://x"], { repo }), /tag v0.1.1 không khớp version 0.1.0/);
  await assert.rejects(main(["--tag", "v0.1.0", ...base, "--base-url", "http://x"], { repo }), /phải là https/);
  // Kiểm https trước mọi việc khác, kể cả đọc tauri.conf.json (repo trống ở đây).
  await assert.rejects(main(["--tag", "v0.1.0", ...base, "--base-url", "http://x"], { repo: out }), /--base-url phải là https/);
  await assert.rejects(main(["--tag", "v0.1.0", "--dir", out], { repo }), /cần --tag, --dir, --bucket, --base-url/);
  assert.deepEqual(lines, []);
});

/** `fetch` giả: `latest.json` của từng kênh (null là 404), và các bản đã có dấu `published.json`; ghi lại URL đã hỏi. */
function fakeFetch(versions, asked = [], published = []) {
  return async (url) => {
    asked.push(url);
    const marker = /\/([^/]+)\/published\.json$/.exec(url)?.[1];
    if (marker) return published.includes(marker) ? { status: 200, ok: true } : { status: 404, ok: false };
    const channel = /\/(stable|beta)\/latest\.json$/.exec(url)?.[1];
    const version = channel ? versions[channel] : null;
    if (!version) return { status: 404, ok: false };
    return { status: 200, ok: true, json: async () => ({ version }) };
  };
}

test("bản đã có trong latest.json của kênh thì không đăng lại; lần đăng đứt giữa chừng thì đăng lại được", async (t) => {
  const { repo, out } = fixture(t, "0.2.0");
  t.mock.method(console, "log", () => {});
  const base = ["--tag", "v0.2.0", "--dir", out, "--bucket", "rel", "--base-url", "https://cdn.example/r"];
  const runs = [];
  const run = (cmd) => runs.push(cmd[7]);
  await assert.rejects(main(base, { repo, fetch: fakeFetch({ stable: "0.2.0", beta: "0.2.0" }), run }), /0.2.0 đã được đăng/);
  await assert.rejects(main(base, { repo, fetch: fakeFetch({ stable: null, beta: "0.2.0" }), run }), /đã được đăng/);
  assert.deepEqual(runs, [], "không tải gì");
  // Lần trước tải được một phần file nhưng chưa ghi latest.json: kênh vẫn báo 0.1.0, nên đăng lại đủ.
  const asked = [];
  assert.deepEqual(await main(base, { repo, fetch: fakeFetch({ stable: "0.1.0", beta: "0.1.0" }, asked), run }), {
    version: "0.2.0",
    channels: ["stable", "beta"],
  });
  assert.deepEqual(asked, [
    "https://cdn.example/r/0.2.0/published.json",
    "https://cdn.example/r/stable/latest.json",
    "https://cdn.example/r/beta/latest.json",
  ]);
  assert.equal(runs.length, 8);
  assert.deepEqual(runs.slice(-3), ["rel/stable/latest.json", "rel/beta/latest.json", "rel/0.2.0/published.json"]);
  const marker = JSON.parse(readFileSync(join(out, "manifests", "published.json"), "utf8"));
  assert.deepEqual(marker, { version: "0.2.0", tag: "v0.2.0", channels: ["stable", "beta"] });
});

test("bản đã rút (latest.json về bản trước) vẫn không đăng lại được: dấu published.json còn đó (Q-A của review 07b lần 2)", async (t) => {
  const { repo, out } = fixture(t, "0.3.0");
  t.mock.method(console, "log", () => {});
  const base = ["--tag", "v0.3.0", "--dir", out, "--bucket", "rel", "--base-url", "https://cdn.example/r"];
  const runs = [];
  const fetch = fakeFetch({ stable: "0.2.0", beta: "0.2.0" }, [], ["0.3.0"]);
  await assert.rejects(main(base, { repo, fetch, run: (cmd) => runs.push(cmd[7]) }), /0.3.0 đã được đăng.*published\.json/);
  assert.deepEqual(runs, [], "không tải gì");
});
```

Run:
```bash
node --test "scripts/release/*.test.mjs" 2>&1 | grep -E 'ERR_MODULE_NOT_FOUND\]|^ℹ (tests|pass|fail)' | sed -E 's/imported from .*//'
```

Expected (lúc lập kế hoạch: chưa có module):
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/publish-release.mjs' 
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/release-ready.mjs' 
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/dtphong/Desktop/software_business/meeting-translator/scripts/release/update-manifest.mjs' 
ℹ tests 44
ℹ pass 41
ℹ fail 3
```

- [ ] **Step 2: Code**

Tạo `scripts/release/update-manifest.mjs`:

```js
#!/usr/bin/env node
// Manifest cập nhật của tauri-plugin-updater (`latest.json`, dạng tĩnh) cho kênh stable và beta (spec §6.11; kế hoạch 07b).
//
//   node scripts/release/update-manifest.mjs --version <X.Y.Z[-beta.N]> --base-url <https://…/releases> \
//     --dir <thư mục có bộ cài và file .sig> [--notes-file <file>] [--pub-date <ISO 8601>] \
//     [--stable <latest.json hiện tại của stable>] [--beta <latest.json hiện tại của beta>] --out <thư mục ra>
//
// Bộ cài của mỗi bản nằm ở `<base-url>/<version>/<tên file>` (không bao giờ ghi đè), manifest của kênh ở
// `<base-url>/<stable|beta>/latest.json`. Bản có phần pre-release (`-beta.N`) chỉ vào kênh beta; bản stable vào kênh
// stable, và vào cả kênh beta khi nó mới hơn bản beta đang có (người ở kênh beta không bị kẹt ở bản beta cũ hơn).
// Chữ ký lấy nguyên văn từ file `.sig` do `tauri signer sign --app-version` sinh (đã gắn phiên bản, requireSignedVersion).
// Test của app (`src-tauri/src/updater/backend.rs`) cho plugin thật đọc đúng file mà script này sinh
// (`src-tauri/src/updater/testdata/latest.json`); test của script so lại với file đó.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Phiên bản semver X.Y.Z hay X.Y.Z-beta.N; trả null khi sai dạng. */
export function parseVersion(text) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.exec(text);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], beta: m[4] === undefined ? null : +m[4], text };
}

/** So hai phiên bản theo semver (bản beta nhỏ hơn bản stable cùng số). */
export function compareVersions(a, b) {
  for (const k of ["major", "minor", "patch"]) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (a.beta === b.beta) return 0;
  if (a.beta === null) return 1;
  if (b.beta === null) return -1;
  return a.beta < b.beta ? -1 : 1;
}

/** Tên bộ cài trên từng nền tảng, theo đúng tên mà package-macos.sh và package-windows.mjs tạo. */
export function artifactNames(product, version) {
  return {
    mac: `${product}.app.tar.gz`,
    windows: `${product}_${version}_x64-setup.exe`,
  };
}

/** `latest.json` của một bản: khóa nền tảng cả dạng có loại bộ cài lẫn dạng chung (updater thử theo thứ tự đó). */
export function releaseManifest({ version, baseUrl, names, signatures, notes, pubDate }) {
  const url = (name) => `${baseUrl.replace(/\/+$/, "")}/${version}/${encodeURIComponent(name)}`;
  const mac = { url: url(names.mac), signature: signatures.mac };
  const windows = { url: url(names.windows), signature: signatures.windows };
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      "darwin-aarch64-app": mac,
      "darwin-aarch64": mac,
      "windows-x86_64-nsis": windows,
      "windows-x86_64": windows,
    },
  };
}

/** Kênh nào nhận bản `version`, biết phiên bản hiện có của hai kênh (null khi kênh chưa có bản nào). */
export function channelsFor(version, current) {
  const v = parseVersion(version);
  if (!v) throw new Error(`phiên bản sai dạng: ${version}`);
  const newer = (channel) => current[channel] === null || compareVersions(v, parseVersion(current[channel])) > 0;
  const out = [];
  if (v.beta === null) {
    if (!newer("stable")) throw new Error(`kênh stable đã có ${current.stable}, không nhỏ hơn ${version}`);
    out.push("stable");
    if (newer("beta")) out.push("beta");
  } else {
    if (!newer("beta")) throw new Error(`kênh beta đã có ${current.beta}, không nhỏ hơn ${version}`);
    out.push("beta");
  }
  return out;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function currentVersion(path) {
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8")).version;
}

export function main(argv) {
  const version = option(argv, "--version");
  const baseUrl = option(argv, "--base-url");
  const dir = option(argv, "--dir");
  const out = option(argv, "--out");
  if (!version || !baseUrl || !dir || !out) throw new Error("cần --version, --base-url, --dir, --out");
  if (!parseVersion(version)) throw new Error(`phiên bản sai dạng: ${version}`);
  if (!baseUrl.startsWith("https://")) throw new Error("--base-url phải là https");
  const product = option(argv, "--product") ?? "AI Translator";
  const names = artifactNames(product, version);
  const signatures = {};
  for (const [platform, name] of Object.entries(names)) {
    const file = join(dir, name);
    if (!existsSync(file)) throw new Error(`thiếu ${file}`);
    if (!existsSync(`${file}.sig`)) throw new Error(`thiếu chữ ký ${file}.sig`);
    signatures[platform] = readFileSync(`${file}.sig`, "utf8").trim();
  }
  const notesFile = option(argv, "--notes-file");
  const notes = notesFile ? readFileSync(notesFile, "utf8").trim() : "";
  const pubDate = option(argv, "--pub-date") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const channels = channelsFor(version, {
    stable: currentVersion(option(argv, "--stable")),
    beta: currentVersion(option(argv, "--beta")),
  });
  const manifest = releaseManifest({ version, baseUrl, names, signatures, notes, pubDate });
  for (const channel of channels) {
    mkdirSync(join(out, channel), { recursive: true });
    writeFileSync(join(out, channel, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`${version}: ${channels.join(", ")}`);
  return channels;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Tạo `scripts/release/release-ready.mjs`:

```js
#!/usr/bin/env node
// Kiểm một bản phát hành có đủ cấu hình production trước khi đăng (kế hoạch 07b; spec §6.7, §6.8, §6.11, §10.2).
//
//   node scripts/release/release-ready.mjs --tag <vX.Y.Z[-beta.N]>   chỉ kiểm tag khớp version trong tauri.conf.json
//   node scripts/release/release-ready.mjs [--base-url <URL gốc>]    kiểm đủ (job `publish` của release.yml)
//
// Bản phát hành chỉ dùng giá trị production: thiếu một trong các giá trị dưới đây thì app vẫn chạy, nhưng tắt tự cập
// nhật, không tải được model, hay chỉ có gói Free. Vì vậy không đăng bản nào khi còn thiếu. `--base-url` (biến
// RELEASES_BASE_URL của repo) phải đúng URL gốc build sẵn trong app, không thì app hỏi nhầm chỗ.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseVersion } from "./update-manifest.mjs";
import { root as repoRoot } from "./versions.mjs";

/** Giá trị của `pub const PRODUCTION_URL: Option<&str> = Some("…");` trong một file Rust; `null` khi là `None`. */
export function rustProductionUrl(text) {
  const m = /^pub const PRODUCTION_URL: Option<&str> = (None|Some\("([^"]*)"\));/m.exec(text);
  if (!m) throw new Error("không thấy dòng `pub const PRODUCTION_URL`");
  return m[2] ?? null;
}

/** Khóa công khai của `tauri signer generate`: base64 của `untrusted comment: …` và khóa minisign Ed25519 (42 byte). */
export function isUpdaterKey(text) {
  if (typeof text !== "string" || text.trim() === "") return false;
  const lines = Buffer.from(text.trim(), "base64").toString("utf8").split("\n").filter((l) => l.trim() !== "");
  if (lines.length !== 2 || !lines[0].startsWith("untrusted comment:")) return false;
  const raw = Buffer.from(lines[1].trim(), "base64");
  return raw.length === 42 && raw.subarray(0, 2).toString() === "Ed";
}

const isJwk = (k) => typeof k?.kid === "string" && k.kid !== "" && typeof k?.x === "string" && k.x !== "" && !("d" in k);

/** Tag phải là `v<version>` với version đúng như trong tauri.conf.json (bản beta cũng vậy: app so phiên bản của nó). */
export function tagErrors(tag, confVersion) {
  if (!parseVersion(confVersion)) return [`tauri.conf.json có version ${confVersion}: chỉ nhận X.Y.Z hay X.Y.Z-beta.N`];
  return tag === `v${confVersion}` ? [] : [`tag ${tag} không khớp version ${confVersion} trong tauri.conf.json`];
}

/** Các giá trị production còn thiếu; rỗng là đủ. */
export function readinessErrors(root, { baseUrl } = {}) {
  const errors = [];
  const read = (path) => readFileSync(join(root, path), "utf8");
  const https = (url) => typeof url === "string" && url.startsWith("https://");
  const url = (path, what) => {
    const value = rustProductionUrl(read(path));
    if (!https(value)) errors.push(`${path}: PRODUCTION_URL chưa có (${what})`);
    return value;
  };
  const updaterKeys = JSON.parse(read("src-tauri/keys/updater-public-keys.json"));
  if (!isUpdaterKey(updaterKeys.production)) {
    errors.push("src-tauri/keys/updater-public-keys.json: chưa có khóa production (Task 11 của 07b)");
  }
  const updaterUrl = url("src-tauri/src/updater/source.rs", "URL gốc bản cập nhật, Task 12 của 07b");
  if (baseUrl !== undefined && https(updaterUrl) && updaterUrl.replace(/\/+$/, "") !== baseUrl.replace(/\/+$/, "")) {
    errors.push(`RELEASES_BASE_URL ${baseUrl} khác URL gốc build sẵn trong app ${updaterUrl}`);
  }
  url("src-tauri/src/models/source.rs", "manifest model, Task 12 của 07b");
  const manifestKeys = JSON.parse(read("src-tauri/keys/manifest-public-keys.json")).production;
  if (!Array.isArray(manifestKeys) || manifestKeys.length === 0 || !manifestKeys.every(isJwk)) {
    errors.push("src-tauri/keys/manifest-public-keys.json: chưa có khóa production (Task 11 của 07b)");
  }
  url("src-tauri/src/license/client.rs", "license server, kế hoạch 05 Task 21");
  const licenseKeys = JSON.parse(read("src-tauri/keys/license-public-keys.json")).production ?? {};
  if (!isJwk(licenseKeys.a) || !isJwk(licenseKeys.b)) {
    errors.push("src-tauri/keys/license-public-keys.json: production chưa đủ hai ô a, b (kế hoạch 05 Task 21)");
  }
  const hosts = /pub const EXTERNAL_HOSTS: &\[&str\] = &\[([\s\S]*?)\];/.exec(read("src-tauri/src/navigation.rs"));
  const names = [...(hosts?.[1] ?? "").matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
  if (!names.some((h) => h !== "pay.payos.vn")) {
    errors.push("src-tauri/src/navigation.rs: EXTERNAL_HOSTS chưa có tên miền website (T7, Task 12 của 07b)");
  }
  return errors;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function main(argv, root = repoRoot) {
  const tag = option(argv, "--tag");
  const errors = tag
    ? tagErrors(tag, JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version)
    : readinessErrors(root, { baseUrl: option(argv, "--base-url") });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(tag ? `tag ${tag} khớp tauri.conf.json` : "đủ cấu hình production");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`LỖI: ${error.message.split("\n").join("\nLỖI: ")}`);
    process.exitCode = 1;
  }
}
```

Tạo `scripts/release/publish-release.mjs`:

```js
#!/usr/bin/env node
// Đăng một bản phát hành lên R2, CDN của bản cập nhật (spec §6.11; kế hoạch 07b). Chạy ở job `publish` của release.yml,
// sau khi các job build và ký xong, người duyệt environment `release`, và release-ready.mjs báo đủ cấu hình production.
//
//   node scripts/release/publish-release.mjs --tag <vX.Y.Z[-beta.N]> --dir <artifact `release` đã tải về> \
//     --bucket <tên bucket R2> --base-url <https://…> [--notes-file <file>] [--dry-run]
//
// Thứ tự: kiểm tag khớp version trong tauri.conf.json; đọc `latest.json` hiện có của hai kênh qua URL công khai; từ chối
// nếu một kênh đã báo bản này (đã phát hành thì không bao giờ ghi đè); tải mọi file của bản lên `<version>/`; sinh
// `latest.json` (update-manifest.mjs) rồi mới tải lên `<kênh>/latest.json`, để app không bao giờ thấy manifest trỏ tới file
// chưa có. Sau cùng ghi dấu bền `<version>/published.json`. Bản coi là đã đăng khi có dấu đó hay `latest.json` của một kênh
// đã báo nó: kể cả sau khi bản bị rút (`latest.json` về bản trước, dấu vẫn còn), chạy lại job cũng không đăng lại hay ghi
// đè file của nó (Q-A của review 07b lần 2). Lần chạy trước đứt trước khi ghi `latest.json` thì chưa có dấu: chạy lại job,
// các file của bản được tải lại. Lệnh tải là wrangler của `server/` (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID từ secret của environment).
// `--dry-run` không gọi mạng, chỉ in các lệnh (coi như hai kênh chưa có bản nào).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { tagErrors } from "./release-ready.mjs";
import { channelsFor, main as writeManifests } from "./update-manifest.mjs";
import { root } from "./versions.mjs";

const TYPES = {
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".sig": "text/plain; charset=utf-8",
  ".gz": "application/gzip",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dmg": "application/x-apple-diskimage",
};

export function contentType(name) {
  const ext = Object.keys(TYPES).find((e) => name.endsWith(e));
  return ext ? TYPES[ext] : "application/octet-stream";
}

/** Các lần tải lên, theo thứ tự: file của bản trước, manifest của kênh sau cùng. */
export function uploadPlan({ bucket, version, files, channels }) {
  const steps = files.map((name) => ({ key: `${bucket}/${version}/${name}`, file: name, type: contentType(name) }));
  for (const channel of channels) {
    steps.push({ key: `${bucket}/${channel}/latest.json`, file: join("manifests", channel, "latest.json"), type: "application/json" });
  }
  steps.push({ key: `${bucket}/${version}/published.json`, file: join("manifests", "published.json"), type: "application/json" });
  return steps;
}

/** Bản đã có dấu `<version>/published.json` trên CDN chưa. */
async function hasMarker(fetch, baseUrl, version) {
  const res = await fetch(`${trim(baseUrl)}/${version}/published.json`, {
    headers: { "User-Agent": "ai-translator-release", "Cache-Control": "no-cache" },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`${version}/published.json: HTTP ${res.status}`);
  return true;
}

const trim = (url) => url.replace(/\/+$/, "");

async function currentVersion(fetch, baseUrl, channel) {
  const res = await fetch(`${trim(baseUrl)}/${channel}/latest.json`, {
    headers: { "User-Agent": "ai-translator-release", "Cache-Control": "no-cache" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${channel}/latest.json: HTTP ${res.status}`);
  return (await res.json()).version;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function wrangler(cmd, repo) {
  execFileSync("pnpm", cmd, { cwd: repo, stdio: "inherit", shell: process.platform === "win32" });
}

/** `fetch` và `run` (chạy một lệnh `pnpm`) thay được, để test nhánh có mạng. */
export async function main(argv, { repo = root, fetch = globalThis.fetch, run = wrangler } = {}) {
  const tag = option(argv, "--tag");
  const dir = option(argv, "--dir");
  const bucket = option(argv, "--bucket");
  const baseUrl = option(argv, "--base-url");
  const dryRun = argv.includes("--dry-run");
  if (!tag || !dir || !bucket || !baseUrl) throw new Error("cần --tag, --dir, --bucket, --base-url");
  if (!baseUrl.startsWith("https://")) throw new Error("--base-url phải là https");
  const conf = JSON.parse(readFileSync(join(repo, "src-tauri/tauri.conf.json"), "utf8"));
  const errors = tagErrors(tag, conf.version);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const version = conf.version;

  if (!dryRun && (await hasMarker(fetch, baseUrl, version))) {
    throw new Error(`${version} đã được đăng (có ${version}/published.json); không đăng lại hay ghi đè một bản đã phát hành`);
  }
  const current = {
    stable: dryRun ? null : await currentVersion(fetch, baseUrl, "stable"),
    beta: dryRun ? null : await currentVersion(fetch, baseUrl, "beta"),
  };
  if (current.stable === version || current.beta === version) {
    throw new Error(`${version} đã được đăng (latest.json của kênh đã báo bản này); không ghi đè một bản đã phát hành`);
  }
  const channels = channelsFor(version, current);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
  const args = ["--version", version, "--product", conf.productName, "--base-url", baseUrl, "--dir", dir];
  args.push("--out", join(dir, "manifests"));
  const notes = option(argv, "--notes-file");
  if (notes) args.push("--notes-file", notes);
  mkdirSync(join(dir, "manifests"), { recursive: true });
  for (const channel of ["stable", "beta"]) {
    if (current[channel] !== null) {
      const path = join(dir, "manifests", `current-${channel}.json`);
      writeFileSync(path, JSON.stringify({ version: current[channel] }));
      args.push(`--${channel}`, path);
    }
  }
  writeManifests(args);
  writeFileSync(join(dir, "manifests", "published.json"), `${JSON.stringify({ version, tag, channels })}\n`);

  for (const step of uploadPlan({ bucket, version, files, channels })) {
    const cmd = ["-C", "server", "exec", "wrangler", "r2", "object", "put", step.key, "--file", join(dir, step.file)];
    cmd.push("--content-type", step.type, "--remote");
    if (step.key.endsWith(".json") && step.file.startsWith("manifests")) cmd.push("--cache-control", "no-cache");
    console.log(`${dryRun ? "(dry-run) " : ""}pnpm ${cmd.join(" ")}`);
    if (!dryRun) run(cmd, repo);
  }
  return { version, channels };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    ({ version, channels }) => console.log(`đã đăng ${version} lên kênh ${channels.join(", ")}`),
    (error) => {
      console.error(`LỖI: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
```

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | grep -E '^ℹ (tests|pass|fail)'`

Expected (lúc lập kế hoạch):
```text
ℹ tests 55
ℹ pass 55
ℹ fail 0
```

- [ ] **Step 3: Repo hiện tại chưa đủ cấu hình production** (Task 11, 12 điền)

Run:
```bash
node scripts/release/release-ready.mjs; echo "exit=$?"
node scripts/release/release-ready.mjs --tag v0.1.0
```

Expected (lúc lập kế hoạch):
```text
LỖI: src-tauri/keys/updater-public-keys.json: chưa có khóa production (Task 11 của 07b)
LỖI: src-tauri/src/updater/source.rs: PRODUCTION_URL chưa có (URL gốc bản cập nhật, Task 12 của 07b)
LỖI: src-tauri/src/models/source.rs: PRODUCTION_URL chưa có (manifest model, Task 12 của 07b)
LỖI: src-tauri/keys/manifest-public-keys.json: chưa có khóa production (Task 11 của 07b)
LỖI: src-tauri/src/license/client.rs: PRODUCTION_URL chưa có (license server, kế hoạch 05 Task 21)
LỖI: src-tauri/keys/license-public-keys.json: production chưa đủ hai ô a, b (kế hoạch 05 Task 21)
LỖI: src-tauri/src/navigation.rs: EXTERNAL_HOSTS chưa có tên miền website (T7, Task 12 của 07b)
exit=1
tag v0.1.0 khớp tauri.conf.json
```

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/release/update-manifest.mjs scripts/release/update-manifest.test.mjs scripts/release/release-ready.mjs scripts/release/release-ready.test.mjs scripts/release/publish-release.mjs scripts/release/publish-release.test.mjs
git commit -q -m "feat(release): manifest cập nhật theo kênh stable/beta, đăng bản lên R2 không ghi đè bản cũ, kiểm đủ cấu hình production trước khi đăng (§6.11, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
feat(release): manifest cập nhật theo kênh stable/beta, đăng bản lên R2 không ghi đè bản cũ, kiểm đủ cấu hình production trước khi đăng (§6.11, §10.2)
```

## Task 7: Job `publish` và `github-release`

`release.yml` của 07a thêm:
- bước đầu của hai job tiến trình phụ: tag khớp `version` (chỉ khi chạy từ tag), để tag sai dừng trước khi build gần một giờ;
- job `publish` (environment `release`, chỉ từ tag `v*`): nhận artifact `release` qua `take-artifact.mjs` (luật `release` của 07a: bộ cài, chữ ký `.sig`, SHA-256; 07a QĐ29), kiểm đủ cấu hình production, rồi `publish-release.mjs`. Secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; biến `RELEASES_BUCKET`, `RELEASES_BASE_URL`. Không biên dịch gì: `pnpm install --ignore-scripts` chỉ để có wrangler;
- job `github-release` (không secret, `contents: write` chỉ ở job này): nhận artifact như `publish`, rồi bản nháp GitHub Release với đủ file; bản beta đánh dấu pre-release (QĐ14).

**Files:**
- Modify: `.github/workflows/release.yml`, `scripts/release/workflow.test.mjs` (Task 0)

- [ ] **Step 1: Sửa workflow**

Sửa `.github/workflows/release.yml` (áp bằng `git apply`):

```diff
diff --git a/.github/workflows/release.yml b/.github/workflows/release.yml
index 5919e0005d880e1c3eb5278811f7be8c05ecee01..b8287e49900fe83f106ec68663d5b7fa9af7bc32 100644
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -1,5 +1,7 @@
 # Build bản phát hành từ tag đã commit (spec §10.2): `.dmg` cho macOS arm64 và bộ cài NSIS `.exe` cho Windows x64, cùng
-# SHA-256 của bộ cài, bảng SHA-256 của tiến trình phụ (Đ15) và chữ ký bản cập nhật. Kế hoạch 07a; 07b thêm phần đăng bản.
+# SHA-256 của bộ cài, bảng SHA-256 của tiến trình phụ (Đ15) và chữ ký bản cập nhật. Kế hoạch 07a; 07b thêm phần đăng bản:
+# từ tag `v*`, job `publish` đăng bản lên R2 và cập nhật `latest.json` của kênh (stable, hay beta với tag `vX.Y.Z-beta.N`),
+# rồi job `github-release` tạo bản nháp GitHub Release. Chạy tay (workflow_dispatch) thì không đăng gì.
 #
 # Tách job theo secret (Q1 của review 07a lần 1): job biên dịch code (của repo và của bên thứ ba: crate, CMake, npm) không
 # có secret nào; job có secret (environment `release`) chạy trên runner mới, checkout lại đúng commit, không biên dịch gì,
@@ -14,10 +16,13 @@
 #   APPLE_CERTIFICATE_P12, APPLE_CERTIFICATE_PASSWORD   chứng thư Developer ID Application (.p12, base64) và mật khẩu
 #   APPLE_API_KEY_P8, APPLE_API_KEY_ID, APPLE_API_ISSUER  khóa App Store Connect API để notarize
 #   TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD  khóa ký bản cập nhật (Q17)
+#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID   token R2 chỉ ghi được bucket bản phát hành (kế hoạch 07b, Task 12)
 # Biến cấu hình (Variables, không bí mật):
 #   APPLE_TEAM_ID         Team ID mà app tự kiểm trong chữ ký của mình (kế hoạch 06, AI_TRANSLATOR_TEAM_ID)
 #   WINDOWS_SIGNER        tên chủ chứng thư ký mã Windows (kế hoạch 06, AI_TRANSLATOR_SIGNER)
 #   MT_WINDOWS_SIGN_CMD   lệnh ký của dịch vụ ký cloud (sign-windows.mjs; chọn ở T2)
+#   RELEASES_BUCKET       tên bucket R2 của bản phát hành; RELEASES_BASE_URL  URL công khai của nó, đúng URL gốc build sẵn
+#                         trong app (`updater/source.rs`, PRODUCTION_URL)
 name: Release
 
 on:
@@ -49,6 +54,9 @@ jobs:
       - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
         with:
           node-version-file: .node-version
+      - name: Tag khớp version trong tauri.conf.json (bản beta là X.Y.Z-beta.N)
+        if: startsWith(github.ref, 'refs/tags/')
+        run: node scripts/release/release-ready.mjs --tag "$GITHUB_REF_NAME"
       - name: Rust theo rust-toolchain.toml
         run: rustup toolchain install
       - uses: taiki-e/install-action@83ac0ad63c0167e6f06796fab0fce28db1bf3db0 # v2.87.22
@@ -236,6 +244,9 @@ jobs:
       - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
         with:
           node-version-file: .node-version
+      - name: Tag khớp version trong tauri.conf.json (bản beta là X.Y.Z-beta.N)
+        if: startsWith(github.ref, 'refs/tags/')
+        run: node scripts/release/release-ready.mjs --tag "$GITHUB_REF_NAME"
       - name: Rust theo rust-toolchain.toml
         run: rustup toolchain install
       - name: Vulkan SDK
@@ -439,3 +450,75 @@ jobs:
           name: release
           path: target/release-out/
           if-no-files-found: error
+
+  publish:
+    name: "Đăng bản lên R2 (secret, không biên dịch)"
+    needs: update-signatures
+    if: startsWith(github.ref, 'refs/tags/v')
+    runs-on: macos-26
+    timeout-minutes: 20
+    environment: release
+    # Mọi tag dùng chung một nhóm: hai bản được duyệt gần nhau không đọc cùng latest.json cũ rồi ghi đè nhau (N-4 của review
+    # 07b lần 1). Không hủy lần đang chạy.
+    concurrency:
+      group: release-publish
+      cancel-in-progress: false
+    steps:
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
+        with:
+          persist-credentials: false
+      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
+      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
+        with:
+          node-version-file: .node-version
+      # Như mọi job có secret: tải vào thư mục trống ngoài checkout, chỉ nhận file đúng tên (07a QĐ29).
+      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
+        with:
+          name: release
+          path: ${{ runner.temp }}/in/release
+      - name: Nhận bộ cài và chữ ký của hai nền tảng
+        run: node scripts/release/take-artifact.mjs release "$RUNNER_TEMP/in/release" target/release-out
+      - name: Đủ cấu hình production (khóa công khai, URL, tên miền website)
+        env:
+          RELEASES_BASE_URL: ${{ vars.RELEASES_BASE_URL }}
+        run: node scripts/release/release-ready.mjs --base-url "$RELEASES_BASE_URL"
+      - name: wrangler của server/ (không secret, không chạy script cài đặt)
+        run: pnpm -C server install --frozen-lockfile --ignore-scripts
+      - name: Tải bộ cài, chữ ký, SHA-256 lên R2; rồi latest.json của kênh
+        env:
+          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
+          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
+          RELEASES_BUCKET: ${{ vars.RELEASES_BUCKET }}
+          RELEASES_BASE_URL: ${{ vars.RELEASES_BASE_URL }}
+        run: |
+          node scripts/release/publish-release.mjs --tag "$GITHUB_REF_NAME" --dir target/release-out \
+            --bucket "$RELEASES_BUCKET" --base-url "$RELEASES_BASE_URL"
+
+  github-release:
+    name: "Bản nháp GitHub Release (không secret)"
+    needs: publish
+    runs-on: macos-26
+    timeout-minutes: 10
+    permissions:
+      contents: write
+    steps:
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
+        with:
+          persist-credentials: false
+      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
+        with:
+          node-version-file: .node-version
+      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
+        with:
+          name: release
+          path: ${{ runner.temp }}/in/release
+      - name: Nhận bộ cài và chữ ký (chỉ file đúng tên, như job publish)
+        run: node scripts/release/take-artifact.mjs release "$RUNNER_TEMP/in/release" target/release-out
+      - name: Bản nháp với đủ file của bản (bản beta đánh dấu pre-release)
+        env:
+          GH_TOKEN: ${{ github.token }}
+        run: |
+          pre=()
+          case "$GITHUB_REF_NAME" in *-beta.*) pre=(--prerelease) ;; esac
+          gh release create "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --draft --verify-tag "${pre[@]}" \
+            --title "AI Translator ${GITHUB_REF_NAME#v}" --notes "" target/release-out/*
```

Sửa `scripts/release/workflow.test.mjs` (áp bằng `git apply`):

```diff
diff --git a/scripts/release/workflow.test.mjs b/scripts/release/workflow.test.mjs
index 3da72696c08f4080a20279050e73b8207fea70f4..9210842d8fafac5a35dec02a17019101c8c57f25 100644
--- a/scripts/release/workflow.test.mjs
+++ b/scripts/release/workflow.test.mjs
@@ -29,3 +29,12 @@ test("file chứa bí mật được tạo với quyền 0600 ngay từ đầu (
   }
   assert.match(workflows[0][1], /umask 077; printf '%s' "\$APPLE_API_KEY_P8"/);
 });
+
+test("job publish: một nhóm concurrency cho mọi tag (N-4 của review 07b lần 1); bước có token Cloudflare không cài gói", () => {
+  const yml = workflows[0][1];
+  const job = yml.slice(yml.indexOf("\n  publish:\n"), yml.indexOf("\n  github-release:\n"));
+  assert.match(job, /\n    concurrency:\n      group: release-publish\n      cancel-in-progress: false\n/);
+  const secret = steps(job).filter((s) => s.includes("secrets."));
+  assert.equal(secret.length, 1);
+  assert.match(secret[0], /node scripts\/release\/publish-release\.mjs/);
+});
```

- [ ] **Step 2: Kiểm** (actionlint của 07a Task 9; test của 07a cho `take-artifact.mjs` kiểm cả job `publish`; job có `environment: release` không biên dịch gì, như 07a Task 10)

Run:
```bash
target/release-work/tools/actionlint .github/workflows/*.yml && echo "actionlint: sạch"
node --test scripts/release/take-artifact.test.mjs scripts/release/workflow.test.mjs 2>&1 | grep -E '^(✔ job|✖|ℹ (pass|fail))' | sed -E 's/ \([0-9.]+ms\)//'
ruby -ryaml -e '
compile = /cargo (build|test|clippy)|pnpm build|pnpm install --frozen-lockfile$|build-sidecars-(macos\.sh|windows\.mjs)$|package-(macos\.sh|windows\.mjs) build/
jobs = YAML.load_file(".github/workflows/release.yml")["jobs"]
jobs.each do |name, job|
  runs = job["steps"].map { |s| s["run"].to_s }.join("\n").lines.map(&:strip)
  bad = runs.grep(compile)
  write = job.dig("permissions", "contents") == "write" ? ", contents: write" : ""
  puts "#{name}: #{job["environment"] ? "secret" : "không secret"}#{write}#{job["environment"] && !bad.empty? ? " -- BIÊN DỊCH: #{bad}" : ""}"
end'
```

Expected (lúc lập kế hoạch: sáu job có secret, không job nào trong đó biên dịch; chỉ `github-release` ghi được repo):
```text
actionlint: sạch
✔ job có secret chỉ tải artifact theo tên vào $RUNNER_TEMP/in/, chỉ take-artifact đọc ở đó, mọi artifact đó đều có luật
✔ job publish: một nhóm concurrency cho mọi tag (N-4 của review 07b lần 1); bước có token Cloudflare không cài gói
ℹ pass 8
ℹ fail 0
macos-sidecars: không secret
macos-sidecars-signed: secret
macos-app: không secret
macos-sign-app: secret
windows-sidecars: không secret
windows-sidecars-signed: secret
windows-app: không secret
windows-bundle: secret
update-signatures: secret
publish: secret
github-release: không secret, contents: write
```

- [ ] **Step 3: Commit**

Run:
```bash
git add .github/workflows/release.yml scripts/release/workflow.test.mjs
git commit -q -m "ci: từ tag v*, đăng bản lên R2 và cập nhật latest.json của kênh sau khi người duyệt, rồi tạo bản nháp GitHub Release; tag phải khớp version của app (§6.11, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
ci: từ tag v*, đăng bản lên R2 và cập nhật latest.json của kênh sau khi người duyệt, rồi tạo bản nháp GitHub Release; tag phải khớp version của app (§6.11, §10.2)
```

## Task 8: Tài liệu phát hành và khóa; khóa manifest production

`docs/release/phat-hanh.md` là quy trình cho người vận hành: tạo khóa production (Q17, QĐ15), hạ tầng R2, mỗi lần phát hành, rút một bản, đổi khóa và lộ khóa (QĐ16). `gen-manifest-key.mjs` của 04 chỉ tạo khóa staging; thêm `--production` (kid `prod-…`, kid không trùng ở khối nào).

**Files:**
- Create: `docs/release/phat-hanh.md`
- Modify: `scripts/models/gen-manifest-key.mjs`, `scripts/models/manifest.test.mjs`

- [ ] **Step 1: Tài liệu**

Tạo `docs/release/phat-hanh.md`:

````
# Phát hành AI Translator

Quy trình cho người vận hành (kế hoạch 07b; spec §6.11, §10.2, Q17). Mọi khóa riêng chỉ nằm trong secret của environment
`release` trên GitHub và trong bản sao offline đã mã hóa. Không khóa riêng nào nằm trong repo, trong app, hay trên máy dev.

Ký hiệu: `REPO=dotienphong/ai-live-translator-desktop`. Lệnh `gh` chạy trên máy có mạng, đã `gh auth login` bằng tài khoản có
quyền admin của repo.

## 1. Một lần: khóa production (Q17)

Chuẩn bị: một máy Mac không nối mạng (tắt Wi-Fi, rút cáp) có Node và repo đã `pnpm install`; một USB riêng đặt tên `KHOA`;
giấy và bút. Mỗi khóa một passphrase, ít nhất 6 từ ngẫu nhiên, viết ra giấy, cất riêng với USB.

### 1.1. Khóa ký bản cập nhật (tauri-plugin-updater)

Trên máy không nối mạng:

```bash
pnpm tauri signer generate -w /Volumes/KHOA/updater-<năm>-<tháng>.key
```

Lệnh hỏi passphrase (gõ hai lần). File `.key` là khóa riêng đã mã hóa bằng passphrase đó: đây cũng là bản sao offline. File
`.key.pub` là khóa công khai (một dòng base64).

- Chép nội dung `.key.pub` vào trường `production` của `src-tauri/keys/updater-public-keys.json`, commit
  (`build(release): khóa công khai production của bản cập nhật`).
- Trên máy có mạng, cắm USB:

  ```bash
  gh secret set TAURI_SIGNING_PRIVATE_KEY --env release --repo "$REPO" < /Volumes/KHOA/updater-<năm>-<tháng>.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env release --repo "$REPO"   # gõ passphrase khi được hỏi
  ```

### 1.2. Khóa ký manifest model

Trên máy không nối mạng (kid lấy số thứ tự kế tiếp, không bao giờ dùng lại). Bản rõ của khóa chỉ nằm trên một ổ trong RAM,
không bao giờ ghi xuống SSD hay USB (xóa file trên APFS/SSD không xóa hẳn dữ liệu):

```bash
ram=$(hdiutil attach -nomount ram://32768)          # ổ 16 MB trong RAM
diskutil erasevolume APFS KHOA-RAM $ram
node scripts/models/gen-manifest-key.mjs prod-<năm>-<tháng>-1 --production --out /Volumes/KHOA-RAM/manifest.jwk
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in /Volumes/KHOA-RAM/manifest.jwk \
  -out /Volumes/KHOA/manifest-prod-<năm>-<tháng>-1.jwk.enc
hdiutil detach $ram                                  # ổ RAM mất hẳn
```

- Dòng `{ "kid", "x" }` mà lệnh đầu in ra: thêm vào mảng `production` của `src-tauri/keys/manifest-public-keys.json`, commit.
- Trên máy có mạng, cắm USB (khóa đi thẳng từ `openssl` vào `gh`, không ghi ra đĩa):

  ```bash
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in /Volumes/KHOA/manifest-prod-<năm>-<tháng>-1.jwk.enc \
    | gh secret set MANIFEST_SIGNING_KEY --env release --repo "$REPO"
  ```

- Kiểm: chạy workflow `Sign model manifest`. Job `sign` tự kiểm chữ ký bằng khóa công khai trong repo; khóa riêng không khớp
  thì job đỏ.

### 1.3. Hạ tầng phát hành (R2)

- Hai bucket R2: một cho staging, một cho production (ví dụ `ai-translator-releases`), mỗi bucket có tên miền công khai
  (production: `releases.<tên miền>` khi có T7, trước đó là URL `r2.dev` của bucket).
- Một API token R2 chỉ có quyền "Object Read & Write" trên đúng bucket production. Nhập vào environment `release`:
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Biến của repo (không bí mật): `RELEASES_BUCKET` (tên bucket),
  `RELEASES_BASE_URL` (URL công khai, ví dụ `https://releases.<tên miền>`).
- Điền URL build sẵn trong app, commit:
  - `src-tauri/src/updater/source.rs`: `PRODUCTION_URL` đúng bằng `RELEASES_BASE_URL`; `STAGING_URL` là URL của bucket staging.
  - `src-tauri/src/models/source.rs`: `PRODUCTION_URL` là URL của `models.json` đã ký.
  - `src-tauri/src/license/client.rs` và khối `production` của `src-tauri/keys/license-public-keys.json`: kế hoạch 05 Task 21.
  - `src-tauri/src/navigation.rs`: thêm tên miền website vào `EXTERNAL_HOSTS`.
- Kiểm: `node scripts/release/release-ready.mjs --base-url "<RELEASES_BASE_URL>"` in `đủ cấu hình production`. Job `publish`
  chạy đúng lệnh này và dừng nếu còn thiếu.

## 2. Mỗi lần phát hành

1. Đổi `version` trong `src-tauri/tauri.conf.json`: `X.Y.Z` cho stable, `X.Y.Z-beta.N` cho beta. Commit
   (`chore(release): X.Y.Z`), tạo tag `vX.Y.Z` (hay `vX.Y.Z-beta.N`) đúng commit đó, đẩy tag.
2. Workflow `Release` chạy. Bước đầu của hai job tiến trình phụ kiểm tag khớp `version`. Sáu job có secret chờ duyệt (Review
   deployments): bốn job ký, `update-signatures`, `publish`. Duyệt từng job khi nó tới lượt, sau khi xem log của job trước.
3. Job `publish`:
   - kiểm đủ cấu hình production;
   - từ chối nếu bản này đã đăng: có dấu `<version>/published.json`, hay `latest.json` của kênh đã báo bản này (bản đã
     phát hành không bao giờ bị ghi đè, kể cả sau khi rút; sửa lỗi thì ra bản mới);
     job đứt giữa chừng (một phần file đã lên, `latest.json` chưa đổi) thì bấm "Re-run failed jobs": các file của bản được
     tải lại;
   - tải mọi file của bản lên `<version>/`, rồi mới ghi `latest.json` của kênh.
   - Bản stable vào kênh stable, và vào kênh beta nếu mới hơn bản beta đang có. Bản beta chỉ vào kênh beta.
4. Job `github-release` tạo bản nháp trên GitHub với đủ file. Viết ghi chú phát hành rồi bấm Publish.
5. Kiểm sau khi đăng:
   - `curl -s <RELEASES_BASE_URL>/<kênh>/latest.json` có đúng `version`;
   - tải `.dmg` và `.exe` từ `<RELEASES_BASE_URL>/<version>/`, so SHA-256 với `SHA256SUMS-*.txt`;
   - một máy đang chạy bản trước, cùng kênh: trong vòng 24 giờ (hay mở lại app) thấy lời mời khởi động lại để cập nhật.

### Phát hành lần lượt

Mỗi lần chỉ đẩy một tag, chờ job `publish` của tag đó xong (xanh hay đỏ) rồi mới đẩy tag kế tiếp. Job `publish` của mọi tag
dùng chung một nhóm `concurrency`: GitHub chỉ giữ **một** lần chạy chờ cho mỗi nhóm, nên ba tag đẩy gần nhau thì `publish` của
tag giữa bị hủy ("Canceled … higher priority waiting request"). Bản đó không lên R2, và chạy lại sau sẽ bị từ chối vì không
mới hơn bản đã đăng sau nó; khi đó ra một bản mới.

### Rút một bản đã đăng

Không xóa file trong `<version>/`, nhất là `<version>/published.json`: dấu này làm job `publish` của tag đó từ chối chạy lại,
nên bản đã rút không bị đăng lại dù ai bấm "Re-run" và người duyệt bấm duyệt. Ghi lại `latest.json` của kênh về bản trước:

```bash
node scripts/release/update-manifest.mjs --version <bản trước> --base-url "$RELEASES_BASE_URL" --dir <file của bản trước> \
  --out /tmp/rut
pnpm -C server exec wrangler r2 object put "$RELEASES_BUCKET/<kênh>/latest.json" --file /tmp/rut/<kênh>/latest.json \
  --content-type application/json --cache-control no-cache --remote
```

Máy đã tải bản bị rút mà chưa cài thì bỏ bản đó ở lần kiểm sau. Máy đã cài thì giữ: phát hành bản sửa với số lớn hơn.

## 3. Đổi khóa và lộ khóa

### Khóa ký bản cập nhật

App chỉ tin một khóa công khai (`production` trong `updater-public-keys.json`), và mỗi kênh chỉ có một `latest.json` cho mọi
máy. Bản cài trên máy chỉ nhận bản cập nhật ký bằng khóa mà nó đang tin.

- **Đổi có kế hoạch:**
  1. Tạo khóa mới như mục 1.1, nhưng chưa đổi secret.
  2. Phát hành bản N mang khóa công khai mới, vẫn ký bằng khóa cũ. Máy cập nhật lên N thì tin khóa mới.
  3. Chờ đủ lâu để phần lớn máy đã lên N (ít nhất 30 ngày và hai lần nhắc trên website).
  4. Đổi hai secret `TAURI_SIGNING_PRIVATE_KEY*` sang khóa mới. Từ bản N+1 ký bằng khóa mới. Máy còn ở bản trước N không cập
     nhật được nữa: phải tải bộ cài mới từ website.
- **Lộ khóa:** kẻ có khóa chỉ đẩy được bản cài giả khi ghi được `latest.json` trên R2 hay chiếm được tên miền. Vẫn làm ngay:
  thu hồi API token R2, đổi token mới, rồi đi theo các bước đổi có kế hoạch với thời gian chờ ngắn nhất, kèm thông báo trên
  website. Đây là giới hạn chấp nhận ở MVP (một khóa, không có danh sách thu hồi).

### Khóa ký manifest model

Theo spec §10.2: manifest có `kid`.

- **Đổi có kế hoạch:** một bản phát hành tin cả `kid` cũ lẫn `kid` mới (hai mục trong `production`). Sau khi bản đó đăng, đổi
  secret `MANIFEST_SIGNING_KEY` sang khóa mới và ký lại manifest. Bản sau bỏ `kid` cũ.
- **Lộ khóa:** phát hành ngay bản app chỉ tin `kid` mới, đổi secret, ký lại manifest. Máy mở app lần đầu sau khi cập nhật cần
  mạng để tải manifest mới trước khi dùng gói đã tải.

### Chứng thư ký mã (Apple, Windows)

Thu hồi ở Apple hay nhà cung cấp chứng thư, lấy chứng thư mới, đổi secret. Tên chủ chứng thư Windows mới khác cũ thì đổi biến
`WINDOWS_SIGNER` và phát hành bản mới (app tự kiểm tên này, kế hoạch 06).

### Bản sao offline

USB `KHOA` giữ: `updater-*.key` (đã mã hóa bằng passphrase của nó), `manifest-*.jwk.enc`. Passphrase ở giấy, cất riêng. Mỗi năm
một lần, trên máy không nối mạng, thử giải mã cả hai (`openssl enc -d …`, `pnpm tauri signer sign` một file bất kỳ) để chắc USB
và passphrase còn dùng được.
````

- [ ] **Step 2: Khóa manifest production**

Sửa `scripts/models/manifest.test.mjs` (áp bằng `git apply`):

```diff
diff --git a/scripts/models/manifest.test.mjs b/scripts/models/manifest.test.mjs
index 2ca5e4d078002b554a400d37d6bde6d3348e6ae2..ed085f1f396d6f17d1115a890215c3c1b5dace5d 100644
--- a/scripts/models/manifest.test.mjs
+++ b/scripts/models/manifest.test.mjs
@@ -82,6 +82,21 @@ test("gen-manifest-key: chỉ ghi khóa riêng ra ngoài repo, quyền 0600, in
   assert.equal(run("gen-manifest-key.mjs", ["stg-2026-10-3", "--out", join(dir, "c.jwk"), "--keys", keys]).status, 2, "không ghi đè");
 });
 
+test("gen-manifest-key --production: chỉ kid prod-, không trùng kid ở khối nào (kế hoạch 07b)", () => {
+  const dir = temp();
+  const keys = join(dir, "keys.json");
+  writeFileSync(keys, JSON.stringify({ staging: [{ kid: "prod-2026-11-1", x: "x" }], production: [] }));
+  assert.equal(run("gen-manifest-key.mjs", ["stg-2026-11-1", "--production", "--out", join(dir, "a.jwk"), "--keys", keys]).status, 2);
+  assert.equal(run("gen-manifest-key.mjs", ["prod-2026-11-1", "--production", "--out", join(dir, "b.jwk"), "--keys", keys]).status, 2, "kid đã có");
+  const inside = run("gen-manifest-key.mjs", ["prod-2026-11-2", "--production", "--out", resolve(REPO, "p.jwk"), "--keys", keys]);
+  assert.match(inside.stderr, /không được nằm trong repo/);
+  const ok = run("gen-manifest-key.mjs", ["prod-2026-11-2", "--production", "--out", join(dir, "c.jwk"), "--keys", keys]);
+  assert.equal(ok.status, 0, ok.stderr);
+  assert.equal(JSON.parse(ok.stdout).kid, "prod-2026-11-2");
+  assert.match(ok.stderr, /khối "production"/);
+  assert.equal(statSync(join(dir, "c.jwk")).mode & 0o777, 0o600);
+});
+
 test("sign-manifest: chỉ ký bằng khóa có trong khối của môi trường, và tự kiểm lại", () => {
   const dir = temp();
   const keys = join(dir, "keys.json");
```

Sửa `scripts/models/gen-manifest-key.mjs` (áp bằng `git apply`):

```diff
diff --git a/scripts/models/gen-manifest-key.mjs b/scripts/models/gen-manifest-key.mjs
index 93ae1336f4395803ba48c17cbf3597a1021862f0..3456dc9d562302979629b582b317285a380174ce 100644
--- a/scripts/models/gen-manifest-key.mjs
+++ b/scripts/models/gen-manifest-key.mjs
@@ -1,11 +1,15 @@
 #!/usr/bin/env node
-// Tạo cặp khóa Ed25519 ký manifest model cho môi trường staging (Đ8 của kế hoạch 00; kế hoạch 04).
+// Tạo cặp khóa Ed25519 ký manifest model (Đ8 của kế hoạch 00; kế hoạch 04, 07b).
 // - Khóa riêng ghi ra file JWK ở --out: đường dẫn tuyệt đối, NGOÀI repo, chưa có file; quyền 0600. Không in ra terminal.
-//   Khóa này chỉ để ký manifest staging trên máy người vận hành; khóa production tạo và giữ trong CI (kế hoạch 07).
-// - Khóa công khai `{ "kid", "x" }` in ra stdout, để thêm vào khối "staging" của src-tauri/keys/manifest-public-keys.json.
-// - kid dạng stg-<năm>-<tháng>-<số thứ tự>, chưa có trong manifest-public-keys.json (--keys để chỉ file khác).
+// - Khóa công khai `{ "kid", "x" }` in ra stdout, để thêm vào khối của môi trường trong src-tauri/keys/manifest-public-keys.json.
+// - Staging: kid dạng stg-<năm>-<tháng>-<số thứ tự>; khóa ở trên máy người vận hành để ký manifest staging.
+// - Production (`--production`, Q17, kế hoạch 07b Task 11): kid dạng prod-<năm>-<tháng>-<số thứ tự>; chạy trên máy không nối
+//   mạng, --out trên USB, rồi mã hóa file bằng passphrase và xóa bản rõ (docs/release/phat-hanh.md). Khóa này chỉ vào secret
+//   MANIFEST_SIGNING_KEY của environment `release`.
+// - kid chưa có trong manifest-public-keys.json, ở bất kỳ khối nào (--keys để chỉ file khác).
 //
 //   node scripts/models/gen-manifest-key.mjs stg-2026-10-1 --out "$HOME/.config/ai-translator/manifest-stg-2026-10-1.jwk"
+//   node scripts/models/gen-manifest-key.mjs prod-2026-11-1 --production --out /Volumes/KHOA/manifest-prod-2026-11-1.jwk
 import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
 import { dirname, isAbsolute } from "node:path";
 import { webcrypto } from "node:crypto";
@@ -15,15 +19,20 @@ const fail = (message) => {
   console.error(message);
   process.exit(2);
 };
-const [kid, ...rest] = process.argv.slice(2);
+const [kid, ...args] = process.argv.slice(2);
+const production = args.includes("--production");
+const rest = args.filter((a) => a !== "--production");
 let out = null;
 let keysFile = KEYS_FILE;
 for (let i = 0; i < rest.length; i += 2) {
   if (rest[i] === "--out" && rest[i + 1]) out = rest[i + 1];
   else if (rest[i] === "--keys" && rest[i + 1]) keysFile = rest[i + 1];
-  else fail("Tham số: <kid> --out <file JWK ngoài repo> [--keys <manifest-public-keys.json>]");
+  else fail("Tham số: <kid> --out <file JWK ngoài repo> [--production] [--keys <manifest-public-keys.json>]");
+}
+const prefix = production ? "prod" : "stg";
+if (!kid || !new RegExp(`^${prefix}-\\d{4}-\\d{2}-[1-9]\\d{0,3}$`).test(kid)) {
+  fail(`kid phải dạng ${prefix}-<năm>-<tháng>-<số thứ tự>, ví dụ ${prefix}-2026-10-1${production ? "" : " (khóa production: --production)"}.`);
 }
-if (!kid || !/^stg-\d{4}-\d{2}-[1-9]\d{0,3}$/.test(kid)) fail("kid phải dạng stg-<năm>-<tháng>-<số thứ tự>, ví dụ stg-2026-10-1.");
 if (!out || !isAbsolute(out)) fail("--out phải là đường dẫn tuyệt đối.");
 if (insideRepo(out)) fail("Khóa riêng không được nằm trong repo.");
 if (existsSync(out)) fail(`${out} đã có; không ghi đè khóa cũ.`);
@@ -36,4 +45,4 @@ const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
 mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
 writeFileSync(out, JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x }), { mode: 0o600, flag: "wx" });
 process.stdout.write(`${JSON.stringify({ kid, x: jwk.x })}\n`);
-console.error(`Đã ghi khóa riêng vào ${out} (0600). Thêm dòng trên vào khối "staging" của ${keysFile}.`);
+console.error(`Đã ghi khóa riêng vào ${out} (0600). Thêm dòng trên vào khối "${production ? "production" : "staging"}" của ${keysFile}.`);
```

Run:
```bash
node --test scripts/models/manifest.test.mjs 2>&1 | grep -E '^(✔|✖) gen-manifest-key|^ℹ (tests|pass|fail)' | sed -E 's/ \([0-9.]+ms\)//'
```

Expected (lúc lập kế hoạch):
```text
✔ gen-manifest-key: chỉ ghi khóa riêng ra ngoài repo, quyền 0600, in khóa công khai
✔ gen-manifest-key --production: chỉ kid prod-, không trùng kid ở khối nào (kế hoạch 07b)
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

- [ ] **Step 3: Commit**

Run:
```bash
git add docs/release/phat-hanh.md scripts/models/gen-manifest-key.mjs scripts/models/manifest.test.mjs
git commit -q -m "docs(release): quy trình tạo khóa production (Q17), hạ tầng R2, phát hành, rút bản, đổi và lộ khóa; gen-manifest-key tạo được khóa production" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1 | cut -c9-
```

Expected (lúc lập kế hoạch):
```text
docs(release): quy trình tạo khóa production (Q17), hạ tầng R2, phát hành, rút bản, đổi và lộ khóa; gen-manifest-key tạo được khóa production
```

## Task 9: Kiểm tra chuẩn (mục 6.2 của kế hoạch 00)

Đủ khối lệnh của mục 6.2 (đã gồm các phép kiểm của 07a) trên cây cuối của 07b, cộng một bản build phát hành macOS để chắc plugin không thêm thư viện nạp ngoài hệ thống và bảng SHA-256 vẫn đúng. Không có commit. Cần tiến trình phụ của 07a Task 3 trong `src-tauri/binaries/`. THIRD_PARTY_NOTICES sinh với `--no-llama` như 07a Task 11 (bản của CI có đủ llama.cpp); trước khi đóng gói để phát hành thì chạy lại 07a Task 5 Step 5.

- [ ] **Step 1: Rust**

Run:
```bash
cargo fmt --all -- --check; echo "fmt: $?"
cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^(warning|error)(\[|:)' | sort | uniq -c; echo "clippy: done"
```

Expected (lúc lập kế hoạch; cảnh báo `unused_mut` là của `third_party/whisper-rs-sys/build.rs` (build script, không phải lint của clippy), có từ trước):
```text
Diff in /Users/dtphong/Desktop/software_business/meeting-translator/src-tauri/src/app_tests.rs:1690:
     updater_of(&app).tick(crate::settings::UpdateChannel::Stable);
     UPDATE_LOG.lock().unwrap().clear();
     crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, kill_all_into_update_log);
[31m-    assert_eq!(*UPDATE_LOG.lock().unwrap(), ["kill_all"], "tắt máy, đăng xuất: không cài");
[m[32m+    assert_eq!(
[m[32m+        *UPDATE_LOG.lock().unwrap(),
[m[32m+        ["kill_all"],
[m[32m+        "tắt máy, đăng xuất: không cài"
[m[32m+    );
[m     UPDATE_LOG.lock().unwrap().clear();
     crate::updater::user_quits(app.handle());
     crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, kill_all_into_update_log);
Diff in /Users/dtphong/Desktop/software_business/meeting-translator/src-tauri/src/updater/backend.rs:177:
         let dest = dest();
         let downloaded = found.download(&dest).unwrap();
         assert_eq!(std::fs::read(&dest).unwrap(), PAYLOAD);
[31m-        assert_eq!(downloaded.sha256, <[u8; 32]>::from(Sha256::digest(PAYLOAD)), "SHA-256 của đúng các byte đã kiểm");
[m[32m+        assert_eq!(
[m[32m+            downloaded.sha256,
[m[32m+            <[u8; 32]>::from(Sha256::digest(PAYLOAD)),
[m[32m+            "SHA-256 của đúng các byte đã kiểm"
[m[32m+        );
[m         assert!(!dest.with_extension("part").exists());
         let installer = if cfg!(windows) { "x64-setup.exe" } else { "app.tar.gz" };
         assert!(
Diff in /Users/dtphong/Desktop/software_business/meeting-translator/src-tauri/src/updater/backend.rs:202:
         let app = app();
         let server = serve("0.9.0-beta.1", SIG);
         assert!(check_on(&server, &app, UpdateChannel::Stable).unwrap().is_none());
[31m-        let found = check_on(&server, &app, UpdateChannel::Beta).unwrap().expect("kênh beta nhận bản beta");
[m[32m+        let found = check_on(&server, &app, UpdateChannel::Beta)
[m[32m+            .unwrap()
[m[32m+            .expect("kênh beta nhận bản beta");
[m         assert_eq!(found.version(), "0.9.0-beta.1");
     }
 
Diff in /Users/dtphong/Desktop/software_business/meeting-translator/src-tauri/src/updater/backend.rs:212:
         assert!(accepts(true, false, Stable) && accepts(true, false, Beta));
         assert!(accepts(true, true, Beta));
         assert!(!accepts(true, true, Stable), "beta vào stable");
[31m-        assert!(!accepts(false, false, Stable) && !accepts(false, true, Beta), "không mới hơn");
[m[32m+        assert!(
[m[32m+            !accepts(false, false, Stable) && !accepts(false, true, Beta),
[m[32m+            "không mới hơn"
[m[32m+        );
[m     }
 
     #[test]
Diff in /Users/dtphong/Desktop/software_business/meeting-translator/src-tauri/src/updater/mod.rs:202:
         };
         let Some(pending) = pending else { return };
         log::info!("cài bản cập nhật {}", pending.version);
[31m-        let result = std::fs::read(&pending.file).map_err(|e| e.to_string()).and_then(|bytes| {
[m[31m-            if <[u8; 32]>::from(Sha256::digest(&bytes)) != pending.sha256 {
[m[31m-                return Err("file trên đĩa khác bản đã kiểm chữ ký lúc tải, không cài".into());
[m[31m-            }
[m[31m-            pending.installer.install(&bytes, restart)
[m[31m-        });
[m[32m+        let result = std::fs::read(&pending.file)
[m[32m+            .map_err(|e| e.to_string())
[m[32m+            .and_then(|bytes| {
[m[32m+                if <[u8; 32]>::from(Sha256::digest(&bytes)) != pending.sha256 {
[m[32m+                    return Err("file trên đĩa khác bản đã kiểm chữ ký lúc tải, không cài".into());
[m[32m+                }
[m[32m+                pending.installer.install(&bytes, restart)
[m[32m+            });
[m         if let Err(e) = result {
             log::error!("không cài được bản cập nhật {}: {e}", pending.version);
         }
fmt: 1
   1 warning: variable does not need to be mutable
clippy: done
```

Run:
```bash
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```

Expected (lúc lập kế hoạch: 07a cộng 22 test mới của app):
```text
passed 785 failed 0 ignored 13
```

Run:
```bash
./scripts/check-windows.sh -q; echo "check-windows: $?"
cargo deny check 2>&1 | tail -1
cargo audit 2>&1 | grep -E '^warning: [0-9]+ allowed'
```

Expected (lúc lập kế hoạch):
```text
check-windows: 0
advisories ok, bans ok, licenses ok, sources ok
warning: 3 allowed warnings found
```

- [ ] **Step 2: Giao diện và script**

Run:
```bash
pnpm build >/dev/null 2>&1; echo "build: $?"
pnpm test 2>&1 | grep -E 'Test Files|Tests '
node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)'
pnpm audit --audit-level high 2>&1 | tail -1
```

Expected (lúc lập kế hoạch):
```text
build: 0
 Test Files  15 passed (15)
      Tests  130 passed (130)
ℹ tests 63
ℹ pass 63
ℹ fail 0
No known vulnerabilities found
```

- [ ] **Step 3: Bản phát hành macOS** (giấy phép gồm crate mới; đóng gói và kiểm của 07a Task 6)

Run:
```bash
node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --no-llama 2>&1 | grep -E '^(THIRD_PARTY|LỖI)'
grep -oE '(tauri-plugin-updater|minisign-verify|osakit) [0-9.]+' THIRD_PARTY_NOTICES.txt | sort -u
scripts/release/package-macos.sh build 2>&1 | grep -E 'Finished 1 bundle|^ +/.*\.app \(|khớp|bảng SHA-256|LỖI' | sed -E 's/in [0-9.]+s/in …/'
node scripts/release/release-check.mjs deps-macos "target/release/bundle/macos/AI Translator.app/Contents/MacOS/meeting-translator" 2>&1 | grep -oE 'minos [0-9.]+|OSAKit[.]framework|LỖI.*'
```

Expected (lúc lập kế hoạch: 507 crate (07a: 498), 6 mục C/C++ và model vì `--no-llama`; .app lớn thêm khoảng 0,3 MiB; plugin thêm framework hệ thống OSAKit, không thư viện nào ngoài hệ thống. Hai dòng cuối lấy từ lần chạy trước trên cùng mã của app (lần chạy cuối ghi output `deps-macos` vào thư mục chưa có, đã đổi lệnh thành pipe)):
```text
THIRD_PARTY_NOTICES.txt: 139 văn bản giấy phép Rust (507 crate), 5 gói npm, 6 mục C/C++ và model
minisign-verify 0.2.5
osakit 0.3.1
tauri-plugin-updater 2.13.1
    Finished 1 bundle at:
        /Users/dtphong/Desktop/software_business/meeting-translator/target/release/bundle/macos/AI Translator.app (28.59 MiB)
bản đóng gói khớp 2 file của binaries/
meeting-translator mang bảng SHA-256 của 2 file, đúng tên sau khi đóng gói
minos 14.2
OSAKit.framework
```

## Task 10: Cập nhật kế hoạch 00

Làm theo Task 2 của kế hoạch 00 (`docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`), ghi SHA commit thật của từng task:
- Step 1–2: liệt kê các dòng có `07`. Đổi theo kết quả thật:
  - dòng 23 (F9), 203 (tự cập nhật), 204 (hai kênh): `đang làm`, ghi Task 1–4, 6, 7; còn Task 14 (thử thật);
  - dòng 63 (không chặn thoát khi tự khởi động lại để cập nhật): ghi Task 3 (`request_restart`, `RunEvent::ExitRequested` có mã thoát nên không bị `prevent_exit`); còn Task 14;
  - dòng 50 (Cài đặt › Chung, kênh cập nhật): phần 07 `xong` ở Task 3 (đổi kênh thì kiểm ngay);
  - dòng 150 (đo lại thời gian chờ lần đầu với bản đã ký): `chờ` Task 15;
  - dòng 10 (D10), 200, 201 (ký Windows, macOS): `chờ` Task 13 (T1, T2);
  - dòng 33 (A6), 59 (giấy phép): còn Task 15 và 08.
- Step 3: dòng phát sinh của 07a "giá trị trong `Run` của Windows không có dấu nháy": `xong` phần code ở Task 5, còn thử ở Task 14; dòng "SQLCipher, OpenSSL, câu mẫu FLEURS vào THIRD_PARTY_NOTICES": `xong` (07a Task 5 trên cây sau 06), còn đọc lại trên bản đã cài ở Task 15.
- Step 4:
  - mục 2: dòng 07: "07a đã thực thi; 07b đã viết (Task 1–10 làm được ngay; Task 11–15 cần người, T1, T2, T7)";
  - mục 2.7: "Còn cho 07b" đánh dấu phần đã làm, trỏ tới Task 11–15 cho phần còn lại;
  - mục 6.5 (bí mật của CI): thêm `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (environment `release`), biến `RELEASES_BUCKET`, `RELEASES_BASE_URL`; trỏ tới `docs/release/phat-hanh.md`;
  - mục 8.3: thêm các điểm ở "Điểm cần chủ dự án quyết" của file này.
- Step 5–6: kiểm định dạng bảng, rồi commit với thông điệp `docs(plan): cập nhật tổng quan Giai đoạn 1 sau kế hoạch 07b`.

## Task 11: Khóa production (người, máy không nối mạng)

Theo `docs/release/phat-hanh.md` mục 1.1, 1.2 (Q17). Cần: environment `release` đã có Required reviewers và luật chỉ cho tag `v*` (07a Task 14 Step 1) TRƯỚC khi nhập secret.
- [ ] **Step 1: Khóa ký bản cập nhật.** Tạo bằng `pnpm tauri signer generate -w /Volumes/KHOA/updater-<năm>-<tháng>.key` trên máy không nối mạng; nhập hai secret `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Chép nội dung `.key.pub` vào `production` của `src-tauri/keys/updater-public-keys.json`.
- [ ] **Step 2: Khóa ký manifest model.** `node scripts/models/gen-manifest-key.mjs prod-<năm>-<tháng>-1 --production --out …`, mã hóa bằng `openssl enc` lên USB, nhập secret `MANIFEST_SIGNING_KEY` qua pipe. Thêm `{ "kid", "x" }` vào mảng `production` của `src-tauri/keys/manifest-public-keys.json`.
- [ ] **Step 3: Kiểm và commit.**
  - `cargo test -p meeting-translator --lib -- updater::source models::signed`: qua (test `the_shipped_key_file_has_no_private_key` kiểm khóa production đúng dạng).
  - `node scripts/release/release-ready.mjs`: còn năm dòng `LỖI` (hai dòng khóa đã hết).
  - Commit hai file khóa công khai: `build(release): khóa công khai production của bản cập nhật và manifest model (Q17)`.
- [ ] **Step 4: Thử ký manifest production.** Chạy workflow `Sign model manifest` với phần thân hiện tại (07a Task 10): job `sign` xanh nghĩa là khóa riêng trong secret khớp khóa công khai vừa commit.
- [ ] **Step 5: Bản sao offline.** USB `KHOA` có `updater-*.key` và `manifest-*.jwk.enc`; passphrase trên giấy, cất riêng. Ghi ai giữ USB và giấy (điểm cần quyết 4).

## Task 12: R2, URL production, tên miền (người)

Theo `docs/release/phat-hanh.md` mục 1.3. Cần: tên miền (T7) hay quyết định tạm dùng URL `r2.dev` (điểm cần quyết 1); license server production (05 Task 21).
- [ ] **Step 1:** Tạo hai bucket R2 (staging, production) có URL công khai; API token chỉ ghi được bucket production; nhập `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` vào environment `release`, biến `RELEASES_BUCKET`, `RELEASES_BASE_URL` của repo.
- [ ] **Step 2:** Điền và commit (`build(release): URL production của bản cập nhật, manifest model và website`):
  - `src-tauri/src/updater/source.rs`: `PRODUCTION_URL` = `RELEASES_BASE_URL`, `STAGING_URL` = URL bucket staging;
  - `src-tauri/src/models/source.rs`: `PRODUCTION_URL` = URL `models.json` đã ký ở Task 11 Step 4 (tải lên bucket model của 04);
  - `src-tauri/src/license/client.rs` và khối `production` của `src-tauri/keys/license-public-keys.json` (05 Task 21);
  - `src-tauri/src/navigation.rs`: tên miền website vào `EXTERNAL_HOSTS`.
- [ ] **Step 3:** `node scripts/release/release-ready.mjs --base-url "<RELEASES_BASE_URL>"` in `đủ cấu hình production`; `cargo test -p meeting-translator --lib` qua.

## Task 13: Ký thật và bản beta đầu tiên (người, GitHub, Mac, Windows)

Cần T1 (Apple Developer) và T2 (dịch vụ ký Windows), Task 11, 12.
- [ ] **Step 1: Ký macOS.** Nhập năm secret Apple (07a "Secret và biến của CI"), biến `APPLE_TEAM_ID`.
- [ ] **Step 2: Ký Windows.** Theo dịch vụ đã chọn: biến `MT_WINDOWS_SIGN_CMD` (lệnh có `{file}`), secret của dịch vụ thêm vào `env` của hai bước ký trong `windows-sidecars-signed` và `windows-bundle` (sửa `release.yml`, commit), biến `WINDOWS_SIGNER` (tên chủ chứng thư, kế hoạch 06).
- [ ] **Step 3: Bản `0.1.0-beta.1`.** Đổi `version` trong `src-tauri/tauri.conf.json` thành `0.1.0-beta.1`, commit `chore(release): 0.1.0-beta.1`, tag `v0.1.0-beta.1`, đẩy tag. Duyệt sáu job có secret khi tới lượt.
  - Expected: mọi job xanh; log `macos-sign-app` có notarize và staple; log `publish` có `0.1.0-beta.1: beta` và các lệnh `wrangler r2 object put`, dòng cuối `đã đăng 0.1.0-beta.1 lên kênh beta`; `curl -s "$RELEASES_BASE_URL/beta/latest.json"` có `"version": "0.1.0-beta.1"`; `stable/latest.json` trả 404; GitHub có bản nháp pre-release đủ file.
  - Ghi lại: thời gian của từng job, dung lượng `.dmg` và `.exe`.
- [ ] **Step 4: Bản `0.1.0-beta.2`** như Step 3 (một commit bất kỳ, ví dụ ghi chú phát hành). Ngay sau khi `publish` của beta.2 xanh, bấm "Re-run jobs" của chính job đó: đỏ với `0.1.0-beta.2 đã được đăng`. Không xóa hay đẩy lại tag (ruleset của 07a Task 14 Step 1 chặn).

## Task 14: Thử cập nhật từ bản trước (người, Mac, Windows)

Trên mỗi máy (Mac arm64 macOS 14.2+, Windows 10/11 x64): gỡ bản cũ, cài `0.1.0-beta.1` từ R2, mở app, Cài đặt › Chung › Kênh cập nhật: beta. Mở Console.app (Mac) hay thư mục log (Giới thiệu › Mở thư mục log) để đọc log.
- [ ] **Step 1: Kiểm và tải.** Đổi kênh sang beta: trong vòng một phút log có `có bản cập nhật 0.1.0-beta.2, đang tải`; cửa sổ chính hiện "Bản 0.1.0-beta.2 đã tải xong…"; menu khay có "Khởi động lại để cập nhật". Chưa đổi kênh (stable) thì không có lời mời và log không có lỗi.
- [ ] **Step 2: Đang dịch thì không mời.** Bắt đầu dịch: lời mời và mục menu khay biến mất; dừng dịch: hiện lại. "Để sau" ẩn lời mời, menu khay vẫn còn mục.
- [ ] **Step 3: Khởi động lại để cập nhật.** Bấm "Khởi động lại" (Mac: không có hộp thoại chặn thoát của ⌘Q; Windows: thấy cửa sổ tiến trình của bộ cài): app mở lại, Giới thiệu ghi 0.1.0-beta.2; Cài đặt và lịch sử còn nguyên; `pgrep -fl asr-worker` (Mac) hay Task Manager không còn tiến trình phụ của bản cũ.
- [ ] **Step 4: Cài ở lần thoát kế tiếp.** Trên máy thứ hai (hay cài lại beta.1): chờ có lời mời, chọn Thoát ở menu khay, mở lại app: Giới thiệu ghi 0.1.0-beta.2. Windows: bộ cài không tự mở lại app sau khi thoát.
- [ ] **Step 5: Tắt máy hay đăng xuất khi có bản đã tải** (QĐ7). Chờ có lời mời, rồi tắt máy (Mac: Apple menu › Shut Down; Windows: Start › Shut down). Expected:
  - máy tắt bình thường, không có hộp thoại admin hay cửa sổ bộ cài;
  - mở lại máy và app: Giới thiệu vẫn ghi bản cũ;
  - log của lần chạy đó có dòng `app thoát không do người dùng`, **hoặc** không có dòng nào sau lúc tắt máy (hệ điều hành có thể kill app trước khi có `RunEvent::Exit`; kết quả vẫn đúng). Sai là khi log có dòng `cài bản cập nhật`;
  - lời mời hiện lại sau khi app tải xong bản mới lần nữa (60 giây sau khi mở, cộng thời gian tải; thư mục `updates/` bị xóa khi mở app), không phải ngay khi mở.
  - Lặp lại với đăng xuất.
- [ ] **Step 6: Mac, tài khoản không phải admin** (QĐ7), app ở `/Applications` do tài khoản admin cài. Chờ có lời mời, Thoát ở menu khay. Expected: hệ thống hỏi mật khẩu admin. Bấm Hủy: app cũ còn nguyên, mở được, lần sau mời lại. Nhập mật khẩu admin: mở lại thấy bản mới.
- [ ] **Step 7: Windows: mục khởi động.** Bật khởi động cùng hệ thống; `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v "AI Translator"` ra giá trị có dấu nháy quanh đường dẫn; đăng xuất rồi đăng nhập: app mở ở khay.
- Ghi kết quả từng step (đạt hay không, log khi lỗi) vào dòng 23, 63, 203, 204 của kế hoạch 00; step nào không đạt thì mở việc sửa, không bỏ qua. Chữ ký sai, chữ ký của bản khác hay của khóa khác đã có test tự động với plugin thật (Task 2), không thử tay.

## Task 15: Gatekeeper, SmartScreen, thời gian chờ lần đầu, bảng SHA-256, giấy phép (người)

Trên bản `0.1.0-beta.2` đã ký thật, máy chưa từng chạy app:
- [ ] **Step 1: Gatekeeper.** Tải `.dmg` bằng Safari (có cờ quarantine), mở, kéo vào Applications, mở app: không có cảnh báo "không xác minh được nhà phát triển". `spctl -a -vv "/Applications/AI Translator.app"` ra `accepted`, `source=Notarized Developer ID`; `codesign -dv --entitlements - …` có `com.apple.security.device.audio-input` (07a QĐ23). Bắt đầu dịch: thu được âm thanh hệ thống (hộp thoại quyền lần đầu như 02).
- [ ] **Step 2: SmartScreen.** Tải `.exe` bằng Edge, chạy: ghi lại SmartScreen có cảnh báo không (§6.11: chứng thư OV mới có thể vẫn cảnh báo tới khi đủ uy tín). Thuộc tính file › Digital Signatures có tên chủ chứng thư đúng `WINDOWS_SIGNER`.
- [ ] **Step 3: Chính hãng (kế hoạch 06).** Giới thiệu hay Cài đặt › Bản quyền không báo "không chính hãng"; bản ký ad-hoc của 07a Task 15 thì có.
- [ ] **Step 4: Thời gian chờ lần đầu** (dòng 150, §6.5): lần đầu bắt đầu dịch sau khi cài, đo từ lúc bấm Bắt đầu tới câu phụ đề đầu tiên, và thời gian "Đang nạp model…"; lặp lại sau khi khởi động lại máy. Ghi vào spec §6.5 thay số "khoảng 15 giây" chưa đo.
- [ ] **Step 5: Bảng SHA-256 trên bản đã cài.** Mac: `node scripts/release/release-check.mjs bundle "/Applications/AI Translator.app"` và `… embedded …` (07a Task 6) ra `khớp`. Windows: tương tự với thư mục cài đặt `%LOCALAPPDATA%\AI Translator` (07a Task 8).
- [ ] **Step 6: Giấy phép.** Giới thiệu › Giấy phép mã nguồn mở: có `tauri-plugin-updater`, `minisign-verify`, SQLCipher, OpenSSL (Windows), câu mẫu FLEURS, llama.cpp, whisper.cpp, Vulkan-Headers (Windows), và giấy phép của ba model.

## Quyết định lúc lập kế hoạch

- **QĐ1. Plugin không có `rustls` và `zip`** (`default-features = false`, `native-tls`, `system-proxy`): một TLS stack như `reqwest` của app (Security.framework, SChannel), proxy của hệ thống. Bộ cài Windows là `.exe` của NSIS, không bọc `.zip`; macOS giải nén `.app.tar.gz` bằng `tar` + `flate2` (luôn có).
- **QĐ2. Không cấp lệnh của plugin cho webview** (không `updater:default`): giao diện chỉ đọc `AppStatus.updateReady` và gọi `restart_to_update`. Không dùng gói npm `@tauri-apps/plugin-updater`.
- **QĐ3. Khóa công khai và URL theo môi trường**, như khóa manifest và khóa token: `src-tauri/keys/updater-public-keys.json` (`staging`, `production`), `updater/source.rs` (`STAGING_URL`, `PRODUCTION_URL`, `AI_TRANSLATOR_UPDATE_URL` cho bản dev). Khóa nạp vào plugin lúc đăng ký (`Builder::pubkey`), endpoint đặt lúc kiểm theo kênh. Thiếu URL hay khóa thì tắt hẳn, không gọi mạng.
- **QĐ4. `requireSignedVersion: true`; Windows `installMode: passive`.** Manifest (`latest.json`) không ký, theo đúng mô hình của Tauri: chữ ký nằm ở từng bộ cài và plugin kiểm (QĐ20). Vì vậy chữ ký phải gắn đúng phiên bản (07a QĐ20 đã ký bằng `--app-version`), để manifest bị sửa không ghép được số phiên bản mới với bộ cài cũ. Passive hiện tiến trình cài, không hỏi gì.
- **QĐ5. Lịch kiểm.** 60 giây sau khi mở app; luồng nền thức mỗi giờ và kiểm khi đã qua 24 giờ theo giờ máy (đồng hồ đơn điệu dừng khi máy ngủ), giờ máy lùi thì kiểm; đổi kênh thì đánh thức và kiểm ngay; lỗi mạng hay lỗi tải không tính là đã kiểm, nên thử lại ở lần thức sau. Không lưu lần kiểm ra đĩa: mỗi lần mở app kiểm lại (§6.11 "kiểm lúc khởi động").
- **QĐ6. Bản đã tải ghi ra đĩa** (`app_local_data_dir/updates/<phiên bản>.bin`), không giữ trong RAM (bộ cài Windows tới gần 60 MB, app nằm khay nhiều ngày). Thư mục bị xóa khi mở app, vì chỉ cài được qua đối tượng `Update` của plugin trong bộ nhớ. Ghi qua file tạm rồi đổi tên.
- **QĐ7. Cài trong `RunEvent::Exit`, sau `kill_all` và `save_on_exit`, chỉ khi người dùng chủ động thoát** (Thoát ở menu khay, hay khởi động lại để cập nhật; Q-2 của review lần 1). Tắt máy, đăng xuất, khởi động lại máy thì không cài: bộ cài NSIS có thể bị kill giữa chừng, hộp thoại admin của macOS hiện giữa lúc đăng xuất; lần mở sau tải lại và mời lại. Windows: plugin chạy bộ cài rồi `std::process::exit(0)`, không quay lại; bộ cài thay file của app nên tiến trình phụ phải tắt trước. Bộ cài mở lại app chỉ khi khởi động lại để cập nhật. macOS: plugin thay gói `.app` tại chỗ; không ghi được (người dùng không phải admin, app trong `/Applications`) thì hệ thống hỏi mật khẩu admin lúc thoát. Rủi ro còn lại, nằm trong plugin (N-B của review lần 2): plugin giải nén `.app` mới vào thư mục tạm của người dùng rồi chỉ `mv` bằng quyền admin sau khi người dùng nhập mật khẩu; một tiến trình cùng tài khoản có thể sửa thư mục đó trong lúc hộp thoại chờ. Windows có khe tương tự nhưng ngắn hơn (bộ cài ghi ra file tạm rồi chạy). Điều kiện là đã có mã độc chạy dưới tài khoản người dùng; chấp nhận ở MVP. Việc so SHA-256 của QĐ21 chỉ phủ tới lúc app trao byte cho plugin.
- **QĐ8. Kênh.** Bản beta là semver pre-release `X.Y.Z-beta.N` (cả `version` của app, tag, tên bộ cài); mỗi kênh một `latest.json`; bản stable vào cả kênh beta khi mới hơn bản beta đang có; từ beta về stable không hạ cấp (chờ bản stable mới hơn). Đổi kênh thì bỏ bản đã tải của kênh cũ.
- **QĐ9. Bản bị rút khỏi kênh** (manifest không còn báo bản mới hơn bản đang chạy) thì bỏ bản đã tải, không cài.
- **QĐ10. Mời ở cửa sổ chính và menu khay**, không ở thanh phụ đề (chỉ hiện khi dịch, mà khi dịch thì không mời), không thông báo hệ thống (Q13). Không mời khi đang bắt đầu hay đang dịch; lệnh từ chối cả khi đang tải model (`updateBusy`), vì khởi động lại làm hỏng lần tải. "Để sau" chỉ trong lần chạy.
- **QĐ11. Khởi động lại qua `AppHandle::request_restart`.** Sự kiện `ExitRequested` có mã thoát `RESTART_EXIT_CODE` nên `handle_run_event` không chặn (chỉ chặn khi `code` là `None`); trên macOS cùng đường với Thoát ở menu khay, `quit_guard` không chặn. Trước đó dừng như Thoát ở menu khay (`session::shutdown`, nhớ vị trí thanh phụ đề).
- **QĐ12. Bố cục R2:** `<URL gốc>/<phiên bản>/` chứa mọi file của bản (`.dmg`, `.exe`, `.app.tar.gz`, `.sig`, `SHA256SUMS-*`, bảng SHA-256 tiến trình phụ, THIRD_PARTY_NOTICES); `<URL gốc>/<kênh>/latest.json` ghi sau cùng với `Cache-Control: no-cache`. Sau cùng ghi dấu bền `<URL gốc>/<phiên bản>/published.json`. Một bản coi là đã đăng khi có dấu đó hay `latest.json` của một kênh đã báo nó: từ đó không bao giờ đăng lại hay ghi đè, kể cả sau khi bản bị rút (`latest.json` về bản trước, dấu vẫn còn; Q-A của review lần 2). Trước đó (job đứt giữa chừng) thì chạy lại job, các file của bản được tải lại (N-2 của review lần 1). Job `publish` của mọi tag dùng chung một nhóm `concurrency` (N-4); GitHub chỉ giữ một lần chờ cho mỗi nhóm nên phát hành lần lượt, mỗi lần một tag (N-A của review lần 2, `phat-hanh.md`); bước cài wrangler không có token Cloudflare (N-3).
- **QĐ13. Tag phải khớp `version`** (kể cả bản beta), kiểm ở bước đầu của hai job tiến trình phụ; job `publish` kiểm đủ bảy giá trị production và `RELEASES_BASE_URL` đúng URL build sẵn trong app, thiếu thì không đăng gì. Chạy tay (`workflow_dispatch`) không đăng.
- **QĐ14. Bản nháp GitHub Release ở job riêng** không secret, chỉ job này có `contents: write`; nhận artifact qua `take-artifact.mjs` như job có secret. Repo riêng tư nên bản nháp chỉ là kho lưu; người dùng tải từ R2.
- **QĐ15. Bản sao offline của khóa.** Khóa bản cập nhật: file `.key` của `tauri signer generate` đã mã hóa bằng passphrase. Khóa manifest: JWK mã hóa bằng `openssl enc -aes-256-cbc -pbkdf2 -iter 600000` (LibreSSL của macOS có sẵn), giải mã đi thẳng vào `gh secret set` qua pipe.
- **QĐ16. Đổi khóa bản cập nhật qua một bản chuyển tiếp** (plugin chỉ tin một khóa, kênh chỉ có một `latest.json`): bản N mang khóa mới nhưng ký bằng khóa cũ; máy chưa lên N trước khi đổi secret phải cài lại tay. Giới hạn chấp nhận ở MVP (điểm cần quyết 3). Hướng của Giai đoạn 2, không cần sửa gì bây giờ: `UpdaterBuilder::pubkey` cho app chọn khóa ở mỗi lần kiểm, nên CI ký mỗi bản hai lần (`<kênh>/latest.json` ký bằng khóa cũ cho bản đang có, `<kênh>/latest-<kid>.json` bằng khóa mới cho bản mang khóa mới); khi đó đổi khóa có kế hoạch không bỏ lại máy nào. Chỉ khi lộ khóa mới buộc cài lại tay.
- **QĐ17. `Run` có dấu nháy bằng crate `windows` sẵn có** (`RegGetValueW`, `RegSetKeyValueW`), không thêm `windows-registry`: bản mới nhất 0.100.0 khác bản 0.6.1 mà `auto-launch` dùng, thêm vào là hai bản cùng crate.
- **QĐ18. Job `publish` và `github-release` chạy trên `macos-26`**: không thêm loại runner mới (07a chỉ khóa `macos-26`, `windows-2025`); hai job ngắn.
- **QĐ20. Manifest không ký; app đặt bộ so phiên bản theo kênh** (Q-3 của review lần 1; controller quyết giữ manifest không ký). Ai ghi được R2 (token lộ) hay chiếm được tên miền không cài được code tùy ý (chữ ký và `requireSignedVersion` chặn), nhưng vẫn có thể (a) đóng băng cập nhật bằng cách giữ manifest cũ, (b) đẩy một bản mới hơn đã bị rút (chữ ký vẫn đúng). Rủi ro còn lại này chấp nhận ở MVP; giảm bằng: secret R2 chỉ ở environment `release` có người duyệt, token Cloudflare chỉ ghi được bucket production. App chặn được (c) đẩy bản beta vào kênh stable: `version_comparator` của plugin chỉ nhận bản mới hơn theo semver, và kênh stable không nhận bản pre-release (`backend::accepts`). Spec §6.11 sửa câu chữ cho khớp (controller áp).
- **QĐ21. So SHA-256 trước khi cài** (Q-1 của review lần 1). `Update::install` của plugin không kiểm chữ ký; chữ ký chỉ kiểm lúc tải, có khi vài ngày trước khi cài. App giữ SHA-256 của đúng các byte đã kiểm chữ ký, đọc lại file lúc thoát và so; lệch (file bị một tiến trình khác thay, hay hỏng) thì không cài, xóa file, ghi log. Nếu không, trên macOS plugin có thể hỏi mật khẩu admin dưới tên AI Translator rồi đặt một `.app` lạ vào `/Applications`; trên Windows chạy một `.exe` bất kỳ.
- **QĐ22. Task 0 sửa file của 07a đã thực thi** (review cuối thực thi 07a, N-1..N-3) thay vì một kế hoạch riêng: 07b sửa cùng `release.yml` và job `publish`, `github-release` nhận artifact `release` qua `take-artifact.mjs`, nên luật chặt hơn (bộ cài và chữ ký bắt buộc, đúng phiên bản) cần có trước khi `publish` tải mọi file lên `<phiên bản>/`.
- **QĐ19. Lời mời chỉ ghi số phiên bản**, chưa hiện ghi chú phát hành (`notes` của `latest.json` để trống hay lấy từ `--notes-file`).

## Kiểm bằng mutation lúc lập kế hoạch

Script `$S/p07b-gen/mut.py` (Task 1–8) và `$S/p07/mut.py` (Task 0, chạy trên cây có Task 0; cùng lần đó chạy lại các mutation của 07a chạm file Task 0 sửa: QA1–QA6, QB1, QN1, QN2, K1–K3, S1–S4, U1, U2 của 07a, đều bị giết), trên cây cuối: mỗi mutation sửa một chỗ, chạy test, rồi trả file về như cũ. Cả 42 mutation dưới đây đều bị bắt. Ba mutation sống ở lần đầu: U2 (test đổi kênh trả "không có bản mới", nhánh đó cũng bỏ bản đã tải; nay kênh mới mất mạng), P2 (kiểm `https` của `publish-release.mjs` trùng với của `update-manifest.mjs`; nay test gọi với repo trống), U7 (bộ lọc test của script mutation chưa có tên test mới). Không có mutation cho phần ghi registry của Task 5 (chỉ chạy trên Windows; Task 14 thử). Lời gọi `updater::user_quits` khi Thoát ở menu khay nay nằm trong `actions::prepare_quit`, có test (U17).

```text
Z1 update-signatures cài gói trong bước có khóa: bị giết [ℹ fail 1]
Z2 notary.p8 ghi trước rồi mới chmod: bị giết [ℹ fail 1]
Z3 trap không xóa file P12 tạm: bị giết [ℹ fail 1]
Z4 .dmg không bắt buộc: bị giết [ℹ fail 2]
Z5 release không bắt buộc chữ ký: bị giết [ℹ fail 2]
U1 giờ máy lùi không kiểm lại: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U2 đổi kênh giữ bản đã tải: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U3 bản bị rút vẫn cài: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U4 lỗi mạng tính là đã kiểm (chờ 24 giờ): bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U5 bộ cài không biết là khởi động lại: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U6 tải lại bản đã có: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U7 cài trước khi kill tiến trình phụ: bị giết [test result: FAILED. 40 passed; 1 failed; 1 ignored; 0 measured; 391 filtered out] (lần đầu SỐNG vì bộ lọc test của mut.py chưa có tên test mới; đã sửa bộ lọc)
U8 khởi động lại khi đang dịch: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U9 khởi động lại khi chưa tải xong: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U10 menu khay mời khi đang dịch: bị giết [test result: FAILED. 38 passed; 2 failed; 1 ignored; 0 measured; 392 filtered out]
U11 đổi kênh không đánh thức: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U12 tắt requireSignedVersion: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U13 cấp lệnh của plugin cho cửa sổ chính: bị giết [test result: FAILED. 38 passed; 2 failed; 1 ignored; 0 measured; 392 filtered out]
U14 bỏ so SHA-256 trước khi cài: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U15 cài cả khi hệ điều hành đóng app: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
U16 kênh stable nhận bản pre-release: bị giết [test result: FAILED. 38 passed; 2 failed; 1 ignored; 0 measured; 392 filtered out]
U17 Thoát ở menu khay không cho cài: bị giết [test result: FAILED. 40 passed; 1 failed; 1 ignored; 0 measured; 391 filtered out]
S1 bản phát hành nhận http: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
S2 bản phát hành dùng khóa staging: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
S3 không kiểm độ dài khóa: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
W1 Run: nhận exe khác cùng tiền tố: bị giết [test result: FAILED. 39 passed; 1 failed; 1 ignored; 0 measured; 392 filtered out]
J1 mời khi đang dịch: bị giết [Tests  1 failed | 129 passed (130)]
J2 Để sau ẩn mọi bản: bị giết [Tests  1 failed | 129 passed (130)]
R1 license chỉ cần ô a: bị giết [ℹ fail 1]
R2 tag beta khớp phần X.Y.Z: bị giết [ℹ fail 1]
R3 bỏ qua RELEASES_BASE_URL lệch: bị giết [ℹ fail 1]
R4 khóa cập nhật không kiểm độ dài: bị giết [ℹ fail 1]
R5 không kiểm khóa riêng trong JWK: bị giết [ℹ fail 1]
P1 manifest của kênh tải lên trước: bị giết [ℹ fail 3]
P2 đăng qua http: bị giết [ℹ fail 1]
P3 đăng lại bản kênh đã báo: bị giết [ℹ fail 1]
P4 job publish không có concurrency: bị giết [ℹ fail 1]
P5 cài wrangler trong bước có token: bị giết [ℹ fail 1]
P6 bản đã rút đăng lại được (bỏ kiểm dấu published.json): bị giết [ℹ fail 2]
M1 bản stable không vào kênh beta: bị giết [ℹ fail 3]
M2 nhận bản không mới hơn: bị giết [ℹ fail 1]
G1 --production nhận kid stg-: bị giết [ℹ fail 1]
```

## Secret và biến thêm ở 07b

| Tên | Loại | Chỗ | Dùng ở |
|---|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | environment `release` | `update-signatures` (đã có ở 07a; Task 11 nhập) |
| `MANIFEST_SIGNING_KEY` | secret | environment `release` | `sign-manifest.yml` (đã có ở 07a; Task 11 nhập) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret | environment `release` | `publish` (token chỉ ghi được bucket production) |
| `RELEASES_BUCKET` | biến | repo | `publish` |
| `RELEASES_BASE_URL` | biến | repo | `publish`; phải đúng `PRODUCTION_URL` của `updater/source.rs` |

## File giao nhau với kế hoạch khác

- `src-tauri/src/lib.rs` (đăng ký plugin, `setup`, `on_exit`), `commands.rs`, `build.rs`, `capabilities/main.json` (một lệnh mới), `state.rs` (một trường của `AppStatus`), `actions.rs` (`commit_settings`), `tray.rs`, `tray_menu.rs`, `i18n.rs`, `errors.rs`, `test_support.rs`, `app_tests.rs` (thêm ở cuối file), `login_item.rs`: các kế hoạch 01–06 đã sửa; bản vá dựng trên chuỗi tham chiếu của 07a (`plan07a-r2`, trên `0d9e243`).
- `src/store/app.ts`, `src/lib/ipc.ts`, `src/windows/main/Notice.tsx`, `src/i18n/*.ts`, và bốn file test có trạng thái mẫu (`updateReady: null`).
- `scripts/models/gen-manifest-key.mjs`, `manifest.test.mjs` (04).
- `.github/workflows/release.yml` (07a).
- Commit nào khác vào `main` sửa một trong các file trên trước khi thực thi thì dùng `git apply --3way`.

## Điểm cần chủ dự án quyết

1. **URL của bản cập nhật trước khi có tên miền (T7):** chờ tên miền (`releases.<tên miền>`), hay phát hành beta với URL `r2.dev` của bucket. URL build sẵn trong app; đổi URL sau đó cần một bản phát hành trên URL cũ trỏ sang (bản đó mang URL mới), như đổi khóa (QĐ16). Đề xuất: chờ tên miền cho bản stable; beta nội bộ dùng `r2.dev`.
2. **Ai được vào kênh beta:** mọi người dùng chọn được beta trong Cài đặt (như spec §6.9 hiện tại), hay chỉ nhóm thử. Kênh beta nhận cả bản stable mới hơn (QĐ8).
3. **Giới hạn đổi khóa bản cập nhật (QĐ16):** chấp nhận máy chưa lên bản chuyển tiếp phải cài lại tay, hay làm thêm đường dẫn manifest theo thế hệ khóa (mỗi bản ký hai lần) ở Giai đoạn 2.
4. **Người giữ khóa offline:** ai giữ USB `KHOA`, ai giữ giấy passphrase, cất ở đâu (Q17 chỉ nói "cất riêng").
5. **Lịch phát hành stable đầu tiên:** sau khi 08 nghiệm thu đạt, hay sau một số tuần beta.

## Ranh giới với 08

08 dùng bộ cài của Task 13 (bản beta đã ký) cho nghiệm thu; A6 (bộ cài ký số, notarize, gỡ sạch) và §11 "Cài đặt và cập nhật" lấy kết quả của Task 14, 15. Bản stable đầu tiên (`v0.1.0` hay số khác) phát hành bằng đúng quy trình của `docs/release/phat-hanh.md` sau khi 08 đạt.
