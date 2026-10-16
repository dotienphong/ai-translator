// Kiểu của `env` và `exports` trong test (cloudflare:workers). Binding lấy từ wrangler.jsonc và vitest.config.ts.
type TestApiEnv = import("../src/env").ApiEnv;

// `import x from "./file?raw"` (Vite): nội dung file dạng chuỗi, đúng từng ký tự (payload thật ở test/fixtures/creem/).
declare module "*?raw" {
  const content: string;
  export default content;
}

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("../src/index");
  }
  interface Env extends TestApiEnv {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    MIGRATION_DB: D1Database;
  }
}
