# Giai đoạn 1 · 06b: Bản quyền trong app — giao diện, thử tay, Windows

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần giao diện của kế hoạch 06 (mục 2.6 của kế hoạch 00) trên lõi Rust của 06a:
- Cài đặt › Bản quyền (§4.3): gói, trạng thái, key đã che, ngày hết hạn, hạn mức và lúc reset; kích hoạt key, danh sách máy khi key đã đủ 2 máy, gỡ kích hoạt, kiểm tra ngay, gửi lại key;
- màn hình Nâng cấp (§4.3, §6.8 "Mua ngay trong app"): 4 gói, email và ô đồng ý, mã VietQR trong app, gia hạn và đổi gói, câu theo trạng thái đơn;
- hạn mức còn lại và lúc reset ở màn hình chính, nút nâng gói; nhắc còn 5 phút; lời nhắc bản quyền; giờ mở lại trên thanh phụ đề (§4.2 bước 2, §9);
- kiểm tra chuẩn, thử tay trên Mac với staging, đợt Windows, cập nhật kế hoạch 00 và câu "luật 1" của spec §6.8.

**Kiến trúc:** Logic của giao diện nằm ở `src/lib/license.ts` và `src/store/license.ts` (test bằng vitest, không cần DOM); component React chỉ vẽ. Mọi dữ liệu tới từ 11 lệnh và 2 sự kiện của 06a; giao diện không tự tính hạn mức hay trạng thái bản quyền, không bao giờ thấy key đầy đủ, token hay `order_token`. Cửa sổ `overlay` không có lệnh mới, chỉ đọc `AppStatus.quotaWarning`, `quotaResetAt`.

**Công nghệ:** Giữ nguyên React 19.3, Zustand 5.0.15, Vite 8.3, TypeScript 7.0, vitest 5.0.3, `@tauri-apps/api` 2.12.1. Không thêm gói npm nào.

Làm sau khi 06a đã xong hẳn (06a Task 11 xanh). Bảng phiên bản, mục "Nối với kế hoạch 04", dòng của bảng đối chiếu, hợp đồng với 05, quyết định (QĐ1–QĐ31), điểm cần chủ dự án quyết, kết quả mutation và bảng task → commit tham chiếu nằm ở 06a: `docs/superpowers/plans/2026-10-03-giai-doan-1-06a-ban-quyen-loi.md`. Cách đọc các khối code, lệnh và Expected cũng như 06a.

---

## Task 1: Kiểu IPC, cách hiện bản quyền, store bản quyền

Phần logic của giao diện, test bằng vitest (không cần DOM):

- `src/lib/ipc.ts`: `LicenseView`, `QuotaView`, `Device`, `PlanOffer`, `CheckoutView`, `OrderOutcome`, 11 lệnh và 2 sự kiện mới; `AppStatus.quotaWarning`, `quotaResetAt`.
- `src/lib/license.ts`: số phút còn lại, câu tóm tắt hạn mức theo thứ tự ưu tiên, lời nhắc bản quyền (không chính hãng, giờ máy chỉnh lùi, cả ở gói Free, lâu chưa kiểm, hết hạn, thu hồi, sắp hết hạn 7 ngày), gia hạn hay mua mới, tên máy thay thế khi `device_label` là `null`, câu theo trạng thái đơn.
- `src/store/license.ts`: trạng thái bản quyền, kích hoạt (key đủ 2 máy: danh sách máy, gỡ một máy rồi kích hoạt lại), gỡ, kiểm tra ngay, bảng gói, tạo đơn, mở trang thanh toán, hủy đơn, gửi lại key; chặn bấm đúp.
- Thanh phụ đề nhắc "còn dưới 5 phút" (`overlayNotes`: `quotaLow`) khi đang dịch.

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/lib/ipc.ts`
- Create: `src/lib/license.test.ts`
- Create: `src/lib/license.ts`
- Modify: `src/lib/subtitleView.test.ts`
- Modify: `src/lib/subtitleView.ts`
- Modify: `src/store/app.test.ts`
- Create: `src/store/license.test.ts`
- Create: `src/store/license.ts`
- Modify: `src/store/overlay.test.ts`
- Modify: `src/store/transcript.test.ts`

- [ ] **Step 1: Viết test trước**

Tạo `src/lib/license.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LicenseView, OrderOutcome, QuotaView } from "./ipc";
import { deviceName, hoursUsed, isRenewal, licenseNotice, minutesLeft, orderFinished, orderMessageKey, quotaKey } from "./license";

const quota = (patch: Partial<QuotaView> = {}): QuotaView => ({
  unlimited: false,
  limitMs: 600_000,
  usedMs: 0,
  remainingMs: 600_000,
  resetAt: 1_790_900_000,
  resetKind: "daily",
  needsNetwork: false,
  lost: false,
  storageError: false,
  ...patch,
});

const licenseView = (patch: Partial<LicenseView> = {}): LicenseView => ({
  standing: "free",
  plan: "free",
  licensedPlan: null,
  key: null,
  expiresAt: null,
  refreshBefore: null,
  validatedAt: null,
  renewSoon: false,
  quota: quota(),
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  ...patch,
});

describe("hạn mức", () => {
  it("số phút làm tròn xuống, giờ đã dùng một chữ số thập phân", () => {
    expect(minutesLeft(quota({ remainingMs: 59_999 }))).toBe(0);
    expect(minutesLeft(quota({ remainingMs: 300_000 }))).toBe(5);
    expect(hoursUsed(quota({ usedMs: 5_400_000 }))).toBe(1.5);
  });

  it("câu tóm tắt theo thứ tự: không giới hạn, lỗi kho khóa, mất bản ghi, cần mạng, đã hết, còn", () => {
    expect(quotaKey(quota({ unlimited: true, storageError: true }))).toBe("quota.unlimited");
    expect(quotaKey(quota({ storageError: true, lost: true }))).toBe("quota.storageError");
    expect(quotaKey(quota({ lost: true, remainingMs: 0 }))).toBe("quota.lost");
    expect(quotaKey(quota({ needsNetwork: true, resetKind: "cycle" }))).toBe("quota.needsNetwork");
    expect(quotaKey(quota({ remainingMs: 0 }))).toBe("quota.used");
    expect(quotaKey(quota())).toBe("quota.daily");
    expect(quotaKey(quota({ resetKind: "expiry" }))).toBe("quota.cycle");
  });
});

describe("lời nhắc bản quyền", () => {
  it("theo tình trạng; sắp hết hạn chỉ khi đang có gói", () => {
    expect(licenseNotice(null)).toBeNull();
    expect(licenseNotice(licenseView())).toBeNull();
    expect(licenseNotice(licenseView({ standing: "notGenuine" }))).toBe("license.notice.notGenuine");
    expect(licenseNotice(licenseView({ standing: "clockRolledBack" }))).toBe("license.notice.clockRolledBack");
    expect(licenseNotice(licenseView({ standing: "refreshNeeded" }))).toBe("license.notice.refreshNeeded");
    expect(licenseNotice(licenseView({ standing: "expired", renewSoon: true }))).toBe("license.notice.expired");
    expect(licenseNotice(licenseView({ standing: "revoked" }))).toBe("license.notice.revoked");
    expect(licenseNotice(licenseView({ standing: "active", renewSoon: true }))).toBe("license.notice.renewSoon");
    expect(licenseNotice(licenseView({ standing: "active" }))).toBeNull();
    // Gói Free cũng nhắc chỉnh giờ máy (Q2 của review 06 lần 1).
    expect(licenseNotice(licenseView({ standing: "free", clockRolledBack: true }))).toBe("license.notice.clockRolledBack");
  });

  it("gia hạn khi đã có key chưa bị thu hồi", () => {
    expect(isRenewal(null)).toBe(false);
    expect(isRenewal(licenseView())).toBe(false);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "expired" }))).toBe(true);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "revoked" }))).toBe(false);
  });
});

describe("đơn và máy", () => {
  it("máy không tên dùng tên thay thế", () => {
    expect(deviceName({ activation_id: "a", device_label: null, last_validated_at: null }, "Máy không tên")).toBe(
      "Máy không tên",
    );
    expect(deviceName({ activation_id: "a", device_label: " Mac ", last_validated_at: null }, "x")).toBe("Mac");
  });

  it("đơn đã xong thì cho tạo đơn mới; thiếu tiền vẫn chờ chuyển bù", () => {
    const o = (state: OrderOutcome["state"]) => ({ state, order_code: 1, expires_at: 0, plan: "pro", code: "x" }) as OrderOutcome;
    expect(orderFinished(null)).toBe(false);
    expect(orderFinished(o("waiting"))).toBe(false);
    expect(orderFinished(o("underpaid"))).toBe(false);
    for (const s of ["paid", "needsReview", "refunded", "failed", "paidButNotApplied"] as const) {
      expect(orderFinished(o(s)), s).toBe(true);
    }
    expect(orderMessageKey(o("refunded"))).toBe("upgrade.order.refunded");
  });
});
```

Sửa `src/lib/subtitleView.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/subtitleView.test.ts b/src/lib/subtitleView.test.ts
index f23e25491befa3b2fe86488fba9b55b1dcf96e9c..eccd900b948b0aa5574594af6ecf4a2b5e07679b 100644
--- a/src/lib/subtitleView.test.ts
+++ b/src/lib/subtitleView.test.ts
@@ -35,6 +35,8 @@
   permissionSuspected: false,
   waitingForApp: false,
   pro: true,
+  quotaWarning: false,
+  quotaResetAt: null,
   rev: 1,
   ...patch,
 });
@@ -141,10 +143,13 @@
       overlayNotes(
         status({
           waitingForApp: true,
+          quotaWarning: true,
           indicators: { lagging: true, noAudio: true, translationUnavailable: true },
         }),
       ),
-    ).toEqual(["noAudio", "waitingForApp", "lagging", "translationUnavailable"]);
+    ).toEqual(["noAudio", "waitingForApp", "quotaLow", "lagging", "translationUnavailable"]);
+    // Còn dưới 5 phút chỉ nhắc khi đang dịch (kế hoạch 06).
+    expect(overlayNotes(status({ session: "idle", quotaWarning: true }))).toEqual([]);
   });
 
   it("chỉ báo của phiên chỉ hiện khi đang dịch; lỗi và hết hạn mức hiện sau khi dừng", () => {
```

Sửa `src/store/app.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.test.ts b/src/store/app.test.ts
index d7fcea872956053f87f4e47350b725d74768099a..5a832316d220425fe43394544dd5b4e7db8891a4 100644
--- a/src/store/app.test.ts
+++ b/src/store/app.test.ts
@@ -43,6 +43,8 @@
   permissionSuspected: false,
   waitingForApp: false,
   pro: true,
+  quotaWarning: false,
+  quotaResetAt: null,
   rev: 1,
 };
 const info: AppInfo = {
```

Tạo `src/store/license.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { CheckoutView, LicenseView } from "../lib/ipc";
import { createLicenseStore } from "./license";

const licenseView = (patch: Partial<LicenseView> = {}): LicenseView => ({
  standing: "free",
  plan: "free",
  licensedPlan: null,
  key: null,
  expiresAt: null,
  refreshBefore: null,
  validatedAt: null,
  renewSoon: false,
  quota: {
    unlimited: false,
    limitMs: 600_000,
    usedMs: 0,
    remainingMs: 600_000,
    resetAt: null,
    resetKind: "daily",
    needsNetwork: false,
    lost: false,
    storageError: false,
  },
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  ...patch,
});

const checkout: CheckoutView = {
  orderCode: 7,
  plan: "pro",
  amount: 50_000,
  currency: "VND",
  expiresAt: 1,
  qrSvg: "<svg/>",
  licenseExpiresAt: null,
  convertedDays: null,
};

describe("license store", () => {
  it("đọc trạng thái và đơn đang chờ, rồi theo sự kiện", async () => {
    const fake = fakeIpc({ get_license: () => licenseView(), get_pending_order: () => checkout });
    const store = createLicenseStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view?.plan).toBe("free");
    expect(store.getState().checkout?.orderCode).toBe(7);
    fake.emit("license://changed", licenseView({ plan: "pro", standing: "active" }));
    expect(store.getState().view?.plan).toBe("pro");
    fake.emit("license://order", { state: "paid", order_code: 7, plan: "pro" });
    expect(store.getState().order?.state).toBe("paid");
  });

  it("key đã đủ 2 máy: hiện danh sách; gỡ một máy rồi kích hoạt lại máy này", async () => {
    let full = true;
    const fake = fakeIpc({
      activate_license: () =>
        full
          ? { view: null, devices: [{ activation_id: "a1", device_label: null, last_validated_at: 5 }] }
          : { view: licenseView({ plan: "pro", standing: "active" }), devices: null },
      deactivate_other_device: () => {
        full = false;
        return null;
      },
    });
    const store = createLicenseStore(fake.ipc);
    await store.getState().activate("KEY");
    expect(store.getState().devices?.[0]?.activation_id).toBe("a1");
    expect(await store.getState().deactivateOther("KEY", "a1")).toBe(true);
    expect(store.getState().devices).toBeNull();
    expect(store.getState().view?.plan).toBe("pro");
    expect(fake.calls.map((c) => c.cmd)).toEqual(["activate_license", "deactivate_other_device", "activate_license"]);
    expect(fake.calls[1]?.args).toEqual({ key: "KEY", activationId: "a1" });
  });

  it("lỗi của lệnh hiện mã lỗi; bấm hai lần khi đang chờ chỉ gửi một lệnh", async () => {
    let release: () => void = () => {};
    const fake = fakeIpc({
      activate_license: () => {
        throw { code: "licenseLocked", field: null, message: "…" };
      },
      validate_license: () => new Promise((resolve) => (release = () => resolve(licenseView()))),
    });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().activate("K")).toBe(false);
    expect(store.getState().error).toEqual({ code: "licenseLocked", field: null });
    const first = store.getState().validate();
    void store.getState().validate();
    release();
    await first;
    expect(fake.calls.filter((c) => c.cmd === "validate_license")).toHaveLength(1);
    expect(store.getState().error).toBeNull();
  });

  it("tạo đơn gửi email, ô đồng ý và gia hạn; hủy đơn thì bỏ mã QR", async () => {
    const fake = fakeIpc({ start_checkout: () => checkout, cancel_checkout: () => null });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().startCheckout("pro_x2", "a@b.vn", true, true)).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ plan: "pro_x2", email: "a@b.vn", consent: true, renew: true });
    expect(store.getState().checkout?.qrSvg).toBe("<svg/>");
    await store.getState().cancelCheckout();
    expect(store.getState().checkout).toBeNull();
  });
});
```

Sửa `src/store/overlay.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/overlay.test.ts b/src/store/overlay.test.ts
index 6c19d568cac237668b0ab173b706706748c38ef3..e8e258629720ee543689d5ed4dfcc22ef4ec5da5 100644
--- a/src/store/overlay.test.ts
+++ b/src/store/overlay.test.ts
@@ -108,6 +108,8 @@
   permissionSuspected: false,
   waitingForApp: false,
   pro: true,
