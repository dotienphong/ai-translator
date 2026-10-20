#!/bin/sh
# Đo trên CHÍNH mã của app (`Keystore::os`), giả lập các bản cập nhật bằng ba bản sao của binary test có `cdhash` khác nhau
# (ký ad-hoc cùng một file với ba `identifier`). Chạy trên Keychain thật của người chạy, bằng service thử riêng, dọn khi xong.
# Nếu macOS hỏi hộp thoại thì bước đó treo và bị cắt sau 60 giây (in "TREO"); không bao giờ treo mãi.
#
#   A) chuỗi cập nhật qua kho mới: bản 1 ghi, bản 2 và 3 đọc (kỳ vọng: không hỏi).
#   B) di trú: bản 1 tạo mục cũ bằng API Keychain (như bản 0.1.x) rồi di trú; bản 2 và 3 đọc lại và KHÔNG được mở kho cũ.
#
# Dùng: bench/2026-10-20-keychain-security-cli/run.sh [đường-dẫn-binary-test]
# Không có đối số thì tự dựng: cargo test -p meeting-translator --lib --no-run.
set -u
[ "$(uname)" = Darwin ] || { echo "chỉ chạy trên macOS"; exit 2; }
root=$(cd "$(dirname "$0")/../.." && pwd)
orig=$PWD
bin="${1:-}"
if [ -n "$bin" ]; then
  # Đối số tương đối thì tính từ thư mục đang đứng.
  case "$bin" in /*) ;; *) bin="$orig/$bin" ;; esac
else
  bin=$(cd "$root" && cargo test --locked -p meeting-translator --lib --no-run 2>&1 | sed -n 's/.*Executable unittests src\/lib.rs (\(.*\))/\1/p' | head -1)
  # Không đặt CARGO_TARGET_DIR tuyệt đối thì cargo in đường dẫn tương đối so với thư mục workspace; phải đổi sang tuyệt đối vì
  # bước sau `cd` sang thư mục tạm.
  case "$bin" in /*) ;; *) bin="$root/$bin" ;; esac
fi
[ -x "$bin" ] || { echo "không tìm thấy binary test: $bin"; exit 2; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work" || exit 2
fails=0
for n in 1 2 3; do
  cp -c "$bin" probe$n 2>/dev/null || cp "$bin" probe$n
  codesign --force -s - -i com.aitranslator.probe.$n probe$n 2>/dev/null
done
for n in 1 2 3; do echo "bản $n: CDHash=$(codesign -dvvv probe$n 2>&1 | sed -n 's/^CDHash=//p' | cut -c1-16)"; done

run() { # $1 service, $2 binary, $3 mode
  out=$(PROBE_SERVICE="$1" PROBE_MODE="$3" perl -e 'alarm 60; exec @ARGV' "./$2" \
    security::keystore::tests::os_keystore_probe --ignored --exact 2>&1)
  rc=$?
  if [ $rc -eq 0 ]; then echo "   PASS  $2 $3"; else
    [ $rc -eq 142 ] && echo "   FAIL  $2 $3: TREO (macOS đã hỏi?)" || { echo "   FAIL  $2 $3: lỗi rc=$rc"; echo "$out" | grep -E "panicked|assert" | head -3; }
    fails=$((fails + 1))
  fi
}

svc_a="com.aitranslator.desktop.test.probe-a-$$"
svc_b="com.aitranslator.desktop.test.probe-b-$$"
echo "== A) chuỗi cập nhật qua kho mới (service $svc_a)"
run "$svc_a" probe1 write
run "$svc_a" probe2 read
run "$svc_a" probe3 read
echo "== B) di trú rồi cập nhật (service $svc_b)"
run "$svc_b" probe1 seed-legacy
run "$svc_b" probe1 read-migrated
run "$svc_b" probe2 read-migrated
run "$svc_b" probe3 read-migrated
echo "== dọn"
run "$svc_a" probe3 clean
run "$svc_b" probe3 clean
run "$svc_b" probe1 clean-legacy # mục cũ chỉ bản 1 (người tạo) xóa được mà không bị hỏi
left=$(security dump-keychain "$HOME/Library/Keychains/login.keychain-db" 2>/dev/null | grep -c "probe-[ab]-$$")
if [ "$left" -eq 0 ]; then echo "   PASS  không còn mục thử"; else echo "   FAIL  còn $left dòng mục thử trong login keychain"; fails=$((fails + 1)); fi
[ "$fails" -eq 0 ] && echo "TẤT CẢ ĐẠT" || echo "$fails BƯỚC LỆCH"
exit "$fails"
