# Ba gói và mỗi key một máy · 02b: App — giao diện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Giao diện React cho ba gói và mỗi key một máy, theo `LicenseView` và các lệnh của 02a:
- màn hình Nâng cấp hiện ba gói (Free 30 phút mỗi ngày, dùng thử 10 ngày; Monthly 50 giờ mỗi 30 ngày, 30 ngày; Yearly không giới hạn, 365 ngày);
- màn hình chính ở Free hiện "Dùng thử: còn N ngày · Còn X phút hôm nay"; báo hết dùng thử, cần mạng để bắt đầu dùng thử;
- Cài đặt › Bản quyền: hộp thoại key đang dùng ở máy khác ("Gỡ máy kia và dùng máy này", "Vẫn kích hoạt trên máy này" có xác nhận), trạng thái xung đột (hai máy, "Gỡ key khỏi máy này", "Gỡ máy kia", "Thử lại");
- thanh báo và thanh phụ đề báo hết dùng thử, key bị tạm khóa;
- các bước lần đầu mở: qua bước Điều khoản thì đăng ký dùng thử chạy nền;
- câu chữ vi/en.

**Kiến trúc:** Như kế hoạch 06b: giao diện chỉ hiển thị `LicenseView` và gọi lệnh, không tự tính gói hay hạn mức. Hàm hiển thị thuần nằm ở `src/lib/license.ts`, `src/lib/subtitleView.ts` (có test Vitest); store ở `src/store/` (test bằng `fakeIpc`); thành phần React không có test đơn vị (Vitest chạy trong Node, không DOM), kiểm bằng `tsc` và thử tay ở kế hoạch 03.

**Công nghệ:** React 19.3, Zustand 5.0.15, TypeScript 7.0, Vite như hiện có. Không thêm gói npm nào; `pnpm-lock.yaml` không đổi.

**Spec:** `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md` mục 3.2, 4.2, 6, 9 (phần giao diện). Phía Rust: `2026-10-07-ba-goi-02a-app-loi.md`.

---

## Trạng thái đầu và cách đọc

- **Làm trên `main` sau khi 02a xong** (cây tham chiếu: `1202bf7` của nhánh `ref-bg02`). Trước mỗi task, `git status` phải sạch.
- **Khối code, lệnh:** như 02a ("Trạng thái đầu và cách đọc"). Mọi lệnh chạy ở gốc repo.
- **Không đổi phía Rust.** Kiểu trong `src/lib/ipc.ts` phải khớp `LicenseView`, `TrialView`, `ConflictView`, `Device` và tham số lệnh của 02a.

## Bảng task → commit tham chiếu (`ref-bg02`)

| Task | Commit | Việc |
|---|---|---|
| 1 | `76cf5fe` | Kiểu, hàm hiển thị, câu chữ |
| 2 | `95d11c0` | Store |
| 3 | `c096608` | Nâng cấp, màn hình chính, thanh báo, bước Điều khoản |
| 4 | `252fdc1` | Cài đặt › Bản quyền |
| 5 | (không commit) | Bộ kiểm cuối |

---

## Task 1: Kiểu, hàm hiển thị và câu chữ (`ipc.ts`, `lib/license.ts`, `subtitleView.ts`, i18n)

Commit tham chiếu: `76cf5fe`.

`LicenseView` theo phía Rust của 02a: `LicensePlan` là `free | monthly | yearly`, thêm `standing: "conflict"`, `trial`,
`conflict`. Lệnh: `activate_license` có `allowConflict`, `deactivate_other_device` có `key` tùy chọn, thêm `start_trial`.
Hàm hiển thị thuần: `trialKey` (dòng dùng thử chỉ ở Free), `isThisMachine`, lời nhắc `license.notice.conflict` và
`license.notice.trialEnded`, `defaultPlan` mặc định Monthly, lời nhắc trên thanh phụ đề cho `trialEnded`,
`licenseConflict`. Câu chữ vi/en cho mọi khóa mới (test i18n kiểm hai ngôn ngữ đủ khóa và cùng tham số). Các khóa i18n
mà Task 3, 4 dùng cũng thêm ở đây, vì `t()` có kiểu chặt theo từ điển.

**Files:**
- Modify: `src/i18n/en.ts`
- Test: `src/i18n/i18n.test.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/lib/ipc.ts`
- Test: `src/lib/license.test.ts`
- Modify: `src/lib/license.ts`
- Test: `src/lib/subtitleView.test.ts`
- Modify: `src/lib/subtitleView.ts`
- Test: `src/store/license.test.ts`

- [ ] **Step 1: Viết test trước**

`src/i18n/i18n.test.ts`: thay

```ts
        "settings.group.model",
        // Tên gói là tên riêng (spec §2).
        "plan.free",
        "plan.pro",
        "plan.pro_x2",
        "plan.pro_x5",
        "license.standing.free",
      ].sort(),
    );
```

bằng

```ts
        "settings.group.model",
        // Tên gói là tên riêng (spec §2).
        "plan.free",
        "plan.monthly",
        "plan.yearly",
        "license.standing.free",
      ].sort(),
    );
```

`src/lib/license.test.ts`: thay

```ts
import { describe, expect, it } from "vitest";
import type { LicenseView, OrderOutcome, QuotaView } from "./ipc";
import { defaultPlan, deviceName, hoursUsed, isRenewal, licenseNotice, minutesLeft, orderFinished, orderMessageKey, quotaKey } from "./license";

const quota = (patch: Partial<QuotaView> = {}): QuotaView => ({
  unlimited: false,
  limitMs: 600_000,
  usedMs: 0,
  remainingMs: 600_000,
  resetAt: 1_790_900_000,
  resetKind: "daily",
  needsNetwork: false,
```

bằng

```ts
import { describe, expect, it } from "vitest";
import type { LicenseView, OrderOutcome, QuotaView } from "./ipc";
import {
  defaultPlan,
  deviceName,
  hoursUsed,
  isRenewal,
  isThisMachine,
  licenseNotice,
  minutesLeft,
  orderFinished,
  orderMessageKey,
  quotaKey,
  trialKey,
} from "./license";

const quota = (patch: Partial<QuotaView> = {}): QuotaView => ({
  unlimited: false,
  limitMs: 1_800_000,
  usedMs: 0,
  remainingMs: 1_800_000,
  resetAt: 1_790_900_000,
  resetKind: "daily",
  needsNetwork: false,
```

`src/lib/license.test.ts`: thay

```ts
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  ...patch,
});

```

bằng

```ts
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  trial: { status: "active", endsAt: 1_791_676_800, daysLeft: 10 },
  conflict: null,
  ...patch,
});

```

`src/lib/license.test.ts`: thay

```ts
    expect(licenseNotice(licenseView({ standing: "active" }))).toBeNull();
    // Gói Free cũng nhắc chỉnh giờ máy (Q2 của review 06 lần 1).
    expect(licenseNotice(licenseView({ standing: "free", clockRolledBack: true }))).toBe("license.notice.clockRolledBack");
  });

  it("gia hạn khi đã có key chưa bị thu hồi", () => {
```

bằng

```ts
    expect(licenseNotice(licenseView({ standing: "active" }))).toBeNull();
    // Gói Free cũng nhắc chỉnh giờ máy (Q2 của review 06 lần 1).
    expect(licenseNotice(licenseView({ standing: "free", clockRolledBack: true }))).toBe("license.notice.clockRolledBack");
    // Mỗi key một máy và dùng thử 10 ngày (spec 2026-10-07 §3.2, §4.2).
    expect(licenseNotice(licenseView({ standing: "conflict" }))).toBe("license.notice.conflict");
    const ended = { status: "ended", endsAt: 1, daysLeft: 0 } as const;
    expect(licenseNotice(licenseView({ trial: ended }))).toBe("license.notice.trialEnded");
    expect(licenseNotice(licenseView({ standing: "expired", trial: ended }))).toBe("license.notice.expired");
    expect(licenseNotice(licenseView({ standing: "active", plan: "monthly", trial: ended }))).toBeNull();
    expect(licenseNotice(licenseView({ devOverride: true, plan: "yearly", trial: ended }))).toBeNull();
  });

  it("dòng dùng thử chỉ ở gói Free", () => {
    expect(trialKey(licenseView())).toBe("trial.active");
    expect(trialKey(licenseView({ trial: { status: "ended", endsAt: 1, daysLeft: 0 } }))).toBe("trial.ended");
    expect(trialKey(licenseView({ trial: { status: "none", endsAt: null, daysLeft: 0 } }))).toBe("trial.none");
    expect(trialKey(licenseView({ standing: "active", plan: "monthly" }))).toBeNull();
    expect(trialKey(licenseView({ devOverride: true, plan: "yearly" }))).toBeNull();
  });

  it("gia hạn khi đã có key chưa bị thu hồi", () => {
```

`src/lib/license.test.ts`: thay

```ts
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "revoked" }))).toBe(false);
  });

  it("gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì đúng gói đang dùng, còn lại là Professional", () => {
    const key = "••••-RST5";
    expect(defaultPlan(null)).toBe("pro");
    expect(defaultPlan(licenseView())).toBe("pro");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "pro" }))).toBe("pro");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "pro_x2" }))).toBe("pro_x2");
    expect(defaultPlan(licenseView({ key, standing: "expired", plan: "pro_x5" }))).toBe("pro_x5");
    // License đã thu hồi thì mua mới, không gia hạn: về Professional.
    expect(defaultPlan(licenseView({ key, standing: "revoked", plan: "pro_x2" }))).toBe("pro");
    // Có key nhưng gói Free thì không có gói trả phí nào để gia hạn.
    expect(defaultPlan(licenseView({ key, standing: "free", plan: "free" }))).toBe("pro");
  });
});

```