+  quotaWarning: false,
+  quotaResetAt: null,
   rev,
 });
 
```

Sửa `src/store/transcript.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/transcript.test.ts b/src/store/transcript.test.ts
index 86faeb39b0a9501e6f1b095b97de3e9eb3e86d08..36781eb95cc6c2f98a8058ffc615ebb6b650edb9 100644
--- a/src/store/transcript.test.ts
+++ b/src/store/transcript.test.ts
@@ -27,6 +27,8 @@
   permissionSuspected: false,
   waitingForApp: false,
   pro: true,
+  quotaWarning: false,
+  quotaResetAt: null,
   rev,
 });
 
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
NO_COLOR=1 pnpm exec vitest run src/lib/license.test.ts src/store/license.test.ts 2>&1 | grep -E '^ FAIL |^Error:' | sed "s#$PWD/##g" | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có các module mới):
```text
 FAIL  src/lib/license.test.ts [ src/lib/license.test.ts ]
 FAIL  src/store/license.test.ts [ src/store/license.test.ts ]
Error: Cannot find module './license' imported from src/lib/license.test.ts
Error: Cannot find module './license' imported from src/store/license.test.ts
```

- [ ] **Step 3: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 0eb54209adecde66ac1f952e92c2494f2319c840..b67e26bf228f17472871aa1b29dd4ee3fa7ed1d4 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -249,6 +249,7 @@
   "overlay.note.error": "Translation stopped because of an error. Open the main window for details.",
   "overlay.note.noAudio": "No audio heard. Check that the meeting sound is playing.",
   "overlay.note.waitingForApp": "The chosen app is not playing sound",
+  "overlay.note.quotaLow": "Less than 5 minutes of translation left",
   "overlay.note.lagging": "Falling behind",
   "overlay.note.translationUnavailable": "Translation unavailable: original text only",
   "subtitle.dropped": "[segment skipped]",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 30c99efbec3cc062ea8ec6e0d380a75658d0875e..1e84492a275130cccc00ea6c4d66593cc6db6358 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -249,6 +249,7 @@
   "overlay.note.error": "Phiên dịch đã dừng vì lỗi. Mở cửa sổ chính để xem chi tiết.",
   "overlay.note.noAudio": "Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.",
   "overlay.note.waitingForApp": "App đã chọn không phát tiếng",
+  "overlay.note.quotaLow": "Còn dưới 5 phút dịch",
   "overlay.note.lagging": "Đang trễ",
   "overlay.note.translationUnavailable": "Dịch không khả dụng: chỉ hiện câu gốc",
   "subtitle.dropped": "[bỏ qua đoạn]",
```

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/ipc.ts b/src/lib/ipc.ts
index 9ef7a9fcef0b52c536975aac12a9dd6b399995ea..877369c8d34761e03bdb819b94bcd769aeb6b433 100644
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -100,6 +100,10 @@
   waitingForApp: boolean;
   // Đang có gói trả phí còn hạn: tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) mở; không thì khóa.
   pro: boolean;
+  // Hạn mức còn từ 5 phút trở xuống (§4.2 bước 2): nhắc trên thanh phụ đề và cửa sổ chính.
+  quotaWarning: boolean;
+  // Thời điểm hạn mức được reset (giây Unix); `null` khi không giới hạn.
+  quotaResetAt: number | null;
   // Tăng mỗi lần trạng thái đổi: trạng thái có `rev` nhỏ hơn trạng thái đang có là cũ, bỏ qua.
   rev: number;
 }
@@ -229,6 +233,88 @@
   field: string | null;
   message: string;
 }
+
+// Bản quyền (kế hoạch 06; `license::manager::LicenseView`). Không có key đầy đủ hay token: `key` đã che.
+export type LicensePlan = "free" | "pro" | "pro_x2" | "pro_x5";
+export type Standing =
+  | "free"
+  | "active"
+  | "expired"
+  | "revoked"
+  | "refreshNeeded"
+  | "clockRolledBack"
+  | "unverified"
+  | "notGenuine";
+
+export interface QuotaView {
+  unlimited: boolean;
+  limitMs: number;
+  usedMs: number;
+  remainingMs: number;
+  resetAt: number | null;
+  resetKind: "daily" | "cycle" | "expiry";
+  needsNetwork: boolean;
+  lost: boolean;
+  storageError: boolean;
+}
+
+export interface LicenseView {
+  standing: Standing;
+  plan: LicensePlan;
+  licensedPlan: Exclude<LicensePlan, "free"> | null;
+  key: string | null;
+  expiresAt: number | null;
+  refreshBefore: number | null;
+  validatedAt: number | null;
+  renewSoon: boolean;
+  quota: QuotaView;
+  serverConfigured: boolean;
+  devOverride: boolean;
+  // Giờ máy bị coi là chỉnh lùi (cả ở gói Free): nhắc chỉnh giờ.
+  clockRolledBack: boolean;
+}
+
+// Một máy đã kích hoạt, trong `409 device_limit` (`license::client::Device`). `device_label` có thể là `null`.
+export interface Device {
+  activation_id: string;
+  device_label: string | null;
+  last_validated_at: number | null;
+}
+
+export interface ActivateOutcome {
+  view: LicenseView | null;
+  devices: Device[] | null;
+}
+
+// Gói đang bán (`GET /v1/plans`).
+export interface PlanOffer {
+  code: Exclude<LicensePlan, "free">;
+  name: string;
+  quota_minutes_per_cycle: number | null;
+  days_per_order: number;
+  prices: Record<string, number>;
+}
+
+export interface CheckoutView {
+  orderCode: number;
+  plan: string;
+  amount: number;
+  currency: string;
+  expiresAt: number;
+  qrSvg: string;
+  licenseExpiresAt: number | null;
+  convertedDays: number | null;
+}
+
+// Kết quả mỗi lần hỏi đơn (`license::purchase::OrderOutcome`).
+export type OrderOutcome =
+  | { state: "waiting"; order_code: number; expires_at: number }
+  | { state: "paid"; order_code: number; plan: string }
+  | { state: "underpaid"; order_code: number }
+  | { state: "needsReview"; order_code: number }
+  | { state: "refunded"; order_code: number }
+  | { state: "failed"; order_code: number }
+  | { state: "paidButNotApplied"; order_code: number; code: string };
 
 export interface Commands {
   get_settings: { args: undefined; result: Settings };
@@ -270,6 +356,17 @@
   clear_all_data: { args: undefined; result: null };
   get_debug_sessions: { args: undefined; result: DebugSession[] };
   get_overlay_view: { args: undefined; result: OverlayView };
+  get_license: { args: undefined; result: LicenseView | null };
+  activate_license: { args: { key: string }; result: ActivateOutcome };
+  deactivate_license: { args: undefined; result: LicenseView | null };
+  deactivate_other_device: { args: { key: string; activationId: string }; result: null };
+  validate_license: { args: undefined; result: LicenseView | null };
+  get_plans: { args: undefined; result: PlanOffer[] };
+  start_checkout: { args: { plan: string; email: string; consent: boolean; renew: boolean }; result: CheckoutView };
+  get_pending_order: { args: undefined; result: CheckoutView | null };
+  cancel_checkout: { args: undefined; result: null };
+  open_checkout_page: { args: undefined; result: null };
+  recover_license: { args: { email: string }; result: null };
   hide_overlay: { args: undefined; result: null };
   begin_overlay_resize: { args: { edge: ResizeEdge }; result: null };
   overlay_resize_move: { args: undefined; result: null };
@@ -294,6 +391,8 @@
   "app://navigate": Navigate;
   "app://notice": AppNotice;
   "overlay://view": OverlayView;
+  "license://changed": LicenseView;
+  "license://order": OrderOutcome;
   "subtitle://upsert": Subtitle;
   "subtitle://delta": SubtitleDelta;
   // Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch; tới cả cửa sổ chính lẫn thanh phụ đề.
```

Tạo `src/lib/license.ts`:

```ts
import type { Device, LicenseView, OrderOutcome, PlanOffer, QuotaView, Standing } from "./ipc";

// Hiển thị bản quyền và hạn mức (kế hoạch 06; spec §4.2 bước 2, §4.3 "Bản quyền", "Nâng cấp"). Chỉ đọc kết quả phía Rust
// trả về; không tự tính gói hay hạn mức.

// Số phút còn lại, làm tròn xuống (không hứa nhiều hơn số thật).
export function minutesLeft(quota: QuotaView): number {
  return Math.floor(quota.remainingMs / 60_000);
}

// Giờ đã dùng của chu kỳ (gói trả phí), một chữ số thập phân.
export function hoursUsed(quota: QuotaView): number {
  return Math.round(quota.usedMs / 360_000) / 10;
}

// Khóa câu tóm tắt hạn mức ở màn hình chính và nhóm Bản quyền.
export type QuotaKey =
  | "quota.unlimited"
  | "quota.storageError"
  | "quota.lost"
  | "quota.needsNetwork"
  | "quota.used"
  | "quota.daily"
  | "quota.cycle";

export function quotaKey(quota: QuotaView): QuotaKey {
  if (quota.unlimited) return "quota.unlimited";
  if (quota.storageError) return "quota.storageError";
  if (quota.lost) return "quota.lost";
  if (quota.needsNetwork) return "quota.needsNetwork";
  if (quota.remainingMs === 0) return "quota.used";
  return quota.resetKind === "daily" ? "quota.daily" : "quota.cycle";
}

// Có lời nhắc nào cần hiện ở thanh báo của cửa sổ chính (thứ tự ưu tiên): bản không chính hãng, đồng hồ bị chỉnh lùi,
// lâu không làm mới được token, license hết hạn hay sắp hết hạn, bị thu hồi.
export type LicenseNoticeKey =
  | "license.notice.notGenuine"
  | "license.notice.clockRolledBack"
  | "license.notice.refreshNeeded"
  | "license.notice.expired"
  | "license.notice.revoked"
  | "license.notice.renewSoon";

export function licenseNotice(view: LicenseView | null): LicenseNoticeKey | null {
  if (!view) return null;
  const byStanding: Partial<Record<Standing, LicenseNoticeKey>> = {
    notGenuine: "license.notice.notGenuine",
    clockRolledBack: "license.notice.clockRolledBack",
    refreshNeeded: "license.notice.refreshNeeded",
    expired: "license.notice.expired",
    revoked: "license.notice.revoked",
  };
  const key = byStanding[view.standing];
  if (key) return key;
  if (view.clockRolledBack) return "license.notice.clockRolledBack";
  return view.standing === "active" && view.renewSoon ? "license.notice.renewSoon" : null;
}

// Mua mới hay gia hạn / đổi gói key đang có. License đã thu hồi thì mua mới (server từ chối gia hạn key đã thu hồi).
export function isRenewal(view: LicenseView | null): boolean {
  return view?.key != null && view.standing !== "revoked";
}

// Giá theo VND của một gói, hoặc `null` nếu server không bán gói đó bằng VND.
export function priceVnd(plan: PlanOffer): number | null {
  return plan.prices.VND ?? null;
}

// Tên hiển thị của một máy trong danh sách `409 device_limit`; `device_label` là `null` thì dùng tên thay thế.
export function deviceName(device: Device, fallback: string): string {
  return device.device_label?.trim() || fallback;
}

// Câu báo theo trạng thái đơn (bảng "App hiện gì theo `status`" của kế hoạch 05).
export function orderMessageKey(outcome: OrderOutcome) {
  switch (outcome.state) {
    case "waiting":
      return "upgrade.order.waiting" as const;
    case "paid":
      return "upgrade.order.paid" as const;
    case "underpaid":
      return "upgrade.order.underpaid" as const;
    case "needsReview":
      return "upgrade.order.needsReview" as const;
    case "refunded":
      return "upgrade.order.refunded" as const;
    case "failed":
      return "upgrade.order.failed" as const;
    case "paidButNotApplied":
      return "upgrade.order.paidButNotApplied" as const;
  }
}

// Đơn đã xong (thôi hỏi): cho tạo đơn mới. `underpaid` vẫn chờ chuyển bù.
export function orderFinished(outcome: OrderOutcome | null): boolean {
  return outcome !== null && outcome.state !== "waiting" && outcome.state !== "underpaid";
}
```

