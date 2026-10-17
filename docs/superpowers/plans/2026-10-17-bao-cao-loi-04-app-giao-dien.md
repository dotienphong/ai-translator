# Báo cáo lỗi 04: app, giao diện — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phần giao diện của tính năng báo cáo lỗi: ô **tích sẵn** "Gửi báo cáo lỗi tự động cho nhà phát triển" ở bước Điều khoản của onboarding (không bắt buộc, lưu khi bấm Tiếp), công tắc **Gửi báo cáo lỗi tự động** ở Cài đặt › Quyền riêng tư, nút **Gửi log cho hỗ trợ** ở Giới thiệu (hiện mã báo cáo `R-XXXX-XXXX`, nút sao chép mã, và câu lỗi), câu `about.logsHint` mới nói đúng sự thật, tất cả bằng 5 ngôn ngữ (vi, en, ja, zh, ko).

**Architecture:** Không có màn hình mới. `ipc.ts` thêm khóa cài đặt `sendErrorReports` và lệnh `send_log_report`; store `app.ts` thêm `errorReportsConsent` (ô tích của onboarding) và `logReport` (đang gửi, đã gửi kèm mã, lỗi kèm mã lỗi) cùng bốn hành động; ba component (`Onboarding.tsx`, `PrivacySettings.tsx`, `About.tsx`) chỉ nối vào store. Kiểm bằng hai lớp, đúng nếp của repo: vitest cho store (môi trường `node`, không dựng component) và `scripts/ui-preview/check-i18n.mjs` cho DOM thật trong Chrome không đầu (5 ngôn ngữ, hai cỡ cửa sổ, chữ không tràn ô), chạy trên trang xem trước có IPC giả (`tauri-mock.ts`).

**Tech Stack:** React 19.3, TypeScript 7 (`strict`), zustand 5, vitest 5, Vite 8 (trang xem trước), Chrome không đầu qua `website/tools/browser/cdp.mjs` (không thêm thư viện). **Không cài thêm phụ thuộc nào** (CLAUDE.md, quy tắc phiên bản thư viện: kế hoạch này không đụng `package.json`).

**Spec:** `docs/superpowers/specs/2026-10-17-diagnostics-reports-design.md` (mục 0, 5, 7). Đọc spec trước khi làm.

**Quy tắc chung cho mọi task:**
- Làm trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports` (nhánh `diagnostics-reports`). **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** vì shell reset thư mục sau mỗi lệnh.
- **Không merge, không push, không deploy.** Kế hoạch này không đụng Rust, `server/`, `website/` hay `docs/legal/` (kế hoạch 03, 01, 05).
- Mã TypeScript phải qua `pnpm exec tsc --noEmit` (`strict`; `tsconfig.json` có cả `scripts/ui-preview/tauri-mock.ts`, nên đổi kiểu ở `ipc.ts` thì mock cũng phải đổi trong cùng task). Chú thích trong mã bằng tiếng Việt, theo giọng các file kế bên.
- Mọi chuỗi giao diện đi qua `t(...)` và có đủ ở **cả 5 từ điển** (`src/i18n/{en,vi,ja,zh,ko}.ts`); `dictionaries.test.ts` đòi cùng bộ khóa. Bản dịch là bản thật, theo thuật ngữ sẵn có của từng ngôn ngữ (ja: 話した内容, サポート; zh: 说话内容, 客服; ko: 말한 내용, 지원팀).
- Code đã được chạy thật (tsc, vitest, `check-i18n.mjs` ở cả 5 ngôn ngữ) trên bản sao của repo; chép nguyên văn.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

**Thứ tự với các kế hoạch khác:**
- Kế hoạch 03 (lõi Rust) độc lập về mã với kế hoạch này, làm trước hay sau đều được. **Ngoại lệ:** ba câu lỗi `error.reportFailed`, `error.reportRateLimited`, `error.reportRejected` do **kế hoạch 03 Task 9** thêm (test Rust `every_error_code_has_ui_text` buộc chúng nằm cùng task với ba mã lỗi). Kế hoạch này chỉ **dùng** chúng (`errorKey(code)`); Task 7 (kiểm ba câu lỗi trong DOM) cần Task 9 đó đã xong, không thì `errorKey` rơi về `error.unknown`.
- Kế hoạch 05 (pháp lý, website) **trích nguyên văn** hai nhãn ở bảng dưới và có test chặn các câu cũ "log chỉ nằm trên máy / bạn tự gửi" ở `src/i18n`; Task 7 của kế hoạch này nêu cách chụp lại ảnh cho **kế hoạch 05 Task 5**.

## Hợp đồng (kế hoạch 03 và 05 dựa vào đây, đừng đổi khi chưa sửa cả ba)

| Điều | Giá trị |
|---|---|
| Lệnh Tauri | `send_log_report` không tham số; trả `{ id: string }` (mã `R-XXXX-XXXX`) hay lỗi `CommandError` có `code` ∈ `reportFailed`, `reportRateLimited`, `reportRejected` |
| Khóa cài đặt | `sendErrorReports: boolean` (camelCase như mọi khóa của `Settings`) |
| Câu lỗi | `error.<code>` của ba mã trên: kế hoạch 03 Task 9 |
| Nhãn **nút** ở Giới thiệu (`about.sendLogs`) | vi **Gửi log cho hỗ trợ** · en **Send log to support** · ja ログをサポートに送信 · zh 向客服发送日志 · ko 지원팀에 로그 보내기 |
| Nhãn **công tắc** ở Cài đặt › Quyền riêng tư (`settings.privacy.errorReports`) | vi **Gửi báo cáo lỗi tự động** · en **Send error reports automatically** · ja エラーレポートを自動送信 · zh 自动发送错误报告 · ko 오류 보고서 자동 전송 |
| `about.logsHint` (vi, en) | **không** chứa các cụm cũ mà kế hoạch 05 Task 9 chặn: "log chỉ nằm trên máy", "bạn tự gửi cho chúng tôi", "không tự gửi báo cáo", "logs stay on this computer", "you send them to us yourself"… |
| Mã báo cáo mẫu của trang xem trước | `R-7F3K-92QD` (`tauri-mock.ts`) |

Hai nhãn của vi và en ở bảng là chuỗi mà kế hoạch 05 Task 0 Step 4 `grep` trong `src/i18n/vi.ts`, `en.ts`: đừng đổi chữ.

**Khóa i18n mới (10), mỗi khóa ở cả 5 ngôn ngữ, và 1 khóa sửa:**

| Khóa | Chỗ dùng |
|---|---|
| `onboarding.terms.reports`, `onboarding.terms.reports.hint` | Ô tích sẵn và câu giải thích dưới nó, bước Điều khoản |
| `settings.privacy.errorReports`, `settings.privacy.errorReports.hint` | Công tắc và mô tả, Cài đặt › Quyền riêng tư |
| `about.sendLogs`, `about.sendLogs.sending` | Nút Gửi log cho hỗ trợ (bình thường, đang gửi) |
| `about.sendLogs.sent`, `about.sendLogs.codeHint` | Dòng "Đã gửi. Mã báo cáo: …" và lời dặn đọc mã cho hỗ trợ |
| `about.sendLogs.copy`, `about.sendLogs.copied` | Nút Sao chép mã và dòng xác nhận |
| `about.logsHint` (sửa) | Câu giải thích dưới tiêu đề nhóm log ở Giới thiệu |

## Quyết định của kế hoạch này (spec không nêu; chọn thay chủ dự án, nêu lý do)

1. **Ô ở onboarding không bắt buộc và chỉ lưu khi bấm Tiếp.** `canAdvance` vẫn chỉ đòi ô đồng ý Chính sách. Lựa chọn nằm trong state `errorReportsConsent` (mặc định `true` = tích sẵn) và ghi vào cài đặt ở lần bấm Tiếp của bước Điều khoản (`saveErrorReportsConsent`), **trước** bước tải model vì lỗi có thể xảy ra từ đó (spec §5). Lưu không được thì lỗi hiện ở thanh báo lỗi chung và onboarding vẫn đi tiếp: cài đặt giữ `false`, tức không gửi gì (an toàn).
2. **Hạn chế đã biết:** `sendErrorReports` là boolean nên giao diện không phân biệt "chưa hỏi" với "đã từ chối"; nếu onboarding mở lại thì ô lại tích sẵn (chỉ đổi cài đặt nếu người dùng bấm Tiếp lại).
3. **Lỗi của nút Gửi log nằm trong `logReport`, không lên thanh báo lỗi chung** (`error`): Giới thiệu hiện câu lỗi ngay dưới nút. Lỗi không phải `CommandError` (ví dụ bị ACL chặn: chuỗi) thành mã `unknown`.
4. **Chống bấm đúp:** đang `sending` thì `sendLogReport` không gửi lệnh thứ hai và nút bị khóa.
5. **Vùng kết quả `role="status"` luôn có trong DOM** (nội dung chèn vào sau) để trình đọc màn hình đọc được mã báo cáo hay lỗi.
6. **Sao chép mã dùng lại `writeClipboard`** của `dataStores.ts` (chỉ thêm `export`); lỗi chép dùng câu `error.copyFailed` sẵn có.
7. **`fakeIpc.ts` không cần đổi:** nó nhận bản đồ lệnh theo kiểu `Commands` của `ipc.ts`, và mỗi test chỉ khai các lệnh nó dùng.
8. **`check-i18n.mjs` được mở rộng thay vì viết script mới** và có thêm biến `ONLY` (tiền tố tên màn hình) để chạy nhanh một màn hình.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `src/lib/ipc.ts` | `Settings.sendErrorReports`, lệnh `send_log_report` |
| Modify `src/store/app.ts` | `LogReportState`, `errorReportsConsent`, `logReport`, bốn hành động |
| Modify `src/store/app.test.ts` | Tám test mới, cập nhật literal `settings` và IPC giả |
| Modify `scripts/ui-preview/tauri-mock.ts` | `sendErrorReports`, lệnh giả `send_log_report`, tham số URL `reports=0`, `report=` |
| Modify `src/i18n/{en,vi,ja,zh,ko}.ts` | Mười khóa mới, sửa `about.logsHint` |
| Modify `scripts/ui-preview/check-i18n.mjs` | Điều kiện DOM cho ba màn hình, bấm thật, biến `ONLY` |
| Modify `src/windows/main/onboarding/Onboarding.tsx` | Ô tích sẵn ở bước Điều khoản |
| Modify `src/windows/main/settings/PrivacySettings.tsx` | Công tắc |
| Modify `src/windows/main/screens/About.tsx`, `src/windows/main/dataStores.ts`, `src/styles/main.css` | Nút Gửi log, mã báo cáo, Sao chép, lỗi; `export writeClipboard`; kiểu dáng |

---

### Task 0: Mốc xuất phát

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh, cài phụ thuộc, và Chrome (cho `check-i18n.mjs`)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git branch --show-current
```
Expected: `diagnostics-reports`

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm install --frozen-lockfile
```
Expected: kết thúc không lỗi.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && test -d "/Applications/Google Chrome.app" && echo có
```
Expected: `có`. Không thấy Chrome thì đặt biến `CHROME=<đường dẫn tới Chrome>` cho mọi lệnh `node scripts/ui-preview/…` dưới đây (`cdp.mjs` đọc biến này).

