# Nghiên cứu trước spec "Phân biệt người nói" (2026-10-26)

Script đã dùng để đo trước khi viết `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` (mục 3). Dữ liệu
(bản ghi AMI, model, bản ghi cây giao diện có tên người) **không nằm trong git**: tải lại theo hướng dẫn dưới. Kết quả tóm tắt
nằm ở mục 3 của spec; số đầy đủ của phần nhận giọng ở `nhan-giong/score-es*.txt`.

## Nhận giọng (`nhan-giong/`, `segdump/`, `candle-test/`)

Môi trường: Python 3.12, `pip install sherpa-onnx numpy soundfile scipy onnx onnxsim onnxruntime kaldi-native-fbank`.

1. Dữ liệu AMI (CC BY 4.0): `https://groups.inf.ed.ac.uk/ami/AMICorpusMirror//amicorpus/<họp>/audio/<họp>.Mix-Headset.wav`
   (và `.Array1-01.wav`), nhãn `https://raw.githubusercontent.com/pyannote/AMI-diarization-setup/main/only_words/rttms/test/<họp>.rttm`.
   Đã dùng ES2004a, TS3003a (chọn tham số), IS1009a, EN2002a (kiểm), thêm Array1-01 của ES2004a và IS1009a.
2. Model nhúng giọng: bản ONNX của sherpa-onnx, release `speaker-recongition-models`
   (`3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx`, `nemo_en_titanet_small.onnx`, …).
3. Cắt đoạn đúng như app: `cargo run --release --manifest-path segdump/Cargo.toml -- <silero_vad_v6.2.3.onnx> <wav> 50 <ra.txt>`
   (dùng `SileroVad` + `Segmenter` của crate `pipeline`, ngắt câu 50 ms). Đặt file ra là `segs/<tên wav>.es50.txt`.
4. Nhúng: `python spike.py extract <thư mục wav+rttm> <thư mục model> raw-es50 --segs-dir segs --segs-tag 50 --models eres2net_en_vox`
   (mỗi model một tiến trình).
5. Chấm: `python score2.py raw-es50` (chọn tham số trên dev, báo trên phần còn lại); `python score3.py raw-es50 <model,…>`
   (biến thể "người tạm" + gộp cụm).
6. `candle-onnx`: `python fix_stride.py` (chỉ cần cho CAM++) và `feats.py` tạo đặc trưng mẫu; `candle-test` chạy model ONNX bằng
   `candle-onnx` 0.11 để so với onnxruntime. ERes2Net cần `onnxsim` trước.

## Đọc tên từ app họp (`doc-ten/`)

- `axtrace.swift` (`swiftc -O -o axtrace axtrace.swift`): đọc cây Accessibility của một app (`trust`, `dump`, `watch`, `find`,
  `press`, `setvalue`, `closewin`, `noaccess`). Biến môi trường: `AXTRACE_PID` (chọn đúng tiến trình khi nhiều bản cùng bundle id),
  `AXTRACE_WIN` (chỉ đọc cửa sổ có tiêu đề khớp), `AXTRACE_EUI=1` (đặt `AXEnhancedUserInterface`, cần cho Teams). Tiến trình chạy
  nó phải có quyền Trợ năng.
- `guests.py`: hai khách tự động (Playwright, Chrome hồ sơ tạm, micro giả là file giọng đọc), điều khiển qua HTTP 127.0.0.1:8765.
  Dùng được cho Zoom web và Teams web. Meet chặn khách chưa đăng nhập: dùng `guest_chrome.sh` (Chrome thường, không tự động) hoặc
  tài khoản thật.
- `run_schedule.py <bundle> <tag> <cách bật mic>`: chạy kịch bản nói (lượt dài, lượt 4 s, đổi lượt không nghỉ, nói chồng, câu 1,5 s)
  trong lúc `axtrace watch` ghi cây; `timeline.py`, `blind.py` (dò "đang nói" không dùng tên lớp CSS; `MEET_NAME` là tên hiển thị
  trong phòng Meet thử) phân tích kết quả.

**Lưu ý khi thử trên máy thật** (rút ra lúc đo): Chrome tự động và Chrome thường cùng bundle id, nên luôn nhắm theo pid khi gửi
phím hay đọc cây; `meet.google.com/new` vào phòng ngay với camera và micro đang bật, phải tắt trước khi làm gì khác; Dock có thể
che thanh điều khiển của Meet ở đáy màn hình; Chrome không cho tắt lại `AXManualAccessibility`.

## Mẫu giao diện (`mock/`)

`mock.py` chèn phần người nói vào giao diện thật đang chạy bằng `scripts/ui-preview` (cổng 1430) rồi chụp; `xem.html` gom 4 ảnh đã
được chủ dự án duyệt.
