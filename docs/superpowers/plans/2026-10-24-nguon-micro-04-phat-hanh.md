# Nguồn micro 04: pháp lý, website, spec chính, nghiệm thu và phát hành — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa tính năng nguồn micro (kế hoạch 02, 03) ra người dùng trong app 0.2.8: chính sách quyền riêng tư 1.8 và EULA 1.5 nói đúng việc thu micro, website năm ngôn ngữ hết câu "app không dùng micro" và có hướng dẫn micro, spec chính ghi F12, nghiệm thu mục 11 của spec nguồn micro có biên bản, rồi phát hành theo `docs/release/phat-hanh.md`.

**Architecture:** Văn bản pháp lý ở `docs/legal` là nguồn duy nhất: app đóng gói lúc build, website sinh hai trang pháp lý từ đó. Nội dung đổi ngay; dòng phiên bản và ngày hiệu lực chỉ đổi vào ngày phát hành (Task 12), trước khi build app. Website sửa câu cũ có test chặn quay lại (`STALE_MIC`), nội dung mới có test đối chiếu chữ với từ điển i18n của app (`appDict`). Nghiệm thu offline chạy lại `latency-bench mix-eval` trên commit ứng viên; A2, A7 chạy app thật; A1-mic và Windows cần chủ dự án.

**Tech Stack:** Markdown (`docs/legal`, spec); website tĩnh Node thuần (`website/`, `node --test`); `scripts/ui-preview/shoot.mjs` (Chrome không đầu, `cwebp`); `latency-bench mix-eval` + `score_mix.py` (uv, Python 3.12); mitmproxy + `bench/phase1/acceptance/netaudit.py`; `cargo deny`, `scripts/release/notices.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` mục 7, 8, 9, 11, 12, 13 (bước 4), 16. Mục 16 ghi đè các mục trước.

---

## Quy tắc chung

- **Worktree** `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro`, nhánh `nguon-micro`. **Mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro &&`** (shell trả cwd về thư mục chính sau mỗi lệnh). Lệnh website: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website &&`. Trước mỗi commit chạy `git branch --show-current` (phải ra `nguon-micro`); chỉ `git add` đúng file của task.
- **Không merge, push, deploy, đẩy tag** khi chủ dự án chưa cho phép (Task 12 hỏi). **Không phát tiếng ra loa, không mở micro** trên máy chủ dự án khi chưa hỏi (Task 8, 9).
- Sửa văn bản bằng công cụ **Edit**. Bước sửa ghi `Tệp: …` rồi cặp khối ` ```old ` (nguyên văn hiện tại) và ` ```new `. Khối `old` phải khớp **đúng một lần** trong tệp; không khớp hay khớp nhiều lần thì dừng và báo, đừng đoán. Trong bảng nhiều ngôn ngữ, mỗi ô "Thay" là `old_string`, ô "Bằng" là `new_string`.
- Chuỗi trong tệp `.mjs`: phần thân trang (`body: () => \``) là template literal nên `href="…"` viết thẳng; chuỗi JS trong nháy kép (`lead: "…"`, mục `checkList([...])`, mục `steps`) phải escape thành `href=\"…\"`. Kế hoạch ghi đúng dạng như trong tệp.
- **Chỉ nói điều có thật** (CLAUDE.md, `website/README.md`): không nêu tên thư viện hay kỹ thuật (không "RNNoise", "nnnoiseless", "AEC", "WebRTC", "Silero", "whisper") trên website; số đo kèm điều kiện đo. Sửa một trang thì sửa đủ vi/en/ja/zh/ko; bản ja/zh/ko cùng khung với en (`website/test/i18n-content.test.mjs`: cùng số h2, cùng `id`, cùng liên kết, không có câu tiếng Anh từ năm từ Latin liền nhau).
- Tên chữ trên giao diện lấy đúng từ `src/i18n/<lang>.ts` (bảng dưới). Test của Task 4 đối chiếu bằng `appDict`.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Chữ của app dùng trên website

| Khóa | vi | en | ja | zh | ko |
|---|---|---|---|---|---|
| `settings.group.audio` | Âm thanh | Audio | 音声 | 音频 | 오디오 |
| `settings.audio.mode` | Thu từ | Capture from | 入力元 | 采集来源 | 입력 소스 |
| `settings.audio.mode.playback` | Âm thanh máy | Computer audio | コンピューターの音声 | 电脑音频 | 컴퓨터 오디오 |
| `settings.audio.mode.mic` | Micro | Microphone | マイク | 麦克风 | 마이크 |
| `settings.audio.mode.both` | Âm thanh máy + Micro | Computer audio + Microphone | コンピューターの音声 + マイク | 电脑音频 + 麦克风 | 컴퓨터 오디오 + 마이크 |
| `settings.audio.noiseFilter` | Lọc tiếng ồn micro | Filter microphone noise | マイクのノイズを除去 | 过滤麦克风噪音 | 마이크 잡음 필터 |
| `settings.audio.refresh` | Làm mới danh sách | Refresh list | リストを更新 | 刷新列表 | 목록 새로 고침 |
| `overlay.note.micSilent` | Micro không có tín hiệu | Microphone has no signal | マイクの信号なし | 麦克风没有信号 | 마이크 신호 없음 |
| `overlay.note.micPermission` | Micro chưa được phép | Microphone not allowed | マイクが許可されていません | 麦克风未获准 | 마이크 권한 없음 |
| `overlay.note.micUnavailable` | Không mở được micro | Microphone unavailable | マイクを開けません | 无法打开麦克风 | 마이크를 열 수 없음 |
| `common.openMicSettings` | Mở cài đặt quyền micro | Open microphone settings | マイクの設定を開く | 打开麦克风设置 | 마이크 설정 열기 |
| nút của macOS (trong `settings.audio.micPermission.reopen`) | Thoát & Mở lại | Quit & Reopen | 終了して再度開く | 退出并重新打开 | 종료 후 다시 열기 |

## Quyết định của kế hoạch này (chủ dự án cần biết)

1. **App không hỏi đồng ý lại khi văn bản lên phiên bản.** Spec mục 8 viết "người dùng đồng ý lại theo luồng hiện có", nhưng luồng hiện có chỉ hỏi ở onboarding (`termsAccepted` trong `src/store/app.ts`, không lưu phiên bản đã đồng ý). Người dùng cũ cập nhật lên 0.2.8 sẽ không thấy EULA 1.5. Kế hoạch giữ nguyên như các đợt trước và ghi điều này vào `docs/legal/README.md` (đã có câu hỏi luật sư "Người dùng cũ chưa thấy EULA 1.3"). Muốn hỏi lại thì là một tính năng riêng.
2. **A2 không tính phần chờ ngắt câu 500 ms.** Spec mục 11 viết "không tăng quá 100 ms (p50) so với chế độ âm thanh máy", nhưng mục 16 chốt chế độ có micro chờ 500 ms (âm thanh máy mặc định 50 ms), nên tổng chắc chắn chậm hơn khoảng 450 ms. Task 8 so phần "nhận dạng + dịch" (tổng trừ phần cắt đoạn), như biên bản thử tay `results/thu-tay-tron-mac.md`. Spec chính ghi rõ điều này (Task 1).
3. **Website không thêm mục h2 mới ở Trang chủ và Tính năng**: micro là một gạch đầu dòng ở Trang chủ và một mục h3 `#micro` (en/ja/zh/ko: `#microphone`) trong mục "Nguồn âm thanh" của trang Tính năng. Hướng dẫn quyền âm thanh thêm một h2 (`#quyen-micro`, `#microphone-permission`).
4. **Các câu "phụ đề một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn"** (Hỏi đáp, So sánh, Giải pháp, Tính năng) **giữ nguyên**: chúng trả lời câu hỏi "app có dịch giọng tôi cho người khác nghe không", điều vẫn đúng. Câu "AI Translator là gì" ở Hỏi đáp thì sửa (Task 3).
5. **Ảnh `app-settings-audio` chụp lại ở chế độ Âm thanh máy + Micro** để thấy đủ: bộ chọn Thu từ, nguồn âm thanh máy, micro, ghi chú nhường lời, lọc ồn, thanh ngắt câu khóa ở 500 ms.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | D1, D9, F12, §3.2, §3.3 (sáu tiêu chí), §4.3, §6.1–§6.4, §9, §10.1 |
| Modify `docs/legal/privacy.{vi,en}.md` | Mục 2, 3, 4, 10; dòng phiên bản lên 1.8 ở Task 12 |
| Modify `docs/legal/eula.{vi,en}.md` | Mục 1, 6; dòng phiên bản lên 1.5 ở Task 12 |
| Modify `docs/legal/README.md` | Đoạn lịch sử EULA 1.5 / chính sách 1.8; dòng đầu và "Mặc định đã chọn" ở Task 12 |
| Modify `website/src/content/{vi,en,ja,zh,ko}/{download,faq,features,guide-audio-permission,guide-install-windows,guide-quick-start,solutions-meetings,solutions-webinar,data-security}.mjs` | Câu cũ "không dùng micro" (Task 3) |
| Modify `website/src/content/{vi,en,ja,zh,ko}/{home,features,faq,guide-troubleshooting,guide-audio-permission,data-security}.mjs` | Nội dung micro mới (Task 4, Task 9) |
| Modify `website/test/site.test.mjs` | `STALE_MIC`, test nội dung micro, test pháp lý micro; số phiên bản pháp lý ở Task 12 |
| Modify `scripts/ui-preview/shoot.mjs`, `website/src/assets/img/app/app-settings-audio.*.webp`, `website/src/assets/img/app/manifest.json` | Ảnh Cài đặt › Âm thanh mới (Task 5) |
| Create `bench/2026-10-24-nguon-micro/results/nghiem-thu.md` | Biên bản A4-mic, A-trộn, A-ảo, A2, A7, A1-mic (Task 7–10) |
| Create `bench/phase1/results/acceptance/a7-mac-micro.{md,json}` | Biên bản A7 chế độ Âm thanh máy + Micro (Task 9) |
| Modify `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`, `Cargo.lock` | 0.2.7 → 0.2.8 (Task 12) |

---

### Task 0: Mốc

**Files:** không sửa.

- [ ] **Step 1: Nhánh và trạng thái**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git status --short | head && git log --oneline -1 && git merge-base HEAD main && git rev-parse main`
Expected: `nguon-micro`, cây sạch, HEAD là commit cuối của kế hoạch 03 (hay commit kế hoạch này), merge-base bằng `main` (`d3d7658c…`). Nếu `main` đã đi tiếp: dừng, báo chủ dự án (cần rebase trước khi phát hành).

- [ ] **Step 2: Test website xanh trước khi sửa**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && pnpm test 2>&1 | tail -5`
Expected: `# fail 0`. Ghi số test (`# pass N`) để so sau.

- [ ] **Step 3: Câu cũ cần sửa còn đủ**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website/src/content && grep -rln -E "không dùng micro|does not use the microphone|microphone is not used|マイクは使いません|マイクを使わず|不使用麦克风|마이크는 쓰지 않|마이크를 쓰지 않" . | sort
```
Expected: đúng 40 file (8 file × 5 ngôn ngữ): `download`, `faq`, `features`, `guide-audio-permission`, `guide-install-windows`, `guide-quick-start`, `solutions-meetings`, `solutions-webinar`. Khác thì đọc file lạ trước khi làm Task 3.

---

### Task 1: Sửa spec chính

**Files:** Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

- [ ] **Step 1: D1**

```old
| D1 | Sản phẩm | App desktop hiện **phụ đề dịch trực tiếp cho mọi âm thanh máy tính đang phát**: Teams, Zoom, Meet, Zalo PC, webinar, video. Không cần bot, plugin hay tài khoản trên các nền tảng họp. |
```
```new
| D1 | Sản phẩm | App desktop hiện **phụ đề dịch trực tiếp cho mọi âm thanh máy tính đang phát**: Teams, Zoom, Meet, Zalo PC, webinar, video; và, nếu người dùng chọn, cho tiếng từ micro (họp tại chỗ, họp lai; F12). Không cần bot, plugin hay tài khoản trên các nền tảng họp. |
```

- [ ] **Step 2: D9**

```old
MVP chỉ dịch một chiều: âm thanh máy đang phát → phụ đề ngôn ngữ của người dùng.
```
```new
MVP chỉ dịch một chiều: âm thanh máy đang phát (và micro, nếu người dùng chọn; F12) → phụ đề ngôn ngữ của người dùng. Micro cũng chỉ dịch sang ngôn ngữ của người dùng; app không phát gì vào cuộc họp.
```

- [ ] **Step 3: F12 ngay sau dòng F11**

Đọc dòng bắt đầu bằng `| F11 | **Gõ dịch**` (khoảng dòng 96). Edit: `old_string` = cả dòng đó, `new_string` = cả dòng đó + xuống dòng + dòng sau:

```
| F12 | **Nguồn micro** (spec `2026-10-24-nguon-micro-design.md`): Cài đặt › Âm thanh › Thu từ chọn Âm thanh máy (mặc định), Micro (người nói trong phòng), hay Âm thanh máy + Micro (họp lai; micro được hạ khi âm thanh máy có tiếng, để không dịch hai lần). Chọn micro, công tắc "Lọc tiếng ồn micro" (bật sẵn), quyền micro hỏi ngay khi chọn chế độ có micro. Mọi gói |
```

- [ ] **Step 4: §3.2 bỏ dòng micro**

```old
- Ghi âm cuộc họp
- Thu âm từ micro
- Linux, Mac chip Intel, Windows ARM64
```
```new
- Ghi âm cuộc họp
- Linux, Mac chip Intel, Windows ARM64
```

- [ ] **Step 5: §3.3 sáu tiêu chí sau A7**

Đọc dòng bắt đầu bằng `| A7 | **Quyền riêng tư:**` (khoảng dòng 121). Edit: `old_string` = cả dòng đó, `new_string` = cả dòng đó + xuống dòng + sáu dòng sau:

```
| A1-mic | **Tương thích micro** (F12; spec nguồn micro §11): chế độ Micro với micro máy, micro USB (nếu có), micro AirPods; chế độ Âm thanh máy + Micro với Zoom, Meet (Chrome), Teams, nghe qua loa và qua tai nghe; trên cả hai hệ điều hành. |
| A4-mic | **Nhận dạng qua micro** (spec nguồn micro §16; `latency-bench mix-eval` trên bản thu của spike). Gói Chuẩn: giọng thật tiếng Việt 1 m lỗi 44,7%; điện thoại 1 m lỗi 30,0%, giữ 84%; điện thoại 3 m lỗi 54,9%, giữ 44%; phòng ồn giữ câu ngắn 39,5%, lỗi 69,9%. Gói Nhẹ: 52,0%; 39,3% / 76%; 62,4% / 40%; 42,1% / 73,5%. Chống thụt lùi: mỗi số không xấu hơn quá 10% (tương đối). |
| A-trộn | **Tiếng vọng** (chế độ Âm thanh máy + Micro, cảnh 1 của spike: nói lần lượt qua loa): lỗi câu online ≤ 9,8% × 1,10, lỗi câu trong phòng ≤ 5,2% × 1,10. |
| A-ảo | **Chữ ảo** (cảnh 6 của spike: gõ phím, bút, gõ bàn, lật giấy, đặt cốc, kéo ghế, quạt; "Lọc tiếng ồn micro" bật): không quá 1 câu ảo mỗi 10 phút. |
| A2-mic | Chế độ Âm thanh máy + Micro, cùng nội dung: p50 của phần nhận dạng + dịch không tăng quá 100 ms so với chế độ Âm thanh máy. Không tính phần chờ ngắt câu 500 ms đã chủ ý của chế độ có micro (§6.3). |
| A7-mic | Kiểm lại A7 bằng proxy ở chế độ Âm thanh máy + Micro: không có kết nối mới. |
```

- [ ] **Step 6: §4.3 màn hình chính và nhóm Âm thanh**

```old
  - Nguồn âm thanh: trên Windows là thiết bị phát; trên macOS là toàn hệ thống hoặc một app cụ thể.
```
```new
  - Nguồn âm thanh: trên Windows là thiết bị phát; trên macOS là toàn hệ thống hoặc một app cụ thể. Chế độ Micro ghi "Micro: <tên>", chế độ Âm thanh máy + Micro ghi cả hai (F12). Ghi chú khi micro không có tín hiệu, chưa được phép hay không mở được (§9).
```

```old
  - **Âm thanh:** nguồn âm thanh, độ nhạy ngắt câu.
```
```new
  - **Âm thanh:** thu từ (Âm thanh máy, Micro, Âm thanh máy + Micro; F12), nguồn âm thanh máy, micro, lọc tiếng ồn micro, quyền micro, độ nhạy ngắt câu (khóa ở 500 ms khi có micro, §6.3).
```

- [ ] **Step 7: §6.1 mục Micro trước "Ràng buộc realtime"**

```old
- **Ràng buộc realtime:**
```
```new
- **Micro** (F12; spec nguồn micro §5.1, §5.2, §16): macOS `MacInputSource` (AUHAL trên thiết bị vào; trạng thái quyền đọc bằng `AVCaptureDevice`, hỏi quyền trước khi `start` vì Core Audio tự hỏi thì `start` chặn suốt lúc hộp thoại mở); Windows `InputSource` (WASAPI capture). Micro mặc định đổi thì mở lại như thiết bị phát. Chế độ Âm thanh máy + Micro chạy hai nguồn song song, canh theo nguồn; micro lỗi không dừng phiên (`micIssue`, §9).
- **Ràng buộc realtime:**
```

Nếu `- **Ràng buộc realtime:**` khớp hơn một lần thì dùng cả dòng đó làm `old_string`.

- [ ] **Step 8: §6.2 chuỗi micro**

```old
Gộp về một kênh (mono), rồi resample từ tần số của thiết bị (thường 48 kHz) xuống 16 kHz bằng crate `rubato`. Sau đó chia thành khung 512 mẫu (32 ms) để đưa vào VAD.
```
```new
Gộp về một kênh (mono), rồi resample từ tần số của thiết bị (thường 48 kHz) xuống 16 kHz bằng crate `rubato`. Sau đó chia thành khung 512 mẫu (32 ms) để đưa vào VAD.

