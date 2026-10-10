import { beforeAll, describe, expect, it, vi } from "vitest";
import { type AccessJwk, createAccessKeyProvider, verifyAccessJwt } from "../src/access-jwt";
import { AUD, b64url, corruptSignature, type Issuer, makeIssuer, TEAM, text } from "./access-jwt-helper";

let issuer: Issuer;
let other: Issuer;
beforeAll(async () => {
  issuer = await makeIssuer("kid-1");
  other = await makeIssuer("kid-1"); // cùng kid, khóa khác: kẻ giả mạo
});

const now = () => Math.floor(Date.now() / 1000);
async function verify(token: string, over: { aud?: string; teamDomain?: string; nowSeconds?: number; keys?: Issuer } = {}) {
  return verifyAccessJwt(token, {
    teamDomain: over.teamDomain ?? TEAM,
    aud: over.aud ?? AUD,
    keys: (over.keys ?? issuer).provider(),
    nowSeconds: over.nowSeconds ?? now(),
  });
}
const reason = async (token: string, over?: Parameters<typeof verify>[1]) => {
  const r = await verify(token, over);
  return r.ok ? "ok" : r.reason;
};

describe("verifyAccessJwt: token hợp lệ", () => {
  it("trả email trong token", async () => {
    expect(await verify(await issuer.sign({ email: "ops@example.com" }))).toEqual({ ok: true, email: "ops@example.com" });
  });

  it("aud là chuỗi hay mảng chứa aud cần tìm đều được; mảng nhiều aud thì chỉ cần một khớp", async () => {
    expect(await reason(await issuer.sign({ aud: AUD }))).toBe("ok");
    expect(await reason(await issuer.sign({ aud: ["khac", AUD] }))).toBe("ok");
  });
});

