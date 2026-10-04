#!/bin/sh
# Đóng gói bản phát hành macOS (arm64): `AI Translator.app` trong một `.dmg` (kế hoạch 07a; spec §6.11, §10.2, A6).
# Chạy sau build-sidecars-macos.sh (src-tauri/binaries/ có hai tiến trình phụ đã ký) và notices.mjs (THIRD_PARTY_NOTICES.txt).
#
#   scripts/release/package-macos.sh          # cả hai phần dưới đây
#   scripts/release/package-macos.sh build    # bước 1–2, không cần secret nào
#   scripts/release/package-macos.sh sign     # bước 3–6, sau `build`
#
# CI chạy `build` và `sign` ở hai job khác nhau, trên hai runner khác nhau: job `build` không có secret nào, job `sign`
# (environment `release`) không biên dịch gì, chỉ chạy script của repo và công cụ của hệ thống (spec §10.2, rủi ro chuỗi
# cung ứng; Q1 của review 07a lần 1). Job `sign` nhận `.app` qua artifact, đặt lại đúng chỗ rồi mới gọi phần này.
#
# Thứ tự, vì app kiểm SHA-256 của tiến trình phụ theo bảng build sẵn (build.rs):
#   1. `tauri build --no-sign`: bundler của Tauri ký lại mọi `externalBin` bằng `codesign --force` nếu được ký, làm SHA-256
#      đổi; nên Tauri không ký gì, tiến trình phụ đã ký sẵn ở build-sidecars-macos.sh.
#   2. Kiểm bản đóng gói: tiến trình phụ trong Contents/MacOS đúng từng byte như binaries/, không có thư viện lạ, và file
#      chạy của app mang bảng SHA-256 của chúng với tên sau khi đóng gói.
#   3. Ký app (không `--deep`, để chữ ký của tiến trình phụ giữ nguyên), hardened runtime với entitlement thu âm thanh
#      (src-tauri/release/entitlements.plist); kiểm lại bước 2.
#   4. Có thông tin notarize thì notarize app và staple.
#   5. Tạo `.dmg` (nén LZMA, có lối tắt Applications), ký, notarize và staple nếu có thông tin.
#   6. Kiểm dung lượng ≤ 60 000 000 byte (§6.11), ghi SHA-256 (§10.2), tạo `.app.tar.gz` cho bản cập nhật. Chữ ký bản cập
#      nhật (`.sig`) ký ở một job riêng (sign-updates.mjs), để khóa ký bản cập nhật không nằm chung với chứng thư Apple.
#
# Biến môi trường (CI đặt từ secret; không đặt thì bỏ qua bước tương ứng, bản ra chỉ dùng thử nội bộ):
#   MT_SIGN_IDENTITY        chứng thư Developer ID Application; không đặt thì ký ad-hoc
#   MT_KEYCHAIN             keychain chứa chứng thư đó (macos-keychain.sh); không đặt thì codesign tìm ở keychain mặc định
#   APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER   khóa App Store Connect API để notarize
#   MT_RELEASE_OUT          thư mục ra, mặc định target/release-out
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
triple=aarch64-apple-darwin
target="${CARGO_TARGET_DIR:-$root/target}"
identity="${MT_SIGN_IDENTITY:--}"
out="${MT_RELEASE_OUT:-$target/release-out}"
check="$root/scripts/release/release-check.mjs"
version=$(node -p "require('$root/src-tauri/tauri.conf.json').version")
product=$(node -p "require('$root/src-tauri/tauri.conf.json').productName")
app="$target/release/bundle/macos/$product.app"
dmg="$out/${product}_${version}_aarch64.dmg"

phase="${1:-all}"
case "$phase" in
  all | build | sign) ;;
  *)
    echo "phần không rõ: $phase (dùng build, sign, hoặc để trống)" >&2
    exit 1
    ;;
esac

