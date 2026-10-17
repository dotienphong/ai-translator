# Báo cáo lỗi 02: trang Báo cáo lỗi của Web Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web Admin có trang **Báo cáo lỗi**: danh sách nhóm theo dấu vân tay, tab Gửi tay (tìm theo mã báo cáo), trang một nhóm, trang chi tiết một báo cáo (metadata và ba log dạng văn bản thuần), xóa một báo cáo hay cả nhóm.

**Architecture:** Ba route mới (`/errors`, `/errors/groups/:fingerprint`, `/errors/reports/:id`) và năm trang con trong `server/admin-ui/src/pages/` dựng bằng các thành phần dùng chung có sẵn (`ListHeader`, `FilterBar`, `DataTable`, `DetailLayout`, `KeyValue`, `ConfirmDialog`…). Phần dùng chung của các trang mới (nhãn, tông, cột bảng, chuẩn hóa mã báo cáo) ở `pages/error-kit.tsx`; log hiện qua thành phần `LogView` chỉ dựng chuỗi văn bản trong `<pre>`. Gọi API qua năm hàm mới của `api`, khớp hợp đồng ở kế hoạch 01.

**Tech Stack:** React 19, TypeScript strict, Vite 8, vitest 5 + @testing-library (jsdom), CSS thuần theo token có sẵn (CSP không cho style inline).

**Spec:** `docs/superpowers/specs/2026-10-17-diagnostics-reports-design.md` (mục 4). **Hợp đồng API:** `docs/superpowers/plans/2026-10-17-bao-cao-loi-01-server.md` (mục "Hợp đồng"). Đọc cả hai trước khi làm.

**Quy tắc chung cho mọi task:**
- Làm trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports` (nhánh `diagnostics-reports`). **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** vì shell reset thư mục sau mỗi lệnh.
- **Không merge, không push, không deploy.** Không chạy `wrangler`.
- Chữ trên giao diện bằng tiếng Việt có dấu đầy đủ; chú thích trong mã bằng tiếng Việt, cùng giọng các file kế bên.
- **Không dùng style inline** (`style={…}`, thuộc tính `style`): CSP `style-src 'self'`. Mọi kiểu dáng là lớp CSS trong `src/styles/`.
- **Không bao giờ** dùng `dangerouslySetInnerHTML`, `innerHTML` hay Markdown cho dữ liệu của báo cáo (message, log): chúng do app gửi lên và là dữ liệu từ ngoài.
- Test chạy bằng `pnpm -C /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui exec vitest run <file>`; kiểu bằng `pnpm -C <cùng đường dẫn> typecheck`. Dưới đây viết tắt `ADMIN_UI` là `/Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui`.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Quyết định thiết kế (đã đối chiếu với mã hiện có)

- **Ba route, không phải bốn:** `/errors` có hai tab (Nhóm lỗi, Gửi tay; tab đầu đọc từ `?tab=manual` khi mở trang, như `AuditPage` đọc `?action=`); `/errors/groups/<16 hex>` là trang một nhóm; `/errors/reports/R-XXXX-XXXX` là chi tiết. `matchRoute` chỉ xét đường dẫn, không xét query.
- **Liên kết sang license:** trang chi tiết liên kết sang trang máy (`/devices/<device_id_hash>`, `DevicePage`); trang máy đã liệt kê các license từng kích hoạt trên máy đó (và email của chúng), nên không thêm liên kết riêng tới license.
- **Tìm theo mã báo cáo** nằm ở tab Gửi tay (ô "Mã báo cáo", gửi bằng nút Tìm), đúng spec §4. Không đụng ô tra cứu toàn cục (`SearchBox`/`detectQuery` chỉ nhận email, mã đơn, key, id, mã máy; thêm kiểu thứ sáu làm đổi `LookupQuery` và placeholder đang được test).
- **Trang nhóm** gọi `GET /admin/error-reports?fingerprint=…&include_debug=1` (luôn kèm báo cáo debug, có huy hiệu `debug`) vì API không có route "một nhóm": tên và loại của nhóm lấy từ báo cáo đầu tiên, số báo cáo từ danh sách đã tải (`ResultCount`, có dấu `+` khi còn trang sau).
- **Xóa không đòi lý do** (khớp server: `POST /admin/error-reports/delete` không có `note`): `ConfirmDialog` với `needsNote={false}`, `tone="danger"`. Xóa một báo cáo xong thì trang hiện trạng thái "Đã xóa" kèm nút quay về (không điều hướng, để người vận hành thấy kết quả). Xóa cả nhóm xong thì tải lại, bảng rỗng.
- **Danh sách không hiện báo cáo debug mặc định** (server lo); công tắc "Hiện cả báo cáo debug" gửi `include_debug=1`.
- **Nhật ký:** `list_viewed` đã hiện `resource: error_groups · filters: {…}` qua `fmtDetail` (không có bảng nhãn cho `resource`), nên chỉ thêm nhãn cho hai action mới: `error_report_viewed` (một lượt xem, ẩn mặc định cùng nhóm `VIEW_ACTIONS` của server) và `error_reports_deleted`.
- **Gallery** (`src/dev/Gallery.tsx`) có một khối cho `LogView`, theo thông lệ "mọi thành phần dùng chung có mặt ở Gallery". `gallery-build.test.ts` không cần sửa.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `server/admin-ui/src/api/types.ts` | Kiểu `ReportKind`, `GroupKind`, `ErrorGroup`, `ErrorReport`, `ErrorReportDetail`, `DeletedReports` |
| Modify `server/admin-ui/src/api/endpoints.ts` | Năm hàm: `errorGroups`, `errorReports`, `errorReport`, `deleteErrorReport`, `deleteErrorGroup` |
| Modify `server/admin-ui/src/api/endpoints.test.ts` | Ca mới; đếm số hàm 25 → 30 |
| Create `server/admin-ui/src/pages/error-fixtures.ts` | Dữ liệu mẫu cho test của các trang mới |
| Create `server/admin-ui/src/pages/error-kit.tsx` + `error-kit.test.tsx` | Nhãn, tông, đường dẫn, `parseReportId`, cột bảng nhóm và báo cáo |
| Create `server/admin-ui/src/components/LogView.tsx` + `LogView.test.tsx` | Hiện log dạng văn bản thuần |
| Create `server/admin-ui/src/pages/ErrorGroupsPanel.tsx`, `ManualReportsPanel.tsx`, `ErrorsPage.tsx` + `ErrorsPage.test.tsx` | Trang `/errors` với hai tab |
| Create `server/admin-ui/src/pages/ErrorGroupPage.tsx` + test | Trang một nhóm, xóa cả nhóm |
| Create `server/admin-ui/src/pages/ErrorReportPage.tsx` + test | Chi tiết một báo cáo, xóa một báo cáo |
| Modify `server/admin-ui/src/components/icons.tsx` | `IconBug` |
| Modify `server/admin-ui/src/router.tsx`, `router.test.tsx` | Ba route mới |
| Modify `server/admin-ui/src/components/Sidebar.tsx`, `Sidebar.test.tsx` | Mục "Báo cáo lỗi" (nhóm Dữ liệu); 8 → 9 mục |
| Modify `server/admin-ui/src/App.tsx`, `App.test.tsx` | `routeTitle`, `Page`; danh sách mục thanh bên; test mới |
| Modify `server/admin-ui/src/audit-labels.ts`, `audit-labels.test.ts` | Hai action mới |
| Modify `server/admin-ui/src/styles/pages.css` | Lớp `.log-*`, `.err-*`, `.cell-msg`, `.cell-version` |
| Create `server/admin-ui/dev/fake-errors.ts`; modify `dev/fake-api.ts`, `src/dev/Gallery.tsx` | Dữ liệu giả cho `pnpm dev`, khối Gallery |

**Test hiện có bị đổi hành vi** (sửa bằng mã cụ thể trong Task 7): `Sidebar.test.tsx` (đếm 8 liên kết), `App.test.tsx` (danh sách liên kết thanh bên), `api/endpoints.test.ts` (đếm 25 hàm; test "đủ mọi hàm" đòi ca cho hàm mới), `router.test.tsx` (bảng route, chỉ thêm ca).

---

### Task 0: Chuẩn bị môi trường

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh và cài phụ thuộc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git branch --show-current
```
Expected: `diagnostics-reports`

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server install --frozen-lockfile
```
Expected: kết thúc không lỗi (cài cả `server/admin-ui`, workspace của `server/`).

- [ ] **Step 2: Chạy mốc xuất phát**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm typecheck && pnpm test 2>&1 | tail -8
```
Expected: `tsc` không lỗi; vitest báo mọi file `passed`. Nếu có test đỏ **trước** khi sửa gì, dừng lại và báo, đừng làm tiếp.

---

### Task 1: Kiểu API và hàm gọi

**Files:**
- Modify: `server/admin-ui/src/api/types.ts` (thêm vào cuối file)
- Modify: `server/admin-ui/src/api/endpoints.ts`
- Modify: `server/admin-ui/src/api/endpoints.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Trong `server/admin-ui/src/api/endpoints.test.ts`:

1. Thêm hai hằng sau dòng `const HASH = "a".repeat(64);`:

```ts
const FP = "3fa1c09be2d47a55";
const RID = "R-7F3K-92QD";
```

2. Thêm các ca vào mảng `CASES`, ngay sau ca `{ fn: "audit", run: () => api.audit({}), method: "GET", url: "/admin/audit" },`:

```ts
  { fn: "errorGroups", run: () => api.errorGroups({}), method: "GET", url: "/admin/error-groups" },
  {
    fn: "errorGroups",
    run: () => api.errorGroups({ kind: "crash", app_version: "0.1.10", include_debug: "1", cursor: `1790812800_${FP}` }),
    method: "GET",
    url: `/admin/error-groups?kind=crash&app_version=0.1.10&include_debug=1&cursor=1790812800_${FP}`,
  },
  { fn: "errorReports", run: () => api.errorReports({}), method: "GET", url: "/admin/error-reports" },
  {
    fn: "errorReports",
    run: () => api.errorReports({ kind: "manual", fingerprint: FP, device: HASH, report: RID, include_debug: "1", cursor: `1790812800_${RID}` }),
    method: "GET",
    url: `/admin/error-reports?kind=manual&fingerprint=${FP}&device=${HASH}&report=${RID}&include_debug=1&cursor=1790812800_${RID}`,
  },
  { fn: "errorReport", run: () => api.errorReport(RID), method: "GET", url: `/admin/error-reports/${RID}` },
  { fn: "errorReport", run: () => api.errorReport(ODD), method: "GET", url: `/admin/error-reports/${ODD_ENCODED}` },
  { fn: "deleteErrorReport", run: () => api.deleteErrorReport(RID), method: "POST", url: "/admin/error-reports/delete", body: { id: RID } },
  { fn: "deleteErrorGroup", run: () => api.deleteErrorGroup(FP), method: "POST", url: "/admin/error-reports/delete", body: { fingerprint: FP } },
```

3. Đổi `expect(Object.keys(api)).toHaveLength(25);` thành `expect(Object.keys(api)).toHaveLength(30);`

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/api/endpoints.test.ts 2>&1 | tail -15
```
Expected: FAIL (`api.errorGroups is not a function` và test "có test cho đủ mọi hàm").

- [ ] **Step 3: Thêm kiểu**

Thêm vào **cuối** `server/admin-ui/src/api/types.ts`:

```ts

/* ---------- Báo cáo lỗi của app (server/src/error-reports.ts, admin-reports.ts; kế hoạch bao-cao-loi-01) ---------- */

export type ReportKind = "crash" | "session_error" | "sidecar_died" | "manual";
/** Loại có nhóm: báo cáo `manual` không có dấu vân tay chung nên không nằm trong danh sách nhóm. */
export type GroupKind = Exclude<ReportKind, "manual">;

/** Một nhóm: mọi báo cáo cùng dấu vân tay (cùng loại, mã lỗi, vị trí). `versions` đã sắp theo chữ. */
export interface ErrorGroup {
  fingerprint: string;
  kind: GroupKind;
  code: string | null;
  reports: number;
  /** Số máy khác nhau (device_id_hash). */
  devices: number;
  release_reports: number;
  debug_reports: number;
  first_at: number;
  last_at: number;
  versions: string[];
}

/** Một báo cáo, không kèm log (danh sách). Giờ là giây Unix; `received_at` là giờ server, `occurred_at` là giờ máy. */
export interface ErrorReport {
  id: string;
  received_at: number;
  occurred_at: number;
  kind: ReportKind;
  code: string | null;
  fingerprint: string;
  build: "release" | "debug";
  app_version: string;
  os_name: string;
  os_version: string;
  arch: string;
  chip: string | null;
  ram_mb: number | null;
  gpu_backend: "metal" | "vulkan" | "cpu" | null;
  model_pack: string | null;
  plan: "free" | PlanCode | null;
  ui_lang: string;
  device_id_hash: string;
  message: string;
}

/** Log là chuỗi thô do app gửi (đã che dữ liệu cá nhân): chỉ hiện dạng văn bản, không bao giờ dựng HTML từ nó. */
export interface ErrorReportDetail extends ErrorReport {
  logs: { app: string; asr: string; llama: string };
}

export interface DeletedReports {
  deleted: number;
}
```

- [ ] **Step 4: Thêm hàm gọi**

Trong `server/admin-ui/src/api/endpoints.ts`:

1. Thay khối `import type { … } from "./types";` bằng:

```ts
import type {
  AlertsResponse,
  AuditRow,
  DeletedReports,
  EraseResult,
  ErrorGroup,
  ErrorReport,
  ErrorReportDetail,
  GroupKind,
  IssuedLicense,
  KeyCheck,
  LicenseRow,
  LookupResult,
  OrderRow,
  OrderCurrency,
  Page,
  PaymentStatus,
  PlanCode,
  Queue,
  ReleasesResponse,
  ReportKind,
  Stats,
  Summary,
  TrialRow,
} from "./types";
```

2. Ngay sau định nghĩa `export type AuditFilters = { … };` thêm:

