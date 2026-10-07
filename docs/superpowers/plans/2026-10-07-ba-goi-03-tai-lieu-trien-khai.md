# Ba gói và mỗi key một máy · 03: Tài liệu, triển khai production, thử tay

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Sửa spec gốc, EULA, chính sách quyền riêng tư và hai runbook cho khớp spec 2026-10-07 (ba gói, Free dùng thử 10 ngày theo máy, mỗi key một máy). Sau đó, khi chủ dự án cho phép, chạy migration D1 `0002` và deploy hai Worker production, kiểm sau deploy, rồi thử tay trên Mac.

**Kiến trúc:** Phần A, B chỉ sửa văn bản (Markdown), mỗi task thay đúng các đoạn cũ bằng đoạn mới chép nguyên văn từ kế hoạch này. Phần C chạy lệnh `wrangler` và `curl` trên production. Auto mode chặn agent đọc D1 production và deploy production, nên **mọi lệnh của phần C do chủ dự án chạy** (gõ `! <lệnh>` trong Claude Code, hoặc chạy trong Terminal riêng), agent đọc kết quả và ghi biên bản.

**Công nghệ:** Markdown; Vitest (test `src/lib/legal.test.ts` đọc bốn file pháp lý); wrangler (bản trong `server/node_modules`, gọi bằng `pnpm exec wrangler`); `curl`, `node`, `shasum`, `security` (macOS).

**Spec:** `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md` mục 5.2, 7, 8, 9. Kế hoạch tổng quan: `docs/superpowers/plans/2026-10-07-ba-goi-00-tong-quan.md`.

## Thứ tự và phụ thuộc

- **Phần A (Task 1–8) và phần B (Task 9–12)** chạy được ngay, song song với kế hoạch 02. Không phụ thuộc code.
- **Phần C (Task 13–19)** chỉ chạy khi kế hoạch 01 và 02 đã thực thi xong trên `main`, `cd server && pnpm check` xanh, và bộ kiểm app đầy đủ (kế hoạch 00, "Quy ước chung") xanh.
- Task 14 là **điểm dừng bắt buộc**: không chạy migration hay deploy nếu chủ dự án chưa trả lời đồng ý.

## Điều chỉnh so với spec 2026-10-07 (đã đối chiếu tài liệu)

1. **Chính sách quyền riêng tư cũng phải sửa** (spec mục 7 chỉ nêu EULA). `docs/legal/privacy.{vi,en}.md` đang ghi "Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi không lưu gì về bạn trên máy chủ" và "giới hạn 2 máy". Với bảng `trials`, câu đầu thành sai. Task 11 sửa.
2. **Thêm A7 (§3.3) và §5 của spec gốc** vào danh sách sửa: cả hai liệt kê lúc app gọi license server, nay thêm đăng ký dùng thử và lần kiểm nhanh lúc bắt đầu phiên.
3. **`docs/release/phat-hanh.md` bước 3** có câu `INSERT INTO orders … 'pro' …` (giữ chỗ dải số đơn). Sau migration `0002`, CHECK chỉ nhận `monthly`, `yearly`, nên chạy lại bước đó sẽ lỗi. Task 12 đổi thành `'monthly'`.
4. **`bench/phase1/acceptance/RUNBOOK-mac.md`** ghi "nhập key để có Professional". Task 12 sửa.
5. **Phiên bản văn bản pháp lý** lên 1.1, hiệu lực 07/10/2026. Nếu deploy production (Task 15) rơi vào ngày khác, Task 17 Step 1 sửa ngày hiệu lực theo ngày deploy. App chưa có bước hỏi lại khi điều khoản đổi phiên bản (`docs/legal/README.md`, mục "Chưa làm"), nên người đã đồng ý bản 1.0 không được hỏi lại.
6. **§15 của spec gốc** thêm một điểm hỏi luật sư: lưu `device_id_hash` của máy chỉ dùng Free (không có email), dựa trên việc đồng ý điều khoản ở bước 1b.

## Cấu trúc file

| File | Việc |
|---|---|
| `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | Task 1–8: dòng trạng thái, §2, §3, §4, §5, §6.8, §9, §10, §11, §12, §13, §15 |
| `docs/legal/eula.vi.md`, `docs/legal/eula.en.md` | Task 9, 10: mục 2, 3, 4, phiên bản |
| `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md` | Task 11: mục 2, 3, 4, 5, 7, phiên bản |
| `docs/legal/README.md`, `docs/release/phat-hanh.md`, `bench/phase1/acceptance/RUNBOOK-mac.md` | Task 12 |
| `bench/phase1/results/ba_goi_production_deploy.md` (mới) | Task 13–18: biên bản triển khai và thử tay |
| Bộ nhớ dự án (`~/.claude/projects/-Users-dtphong-Desktop-software-business-ai-translator/memory/`) | Task 19 |

**Cách sửa văn bản ở phần A, B:** dùng công cụ Edit, `old_string` là khối **Tìm** (chép nguyên văn, kể cả dấu cách đầu dòng), `new_string` là khối **Thay bằng**. Mỗi khối Tìm đã được kiểm là xuất hiện đúng một lần trong file ở commit `d0f9b30`. Edit báo không tìm thấy thì dừng, đọc lại đoạn đó bằng `grep -n`, không đoán.

Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`. Biến dùng trong các lệnh dưới: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Mọi lệnh phần A, B chạy ở gốc repo `/Users/dtphong/Desktop/software_business/ai-translator`.

---

# Phần A: spec gốc

## Task 1: Dòng trạng thái, §2 (P1, P2, bảng gói), F8, A7

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 8, 59–75, 90, 117)

- [ ] **Step 1: Thêm dòng trạng thái**

Tìm:
```text
- Sửa ngày 2026-10-04: chỉ còn một môi trường production (§6.13, spec `2026-10-04-single-production-environment-design.md`); các chỗ nói staging hay dev của server đã được sửa theo.
```
Thay bằng:
```text
- Sửa ngày 2026-10-04: chỉ còn một môi trường production (§6.13, spec `2026-10-04-single-production-environment-design.md`); các chỗ nói staging hay dev của server đã được sửa theo.
- Sửa ngày 2026-10-07: ba gói (Free dùng thử 10 ngày, Monthly, Yearly) và mỗi key một máy (spec `2026-10-07-three-plans-single-device-design.md`); các chỗ nói bốn gói, Free 10 phút và 2 máy mỗi key đã được sửa theo.
```

- [ ] **Step 2: P1**

Tìm:
```text
| P1 | Kiếm tiền | **Không có quảng cáo.** Bốn gói, xem bảng dưới. Ba gói trả phí có chung các tính năng Pro (từ điển thuật ngữ, lưu lịch sử, xuất bản chép lời), chỉ khác hạn mức dịch. Gói trả phí bán theo **đơn 30 ngày, trả trước** bằng VND, không tự gia hạn, vì PayOS không có thanh toán định kỳ. Không có gói 12 tháng hay gói trọn đời. Hạn mức tính riêng cho từng máy (§6.8). "Chỉ bán đơn 30 ngày" và "tính năng Pro dùng chung cho mọi gói trả phí" là controller tự quyết; chủ dự án có thể đổi. |
```
Thay bằng:
```text
| P1 | Kiếm tiền | **Không có quảng cáo.** Ba gói, xem bảng dưới: Free (dùng thử), Monthly, Yearly. Hai gói trả phí có chung các tính năng Pro (từ điển thuật ngữ, lưu lịch sử, xuất bản chép lời), khác hạn mức và thời hạn. Gói trả phí bán theo **đơn trả trước** bằng VND (Monthly 30 ngày, Yearly 365 ngày), không tự gia hạn, vì PayOS không có thanh toán định kỳ. Không có gói trọn đời. Free là dùng thử 10 ngày, mỗi máy một lần (§6.8). Hạn mức tính riêng cho từng máy (§6.8). |
```

- [ ] **Step 3: P2**

Tìm:
```text
Mỗi key kích hoạt tối đa 2 máy, và mỗi máy có đủ hạn mức của gói. Dùng được offline
```
Thay bằng:
```text
Mỗi key chỉ dùng trên 1 máy. Máy thứ hai kích hoạt cùng key (sau khi người dùng xác nhận) thì key bị tạm khóa trên cả hai máy cho tới khi một máy gỡ key (§6.8, "Mỗi key một máy"). Dùng được offline
```

- [ ] **Step 4: Câu chốt P1, P2 và bảng gói**

Tìm:
```text
P1 và P2 là đề xuất lúc duyệt spec; chủ dự án chốt ngày 2026-10-01. Giữ mã P1, P2 để tham chiếu trong các kế hoạch không đổi.

**Các gói (P1):**

| Mã gói | Tên hiển thị | Hạn mức dịch, mỗi máy | Giá |
|---|---|---|---|
| `free` | Free | 10 phút mỗi ngày | 0 |
| `pro` | Professional | 30 giờ mỗi chu kỳ 30 ngày | 50.000 đ / 30 ngày |
| `pro_x2` | Professional X2 | 100 giờ mỗi chu kỳ 30 ngày | 150.000 đ / 30 ngày |
| `pro_x5` | Professional X5 | không giới hạn | 500.000 đ / 30 ngày |

- Server đọc giá và hạn mức của gói trả phí từ cấu hình (§6.8); app không ghi cứng giá. Hạn mức Free là một hằng số phía app.
- **"Pro"** trong spec là tên chung của các tính năng chỉ có ở gói trả phí, và của trạng thái "đang có gói trả phí còn hạn". Đây không phải tên một gói. Mã gói `pro` là gói Professional.
- Cách đếm phút, chu kỳ 30 ngày và khi hết hạn mức: §6.8, mục "Hạn mức".
```
Thay bằng:
```text
P1 và P2 là đề xuất lúc duyệt spec; chủ dự án chốt ngày 2026-10-01, rồi đổi ngày 2026-10-07 (ba gói, mỗi key một máy; spec `2026-10-07-three-plans-single-device-design.md`). Giữ mã P1, P2 để tham chiếu trong các kế hoạch không đổi.

**Các gói (P1):**

| Mã gói | Tên hiển thị | Hạn mức dịch, mỗi máy | Thời hạn | Giá |
|---|---|---|---|---|
| `free` | Free | 30 phút mỗi ngày | 10 ngày dùng thử, mỗi máy một lần | 0 |
| `monthly` | Monthly | 50 giờ (3000 phút) mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |
| `yearly` | Yearly | không giới hạn | 365 ngày mỗi đơn | 500.000 đ |

- Server đọc giá, hạn mức và số ngày mỗi đơn của gói trả phí từ cấu hình (§6.8); app không ghi cứng giá. Hạn mức Free (30 phút mỗi ngày) là một hằng số phía app. Số ngày dùng thử là biến cấu hình `TRIAL_DAYS` của server (§6.8).
- **"Pro"** trong spec là tên chung của các tính năng chỉ có ở gói trả phí, và của trạng thái "đang có gói trả phí còn hạn". Đây không phải tên một gói.
- Cách đếm phút, chu kỳ 30 ngày, dùng thử Free và khi hết hạn mức: §6.8, mục "Hạn mức".
```

- [ ] **Step 5: F8**

Tìm:
```text
| F8 | Phân quyền theo gói (Free và ba gói trả phí, §2) bằng license key, dùng được khi offline. Hạn mức dịch theo gói, đếm riêng trên từng máy (§6.8). |
```
Thay bằng:
```text
| F8 | Phân quyền theo gói (Free dùng thử và hai gói trả phí, §2) bằng license key, dùng được khi offline. Hạn mức dịch theo gói, đếm riêng trên từng máy; mỗi key một máy (§6.8). |
```

- [ ] **Step 6: A7**

Tìm:
```text
trừ các việc chạy theo lịch: kiểm tra bản quyền, hỏi giờ
```
Thay bằng:
```text
trừ các việc chạy theo lịch: kiểm tra bản quyền (kể cả lần kiểm nhanh lúc bắt đầu phiên, §6.8), đăng ký dùng thử Free khi máy chưa có token dùng thử (§6.8), hỏi giờ
```

- [ ] **Step 7: Kiểm**

Run: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; sed -n 1,120p $S | grep -nE "Professional|pro_x|X5|10 phút mỗi ngày|tối đa 2 máy"`
Expected: không in dòng nào.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §2, F8, A7 theo ba gói và mỗi key một máy

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 2: §4.1, §4.2, §4.3, §5

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 156, 168–175, 186, 196, 203–205, 278)

- [ ] **Step 1: §4.1, đăng ký dùng thử sau bước 1b**

Tìm:
```text
   - **Bước 1b: Điều khoản.** Hiện Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư (đóng gói trong app, theo ngôn ngữ vừa chọn); phải tick đồng ý mới bấm được "Tiếp" (spec 2026-10-06 legal-in-app).
```
Thay bằng:
```text
   - **Bước 1b: Điều khoản.** Hiện Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư (đóng gói trong app, theo ngôn ngữ vừa chọn); phải tick đồng ý mới bấm được "Tiếp" (spec 2026-10-06 legal-in-app).
   - Ngay sau khi người dùng đồng ý, app đăng ký dùng thử Free với license server (`POST /v1/trial`, gửi `device_id_hash`), chạy nền. Lỗi mạng không chặn các bước sau; app thử lại theo §6.8 ("Dùng thử Free"). Đăng ký sau bước đồng ý vì request gửi mã băm ID máy (§10.1).
```

- [ ] **Step 2: §4.2, hạn mức trong cuộc họp**

Tìm:
```text
2. **Hạn mức** (§6.8), với các gói có hạn mức (Free, Professional, Professional X2):
```
Thay bằng:
```text
2. **Hạn mức** (§6.8), với các gói có hạn mức (Free, Monthly):
```

Tìm:
```text
   - App không chạy tiếp ở chế độ "chỉ chép lời".
   - Professional X5 không giới hạn.