bằng

```ts
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "revoked" }))).toBe(false);
  });

  it("gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì đúng gói đang dùng, còn lại là Monthly", () => {
    const key = "••••-RST5";
    expect(defaultPlan(null)).toBe("monthly");
    expect(defaultPlan(licenseView())).toBe("monthly");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "monthly" }))).toBe("monthly");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "yearly" }))).toBe("yearly");
    // License đã thu hồi thì mua mới, không gia hạn: về Monthly.
    expect(defaultPlan(licenseView({ key, standing: "revoked", plan: "yearly" }))).toBe("monthly");
    // Có key nhưng gói Free thì không có gói trả phí nào để gia hạn.
    expect(defaultPlan(licenseView({ key, standing: "free", plan: "free" }))).toBe("monthly");
  });
});

```

`src/lib/license.test.ts`: thay

```ts
    expect(deviceName({ activation_id: "a", device_label: " Mac ", last_validated_at: null }, "x")).toBe("Mac");
  });

  it("đơn đã xong thì cho tạo đơn mới; thiếu tiền vẫn chờ chuyển bù", () => {
    const o = (state: OrderOutcome["state"]) => ({ state, order_code: 1, expires_at: 0, plan: "pro", code: "x" }) as OrderOutcome;
    expect(orderFinished(null)).toBe(false);
    expect(orderFinished(o("waiting"))).toBe(false);
    expect(orderFinished(o("underpaid"))).toBe(false);
```

bằng

```ts
    expect(deviceName({ activation_id: "a", device_label: " Mac ", last_validated_at: null }, "x")).toBe("Mac");
  });

  it("máy này trong danh sách xung đột", () => {
    const a = { activation_id: "a", device_label: null, last_validated_at: null };
    expect(isThisMachine({ devices: [a], thisActivationId: "a" }, a)).toBe(true);
    expect(isThisMachine({ devices: [a], thisActivationId: "b" }, a)).toBe(false);
  });

  it("đơn đã xong thì cho tạo đơn mới; thiếu tiền vẫn chờ chuyển bù", () => {
    const o = (state: OrderOutcome["state"]) => ({ state, order_code: 1, expires_at: 0, plan: "monthly", code: "x" }) as OrderOutcome;
    expect(orderFinished(null)).toBe(false);
    expect(orderFinished(o("waiting"))).toBe(false);
    expect(orderFinished(o("underpaid"))).toBe(false);
```

`src/lib/subtitleView.test.ts`: thay

```ts
  it("chỉ báo của phiên chỉ hiện khi đang dịch; lỗi và hết hạn mức hiện sau khi dừng", () => {
    expect(overlayNotes(status({ session: "idle", indicators: { lagging: true, noAudio: true, translationUnavailable: false } }))).toEqual([]);
    expect(overlayNotes(status({ session: "error", sessionError: "quotaExhausted" }))).toEqual(["quotaExhausted"]);
    expect(overlayNotes(status({ session: "error", sessionError: "sidecarFailed" }))).toEqual(["error"]);
  });
});
```

bằng

```ts
  it("chỉ báo của phiên chỉ hiện khi đang dịch; lỗi và hết hạn mức hiện sau khi dừng", () => {
    expect(overlayNotes(status({ session: "idle", indicators: { lagging: true, noAudio: true, translationUnavailable: false } }))).toEqual([]);
    expect(overlayNotes(status({ session: "error", sessionError: "quotaExhausted" }))).toEqual(["quotaExhausted"]);
    expect(overlayNotes(status({ session: "error", sessionError: "trialEnded" }))).toEqual(["trialEnded"]);
    expect(overlayNotes(status({ session: "error", sessionError: "licenseConflict" }))).toEqual(["licenseConflict"]);
    expect(overlayNotes(status({ session: "error", sessionError: "sidecarFailed" }))).toEqual(["error"]);
  });
});
```

`src/store/license.test.ts`: thay

```ts
  renewSoon: false,
  quota: {
    unlimited: false,
    limitMs: 600_000,
    usedMs: 0,
    remainingMs: 600_000,
    resetAt: null,
    resetKind: "daily",
    needsNetwork: false,
```

bằng

```ts
  renewSoon: false,
  quota: {
    unlimited: false,
    limitMs: 1_800_000,
    usedMs: 0,
    remainingMs: 1_800_000,
    resetAt: null,
    resetKind: "daily",
    needsNetwork: false,
```

`src/store/license.test.ts`: thay

```ts
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
```

bằng

```ts
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  trial: { status: "active", endsAt: 1_791_676_800, daysLeft: 10 },
  conflict: null,
  ...patch,
});

const checkout: CheckoutView = {
  orderCode: 7,
  plan: "monthly",
  amount: 50_000,
  currency: "VND",
  expiresAt: 1,
```

`src/store/license.test.ts`: thay

```ts
    await store.getState().init();
    expect(store.getState().view?.plan).toBe("free");
    expect(store.getState().checkout?.orderCode).toBe(7);
    fake.emit("license://changed", licenseView({ plan: "pro", standing: "active" }));
    expect(store.getState().view?.plan).toBe("pro");
    fake.emit("license://order", { state: "paid", order_code: 7, plan: "pro" });
    expect(store.getState().order?.state).toBe("paid");
  });

```

bằng

```ts
    await store.getState().init();
    expect(store.getState().view?.plan).toBe("free");
    expect(store.getState().checkout?.orderCode).toBe(7);
    fake.emit("license://changed", licenseView({ plan: "monthly", standing: "active" }));
    expect(store.getState().view?.plan).toBe("monthly");
    fake.emit("license://order", { state: "paid", order_code: 7, plan: "monthly" });
    expect(store.getState().order?.state).toBe("paid");
  });

```

`src/store/license.test.ts`: thay

```ts
      activate_license: () =>
        full
          ? { view: null, devices: [{ activation_id: "a1", device_label: null, last_validated_at: 5 }] }
          : { view: licenseView({ plan: "pro", standing: "active" }), devices: null },
      deactivate_other_device: () => {
        full = false;
        return null;
```

bằng

```ts
      activate_license: () =>
        full
          ? { view: null, devices: [{ activation_id: "a1", device_label: null, last_validated_at: 5 }] }
          : { view: licenseView({ plan: "monthly", standing: "active" }), devices: null },
      deactivate_other_device: () => {
        full = false;
        return null;
```

`src/store/license.test.ts`: thay

```ts
    expect(store.getState().devices?.[0]?.activation_id).toBe("a1");
    expect(await store.getState().deactivateOther("KEY", "a1")).toBe(true);
    expect(store.getState().devices).toBeNull();
    expect(store.getState().view?.plan).toBe("pro");
    expect(fake.calls.map((c) => c.cmd)).toEqual(["activate_license", "deactivate_other_device", "activate_license"]);
    expect(fake.calls[1]?.args).toEqual({ key: "KEY", activationId: "a1" });
  });
```

bằng

```ts
    expect(store.getState().devices?.[0]?.activation_id).toBe("a1");
    expect(await store.getState().deactivateOther("KEY", "a1")).toBe(true);
    expect(store.getState().devices).toBeNull();
    expect(store.getState().view?.plan).toBe("monthly");
    expect(fake.calls.map((c) => c.cmd)).toEqual(["activate_license", "deactivate_other_device", "activate_license"]);
    expect(fake.calls[1]?.args).toEqual({ key: "KEY", activationId: "a1" });
  });
```

`src/store/license.test.ts`: thay

```ts
  it("tạo đơn gửi email, ô đồng ý và gia hạn; hủy đơn thì bỏ mã QR", async () => {
    const fake = fakeIpc({ start_checkout: () => checkout, cancel_checkout: () => null });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().startCheckout("pro_x2", "a@b.vn", true, true)).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ plan: "pro_x2", email: "a@b.vn", consent: true, renew: true });
    expect(store.getState().checkout?.qrSvg).toBe("<svg/>");
    await store.getState().cancelCheckout();
    expect(store.getState().checkout).toBeNull();
```

bằng

```ts
  it("tạo đơn gửi email, ô đồng ý và gia hạn; hủy đơn thì bỏ mã QR", async () => {
    const fake = fakeIpc({ start_checkout: () => checkout, cancel_checkout: () => null });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().startCheckout("yearly", "a@b.vn", true, true)).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ plan: "yearly", email: "a@b.vn", consent: true, renew: true });
    expect(store.getState().checkout?.qrSvg).toBe("<svg/>");
    await store.getState().cancelCheckout();
    expect(store.getState().checkout).toBeNull();
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm test
```

Kết quả mong đợi: `Tests  6 failed | 158 passed (164)`; đỏ ở `i18n.test.ts` (chuỗi giữ nguyên tên gói),
`license.test.ts` (4 test: lời nhắc, dòng dùng thử, gói chọn sẵn, máy này) và `subtitleView.test.ts` (overlayNotes).

- [ ] **Step 3: Viết code**

`src/i18n/en.ts`: thay

```ts
  "transcript.empty": "Subtitles of the current session will appear here, with time, original text and translation.",
  "history.empty": "Saved sessions will appear here. Saving history is a Pro feature and is off by default.",
  "glossary.empty": "Your glossary terms will appear here. The glossary is a Pro feature.",
  "upgrade.free.quota": "10 minutes a day",
  "upgrade.current": "Current",
  "upgrade.unlimited": "Unlimited",
  "upgrade.hours": "{hours} hours per {days} days",
  "upgrade.price": "{price} / {days} days",
  "upgrade.loading": "Loading plans… Buying needs an internet connection.",
  "upgrade.bankOnly": "Payment by bank transfer from a Vietnamese bank (VietQR) only.",
```

bằng