Sửa `src/lib/subtitleView.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/subtitleView.ts b/src/lib/subtitleView.ts
index a6353b9dae8b53e9220baf35c27828f48ed98466..0d024f0f5a05b30ef2226d4c57785bb360327d11 100644
--- a/src/lib/subtitleView.ts
+++ b/src/lib/subtitleView.ts
@@ -101,6 +101,7 @@
   | "error"
   | "noAudio"
   | "waitingForApp"
+  | "quotaLow"
   | "lagging"
   | "translationUnavailable";
 
@@ -113,6 +114,7 @@
   if (status.session === "running") {
     if (status.indicators.noAudio) notes.push("noAudio");
     if (status.waitingForApp) notes.push("waitingForApp");
+    if (status.quotaWarning) notes.push("quotaLow");
     if (status.indicators.lagging) notes.push("lagging");
     if (status.indicators.translationUnavailable) notes.push("translationUnavailable");
   }
```

Tạo `src/store/license.ts`:

```ts
import { createStore } from "zustand/vanilla";
import type { CheckoutView, Device, Ipc, LicenseView, OrderOutcome, PlanOffer } from "../lib/ipc";
import { type UiError, toUiError } from "./app";

// Store bản quyền của cửa sổ chính (kế hoạch 06): trạng thái bản quyền và hạn mức, kích hoạt, gỡ máy, mua gói. Phía Rust
// giữ key, token và `order_token`; store chỉ nhận bản đã che (`LicenseView`, `CheckoutView`).

export interface LicenseStoreState {
  view: LicenseView | null;
  // Key người dùng vừa gõ mà đã đủ 2 máy (`409 device_limit`): danh sách máy để gỡ một máy.
  devices: Device[] | null;
  plans: PlanOffer[] | null;
  checkout: CheckoutView | null;
  order: OrderOutcome | null;
  error: UiError | null;
  busy: boolean;
  init(): Promise<() => void>;
  activate(key: string): Promise<boolean>;
  // Gỡ một máy khác của key vừa gõ, rồi kích hoạt lại máy này.
  deactivateOther(key: string, activationId: string): Promise<boolean>;
  deactivate(): Promise<void>;
  validate(): Promise<void>;
  loadPlans(): Promise<void>;
  startCheckout(plan: string, email: string, consent: boolean, renew: boolean): Promise<boolean>;
  openCheckoutPage(): Promise<void>;
  cancelCheckout(): Promise<void>;
  recover(email: string): Promise<boolean>;
  dismiss(): void;
}

export function createLicenseStore(ipc: Ipc) {
  return createStore<LicenseStoreState>()((set, get) => {
    async function run(call: () => Promise<void>): Promise<boolean> {
      if (get().busy) return false;
      set({ busy: true });
      try {
        await call();
        set({ error: null });
        return true;
      } catch (e) {
        set({ error: toUiError(e) });
        return false;
      } finally {
        set({ busy: false });
      }
    }

    function setView(view: LicenseView | null) {
      if (view) set({ view });
    }

    return {
      view: null,
      devices: null,
      plans: null,
      checkout: null,
      order: null,
      error: null,
      busy: false,

      async init() {
        const offs = await Promise.all([
          ipc.listen("license://changed", (view) => set({ view })),
          ipc.listen("license://order", (order) => set({ order })),
        ]);
        const [view, checkout] = await Promise.all([ipc.invoke("get_license"), ipc.invoke("get_pending_order")]);
        setView(view);
        set({ checkout });
        return () => offs.forEach((off) => off());
      },

      activate(key) {
        return run(async () => {
          const outcome = await ipc.invoke("activate_license", { key });
          setView(outcome.view);
          set({ devices: outcome.devices });
        });
      },

      async deactivateOther(key, activationId) {
        const removed = await run(() => ipc.invoke("deactivate_other_device", { key, activationId }).then(() => {}));
        return removed && (await get().activate(key));
      },

      async deactivate() {
        await run(async () => setView(await ipc.invoke("deactivate_license")));
      },

      async validate() {
        await run(async () => setView(await ipc.invoke("validate_license")));
      },

      async loadPlans() {
        await run(async () => set({ plans: await ipc.invoke("get_plans") }));
      },

      startCheckout(plan, email, consent, renew) {
        return run(async () => {
          set({ checkout: await ipc.invoke("start_checkout", { plan, email, consent, renew }), order: null });
        });
      },

      async openCheckoutPage() {
        await run(() => ipc.invoke("open_checkout_page").then(() => {}));
      },

      async cancelCheckout() {
        await run(async () => {
          await ipc.invoke("cancel_checkout");
          set({ checkout: null, order: null });
        });
      },

      recover(email) {
        return run(() => ipc.invoke("recover_license", { email }).then(() => {}));
      },

      dismiss() {
        set({ error: null, devices: null });
      },
    };
  });
}

export type LicenseStore = ReturnType<typeof createLicenseStore>;
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
NO_COLOR=1 pnpm exec vitest run src/lib/license.test.ts src/store/license.test.ts src/lib/subtitleView.test.ts 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  3 passed (3)
      Tests  22 passed (22)
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  14 passed (14)
      Tests  125 passed (125)
```

Run:
```bash
pnpm exec tsc --noEmit && echo tsc ok
```
Expected (lúc lập kế hoạch):
```text
tsc ok
```

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/vi.ts \
  src/lib/ipc.ts \
  src/lib/license.test.ts \
  src/lib/license.ts \
  src/lib/subtitleView.test.ts \
  src/lib/subtitleView.ts \
  src/store/app.test.ts \
  src/store/license.test.ts \
  src/store/license.ts \
  src/store/overlay.test.ts \
  src/store/transcript.test.ts
git commit -m "feat(ui): kiểu và store cho bản quyền, hạn mức và mua gói; thanh phụ đề nhắc còn dưới 5 phút" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 2: Cài đặt › Bản quyền

Spec §4.3 "Bản quyền", §9 (`409`, `423`, `429`). Gói đang dùng và tình trạng, key đã che, ngày hết hạn, hạn mức còn lại và lúc reset; nút Nâng cấp hay "Gia hạn hoặc đổi gói" (mở màn hình Nâng cấp), "Kiểm tra ngay"; ô nhập key và Kích hoạt; key đã đủ 2 máy thì danh sách máy (tên thay thế khi không có tên, lần dùng gần nhất) với nút gỡ một máy để dùng ở máy này; gỡ kích hoạt máy này có bước xác nhận; "Mất key?" gửi lại key qua email. Store bản quyền nghe sự kiện từ lúc mở cửa sổ (`main.tsx`).

Không có test component (vitest chạy trong Node, không DOM); logic hiển thị đã có test ở Task 1. Thử tay ở Task 6.

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/i18n.test.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/styles/main.css`
- Create: `src/windows/main/LicenseText.tsx`
- Create: `src/windows/main/licenseStore.ts`
- Modify: `src/windows/main/main.tsx`
- Modify: `src/windows/main/screens/SettingsScreen.tsx`
- Create: `src/windows/main/settings/LicenseSettings.tsx`

- [ ] **Step 1: Viết code**

Sửa `src/i18n/i18n.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/i18n.test.ts b/src/i18n/i18n.test.ts
index 2bcd1733af8157643ce7ea9f456493f0dad4ada7..cf290975e2146ea372dfb301b1db1e5c0fc0d080 100644
--- a/src/i18n/i18n.test.ts
+++ b/src/i18n/i18n.test.ts
@@ -28,7 +28,22 @@
   it("chuỗi tiếng Việt đã được dịch, trừ tên riêng và tên ngôn ngữ", () => {
     const same = (Object.keys(en) as (keyof typeof en)[]).filter((key) => en[key] === vi[key]);
     expect(same.sort()).toEqual(
-      ["app.name", "channel.beta", "lang.en", "lang.ja", "lang.ko", "lang.vi", "lang.zh", "settings.group.model"].sort(),
+      [
+        "app.name",
+        "channel.beta",
+        "lang.en",
+        "lang.ja",
+        "lang.ko",
+        "lang.vi",
+        "lang.zh",
+        "settings.group.model",
+        // Tên gói là tên riêng (spec §2).
+        "plan.free",
+        "plan.pro",
+        "plan.pro_x2",
+        "plan.pro_x5",
+        "license.standing.free",
+      ].sort(),
     );
   });
 });
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index b67e26bf228f17472871aa1b29dd4ee3fa7ed1d4..c0da5d4a29d38ca8337c0cca096ca2c92c363c42 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -262,6 +262,59 @@
   "notice.loginItemsApproval": "AI Translator is turned off in System Settings › General › Login Items & Extensions (Login Items on macOS 14), so it will not open when you log in. Turn it on there.",
   "notice.openLoginItems": "Open Login Items",
 
+  "plan.free": "Free",
+  "plan.pro": "Professional",
+  "plan.pro_x2": "Professional X2",
+  "plan.pro_x5": "Professional X5",
+  "license.standing.free": "Free",
+  "license.standing.active": "Active",
+  "license.standing.expired": "Expired",
+  "license.standing.revoked": "Revoked",
+  "license.standing.refreshNeeded": "Needs a connection",
+  "license.standing.clockRolledBack": "Check the clock",
+  "license.standing.unverified": "Checking",
+  "license.standing.notGenuine": "Not genuine",
+  "settings.license.plan": "Plan",
+  "settings.license.licensed": "Your license:",
+  "settings.license.key": "Key",
+  "settings.license.expires": "Expires",
+  "settings.license.quota": "Translation left",
+  "settings.license.devOverride": "Developer build: Pro without limits.",
+  "settings.license.notConfigured": "This build is not connected to the license server yet.",
+  "settings.license.buy": "Upgrade",
+  "settings.license.renew": "Renew or change plan",
+  "settings.license.check": "Check now",
+  "settings.license.activate": "Activate a key",
+  "settings.license.keyInput": "License key",
+  "settings.license.activate.button": "Activate",
+  "settings.license.devices": "This key is already active on 2 computers. Remove one of them to use the key here.",
+  "settings.license.devices.unnamed": "Unnamed computer",
+  "settings.license.devices.lastUsed": "last used {time}",
+  "settings.license.devices.remove": "Remove and use here",
+  "settings.license.deactivate": "Deactivate this computer",
+  "settings.license.deactivate.hint": "Frees one of the 2 computers of this key. This computer goes back to Free; the quota already used stays on this computer.",
+  "settings.license.deactivate.confirm": "Deactivate this computer?",
+  "settings.license.deactivate.yes": "Deactivate",
+  "settings.license.recover": "Lost your key?",
+  "settings.license.recover.email": "Email used to buy",
+  "settings.license.recover.button": "Send my keys",
+  "settings.license.recover.hint": "We send every valid key of this email to that address.",
+  "settings.license.recover.sent": "If this email has a key, it is on its way.",
+  "quota.unlimited": "Unlimited",
+  "quota.storageError": "Could not read the quota on this computer, so translation is paused. Allow keychain access and restart the app.",
+  "quota.lost": "The quota record on this computer was lost, so it counts as used up. Contact support to reset it.",
+  "quota.needsNetwork": "{minutes} min left. Connect to the internet to open the new cycle.",
+  "quota.used": "Used up",
+  "quota.daily": "{minutes} min left today",
+  "quota.cycle": "{minutes} min left this cycle",
+  "quota.resetAt": "resets {time}",
+  "quota.expiresAt": "plan ends {time}",
+  "license.notice.notGenuine": "This copy of AI Translator is not genuine, so only Free works. Download it from the official website.",
+  "license.notice.clockRolledBack": "This computer's clock was moved back. Set the right time and connect to the internet so the app can check it.",
+  "license.notice.refreshNeeded": "Your plan could not be checked for 14 days, so Free is used. Connect to the internet.",
+  "license.notice.expired": "Your plan has expired. Renew it to keep the Pro features.",
+  "license.notice.revoked": "Your license has been revoked. Contact support.",
+  "license.notice.renewSoon": "Your plan ends within 7 days. Renew it to keep the Pro features.",
   "common.cancel": "Cancel",
   "common.dismiss": "Dismiss",
   "common.notYet": "Not available yet.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 1e84492a275130cccc00ea6c4d66593cc6db6358..de1e7873467acf034ab91fe9b73a1e1e21e6abd6 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -262,6 +262,59 @@
   "notice.loginItemsApproval": "AI Translator đang bị tắt ở System Settings › General › Login Items & Extensions (macOS 14: Login Items), nên sẽ không tự mở khi đăng nhập. Hãy bật lại ở đó.",
   "notice.openLoginItems": "Mở Login Items",
 
