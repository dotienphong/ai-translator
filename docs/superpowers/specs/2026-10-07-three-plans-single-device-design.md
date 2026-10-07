# AI Translator: ba gói (Free dùng thử, Monthly, Yearly) và mỗi key một máy — Design

**Ngày:** 2026-10-07
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-07. Cùng ngày, chủ dự án đổi Free từ 30 ngày, 20 phút/ngày thành **10 ngày, 30 phút/ngày**.
**Quan hệ với spec gốc:** bổ sung và **thay thế** mọi chỗ của `2026-09-29-desktop-meeting-translator-design.md` nói về bốn gói (P1, bảng gói ở §2), hạn mức Free 10 phút, "mỗi key tối đa 2 máy" (P2, §6.8, §9, §10.1, §10.2), và công thức đổi gói. Phần còn lại của spec gốc giữ nguyên. Khi thực hiện, spec gốc được sửa theo spec này (mục 7) để hai file không mâu thuẫn. Các kế hoạch trong `docs/superpowers/plans/` viết trước ngày này là lịch sử, không viết lại.

---

## 1. Quyết định

1. **Ba gói** thay cho bốn gói:

   | Mã gói | Tên hiển thị | Hạn mức dịch | Thời hạn | Giá |
   |---|---|---|---|---|
   | `free` | Free | 30 phút mỗi ngày | 10 ngày dùng thử, mỗi máy một lần | 0 đ |
   | `monthly` | Monthly | 50 giờ (3000 phút) mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |
   | `yearly` | Yearly | Không giới hạn | 365 ngày mỗi đơn | 500.000 đ |

2. **Free là dùng thử 10 ngày, tính từ lần đầu mở app.** Hết 10 ngày thì máy đó không dùng Free được nữa, phải mua gói. Gỡ app rồi cài lại, xóa dữ liệu hay xóa kho khóa đều không mở lại được dùng thử, vì license server ghi ngày bắt đầu theo máy (`device_id_hash`).
3. **Mỗi key chỉ dùng trên 1 máy.** Máy thứ hai kích hoạt cùng key (sau khi người dùng xác nhận) thì key vào trạng thái **xung đột**: cả hai máy bị tạm khóa gói trả phí cho tới khi một máy gỡ key. Máy nào cũng gỡ được key khỏi chính nó, hoặc gỡ máy kia từ xa.
4. **Đổi gói khi còn hạn** quy đổi theo giá mỗi ngày (mục 2.3), vì hai gói có số ngày mỗi đơn khác nhau.

### Giữ nguyên
- Cách đếm phút (chỉ tính phần đã dịch, theo `speech_ms`), luật reset ngày của Free (00:00 giờ máy, cách lần trước ít nhất 20 giờ theo "đồng hồ thật"), và luật "bộ đếm Free của ngày cộng cả phút dịch ở gói trả phí".
- Chu kỳ hạn mức 30 ngày từ `cycle_anchor`, luật `quota_fresh`, `quota_epoch`, bản ghi đánh dấu, "mất bản ghi", chu kỳ cuối ngắn hơn 30 ngày (áp cho Monthly).
- "Từ ngày kích hoạt" của gói trả phí là thời điểm thanh toán (`cycle_anchor`, §6.8 spec gốc). Mua trong app thì app kích hoạt ngay, nên hai mốc trùng nhau.
- Mua thêm cùng gói: cộng số ngày của gói, tính từ max(hiện tại, `expires_at`).
- Luật khóa tạm vì gỡ máy quá nhiều (`423 license_locked`, §10.2 spec gốc).
- Định dạng token `v1`, `kid`, cặp khóa ký A/B.
- Nhắc gia hạn trước 7 ngày và khi đã hết hạn.

### Không làm
- Không có thao tác admin "reset dùng thử" hay kéo dài dùng thử.
- Không chặn dùng thử theo email hay IP.
- Không gói trọn đời, không tự gia hạn (PayOS không có thanh toán định kỳ).

---

## 2. Gói trả phí

