# Web Admin · 02: Giao diện (`server/admin-ui/`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** SPA React cho người vận hành, gồm thanh bên, ô tra cứu, trang Việc cần xử lý, các danh sách, trang chi tiết đơn/license/máy, nhật ký và công cụ. Mọi thao tác đi qua hộp xác nhận. Trang build vào `server/admin-ui/dist` và được Worker admin phục vụ qua `ASSETS`.

**Kiến trúc:** Package `mt-license-admin-ui` trong pnpm workspace của `server/`. Chỉ có `react` và `react-dom` khi chạy. Router và lớp gọi API tự viết. Lớp `api/` gọi các route của kế hoạch 01 (cùng origin, `redirect: "manual"` để nhận ra phiên Access hết hạn). `pnpm dev` chạy với API giả (`dev/fake-api.ts`), chỉ có ở dev server.

**Công nghệ:** React 19.3, Vite 8, TypeScript 7, Vitest 5 + jsdom + Testing Library. Phiên bản kiểm ngày 2026-10-07 (mục "Phiên bản" bên dưới).

**Spec:** `docs/superpowers/specs/2026-10-07-web-admin-design.md` (§2, §4, §5.2). Phụ thuộc: kế hoạch 01 xong (route đọc, `lookup` theo key và id, phục vụ trang).

---

## Phiên bản (spec gốc §6.12)

Đã kiểm bằng `npm view` ngày 2026-10-07; tất cả là bản ổn định mới nhất:

| Gói | Bản | Ghi chú tương thích |
|---|---|---|
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | 19.3.0 | cùng bản với app desktop |
| `vite` | 8.3.3 | |
| `@vitejs/plugin-react` | 6.1.2 | peer `vite ^8` |
| `vitest` | 5.0.3 | peer `vite ^6.4 \|\| ^7 \|\| ^8`; server giữ vitest 4 (ràng buộc của `@cloudflare/vitest-plugin`), hai package riêng nên không xung đột |
| `jsdom` | 30.1.2 | engines `node ^24.15` (repo dùng Node 24.21) |
| `@testing-library/react` | 16.3.3 | peer `react ^19`, `@testing-library/dom ^10` |
| `@testing-library/dom` | 10.4.2 | |
| `@testing-library/user-event` | 14.6.7 | |
| `typescript` | 7.0.2 | cùng bản với `server/` và app |

Task 1 kiểm lại bằng `npm view`. Có bản ổn định mới hơn thì dùng bản mới, kiểm lại peer dependency và sửa bảng này.

## Cấu trúc file

```
server/admin-ui/
├── package.json  tsconfig.json  vite.config.ts  index.html
├── dev/fake-api.ts            # API giả cho `pnpm dev` (plugin Vite, apply: "serve")
└── src/
    ├── main.tsx  App.tsx  styles.css  test-setup.ts
    ├── router.tsx             # matchRoute, navigate, usePath, Link
    ├── search.ts              # detectQuery, singleTarget, kho từ khóa trong bộ nhớ
    ├── format.ts              # giờ GMT+7, VND, còn N ngày, che key, detail nhật ký
    ├── hooks.ts               # useLoad, usePaged
    ├── api/{types,client,endpoints}.ts
    ├── components/            # Sidebar, SearchBox, ConfirmDialog, MaskedKey (+CopyButton, KeyReveal),
    │                          # StatusBadge, DataTable, columns, Feedback, Field
    └── pages/                 # Queue, Search, Orders, Order, Licenses, License, Device, Trials, Audit, Tools, NotFound
```

Sửa thêm: `server/pnpm-workspace.yaml`, `server/package.json`, `server/vitest.config.ts`, `server/wrangler.admin.jsonc`, `server/test/node/wrangler-config.test.mjs`, `.gitignore` (gốc repo).

## Quy ước

- Lệnh của UI chạy trong `server/admin-ui/` (`pnpm test`, `pnpm typecheck`, `pnpm build`), hoặc từ `server/` bằng `pnpm --filter mt-license-admin-ui <lệnh>`.
- Không dùng thuộc tính `style` hay `<style>` inline trong JSX hay HTML: CSP của Worker admin là `style-src 'self'`. Mọi kiểu nằm trong `src/styles.css`.
- Câu chữ giao diện là tiếng Việt có dấu. Mã lỗi và tên trường giữ nguyên tiếng Anh.
- Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.

---

## Task 1: Dựng package `admin-ui`

**Files:**
- Create: `server/admin-ui/package.json`, `server/admin-ui/tsconfig.json`, `server/admin-ui/vite.config.ts`, `server/admin-ui/index.html`, `server/admin-ui/src/main.tsx`, `server/admin-ui/src/App.tsx` (tạm), `server/admin-ui/src/styles.css` (tạm), `server/admin-ui/src/test-setup.ts`, `server/admin-ui/dev/fake-api.ts` (tạm)
- Modify: `server/pnpm-workspace.yaml`, `server/vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Kiểm lại phiên bản**

```bash
for p in react react-dom @types/react @types/react-dom vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event typescript; do printf "%s " $p; npm view $p version; done
npm view @vitejs/plugin-react peerDependencies; npm view @testing-library/react peerDependencies
```

Expected: các bản như bảng "Phiên bản". Khác thì dùng bản mới trong Step 2 và sửa bảng.

- [ ] **Step 2: Tạo `server/admin-ui/package.json`**

```json
{
  "name": "mt-license-admin-ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "pnpm typecheck && pnpm test && pnpm build"
  },
  "dependencies": {
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.2",
    "jsdom": "30.1.2",
    "typescript": "7.0.2",
    "vite": "8.3.3",
    "vitest": "5.0.3"
  }
}
```

- [ ] **Step 3: Tạo `server/admin-ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`vite.config.ts` và `dev/` không nằm trong `include`: Vite tự dịch hai file này, không cần `@types/node`.

- [ ] **Step 4: Tạo `server/admin-ui/vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fakeAdminApi } from "./dev/fake-api";

// Trang Web Admin (spec 2026-10-07 Web Admin §2). Build ra dist/; Worker mt-license-admin phục vụ qua binding ASSETS.
// `pnpm dev`: xem giao diện với API giả (dev/fake-api.ts, chỉ có ở dev server, không vào bản build).
export default defineConfig({
  plugins: [react(), fakeAdminApi()],
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 5: Tạo `server/admin-ui/index.html`**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <link rel="icon" href="data:," />
    <title>AI Translator Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Tạo các file nguồn tạm**

`server/admin-ui/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

`server/admin-ui/src/App.tsx` (tạm, Task 8 thay):

```tsx
export function App() {
  return <p>AI Translator Admin</p>;
}
```

`server/admin-ui/src/styles.css` (tạm, Task 8 thay):

```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

`server/admin-ui/src/test-setup.ts`:

```ts
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

`server/admin-ui/dev/fake-api.ts` (tạm, Task 9 thay):

```ts
import type { Plugin } from "vite";

export function fakeAdminApi(): Plugin {
  return { name: "fake-admin-api", apply: "serve" };
}
```

- [ ] **Step 7: Đưa `admin-ui` vào workspace của `server/`**

Thêm vào đầu `server/pnpm-workspace.yaml` (giữ nguyên `allowBuilds` và `overrides`):

```yaml
# admin-ui/: trang Web Admin (spec 2026-10-07 Web Admin), build vào admin-ui/dist cho Worker admin.
packages:
  - admin-ui
```

- [ ] **Step 8: Không cho Vitest của server chạy test của UI**

Trong `server/vitest.config.ts`, đổi dòng `test:` thành:

```ts
    // admin-ui/: test của trang Web Admin chạy bằng vitest và jsdom riêng (`pnpm ui:check`), không chạy trong workerd.
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      exclude: [...configDefaults.exclude, "test/node/**", "admin-ui/**"],
    },
```

Giữ nguyên chú thích `// test/node/: …` ở dòng trên.

- [ ] **Step 9: Bỏ qua `node_modules` và `dist` của UI trong git**

Trong `.gitignore` ở gốc repo, ngay dưới dòng `/server/node_modules/`, thêm:

```
/server/admin-ui/node_modules/
/server/admin-ui/dist/
```

- [ ] **Step 10: Cài và build thử**

```bash
cd server && pnpm install
cd admin-ui && pnpm typecheck && pnpm build
ls dist dist/assets
grep -c "<script>" dist/index.html; grep -c "style=" dist/index.html
```

Expected:
- `pnpm install` cập nhật `server/pnpm-lock.yaml`, không lỗi peer dependency.
- `dist/index.html` và `dist/assets/index-*.js`, `index-*.css` có mặt.
- Hai lệnh `grep -c` in `0`: không có script hay style inline (CSP).

- [ ] **Step 11: Server vẫn sạch**

Run: `cd server && pnpm test && pnpm audit --audit-level high`
Expected: Vitest của server PASS (không chạy test nào trong `admin-ui/`); audit không có lỗ hổng mức high.

- [ ] **Step 12: Commit**

```bash
cd server
git add admin-ui/package.json admin-ui/tsconfig.json admin-ui/vite.config.ts admin-ui/index.html admin-ui/src admin-ui/dev pnpm-workspace.yaml pnpm-lock.yaml vitest.config.ts ../.gitignore
git commit -m "feat(admin-ui): dựng package trang Web Admin (React 19, Vite 8) trong workspace của server"
```

---

## Task 2: `format.ts`

**Files:**
- Create: `server/admin-ui/src/format.ts`
- Test: `server/admin-ui/src/format.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from "vitest";
import { daysLeft, fmtDate, fmtDateTime, fmtDetail, fmtVnd, maskKey, shortHash } from "./format";

/** 2026-10-01T00:00:00Z = 07:00 ngày 01/10/2026 giờ Việt Nam. */
const T0 = 1_790_812_800;
const DAY = 86400;

describe("format", () => {
  it("ngày giờ theo GMT+7", () => {
    expect(fmtDateTime(T0)).toBe("01/10/2026 07:00");
    expect(fmtDate(T0 - 8 * 3600)).toBe("30/09/2026");
    expect(fmtDate(T0 - 7 * 3600)).toBe("01/10/2026");
    expect(fmtDateTime(null)).toBe("—");
  });

  it("tiền VND có dấu chấm ngăn nghìn", () => {
    expect(fmtVnd(500000)).toBe("500.000 đ");
    expect(fmtVnd(1234567)).toBe("1.234.567 đ");
    expect(fmtVnd(0)).toBe("0 đ");
  });

  it("còn N ngày, làm tròn lên", () => {
    expect(daysLeft(T0 + 365 * DAY, T0)).toBe("còn 365 ngày");
    expect(daysLeft(T0 + 1, T0)).toBe("còn 1 ngày");
    expect(daysLeft(T0, T0)).toBe("đã hết hạn");
  });

  it("che key và rút gọn mã máy", () => {
    expect(maskKey("K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB")).toBe("K7Q2-…-9XMB");
    expect(maskKey("K7Q2-…-9XMB")).toBe("K7Q2-…-9XMB");
    expect(shortHash("3fa1" + "0".repeat(56) + "c09e")).toBe("3fa1…c09e");
  });

  it("detail của nhật ký: JSON thành khóa: giá trị", () => {
    expect(fmtDetail('{"note":"bù","days":1}')).toBe("note: bù · days: 1");
    expect(fmtDetail('{"filters":{"status":"paid"}}')).toBe('filters: {"status":"paid"}');
    expect(fmtDetail("khong-phai-json")).toBe("khong-phai-json");
    expect(fmtDetail(null)).toBe("");
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `cd server/admin-ui && pnpm vitest run src/format.test.ts`
Expected: FAIL, không tìm thấy `./format`.

- [ ] **Step 3: Viết `server/admin-ui/src/format.ts`**

```ts
// Định dạng hiển thị (spec Web Admin §4.5). Giờ Việt Nam là GMT+7, không có giờ mùa hè, nên cộng thẳng 7 giờ.
const VN_OFFSET = 7 * 3600;
const DAY = 86400;

const pad = (n: number) => String(n).padStart(2, "0");

function vnParts(sec: number) {
  const d = new Date((sec + VN_OFFSET) * 1000);
  return {
    y: d.getUTCFullYear(),
    mo: pad(d.getUTCMonth() + 1),
    d: pad(d.getUTCDate()),
    h: pad(d.getUTCHours()),
    mi: pad(d.getUTCMinutes()),
  };
}

export function fmtDate(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const p = vnParts(sec);
  return `${p.d}/${p.mo}/${p.y}`;
}

export function fmtDateTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const p = vnParts(sec);
  return `${p.d}/${p.mo}/${p.y} ${p.h}:${p.mi}`;
}

