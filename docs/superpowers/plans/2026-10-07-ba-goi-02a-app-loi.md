# Ba gói và mỗi key một máy · 02a: App — lõi Rust

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Đưa ba gói và luật mỗi key một máy vào lõi Rust của app (`src-tauri/`):
- mã gói `monthly`, `yearly`; token bản quyền có `typ` là sai dạng;
- Free 30 phút mỗi ngày, chỉ trong 10 ngày dùng thử: token dùng thử `typ: "trial"` do `POST /v1/trial` cấp, lưu trong kho khóa, luật Free bốn điều kiện;
- `409 key_in_use`, "Vẫn kích hoạt" (`allow_conflict`), trạng thái xung đột, `validate` lại mỗi 15 phút;
- lỗi bắt đầu phiên mới (`trialEnded`, `trialNeedsNetwork`, `clockRolledBack`), lệnh `start_trial`, kiểm nhanh lúc bắt đầu phiên trả phí, dừng phiên với `licenseConflict` hay `licenseInvalid`.

Giao diện nằm ở **02b** (`2026-10-07-ba-goi-02b-app-giao-dien.md`). Làm Task 1–7 của 02a, rồi 02b Task 1–4, rồi Task 8–9 của 02a (khối `Home.tsx` của Task 8 dựa vào 02b Task 3).

**Kiến trúc:** Giữ cách chia module của kế hoạch 06 (`src-tauri/src/license/`). Thêm `trial.rs` (kiểm token dùng thử, dùng chung phần đọc token và kiểm chữ ký với `token.rs`). `manager.rs` (không phụ thuộc Tauri) giữ toàn bộ luật: dùng thử, xung đột, kiểm nhanh; `app.rs` nối vào Tauri: lỗi bắt đầu phiên, lệnh, ticker, dừng phiên qua `session::abort`. Test dùng server giả (`FakeApi`), kho khóa giả và token ký bằng khóa test của bộ vector chung với server.

**Công nghệ:** Rust 1.98.1, Tauri 2.12.1 như hiện có. Không thêm crate nào; `Cargo.lock` không đổi.

**Spec:** `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md` mục 1, 2.4, 3.2, 4.2, 6, 9. Tổng quan và hợp đồng server–app: `docs/superpowers/plans/2026-10-07-ba-goi-00-tong-quan.md`.

---

## Trạng thái đầu và cách đọc

- **Làm trên `main` sau khi kế hoạch 01 (server) đã thực thi xong.** 02a cần file vector `server/test/vectors/token-v1.json` do 01 Task 1 sinh lại (mã gói mới, khóa `trial`); các task khác của 01 chỉ đụng `server/`. Trước mỗi task, `git status` phải sạch.
- **Cây tham chiếu:** nhánh `ref-bg02` ở `/Users/dtphong/Desktop/software_business/meeting-translator-work/bg02-repo`, dựng trên `d0f9b30` + commit Task 1 của 01 (`c93eb7d` của `ref-bg01`, ở cây này là `ad1f3fe`). Mỗi task là đúng một commit (bảng dưới). Code trong kế hoạch lấy nguyên từ diff của các commit đó, đã qua `cargo fmt`.
- **Khối code:** "`<file>`: thay … bằng …" là thay đúng một chỗ (khối cũ có đủ dòng ngữ cảnh để chỉ khớp một chỗ trong file lúc làm task đó). "Tạo `<file>`" là chép nguyên khối vào file mới. Trong một task, làm các khối của Step 1 trước, chạy test thấy đỏ, rồi mới làm các khối của Step 3.
- **Lệnh** chạy ở gốc repo. Build Rust dùng chung `target/` của repo; không chạy hai bản build Rust lớn cùng lúc.
- **Số test:** dòng `test result` đầu tiên của `cargo test -p meeting-translator` là của lib (`meeting_translator_lib`); hai dòng sau (`main.rs`, doc-test) là 0 test.

## Hợp đồng dùng ở kế hoạch này (từ kế hoạch 00)

- `POST /v1/trial` `{device_id_hash}` → `200 {token, started_at, ends_at, issued_at}`; lỗi `400 invalid_request`, `429` (có `Retry-After`), `503 trial_not_configured`.
- Token dùng thử: `{"typ": "trial", "kid", "device_id_hash", "started_at", "ends_at", "issued_at"}`, định dạng `v1`, cùng khóa ký. Token bản quyền không có `typ`.
- `activate` nhận `allow_conflict` (chỉ gửi khi `true`). `409 key_in_use` và `409 license_conflict` mang danh sách máy ở `devices` (phần tử `{activation_id, device_label|null, last_validated_at}`). `409 license_conflict` của `activate` có thêm `activation_id` của chính máy gọi. `validate` có thể trả `409 license_conflict`. `deactivate` gỡ được mọi máy đang kích hoạt của key.

## Quyết định của kế hoạch này

- **QĐ1. Máy này trong `409 license_conflict`** (controller chốt 2026-10-07, hợp đồng 00 sửa theo): `activate` trả `409 license_conflict` có thêm `activation_id` của chính máy gọi. "Vẫn kích hoạt" gọi `activate` một lần với `allow_conflict: true` và lưu `activation_id` từ body. Response thiếu trường này là sai hợp đồng: báo `licenseServer`, không lưu gì. `validate` dùng `activation_id` đã lưu. `ApiError::Server` đóng hộp (`Box<ServerError>`) vì trường mới làm `ServerError` vượt ngưỡng 128 byte của clippy `result_large_err`.
- **QĐ2. Xung đột lưu ở bản ghi license**, không thêm mục kho khóa: `verdict: "conflict"`, token rỗng, `devices` là danh sách máy, để mở lại app khi offline vẫn hiện được trạng thái và danh sách.
- **QĐ3. Free chặn khi giờ máy bị chỉnh lùi** (mới: trước đây Free vẫn bắt đầu được phiên). Theo spec 2026-10-07 §3.2, vì hạn dùng thử so theo giờ tin được.
- **QĐ4. Phiên đang chạy không bị dừng vì dùng thử hết** (spec §3.2). Gói trả phí hết hạn giữa phiên thì phút dịch tiếp theo tính vào bộ đếm Free của ngày như trước; dùng thử chỉ xét lúc bắt đầu phiên.
- **QĐ5. Kiểm nhanh** chạy sau khi phiên đã sang `Starting` (gọi trong `session::start_with`), để kết quả về sớm vẫn gặp đúng phiên đó. `validate` cho thấy gói không còn dùng được thì dừng phiên chỉ khi ngay trước đó máy đang có gói trả phí; lần thử lại mỗi 15 phút lúc đang xung đột không dừng phiên Free.
- **QĐ6. Lệnh:** thêm đúng một lệnh `start_trial` (đồng bộ, không chờ server, không đụng kho khóa trên luồng gọi). `activate_license` thêm tham số `allowConflict`, `deactivate_other_device` cho `key` tùy chọn, thay vì thêm lệnh mới.
- **QĐ7. Server giả mặc định có dùng thử** còn hiệu lực tới `T0 + 3650` ngày, `issued_at` lùi 400 ngày trước `T0`, để test cũ (kể cả test của app dùng giờ thật) không phải sửa.

## Bảng task → commit tham chiếu (`ref-bg02`)

| Task | Commit | Việc |
|---|---|---|
| 1 | `efdd52b` | Mã gói `monthly`, `yearly`; token có `typ` là sai dạng |
| 2 | `4dce0fc` | Free 30 phút mỗi ngày |
| 3 | `05293e8` | Token dùng thử (`trial.rs`) |
| 4 | `e4e6a69` | Client: `/v1/trial`, `allow_conflict`, `devices` |
| 5 | `fe8c45b` | Free theo dùng thử 10 ngày |
| 6 | `3295194` | Mỗi key một máy, xung đột |
| 7 | `1202bf7` | Nối vào app |
| 8 | `afe1577` | Sửa sau review cuối |
| 9 | (không commit) | Bộ kiểm cuối |

---

## Task 1: Mã gói `monthly`, `yearly`; token bản quyền có `typ` là sai dạng

Commit tham chiếu: `efdd52b`.

Sau kế hoạch 01, `server/test/vectors/token-v1.json` có mã gói `monthly`, `yearly`, hai vector mới (`license_with_typ`,
`old_plan_code`, đều `malformed`) và khóa gốc `trial`. App phải đọc đúng bộ vector đó: đổi enum `Plan`, đổi mã gói ở mọi
nơi trong `src-tauri/`, và từ chối token bản quyền có trường `typ` (spec 2026-10-07 §3.1). Số liệu hạn mức trong các
test (`1800` phút) giữ nguyên: chỉ là số của test, không phải giá trị của gói.

Hash SHA-256 trong `the_vector_file_is_the_agreed_one` là hash của file vector do 01 Task 1 sinh (commit `c93eb7d` của cây
`ref-bg01`). Nếu lúc thực thi 01 sinh ra file khác (sửa sau review), lấy lại bằng
`shasum -a 256 server/test/vectors/token-v1.json` và thay vào; số vector bản quyền (`32`) đếm bằng
`node -e 'console.log(require("./server/test/vectors/token-v1.json").tokens.length)'`.

**Files:**
- Test: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/license/client.rs`
- Modify: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/license/purchase.rs`
- Modify: `src-tauri/src/license/quota.rs`
- Modify: `src-tauri/src/license/store.rs`
- Modify: `src-tauri/src/license/token.rs` (enum `Plan`, từ chối `typ`, hash và số vector)

- [ ] **Step 1: Viết test trước**

`src-tauri/src/app_tests.rs`: thay

```rust
    let now = crate::license::app::now();
    let claims = json!({
        "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": now,
        "device_id_hash": DEVICE, "plan": "pro_x2", "expires_at": now + 30 * 86_400, "cycle_anchor": now,
        "quota_minutes_per_cycle": 6000, "quota_epoch": 0, "quota_fresh": true,
        "issued_at": now, "refresh_before": now + 14 * 86_400,
    });
    api.replies.lock().unwrap().push_back(granted(&claims, true));
    license.activate(KEY, now).unwrap();
    crate::license::app::refresh(app.handle());
    let last = views.lock().unwrap().last().cloned().unwrap();
    assert_eq!(last["plan"], "pro_x2");
    let text = last.to_string();
    assert!(text.contains("••••-••••-••••-••••-••••-••••-RST5"), "{text}");
    assert!(!text.contains(&sign(&claims)[..20]), "không có token");
```

bằng

```rust
    let now = crate::license::app::now();
    let claims = json!({
        "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": now,
        "device_id_hash": DEVICE, "plan": "yearly", "expires_at": now + 365 * 86_400, "cycle_anchor": now,
        "quota_minutes_per_cycle": null, "quota_epoch": 0, "quota_fresh": true,
        "issued_at": now, "refresh_before": now + 14 * 86_400,
    });
    api.replies.lock().unwrap().push_back(granted(&claims, true));
    license.activate(KEY, now).unwrap();
    crate::license::app::refresh(app.handle());
    let last = views.lock().unwrap().last().cloned().unwrap();
    assert_eq!(last["plan"], "yearly");
    let text = last.to_string();
    assert!(text.contains("••••-••••-••••-••••-••••-••••-RST5"), "{text}");
    assert!(!text.contains(&sign(&claims)[..20]), "không có token");
```

`src-tauri/src/app_tests.rs`: thay

```rust
    let mut order = PendingOrder {
        order_code: 7,
        order_token: "tok".into(),
        plan: "pro".into(),
        expires_at: crate::license::app::now() + 900,
        renewal: false,
        checkout_url: "https://pay.payos.vn/web/abc".into(),
```

bằng

```rust
    let mut order = PendingOrder {
        order_code: 7,
        order_token: "tok".into(),
        plan: "monthly".into(),
        expires_at: crate::license::app::now() + 900,
        renewal: false,
        checkout_url: "https://pay.payos.vn/web/abc".into(),
```

`src-tauri/src/app_tests.rs`: thay

```rust
    let order = PendingOrder {
        order_code: 7,
        order_token: "tok".into(),
        plan: "pro".into(),
        expires_at: crate::license::app::now() + 900,
        renewal: false,
        checkout_url: "https://pay.payos.vn/web/abc".into(),
```

bằng

```rust
    let order = PendingOrder {
        order_code: 7,
        order_token: "tok".into(),
        plan: "monthly".into(),
        expires_at: crate::license::app::now() + 900,
        renewal: false,
        checkout_url: "https://pay.payos.vn/web/abc".into(),
```

`src-tauri/src/license/client.rs`: thay

```rust
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"token":"v1.a.b","activation_id":"act","activation_created_at":1,"plan":"pro","expires_at":2,"cycle_anchor":1,"quota_minutes_per_cycle":1800,"quota_epoch":0,"quota_fresh":true,"refresh_before":3}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.activate("KEY", "ab12", Some("Máy của Phong"));
```

bằng

```rust
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"token":"v1.a.b","activation_id":"act","activation_created_at":1,"plan":"monthly","expires_at":2,"cycle_anchor":1,"quota_minutes_per_cycle":1800,"quota_epoch":0,"quota_fresh":true,"refresh_before":3}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.activate("KEY", "ab12", Some("Máy của Phong"));
```

`src-tauri/src/license/client.rs`: thay

```rust
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"order_code":12,"status":"paid","plan":"pro","amount":50000,"currency":"VND","expires_at":9,"license_key":"0123-4567-89AB-CDEF-GHJK-MNPQ-RST5","license_plan":"pro","license_expires_at":99,"grant_kind":"new"}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.order(12, "tok-1").result.unwrap();
```

bằng

```rust
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"order_code":12,"status":"paid","plan":"monthly","amount":50000,"currency":"VND","expires_at":9,"license_key":"0123-4567-89AB-CDEF-GHJK-MNPQ-RST5","license_plan":"monthly","license_expires_at":99,"grant_kind":"new"}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.order(12, "tok-1").result.unwrap();
```

`src-tauri/src/license/client.rs`: thay

```rust

    #[test]
    fn checkout_sends_consent_and_the_key_only_when_renewing() {
        let body = r#"{"order_code":7,"order_token":"t","checkout_url":"https://pay.payos.vn/web/x","qr_code":"000201","plan":"pro","amount":50000,"currency":"VND","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body), (201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        assert_eq!(api.checkout("pro", "a@b.vn", None).result.unwrap().order_code, 7);
        api.checkout("pro", "a@b.vn", Some("KEY")).result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "plan": "pro", "email": "a@b.vn", "consent": true })
        );
        assert_eq!(reqs[1].body["license_key"], "KEY");
    }
```

bằng

```rust

    #[test]
    fn checkout_sends_consent_and_the_key_only_when_renewing() {
        let body = r#"{"order_code":7,"order_token":"t","checkout_url":"https://pay.payos.vn/web/x","qr_code":"000201","plan":"monthly","amount":50000,"currency":"VND","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body), (201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        assert_eq!(api.checkout("monthly", "a@b.vn", None).result.unwrap().order_code, 7);
        api.checkout("monthly", "a@b.vn", Some("KEY")).result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "plan": "monthly", "email": "a@b.vn", "consent": true })
        );
        assert_eq!(reqs[1].body["license_key"], "KEY");
    }
```

`src-tauri/src/license/manager.rs`: thay

```rust
        format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()))
    }

    /// Claims của một license Professional, kích hoạt lúc `T0`, cấp lúc `issued_at`.
    pub fn claims(issued_at: i64) -> Value {
        json!({
            "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": T0,
            "device_id_hash": DEVICE, "plan": "pro", "expires_at": T0 + 30 * DAY, "cycle_anchor": T0,
            "quota_minutes_per_cycle": 1800, "quota_epoch": 0, "quota_fresh": false,
            "issued_at": issued_at, "refresh_before": issued_at + 14 * DAY,
        })
```

bằng

```rust
        format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()))
    }

    /// Claims của một license Monthly (hạn mức 1800 phút cho gọn số), kích hoạt lúc `T0`, cấp lúc `issued_at`.
    pub fn claims(issued_at: i64) -> Value {
        json!({
            "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": T0,
            "device_id_hash": DEVICE, "plan": "monthly", "expires_at": T0 + 30 * DAY, "cycle_anchor": T0,
            "quota_minutes_per_cycle": 1800, "quota_epoch": 0, "quota_fresh": false,
            "issued_at": issued_at, "refresh_before": issued_at + 14 * DAY,
        })
```

`src-tauri/src/license/manager.rs`: thay

```rust
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.key.as_deref()),
            (Standing::Active, "pro", Some("••••-••••-••••-••••-••••-••••-RST5"))
        );
        assert_eq!(
            (v.quota.limit_ms, v.quota.remaining_ms, v.quota.lost),
```

bằng

```rust
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.key.as_deref()),
            (Standing::Active, "monthly", Some("••••-••••-••••-••••-••••-••••-RST5"))
        );
        assert_eq!(
            (v.quota.limit_ms, v.quota.remaining_ms, v.quota.lost),
```

`src-tauri/src/license/purchase.rs`: thay

```rust
            order_token: "tok".into(),
            checkout_url: "https://pay.payos.vn/web/abc".into(),
            qr_code: "00020101021238570010A000000727012700069704220113VQRQAA".into(),
            plan: "pro".into(),
            amount: 50_000,
            currency: "VND".into(),
            expires_at: T0 + 900,
```

bằng

```rust
            order_token: "tok".into(),
            checkout_url: "https://pay.payos.vn/web/abc".into(),
            qr_code: "00020101021238570010A000000727012700069704220113VQRQAA".into(),
            plan: "monthly".into(),
            amount: 50_000,
            currency: "VND".into(),
            expires_at: T0 + 900,
```

`src-tauri/src/license/purchase.rs`: thay

```rust
        OrderStatus {
            order_code: 7,
            status: status.into(),
            plan: "pro".into(),
            expires_at: T0 + 900,
            license_key: key.map(String::from),
            license_plan: Some("pro".into()),
            license_expires_at: Some(T0 + 30 * 86_400),
            grant_kind: kind.map(String::from),
        }
```

bằng

```rust
        OrderStatus {
            order_code: 7,
            status: status.into(),
            plan: "monthly".into(),
            expires_at: T0 + 900,
            license_key: key.map(String::from),
            license_plan: Some("monthly".into()),
            license_expires_at: Some(T0 + 30 * 86_400),
            grant_kind: kind.map(String::from),
        }
```

`src-tauri/src/license/purchase.rs`: thay

```rust
    fn a_checkout_needs_consent_a_valid_email_and_a_paid_plan() {
        let (api, _, l) = setup();
        assert_eq!(
            start(&l, "pro", "a@b.vn", false, false),
            Err(LicenseError::ConsentRequired)
        );
        assert_eq!(
            start(&l, "pro", "khong-co-a-cong", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert_eq!(
            start(&l, "pro", "a b@c.vn", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert!(start(&l, "free", "a@b.vn", true, false).is_err());
        assert_eq!(
            start(&l, "pro", "a@b.vn", true, true),
            Err(LicenseError::NotActivated),
            "gia hạn cần key đã kích hoạt"
        );
```

bằng

```rust
    fn a_checkout_needs_consent_a_valid_email_and_a_paid_plan() {
        let (api, _, l) = setup();
        assert_eq!(
            start(&l, "monthly", "a@b.vn", false, false),
            Err(LicenseError::ConsentRequired)
        );
        assert_eq!(
            start(&l, "monthly", "khong-co-a-cong", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert_eq!(
            start(&l, "monthly", "a b@c.vn", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert!(start(&l, "free", "a@b.vn", true, false).is_err());
        assert_eq!(
            start(&l, "monthly", "a@b.vn", true, true),
            Err(LicenseError::NotActivated),
            "gia hạn cần key đã kích hoạt"
        );
```

`src-tauri/src/license/purchase.rs`: thay

```rust
    fn a_new_order_draws_the_qr_and_is_kept_for_polling() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        let view = start(&l, "pro", " a@b.vn ", true, false).unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout pro a@b.vn -");
        assert!(view.qr_svg.contains("<svg") && view.qr_svg.contains("</svg>"));
        let kept = pending(&l).unwrap();
        assert_eq!(
```

bằng

```rust
    fn a_new_order_draws_the_qr_and_is_kept_for_polling() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        let view = start(&l, "monthly", " a@b.vn ", true, false).unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout monthly a@b.vn -");
        assert!(view.qr_svg.contains("<svg") && view.qr_svg.contains("</svg>"));
        let kept = pending(&l).unwrap();
        assert_eq!(
```

`src-tauri/src/license/purchase.rs`: thay

```rust
    fn a_paid_new_order_activates_its_key_on_this_machine() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().extend([
            Ok(order("pending", None, None)),
            Ok(order("paid", Some("new"), Some(KEY))),
```

bằng

```rust
    fn a_paid_new_order_activates_its_key_on_this_machine() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().extend([
            Ok(order("pending", None, None)),
            Ok(order("paid", Some("new"), Some(KEY))),
```

`src-tauri/src/license/purchase.rs`: thay

```rust
            poll(&l, T0 + 6),
            Some(OrderOutcome::Paid {
                order_code: 7,
                plan: "pro".into()
            })
        );
        assert!(l.is_pro(T0 + 6));
```

bằng

```rust
            poll(&l, T0 + 6),
            Some(OrderOutcome::Paid {
                order_code: 7,
                plan: "monthly".into()
            })
        );
        assert!(l.is_pro(T0 + 6));
```

`src-tauri/src/license/purchase.rs`: thay

```rust
            ("new", "activate 1111111111111111111111111Z0V"),
        ] {
            api.checkouts.lock().unwrap().push_back(Ok(checkout(8)));
            start(&l, "pro_x2", "a@b.vn", true, true).unwrap();
            assert!(
                api.calls
                    .lock()
```

bằng

```rust
            ("new", "activate 1111111111111111111111111Z0V"),
        ] {
            api.checkouts.lock().unwrap().push_back(Ok(checkout(8)));
            start(&l, "yearly", "a@b.vn", true, true).unwrap();
            assert!(
                api.calls
                    .lock()
```

`src-tauri/src/license/purchase.rs`: thay

```rust
        for (status, outcome, done) in cases {
            let (api, _, l) = setup();
            api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
            start(&l, "pro", "a@b.vn", true, false).unwrap();
            api.orders.lock().unwrap().push_back(Ok(order(status, None, None)));
            assert_eq!(poll(&l, T0 + 3), Some(outcome), "{status}");
            assert_eq!(pending(&l).is_none(), done, "{status}");
```

bằng

```rust
        for (status, outcome, done) in cases {
            let (api, _, l) = setup();
            api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
            start(&l, "monthly", "a@b.vn", true, false).unwrap();
            api.orders.lock().unwrap().push_back(Ok(order(status, None, None)));
            assert_eq!(poll(&l, T0 + 3), Some(outcome), "{status}");
            assert_eq!(pending(&l).is_none(), done, "{status}");
```

`src-tauri/src/license/purchase.rs`: thay

```rust
        // Link đã hết hạn mà server vẫn báo `pending`: đơn không thành.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().push_back(Ok(order("pending", None, None)));
        assert_eq!(poll(&l, T0 + 901), Some(OrderOutcome::Failed { order_code: 7 }));
        // Lỗi mạng: hỏi tiếp, tới 24 giờ sau khi link hết hạn.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
        assert!(matches!(poll(&l, T0 + 3600), Some(OrderOutcome::Waiting { .. })));
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
```

bằng

```rust
        // Link đã hết hạn mà server vẫn báo `pending`: đơn không thành.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().push_back(Ok(order("pending", None, None)));
        assert_eq!(poll(&l, T0 + 901), Some(OrderOutcome::Failed { order_code: 7 }));
        // Lỗi mạng: hỏi tiếp, tới 24 giờ sau khi link hết hạn.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
        assert!(matches!(poll(&l, T0 + 3600), Some(OrderOutcome::Waiting { .. })));
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
```

`src-tauri/src/license/purchase.rs`: thay

```rust
    fn a_paid_order_whose_key_cannot_be_activated_here_reports_why() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders
            .lock()
            .unwrap()
```

bằng

```rust
    fn a_paid_order_whose_key_cannot_be_activated_here_reports_why() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
        api.orders
            .lock()
            .unwrap()
```

`src-tauri/src/license/quota.rs`: thay

```rust
            activation_id: "act".into(),
            activation_created_at: T0,
            device_id_hash: "dev".into(),
            plan: Plan::Pro,
            expires_at: T0 + 60 * DAY_SECS,
            cycle_anchor: T0,
            quota_minutes_per_cycle: Some(1800),
```

bằng

```rust
            activation_id: "act".into(),
            activation_created_at: T0,
            device_id_hash: "dev".into(),
            plan: Plan::Monthly,
            expires_at: T0 + 60 * DAY_SECS,
            cycle_anchor: T0,
            quota_minutes_per_cycle: Some(1800),
```

`src-tauri/src/license/quota.rs`: thay

```rust
        c.expires_at = T0 + CYCLE_SECS + 6 * DAY_SECS + 1;
        assert_eq!(cycle(&c).limit_ms, Some(234 * MIN), "ceil(1000 × 7 / 30) = 234");
        c.quota_minutes_per_cycle = None;
        assert_eq!(cycle(&c).limit_ms, None, "X5 không giới hạn");
    }

    #[test]
```

bằng

```rust
        c.expires_at = T0 + CYCLE_SECS + 6 * DAY_SECS + 1;
        assert_eq!(cycle(&c).limit_ms, Some(234 * MIN), "ceil(1000 × 7 / 30) = 234");
        c.quota_minutes_per_cycle = None;
        assert_eq!(cycle(&c).limit_ms, None, "Yearly không giới hạn");
    }

    #[test]
```

`src-tauri/src/license/quota.rs`: thay

```rust
    fn changing_plan_starts_a_new_counter_with_or_without_a_marker() {
        let old = claims();
        let mut changed = old.clone();
        changed.plan = Plan::ProX2;
        changed.quota_minutes_per_cycle = Some(6000);
        changed.cycle_anchor = T0 + 10 * DAY_SECS;
        changed.issued_at = T0 + 10 * DAY_SECS + 60;
```

bằng

```rust
    fn changing_plan_starts_a_new_counter_with_or_without_a_marker() {
        let old = claims();
        let mut changed = old.clone();
        changed.plan = Plan::Yearly;
        changed.quota_minutes_per_cycle = Some(6000);
        changed.cycle_anchor = T0 + 10 * DAY_SECS;
        changed.issued_at = T0 + 10 * DAY_SECS + 60;
```

`src-tauri/src/license/store.rs`: thay

```rust
            activation_id: "act".into(),
            activation_created_at: 1_790_812_800,
            device_id_hash: "dev".into(),
            plan: Plan::Pro,
            expires_at: 1_790_812_800 + 30 * 86_400,
            cycle_anchor: 1_790_812_800,
            quota_minutes_per_cycle: Some(1800),
```

bằng

```rust
            activation_id: "act".into(),
            activation_created_at: 1_790_812_800,
            device_id_hash: "dev".into(),
            plan: Plan::Monthly,
            expires_at: 1_790_812_800 + 30 * 86_400,
            cycle_anchor: 1_790_812_800,
            quota_minutes_per_cycle: Some(1800),
```

`src-tauri/src/license/token.rs`: thay

```rust
        serde_json::to_value(e).unwrap().as_str().unwrap().to_string()
    }

    /// Đúng bản vector đã chốt với server (`d7bdfdb`, Phụ lục C đợt A2 của kế hoạch 05).
    #[test]
    fn the_vector_file_is_the_agreed_one() {
        let hash = hex(&Sha256::digest(VECTORS.as_bytes()));
        assert_eq!(hash, "f7b6b332f25cbe5ebec012a6f106b9d274175279926d07898cc196d7683c8542");
    }

    fn hex(bytes: &[u8]) -> String {
```

bằng

```rust
        serde_json::to_value(e).unwrap().as_str().unwrap().to_string()
    }

    /// Đúng bản vector đã chốt với server (kế hoạch 2026-10-07 ba gói · 01 Task 1: mã gói `monthly`, `yearly`, khóa
    /// `trial`).
    #[test]
    fn the_vector_file_is_the_agreed_one() {
        let hash = hex(&Sha256::digest(VECTORS.as_bytes()));
        assert_eq!(hash, "b18e7b9e961181a2a8ed94bfd2178a54d8cb921116834367c5268f9bc538faa2");
    }

    fn hex(bytes: &[u8]) -> String {
```

`src-tauri/src/license/token.rs`: thay

```rust
                    assert_eq!(expected, "ok", "{name}");
                    // So đủ mọi trường với `claims` của vector (N3 của review 06 lần 1).
                    let plan = match claims.plan {
                        Plan::Pro => "pro",
                        Plan::ProX2 => "pro_x2",
                        Plan::ProX5 => "pro_x5",
                    };
                    let got = serde_json::json!({
                        "kid": claims.kid,
```

bằng

```rust
                    assert_eq!(expected, "ok", "{name}");
                    // So đủ mọi trường với `claims` của vector (N3 của review 06 lần 1).
                    let plan = match claims.plan {
                        Plan::Monthly => "monthly",
                        Plan::Yearly => "yearly",
                    };
                    let got = serde_json::json!({
                        "kid": claims.kid,
```

`src-tauri/src/license/token.rs`: thay

```rust
            }
            checked += 1;
        }
        assert_eq!(checked, 30);
    }

    /// Thứ tự lỗi của `VerifyError` đúng `checks_order` của vector.
```

bằng

```rust
            }
            checked += 1;
        }
        assert_eq!(checked, 32);
    }

    /// Thứ tự lỗi của `VerifyError` đúng `checks_order` của vector.
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator --lib license::
```

Kết quả mong đợi: lỗi biên dịch E0599 "no variant or associated item named `Monthly` found for enum `Plan`".

- [ ] **Step 3: Viết code**