+  "plan.free": "Free",
+  "plan.pro": "Professional",
+  "plan.pro_x2": "Professional X2",
+  "plan.pro_x5": "Professional X5",
+  "license.standing.free": "Free",
+  "license.standing.active": "Đang dùng",
+  "license.standing.expired": "Đã hết hạn",
+  "license.standing.revoked": "Đã thu hồi",
+  "license.standing.refreshNeeded": "Cần kết nối mạng",
+  "license.standing.clockRolledBack": "Kiểm tra giờ máy",
+  "license.standing.unverified": "Đang kiểm",
+  "license.standing.notGenuine": "Không chính hãng",
+  "settings.license.plan": "Gói",
+  "settings.license.licensed": "License của bạn:",
+  "settings.license.key": "Mã key",
+  "settings.license.expires": "Hết hạn",
+  "settings.license.quota": "Còn dịch được",
+  "settings.license.devOverride": "Bản build cho nhà phát triển: Pro không giới hạn.",
+  "settings.license.notConfigured": "Bản cài này chưa kết nối máy chủ bản quyền.",
+  "settings.license.buy": "Nâng cấp",
+  "settings.license.renew": "Gia hạn hoặc đổi gói",
+  "settings.license.check": "Kiểm tra ngay",
+  "settings.license.activate": "Kích hoạt key",
+  "settings.license.keyInput": "Nhập license key",
+  "settings.license.activate.button": "Kích hoạt",
+  "settings.license.devices": "Key này đã kích hoạt trên 2 máy. Gỡ một máy để dùng key ở máy này.",
+  "settings.license.devices.unnamed": "Máy không tên",
+  "settings.license.devices.lastUsed": "dùng lần cuối {time}",
+  "settings.license.devices.remove": "Gỡ máy này để dùng ở đây",
+  "settings.license.deactivate": "Gỡ kích hoạt máy này",
+  "settings.license.deactivate.hint": "Trả lại một trong 2 suất máy của key. Máy này về Free; hạn mức đã dùng vẫn ở lại máy này.",
+  "settings.license.deactivate.confirm": "Gỡ kích hoạt máy này?",
+  "settings.license.deactivate.yes": "Gỡ kích hoạt",
+  "settings.license.recover": "Mất key?",
+  "settings.license.recover.email": "Email đã dùng để mua",
+  "settings.license.recover.button": "Gửi lại key",
+  "settings.license.recover.hint": "Mọi key còn hiệu lực của email này được gửi vào chính email đó.",
+  "settings.license.recover.sent": "Nếu email này có key, thư đang được gửi.",
+  "quota.unlimited": "Không giới hạn",
+  "quota.storageError": "Không đọc được hạn mức trên máy nên tạm dừng dịch. Cho phép truy cập kho khóa rồi mở lại app.",
+  "quota.lost": "Bản ghi hạn mức trên máy đã mất nên coi như đã dùng hết. Liên hệ hỗ trợ để reset.",
+  "quota.needsNetwork": "Còn {minutes} phút. Kết nối mạng để mở hạn mức của chu kỳ mới.",
+  "quota.used": "Đã hết",
+  "quota.daily": "Còn {minutes} phút hôm nay",
+  "quota.cycle": "Còn {minutes} phút của chu kỳ",
+  "quota.resetAt": "mở lại lúc {time}",
+  "quota.expiresAt": "gói hết hạn lúc {time}",
+  "license.notice.notGenuine": "Bản cài AI Translator này không chính hãng nên chỉ dùng được Free. Hãy tải bản chính thức từ website.",
+  "license.notice.clockRolledBack": "Giờ máy đã bị chỉnh lùi. Chỉnh lại giờ cho đúng và kết nối mạng để app kiểm lại giờ.",
+  "license.notice.refreshNeeded": "Đã 14 ngày chưa kiểm được gói nên đang dùng Free. Hãy kết nối mạng.",
+  "license.notice.expired": "Gói đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
+  "license.notice.revoked": "License đã bị thu hồi. Vui lòng liên hệ hỗ trợ.",
+  "license.notice.renewSoon": "Gói còn dưới 7 ngày. Gia hạn để tiếp tục dùng tính năng Pro.",
   "common.cancel": "Hủy",
   "common.dismiss": "Đóng",
   "common.notYet": "Chưa có.",