export function fmtVnd(n: number): string {
  return `${String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;
}

export function daysLeft(expiresAt: number, now: number): string {
  if (expiresAt <= now) return "đã hết hạn";
  return `còn ${Math.ceil((expiresAt - now) / DAY)} ngày`;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Key dạng che: 4 ký tự đầu, "-…-", 4 ký tự cuối. Nhận key đầy đủ hay key đã che. */
export function maskKey(key: string): string {
  const raw = key.replace(/-/g, "");
  return `${raw.slice(0, 4)}-…-${raw.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

/** `detail` JSON của nhật ký thành "khóa: giá trị · …"; không phải object JSON thì trả nguyên. */
export function fmtDetail(detail: string | null): string {
  if (!detail) return "";
  try {
    const o: unknown = JSON.parse(detail);
    if (o !== null && typeof o === "object" && !Array.isArray(o)) {
      return Object.entries(o)
        .map(([k, v]) => `${k}: ${v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join(" · ");
    }
  } catch {
    // không phải JSON: hiện nguyên văn
  }
  return detail;
}
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `pnpm vitest run src/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format.ts src/format.test.ts
git commit -m "feat(admin-ui): định dạng giờ GMT+7, VND, che key, detail nhật ký"
```

---

## Task 3: Lớp gọi API (`api/`)

**Files:**
- Create: `server/admin-ui/src/api/types.ts`, `server/admin-ui/src/api/client.ts`, `server/admin-ui/src/api/endpoints.ts`
- Test: `server/admin-ui/src/api/client.test.ts`

- [ ] **Step 1: Viết test thất bại**

`server/admin-ui/src/api/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, call, SESSION_EXPIRED_EVENT } from "./client";
import { queryString } from "./endpoints";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("không có lỗi");
}

describe("call", () => {
  it("POST gửi JSON, redirect manual; GET không có body", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await call("POST", "/admin/licenses/x/revoke", { note: "lý do" });
    await call("GET", "/admin/queue");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/licenses/x/revoke");
    expect(init).toMatchObject({ method: "POST", redirect: "manual", credentials: "same-origin", body: '{"note":"lý do"}' });
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    const [, getInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(getInit.body).toBeUndefined();
    expect((getInit.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });

  it("lỗi JSON của server thành câu tiếng Việt kèm trạng thái và trường", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "already_paid", status: "paid" }, 409)));
    const e = await failure(call("POST", "/admin/orders/1/grant", { note: "x" }));
    expect(e).toMatchObject({ status: 409, code: "already_paid" });
    expect(e.message).toBe("Đơn đã được cấp trước đó (trạng thái hiện tại: paid)");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_request", field: "state" }, 400)));
    expect((await failure(call("GET", "/admin/licenses?state=x"))).message).toBe("Dữ liệu gửi lên không hợp lệ (trường state)");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "payment_provider_error", message: "PayOS 500" }, 502)));
    expect((await failure(call("GET", "/admin/orders/1/payment-status"))).message).toBe("Cổng thanh toán lỗi (PayOS 500)");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "la_hoan_toan" }, 400)));
    expect((await failure(call("GET", "/admin/queue"))).message).toBe("Lỗi không rõ (la_hoan_toan)");
  });

  it("phiên Access hết hạn: opaqueredirect hay trang HTML; phát sự kiện", async () => {
    const seen = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, seen);
    vi.stubGlobal("fetch", vi.fn(async () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() }) as Response));
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ code: "session_expired" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })));
    const e = await failure(call("GET", "/admin/queue"));
    expect(e.code).toBe("session_expired");
    expect(e.message).toBe("Phiên đăng nhập hết hạn. Tải lại trang để đăng nhập lại");
    expect(seen).toHaveBeenCalledTimes(2);
    window.removeEventListener(SESSION_EXPIRED_EVENT, seen);
  });

  it("lỗi mạng, và lỗi không phải JSON khác (502 HTML của Cloudflare)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect((await failure(call("GET", "/admin/queue"))).message).toBe("Không kết nối được máy chủ");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502, headers: { "content-type": "text/html" } })));
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ code: "http_502", message: "Máy chủ trả lỗi 502" });
  });
});

