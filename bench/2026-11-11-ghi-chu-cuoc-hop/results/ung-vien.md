# Ứng viên model ghi chú chạy trên máy

Chốt ngày 2026-11-11 (kế hoạch 01, Task 5). Nguồn: model card trên Hugging Face và API `huggingface.co/api/models/<repo>?blobs=true` (kích thước, SHA-256, mã commit).

## Kiểm theo tiêu chí của kế hoạch

| Họ model | Giấy phép | Bản mới hơn trong họ | GGUF Q4_K_M | Tắt suy nghĩ | Kết luận |
|---|---|---|---|---|---|
| Qwen3.5-4B | Apache-2.0 | không | 2 740 937 888 B (2,55 GiB) | `chat_template_kwargs.enable_thinking = false` trong thân yêu cầu (model card: mặc định có suy nghĩ) | **giữ** |
| Qwen3-4B | Apache-2.0 | có: Qwen3-4B-Instruct-2507 (bản không suy nghĩ, thay bản cũ) | 2 497 281 120 B (2,33 GiB) | không có chế độ suy nghĩ | **giữ, dùng bản Instruct-2507** |
| Gemma 4 E4B | Apache-2.0 | không | 4 977 171 584 B (4,64 GiB) | không áp dụng | **loại**: lớn hơn 4 GiB, không thể giữ RAM đỉnh ≤ 6 GiB cùng context |

Hai GGUF ở trên đều do bên thứ ba (`unsloth`) đăng; repo GGUF của chính Qwen cho các model này không truy cập được (API trả 401). **Chỉ để đo.** Gói ghi chú phát hành (kế hoạch 03) phải dùng file có nguồn và SHA-256 ghi lại, giấy phép Apache-2.0 cho phép phân phối lại.

## Tham số đã ghi vào `candidates.json`

| id | repo | revision | file | bytes | SHA-256 |
|---|---|---|---|---|---|
| `qwen3-5-4b` | `unsloth/Qwen3.5-4B-GGUF` | `e87f176479d0855a907a41277aca2f8ee7a09523` | `Qwen3.5-4B-Q4_K_M.gguf` | 2 740 937 888 | `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4` |
| `qwen3-4b-instruct-2507` | `unsloth/Qwen3-4B-Instruct-2507-GGUF` | `a06e946bb6b655725eafa393f4a9745d460374c9` | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2 497 281 120 | `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597` |

SHA-256 của file đã tải (`Get-FileHash`) khớp số trên Hugging Face cho cả hai.

## Nạp thử trên `llama-server` b11146 (đang khóa của repo)

Một câu tiếng Anh (bản dịch tiếng Việt kèm theo), `--config c8k --hw cpu --json-mode schema`, máy ở `may-do.md`.

| id | Nạp | Gọi hợp lệ | Đúng ngôn ngữ | Nội dung | RSS đỉnh | Ghi chú |
|---|---|---|---|---|---|---|
| `qwen3-5-4b` | 2,6 s | có, ngay lần đầu | có | một quyết định, một việc cần làm của Minh, `refs` đúng | 4 462 MiB | kiến trúc Gated DeltaNet nạp được trên b11146; 319 token vào, 114 token ra, không có chữ suy nghĩ |
| `qwen3-4b-instruct-2507` | 3,1 s | có, ngay lần đầu | có | như trên | 5 361 MiB | sát ngưỡng 6 GiB ngay với một câu ngắn ở `c8k`; phải xem lại với đoạn 5 000 token ở Task 7 |

Cả hai chạy với `response_format: json_schema` nên không cần `--json-mode prompt`. **Binary b11146 nạp được cả hai: không cần tải bản llama.cpp mới** (rủi ro 1 của spec §11 không xảy ra với hai ứng viên này). Đây mới chỉ là một câu; chưa nói gì về chất lượng.