### 2.1 Mã gói và bảng giá
- Mã gói `monthly`, `yearly` thay cho `pro`, `pro_x2`, `pro_x5` ở mọi nơi: `server/src/token.ts` (`PLAN_CODES`), `server/src/plans.ts` (`PLAN_NAMES`: `Monthly`, `Yearly`), CHECK của D1, enum `Plan` của app, `purchase.rs` (`PLANS`), giao diện và i18n.
- Biến `PLANS` trong `server/wrangler.jsonc`:
  ```jsonc
  "PLANS": {
    "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30,  "prices": { "VND": 50000 } },
    "yearly":  { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } }
  }
  ```
- `parsePlans` vẫn đòi đúng các mã trong `PLAN_CODES` (nay là hai mã) và `days_per_order` trong [1, 366].
- "Pro" trong spec vẫn là tên chung của các tính năng chỉ có ở gói trả phí (lịch sử, từ điển thuật ngữ, xuất file), áp cho cả Monthly lẫn Yearly.

### 2.2 Số ngày mỗi đơn
Mọi chỗ đang dùng "30 ngày" cho một đơn đổi sang `days_per_order` của gói trong đơn: `computeGrant` (đã dùng), admin `grant_new_license`, admin cấp tay, ước tính `license_expires_at` của checkout, và câu chữ trong giao diện, email ("gia hạn thêm 30 ngày" thành "thêm 30 ngày" hay "thêm 365 ngày" theo gói).

### 2.3 Đổi gói khi còn hạn
Thay công thức của §6.8 spec gốc:

```
ngày_quy_đổi = floor( ngày_còn_lại × (giá_cũ / số_ngày_cũ) / (giá_mới / số_ngày_mới) )
```

- `ngày_còn_lại` = (`expires_at` − hiện tại) / 1 ngày, giữ cả phần lẻ. `giá` lấy theo bảng hiện hành, cùng loại tiền với đơn; `số_ngày` là `days_per_order` của gói trong bảng hiện hành.
- Tính bằng BigInt trên giây để làm tròn xuống chính xác:
  `converted = floor( remaining_secs × giá_cũ × số_ngày_mới / (giá_mới × số_ngày_cũ × 86400) )`.
- `expires_at` = hiện tại + `days_per_order` của gói mới + `ngày_quy_đổi`; `cycle_anchor` = hiện tại. Không hoàn tiền. Các luật khác của đổi gói giữ nguyên.
- Ví dụ lên gói: Monthly còn 20 ngày, mua Yearly: 20 × (50.000/30) / (500.000/365) = 24,33, làm tròn xuống 24 ngày. Yearly chạy 389 ngày.
- Ví dụ xuống gói: Yearly còn 200 ngày, mua Monthly: 200 × (500.000/365) / (50.000/30) = 164,38, làm tròn xuống 164 ngày. Monthly chạy 194 ngày.

### 2.4 Hạn mức
- Monthly: 3000 phút mỗi chu kỳ 30 ngày, mỗi máy (nay chỉ còn một máy mỗi key). Nhắc khi còn 5 phút. Chu kỳ cuối ngắn hơn 30 ngày: `ceil(3000 × số_ngày / 30)` như cũ.
- Yearly: `quota_minutes_per_cycle: null`, không giới hạn. Giao diện ghi "Không giới hạn".

---

## 3. Free: dùng thử 10 ngày theo máy

### 3.1 Server
- **Bảng mới** (migration `0002`):
  ```sql
  CREATE TABLE trials (
    device_id_hash TEXT PRIMARY KEY,   -- SHA-256 hex của IOPlatformUUID hoặc MachineGuid, như activations
    started_at INTEGER NOT NULL,       -- lúc server ghi lần đầu (giây Unix)
    ends_at INTEGER NOT NULL,          -- started_at + TRIAL_DAYS ngày; cố định từ lúc tạo
    last_seen_at INTEGER NOT NULL      -- lần gọi gần nhất, để hỗ trợ
  ) WITHOUT ROWID;
  ```
