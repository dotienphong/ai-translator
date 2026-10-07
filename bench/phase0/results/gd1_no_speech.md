# no_speech_prob và luật lọc trên âm thanh không có tiếng nói (Đ12, Q11 của review 02b)

Sinh từ `crates/pipeline/tests/no_speech.rs` (kế hoạch Phase 1 · 02b, Task 6): 14 tín hiệu tổng hợp và mười file nhạc
không lời (mỗi file tối đa 10 đoạn 8 giây), qua Silero VAD của app và `asr-worker` thật, rồi luật lọc của app
(`filter::verdict`). "Hiện thành phụ đề" nghĩa là VAD cắt ra ít nhất một đoạn và luật lọc giữ chữ.

## Kết luận

- large-v3-turbo-q5_0: 112 đoạn; VAD cắt ra đoạn ở 3 đoạn ({'Hallucination': 3}); hiện thành phụ đề: 0.
  Chữ bịa "Thank you." ở 4 đoạn, `avg_logprob` từ -0.68 tới -0.48 (cả đoạn 8 giây gửi nguyên cho worker): chỉ số này không đủ để nhận ra chữ bịa.
- small-q5_1: 112 đoạn; VAD cắt ra đoạn ở 3 đoạn ({'Filler': 2, 'NoSpeech': 1}); hiện thành phụ đề: 0.
- Không có VAD (cột "Luật lọc" của các dòng VAD = 0) thì turbo bịa chữ cho hầu hết tín hiệu, vì `no_speech_prob`
  của turbo luôn cỡ 1e-10; Silero VAD của app là lớp chặn chính, luật câu đệm và nhãn có ngoặc chặn phần lọt qua.

## Điều kiện nhận luật mới (QĐ24)

- A4 (`out-m4pro-{turbo,small}-final.jsonl`, 548 clip mỗi model): luật câu đệm và luật chuỗi lặp không bỏ clip nào;
  tỉ lệ nén lớn nhất của chữ thật là 1,54 ở cả hai model, dưới ngưỡng 2,4. Luật `no_speech` của Phase 0 vẫn bỏ
  đúng một clip của small (`en-9810650684898829002_nb`, chữ bịa) như trước. Test
  `phase1_rules_drop_no_a4_clip`.
- S6 (12 lượt cấu hình chốt, 528 đoạn): luật câu đệm bỏ thêm 2 đoạn của gói Chuẩn, cả hai có chữ sai: đoạn 26 của `en`
  (32 ms ngay sau một câu, chép thành "Thank you.") và đoạn 45 của `vi` (đuôi câu "… ở Las Cañitas.", chép thành
  "Cảm ơn"). Bản chép đúng ở hai chỗ đó không có "Thank you" hay "Cảm ơn". Test
  `phase1_filler_rule_drops_only_known_hallucinations_on_s6`.

## Kiểm chéo turbo bằng công cụ khác (lúc lập kế hoạch)

faster-whisper 1.2.1 (CTranslate2 4.8.2, CPU, int8, `beam_size=1`, `temperature=0`, không VAD, không lọc), model
`large-v3-turbo`, cùng ba tín hiệu của `no_speech.rs` (im lặng, ù điện 50 Hz −26 dBFS, gõ phím −30 dBFS; 3 và 8 giây):
`no_speech_prob` từ 3,6e-11 tới 1,5e-10, chữ "Thank you." hoặc "you", có hay không khóa ngôn ngữ. Model `small` qua
cùng công cụ: 0,68 tới 0,92. Vậy `no_speech_prob` cỡ 1e-10 là tính chất của turbo, không phải lỗi đọc của chế độ B.
Script đối chiếu (faster-whisper trong một venv riêng) nằm ngoài repo, theo quyết định Q11(1) của controller: chỉ
commit bảng kết quả; các thông số ở trên đủ để chạy lại.

## Bộ nhạc thử

Wikimedia Commons, giấy phép đọc từ API của Commons (`extmetadata.LicenseShortName`) ngày 2026-10-01. Không lưu audio
trong repo; tải lại bằng 02b Task 6, Step 2.