**Khi có micro** (F12; spec nguồn micro §5.3–§5.8, §16): micro qua lọc thông cao 80 Hz rồi khuếch đại tới +20 dB. Bản cho whisper qua bộ giới hạn mức (trần 0,9, không méo); bản cho VAD qua `tanh` và, khi bật "Lọc tiếng ồn micro", qua RNNoise (`nnnoiseless`). Whisper không nghe bản đã lọc ồn. Chế độ Âm thanh máy + Micro trộn trước VAD bằng `DuckingMixer`: âm thanh máy vượt −55 dBFS thì micro bị hạ −30 dB, giữ 300 ms. Không khử vọng (AEC).
```

- [ ] **Step 9: §6.3 tham số VAD khi có micro**

```old
### 6.4 Nhận dạng giọng nói
```
```new
- **Khi có micro** (F12; spec nguồn micro §16): VAD nghe bản đã qua chuỗi micro (§6.2). Chế độ Micro: ngưỡng 0,5, đoạn ngắn nhất 400 ms (250 ms khi tắt "Lọc tiếng ồn micro"), im lặng 500 ms thì chốt đoạn. Chế độ Âm thanh máy + Micro: 0,5 / 600 ms / 500 ms. Các giá trị này thay `vadEndSilenceMs` của người dùng, nên phụ đề hiện chậm hơn khoảng 0,45 s so với mặc định 50 ms. Luật `ShortUnsure` của spec nguồn micro bị bỏ.

### 6.4 Nhận dạng giọng nói
```

- [ ] **Step 10: §6.4 luật câu quảng cáo kênh**

```old
Các câu này có `avg_logprob` cao, nên luật `no_speech` ở trên không bắt được.
```
```new
Các câu này có `avg_logprob` cao, nên luật `no_speech` ở trên không bắt được. Câu **chứa** cụm quảng cáo kênh rõ ràng (ví dụ "subscribe cho kênh") cũng bị bỏ, kể cả khi dài hơn cụm đó (spec nguồn micro §16: hai lần lọt qua khi khuếch đại micro).
```

- [ ] **Step 11: §9 ba tình huống micro**

Đọc dòng bắt đầu bằng `| Bản dịch lỗi (quá dài, có kèm lời giải thích)` (dòng cuối bảng §9). Edit: `old_string` = cả dòng đó, `new_string` = cả dòng đó + xuống dòng + ba dòng:

```
| Thiếu quyền micro (`micPermission`; F12) | macOS: `AVCaptureDevice` báo bị từ chối (Core Audio khi đó trả toàn số 0, không báo lỗi) | Chế độ Micro: không bắt đầu phiên, nút mở trang cấp quyền. Chế độ Âm thanh máy + Micro: chạy với âm thanh máy, `micIssue = "permission"`, ghi chú kèm nút. macOS chỉ áp quyền mới sau khi app mở lại ("Quit & Reopen" gửi lý do `rlgo`, app cho thoát) |
| Không có micro, micro đã chọn không còn, bị rút, bị giữ độc quyền (`micUnavailable`) | Mở nguồn lỗi; `failed()` | Chế độ Micro: như nguồn đơn, báo lỗi nếu không mở lại được. Chế độ Âm thanh máy + Micro: chạy với âm thanh máy, `micIssue = "unavailable"`, thử lại mỗi 2 giây; log chỉ cảnh báo khi mã lỗi đổi |
| Micro trả số 0 tuyệt đối 3 giây từ đầu phiên | `ZeroWatch` của micro | `micIssue = "suspected"`, phiên chạy tiếp; ghi chú "Micro không có tín hiệu: kiểm tra quyền micro hoặc phím tắt tiếng của micro" kèm nút mở trang cấp quyền |
```

- [ ] **Step 12: §10.1 âm thanh micro**

```old
- **Âm thanh** chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng.
```
```new
- **Âm thanh**, kể cả âm thanh micro (F12), chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng. Log ghi loại kết nối của micro (`builtin`, `usb`, `bluetooth`, `virtual`, `other`), không ghi tên micro. App thu micro suốt phiên kể cả khi người dùng đã tắt mic trong app họp; chính sách quyền riêng tư (từ 1.8) nói rõ điều này.
```

- [ ] **Step 13: Kiểm và commit**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git diff --stat && grep -c "F12" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && grep -n "Thu âm từ micro" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
Expected: một file đổi; `F12` xuất hiện ≥ 8 lần; lệnh grep cuối không in gì.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs(spec): spec chính ghi nguồn micro (F12, tiêu chí nghiệm thu, chuỗi micro, lỗi micro)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pháp lý — nội dung chính sách 1.8 và EULA 1.5 (dòng phiên bản giữ nguyên)

**Files:** Modify `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/eula.vi.md`, `docs/legal/eula.en.md`, `docs/legal/README.md`, `website/test/site.test.mjs`

- [ ] **Step 1: Test hỏng trước**

Thêm vào cuối `website/test/site.test.mjs`:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && cat >> test/site.test.mjs <<'EOF'

// ---- Nguồn micro (spec 2026-10-24-nguon-micro §8, §9): pháp lý, câu "không dùng micro" cũ, nội dung micro ----

test("chính sách quyền riêng tư và EULA nói về micro: chỉ trong RAM, thu cả khi đã tắt mic trong app họp, không có trong kết nối hay báo cáo lỗi, có thể gồm giọng người ở gần", () => {
  const needs = {
    "/chinh-sach-quyen-rieng-tu/": [
      "Âm thanh (âm thanh máy và, nếu bạn chọn, micro)",
      "Âm thanh từ micro (khi bạn chọn nguồn có micro)",
      "kể cả khi bạn đã tắt micro (mute) trong ứng dụng họp",
      "không có kết nối nào mang âm thanh (kể cả âm thanh từ micro)",
      "thiếu quyền ghi âm hay quyền micro",
      "tên micro",
    ],
    "/en/privacy/": [
      "Audio (computer audio and, if you choose, the microphone)",
      "Microphone audio (when you choose a source with the microphone)",
      "even if you have muted yourself in the meeting app",
      "none carries audio (including microphone audio)",
      "a missing recording or microphone permission",
      "the microphone name",
    ],
    "/dieu-khoan/": ["khi bạn chọn, cho âm thanh từ micro", "khi bạn chọn, âm thanh từ micro, có thể gồm giọng nói của người khác, kể cả người ở gần bạn"],
    "/en/terms/": ["when you choose, for audio from the microphone", "when you choose, audio from the microphone, which may include other people's voices, including people near you"],
  };
  const errors = [];
  for (const [urlPath, list] of Object.entries(needs)) {
    const text = textOf(htmlByPath.get(urlPath));
    for (const n of list) if (!text.includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
  }
  assert.deepEqual(errors, []);
});
EOF
pnpm test 2>&1 | grep -E "^not ok|# fail" | head
```
Expected: `not ok … chính sách quyền riêng tư và EULA nói về micro…`, `# fail 1`.

- [ ] **Step 2: Chính sách vi, mục 2**

Tệp: `docs/legal/privacy.vi.md`
```old
- Âm thanh cuộc họp được xử lý **hoàn toàn trên máy bạn**. Âm thanh **không bao giờ** được gửi đi, và không được ghi xuống đĩa.
```
```new
- Âm thanh (âm thanh máy và, nếu bạn chọn, micro) được xử lý **hoàn toàn trên máy bạn**. Âm thanh **không bao giờ** được gửi đi, và không được ghi xuống đĩa. Khi bạn chọn nguồn có micro, ứng dụng thu micro suốt phiên dịch, **kể cả khi bạn đã tắt micro (mute) trong ứng dụng họp** (mục 3).
```

- [ ] **Step 3: Chính sách vi, bảng mục 3**

```old
| Âm thanh hệ thống đang thu | Chỉ nằm trong bộ nhớ RAM trong lúc dịch; không ghi xuống đĩa, không gửi qua mạng |
```
```new
| Âm thanh máy đang thu | Chỉ nằm trong bộ nhớ RAM trong lúc dịch; không ghi xuống đĩa, không gửi qua mạng |
| Âm thanh từ micro (khi bạn chọn nguồn có micro) | Chỉ nằm trong bộ nhớ RAM trong lúc dịch; không ghi xuống đĩa, không gửi qua mạng. Log không ghi tên micro, chỉ ghi loại kết nối (ví dụ tích hợp, USB, Bluetooth) |
```

- [ ] **Step 4: Chính sách vi, đoạn micro sau đoạn Trợ năng (mục 3)**

```old
Nếu bạn không cấp quyền, ứng dụng chỉ chép bản dịch vào clipboard để bạn tự dán.
```
```new
Nếu bạn không cấp quyền, ứng dụng chỉ chép bản dịch vào clipboard để bạn tự dán.

Ứng dụng chỉ dùng micro khi bạn chọn nguồn **Micro** hoặc **Âm thanh máy + Micro** ở Cài đặt › Âm thanh; nguồn mặc định, **Âm thanh máy**, không mở micro. Khi bạn chọn nguồn có micro, macOS hỏi quyền **Micro**; trên Windows, việc ứng dụng dùng micro theo cài đặt quyền riêng tư về micro của Windows. Trong lúc phiên dịch chạy, ứng dụng thu micro liên tục, **kể cả khi bạn đã tắt micro (mute) trong ứng dụng họp**: việc đó chỉ chặn tiếng của bạn tới người cùng họp, không chặn ứng dụng này. Hệ điều hành báo khi có ứng dụng đang dùng micro (trên macOS là chấm màu cam ở thanh menu). Muốn ứng dụng ngừng thu micro, hãy bấm Dừng. Micro có thể thu giọng của người khác ở gần bạn; hãy xin phép họ khi cần (EULA mục 6).
```

- [ ] **Step 5: Chính sách vi, mục 4 câu cuối**

```old
Không có kết nối nào khác, và không có kết nối nào mang âm thanh, nội dung chép lời hay chữ bạn gõ ở Gõ dịch.
```
```new
Không có kết nối nào khác, và không có kết nối nào mang âm thanh (kể cả âm thanh từ micro), nội dung chép lời hay chữ bạn gõ ở Gõ dịch.
```

- [ ] **Step 6: Chính sách vi, mục 10 (hai ô)**

```old
(không tính lỗi do bạn hay môi trường như thiếu quyền ghi âm, hết hạn mức
```
```new
(không tính lỗi do bạn hay môi trường như thiếu quyền ghi âm hay quyền micro, không mở được micro, hết hạn mức
```

```old
| Báo cáo không gồm | Âm thanh, bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP |
```
```new
| Báo cáo không gồm | Âm thanh (kể cả âm thanh từ micro), bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email, tên máy, tên micro, tên tài khoản hệ điều hành, địa chỉ IP |
```

Cơ sở: `src-tauri/src/diagnostics/mod.rs` xếp `micPermission`, `micUnavailable` vào `SKIPPED_CODES`; log chỉ ghi `kết nối builtin|usb|…` (`src-tauri/src/capture.rs`, dòng "đang thu micro").

- [ ] **Step 7: Chính sách en, cùng năm chỗ**

Tệp: `docs/legal/privacy.en.md`
```old
- Meeting audio is processed **entirely on your computer**. Audio is **never** sent anywhere and is not written to disk.
```
```new
- Audio (computer audio and, if you choose, the microphone) is processed **entirely on your computer**. Audio is **never** sent anywhere and is not written to disk. When you choose a source with the microphone, the app captures the microphone for the whole translation session, **even if you have muted yourself in the meeting app** (section 3).
```

```old
| System audio being captured | Held only in RAM while translating; never written to disk or sent over the network |
```
```new
| Computer audio being captured | Held only in RAM while translating; never written to disk or sent over the network |
| Microphone audio (when you choose a source with the microphone) | Held only in RAM while translating; never written to disk or sent over the network. Logs do not record the microphone's name, only its connection type (for example built-in, USB, Bluetooth) |
```

```old
If you do not grant it, the app only copies the translation to the clipboard for you to paste.
```
```new
If you do not grant it, the app only copies the translation to the clipboard for you to paste.

The app uses the microphone only when you choose the **Microphone** or **Computer audio + Microphone** source in Settings › Audio; the default source, **Computer audio**, does not open the microphone. When you choose a source with the microphone, macOS asks for the **Microphone** permission; on Windows, the app's use of the microphone follows Windows' microphone privacy settings. While a translation session runs, the app captures the microphone continuously, **even if you have muted yourself in the meeting app**: muting there only stops your voice from reaching the other participants, not this app. The operating system shows when an app is using the microphone (on macOS, an orange dot in the menu bar). To stop the app capturing the microphone, press Stop. The microphone can pick up the voices of other people near you; ask their permission where needed (EULA section 6).
```

```old
There are no other connections, and none carries audio, transcript text or text you type in Type & Translate.
```
```new
There are no other connections, and none carries audio (including microphone audio), transcript text or text you type in Type & Translate.
```

```old
such as a missing recording permission, a used-up quota
```
```new
such as a missing recording or microphone permission, a microphone that cannot be opened, a used-up quota
```

```old
| The report does not contain | Audio, transcripts, translations, text typed in Type & Translate, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses |
```
```new
| The report does not contain | Audio (including microphone audio), transcripts, translations, text typed in Type & Translate, license keys, tokens, email addresses, the computer name, the microphone name, the operating-system user name, IP addresses |
```

- [ ] **Step 8: EULA vi, mục 1 và 6**

Tệp: `docs/legal/eula.vi.md`
```old
AI Translator hiện phụ đề dịch trực tiếp cho âm thanh đang phát trên máy tính của bạn (ví dụ cuộc họp trực tuyến).
```
```new
AI Translator hiện phụ đề dịch trực tiếp cho âm thanh đang phát trên máy tính của bạn (ví dụ cuộc họp trực tuyến) và, khi bạn chọn, cho âm thanh từ micro (ví dụ người nói trong phòng họp).
```

```old
Ứng dụng thu âm thanh đang phát trên máy bạn, có thể gồm giọng nói của người khác.
```
```new
Ứng dụng thu âm thanh đang phát trên máy bạn và, khi bạn chọn, âm thanh từ micro, có thể gồm giọng nói của người khác, kể cả người ở gần bạn.
```

- [ ] **Step 9: EULA en, mục 1 và 6**

Tệp: `docs/legal/eula.en.md`
```old
AI Translator shows live translated subtitles for audio playing on your computer (for example an online meeting).
```
```new
AI Translator shows live translated subtitles for audio playing on your computer (for example an online meeting) and, when you choose, for audio from the microphone (for example people speaking in the meeting room).
```

```old
The app captures audio playing on your computer, which may include other people's voices.
```
```new
The app captures audio playing on your computer and, when you choose, audio from the microphone, which may include other people's voices, including people near you.
```

- [ ] **Step 10: README pháp lý, đoạn lịch sử**

Tệp: `docs/legal/README.md`. Đọc đoạn bắt đầu `**EULA 1.4 và chính sách 1.7 đổi tên miền**` (dòng 13). Edit: `old_string` = cả đoạn đó, `new_string` = cả đoạn đó + dòng trống + đoạn:

```
**EULA 1.5 và chính sách 1.8 thêm nguồn micro** theo spec `2026-10-24-nguon-micro-design.md` (mục 8): người dùng chọn thu từ âm thanh máy (mặc định), micro, hay cả hai (Cài đặt › Âm thanh); âm thanh micro chỉ nằm trong RAM, không ghi xuống đĩa, không gửi đi (chính sách mục 2, 3, 4); app thu micro suốt phiên dịch, kể cả khi người dùng đã tắt micro trong app họp (mục 2, 3); thiếu quyền micro hay không mở được micro là lỗi môi trường, không gửi báo cáo; báo cáo và log không có tên micro (mục 3, 10). EULA mục 1 và 6 nói app thu cả micro khi người dùng chọn, có thể gồm giọng người ở gần. Không thêm kết nối mạng, dữ liệu máy chủ hay bên xử lý. App không hỏi đồng ý lại khi văn bản lên phiên bản (xem câu hỏi luật sư "Người dùng cũ chưa thấy EULA 1.3"): người dùng cũ cập nhật lên 0.2.8 không thấy EULA 1.5 trước khi dùng micro. Ngày hiệu lực đặt theo mục "Đổi ngày hiệu lực" vào ngày phát hành 0.2.8.
```

