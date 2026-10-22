# Màn hình Nâng cấp ba bước — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Màn hình Nâng cấp Pro chia ba bước đánh số (1 Cách thanh toán dạng nút viên thuốc có biểu tượng, 2 Chọn gói, 3 Thanh toán), cách trả chọn sẵn theo ngôn ngữ giao diện (tiếng Việt thì VietQR, ngôn ngữ khác thì thẻ quốc tế), bỏ gợi ý theo nước ở phía app.

**Kiến trúc:** Chỉ đổi app và website, server giữ nguyên. Logic chọn sẵn nằm ở `src/lib/license.ts` (`defaultCurrency`, `chosenCurrency` nhận `lang`). Bố cục ở `UpgradeView.tsx` (component chỉ nhận props, test vẽ bằng `react-dom/server`). Trường `suggested_currency` bị gỡ khỏi Rust, IPC, store, IPC giả. Website sửa hướng dẫn và chụp lại ảnh, nhưng chỉ deploy sau khi bản app đã phát hành.

**Công nghệ:** React 19 + TypeScript 7 (Vitest 5), Tauri 2 / Rust (serde), CSS thuần với token ở `src/styles/tokens.css`, trang xem trước `scripts/ui-preview` (Vite + IPC giả + Chrome không đầu), website tĩnh (`node --test`).

**Spec:** `docs/superpowers/specs/2026-10-22-nang-cap-ba-buoc-design.md`. Đọc trước khi làm.

---

## Lưu ý chung (đọc trước mọi task)

- **Worktree:** mọi việc làm ở `/Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc` (nhánh `nang-cap-ba-buoc`). Shell của công cụ Bash **quay về thư mục chính sau mỗi lệnh**, nên mọi lệnh phải bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc &&`. Dưới đây viết tắt đường dẫn đó là `$WT`, nhưng khi chạy thì gõ đủ đường dẫn tuyệt đối. Trước mỗi commit, chạy `git branch --show-current` và phải thấy `nang-cap-ba-buoc`.
- **Rust:** đĩa còn khoảng 26 GB, thư mục `target/` của thư mục chính đã chiếm 56 GB. Mọi lệnh `cargo` đặt `CARGO_TARGET_DIR=/Users/dtphong/Desktop/software_business/ai-translator/target` để dùng lại bản build sẵn, không build lại từ đầu trong worktree.
- **Không** merge, push, đẩy tag hay deploy (server, website) khi chủ dự án chưa cho phép.
- Chú thích trong code viết tiếng Việt, theo giọng và mật độ của chú thích xung quanh. Không có linter; `pnpm build` chạy `tsc --noEmit` (strict), và `tsconfig.json` có cả `scripts/ui-preview/tauri-mock.ts`.
- Commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Bản đồ file

| File | Việc |
| --- | --- |
| `src/lib/license.ts` | `defaultCurrency(plans, lang)`, `chosenCurrency(picked, plans, lang)` theo ngôn ngữ |
| `src/lib/license.test.ts` | test hai hàm trên |
| `src/lib/ipc.ts` | `PlansView` chỉ còn `plans` |
| `src/store/license.ts`, `src/store/license.test.ts` | bỏ `suggestedCurrency` |
| `src/windows/main/screens/UpgradeScreen.tsx` | bỏ prop `suggestedCurrency` |
| `src/windows/main/screens/UpgradeView.tsx` | bỏ prop (task 1); bố cục ba bước (task 4) |
| `src/windows/main/screens/UpgradeView.test.ts` | test theo ngôn ngữ (task 1); viết lại cho ba bước (task 4) |
| `src/components/Icon.tsx` | thêm biểu tượng `qr`, `card` |
| `src/i18n/{vi,en,ja,zh,ko}.ts`, `src/i18n/i18n.test.ts` | khóa `upgrade.step.plan`, `upgrade.step.pay` |
| `src/styles/main.css` | kiểu ba bước, nút viên thuốc, `.method-notes` thay `.plan-notes` |
| `src-tauri/src/license/{client,purchase,manager}.rs`, `src-tauri/src/app_tests.rs` | bỏ `suggested_currency` |
| `scripts/ui-preview/tauri-mock.ts` | bỏ `suggest=` |
| `scripts/ui-preview/check-i18n.mjs` | cảnh và điều kiện cho ba bước, chọn sẵn theo ngôn ngữ |
| `scripts/ui-preview/shoot.mjs` | bỏ cảnh `app-upgrade-usd`, bỏ `suggest=usd` |
| `website/src/assets/img/app/` | chụp lại `app-upgrade*`, xóa `app-upgrade-usd.en.webp`, sửa `manifest.json` |
| `website/src/content/{vi,en}/guide-license.mjs`, `website/src/content/{vi,en}/pricing.mjs`, `website/test/site.test.mjs` | câu chọn sẵn theo ngôn ngữ, ba bước, alt ảnh |
| `docs/superpowers/specs/2026-10-14-creem-international-payment-design.md` | ghi chú D4 đã thay |

---

### Task 0: Chuẩn bị worktree

**Files:** không sửa file.

- [ ] **Bước 1: Cài thư viện JS trong worktree** (worktree mới chưa có `node_modules`)

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm install --frozen-lockfile`
Expected: cài xong, không sửa `pnpm-lock.yaml` (`git status` sạch).

- [ ] **Bước 2: Chạy test JS làm mốc**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm test`
Expected: mọi test PASS. Nếu có test đỏ sẵn trên `main` thì ghi lại tên, không sửa, báo trong tổng kết.

---

### Task 1: Cách trả chọn sẵn theo ngôn ngữ, bỏ `suggestedCurrency` ở phía TypeScript

**Files:**
- Modify: `src/lib/license.ts` (hàm `defaultCurrency`, `chosenCurrency`, dòng import đầu file)
- Modify: `src/lib/license.test.ts` (khối `describe("loại tiền khi mua")`)
- Modify: `src/lib/ipc.ts` (interface `PlansView`)
- Modify: `src/store/license.ts`, `src/store/license.test.ts`
- Modify: `src/windows/main/screens/UpgradeScreen.tsx`, `src/windows/main/screens/UpgradeView.tsx`, `src/windows/main/screens/UpgradeView.test.ts`
- Modify: `scripts/ui-preview/tauri-mock.ts`

- [ ] **Bước 1: Viết test hỏng cho `defaultCurrency` và `chosenCurrency`**

Trong `src/lib/license.test.ts`, thay nguyên test `it("loại tiền chọn sẵn theo gợi ý của server, …")` bằng:

```ts
  it("loại tiền chọn sẵn theo ngôn ngữ giao diện: tiếng Việt là VND, ngôn ngữ khác là USD nếu bán được USD", () => {
    expect(defaultCurrency(BOTH, "vi")).toBe("VND");
    for (const lang of ["en", "ja", "zh", "ko"] as const) {
      expect(defaultCurrency(BOTH, lang), lang).toBe("USD");
      // Server chưa bán USD, hay chưa có bảng gói: mọi ngôn ngữ đều VND.
      expect(defaultCurrency(VND_ONLY, lang), lang).toBe("VND");
      expect(defaultCurrency(null, lang), lang).toBe("VND");
    }
  });
```

và thay nguyên test `it("loại tiền đang chọn: theo lựa chọn của khách nếu còn bán, không thì theo gợi ý của server", …)` bằng:

```ts
  it("loại tiền đang chọn: theo lựa chọn của khách nếu còn bán, không thì theo ngôn ngữ giao diện", () => {
    expect(chosenCurrency(null, BOTH, "vi")).toBe("VND");
    expect(chosenCurrency(null, BOTH, "en")).toBe("USD");
    expect(chosenCurrency("USD", BOTH, "vi")).toBe("USD");
    expect(chosenCurrency("VND", BOTH, "en")).toBe("VND");
    // Đã chọn thẻ mà bảng gói mới không còn giá USD (tắt bán thẻ): về mặc định.
    expect(chosenCurrency("USD", VND_ONLY, "en")).toBe("VND");
    expect(chosenCurrency("USD", null, "en")).toBe("VND");
  });
```

- [ ] **Bước 2: Chạy test, xác nhận hỏng**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm exec vitest run src/lib/license.test.ts`
Expected: FAIL ở hai test trên (`defaultCurrency(BOTH, "en")` trả `VND`, chờ `USD`).

- [ ] **Bước 3: Sửa `src/lib/license.ts`**

Thêm dòng import ngay dưới dòng import đầu file:

```ts
import type { UiLanguage } from "../i18n";
```

Thay hai hàm `defaultCurrency` và `chosenCurrency` (cùng chú thích ngay trên mỗi hàm) bằng:

```ts
// Loại tiền chọn sẵn theo ngôn ngữ giao diện (spec 2026-10-22 §3): tiếng Việt là VND (VietQR), ngôn ngữ khác là USD (thẻ
// quốc tế) nếu bán được USD, không thì VND. Người dùng đổi được.
export function defaultCurrency(plans: readonly PlanOffer[] | null, lang: UiLanguage): PayCurrency {
  return lang !== "vi" && offeredCurrencies(plans).includes("USD") ? "USD" : "VND";
}

// Loại tiền đang chọn khi chưa có đơn chờ: khách đã bấm chọn và loại đó còn bán thì giữ; chưa chọn, hay bảng gói mới không
// còn bán loại đã chọn (tắt bán thẻ), thì theo mặc định (ngôn ngữ giao diện).
export function chosenCurrency(picked: PayCurrency | null, plans: readonly PlanOffer[] | null, lang: UiLanguage): PayCurrency {
  return picked !== null && offeredCurrencies(plans).includes(picked) ? picked : defaultCurrency(plans, lang);
}
```

- [ ] **Bước 4: Chạy lại test của `license.ts`**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm exec vitest run src/lib/license.test.ts`
Expected: PASS.

- [ ] **Bước 5: Bỏ `suggestedCurrency` khỏi IPC và store**

`src/lib/ipc.ts`: thay khối chú thích và interface `PlansView` bằng:

```ts
// Bảng gói đang bán (`license::purchase::PlansView`). Giá tính theo đơn vị nhỏ nhất của từng loại tiền: đồng (VND), cent (USD).
export interface PlansView {
  plans: PlanOffer[];
}
```

`src/store/license.ts`:
- xóa hai dòng trong `LicenseStoreState`:
  ```ts
  // Loại tiền server gợi ý theo nước của máy ("VND" hay "USD"); null khi chưa tải bảng gói hay server không gợi ý.
  suggestedCurrency: string | null;
  ```
- trong `fetchPlans`, thay
  ```ts
        const { plans, suggestedCurrency } = await ipc.invoke("get_plans");
        set({ plans, suggestedCurrency, error: null });
  ```
  bằng
  ```ts
        const { plans } = await ipc.invoke("get_plans");
        set({ plans, error: null });
  ```
- xóa dòng `suggestedCurrency: null,` trong state ban đầu.

`src/store/license.test.ts`:
- thay helper `plansView` bằng:
  ```ts
  const plansView = (): PlansView => ({
    plans: [{ code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50_000, USD: 399 } }],
  });
  ```
- thay nguyên test `it("bảng gói kèm loại tiền server gợi ý; server cũ không gợi ý thì null", …)` bằng:
  ```ts
  it("tải bảng gói: giá theo từng loại tiền", async () => {
    const fake = fakeIpc({ get_plans: () => plansView() });
    const store = createLicenseStore(fake.ipc);
    expect(store.getState().plans).toBeNull();
    await store.getState().loadPlans();
    expect(store.getState().plans?.[0]?.prices.USD).toBe(399);
  });
  ```
- đổi mọi chỗ gọi còn lại `plansView("USD")` và `plansView(null)` thành `plansView()`. Kiểm bằng `grep -n "plansView(" src/store/license.test.ts`: mọi dòng phải là `plansView()`.

- [ ] **Bước 6: Bỏ prop `suggestedCurrency` ở hai component**

`src/windows/main/screens/UpgradeScreen.tsx`:
- xóa dòng `const suggestedCurrency = useLicense((s) => s.suggestedCurrency);`
- xóa dòng `suggestedCurrency={suggestedCurrency}`
- (chú thích đầu hàm sửa ở task 4, cùng lúc với bố cục.)

`src/windows/main/screens/UpgradeView.tsx`:
- trong `UpgradeViewProps`, xóa dòng `suggestedCurrency: string | null;` và thay chú thích của `lang` bằng:
  ```ts
  // Ngôn ngữ giao diện: chọn chữ, và chọn sẵn cách trả (tiếng Việt là VietQR, ngôn ngữ khác là thẻ quốc tế). Truyền vào thay
  // vì đọc store để test không phụ thuộc locale của máy chạy test.
  ```
- trong danh sách tham số của `UpgradeView`, xóa `suggestedCurrency,`
- thay chú thích `// Cách trả: theo gợi ý của server tới khi người dùng chọn; …` bằng `// Cách trả: theo ngôn ngữ giao diện tới khi người dùng chọn; chọn xong mà bảng gói đổi (hết bán USD) thì quay về mặc định.`
- thay `chosenCurrency(pickedCurrency, plans, suggestedCurrency)` bằng `chosenCurrency(pickedCurrency, plans, lang)`.

