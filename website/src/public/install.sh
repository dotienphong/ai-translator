#!/bin/bash
# Cài AI Translator trên macOS bằng một dòng lệnh:
#
#   curl -fsSL https://aitranslator.io.vn/install.sh | bash
#
# Kênh beta:      curl -fsSL https://aitranslator.io.vn/install.sh | bash -s -- --beta
# Xem trước khi chạy: tải file này về, đọc, rồi `bash install.sh`.
#
# Script làm gì (và chỉ làm vậy):
#   1. Kiểm máy: macOS 14.2 trở lên, chip Apple Silicon.
#   2. Đọc số phiên bản mới nhất ở https://releases.aitranslator.io.vn/<kênh>/latest.json.
#   3. Tải file .dmg của phiên bản đó và mã SHA-256 của nó từ cùng nơi, rồi đối chiếu.
#   4. Mở .dmg, kiểm app trong đó (đúng mã định danh, chữ ký còn nguyên), chép vào /Applications
#      (không có quyền ghi thì vào ~/Applications), đóng .dmg, xóa file tải về.
#   5. Mở AI Translator.
# Script không dùng sudo, không sửa gì ngoài thư mục cài và thư mục tạm của nó, không gửi dữ liệu nào đi.
#
# Vì sao app mở thẳng được: file tải bằng `curl` không bị macOS gắn cờ "tải từ internet" (quarantine), nên Gatekeeper
# không chặn bản chưa notarize. Script cũng gỡ cờ đó khỏi app vừa cài, phòng khi môi trường của bạn có gắn.
#
# Biến môi trường (không bắt buộc):
#   AI_TRANSLATOR_CHANNEL      stable (mặc định) hoặc beta; --beta cũng được
#   AI_TRANSLATOR_INSTALL_DIR  thư mục cài, mặc định /Applications (không ghi được thì ~/Applications)
#   AI_TRANSLATOR_NO_OPEN=1    cài xong không mở app
#   AI_TRANSLATOR_LANG         vi hoặc en: ép ngôn ngữ thông báo (mặc định theo ngôn ngữ của macOS)
#
# Toàn bộ script nằm trong hàm main và chỉ chạy ở dòng cuối: nếu đường truyền đứt giữa chừng khi `curl | bash`,
# bash không chạy một nửa script.