describe("verifyAccessJwt: từ chối", () => {
  it("aud không khớp, thiếu, hay sai kiểu: jwt_aud", async () => {
    expect(await reason(await issuer.sign({ aud: ["app-khac"] }))).toBe("jwt_aud");
    expect(await reason(await issuer.sign({ aud: "app-khac" }))).toBe("jwt_aud");
    expect(await reason(await issuer.sign({ aud: [] }))).toBe("jwt_aud");
    expect(await reason(await issuer.sign({ aud: undefined }))).toBe("jwt_aud");
    expect(await reason(await issuer.sign({ aud: [42] }))).toBe("jwt_aud");
    expect(await reason(await issuer.sign({ aud: [AUD.toUpperCase()] }))).toBe("jwt_aud");
  });

  it("aud là chuỗi chỉ khớp khi bằng đúng, không khớp chuỗi con", async () => {
    expect(await reason(await issuer.sign({ aud: `x${AUD}x` }))).toBe("jwt_aud");
    expect(await reason(await issuer.sign({ aud: AUD.slice(0, -1) }))).toBe("jwt_aud");
  });

  it("aud cần tìm là chuỗi rỗng: không bao giờ khớp", async () => {
    expect(await reason(await issuer.sign({ aud: [""] }), { aud: "" })).toBe("jwt_aud");
  });

  it("iss phân biệt hoa thường", async () => {
    expect(await reason(await issuer.sign({ iss: `https://${TEAM.toUpperCase()}` }))).toBe("jwt_iss");
  });

  it("type: chỉ chấp nhận token của ứng dụng; token org, meta hay thiếu type đều bị từ chối", async () => {
    expect(await reason(await issuer.sign({ type: "org" }))).toBe("jwt_type");
    expect(await reason(await issuer.sign({ type: "meta" }))).toBe("jwt_type");
    expect(await reason(await issuer.sign({ type: 1 }))).toBe("jwt_type");
    expect(await reason(await issuer.sign({ type: "app" }))).toBe("ok");
    expect(await reason(await issuer.sign({ type: undefined }))).toBe("jwt_type");
  });

  it("iss không phải team này: jwt_iss", async () => {
    expect(await reason(await issuer.sign({ iss: "https://team-khac.cloudflareaccess.com" }))).toBe("jwt_iss");
    expect(await reason(await issuer.sign({ iss: TEAM }))).toBe("jwt_iss");
    expect(await reason(await issuer.sign({ iss: `https://${TEAM}/` }))).toBe("jwt_iss");
    expect(await reason(await issuer.sign({ iss: undefined }))).toBe("jwt_iss");
  });

  it("hết hạn (exp ≤ now): jwt_expired; exp thiếu hay sai kiểu: jwt_malformed", async () => {
    expect(await reason(await issuer.sign({ exp: now() - 1 }))).toBe("jwt_expired");
    expect(await reason(await issuer.sign({ exp: now() }))).toBe("jwt_expired");
    expect(await reason(await issuer.sign({ exp: now() + 5 }))).toBe("ok");
    expect(await reason(await issuer.sign({ exp: undefined }))).toBe("jwt_malformed");
    expect(await reason(await issuer.sign({ exp: "9999999999" }))).toBe("jwt_malformed");
  });

  it("exp không hữu hạn (1e400 trong JSON thô, null): jwt_malformed", async () => {
    const base = `"email":"ops@example.com","iss":"https://${TEAM}","aud":["${AUD}"],"type":"app"`;
    expect(await reason(await issuer.signRaw(`{${base},"exp":1e400}`))).toBe("jwt_malformed");
    expect(await reason(await issuer.signRaw(`{${base},"exp":null}`))).toBe("jwt_malformed");
    expect(await reason(await issuer.signRaw(`{${base},"exp":${now() + 100}}`))).toBe("ok");
  });

  it("nbf sai kiểu (chuỗi, null, không hữu hạn): jwt_malformed", async () => {
    expect(await reason(await issuer.sign({ nbf: "0" }))).toBe("jwt_malformed");
    expect(await reason(await issuer.sign({ nbf: null }))).toBe("jwt_malformed");
    const base = `"email":"ops@example.com","iss":"https://${TEAM}","aud":["${AUD}"],"type":"app","exp":${now() + 100}`;
    expect(await reason(await issuer.signRaw(`{${base},"nbf":-1e400}`))).toBe("jwt_malformed");
  });

  it("nbf ở tương lai quá 30 giây: jwt_not_yet; lệch ít hơn thì chấp nhận", async () => {
    expect(await reason(await issuer.sign({ nbf: now() + 120 }))).toBe("jwt_not_yet");
    expect(await reason(await issuer.sign({ nbf: now() + 10 }))).toBe("ok");
  });

  it("alg khác RS256 (none, HS256, rs256 viết thường): jwt_alg, kể cả khi chữ ký trống", async () => {
    for (const alg of ["none", "HS256", "RS512", "rs256", undefined]) {
      expect(await reason(await issuer.sign({}, { alg }))).toBe("jwt_alg");
    }
    const unsigned = `${b64url(text(JSON.stringify({ alg: "none", kid: "kid-1" })))}.${b64url(text(JSON.stringify({ email: "ops@example.com", iss: `https://${TEAM}`, aud: [AUD], exp: now() + 100 })))}.`;
    expect(await reason(unsigned)).toBe("jwt_malformed");
  });

  it("chữ ký sai: bị sửa, ký bằng khóa khác (cùng kid), hay payload bị sửa sau khi ký", async () => {
    const good = await issuer.sign();
    expect(await reason(corruptSignature(good))).toBe("jwt_signature");
    expect(await reason(await other.sign())).toBe("jwt_signature");
    const [h, , s] = good.split(".");
    const forgedPayload = b64url(text(JSON.stringify({ email: "ke-xau@example.com", iss: `https://${TEAM}`, aud: [AUD], exp: now() + 3600 })));
    expect(await reason(`${h}.${forgedPayload}.${s}`)).toBe("jwt_signature");
  });

  it("kid không có trong JWKS hay thiếu: jwt_kid_unknown", async () => {
    expect(await reason(await issuer.sign({}, { kid: "kid-la" }))).toBe("jwt_kid_unknown");
    expect(await reason(await issuer.sign({}, { kid: undefined }))).toBe("jwt_kid_unknown");
    expect(await reason(await issuer.sign({}, { kid: 7 }))).toBe("jwt_kid_unknown");
  });

  it("không có email hợp lệ: no_email (service token không có email)", async () => {
    expect(await reason(await issuer.sign({ email: undefined, common_name: "svc.access" }))).toBe("no_email");
    expect(await reason(await issuer.sign({ email: "" }))).toBe("no_email");
    expect(await reason(await issuer.sign({ email: 42 }))).toBe("no_email");
  });

  it("sai khuôn dạng: jwt_malformed", async () => {
    const good = await issuer.sign();
    const [h, p, s] = good.split(".");
    for (const bad of ["", "abc", "a.b", `${h}.${p}`, `${good}.thua`, `${h}.${p}.`, `${h}..${s}`, `!!!.${p}.${s}`, `${h}.${p}.${s}=`]) {
      expect(await reason(bad)).toBe("jwt_malformed");
    }
    expect(await reason(`${b64url(text("khong-phai-json"))}.${p}.${s}`)).toBe("jwt_malformed");
    expect(await reason(`${h}.${b64url(text("[]"))}.${s}`)).toBe("jwt_malformed");
    expect(await reason(`${h}.${b64url(text('"chuoi"'))}.${s}`)).toBe("jwt_malformed");
    expect(await reason(`${"a".repeat(9000)}.${p}.${s}`)).toBe("jwt_malformed");
  });

  it("token quá dài bị từ chối dù chữ ký và claim đều hợp lệ (chặn trước khi giải mã)", async () => {
    expect(await reason(await issuer.sign({ pad: "x".repeat(9000) }))).toBe("jwt_malformed");
    expect(await reason(await issuer.sign({ pad: "x".repeat(3000) }))).toBe("ok");
  });

  it("không lấy được khóa công khai: jwks_unavailable (đóng, không cho qua)", async () => {
    const keys = {
      get: async () => {
        throw new Error("mạng lỗi");
      },
    };
    const r = await verifyAccessJwt(await issuer.sign(), { teamDomain: TEAM, aud: AUD, keys, nowSeconds: now() });
    expect(r).toEqual({ ok: false, reason: "jwks_unavailable" });
  });

  it("khóa trong JWKS hỏng (không import được): jwt_signature, không ném lỗi", async () => {
    const broken: AccessJwk = { kty: "RSA", kid: "kid-1", n: "!!!", e: "AQAB" };
    const r = await verifyAccessJwt(await issuer.sign(), { teamDomain: TEAM, aud: AUD, keys: { get: async () => broken }, nowSeconds: now() });
    expect(r).toEqual({ ok: false, reason: "jwt_signature" });
  });
});