`src-tauri/src/license/manager.rs`: thay

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaView {
    /// Gói không giới hạn (X5) hay bản debug không giới hạn.
    pub unlimited: bool,
    pub limit_ms: u64,
    pub used_ms: u64,
```

bằng

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaView {
    /// Gói không giới hạn (Yearly) hay bản debug không giới hạn.
    pub unlimited: bool,
    pub limit_ms: u64,
    pub used_ms: u64,
```

`src-tauri/src/license/manager.rs`: thay

```rust
#[serde(rename_all = "camelCase")]
pub struct LicenseView {
    pub standing: Standing,
    /// `free`, `pro`, `pro_x2`, `pro_x5`: gói đang có hiệu lực.
    pub plan: String,
    /// Gói ghi trong token đã lưu (kể cả khi đã hết hạn), để hiện "Professional đã hết hạn".
    pub licensed_plan: Option<Plan>,
    /// Key đã che, chỉ còn 4 ký tự cuối (`••••-…-RST5`): sự kiện không phải ranh giới quyền, nên không gửi key đầy đủ
    /// (01 QĐ6). Key đầy đủ nằm trong email mua hàng.
```

bằng

```rust
#[serde(rename_all = "camelCase")]
pub struct LicenseView {
    pub standing: Standing,
    /// `free`, `monthly`, `yearly`: gói đang có hiệu lực.
    pub plan: String,
    /// Gói ghi trong token đã lưu (kể cả khi đã hết hạn), để hiện "Monthly đã hết hạn".
    pub licensed_plan: Option<Plan>,
    /// Key đã che, chỉ còn 4 ký tự cuối (`••••-…-RST5`): sự kiện không phải ranh giới quyền, nên không gửi key đầy đủ
    /// (01 QĐ6). Key đầy đủ nằm trong email mua hàng.
```

`src-tauri/src/license/manager.rs`: thay

```rust
        LicenseView {
            standing,
            plan: match (&active, self.dev_unlimited) {
                (_, true) => "pro_x5".into(),
                (Some(c), _) => plan_code(c.plan).into(),
                (None, _) => "free".into(),
            },
```

bằng

```rust
        LicenseView {
            standing,
            plan: match (&active, self.dev_unlimited) {
                (_, true) => "yearly".into(),
                (Some(c), _) => plan_code(c.plan).into(),
                (None, _) => "free".into(),
            },
```

`src-tauri/src/license/manager.rs`: thay

```rust

pub fn plan_code(plan: Plan) -> &'static str {
    match plan {
        Plan::Pro => "pro",
        Plan::ProX2 => "pro_x2",
        Plan::ProX5 => "pro_x5",
    }
}

```

bằng

```rust

pub fn plan_code(plan: Plan) -> &'static str {
    match plan {
        Plan::Monthly => "monthly",
        Plan::Yearly => "yearly",
    }
}

```

`src-tauri/src/license/purchase.rs`: thay

```rust
use super::manager::{License, LicenseError};
use super::store::{self, PendingOrder};

/// Mã gói được bán (spec §2).
pub const PLANS: [&str; 3] = ["pro", "pro_x2", "pro_x5"];
/// App hỏi trạng thái đơn mỗi chừng này (§6.8 bước 4).
pub const POLL_EVERY_SECS: u64 = 3;
/// Đơn đang chờ giữ thêm chừng này sau khi link hết hạn (webhook đến chậm, mở lại app vẫn hỏi lại một lần), rồi bỏ.
```

bằng

```rust
use super::manager::{License, LicenseError};
use super::store::{self, PendingOrder};

/// Mã gói được bán (spec 2026-10-07 §1).
pub const PLANS: [&str; 2] = ["monthly", "yearly"];
/// App hỏi trạng thái đơn mỗi chừng này (§6.8 bước 4).
pub const POLL_EVERY_SECS: u64 = 3;
/// Đơn đang chờ giữ thêm chừng này sau khi link hết hạn (webhook đến chậm, mở lại app vẫn hỏi lại một lần), rồi bỏ.
```

`src-tauri/src/license/purchase.rs`: thay

```rust
    Refunded { order_code: i64 },
    /// `cancelled`, `expired`, `failed`, hay link đã hết hạn: cho tạo đơn mới; thôi hỏi.
    Failed { order_code: i64 },
    /// Đã trả tiền nhưng kích hoạt hay làm mới trên máy này lỗi (ví dụ key mới đã đủ 2 máy): báo lỗi, key vẫn có trong
    /// email.
    PaidButNotApplied { order_code: i64, code: String },
}
```

bằng

```rust
    Refunded { order_code: i64 },
    /// `cancelled`, `expired`, `failed`, hay link đã hết hạn: cho tạo đơn mới; thôi hỏi.
    Failed { order_code: i64 },
    /// Đã trả tiền nhưng kích hoạt hay làm mới trên máy này lỗi (ví dụ key đang dùng ở máy khác): báo lỗi, key vẫn có trong
    /// email.
    PaidButNotApplied { order_code: i64, code: String },
}
```

`src-tauri/src/license/token.rs`: thay

```rust
//! `v1.<base64url(JSON claims)>.<base64url(chữ ký Ed25519 trên chuỗi ASCII "v1.<payload>")>`, base64url không đệm.
//!
//! Thứ tự kiểm, giống hệt `server/src/token.ts`: định dạng (đủ trường, đúng kiểu), `kid`, chữ ký, máy, `expires_at`, rồi
//! `refresh_before`. Token có nhiều lỗi thì trả lỗi đứng trước. Hợp đồng chốt bằng 30 vector ở
//! `server/test/vectors/token-v1.json`:
//! - mọi số nguyên phải là số nguyên an toàn của JavaScript (|n| ≤ 2^53 − 1), vì server sinh token bằng JavaScript;
//! - thiếu trường là `malformed`, kể cả `quota_minutes_per_cycle` (giá trị `null` mới là không giới hạn);
//! - payload là UTF-8 chặt, không có BOM (`serde_json::from_slice` trên byte đã giải mã);
//! - kiểm đủ định dạng trước khi tra `kid` và kiểm chữ ký.
//!
```

bằng

```rust
//! `v1.<base64url(JSON claims)>.<base64url(chữ ký Ed25519 trên chuỗi ASCII "v1.<payload>")>`, base64url không đệm.
//!
//! Thứ tự kiểm, giống hệt `server/src/token.ts`: định dạng (đủ trường, đúng kiểu), `kid`, chữ ký, máy, `expires_at`, rồi
//! `refresh_before`. Token có nhiều lỗi thì trả lỗi đứng trước. Hợp đồng chốt bằng 32 vector ở
//! `server/test/vectors/token-v1.json`:
//! - mọi số nguyên phải là số nguyên an toàn của JavaScript (|n| ≤ 2^53 − 1), vì server sinh token bằng JavaScript;
//! - thiếu trường là `malformed`, kể cả `quota_minutes_per_cycle` (giá trị `null` mới là không giới hạn);
//! - token bản quyền không có trường `typ`: có `typ` là `malformed`, để token dùng thử (`typ: "trial"`, [`super::trial`])
//!   không dùng thay được token bản quyền (spec 2026-10-07 §3.1);
//! - payload là UTF-8 chặt, không có BOM (`serde_json::from_slice` trên byte đã giải mã);
//! - kiểm đủ định dạng trước khi tra `kid` và kiểm chữ ký.
//!
```

`src-tauri/src/license/token.rs`: thay

```rust
/// Số nguyên lớn nhất JavaScript biểu diễn chính xác (`Number.MAX_SAFE_INTEGER`).
const MAX_SAFE: i64 = (1 << 53) - 1;

/// Gói trả phí trong token (spec §2). Free không có token.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    Pro,
    ProX2,
    ProX5,
}

impl Plan {
    fn parse(code: &str) -> Option<Self> {
        match code {
            "pro" => Some(Self::Pro),
            "pro_x2" => Some(Self::ProX2),
            "pro_x5" => Some(Self::ProX5),
            _ => None,
        }
    }
```

bằng

```rust
/// Số nguyên lớn nhất JavaScript biểu diễn chính xác (`Number.MAX_SAFE_INTEGER`).
const MAX_SAFE: i64 = (1 << 53) - 1;

/// Gói trả phí trong token (spec 2026-10-07 §1): Monthly, Yearly. Free không có token bản quyền.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    Monthly,
    Yearly,
}

impl Plan {
    fn parse(code: &str) -> Option<Self> {
        match code {
            "monthly" => Some(Self::Monthly),
            "yearly" => Some(Self::Yearly),
            _ => None,
        }
    }
```

`src-tauri/src/license/token.rs`: thay

```rust
    pub plan: Plan,
    pub expires_at: i64,
    pub cycle_anchor: i64,
    /// Phút mỗi chu kỳ 30 ngày; `None` là không giới hạn (X5).
    pub quota_minutes_per_cycle: Option<u32>,
    pub quota_epoch: i64,
    pub quota_fresh: bool,
```

bằng

```rust
    pub plan: Plan,
    pub expires_at: i64,
    pub cycle_anchor: i64,
    /// Phút mỗi chu kỳ 30 ngày; `None` là không giới hạn (Yearly).
    pub quota_minutes_per_cycle: Option<u32>,
    pub quota_epoch: i64,
    pub quota_fresh: bool,
```

`src-tauri/src/license/token.rs`: thay

```rust

fn parse_claims(json: &Value) -> Option<Claims> {
    let c = json.as_object()?;
    let quota = match c.get("quota_minutes_per_cycle")? {
        Value::Null => None,
        v => {
```

bằng

```rust

fn parse_claims(json: &Value) -> Option<Claims> {
    let c = json.as_object()?;
    if c.contains_key("typ") {
        return None;
    }
    let quota = match c.get("quota_minutes_per_cycle")? {
        Value::Null => None,
        v => {
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 443 passed; 0 failed; 3 ignored`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_tests.rs src-tauri/src/license/client.rs src-tauri/src/license/manager.rs src-tauri/src/license/purchase.rs src-tauri/src/license/quota.rs src-tauri/src/license/store.rs src-tauri/src/license/token.rs
git commit -m "feat(license): mã gói monthly/yearly; token bản quyền có typ là sai dạng

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 2: Free 30 phút mỗi ngày

Commit tham chiếu: `4dce0fc`.

`FREE_DAILY_MS` thành 30 phút (spec 2026-10-07 §1). Hai test của `manager` nói về số phút Free đổi theo.

**Files:**
- Modify: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/license/quota.rs`

- [ ] **Step 1: Viết test trước**

`src-tauri/src/license/manager.rs`: thay

```rust
    }

    #[test]
    fn a_first_run_is_free_with_ten_minutes_that_stop_the_session_when_used_up() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.quota.remaining_ms),
            (Standing::Free, "free", 10 * MIN)
        );
        assert!(l.can_start(T0) && !l.is_pro(T0));
        assert!(l.add_usage(9 * MIN, T0).is_continue());
        assert!(l.add_usage(MIN, T0).is_break(), "chạm hạn mức thì engine dừng phiên");
        assert!(!l.can_start(T0), "hạn mức còn 0 thì không bắt đầu phiên");
        // Mở lại app cùng ngày: bộ đếm còn nguyên.
```

bằng

```rust
    }

    #[test]
    fn a_first_run_is_free_with_thirty_minutes_that_stop_the_session_when_used_up() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.quota.remaining_ms),
            (Standing::Free, "free", 30 * MIN)
        );
        assert!(l.can_start(T0) && !l.is_pro(T0));
        assert!(l.add_usage(29 * MIN, T0).is_continue());
        assert!(l.add_usage(MIN, T0).is_break(), "chạm hạn mức thì engine dừng phiên");
        assert!(!l.can_start(T0), "hạn mức còn 0 thì không bắt đầu phiên");
        // Mở lại app cùng ngày: bộ đếm còn nguyên.
```

`src-tauri/src/license/manager.rs`: thay

```rust
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(5 * MIN, T0);
        assert!(l.take_warning(T0));
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(5 * MIN, T0);
```

bằng

```rust
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(25 * MIN, T0);
        assert!(l.take_warning(T0));
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(5 * MIN, T0);
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator --lib license::manager
```

Kết quả mong đợi: `test result: FAILED. 28 passed; 2 failed`, hai test đỏ là
`a_first_run_is_free_with_thirty_minutes_that_stop_the_session_when_used_up` và
`the_five_minute_warning_fires_once_per_counter`.

- [ ] **Step 3: Viết code**

`src-tauri/src/license/quota.rs`: thay

```rust
//! 4. bản ghi đánh dấu có mốc cũ hơn mốc hiện tại (sang chu kỳ mới): bắt đầu từ 0;
//! 5. còn lại là mất bản ghi: coi như đã dùng hết hạn mức của chu kỳ.
//!
//! **Free.** Một bộ đếm theo ngày, 10 phút. Reset khi ngày theo giờ máy đã tăng **và** đã qua ít nhất 20 giờ theo "đồng
//! hồ thật" (lớn nhất trong: thời gian đơn điệu cộng dồn lúc app chạy; hiệu hai header `Date` của server; hiệu giờ máy,
//! chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy quá 10 phút). Bộ đếm Free luôn cộng cả phút dịch lúc ở gói trả
//! phí, và hết hạn mức gói trả phí thì Free của ngày đó cũng hết.
```

bằng

```rust
//! 4. bản ghi đánh dấu có mốc cũ hơn mốc hiện tại (sang chu kỳ mới): bắt đầu từ 0;
//! 5. còn lại là mất bản ghi: coi như đã dùng hết hạn mức của chu kỳ.
//!
//! **Free.** Một bộ đếm theo ngày, 30 phút (spec 2026-10-07 §1), chỉ trong 10 ngày dùng thử (luật dùng thử ở `manager`). Reset khi ngày theo giờ máy đã tăng **và** đã qua ít nhất 20 giờ theo "đồng
//! hồ thật" (lớn nhất trong: thời gian đơn điệu cộng dồn lúc app chạy; hiệu hai header `Date` của server; hiệu giờ máy,
//! chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy quá 10 phút). Bộ đếm Free luôn cộng cả phút dịch lúc ở gói trả
//! phí, và hết hạn mức gói trả phí thì Free của ngày đó cũng hết.
```

`src-tauri/src/license/quota.rs`: thay

```rust

pub const DAY_SECS: i64 = 86_400;
pub const CYCLE_SECS: i64 = 30 * DAY_SECS;
/// Hạn mức Free mỗi ngày (spec §2): hằng số phía app, vì Free không có token.
pub const FREE_DAILY_MS: u64 = 10 * 60_000;
/// Free reset cần đã qua ít nhất chừng này theo "đồng hồ thật" kể từ lần reset trước.
pub const FREE_MIN_GAP_SECS: i64 = 20 * 3600;
/// Giờ máy nhỏ hơn mốc lớn nhất từng thấy quá chừng này thì coi là đã chỉnh lùi (§10.2).
```

bằng

```rust

pub const DAY_SECS: i64 = 86_400;
pub const CYCLE_SECS: i64 = 30 * DAY_SECS;
/// Hạn mức Free mỗi ngày (spec 2026-10-07 §1): hằng số phía app, vì token dùng thử không mang hạn mức.
pub const FREE_DAILY_MS: u64 = 30 * 60_000;
/// Free reset cần đã qua ít nhất chừng này theo "đồng hồ thật" kể từ lần reset trước.
pub const FREE_MIN_GAP_SECS: i64 = 20 * 3600;
/// Giờ máy nhỏ hơn mốc lớn nhất từng thấy quá chừng này thì coi là đã chỉnh lùi (§10.2).
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 443 passed; 0 failed; 3 ignored`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/manager.rs src-tauri/src/license/quota.rs
git commit -m "feat(license): Free 30 phút mỗi ngày

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 3: Token dùng thử (`license/trial.rs`)

Commit tham chiếu: `05293e8`.

Module mới kiểm token dùng thử `typ: "trial"` theo khóa `trial` của bộ vector: định dạng, `kid`, chữ ký, máy. Không xét
thời hạn (spec 2026-10-07 §3.1); `manager` so `ends_at` với giờ tin được ở Task 5. `token.rs` tách phần đọc token và kiểm
chữ ký ra hai hàm `pub(super)` để hai loại token dùng chung, thứ tự kiểm không đổi.

**Files:**
- Modify: `src-tauri/src/license/mod.rs`
- Modify: `src-tauri/src/license/token.rs` (tách `open`, `check_signature`; `int`, `string` dùng chung)
- Create: `src-tauri/src/license/trial.rs`

- [ ] **Step 1: Viết test trước**

`src-tauri/src/license/mod.rs`: thay

```rust
//! - [`manager`]: trạng thái bản quyền và hạn mức của máy này: kích hoạt, làm mới, gỡ, đếm phút, lịch `validate`.
//! - [`purchase`]: mua, gia hạn, đổi gói ngay trong app (bảng gói, đơn, mã VietQR, hỏi trạng thái đơn).
//! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.

pub mod app;
pub mod client;
```

bằng

```rust
//! - [`manager`]: trạng thái bản quyền và hạn mức của máy này: kích hoạt, làm mới, gỡ, đếm phút, lịch `validate`.
//! - [`purchase`]: mua, gia hạn, đổi gói ngay trong app (bảng gói, đơn, mã VietQR, hỏi trạng thái đơn).
//! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.
//! - [`trial`]: token dùng thử của Free (spec 2026-10-07 §3), cùng định dạng và khóa với token bản quyền.

pub mod app;
pub mod client;
```

`src-tauri/src/license/mod.rs`: thay

```rust
pub mod quota;
pub mod store;
pub mod token;
```

bằng

```rust
pub mod quota;
pub mod store;
pub mod token;
pub mod trial;
```

Tạo `src-tauri/src/license/trial.rs`:

```rust
//! Token dùng thử của Free (spec 2026-10-07 §3.1): license server ký khi máy đăng ký dùng thử (`POST /v1/trial`), cùng
//! định dạng `v1`, cùng khóa và `kid` với token bản quyền ([`super::token`]). Claims:
//! `{"typ": "trial", "kid", "device_id_hash", "started_at", "ends_at", "issued_at"}`.
//!
//! Thứ tự kiểm như token bản quyền: định dạng (đúng `typ`, đủ trường, đúng kiểu), `kid`, chữ ký, máy. Token không có
//! `expires_at` hay `refresh_before`: bên kiểm không xét thời hạn; `manager` so `ends_at` với giờ tin được
//! (`Seen::trusted_now`). Hợp đồng chốt bằng khóa `trial` của `server/test/vectors/token-v1.json`.

use serde_json::Value;

use super::keys::PublicKeys;
use super::token::{self, VerifyError};

/// Giá trị của trường `typ`.
pub const TYP: &str = "trial";

/// Nội dung của token dùng thử. Thời điểm là giây Unix theo giờ của server.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrialClaims {
    pub kid: String,
    pub device_id_hash: String,
    pub started_at: i64,
    pub ends_at: i64,
    pub issued_at: i64,
}

/// Đọc và kiểm định dạng, rồi `kid` và chữ ký. Không kiểm máy ([`verify`]).
pub fn decode(token: &str, keys: &PublicKeys) -> Result<TrialClaims, VerifyError> {
    let (json, payload, sig) = token::open(token)?;
    let claims = parse(&json).ok_or(VerifyError::Malformed)?;
    token::check_signature(&claims.kid, payload, &sig, keys)?;
    Ok(claims)
}

/// Kiểm đủ: [`decode`] rồi đúng máy này.
pub fn verify(token: &str, keys: &PublicKeys, device_id_hash: &str) -> Result<TrialClaims, VerifyError> {
    let claims = decode(token, keys)?;
    if claims.device_id_hash != device_id_hash {
        return Err(VerifyError::WrongDevice);
    }
    Ok(claims)
}

fn parse(json: &Value) -> Option<TrialClaims> {
    let c = json.as_object()?;
    if c.get("typ")?.as_str()? != TYP {
        return None;
    }
    Some(TrialClaims {
        kid: token::string(c, "kid")?,
        device_id_hash: token::string(c, "device_id_hash")?,
        started_at: token::int(c, "started_at")?,
        ends_at: token::int(c, "ends_at")?,
        issued_at: token::int(c, "issued_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vectors() -> Value {
        serde_json::from_str(include_str!("../../../server/test/vectors/token-v1.json")).unwrap()
    }

    fn keys(v: &Value) -> PublicKeys {
        let pairs = v["public_keys"].as_object().unwrap();
        PublicKeys::from_pairs(pairs.iter().map(|(k, x)| (k.as_str(), x.as_str().unwrap()))).unwrap()
    }

    fn label(e: VerifyError) -> String {
        serde_json::to_value(e).unwrap().as_str().unwrap().to_string()
    }

    /// Mọi vector của khóa `trial` cho đúng kết quả, và token hợp lệ cho đủ mọi trường.
    #[test]
    fn every_trial_vector_gives_the_expected_result() {
        let v = vectors();
        let keys = keys(&v);
        let order: Vec<&str> = v["trial"]["checks_order"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap())
            .collect();
        let mut checked = 0;
        for t in v["trial"]["tokens"].as_array().unwrap() {
            let name = t["name"].as_str().unwrap();
            let got = verify(
                t["token"].as_str().unwrap(),
                &keys,
                t["device_id_hash"].as_str().unwrap(),
            );
            let expected = t["expected"].as_str().unwrap();
            match got {
                Ok(c) => {
                    assert_eq!(expected, "ok", "{name}");
                    let got = serde_json::json!({
                        "typ": TYP,
                        "kid": c.kid,
                        "device_id_hash": c.device_id_hash,
                        "started_at": c.started_at,
                        "ends_at": c.ends_at,
                        "issued_at": c.issued_at,
                    });
                    assert_eq!(got, t["claims"], "{name}");
                }
                Err(e) => {
                    assert_eq!(label(e), expected, "{name}");
                    assert!(order.contains(&expected), "{name}");
                }
            }
            checked += 1;
        }
        assert_eq!(checked, 11);
    }

    /// Token dùng thử không dùng thay được token bản quyền, và ngược lại.
    #[test]
    fn a_trial_token_is_not_a_license_token() {
        let v = vectors();
        let keys = keys(&v);
        let trial = v["trial"]["tokens"][0]["token"].as_str().unwrap();
        assert_eq!(token::decode(trial, &keys), Err(VerifyError::Malformed));
        let license = v["tokens"][0]["token"].as_str().unwrap();
        assert_eq!(decode(license, &keys), Err(VerifyError::Malformed));
    }
}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator --lib license::trial
```

Kết quả mong đợi: lỗi biên dịch E0425 "cannot find function `open` in module `token`" và tương tự cho
`check_signature`; E0603 "function `string` is private", "function `int` is private".

- [ ] **Step 3: Viết code**

`src-tauri/src/license/token.rs`: thay

```rust

/// Đọc và kiểm định dạng, rồi `kid` và chữ ký. Không kiểm máy và thời hạn ([`check`]).
pub fn decode(token: &str, keys: &PublicKeys) -> Result<Claims, VerifyError> {
    let mut parts = token.split('.');
    let (Some(version), Some(payload), Some(sig), None) = (parts.next(), parts.next(), parts.next(), parts.next())
    else {
```

bằng

```rust

/// Đọc và kiểm định dạng, rồi `kid` và chữ ký. Không kiểm máy và thời hạn ([`check`]).
pub fn decode(token: &str, keys: &PublicKeys) -> Result<Claims, VerifyError> {
    let (json, payload, sig) = open(token)?;
    let claims = parse_claims(&json).ok_or(VerifyError::Malformed)?;
    check_signature(&claims.kid, payload, &sig, keys)?;
    Ok(claims)
}

/// Tách token `v1` thành JSON của payload, đoạn payload còn mã hóa (phần được ký) và chữ ký 64 byte. Sai ở bước nào cũng
/// là `Malformed`. Dùng chung với token dùng thử ([`super::trial`]).
pub(super) fn open(token: &str) -> Result<(Value, &str, [u8; 64]), VerifyError> {
    let mut parts = token.split('.');
    let (Some(version), Some(payload), Some(sig), None) = (parts.next(), parts.next(), parts.next(), parts.next())
    else {
```

`src-tauri/src/license/token.rs`: thay

```rust
    }
    let bytes = URL_SAFE_NO_PAD.decode(payload).map_err(|_| VerifyError::Malformed)?;
    let json: Value = serde_json::from_slice(&bytes).map_err(|_| VerifyError::Malformed)?;
    let claims = parse_claims(&json).ok_or(VerifyError::Malformed)?;
    let sig = URL_SAFE_NO_PAD
        .decode(sig)
        .ok()
        .and_then(|b| <[u8; 64]>::try_from(b).ok())
        .ok_or(VerifyError::Malformed)?;
    let key = keys.get(&claims.kid).ok_or(VerifyError::UnknownKid)?;
    let key = VerifyingKey::from_bytes(key).map_err(|_| VerifyError::BadSignature)?;
    let signing_input = format!("{VERSION}.{payload}");
    key.verify_strict(signing_input.as_bytes(), &Signature::from_bytes(&sig))
        .map_err(|_| VerifyError::BadSignature)?;
    Ok(claims)
}

/// Kiểm máy và thời hạn của claims đã kiểm chữ ký. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
```

bằng

```rust
    }
    let bytes = URL_SAFE_NO_PAD.decode(payload).map_err(|_| VerifyError::Malformed)?;
    let json: Value = serde_json::from_slice(&bytes).map_err(|_| VerifyError::Malformed)?;
    let sig = URL_SAFE_NO_PAD
        .decode(sig)
        .ok()
        .and_then(|b| <[u8; 64]>::try_from(b).ok())
        .ok_or(VerifyError::Malformed)?;
    Ok((json, payload, sig))
}

/// Tra `kid` rồi kiểm chữ ký Ed25519 (chặt) trên chuỗi ASCII `v1.<payload>`.
pub(super) fn check_signature(kid: &str, payload: &str, sig: &[u8; 64], keys: &PublicKeys) -> Result<(), VerifyError> {
    let key = keys.get(kid).ok_or(VerifyError::UnknownKid)?;
    let key = VerifyingKey::from_bytes(key).map_err(|_| VerifyError::BadSignature)?;
    let signing_input = format!("{VERSION}.{payload}");
    key.verify_strict(signing_input.as_bytes(), &Signature::from_bytes(sig))
        .map_err(|_| VerifyError::BadSignature)
}

/// Kiểm máy và thời hạn của claims đã kiểm chữ ký. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
```

`src-tauri/src/license/token.rs`: thay

```rust
    Ok(claims)
}

fn int(c: &Map<String, Value>, key: &str) -> Option<i64> {
    let n = c.get(key)?.as_i64()?;
    (-MAX_SAFE..=MAX_SAFE).contains(&n).then_some(n)
}

fn string(c: &Map<String, Value>, key: &str) -> Option<String> {
    c.get(key)?.as_str().map(String::from)
}

```

bằng

```rust
    Ok(claims)
}

pub(super) fn int(c: &Map<String, Value>, key: &str) -> Option<i64> {
    let n = c.get(key)?.as_i64()?;
    (-MAX_SAFE..=MAX_SAFE).contains(&n).then_some(n)
}

pub(super) fn string(c: &Map<String, Value>, key: &str) -> Option<String> {
    c.get(key)?.as_str().map(String::from)
}

```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator --lib license::
```

Kết quả mong đợi: `test result: ok. 91 passed; 0 failed`.

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 445 passed; 0 failed; 3 ignored`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/mod.rs src-tauri/src/license/token.rs src-tauri/src/license/trial.rs
git commit -m "feat(license): token dùng thử của Free (typ trial), kiểm theo vector chung

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 4: Client: `POST /v1/trial`, `allow_conflict`, danh sách máy ở `devices`

Commit tham chiếu: `e4e6a69`.

Theo hợp đồng của kế hoạch 00: `LicenseApi` có thêm `trial`, `activate` nhận `allow_conflict` (chỉ gửi khi `true`), lỗi
`409` đọc danh sách máy ở trường `devices` (server cũ trả `activations` cho `device_limit`; mã đó bỏ hẳn), và
`409 license_conflict` của `activate` mang `activation_id` của chính máy gọi (`ServerError::activation_id`). Trường mới làm
`ServerError` lớn hơn 128 byte (clippy `result_large_err` báo ở mọi hàm trả `Result<_, ApiError>`), nên
`ApiError::Server` đóng hộp: `Server(Box<ServerError>)`; mọi chỗ dựng `ApiError::Server(ServerError { … })` trong test đổi
thành `ApiError::Server(Box::new(ServerError { … }))`. Server giả của
test (`FakeApi`) có hàng đợi `trials`; chưa xếp kết quả nào thì trả một dùng thử còn hiệu lực rất lâu
(`TRIAL_FOREVER_START`…`TRIAL_FOREVER_END`), để các test không nói về dùng thử chạy như trước, kể cả test của app dùng giờ
thật. `issued_at` của dùng thử mặc định lùi về trước mọi mốc giờ của test, để không đẩy "giờ tin được" lên.

**Files:**
- Test: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/license/client.rs`
- Modify: `src-tauri/src/license/manager.rs`

- [ ] **Step 1: Viết test trước**

`src-tauri/src/app_tests.rs`: thay

```rust
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    api.replies.lock().unwrap().push_back(Err(ApiError::Server(ServerError {
        status: 409,
        code: "device_limit".into(),
        devices: vec![Device {
            activation_id: "a1".into(),
            device_label: None,
            last_validated_at: Some(1),
        }],
        ..ServerError::default()
    })));
    let out = invoke(
        &main,
        "activate_license",
```

bằng

```rust
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(ApiError::Server(Box::new(ServerError {
            status: 409,
            code: "device_limit".into(),
            devices: vec![Device {
                activation_id: "a1".into(),
                device_label: None,
                last_validated_at: Some(1),
            }],
            ..ServerError::default()
        }))));
    let out = invoke(
        &main,
        "activate_license",
```

`src-tauri/src/license/client.rs`: thay

```rust
        (base, seen)
    }

    #[test]
    fn activate_sends_the_device_and_reads_the_token_and_the_server_date() {
        let (base, seen) = serve(vec![(
```

bằng

```rust
        (base, seen)
    }

    /// `allow_conflict` chỉ gửi khi người dùng chọn "Vẫn kích hoạt" (spec 2026-10-07 §4.2).
    #[test]
    fn activate_sends_allow_conflict_only_when_asked() {
        let body = r#"{"token":"v1.a.b","activation_id":"act","quota_fresh":false}"#;
        let (base, seen) = serve(vec![(200, vec![], body), (200, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        api.activate("KEY", "ab12", None, false).result.unwrap();
        api.activate("KEY", "ab12", None, true).result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "key": "KEY", "device_id_hash": "ab12", "device_label": null })
        );
        assert_eq!(reqs[1].body["allow_conflict"], true);
    }

    /// Đăng ký dùng thử (spec 2026-10-07 §3.1): gửi `device_id_hash`, đọc token và các mốc.
    #[test]
    fn trial_sends_the_device_and_reads_the_token() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"token":"v1.t.s","started_at":10,"ends_at":20,"issued_at":11}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.trial("ab12");
        assert_eq!(
            reply.result.unwrap(),
            TrialGrant {
                token: "v1.t.s".into(),
                started_at: 10,
                ends_at: 20,
                issued_at: 11,
            }
        );
        assert_eq!(reply.date, Some(1_790_812_800));
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!((req.method.as_str(), req.path.as_str()), ("POST", "/v1/trial"));
        assert_eq!(req.body, json!({ "device_id_hash": "ab12" }));
    }

    #[test]
    fn activate_sends_the_device_and_reads_the_token_and_the_server_date() {
        let (base, seen) = serve(vec![(
```

`src-tauri/src/license/client.rs`: thay

```rust
            r#"{"token":"v1.a.b","activation_id":"act","activation_created_at":1,"plan":"monthly","expires_at":2,"cycle_anchor":1,"quota_minutes_per_cycle":1800,"quota_epoch":0,"quota_fresh":true,"refresh_before":3}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.activate("KEY", "ab12", Some("Máy của Phong"));
        let granted = reply.result.unwrap();
        assert_eq!(
            (
```

bằng

```rust
            r#"{"token":"v1.a.b","activation_id":"act","activation_created_at":1,"plan":"monthly","expires_at":2,"cycle_anchor":1,"quota_minutes_per_cycle":1800,"quota_epoch":0,"quota_fresh":true,"refresh_before":3}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.activate("KEY", "ab12", Some("Máy của Phong"), false);
        let granted = reply.result.unwrap();
        assert_eq!(
            (
```

`src-tauri/src/license/client.rs`: thay

```rust
            (
                409,
                vec![],
                r#"{"error":"device_limit","activations":[{"activation_id":"a1","device_label":null,"last_validated_at":5},{"activation_id":"a2","device_label":"Mac","last_validated_at":null}]}"#,
            ),
            (429, vec![("Retry-After", "120")], r#"{"error":"rate_limited"}"#),
            (403, vec![], r#"{"error":"license_expired","expires_at":1790000000}"#),
            (502, vec![], "not json"),
        ]);
        let api = HttpApi::new(accept_base(&base, true));
        let Err(ApiError::Server(e)) = api.activate("K", "d", None).result else {
            panic!()
        };
        assert_eq!((e.status, e.code.as_str()), (409, "device_limit"));
        assert_eq!(e.devices.len(), 2);
        assert_eq!(e.devices[0].device_label, None, "`device_label` có thể là null");
        let Err(ApiError::Server(e)) = api.validate("K", "a").result else {
            panic!()
        };
```

