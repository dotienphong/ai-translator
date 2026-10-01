import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Secret giả cho test. Gán cả vào process.env của tiến trình vitest để plugin không cảnh báo thiếu secret;
// binding bên dưới ghi đè mọi secret thật có thể có trong .dev.vars hay biến môi trường của máy.
const FAKE_SECRETS = {
  PAYOS_CLIENT_ID: "test-client-id",
  PAYOS_API_KEY: "test-api-key",
  PAYOS_CHECKSUM_KEY: "test-checksum-key",
  RESEND_API_KEY: "re_test",
  TOKEN_SIGNING_KEY_A: "{}",
  TOKEN_SIGNING_KEY_B: "{}",
  RATE_LIMIT_PEPPER: "test-pepper",
};
Object.assign(process.env, FAKE_SECRETS);

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS } },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