- **Biến cấu hình** `TRIAL_DAYS` (số nguyên, 1–366; production là 10) trong `wrangler.jsonc`. Thiếu hay sai thì `/v1/trial` trả `503 trial_not_configured`. Đổi giá trị chỉ áp cho máy đăng ký sau đó; `ends_at` đã ghi không đổi.
- **Endpoint** `POST /v1/trial` `{device_id_hash}`:
  - `device_id_hash` phải là 64 ký tự hex thường; sai thì `400 invalid_request`.
  - Chưa có dòng thì tạo với `started_at` = giờ server. Đã có thì giữ nguyên `started_at`, `ends_at`, chỉ cập nhật `last_seen_at`. Hai request đồng thời cho cùng máy dùng `INSERT … ON CONFLICT DO NOTHING` rồi đọc lại, nên luôn ra một dòng.
  - Trả `200` `{token, started_at, ends_at, issued_at}`, kể cả khi dùng thử đã hết (app cần `ends_at` để báo).
  - Giới hạn tần suất: ≤ 10 lần/giờ/IP (bucket `trial`, HMAC như các bucket khác). Vượt thì `429` kèm `Retry-After`. Không tính vào bộ đếm thất bại theo IP.
- **Token dùng thử:** cùng định dạng `v1`, cùng khóa ký và `kid` với token bản quyền. Claims:
  ```json
  { "typ": "trial", "kid": "…", "device_id_hash": "…", "started_at": 0, "ends_at": 0, "issued_at": 0 }
  ```
  - Token bản quyền **không có** trường `typ`. Bộ kiểm token bản quyền (server lẫn app) từ chối payload có `typ`; bộ kiểm token dùng thử đòi `typ == "trial"`. Nhờ vậy không dùng nhầm loại này thay loại kia.
  - Token dùng thử không có `expires_at` hay `refresh_before`: hiệu lực của nó là khoảng [`started_at`, `ends_at`), kiểm theo giờ ở mục 3.2.
- **Admin:** trang tra cứu thêm tra theo `device_id_hash`: hiện `started_at`, `ends_at`, `last_seen_at` của dùng thử và các activation của máy đó. Chỉ đọc.

### 3.2 App
- **Đăng ký:** ngay sau khi người dùng đồng ý điều khoản ở lần đầu mở app (bước 1b, §4.1 spec gốc), app gọi `POST /v1/trial` chạy nền. Đăng ký sau bước đồng ý vì request gửi `device_id_hash`. Lỗi mạng không chặn onboarding. "10 ngày tính từ lần đầu mở app" nghĩa là tính từ lần đăng ký thành công đầu tiên (`started_at` theo giờ server); lần đầu mở app mà offline thì mốc lùi tới lần đầu có mạng, thường là ngay bước tải model. Chừng nào chưa có token dùng thử hợp lệ cho máy này, app gọi lại lúc khởi động, theo nhịp kiểm định kỳ mỗi giờ, và khi người dùng bấm Bắt đầu ở gói Free.
- **Lưu:** token dùng thử trong kho khóa (Keychain, Credential Manager `persistence = Local`), mục riêng, không lẫn với token bản quyền. "Xóa toàn bộ dữ liệu" và "Xóa model và dữ liệu" giữ mục này, như giữ trạng thái bản quyền.
- **Kiểm:** token phải đúng chữ ký, `typ == "trial"`, và `device_id_hash` khớp máy này. Token đọc từ kho khóa mà hỏng hay sai máy thì bỏ, rồi đăng ký lại; server trả lại đúng `started_at` cũ.
- **Giờ dùng để so `ends_at`:** `Seen::trusted_now(now)` sẵn có (mốc lớn nhất trong giờ máy, `issued_at` đã ký, header `Date` của server). Mỗi token dùng thử nhận được cũng gọi `observe_signed(issued_at)`. Giờ máy bị coi là chỉnh lùi (`Seen::rolled_back`, dung sai 10 phút) thì Free không bắt đầu phiên được, báo chỉnh lại giờ, giống luật sẵn có cho token.
- **Free dùng được khi** đủ cả bốn điều kiện:
  1. không có gói trả phí đang hiệu lực trên máy;
  2. có token dùng thử hợp lệ của máy này;
  3. `trusted_now < ends_at`, và giờ máy không bị chỉnh lùi;
  4. bộ đếm của ngày còn dưới 30 phút (`FREE_DAILY_MS = 30 × 60_000`).
