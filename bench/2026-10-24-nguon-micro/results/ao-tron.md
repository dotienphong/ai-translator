# Chữ ảo và giọng online nhỏ ở chế độ Âm thanh máy + Micro (2026-10-25)

Đo sau lượt A7 (`bench/phase1/results/acceptance/a7-mac-micro.md`). Phiên A7 chạy chế độ trộn với nguồn toàn hệ thống.
Bản chép lời của phiên (màn Lịch sử) có 73 câu được giữ: 72 câu là "Thank you." (một, hai hay ba lần), 1 câu "Hello.". Không
lần phát nào của câu mẫu được nhận đúng. Chủ dự án yêu cầu đo chữ ảo ở chế độ trộn.

## Kết luận

- **Chế độ trộn không sinh chữ ảo trong khoảng lặng giữa các câu** khi giọng online ở mức bình thường: 0 câu ảo trong 10,8 phút,
  khoảng lặng 1–8 giây. Phòng im lặng 90 giây chỉ có micro: 0 đoạn.
- **Lỗi ở A7 là giới hạn của bộ nhường lời.** Bộ nhường lời chỉ hạ micro khi âm thanh máy vượt −55 dBFS (mức tuyệt đối).
  - File câu mẫu `public/listen-test-en.wav` (câu "Nghe thử" của onboarding) rất nhỏ: −65 dBFS. Giọng trong cuộc họp bình
    thường khoảng −20 đến −35 dBFS.
  - Âm thanh máy ở A7 vì thế ở khoảng −62 dBFS khi có tiếng, dưới ngưỡng, nên micro không bao giờ bị hạ (log: `micro bị hạ
    Some(0.0)` suốt phiên).
  - Micro được khuếch đại tới +20 dB. Tiếng nền phòng −45 dBFS thành khoảng −25 dBFS, to hơn giọng sạch của âm thanh máy
    khoảng 35 dB, nên whisper nghe chủ yếu tiếng nền và tiếng vọng nhỏ từ loa, rồi ra "Thank you.".
- **Khi nào hỏng:** giọng online dưới khoảng −55 dBFS, và tiếng nền phòng qua micro to hơn giọng đó. Ngoài đời là một người
  online nói rất nhỏ (micro của họ yếu, hay âm lượng phát bị hạ bằng phần mềm trước khi tới tap). Chế độ Âm thanh máy vẫn
  nhận đúng người này.

## Điều kiện

- MacBook Pro M4 Pro, macOS 26.6.2, loa và micro tích hợp, loa 60%.
- `latency-bench mix-eval` với `asr-worker` có Metal (như bản phát hành), gói Chuẩn (`ggml-large-v3-turbo-q5_0`).
- Phương án `variants/ao-tron.json`, gồm:
  - `MOI-rnn-m600`: chế độ trộn của app;
  - `PB-app`: chỉ âm thanh máy, VAD 0,5/250/50;
  - `PB-500`: chỉ âm thanh máy, VAD 0,5/600/500;
  - `CHOT2-mic`: chỉ micro, như app.

## 1. Cảnh `ao-tron`: giọng online mức bình thường, nhiều khoảng lặng

Track dựng bằng `build_ao_tron.py`, dài 10,8 phút, chỉ có giọng online (phát qua loa nên micro nghe tiếng vọng):
- câu mẫu lặp 48 lần, cách 1 giây;
- 30 clip năm tiếng của `s1-luot`, cách 1, 2, 4, 8 giây.

Mọi clip được đưa về −26 dBFS. Thu bằng `run_scene_macos.sh` (tap theo pid của `afplay`).

Bản thu đầu bị lệch: tap bắt đầu trễ 2 690 ms so với micro. Độ lệch đo bằng tương quan đường bao ở giây 30, 150, 300, 450,
600 đều ra 2 690 ms, nên lệch cố định, không trôi. `score_mix.py --echo-delay` chỉ dò trong ±1 giây nên báo sai (880 ms).
`mix-eval` ghép mẫu theo vị trí, nên lần chấm đầu cho số sai: trộn 26,0%, 6 câu ảo. Lỗi đó do câu online bị chép hai lần
vì tiếng vọng tới sau thời gian giữ.

