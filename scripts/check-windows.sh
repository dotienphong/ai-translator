#!/bin/sh
# Kiểm kiểu và clippy phần code Windows của app ngay trên Mac (R1 của kế hoạch 00), vì chưa có máy
# Windows. Chỉ kiểm được là code biên dịch được; hành vi thật (khay, Alt+F4, thanh phụ đề topmost,
# Credential Manager, WASAPI loopback, Job Object) vẫn phải thử trên Windows.
# Cần một lần: rustup target add x86_64-pc-windows-msvc
# Tham số thêm được chuyển cho cargo (ví dụ `--locked`).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
# tauri-build gọi trình biên dịch resource (xem fake-llvm-rc).
export RC_x86_64_pc_windows_msvc="$here/fake-llvm-rc"
# onig_sys (candle-core → tokenizers) muốn biên dịch thư viện C oniguruma cho Windows (xem fake-pkg-config).
export PKG_CONFIG_x86_64_pc_windows_msvc="$here/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1
# rusqlite trên Windows (bundled-sqlcipher-vendored-openssl) muốn biên dịch SQLCipher và OpenSSL bằng công cụ của MSVC,
# mà Mac không có. Kiểm kiểu thì không cần thư viện thật:
# - libsqlite3-sys: LIBSQLITE3_SYS_USE_PKG_CONFIG=1 và SQLCIPHER_LIB_DIR thì chỉ in lệnh link, dùng binding có sẵn;
# - openssl-sys: OPENSSL_NO_VENDOR=1 thì không build OpenSSL từ mã nguồn, mà đọc phiên bản trong header của OPENSSL_DIR
#   (header giả ghi 3.6.3, đúng bản `openssl-src` khóa trong Cargo.lock), tiền xử lý bằng clang của Xcode;
#   OPENSSL_STATIC=1 để nó không đi tìm file thư viện.
# `cargo clippy` không link, nên thư viện giả không bao giờ được dùng.
fake_ssl="${TMPDIR:-/tmp}/meeting-translator-fake-openssl"
mkdir -p "$fake_ssl/include/openssl" "$fake_ssl/lib"
printf '#define OPENSSL_VERSION_MAJOR 3\n#define OPENSSL_VERSION_MINOR 6\n#define OPENSSL_VERSION_PATCH 3\n' \
  > "$fake_ssl/include/openssl/opensslv.h"
: > "$fake_ssl/include/openssl/opensslconf.h"
export OPENSSL_NO_VENDOR=1 OPENSSL_DIR="$fake_ssl" OPENSSL_STATIC=1 CC_x86_64_pc_windows_msvc=clang
export LIBSQLITE3_SYS_USE_PKG_CONFIG=1 SQLCIPHER_LIB_DIR="$fake_ssl/lib"
cargo clippy -p meeting-translator -p pipeline -p audio-capture --target x86_64-pc-windows-msvc --all-targets "$@" \
  -- -D warnings