- **Gói trả phí hết hạn** (hoặc bị gỡ, thu hồi, xung đột) thì máy quay về Free theo đúng bốn điều kiện trên: còn trong 10 ngày dùng thử thì dùng được 30 phút/ngày, hết thì không.
- **Hết dùng thử:** không bắt đầu phiên ở gói Free. Màn hình chính và thanh phụ đề báo "Đã hết 10 ngày dùng thử. Mua gói Monthly hoặc Yearly để tiếp tục dịch", kèm nút Nâng cấp. Đang dịch mà qua `ends_at` thì phiên đang chạy được chạy hết; phiên sau mới bị chặn.
- **Chưa có token mà không có mạng:** không bắt đầu phiên ở gói Free; báo "Cần kết nối mạng một lần để bắt đầu dùng thử".
- **Màn hình chính** ở Free hiện: "Dùng thử: còn N ngày · Hôm nay còn X phút", N = ceil((`ends_at` − `trusted_now`) / 1 ngày).
- **Bản không chính hãng** (§10.2 spec gốc, "chỉ chạy chế độ Free") cũng chịu luật dùng thử này.
- **Công tắc dev** `AI_TRANSLATOR_DEV_PRO` (bản debug) không đổi: bật thì bỏ qua mọi hạn mức như hiện nay.

---

## 4. Mỗi key một máy, trùng máy thì khóa

### 4.1 Server
Gọi "máy đang kích hoạt" là dòng `activations` của license có `deactivated_at IS NULL`. Không thêm cột: **xung đột** là khi license có từ 2 máy đang kích hoạt trở lên.

**`POST /v1/licenses/activate` `{key, device_id_hash, device_label, allow_conflict?}`** (thứ tự kiểm):
1. Các kiểm sẵn có: key, license bị thu hồi hay hết hạn, `503 pricing_not_configured`, giới hạn tần suất, chặn IP.
2. Máy này **đang kích hoạt** với key này:
   - license đang xung đột thì trả `409 license_conflict` kèm `devices`;
   - không thì trả token như hiện nay.
3. Máy này chưa kích hoạt (mới, hoặc đã gỡ): luật khóa tạm (`423 license_locked`) kiểm ở đây như hiện nay.
4. Đếm số máy khác đang kích hoạt, `n`:
   - `n = 0`: kích hoạt (dòng mới, hoặc dùng lại dòng cũ của cùng máy, giữ `activation_id`, `quota_epoch`), trả token.
   - `n = 1` và không có `allow_conflict: true`: trả `409 key_in_use` kèm `devices` (máy đang giữ key). Không đổi gì.
   - `n = 1` và `allow_conflict: true`: kích hoạt máy này (như trên), ghi `audit_log` hành động `license_conflict`, rồi trả `409 license_conflict` kèm `devices` (cả hai máy). Không cấp token.
   - `n ≥ 2`: trả `409 key_in_use` kèm `devices`; bỏ qua `allow_conflict`. Muốn dùng thì phải gỡ bớt máy.
- `devices` có dạng như `409 device_limit` cũ: `activation_id`, `device_label`, thời điểm `validate` gần nhất. Mã `device_limit` bỏ hẳn.

**`POST /v1/licenses/validate` `{key, activation_id}`:**
- activation đã gỡ: như hiện nay (app về Free).
- license đang xung đột: `409 license_conflict` kèm `devices`, không cấp token.
- còn lại: như hiện nay.

**`POST /v1/licenses/deactivate` `{key, activation_id}`:** gỡ một máy đang kích hoạt của key, gọi từ chính máy đó hoặc từ máy khác biết key (gỡ từ xa). Bỏ điều kiện "chỉ gỡ từ xa khi đã đủ máy". Mỗi lần gỡ vẫn ghi vào `deactivations` và tính vào luật khóa tạm như hiện nay. Gỡ xong mà license còn đúng một máy đang kích hoạt thì hết xung đột; `validate` kế tiếp của máy đó nhận token.

