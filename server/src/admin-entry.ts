// Điểm vào của Worker admin (wrangler.admin.jsonc). Dùng chung D1 với Worker API; bảng gói và ký thử khóa dự phòng
// lấy từ Worker API qua service binding API (QĐ34). Dây nối phụ thuộc thật (PayOS, cổng Creem chỉ đọc, email) nằm ở
// realAdminDeps (admin-deps.ts, tách khỏi deps.ts dùng chung với Worker API) để test được; file này không có logic.
// Test chạy qua file này: admin.test.ts ("điểm vào thật").
import { createAdminApp } from "./admin";
import { realAdminDeps } from "./admin-deps";
import type { AdminEnv } from "./env";

const app = createAdminApp(realAdminDeps);

export default { fetch: app.fetch } satisfies ExportedHandler<AdminEnv>;