```ts

/** Bộ lọc của /admin/error-groups: `kind` không có `manual` (báo cáo gửi tay không thuộc nhóm nào); mặc định server ẩn báo cáo debug. */
export type ErrorGroupFilters = {
  kind?: GroupKind;
  app_version?: string;
  include_debug?: "1";
  cursor?: string;
};

/** Bộ lọc của /admin/error-reports: `report` là mã báo cáo viết hoa, `device` là mã máy 64 hex, `fingerprint` là 16 hex. */
export type ErrorReportFilters = {
  kind?: ReportKind;
  fingerprint?: string;
  device?: string;
  report?: string;
  include_debug?: "1";
  cursor?: string;
};
```

3. Thay dòng `  audit: (f: AuditFilters) => call<Page<AuditRow>>("GET", \`/admin/audit${queryString(f)}\`),` bằng chính nó cộng năm hàm:

```ts
  audit: (f: AuditFilters) => call<Page<AuditRow>>("GET", `/admin/audit${queryString(f)}`),
  errorGroups: (f: ErrorGroupFilters) => call<Page<ErrorGroup>>("GET", `/admin/error-groups${queryString(f)}`),
  errorReports: (f: ErrorReportFilters) => call<Page<ErrorReport>>("GET", `/admin/error-reports${queryString(f)}`),
  errorReport: (id: string) => call<ErrorReportDetail>("GET", `/admin/error-reports/${seg(id)}`),
  deleteErrorReport: (id: string) => call<DeletedReports>("POST", "/admin/error-reports/delete", { id }),
  deleteErrorGroup: (fingerprint: string) => call<DeletedReports>("POST", "/admin/error-reports/delete", { fingerprint }),
```

- [ ] **Step 5: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/api/endpoints.test.ts 2>&1 | tail -8 && pnpm typecheck
```
Expected: PASS toàn bộ; `tsc` không lỗi.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/src/api/types.ts server/admin-ui/src/api/endpoints.ts server/admin-ui/src/api/endpoints.test.ts && git commit -m "feat(admin-ui): kiểu và hàm gọi API báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Phần dùng chung của các trang báo cáo lỗi (`error-kit`)

**Files:**
- Create: `server/admin-ui/src/pages/error-fixtures.ts`
- Create: `server/admin-ui/src/pages/error-kit.tsx`
- Create: `server/admin-ui/src/pages/error-kit.test.tsx`

- [ ] **Step 1: Viết dữ liệu mẫu cho test**

Tạo `server/admin-ui/src/pages/error-fixtures.ts`:

```ts
// Dữ liệu mẫu cho test của các trang Báo cáo lỗi: hình dạng khớp hợp đồng API (api/types.ts, kế hoạch bao-cao-loi-01).
import type { ErrorGroup, ErrorReport, ErrorReportDetail } from "../api/types";

export const NOW = Math.floor(Date.now() / 1000);
export const FP = "3fa1c09be2d47a55";
export const RID = "R-7F3K-92QD";
export const DEVICE = "a1".repeat(32);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function report(over: Partial<ErrorReport> = {}): ErrorReport {
  return {
    id: RID,
    received_at: NOW - 3600,
    occurred_at: NOW - 3660,
    kind: "session_error",
    code: "sidecarFailed",
    fingerprint: FP,
    build: "release",
    app_version: "0.1.10",
    os_name: "macos",
    os_version: "15.6.1",
    arch: "aarch64",
    chip: "Apple M4 Pro",
    ram_mb: 24576,
    gpu_backend: "metal",
    model_pack: "standard",
    plan: "monthly",
    ui_lang: "vi",
    device_id_hash: DEVICE,
    message: "tiến trình phụ không khởi động được",
    ...over,
  };
}

export function detail(over: Partial<ErrorReportDetail> = {}): ErrorReportDetail {
  return {
    ...report(),
    logs: {
      app: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
      asr: "ggml_metal_init: error: failed to load\n",
      llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n",
    },
    ...over,
  };
}

export function group(over: Partial<ErrorGroup> = {}): ErrorGroup {
  return {
    fingerprint: FP,
    kind: "session_error",
    code: "sidecarFailed",
    reports: 9,
    devices: 4,
    release_reports: 8,
    debug_reports: 1,
    first_at: NOW - 5 * 86400,
    last_at: NOW - 600,
    versions: ["0.1.10", "0.1.9"],
    ...over,
  };
}
```

- [ ] **Step 2: Viết test (đỏ)**

Tạo `server/admin-ui/src/pages/error-kit.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "../components/DataTable";
import { shortHash } from "../format";
import { DEVICE, FP, group, NOW, RID, report } from "./error-fixtures";
import { groupColumns, groupPath, KIND_LABELS, KindBadge, osText, parseReportId, ramText, reportColumns, reportPath, versionsText } from "./error-kit";

const cell = (row: HTMLElement, label: string) => row.querySelector<HTMLElement>(`td[data-label="${label}"]`)!;

describe("parseReportId", () => {
  it.each([
    ["R-7F3K-92QD", "R-7F3K-92QD"],
    ["  r-7f3k-92qd \n", "R-7F3K-92QD"],
    ["R-0000-0000", "R-0000-0000"],
  ])("%j thành %s", (raw, expected) => {
    expect(parseReportId(raw)).toBe(expected);
  });

  it.each(["", "abc", "R-7F3K-92Q", "R7F3K-92QD", "R-7F3K-92QDX", "R-7F3I-92QD", "R-7F3L-92QD", "R-7F3O-92QD", "R-7F3U-92QD"])(
    "%j không hợp lệ (độ dài sai, thiếu gạch, hay chữ I, L, O, U không có trong bảng Crockford)",
    (raw) => {
      expect(parseReportId(raw)).toBeNull();
    },
  );
});

describe("đường dẫn, nhãn và định dạng", () => {
  it("đường dẫn trang nhóm và trang chi tiết", () => {
    expect(groupPath(FP)).toBe(`/errors/groups/${FP}`);
    expect(reportPath(RID)).toBe(`/errors/reports/${RID}`);
  });

  it("hệ điều hành, RAM, danh sách phiên bản", () => {
    expect(osText(report())).toBe("macOS 15.6.1 (aarch64)");
    expect(osText(report({ os_name: "windows", os_version: "11 23H2", arch: "x86_64" }))).toBe("Windows 11 23H2 (x86_64)");
    expect(osText(report({ os_name: "linux" }))).toBe("linux 15.6.1 (aarch64)");
    expect(ramText(24576)).toBe("24 GB");
    expect(ramText(8192)).toBe("8 GB");
    expect(ramText(null)).toBeNull();
    expect(versionsText(["0.1.10"])).toBe("0.1.10");
    expect(versionsText(["a", "b", "c"])).toBe("a, b, c");
    expect(versionsText(["a", "b", "c", "d", "e"])).toBe("a, b, c +2");
  });

  it("huy hiệu loại: mỗi loại có tên tiếng Việt; loại lạ (server thêm sau) vẫn hiện nguyên mã", () => {
    for (const kind of ["crash", "session_error", "sidecar_died", "manual"] as const) {
      const { unmount } = render(<KindBadge kind={kind} />);
      expect(screen.getByText(KIND_LABELS[kind])).toBeTruthy();
      unmount();
    }
    render(<KindBadge kind={"moi" as never} />);
    expect(screen.getByText("moi")).toBeTruthy();
  });
});