| Tên | File trên Commons | Giấy phép |
|---|---|---|
| ambient-ck61 | [Ambient music test, Yamaha CK61.flac](https://commons.wikimedia.org/wiki/File:Ambient_music_test%2C_Yamaha_CK61.flac) | CC0 |
| dvorak-largo | [Antonin Dvorak - symphony no. 9 in e minor 'from the new world', op. 95 - ii. largo.ogg](https://commons.wikimedia.org/wiki/File:Antonin_Dvorak_-_symphony_no._9_in_e_minor_%27from_the_new_world%27%2C_op._95_-_ii._largo.ogg) | Public domain |
| vivaldi-rv425 | [Antonio Vivaldi, Mandolin Concerto in C major, RV 425.ogg](https://commons.wikimedia.org/wiki/File:Antonio_Vivaldi%2C_Mandolin_Concerto_in_C_major%2C_RV_425.ogg) | PDM-owner |
| bach-aria | [Bach, Goldberg Variations, Aria (Musopen version).ogg](https://commons.wikimedia.org/wiki/File:Bach%2C_Goldberg_Variations%2C_Aria_%28Musopen_version%29.ogg) | CC0 |
| komiku-46 | [Komiku - 46 - Merfolk Music Box.ogg](https://commons.wikimedia.org/wiki/File:Komiku_-_46_-_Merfolk_Music_Box.ogg) | CC0 |
| lofi-001 | [Lofi music 001.wav](https://commons.wikimedia.org/wiki/File:Lofi_music_001.wav) | CC0 |
| lfm-01 | [Loyalty Freak Music - 01 - Monster Parade.ogg](https://commons.wikimedia.org/wiki/File:Loyalty_Freak_Music_-_01_-_Monster_Parade.ogg) | CC0 |
| lfm-08 | [Loyalty Freak Music - 08 - Beach.ogg](https://commons.wikimedia.org/wiki/File:Loyalty_Freak_Music_-_08_-_Beach.ogg) | CC0 |
| lfm-13 | [Loyalty Freak Music - 13 - Work.ogg](https://commons.wikimedia.org/wiki/File:Loyalty_Freak_Music_-_13_-_Work.ogg) | CC0 |
| techno-001 | [Techno music 001.wav](https://commons.wikimedia.org/wiki/File:Techno_music_001.wav) | CC0 |

## large-v3-turbo-q5_0 (metal)

| Tín hiệu | VAD cắt ra | Xác suất VAD | no_speech_prob | avg_logprob | Tỉ lệ nén | Luật lọc | Chữ |
|---|---|---|---|---|---|---|---|
| im lặng 3s | 0 | — | 1.3e-10 | -1.56 | 0.27 | Filler | you |
| nhiễu trắng −60 dBFS 3s | 0 | — | 7.3e-11 | -2.58 | 0.27 | Hallucination | ... |
| nhiễu trắng −30 dBFS 3s | 0 | — | 7.2e-11 | -2.95 | 0.20 | Filler | so |
| nhiễu hồng −26 dBFS 3s | 0 | — | 6.4e-11 | -1.82 | 0.73 | Speech | I'm going to go. |
| ù điện 50 Hz −26 dBFS 3s | 0 | — | 1.1e-10 | -2.13 | 0.27 | Filler | you |
| gõ phím −30 dBFS 3s | 0 | — | 4.9e-11 | -0.60 | 0.56 | Speech | Thank you. |
| hợp âm −20 dBFS 3s | 0 | — | 9.7e-11 | -1.16 | 0.79 | Hallucination | ... ... ... |
| im lặng 8s | 0 | — | 1.3e-10 | -1.56 | 0.27 | Filler | you |
| nhiễu trắng −60 dBFS 8s | 0 | — | 7.6e-11 | -1.90 | 0.27 | Hallucination | ... |
| nhiễu trắng −30 dBFS 8s | 0 | — | 1e-10 | -2.12 | 0.20 | Filler | so |
| nhiễu hồng −26 dBFS 8s | 0 | — | 7.9e-11 | -2.17 | 0.27 | Hallucination | ... |
| ù điện 50 Hz −26 dBFS 8s | 0 | — | 1.2e-10 | -2.99 | 0.27 | Filler | You |
| gõ phím −30 dBFS 8s | 0 | — | 5.5e-11 | -0.50 | 0.56 | Speech | Thank you. |
| hợp âm −20 dBFS 8s | 0 | — | 1.3e-10 | -3.14 | 0.27 | Hallucination | ... |
| ambient-ck61.wav #0 | 0 | — | 1.2e-10 | -2.58 | 0.27 | Speech | I'm |
| ambient-ck61.wav #1 | 0 | — | 1.9e-10 | -3.07 | 0.27 | Hallucination | ... |
| ambient-ck61.wav #2 | 0 | — | 1.7e-10 | -3.10 | 0.27 | Speech | The |
| ambient-ck61.wav #3 | 0 | — | 2.5e-10 | -2.87 | 0.27 | Speech | The |
| ambient-ck61.wav #4 | 0 | — | 1.4e-10 | -2.41 | 0.76 | Speech | The next step is to make a new one. |
| ambient-ck61.wav #5 | 0 | — | 1.7e-10 | -2.37 | 0.76 | Speech | The next step is to make a new one. |
| ambient-ck61.wav #6 | 0 | — | 1.7e-10 | -2.48 | 0.77 | Speech | The next step is to make a new life. |
| ambient-ck61.wav #7 | 0 | — | 1.5e-10 | -2.42 | 0.76 | Speech | The next step is to make a new one. |
| ambient-ck61.wav #8 | 0 | — | 1.7e-10 | -2.38 | 0.76 | Speech | The next step is to make a new one. |
| ambient-ck61.wav #9 | 0 | — | 2.7e-10 | -2.96 | 0.27 | Hallucination | ... |
| bach-aria.wav #0 | 0 | — | 2.3e-10 | -3.09 | 0.11 | Hallucination | . |
| bach-aria.wav #1 | 0 | — | 3e-10 | -3.06 | 0.27 | Hallucination | ... |
| bach-aria.wav #2 | 0 | — | 2.5e-10 | -2.87 | 0.27 | Hallucination | ... |
| bach-aria.wav #3 | 0 | — | 2e-10 | -2.70 | 0.27 | Hallucination | ... |
| bach-aria.wav #4 | 0 | — | 2.1e-10 | -2.49 | 0.27 | Hallucination | ... |
| bach-aria.wav #5 | 0 | — | 1.8e-10 | -1.91 | 0.80 | Speech | I'm not sure what I'm doing. |
| bach-aria.wav #6 | 0 | — | 2.9e-10 | -2.69 | 0.27 | Hallucination | ... |
| bach-aria.wav #7 | 0 | — | 1.9e-10 | -2.90 | 0.27 | Hallucination | ... |
| bach-aria.wav #8 | 0 | — | 3.8e-10 | -2.83 | 0.27 | Hallucination | ... |
| bach-aria.wav #9 | 0 | — | 3.2e-10 | -3.17 | 0.27 | Speech | The |
| dvorak-largo.wav #0 | 0 | — | 1.7e-10 | -2.69 | 0.38 | Speech | Music |
| dvorak-largo.wav #1 | 0 | — | 2e-10 | -2.28 | 0.11 | Hallucination | . |
| dvorak-largo.wav #2 | 0 | — | 3.7e-10 | -0.93 | 0.38 | Speech | Amen. |
| dvorak-largo.wav #3 | 0 | — | 1.9e-10 | -2.40 | 0.27 | Hallucination | ... |
| dvorak-largo.wav #4 | 0 | — | 1.2e-10 | -2.52 | 0.11 | Hallucination | . |
| dvorak-largo.wav #5 | 0 | — | 1.5e-10 | -2.19 | 0.27 | Hallucination | ... |
| dvorak-largo.wav #6 | 0 | — | 1e-10 | -2.40 | 0.27 | Hallucination | ... |
| dvorak-largo.wav #7 | 0 | — | 2e-10 | -2.70 | 0.27 | Hallucination | ... |
| dvorak-largo.wav #8 | 0 | — | 1.2e-10 | -2.92 | 0.11 | Hallucination | . |
| dvorak-largo.wav #9 | 0 | — | 6.9e-11 | -2.36 | 0.27 | Hallucination | ... |
| komiku-46.wav #0 | 0 | — | 1.3e-10 | -2.73 | 0.27 | Hallucination | ... |
| komiku-46.wav #1 | 0 | — | 1.7e-10 | -2.97 | 0.11 | Hallucination | . |
| komiku-46.wav #2 | 0 | — | 1.8e-10 | -1.80 | 0.27 | Filler | you |
| komiku-46.wav #3 | 0 | — | 1.8e-10 | -2.62 | 0.11 | Hallucination | . |
| komiku-46.wav #4 | 0 | — | 1.7e-10 | -1.87 | 0.27 | Filler | you |
| komiku-46.wav #5 | 0 | — | 1.3e-10 | -2.29 | 0.27 | Hallucination | ... |
| komiku-46.wav #6 | 0 | — | 1.2e-10 | -2.24 | 0.27 | Hallucination | ... |
| komiku-46.wav #7 | 0 | — | 1.1e-10 | -0.48 | 0.56 | Speech | Thank you. |
| lfm-01.wav #0 | 0 | — | 6e-11 | -2.67 | 0.27 | Hallucination | ... |
| lfm-01.wav #1 | 0 | — | 5.2e-11 | -2.25 | 0.27 | Hallucination | ... |
| lfm-01.wav #2 | 0 | — | 5.2e-11 | -2.70 | 0.27 | Hallucination | ... |
| lfm-01.wav #3 | 0 | — | 9.6e-11 | -2.93 | 0.20 | Speech | Oh |
| lfm-01.wav #4 | 0 | — | 4.9e-11 | -2.21 | 0.43 | Speech | 見て |
| lfm-01.wav #5 | 0 | — | 1.1e-10 | -1.89 | 0.73 | Speech | I'm going to go. |
| lfm-01.wav #6 | 0 | — | 8.2e-11 | -3.22 | 0.27 | Hallucination | ... |
| lfm-01.wav #7 | 0 | — | 4.5e-11 | -2.36 | 0.27 | Hallucination | ... |
| lfm-01.wav #8 | 0 | — | 8.4e-11 | -0.84 | 0.38 | Speech | Whoa! |
| lfm-01.wav #9 | 0 | — | 8.8e-11 | -2.82 | 0.20 | Speech | Oh |
| lfm-08.wav #0 | 0 | — | 1.3e-10 | -1.82 | 0.82 | Speech | I'm going to go to the next episode of t |
| lfm-08.wav #1 | 0 | — | 1.1e-10 | -3.00 | 0.27 | Hallucination | ... |
| lfm-08.wav #2 | 0 | — | 1.6e-10 | -2.94 | 0.27 | Hallucination | ... |
| lfm-08.wav #3 | 1 | 0.81 | 9.3e-11 | -2.93 | 0.27 | Hallucination | ... |
| lfm-08.wav #4 | 0 | — | 1.5e-10 | -3.32 | 0.27 | Hallucination | ... |
| lfm-08.wav #5 | 0 | — | 1.7e-10 | -3.05 | 0.27 | Hallucination | ... |
| lfm-08.wav #6 | 0 | — | 1.4e-10 | -3.07 | 0.27 | Hallucination | ... |
| lfm-08.wav #7 | 0 | — | 1.1e-10 | -3.17 | 0.27 | Speech | The |
| lfm-08.wav #8 | 0 | — | 7.3e-11 | -2.99 | 0.27 | Hallucination | ... |
| lfm-08.wav #9 | 0 | — | 9.5e-11 | -3.01 | 0.27 | Hallucination | ... |
| lfm-13.wav #0 | 0 | — | 1.1e-10 | -2.30 | 0.38 | Speech | Music |
| lfm-13.wav #1 | 0 | — | 7.3e-11 | -2.67 | 0.27 | Hallucination | ... |
| lfm-13.wav #2 | 0 | — | 5.6e-11 | -2.47 | 0.27 | Hallucination | ... |
| lfm-13.wav #3 | 0 | — | 8e-11 | -3.08 | 0.27 | Hallucination | ... |
| lfm-13.wav #4 | 0 | — | 1e-10 | -2.87 | 0.27 | Hallucination | ... |
| lfm-13.wav #5 | 0 | — | 8.9e-11 | -2.79 | 0.27 | Hallucination | ... |
| lfm-13.wav #6 | 0 | — | 7.4e-11 | -3.04 | 0.27 | Hallucination | ... |
| lfm-13.wav #7 | 0 | — | 8.7e-11 | -3.04 | 0.27 | Hallucination | ... |
| lfm-13.wav #8 | 0 | — | 8.6e-11 | -2.43 | 0.27 | Hallucination | ... |
| lfm-13.wav #9 | 0 | — | 8.7e-11 | -2.84 | 0.27 | Hallucination | ... |
| lofi-001.wav #0 | 0 | — | 7.9e-11 | -3.03 | 0.38 | Speech | Music |
| lofi-001.wav #1 | 0 | — | 8.3e-11 | -1.55 | 1.60 | Speech | I'm going to go ahead and get the same t |
| lofi-001.wav #2 | 0 | — | 1e-10 | -1.79 | 0.93 | Speech | I'm going to go ahead and get the rest o |
| lofi-001.wav #3 | 0 | — | 7.5e-11 | -2.28 | 0.27 | Speech | I'm |
| lofi-001.wav #4 | 0 | — | 7e-11 | -2.18 | 0.27 | Speech | I'm |
| lofi-001.wav #5 | 0 | — | 1e-10 | -2.55 | 0.20 | Filler | so |
| lofi-001.wav #6 | 0 | — | 6.6e-11 | -2.32 | 0.27 | Speech | I'm |
| lofi-001.wav #7 | 0 | — | 7.3e-11 | -2.21 | 0.27 | Speech | I'm |
| lofi-001.wav #8 | 0 | — | 9.4e-11 | -2.71 | 0.27 | Hallucination | ... |
| lofi-001.wav #9 | 0 | — | 9.4e-11 | -1.74 | 0.93 | Speech | I'm going to go ahead and get the rest o |
| techno-001.wav #0 | 0 | — | 1.1e-10 | -2.68 | 0.38 | Speech | Music |
| techno-001.wav #1 | 0 | — | 9.5e-11 | -1.19 | 0.33 | Speech | Hey! |
| techno-001.wav #2 | 0 | — | 6.3e-11 | -2.26 | 0.11 | Hallucination | . |
| techno-001.wav #3 | 0 | — | 6.5e-11 | -3.02 | 0.20 | Filler | so |
| techno-001.wav #4 | 0 | — | 6.8e-11 | -2.45 | 0.27 | Hallucination | ... |
| techno-001.wav #5 | 0 | — | 7.6e-11 | -2.79 | 0.27 | Hallucination | ... |
| techno-001.wav #6 | 0 | — | 8.3e-11 | -2.47 | 0.20 | Filler | so |
| techno-001.wav #7 | 0 | — | 9e-11 | -3.14 | 0.20 | Filler | So |
| techno-001.wav #8 | 0 | — | 8.4e-11 | -2.14 | 0.11 | Hallucination | . |
| techno-001.wav #9 | 0 | — | 6.3e-11 | -2.90 | 0.20 | Filler | so |
| vivaldi-rv425.wav #0 | 0 | — | 1.2e-10 | -3.18 | 0.38 | Speech | Music |
| vivaldi-rv425.wav #1 | 0 | — | 4.1e-11 | -0.68 | 0.56 | Speech | Thank you. |
| vivaldi-rv425.wav #2 | 0 | — | 7.4e-11 | -2.52 | 0.27 | Hallucination | ... |
| vivaldi-rv425.wav #3 | 0 | — | 1.4e-10 | -0.54 | 0.33 | Hallucination | ¶¶ |
| vivaldi-rv425.wav #4 | 0 | — | 9.5e-11 | -3.08 | 0.27 | Hallucination | ... |
| vivaldi-rv425.wav #5 | 1 | 0.54 | 1.4e-10 | -0.61 | 0.33 | Hallucination | ¶¶ |
| vivaldi-rv425.wav #6 | 1 | 0.81 | 1.3e-10 | -1.27 | 0.38 | Hallucination | . . . |
| vivaldi-rv425.wav #7 | 0 | — | 8.7e-11 | -2.30 | 0.27 | Hallucination | ... |
| vivaldi-rv425.wav #8 | 0 | — | 6.8e-11 | -1.15 | 0.38 | Hallucination | . . . |
| vivaldi-rv425.wav #9 | 0 | — | 6.5e-11 | -2.40 | 0.27 | Hallucination | ... |

## small-q5_1 (metal)

| Tín hiệu | VAD cắt ra | Xác suất VAD | no_speech_prob | avg_logprob | Tỉ lệ nén | Luật lọc | Chữ |
|---|---|---|---|---|---|---|---|
| im lặng 3s | 0 | — | 0.94 | -0.85 | 0.27 | Filler | you |
| nhiễu trắng −60 dBFS 3s | 0 | — | 0.85 | -2.50 | 0.27 | NoSpeech | you |
| nhiễu trắng −30 dBFS 3s | 0 | — | 0.75 | -3.21 | 0.27 | NoSpeech | you |
| nhiễu hồng −26 dBFS 3s | 0 | — | 0.74 | -3.19 | 0.27 | NoSpeech | you |
| ù điện 50 Hz −26 dBFS 3s | 0 | — | 0.88 | -1.53 | 0.27 | NoSpeech | you |
| gõ phím −30 dBFS 3s | 0 | — | 0.77 | -1.81 | 0.62 | NoSpeech | Hi, I'm Mike. |
| hợp âm −20 dBFS 3s | 0 | — | 0.79 | -2.32 | 0.27 | NoSpeech | you |
| im lặng 8s | 0 | — | 0.94 | -0.85 | 0.27 | Filler | you |
| nhiễu trắng −60 dBFS 8s | 0 | — | 0.7 | -2.89 | 0.11 | NoSpeech | . |
| nhiễu trắng −30 dBFS 8s | 0 | — | 0.62 | -2.92 | 0.27 | NoSpeech | you |
| nhiễu hồng −26 dBFS 8s | 0 | — | 0.65 | -2.76 | 0.27 | NoSpeech | you |
| ù điện 50 Hz −26 dBFS 8s | 0 | — | 0.48 | -2.56 | 0.27 | Filler | you |
| gõ phím −30 dBFS 8s | 0 | — | 0.77 | -1.51 | 0.71 | NoSpeech | Hi, I'm D-O-R-A-N-G. |
| hợp âm −20 dBFS 8s | 0 | — | 0.53 | -3.20 | 0.27 | Filler | you |
| ambient-ck61.wav #0 | 0 | — | 0.071 | -3.24 | 0.38 | Speech | Music |
| ambient-ck61.wav #1 | 0 | — | 0.32 | -3.39 | 0.20 | Speech | Oh |
| ambient-ck61.wav #2 | 0 | — | 0.29 | -3.25 | 0.27 | Filler | you |
| ambient-ck61.wav #3 | 0 | — | 0.17 | -2.80 | 0.20 | Speech | Oh |
| ambient-ck61.wav #4 | 0 | — | 0.33 | -3.33 | 0.27 | Filler | you |
| ambient-ck61.wav #5 | 0 | — | 0.37 | -2.89 | 0.27 | Filler | you |
| ambient-ck61.wav #6 | 0 | — | 0.17 | -3.34 | 0.27 | Filler | you |
| ambient-ck61.wav #7 | 0 | — | 0.28 | -3.02 | 0.27 | Filler | you |
| ambient-ck61.wav #8 | 0 | — | 0.19 | -2.95 | 0.27 | Filler | you |
| ambient-ck61.wav #9 | 0 | — | 0.19 | -3.12 | 0.27 | Filler | you |
| bach-aria.wav #0 | 0 | — | 0.22 | -3.79 | 0.38 | Speech | Music |
| bach-aria.wav #1 | 0 | — | 0.28 | -3.74 | 0.27 | Filler | you |
| bach-aria.wav #2 | 0 | — | 0.28 | -3.10 | 0.27 | Filler | you |
| bach-aria.wav #3 | 0 | — | 0.18 | -3.40 | 0.27 | Filler | you |
| bach-aria.wav #4 | 0 | — | 0.38 | -3.41 | 0.27 | Filler | you |
| bach-aria.wav #5 | 0 | — | 0.22 | -3.23 | 0.27 | Filler | you |
| bach-aria.wav #6 | 0 | — | 0.47 | -1.78 | 0.27 | Filler | you |
| bach-aria.wav #7 | 0 | — | 0.11 | -3.78 | 0.38 | Speech | Music |
| bach-aria.wav #8 | 0 | — | 0.35 | -3.49 | 0.11 | Filler | I |
| bach-aria.wav #9 | 0 | — | 0.23 | -3.42 | 0.11 | Filler | I |
| dvorak-largo.wav #0 | 0 | — | 0.091 | -2.51 | 0.38 | Speech | Music |
| dvorak-largo.wav #1 | 0 | — | 0.21 | -3.72 | 0.27 | Speech | The |
| dvorak-largo.wav #2 | 0 | — | 0.14 | -2.14 | 0.73 | Speech | I am the one who calls |
| dvorak-largo.wav #3 | 0 | — | 0.35 | -3.09 | 0.11 | Filler | I |
| dvorak-largo.wav #4 | 0 | — | 0.35 | -2.74 | 0.11 | Filler | I |
| dvorak-largo.wav #5 | 0 | — | 0.37 | -3.29 | 0.11 | Filler | I |
| dvorak-largo.wav #6 | 0 | — | 0.32 | -4.12 | 0.27 | Speech | and |
| dvorak-largo.wav #7 | 0 | — | 0.19 | -3.60 | 0.11 | Filler | I |
| dvorak-largo.wav #8 | 0 | — | 0.48 | -3.50 | 0.27 | Filler | you |
| dvorak-largo.wav #9 | 0 | — | 0.14 | -4.29 | 0.38 | Speech | Music |
| komiku-46.wav #0 | 0 | — | 0.26 | -3.33 | 0.11 | Filler | I |
| komiku-46.wav #1 | 0 | — | 0.28 | -3.65 | 0.11 | Filler | I |
| komiku-46.wav #2 | 0 | — | 0.35 | -2.13 | 0.27 | Filler | you |
| komiku-46.wav #3 | 0 | — | 0.18 | -3.60 | 0.11 | Filler | I |
| komiku-46.wav #4 | 0 | — | 0.68 | -1.63 | 0.27 | NoSpeech | you |
| komiku-46.wav #5 | 0 | — | 0.26 | -3.18 | 0.27 | Filler | you |
| komiku-46.wav #6 | 0 | — | 0.076 | -2.90 | 0.11 | Filler | I |
| komiku-46.wav #7 | 0 | — | 0.61 | -1.98 | 0.27 | NoSpeech | you |
| lfm-01.wav #0 | 0 | — | 0.1 | -3.11 | 0.11 | Filler | I |
| lfm-01.wav #1 | 0 | — | 0.35 | -3.39 | 0.27 | Filler | you |
| lfm-01.wav #2 | 0 | — | 0.41 | -3.30 | 0.27 | Filler | you |
| lfm-01.wav #3 | 0 | — | 0.2 | -3.95 | 0.27 | Speech | ん |
| lfm-01.wav #4 | 0 | — | 0.5 | -2.69 | 0.20 | Speech | Oh |
| lfm-01.wav #5 | 0 | — | 0.32 | -3.07 | 0.11 | Filler | I |
| lfm-01.wav #6 | 0 | — | 0.22 | -3.32 | 0.38 | Speech | Music |
| lfm-01.wav #7 | 0 | — | 0.38 | -3.37 | 0.27 | Filler | you |
| lfm-01.wav #8 | 0 | — | 0.33 | -1.78 | 1.02 | Speech | 2. アイドルのアイドルを使用する |
| lfm-01.wav #9 | 0 | — | 0.44 | -2.21 | 0.53 | Speech | うおぉ |
| lfm-08.wav #0 | 0 | — | 0.2 | -3.20 | 0.27 | Hallucination | ... |
| lfm-08.wav #1 | 0 | — | 0.34 | -3.38 | 0.11 | Filler | I |
| lfm-08.wav #2 | 0 | — | 0.33 | -2.85 | 0.11 | Filler | I |
| lfm-08.wav #3 | 1 | 0.81 | 0.36 | -3.09 | 0.11 | Filler | I |
| lfm-08.wav #4 | 0 | — | 0.64 | -2.54 | 0.27 | NoSpeech | you |
| lfm-08.wav #5 | 0 | — | 0.28 | -3.29 | 0.11 | Filler | I |
| lfm-08.wav #6 | 0 | — | 0.32 | -3.11 | 0.11 | Filler | I |
| lfm-08.wav #7 | 0 | — | 0.28 | -3.21 | 0.11 | Filler | I |
| lfm-08.wav #8 | 0 | — | 0.23 | -2.90 | 0.27 | Filler | you |
| lfm-08.wav #9 | 0 | — | 0.22 | -3.60 | 0.11 | Filler | I |
| lfm-13.wav #0 | 0 | — | 0.33 | -2.40 | 0.38 | Speech | Music |
| lfm-13.wav #1 | 0 | — | 0.45 | -3.50 | 0.27 | Speech | The |
| lfm-13.wav #2 | 0 | — | 0.46 | -3.55 | 0.11 | Filler | I |
| lfm-13.wav #3 | 0 | — | 0.5 | -3.24 | 0.11 | Filler | I |
| lfm-13.wav #4 | 0 | — | 0.45 | -3.33 | 0.11 | Filler | I |
| lfm-13.wav #5 | 0 | — | 0.37 | -2.98 | 0.20 | Speech | Oh |
| lfm-13.wav #6 | 0 | — | 0.46 | -3.40 | 0.27 | Filler | you |
| lfm-13.wav #7 | 0 | — | 0.44 | -3.63 | 0.27 | Speech | and |
| lfm-13.wav #8 | 0 | — | 0.46 | -3.43 | 0.27 | Hallucination | ... |
| lfm-13.wav #9 | 0 | — | 0.44 | -3.11 | 0.27 | Filler | you |
| lofi-001.wav #0 | 0 | — | 0.42 | -3.39 | 0.11 | Filler | I |
| lofi-001.wav #1 | 0 | — | 0.36 | -3.01 | 0.20 | Filler | So |
| lofi-001.wav #2 | 0 | — | 0.55 | -3.22 | 0.11 | Filler | I |
| lofi-001.wav #3 | 0 | — | 0.41 | -2.97 | 0.11 | Filler | I |
| lofi-001.wav #4 | 0 | — | 0.3 | -3.11 | 0.11 | Filler | I |
| lofi-001.wav #5 | 0 | — | 0.44 | -2.75 | 0.11 | Filler | I |
| lofi-001.wav #6 | 0 | — | 0.36 | -3.20 | 0.11 | Filler | I |
| lofi-001.wav #7 | 0 | — | 0.28 | -2.88 | 0.11 | Filler | I |
| lofi-001.wav #8 | 0 | — | 0.22 | -3.26 | 0.27 | Filler | you |
| lofi-001.wav #9 | 0 | — | 0.35 | -2.95 | 0.11 | Filler | I |
| techno-001.wav #0 | 0 | — | 0.72 | -3.12 | 0.27 | NoSpeech | you |
| techno-001.wav #1 | 0 | — | 0.42 | -3.19 | 0.27 | Filler | you |
| techno-001.wav #2 | 0 | — | 0.29 | -3.13 | 0.38 | Speech | Music |
| techno-001.wav #3 | 0 | — | 0.42 | -3.35 | 0.27 | Filler | you |
| techno-001.wav #4 | 0 | — | 0.24 | -1.99 | 0.73 | Speech | 2. アイスクリーム |
| techno-001.wav #5 | 0 | — | 0.3 | -3.47 | 0.27 | Filler | you |
| techno-001.wav #6 | 0 | — | 0.4 | -3.43 | 0.11 | Filler | I |
| techno-001.wav #7 | 0 | — | 0.43 | -3.10 | 0.27 | Filler | you |
| techno-001.wav #8 | 0 | — | 0.57 | -3.49 | 0.11 | Filler | I |
| techno-001.wav #9 | 0 | — | 0.36 | -3.25 | 0.27 | Filler | you |
| vivaldi-rv425.wav #0 | 0 | — | 0.088 | -2.88 | 0.38 | Speech | Music |
| vivaldi-rv425.wav #1 | 0 | — | 0.45 | -3.08 | 0.27 | Filler | you |
| vivaldi-rv425.wav #2 | 0 | — | 0.28 | -3.63 | 0.11 | Filler | I |
| vivaldi-rv425.wav #3 | 0 | — | 0.26 | -3.37 | 0.11 | Filler | I |
| vivaldi-rv425.wav #4 | 0 | — | 0.36 | -3.35 | 0.11 | Filler | I |
| vivaldi-rv425.wav #5 | 1 | 0.54 | 0.34 | -3.53 | 0.11 | Filler | I |
| vivaldi-rv425.wav #6 | 1 | 0.81 | 0.73 | -2.12 | 0.27 | NoSpeech | you |
| vivaldi-rv425.wav #7 | 0 | — | 0.2 | -3.62 | 0.38 | Speech | Music |
| vivaldi-rv425.wav #8 | 0 | — | 0.52 | -3.50 | 0.11 | Filler | I |
| vivaldi-rv425.wav #9 | 0 | — | 0.47 | -3.60 | 0.11 | Filler | I |
