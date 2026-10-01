// Điểm vào của Worker API: HTTP (Hono), Cron Trigger mỗi 5 phút (đối soát, gửi lại email, cảnh báo),
// và entrypoint AdminRpc cho Worker admin (src/admin-rpc.ts).
import { createApp } from "./app";
import { realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { reconcile } from "./reconcile";

export { AdminRpc } from "./admin-rpc";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    // Dựng deps trong chuỗi promise, để mọi lỗi (kể cả lúc dựng deps) đều được ghi log thay vì thành promise bị từ chối.
    ctx.waitUntil(
      Promise.resolve()
        .then(() => reconcile(env, realDeps(env)))
        .then((r) => console.log(JSON.stringify({ event: "reconcile", ...r })))
        .catch((err: unknown) => console.error(JSON.stringify({ event: "reconcile_crashed", error: String(err) }))),
    );
  },
} satisfies ExportedHandler<ApiEnv>;