```
Thay bằng:
```text
   - App không chạy tiếp ở chế độ "chỉ chép lời".
   - Yearly không giới hạn.
   - Free chỉ dùng được trong 10 ngày dùng thử (§6.8, "Dùng thử Free"). Hết dùng thử thì không bắt đầu được phiên ở Free; app báo đã hết dùng thử, kèm nút Nâng cấp. Đang dịch mà qua lúc hết dùng thử thì phiên đang chạy được chạy hết.
   - Key đang xung đột (§6.8, "Mỗi key một máy") thì phiên đang chạy ở gói trả phí dừng với lý do `license_conflict`, và cửa sổ chính báo lý do.
```

- [ ] **Step 3: §4.3, màn hình chính**

Tìm:
```text
  - Hạn mức còn lại: số phút còn lại hôm nay (Free) hoặc trong chu kỳ (Professional, Professional X2), kèm thời điểm reset. Professional X5 ghi "Không giới hạn".
```
Thay bằng:
```text
  - Hạn mức còn lại: số phút còn lại hôm nay (Free) hoặc trong chu kỳ (Monthly), kèm thời điểm reset. Yearly ghi "Không giới hạn".
  - Ở Free: số ngày dùng thử còn lại, dạng "Dùng thử: còn N ngày · Hôm nay còn X phút" (N = số ngày tới `ends_at`, làm tròn lên). Hết dùng thử thì báo đã hết 10 ngày dùng thử, kèm nút Nâng cấp.
  - Key đang xung đột: báo "Key đang dùng trên 2 máy nên đã bị tạm khóa", kèm nút mở nhóm Cài đặt "Bản quyền".
```

- [ ] **Step 4: §4.3, nhóm Cài đặt "Bản quyền"**

Tìm:
```text
  - **Bản quyền:** nhập key; gói đang dùng, trạng thái và ngày hết hạn; hạn mức còn lại của chu kỳ; gia hạn hoặc đổi gói (mở màn hình Nâng cấp); gỡ kích hoạt.
```
Thay bằng:
```text
  - **Bản quyền:** nhập key; gói đang dùng, trạng thái và ngày hết hạn; hạn mức còn lại của chu kỳ; gia hạn hoặc đổi gói (mở màn hình Nâng cấp); gỡ kích hoạt. Kích hoạt mà key đang giữ ở máy khác thì hiện hộp thoại "Gỡ máy kia và dùng máy này" hoặc "Vẫn kích hoạt trên máy này" (§6.8, "Mỗi key một máy"). Key đang xung đột thì liệt kê hai máy (tên máy, lần dùng gần nhất), kèm nút "Gỡ key khỏi máy này", "Gỡ máy kia", "Thử lại".
```

- [ ] **Step 5: §4.3, màn hình Nâng cấp**

Tìm:
```text
  - Hiện đủ 4 gói (§2): tên, hạn mức, giá mỗi 30 ngày; đánh dấu gói đang dùng. Giá lấy từ license server (`GET /v1/plans`, §6.8); không có mạng thì báo cần mạng để mua.
```
Thay bằng:
```text
  - Hiện đủ ba gói (§2): tên, hạn mức, giá và thời hạn mỗi đơn (Monthly 30 ngày, Yearly 365 ngày); Free ghi số ngày dùng thử còn lại; đánh dấu gói đang dùng. Giá và số ngày lấy từ license server (`GET /v1/plans`, §6.8); không có mạng thì báo cần mạng để mua.
```

Tìm:
```text
  - Đang có license còn hạn: chọn cùng gói là gia hạn thêm 30 ngày; chọn gói khác là đổi gói.
```
Thay bằng:
```text
  - Đang có license còn hạn: chọn cùng gói là gia hạn thêm một đơn (30 ngày với Monthly, 365 ngày với Yearly); chọn gói khác là đổi gói.
```

- [ ] **Step 6: §5, thành phần ngoài app**

Tìm:
```text
App chỉ gọi server này khi mua, kích hoạt, kiểm tra bản quyền và hỏi giờ
```
Thay bằng:
```text
App chỉ gọi server này khi mua, kích hoạt, kiểm tra bản quyền, đăng ký dùng thử Free và hỏi giờ
```

- [ ] **Step 7: Kiểm**

Run: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; sed -n 150,290p $S | grep -nE "Professional|X5|4 gói|thêm 30 ngày"`
Expected: không in dòng nào.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §4 và §5 theo ba gói, dùng thử Free, xung đột key

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 3: §6.8, cổng quốc tế, bảng giá, mua thêm và đổi gói

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 587–617)

- [ ] **Step 1: Số ngày mỗi đơn ở đoạn cổng quốc tế**

Tìm:
```text
  - Gói trả trước của PayOS: mỗi đơn là 30 ngày, theo luật ở "Mua thêm và đổi gói".
  - Thuê bao tự gia hạn của cổng quốc tế: mỗi webhook gia hạn cộng thêm một kỳ 30 ngày; khách hủy thì ngừng cộng.
```
Thay bằng:
```text
  - Gói trả trước của PayOS: mỗi đơn là số ngày mỗi đơn của gói (`days_per_order`: Monthly 30, Yearly 365), theo luật ở "Mua thêm và đổi gói".
  - Thuê bao tự gia hạn của cổng quốc tế: mỗi webhook gia hạn cộng thêm một kỳ bằng số ngày mỗi đơn của gói; khách hủy thì ngừng cộng.
```

- [ ] **Step 2: Gói và bảng giá**

Tìm:
```text
- Bốn gói ở §2. Server giữ bảng gói trả phí trong biến cấu hình `PLANS` (một môi trường, production, §6.13): với mỗi mã gói có hạn mức mỗi chu kỳ (`quota_minutes_per_cycle`, `null` là không giới hạn), số ngày mỗi đơn (30), giá theo từng loại tiền. Đổi giá hay hạn mức không cần phát hành lại app.
- Mã gói và tên hiển thị (`Professional`, `Professional X2`, `Professional X5`) là hợp đồng với app, nên nằm trong code server, không nằm trong `PLANS` (kế hoạch 05, QĐ17). `GET /v1/plans` trả cả hai cùng bảng gói.
```
Thay bằng:
```text
- Ba gói ở §2: Free (dùng thử, không bán) và hai gói trả phí. Server giữ bảng gói trả phí trong biến cấu hình `PLANS` (một môi trường, production, §6.13): với mỗi mã gói có hạn mức mỗi chu kỳ (`quota_minutes_per_cycle`, `null` là không giới hạn), số ngày mỗi đơn (`days_per_order`: Monthly 30, Yearly 365), giá theo từng loại tiền. Đổi giá hay hạn mức không cần phát hành lại app.
- Mã gói (`monthly`, `yearly`) và tên hiển thị (`Monthly`, `Yearly`) là hợp đồng với app, nên nằm trong code server, không nằm trong `PLANS` (kế hoạch 05, QĐ17). `GET /v1/plans` trả cả hai cùng bảng gói.
```

Tìm:
```text
- Hạn mức Free (10 phút mỗi ngày) là hằng số phía app, vì Free không có token.
```
Thay bằng:
```text
- Hạn mức Free (30 phút mỗi ngày) là hằng số phía app, vì Free không có token bản quyền. Thời hạn dùng thử Free là biến cấu hình `TRIAL_DAYS` của server (production: 10; "Dùng thử Free" ở mục "Hạn mức").
```

- [ ] **Step 3: License mới và mua thêm cùng gói**

Tìm:
```text
- **License mới:** `plan` là gói của đơn; `expires_at` = hiện tại + 30 ngày; `cycle_anchor` = hiện tại.
- **Mua thêm cùng gói:** `expires_at` cộng 30 ngày, tính từ max(hiện tại, `expires_at`).
```
Thay bằng:
```text
- **License mới:** `plan` là gói của đơn; `expires_at` = hiện tại + số ngày mỗi đơn của gói; `cycle_anchor` = hiện tại.
- **Mua thêm cùng gói:** `expires_at` cộng số ngày mỗi đơn của gói (30 hay 365), tính từ max(hiện tại, `expires_at`).
```

- [ ] **Step 4: Công thức đổi gói và ví dụ**

Tìm:
```text
  - Số ngày còn lại của gói cũ được quy ra tiền theo giá gói cũ, rồi đổi sang ngày của gói mới, làm tròn xuống:
    `ngày_quy_đổi = floor(ngày_còn_lại × giá_cũ / giá_mới)`.
    - `ngày_còn_lại` = (`expires_at` − hiện tại) / 1 ngày, giữ cả phần lẻ.
    - `giá_cũ` và `giá_mới` lấy theo bảng giá hiện hành, cùng loại tiền với đơn.
  - `expires_at` = hiện tại + 30 ngày + `ngày_quy_đổi`.
  - Không hoàn tiền.
  - Ví dụ lên gói: Professional còn 20 ngày, mua X2. Ta có 20 × 50.000 / 150.000 = 6,67, làm tròn xuống 6 ngày. X2 chạy trong 36 ngày.
  - Ví dụ xuống gói: X2 còn 10 ngày, mua Professional. Ta có 10 × 150.000 / 50.000 = 30 ngày. Professional chạy trong 60 ngày.
```
Thay bằng:
```text
  - Số ngày còn lại của gói cũ được quy ra tiền theo giá mỗi ngày của gói cũ, rồi đổi sang ngày theo giá mỗi ngày của gói mới, làm tròn xuống (hai gói có số ngày mỗi đơn khác nhau, nên phải so giá mỗi ngày):
    `ngày_quy_đổi = floor(ngày_còn_lại × (giá_cũ / số_ngày_cũ) / (giá_mới / số_ngày_mới))`.
    - `ngày_còn_lại` = (`expires_at` − hiện tại) / 1 ngày, giữ cả phần lẻ.
    - `giá_cũ`, `giá_mới` lấy theo bảng giá hiện hành, cùng loại tiền với đơn; `số_ngày_cũ`, `số_ngày_mới` là `days_per_order` của hai gói trong bảng hiện hành.
    - Server tính bằng BigInt trên giây để làm tròn xuống chính xác: `floor(giây_còn_lại × giá_cũ × số_ngày_mới / (giá_mới × số_ngày_cũ × 86400))`.
  - `expires_at` = hiện tại + số ngày mỗi đơn của gói mới + `ngày_quy_đổi`.
  - Không hoàn tiền.
  - Ví dụ lên gói: Monthly còn 20 ngày, mua Yearly. Ta có 20 × (50.000 / 30) / (500.000 / 365) = 24,33, làm tròn xuống 24 ngày. Yearly chạy trong 389 ngày.
  - Ví dụ xuống gói: Yearly còn 200 ngày, mua Monthly. Ta có 200 × (500.000 / 365) / (50.000 / 30) = 164,38, làm tròn xuống 164 ngày. Monthly chạy trong 194 ngày.
```

- [ ] **Step 5: Bỏ câu "máy thứ hai"**

Tìm:
```text
- Máy thứ hai của cùng key nhận gói mới ở lần `validate` kế tiếp ("Kiểm tra định kỳ" bên dưới); trước đó máy đó vẫn dùng token cũ.
```
Thay bằng:
```text
- Đơn gia hạn hay đổi gói tạo từ máy đang giữ key thì máy đó gọi `validate` ngay khi đơn được trả (bước 4 của "Mua ngay trong app"). Đơn áp vào license theo cách khác (admin cấp tay) thì máy nhận gói mới ở lần `validate` kế tiếp ("Kiểm tra định kỳ" bên dưới).
```

- [ ] **Step 6: Kiểm**

