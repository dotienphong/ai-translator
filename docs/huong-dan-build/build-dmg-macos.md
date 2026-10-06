# Hướng dẫn build tay file `.dmg` cho macOS

Tài liệu này dành cho việc **tự dựng `.dmg` trên máy Mac của bạn** để đưa cho người dùng tải về cài (ví dụ bản beta đầu tiên). Viết ngày 2026-10-06, kiểm theo `scripts/release/package-macos.sh` và `.github/workflows/release.yml`.

> **Bản build tay này ký ad-hoc và không notarize** (chưa có Apple Developer ID), nên macOS cảnh báo lúc mở lần đầu và khách phải làm thêm một bước "Open Anyway" (mục 8). Bản này cũng **không có tự cập nhật** (mục 9). Khi có Developer ID thì đặt biến `APPLE_TEAM_ID` và các secret `APPLE_*` cho CI, không phải sửa code (`docs/release/phat-hanh.md` mục 5).

Quy trình phát hành chính thức (CI, ký bản cập nhật, đăng `latest.json`) nằm ở `docs/release/phat-hanh.md`. Tài liệu này chỉ là cách làm tay, nhanh, cho Mac.

## 1. Cần có trước

| Thứ | Phiên bản | Kiểm |
|---|---|---|
| Mac Apple Silicon (M1 trở lên), macOS 14.2 trở lên | | `uname -m` in `arm64` |
| Xcode (hoặc Command Line Tools) | bản đủ mới | `xcode-select -p` in một đường dẫn |
| Rust | **1.98.1** (khóa trong `rust-toolchain.toml`, `rustup` tự cài) | `rustc --version` |
| Node | **24.21.0** (`.node-version`) | `node --version` |
| pnpm | **12.6.0** (`packageManager` trong `package.json`) | `pnpm --version` |
| CMake, Ninja, protoc | bản hiện hành (Homebrew) | `which cmake ninja protoc` |
| `cargo-about` | 0.9.2 | `which cargo-about` (chỉ cần khi sinh `THIRD_PARTY_NOTICES.txt`) |
| Chỗ trống đĩa | **ít nhất 10 GB** | `df -h .` (thư mục `target/` phình nhanh; xóa `target/debug/incremental` khi thiếu chỗ) |

Cài công cụ thiếu: `brew install cmake ninja protobuf`, `cargo install cargo-about --version 0.9.2 --locked`. Đóng Docker và các app nặng trước khi build.

## 2. Chuẩn bị mã nguồn

```bash
cd ~/Desktop/software_business/ai-translator
git checkout main && git pull
git status --short            # phải trống
pnpm install --frozen-lockfile
```

Chỉ phát hành từ **commit đã có CI xanh** trên GitHub (Actions › CI). Đồng thời kiểm văn bản pháp lý ở `docs/legal/` đã đúng phiên bản bạn muốn phát (app đóng gói bốn file đó).

## 3. Đặt số phiên bản

Mở `src-tauri/tauri.conf.json`, sửa dòng `"version"`:

- bản beta: `"0.1.0-beta.1"` (dạng `X.Y.Z-beta.N`);
- bản chính thức: `"0.1.0"` (dạng `X.Y.Z`).

Commit: `git commit -am "chore(release): 0.1.0-beta.1"`. Kiểm cấu hình phát hành (thay `v0.1.0-beta.1` cho khớp):

```bash
node scripts/release/release-ready.mjs --tag v0.1.0-beta.1
node scripts/release/release-ready.mjs --base-url https://releases.aitranslator.io.vn
```

Phải in `tag v0.1.0-beta.1 khớp tauri.conf.json` và `đủ cấu hình production`. Lệnh thứ hai kiểm `src-tauri/src/updater/source.rs` trỏ đúng `https://releases.aitranslator.io.vn`.

## 4. Chuẩn bị hai file mà bước build cần

`package-macos.sh` dừng ngay nếu thiếu một trong hai thứ này.

**a) Hai tiến trình phụ** `src-tauri/binaries/asr-worker-aarch64-apple-darwin` và `llama-server-aarch64-apple-darwin`. Nếu thư mục đã có hai file (từ lần build trước) và bạn **không** đổi phiên bản `whisper.cpp` hay `llama.cpp` (`scripts/release/versions.env`) thì giữ nguyên. Ngược lại (hoặc thư mục trống), dựng lại, mất khoảng 15 đến 40 phút:

```bash
scripts/release/build-sidecars-macos.sh
```

(Script xóa mọi file cũ trong `src-tauri/binaries/` rồi dựng và ký ad-hoc từng file. Sau đó bản dev cần `scripts/copy-sidecars.sh` nếu bạn muốn chạy lại.)

**b) `THIRD_PARTY_NOTICES.txt`** (danh sách giấy phép bên thứ ba, hiển thị trong màn hình Giới thiệu; file này không nằm trong git). Thiếu thì sinh:

```bash
pnpm install --frozen-lockfile --ignore-scripts
cargo fetch --locked
node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --llama-src target/release-work/llama.cpp
```

