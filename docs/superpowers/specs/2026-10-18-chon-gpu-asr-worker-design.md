# Chọn GPU cho `asr-worker` trên máy có hai GPU

Ngày 2026-10-18. Phạm vi: `crates/asr-worker` (build Vulkan, Windows). macOS (Metal, một thiết bị) không đổi hành vi.

## 1. Vấn đề

Báo cáo lỗi `R-VBXX-951X` (Windows, i5-11400H, Intel UHD + RTX 3050 Laptop 4 GB, app 0.1.11) có log whisper:

```
ggml_vulkan: 0 = Intel(R) UHD Graphics | uma: 1 ...
ggml_vulkan: 1 = NVIDIA GeForce RTX 3050 Laptop GPU | uma: 0 ...
whisper_backend_init_gpu: device 0: Vulkan0 (type: 2)      # 2 = IGPU
whisper_backend_init_gpu: using Vulkan0 backend
```

Nguyên nhân (đọc mã `third_party/whisper-rs-sys/whisper.cpp` 1.8.3):

- `ggml-vulkan.cpp` (`ggml_vk_instance_init`) đưa cả card rời lẫn iGPU vào danh sách theo thứ tự `vkEnumeratePhysicalDevices`, không ưu tiên card rời. Trên laptop Windows, iGPU thường đứng đầu.
- `whisper_backend_init_gpu` lấy thiết bị GPU/IGPU thứ `gpu_device`. `asr-worker` không đặt `gpu_device`, nên là 0.

Hệ quả đo được trong cùng báo cáo: gói `standard` (large-v3-turbo) nhận dạng p50 4–5 giây, tổng độ trễ khoảng 11 giây; gói `lite` trước đó 1,1–1,3 giây. Quy tắc đề xuất gói (`scripts/models/models.config.json`) đòi card rời ≥ 5632 MiB cho `standard`, tức là chính những máy được đề xuất chạy trên card rời lại có thể chạy whisper trên iGPU.

`llama-server` tự ưu tiên card rời (llama.cpp chỉ thêm iGPU khi không có thiết bị GPU nào khác). Điều này chưa kiểm trên máy thật; log của báo cáo không có dòng khởi tạo GPU của llama.

## 2. Mục tiêu và ngoài phạm vi

Mục tiêu: whisper chạy trên card rời khi máy có card rời đủ bộ nhớ.

Ngoài phạm vi: đổi `llama-server`; đổi quy tắc đề xuất gói; giao diện chọn GPU cho người dùng; chia model qua nhiều GPU.

## 3. Quy tắc chọn

`choose_gpu(candidates, forced) -> Option<usize>`. `candidates` là các thiết bị ggml loại GPU hay IGPU theo đúng thứ tự đăng ký của ggml (chỉ số trong danh sách này chính là `gpu_device` của whisper.cpp), mỗi thiết bị có `integrated`, `free_mib`, tên.

1. `forced` (biến môi trường `ASR_GPU_DEVICE=<n>`, dùng khi đo) hợp lệ, `n` nhỏ hơn số thiết bị: chọn `n`. Không hợp lệ thì bỏ qua.
2. Các thiết bị loại GPU (không phải iGPU; ggml xếp card rời và GPU Apple vào loại này) có `free_mib >= MIN_DISCRETE_FREE_MIB` (2048): chọn thiết bị có `free_mib` lớn nhất; bằng nhau thì chỉ số nhỏ hơn.
3. Không có: chọn 0 (hành vi hiện tại; whisper.cpp cũng tự chọn 0).
4. Danh sách rỗng: `None` (không có GPU, whisper chạy CPU như cũ).

Vì sao 2048 MiB: model `standard` khoảng 0,6 GB cộng bộ đệm tính toán khoảng 0,4 GB, `llama-server` nằm cùng card. Card nhỏ hơn mà vẫn được chọn thì dễ hết bộ nhớ, và lúc đó app chuyển sang CPU (chậm hơn iGPU). Thà giữ hành vi cũ.

## 4. Thiết kế

`crates/asr-worker/src/backend.rs`:

- `Candidate { name, integrated, free_mib }` và hàm thuần `choose_gpu` (kiểm trên mọi hệ điều hành).
- `gpu_candidates()` liệt kê qua `ggml_backend_dev_*` và `ggml_backend_dev_memory` (đã có trong binding).
- `selected_gpu()` gom hai hàm trên và đọc `ASR_GPU_DEVICE`; `real_backend` báo thiết bị này thay vì "thiết bị GPU đầu tiên".

`crates/asr-worker/src/engine.rs`: `Engine::load` đặt `gpu_device` của `WhisperContextParameters` theo `selected_gpu()` khi `use_gpu`.

`main.rs` thêm một dòng stderr riêng, không đổi dòng `backend=...` cũ (các phép kiểm log tìm đúng dòng đó):

```
asr-worker: gpu=<tên> (GPU|iGPU, <n> MiB trống, <lý do>)
```

Loại theo phân loại của ggml (GPU hay iGPU; Apple Silicon là "GPU"). Lý do: `ưu tiên GPU còn đủ bộ nhớ`, `giữ thiết bị đầu`, `ép bằng ASR_GPU_DEVICE`. Dòng này giúp báo cáo lỗi sau này cho biết ngay whisper chạy trên card nào.

`src-tauri/src/diagnostics/logs.rs`: `sidecar_lines` giữ thêm các dòng nói thiết bị (`asr-worker: …`, `ggml_vulkan: …`, `whisper_backend_init_gpu: …`) dù xa đuôi log, vì chúng nằm ở đầu mỗi lần chạy mà báo cáo chỉ lấy dòng cảnh báo, lỗi và 60 dòng cuối.

## 5. Lỗi và rủi ro

- Gọi `ggml_backend_dev_*` trước khi tạo context là an toàn: whisper.cpp cũng gọi đúng các hàm này trong `whisper_backend_init_gpu`.
- Card rời được chọn mà vẫn hết bộ nhớ: đường xử lý hết bộ nhớ hiện có (`ErrorKind::OutOfMemory`, đề xuất gói Nhẹ, chuyển CPU) không đổi.
- Dòng log mới không chứa âm thanh hay chữ chép lời; tên GPU đã nằm sẵn trong log ggml.

## 6. Kiểm thử

- Đơn vị: `choose_gpu` với các ca (một thiết bị; iGPU đứng đầu và card rời 4 GB; hai card rời; card rời dưới ngưỡng; chỉ iGPU; `forced` hợp lệ và không hợp lệ; rỗng).
- `metal_build_reports_metal` (macOS) giữ nguyên: một thiết bị, chọn 0.
- Trên Windows hai GPU (chưa có máy trong phiên này): chạy `standard` và `lite`, so nhận dạng p50 và xem dòng `gpu=` trong `asr-worker.log`; `ASR_GPU_DEVICE=0` cho số đo cũ để so.