Run: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; sed -n 575,625p $S | grep -nE "Professional|X2|X5|Bốn gói|10 phút|\+ 30 ngày|cộng 30 ngày"`
Expected: không in dòng nào.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §6.8 bảng giá, số ngày mỗi đơn, công thức đổi gói theo giá mỗi ngày

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 4: §6.8, bảng API và công cụ hỗ trợ

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 627–632, 660, 664)

- [ ] **Step 1: Checkout nhận mã gói mới**

Tìm:
```text
| `POST /v1/checkout` `{plan: "pro" \| "pro_x2" \| "pro_x5", email, consent: true, license_key?}` |
```
Thay bằng:
```text
| `POST /v1/checkout` `{plan: "monthly" \| "yearly", email, consent: true, license_key?}` |
```

- [ ] **Step 2: Thay dòng `activate`, thêm dòng `/v1/trial` ngay trước nó**

Tìm:
```text
| `POST /v1/licenses/activate` `{key, device_id_hash, device_label}` | Kích hoạt, tối đa 2 máy mỗi key. Trả về token bản quyền. Nếu `device_id_hash` đã có activation của key này, kể cả activation đã gỡ (ví dụ khi cài lại app), thì dùng lại đúng activation đó: giữ `activation_id`, `activation_created_at` và `quota_epoch`, không mở cửa sổ `quota_fresh` mới, không tốn thêm suất. Activation mới thật mở cửa sổ `quota_fresh` 15 phút (§6.8, "Hạn mức"). Khi đã đủ 2 máy thì trả `409`, kèm danh sách máy đã kích hoạt: `activation_id`, `device_label` và thời điểm `validate` gần nhất. Key đang bị khóa tạm thì trả `423 license_locked` (§10.2).
```
Thay bằng:
```text
| `POST /v1/trial` `{device_id_hash}` | Đăng ký dùng thử Free của máy ("Dùng thử Free" ở mục "Hạn mức"). `device_id_hash` phải là 64 ký tự hex thường; sai thì `400 invalid_request`. Máy chưa có dòng trong bảng `trials` thì server tạo dòng với `started_at` = giờ server, `ends_at` = `started_at` + `TRIAL_DAYS` ngày; đã có thì giữ nguyên hai mốc, chỉ cập nhật `last_seen_at`. Hai request đồng thời cho cùng máy vẫn ra một dòng. Luôn trả `200` `{token, started_at, ends_at, issued_at}`, kể cả khi dùng thử đã hết, để app báo được. `token` là token dùng thử ("Token dùng thử Free" bên dưới). Giới hạn ≤ 10 lần/giờ/IP (§10.2). Thiếu hay sai `TRIAL_DAYS` thì `503 trial_not_configured`. |
| `POST /v1/licenses/activate` `{key, device_id_hash, device_label, allow_conflict?}` | Kích hoạt. Mỗi key chỉ dùng trên một máy ("Mỗi key một máy" bên dưới). Trả về token bản quyền. Nếu `device_id_hash` đã có activation của key này, kể cả activation đã gỡ (ví dụ khi cài lại app), thì dùng lại đúng activation đó: giữ `activation_id`, `activation_created_at` và `quota_epoch`, không mở cửa sổ `quota_fresh` mới. Activation mới thật mở cửa sổ `quota_fresh` 15 phút (§6.8, "Hạn mức"). Đã có một máy khác đang giữ key thì trả `409 key_in_use` kèm danh sách máy đó (`activation_id`, `device_label` và thời điểm `validate` gần nhất), không đổi gì. Gửi lại với `allow_conflict: true` thì máy này vẫn được kích hoạt và key vào trạng thái xung đột: trả `409 license_conflict` kèm `activation_id` của máy này và cả hai máy, không cấp token. Key đang xung đột thì máy đang kích hoạt nhận `409 license_conflict` (cũng kèm `activation_id` của nó), còn máy chưa kích hoạt nhận `409 key_in_use` (bỏ qua `allow_conflict`). Key đang bị khóa tạm thì trả `423 license_locked` (§10.2); luật khóa tạm kiểm trước luật một máy.
```

- [ ] **Step 3: `validate` khi xung đột**

Tìm:
```text
| `POST /v1/licenses/validate` `{key, activation_id}` | Trả về token mới nếu license còn hiệu lực, cùng các trường như `activate`. Token mang gói, hạn và hạn mức hiện tại của license. Chưa cấu hình `PLANS` thì `503 pricing_not_configured`. |
```
Thay bằng:
```text
| `POST /v1/licenses/validate` `{key, activation_id}` | Trả về token mới nếu license còn hiệu lực, cùng các trường như `activate`. Token mang gói, hạn và hạn mức hiện tại của license. Key đang xung đột (từ 2 máy đang kích hoạt) thì trả `409 license_conflict` kèm danh sách máy đang kích hoạt (không có `activation_id`), không cấp token. Chưa cấu hình `PLANS` thì `503 pricing_not_configured`. |
```

- [ ] **Step 4: `deactivate`**

Tìm:
```text
| `POST /v1/licenses/deactivate` `{key, activation_id}` | Gỡ kích hoạt để chuyển máy. Gọi được từ chính máy đó, hoặc từ máy mới khi key đã đủ 2 máy (gỡ từ xa). Mỗi lần gỡ tính vào luật khóa tạm ở §10.2. **Gỡ không xóa dòng activation**, chỉ đánh dấu đã gỡ và trả lại suất, để kích hoạt lại cùng máy dùng lại đúng activation đó. |
```
Thay bằng:
```text
| `POST /v1/licenses/deactivate` `{key, activation_id}` | Gỡ một máy đang kích hoạt của key, để chuyển máy hay để hết xung đột. Gọi được từ chính máy đó, hoặc từ máy khác biết key (gỡ từ xa). Mỗi lần gỡ tính vào luật khóa tạm ở §10.2. **Gỡ không xóa dòng activation**, chỉ đánh dấu đã gỡ, để kích hoạt lại cùng máy dùng lại đúng activation đó. Gỡ xong mà key còn đúng một máy đang kích hoạt thì hết xung đột; `validate` kế tiếp của máy đó nhận token. |
```

- [ ] **Step 5: Công cụ hỗ trợ: tra cứu, cấp license mới**

Tìm:
```text
- Tra cứu theo email hoặc `order_code`, gửi lại key.
```
Thay bằng:
```text
- Tra cứu theo email hoặc `order_code`, gửi lại key. Kết quả tra license có danh sách máy đang kích hoạt và cho biết key có đang xung đột không (§6.8, "Mỗi key một máy").
- Tra cứu theo `device_id_hash` (chỉ đọc): dùng thử Free của máy (`started_at`, `ends_at`, `last_seen_at`) và các activation của máy đó. Không có thao tác reset hay kéo dài dùng thử.
```

Tìm:
```text
(key mới, 30 ngày từ lúc thao tác)
```
Thay bằng:
```text
(key mới, số ngày mỗi đơn của gói, tính từ lúc thao tác)
```

- [ ] **Step 6: Kiểm**

Run: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; sed -n 620,680p $S | grep -nE "pro_x|2 máy|tốn thêm suất|30 ngày từ lúc thao tác"; grep -c "POST /v1/trial" $S`
Expected: lệnh grep đầu không in dòng nào; lệnh sau in `1`.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §6.8 API /v1/trial, key_in_use, license_conflict; tra cứu admin

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 5: §6.8, token, mua trong app, hạn mức, mỗi key một máy

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 685–692, 701, 703, 716, 724–727, 760)

- [ ] **Step 1: Trường `plan` và `quota_minutes_per_cycle` của token**

Tìm:
```text
  - `plan`: mã gói trả phí, `pro`, `pro_x2` hoặc `pro_x5`;
```
Thay bằng:
```text
  - `plan`: mã gói trả phí, `monthly` hoặc `yearly`;
```

Tìm:
```text
  - `quota_minutes_per_cycle`: hạn mức mỗi chu kỳ, tính bằng phút (Professional 1800, X2 6000); `null` là không giới hạn (X5);
```
Thay bằng:
```text
  - `quota_minutes_per_cycle`: hạn mức mỗi chu kỳ, tính bằng phút (Monthly 3000); `null` là không giới hạn (Yearly);
```

- [ ] **Step 2: Câu "gia hạn từ máy khác" và khối token dùng thử**

Tìm:
```text
- Quá `expires_at` thì app gọi `validate` trước, nếu có mạng, vì key có thể đã được gia hạn từ máy khác. App chỉ về Free và nhắc gia hạn khi server xác nhận chưa gia hạn, hoặc khi không có mạng.
```
Thay bằng:
```text
- Quá `expires_at` thì app gọi `validate` trước, nếu có mạng, vì key có thể đã được gia hạn ở nơi khác (đơn tạo trước khi đổi máy, hay admin gia hạn tay). App chỉ về Free (theo luật "Dùng thử Free") và nhắc gia hạn khi server xác nhận chưa gia hạn, hoặc khi không có mạng.
- Token bản quyền không có trường `typ`. Bộ kiểm token bản quyền (server và app) từ chối payload có `typ`.

**Token dùng thử Free:**
- Cùng định dạng `v1`, cùng khóa ký và `kid` với token bản quyền. Claims: `typ` (luôn là `"trial"`), `kid`, `device_id_hash`, `started_at`, `ends_at`, `issued_at`.
- Bộ kiểm token dùng thử đòi `typ` là `"trial"` và đủ năm trường kia. Nhờ vậy không dùng nhầm token dùng thử làm token bản quyền, hay ngược lại.
- Token dùng thử không có `expires_at` hay `refresh_before`. Hiệu lực của nó là khoảng [`started_at`, `ends_at`), kiểm theo luật "Dùng thử Free" ở mục "Hạn mức".
```

- [ ] **Step 3: Bước 6 của "Mua ngay trong app"**

Tìm:
```text
6. Key cũng được gửi qua email, để kích hoạt máy thứ hai hoặc cài lại máy.
```
Thay bằng:
```text
6. Key cũng được gửi qua email, để cài lại máy hay chuyển key sang máy khác (mỗi key một máy).
```

- [ ] **Step 4: Đếm riêng trên từng máy**

Tìm:
```text
- **Đếm riêng trên từng máy.** Mỗi máy kích hoạt có đủ hạn mức của gói; hai máy của cùng một key không chia chung. Server không theo dõi số phút đã dùng.
```
Thay bằng:
```text
- **Đếm riêng trên từng máy.** Mỗi key chỉ dùng trên một máy (P2); bộ đếm gắn với activation của máy đó. Server không theo dõi số phút đã dùng.
```

- [ ] **Step 5: 30 phút Free**

Tìm:
```text
không mở thêm 10 phút Free.
```
Thay bằng:
```text
không mở thêm 30 phút Free.
```

Tìm:
```text
- **Free** (không có token, nên không dùng `quota_fresh` hay bản ghi đánh dấu):
```
Thay bằng:
```text
- **Free** (không có token bản quyền, nên không dùng `quota_fresh` hay bản ghi đánh dấu):
```

- [ ] **Step 6: "Mất bản ghi" của Free và mục "Dùng thử Free"**

Tìm:
```text
  - **Mất bản ghi:** không còn bộ đếm của ngày trong khi app đã có dữ liệu từ trước (ví dụ file cài đặt). Khi đó coi như đã dùng hết 10 phút của ngày đó.
```
Thay bằng:
```text
  - **Mất bản ghi:** không còn bộ đếm của ngày trong khi app đã có dữ liệu từ trước (ví dụ file cài đặt). Khi đó coi như đã dùng hết 30 phút của ngày đó.
- **Dùng thử Free** (chủ dự án chốt 2026-10-07):
  - Free chỉ dùng được trong `TRIAL_DAYS` ngày (production: 10) kể từ lần máy đăng ký dùng thử thành công đầu tiên với server (`started_at`, giờ server). Mỗi máy (`device_id_hash`) dùng thử một lần: server giữ mốc trong bảng `trials` (§10.1), nên gỡ app rồi cài lại, xóa dữ liệu hay xóa kho khóa đều không mở lại được dùng thử. Đổi `TRIAL_DAYS` chỉ áp cho máy đăng ký sau đó; `ends_at` đã ghi không đổi.
  - **Đăng ký:** ngay sau khi người dùng đồng ý điều khoản ở lần đầu mở app (§4.1, bước 1b), app gọi `POST /v1/trial` chạy nền. Lỗi mạng không chặn onboarding. Chừng nào chưa có token dùng thử hợp lệ cho máy này, app gọi lại lúc khởi động, theo nhịp kiểm định kỳ mỗi giờ, và khi người dùng bấm Bắt đầu ở gói Free. Lần đầu mở app mà offline thì mốc 10 ngày lùi tới lần đăng ký thành công đầu tiên, thường là ngay bước tải model.
  - **Lưu:** token dùng thử nằm trong kho khóa, mục riêng, không lẫn với token bản quyền. "Xóa toàn bộ dữ liệu" và "Xóa model và dữ liệu" giữ mục này, như giữ trạng thái bản quyền. Token hỏng, sai chữ ký, sai `typ` hay sai máy thì app bỏ và đăng ký lại; server trả lại đúng `started_at` cũ.
  - **Free dùng được khi** đủ bốn điều kiện:
    1. không có gói trả phí đang hiệu lực trên máy;
    2. có token dùng thử hợp lệ của máy này;
    3. giờ tin được (lớn nhất trong giờ máy, `issued_at` của các token đã ký, header `Date` của server) còn trước `ends_at`, và giờ máy không bị coi là chỉnh lùi (dung sai 10 phút, §10.2);
    4. bộ đếm của ngày còn dưới 30 phút.
  - Gói trả phí hết hạn, bị gỡ, bị thu hồi hay đang xung đột thì máy quay về Free theo đúng bốn điều kiện trên: còn trong thời gian dùng thử thì dùng được 30 phút mỗi ngày, hết thì không.
  - **Hết dùng thử:** không bắt đầu phiên ở Free; app báo đã hết 10 ngày dùng thử, kèm nút Nâng cấp. Đang dịch mà qua `ends_at` thì phiên đang chạy được chạy hết; phiên sau mới bị chặn.
  - **Chưa có token mà không có mạng:** không bắt đầu phiên ở Free; app báo cần kết nối mạng một lần để bắt đầu dùng thử.
  - Bản không chính hãng (chỉ chạy chế độ Free, §10.2) cũng chịu luật dùng thử. Công tắc dev `AI_TRANSLATOR_DEV_PRO` (§6.13) vẫn bỏ qua mọi hạn mức như trước.
```

- [ ] **Step 7: Mục "Mỗi key một máy", trước "Các quy tắc khác"**

Tìm:
```text
**Các quy tắc khác:**
- **Gia hạn:** PayOS không tự trừ tiền định kỳ.
```
Thay bằng:
```text
**Mỗi key một máy** (chủ dự án chốt 2026-10-07):
- Bình thường mỗi key có tối đa một máy đang kích hoạt (dòng `activations` chưa gỡ). Cài lại app trên cùng máy dùng lại đúng activation cũ.
- **Xung đột:** key có từ 2 máy đang kích hoạt. Server suy ra trạng thái này từ số activation chưa gỡ, không lưu cột riêng. Khi xung đột, `activate` và `validate` của các máy đang kích hoạt đều trả `409 license_conflict`, không cấp token.
- **Máy thứ hai kích hoạt** khi máy khác đang giữ key thì nhận `409 key_in_use`. App cho chọn:
  1. "Gỡ máy kia và dùng máy này": gỡ máy kia từ xa (`deactivate`), rồi `activate` lại. Đây là cách đổi máy bình thường.
  2. "Vẫn kích hoạt trên máy này": app hỏi xác nhận với câu "Key sẽ bị tạm khóa trên cả hai máy cho tới khi một máy gỡ key", rồi gọi `activate` với `allow_conflict: true`. Key vào trạng thái xung đột.
- **App khi nhận `license_conflict`** (từ `activate` hay `validate`): giữ key và `activation_id` trong kho khóa, xóa token bản quyền đang lưu, chuyển sang trạng thái xung đột.
  - Gói trả phí và tính năng Pro không dùng được; máy theo luật Free ("Dùng thử Free" ở trên).
  - Màn hình chính và nhóm Cài đặt "Bản quyền" báo "Key đang dùng trên 2 máy nên đã bị tạm khóa", liệt kê hai máy, kèm nút "Gỡ key khỏi máy này", "Gỡ máy kia", "Thử lại" (§4.3).
  - Khi có mạng, app gọi `validate` mỗi 15 phút; nhận token thì về trạng thái bình thường.
  - Bộ đếm hạn mức trên máy giữ nguyên.
- **Mở khóa:** một máy gỡ key, tự gỡ hay gỡ từ xa đều được. Mỗi lần gỡ vẫn tính vào luật khóa tạm (§10.2): máy bị gỡ muốn quay lại phải `activate`; luật không đếm các lần gỡ chính máy đang xin kích hoạt, nên hai máy giành nhau một key bị `423` ở lần `activate` sau lần gỡ thứ 5 trong 30 ngày (ngưỡng đếm lần gỡ của máy kia là hơn 2). Nhờ vậy hai người dùng chung key không gỡ qua gỡ lại mãi được.
- **Kiểm nhanh lúc bắt đầu phiên:** bắt đầu phiên ở gói trả phí mà lần `validate` thành công gần nhất đã quá 1 giờ thì app gọi `validate` chạy nền, song song với phiên, không làm chậm lúc bắt đầu. Kết quả là xung đột, thu hồi hay đã bị gỡ thì app dừng phiên với lý do `license_conflict` (hay `license_invalid`) và báo như trên. Lỗi mạng thì bỏ qua, phiên chạy tiếp.

**Các quy tắc khác:**
- **Gia hạn:** PayOS không tự trừ tiền định kỳ.
```

