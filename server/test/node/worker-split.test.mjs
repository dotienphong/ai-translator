// Hai Worker (API và admin) dùng chung một vài file nguồn nhưng không được kéo mã của nhau (kế hoạch hardening 06, task B3).
// Test đọc thẳng file nguồn nên không phụ thuộc esbuild hay wrangler. Chạy bằng `pnpm test:scripts`.
//
// `src/deps.ts` là phụ thuộc của Worker API (route, webhook, cron). Dây nối của Worker admin (realAdminDeps, adminPayments,
// creemReaderFromEnv) nằm ở `src/admin-deps.ts`. Nếu `deps.ts` nhập `./admin*`, bundle API phải trông chờ vào việc esbuild
// loại được mã admin (tree-shaking), và một tác dụng phụ ở cấp module của admin-ops hay admin-auth sẽ lọt vào Worker API.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Bỏ chú thích (cả dòng lẫn khối) để một dòng chú thích nhắc tên `./admin-ops` không bị tính là import. */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Các đường dẫn `./admin…` mà một file nguồn nhập: `import … from`, `import type … from`, `export … from`, `import("…")`,
 * `require("…")`, `import "…"` thuần tác dụng phụ; ngoặc đơn hay kép.
 */
function adminImports(text) {
  const code = withoutComments(text);
  const found = [];
  const patterns = [/\bfrom\s*["'](\.\/admin[^"']*)["']/g, /\b(?:import|require)\s*\(\s*["'](\.\/admin[^"']*)["']\s*\)/g, /\bimport\s*["'](\.\/admin[^"']*)["']/g];
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) found.push(match[1]);
  return found;
}

function source(name) {
  return readFileSync(new URL(`../../src/${name}`, import.meta.url), "utf8");
}

test("src/deps.ts (dùng chung với Worker API) không nhập gì từ ./admin*, kể cả import type: dây nối admin ở admin-deps.ts", () => {
  assert.deepEqual(adminImports(source("deps.ts")), []);
});

test("luật bắt được lệch (kiểm trong bộ nhớ, không đụng file): mọi dạng nhập ./admin* đều bị phát hiện, chú thích thì không", () => {
  const cases = {
    'import { defaultFetchPublic } from "./admin-ops";': ["./admin-ops"],
    "import { defaultFetchPublic } from './admin-ops';": ["./admin-ops"],
    'import type { AdminDeps } from "./admin-auth";': ["./admin-auth"],
    'import {\n  a,\n  b,\n} from "./admin-deps";': ["./admin-deps"],
    'export { realAdminDeps } from "./admin-deps";': ["./admin-deps"],
    'const m = await import("./admin-ops");': ["./admin-ops"],
    'const m = require("./admin-ops");': ["./admin-ops"],
    'import "./admin-ops";': ["./admin-ops"],
    '// import { x } from "./admin-ops";': [],
    '/* import { x } from "./admin-ops"; */': [],
    '/**\n * from "./admin-ops" nhắc trong chú thích\n */\nimport { a } from "./alerts";': [],
    'import { a } from "./alerts";\nimport { b } from "./email/provider";': [],
  };
  for (const [text, expected] of Object.entries(cases)) assert.deepEqual(adminImports(text), expected, text);
});

test("deps.ts cộng thêm một dòng nhập ./admin-ops thì luật đỏ (đột biến mô phỏng trong bộ nhớ)", () => {
  const mutated = `import { defaultFetchPublic } from "./admin-ops";\n${source("deps.ts")}`;
  assert.equal(adminImports(mutated).length, adminImports(source("deps.ts")).length + 1);
  assert.ok(adminImports(mutated).includes("./admin-ops"));
});

test("admin-deps.ts có đủ ba hàm dây nối của Worker admin và admin-entry.ts nhập chúng từ đó, không từ deps.ts", () => {
  const adminDeps = source("admin-deps.ts");
  const deps = withoutComments(source("deps.ts"));
  for (const name of ["realAdminDeps", "adminPayments", "creemReaderFromEnv"]) {
    assert.match(adminDeps, new RegExp(`export function ${name}\\b`), `admin-deps.ts thiếu ${name}`);
    assert.doesNotMatch(deps, new RegExp(`\\b${name}\\b`), `${name} còn trong deps.ts (dùng chung với Worker API)`);
  }
  const entry = withoutComments(source("admin-entry.ts"));
  assert.match(entry, /import \{ realAdminDeps \} from "\.\/admin-deps";/);
  assert.doesNotMatch(entry, /from "\.\/deps"/);
});
