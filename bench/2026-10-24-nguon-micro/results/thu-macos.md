# Nhật ký thu các cảnh trên macOS (2026-10-24)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`, Task 16. Bản thu nằm ở `data/scenes/` (không có
trong git).

**Điều kiện chung:**
- Máy: MacBook Pro M4 Pro, macOS 26.6.2.
- Micro: "MacBook Pro Microphone" (tích hợp), 48 kHz, 1 kênh.
- Loa: "MacBook Pro Speakers". Âm lượng hệ thống hạ từ 100% xuống 60% trong lúc thu, thu xong trả về 100%.
- Thu bằng `target/Capture.app` qua `run_scene_macos.sh`. Lượt khởi động đầu tiên đã xin đủ quyền "Ghi âm thanh hệ thống"
  và Micro.
- Track: `build_scene.py`, mọi clip ở −26 dBFS.
- Điện thoại (cảnh 4 và 7): âm lượng 70%, loa hướng về laptop.

| Cảnh | Thư mục | Thiết bị, cách bố trí | Thời lượng | Lệch track | Ghi chú |
|---|---|---|---|---|---|
| 1, loa, nói lần lượt | `s1-loa` | Hai track phát bằng `afplay` qua loa laptop; tap theo pid của track online | 325 s | online −520 ms, phòng −540 ms | Không rơi mẫu |
| 2, loa, nói chồng | `s2-loa` | Như cảnh 1, track `s2-chong` | 243 s | (căn lúc chấm) | Không rơi mẫu |
| 3, tai nghe có dây | — | — | — | — | **Bỏ**: không có tai nghe có dây. Mốc "không vọng" lấy từ phương án `doi-chung-playback` (whisper nghe thẳng bản số của tiếng online) |
| 4, chỉ micro, 1 m | `s4-1m` | Điện thoại phát `canh4-phong.wav` cách laptop 1 m | 300 s | +400 ms | Không rơi mẫu |
| 4, chỉ micro, 3 m | `s4-3m` | Như trên, cách 3 m | 300 s | +17 040 ms (đi ra chỗ 3 m rồi mới bấm phát) | Không rơi mẫu |
| 4, AirPods | — | — | — | — | Chưa làm (cùng lúc với bước 8 của Task 8) |
| 5, buổi họp thật | — | — | — | — | Bỏ (tùy chọn) |
| 6, chỉ tiếng ồn | `s6-on` | Chủ dự án tạo tiếng ồn theo thông báo macOS, ngồi trước laptop | 1100 s | — | 10 mốc lời nhắc khớp lịch; không rơi mẫu |
| 7, có người nói kèm tiếng ồn | `s7-on` | Điện thoại 1 m phát `canh7-phong-ngan.wav`; gõ phím, bấm bút, gõ bàn, mỗi loại 1 phút | 205 s | +13 100 ms | Không rơi mẫu |
| Lệch đồng hồ | `lech-30p` | Video YouTube qua loa (tap toàn hệ thống) và micro | 1800 s (âm thanh máy 1780 s) | — | Không rơi mẫu |

## Mức âm lượng micro (envelope 10 ms)

- **Tiếng vọng từ loa laptop** (lượt khởi động, track online): âm thanh máy −25,8 dBFS, micro −34,9 dBFS. Tiếng vọng nhỏ
  hơn bản số khoảng 9 dB.
- **Độ trễ vọng ở cảnh 1:** −20 ms. Trong hai file, micro đi trước âm thanh máy 20 ms vì đường thu qua tap trễ hơn đường
  micro. Ghép cặp theo chỉ số như app thì cổng nhường lời đóng sau lúc tiếng vọng bắt đầu khoảng 20 ms, cộng một khung đo
  10 ms.
- **Điện thoại 1 m (`s4-1m`, 60 giây đầu):** p50 −38,2, p90 −31,6, p99 −24,7 dBFS. Tiếng nhỏ dần sau giây 50 (p95 từ
  khoảng −30 xuống khoảng −37).
- **Giọng thật của chủ dự án ở 1 m, nói bình thường** (`hieu-chinh-giong-1m`, 15 s): p50 −45,2, p90 −39,8, p99 −32,6
  dBFS, nhỏ hơn điện thoại khoảng 7–8 dB.
- **Điện thoại 3 m (`s4-3m`):** p50 −45,8, p90 −40,0, p99 −29,3 dBFS.
- **Nền phòng:** khoảng −46 đến −48 dBFS.
- **Tiếng ồn ở cảnh 6:** p50 của mọi loại khoảng −44 đến −46 dBFS (gần nền), nhưng đỉnh rất cao:

| Loại | p99 | Đỉnh |
|---|---|---|
| Gõ phím laptop | −27,4 | −7,5 |
| Bàn phím cơ | −27,8 | −13,0 |
| Bấm bút | −26,2 | −14,3 |
| Viết bút | −29,5 | −10,1 |
| Gõ bàn | −29,7 | −18,3 |
| Lật giấy | −25,5 | −8,1 |
| Đặt cốc | −27,8 | −15,7 |
| Kéo ghế | −27,3 | −13,9 |
| Quạt | −28,2 | −13,0 |

## Lệch đồng hồ (S-M4)

`lech-30p`, tính từ giây 21 (khi video đã chạy và cả hai luồng chạy đều):
- **Trôi: −0,1 mẫu mỗi phút (khoảng 0,1 ppm).** Thực tế không trôi: micro và loa tích hợp có lẽ dùng chung một đồng hồ phần
  cứng.
- **Dao động: 320 mẫu (20 ms)**, dưới xa ngưỡng 1600 mẫu (100 ms) mà `Mixer2` bắt đầu phát riêng phần dư.
- **Kết luận:** với micro và loa tích hợp thì không cần phương án dự phòng của spec §5.1 (gắn micro vào aggregate của tap).
  Micro USB hay Bluetooth chưa đo.

## Phát hiện cần đưa vào Task 19 (chưa phải kết quả chốt)

Chấm nhanh bằng phương án không lọc (`N-khong-v5-m250`, tham số VAD mặc định của app):
- **VAD bỏ sót nhiều giọng nhỏ:**
  - `s4-1m`: 28% câu giữ được, lỗi 74%.
  - `s4-3m`: 7/25 clip có chữ.
  - `s7-on`: 6/48 clip có chữ.
- **Khuếch đại micro cố định trước VAD và whisper** (`s4-1m`):
  - +10 dB: giữ 60%, lỗi 47%.
  - +20 dB: giữ 60%, lỗi 44%.
- Giọng người thật ở 1 m còn nhỏ hơn điện thoại khoảng 7–8 dB, nên **lớp tự cân mức (AGC) cho micro có lẽ là cần thiết**
  (spec §2 để ngỏ, §6.3 "độ nhạy micro"). Task 19 phải đo thêm các phương án khuếch đại hay AGC trên chính các bản thu này,
  rồi đưa chủ dự án quyết.
