#!/bin/sh
# Kiểm package không có mã mạng (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §10: speaker-worker chỉ nói chuyện với app qua
# stdin/stdout). Bốn lớp, mỗi lớp rẻ, báo mọi lớp hỏng rồi mới thoát mã 1:
#   1. cây phụ thuộc lúc chạy (`cargo tree -e normal`, macOS arm64 và Windows x64) không có crate mạng;
#   2. không bật feature mạng của `windows`/`windows-sys` (cờ feature không hiện thành tên crate);
#   3. mã nguồn của package không nhắc API mạng của std, libc, rustix, Windows (kể cả trong chú thích: đừng viết tên API mạng
#      trong chú thích của các crate này);
#   4. (`--binary <file>`, macOS, sau khi build release) binary không nhập hàm socket nào (`nm -u`; Rust trên macOS bỏ phần
#      `std::net` không dùng khi liên kết).
# Chỉ đọc metadata và file, không build.
#
#   scripts/release/check-no-network.sh [--binary <file>] [package...]
# Không có gì: lớp 1–3 cho speaker-worker và speaker-protocol. Chỉ `--binary`: chỉ lớp 4, không gọi cargo (job ký của
# release.yml không cài Rust).
#
# `NO_NETWORK_SRC_ROOT` (mặc định gốc repo): nơi tìm `crates/<package>/src` cho lớp 3; chỉ để tự kiểm script trên bản sao tạm.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
src_root=${NO_NETWORK_SRC_ROOT:-$root}
binary=""
if [ "${1:-}" = "--binary" ]; then
  binary=$2
  shift 2
fi
if [ "$#" -eq 0 ] && [ -z "$binary" ]; then
  set -- speaker-worker speaker-protocol
fi
banned_crates='^(reqwest|hyper|hyper-util|h2|h3|ureq|tokio|mio|socket2|rustls|native-tls|openssl|openssl-sys|curl|curl-sys|isahc|attohttpc|tungstenite|quinn)$'
banned_src='std::net|TcpStream|TcpListener|UdpSocket|ToSocketAddrs|\bsocket\(|\bconnect\(|getaddrinfo|rustix::net|Win32_Networking|WinHttp|WinINet'
fail=0
for pkg in "$@"; do
  for target in aarch64-apple-darwin x86_64-pc-windows-msvc; do
    # Gán riêng: `cargo tree` lỗi (tên package sai…) thì `set -e` dừng script, không lặng lẽ coi là sạch.
    tree=$(cd "$root" && cargo tree --locked -p "$pkg" -e normal --target "$target" --prefix none --format '{p}')
    bad=$(printf '%s\n' "$tree" | awk '{print $1}' | sort -u | grep -E "$banned_crates" || true)
    if [ -n "$bad" ]; then
      echo "$pkg ($target): crate mạng trong cây phụ thuộc: $(printf '%s' "$bad" | tr '\n' ' ')" >&2
      fail=1
    fi
  done
  features=$(cd "$root" && cargo tree --locked -p "$pkg" -e features --target x86_64-pc-windows-msvc)
  feat=$(printf '%s\n' "$features" | grep -oE 'Win32_Networking[A-Za-z_]*' | sort -u || true)
  if [ -n "$feat" ]; then
    echo "$pkg: feature mạng của windows/windows-sys: $(printf '%s' "$feat" | tr '\n' ' ')" >&2
    fail=1
  fi
  if [ ! -d "$src_root/crates/$pkg/src" ]; then
    echo "$pkg: không thấy $src_root/crates/$pkg/src" >&2
    fail=1
  else
    hits=$(grep -rnE "$banned_src" "$src_root/crates/$pkg/src" || true)
    if [ -n "$hits" ]; then
      echo "$pkg: mã nguồn nhắc API mạng:" >&2
      printf '%s\n' "$hits" >&2
      fail=1
    fi
  fi
done
if [ -n "$binary" ]; then
  syms=$(nm -u "$binary" | grep -E '^_(socket|connect|getaddrinfo|sendto|recvfrom|sendmsg|recvmsg|bind|listen|accept)$' || true)
  if [ -n "$syms" ]; then
    echo "$binary nhập hàm mạng: $(printf '%s' "$syms" | tr '\n' ' ')" >&2
    fail=1
  fi
fi
if [ "$fail" -ne 0 ]; then
  exit 1
fi
what=""
if [ "$#" -gt 0 ]; then
  what="$* (cây phụ thuộc hai nền tảng, feature Windows, mã nguồn)"
fi
if [ -n "$binary" ]; then
  what="${what:+$what; }binary $binary"
fi
echo "không có mã mạng: $what"
