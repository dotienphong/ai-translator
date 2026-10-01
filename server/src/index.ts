// Điểm vào của Worker API. Task 11 thay bằng app đầy đủ (src/app.ts).
import { Hono } from "hono";
import type { ApiEnv } from "./env";

const app = new Hono<{ Bindings: ApiEnv }>();
app.get("/v1/health", (c) => c.json({ ok: true }));

export default { fetch: app.fetch } satisfies ExportedHandler<ApiEnv>;
