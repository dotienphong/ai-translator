# Windows i5: `speaker-worker` thật (kế hoạch 02b, Task 8)

Mục tiêu: trên máy Windows i5 của chủ dự án, đo RAM của B' và allocator Windows, tốc độ và CPU của nhúng qua worker thật
(ngân sách ≤ 10% một lõi, spec §11; RAM ≤ 250 MB), và kiểm độ chính xác giữ nguyên. Gói này gộp luôn gói Task 13 của kế hoạch 01
(`win-pack.zip`), vì chủ dự án chưa chạy gói đó. MB là 10^6 byte.

**Trạng thái:** Step 1 (dựng) và Step 2 (đóng gói) đã xong trên macOS ngày 2026-10-27. **Số đo trên i5: chờ chủ dự án** (Step 3,
Step 4). Gói và dữ liệu nằm ngoài repo, ở `$DATA/win-pack-02/` và `$DATA/win-pack-02.zip`.

## Step 1: dựng bằng mingw-w64

Target `x86_64-pc-windows-gnu`; không dùng `cargo-xwin`. Dựng trên Apple M4 Pro, macOS 26.6.2, Rust 1.98.1,
`x86_64-w64-mingw32-gcc` 16.2.0 (Homebrew). Biến môi trường lấy đúng như gói Task 13 của kế hoạch 01 (đọc từ fingerprint và
`build/onig_sys-*/output` của bản dựng cũ trong `target/x86_64-pc-windows-gnu/`):

- `CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc`: oniguruma biên dịch tĩnh bằng mingw (`rustc-link-lib=static=onig`).
- `CFLAGS_x86_64_pc_windows_gnu` có `-ffile-prefix-map` và `RUSTFLAGS` có `--remap-path-prefix` (thư mục nhà, registry,
  toolchain, worktree, `/tmp/wsrc` → `/home/user`, `/registry`, `/rustc`, `/src`). Hai biến này để binary không mang đường dẫn
  trên máy dựng.
- Dựng qua `--manifest-path /tmp/wsrc/Cargo.toml`, với `/tmp/wsrc` là symlink tạm trỏ tới worktree (đã gỡ sau khi dựng). Lý do:
  `latency-bench` dùng `env!("CARGO_MANIFEST_DIR")` (`mt_eval.rs`, `latency.rs`), và `--remap-path-prefix` không đổi chuỗi này. Lần
  dựng đầu chạy từ `$W` nên `latency-bench.exe` mang một chuỗi đường dẫn tuyệt đối. Vì vậy dựng lại riêng binary này qua
  `/tmp/wsrc` bằng `cargo rustc … -- --cfg wsrc_rebuild` (cờ cfg không dùng ở đâu, chỉ để buộc dựng lại; không sửa nguồn, không
  `cargo clean`). Sau đó `strings` không thấy `/Users/` ở cả hai `.exe`; `latency-bench.exe` chỉ còn `/tmp/wsrc/...`, như bản cũ.

```sh
cd $W && df -h . | tail -1 && CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc CFLAGS_x86_64_pc_windows_gnu="-ffile-prefix-map=$HOME=/home/user -ffile-prefix-map=/tmp/wsrc=/src" \
  RUSTFLAGS="--remap-path-prefix=$HOME=/home/user --remap-path-prefix=$HOME/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f=/registry --remap-path-prefix=$HOME/.rustup/toolchains/1.98.1-aarch64-apple-darwin=/rustc --remap-path-prefix=/tmp/wsrc=/src --remap-path-prefix=$W=/src" \
  MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release --target x86_64-pc-windows-gnu -p speaker-worker -p latency-bench 2>&1 | tail -1
# rồi (cùng các biến trên, ln -s $W /tmp/wsrc trước, unlink /tmp/wsrc sau):
cargo rustc --manifest-path /tmp/wsrc/Cargo.toml -p latency-bench --bin latency-bench --release --target x86_64-pc-windows-gnu -- --cfg wsrc_rebuild
x86_64-w64-mingw32-objdump -p target/x86_64-pc-windows-gnu/release/speaker-worker.exe | grep "DLL Name" | sort -u
ls -l target/x86_64-pc-windows-gnu/release/speaker-worker.exe && xz -9e -c target/x86_64-pc-windows-gnu/release/speaker-worker.exe | wc -c
```

Kết quả: `Finished release … in 1m 44s` (235 crate dựng lại toàn bộ, 0 cảnh báo), rồi `Finished … in 50.20s` cho lần dựng lại
`latency-bench`. Đĩa trống 20,28 GiB trước và 20,22 GiB sau lần dựng đầu, 20,23 GiB sau lần dựng lại (mốc dừng 14 GiB).