- [ ] **Step 11: Test xanh**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && pnpm test 2>&1 | grep -E "^not ok|# (pass|fail)"`
Expected: `# fail 0`. Test phiên bản pháp lý (EULA 1.4, chính sách 1.7) vẫn xanh vì dòng phiên bản chưa đổi.

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec vitest run src/lib/legal.test.ts 2>&1 | tail -3`
Expected: pass.

- [ ] **Step 12: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add docs/legal website/test/site.test.mjs && git commit -m "docs(legal): chính sách 1.8 và EULA 1.5 nói về nguồn micro (dòng phiên bản đổi khi phát hành)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Website — bỏ câu "app không dùng micro" (năm ngôn ngữ)

**Files:** Modify `website/src/content/{vi,en,ja,zh,ko}/{download,faq,features,guide-audio-permission,guide-install-windows,guide-quick-start,solutions-meetings,solutions-webinar}.mjs`, `website/test/site.test.mjs`

- [ ] **Step 1: Luật câu cũ và test hỏng trước**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && cat >> test/site.test.mjs <<'EOF'

// Câu cũ đã gỡ khi có nguồn micro: "app không dùng micro" và "cần đúng một quyền" (giờ chọn nguồn có micro thì hỏi thêm quyền
// Micro). Câu nói về việc chọn nguồn ("không mở micro trừ khi bạn chọn…") thì được.
const STALE_MIC = [
  { id: "vi: không dùng micro", re: /không\s+(?:dùng|cần)\s+micro/iu, unless: /chọn/iu },
  { id: "vi: cần đúng một quyền", re: /cần\s+đúng\s+một\s+quyền/iu },
  { id: "en: does not use the microphone", re: /\b(?:does\s+not|doesn't|never)\s+use\s+the\s+microphone\b|\bthe\s+microphone\s+is\s+not\s+used\b/i, unless: /\b(?:choose|select)/i },
  { id: "en: exactly one permission", re: /\bexactly\s+one\s+(?:macOS\s+)?permission\b/i },
  { id: "ja: マイクを使いません", re: /マイク(?:は|を)使(?:いません|わ)/u, unless: /選/u },
  { id: "ja: 許可はちょうど 1 つ", re: /ちょうど\s*1\s*つ/u },
  { id: "zh: 不使用麦克风", re: /不使用麦克风/u, unless: /选择/u },
  { id: "zh: 只需要一项权限", re: /只需要一项/u },
  { id: "ko: 마이크를 쓰지 않음", re: /마이크(?:는|를)\s*쓰지\s*않/u, unless: /고르|선택/u },
  { id: "ko: 권한은 딱 하나", re: /딱\s*하나/u },
];
const STALE_MIC_MUST_CATCH = [
  "Chỉ quyền Ghi âm thanh hệ thống (System Audio Recording); AI Translator không dùng micro.",
  "Để dịch phụ đề, AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống.",
  "The app does not use the microphone.",
  "System audio recording (the microphone is not used)",
  "For subtitles, AI Translator needs exactly one macOS permission: System Audio Recording.",
  "アプリはマイクを使いません。",
  "アプリは<strong>マイクを使わず</strong>、あなたの声を録音せず",
  "应用不使用麦克风。",
  "앱은 마이크를 쓰지 않습니다.",
  "시스템 오디오 녹음(마이크는 쓰지 않음)",
];
const STALE_MIC_MUST_KEEP = [
  "Với nguồn mặc định (Âm thanh máy), app không mở micro; app chỉ mở micro khi bạn chọn nguồn Micro.",
  "Quyền Micro chỉ được hỏi khi bạn chọn nguồn có micro.",
  "With the default source the app does not open the microphone; it opens it only when you choose Microphone.",
  "マイクを含む入力元を選ぶと、マイクの許可も求められます。",
  "选择含麦克风的采集来源时，还会请求麦克风权限。",
  "마이크가 들어간 입력 소스를 고르면 마이크 권한도 묻습니다.",
];

test("luật câu cũ về micro (STALE_MIC) bắt câu cũ và không bắt câu đúng", () => {
  const missed = STALE_MIC_MUST_CATCH.filter((s) => staleHits(s, STALE_MIC).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_MIC_MUST_KEEP.filter((s) => staleHits(s, STALE_MIC).length > 0).map((s) => `${s} → ${staleHits(s, STALE_MIC).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
});

test("không nguồn chữ nào của site còn câu 'app không dùng micro' hay 'cần đúng một quyền trên macOS'", async () => {
  assert.deepEqual(scanStale(await siteTexts(), STALE_MIC), []);
});
EOF
pnpm test 2>&1 | grep -E "^not ok|# fail" | head
```
Expected: test luật xanh; test quét site đỏ (`# fail 1`), liệt kê khoảng 50 câu ở 8 loại trang × 5 ngôn ngữ. Nếu test luật đỏ: sửa regex cho tới khi xanh, không sửa danh sách mẫu.

- [ ] **Step 2: `download.mjs` (bảng quyền)**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/download.mjs` | `<td>Ghi âm thanh hệ thống (không dùng micro)</td><td>Không cần cấp quyền ghi âm</td>` | `<td>Ghi âm thanh hệ thống; thêm quyền Micro nếu bạn chọn nguồn có micro</td><td>Không cần cấp quyền ghi âm; nguồn có micro cần Windows cho phép app dùng micro</td>` |
| `en/download.mjs` | `<td>System audio recording (the microphone is not used)</td><td>No audio-recording permission needed</td>` | `<td>System audio recording; plus Microphone if you choose a source with the microphone</td><td>No audio-recording permission needed; a source with the microphone needs Windows to let apps use it</td>` |
| `ja/download.mjs` | `<td>システムオーディオの録音（マイクは使いません）</td><td>録音の許可は不要</td>` | `<td>システムオーディオの録音。マイクを含む入力元を選ぶとマイクの許可も必要</td><td>録音の許可は不要。マイクを含む入力元では Windows でアプリのマイク使用を許可</td>` |
| `zh/download.mjs` | `<td>录制系统音频（不使用麦克风）</td><td>不需要录音权限</td>` | `<td>录制系统音频；选择含麦克风的采集来源时还需要麦克风权限</td><td>不需要录音权限；含麦克风的采集来源需要 Windows 允许应用使用麦克风</td>` |
| `ko/download.mjs` | `<td>시스템 오디오 녹음(마이크는 쓰지 않음)</td><td>녹음 권한 필요 없음</td>` | `<td>시스템 오디오 녹음. 마이크가 들어간 입력 소스를 고르면 마이크 권한도 필요</td><td>녹음 권한 필요 없음. 마이크가 들어간 입력 소스는 Windows에서 앱의 마이크 사용 허용 필요</td>` |

- [ ] **Step 3: `faq.mjs` — câu hỏi quyền trên macOS (hai cặp mỗi ngôn ngữ)**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/faq.mjs` | `Để dịch phụ đề, chỉ cần quyền Ghi âm thanh hệ thống (System Audio Recording); AI Translator không dùng micro. macOS hỏi ở lần đầu bạn bấm Bắt đầu.` | `Để dịch âm thanh máy, chỉ cần quyền Ghi âm thanh hệ thống (System Audio Recording); macOS hỏi ở lần đầu bạn bấm Bắt đầu.` |
| `vi/faq.mjs` | `hướng dẫn cấp quyền ghi âm</a>. Gõ dịch` | `hướng dẫn cấp quyền ghi âm</a>. Khi bạn chọn nguồn có micro (Micro, hoặc Âm thanh máy + Micro), macOS hỏi thêm quyền Micro (xem <a href="/huong-dan/cap-quyen-thu-am-macos/#quyen-micro">quyền Micro</a>). Gõ dịch` |
| `en/faq.mjs` | `For subtitles, only System Audio Recording permission; AI Translator does not use the microphone. macOS asks the first time you press Start.` | `To translate computer audio, only System Audio Recording permission is needed; macOS asks the first time you press Start.` |
| `en/faq.mjs` | `audio permission guide</a>. Type &amp; Translate` | `audio permission guide</a>. When you choose a source with the microphone (Microphone, or Computer audio + Microphone), macOS also asks for the Microphone permission (see <a href="/en/guide/macos-audio-permission/#microphone-permission">Microphone permission</a>). Type &amp; Translate` |
| `ja/faq.mjs` | `字幕に必要なのはシステムオーディオの録音の許可だけで、AI Translator はマイクを使いません。初めて「開始」を押したときに macOS が求めます。` | `コンピューターの音声の翻訳に必要なのはシステムオーディオの録音の許可だけで、初めて「開始」を押したときに macOS が求めます。` |
| `ja/faq.mjs` | `音声の許可のガイド</a>をご覧ください。入力翻訳では` | `音声の許可のガイド</a>をご覧ください。マイクを含む入力元（マイク、またはコンピューターの音声 + マイク）を選ぶと、macOS はマイクの許可も求めます（<a href="/ja/guide/macos-audio-permission/#microphone-permission">マイクの許可</a>）。入力翻訳では` |
| `zh/faq.mjs` | `字幕只需要录制系统音频的权限；AI Translator 不使用麦克风。第一次点“开始”时 macOS 会请求。` | `翻译电脑音频只需要录制系统音频的权限；第一次点“开始”时 macOS 会请求。` |
| `zh/faq.mjs` | `音频权限指南</a>。输入翻译` | `音频权限指南</a>。选择含麦克风的采集来源（麦克风，或电脑音频 + 麦克风）时，macOS 还会请求麦克风权限（见<a href="/zh/guide/macos-audio-permission/#microphone-permission">麦克风权限</a>）。输入翻译` |
| `ko/faq.mjs` | `자막에는 시스템 오디오 녹음 권한만 필요하며, AI Translator는 마이크를 쓰지 않습니다. 처음 '시작'을 누를 때 macOS가 묻습니다.` | `컴퓨터 오디오를 번역하는 데는 시스템 오디오 녹음 권한만 필요하며, 처음 '시작'을 누를 때 macOS가 묻습니다.` |
| `ko/faq.mjs` | `오디오 권한 가이드</a>를 참조하세요. 입력 번역은` | `오디오 권한 가이드</a>를 참조하세요. 마이크가 들어간 입력 소스(마이크, 또는 컴퓨터 오디오 + 마이크)를 고르면 macOS가 마이크 권한도 묻습니다(<a href="/ko/guide/macos-audio-permission/#microphone-permission">마이크 권한</a> 참조). 입력 번역은` |

- [ ] **Step 4: `faq.mjs` — "AI Translator là gì"**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/faq.mjs` | `hiện phụ đề dịch trực tiếp cho âm thanh đang phát trên máy tính, như cuộc họp, webinar hoặc video.` | `hiện phụ đề dịch trực tiếp cho âm thanh đang phát trên máy tính, như cuộc họp, webinar hoặc video, và nếu bạn chọn, cho người nói trong phòng qua micro.` |
| `en/faq.mjs` | `shows live translated subtitles for any audio playing on your computer, such as a meeting, webinar or video. It recognizes` | `shows live translated subtitles for any audio playing on your computer, such as a meeting, webinar or video, and, if you choose, for people speaking in the room through the microphone. It recognizes` |
| `ja/faq.mjs` | `パソコンで再生されるあらゆる音声にリアルタイムの翻訳字幕を表示するデスクトップアプリです。` | `パソコンで再生されるあらゆる音声に、選んだ場合はマイクで拾った会議室の人の声にも、リアルタイムの翻訳字幕を表示するデスクトップアプリです。` |
| `zh/faq.mjs` | `可以为电脑上播放的任何音频（例如会议、网络研讨会或视频）显示实时翻译字幕。` | `可以为电脑上播放的任何音频（例如会议、网络研讨会或视频）显示实时翻译字幕；如果你选择，也可以通过麦克风翻译会议室里说话的人。` |
| `ko/faq.mjs` | `회의, 웨비나, 동영상 등 컴퓨터에서 재생되는 모든 소리에 실시간 번역 자막을 보여 주는 데스크톱 앱입니다.` | `회의, 웨비나, 동영상 등 컴퓨터에서 재생되는 모든 소리에, 그리고 고른 경우 마이크로 듣는 회의실 사람의 말에도 실시간 번역 자막을 보여 주는 데스크톱 앱입니다.` |

- [ ] **Step 5: `features.mjs` — đoạn quyền trong mục Nguồn âm thanh**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/features.mjs` | `App không dùng micro.` | `Chọn nguồn có micro thì macOS hỏi thêm quyền <em>Micro</em>.` |
| `en/features.mjs` | `The app does not use the microphone.` | `If you choose a source with the microphone, macOS also asks for the <em>Microphone</em> permission.` |
| `ja/features.mjs` | `アプリはマイクを使いません。` | `マイクを含む入力元を選ぶと、<em>マイク</em>の許可も求められます。` |
| `zh/features.mjs` | `应用不使用麦克风。` | `选择含麦克风的采集来源时，还会请求<em>麦克风</em>权限。` |
| `ko/features.mjs` | `앱은 마이크를 쓰지 않습니다.` | `마이크가 들어간 입력 소스를 고르면 <em>마이크</em> 권한도 묻습니다.` |

- [ ] **Step 6: `guide-audio-permission.mjs` — `lead` (chuỗi nháy kép, không có thẻ)**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/…` | `Để dịch phụ đề, AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống (System Audio Recording), để nghe âm thanh mà máy Mac đang phát. App không dùng micro.` | `Để dịch âm thanh máy, AI Translator cần một quyền trên macOS: Ghi âm thanh hệ thống (System Audio Recording), để nghe âm thanh mà máy Mac đang phát. Khi bạn chọn nguồn có micro, macOS hỏi thêm quyền Micro.` |
| `en/…` | `For subtitles, AI Translator needs exactly one macOS permission: System Audio Recording, so it can hear the audio your Mac is playing. It does not use the microphone.` | `To translate computer audio, AI Translator needs one macOS permission: System Audio Recording, so it can hear the audio your Mac is playing. If you choose a source with the microphone, macOS also asks for the Microphone permission.` |
| `ja/…` | `字幕を表示するために AI Translator に必要な macOS の許可は、ちょうど 1 つ、Mac で再生されている音声を聞き取るためのシステムオーディオの録音だけです。マイクは使いません。` | `コンピューターの音声を翻訳するために AI Translator に必要な macOS の許可は、Mac で再生されている音声を聞き取るためのシステムオーディオの録音です。マイクを含む入力元を選ぶと、マイクの許可も求められます。` |
| `zh/…` | `为了显示字幕，AI Translator 只需要一项 macOS 权限：系统音频录制，这样它才能听到你的 Mac 正在播放的音频。它不使用麦克风。` | `为了翻译电脑音频，AI Translator 需要一项 macOS 权限：系统音频录制，这样它才能听到你的 Mac 正在播放的音频。选择含麦克风的采集来源时，macOS 还会请求麦克风权限。` |
| `ko/…` | `자막을 보여 주기 위해 AI Translator에 필요한 macOS 권한은 딱 하나, Mac에서 재생 중인 오디오를 듣기 위한 시스템 오디오 녹음입니다. 마이크는 쓰지 않습니다.` | `컴퓨터 오디오를 번역하기 위해 AI Translator에 필요한 macOS 권한은 Mac에서 재생 중인 오디오를 듣기 위한 시스템 오디오 녹음입니다. 마이크가 들어간 입력 소스를 고르면 macOS가 마이크 권한도 묻습니다.` |

- [ ] **Step 7: `guide-audio-permission.mjs` — đoạn đầu mục "App cần quyền nào?" (thân trang, template literal)**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/…` | `App <strong>không dùng micro</strong>, không thu tiếng nói của bạn, và không ghi âm cuộc họp xuống đĩa: âm thanh chỉ nằm trong RAM trong lúc dịch. Windows không có bước cấp quyền này.` | `Với nguồn mặc định (<strong>Âm thanh máy</strong>), app không mở micro; app chỉ mở micro khi bạn chọn nguồn <strong>Micro</strong> hoặc <strong>Âm thanh máy + Micro</strong> (xem <a href="#quyen-micro">Quyền Micro</a>). App không ghi âm cuộc họp xuống đĩa: âm thanh chỉ nằm trong RAM trong lúc dịch. Windows không có bước cấp quyền ghi âm thanh hệ thống.` |
| `en/…` | `The app <strong>does not use the microphone</strong>, does not record your voice, and does not save the meeting to disk: audio stays in memory while it translates. Windows has no such permission step.` | `With the default source (<strong>Computer audio</strong>) the app does not open the microphone; it opens the microphone only when you choose <strong>Microphone</strong> or <strong>Computer audio + Microphone</strong> (see <a href="#microphone-permission">Microphone permission</a>). The app does not save the meeting to disk: audio stays in memory while it translates. Windows has no system audio permission step.` |
| `ja/…` | `アプリは<strong>マイクを使わず</strong>、あなたの声を録音せず、会議をディスクに保存することもありません。音声は翻訳しているあいだメモリ上にとどまります。Windows にはこのような許可の手順はありません。` | `既定の入力元（<strong>コンピューターの音声</strong>）ではマイクを開きません。マイクを開くのは、<strong>マイク</strong>または<strong>コンピューターの音声 + マイク</strong>を選んだときだけです（<a href="#microphone-permission">マイクの許可</a>）。会議をディスクに保存することはなく、音声は翻訳しているあいだメモリ上にとどまります。Windows にはシステムオーディオの許可の手順はありません。` |
| `zh/…` | `应用<strong>不使用麦克风</strong>，不录制你的声音，也不会把会议保存到磁盘：翻译时音频只留在内存中。Windows 没有这样的权限步骤。` | `使用默认来源（<strong>电脑音频</strong>）时，应用不会打开麦克风；只有在你选择<strong>麦克风</strong>或<strong>电脑音频 + 麦克风</strong>时才会打开（见<a href="#microphone-permission">麦克风权限</a>）。应用不会把会议保存到磁盘：翻译时音频只留在内存中。Windows 没有系统音频的权限步骤。` |
| `ko/…` | `앱은 <strong>마이크를 쓰지 않고</strong>, 사용자의 목소리를 녹음하지 않으며, 회의를 디스크에 저장하지도 않습니다. 오디오는 번역하는 동안 메모리에만 머뭅니다. Windows에는 이런 권한 단계가 없습니다.` | `기본 입력 소스(<strong>컴퓨터 오디오</strong>)에서는 마이크를 열지 않습니다. <strong>마이크</strong>나 <strong>컴퓨터 오디오 + 마이크</strong>를 고를 때만 마이크를 엽니다(<a href="#microphone-permission">마이크 권한</a> 참조). 회의를 디스크에 저장하지 않으며, 오디오는 번역하는 동안 메모리에만 머뭅니다. Windows에는 시스템 오디오 권한 단계가 없습니다.` |

Liên kết `#quyen-micro`, `#microphone-permission` trỏ tới mục Task 4 thêm; test liên kết nội bộ đỏ cho tới hết Task 4.