- [ ] **Step 8: Kiểm**

Run: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; sed -n 676,830p $S | grep -nE "pro_x|Professional|X2|X5|10 phút Free|hết 10 phút|máy thứ hai hoặc"; grep -c "Mỗi key một máy\*\* (chủ dự án chốt 2026-10-07)" $S; grep -c "Dùng thử Free\*\* (chủ dự án chốt 2026-10-07)" $S`
Expected: lệnh grep đầu không in dòng nào; hai lệnh sau mỗi lệnh in `1`.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §6.8 token dùng thử, luật dùng thử Free 10 ngày, mỗi key một máy

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 6: §9, bảng xử lý lỗi

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 996, 999, 1003)

- [ ] **Step 1: Dòng hết hạn mức**

Tìm:
```text
| Hết hạn mức (Free: 10 phút hôm nay; Professional, X2: hạn mức của chu kỳ) |
```
Thay bằng:
```text
| Hết hạn mức (Free: 30 phút hôm nay; Monthly: hạn mức của chu kỳ) |
```

- [ ] **Step 2: Dòng license không hợp lệ**

Tìm:
```text
| License không hợp lệ, hết hạn hoặc bị thu hồi | Kết quả `validate` | Về Free, báo rõ lý do |
```
Thay bằng:
```text
| License không hợp lệ, hết hạn hoặc bị thu hồi | Kết quả `validate` | Về Free (theo luật dùng thử, §6.8), báo rõ lý do |
```

- [ ] **Step 3: Thay dòng "đủ 2 máy" bằng năm dòng mới**

Tìm:
```text
| Key đã kích hoạt đủ 2 máy | `activate` trả `409` | Hiện danh sách máy đã kích hoạt (tên máy, lần dùng gần nhất), cho gỡ một máy rồi kích hoạt máy đang dùng. Vượt giới hạn gỡ ở §10.2 thì hướng dẫn liên hệ hỗ trợ. |
```
Thay bằng:
```text
| Key đang dùng ở máy khác | `activate` trả `409 key_in_use` | Hiện máy đang giữ key (tên máy, lần dùng gần nhất), cho chọn "Gỡ máy kia và dùng máy này" hoặc "Vẫn kích hoạt trên máy này" (hỏi xác nhận vì cả hai máy sẽ bị tạm khóa, §6.8). Vượt giới hạn gỡ ở §10.2 thì hướng dẫn liên hệ hỗ trợ. |
| Key đang xung đột (2 máy cùng kích hoạt) | `activate` hay `validate` trả `409 license_conflict` | Trạng thái xung đột (§6.8, "Mỗi key một máy"): gói trả phí bị tạm khóa, máy theo luật Free; báo lý do, liệt kê hai máy, nút gỡ key. Đang dịch thì dừng phiên với lý do `license_conflict` |
| Free chưa đăng ký dùng thử, không có mạng | Không có token dùng thử, `POST /v1/trial` lỗi mạng | Không bắt đầu phiên; báo "Cần kết nối mạng một lần để bắt đầu dùng thử" |
| Hết 10 ngày dùng thử Free | Giờ tin được ≥ `ends_at` của token dùng thử (§6.8) | Không bắt đầu phiên ở Free; báo đã hết dùng thử, kèm nút Nâng cấp |
| `POST /v1/trial` trả `429` hay `503` | Mã lỗi | Coi như lỗi tạm, thử lại theo nhịp ở §6.8 ("Dùng thử Free"); chỉ báo khi người dùng cần bắt đầu phiên |
```

- [ ] **Step 4: Kiểm**

Run: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; sed -n 983,1020p $S | grep -nE "đủ 2 máy|Professional|X2|10 phút hôm nay"; sed -n 983,1020p $S | grep -c "license_conflict"`
Expected: lệnh grep đầu không in dòng nào; lệnh sau in `1`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §9 lỗi key_in_use, license_conflict, dùng thử Free

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 7: §10.1 và §10.2

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (dòng 1024, 1030, 1038, 1040, 1086–1089, 1102–1105, 1111)

- [ ] **Step 1: §10.1, kết nối mạng**

Tìm:
```text
gọi license server của sản phẩm (khi mua, kích hoạt, kiểm tra bản quyền; và hỏi giờ
```
Thay bằng:
```text
gọi license server của sản phẩm (khi mua, kích hoạt, kiểm tra bản quyền, đăng ký dùng thử Free; và hỏi giờ
```

- [ ] **Step 2: §10.1, dữ liệu server lưu**

Tìm:
```text
  - License server chỉ lưu email (để gửi và khôi phục key), thông tin đơn hàng, license, mã băm của ID máy, tên máy (`device_label`, để người dùng nhận ra máy khi cần gỡ) và thời điểm kiểm tra bản quyền gần nhất.
```
Thay bằng:
```text
  - License server chỉ lưu email (để gửi và khôi phục key), thông tin đơn hàng, license, mã băm của ID máy, tên máy (`device_label`, để người dùng nhận ra máy khi cần gỡ) và thời điểm kiểm tra bản quyền gần nhất.
  - Với dùng thử Free, server lưu bảng `trials` cho **mọi** máy đã đăng ký dùng thử, kể cả máy không mua gói: mã băm của ID máy, lúc bắt đầu và lúc hết dùng thử, lần gọi gần nhất. Không có email hay tên máy. App gửi `device_id_hash` khi đăng ký dùng thử, ngay sau khi người dùng đồng ý EULA và Chính sách quyền riêng tư ở bước 1b (§4.1), nên chính sách phải ghi rõ việc này (spec 2026-10-07, mục 7).
```

- [ ] **Step 3: §10.1, xóa theo email**

Tìm:
```text
Đây là dữ liệu bí danh, giữ cho mục đích chống lạm dụng: giới hạn 2 máy, luật khóa tạm,
```
Thay bằng:
```text
Đây là dữ liệu bí danh, giữ cho mục đích chống lạm dụng: mỗi key một máy, luật khóa tạm,
```

Tìm:
```text
      - giữ dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền.
```
Thay bằng:
```text
      - giữ dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền;
      - không chạm bảng `trials`: bảng này không có email, và mã băm ID máy trong đó giữ để chặn dùng thử lại (§6.8).
```

- [ ] **Step 4: §10.2, dòng chỉnh đồng hồ máy**

Tìm:
```text
nhắc người dùng chỉnh giờ. |
```
Thay bằng:
```text
nhắc người dùng chỉnh giờ. **Dùng thử Free:** `ends_at` so với giờ tin được (lớn nhất trong giờ máy, `issued_at` đã ký, header `Date` của server); giờ máy bị coi là chỉnh lùi thì Free không bắt đầu phiên được (§6.8, "Dùng thử Free"). |
```

- [ ] **Step 5: §10.2, dòng sửa kho khóa**

Tìm:
```text
còn máy đã xóa sạch dữ liệu thì có cửa sổ `fresh` tính từ token đầu tiên sau khi tăng (§6.8). |
```
Thay bằng:
```text
còn máy đã xóa sạch dữ liệu thì có cửa sổ `fresh` tính từ token đầu tiên sau khi tăng (§6.8). Xóa token dùng thử thì app đăng ký lại, và server trả lại đúng mốc dùng thử cũ (§6.8). |
```

- [ ] **Step 6: §10.2, dòng chia sẻ key; thêm dòng dùng thử lại**

Tìm:
```text
| Chia sẻ hoặc bán lại key | Mỗi key tối đa 2 máy; kích hoạt lại trên cùng một máy không tốn thêm suất.
```
Thay bằng:
```text
| Dùng thử Free lại nhiều lần trên cùng máy | Server ghi mốc dùng thử theo `device_id_hash` (bảng `trials`), nên cài lại app, xóa dữ liệu hay xóa kho khóa không mở lại dùng thử (§6.8). Rủi ro còn lại: dưới bảng. |
| Chia sẻ hoặc bán lại key | Mỗi key chỉ dùng trên một máy; máy thứ hai kích hoạt cùng key thì key bị tạm khóa trên cả hai máy cho tới khi một máy gỡ key (§6.8, "Mỗi key một máy"). Kích hoạt lại trên cùng một máy không tính là máy mới.
```

- [ ] **Step 7: §10.2, giới hạn tần suất**

Tìm:
```text
`deactivate` ≤ 10 lần/giờ/IP,
```
Thay bằng:
```text
`deactivate` ≤ 10 lần/giờ/IP, `trial` ≤ 10 lần/giờ/IP (không tính vào bộ đếm thất bại theo IP),
```

- [ ] **Step 8: §10.2, rủi ro chấp nhận**

Tìm:
```text
- **Free trên cùng máy lách được bằng cách xóa sạch dữ liệu** (kho khóa và file cài đặt): Free không có token, nên app không phân biệt được với một máy mới.
```
Thay bằng:
```text
- **Xóa sạch dữ liệu trên máy** (kho khóa và file cài đặt) mở lại 30 phút Free của ngày hôm đó, vì luật "mất bản ghi" của Free chỉ chạy khi app còn dữ liệu cũ. Không mở lại được 10 ngày dùng thử (§6.8).
- **Cài lại Windows** làm `MachineGuid` đổi, nên máy được dùng thử lại. Trên Mac, IOPlatformUUID không đổi khi cài lại hệ điều hành.
- **Sửa app để gửi `device_id_hash` giả** thì được dùng thử mới. Lớp kiểm app chính hãng (bảng trên) chỉ giới hạn phần nào; bản ký ad-hoc trên Mac yếu hơn (spec 2026-10-05).
- **Giữ giờ máy đứng yên khi offline** (luôn đặt về cùng một ngày, không kết nối mạng) thì kéo dài được dùng thử, vì giờ tin được không tăng. Chấp nhận: app cần mạng để cập nhật và tải model, và phần lợi chỉ là 30 phút mỗi ngày.
- **Máy đang giữ key mà offline** thì chưa biết key đã xung đột: vẫn dùng token cũ tới `refresh_before`, tối đa 14 ngày. Có mạng thì xung đột có tác dụng trong vòng 1 giờ dùng (kiểm nhanh lúc bắt đầu phiên) hay 24 giờ (kiểm định kỳ), §6.8.
- **Người dùng chung key gỡ máy của chủ key từ xa:** chủ key gỡ lại được; luật khóa tạm dừng việc này sau khoảng 5 lần gỡ qua gỡ lại trong 30 ngày, rồi phải liên hệ hỗ trợ.
```

Tìm:
```text
- **Người hết hạn mức gói trả phí mà gỡ kích hoạt** thì từ hôm sau dùng được 10 phút Free mỗi ngày. Hôm gỡ thì Free cũng đã hết (§6.8).
```
Thay bằng:
```text
- **Người hết hạn mức gói trả phí mà gỡ kích hoạt** thì từ hôm sau dùng được 30 phút Free mỗi ngày, nếu máy còn trong thời gian dùng thử. Hôm gỡ thì Free cũng đã hết (§6.8).
```

- [ ] **Step 9: §10.2, luật khóa tạm khi xung đột**

Tìm:
```text
- Key đã khóa thì chặn mọi máy không đang kích hoạt. Các máy đang kích hoạt vẫn `validate` và gỡ máy được.
```
Thay bằng:
```text
- Key đã khóa thì chặn mọi máy không đang kích hoạt. Các máy đang kích hoạt vẫn gỡ máy được, và vẫn `validate` được khi key không xung đột (§6.8, "Mỗi key một máy").
```

- [ ] **Step 9b: Ngưỡng khóa tạm hạ từ 3 xuống 2 (chủ dự án chốt 2026-10-07)**

Bốn chỗ của spec gốc nhắc ngưỡng hay cách đếm cũ. Sửa từng chỗ (Task 7 commit cả bốn, dù một chỗ nằm ở §6.8).

Tìm (§6.8, "Gỡ máy rồi kích hoạt máy khác không chuyển bộ đếm"):
```text
Luật khóa tạm (§10.2) chỉ giới hạn được phần nào (tối đa khoảng 3 lần đổi máy mỗi 30 ngày).
```
Thay bằng:
```text
Luật khóa tạm (§10.2) chỉ giới hạn được phần nào (tối đa 2 lần đổi máy mỗi 30 ngày; lần thứ 3 bị khóa).
```

Tìm (§10.2, "Rủi ro chấp nhận ở MVP"):
```text
Luật khóa tạm bên dưới chỉ giới hạn được phần nào (khoảng 3 lần đổi máy mỗi 30 ngày).
```
Thay bằng:
```text
Luật khóa tạm bên dưới chỉ giới hạn được phần nào (tối đa 2 lần đổi máy mỗi 30 ngày; lần thứ 3 bị khóa).
```

