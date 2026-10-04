# `llama-server` chạy CPU: RAM và tốc độ có và không có `--no-repack` (dòng 227)

Ngày 2026-10-04, Mac M4 Pro 24 GB, macOS 26.6.2, `llama-server` b11146 (bản macOS, `-ngl 0`, `-c 2048`, `-np 1`). Script:
`bench/phase1/ram_norepack.py`. Mỗi ô là một lượt chạy riêng, dịch ba câu Anh→Việt.

| Model | Cờ | Nạp (s) | RSS sau nạp (MiB) | RSS sau 3 câu (MiB) | token/giây |
|---|---|---|---|---|---|
| Hy-MT2-1.8B-Q8_0.gguf | (mặc định) | 1.5 | 3613 | 3621 | 103.4 |
| Hy-MT2-1.8B-Q8_0.gguf | --no-repack | 0.5 | 2065 | 2074 | 103.4 |
| Hy-MT2-1.8B-Q4_K_M.gguf | (mặc định) | 1.0 | 2200 | 2207 | 141.3 |
| Hy-MT2-1.8B-Q4_K_M.gguf | --no-repack | 0.5 | 1322 | 1330 | 140.2 |

- `--no-repack` giảm RSS khoảng 43% ở Q8_0 (3,6 → 2,1 GB) và 40% ở Q4_K_M (2,2 → 1,3 GB), và nạp nhanh hơn (1,0–1,5 giây
  xuống 0,5 giây).
- Tốc độ sinh không đổi trên máy này (103 và 141 token/giây). Trên M4 Pro đường CPU có thể không dùng nhân đã repack, nên
  kết quả **không suy ra được cho máy x64 chỉ có CPU** (AVX2), nơi repack có thể nhanh hơn thật. Số đo trên Windows 8 GB
  chỉ CPU vẫn thiếu (máy không có).
- Số 3,95 GB ở spec §8 là RSS của Q8_0 trên CPU, khớp với 3,6 GB đo được ở đây; nó gồm bản trọng số repack.
- Gợi ý cho §8: khi `min_ram_mib` sát và máy chỉ có CPU, thử `--no-repack` (đã truyền được qua `extra_args`, 02a d3
  `4268836`) và đo token/giây trên chính loại máy đó trước khi dùng làm mặc định.