- [ ] **Step 2: Mốc tsc và vitest**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run 2>&1 | tail -6
```
Expected: `Test Files  24 passed (24)` và `Tests  289 passed (289)`. Task 8 đòi 297. Có test đỏ **trước** khi sửa gì thì dừng lại và báo.

- [ ] **Step 3: Mốc giao diện (lỗi có sẵn, không do kế hoạch này)**

Chạy Vite của trang xem trước ở cổng 1431 (IPC giả, không cần app thật) **ở nền** và đợi nó lên; ghi nhớ bạn đã mở nó để tắt ở Task 8:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vite --config scripts/ui-preview/vite.config.ts --port 1431
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1431/
```
Expected: `200`. Cổng bận thì Vite báo lỗi và thoát: dừng lại, đừng tắt tiến trình không phải của bạn.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node scripts/ui-preview/check-i18n.mjs vi en 2>&1 | tail -15
```
Expected: `Đạt: vi, en. Ảnh ở …/target/ui-preview/ui-ja-zh-ko`. Mất vài phút. Nếu có điều kiện sai thì chép danh sách ra làm mốc: đó là lỗi có sẵn, các task sau chỉ cần không thêm lỗi mới.

---

### Task 1: Kiểu IPC, store, và trang xem trước (test store trước)

**Files:**
- Modify (test): `src/store/app.test.ts`
- Modify: `src/lib/ipc.ts`, `src/store/app.ts`, `scripts/ui-preview/tauri-mock.ts`

Store thêm hai mảnh trạng thái và bốn hành động:
- `errorReportsConsent` (mặc định `true`) với `setErrorReportsConsent`, và `saveErrorReportsConsent()` ghi `sendErrorReports` vào cài đặt qua `updateSettings` (lỗi đi theo đường báo lỗi chung của `updateSettings`).
- `logReport`: `idle` → `sending` → `sent { id }` hay `failed { code }`, với `sendLogReport()` (chặn bấm đúp; lỗi vào `logReport`, không vào `error` chung) và `dismissLogReport()`.

`tsconfig.json` có cả `tauri-mock.ts`, nên kiểu mới của `ipc.ts` buộc mock đổi cùng task: `Settings` đòi `sendErrorReports`, và bản đồ lệnh đòi `send_log_report`.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src/store/app.test.ts`: literal `settings` thêm `sendErrorReports: false`, IPC giả nhận lệnh `send_log_report` (kết quả chọn bằng `reportOutcome`, tạm hoãn bằng `reportGate`), và tám test mới (tính cả ba ca của `it.each`):

Trong `src/store/app.test.ts`, tìm đoạn (duy nhất trong file):

```ts
  saveHistory: false,
  launchAtLogin: false,
  theme: "system",
```

và thay bằng:

```ts
  saveHistory: false,
  sendErrorReports: false,
  launchAtLogin: false,
  theme: "system",
```

Trong `src/store/app.test.ts`, tìm đoạn (duy nhất trong file):

```ts
let failRestart = false;

function setup() {
```

và thay bằng:

```ts
let failRestart = false;
// `send_log_report`: "ok" trả mã báo cáo; còn lại là ba lỗi của lệnh thật, hay lỗi ACL (chuỗi, không phải CommandError).
let reportOutcome: "ok" | "reportFailed" | "reportRateLimited" | "reportRejected" | "acl" = "ok";
let reportGate: Promise<void> | null = null;

function setup() {
```

Trong `src/store/app.test.ts`, tìm đoạn (duy nhất trong file):

```ts
  failRestart = false;
  const fake = fakeIpc({
    get_settings: () => settings,
```

và thay bằng:

```ts
  failRestart = false;
  reportOutcome = "ok";
  reportGate = null;
  const fake = fakeIpc({
    get_settings: () => settings,
```

Trong `src/store/app.test.ts`, tìm đoạn (duy nhất trong file):

```ts
    start_trial: () => null,
    open_login_items_settings: () => {
      if (failLoginItems) throw { code: "openFailed", field: null, message: "…" };
```

và thay bằng:

```ts
    start_trial: () => null,
    send_log_report: async () => {
      await reportGate;
      if (reportOutcome === "acl") throw "Command send_log_report not allowed by ACL";
      if (reportOutcome !== "ok") throw { code: reportOutcome, field: null, message: "…" };
      return { id: "R-7F3K-92QD" };
    },
    open_login_items_settings: () => {
      if (failLoginItems) throw { code: "openFailed", field: null, message: "…" };
```

Trong `src/store/app.test.ts`, ngay sau đoạn này (duy nhất trong file):

```ts
    expect(updateInvite(store.getState())).toBe("0.2.0");
  });
```

thêm nguyên văn:

```ts
  // ---- Báo cáo lỗi (spec 2026-10-17 §5) ----

  it("ô tích báo cáo lỗi ở bước Điều khoản tích sẵn, và đổi được", () => {
    const { store } = setup();
    expect(store.getState().errorReportsConsent).toBe(true);
    store.getState().setErrorReportsConsent(false);
    expect(store.getState().errorReportsConsent).toBe(false);
    store.getState().setErrorReportsConsent(true);
    expect(store.getState().errorReportsConsent).toBe(true);
  });

  it("qua bước Điều khoản thì lưu đúng lựa chọn của ô tích vào sendErrorReports", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    await store.getState().saveErrorReportsConsent();
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { sendErrorReports: true } } });
    expect(store.getState().settings?.sendErrorReports).toBe(true);
    store.getState().setErrorReportsConsent(false);
    await store.getState().saveErrorReportsConsent();
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { sendErrorReports: false } } });
    expect(store.getState().settings?.sendErrorReports).toBe(false);
  });

  it("lưu lựa chọn báo cáo lỗi lỗi thì báo lỗi, cài đặt giữ nguyên (không gửi gì)", async () => {
    const failing = createAppStore(
      fakeIpc({
        get_settings: () => settings,
        get_app_status: () => status,
        get_app_info: () => info,
        update_settings: () => {
          throw { code: "unknown", field: null, message: "…" };
        },
      }).ipc,
    );
    await failing.getState().init();
    await failing.getState().saveErrorReportsConsent();
    expect(failing.getState().error).toEqual({ code: "unknown", field: null });
    expect(failing.getState().settings?.sendErrorReports).toBe(false);
  });

  it("Gửi log cho hỗ trợ: đang gửi rồi ra mã báo cáo; bấm đúp khi đang gửi không gửi lệnh thứ hai", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    let open!: () => void;
    reportGate = new Promise<void>((resolve) => (open = resolve));
    const first = store.getState().sendLogReport();
    expect(store.getState().logReport).toEqual({ status: "sending" });
    await store.getState().sendLogReport();
    open();
    await first;
    expect(store.getState().logReport).toEqual({ status: "sent", id: "R-7F3K-92QD" });
    expect(fake.calls.filter((c) => c.cmd === "send_log_report")).toHaveLength(1);
    expect(store.getState().error).toBeNull();
  });

  it.each(["reportFailed", "reportRateLimited", "reportRejected"] as const)(
    "Gửi log cho hỗ trợ lỗi %s: lỗi nằm trong trạng thái của nút, không lên thanh báo lỗi chung",
    async (code) => {
      const { store } = setup();
      await store.getState().init();
      reportOutcome = code;
      await store.getState().sendLogReport();
      expect(store.getState().logReport).toEqual({ status: "failed", code });
      expect(store.getState().error).toBeNull();
    },
  );

  it("Gửi log lỗi không phải CommandError (bị ACL chặn) thì mã là unknown; gửi lại thành công thì xóa lỗi; dismiss về idle", async () => {
    const { store } = setup();
    await store.getState().init();
    reportOutcome = "acl";
    await store.getState().sendLogReport();
    expect(store.getState().logReport).toEqual({ status: "failed", code: "unknown" });
    reportOutcome = "ok";
    await store.getState().sendLogReport();
    expect(store.getState().logReport).toEqual({ status: "sent", id: "R-7F3K-92QD" });
    store.getState().dismissLogReport();
    expect(store.getState().logReport).toEqual({ status: "idle" });
  });
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run src/store/app.test.ts 2>&1 | tail -12
```
Expected: 8 test mới `failed` (`setErrorReportsConsent is not a function`, `saveErrorReportsConsent is not a function`, `sendLogReport is not a function`…); các test cũ vẫn `passed`.

- [ ] **Step 3: Kiểu IPC**

Trong `src/lib/ipc.ts`, tìm đoạn (duy nhất trong file):

```ts
  saveHistory: boolean;
  launchAtLogin: boolean;
  theme: Theme;
```

và thay bằng:

```ts
  saveHistory: boolean;
  // Gửi báo cáo lỗi tự động cho nhà phát triển (spec 2026-10-17 §5). Cài mới: `false` cho tới khi qua bước Điều khoản (ô tích sẵn);
  // người dùng đã cài từ trước: `true` sau khi cập nhật. Bản debug vẫn không tự gửi trừ khi bật công tắc dev.
  sendErrorReports: boolean;
  launchAtLogin: boolean;
  theme: Theme;
```

Trong `src/lib/ipc.ts`, tìm đoạn (duy nhất trong file):

```ts
  restart_to_update: { args: undefined; result: null };
  hide_overlay: { args: undefined; result: null };
  begin_overlay_resize: { args: { edge: ResizeEdge }; result: null };
```

và thay bằng:

```ts
  restart_to_update: { args: undefined; result: null };
  // Nút "Gửi log cho hỗ trợ" ở Giới thiệu (spec 2026-10-17 §1, §5): dựng và gửi báo cáo ngay, kể cả khi tắt báo cáo tự động. Trả mã
  // báo cáo để người dùng đọc cho hỗ trợ. Lỗi: `reportFailed` (mạng hỏng), `reportRateLimited` (gửi quá nhiều), `reportRejected`.
  send_log_report: { args: undefined; result: { id: string } };
  hide_overlay: { args: undefined; result: null };
  begin_overlay_resize: { args: { edge: ResizeEdge }; result: null };
```