bằng

```rust
            (
                409,
                vec![],
                r#"{"error":"key_in_use","devices":[{"activation_id":"a1","device_label":null,"last_validated_at":5}]}"#,
            ),
            (
                409,
                vec![],
                r#"{"error":"license_conflict","activation_id":"a2","devices":[{"activation_id":"a1","device_label":null,"last_validated_at":5},{"activation_id":"a2","device_label":"Mac","last_validated_at":null}]}"#,
            ),
            (429, vec![("Retry-After", "120")], r#"{"error":"rate_limited"}"#),
            (403, vec![], r#"{"error":"license_expired","expires_at":1790000000}"#),
            (502, vec![], "not json"),
        ]);
        let api = HttpApi::new(accept_base(&base, true));
        let Err(ApiError::Server(e)) = api.activate("K", "d", None, false).result else {
            panic!()
        };
        assert_eq!((e.status, e.code.as_str(), e.devices.len()), (409, "key_in_use", 1));
        assert_eq!(e.devices[0].device_label, None, "`device_label` có thể là null");
        let Err(ApiError::Server(e)) = api.activate("K", "d", None, true).result else {
            panic!()
        };
        assert_eq!((e.code.as_str(), e.devices.len()), ("license_conflict", 2));
        assert_eq!(e.devices[1].device_label.as_deref(), Some("Mac"));
        assert_eq!(e.activation_id.as_deref(), Some("a2"), "activation của chính máy gọi");
        let Err(ApiError::Server(e)) = api.validate("K", "a").result else {
            panic!()
        };
```

`src-tauri/src/license/manager.rs`: thay

```rust
    use serde_json::{Value, json};

    use super::*;
    use crate::license::client::{Checkout, OrderStatus, PlanOffer, ServerError};
    use crate::license::store::tests::FakeVault;

    /// 2026-10-01 00:00:00 UTC.
```

bằng

```rust
    use serde_json::{Value, json};

    use super::*;
    use crate::license::client::{Checkout, OrderStatus, PlanOffer, ServerError, TrialGrant};
    use crate::license::store::tests::FakeVault;

    /// 2026-10-01 00:00:00 UTC.
```

`src-tauri/src/license/manager.rs`: thay

```rust
        })
    }

    pub fn server(status: u16, code: &str) -> ApiError {
        ApiError::Server(ServerError {
            status,
            code: code.into(),
            ..ServerError::default()
        })
    }

    /// Server giả: trả lần lượt các kết quả đã xếp cho `activate`, `validate`, `deactivate`; ghi lại các lần gọi.
    #[derive(Default)]
    pub struct FakeApi {
        pub replies: Mutex<VecDeque<Result<Granted, ApiError>>>,
        pub deactivations: Mutex<VecDeque<Result<(), ApiError>>>,
        pub checkouts: Mutex<VecDeque<Result<Checkout, ApiError>>>,
        pub orders: Mutex<VecDeque<Result<OrderStatus, ApiError>>>,
```

bằng

```rust
        })
    }

    /// Token dùng thử như server cấp cho `device`.
    pub fn trial_grant(device: &str, started_at: i64, ends_at: i64, issued_at: i64) -> Result<TrialGrant, ApiError> {
        let claims = json!({
            "typ": "trial", "kid": "test-1", "device_id_hash": device,
            "started_at": started_at, "ends_at": ends_at, "issued_at": issued_at,
        });
        Ok(TrialGrant {
            token: sign(&claims),
            started_at,
            ends_at,
            issued_at,
        })
    }

    /// Dùng thử mặc định của server giả khi test không xếp kết quả nào: còn hiệu lực rất lâu, cấp từ trước mọi mốc giờ của
    /// test, để các test không nói về dùng thử chạy như trước (kể cả test của app dùng giờ thật).
    pub const TRIAL_FOREVER_START: i64 = T0 - 400 * DAY;
    pub const TRIAL_FOREVER_END: i64 = T0 + 3650 * DAY;

    pub fn server(status: u16, code: &str) -> ApiError {
        ApiError::Server(Box::new(ServerError {
            status,
            code: code.into(),
            ..ServerError::default()
        }))
    }

    /// Server giả: trả lần lượt các kết quả đã xếp cho `activate`, `validate`, `deactivate`, `trial`; ghi lại các lần gọi.
    /// Chưa xếp kết quả `trial` nào thì trả dùng thử mặc định ([`TRIAL_FOREVER_START`]).
    #[derive(Default)]
    pub struct FakeApi {
        pub replies: Mutex<VecDeque<Result<Granted, ApiError>>>,
        pub trials: Mutex<VecDeque<Result<TrialGrant, ApiError>>>,
        pub deactivations: Mutex<VecDeque<Result<(), ApiError>>>,
        pub checkouts: Mutex<VecDeque<Result<Checkout, ApiError>>>,
        pub orders: Mutex<VecDeque<Result<OrderStatus, ApiError>>>,
```

`src-tauri/src/license/manager.rs`: thay

```rust
                date: None,
            }
        }
        fn activate(&self, key: &str, device: &str, label: Option<&str>) -> Reply<Granted> {
            self.next(format!("activate {key} {device} {}", label.unwrap_or("-")))
        }
        fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
            self.next(format!("validate {key} {activation_id}"))
```

bằng

```rust
                date: None,
            }
        }
        fn activate(&self, key: &str, device: &str, label: Option<&str>, allow_conflict: bool) -> Reply<Granted> {
            let anyway = if allow_conflict { " allow_conflict" } else { "" };
            self.next(format!("activate {key} {device} {}{anyway}", label.unwrap_or("-")))
        }
        fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
            self.next(format!("validate {key} {activation_id}"))
```

`src-tauri/src/license/manager.rs`: thay

```rust
                date: None,
            }
        }
    }

    impl Vault for Arc<FakeVault> {
```

bằng

```rust
                date: None,
            }
        }
        fn trial(&self, device: &str) -> Reply<TrialGrant> {
            self.calls.lock().unwrap().push(format!("trial {device}"));
            Reply {
                result: self.trials.lock().unwrap().pop_front().unwrap_or_else(|| {
                    trial_grant(device, TRIAL_FOREVER_START, TRIAL_FOREVER_END, TRIAL_FOREVER_START)
                }),
                date: *self.date.lock().unwrap(),
            }
        }
    }

    impl Vault for Arc<FakeVault> {
```

`src-tauri/src/license/manager.rs`: thay

```rust
            last_validated_at: Some(T0),
        }];
        api.replies.lock().unwrap().extend([
            Err(ApiError::Server(ServerError {
                status: 409,
                code: "device_limit".into(),
                devices: devices.clone(),
                ..ServerError::default()
            })),
            Err(server(423, "license_locked")),
            Err(ApiError::Server(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(60),
                ..ServerError::default()
            })),
        ]);
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::DeviceLimit(devices)));
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::Locked));
```

bằng

```rust
            last_validated_at: Some(T0),
        }];
        api.replies.lock().unwrap().extend([
            Err(ApiError::Server(Box::new(ServerError {
                status: 409,
                code: "device_limit".into(),
                devices: devices.clone(),
                ..ServerError::default()
            }))),
            Err(server(423, "license_locked")),
            Err(ApiError::Server(Box::new(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(60),
                ..ServerError::default()
            }))),
        ]);
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::DeviceLimit(devices)));
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::Locked));
```

`src-tauri/src/license/manager.rs`: thay

```rust
        );
        assert!(l.validate_due(T0 + VALIDATE_EVERY_SECS + 3600));
        // 429: chờ đúng `Retry-After`.
        api.replies.lock().unwrap().push_back(Err(ApiError::Server(ServerError {
            status: 429,
            code: "rate_limited".into(),
            retry_after: Some(7200),
            ..ServerError::default()
        })));
        let t = T0 + 2 * DAY;
        let _ = l.validate(t);
        assert!(!l.validate_due(t + 3600));
```

bằng

```rust
        );
        assert!(l.validate_due(T0 + VALIDATE_EVERY_SECS + 3600));
        // 429: chờ đúng `Retry-After`.
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Server(Box::new(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(7200),
                ..ServerError::default()
            }))));
        let t = T0 + 2 * DAY;
        let _ = l.validate(t);
        assert!(!l.validate_due(t + 3600));
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator --lib license::client
```

Kết quả mong đợi: lỗi biên dịch ở test: `TrialGrant` chưa có, `activate` nhận 3 tham số chứ không phải 4, `LicenseApi` chưa có `trial`, `ServerError` chưa có trường `activation_id`, `ApiError::Server` nhận `ServerError` chứ không phải `Box`.

- [ ] **Step 3: Viết code**

`src-tauri/src/license/client.rs`: thay

```rust
    NotConfigured,
    #[error("lỗi mạng: {0}")]
    Network(String),
    /// Server trả lỗi `{"error": "<mã>", …}`.
    #[error("server trả {0}")]
    Server(ServerError),
    #[error("response sai dạng: {0}")]
    Decode(String),
}
```

bằng

```rust
    NotConfigured,
    #[error("lỗi mạng: {0}")]
    Network(String),
    /// Server trả lỗi `{"error": "<mã>", …}`. Đóng hộp để `Result<_, ApiError>` gọn (clippy `result_large_err`).
    #[error("server trả {0}")]
    Server(Box<ServerError>),
    #[error("response sai dạng: {0}")]
    Decode(String),
}
```

`src-tauri/src/license/client.rs`: thay

```rust
    pub code: String,
    /// `429`: số giây phải chờ.
    pub retry_after: Option<u64>,
    /// `409 device_limit`: các máy đang kích hoạt.
    pub devices: Vec<Device>,
    /// `403 license_expired`.
    pub expires_at: Option<i64>,
    /// `400 invalid_request`: trường sai.
```

bằng

```rust
    pub code: String,
    /// `429`: số giây phải chờ.
    pub retry_after: Option<u64>,
    /// `409 key_in_use`: các máy khác đang giữ key; `409 license_conflict`: mọi máy đang kích hoạt (spec 2026-10-07 §4.1).
    pub devices: Vec<Device>,
    /// `409 license_conflict` của `activate`: activation của chính máy vừa gọi (spec 2026-10-07 §4.1).
    pub activation_id: Option<String>,
    /// `403 license_expired`.
    pub expires_at: Option<i64>,
    /// `400 invalid_request`: trường sai.
```

`src-tauri/src/license/client.rs`: thay

```rust
    }
}

/// Một máy đã kích hoạt, trong `409 device_limit`. `device_label` có thể là `null` (ví dụ sau khi admin xóa dữ liệu cá
/// nhân): giao diện hiện tên thay thế.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Device {
    pub activation_id: String,
```

bằng

```rust
    }
}

/// Một máy đang kích hoạt, trong `409 key_in_use` hay `409 license_conflict`. `device_label` có thể là `null` (ví dụ sau
/// khi admin xóa dữ liệu cá nhân): giao diện hiện tên thay thế.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Device {
    pub activation_id: String,
```

`src-tauri/src/license/client.rs`: thay

```rust
    pub quota_fresh: bool,
}

/// Một gói đang bán (`GET /v1/plans`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct PlanOffer {
```

bằng

```rust
    pub quota_fresh: bool,
}

/// Token dùng thử server vừa cấp (`POST /v1/trial`, spec 2026-10-07 §3.1). App đọc lại các mốc từ token đã kiểm chữ ký;
/// các trường ngoài token chỉ để log và test.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct TrialGrant {
    pub token: String,
    pub started_at: i64,
    pub ends_at: i64,
    pub issued_at: i64,
}

/// Một gói đang bán (`GET /v1/plans`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct PlanOffer {
```

`src-tauri/src/license/client.rs`: thay

```rust
    fn plans(&self) -> Reply<Vec<PlanOffer>>;
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>) -> Reply<Checkout>;
    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus>;
    fn activate(&self, key: &str, device_id_hash: &str, device_label: Option<&str>) -> Reply<Granted>;
    fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted>;
    fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()>;
    fn recover(&self, email: &str) -> Reply<()>;
}

/// Client HTTP thật.
```

bằng

```rust
    fn plans(&self) -> Reply<Vec<PlanOffer>>;
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>) -> Reply<Checkout>;
    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus>;
    /// `allow_conflict`: người dùng đã chọn "Vẫn kích hoạt" khi key đang dùng ở máy khác (spec 2026-10-07 §4.2).
    fn activate(
        &self,
        key: &str,
        device_id_hash: &str,
        device_label: Option<&str>,
        allow_conflict: bool,
    ) -> Reply<Granted>;
    fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted>;
    fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()>;
    fn recover(&self, email: &str) -> Reply<()>;
    /// Đăng ký dùng thử của máy này, hay lấy lại token của lần đăng ký trước (spec 2026-10-07 §3.1).
    fn trial(&self, device_id_hash: &str) -> Reply<TrialGrant>;
}

/// Client HTTP thật.
```

`src-tauri/src/license/client.rs`: thay

```rust
        let result = if (200..300).contains(&status) {
            serde_json::from_slice::<T>(&bytes).map_err(|e| ApiError::Decode(e.to_string()))
        } else {
            Err(ApiError::Server(server_error(status, retry_after, &bytes)))
        };
        Reply { result, date }
    }
```

bằng

```rust
        let result = if (200..300).contains(&status) {
            serde_json::from_slice::<T>(&bytes).map_err(|e| ApiError::Decode(e.to_string()))
        } else {
            Err(ApiError::Server(Box::new(server_error(status, retry_after, &bytes))))
        };
        Reply { result, date }
    }
```

`src-tauri/src/license/client.rs`: thay

```rust
fn server_error(status: u16, retry_after: Option<u64>, body: &[u8]) -> ServerError {
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let devices = v
        .get("activations")
        .cloned()
        .and_then(|a| serde_json::from_value::<Vec<Device>>(a).ok())
        .unwrap_or_default();
```

bằng

```rust
fn server_error(status: u16, retry_after: Option<u64>, body: &[u8]) -> ServerError {
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let devices = v
        .get("devices")
        .cloned()
        .and_then(|a| serde_json::from_value::<Vec<Device>>(a).ok())
        .unwrap_or_default();
```

`src-tauri/src/license/client.rs`: thay

```rust
            .map_or_else(|| format!("http_{status}"), String::from),
        retry_after,
        devices,
        expires_at: v.get("expires_at").and_then(Value::as_i64),
        field: v.get("field").and_then(Value::as_str).map(String::from),
    }
```

bằng

```rust
            .map_or_else(|| format!("http_{status}"), String::from),
        retry_after,
        devices,
        activation_id: v.get("activation_id").and_then(Value::as_str).map(String::from),
        expires_at: v.get("expires_at").and_then(Value::as_i64),
        field: v.get("field").and_then(Value::as_str).map(String::from),
    }
```

`src-tauri/src/license/client.rs`: thay

```rust
        self.call("GET", &format!("/v1/orders/{order_code}"), None, Some(order_token))
    }

    fn activate(&self, key: &str, device_id_hash: &str, device_label: Option<&str>) -> Reply<Granted> {
        let body = json!({ "key": key, "device_id_hash": device_id_hash, "device_label": device_label });
        self.call("POST", "/v1/licenses/activate", Some(body), None)
    }

```

bằng

```rust
        self.call("GET", &format!("/v1/orders/{order_code}"), None, Some(order_token))
    }

    fn activate(
        &self,
        key: &str,
        device_id_hash: &str,
        device_label: Option<&str>,
        allow_conflict: bool,
    ) -> Reply<Granted> {
        let mut body = json!({ "key": key, "device_id_hash": device_id_hash, "device_label": device_label });
        if allow_conflict {
            body["allow_conflict"] = json!(true);
        }
        self.call("POST", "/v1/licenses/activate", Some(body), None)
    }

```

`src-tauri/src/license/client.rs`: thay

```rust
    fn recover(&self, email: &str) -> Reply<()> {
        unit(self.call::<Ok200>("POST", "/v1/licenses/recover", Some(json!({ "email": email })), None))
    }
}

#[cfg(test)]
```

bằng

```rust
    fn recover(&self, email: &str) -> Reply<()> {
        unit(self.call::<Ok200>("POST", "/v1/licenses/recover", Some(json!({ "email": email })), None))
    }

    fn trial(&self, device_id_hash: &str) -> Reply<TrialGrant> {
        self.call(
            "POST",
            "/v1/trial",
            Some(json!({ "device_id_hash": device_id_hash })),
            None,
        )
    }
}

#[cfg(test)]
```

`src-tauri/src/license/manager.rs`: thay

```rust
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        let reply = self
            .api
            .activate(&key, &self.machine.id_hash, self.machine.label.as_deref());
        self.observe(&reply);
        let granted = reply.result.map_err(map_api)?;
        self.accept(granted, key, now)
```

bằng

```rust
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        let reply = self
            .api
            .activate(&key, &self.machine.id_hash, self.machine.label.as_deref(), false);
        self.observe(&reply);
        let granted = reply.result.map_err(map_api)?;
        self.accept(granted, key, now)
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 447 passed; 0 failed; 3 ignored`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_tests.rs src-tauri/src/license/client.rs src-tauri/src/license/manager.rs
git commit -m "feat(license): client gọi /v1/trial, gửi allow_conflict, đọc devices của 409

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 5: Free theo dùng thử 10 ngày (`manager`, `store`)

Commit tham chiếu: `fe8c45b`.

Luật Free bốn điều kiện (spec 2026-10-07 §3.2): không có gói trả phí hiệu lực; có token dùng thử của máy này; giờ tin
được (`Seen::trusted_now`) còn trước `ends_at` và giờ máy không bị chỉnh lùi; bộ đếm của ngày còn phút. `can_start` nay
là `start_block(now).is_none()`; `start_block` trả lý do (`StartBlock`) để app báo đúng lỗi. Ở Free mà chưa có token thì
`start_block` đăng ký ngay (gọi server), nên nơi gọi chạy trên luồng nền. Ticker đăng ký chạy nền qua `trial_due` chỉ sau
khi người dùng đồng ý điều khoản (`allow_trial`), mỗi giờ một lần, chờ đúng `Retry-After` khi `429`.

Token dùng thử nằm trong mục kho khóa riêng `license-trial`, đọc lại lúc khởi động; mục hỏng hay của máy khác thì bỏ qua
và đăng ký lại. Nút xóa dữ liệu giữ mục này (test `wiping_user_data_keeps_the_license_and_the_quota_counters`).

Phiên đang chạy mà qua `ends_at` thì chạy hết: `add_usage` chỉ xét bộ đếm của ngày, không xét dùng thử.

**Files:**
- Modify: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/license/store.rs`

- [ ] **Step 1: Viết test trước**

`src-tauri/src/license/manager.rs`: thay

```rust
        let seen: Seen = store::read(vault.as_ref(), store::SEEN).unwrap().unwrap();
        assert_eq!(seen.latest_server_date, Some(T0 + 5));
    }
}
```

bằng

```rust
        let seen: Seen = store::read(vault.as_ref(), store::SEEN).unwrap().unwrap();
        assert_eq!(seen.latest_server_date, Some(T0 + 5));
    }

    // ---- Free dùng thử 10 ngày (spec 2026-10-07 §3.2) ----

    const TRIAL_END: i64 = T0 + 10 * DAY;

    /// Server giả trả dùng thử bắt đầu `T0`, hết `TRIAL_END`.
    fn with_trial(api: &Arc<FakeApi>) {
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0, TRIAL_END, T0));
    }

    /// Bấm Bắt đầu ở Free mà chưa có token dùng thử: đăng ký với server, lưu kho khóa; mở lại app thì đọc lại, không gọi
    /// server nữa. Số ngày còn lại làm tròn lên.
    #[test]
    fn free_registers_the_trial_once_and_keeps_it() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.view(T0).trial.status, TrialStatus::None);
        assert_eq!(l.start_block(T0), None);
        assert_eq!(*api.calls.lock().unwrap(), [format!("trial {DEVICE}")]);
        assert!(vault.items.lock().unwrap().contains_key(store::TRIAL));
        let reopened = license(&api, &vault, T0 + DAY + 1);
        let v = reopened.view(T0 + DAY + 1);
        assert_eq!(
            (v.trial.status, v.trial.ends_at, v.trial.days_left),
            (TrialStatus::Active, Some(TRIAL_END), 9)
        );
        assert_eq!(reopened.start_block(T0 + DAY + 1), None);
        assert_eq!(api.calls.lock().unwrap().len(), 1, "đã có token: không gọi server");
    }

    /// Hết 10 ngày: không bắt đầu được phiên ở Free; phiên đang chạy vẫn cộng phút bình thường (chạy hết phiên).
    #[test]
    fn an_ended_trial_blocks_the_next_free_session_only() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        with_trial(&api);
        let l = license(&api, &vault, TRIAL_END - 60);
        assert_eq!(l.start_block(TRIAL_END - 60), None);
        assert!(
            l.add_usage(MIN, TRIAL_END + 60).is_continue(),
            "phiên đang chạy chạy tiếp"
        );
        assert_eq!(l.start_block(TRIAL_END), Some(StartBlock::TrialEnded));
        let v = l.view(TRIAL_END);
        assert_eq!((v.trial.status, v.trial.days_left), (TrialStatus::Ended, 0));
        assert!(!l.can_start(TRIAL_END));
    }

    /// Chưa có token và không có mạng: không bắt đầu được ở Free; có mạng lại thì đăng ký được.
    #[test]
    fn without_a_trial_and_without_network_free_cannot_start() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let l = license(&api, &vault, T0);
        assert_eq!(l.start_block(T0), Some(StartBlock::TrialMissing));
        assert_eq!(l.view(T0).trial.status, TrialStatus::None);
        with_trial(&api);
        assert_eq!(l.start_block(T0 + 60), None);
    }

    /// Token dùng thử của máy khác, hay token bản quyền đưa vào chỗ token dùng thử: không nhận. Mục kho khóa hỏng thì bỏ qua
    /// và đăng ký lại.
    #[test]
    fn a_trial_token_for_another_machine_is_refused() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant("khac", T0, TRIAL_END, T0));
        let l = license(&api, &vault, T0);
        assert!(matches!(l.register_trial(T0), Err(LicenseError::BadToken(_))));
        let license_token = granted(&claims(T0), false).unwrap().token;
        api.trials.lock().unwrap().push_back(Ok(TrialGrant {
            token: license_token,
            started_at: T0,
            ends_at: TRIAL_END,
            issued_at: T0,
        }));
        assert!(matches!(l.register_trial(T0), Err(LicenseError::BadToken(_))));
        assert!(!vault.items.lock().unwrap().contains_key(store::TRIAL));
        vault
            .items
            .lock()
            .unwrap()
            .insert(store::TRIAL.into(), br#"{"token":"v1.x.y"}"#.to_vec());
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.view(T0).trial.status, TrialStatus::None);
        assert_eq!(l.start_block(T0), None);
    }

    /// Giờ máy chỉnh lùi: Free không bắt đầu được, báo chỉnh giờ. Giờ server (header `Date`) đã qua `ends_at` thì hết dùng
    /// thử, dù giờ máy còn trước.
    #[test]
    fn the_trial_follows_the_trusted_clock() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.start_block(T0), None);
        l.tick(T0 + 5 * DAY, 0);
        assert_eq!(l.start_block(T0 + 2 * DAY), Some(StartBlock::ClockRolledBack));
        *api.date.lock().unwrap() = Some(TRIAL_END + 60);
        l.observe_reply(&api.plans());
        assert_eq!(l.start_block(TRIAL_END - 300), Some(StartBlock::TrialEnded));
    }

    /// Đăng ký chạy nền (ticker) chỉ sau khi người dùng đồng ý điều khoản, khi chưa có token, mỗi giờ một lần; `429` thì
    /// chờ đúng `Retry-After`.
    #[test]
    fn background_registration_waits_for_consent_and_retries_hourly() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert!(!l.trial_due(T0), "chưa đồng ý điều khoản");
        l.allow_trial();
        assert!(l.trial_due(T0));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        assert_eq!(l.register_trial(T0), Err(LicenseError::Network));
        assert!(!l.trial_due(T0 + 600));
        assert!(l.trial_due(T0 + 3600));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Server(Box::new(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(7200),
                ..ServerError::default()
            }))));
        let _ = l.register_trial(T0 + 3600);
        assert!(!l.trial_due(T0 + 2 * 3600));
        assert!(l.trial_due(T0 + 3 * 3600));
        with_trial(&api);
        l.register_trial(T0 + 3 * 3600).unwrap();
        assert!(!l.trial_due(T0 + 5 * 3600), "đã có token");
    }

    /// Gói trả phí hết hạn thì về Free theo dùng thử: còn trong 10 ngày thì dùng được, hết thì không.
    #[test]
    fn an_expired_plan_falls_back_to_the_trial() {
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let after = T0 + 3600 + EXPIRY_GRACE_SECS;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        with_trial(&api);
        assert_eq!(l.start_block(after), None);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0 - 20 * DAY, T0 - 10 * DAY, T0));
        assert_eq!(l.start_block(after), Some(StartBlock::TrialEnded));
        assert_eq!(l.start_block(T0 + 60), None, "gói trả phí còn hạn: không cần dùng thử");
    }
}
```

`src-tauri/src/license/store.rs`: thay

```rust
        let db = crate::db::DataStore::new(dir.clone(), Ok(Keystore::with_store(service, keys)));
        db.with(|_| Ok::<_, crate::db::DbError>(())).unwrap();
        assert!(ks.get(crate::db::KEY_NAME).unwrap().is_some());
        let names = [LICENSE, ORDER, SEEN, FREE, "quota-paid-0123", "quota-mark-0123"];
        for name in names {
            ks.set(name, b"{}").unwrap();
        }
```

bằng

```rust
        let db = crate::db::DataStore::new(dir.clone(), Ok(Keystore::with_store(service, keys)));
        db.with(|_| Ok::<_, crate::db::DbError>(())).unwrap();
        assert!(ks.get(crate::db::KEY_NAME).unwrap().is_some());
        let names = [LICENSE, ORDER, SEEN, TRIAL, FREE, "quota-paid-0123", "quota-mark-0123"];
        for name in names {
            ks.set(name, b"{}").unwrap();
        }
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator --lib license::
```

Kết quả mong đợi: lỗi biên dịch: `TrialStatus`, `StartBlock` chưa có; `License` chưa có `start_block`, `trial_due`, `allow_trial`, `register_trial`; `LicenseView` chưa có trường `trial`; `store::TRIAL` chưa có.

- [ ] **Step 3: Viết code**

`src-tauri/src/license/manager.rs`: thay

```rust
//!   được. Ba việc sau thử lại mỗi 5 phút. `429` thì chờ đúng `Retry-After`.
//! - **Kết quả của server:** máy bị gỡ (`activation_not_found`) hay key không còn (`invalid_key`): xóa bản ghi license,
//!   về Free. Thu hồi, hết hạn: giữ key để gia hạn, về Free. Lỗi mạng: giữ token tới `refresh_before` (§9).

use std::ops::ControlFlow;
use std::sync::Mutex;
```

bằng

```rust
//!   được. Ba việc sau thử lại mỗi 5 phút. `429` thì chờ đúng `Retry-After`.
//! - **Kết quả của server:** máy bị gỡ (`activation_not_found`) hay key không còn (`invalid_key`): xóa bản ghi license,
//!   về Free. Thu hồi, hết hạn: giữ key để gia hạn, về Free. Lỗi mạng: giữ token tới `refresh_before` (§9).
//! - **Free là dùng thử 10 ngày** (spec 2026-10-07 §3.2): dùng được khi không có gói trả phí hiệu lực, có token dùng thử
//!   của máy này ([`super::trial`]), giờ tin được còn trước `ends_at` và giờ máy không bị chỉnh lùi, và bộ đếm của ngày
//!   chưa hết. Bấm Bắt đầu ở Free mà chưa có token thì đăng ký ngay ([`License::start_block`]); ngoài ra ticker đăng ký chạy
//!   nền sau khi người dùng đồng ý điều khoản ([`License::trial_due`]). Phiên đang chạy mà qua `ends_at` thì chạy hết.

use std::ops::ControlFlow;
use std::sync::Mutex;
```

`src-tauri/src/license/manager.rs`: thay

```rust
use super::key;
use super::keys::PublicKeys;
use super::quota::{self, FreeCounter, PaidCounter, Seen};
use super::store::{self, LicenseRecord, Vault, Verdict};
use super::token::{self, Claims, Plan};

/// Lần `validate` thành công gần nhất quá chừng này thì gọi lại (§6.8, "Kiểm tra định kỳ").
pub const VALIDATE_EVERY_SECS: i64 = 24 * 3600;
```

bằng

```rust
use super::key;
use super::keys::PublicKeys;
use super::quota::{self, FreeCounter, PaidCounter, Seen};
use super::store::{self, LicenseRecord, TrialRecord, Vault, Verdict};
use super::token::{self, Claims, Plan};
use super::trial::{self, TrialClaims};

/// Lần `validate` thành công gần nhất quá chừng này thì gọi lại (§6.8, "Kiểm tra định kỳ").
pub const VALIDATE_EVERY_SECS: i64 = 24 * 3600;
```

`src-tauri/src/license/manager.rs`: thay

```rust
    NotGenuine,
}

/// Mốc reset hạn mức hiển thị (§4.2 bước 2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
```

bằng

```rust
    NotGenuine,
}

/// Tình trạng dùng thử của Free (spec 2026-10-07 §3.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrialStatus {
    /// Chưa có token dùng thử của máy này (chưa đăng ký được).
    None,
    Active,
    /// Giờ tin được đã tới `ends_at`.
    Ended,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialView {
    pub status: TrialStatus,
    pub ends_at: Option<i64>,
    /// Số ngày còn lại, ceil((`ends_at` − giờ tin được) / 1 ngày); 0 khi đã hết hay chưa có.
    pub days_left: i64,
}

/// Vì sao chưa bắt đầu được phiên ([`License::start_block`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartBlock {
    /// Hạn mức còn 0 (§6.8, "Khi chạm hạn mức").
    QuotaExhausted,
    /// Free mà chưa có token dùng thử, và đăng ký không được (thường là không có mạng).
    TrialMissing,
    /// Free mà đã hết 10 ngày dùng thử.
    TrialEnded,
    /// Free mà giờ máy bị coi là chỉnh lùi: chỉnh giờ rồi thử lại.
    ClockRolledBack,
}

/// Mốc reset hạn mức hiển thị (§4.2 bước 2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
```

`src-tauri/src/license/manager.rs`: thay

```rust
    pub dev_override: bool,
    /// Giờ máy bị coi là chỉnh lùi (cả ở gói Free): giao diện nhắc chỉnh giờ.
    pub clock_rolled_back: bool,
}

/// Lỗi của một thao tác bản quyền; giao diện chọn câu theo [`LicenseError::code`].
```

bằng

```rust
    pub dev_override: bool,
    /// Giờ máy bị coi là chỉnh lùi (cả ở gói Free): giao diện nhắc chỉnh giờ.
    pub clock_rolled_back: bool,
    /// Dùng thử của Free trên máy này.
    pub trial: TrialView,
}

