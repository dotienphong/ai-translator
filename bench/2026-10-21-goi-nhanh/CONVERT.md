# Tự chuyển LMT-60-0.6B sang GGUF Q8_0 (spec gói Nhanh §7)

File GGUF không vào git. File phát hành nằm trên R2 ở `lmt-60/LMT-60-0.6B-Q8_0.gguf`; bản dev đặt ở `models/` của thư mục chính.

## Nguồn

- Model: `NiuTrans/LMT-60-0.6B`, revision `dd189845cdc73346cef33c7a94f4b8bd8efdd4eb` (model card ghi `license: apache-2.0`, nền `Qwen/Qwen3-0.6B-Base`). Repo không có file LICENSE.
- Giấy phép đi kèm: văn bản Apache License 2.0 lấy từ `Qwen/Qwen3-0.6B-Base`, revision `da87bfb608c14b7cf20ba1ce41287e8de496c0cd`.
- llama.cpp tag `b11146`, commit `7fe450e19305b828c199d602c23a8337aaa1f03b` (cùng bản với `llama-server` của app).

## Lệnh (2026-10-21, macOS 26.6, Apple M4 Pro)

```bash
git clone --depth 1 --branch b11146 https://github.com/ggml-org/llama.cpp llama.cpp-b11146
uv venv -p python3.12 venv-convert
VIRTUAL_ENV=venv-convert uv pip install --index-strategy unsafe-best-match \
  -r llama.cpp-b11146/requirements/requirements-convert_hf_to_gguf.txt huggingface_hub
venv-convert/bin/python -c "from huggingface_hub import snapshot_download; \
  snapshot_download('NiuTrans/LMT-60-0.6B', revision='dd189845cdc73346cef33c7a94f4b8bd8efdd4eb', local_dir='LMT-60-0.6B')"
venv-convert/bin/python llama.cpp-b11146/convert_hf_to_gguf.py LMT-60-0.6B --outtype q8_0 --outfile LMT-60-0.6B-Q8_0.gguf
curl -sL https://huggingface.co/Qwen/Qwen3-0.6B-Base/resolve/da87bfb608c14b7cf20ba1ce41287e8de496c0cd/LICENSE -o LMT-60-LICENSE.txt
```

Môi trường: Python 3.12.13, `torch==2.11.0`, `transformers==4.57.6`, `numpy==2.2.6`, `safetensors==0.8.0`, `sentencepiece==0.2.2`, `protobuf==4.25.9`, `gguf==0.19.0` (script dùng `gguf-py` trong thư mục llama.cpp).

Chạy lệnh chuyển hai lần ra cùng SHA-256: kết quả tái lập được.

## Kết quả

| File | Byte | SHA-256 |
|---|---|---|
| `LMT-60-0.6B-Q8_0.gguf` | 804754272 | `7b64cce458930ca3b6dd6da3d04503b309fdaacb6190eb6f9865263b6d67f55b` |
| `LMT-60-LICENSE.txt` | 11343 | `832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e` |

File của bên thứ ba dùng ở lượt đo §2 (`mradermacher/LMT-60-0.6B-GGUF`, Q8_0) có SHA-256 khác (`687f4373…`), vì khác bản công cụ chuyển; không dùng file đó để phát hành.