```

Sửa `src/styles/main.css` (áp bằng `git apply`):

```diff
diff --git a/src/styles/main.css b/src/styles/main.css
index d316530e598f25d2adcb704ddbe5da2cf331618b..4f4a4e3a2caf77249c7a1835840464cb515a99cd 100644
--- a/src/styles/main.css
+++ b/src/styles/main.css
@@ -161,6 +161,26 @@
 .badge.error {
   color: var(--color-danger);
   border-color: var(--color-danger);
+}
+
+/* Tình trạng bản quyền (Cài đặt › Bản quyền). */
+.badge.active {
+  color: var(--color-running);
+  border-color: var(--color-running);
+}
+
+.badge.expired,
+.badge.revoked,
+.badge.notGenuine,
+.badge.clockRolledBack {
+  color: var(--color-danger);
+  border-color: var(--color-danger);
+}
+
+ul.devices {
+  list-style: none;
+  margin: 0;
+  padding: 0;
 }
 
 meter {
```

Tạo `src/windows/main/LicenseText.tsx`:

```tsx
import type { LicensePlan, QuotaView } from "../../lib/ipc";
import { minutesLeft, quotaKey } from "../../lib/license";
import { dateTime, localOffsetMinutes } from "../../lib/subtitleView";
import { useT } from "./appStore";

// Ngày giờ địa phương của một mốc (giây Unix).
export function when(seconds: number | null): string {
  if (seconds === null) return "";
  const ms = seconds * 1000;
  return dateTime(ms, localOffsetMinutes(ms));
}

export function PlanName({ plan }: { plan: LicensePlan }) {
  return <>{useT()(`plan.${plan}`)}</>;
}

// Câu tóm tắt hạn mức: số phút còn lại và lúc mở lại (§4.2 bước 2).
export function QuotaSummary({ quota }: { quota: QuotaView }) {
  const t = useT();
  const key = quotaKey(quota);
  const resetKey = quota.resetKind === "expiry" ? "quota.expiresAt" : "quota.resetAt";
  return (
    <span>
      {t(key, { minutes: minutesLeft(quota) })}
      {quota.resetAt !== null && !quota.unlimited && key !== "quota.lost" && key !== "quota.storageError" && (
        <span className="hint"> · {t(resetKey, { time: when(quota.resetAt) })}</span>
      )}
    </span>
  );
}
```

Tạo `src/windows/main/licenseStore.ts`:

```ts
import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { type LicenseStoreState, createLicenseStore } from "../../store/license";

// Store bản quyền của cửa sổ chính, nối với lõi Rust thật. Nghe sự kiện từ lúc mở cửa sổ (`main.tsx`), để màn hình chính
// và thanh báo luôn có số phút còn lại.
export const licenseStore = createLicenseStore(tauriIpc);

export function useLicense<T>(selector: (state: LicenseStoreState) => T): T {
  return useStore(licenseStore, selector);
}
```

Sửa `src/windows/main/main.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/main.tsx b/src/windows/main/main.tsx
index 650dd0760431cbd98c8cc71bf706d89701a3d200..94faee18d4bd1736317147b57aec5aebe6efcc38 100644
--- a/src/windows/main/main.tsx
+++ b/src/windows/main/main.tsx
@@ -6,6 +6,7 @@
 import { appStore, fallbackLanguage } from "./appStore";
 import { transcriptStore } from "./dataStores";
 import { modelsStore } from "./modelsStore";
+import { licenseStore } from "./licenseStore";
 
 // Giao diện sáng/tối và thuộc tính `lang` theo cài đặt, đổi ngay khi cài đặt đổi.
 appStore.subscribe((state) => {
@@ -35,6 +36,11 @@
   .getState()
   .init()
   .catch((e: unknown) => console.error("không khởi tạo được quản lý model", e));
+// Bản quyền và hạn mức nghe sự kiện từ lúc mở cửa sổ: màn hình chính, thanh báo và nhóm Bản quyền dùng chung.
+licenseStore
+  .getState()
+  .init()
+  .catch((e: unknown) => console.error("không đọc được bản quyền", e));
 
 // Không đọc được cài đặt hay trạng thái (lệnh bị chặn, phía Rust lỗi) thì hiện câu báo theo ngôn ngữ của hệ
 // điều hành, thay vì để cửa sổ trắng trơn.
```

Sửa `src/windows/main/screens/SettingsScreen.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/SettingsScreen.tsx b/src/windows/main/screens/SettingsScreen.tsx
index ed0d185f3ecc78d63b1751e26ecde25b11094256..917c0d2b9be92483908b31b9878a04ad6f4f5190 100644
--- a/src/windows/main/screens/SettingsScreen.tsx
+++ b/src/windows/main/screens/SettingsScreen.tsx
@@ -5,16 +5,15 @@
 import { AudioSettings } from "../settings/AudioSettings";
 import { GeneralSettings } from "../settings/GeneralSettings";
 import { HotkeySettings } from "../settings/HotkeySettings";
+import { LicenseSettings } from "../settings/LicenseSettings";
 import { ModelSettings } from "../settings/ModelSettings";
 import { PrivacySettings } from "../settings/PrivacySettings";
 import { SubtitleSettings } from "../settings/SubtitleSettings";
 
 const GROUPS: readonly SettingsGroup[] = ["general", "subtitles", "audio", "model", "hotkeys", "license", "privacy"];
 
-// Nhóm do kế hoạch khác làm: Bản quyền (06).
-const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {
-  license: "settings.license.description",
-};
+// Nhóm chưa có nội dung thì hiện câu mô tả. Sau 04 (Model) và 06 (Bản quyền) không còn nhóm nào như vậy.
+const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {};
 
 // Nhóm cài đặt là một bộ tab (WAI-ARIA Tabs): chỉ tab đang chọn nằm trong thứ tự Tab, mũi tên trái/phải và
 // Home/End chuyển tab và đưa focus theo.
@@ -71,6 +70,7 @@
         {group === "audio" && <AudioSettings />}
         {group === "hotkeys" && <HotkeySettings />}
         {group === "model" && <ModelSettings />}
+        {group === "license" && <LicenseSettings />}
         {description && (
           <div className="card">
             <p>{t(description)}</p>
```

Tạo `src/windows/main/settings/LicenseSettings.tsx`:

```tsx
import { useState } from "react";
import { errorKey } from "../../../i18n";
import { deviceName, isRenewal } from "../../../lib/license";
import { useApp, useT } from "../appStore";
import { useLicense } from "../licenseStore";
import { PlanName, QuotaSummary, when } from "../LicenseText";

// Nhóm Cài đặt "Bản quyền" (§4.3): gói đang dùng, tình trạng, ngày hết hạn, hạn mức còn lại của chu kỳ; nhập key; gia
// hạn hay đổi gói (mở màn hình Nâng cấp); gỡ kích hoạt. Key đã đủ 2 máy thì hiện danh sách máy để gỡ một máy (§9). Key
// chỉ hiện dạng đã che; key đầy đủ nằm trong email, có nút gửi lại key qua email.
export function LicenseSettings() {
  const t = useT();
  const navigate = useApp((s) => s.navigate);
  const view = useLicense((s) => s.view);
  const devices = useLicense((s) => s.devices);
  const error = useLicense((s) => s.error);
  const busy = useLicense((s) => s.busy);
  const activate = useLicense((s) => s.activate);
  const deactivateOther = useLicense((s) => s.deactivateOther);
  const deactivate = useLicense((s) => s.deactivate);
  const validate = useLicense((s) => s.validate);
  const recover = useLicense((s) => s.recover);
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!view) return null;
  return (
    <>
      <div className="card">
        <div className="row">
          <span>{t("settings.license.plan")}</span>
          <strong>
            <PlanName plan={view.plan} />
          </strong>
          <span className={`badge ${view.standing}`}>{t(`license.standing.${view.standing}`)}</span>
        </div>
        {view.licensedPlan && view.plan === "free" && (
          <p className="hint">
            {t("settings.license.licensed")} <PlanName plan={view.licensedPlan} />
          </p>
        )}
        {view.key && (
          <div className="row">
            <span>{t("settings.license.key")}</span>
            <code>{view.key}</code>
          </div>
        )}
        {view.expiresAt !== null && (
          <div className="row">
            <span>{t("settings.license.expires")}</span>
            <span>{when(view.expiresAt)}</span>
          </div>
        )}
        <div className="row">
          <span>{t("settings.license.quota")}</span>
          <QuotaSummary quota={view.quota} />
        </div>
        {view.devOverride && <p className="hint">{t("settings.license.devOverride")}</p>}
        {!view.serverConfigured && <p className="hint">{t("settings.license.notConfigured")}</p>}
        <div className="row">
          <button className="primary" onClick={() => navigate("upgrade")}>
            {t(isRenewal(view) ? "settings.license.renew" : "settings.license.buy")}
          </button>
          {view.key && (
            <button disabled={busy} onClick={() => void validate()}>
              {t("settings.license.check")}
            </button>
          )}
        </div>
      </div>
      {!view.key && (
        <div className="card">
          <h2>{t("settings.license.activate")}</h2>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void activate(key);
            }}
          >
            <label htmlFor="license-key">{t("settings.license.keyInput")}</label>
            <input
              id="license-key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="primary" type="submit" disabled={busy || key.trim() === ""}>
              {t("settings.license.activate.button")}
            </button>
          </form>
          {devices && (
            <div role="alert">
              <p>{t("settings.license.devices")}</p>
              <ul className="devices">
                {devices.map((d) => (
                  <li key={d.activation_id} className="row">
                    <span>{deviceName(d, t("settings.license.devices.unnamed"))}</span>
                    {d.last_validated_at !== null && (
                      <span className="hint">{t("settings.license.devices.lastUsed", { time: when(d.last_validated_at) })}</span>
                    )}
                    <button disabled={busy} onClick={() => void deactivateOther(key, d.activation_id)}>
                      {t("settings.license.devices.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div role="alert">{error && <p className="error-text">{t(errorKey(error.code))}</p>}</div>
      {view.key && (
        <div className="card">
          <h2>{t("settings.license.deactivate")}</h2>
          <p className="hint">{t("settings.license.deactivate.hint")}</p>
          <div className="row" role="status">
            {!confirming && <button onClick={() => setConfirming(true)}>{t("settings.license.deactivate")}</button>}
            {confirming && (
              <>
                <span className="error-text">{t("settings.license.deactivate.confirm")}</span>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    void deactivate();
                  }}
                >
                  {t("settings.license.deactivate.yes")}
                </button>
                <button onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="card">
        <h2>{t("settings.license.recover")}</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void recover(email).then((ok) => setSent(ok));
          }}
        >
          <label htmlFor="license-email">{t("settings.license.recover.email")}</label>
          <input id="license-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={busy || email.trim() === ""}>
            {t("settings.license.recover.button")}
          </button>
        </form>
        <p className="hint" role="status">
          {sent ? t("settings.license.recover.sent") : t("settings.license.recover.hint")}
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  14 passed (14)
      Tests  125 passed (125)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/i18n.test.ts \
  src/i18n/vi.ts \
  src/styles/main.css \
  src/windows/main/LicenseText.tsx \
  src/windows/main/licenseStore.ts \
  src/windows/main/main.tsx \
  src/windows/main/screens/SettingsScreen.tsx \
  src/windows/main/settings/LicenseSettings.tsx
git commit -m "feat(ui): Cài đặt › Bản quyền: gói, hạn, hạn mức, kích hoạt key, gỡ máy, gửi lại key (§4.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 3: Màn hình Nâng cấp

Spec §4.3 "Nâng cấp", §6.8 "Mua ngay trong app", §10.1. Đủ 4 gói (Free là hằng số phía app; ba gói trả phí lấy từ `GET /v1/plans`, không có mạng thì báo cần mạng), đánh dấu gói đang dùng; chọn gói, email, ô đồng ý xử lý email; mã VietQR (SVG do phía Rust vẽ), mã đơn, số tiền, hạn của mã, nút mở trang thanh toán; gia hạn hay đổi gói thì hiện ngày hết hạn mới ước tính, số ngày quy đổi, "Không hoàn tiền"; câu theo trạng thái đơn (bảng của 05); "Chỉ nhận chuyển khoản từ ngân hàng Việt Nam". Thay khung `Placeholders.tsx` của 01.

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/styles/main.css`
- Modify: `src/windows/main/Shell.tsx`
- Delete: `src/windows/main/screens/Placeholders.tsx`
- Create: `src/windows/main/screens/UpgradeScreen.tsx`

- [ ] **Step 1: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index c0da5d4a29d38ca8337c0cca096ca2c92c363c42..80d822ecf632671eb208e4b13230d9fc032034ff 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -59,7 +59,33 @@
   "transcript.empty": "Subtitles of the current session will appear here, with time, original text and translation.",
   "history.empty": "Saved sessions will appear here. Saving history is a Pro feature and is off by default.",
   "glossary.empty": "Your glossary terms will appear here. The glossary is a Pro feature.",
-  "upgrade.empty": "Pro plans and in-app payment will appear here.",
+  "upgrade.free.quota": "10 minutes a day",
+  "upgrade.current": "Current",
+  "upgrade.unlimited": "Unlimited",
+  "upgrade.hours": "{hours} hours per {days} days",
+  "upgrade.price": "{price} / {days} days",
+  "upgrade.loading": "Loading plans… Buying needs an internet connection.",
+  "upgrade.bankOnly": "Payment by bank transfer from a Vietnamese bank (VietQR) only.",
+  "upgrade.renewing": "This order renews or changes the plan of your current key.",
+  "upgrade.email": "Email to receive your key",
+  "upgrade.consent": "I agree that AI Translator stores this email to send and recover my license key.",
+  "upgrade.pay": "Create payment QR code",
+  "upgrade.scan": "Scan with your banking app",
+  "upgrade.qr": "VietQR payment code",
+  "upgrade.order": "Order {code}",
+  "upgrade.newExpiry": "New expiry (estimate): {time}.",
+  "upgrade.converted": "Includes {days} days converted from your current plan.",
+  "upgrade.noRefund": "No refunds.",
+  "upgrade.linkExpires": "This code works until {time}.",
+  "upgrade.openPage": "Open payment page",
+  "upgrade.newOrder": "New order",
+  "upgrade.order.waiting": "Waiting for your transfer…",
+  "upgrade.order.paid": "Payment received. Your plan is active on this computer, and the key is in your email.",
+  "upgrade.order.underpaid": "The amount received is less than the price. Transfer the rest for order {code} within 24 hours, or contact support with this order number.",
+  "upgrade.order.needsReview": "Payment received; support is reviewing order {code}. Contact support with this order number if needed.",
+  "upgrade.order.refunded": "Order {code} was refunded; it has no key. Contact support with this order number if needed.",
+  "upgrade.order.failed": "This order did not go through. You can create a new one.",
+  "upgrade.order.paidButNotApplied": "Payment received, but the key could not be activated here. The key is in your email; activate it in Settings › License.",
   "transcript.search": "Search",
   "transcript.search.placeholder": "Words in the original or the translation",
   "transcript.copy": "Copy all",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index de1e7873467acf034ab91fe9b73a1e1e21e6abd6..6d38ff22a1bcf1bc921ac21104eec0ed7bd1c004 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -59,7 +59,33 @@
   "transcript.empty": "Phụ đề của phiên đang dịch sẽ hiện ở đây, gồm giờ, câu gốc và bản dịch.",
   "history.empty": "Các phiên đã lưu sẽ hiện ở đây. Lưu lịch sử là tính năng Pro và mặc định tắt.",
   "glossary.empty": "Các thuật ngữ của bạn sẽ hiện ở đây. Từ điển thuật ngữ là tính năng Pro.",
-  "upgrade.empty": "Các gói Pro và thanh toán ngay trong app sẽ hiện ở đây.",
+  "upgrade.free.quota": "10 phút mỗi ngày",
+  "upgrade.current": "Đang dùng",
+  "upgrade.unlimited": "Không giới hạn",
+  "upgrade.hours": "{hours} giờ mỗi {days} ngày",
+  "upgrade.price": "{price} / {days} ngày",
+  "upgrade.loading": "Đang tải bảng gói… Mua gói cần kết nối mạng.",
+  "upgrade.bankOnly": "Chỉ nhận chuyển khoản từ ngân hàng Việt Nam (VietQR).",
+  "upgrade.renewing": "Đơn này gia hạn hoặc đổi gói của key đang dùng.",
+  "upgrade.email": "Email nhận key",
+  "upgrade.consent": "Tôi đồng ý để AI Translator lưu email này để gửi và khôi phục license key.",
+  "upgrade.pay": "Tạo mã thanh toán",
+  "upgrade.scan": "Quét bằng app ngân hàng",
+  "upgrade.qr": "Mã thanh toán VietQR",
+  "upgrade.order": "Đơn {code}",
+  "upgrade.newExpiry": "Ngày hết hạn mới (ước tính): {time}.",
+  "upgrade.converted": "Gồm {days} ngày quy đổi từ gói đang dùng.",
+  "upgrade.noRefund": "Không hoàn tiền.",
+  "upgrade.linkExpires": "Mã này dùng được tới {time}.",
+  "upgrade.openPage": "Mở trang thanh toán",
+  "upgrade.newOrder": "Tạo đơn mới",
+  "upgrade.order.waiting": "Đang chờ chuyển khoản…",
+  "upgrade.order.paid": "Đã nhận tiền. Gói đã có hiệu lực trên máy này; key đã gửi vào email.",
+  "upgrade.order.underpaid": "Số tiền nhận được ít hơn giá gói. Chuyển bù cho đơn {code} trong 24 giờ, hoặc liên hệ hỗ trợ kèm mã đơn này.",
+  "upgrade.order.needsReview": "Đã nhận tiền; hỗ trợ đang xử lý đơn {code}. Cần thì liên hệ hỗ trợ kèm mã đơn này.",
+  "upgrade.order.refunded": "Đơn {code} đã được hoàn tiền, không có key. Cần thì liên hệ hỗ trợ kèm mã đơn này.",
+  "upgrade.order.failed": "Đơn này không thành. Bạn có thể tạo đơn mới.",
+  "upgrade.order.paidButNotApplied": "Đã nhận tiền nhưng chưa kích hoạt được key trên máy này. Key đã gửi vào email; hãy kích hoạt ở Cài đặt › Bản quyền.",
   "transcript.search": "Tìm",
   "transcript.search.placeholder": "Chữ trong câu gốc hoặc bản dịch",
   "transcript.copy": "Sao chép tất cả",
```

Sửa `src/styles/main.css` (áp bằng `git apply`):

```diff
diff --git a/src/styles/main.css b/src/styles/main.css
index 4f4a4e3a2caf77249c7a1835840464cb515a99cd..17d2ced93826fa63b28c07c99a3e8d0718c7549c 100644
--- a/src/styles/main.css
+++ b/src/styles/main.css
@@ -383,3 +383,34 @@
   clip-path: inset(50%);
   white-space: nowrap;
 }
+
+/* Màn hình Nâng cấp: bảng gói, mã VietQR. */
+ul.plans {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: grid;
+  gap: 0.5rem;
+}
+li.plan {
+  display: grid;
+  grid-template-columns: 12rem 1fr 10rem auto;
+  align-items: center;
+  gap: 0.5rem;
+  padding: 0.5rem;
+  border: 1px solid var(--color-border);
+  border-radius: var(--radius);
+}
+li.plan.current {
+  border-color: var(--color-accent);
+}
+.qr {
+  width: 240px;
+  height: 240px;
+  padding: 8px;
+  background: #ffffff;
+}
+.qr svg {
+  width: 100%;
+  height: 100%;
+}
```

Sửa `src/windows/main/Shell.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/Shell.tsx b/src/windows/main/Shell.tsx
index beead7334222f4aaa3d46158a2aae89f9e78c548..a8f2f9522d2bac4fc862344a325fbc90bd6da00c 100644
--- a/src/windows/main/Shell.tsx
+++ b/src/windows/main/Shell.tsx
@@ -6,7 +6,7 @@
 import { Home } from "./screens/Home";
 import { GlossaryScreen } from "./screens/GlossaryScreen";
 import { HistoryScreen } from "./screens/HistoryScreen";
-import { Upgrade } from "./screens/Placeholders";
+import { UpgradeScreen } from "./screens/UpgradeScreen";
 import { SettingsScreen } from "./screens/SettingsScreen";
 import { TranscriptScreen } from "./screens/TranscriptScreen";
 
@@ -18,7 +18,7 @@
   history: HistoryScreen,
   glossary: GlossaryScreen,
   settings: SettingsScreen,
-  upgrade: Upgrade,
+  upgrade: UpgradeScreen,
   about: About,
 };
 
```

Xóa `src/windows/main/screens/Placeholders.tsx` (chạy `git rm -q src/windows/main/screens/Placeholders.tsx`).

Tạo `src/windows/main/screens/UpgradeScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { errorKey } from "../../../i18n";
import type { PlanOffer } from "../../../lib/ipc";
import { isRenewal, orderFinished, orderMessageKey, priceVnd } from "../../../lib/license";
import { useT } from "../appStore";
import { useLicense } from "../licenseStore";
import { PlanName, when } from "../LicenseText";

const vnd = (amount: number) => `${amount.toLocaleString("vi-VN")} đ`;

// Màn hình Nâng cấp (§4.3): đủ 4 gói (giá lấy từ license server, không có mạng thì báo cần mạng), đánh dấu gói đang dùng.
// Chọn gói, nhập email, tick ô đồng ý xử lý email (§10.1), rồi quét mã VietQR vẽ ngay trong app (phía Rust vẽ SVG từ
// chuỗi `qr_code`), kèm nút mở trang thanh toán của PayOS. Đang có key thì đơn là gia hạn hay đổi gói; đổi gói thì hiện
// trước số ngày quy đổi và ngày hết hạn mới, ghi rõ không hoàn tiền. MVP chỉ nhận chuyển khoản từ ngân hàng Việt Nam.
export function UpgradeScreen() {
  const t = useT();
  const view = useLicense((s) => s.view);
  const plans = useLicense((s) => s.plans);
  const checkout = useLicense((s) => s.checkout);
  const order = useLicense((s) => s.order);
  const error = useLicense((s) => s.error);
  const busy = useLicense((s) => s.busy);
  const loadPlans = useLicense((s) => s.loadPlans);
  const start = useLicense((s) => s.startCheckout);
  const openPage = useLicense((s) => s.openCheckoutPage);
  const cancel = useLicense((s) => s.cancelCheckout);
  const [plan, setPlan] = useState<PlanOffer["code"]>("pro");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);
  const renew = isRenewal(view);
  const current = view?.plan ?? "free";
  return (
    <>
      <div className="card">
        <ul className="plans">
          <li className={current === "free" ? "plan current" : "plan"}>
            <strong>
              <PlanName plan="free" />
            </strong>
            <span>{t("upgrade.free.quota")}</span>
            <span>{vnd(0)}</span>
            {current === "free" && <span className="badge active">{t("upgrade.current")}</span>}
          </li>
          {plans?.map((p) => (
            <li key={p.code} className={current === p.code ? "plan current" : "plan"}>
              <label>
                <input
                  type="radio"
                  name="plan"
                  checked={plan === p.code}
                  disabled={checkout !== null && !orderFinished(order)}
                  onChange={() => setPlan(p.code)}
                />
                <strong>{p.name}</strong>
              </label>
              <span>
                {p.quota_minutes_per_cycle === null
                  ? t("upgrade.unlimited")
                  : t("upgrade.hours", { hours: p.quota_minutes_per_cycle / 60, days: p.days_per_order })}
              </span>
              <span>{priceVnd(p) === null ? "" : t("upgrade.price", { price: vnd(priceVnd(p) ?? 0), days: p.days_per_order })}</span>
              {current === p.code && <span className="badge active">{t("upgrade.current")}</span>}
            </li>
          ))}
        </ul>
        {plans === null && !error && <p className="hint">{t("upgrade.loading")}</p>}
        <p className="hint">{t("upgrade.bankOnly")}</p>
      </div>
      <div role="alert">{error && <p className="error-text">{t(errorKey(error.code))}</p>}</div>
      {plans && (checkout === null || orderFinished(order)) && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void start(plan, email, consent, renew);
          }}
        >
          {renew && <p>{t("upgrade.renewing")}</p>}
          <div className="row">
            <label htmlFor="upgrade-email">{t("upgrade.email")}</label>
            <input id="upgrade-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("upgrade.consent")}</span>
          </label>
          <button className="primary" type="submit" disabled={busy || !consent || email.trim() === ""}>
            {t("upgrade.pay")}
          </button>
        </form>
      )}
      {checkout && (
        <div className="card">
          <h2>{t("upgrade.scan")}</h2>
          {/* SVG do phía Rust vẽ (license::purchase::qr_svg), không lấy từ server hay người dùng. */}
          <div className="qr" role="img" aria-label={t("upgrade.qr")} dangerouslySetInnerHTML={{ __html: checkout.qrSvg }} />
          <p>
            {t("upgrade.order", { code: checkout.orderCode })}
            {checkout.amount > 0 && ` · ${vnd(checkout.amount)}`}
          </p>
          {checkout.licenseExpiresAt !== null && (
            <p className="hint">
              {t("upgrade.newExpiry", { time: when(checkout.licenseExpiresAt) })}
              {(checkout.convertedDays ?? 0) > 0 && ` ${t("upgrade.converted", { days: checkout.convertedDays ?? 0 })}`}
              {checkout.convertedDays !== null && ` ${t("upgrade.noRefund")}`}
            </p>
          )}
          <p className="hint">{t("upgrade.linkExpires", { time: when(checkout.expiresAt) })}</p>
          <p role="status">{order ? t(orderMessageKey(order), { code: checkout.orderCode }) : t("upgrade.order.waiting")}</p>
          <div className="row">
            <button onClick={() => void openPage()} disabled={orderFinished(order)}>
              {t("upgrade.openPage")}
            </button>
            <button onClick={() => void cancel()}>{t(orderFinished(order) ? "upgrade.newOrder" : "common.cancel")}</button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  14 passed (14)
      Tests  125 passed (125)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/vi.ts \
  src/styles/main.css \
  src/windows/main/Shell.tsx \
  src/windows/main/screens/UpgradeScreen.tsx
git commit -m "feat(ui): màn hình Nâng cấp: 4 gói, email và ô đồng ý, mã VietQR trong app, trạng thái đơn (§4.3, §6.8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 4: Hạn mức ở màn hình chính, lời nhắc bản quyền, giờ mở lại trên thanh phụ đề

Spec §4.2 bước 2, §4.3 "Màn hình chính" (hạn mức còn lại kèm thời điểm reset), §9.

- Màn hình chính: hạn mức còn lại và lúc reset (thay "Chưa có" của 01), nút Nâng cấp khi ở Free; hết hạn mức thì báo thời điểm reset kèm nút nâng gói; còn dưới 5 phút thì nhắc.
- Thanh báo của cửa sổ chính: lời nhắc bản quyền (`licenseNotice`), có nút Gia hạn (hết hạn, sắp hết hạn) hay mở Cài đặt › Bản quyền.
- Thanh phụ đề: "Đã hết hạn mức dịch · mở lại lúc …" theo `AppStatus.quotaResetAt`.

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/windows/main/Notice.tsx`
- Modify: `src/windows/main/screens/Home.tsx`
- Modify: `src/windows/overlay/overlay.tsx`

- [ ] **Step 1: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 80d822ecf632671eb208e4b13230d9fc032034ff..1e2a66043c7e91af457124ef19668ab628cb1a2b 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -38,7 +38,8 @@
   "home.audioSource.system.macos": "Whole system, except this app",
   "home.audioSource.system.windows": "Default playback devices (automatic)",
   "home.inputLevel": "Input level",
-  "home.minutesLeft": "Free minutes left today",
+  "home.minutesLeft": "Translation left",
+  "home.quotaLow": "Less than 5 minutes of translation left.",
   "home.overlay": "Subtitle bar",
   "home.overlay.show": "Show",
   "home.overlay.hide": "Hide",
@@ -272,6 +273,7 @@
   "overlay.note.firstRun": "Preparing for first use…",
   "overlay.note.loading": "Loading models…",
   "overlay.note.quotaExhausted": "Translation quota used up",
+  "overlay.note.quotaExhausted.reset": "Translation quota used up · resets {time}",
   "overlay.note.error": "Translation stopped because of an error. Open the main window for details.",
   "overlay.note.noAudio": "No audio heard. Check that the meeting sound is playing.",
   "overlay.note.waitingForApp": "The chosen app is not playing sound",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 6d38ff22a1bcf1bc921ac21104eec0ed7bd1c004..9ea6754ca7b6586dc96385f802fc44772afb1189 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -38,7 +38,8 @@
   "home.audioSource.system.macos": "Toàn hệ thống, trừ app này",
   "home.audioSource.system.windows": "Thiết bị phát mặc định (tự động)",
   "home.inputLevel": "Mức âm lượng vào",
-  "home.minutesLeft": "Số phút miễn phí còn lại hôm nay",
+  "home.minutesLeft": "Còn dịch được",
+  "home.quotaLow": "Còn dưới 5 phút dịch.",
   "home.overlay": "Thanh phụ đề",
   "home.overlay.show": "Hiện",
   "home.overlay.hide": "Ẩn",
@@ -272,6 +273,7 @@
   "overlay.note.firstRun": "Đang chuẩn bị lần đầu…",
   "overlay.note.loading": "Đang nạp model…",
   "overlay.note.quotaExhausted": "Đã hết hạn mức dịch",
+  "overlay.note.quotaExhausted.reset": "Đã hết hạn mức dịch · mở lại lúc {time}",
   "overlay.note.error": "Phiên dịch đã dừng vì lỗi. Mở cửa sổ chính để xem chi tiết.",
   "overlay.note.noAudio": "Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.",
   "overlay.note.waitingForApp": "App đã chọn không phát tiếng",
```

Sửa `src/windows/main/Notice.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/Notice.tsx b/src/windows/main/Notice.tsx
index 5265078bc670de6b9a732023ecef9eaf1e9cd1b7..8f432fdfe3bb265bedec1daef424fdc68d742279 100644
--- a/src/windows/main/Notice.tsx
+++ b/src/windows/main/Notice.tsx
@@ -1,6 +1,8 @@
 import { errorKey } from "../../i18n";
+import { licenseNotice } from "../../lib/license";
 import { canOpenScreens } from "../../store/app";
 import { useApp, useT } from "./appStore";
+import { useLicense } from "./licenseStore";
 
 // Thông báo trong app (Q13 của kế hoạch 00: MVP không dùng thông báo hệ thống): lời nhắc từ phía Rust
 // (vừa bỏ qua ⌘Q; mục Login Items đang bị tắt), lỗi của lệnh gần nhất, và phím tắt không đăng ký được.
@@ -19,6 +21,10 @@
   const navigate = useApp((s) => s.navigate);
   const openLoginItems = useApp((s) => s.openLoginItemsSettings);
   const canNavigate = useApp(canOpenScreens);
+  // Lời nhắc bản quyền (kế hoạch 06): bản không chính hãng, giờ máy chỉnh lùi, lâu chưa kiểm được gói, hết hạn, sắp hết
+  // hạn (7 ngày), bị thu hồi.
+  const license = useLicense((s) => licenseNotice(s.view));
+  const renewable = license === "license.notice.expired" || license === "license.notice.renewSoon";
   return (
     <>
       <div role="status">
@@ -33,6 +39,16 @@
             <span>{t("notice.loginItemsApproval")}</span>
             <button onClick={() => void openLoginItems()}>{t("notice.openLoginItems")}</button>
             <button onClick={dismissNotice}>{t("common.dismiss")}</button>
+          </div>
+        )}
+        {license && (
+          <div className="notice">
+            <span>{t(license)}</span>
+            {canNavigate && (
+              <button onClick={() => (renewable ? navigate("upgrade") : navigate("settings", "license"))}>
+                {t(renewable ? "settings.license.renew" : "notice.openSettings")}
+              </button>
+            )}
           </div>
         )}
         {failures > 0 && (
```

Sửa `src/windows/main/screens/Home.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/Home.tsx b/src/windows/main/screens/Home.tsx
index f53b90ee6439228e07d08209e51438295e293ed9..95ace641f7722e39a0b529b3ce70881fed422177 100644
--- a/src/windows/main/screens/Home.tsx
+++ b/src/windows/main/screens/Home.tsx
@@ -4,6 +4,8 @@
 import { levelToMeter } from "../../../store/app";
 import { useApp, useT } from "../appStore";
 import { useTranscript } from "../dataStores";
+import { useLicense } from "../licenseStore";
+import { QuotaSummary, when } from "../LicenseText";
 import { LanguagePicker } from "../LanguagePicker";
 import { DownloadPanel } from "../models/DownloadPanel";
 import { UpdateNotice } from "../models/UpdateNotice";
@@ -23,8 +25,8 @@
   error: "home.start",
 };
 
-// Màn hình chính (§4.3): bắt đầu/dừng, trạng thái và lỗi của phiên, ngôn ngữ, nguồn âm thanh, mức âm lượng.
-// Kế hoạch 06 điền số phút còn lại.
+// Màn hình chính (§4.3): bắt đầu/dừng, trạng thái và lỗi của phiên, ngôn ngữ, nguồn âm thanh, mức âm lượng, hạn mức còn
+// lại kèm thời điểm reset (kế hoạch 06). Hết hạn mức thì báo thời điểm reset và có nút nâng gói (§4.2 bước 2).
 export function Home() {
   const t = useT();
   const status = useApp((s) => s.status);
@@ -38,6 +40,7 @@
   const navigate = useApp((s) => s.navigate);
   const openPermission = useApp((s) => s.openAudioPermissionSettings);
   const hasTranscript = useTranscript((s) => (s.transcript?.lines.length ?? 0) > 0);
+  const license = useLicense((s) => s.view);
   if (!status || !settings || !info) return null;
   const session = status.session;
   const notes: MessageKey[] = [];
@@ -68,6 +71,14 @@
             {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
               <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
             )}
+            {status.sessionError === "quotaExhausted" && (
+              <>
+                {status.quotaResetAt !== null && (
+                  <span className="hint">{t("quota.resetAt", { time: when(status.quotaResetAt) })}</span>
+                )}
+                <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>
+              </>
+            )}
           </div>
         )}
         {session === "running" && status.permissionSuspected && info.platform === "macos" && (
@@ -75,6 +86,11 @@
             <span className="error-text">{t("home.permissionSuspected")}</span>
             <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
           </div>
+        )}
+        {session === "running" && status.quotaWarning && (
+          <p className="hint" role="status">
+            {t("home.quotaLow")}
+          </p>
         )}
         {notes.map((key) => (
           <p key={key} className="hint" role="status">
@@ -107,10 +123,13 @@
           <span>{t("home.inputLevel")}</span>
           <LevelMeter label={t("home.inputLevel")} />
         </div>
-        <div className="row">
-          <span>{t("home.minutesLeft")}</span>
-          <span className="hint">{t("common.notYet")}</span>
-        </div>
+        {license && (
+          <div className="row">
+            <span>{t("home.minutesLeft")}</span>
+            <QuotaSummary quota={license.quota} />
+            {!status.pro && <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>}
+          </div>
+        )}
       </div>
       <div className="card">
         <div className="row">
```

Sửa `src/windows/overlay/overlay.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/overlay/overlay.tsx b/src/windows/overlay/overlay.tsx
index 63a87556d0c016d82a27a2b72ba7547063070732..9d55f99a6b502c3ea3a2987ef28ae97f88d20de1 100644
--- a/src/windows/overlay/overlay.tsx
+++ b/src/windows/overlay/overlay.tsx
@@ -4,7 +4,15 @@
 import { useStore } from "zustand";
 import { translate } from "../../i18n";
 import { type ResizeEdge, tauriIpc as ipc } from "../../lib/ipc";
-import { HEARING_RMS, TEXT_COLORS, lineView, overlayBackground, overlayNotes } from "../../lib/subtitleView";
+import {
+  HEARING_RMS,
+  TEXT_COLORS,
+  dateTime,
+  lineView,
+  localOffsetMinutes,
+  overlayBackground,
+  overlayNotes,
+} from "../../lib/subtitleView";
 import { createOverlayStore, createResizeDrag } from "../../store/overlay";
 
 const store = createOverlayStore(ipc);
@@ -102,7 +110,11 @@
         )}
         {notes.map((n) => (
           <span key={n} className={`note ${n}`}>
-            {t(`overlay.note.${n}`)}
+            {n === "quotaExhausted" && status?.quotaResetAt != null
+              ? translate(view.uiLanguage, "overlay.note.quotaExhausted.reset", {
+                  time: dateTime(status.quotaResetAt * 1000, localOffsetMinutes(status.quotaResetAt * 1000)),
+                })
+              : t(`overlay.note.${n}`)}
           </span>
         ))}
       </div>
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  14 passed (14)
      Tests  125 passed (125)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/vi.ts \
  src/windows/main/Notice.tsx \
  src/windows/main/screens/Home.tsx \
  src/windows/overlay/overlay.tsx
git commit -m "feat(ui): hạn mức còn lại và lúc reset ở màn hình chính, lời nhắc bản quyền, giờ mở lại trên thanh phụ đề (§4.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 5: Kiểm tra chuẩn (mục 6.2 của kế hoạch 00)

Đủ khối lệnh của mục 6.2 của kế hoạch 00, trên cây cuối của 06. Không có commit. 06 không đụng `asr-worker` và `server/`; vẫn chạy để chắc cây còn xanh.

- [ ] **Step 1: Rust**

Run:
```bash
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy: 0
```

Run:
```bash
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy asr-worker: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy asr-worker: 0
```

Run:
```bash
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```
Expected (lúc lập kế hoạch; 06b không thêm test Rust):
```text
passed 753 failed 0 ignored 13
```

Run:
```bash
cargo test -p asr-worker --features shared-encode 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```
Expected (lúc lập kế hoạch):
```text
passed 42 failed 0 ignored 1
```

Run:
```bash
cargo build --release -p asr-worker --features metal,shared-encode -q 2>&1 | grep -E '^error' | head -3; echo "build asr-worker: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
build asr-worker: 0
```

Bản phát hành dùng trạng thái bản quyền thật, không có `DevGate`, không đọc `AI_TRANSLATOR_DEV_FREE`, dùng khóa `production`, và thiếu Team ID thì không chính hãng (QĐ2, QĐ17, QĐ26): chạy test của `pro.rs` và `license/` ở profile release. Lệnh này thay lệnh `cargo test --release … pro::` của mục 6.2 (Task 8 sửa mục 6.2). Lần đầu build lại app ở release (vài phút, khoảng 2 GB trong target):

Run:
```bash
cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1 2>&1 | grep -E '^test result|FAILED|panicked' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 87 passed; 0 failed; 0 ignored; 0 measured; 313 filtered out
```

Run:
```bash
cargo test --release -p meeting-translator --lib -- --test-threads=1 the_dev_gate_exists_only_in_debug_builds only_a_debug_build_runs_unlimited the_embedded_file_parses_for_both_environments the_team_requirement_only_takes_a_real_team_id 2>&1 | grep -E '^test ' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::genuine::tests::the_team_requirement_only_takes_a_real_team_id ... ok
test license::keys::tests::the_embedded_file_parses_for_both_environments ... ok
test pro::tests::only_a_debug_build_runs_unlimited ... ok
test pro::tests::the_dev_gate_exists_only_in_debug_builds ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 396 filtered out
```

Run:
```bash
cargo deny check 2>&1 | tail -1 && cargo audit 2>&1 | grep -E '^(error|warning):' | grep -v 'is locked'
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
warning: 3 allowed warnings found
```

- [ ] **Step 2: Giao diện**

Run:
```bash
pnpm install --frozen-lockfile >/dev/null 2>&1 && pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch; trên cây đầu `5f48558` là 115 test trong 12 file):
```text
 Test Files  14 passed (14)
      Tests  125 passed (125)
```

Run:
```bash
pnpm audit 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
No known vulnerabilities found
```

- [ ] **Step 3: Kiểm code Windows trên Mac**

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 4: License server (không đổi)**

Run:
```bash
pnpm -C server install --frozen-lockfile >/dev/null 2>&1 && NO_COLOR=1 pnpm -C server check 2>&1 | grep -E '^ +Tests |^# (pass|fail) ' && pnpm -C server audit 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
      Tests  360 passed (360)
# pass 6
# fail 0
No known vulnerabilities found
```

- [ ] **Step 5: Không có bí mật nào trong app** (spec §10.2)

Dò tên các bí mật thật của server (khóa ký token, khóa của PayOS, Resend) và khóa riêng dạng PEM trong mã của app. Khóa test trong `#[cfg(test)]` (hạt giống `test-1` của bộ vector 05, khóa test manifest của 04) là khóa công khai của bộ test, không phải bí mật.

Run:
```bash
P='TOKEN_SIGNING_KEY|PAYOS_(CLIENT_ID|API_KEY|CHECKSUM_KEY)|RESEND_API_KEY|BEGIN (EC |RSA |OPENSSH )?PRIVATE KEY'
git grep -nIE "$P" -- src src-tauri | head -5; echo "khớp: $(git grep -IlE "$P" -- src src-tauri | wc -l | tr -d ' ')"
```
Expected (lúc lập kế hoạch):
```text
khớp: 0
```

## Task 6: Thử tay trên Mac với staging (cần người)

Bàn giao "chạy được" của 06 (mục 2.6 của kế hoạch 00) cần staging của 05 và người: giao dịch thật, hộp thoại của Keychain, đổi giờ máy thật. Agent không tự chạy app và không bật hộp thoại quyền (mục 6.8 của kế hoạch 00): agent chuẩn bị, đưa từng bước cho người, ghi kết quả. Dòng 11, 14, 44, 46, 55, 58, 182, 183, 242, 265, 266, 310 (phần người).

**Cần người thao tác:** cả task. **Cần trước:** 05 Task 19 (staging chạy, có cặp khóa ký token của staging, kênh PayOS của staging theo P05-1); Q14 của 05 (tài khoản PayOS). Chạy app bằng `scripts/run-dev-app.sh` với `AI_TRANSLATOR_DEV_FREE=1` (bản debug, dùng trạng thái bản quyền thật và khóa `staging`; QĐ17).

**Files:**
- Modify: `src-tauri/keys/license-public-keys.json`, `src-tauri/src/license/client.rs` (Step 1)
- Create: `bench/phase0/results/gd1_06_mac.md`

- [ ] **Step 1: Agent điền khóa công khai và URL của staging**

Chép nguyên `server/keys/public-keys.json` (05 Task 19 đã ghi khối `staging`) vào `src-tauri/keys/license-public-keys.json`. Đặt `STAGING_URL` trong `src-tauri/src/license/client.rs` thành URL của Worker staging (05 Task 19 Step cuối ghi URL; dạng `https://…workers.dev` hay tên miền riêng). Chỉ khóa công khai và URL, không bí mật nào (§10.2).

Run:
```bash
cargo test -p meeting-translator --lib license::keys -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
curl -sS -o /dev/null -w '%{http_code}\n' "$(grep -oE 'https://[^"]+' src-tauri/src/license/client.rs | head -1)/v1/plans"
```
Expected: 4 test của `license::keys` qua (cả `the_app_copy_matches_the_server_file_when_it_exists`); `curl` in `200`.

```bash
git add src-tauri/keys/license-public-keys.json src-tauri/src/license/client.rs
git commit -m "feat(app): khóa công khai và URL của license server staging (kế hoạch 06)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Free và hạn mức** (dòng 44, 46)

Người (không phải agent) đưa app về trạng thái máy mới, vì xóa mục Keychain có thể làm macOS hỏi mật khẩu (mục 6.8 của kế hoạch 00 cấm agent bật hộp thoại quyền), và vì còn `settings.json` thì thiếu `quota-free` là mất bản ghi (QĐ6), không phải lần đầu chạy:
1. Thoát app.
2. Trong thư mục `~/Library/Application Support/com.aitranslator.desktop/`, xóa mọi thứ trừ thư mục con `models/` (model của 04, vài GB; giữ để khỏi tải lại): `settings.json`, `data.db*`, các file khác.
3. Mở Keychain Access, tìm `com.aitranslator.desktop`, xóa các mục `license`, `license-seen`, `license-order`, `quota-free`, `quota-paid-…`, `quota-mark-…`, `db-key` (nếu có). macOS có thể hỏi mật khẩu đăng nhập.

Rồi người mở app (bước lần đầu mở hiện lại; đi hết các bước).
Expected:
- Màn hình chính "Còn 10 phút hôm nay · mở lại lúc …", có nút Nâng cấp; Cài đặt › Bản quyền "Free"; Lịch sử, Từ điển hiện "là tính năng Pro".
- Dịch một video tiếng Anh. Khi còn 5 phút: thanh phụ đề và màn hình chính nhắc một lần. Hết 10 phút: phiên dừng; thanh phụ đề "Đã hết hạn mức dịch · mở lại lúc <giờ>"; màn hình chính báo hết hạn mức kèm nút nâng gói; bấm Bắt đầu: bị từ chối ngay.
- Lần đầu app đọc, ghi các mục bản quyền, macOS có thể hỏi quyền truy cập Keychain (bấm Always Allow). Ghi lại có hay không, mấy lần.
- Nếu chỉ xóa mục Keychain mà còn thư mục dữ liệu: Expected là hết hạn mức của hôm nay kèm "mất bản ghi" (QĐ6), không phải "Còn 10 phút".

- [ ] **Step 3: Mua gói bằng VietQR trên staging** (dòng 11, 58, 182)

Người bấm Nâng cấp, chọn Professional, nhập email thật của mình, tick đồng ý, bấm Mua.
Expected:
- Màn hình hiện mã VietQR, mã đơn, số tiền, hạn của mã; "Chỉ nhận chuyển khoản từ ngân hàng Việt Nam". Bỏ tick đồng ý: nút Mua bị khóa. Nút "Mở trang thanh toán" mở trang `pay.payos.vn` bằng trình duyệt.
- Quét mã bằng app ngân hàng, chuyển đúng số tiền. Trong vòng vài giây sau khi PayOS xác nhận, app tự kích hoạt: Cài đặt › Bản quyền "Professional", key đã che, ngày hết hạn; hạn mức 30 giờ của chu kỳ; Lịch sử, Từ điển mở được. Email có key tới hộp thư.
- Thoát app khi đơn còn chờ (tạo đơn thứ hai, chưa chuyển): mở lại app thì màn hình Nâng cấp vẫn có đơn đó; để link hết hạn: câu "Mã thanh toán đã hết hạn", tạo được đơn mới.
- Ghi: thời gian từ lúc chuyển tới lúc app kích hoạt, có hộp thoại Keychain không.

- [ ] **Step 4: Gia hạn, đổi gói, máy thứ hai** (dòng 14, 183, 242, 329)

- Gia hạn cùng gói: màn hình Nâng cấp hiện ngày hết hạn mới ước tính và "Không hoàn tiền"; trả tiền: ngày hết hạn cộng 30 ngày, hạn mức giữ nguyên chu kỳ.
- Đổi sang X2: hiện số ngày quy đổi; trả tiền: gói X2, chu kỳ mới, hạn mức 100 giờ đầy đủ.
- Nhập cùng key trên một máy Mac thứ hai: kích hoạt được, có gói mới. Máy thứ ba (hay agent gọi `curl -sS -X POST <staging>/v1/licenses/activate -H 'content-type: application/json' -d '{"key":"<key>","device_id_hash":"<64 chữ số hex bất kỳ>","device_label":"Máy thử"}'`): máy đang thử nhận danh sách 2 máy (tên, lần dùng gần nhất), gỡ một máy được, rồi kích hoạt. Máy bị gỡ về Free ở lần `validate` kế tiếp (bấm "Kiểm tra ngay").
- Gỡ quá 3 lần trong 30 ngày: báo key bị khóa tạm, hướng dẫn liên hệ hỗ trợ (`423`); máy đang kích hoạt vẫn dùng được.

- [ ] **Step 5: Mất mạng, đồng hồ** (dòng 241, 265, 310)

- Tắt Wi-Fi, thoát rồi mở app: vẫn Professional, dịch được (token dùng tới `refresh_before`); "Kiểm tra ngay" báo cần mạng.
- Bật lại mạng. System Settings › General › Date & Time: tắt "Set time automatically", lùi giờ 1 giờ khi app đang chạy. Expected: trong vòng 1 phút, thanh báo "Giờ máy bị chỉnh lùi…", gói về Free (Lịch sử bị khóa); bật lại giờ tự động: trong vòng 5 phút (hay bấm "Kiểm tra ngay") về Professional.
- Đặt giờ tới trước 1 năm, chờ 1 phút, rồi bật lại giờ tự động, bấm "Kiểm tra ngay": về Professional (header `Date` của server hạ mốc, QĐ8).
- Ở Free (máy khác, hay sau Step 6 khi đã gỡ kích hoạt): đặt giờ tới trước 1 năm, chờ 1 phút, rồi bật lại giờ tự động. Expected: thanh báo "Giờ máy đã bị chỉnh lùi…" hiện ngay; trong vòng 5 phút có mạng thì thanh báo tắt (app hỏi giờ của server, QĐ31); hạn mức Free không kẹt tới năm sau: hôm sau, có mạng thì mở lại khi đã qua 20 giờ theo giờ của server; offline thì khi app đã chạy đủ 20 giờ (QĐ29, QĐ31).
- Ở Free, dùng hết 10 phút: đặt giờ tới trước 1 ngày khi offline. Ghi lại hạn mức Free có mở lại không (rủi ro chấp nhận của §10.2: lần chỉnh tới trước đầu lách được). Bật lại giờ tự động, rồi đặt tới trước 1 ngày lần nữa (cùng độ lệch). Expected: lần thứ hai không mở thêm phút nào (bảng mô hình đe dọa của 06a, QĐ29).
- Ghi mọi lần thấy hộp thoại Keychain.

- [ ] **Step 6: Xóa dữ liệu giữ bản quyền** (dòng 57)

Cài đặt › Quyền riêng tư › "Xóa toàn bộ dữ liệu" → "Xóa". Expected: gói, key và hạn mức đã dùng giữ nguyên (Cài đặt › Bản quyền, màn hình chính). Gỡ kích hoạt máy này (có bước xác nhận): về Free; key vẫn kích hoạt lại được.

- [ ] **Step 7: Bản cài chính hãng** (dòng 264, 308; chờ 07 và T1)

Chỉ làm khi 07 đã có bản phát hành ký bằng Developer ID với `AI_TRANSLATOR_TEAM_ID`. Expected: bản đã ký chạy Pro bình thường; sửa một byte trong `Contents/MacOS/meeting-translator` của bản cài (bản sao), hay ký lại bằng chứng thư khác (`codesign -f -s -`), rồi mở: thanh báo "Bản cài không chính hãng" kèm link tải, chỉ chạy Free. Chưa có 07 thì ghi "chờ 07".

- [ ] **Step 8: Ghi kết quả và commit**

Agent ghi `bench/phase0/results/gd1_06_mac.md`: ngày, máy, macOS, từng step với kết quả (đạt hay không, ghi chú), mọi hộp thoại Keychain, và mọi lỗi (mỗi lỗi một dòng, kèm cách tái hiện). Không ghi key, email hay mã đơn thật vào file. Lỗi chặn bàn giao thì sửa theo superpowers:systematic-debugging rồi thử lại step đó.

```bash
git add bench/phase0/results/gd1_06_mac.md
git commit -m "test(app): thử tay bản quyền, hạn mức, mua gói trên staging, đổi giờ máy trên Mac (kế hoạch 06)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: Đợt Windows (cần máy Windows và người)

Làm trong đợt Windows của mục 3 của kế hoạch 00, sau 01 Task 25 và 03b Task 9. Mục 2.6 của kế hoạch 00 ("Cần Windows: MachineGuid, Credential Manager, `WinVerifyTrust`"); dòng 179, 264, 266 (phần Windows).

**Cần người thao tác:** cả task.

**Files:**
- Create: `bench/phase0/results/gd1_06_windows.md`

- [ ] **Step 1: Test của `license/` trên Windows**

Run (PowerShell, gốc repo):
```powershell
cargo test -p meeting-translator --lib license:: -- --test-threads=1
cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1
```
Expected: cả hai xanh; `license::genuine::tests::the_team_requirement_only_takes_a_real_team_id` ở bản release kiểm bản build thiếu `AI_TRANSLATOR_SIGNER` là không chính hãng. Test `the_hardware_id_is_the_platform_uuid` chỉ có trên macOS; MachineGuid kiểm ở Step 2.

- [ ] **Step 2: `device_id_hash` đúng MachineGuid**

Run (PowerShell):
```powershell
$g = (Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Cryptography).MachineGuid
[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($g))).Replace('-','').ToLower()
```
Expected: trùng giá trị `device_id_hash` app gửi (agent so với log debug của app ở Step 3, hay với cột của activation trên staging). Chạy cả trong PowerShell 32 bit (`%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe`): cùng giá trị (app đọc khung 64 bit).

- [ ] **Step 3: Credential Manager, mua và kích hoạt trên staging**

Người chạy app (bản debug với `AI_TRANSLATOR_DEV_FREE=1`), kích hoạt key của Task 6 (máy thứ hai của key) hay mua một đơn mới.
Expected: kích hoạt được; `cmdkey /list` có các mục `license`, `license-seen`, `quota-free`, `quota-paid-…`, `quota-mark-…` của `com.aitranslator.desktop` với "Local machine persistence"; thoát rồi mở app: vẫn kích hoạt, hạn mức đã dùng giữ nguyên. Lùi giờ máy 1 giờ: báo chỉnh lùi, về Free; bật lại giờ tự động: về gói trả phí.

- [ ] **Step 4: `WinVerifyTrust`** (chờ 07 và T2)

Chỉ làm khi 07 có bộ cài ký bằng chứng thư OV với `AI_TRANSLATOR_SIGNER`. Expected: bản đã ký chạy Pro; sửa một byte của `.exe` (bản sao) hay ký lại bằng chứng thư tự tạo: "Bản cài không chính hãng", chỉ Free. Chưa có 07 thì ghi "chờ 07".

- [ ] **Step 5: Ghi kết quả và commit**

```bash
git add bench/phase0/results/gd1_06_windows.md
git commit -m "test(app): đợt Windows của kế hoạch 06: MachineGuid, Credential Manager, kích hoạt trên staging" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Cập nhật kế hoạch 00 và spec §6.8

- [ ] **Step 1: Kế hoạch 00**

Làm theo Task 2 của kế hoạch 00 (`docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`), cho cả 06a và 06b:
- Step 1–2: liệt kê các dòng có `06`, đổi trạng thái theo bảng "Dòng của bảng đối chiếu" của 06a và kết quả thật (SHA commit của task). Dòng còn chờ staging (Task 6), Windows (Task 7), 07 hay T1, T2 thì để `đang làm` hoặc `chờ` kèm lý do.
- Step 3: thêm dòng cho việc phát sinh nếu chủ dự án chưa quyết các điểm ở "Điểm cần chủ dự án quyết" của 06a.
- Step 4:
  - mục 2: tên hai file 06a, 06b; trạng thái của 06;
  - mục 2.6 (06): trạng thái; ghi "Nhận từ 03" đã làm (gate thật cài một lần ở chỗ `install_default_gate`; phiên "Nghe thử" trừ hạn mức, QĐ19; hai nút xóa dữ liệu giữ bản quyền, có test);
  - mục 2.7 (07), thêm "Nhận từ 06":
    - đặt `AI_TRANSLATOR_TEAM_ID` (macOS) và `AI_TRANSLATOR_SIGNER` (Windows, đúng tên chủ chứng thư OV) lúc build bản phát hành trong CI; thiếu thì bản phát hành không chính hãng (QĐ26); thêm một test chạy bản phát hành đã ký (Task 6 Step 7, Task 7 Step 4 của 06b);
    - CI chạy `cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1`;
    - `PRODUCTION_URL` trong `src-tauri/src/license/client.rs` và khối `production` của `src-tauri/keys/license-public-keys.json` điền khi 05 Task 21 xong (chép nguyên `server/keys/public-keys.json`; test `the_app_copy_matches_the_server_file_when_it_exists` đỏ nếu quên); đổi khóa thì ra bản app mới tin cả hai `kid` trước khi server đổi ô ký (§10.2);
    - ghi công `qrcode`, `ed25519-dalek`, `chrono` vào `THIRD_PARTY_NOTICES` (MIT, Apache-2.0, BSD-3-Clause);
  - mục 2.8 (08), thêm "Nhận từ 06": nghiệm thu dòng 308–310 với bản phát hành đã ký; mua thật một đơn trên production (P1);
  - mục 6.2: lệnh release đổi thành `cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1`; thêm số test sau 06 (06b Task 5).
- Step 5–6: kiểm định dạng bảng.

- [ ] **Step 2: Spec §6.8, "luật 1" của bộ đếm gói trả phí** (ghi chú review spec lần 5, mục 1; điểm cần quyết 1 của 06a)

Trong `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`, mục §6.8 "Hạn mức", thêm một gạch ngay trước gạch "**Bắt đầu bộ đếm từ 0** chỉ trong ba trường hợp…":

```markdown
  - **Dùng bộ đếm đã có:** trước mọi luật "bắt đầu từ 0" và "mất bản ghi" ở dưới, nếu đã có bộ đếm của khóa hiện tại (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`) thì dùng bộ đếm đó, rồi cập nhật bản ghi đánh dấu nếu bản ghi đang cũ. Luật này xử lý trường hợp app bị tắt sau khi ghi bộ đếm mà trước khi ghi bản ghi đánh dấu, và trường hợp mất bản ghi đánh dấu mà bộ đếm vẫn còn.
```

Spec có một dòng tóm tắt ở §11 (dòng bắt đầu "gói trả phí bắt đầu từ 0 chỉ khi…"): thêm "đã có bộ đếm của khóa hiện tại thì dùng nó, trước mọi luật khác;" vào đầu dòng đó.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(plan): cập nhật tổng quan Giai đoạn 1 sau kế hoạch 06; spec §6.8 thêm luật dùng bộ đếm đã có" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