Cảnh `ao-tron-can`: hai file micro đã cắt 2 690 ms đầu, sau đó độ trễ vọng đo được là 0 ms.

| Phương án | Lỗi online | Câu ảo |
|---|---|---|
| `PB-app` | 8,5% | 0 |
| `PB-500` | 4,9% | 0 |
| **`MOI-rnn-m600`** | **5,2%** | **0** |
| `CHOT2-mic` | 5,4% | 0 |

## 2. Phòng im lặng (`im-lang`)

Chỉ micro, 90 giây, nền −45 dBFS (đỉnh −21,5 dBFS). `CHOT2-mic` và `CHOT2-khong-m250` (lọc ồn tắt): 0 đoạn.

## 3. Tap toàn hệ thống cùng micro (`he-thong-mic`, `tap-vol-*`)

- `Capture.app` không có `--pid` (`SystemExceptSelf`, như app), câu mẫu phát lặp qua loa. Âm thanh máy khi có tiếng
  −62 đến −66 dBFS, micro −42 đến −50 dBFS.
- Tap toàn hệ thống lấy âm trước thanh âm lượng: ở 100% và 30% đều −62 dBFS. Mức nhỏ là do chính file mẫu (−65 dBFS).
- Chép 25 giây:
  - `PB-app`: đúng (3/4 câu đúng nguyên văn);
  - `CHOT2-mic`: 0 đoạn;
  - `MOI-rnn-m600`: "you", "and we will stay to find the best system…", "so", "The results of the activity of the system
    is the same as the local government.".
- Tái hiện được lỗi của A7. Trên bản release, chế độ trộn với nguồn toàn hệ thống cũng ra câu sai lặp lại ("we start to play
  around with the system that we can see and"). Chế độ Âm thanh máy với cùng nguồn thì đúng.

## 4. Giọng online nhỏ dần

Âm thanh máy lấy từ `ao-tron`, hạ 10, 20, 30, 36 dB. Có hai cách giả lập micro:
- `ao-tron-h*`: micro giữ bản thu của `ao-tron-can`, tức micro vẫn nghe loa to và rõ;
- `nen-h*`: micro chỉ có tiếng nền phòng thật (lặp từ `im-lang`, −45 dBFS), không có tiếng vọng. Đây là trường hợp người
  online nói nhỏ.

| Giọng online | `nen-h*`: trộn | `ao-tron-h*`: trộn | Chỉ âm thanh máy (`PB-app`) |
|---|---|---|---|
| −36 dBFS | 5,1% | 5,9% | 8,2% |
| −46 dBFS | 5,8% | 6,4% | 9,1% |
| −56 dBFS | **13,7%** | 12,9% | 9,1% |
| −62 dBFS | **80,0%** | 6,1% | 12,5% |

Không phương án nào có câu ảo ngoài khung clip. Hỏng là hỏng nội dung câu (whisper nghe tiếng nền thay cho giọng).

## Hướng xử lý (chờ chủ dự án chọn)

1. **Chấp nhận, ghi giới hạn.** Website và ghi chú trong app: ở chế độ Âm thanh máy + Micro, người online nói rất nhỏ có thể
   bị nhận sai, khi đó dùng chế độ Âm thanh máy.
2. **Hạ ngưỡng nhường lời** (ví dụ −65 hay −70 dBFS). Đổi một hằng số, nhưng âm thanh máy nhỏ (nhạc nền, thông báo) cũng
   làm micro bị hạ. Phải đo lại A-trộn (cảnh 1, 2) và `nen-h*`.
3. **Ngưỡng tương đối:** hạ micro khi âm thanh máy có tiếng (VAD của âm thanh máy, hay mức so với nền của chính nó) thay vì
   so với mức tuyệt đối. Sửa nhiều hơn, cần test mới.

Dữ liệu (không commit): `data/scenes/{ao-tron,ao-tron-can,ao-tron-h*,nen-h*,im-lang,he-thong-mic,tap-vol-*}`,
`data/results/…`.