(`--llama-src` cần thư mục mã nguồn `llama.cpp` mà `build-sidecars-macos.sh` đã clone vào `target/release-work/llama.cpp`; nếu thư mục này không còn thì chạy lại script dựng tiến trình phụ ở mục 4a.)

## 5. Build `.dmg`

```bash
AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh
```

> **Biến `AI_TRANSLATOR_MAC_SIGNING=adhoc` là bắt buộc.** Thiếu nó, bản build bị coi là "không chính hãng" và chỉ chạy gói Free, dù khách đã mua (spec `2026-10-05-macos-adhoc-signing-design.md`).

Mất khoảng 3 đến 8 phút (nhiều hơn lần đầu, vì phải biên dịch app ở chế độ release). Script lần lượt: build giao diện, `tauri build`, kiểm bản đóng gói có đúng hai tiến trình phụ và đúng bảng SHA-256 của chúng, kiểm app không còn mã công tắc dev (`no-dev-gate`), ký ad-hoc (hardened runtime, entitlement thu âm thanh), tạo `.dmg`, kiểm dung lượng (≤ 60 MB) và ghi SHA-256.

Thành công khi dòng cuối có dạng `AI Translator_0.1.0-beta.1_aarch64.dmg: … byte (… MB)` và một dòng SHA-256. Kết quả nằm ở `target/release-out/`:

| File | Dùng làm gì |
|---|---|
| `AI Translator_<version>_aarch64.dmg` | **File cho khách tải** (khoảng 9 MB) |
| `SHA256SUMS-macos.txt` | Mã SHA-256 để đăng trên trang tải |
| `AI Translator.app.tar.gz` | Dành cho bản cập nhật tự động của CI, **không** dùng cho khách |

Thư mục `target/release-out/` còn các `.dmg` của lần build trước; chỉ lấy đúng file mang số phiên bản vừa build.

## 6. Kiểm bản vừa build

```bash
APP="target/release/bundle/macos/AI Translator.app"
codesign -dvvv "$APP" 2>&1 | grep -E "^Identifier=|^Signature|^TeamIdentifier"
codesign --verify --strict --deep -R "=identifier \"com.aitranslator.desktop\"" "$APP" && echo SELFCHECK_OK
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist"
shasum -a 256 "target/release-out/AI Translator_0.1.0-beta.1_aarch64.dmg"
cat target/release-out/SHA256SUMS-macos.txt
```

Phải thấy: `Identifier=com.aitranslator.desktop`, `Signature=adhoc`, `TeamIdentifier=not set`, `SELFCHECK_OK`, số phiên bản đúng (`0.1.0-beta.1`), và SHA-256 trùng với dòng trong `SHA256SUMS-macos.txt`.

## 7. Thử cài như một khách thật (đừng bỏ bước này)

1. Chép `.dmg` ra một thư mục khác (Desktop) và gắn cờ "tải từ internet" để mô phỏng việc tải về:
   ```bash
   cp "target/release-out/AI Translator_0.1.0-beta.1_aarch64.dmg" ~/Desktop/test.dmg
   xattr -w com.apple.quarantine "0081;$(printf %x $(date +%s));Safari;" ~/Desktop/test.dmg
   ```
2. Thoát AI Translator đang chạy, **xóa** `/Applications/AI Translator.app` (để thấy đúng trải nghiệm lần đầu).
3. Mở `test.dmg`, kéo app vào Applications, mở app, làm theo mục 8.
4. Kiểm: onboarding hiện bước **Điều khoản** (nút Tiếp xám tới khi tick), nhập key thì hiện đúng gói, dịch được, Cài đặt › Giới thiệu có thẻ "Điều khoản và quyền riêng tư". Log (`~/Library/Logs/com.aitranslator.desktop/app.log`) không có dòng "không chính hãng".

## 8. Cái khách phải làm khi cài (đưa vào trang tải)

> **Cài AI Translator trên Mac** (Apple Silicon: M1, M2, M3, M4; macOS 14.2 trở lên)
> 1. Mở file `.dmg`, kéo **AI Translator** vào thư mục **Applications**.
> 2. Mở AI Translator. macOS báo không xác minh được nhà phát triển: bấm **Done**.
> 3. Vào **System Settings › Privacy & Security**, kéo xuống cuối, bấm **Open Anyway** cạnh tên AI Translator, rồi xác nhận bằng mật khẩu hoặc Touch ID.
> 4. Lần đầu dịch, macOS hỏi quyền **ghi âm thanh hệ thống**: bấm cho phép. macOS có thể hỏi mật khẩu đăng nhập vài lần để dùng Keychain: chọn **Always Allow**.

Từ macOS 15, mẹo "bấm chuột phải rồi chọn Open" không còn dùng được; phải đi qua Privacy & Security. Mỗi lần khách **cập nhật** sang một bản ký ad-hoc khác, macOS hỏi lại khoảng 5 hộp thoại Keychain và 1 hộp thoại quyền thu âm (đã đo, `bench/phase1/results/gd1_adhoc_keychain.md`); app báo trước điều đó trong lời mời cập nhật.