**Luật khóa tạm** giữ nguyên câu chữ (đếm lần gỡ do người dùng trong 30 ngày, trừ lần gỡ chính máy đang kích hoạt, `> 3` thì khóa khi một máy chưa kích hoạt xin `activate`). Nó chặn hai người dùng chung key gỡ qua gỡ lại: máy bị gỡ muốn quay lại phải `activate`, và từ lần gỡ thứ 4 trong 30 ngày thì bị `423`.

**Admin:** tra cứu license hiện trạng thái xung đột và danh sách máy đang kích hoạt; gỡ máy bằng thao tác sẵn có.

### 4.2 App
- **Kích hoạt nhận `409 key_in_use`:** hộp thoại liệt kê máy đang giữ key (tên máy, lần dùng gần nhất), hai lựa chọn:
  1. **"Gỡ máy kia và dùng máy này"**: gọi `deactivate` máy kia, rồi `activate` lại. Đây là cách đổi máy bình thường.
  2. **"Vẫn kích hoạt trên máy này"**: hỏi xác nhận với câu "Key sẽ bị tạm khóa trên cả hai máy cho tới khi một máy gỡ key", rồi gọi `activate` với `allow_conflict: true`.
- **Nhận `409 license_conflict`** (từ `activate` hay `validate`): app giữ key và `activation_id` trong kho khóa, xóa token bản quyền đang lưu, chuyển sang trạng thái `conflict`.
  - Gói trả phí và tính năng Pro không dùng được. Máy theo luật Free ở mục 3.2 (còn dùng thử thì được 30 phút/ngày).
  - Màn hình chính và nhóm Cài đặt "Bản quyền" báo "Key đang dùng trên 2 máy nên đã bị tạm khóa", liệt kê hai máy, kèm nút "Gỡ key khỏi máy này", "Gỡ máy kia", "Thử lại".
  - Khi đang ở `conflict` và có mạng, app gọi `validate` mỗi 15 phút. Nhận token thì về trạng thái bình thường.
  - Bộ đếm hạn mức trên máy giữ nguyên.
- **Kiểm nhanh lúc bắt đầu phiên:** khi bắt đầu phiên ở gói trả phí, nếu lần `validate` thành công gần nhất đã quá 1 giờ, app gọi `validate` chạy nền song song với phiên (không làm chậm lúc bắt đầu). Kết quả là `license_conflict`, thu hồi hay gỡ thì dừng phiên với lý do mới `license_conflict` (hay `license_invalid`) và báo như trên. Lỗi mạng thì bỏ qua, phiên chạy tiếp.
- `LicenseError::DeviceLimit` đổi thành `KeyInUse(devices)`; thêm `Conflict(devices)`.

### 4.3 Hạn mức
Vẫn đếm theo từng activation. Xoay key sang máy khác (gỡ máy A, kích hoạt máy B) vẫn cho B bộ đếm mới; luật khóa tạm vẫn giới hạn khoảng 3 lần đổi máy mỗi 30 ngày. Rủi ro này giữ như §10.2 spec gốc.

---

## 5. Dữ liệu và chuyển đổi

### 5.1 Migration D1 `0002`
- SQLite không sửa được CHECK, nên dựng lại hai bảng `licenses` và `orders` với `CHECK (plan IN ('monthly', 'yearly'))`, chép dữ liệu, đổi mã:
  - `pro`, `pro_x2` → `monthly`;
  - `pro_x5` → `yearly`.
  `expires_at`, `cycle_anchor` và các cột khác giữ nguyên. Dùng `PRAGMA defer_foreign_keys = true` trong migration vì `orders` và `activations` tham chiếu `licenses`. Giữ lại mọi index.
- Tạo bảng `trials` (mục 3.1).
- Có test schema: chạy `0001` + dữ liệu mẫu đủ ba mã cũ, rồi `0002`, kiểm mã mới, số dòng, khóa ngoại và index.