- [ ] **Step 4: Store**

Trong `src/store/app.ts`, tìm đoạn (duy nhất trong file):

```ts
  field: string | null;
}

// Mức âm lượng (RMS 0–1) ra độ dài thanh đo 0–1, theo dBFS từ −60 dB tới 0 dB: tiếng nói bình thường (−30 tới −10 dBFS)
```

và thay bằng:

```ts
  field: string | null;
}

// Kết quả nút "Gửi log cho hỗ trợ" ở Giới thiệu (spec 2026-10-17 §5). Lỗi nằm ngay trong trạng thái, không lên thanh báo lỗi
// chung: Giới thiệu hiện câu lỗi dưới nút.
export type LogReportState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; id: string }
  | { status: "failed"; code: string };

// Mức âm lượng (RMS 0–1) ra độ dài thanh đo 0–1, theo dBFS từ −60 dB tới 0 dB: tiếng nói bình thường (−30 tới −10 dBFS)
```

Trong `src/store/app.ts`, tìm đoạn (duy nhất trong file):

```ts
  termsAccepted: boolean;
  error: UiError | null;
  notice: AppNotice | null;
```

và thay bằng:

```ts
  termsAccepted: boolean;
  // Ô "Tự động gửi báo cáo lỗi" ở bước Điều khoản (spec 2026-10-17 §5): tích sẵn; chỉ trong phiên onboarding, lưu vào cài đặt
  // (`sendErrorReports`) khi bấm Tiếp (`saveErrorReportsConsent`).
  errorReportsConsent: boolean;
  logReport: LogReportState;
  error: UiError | null;
  notice: AppNotice | null;
```

Trong `src/store/app.ts`, tìm đoạn (duy nhất trong file):

```ts
  setTermsAccepted(accepted: boolean): void;
  updateSettings(patch: SettingsPatch): Promise<boolean>;
  setSourceLanguage(lang: Lang, on: boolean): Promise<void>;
```

và thay bằng:

```ts
  setTermsAccepted(accepted: boolean): void;
  setErrorReportsConsent(consent: boolean): void;
  // Qua bước Điều khoản: lưu lựa chọn của ô tích vào cài đặt. Lỗi hiện ở thanh báo lỗi và không chặn các bước (chưa lưu được thì
  // cài đặt giữ `false`: không gửi gì).
  saveErrorReportsConsent(): Promise<void>;
  updateSettings(patch: SettingsPatch): Promise<boolean>;
  setSourceLanguage(lang: Lang, on: boolean): Promise<void>;
```

Trong `src/store/app.ts`, tìm đoạn (duy nhất trong file):

```ts
  openLogDir(): Promise<void>;
  openTaskbarSettings(): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
```

và thay bằng:

```ts
  openLogDir(): Promise<void>;
  // Gửi báo cáo lỗi ngay (kể cả khi tắt tự động); chặn bấm đúp. Kết quả ở `logReport`.
  sendLogReport(): Promise<void>;
  dismissLogReport(): void;
  openTaskbarSettings(): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
```

Trong `src/store/app.ts`, tìm đoạn (duy nhất trong file):

```ts
      termsAccepted: false,
      error: null,
      notice: null,
```

và thay bằng:

```ts
      termsAccepted: false,
      errorReportsConsent: true,
      logReport: { status: "idle" },
      error: null,
      notice: null,
```

Trong `src/store/app.ts`, tìm đoạn (duy nhất trong file):

```ts
        set({ termsAccepted });
      },
```

và thay bằng:

```ts
        set({ termsAccepted });
      },

      setErrorReportsConsent(errorReportsConsent) {
        set({ errorReportsConsent });
      },

      async saveErrorReportsConsent() {
        await get().updateSettings({ sendErrorReports: get().errorReportsConsent });
      },
```

Trong `src/store/app.ts`, tìm đoạn (duy nhất trong file):

```ts
          () => ipc.invoke("open_log_dir"),
          () => {},
        );
      },
```

và thay bằng:

```ts
          () => ipc.invoke("open_log_dir"),
          () => {},
        );
      },

      async sendLogReport() {
        if (get().logReport.status === "sending") return;
        set({ logReport: { status: "sending" } });
        try {
          const { id } = await ipc.invoke("send_log_report");
          set({ logReport: { status: "sent", id } });
        } catch (e) {
          set({ logReport: { status: "failed", code: toUiError(e).code } });
        }
      },

      dismissLogReport() {
        set({ logReport: { status: "idle" } });
      },
```

- [ ] **Step 5: Trang xem trước (IPC giả)**

`sendErrorReports` mặc định bật, trừ khi đang ở onboarding (cài mới chưa qua bước Điều khoản thì tắt) hay có `reports=0`; lệnh giả `send_log_report` trả mã mẫu sau nửa giây, hay một trong ba lỗi theo `report=failed|ratelimited|rejected`:

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
//   overlay (overlay.html): locked=1  source=0  text=<màu>  bg=<màu>  opacity=<0–1>  size=<px>  latest=1  notes=<note,…>
//   dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6): tws=0 (tắt công tắc)  slow=1 (máy chưa đủ nhanh)
//     overlay.html: live=alone|extends|final|provisional (mẫu dòng đang nói, xem `LIVE_SAMPLE`; cần session=running)
```

và thay bằng:

```ts
//   overlay (overlay.html): locked=1  source=0  text=<màu>  bg=<màu>  opacity=<0–1>  size=<px>  latest=1  notes=<note,…>
//   báo cáo lỗi (spec 2026-10-17 §5): reports=0 (người dùng đã tắt báo cáo lỗi tự động; không có thì bật, trừ khi đang ở onboarding:
//     cài mới chưa qua bước Điều khoản thì tắt)  report=ok|failed|ratelimited|rejected (kết quả nút "Gửi log cho hỗ trợ" ở Giới thiệu)
//   dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6): tws=0 (tắt công tắc)  slow=1 (máy chưa đủ nhanh)
//     overlay.html: live=alone|extends|final|provisional (mẫu dòng đang nói, xem `LIVE_SAMPLE`; cần session=running)
```

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
  saveHistory: param("history") !== "0",
  launchAtLogin: true,
  theme: param("theme", "light") as Settings["theme"],
```

và thay bằng:

```ts
  saveHistory: param("history") !== "0",
  sendErrorReports: !q.has("onboarding") && param("reports") !== "0",
  launchAtLogin: true,
  theme: param("theme", "light") as Settings["theme"],
```

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
    pendingOrder = null;
    return null;
  },
  check_for_updates: async () => {
    changeStatus({ updateCheck: "checking" });
```

và thay bằng:

```ts
    pendingOrder = null;
    return null;
  },
  // Nút "Gửi log cho hỗ trợ": trả mã báo cáo sau nửa giây, hay đúng ba lỗi của lệnh thật theo `report=`.
  send_log_report: async () => {
    await wait(500);
    const codes: Record<string, string> = { failed: "reportFailed", ratelimited: "reportRateLimited", rejected: "reportRejected" };
    const code = codes[param("report", "ok")];
    if (code) throw { code, field: null, message: "…" };
    return { id: "R-7F3K-92QD" };
  },
  check_for_updates: async () => {
    changeStatus({ updateCheck: "checking" });
```

- [ ] **Step 6: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run src/store/app.test.ts 2>&1 | tail -12
```
Expected: mọi test `passed` (gồm tám test mới).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run 2>&1 | tail -6
```
Expected: `Tests  297 passed (297)`.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src/lib/ipc.ts src/store scripts/ui-preview/tauri-mock.ts && git commit -m "feat(app): store và kiểu IPC cho báo cáo lỗi, trang xem trước có lệnh giả" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chuỗi giao diện ở 5 ngôn ngữ

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/vi.ts`, `src/i18n/ja.ts`, `src/i18n/zh.ts`, `src/i18n/ko.ts`

Mười khóa mới và một khóa sửa (`about.logsHint`: câu cũ nói "log nằm trên máy, bạn tự gửi khi cần" không còn đúng, nay nói thêm việc app tự gửi báo cáo khi gặp lỗi nghiêm trọng và chỉ nút mới). Ba câu `error.report*` không nằm ở đây (kế hoạch 03 Task 9). Nhãn `about.sendLogs` và `settings.privacy.errorReports` của vi và en phải đúng nguyên văn bảng "Hợp đồng"; câu `about.logsHint` của vi và en **không** chứa các cụm mà kế hoạch 05 chặn (Task 6 kiểm bằng `grep`).

- [ ] **Step 1: Thêm vào `en.ts` trước, thấy test đỏ**

`en.ts` là từ điển gốc (kiểu `MessageKey` suy ra từ nó), nên thêm trước; `dictionaries.test.ts` đòi bốn từ điển còn lại có cùng bộ khóa nên sẽ đỏ.


Trong `src/i18n/en.ts`, tìm đoạn (duy nhất trong file):

```ts
  "settings.privacy.saveHistory.pro": "Saving history is a Pro feature.",
  "settings.privacy.clear": "Delete all data",
```

và thay bằng:

```ts
  "settings.privacy.saveHistory.pro": "Saving history is a Pro feature.",
  "settings.privacy.errorReports": "Send error reports automatically",
  "settings.privacy.errorReports.hint": "When the app hits a serious error, it sends the developers a report: recent logs and your computer's specs, with names, file paths, keys and email addresses removed. Never audio, what was said, or translations. Reports are kept for 30 days.",
  "settings.privacy.clear": "Delete all data",
```

Trong `src/i18n/en.ts`, tìm đoạn (duy nhất trong file):

```ts
  "about.logsHint": "Logs stay on this computer and never contain what was said. Send them to support only if you want to.",
```

và thay bằng:

```ts
  "about.logsHint": "Log files are saved on this computer and never contain what was said. When the app hits a serious error it also sends an error report to the developers automatically (turn this off in Settings › Privacy). For any other problem, press Send log to support to send a report right away.",
  "about.sendLogs": "Send log to support",
  "about.sendLogs.sending": "Sending…",
  "about.sendLogs.sent": "Sent. Report code:",
  "about.sendLogs.codeHint": "Give this code to support when you contact them.",
  "about.sendLogs.copy": "Copy code",
  "about.sendLogs.copied": "Code copied.",
```

Trong `src/i18n/en.ts`, tìm đoạn (duy nhất trong file):

```ts
  "onboarding.terms.accept": "I have read and agree to the End User License Agreement (EULA) and the Privacy Policy.",
  "onboarding.model.title": "Check this computer and choose a model pack",
```

và thay bằng:

```ts
  "onboarding.terms.accept": "I have read and agree to the End User License Agreement (EULA) and the Privacy Policy.",
  "onboarding.terms.reports": "Send error reports to the developers automatically.",
  "onboarding.terms.reports.hint": "Recent logs and your computer's specs, with personal details removed. Never audio, what was said, or translations. Kept for 30 days. You can turn this off any time in Settings › Privacy.",
  "onboarding.model.title": "Check this computer and choose a model pack",
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run src/i18n 2>&1 | tail -12
```
Expected: FAIL: 8 test của `dictionaries.test.ts` đỏ (bốn từ điển vi, ja, zh, ko, mỗi từ điển hai test: bộ khóa và tham số `{…}`), vì thiếu các khóa mới (`onboarding.terms.reports`, `settings.privacy.errorReports`, `about.sendLogs`…).

- [ ] **Step 2: Thêm vào bốn từ điển còn lại**

**`src/i18n/vi.ts`**

Trong `src/i18n/vi.ts`, tìm đoạn (duy nhất trong file):

```ts
  "settings.privacy.saveHistory.pro": "Lưu lịch sử là tính năng Pro.",
  "settings.privacy.clear": "Xóa toàn bộ dữ liệu",
```

và thay bằng:

```ts
  "settings.privacy.saveHistory.pro": "Lưu lịch sử là tính năng Pro.",
  "settings.privacy.errorReports": "Gửi báo cáo lỗi tự động",
  "settings.privacy.errorReports.hint": "Khi app gặp lỗi nghiêm trọng, app gửi cho nhà phát triển một báo cáo: log gần đây và cấu hình máy, đã xóa tên, đường dẫn, key và email. Không bao giờ có âm thanh, nội dung cuộc họp hay bản dịch. Báo cáo được giữ 30 ngày.",
  "settings.privacy.clear": "Xóa toàn bộ dữ liệu",
```

Trong `src/i18n/vi.ts`, tìm đoạn (duy nhất trong file):

```ts
  "about.logsHint": "Log chỉ nằm trên máy này và không bao giờ chứa nội dung cuộc họp. Bạn tự gửi cho bộ phận hỗ trợ khi cần.",
```

và thay bằng:

```ts
  "about.logsHint": "Log được lưu trên máy này và không bao giờ chứa nội dung cuộc họp. Khi app gặp lỗi nghiêm trọng, nó còn tự gửi một báo cáo lỗi cho nhà phát triển (tắt ở Cài đặt › Quyền riêng tư). Với vấn đề khác, bấm Gửi log cho hỗ trợ để gửi ngay một báo cáo.",
  "about.sendLogs": "Gửi log cho hỗ trợ",
  "about.sendLogs.sending": "Đang gửi…",
  "about.sendLogs.sent": "Đã gửi. Mã báo cáo:",
  "about.sendLogs.codeHint": "Đọc mã này cho bộ phận hỗ trợ khi liên hệ.",
  "about.sendLogs.copy": "Sao chép mã",
  "about.sendLogs.copied": "Đã sao chép mã.",
```

Trong `src/i18n/vi.ts`, tìm đoạn (duy nhất trong file):

```ts
  "onboarding.terms.accept": "Tôi đã đọc và đồng ý với Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư.",
  "onboarding.model.title": "Kiểm tra máy và chọn gói model",
```

và thay bằng:

```ts
  "onboarding.terms.accept": "Tôi đã đọc và đồng ý với Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư.",
  "onboarding.terms.reports": "Gửi báo cáo lỗi tự động cho nhà phát triển.",
  "onboarding.terms.reports.hint": "Log gần đây và cấu hình máy, đã xóa thông tin cá nhân. Không bao giờ có âm thanh, nội dung cuộc họp hay bản dịch. Giữ 30 ngày. Bạn tắt được bất kỳ lúc nào ở Cài đặt › Quyền riêng tư.",
  "onboarding.model.title": "Kiểm tra máy và chọn gói model",
```

**`src/i18n/ja.ts`**

Trong `src/i18n/ja.ts`, tìm đoạn (duy nhất trong file):

```ts
  "settings.privacy.saveHistory.pro": "履歴の保存は Pro 機能です。",
  "settings.privacy.clear": "すべてのデータを削除",
```

và thay bằng:

```ts
  "settings.privacy.saveHistory.pro": "履歴の保存は Pro 機能です。",
  "settings.privacy.errorReports": "エラーレポートを自動送信",
  "settings.privacy.errorReports.hint": "アプリが重大なエラーに遭遇すると、開発者にレポートを送信します。内容は直近のログとコンピューターの仕様で、名前、ファイルパス、キー、メールアドレスは削除されます。音声、話した内容、翻訳は含まれません。レポートは30日間保存されます。",
  "settings.privacy.clear": "すべてのデータを削除",
```

Trong `src/i18n/ja.ts`, tìm đoạn (duy nhất trong file):

```ts
  "about.logsHint": "ログはこのコンピューターにのみ保存され、話した内容は含まれません。サポートに送るのは、ご希望の場合のみで構いません。",
```

và thay bằng:

```ts
  "about.logsHint": "ログはこのコンピューターにのみ保存され、話した内容は含まれません。アプリが重大なエラーに遭遇したときは、開発者にエラーレポートも自動で送信します（設定 › プライバシーでオフにできます）。ほかの問題は、「ログをサポートに送信」を押すとすぐにレポートを送れます。",
  "about.sendLogs": "ログをサポートに送信",
  "about.sendLogs.sending": "送信中…",
  "about.sendLogs.sent": "送信しました。レポートコード：",
  "about.sendLogs.codeHint": "サポートに連絡するときは、このコードをお伝えください。",
  "about.sendLogs.copy": "コードをコピー",
  "about.sendLogs.copied": "コードをコピーしました。",
```

Trong `src/i18n/ja.ts`, tìm đoạn (duy nhất trong file):

```ts
  "onboarding.terms.accept": "使用許諾契約（EULA）とプライバシーポリシーを読み、同意します。",
  "onboarding.model.title": "このコンピューターを確認し、モデルパックを選択",
```

và thay bằng:

```ts
  "onboarding.terms.accept": "使用許諾契約（EULA）とプライバシーポリシーを読み、同意します。",
  "onboarding.terms.reports": "エラーレポートを開発者に自動送信する。",
  "onboarding.terms.reports.hint": "直近のログとコンピューターの仕様で、個人情報は削除されます。音声、話した内容、翻訳は含まれません。30日間保存されます。設定 › プライバシーでいつでもオフにできます。",
  "onboarding.model.title": "このコンピューターを確認し、モデルパックを選択",
```

**`src/i18n/zh.ts`**

Trong `src/i18n/zh.ts`, tìm đoạn (duy nhất trong file):

```ts
  "settings.privacy.saveHistory.pro": "保存历史记录是 Pro 功能。",
  "settings.privacy.clear": "删除所有数据",
```

và thay bằng:

```ts
  "settings.privacy.saveHistory.pro": "保存历史记录是 Pro 功能。",
  "settings.privacy.errorReports": "自动发送错误报告",
  "settings.privacy.errorReports.hint": "应用遇到严重错误时，会向开发者发送报告：近期日志和电脑配置，其中的姓名、文件路径、密钥和邮箱已删除。绝不包含音频、说话内容或翻译。报告保留 30 天。",
  "settings.privacy.clear": "删除所有数据",
```

Trong `src/i18n/zh.ts`, tìm đoạn (duy nhất trong file):

```ts
  "about.logsHint": "日志只保存在这台电脑上，不包含说话内容。只有你愿意时才需要发给客服。",
```

và thay bằng:

```ts
  "about.logsHint": "日志只保存在这台电脑上，不包含说话内容。应用遇到严重错误时，还会自动向开发者发送错误报告（可在设置 › 隐私中关闭）。其他问题可点击“向客服发送日志”，立即发送一份报告。",
  "about.sendLogs": "向客服发送日志",
  "about.sendLogs.sending": "正在发送…",
  "about.sendLogs.sent": "已发送。报告编号：",
  "about.sendLogs.codeHint": "联系客服时请提供此编号。",
  "about.sendLogs.copy": "复制编号",
  "about.sendLogs.copied": "已复制编号。",
```

Trong `src/i18n/zh.ts`, tìm đoạn (duy nhất trong file):

```ts
  "onboarding.terms.accept": "我已阅读并同意最终用户许可协议（EULA）和隐私政策。",
  "onboarding.model.title": "检查这台电脑并选择模型包",
```

và thay bằng:

```ts
  "onboarding.terms.accept": "我已阅读并同意最终用户许可协议（EULA）和隐私政策。",
  "onboarding.terms.reports": "自动向开发者发送错误报告。",
  "onboarding.terms.reports.hint": "近期日志和电脑配置，已删除个人信息。绝不包含音频、说话内容或翻译。保留 30 天。可随时在设置 › 隐私中关闭。",
  "onboarding.model.title": "检查这台电脑并选择模型包",
```

**`src/i18n/ko.ts`**

Trong `src/i18n/ko.ts`, tìm đoạn (duy nhất trong file):

```ts
  "settings.privacy.saveHistory.pro": "기록 저장은 Pro 기능입니다.",
  "settings.privacy.clear": "모든 데이터 삭제",
```

và thay bằng:

```ts
  "settings.privacy.saveHistory.pro": "기록 저장은 Pro 기능입니다.",
  "settings.privacy.errorReports": "오류 보고서 자동 전송",
  "settings.privacy.errorReports.hint": "앱에 심각한 오류가 생기면 개발자에게 보고서를 보냅니다. 최근 로그와 컴퓨터 사양이 담기며 이름, 파일 경로, 키, 이메일 주소는 삭제됩니다. 오디오, 말한 내용, 번역은 절대 포함되지 않습니다. 보고서는 30일간 보관됩니다.",
  "settings.privacy.clear": "모든 데이터 삭제",
```

Trong `src/i18n/ko.ts`, tìm đoạn (duy nhất trong file):

```ts
  "about.logsHint": "로그는 이 컴퓨터에만 저장되며 말한 내용은 포함되지 않습니다. 원하는 경우에만 지원팀에 보내세요.",
```

và thay bằng:

```ts
  "about.logsHint": "로그는 이 컴퓨터에만 저장되며 말한 내용은 포함되지 않습니다. 앱에 심각한 오류가 생기면 개발자에게 오류 보고서도 자동으로 보냅니다(설정 › 개인정보 보호에서 끌 수 있습니다). 다른 문제는 「지원팀에 로그 보내기」를 누르면 바로 보고서를 보낼 수 있습니다.",
  "about.sendLogs": "지원팀에 로그 보내기",
  "about.sendLogs.sending": "보내는 중…",
  "about.sendLogs.sent": "보냈습니다. 보고서 코드:",
  "about.sendLogs.codeHint": "지원팀에 문의할 때 이 코드를 알려 주세요.",
  "about.sendLogs.copy": "코드 복사",
  "about.sendLogs.copied": "코드를 복사했습니다.",
```

Trong `src/i18n/ko.ts`, tìm đoạn (duy nhất trong file):

```ts
  "onboarding.terms.accept": "사용권 계약(EULA)과 개인정보 처리방침을 읽었으며 이에 동의합니다.",
  "onboarding.model.title": "이 컴퓨터를 확인하고 모델 팩 선택",
```

và thay bằng:

```ts
  "onboarding.terms.accept": "사용권 계약(EULA)과 개인정보 처리방침을 읽었으며 이에 동의합니다.",
  "onboarding.terms.reports": "오류 보고서를 개발자에게 자동으로 보냅니다.",
  "onboarding.terms.reports.hint": "최근 로그와 컴퓨터 사양이며 개인 정보는 삭제됩니다. 오디오, 말한 내용, 번역은 포함되지 않습니다. 30일간 보관됩니다. 설정 › 개인정보 보호에서 언제든 끌 수 있습니다.",
  "onboarding.model.title": "이 컴퓨터를 확인하고 모델 팩 선택",
```

- [ ] **Step 3: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run src/i18n 2>&1 | tail -12
```
Expected: mọi test `passed`: 5 từ điển cùng bộ khóa, mọi chỗ `{tham số}` khớp nhau giữa các ngôn ngữ.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -rniIE 'không tự gửi (báo cáo|log)|không gửi báo cáo lỗi tự động|app không tự gửi gì|bạn tự quyết( định)? có gửi|bạn tự gửi cho chúng tôi|log chỉ nằm trên máy|no automatic crash reports|sends no automatic|never sends (logs|anything)|you decide whether to send (them|logs)|you send them to us yourself|logs? stay on (your|this) (computer|machine)' src/i18n | wc -l
```
Expected: `0` (câu `about.logsHint` mới của vi và en không chứa cụm cũ nào mà kế hoạch 05 Task 9 chặn).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -c "Gửi log cho hỗ trợ\|Gửi báo cáo lỗi tự động" src/i18n/vi.ts && grep -c "Send log to support\|Send error reports automatically" src/i18n/en.ts
```
Expected: mỗi lệnh in một số ≥ 2: đúng hai kiểm tra Task 0 Step 4 của kế hoạch 05 làm.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src/i18n && git commit -m "feat(app): chuỗi giao diện báo cáo lỗi ở 5 ngôn ngữ, sửa câu giải thích log ở Giới thiệu" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Điều kiện kiểm tra giao diện (viết trước, đỏ)

**Files:**
- Modify: `scripts/ui-preview/check-i18n.mjs`

`check-i18n.mjs` mở từng màn hình của trang xem trước trong Chrome không đầu, ở 5 ngôn ngữ và hai cỡ cửa sổ (960×640, 720×480), kiểm `<html lang>`, trang không cuộn ngang, chữ không tràn ô, rồi các điều kiện riêng của màn hình (bảng `EXTRA`) và các thao tác bấm thật (`interact`). Thêm vào đó:
- **Giới thiệu:** hai nút cạnh nhau, câu `about.logsHint`, vùng `role="status"` có sẵn và rỗng; bấm thật Gửi log → đang gửi (nút khóa, đổi chữ) → mã `R-7F3K-92QD`, lời dặn, nút Sao chép (bấm ra kết quả), đúng một lệnh `send_log_report`; ba màn hình lỗi (`report=failed|ratelimited|rejected`) hiện đúng câu `error.<code>` dưới nút, không mã, không lên thanh báo lỗi chung.
- **Điều khoản (bước 2):** hai ô tích (Chính sách bỏ tick, báo cáo lỗi tích sẵn) và chữ đúng; bấm thật: bấm Tiếp lưu đúng một lần `sendErrorReports = true`, hay `false` khi bỏ tích (và bỏ tích vẫn bấm được Tiếp).
- **Quyền riêng tư:** công tắc bật, không bị khóa ở gói Free, đúng nhãn và lời giải thích; bấm thì lưu `false`, bấm lại lưu `true`; `reports=0` thì công tắc tắt.
- Biến `ONLY` giới hạn màn hình được kiểm (tiền tố tên, cách nhau bằng dấu phẩy).

- [ ] **Step 1: Thêm điều kiện**


Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
// cách trả thì ô đồng ý bỏ tick. Ảnh PNG cho người kiểm xem ở target/ui-preview/ui-ja-zh-ko/ (không commit). Điều kiện nào sai
```

và thay bằng:

```js
// cách trả thì ô đồng ý bỏ tick. Báo cáo lỗi (spec 2026-10-17 §5): ô tích sẵn ở bước Điều khoản (không bắt buộc, bấm Tiếp lưu đúng lựa
// chọn), công tắc ở Quyền riêng tư (bấm thì lưu), nút "Gửi log cho hỗ trợ" ở Giới thiệu (đang gửi, mã báo cáo, nút Sao chép, ba câu
// lỗi). Ảnh PNG cho người kiểm xem ở target/ui-preview/ui-ja-zh-ko/ (không commit). Điều kiện nào sai
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
//   node scripts/ui-preview/check-i18n.mjs [mã ngôn ngữ…]                            # không có mã: ja zh ko
//
// Chạy thử với `vi en` trước để biết lỗi có sẵn (không do ngôn ngữ mới): chỉ sửa lỗi riêng của ja, zh, ko. Mỗi lần chạy kiểm
```

và thay bằng:

```js
//   node scripts/ui-preview/check-i18n.mjs [mã ngôn ngữ…]                            # không có mã: ja zh ko
//   ONLY=about,onboarding-2 node scripts/ui-preview/check-i18n.mjs vi                # chỉ các màn hình có tên bắt đầu bằng một trong các tiền tố đó
//
// Chạy thử với `vi en` trước để biết lỗi có sẵn (không do ngôn ngữ mới): chỉ sửa lỗi riêng của ja, zh, ko. Mỗi lần chạy kiểm
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
const LANGS = args.length > 0 ? args : ["ja", "zh", "ko"];
// Giá trị `lang` của trang theo ngôn ngữ giao diện (`htmlLang` ở src/i18n/index.ts) và thứ tự `UI_LANGUAGES`.
const HTML_LANG = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
```

và thay bằng:

```js
const LANGS = args.length > 0 ? args : ["ja", "zh", "ko"];
// Biến ONLY (tiền tố tên màn hình, cách nhau bằng dấu phẩy) giới hạn các màn hình được kiểm: chạy nhanh khi chỉ sửa một màn hình.
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const wanted = (name) => !ONLY || ONLY.some((prefix) => name.startsWith(prefix));
// Giá trị `lang` của trang theo ngôn ngữ giao diện (`htmlLang` ở src/i18n/index.ts) và thứ tự `UI_LANGUAGES`.
const HTML_LANG = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
```

Trong `scripts/ui-preview/check-i18n.mjs`, ngay sau đoạn này (duy nhất trong file):

```js
  for (const check of qrOrder(lang)) await ck(...check);
```

thêm nguyên văn:

```js
}

// ---------------------------------------------------------------- báo cáo lỗi (spec 2026-10-17 §5)

// Mã báo cáo mẫu của tauri-mock.ts (lệnh giả `send_log_report`, trả sau nửa giây).
const REPORT_ID = "R-7F3K-92QD";
const SEND_BUTTON = ".about-logs .actions > button:nth-child(2)";
const REPORT_BOX = ".about-logs .log-report";
const NEXT_BUTTON = ".onboarding-actions button.primary";
// Lần gọi `update_settings` có đụng `sendErrorReports` của IPC giả (window.__ipcCalls).
const reportSettingCalls = `window.__ipcCalls.filter((c) => c.cmd === "update_settings" && "sendErrorReports" in (c.args?.patch ?? {}))`;

// Bấm thật "Gửi log cho hỗ trợ": đang gửi thì nút khóa (chống bấm đúp) và đổi chữ; xong thì có mã báo cáo, lời dặn đọc mã cho hỗ trợ và
// nút Sao chép; bấm Sao chép thì hiện một kết quả (đã chép, hay lỗi chép: Chrome không đầu có thể không cho ghi clipboard).
async function sendReport(page, ck, lang) {
  await page.click(SEND_BUTTON);
  await sleep(150);
  await ck(`document.querySelector(${JSON.stringify(SEND_BUTTON)}).disabled === true`, "đang gửi: nút Gửi log bị khóa");
  await ck(
    inPage(lang, `return document.querySelector(${JSON.stringify(SEND_BUTTON)}).textContent.includes(t("about.sendLogs.sending"));`),
    "đang gửi: nút ghi about.sendLogs.sending",
  );
  await sleep(800);
  await ck(`document.querySelector(${JSON.stringify(`${REPORT_BOX} .report-code`)})?.textContent === ${JSON.stringify(REPORT_ID)}`, `hiện mã báo cáo ${REPORT_ID}`);
  await ck(
    inPage(
      lang,
      `const s = document.querySelector(${JSON.stringify(REPORT_BOX)}).textContent; return s.includes(t("about.sendLogs.sent")) && s.includes(t("about.sendLogs.codeHint"));`,
    ),
    "có câu about.sendLogs.sent và lời dặn about.sendLogs.codeHint",
  );
  await ck(
    inPage(lang, `const b = document.querySelector(${JSON.stringify(SEND_BUTTON)}); return !b.disabled && b.textContent.includes(t("about.sendLogs"));`),
    "gửi xong: nút Gửi log bấm được lại, ghi about.sendLogs",
  );
  await ck(`${"window.__ipcCalls"}.filter((c) => c.cmd === "send_log_report").length === 1`, "đúng một lệnh send_log_report");
  await ck(
    inPage(lang, `return document.querySelector(${JSON.stringify(`${REPORT_BOX} .actions > button`)}).textContent.includes(t("about.sendLogs.copy"));`),
    "có nút Sao chép mã (about.sendLogs.copy)",
  );
  await page.click(`${REPORT_BOX} .actions > button`);
  await sleep(300);
  await ck(
    inPage(
      lang,
      `const s = document.querySelector(${JSON.stringify(REPORT_BOX)}).textContent; return s.includes(t("about.sendLogs.copied")) || s.includes(t("error.copyFailed"));`,
    ),
    "bấm Sao chép thì hiện kết quả (đã chép hay lỗi chép)",
  );
}

// Gửi lỗi (`report=failed|ratelimited|rejected` của IPC giả): câu lỗi đúng mã nằm dưới nút, không có mã báo cáo, nút bấm được lại, lỗi không
// lên thanh báo lỗi chung.
const reportFails = (code) => async (page, ck, lang) => {
  await page.click(SEND_BUTTON);
  await sleep(900);
  await ck(
    inPage(lang, `const n = document.querySelector(${JSON.stringify(`${REPORT_BOX} .note.error`)}); return !!n && n.textContent.trim() === t("error.${code}");`),
    `câu lỗi là error.${code}`,
  );
  await ck(`!document.querySelector(${JSON.stringify(`${REPORT_BOX} .report-code`)})`, "không có mã báo cáo");
  await ck(`document.querySelector(${JSON.stringify(SEND_BUTTON)}).disabled === false`, "nút Gửi log bấm được lại");
  await ck(`!document.querySelector(".notice.error")`, "lỗi không lên thanh báo lỗi chung (Notice)");
};

// Bước Điều khoản: ô báo cáo lỗi tích sẵn và không bắt buộc (bỏ tích vẫn bấm được Tiếp); bấm Tiếp lưu đúng lựa chọn vào cài đặt.
const reportsConsent = (optOut) => async (page, ck) => {
  const box = ".consent:nth-of-type(2) input";
  await ck(`document.querySelector(${JSON.stringify(box)}).checked === true`, "ô báo cáo lỗi tích sẵn");
  await ck(`document.querySelector(${JSON.stringify(NEXT_BUTTON)}).disabled === true`, "chưa đồng ý Chính sách thì chưa bấm được Tiếp (dù ô báo cáo đã tích)");
  await page.click(".consent:nth-of-type(1)");
  await ck(`document.querySelector(${JSON.stringify(NEXT_BUTTON)}).disabled === false`, "đồng ý Chính sách thì bấm được Tiếp");
  if (optOut) {
    await page.click(".consent:nth-of-type(2)");
    await ck(`document.querySelector(${JSON.stringify(box)}).checked === false`, "bỏ tích được ô báo cáo lỗi");
    await ck(`document.querySelector(${JSON.stringify(NEXT_BUTTON)}).disabled === false`, "bỏ tích ô báo cáo lỗi vẫn bấm được Tiếp");
    await page.click(".consent:nth-of-type(2)");
    await ck(`document.querySelector(${JSON.stringify(box)}).checked === true`, "tích lại được ô báo cáo lỗi");
    await page.click(".consent:nth-of-type(2)");
  }
  await page.click(NEXT_BUTTON);
  await sleep(300);
  await ck(
    `(() => { const c = ${reportSettingCalls}; return c.length === 1 && c[0].args.patch.sendErrorReports === ${!optOut}; })()`,
    `bấm Tiếp lưu đúng một lần sendErrorReports = ${!optOut}`,
  );
};

// Cài đặt › Quyền riêng tư: bấm công tắc báo cáo lỗi thì lưu giá trị mới; bấm lần nữa thì lưu lại giá trị cũ.
async function toggleReportsSwitch(page, ck) {
  await page.click("label[for='error-reports']");
  await sleep(300);
  await ck(`(() => { const c = ${reportSettingCalls}; return c.length === 1 && c[0].args.patch.sendErrorReports === false; })()`, "bấm công tắc thì lưu sendErrorReports = false");
  await ck(`document.querySelector("#error-reports").checked === false`, "công tắc chuyển sang tắt");
  await page.click("label[for='error-reports']");
  await sleep(300);
  await ck(`(() => { const c = ${reportSettingCalls}; return c.length === 2 && c[1].args.patch.sendErrorReports === true; })()`, "bấm lần nữa thì lưu sendErrorReports = true");
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
  ["settings-privacy", "screen=settings&group=privacy"],
```

và thay bằng:

```js
  ["settings-privacy", "screen=settings&group=privacy", { interact: toggleReportsSwitch }],
  // Người dùng đã tắt báo cáo lỗi (reports=0): công tắc tắt.
  ["settings-privacy-off", "screen=settings&group=privacy&reports=0"],
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
  ["about", "screen=about"],
  ["onboarding-1", "onboarding=1"],
  // Bước điều khoản: mở khung EULA để thấy dòng báo "văn bản đang bằng English" của ja, zh, ko.
```

và thay bằng:

```js
  ["about", "screen=about"],
  // Nút "Gửi log cho hỗ trợ" (spec 2026-10-17 §5): bấm thật ra mã báo cáo, và ba lỗi của lệnh.
  ["about-report-sent", "screen=about", { interact: sendReport }],
  ["about-report-failed", "screen=about&report=failed", { interact: reportFails("reportFailed") }],
  ["about-report-ratelimited", "screen=about&report=ratelimited", { interact: reportFails("reportRateLimited") }],
  ["about-report-rejected", "screen=about&report=rejected", { interact: reportFails("reportRejected") }],
  ["onboarding-1", "onboarding=1"],
  // Bước điều khoản: mở khung EULA để thấy dòng báo "văn bản đang bằng English" của ja, zh, ko.
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
    { prepare: `document.querySelector("details.legal-details summary").click()`, wait: 900 },
  ],
  ...Array.from({ length: 7 }, (_, i) => [`onboarding-${i + 3}`, `onboarding=${i + 3}${i === 1 ? "&download=1" : ""}`]),
];
```

và thay bằng:

```js
    { prepare: `document.querySelector("details.legal-details summary").click()`, wait: 900 },
  ],
  // Bước điều khoản, bấm thật (spec 2026-10-17 §5): giữ ô báo cáo lỗi tích sẵn rồi Tiếp (lưu true), hay bỏ tích rồi Tiếp (lưu false).
  ["onboarding-2-reports-on", "onboarding=2", { interact: reportsConsent(false) }],
  ["onboarding-2-reports-off", "onboarding=2", { interact: reportsConsent(true) }],
  ...Array.from({ length: 7 }, (_, i) => [`onboarding-${i + 3}`, `onboarding=${i + 3}${i === 1 ? "&download=1" : ""}`]),
];
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
    [inPage(lang, `return document.body.textContent.includes(t("about.version", { version: ${JSON.stringify(APP_VERSION)} }));`), `màn hình Giới thiệu ghi phiên bản ${APP_VERSION} (của tauri.conf.json)`],
  ],
```

và thay bằng:

```js
    [inPage(lang, `return document.body.textContent.includes(t("about.version", { version: ${JSON.stringify(APP_VERSION)} }));`), `màn hình Giới thiệu ghi phiên bản ${APP_VERSION} (của tauri.conf.json)`],
    [
      inPage(
        lang,
        `const b = [...document.querySelectorAll(".about-logs .actions > button")]; return b.length === 2 && b[0].textContent.includes(t("about.openLogs")) && b[1].textContent.includes(t("about.sendLogs")) && !b[1].disabled;`,
      ),
      "hai nút cạnh nhau: Mở thư mục log và Gửi log cho hỗ trợ (bấm được)",
    ],
    [inPage(lang, `return document.querySelector(".about-logs > p.hint").textContent === t("about.logsHint");`), "câu giải thích about.logsHint"],
    [
      `(() => { const r = document.querySelector(${JSON.stringify(REPORT_BOX)}); return r?.getAttribute("role") === "status" && r.children.length === 0; })()`,
      "vùng kết quả role=status có sẵn trong DOM và còn rỗng",
    ],
  ],
  "settings-privacy": (lang) => [
    [
      `(() => { const e = document.querySelector("#error-reports"); return !!e && e.type === "checkbox" && e.checked === true && !e.disabled && e.getAttribute("aria-describedby") === "error-reports-hint"; })()`,
      "công tắc báo cáo lỗi: bật, bấm được (không cần gói Pro), gắn lời giải thích bằng aria-describedby",
    ],
    [
      inPage(
        lang,
        `return document.querySelector("label[for='error-reports']").textContent === t("settings.privacy.errorReports") && document.querySelector("#error-reports-hint").textContent === t("settings.privacy.errorReports.hint");`,
      ),
      "nhãn settings.privacy.errorReports và lời giải thích settings.privacy.errorReports.hint",
    ],
  ],
  "settings-privacy-off": () => [[`document.querySelector("#error-reports").checked === false`, "reports=0: công tắc báo cáo lỗi tắt"]],
```

Trong `scripts/ui-preview/check-i18n.mjs`, ngay sau đoạn này (duy nhất trong file):

```js
        note ? "khung EULA có dòng báo văn bản đang bằng English" : "khung EULA không có dòng báo (có bản đúng ngôn ngữ)",
```

thêm nguyên văn:

```js
      ],
      [
        `(() => { const c = document.querySelectorAll(".consent input"); return c.length === 2 && c[0].checked === false && c[1].checked === true; })()`,
        "hai ô tích: ô đồng ý Chính sách bỏ tick, ô báo cáo lỗi tích sẵn",
      ],
      [
        inPage(
          lang,
          `const l = document.querySelectorAll(".consent")[1]; return l.textContent === t("onboarding.terms.reports") && document.querySelector("#terms-reports-hint").textContent === t("onboarding.terms.reports.hint") && l.querySelector("input").getAttribute("aria-describedby") === "terms-reports-hint";`,
        ),
        "ô báo cáo lỗi có chữ onboarding.terms.reports, lời giải thích onboarding.terms.reports.hint gắn bằng aria-describedby",
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
      for (const [name, query, options] of SCREENS) {
        await visit(browser, lang, win, name, `${BASE}/?${query}&lang=${lang}`, options, EXTRA[name]?.(lang));
      }
```

và thay bằng:

```js
      for (const [name, query, options] of SCREENS) {
        if (!wanted(name)) continue;
        await visit(browser, lang, win, name, `${BASE}/?${query}&lang=${lang}`, options, EXTRA[name]?.(lang));
      }
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
    for (const [name, query] of OVERLAYS) {
      await visit(browser, lang, { name: "900x300", width: 900, height: 300 }, name, `${BASE}/overlay.html?${query}&lang=${lang}`, {
        transparent: true,
```

và thay bằng:

```js
    for (const [name, query] of OVERLAYS) {
      if (!wanted(name)) continue;
      await visit(browser, lang, { name: "900x300", width: 900, height: 300 }, name, `${BASE}/overlay.html?${query}&lang=${lang}`, {
        transparent: true,
```

- [ ] **Step 2: Chạy, thấy đỏ**

Vite của Task 0 Step 3 vẫn chạy (chưa thì chạy lại như ở đó).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ONLY=about,settings-privacy,onboarding-2 node scripts/ui-preview/check-i18n.mjs vi 2>&1 | tail -25
```
Expected: thoát mã 1, liệt kê điều kiện sai ở `vi/960x640/…` và `vi/720x480/…`: `about: hai nút cạnh nhau…`, `about-report-sent: bấm thử không chạy được: không thấy .about-logs .actions > button:nth-child(2)`, `settings-privacy: công tắc báo cáo lỗi: bật…`, `onboarding-2: hai ô tích…` (giao diện chưa có, Task 4–6).

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add scripts/ui-preview/check-i18n.mjs && git commit -m "test(app): điều kiện kiểm giao diện cho báo cáo lỗi ở Điều khoản, Quyền riêng tư và Giới thiệu" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ô tích sẵn ở bước Điều khoản

**Files:**
- Modify: `src/windows/main/onboarding/Onboarding.tsx`, `src/styles/main.css`

Ô thứ hai nằm ngay dưới ô đồng ý Chính sách, tích sẵn, kèm câu giải thích gắn bằng `aria-describedby`. Bấm Tiếp ở bước này gọi `saveErrorReportsConsent()` rồi `startTrial()` (cả hai chạy nền, không chặn việc sang bước sau). Ô **không** bắt buộc: `canAdvance` giữ nguyên.

- [ ] **Step 1: Component**


Trong `src/windows/main/onboarding/Onboarding.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  const startTrial = useApp((s) => s.startTrial);
  const accepted = useApp((s) => s.termsAccepted);
  const title = useRef<HTMLHeadingElement>(null);
```

và thay bằng:

```tsx
  const startTrial = useApp((s) => s.startTrial);
  const saveReportsConsent = useApp((s) => s.saveErrorReportsConsent);
  const accepted = useApp((s) => s.termsAccepted);
  const title = useRef<HTMLHeadingElement>(null);
```

Trong `src/windows/main/onboarding/Onboarding.tsx`, tìm đoạn (duy nhất trong file):

```tsx
              // Qua bước Điều khoản (đã đồng ý): đăng ký dùng thử chạy nền, vì request gửi mã băm ID máy (spec 2026-10-07 §3.2).
              if (step === "terms") void startTrial();
```

và thay bằng:

```tsx
              // Qua bước Điều khoản (đã đồng ý): lưu lựa chọn báo cáo lỗi tự động (spec 2026-10-17 §5; trước bước tải model, vì lỗi có
              // thể xảy ra từ đó), và đăng ký dùng thử chạy nền, vì request gửi mã băm ID máy (spec 2026-10-07 §3.2).
              if (step === "terms") {
                void saveReportsConsent();
                void startTrial();
              }
```

Trong `src/windows/main/onboarding/Onboarding.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  const setAccepted = useApp((s) => s.setTermsAccepted);
  switch (step) {
    // Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (bước 5 đổi lại được).
```

và thay bằng:

```tsx
  const setAccepted = useApp((s) => s.setTermsAccepted);
  const reportsConsent = useApp((s) => s.errorReportsConsent);
  const setReportsConsent = useApp((s) => s.setErrorReportsConsent);
  switch (step) {
    // Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (bước 5 đổi lại được).
```

Trong `src/windows/main/onboarding/Onboarding.tsx`, ngay sau đoạn này (duy nhất trong file):

```tsx
            <span>{t("onboarding.terms.accept")}</span>
          </label>
```

thêm nguyên văn:

```tsx
          {/* Tích sẵn (spec 2026-10-17 §0): bỏ tích thì không gửi báo cáo lỗi nào. Không bắt buộc để bấm "Tiếp". */}
          <label className="consent">
            <input
              type="checkbox"
              checked={reportsConsent}
              aria-describedby="terms-reports-hint"
              onChange={(e) => setReportsConsent(e.target.checked)}
            />
            <span>{t("onboarding.terms.reports")}</span>
          </label>
          <p className="hint consent-hint" id="terms-reports-hint">
            {t("onboarding.terms.reports.hint")}
          </p>
```

- [ ] **Step 2: Kiểu dáng của câu giải thích** (thụt vào thẳng với chữ của ô tích)

Trong `src/styles/main.css`, tìm đoạn (duy nhất trong file):

```css
.consent input {
  margin-top: 0.15rem;
}
```

và thay bằng:

```css
.consent input {
  margin-top: 0.15rem;
}

/* Câu giải thích của ô tích thứ hai ở bước Điều khoản, thụt vào thẳng với chữ của ô tích. */
.consent-hint {
  margin: 0 0 0.25rem 1.6rem;
}
```

- [ ] **Step 3: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ONLY=onboarding-2 node scripts/ui-preview/check-i18n.mjs vi en 2>&1 | tail -25
```
Expected: `Đạt: vi, en.` (kể cả hai màn hình bấm thật `onboarding-2-reports-on` và `onboarding-2-reports-off`).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src/windows/main/onboarding/Onboarding.tsx src/styles/main.css && git commit -m "feat(app): ô tích sẵn gửi báo cáo lỗi tự động ở bước Điều khoản" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Công tắc ở Cài đặt › Quyền riêng tư

**Files:**
- Modify: `src/windows/main/settings/PrivacySettings.tsx`

Một `Field` công tắc dưới "Lưu lịch sử", **dùng được ở mọi gói** (khác công tắc lịch sử, vốn khóa ở gói Free). Tắt công tắc thì lõi Rust xóa các báo cáo đang chờ gửi (kế hoạch 03 Task 12, `actions.rs`): giao diện chỉ ghi `sendErrorReports`.

- [ ] **Step 1: Component**


Trong `src/windows/main/settings/PrivacySettings.tsx`, tìm đoạn (duy nhất trong file):

```tsx
// Nhóm Cài đặt "Quyền riêng tư" (§4.3): bật/tắt lưu lịch sử (Pro, mặc định tắt), và nút xóa toàn bộ dữ liệu (lịch sử và
// từ điển thuật ngữ), có bước xác nhận. Xóa dữ liệu không đụng tới bản quyền, hạn mức hay cài đặt, và dùng được ở mọi gói.
```

và thay bằng:

```tsx
// Nhóm Cài đặt "Quyền riêng tư" (§4.3): bật/tắt lưu lịch sử (Pro, mặc định tắt), công tắc gửi báo cáo lỗi tự động (mọi gói; spec
// 2026-10-17 §5: tắt thì bỏ luôn các báo cáo đang chờ gửi), và nút xóa toàn bộ dữ liệu (lịch sử và từ điển thuật ngữ), có bước
// xác nhận. Xóa dữ liệu không đụng tới bản quyền, hạn mức hay cài đặt, và dùng được ở mọi gói.
```

Trong `src/windows/main/settings/PrivacySettings.tsx`, ngay sau đoạn này (duy nhất trong file):

```tsx
            onChange={(e) => void update({ saveHistory: e.target.checked })}
```

thêm nguyên văn:

```tsx
          />
        </Field>
        <Field
          label={t("settings.privacy.errorReports")}
          htmlFor="error-reports"
          hint={t("settings.privacy.errorReports.hint")}
          hintId="error-reports-hint"
        >
          <input
            id="error-reports"
            className="switch"
            type="checkbox"
            checked={settings.sendErrorReports}
            aria-describedby="error-reports-hint"
            onChange={(e) => void update({ sendErrorReports: e.target.checked })}
```

- [ ] **Step 2: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ONLY=settings-privacy node scripts/ui-preview/check-i18n.mjs vi en 2>&1 | tail -25
```
Expected: `Đạt: vi, en.` (kể cả `settings-privacy` bấm công tắc hai lần và `settings-privacy-off`).

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src/windows/main/settings/PrivacySettings.tsx && git commit -m "feat(app): công tắc gửi báo cáo lỗi tự động ở Cài đặt, Quyền riêng tư" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Nút Gửi log cho hỗ trợ, mã báo cáo và Sao chép ở Giới thiệu

**Files:**
- Modify: `src/windows/main/screens/About.tsx`, `src/windows/main/dataStores.ts`, `src/styles/main.css`

Hai nút cạnh nhau (Mở thư mục log, Gửi log cho hỗ trợ), rồi vùng kết quả `role="status"`: đã gửi thì dòng "Đã gửi. Mã báo cáo: **R-XXXX-XXXX**", lời dặn đọc mã cho hỗ trợ, và nút Sao chép mã (kèm dòng "Đã sao chép mã." hay lỗi chép); lỗi thì câu `error.<code>`. Đang gửi thì nút khóa và đổi chữ. Bấm gửi lần mới thì xóa dòng "đã sao chép" của lần trước.

- [ ] **Step 1: `writeClipboard` được dùng ở nơi khác**


Trong `src/windows/main/dataStores.ts`, tìm đoạn (duy nhất trong file):

```ts
async function writeClipboard(text: string): Promise<void> {
```

và thay bằng:

```ts
export async function writeClipboard(text: string): Promise<void> {
```

- [ ] **Step 2: Component**

Trong `src/windows/main/screens/About.tsx`, tìm đoạn (duy nhất trong file):

```tsx
import { useApp, useT } from "../appStore";
```

và thay bằng:

```tsx
import { errorKey } from "../../../i18n";
import { useApp, useT } from "../appStore";
import { writeClipboard } from "../dataStores";
```

Trong `src/windows/main/screens/About.tsx`, tìm đoạn (duy nhất trong file):

```tsx
// Giới thiệu (§4.3): phiên bản, thư mục log (Đ10), câu miễn trừ nhãn hiệu (§10.1).
```

và thay bằng:

```tsx
// Giới thiệu (§4.3): phiên bản, thư mục log (Đ10) và nút "Gửi log cho hỗ trợ" (spec 2026-10-17 §5: gửi ngay một báo cáo lỗi đã che dữ
// liệu cá nhân, hiện mã báo cáo để đọc cho hỗ trợ), câu miễn trừ nhãn hiệu (§10.1).
```

Trong `src/windows/main/screens/About.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  const [clicks, setClicks] = useState(0);
  if (!info) return null;
```

và thay bằng:

```tsx
  const report = useApp((s) => s.logReport);
  const sendLogReport = useApp((s) => s.sendLogReport);
  const [clicks, setClicks] = useState(0);
  // Kết quả lần bấm "Sao chép mã" gần nhất; về `idle` mỗi lần gửi báo cáo mới.
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  if (!info) return null;
  async function copyCode(id: string) {
    try {
      await writeClipboard(id);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  }
```

Trong `src/windows/main/screens/About.tsx`, tìm đoạn (duy nhất trong file):

```tsx
          <button onClick={() => void openLogDir()}>
            <Icon name="external" size={16} />
            {t("about.openLogs")}
          </button>
```

và thay bằng:

```tsx
          <div className="actions">
            <button onClick={() => void openLogDir()}>
              <Icon name="external" size={16} />
              {t("about.openLogs")}
            </button>
            <button
              disabled={report.status === "sending"}
              onClick={() => {
                setCopy("idle");
                void sendLogReport();
              }}
            >
              <Icon name="upload" size={16} />
              {t(report.status === "sending" ? "about.sendLogs.sending" : "about.sendLogs")}
            </button>
          </div>
          {/* Vùng live luôn có trong DOM, nội dung chèn vào sau, để trình đọc màn hình đọc được kết quả. */}
          <div className="log-report" role="status">
            {report.status === "sent" && (
              <>
                <p className="note">
                  <Icon name="check" size={16} />
                  <span>
                    {t("about.sendLogs.sent")} <code className="report-code">{report.id}</code>
                  </span>
                </p>
                <p className="hint">{t("about.sendLogs.codeHint")}</p>
                <div className="actions">
                  <button onClick={() => void copyCode(report.id)}>
                    <Icon name="copy" size={16} />
                    {t("about.sendLogs.copy")}
                  </button>
                  {copy === "done" && <span className="note">{t("about.sendLogs.copied")}</span>}
                  {copy === "failed" && <span className="note error">{t(errorKey("copyFailed"))}</span>}
                </div>
              </>
            )}
            {report.status === "failed" && (
              <p className="note error">
                <Icon name="alert" size={16} />
                <span>{t(errorKey(report.code))}</span>
              </p>
            )}
          </div>
```

- [ ] **Step 3: Kiểu dáng**

Trong `src/styles/main.css`, ngay sau đoạn này (duy nhất trong file):

```css
  flex: 1 1 18rem;
  margin: 0;
```

thêm nguyên văn:

```css
}

.about-logs .actions {
  margin-top: 0;
}

/* Kết quả "Gửi log cho hỗ trợ": cả hàng dưới nút; rỗng thì không chiếm chỗ (vẫn nằm trong DOM làm vùng live). */
.log-report {
  flex: 1 1 100%;
}

.log-report .hint {
  margin: 0.25rem 0 0;
}

.report-code {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  user-select: all;
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ONLY=about node scripts/ui-preview/check-i18n.mjs vi en 2>&1 | tail -25
```
Expected: `Đạt: vi, en.` (kể cả `about-report-sent`, `about-report-failed`, `about-report-ratelimited`, `about-report-rejected`). Nếu ba ca lỗi báo `câu lỗi là error.reportFailed…` sai thì kế hoạch 03 Task 9 chưa xong (câu `error.report*` chưa có).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src/windows/main/screens/About.tsx src/windows/main/dataStores.ts src/styles/main.css && git commit -m "feat(app): nút Gửi log cho hỗ trợ ở Giới thiệu, hiện mã báo cáo, sao chép mã và lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kiểm đủ 5 ngôn ngữ và chụp lại ảnh cho website

**Files:** không sửa file (ảnh chụp **không commit** ở kế hoạch này).

- [ ] **Step 1: Chạy đủ 5 ngôn ngữ, mọi màn hình**

Vite của Task 0 Step 3 vẫn chạy (chưa thì chạy lại như ở đó).


```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node scripts/ui-preview/check-i18n.mjs vi en ja zh ko 2>&1 | tail -20
```
Expected: `Đạt: vi, en, ja, zh, ko.` Mất khoảng mười phút. Không có điều kiện sai nào ngoài danh sách mốc của Task 0 Step 3 (nếu mốc có lỗi sẵn, chúng vẫn y nguyên, không thêm lỗi mới). Chữ của ja, zh, ko dài hơn nên nếu một điều kiện "chữ tràn khỏi ô" của Giới thiệu hay Điều khoản đỏ ở cỡ 720×480 thì sửa `src/styles/main.css` (không rút gọn bản dịch), rồi chạy lại.

Xem ảnh các màn hình mới ở `target/ui-preview/ui-ja-zh-ko/` (ví dụ `ja.720x480.about-report-sent.png`, `ko.960x640.onboarding-2.png`, `zh.960x640.settings-privacy.png`) để chắc mã báo cáo, hai nút và ô tích hiển thị gọn.

- [ ] **Step 2: Cách chụp lại ba ảnh của website (kế hoạch 05 Task 5 làm bước này, đừng chụp ở đây)**

Ba cảnh đổi giao diện: `app-about` (nút Gửi log cho hỗ trợ), `app-settings-privacy` (công tắc), `app-onboarding-2` (ô tích ở Điều khoản). Lệnh (cảnh `shoot.mjs` đã có sẵn trong `scripts/ui-preview/shoot.mjs`, cổng mặc định 1430):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vite --config scripts/ui-preview/vite.config.ts
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node scripts/ui-preview/shoot.mjs app-about app-settings-privacy app-onboarding-2
```

Ghi sáu file `website/src/assets/img/app/{app-about,app-settings-privacy,app-onboarding-2}.{vi,en}.webp` và cập nhật `manifest.json` (cần `cwebp`; `sips` chỉ có trên macOS). Ba điểm cần xem bằng mắt sau khi chụp:
- `app-onboarding-2`: **hai** ô tích nhìn thấy trong khung 960×640, ô thứ hai tích sẵn với câu giải thích bên dưới (cảnh dùng `onboarding=2`: mock cho `sendErrorReports` tắt ở onboarding nhưng ô trên giao diện là state `errorReportsConsent`, luôn tích sẵn).
- `app-settings-privacy`: công tắc **Gửi báo cáo lỗi tự động** (en: Send error reports automatically) đang bật; cảnh dùng `history=0` nên công tắc Lưu lịch sử tắt.
- `app-about`: cảnh cao 580 px (`{ height: 580 }`); thấy đủ **hai nút** Mở thư mục log và Gửi log cho hỗ trợ cùng câu giải thích mới. Nếu hàng nút bị cắt thì tăng `height` của cảnh này trong `shoot.mjs` (kế hoạch 05 Task 5 ghi lại nếu phải đổi).

Mô tả (`alt`, `caption`) trong `manifest.json` và ở `website/src/content/` do kế hoạch 05 sửa tay vì cảnh đổi.

---

### Task 8: Kiểm tra toàn bộ và hoàn tất

**Files:** không sửa file (trừ khi bước nào đỏ).

- [ ] **Step 1: Kiểm kiểu, test và build như CI**


```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run 2>&1 | tail -6
```
Expected: `Test Files  24 passed (24)`, `Tests  297 passed (297)` (289 của mốc + 8 test mới của Task 1).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm build 2>&1 | tail -5
```
Expected: `✓ built in …`, không lỗi (`tsc --noEmit && vite build`).

- [ ] **Step 2: Tắt tiến trình nền bạn đã mở, rồi rà `git`**

Tắt Vite ở cổng 1431 (và 1430 nếu bạn đã mở nó ở Task 7) **chỉ khi chính bạn mở**: `TaskStop` nếu chạy nền bằng công cụ, hay Ctrl-C ở cửa sổ Terminal đã mở. Rồi kiểm không còn tiến trình con sót của chính bạn:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && lsof -nP -iTCP:1430 -iTCP:1431 -sTCP:LISTEN
```
Expected: không in gì (hay chỉ tiến trình không phải của bạn).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git status --short
```
Expected: trống (mọi thứ đã commit; ảnh chụp ở `target/` đã bị `.gitignore`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git log --oneline -6
```
Expected: sáu commit của kế hoạch này (Task 1 đến Task 6), commit mới nhất ở trên.

Đối chiếu spec mục 5 và 7:

| Spec | Ở đâu |
|---|---|
| §5 ô tích sẵn ở bước Điều khoản, không đặt ở bước Quyền riêng tư cuối, bỏ tích được, lưu trước bước tải model | Task 4; `check-i18n` `onboarding-2-reports-on/off` |
| §5 công tắc ở Cài đặt › Quyền riêng tư, tắt thì xóa hàng đợi | Task 5 (giao diện), kế hoạch 03 Task 12 (xóa hàng đợi); `check-i18n` `settings-privacy` |
| §5 nút "Gửi log cho hỗ trợ" ở Giới thiệu, mã báo cáo, lỗi, đổi `about.logsHint` | Task 2, 6; `check-i18n` `about-report-*` |
| §5 i18n 5 ngôn ngữ | Task 2; `dictionaries.test.ts` |
| §7 vitest: ô tích tích sẵn và lưu đúng, mã báo cáo, lỗi | Task 1 (tám test store) |
| §7 công tắc cài đặt, nút Giới thiệu và mã báo cáo ở DOM thật | Task 3 đến 7 (`check-i18n.mjs`, 5 ngôn ngữ × 2 cỡ cửa sổ) |

- [ ] **Step 3: Thử tay với app thật (làm SAU khi kế hoạch 03 xong và server của kế hoạch 01 đã deploy; không làm trong kế hoạch này)**

Chạy `scripts/run-dev-app.sh` (kế hoạch 03 Task 13: đặt `AI_TRANSLATOR_DEV_REPORTS=true` trong `.env` nếu muốn thử gửi tự động):
1. Với một bản cài mới (chưa xong onboarding; ở bản dev thì dùng thư mục dữ liệu mới hay xóa file cài đặt, **không xóa vault Keychain**: xóa vault làm key trả phí bị coi là đã hết hạn mức cả chu kỳ) ở bước Điều khoản có **hai** ô, ô báo cáo tích sẵn; bỏ tích rồi bấm Tiếp thì Cài đặt › Quyền riêng tư hiện công tắc **tắt**.
2. Giới thiệu › Gửi log cho hỗ trợ: nút đổi thành "Đang gửi…", rồi hiện mã `R-XXXX-XXXX`; Sao chép mã dán ra đúng mã; báo cáo `manual` có mặt ở Web Admin. Tắt mạng rồi gửi: câu "Không gửi được báo cáo…". Gửi bốn lần liên tiếp: lần thứ tư ra câu "Bạn vừa gửi nhiều báo cáo…" (hạn mức 3 báo cáo mỗi máy mỗi giờ của server).
3. Tắt công tắc ở Quyền riêng tư rồi bật lại: không lỗi; nút Gửi log vẫn chạy khi công tắc tắt.

