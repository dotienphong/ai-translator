#!/bin/sh
# Đọc `.env` của bản dev (spec 2026-10-04, §2.3) và in ra stdout các dòng `KEY=VALUE` có KEY nằm trong danh sách cho phép.
# KHÔNG `source` file: nội dung `.env` không bao giờ được chạy như lệnh shell. Khóa lạ bị bỏ qua và chỉ báo tên khóa ở
# stderr (không in giá trị, vì `.env` có thể chứa thứ khác). Giá trị chuyển nguyên văn; app tự quyết (`pro.rs` chỉ coi
# đúng `true` là bật).
# - Tên khóa phải khớp `[A-Za-z_][A-Za-z0-9_]*` trước, rồi so SÁT NGUYÊN CHỮ với từng khóa cho phép.
# - Khóa cho phép xuất hiện nhiều lần thì chỉ giữ lần CUỐI (đúng cái `open --env` của macOS dùng), để biểu ngữ cảnh báo của
#   run-dev-app.sh không lệch với app. Kết quả in một lượt ở cuối.
# - AI_TRANSLATOR_DEV_PRO có giá trị không phải đúng `true`/`false` vẫn được chuyển nguyên văn, kèm cảnh báo ở stderr
#   (không in giá trị).
#
#   sh scripts/read-dev-env.sh .env
set -eu
LC_ALL=C
export LC_ALL
file=${1:-}
if [ -z "$file" ] || [ ! -f "$file" ]; then
  exit 0
fi
allowed="AI_TRANSLATOR_DEV_PRO"
result=""
nl='
'

is_allowed() {
  for name in $allowed; do
    if [ "$1" = "$name" ]; then return 0; fi
  done
  return 1
}

# In `$result` bỏ các dòng của khóa $1 (để lần xuất hiện sau thay lần trước).
without_key() {
  printf '%s' "$result" | while IFS= read -r kept || [ -n "$kept" ]; do
    case "$kept" in
      "$1="*) ;;
      *) printf '%s\n' "$kept" ;;
    esac
  done
}

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
  case "$key" in
    '' | [!A-Za-z_]* | *[!A-Za-z0-9_]*)
      echo "bỏ qua một dòng .env có tên khóa không hợp lệ" >&2
      continue
      ;;
  esac
  if ! is_allowed "$key"; then
    echo "bỏ qua khóa .env không được phép: $key" >&2
    continue
  fi
  result=$(without_key "$key")
  result="${result:+$result$nl}$key=$value"
done <"$file"

if [ -n "$result" ]; then
  printf '%s\n' "$result"
  case "$nl$result$nl" in
    *"${nl}AI_TRANSLATOR_DEV_PRO=true$nl"* | *"${nl}AI_TRANSLATOR_DEV_PRO=false$nl"*) ;;
    *"${nl}AI_TRANSLATOR_DEV_PRO="*)
      echo 'AI_TRANSLATOR_DEV_PRO có giá trị lạ (chỉ đúng "true" mới bật Pro giả lập): coi như tắt' >&2
      ;;
  esac
fi
