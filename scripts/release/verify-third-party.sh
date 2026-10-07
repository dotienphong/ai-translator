#!/bin/sh
# Kiểm `third_party/` (whisper.cpp 1.8.3 trong whisper-rs-sys, và whisper-rs) đúng bằng hai crate gốc trên crates.io, với
# SHA-256 đã khóa, cộng ba bản vá trong `third_party/patches/` (spec §10.2: whisper.cpp build từ mã nguồn đã khóa, có
# kiểm checksum). Dựng lại theo `third_party/README.md` trong thư mục tạm, rồi so từng file mà git theo dõi trong
# `third_party/whisper-rs-sys` và `third_party/whisper-rs` (bản trong cây làm việc; CI checkout đúng commit đang build).
#
#   scripts/release/verify-third-party.sh
#
# Lấy file .crate trong cache của cargo nếu có, không thì tải từ static.crates.io. Hai mã SHA-256 phải khớp README.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/rebuilt/third_party" "$tmp/committed"

fetch() {
  name=$1
  version=$2
  sha=$3
  file="$tmp/$name-$version.crate"
  cached=""
  for candidate in "${CARGO_HOME:-$HOME/.cargo}"/registry/cache/*/"$name-$version.crate"; do
    if [ -f "$candidate" ]; then
      cached=$candidate
      break
    fi
  done
  if [ -n "$cached" ]; then
    cp "$cached" "$file"
  else
    curl -sSfL -o "$file" "https://static.crates.io/crates/$name/$name-$version.crate"
  fi
  actual=$(shasum -a 256 "$file" | cut -d ' ' -f 1)
  if [ "$actual" != "$sha" ]; then
    echo "$name $version: SHA-256 $actual, README khóa $sha" >&2
    exit 1
  fi
  tar xzf "$file" -C "$tmp/rebuilt/third_party"
  mv "$tmp/rebuilt/third_party/$name-$version" "$tmp/rebuilt/third_party/$name"
  rm "$tmp/rebuilt/third_party/$name/.cargo_vcs_info.json"
}

# Hai mã SHA-256 lấy đúng từ khối "Dựng lại từ đầu" của README, để README và script không lệch nhau.
sha_of() {
  sed -n "s/^\([0-9a-f]\{64\}\)  third_party\/$1\$/\1/p" "$root/third_party/README.md"
}
fetch whisper-rs-sys 0.15.0 "$(sha_of whisper-rs-sys-0.15.0.crate)"
fetch whisper-rs 0.16.0 "$(sha_of whisper-rs-0.16.0.crate)"
(cd "$tmp/rebuilt" && git apply --directory=third_party "$root/third_party/patches/0001-whisper-cpp-set-audio-ctx.patch" \
  && git apply --directory=third_party "$root/third_party/patches/0002-whisper-rs-set-audio-ctx.patch" \
  && git apply --directory=third_party "$root/third_party/patches/0003-whisper-rs-sys-msvc-optimization-flags.patch")

(cd "$root" && git ls-files -z third_party/whisper-rs-sys third_party/whisper-rs | xargs -0 tar -cf -) |
  tar -x -C "$tmp/committed"
if diff -r "$tmp/rebuilt/third_party" "$tmp/committed/third_party" >"$tmp/diff.txt"; then
  echo "third_party khớp whisper-rs-sys 0.15.0 và whisper-rs 0.16.0 trên crates.io cộng ba bản vá"
else
  head -n 40 "$tmp/diff.txt" >&2
  echo "third_party khác bản dựng lại từ crates.io (xem diff ở trên)" >&2
  exit 1
fi