/// Lỗi của một thao tác bản quyền; giao diện chọn câu theo [`LicenseError::code`].
```

`src-tauri/src/license/manager.rs`: thay

```rust
    has_prior_data: bool,
    /// Lần hỏi giờ của server gần nhất khi giờ máy bị coi là chỉnh lùi mà chưa có license ([`License::refresh_clock`]).
    clock_check_at: Option<i64>,
}

pub struct License {
```

bằng

```rust
    has_prior_data: bool,
    /// Lần hỏi giờ của server gần nhất khi giờ máy bị coi là chỉnh lùi mà chưa có license ([`License::refresh_clock`]).
    clock_check_at: Option<i64>,
    /// Token dùng thử đã kiểm chữ ký, đúng máy này.
    trial: Option<TrialClaims>,
    /// Người dùng đã đồng ý điều khoản: ticker được đăng ký dùng thử chạy nền ([`License::allow_trial`]).
    trial_allowed: bool,
    /// Lần gọi `POST /v1/trial` gần nhất.
    trial_attempt: Option<i64>,
    /// `429` của `/v1/trial`: không gọi lại trước lúc này.
    trial_blocked_until: Option<i64>,
}

/// Dùng thử lúc `now`, theo giờ tin được.
enum TrialState {
    Missing,
    Active,
    Ended,
    RolledBack,
}

pub struct License {
```

`src-tauri/src/license/manager.rs`: thay

```rust
        if let Some(issued_at) = inner.claims.as_ref().map(|c| c.issued_at) {
            inner.seen.observe_signed(issued_at);
        }
        self.resolve_free_locked(&mut inner, now);
        if let Some(claims) = inner.claims.clone() {
            self.resolve_paid_locked(&mut inner, &claims, false);
```

bằng

```rust
        if let Some(issued_at) = inner.claims.as_ref().map(|c| c.issued_at) {
            inner.seen.observe_signed(issued_at);
        }
        inner.trial = match store::read::<TrialRecord>(vault, store::TRIAL) {
            Ok(Some(r)) => trial::verify(&r.token, &self.keys, &self.machine.id_hash)
                .inspect_err(|e| log::warn!("token dùng thử đã lưu không dùng được: {e}"))
                .ok(),
            Ok(None) => None,
            Err(e) => {
                log::warn!("không đọc được token dùng thử: {e}");
                None
            }
        };
        if let Some(issued_at) = inner.trial.as_ref().map(|t| t.issued_at) {
            inner.seen.observe_signed(issued_at);
        }
        self.resolve_free_locked(&mut inner, now);
        if let Some(claims) = inner.claims.clone() {
            self.resolve_paid_locked(&mut inner, &claims, false);
```

`src-tauri/src/license/manager.rs`: thay

```rust
        Some(inner.free.as_ref().map_or(0, quota::free_remaining))
    }

    /// Có bắt đầu được phiên không: hạn mức còn 0 thì không (§6.8, "Khi chạm hạn mức").
    pub fn can_start(&self, now: i64) -> bool {
        self.remaining_locked(&self.lock(), now) != Some(0)
    }

    /// Cộng `speech_ms` vừa dịch xong. Trả `Break` khi đã chạm hạn mức: engine dừng phiên (`quota_exhausted`).
```

bằng

```rust
        Some(inner.free.as_ref().map_or(0, quota::free_remaining))
    }

    fn trial_state_locked(&self, inner: &Inner, now: i64) -> TrialState {
        let Some(trial) = &inner.trial else {
            return TrialState::Missing;
        };
        if inner.seen.trusted_now(now) >= trial.ends_at {
            TrialState::Ended
        } else if inner.seen.rolled_back(now) {
            TrialState::RolledBack
        } else {
            TrialState::Active
        }
    }

    /// Người dùng đã đồng ý điều khoản (bước 1b, hay đã xong các bước lần đầu mở ở lần chạy trước): từ giờ ticker được
    /// đăng ký dùng thử chạy nền, vì request gửi `device_id_hash` (spec 2026-10-07 §3.2).
    pub fn allow_trial(&self) {
        self.lock().trial_allowed = true;
    }

    /// Ticker có nên gọi `POST /v1/trial` lúc `now` không: đã được phép, có server, chưa có token dùng thử, lần thử trước
    /// đã quá 1 giờ, và không đang chờ `Retry-After`.
    pub fn trial_due(&self, now: i64) -> bool {
        let inner = self.lock();
        self.server_configured
            && inner.trial_allowed
            && inner.trial.is_none()
            && inner.trial_blocked_until.is_none_or(|t| now >= t)
            && inner
                .trial_attempt
                .is_none_or(|t| now - t >= ROUTINE_RETRY_SECS || now < t)
    }

    /// Đăng ký dùng thử của máy này (hay lấy lại token của lần trước, server giữ đúng `started_at` cũ): kiểm token, lưu
    /// kho khóa.
    pub fn register_trial(&self, now: i64) -> Result<(), LicenseError> {
        self.lock().trial_attempt = Some(now);
        let reply = self.api.trial(&self.machine.id_hash);
        self.observe(&reply);
        let grant = reply.result.map_err(map_api).inspect_err(|e| {
            if let LicenseError::RateLimited(after) = e {
                self.lock().trial_blocked_until = Some(now + after.map_or(ROUTINE_RETRY_SECS, |s| s as i64));
            }
        })?;
        let claims = trial::verify(&grant.token, &self.keys, &self.machine.id_hash)
            .map_err(|e| LicenseError::BadToken(e.to_string()))?;
        store::write(self.vault.as_ref(), store::TRIAL, &TrialRecord { token: grant.token })
            .map_err(|e| LicenseError::Storage(e.to_string()))?;
        let mut inner = self.lock();
        inner.seen.observe_signed(claims.issued_at);
        inner.trial = Some(claims);
        Ok(())
    }

    /// Vì sao chưa bắt đầu được phiên lúc `now`; `None` là bắt đầu được (spec 2026-10-07 §3.2, §6). Ở Free mà chưa có token
    /// dùng thử thì đăng ký ngay: có gọi server, nên nơi gọi chạy trên luồng nền.
    pub fn start_block(&self, now: i64) -> Option<StartBlock> {
        if self.dev_unlimited {
            return None;
        }
        let free = {
            let inner = self.lock();
            self.quota_claims(&inner, now).is_none()
        };
        if free {
            let missing = self.lock().trial.is_none();
            if missing
                && self.server_configured
                && let Err(e) = self.register_trial(now)
            {
                log::info!("chưa đăng ký được dùng thử: {}", e.code());
            }
            match self.trial_state_locked(&self.lock(), now) {
                TrialState::Missing => return Some(StartBlock::TrialMissing),
                TrialState::Ended => return Some(StartBlock::TrialEnded),
                TrialState::RolledBack => return Some(StartBlock::ClockRolledBack),
                TrialState::Active => {}
            }
        }
        (self.remaining_locked(&self.lock(), now) == Some(0)).then_some(StartBlock::QuotaExhausted)
    }

    /// Có bắt đầu được phiên không ([`License::start_block`]).
    pub fn can_start(&self, now: i64) -> bool {
        self.start_block(now).is_none()
    }

    /// Cộng `speech_ms` vừa dịch xong. Trả `Break` khi đã chạm hạn mức: engine dừng phiên (`quota_exhausted`).
```

`src-tauri/src/license/manager.rs`: thay

```rust
            },
        };
        let stored = inner.claims.as_ref();
        LicenseView {
            standing,
            plan: match (&active, self.dev_unlimited) {
```

bằng

```rust
            },
        };
        let stored = inner.claims.as_ref();
        let trusted = inner.seen.trusted_now(now);
        let trial = TrialView {
            status: match self.trial_state_locked(&inner, now) {
                TrialState::Missing => TrialStatus::None,
                TrialState::Ended => TrialStatus::Ended,
                TrialState::Active | TrialState::RolledBack => TrialStatus::Active,
            },
            ends_at: inner.trial.as_ref().map(|t| t.ends_at),
            days_left: inner.trial.as_ref().map_or(0, |t| {
                ((t.ends_at - trusted).max(0) as u64).div_ceil(quota::DAY_SECS as u64) as i64
            }),
        };
        LicenseView {
            standing,
            plan: match (&active, self.dev_unlimited) {
```

`src-tauri/src/license/manager.rs`: thay

```rust
            server_configured: self.server_configured,
            dev_override: self.dev_unlimited,
            clock_rolled_back: inner.seen.rolled_back(now),
        }
    }

```

bằng

```rust
            server_configured: self.server_configured,
            dev_override: self.dev_unlimited,
            clock_rolled_back: inner.seen.rolled_back(now),
            trial,
        }
    }

```

`src-tauri/src/license/store.rs`: thay

```rust
//! - `license`: key đã kích hoạt, `activation_id`, token mới nhất, lần `validate` thành công gần nhất (giờ máy);
//! - `license-order`: đơn đang chờ thanh toán (`order_code`, `order_token`), để mở lại app vẫn hỏi tiếp (§6.8 bước 5);
//! - `license-seen`: giờ máy lớn nhất từng thấy và header `Date` mới nhất của server ([`Seen`]);
//! - `quota-free`: bộ đếm Free của ngày;
//! - `quota-paid-<băm>`: bộ đếm của một khóa (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`);
//! - `quota-mark-<băm>`: bản ghi đánh dấu của một activation (`license_id`, `activation_id`).
```

bằng

```rust
//! - `license`: key đã kích hoạt, `activation_id`, token mới nhất, lần `validate` thành công gần nhất (giờ máy);
//! - `license-order`: đơn đang chờ thanh toán (`order_code`, `order_token`), để mở lại app vẫn hỏi tiếp (§6.8 bước 5);
//! - `license-seen`: giờ máy lớn nhất từng thấy và header `Date` mới nhất của server ([`Seen`]);
//! - `license-trial`: token dùng thử của máy này ([`TrialRecord`], spec 2026-10-07 §3.2);
//! - `quota-free`: bộ đếm Free của ngày;
//! - `quota-paid-<băm>`: bộ đếm của một khóa (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`);
//! - `quota-mark-<băm>`: bản ghi đánh dấu của một activation (`license_id`, `activation_id`).
```

`src-tauri/src/license/store.rs`: thay

```rust
pub const LICENSE: &str = "license";
pub const ORDER: &str = "license-order";
pub const SEEN: &str = "license-seen";
pub const FREE: &str = "quota-free";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
```

bằng

```rust
pub const LICENSE: &str = "license";
pub const ORDER: &str = "license-order";
pub const SEEN: &str = "license-seen";
pub const TRIAL: &str = "license-trial";
pub const FREE: &str = "quota-free";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
```

`src-tauri/src/license/store.rs`: thay

```rust
    Revoked,
}

/// Đơn đang chờ thanh toán.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct PendingOrder {
```

bằng

```rust
    Revoked,
}

/// Token dùng thử server đã cấp cho máy này. Giữ khi người dùng xóa dữ liệu, như bản ghi license.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct TrialRecord {
    pub token: String,
}

/// Đơn đang chờ thanh toán.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct PendingOrder {
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 454 passed; 0 failed; 3 ignored`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/manager.rs src-tauri/src/license/store.rs
git commit -m "feat(license): Free theo dùng thử 10 ngày: đăng ký, lưu, chặn bắt đầu phiên

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 6: Mỗi key một máy: `key_in_use`, "Vẫn kích hoạt", trạng thái xung đột

Commit tham chiếu: `3295194`.

`LicenseError::DeviceLimit` đổi thành `KeyInUse`; thêm `Conflict` (spec 2026-10-07 §4.2):

- `activate_anyway`: gọi `activate` một lần với `allow_conflict` (máy kia đã gỡ key trong lúc người dùng đọc hộp thoại thì
  nhận token như bình thường).
- `409 license_conflict` của `activate` (cả `activate` thường, khi máy này đã kích hoạt mà key đang xung đột) mang
  `activation_id` của chính máy này (QĐ1): app vào xung đột với activation đó. Response thiếu trường này là sai hợp đồng:
  báo lỗi server, không lưu gì.
- Vào xung đột (từ `activate_anyway`, `activate` hay `validate`; `validate` dùng `activation_id` đã lưu): bản ghi license
  giữ key, `activation_id`, danh sách máy, `verdict: conflict`, token rỗng; máy chạy theo Free (dùng thử); `validate` mỗi
  15 phút.
- `deactivate_saved_other`: "Gỡ máy kia" bằng key đã lưu.
- `quick_check_due`: phiên trả phí mà lần `validate` thành công gần nhất đã quá 1 giờ.

Mã lỗi `licenseDeviceLimit` đổi thành `licenseKeyInUse`, thêm `licenseConflict`, nên câu báo lỗi trong `src/i18n/` đổi
theo (test `errors::tests::every_error_code_has_ui_text`).

**Files:**
- Test: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/license/app.rs`
- Modify: `src-tauri/src/license/device.rs`
- Modify: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/license/store.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`

- [ ] **Step 1: Viết test trước**

`src-tauri/src/app_tests.rs`: thay

```rust
    }
}

/// Key đã đủ 2 máy: lệnh kích hoạt trả danh sách máy để gỡ một máy (§9), không phải lỗi.
#[test]
fn activating_a_full_key_returns_its_devices() {
    use crate::license::client::{ApiError, Device, ServerError};
    let app = mock_app();
    let main = window(&app, "main");
```

bằng

```rust
    }
}

/// Key đang dùng ở máy khác: lệnh kích hoạt trả danh sách máy để gỡ hay "Vẫn kích hoạt" (spec 2026-10-07 §4.2), không
/// phải lỗi.
#[test]
fn activating_a_key_in_use_returns_its_devices() {
    use crate::license::client::{ApiError, Device, ServerError};
    let app = mock_app();
    let main = window(&app, "main");
```

`src-tauri/src/app_tests.rs`: thay

```rust
        .unwrap()
        .push_back(Err(ApiError::Server(Box::new(ServerError {
            status: 409,
            code: "device_limit".into(),
            devices: vec![Device {
                activation_id: "a1".into(),
                device_label: None,
```

bằng

```rust
        .unwrap()
        .push_back(Err(ApiError::Server(Box::new(ServerError {
            status: 409,
            code: "key_in_use".into(),
            devices: vec![Device {
                activation_id: "a1".into(),
                device_label: None,
```

`src-tauri/src/license/manager.rs`: thay

```rust
            last_validated_at: Some(T0),
        }];
        api.replies.lock().unwrap().extend([
            Err(ApiError::Server(Box::new(ServerError {
                status: 409,
                code: "device_limit".into(),
                devices: devices.clone(),
                ..ServerError::default()
            }))),
            Err(server(423, "license_locked")),
            Err(ApiError::Server(Box::new(ServerError {
                status: 429,
```

bằng

```rust
            last_validated_at: Some(T0),
        }];
        api.replies.lock().unwrap().extend([
            Err(conflict_error("key_in_use", &["a1"])),
            Err(server(423, "license_locked")),
            Err(ApiError::Server(Box::new(ServerError {
                status: 429,
```

`src-tauri/src/license/manager.rs`: thay

```rust
                ..ServerError::default()
            }))),
        ]);
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::DeviceLimit(devices)));
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::Locked));
        assert_eq!(
            l.activate(KEY, T0),
```

bằng

```rust
                ..ServerError::default()
            }))),
        ]);
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::KeyInUse(devices)));
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::Locked));
        assert_eq!(
            l.activate(KEY, T0),
```

`src-tauri/src/license/manager.rs`: thay

```rust
        assert_eq!(l.start_block(after), Some(StartBlock::TrialEnded));
        assert_eq!(l.start_block(T0 + 60), None, "gói trả phí còn hạn: không cần dùng thử");
    }
}
```

bằng

```rust
        assert_eq!(l.start_block(after), Some(StartBlock::TrialEnded));
        assert_eq!(l.start_block(T0 + 60), None, "gói trả phí còn hạn: không cần dùng thử");
    }

    // ---- Mỗi key một máy (spec 2026-10-07 §4.2) ----

    /// Lỗi `409 key_in_use` hay `409 license_conflict` với các máy `ids`.
    fn conflict_error(code: &str, ids: &[&str]) -> ApiError {
        ApiError::Server(Box::new(ServerError {
            status: 409,
            code: code.into(),
            devices: ids
                .iter()
                .map(|id| Device {
                    activation_id: (*id).into(),
                    device_label: None,
                    last_validated_at: Some(T0),
                })
                .collect(),
            ..ServerError::default()
        }))
    }

    /// `409 license_conflict` của `activate`: các máy `ids`, máy vừa gọi là `own`.
    fn conflict_reply(ids: &[&str], own: &str) -> ApiError {
        let ApiError::Server(mut e) = conflict_error("license_conflict", ids) else {
            unreachable!()
        };
        e.activation_id = Some(own.into());
        ApiError::Server(e)
    }

    /// Token của activation `id`.
    fn granted_for(id: &str, issued_at: i64) -> Result<Granted, ApiError> {
        let mut c = claims(issued_at);
        c["activation_id"] = json!(id);
        granted(&c, false)
    }

    fn ids(v: &LicenseView) -> Vec<String> {
        v.conflict
            .as_ref()
            .map(|c| c.devices.iter().map(|d| d.activation_id.clone()).collect())
            .unwrap_or_default()
    }

    /// "Vẫn kích hoạt": kích hoạt với `allow_conflict`. Key vào trạng thái xung đột: không còn gói trả phí, máy chạy theo
    /// Free; activation của máy này lấy từ `activation_id` của response. Mở lại app vẫn xung đột; `validate` mỗi 15 phút,
    /// nhận token thì về bình thường.
    #[test]
    fn activating_anyway_puts_the_key_in_conflict() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&["a1", "a2"], "a2")));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Conflict(d)) if d.len() == 2));
        assert_eq!(
            *api.calls.lock().unwrap(),
            [format!(
                "activate 0123456789ABCDEFGHJKMNPQRST5 {DEVICE} Mac allow_conflict"
            )]
        );
        let v = l.view(T0);
        assert_eq!((v.standing, v.plan.as_str()), (Standing::Conflict, "free"));
        assert_eq!(ids(&v), ["a1", "a2"]);
        assert_eq!(v.conflict.unwrap().this_activation_id, "a2");
        assert!(!l.is_pro(T0) && l.can_start(T0), "Free theo dùng thử");
        let l = license(&api, &vault, T0 + 60);
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "mở lại app vẫn xung đột");
        assert!(l.validate_due(T0 + 60), "mở lại app: thử ngay");
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let _ = l.validate(T0 + 60);
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "lỗi mạng: vẫn xung đột");
        assert!(!l.validate_due(T0 + 60 + 899));
        assert!(l.validate_due(T0 + 60 + 900));
        api.replies.lock().unwrap().push_back(granted_for("a2", T0 + 960));
        l.validate(T0 + 960).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "validate 0123456789ABCDEFGHJKMNPQRST5 a2"
        );
        assert_eq!(l.view(T0 + 960).standing, Standing::Active);
    }

    /// Máy kia đã gỡ key trong lúc người dùng đọc hộp thoại: "Vẫn kích hoạt" nhận token như kích hoạt bình thường.
    #[test]
    fn activating_anyway_after_the_other_machine_left_gets_a_token() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate_anyway(KEY, T0).unwrap();
        assert_eq!(api.calls.lock().unwrap().len(), 1);
        assert_eq!(l.view(T0).standing, Standing::Active);
    }

    /// `validate` trả `license_conflict`: bỏ token, giữ key và `activation_id`; gỡ máy kia bằng key đã lưu, rồi `validate`
    /// nhận token lại.
    #[test]
    fn a_conflict_found_by_validate_drops_the_token_and_keeps_the_key() {
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        assert!(matches!(l.validate(T0 + 60), Err(LicenseError::Conflict(_))));
        let v = l.view(T0 + 60);
        assert_eq!(v.standing, Standing::Conflict);
        assert_eq!(v.conflict.unwrap().this_activation_id, "act");
        assert!(!l.is_pro(T0 + 60));
        let record: LicenseRecord = store::read(vault.as_ref(), store::LICENSE).unwrap().unwrap();
        assert_eq!((record.token.as_str(), record.activation_id.as_str()), ("", "act"));
        l.deactivate_saved_other("other").unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "deactivate 0123456789ABCDEFGHJKMNPQRST5 other"
        );
        api.replies.lock().unwrap().push_back(granted_for("act", T0 + 120));
        l.validate(T0 + 120).unwrap();
        assert_eq!(l.view(T0 + 120).standing, Standing::Active);
        assert!(l.view(T0 + 120).conflict.is_none());
    }

    /// "Gỡ key khỏi máy này" lúc xung đột: gỡ activation của máy này, về Free.
    #[test]
    fn leaving_a_conflict_from_this_machine() {
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        l.deactivate(None).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "deactivate 0123456789ABCDEFGHJKMNPQRST5 act"
        );
        assert_eq!(l.view(T0 + 60).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// Máy này đã kích hoạt key mà key đang xung đột: `activate` (không `allow_conflict`) cũng vào trạng thái xung đột với
    /// activation của máy này trong response. Response `license_conflict` không có `activation_id` (sai hợp đồng): báo lỗi
    /// server, không lưu gì.
    #[test]
    fn a_conflict_reply_must_name_this_machine() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&["a1", "a2"], "a1")));
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::Conflict(_))));
        assert_eq!(l.view(T0).conflict.unwrap().this_activation_id, "a1");
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["a1", "a2"])));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Server(_))));
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// Kiểm nhanh lúc bắt đầu phiên trả phí: chỉ khi lần `validate` thành công gần nhất đã quá 1 giờ (spec 2026-10-07 §4.2).
    #[test]
    fn a_paid_session_start_checks_the_key_when_the_last_check_is_over_an_hour_old() {
        let (api, _, l) = activated(T0, true);
        assert!(!l.quick_check_due(T0 + 3599));
        assert!(l.quick_check_due(T0 + 3600));
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "b"])));
        let _ = l.validate(T0 + 3600);
        assert!(!l.quick_check_due(T0 + 7200), "đang xung đột: không phải phiên trả phí");
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let free = license(&api, &vault, T0);
        assert!(!free.quick_check_due(T0 + 7200));
    }
}
```

`src-tauri/src/license/store.rs`: thay

```rust
            token: vectors["tokens"][0]["token"].as_str().unwrap().into(),
            validated_at: 1_790_816_400,
            verdict: Some(Verdict::Revoked),
        };
        write(&ks, LICENSE, &record).unwrap();
        assert_eq!(read::<LicenseRecord>(&ks, LICENSE).unwrap(), Some(record));
```

bằng

```rust
            token: vectors["tokens"][0]["token"].as_str().unwrap().into(),
            validated_at: 1_790_816_400,
            verdict: Some(Verdict::Revoked),
            devices: Vec::new(),
        };
        write(&ks, LICENSE, &record).unwrap();
        assert_eq!(read::<LicenseRecord>(&ks, LICENSE).unwrap(), Some(record));
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator --lib license::
```

Kết quả mong đợi: lỗi biên dịch: `LicenseError::KeyInUse`, `LicenseError::Conflict`, `Standing::Conflict` chưa có; `License` chưa có `activate_anyway`, `deactivate_saved_other`, `quick_check_due`; `LicenseView` chưa có trường `conflict`.

- [ ] **Step 3: Viết code**

`src-tauri/src/license/app.rs`: thay

```rust
            view: Some(license.view(now())),
            devices: None,
        }),
        Err(LicenseError::DeviceLimit(devices)) => Ok(ActivateOutcome {
            view: None,
            devices: Some(devices),
        }),
```

bằng

```rust
            view: Some(license.view(now())),
            devices: None,
        }),
        Err(LicenseError::KeyInUse(devices)) => Ok(ActivateOutcome {
            view: None,
            devices: Some(devices),
        }),
```

`src-tauri/src/license/device.rs`: thay

```rust
//! Mã máy gửi cho license server (spec §6.8): `device_id_hash` là SHA-256 (64 chữ số hex thường) của ID phần cứng, và
//! `device_label` là tên máy để người dùng nhận ra máy trong danh sách khi key đã đủ 2 máy (`409 device_limit`).
//!
//! - macOS: ID phần cứng là IOPlatformUUID, đọc bằng `gethostuuid` (cùng giá trị `ioreg` hiện), dạng chữ hoa có gạch nối.
//! - Windows: `MachineGuid` ở `HKLM\SOFTWARE\Microsoft\Cryptography` (khung 64 bit), nguyên văn như registry lưu. Cần
```

bằng

```rust
//! Mã máy gửi cho license server (spec §6.8): `device_id_hash` là SHA-256 (64 chữ số hex thường) của ID phần cứng, và
//! `device_label` là tên máy để người dùng nhận ra máy trong danh sách `409 key_in_use` hay `409 license_conflict`.
//!
//! - macOS: ID phần cứng là IOPlatformUUID, đọc bằng `gethostuuid` (cùng giá trị `ioreg` hiện), dạng chữ hoa có gạch nối.
//! - Windows: `MachineGuid` ở `HKLM\SOFTWARE\Microsoft\Cryptography` (khung 64 bit), nguyên văn như registry lưu. Cần
```

`src-tauri/src/license/manager.rs`: thay

```rust
//!   được. Ba việc sau thử lại mỗi 5 phút. `429` thì chờ đúng `Retry-After`.
//! - **Kết quả của server:** máy bị gỡ (`activation_not_found`) hay key không còn (`invalid_key`): xóa bản ghi license,
//!   về Free. Thu hồi, hết hạn: giữ key để gia hạn, về Free. Lỗi mạng: giữ token tới `refresh_before` (§9).
//! - **Free là dùng thử 10 ngày** (spec 2026-10-07 §3.2): dùng được khi không có gói trả phí hiệu lực, có token dùng thử
//!   của máy này ([`super::trial`]), giờ tin được còn trước `ends_at` và giờ máy không bị chỉnh lùi, và bộ đếm của ngày
//!   chưa hết. Bấm Bắt đầu ở Free mà chưa có token thì đăng ký ngay ([`License::start_block`]); ngoài ra ticker đăng ký chạy
```

bằng

```rust
//!   được. Ba việc sau thử lại mỗi 5 phút. `429` thì chờ đúng `Retry-After`.
//! - **Kết quả của server:** máy bị gỡ (`activation_not_found`) hay key không còn (`invalid_key`): xóa bản ghi license,
//!   về Free. Thu hồi, hết hạn: giữ key để gia hạn, về Free. Lỗi mạng: giữ token tới `refresh_before` (§9).
//! - **Mỗi key một máy** (spec 2026-10-07 §4.2): `409 key_in_use` khi kích hoạt thì trả danh sách máy đang giữ key;
//!   "Vẫn kích hoạt" ([`License::activate_anyway`]), `activate` hay `validate` nhận `409 license_conflict` thì key vào
//!   trạng thái xung đột: bỏ token, giữ key và `activation_id` (của `activate`: trường `activation_id` của response), máy
//!   chạy theo Free, `validate` mỗi 15 phút tới khi một máy gỡ key.
//!   Bắt đầu phiên trả phí mà lần `validate` thành công gần nhất đã quá 1 giờ thì app kiểm lại chạy nền
//!   ([`License::quick_check_due`]).
//! - **Free là dùng thử 10 ngày** (spec 2026-10-07 §3.2): dùng được khi không có gói trả phí hiệu lực, có token dùng thử
//!   của máy này ([`super::trial`]), giờ tin được còn trước `ends_at` và giờ máy không bị chỉnh lùi, và bộ đếm của ngày
//!   chưa hết. Bấm Bắt đầu ở Free mà chưa có token thì đăng ký ngay ([`License::start_block`]); ngoài ra ticker đăng ký chạy
```

`src-tauri/src/license/manager.rs`: thay

```rust
const ROUTINE_RETRY_SECS: i64 = 3600;
const URGENT_RETRY_SECS: i64 = 300;
const CYCLE_RETRY_SLACK_SECS: i64 = 60;
/// Tới `expires_at`, gói còn dùng được trong lúc chờ lần `validate` đầu sau mốc (có thể đã gia hạn ở máy khác), tối đa
/// chừng này (N4 của review 06 lần 1).
pub const EXPIRY_GRACE_SECS: i64 = 300;
```

bằng

```rust
const ROUTINE_RETRY_SECS: i64 = 3600;
const URGENT_RETRY_SECS: i64 = 300;
const CYCLE_RETRY_SLACK_SECS: i64 = 60;
/// Đang xung đột: `validate` lại mỗi chừng này (spec 2026-10-07 §4.2).
pub const CONFLICT_RETRY_SECS: i64 = 15 * 60;
/// Bắt đầu phiên trả phí mà lần `validate` thành công gần nhất đã quá chừng này thì kiểm lại chạy nền (spec 2026-10-07
/// §4.2).
pub const QUICK_CHECK_SECS: i64 = 3600;
/// Tới `expires_at`, gói còn dùng được trong lúc chờ lần `validate` đầu sau mốc (có thể đã gia hạn ở máy khác), tối đa
/// chừng này (N4 của review 06 lần 1).
pub const EXPIRY_GRACE_SECS: i64 = 300;
```

`src-tauri/src/license/manager.rs`: thay

```rust
    Unverified,
    /// Bản cài không chính hãng (§10.2): chỉ chạy Free.
    NotGenuine,
}

/// Tình trạng dùng thử của Free (spec 2026-10-07 §3.2).
```

bằng

```rust
    Unverified,
    /// Bản cài không chính hãng (§10.2): chỉ chạy Free.
    NotGenuine,
    /// Key đang kích hoạt trên từ 2 máy: tạm khóa cho tới khi một máy gỡ key; máy chạy theo Free (spec 2026-10-07 §4.2).
    Conflict,
}

/// Trạng thái xung đột cho giao diện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictView {
    /// Các máy đang kích hoạt key (gồm cả máy này).
    pub devices: Vec<Device>,
    /// Activation của máy này trong `devices`.
    pub this_activation_id: String,
}

/// Tình trạng dùng thử của Free (spec 2026-10-07 §3.2).
```

`src-tauri/src/license/manager.rs`: thay

```rust
    pub clock_rolled_back: bool,
    /// Dùng thử của Free trên máy này.
    pub trial: TrialView,
}

/// Lỗi của một thao tác bản quyền; giao diện chọn câu theo [`LicenseError::code`].
```

bằng

```rust
    pub clock_rolled_back: bool,
    /// Dùng thử của Free trên máy này.
    pub trial: TrialView,
    /// Đang xung đột (`Standing::Conflict`): danh sách máy và máy này.
    pub conflict: Option<ConflictView>,
}

/// Lỗi của một thao tác bản quyền; giao diện chọn câu theo [`LicenseError::code`].
```

`src-tauri/src/license/manager.rs`: thay

```rust
    Network,
    #[error("server bảo thử lại sau")]
    RateLimited(Option<u64>),
    #[error("key đã kích hoạt đủ 2 máy")]
    DeviceLimit(Vec<Device>),
    #[error("key đang bị khóa tạm")]
    Locked,
    #[error("license đã bị thu hồi")]
```

bằng

```rust
    Network,
    #[error("server bảo thử lại sau")]
    RateLimited(Option<u64>),
    #[error("key đang dùng ở máy khác")]
    KeyInUse(Vec<Device>),
    #[error("key đang kích hoạt trên từ 2 máy, đã tạm khóa")]
    Conflict(Vec<Device>),
    #[error("key đang bị khóa tạm")]
    Locked,
    #[error("license đã bị thu hồi")]