- [ ] **Bước 7: Bỏ `suggest=` khỏi IPC giả**

`scripts/ui-preview/tauri-mock.ts`:
- thay hai dòng chú thích
  ```ts
  //   thanh toán quốc tế (spec 2026-10-14): suggest=usd (server gợi ý trả bằng USD, như khách ở nước ngoài)  usd=0 (server chưa
  //     bán USD: bảng giá không có giá USD, không có lựa chọn cách trả; gợi ý của server vẫn theo suggest=)
  ```
  bằng
  ```ts
  //   thanh toán quốc tế (spec 2026-10-14, 2026-10-22): cách trả chọn sẵn theo lang= (vi: VietQR, ngôn ngữ khác: thẻ quốc tế)
  //     usd=0 (server chưa bán USD: bảng giá không có giá USD, bước Cách thanh toán chỉ có VietQR)
  ```
- thay ba dòng chú thích trên `const plansView` bằng một dòng: `// Bảng gói như server trả; `usd=0` giả server chưa bán USD (không gói nào có giá USD).`
- xóa dòng `suggestedCurrency: param("suggest") === "usd" ? "USD" : "VND",`

- [ ] **Bước 8: Sửa `UpgradeView.test.ts` cho cách chọn sẵn mới** (bố cục chưa đổi; task 4 viết lại cả file)

- import: đổi `import { type MessageKey, type Params, translate } from "../../../i18n";` thành `import { type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";`
- trong `props`, xóa dòng `suggestedCurrency: "VND",`
- thay dòng `const text = (key: MessageKey, params?: Params) => esc(translate("vi", key, params));` bằng:
  ```ts
  const textIn = (lang: UiLanguage) => (key: MessageKey, params?: Params) => esc(translate(lang, key, params));
  const text = textIn("vi");
  const en = textIn("en");
  ```
- test `"server chưa bán USD: …"`: đổi tên thành `"server chưa bán USD: không có nhóm cách trả, giá VND, câu VietQR, không nhắc Creem (cả giao diện tiếng Anh)"`, đổi `html({ plans: VND_ONLY, suggestedCurrency: "USD" })` thành `html({ plans: VND_ONLY, lang: "en" })`, đổi `text("upgrade.bankOnly")` trong test này thành `en("upgrade.bankOnly")`.
- test `"bán cả hai: …; chọn sẵn theo gợi ý của server"`: đổi đuôi tên thành `chọn sẵn theo ngôn ngữ giao diện`. Thay thân test bằng:
  ```ts
    const markup = html();
    expect(markup).toContain(`id="upgrade-method-label">${text("upgrade.method")}</p>`);
    expect(markup).toContain('role="radiogroup" aria-labelledby="upgrade-method-label"');
    expect(markup).not.toContain(`aria-label="${text("upgrade.method")}"`);
    expect(checked(input(markup, "method", "VND"))).toBe(true);
    expect(checked(input(markup, "method", "USD"))).toBe(false);
    for (const lang of ["en", "ja", "zh", "ko"] as const) expect(checked(input(html({ lang }), "method", "USD")), lang).toBe(true);
    // Không có đơn chờ, không bận: chọn được.
    for (const tag of [...inputs(markup, "method"), ...inputs(markup, "plan")]) expect(disabled(tag), tag).toBe(false);
  ```
- test `"thẻ được chọn: …"`: đổi `html({ suggestedCurrency: "USD" })` thành `html({ lang: "en" })`, và trong test này đổi mọi `text(` thành `en(`.
- test `"VietQR được chọn: …"`: đổi `html({ suggestedCurrency: "VND" })` thành `html()`.
- test `"đang tạo đơn (busy): …"`: đổi `html({ busy: true, suggestedCurrency: "USD" })` thành `html({ busy: true })`.
- test `"đơn thẻ, gợi ý VND (khách VN mở lại app, đơn do bản cũ lưu): …"`: đổi tên thành `"đơn thẻ, giao diện tiếng Việt (đơn do bản cũ lưu): ô thẻ được chọn và khóa, giá USD, câu thẻ; gói theo đơn"`, đổi `html({ checkout: { ...oldCard, plan: "six_months" }, suggestedCurrency: "VND" })` thành `html({ checkout: { ...oldCard, plan: "six_months" } })`.
- test `"đơn VietQR, gợi ý USD: …"`: đổi tên thành `"đơn VietQR, giao diện tiếng Anh: ô VietQR được chọn và khóa, giá VND, câu VietQR"`, đổi `html({ checkout: qr, suggestedCurrency: "USD" })` thành `html({ checkout: qr, lang: "en" })`, và trong test này đổi `text("upgrade.bankOnly")`, `text("upgrade.cardMor")` thành `en("upgrade.bankOnly")`, `en("upgrade.cardMor")`.
- sửa dòng chú thích đầu file: thay `nhãn "Cách thanh toán" nhìn thấy` bằng `cách trả chọn sẵn theo ngôn ngữ giao diện, nhãn "Cách thanh toán" nhìn thấy`.

Kiểm không còn chỗ nào: `grep -rn "suggestedCurrency\|suggest=" src scripts/ui-preview/tauri-mock.ts` chỉ được ra kết quả rỗng.

- [ ] **Bước 9: Type-check và chạy toàn bộ test JS**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm exec tsc --noEmit && pnpm test`
Expected: `tsc` không báo lỗi; mọi test PASS.

- [ ] **Bước 10: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git branch --show-current && git add src/lib/license.ts src/lib/license.test.ts src/lib/ipc.ts src/store/license.ts src/store/license.test.ts src/windows/main/screens/UpgradeScreen.tsx src/windows/main/screens/UpgradeView.tsx src/windows/main/screens/UpgradeView.test.ts scripts/ui-preview/tauri-mock.ts && git commit -m "feat(upgrade): cách trả chọn sẵn theo ngôn ngữ giao diện, bỏ gợi ý theo nước ở giao diện

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bỏ `suggested_currency` ở phía Rust

**Files:**
- Modify: `src-tauri/src/license/client.rs` (`PlansReply`, hàm `known_currency`, dòng `use super::purchase::…`, các test bảng gói)
- Modify: `src-tauri/src/license/purchase.rs` (`PlansView`, hàm `plans`, test `the_plans_view_carries_the_suggested_currency`)
- Modify: `src-tauri/src/license/manager.rs` (`FakeApi::plans` trong `mod tests`)
- Modify: `src-tauri/src/app_tests.rs` (test `get_plans_returns_the_plans_and_the_suggested_currency`)

- [ ] **Bước 1: Đổi test trước**

`src-tauri/src/license/client.rs`, trong `mod tests`:
- ở test `plans_declares_the_plans_this_app_can_sell_and_reads_all_of_them`, xóa dòng `assert_eq!(reply.suggested_currency, None, "server cũ không có gợi ý loại tiền");`
- thay test `plans_reads_the_usd_prices_and_the_suggested_currency` và test `an_odd_suggested_currency_is_dropped_and_the_plans_still_load` (cả chú thích `///` của chúng) bằng một test:

```rust
    /// Giá USD (spec 2026-10-14 §3): đọc cả giá VND lẫn USD. Server còn gửi `suggested_currency` cho app cũ (≤ 0.2.2); app này
    /// chọn sẵn cách trả theo ngôn ngữ giao diện (spec 2026-10-22 §3.1) nên bỏ qua trường đó mà vẫn đọc đủ bảng gói, với mọi
    /// kiểu giá trị.
    #[test]
    fn plans_reads_the_usd_prices_and_ignores_the_suggested_currency() {
        let body = r#"{"suggested_currency":"USD","plans":[
            {"code":"monthly","name":"Monthly","quota_minutes_per_cycle":3000,"days_per_order":30,"prices":{"VND":50000,"USD":399}}]}"#;
        let (base, _) = serve(vec![(200, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.plans().result.unwrap();
        assert_eq!(
            (reply.plans[0].prices["VND"], reply.plans[0].prices["USD"]),
            (50_000, 399)
        );
        let plans = r#"[{"code":"monthly","name":"Monthly","quota_minutes_per_cycle":3000,"days_per_order":30,"prices":{"VND":50000}}]"#;
        for suggested in ["5", r#""EUR""#, r#""VND""#, "null", r#"{"code":"USD"}"#, r#"["USD"]"#] {
            let body = format!(r#"{{"suggested_currency":{suggested},"plans":{plans}}}"#);
            let reply: PlansReply = serde_json::from_str(&body).unwrap_or_else(|e| panic!("{suggested}: {e}"));
            assert_eq!(reply.plans.len(), 1, "{suggested}");
        }
    }
```

`src-tauri/src/license/purchase.rs`, trong `mod tests`: thay test `the_plans_view_carries_the_suggested_currency` (cả chú thích `///`) bằng:

```rust
    /// Bảng gói trả cho giao diện chỉ có `plans` (spec 2026-10-22 §3.1: không còn loại tiền gợi ý).
    #[test]
    fn the_plans_view_has_only_the_plans() {
        let (api, _, l) = setup();
        *api.plans.lock().unwrap() = Some(PlansReply { plans: vec![] });
        let view = plans(&l).unwrap();
        assert_eq!(serde_json::to_value(&view).unwrap(), serde_json::json!({ "plans": [] }));
    }
```

`src-tauri/src/app_tests.rs`: thay test `get_plans_returns_the_plans_and_the_suggested_currency` (cả chú thích `///`) bằng:

```rust
/// Bảng gói trả cho giao diện (spec 2026-10-22 §3.1): chỉ có `plans`, không còn loại tiền gợi ý; tên trường camelCase, giá USD
/// tính bằng cent.
#[test]
fn get_plans_returns_only_the_plans() {
    use crate::license::client::{PlanOffer, PlansReply};
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    *api.plans.lock().unwrap() = Some(PlansReply {
        plans: vec![PlanOffer {
            code: "monthly".into(),
            name: "Monthly".into(),
            quota_minutes_per_cycle: Some(3000),
            days_per_order: 30,
            prices: [("VND".to_string(), 50_000), ("USD".to_string(), 399)].into(),
        }],
    });
    let plans = invoke(&main, "get_plans", json!({})).unwrap();
    assert!(plans.get("suggestedCurrency").is_none(), "{plans}");
    assert_eq!(
        (
            plans["plans"][0]["code"].as_str(),
            plans["plans"][0]["prices"]["USD"].as_i64()
        ),
        (Some("monthly"), Some(399))
    );
}
```

- [ ] **Bước 2: Build test, xác nhận hỏng** (test mới tạo `PlansReply` thiếu trường)

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && CARGO_TARGET_DIR=/Users/dtphong/Desktop/software_business/ai-translator/target cargo test --locked -p meeting-translator --lib --no-run`
Expected: lỗi biên dịch `missing field `suggested_currency` in initializer of `PlansReply``.

- [ ] **Bước 3: Gỡ trường ở code**

`src-tauri/src/license/client.rs`:
- thay dòng `use super::purchase::{CURRENCIES, PLANS};` bằng `use super::purchase::PLANS;`
- thay chú thích và struct `PlansReply` bằng:

```rust
/// Bảng gói (`GET /v1/plans`). Server còn gửi `suggested_currency` (loại tiền gợi ý theo nước, cho app ≤ 0.2.2); app này chọn
/// sẵn cách trả theo ngôn ngữ giao diện (spec 2026-10-22 §3.1) nên không đọc trường đó (serde bỏ qua trường lạ).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct PlansReply {
    pub plans: Vec<PlanOffer>,
}
```

- xóa hàm `known_currency` (bốn dòng, từ `fn known_currency` tới `}`) cùng dòng chú thích `///` ngay trên nó (bắt đầu bằng ``/// `suggested_currency` chỉ là gợi ý``).

`src-tauri/src/license/purchase.rs`:
- thay chú thích và struct `PlansView` bằng:

```rust
/// Bảng gói đang bán, cho màn hình Nâng cấp.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlansView {
    pub plans: Vec<PlanOffer>,
}
```