describe("queryString", () => {
  it("bỏ tham số rỗng, mã hóa giá trị", () => {
    expect(queryString({ status: "paid", plan: "", cursor: undefined })).toBe("?status=paid");
    expect(queryString({ actor: "admin:ops@example.com" })).toBe("?actor=admin%3Aops%40example.com");
    expect(queryString({})).toBe("");
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run src/api`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết `server/admin-ui/src/api/types.ts`**

```ts
// Kiểu dữ liệu trả về của API Worker admin (server/src/admin.ts, admin-read.ts). Giữ khớp tay với server;
// test của server khóa hình dạng phản hồi.

export type PlanCode = "monthly" | "yearly";

export type OrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "underpaid"
  | "cancelled"
  | "expired"
  | "failed"
  | "paid_needs_review"
  | "refunded";

export interface OrderRow {
  order_code: number;
  provider: string;
  plan: PlanCode;
  amount: number;
  amount_paid: number;
  currency: string;
  email: string | null;
  status: OrderStatus;
  grant_kind: string | null;
  license_id: string | null;
  renew_license_id: string | null;
  created_at: number;
  paid_at: number | null;
  email_sent_at: number | null;
  email_gave_up_at: number | null;
}

export interface LicenseRow {
  id: string;
  /** Đã che: "K7Q2-…-9XMB". */
  license_key: string;
  email: string | null;
  plan: PlanCode;
  expires_at: number;
  created_at: number;
  revoked_at: number | null;
  locked_at: number | null;
  active_devices: number;
}

export interface TrialRow {
  device_id_hash: string;
  started_at: number;
  ends_at: number;
  last_seen_at: number;
  purchased: boolean;
}

export interface AuditRow {
  id: number;
  at: number;
  actor: string;
  action: string;
  license_id: string | null;
  order_code: number | null;
  detail: string | null;
}

/** Dòng nhật ký trong kết quả lookup: không có id, license_id. */
export interface LicenseAuditRow {
  at: number;
  actor: string;
  action: string;
  order_code: number | null;
  detail: string | null;
}

export interface Activation {
  id: string;
  license_id: string;
  device_id_hash: string;
  device_label: string | null;
  quota_epoch: number;
  created_at: number;
  last_validated_at: number;
  deactivated_at: number | null;
  deactivated_by: string | null;
}

export interface LicenseDetail {
  id: string;
  /** Key đầy đủ, có gạch nối. */
  license_key: string;
  email: string | null;
  plan: PlanCode;
  expires_at: number;
  created_at: number;
  revoked_at: number | null;
  locked_at: number | null;
  conflict: boolean;
  activations: Activation[];
  audit: LicenseAuditRow[];
}

export interface Trial {
  started_at: number;
  ends_at: number;
  last_seen_at: number;
}

export interface LookupResult {
  licenses: LicenseDetail[];
  orders: OrderRow[];
  /** Chỉ có khi tra theo máy; null là máy chưa đăng ký dùng thử. */
  trial?: Trial | null;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface QueueGroup<T> {
  count: number;
  items: T[];
}

export interface AlertRow {
  kind: string;
  window_start: number;
  count: number;
  notified_count: number;
}

export interface Queue {
  needs_review: QueueGroup<OrderRow>;
  underpaid: QueueGroup<OrderRow>;
  email_failed: QueueGroup<OrderRow>;
  locked: QueueGroup<LicenseRow>;
  conflict: QueueGroup<LicenseRow>;
  alerts: QueueGroup<AlertRow>;
}

export interface Summary {
  revenue_today: number;
  currency: string;
  paid_orders_7d: number;
  active_licenses: number;
}

export interface IssuedLicense {
  license_id: string;
  license_key: string;
  plan: PlanCode;
  expires_at: number;
}

export interface KeyCheck {
  slot: string;
  kid: string;
  token: string;
}

export interface EraseResult {
  activations: number;
  licenses: number;
  orders: number;
}
```

- [ ] **Step 4: Viết `server/admin-ui/src/api/client.ts`**

```ts
// Gọi API của Worker admin: cùng origin, sau Cloudflare Access (spec Web Admin §4.5, §4.6). Mọi lỗi thành ApiError
// mang câu tiếng Việt. Phiên Access hết hạn thì phát sự kiện SESSION_EXPIRED_EVENT để App hiện thanh báo.

export const SESSION_EXPIRED_EVENT = "admin:session-expired";

const MESSAGES: Record<string, string> = {
  invalid_request: "Dữ liệu gửi lên không hợp lệ",
  forbidden: "Không có quyền. Thử tải lại trang",
  not_found: "Không tìm thấy",
  order_not_found: "Không tìm thấy đơn",
  activation_not_found: "Không tìm thấy máy (có thể đã gỡ)",
  pricing_not_configured: "Worker API chưa có cấu hình bảng gói (PLANS)",
  payment_provider_error: "Cổng thanh toán lỗi",
  temporarily_unavailable: "Chưa gửi được email, thử lại sau",
  key_check_failed: "Ký thử bằng khóa dự phòng thất bại",
  needs_review: "Đơn cần xử lý bằng nút Cấp key mới hoặc Ghi đã hoàn tiền (license của đơn đã bị thu hồi)",
  already_paid: "Đơn đã được cấp trước đó",
  already_settled: "Đơn đã khép",
  not_needs_review: "Đơn không ở trạng thái chờ xử lý",
  unsupported_media_type: "Yêu cầu sai định dạng",
  rate_limited: "Quá nhiều yêu cầu, thử lại sau",
  internal: "Lỗi máy chủ",
  network: "Không kết nối được máy chủ",
  session_expired: "Phiên đăng nhập hết hạn. Tải lại trang để đăng nhập lại",
};

export function errorMessage(code: string, body: Record<string, unknown> = {}): string {
  const http = /^http_(\d+)$/.exec(code);
  const base = MESSAGES[code] ?? (http ? `Máy chủ trả lỗi ${http[1]}` : `Lỗi không rõ (${code})`);
  const extra: string[] = [];
  if (typeof body.field === "string") extra.push(`trường ${body.field}`);
  if (typeof body.status === "string") extra.push(`trạng thái hiện tại: ${body.status}`);
  if (typeof body.message === "string") extra.push(body.message);
  return extra.length > 0 ? `${base} (${extra.join("; ")})` : base;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;
  constructor(status: number, code: string, body: Record<string, unknown> = {}) {
    super(errorMessage(code, body));
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  const init: RequestInit = { method, headers, redirect: "manual", credentials: "same-origin" };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "network");
  }
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  // Phiên hết hạn: Access chuyển hướng sang trang đăng nhập (với redirect "manual" là opaqueredirect), hoặc trả trang HTML.
  if (res.type === "opaqueredirect" || (!isJson && (res.ok || res.status === 401 || res.status === 403))) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, "session_expired");
  }
  if (!isJson) throw new ApiError(res.status, `http_${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, typeof data.error === "string" ? data.error : `http_${res.status}`, data);
  }
  return data as T;
}
```

- [ ] **Step 5: Viết `server/admin-ui/src/api/endpoints.ts`**

```ts
// Một hàm có kiểu cho mỗi route của Worker admin.
import { call } from "./client";
import type {
  AuditRow,
  EraseResult,
  IssuedLicense,
  KeyCheck,
  LicenseRow,
  LookupResult,
  OrderRow,
  Page,
  PlanCode,
  Queue,
  Summary,
  TrialRow,
} from "./types";

export type LookupQuery =
  | { email: string }
  | { order_code: number }
  | { license_key: string }
  | { license_id: string }
  | { device_id_hash: string };

export type Filters = Record<string, string | undefined>;

export function queryString(params: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const seg = encodeURIComponent;

export const api = {
  whoami: () => call<{ operator: string }>("GET", "/admin/whoami"),
  lookup: (q: LookupQuery) => call<LookupResult>("POST", "/admin/lookup", q),
  queue: () => call<Queue>("GET", "/admin/queue"),
  summary: () => call<Summary>("GET", "/admin/summary"),
  orders: (f: Filters) => call<Page<OrderRow>>("GET", `/admin/orders${queryString(f)}`),
  licenses: (f: Filters) => call<Page<LicenseRow>>("GET", `/admin/licenses${queryString(f)}`),
  trials: (f: Filters) => call<Page<TrialRow>>("GET", `/admin/trials${queryString(f)}`),
  audit: (f: Filters) => call<Page<AuditRow>>("GET", `/admin/audit${queryString(f)}`),
  paymentStatus: (code: number) => call<Record<string, unknown>>("GET", `/admin/orders/${code}/payment-status`),
  grantOrder: (code: number, note: string) => call<IssuedLicense>("POST", `/admin/orders/${code}/grant`, { note }),
  resolveOrder: (code: number, action: "grant_new_license" | "refunded", note: string) =>
    call<{ order_code: number; status: string; license_key?: string }>("POST", `/admin/orders/${code}/resolve`, { action, note }),
  issueLicense: (email: string, plan: PlanCode, note: string) =>
    call<IssuedLicense>("POST", "/admin/licenses", { email, plan, note }),
  extend: (id: string, days: number, note: string) =>
    call<{ license_id: string; expires_at: number }>("POST", `/admin/licenses/${seg(id)}/extend`, { days, note }),
  unlock: (id: string, note: string) => call<{ ok: true }>("POST", `/admin/licenses/${seg(id)}/unlock`, { note }),
  revoke: (id: string, note: string) => call<{ ok: true }>("POST", `/admin/licenses/${seg(id)}/revoke`, { note }),
  resend: (id: string) => call<{ ok: true }>("POST", `/admin/licenses/${seg(id)}/resend`, {}),
  deactivate: (activationId: string, note: string) =>
    call<{ ok: true }>("POST", `/admin/activations/${seg(activationId)}/deactivate`, { note }),
  resetQuota: (activationId: string, note: string) =>
    call<{ activation_id: string; quota_epoch: number }>("POST", `/admin/activations/${seg(activationId)}/reset-quota`, { note }),
  testSign: () => call<KeyCheck>("POST", "/admin/keys/test-sign", {}),
  erase: (email: string, note: string) => call<EraseResult>("POST", "/admin/erase", { email, note }),
  confirmWebhook: (url: string) => call<{ ok: true; webhook_url: string }>("POST", "/admin/payos/confirm-webhook", { webhook_url: url }),
};
```

- [ ] **Step 6: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run src/api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api
git commit -m "feat(admin-ui): lớp gọi API, câu lỗi tiếng Việt, nhận ra phiên Access hết hạn"
```

---

## Task 4: Router và ô tra cứu (logic)

**Files:**
- Create: `server/admin-ui/src/router.tsx`, `server/admin-ui/src/search.ts`
- Test: `server/admin-ui/src/router.test.ts`, `server/admin-ui/src/search.test.ts`

- [ ] **Step 1: Viết test thất bại**

`server/admin-ui/src/router.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const HASH = "a".repeat(64);

describe("matchRoute", () => {
  it.each([
    ["/", { name: "queue" }],
    ["/search", { name: "search" }],
    ["/orders", { name: "orders" }],
    ["/orders/1000012", { name: "order", param: "1000012" }],
    ["/licenses", { name: "licenses" }],
    [`/licenses/${ID}`, { name: "license", param: ID }],
    [`/devices/${HASH}`, { name: "device", param: HASH }],
    ["/trials", { name: "trials" }],
    ["/audit", { name: "audit" }],
    ["/tools", { name: "tools" }],
    ["/orders/", { name: "orders" }],
    ["/orders/abc", { name: "not_found" }],
    ["/licenses/khong-phai-uuid", { name: "not_found" }],
    ["/khong-co", { name: "not_found" }],
  ])("%s", (path, route) => {
    expect(matchRoute(path)).toEqual(route);
  });
});
```

`server/admin-ui/src/search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LicenseDetail, LookupResult, OrderRow } from "./api/types";
import { detectQuery, singleTarget } from "./search";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

describe("detectQuery (spec Web Admin §4.3)", () => {
  it.each([
    ["  Khach@Example.com ", { email: "Khach@Example.com" }],
    ["1000012", { order_code: 1000012 }],
    [ID.toUpperCase(), { license_id: ID }],
    ["A".repeat(64), { device_id_hash: "a".repeat(64) }],
    [KEY, { license_key: KEY }],
    [KEY.replace(/-/g, "").toLowerCase(), { license_key: KEY.replace(/-/g, "").toLowerCase() }],
    ["abc", null],
    ["", null],
    ["   ", null],
  ])("%s", (raw, expected) => {
    expect(detectQuery(raw)).toEqual(expected);
  });
});

describe("singleTarget", () => {
  const lic = { id: ID } as LicenseDetail;
  const order = (license_id: string | null, renew_license_id: string | null = null) =>
    ({ order_code: 1, license_id, renew_license_id }) as OrderRow;

  it("một license, mọi đơn thuộc license đó: mở trang license", () => {
    expect(singleTarget({ licenses: [lic], orders: [order(ID), order(null, ID)] } as LookupResult)).toBe(`/licenses/${ID}`);
  });

  it("có đơn chưa thuộc license nào, hay nhiều license: ở lại trang kết quả", () => {
    expect(singleTarget({ licenses: [lic], orders: [order(null)] } as LookupResult)).toBeNull();
    expect(singleTarget({ licenses: [lic, { id: "khac" } as LicenseDetail], orders: [] } as LookupResult)).toBeNull();
    expect(singleTarget({ licenses: [], orders: [] } as LookupResult)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run src/router.test.ts src/search.test.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết `server/admin-ui/src/router.tsx`**

```tsx
// Router tự viết trên History API (spec Web Admin §4.5): khoảng mười route, không cần thư viện.
import { type MouseEvent, type ReactNode, useSyncExternalStore } from "react";

export type RouteName =
  | "queue"
  | "search"
  | "orders"
  | "order"
  | "licenses"
  | "license"
  | "device"
  | "trials"
  | "audit"
  | "tools"
  | "not_found";

export interface Route {
  name: RouteName;
  param?: string;
}

const ROUTES: [RouteName, RegExp][] = [
  ["queue", /^\/$/],
  ["search", /^\/search$/],
  ["orders", /^\/orders$/],
  ["order", /^\/orders\/(\d{1,15})$/],
  ["licenses", /^\/licenses$/],
  ["license", /^\/licenses\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/],
  ["device", /^\/devices\/([0-9a-f]{64})$/],
  ["trials", /^\/trials$/],
  ["audit", /^\/audit$/],
  ["tools", /^\/tools$/],
];

export function matchRoute(path: string): Route {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  for (const [name, re] of ROUTES) {
    const m = re.exec(p);
    if (m) return m[1] === undefined ? { name } : { name, param: m[1] };
  }
  return { name: "not_found" };
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  for (const l of listeners) l();
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  }
  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
```

- [ ] **Step 4: Viết `server/admin-ui/src/search.ts`**

```ts
// Ô tra cứu (spec Web Admin §4.3) và kho từ khóa. Từ khóa chỉ giữ trong bộ nhớ, không đưa lên URL hay history.state
// (spec §4.2), để email không lọt vào lịch sử trình duyệt.
import { useSyncExternalStore } from "react";
import type { LookupQuery } from "./api/endpoints";
import type { LookupResult } from "./api/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CROCKFORD_28 = /^[0-9A-HJKMNP-TV-Z]{28}$/;

/** Nhận dạng chuỗi ở ô tra cứu theo thứ tự của spec §4.3. null: không nhận ra. */
export function detectQuery(raw: string): LookupQuery | null {
  const s = raw.trim();
  if (s === "") return null;
  if (s.includes("@")) return { email: s };
  if (/^\d{1,15}$/.test(s)) return { order_code: Number(s) };
  if (UUID.test(s)) return { license_id: s.toLowerCase() };
  if (/^[0-9a-f]{64}$/i.test(s)) return { device_id_hash: s.toLowerCase() };
  // Như normalizeLicenseKey của server: bỏ khoảng trắng và gạch nối, viết hoa, O→0, I và L→1. Server kiểm ký tự kiểm tra.
  const key = s.replace(/[\s-]/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  if (CROCKFORD_28.test(key)) return { license_key: s };
  return null;
}

/** Kết quả chỉ có một license và mọi đơn đều thuộc license đó: mở thẳng trang license. */
export function singleTarget(r: LookupResult): string | null {
  const lic = r.licenses.length === 1 ? r.licenses[0] : undefined;
  if (lic && r.orders.every((o) => o.license_id === lic.id || o.renew_license_id === lic.id)) return `/licenses/${lic.id}`;
  return null;
}

export interface SearchState {
  query: LookupQuery;
  /** Tăng mỗi lần tìm, để tìm lại cùng từ khóa cũng tải lại. */
  seq: number;
}

let current: SearchState | null = null;
const listeners = new Set<() => void>();

export function setSearch(query: LookupQuery): void {
  current = { query, seq: (current?.seq ?? 0) + 1 };
  for (const l of listeners) l();
}

export function currentSearch(): SearchState | null {
  return current;
}

/** Chỉ cho test. */
export function resetSearch(): void {
  current = null;
}

export function useSearch(): SearchState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run src/router.test.ts src/search.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/router.tsx src/router.test.ts src/search.ts src/search.test.ts
git commit -m "feat(admin-ui): router History API, nhận dạng chuỗi tra cứu, từ khóa chỉ trong bộ nhớ"
```

---

## Task 5: Hook tải dữ liệu và các component dùng chung

**Files:**
- Create: `server/admin-ui/src/hooks.ts`, `server/admin-ui/src/components/{StatusBadge,MaskedKey,ConfirmDialog,DataTable,Feedback,Field,columns}.tsx`
- Test: `server/admin-ui/src/components/ConfirmDialog.test.tsx`, `server/admin-ui/src/components/MaskedKey.test.tsx`

- [ ] **Step 1: Viết test thất bại**

`server/admin-ui/src/components/ConfirmDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ConfirmDialog } from "./ConfirmDialog";

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("ConfirmDialog (spec Web Admin §4.4)", () => {
  it("cần lý do: chưa có thì không bấm được; gửi lý do đã bỏ khoảng trắng; xong thì đóng", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ConfirmDialog title="Gia hạn license?" description="mô tả" confirmLabel="Gia hạn" needsNote onConfirm={onConfirm} onClose={onClose} />);
    expect(button("Gia hạn").disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "   ");
    expect(button("Gia hạn").disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "bù cho khách  ");
    expect(button("Gia hạn").disabled).toBe(false);
    await user.click(button("Gia hạn"));
    expect(onConfirm).toHaveBeenCalledWith("bù cho khách");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("không hoàn tác được: phải có lý do và gõ đúng chữ xác nhận", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    render(
      <ConfirmDialog title="Thu hồi?" description="x" confirmLabel="Thu hồi" needsNote typeToConfirm="THU HOI" onConfirm={onConfirm} onClose={() => {}} />,
    );
    await user.type(screen.getByLabelText(/Lý do/), "hoàn tiền");
    await user.type(screen.getByLabelText(/để xác nhận/), "THU HO");
    expect(button("Thu hồi").disabled).toBe(true);
    await user.type(screen.getByLabelText(/để xác nhận/), "I");
    expect(button("Thu hồi").disabled).toBe(false);
  });

  it("không cần lý do: không có ô Lý do, bấm được ngay", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    render(<ConfirmDialog title="Gửi lại email?" description="x" confirmLabel="Gửi" needsNote={false} onConfirm={onConfirm} onClose={() => {}} />);
    expect(screen.queryByLabelText(/Lý do/)).toBeNull();
    await user.click(button("Gửi"));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("ô nhập thêm chưa hợp lệ thì không bấm được", () => {
    render(
      <ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote={false} extraValid={false} onConfirm={async () => {}} onClose={() => {}} />,
    );
    expect(button("Gia hạn").disabled).toBe(true);
  });

  it("server báo lỗi: hiện câu lỗi, không đóng; 409 thì gọi onConflict", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConflict = vi.fn();
    const onConfirm = vi.fn(async () => {
      throw new ApiError(409, "already_paid", { status: "paid" });
    });
    render(
      <ConfirmDialog title="Cấp tay?" description="x" confirmLabel="Cấp" needsNote={false} onConfirm={onConfirm} onClose={onClose} onConflict={onConflict} />,
    );
    await user.click(button("Cấp"));
    expect((await screen.findByRole("alert")).textContent).toBe("Đơn đã được cấp trước đó (trạng thái hiện tại: paid)");
    expect(onClose).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(button("Cấp").disabled).toBe(false);
  });
});
```

`server/admin-ui/src/components/MaskedKey.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MaskedKey } from "./MaskedKey";

const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

describe("MaskedKey", () => {
  it("che mặc định, bấm Hiện mới thấy key đầy đủ, bấm Ẩn thì che lại", async () => {
    const user = userEvent.setup();
    render(<MaskedKey value={KEY} />);
    expect(screen.getByText("K7Q2-…-9XMB")).toBeTruthy();
    expect(screen.queryByText(KEY)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hiện" }));
    expect(screen.getByText(KEY)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ẩn" }));
    expect(screen.queryByText(KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run src/components`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết `server/admin-ui/src/hooks.ts`**

```ts
// Tải dữ liệu cho trang: useLoad (một lần gọi) và usePaged (danh sách có "Tải thêm" theo next_cursor).
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api/client";
import type { Page } from "./api/types";

function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(0, "internal", { message: String(e) });
}

export interface Loaded<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload(): void;
}

/** Gọi `load` khi `deps` đổi hay khi reload(). Bỏ kết quả của lần gọi cũ nếu deps đã đổi. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => {
        if (live) setState({ data, error: null, loading: false });
      },
      (e: unknown) => {
        if (live) setState({ data: null, error: toApiError(e), loading: false });
      },
    );
    return () => {
      live = false;
    };
    // `load` đổi mỗi lần render; chỉ gọi lại khi deps của trang hay tick đổi.
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export interface Paged<T> {
  rows: T[];
  error: ApiError | null;
  loading: boolean;
  hasMore: boolean;
  more(): void;
  reload(): void;
}

export function usePaged<T>(fetchPage: (cursor?: string) => Promise<Page<T>>, deps: readonly unknown[]): Paged<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchPage().then(
      (p) => {
        if (!live) return;
        setRows(p.items);
        setCursor(p.next_cursor);
        setLoading(false);
      },
      (e: unknown) => {
        if (!live) return;
        setRows([]);
        setCursor(null);
        setError(toApiError(e));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  const more = () => {
    if (!cursor || loading) return;
    setLoading(true);
    fetchPage(cursor).then(
      (p) => {
        setRows((r) => [...r, ...p.items]);
        setCursor(p.next_cursor);
        setLoading(false);
      },
      (e: unknown) => {
        setError(toApiError(e));
        setLoading(false);
      },
    );
  };
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, error, loading, hasMore: cursor !== null, more, reload };
}
```

- [ ] **Step 4: Viết `server/admin-ui/src/components/StatusBadge.tsx`**

```tsx
import type { ReactNode } from "react";
import type { OrderStatus, PlanCode } from "../api/types";

export type Tone = "ok" | "warn" | "bad" | "muted";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const PLAN_LABELS: Record<PlanCode, string> = { monthly: "Monthly", yearly: "Yearly" };

export const ORDER_LABELS: Record<OrderStatus, string> = {
  pending: "Chờ trả",
  processing: "Đang xử lý",
  paid: "Đã trả",
  underpaid: "Chuyển thiếu",
  cancelled: "Đã hủy",
  expired: "Hết hạn link",
  failed: "Lỗi",
  paid_needs_review: "Cần xử lý",
  refunded: "Đã hoàn tiền",
};

const ORDER_TONES: Record<OrderStatus, Tone> = {
  pending: "muted",
  processing: "muted",
  paid: "ok",
  underpaid: "warn",
  cancelled: "muted",
  expired: "muted",
  failed: "bad",
  paid_needs_review: "bad",
  refunded: "muted",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONES[status] ?? "muted"}>{ORDER_LABELS[status] ?? status}</Badge>;
}

export interface LicenseState {
  revoked_at: number | null;
  expires_at: number;
  locked_at: number | null;
  conflict: boolean;
}

/** Nhãn của license: thu hồi, hết hạn hay còn hạn; thêm khóa tạm và xung đột máy khi chưa thu hồi. */
export function LicenseBadges({ license, now }: { license: LicenseState; now: number }) {
  const revoked = license.revoked_at !== null;
  return (
    <>
      {revoked ? (
        <Badge tone="bad">Đã thu hồi</Badge>
      ) : license.expires_at <= now ? (
        <Badge tone="muted">Hết hạn</Badge>
      ) : (
        <Badge tone="ok">Còn hạn</Badge>
      )}
      {!revoked && license.locked_at !== null && <Badge tone="warn">Khóa tạm</Badge>}
      {!revoked && license.conflict && <Badge tone="warn">Xung đột máy</Badge>}
    </>
  );
}
```

- [ ] **Step 5: Viết `server/admin-ui/src/components/MaskedKey.tsx`**

```tsx
import { useState } from "react";
import { maskKey } from "../format";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
    } catch {
      setDone(false);
    }
  }
  return (
    <button type="button" className="link" onClick={copy}>
      {done ? "Đã chép" : "Chép"}
    </button>
  );
}

/** Key che mặc định (spec Web Admin §4.2); bấm Hiện để xem, Chép để chép key đầy đủ. */
export function MaskedKey({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="masked-key">
      <code>{shown ? value : maskKey(value)}</code>
      <button type="button" className="link" onClick={() => setShown((s) => !s)}>
        {shown ? "Ẩn" : "Hiện"}
      </button>
      <CopyButton text={value} />
    </span>
  );
}

/** Hộp hiện key mới một lần, sau thao tác cấp key (spec §4.6). */
export function KeyReveal({ licenseKey, onClose }: { licenseKey: string; onClose(): void }) {
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="key-title">
        <h2 id="key-title">Key mới</h2>
        <p>Key đã được gửi qua email cho khách. Hộp này chỉ hiện một lần.</p>
        <p>
          <code className="key-full">{licenseKey}</code> <CopyButton text={licenseKey} />
        </p>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onClose}>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Viết `server/admin-ui/src/components/ConfirmDialog.tsx`**

```tsx
// Hộp xác nhận của mọi thao tác ghi (spec Web Admin §4.4): mức thường (ô Lý do khi API cần note) và mức không hoàn tác
// được (thêm ô gõ chữ xác nhận).
import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError } from "../api/client";

export interface ConfirmDialogProps {
  title: string;
  /** Hậu quả của thao tác. */
  description: ReactNode;
  confirmLabel: string;
  /** API cần `note`: có ô Lý do, bắt buộc 1–500 ký tự. */
  needsNote: boolean;
  /** Thao tác không hoàn tác được: phải gõ đúng chữ này. */
  typeToConfirm?: string;
  /** Ô nhập thêm của trang (số ngày, email…). */
  children?: ReactNode;
  /** false: ô nhập thêm chưa hợp lệ. */
  extraValid?: boolean;
  onConfirm(note: string): Promise<void>;
  onClose(): void;
  /** Server trả 409 (trạng thái đã đổi): trang tải lại dữ liệu. */
  onConflict?(): void;
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = note.trim();
  const noteOk = !p.needsNote || (trimmed.length >= 1 && trimmed.length <= 500);
  const typedOk = p.typeToConfirm === undefined || typed === p.typeToConfirm;
  const ready = noteOk && typedOk && p.extraValid !== false && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await p.onConfirm(trimmed);
      p.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (err instanceof ApiError && err.status === 409) p.onConflict?.();
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={submit}>
        <h2 id="dialog-title">{p.title}</h2>
        <div className="dialog-desc">{p.description}</div>
        {p.children}
        {p.needsNote && (
          <label>
            Lý do (bắt buộc, ghi vào nhật ký)
            <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        {p.typeToConfirm !== undefined && (
          <label>
            <span>
              Gõ <code>{p.typeToConfirm}</code> để xác nhận
            </span>
            <input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={p.onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className={p.typeToConfirm !== undefined ? "danger solid" : "primary"} disabled={!ready}>
            {busy ? "Đang làm…" : p.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
```

Lưu ý: khi đang chờ, nhãn nút là "Đang làm…", nên test chỉ tìm nút theo `confirmLabel` lúc không chờ.

- [ ] **Step 7: Viết `server/admin-ui/src/components/DataTable.tsx`**

```tsx
import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell(row: T): ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T, index: number): string;
  empty: string;
  hasMore?: boolean;
  loading?: boolean;
  onMore?(): void;
}

/** Bảng dữ liệu; trên màn hình hẹp, CSS đổi mỗi dòng thành một thẻ, nhãn cột lấy từ data-label. */
export function DataTable<T>({ columns, rows, rowKey, empty, hasMore, loading, onMore }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey(r, i)}>
                {columns.map((c) => (
                  <td key={c.header} data-label={c.header}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {(hasMore || (loading && rows.length === 0)) && (
        <div className="table-more">
          {hasMore ? (
            <button type="button" onClick={onMore} disabled={loading}>
              {loading ? "Đang tải…" : "Tải thêm"}
            </button>
          ) : (
            <span className="muted">Đang tải…</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Viết `server/admin-ui/src/components/Feedback.tsx`**

```tsx
import type { ApiError } from "../api/client";

export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{error.message}</span>
      {onRetry && error.code !== "session_expired" && (
        <button type="button" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function Notice({ text, onClose }: { text: string; onClose(): void }) {
  return (
    <div className="notice" role="status">
      <span>{text}</span>
      <button type="button" className="link" onClick={onClose}>
        Đóng
      </button>
    </div>
  );
}
```

- [ ] **Step 9: Viết `server/admin-ui/src/components/Field.tsx`**

```tsx
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange(v: string): void;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateInput({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  return (
    <label className="field">
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
```

- [ ] **Step 10: Viết `server/admin-ui/src/components/columns.tsx`**

```tsx
// Cột dùng chung cho các bảng đơn, license, nhật ký.
import type { AuditRow, LicenseAuditRow, LicenseDetail, LicenseRow, OrderRow } from "../api/types";
import { daysLeft, fmtDate, fmtDateTime, fmtDetail, fmtVnd, maskKey } from "../format";
import { Link } from "../router";
import type { Column } from "./DataTable";
import { LicenseBadges, OrderStatusBadge, PLAN_LABELS } from "./StatusBadge";

export const orderColumns: Column<OrderRow>[] = [
  { header: "Mã đơn", cell: (o) => <Link to={`/orders/${o.order_code}`}>#{o.order_code}</Link> },
  { header: "Tạo lúc", cell: (o) => fmtDateTime(o.created_at) },
  { header: "Email", cell: (o) => o.email ?? "—" },
  { header: "Gói", cell: (o) => PLAN_LABELS[o.plan] },
  {
    header: "Số tiền",
    cell: (o) => (o.amount_paid === o.amount ? fmtVnd(o.amount) : `${fmtVnd(o.amount_paid)} / ${fmtVnd(o.amount)}`),
  },
  { header: "Trạng thái", cell: (o) => <OrderStatusBadge status={o.status} /> },
];

export type LicenseLike = LicenseRow | LicenseDetail;

export function activeDevices(l: LicenseLike): number {
  return "active_devices" in l ? l.active_devices : l.activations.filter((a) => a.deactivated_at === null).length;
}

export function licenseColumns(now: number): Column<LicenseLike>[] {
  return [
    {
      header: "Key",
      cell: (l) => (
        <Link to={`/licenses/${l.id}`}>
          <code>{maskKey(l.license_key)}</code>
        </Link>
      ),
    },
    { header: "Email", cell: (l) => l.email ?? "—" },
    { header: "Gói", cell: (l) => PLAN_LABELS[l.plan] },
    { header: "Hết hạn", cell: (l) => `${fmtDate(l.expires_at)} (${daysLeft(l.expires_at, now)})` },
    { header: "Máy", cell: (l) => String(activeDevices(l)) },
    {
      header: "Trạng thái",
      cell: (l) => (
        <LicenseBadges
          license={{ revoked_at: l.revoked_at, expires_at: l.expires_at, locked_at: l.locked_at, conflict: activeDevices(l) > 1 }}
          now={now}
        />
      ),
    },
  ];
}

export type AnyAudit = AuditRow | LicenseAuditRow;

export const auditColumns: Column<AnyAudit>[] = [
  { header: "Thời điểm", cell: (a) => fmtDateTime(a.at) },
  { header: "Ai", cell: (a) => a.actor },
  { header: "Việc", cell: (a) => <code>{a.action}</code> },
  {
    header: "License",
    cell: (a) => ("license_id" in a && a.license_id ? <Link to={`/licenses/${a.license_id}`}>{a.license_id.slice(0, 8)}</Link> : ""),
  },
  { header: "Đơn", cell: (a) => (a.order_code !== null ? <Link to={`/orders/${a.order_code}`}>#{a.order_code}</Link> : "") },
  { header: "Chi tiết", cell: (a) => <span className="detail">{fmtDetail(a.detail)}</span> },
];
```

- [ ] **Step 11: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run src/components`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/hooks.ts src/components
git commit -m "feat(admin-ui): hộp xác nhận hai mức, key che, bảng dữ liệu, hook tải dữ liệu"
```

---

## Task 6: Trang Việc cần xử lý, Tra cứu, Đơn hàng, Chi tiết đơn

**Files:**
- Create: `server/admin-ui/src/pages/{QueuePage,SearchPage,OrdersPage,OrderPage}.tsx`
- Test: `server/admin-ui/src/pages/QueuePage.test.tsx`

- [ ] **Step 1: Viết test thất bại**

`server/admin-ui/src/pages/QueuePage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueuePage } from "./QueuePage";

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}
const empty = { count: 0, items: [] };
const summary = { revenue_today: 550000, currency: "VND", paid_orders_7d: 12, active_licenses: 87 };

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(queue: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => json(url === "/admin/summary" ? summary : queue)),
  );
}

describe("QueuePage", () => {
  it("ba ô số và báo không có việc khi mọi nhóm rỗng", async () => {
    serve({ needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty });
    render(<QueuePage />);
    expect(await screen.findByText("550.000 đ")).toBeTruthy();
    expect(screen.getByText("87")).toBeTruthy();
    expect(await screen.findByText("Không có việc gì cần xử lý.")).toBeTruthy();
  });

  it("nhóm có việc thì hiện tiêu đề, số lượng, link tới đơn; nhóm rỗng thì ẩn", async () => {
    const order = { order_code: 1000012, email: "khach@example.com", amount: 500000, amount_paid: 500000, created_at: 1_790_812_800 };
    serve({ needs_review: { count: 21, items: [order] }, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty });
    render(<QueuePage />);
    expect(await screen.findByText("Đã nhận tiền nhưng license đã thu hồi")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Đơn #1000012" }).getAttribute("href")).toBe("/orders/1000012");
    expect(screen.getByText("và 20 mục khác")).toBeTruthy();
    expect(screen.queryByText("Chuyển thiếu trong 30 ngày")).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run src/pages`
Expected: FAIL, không tìm thấy `./QueuePage`.

- [ ] **Step 3: Viết `server/admin-ui/src/pages/QueuePage.tsx`**

```tsx
// Trang mở đầu (spec Web Admin §4.2): ba số nhanh và sáu nhóm việc cần xử lý.
import type { ReactNode } from "react";
import { api } from "../api/endpoints";
import type { AlertRow, LicenseRow, OrderRow, Queue, QueueGroup } from "../api/types";
import { ErrorBox } from "../components/Feedback";
import { fmtDateTime, fmtVnd, maskKey } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";

export function QueuePage() {
  const queue = useLoad(() => api.queue(), []);
  const summary = useLoad(() => api.summary(), []);
  return (
    <>
      <h1>Việc cần xử lý</h1>
      {summary.error && <ErrorBox error={summary.error} onRetry={summary.reload} />}
      {summary.data && (
        <div className="tiles">
          <Tile label="Doanh thu hôm nay" value={fmtVnd(summary.data.revenue_today)} />
          <Tile label="Đơn đã trả 7 ngày" value={String(summary.data.paid_orders_7d)} />
          <Tile label="License còn hạn" value={String(summary.data.active_licenses)} />
        </div>
      )}
      {queue.error && <ErrorBox error={queue.error} onRetry={queue.reload} />}
      {queue.loading && !queue.data && <p className="muted">Đang tải…</p>}
      {queue.data && <Groups q={queue.data} />}
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
    </div>
  );
}

function Groups({ q }: { q: Queue }) {
  const total = q.needs_review.count + q.underpaid.count + q.email_failed.count + q.locked.count + q.conflict.count + q.alerts.count;
  if (total === 0) return <p className="all-clear">Không có việc gì cần xử lý.</p>;
  return (
    <>
      <Group title="Đã nhận tiền nhưng license đã thu hồi" hint="Mở đơn, chọn Cấp key mới hoặc Ghi đã hoàn tiền." group={q.needs_review} render={orderItem} />
      <Group title="Chuyển thiếu trong 30 ngày" hint="Khách chuyển bù thì mở đơn, bấm Cấp tay." group={q.underpaid} render={orderItem} />
      <Group title="Đã trả nhưng gửi email key thất bại" hint="Mở license của đơn, bấm Gửi lại email." group={q.email_failed} render={emailItem} />
      <Group title="License đang khóa tạm" hint="Xác minh với khách rồi bấm Mở khóa." group={q.locked} render={licenseItem} />
      <Group title="License đang xung đột máy" hint="Hỏi khách máy nào đang dùng, gỡ máy còn lại." group={q.conflict} render={licenseItem} />
      <Group title="Cảnh báo vận hành chưa gửi email" hint="Cron gửi email cảnh báo mỗi giờ. Còn ở đây lâu thì kiểm cron." group={q.alerts} render={alertItem} />
    </>
  );
}

function Group<T>({ title, hint, group, render }: { title: string; hint: string; group: QueueGroup<T>; render(item: T): ReactNode }) {
  if (group.count === 0) return null;
  return (
    <section className="queue-group">
      <h2>
        {title} <span className="count">{group.count}</span>
      </h2>
      <p className="muted">{hint}</p>
      <ul>
        {group.items.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
      {group.count > group.items.length && <p className="muted">và {group.count - group.items.length} mục khác</p>}
    </section>
  );
}

const orderItem = (o: OrderRow) => (
  <>
    <Link to={`/orders/${o.order_code}`}>Đơn #{o.order_code}</Link> · {o.email ?? "—"} · {fmtVnd(o.amount_paid)} / {fmtVnd(o.amount)} ·{" "}
    {fmtDateTime(o.created_at)}
  </>
);

const emailItem = (o: OrderRow) => (
  <>
    {o.license_id ? (
      <Link to={`/licenses/${o.license_id}`}>License của đơn #{o.order_code}</Link>
    ) : (
      <Link to={`/orders/${o.order_code}`}>Đơn #{o.order_code}</Link>
    )}{" "}
    · {o.email ?? "—"} · thôi gửi lúc {fmtDateTime(o.email_gave_up_at)}
  </>
);

const licenseItem = (l: LicenseRow) => (
  <>
    <Link to={`/licenses/${l.id}`}>
      <code>{maskKey(l.license_key)}</code>
    </Link>{" "}
    · {l.email ?? "—"} · {l.active_devices} máy đang kích hoạt
  </>
);

const alertItem = (a: AlertRow) => (
  <>
    <code>{a.kind}</code> · {a.count} lần, đã báo {a.notified_count} · từ {fmtDateTime(a.window_start)}
  </>
);
```

- [ ] **Step 4: Viết `server/admin-ui/src/pages/SearchPage.tsx`**

```tsx
// Kết quả tra cứu theo email hay license key (spec Web Admin §4.2). Từ khóa lấy từ kho trong bộ nhớ (search.ts).
import { useEffect } from "react";
import { api } from "../api/endpoints";
import { licenseColumns, orderColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { nowSec } from "../format";
import { useLoad } from "../hooks";
import { navigate } from "../router";
import { singleTarget, useSearch } from "../search";

export function SearchPage() {
  const s = useSearch();
  const res = useLoad(() => (s ? api.lookup(s.query) : Promise.resolve(null)), [s?.seq]);
  useEffect(() => {
    if (!res.data) return;
    const to = singleTarget(res.data);
    if (to) navigate(to, { replace: true });
  }, [res.data]);
  if (!s) return <p className="muted">Nhập email hay license key vào ô tra cứu ở trên.</p>;
  const now = nowSec();
  return (
    <>
      <h1>Kết quả tra cứu</h1>
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.loading && <p className="muted">Đang tìm…</p>}
      {res.data && !res.loading && (
        <>
          {res.data.licenses.length === 0 && res.data.orders.length === 0 && <p>Không tìm thấy gì.</p>}
          {res.data.licenses.length > 0 && (
            <>
              <h2>License</h2>
              <DataTable columns={licenseColumns(now)} rows={res.data.licenses} rowKey={(l) => l.id} empty="" />
            </>
          )}
          {res.data.orders.length > 0 && (
            <>
              <h2>Đơn hàng</h2>
              <DataTable columns={orderColumns} rows={res.data.orders} rowKey={(o) => String(o.order_code)} empty="" />
            </>
          )}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 5: Viết `server/admin-ui/src/pages/OrdersPage.tsx`**

```tsx
import { useState } from "react";
import { api } from "../api/endpoints";
import type { OrderStatus } from "../api/types";
import { orderColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { DateInput, Select } from "../components/Field";
import { ORDER_LABELS, PLAN_LABELS } from "../components/StatusBadge";
import { usePaged } from "../hooks";

const STATUS_OPTIONS = [["", "Tất cả"], ...(Object.entries(ORDER_LABELS) as [OrderStatus, string][])] as const;
export const PLAN_OPTIONS = [["", "Tất cả"], ...Object.entries(PLAN_LABELS)] as const;

export function OrdersPage() {
  const [f, setF] = useState({ status: "", plan: "", from: "", to: "" });
  const list = usePaged((cursor) => api.orders({ ...f, cursor }), [f.status, f.plan, f.from, f.to]);
  return (
    <>
      <h1>Đơn hàng</h1>
      <div className="filters">
        <Select label="Trạng thái" value={f.status} options={STATUS_OPTIONS} onChange={(status) => setF({ ...f, status })} />
        <Select label="Gói" value={f.plan} options={PLAN_OPTIONS} onChange={(plan) => setF({ ...f, plan })} />
        <DateInput label="Tạo từ ngày" value={f.from} onChange={(from) => setF({ ...f, from })} />
        <DateInput label="Đến ngày" value={f.to} onChange={(to) => setF({ ...f, to })} />
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <DataTable
        columns={orderColumns}
        rows={list.rows}
        rowKey={(o) => String(o.order_code)}
        empty="Không có đơn nào"
        hasMore={list.hasMore}
        loading={list.loading}
        onMore={list.more}
      />
    </>
  );
}
```

- [ ] **Step 6: Viết `server/admin-ui/src/pages/OrderPage.tsx`**

```tsx
// Chi tiết đơn (spec Web Admin §4.2): Cấp tay, Xử lý đơn paid_needs_review, xem trạng thái trên PayOS, nhật ký của đơn.
import { useState } from "react";
import { api } from "../api/endpoints";
import { auditColumns, licenseColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/DataTable";
import { ErrorBox, Notice } from "../components/Feedback";
import { KeyReveal } from "../components/MaskedKey";
import { OrderStatusBadge, PLAN_LABELS } from "../components/StatusBadge";
import { fmtDateTime, fmtVnd, nowSec } from "../format";
import { useLoad } from "../hooks";

type Dialog = "grant" | "grant_new" | "refunded" | null;

const GRANT_KINDS: Record<string, string> = { new: "Mua mới", extend: "Mua thêm cùng gói", change: "Đổi gói" };

export function OrderPage({ code }: { code: number }) {
  const data = useLoad(() => api.lookup({ order_code: code }), [code]);
  const log = useLoad(() => api.audit({ order_code: String(code) }), [code]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payos, setPayos] = useState<string | null>(null);
  const reload = () => {
    data.reload();
    log.reload();
  };

  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!data.data) return <p className="muted">Đang tải…</p>;
  const order = data.data.orders.find((o) => o.order_code === code);
  if (!order) return <p>Không có đơn #{code}.</p>;
  const closed = order.status === "paid" || order.status === "refunded" || order.status === "paid_needs_review";

  async function showPayos() {
    try {
      setPayos(JSON.stringify(await api.paymentStatus(code), null, 2));
    } catch (e) {
      setPayos(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <h1>
        Đơn #{order.order_code} <OrderStatusBadge status={order.status} />
      </h1>
      {notice && <Notice text={notice} onClose={() => setNotice(null)} />}
      <dl className="facts">
        <dt>Email</dt>
        <dd>{order.email ?? "— (đã ẩn danh)"}</dd>
        <dt>Gói</dt>
        <dd>{PLAN_LABELS[order.plan]}</dd>
        <dt>Số tiền</dt>
        <dd>
          đã trả {fmtVnd(order.amount_paid)} / {fmtVnd(order.amount)}
        </dd>
        <dt>Tạo lúc</dt>
        <dd>{fmtDateTime(order.created_at)}</dd>
        <dt>Trả lúc</dt>
        <dd>{fmtDateTime(order.paid_at)}</dd>
        <dt>Loại</dt>
        <dd>{order.grant_kind ? (GRANT_KINDS[order.grant_kind] ?? order.grant_kind) : order.renew_license_id ? "Gia hạn hay đổi gói" : "Mua mới"}</dd>
        <dt>Email key</dt>
        <dd>
          {order.email_sent_at
            ? `đã gửi ${fmtDateTime(order.email_sent_at)}`
            : order.email_gave_up_at
              ? "gửi thất bại, đã thôi gửi"
              : "chưa gửi"}
        </dd>
      </dl>
      <div className="actions">
        {!closed && (
          <button type="button" onClick={() => setDialog("grant")}>
            Cấp tay…
          </button>
        )}
        {order.status === "paid_needs_review" && (
          <>
            <button type="button" onClick={() => setDialog("grant_new")}>
              Cấp key mới…
            </button>
            <button type="button" className="danger" onClick={() => setDialog("refunded")}>
              Ghi đã hoàn tiền…
            </button>
          </>
        )}
        <button type="button" onClick={showPayos}>
          Xem trạng thái trên PayOS
        </button>
      </div>
      {payos && <pre className="json">{payos}</pre>}
      <h2>License</h2>
      <DataTable columns={licenseColumns(nowSec())} rows={data.data.licenses} rowKey={(l) => l.id} empty="Đơn chưa áp vào license nào" />
      <h2>Nhật ký của đơn</h2>
      {log.error && <ErrorBox error={log.error} onRetry={log.reload} />}
      <DataTable columns={auditColumns} rows={log.data?.items ?? []} rowKey={(a, i) => `${a.at}-${i}`} empty="Chưa có dòng nào" loading={log.loading} />

      {dialog === "grant" && (
        <ConfirmDialog
          title={`Cấp tay đơn #${code}?`}
          description="Cấp license theo gói của đơn, tính từ bây giờ, rồi gửi key qua email. Dùng khi khách chuyển thiếu rồi chuyển bù, hay đơn đã trả mà chưa được cấp."
          confirmLabel="Cấp"
          needsNote
          onConfirm={async (note) => {
            const r = await api.grantOrder(code, note);
            setRevealed(r.license_key);
            reload();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "grant_new" && (
        <ConfirmDialog
          title={`Cấp key mới cho đơn #${code}?`}
          description="License của đơn đã bị thu hồi. Cấp một license mới (key mới, gói của đơn, tính từ bây giờ) và gửi key qua email. License đã thu hồi giữ nguyên."
          confirmLabel="Cấp key mới"
          needsNote
          onConfirm={async (note) => {
            const r = await api.resolveOrder(code, "grant_new_license", note);
            if (r.license_key) setRevealed(r.license_key);
            reload();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "refunded" && (
        <ConfirmDialog
          title={`Ghi đơn #${code} là đã hoàn tiền?`}
          description="Chỉ ghi nhận bạn đã chuyển trả tiền cho khách ngoài hệ thống. Đơn thành refunded, không cấp gì. Không hoàn tác được."
          confirmLabel="Ghi đã hoàn tiền"
          needsNote
          typeToConfirm="DA HOAN TIEN"
          onConfirm={async (note) => {
            await api.resolveOrder(code, "refunded", note);
            setNotice("Đã ghi đơn là đã hoàn tiền.");
            reload();
          }}
          onConflict={reload}
          onClose={() => setDialog(null)}
        />
      )}
      {revealed && <KeyReveal licenseKey={revealed} onClose={() => setRevealed(null)} />}
    </>
  );
}
```

- [ ] **Step 7: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run src/pages`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages
git commit -m "feat(admin-ui): trang Việc cần xử lý, tra cứu, danh sách và chi tiết đơn"
```

---

## Task 7: Trang License, Chi tiết license, Máy, Dùng thử, Nhật ký, Công cụ

**Files:**
- Create: `server/admin-ui/src/pages/{LicensesPage,LicensePage,DevicePage,TrialsPage,AuditPage,ToolsPage,NotFoundPage}.tsx`
- Test: `server/admin-ui/src/pages/LicensePage.test.tsx`

- [ ] **Step 1: Viết test thất bại**

`server/admin-ui/src/pages/LicensePage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicensePage } from "./LicensePage";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
const NOW = Math.floor(Date.now() / 1000);
const license = {
  id: ID,
  license_key: KEY,
  email: "khach@example.com",
  plan: "yearly",
  expires_at: NOW + 365 * 86400,
  created_at: NOW - 86400,
  revoked_at: null,
  locked_at: null,
  conflict: false,
  activations: [
    {
      id: "act-1",
      license_id: ID,
      device_id_hash: "a".repeat(64),
      device_label: "MacBook",
      quota_epoch: 0,
      created_at: NOW - 3600,
      last_validated_at: NOW - 60,
      deactivated_at: null,
      deactivated_by: null,
    },
  ],
  audit: [{ at: NOW - 3600, actor: "webhook", action: "license_issued", order_code: 1000001, detail: null }],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/admin/lookup") return json({ licenses: [license], orders: [] });
      if (url === `/admin/licenses/${ID}/revoke`) return json({ ok: true });
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LicensePage", () => {
  it("tra theo license_id, che key mặc định, có bảng máy", async () => {
    render(<LicensePage id={ID} />);
    expect(await screen.findByText("K7Q2-…-9XMB")).toBeTruthy();
    expect(screen.queryByText(KEY)).toBeNull();
    expect(calls[0]).toEqual({ url: "/admin/lookup", method: "POST", body: { license_id: ID } });
    expect(screen.getByText("MacBook")).toBeTruthy();
  });

  it("thu hồi: cần lý do và gõ THU HOI; gửi note; tải lại trang", async () => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Thu hồi…" }));
    const confirm = () => screen.getByRole("button", { name: "Thu hồi" }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "khách yêu cầu hoàn tiền");
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/để xác nhận/), "THU HOI");
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());
    await waitFor(() => expect(calls.filter((c) => c.url === "/admin/lookup")).toHaveLength(2));
    expect(calls.find((c) => c.url.endsWith("/revoke"))).toEqual({
      url: `/admin/licenses/${ID}/revoke`,
      method: "POST",
      body: { note: "khách yêu cầu hoàn tiền" },
    });
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run src/pages/LicensePage.test.tsx`
Expected: FAIL, không tìm thấy `./LicensePage`.

- [ ] **Step 3: Viết `server/admin-ui/src/pages/LicensesPage.tsx`**

```tsx
import { useState } from "react";
import { api } from "../api/endpoints";
import type { PlanCode } from "../api/types";
import { licenseColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Select } from "../components/Field";
import { KeyReveal } from "../components/MaskedKey";
import { PLAN_LABELS } from "../components/StatusBadge";
import { nowSec } from "../format";
import { usePaged } from "../hooks";
import { PLAN_OPTIONS } from "./OrdersPage";

const STATE_OPTIONS = [
  ["", "Tất cả"],
  ["active", "Còn hạn"],
  ["expired", "Hết hạn"],
  ["revoked", "Đã thu hồi"],
  ["locked", "Khóa tạm"],
  ["conflict", "Xung đột máy"],
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LicensesPage() {
  const [f, setF] = useState({ state: "", plan: "" });
  const list = usePaged((cursor) => api.licenses({ ...f, cursor }), [f.state, f.plan]);
  const [issuing, setIssuing] = useState(false);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanCode>("monthly");
  const [revealed, setRevealed] = useState<string | null>(null);
  return (
    <>
      <h1>License</h1>
      <div className="filters">
        <Select label="Trạng thái" value={f.state} options={STATE_OPTIONS} onChange={(state) => setF({ ...f, state })} />
        <Select label="Gói" value={f.plan} options={PLAN_OPTIONS} onChange={(p) => setF({ ...f, plan: p })} />
        <button type="button" onClick={() => setIssuing(true)}>
          Cấp license mới…
        </button>
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <DataTable
        columns={licenseColumns(nowSec())}
        rows={list.rows}
        rowKey={(l) => l.id}
        empty="Không có license nào"
        hasMore={list.hasMore}
        loading={list.loading}
        onMore={list.more}
      />
      {issuing && (
        <ConfirmDialog
          title="Cấp license mới?"
          description="Tạo license mới không qua đơn (ví dụ bù cho khách), tính từ bây giờ theo số ngày của gói, rồi gửi key qua email."
          confirmLabel="Cấp"
          needsNote
          extraValid={EMAIL.test(email.trim())}
          onConfirm={async (note) => {
            const r = await api.issueLicense(email.trim(), plan, note);
            setRevealed(r.license_key);
            setEmail("");
            list.reload();
          }}
          onClose={() => setIssuing(false)}
        >
          <label>
            Email của khách
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Gói
            <select value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)}>
              {Object.entries(PLAN_LABELS).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </ConfirmDialog>
      )}
      {revealed && <KeyReveal licenseKey={revealed} onClose={() => setRevealed(null)} />}
    </>
  );
}
```

- [ ] **Step 4: Viết `server/admin-ui/src/pages/LicensePage.tsx`**

```tsx
// Chi tiết license (mockup đã duyệt, spec Web Admin §4.2): key che, nhãn trạng thái, thao tác, bảng máy, đơn, nhật ký.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { Activation } from "../api/types";
import { auditColumns, orderColumns } from "../components/columns";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBox, Notice } from "../components/Feedback";
import { MaskedKey } from "../components/MaskedKey";
import { Badge, LicenseBadges, PLAN_LABELS } from "../components/StatusBadge";
import { daysLeft, fmtDate, fmtDateTime, nowSec, shortHash } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";

type Dialog =
  | { kind: "extend" | "resend" | "unlock" | "revoke" }
  | { kind: "deactivate" | "reset"; activation: Activation }
  | null;

export function LicensePage({ id }: { id: string }) {
  const data = useLoad(() => api.lookup({ license_id: id }), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [days, setDays] = useState("30");

  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!data.data) return <p className="muted">Đang tải…</p>;
  const lic = data.data.licenses.find((l) => l.id === id);
  if (!lic) return <p>Không có license này.</p>;
  const now = nowSec();
  const revoked = lic.revoked_at !== null;
  const active = lic.activations.filter((a) => a.deactivated_at === null);
  const daysNum = Number(days);
  const close = () => setDialog(null);

  const deviceColumns: Column<Activation>[] = [
    {
      header: "Tên máy",
      cell: (a) => <Link to={`/devices/${a.device_id_hash}`}>{a.device_label ?? shortHash(a.device_id_hash)}</Link>,
    },
    { header: "Mã máy", cell: (a) => <code>{shortHash(a.device_id_hash)}</code> },
    { header: "Kích hoạt", cell: (a) => fmtDateTime(a.created_at) },
    { header: "Lần kiểm cuối", cell: (a) => fmtDateTime(a.last_validated_at) },
    {
      header: "Trạng thái",
      cell: (a) =>
        a.deactivated_at === null ? (
          <Badge tone="ok">Đang dùng</Badge>
        ) : (
          <Badge tone="muted">
            Đã gỡ ({a.deactivated_by === "admin" ? "admin" : "người dùng"}) {fmtDate(a.deactivated_at)}
          </Badge>
        ),
    },
    {
      header: "",
      cell: (a) =>
        a.deactivated_at === null && !revoked ? (
          <span className="row-actions">
            <button type="button" onClick={() => setDialog({ kind: "reset", activation: a })}>
              Reset hạn mức…
            </button>
            <button type="button" className="danger" onClick={() => setDialog({ kind: "deactivate", activation: a })}>
              Gỡ…
            </button>
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <h1>License</h1>
      {notice && <Notice text={notice} onClose={() => setNotice(null)} />}
      <div className="key-line">
        <MaskedKey value={lic.license_key} />
        <Badge tone="muted">{PLAN_LABELS[lic.plan]}</Badge>
        <LicenseBadges license={lic} now={now} />
      </div>
      <p className="muted">
        {lic.email ?? "— (đã ẩn danh)"} · hết hạn {fmtDate(lic.expires_at)} ({daysLeft(lic.expires_at, now)}) · tạo {fmtDate(lic.created_at)}
      </p>
      {!revoked && (
        <div className="actions">
          <button type="button" onClick={() => setDialog({ kind: "extend" })}>
            Gia hạn…
          </button>
          <button type="button" disabled={!lic.email} onClick={() => setDialog({ kind: "resend" })}>
            Gửi lại email
          </button>
          {lic.locked_at !== null && (
            <button type="button" onClick={() => setDialog({ kind: "unlock" })}>
              Mở khóa
            </button>
          )}
          <button type="button" className="danger" onClick={() => setDialog({ kind: "revoke" })}>
            Thu hồi…
          </button>
        </div>
      )}
      <h2>
        Máy ({active.length} đang kích hoạt{lic.conflict ? ", đang xung đột" : ""})
      </h2>
      <DataTable columns={deviceColumns} rows={lic.activations} rowKey={(a) => a.id} empty="Chưa kích hoạt trên máy nào" />
      <h2>Đơn hàng</h2>
      <DataTable columns={orderColumns} rows={data.data.orders} rowKey={(o) => String(o.order_code)} empty="Không có đơn (license cấp tay)" />
      <h2>Nhật ký (50 dòng gần nhất)</h2>
      <DataTable columns={auditColumns} rows={lic.audit} rowKey={(a, i) => `${a.at}-${i}`} empty="Chưa có dòng nào" />

      {dialog?.kind === "extend" && (
        <ConfirmDialog
          title="Gia hạn license?"
          description="Cộng thêm số ngày, giữ gói. License đã hết hạn thì tính từ bây giờ."
          confirmLabel="Gia hạn"
          needsNote
          extraValid={Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 3650}
          onConfirm={async (note) => {
            const r = await api.extend(id, daysNum, note);
            setNotice(`Đã gia hạn tới ${fmtDate(r.expires_at)}.`);
            data.reload();
          }}
          onClose={close}
        >
          <label>
            Số ngày (1–3650)
            <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
      {dialog?.kind === "resend" && (
        <ConfirmDialog
          title="Gửi lại email chứa key?"
          description={`Gửi key tới ${lic.email ?? ""}.`}
          confirmLabel="Gửi"
          needsNote={false}
          onConfirm={async () => {
            await api.resend(id);
            setNotice("Đã gửi lại email.");
            data.reload();
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === "unlock" && (
        <ConfirmDialog
          title="Mở khóa license?"
          description="Các lần gỡ máy trước lúc mở khóa không còn tính vào ngưỡng khóa tạm."
          confirmLabel="Mở khóa"
          needsNote
          onConfirm={async (note) => {
            await api.unlock(id, note);
            setNotice("Đã mở khóa.");
            data.reload();
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === "revoke" && (
        <ConfirmDialog
          title="Thu hồi license?"
          description="Mọi máy đang dùng key này về Free ở lần kiểm tra kế tiếp. Không hoàn tác được."
          confirmLabel="Thu hồi"
          needsNote
          typeToConfirm="THU HOI"
          onConfirm={async (note) => {
            await api.revoke(id, note);
            setNotice("Đã thu hồi license.");
            data.reload();
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === "deactivate" && (
        <ConfirmDialog
          title={`Gỡ máy ${dialog.activation.device_label ?? shortHash(dialog.activation.device_id_hash)}?`}
          description="Máy này thôi dùng key ở lần kiểm tra kế tiếp. Admin gỡ không tính vào ngưỡng khóa tạm."
          confirmLabel="Gỡ"
          needsNote
          onConfirm={async (note) => {
            await api.deactivate(dialog.activation.id, note);
            setNotice("Đã gỡ máy.");
            data.reload();
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === "reset" && (
        <ConfirmDialog
          title={`Reset hạn mức của máy ${dialog.activation.device_label ?? shortHash(dialog.activation.device_id_hash)}?`}
          description="Máy bắt đầu bộ đếm hạn mức mới ở lần kiểm tra kế tiếp. Chỉ làm khi khách mất bản ghi bộ đếm."
          confirmLabel="Reset"
          needsNote
          onConfirm={async (note) => {
            await api.resetQuota(dialog.activation.id, note);
            setNotice("Đã reset hạn mức của máy.");
            data.reload();
          }}
          onClose={close}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Viết `server/admin-ui/src/pages/DevicePage.tsx`**

```tsx
import { api } from "../api/endpoints";
import { licenseColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Badge } from "../components/StatusBadge";
import { fmtDateTime, nowSec } from "../format";
import { useLoad } from "../hooks";

export function DevicePage({ hash }: { hash: string }) {
  const data = useLoad(() => api.lookup({ device_id_hash: hash }), [hash]);
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!data.data) return <p className="muted">Đang tải…</p>;
  const now = nowSec();
  const trial = data.data.trial ?? null;
  return (
    <>
      <h1>Máy</h1>
      <p>
        <code className="hash">{hash}</code>
      </p>
      <h2>Dùng thử Free</h2>
      {trial ? (
        <dl className="facts">
          <dt>Bắt đầu</dt>
          <dd>{fmtDateTime(trial.started_at)}</dd>
          <dt>Kết thúc</dt>
          <dd>
            {fmtDateTime(trial.ends_at)} {trial.ends_at > now ? <Badge tone="ok">Đang dùng</Badge> : <Badge tone="muted">Đã hết</Badge>}
          </dd>
          <dt>Lần gọi cuối</dt>
          <dd>{fmtDateTime(trial.last_seen_at)}</dd>
        </dl>
      ) : (
        <p className="muted">Máy chưa đăng ký dùng thử.</p>
      )}
      <h2>License từng kích hoạt trên máy</h2>
      <DataTable columns={licenseColumns(now)} rows={data.data.licenses} rowKey={(l) => l.id} empty="Chưa có license nào" />
    </>
  );
}
```

- [ ] **Step 6: Viết `server/admin-ui/src/pages/TrialsPage.tsx`**

```tsx
import { useState } from "react";
import { api } from "../api/endpoints";
import type { TrialRow } from "../api/types";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { Select } from "../components/Field";
import { Badge } from "../components/StatusBadge";
import { fmtDateTime, shortHash } from "../format";
import { usePaged } from "../hooks";
import { Link } from "../router";

const STATE_OPTIONS = [
  ["", "Tất cả"],
  ["active", "Đang dùng thử"],
  ["ended", "Đã hết"],
] as const;

const columns: Column<TrialRow>[] = [
  {
    header: "Máy",
    cell: (t) => (
      <Link to={`/devices/${t.device_id_hash}`}>
        <code>{shortHash(t.device_id_hash)}</code>
      </Link>
    ),
  },
  { header: "Bắt đầu", cell: (t) => fmtDateTime(t.started_at) },
  { header: "Kết thúc", cell: (t) => fmtDateTime(t.ends_at) },
  { header: "Lần gọi cuối", cell: (t) => fmtDateTime(t.last_seen_at) },
  { header: "Đã mua", cell: (t) => (t.purchased ? <Badge tone="ok">Đã mua</Badge> : <Badge tone="muted">Chưa</Badge>) },
];

export function TrialsPage() {
  const [state, setState] = useState("");
  const list = usePaged((cursor) => api.trials({ state, cursor }), [state]);
  return (
    <>
      <h1>Máy &amp; dùng thử</h1>
      <div className="filters">
        <Select label="Trạng thái" value={state} options={STATE_OPTIONS} onChange={setState} />
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <DataTable
        columns={columns}
        rows={list.rows}
        rowKey={(t) => t.device_id_hash}
        empty="Chưa có máy nào dùng thử"
        hasMore={list.hasMore}
        loading={list.loading}
        onMore={list.more}
      />
    </>
  );
}
```

- [ ] **Step 7: Viết `server/admin-ui/src/pages/AuditPage.tsx`**

```tsx
import { type FormEvent, useState } from "react";
import { api } from "../api/endpoints";
import { auditColumns } from "../components/columns";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { DateInput } from "../components/Field";
import { usePaged } from "../hooks";

const EMPTY = { actor: "", action: "", from: "", to: "", includeViews: false };

/** Server chỉ nhận bốn giá trị này (email không vào URL): `admin` khớp mọi `admin:<email>`. */
const ACTOR_OPTIONS = [
  ["", "Tất cả"],
  ["admin", "Người vận hành (admin)"],
  ["api", "App (api)"],
  ["webhook", "Webhook PayOS"],
  ["reconcile", "Đối soát (cron)"],
] as const;

export function AuditPage() {
  const [draft, setDraft] = useState(EMPTY);
  const [f, setF] = useState(EMPTY);
  const list = usePaged(
    (cursor) =>
      api.audit({ actor: f.actor, action: f.action, from: f.from, to: f.to, include_views: f.includeViews ? "1" : undefined, cursor }),
    [f],
  );
  function apply(e: FormEvent) {
    e.preventDefault();
    setF({ ...draft, action: draft.action.trim() });
  }
  return (
    <>
      <h1>Nhật ký</h1>
      <form className="filters" onSubmit={apply}>
        <label className="field">
          Ai (actor)
          <select value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })}>
            {ACTOR_OPTIONS.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Việc (action)
          <input value={draft.action} placeholder="license_revoked… (chữ thường, gạch dưới)" onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
        </label>
        <DateInput label="Từ ngày" value={draft.from} onChange={(from) => setDraft({ ...draft, from })} />
        <DateInput label="Đến ngày" value={draft.to} onChange={(to) => setDraft({ ...draft, to })} />
        <label className="check">
          <input type="checkbox" checked={draft.includeViews} onChange={(e) => setDraft({ ...draft, includeViews: e.target.checked })} />
          Hiện cả lượt xem và tra cứu
        </label>
        <button type="submit">Lọc</button>
      </form>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <DataTable
        columns={auditColumns}
        rows={list.rows}
        rowKey={(a, i) => ("id" in a ? String(a.id) : String(i))}
        empty="Không có dòng nào"
        hasMore={list.hasMore}
        loading={list.loading}
        onMore={list.more}
      />
    </>
  );
}
```

- [ ] **Step 8: Viết `server/admin-ui/src/pages/ToolsPage.tsx`**

```tsx
// Công cụ (spec Web Admin §4.2): ký thử khóa dự phòng, xác nhận webhook PayOS, ẩn danh theo email.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { KeyCheck } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Notice } from "../components/Feedback";
import { CopyButton } from "../components/MaskedKey";

const WEBHOOK_URL = "https://api.aitranslator.io.vn/v1/webhooks/payos";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Dialog = "sign" | "webhook" | "erase" | null;

export function ToolsPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [signed, setSigned] = useState<KeyCheck | null>(null);
  const [url, setUrl] = useState(WEBHOOK_URL);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setDialog(null);
  const signedJson = signed ? JSON.stringify(signed) : "";
  return (
    <>
      <h1>Công cụ</h1>
      {notice && <Notice text={notice} onClose={() => setNotice(null)} />}

      <section className="card">
        <h2>Ký thử bằng khóa dự phòng</h2>
        <p className="muted">
          Worker API ký một token bằng khóa dự phòng. Kiểm token bằng <code>scripts/verify-token.mjs</code>. Token không dùng được làm bản quyền.
        </p>
        <button type="button" onClick={() => setDialog("sign")}>
          Ký thử…
        </button>
        {signed && (
          <>
            <p>
              Ô <code>{signed.slot}</code>, kid <code>{signed.kid}</code> <CopyButton text={signedJson} />
            </p>
            <pre className="json">{signedJson}</pre>
            <p className="muted">
              Chép khối trên rồi chạy trong <code>server/</code>: <code>pbpaste | node scripts/verify-token.mjs production</code>
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Xác nhận webhook PayOS</h2>
        <p className="muted">Đăng ký lại URL webhook với PayOS. Chỉ nhận URL trên đúng Worker API (API_ORIGIN).</p>
        <label className="field">
          URL webhook
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <button type="button" onClick={() => setDialog("webhook")}>
          Xác nhận…
        </button>
      </section>

      <section className="card">
        <h2>Ẩn danh dữ liệu theo email</h2>
        <p className="muted">
          Khi khách yêu cầu xóa dữ liệu: bỏ email và tên máy, giữ số liệu kế toán. License vẫn dùng được nhưng không khôi phục được qua email nữa.
        </p>
        <label className="field">
          Email của khách
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" className="danger" disabled={!EMAIL.test(email.trim())} onClick={() => setDialog("erase")}>
          Ẩn danh…
        </button>
      </section>

      {dialog === "sign" && (
        <ConfirmDialog
          title="Ký thử bằng khóa dự phòng?"
          description="Worker API ký một token thử. Không đổi dữ liệu nào."
          confirmLabel="Ký thử"
          needsNote={false}
          onConfirm={async () => setSigned(await api.testSign())}
          onClose={close}
        />
      )}
      {dialog === "webhook" && (
        <ConfirmDialog
          title="Đăng ký webhook với PayOS?"
          description={`PayOS sẽ gửi webhook tới ${url}.`}
          confirmLabel="Xác nhận"
          needsNote={false}
          onConfirm={async () => {
            const r = await api.confirmWebhook(url.trim());
            setNotice(`Đã đăng ký webhook: ${r.webhook_url}`);
          }}
          onClose={close}
        />
      )}
      {dialog === "erase" && (
        <ConfirmDialog
          title={`Ẩn danh dữ liệu của ${email.trim()}?`}
          description="Bỏ email khỏi mọi đơn và license, bỏ tên máy. Không hoàn tác được."
          confirmLabel="Ẩn danh"
          needsNote
          typeToConfirm="AN DANH"
          onConfirm={async (note) => {
            const r = await api.erase(email.trim(), note);
            setNotice(`Đã ẩn danh: ${r.orders} đơn, ${r.licenses} license, ${r.activations} máy.`);
            setEmail("");
          }}
          onClose={close}
        />
      )}
    </>
  );
}
```

- [ ] **Step 9: Viết `server/admin-ui/src/pages/NotFoundPage.tsx`**

```tsx
import { Link } from "../router";

export function NotFoundPage() {
  return (
    <>
      <h1>Không có trang này</h1>
      <p>
        <Link to="/">Về Việc cần xử lý</Link>
      </p>
    </>
  );
}
```

- [ ] **Step 10: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run src/pages`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/pages
git commit -m "feat(admin-ui): trang license, chi tiết license, máy, dùng thử, nhật ký, công cụ"
```

---

## Task 8: Khung trang (App, thanh bên, ô tra cứu) và giao diện CSS

**Files:**
- Create: `server/admin-ui/src/components/Sidebar.tsx`, `server/admin-ui/src/components/SearchBox.tsx`
- Modify: `server/admin-ui/src/App.tsx` (thay bản tạm), `server/admin-ui/src/styles.css` (thay bản tạm)
- Test: `server/admin-ui/src/components/SearchBox.test.tsx`, `server/admin-ui/src/App.test.tsx`

- [ ] **Step 1: Viết test thất bại**

`server/admin-ui/src/components/SearchBox.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { currentSearch, resetSearch } from "../search";
import { SearchBox } from "./SearchBox";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  resetSearch();
});

describe("SearchBox", () => {
  it("email: sang /search, từ khóa không lên URL hay history.state, chỉ giữ trong bộ nhớ", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(screen.getByLabelText("Tra cứu"), "khach@example.com{Enter}");
    expect(window.location.pathname).toBe("/search");
    expect(window.location.href).not.toContain("khach");
    expect(window.history.state).toBeNull();
    expect(currentSearch()?.query).toEqual({ email: "khach@example.com" });
  });

  it("mã đơn, license id, mã máy: mở thẳng trang chi tiết", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    const box = screen.getByLabelText("Tra cứu");
    await user.type(box, "1000012{Enter}");
    expect(window.location.pathname).toBe("/orders/1000012");
    await user.clear(box);
    await user.type(box, "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69{Enter}");
    expect(window.location.pathname).toBe("/licenses/0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69");
    await user.clear(box);
    await user.type(box, `${"b".repeat(64)}{Enter}`);
    expect(window.location.pathname).toBe(`/devices/${"b".repeat(64)}`);
    expect(currentSearch()).toBeNull();
  });

  it("chuỗi lạ: báo không nhận ra, không đổi trang, không gọi tra cứu", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(screen.getByLabelText("Tra cứu"), "xin chào{Enter}");
    expect(screen.getByRole("alert").textContent).toBe("Không nhận ra loại chuỗi");
    expect(window.location.pathname).toBe("/");
    expect(currentSearch()).toBeNull();
  });
});
```

`server/admin-ui/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const empty = { count: 0, items: [] };
const responses: Record<string, unknown> = {
  "/admin/whoami": { operator: "ops@example.com" },
  "/admin/queue": { needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty },
  "/admin/summary": { revenue_today: 0, currency: "VND", paid_orders_7d: 0, active_licenses: 0 },
  "/admin/orders": { items: [], next_cursor: null },
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = responses[url.split("?")[0] ?? ""];
      return new Response(JSON.stringify(body ?? { error: "not_found" }), {
        status: body ? 200 : 404,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("mở đầu ở Việc cần xử lý, hiện email người vận hành; bấm thanh bên thì đổi trang", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Việc cần xử lý" })).toBeTruthy();
    expect(await screen.findByText("ops@example.com")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Đơn hàng" }));
    expect(window.location.pathname).toBe("/orders");
    expect(await screen.findByRole("heading", { name: "Đơn hàng" })).toBeTruthy();
    expect(screen.getByText("Tổng quan").closest("[aria-disabled]")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("phiên Access hết hạn: hiện thanh báo có nút tải lại", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() }) as Response));
    render(<App />);
    expect(await screen.findByRole("button", { name: "Tải lại trang" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run src/components/SearchBox.test.tsx src/App.test.tsx`
Expected: FAIL, không tìm thấy `./SearchBox`; App tạm chưa có heading.

- [ ] **Step 3: Viết `server/admin-ui/src/components/SearchBox.tsx`**

```tsx
// Ô tra cứu luôn hiện ở thanh trên (spec Web Admin §4.1, §4.3).
import { type FormEvent, useState } from "react";
import { navigate } from "../router";
import { detectQuery, setSearch } from "../search";

export function SearchBox() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = detectQuery(text);
    if (!q) {
      setError("Không nhận ra loại chuỗi");
      return;
    }
    setError(null);
    if ("device_id_hash" in q) navigate(`/devices/${q.device_id_hash}`);
    else if ("order_code" in q) navigate(`/orders/${q.order_code}`);
    else if ("license_id" in q) navigate(`/licenses/${q.license_id}`);
    else {
      setSearch(q);
      navigate("/search");
    }
  }

  return (
    <form className="search" role="search" onSubmit={submit}>
      <input
        aria-label="Tra cứu"
        placeholder="Email, mã đơn, license key, license id hay mã máy"
        value={text}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      <button type="submit">Tìm</button>
      {error && (
        <span className="search-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Viết `server/admin-ui/src/components/Sidebar.tsx`**

```tsx
import { Link, type RouteName } from "../router";

const NAV: { to: string; label: string; routes: RouteName[] }[] = [
  { to: "/", label: "Việc cần xử lý", routes: ["queue"] },
  { to: "/orders", label: "Đơn hàng", routes: ["orders", "order"] },
  { to: "/licenses", label: "License", routes: ["licenses", "license"] },
  { to: "/trials", label: "Máy & dùng thử", routes: ["trials", "device"] },
  { to: "/audit", label: "Nhật ký", routes: ["audit"] },
  { to: "/tools", label: "Công cụ", routes: ["tools"] },
];

export function Sidebar({ current, open }: { current: RouteName; open: boolean }) {
  const [first, ...rest] = NAV;
  const item = (n: (typeof NAV)[number]) => (
    <Link key={n.to} to={n.to} className={`nav-item${n.routes.includes(current) ? " active" : ""}`}>
      {n.label}
    </Link>
  );
  return (
    <nav className={`sidebar${open ? " open" : ""}`} aria-label="Điều hướng">
      {first && item(first)}
      {/* Phần 2 của lộ trình (spec Web Admin §1). */}
      <span className="nav-item disabled" aria-disabled="true">
        Tổng quan <small>sắp có</small>
      </span>
      {rest.map(item)}
    </nav>
  );
}
```

- [ ] **Step 5: Thay `server/admin-ui/src/App.tsx`**

```tsx
// Khung trang (spec Web Admin §4.1, bố cục A): thanh trên có ô tra cứu, thanh bên trái, nội dung theo route.
import { useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT } from "./api/client";
import { api } from "./api/endpoints";
import { SearchBox } from "./components/SearchBox";
import { Sidebar } from "./components/Sidebar";
import { useLoad } from "./hooks";
import { AuditPage } from "./pages/AuditPage";
import { DevicePage } from "./pages/DevicePage";
import { LicensePage } from "./pages/LicensePage";
import { LicensesPage } from "./pages/LicensesPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrderPage } from "./pages/OrderPage";
import { OrdersPage } from "./pages/OrdersPage";
import { QueuePage } from "./pages/QueuePage";
import { SearchPage } from "./pages/SearchPage";
import { ToolsPage } from "./pages/ToolsPage";
import { TrialsPage } from "./pages/TrialsPage";
import { Link, matchRoute, type Route, usePath } from "./router";

function Page({ route }: { route: Route }) {
  const p = route.param ?? "";
  switch (route.name) {
    case "queue":
      return <QueuePage />;
    case "search":
      return <SearchPage />;
    case "orders":
      return <OrdersPage />;
    case "order":
      return <OrderPage key={p} code={Number(p)} />;
    case "licenses":
      return <LicensesPage />;
    case "license":
      return <LicensePage key={p} id={p} />;
    case "device":
      return <DevicePage key={p} hash={p} />;
    case "trials":
      return <TrialsPage />;
    case "audit":
      return <AuditPage />;
    case "tools":
      return <ToolsPage />;
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  const path = usePath();
  const route = matchRoute(path);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const me = useLoad(() => api.whoami(), []);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);
  useEffect(() => setMenuOpen(false), [path]);

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="menu-btn" aria-label="Mở menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          ☰
        </button>
        <Link to="/" className="brand">
          AI Translator Admin
        </Link>
        <SearchBox />
        <span className="operator">{me.data?.operator ?? ""}</span>
      </header>
      {expired && (
        <div className="banner" role="alert">
          <span>Phiên đăng nhập hết hạn.</span>
          <button type="button" onClick={() => window.location.reload()}>
            Tải lại trang
          </button>
        </div>
      )}
      <div className="layout">
        <Sidebar current={route.name} open={menuOpen} />
        <main className="main">
          <Page route={route} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Thay `server/admin-ui/src/styles.css`**

```css
/* Trang Web Admin. Không dùng style inline (CSP style-src 'self'). Màu sáng/tối theo hệ điều hành. */
:root {
  --bg: #f6f7f9;
  --panel: #ffffff;
  --text: #1c2230;
  --muted: #5d6678;
  --line: #dde1e8;
  --accent: #2f5bd3;
  --accent-text: #ffffff;
  --ok: #1f7a3d;
  --ok-bg: #e3f4e8;
  --warn: #8a5a00;
  --warn-bg: #fdf1d8;
  --bad: #b4261f;
  --bad-bg: #fbe4e2;
  --muted-bg: #eceff3;
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #12151b;
    --panel: #1b2029;
    --text: #e6e9ef;
    --muted: #9aa3b5;
    --line: #2c3340;
    --accent: #6d8ff0;
    --accent-text: #0d1117;
    --ok: #7fd49a;
    --ok-bg: #173322;
    --warn: #f0c46a;
    --warn-bg: #3a2d10;
    --bad: #f2938c;
    --bad-bg: #3d1a18;
    --muted-bg: #252b36;
  }
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.45; }
a { color: var(--accent); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
h1 { font-size: 20px; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
h2 { font-size: 15px; margin: 20px 0 8px; }
.muted { color: var(--muted); }

input, select, textarea, button { font: inherit; color: inherit; }
input, select, textarea { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; }
button { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
button.danger { border-color: var(--bad); color: var(--bad); }
button.danger.solid { background: var(--bad); color: #fff; }
button.link { border: none; background: none; color: var(--accent); padding: 0 4px; }

/* Khung */
.topbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 12px; align-items: center; padding: 8px 16px; background: var(--panel); border-bottom: 1px solid var(--line); min-height: 50px; }
.brand { font-weight: 600; text-decoration: none; color: var(--text); white-space: nowrap; }
.search { flex: 1; display: flex; gap: 6px; align-items: center; max-width: 640px; position: relative; }
.search input { flex: 1; min-width: 0; }
.search-error { position: absolute; top: 100%; left: 0; color: var(--bad); font-size: 12px; }
.operator { color: var(--muted); font-size: 12px; white-space: nowrap; margin-left: auto; }
.menu-btn { display: none; }
.banner { background: var(--warn-bg); color: var(--warn); padding: 8px 16px; display: flex; gap: 10px; align-items: center; }
.layout { display: flex; min-height: calc(100vh - 50px); }
.sidebar { width: 200px; flex-shrink: 0; padding: 12px 8px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
.nav-item { padding: 6px 10px; border-radius: 6px; color: var(--text); text-decoration: none; }
.nav-item.active { background: var(--muted-bg); font-weight: 600; }
.nav-item.disabled { color: var(--muted); cursor: default; }
.nav-item small { font-size: 11px; }
.main { flex: 1; min-width: 0; padding: 16px 20px 40px; max-width: 1200px; }

/* Nội dung */
.badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
.badge-ok { background: var(--ok-bg); color: var(--ok); }
.badge-warn { background: var(--warn-bg); color: var(--warn); }
.badge-bad { background: var(--bad-bg); color: var(--bad); }
.badge-muted { background: var(--muted-bg); color: var(--muted); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; }
.tile-label { color: var(--muted); font-size: 12px; }
.tile-value { font-size: 20px; }
.queue-group { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--warn); border-radius: 8px; padding: 2px 14px 10px; margin-bottom: 12px; }
.queue-group h2 { margin-top: 10px; }
.queue-group p { margin: 4px 0; }
.queue-group ul { margin: 6px 0; padding-left: 18px; }
.count { background: var(--warn-bg); color: var(--warn); border-radius: 10px; padding: 0 8px; font-size: 12px; }
.all-clear { background: var(--ok-bg); color: var(--ok); border-radius: 8px; padding: 12px 14px; }
.filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-bottom: 12px; }
.field { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); }
.field input, .field select { color: var(--text); font-size: 14px; }
.check { display: flex; gap: 6px; align-items: center; font-size: 13px; }
.table-wrap { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; color: var(--muted); font-weight: 600; }
tbody tr:last-child td { border-bottom: none; }
.table-more { padding: 8px 10px; border-top: 1px solid var(--line); }
.empty { color: var(--muted); text-align: center; padding: 16px; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; margin: 0 0 12px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
.key-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.masked-key { display: inline-flex; gap: 4px; align-items: center; }
.masked-key code { font-size: 15px; }
.key-full { font-size: 15px; user-select: all; word-break: break-all; }
.hash { word-break: break-all; }
.detail { font-size: 12px; color: var(--muted); word-break: break-word; }
pre.json { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; overflow: auto; max-height: 320px; white-space: pre-wrap; word-break: break-all; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 2px 14px 14px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.card .field { align-self: stretch; }
.error { color: var(--bad); margin: 0; }
.error-box { background: var(--bad-bg); color: var(--bad); border-radius: 8px; padding: 8px 12px; display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.notice { background: var(--ok-bg); color: var(--ok); border-radius: 8px; padding: 8px 12px; display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }

/* Hộp xác nhận */
.overlay { position: fixed; inset: 0; background: rgb(0 0 0 / 0.45); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
.dialog { background: var(--panel); border-radius: 10px; padding: 16px; width: min(460px, 100%); display: flex; flex-direction: column; gap: 10px; max-height: calc(100vh - 32px); overflow: auto; }
.dialog h2 { margin: 0; }
.dialog label { display: flex; flex-direction: column; gap: 4px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Màn hình hẹp (điện thoại): thanh bên thành menu ☰, bảng thành thẻ */
@media (max-width: 800px) {
  .menu-btn { display: inline-block; }
  .operator { display: none; }
  .sidebar { position: fixed; top: 50px; left: 0; bottom: 0; background: var(--panel); z-index: 20; transform: translateX(-100%); transition: transform 0.15s; }
  .sidebar.open { transform: none; box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.3); }
  .main { padding: 12px 16px 32px; }
  table thead { display: none; }
  table, tbody, tr, td { display: block; width: 100%; }
  tbody tr { border-bottom: 1px solid var(--line); padding: 6px 0; }
  td { border: none; padding: 2px 10px; }
  td[data-label]::before { content: attr(data-label); display: inline-block; min-width: 96px; color: var(--muted); font-size: 12px; }
  td.empty::before { content: none; }
}

@media (max-width: 480px) {
  .brand { display: none; }
}
```

- [ ] **Step 7: Chạy toàn bộ test và build**

Run: `pnpm check`
Expected: typecheck, mọi test, build đều qua. Kiểm lại CSP: `grep -c "<script>" dist/index.html; grep -c "style=" dist/index.html` in `0`.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat(admin-ui): khung trang bố cục A (thanh bên, ô tra cứu), báo phiên hết hạn, CSS sáng/tối và màn hình hẹp"
```

---

## Task 9: API giả cho `pnpm dev`, nối build vào Worker admin và `pnpm check`

**Files:**
- Modify: `server/admin-ui/dev/fake-api.ts` (thay bản tạm)
- Modify: `server/wrangler.admin.jsonc`, `server/package.json`, `server/test/node/wrangler-config.test.mjs`

- [ ] **Step 1: Thay `server/admin-ui/dev/fake-api.ts`**

```ts
// API giả cho `pnpm dev` (apply: "serve": chỉ dev server). Không có trong bản build, không chạy trên Worker.
// Dữ liệu mẫu đủ để xem mọi màn hình; thao tác ghi trả thành công giả.
import type { Plugin } from "vite";

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const LIC = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
const DEVICE_A = `3fa1${"0".repeat(56)}c09e`;
const DEVICE_B = `91be${"0".repeat(56)}77d2`;

function order(code: number, status: string, extra: Record<string, unknown> = {}) {
  const paid = status === "paid" || status === "paid_needs_review";
  return {
    order_code: code,
    provider: "payos",
    plan: "yearly",
    amount: 500000,
    amount_paid: paid ? 500000 : status === "underpaid" ? 200000 : 0,
    currency: "VND",
    email: "khach@gmail.com",
    status,
    grant_kind: status === "paid" ? "new" : null,
    license_id: status === "paid" ? LIC : null,
    renew_license_id: null,
    created_at: NOW - DAY,
    paid_at: paid ? NOW - DAY : null,
    email_sent_at: status === "paid" ? NOW - DAY : null,
    email_gave_up_at: null,
    ...extra,
  };
}

const licenseRow = {
  id: LIC,
  license_key: "K7Q2-…-9XMB",
  email: "khach@gmail.com",
  plan: "yearly",
  expires_at: NOW + 365 * DAY,
  created_at: NOW - DAY,
  revoked_at: null,
  locked_at: null,
  active_devices: 2,
};

const activation = (id: string, hash: string, label: string) => ({
  id,
  license_id: LIC,
  device_id_hash: hash,
  device_label: label,
  quota_epoch: 0,
  created_at: NOW - DAY,
  last_validated_at: NOW - 300,
  deactivated_at: null,
  deactivated_by: null,
});

const licenseDetail = {
  ...licenseRow,
  license_key: KEY,
  conflict: true,
  activations: [activation("act-1", DEVICE_A, "MacBook-Phong"), activation("act-2", DEVICE_B, "DESKTOP-ABC")],
  audit: [
    { at: NOW - 3600, actor: "api", action: "license_activated", order_code: null, detail: '{"allow_conflict":true}' },
    { at: NOW - DAY, actor: "webhook", action: "license_issued", order_code: 1000012, detail: null },
  ],
};

const group = (items: unknown[]) => ({ count: items.length, items });
const page = (items: unknown[]) => ({ items, next_cursor: null });

function respond(method: string, path: string): unknown {
  if (method === "POST") {
    if (path === "/admin/lookup") return { licenses: [licenseDetail], orders: [order(1000012, "paid")], trial: { started_at: NOW - 12 * DAY, ends_at: NOW - 2 * DAY, last_seen_at: NOW - DAY } };
    if (path === "/admin/keys/test-sign") return { slot: "b", kid: "2026-10-b", token: "v1.eyJ0ZXN0Ijp0cnVlfQ.c2ln" };
    if (path === "/admin/erase") return { activations: 2, licenses: 1, orders: 1 };
    if (path === "/admin/payos/confirm-webhook") return { ok: true, webhook_url: "https://api.aitranslator.io.vn/v1/webhooks/payos" };
    if (/\/(grant|resolve)$/.test(path) || path === "/admin/licenses") {
      return { order_code: 1000013, status: "paid", license_id: LIC, license_key: KEY, plan: "yearly", expires_at: NOW + 365 * DAY };
    }
    if (path.endsWith("/extend")) return { license_id: LIC, expires_at: NOW + 395 * DAY };
    return { ok: true };
  }
  switch (path) {
    case "/admin/whoami":
      return { operator: "ops@aitranslator.io.vn" };
    case "/admin/summary":
      return { revenue_today: 550000, currency: "VND", paid_orders_7d: 12, active_licenses: 87 };
    case "/admin/queue":
      return {
        needs_review: group([order(1000014, "paid_needs_review")]),
        underpaid: group([order(1000015, "underpaid")]),
        email_failed: group([]),
        locked: group([]),
        conflict: group([licenseRow]),
        alerts: group([{ kind: "webhook_bad_signature", window_start: NOW - 1800, count: 3, notified_count: 0 }]),
      };
    case "/admin/orders":
      return page([order(1000015, "underpaid"), order(1000014, "paid_needs_review"), order(1000012, "paid")]);
    case "/admin/licenses":
      return page([licenseRow]);
    case "/admin/trials":
      return page([{ device_id_hash: DEVICE_A, started_at: NOW - 12 * DAY, ends_at: NOW - 2 * DAY, last_seen_at: NOW - DAY, purchased: true }]);
    case "/admin/audit":
      return {
        items: [{ id: 2, at: NOW - 3600, actor: "api", action: "license_activated", license_id: LIC, order_code: null, detail: null }],
        next_cursor: null,
      };
    default:
      if (/^\/admin\/orders\/\d+\/payment-status$/.test(path)) return { orderCode: 1000012, status: "paid", amount: 500000, amountPaid: 500000 };
      return undefined;
  }
}

export function fakeAdminApi(): Plugin {
  return {
    name: "fake-admin-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://dev").pathname;
        if (!path.startsWith("/admin/")) return next();
        const body = respond(req.method ?? "GET", path);
        res.statusCode = body === undefined ? 404 : 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body ?? { error: "not_found" }));
      });
    },
  };
}
```

- [ ] **Step 2: Xem thử bằng `pnpm dev`**

```bash
cd server/admin-ui && pnpm dev
```

Mở `http://127.0.0.1:5180`. Bấm qua mọi mục của thanh bên; tra cứu bằng `khach@gmail.com`, `1000012`, `K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB`; mở một license, thử hộp Thu hồi (phải gõ `THU HOI`). Thu hẹp cửa sổ dưới 800px: thanh bên thành nút ☰, bảng thành thẻ. Tắt dev server bằng Ctrl+C.

Người thực thi không có trình duyệt thì bỏ bước này và ghi lại trong báo cáo; chủ dự án xem ở kế hoạch 03.

- [ ] **Step 3: Viết test cấu hình thất bại**

Thêm vào cuối `server/test/node/wrangler-config.test.mjs`:

```js
test("Worker admin phục vụ trang Web Admin qua ASSETS, sau lớp kiểm Access (spec Web Admin §2)", () => {
  assert.deepEqual(admin.assets, {
    directory: "./admin-ui/dist",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: true,
  });
  assert.equal("assets" in api, false, "Worker API không phục vụ trang");
});
```

Run: `cd server && pnpm test:scripts`
Expected: FAIL, `admin.assets` là `undefined`.

- [ ] **Step 4: Thêm khối `assets` vào `server/wrangler.admin.jsonc`**

Ngay sau dòng `"preview_urls": false,` thêm:

```jsonc
  // Trang Web Admin (spec 2026-10-07 Web Admin §2): SPA build từ admin-ui/ (`pnpm ui:build` trước khi deploy).
  // run_worker_first: mọi request, kể cả file tĩnh, đi qua lớp kiểm Access của Worker (src/admin-auth.ts) trước;
  // Worker gọi env.ASSETS.fetch sau đó (src/admin-assets.ts). Route lạ trả index.html (SPA), trừ /admin/*.
  "assets": {
    "directory": "./admin-ui/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  },
```

- [ ] **Step 5: Nối build và test của UI vào `pnpm check` của server**

Trong `server/package.json`, trong `scripts`:

```json
    "ui:build": "pnpm --filter mt-license-admin-ui build",
    "ui:check": "pnpm --filter mt-license-admin-ui check",
    "check": "pnpm typecheck && pnpm vectors:check && pnpm test && pnpm test:scripts && pnpm ui:check && pnpm dry-run"
```

(`ui:check` build ra `admin-ui/dist` trước `dry-run`, vì `wrangler deploy --dry-run -c wrangler.admin.jsonc` cần thư mục đó.)

- [ ] **Step 6: Chạy bộ kiểm đầy đủ**

Run: `cd server && pnpm check`
Expected:
- `test:scripts` PASS (cả test mới);
- `ui:check` PASS;
- `dry-run` của Worker admin liệt kê binding `ASSETS` và báo số file tĩnh tải lên, không lỗi. Chép phần output đó vào báo cáo.

- [ ] **Step 7: Commit**

```bash
cd server
git add admin-ui/dev/fake-api.ts wrangler.admin.jsonc package.json test/node/wrangler-config.test.mjs
git commit -m "feat(admin): Worker admin phục vụ trang Web Admin (assets, run_worker_first); pnpm check build và test UI"
```

---

## Task 10: Kiểm cuối kế hoạch 02

- [ ] **Step 1: Bộ kiểm như CI**

```bash
cd server && pnpm install --frozen-lockfile && pnpm check && pnpm audit --audit-level high
```

Expected: tất cả qua (đúng các bước của job "License server" trong `.github/workflows/ci.yml`).

- [ ] **Step 2: Rà bản build**

```bash
cd server/admin-ui
grep -c "<script>" dist/index.html; grep -c "style=" dist/index.html
grep -l "fake-admin-api\|khach@gmail.com" dist/assets/* || echo "không có API giả trong bản build"
```

Expected: `0`, `0`, và dòng "không có API giả trong bản build".

- [ ] **Step 3: `git status` sạch, không có `dist/` hay `node_modules/` của UI.**