```

`src-tauri/src/license/manager.rs`: thay

```rust
    "licenseNotConfigured",
    "licenseNetwork",
    "licenseRateLimited",
    "licenseDeviceLimit",
    "licenseLocked",
    "licenseRevoked",
    "licenseExpired",
```

bằng

```rust
    "licenseNotConfigured",
    "licenseNetwork",
    "licenseRateLimited",
    "licenseKeyInUse",
    "licenseConflict",
    "licenseLocked",
    "licenseRevoked",
    "licenseExpired",
```

`src-tauri/src/license/manager.rs`: thay

```rust
            Self::NotConfigured => "licenseNotConfigured",
            Self::Network => "licenseNetwork",
            Self::RateLimited(_) => "licenseRateLimited",
            Self::DeviceLimit(_) => "licenseDeviceLimit",
            Self::Locked => "licenseLocked",
            Self::Revoked => "licenseRevoked",
            Self::Expired(_) => "licenseExpired",
```

bằng

```rust
            Self::NotConfigured => "licenseNotConfigured",
            Self::Network => "licenseNetwork",
            Self::RateLimited(_) => "licenseRateLimited",
            Self::KeyInUse(_) => "licenseKeyInUse",
            Self::Conflict(_) => "licenseConflict",
            Self::Locked => "licenseLocked",
            Self::Revoked => "licenseRevoked",
            Self::Expired(_) => "licenseExpired",
```

`src-tauri/src/license/manager.rs`: thay

```rust
        ApiError::Network(_) => LicenseError::Network,
        ApiError::Decode(m) => LicenseError::Server(m),
        ApiError::Server(s) => match (s.status, s.code.as_str()) {
            (_, "device_limit") => LicenseError::DeviceLimit(s.devices),
            (_, "license_locked") => LicenseError::Locked,
            (_, "license_revoked") => LicenseError::Revoked,
            (_, "license_expired") => LicenseError::Expired(s.expires_at),
```

bằng

```rust
        ApiError::Network(_) => LicenseError::Network,
        ApiError::Decode(m) => LicenseError::Server(m),
        ApiError::Server(s) => match (s.status, s.code.as_str()) {
            (_, "key_in_use") => LicenseError::KeyInUse(s.devices),
            (_, "license_conflict") => LicenseError::Conflict(s.devices),
            (_, "license_locked") => LicenseError::Locked,
            (_, "license_revoked") => LicenseError::Revoked,
            (_, "license_expired") => LicenseError::Expired(s.expires_at),
```

`src-tauri/src/license/manager.rs`: thay

```rust
        match record.verdict {
            Some(Verdict::Revoked) => return Standing::Revoked,
            Some(Verdict::Expired) => return Standing::Expired,
            None => {}
        }
        let Some(claims) = &inner.claims else {
```

bằng

```rust
        match record.verdict {
            Some(Verdict::Revoked) => return Standing::Revoked,
            Some(Verdict::Expired) => return Standing::Expired,
            Some(Verdict::Conflict) => return Standing::Conflict,
            None => {}
        }
        let Some(claims) = &inner.claims else {
```

`src-tauri/src/license/manager.rs`: thay

```rust
            token: granted.token,
            validated_at: now,
            verdict: None,
        };
        store::write(self.vault.as_ref(), store::LICENSE, &record).map_err(|e| LicenseError::Storage(e.to_string()))?;
        let mut inner = self.lock();
```

bằng

```rust
            token: granted.token,
            validated_at: now,
            verdict: None,
            devices: Vec::new(),
        };
        store::write(self.vault.as_ref(), store::LICENSE, &record).map_err(|e| LicenseError::Storage(e.to_string()))?;
        let mut inner = self.lock();
```

`src-tauri/src/license/manager.rs`: thay

```rust
        Ok(())
    }

    /// Kích hoạt key người dùng gõ trên máy này.
    pub fn activate(&self, input: &str, now: i64) -> Result<(), LicenseError> {
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        let reply = self
            .api
            .activate(&key, &self.machine.id_hash, self.machine.label.as_deref(), false);
        self.observe(&reply);
        let granted = reply.result.map_err(map_api)?;
        self.accept(granted, key, now)
    }

    /// Làm mới token của key đã kích hoạt.
```

bằng

```rust
        Ok(())
    }

    /// Kích hoạt key người dùng gõ trên máy này. `409 key_in_use`: [`LicenseError::KeyInUse`], không đổi gì. Máy này đã
    /// kích hoạt key mà key đang xung đột: vào trạng thái xung đột ([`LicenseError::Conflict`]).
    pub fn activate(&self, input: &str, now: i64) -> Result<(), LicenseError> {
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        self.activate_with(key, false, now)
    }

    /// "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2): kích hoạt với `allow_conflict`. Máy kia đã gỡ key trong lúc
    /// người dùng đọc hộp thoại thì nhận token như kích hoạt bình thường; còn lại server trả `409 license_conflict` và key
    /// vào trạng thái xung đột.
    pub fn activate_anyway(&self, input: &str, now: i64) -> Result<(), LicenseError> {
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        self.activate_with(key, true, now)
    }

    /// Gọi `activate`. `409 license_conflict` mang `activation_id` của chính máy này (hợp đồng của kế hoạch 00): vào
    /// trạng thái xung đột với activation đó; thiếu trường này là response sai hợp đồng, báo lỗi server, không lưu gì.
    fn activate_with(&self, key: String, allow_conflict: bool, now: i64) -> Result<(), LicenseError> {
        let reply = self.api.activate(
            &key,
            &self.machine.id_hash,
            self.machine.label.as_deref(),
            allow_conflict,
        );
        self.observe(&reply);
        match reply.result {
            Ok(granted) => self.accept(granted, key, now),
            Err(ApiError::Server(s)) if s.code == "license_conflict" => {
                let Some(activation_id) = s.activation_id else {
                    return Err(LicenseError::Server("license_conflict không có activation_id".into()));
                };
                Err(self.enter_conflict(key, activation_id, s.devices, now))
            }
            Err(e) => Err(map_api(e)),
        }
    }

    /// Vào trạng thái xung đột: lưu key, `activation_id` của máy này và danh sách máy, bỏ token. Trả lỗi
    /// [`LicenseError::Conflict`] để nơi gọi báo.
    fn enter_conflict(&self, key: String, activation_id: String, devices: Vec<Device>, now: i64) -> LicenseError {
        let mut inner = self.lock();
        let validated_at = inner
            .record
            .as_ref()
            .filter(|r| r.key == key)
            .map_or(now, |r| r.validated_at);
        let record = LicenseRecord {
            key,
            activation_id,
            token: String::new(),
            validated_at,
            verdict: Some(Verdict::Conflict),
            devices: devices.clone(),
        };
        if let Err(e) = store::write(self.vault.as_ref(), store::LICENSE, &record) {
            log::warn!("không ghi được trạng thái xung đột: {e}");
        }
        inner.record = Some(record);
        inner.claims = None;
        inner.paid = None;
        inner.last_attempt = Some(now);
        LicenseError::Conflict(devices)
    }

    /// Làm mới token của key đã kích hoạt.
```

`src-tauri/src/license/manager.rs`: thay

```rust
        self.observe(&reply);
        match reply.result.map_err(map_api) {
            Ok(granted) => self.accept(granted, record.key, now),
            Err(e) => {
                let mut inner = self.lock();
                match &e {
```

bằng

```rust
        self.observe(&reply);
        match reply.result.map_err(map_api) {
            Ok(granted) => self.accept(granted, record.key, now),
            Err(LicenseError::Conflict(devices)) => {
                Err(self.enter_conflict(record.key, record.activation_id, devices, now))
            }
            Err(e) => {
                let mut inner = self.lock();
                match &e {
```

`src-tauri/src/license/manager.rs`: thay

```rust
        }
    }

    /// Gỡ kích hoạt. `remote`: gỡ máy khác của key (từ danh sách `409 device_limit`), với key người dùng vừa gõ.
    pub fn deactivate(&self, remote: Option<(&str, &str)>) -> Result<(), LicenseError> {
        if let Some((input, activation_id)) = remote {
            let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
```

bằng

```rust
        }
    }

    /// Gỡ một máy khác của key đã lưu (đang xung đột: "Gỡ máy kia"). Nơi gọi `validate` ngay sau đó để nhận token lại.
    pub fn deactivate_saved_other(&self, activation_id: &str) -> Result<(), LicenseError> {
        let key = self.license_key().ok_or(LicenseError::NotActivated)?;
        let reply = self.api.deactivate(&key, activation_id);
        self.observe(&reply);
        reply.result.map_err(map_api)
    }

    /// Gỡ kích hoạt. `remote`: gỡ máy khác của key (từ danh sách `409 key_in_use`), với key người dùng vừa gõ.
    pub fn deactivate(&self, remote: Option<(&str, &str)>) -> Result<(), LicenseError> {
        if let Some((input, activation_id)) = remote {
            let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
```

`src-tauri/src/license/manager.rs`: thay

```rust
            return false;
        }
        let since_attempt = inner.last_attempt.map_or(i64::MAX, |t| now - t);
        let trusted = inner.seen.trusted_now(now);
        let urgent = inner.claims.as_ref().is_none_or(|c| {
            trusted >= c.expires_at
```

bằng

```rust
            return false;
        }
        let since_attempt = inner.last_attempt.map_or(i64::MAX, |t| now - t);
        if record.verdict == Some(Verdict::Conflict) {
            return !(0..CONFLICT_RETRY_SECS).contains(&since_attempt);
        }
        let trusted = inner.seen.trusted_now(now);
        let urgent = inner.claims.as_ref().is_none_or(|c| {
            trusted >= c.expires_at
```

`src-tauri/src/license/manager.rs`: thay

```rust
        (urgent && since_attempt >= URGENT_RETRY_SECS) || (routine && since_attempt >= ROUTINE_RETRY_SECS)
    }

    /// Gọi định kỳ (mỗi phút): cộng thời gian đơn điệu, reset Free khi sang ngày, ghi giờ máy lớn nhất.
    pub fn tick(&self, now: i64, elapsed_ms: u64) {
        let mut inner = self.lock();
```

bằng

```rust
        (urgent && since_attempt >= URGENT_RETRY_SECS) || (routine && since_attempt >= ROUTINE_RETRY_SECS)
    }

    /// Bắt đầu phiên trả phí lúc `now`: có nên `validate` chạy nền không (lần thành công gần nhất đã quá 1 giờ).
    pub fn quick_check_due(&self, now: i64) -> bool {
        let inner = self.lock();
        let Some(record) = &inner.record else {
            return false;
        };
        self.server_configured
            && !self.dev_unlimited
            && inner.blocked_until.is_none_or(|t| now >= t)
            && self.quota_claims(&inner, now).is_some()
            && (now - record.validated_at >= QUICK_CHECK_SECS || now < record.validated_at)
    }

    /// Gọi định kỳ (mỗi phút): cộng thời gian đơn điệu, reset Free khi sang ngày, ghi giờ máy lớn nhất.
    pub fn tick(&self, now: i64, elapsed_ms: u64) {
        let mut inner = self.lock();
```

`src-tauri/src/license/manager.rs`: thay

```rust
            dev_override: self.dev_unlimited,
            clock_rolled_back: inner.seen.rolled_back(now),
            trial,
        }
    }

```

bằng

```rust
            dev_override: self.dev_unlimited,
            clock_rolled_back: inner.seen.rolled_back(now),
            trial,
            conflict: inner
                .record
                .as_ref()
                .filter(|r| r.verdict == Some(Verdict::Conflict))
                .map(|r| ConflictView {
                    devices: r.devices.clone(),
                    this_activation_id: r.activation_id.clone(),
                }),
        }
    }

```

`src-tauri/src/license/store.rs`: thay

```rust
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};

use super::quota::{FreeCounter, Marker, PaidCounter, PaidKey, PaidState, Seen};
use crate::security::keystore::Keystore;

```

bằng

```rust
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};

use super::client::Device;
use super::quota::{FreeCounter, Marker, PaidCounter, PaidKey, PaidState, Seen};
use crate::security::keystore::Keystore;

```

`src-tauri/src/license/store.rs`: thay

```rust
    /// offline. Token mới từ server xóa nó.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verdict: Option<Verdict>,
}

/// Kết luận của server khi `validate`.
```

bằng

```rust
    /// offline. Token mới từ server xóa nó.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verdict: Option<Verdict>,
    /// Trạng thái xung đột (`Verdict::Conflict`): các máy đang kích hoạt key, theo lần trả lời gần nhất của server, để
    /// mở lại app khi offline vẫn hiện được danh sách (spec 2026-10-07 §4.2).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub devices: Vec<Device>,
}

/// Kết luận của server khi `validate`.
```

`src-tauri/src/license/store.rs`: thay

```rust
pub enum Verdict {
    Expired,
    Revoked,
}

/// Token dùng thử server đã cấp cho máy này. Giữ khi người dùng xóa dữ liệu, như bản ghi license.
```

bằng

```rust
pub enum Verdict {
    Expired,
    Revoked,
    /// `409 license_conflict`: key đang kích hoạt trên từ 2 máy; token đã bỏ, chờ một máy gỡ key (spec 2026-10-07 §4.2).
    Conflict,
}

/// Token dùng thử server đã cấp cho máy này. Giữ khi người dùng xóa dữ liệu, như bản ghi license.
```

`src/i18n/en.ts`: thay

```ts
  "error.licenseNotConfigured": "This build cannot reach the license server.",
  "error.licenseNetwork": "Could not reach the license server. Check your internet connection and try again.",
  "error.licenseRateLimited": "Too many attempts. Please try again later.",
  "error.licenseDeviceLimit": "This key is already active on 2 computers. Remove one of them to use it here.",
  "error.licenseLocked": "This key is temporarily locked because computers were changed too often. Please contact support.",
  "error.licenseRevoked": "This license has been revoked. Please contact support.",
  "error.licenseExpired": "This license has expired. Renew it to keep using Pro features.",
```

bằng

```ts
  "error.licenseNotConfigured": "This build cannot reach the license server.",
  "error.licenseNetwork": "Could not reach the license server. Check your internet connection and try again.",
  "error.licenseRateLimited": "Too many attempts. Please try again later.",
  "error.licenseKeyInUse": "This key is in use on another computer. Remove it there, or remove that computer from here.",
  "error.licenseConflict": "This key is active on 2 computers, so it is locked on both until one of them removes the key.",
  "error.licenseLocked": "This key is temporarily locked because computers were changed too often. Please contact support.",
  "error.licenseRevoked": "This license has been revoked. Please contact support.",
  "error.licenseExpired": "This license has expired. Renew it to keep using Pro features.",
```

`src/i18n/vi.ts`: thay

```ts
  "error.licenseNotConfigured": "Bản cài này chưa kết nối được máy chủ bản quyền.",
  "error.licenseNetwork": "Không kết nối được máy chủ bản quyền. Kiểm tra mạng rồi thử lại.",
  "error.licenseRateLimited": "Thử quá nhiều lần. Vui lòng thử lại sau.",
  "error.licenseDeviceLimit": "Key này đã kích hoạt trên 2 máy. Gỡ một máy để dùng ở máy này.",
  "error.licenseLocked": "Key này đang bị khóa tạm vì đổi máy quá nhiều lần. Vui lòng liên hệ hỗ trợ.",
  "error.licenseRevoked": "License này đã bị thu hồi. Vui lòng liên hệ hỗ trợ.",
  "error.licenseExpired": "License này đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
```

bằng

```ts
  "error.licenseNotConfigured": "Bản cài này chưa kết nối được máy chủ bản quyền.",
  "error.licenseNetwork": "Không kết nối được máy chủ bản quyền. Kiểm tra mạng rồi thử lại.",
  "error.licenseRateLimited": "Thử quá nhiều lần. Vui lòng thử lại sau.",
  "error.licenseKeyInUse": "Key này đang dùng ở máy khác. Gỡ key ở máy đó, hay gỡ máy đó từ đây.",
  "error.licenseConflict": "Key này đang kích hoạt trên 2 máy nên đã bị tạm khóa trên cả hai, tới khi một máy gỡ key.",
  "error.licenseLocked": "Key này đang bị khóa tạm vì đổi máy quá nhiều lần. Vui lòng liên hệ hỗ trợ.",
  "error.licenseRevoked": "License này đã bị thu hồi. Vui lòng liên hệ hỗ trợ.",
  "error.licenseExpired": "License này đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 460 passed; 0 failed; 3 ignored`.

```bash
pnpm test
```

Kết quả mong đợi: `Tests  162 passed (162)`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_tests.rs src-tauri/src/license/app.rs src-tauri/src/license/device.rs src-tauri/src/license/manager.rs src-tauri/src/license/store.rs src/i18n/en.ts src/i18n/vi.ts
git commit -m "feat(license): mỗi key một máy: key_in_use, Vẫn kích hoạt, trạng thái xung đột

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 7: Nối vào app: lỗi bắt đầu phiên, `start_trial`, kiểm nhanh, dừng phiên

Commit tham chiếu: `1202bf7`.

- `check_start` báo đúng lý do: `quotaExhausted`, `trialEnded`, `trialNeedsNetwork`, `clockRolledBack`.
- Lệnh mới `start_trial` (cửa sổ chính, không chờ server): giao diện gọi khi qua bước Điều khoản. Ticker đăng ký dùng
  thử lúc khởi động và mỗi phút (đúng lịch `trial_due`). Đã xong onboarding từ lần chạy trước thì cho phép ngay lúc cài.
- `activate_license` nhận thêm `allowConflict`; `deactivate_other_device` nhận `key` tùy chọn (không có thì dùng key đã
  lưu, rồi `validate` ngay).
- Kiểm nhanh: `session::start_with` gọi `license::app::quick_check` sau khi đã sang `Starting`; `validate` chạy nền.
  `validate` (kiểm nhanh hay kiểm định kỳ) cho thấy gói trả phí không còn dùng được thì `session::abort` dừng phiên với
  `licenseConflict` hay `licenseInvalid`; chỉ khi trước đó đang có gói trả phí, để lần thử lại 15 phút lúc đang xung đột
  không dừng phiên Free.
- `session::abort`: đang bắt đầu thì hủy lần đó như nút Hủy rồi báo lỗi; đang chạy thì dừng như lỗi của engine.

Trong app giả của test, gate Pro là `FakePro` của `test_support` (cài trước, `app.manage` lần hai không thay được), nên
test kiểm `license.is_pro` chứ không kiểm `AppStatus.pro`.

**Files:**
- Modify: `src-tauri/build.rs` (lệnh mới vào app manifest)
- Modify: `src-tauri/capabilities/main.json` (cấp lệnh cho cửa sổ chính)
- Test: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/license/app.rs`
- Modify: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`

- [ ] **Step 1: Viết test trước**

`src-tauri/src/app_tests.rs`: thay

```rust
    assert!(bad.contains("licenseInvalidKey"), "{bad}");
}

// Tự cập nhật (kế hoạch 07b): lệnh khởi động lại, đổi kênh, cài ở lúc thoát.

/// Việc của `kill_all` giả và của bản cập nhật giả, cùng một chỗ để so thứ tự.
```

bằng

```rust
    assert!(bad.contains("licenseInvalidKey"), "{bad}");
}

/// Claims của license Monthly cấp lúc `issued_at` (giờ thật), cho các test bản quyền của app.
fn monthly_claims(activation_id: &str, issued_at: i64) -> Value {
    json!({
        "kid": "test-1", "license_id": "lic", "activation_id": activation_id, "activation_created_at": issued_at,
        "device_id_hash": crate::license::manager::tests::DEVICE, "plan": "monthly",
        "expires_at": issued_at + 30 * 86_400, "cycle_anchor": issued_at,
        "quota_minutes_per_cycle": 3000, "quota_epoch": 0, "quota_fresh": true,
        "issued_at": issued_at, "refresh_before": issued_at + 14 * 86_400,
    })
}

/// Lỗi `409` có danh sách máy.
fn devices_error(code: &str, ids: &[&str]) -> crate::license::client::ApiError {
    use crate::license::client::{ApiError, Device, ServerError};
    ApiError::Server(Box::new(ServerError {
        status: 409,
        code: code.into(),
        devices: ids
            .iter()
            .map(|id| Device {
                activation_id: (*id).into(),
                device_label: None,
                last_validated_at: Some(1),
            })
            .collect(),
        ..ServerError::default()
    }))
}

/// Free (spec 2026-10-07 §3.2, §6): chưa đăng ký được dùng thử thì báo cần mạng; dùng thử đã hết thì báo hết dùng thử.
#[test]
fn a_free_session_needs_a_running_trial() {
    use crate::license::client::ApiError;
    use crate::license::manager::tests::{DEVICE, trial_grant};
    let app = mock_app();
    let (api, _) = license_for(&app);
    api.trials
        .lock()
        .unwrap()
        .push_back(Err(ApiError::Network("tắt mạng".into())));
    let refused = session::start(app.handle()).unwrap_err();
    assert_eq!(refused.code, errors::TRIAL_NEEDS_NETWORK);
    let now = crate::license::app::now();
    api.trials.lock().unwrap().push_back(trial_grant(
        DEVICE,
        now - 20 * 86_400,
        now - 10 * 86_400,
        now - 20 * 86_400,
    ));
    let refused = session::start(app.handle()).unwrap_err();
    assert_eq!(refused.code, errors::TRIAL_ENDED);
    assert_eq!(
        app.state::<AppState>().status().session_error.as_deref(),
        Some(errors::TRIAL_ENDED)
    );
}

/// Bước Điều khoản gọi `start_trial`: app đăng ký dùng thử chạy nền, báo giao diện qua `license://changed`.
#[test]
fn the_terms_step_starts_the_trial_in_the_background() {
    let app = mock_app();
    let main = window(&app, "main");
    let views = record(&app, crate::license::app::LICENSE_CHANGED);
    let (api, license) = license_for(&app);
    invoke(&main, "start_trial", json!({})).unwrap();
    wait_until("đăng ký dùng thử", || {
        api.calls.lock().unwrap().iter().any(|c| c.starts_with("trial "))
    });
    let now = crate::license::app::now();
    wait_until("báo giao diện", || {
        views
            .lock()
            .unwrap()
            .last()
            .is_some_and(|v| v["trial"]["status"] == "active")
    });
    assert!(!license.trial_due(now), "đã có token: ticker không gọi nữa");
}

/// Bắt đầu phiên trả phí mà lần kiểm gần nhất đã quá 1 giờ: kiểm lại chạy nền; key đang xung đột thì dừng phiên với
/// `licenseConflict` (spec 2026-10-07 §4.2).
#[test]
fn a_conflict_found_when_a_paid_session_starts_stops_it() {
    use crate::license::manager::tests::{KEY, granted};
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let (api, license) = license_for(&app);
    let then = crate::license::app::now() - 3700;
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", then), true));
    license.activate(KEY, then).unwrap();
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(devices_error("license_conflict", &["act", "b"])));
    session::start(app.handle()).unwrap();
    let state = app.state::<AppState>();
    wait_until("phiên dừng vì xung đột", || {
        state.status().session == SessionStatus::Error
    });
    assert_eq!(state.status().session_error.as_deref(), Some(errors::LICENSE_CONFLICT));
    assert!(!license.is_pro(crate::license::app::now()), "không còn gói trả phí");
}

/// "Vẫn kích hoạt" rồi "Gỡ máy kia" bằng key đã lưu: hết xung đột, nhận token lại.
#[test]
fn activating_anyway_then_removing_the_other_machine() {
    use crate::license::manager::tests::{KEY, granted};
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    let crate::license::client::ApiError::Server(mut conflict) = devices_error("license_conflict", &["a1", "a2"])
    else {
        unreachable!()
    };
    conflict.activation_id = Some("a2".into());
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(crate::license::client::ApiError::Server(conflict)));
    let out = invoke(&main, "activate_license", json!({ "key": KEY, "allowConflict": true })).unwrap();
    assert_eq!(out["view"]["standing"], "conflict");
    assert_eq!(out["view"]["conflict"]["thisActivationId"], "a2");
    let now = crate::license::app::now();
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("a2", now), false));
    invoke(&main, "deactivate_other_device", json!({ "activationId": "a1" })).unwrap();
    let calls = api.calls.lock().unwrap().clone();
    assert!(
        calls.iter().any(|c| c == "deactivate 0123456789ABCDEFGHJKMNPQRST5 a1"),
        "{calls:?}"
    );
    assert_eq!(calls.last().unwrap(), "validate 0123456789ABCDEFGHJKMNPQRST5 a2");
    let view = invoke(&main, "get_license", json!({})).unwrap();
    assert_eq!(view["standing"], "active");
}

// Tự cập nhật (kế hoạch 07b): lệnh khởi động lại, đổi kênh, cài ở lúc thoát.

/// Việc của `kill_all` giả và của bản cập nhật giả, cùng một chỗ để so thứ tự.
```

`src-tauri/src/errors.rs`: thay

```rust
                APP_NOT_PLAYING,
                VAD_FAILED,
                QUOTA_EXHAUSTED,
                PRO_REQUIRED,
                DATA_UNAVAILABLE,
                FILE_FAILED,
```

bằng

```rust
                APP_NOT_PLAYING,
                VAD_FAILED,
                QUOTA_EXHAUSTED,
                TRIAL_ENDED,
                TRIAL_NEEDS_NETWORK,
                CLOCK_ROLLED_BACK,
                LICENSE_CONFLICT,
                LICENSE_INVALID,
                PRO_REQUIRED,
                DATA_UNAVAILABLE,
                FILE_FAILED,
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: lỗi biên dịch ở `app_tests.rs`: `errors::TRIAL_NEEDS_NETWORK`, `errors::TRIAL_ENDED`, `errors::LICENSE_CONFLICT` chưa có.

- [ ] **Step 3: Viết code**

`src-tauri/build.rs`: thay

```rust
                "cancel_checkout",
                "open_checkout_page",
                "recover_license",
                "restart_to_update",
                "get_overlay_view",
                "hide_overlay",
```

bằng

```rust
                "cancel_checkout",
                "open_checkout_page",
                "recover_license",
                "start_trial",
                "restart_to_update",
                "get_overlay_view",
                "hide_overlay",
```

`src-tauri/capabilities/main.json`: thay

```json
    "allow-cancel-checkout",
    "allow-open-checkout-page",
    "allow-recover-license",
    "allow-restart-to-update",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
```

bằng

```json
    "allow-cancel-checkout",
    "allow-open-checkout-page",
    "allow-recover-license",
    "allow-start-trial",
    "allow-restart-to-update",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
```

`src-tauri/src/commands.rs`: thay

```rust
    license_app::view(&app)
}

#[tauri::command]
pub async fn activate_license<R: Runtime>(app: AppHandle<R>, key: String) -> Result<ActivateOutcome, CommandError> {
    blocking(app, move |app| license_app::activate(app, &key)).await
}

#[tauri::command]
```

bằng

```rust
    license_app::view(&app)
}

/// `allow_conflict`: người dùng đã xác nhận "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2).
#[tauri::command]
pub async fn activate_license<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    allow_conflict: Option<bool>,
) -> Result<ActivateOutcome, CommandError> {
    blocking(app, move |app| {
        license_app::activate(app, &key, allow_conflict.unwrap_or(false))
    })
    .await
}

#[tauri::command]
```

`src-tauri/src/commands.rs`: thay

```rust
    blocking(app, license_app::deactivate).await
}

/// Gỡ một máy khác của key (danh sách `409 device_limit`), với key người dùng vừa gõ.
#[tauri::command]
pub async fn deactivate_other_device<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    activation_id: String,
) -> Result<(), CommandError> {
    blocking(app, move |app| license_app::deactivate_other(app, &key, &activation_id)).await
}

#[tauri::command]
```

bằng

```rust
    blocking(app, license_app::deactivate).await
}

/// Gỡ một máy khác của key: với key người dùng vừa gõ (danh sách `409 key_in_use`), hay không có `key` thì với key đã lưu
/// (đang xung đột, spec 2026-10-07 §4.2).
#[tauri::command]
pub async fn deactivate_other_device<R: Runtime>(
    app: AppHandle<R>,
    key: Option<String>,
    activation_id: String,
) -> Result<(), CommandError> {
    blocking(app, move |app| {
        license_app::deactivate_other(app, key.as_deref(), &activation_id)
    })
    .await
}

/// Bước Điều khoản vừa được đồng ý: đăng ký dùng thử chạy nền (spec 2026-10-07 §3.2). Không chờ server.
#[tauri::command]
pub fn start_trial<R: Runtime>(app: AppHandle<R>) {
    license_app::start_trial(&app);
}

#[tauri::command]
```

`src-tauri/src/commands.rs`: thay

```rust
    "cancel_checkout",
    "open_checkout_page",
    "recover_license",
    "restart_to_update",
];

```

bằng

```rust
    "cancel_checkout",
    "open_checkout_page",
    "recover_license",
    "start_trial",
    "restart_to_update",
];

```

`src-tauri/src/commands.rs`: thay

```rust
        cancel_checkout,
        open_checkout_page,
        recover_license,
        restart_to_update,
        get_overlay_view,
        hide_overlay,
```

bằng

```rust
        cancel_checkout,
        open_checkout_page,
        recover_license,
        start_trial,
        restart_to_update,
        get_overlay_view,
        hide_overlay,
```

`src-tauri/src/errors.rs`: thay

```rust
pub const VAD_FAILED: &str = "vadFailed";
/// Chạm hạn mức (§6.8): phiên dừng với lý do `quota_exhausted`. Kế hoạch 06 thêm thời điểm reset và nút nâng gói.
pub const QUOTA_EXHAUSTED: &str = "quotaExhausted";
// Mã lỗi của kế hoạch 03.
/// Tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) khi đang ở gói Free (`pro::require`).
pub const PRO_REQUIRED: &str = "proRequired";
```

bằng

```rust
pub const VAD_FAILED: &str = "vadFailed";
/// Chạm hạn mức (§6.8): phiên dừng với lý do `quota_exhausted`. Kế hoạch 06 thêm thời điểm reset và nút nâng gói.
pub const QUOTA_EXHAUSTED: &str = "quotaExhausted";
// Mã lỗi của ba gói và mỗi key một máy (spec 2026-10-07 §3.2, §4.2, §6).
/// Free mà đã hết 10 ngày dùng thử: không bắt đầu phiên, nút Nâng cấp.
pub const TRIAL_ENDED: &str = "trialEnded";
/// Free mà chưa có token dùng thử và đăng ký không được: cần kết nối mạng một lần.
pub const TRIAL_NEEDS_NETWORK: &str = "trialNeedsNetwork";
/// Free mà giờ máy bị coi là chỉnh lùi: chỉnh lại giờ.
pub const CLOCK_ROLLED_BACK: &str = "clockRolledBack";
/// Phiên trả phí dừng vì key đang kích hoạt trên 2 máy (cùng mã với `LicenseError::Conflict`).
pub const LICENSE_CONFLICT: &str = "licenseConflict";
/// Phiên trả phí dừng vì key bị thu hồi hay máy này bị gỡ khỏi key.
pub const LICENSE_INVALID: &str = "licenseInvalid";
// Mã lỗi của kế hoạch 03.
/// Tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) khi đang ở gói Free (`pro::require`).
pub const PRO_REQUIRED: &str = "proRequired";
```

`src-tauri/src/license/app.rs`: thay