**DLL nhập của `speaker-worker.exe`:** `KERNEL32.dll` (và `kernel32.dll`), `ntdll.dll`, `api-ms-win-core-synch-l1-2-0.dll`,
`api-ms-win-crt-{environment,heap,locale,math,private,runtime,stdio,string}-l1-1-0.dll`, `bcryptprimitives.dll`, `oleaut32.dll`.
Tất cả là DLL hệ thống của Windows 10/11, không có DLL lạ. **Không có `WS2_32.dll`.** Đối chiếu: `latency-bench.exe` cùng thư mục
(có mạng) nhập thêm `ws2_32.dll`, `advapi32.dll`, `pdh.dll`, `powrprof.dll`, `psapi.dll`, `shell32.dll`. Các
`api-ms-win-crt-*` là UCRT do mingw-w64 nối động; bản phát hành dựng bằng MSVC CRT tĩnh sẽ không nhập các DLL này. Lớp kiểm mạng
chính vẫn là Task 7.

**Kích thước và ước tính bộ cài Windows:**

| | byte |
|---|---|
| `speaker-worker.exe` (gnu, release, strip) | 4 483 584 |
| bản nén gzip -9 | 1 500 798 |
| bản nén xz -9e (gần LZMA của bộ cài NSIS) | **1 063 628** |
| để so: `speaker-worker` macOS (arm64), xz -9e | 672 172 (binary 2 867 152) |
| bộ cài Windows 0.3.1 (`…_x64-setup.exe`) | 21 101 359 |
| **ước tính bộ cài có `speaker-worker`** = 21 101 359 + 1 063 628 | **22 164 987** |
| giới hạn (`package-windows.mjs`: `checkSize(bytes, 60_000_000)`) | 60 000 000 |

Ước tính dùng 36,9% giới hạn, còn dư 37 835 013 byte: **không vượt**. Bản Windows nén xz lớn gấp 1,58 lần bản macOS. Đây chỉ là
ước tính, vì bản gnu khác bản phát hành MSVC CRT tĩnh. Model nhúng không nằm trong bộ cài nên không tính.

## Step 2: gói gộp (ngoài repo)

`$DATA/win-pack-02.zip`: **57 500 248 byte**, SHA-256 `0fc5f200486134b6331b4efbe78a551f9a8ae7906d570a3e1a1111a38e3a3448`, 12 file,
giải nén 77 494 844 byte. Giải nén lại trên macOS thì SHA-256 từng file khớp bản nguồn. Script dựng gói là
`$DATA/win-pack-02-nguon/lam-goi.sh`; nguồn script và SHA-256 từng file cũng ở thư mục đó.

| File | Nguồn | Dùng ở |
|---|---|---|
| `chay-tat-ca.ps1` | mới | lệnh duy nhất chủ dự án chạy: gọi `chay-02.ps1` rồi `chay-toc-do.ps1`, mỗi script trong một `powershell.exe` con, rồi gom kết quả vào `ket-qua-gui-lai.zip` |
| `chay-02.ps1` | mới (theo mẫu `chay-toc-do.ps1`) | Task 8: hai lượt `speaker-eval --worker` |
| `latency-bench-02.exe`, `speaker-worker.exe` | dựng ở Step 1 | Task 8 |
| `chay-toc-do.ps1`, `latency-bench.exe`, `uia-probe.exe`, `DOC-TEAMS-MEET.txt` | chép nguyên từng byte từ `$DATA/win-pack/` | kế hoạch 01 Task 13 |
| `eres2net-sv-en-voxceleb-16k.onnx`, `silero_vad_v6.2.3.onnx`, `IS1009a.Mix-Headset.wav` | như gói cũ, một bản dùng chung cho cả hai bộ | cả hai |
| `DOC-TOI-DI.txt` | mới, thay bản cũ | hướng dẫn tiếng Việt cho cả hai bộ |

- `chay-02.ps1` chạy hai lượt đúng lệnh của kế hoạch: `speaker-eval --wav IS1009a.Mix-Headset.wav --vad-model silero_vad_v6.2.3.onnx
  --speaker-model eres2net-sv-en-voxceleb-16k.onnx --worker .\speaker-worker.exe --theta 0.35 --merge-theta 1.1 --out worker-N.jsonl`.
  Đầu ra ghi vào `worker-N.txt`. Script làm theo mẫu `chay-toc-do.ps1`: UTF-8 có BOM, CRLF, kiểm đủ file, `Unblock-File`, hỏi nếu
  máy chạy bằng pin, ghi thông số máy bằng `Get-CimInstance Win32_Processor`, `Win32_ComputerSystem`, `Win32_OperatingSystem`
  vào `thong-tin-may-02.txt`, rồi nén `ket-qua-02.zip`. Ngoài số `speaker-eval` tự đo (RSS đỉnh, CPU, lấy mẫu bằng `sysinfo`),
  script ghi thêm số do Windows đo cho `speaker-worker.exe`: `PeakWorkingSet64` (đỉnh do hệ điều hành ghi, không phụ thuộc nhịp
  lấy mẫu), `PrivateMemorySize64` đỉnh (lấy mẫu 0,5 s) và giây CPU.