- thay hàm `plans` (cả chú thích) bằng:

```rust
/// Bảng gói đang bán.
pub fn plans(license: &License) -> Result<PlansView, LicenseError> {
    let reply = license.api().plans();
    license.observe_reply(&reply);
    let PlansReply { plans } = reply.result.map_err(super::manager::map_api)?;
    Ok(PlansView { plans })
}
```

`src-tauri/src/license/manager.rs`, trong `impl LicenseApi for Arc<FakeApi>`, hàm `plans`: thay

```rust
                result: Ok(self.plans.lock().unwrap().clone().unwrap_or(PlansReply {
                    plans: Vec::new(),
                    suggested_currency: None,
                })),
```

bằng

```rust
                result: Ok(self.plans.lock().unwrap().clone().unwrap_or(PlansReply { plans: Vec::new() })),
```

Kiểm: `grep -rn "suggested_currency\|known_currency" src-tauri/src` chỉ còn các dòng chú thích và chuỗi JSON trong test của `client.rs`.

- [ ] **Bước 4: Chạy test Rust liên quan**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && CARGO_TARGET_DIR=/Users/dtphong/Desktop/software_business/ai-translator/target cargo test --locked -p meeting-translator --lib -- license:: get_plans --test-threads=1`
Expected: PASS, trong đó có `plans_reads_the_usd_prices_and_ignores_the_suggested_currency`, `the_plans_view_has_only_the_plans`, `get_plans_returns_only_the_plans`.

- [ ] **Bước 5: rustfmt và clippy**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && cargo fmt -p meeting-translator -- --check && CARGO_TARGET_DIR=/Users/dtphong/Desktop/software_business/ai-translator/target cargo clippy --locked -p meeting-translator --all-targets -- -D warnings`
Expected: không có khác biệt định dạng, không cảnh báo. Nếu `--check` báo khác biệt thì chạy `cargo fmt -p meeting-translator` rồi xem lại diff.

- [ ] **Bước 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git branch --show-current && git add src-tauri/src/license/client.rs src-tauri/src/license/purchase.rs src-tauri/src/license/manager.rs src-tauri/src/app_tests.rs && git commit -m "refactor(license): bỏ suggested_currency ở app, server vẫn gửi cho app cũ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Biểu tượng `qr`, `card` và chữ của hai bước mới

**Files:**
- Modify: `src/components/Icon.tsx` (bảng `PATHS`)
- Modify: `src/i18n/vi.ts`, `src/i18n/en.ts`, `src/i18n/ja.ts`, `src/i18n/zh.ts`, `src/i18n/ko.ts`
- Test: `src/i18n/i18n.test.ts` (khối `describe("chữ màn hình Nâng cấp: cách trả bằng thẻ")`)

- [ ] **Bước 1: Viết test hỏng**

Trong `src/i18n/i18n.test.ts`, thêm vào cuối khối `describe("chữ màn hình Nâng cấp: cách trả bằng thẻ", …)` (trước dấu `});` đóng khối):

```ts
  it("tiêu đề bước 2 và 3 của màn hình Nâng cấp (spec 2026-10-22 §4); ba tiêu đề bước khác nhau ở mọi ngôn ngữ", () => {
    expect([t("vi", "upgrade.step.plan"), t("vi", "upgrade.step.pay")]).toEqual(["Chọn gói", "Thanh toán"]);
    expect([t("en", "upgrade.step.plan"), t("en", "upgrade.step.pay")]).toEqual(["Choose a plan", "Checkout"]);
    for (const lang of UI_LANGUAGES) {
      const titles = (["upgrade.method", "upgrade.step.plan", "upgrade.step.pay"] as const).map((k) => t(lang, k));
      expect(new Set(titles).size, lang).toBe(3);
    }
  });
```

- [ ] **Bước 2: Chạy test, xác nhận hỏng**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm exec vitest run src/i18n/i18n.test.ts`
Expected: FAIL (`translate` trả `undefined` cho khóa chưa có).

- [ ] **Bước 3: Thêm khóa vào năm từ điển**

Trong mỗi file, chèn hai dòng ngay dưới dòng `"upgrade.method.usd": …`:

`src/i18n/vi.ts`:
```ts
  "upgrade.step.plan": "Chọn gói",
  "upgrade.step.pay": "Thanh toán",
```
`src/i18n/en.ts`:
```ts
  "upgrade.step.plan": "Choose a plan",
  "upgrade.step.pay": "Checkout",
```
`src/i18n/ja.ts`:
```ts
  "upgrade.step.plan": "プランを選ぶ",
  "upgrade.step.pay": "お支払い",
```
`src/i18n/zh.ts`:
```ts
  "upgrade.step.plan": "选择套餐",
  "upgrade.step.pay": "付款",
```
`src/i18n/ko.ts`:
```ts
  "upgrade.step.plan": "플랜 선택",
  "upgrade.step.pay": "결제",
```

- [ ] **Bước 4: Thêm biểu tượng**

`src/components/Icon.tsx`, thêm hai dòng vào cuối bảng `PATHS` (ngay sau dòng `sparkle: …`, trước `} as const;`):

```ts
  qr: "M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h2.5v2.5H14ZM17.5 17.5H20V20h-2.5ZM14 20v.1M20 14v.1",
  card: "M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5ZM2.5 10h19M6 14.5h4",
```

- [ ] **Bước 5: Type-check và chạy toàn bộ test JS**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm exec tsc --noEmit && pnpm test`
Expected: không lỗi; mọi test PASS (kể cả test "vi có đúng các khóa của en" và "không chuỗi nào rỗng").

- [ ] **Bước 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git branch --show-current && git add src/components/Icon.tsx src/i18n/vi.ts src/i18n/en.ts src/i18n/ja.ts src/i18n/zh.ts src/i18n/ko.ts src/i18n/i18n.test.ts && git commit -m "feat(upgrade): biểu tượng qr, card và tiêu đề bước Chọn gói, Thanh toán (5 ngôn ngữ)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bố cục ba bước của màn hình Nâng cấp

**Files:**
- Modify: `src/windows/main/screens/UpgradeView.tsx` (viết lại phần `return`)
- Modify: `src/windows/main/screens/UpgradeView.test.ts` (viết lại cả file)
- Modify: `src/styles/main.css` (khối `.plan-notes` ở mục "nâng cấp")

- [ ] **Bước 1: Viết lại `UpgradeView.test.ts` cho bố cục mới (test hỏng)**

Thay toàn bộ file bằng:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";
import type { CheckoutView, OrderOutcome, PlanOffer } from "../../../lib/ipc";
import { fallbackLanguage } from "../appStore";
import { UpgradeView, type UpgradeViewProps } from "./UpgradeView";

// Màn hình Nâng cấp vẽ bằng `react-dom/server` trong Node (như LiveLineView.test.ts): ba bước đánh số và cách trả chọn sẵn
// theo ngôn ngữ giao diện (spec 2026-10-22), loại tiền và gói khóa theo đơn đang chờ, chữ của đơn thẻ (merchant of record,
// trễ, không thành) (kế hoạch hardening 06 C2).

const T = 1_800_000_000;

const offer = (code: PlanOffer["code"], vnd: number, usd?: number): PlanOffer => ({
  code,
  name: code,
  quota_minutes_per_cycle: 3000,
  days_per_order: 30,
  prices: usd === undefined ? { VND: vnd } : { VND: vnd, USD: usd },
});
const BOTH = [offer("monthly", 50_000, 399), offer("six_months", 269_000, 2199), offer("yearly", 500_000, 3999)];
const VND_ONLY = [offer("monthly", 50_000), offer("six_months", 269_000), offer("yearly", 500_000)];

const card: CheckoutView = {
  orderCode: 1000429,
  plan: "monthly",
  amount: 399,
  currency: "USD",
  expiresAt: T,
  provider: "creem",
  qrSvg: null,
  licenseExpiresAt: null,
  convertedDays: null,
};
// Đơn do bản app cũ lưu, đọc lại khi mở app: không có số tiền và loại tiền.
const oldCard: CheckoutView = { ...card, amount: 0, currency: "" };
const qr: CheckoutView = { ...card, orderCode: 1000428, amount: 50_000, currency: "VND", provider: "payos", qrSvg: "<svg></svg>" };

const props = (patch: Partial<UpgradeViewProps> = {}): UpgradeViewProps => ({
  lang: "vi",
  view: null,
  plans: BOTH,
  checkout: null,
  order: null,
  error: null,
  busy: false,
  now: T - 60,
  onStart: () => {},
  onOpenPage: () => {},
  onCancel: () => {},
  ...patch,
});

const html = (patch: Partial<UpgradeViewProps> = {}) => renderToStaticMarkup(createElement(UpgradeView, props(patch)));

// Chữ của từ điển như trong HTML (React thoát các ký tự đặc biệt), theo ngôn ngữ của lần vẽ.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const textIn = (lang: UiLanguage) => (key: MessageKey, params?: Params) => esc(translate(lang, key, params));
const text = textIn("vi");
const en = textIn("en");

const inputs = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g")) ?? [];
const input = (markup: string, name: string, value: string) => {
  const tag = inputs(markup, name).find((t) => t.includes(`value="${value}"`));
  if (tag === undefined) throw new Error(`không có input ${name}=${value}`);
  return tag;
};
const checked = (tag: string) => tag.includes('checked=""');
const disabled = (tag: string) => tag.includes('disabled=""');
const count = (markup: string, needle: string) => markup.split(needle).length - 1;
// Tiêu đề các mục gập (văn bản pháp lý), theo thứ tự trên màn hình. `LegalDetails` đọc ngôn ngữ từ app store (trong Node là
// `fallbackLanguage`, theo locale của máy chạy test), nên so với từ điển của đúng ngôn ngữ đó.
const summaries = (markup: string) => [...markup.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1]);
const legalTitle = (key: "legal.privacy" | "legal.eula") => esc(translate(fallbackLanguage, key));
// Tiêu đề bước `no`: số chỉ để nhìn, chữ mang `id`.
const stepTitle = (no: number, id: string, title: string) =>
  `<h2 class="step-title"><span class="step-no" aria-hidden="true">${no}</span><span id="${id}">${title}</span></h2>`;

describe("UpgradeView: ba bước", () => {
  it("có bảng gói: ba tiêu đề bước theo thứ tự (Cách thanh toán, Chọn gói, Thanh toán); bảng gói ở bước 2, form ở bước 3", () => {
    const markup = html();
    expect(count(markup, 'class="step-title"')).toBe(3);
    expect(markup).toContain(stepTitle(1, "upgrade-method-label", text("upgrade.method")));
    expect(markup).toContain(stepTitle(2, "upgrade-plan-label", text("upgrade.step.plan")));
    expect(markup).toContain(stepTitle(3, "upgrade-pay-label", text("upgrade.step.pay")));
    const method = markup.indexOf('id="upgrade-method-label"');
    const plan = markup.indexOf('id="upgrade-plan-label"');
    const pay = markup.indexOf('id="upgrade-pay-label"');
    expect(method).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(method);
    expect(pay).toBeGreaterThan(plan);
    expect(markup.indexOf('class="plans"')).toBeGreaterThan(plan);
    expect(markup.indexOf('class="plans"')).toBeLessThan(pay);
    expect(markup.indexOf('id="upgrade-email"')).toBeGreaterThan(pay);
  });

  it("chưa có bảng gói (đang tải): chưa có bước nào, chỉ ô Free và câu đang tải; không ghi chú cách trả, không form", () => {
    const markup = html({ plans: null });
    expect(markup).not.toContain("step-title");
    expect(inputs(markup, "method")).toHaveLength(0);
    expect(markup).toContain(text("upgrade.loading"));
    expect(markup).toContain(text("upgrade.free.quota"));
    expect(markup).not.toContain(text("upgrade.bankOnly"));
    expect(markup).not.toContain("upgrade-email");
  });

  it("chưa có bảng gói, không có mạng: ô báo lỗi thay câu đang tải", () => {
    const markup = html({ plans: null, error: { code: "network", field: null } });
    expect(markup).not.toContain("step-title");
    expect(markup).toContain('class="notice error"');
    expect(markup).not.toContain(text("upgrade.loading"));
  });

  it("chưa có bảng gói mà có đơn thẻ chờ (mở lại app khi mất mạng): khung đơn, ghi chú của thẻ và câu bên bán lại", () => {
    const markup = html({ plans: null, checkout: card });
    expect(markup).not.toContain("step-title");
    expect(markup).toContain(text("upgrade.cardNote"));
    expect(markup).toContain(text("upgrade.cardMor"));
    expect(markup).toContain(`<h3 class="card-title">${text("upgrade.browser.title")}</h3>`);
  });

  it("lỗi tạo đơn nằm ở bước 3, trên form", () => {
    const markup = html({ error: { code: "network", field: null } });
    const alert = markup.indexOf('class="notice error"');
    expect(alert).toBeGreaterThan(markup.indexOf('id="upgrade-pay-label"'));
    expect(alert).toBeLessThan(markup.indexOf('id="upgrade-email"'));
  });

  it("khung đơn: tiêu đề là h3 (dưới tiêu đề bước h2) và nằm ở bước 3", () => {
    for (const [checkout, title] of [
      [qr, "upgrade.scan"],
      [card, "upgrade.browser.title"],
    ] as const) {
      const markup = html({ checkout });
      expect(markup, title).toContain(`<h3 class="card-title">${text(title)}</h3>`);
      expect(markup, title).not.toContain('<h2 class="card-title">');
      expect(markup.indexOf('class="card checkout'), title).toBeGreaterThan(markup.indexOf('id="upgrade-pay-label"'));
    }
  });
});

