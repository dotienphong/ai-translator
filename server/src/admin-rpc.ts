// Entrypoint RPC của Worker API cho Worker admin (QĐ34). Chỉ gọi được qua service binding: Cloudflare không
// mở named entrypoint ra Internet. Khóa ký và bảng gói ở lại Worker API; Worker admin không giữ bản sao nào.
import { WorkerEntrypoint } from "cloudflare:workers";
import { nowSeconds, signKeyCheck } from "./deps";
import type { ApiEnv, ApiRpc } from "./env";
import type { KeyCheck } from "./token";

export class AdminRpc extends WorkerEntrypoint<ApiEnv> implements ApiRpc {
  /** Biến PLANS của môi trường này; Worker admin tự kiểm bằng parsePlans. */
  async plans(): Promise<unknown> {
    return this.env.PLANS ?? null;
  }

  /** Ký thử bằng khóa dự phòng (QĐ31). */
  async signKeyCheck(): Promise<KeyCheck> {
    return signKeyCheck(this.env, nowSeconds());
  }
}