main() {
  set -eu

  BASE_URL="https://releases.aitranslator.io.vn"
  PRODUCT="AI Translator"
  BUNDLE_ID="com.aitranslator.desktop"

  # --- Ngôn ngữ thông báo: tiếng Việt khi hệ thống đặt tiếng Việt, ngược lại tiếng Anh ---
  # Tiếng Việt nếu danh sách ngôn ngữ của macOS có tiếng Việt hay vùng Việt Nam (người dùng ở Việt Nam hay để giao diện
  # tiếng Anh, vùng en-VN); Terminal thường vẫn đặt LANG=en_US nên không dựa vào LANG trước.
  syslangs=$(defaults read -g AppleLanguages 2>/dev/null || true)
  if printf '%s %s' "$syslangs" "${LC_ALL:-${LANG:-}}" | grep -Eiq '(^|[^a-z])vi([^a-z]|$)|-VN'; then LANGUI=vi; else LANGUI=en; fi
  case "${AI_TRANSLATOR_LANG:-}" in vi | en) LANGUI=$AI_TRANSLATOR_LANG ;; esac
  say() { if [ "$LANGUI" = vi ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
  fail() { printf '\n' >&2; if [ "$LANGUI" = vi ]; then printf 'Lỗi: %s\n' "$1" >&2; else printf 'Error: %s\n' "$2" >&2; fi; exit 1; }

  channel="${AI_TRANSLATOR_CHANNEL:-stable}"
  for arg in "$@"; do
    case "$arg" in
      --beta) channel=beta ;;
      --stable) channel=stable ;;
      -h | --help)
        say "Dùng: curl -fsSL https://aitranslator.io.vn/install.sh | bash [-s -- --beta]" \
          "Usage: curl -fsSL https://aitranslator.io.vn/install.sh | bash [-s -- --beta]"
        return 0
        ;;
      *) fail "tham số không hiểu: $arg" "unknown option: $arg" ;;
    esac
  done
  case "$channel" in stable | beta) ;; *) fail "kênh phải là stable hoặc beta" "channel must be stable or beta" ;; esac

  # --- 1. Kiểm máy ---
  [ "$(uname -s)" = Darwin ] || fail "script này chỉ dành cho macOS. Windows: xem aitranslator.io.vn/tai-xuong/" \
    "this script is for macOS only. Windows: see aitranslator.io.vn/en/download/"
  [ "$(id -u)" -ne 0 ] || fail "đừng chạy bằng sudo hay root; chạy lại bằng tài khoản thường của bạn." \
    "do not run this with sudo or as root; run it again as your normal user."
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] || fail \
    "AI Translator cần Mac chip Apple Silicon (M1 trở lên); chưa có bản cho Mac Intel." \
    "AI Translator needs an Apple Silicon Mac (M1 or later); there is no Intel Mac build yet."
  osver=$(sw_vers -productVersion)
  osmajor=${osver%%.*}
  osrest=${osver#*.}
  osminor=${osrest%%.*}
  [ "$osrest" != "$osver" ] || osminor=0
  if [ "$osmajor" -lt 14 ] || { [ "$osmajor" -eq 14 ] && [ "$osminor" -lt 2 ]; }; then
    fail "AI Translator cần macOS 14.2 trở lên (máy bạn đang là $osver)." \
      "AI Translator needs macOS 14.2 or later (this Mac runs $osver)."
  fi
  for tool in curl shasum hdiutil ditto codesign plutil xattr osascript; do
    command -v "$tool" >/dev/null 2>&1 || fail "thiếu lệnh $tool của macOS." "missing macOS tool: $tool"
  done

  # --- 2. Phiên bản mới nhất của kênh ---
  curl_opts="-fL --proto =https --tlsv1.2 --retry 3 --connect-timeout 15"
  say "Đang tìm phiên bản mới nhất ($channel)..." "Looking up the latest version ($channel)..."
  # shellcheck disable=SC2086
  manifest=$(curl $curl_opts -sS "$BASE_URL/$channel/latest.json" 2>/dev/null) || fail \
    "không đọc được $BASE_URL/$channel/latest.json (mất mạng, hoặc kênh $channel chưa có bản nào). Kiểm tra mạng và thử lại$([ "$channel" = stable ] && echo '; nếu bạn đang dùng bản beta thì thêm --beta')." \
    "could not read $BASE_URL/$channel/latest.json (no network, or the $channel channel has no release yet). Check your network and try again$([ "$channel" = stable ] && echo '; if you are on the beta, add --beta')."
  version=$(printf '%s' "$manifest" | plutil -extract version raw -o - - 2>/dev/null) || version=""
  printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$' || fail \
    "latest.json không có số phiên bản hợp lệ." "latest.json has no valid version number."

  dmg_name="${PRODUCT}_${version}_aarch64.dmg"
  dmg_url="$BASE_URL/$version/${dmg_name// /%20}"
  sums_url="$BASE_URL/$version/SHA256SUMS-macos.txt"

  # --- 3. Tải và kiểm SHA-256 ---
  work=$(mktemp -d "${TMPDIR:-/tmp}/ai-translator-install.XXXXXX")
  mnt="$work/mnt"
  mounted=0
  cleanup() {
    if [ "$mounted" -eq 1 ]; then hdiutil detach "$mnt" -quiet -force >/dev/null 2>&1 || true; fi
    rm -rf "$work"
  }
  trap cleanup EXIT
  trap 'exit 1' INT TERM HUP

  say "Đang tải $PRODUCT $version (khoảng 9 MB)..." "Downloading $PRODUCT $version (about 9 MB)..."
  # shellcheck disable=SC2086
  curl $curl_opts --progress-bar -S -o "$work/$dmg_name" "$dmg_url" || fail "không tải được $dmg_url" "could not download $dmg_url"
  # shellcheck disable=SC2086
  curl $curl_opts -sS -o "$work/SHA256SUMS-macos.txt" "$sums_url" || fail "không tải được $sums_url" "could not download $sums_url"
  expected=$(awk -v f="$dmg_name" '{ h = $1; $1 = ""; sub(/^ +\*?/, ""); if ($0 == f) { print h; exit } }' "$work/SHA256SUMS-macos.txt")
  printf '%s' "$expected" | grep -Eq '^[0-9a-f]{64}$' || fail "SHA256SUMS-macos.txt không có mã của $dmg_name." \
    "SHA256SUMS-macos.txt has no checksum for $dmg_name."
  actual=$(shasum -a 256 "$work/$dmg_name" | awk '{print $1}')
  [ "$actual" = "$expected" ] || fail "SHA-256 của file tải về không khớp (mong đợi $expected, nhận $actual). Không cài; thử lại, nếu vẫn lệch thì báo support@aitranslator.io.vn." \
    "the downloaded file's SHA-256 does not match (expected $expected, got $actual). Nothing was installed; retry, and if it still differs write to support@aitranslator.io.vn."
  say "Đã kiểm SHA-256: khớp." "SHA-256 checked: it matches."

  # --- 4. Mở .dmg, kiểm app, cài ---
  mkdir -p "$mnt"
  hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$mnt" "$work/$dmg_name" >/dev/null \
    || fail "không mở được file .dmg." "could not open the .dmg file."
  mounted=1
  src="$mnt/$PRODUCT.app"
  [ -d "$src" ] || fail "trong .dmg không có $PRODUCT.app." "the .dmg has no $PRODUCT.app."
  id=$(plutil -extract CFBundleIdentifier raw -o - "$src/Contents/Info.plist" 2>/dev/null || true)
  [ "$id" = "$BUNDLE_ID" ] || fail "app trong .dmg có mã định danh lạ ($id)." "the app in the .dmg has an unexpected identifier ($id)."
  codesign --verify --deep --strict "$src" 2>/dev/null || fail "chữ ký của app trong .dmg không còn nguyên vẹn." \
    "the app in the .dmg has a broken code signature."

  dest_dir="${AI_TRANSLATOR_INSTALL_DIR:-/Applications}"
  if [ ! -d "$dest_dir" ] || [ ! -w "$dest_dir" ]; then
    if [ -n "${AI_TRANSLATOR_INSTALL_DIR:-}" ]; then
      fail "không ghi được vào $dest_dir." "cannot write to $dest_dir."
    fi
    dest_dir="$HOME/Applications"
    mkdir -p "$dest_dir"
    say "Không ghi được vào /Applications, sẽ cài vào $dest_dir." "/Applications is not writable; installing to $dest_dir."
  fi
  dest="$dest_dir/$PRODUCT.app"
  upgrading=0
  [ -e "$dest" ] && upgrading=1

  # App đang chạy thì thay file giữa chừng làm hỏng phiên đó: đóng nó trước.
  running() { [ "$(osascript -e "application id \"$BUNDLE_ID\" is running" 2>/dev/null || echo false)" = true ]; }
  if running; then
    say "$PRODUCT đang chạy; đang đóng để cập nhật..." "$PRODUCT is running; quitting it to update..."
    # `with timeout`: app không trả lời sự kiện thoát thì không treo 2 phút (mặc định của Apple Events).
    osascript -e 'with timeout of 5 seconds' -e "tell application id \"$BUNDLE_ID\" to quit" -e 'end timeout' >/dev/null 2>&1 || true
    waited=0
    while running && [ "$waited" -lt 20 ]; do sleep 1; waited=$((waited + 1)); done
    ! running || fail "$PRODUCT vẫn đang chạy. Hãy thoát hẳn app (menu AI Translator trên thanh menu › Thoát) rồi chạy lại lệnh." \
      "$PRODUCT is still running. Quit it fully (AI Translator menu in the menu bar › Quit) and run the command again."
  fi

  say "Đang cài vào $dest_dir..." "Installing to $dest_dir..."
  staged="$dest_dir/.$PRODUCT.installing.$$"
  rm -rf "$staged"
  ditto "$src" "$staged" || { rm -rf "$staged"; fail "chép app thất bại." "copying the app failed."; }
  xattr -dr com.apple.quarantine "$staged" 2>/dev/null || true
  backup=""
  if [ "$upgrading" -eq 1 ]; then
    backup="$dest_dir/.$PRODUCT.previous.$$"
    mv "$dest" "$backup" || { rm -rf "$staged"; fail "không thay được bản cũ." "could not replace the old version."; }
  fi
  if ! mv "$staged" "$dest"; then
    [ -z "$backup" ] || mv "$backup" "$dest" || true
    rm -rf "$staged"
    fail "không đặt được app vào $dest." "could not place the app at $dest."
  fi
  [ -z "$backup" ] || rm -rf "$backup"
  if ! codesign --verify --deep --strict "$dest" 2>/dev/null; then
    fail "sau khi cài, chữ ký của app không còn nguyên vẹn." "after installing, the app's code signature is no longer intact."
  fi

  hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || hdiutil detach "$mnt" -quiet -force >/dev/null 2>&1 || true
  mounted=0

  say "Đã cài $PRODUCT $version tại $dest." "Installed $PRODUCT $version at $dest."
  if [ "$upgrading" -eq 1 ]; then
    say "Vì đây là bản cập nhật, macOS có thể hỏi mật khẩu đăng nhập (Keychain): nhập mật khẩu rồi chọn Always Allow." \
      "Because this is an update, macOS may ask for your login password (Keychain): enter it and choose Always Allow."
  fi

  # --- 5. Mở app ---
  if [ "${AI_TRANSLATOR_NO_OPEN:-0}" = 1 ]; then
    say "Mở app bằng Launchpad hoặc: open \"$dest\"" "Open the app from Launchpad or with: open \"$dest\""
    return 0
  fi
  say "Đang mở $PRODUCT..." "Opening $PRODUCT..."
  open "$dest" || fail "không mở được app; hãy mở thủ công từ $dest_dir." "could not open the app; open it from $dest_dir."
  say "" ""
  say "Lần đầu mở, macOS sẽ hỏi quyền ghi âm thanh hệ thống: chọn cho phép." \
    "On first launch macOS asks for system audio recording permission: choose Allow."
}

main "$@"