describe("UpgradeView: cách trả", () => {
  it("giao diện tiếng Việt chọn sẵn VietQR; en, ja, zh, ko chọn sẵn thẻ quốc tế", () => {
    const vi = html({ lang: "vi" });
    expect(checked(input(vi, "method", "VND"))).toBe(true);
    expect(checked(input(vi, "method", "USD"))).toBe(false);
    for (const lang of ["en", "ja", "zh", "ko"] as const) {
      const markup = html({ lang });
      expect(checked(input(markup, "method", "USD")), lang).toBe(true);
      expect(checked(input(markup, "method", "VND")), lang).toBe(false);
    }
  });

  it("nhóm cách trả: hai nút viên thuốc, nhãn là chữ của tiêu đề bước 1 (không aria-label); chưa có đơn chờ thì bấm được", () => {
    const markup = html();
    expect(markup).toContain('class="pay-methods" role="radiogroup" aria-labelledby="upgrade-method-label"');
    expect(markup).not.toContain(`aria-label="${text("upgrade.method")}"`);
    expect(count(markup, '<label class="pay-method">')).toBe(2);
    for (const tag of [...inputs(markup, "method"), ...inputs(markup, "plan")]) expect(disabled(tag), tag).toBe(false);
  });

  it("ghi chú cách trả nằm ở bước 1, ngay dưới hai nút, trước bảng gói", () => {
    const markup = html();
    const note = markup.indexOf(text("upgrade.bankOnly"));
    expect(note).toBeGreaterThan(markup.indexOf('class="pay-methods"'));
    expect(note).toBeLessThan(markup.indexOf('id="upgrade-plan-label"'));
  });

  it("server chưa bán USD: bước 1 vẫn có, đúng một ô VietQR đang chọn, giá VND, câu VietQR, không nhắc Creem (cả giao diện tiếng Anh)", () => {
    for (const lang of ["vi", "en"] as const) {
      const markup = html({ plans: VND_ONLY, lang });
      expect(markup, lang).toContain('id="upgrade-method-label"');
      expect(inputs(markup, "method"), lang).toHaveLength(1);
      expect(checked(input(markup, "method", "VND")), lang).toBe(true);
      expect(markup, lang).toContain("50.000 đ");
      expect(markup, lang).toContain(textIn(lang)("upgrade.bankOnly"));
      expect(markup, lang).not.toContain("Creem");
      expect(inputs(markup, "plan"), lang).toHaveLength(3);
    }
  });

  it("thẻ được chọn (giao diện tiếng Anh): câu Creem, câu merchant of record, câu đồng ý nêu Creem, thêm mục EULA; nút trả trong trình duyệt", () => {
    const markup = html({ lang: "en" });
    expect(markup).toContain("$3.99");
    expect(markup).toContain(en("upgrade.cardNote"));
    expect(markup).toContain(en("upgrade.cardMor"));
    expect(markup).toContain("merchant of record");
    expect(markup).not.toContain(en("upgrade.bankOnly"));
    expect(markup).toContain(en("upgrade.consentCard"));
    expect(markup).not.toContain(en("upgrade.consent"));
    expect(count(markup, 'class="legal-details"')).toBe(2);
    // Mục thứ hai là điều khoản bán hàng (EULA), không phải lần nữa chính sách quyền riêng tư.
    expect(summaries(markup)).toEqual([legalTitle("legal.privacy"), legalTitle("legal.eula")]);
    // Câu merchant of record nằm dưới câu cardNote (đặc tả), không đảo thứ tự.
    const note = markup.indexOf(en("upgrade.cardNote"));
    const mor = markup.indexOf(en("upgrade.cardMor"));
    expect(note).toBeGreaterThan(-1);
    expect(mor).toBeGreaterThan(note);
    expect(markup).toContain(en("upgrade.payCard"));
  });

  it("VietQR được chọn: câu VietQR, câu đồng ý thường, chỉ mục chính sách; không nhắc Creem", () => {
    const markup = html();
    expect(markup).toContain("50.000 đ");
    expect(markup).toContain(text("upgrade.bankOnly"));
    expect(markup).not.toContain(text("upgrade.cardMor"));
    expect(markup).not.toContain("Creem");
    expect(markup).toContain(text("upgrade.consent"));
    expect(count(markup, 'class="legal-details"')).toBe(1);
    expect(summaries(markup)).toEqual([legalTitle("legal.privacy")]);
    expect(markup).toContain(text("upgrade.pay"));
  });

  it("đang tạo đơn (busy): cả hai nhóm radio khóa, không đổi được giữa chừng", () => {
    const markup = html({ busy: true });
    const all = [...inputs(markup, "method"), ...inputs(markup, "plan")];
    expect(all).toHaveLength(5);
    for (const tag of all) expect(disabled(tag), tag).toBe(true);
  });
});