```ts
  "transcript.empty": "Subtitles of the current session will appear here, with time, original text and translation.",
  "history.empty": "Saved sessions will appear here. Saving history is a Pro feature and is off by default.",
  "glossary.empty": "Your glossary terms will appear here. The glossary is a Pro feature.",
  "upgrade.free.quota": "30 minutes a day, 10-day trial",
  "upgrade.current": "Current",
  "upgrade.unlimited": "Unlimited",
  "upgrade.hours": "{hours} hours every 30 days",
  "upgrade.price": "{price} / {days} days",
  "upgrade.loading": "Loading plans… Buying needs an internet connection.",
  "upgrade.bankOnly": "Payment by bank transfer from a Vietnamese bank (VietQR) only.",
```

`src/i18n/en.ts`: thay

```ts
  "overlay.note.firstRun": "Preparing for first use…",
  "overlay.note.loading": "Loading models…",
  "overlay.note.quotaExhausted": "Translation quota used up",
  "overlay.note.quotaExhausted.reset": "Translation quota used up · resets {time}",
  "overlay.note.error": "Translation stopped because of an error. Open the main window for details.",
  "overlay.note.noAudio": "No audio heard. Check that the meeting sound is playing.",
```

bằng

```ts
  "overlay.note.firstRun": "Preparing for first use…",
  "overlay.note.loading": "Loading models…",
  "overlay.note.quotaExhausted": "Translation quota used up",
  "overlay.note.trialEnded": "Your 10-day trial has ended",
  "overlay.note.licenseConflict": "Key locked: in use on 2 computers",
  "overlay.note.quotaExhausted.reset": "Translation quota used up · resets {time}",
  "overlay.note.error": "Translation stopped because of an error. Open the main window for details.",
  "overlay.note.noAudio": "No audio heard. Check that the meeting sound is playing.",
```

`src/i18n/en.ts`: thay

```ts
  "notice.updateLater": "Later",

  "plan.free": "Free",
  "plan.pro": "Professional",
  "plan.pro_x2": "Professional X2",
  "plan.pro_x5": "Professional X5",
  "license.standing.free": "Free",
  "license.standing.active": "Active",
  "license.standing.expired": "Expired",
```

bằng

```ts
  "notice.updateLater": "Later",

  "plan.free": "Free",
  "plan.monthly": "Monthly",
  "plan.yearly": "Yearly",
  "license.standing.free": "Free",
  "license.standing.active": "Active",
  "license.standing.expired": "Expired",
```

`src/i18n/en.ts`: thay

```ts
  "license.standing.clockRolledBack": "Check the clock",
  "license.standing.unverified": "Checking",
  "license.standing.notGenuine": "Not genuine",
  "settings.license.plan": "Plan",
  "settings.license.licensed": "Your license:",
  "settings.license.key": "Key",
```

bằng

```ts
  "license.standing.clockRolledBack": "Check the clock",
  "license.standing.unverified": "Checking",
  "license.standing.notGenuine": "Not genuine",
  "license.standing.conflict": "Locked",
  "settings.license.plan": "Plan",
  "settings.license.licensed": "Your license:",
  "settings.license.key": "Key",
```

`src/i18n/en.ts`: thay

```ts
  "settings.license.activate": "Activate a key",
  "settings.license.keyInput": "License key",
  "settings.license.activate.button": "Activate",
  "settings.license.devices": "This key is already active on 2 computers. Remove one of them to use the key here.",
  "settings.license.devices.unnamed": "Unnamed computer",
  "settings.license.devices.lastUsed": "last used {time}",
  "settings.license.devices.remove": "Remove and use here",
  "settings.license.deactivate": "Deactivate this computer",
  "settings.license.deactivate.hint": "Frees one of the 2 computers of this key. This computer goes back to Free; the quota already used stays on this computer.",
  "settings.license.deactivate.confirm": "Deactivate this computer?",
  "settings.license.deactivate.yes": "Deactivate",
  "settings.license.recover": "Lost your key?",
```

bằng

```ts
  "settings.license.activate": "Activate a key",
  "settings.license.keyInput": "License key",
  "settings.license.activate.button": "Activate",
  "settings.license.devices": "This key is in use on another computer. A key works on 1 computer only: remove the other computer to use it here.",
  "settings.license.devices.unnamed": "Unnamed computer",
  "settings.license.devices.lastUsed": "last used {time}",
  "settings.license.devices.remove": "Remove that computer and use this one",
  "settings.license.anyway": "Activate on this computer anyway",
  "settings.license.anyway.confirm": "The key will be locked on both computers until one of them removes it. Activate anyway?",
  "settings.license.anyway.yes": "Activate anyway",
  "settings.license.conflict": "This key is in use on 2 computers, so it is locked. Remove it from one computer to keep using it.",
  "settings.license.conflict.thisMachine": "This computer",
  "settings.license.conflict.leave": "Remove the key from this computer",
  "settings.license.conflict.removeOther": "Remove that computer",
  "settings.license.conflict.retry": "Try again",
  "settings.license.deactivate": "Deactivate this computer",
  "settings.license.deactivate.hint": "A key works on 1 computer only. Remove it here to use it on another computer; this computer goes back to Free, and the quota already used stays on it.",
  "settings.license.deactivate.confirm": "Deactivate this computer?",
  "settings.license.deactivate.yes": "Deactivate",
  "settings.license.recover": "Lost your key?",
```

`src/i18n/en.ts`: thay

```ts
  "license.notice.refreshNeeded": "Your plan could not be checked for 14 days, so Free is used. Connect to the internet.",
  "license.notice.expired": "Your plan has expired. Renew it to keep the Pro features.",
  "license.notice.revoked": "Your license has been revoked. Contact support.",
  "license.notice.renewSoon": "Your plan ends within 7 days. Renew it to keep the Pro features.",
  "common.cancel": "Cancel",
  "common.dismiss": "Dismiss",
```

bằng

```ts
  "license.notice.refreshNeeded": "Your plan could not be checked for 14 days, so Free is used. Connect to the internet.",
  "license.notice.expired": "Your plan has expired. Renew it to keep the Pro features.",
  "license.notice.revoked": "Your license has been revoked. Contact support.",
  "license.notice.conflict": "This key is in use on 2 computers, so it is locked. Remove it from one computer to keep using it.",
  "license.notice.trialEnded": "Your 10-day free trial has ended. Buy Monthly or Yearly to keep translating.",
  "trial.active": "Free trial: {days} days left",
  "trial.ended": "Your 10-day trial has ended",
  "trial.none": "Connect to the internet once to start the free trial",
  "license.notice.renewSoon": "Your plan ends within 7 days. Renew it to keep the Pro features.",
  "common.cancel": "Cancel",
  "common.dismiss": "Dismiss",
```

`src/i18n/vi.ts`: thay

```ts
  "transcript.empty": "Phụ đề của phiên đang dịch sẽ hiện ở đây, gồm giờ, câu gốc và bản dịch.",
  "history.empty": "Các phiên đã lưu sẽ hiện ở đây. Lưu lịch sử là tính năng Pro và mặc định tắt.",
  "glossary.empty": "Các thuật ngữ của bạn sẽ hiện ở đây. Từ điển thuật ngữ là tính năng Pro.",
  "upgrade.free.quota": "10 phút mỗi ngày",
  "upgrade.current": "Đang dùng",
  "upgrade.unlimited": "Không giới hạn",
  "upgrade.hours": "{hours} giờ mỗi {days} ngày",
  "upgrade.price": "{price} / {days} ngày",
  "upgrade.loading": "Đang tải bảng gói… Mua gói cần kết nối mạng.",
  "upgrade.bankOnly": "Chỉ nhận chuyển khoản từ ngân hàng Việt Nam (VietQR).",
```

bằng

```ts
  "transcript.empty": "Phụ đề của phiên đang dịch sẽ hiện ở đây, gồm giờ, câu gốc và bản dịch.",
  "history.empty": "Các phiên đã lưu sẽ hiện ở đây. Lưu lịch sử là tính năng Pro và mặc định tắt.",
  "glossary.empty": "Các thuật ngữ của bạn sẽ hiện ở đây. Từ điển thuật ngữ là tính năng Pro.",
  "upgrade.free.quota": "30 phút mỗi ngày, dùng thử 10 ngày",
  "upgrade.current": "Đang dùng",
  "upgrade.unlimited": "Không giới hạn",
  "upgrade.hours": "{hours} giờ mỗi 30 ngày",
  "upgrade.price": "{price} / {days} ngày",
  "upgrade.loading": "Đang tải bảng gói… Mua gói cần kết nối mạng.",
  "upgrade.bankOnly": "Chỉ nhận chuyển khoản từ ngân hàng Việt Nam (VietQR).",
```

`src/i18n/vi.ts`: thay

```ts
  "overlay.note.loading": "Đang nạp model…",
  "overlay.note.quotaExhausted": "Đã hết hạn mức dịch",
  "overlay.note.quotaExhausted.reset": "Đã hết hạn mức dịch · mở lại lúc {time}",
  "overlay.note.error": "Phiên dịch đã dừng vì lỗi. Mở cửa sổ chính để xem chi tiết.",
  "overlay.note.noAudio": "Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.",
  "overlay.note.waitingForApp": "App đã chọn không phát tiếng",
```

bằng

```ts
  "overlay.note.loading": "Đang nạp model…",
  "overlay.note.quotaExhausted": "Đã hết hạn mức dịch",
  "overlay.note.quotaExhausted.reset": "Đã hết hạn mức dịch · mở lại lúc {time}",
  "overlay.note.trialEnded": "Đã hết 10 ngày dùng thử",
  "overlay.note.licenseConflict": "Key đang bị tạm khóa vì dùng trên 2 máy",
  "overlay.note.error": "Phiên dịch đã dừng vì lỗi. Mở cửa sổ chính để xem chi tiết.",
  "overlay.note.noAudio": "Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.",
  "overlay.note.waitingForApp": "App đã chọn không phát tiếng",
```

