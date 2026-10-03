#!/bin/sh
# Keychain tạm chứa chứng thư Developer ID Application cho CI (kế hoạch 07a; spec §10.2: khóa ký chỉ nằm trong secret của CI).
#
#   eval "$(scripts/release/macos-keychain.sh import)"   # đọc P12 (base64 của .p12) và P12_PASSWORD; in lệnh đặt
#                                                        # MT_SIGN_IDENTITY và MT_KEYCHAIN cho shell đang chạy
#   scripts/release/macos-keychain.sh delete             # xóa keychain tạm
#
# Keychain không vào danh sách tìm kiếm của người dùng: codesign tìm chứng thư qua `--keychain "$MT_KEYCHAIN"`
# (build-sidecars-macos.sh, package-macos.sh). Mật khẩu keychain ngẫu nhiên, chỉ sống trong lệnh `import`. CI nạp chứng thư
# ngay trước bước ký và xóa ngay sau đó, nên các bước biên dịch không bao giờ thấy chứng thư.
set -eu
tmp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
keychain="$tmp/release.keychain-db"
case "${1:-}" in
  import)
    pass=$(openssl rand -hex 24)
    security create-keychain -p "$pass" "$keychain"
    # File P12 tạm (mktemp: 0600) nằm trong thư mục tạm của job. Lỗi ở bất kỳ bước nào sau đây thì xóa keychain vừa tạo
    # và file P12 (N-2 của review cuối 07a: trước đây `security import` lỗi thì file P12 còn lại).
    cert=$(mktemp "$tmp/p12.XXXXXX")
    trap 'security delete-keychain "$keychain" 2>/dev/null || true; rm -f "$cert"' EXIT
    security set-keychain-settings -lut 3600 "$keychain"
    security unlock-keychain -p "$pass" "$keychain"
    printf '%s' "$P12" | base64 --decode >"$cert"
    security import "$cert" -f pkcs12 -k "$keychain" -P "$P12_PASSWORD" -T /usr/bin/codesign >/dev/null
    rm -f "$cert"
    security set-key-partition-list -S apple-tool:,apple: -s -k "$pass" "$keychain" >/dev/null
    identity=$(security find-identity -v -p codesigning "$keychain" |
      sed -n 's/^.*"\(Developer ID Application: [^"]*\)"$/\1/p' | head -n 1)
    if [ -z "$identity" ]; then
      echo "chứng thư trong P12 không phải Developer ID Application" >&2
      exit 1
    fi
    case "$identity" in
      *"'"*)
        echo "tên chứng thư có dấu nháy đơn" >&2
        exit 1
        ;;
    esac
    trap - EXIT
    printf "MT_SIGN_IDENTITY='%s'; MT_KEYCHAIN='%s'; export MT_SIGN_IDENTITY MT_KEYCHAIN\n" "$identity" "$keychain"
    ;;
  delete)
    if [ -e "$keychain" ]; then security delete-keychain "$keychain"; fi
    ;;
  *)
    echo "dùng: macos-keychain.sh import | delete" >&2
    exit 1
    ;;
esac
