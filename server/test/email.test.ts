import { describe, expect, it } from "vitest";
import { EmailProviderError, maskEmail } from "../src/email/provider";
import { ResendEmailProvider } from "../src/email/resend";
import { type LicenseEmailKind, MAIL, pick } from "../src/email/strings";
import { licenseEmail, mailLang, supportReplyEmail } from "../src/email/templates";
import { type Lang, LANGS } from "../src/lang";

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

  it("có html thì gửi html cùng text (thư HTML kèm bản chữ thuần, spec 2026-10-23 D4); không có thì không gửi trường đó", async () => {
    const bodies: Record<string, unknown>[] = [];
    const p = new ResendEmailProvider({ apiKey: "re_test", from: "a@mt.test" }, async (_url: string, init: RequestInit = {}) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response("{}");
    });
    await p.send({ to: "b@mt.test", subject: "S", text: "T", html: "<p>H</p>" });
    await p.send({ to: "b@mt.test", subject: "S", text: "T" });
    expect(bodies[0]).toEqual({ from: "a@mt.test", to: ["b@mt.test"], subject: "S", text: "T", html: "<p>H</p>" });
    expect(bodies[1]).not.toHaveProperty("html");
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

describe("nội dung email (spec 2026-10-23)", () => {
  // 2026-10-31T17:30:00Z là 01/11/2026 ở Việt Nam.
  const yearly = { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Yearly", expiresAt: Date.UTC(2026, 9, 31, 17, 30) / 1000 };
  const monthly = { licenseKey: "ABCDEFGHJKMNPQRSTVWXYZ012345", planName: "Monthly", expiresAt: Date.UTC(2026, 10, 22, 3) / 1000 };
  const KINDS: LicenseEmailKind[] = ["purchase", "renewal", "plan_change", "recover", "resend"];

  it("mailLang: có ngôn ngữ thì dùng; không có thì đơn USD ra tiếng Anh, còn lại tiếng Việt", () => {
    expect(mailLang("ja", "VND")).toBe("ja");
    expect(mailLang("vi", "USD")).toBe("vi");
    expect(mailLang(null, "USD")).toBe("en");
    expect(mailLang(null, "VND")).toBe("vi");
    expect(mailLang(null, null)).toBe("vi");
  });

  it("thư tiếng Việt: tiêu đề và bản chữ thuần đầy đủ, Việt trên, Anh dưới", () => {
    const { subject, text } = licenseEmail("vi", "purchase", [yearly]);
    expect(subject).toBe("License key AI Translator của bạn / Your AI Translator license key");
    expect(text).toBe(
      [
        "AI Translator",
        "",
        "Cảm ơn bạn đã mua AI Translator",
        "Đây là license key của bạn.",
        "",
        "    0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR",
        "    Gói Yearly · Hết hạn 01/11/2026",
        "",
        "Kích hoạt trên máy của bạn",
        "  1. Mở AI Translator.",
        "  2. Vào Cài đặt › Bản quyền.",
        "  3. Dán key rồi bấm Kích hoạt.",
        "",
        "Mỗi key dùng trên 1 máy. Hãy giữ thư này để kích hoạt lại khi cài lại máy hay chuyển sang máy khác.",
        "Hướng dẫn chi tiết: https://aitranslator.vn/huong-dan/mua-va-kich-hoat-key/",
        "Cần giúp? Trả lời thư này, chúng tôi sẽ hồi âm.",
        "",
        "─".repeat(28),
        "English",
        "",
        "Thank you for buying AI Translator",
        "Your license key is shown above.",
        "  Yearly · Expires 1 Nov 2026",
        "",
        "Activate on your computer",
        "  1. Open AI Translator.",
        "  2. Go to Settings › License.",
        "  3. Paste the key and click Activate.",
        "",
        "Each key works on 1 computer. Keep this email to activate again after reinstalling or moving to another computer.",
        "Step-by-step guide: https://aitranslator.vn/en/guide/buy-and-activate/",
        "Need help? Reply to this email.",
        "",
        "--",
        "AI Translator · aitranslator.vn",
        "",
      ].join("\n"),
    );
  });

  it("tiêu đề: <ngôn ngữ của khách> / <tiếng Anh>; app tiếng Anh thì chỉ tiếng Anh", () => {
    expect(licenseEmail("ja", "purchase", [yearly]).subject).toBe("AI Translator のライセンスキー / Your AI Translator license key");
    expect(licenseEmail("zh", "renewal", [yearly]).subject).toBe("你的 AI Translator 套餐已续期 / Your AI Translator plan is renewed");
    expect(licenseEmail("ko", "plan_change", [yearly]).subject).toBe("AI Translator 플랜이 변경되었습니다 / Your AI Translator plan has changed");
    expect(licenseEmail("vi", "renewal", [yearly]).subject).toBe("Đã gia hạn gói AI Translator / Your AI Translator plan is renewed");
    expect(licenseEmail("en", "purchase", [yearly]).subject).toBe("Your AI Translator license key");
    expect(supportReplyEmail("ko", ["x"]).subject).toBe("AI Translator 지원팀의 답변 / Reply from AI Translator support");
    expect(supportReplyEmail("vi", ["x"]).subject).toBe("Trả lời từ hỗ trợ AI Translator / Reply from AI Translator support");
    expect(supportReplyEmail("en", ["x"]).subject).toBe("Reply from AI Translator support");
  });

  it("HTML: lang của trang, key, ngày theo ngôn ngữ, link hướng dẫn đúng ngôn ngữ, phần tiếng Anh ở dưới; app tiếng Anh thì không có phần dưới", () => {
    const { html } = licenseEmail("ja", "purchase", [yearly]);
    expect(html).toMatch(/^<!doctype html>\n<html lang="ja">/);
    expect(html).toContain("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR");
    expect(html).toContain("2026年11月1日");
    expect(html).toContain('href="https://aitranslator.vn/ja/guide/buy-and-activate/"');
    expect(html).toContain('href="https://aitranslator.vn/en/guide/buy-and-activate/"');
    expect(html).toContain('<td class="pad" lang="en"');
    expect(html).toContain("1 Nov 2026");
    expect(html.indexOf("ライセンスキーをお送りします。")).toBeLessThan(html.indexOf("Your license key is shown above."));
    const en = licenseEmail("en", "purchase", [yearly]).html;
    expect(en).toMatch(/<html lang="en">/);
    expect(en).not.toContain('<td class="pad" lang="en"');
    expect(en).toContain("Here is your license key.");
    expect(en).not.toContain("shown above");
    // Bảng "ma" chỉ Outlook cho Windows thấy (mở trước thẻ thư, đóng sau chân thư): Outlook bỏ qua max-width.
    expect(html.match(/<!--\[if mso\]>/g)).toHaveLength(2);
  });

  it("font và lang theo ngôn ngữ (như app và website): chữ Hán tiếng Trung không vẽ theo dáng Nhật; tiếng Việt, Anh không có font CJK; tiếng Hàn ngắt theo từ", () => {
    // Chuỗi font của thẻ thư và của bảng chân thư (bỏ font đơn cách của ô key): hai chỗ phải như nhau.
    const fontOf = (html: string) => {
      const list = [...html.matchAll(/font-family:([^;"]+)/g)].map((m) => m[1] ?? "").filter((f) => !f.includes("monospace"));
      expect(list).toHaveLength(2);
      expect(list[1]).toBe(list[0]);
      return list[0] ?? "";
    };
    const font = (lang: Lang) => fontOf(licenseEmail(lang, "purchase", [yearly]).html);
    const CJK = /Hiragino|Yu Gothic|Meiryo|PingFang|YaHei|SD Gothic|Malgun/;
    const zh = licenseEmail("zh", "purchase", [yearly]).html;
    expect(zh).toMatch(/^<!doctype html>\n<html lang="zh-Hans">/);
    expect(zh).toContain('<td class="pad" lang="en"');
    expect(supportReplyEmail("zh", ["x"]).html).toMatch(/^<!doctype html>\n<html lang="zh-Hans">/);
    expect(font("zh")).toContain("'PingFang SC'");
    expect(font("zh")).not.toMatch(/Hiragino Sans'|Yu Gothic/);
    expect(font("ja")).toContain("'Hiragino Sans'");
    expect(font("ja")).not.toContain("PingFang");
    expect(font("ko")).toContain("'Malgun Gothic'");
    for (const lang of ["vi", "en"] as const) {
      expect(font(lang)).not.toMatch(CJK);
      expect(font(lang)).toMatch(/,sans-serif$/);
    }
    expect(fontOf(supportReplyEmail("vi", ["x"]).html)).not.toMatch(CJK);
    expect(licenseEmail("ko", "purchase", [yearly]).html).toContain("word-break:keep-all;overflow-wrap:break-word;");
    for (const lang of ["vi", "en", "ja", "zh"] as const) expect(licenseEmail(lang, "purchase", [yearly]).html).not.toContain("word-break:keep-all");
  });

  it("dòng xem trước ẩn (preheader): gói và ngày hết hạn, không có key; đệm sau đó để chữ thân thư (có key) không lọt vào dòng xem trước", () => {
    const { html } = licenseEmail("ja", "purchase", [yearly]);
    const hidden = /<div style="display:none;[^"]*">(.*?)((?:&zwnj;&nbsp;)+)<\/div>/.exec(html);
    expect(hidden?.[1]).toBe("プラン Yearly · 有効期限 2026年11月1日");
    expect(hidden?.[2]?.match(/&zwnj;&nbsp;/g)?.length).toBeGreaterThanOrEqual(100);
    expect(hidden?.[0]).not.toContain("0123-4567-89AB");
    const support = /<div style="display:none;[^"]*">(.*?)((?:&zwnj;&nbsp;)+)<\/div>/.exec(supportReplyEmail("vi", ["x"]).html);
    expect(support?.[1]).toBe("Bộ phận hỗ trợ AI Translator đã trả lời tin nhắn của bạn.");
    expect(support?.[2]?.match(/&zwnj;&nbsp;/g)?.length).toBeGreaterThanOrEqual(100);
  });

  it("ngày hết hạn (giờ Việt Nam) viết theo thói quen của từng ngôn ngữ", () => {
    const text = (lang: Lang) => licenseEmail(lang, "resend", [yearly]).text;
    expect(text("vi")).toContain("Hết hạn 01/11/2026");
    expect(text("en")).toContain("Expires 1 Nov 2026");
    expect(text("ja")).toContain("有効期限 2026年11月1日");
    expect(text("zh")).toContain("到期时间 2026年11月1日");
    expect(text("ko")).toContain("만료일 2026년 11월 1일");
  });

  it("các bước kích hoạt chỉ ở thư mua, lấy lại, gửi lại; thư gia hạn và đổi gói nói key giữ nguyên", () => {
    for (const kind of ["purchase", "recover", "resend"] as const) {
      const { text, html } = licenseEmail("vi", kind, [yearly]);
      expect(text).toContain("  2. Vào Cài đặt › Bản quyền.");
      expect(text).toContain("  2. Go to Settings › License.");
      expect(html).toContain("Kích hoạt trên máy của bạn");
    }
    for (const kind of ["renewal", "plan_change"] as const) {
      const { text, html } = licenseEmail("vi", kind, [yearly]);
      expect(text).not.toContain("Cài đặt › Bản quyền");
      expect(html).not.toContain("Kích hoạt trên máy của bạn");
      expect(text).toContain("Key giữ nguyên, không cần kích hoạt lại.");
      expect(text).toContain("stays the same; no need to activate it again.");
    }
  });

  it("nhiều key: mỗi key một ô; tiếng Anh dùng số nhiều", () => {
    const two = licenseEmail("en", "recover", [yearly, monthly]);
    expect(two.subject).toBe("Your AI Translator license keys");
    expect(two.text).toContain("Here are the active license keys for this email.");
    expect(two.html.match(/class="keybox"/g)).toHaveLength(2);
    expect(licenseEmail("en", "recover", [yearly]).subject).toBe("Your AI Translator license key");
    const vi = licenseEmail("vi", "recover", [yearly, monthly]).text;
    expect(vi).toContain("The active license keys for this email are shown above.");
    expect(vi).toContain("  Yearly · Expires 1 Nov 2026\n  Monthly · Expires 22 Nov 2026");
  });

  it("thư trả lời hỗ trợ: escape HTML, xuống dòng bằng <br> (Outlook cho Windows không bảo đảm pre-wrap); bản chữ thuần giữ nguyên văn; tiếng Anh ở dưới", () => {
    const reply = `Thử <script>alert("x")</script> & 'y'\nDòng hai`;
    const { html, text } = supportReplyEmail("vi", [reply, "Câu hai"]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Thử &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;<br>Dòng hai");
    // Tin từ Zalo giữ nguyên văn, có thể xuống dòng kiểu Windows: một lần xuống dòng là đúng một <br> (CR còn sót dưới pre-wrap là thêm một dòng).
    const crlf = supportReplyEmail("vi", ["A\r\nB\rC"]).html;
    expect(crlf).toContain(">A<br>B<br>C</td>");
    expect(crlf).not.toContain("\r");
    expect(html).toContain("white-space:pre-wrap");
    expect(text).toContain(`  Thử <script>alert("x")</script> & 'y'\n  Dòng hai\n\n  Câu hai`);
    expect(text).toContain("AI Translator support has replied to your message (above).");
    expect(html.indexOf("Bộ phận hỗ trợ AI Translator đã trả lời tin nhắn của bạn.")).toBeLessThan(html.indexOf("(above)"));
  });

  it("thư trả lời hỗ trợ: bản chữ thuần tách dòng cả \\r\\n và \\r như bản HTML, không để sót CR", () => {
    const { text } = supportReplyEmail("vi", ["A\r\nB\rC"]);
    expect(text).toContain("  A\n  B\n  C");
    expect(text).not.toContain("\r");
  });

  it("mỗi key một máy (spec 2026-10-07 §1); không còn tên tạm; không lộ công nghệ lõi hay dịch vụ gửi thư; không ảnh, không script", () => {
    for (const lang of LANGS) {
      const mails = [...KINDS.map((kind) => licenseEmail(lang, kind, [yearly])), supportReplyEmail(lang, ["x"])];
      for (const { subject, html, text } of mails) {
        const all = `${subject}\n${html}\n${text}`;
        expect(all).not.toMatch(/2 máy|2 computers|Meeting Translator/);
        expect(all).not.toMatch(/Resend|Cloudflare|Whisper|Hy-MT|llama|ggml|Tauri|Hono|<img|<script/i);
      }
    }
  });

  it("bản chữ thuần không có quá hai dòng trống liền nhau (spec 2026-10-23 §2), ở mọi ngôn ngữ và loại thư, một hay hai key", () => {
    for (const lang of LANGS) {
      const mails = [
        ...KINDS.flatMap((kind) => [licenseEmail(lang, kind, [yearly]), licenseEmail(lang, kind, [yearly, monthly])]),
        supportReplyEmail(lang, ["x"]),
        supportReplyEmail(lang, ["Câu một\nDòng hai", "Câu hai"]),
      ];
      for (const { text } of mails) expect(text, lang).not.toMatch(/\n{4}/);
    }
  });

  it("đủ chữ ở cả năm ngôn ngữ: không chuỗi rỗng, đúng ba bước", () => {
    for (const lang of LANGS) {
      const s = MAIL[lang];
      for (const kind of [...KINDS, "support"] as const) {
        for (const field of [s.subject, s.heading, s.lead]) expect(pick(field[kind], 1).length, `${lang} ${kind}`).toBeGreaterThan(0);
      }
      expect(s.steps).toHaveLength(3);
    }
  });

  it("che email trong log", () => {
    expect(maskEmail("buyer@example.com")).toBe("b***@example.com");
    expect(maskEmail("x")).toBe("***");
  });
});