`src/i18n/vi.ts`: thay

```ts
  "notice.updateLater": "Để sau",

  "plan.free": "Free",
  "plan.pro": "Professional",
  "plan.pro_x2": "Professional X2",
  "plan.pro_x5": "Professional X5",
  "license.standing.free": "Free",
  "license.standing.active": "Đang dùng",
  "license.standing.expired": "Đã hết hạn",
```

bằng

```ts
  "notice.updateLater": "Để sau",

  "plan.free": "Free",
  "plan.monthly": "Monthly",
  "plan.yearly": "Yearly",
  "license.standing.free": "Free",
  "license.standing.active": "Đang dùng",
  "license.standing.expired": "Đã hết hạn",
```

`src/i18n/vi.ts`: thay

```ts
  "license.standing.clockRolledBack": "Kiểm tra giờ máy",
  "license.standing.unverified": "Đang kiểm",
  "license.standing.notGenuine": "Không chính hãng",
  "settings.license.plan": "Gói",
  "settings.license.licensed": "License của bạn:",
  "settings.license.key": "Mã key",
```

bằng

```ts
  "license.standing.clockRolledBack": "Kiểm tra giờ máy",
  "license.standing.unverified": "Đang kiểm",
  "license.standing.notGenuine": "Không chính hãng",
  "license.standing.conflict": "Tạm khóa",
  "settings.license.plan": "Gói",
  "settings.license.licensed": "License của bạn:",
  "settings.license.key": "Mã key",
```

`src/i18n/vi.ts`: thay

```ts
  "settings.license.activate": "Kích hoạt key",
  "settings.license.keyInput": "Nhập license key",
  "settings.license.activate.button": "Kích hoạt",
  "settings.license.devices": "Key này đã kích hoạt trên 2 máy. Gỡ một máy để dùng key ở máy này.",
  "settings.license.devices.unnamed": "Máy không tên",
  "settings.license.devices.lastUsed": "dùng lần cuối {time}",
  "settings.license.devices.remove": "Gỡ máy này để dùng ở đây",
  "settings.license.deactivate": "Gỡ kích hoạt máy này",
  "settings.license.deactivate.hint": "Trả lại một trong 2 suất máy của key. Máy này về Free; hạn mức đã dùng vẫn ở lại máy này.",
  "settings.license.deactivate.confirm": "Gỡ kích hoạt máy này?",
  "settings.license.deactivate.yes": "Gỡ kích hoạt",
  "settings.license.recover": "Mất key?",
```

bằng

```ts
  "settings.license.activate": "Kích hoạt key",
  "settings.license.keyInput": "Nhập license key",
  "settings.license.activate.button": "Kích hoạt",
  "settings.license.devices": "Key này đang dùng ở máy khác. Mỗi key chỉ dùng trên 1 máy: gỡ máy kia để dùng ở máy này.",
  "settings.license.devices.unnamed": "Máy không tên",
  "settings.license.devices.lastUsed": "dùng lần cuối {time}",
  "settings.license.devices.remove": "Gỡ máy kia và dùng máy này",
  "settings.license.anyway": "Vẫn kích hoạt trên máy này",
  "settings.license.anyway.confirm": "Key sẽ bị tạm khóa trên cả hai máy cho tới khi một máy gỡ key. Vẫn kích hoạt?",
  "settings.license.anyway.yes": "Vẫn kích hoạt",
  "settings.license.conflict": "Key đang dùng trên 2 máy nên đã bị tạm khóa. Gỡ key khỏi một máy để dùng tiếp.",
  "settings.license.conflict.thisMachine": "Máy này",
  "settings.license.conflict.leave": "Gỡ key khỏi máy này",
  "settings.license.conflict.removeOther": "Gỡ máy kia",
  "settings.license.conflict.retry": "Thử lại",
  "settings.license.deactivate": "Gỡ kích hoạt máy này",
  "settings.license.deactivate.hint": "Mỗi key chỉ dùng trên 1 máy. Gỡ ở đây để dùng key ở máy khác; máy này về Free, hạn mức đã dùng vẫn ở lại máy này.",
  "settings.license.deactivate.confirm": "Gỡ kích hoạt máy này?",
  "settings.license.deactivate.yes": "Gỡ kích hoạt",
  "settings.license.recover": "Mất key?",
```

`src/i18n/vi.ts`: thay

```ts
  "license.notice.refreshNeeded": "Đã 14 ngày chưa kiểm được gói nên đang dùng Free. Hãy kết nối mạng.",
  "license.notice.expired": "Gói đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
  "license.notice.revoked": "License đã bị thu hồi. Vui lòng liên hệ hỗ trợ.",
  "license.notice.renewSoon": "Gói còn dưới 7 ngày. Gia hạn để tiếp tục dùng tính năng Pro.",
  "common.cancel": "Hủy",
  "common.dismiss": "Đóng",
```

bằng

```ts
  "license.notice.refreshNeeded": "Đã 14 ngày chưa kiểm được gói nên đang dùng Free. Hãy kết nối mạng.",
  "license.notice.expired": "Gói đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
  "license.notice.revoked": "License đã bị thu hồi. Vui lòng liên hệ hỗ trợ.",
  "license.notice.conflict": "Key đang dùng trên 2 máy nên đã bị tạm khóa. Gỡ key khỏi một máy để dùng tiếp.",
  "license.notice.trialEnded": "Đã hết 10 ngày dùng thử. Mua gói Monthly hoặc Yearly để tiếp tục dịch.",
  "trial.active": "Dùng thử: còn {days} ngày",
  "trial.ended": "Đã hết 10 ngày dùng thử",
  "trial.none": "Cần kết nối mạng một lần để bắt đầu dùng thử",
  "license.notice.renewSoon": "Gói còn dưới 7 ngày. Gia hạn để tiếp tục dùng tính năng Pro.",
  "common.cancel": "Hủy",
  "common.dismiss": "Đóng",
```

`src/lib/ipc.ts`: thay

```ts
}

// Bản quyền (kế hoạch 06; `license::manager::LicenseView`). Không có key đầy đủ hay token: `key` đã che.
export type LicensePlan = "free" | "pro" | "pro_x2" | "pro_x5";
export type Standing =
  | "free"
  | "active"
```

bằng

```ts
}

// Bản quyền (kế hoạch 06; `license::manager::LicenseView`). Không có key đầy đủ hay token: `key` đã che.
// Ba gói (spec 2026-10-07 §1): Free dùng thử 10 ngày, Monthly, Yearly.
export type LicensePlan = "free" | "monthly" | "yearly";
export type Standing =
  | "free"
  | "active"
```

`src/lib/ipc.ts`: thay

```ts
  | "refreshNeeded"
  | "clockRolledBack"
  | "unverified"
  | "notGenuine";

export interface QuotaView {
  unlimited: boolean;
```

bằng

```ts
  | "refreshNeeded"
  | "clockRolledBack"
  | "unverified"
  | "notGenuine"
  // Key đang kích hoạt trên 2 máy: tạm khóa tới khi một máy gỡ key (spec 2026-10-07 §4.2).
  | "conflict";

export interface QuotaView {
  unlimited: boolean;
```

`src/lib/ipc.ts`: thay

```ts
  storageError: boolean;
}

export interface LicenseView {
  standing: Standing;
  plan: LicensePlan;
```

bằng

```ts
  storageError: boolean;
}

// Dùng thử của Free trên máy này (`license::manager::TrialView`).
export interface TrialView {
  status: "none" | "active" | "ended";
  endsAt: number | null;
  daysLeft: number;
}

// Trạng thái xung đột (`license::manager::ConflictView`): các máy đang kích hoạt key, và activation của máy này.
export interface ConflictView {
  devices: Device[];
  thisActivationId: string;
}

export interface LicenseView {
  standing: Standing;
  plan: LicensePlan;
```

`src/lib/ipc.ts`: thay

```ts
  devOverride: boolean;
  // Giờ máy bị coi là chỉnh lùi (cả ở gói Free): nhắc chỉnh giờ.
  clockRolledBack: boolean;
}

// Một máy đã kích hoạt, trong `409 device_limit` (`license::client::Device`). `device_label` có thể là `null`.
export interface Device {
  activation_id: string;
  device_label: string | null;
```

bằng

```ts
  devOverride: boolean;
  // Giờ máy bị coi là chỉnh lùi (cả ở gói Free): nhắc chỉnh giờ.
  clockRolledBack: boolean;
  trial: TrialView;
  conflict: ConflictView | null;
}

// Một máy đang kích hoạt, trong `409 key_in_use` hay `409 license_conflict` (`license::client::Device`). `device_label`
// có thể là `null`.
export interface Device {
  activation_id: string;
  device_label: string | null;
```

`src/lib/ipc.ts`: thay

```ts
  get_debug_sessions: { args: undefined; result: DebugSession[] };
  get_overlay_view: { args: undefined; result: OverlayView };
  get_license: { args: undefined; result: LicenseView | null };
  activate_license: { args: { key: string }; result: ActivateOutcome };
  deactivate_license: { args: undefined; result: LicenseView | null };
  deactivate_other_device: { args: { key: string; activationId: string }; result: null };
  validate_license: { args: undefined; result: LicenseView | null };
  get_plans: { args: undefined; result: PlanOffer[] };
  start_checkout: { args: { plan: string; email: string; consent: boolean; renew: boolean }; result: CheckoutView };
```

bằng

