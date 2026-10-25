# Nâng thư viện sau kiểm toán bảo mật (2026-10-25)

Cách kiểm và số đo của đợt nâng llama.cpp, whisper.cpp (backport) và SQLCipher, để lần nâng sau làm lại đúng cách. Đo trên M4 Pro,
macOS 26, Metal. Máy lúc đó có Microsoft Defender quét nên số tuyệt đối về thời gian nhiễu (p50 dịch cùng một cấu hình đo được 310 ms
lúc yên và 590 ms lúc bị quét): chỉ tin phép so xen kẽ cũ/mới, không tin số tuyệt đối.

## llama.cpp b11146 (v0.5.0) → b11669 (v0.7.0)

1. Dựng cả hai bản bằng đúng cờ của `scripts/release/build-sidecars-macos.sh` vào thư mục tạm (clone `--depth 1 --branch bNNNNN`).
2. `node scripts/release/compare-llama.mjs <cũ> <mới> <model.gguf> [--cpu]`, với Hy-MT2-1.8B-Q8_0 và LMT-60-0.6B-Q8_0:
   **giống nhau cả 5 câu**, ở cả GPU và CPU.
3. `latency-bench mt-eval --testset bench/2026-09-29-mt-benchmark/testset.jsonl --llama-server <bản> --model <gguf> --out-dir <thư mục> --variant plain --limit 40 [--prompt lmt]`
   (212 câu: en→vi, vi→en, vi→zh/ja/ko, bộ chất lượng; đúng code dịch của app), rồi
   `AB_DIR=<thư mục chứa mt-hy-old, mt-hy-new, mt-lmt-old, mt-lmt-new> uv run --with sacrebleu==2.6.0 python bench/2026-10-25-nang-cap-thu-vien/ab-score.py`:
   **bản dịch giống hệt 212/212 ở cả hai model**, chrF++ không đổi (Hy en→vi 47,46, vi→en 46,36, vi→zh 23,13, vi→ja 20,67, vi→ko 23,82;
   LMT en→vi 44,94, vi→en 45,26, vi→zh 22,98, vi→ja 18,44, vi→ko 18,32).
4. Tốc độ (Hy-MT2, p50 tổng mỗi câu): lượt yên 310 → 334 ms; ba vòng xen kẽ lúc máy bị quét 594 → 565 ms (cũ → mới), 49,2 → 52,8 token/s.
   LMT: 253 → 255 ms. Không có dấu hiệu chậm đi.
5. Test dùng llama-server thật (`MT_LLAMA_SERVER=<mới>`): `clients real_llama_server` (khóa API, đóng kết nối sau stream), `real_terms`
   (Q4_K_M: thuật ngữ đúng 1/8 → 7/8; Q8_0 đạt), `real_sidecars` (pipeline thật, tổng p50 544 ms).
6. `scripts/release/release-check.mjs deps-macos` đạt: minos 14.2, chỉ nạp thư viện hệ thống. Cờ cmake và cờ dòng lệnh của app còn nguyên.
7. **Chưa kiểm được:** llama-server Vulkan/CPU trên Windows (chỉ dựng được ở CI phát hành; cờ cmake đã đối chiếu, chưa chạy).

## whisper.cpp 1.8.3: backport bản vá 0004, không nâng 1.9.5

Cách 1604 commit nên chỉ lấy bốn sửa an toàn (xem `third_party/README.md`). So `asr-worker` build từ `third_party` cũ và mới
(`MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p asr-worker --features metal,shared-encode`, mỗi bản một `CARGO_TARGET_DIR`),
chạy `latency-bench asr-eval --asr-model models/ggml-small-q5_1.bin` trên 120 clip A4 (24 mỗi ngôn ngữ, chọn ngẫu nhiên hạt 7):
**120/120 giống hệt** bản chép lời, ngôn ngữ, số token, audio_ctx; asr_ms median 155,5 → 155,1 ms. File model small có `n_dims` của tensor đầu
(offset 572465) sửa thành 99: bản cũ chết SIGBUS, bản mới trả lỗi nạp model sạch.

## SQLCipher 4.14.0 → 4.19.0 (rusqlite 0.41.0, crate `sqlcipher-src`)

Tạo DB bằng `open_with_key` của `src-tauri/src/db.rs` (khóa thô, 2002 dòng) ở một bản, mở bằng bản kia: 4.14 → 4.19 và 4.19 → 4.14 đều mở được
(`integrity_check` ok, `user_version` giữ nguyên, sai khóa vẫn bị từ chối). Nên quay về bản app cũ không làm mất lịch sử. macOS vẫn dùng CommonCrypto.
Chưa kiểm được: Windows (OpenSSL 3.6.3 tĩnh) ngoài CI.

## Cổng kiểm đã chạy cục bộ (CI của GitHub không chạy được lúc đó: hết hạn mức thanh toán)

`cargo fmt --check`, `cargo clippy` (macOS, `check-windows.sh`), `cargo test --workspace` và test release, `pnpm build` + `pnpm test`, `node --test scripts/release`,
`verify-third-party.sh`, `notices.mjs` + `check-release-config.sh`, `cargo deny`, `cargo audit`, `pnpm audit` (gốc, server, website), `pnpm -C website test`,
`pnpm -C server check`.
