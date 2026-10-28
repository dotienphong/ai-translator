# Windows: bộ đọc tên UI Automation (kế hoạch 05)

Mục tiêu: trên Windows, đọc tên và chỉ báo "đang nói" của Teams (rồi Meet, Zoom) bằng UI Automation; đo chi phí đọc; chốt công thức.
**Chưa có bản ghi cây giao diện Windows nào trước kế hoạch này.** Công thức Windows ở dạng ứng viên (đoán từ macOS) cho tới Task 11.

## Dựng (Task 8, Task 9; macOS, mingw-w64)

| | |
|---|---|
| `speaker-worker.exe` (gnu, release, strip) | 6 162 944 byte |
| bản nén xz -9e | 1 545 556 byte; bộ cài 0.3.1 + bản nén = 22 646 915 byte (giới hạn 60 000 000) |
| `uia-record.exe` | 1 828 864 byte |
| DLL nhập của `speaker-worker.exe` | KERNEL32, kernel32, ntdll, api-ms-win-core-synch-l1-2-0, api-ms-win-crt-{environment,heap,locale,math,private,runtime,stdio,string}-l1-1-0, bcryptprimitives, ole32, oleaut32, user32; mới so với 02-windows.md: ole32.dll, user32.dll |
| nhập `ws2_32`, `winhttp`, `wininet`, `wsock` | 0 (cả `speaker-worker.exe` và `uia-record.exe`) |
| `win-pack-05.zip` | 979 518 byte, SHA-256 `ce7089e6fcc54da9b43f0de94bc871f53eca7a291a7f666140ddd3bd71e42a5e` |

SHA-256 của `uia-record.exe` trong gói: `9f309856b64c2f122fcd1416accc3a4e6d7a25e1682d7218d698a55ebc806fdd`.

Gói chưa chạy trên Windows (máy dựng không có PowerShell); `chay-05.ps1` chỉ cân ngoặc (71/71, 39/39, 16/16) và kiểm số nháy từng dòng.

## Task 10: bản ghi Teams trên Windows

**Chờ chủ dự án.**

## Task 11: công thức Teams Windows

**Chờ bản ghi Task 10.**

## Task 12: chi phí đọc

**Chờ bản ghi Task 10.**

## Task 13: Meet (Chrome, Edge) và Zoom trên Windows

**Chờ chủ dự án.**