- [ ] **Step 8: `guide-install-windows.mjs`**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/…` | `app thu âm thanh đang phát trên máy mà không cần quyền riêng, và không dùng micro.` | `app thu âm thanh đang phát trên máy mà không cần quyền riêng. Nếu bạn chọn nguồn có micro, Windows phải cho phép app dùng micro (Settings › Privacy &amp; security › Microphone).` |
| `en/…` | `the app captures the sound playing on your PC without a separate permission, and it does not use the microphone.` | `the app captures the sound playing on your PC without a separate permission. If you choose a source with the microphone, Windows must let apps use it (Settings › Privacy &amp; security › Microphone).` |
| `ja/…` | `アプリは別の許可なしで PC で再生されている音を取り込み、マイクは使いません。` | `アプリは別の許可なしで PC で再生されている音を取り込みます。マイクを含む入力元を選ぶ場合は、Windows でアプリのマイク使用を許可してください（設定 › プライバシーとセキュリティ › マイク）。` |
| `zh/…` | `应用无需单独授权就能采集电脑上播放的声音，而且不使用麦克风。` | `应用无需单独授权就能采集电脑上播放的声音。如果选择含麦克风的采集来源，需要 Windows 允许应用使用麦克风（设置 › 隐私和安全性 › 麦克风）。` |
| `ko/…` | `앱은 별도 권한 없이 PC에서 재생되는 소리를 캡처하며, 마이크는 쓰지 않습니다.` | `앱은 별도 권한 없이 PC에서 재생되는 소리를 캡처합니다. 마이크가 들어간 입력 소스를 고르면 Windows에서 앱의 마이크 사용을 허용해야 합니다(설정 › 개인 정보 및 보안 › 마이크).` |

Nếu tệp không dùng `&amp;` ở chỗ khác mà dùng `&` thì theo cách của tệp.

- [ ] **Step 9: `guide-quick-start.mjs` (hai chỗ mỗi ngôn ngữ: mục `steps` dòng 24, và đoạn bước 4 khoảng dòng 110–112)**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/…` | `chọn cho phép. App không dùng micro. Trên Windows không có bước này.` | `chọn cho phép. Quyền Micro chỉ được hỏi khi bạn chọn nguồn có micro. Trên Windows không có bước này.` |
| `vi/…` | `đưa bạn tới đúng chỗ bật lại. App không dùng micro. Chi tiết:` | `đưa bạn tới đúng chỗ bật lại. Quyền Micro chỉ được hỏi khi bạn chọn nguồn có micro ở Cài đặt › Âm thanh. Chi tiết:` |
| `en/…` | `allow it. The app does not use the microphone. Windows has no such step.` | `allow it. The Microphone permission is asked only if you choose a source with the microphone. Windows has no such step.` |
| `en/…` | `takes you to the right place. The app does not use the microphone. More in` | `takes you to the right place. The Microphone permission is asked only if you choose a source with the microphone in Settings › Audio. More in` |
| `ja/…` | `許可します。アプリはマイクを使いません。Windows にはこの手順はありません。` | `許可します。マイクの許可は、マイクを含む入力元を選んだときだけ求められます。Windows にはこの手順はありません。` |
| `ja/…` | `該当する場所に移動できます。アプリはマイクを使いません。詳しくは` | `該当する場所に移動できます。マイクの許可は、設定 › 音声でマイクを含む入力元を選んだときだけ求められます。詳しくは` |
| `zh/…` | `请允许。应用不使用麦克风。Windows 没有这一步。` | `请允许。只有选择含麦克风的采集来源时，才会请求麦克风权限。Windows 没有这一步。` |
| `zh/…` | `会带你到正确的位置。应用不使用麦克风。详见` | `会带你到正确的位置。只有在“设置 › 音频”中选择含麦克风的采集来源时，才会请求麦克风权限。详见` |
| `ko/…` | `허용합니다. 앱은 마이크를 쓰지 않습니다. Windows에는 이 단계가 없습니다.` | `허용합니다. 마이크 권한은 마이크가 들어간 입력 소스를 고를 때만 묻습니다. Windows에는 이 단계가 없습니다.` |
| `ko/…` | `해당 위치로 갈 수 있습니다. 앱은 마이크를 쓰지 않습니다. 자세한 내용은` | `해당 위치로 갈 수 있습니다. 마이크 권한은 설정 › 오디오에서 마이크가 들어간 입력 소스를 고를 때만 묻습니다. 자세한 내용은` |

- [ ] **Step 10: `solutions-meetings.mjs` (chuỗi nháy kép trong mảng)**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/…` | `<em>Ghi âm thanh hệ thống</em>, không dùng micro; xem` | `<em>Ghi âm thanh hệ thống</em>; họp tại chỗ thì chọn thêm nguồn micro; xem` |
| `en/…` | `<em>System Audio Recording</em>; the microphone is not used; see` | `<em>System Audio Recording</em>; for people in the room, add the microphone as a source; see` |
| `ja/…` | `<em>システムオーディオの録音</em>を許可します。マイクは使いません。<a` | `<em>システムオーディオの録音</em>を許可します。会議室の発言者にはマイクを入力元に加えます。<a` |
| `zh/…` | `<em>系统音频录制</em>；不使用麦克风；见` | `<em>系统音频录制</em>；会议室里的发言人可加选麦克风作为采集来源；见` |
| `ko/…` | `<em>시스템 오디오 녹음</em>을 허용하며, 마이크는 쓰지 않습니다. <a` | `<em>시스템 오디오 녹음</em>을 허용하며, 회의실에서 말하는 사람은 마이크를 입력 소스로 더하면 됩니다. <a` |

- [ ] **Step 11: `solutions-webinar.mjs`**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/…` | `bạn cấp quyền <em>Ghi âm thanh hệ thống</em> một lần; app không dùng micro.` | `bạn cấp quyền <em>Ghi âm thanh hệ thống</em> một lần; với webinar, nguồn Âm thanh máy (mặc định) là đủ.` |
| `en/…` | `you grant the <em>System Audio Recording</em> permission once; the microphone is not used.` | `you grant the <em>System Audio Recording</em> permission once; for a webinar the default Computer audio source is all you need.` |
| `ja/…` | `<em>システムオーディオの録音</em>の許可を一度与えるだけで、マイクは使いません。` | `<em>システムオーディオの録音</em>の許可を一度与えるだけです。ウェビナーなら既定の入力元「コンピューターの音声」で足ります。` |
| `zh/…` | `你只需授予一次<em>系统音频录制</em>权限；不使用麦克风。` | `你只需授予一次<em>系统音频录制</em>权限；网络研讨会使用默认的“电脑音频”来源就够了。` |
| `ko/…` | `<em>시스템 오디오 녹음</em> 권한을 한 번만 허용하면 되며, 마이크는 쓰지 않습니다.` | `<em>시스템 오디오 녹음</em> 권한을 한 번만 허용하면 됩니다. 웨비나는 기본 입력 소스인 ‘컴퓨터 오디오’로 충분합니다.` |

- [ ] **Step 12: `modified` của các trang đã sửa**

Với mỗi tệp đã sửa ở Step 2–11 có trường `modified: "…"` (trang thường, không phải trang pháp lý), đặt bằng ngày hôm nay (`TZ=Asia/Ho_Chi_Minh date +%F`). Run để liệt kê:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && git diff --name-only -- src/content | xargs grep -n "^  modified:"
```

- [ ] **Step 13: Chạy test**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && pnpm test 2>&1 | grep -E "^not ok|# (pass|fail)"`
Expected: test quét `STALE_MIC` xanh. Chỉ còn được phép đỏ: test liên kết nội bộ vì `#quyen-micro`, `#microphone-permission`, `#micro`, `#microphone` chưa có (Task 4 thêm). Câu nào `STALE_MIC` còn bắt: đọc, sửa theo cùng cách, đủ năm ngôn ngữ. Test `STALE_COMPOSE` phải xanh.

- [ ] **Step 14: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add website/src/content website/test/site.test.mjs && git commit -m "docs(website): bỏ câu 'app không dùng micro' ở năm ngôn ngữ, thêm luật STALE_MIC" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Website — nội dung micro mới (năm ngôn ngữ)

**Files:** Modify `website/src/content/{vi,en,ja,zh,ko}/{features,home,faq,guide-troubleshooting,guide-audio-permission,data-security}.mjs`, `website/test/site.test.mjs`

- [ ] **Step 1: Test hỏng trước**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && cat >> test/site.test.mjs <<'EOF'

/** Trang có nội dung micro, theo ngôn ngữ: [đường dẫn, id mục]. */
const MIC_PAGES = {
  vi: { features: ["/tinh-nang/", "micro"], perm: ["/huong-dan/cap-quyen-thu-am-macos/", "quyen-micro"], trouble: ["/huong-dan/khac-phuc-su-co/", "khong-co-am-thanh"], faq: "/cau-hoi-thuong-gap/", home: "/" },
  en: { features: ["/en/features/", "microphone"], perm: ["/en/guide/macos-audio-permission/", "microphone-permission"], trouble: ["/en/guide/troubleshooting/", "no-audio"], faq: "/en/faq/", home: "/en/" },
  ja: { features: ["/ja/features/", "microphone"], perm: ["/ja/guide/macos-audio-permission/", "microphone-permission"], trouble: ["/ja/guide/troubleshooting/", "no-audio"], faq: "/ja/faq/", home: "/ja/" },
  zh: { features: ["/zh/features/", "microphone"], perm: ["/zh/guide/macos-audio-permission/", "microphone-permission"], trouble: ["/zh/guide/troubleshooting/", "no-audio"], faq: "/zh/faq/", home: "/zh/" },
  ko: { features: ["/ko/features/", "microphone"], perm: ["/ko/guide/macos-audio-permission/", "microphone-permission"], trouble: ["/ko/guide/troubleshooting/", "no-audio"], faq: "/ko/faq/", home: "/ko/" },
};

test("nguồn micro: Tính năng, Quyền, Khắc phục sự cố trích đúng chữ của app ở năm ngôn ngữ; Trang chủ và Hỏi đáp dẫn tới mục micro", async () => {
  const errors = [];
  for (const [lang, p] of Object.entries(MIC_PAGES)) {
    const d = await appDict(lang);
    const need = (where, text, keys) => {
      for (const k of keys) {
        if (!d[k]) errors.push(`${lang}: không đọc được khóa ${k} của từ điển app`);
        else if (!text.includes(d[k])) errors.push(`${where}: không trích "${d[k]}" (${k})`);
      }
    };
    const [fPath, fId] = p.features;
    const featuresHtml = htmlByPath.get(fPath) ?? "";
    if (!featuresHtml.includes(`id="${fId}"`)) errors.push(`${fPath}: không có mục #${fId}`);
    need(fPath, textOf(featuresHtml), ["settings.group.audio", "settings.audio.mode", "settings.audio.mode.playback", "settings.audio.mode.mic", "settings.audio.mode.both", "settings.audio.noiseFilter"]);
    need(`${p.perm[0]}#${p.perm[1]}`, guideSection(p.perm[0], p.perm[1]), ["settings.audio.mode.mic", "settings.audio.mode.both", "common.openMicSettings", "overlay.note.micPermission"]);
    need(`${p.trouble[0]}#${p.trouble[1]}`, guideSection(p.trouble[0], p.trouble[1]), ["overlay.note.micSilent", "overlay.note.micPermission", "overlay.note.micUnavailable", "common.openMicSettings", "settings.audio.refresh"]);
    for (const page of [p.home, p.faq]) {
      if (!(htmlByPath.get(page) ?? "").includes(`href="${fPath}#${fId}"`)) errors.push(`${page}: không dẫn tới ${fPath}#${fId}`);
    }
  }
  assert.deepEqual(errors, []);
});