describe("UpgradeView: có đơn đang chờ", () => {
  it("đơn thẻ, giao diện tiếng Việt (đơn do bản cũ lưu): ô thẻ được chọn và khóa, giá USD, câu thẻ; gói theo đơn", () => {
    const markup = html({ checkout: { ...oldCard, plan: "six_months" } });
    const usd = input(markup, "method", "USD");
    const vnd = input(markup, "method", "VND");
    expect(checked(usd) && disabled(usd)).toBe(true);
    expect(checked(vnd)).toBe(false);
    expect(disabled(vnd)).toBe(true);
    expect(markup).toContain("$3.99");
    expect(markup).not.toContain("50.000 đ");
    expect(markup).toContain(text("upgrade.cardNote"));
    expect(markup).toContain("merchant of record");
    expect(markup).not.toContain(text("upgrade.bankOnly"));
    // Gói của đơn, không phải gói chọn sẵn (Monthly).
    expect(checked(input(markup, "plan", "six_months"))).toBe(true);
    expect(checked(input(markup, "plan", "monthly"))).toBe(false);
    for (const tag of inputs(markup, "plan")) expect(disabled(tag), tag).toBe(true);
    // Không có form tạo đơn; đơn cũ không có số tiền thì không ghi giá cạnh mã đơn.
    expect(markup).not.toContain("upgrade-email");
    expect(markup).toContain(`${text("upgrade.order", { code: card.orderCode })}</p>`);
  });

  it("đơn thẻ mới: mã đơn kèm số tiền thật", () => {
    expect(html({ checkout: card })).toContain(`${text("upgrade.order", { code: card.orderCode })} · $3.99</p>`);
  });

  it("đơn VietQR, giao diện tiếng Anh: ô VietQR được chọn và khóa, giá VND, câu VietQR", () => {
    const markup = html({ checkout: qr, lang: "en" });
    const vnd = input(markup, "method", "VND");
    expect(checked(vnd) && disabled(vnd)).toBe(true);
    expect(checked(input(markup, "method", "USD"))).toBe(false);
    expect(markup).toContain("50.000 đ");
    expect(markup).not.toContain("$3.99");
    expect(markup).toContain(en("upgrade.bankOnly"));
    expect(markup).not.toContain(en("upgrade.cardMor"));
  });

  it("đơn VietQR: không có lời dặn của đơn thẻ", () => {
    const markup = html({ checkout: qr, now: T + 60 });
    expect(markup).toContain(text("upgrade.order.waiting"));
    expect(markup).not.toContain(text("upgrade.browser.cancelNote"));
    expect(markup).not.toContain(text("upgrade.order.waitingCardLate"));
  });

  it("đơn thẻ trong hạn: dòng \"Trả trước\", câu chờ xác nhận, lời dặn dưới hai nút", () => {
    const waiting: OrderOutcome = { state: "waiting", order_code: card.orderCode, expires_at: T };
    for (const order of [null, waiting]) {
      const markup = html({ checkout: card, order });
      expect(markup).toContain(text("upgrade.linkExpiresPage", { time: "" }).replace(/\.$/, ""));
      expect(markup).toContain(text("upgrade.order.waitingCard"));
      expect(markup).not.toContain(text("upgrade.order.waitingCardLate"));
      expect(markup).toContain(text("upgrade.browser.note"));
      expect(markup).toContain(text("upgrade.browser.cancelNote"));
    }
  });

  it("đơn thẻ quá giờ hẹn trả mà còn chờ (kể cả chưa có kết quả hỏi nào): câu trễ, không hiện giờ hẹn đã qua", () => {
    const waiting: OrderOutcome = { state: "waiting", order_code: card.orderCode, expires_at: T };
    for (const order of [null, waiting]) {
      const markup = html({ checkout: card, order, now: T + 1 });
      expect(markup).toContain(text("upgrade.order.waitingCardLate"));
      expect(markup).not.toContain(text("upgrade.order.waitingCard"));
      expect(markup).not.toContain(text("upgrade.linkExpiresPage", { time: "" }).replace(/\.$/, ""));
      expect(markup).toContain(text("upgrade.browser.cancelNote"));
    }
  });

  it("đơn thẻ đã xong (trả xong, không thành, cần xem xét, hoàn tiền, trả rồi mà chưa kích hoạt) trong hạn: không còn \"Trả trước\" và lời dặn mở trình duyệt, vì câu trạng thái đã dặn đừng trả lại", () => {
    const finished: OrderOutcome[] = [
      { state: "paid", order_code: card.orderCode, plan: "monthly" },
      { state: "failed", order_code: card.orderCode },
      { state: "needsReview", order_code: card.orderCode },
      { state: "refunded", order_code: card.orderCode },
      { state: "paidButNotApplied", order_code: card.orderCode, code: "licenseLocked" },
    ];
    for (const order of finished) {
      const markup = html({ checkout: card, order, now: T - 60 });
      expect(markup, order.state).not.toContain(text("upgrade.linkExpiresPage", { time: "" }).replace(/\.$/, ""));
      expect(markup, order.state).not.toContain(text("upgrade.browser.note"));
      // Nút tạo đơn mới có, lời dặn của đơn còn chờ không (đã đúng từ trước).
      expect(markup, order.state).toContain(text("upgrade.newOrder"));
      expect(markup, order.state).not.toContain(text("upgrade.browser.cancelNote"));
    }
  });

  it("đơn thẻ chưa đủ tiền (underpaid): không hứa chuyển bù, dùng câu \"hỗ trợ đang xử lý\"; đơn VietQR vẫn nói chuyển bù", () => {
    const underpaid = (order_code: number): OrderOutcome => ({ state: "underpaid", order_code });
    const cardMarkup = html({ checkout: card, order: underpaid(card.orderCode) });
    expect(cardMarkup).toContain(text("upgrade.order.needsReview", { code: card.orderCode }));
    expect(cardMarkup).not.toContain(text("upgrade.order.underpaid", { code: card.orderCode }));
    const qrMarkup = html({ checkout: qr, order: underpaid(qr.orderCode) });
    expect(qrMarkup).toContain(text("upgrade.order.underpaid", { code: qr.orderCode }));
    expect(qrMarkup).not.toContain(text("upgrade.order.needsReview", { code: qr.orderCode }));
  });

  it("đơn thẻ không thành: \"đừng trả lại\" kèm mã đơn; nút tạo đơn mới", () => {
    const markup = html({ checkout: card, order: { state: "failed", order_code: card.orderCode }, now: T + 3600 });
    expect(markup).toContain(text("upgrade.order.failedCard", { code: card.orderCode }));
    expect(markup).toContain("đừng trả lại");
    expect(markup).toContain(text("upgrade.newOrder"));
    expect(markup).not.toContain(text("upgrade.browser.cancelNote"));
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận hỏng**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm exec vitest run src/windows/main/screens/UpgradeView.test.ts`
Expected: FAIL ở các test của "ba bước", "nhóm cách trả", "ghi chú cách trả", "server chưa bán USD", "khung đơn: tiêu đề là h3". Các test về đơn chờ có thể đã PASS.

- [ ] **Bước 3: Viết lại phần hiển thị của `UpgradeView.tsx`**

Dòng import đầu file: đổi `import { useState } from "react";` thành `import { type ReactNode, useState } from "react";`.

Thay chú thích đầu file (hai dòng trên `export interface UpgradeViewProps`) bằng:

```ts
// Phần hiển thị của màn hình Nâng cấp (kế hoạch hardening 06 C2): chỉ nhận props, không đọc store, để test vẽ được trong
// Node bằng `react-dom/server` (UpgradeView.test.ts). `UpgradeScreen` nối store vào đây. Ba bước đánh số (spec 2026-10-22):
// 1 Cách thanh toán, 2 Chọn gói, 3 Thanh toán; chưa có bảng gói thì chưa có bước nào.
```

Giữ nguyên phần thân hàm từ `const t = …` tới dòng `const browser = checkout !== null && isBrowserOrder(checkout);`. Thay **toàn bộ** câu lệnh `return ( … );` cuối hàm bằng:

```tsx
  const planList = (
    <ul className="plans">
      <li className="plan">
        <span className="plan-name">{t("plan.free")}</span>
        <span className="plan-price">{formatPrice(0, currency)}</span>
        <span className="plan-quota">{t("upgrade.free.quota")}</span>
        {current === "free" && <span className="badge active">{t("upgrade.current")}</span>}
      </li>
      {plans?.map((p) => (
        <li key={p.code} className="plan">
          <label>
            <input
              type="radio"
              name="plan"
              value={p.code}
              checked={plan === p.code}
              disabled={locked || busy}
              onChange={() => setPicked(p.code)}
            />
            <span className="plan-name">{p.name}</span>
          </label>
          {priceOf(p, currency) !== null && (
            <span className="plan-price">
              {formatPrice(priceOf(p, currency) ?? 0, currency)} <small>{t("upgrade.perDays", { days: p.days_per_order })}</small>
            </span>
          )}
          <span className="plan-quota">
            {p.quota_minutes_per_cycle === null
              ? t("upgrade.unlimited")
              : t("upgrade.hours", { hours: p.quota_minutes_per_cycle / 60 })}
          </span>
          {current === p.code && <span className="badge active">{t("upgrade.current")}</span>}
        </li>
      ))}
    </ul>
  );
  // Ghi chú của cách trả đang chọn: ở bước 1, ngay dưới hai nút.
  const methodNotes = (
    <div className="method-notes">
      <p className="hint">{t(card ? "upgrade.cardNote" : "upgrade.bankOnly")}</p>
      {/* Điều khoản Creem 3.7: Creem là bên bán lại (merchant of record) của đơn thẻ. */}
      {card && <p className="hint">{t("upgrade.cardMor")}</p>}
    </div>
  );
  const alert = (
    <div role="alert">
      {error && (
        <div className="notice error">
          <Icon name="alert" />
          <span>{t(errorKey(error.code))}</span>
        </div>
      )}
    </div>
  );
  const checkoutCard = checkout && (
    <div className={browser ? "card checkout browser" : "card checkout"}>
      {/* SVG do phía Rust vẽ (license::purchase::qr_svg), không lấy từ server hay người dùng. Đơn thẻ không có mã QR. */}
      {checkout.qrSvg != null && (
        <div className="qr" role="img" aria-label={t("upgrade.qr")} dangerouslySetInnerHTML={{ __html: checkout.qrSvg }} />
      )}
      <div>
        <h3 className="card-title">{t(browser ? "upgrade.browser.title" : "upgrade.scan")}</h3>
        <p className="order-code">
          {t("upgrade.order", { code: checkout.orderCode })}
          {checkout.amount > 0 && ` · ${formatPrice(checkout.amount, checkout.currency)}`}
        </p>
        {checkout.licenseExpiresAt !== null && (
          <p className="hint">
            {t("upgrade.newExpiry", { time: when(checkout.licenseExpiresAt) })}
            {(checkout.convertedDays ?? 0) > 0 && ` ${t("upgrade.converted", { days: checkout.convertedDays ?? 0 })}`}
            {checkout.convertedDays !== null && ` ${t("upgrade.noRefund")}`}
          </p>
        )}
        {/* Đơn thẻ: giờ hẹn trả và lời dặn "trình duyệt sẽ mở trang" chỉ khi đơn còn chờ. Đã xong thì câu trạng thái dặn
            đừng trả lại; quá giờ hẹn thì không hiện một giờ đã qua (câu trạng thái nói đã quá giờ). */}
        {!(browser && (pending === null || now > checkout.expiresAt)) && (
          <p className="hint">{t(browser ? "upgrade.linkExpiresPage" : "upgrade.linkExpires", { time: when(checkout.expiresAt) })}</p>
        )}
        {browser && pending !== null && <p className="hint">{t("upgrade.browser.note")}</p>}
        <p className={order?.state === "paid" ? "note order-status ok" : "note order-status"} role="status">
          <Icon name={order?.state === "paid" ? "check" : "info"} size={16} />
          <span>{t(orderMessageKey(order, browser, cardOrderLate(checkout, order, now)), { code: checkout.orderCode })}</span>
        </p>
        <div className="actions">
          <button onClick={onOpenPage} disabled={orderFinished(order)}>
            <Icon name="external" size={16} />
            {t(browser ? "upgrade.reopen" : "upgrade.openPage")}
          </button>
          <button onClick={onCancel}>{t(orderFinished(order) ? "upgrade.newOrder" : "common.cancel")}</button>
        </div>
        {/* Đơn thẻ còn chờ: trang Creem vẫn nhận tiền sau khi hủy đơn ở app (Q3; nút "Hủy" giữ theo spec §5). */}
        {browser && pending !== null && <p className="hint">{t("upgrade.browser.cancelNote")}</p>}
      </div>
    </div>
  );

  // Chưa có bảng gói (đang tải, không có mạng): chưa biết server bán loại tiền nào nên chưa vẽ bước nào và nút cách trả
  // (tránh vừa hiện VietQR lại nhảy sang thẻ); ghi chú cách trả chỉ khi có đơn chờ, vì loại tiền biết chắc từ đơn.
  if (plans === null) {
    return (
      <>
        {planList}
        {!error && <p className="hint">{t("upgrade.loading")}</p>}
        {pending !== null && methodNotes}
        {alert}
        {checkoutCard}
      </>
    );
  }
  return (
    <>
      <div className="upgrade-step">
        <StepTitle no={1} id="upgrade-method-label">
          {t("upgrade.method")}
        </StepTitle>
        <div className="step-body">
          <div className="pay-methods" role="radiogroup" aria-labelledby="upgrade-method-label">
            {currencies.map((c) => (
              <label key={c} className="pay-method">
                <input
                  type="radio"
                  name="method"
                  value={c}
                  checked={currency === c}
                  disabled={locked || busy}
                  onChange={() => setPickedCurrency(c)}
                />
                <Icon name={c === "USD" ? "card" : "qr"} size={16} />
                <span>{t(c === "USD" ? "upgrade.method.usd" : "upgrade.method.vnd")}</span>
              </label>
            ))}
          </div>
          {methodNotes}
        </div>
      </div>
      <div className="upgrade-step">
        <StepTitle no={2} id="upgrade-plan-label">
          {t("upgrade.step.plan")}
        </StepTitle>
        <div className="step-body">{planList}</div>
      </div>
      <div className="upgrade-step">
        <StepTitle no={3} id="upgrade-pay-label">
          {t("upgrade.step.pay")}
        </StepTitle>
        <div className="step-body">
          {alert}
          {pending === null && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                onStart(plan, email, consent, renew, currency);
              }}
            >
              {renew && (
                <p className="note">
                  <Icon name="info" size={16} />
                  <span>{t("upgrade.renewing")}</span>
                </p>
              )}
              <label className="field-label form-label" htmlFor="upgrade-email">
                {t("upgrade.email")}
              </label>
              <input id="upgrade-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsentFor(e.target.checked ? currency : null)} />
                <span>{t(card ? "upgrade.consentCard" : "upgrade.consent")}</span>
              </label>
              <LegalDetails kind="privacy" />
              {/* Đơn thẻ: điều khoản bán hàng (EULA) ngay cạnh, cho người dùng bản cũ chưa thấy EULA mới (điều khoản Creem 3.7). */}
              {card && <LegalDetails kind="eula" />}
              <div className="actions">
                <button className="primary lg" type="submit" disabled={busy || !consent || email.trim() === ""}>
                  {t(card ? "upgrade.payCard" : "upgrade.pay")}
                </button>
              </div>
            </form>
          )}
          {checkoutCard}
        </div>
      </div>
    </>
  );
}

// Tiêu đề một bước: số thứ tự chỉ để nhìn (`aria-hidden`; các tiêu đề đã theo thứ tự), `id` đặt ở phần chữ để nhóm radio của
// bước 1 lấy đúng chữ đó làm nhãn.
function StepTitle({ no, id, children }: { no: number; id: string; children: ReactNode }) {
  return (
    <h2 className="step-title">
      <span className="step-no" aria-hidden="true">
        {no}
      </span>
      <span id={id}>{children}</span>
    </h2>
  );
}
```

Lưu ý: hàm `UpgradeView` cũ kết thúc bằng `}` ngay sau câu `return`. Khối trên đã có `}` đóng hàm `UpgradeView` (ngay trước chú thích của `StepTitle`), nên không giữ lại `}` cũ.

`src/windows/main/screens/UpgradeScreen.tsx`: trong chú thích đầu hàm, câu `Hai cách trả (chỉ hiện khi server bán cả hai): VietQR bằng VND, hay thẻ quốc tế bằng USD; mặc định theo gợi ý của server (nước của máy), đổi được.` vắt qua hai dòng chú thích. Thay cả câu bằng `Ba bước (spec 2026-10-22): cách trả (VietQR bằng VND, hay thẻ quốc tế bằng USD khi server bán; chọn sẵn theo ngôn ngữ giao diện, đổi được), gói, rồi thanh toán.`, rồi ngắt lại các dòng chú thích của đoạn đó cho mỗi dòng không quá khoảng 125 ký tự như các dòng xung quanh. Thêm `src/windows/main/screens/UpgradeScreen.tsx` vào lệnh `git add` ở bước 7.

- [ ] **Bước 4: Chạy test của màn hình**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm exec vitest run src/windows/main/screens/UpgradeView.test.ts`
Expected: PASS hết.

- [ ] **Bước 5: CSS**

`src/styles/main.css`: thay khối sau (ở mục "nâng cấp", ngay trên chú thích `/* Lời dặn dưới hai nút của đơn thẻ đang chờ. */`):

```css
/* Ghi chú dưới bảng giá: cách trả, và câu bên bán lại (merchant of record) của đơn thẻ. */
.plan-notes {
  margin: 0.6rem 0 1rem;
}

.plan-notes .hint {
  margin: 0 0 0.35rem;
}

.plan-notes .hint:last-child {
  margin-bottom: 0;
}
```

bằng:

```css
/* Ba bước của màn hình Nâng cấp (spec 2026-10-22 §2): tiêu đề có số thứ tự trong vòng tròn màu nhấn; thân bước thụt vào cho
   thẳng với chữ của tiêu đề (rộng vòng tròn + khoảng cách). */
.upgrade-step + .upgrade-step {
  margin-top: 1.5rem;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.7rem;
  font-size: 1.07rem;
  font-weight: 650;
}

.step-no {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.step-body {
  margin-left: 2.2rem;
}

/* Cách trả: nút viên thuốc. Ô radio gốc ẩn nhưng vẫn nhận bàn phím (phím mũi tên), như .swatch; nút đang chọn tô kín màu
   nhấn để khác hẳn thẻ gói (chỉ có viền). */
.pay-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.pay-method {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.pay-method input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.pay-method:has(input:not(:checked):not(:disabled)):hover {
  border-color: var(--faint);
  color: var(--text);
}

.pay-method:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.pay-method:has(input:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Bị khóa (đơn đang chờ, đang tạo đơn): cách trả của đơn vẫn rõ như lúc chọn được; ô còn lại mờ như thẻ gói. */
.pay-method:has(input:disabled) {
  cursor: default;
}

.pay-method:has(input:disabled:not(:checked)) {
  opacity: 0.6;
}

/* Ghi chú của cách trả đang chọn (ở bước 1), và câu bên bán lại (merchant of record) của đơn thẻ. */
.method-notes {
  margin: 0.6rem 0 0;
}

.method-notes .hint {
  margin: 0 0 0.35rem;
}

.method-notes .hint:last-child {
  margin-bottom: 0;
}
```