```rust
use super::client::{Device, HttpApi, PlanOffer};
use super::device;
use super::keys::PublicKeys;
use super::manager::{License, LicenseError, LicenseView, Machine, Zone};
use super::purchase::{self, CheckoutView, OrderOutcome};
use super::store::Vault;
use crate::errors::{self, CommandError};
```

bằng

```rust
use super::client::{Device, HttpApi, PlanOffer};
use super::device;
use super::keys::PublicKeys;
use super::manager::{License, LicenseError, LicenseView, Machine, StartBlock, Zone};
use super::purchase::{self, CheckoutView, OrderOutcome};
use super::store::Vault;
use crate::errors::{self, CommandError};
```

`src-tauri/src/license/app.rs`: thay

```rust
/// Cài một [`License`] đã dựng (test dùng server và kho khóa giả). Không chạy ticker.
pub fn install_with<R: Runtime>(app: &AppHandle<R>, license: License) {
    let license = Arc::new(license);
    app.manage(Licensing::new(license.clone()));
    if license.dev_unlimited() {
        pro::install_dev_gate(app);
```

bằng

```rust
/// Cài một [`License`] đã dựng (test dùng server và kho khóa giả). Không chạy ticker.
pub fn install_with<R: Runtime>(app: &AppHandle<R>, license: License) {
    let license = Arc::new(license);
    // Đã xong các bước lần đầu mở (đã đồng ý điều khoản ở lần chạy trước): ticker được đăng ký dùng thử chạy nền.
    if app
        .try_state::<AppState>()
        .is_some_and(|s| s.settings().onboarding_done)
    {
        license.allow_trial();
    }
    app.manage(Licensing::new(license.clone()));
    if license.dev_unlimited() {
        pro::install_dev_gate(app);
```

`src-tauri/src/license/app.rs`: thay

```rust
    let _ = app.emit_to(EventTarget::webview_window(window::MAIN), LICENSE_CHANGED, &view);
}

/// Trước khi bắt đầu phiên: hạn mức còn 0 thì từ chối với `quotaExhausted` (§6.8, "Khi chạm hạn mức").
pub fn check_start<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    match licensing(app) {
        Some(l) if !l.can_start(now()) => Err(CommandError::new(errors::QUOTA_EXHAUSTED, None, "hạn mức còn 0")),
        _ => Ok(()),
    }
}

/// Phút vừa dịch xong (`EventSink::usage`). `Break` khi đã chạm hạn mức.
pub fn add_usage<R: Runtime>(app: &AppHandle<R>, speech_ms: u64) -> ControlFlow<()> {
    let Some(license) = licensing(app) else {
```

bằng

```rust
    let _ = app.emit_to(EventTarget::webview_window(window::MAIN), LICENSE_CHANGED, &view);
}

/// Trước khi bắt đầu phiên (§6.8 "Khi chạm hạn mức"; spec 2026-10-07 §3.2, §6): hạn mức còn 0, Free hết dùng thử, Free
/// chưa đăng ký được dùng thử, hay Free với giờ máy chỉnh lùi thì từ chối với mã tương ứng. Ở Free mà chưa có token dùng
/// thử thì đăng ký ngay (gọi server): `session::start` chạy trên luồng nền.
pub fn check_start<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let Some(license) = licensing(app) else {
        return Ok(());
    };
    let block = license.start_block(now());
    if block.is_some() {
        refresh(app);
    }
    let (code, message) = match block {
        None => return Ok(()),
        Some(StartBlock::QuotaExhausted) => (errors::QUOTA_EXHAUSTED, "hạn mức còn 0"),
        Some(StartBlock::TrialEnded) => (errors::TRIAL_ENDED, "đã hết dùng thử"),
        Some(StartBlock::TrialMissing) => (errors::TRIAL_NEEDS_NETWORK, "chưa đăng ký được dùng thử"),
        Some(StartBlock::ClockRolledBack) => (errors::CLOCK_ROLLED_BACK, "giờ máy bị chỉnh lùi"),
    };
    Err(CommandError::new(code, None, message))
}

/// Mã dừng phiên khi `validate` cho thấy gói trả phí không còn dùng được trên máy này; `None` với lỗi khác (lỗi mạng…).
fn lost_code(e: &LicenseError) -> Option<&'static str> {
    match e {
        LicenseError::Conflict(_) => Some(errors::LICENSE_CONFLICT),
        LicenseError::Revoked | LicenseError::Deactivated | LicenseError::InvalidKey | LicenseError::KeyInUse(_) => {
            Some(errors::LICENSE_INVALID)
        }
        _ => None,
    }
}

/// `validate` khi đang có gói trả phí; gói không còn dùng được thì dừng phiên đang chạy (spec 2026-10-07 §4.2).
fn validate_paid<R: Runtime>(app: &AppHandle<R>, license: &License, t: i64) {
    let paid = license.has_paid_plan(t);
    let result = license.validate(t);
    refresh(app);
    if let Err(e) = result {
        log::info!("validate chưa được: {}", e.code());
        if let Some(code) = lost_code(&e).filter(|_| paid) {
            crate::session::abort(app, code, &e.to_string());
        }
    }
}

/// Phiên vừa bắt đầu (`session::start_with`): gói trả phí mà lần `validate` thành công gần nhất đã quá 1 giờ thì kiểm lại
/// chạy nền, không làm chậm lúc bắt đầu; lỗi mạng thì phiên chạy tiếp (spec 2026-10-07 §4.2).
pub fn quick_check<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    if !license.quick_check_due(now()) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || validate_paid(&app, &license, now()));
}

/// Phút vừa dịch xong (`EventSink::usage`). `Break` khi đã chạm hạn mức.
pub fn add_usage<R: Runtime>(app: &AppHandle<R>, speech_ms: u64) -> ControlFlow<()> {
    let Some(license) = licensing(app) else {
```

`src-tauri/src/license/app.rs`: thay

```rust
    };
    let t = now();
    if license.validate_due(t) {
        if let Err(e) = license.validate(t) {
            log::info!("validate chưa được: {}", e.code());
        }
        refresh(app);
    }
}

fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
```

bằng

```rust
    };
    let t = now();
    if license.validate_due(t) {
        validate_paid(app, &license, t);
    }
}

/// Đăng ký dùng thử chạy nền nếu tới lịch ([`License::trial_due`]), rồi báo giao diện.
fn register_trial_if_due<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    let t = now();
    if license.trial_due(t) {
        if let Err(e) = license.register_trial(t) {
            log::info!("chưa đăng ký được dùng thử: {}", e.code());
        }
        refresh(app);
    }
}

/// Bước Điều khoản vừa được đồng ý (§4.1 bước 1b): cho phép đăng ký dùng thử, và đăng ký ngay trên luồng nền (spec
/// 2026-10-07 §3.2). Lỗi mạng không chặn onboarding: ticker thử lại mỗi giờ.
pub fn start_trial<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    license.allow_trial();
    let app = app.clone();
    std::thread::spawn(move || register_trial_if_due(&app));
}

fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
```

`src-tauri/src/license/app.rs`: thay

```rust
            license.set_genuine(!matches!(genuine, super::genuine::Genuineness::NotGenuine(_)));
        }
        refresh(&app);
        // Lúc khởi động: kiểm ngay (§6.8, "Kiểm tra định kỳ").
        validate_if_due(&app);
        let mut last = Instant::now();
        loop {
            std::thread::sleep(TICK_EVERY);
```

bằng

```rust
            license.set_genuine(!matches!(genuine, super::genuine::Genuineness::NotGenuine(_)));
        }
        refresh(&app);
        // Lúc khởi động: kiểm ngay (§6.8, "Kiểm tra định kỳ"), và đăng ký dùng thử nếu chưa có.
        validate_if_due(&app);
        register_trial_if_due(&app);
        let mut last = Instant::now();
        loop {
            std::thread::sleep(TICK_EVERY);
```

`src-tauri/src/license/app.rs`: thay

```rust
                license.refresh_clock(t);
            }
            validate_if_due(&app);
            refresh(&app);
        }
    });
```

bằng

```rust
                license.refresh_clock(t);
            }
            validate_if_due(&app);
            register_trial_if_due(&app);
            refresh(&app);
        }
    });
```

`src-tauri/src/license/app.rs`: thay

```rust
    licensing(app).ok_or_else(|| command_error(LicenseError::NotConfigured))
}

/// Kết quả của lệnh kích hoạt: thành công, hay key đã đủ 2 máy (giao diện hiện danh sách để gỡ một máy).
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateOutcome {
```

bằng

```rust
    licensing(app).ok_or_else(|| command_error(LicenseError::NotConfigured))
}

/// Kết quả của lệnh kích hoạt: thành công hay xung đột (`view`, `standing` cho biết), hay key đang dùng ở máy khác
/// (`devices`: giao diện hiện danh sách để gỡ máy kia hay "Vẫn kích hoạt").
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateOutcome {
```

`src-tauri/src/license/app.rs`: thay

```rust
    pub devices: Option<Vec<Device>>,
}

pub fn activate<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<ActivateOutcome, CommandError> {
    let license = license_or_error(app)?;
    let result = license.activate(key, now());
    refresh(app);
    match result {
        Ok(()) => Ok(ActivateOutcome {
            view: Some(license.view(now())),
            devices: None,
        }),
```

bằng

```rust
    pub devices: Option<Vec<Device>>,
}

/// Kích hoạt key vừa gõ. `allow_conflict`: người dùng đã xác nhận "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2).
pub fn activate<R: Runtime>(
    app: &AppHandle<R>,
    key: &str,
    allow_conflict: bool,
) -> Result<ActivateOutcome, CommandError> {
    let license = license_or_error(app)?;
    let result = if allow_conflict {
        license.activate_anyway(key, now())
    } else {
        license.activate(key, now())
    };
    refresh(app);
    match result {
        Ok(()) | Err(LicenseError::Conflict(_)) => Ok(ActivateOutcome {
            view: Some(license.view(now())),
            devices: None,
        }),
```

`src-tauri/src/license/app.rs`: thay

```rust
    result.map(|()| Some(license.view(now()))).map_err(command_error)
}

pub fn deactivate_other<R: Runtime>(app: &AppHandle<R>, key: &str, activation_id: &str) -> Result<(), CommandError> {
    license_or_error(app)?
        .deactivate(Some((key, activation_id)))
        .map_err(command_error)
}

pub fn validate_now<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
```

bằng

```rust
    result.map(|()| Some(license.view(now()))).map_err(command_error)
}

/// Gỡ một máy khác của key. `key`: key người dùng vừa gõ (hộp thoại `key_in_use`); `None`: key đã lưu (đang xung đột,
/// "Gỡ máy kia"), khi đó `validate` ngay để nhận token lại.
pub fn deactivate_other<R: Runtime>(
    app: &AppHandle<R>,
    key: Option<&str>,
    activation_id: &str,
) -> Result<(), CommandError> {
    let license = license_or_error(app)?;
    let Some(key) = key else {
        license.deactivate_saved_other(activation_id).map_err(command_error)?;
        if let Err(e) = license.validate(now()) {
            log::info!("validate sau khi gỡ máy kia chưa được: {}", e.code());
        }
        refresh(app);
        return Ok(());
    };
    license.deactivate(Some((key, activation_id))).map_err(command_error)
}

pub fn validate_now<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
```

`src-tauri/src/license/manager.rs`: thay

```rust
            && inner.last_attempt.is_none_or(|t| t < claims.expires_at)
    }

    /// Đang có gói trả phí hiệu lực không (xem đầu module). Bản debug không giới hạn thì luôn có.
    pub fn is_pro(&self, now: i64) -> bool {
        self.dev_unlimited || self.active_claims(&self.lock(), now).is_some()
```

bằng

```rust
            && inner.last_attempt.is_none_or(|t| t < claims.expires_at)
    }

    /// Hạn mức đang theo gói trả phí (kể cả lúc chưa kiểm xong chữ ký bản cài).
    pub fn has_paid_plan(&self, now: i64) -> bool {
        self.quota_claims(&self.lock(), now).is_some()
    }

    /// Đang có gói trả phí hiệu lực không (xem đầu module). Bản debug không giới hạn thì luôn có.
    pub fn is_pro(&self, now: i64) -> bool {
        self.dev_unlimited || self.active_claims(&self.lock(), now).is_some()
```

`src-tauri/src/session.rs`: thay

```rust
    if !begun {
        return Ok(state.status());
    }
    let current = || session.attempt.load(Ordering::SeqCst) == attempt;
    show_overlay(app);
    changed(app);
```

bằng

```rust
    if !begun {
        return Ok(state.status());
    }
    // Phiên trả phí mà lần kiểm bản quyền gần nhất đã quá 1 giờ: kiểm lại chạy nền, key xung đột hay bị thu hồi thì dừng
    // phiên ([`abort`]). Gọi sau khi đã sang `Starting`, để kết quả về sớm cũng gặp đúng phiên này.
    crate::license::app::quick_check(app);
    let current = || session.attempt.load(Ordering::SeqCst) == attempt;
    show_overlay(app);
    changed(app);
```

`src-tauri/src/session.rs`: thay

```rust
    changed(app);
}

/// Nút, phím tắt, khay: bắt đầu khi chưa dịch; dừng khi đang dịch; đang chuẩn bị thì Hủy (về `idle` ngay).
pub fn toggle<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    let session = app.state::<Session>();
```

bằng

```rust
    changed(app);
}

/// Dừng phiên đang chạy hay đang bắt đầu vì một lý do ngoài engine (bản quyền: key xung đột hay bị thu hồi, spec
/// 2026-10-07 §4.2), với mã lỗi `code`. Đang bắt đầu thì hủy lần đó (như Hủy) và báo lỗi; không có phiên nào thì thôi.
pub fn abort<R: Runtime>(app: &AppHandle<R>, code: &str, message: &str) {
    let Some(session) = app.try_state::<Session>() else {
        return;
    };
    let cancelled = app.state::<AppState>().update_status(|s| {
        if s.session != SessionStatus::Starting {
            return false;
        }
        session.attempt.fetch_add(1, Ordering::SeqCst);
        s.session = SessionStatus::Error;
        s.session_error = Some(code.to_string());
        s.loading = None;
        true
    });
    if cancelled {
        log::error!("hủy lần bắt đầu phiên vì {code}: {message}");
        changed(app);
        return;
    }
    let n = session.sessions.load(Ordering::SeqCst);
    fail(app, n, code, message);
}

/// Nút, phím tắt, khay: bắt đầu khi chưa dịch; dừng khi đang dịch; đang chuẩn bị thì Hủy (về `idle` ngay).
pub fn toggle<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    let session = app.state::<Session>();
```

`src/i18n/en.ts`: thay

```ts
  "error.modelsDisk": "Could not write the model files to disk.",
  "error.modelsUnsupported": "This computer does not meet the minimum requirements, so models cannot be downloaded.",
  "error.quotaExhausted": "The translation quota has been used up.",
  "error.proRequired": "This is a Pro feature. Upgrade to a paid plan to use it.",
  "error.dataUnavailable": "Could not open the history and glossary data. If the system asked for keychain access, allow it and try again.",
  "error.glossaryEmpty": "Fill in both the term and its translation.",
```

bằng

```ts
  "error.modelsDisk": "Could not write the model files to disk.",
  "error.modelsUnsupported": "This computer does not meet the minimum requirements, so models cannot be downloaded.",
  "error.quotaExhausted": "The translation quota has been used up.",
  "error.trialEnded": "Your 10-day free trial has ended. Buy Monthly or Yearly to keep translating.",
  "error.trialNeedsNetwork": "Connect to the internet once to start the free trial.",
  "error.clockRolledBack": "The computer clock looks wrong. Set the correct time, then try again.",
  "error.licenseInvalid": "This key can no longer be used on this computer (revoked, or this computer was removed).",
  "error.proRequired": "This is a Pro feature. Upgrade to a paid plan to use it.",
  "error.dataUnavailable": "Could not open the history and glossary data. If the system asked for keychain access, allow it and try again.",
  "error.glossaryEmpty": "Fill in both the term and its translation.",
```

`src/i18n/vi.ts`: thay

```ts
  "error.modelsDisk": "Không ghi được file model xuống ổ đĩa.",
  "error.modelsUnsupported": "Máy này chưa đạt cấu hình tối thiểu nên không tải được model.",
  "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
  "error.proRequired": "Đây là tính năng Pro. Nâng cấp lên gói trả phí để dùng.",
  "error.dataUnavailable": "Không mở được dữ liệu lịch sử và từ điển. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
  "error.glossaryEmpty": "Hãy điền cả thuật ngữ lẫn bản dịch.",
```

bằng

```ts
  "error.modelsDisk": "Không ghi được file model xuống ổ đĩa.",
  "error.modelsUnsupported": "Máy này chưa đạt cấu hình tối thiểu nên không tải được model.",
  "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
  "error.trialEnded": "Đã hết 10 ngày dùng thử. Mua gói Monthly hoặc Yearly để tiếp tục dịch.",
  "error.trialNeedsNetwork": "Cần kết nối mạng một lần để bắt đầu dùng thử.",
  "error.clockRolledBack": "Giờ của máy có vẻ không đúng. Chỉnh lại giờ rồi thử lại.",
  "error.licenseInvalid": "Key này không còn dùng được trên máy này (đã bị thu hồi, hay máy này đã bị gỡ).",
  "error.proRequired": "Đây là tính năng Pro. Nâng cấp lên gói trả phí để dùng.",
  "error.dataUnavailable": "Không mở được dữ liệu lịch sử và từ điển. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
  "error.glossaryEmpty": "Hãy điền cả thuật ngữ lẫn bản dịch.",
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 464 passed; 0 failed; 3 ignored`. Chạy thêm hai lần nữa cho chắc (test có luồng nền): cả ba lần đều xanh.

```bash
pnpm test
```

Kết quả mong đợi: `Tests  162 passed (162)`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/build.rs src-tauri/capabilities/main.json src-tauri/src/app_tests.rs src-tauri/src/commands.rs src-tauri/src/errors.rs src-tauri/src/license/app.rs src-tauri/src/license/manager.rs src-tauri/src/session.rs src/i18n/en.ts src/i18n/vi.ts
git commit -m "feat(license): nối dùng thử và xung đột vào app: lỗi bắt đầu phiên, start_trial, kiểm nhanh, dừng phiên

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 8: Sửa sau review cuối

Commit tham chiếu: `afe1577`.

Review cuối 02a (sau khi 02a, 02b đã thực thi trên `main`, đỉnh cây `252fdc1`) cần sửa tám điểm. Task này là **một commit**
(`afe1577`), làm trên `main` sau 02b. Danh sách sửa:

1. **`start_block` nêu lý do của gói trả phí** (Quan trọng). Trước đây mọi trạng thái không `Active` bị coi là Free và chỉ
   xét dùng thử, nên khách Monthly đã trả tiền mà dùng thử đã hết nhận "Hết dùng thử, mua gói" ở các trạng thái
   `ClockRolledBack`, `RefreshNeeded`, `Unverified`, `Conflict`. Nay: dùng thử còn hiệu lực thì Free chạy như trước; dùng thử
   không còn (hết, hay chưa có) mà khách có bản ghi license không dùng được thì ưu tiên lý do của gói:
   `ClockRolledBack` → `clockRolledBack`, `Conflict` → `licenseConflict`, `RefreshNeeded`/`Unverified` →
   `licenseNeedsRefresh` (mã mới), `Revoked` → `licenseRevoked`, `Expired` → `licenseExpired` (hai mã sẵn có). Khách Free thật
   sự (chưa từng có license, hay đã gỡ key) vẫn nhận `trialEnded`. Test cũ `an_expired_plan_falls_back_to_the_trial` của Task 5
   đổi kỳ vọng từ `TrialEnded` sang `LicenseExpired` (gói hết hạn và dùng thử hết: nêu lý do của gói để gia hạn); màn hình chính
   thêm nút Nâng cấp cho `licenseExpired` như đã có cho `trialEnded`.
2. **`409 key_in_use` mà `devices` rỗng** (race của server: máy kia vừa gỡ key): gọi lại `activate` một lần, không
   `allow_conflict`; lần hai vẫn rỗng thì báo `licenseServer`.
3. **`activation_id` của `409 license_conflict` phải là UUID** (36 ký tự, gạch nối ở vị trí 8, 13, 18, 23, còn lại là chữ số
   hex). Rỗng hay không phải UUID thì coi như thiếu: `licenseServer`, không lưu gì. Các test xung đột cũ dùng id `a1`, `a2`
   nên đổi sang hai hằng UUID `ACT_1`, `ACT_2`.
4. **`abort` gắn với phiên đã nhờ nó.** `session::attempt(app)` trả số của lần bắt đầu hiện tại; `quick_check` nhận số đó lúc
   spawn, `validate_if_due` lấy số lúc gọi, và `session::abort(app, attempt, …)` bỏ qua khi số đã đổi. Kết quả `validate` tới
   muộn của phiên đã dừng không dừng được phiên mới (kịch bản: S1 trả phí có kiểm nhanh treo, người dùng dừng S1, gỡ key, bắt
   đầu S2 Free, kết quả tới muộn).
5. **Đăng ký dùng thử khi bắt đầu phiên:** `register_trial` tôn trọng `Retry-After` của `429` (không gọi server trong lúc
   chờ, trả số giây còn lại); mỗi lúc chỉ một lần gọi server (`trial_gate`, lần sau chờ rồi dùng kết quả của lần trước); kho
   khóa không ghi được token thì token vẫn ở bộ nhớ (lần Bắt đầu sau không gọi server lại) và trả `Storage`. `start_block`
   phân biệt lý do: mất mạng → `trialNeedsNetwork`; lỗi khác (`429` → `licenseRateLimited`, `503` → `licenseServer`, token sai →
   `licenseBadToken`) → `StartBlock::TrialUnavailable(<mã>)`, dùng lại các mã lỗi đã có.
6. **`load()` ở trạng thái xung đột** (token rỗng theo thiết kế) không đọc token, nên không log "token đã lưu không đọc được"
   mỗi lần mở app. Test bắt log theo luồng, kèm đối chứng: token hỏng thật vẫn được log.
7. **Không đọc được mã máy** (`id_hash` rỗng): không gọi `/v1/trial` (cả ticker lẫn `start_block`), log cảnh báo đúng một
   lần, báo `licenseNoMachineId` (mã mới, câu báo vi/en) thay cho "cần mạng".
8. **Kiểm, không sửa:** `enter_conflict`/`accept` ghi đè bản ghi của key khác đang `Active`? Kết quả ở mục "Ghi nhận mục 8: nhập key
   mới khi đang có key" cuối task.

Số test: lib của app từ 464 lên **479** (+15: 12 trong `manager`, 3 trong `app_tests`); vitest giữ 167.

Phát hiện thêm, **chưa sửa** (ngoài danh sách review): `validate` giữ bản ghi lấy lúc bắt đầu; nếu người dùng gỡ key (`deactivate`)
trong lúc một `validate` đang chờ response thì response tới muộn ghi lại bản ghi vừa xóa (`accept` hay `enter_conflict`),
tức là "gỡ kích hoạt" bị hoàn tác. Có từ kế hoạch 06, không do 02. Đề xuất sửa riêng: sau khi nhận response, kiểm bản ghi
hiện tại còn đúng (`key`, `activation_id`) rồi mới áp kết quả.

**Files:**
- Test: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/errors.rs` (`LICENSE_NEEDS_REFRESH`)
- Modify: `src-tauri/src/license/app.rs` (`check_start` map lý do mới, `quick_check` và `validate_paid` nhận số lần bắt đầu)
- Modify: `src-tauri/src/license/manager.rs` (StartBlock, start_block, register_trial, activate_with, load, is_uuid, FakeApi)
- Modify: `src-tauri/src/session.rs` (`attempt`, `abort` theo lần bắt đầu)
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/windows/main/screens/Home.tsx`

- [ ] **Step 1: Viết test trước**

`src-tauri/src/app_tests.rs`: thay

```rust
    assert!(bad.contains("licenseInvalidKey"), "{bad}");
}

/// Claims của license Monthly cấp lúc `issued_at` (giờ thật), cho các test bản quyền của app.
fn monthly_claims(activation_id: &str, issued_at: i64) -> Value {
    json!({
```

bằng

```rust
    assert!(bad.contains("licenseInvalidKey"), "{bad}");
}

/// Activation của hai máy trong các test xung đột (UUID như server cấp).
const ACT_1: &str = "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60";
const ACT_2: &str = "9b1f2c3d-4e5a-4b6c-8d7e-0f1a2b3c4d5e";

/// Claims của license Monthly cấp lúc `issued_at` (giờ thật), cho các test bản quyền của app.
fn monthly_claims(activation_id: &str, issued_at: i64) -> Value {
    json!({
```

`src-tauri/src/app_tests.rs`: thay

```rust
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    let crate::license::client::ApiError::Server(mut conflict) = devices_error("license_conflict", &["a1", "a2"])
    else {
        unreachable!()
    };
    conflict.activation_id = Some("a2".into());
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(crate::license::client::ApiError::Server(conflict)));
    let out = invoke(&main, "activate_license", json!({ "key": KEY, "allowConflict": true })).unwrap();
    assert_eq!(out["view"]["standing"], "conflict");
    assert_eq!(out["view"]["conflict"]["thisActivationId"], "a2");
    let now = crate::license::app::now();
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("a2", now), false));
    invoke(&main, "deactivate_other_device", json!({ "activationId": "a1" })).unwrap();
    let calls = api.calls.lock().unwrap().clone();
    assert!(
        calls.iter().any(|c| c == "deactivate 0123456789ABCDEFGHJKMNPQRST5 a1"),
        "{calls:?}"
    );
    assert_eq!(calls.last().unwrap(), "validate 0123456789ABCDEFGHJKMNPQRST5 a2");
    let view = invoke(&main, "get_license", json!({})).unwrap();
    assert_eq!(view["standing"], "active");
}

// Tự cập nhật (kế hoạch 07b): lệnh khởi động lại, đổi kênh, cài ở lúc thoát.

/// Việc của `kill_all` giả và của bản cập nhật giả, cùng một chỗ để so thứ tự.
```

bằng

```rust
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    let crate::license::client::ApiError::Server(mut conflict) = devices_error("license_conflict", &[ACT_1, ACT_2])
    else {
        unreachable!()
    };
    conflict.activation_id = Some(ACT_2.into());
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(crate::license::client::ApiError::Server(conflict)));
    let out = invoke(&main, "activate_license", json!({ "key": KEY, "allowConflict": true })).unwrap();
    assert_eq!(out["view"]["standing"], "conflict");
    assert_eq!(out["view"]["conflict"]["thisActivationId"], ACT_2);
    let now = crate::license::app::now();
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims(ACT_2, now), false));
    invoke(&main, "deactivate_other_device", json!({ "activationId": ACT_1 })).unwrap();
    let calls = api.calls.lock().unwrap().clone();
    assert!(
        calls
            .iter()
            .any(|c| c == &format!("deactivate 0123456789ABCDEFGHJKMNPQRST5 {ACT_1}")),
        "{calls:?}"
    );
    assert_eq!(
        calls.last().unwrap(),
        &format!("validate 0123456789ABCDEFGHJKMNPQRST5 {ACT_2}")
    );
    let view = invoke(&main, "get_license", json!({})).unwrap();
    assert_eq!(view["standing"], "active");
}

/// `check_start` nêu lý do của gói trả phí (key xung đột, bị thu hồi) khi dùng thử đã hết, và mã lỗi của lần đăng ký dùng thử
/// khi server từ chối (Task 8 của 02a).
#[test]
fn check_start_names_the_reason_of_the_plan_and_of_a_failed_trial() {
    use crate::license::client::{ApiError, ServerError};
    use crate::license::manager::tests::{DEVICE, KEY, granted, server, trial_grant};
    let now = crate::license::app::now();
    let ended = || trial_grant(DEVICE, now - 20 * 86_400, now - 10 * 86_400, now - 20 * 86_400);
    let app = mock_app();
    let (api, license) = license_for(&app);
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", now), true));
    license.activate(KEY, now).unwrap();
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(devices_error("license_conflict", &["act", "b"])));
    let _ = license.validate(now);
    api.trials.lock().unwrap().push_back(ended());
    assert_eq!(session::start(app.handle()).unwrap_err().code, errors::LICENSE_CONFLICT);
    let app = mock_app();
    let (api, license) = license_for(&app);
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", now), true));
    license.activate(KEY, now).unwrap();
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(server(403, "license_revoked")));
    let _ = license.validate(now);
    api.trials.lock().unwrap().push_back(ended());
    assert_eq!(session::start(app.handle()).unwrap_err().code, "licenseRevoked");
    // Free chưa có dùng thử, server từ chối (503) thì báo "thử lại sau", không phải "cần mạng".
    let app = mock_app();
    let (api, _) = license_for(&app);
    api.trials
        .lock()
        .unwrap()
        .push_back(Err(ApiError::Server(Box::new(ServerError {
            status: 503,
            code: "trial_not_configured".into(),
            ..ServerError::default()
        }))));
    assert_eq!(session::start(app.handle()).unwrap_err().code, "licenseServer");
}

/// `abort` chỉ chạm tới lần bắt đầu đã nhờ nó: kết quả kiểm bản quyền tới muộn của phiên cũ không dừng phiên mới.
#[test]
fn abort_only_touches_the_attempt_that_asked_for_it() {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    session::start(app.handle()).unwrap();
    let first = session::attempt(app.handle());
    session::stop(app.handle());
    session::start(app.handle()).unwrap();
    let second = session::attempt(app.handle());
    assert_ne!(first, second);
    let state = app.state::<AppState>();
    session::abort(app.handle(), first, errors::LICENSE_CONFLICT, "kết quả của phiên cũ");
    assert_eq!(state.status().session, SessionStatus::Running);
    session::abort(app.handle(), second, errors::LICENSE_CONFLICT, "đúng phiên này");
    assert_eq!(state.status().session, SessionStatus::Error);
    assert_eq!(state.status().session_error.as_deref(), Some(errors::LICENSE_CONFLICT));
}

/// Phiên trả phí S1 có kiểm nhanh đang treo; người dùng dừng S1, gỡ key, bắt đầu S2 ở Free; kết quả kiểm nhanh (xung đột) tới
/// muộn không được dừng S2.
#[test]
fn a_late_quick_check_cannot_stop_a_newer_session() {
    use crate::license::manager::tests::{KEY, granted};
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let (api, license) = license_for(&app);
    let then = crate::license::app::now() - 3700;
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", then), true));
    license.activate(KEY, then).unwrap();
    let (release, hold) = std::sync::mpsc::channel();
    *api.validate_hold.lock().unwrap() = Some(hold);
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(devices_error("license_conflict", &["act", "b"])));
    session::start(app.handle()).unwrap();
    wait_until("kiểm nhanh đã gọi server", || {
        api.calls.lock().unwrap().iter().any(|c| c.starts_with("validate "))
    });
    session::stop(app.handle());
    license.deactivate(None).unwrap();
    session::start(app.handle()).unwrap();
    let state = app.state::<AppState>();
    assert_eq!(state.status().session, SessionStatus::Running);
    release.send(()).unwrap();
    wait_until("kiểm nhanh trả kết quả", || {
        api.validate_returned.load(std::sync::atomic::Ordering::SeqCst) == 1
    });
    // Nếu `abort` không phân biệt phiên thì S2 bị dừng ngay sau đây: chờ dư để thấy.
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(state.status().session, SessionStatus::Running, "S2 không bị dừng");
    assert_eq!(state.status().session_error, None);
}

// Tự cập nhật (kế hoạch 07b): lệnh khởi động lại, đổi kênh, cài ở lúc thoát.

/// Việc của `kill_all` giả và của bản cập nhật giả, cùng một chỗ để so thứ tự.
```