### 5.2 Production
- App chưa phát hành bản nào (0.1.0, chưa có tag), nên đổi mã gói và mã lỗi không làm hỏng máy khách nào. Bản dev đang chạy sẽ cần build lại.
- Trước khi chạy migration production, đếm license đang có 2 máy kích hoạt: những license đó sẽ ở trạng thái xung đột ngay sau deploy. Hiện chỉ có license thử của chủ dự án; gỡ bớt máy trước nếu cần.
- Thứ tự: migration D1 production → deploy Worker API và Worker admin → kiểm `GET /v1/plans`, `POST /v1/trial`, cron (`wrangler triggers deploy` nếu cron mất, xem sự cố 2026-10-07) → build app.
- **Chạy migration và deploy production chỉ khi chủ dự án cho phép** ở bước đó.

---

## 6. Lỗi mới (bổ sung §9 spec gốc)

| Tình huống | Cách phát hiện | Cách xử lý |
|---|---|---|
| Free chưa đăng ký dùng thử, không có mạng | Không có token dùng thử, `/v1/trial` lỗi mạng | Không bắt đầu phiên; báo "Cần kết nối mạng một lần để bắt đầu dùng thử" |
| Hết 10 ngày dùng thử | `trusted_now ≥ ends_at` | Không bắt đầu phiên ở Free; báo đã hết dùng thử, nút Nâng cấp |
| Hết hạn mức Free trong ngày | Bộ đếm ngày đạt 30 phút | Như luật `quota_exhausted` cũ |
| Key đang dùng ở máy khác | `activate` trả `409 key_in_use` | Hộp thoại "Gỡ máy kia" hoặc "Vẫn kích hoạt" (mục 4.2) |
| Key đang xung đột | `activate`/`validate` trả `409 license_conflict` | Trạng thái `conflict` (mục 4.2); đang dịch thì dừng phiên với lý do `license_conflict` |
| `/v1/trial` trả `429` hay `503` | Mã lỗi | Coi như lỗi tạm, thử lại theo nhịp mục 3.2; không báo lỗi riêng nếu chưa cần bắt đầu phiên |

Dòng "Key đã kích hoạt đủ 2 máy" của §9 spec gốc bỏ; dòng "Hết hạn mức" đổi "Free: 10 phút" thành "Free: 30 phút", "Professional, X2" thành "Monthly".

---

## 7. Tài liệu phải sửa

- **Spec gốc:**
  - §2: P1, P2 và bảng gói.
  - §4.1: đăng ký dùng thử sau bước 1b.
  - §4.2: hạn mức Free và Monthly; Yearly không giới hạn.
  - §4.3: màn hình chính hiện số ngày dùng thử còn lại; Nâng cấp hiện ba gói và thời hạn từng gói; Bản quyền hiện trạng thái xung đột.
  - §6.8: bảng giá, công thức đổi gói, API (`/v1/trial`, `activate`, `validate`, `deactivate`, mã `key_in_use`, `license_conflict`), "Hạn mức" (Free dùng thử), admin.
  - §9: theo mục 6.
  - §10.1: app gửi `device_id_hash` khi đăng ký dùng thử; server lưu bảng `trials` (mã băm ID máy và mốc thời gian, không email), giữ không thời hạn như dữ liệu khác; thao tác xóa theo email không chạm bảng này.
  - §10.2: bảng mối đe dọa (dòng "Chia sẻ hoặc bán lại key", "Dò key hoặc spam" thêm `trial ≤ 10/giờ/IP`), và rủi ro chấp nhận ở mục 8.
  - §11: test mới (mục 9).
- **EULA** `docs/legal/eula.vi.md`, `docs/legal/eula.en.md`: mô tả ba gói, dùng thử 10 ngày mỗi máy, mỗi key một máy và việc tạm khóa khi trùng máy. Nội dung pháp lý còn chờ chủ dự án như trước; spec này chỉ sửa phần mô tả gói.
- **Bộ nhớ dự án:** ghi quyết định thay cho "4 gói" đã chốt ngày 2026-10-01.

---

## 8. Rủi ro chấp nhận

