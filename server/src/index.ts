// Điểm vào của Worker API. Task 15 thêm Cron Trigger đối soát.
import { createApp } from "./app";
import type { ApiEnv } from "./env";

const app = createApp();

export default { fetch: app.fetch } satisfies ExportedHandler<ApiEnv>;