`src-tauri/src/errors.rs`: thay

```rust
                CLOCK_ROLLED_BACK,
                LICENSE_CONFLICT,
                LICENSE_INVALID,
                PRO_REQUIRED,
                DATA_UNAVAILABLE,
                FILE_FAILED,
```

bằng

```rust
                CLOCK_ROLLED_BACK,
                LICENSE_CONFLICT,
                LICENSE_INVALID,
                LICENSE_NEEDS_REFRESH,
                PRO_REQUIRED,
                DATA_UNAVAILABLE,
                FILE_FAILED,
```

`src-tauri/src/license/manager.rs`: thay

```rust
pub mod tests {
    use std::collections::VecDeque;
    use std::sync::Arc;

    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
```

bằng

```rust
pub mod tests {
    use std::collections::VecDeque;
    use std::sync::Arc;
    use std::sync::atomic::AtomicUsize;

    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
```

`src-tauri/src/license/manager.rs`: thay

```rust
        pub orders: Mutex<VecDeque<Result<OrderStatus, ApiError>>>,
        pub calls: Mutex<Vec<String>>,
        pub date: Mutex<Option<i64>>,
    }

    impl FakeApi {
        fn next(&self, call: String) -> Reply<Granted> {
            self.calls.lock().unwrap().push(call);
            Reply {
                result: self
                    .replies
```

bằng

```rust
        pub orders: Mutex<VecDeque<Result<OrderStatus, ApiError>>>,
        pub calls: Mutex<Vec<String>>,
        pub date: Mutex<Option<i64>>,
        /// Có thì lần `validate` kế tiếp chờ tới khi nhận tín hiệu: test mô phỏng response tới muộn.
        pub validate_hold: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
        /// Số lần `validate` đã trả kết quả (sau khi hết chờ).
        pub validate_returned: AtomicUsize,
        /// Như `validate_hold`, cho lần `trial` kế tiếp.
        pub trial_hold: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
    }

    impl FakeApi {
        fn next(&self, call: String) -> Reply<Granted> {
            self.calls.lock().unwrap().push(call);
            self.reply()
        }

        fn reply(&self) -> Reply<Granted> {
            Reply {
                result: self
                    .replies
```

`src-tauri/src/license/manager.rs`: thay

```rust
            self.next(format!("activate {key} {device} {}{anyway}", label.unwrap_or("-")))
        }
        fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
            self.next(format!("validate {key} {activation_id}"))
        }
        fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()> {
            self.calls
```

bằng

```rust
            self.next(format!("activate {key} {device} {}{anyway}", label.unwrap_or("-")))
        }
        fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("validate {key} {activation_id}"));
            let hold = self.validate_hold.lock().unwrap().take();
            if let Some(release) = hold {
                let _ = release.recv();
            }
            let reply = self.reply();
            self.validate_returned.fetch_add(1, Ordering::SeqCst);
            reply
        }
        fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()> {
            self.calls
```

`src-tauri/src/license/manager.rs`: thay

```rust
        }
        fn trial(&self, device: &str) -> Reply<TrialGrant> {
            self.calls.lock().unwrap().push(format!("trial {device}"));
            Reply {
                result: self.trials.lock().unwrap().pop_front().unwrap_or_else(|| {
                    trial_grant(device, TRIAL_FOREVER_START, TRIAL_FOREVER_END, TRIAL_FOREVER_START)
```

bằng

```rust
        }
        fn trial(&self, device: &str) -> Reply<TrialGrant> {
            self.calls.lock().unwrap().push(format!("trial {device}"));
            let hold = self.trial_hold.lock().unwrap().take();
            if let Some(release) = hold {
                let _ = release.recv();
            }
            Reply {
                result: self.trials.lock().unwrap().pop_front().unwrap_or_else(|| {
                    trial_grant(device, TRIAL_FOREVER_START, TRIAL_FOREVER_END, TRIAL_FOREVER_START)
```

`src-tauri/src/license/manager.rs`: thay

```rust
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0 - 20 * DAY, T0 - 10 * DAY, T0));
        assert_eq!(l.start_block(after), Some(StartBlock::TrialEnded));
        assert_eq!(l.start_block(T0 + 60), None, "gói trả phí còn hạn: không cần dùng thử");
    }

```

bằng

```rust
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0 - 20 * DAY, T0 - 10 * DAY, T0));
        assert_eq!(
            l.start_block(after),
            Some(StartBlock::LicenseExpired),
            "gói đã hết hạn, dùng thử cũng hết: nêu lý do của gói để gia hạn"
        );
        assert_eq!(l.start_block(T0 + 60), None, "gói trả phí còn hạn: không cần dùng thử");
    }

```

`src-tauri/src/license/manager.rs`: thay

```rust
        ApiError::Server(e)
    }

    /// Token của activation `id`.
    fn granted_for(id: &str, issued_at: i64) -> Result<Granted, ApiError> {
        let mut c = claims(issued_at);
```

bằng

```rust
        ApiError::Server(e)
    }

    /// Activation của hai máy trong các test xung đột (UUID như server cấp).
    const ACT_1: &str = "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60";
    const ACT_2: &str = "9b1f2c3d-4e5a-4b6c-8d7e-0f1a2b3c4d5e";

    /// Token của activation `id`.
    fn granted_for(id: &str, issued_at: i64) -> Result<Granted, ApiError> {
        let mut c = claims(issued_at);
```

`src-tauri/src/license/manager.rs`: thay

```rust
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&["a1", "a2"], "a2")));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Conflict(d)) if d.len() == 2));
        assert_eq!(
            *api.calls.lock().unwrap(),
```

bằng

```rust
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&[ACT_1, ACT_2], ACT_2)));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Conflict(d)) if d.len() == 2));
        assert_eq!(
            *api.calls.lock().unwrap(),
```

`src-tauri/src/license/manager.rs`: thay

```rust
        );
        let v = l.view(T0);
        assert_eq!((v.standing, v.plan.as_str()), (Standing::Conflict, "free"));
        assert_eq!(ids(&v), ["a1", "a2"]);
        assert_eq!(v.conflict.unwrap().this_activation_id, "a2");
        assert!(!l.is_pro(T0) && l.can_start(T0), "Free theo dùng thử");
        let l = license(&api, &vault, T0 + 60);
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "mở lại app vẫn xung đột");
```

bằng

```rust
        );
        let v = l.view(T0);
        assert_eq!((v.standing, v.plan.as_str()), (Standing::Conflict, "free"));
        assert_eq!(ids(&v), [ACT_1, ACT_2]);
        assert_eq!(v.conflict.unwrap().this_activation_id, ACT_2);
        assert!(!l.is_pro(T0) && l.can_start(T0), "Free theo dùng thử");
        let l = license(&api, &vault, T0 + 60);
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "mở lại app vẫn xung đột");
```

`src-tauri/src/license/manager.rs`: thay

```rust
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "lỗi mạng: vẫn xung đột");
        assert!(!l.validate_due(T0 + 60 + 899));
        assert!(l.validate_due(T0 + 60 + 900));
        api.replies.lock().unwrap().push_back(granted_for("a2", T0 + 960));
        l.validate(T0 + 960).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "validate 0123456789ABCDEFGHJKMNPQRST5 a2"
        );
        assert_eq!(l.view(T0 + 960).standing, Standing::Active);
    }
```

bằng

```rust
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "lỗi mạng: vẫn xung đột");
        assert!(!l.validate_due(T0 + 60 + 899));
        assert!(l.validate_due(T0 + 60 + 900));
        api.replies.lock().unwrap().push_back(granted_for(ACT_2, T0 + 960));
        l.validate(T0 + 960).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            &format!("validate 0123456789ABCDEFGHJKMNPQRST5 {ACT_2}")
        );
        assert_eq!(l.view(T0 + 960).standing, Standing::Active);
    }
```

`src-tauri/src/license/manager.rs`: thay

```rust
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&["a1", "a2"], "a1")));
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::Conflict(_))));
        assert_eq!(l.view(T0).conflict.unwrap().this_activation_id, "a1");
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["a1", "a2"])));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Server(_))));
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// Kiểm nhanh lúc bắt đầu phiên trả phí: chỉ khi lần `validate` thành công gần nhất đã quá 1 giờ (spec 2026-10-07 §4.2).
    #[test]
    fn a_paid_session_start_checks_the_key_when_the_last_check_is_over_an_hour_old() {
```

bằng

```rust
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&[ACT_1, ACT_2], ACT_1)));
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::Conflict(_))));
        assert_eq!(l.view(T0).conflict.unwrap().this_activation_id, ACT_1);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &[ACT_1, ACT_2])));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Server(_))));
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// `activation_id` của `409 license_conflict` phải là UUID: rỗng hay không phải UUID thì coi như thiếu (review cuối 02a,
    /// mục 3): báo lỗi server, không lưu gì.
    #[test]
    fn a_conflict_activation_id_must_be_a_uuid() {
        for bad in [
            "",
            "a2",
            "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f6",
            "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f6g",
            " 5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60",
        ] {
            let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
            let l = license(&api, &vault, T0);
            api.replies
                .lock()
                .unwrap()
                .push_back(Err(conflict_reply(&[ACT_1, ACT_2], bad)));
            let got = l.activate_anyway(KEY, T0);
            assert!(matches!(&got, Err(LicenseError::Server(_))), "{bad:?}: {got:?}");
            assert_eq!(got.unwrap_err().code(), "licenseServer");
            assert_eq!(l.view(T0).standing, Standing::Free, "{bad:?}");
            assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE), "{bad:?}");
        }
        // UUID chữ hoa cũng là UUID.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let upper = ACT_2.to_uppercase();
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&[ACT_1, &upper], &upper)));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Conflict(_))));
    }

    /// Kiểm nhanh lúc bắt đầu phiên trả phí: chỉ khi lần `validate` thành công gần nhất đã quá 1 giờ (spec 2026-10-07 §4.2).
    #[test]
    fn a_paid_session_start_checks_the_key_when_the_last_check_is_over_an_hour_old() {
```

`src-tauri/src/license/manager.rs`: thay

```rust
        let free = license(&api, &vault, T0);
        assert!(!free.quick_check_due(T0 + 7200));
    }
}
```

bằng

```rust
        let free = license(&api, &vault, T0);
        assert!(!free.quick_check_due(T0 + 7200));
    }

    // ---- Sửa sau review cuối 02a (Task 8) ----

    /// Khách Monthly còn hạn mà dùng thử đã hết, và gói đang không dùng được: lý do của gói trả phí, không phải "hết dùng thử,
    /// mua gói" (review cuối 02a, Quan trọng 1).
    fn ended_trial(api: &Arc<FakeApi>) {
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0 - 20 * DAY, T0 - 10 * DAY, T0));
    }

    #[test]
    fn a_paid_customer_with_an_ended_trial_and_a_clock_set_back_hears_about_the_clock() {
        let (api, _, l) = activated(T0, true);
        ended_trial(&api);
        l.tick(T0 + 3600, 0);
        let back = T0 + 3600 - 601;
        assert_eq!(l.view(back).standing, Standing::ClockRolledBack);
        assert_eq!(l.start_block(back), Some(StartBlock::ClockRolledBack));
    }

    #[test]
    fn a_paid_customer_with_an_ended_trial_and_a_conflict_hears_about_the_conflict() {
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        ended_trial(&api);
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::LicenseConflict));
    }

    /// Quá 14 ngày offline (`refresh_before`), và token lưu không đọc được (`Unverified`): cần mạng để làm mới bản quyền.
    #[test]
    fn a_paid_customer_with_an_ended_trial_who_needs_a_refresh_hears_about_the_network() {
        let (api, _, l) = activated(T0, true);
        ended_trial(&api);
        let late = T0 + 14 * DAY;
        assert_eq!(l.view(late).standing, Standing::RefreshNeeded);
        assert_eq!(l.start_block(late), Some(StartBlock::LicenseNeedsRefresh));
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let record = LicenseRecord {
            key: "0123456789ABCDEFGHJKMNPQRST5".into(),
            activation_id: "act".into(),
            token: "v1.x.y".into(),
            validated_at: T0,
            verdict: None,
            devices: Vec::new(),
        };
        store::write(vault.as_ref(), store::LICENSE, &record).unwrap();
        let l = license(&api, &vault, T0);
        ended_trial(&api);
        assert_eq!(l.view(T0).standing, Standing::Unverified);
        assert_eq!(l.start_block(T0), Some(StartBlock::LicenseNeedsRefresh));
    }

    #[test]
    fn a_paid_customer_with_an_ended_trial_whose_license_ended_hears_about_the_license() {
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_revoked")));
        let _ = l.validate(T0 + 60);
        ended_trial(&api);
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::LicenseRevoked));
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_expired")));
        let _ = l.validate(T0 + 60);
        ended_trial(&api);
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::LicenseExpired));
    }

    /// Còn dùng thử thì Free chạy như trước, dù gói không dùng được. Khách Free thật sự hết dùng thử (chưa từng có license,
    /// hay đã gỡ key) vẫn nhận `TrialEnded`.
    #[test]
    fn the_trial_still_runs_free_for_a_customer_in_trouble_and_ended_free_gets_trial_ended() {
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        with_trial(&api);
        assert_eq!(l.start_block(T0 + 60), None);
        assert!(l.can_start(T0 + 60));
        let (api, _, l) = activated(T0, true);
        ended_trial(&api);
        l.deactivate(None).unwrap();
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::TrialEnded));
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        ended_trial(&api);
        assert_eq!(l.start_block(T0), Some(StartBlock::TrialEnded));
    }

    // ---- `key_in_use` không có máy nào (race của server) ----

    /// `409 key_in_use` mà danh sách máy rỗng (máy kia vừa gỡ key): gọi lại `activate` một lần, không `allow_conflict`.
    #[test]
    fn an_empty_key_in_use_list_is_retried_once_without_allow_conflict() {
        let key = "0123456789ABCDEFGHJKMNPQRST5";
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .extend([Err(conflict_error("key_in_use", &[])), granted(&claims(T0), true)]);
        l.activate_anyway(KEY, T0).unwrap();
        assert_eq!(
            *api.calls.lock().unwrap(),
            [
                format!("activate {key} {DEVICE} Mac allow_conflict"),
                format!("activate {key} {DEVICE} Mac")
            ]
        );
        assert_eq!(l.view(T0).standing, Standing::Active);
        // Hai lần liền đều rỗng: lỗi server bình thường, không thử lần ba.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().extend([
            Err(conflict_error("key_in_use", &[])),
            Err(conflict_error("key_in_use", &[])),
        ]);
        let got = l.activate(KEY, T0);
        assert!(matches!(&got, Err(LicenseError::Server(_))), "{got:?}");
        assert_eq!(got.unwrap_err().code(), "licenseServer");
        assert_eq!(api.calls.lock().unwrap().len(), 2);
        // Lần hai có danh sách máy: báo như bình thường.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().extend([
            Err(conflict_error("key_in_use", &[])),
            Err(conflict_error("key_in_use", &[ACT_1])),
        ]);
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::KeyInUse(d)) if d.len() == 1));
    }

    // ---- Đăng ký dùng thử khi bắt đầu phiên (Free) ----

    fn rate_limited(after: u64) -> ApiError {
        ApiError::Server(Box::new(ServerError {
            status: 429,
            code: "rate_limited".into(),
            retry_after: Some(after),
            ..ServerError::default()
        }))
    }

    fn trial_calls(api: &Arc<FakeApi>) -> usize {
        api.calls
            .lock()
            .unwrap()
            .iter()
            .filter(|c| c.starts_with("trial "))
            .count()
    }

    /// Chưa có token dùng thử: mất mạng thì "cần mạng"; `503` thì "thử lại sau"; `429` thì chờ đúng `Retry-After`, không gọi
    /// server trong lúc chờ.
    #[test]
    fn start_block_names_why_the_trial_could_not_be_registered_and_waits_out_retry_after() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        assert_eq!(l.start_block(T0), Some(StartBlock::TrialMissing));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(server(503, "trial_not_configured")));
        assert_eq!(
            l.start_block(T0 + 1),
            Some(StartBlock::TrialUnavailable("licenseServer"))
        );
        api.trials.lock().unwrap().push_back(Err(rate_limited(7200)));
        assert_eq!(
            l.start_block(T0 + 2),
            Some(StartBlock::TrialUnavailable("licenseRateLimited"))
        );
        assert_eq!(trial_calls(&api), 3);
        assert_eq!(
            l.start_block(T0 + 600),
            Some(StartBlock::TrialUnavailable("licenseRateLimited")),
            "đang chờ Retry-After"
        );
        assert_eq!(trial_calls(&api), 3, "không gọi server trong lúc chờ");
        with_trial(&api);
        assert_eq!(l.start_block(T0 + 2 + 7200), None);
        assert_eq!(trial_calls(&api), 4);
    }

    /// Kho khóa không ghi được token dùng thử: token vẫn nằm trong bộ nhớ, lần Bắt đầu sau không gọi server lại.
    #[test]
    fn a_failing_keystore_keeps_the_new_trial_in_memory() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *vault.fail_writes_of.lock().unwrap() = Some("license-trial".into());
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.start_block(T0), None);
        assert!(!vault.items.lock().unwrap().contains_key(store::TRIAL));
        assert_eq!(l.view(T0).trial.status, TrialStatus::Active);
        assert_eq!(l.start_block(T0 + 60), None);
        assert_eq!(trial_calls(&api), 1);
    }

    /// Hai nơi cùng đăng ký dùng thử (ticker, bước Điều khoản, nút Bắt đầu): chỉ một lần gọi server, nơi sau chờ rồi dùng kết
    /// quả của nơi trước.
    #[test]
    fn two_trial_registrations_never_overlap() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = Arc::new(license(&api, &vault, T0));
        let (release, hold) = std::sync::mpsc::channel();
        *api.trial_hold.lock().unwrap() = Some(hold);
        with_trial(&api);
        let first = {
            let l = l.clone();
            std::thread::spawn(move || l.register_trial(T0))
        };
        while trial_calls(&api) == 0 {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let second = {
            let l = l.clone();
            std::thread::spawn(move || l.register_trial(T0 + 1))
        };
        std::thread::sleep(std::time::Duration::from_millis(150));
        release.send(()).unwrap();
        assert_eq!(first.join().unwrap(), Ok(()));
        assert_eq!(second.join().unwrap(), Ok(()));
        assert_eq!(trial_calls(&api), 1);
    }

    /// Không đọc được mã máy: không gọi `/v1/trial`, báo đúng lý do (không phải "cần mạng"), log cảnh báo một lần.
    #[test]
    fn without_a_machine_id_the_trial_is_not_requested() {
        capture_logs();
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = License::new(
            Box::new(api.clone()),
            Box::new(vault.clone()),
            test_keys(),
            Machine {
                id_hash: String::new(),
                label: None,
            },
            vn(),
            true,
            false,
            false,
            T0,
        );
        l.allow_trial();
        assert!(!l.trial_due(T0), "ticker không gọi");
        for t in [T0, T0 + 1, T0 + 2] {
            assert_eq!(l.register_trial(t), Err(LicenseError::NoMachineId));
        }
        assert_eq!(
            l.start_block(T0 + 3),
            Some(StartBlock::TrialUnavailable("licenseNoMachineId"))
        );
        assert!(api.calls.lock().unwrap().is_empty());
        let warnings = logs_of_this_thread().iter().filter(|m| m.contains("mã máy")).count();
        assert_eq!(warnings, 1, "cảnh báo đúng một lần");
    }

    // ---- Mở app khi đang xung đột ----

    /// Bắt log của mọi luồng, kèm luồng ghi: test chỉ đọc phần của luồng mình.
    static CAPTURED: Mutex<Vec<(std::thread::ThreadId, String)>> = Mutex::new(Vec::new());

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _: &log::Metadata) -> bool {
            true
        }

        fn log(&self, record: &log::Record) {
            CAPTURED
                .lock()
                .unwrap()
                .push((std::thread::current().id(), record.args().to_string()));
        }

        fn flush(&self) {}
    }

    fn capture_logs() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let _ = log::set_logger(&Capture);
            log::set_max_level(log::LevelFilter::Warn);
        });
    }

    fn logs_of_this_thread() -> Vec<String> {
        let me = std::thread::current().id();
        CAPTURED
            .lock()
            .unwrap()
            .iter()
            .filter(|(thread, _)| *thread == me)
            .map(|(_, m)| m.clone())
            .collect()
    }

    /// Bản ghi xung đột có token rỗng theo thiết kế: mở lại app không được log "token đã lưu không đọc được" mỗi lần. Đối
    /// chứng: token hỏng thật vẫn được log.
    #[test]
    fn opening_the_app_in_conflict_does_not_warn_about_an_unreadable_token() {
        capture_logs();
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        let before = logs_of_this_thread().len();
        let reopened = license(&api, &vault, T0 + 120);
        assert_eq!(reopened.view(T0 + 120).standing, Standing::Conflict);
        let new = logs_of_this_thread().split_off(before);
        assert!(new.iter().all(|m| !m.contains("token đã lưu")), "{new:?}");
        // Đối chứng.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let record = LicenseRecord {
            key: "0123456789ABCDEFGHJKMNPQRST5".into(),
            activation_id: "act".into(),
            token: "v1.x.y".into(),
            validated_at: T0,
            verdict: None,
            devices: Vec::new(),
        };
        store::write(vault.as_ref(), store::LICENSE, &record).unwrap();
        let before = logs_of_this_thread().len();
        let _ = license(&api, &vault, T0);
        let new = logs_of_this_thread().split_off(before);
        assert!(new.iter().any(|m| m.contains("token đã lưu không đọc được")), "{new:?}");
    }
}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cargo test -p meeting-translator --lib
```

Kết quả mong đợi: lỗi biên dịch của lib test (16 lỗi): E0599 `StartBlock::LicenseConflict`, `LicenseExpired`,
`LicenseNeedsRefresh`, `LicenseRevoked`, `TrialUnavailable` chưa có; E0599 `LicenseError::NoMachineId` chưa có; E0425
`session::attempt` chưa có; E0061 `session::abort` nhận 3 tham số chứ không phải 4; E0425 `LICENSE_NEEDS_REFRESH` chưa có.

- [ ] **Step 3: Viết code**

`src-tauri/src/errors.rs`: thay

```rust
pub const LICENSE_CONFLICT: &str = "licenseConflict";
/// Phiên trả phí dừng vì key bị thu hồi hay máy này bị gỡ khỏi key.
pub const LICENSE_INVALID: &str = "licenseInvalid";
// Mã lỗi của kế hoạch 03.
/// Tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) khi đang ở gói Free (`pro::require`).
pub const PRO_REQUIRED: &str = "proRequired";
```

bằng

```rust
pub const LICENSE_CONFLICT: &str = "licenseConflict";
/// Phiên trả phí dừng vì key bị thu hồi hay máy này bị gỡ khỏi key.
pub const LICENSE_INVALID: &str = "licenseInvalid";
/// Không bắt đầu được phiên vì chưa làm mới được bản quyền (quá 14 ngày offline, hay token đã lưu chưa kiểm được) và dùng thử
/// không còn: cần kết nối mạng.
pub const LICENSE_NEEDS_REFRESH: &str = "licenseNeedsRefresh";
// Mã lỗi của kế hoạch 03.
/// Tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) khi đang ở gói Free (`pro::require`).
pub const PRO_REQUIRED: &str = "proRequired";
```

`src-tauri/src/license/app.rs`: thay

```rust
}

/// Trước khi bắt đầu phiên (§6.8 "Khi chạm hạn mức"; spec 2026-10-07 §3.2, §6): hạn mức còn 0, Free hết dùng thử, Free
/// chưa đăng ký được dùng thử, hay Free với giờ máy chỉnh lùi thì từ chối với mã tương ứng. Ở Free mà chưa có token dùng
/// thử thì đăng ký ngay (gọi server): `session::start` chạy trên luồng nền.
pub fn check_start<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let Some(license) = licensing(app) else {
        return Ok(());
```

bằng

```rust
}

/// Trước khi bắt đầu phiên (§6.8 "Khi chạm hạn mức"; spec 2026-10-07 §3.2, §6): hạn mức còn 0, Free hết dùng thử, Free
/// chưa đăng ký được dùng thử (mất mạng, server từ chối, không đọc được mã máy), hay giờ máy chỉnh lùi thì từ chối với mã
/// tương ứng. Khách đã có license mà gói không dùng được (xung đột, cần làm mới, bị thu hồi, hết hạn) và dùng thử không còn
/// thì nhận lý do của gói, không phải "hết dùng thử". Ở Free mà chưa có token dùng thử thì đăng ký ngay (gọi server):
/// `session::start` chạy trên luồng nền.
pub fn check_start<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let Some(license) = licensing(app) else {
        return Ok(());
```

`src-tauri/src/license/app.rs`: thay

```rust
        Some(StartBlock::TrialEnded) => (errors::TRIAL_ENDED, "đã hết dùng thử"),
        Some(StartBlock::TrialMissing) => (errors::TRIAL_NEEDS_NETWORK, "chưa đăng ký được dùng thử"),
        Some(StartBlock::ClockRolledBack) => (errors::CLOCK_ROLLED_BACK, "giờ máy bị chỉnh lùi"),
    };
    Err(CommandError::new(code, None, message))
}
```

bằng

```rust
        Some(StartBlock::TrialEnded) => (errors::TRIAL_ENDED, "đã hết dùng thử"),
        Some(StartBlock::TrialMissing) => (errors::TRIAL_NEEDS_NETWORK, "chưa đăng ký được dùng thử"),
        Some(StartBlock::ClockRolledBack) => (errors::CLOCK_ROLLED_BACK, "giờ máy bị chỉnh lùi"),
        Some(StartBlock::TrialUnavailable(code)) => (code, "không đăng ký được dùng thử"),
        Some(StartBlock::LicenseConflict) => (errors::LICENSE_CONFLICT, "key đang xung đột"),
        Some(StartBlock::LicenseNeedsRefresh) => (errors::LICENSE_NEEDS_REFRESH, "cần làm mới bản quyền"),
        Some(StartBlock::LicenseRevoked) => (LicenseError::Revoked.code(), "license đã bị thu hồi"),
        Some(StartBlock::LicenseExpired) => (LicenseError::Expired(None).code(), "license đã hết hạn"),
    };
    Err(CommandError::new(code, None, message))
}
```

`src-tauri/src/license/app.rs`: thay

```rust
    }
}

/// `validate` khi đang có gói trả phí; gói không còn dùng được thì dừng phiên đang chạy (spec 2026-10-07 §4.2).
fn validate_paid<R: Runtime>(app: &AppHandle<R>, license: &License, t: i64) {
    let paid = license.has_paid_plan(t);
    let result = license.validate(t);
    refresh(app);
    if let Err(e) = result {
        log::info!("validate chưa được: {}", e.code());
        if let Some(code) = lost_code(&e).filter(|_| paid) {
            crate::session::abort(app, code, &e.to_string());
        }
    }
}

/// Phiên vừa bắt đầu (`session::start_with`): gói trả phí mà lần `validate` thành công gần nhất đã quá 1 giờ thì kiểm lại
/// chạy nền, không làm chậm lúc bắt đầu; lỗi mạng thì phiên chạy tiếp (spec 2026-10-07 §4.2).
pub fn quick_check<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
```

bằng

```rust
    }
}

/// `validate` khi đang có gói trả phí; gói không còn dùng được thì dừng phiên đang chạy (spec 2026-10-07 §4.2). `attempt`:
/// số của lần bắt đầu phiên lúc nhờ việc này ([`crate::session::attempt`]); kết quả tới muộn, khi phiên đó đã dừng và một
/// lần bắt đầu khác đã chạy, không được dừng phiên mới.
fn validate_paid<R: Runtime>(app: &AppHandle<R>, license: &License, t: i64, attempt: u64) {
    let paid = license.has_paid_plan(t);
    let result = license.validate(t);
    refresh(app);
    if let Err(e) = result {
        log::info!("validate chưa được: {}", e.code());
        if let Some(code) = lost_code(&e).filter(|_| paid) {
            crate::session::abort(app, attempt, code, &e.to_string());
        }
    }
}

/// Phiên vừa bắt đầu (`session::start_with`, lần bắt đầu số `attempt`): gói trả phí mà lần `validate` thành công gần nhất đã
/// quá 1 giờ thì kiểm lại chạy nền, không làm chậm lúc bắt đầu; lỗi mạng thì phiên chạy tiếp (spec 2026-10-07 §4.2).
pub fn quick_check<R: Runtime>(app: &AppHandle<R>, attempt: u64) {
    let Some(license) = licensing(app) else {
        return;
    };
```

`src-tauri/src/license/app.rs`: thay

```rust
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || validate_paid(&app, &license, now()));
}

/// Phút vừa dịch xong (`EventSink::usage`). `Break` khi đã chạm hạn mức.
```

bằng

```rust
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || validate_paid(&app, &license, now(), attempt));
}

/// Phút vừa dịch xong (`EventSink::usage`). `Break` khi đã chạm hạn mức.
```

`src-tauri/src/license/app.rs`: thay

```rust
    };
    let t = now();
    if license.validate_due(t) {
        validate_paid(app, &license, t);
    }
}

```

bằng

```rust
    };
    let t = now();
    if license.validate_due(t) {
        validate_paid(app, &license, t, crate::session::attempt(app));
    }
}

```

`src-tauri/src/license/manager.rs`: thay

```rust
    TrialMissing,
    /// Free mà đã hết 10 ngày dùng thử.
    TrialEnded,
    /// Free mà giờ máy bị coi là chỉnh lùi: chỉnh giờ rồi thử lại.
    ClockRolledBack,
}

/// Mốc reset hạn mức hiển thị (§4.2 bước 2).
```

bằng

```rust
    TrialMissing,
    /// Free mà đã hết 10 ngày dùng thử.
    TrialEnded,
    /// Giờ máy bị coi là chỉnh lùi: chỉnh giờ rồi thử lại.
    ClockRolledBack,
    /// Free mà chưa có token dùng thử, và server từ chối hay lỗi (không phải mất mạng): mã lỗi của lần đăng ký
    /// ([`LicenseError::code`]), ví dụ `licenseRateLimited`, `licenseServer`, `licenseNoMachineId`.
    TrialUnavailable(&'static str),
    /// Dùng thử đã hết (hay chưa có) mà khách có license không dùng được ở lúc này: nêu lý do của gói trả phí, không báo
    /// "hết dùng thử, mua gói" (review cuối 02a, Quan trọng 1). Key đang xung đột.
    LicenseConflict,
    /// Quá 14 ngày chưa làm mới được token, hay token lưu chưa kiểm được (`RefreshNeeded`, `Unverified`): cần mạng.
    LicenseNeedsRefresh,
    /// License đã bị thu hồi.
    LicenseRevoked,
    /// License đã hết hạn.
    LicenseExpired,
}

/// Mốc reset hạn mức hiển thị (§4.2 bước 2).
```

`src-tauri/src/license/manager.rs`: thay

```rust
    ConsentRequired,
    #[error("email không hợp lệ")]
    EmailInvalid,
}

/// Mọi mã lỗi của bản quyền (test của `errors.rs` kiểm đủ câu báo lỗi).
```