```ts
  get_debug_sessions: { args: undefined; result: DebugSession[] };
  get_overlay_view: { args: undefined; result: OverlayView };
  get_license: { args: undefined; result: LicenseView | null };
  // `allowConflict`: người dùng đã xác nhận "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2).
  activate_license: { args: { key: string; allowConflict?: boolean }; result: ActivateOutcome };
  deactivate_license: { args: undefined; result: LicenseView | null };
  // Không có `key`: dùng key đã lưu (đang xung đột, "Gỡ máy kia"); phía Rust `validate` ngay sau đó.
  deactivate_other_device: { args: { key?: string; activationId: string }; result: null };
  // Bước Điều khoản vừa được đồng ý: đăng ký dùng thử chạy nền (spec 2026-10-07 §3.2).
  start_trial: { args: undefined; result: null };
  validate_license: { args: undefined; result: LicenseView | null };
  get_plans: { args: undefined; result: PlanOffer[] };
  start_checkout: { args: { plan: string; email: string; consent: boolean; renew: boolean }; result: CheckoutView };
```

`src/lib/license.ts`: thay

```ts
import type { Device, LicenseView, OrderOutcome, PlanOffer, QuotaView, Standing } from "./ipc";

// Hiển thị bản quyền và hạn mức (kế hoạch 06; spec §4.2 bước 2, §4.3 "Bản quyền", "Nâng cấp"). Chỉ đọc kết quả phía Rust
// trả về; không tự tính gói hay hạn mức.
```

bằng

```ts
import type { ConflictView, Device, LicenseView, OrderOutcome, PlanOffer, QuotaView, Standing } from "./ipc";

// Hiển thị bản quyền và hạn mức (kế hoạch 06; spec §4.2 bước 2, §4.3 "Bản quyền", "Nâng cấp"). Chỉ đọc kết quả phía Rust
// trả về; không tự tính gói hay hạn mức.
```

`src/lib/license.ts`: thay

```ts
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
```

bằng

```ts
}

// Có lời nhắc nào cần hiện ở thanh báo của cửa sổ chính (thứ tự ưu tiên): bản không chính hãng, đồng hồ bị chỉnh lùi,
// lâu không làm mới được token, license hết hạn hay sắp hết hạn, bị thu hồi, key đang xung đột, Free đã hết dùng thử.
export type LicenseNoticeKey =
  | "license.notice.notGenuine"
  | "license.notice.clockRolledBack"
  | "license.notice.refreshNeeded"
  | "license.notice.expired"
  | "license.notice.revoked"
  | "license.notice.conflict"
  | "license.notice.trialEnded"
  | "license.notice.renewSoon";

export function licenseNotice(view: LicenseView | null): LicenseNoticeKey | null {
```

`src/lib/license.ts`: thay

```ts
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

// Gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì chọn đúng gói đang dùng (mặc định là gia hạn, không phải hạ gói), còn lại là Professional.
export function defaultPlan(view: LicenseView | null): PlanOffer["code"] {
  return isRenewal(view) && view !== null && view.plan !== "free" ? view.plan : "pro";
}

// Giá theo VND của một gói, hoặc `null` nếu server không bán gói đó bằng VND.
```

bằng

```ts
    refreshNeeded: "license.notice.refreshNeeded",
    expired: "license.notice.expired",
    revoked: "license.notice.revoked",
    conflict: "license.notice.conflict",
  };
  const key = byStanding[view.standing];
  if (key) return key;
  if (view.clockRolledBack) return "license.notice.clockRolledBack";
  if (trialKey(view) === "trial.ended") return "license.notice.trialEnded";
  return view.standing === "active" && view.renewSoon ? "license.notice.renewSoon" : null;
}

// Dòng dùng thử ở màn hình chính, chỉ khi đang ở gói Free (spec 2026-10-07 §3.2): còn N ngày, đã hết, hay chưa đăng ký
// được (cần mạng).
export type TrialKey = "trial.active" | "trial.ended" | "trial.none";

export function trialKey(view: LicenseView): TrialKey | null {
  if (view.plan !== "free" || view.devOverride) return null;
  return `trial.${view.trial.status}`;
}

// Mua mới hay gia hạn / đổi gói key đang có. License đã thu hồi thì mua mới (server từ chối gia hạn key đã thu hồi).
export function isRenewal(view: LicenseView | null): boolean {
  return view?.key != null && view.standing !== "revoked";
}

// Gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì chọn đúng gói đang dùng (mặc định là gia hạn, không phải hạ gói), còn lại là Monthly.
export function defaultPlan(view: LicenseView | null): PlanOffer["code"] {
  return isRenewal(view) && view !== null && view.plan !== "free" ? view.plan : "monthly";
}

// Giá theo VND của một gói, hoặc `null` nếu server không bán gói đó bằng VND.
```

`src/lib/license.ts`: thay

```ts
  return plan.prices.VND ?? null;
}

// Tên hiển thị của một máy trong danh sách `409 device_limit`; `device_label` là `null` thì dùng tên thay thế.
export function deviceName(device: Device, fallback: string): string {
  return device.device_label?.trim() || fallback;
}

// Câu báo theo trạng thái đơn (bảng "App hiện gì theo `status`" của kế hoạch 05).
export function orderMessageKey(outcome: OrderOutcome) {
  switch (outcome.state) {
```

bằng

```ts
  return plan.prices.VND ?? null;
}

// Tên hiển thị của một máy trong danh sách `409 key_in_use` hay `409 license_conflict`; `device_label` là `null` thì dùng
// tên thay thế.
export function deviceName(device: Device, fallback: string): string {
  return device.device_label?.trim() || fallback;
}

// Máy trong danh sách xung đột có phải máy này không.
export function isThisMachine(conflict: ConflictView, device: Device): boolean {
  return device.activation_id === conflict.thisActivationId;
}

// Câu báo theo trạng thái đơn (bảng "App hiện gì theo `status`" của kế hoạch 05).
export function orderMessageKey(outcome: OrderOutcome) {
  switch (outcome.state) {
```

`src/lib/subtitleView.ts`: thay

```ts
  | "firstRun"
  | "loading"
  | "quotaExhausted"
  | "error"
  | "noAudio"
  | "waitingForApp"
```

bằng

```ts
  | "firstRun"
  | "loading"
  | "quotaExhausted"
  | "trialEnded"
  | "licenseConflict"
  | "error"
  | "noAudio"
  | "waitingForApp"
```

`src/lib/subtitleView.ts`: thay

```ts
  | "lagging"
  | "translationUnavailable";

export function overlayNotes(status: AppStatus | null): OverlayNote[] {
  if (!status) return [];
  const notes: OverlayNote[] = [];
  if (status.loading === "firstRun") notes.push("firstRun");
  else if (status.loading === "model") notes.push("loading");
  if (status.session === "error") notes.push(status.sessionError === "quotaExhausted" ? "quotaExhausted" : "error");
  if (status.session === "running") {
    if (status.indicators.noAudio) notes.push("noAudio");
    if (status.waitingForApp) notes.push("waitingForApp");
```

bằng

```ts
  | "lagging"
  | "translationUnavailable";

// Lỗi làm phiên dừng hay không bắt đầu được: hết hạn mức, hết dùng thử, key đang xung đột (spec 2026-10-07 §3.2, §4.2)
// có lời nhắc riêng; còn lại là lời nhắc chung.
function sessionErrorNote(code: string | null): OverlayNote {
  return code === "quotaExhausted" || code === "trialEnded" || code === "licenseConflict" ? code : "error";
}

export function overlayNotes(status: AppStatus | null): OverlayNote[] {
  if (!status) return [];
  const notes: OverlayNote[] = [];
  if (status.loading === "firstRun") notes.push("firstRun");
  else if (status.loading === "model") notes.push("loading");
  if (status.session === "error") notes.push(sessionErrorNote(status.sessionError));
  if (status.session === "running") {
    if (status.indicators.noAudio) notes.push("noAudio");
    if (status.waitingForApp) notes.push("waitingForApp");
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm test
```