describe("cột bảng", () => {
  it("báo cáo: mã là liên kết tới trang chi tiết, máy là liên kết tới trang máy, báo cáo debug có huy hiệu, thông báo rỗng thì ghi rõ", () => {
    render(
      <DataTable
        columns={reportColumns(NOW)}
        rows={[report(), report({ id: "R-0000-0002", build: "debug", message: "" })]}
        rowKey={(r) => r.id}
        empty="Trống"
      />,
    );
    const link = screen.getByRole("link", { name: RID });
    expect(link.getAttribute("href")).toBe(`/errors/reports/${RID}`);
    const row1 = link.closest("tr") as HTMLElement;
    expect(within(row1).getByRole("link", { name: shortHash(DEVICE) }).getAttribute("href")).toBe(`/devices/${DEVICE}`);
    expect(cell(row1, "Phiên bản").textContent).toBe("0.1.10");
    expect(cell(row1, "Hệ điều hành").textContent).toContain("macOS 15.6.1 (aarch64)");
    expect(within(row1).getByText("tiến trình phụ không khởi động được").getAttribute("title")).toBe("tiến trình phụ không khởi động được");
    const row2 = screen.getByRole("link", { name: "R-0000-0002" }).closest("tr") as HTMLElement;
    expect(within(cell(row2, "Phiên bản")).getByText("debug")).toBeTruthy();
    expect(within(row2).getByText("Không có")).toBeTruthy();
  });

  it("nhóm: mã lỗi là liên kết tới trang nhóm, kèm loại, phiên bản, số máy và số báo cáo (có số debug)", () => {
    render(<DataTable columns={groupColumns(NOW)} rows={[group()]} rowKey={(g) => g.fingerprint} empty="Trống" />);
    const link = screen.getByRole("link", { name: "sidecarFailed" });
    expect(link.getAttribute("href")).toBe(`/errors/groups/${FP}`);
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(cell(row, "Phiên bản").textContent).toBe("0.1.10, 0.1.9");
    expect(cell(row, "Máy").textContent).toBe("4");
    expect(within(cell(row, "Báo cáo")).getByText("9")).toBeTruthy();
    expect(within(cell(row, "Báo cáo")).getByText("1 debug")).toBeTruthy();
    expect(cell(row, "Mã lỗi").textContent).toContain(FP);
  });

  it("nhóm không có báo cáo debug: không có dòng phụ debug", () => {
    render(<DataTable columns={groupColumns(NOW)} rows={[group({ debug_reports: 0, release_reports: 9 })]} rowKey={(g) => g.fingerprint} empty="Trống" />);
    expect(screen.queryByText(/debug/)).toBeNull();
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/error-kit.test.tsx 2>&1 | tail -10
```
Expected: FAIL (không tìm thấy `./error-kit`).

- [ ] **Step 4: Viết `error-kit.tsx`**

Tạo `server/admin-ui/src/pages/error-kit.tsx`:

```tsx
// Phần chung của các trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): tên và tông theo loại báo cáo, đường dẫn
// các trang, chuẩn hóa mã báo cáo người vận hành gõ, và cột của hai bảng (nhóm; báo cáo của tab Gửi tay và của trang nhóm).
import type { ErrorGroup, ErrorReport, ReportKind } from "../api/types";
import { Badge, type Tone } from "../components/Badge";
import { Cell2, WhenCell } from "../components/columns";
import type { Column } from "../components/DataTable";
import { PLAN_LABELS } from "../components/StatusBadge";
import { fmtBytes, fmtInt, shortHash } from "../format";
import { Link } from "../router";

export const KIND_LABELS: Record<ReportKind, string> = {
  crash: "App chết",
  session_error: "Phiên dịch lỗi",
  sidecar_died: "Tiến trình phụ chết",
  manual: "Gửi tay",
};

export const KIND_TONES: Record<ReportKind, Tone> = {
  crash: "bad",
  session_error: "warn",
  sidecar_died: "warn",
  manual: "info",
};

/** Loại lạ (server thêm sau giao diện) vẫn hiện nguyên mã, tông trung tính. */
export function KindBadge({ kind }: { kind: ReportKind }) {
  return <Badge tone={KIND_TONES[kind] ?? "neutral"}>{KIND_LABELS[kind] ?? kind}</Badge>;
}

/** Báo cáo của bản debug (máy dev): huy hiệu nhỏ cạnh phiên bản. Bản release không có gì. */
export function BuildBadge({ build }: { build: ErrorReport["build"] }) {
  return build === "debug" ? (
    <Badge tone="info" dot={false} outline>
      debug
    </Badge>
  ) : null;
}

/** Cùng mẫu với server (server/src/error-reports.ts): bảng Crockford, không có chữ I, L, O, U. */
export const REPORT_ID_PATTERN = /^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,40}$/;

/** Mã báo cáo người vận hành gõ hay dán: bỏ khoảng trắng hai đầu, viết hoa. Hợp lệ thì trả mã, không thì null. */
export function parseReportId(raw: string): string | null {
  const id = raw.trim().toUpperCase();
  return REPORT_ID_PATTERN.test(id) ? id : null;
}

export const groupPath = (fingerprint: string) => `/errors/groups/${fingerprint}`;
export const reportPath = (id: string) => `/errors/reports/${id}`;

const OS_NAMES: Record<string, string> = { macos: "macOS", windows: "Windows" };

export function osText(r: Pick<ErrorReport, "os_name" | "os_version" | "arch">): string {
  return `${OS_NAMES[r.os_name] ?? r.os_name} ${r.os_version} (${r.arch})`;
}

/** RAM theo MB thành chữ ("24 GB"); không biết thì null. */
export function ramText(mb: number | null): string | null {
  return mb === null ? null : fmtBytes(mb * 1024 * 1024);
}

export const GPU_LABELS: Record<string, string> = { metal: "Metal", vulkan: "Vulkan", cpu: "CPU (không có GPU)" };
export const REPORT_PLAN_LABELS: Record<string, string> = { free: "Free", ...PLAN_LABELS };

/** Tối đa ba phiên bản, còn lại gộp thành "+n". */
export function versionsText(versions: readonly string[]): string {
  return versions.length <= 3 ? versions.join(", ") : `${versions.slice(0, 3).join(", ")} +${versions.length - 3}`;
}

/** Cột bảng nhóm lỗi. `now` (giây): mốc của lần tải, cho thời gian tương đối. */
export function groupColumns(now: number): Column<ErrorGroup>[] {
  return [
    {
      header: "Mã lỗi",
      primary: true,
      cell: (g) => (
        <Cell2
          main={
            <Link to={groupPath(g.fingerprint)} className="row-id mono">
              {g.code ?? "—"}
            </Link>
          }
          sub={g.fingerprint}
        />
      ),
    },
    { header: "Loại", aside: true, cell: (g) => <KindBadge kind={g.kind} /> },
    { header: "Phiên bản", nowrap: true, cell: (g) => versionsText(g.versions) },
    { header: "Máy", align: "right", cell: (g) => fmtInt(g.devices) },
    {
      header: "Báo cáo",
      align: "right",
      cell: (g) => <Cell2 main={fmtInt(g.reports)} sub={g.debug_reports > 0 ? `${fmtInt(g.debug_reports)} debug` : undefined} />,
    },
    { header: "Lần đầu", nowrap: true, hideOnMobile: true, cell: (g) => <WhenCell sec={g.first_at} now={now} /> },
    { header: "Gần nhất", nowrap: true, cell: (g) => <WhenCell sec={g.last_at} now={now} /> },
  ];
}

/** Cột bảng báo cáo (tab Gửi tay, trang nhóm): mã báo cáo mở trang chi tiết, máy mở trang máy. */
export function reportColumns(now: number): Column<ErrorReport>[] {
  return [
    {
      header: "Mã báo cáo",
      primary: true,
      nowrap: true,
      cell: (r) => (
        <Link to={reportPath(r.id)} className="row-id mono">
          {r.id}
        </Link>
      ),
    },
    { header: "Nhận lúc", nowrap: true, cell: (r) => <WhenCell sec={r.received_at} now={now} /> },
    {
      header: "Phiên bản",
      nowrap: true,
      cell: (r) => (
        <span className="cell-version">
          {r.app_version}
          <BuildBadge build={r.build} />
        </span>
      ),
    },
    {
      header: "Máy",
      cell: (r) => (
        <Link to={`/devices/${r.device_id_hash}`} className="mono" title={r.device_id_hash}>
          {shortHash(r.device_id_hash)}
        </Link>
      ),
    },
    { header: "Hệ điều hành", cell: (r) => <Cell2 main={osText(r)} sub={r.chip ?? undefined} /> },
    {
      header: "Thông báo",
      cell: (r) =>
        r.message === "" ? (
          <span className="cell-none">Không có</span>
        ) : (
          <span className="cell-msg" title={r.message}>
            {r.message}
          </span>
        ),
    },
  ];
}
```

- [ ] **Step 5: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/error-kit.test.tsx 2>&1 | tail -12 && pnpm typecheck
```
Expected: PASS; `tsc` không lỗi.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/src/pages/error-fixtures.ts server/admin-ui/src/pages/error-kit.tsx server/admin-ui/src/pages/error-kit.test.tsx && git commit -m "feat(admin-ui): nhãn, cột bảng và chuẩn hóa mã báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Thành phần `LogView` (log dạng văn bản thuần)

**Files:**
- Create: `server/admin-ui/src/components/LogView.tsx`
- Create: `server/admin-ui/src/components/LogView.test.tsx`
- Modify: `server/admin-ui/src/styles/pages.css` (thêm vào cuối file)

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/admin-ui/src/components/LogView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { countLines, LogView } from "./LogView";

const pwned = () => (window as unknown as { __pwned?: number }).__pwned;

describe("countLines", () => {
  it.each([
    ["", 0],
    ["một dòng", 1],
    ["một dòng\n", 1],
    ["a\nb", 2],
    ["a\nb\n", 2],
    ["a\n\nb\n", 3],
  ])("%j có %i dòng (dấu xuống dòng cuối không tạo dòng trống)", (text, n) => {
    expect(countLines(text)).toBe(n);
  });
});

describe("LogView", () => {
  it("hiện log trong <pre> có tên, cuộn được bằng bàn phím, kèm số dòng và dung lượng", () => {
    render(<LogView label="Log ứng dụng (app.log)" text={"dòng 1\ndòng 2\n"} />);
    const region = screen.getByRole("region", { name: "Log ứng dụng (app.log)" });
    expect(region.tagName).toBe("PRE");
    expect(region.tabIndex).toBe(0);
    expect(region.textContent).toBe("dòng 1\ndòng 2\n");
    expect(screen.getByText(/^2 dòng · /)).toBeTruthy();
  });

  it("log chứa HTML và script: hiện thành chữ, không dựng phần tử nào, không chạy gì", () => {
    const evil = '<img src=x onerror="window.__pwned = 1">\n<script>window.__pwned = 2</script>\n<b>đậm</b>';
    const { container } = render(<LogView label="Log" text={evil} />);
    expect(container.querySelector("img, script, b")).toBeNull();
    expect(screen.getByRole("region", { name: "Log" }).textContent).toBe(evil);
    expect(pwned()).toBeUndefined();
  });

  it("log rỗng: trạng thái trống có chú thích, không có <pre>", () => {
    const { container } = render(<LogView label="Log" text="" emptyHint="Báo cáo không kèm log này." />);
    expect(screen.getByText("Log trống")).toBeTruthy();
    expect(screen.getByText("Báo cáo không kèm log này.")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/components/LogView.test.tsx 2>&1 | tail -8
```
Expected: FAIL (không tìm thấy `./LogView`).

- [ ] **Step 3: Viết `LogView.tsx`**

Tạo `server/admin-ui/src/components/LogView.tsx`:

```tsx
// Hiện log của báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4). Log do app gửi lên (đã che dữ liệu cá nhân) nhưng
// vẫn là dữ liệu từ ngoài: CHỈ hiện dạng chuỗi văn bản trong <pre> (React thoát ký tự), không bao giờ dangerouslySetInnerHTML,
// innerHTML hay Markdown. Khung cuộn được bằng bàn phím (tabIndex 0, role region có tên).
import { fmtBytes, fmtInt } from "../format";
import { EmptyState } from "./EmptyState";

/** Số dòng của `text`: dấu xuống dòng cuối không tạo thêm dòng trống. */
export function countLines(text: string): number {
  if (text === "") return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

export function LogView({ label, text, emptyHint }: { label: string; text: string; emptyHint?: string }) {
  if (text === "") return <EmptyState compact title="Log trống" hint={emptyHint} />;
  return (
    <div className="log-view">
      <p className="log-meta">{`${fmtInt(countLines(text))} dòng · ${fmtBytes(new TextEncoder().encode(text).length)}`}</p>
      <pre className="log-pre" tabIndex={0} role="region" aria-label={label}>
        {text}
      </pre>
    </div>
  );
}
```

- [ ] **Step 4: Thêm CSS**

Thêm vào **cuối** `server/admin-ui/src/styles/pages.css`:

```css

/* ======================================================================
   Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4)
   ====================================================================== */
.log-meta {
  margin: 0 0 var(--s-2);
  font-size: var(--fs-xs);
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
/* Log là chuỗi văn bản thô: giữ ngắt dòng, cuộn trong khung (tabIndex 0 nên cuộn được bằng bàn phím) */
.log-pre {
  margin: 0;
  padding: var(--s-3);
  max-height: 420px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
}
@media (max-width: 800px) {
  .log-pre {
    max-height: 320px;
  }
}
```

- [ ] **Step 5: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/components/LogView.test.tsx 2>&1 | tail -10 && pnpm typecheck
```
Expected: PASS; `tsc` không lỗi.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/src/components/LogView.tsx server/admin-ui/src/components/LogView.test.tsx server/admin-ui/src/styles/pages.css && git commit -m "feat(admin-ui): thành phần LogView hiện log dạng văn bản thuần" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Trang `/errors` (tab Nhóm lỗi và tab Gửi tay)

**Files:**
- Create: `server/admin-ui/src/pages/ErrorGroupsPanel.tsx`
- Create: `server/admin-ui/src/pages/ManualReportsPanel.tsx`
- Create: `server/admin-ui/src/pages/ErrorsPage.tsx`
- Create: `server/admin-ui/src/pages/ErrorsPage.test.tsx`
- Modify: `server/admin-ui/src/styles/pages.css` (thêm vào cuối file)

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/admin-ui/src/pages/ErrorsPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortHash } from "../format";
import { DEVICE, FP, group, json, RID, report } from "./error-fixtures";
import { ErrorsPage } from "./ErrorsPage";
import { CODE_ERROR } from "./ManualReportsPanel";
import { VERSION_ERROR } from "./ErrorGroupsPanel";

const EMPTY_PAGE = { items: [], next_cursor: null };
const MANUAL = report({ kind: "manual", code: null, fingerprint: "0000000000000000" });

let urls: string[];
let groups: () => Response;
let reports: () => Response;

beforeEach(() => {
  urls = [];
  groups = () => json(EMPTY_PAGE);
  reports = () => json(EMPTY_PAGE);
  window.history.replaceState(null, "", "/errors");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return url.startsWith("/admin/error-groups") ? groups() : reports();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const cell = (row: HTMLElement, label: string) => row.querySelector<HTMLElement>(`td[data-label="${label}"]`)!;

describe("ErrorsPage: tab Nhóm lỗi", () => {
  it("mở đầu gọi /admin/error-groups; chưa có báo cáo nào thì báo trống", async () => {
    render(<ErrorsPage />);
    expect(await screen.findByText("Chưa có báo cáo lỗi nào")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Báo cáo lỗi" })).toBeTruthy();
    expect(urls).toEqual(["/admin/error-groups"]);
  });

  it("mỗi nhóm: mã lỗi là liên kết tới trang nhóm, loại, các phiên bản, số máy, số báo cáo kèm số debug", async () => {
    groups = () => json({ items: [group()], next_cursor: null });
    render(<ErrorsPage />);
    const link = await screen.findByRole("link", { name: "sidecarFailed" });
    expect(link.getAttribute("href")).toBe(`/errors/groups/${FP}`);
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(cell(row, "Phiên bản").textContent).toBe("0.1.10, 0.1.9");
    expect(cell(row, "Máy").textContent).toBe("4");
    expect(within(cell(row, "Báo cáo")).getByText("1 debug")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".filterbar-count")?.textContent).toBe("1 nhóm"));
  });

  it("bấm vào hàng (ngoài liên kết) mở trang nhóm", async () => {
    groups = () => json({ items: [group()], next_cursor: null });
    render(<ErrorsPage />);
    const row = (await screen.findByRole("link", { name: "sidecarFailed" })).closest("tr") as HTMLElement;
    fireEvent.click(cell(row, "Gần nhất"));
    expect(window.location.pathname).toBe(`/errors/groups/${FP}`);
  });

  it("lọc theo loại: gọi lại với kind=…, về Tất cả thì bỏ tham số; có chip và nút xóa lọc khi rỗng", async () => {
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    expect(screen.getByRole("radiogroup", { name: "Loại" })).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Phiên dịch lỗi" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups?kind=session_error"));
    expect(await screen.findByText("Không có nhóm lỗi nào")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bỏ lọc Loại: Phiên dịch lỗi" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups"));
  });

  it("công tắc Hiện cả báo cáo debug gửi include_debug=1", async () => {
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    await user.click(screen.getByRole("switch", { name: "Hiện cả báo cáo debug" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups?include_debug=1"));
  });

  it("lọc theo phiên bản app: chỉ áp khi bấm Lọc; chuỗi sai mẫu thì báo lỗi và không gọi API", async () => {
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    const box = screen.getByLabelText("Phiên bản app");
    await user.type(box, "$$");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    expect(screen.getByRole("alert").textContent).toBe(VERSION_ERROR);
    expect(urls).toEqual(["/admin/error-groups"]);
    await user.clear(box);
    await user.type(box, "0.1.9");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups?app_version=0.1.9"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ErrorsPage: tab Gửi tay", () => {
  it("đổi sang tab: gọi /admin/error-reports?kind=manual; báo cáo là liên kết tới chi tiết và trang máy", async () => {
    const user = userEvent.setup();
    reports = () => json({ items: [MANUAL], next_cursor: null });
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    await user.click(screen.getByRole("radio", { name: "Gửi tay" }));
    const link = await screen.findByRole("link", { name: RID });
    expect(urls.at(-1)).toBe("/admin/error-reports?kind=manual");
    expect(link.getAttribute("href")).toBe(`/errors/reports/${RID}`);
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: shortHash(DEVICE) }).getAttribute("href")).toBe(`/devices/${DEVICE}`);
  });

  it("?tab=manual của địa chỉ trang mở thẳng tab Gửi tay; chưa có báo cáo gửi tay thì báo trống", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    render(<ErrorsPage />);
    expect(await screen.findByText("Chưa có báo cáo gửi tay nào")).toBeTruthy();
    expect(urls).toEqual(["/admin/error-reports?kind=manual"]);
    expect(screen.getByRole("radio", { name: "Gửi tay" }).getAttribute("aria-checked")).toBe("true");
  });

  it("tìm theo mã báo cáo: chữ thường cũng được (chuẩn hóa thành chữ hoa), có chip, bỏ chip thì bỏ lọc", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo gửi tay nào");
    await user.type(screen.getByLabelText("Mã báo cáo"), "r-7f3k-92qd");
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    await waitFor(() => expect(urls.at(-1)).toBe(`/admin/error-reports?kind=manual&report=${RID}`));
    await user.click(await screen.findByRole("button", { name: `Bỏ lọc Mã báo cáo: ${RID}` }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-reports?kind=manual"));
  });

  it("mã báo cáo sai mẫu: báo lỗi ngay ở ô, không gọi API", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo gửi tay nào");
    await user.type(screen.getByLabelText("Mã báo cáo"), "abc");
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    expect(screen.getByRole("alert").textContent).toBe(CODE_ERROR);
    expect(urls).toEqual(["/admin/error-reports?kind=manual"]);
  });

  it("công tắc Hiện cả báo cáo debug gửi include_debug=1", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo gửi tay nào");
    await user.click(screen.getByRole("switch", { name: "Hiện cả báo cáo debug" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-reports?kind=manual&include_debug=1"));
  });
});

describe("ErrorsPage: lỗi tải", () => {
  it("máy chủ lỗi: hiện câu lỗi có nút Thử lại", async () => {
    groups = () => json({ error: "internal" }, 500);
    render(<ErrorsPage />);
    expect(await screen.findByText("Không tải được danh sách nhóm lỗi")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/ErrorsPage.test.tsx 2>&1 | tail -10
```
Expected: FAIL (không tìm thấy `./ErrorsPage`).

- [ ] **Step 3: Viết tab Nhóm lỗi**

Tạo `server/admin-ui/src/pages/ErrorGroupsPanel.tsx`:

```tsx
// Tab Nhóm lỗi của trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): báo cáo tự động gom theo dấu vân tay (cùng
// loại, cùng mã lỗi, cùng vị trí), mới nhất ở trên. Lọc theo loại và phiên bản app (áp ngay khi đổi loại hay bật công tắc; phiên
// bản áp khi bấm Lọc). Báo cáo của bản debug (máy dev) ẩn mặc định. Bấm hàng để mở trang nhóm.
import { type FormEvent, type ReactNode, useState } from "react";
import { api } from "../api/endpoints";
import type { ErrorGroup, GroupKind } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Field } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { IconFilter } from "../components/icons";
import { usePaged } from "../hooks";
import { groupColumns, groupPath, KIND_LABELS, VERSION_PATTERN } from "./error-kit";
import { emptyProps, ListHeader, ResultCount, SegmentField, useListView } from "./list-kit";

interface Applied {
  kind: "" | GroupKind;
  version: string;
  debug: boolean;
}

const NONE: Applied = { kind: "", version: "", debug: false };

const KIND_OPTIONS: readonly { value: "" | GroupKind; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "crash", label: KIND_LABELS.crash },
  { value: "session_error", label: KIND_LABELS.session_error },
  { value: "sidecar_died", label: KIND_LABELS.sidecar_died },
];

export const VERSION_ERROR = "Phiên bản chỉ gồm chữ, số, dấu chấm, gạch ngang và dấu cộng (tối đa 40 ký tự)";

/** `tabs`: công tắc chuyển tab của ErrorsPage, đặt cạnh nút Làm mới ở đầu trang. */
export function ErrorGroupsPanel({ tabs }: { tabs: ReactNode }) {
  const [f, setF] = useState<Applied>(NONE);
  const [versionDraft, setVersionDraft] = useState("");
  const [versionError, setVersionError] = useState(false);
  const list = usePaged<ErrorGroup>(
    (cursor) =>
      api.errorGroups({
        kind: f.kind || undefined,
        app_version: f.version || undefined,
        include_debug: f.debug ? "1" : undefined,
        cursor,
      }),
    [f],
  );
  const view = useListView(list, JSON.stringify(f));

  function submitVersion(e: FormEvent) {
    e.preventDefault();
    const version = versionDraft.trim();
    if (version !== "" && !VERSION_PATTERN.test(version)) {
      setVersionError(true);
      return;
    }
    setVersionError(false);
    setF({ ...f, version });
  }

  /** Bỏ một bộ lọc đang áp dụng (chip). */
  function drop(patch: Partial<Applied>) {
    setF({ ...f, ...patch });
    if ("version" in patch) {
      setVersionDraft("");
      setVersionError(false);
    }
  }

  function clear() {
    setF(NONE);
    setVersionDraft("");
    setVersionError(false);
  }

  const chips: FilterChip[] = [];
  if (f.kind) chips.push({ key: "kind", name: "Loại", value: KIND_LABELS[f.kind], onRemove: () => drop({ kind: "" }) });
  if (f.version) chips.push({ key: "version", name: "Phiên bản", value: f.version, onRemove: () => drop({ version: "" }) });
  if (f.debug) chips.push({ key: "debug", name: "Báo cáo debug", value: "có hiện", onRemove: () => drop({ debug: false }) });
  const filtered = chips.length > 0;

  return (
    <>
      <ListHeader
        title="Báo cáo lỗi"
        description="Lỗi app gửi về, gom theo dấu vân tay (cùng loại, mã lỗi và vị trí), mới nhất ở trên. Báo cáo tự xóa sau 30 ngày."
        view={view}
        loading={list.loading}
        onReload={list.reload}
        actions={{ before: tabs }}
      />
      <FilterBar
        onSubmit={submitVersion}
        collapsible
        chips={chips}
        onClear={clear}
        count={list.error && list.rows.length === 0 ? undefined : <ResultCount n={list.rows.length} unit="nhóm" hasMore={list.hasMore} view={view} />}
        error={versionError ? VERSION_ERROR : undefined}
      >
        <SegmentField label="Loại" value={f.kind} options={KIND_OPTIONS} onChange={(kind) => setF({ ...f, kind })} />
        <label className="switch">
          <input type="checkbox" role="switch" checked={f.debug} onChange={(e) => setF({ ...f, debug: e.target.checked })} />
          <span>Hiện cả báo cáo debug</span>
        </label>
        <Field label="Phiên bản app" className="err-version">
          <input
            value={versionDraft}
            placeholder="vd. 0.1.10"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={versionError || undefined}
            onChange={(e) => {
              setVersionDraft(e.target.value);
              setVersionError(false);
            }}
          />
        </Field>
        <Button type="submit" icon={<IconFilter size={16} />}>
          Lọc
        </Button>
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách nhóm lỗi" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Danh sách nhóm lỗi" className="list-card">
          <DataTable
            flush
            caption="Danh sách nhóm lỗi"
            columns={groupColumns(view.now)}
            rows={list.rows}
            rowKey={(g) => g.fingerprint}
            rowHref={(g) => groupPath(g.fingerprint)}
            empty={filtered ? "Không có nhóm lỗi nào" : "Chưa có báo cáo lỗi nào"}
            {...emptyProps(filtered, clear, {
              empty: "Báo cáo hiện ở đây khi app trên máy người dùng gặp lỗi và gửi về. Người dùng cũng gửi tay được ở màn hình Giới thiệu.",
              filtered: "Không có nhóm nào khớp bộ lọc đang áp dụng.",
            })}
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} nhóm mới nhất` : undefined}
            skeletonRows={8}
          />
        </Card>
      )}
    </>
  );
}
```

- [ ] **Step 4: Viết tab Gửi tay**

Tạo `server/admin-ui/src/pages/ManualReportsPanel.tsx`:

```tsx
// Tab Gửi tay của trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): báo cáo người dùng gửi bằng nút "Gửi log
// cho hỗ trợ" ở màn hình Giới thiệu, xếp theo thời gian. Người dùng đọc cho hỗ trợ một mã báo cáo (R-XXXX-XXXX): ô "Mã báo
// cáo" tìm đúng báo cáo đó. Báo cáo của bản debug ẩn mặc định.
import { type FormEvent, type ReactNode, useState } from "react";
import { api } from "../api/endpoints";
import type { ErrorReport } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Field } from "../components/Field";
import { type FilterChip, FilterBar } from "../components/FilterBar";
import { IconSearch } from "../components/icons";
import { usePaged } from "../hooks";
import { parseReportId, reportColumns, reportPath } from "./error-kit";
import { emptyProps, ListHeader, ResultCount, useListView } from "./list-kit";

interface Applied {
  report: string;
  debug: boolean;
}

const NONE: Applied = { report: "", debug: false };

export const CODE_ERROR = "Mã báo cáo có dạng R-XXXX-XXXX (chữ hoa và số, không có chữ I, L, O, U)";

/** `tabs`: công tắc chuyển tab của ErrorsPage, đặt cạnh nút Làm mới ở đầu trang. */
export function ManualReportsPanel({ tabs }: { tabs: ReactNode }) {
  const [f, setF] = useState<Applied>(NONE);
  const [draft, setDraft] = useState("");
  const [codeError, setCodeError] = useState(false);
  const list = usePaged<ErrorReport>(
    (cursor) =>
      api.errorReports({
        kind: "manual",
        report: f.report || undefined,
        include_debug: f.debug ? "1" : undefined,
        cursor,
      }),
    [f],
  );
  const view = useListView(list, JSON.stringify(f));

  function search(e: FormEvent) {
    e.preventDefault();
    if (draft.trim() === "") {
      setCodeError(false);
      setF({ ...f, report: "" });
      return;
    }
    const id = parseReportId(draft);
    setCodeError(id === null);
    if (id !== null) setF({ ...f, report: id });
  }

  function dropReport() {
    setDraft("");
    setCodeError(false);
    setF({ ...f, report: "" });
  }

  function clear() {
    setDraft("");
    setCodeError(false);
    setF(NONE);
  }

  const chips: FilterChip[] = [];
  if (f.report) chips.push({ key: "report", name: "Mã báo cáo", value: f.report, onRemove: dropReport });
  if (f.debug) chips.push({ key: "debug", name: "Báo cáo debug", value: "có hiện", onRemove: () => setF({ ...f, debug: false }) });
  const filtered = chips.length > 0;

  return (
    <>
      <ListHeader
        title="Báo cáo lỗi"
        description="Báo cáo người dùng gửi tay ở màn hình Giới thiệu, mới nhất ở trên. Tìm theo mã báo cáo mà người dùng đọc cho hỗ trợ."
        view={view}
        loading={list.loading}
        onReload={list.reload}
        actions={{ before: tabs }}
      />
      <FilterBar
        onSubmit={search}
        collapsible
        chips={chips}
        onClear={clear}
        count={list.error && list.rows.length === 0 ? undefined : <ResultCount n={list.rows.length} unit="báo cáo" hasMore={list.hasMore} view={view} />}
      >
        <Field label="Mã báo cáo" className="err-report-code" error={codeError ? CODE_ERROR : undefined}>
          <input
            value={draft}
            placeholder="R-7F3K-92QD"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={codeError || undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setCodeError(false);
            }}
          />
        </Field>
        <Button type="submit" variant="primary" icon={<IconSearch size={16} />}>
          Tìm
        </Button>
        <label className="switch">
          <input type="checkbox" role="switch" checked={f.debug} onChange={(e) => setF({ ...f, debug: e.target.checked })} />
          <span>Hiện cả báo cáo debug</span>
        </label>
      </FilterBar>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được danh sách báo cáo gửi tay" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Danh sách báo cáo gửi tay" className="list-card">
          <DataTable
            flush
            caption="Danh sách báo cáo gửi tay"
            columns={reportColumns(view.now)}
            rows={list.rows}
            rowKey={(r) => r.id}
            rowHref={(r) => reportPath(r.id)}
            empty={filtered ? "Không có báo cáo nào" : "Chưa có báo cáo gửi tay nào"}
            {...emptyProps(filtered, clear, {
              empty: "Báo cáo hiện ở đây khi người dùng bấm Gửi log cho hỗ trợ ở màn hình Giới thiệu của app.",
              filtered: "Không có báo cáo nào khớp bộ lọc đang áp dụng.",
            })}
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} báo cáo mới nhất` : undefined}
            skeletonRows={8}
          />
        </Card>
      )}
    </>
  );
}
```

- [ ] **Step 5: Viết trang có hai tab**

Tạo `server/admin-ui/src/pages/ErrorsPage.tsx`:

```tsx
// Trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): hai tab, Nhóm lỗi (mặc định) và Gửi tay. Tab đầu đọc từ
// `?tab=manual` của địa chỉ trang khi mở (như AuditPage đọc `?action=`): đường dẫn từ trang chi tiết của báo cáo gửi tay về đúng tab.
import { useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { ErrorGroupsPanel } from "./ErrorGroupsPanel";
import { ManualReportsPanel } from "./ManualReportsPanel";

type Tab = "groups" | "manual";

function initialTab(): Tab {
  return new URLSearchParams(window.location.search).get("tab") === "manual" ? "manual" : "groups";
}

export function ErrorsPage() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs = (
    <SegmentedControl
      label="Loại báo cáo"
      value={tab}
      onChange={setTab}
      options={[
        { value: "groups", label: "Nhóm lỗi" },
        { value: "manual", label: "Gửi tay" },
      ]}
    />
  );
  return tab === "groups" ? <ErrorGroupsPanel tabs={tabs} /> : <ManualReportsPanel tabs={tabs} />;
}
```

- [ ] **Step 6: Thêm CSS**

Thêm vào **cuối** `server/admin-ui/src/styles/pages.css` (sau khối của Task 3):

```css

/* Cột Thông báo của bảng báo cáo: một dòng, cắt bằng dấu chấm lửng (đầy đủ ở title); phiên bản kèm huy hiệu debug */
.cell-msg {
  display: block;
  max-width: 40ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-version {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}
.err-version input {
  width: 140px;
}
.err-report-code input {
  width: 200px;
  font-family: var(--mono);
}
@media (max-width: 800px) {
  .cell-msg {
    max-width: none;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
```

- [ ] **Step 7: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/ErrorsPage.test.tsx 2>&1 | tail -15 && pnpm typecheck
```
Expected: PASS toàn bộ; `tsc` không lỗi. Nếu một ca đỏ vì tên truy cập (`getByRole`/`getByLabelText`), đối chiếu với DOM thật của `FilterBar`, `SegmentedControl`, `Field` đã đọc ở các file mẫu; **không đổi tên hiển thị** của spec để chiều test.

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/src/pages/ErrorGroupsPanel.tsx server/admin-ui/src/pages/ManualReportsPanel.tsx server/admin-ui/src/pages/ErrorsPage.tsx server/admin-ui/src/pages/ErrorsPage.test.tsx server/admin-ui/src/styles/pages.css && git commit -m "feat(admin-ui): trang Báo cáo lỗi với tab Nhóm lỗi và tab Gửi tay" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Trang một nhóm và xóa cả nhóm

**Files:**
- Create: `server/admin-ui/src/pages/ErrorGroupPage.tsx`
- Create: `server/admin-ui/src/pages/ErrorGroupPage.test.tsx`

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/admin-ui/src/pages/ErrorGroupPage.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FP, json, report } from "./error-fixtures";
import { ErrorGroupPage } from "./ErrorGroupPage";

let calls: { url: string; method: string; body: unknown }[];
let reports: () => Response;
let deleteReply: () => Response;

const LIST_URL = `/admin/error-reports?fingerprint=${FP}&include_debug=1`;
const listCalls = () => calls.filter((c) => c.url.startsWith("/admin/error-reports?"));

beforeEach(() => {
  calls = [];
  reports = () => json({ items: [report({ id: "R-0000-0001" }), report({ id: "R-0000-0002", build: "debug" })], next_cursor: null });
  deleteReply = () => json({ deleted: 2 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return url === "/admin/error-reports/delete" ? deleteReply() : reports();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ErrorGroupPage", () => {
  it("gọi báo cáo của nhóm kèm cả báo cáo debug; tiêu đề là mã lỗi của báo cáo đầu, có huy hiệu loại và dấu vân tay", async () => {
    render(<ErrorGroupPage fingerprint={FP} />);
    expect(await screen.findByRole("heading", { level: 1, name: "sidecarFailed" })).toBeTruthy();
    expect(calls[0]?.url).toBe(LIST_URL);
    expect(screen.getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(screen.getByText(FP)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chép dấu vân tay" })).toBeTruthy();
  });

  it("đường dẫn về Báo cáo lỗi; mỗi báo cáo là liên kết tới chi tiết, báo cáo debug có huy hiệu", async () => {
    render(<ErrorGroupPage fingerprint={FP} />);
    const link = await screen.findByRole("link", { name: "R-0000-0001" });
    expect(link.getAttribute("href")).toBe("/errors/reports/R-0000-0001");
    const crumbs = within(screen.getByRole("navigation", { name: "Đường dẫn" }));
    expect(crumbs.getByRole("link", { name: "Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
    const row2 = screen.getByRole("link", { name: "R-0000-0002" }).closest("tr") as HTMLElement;
    expect(within(row2).getByText("debug")).toBeTruthy();
  });

  it("xóa cả nhóm: hộp xác nhận không đòi lý do; xác nhận gửi {fingerprint}, báo kết quả và tải lại danh sách (rỗng thì báo nhóm không còn)", async () => {
    const user = userEvent.setup();
    render(<ErrorGroupPage fingerprint={FP} />);
    await screen.findByRole("link", { name: "R-0000-0001" });
    await user.click(screen.getByRole("button", { name: "Xóa nhóm…" }));
    const dialog = screen.getByRole("dialog", { name: "Xóa cả nhóm lỗi này?" });
    expect(within(dialog).getByText(/2 báo cáo/)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Lý do/)).toBeNull();
    reports = () => json({ items: [], next_cursor: null });
    await user.click(within(dialog).getByRole("button", { name: "Xóa nhóm" }));
    expect(await screen.findByText("Đã xóa 2 báo cáo.")).toBeTruthy();
    expect(calls.find((c) => c.url === "/admin/error-reports/delete")).toEqual({
      url: "/admin/error-reports/delete",
      method: "POST",
      body: { fingerprint: FP },
    });
    expect(await screen.findByText("Nhóm này không còn báo cáo nào")).toBeTruthy();
    expect(listCalls()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Xóa nhóm…" })).toBeNull();
    expect(screen.getByRole("link", { name: "Về Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
  });

  it("xóa gặp 404 (nhóm đã bị xóa nơi khác): hộp báo lỗi và trang tải lại", async () => {
    const user = userEvent.setup();
    deleteReply = () => json({ error: "not_found" }, 404);
    render(<ErrorGroupPage fingerprint={FP} />);
    await screen.findByRole("link", { name: "R-0000-0001" });
    await user.click(screen.getByRole("button", { name: "Xóa nhóm…" }));
    await user.click(within(screen.getByRole("dialog", { name: "Xóa cả nhóm lỗi này?" })).getByRole("button", { name: "Xóa nhóm" }));
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(within(screen.getByRole("dialog", { name: "Xóa cả nhóm lỗi này?" })).getByRole("alert").textContent).toContain("Không tìm thấy");
  });

  it("nhóm không có báo cáo nào: trạng thái trống, không có Khu vực nguy hiểm", async () => {
    reports = () => json({ items: [], next_cursor: null });
    render(<ErrorGroupPage fingerprint={FP} />);
    expect(await screen.findByText("Nhóm này không còn báo cáo nào")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Nhóm lỗi" })).toBeTruthy();
    expect(screen.queryByText("Khu vực nguy hiểm")).toBeNull();
  });

  it("máy chủ lỗi: hiện câu lỗi có nút Thử lại", async () => {
    reports = () => json({ error: "internal" }, 500);
    render(<ErrorGroupPage fingerprint={FP} />);
    expect(await screen.findByText("Không tải được các báo cáo của nhóm")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/ErrorGroupPage.test.tsx 2>&1 | tail -8
```
Expected: FAIL (không tìm thấy `./ErrorGroupPage`).

- [ ] **Step 3: Viết trang**

Tạo `server/admin-ui/src/pages/ErrorGroupPage.tsx`:

```tsx
// Trang một nhóm lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): các báo cáo cùng dấu vân tay, mới nhất ở trên; xóa cả nhóm.
// API không có route "một nhóm", nên tên và loại của nhóm lấy từ báo cáo đầu tiên và số báo cáo từ danh sách đã tải ("50+" khi còn
// trang sau). Trang luôn kèm báo cáo debug (có huy hiệu): nhóm chỉ có báo cáo debug cũng mở được.
import { useState } from "react";
import { api } from "../api/endpoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { DataTable } from "../components/DataTable";
import { ErrorBox, NoticeRegion, useNotice } from "../components/Feedback";
import { IconArrowLeft, IconRefresh } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { fmtInt } from "../format";
import { usePaged } from "../hooks";
import { DangerZone } from "./detail-kit";
import { KindBadge, reportColumns, reportPath } from "./error-kit";
import { ResultCount, useListView } from "./list-kit";

export function ErrorGroupPage({ fingerprint }: { fingerprint: string }) {
  const list = usePaged((cursor) => api.errorReports({ fingerprint, include_debug: "1", cursor }), [fingerprint]);
  const view = useListView(list, fingerprint);
  const notice = useNotice();
  const [confirming, setConfirming] = useState(false);
  const first = list.rows[0];
  const crumbs = [{ label: "Báo cáo lỗi", to: "/errors" }, { label: first?.code ?? fingerprint }];
  const count = list.hasMore ? `${fmtInt(list.rows.length)}+ báo cáo` : `${fmtInt(list.rows.length)} báo cáo`;
  return (
    <>
      <PageHeader
        breadcrumb={crumbs}
        title={<span className="mono">{first?.code ?? "Nhóm lỗi"}</span>}
        badges={first ? <KindBadge kind={first.kind} /> : undefined}
        description={
          <p className="page-meta detail-meta">
            <span className="hash-line">
              <code>{fingerprint}</code>
              <CopyButton text={fingerprint} appearance="icon" what="dấu vân tay" />
            </span>
            <span>
              <ResultCount n={list.rows.length} unit="báo cáo" hasMore={list.hasMore} view={view} />
            </span>
          </p>
        }
        actions={
          <Button icon={<IconRefresh size={16} />} loading={list.loading} onClick={list.reload}>
            Làm mới
          </Button>
        }
      />
      <NoticeRegion handle={notice} />
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} title="Không tải được các báo cáo của nhóm" />}
      {!(list.error && list.rows.length === 0) && (
        <Card flush aria-label="Báo cáo của nhóm" className="list-card">
          <DataTable
            flush
            caption="Báo cáo của nhóm"
            columns={reportColumns(view.now)}
            rows={list.rows}
            rowKey={(r) => r.id}
            rowHref={(r) => reportPath(r.id)}
            empty="Nhóm này không còn báo cáo nào"
            emptyHint="Nhóm đã bị xóa, hay các báo cáo đã quá 30 ngày và tự bị xóa."
            emptyAction={
              <Button to="/errors" icon={<IconArrowLeft size={16} />}>
                Về Báo cáo lỗi
              </Button>
            }
            hasMore={list.hasMore}
            loading={list.loading}
            stale={view.stale}
            onMore={list.more}
            summary={list.hasMore ? `Đang hiện ${list.rows.length} báo cáo mới nhất` : undefined}
            skeletonRows={6}
          />
        </Card>
      )}
      {list.rows.length > 0 && (
        <DangerZone
          items={[
            {
              name: "Xóa cả nhóm",
              effect: "Xóa mọi báo cáo của nhóm này (kể cả báo cáo debug) và log của chúng khỏi máy chủ. App vẫn gửi lỗi này nếu còn gặp, nhóm sẽ hiện lại.",
              button: (
                <Button variant="danger" onClick={() => setConfirming(true)}>
                  Xóa nhóm…
                </Button>
              ),
            },
          ]}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title="Xóa cả nhóm lỗi này?"
          description={`Xóa toàn bộ ${count} của nhóm này (kể cả báo cáo debug), cùng log của chúng. Không hoàn tác được.`}
          confirmLabel="Xóa nhóm"
          needsNote={false}
          tone="danger"
          onConfirm={async () => {
            const done = await api.deleteErrorGroup(fingerprint);
            notice.show(`Đã xóa ${fmtInt(done.deleted)} báo cáo.`);
            list.reload();
          }}
          onConflict={list.reload}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/ErrorGroupPage.test.tsx 2>&1 | tail -15 && pnpm typecheck
```
Expected: PASS; `tsc` không lỗi.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/src/pages/ErrorGroupPage.tsx server/admin-ui/src/pages/ErrorGroupPage.test.tsx && git commit -m "feat(admin-ui): trang một nhóm lỗi và xóa cả nhóm" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Trang chi tiết một báo cáo và xóa một báo cáo

**Files:**
- Create: `server/admin-ui/src/pages/ErrorReportPage.tsx`
- Create: `server/admin-ui/src/pages/ErrorReportPage.test.tsx`
- Modify: `server/admin-ui/src/styles/pages.css` (thêm vào cuối file)

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/admin-ui/src/pages/ErrorReportPage.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortHash } from "../format";
import { DEVICE, detail, FP, json, RID } from "./error-fixtures";
import { ErrorReportPage } from "./ErrorReportPage";

let calls: { url: string; method: string; body: unknown }[];
let current: () => Response;
let deleteReply: () => Response;

beforeEach(() => {
  calls = [];
  current = () => json(detail());
  deleteReply = () => json({ deleted: 1 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return url === "/admin/error-reports/delete" ? deleteReply() : current();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Giá trị của một dòng trong thẻ Thông tin (KeyValue). */
const valueOf = (label: string) => (screen.getByText(label, { selector: "dt" }).closest(".kv-row") as HTMLElement).querySelector("dd")?.textContent;

describe("ErrorReportPage: nội dung", () => {
  it("gọi báo cáo theo mã; mã là tiêu đề có nút chép; hiện loại và mọi thông tin máy", async () => {
    render(<ErrorReportPage id={RID} />);
    expect(await screen.findByRole("heading", { level: 1, name: RID })).toBeTruthy();
    expect(calls[0]?.url).toBe(`/admin/error-reports/${RID}`);
    expect(screen.getByRole("button", { name: "Chép mã báo cáo" })).toBeTruthy();
    expect(screen.getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(valueOf("Mã lỗi")).toBe("sidecarFailed");
    expect(valueOf("Phiên bản app")).toBe("0.1.10");
    expect(valueOf("Hệ điều hành")).toBe("macOS 15.6.1 (aarch64)");
    expect(valueOf("Chip")).toBe("Apple M4 Pro");
    expect(valueOf("RAM")).toBe("24 GB");
    expect(valueOf("GPU")).toBe("Metal");
    expect(valueOf("Gói model")).toBe("standard");
    expect(valueOf("Gói bản quyền")).toBe("Monthly");
    expect(valueOf("Ngôn ngữ giao diện")).toBe("vi");
    expect(screen.getByText("tiến trình phụ không khởi động được")).toBeTruthy();
  });

  it("máy là liên kết tới trang máy (kèm nút chép mã đầy đủ); dấu vân tay là liên kết tới trang nhóm; đường dẫn về nhóm", async () => {
    render(<ErrorReportPage id={RID} />);
    const device = await screen.findByRole("link", { name: shortHash(DEVICE) });
    expect(device.getAttribute("href")).toBe(`/devices/${DEVICE}`);
    expect(screen.getByRole("button", { name: "Chép mã máy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: FP }).getAttribute("href")).toBe(`/errors/groups/${FP}`);
    const crumbs = within(screen.getByRole("navigation", { name: "Đường dẫn" }));
    expect(crumbs.getByRole("link", { name: "Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
    expect(crumbs.getByRole("link", { name: "sidecarFailed" }).getAttribute("href")).toBe(`/errors/groups/${FP}`);
  });

  it("báo cáo gửi tay: không có dòng dấu vân tay, đường dẫn về tab Gửi tay", async () => {
    current = () => json(detail({ kind: "manual", code: null, fingerprint: "0000000000000000" }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(screen.queryByText("Dấu vân tay", { selector: "dt" })).toBeNull();
    expect(valueOf("Mã lỗi")).toBe("—");
    const crumbs = within(screen.getByRole("navigation", { name: "Đường dẫn" }));
    expect(crumbs.getByRole("link", { name: "Báo cáo lỗi" }).getAttribute("href")).toBe("/errors?tab=manual");
  });

  it("báo cáo của bản debug có huy hiệu debug ở dòng phiên bản", async () => {
    current = () => json(detail({ build: "debug" }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(within((screen.getByText("Phiên bản app", { selector: "dt" }).closest(".kv-row")) as HTMLElement).getByText("debug")).toBeTruthy();
  });

  it("thông tin thiếu (chip, RAM, GPU, gói model, gói bản quyền là null) hiện dấu —", async () => {
    current = () => json(detail({ chip: null, ram_mb: null, gpu_backend: null, model_pack: null, plan: null }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    for (const label of ["Chip", "RAM", "GPU", "Gói model", "Gói bản quyền"]) expect(valueOf(label)).toBe("—");
  });
});

describe("ErrorReportPage: log là văn bản thuần", () => {
  it("ba log, mỗi log một vùng có tên và nút chép riêng, nội dung nguyên văn", async () => {
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    const app = screen.getByRole("region", { name: "Log ứng dụng (app.log)" });
    const asr = screen.getByRole("region", { name: "Log nhận dạng giọng nói (asr-worker.log)" });
    const llama = screen.getByRole("region", { name: "Log bộ dịch (llama-server.log)" });
    expect(app.textContent).toBe("[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n");
    expect(asr.textContent).toBe("ggml_metal_init: error: failed to load\n");
    expect(llama.textContent).toBe("0.00.289.523 W load: special_eos_id is not in special_eog_ids\n");
    for (const name of ["Chép log ứng dụng", "Chép log nhận dạng giọng nói", "Chép log bộ dịch"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("log và thông báo chứa <img onerror>, <script>: hiện thành chữ, không dựng phần tử, không chạy", async () => {
    const evil = '<img src=x onerror="window.__pwned = 1">\n<script>window.__pwned = 2</script>';
    current = () => json(detail({ message: evil, logs: { app: evil, asr: evil, llama: evil } }));
    const { container } = render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByRole("region", { name: "Log ứng dụng (app.log)" }).textContent).toBe(evil);
    expect(screen.getAllByText(/onerror/)).toHaveLength(4);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("log rỗng: ghi Log trống, không có nút chép của log đó", async () => {
    current = () => json(detail({ logs: { app: "dòng", asr: "", llama: "" } }));
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    expect(screen.getAllByText("Log trống")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Chép log nhận dạng giọng nói" })).toBeNull();
    expect(screen.getByRole("button", { name: "Chép log ứng dụng" })).toBeTruthy();
  });
});

describe("ErrorReportPage: xóa và lỗi", () => {
  it("xóa một báo cáo: hộp xác nhận không đòi lý do, gửi {id}, rồi hiện trạng thái đã xóa kèm nút về danh sách", async () => {
    const user = userEvent.setup();
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    await user.click(screen.getByRole("button", { name: "Xóa báo cáo…" }));
    const dialog = screen.getByRole("dialog", { name: "Xóa báo cáo này?" });
    expect(within(dialog).queryByLabelText(/Lý do/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Xóa báo cáo" }));
    expect(await screen.findByText("Đã xóa báo cáo này")).toBeTruthy();
    expect(screen.getByText("Đã xóa báo cáo.")).toBeTruthy();
    expect(calls.find((c) => c.url === "/admin/error-reports/delete")).toEqual({ url: "/admin/error-reports/delete", method: "POST", body: { id: RID } });
    expect(screen.getByRole("link", { name: "Về Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
    expect(screen.queryByRole("region", { name: "Log ứng dụng (app.log)" })).toBeNull();
  });

  it("xóa gặp 404: hộp báo lỗi và trang tải lại, rồi hiện không tìm thấy", async () => {
    const user = userEvent.setup();
    render(<ErrorReportPage id={RID} />);
    await screen.findByRole("heading", { level: 1, name: RID });
    await user.click(screen.getByRole("button", { name: "Xóa báo cáo…" }));
    deleteReply = () => json({ error: "not_found" }, 404);
    current = () => json({ error: "not_found" }, 404);
    await user.click(within(screen.getByRole("dialog", { name: "Xóa báo cáo này?" })).getByRole("button", { name: "Xóa báo cáo" }));
    await waitFor(() => expect(calls.filter((c) => c.url === `/admin/error-reports/${RID}`)).toHaveLength(2));
  });

  it("không có báo cáo (404): trạng thái không tìm thấy với nút về danh sách", async () => {
    current = () => json({ error: "not_found" }, 404);
    render(<ErrorReportPage id={RID} />);
    expect(await screen.findByText("Không có báo cáo này")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
  });

  it("máy chủ lỗi: hiện câu lỗi có nút Thử lại", async () => {
    current = () => json({ error: "internal" }, 500);
    render(<ErrorReportPage id={RID} />);
    expect(await screen.findByText("Không tải được báo cáo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/ErrorReportPage.test.tsx 2>&1 | tail -8
```
Expected: FAIL (không tìm thấy `./ErrorReportPage`).

- [ ] **Step 3: Viết trang**

Tạo `server/admin-ui/src/pages/ErrorReportPage.tsx`:

```tsx
// Chi tiết một báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): thông tin máy và app, thông báo lỗi, ba log dạng
// VĂN BẢN THUẦN (LogView; log do app gửi, không bao giờ dựng HTML từ nó), liên kết sang trang máy và trang nhóm, xóa báo cáo.
// Mở trang này ghi một dòng nhật ký error_report_viewed (server).
import { useState } from "react";
import { api } from "../api/endpoints";
import type { ErrorReportDetail } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { EmptyState } from "../components/EmptyState";
import { ErrorBox, NoticeRegion, useNotice } from "../components/Feedback";
import { IconAlert, IconArrowLeft, IconInfo, IconLog } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { LogView } from "../components/LogView";
import { type Crumb, PageHeader } from "../components/PageHeader";
import { RelTime } from "../components/RelTime";
import { fmtDateTime, nowSec, shortHash } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";
import { ago, DangerZone, DetailLayout, DetailSkeleton } from "./detail-kit";
import { BuildBadge, GPU_LABELS, groupPath, KindBadge, osText, ramText, REPORT_PLAN_LABELS } from "./error-kit";

const LOGS = [
  { key: "app", title: "Log ứng dụng", file: "app.log", note: "300 dòng cuối, đã che dữ liệu cá nhân." },
  { key: "asr", title: "Log nhận dạng giọng nói", file: "asr-worker.log", note: "Dòng cảnh báo hay lỗi và 60 dòng cuối." },
  { key: "llama", title: "Log bộ dịch", file: "llama-server.log", note: "Dòng cảnh báo hay lỗi và 60 dòng cuối." },
] as const;

const listPath = (r: ErrorReportDetail | null) => (r?.kind === "manual" ? "/errors?tab=manual" : "/errors");

function crumbsOf(r: ErrorReportDetail | null, id: string): Crumb[] {
  const root = { label: "Báo cáo lỗi", to: listPath(r) };
  if (r && r.kind !== "manual") return [root, { label: r.code ?? r.fingerprint, to: groupPath(r.fingerprint) }, { label: id }];
  return [root, { label: id }];
}

export function ErrorReportPage({ id }: { id: string }) {
  const data = useLoad(() => api.errorReport(id), [id]);
  const notice = useNotice();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const r = data.data;
  const crumbs = crumbsOf(r, id);
  const title = <span className="mono">{id}</span>;
  const back = (
    <Button to={listPath(r)} icon={<IconArrowLeft size={16} />}>
      Về Báo cáo lỗi
    </Button>
  );

  if (deleted) {
    return (
      <>
        <PageHeader breadcrumb={crumbs} title={title} />
        <NoticeRegion handle={notice} />
        <Card aria-label="Báo cáo đã xóa">
          <EmptyState variant="success" title="Đã xóa báo cáo này" hint="Báo cáo và log của nó không còn trên máy chủ." action={back} />
        </Card>
      </>
    );
  }
  if (data.error) {
    if (data.error.status === 404) {
      return (
        <>
          <PageHeader breadcrumb={crumbs} title={title} />
          <Card aria-label="Không có báo cáo này">
            <EmptyState
              variant="no-results"
              title="Không có báo cáo này"
              hint="Máy chủ không có báo cáo mang mã này: mã gõ nhầm, hay báo cáo đã bị xóa (báo cáo tự xóa sau 30 ngày)."
              action={back}
            />
          </Card>
        </>
      );
    }
    return (
      <>
        <PageHeader breadcrumb={crumbs} title={title} />
        <ErrorBox error={data.error} onRetry={data.reload} title="Không tải được báo cáo" />
      </>
    );
  }
  if (!r) return <DetailSkeleton breadcrumb={crumbs} label="Đang tải báo cáo…" />;

  const now = nowSec();
  return (
    <>
      <PageHeader
        breadcrumb={crumbs}
        title={title}
        titleAside={<CopyButton text={r.id} appearance="icon" what="mã báo cáo" />}
        badges={<KindBadge kind={r.kind} />}
        description={
          <p className="page-meta detail-meta">
            <span>{r.kind === "manual" ? "Người dùng gửi tay" : "App tự gửi"}</span>
            <span>
              nhận <RelTime sec={r.received_at} now={now} />
            </span>
          </p>
        }
      />
      <NoticeRegion handle={notice} />
      <DetailLayout
        side={
          <Card title="Thông tin" icon={<IconInfo size={18} />}>
            <KeyValue
              items={[
                { label: "Mã báo cáo", value: r.id, mono: true },
                { label: "Mã lỗi", value: r.code, mono: true },
                { label: "Nhận lúc", value: fmtDateTime(r.received_at), hint: ago(r.received_at, now) },
                { label: "Xảy ra lúc", value: fmtDateTime(r.occurred_at), hint: "giờ trên máy người dùng" },
                { label: "Phiên bản app", value: r.app_version, badge: <BuildBadge build={r.build} /> },
                { label: "Hệ điều hành", value: osText(r) },
                { label: "Chip", value: r.chip },
                { label: "RAM", value: ramText(r.ram_mb) },
                { label: "GPU", value: r.gpu_backend === null ? null : (GPU_LABELS[r.gpu_backend] ?? r.gpu_backend) },
                { label: "Gói model", value: r.model_pack },
                { label: "Gói bản quyền", value: r.plan === null ? null : (REPORT_PLAN_LABELS[r.plan] ?? r.plan) },
                { label: "Ngôn ngữ giao diện", value: r.ui_lang },
                {
                  label: "Máy",
                  value: (
                    <Link to={`/devices/${r.device_id_hash}`} title={r.device_id_hash}>
                      {shortHash(r.device_id_hash)}
                    </Link>
                  ),
                  mono: true,
                  copy: r.device_id_hash,
                  copyWhat: "mã máy",
                },
                {
                  label: "Dấu vân tay",
                  value: <Link to={groupPath(r.fingerprint)}>{r.fingerprint}</Link>,
                  mono: true,
                  copy: r.fingerprint,
                  copyWhat: "dấu vân tay",
                  hidden: r.kind === "manual",
                },
              ]}
            />
          </Card>
        }
        main={
          <>
            <Card title="Thông báo lỗi" icon={<IconAlert size={18} />}>
              {r.message === "" ? <EmptyState compact title="Không có thông báo" /> : <p className="err-message">{r.message}</p>}
            </Card>
            {LOGS.map((l) => (
              <Card
                key={l.key}
                title={l.title}
                icon={<IconLog size={18} />}
                description={`${l.file}: ${l.note}`}
                actions={r.logs[l.key] === "" ? undefined : <CopyButton text={r.logs[l.key]} appearance="icon" what={l.title.toLowerCase()} />}
              >
                <LogView label={`${l.title} (${l.file})`} text={r.logs[l.key]} emptyHint="Báo cáo không kèm log này." />
              </Card>
            ))}
          </>
        }
        danger={
          <DangerZone
            items={[
              {
                name: "Xóa báo cáo này",
                effect: "Xóa báo cáo và log khỏi máy chủ. Báo cáo cũng tự bị xóa sau 30 ngày.",
                button: (
                  <Button variant="danger" onClick={() => setConfirming(true)}>
                    Xóa báo cáo…
                  </Button>
                ),
              },
            ]}
          />
        }
      />
      {confirming && (
        <ConfirmDialog
          title="Xóa báo cáo này?"
          description={`Xóa báo cáo ${r.id} và log của nó khỏi máy chủ. Không hoàn tác được.`}
          confirmLabel="Xóa báo cáo"
          needsNote={false}
          tone="danger"
          onConfirm={async () => {
            await api.deleteErrorReport(r.id);
            notice.show("Đã xóa báo cáo.");
            setDeleted(true);
          }}
          onConflict={data.reload}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Thêm CSS**

Thêm vào **cuối** `server/admin-ui/src/styles/pages.css`:

```css

/* Thông báo lỗi ở trang chi tiết: chữ mono, giữ ngắt dòng, không tràn ô */
.err-message {
  margin: 0;
  font-family: var(--mono);
  font-size: var(--fs-sm);
  color: var(--ink);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 5: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/pages/ErrorReportPage.test.tsx 2>&1 | tail -18 && pnpm typecheck
```
Expected: PASS toàn bộ; `tsc` không lỗi. Ghi chú để gỡ lỗi nếu cần: `valueOf("Mã lỗi")` đọc `<dd>` của KeyValue (giá trị `null` hiện "—"); thông báo lỗi ở test XSS xuất hiện đúng 4 lần (một ở thẻ Thông báo lỗi, ba ở ba log).

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/src/pages/ErrorReportPage.tsx server/admin-ui/src/pages/ErrorReportPage.test.tsx server/admin-ui/src/styles/pages.css && git commit -m "feat(admin-ui): trang chi tiết báo cáo lỗi với log dạng văn bản thuần và xóa báo cáo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Nối vào router, thanh bên, khung trang và nhãn nhật ký

**Files:**
- Modify: `server/admin-ui/src/components/icons.tsx` (thêm vào cuối file)
- Modify: `server/admin-ui/src/router.tsx`, `server/admin-ui/src/router.test.tsx`
- Modify: `server/admin-ui/src/components/Sidebar.tsx`, `server/admin-ui/src/components/Sidebar.test.tsx`
- Modify: `server/admin-ui/src/App.tsx`, `server/admin-ui/src/App.test.tsx`
- Modify: `server/admin-ui/src/audit-labels.ts`, `server/admin-ui/src/audit-labels.test.ts`

- [ ] **Step 1: Sửa và thêm test (đỏ)**

**`router.test.tsx`:** thêm hai hằng sau `const HASH = "a".repeat(64);`:

```ts
const FP = "3fa1c09be2d47a55";
const RID = "R-7F3K-92QD";
```

và thêm các ca vào bảng `it.each` của `matchRoute`, ngay sau dòng `["/tools", { name: "tools" }],`:

```ts
    ["/errors", { name: "errors" }],
    ["/errors/", { name: "errors" }],
    [`/errors/groups/${FP}`, { name: "error_group", param: FP }],
    [`/errors/reports/${RID}`, { name: "error_report", param: RID }],
    ["/errors/groups/xyz", { name: "not_found" }],
    [`/errors/groups/${FP.toUpperCase()}`, { name: "not_found" }],
    ["/errors/reports/r-7f3k-92qd", { name: "not_found" }],
    ["/errors/reports/R-7F3I-92QD", { name: "not_found" }],
    ["/errors/x", { name: "not_found" }],
```

**`Sidebar.test.tsx`:** trong test đầu tiên đổi `expect(links).toHaveLength(8);` thành `expect(links).toHaveLength(9);`, và thêm test này ngay **trước** dòng `  it("không có việc (0 hay null): không có huy hiệu; nhiều việc: hiện 99+", () => {`:

```tsx
  it("mục Báo cáo lỗi sáng ở cả ba trang của nó (danh sách, nhóm, chi tiết), nằm trong nhóm Dữ liệu", () => {
    for (const current of ["errors", "error_group", "error_report"] as const) {
      const { unmount } = render(<Sidebar current={current} queueCount={null} collapsed={false} onToggleCollapsed={() => {}} open={false} onClose={() => {}} />);
      const link = nav().getByRole("link", { name: "Báo cáo lỗi" });
      expect(link.getAttribute("href")).toBe("/errors");
      expect(link.getAttribute("aria-current")).toBe("page");
      expect(within(nav().getByRole("list", { name: "Dữ liệu" })).getByRole("link", { name: "Báo cáo lỗi" })).toBe(link);
      unmount();
    }
  });

```

**`App.test.tsx`:**
1. Trong `responses`, thêm sau dòng `  "/admin/orders": { items: [], next_cursor: null },`:

```ts
  "/admin/error-groups": { items: [], next_cursor: null },
```

2. Trong test `"thanh bên chia ba nhóm …"`, đổi danh sách liên kết: thay

```ts
      "Máy & dùng thử",
      "Nhật ký",
```
bằng
```ts
      "Máy & dùng thử",
      "Báo cáo lỗi",
      "Nhật ký",
```

3. Thêm test mới ngay **trước** dòng `  it("thanh bên chia ba nhóm Vận hành, Dữ liệu, Hệ thống; mục Hệ thống nằm trong nhóm Hệ thống, bấm thì sang /system", async () => {`:

```tsx
  it("mục Báo cáo lỗi: sang /errors, hiện trang, đánh dấu mục đang chọn và đổi tiêu đề tab", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const link = screen.getByRole("link", { name: "Báo cáo lỗi" });
    expect(link.getAttribute("href")).toBe("/errors");
    await user.click(link);
    expect(window.location.pathname).toBe("/errors");
    expect(await screen.findByRole("heading", { level: 1, name: "Báo cáo lỗi" })).toBeTruthy();
    expect(await screen.findByText("Chưa có báo cáo lỗi nào")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Báo cáo lỗi" }).className).toContain("active");
    expect(document.title).toBe("Báo cáo lỗi · AI Translator Admin");
  });

```

**`audit-labels.test.ts`:** thêm vào cuối file (trước hoặc sau `describe` cuối, ngoài mọi `describe`):

```ts

describe("audit-labels: báo cáo lỗi của app", () => {
  it.each([
    ["error_report_viewed", "Xem báo cáo lỗi", "default"],
    ["error_reports_deleted", "Xóa báo cáo lỗi", "info"],
  ])("%s có tên tiếng Việt, tông và là gợi ý của ô lọc hành động", (action, label, tone) => {
    expect(actionLabel(action)).toBe(label);
    expect(actionTone(action)).toBe(tone);
    expect(KNOWN_ACTIONS).toContain(action);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/router.test.tsx src/components/Sidebar.test.tsx src/App.test.tsx src/audit-labels.test.ts 2>&1 | tail -20
```
Expected: FAIL (route `errors` chưa có, 8 ≠ 9 mục, nhãn chưa có).

- [ ] **Step 3: Thêm biểu tượng**

Thêm vào **cuối** `server/admin-ui/src/components/icons.tsx`:

```tsx

/** Báo cáo lỗi: con bọ. */
export const IconBug = icon(
  "bug",
  <>
    <path d="M9 7.5V6.2a3 3 0 0 1 6 0v1.3" />
    <path d="M8 9.5h8a1 1 0 0 1 1 1V14a5 5 0 0 1-10 0v-3.5a1 1 0 0 1 1-1Z" />
    <path d="M12 9.5V19" />
    <path d="M7 12H4M17 12h3M7.5 16.5 5 18M16.5 16.5 19 18M8 8 6 6.5M16 8l2-1.5" />
  </>,
);
```

- [ ] **Step 4: Thêm route**

Trong `server/admin-ui/src/router.tsx`:

1. Trong `RouteName`, thay `  | "trials"\n  | "audit"` bằng:

```ts
  | "trials"
  | "errors"
  | "error_group"
  | "error_report"
  | "audit"
```

2. Trong `ROUTES`, thay dòng `  ["trials", /^\/trials$/],` bằng:

```ts
  ["trials", /^\/trials$/],
  ["errors", /^\/errors$/],
  ["error_group", /^\/errors\/groups\/([0-9a-f]{16})$/],
  ["error_report", /^\/errors\/reports\/(R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4})$/],
```

- [ ] **Step 5: Thêm mục thanh bên**

Trong `server/admin-ui/src/components/Sidebar.tsx`:

1. Trong khối `import { … } from "./icons";` thêm `IconBug,` ngay sau `BrandMark,`.
2. Trong nhóm `Dữ liệu`, thay dòng `      { to: "/trials", label: "Máy & dùng thử", icon: IconMonitor, routes: ["trials", "device"] },` bằng:

```ts
      { to: "/trials", label: "Máy & dùng thử", icon: IconMonitor, routes: ["trials", "device"] },
      { to: "/errors", label: "Báo cáo lỗi", icon: IconBug, routes: ["errors", "error_group", "error_report"] },
```

- [ ] **Step 6: Nối vào khung trang**

Trong `server/admin-ui/src/App.tsx`:

1. Thêm ba dòng nhập sau `import { DevicePage } from "./pages/DevicePage";`:

```tsx
import { ErrorGroupPage } from "./pages/ErrorGroupPage";
import { ErrorReportPage } from "./pages/ErrorReportPage";
import { ErrorsPage } from "./pages/ErrorsPage";
```

2. Trong `routeTitle`, thay hai dòng `      return "Máy & dùng thử";\n    case "audit":` bằng:

```tsx
      return "Máy & dùng thử";
    case "errors":
      return "Báo cáo lỗi";
    case "error_group":
      return "Nhóm lỗi";
    case "error_report":
      return `Báo cáo ${route.param ?? ""}`;
    case "audit":
```

3. Trong `Page`, thay hai dòng `      return <TrialsPage />;\n    case "audit":` bằng:

```tsx
      return <TrialsPage />;
    case "errors":
      return <ErrorsPage />;
    case "error_group":
      return <ErrorGroupPage key={p} fingerprint={p} />;
    case "error_report":
      return <ErrorReportPage key={p} id={p} />;
    case "audit":
```

- [ ] **Step 7: Thêm nhãn nhật ký**

Trong `server/admin-ui/src/audit-labels.ts`:

1. Trong `LABELS`, ngay trước dòng chú thích `  // Lượt xem và tra cứu (ẩn mặc định, server: VIEW_ACTIONS)`, thêm:

```ts
  // Báo cáo lỗi của app (server/src/admin-reports.ts): xóa là thao tác tay của người vận hành, không phải xóa dữ liệu khách hàng
  error_reports_deleted: ["Xóa báo cáo lỗi", "info"],
```

2. Thay dòng `  releases_viewed: ["Xem phát hành"],` bằng:

```ts
  releases_viewed: ["Xem phát hành"],
  error_report_viewed: ["Xem báo cáo lỗi"],
```

- [ ] **Step 8: Chạy để thấy xanh (cả bộ test của admin-ui)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm exec vitest run src/router.test.tsx src/components/Sidebar.test.tsx src/App.test.tsx src/audit-labels.test.ts 2>&1 | tail -12 && pnpm typecheck && pnpm test 2>&1 | tail -8
```
Expected: PASS cả bốn file, rồi toàn bộ bộ test của `admin-ui` xanh; `tsc` không lỗi. Nếu một test cũ khác đỏ vì số mục thanh bên hay danh sách route, sửa đúng chỗ đó theo cùng cách (đếm +1, thêm "Báo cáo lỗi" đúng vị trí), không nới lỏng test.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/src/components/icons.tsx server/admin-ui/src/router.tsx server/admin-ui/src/router.test.tsx server/admin-ui/src/components/Sidebar.tsx server/admin-ui/src/components/Sidebar.test.tsx server/admin-ui/src/App.tsx server/admin-ui/src/App.test.tsx server/admin-ui/src/audit-labels.ts server/admin-ui/src/audit-labels.test.ts && git commit -m "feat(admin-ui): mục Báo cáo lỗi ở thanh bên, ba route mới và nhãn nhật ký" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dữ liệu giả cho `pnpm dev` và khối Gallery

**Files:**
- Create: `server/admin-ui/dev/fake-errors.ts`
- Modify: `server/admin-ui/dev/fake-api.ts`
- Modify: `server/admin-ui/src/dev/Gallery.tsx`

`dev/` và `src/dev/Gallery.tsx` chỉ có ở dev server (không vào bản build, `gallery-build.test.ts` kiểm); không có test riêng cho `fake-errors.ts`, nên bước kiểm là `tsc` (Gallery) và chạy dev server (bước 6).

- [ ] **Step 1: Viết API giả của báo cáo lỗi**

Tạo `server/admin-ui/dev/fake-errors.ts`:

```ts
// Dữ liệu và API giả của trang Báo cáo lỗi cho `pnpm dev` (spec 2026-10-17-diagnostics-reports-design.md §4). Hình dạng khớp hợp đồng
// ở src/api/types.ts. Sáu nhóm (một nhóm chỉ có báo cáo debug, một nhóm 23 báo cáo để thấy "Tải thêm" ở trang nhóm), năm báo cáo
// gửi tay. Một báo cáo mang log có chữ giống HTML để thấy log chỉ hiện dạng văn bản. Thao tác xóa trả thành công giả (đếm đúng số
// dòng khớp, không đổi dữ liệu). Không dùng mã máy hay log thật.
import type { ErrorGroup, ErrorReportDetail, GroupKind, Page } from "../src/api/types.ts";

interface Reply {
  status: number;
  body: unknown;
}
const ok = (body: unknown, status = 200): Reply => ({ status, body });

const NOW = Math.floor(Date.now() / 1000);
const ID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const code4 = (n: number) => Array.from({ length: 4 }, (_, k) => ID_CHARS[Math.floor(n / 32 ** k) % 32]).join("");
const idOf = (n: number) => `R-${code4(n)}-${code4(n * 31 + 7)}`;
const deviceOf = (n: number) => ((n % 7) + 10).toString(16).repeat(2).padEnd(64, "0");
const VERSIONS = ["0.1.10", "0.1.9", "0.1.8"];
const PLANS: ErrorReportDetail["plan"][] = ["free", "monthly", "six_months", "yearly"];
const LANGS = ["vi", "en", "ja", "zh", "ko"];

const LOGS = {
  app: [
    "[2026-10-17][05:07:12][INFO][pipeline::supervisor] tiến trình phụ: Starting { which: Asr, first_run: false }",
    "[2026-10-17][05:07:13][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr, failures: 2 }",
    "[2026-10-17][05:07:14][ERROR][meeting_translator_lib::session] phiên dịch dừng vì lỗi sidecarFailed: không khởi động được",
  ].join("\n"),
  asr: "ggml_metal_init: error: failed to load the Metal library\nwhisper_init_with_params_no_state: failed to initialize the GPU, falling back to CPU\n",
  llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids - the tokenizer config may be incorrect\n",
};

function make(seq: number, over: Partial<ErrorReportDetail>): ErrorReportDetail {
  const win = seq % 5 === 4;
  const at = NOW - (seq * 3 + 1) * 3600;
  return {
    id: idOf(seq),
    received_at: at,
    occurred_at: at - 90,
    kind: "session_error",
    code: "sidecarFailed",
    fingerprint: "3fa1c09be2d47a55",
    build: "release",
    app_version: VERSIONS[seq % 3] ?? "0.1.10",
    os_name: win ? "windows" : "macos",
    os_version: win ? "11 23H2" : "15.6.1",
    arch: win ? "x86_64" : "aarch64",
    chip: win ? "Intel(R) Core(TM) i7-1185G7 @ 3.00GHz" : "Apple M4 Pro",
    ram_mb: win ? 16384 : 24576,
    gpu_backend: win ? "vulkan" : "metal",
    model_pack: seq % 2 ? "standard" : "light",
    plan: PLANS[seq % 4] ?? null,
    ui_lang: LANGS[seq % 5] ?? "vi",
    device_id_hash: deviceOf(seq),
    message: "tiến trình phụ không khởi động được (exit status: 1)",
    logs: LOGS,
    ...over,
  };
}

interface Seed {
  fingerprint: string;
  kind: GroupKind;
  code: string;
  message: string;
  count: number;
  build?: "release" | "debug";
}

const SEEDS: Seed[] = [
  { fingerprint: "3fa1c09be2d47a55", kind: "session_error", code: "sidecarFailed", message: "tiến trình phụ không khởi động được (exit status: 1)", count: 9 },
  { fingerprint: "91be77d20c5a1e03", kind: "crash", code: "panic", message: "panicked at src/session.rs:412: index out of bounds", count: 4 },
  { fingerprint: "c7d21a4f9e8b3d60", kind: "crash", code: "unclean_exit", message: "lần chạy trước kết thúc không rõ lý do", count: 23 },
  { fingerprint: "5e6f7a8b9c0d4e1f", kind: "sidecar_died", code: "llama", message: "llama-server thoát sớm (exit status: 1)", count: 6 },
  { fingerprint: "0b9e7c1e5f3a4c1d", kind: "session_error", code: "modelBroken", message: "model không nạp được, kể cả bằng CPU", count: 2 },
  { fingerprint: "dddddddddddddddd", kind: "session_error", code: "captureFailed", message: "không mở được nguồn âm thanh", count: 3, build: "debug" },
];

const reports: ErrorReportDetail[] = [];
let seq = 0;
for (const s of SEEDS) {
  for (let i = 0; i < s.count; i++) {
    seq += 1;
    reports.push(make(seq, { fingerprint: s.fingerprint, kind: s.kind, code: s.code, message: s.message, build: s.build ?? "release" }));
  }
}
// Báo cáo gửi tay (không có mã lỗi, dấu vân tay toàn số 0); một báo cáo của bản debug; một báo cáo có log giống HTML.
for (let i = 0; i < 5; i++) {
  seq += 1;
  reports.push(
    make(seq, {
      kind: "manual",
      code: null,
      fingerprint: "0000000000000000",
      build: i === 4 ? "debug" : "release",
      message: i === 0 ? "" : "phụ đề chậm hơn lời nói khoảng 3 giây",
      logs: i === 1 ? { ...LOGS, app: `<b>không phải HTML</b> <img src=x onerror="alert(1)">\n${LOGS.app}` } : LOGS,
    }),
  );
}

function groupsOf(rows: ErrorReportDetail[]): ErrorGroup[] {
  const by = new Map<string, ErrorReportDetail[]>();
  for (const r of rows) if (r.kind !== "manual") by.set(r.fingerprint, [...(by.get(r.fingerprint) ?? []), r]);
  return [...by.entries()]
    .map(([fingerprint, rs]) => {
      const first = rs[0] as ErrorReportDetail;
      return {
        fingerprint,
        kind: first.kind as GroupKind,
        code: first.code,
        reports: rs.length,
        devices: new Set(rs.map((r) => r.device_id_hash)).size,
        release_reports: rs.filter((r) => r.build === "release").length,
        debug_reports: rs.filter((r) => r.build === "debug").length,
        first_at: Math.min(...rs.map((r) => r.received_at)),
        last_at: Math.max(...rs.map((r) => r.received_at)),
        versions: [...new Set(rs.map((r) => r.app_version))].sort(),
      };
    })
    .sort((a, b) => b.last_at - a.last_at);
}

/** Trang 50 dòng theo con trỏ vị trí (giao diện không đọc nội dung con trỏ). */
function paged<T>(rows: T[], url: URL): Page<T> {
  const start = Number(url.searchParams.get("cursor") ?? 0) || 0;
  return { items: rows.slice(start, start + 50), next_cursor: start + 50 < rows.length ? String(start + 50) : null };
}

/** Trả lời các route báo cáo lỗi; null nếu đường dẫn không phải của chúng (để fake-api.ts xử lý tiếp). */
export function errorsReply(method: string, url: URL, body: Record<string, unknown>): Reply | null {
  const path = url.pathname;
  const q = url.searchParams;
  if (method === "POST" && path === "/admin/error-reports/delete") {
    const id = typeof body.id === "string" ? body.id : null;
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : null;
    if ((id === null) === (fingerprint === null)) return ok({ error: "invalid_request", field: "id|fingerprint" }, 400);
    const n = reports.filter((r) => (id !== null ? r.id === id : r.fingerprint === fingerprint)).length;
    return n === 0 ? ok({ error: "not_found" }, 404) : ok({ deleted: n });
  }
  if (method !== "GET") return null;
  if (path === "/admin/error-groups") {
    const kind = q.get("kind");
    const version = q.get("app_version");
    const debug = q.get("include_debug") === "1";
    const rows = groupsOf(reports)
      .filter((g) => (!kind || g.kind === kind) && (!version || g.versions.includes(version)) && (debug || g.release_reports > 0));
    return ok(paged(rows, url));
  }
  if (path === "/admin/error-reports") {
    const debug = q.get("include_debug") === "1";
    const report = q.get("report")?.toUpperCase();
    const rows = reports
      .filter(
        (r) =>
          (!q.get("kind") || r.kind === q.get("kind")) &&
          (!q.get("fingerprint") || r.fingerprint === q.get("fingerprint")) &&
          (!q.get("device") || r.device_id_hash === q.get("device")) &&
          (!report || r.id === report) &&
          (debug || r.build === "release"),
      )
      .sort((a, b) => b.received_at - a.received_at)
      .map(({ logs: _logs, ...meta }) => meta);
    return ok(paged(rows, url));
  }
  const m = /^\/admin\/error-reports\/(R-[0-9A-Z-]+)$/.exec(path);
  if (m) {
    const r = reports.find((x) => x.id === m[1]);
    return r ? ok(r) : ok({ error: "not_found" }, 404);
  }
  return null;
}
```

- [ ] **Step 2: Nối vào API giả**

Trong `server/admin-ui/dev/fake-api.ts`:

1. Thay đoạn

```ts
} from "../src/api/types.ts";

const NOW = Math.floor(Date.now() / 1000);
```
bằng
```ts
} from "../src/api/types.ts";
import { errorsReply } from "./fake-errors.ts";

const NOW = Math.floor(Date.now() / 1000);
```

2. Thay dòng `const VIEW_ACTIONS = ["lookup", "list_viewed", "queue_viewed", "summary_viewed", "stats_viewed", "payment_status_viewed", "alerts_viewed", "releases_viewed"];` bằng:

```ts
const VIEW_ACTIONS = ["lookup", "list_viewed", "queue_viewed", "summary_viewed", "stats_viewed", "payment_status_viewed", "alerts_viewed", "releases_viewed", "error_report_viewed"];
```

3. Trong `respond`, thay đoạn đầu

```ts
function respond(method: string, url: URL, body: Record<string, unknown>): Reply {
  const path = url.pathname;
  if (method === "POST") {
```
bằng
```ts
function respond(method: string, url: URL, body: Record<string, unknown>): Reply {
  const path = url.pathname;
  const errors = errorsReply(method, url, body);
  if (errors) return errors;
  if (method === "POST") {
```

4. Trong plugin, thay dòng `const list = (req.method === "GET" && /^\/admin\/(orders|licenses|trials|audit)$/.test(url.pathname)) || isLookup;` bằng:

```ts
        const list = (req.method === "GET" && /^\/admin\/(orders|licenses|trials|audit|error-groups|error-reports)$/.test(url.pathname)) || isLookup;
```

- [ ] **Step 3: Thêm khối Gallery cho `LogView`**

Trong `server/admin-ui/src/dev/Gallery.tsx`:

1. Thêm dòng nhập sau `import { KeyValue } from "../components/KeyValue";`:

```tsx
import { LogView } from "../components/LogView";
```

2. Thêm hằng sau dòng `const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";`:

```tsx
/** Log mẫu của báo cáo lỗi; dòng giữa có chữ giống HTML để thấy log chỉ hiện dạng văn bản. */
const LOG_SAMPLE = [
  "[2026-10-17][05:07:12][INFO][pipeline::supervisor] tiến trình phụ: Starting { which: Asr, first_run: false }",
  '<b>không phải HTML</b> <img src=x onerror="alert(1)">',
  "[2026-10-17][05:07:14][ERROR][meeting_translator_lib::session] phiên dịch dừng vì lỗi sidecarFailed",
].join("\n");
```

3. Thêm hàm `Logs` ngay trước dòng `const SECTIONS: [string, string][] = [`:

```tsx
function Logs() {
  return (
    <GalleryBlock id="log" title="LogView" note="Log của báo cáo lỗi: chuỗi văn bản thô trong <pre> (không dựng HTML), cuộn được bằng bàn phím">
      <Card title="Log ứng dụng" description="app.log: 300 dòng cuối">
        <LogView label="Log ứng dụng (app.log)" text={LOG_SAMPLE} />
      </Card>
      <Card title="Log trống">
        <LogView label="Log trống" text="" emptyHint="Báo cáo không kèm log này." />
      </Card>
    </GalleryBlock>
  );
}

```

4. Trong `SECTIONS`, thêm `  ["log", "LogView"],` sau `  ["table", "DataTable"],`.

5. Trong `Gallery`, thêm `      {show("log") && <Logs />}` sau dòng `      {show("table") && <Tables />}`.

- [ ] **Step 4: Kiểm kiểu và bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm typecheck && pnpm exec vitest run src/dev 2>&1 | tail -8
```
Expected: `tsc` không lỗi (Gallery nằm trong `src/`; `dev/*.ts` ngoài `include` nên không qua `tsc`, kiểm ở bước 6 bằng dev server); `gallery-build.test.ts` xanh (bản build không chứa Gallery).

- [ ] **Step 5: Xem bằng mắt trên dev server**

Chạy dev server bằng Bash nền (`run_in_background`), **nhớ mã tác vụ để tắt bằng TaskStop khi xong**:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && pnpm dev
```

Rồi (cổng cố định 5180, `strictPort`; nếu cổng đang bận bởi tiến trình không phải của bạn thì dừng lại và báo, đừng tắt nó):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5180/errors && curl -s "http://127.0.0.1:5180/admin/error-groups" | head -c 400
```
Expected: `200`, rồi JSON `{"items":[…]}` có các nhóm mẫu. Mở `http://127.0.0.1:5180/errors` trong trình duyệt và kiểm tay (ghi kết quả vào báo cáo, không có ảnh thì ghi rõ "chưa chụp"):
- Tab Nhóm lỗi: 5 nhóm (nhóm `captureFailed` chỉ hiện khi bật "Hiện cả báo cáo debug"); bấm một hàng mở trang nhóm; nhóm `unclean_exit` có 23 báo cáo.
- Tab Gửi tay: nhập mã của một báo cáo gửi tay (lấy từ bảng) vào ô "Mã báo cáo" thì còn đúng một dòng.
- Chi tiết báo cáo gửi tay thứ hai (log có chữ giống HTML): hiện nguyên chữ `<b>không phải HTML</b> <img …>`, không có ảnh hỏng.
- Giao diện sáng và tối (đổi chế độ của hệ điều hành), bề rộng điện thoại (cửa sổ ≤ 800px: bảng thành thẻ, bộ lọc gấp sau nút "Bộ lọc"), Tab đi qua mọi nút theo thứ tự hợp lý và vùng log nhận focus, `?__fake=empty`, `?__fake=error` (ví dụ `/errors?__fake=error`).

Rồi **tắt dev server bằng TaskStop** (tác vụ nền bạn đã mở) và kiểm không còn tiến trình con sót:

```bash
lsof -nP -iTCP:5180 -sTCP:LISTEN || echo "cổng 5180 đã đóng"
```
Expected: `cổng 5180 đã đóng`. Chỉ tắt tiến trình do chính bạn vừa mở; còn tiến trình `vite` của bạn nghe cổng 5180 thì tắt nốt bằng đúng PID đó.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/admin-ui/dev/fake-errors.ts server/admin-ui/dev/fake-api.ts server/admin-ui/src/dev/Gallery.tsx && git commit -m "feat(admin-ui): dữ liệu giả của báo cáo lỗi cho dev server và khối Gallery của LogView" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Kiểm tra toàn bộ và hoàn tất

**Files:** không sửa mã (chỉ sửa nếu bước kiểm lộ lỗi, rồi commit riêng).

- [ ] **Step 1: Chạy bộ kiểm của `admin-ui` như CI**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server ui:check 2>&1 | tail -25
```
Expected: `typecheck`, `test` và `build` của `mt-license-admin-ui` đều xanh (`pnpm -C server ui:check` chạy `check` của `admin-ui` = `pnpm typecheck && pnpm test && pnpm build`). Build không cảnh báo mới.

- [ ] **Step 2: Chạy bộ kiểm của server như CI (hai Worker dùng chung `admin-ui/dist`)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server test:scripts 2>&1 | tail -6
```
Expected: xanh. (`pnpm -C server check` đầy đủ gồm cả `dry-run` của wrangler ở kế hoạch 01; ở đây chỉ cần `ui:check` và `test:scripts`.)

- [ ] **Step 3: Soát theo spec mục 4**

Với từng dòng, chỉ ra test hay mã chứng minh:
- Danh sách nhóm theo dấu vân tay: loại, mã lỗi, các phiên bản, số máy, số báo cáo, lần đầu, lần cuối; lọc theo loại và phiên bản; bật hiện báo cáo debug → `ErrorsPage.test.tsx` (tab Nhóm lỗi), `error-kit.test.tsx`.
- Tab Gửi tay, xếp theo thời gian, tìm theo mã báo cáo `R-XXXX-XXXX` → `ErrorsPage.test.tsx` (tab Gửi tay).
- Danh sách báo cáo của một nhóm → `ErrorGroupPage.test.tsx`.
- Chi tiết: metadata, ba log văn bản thuần (`<pre>`, test `<img onerror>` và `<script>`), nút chép, liên kết sang `DevicePage` → `ErrorReportPage.test.tsx`, `LogView.test.tsx`.
- Xóa một báo cáo và cả nhóm bằng `ConfirmDialog` → `ErrorReportPage.test.tsx`, `ErrorGroupPage.test.tsx`.
- Điều hướng, route, tiêu đề trang → `Sidebar.test.tsx`, `router.test.tsx`, `App.test.tsx`.
- Nhãn nhật ký của hai action mới → `audit-labels.test.ts`.
- Mặc định ẩn báo cáo debug và `include_debug=1` → `ErrorsPage.test.tsx` (hai công tắc), `endpoints.test.ts`.
- Không style inline, không `dangerouslySetInnerHTML`:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server/admin-ui && grep -rn "dangerouslySetInnerHTML\|style={" src/pages/Error*.tsx src/pages/error-kit.tsx src/components/LogView.tsx || echo "không có"
```
Expected: `không có`.

- [ ] **Step 4: Báo cáo**

Ghi lại cho người duyệt: số test của `pnpm -C server/admin-ui test` (so với mốc Task 0), danh sách commit của nhánh, kết quả xem bằng mắt ở Task 8 bước 5 (sáng/tối, điện thoại, bàn phím), và nhắc rằng **Worker admin chưa deploy**: trang này gọi bốn route của `server/src/admin-reports.ts` (kế hoạch 01), nên chỉ có tác dụng sau khi migration `0004` được áp lên D1 production và cả hai Worker được deploy liền nhau (spec mục 8; chỉ làm khi chủ dự án cho phép).
