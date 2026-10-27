#!/bin/sh
# Build ba tiến trình phụ của bản phát hành macOS (arm64) từ mã nguồn đã khóa, rồi chép vào src-tauri/binaries/ (kế hoạch
# 07a; spec §6.11, §6.12, §10.2):
#   - asr-worker: whisper.cpp 1.8.3 đã vá trong third_party/, link tĩnh, Metal, shared-encode (dòng 119 của kế hoạch 00);
#   - llama-server: llama.cpp ở commit khóa trong versions.env, build tĩnh (Metal nhúng sẵn shader, GGML_NATIVE=OFF, mức CPU
#     như asr-worker), không web UI, không HTTPS; không có .dylib đi kèm (dòng 211 của kế hoạch 00);
#   - speaker-worker: nhận giọng người nói (Rust thuần, candle, không ggml), macOS tối thiểu 14.2 như asr-worker;
# Rồi kiểm mọi thư viện mà hai file nạp đều là của hệ thống, macOS tối thiểu đúng 14.2 (không cao hơn, cũng không thấp hơn), và
# không liên kết cứng với API chỉ có từ macOS mới hơn (`release-check.mjs deps-macos`).
#
# Ký: đặt MT_SIGN_IDENTITY (ví dụ "Developer ID Application: <tên> (<Team ID>)") thì ký từng file với hardened runtime và
# timestamp; không đặt thì ký ad-hoc. Phải ký trước khi build app: build.rs băm file trong binaries/, và nếu bundler của
# Tauri ký lại thì SHA-256 đổi (vì vậy package-macos.sh build bằng `tauri build --no-sign`).
#
#   scripts/release/build-sidecars-macos.sh              # build, chép, ký, kiểm
#   scripts/release/build-sidecars-macos.sh --sign-only  # chỉ ký lại file đã có trong binaries/ rồi kiểm
#
# CI build trước (ký ad-hoc, keychain chưa có chứng thư), rồi mới nạp chứng thư và chạy `--sign-only`, để build script của
# các crate không chạy lúc chứng thư đang mở (spec §10.2, rủi ro chuỗi cung ứng).
#
# Thư mục làm việc: $MT_RELEASE_WORK (mặc định target/release-work). Script xóa mọi file cũ trong src-tauri/binaries/; bản
# dev cần chạy lại scripts/copy-sidecars.sh sau đó.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
# shellcheck source=scripts/release/versions.env
. "$root/scripts/release/versions.env"
triple=aarch64-apple-darwin
work="${MT_RELEASE_WORK:-$root/target/release-work}"
target="${CARGO_TARGET_DIR:-$root/target}"
out="$root/src-tauri/binaries"
identity="${MT_SIGN_IDENTITY:--}"
mkdir -p "$work"

sign_and_check() {
  for name in asr-worker llama-server speaker-worker; do
    file="$out/$name-$triple"
    if [ "$identity" = "-" ]; then
      codesign --force --sign - --options runtime --identifier "com.aitranslator.desktop.$name" "$file"
    else
      codesign --force --sign "$identity" ${MT_KEYCHAIN:+--keychain "$MT_KEYCHAIN"} --options runtime --timestamp \
        --identifier "com.aitranslator.desktop.$name" "$file"
    fi
    codesign --verify --strict "$file"
  done
  node "$root/scripts/release/release-check.mjs" deps-macos "$out"/*
  node "$root/scripts/release/release-check.mjs" table "$out" --target "$triple"
  "$root/scripts/release/check-no-network.sh" --binary "$out/speaker-worker-$triple"
}

if [ "${1:-}" = "--sign-only" ]; then
  sign_and_check
  exit 0
fi

echo "== asr-worker (metal, shared-encode)"
# Phải đặt trước cargo build: whisper-rs-sys (cc-rs/cmake) lấy mục tiêu biên dịch của ggml từ biến này, không có thì rơi về bản SDK
# của máy dựng. Khi đó ggml-metal liên kết cứng với MTLResidencySetDescriptor (chỉ có từ macOS 15), các khối @available bị gộp thành
# luôn-đúng, và dyld từ chối nạp asr-worker trên macOS 14 (báo cáo R-7048-CH57). Giữ cùng giá trị với LSMinimumSystemVersion.
export MACOSX_DEPLOYMENT_TARGET=14.2
(cd "$root" && cargo build --release --locked -p asr-worker --features metal,shared-encode)

echo "== speaker-worker"
(cd "$root" && cargo build --release --locked -p speaker-worker)

echo "== llama.cpp $LLAMA_CPP_TAG"
src="$work/llama.cpp"
if [ ! -d "$src/.git" ]; then
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$LLAMA_CPP_TAG" \
    https://github.com/ggml-org/llama.cpp.git "$src"
fi
actual=$(git -C "$src" rev-parse HEAD)
if [ "$actual" != "$LLAMA_CPP_COMMIT" ]; then
  echo "llama.cpp ở commit $actual, versions.env khóa $LLAMA_CPP_COMMIT" >&2
  exit 1
fi
if [ -n "$(git -C "$src" status --porcelain)" ]; then
  echo "mã nguồn llama.cpp ở $src đã bị sửa: xóa thư mục đó rồi chạy lại" >&2
  exit 1
fi
cmake -S "$src" -B "$work/llama-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.2 \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=OFF \
  -DGGML_CPU_ARM_ARCH=armv8.4-a+fp16 \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_BLAS=ON \
  -DGGML_OPENMP=OFF \
  -DGGML_RPC=OFF \
  -DGGML_BACKEND_DL=OFF \
  -DGGML_CCACHE=OFF \
  -DLLAMA_BUILD_NUMBER="$LLAMA_CPP_BUILD_NUMBER" \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_TOOLS=ON \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_OPENSSL=OFF >"$work/llama-cmake.log"
cmake --build "$work/llama-build" --target llama-server >"$work/llama-build.log"

echo "== src-tauri/binaries"
mkdir -p "$out"
rm -f "$out"/*
cp "$target/release/asr-worker" "$out/asr-worker-$triple"
cp "$target/release/speaker-worker" "$out/speaker-worker-$triple"
cp "$work/llama-build/bin/llama-server" "$out/llama-server-$triple"
sign_and_check