Tìm (§10.2, "Khóa tạm key", dòng đầu):
```text
và **trừ các lần gỡ chính máy đang kích hoạt**.
```
Thay bằng:
```text
và **trừ các lần gỡ chính máy đang kích hoạt**. Riêng khi `activate` có `allow_conflict: true` (máy vào bằng xác nhận xung đột), đếm **mọi** lần gỡ do người dùng, kể cả lần gỡ chính máy xin vào: nhờ vậy máy lạ chen vào rồi bị chủ key gỡ lại nhiều lần thì bị khóa, còn chủ key vẫn dùng bình thường.
```

Tìm (§10.2, "Khóa tạm key"):
```text
mà số trên lớn hơn 3, server khóa key,
```
Thay bằng:
```text
mà số trên lớn hơn 2, server khóa key,
```

- [ ] **Step 10: Kiểm**

Run: `S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; sed -n 1019,1150p $S | grep -nE "2 máy|10 phút Free|Free không có token"; sed -n 1019,1150p $S | grep -c "trials"`
Expected: lệnh grep đầu không in dòng nào; lệnh sau in số ≥ `4`.

- [ ] **Step 11: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §10.1 bảng trials; §10.2 mối đe dọa, giới hạn trial, rủi ro chấp nhận mới

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 8: §11, §12, §13, §15 và kiểm toàn file

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (§11–§15)

- [ ] **Step 1: §11, unit test hạn mức của app**

Tìm:
```text
hết hạn mức gói trả phí thì Free của ngày cũng hết;
```
Thay bằng:
```text
hết hạn mức gói trả phí thì Free của ngày cũng hết; dùng thử: bốn điều kiện của Free (§6.8), qua `ends_at` thì không bắt đầu phiên, giờ máy chỉnh lùi thì chặn, token dùng thử sai máy hay sai `typ` bị bỏ rồi đăng ký lại, lỗi mạng khi đăng ký không chặn onboarding;
```

Tìm:
```text
dừng với `quota_exhausted`; X5 không giới hạn.
```
Thay bằng:
```text
dừng với `quota_exhausted`; Yearly không giới hạn.
```

Tìm:
```text
  - Trạng thái bản quyền: ân hạn, thu hồi, tự làm mới token khi app chạy liên tục quá 24 giờ.
```
Thay bằng:
```text
  - Trạng thái bản quyền: ân hạn, thu hồi, tự làm mới token khi app chạy liên tục quá 24 giờ; mỗi key một máy (`key_in_use`, `license_conflict` xóa token và vào trạng thái xung đột, thử lại 15 phút, kiểm nhanh lúc bắt đầu phiên dừng phiên khi xung đột, lỗi mạng không dừng phiên).
```

- [ ] **Step 2: §11, unit test của license server**

Tìm:
```text
đổi gói (công thức quy đổi, cả hai ví dụ ở §6.8, `cycle_anchor` mới); giới hạn 2 máy, kích hoạt lại cùng máy không tốn suất, gỡ từ xa khi đã đủ máy;
```
Thay bằng:
```text
đổi gói (công thức quy đổi theo giá mỗi ngày, cả hai ví dụ ở §6.8, `cycle_anchor` mới); mỗi key một máy (`409 key_in_use` không đổi dữ liệu, `allow_conflict` tạo xung đột, máy thứ ba nhận `key_in_use`, `validate` khi xung đột trả `409 license_conflict`, tự gỡ hay gỡ từ xa làm hết xung đột, chuỗi gỡ qua gỡ lại giữa hai máy bị `423`), kích hoạt lại cùng máy dùng lại activation; dùng thử (`POST /v1/trial` tạo một lần, gọi lại giữ `started_at`, gọi đồng thời ra một dòng, đã hết vẫn trả `200`, `503 trial_not_configured`; bộ kiểm token bản quyền từ chối payload có `typ`); migration `0002` đổi mã gói cũ sang `monthly`, `yearly`;
```

- [ ] **Step 3: §11, test bảo mật**

Tìm:
```text
  - Gỡ rồi kích hoạt lại quá ngưỡng: key bị khóa tạm.
```
Thay bằng:
```text
  - Gỡ rồi kích hoạt lại quá ngưỡng: key bị khóa tạm.
  - Xóa token dùng thử trong kho khóa (hay gỡ app, xóa dữ liệu rồi cài lại) trên cùng máy: dùng thử Free vẫn đúng số ngày còn lại, không mở lại 10 ngày.
```

- [ ] **Step 4: §12, bảng `trials`**

Tìm:
```text
D1 có bảng deactivations: mỗi lần gỡ máy một dòng, vì activation không bị xóa
```
Thay bằng:
```text
D1 có bảng deactivations (mỗi lần gỡ máy một dòng, vì activation không bị xóa) và trials (mốc dùng thử Free theo máy)
```

- [ ] **Step 5: §13, Phase 1**

Tìm:
```text
bốn gói và hạn mức (§2, §6.8), đạt A1–A7.
```
Thay bằng:
```text
các gói và hạn mức (§2, §6.8; bốn gói, đổi thành ba gói và mỗi key một máy ngày 2026-10-07), đạt A1–A7.
```

- [ ] **Step 6: §15, quyết định mới và điểm hỏi luật sư**

Tìm:
```text
Đã quyết ngày 2026-10-02: khóa ký manifest model và khóa ký bản cập nhật, mỗi loại một khóa trong secret của CI kèm bản sao offline mã hóa (§10.2); máy chưa được hỗ trợ thì không tải model (§6.7, §8).
```
Thay bằng:
```text
Đã quyết ngày 2026-10-02: khóa ký manifest model và khóa ký bản cập nhật, mỗi loại một khóa trong secret của CI kèm bản sao offline mã hóa (§10.2); máy chưa được hỗ trợ thì không tải model (§6.7, §8).

Đã quyết ngày 2026-10-07: ba gói thay bốn gói (Free dùng thử 10 ngày mỗi máy, 30 phút mỗi ngày; Monthly 50.000 đ, 50 giờ mỗi 30 ngày; Yearly 500.000 đ, không giới hạn, 365 ngày), đổi gói quy đổi theo giá mỗi ngày, mỗi key một máy và tạm khóa cả hai máy khi trùng (P1, P2, §2, §6.8; spec `2026-10-07-three-plans-single-device-design.md`).
```

Tìm:
```text
  - việc giữ `device_id_hash` (đã băm) khi khách yêu cầu xóa (§10.1);
```
Thay bằng:
```text
  - việc giữ `device_id_hash` (đã băm) khi khách yêu cầu xóa (§10.1);
  - việc lưu `device_id_hash` của mọi máy dùng thử Free (bảng `trials`, không có email), dựa trên việc đồng ý EULA và Chính sách quyền riêng tư ở bước 1b (§4.1, §10.1);
```

- [ ] **Step 7: Kiểm toàn file**

Run:
```bash
S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
grep -nE "Professional|pro_x|\bX2\b|\bX5\b|device_limit|10 phút mỗi ngày|10 phút Free|Free: 10 phút|hết 10 phút|tối đa 2 máy|đủ 2 máy|giới hạn 2 máy|Bốn gói ở|4 gói" $S
```
Expected: chỉ một dòng, dòng trạng thái lịch sử `- Sửa ngày 2026-10-01 … bốn gói và hạn mức …` không khớp mẫu nên **không in dòng nào**. Có dòng nào in ra thì sửa theo spec 2026-10-07 rồi chạy lại.

Run: `grep -cE "monthly|Monthly" $S; grep -cE "yearly|Yearly" $S`
Expected: mỗi số ≥ `8`.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): §11–§15 theo ba gói và mỗi key một máy

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

# Phần B: văn bản pháp lý và runbook

App đóng gói bốn file `docs/legal/{eula,privacy}.{vi,en}.md` (`src/lib/legal.ts`, `import.meta.glob`). Test duy nhất đọc nội dung thật là `src/lib/legal.test.ts` dòng 35–38: kiểm mỗi file có tiêu đề ("Thỏa thuận cấp phép người dùng cuối", "End User License Agreement", "Chính sách quyền riêng tư", "Privacy Policy"). Không test nào băm hay so toàn văn, nên chỉ cần giữ nguyên dòng tiêu đề và chạy lại test.

## Task 9: EULA tiếng Việt

**Files:**
- Modify: `docs/legal/eula.vi.md` (dòng 3, 13, 17–29, 36)

- [ ] **Step 1: Phiên bản**

Tìm:
```text
**Phiên bản 1.0, hiệu lực từ 06/10/2026.**
```
Thay bằng:
```text
**Phiên bản 1.1, hiệu lực từ 07/10/2026.**
```

- [ ] **Step 2: Mục 2**

Tìm:
```text
để cài đặt và dùng ứng dụng theo thỏa thuận này, trên số máy mà gói của bạn cho phép (mục 4).
```
Thay bằng:
```text
để cài đặt và dùng ứng dụng theo thỏa thuận này: gói Free trên máy của bạn trong thời gian dùng thử (mục 3), gói trả phí trên máy đã kích hoạt key (mục 4).
```

- [ ] **Step 3: Mục 3, bảng gói và các gạch đầu dòng**

Tìm:
```text
| Gói | Hạn mức, mỗi máy | Giá |
|---|---|---|
| Free | 10 phút mỗi ngày | 0 đ |
| Professional | 30 giờ mỗi chu kỳ 30 ngày | 50.000 đ mỗi 30 ngày |
| Professional X2 | 100 giờ mỗi chu kỳ 30 ngày | 150.000 đ mỗi 30 ngày |
| Professional X5 | không giới hạn | 500.000 đ mỗi 30 ngày |
```
Thay bằng:
```text
| Gói | Hạn mức, mỗi máy | Thời hạn | Giá |
|---|---|---|---|
| Free | 30 phút mỗi ngày | dùng thử 10 ngày, mỗi máy một lần | 0 đ |
| Monthly | 50 giờ mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |
| Yearly | không giới hạn | 365 ngày mỗi đơn | 500.000 đ |
```

Tìm:
```text
- Ba gói trả phí cùng có các tính năng Pro (từ điển thuật ngữ, lưu lịch sử, xuất bản chép lời) và chỉ khác hạn mức.
- Gói trả phí là **đơn 30 ngày, trả trước** bằng VND qua chuyển khoản VietQR (PayOS). **Không tự gia hạn.** Hết hạn thì ứng dụng quay về gói Free; bạn mua tiếp khi cần.
- **Mua thêm cùng gói** cộng thêm 30 ngày. **Đổi gói** khi còn hạn: số ngày còn lại của gói cũ được quy đổi theo giá sang ngày của gói mới (làm tròn xuống), gói mới bắt đầu ngay với chu kỳ mới; ứng dụng hiện trước số ngày quy đổi và ngày hết hạn mới. **Đổi gói không được hoàn tiền.**
```
Thay bằng:
```text
- **Free là gói dùng thử:** dùng được trong **10 ngày**, tính từ lần đầu ứng dụng đăng ký dùng thử với máy chủ của chúng tôi (thường là lần đầu mở ứng dụng có mạng). **Mỗi máy chỉ dùng thử một lần**: gỡ rồi cài lại ứng dụng, hay xóa dữ liệu, không mở lại thời gian dùng thử. Hết dùng thử thì bạn cần mua gói trả phí để tiếp tục dịch.
- Hai gói trả phí cùng có các tính năng Pro (từ điển thuật ngữ, lưu lịch sử, xuất bản chép lời), khác hạn mức và thời hạn.
- Gói trả phí là **đơn trả trước** (Monthly 30 ngày, Yearly 365 ngày) bằng VND qua chuyển khoản VietQR (PayOS). **Không tự gia hạn.** Hết hạn thì ứng dụng quay về gói Free nếu máy còn trong thời gian dùng thử; hết dùng thử thì không dịch được cho tới khi bạn mua tiếp.
- **Mua thêm cùng gói** cộng thêm số ngày của gói (30 ngày với Monthly, 365 ngày với Yearly). **Đổi gói** khi còn hạn: số ngày còn lại của gói cũ được quy đổi theo giá mỗi ngày sang ngày của gói mới (làm tròn xuống), gói mới bắt đầu ngay với chu kỳ mới; ứng dụng hiện trước số ngày quy đổi và ngày hết hạn mới. **Đổi gói không được hoàn tiền.**
```

- [ ] **Step 4: Mục 4, mỗi key một máy**

Tìm:
```text
- Mỗi key kích hoạt tối đa **2 máy**. Kích hoạt lại trên cùng một máy không tốn thêm suất. Bạn có thể gỡ kích hoạt một máy để dùng máy khác.
```
Thay bằng:
```text
- Mỗi key chỉ dùng trên **1 máy**. Kích hoạt lại trên cùng một máy không tính là máy mới. Muốn đổi máy, bạn gỡ key khỏi máy cũ (hoặc gỡ máy cũ từ máy mới) rồi kích hoạt máy mới.
- Nếu key được kích hoạt trên máy thứ hai trong khi máy kia vẫn giữ key, key bị **tạm khóa trên cả hai máy** cho tới khi một máy gỡ key. Trong thời gian đó, gói trả phí không dùng được trên cả hai máy.
```

- [ ] **Step 4b: Mục 4, câu khóa tạm**

Tìm:
```text
Nếu bạn gỡ và kích hoạt máy khác quá nhiều lần trong 30 ngày (khoảng hơn 3 lần), key có thể bị **khóa tạm**; liên hệ chúng tôi để mở khóa.
```
Thay bằng:
```text
Nếu bạn gỡ và kích hoạt máy khác quá nhiều lần trong 30 ngày (khoảng 5 lần gỡ), key có thể bị **khóa tạm**; liên hệ chúng tôi để mở khóa.
```

- [ ] **Step 5: Kiểm**

Run: `grep -nE "Professional|X2|X5|2 máy|10 phút|đơn 30 ngày" docs/legal/eula.vi.md`
Expected: không in dòng nào.

- [ ] **Step 6: Commit**

