# Máy đo của spike ghi chú cuộc họp

Đo ngày 2026-11-11.

| Mục | Giá trị |
|---|---|
| CPU | 13th Gen Intel Core i5-1345U (10 lõi, 12 luồng) |
| RAM | 32 425 MiB |
| GPU | Intel Iris Xe Graphics (tích hợp). Vulkan0: 16 212 MiB (15 444 MiB trống) là bộ nhớ dùng chung với RAM |
| Hệ điều hành | Windows NT 10.0.26300 |
| `llama-server` | `tools/llama-b11146/win-vulkan-x64/llama-server.exe`, version 0.5.0-dev (build 11146, commit 7fe450e19), Clang 20.1.8 |
| `uv` | 0.12.23 |

## Ghi chú cho các lượt đo

- Có một thiết bị Vulkan dùng được, nhưng là GPU tích hợp dùng chung RAM, không phải GPU rời. Lượt `--hw gpu` ở đây chỉ phản ánh iGPU. Máy này khác cấu hình tối thiểu của spec (RAM ≥ 15 360 MiB, không cần GPU rời): RAM dư gấp đôi.
- Máy 32 GB nên số đo RAM đỉnh của tiến trình ghi chú đúng, nhưng thời gian CPU/GPU trên máy 16 GB yếu hơn chưa đo (spec §11 rủi ro).
