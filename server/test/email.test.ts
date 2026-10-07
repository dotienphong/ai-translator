import { describe, expect, it } from "vitest";
import { EmailProviderError, maskEmail } from "../src/email/provider";
import { ResendEmailProvider } from "../src/email/resend";
import { licenseEmail } from "../src/email/templates";

describe("Resend", () => {
  it("gửi đúng endpoint, header, idempotency key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const p = new ResendEmailProvider({ apiKey: "re_test", from: "AI Translator <noreply@mt.test>" }, async (url, init = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }));
    });
    await p.send({ to: "buyer@mt.test", subject: "S", text: "T", idempotencyKey: "order-dev-7" });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toEqual({
      authorization: "Bearer re_test",
      "content-type": "application/json",
      "user-agent": "license-server/1.0",
      "idempotency-key": "order-dev-7",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "AI Translator <noreply@mt.test>",
      to: ["buyer@mt.test"],
      subject: "S",
      text: "T",
    });
  });

  it("có replyTo thì gửi thêm reply_to, không có thì không gửi trường đó", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = async (_url: string, init: RequestInit = {}) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response("{}");
    };
    const message = { to: "b@mt.test", subject: "S", text: "T" };
    await new ResendEmailProvider({ apiKey: "re_test", from: "a@mt.test", replyTo: "support@mt.test" }, fetchFn).send(message);
    await new ResendEmailProvider({ apiKey: "re_test", from: "a@mt.test" }, fetchFn).send(message);
    expect(bodies[0]).toEqual({ from: "a@mt.test", to: ["b@mt.test"], subject: "S", text: "T", reply_to: "support@mt.test" });
    expect(bodies[1]).not.toHaveProperty("reply_to");
  });

  it("HTTP lỗi thì ném lỗi, không kèm body", async () => {
    const p = new ResendEmailProvider(
      { apiKey: "re_test", from: "a@mt.test" },
      async () => new Response('{"message":"buyer@mt.test bị chặn"}', { status: 403 }),
    );
    const err = await p.send({ to: "buyer@mt.test", subject: "S", text: "T" }).catch((e: unknown) => e);
    expect(String(err)).toBe("EmailProviderError: Resend trả HTTP 403");
    expect((err as EmailProviderError).status).toBe(403);
  });

  it("409 của Resend: đọc mã lỗi trong body; invalid_idempotent_request là thư đã gửi, concurrent_idempotent_requests là lỗi tạm", async () => {
    const reply = (name: string) =>
      new ResendEmailProvider({ apiKey: "re_test", from: "a@mt.test" }, async () =>
        new Response(JSON.stringify({ statusCode: 409, message: "buyer@mt.test …", name }), { status: 409 }),
      );
    const sent = (await reply("invalid_idempotent_request").send({ to: "buyer@mt.test", subject: "S", text: "T" }).catch((e: unknown) => e)) as EmailProviderError;
    expect(String(sent)).toBe("EmailProviderError: Resend trả HTTP 409 (invalid_idempotent_request)");
    expect([sent.code, sent.alreadySent, sent.permanent]).toEqual(["invalid_idempotent_request", true, false]);
    const busy = (await reply("concurrent_idempotent_requests").send({ to: "buyer@mt.test", subject: "S", text: "T" }).catch((e: unknown) => e)) as EmailProviderError;
    expect([busy.code, busy.alreadySent, busy.permanent]).toEqual(["concurrent_idempotent_requests", false, false]);
    // Mã lạ (có thể lặp lại dữ liệu) không được đưa vào lỗi.
    const odd = (await reply("buyer@mt.test").send({ to: "buyer@mt.test", subject: "S", text: "T" }).catch((e: unknown) => e)) as EmailProviderError;
    expect([String(odd), odd.code, odd.alreadySent]).toEqual(["EmailProviderError: Resend trả HTTP 409", undefined, false]);
    // Cùng mã nhưng không phải 409 thì không coi là đã gửi.
    expect(new EmailProviderError("x", 422, "invalid_idempotent_request").alreadySent).toBe(false);
  });

  it("chỉ 400 và 422 là lỗi vĩnh viễn; 401, 403, 409, 429, 5xx và lỗi mạng là lỗi tạm", () => {
    for (const status of [400, 422]) expect(new EmailProviderError("x", status).permanent).toBe(true);
    for (const status of [401, 403, 409, 429, 500, 503]) expect(new EmailProviderError("x", status).permanent).toBe(false);
    expect(new EmailProviderError("x").permanent).toBe(false);
  });
});

describe("nội dung email", () => {
  it("có tên sản phẩm, key đã định dạng, gói, ngày hết hạn theo giờ Việt Nam, cả vi lẫn en", () => {
    // 2026-10-31T17:30:00Z là 01/11/2026 ở Việt Nam.
    const { subject, text } = licenseEmail("purchase", [
      { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Yearly", expiresAt: Date.UTC(2026, 9, 31, 17, 30) / 1000 },
    ]);
    expect(subject).toBe("License key AI Translator / Your AI Translator license key");
    expect(text).toContain("Cảm ơn bạn đã dùng AI Translator.");
    expect(text).toContain("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR  (Yearly, hết hạn / expires 01/11/2026)");
    expect(text).toContain("Cài đặt > Bản quyền");
    expect(text).toContain("Settings > License");
  });

  it("mỗi key chỉ dùng trên 1 máy (spec 2026-10-07 §1): không còn nhắc 2 máy", () => {
    const { text } = licenseEmail("purchase", [{ licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Monthly", expiresAt: 0 }]);
    expect(text).toContain("Mỗi key dùng trên 1 máy.");
    expect(text).toContain("Each key works on 1 computer.");
    expect(text).not.toMatch(/2 máy|2 computers/);
  });

  it("thư đổi gói có tiêu đề riêng; không còn tên tạm", () => {
    const entry = { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Monthly", expiresAt: 0 };
    expect(licenseEmail("plan_change", [entry]).subject).toBe("Đã đổi gói AI Translator / AI Translator plan changed");
    for (const kind of ["purchase", "renewal", "plan_change", "recover", "resend"] as const) {
      const { subject, text } = licenseEmail(kind, [entry]);
      expect(`${subject}\n${text}`).not.toMatch(/Meeting Translator/);
    }
  });

  it("che email trong log", () => {
    expect(maskEmail("buyer@example.com")).toBe("b***@example.com");
    expect(maskEmail("x")).toBe("***");
  });
});