test("nguồn micro: nội dung mới nói giới hạn thật (nói chen, tai nghe, khoảng 1 m, câu ngắn) và không nêu tên kỹ thuật", () => {
  const needs = {
    "/tinh-nang/": ["có thể bị bỏ sót", "tai nghe", "khoảng 1&nbsp;m", "“OK”", "mọi gói"],
    "/en/features/": ["may be missed", "Headphones", "about 1&nbsp;m", "“OK”", "every plan"],
  };
  const errors = [];
  for (const [urlPath, list] of Object.entries(needs)) {
    const html = htmlByPath.get(urlPath) ?? "";
    for (const n of list) if (!html.includes(n) && !textOf(html).includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
  }
  for (const [urlPath, html] of htmlByPath) {
    if (/\b(?:RNNoise|nnnoiseless|AEC3?|WebRTC|Silero|DuckingMixer)\b/i.test(textOf(html))) errors.push(`${urlPath}: nêu tên kỹ thuật lõi`);
  }
  assert.deepEqual(errors, []);
});
EOF
pnpm test 2>&1 | grep -E "^not ok|# fail" | head
```
Expected: hai test mới đỏ (thiếu mục, thiếu chữ), test chặn tên kỹ thuật trong test thứ hai không báo trang nào.

- [ ] **Step 2: `features.mjs` — mục h3 micro trong "Nguồn âm thanh"**

Chèn **ngay sau** đoạn `<p>` chứa câu đã sửa ở Task 3 Step 5 (đoạn cuối của khối `stack-lg` trong `<section class="section" id="nguon-am-thanh">`; en, ja, zh, ko: `id="audio-source"`), trước `</div>` đóng khối. Edit: `old_string` = cả dòng `<p>` đó, `new_string` = dòng đó + xuống dòng + khối dưới.

vi:
```
<h3 id="micro">Dịch cả giọng trong phòng</h3>
<p>Ở <strong>Cài đặt › Âm thanh › Thu từ</strong>, bạn chọn một trong ba nguồn. Dùng được ở mọi gói.</p>
${checkList([
  "<strong>Âm thanh máy</strong> (mặc định): họp online, video, webinar",
  "<strong>Micro</strong>: người nói trong phòng, như họp tại chỗ hay nghe giảng",
  "<strong>Âm thanh máy + Micro</strong>: họp lai, có cả người online lẫn người trong phòng. Khi người online đang nói, micro được hạ xuống để câu đó không bị dịch hai lần; người trong phòng nói chen đúng lúc ấy có thể bị bỏ sót. Đeo tai nghe cho kết quả tốt nhất",
  "<strong>Lọc tiếng ồn micro</strong> (bật sẵn): bỏ qua tiếng gõ phím, tiếng bút, tiếng gõ bàn. Câu chỉ một hai chữ như “OK”, “Vâng” có thể bị bỏ qua; phòng yên tĩnh thì tắt công tắc này để giữ các câu đó",
])}
<p>Micro của laptop nghe rõ nhất người nói gần (khoảng 1&nbsp;m) trong phòng yên tĩnh; phòng lớn nên dùng micro rời hay micro hội nghị. Khi thu từ micro, app chờ người nói ngừng 500&nbsp;ms mới chốt câu (âm thanh máy mặc định 50&nbsp;ms), nên phụ đề hiện chậm hơn khoảng nửa giây. Micro cũng chỉ dịch sang ngôn ngữ của bạn; app không phát gì vào cuộc họp. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/#quyen-micro">quyền Micro</a>.</p>
```

en:
```
<h3 id="microphone">Translate people in the room too</h3>
<p>In <strong>Settings › Audio › Capture from</strong>, choose one of three sources. Available on every plan.</p>
${checkList([
  "<strong>Computer audio</strong> (default): online meetings, videos, webinars",
  "<strong>Microphone</strong>: people speaking in the room, such as in-person meetings or lectures",
  "<strong>Computer audio + Microphone</strong>: hybrid meetings with people online and in the room. While someone online is speaking, the microphone is turned down so that sentence is not translated twice; someone in the room who speaks at that same moment may be missed. Headphones give the best results",
  "<strong>Filter microphone noise</strong> (on by default): ignores typing, pen clicks and desk taps. One- or two-word replies like “OK” may be missed; in a quiet room, turn it off to keep them",
])}
<p>A laptop microphone works best for people speaking nearby (about 1&nbsp;m) in a quiet room; for larger rooms use an external or conference microphone. When capturing from the microphone, the app waits for a 500&nbsp;ms pause before ending a sentence (computer audio defaults to 50&nbsp;ms), so subtitles appear about half a second later. The microphone is also translated into your language only; the app plays nothing into the meeting. See <a href="/en/guide/macos-audio-permission/#microphone-permission">Microphone permission</a>.</p>
```

ja:
```
<h3 id="microphone">会議室の声も翻訳する</h3>
<p><strong>設定 › 音声 › 入力元</strong>で、3 つの入力元から 1 つを選びます。どのプランでも使えます。</p>
${checkList([
  "<strong>コンピューターの音声</strong>（既定）：オンライン会議、動画、ウェビナー",
  "<strong>マイク</strong>：対面の会議や講義など、部屋の中で話す人",
  "<strong>コンピューターの音声 + マイク</strong>：オンラインの参加者と会議室の参加者がいるハイブリッド会議。オンラインの人が話している間はマイクの音量を下げ、同じ文が二重に翻訳されないようにします。そのとき会議室の人が同時に話すと、聞き逃すことがあります。ヘッドホンを使うと最もよい結果になります",
  "<strong>マイクのノイズを除去</strong>（既定でオン）：キーボードの音、ペンの音、机をたたく音を無視します。「OK」のような一、二語の返事は拾えないことがあります。静かな部屋では、オフにするとそうした返事も残せます",
])}
<p>ノートパソコンのマイクは、静かな部屋で近く（約 1&nbsp;m）にいる人の声に最も向いています。広い部屋では外付けマイクや会議用マイクを使ってください。マイクから取り込むとき、アプリは 500&nbsp;ms の間を待って文を区切る（コンピューターの音声の既定は 50&nbsp;ms）ため、字幕は約 0.5 秒遅れて表示されます。マイクの音声もあなたの言語にだけ翻訳され、アプリが会議に音を流すことはありません。<a href="/ja/guide/macos-audio-permission/#microphone-permission">マイクの許可</a>をご覧ください。</p>
```

zh:
```
<h3 id="microphone">也翻译会议室里的声音</h3>
<p>在<strong>设置 › 音频 › 采集来源</strong>中，从三种来源中选择一种。所有套餐都能使用。</p>
${checkList([
  "<strong>电脑音频</strong>（默认）：在线会议、视频、网络研讨会",
  "<strong>麦克风</strong>：在房间里说话的人，例如线下会议或听课",
  "<strong>电脑音频 + 麦克风</strong>：既有在线参会者、也有会议室参会者的混合会议。在线的人说话时，麦克风会被调低，避免同一句话被翻译两次；会议室里的人恰好在这时插话，可能会被漏掉。戴耳机效果最好",
  "<strong>过滤麦克风噪音</strong>（默认开启）：忽略键盘声、笔的咔嗒声和敲桌子的声音。“OK”这类只有一两个词的回答可能会被漏掉；在安静的房间里，关闭这个开关就能保留它们",
])}
<p>笔记本电脑的麦克风最适合在安静的房间里收听近处（约 1&nbsp;米）的人说话；大房间请使用外接麦克风或会议麦克风。从麦克风采集时，应用会等到 500&nbsp;ms 的停顿才结束一句话（电脑音频默认 50&nbsp;ms），所以字幕会晚约半秒出现。麦克风的声音也只翻译成你的语言；应用不会向会议播放任何声音。请参阅<a href="/zh/guide/macos-audio-permission/#microphone-permission">麦克风权限</a>。</p>
```

ko:
```
<h3 id="microphone">회의실 목소리도 번역하기</h3>
<p><strong>설정 › 오디오 › 입력 소스</strong>에서 세 가지 소스 중 하나를 고릅니다. 모든 요금제에서 쓸 수 있습니다.</p>
${checkList([
  "<strong>컴퓨터 오디오</strong>(기본): 온라인 회의, 동영상, 웨비나",
  "<strong>마이크</strong>: 대면 회의나 강의처럼 방 안에서 말하는 사람",
  "<strong>컴퓨터 오디오 + 마이크</strong>: 온라인 참석자와 회의실 참석자가 함께 있는 하이브리드 회의. 온라인 참석자가 말하는 동안에는 같은 문장이 두 번 번역되지 않도록 마이크 소리를 낮춥니다. 그때 회의실에서 동시에 말하면 놓칠 수 있습니다. 헤드폰을 쓰면 가장 좋습니다",
  "<strong>마이크 잡음 필터</strong>(기본 켜짐): 키보드 소리, 펜 소리, 책상 두드리는 소리를 무시합니다. ‘OK’ 같은 한두 단어짜리 대답은 놓칠 수 있으니, 조용한 방에서는 이 스위치를 꺼서 남기세요",
])}
<p>노트북 마이크는 조용한 방에서 가까이(약 1&nbsp;m) 있는 사람의 말을 가장 잘 듣습니다. 넓은 방에서는 외장 마이크나 회의용 마이크를 쓰세요. 마이크로 입력받을 때 앱은 500&nbsp;ms 동안 말이 멈춰야 문장을 끝내므로(컴퓨터 오디오 기본값은 50&nbsp;ms) 자막이 약 0.5초 늦게 나옵니다. 마이크 소리도 사용자의 언어로만 번역되며, 앱이 회의에 소리를 내보내지는 않습니다. <a href="/ko/guide/macos-audio-permission/#microphone-permission">마이크 권한</a>을 참고하세요.</p>
```

Kiểm `checkList` đã được import ở đầu mỗi `features.mjs` (`grep -n "checkList" */features.mjs | head`); thiếu thì thêm vào dòng import. Từ "gói"/"plan" theo cách trang Bảng giá của ngôn ngữ đó gọi (`grep -o "요금제\|플랜" ko/pricing.mjs | sort | uniq -c`); khác thì đổi theo.

- [ ] **Step 3: `home.mjs` — gạch đầu dòng ở "Dịch cuộc họp"**

Chèn sau gạch đầu dòng Từ điển (cuối `checkList` của mục đầu). Edit: `old_string` = dòng đó, `new_string` = dòng đó + xuống dòng + dòng mới.

| Tệp | Dòng neo (nguyên văn) | Dòng mới |
|---|---|---|
| `vi/home.mjs` | `  "Từ điển thuật ngữ gợi ý cho bộ dịch cách dịch tên riêng và thuật ngữ chuyên ngành (tính năng Pro)",` | `  "Họp tại chỗ hay họp lai: chọn nguồn <strong>Micro</strong> hoặc <strong>Âm thanh máy + Micro</strong> để dịch cả người nói trong phòng (<a href=\"/tinh-nang/#micro\">cách dùng</a>)",` |
| `en/home.mjs` | `  "A glossary gives the translator hints for names and industry terms (a Pro feature)",` | `  "In-person or hybrid meetings: choose the <strong>Microphone</strong> or <strong>Computer audio + Microphone</strong> source to translate people in the room too (<a href=\"/en/features/#microphone\">how it works</a>)",` |
| `ja/home.mjs` | `  "用語集を使うと、人名や業界の用語の訳し方をヒントとして翻訳に渡せます（Pro 機能）",` | `  "対面やハイブリッドの会議：入力元を<strong>マイク</strong>または<strong>コンピューターの音声 + マイク</strong>にすると、会議室の人の声も翻訳します（<a href=\"/ja/features/#microphone\">使い方</a>）",` |
| `zh/home.mjs` | `  "术语表把人名和行业术语的译法作为提示交给翻译（Pro 功能）",` | `  "线下或混合会议：把采集来源选为<strong>麦克风</strong>或<strong>电脑音频 + 麦克风</strong>，会议室里的人说的话也能翻译（<a href=\"/zh/features/#microphone\">使用方法</a>）",` |
| `ko/home.mjs` | `  "용어집으로 사람 이름과 업계 용어의 번역 방법을 번역에 힌트로 전달합니다(Pro 기능)",` | `  "대면 또는 하이브리드 회의: 입력 소스를 <strong>마이크</strong>나 <strong>컴퓨터 오디오 + 마이크</strong>로 고르면 회의실 사람의 말도 번역합니다(<a href=\"/ko/features/#microphone\">사용 방법</a>)",` |

Kiểm dòng neo chỉ có một lần trong tệp (`grep -c`); `home.mjs` có thể có câu Từ điển ở chỗ khác.

- [ ] **Step 4: `faq.mjs` — câu hỏi mới ngay sau câu hỏi quyền trên macOS**

Đọc khối `{ q: "<câu hỏi quyền macOS>", a: \`…\`, },` (vi "Cần cấp quyền gì trên macOS?", en "What permissions does it need on macOS?", ja "macOS ではどんな許可が必要ですか？", zh "在 macOS 上需要哪些权限？", ko "macOS에서는 어떤 권한이 필요한가요?"). Chèn ngay sau dấu `},` đóng khối đó một khối mới cùng thụt lề:

vi:
```
      {
        q: "Có dịch được người nói trong phòng họp không?",
        a: `<p>Có. Ở Cài đặt › Âm thanh, chọn nguồn <strong>Micro</strong> (chỉ người trong phòng) hoặc <strong>Âm thanh máy + Micro</strong> (họp lai). Micro của laptop hợp nhất với người nói gần, khoảng 1&nbsp;m, trong phòng yên tĩnh; phòng lớn nên dùng micro rời. Ở chế độ Âm thanh máy + Micro, người trong phòng nói chen đúng lúc người online đang nói có thể bị bỏ sót; đeo tai nghe cho kết quả tốt nhất. Khi bạn chọn nguồn có micro, app thu micro suốt phiên dịch, kể cả khi bạn đã tắt micro trong app họp; âm thanh chỉ nằm trong RAM, không ghi xuống đĩa, không gửi đi. Xem <a href="/tinh-nang/#micro">cách dùng</a>.</p>`,
      },
```
en:
```
      {
        q: "Can it translate people speaking in the room?",
        a: `<p>Yes. In Settings › Audio, choose the <strong>Microphone</strong> source (people in the room only) or <strong>Computer audio + Microphone</strong> (hybrid meetings). A laptop microphone works best for people speaking nearby, about 1&nbsp;m away, in a quiet room; use an external microphone for larger rooms. With Computer audio + Microphone, someone in the room who speaks at the same moment as someone online may be missed; headphones give the best results. When you choose a source with the microphone, the app captures it for the whole session, even if you have muted yourself in the meeting app; the audio stays in RAM and is never written to disk or sent anywhere. See <a href="/en/features/#microphone">how it works</a>.</p>`,
      },
```
ja:
```
      {
        q: "会議室で話している人の声も翻訳できますか？",
        a: `<p>はい。設定 › 音声で、入力元を<strong>マイク</strong>（会議室の人だけ）または<strong>コンピューターの音声 + マイク</strong>（ハイブリッド会議）にします。ノートパソコンのマイクは、静かな部屋で約 1&nbsp;m 以内にいる人の声に最も向いています。広い部屋では外付けマイクを使ってください。コンピューターの音声 + マイクでは、オンラインの人と同時に会議室の人が話すと、聞き逃すことがあります。ヘッドホンを使うと最もよい結果になります。マイクを含む入力元を選ぶと、会議アプリで自分のマイクをミュートしていても、セッション中はマイクを取り込み続けます。音声は RAM 上にだけあり、ディスクに書き込まれることも送信されることもありません。<a href="/ja/features/#microphone">使い方</a>をご覧ください。</p>`,
      },
```
zh:
```
      {
        q: "能翻译会议室里说话的人吗？",
        a: `<p>可以。在 设置 › 音频 中，把采集来源选为<strong>麦克风</strong>（只翻译会议室里的人）或<strong>电脑音频 + 麦克风</strong>（混合会议）。笔记本电脑的麦克风最适合在安静的房间里收听约 1&nbsp;米内的人说话；大房间请使用外接麦克风。使用“电脑音频 + 麦克风”时，会议室里的人如果恰好和在线的人同时说话，可能会被漏掉；戴耳机效果最好。选择含麦克风的采集来源后，即使你在会议应用中把自己静音，应用在整个会话期间仍会采集麦克风；音频只留在内存中，不写入磁盘，也不会发送出去。请参阅<a href="/zh/features/#microphone">使用方法</a>。</p>`,
      },
```
ko:
```
      {
        q: "회의실에서 말하는 사람도 번역할 수 있나요?",
        a: `<p>네. 설정 › 오디오에서 입력 소스를 <strong>마이크</strong>(회의실 사람만)나 <strong>컴퓨터 오디오 + 마이크</strong>(하이브리드 회의)로 고르세요. 노트북 마이크는 조용한 방에서 약 1&nbsp;m 안에 있는 사람의 말을 가장 잘 듣습니다. 넓은 방에서는 외장 마이크를 쓰세요. 컴퓨터 오디오 + 마이크에서는 온라인 참석자가 말하는 순간 회의실 사람이 함께 말하면 놓칠 수 있으니, 헤드폰을 쓰는 것이 가장 좋습니다. 마이크가 들어간 입력 소스를 고르면 회의 앱에서 내 마이크를 음소거해도 세션 내내 마이크를 캡처합니다. 오디오는 RAM에만 있고 디스크에 쓰거나 밖으로 보내지 않습니다. <a href="/ko/features/#microphone">사용 방법</a>을 참조하세요.</p>`,
      },
```
Thụt lề theo đúng tệp (đọc khối kề trước). Nếu Trang chủ lấy FAQ từ cùng danh sách và có test đếm số câu hỏi, sửa test đó theo số mới.

- [ ] **Step 5: `guide-troubleshooting.mjs` — bốn thẻ ở cuối lưới của mục đầu**

Mục đầu là `<h2 id="khong-co-am-thanh">` (en, ja, zh, ko: `id="no-audio"`), sau nó là `<div class="grid grid-2">` và các thẻ `<div class="card">…</div>`, mỗi thẻ một dòng. Chèn bốn dòng sau **sau thẻ cuối cùng** của lưới đó (trước dòng `</div>` đóng lưới). Edit: `old_string` = dòng thẻ cuối (nguyên văn), `new_string` = dòng đó + xuống dòng + bốn dòng.

vi:
```
<div class="card"><span class="card-title">“Micro không có tín hiệu”</span><p><strong>Nguyên nhân:</strong> Chỉ gặp với nguồn có micro. Micro bị tắt tiếng (phím tắt tiếng của micro, nút trên tai nghe), hoặc macOS chưa cho app dùng micro: khi đó macOS không báo lỗi mà chỉ đưa vào im lặng.</p><p><strong>Cách xử lý:</strong> Bật lại micro. Nếu vẫn vậy, bấm <strong>Mở cài đặt quyền micro</strong>, bật AI Translator, rồi chọn <strong>Thoát &amp; Mở lại</strong> khi macOS hỏi.</p></div>
<div class="card"><span class="card-title">“Micro chưa được phép”</span><p><strong>Nguyên nhân:</strong> Bạn đã từ chối quyền Micro. Ở nguồn Micro, phiên dịch không bắt đầu; ở nguồn Âm thanh máy + Micro, app chỉ dịch âm thanh máy.</p><p><strong>Cách xử lý:</strong> Bấm <strong>Mở cài đặt quyền micro</strong> và bật AI Translator (macOS: Privacy &amp; Security › Microphone; Windows: Settings › Privacy &amp; security › Microphone, bật cả <em>Let desktop apps access your microphone</em>). Trên macOS, chọn <strong>Thoát &amp; Mở lại</strong> khi được hỏi. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/#quyen-micro">quyền Micro</a>.</p></div>
<div class="card"><span class="card-title">“Không mở được micro”</span><p><strong>Nguyên nhân:</strong> Micro đã chọn bị rút, không còn, hoặc đang bị app khác giữ riêng.</p><p><strong>Cách xử lý:</strong> Cắm lại micro, hoặc ở Cài đặt › Âm thanh bấm <strong>Làm mới danh sách</strong> rồi chọn micro khác. Ở nguồn Âm thanh máy + Micro, app vẫn dịch âm thanh máy và tự thử mở lại micro mỗi 2 giây.</p></div>
<div class="card"><span class="card-title">Tai nghe Bluetooth nghe kém đi khi dùng micro của nó</span><p><strong>Nguyên nhân:</strong> Dùng micro của tai nghe Bluetooth làm tai nghe chuyển sang chế độ gọi, nên tiếng nghe kém đi.</p><p><strong>Cách xử lý:</strong> Ở Cài đặt › Âm thanh › Micro, chọn micro của máy hoặc micro rời; vẫn dùng tai nghe để nghe.</p></div>
```
en:
```
<div class="card"><span class="card-title">“Microphone has no signal”</span><p><strong>Cause:</strong> Only with a source that includes the microphone. The microphone is muted (its mute key, or a button on the headset), or macOS has not allowed the app to use it: macOS then shows no error and only passes silence.</p><p><strong>Fix:</strong> Unmute the microphone. If that does not help, click <strong>Open microphone settings</strong>, turn on AI Translator, then choose <strong>Quit &amp; Reopen</strong> when macOS asks.</p></div>
<div class="card"><span class="card-title">“Microphone not allowed”</span><p><strong>Cause:</strong> You declined the Microphone permission. With the Microphone source the session does not start; with Computer audio + Microphone the app translates computer audio only.</p><p><strong>Fix:</strong> Click <strong>Open microphone settings</strong> and turn on AI Translator (macOS: Privacy &amp; Security › Microphone; Windows: Settings › Privacy &amp; security › Microphone, and also turn on <em>Let desktop apps access your microphone</em>). On macOS, choose <strong>Quit &amp; Reopen</strong> when asked. See <a href="/en/guide/macos-audio-permission/#microphone-permission">Microphone permission</a>.</p></div>
<div class="card"><span class="card-title">“Microphone unavailable”</span><p><strong>Cause:</strong> The selected microphone was unplugged, is gone, or is held exclusively by another app.</p><p><strong>Fix:</strong> Plug it back in, or in Settings › Audio click <strong>Refresh list</strong> and choose another microphone. With Computer audio + Microphone the app keeps translating computer audio and retries the microphone every 2 seconds.</p></div>
<div class="card"><span class="card-title">A Bluetooth headset sounds worse when its microphone is used</span><p><strong>Cause:</strong> Using a Bluetooth headset's microphone switches the headset to call mode, which lowers audio quality.</p><p><strong>Fix:</strong> In Settings › Audio › Microphone, choose the computer's microphone or an external one; keep using the headset to listen.</p></div>
```
ja (chữ "原因"/"対処" theo đúng nhãn các thẻ sẵn có của tệp; đọc một thẻ cũ để lấy nhãn):
```
<div class="card"><span class="card-title">「マイクの信号なし」</span><p><strong>原因：</strong>マイクを含む入力元のときだけ起こります。マイクがミュートされている（マイクのミュートキー、ヘッドセットのボタン）か、macOS がアプリのマイク使用を許可していません。その場合 macOS はエラーを出さず、無音だけを渡します。</p><p><strong>対処：</strong>マイクのミュートを解除します。それでも直らなければ<strong>マイクの設定を開く</strong>を押して AI Translator をオンにし、macOS に聞かれたら<strong>終了して再度開く</strong>を選びます。</p></div>
<div class="card"><span class="card-title">「マイクが許可されていません」</span><p><strong>原因：</strong>マイクの許可を拒否しました。入力元が「マイク」ならセッションは始まりません。「コンピューターの音声 + マイク」なら、アプリはコンピューターの音声だけを翻訳します。</p><p><strong>対処：</strong><strong>マイクの設定を開く</strong>を押して AI Translator をオンにします（macOS：システム設定 › プライバシーとセキュリティ › マイク。Windows：設定 › プライバシーとセキュリティ › マイクで、<em>デスクトップ アプリがマイクにアクセスできるようにする</em>もオン）。macOS では、聞かれたら<strong>終了して再度開く</strong>を選びます。<a href="/ja/guide/macos-audio-permission/#microphone-permission">マイクの許可</a>をご覧ください。</p></div>
<div class="card"><span class="card-title">「マイクを開けません」</span><p><strong>原因：</strong>選んだマイクが抜かれた、見つからない、またはほかのアプリが独占しています。</p><p><strong>対処：</strong>マイクを挿し直すか、設定 › 音声で<strong>リストを更新</strong>を押して別のマイクを選びます。「コンピューターの音声 + マイク」では、アプリはコンピューターの音声の翻訳を続け、2 秒ごとにマイクを開き直します。</p></div>
<div class="card"><span class="card-title">Bluetooth ヘッドセットのマイクを使うと音が悪くなる</span><p><strong>原因：</strong>Bluetooth ヘッドセットのマイクを使うと、ヘッドセットが通話モードに切り替わり、音質が下がります。</p><p><strong>対処：</strong>設定 › 音声 › マイクで、パソコンのマイクか外付けマイクを選びます。聞くのはヘッドセットのままで構いません。</p></div>
```
zh:
```
<div class="card"><span class="card-title">“麦克风没有信号”</span><p><strong>原因：</strong>只在含麦克风的采集来源下出现。麦克风被静音（麦克风的静音键、耳机上的按钮），或者 macOS 还没允许应用使用麦克风：这时 macOS 不报错，只送来静音。</p><p><strong>解决：</strong>取消麦克风静音。如果仍然如此，点<strong>打开麦克风设置</strong>，开启 AI Translator，然后在 macOS 询问时选择<strong>退出并重新打开</strong>。</p></div>
<div class="card"><span class="card-title">“麦克风未获准”</span><p><strong>原因：</strong>你拒绝了麦克风权限。采集来源是“麦克风”时会话不会开始；是“电脑音频 + 麦克风”时，应用只翻译电脑音频。</p><p><strong>解决：</strong>点<strong>打开麦克风设置</strong>并开启 AI Translator（macOS：系统设置 › 隐私与安全性 › 麦克风；Windows：设置 › 隐私和安全性 › 麦克风，并开启<em>允许桌面应用访问你的麦克风</em>）。在 macOS 上，被询问时选择<strong>退出并重新打开</strong>。请参阅<a href="/zh/guide/macos-audio-permission/#microphone-permission">麦克风权限</a>。</p></div>
<div class="card"><span class="card-title">“无法打开麦克风”</span><p><strong>原因：</strong>所选的麦克风被拔出、已不存在，或被其他应用独占。</p><p><strong>解决：</strong>重新插上麦克风，或在 设置 › 音频 中点<strong>刷新列表</strong>并选择其他麦克风。使用“电脑音频 + 麦克风”时，应用会继续翻译电脑音频，并每 2 秒重试打开麦克风。</p></div>
<div class="card"><span class="card-title">使用蓝牙耳机的麦克风时，耳机声音变差</span><p><strong>原因：</strong>使用蓝牙耳机的麦克风会让耳机切换到通话模式，音质随之下降。</p><p><strong>解决：</strong>在 设置 › 音频 › 麦克风 中选择电脑的麦克风或外接麦克风；耳机照样用来听。</p></div>
```
ko:
```
<div class="card"><span class="card-title">“마이크 신호 없음”</span><p><strong>원인:</strong> 마이크가 들어간 입력 소스에서만 생깁니다. 마이크가 음소거되었거나(마이크 음소거 키, 헤드셋 버튼) macOS가 앱의 마이크 사용을 허용하지 않았습니다. 이때 macOS는 오류 없이 무음만 넘겨줍니다.</p><p><strong>해결:</strong> 마이크 음소거를 풉니다. 그래도 같으면 <strong>마이크 설정 열기</strong>를 눌러 AI Translator를 켜고, macOS가 물으면 <strong>종료 후 다시 열기</strong>를 고릅니다.</p></div>
<div class="card"><span class="card-title">“마이크 권한 없음”</span><p><strong>원인:</strong> 마이크 권한을 거부했습니다. 입력 소스가 ‘마이크’면 세션이 시작되지 않고, ‘컴퓨터 오디오 + 마이크’면 앱이 컴퓨터 오디오만 번역합니다.</p><p><strong>해결:</strong> <strong>마이크 설정 열기</strong>를 눌러 AI Translator를 켭니다(macOS: 시스템 설정 › 개인정보 보호 및 보안 › 마이크, Windows: 설정 › 개인 정보 및 보안 › 마이크에서 <em>데스크톱 앱에서 마이크에 액세스하도록 허용</em>도 켜기). macOS에서는 물으면 <strong>종료 후 다시 열기</strong>를 고릅니다. <a href="/ko/guide/macos-audio-permission/#microphone-permission">마이크 권한</a>을 참고하세요.</p></div>
<div class="card"><span class="card-title">“마이크를 열 수 없음”</span><p><strong>원인:</strong> 고른 마이크가 뽑혔거나, 없어졌거나, 다른 앱이 독점하고 있습니다.</p><p><strong>해결:</strong> 마이크를 다시 꽂거나, 설정 › 오디오에서 <strong>목록 새로 고침</strong>을 누르고 다른 마이크를 고릅니다. ‘컴퓨터 오디오 + 마이크’에서는 앱이 컴퓨터 오디오 번역을 이어 가며 2초마다 마이크를 다시 열어 봅니다.</p></div>
<div class="card"><span class="card-title">블루투스 헤드셋의 마이크를 쓰면 소리가 나빠짐</span><p><strong>원인:</strong> 블루투스 헤드셋의 마이크를 쓰면 헤드셋이 통화 모드로 바뀌어 음질이 떨어집니다.</p><p><strong>해결:</strong> 설정 › 오디오 › 마이크에서 컴퓨터 마이크나 외장 마이크를 고르고, 듣기는 헤드셋으로 계속하면 됩니다.</p></div>
```
Nhãn "Nguyên nhân/Cách xử lý", "Cause/Fix" và tương đương ja/zh/ko lấy đúng như thẻ cũ của tệp (đọc trước khi dán; khác thì thay cho khớp).

- [ ] **Step 6: `guide-audio-permission.mjs` — mục h2 Quyền Micro và mục lục**

(a) Mục lục: chèn trước mục `nguon-am-thanh` (en, ja, zh, ko: `audio-source`).

| Tệp | Thay (dòng mục lục, nguyên văn) | Bằng |
|---|---|---|
| `vi/…` | `  { level: 2, id: "nguon-am-thanh", text: "Chọn nguồn âm thanh" },` | `  { level: 2, id: "quyen-micro", text: "Quyền Micro" },` + xuống dòng + dòng cũ |
| `en/…` | `  { level: 2, id: "audio-source", text: "Choosing the audio source" },` | `  { level: 2, id: "microphone-permission", text: "Microphone permission" },` + xuống dòng + dòng cũ |
| `ja/…` | `  { level: 2, id: "audio-source", text: "音声ソースを選ぶ" },` | `  { level: 2, id: "microphone-permission", text: "マイクの許可" },` + xuống dòng + dòng cũ |
| `zh/…` | `  { level: 2, id: "audio-source", text: "选择音频来源" },` | `  { level: 2, id: "microphone-permission", text: "麦克风权限" },` + xuống dòng + dòng cũ |
| `ko/…` | `  { level: 2, id: "audio-source", text: "오디오 소스 고르기" },` | `  { level: 2, id: "microphone-permission", text: "마이크 권한" },` + xuống dòng + dòng cũ |

(b) Thân trang: chèn khối dưới **ngay trước** dòng `<h2 id="nguon-am-thanh">` (en, ja, zh, ko: `<h2 id="audio-source">`). Edit: `old_string` = dòng h2 đó, `new_string` = khối + dòng trống + dòng h2.

vi:
```
<h2 id="quyen-micro">Quyền Micro (khi chọn nguồn có micro)</h2>
<p>Khi bạn chọn <strong>Micro</strong> hoặc <strong>Âm thanh máy + Micro</strong> ở <strong>Cài đặt › Âm thanh › Thu từ</strong>, macOS hỏi quyền <strong>Micro</strong> ngay lúc đó, hoặc lần đầu bạn bấm Bắt đầu. Hãy chọn cho phép.</p>
<ul>
<li><strong>Nếu bạn từ chối:</strong> ở nguồn Micro, phiên dịch không bắt đầu; ở nguồn Âm thanh máy + Micro, app vẫn dịch âm thanh máy và ghi chú “Micro chưa được phép”. Bấm <strong>Mở cài đặt quyền micro</strong> (System Settings › Privacy &amp; Security › Microphone), bật AI Translator, rồi chọn <strong>Thoát &amp; Mở lại</strong> khi macOS hỏi: quyền mới chỉ có tác dụng sau khi app mở lại.</li>
<li><strong>Sau mỗi lần cập nhật,</strong> macOS có thể hỏi lại quyền Micro, như quyền Ghi âm thanh hệ thống (<a href="#sau-cap-nhat">xem trên</a>).</li>
<li><strong>Tắt micro trong app họp không làm AI Translator ngừng nghe:</strong> trong lúc phiên dịch chạy, app vẫn thu micro. macOS hiện chấm màu cam ở thanh menu khi có app đang dùng micro. Muốn app ngừng nghe micro, bấm Dừng.</li>
<li><strong>Windows:</strong> nếu micro bị chặn trong cài đặt quyền riêng tư, mở Settings › Privacy &amp; security › Microphone, bật <em>Microphone access</em> và <em>Let desktop apps access your microphone</em>.</li>
</ul>
```
en:
```
<h2 id="microphone-permission">Microphone permission (when you choose a source with the microphone)</h2>
<p>When you choose <strong>Microphone</strong> or <strong>Computer audio + Microphone</strong> in <strong>Settings › Audio › Capture from</strong>, macOS asks for the <strong>Microphone</strong> permission right away, or the first time you press Start. Allow it.</p>
<ul>
<li><strong>If you decline:</strong> with the Microphone source the session does not start; with Computer audio + Microphone the app still translates computer audio and shows “Microphone not allowed”. Click <strong>Open microphone settings</strong> (System Settings › Privacy &amp; Security › Microphone), turn on AI Translator, then choose <strong>Quit &amp; Reopen</strong> when macOS asks: the new permission only takes effect once the app reopens.</li>
<li><strong>After each update,</strong> macOS may ask for the Microphone permission again, just like System Audio Recording (<a href="#after-updates">see above</a>).</li>
<li><strong>Muting yourself in the meeting app does not stop AI Translator listening:</strong> while a session runs, the app keeps capturing the microphone. macOS shows an orange dot in the menu bar while an app uses the microphone. To stop the app listening to the microphone, press Stop.</li>
<li><strong>Windows:</strong> if the microphone is blocked in the privacy settings, open Settings › Privacy &amp; security › Microphone and turn on <em>Microphone access</em> and <em>Let desktop apps access your microphone</em>.</li>
</ul>
```
ja:
```
<h2 id="microphone-permission">マイクの許可（マイクを含む入力元を選んだとき）</h2>
<p><strong>設定 › 音声 › 入力元</strong>で<strong>マイク</strong>または<strong>コンピューターの音声 + マイク</strong>を選ぶと、macOS はその場で、または初めて「開始」を押したときに<strong>マイク</strong>の許可を求めます。許可してください。</p>
<ul>
<li><strong>拒否した場合：</strong>入力元が「マイク」ならセッションは始まりません。「コンピューターの音声 + マイク」なら、アプリはコンピューターの音声の翻訳を続け、「マイクが許可されていません」と表示します。<strong>マイクの設定を開く</strong>（システム設定 › プライバシーとセキュリティ › マイク）を押して AI Translator をオンにし、macOS に聞かれたら<strong>終了して再度開く</strong>を選びます。新しい許可はアプリを開き直したあとで有効になります。</li>
<li><strong>アップデートのたびに、</strong>システムオーディオの録音と同じく、macOS がマイクの許可をもう一度求めることがあります（<a href="#after-updates">上記</a>）。</li>
<li><strong>会議アプリで自分をミュートしても、AI Translator は聞き取りを止めません：</strong>セッション中、アプリはマイクを取り込み続けます。アプリがマイクを使っている間、macOS はメニューバーにオレンジ色の点を表示します。マイクの聞き取りを止めるには「停止」を押します。</li>
<li><strong>Windows：</strong>プライバシーの設定でマイクがブロックされている場合は、設定 › プライバシーとセキュリティ › マイクを開き、<em>マイクへのアクセス</em>と<em>デスクトップ アプリがマイクにアクセスできるようにする</em>をオンにします。</li>
</ul>
```
zh:
```
<h2 id="microphone-permission">麦克风权限（选择含麦克风的采集来源时）</h2>
<p>在<strong>设置 › 音频 › 采集来源</strong>中选择<strong>麦克风</strong>或<strong>电脑音频 + 麦克风</strong>时，macOS 会立即，或在你第一次点“开始”时，请求<strong>麦克风</strong>权限。请允许。</p>
<ul>
<li><strong>如果你拒绝：</strong>采集来源是“麦克风”时会话不会开始；是“电脑音频 + 麦克风”时，应用仍会翻译电脑音频，并提示“麦克风未获准”。点<strong>打开麦克风设置</strong>（系统设置 › 隐私与安全性 › 麦克风），开启 AI Translator，然后在 macOS 询问时选择<strong>退出并重新打开</strong>：新权限要在应用重新打开后才生效。</li>
<li><strong>每次更新后，</strong>macOS 可能会像系统音频录制一样，再次请求麦克风权限（<a href="#after-updates">见上文</a>）。</li>
<li><strong>在会议应用里把自己静音，不会让 AI Translator 停止收听：</strong>会话进行时，应用会一直采集麦克风。有应用在使用麦克风时，macOS 会在菜单栏显示一个橙色圆点。要让应用停止收听麦克风，请点“停止”。</li>
<li><strong>Windows：</strong>如果麦克风在隐私设置中被阻止，请打开 设置 › 隐私和安全性 › 麦克风，开启<em>麦克风访问权限</em>和<em>允许桌面应用访问你的麦克风</em>。</li>
</ul>
```
ko:
```
<h2 id="microphone-permission">마이크 권한(마이크가 들어간 입력 소스를 고를 때)</h2>
<p><strong>설정 › 오디오 › 입력 소스</strong>에서 <strong>마이크</strong>나 <strong>컴퓨터 오디오 + 마이크</strong>를 고르면, macOS가 바로 또는 처음 ‘시작’을 누를 때 <strong>마이크</strong> 권한을 묻습니다. 허용하세요.</p>
<ul>
<li><strong>거부했다면:</strong> 입력 소스가 ‘마이크’면 세션이 시작되지 않고, ‘컴퓨터 오디오 + 마이크’면 앱이 컴퓨터 오디오는 계속 번역하면서 “마이크 권한 없음”을 표시합니다. <strong>마이크 설정 열기</strong>(시스템 설정 › 개인정보 보호 및 보안 › 마이크)를 눌러 AI Translator를 켜고, macOS가 물으면 <strong>종료 후 다시 열기</strong>를 고르세요. 새 권한은 앱을 다시 연 뒤에 적용됩니다.</li>
<li><strong>업데이트할 때마다</strong> macOS가 시스템 오디오 녹음처럼 마이크 권한을 다시 물을 수 있습니다(<a href="#after-updates">위 참조</a>).</li>
<li><strong>회의 앱에서 내 마이크를 음소거해도 AI Translator는 계속 듣습니다:</strong> 세션이 진행되는 동안 앱은 마이크를 계속 캡처합니다. 앱이 마이크를 쓰는 동안 macOS는 메뉴 막대에 주황색 점을 표시합니다. 앱이 마이크를 그만 듣게 하려면 ‘중지’를 누르세요.</li>
<li><strong>Windows:</strong> 개인 정보 설정에서 마이크가 막혀 있다면 설정 › 개인 정보 및 보안 › 마이크를 열고 <em>마이크 액세스</em>와 <em>데스크톱 앱에서 마이크에 액세스하도록 허용</em>을 켜세요.</li>
</ul>
```
Đã kiểm (2026-10-24): mục "Sau mỗi lần cập nhật" có id `sau-cap-nhat` (vi) và `after-updates` (en, ja, zh, ko); nút dừng của app (`home.stop`) là Dừng / Stop / 停止 / 停止 / 중지.

- [ ] **Step 7: `data-security.mjs` — dòng âm thanh ở bảng "Dữ liệu ở lại trên máy"**

| Tệp | Thay | Bằng |
|---|---|---|
| `vi/…` | `<tr><th scope="row">Âm thanh hệ thống đang thu</th><td>Chỉ nằm trong RAM khi dịch. Không ghi đĩa, không gửi qua mạng. AI Translator cũng không ghi âm cuộc họp thành file.</td></tr>` | `<tr><th scope="row">Âm thanh đang thu (âm thanh máy và, nếu bạn chọn, micro)</th><td>Chỉ nằm trong RAM khi dịch. Không ghi đĩa, không gửi qua mạng. AI Translator cũng không ghi âm cuộc họp thành file. Khi bạn chọn nguồn có micro, app thu micro suốt phiên dịch, kể cả khi bạn đã tắt micro trong app họp.</td></tr>` |
| `en/…` | `<tr><th scope="row">System audio being captured</th><td>Only in RAM while translating. Never written to disk, never sent over the network. AI Translator does not record meetings to a file either.</td></tr>` | `<tr><th scope="row">Audio being captured (computer audio and, if you choose, the microphone)</th><td>Only in RAM while translating. Never written to disk, never sent over the network. AI Translator does not record meetings to a file either. If you choose a source with the microphone, the app captures it for the whole session, even if you have muted yourself in the meeting app.</td></tr>` |
| `ja/…` | `<tr><th scope="row">取り込み中のシステム音声</th><td>翻訳中に RAM 上にだけ存在します。ディスクに書き込まれることも、ネットワークに送られることもありません。AI Translator は会議をファイルに録音することもしません。</td></tr>` | `<tr><th scope="row">取り込み中の音声（コンピューターの音声と、選んだ場合はマイク）</th><td>翻訳中に RAM 上にだけ存在します。ディスクに書き込まれることも、ネットワークに送られることもありません。AI Translator は会議をファイルに録音することもしません。マイクを含む入力元を選ぶと、会議アプリで自分のマイクをミュートしていても、セッション中はマイクを取り込み続けます。</td></tr>` |
| `zh/…` | `<tr><th scope="row">正在采集的系统音频</th><td>翻译时只在内存中。从不写入磁盘，从不通过网络发送。AI Translator 也不会把会议录制成文件。</td></tr>` | `<tr><th scope="row">正在采集的音频（电脑音频，以及你选择时的麦克风）</th><td>翻译时只在内存中。从不写入磁盘，从不通过网络发送。AI Translator 也不会把会议录制成文件。选择含麦克风的采集来源时，即使你在会议应用中把自己静音，应用在整个会话期间仍会采集麦克风。</td></tr>` |
| `ko/…` | `<tr><th scope="row">캡처 중인 시스템 오디오</th><td>번역하는 동안 RAM에만 있습니다. 디스크에 쓰지 않고, 네트워크로 보내지 않습니다. AI Translator는 회의를 파일로 녹음하지도 않습니다.</td></tr>` | `<tr><th scope="row">캡처 중인 오디오(컴퓨터 오디오와, 고른 경우 마이크)</th><td>번역하는 동안 RAM에만 있습니다. 디스크에 쓰지 않고, 네트워크로 보내지 않습니다. AI Translator는 회의를 파일로 녹음하지도 않습니다. 마이크가 들어간 입력 소스를 고르면 회의 앱에서 내 마이크를 음소거해도 세션 내내 마이크를 캡처합니다.</td></tr>` |

- [ ] **Step 8: `modified` và test**

Đặt `modified` ngày hôm nay cho mọi trang thường vừa sửa (như Task 3 Step 12).

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && pnpm test 2>&1 | grep -E "^not ok|# (pass|fail)"`
Expected: `# fail 0` (kể cả test liên kết nội bộ, `i18n-content`, `STALE_MIC`, `STALE_COMPOSE`, chặn công nghệ lõi). Test nào đỏ: đọc thông báo, sửa nội dung (không nới test), đủ năm ngôn ngữ.

- [ ] **Step 9: Xem bằng mắt**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && node src/build/build.mjs >/dev/null && ls dist/tinh-nang/index.html dist/en/features/index.html`
Mở `dist/tinh-nang/index.html#micro`, `dist/en/guide/macos-audio-permission/index.html#microphone-permission`, `dist/ja/guide/troubleshooting/index.html#no-audio` bằng Chrome không đầu (`website/tools/browser/cdp.mjs`, như `scripts/ui-preview/shoot.mjs`) hay `open`; chụp ba ảnh vào scratchpad và xem: danh sách không vỡ khung, chữ không tràn, khoảng `&nbsp;` không lộ ra dạng chữ.

- [ ] **Step 10: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add website/src/content website/test/site.test.mjs && git commit -m "docs(website): hướng dẫn nguồn micro ở năm ngôn ngữ (tính năng, quyền micro, khắc phục sự cố, hỏi đáp, dữ liệu)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ảnh Cài đặt › Âm thanh

**Files:** Modify `scripts/ui-preview/shoot.mjs:51`, `website/src/assets/img/app/app-settings-audio.{vi,en,ja,zh,ko}.webp`, `website/src/assets/img/app/manifest.json`, alt ở `website/src/content/{vi,en,ja,zh,ko}/guide-audio-permission.mjs` (và mọi nơi khác dùng `slug: "app-settings-audio"`)

- [ ] **Step 1: Đổi cảnh chụp**

Tệp: `scripts/ui-preview/shoot.mjs`
```old
  ["app-settings-audio", "screen=settings&group=audio"],
```
```new
  ["app-settings-audio", "screen=settings&group=audio&capture=both", { fit: true }],
```

- [ ] **Step 2: Chụp**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && (pnpm exec vite --config scripts/ui-preview/vite.config.ts --port 1431 --strictPort > "$TMPDIR/vite-1431.log" 2>&1 &) && sleep 4 && node scripts/ui-preview/shoot.mjs --port=1431 app-settings-audio; pkill -f "vite --config scripts/ui-preview/vite.config.ts --port 1431"
```
Expected: năm file `app-settings-audio.<lang>.webp` ghi lại, `manifest.json` cập nhật kích thước. Vite ở cổng 1431 đã tắt (`lsof -i :1431` không in gì). Không đụng Vite cổng khác nếu đang chạy.

- [ ] **Step 3: Xem ảnh và sửa alt**

Đọc ảnh vi và en (công cụ Read). Phải thấy: ô Thu từ đang là "Âm thanh máy + Micro", ô nguồn âm thanh máy, ô micro, ghi chú nhường lời, công tắc lọc ồn, thanh ngắt câu ở 500 ms, không bị cắt mép dưới.

Tìm mọi chỗ dùng ảnh: `grep -rn 'slug: "app-settings-audio"' website/src/content`. Sửa `alt` và `caption` theo cảnh mới, năm ngôn ngữ. vi: `alt: "Cài đặt Âm thanh: ô Thu từ đang là Âm thanh máy + Micro, ô chọn nguồn âm thanh máy, ô chọn micro, công tắc Lọc tiếng ồn micro và thanh Độ nhạy ngắt câu khóa ở 500 ms"`, `caption: "Cài đặt › Âm thanh: chọn thu từ âm thanh máy, micro hay cả hai."`; en: `alt: "Audio settings: Capture from set to Computer audio + Microphone, the computer audio source, the microphone, the Filter microphone noise switch and the sentence pause slider locked at 500 ms"`, `caption: "Settings › Audio: capture computer audio, the microphone, or both."`; ja/zh/ko dịch tương đương bằng chữ của app (bảng ở đầu kế hoạch). Mô tả trong `manifest.json` (nếu có trường mô tả) sửa theo.

- [ ] **Step 4: Test và commit**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && pnpm test 2>&1 | grep -E "^not ok|# (pass|fail)"`
Expected: `# fail 0`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add scripts/ui-preview/shoot.mjs website/src/assets/img/app website/src/content && git commit -m "docs(website): chụp lại Cài đặt › Âm thanh ở chế độ Âm thanh máy + Micro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Giấy phép bên thứ ba và kiểm phụ thuộc

**Files:** không sửa (chỉ kiểm). Nếu phải sửa `deny.toml` hay `about.toml` thì dừng, báo chủ dự án.

- [ ] **Step 1: `cargo deny`**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo deny check 2>&1 | tail -15`
Expected: `advisories ok, bans ok, licenses ok, sources ok`. Lỗi advisory mới (không liên quan micro) thì ghi lại, báo chủ dự án, không tự nâng bản ở kế hoạch này.

- [ ] **Step 2: Notices có `nnnoiseless` và giấy phép RNNoise**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && node scripts/release/notices.mjs --out "$TMPDIR/notices-micro.txt" --no-llama && grep -n -A3 "nnnoiseless" "$TMPDIR/notices-micro.txt" | head -20 && grep -c "BSD-3-Clause" "$TMPDIR/notices-micro.txt"
```
Expected: lệnh thoát 0; có mục `nnnoiseless 0.5.x` kèm văn bản BSD-3-Clause (bản quyền Xiph.Org / Mozilla / Jean-Marc Valin hay tác giả của crate). Thiếu văn bản giấy phép thì dừng, báo chủ dự án.

- [ ] **Step 3: Test notices**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && node --test "scripts/release/*.test.mjs" 2>&1 | tail -3 && pnpm exec vitest run src/lib/notices.test.ts 2>&1 | tail -3`
Expected: pass.

Không commit (không đổi file). Ghi kết quả vào biên bản ở Task 7 Step 5.

---

### Task 7: Nghiệm thu offline — A4-mic, A-trộn, A-ảo trên commit ứng viên

**Files:** Create `bench/2026-10-24-nguon-micro/results/nghiem-thu.md`

Không phát tiếng, không mở micro: chỉ chạy lại `latency-bench mix-eval` trên bản thu đã có của spike (`bench/2026-10-24-nguon-micro/data/scenes/`, không commit). `mix-eval` dùng chính `audio_capture::mic_chain::Limiter` và `audio_capture::duck::DuckingMixer` của app.

- [ ] **Step 1: Build release**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git rev-parse --short HEAD && cargo build --release -p latency-bench -p asr-worker 2>&1 | tail -2`
Expected: `Finished`. Ghi mã commit (commit ứng viên).

- [ ] **Step 2: Chế độ micro, gói Chuẩn và gói Nhẹ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && VARIANTS=chot-moi bash bench/2026-10-24-nguon-micro/data/chay-limiter.sh ggml-large-v3-turbo-q5_0.bin nt-chuan && VARIANTS=chot-moi bash bench/2026-10-24-nguon-micro/data/chay-limiter.sh ggml-small-q5_1.bin nt-nhe
```
Expected: mỗi cảnh in `<cảnh> nt-chuan xong` / `nt-nhe xong` (6 cảnh × 2). Chạy khoảng 20–40 phút; dùng `run_in_background` và chờ thông báo.

- [ ] **Step 3: Chế độ trộn (A-trộn)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && W=$PWD M=/Users/dtphong/Desktop/software_business/ai-translator B=$PWD/bench/2026-10-24-nguon-micro && "$W/target/release/latency-bench" mix-eval --scene "$B/data/scenes/s1-loa" --variants "$B/variants/both-chot-moi.json" --asr-worker "$W/target/release/asr-worker" --asr-model "$M/models/ggml-large-v3-turbo-q5_0.bin" --vad-model "$M/models/silero_vad_v6.2.3.onnx" --out "$B/data/results/s1-loa/nt-tron" > "$B/data/results/s1-loa-nt-tron.log" 2>&1; tail -1 "$B/data/results/s1-loa-nt-tron.log"
```

- [ ] **Step 4: Chấm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && B=bench/2026-10-24-nguon-micro D=$B/data && for t in nt-chuan nt-nhe; do for s in doc-vi-1m s4-1m s4-3m s7-on s6-on thu-tay-u; do echo "== $s $t"; uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" python $B/score_mix.py --scene $D/scenes/$s --results $D/results/$s/$t | grep -E "CHOT2-mic|CHOT2-khong-m250|^\| *(Phương án|---)"; done; done; echo "== s1-loa nt-tron"; uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" python $B/score_mix.py --scene $D/scenes/s1-loa --results $D/results/s1-loa/nt-tron | grep -E "MOI-rnn-m600|^\| *(Phương án|---)"
```
Đọc cột theo cách `results/gioi-han-muc.md` đã đọc (lỗi, giữ, câu ngắn giữ, câu ảo). Phương án của app: `CHOT2-mic` (lọc ồn bật), `CHOT2-khong-m250` (lọc ồn tắt, chỉ theo dõi), `MOI-rnn-m600` (chế độ trộn, lọc ồn bật).

So với mốc (spec mục 16):

| Tiêu chí | Cảnh | Mốc gói Chuẩn | Mốc gói Nhẹ | Đạt khi |
|---|---|---|---|---|
| A4-mic giọng thật 1 m | `doc-vi-1m` | lỗi 44,7% | 52,0% | lỗi ≤ mốc × 1,10 |
| A4-mic điện thoại 1 m | `s4-1m` | lỗi 30,0%, giữ 84% | 39,3%, 76% | lỗi ≤ mốc × 1,10; giữ ≥ mốc ÷ 1,10 |
| A4-mic điện thoại 3 m | `s4-3m` | lỗi 54,9%, giữ 44% | 62,4%, 40% | như trên |
| A4-mic phòng ồn | `s7-on` | giữ câu ngắn 39,5%, lỗi 69,9% | 42,1%, 73,5% | như trên |
| A-ảo | `s6-on` | — | — | câu ảo ÷ độ dài cảnh (phút) × 10 ≤ 1 |
| A-trộn | `s1-loa` | online 9,8% × 1,10 = 10,78%; phòng 5,2% × 1,10 = 5,72% | — | lỗi ≤ mức |
| (theo dõi) tiếng ù | `thu-tay-u` | đúng nguyên câu dài | — | không bắt buộc |

Độ dài cảnh `s6-on`: `uv run --no-project --python 3.12 python -c "import wave,sys;w=wave.open(sys.argv[1]);print(w.getnframes()/w.getframerate()/60)" $D/scenes/s6-on/mic.wav`.

- [ ] **Step 5: Viết biên bản**

Tạo `bench/2026-10-24-nguon-micro/results/nghiem-thu.md`:

```markdown
# Nghiệm thu nguồn micro (spec 2026-10-24-nguon-micro §11, §16)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-04-phat-hanh.md`. Commit ứng viên: `<mã>`.

## Offline (Task 7): A4-mic, A-trộn, A-ảo

Điều kiện: MacBook Pro M4 Pro, macOS <bản>; `latency-bench mix-eval` trên bản thu của spike; phương án `CHOT2-mic`,
`MOI-rnn-m600` (`variants/chot-moi.json`, `both-chot-moi.json`); mô hình `ggml-large-v3-turbo-q5_0` (Chuẩn), `ggml-small-q5_1` (Nhẹ).

| Tiêu chí | Cảnh | Mốc | Đo được | Kết quả |
|---|---|---|---|---|
| … một dòng cho mỗi dòng của bảng mốc, cả hai gói … |

Theo dõi (không phải mức đạt): lọc ồn tắt `CHOT2-khong-m250` …; cảnh tiếng ù …

## Giấy phép (Task 6)

`cargo deny check`: …; THIRD_PARTY_NOTICES có `nnnoiseless <bản>` (BSD-3-Clause): …

## A2 (Task 8)

## A7 (Task 9)

## A1-mic và Windows (Task 10)
```

Điền số thật. Tiêu chí nào không đạt: **dừng**, ghi lại, báo chủ dự án kèm số (không chỉnh tham số trong kế hoạch này).

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add bench/2026-10-24-nguon-micro/results/nghiem-thu.md && git commit -m "docs(bench): nghiệm thu offline nguồn micro (A4-mic, A-trộn, A-ảo)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A2 — độ trễ hai chế độ, cùng nội dung (app thật, phát tiếng qua loa)

**Files:** Modify `bench/2026-10-24-nguon-micro/results/nghiem-thu.md`

**Hỏi chủ dự án trước** (phát tiếng ra loa khoảng 4 phút, mở micro, điều khiển chuột). Cách làm giống Task 10 của kế hoạch 03 (`results/thu-tay-tron-mac.md`); dùng lại `OnlinePlayer.app` và script `chay-canh.sh` trong scratchpad nếu còn, không thì dựng lại như biên bản đó mô tả.

- [ ] **Step 1: Sao lưu cài đặt, chạy bản dev**

Sao lưu `~/Library/Application Support/com.aitranslator.desktop/settings.json` vào scratchpad. Tắt bản đã cài (nếu đang chạy, ghi nhớ để mở lại). `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && scripts/run-dev-app.sh` (chạy nền).

- [ ] **Step 2: Hai phiên, chỉ track online**

Cùng một track: `online.wav` của cảnh `s1-luot` (100 giây đầu), phát bằng `OnlinePlayer.app`, âm lượng loa 60%, dịch sang tiếng Việt, nguồn "Chỉ OnlinePlayer".
1. Chế độ **Âm thanh máy**: Bắt đầu, phát track, chờ track hết + 5 giây, Dừng.
2. Chế độ **Âm thanh máy + Micro**: như trên.

Không phát `room.wav` (để hai phiên cùng nội dung).

- [ ] **Step 3: Đọc số**

Từ log của app (`~/Library/Logs/com.aitranslator.desktop/app.log`), dòng "kết thúc phiên dịch" của từng phiên: cắt đoạn p50, nhận dạng p50, dịch p50, tổng p50, p90. Tính `X = tổng p50 − cắt đoạn p50` cho mỗi chế độ.

Đạt khi `X(trộn) − X(âm thanh máy) ≤ 100 ms` (Quyết định 2). Ghi bảng như `thu-tay-tron-mac.md` mục A2 vào `nghiem-thu.md` mục A2, kèm điều kiện (máy, âm lượng, track, commit).

- [ ] **Step 4: Trả lại máy**

Tắt bản dev cùng tiến trình phụ và Vite (chỉ những tiến trình do mình mở), khôi phục `settings.json`, âm lượng về mức trước khi thử, mở lại bản đã cài nếu trước đó đang chạy. Quyền micro của bản dev: không cần reset.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add bench/2026-10-24-nguon-micro/results/nghiem-thu.md && git commit -m "docs(bench): A2 hai chế độ cùng nội dung (nguồn micro)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: A7 — proxy ở chế độ Âm thanh máy + Micro

**Files:** Create `bench/phase1/results/acceptance/a7-mac-micro.md`, `bench/phase1/results/acceptance/a7-mac-micro.json`; Modify `bench/2026-10-24-nguon-micro/results/nghiem-thu.md`, `website/src/content/{vi,en,ja,zh,ko}/data-security.mjs`

**Hỏi chủ dự án trước** (mở micro, phát tiếng; và chủ dự án tự chạy hai lệnh `sudo` thêm/gỡ chứng chỉ gốc mitmproxy). Làm theo `bench/phase1/acceptance/RUNBOOK-mac.md` mục A7, với các khác biệt dưới.

- [ ] **Step 1: Bản đo**

Bản release ký ad-hoc dựng từ commit ứng viên: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh` (xem `a7-mac-reports.md` mục "Bản đo"). Ghi CDHash. Nếu không dựng được bản release trên máy dev thì dùng bản dev (`scripts/run-dev-app.sh`) và ghi rõ trong biên bản; tên tiến trình trong `--mode local:` vẫn là `meeting-translator,asr-worker,llama-server`.

- [ ] **Step 2: Proxy và phiên**

- Chủ dự án chạy: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem`.
- `mitmdump --mode local:meeting-translator,asr-worker,llama-server --set hardump="$HOME/a7.har"` (nền); `nettop` song song như runbook.
- Cài đặt: Thu từ = **Âm thanh máy + Micro**, lọc ồn bật. Bắt đầu; phát `public/listen-test-en.wav` lặp lại qua loa (vào cả tap lẫn micro) khoảng 10 phút; trong lúc đó tắt/bật lọc ồn không được (đổi có tác dụng phiên sau), chỉ để chạy. Dừng; bấm **Kiểm tra ngay** ở Cài đặt › Bản quyền và chờ dòng `POST …/validate` mới trong log `mitmdump` trước khi thoát app (runbook dòng 187).

- [ ] **Step 3: Chấm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && python3 bench/phase1/acceptance/netaudit.py "$HOME/a7.har" --allow bench/phase1/results/acceptance/a7-allow.json --app-log "$HOME/Library/Logs/com.aitranslator.desktop/app.log" --start "<giờ Bắt đầu>" --stop "<giờ Dừng>" --out bench/phase1/results/acceptance/a7-mac-micro.json
```
Expected: `A7: ĐẠT`, không dòng `VI PHẠM`. Kiểm thêm: `grep -c "MacBook Pro Microphone" "$HOME/Library/Logs/com.aitranslator.desktop/app.log"` (tên micro thật của máy, đọc ở Cài đặt › Âm thanh) ra `0` trong phần log của phiên. Xóa `$HOME/a7.har` sau khi chấm.

- [ ] **Step 4: Gỡ chứng chỉ (chủ dự án) và biên bản**

Chủ dự án chạy `sudo security delete-certificate -c mitmproxy -t /Library/Keychains/System.keychain`; kiểm `security find-certificate -c mitmproxy /Library/Keychains/System.keychain` báo không tìm thấy.

Viết `a7-mac-micro.md` theo khuôn `a7-mac-reports.md` (Kết quả, Bản đo, Cài đặt khi đo, Proxy, Phiên dịch, bảng kiểm tra, Giới hạn). Thêm dòng tóm tắt vào `nghiem-thu.md` mục A7.

- [ ] **Step 5: Trang Dữ liệu và bảo mật**

Thêm một `<li>` vào cuối danh sách của mục `#da-kiem` (en, ja, zh, ko: `#verified`), ngay sau `<li>` "Báo cáo lỗi tự động". vi (điền số thật của lượt đo):

```
<li><strong>Chế độ Âm thanh máy + Micro</strong> (đo ngày <DD/MM/YYYY>, bản <release ký ad-hoc | dev> <phiên bản>, cùng máy): trong một phiên <M> phút có micro mở và câu mẫu phát qua loa, có <N> request ra ngoài, đều tới máy chủ của chúng tôi (<liệt kê việc>); không request nào mang âm thanh, và log của app không có tên micro.</li>
```

en/ja/zh/ko dịch tương đương (theo cách viết của `<li>` "Automatic error reports" trong cùng tệp). Callout "Giới hạn của phép đo": thêm "chế độ có micro chỉ đo một lượt" vào câu liệt kê (vi: `…phần báo cáo lỗi tự động chỉ đo một lượt (một phiên 12 phút, một báo cáo), chế độ có micro chỉ đo một lượt, còn chat hỗ trợ…`; en: `…was measured once (one 12-minute session, one report), the microphone mode was measured once, and the support chat…`; ja/zh/ko tương đương).

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && pnpm test 2>&1 | grep -E "^not ok|# (pass|fail)"` → `# fail 0`.

- [ ] **Step 6: Trả lại máy và commit**

Trả máy như Task 8 Step 4. Rồi:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add bench/phase1/results/acceptance/a7-mac-micro.md bench/phase1/results/acceptance/a7-mac-micro.json bench/2026-10-24-nguon-micro/results/nghiem-thu.md website/src/content && git commit -m "docs(bench): A7 chế độ Âm thanh máy + Micro; trang Dữ liệu và bảo mật ghi lượt đo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Cổng của chủ dự án — Windows và A1-mic

**Files:** Modify `bench/2026-10-24-nguon-micro/results/nghiem-thu.md`

- [ ] **Step 1: Windows (Task 16 của kế hoạch 02)**

Chủ dự án chọn cách lấy binary Windows: (a) tự build trên máy Windows từ nhánh `nguon-micro`; (b) `cargo-xwin` trên Mac (cần chủ dự án đồng ý điều khoản Microsoft cho SDK); (c) cho push nhánh rồi chạy `ci.yml` bằng `workflow_dispatch` (CI chỉ tự chạy khi push `main` hay mở PR): cách này chỉ chứng minh build và test xanh trên Windows, **không** ra file cài để thử tay, vì `ci.yml` không tải binary lên (không có `upload-artifact`). Rồi chủ dự án thử trên Windows thật các bước của Task 16 kế hoạch 02 và các ca chế độ trộn (Task 10 kế hoạch 03: tiếng vọng, người trong phòng, thiếu quyền micro qua `ms-settings:privacy-microphone`). Ghi kết quả chủ dự án báo vào `nghiem-thu.md`.

**Không phát hành khi mục này chưa đạt** (spec mục 13: Windows là cổng), trừ khi chủ dự án chấp nhận phát hành với Windows chưa thử và ghi rõ điều đó.

- [ ] **Step 2: A1-mic**

Gửi chủ dự án bảng dưới; chủ dự án thử và báo đạt/không đạt từng ô (không có micro USB thì ghi "không có thiết bị").

| Chế độ | Thiết bị / app | Nghe qua | macOS | Windows |
|---|---|---|---|---|
| Micro | micro máy | — | | |
| Micro | micro AirPods (tai nghe chuyển chế độ gọi) | — | | |
| Micro | micro USB | — | | |
| Âm thanh máy + Micro | Zoom (app) | loa | | |
| Âm thanh máy + Micro | Zoom (app) | tai nghe | | |
| Âm thanh máy + Micro | Google Meet (Chrome) | loa | | |
| Âm thanh máy + Micro | Google Meet (Chrome) | tai nghe | | |
| Âm thanh máy + Micro | Microsoft Teams (app) | loa | | |
| Âm thanh máy + Micro | Microsoft Teams (app) | tai nghe | | |

Đạt một ô khi: phụ đề có câu của người online và câu của người trong phòng; câu online không bị dịch hai lần; app họp vẫn nghe được micro (app không giữ micro độc quyền); không có ghi chú lỗi micro.

- [ ] **Step 3: Ghi kết quả và commit**

Chép bảng chủ dự án báo vào `nghiem-thu.md` mục "A1-mic và Windows", kèm ngày và lời chủ dự án.
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add bench/2026-10-24-nguon-micro/results/nghiem-thu.md && git commit -m "docs(bench): A1-mic và Windows theo kết quả chủ dự án thử" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Kiểm cuối toàn nhánh

**Files:** không sửa (trừ khi có lỗi).

- [ ] **Step 1: Mọi bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test --workspace 2>&1 | grep -E "^test result|FAILED|panicked" | tail -20; pnpm exec vitest run 2>&1 | tail -4; (cd website && pnpm test 2>&1 | grep -E "# (pass|fail)"); node scripts/ui-preview/check-i18n.mjs 2>&1 | tail -3
```
Expected: Rust mọi `test result: ok` (≥ 1439 test), JS pass (≥ 373), website `# fail 0`, check-i18n đạt năm ngôn ngữ. `check-i18n` cần Vite cổng 1430 như kế hoạch 03 Task 8 (bật rồi tắt đúng tiến trình mình mở).

- [ ] **Step 2: Clippy hai nền tảng và build**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -2 && cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings 2>&1 | tail -2 && pnpm build 2>&1 | tail -2
```
Expected: không cảnh báo, build xong (như Task 9 kế hoạch 03).

- [ ] **Step 3: Rà mã nhánh**

Gọi skill `superpowers:requesting-code-review` cho `git diff main...nguon-micro` (hay `/code-review` mức `high`). Sửa lỗi Critical/Important trước khi sang Task 12; mỗi sửa một commit, chạy lại Step 1.

- [ ] **Step 4: Cập nhật memory**

Sửa `~/.claude/projects/-Users-dtphong-Desktop-software-business-ai-translator/memory/nguon-micro-2026-10-24.md` và dòng của nó trong `MEMORY.md`: kế hoạch 04 tới Task 11 xong, kết quả nghiệm thu, còn chờ gì.

---

### Task 12: Phát hành 0.2.8 (chỉ khi chủ dự án cho phép)

**Files:** Modify `docs/legal/{privacy,eula}.{vi,en}.md` (dòng phiên bản), `docs/legal/README.md`, `website/test/site.test.mjs`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`, `Cargo.lock`

**Hỏi chủ dự án trước** (bằng AskUserQuestion), một câu cho mỗi việc không hoàn tác được: (1) gộp `nguon-micro` vào `main` và push; (2) đẩy tag `v0.2.8` (tự đăng R2 stable, mọi app tự cập nhật); (3) deploy website. Thiếu câu trả lời "có" cho việc nào thì dừng trước việc đó.

- [ ] **Step 1: Đồng bộ với main**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git fetch origin && git log --oneline HEAD..origin/main | head`
Expected: trống. Nếu `main` có commit mới: `git rebase origin/main`, giải xung đột, chạy lại Task 11 Step 1.

- [ ] **Step 2: Ngày hiệu lực EULA 1.5 và chính sách 1.8 (trước khi nâng bản)**

Ngày phát hành, giờ Việt Nam:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && VI=$(TZ=Asia/Ho_Chi_Minh date +%d/%m/%Y) && EN=$(TZ=Asia/Ho_Chi_Minh LC_ALL=C date +"%-d %B %Y") && ISO=$(TZ=Asia/Ho_Chi_Minh date +%F) && echo "$VI | $EN | $ISO" \
 && sed -i '' "s|^\*\*Phiên bản 1\.7, hiệu lực từ 23/10/2026\.\*\*$|**Phiên bản 1.8, hiệu lực từ $VI.**|" docs/legal/privacy.vi.md \
 && sed -i '' "s|^\*\*Version 1\.7, effective 23 October 2026\.|**Version 1.8, effective $EN.|" docs/legal/privacy.en.md \
 && sed -i '' "s|^\*\*Phiên bản 1\.4, hiệu lực từ 23/10/2026\.\*\*$|**Phiên bản 1.5, hiệu lực từ $VI.**|" docs/legal/eula.vi.md \
 && sed -i '' "s|^\*\*Version 1\.4, effective 23 October 2026\.|**Version 1.5, effective $EN.|" docs/legal/eula.en.md \
 && head -3 docs/legal/*.md | grep -E "Phiên bản|Version"
```
Expected: bốn dòng in phiên bản 1.8/1.5 và ngày hôm nay.

`docs/legal/README.md`: dòng 3 đổi `**EULA phiên bản 1.4 và chính sách quyền riêng tư phiên bản 1.7 (cùng hiệu lực từ 2026-10-23)**` thành `**EULA phiên bản 1.5 và chính sách quyền riêng tư phiên bản 1.8 (cùng hiệu lực từ <ISO>)**`; dòng "Mặc định đã chọn" đổi phần `ngày hiệu lực: EULA 2026-10-23 (bản 1.4), chính sách quyền riêng tư 2026-10…` thành ngày `<ISO>` cho bản 1.5 và 1.8 (đọc nguyên văn dòng đó trước khi sửa).

- [ ] **Step 3: Test website theo phiên bản mới**

Tệp `website/test/site.test.mjs`:
- dòng `const viNeeds = ["Phiên bản 1.4", …` → `"Phiên bản 1.5"`; `const enNeeds = ["Version 1.4", …` → `"Version 1.5"` (test điều khoản);
- `const viNeeds = ["Phiên bản 1.7", …` → `"Phiên bản 1.8"`; `const enNeeds = ["Version 1.7", …` → `"Version 1.8"` (test chính sách);
- khối "EULA lên 1.4 và chính sách lên 1.7":

```old
  // EULA lên 1.4 và chính sách lên 1.7 (tên miền aitranslator.vn, spec 2026-10-23-ten-mien-aitranslator-vn §2.7), cùng một ngày
  // hiệu lực, không sớm hơn ngày của chính sách 1.6 (2026-10-23). Đặt ngày ở mục "Chuyển sang aitranslator.vn" của
  // docs/release/phat-hanh.md, vào ngày deploy website và phát hành 0.2.7, trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  const eulaHead = docHeader(docs["eula.vi.md"]);
  if (eulaHead?.version !== "1.4" || privacyHead?.version !== "1.7") errors.push("EULA 1.4 và chính sách 1.7");
  if (!privacyHead || privacyHead.iso < "2026-10-23" || eulaHead?.iso !== privacyHead.iso) {
    errors.push(`EULA 1.4 và chính sách 1.7 phải cùng ngày hiệu lực, từ 2026-10-23 trở đi, đang ghi ${eulaHead?.iso} và ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```
```new
  // EULA lên 1.5 và chính sách lên 1.8 (nguồn micro, spec 2026-10-24-nguon-micro §8), cùng một ngày hiệu lực, không sớm hơn
  // ngày nhánh nguồn micro sẵn sàng (2026-10-24). Đặt ngày ở kế hoạch 2026-10-24-nguon-micro-04, Task 12, vào ngày phát hành
  // 0.2.8, trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  const eulaHead = docHeader(docs["eula.vi.md"]);
  if (eulaHead?.version !== "1.5" || privacyHead?.version !== "1.8") errors.push("EULA 1.5 và chính sách 1.8");
  if (!privacyHead || privacyHead.iso < "2026-10-24" || eulaHead?.iso !== privacyHead.iso) {
    errors.push(`EULA 1.5 và chính sách 1.8 phải cùng ngày hiệu lực, từ 2026-10-24 trở đi, đang ghi ${eulaHead?.iso} và ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```

Đổi tên các test còn ghi "1.6"/"1.7" trong tiêu đề nếu tiêu đề nói phiên bản hiện hành (`grep -n 'test("[^"]*1\.[4-7]' website/test/site.test.mjs`); chỉ đổi chữ trong tiêu đề, không đổi điều kiểm.

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro/website && pnpm test 2>&1 | grep -E "^not ok|# (pass|fail)"` → `# fail 0`. Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git grep -n "23/10/2026\|23 October 2026" -- docs/legal` → chỉ còn ở các dòng lịch sử của README (nếu có), không ở bốn file văn bản.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add docs/legal website/test/site.test.mjs && git commit -m "docs(legal): EULA 1.5 và chính sách 1.8 hiệu lực từ ngày phát hành 0.2.8" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Nâng phiên bản 0.2.7 → 0.2.8**

Sửa đúng 4 file: `package.json` (`"version": "0.2.8"`), `src-tauri/Cargo.toml` (`version = "0.2.8"` của package `meeting-translator`), `src-tauri/tauri.conf.json` (`"version": "0.2.8"`), `Cargo.lock` (khối `name = "meeting-translator"`, `version = "0.2.8"`).

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo metadata --locked --format-version 1 >/dev/null && git diff --stat && grep -rn '"0.2.8"\|version = "0.2.8"' package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json Cargo.lock | wc -l`
Expected: lệnh đầu thoát 0; 4 file đổi, mỗi file 1 dòng; đếm ra 4.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git branch --show-current && git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json Cargo.lock && git commit -m "chore(release): nâng phiên bản 0.2.7 → 0.2.8" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Gộp vào main và push (khi đã được phép, câu 1)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short | head -3 && git merge --ff-only nguon-micro && git log --oneline -1 && git push origin main
```
Expected: thư mục chính đang ở `main`, sạch; fast-forward; push xong. Không fast-forward được thì dừng (quay lại Step 1).

- [ ] **Step 6: Chờ CI của commit nâng bản**

`gh run list --branch main --limit 3` lấy run `CI` của commit vừa push; chờ bằng Monitor (until-loop `gh run view <id> --json status,conclusion`, mỗi 60 giây) và kiểm từng job (`gh run view <id> --json jobs`), không tin trạng thái chung của run. Push mới hủy CI đang chạy (`cancel-in-progress`), nên không push gì thêm trong lúc chờ. Đỏ: đọc log, sửa trên `nguon-micro`, quay lại Step 5.

- [ ] **Step 7: Đẩy tag (khi đã được phép, câu 2)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && SHA=$(git rev-parse HEAD) && git log --oneline -1 && git tag v0.2.8 "$SHA" && git push origin v0.2.8
```
Chờ workflow `Release` (khoảng 50 phút, 12 job) như Step 6. `dig @8.8.8.8 releases.aitranslator.vn +short` có IP trước khi chạy lại job đăng nếu job đó đỏ vì DNS (memory sự cố DNSSEC).

- [ ] **Step 8: Kiểm R2**

```bash
curl -s https://releases.aitranslator.vn/stable/latest.json | head -c 300; echo; curl -s https://releases.aitranslator.io.vn/stable/latest.json | head -c 120; echo
```
Expected: cả hai báo `"version":"0.2.8"`. Tải `.dmg` và `.exe` từ `https://releases.aitranslator.vn/0.2.8/`, đổi `%20` thành dấu cách trong tên, `shasum -a 256 -c` với `SHA256SUMS-macos.txt`, `SHA256SUMS-windows.txt` → `OK`. Kiểm `.dmg` có THIRD_PARTY_NOTICES chứa `nnnoiseless` (mount, `grep -c nnnoiseless "…/AI Translator.app/Contents/Resources/THIRD_PARTY_NOTICES.txt"` hay đường dẫn notices thật trong bundle).

- [ ] **Step 9: Website (khi đã được phép, câu 3)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && git branch --show-current && node src/build/build.mjs --deploy 2>&1 | grep -i "version\|0.2.8" | head -3 && pnpm test 2>&1 | grep -E "# (pass|fail)" && pnpm deploy
```
Expected: build lấy 0.2.8 từ R2; test xanh; deploy xong. Kiểm: `curl -s https://aitranslator.vn/tinh-nang/ | grep -c 'id="micro"'` ≥ 1; `curl -s https://aitranslator.vn/chinh-sach-quyen-rieng-tu/ | grep -c "Phiên bản 1.8"` ≥ 1.

- [ ] **Step 10: GitHub Release**

Bản nháp do job `github-release` tạo: viết ghi chú (vi + en ngắn: nguồn micro ba chế độ, quyền micro, chính sách 1.8 và EULA 1.5) rồi publish (`gh release edit v0.2.8 --draft=false --latest --notes-file <file>`), như các bản trước.

- [ ] **Step 11: Dọn và memory**

- Worktree `nguon-micro`: hỏi chủ dự án có xóa không (`git worktree remove`), không tự xóa.
- Tắt mọi tiến trình nền mình đã mở (Monitor, Vite, app dev).
- Memory: sửa `nguon-micro-2026-10-24.md` (ĐÃ PHÁT HÀNH 0.2.8, tag → commit, R2 + SHA, website, chính sách 1.8 / EULA 1.5 hiệu lực ngày nào; còn gì), tạo `release-0-2-8-<ngày>.md` theo mẫu các bản trước và thêm dòng vào `MEMORY.md`; bản kế 0.2.9.