Kiểm: `grep -n "plan-notes" src` phải rỗng.

- [ ] **Bước 6: Type-check, build và chạy toàn bộ test JS**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm build && pnpm test`
Expected: build thành công; mọi test PASS.

- [ ] **Bước 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git branch --show-current && git add src/windows/main/screens/UpgradeView.tsx src/windows/main/screens/UpgradeView.test.ts src/windows/main/screens/UpgradeScreen.tsx src/styles/main.css && git commit -m "feat(upgrade): màn hình Nâng cấp chia ba bước, cách trả là nút viên thuốc có biểu tượng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Kiểm DOM thật năm ngôn ngữ và nhìn bằng mắt

**Files:**
- Modify: `scripts/ui-preview/check-i18n.mjs`

- [ ] **Bước 1: Sửa các helper của màn hình Nâng cấp**

Trong `scripts/ui-preview/check-i18n.mjs`:

1. Ở chú thích đầu file, thay đoạn `hai cách trả (VND, USD) chỉ khi server bán cả hai và chọn sẵn theo gợi ý;` bằng `ba bước đánh số (spec 2026-10-22); hai cách trả (VND, USD) khi server bán cả hai, chỉ VietQR khi chưa bán thẻ; cách trả chọn sẵn theo ngôn ngữ (vi: VND, còn lại: USD);`.

2. Thay helper `noMethod` (cả chú thích) bằng:

```js
// Server chỉ bán VND: bước 1 vẫn có, đúng một ô VietQR đang chọn (spec 2026-10-22 §2).
const onlyVnd = [
  `(() => { const r = ${radios("method")}; return r.length === 1 && r[0].value === "VND" && r[0].checked && !!document.querySelector("#upgrade-method-label"); })()`,
  "bước 1 chỉ có một ô VietQR, đang chọn (server chỉ bán VND)",
];
```

3. Thay helper `notes` (cả chú thích) bằng:

```js
// Ghi chú cách trả ở bước 1 (`.method-notes` trong `.upgrade-step` đầu tiên), theo thứ tự hiện.
const notes = (lang, keys) => [
  inPage(
    lang,
    `const s = document.querySelector(".upgrade-step"); const h = [...(s?.querySelectorAll(".method-notes p.hint") ?? [])].map((p) => p.textContent); return JSON.stringify(h) === JSON.stringify(${JSON.stringify(keys)}.map((k) => t(k)));`,
  ),
  `ghi chú ở bước 1 đúng ${keys.join(" + ")}`,
];

// Ba bước đánh số (spec 2026-10-22 §2): đúng ba tiêu đề h2 theo thứ tự, số 1, 2, 3 chỉ để nhìn, chữ đúng ba khóa; bảng gói ở
// bước 2.
const steps = (lang) =>
  inPage(
    lang,
    `const h = [...document.querySelectorAll(".upgrade-step > h2.step-title")]; const keys = ["upgrade.method", "upgrade.step.plan", "upgrade.step.pay"]; return h.length === 3 && h.every((x, i) => x.querySelector(".step-no").textContent === String(i + 1) && x.querySelector(".step-no").getAttribute("aria-hidden") === "true" && x.lastElementChild.textContent === t(keys[i])) && !!document.querySelectorAll(".upgrade-step")[1].querySelector("ul.plans");`,
  );

// Cách trả chọn sẵn theo ngôn ngữ của lượt chạy (spec 2026-10-22 §3): tiếng Việt là VietQR, ngôn ngữ khác là thẻ quốc tế.
const defaultMethod = (lang) => (lang === "vi" ? "VND" : "USD");

// VietQR đang chọn, chưa có đơn: giá VND, ghi chú VietQR, không nhắc Creem, một mục gập pháp lý.
const vndChosen = (lang) => [
  method("VND", false),
  planRadios("monthly", false),
  bodyHas("50.000 đ"),
  bodyHas("269.000 đ"),
  bodyHas("500.000 đ"),
  bodyHasNot("$"),
  notes(lang, ["upgrade.bankOnly"]),
  noCreemHint,
  bodyHasNot("merchant of record"),
  [`document.querySelectorAll("details.legal-details").length === 1`, "chỉ một mục gập pháp lý (chính sách), chưa có EULA của đơn thẻ"],
];

// Thẻ quốc tế đang chọn, chưa có đơn: giá USD, ghi chú cardNote (có Creem) và câu merchant of record, câu đồng ý của thẻ, nút
// trả bằng trình duyệt, thêm mục gập EULA.
const usdChosen = (lang) => [
  method("USD", false),
  planRadios("monthly", false),
  bodyHas("$3.99"),
  bodyHas("$21.99"),
  bodyHas("$39.99"),
  bodyHasNot("50.000 đ"),
  notes(lang, ["upgrade.cardNote", "upgrade.cardMor"]),
  bodyHas("merchant of record"),
  [
    inPage(
      lang,
      `return document.querySelector(".consent").textContent === t("upgrade.consentCard") && document.querySelector('form.card button[type="submit"]').textContent.includes(t("upgrade.payCard"));`,
    ),
    "câu đồng ý của thẻ (upgrade.consentCard) và nút upgrade.payCard",
  ],
  [`document.querySelectorAll("details.legal-details").length === 2`, "hai mục gập pháp lý (chính sách và EULA)"],
];
```

(`steps` trả về một biểu thức; khi dùng thì ghép với câu mô tả, xem bước 2.)

4. Trong `cardOrder` và `qrOrder`, đổi hai chỗ `h2.card-title` thành `h3.card-title`.

5. Trong `startByCard`: đổi hai chỗ `page.click('.choice:has(input[value="VND"])')` và `page.click('.choice:has(input[value="USD"])')` thành `page.click('.pay-method:has(input[value="VND"])')` và `page.click('.pay-method:has(input[value="USD"])')`.

6. Thay hàm `startByQr` (cả chú thích) bằng:

```js
// Bấm thật: chọn chuyển khoản VietQR (VND; ở tiếng Việt đã chọn sẵn, bấm lại không đổi gì), gói mặc định Monthly.
async function startByQr(page, ck, lang) {
  await page.click('.pay-method:has(input[value="VND"])');
  await type(page, "#upgrade-email", EMAIL);
  await page.click(".consent");
  await ck(...consentIs(true));
  await page.click('form.card button[type="submit"]');
  await sleep(500);
  await ck(...startedWith("monthly", "VND"));
  await ck(...method("VND", true));
  await ck(...planRadios("monthly", true));
  await ck(`document.querySelector(".order-code").textContent.includes("50.000 đ")`, "đơn VietQR của gói Monthly ghi 50.000 đ");
  for (const check of qrOrder(lang)) await ck(...check);
}

// Bấm thật sang cách trả không được chọn sẵn: chữ, giá và ghi chú đổi theo cách đó.
async function pickOtherMethod(page, ck, lang) {
  const other = defaultMethod(lang) === "VND" ? "USD" : "VND";
  await page.click(`.pay-method:has(input[value="${other}"])`);
  await sleep(200);
  for (const check of other === "VND" ? vndChosen(lang) : usdChosen(lang)) await ck(...check);
}
```

- [ ] **Bước 2: Sửa danh sách cảnh và điều kiện**

Thay đoạn cảnh Nâng cấp trong `SCREENS` (từ dòng chú thích `// Nâng cấp (spec 2026-10-14). Khách ở Việt Nam …` tới hết dòng `["upgrade-start-qr", …]`) bằng:

```js
  // Nâng cấp (spec 2026-10-14, 2026-10-22): ba bước; cách trả chọn sẵn theo ngôn ngữ của lượt chạy (vi: VietQR, còn lại: thẻ).
  ["upgrade", "screen=upgrade&plan=free"],
  // Bấm sang cách trả còn lại: chữ, giá và ghi chú của cách đó.
  ["upgrade-other", "screen=upgrade&plan=free", { interact: pickOtherMethod }],
  // Server chưa bán USD: bước 1 chỉ có một ô VietQR, ở mọi ngôn ngữ.
  ["upgrade-vnd-only", "screen=upgrade&plan=free&usd=0"],
  // Đơn VietQR đang chờ: ô VietQR khóa ở mọi ngôn ngữ (cách trả của đơn, không theo ngôn ngữ); đơn do bản app cũ lưu (đọc lại
  // với số tiền 0, loại tiền rỗng) cũng vậy.
  ["upgrade-qr", "screen=upgrade&plan=free&checkout=1"],
  ["upgrade-qr-old", "screen=upgrade&plan=free&checkout=1&pending=old"],
  // Đơn thẻ đang chờ (không mã QR): ô thẻ khóa ở mọi ngôn ngữ, kể cả tiếng Việt; đơn cũ (số tiền 0, loại tiền rỗng); đơn quá
  // giờ hẹn trả mà server còn báo chờ.
  ["upgrade-card", "screen=upgrade&plan=free&checkout=card"],
  ["upgrade-card-old", "screen=upgrade&plan=free&checkout=card&pending=old"],
  ["upgrade-card-late", "screen=upgrade&plan=free&checkout=card&late=1"],
  // Giờ đóng băng (now=): đồng hồ của cả trang khớp, nên đơn thẻ mới (hạn 30 phút sau giờ đó) không bị coi là quá hạn dù giờ thật
  // đã xa hơn nhiều.
  ["upgrade-card-frozen", "screen=upgrade&plan=free&checkout=card&now=2026-01-01T00:00:00Z"],
  // Bấm thật (tên có "start": ảnh chụp là màn hình sau khi tạo đơn).
  ["upgrade-start-card", "screen=upgrade&plan=free", { interact: startByCard }],
  ["upgrade-start-qr", "screen=upgrade&plan=free", { interact: startByQr }],
```

Trong `EXTRA`, thay các mục `upgrade`, `"upgrade-intl"`, `"upgrade-vnd-only"`, `"upgrade-usd-off"` (cả chú thích của chúng) bằng:

```js
  // Ba bước; chọn sẵn cách trả theo ngôn ngữ; nhãn "Cách thanh toán" nhìn thấy được (không chỉ aria-label). Mỗi ngôn ngữ: câu
  // cardNote có "Creem", bankOnly thì không.
  upgrade: (lang) => [
    [steps(lang), "ba bước 1 Cách thanh toán, 2 Chọn gói, 3 Thanh toán; bảng gói ở bước 2"],
    [
      inPage(
        lang,
        `const l = document.querySelector("#upgrade-method-label"); const g = document.querySelector('[role="radiogroup"]'); const b = l?.getBoundingClientRect(); return !!l && l.textContent === t("upgrade.method") && getComputedStyle(l).visibility === "visible" && b.width > 20 && b.height > 8 && g.getAttribute("aria-labelledby") === "upgrade-method-label";`,
      ),
      'nhãn "Cách thanh toán" (upgrade.method) có chữ nhìn thấy và gắn với nhóm radio (aria-labelledby)',
    ],
    ...(defaultMethod(lang) === "VND" ? vndChosen(lang) : usdChosen(lang)),
    [
      inPage(lang, `return t("upgrade.cardNote").includes("Creem") && !t("upgrade.bankOnly").includes("Creem");`),
      'chữ của ngôn ngữ này: upgrade.cardNote có "Creem", upgrade.bankOnly thì không',
    ],
  ],
  // Server chưa bán USD (bảng giá không có giá USD): bước 1 chỉ có VietQR, ở mọi ngôn ngữ; chỉ VND, không nhắc Creem; câu đồng
  // ý của VietQR.
  "upgrade-vnd-only": (lang) => [
    [steps(lang), "vẫn đủ ba bước khi chỉ bán VND"],
    onlyVnd,
    planRadios("monthly", false),
    bodyHas("50.000 đ"),
    bodyHasNot("$"),
    notes(lang, ["upgrade.bankOnly"]),
    noCreemHint,
    bodyHasNot("merchant of record"),
    [
      inPage(lang, `return document.querySelector(".consent").textContent === t("upgrade.consent");`),
      "câu đồng ý của VietQR (upgrade.consent), không phải của thẻ",
    ],
  ],
```