- **Cài lại Windows** làm `MachineGuid` đổi, nên máy được dùng thử lại. Trên Mac, IOPlatformUUID không đổi khi cài lại hệ điều hành.
- **Sửa app để gửi `device_id_hash` giả** thì được dùng thử mới. Lớp kiểm app chính hãng (§10.2 spec gốc) chỉ giới hạn phần nào; bản ad-hoc trên Mac yếu hơn (spec 2026-10-05).
- **Chỉnh giờ khi offline:** đã chặn chỉnh lùi (`rolled_back`). Giữ giờ máy đứng yên (luôn đặt về cùng một ngày, không kết nối mạng) thì kéo dài được dùng thử, vì `trusted_now` không tăng. Chấp nhận, vì app cần mạng để cập nhật và tải model, và phần lợi chỉ là 30 phút mỗi ngày.
- **Xóa sạch dữ liệu trên máy** vẫn mở lại 30 phút của ngày hôm đó (luật "mất bản ghi" của Free chỉ chạy khi app còn dữ liệu cũ), nhưng không mở lại được 10 ngày dùng thử.
- **Máy đang giữ key mà offline** thì chưa biết mình bị khóa: vẫn dùng token cũ tới `refresh_before`, tối đa 14 ngày. Có mạng thì khóa có tác dụng trong vòng 1 giờ dùng (mục 4.2) hay 24 giờ (kiểm định kỳ).
- **Người dùng chung key gỡ máy của chủ key từ xa:** chủ key gỡ lại được; luật khóa tạm dừng việc này sau khoảng 3 lần gỡ mỗi 30 ngày, rồi phải liên hệ hỗ trợ.

---

## 9. Kiểm thử

- **Server (Vitest):**
  - `parsePlans` với bảng mới; từ chối thiếu hay thừa mã.
  - `computeGrant`: hai ví dụ ở mục 2.3; cùng gói Yearly cộng 365 ngày; làm tròn xuống chính xác với giá trị biên; license hết hạn mua gói khác.
  - `/v1/trial`: lần đầu tạo, gọi lại giữ `started_at`, gọi đồng thời ra một dòng, dùng thử đã hết vẫn trả `200`, `device_id_hash` sai dạng, `429`, `503 trial_not_configured`, token có `typ: "trial"` và đúng chữ ký.
  - Token: bộ kiểm token bản quyền từ chối payload có `typ`; vector `token-v1.json` sinh lại với mã gói mới, thêm vector token dùng thử.
  - `activate`: `n = 0`; dùng lại dòng cũ của cùng máy; `409 key_in_use` không đổi dữ liệu; `allow_conflict` tạo xung đột và ghi `audit_log`; máy thứ ba nhận `key_in_use`; máy đang kích hoạt trong lúc xung đột nhận `license_conflict`; `423` vẫn chạy trước luật một máy.
  - `validate` khi xung đột; `deactivate` tự gỡ và gỡ từ xa khi xung đột, sau đó máy còn lại nhận token.
  - Luật khóa tạm với chuỗi gỡ qua gỡ lại giữa hai máy: lần `activate` sau lần gỡ thứ 4 trong 30 ngày nhận `423`.
  - Migration `0002` (mục 5.1).
  - Admin: tra theo `device_id_hash`, `grant_new_license` dùng `days_per_order`.
- **App (Rust):**
  - Đăng ký dùng thử: lưu, đọc lại, token sai máy hay sai `typ` bị bỏ, lỗi mạng không chặn onboarding.
  - Bốn điều kiện của Free; hết dùng thử; chỉnh giờ lùi; `FREE_DAILY_MS` 30 phút; gói trả phí hết hạn trong và sau thời gian dùng thử.
  - `key_in_use`, `license_conflict`, thử lại 15 phút, kiểm nhanh lúc bắt đầu phiên dừng phiên khi xung đột, lỗi mạng không dừng.
  - Enum `Plan` với `monthly`, `yearly`; token có mã gói cũ bị coi là sai dạng.
- **Giao diện (Vitest):** màn hình Nâng cấp với ba gói và thời hạn; dòng dùng thử ở màn hình chính; hộp thoại `key_in_use`; trạng thái xung đột; i18n vi/en đủ khóa.
- **Thử tay (Mac, sau khi deploy):** máy mới đăng ký dùng thử; gỡ app, cài lại vẫn đúng số ngày; mua Monthly, đổi sang Yearly xem số ngày quy đổi; kích hoạt key trên máy thứ hai (hoặc máy ảo) để thấy xung đột và gỡ từ xa.