bằng

```rust
    ConsentRequired,
    #[error("email không hợp lệ")]
    EmailInvalid,
    #[error("không đọc được mã máy")]
    NoMachineId,
}

/// Mọi mã lỗi của bản quyền (test của `errors.rs` kiểm đủ câu báo lỗi).
```

`src-tauri/src/license/manager.rs`: thay

```rust
    "licenseServer",
    "licenseConsentRequired",
    "licenseEmailInvalid",
];

impl LicenseError {
```

bằng

```rust
    "licenseServer",
    "licenseConsentRequired",
    "licenseEmailInvalid",
    "licenseNoMachineId",
];

impl LicenseError {
```

`src-tauri/src/license/manager.rs`: thay

```rust
            Self::Server(_) => "licenseServer",
            Self::ConsentRequired => "licenseConsentRequired",
            Self::EmailInvalid => "licenseEmailInvalid",
        }
    }
}
```

bằng

```rust
            Self::Server(_) => "licenseServer",
            Self::ConsentRequired => "licenseConsentRequired",
            Self::EmailInvalid => "licenseEmailInvalid",
            Self::NoMachineId => "licenseNoMachineId",
        }
    }
}
```

`src-tauri/src/license/manager.rs`: thay

```rust
    trial_attempt: Option<i64>,
    /// `429` của `/v1/trial`: không gọi lại trước lúc này.
    trial_blocked_until: Option<i64>,
}

/// Dùng thử lúc `now`, theo giờ tin được.
```

bằng

```rust
    trial_attempt: Option<i64>,
    /// `429` của `/v1/trial`: không gọi lại trước lúc này.
    trial_blocked_until: Option<i64>,
    /// Đã log cảnh báo "không đọc được mã máy" (chỉ log một lần).
    warned_no_machine: bool,
}

/// Dùng thử lúc `now`, theo giờ tin được.
```

`src-tauri/src/license/manager.rs`: thay

```rust
    dev_unlimited: bool,
    /// Kết quả kiểm chữ ký bản cài: chưa kiểm xong thì chưa mở Pro, nhưng chưa báo "không chính hãng" (N5 của review 06).
    genuine: AtomicU8,
    inner: Mutex<Inner>,
}

```

bằng

```rust
    dev_unlimited: bool,
    /// Kết quả kiểm chữ ký bản cài: chưa kiểm xong thì chưa mở Pro, nhưng chưa báo "không chính hãng" (N5 của review 06).
    genuine: AtomicU8,
    /// Mỗi lúc chỉ một lần gọi `POST /v1/trial` (ticker, bước Điều khoản và nút Bắt đầu có thể chạy cùng lúc): lần sau chờ
    /// rồi dùng kết quả của lần trước.
    trial_gate: Mutex<()>,
    inner: Mutex<Inner>,
}

```

`src-tauri/src/license/manager.rs`: thay

```rust
            server_configured,
            dev_unlimited,
            genuine: AtomicU8::new(GENUINE_UNKNOWN),
            inner: Mutex::new(Inner {
                has_prior_data,
                ..Inner::default()
```

bằng

```rust
            server_configured,
            dev_unlimited,
            genuine: AtomicU8::new(GENUINE_UNKNOWN),
            trial_gate: Mutex::new(()),
            inner: Mutex::new(Inner {
                has_prior_data,
                ..Inner::default()
```

`src-tauri/src/license/manager.rs`: thay

```rust
        }
        // Có bản ghi license nghĩa là app đã có dữ liệu từ trước, dù file cài đặt có còn hay không.
        inner.has_prior_data |= inner.record.is_some();
        inner.claims = inner
            .record
            .as_ref()
            .and_then(|r| self.read_token(&r.token, &r.activation_id));
        if let Some(issued_at) = inner.claims.as_ref().map(|c| c.issued_at) {
            inner.seen.observe_signed(issued_at);
```

bằng

```rust
        }
        // Có bản ghi license nghĩa là app đã có dữ liệu từ trước, dù file cài đặt có còn hay không.
        inner.has_prior_data |= inner.record.is_some();
        // Bản ghi xung đột không có token (token rỗng theo thiết kế): không đọc, không log.
        inner.claims = inner
            .record
            .as_ref()
            .filter(|r| r.verdict != Some(Verdict::Conflict))
            .and_then(|r| self.read_token(&r.token, &r.activation_id));
        if let Some(issued_at) = inner.claims.as_ref().map(|c| c.issued_at) {
            inner.seen.observe_signed(issued_at);
```

`src-tauri/src/license/manager.rs`: thay

```rust
        self.activate_with(key, true, now)
    }

    /// Gọi `activate`. `409 license_conflict` mang `activation_id` của chính máy này (hợp đồng của kế hoạch 00): vào
    /// trạng thái xung đột với activation đó; thiếu trường này là response sai hợp đồng, báo lỗi server, không lưu gì.
    fn activate_with(&self, key: String, allow_conflict: bool, now: i64) -> Result<(), LicenseError> {
        let reply = self.api.activate(
            &key,
            &self.machine.id_hash,
            self.machine.label.as_deref(),
            allow_conflict,
        );
        self.observe(&reply);
        match reply.result {
            Ok(granted) => self.accept(granted, key, now),
            Err(ApiError::Server(s)) if s.code == "license_conflict" => {
                let Some(activation_id) = s.activation_id else {
                    return Err(LicenseError::Server("license_conflict không có activation_id".into()));
                };
                Err(self.enter_conflict(key, activation_id, s.devices, now))
            }
            Err(e) => Err(map_api(e)),
        }
    }

```

bằng

```rust
        self.activate_with(key, true, now)
    }

    /// Gọi `activate`.
    /// - `409 license_conflict` mang `activation_id` của chính máy này (hợp đồng của kế hoạch 00): vào trạng thái xung đột
    ///   với activation đó. Thiếu trường này, rỗng hay không phải UUID là response sai hợp đồng: báo lỗi server, không lưu gì.
    /// - `409 key_in_use` mà danh sách máy rỗng (máy kia vừa gỡ key, race của server): gọi lại một lần, không `allow_conflict`;
    ///   lần hai vẫn rỗng thì báo lỗi server bình thường.
    fn activate_with(&self, key: String, mut allow_conflict: bool, now: i64) -> Result<(), LicenseError> {
        let mut retried = false;
        loop {
            let reply = self.api.activate(
                &key,
                &self.machine.id_hash,
                self.machine.label.as_deref(),
                allow_conflict,
            );
            self.observe(&reply);
            match reply.result {
                Ok(granted) => return self.accept(granted, key, now),
                Err(ApiError::Server(s)) if s.code == "license_conflict" => {
                    let Some(activation_id) = s.activation_id.filter(|id| is_uuid(id)) else {
                        return Err(LicenseError::Server(
                            "license_conflict không có activation_id hợp lệ".into(),
                        ));
                    };
                    return Err(self.enter_conflict(key, activation_id, s.devices, now));
                }
                Err(ApiError::Server(s)) if s.code == "key_in_use" && s.devices.is_empty() => {
                    if retried {
                        return Err(LicenseError::Server(s.code));
                    }
                    retried = true;
                    allow_conflict = false;
                }
                Err(e) => return Err(map_api(e)),
            }
        }
    }

```

`src-tauri/src/license/manager.rs`: thay

```rust
    pub fn trial_due(&self, now: i64) -> bool {
        let inner = self.lock();
        self.server_configured
            && inner.trial_allowed
            && inner.trial.is_none()
            && inner.trial_blocked_until.is_none_or(|t| now >= t)
```

bằng

```rust
    pub fn trial_due(&self, now: i64) -> bool {
        let inner = self.lock();
        self.server_configured
            && !self.machine.id_hash.is_empty()
            && inner.trial_allowed
            && inner.trial.is_none()
            && inner.trial_blocked_until.is_none_or(|t| now >= t)
```

`src-tauri/src/license/manager.rs`: thay

```rust

    /// Đăng ký dùng thử của máy này (hay lấy lại token của lần trước, server giữ đúng `started_at` cũ): kiểm token, lưu
    /// kho khóa.
    pub fn register_trial(&self, now: i64) -> Result<(), LicenseError> {
        self.lock().trial_attempt = Some(now);
        let reply = self.api.trial(&self.machine.id_hash);
        self.observe(&reply);
        let grant = reply.result.map_err(map_api).inspect_err(|e| {
```

bằng

```rust

    /// Đăng ký dùng thử của máy này (hay lấy lại token của lần trước, server giữ đúng `started_at` cũ): kiểm token, lưu
    /// kho khóa.
    /// - Không đọc được mã máy: không gọi server, log cảnh báo một lần, trả [`LicenseError::NoMachineId`].
    /// - Mỗi lúc chỉ một lần gọi server (`trial_gate`); đã có token (do lần gọi trước) thì xong ngay; đang chờ `Retry-After`
    ///   của `429` thì trả [`LicenseError::RateLimited`] với số giây còn lại, không gọi server.
    /// - Kho khóa không ghi được token: token vẫn nằm trong bộ nhớ (lần Bắt đầu sau không gọi server lại) và trả
    ///   [`LicenseError::Storage`]; mở lại app thì đăng ký lại, server trả đúng `started_at` cũ.
    pub fn register_trial(&self, now: i64) -> Result<(), LicenseError> {
        if self.machine.id_hash.is_empty() {
            if !std::mem::replace(&mut self.lock().warned_no_machine, true) {
                log::error!("không đọc được mã máy: không đăng ký được dùng thử");
            }
            return Err(LicenseError::NoMachineId);
        }
        let _one_at_a_time = self.trial_gate.lock().unwrap_or_else(|e| e.into_inner());
        {
            let mut inner = self.lock();
            if inner.trial.is_some() {
                return Ok(());
            }
            if let Some(until) = inner.trial_blocked_until.filter(|&t| now < t) {
                return Err(LicenseError::RateLimited(Some((until - now) as u64)));
            }
            inner.trial_attempt = Some(now);
        }
        let reply = self.api.trial(&self.machine.id_hash);
        self.observe(&reply);
        let grant = reply.result.map_err(map_api).inspect_err(|e| {
```

`src-tauri/src/license/manager.rs`: thay

```rust
        })?;
        let claims = trial::verify(&grant.token, &self.keys, &self.machine.id_hash)
            .map_err(|e| LicenseError::BadToken(e.to_string()))?;
        store::write(self.vault.as_ref(), store::TRIAL, &TrialRecord { token: grant.token })
            .map_err(|e| LicenseError::Storage(e.to_string()))?;
        let mut inner = self.lock();
        inner.seen.observe_signed(claims.issued_at);
        inner.trial = Some(claims);
        Ok(())
    }

    /// Vì sao chưa bắt đầu được phiên lúc `now`; `None` là bắt đầu được (spec 2026-10-07 §3.2, §6). Ở Free mà chưa có token
    /// dùng thử thì đăng ký ngay: có gọi server, nên nơi gọi chạy trên luồng nền.
    pub fn start_block(&self, now: i64) -> Option<StartBlock> {
        if self.dev_unlimited {
            return None;
```

bằng

```rust
        })?;
        let claims = trial::verify(&grant.token, &self.keys, &self.machine.id_hash)
            .map_err(|e| LicenseError::BadToken(e.to_string()))?;
        let saved = store::write(self.vault.as_ref(), store::TRIAL, &TrialRecord { token: grant.token });
        let mut inner = self.lock();
        inner.seen.observe_signed(claims.issued_at);
        inner.trial = Some(claims);
        saved.map_err(|e| {
            log::warn!("không lưu được token dùng thử: {e}");
            LicenseError::Storage(e.to_string())
        })
    }

    /// Lý do của gói trả phí khiến máy phải chạy Free, khi khách đã có license mà gói không dùng được lúc này; `None` khi
    /// chưa từng có license (hay bản cài không chính hãng: chỉ chạy Free).
    fn license_block_locked(&self, inner: &Inner, now: i64) -> Option<StartBlock> {
        match self.standing_locked(inner, now) {
            Standing::ClockRolledBack => Some(StartBlock::ClockRolledBack),
            Standing::Conflict => Some(StartBlock::LicenseConflict),
            Standing::RefreshNeeded | Standing::Unverified => Some(StartBlock::LicenseNeedsRefresh),
            Standing::Revoked => Some(StartBlock::LicenseRevoked),
            Standing::Expired => Some(StartBlock::LicenseExpired),
            Standing::Free | Standing::Active | Standing::NotGenuine => None,
        }
    }

    /// Vì sao chưa bắt đầu được phiên lúc `now`; `None` là bắt đầu được (spec 2026-10-07 §3.2, §6). Ở Free mà chưa có token
    /// dùng thử thì đăng ký ngay: có gọi server, nên nơi gọi chạy trên luồng nền.
    ///
    /// Máy không chạy theo gói trả phí thì chạy Free theo dùng thử. Dùng thử còn hiệu lực thì Free chạy. Không còn dùng thử mà
    /// khách có license không dùng được (xung đột, cần làm mới, giờ máy lùi, bị thu hồi, hết hạn) thì nêu lý do của gói trả
    /// phí, không báo "hết dùng thử, mua gói"; chỉ khách Free thật sự mới nhận lý do của dùng thử.
    pub fn start_block(&self, now: i64) -> Option<StartBlock> {
        if self.dev_unlimited {
            return None;
```

`src-tauri/src/license/manager.rs`: thay

```rust
            self.quota_claims(&inner, now).is_none()
        };
        if free {
            let missing = self.lock().trial.is_none();
            if missing
                && self.server_configured
                && let Err(e) = self.register_trial(now)
            {
                log::info!("chưa đăng ký được dùng thử: {}", e.code());
            }
            match self.trial_state_locked(&self.lock(), now) {
                TrialState::Missing => return Some(StartBlock::TrialMissing),
                TrialState::Ended => return Some(StartBlock::TrialEnded),
                TrialState::RolledBack => return Some(StartBlock::ClockRolledBack),
                TrialState::Active => {}
            }
        }
        (self.remaining_locked(&self.lock(), now) == Some(0)).then_some(StartBlock::QuotaExhausted)
```

bằng

```rust
            self.quota_claims(&inner, now).is_none()
        };
        if free {
            let mut registration = None;
            let missing = self.lock().trial.is_none();
            if missing
                && self.server_configured
                && let Err(e) = self.register_trial(now)
            {
                log::info!("chưa đăng ký được dùng thử: {}", e.code());
                registration = Some(e);
            }
            let inner = self.lock();
            let trial = self.trial_state_locked(&inner, now);
            if !matches!(trial, TrialState::Active) {
                if let Some(block) = self.license_block_locked(&inner, now) {
                    return Some(block);
                }
                return Some(match (trial, registration) {
                    (TrialState::Ended, _) => StartBlock::TrialEnded,
                    (TrialState::RolledBack, _) => StartBlock::ClockRolledBack,
                    (_, Some(LicenseError::Network | LicenseError::NotConfigured) | None) => StartBlock::TrialMissing,
                    (_, Some(e)) => StartBlock::TrialUnavailable(e.code()),
                });
            }
        }
        (self.remaining_locked(&self.lock(), now) == Some(0)).then_some(StartBlock::QuotaExhausted)
```

`src-tauri/src/license/manager.rs`: thay

```rust
    }
}

pub fn plan_code(plan: Plan) -> &'static str {
    match plan {
        Plan::Monthly => "monthly",
```

bằng

```rust
    }
}

/// `activation_id` do server cấp là UUID (36 ký tự, gạch nối ở vị trí 8, 13, 18, 23, còn lại là chữ số hex).
fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
}

pub fn plan_code(plan: Plan) -> &'static str {
    match plan {
        Plan::Monthly => "monthly",
```

`src-tauri/src/session.rs`: thay

```rust
    }
    // Phiên trả phí mà lần kiểm bản quyền gần nhất đã quá 1 giờ: kiểm lại chạy nền, key xung đột hay bị thu hồi thì dừng
    // phiên ([`abort`]). Gọi sau khi đã sang `Starting`, để kết quả về sớm cũng gặp đúng phiên này.
    crate::license::app::quick_check(app);
    let current = || session.attempt.load(Ordering::SeqCst) == attempt;
    show_overlay(app);
    changed(app);
```

bằng

```rust
    }
    // Phiên trả phí mà lần kiểm bản quyền gần nhất đã quá 1 giờ: kiểm lại chạy nền, key xung đột hay bị thu hồi thì dừng
    // phiên ([`abort`]). Gọi sau khi đã sang `Starting`, để kết quả về sớm cũng gặp đúng phiên này.
    crate::license::app::quick_check(app, attempt);
    let current = || session.attempt.load(Ordering::SeqCst) == attempt;
    show_overlay(app);
    changed(app);
```

`src-tauri/src/session.rs`: thay

```rust
    changed(app);
}

/// Dừng phiên đang chạy hay đang bắt đầu vì một lý do ngoài engine (bản quyền: key xung đột hay bị thu hồi, spec
/// 2026-10-07 §4.2), với mã lỗi `code`. Đang bắt đầu thì hủy lần đó (như Hủy) và báo lỗi; không có phiên nào thì thôi.
pub fn abort<R: Runtime>(app: &AppHandle<R>, code: &str, message: &str) {
    let Some(session) = app.try_state::<Session>() else {
        return;
    };
    let cancelled = app.state::<AppState>().update_status(|s| {
        if s.session != SessionStatus::Starting {
            return false;
        }
        session.attempt.fetch_add(1, Ordering::SeqCst);
```

bằng

```rust
    changed(app);
}

/// Số của lần bắt đầu hiện tại, để nơi chạy nền (kiểm bản quyền) nhớ "phiên nào" đã nhờ nó ([`abort`]). 0 khi chưa có phiên
/// nào.
pub fn attempt<R: Runtime>(app: &AppHandle<R>) -> u64 {
    app.try_state::<Session>()
        .map_or(0, |s| s.attempt.load(Ordering::SeqCst))
}

/// Dừng phiên đang chạy hay đang bắt đầu vì một lý do ngoài engine (bản quyền: key xung đột hay bị thu hồi, spec
/// 2026-10-07 §4.2), với mã lỗi `code`. Chỉ chạm tới lần bắt đầu số `attempt` (lấy bằng [`attempt`] lúc nhờ việc nền): kết
/// quả tới muộn của một phiên cũ (đã dừng, hay đã sang lần bắt đầu khác) không được dừng phiên mới. Đang bắt đầu thì hủy lần
/// đó (như Hủy) và báo lỗi; không có phiên nào thì thôi.
pub fn abort<R: Runtime>(app: &AppHandle<R>, attempt: u64, code: &str, message: &str) {
    let Some(session) = app.try_state::<Session>() else {
        return;
    };
    if session.attempt.load(Ordering::SeqCst) != attempt {
        log::info!("bỏ qua lệnh dừng {code} của lần bắt đầu cũ");
        return;
    }
    let cancelled = app.state::<AppState>().update_status(|s| {
        if s.session != SessionStatus::Starting || session.attempt.load(Ordering::SeqCst) != attempt {
            return false;
        }
        session.attempt.fetch_add(1, Ordering::SeqCst);
```

`src/i18n/en.ts`: thay

```ts
  "error.trialNeedsNetwork": "Connect to the internet once to start the free trial.",
  "error.clockRolledBack": "The computer clock looks wrong. Set the correct time, then try again.",
  "error.licenseInvalid": "This key can no longer be used on this computer (revoked, or this computer was removed).",
  "error.proRequired": "This is a Pro feature. Upgrade to a paid plan to use it.",
  "error.dataUnavailable": "Could not open the history and glossary data. If the system asked for keychain access, allow it and try again.",
  "error.glossaryEmpty": "Fill in both the term and its translation.",
```

bằng

```ts
  "error.trialNeedsNetwork": "Connect to the internet once to start the free trial.",
  "error.clockRolledBack": "The computer clock looks wrong. Set the correct time, then try again.",
  "error.licenseInvalid": "This key can no longer be used on this computer (revoked, or this computer was removed).",
  "error.licenseNeedsRefresh": "The license has not been refreshed for a long time. Connect to the internet to refresh it, then try again.",
  "error.proRequired": "This is a Pro feature. Upgrade to a paid plan to use it.",
  "error.dataUnavailable": "Could not open the history and glossary data. If the system asked for keychain access, allow it and try again.",
  "error.glossaryEmpty": "Fill in both the term and its translation.",
```

`src/i18n/en.ts`: thay

```ts
  "error.licenseExpired": "This license has expired. Renew it to keep using Pro features.",
  "error.licenseDeactivated": "This computer was removed from the license. Activate the key again to use it here.",
  "error.licenseBadToken": "The license server sent an invalid reply. Please try again later.",
  "error.licenseStorage": "Could not save the license on this computer. If the system asked for keychain access, allow it and try again.",
  "error.licenseServer": "The license server could not complete the request. Please try again later.",
  "error.licenseConsentRequired": "Please agree to the processing of your email to continue.",
```

bằng

```ts
  "error.licenseExpired": "This license has expired. Renew it to keep using Pro features.",
  "error.licenseDeactivated": "This computer was removed from the license. Activate the key again to use it here.",
  "error.licenseBadToken": "The license server sent an invalid reply. Please try again later.",
  "error.licenseNoMachineId": "The computer's ID could not be read, so the license and the trial cannot be used. Restart the computer; if it still fails, contact support.",
  "error.licenseStorage": "Could not save the license on this computer. If the system asked for keychain access, allow it and try again.",
  "error.licenseServer": "The license server could not complete the request. Please try again later.",
  "error.licenseConsentRequired": "Please agree to the processing of your email to continue.",
```

`src/i18n/vi.ts`: thay

```ts
  "error.trialNeedsNetwork": "Cần kết nối mạng một lần để bắt đầu dùng thử.",
  "error.clockRolledBack": "Giờ của máy có vẻ không đúng. Chỉnh lại giờ rồi thử lại.",
  "error.licenseInvalid": "Key này không còn dùng được trên máy này (đã bị thu hồi, hay máy này đã bị gỡ).",
  "error.proRequired": "Đây là tính năng Pro. Nâng cấp lên gói trả phí để dùng.",
  "error.dataUnavailable": "Không mở được dữ liệu lịch sử và từ điển. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
  "error.glossaryEmpty": "Hãy điền cả thuật ngữ lẫn bản dịch.",
```

bằng

```ts
  "error.trialNeedsNetwork": "Cần kết nối mạng một lần để bắt đầu dùng thử.",
  "error.clockRolledBack": "Giờ của máy có vẻ không đúng. Chỉnh lại giờ rồi thử lại.",
  "error.licenseInvalid": "Key này không còn dùng được trên máy này (đã bị thu hồi, hay máy này đã bị gỡ).",
  "error.licenseNeedsRefresh": "Đã lâu chưa làm mới được bản quyền. Hãy kết nối mạng để làm mới rồi thử lại.",
  "error.proRequired": "Đây là tính năng Pro. Nâng cấp lên gói trả phí để dùng.",
  "error.dataUnavailable": "Không mở được dữ liệu lịch sử và từ điển. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
  "error.glossaryEmpty": "Hãy điền cả thuật ngữ lẫn bản dịch.",
```

`src/i18n/vi.ts`: thay

```ts
  "error.licenseExpired": "License này đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
  "error.licenseDeactivated": "Máy này đã bị gỡ khỏi key. Kích hoạt lại key để dùng ở máy này.",
  "error.licenseBadToken": "Máy chủ bản quyền trả kết quả không hợp lệ. Vui lòng thử lại sau.",
  "error.licenseStorage": "Không lưu được bản quyền trên máy. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
  "error.licenseServer": "Máy chủ bản quyền chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
  "error.licenseConsentRequired": "Vui lòng đồng ý cho xử lý email để tiếp tục.",
```

bằng

```ts
  "error.licenseExpired": "License này đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
  "error.licenseDeactivated": "Máy này đã bị gỡ khỏi key. Kích hoạt lại key để dùng ở máy này.",
  "error.licenseBadToken": "Máy chủ bản quyền trả kết quả không hợp lệ. Vui lòng thử lại sau.",
  "error.licenseNoMachineId": "Không đọc được mã máy nên chưa dùng được bản quyền hay dùng thử. Khởi động lại máy; nếu vẫn lỗi, hãy liên hệ hỗ trợ.",
  "error.licenseStorage": "Không lưu được bản quyền trên máy. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
  "error.licenseServer": "Máy chủ bản quyền chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
  "error.licenseConsentRequired": "Vui lòng đồng ý cho xử lý email để tiếp tục.",
```

`src/windows/main/screens/Home.tsx`: thay

```tsx
            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
            )}
            {status.sessionError === "trialEnded" && (
              <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>
            )}
            {status.sessionError === "licenseConflict" && (
```

bằng

```tsx
            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
            )}
            {(status.sessionError === "trialEnded" || status.sessionError === "licenseExpired") && (
              <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>
            )}
            {status.sessionError === "licenseConflict" && (
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
cargo test -p meeting-translator
```

Kết quả mong đợi: dòng đầu của lib là `test result: ok. 479 passed; 0 failed; 3 ignored`. Chạy thêm hai lần nữa (test có luồng nền): cả ba lần đều xanh.

```bash
pnpm test
```

Kết quả mong đợi: `Tests  167 passed (167)`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
cargo fmt --all -- --check
cargo clippy -p meeting-translator --all-targets -- -D warnings
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `warning:` hay `error:` nào của
`meeting-translator`.

```bash
sh scripts/check-windows.sh
pnpm build
```

Kết quả mong đợi: `check-windows.sh` kết thúc bằng `Finished`; Vite in `✓ built in …`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_tests.rs src-tauri/src/errors.rs src-tauri/src/license/app.rs src-tauri/src/license/manager.rs src-tauri/src/session.rs src/i18n/en.ts src/i18n/vi.ts src/windows/main/screens/Home.tsx
git commit -m "fix(license): sửa sau review cuối 02a: lý do của gói khi dùng thử hết, key_in_use rỗng, UUID, abort theo phiên, đăng ký dùng thử

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

### Ghi nhận mục 8: nhập key mới khi đang có key (không sửa)

`accept` và `enter_conflict` ghi đè bản ghi `license` bất kể bản ghi đang có là key nào. Phía Rust **không** chặn, nhưng:

- **Giao diện chặn.** `src/windows/main/settings/LicenseSettings.tsx` chỉ dựng thẻ "Kích hoạt key" (ô nhập key, danh sách máy
  của `key_in_use`, "Vẫn kích hoạt") khi `!view.key`. `view.key` là key đã che của **mọi** bản ghi (Active, Expired, Revoked,
  Conflict), nên đang có key thì không nhập được key mới; phải "Gỡ kích hoạt" trước. Store có cờ `busy` chặn bấm đúp.
- **Đường duy nhất khác gọi `activate` với key lạ** là `purchase::apply` cho đơn `grant_kind: new` (đơn mới không gắn key
  hiện có, hay hỗ trợ cấp key mới cho license đã thu hồi). Màn hình Nâng cấp chỉ gắn `license_key` khi `isRenewal(view)` (có key,
  chưa bị thu hồi), nên khách đang Active chỉ nhận đơn `extend`/`change` (qua `validate`, không ghi đè); đơn `new` ghi đè bản ghi
  đã `Revoked`, đúng ý.
- Kết luận: không cần sửa; ghi nhận trong báo cáo. Nếu sau này thêm lối nhập key khác (ví dụ link kích hoạt từ email), cần
  chặn ở phía Rust (`activate` từ chối khi bản ghi hiện tại là key khác còn hiệu lực).

---

## Task 9: Bộ kiểm cuối của 02a (số cũ: Task 8)

Không sửa code. Chạy đủ bộ kiểm; mọi lệnh phải xanh. Làm sau Task 8, và sau 02b Task 4.

- [ ] **Step 1: Định dạng, clippy toàn workspace, kiểm biên dịch phần Windows**

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
sh scripts/check-windows.sh
```

Kết quả mong đợi: `cargo fmt` không in gì; hai lệnh clippy kết thúc bằng `Finished`, không có `error:`. (Dòng `warning: variable does not need to be mutable` của build script `whisper-rs-sys` là của crate bên thứ ba, có từ trước.)

- [ ] **Step 2: Test toàn bộ**

```bash
cargo test --workspace
pnpm test
pnpm build
```

Kết quả mong đợi: mọi dòng `test result` đều `ok`, lib của app `479 passed; 0 failed; 3 ignored`; `Tests  167 passed (167)`; Vite in `✓ built in …`.

- [ ] **Step 3: Không còn mã cũ**

```bash
git grep -nE "pro_x2|pro_x5|ProX|device_limit|DeviceLimit|licenseDeviceLimit" -- src-tauri
```

Kết quả mong đợi: không in gì.

---

## Đối chiếu với spec (tự review)

| Spec 2026-10-07 | Task |
|---|---|
| §1 bảng gói: mã `monthly`, `yearly`; Free 30 phút/ngày | 1, 2 |
| §2.4 Monthly 3000 phút, Yearly không giới hạn (từ token, không ghi cứng) | 1 (hạn mức đọc từ `quota_minutes_per_cycle` như cũ) |
| §3.2 đăng ký sau bước điều khoản, thử lại lúc khởi động / mỗi giờ / khi Bắt đầu ở Free | 5 (`trial_due`, `start_block`), 7 (`start_trial`, ticker) |
| §3.2 lưu kho khóa mục riêng, giữ khi xóa dữ liệu; token hỏng hay sai máy thì bỏ và đăng ký lại | 3, 5 |
| §3.2 giờ tin được, `observe_signed`, chỉnh lùi thì chặn | 5 |
| §3.2 bốn điều kiện; gói trả phí hết hạn về Free theo dùng thử; hết dùng thử; chưa có token mà offline | 5, 7 |
| §3.2 phiên đang chạy qua `ends_at` thì chạy hết | 5 (`an_ended_trial_blocks_the_next_free_session_only`) |
| §3.2 công tắc dev bỏ qua hạn mức; bản không chính hãng chịu luật dùng thử | 5 (`start_block` trả `None` khi dev; Free của bản không chính hãng đi qua cùng luật) |
| §4.2 `key_in_use`, "Vẫn kích hoạt" có `allow_conflict` | 4, 6, 7 |
| §4.2 xung đột: giữ key và `activation_id`, bỏ token, Free theo dùng thử, `validate` mỗi 15 phút, bộ đếm giữ nguyên | 6 |
| §4.2 kiểm nhanh quá 1 giờ, dừng phiên `license_conflict` / `license_invalid`, lỗi mạng bỏ qua | 6 (`quick_check_due`), 7 |
| §4.2 `KeyInUse`, `Conflict` thay `DeviceLimit` | 6 |
| §6 bảng lỗi mới | 7 (mã lỗi và câu báo), 02b (giao diện) |
| §9 test của app (Rust) | 1–8 |
| §3.2, §6 khách có license mà gói không dùng được, dùng thử đã hết: nêu lý do của gói (giờ máy lùi, xung đột, cần làm mới, thu hồi, hết hạn), không báo "mua gói" | 8 |
| §4.1 (hợp đồng 00) `activation_id` của `409 license_conflict` phải là UUID; `409 key_in_use` rỗng thì thử lại một lần | 8 |
| §4.2 dừng phiên vì kiểm bản quyền chỉ khi đúng phiên đã nhờ kiểm; đăng ký dùng thử tôn trọng Retry-After, không chồng, phân biệt lỗi | 8 |