```bash
git add docs/legal/eula.vi.md
git commit -m "docs(legal): EULA vi 1.1, ba gói, dùng thử 10 ngày mỗi máy, mỗi key một máy

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 10: EULA tiếng Anh

**Files:**
- Modify: `docs/legal/eula.en.md` (dòng 3, 13, 17–29, 36)

- [ ] **Step 1: Phiên bản**

Tìm:
```text
**Version 1.0, effective 6 October 2026.
```
Thay bằng:
```text
**Version 1.1, effective 7 October 2026.
```

- [ ] **Step 2: Mục 2**

Tìm:
```text
right to install and use the app under this agreement, on the number of machines your plan allows (section 4).
```
Thay bằng:
```text
right to install and use the app under this agreement: the Free plan on your machine during the trial period (section 3), a paid plan on the machine where your key is activated (section 4).
```

- [ ] **Step 3: Mục 3**

Tìm:
```text
| Plan | Quota, per machine | Price |
|---|---|---|
| Free | 10 minutes per day | 0 VND |
| Professional | 30 hours per 30-day cycle | 50,000 VND per 30 days |
| Professional X2 | 100 hours per 30-day cycle | 150,000 VND per 30 days |
| Professional X5 | unlimited | 500,000 VND per 30 days |
```
Thay bằng:
```text
| Plan | Quota, per machine | Term | Price |
|---|---|---|---|
| Free | 30 minutes per day | 10-day trial, once per machine | 0 VND |
| Monthly | 50 hours per 30-day cycle | 30 days per order | 50,000 VND |
| Yearly | unlimited | 365 days per order | 500,000 VND |
```

Tìm:
```text
- All three paid plans have the same Pro features (glossary, history, transcript export) and differ only in quota.
- A paid plan is a **30-day order, paid in advance** in VND by VietQR bank transfer (PayOS). **It does not renew automatically.** When it expires the app returns to the Free plan; buy again when you need it.
- **Buying more of the same plan** adds 30 days. **Changing plan** while you still have time: the remaining days of the old plan are converted by price into days of the new plan (rounded down), and the new plan starts immediately with a new cycle; the app shows the converted days and the new expiry date beforehand. **Plan changes are not refunded.**
```
Thay bằng:
```text
- **Free is a trial plan:** it can be used for **10 days**, counted from the first time the app registers the trial with our server (usually the first time you open the app with a network connection). **Each machine gets one trial only**: uninstalling and reinstalling the app, or deleting its data, does not restart the trial. When the trial ends you need a paid plan to keep translating.
- Both paid plans have the same Pro features (glossary, history, transcript export) and differ in quota and term.
- A paid plan is an **order paid in advance** (Monthly 30 days, Yearly 365 days) in VND by VietQR bank transfer (PayOS). **It does not renew automatically.** When it expires the app returns to the Free plan if the machine is still within its trial; after the trial you cannot translate until you buy again.
- **Buying more of the same plan** adds the plan's days (30 days for Monthly, 365 days for Yearly). **Changing plan** while you still have time: the remaining days of the old plan are converted by price per day into days of the new plan (rounded down), and the new plan starts immediately with a new cycle; the app shows the converted days and the new expiry date beforehand. **Plan changes are not refunded.**
```

- [ ] **Step 4: Mục 4**

Tìm:
```text
- Each key can be activated on up to **2 machines**. Re-activating the same machine does not use another slot. You can deactivate a machine to use another.
```
Thay bằng:
```text
- Each key can be used on **1 machine** only. Re-activating the same machine does not count as a new machine. To switch machines, remove the key from the old machine (or remove the old machine from the new one), then activate the new machine.
- If a key is activated on a second machine while the other machine still holds it, the key is **temporarily locked on both machines** until one of them removes the key. During that time the paid plan cannot be used on either machine.
```

- [ ] **Step 4b: Section 4, temporary-lock sentence**

Tìm:
```text
If you deactivate and activate other machines too often within 30 days (roughly more than 3 times) the key may be **temporarily locked**; contact us to unlock it.
```
Thay bằng:
```text
If you deactivate and activate other machines too often within 30 days (roughly 5 removals) the key may be **temporarily locked**; contact us to unlock it.
```

- [ ] **Step 5: Kiểm**

Run: `grep -nE "Professional|X2|X5|2 machines|10 minutes|30-day order" docs/legal/eula.en.md`
Expected: không in dòng nào.

- [ ] **Step 6: Commit**

```bash
git add docs/legal/eula.en.md
git commit -m "docs(legal): EULA en 1.1, three plans, 10-day trial per machine, one machine per key

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 11: Chính sách quyền riêng tư (vi, en)

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md` (mục 2, 3, 4, 5, 7, phiên bản)

- [ ] **Step 1: privacy.vi.md, phiên bản và tóm tắt**

Tìm:
```text
**Phiên bản 1.0, hiệu lực từ 06/10/2026.**
```
Thay bằng:
```text
**Phiên bản 1.1, hiệu lực từ 07/10/2026.**
```

Tìm:
```text
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói), thông tin đơn hàng, license và mã nhận diện máy đã băm, để cấp key và kiểm tra bản quyền.
```
Thay bằng:
```text
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói), thông tin đơn hàng, license và mã nhận diện máy đã băm, để cấp key, kiểm tra bản quyền và bảo đảm mỗi máy chỉ dùng thử gói Free một lần.
```

- [ ] **Step 2: privacy.vi.md, mục 3 và 4**

Tìm:
```text
| Khóa mã hóa lịch sử, token bản quyền, bộ đếm hạn mức |
```
Thay bằng:
```text
| Khóa mã hóa lịch sử, token bản quyền, token dùng thử, bộ đếm hạn mức |
```

Tìm:
```text
3. **Làm việc với license server** của chúng tôi (`api.aitranslator.io.vn`): khi mua gói, kích hoạt,
```
Thay bằng:
```text
3. **Làm việc với license server** của chúng tôi (`api.aitranslator.io.vn`): khi đăng ký dùng thử Free (lần đầu mở ứng dụng, ngay sau khi bạn đồng ý điều khoản; gửi mã băm của ID máy), khi mua gói, kích hoạt,
```

- [ ] **Step 3: privacy.vi.md, mục 5**

Tìm:
```text
Chỉ khi bạn dùng gói trả phí (hoặc kích hoạt key), máy chủ lưu:
```
Thay bằng:
```text
Máy chủ lưu các dữ liệu dưới đây. Dòng "Dùng thử Free" áp cho mọi máy đã mở ứng dụng có mạng; các dòng còn lại chỉ khi bạn mua gói hay kích hoạt key:
```

Tìm:
```text
| Máy đã kích hoạt: **mã băm** của ID máy, tên máy (`device_label`) và lần kiểm tra bản quyền gần nhất | Giới hạn 2 máy mỗi key, chống lạm dụng, giúp bạn nhận ra máy khi cần gỡ |
```
Thay bằng:
```text
| Dùng thử Free: **mã băm** của ID máy, lúc bắt đầu và lúc hết dùng thử, lần ứng dụng gọi gần nhất | Mỗi máy chỉ dùng thử 10 ngày một lần, kể cả khi cài lại ứng dụng |
| Máy đã kích hoạt: **mã băm** của ID máy, tên máy (`device_label`) và lần kiểm tra bản quyền gần nhất | Mỗi key chỉ dùng trên một máy, chống lạm dụng, giúp bạn nhận ra máy khi cần gỡ |
```

Tìm:
```text
Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi **không lưu gì** về bạn trên máy chủ.
```
Thay bằng:
```text
Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên: không có email, tên máy hay thông tin nào khác của bạn.
```

- [ ] **Step 4: privacy.vi.md, mục 7**

Tìm:
```text
(dữ liệu bí danh, chỉ để chống lạm dụng: giới hạn 2 máy, khóa tạm khi đổi máy quá nhiều, dùng lại đúng kích hoạt khi bạn kích hoạt lại cùng máy);
```
Thay bằng:
```text
(dữ liệu bí danh, chỉ để chống lạm dụng: mỗi key một máy, khóa tạm khi đổi máy quá nhiều, dùng lại đúng kích hoạt khi bạn kích hoạt lại cùng máy, mỗi máy chỉ dùng thử Free một lần);
```

- [ ] **Step 5: privacy.en.md, phiên bản và tóm tắt**

Tìm:
```text
**Version 1.0, effective 6 October 2026.
```
Thay bằng:
```text
**Version 1.1, effective 7 October 2026.
```

Tìm:
```text
- Our servers only store your **email** (when you buy a plan), order details, your license and a hashed machine identifier, in order to issue keys and check licenses.
```
Thay bằng:
```text
- Our servers only store your **email** (when you buy a plan), order details, your license and a hashed machine identifier, in order to issue keys, check licenses and make sure each machine gets the Free trial only once.
```

- [ ] **Step 6: privacy.en.md, mục 3 và 4**

Tìm:
```text
| History encryption key, license token, usage counters |
```
Thay bằng:
```text
| History encryption key, license token, trial token, usage counters |
```

Tìm:
```text
3. **Talk to our license server** (`api.aitranslator.io.vn`): when you buy a plan, activate or deactivate,
```
Thay bằng:
```text
3. **Talk to our license server** (`api.aitranslator.io.vn`): when registering the Free trial (the first time you open the app, right after you accept the terms; this sends a hash of the machine ID), when you buy a plan, activate or deactivate,
```

- [ ] **Step 7: privacy.en.md, mục 5**

Tìm:
```text
Only if you use a paid plan (or activate a key), our servers store:
```
Thay bằng:
```text
Our servers store the data below. The "Free trial" row applies to every machine that has opened the app with a network connection; the other rows only apply when you buy a plan or activate a key:
```

Tìm:
```text
| Activated machines: a **hash** of the machine ID, the computer name (`device_label`) and the last license check | Enforce the 2-machine limit, prevent abuse, help you recognize a machine to remove |
```
Thay bằng:
```text
| Free trial: a **hash** of the machine ID, when the trial started and ends, the app's last call | Each machine gets the 10-day trial only once, even after reinstalling the app |
| Activated machines: a **hash** of the machine ID, the computer name (`device_label`) and the last license check | Enforce one machine per key, prevent abuse, help you recognize a machine to remove |
```

Tìm:
```text
If you only use the Free plan and never buy or activate a key, we store **nothing** about you on our servers.
```
Thay bằng:
```text
If you only use the Free plan and never buy or activate a key, we store only the "Free trial" row above: no email, computer name or any other information about you.
```

- [ ] **Step 8: privacy.en.md, mục 7**

Tìm:
```text
(pseudonymous data, only to prevent abuse: the 2-machine limit, the temporary lock for excessive machine switching, reusing the correct activation when you re-activate the same machine);
```
Thay bằng:
```text
(pseudonymous data, only to prevent abuse: one machine per key, the temporary lock for excessive machine switching, reusing the correct activation when you re-activate the same machine, one Free trial per machine);
```

- [ ] **Step 9: Kiểm**

Run: `grep -nE "2 máy|2-machine|không lưu gì|store \*\*nothing\*\*|1\.0" docs/legal/privacy.vi.md docs/legal/privacy.en.md`
Expected: không in dòng nào.

- [ ] **Step 10: Commit**

```bash
git add docs/legal/privacy.vi.md docs/legal/privacy.en.md
git commit -m "docs(legal): chính sách quyền riêng tư 1.1, bảng dùng thử Free theo máy, mỗi key một máy

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 12: README pháp lý, runbook phát hành, runbook nghiệm thu; chạy test

**Files:**
- Modify: `docs/legal/README.md` (dòng 3, 18, 31), `docs/release/phat-hanh.md` (dòng 206), `bench/phase1/acceptance/RUNBOOK-mac.md` (dòng 39)

- [ ] **Step 1: docs/legal/README.md**

Tìm:
```text
**Phiên bản 1.0, hiệu lực từ 2026-10-06**, dùng để phát hành (chủ dự án duyệt và yêu cầu bản chính thức ngày 2026-10-06).
```
Thay bằng:
```text
**Phiên bản 1.1, hiệu lực từ 2026-10-07**, dùng để phát hành. Bản 1.0 (2026-10-06) do chủ dự án duyệt; bản 1.1 sửa phần gói theo spec `2026-10-07-three-plans-single-device-design.md` (ba gói, dùng thử Free theo máy, mỗi key một máy).
```

Tìm:
```text
- Bốn gói, giá và hạn mức; đơn 30 ngày trả trước, không tự gia hạn; đổi gói không hoàn tiền; 2 máy mỗi key; khóa tạm khi đổi máy quá nhiều; ngoại tuyến 14 ngày.
```
Thay bằng:
```text
- Ba gói (từ 2026-10-07): Free dùng thử 10 ngày mỗi máy, 30 phút mỗi ngày; Monthly 50.000 đ, 50 giờ mỗi chu kỳ 30 ngày; Yearly 500.000 đ, không giới hạn, 365 ngày. Đơn trả trước, không tự gia hạn; đổi gói quy đổi theo giá mỗi ngày, không hoàn tiền; mỗi key một máy, trùng máy thì tạm khóa cả hai; khóa tạm khi đổi máy quá nhiều; ngoại tuyến 14 ngày.
```

Tìm:
```text
giới hạn 2 máy và khóa tạm (§10.2);
```
Thay bằng:
```text
mỗi key một máy và khóa tạm (§6.8, §10.2); bảng `trials` của dùng thử Free (§10.1);
```

- [ ] **Step 2: docs/release/phat-hanh.md, câu giữ chỗ dải số đơn**

Tìm:
```text
'none', 'pro', 0, 'VND'
```
Thay bằng:
```text
'none', 'monthly', 0, 'VND'
```

- [ ] **Step 3: bench/phase1/acceptance/RUNBOOK-mac.md**

Tìm:
```text
nhập key để có Professional.
```
Thay bằng:
```text
nhập key để có gói trả phí (Monthly hoặc Yearly).
```

- [ ] **Step 4: Kiểm và chạy test văn bản pháp lý**

Run:
```bash
grep -nE "Bốn gói|2 máy mỗi key|giới hạn 2 máy" docs/legal/README.md
grep -n "'pro'" docs/release/phat-hanh.md
grep -n "Professional" bench/phase1/acceptance/RUNBOOK-mac.md
pnpm exec vitest run src/lib/legal.test.ts
```
Expected: ba lệnh grep không in dòng nào; Vitest `Test Files  1 passed`, mọi test pass.

