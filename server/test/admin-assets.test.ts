import { beforeEach, describe, expect, it } from "vitest";
import { AUD, makeIssuer, TEAM } from "./access-jwt-helper";
import { makeAdmin } from "./admin-harness";
import { resetDb } from "./db";

beforeEach(resetDb);

/** CSP đúng từng ký tự (so sánh toàn chuỗi: thêm hay bớt một nguồn là test hỏng). */
const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/**
 * Binding ASSETS giả: ghi lại đường dẫn được hỏi. Mặc định trả trang HTML (như not_found_handling SPA trả index.html);
 * /assets/app-abc123.js trả file băm tên; /trang-chuyen-huong trả Response.redirect, giống binding thật của workerd có header bất biến.
 */
function fakeAssets() {
  const paths: string[] = [];
  const fetcher = {
    fetch: async (req: Request) => {
      const path = new URL(req.url).pathname;
      paths.push(path);
      if (path === "/trang-chuyen-huong") return Response.redirect("https://admin.test/", 307);
      if (path === "/assets/app-abc123.js") {
        return new Response("console.log(1)", {
          headers: { "content-type": "text/javascript", "cache-control": "public, max-age=0, must-revalidate" },
        });
      }
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

  it("trang và file tĩnh qua JWT của Access (Worker có assets không nhận ctx.access, đường chạy thật trên production)", async () => {
    const issuer = await makeIssuer();
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher, ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM }, { accessKeys: issuer.provider() });
    const headers = { "cf-access-jwt-assertion": await issuer.sign() };
    for (const path of ["/", "/assets/app-abc123.js", "/licenses/x"]) {
      expect((await adminFetch(path, { operator: null, headers })).status, path).toBe(200);
    }
    expect(a.paths).toEqual(["/", "/assets/app-abc123.js", "/licenses/x"]);
    // thiếu hay sai JWT thì không hỏi ASSETS
    const bad = { "cf-access-jwt-assertion": (await issuer.sign({ aud: ["khac"] })) };
    expect((await adminFetch("/", { operator: null, headers: bad })).status).toBe(403);
    expect((await adminFetch("/", { operator: null })).status).toBe(403);
    expect(a.paths).toHaveLength(3);
  });

  it("qua Access: trả trang từ ASSETS, giữ header của ASSETS, gắn header bảo mật", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    const res = await adminFetch("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("AI Translator Admin");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("content-security-policy")).toBe(EXPECTED_CSP);
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

  it("mọi phản hồi /admin/* và trang HTML có Cache-Control: no-store (email khách không nằm lại trong bfcache); file băm tên giữ header của ASSETS", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    expect((await adminFetch("/admin/whoami")).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/admin/whoami", { operator: null })).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/admin/khong-co")).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/")).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/licenses/x")).headers.get("cache-control")).toBe("no-store");
    const js = await adminFetch("/assets/app-abc123.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toBe("text/javascript");
    expect(js.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  it("phản hồi của ASSETS có header bất biến (Response.redirect) vẫn qua được và có header bảo mật", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    const res = await adminFetch("/trang-chuyen-huong");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://admin.test/");
    expect(res.headers.get("content-security-policy")).toBe(EXPECTED_CSP);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(a.paths).toEqual(["/trang-chuyen-huong"]);
  });

  it("method khác GET/HEAD vào đường trang (đã qua Access) là 404 JSON, không hỏi ASSETS", async () => {
    const a = fakeAssets();
    const { adminCall } = makeAdmin({ ASSETS: a.fetcher });
    for (const [method, path] of [
      ["POST", "/"],
      ["PUT", "/x"],
      ["DELETE", "/x"],
    ] as const) {
      expect(await adminCall(path, { method, body: {} }), `${method} ${path}`).toEqual({ status: 404, body: { error: "not_found" } });
    }
    expect(a.paths).toEqual([]);
  });

  it("đường dẫn được giải mã trước khi so với /admin: /%61dmin/khong-co là 404 JSON, không rơi về trang", async () => {
    const a = fakeAssets();
    const { adminCall } = makeAdmin({ ASSETS: a.fetcher });
    expect(await adminCall("/%61dmin/khong-co")).toEqual({ status: 404, body: { error: "not_found" } });
    expect(a.paths).toEqual([]);
  });

  it("không có binding ASSETS thì trang là 404 JSON", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/")).toEqual({ status: 404, body: { error: "not_found" } });
  });
});