## 9. Đăng lên web

File `.dmg` chỉ là một file tĩnh: đặt ở đâu cũng được. Chỗ hợp nhất là bucket R2 của dự án, cùng nơi các bản cập nhật sau này sẽ nằm:

```bash
VERSION=0.1.0-beta.1
FILE="target/release-out/AI Translator_${VERSION}_aarch64.dmg"
pnpm -C server exec wrangler r2 object put "ai-translator-releases/${VERSION}/AI Translator_${VERSION}_aarch64.dmg" \
  --file "$FILE" --content-type application/x-apple-diskimage --remote
pnpm -C server exec wrangler r2 object put "ai-translator-releases/${VERSION}/SHA256SUMS-macos.txt" \
  --file target/release-out/SHA256SUMS-macos.txt --content-type text/plain --remote
```

Địa chỉ tải: `https://releases.aitranslator.io.vn/<version>/AI%20Translator_<version>_aarch64.dmg` (khoảng trắng là `%20`). Nếu `wrangler` báo thiếu quyền R2 thì dùng `rclone` với token R2 của bucket như lúc đăng model.

Trang tải nên có: tên và số phiên bản, yêu cầu máy (Apple Silicon, macOS 14.2+), **mã SHA-256**, và hướng dẫn mục 8. Đừng tạo file `<version>/published.json`: đó là dấu của job `publish` trong CI báo "bản này đã đăng"; tạo tay thì CI sẽ bỏ qua bản đó.

Sau khi đăng, tải thử file từ chính địa chỉ đó rồi `shasum -a 256` so với `SHA256SUMS-macos.txt`.

## 10. Giới hạn của bản build tay

- **Không tự cập nhật.** Khóa ký bản cập nhật chỉ nằm trong CI (`environment release`), không nằm trên máy dev (thiết kế bảo mật, spec §10.2). Khách dùng bản build tay phải tải bản mới bằng tay một lần; từ bản phát qua CI (có `latest.json` trên R2) thì tự cập nhật.
- **Chưa notarize**, nên Gatekeeper cảnh báo (mục 8) và khách có thể ngại. Có Developer ID thì hết.
- **Chỉ có bản Apple Silicon.** Không có bản Intel; ghi rõ trên trang tải.
- Build trên máy dev kém "sạch" hơn build CI (từ tag đã commit, trên runner mới). Chấp nhận được cho beta; bản chính thức nên đi qua CI.

## 11. Khi gặp lỗi

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| `thiếu src-tauri/binaries/…: chạy scripts/release/build-sidecars-macos.sh trước` | Chưa có tiến trình phụ: làm mục 4a |
| `thiếu THIRD_PARTY_NOTICES.txt: chạy scripts/release/notices.mjs trước` | Làm mục 4b |
| Lệnh `notices.mjs` báo `thiếu --out <file>` | Phải truyền `--out THIRD_PARTY_NOTICES.txt` như mục 4b |
| App chạy nhưng chỉ có gói Free, báo "bản cài không chính hãng" | Quên `AI_TRANSLATOR_MAC_SIGNING=adhoc` ở mục 5: build lại |
| `release-ready` báo `EXTERNAL_HOSTS chưa có tên miền website` | Thiếu `"aitranslator.io.vn"` trong `src-tauri/src/navigation.rs` (đã có từ commit `88a9749`; `git pull`) |
| `release-ready` báo tag không khớp | Số `version` trong `tauri.conf.json` phải đúng `v<version>` của tag, kể cả đuôi `-beta.N` |
| Hết chỗ trống đĩa giữa chừng | Xóa `target/debug/incremental` và các `target/*/incremental` khác, build lại |
| Build chạy nền báo thất bại giả | Công cụ chạy nền đôi khi báo lỗi dù tiến trình vẫn chạy: xem `pgrep -fl package-macos` và tệp log trước khi kết luận |
| Mở app lần đầu bị hỏi Keychain nhiều lần | Bình thường với bản build mới (đổi mã băm chữ ký): bấm **Always Allow**, **không bấm Hủy** (Hủy làm app không đọc được bản quyền; thoát hẳn rồi mở lại) |

## 12. Danh sách kiểm trước khi phát

- [ ] CI xanh trên commit sẽ phát; `git status` sạch.
- [ ] Số phiên bản đã đặt, `release-ready --tag` và `--base-url` đều qua.
- [ ] Build bằng `AI_TRANSLATOR_MAC_SIGNING=adhoc`; `SELFCHECK_OK`; SHA-256 khớp.
- [ ] Đã thử cài như khách (mục 7): onboarding có bước Điều khoản, kích hoạt key, dịch được.
- [ ] Đã đăng lên R2 và tải thử lại, SHA-256 khớp.
- [ ] Trang tải có hướng dẫn mục 8, mã SHA-256, yêu cầu máy.
- [ ] Văn bản pháp lý `docs/legal/` đúng phiên bản; (khuyến nghị) đã có luật sư xem.