Kết quả mong đợi: `Tests  164 passed (164)`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
pnpm build
```

Kết quả mong đợi: `tsc --noEmit` không báo lỗi, Vite in `✓ built in …`.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/i18n.test.ts src/i18n/vi.ts src/lib/ipc.ts src/lib/license.test.ts src/lib/license.ts src/lib/subtitleView.test.ts src/lib/subtitleView.ts src/store/license.test.ts
git commit -m "feat(ui): kiểu và câu chữ cho ba gói, dùng thử, xung đột

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 2: Store: vẫn kích hoạt, gỡ máy kia khi xung đột, đăng ký dùng thử

Commit tham chiếu: `95d11c0`.

`license` store: `activateAnyway` (gửi `allowConflict: true`), `removeOtherMachine` (gỡ bằng key đã lưu rồi đọc lại
`get_license`). `app` store: `startTrial` gọi `start_trial`, bỏ qua lỗi (lỗi mạng không chặn các bước lần đầu mở).

**Files:**
- Test: `src/store/app.test.ts`
- Modify: `src/store/app.ts`
- Test: `src/store/license.test.ts`
- Modify: `src/store/license.ts`

- [ ] **Step 1: Viết test trước**

`src/store/app.test.ts`: thay

```ts
      if (failRestart) throw { code: "updateBusy", field: null, message: "…" };
      return null;
    },
    open_login_items_settings: () => {
      if (failLoginItems) throw { code: "openFailed", field: null, message: "…" };
      return null;
```

bằng

```ts
      if (failRestart) throw { code: "updateBusy", field: null, message: "…" };
      return null;
    },
    start_trial: () => null,
    open_login_items_settings: () => {
      if (failLoginItems) throw { code: "openFailed", field: null, message: "…" };
      return null;
```

`src/store/app.test.ts`: thay

```ts
    expect(store.getState().termsAccepted).toBe(false);
  });

  it("xong các bước lần đầu thì lưu onboardingDone và về màn hình chính", async () => {
    const { fake, store } = setup();
    await store.getState().init();
```

bằng

```ts
    expect(store.getState().termsAccepted).toBe(false);
  });

  it("qua bước Điều khoản thì đăng ký dùng thử chạy nền (spec 2026-10-07 §3.2); lỗi không chặn các bước", async () => {
    const { fake, store } = setup();
    await store.getState().startTrial();
    expect(fake.calls.at(-1)).toEqual({ cmd: "start_trial", args: undefined });
    const failing = createAppStore(fakeIpc({}).ipc);
    await failing.getState().startTrial();
    expect(failing.getState().error).toBeNull();
  });

  it("xong các bước lần đầu thì lưu onboardingDone và về màn hình chính", async () => {
    const { fake, store } = setup();
    await store.getState().init();
```

`src/store/license.test.ts`: thay

```ts
    expect(fake.calls[1]?.args).toEqual({ key: "KEY", activationId: "a1" });
  });

  it("lỗi của lệnh hiện mã lỗi; bấm hai lần khi đang chờ chỉ gửi một lệnh", async () => {
    let release: () => void = () => {};
    const fake = fakeIpc({
```

bằng

```ts
    expect(fake.calls[1]?.args).toEqual({ key: "KEY", activationId: "a1" });
  });

  it("vẫn kích hoạt khi key đang dùng ở máy khác: gửi allowConflict, nhận trạng thái xung đột", async () => {
    const conflict = { devices: [{ activation_id: "a1", device_label: null, last_validated_at: 5 }], thisActivationId: "a2" };
    const fake = fakeIpc({
      activate_license: () => ({ view: licenseView({ standing: "conflict", conflict }), devices: null }),
    });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().activateAnyway("KEY")).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ key: "KEY", allowConflict: true });
    expect(store.getState().view?.standing).toBe("conflict");
    expect(store.getState().devices).toBeNull();
  });

  it("đang xung đột: gỡ máy kia bằng key đã lưu rồi đọc lại trạng thái", async () => {
    const fake = fakeIpc({
      deactivate_other_device: () => null,
      get_license: () => licenseView({ standing: "active", plan: "monthly" }),
    });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().removeOtherMachine("a1")).toBe(true);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["deactivate_other_device", "get_license"]);
    expect(fake.calls[0]?.args).toEqual({ activationId: "a1" });
    expect(store.getState().view?.standing).toBe("active");
  });

  it("lỗi của lệnh hiện mã lỗi; bấm hai lần khi đang chờ chỉ gửi một lệnh", async () => {
    let release: () => void = () => {};
    const fake = fakeIpc({
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm test
```

Kết quả mong đợi: `Tests  3 failed | 164 passed (167)`; đỏ ở test "qua bước Điều khoản…" (`store/app.test.ts`),
"vẫn kích hoạt khi key đang dùng ở máy khác…" và "đang xung đột: gỡ máy kia…" (`store/license.test.ts`).

- [ ] **Step 3: Viết code**

`src/store/app.ts`: thay

```ts
  openAudioPermissionSettings(): Promise<void>;
  loadAudioSources(): Promise<void>;
  finishOnboarding(): Promise<void>;
  // Bước "Nghe thử" (§4.1 bước 6): bắt đầu phiên thu toàn hệ thống, kể cả âm thanh của chính app.
  startListenTest(): Promise<void>;
  clearAllData(): Promise<void>;
```

bằng

```ts
  openAudioPermissionSettings(): Promise<void>;
  loadAudioSources(): Promise<void>;
  finishOnboarding(): Promise<void>;
  // Qua bước Điều khoản (đã đồng ý): đăng ký dùng thử chạy nền (spec 2026-10-07 §3.2). Lỗi không chặn các bước.
  startTrial(): Promise<void>;
  // Bước "Nghe thử" (§4.1 bước 6): bắt đầu phiên thu toàn hệ thống, kể cả âm thanh của chính app.
  startListenTest(): Promise<void>;
  clearAllData(): Promise<void>;
```

`src/store/app.ts`: thay

```ts
        if (await get().updateSettings({ onboardingDone: true })) set({ screen: "home" });
      },

      // Như `toggleSession`: chặn bấm đúp; lỗi bắt đầu nằm trong trạng thái phiên.
      async startListenTest() {
        if (get().sessionPending) return;
```

bằng

```ts
        if (await get().updateSettings({ onboardingDone: true })) set({ screen: "home" });
      },

      async startTrial() {
        await ipc.invoke("start_trial").catch(() => null);
      },

      // Như `toggleSession`: chặn bấm đúp; lỗi bắt đầu nằm trong trạng thái phiên.
      async startListenTest() {
        if (get().sessionPending) return;
```

`src/store/license.ts`: thay

```ts

export interface LicenseStoreState {
  view: LicenseView | null;
  // Key người dùng vừa gõ mà đã đủ 2 máy (`409 device_limit`): danh sách máy để gỡ một máy.
  devices: Device[] | null;
  plans: PlanOffer[] | null;
  checkout: CheckoutView | null;
```

bằng

```ts

export interface LicenseStoreState {
  view: LicenseView | null;
  // Key người dùng vừa gõ đang dùng ở máy khác (`409 key_in_use`): danh sách máy để gỡ máy kia hay "Vẫn kích hoạt".
  devices: Device[] | null;
  plans: PlanOffer[] | null;
  checkout: CheckoutView | null;
```

`src/store/license.ts`: thay

```ts
  busy: boolean;
  init(): Promise<() => void>;
  activate(key: string): Promise<boolean>;
  // Gỡ một máy khác của key vừa gõ, rồi kích hoạt lại máy này.
  deactivateOther(key: string, activationId: string): Promise<boolean>;
  deactivate(): Promise<void>;
  validate(): Promise<void>;
  loadPlans(): Promise<void>;
```

bằng

```ts
  busy: boolean;
  init(): Promise<() => void>;
  activate(key: string): Promise<boolean>;
  // "Vẫn kích hoạt trên máy này" (đã xác nhận): key vào trạng thái xung đột (spec 2026-10-07 §4.2).
  activateAnyway(key: string): Promise<boolean>;
  // Gỡ một máy khác của key vừa gõ, rồi kích hoạt lại máy này.
  deactivateOther(key: string, activationId: string): Promise<boolean>;
  // Đang xung đột: gỡ máy kia bằng key đã lưu (phía Rust `validate` ngay sau đó), rồi đọc lại trạng thái.
  removeOtherMachine(activationId: string): Promise<boolean>;
  deactivate(): Promise<void>;
  validate(): Promise<void>;
  loadPlans(): Promise<void>;
```

`src/store/license.ts`: thay

```ts
        });
      },

      async deactivateOther(key, activationId) {
        const removed = await run(() => ipc.invoke("deactivate_other_device", { key, activationId }).then(() => {}));
        return removed && (await get().activate(key));
```

bằng

```ts
        });
      },

      activateAnyway(key) {
        return run(async () => {
          const outcome = await ipc.invoke("activate_license", { key, allowConflict: true });
          setView(outcome.view);
          set({ devices: outcome.devices });
        });
      },

      removeOtherMachine(activationId) {
        return run(async () => {
          await ipc.invoke("deactivate_other_device", { activationId });
          setView(await ipc.invoke("get_license"));
        });
      },

      async deactivateOther(key, activationId) {
        const removed = await run(() => ipc.invoke("deactivate_other_device", { key, activationId }).then(() => {}));
        return removed && (await get().activate(key));
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm test
```

Kết quả mong đợi: `Tests  167 passed (167)`.

- [ ] **Step 5: Định dạng và kiểm tĩnh**

```bash
pnpm build
```

Kết quả mong đợi: `tsc --noEmit` không báo lỗi, Vite in `✓ built in …`.

- [ ] **Step 6: Commit**

```bash
git add src/store/app.test.ts src/store/app.ts src/store/license.test.ts src/store/license.ts
git commit -m "feat(ui): store: vẫn kích hoạt, gỡ máy kia khi xung đột, đăng ký dùng thử

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 3: Nâng cấp ba gói, dòng dùng thử ở màn hình chính, đăng ký dùng thử sau bước Điều khoản

Commit tham chiếu: `c096608`.

Thành phần React không có test đơn vị (Vitest chạy trong Node, không DOM); kiểm bằng `tsc` và thử tay ở Task 5.

- Nâng cấp: câu hạn mức Monthly là "50 giờ mỗi 30 ngày" (chu kỳ hạn mức luôn 30 ngày); giá theo `days_per_order`
  (30 hay 365 ngày) như cũ.
- Màn hình chính: ở Free hiện "Dùng thử: còn N ngày" trước số phút còn lại hôm nay; hết dùng thử thì chỉ hiện câu đó.
  Phiên báo `trialEnded` có nút Nâng cấp, `licenseConflict` có nút mở Cài đặt › Bản quyền.
- Thanh báo: `license.notice.trialEnded` có nút tới Nâng cấp.
- Các bước lần đầu mở: bấm "Tiếp" ở bước Điều khoản thì gọi `startTrial`.

**Files:**
- Modify: `src/windows/main/Notice.tsx`
- Modify: `src/windows/main/onboarding/Onboarding.tsx`
- Modify: `src/windows/main/screens/Home.tsx`
- Modify: `src/windows/main/screens/UpgradeScreen.tsx`

- [ ] **Step 1: Viết code**

`src/windows/main/Notice.tsx`: thay

```tsx
  const openLoginItems = useApp((s) => s.openLoginItemsSettings);
  const canNavigate = useApp(canOpenScreens);
  // Lời nhắc bản quyền (kế hoạch 06): bản không chính hãng, giờ máy chỉnh lùi, lâu chưa kiểm được gói, hết hạn, sắp hết
  // hạn (7 ngày), bị thu hồi.
  const license = useLicense((s) => licenseNotice(s.view));
  const renewable = license === "license.notice.expired" || license === "license.notice.renewSoon";
  const update = useApp(updateInvite);
  const repromptsAfterUpdate = useApp(updateReprompts);
  const restartToUpdate = useApp((s) => s.restartToUpdate);
```

bằng

```tsx
  const openLoginItems = useApp((s) => s.openLoginItemsSettings);
  const canNavigate = useApp(canOpenScreens);
  // Lời nhắc bản quyền (kế hoạch 06): bản không chính hãng, giờ máy chỉnh lùi, lâu chưa kiểm được gói, hết hạn, sắp hết
  // hạn (7 ngày), bị thu hồi; key đang xung đột, hết dùng thử (spec 2026-10-07 §3.2, §4.2).
  const license = useLicense((s) => licenseNotice(s.view));
  const renewable =
    license === "license.notice.expired" ||
    license === "license.notice.renewSoon" ||
    license === "license.notice.trialEnded";
  const update = useApp(updateInvite);
  const repromptsAfterUpdate = useApp(updateReprompts);
  const restartToUpdate = useApp((s) => s.restartToUpdate);
```

`src/windows/main/onboarding/Onboarding.tsx`: thay

```tsx
  const index = useApp((s) => s.onboardingStep);
  const setStep = useApp((s) => s.setOnboardingStep);
  const finish = useApp((s) => s.finishOnboarding);
  const accepted = useApp((s) => s.termsAccepted);
  const title = useRef<HTMLHeadingElement>(null);
  const shown = useRef(index);
```

bằng

```tsx
  const index = useApp((s) => s.onboardingStep);
  const setStep = useApp((s) => s.setOnboardingStep);
  const finish = useApp((s) => s.finishOnboarding);
  const startTrial = useApp((s) => s.startTrial);
  const accepted = useApp((s) => s.termsAccepted);
  const title = useRef<HTMLHeadingElement>(null);
  const shown = useRef(index);
```

`src/windows/main/onboarding/Onboarding.tsx`: thay

```tsx
        <button disabled={current === 0} onClick={() => setStep(current - 1)}>
          {t("onboarding.back")}
        </button>
        <button className="primary" disabled={!canAdvance(step, accepted)} onClick={() => (last ? void finish() : setStep(current + 1))}>
          {t(last ? "onboarding.finish" : "onboarding.next")}
        </button>
      </div>
```

bằng

```tsx
        <button disabled={current === 0} onClick={() => setStep(current - 1)}>
          {t("onboarding.back")}
        </button>
        <button
          className="primary"
          disabled={!canAdvance(step, accepted)}
          onClick={() => {
            // Qua bước Điều khoản (đã đồng ý): đăng ký dùng thử chạy nền, vì request gửi mã băm ID máy (spec 2026-10-07 §3.2).
            if (step === "terms") void startTrial();
            if (last) void finish();
            else setStep(current + 1);
          }}
        >
          {t(last ? "onboarding.finish" : "onboarding.next")}
        </button>
      </div>
```

`src/windows/main/screens/Home.tsx`: thay

```tsx
import { levelToMeter } from "../../../store/app";
import { useApp, useT } from "../appStore";
import { useTranscript } from "../dataStores";
import { useLicense } from "../licenseStore";
import { QuotaSummary, when } from "../LicenseText";
import { LanguagePicker } from "../LanguagePicker";
```

bằng

```tsx
import { levelToMeter } from "../../../store/app";
import { useApp, useT } from "../appStore";
import { useTranscript } from "../dataStores";
import { trialKey } from "../../../lib/license";
import { useLicense } from "../licenseStore";
import { QuotaSummary, when } from "../LicenseText";
import { LanguagePicker } from "../LanguagePicker";
```

`src/windows/main/screens/Home.tsx`: thay

```tsx
};

// Màn hình chính (§4.3): bắt đầu/dừng, trạng thái và lỗi của phiên, ngôn ngữ, nguồn âm thanh, mức âm lượng, hạn mức còn
// lại kèm thời điểm reset (kế hoạch 06). Hết hạn mức thì báo thời điểm reset và có nút nâng gói (§4.2 bước 2).
export function Home() {
  const t = useT();
  const status = useApp((s) => s.status);
```

bằng

```tsx
};

// Màn hình chính (§4.3): bắt đầu/dừng, trạng thái và lỗi của phiên, ngôn ngữ, nguồn âm thanh, mức âm lượng, hạn mức còn
// lại kèm thời điểm reset (kế hoạch 06). Hết hạn mức thì báo thời điểm reset và có nút nâng gói (§4.2 bước 2). Ở Free có
// thêm số ngày dùng thử còn lại; hết dùng thử hay key đang xung đột thì có nút tới Nâng cấp hay Bản quyền (spec 2026-10-07
// §3.2, §4.2).
export function Home() {
  const t = useT();
  const status = useApp((s) => s.status);
```

`src/windows/main/screens/Home.tsx`: thay

```tsx
  const license = useLicense((s) => s.view);
  if (!status || !settings || !info) return null;
  const session = status.session;
  const notes: MessageKey[] = [];
  if (status.loading) notes.push(status.loading === "firstRun" ? "home.loading.firstRun" : "home.loading.model");
  if (status.cpuFallback) notes.push("home.cpuFallback");
```

bằng

```tsx
  const license = useLicense((s) => s.view);
  if (!status || !settings || !info) return null;
  const session = status.session;
  const trial = license && trialKey(license);
  const notes: MessageKey[] = [];
  if (status.loading) notes.push(status.loading === "firstRun" ? "home.loading.firstRun" : "home.loading.model");
  if (status.cpuFallback) notes.push("home.cpuFallback");
```

`src/windows/main/screens/Home.tsx`: thay

```tsx
            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
            )}
            {status.sessionError === "quotaExhausted" && (
              <>
                {status.quotaResetAt !== null && (
```

bằng

```tsx
            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
            )}
            {status.sessionError === "trialEnded" && (
              <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>
            )}
            {status.sessionError === "licenseConflict" && (
              <button onClick={() => navigate("settings", "license")}>{t("notice.openSettings")}</button>
            )}
            {status.sessionError === "quotaExhausted" && (
              <>
                {status.quotaResetAt !== null && (
```

`src/windows/main/screens/Home.tsx`: thay

```tsx
        {license && (
          <div className="row">
            <span>{t("home.minutesLeft")}</span>
            <QuotaSummary quota={license.quota} />
            {!status.pro && <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>}
          </div>
        )}
```

bằng

```tsx
        {license && (
          <div className="row">
            <span>{t("home.minutesLeft")}</span>
            {trial && <span>{t(trial, { days: license.trial.daysLeft })}</span>}
            {license.trial.status !== "ended" && <QuotaSummary quota={license.quota} />}
            {!status.pro && <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>}
          </div>
        )}
```

`src/windows/main/screens/UpgradeScreen.tsx`: thay

```tsx

const vnd = (amount: number) => `${amount.toLocaleString("vi-VN")} đ`;

// Màn hình Nâng cấp (§4.3): đủ 4 gói (giá lấy từ license server, không có mạng thì báo cần mạng), đánh dấu gói đang dùng.
// Chọn gói, nhập email, tick ô đồng ý xử lý email (§10.1), rồi quét mã VietQR vẽ ngay trong app (phía Rust vẽ SVG từ
// chuỗi `qr_code`), kèm nút mở trang thanh toán của PayOS. Đang có key thì đơn là gia hạn hay đổi gói; đổi gói thì hiện
// trước số ngày quy đổi và ngày hết hạn mới, ghi rõ không hoàn tiền. MVP chỉ nhận chuyển khoản từ ngân hàng Việt Nam.
```

bằng

```tsx

const vnd = (amount: number) => `${amount.toLocaleString("vi-VN")} đ`;

// Màn hình Nâng cấp (§4.3; spec 2026-10-07 §1): đủ 3 gói, Free dùng thử 10 ngày, Monthly 30 ngày, Yearly 365 ngày (giá
// và số ngày mỗi đơn lấy từ license server, không có mạng thì báo cần mạng), đánh dấu gói đang dùng.
// Chọn gói, nhập email, tick ô đồng ý xử lý email (§10.1), rồi quét mã VietQR vẽ ngay trong app (phía Rust vẽ SVG từ
// chuỗi `qr_code`), kèm nút mở trang thanh toán của PayOS. Đang có key thì đơn là gia hạn hay đổi gói; đổi gói thì hiện
// trước số ngày quy đổi và ngày hết hạn mới, ghi rõ không hoàn tiền. MVP chỉ nhận chuyển khoản từ ngân hàng Việt Nam.
```

`src/windows/main/screens/UpgradeScreen.tsx`: thay

```tsx
              <span>
                {p.quota_minutes_per_cycle === null
                  ? t("upgrade.unlimited")
                  : t("upgrade.hours", { hours: p.quota_minutes_per_cycle / 60, days: p.days_per_order })}
              </span>
              <span>{priceVnd(p) === null ? "" : t("upgrade.price", { price: vnd(priceVnd(p) ?? 0), days: p.days_per_order })}</span>
              {current === p.code && <span className="badge active">{t("upgrade.current")}</span>}
```

bằng

```tsx
              <span>
                {p.quota_minutes_per_cycle === null
                  ? t("upgrade.unlimited")
                  : t("upgrade.hours", { hours: p.quota_minutes_per_cycle / 60 })}
              </span>
              <span>{priceVnd(p) === null ? "" : t("upgrade.price", { price: vnd(priceVnd(p) ?? 0), days: p.days_per_order })}</span>
              {current === p.code && <span className="badge active">{t("upgrade.current")}</span>}
```

- [ ] **Step 2: Chạy test, thấy xanh**

```bash
pnpm test
```

Kết quả mong đợi: `Tests  167 passed (167)`.

- [ ] **Step 3: Định dạng và kiểm tĩnh**

```bash
pnpm build
```

Kết quả mong đợi: `tsc --noEmit` không báo lỗi, Vite in `✓ built in …`.

- [ ] **Step 4: Commit**

```bash
git add src/windows/main/Notice.tsx src/windows/main/onboarding/Onboarding.tsx src/windows/main/screens/Home.tsx src/windows/main/screens/UpgradeScreen.tsx
git commit -m "feat(ui): Nâng cấp ba gói, dòng dùng thử ở màn hình chính, đăng ký dùng thử sau bước Điều khoản

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 4: Cài đặt › Bản quyền: key đang dùng ở máy khác, vẫn kích hoạt, xung đột

Commit tham chiếu: `252fdc1`.

- Key vừa gõ đang dùng ở máy khác: danh sách máy với nút "Gỡ máy kia và dùng máy này" (như cũ), thêm "Vẫn kích hoạt trên
  máy này" có bước xác nhận ("Key sẽ bị tạm khóa trên cả hai máy…").
- Đang xung đột: thẻ báo lỗi, danh sách hai máy ("Máy này" cho máy này, theo `thisActivationId`), nút "Gỡ key khỏi máy
  này" ở dòng máy này, "Gỡ máy kia" ở dòng còn lại, và "Thử lại" (`validate`).

**Files:**
- Modify: `src/windows/main/settings/LicenseSettings.tsx`

- [ ] **Step 1: Viết code**

`src/windows/main/settings/LicenseSettings.tsx`: thay

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
```

bằng

```tsx
import { useState } from "react";
import { errorKey } from "../../../i18n";
import { deviceName, isRenewal, isThisMachine } from "../../../lib/license";
import { useApp, useT } from "../appStore";
import { useLicense } from "../licenseStore";
import { PlanName, QuotaSummary, when } from "../LicenseText";

// Nhóm Cài đặt "Bản quyền" (§4.3): gói đang dùng, tình trạng, ngày hết hạn, hạn mức còn lại của chu kỳ; nhập key; gia
// hạn hay đổi gói (mở màn hình Nâng cấp); gỡ kích hoạt. Mỗi key chỉ dùng trên 1 máy (spec 2026-10-07 §4.2): key vừa gõ
// đang dùng ở máy khác thì hiện máy đó, cho gỡ máy đó hay "Vẫn kích hoạt" (hỏi xác nhận vì sẽ khóa cả hai máy); key đang
// xung đột thì hiện hai máy, cho gỡ key khỏi máy này, gỡ máy kia, hay thử lại. Key chỉ hiện dạng đã che; key đầy đủ nằm
// trong email, có nút gửi lại key qua email.
export function LicenseSettings() {
  const t = useT();
  const navigate = useApp((s) => s.navigate);
```

`src/windows/main/settings/LicenseSettings.tsx`: thay

```tsx
  const error = useLicense((s) => s.error);
  const busy = useLicense((s) => s.busy);
  const activate = useLicense((s) => s.activate);
  const deactivateOther = useLicense((s) => s.deactivateOther);
  const deactivate = useLicense((s) => s.deactivate);
  const validate = useLicense((s) => s.validate);
  const recover = useLicense((s) => s.recover);
```

bằng

```tsx
  const error = useLicense((s) => s.error);
  const busy = useLicense((s) => s.busy);
  const activate = useLicense((s) => s.activate);
  const activateAnyway = useLicense((s) => s.activateAnyway);
  const deactivateOther = useLicense((s) => s.deactivateOther);
  const removeOtherMachine = useLicense((s) => s.removeOtherMachine);
  const deactivate = useLicense((s) => s.deactivate);
  const validate = useLicense((s) => s.validate);
  const recover = useLicense((s) => s.recover);
```

`src/windows/main/settings/LicenseSettings.tsx`: thay

```tsx
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!view) return null;
  return (
    <>
      <div className="card">
```

bằng

```tsx
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [anyway, setAnyway] = useState(false);
  if (!view) return null;
  const conflict = view.standing === "conflict" ? view.conflict : null;
  return (
    <>
      <div className="card">
```

`src/windows/main/settings/LicenseSettings.tsx`: thay

```tsx
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
```

bằng

```tsx
                  </li>
                ))}
              </ul>
              <div className="row">
                {!anyway && <button onClick={() => setAnyway(true)}>{t("settings.license.anyway")}</button>}
                {anyway && (
                  <>
                    <span className="error-text">{t("settings.license.anyway.confirm")}</span>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        setAnyway(false);
                        void activateAnyway(key);
                      }}
                    >
                      {t("settings.license.anyway.yes")}
                    </button>
                    <button onClick={() => setAnyway(false)}>{t("common.cancel")}</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {conflict && (
        <div className="card" role="alert">
          <p className="error-text">{t("settings.license.conflict")}</p>
          <ul className="devices">
            {conflict.devices.map((d) => (
              <li key={d.activation_id} className="row">
                <span>
                  {isThisMachine(conflict, d)
                    ? t("settings.license.conflict.thisMachine")
                    : deviceName(d, t("settings.license.devices.unnamed"))}
                </span>
                {d.last_validated_at !== null && (
                  <span className="hint">{t("settings.license.devices.lastUsed", { time: when(d.last_validated_at) })}</span>
                )}
                {isThisMachine(conflict, d) ? (
                  <button disabled={busy} onClick={() => void deactivate()}>
                    {t("settings.license.conflict.leave")}
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => void removeOtherMachine(d.activation_id)}>
                    {t("settings.license.conflict.removeOther")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="row">
            <button disabled={busy} onClick={() => void validate()}>
              {t("settings.license.conflict.retry")}
            </button>
          </div>
        </div>
      )}
      <div role="alert">{error && <p className="error-text">{t(errorKey(error.code))}</p>}</div>
      {view.key && (
        <div className="card">
```

- [ ] **Step 2: Chạy test, thấy xanh**

```bash
pnpm test
```

Kết quả mong đợi: `Tests  167 passed (167)`.

- [ ] **Step 3: Định dạng và kiểm tĩnh**

```bash
pnpm build
```

Kết quả mong đợi: `tsc --noEmit` không báo lỗi, Vite in `✓ built in …`.

- [ ] **Step 4: Commit**

```bash
git add src/windows/main/settings/LicenseSettings.tsx
git commit -m "feat(ui): Bản quyền: key đang dùng ở máy khác, vẫn kích hoạt, trạng thái xung đột

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 5: Bộ kiểm cuối của 02 (Rust và giao diện)

Không sửa code.

- [ ] **Step 1: Bộ kiểm đầy đủ**

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
sh scripts/check-windows.sh
cargo test --workspace
pnpm test
pnpm build
```

Kết quả mong đợi: `cargo fmt` không in gì; clippy kết thúc bằng `Finished`, không có `error:`; mọi dòng `test result` đều `ok` (lib của app `479 passed; 0 failed; 3 ignored` (sau Task 8 của 02a)); `Tests  167 passed (167)`; Vite in `✓ built in …`.

- [ ] **Step 2: Không còn mã gói, câu chữ cũ**

```bash
git grep -nE "pro_x2|pro_x5|ProX|device_limit|DeviceLimit|\"plan\.pro|Professional|10 phút mỗi ngày|10 minutes a day|2 máy của key|2 computers of this key" -- src src-tauri
```

Kết quả mong đợi: không in gì.

- [ ] **Step 3: Thử tay** ở kế hoạch 03, sau khi server production có `/v1/trial` và luật một máy (trước đó bản dev gọi `/v1/trial` sẽ nhận `404`, nên Free báo "Cần kết nối mạng một lần để bắt đầu dùng thử"; muốn xem giao diện gói trả phí thì dùng công tắc `AI_TRANSLATOR_DEV_PRO=true`).

---

## Đối chiếu với spec (tự review)

| Spec 2026-10-07 | Task |
|---|---|
| §3.2 màn hình chính "Dùng thử: còn N ngày · Hôm nay còn X phút" | 1 (`trialKey`, `trial.active`), 3 |
| §3.2 hết dùng thử: màn hình chính và thanh phụ đề báo, nút Nâng cấp | 1 (`license.notice.trialEnded`, `overlay.note.trialEnded`), 3 |
| §3.2 chưa có token mà offline: "Cần kết nối mạng một lần để bắt đầu dùng thử" | 1 (`trial.none`, `error.trialNeedsNetwork` ở 02a) |
| §3.2 đăng ký ngay sau bước điều khoản | 2 (`startTrial`), 3 |
| §4.2 hộp thoại `key_in_use`: gỡ máy kia / vẫn kích hoạt có xác nhận | 2 (`activateAnyway`), 4 |
| §4.2 xung đột ở màn hình chính và Cài đặt › Bản quyền: hai máy, gỡ khỏi máy này, gỡ máy kia, thử lại | 1 (`license.notice.conflict`, `isThisMachine`), 2 (`removeOtherMachine`), 4 |
| §4.2 phiên dừng với `licenseConflict` | 1 (`overlay.note.licenseConflict`), 3 (nút mở Bản quyền) |
| §6 bảng lỗi | 02a (mã, câu báo), 1, 3 |
| §9 giao diện: Nâng cấp ba gói và thời hạn, dòng dùng thử, `key_in_use`, xung đột, i18n đủ khóa | 1–4 (Vitest cho phần thuần và store; thành phần React kiểm bằng `tsc`) |