- [ ] **Step 5: Commit**

```bash
git add docs/legal/README.md docs/release/phat-hanh.md bench/phase1/acceptance/RUNBOOK-mac.md
git commit -m "docs: README pháp lý 1.1, runbook phát hành và nghiệm thu theo mã gói mới

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

# Phần C: triển khai production và thử tay

**Điều kiện vào:** kế hoạch 01 và 02 đã thực thi xong trên `main`; phần A, B đã commit; `git status` sạch.

**Ai chạy lệnh:** auto mode chặn agent đọc D1 production, deploy production và dùng token OAuth của wrangler (memory "Sự cố cron license server 2026-10-07"). Mọi khối lệnh có ghi **[chủ dự án]** do chủ dự án chạy: trong Claude Code gõ `! <lệnh>` để kết quả vào hội thoại, hoặc chạy trong Terminal riêng rồi dán kết quả. Agent đọc kết quả, so với Expected, ghi biên bản.

**Hằng dùng trong phần C:**
- `PROD=https://api.aitranslator.io.vn` (Worker `mt-license`, route `custom_domain`, `docs/release/phat-hanh.md` mục 6).
- `PADMIN=https://mt-license-admin.dotienphong1993.workers.dev` (Worker admin sau Cloudflare Access).
- D1: `mt-license-production`. Mọi lệnh `wrangler` chạy trong `server/`.

## Task 13: Kiểm trước khi triển khai (chỉ đọc)

**Files:**
- Create: `bench/phase1/results/ba_goi_production_deploy.md`

- [ ] **Step 1: Bộ kiểm cục bộ** (agent chạy)

Run:
```bash
cd server && pnpm check && cd ..
cargo test --workspace && pnpm test && pnpm build
```
Expected: tất cả xanh. `pnpm check` gồm `vectors:check` và `dry-run` (không chạm production). Đỏ thì dừng, quay lại kế hoạch 01 hay 02.

- [ ] **Step 2: Kiểm migration và cấu hình sẽ deploy** (agent chạy)

Run:
```bash
ls server/migrations
grep -n '"PLANS"' -A3 server/wrangler.jsonc
grep -n '"TRIAL_DAYS"' server/wrangler.jsonc
```
Expected: có `0001_init.sql` và đúng một file `0002_*.sql`; `PLANS` có `monthly` (3000, 30, 50000) và `yearly` (null, 365, 500000); `TRIAL_DAYS` là `10`.

- [ ] **Step 3: Đọc dữ liệu production** **[chủ dự án]**

```bash
cd server
pnpm exec wrangler d1 migrations list mt-license-production --remote
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT plan, COUNT(*) AS n FROM licenses GROUP BY plan"
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT plan, status, COUNT(*) AS n FROM orders GROUP BY plan, status"
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT license_id, COUNT(*) AS active FROM activations WHERE deactivated_at IS NULL GROUP BY license_id HAVING COUNT(*) >= 2"
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT order_code, plan, status, created_at FROM orders WHERE status IN ('pending', 'processing', 'underpaid')"
```

Expected và cách xử lý:
- `migrations list`: chỉ `0002_*.sql` là chưa áp. Có file khác chưa áp thì dừng, báo controller.
- Bảng `licenses`, `orders`: ghi lại số dòng theo mã gói, để so sau migration.
- **License có từ 2 máy đang kích hoạt:** mong đợi không có dòng nào. Có dòng nào thì license đó sẽ xung đột ngay sau deploy. Hỏi chủ dự án máy nào giữ key, rồi gỡ máy kia bằng admin (Step 4).
- **Đơn đang chờ** (`pending`, `processing`, `underpaid`): mong đợi không có dòng nào. Đơn `pending` hay `processing` thì chờ hết hạn (cron đối soát coi là hết hạn sau 24 giờ) hoặc tới khi trả xong, rồi chạy lại Step 3. Đơn `underpaid` thì hỏi chủ dự án xử lý trước (cấp tay hay hoàn tiền). Lý do: migration đổi `pro_x2` (150.000 đ) thành `monthly`, nên đơn cũ còn mở mà được trả sau migration sẽ cấp sai gói.

- [ ] **Step 3b: So cột bảng production với `0001`, ghi mốc Time Travel** **[chủ dự án]**

Migration dựng lại bốn bảng nên cột nào thêm tay ngoài migration sẽ mất. So cột của production với `server/migrations/0001_init.sql`:
```bash
for t in licenses activations deactivations orders; do
  pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info('$t')"
done
```
Expected: mỗi bảng đúng các cột của `0001` (không dư, không thiếu). Có cột lạ thì dừng, báo controller. Ghi mốc Time Travel (`wrangler d1 time-travel info mt-license-production`) vào biên bản để khôi phục khi cần (Task 15).

Khuyến nghị (nếu chủ dự án muốn chắc hơn): xuất dữ liệu production (`wrangler d1 export mt-license-production --remote --output <file>`), nhập vào một D1 tạm, chạy `0002` ở đó và so số dòng; xóa D1 tạm sau khi xong. Việc này kiểm được cả bộ đếm `sqlite_sequence` trên D1 thật mà test miniflare không kiểm.

- [ ] **Step 4: Gỡ máy thừa (chỉ khi Step 3 có license ≥ 2 máy)** **[chủ dự án]**

Lấy `activation_id` của máy cần gỡ:
```bash
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT id, device_label, last_validated_at FROM activations WHERE license_id = '<license_id ở Step 3>' AND deactivated_at IS NULL"
```
Gỡ bằng admin (gỡ admin không tính vào luật khóa tạm):
```bash
cloudflared access login "$PADMIN"
cloudflared access curl "$PADMIN/admin/activations/<id máy cần gỡ>/deactivate" -X POST -H 'content-type: application/json' -d '{"note":"trước migration ba gói: mỗi key một máy"}'; echo
```
Expected: `{"ok":true}` hay JSON không có `error`. Chạy lại câu đếm máy ở Step 3: không còn dòng nào.

- [ ] **Step 5: Mở biên bản** (agent ghi)

Tạo `bench/phase1/results/ba_goi_production_deploy.md`:
```markdown
# Triển khai ba gói và mỗi key một máy lên production

Spec: `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-07-ba-goi-03-tai-lieu-trien-khai.md`.

## Trước triển khai (Task 13)
- Commit `main`: <kết quả `git rev-parse --short HEAD`>
- Bộ kiểm cục bộ: <số test server, Rust, Vitest; kết quả `pnpm check`>
- Migration chưa áp: <kết quả `migrations list`>
- `licenses` theo gói: <bảng kết quả>
- `orders` theo gói và trạng thái: <bảng kết quả>
- License có từ 2 máy đang kích hoạt: <không có / danh sách, đã gỡ máy nào>
- Đơn đang chờ: <không có / cách đã xử lý>
```
Điền mỗi `<…>` bằng kết quả thật vừa có ở Step 1–4, không để trống.

- [ ] **Step 6: Commit**

