// Kiểu của `env` và `exports` trong test (cloudflare:workers). Binding lấy từ wrangler.jsonc và vitest.config.ts.
type TestApiEnv = import("../src/env").ApiEnv;

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("../src/index");
  }
  interface Env extends TestApiEnv {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    MIGRATION_DB: D1Database;
  }
}