- Cách dựng gói khác kế hoạch ở ba chỗ. (1) `latency-bench` mới mang tên `latency-bench-02.exe`, để `latency-bench.exe` của kế
  hoạch 01 giữ nguyên từng byte: đường nhúng trong tiến trình đã đổi từ sau bản đó (`embed.rs`, `onnx_steps.rs`: B'), và
  `chay-toc-do.ps1` phải đo đúng bản mà `toc-do.md` chờ. Phần lặp lại chỉ tốn thêm 8,6 MB. (2) zip phẳng, không có thư mục con,
  như `win-pack.zip`. (3) README là `DOC-TOI-DI.txt` chứ không phải `README-02.txt`, vì `chay-toc-do.ps1` dẫn tới tên này.
- **Chưa thử trên Windows**: máy dựng không có Windows hay PowerShell. Đã kiểm: script cân ngoặc và chuỗi, có BOM và CRLF, gói đủ 12
  file, file chép từ gói cũ trùng từng byte (`cmp`), hai `.exe` là `PE32+ executable (console) x86-64`. Gói không cần quyền quản
  trị, không dùng mạng, không ghi âm.

## Step 3: chủ dự án chạy trên i5 (chờ)

Chép `win-pack-02.zip` sang máy i5, chuột phải chọn Extract All, mở PowerShell trong thư mục đã giải nén, rồi chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\chay-tat-ca.ps1
```

Phần 1 (`chay-02.ps1`, hai lượt qua worker) dự kiến 5–15 phút. Phần 2 (`chay-toc-do.ps1`, ba lượt trong tiến trình) dự kiến 15–45
phút. Tổng khoảng 20 phút đến 1 giờ. Cần cắm điện và để máy yên. Gửi lại **một** file `ket-qua-gui-lai.zip`. Nếu chạy riêng từng
phần thì gửi `ket-qua-02.zip` và `ket-qua-windows.zip`.

## Step 4: kết quả trên i5 (chờ chủ dự án)

Khi có `ket-qua-gui-lai.zip`: giải nén vào `$DATA/out/02/windows/`, chấm
`cd $W && $DATA/venv/bin/python -I $B/score_spk.py $DATA/out/02/windows/worker-1.jsonl $DATA/out/IS1009a.Mix-Headset.rttm` (và
`worker-2.jsonl`), rồi điền bảng dưới. Phần của kế hoạch 01 (`out*.jsonl`, `out-*.txt`, `thong-tin-may.txt`) điền vào mục Windows
i5 của `toc-do.md`.

| Mục | Mức | macOS M4 Pro (Task 2, cùng bản ghi, lượt 1 / 2) | Windows i5 |
|---|---|---|---|
| Máy (CPU, RAM, Windows, nguồn điện) | | Apple M4 Pro, 24 GB, macOS 26.6.2 | chờ chủ dự án |
| Dòng ≥ 1 s / mọi dòng / giọng | gần bằng macOS | 89,6% (147/164) / 85,7% (215/251) / 5 | chờ chủ dự án |
| Khứ hồi p50 / p90 (ms) | | 92,6 / 201,7; 90,8 / 193,2 | chờ chủ dự án |
| Xong ≤ 230 ms | | 226/226, 226/226 | chờ chủ dự án |
| RSS đỉnh `speaker-worker` (`sysinfo`) | ≤ 250 MB | 198,0 / 199,3 MB | chờ chủ dự án |
| `PeakWorkingSet64`, bộ nhớ riêng đỉnh (Windows) | ≤ 250 MB | (không có trên macOS) | chờ chủ dự án |
| CPU % một lõi so với thời lượng tiếng nói | ≤ 10% (i5) | 7,49 / 7,30% | chờ chủ dự án |

Cách đọc: `speaker-eval --worker` gửi đoạn liền nhau. Trên macOS, cách này cho RSS đỉnh cao hơn mức app gặp khi phát theo thời gian
thực khoảng 23–41% (mục "Kiểm bổ sung theo thời gian thực" của `02-nhan-giong-worker.md`). Vì vậy nếu số trên Windows sát hay hơi
vượt 250 MB, chưa nên kết luận là không đạt. CPU tính trên thời lượng tiếng nói của các đoạn có nhúng. Nếu vượt ngân sách, các
hướng đã có trong spec §14: 1 luồng, bỏ nhúng đoạn ngắn hơn 1 s, tự tắt trên máy yếu. Chọn hướng nào thì chờ chủ dự án quyết; Task 9
ghi phần này là việc còn mở cho tới khi có số.