```bash
git add bench/phase1/results/ba_goi_production_deploy.md
git commit -m "bench(phase1): kiểm production trước khi triển khai ba gói

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 14: ĐIỂM DỪNG — xin chủ dự án cho phép

- [ ] **Step 1: Hỏi và chờ**

Gửi cho chủ dự án đúng nội dung sau (thay phần trong ngoặc nhọn bằng số thật ở Task 13), rồi **dừng, không làm gì thêm** cho tới khi có câu trả lời:

> Sẵn sàng triển khai ba gói lên production. Các bước sẽ chạy:
> 1. Ghi mốc Time Travel của D1 `mt-license-production` để lùi được.
> 2. Áp migration `0002`: đổi {N} license và {M} đơn sang mã `monthly`/`yearly` (`pro`, `pro_x2` → `monthly`; `pro_x5` → `yearly`), thêm bảng `trials`.
> 3. Deploy Worker `mt-license` (API) rồi `mt-license-admin`.
> 4. Kiểm `/v1/plans`, `/v1/trial` (tạo rồi xóa một dòng thử), cron.
>
> Từ lúc deploy, bản app dev đang cài sẽ không đọc được token mới (mã gói mới) và về Free cho tới khi build lại. Anh/chị đồng ý chạy không?

- [ ] **Step 2: Xử lý câu trả lời**

- Đồng ý: sang Task 15.
- Không đồng ý hay muốn lùi lịch: ghi vào biên bản "Chưa triển khai, lý do: <câu trả lời>", commit, dừng kế hoạch ở đây.

## Task 15: Migration và deploy

- [ ] **Step 1: Ghi mốc Time Travel** **[chủ dự án]**

```bash
cd server
pnpm exec wrangler d1 time-travel info mt-license-production
```
Expected: in `bookmark` hiện tại. Agent chép bookmark vào biên bản (bookmark không phải bí mật).

- [ ] **Step 2: Áp migration** **[chủ dự án]**

```bash
pnpm exec wrangler d1 migrations apply mt-license-production --remote
pnpm exec wrangler d1 migrations list mt-license-production --remote
```
Expected: lệnh đầu báo áp `0002_*.sql` thành công; lệnh sau báo không còn migration chưa áp.

- [ ] **Step 3: Kiểm dữ liệu sau migration** **[chủ dự án]**

```bash
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT plan, COUNT(*) AS n FROM licenses GROUP BY plan"
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT plan, COUNT(*) AS n FROM orders GROUP BY plan"
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT COUNT(*) AS n FROM trials"
pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
```
Expected: chỉ còn `monthly`, `yearly`; tổng số dòng mỗi bảng bằng tổng ở Task 13 Step 3 (`monthly` = số `pro` + `pro_x2` cũ, `yearly` = số `pro_x5` cũ); `trials` là `0`; `foreign_key_check` không trả dòng nào.

Sai một trong các điều trên thì **không deploy**: lùi D1 bằng Step 6, báo controller.

- [ ] **Step 4: Deploy Worker API** **[chủ dự án]**

```bash
pnpm check && pnpm exec wrangler deploy
curl -s https://api.aitranslator.io.vn/v1/health; echo
```
Expected: `Uploaded mt-license`, `Deployed mt-license triggers`, `schedule: */5 * * * *`; `curl` in `{"ok":true}`.

- [ ] **Step 5: Deploy Worker admin** **[chủ dự án]**

```bash
pnpm exec wrangler deploy -c wrangler.admin.jsonc
curl -s -o /dev/null -w '%{http_code}\n' "https://mt-license-admin.dotienphong1993.workers.dev/admin/whoami"
```
Expected: `Uploaded mt-license-admin`; mã HTTP `302`, `401` hoặc `403`, không bao giờ `200`.

- [ ] **Step 6: Đường lui (chỉ khi Step 3 sai hoặc Step 4, 5 lỗi)** **[chủ dự án]**

```bash
pnpm exec wrangler rollback --name mt-license
pnpm exec wrangler rollback --name mt-license-admin
pnpm exec wrangler d1 time-travel restore mt-license-production --bookmark=<bookmark ở Step 1>
```
Lùi Worker trước, D1 sau: Worker cũ chỉ ghi được mã gói cũ, nên không được chạy Worker cũ trên D1 mới lâu hơn cần thiết. Chạy `rollback` cho Worker nào đã deploy ở bước này. Sau khi lùi, chạy lại các câu đọc ở Task 13 Step 3 để xác nhận về trạng thái cũ, ghi biên bản, báo controller.

## Task 16: Kiểm sau deploy

- [ ] **Step 1: Bảng gói** **[chủ dự án]**

```bash
curl -s https://api.aitranslator.io.vn/v1/plans; echo
```
Expected (đúng thứ tự):
```json
{"plans":[{"code":"monthly","name":"Monthly","quota_minutes_per_cycle":3000,"days_per_order":30,"prices":{"VND":50000}},{"code":"yearly","name":"Yearly","quota_minutes_per_cycle":null,"days_per_order":365,"prices":{"VND":500000}}]}
```

- [ ] **Step 2: Dùng thử với máy giả, gọi hai lần** **[chủ dự án]**

```bash
H=$(printf %s ba-goi-deploy-check-2026-10-07 | shasum -a 256 | cut -d' ' -f1)
R1=$(curl -s -X POST https://api.aitranslator.io.vn/v1/trial -H 'content-type: application/json' -d "{\"device_id_hash\":\"$H\"}")
sleep 2
R2=$(curl -s -X POST https://api.aitranslator.io.vn/v1/trial -H 'content-type: application/json' -d "{\"device_id_hash\":\"$H\"}")
node -e '
const [a, b] = process.argv.slice(1).map((s) => JSON.parse(s));
const claims = JSON.parse(Buffer.from(a.token.split(".")[1], "base64url").toString());
console.log({
  typ: claims.typ,
  same_device: claims.device_id_hash === process.argv[3],
  days: (a.ends_at - a.started_at) / 86400,
  same_start: a.started_at === b.started_at,
  kid: claims.kid,
});
' "$R1" "$R2" "$H"
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.aitranslator.io.vn/v1/trial -H 'content-type: application/json' -d '{"device_id_hash":"khong-phai-hex"}'
```
Expected: `{ typ: 'trial', same_device: true, days: 10, same_start: true, kid: 'prod-…' }` (kid trùng kid đang ký ở `server/keys/public-keys.json`, ô `TOKEN_SIGNING_SLOT`); lệnh cuối in `400`.

- [ ] **Step 3: Xóa dòng thử** **[chủ dự án]**

```bash
pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM trials WHERE device_id_hash = '$H'"
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT COUNT(*) AS n FROM trials WHERE device_id_hash = '$H'"
```
Expected: `n` là `0`. (Chạy trong cùng shell với Step 2 để còn biến `H`; mở shell mới thì tính lại `H` bằng dòng đầu của Step 2.)

- [ ] **Step 4: Cron** **[chủ dự án]**

```bash
pnpm exec wrangler tail mt-license --format pretty
```
Để chạy qua một mốc 5 phút (tối đa 6 phút), rồi Ctrl+C. Expected: một sự kiện cron `*/5 * * * *` có log `{"event":"reconcile",…}`. Không thấy thì:
```bash
pnpm exec wrangler triggers deploy
pnpm exec wrangler tail mt-license --format pretty
```
và kiểm lại qua một mốc 5 phút (sự cố 2026-10-07, `docs/release/phat-hanh.md` mục 4 bước 9).

- [ ] **Step 5: Admin còn chạy, tra license** **[chủ dự án]**

```bash
cloudflared access login "https://mt-license-admin.dotienphong1993.workers.dev"
cloudflared access curl "https://mt-license-admin.dotienphong1993.workers.dev/admin/whoami"; echo
cloudflared access curl "https://mt-license-admin.dotienphong1993.workers.dev/admin/lookup" -X POST -H 'content-type: application/json' -d '{"email":"<email chủ dự án đã dùng khi mua>"}'; echo
```
Expected: `{"operator":"<email của bạn>"}`; kết quả tra có license với `plan` là `monthly` hay `yearly` và danh sách máy đang kích hoạt (theo kế hoạch 01, kèm thông tin xung đột). Không dán email hay key vào biên bản: agent chỉ ghi "tra cứu đạt, plan = …, số máy đang kích hoạt = …".

- [ ] **Step 6: Ghi biên bản và commit** (agent)

Thêm vào `bench/phase1/results/ba_goi_production_deploy.md`:
```markdown
## Triển khai (Task 15, 16)
- Ngày giờ deploy (UTC): <giờ in ra ở lệnh `wrangler deploy`>
- Bookmark Time Travel trước migration: <bookmark>
- Migration: <tên file 0002 đã áp>; sau migration `licenses` theo gói: <bảng>, `orders` theo gói: <bảng>, `trials`: 0, `foreign_key_check`: rỗng
- Deploy API: <Uploaded/Deployed, schedule>; `/v1/health`: <kết quả>
- Deploy admin: <Uploaded>; `/admin/whoami` không đăng nhập: <mã HTTP>
- `/v1/plans`: <khớp / khác ở đâu>
- `/v1/trial`: typ, ngày, gọi lại giữ `started_at`, `400` khi sai dạng: <kết quả>; dòng thử đã xóa
- Cron: <thấy sự kiện reconcile lúc … / phải `triggers deploy`>
- Admin: whoami <đạt>, tra cứu <đạt, plan, số máy>
```
Điền bằng kết quả thật.

```bash
git add bench/phase1/results/ba_goi_production_deploy.md
git commit -m "bench(phase1): biên bản triển khai ba gói lên production

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 17: Ngày hiệu lực văn bản pháp lý, build lại app dev

- [ ] **Step 1: Sửa ngày hiệu lực nếu deploy không phải ngày 07/10/2026** (agent)

Run: `date +%F`
Nếu in `2026-10-07` thì bỏ qua step này. Nếu khác, chạy (ngày lấy theo giờ máy lúc deploy, cùng ngày với Task 15):
```bash
VI=$(date +%d/%m/%Y); EN="$(date +%-d) $(LC_ALL=C date +%B) $(date +%Y)"; ISO=$(date +%F)
sed -i '' "s|hiệu lực từ 07/10/2026|hiệu lực từ $VI|" docs/legal/eula.vi.md docs/legal/privacy.vi.md
sed -i '' "s|effective 7 October 2026|effective $EN|" docs/legal/eula.en.md docs/legal/privacy.en.md
sed -i '' "s|hiệu lực từ 2026-10-07|hiệu lực từ $ISO|" docs/legal/README.md
grep -n "hiệu lực từ\|effective" docs/legal/*.md
pnpm exec vitest run src/lib/legal.test.ts
git add docs/legal
git commit -m "docs(legal): ngày hiệu lực 1.1 theo ngày triển khai

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```
Expected: `grep` in ngày mới ở cả năm file; Vitest pass.

- [ ] **Step 2: Build và mở bản dev** **[chủ dự án]**

Trong Terminal riêng (script giữ Terminal tới khi thoát app):
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator
scripts/run-dev-app.sh
```
Expected: app mở. Vì app đã qua onboarding và chưa có token dùng thử, app đăng ký dùng thử lúc khởi động (§6.8, "Dùng thử Free"). Kiểm **[chủ dự án]**:
```bash
cd server && pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT started_at, ends_at, ends_at - started_at AS secs FROM trials ORDER BY started_at DESC LIMIT 3"
```
Expected: một dòng mới với `secs` = `864000`.

## Task 18: Thử tay trên Mac

Mỗi bước do chủ dự án làm trên bản dev vừa build; agent ghi kết quả "đạt / không đạt / chưa thử" vào biên bản, kèm ảnh chụp nếu có. Bước không đạt thì ghi hiện tượng, không tự sửa trong kế hoạch này.

- [ ] **Step 1: Gói đang có sau migration**

Cài đặt › Bản quyền: gói hiện `Monthly` (hay `Yearly`) với ngày hết hạn như trước migration; màn hình chính hiện hạn mức chu kỳ (Monthly) hay "Không giới hạn" (Yearly). App đã gọi `validate` nên có token mới mang mã gói mới.

- [ ] **Step 2: Free và dùng thử**

Ghi lại key trước (email mua hàng có key). Cài đặt › Bản quyền › Gỡ kích hoạt. Expected: màn hình chính hiện "Dùng thử: còn 10 ngày · Hôm nay còn X phút", với X = 30 trừ số phút đã dịch hôm nay (kể cả phút dịch lúc còn gói trả phí); bắt đầu và dừng được một phiên Free.

- [ ] **Step 3: Xóa token dùng thử, dùng thử không reset**

Thoát app (menu bar › Thoát). Tra tên mục kho khóa của token dùng thử:
```bash
grep -n 'pub const' src-tauri/src/license/store.rs
```
Lấy giá trị hằng của token dùng thử (do kế hoạch 02 thêm, cạnh `LICENSE`, `SEEN`, `FREE`). Rồi **[chủ dự án]**:
```bash
security delete-generic-password -s com.aitranslator.desktop -a <giá trị hằng đó>
```
Expected: `password has been deleted.` Mở lại app bằng `scripts/run-dev-app.sh`: màn hình chính vẫn "Dùng thử: còn 10 ngày" (hay 9 nếu đã qua nửa ngày), **không** tăng lại; câu đếm `trials` ở Task 17 Step 2 vẫn chỉ có một dòng cho máy này.

- [ ] **Step 4: Kích hoạt lại, xem số ngày quy đổi khi đổi gói (không trả tiền)**

Nhập lại key. Expected: kích hoạt ngay, không hỏi gì (cùng máy dùng lại activation cũ). Mở Nâng cấp: thấy đúng ba gói, Monthly 50.000 đ / 30 ngày, Yearly 500.000 đ / 365 ngày. Đang ở Monthly thì chọn Yearly, nhập email, tick đồng ý: app hiện số ngày quy đổi và ngày hết hạn mới. Agent tính đối chiếu:
`floor(số_giây_còn_lại × 50000 × 365 / (500000 × 30 × 86400))` (đổi Monthly → Yearly), với số giây còn lại = `expires_at` − giờ tạo đơn. Số app hiện phải bằng số tính được. **Không quét mã**; để link hết hạn sau 15 phút. Chủ dự án muốn thử trả thật thì đó là giao dịch 500.000 đ, chỉ làm khi họ tự quyết.

- [ ] **Step 5: Xung đột, bằng một "máy thứ hai" giả** **[chủ dự án]**

Chạy trong Terminal riêng, gõ key bằng `read -s` để key không hiện lên màn hình hay lịch sử:
```bash
read -s KEY
H2=$(printf %s ba-goi-may-thu-hai-2026-10-07 | shasum -a 256 | cut -d' ' -f1)
curl -s -X POST https://api.aitranslator.io.vn/v1/licenses/activate -H 'content-type: application/json' -d "{\"key\":\"$KEY\",\"device_id_hash\":\"$H2\",\"device_label\":\"Máy thử xung đột\"}"; echo
curl -s -X POST https://api.aitranslator.io.vn/v1/licenses/activate -H 'content-type: application/json' -d "{\"key\":\"$KEY\",\"device_id_hash\":\"$H2\",\"device_label\":\"Máy thử xung đột\",\"allow_conflict\":true}"; echo
unset KEY
```
Expected: lần đầu `{"error":"key_in_use","devices":[…máy Mac…]}`; lần hai `{"error":"license_conflict","devices":[…2 máy…]}`.

Trên app: Cài đặt › Bản quyền › bấm "Thử lại" (hay chờ tối đa 15 phút). Expected: báo "Key đang dùng trên 2 máy nên đã bị tạm khóa", liệt kê Mac và "Máy thử xung đột"; gói trả phí không dùng được, máy theo Free (dòng dùng thử hiện lại). Bắt đầu một phiên khi đang xung đột thì chạy ở Free (30 phút/ngày).

Bấm "Gỡ máy kia". Expected: app về gói trả phí, hết báo xung đột. Lần gỡ này tính 1 vào luật khóa tạm (khóa khi số lần gỡ máy khác lớn hơn 2 trong 30 ngày).

- [ ] **Step 6: Kiểm nhanh lúc bắt đầu phiên (tùy chọn, cần chờ 1 giờ)**

Chỉ làm khi chủ dự án có thời gian. Sau hơn 1 giờ kể từ lần `validate` gần nhất, lặp lại hai lệnh `curl` ở Step 5 để tạo xung đột, rồi bấm Bắt đầu trên app. Expected: phiên bắt đầu, rồi dừng trong vài giây với lý do `license_conflict`. Gỡ "Máy thử xung đột" từ app như Step 5. Lần gỡ này tính thêm 1 vào luật khóa tạm.

- [ ] **Step 7: Ghi biên bản và commit** (agent)

Thêm vào `bench/phase1/results/ba_goi_production_deploy.md`:
```markdown
## Thử tay Mac (Task 18)
| Bước | Kết quả | Ghi chú |
|---|---|---|
| 1. Gói sau migration | <đạt/không đạt/chưa thử> | <gói, ngày hết hạn> |
| 2. Free và dùng thử | <…> | <số ngày, số phút hiện> |
| 3. Xóa token dùng thử không reset | <…> | <số ngày sau khi mở lại> |
| 4. Kích hoạt lại, số ngày quy đổi | <…> | <số app hiện, số tính được> |
| 5. Xung đột và gỡ máy kia | <…> | <hai mã lỗi curl; màn hình app> |
| 6. Kiểm nhanh lúc bắt đầu phiên | <…> | <…> |
```
Điền bằng kết quả thật; bước chưa làm ghi "chưa thử".

```bash
git add bench/phase1/results/ba_goi_production_deploy.md
git commit -m "bench(phase1): thử tay Mac ba gói, dùng thử Free, xung đột key

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

## Task 19: Cập nhật bộ nhớ dự án

**Files:**
- Modify: `~/.claude/projects/-Users-dtphong-Desktop-software-business-ai-translator/memory/three-plans-single-device-2026-10-07.md`
- Modify: `~/.claude/projects/-Users-dtphong-Desktop-software-business-ai-translator/memory/MEMORY.md`

- [ ] **Step 1: Thay dòng trạng thái spec trong file memory**

Trong `three-plans-single-device-2026-10-07.md`, tìm dòng bắt đầu bằng `- Spec: \`docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md\``. Giữ nguyên dòng đó và thêm ngay dưới:
```markdown
- Kế hoạch `docs/superpowers/plans/2026-10-07-ba-goi-0{0,1,2,3}-*.md`. Spec gốc, EULA, privacy (1.1) đã sửa theo; production: <đã triển khai ngày … (bookmark D1 …), biên bản `bench/phase1/results/ba_goi_production_deploy.md` / chưa triển khai, lý do …>. Thử tay Mac: <các bước đạt, các bước chưa thử>.
```
Điền phần trong ngoặc nhọn bằng kết quả thật của Task 14–18.

- [ ] **Step 2: Sửa dòng chỉ mục trong MEMORY.md**

Tìm dòng bắt đầu bằng `- [Ba gói, mỗi key một máy](three-plans-single-device-2026-10-07.md)`, thay đoạn cuối `; spec 0b7d246` bằng `; spec 0b7d246; production <đã triển khai ngày … / chưa triển khai>`.

- [ ] **Step 3: Kiểm**

Run: `grep -n "Ba gói" ~/.claude/projects/-Users-dtphong-Desktop-software-business-ai-translator/memory/MEMORY.md`
Expected: một dòng, có trạng thái production mới.

(Bộ nhớ nằm ngoài repo: không commit.)

---

## Self-review (tác giả kế hoạch)

- **Phủ spec 2026-10-07:** mục 5.2 → Task 13–16 (kiểm license ≥ 2 máy, thứ tự migration → deploy API → admin → kiểm `/v1/plans`, `/v1/trial`, cron; xin phép ở Task 14). Mục 7 → Task 1–8 (spec gốc: §2, §4.1–§4.3, §6.8, §9, §10.1, §10.2, §11; thêm §3.3 A7, §5, §12, §13, §15), Task 9–10 (EULA), Task 11 (privacy, bổ sung), Task 19 (bộ nhớ). Mục 8 → Task 7 Step 8. Mục 9 phần thử tay → Task 18.
- **Không placeholder trong văn bản sửa:** mọi khối Tìm/Thay là văn bản đầy đủ. Ngoặc nhọn chỉ còn ở biên bản (Task 13, 16, 18, 19) và lệnh admin cần dữ liệu chỉ có lúc chạy (`<license_id>`, `<email>`, `<bookmark>`, tên hằng kho khóa do kế hoạch 02 đặt), mỗi chỗ có lệnh để lấy giá trị đó.
- **Nhất quán với kế hoạch 00:** mã `monthly`/`yearly`, tên `Monthly`/`Yearly`, `POST /v1/trial` trả `{token, started_at, ends_at, issued_at}`, `typ: "trial"`, `409 key_in_use`/`license_conflict` kèm `devices`, `allow_conflict`, `503 trial_not_configured`, `TRIAL_DAYS` = 10.
