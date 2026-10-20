#!/bin/sh
# Đo CƠ CHẾ (không cần app): vì sao app ký ad-hoc bị hỏi Keychain sau mỗi bản, và vì sao một chương trình không đổi thì không.
# Mọi lệnh đọc đều tắt hộp thoại (kc.c) hoặc có đồng hồ báo thức, nên không bao giờ treo máy hay bật hộp thoại trên màn hình.
# Mục thử có service riêng, xóa khi xong. Kết quả mong đợi in ở cuối mỗi dòng; thoát khác 0 nếu có kết quả lệch.
set -u
[ "$(uname)" = Darwin ] || { echo "chỉ chạy trên macOS"; exit 2; }
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work" || exit 2
fails=0
guard() { perl -e 'alarm 20; exec @ARGV' "$@"; }
cdhash() { codesign -dvvv "$1" 2>&1 | sed -n 's/^CDHash=//p' | cut -c1-12; }
build() { # $1 tên file, $2 BUILD_ID, $3 identifier
  clang -arch arm64 -DBUILD_ID="\"$2\"" -o "$1" "$here/kc.c" -framework Security -framework CoreFoundation \
    -Wno-deprecated-declarations 2>/dev/null && codesign --force -s - --identifier "$3" "$1" 2>/dev/null
}
check() { # $1 nhãn, $2 chuỗi mong đợi, $3 kết quả thật
  case "$3" in
    *"$2"*) echo "   PASS  $1: $3" ;;
    *) echo "   FAIL  $1: mong đợi '$2', được '$3'"; fails=$((fails + 1)) ;;
  esac
}
id=com.aitranslator.kctest
svc="at-bench-$$"

echo "== 1) ad-hoc: hai bản build khác nhau (như hai bản app liên tiếp)"
build a1 1 $id && build a2 2 $id || { echo "không biên dịch được (cần clang)"; exit 2; }
echo "   cdhash a1=$(cdhash a1) a2=$(cdhash a2)"
./a1 write "$svc-1" acct secret >/dev/null
check "cùng bản đọc lại" "status=0" "$(./a1 read "$svc-1" acct)"
check "bản khác đọc (macOS sẽ hỏi)" "status=-25293" "$(./a2 read "$svc-1" acct)"
./a1 delete "$svc-1" acct >/dev/null

echo "== 2) file không đổi byte (như helper đóng băng): biên dịch ở hai thư mục, chép, ký lại"
mkdir -p h1 h2 h3
cp "$here/kc.c" h1/kc.c && cp "$here/kc.c" h2/kc.c
for d in h1 h2; do
  (cd $d && clang -arch arm64 -O2 -o kh kc.c -framework Security -framework CoreFoundation -Wno-deprecated-declarations 2>/dev/null)
  codesign --force -s - --identifier com.aitranslator.keystore-helper $d/kh 2>/dev/null
done
cp h1/kh h3/kh-copy && codesign --force -s - --identifier com.aitranslator.keystore-helper h3/kh-copy 2>/dev/null
check "cùng cdhash sau khi biên dịch lại" "$(cdhash h1/kh)" "$(cdhash h2/kh)"
check "cùng cdhash sau khi chép và ký lại" "$(cdhash h1/kh)" "$(cdhash h3/kh-copy)"
h1/kh write "$svc-2" acct secret >/dev/null
check "bản biên dịch lại đọc mục của bản gốc" "status=0" "$(h2/kh read "$svc-2" acct)"
check "bản chép/ký lại đọc" "status=0" "$(h3/kh-copy read "$svc-2" acct)"
h1/kh delete "$svc-2" acct >/dev/null

echo "== 3) /usr/bin/security gọi từ hai 'app' có cdhash khác nhau (mục do security tạo)"
for n in 1 2; do
  clang -arch arm64 -DBUILD_ID="\"$n\"" -o par$n "$here/spawn.c" 2>/dev/null && codesign --force -s - --identifier com.aitranslator.desktop par$n 2>/dev/null
done
echo "   cdhash par1=$(cdhash par1) par2=$(cdhash par2)"
value=$(head -c 4500 /dev/urandom | base64 | tr -d '\n')
guard ./par1 add-generic-password -U -s "$svc-3" -a acct -w "$value" >/dev/null
r1=$(guard ./par1 find-generic-password -s "$svc-3" -a acct -w); r2=$(guard ./par2 find-generic-password -s "$svc-3" -a acct -w)
[ "$r1" = "$value" ] && check "app 1 đọc (không treo, khớp ${#value} ký tự)" "ok" "ok" || check "app 1 đọc" "khớp" "lệch"
[ "$r2" = "$value" ] && check "app 2 (cdhash khác) đọc (không treo, khớp)" "ok" "ok" || check "app 2 đọc" "khớp" "lệch hoặc treo"
guard security find-generic-password -s "$svc-3-none" -a acct -w >/dev/null 2>&1
check "mục không có thì mã thoát" "44" "$?"
guard security delete-generic-password -s "$svc-3" -a acct >/dev/null 2>&1

echo "== 4) liệt kê mục cũ (chỉ thuộc tính) từ bản khác: không hỏi; đọc bí mật vẫn hỏi"
./a1 write "$svc-4" vault s1 >/dev/null; ./a1 write "$svc-4" license s2 >/dev/null
check "bản khác liệt kê" "mục=2 (OK, không hỏi)" "$(./a2 search "$svc-4" x)"
check "bản khác đọc bí mật" "status=-25293" "$(./a2 read "$svc-4" vault)"
./a1 delete "$svc-4" vault >/dev/null; ./a1 delete "$svc-4" license >/dev/null

left=$(security dump-keychain "$HOME/Library/Keychains/login.keychain-db" 2>/dev/null | grep -c "$svc")
check "không còn mục thử trong login keychain" "0" "$left"
[ "$fails" -eq 0 ] && echo "TẤT CẢ ĐẠT" || echo "$fails KẾT QUẢ LỆCH"
exit "$fails"
