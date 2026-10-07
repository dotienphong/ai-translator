import { beforeEach, describe, expect, it } from "vitest";
import { makeAdmin } from "./admin-harness";
import { resetDb } from "./db";

beforeEach(resetDb);

/** Binding ASSETS giả: ghi lại đường dẫn được hỏi, trả trang HTML (như not_found_handling SPA trả index.html). */
function fakeAssets() {
  const paths: string[] = [];
  const fetcher = {
    fetch: async (req: Request) => {
      paths.push(new URL(req.url).pathname);
      return new Response("<!doctype html><title>AI Translator Admin</title>", {
        headers: { "content-type": "text/html; charset=utf-8", etag: '"abc"' },
      });
    },
  } as unknown as Fetcher;
  return { paths, fetcher };
}

describe("trang Web Admin (spec Web Admin §2)", () => {
  it("không qua Access thì 403 cho trang và file tĩnh, không hỏi ASSETS", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    for (const path of ["/", "/assets/index-abc.js", "/licenses/x"]) {
      expect((await adminFetch(path, { operator: null })).status, path).toBe(403);
    }
    expect(a.paths).toEqual([]);
  });

  it("qua Access: trả trang từ ASSETS, giữ header của ASSETS, gắn header bảo mật", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    const res = await adminFetch("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("AI Translator Admin");
    expect(res.headers.get("etag")).toBe('"abc"');
    const csp = res.headers.get("content-security-policy") ?? "";
    for (const part of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ]) {
      expect(csp, part).toContain(part);
    }
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("route của SPA (/licenses/:id…) chuyển nguyên cho ASSETS", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    expect((await adminFetch("/licenses/0b9e7c1e-0000-4000-8000-000000000000")).status).toBe(200);
    expect((await adminFetch("/search")).status).toBe(200);
    expect(a.paths).toEqual(["/licenses/0b9e7c1e-0000-4000-8000-000000000000", "/search"]);
  });

  it("/admin/<không có> vẫn là 404 JSON, không rơi về trang", async () => {
    const a = fakeAssets();
    const { adminCall } = makeAdmin({ ASSETS: a.fetcher });
    expect(await adminCall("/admin/khong-co")).toEqual({ status: 404, body: { error: "not_found" } });
    expect(await adminCall("/admin")).toEqual({ status: 404, body: { error: "not_found" } });
    expect(a.paths).toEqual([]);
  });

  it("phản hồi JSON và 403 cũng có header bảo mật", async () => {
    const { adminFetch } = makeAdmin();
    const ok = await adminFetch("/admin/whoami");
    expect(ok.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const denied = await adminFetch("/admin/whoami", { operator: null });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("x-frame-options")).toBe("DENY");
  });

  it("mọi phản hồi /admin/* có Cache-Control: no-store (danh sách trả email khách); trang tĩnh thì không ép", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    expect((await adminFetch("/admin/whoami")).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/admin/whoami", { operator: null })).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/admin/khong-co")).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/")).headers.get("cache-control")).toBeNull();
  });

  it("không có binding ASSETS thì trang là 404 JSON", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/")).toEqual({ status: 404, body: { error: "not_found" } });
  });
});