describe("createAccessKeyProvider", () => {
  const jwks = (...keys: unknown[]) => new Response(JSON.stringify({ keys }), { headers: { "content-type": "application/json" } });
  const rsa = (kid: string): AccessJwk => ({ kty: "RSA", kid, n: "AQAB", e: "AQAB" });

  function setup(responses: Array<() => Response | Promise<Response>>) {
    let t = 1_000_000;
    let call = 0;
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      const make = responses[Math.min(call++, responses.length - 1)] as () => Response | Promise<Response>;
      return make();
    }) as unknown as typeof fetch;
    const provider = createAccessKeyProvider(TEAM, fetchImpl, () => t);
    return { provider, fetchImpl, urls, advance: (ms: number) => (t += ms) };
  }

  it("lấy từ https://<team>/cdn-cgi/access/certs, nhớ lại: nhiều lần tra chỉ một lần tải", async () => {
    const { provider, fetchImpl, urls } = setup([() => jwks(rsa("a"), rsa("b"))]);
    expect((await provider.get("a"))?.kid).toBe("a");
    expect((await provider.get("b"))?.kid).toBe("b");
    expect((await provider.get("a"))?.kid).toBe("a");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(urls).toEqual([`https://${TEAM}/cdn-cgi/access/certs`]);
  });

  it("các lần tra đồng thời không chờ nhau: mỗi lần tự tải (không chia sẻ promise I/O giữa các request)", async () => {
    const { provider, fetchImpl } = setup([() => jwks(rsa("a"))]);
    const all = await Promise.all([provider.get("a"), provider.get("a"), provider.get("a")]);
    expect(all.map((k) => k?.kid)).toEqual(["a", "a", "a"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("một lần tải treo không chặn các lần tra khác; tải quá thời hạn bị hủy và coi là lỗi", async () => {
    const hang = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    let call = 0;
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => (call++ === 0 ? hang(url, init) : Promise.resolve(jwks(rsa("a"))))) as unknown as typeof fetch;
    const provider = createAccessKeyProvider(TEAM, fetchImpl, () => 1_000_000, 20);
    const first = provider.get("a"); // treo, sẽ bị hủy sau 20 ms
    const second = await provider.get("a"); // request khác, không được chờ lần tải của request đầu
    expect(second?.kid).toBe("a");
    await expect(first).rejects.toThrow();
  });

  it("kid lạ: tải lại để thử một lần, nhưng không quá một lần mỗi phút", async () => {
    const { provider, fetchImpl, advance } = setup([() => jwks(rsa("a")), () => jwks(rsa("a"), rsa("moi"))]);
    expect(await provider.get("a")).toBeDefined();
    expect(await provider.get("la")).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1); // vừa tải xong, chưa đủ một phút
    advance(61_000);
    expect(await provider.get("la")).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((await provider.get("moi"))?.kid).toBe("moi"); // khóa mới nhận được ngay sau lần tải lại
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("quá một giờ thì tải lại; tải lại lỗi thì không dùng khóa cũ, và sau đó vẫn không dùng", async () => {
    const { provider, fetchImpl, advance } = setup([() => jwks(rsa("a")), () => new Response("lỗi", { status: 503 })]);
    expect(await provider.get("a")).toBeDefined();
    advance(60 * 60 * 1000 + 1);
    await expect(provider.get("a")).rejects.toThrow("access_certs_503");
    await expect(provider.get("a")).rejects.toThrow("access_certs_503"); // vẫn không rơi về khóa cũ
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("tải lỗi: ném lỗi; thử lại trong 5 giây thì ném lại đúng lỗi đó mà không tải nữa; sau đó thử lại được", async () => {
    const { provider, fetchImpl, advance } = setup([() => new Response("lỗi", { status: 500 }), () => jwks(rsa("a"))]);
    await expect(provider.get("a")).rejects.toThrow("access_certs_500");
    advance(4_000);
    await expect(provider.get("a")).rejects.toThrow("access_certs_500");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    advance(2_000);
    expect((await provider.get("a"))?.kid).toBe("a");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("trả mã lỗi dù thân là JSON hợp lệ có khóa: vẫn là lỗi (không tin trả lời không ok)", async () => {
    const { provider } = setup([() => new Response(JSON.stringify({ keys: [rsa("a")] }), { status: 500 })]);
    await expect(provider.get("a")).rejects.toThrow("access_certs_500");
  });

  it("chỉ nhận khóa RSA có kid, n, e là chuỗi; trả lời không đúng khuôn dạng là lỗi", async () => {
    const { provider } = setup([
      () =>
        jwks(
          rsa("a"),
          { kty: "EC", kid: "ec", n: "x", e: "y" },
          { kty: "RSA", n: "x", e: "y" },
          { kty: "RSA", kid: "thieu-n", e: "AQAB" },
          { kty: "RSA", kid: "thieu-e", n: "AQAB" },
          { kty: "RSA", kid: "", n: "AQAB", e: "AQAB" },
          null,
          7,
        ),
    ]);
    expect((await provider.get("a"))?.kid).toBe("a");
    expect(await provider.get("ec")).toBeUndefined();
    expect(await provider.get("thieu-n")).toBeUndefined();
    expect(await provider.get("thieu-e")).toBeUndefined();
    expect(await provider.get("")).toBeUndefined();

    const bad = setup([() => new Response("không phải json"), () => jwks()]);
    await expect(bad.provider.get("a")).rejects.toThrow();
    bad.advance(61_000);
    await expect(bad.provider.get("a")).rejects.toThrow(); // JWKS rỗng cũng là lỗi: không có khóa nào để tin
  });
});