for f in "asr-worker-$triple" "llama-server-$triple"; do
  if [ ! -f "$root/src-tauri/binaries/$f" ]; then
    echo "thiếu src-tauri/binaries/$f: chạy scripts/release/build-sidecars-macos.sh trước" >&2
    exit 1
  fi
done
if [ ! -f "$root/THIRD_PARTY_NOTICES.txt" ]; then
  echo "thiếu THIRD_PARTY_NOTICES.txt: chạy scripts/release/notices.mjs trước" >&2
  exit 1
fi

notarize() {
  if [ -z "${APPLE_API_KEY_PATH:-}" ]; then
    echo "chưa có khóa notarize: bỏ qua notarize $1"
    return 0
  fi
  xcrun notarytool submit "$1" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
  xcrun stapler staple "$2"
  xcrun stapler validate "$2"
}

sign() {
  if [ "$identity" = "-" ]; then
    codesign --force --sign - "$@"
  else
    codesign --force --sign "$identity" ${MT_KEYCHAIN:+--keychain "$MT_KEYCHAIN"} --timestamp "$@"
  fi
}

if [ "$phase" != "sign" ]; then
  echo "== tauri build (không ký)"
  (cd "$root" && pnpm tauri build --ci --no-sign --bundles app --config src-tauri/release/tauri.macos.json -- --locked)
  node "$check" bundle "$root/src-tauri/binaries" "$app/Contents/MacOS" --target "$triple"
  node "$check" embedded "$root/src-tauri/binaries" "$app/Contents/MacOS/meeting-translator" --target "$triple"
  node "$check" no-dev-gate "$app/Contents/MacOS/meeting-translator"
  if [ "$phase" = "build" ]; then
    exit 0
  fi
elif [ ! -d "$app" ]; then
  echo "thiếu $app: chạy package-macos.sh build trước" >&2
  exit 1
fi

# Cổng chống Pro trái phép (spec 2026-10-04, §3): app đã build ở job khác cũng phải sạch mã công tắc dev trước khi ký.
node "$check" no-dev-gate "$app/Contents/MacOS/meeting-translator"
echo "== ký app"
sign --options runtime --entitlements "$root/src-tauri/release/entitlements.plist" "$app"
codesign --verify --strict --deep "$app"
codesign -dv "$app" 2>&1 | grep -E '^(Identifier=|CodeDirectory |TeamIdentifier=)'
node "$check" bundle "$root/src-tauri/binaries" "$app/Contents/MacOS" --target "$triple"
# Phần `sign` nhận `.app` từ artifact của job khác: kiểm lại app nhúng đúng bảng SHA-256 của tiến trình phụ mà job này ký
# (N-A của review 07a lần 3), để `.app` của một bộ tiến trình phụ khác không đi tiếp tới notarize.
node "$check" embedded "$root/src-tauri/binaries" "$app/Contents/MacOS/meeting-translator" --target "$triple"
mkdir -p "$out"
if [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  ditto -c -k --keepParent "$app" "$out/app-notarize.zip"
  notarize "$out/app-notarize.zip" "$app"
  rm "$out/app-notarize.zip"
fi

echo "== dmg"
stage="$out/dmg-stage"
rm -rf "$stage" "$dmg"
mkdir -p "$stage"
ditto "$app" "$stage/$product.app"
ln -s /Applications "$stage/Applications"
hdiutil create -quiet -volname "$product" -srcfolder "$stage" -fs HFS+ -format ULMO "$dmg"
rm -rf "$stage"
hdiutil verify -quiet "$dmg"
if [ "$identity" != "-" ]; then
  sign "$dmg"
  notarize "$dmg" "$dmg"
fi
node "$check" size "$dmg" --max-bytes 60000000
node "$check" sha256sums "$dmg" --out "$out/SHA256SUMS-macos.txt"

echo "== bản cập nhật (.app.tar.gz, ký chữ ký ở sign-updates.mjs)"
tar -czf "$out/$product.app.tar.gz" -C "$(dirname "$app")" "$product.app"
ls "$out"