Cũng trong `EXTRA`: xóa mục `"upgrade-qr-intl"` và mục `"upgrade-card-vn"` (cả chú thích của `"upgrade-card-vn"`); sửa chú thích của `"upgrade-qr"` thành `// Đơn VietQR: ô VND bị khóa ở mọi ngôn ngữ (cả đơn cũ chưa có loại tiền); giá VND; câu VietQR.` Các mục còn lại giữ nguyên.

Kiểm: `grep -n "suggest\|noMethod\|\.choice\|plan-notes\|h2.card-title\|upgrade-intl\|usd-off\|qr-intl\|card-vn" scripts/ui-preview/check-i18n.mjs` phải rỗng.

- [ ] **Bước 3: Chạy kiểm DOM ở năm ngôn ngữ**

Mở Vite của worktree ở chế độ nền (Bash `run_in_background: true`):

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 --strictPort`

Khi Vite đã chạy (`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1431/` ra `200`):

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && ONLY=upgrade node scripts/ui-preview/check-i18n.mjs vi en ja zh ko`
Expected: in `vi: xong`, `en: xong`, `ja: xong`, `zh: xong`, `ko: xong` và thoát mã 0. Có điều kiện sai thì sửa code (không nới điều kiện), chạy lại tới khi đạt.

Rồi chạy cả bộ (mọi màn hình) cho chắc không màn hình khác hỏng vì CSS:

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && node scripts/ui-preview/check-i18n.mjs vi en ja zh ko`
Expected: thoát mã 0.

- [ ] **Bước 4: Nhìn bằng mắt**

Chụp bằng Chrome không đầu (Vite cổng 1431 vẫn chạy). `S` là thư mục scratchpad của phiên:

```bash
S=/private/tmp/claude-502/-Users-dtphong-Desktop-software-business-ai-translator/f0e21284-51a7-44ca-a614-a2e26682ef53/scratchpad
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for c in "vi::lang=vi::960,1150" "en::lang=en::960,1250" "vi-dark::lang=vi&theme=dark::960,1150" "en-dark::lang=en&theme=dark::960,1250" "vi-720::lang=vi::720,1300" "en-card::lang=en&checkout=card::960,1300" "vi-qr::lang=vi&checkout=1::960,1300" "en-vndonly::lang=en&usd=0::960,1150"; do
  n=${c%%::*}; rest=${c#*::}; q=${rest%%::*}; size=${rest#*::}
  "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=$S/chrome-$n --virtual-time-budget=4000 --window-size=$size --screenshot=$S/after-$n.png "http://127.0.0.1:1431/?screen=upgrade&plan=free&$q" 2>/dev/null
done
ls $S/after-*.png
```

Xem từng ảnh (công cụ Read). Phải thấy:
- ba tiêu đề có vòng số 1, 2, 3; thân bước thẳng hàng với chữ của tiêu đề;
- hai nút viên thuốc có biểu tượng, nút đang chọn tô kín màu nhấn (tiếng Việt: VietQR; tiếng Anh: thẻ), khác hẳn thẻ gói;
- ghi chú ngay dưới hai nút;
- giao diện tối: chữ trên nút đang chọn đọc được, không có màu cứng lạc tông;
- 720 px: hai nút xuống dòng gọn, không cuộn ngang;
- có đơn chờ: nút không phải của đơn mờ đi; khung đơn ở bước 3;
- `usd=0`: một nút VietQR.

Có lệch (khoảng cách, canh hàng) thì sửa `src/styles/main.css`, chụp lại, rồi chạy lại bước 3.

- [ ] **Bước 5: Tắt Vite**

Dừng tác vụ nền của Vite (TaskStop). Kiểm `lsof -nP -iTCP:1431 -sTCP:LISTEN` ra rỗng.

- [ ] **Bước 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git branch --show-current && git add scripts/ui-preview/check-i18n.mjs src/styles/main.css && git commit -m "test(ui-preview): kiểm màn hình Nâng cấp ba bước, cách trả chọn sẵn theo ngôn ngữ (5 ngôn ngữ)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Nếu bước 4 không sửa CSS thì `git add` chỉ có `check-i18n.mjs`.)

---

### Task 6: Website — hướng dẫn, ảnh chụp, test

Website chỉ nói điều có thật: **không deploy** ở task này. Deploy sau khi bản app có thay đổi này đã phát hành (quy trình phát hành, bước `pnpm deploy`).

**Files:**
- Modify: `website/test/site.test.mjs` (test `"hướng dẫn mua gói và hỏi đáp: …"`, mảng `cfg.vi.steps`, `cfg.vi.old`, `cfg.en.steps`, `cfg.en.old`)
- Modify: `website/src/content/vi/guide-license.mjs`, `website/src/content/en/guide-license.mjs`
- Modify: `website/src/content/vi/pricing.mjs`, `website/src/content/en/pricing.mjs`
- Modify: `scripts/ui-preview/shoot.mjs`
- Modify: `website/src/assets/img/app/manifest.json`, ảnh `app-upgrade.{vi,en}.webp`, `app-upgrade-qr.{vi,en}.webp`, `app-upgrade-card.{vi,en}.webp`
- Delete: `website/src/assets/img/app/app-upgrade-usd.en.webp`

- [ ] **Bước 1: Sửa test website trước (test hỏng)**

Trong `website/test/site.test.mjs`, test `"hướng dẫn mua gói và hỏi đáp: …"`:
- `cfg.vi.steps`: thay phần tử `"chọn sẵn theo nước nơi bạn kết nối mạng"` bằng hai phần tử `"chọn sẵn theo ngôn ngữ giao diện"`, `"Nếu bước này chỉ có VietQR thì thẻ quốc tế chưa được bán lúc này"`.
- `cfg.vi.old`: thêm phần tử `"theo nước nơi bạn kết nối mạng"`.
- `cfg.en.steps`: thay phần tử `"based on the country you connect from"` bằng `"based on the interface language"`.
- `cfg.en.old`: thêm phần tử `"the country you connect from"`.

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc/website && node --test --test-name-pattern="hướng dẫn mua gói và hỏi đáp" test/site.test.mjs`
Expected: FAIL (trang còn câu "theo nước").

- [ ] **Bước 2: Sửa hướng dẫn tiếng Việt** (`website/src/content/vi/guide-license.mjs`)

- Trong bước HowTo `name: "Chọn Cách thanh toán và gói"`, thay `text` bằng:
  `"Ở bước 1 Cách thanh toán, chọn Chuyển khoản VietQR (VND) hoặc Thẻ quốc tế (USD); app chọn sẵn theo ngôn ngữ giao diện (tiếng Việt thì VietQR, ngôn ngữ khác thì thẻ quốc tế) và bạn đổi được. Rồi ở bước 2 Chọn gói, chọn khung Monthly, 6 Months hoặc Yearly; giá đổi theo cách trả."`
- Trong bước HowTo `name: "Nhập email nhận key"`, đổi đầu `text` từ `"Nhập Email nhận key, tick ô đồng ý` thành `"Ở bước 3 Thanh toán, nhập Email nhận key, tick ô đồng ý` (phần sau giữ nguyên).
- Thay nguyên mục `<li>Chọn <strong>Cách thanh toán</strong> ở đầu màn hình: … và app dùng VietQR.</li>` bằng:
  ```html
  <li>Màn hình chia ba bước. Ở bước 1 <strong>Cách thanh toán</strong>, chọn <strong>Chuyển khoản VietQR (VND)</strong> hoặc <strong>Thẻ quốc tế (USD)</strong>; ghi chú ngay dưới nói cách trả đó hoạt động thế nào. App chọn sẵn theo ngôn ngữ giao diện (tiếng Việt thì VietQR, ngôn ngữ khác thì thẻ quốc tế) và bạn đổi được; giá trên các khung gói đổi theo lựa chọn. Nếu bước này chỉ có VietQR thì thẻ quốc tế chưa được bán lúc này. Không thấy các bước này: hãy cập nhật app lên bản mới nhất.</li>
  ```
- Trong mục `<li>Bấm vào khung <strong>Monthly</strong>, <strong>6 Months</strong> hoặc <strong>Yearly</strong> (giá …`, chèn ` ở bước 2 <strong>Chọn gói</strong>` ngay sau `<strong>Yearly</strong>` (trước ` (giá`).
- Trong mục `<li>Nhập <strong>Email nhận key</strong> và tick ô đồng ý: …`, đổi đầu thành `<li>Ở bước 3 <strong>Thanh toán</strong>, nhập <strong>Email nhận key</strong> và tick ô đồng ý: …` (phần sau giữ nguyên).
- `alt` của ba ảnh:
  - `app-upgrade`: `"Màn hình Nâng cấp ở giao diện tiếng Việt, chọn sẵn VietQR: bước 1 Cách thanh toán (Chuyển khoản VietQR (VND) đang chọn, Thẻ quốc tế (USD)) kèm ghi chú VietQR, bước 2 Chọn gói với bốn gói Free, Monthly, 6 Months và Yearly, hạn mức và giá bằng VND, bước 3 Thanh toán với ô Email nhận key, ô đồng ý, mục gập Chính sách quyền riêng tư và nút Tạo mã thanh toán"`
  - `app-upgrade-qr`: `"Màn hình Nâng cấp khi đơn VietQR đang chờ: VietQR đang chọn ở bước 1, gói Monthly ở bước 2, và ở bước 3 mã VietQR hiện trong app kèm mã đơn, số tiền, giờ hết hạn của mã, dòng trạng thái đang chờ chuyển khoản, nút Mở trang thanh toán và nút Hủy"`
  - `app-upgrade-card`: `"Màn hình Nâng cấp khi đơn thẻ quốc tế đang chờ: Thẻ quốc tế (USD) đang chọn ở bước 1, kèm hai ghi chú nói trang thanh toán của Creem mở trong trình duyệt và Creem là bên bán lại (merchant of record); giá các gói bằng USD chưa gồm thuế ở bước 2; ở bước 3 khung Hoàn tất thanh toán trong trình duyệt với mã đơn, số tiền, giờ hẹn trả, dòng Đang chờ xác nhận thanh toán…, nút Mở lại trang thanh toán, nút Hủy và lời dặn đã trả thì đừng hủy hay tạo đơn mới"`

- [ ] **Bước 3: Sửa hướng dẫn tiếng Anh** (`website/src/content/en/guide-license.mjs`)

- Bước HowTo `name: "Choose the Payment method and a plan"`, thay `text` bằng:
  `"In step 1, Payment method, choose VietQR bank transfer (VND) or International card (USD); the app preselects one based on the interface language (VietQR in Vietnamese, international card in any other language), and you can change it. Then in step 2, Choose a plan, choose the Monthly, 6 Months or Yearly box; the prices follow your payment method."`
- Bước HowTo `name: "Enter the email for your key"`: đổi đầu `text` từ `"Enter your Email to receive your key, tick` thành `"In step 3, Checkout, enter your Email to receive your key, tick`.
- Thay nguyên mục `<li>Choose the <strong>Payment method</strong> at the top of the screen: … and the app uses VietQR.</li>` bằng:
  ```html
  <li>The screen has three steps. In step 1, <strong>Payment method</strong>, choose <strong>VietQR bank transfer (VND)</strong> or <strong>International card (USD)</strong>; the note right below explains how that method works. The app preselects one based on the interface language (VietQR in Vietnamese, international card in English, Japanese, Chinese or Korean) and you can change it; the prices on the plan boxes follow your choice. If this step only offers VietQR, card payment is not available right now. Not seeing these steps? Update the app to the latest version.</li>
  ```
- Trong mục `<li>Click the <strong>Monthly</strong>, <strong>6 Months</strong> or <strong>Yearly</strong> box (the price …`, chèn ` in step 2, <strong>Choose a plan</strong>` ngay sau ` box` (trước ` (the price`).
- Trong mục `<li>Enter your <strong>Email to receive your key</strong> and tick the agreement box: …`, đổi đầu thành `<li>In step 3, <strong>Checkout</strong>, enter your <strong>Email to receive your key</strong> and tick the agreement box: …`.
- `alt` của ba ảnh:
  - `app-upgrade`: `"The Upgrade screen in English, with International card (USD) preselected: step 1 Payment method (VietQR bank transfer (VND), International card (USD) selected) with notes about Creem’s payment page and Creem as the merchant of record, step 2 Choose a plan with the Free, Monthly, 6 Months and Yearly plans, their quota and USD prices excluding tax, step 3 Checkout with the Email to receive your key box, the agreement tick box, the folded Privacy Policy and License Agreement (EULA) and the Pay in your browser button"`
  - `app-upgrade-qr`: `"The Upgrade screen while a VietQR order is waiting: VietQR selected in step 1, the Monthly plan in step 2, and in step 3 a VietQR code drawn inside the app with the order number, the amount, the code’s expiry time, a status line waiting for the transfer, an Open payment page button and a Cancel button"`
  - `app-upgrade-card`: `"The Upgrade screen while an international card order is waiting: International card (USD) selected in step 1, with two notes saying Creem’s payment page opens in your browser and Creem is the merchant of record; plan prices in USD excluding tax in step 2; in step 3 the Finish paying in your browser panel with the order number, the amount, the payment deadline, a Waiting for payment confirmation… line, a Reopen payment page button, a Cancel button and a reminder not to cancel or create a new order if you have already paid"`

- [ ] **Bước 4: Sửa trang Bảng giá**

`website/src/content/vi/pricing.mjs`: trong `appShot({ slug: "app-upgrade", lang: "vi", … })`, thay `alt` bằng `"Màn hình Nâng cấp trong app ở giao diện tiếng Việt, chọn sẵn VietQR: bước 1 Cách thanh toán (Chuyển khoản VietQR (VND) đang chọn, Thẻ quốc tế (USD)) và bước 2 Chọn gói với bốn gói Free, Monthly, 6 Months và Yearly, hạn mức và giá bằng VND"`. Giữ `caption`.

`website/src/content/en/pricing.mjs`: trong `appShot({ slug: "app-upgrade-usd", lang: "en", … })`, đổi `slug` thành `"app-upgrade"` và thay `alt` bằng `"The Upgrade screen in the app in English, with International card (USD) preselected: step 1 Payment method next to VietQR bank transfer (VND), with a note that Creem is the merchant of record for card orders, step 2 Choose a plan with the Free, Monthly, 6 Months and Yearly plans, their allowances and USD prices excluding tax ($3.99, $21.99 and $39.99), and step 3 Checkout with the Email to receive your key box and the Pay in your browser button"`. Giữ `caption`.

- [ ] **Bước 5: Sửa cảnh chụp**

`scripts/ui-preview/shoot.mjs`:
- thay hai dòng chú thích `// Các cảnh `app-upgrade*` hiện lựa chọn thẻ quốc tế và giá USD (mặc định của mock): …` bằng:
  ```js
  // Các cảnh `app-upgrade*` có thẻ quốc tế và giá USD (bản en chọn sẵn thẻ, theo ngôn ngữ giao diện): chỉ đăng ảnh chụp lại khi
  // Creem đã bán thật, nếu không website nói về một cách trả chưa có; muốn chụp cảnh chưa bán thẻ thì thêm `usd=0` vào tham số cảnh.
  ```
- xóa dòng chú thích `// Cảnh khách ở nước ngoài thấy (server gợi ý USD, app chọn sẵn thẻ quốc tế): ảnh của trang Bảng giá tiếng Anh.` và dòng `["app-upgrade-usd", …]`.
- ở dòng `["app-upgrade-card", …]`, bỏ `suggest=usd&` trong tham số.

Kiểm: `grep -n "suggest\|app-upgrade-usd" scripts/ui-preview/shoot.mjs` phải rỗng.

- [ ] **Bước 6: Chụp lại ảnh và dọn ảnh cũ**

Mở Vite của worktree ở cổng 1430 (Bash `run_in_background: true`; kiểm `lsof -nP -iTCP:1430 -sTCP:LISTEN` trống trước, có tiến trình lạ thì dừng lại và báo, không tắt tiến trình của người khác):

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1430 --strictPort`

Rồi:

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && node scripts/ui-preview/shoot.mjs app-upgrade app-upgrade-qr app-upgrade-card`
Expected: ghi 6 ảnh (`.vi.webp`, `.en.webp` của ba cảnh) và cập nhật `bytes`, `width`, `height` trong `manifest.json`.

Xóa ảnh và mục manifest của cảnh đã bỏ:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git rm -q website/src/assets/img/app/app-upgrade-usd.en.webp && node -e 'const fs=require("fs");const p="website/src/assets/img/app/manifest.json";const m=JSON.parse(fs.readFileSync(p,"utf8")).filter(e=>e.slug!=="app-upgrade-usd");fs.writeFileSync(p,JSON.stringify(m,null,1));'
```

Sửa `description` của sáu mục còn lại bằng script (file nằm trong scratchpad, chạy với đường dẫn tuyệt đối):

```js
// /private/tmp/claude-502/-Users-dtphong-Desktop-software-business-ai-translator/f0e21284-51a7-44ca-a614-a2e26682ef53/scratchpad/manifest-desc.mjs
import { readFileSync, writeFileSync } from "node:fs";
const p = process.argv[2];
const m = JSON.parse(readFileSync(p, "utf8"));
const desc = {
  "app-upgrade.vi.webp":
    "Màn hình Nâng cấp ở giao diện tiếng Việt, chọn sẵn VietQR, chia ba bước đánh số: bước 1 Cách thanh toán với hai nút Chuyển khoản VietQR (VND) đang chọn và Thẻ quốc tế (USD), kèm ghi chú VietQR chuyển khoản từ tài khoản ngân hàng Việt Nam; bước 2 Chọn gói với bốn gói (Free 30 phút mỗi ngày dùng thử 10 ngày, Monthly 50 giờ giá 50.000 đ, 6 Months 100 giờ giá 269.000 đ, Yearly không giới hạn giá 500.000 đ); bước 3 Thanh toán với ô Email nhận key, ô đồng ý, mục gập Chính sách quyền riêng tư và nút Tạo mã thanh toán.",
  "app-upgrade.en.webp":
    "The Upgrade screen in English, with International card (USD) preselected, in three numbered steps: step 1 Payment method with two buttons, VietQR bank transfer (VND) and International card (USD), selected, and notes that you pay by card or digital wallet on Creem's payment page in your browser, prices exclude tax and Creem is the merchant of record for card orders; step 2 Choose a plan with four plans (Free with 30 minutes a day for a 10-day trial, Monthly with 50 hours for $3.99, 6 Months with 100 hours for $21.99 and Yearly with unlimited use for $39.99); step 3 Checkout with the Email to receive your key box, the agreement tick box, the folded Privacy Policy and License Agreement (EULA) and the Pay in your browser button.",
  "app-upgrade-qr.vi.webp":
    "Màn hình Nâng cấp khi đơn VietQR đang chờ: bước 1 Cách thanh toán với VietQR đang chọn và khóa, bước 2 Chọn gói với gói Monthly đang chọn còn các gói khác mờ đi, bước 3 Thanh toán với mã VietQR minh họa kèm mã đơn, số tiền 50.000 đ, giờ hết hạn của mã, dòng Đang chờ chuyển khoản…, nút Mở trang thanh toán và nút Hủy.",
  "app-upgrade-qr.en.webp":
    "The Upgrade screen while a VietQR order is waiting: step 1 Payment method with VietQR selected and locked, step 2 Choose a plan with the Monthly plan selected and the other plans dimmed, step 3 Checkout with an illustrative VietQR code, the order number, the amount 50.000 đ, the code expiry time, a Waiting for your transfer… line, an Open payment page button and a Cancel button.",
  "app-upgrade-card.vi.webp":
    "Màn hình Nâng cấp khi đơn thẻ quốc tế đang chờ: bước 1 Cách thanh toán với Thẻ quốc tế (USD) đang chọn và khóa, kèm ghi chú trả bằng thẻ hoặc ví điện tử trên trang thanh toán của Creem mở trong trình duyệt và câu nói Creem là bên bán lại (merchant of record); bước 2 Chọn gói với giá bằng USD chưa gồm thuế; bước 3 Thanh toán với khung Hoàn tất thanh toán trong trình duyệt: mã đơn, số tiền $3.99 (chưa gồm thuế), giờ hẹn Trả trước …, dòng Đang chờ xác nhận thanh toán…, nút Mở lại trang thanh toán, nút Hủy và lời dặn đã trả ở trang thanh toán thì đừng hủy hay tạo đơn mới.",
  "app-upgrade-card.en.webp":
    "The Upgrade screen while an international card order is waiting: step 1 Payment method with International card (USD) selected and locked, with notes that you pay by card or digital wallet on Creem's payment page in your browser and that Creem is the merchant of record; step 2 Choose a plan with prices in USD excluding tax; step 3 Checkout with the Finish paying in your browser panel: the order number, the $3.99 amount (excluding tax), the Finish paying before … deadline, a Waiting for payment confirmation… line, Reopen payment page and Cancel buttons and a reminder not to cancel or create a new order if you have already paid.",
};
for (const e of m) if (desc[e.file]) e.description = desc[e.file];
const missing = Object.keys(desc).filter((f) => !m.some((e) => e.file === f));
if (missing.length) throw new Error(`manifest thiếu ${missing.join(", ")}`);
writeFileSync(p, JSON.stringify(m, null, 1));
```

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && node /private/tmp/claude-502/-Users-dtphong-Desktop-software-business-ai-translator/f0e21284-51a7-44ca-a614-a2e26682ef53/scratchpad/manifest-desc.mjs website/src/assets/img/app/manifest.json`

Xem sáu ảnh mới (Read các file `.webp` trong `website/src/assets/img/app/`; nếu Read không mở được WebP thì đổi sang PNG trong scratchpad bằng `sips -s format png <ảnh> --out <scratchpad>/<tên>.png` rồi xem). Đối chiếu từng mô tả và alt: mô tả nào nói điều không có trên ảnh thì sửa mô tả cho khớp ảnh. Không sửa ảnh cho khớp mô tả.

Tắt Vite cổng 1430 (TaskStop), kiểm cổng đã trống.

- [ ] **Bước 7: Chạy toàn bộ test website**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc/website && pnpm test`
Expected: PASS hết, kể cả "manifest ảnh app: …", "hướng dẫn mua gói cho xem đủ ba ảnh …", "HowTo JSON-LD …", "mọi giá USD nêu trên website …", và test chặn lộ công nghệ lõi.

- [ ] **Bước 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git branch --show-current && git add website/test/site.test.mjs website/src/content/vi/guide-license.mjs website/src/content/en/guide-license.mjs website/src/content/vi/pricing.mjs website/src/content/en/pricing.mjs scripts/ui-preview/shoot.mjs website/src/assets/img/app && git commit -m "docs(website): hướng dẫn mua theo ba bước, cách trả chọn sẵn theo ngôn ngữ; chụp lại ảnh Nâng cấp (chưa deploy)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ghi chú spec cũ và kiểm toàn bộ

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-creem-international-payment-design.md` (hàng D4 của bảng quyết định)

- [ ] **Bước 1: Ghi chú D4**

Trong hàng `| D4 | Chọn cổng ở app | … |`, ở cột "Mặc định", thêm vào cuối ô (trước dấu `|` của cột "Lý do"):

` **Đã thay ở phía app (spec 2026-10-22-nang-cap-ba-buoc, bản app sau 0.2.2): chọn sẵn theo ngôn ngữ giao diện (tiếng Việt thì VND, ngôn ngữ khác thì USD); server vẫn gửi `suggested_currency` cho app cũ.**`

- [ ] **Bước 2: Kiểm toàn bộ**

Chạy lần lượt, mỗi lệnh phải đạt:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm build
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && pnpm test
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && cargo fmt --all -- --check
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && CARGO_TARGET_DIR=/Users/dtphong/Desktop/software_business/ai-translator/target cargo clippy --locked --workspace --all-targets -- -D warnings
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && CARGO_TARGET_DIR=/Users/dtphong/Desktop/software_business/ai-translator/target cargo test --locked --workspace
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc/website && pnpm test
```

Expected: build thành công, mọi test xanh, clippy không cảnh báo. Ghi số test đạt của từng bộ để báo lại. Test nào đỏ thì sửa nguyên nhân; nếu đỏ do lỗi có sẵn trên `main` (đã thấy ở task 0) thì ghi rõ, không che.

Kiểm thêm không còn dấu vết ở code app: `grep -rn "suggestedCurrency\|suggest=" src scripts/ui-preview` phải rỗng.

- [ ] **Bước 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nang-cap-ba-buoc && git branch --show-current && git add docs/superpowers/specs/2026-10-14-creem-international-payment-design.md && git commit -m "docs(spec): D4 của spec Creem đã thay bằng chọn sẵn theo ngôn ngữ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Bước 4: Báo lại chủ dự án**

Tổng kết: các commit trên nhánh `nang-cap-ba-buoc`, số test đạt, ảnh trước/sau, việc còn lại (thử tay trên app thật bằng `pnpm tauri dev`, gộp vào `main`, phát hành 0.2.3, rồi `pnpm deploy` website). Không merge, không push, không đẩy tag, không deploy.
