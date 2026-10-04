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
