import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { expiryReminderEmail, priceText } from "../src/email/reminder";
import { REMINDER } from "../src/email/reminder-strings";
import { MAIL, SITE_URL } from "../src/email/strings";
import type { Lang } from "../src/lang";
import { LIMITS } from "../src/ratelimit";
import { reconcile } from "../src/reconcile";
import {
  BATCH,
  emailHash,
  enqueueExpiryReminders,
  inSendWindow,
  MAX_ATTEMPTS,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/reminders";
import { resetDb } from "./db";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

type World = ReturnType<typeof makeWorld>;
/** T0 là 07:00 giờ Việt Nam (ngoài khung gửi); NOW là 10:00 cùng ngày (trong khung). */
const NOW = T0 + 3 * 3600;
const cron = (w: World) => reconcile(w.env, w.deps);
const reminderWorld = () => makeWorld({ EXPIRY_REMINDERS: "on" });

const rows = () =>
  env.DB.prepare("SELECT license_id, cycle, status, skip_reason, attempts, retry_at, sent_at FROM expiry_reminders ORDER BY license_id, cycle")
    .all<{ license_id: string; cycle: number; status: string; skip_reason: string | null; attempts: number; retry_at: number | null; sent_at: number | null }>()
    .then((r) => r.results);

/** Mua thật một license (checkout, thanh toán, webhook) rồi đặt hạn còn `days` ngày kể từ NOW; xóa thư key đã gửi. */
async function newLicense(
  w: World,
  o: { plan?: "six_months" | "yearly" | "monthly"; email?: string; lang?: string; days?: number; usd?: boolean } = {},
) {
  const email = o.email ?? "khach@example.com";
  const req = { plan: o.plan ?? "yearly", email, ...(o.lang ? { lang: o.lang } : {}) };
  if (o.usd) await w.buyCreem(req);
  else await w.buy(req);
  const row = await env.DB.prepare("SELECT id FROM licenses WHERE email = ?").bind(email).first<{ id: string }>();
  const expires = Math.round(NOW + (o.days ?? 2) * DAY);
  await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?").bind(expires, row?.id).run();
  w.resend.sent.length = 0;
  w.resend.attempts = 0;
  w.resend.attemptKeys.length = 0;
  w.clock.now = NOW;
  return { id: row?.id ?? "", expires };
}

/** License chèn thẳng (không có đơn), cho test số lượng. */
async function rawLicense(i: number, expiresAt: number, opts: { plan?: string; email?: string | null; revokedAt?: number | null } = {}) {
  await env.DB.prepare(
    `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at, revoked_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, ?6)`,
  )
    .bind(`R${i}`, `RAWKEY${String(i).padStart(22, "0")}`, opts.email === undefined ? `raw${i}@example.com` : opts.email, opts.plan ?? "yearly", expiresAt, opts.revokedAt ?? null)
    .run();
}

describe("thư nhắc gia hạn trước 3 ngày", () => {
  it("tắt (mặc định, không có EXPIRY_REMINDERS): không xếp lịch, không gửi, kết quả cron không đổi", async () => {
    const w = makeWorld();
    await newLicense(w);
    const result = await cron(w);
    expect(result).toEqual({ checked: 0, granted: 0, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(await rows()).toEqual([]);
    expect(w.resend.sent).toHaveLength(0);
    // Giá trị khác "on" cũng là tắt.
    const w2 = makeWorld({ EXPIRY_REMINDERS: "yes" });
    await cron(w2);
    expect(await rows()).toEqual([]);
  });

  it("bật: license yearly còn 2 ngày thì gửi đúng một thư, chạy cron lại không gửi thêm", async () => {
    const w = reminderWorld();
    const { id, expires } = await newLicense(w, { plan: "yearly", email: "a@example.com" });
    const result = await cron(w);
    expect(result).toEqual({ checked: 0, granted: 0, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(w.resend.sent).toHaveLength(1);
    const mail = w.resend.sent[0];
    expect(mail?.to).toEqual(["a@example.com"]);
    expect(mail?.subject).toContain("Yearly");
    expect(mail?.idempotencyKey).toBe(`expiry-reminder-${id}-${expires}`);
    expect(mail?.html).toContain("https://api.aitranslator.vn/email/unsubscribe?t=");
    expect(mail?.html).toContain("500.000₫");
    expect(await rows()).toEqual([{ license_id: id, cycle: expires, status: "sent", skip_reason: null, attempts: 1, retry_at: null, sent_at: NOW }]);
    await cron(w);
    await cron(w);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("gói 6 tháng cũng được nhắc, kèm giá và số ngày của gói đó", async () => {
    const w = reminderWorld();
    await newLicense(w, { plan: "six_months" });
    await cron(w);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]?.html).toContain("6 Months");
    expect(w.resend.sent[0]?.html).toContain("269.000₫");
    expect(w.resend.sent[0]?.text).toContain("180");
  });

  it("không nhắc: gói monthly, còn hơn 3 ngày, đã hết hạn, không có email, đã thu hồi", async () => {
    const w = reminderWorld();
    await rawLicense(1, NOW + 2 * DAY, { plan: "monthly" });
    await rawLicense(2, NOW + 3 * DAY + 60);
    await rawLicense(3, NOW - 60);
    await rawLicense(4, NOW + 2 * DAY, { email: null });
    await rawLicense(5, NOW + 2 * DAY, { revokedAt: NOW - DAY });
    w.clock.now = NOW;
    await cron(w);
    expect(w.resend.sent).toHaveLength(0);
    expect(await rows()).toEqual([]);
  });

  it("đúng mốc 3 ngày thì nhắc (cận trên), nhiều hơn 1 giây thì chưa", async () => {
    const w = reminderWorld();
    await rawLicense(1, NOW + 3 * DAY);
    await rawLicense(2, NOW + 3 * DAY + 1);
    w.clock.now = NOW;
    await cron(w);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]?.to).toEqual(["raw1@example.com"]);
  });

  it("ngoài khung 08:00–20:00 giờ Việt Nam thì để lại, vào khung thì gửi", async () => {
    const w = reminderWorld();
    const { id } = await newLicense(w);
    w.clock.now = T0; // 07:00 giờ Việt Nam
    await cron(w);
    expect(w.resend.sent).toHaveLength(0);
    expect((await rows()).map((r) => r.status)).toEqual(["pending"]);
    w.clock.now = T0 + 3600; // 08:00
    await cron(w);
    expect(w.resend.sent).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ license_id: id, status: "sent" });
    expect(inSendWindow(T0)).toBe(false);
    expect(inSendWindow(T0 + 3600)).toBe(true);
    expect(inSendWindow(T0 + 12 * 3600 + 3599)).toBe(true);
    expect(inSendWindow(T0 + 13 * 3600)).toBe(false);
  });

  it("gia hạn giữa lúc xếp lịch và lúc gửi: bỏ qua, không gửi; hạn mới có dòng riêng khi tới 3 ngày", async () => {
    const w = reminderWorld();
    const { id, expires } = await newLicense(w);
    w.clock.now = T0; // xếp lịch nhưng chưa gửi (ngoài khung)
    await cron(w);
    expect(w.resend.sent).toHaveLength(0);
    await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?")
      .bind(expires + 365 * DAY, id)
      .run();
    w.clock.now = NOW;
    await cron(w);
    expect(w.resend.sent).toHaveLength(0);
    expect(await rows()).toEqual([{ license_id: id, cycle: expires, status: "skipped", skip_reason: "changed", attempts: 0, retry_at: null, sent_at: null }]);
    // Một năm sau lại gần hết hạn: dòng mới, thư mới.
    w.clock.now = expires + 365 * DAY - 2 * DAY + 3 * 3600;
    await cron(w);
    expect(w.resend.sent).toHaveLength(1);
    expect((await rows()).map((r) => r.status)).toEqual(["skipped", "sent"]);
  });

  it("license bị thu hồi hay hết email sau khi xếp lịch thì bỏ qua", async () => {
    const w = reminderWorld();
    await rawLicense(1, NOW + 2 * DAY);
    await rawLicense(2, NOW + 2 * DAY);
    w.clock.now = T0;
    await cron(w);
    await env.DB.prepare("UPDATE licenses SET revoked_at = ? WHERE id = 'R1'").bind(T0).run();
    await env.DB.prepare("UPDATE licenses SET email = NULL WHERE id = 'R2'").run();
    w.clock.now = NOW;
    await cron(w);
    expect(w.resend.sent).toHaveLength(0);
    expect((await rows()).map((r) => [r.license_id, r.status, r.skip_reason])).toEqual([
      ["R1", "skipped", "revoked"],
      ["R2", "skipped", "no_email"],
    ]);
  });

  it("hết hạn trước khi gửi được thì bỏ qua, không gửi thư hết hạn", async () => {
    const w = reminderWorld();
    await rawLicense(1, T0 + 600);
    w.clock.now = T0; // xếp lịch lúc 07:00, ngoài khung
    await cron(w);
    w.clock.now = NOW; // 10:00: đã hết hạn
    await cron(w);
    expect(w.resend.sent).toHaveLength(0);
    expect((await rows())[0]).toMatchObject({ status: "skipped", skip_reason: "expired_before_send" });
  });

  it("ngôn ngữ và loại tiền theo đơn gần nhất: ja trả VND; USD trả Creem ra tiếng Anh và giá USD", async () => {
    const w = reminderWorld();
    await newLicense(w, { email: "ja@example.com", lang: "ja" });
    await newLicense(w, { email: "usd@example.com", usd: true });
    await cron(w);
    const ja = w.resend.sent.find((m) => m.to[0] === "ja@example.com");
    const usd = w.resend.sent.find((m) => m.to[0] === "usd@example.com");
    expect(ja?.html).toContain('<html lang="ja">');
    expect(ja?.subject).toContain("プラン");
    expect(ja?.html).toContain("VND 500,000");
    expect(usd?.html).toContain('<html lang="en">');
    expect(usd?.html).toContain("$39.99");
    expect(usd?.html).not.toContain("English"); // thư tiếng Anh không có phần tiếng Anh thứ hai
  });

  it("license cấp tay (không có đơn): tiếng Việt, giá VND", async () => {
    const w = reminderWorld();
    await rawLicense(1, NOW + 2 * DAY);
    w.clock.now = NOW;
    await cron(w);
    expect(w.resend.sent[0]?.html).toContain('<html lang="vi">');
    expect(w.resend.sent[0]?.html).toContain("500.000₫");
  });

  describe("lỗi khi gửi", () => {
    it("lỗi tạm (Resend 500): hẹn gửi lại, lần sau gửi được với cùng idempotency key", async () => {
      const w = reminderWorld();
      const { id, expires } = await newLicense(w);
      w.resend.down = true;
      await cron(w);
      expect(await rows()).toEqual([{ license_id: id, cycle: expires, status: "pending", skip_reason: null, attempts: 1, retry_at: NOW + 600, sent_at: null }]);
      w.clock.now = NOW + 300; // chưa tới hẹn: không thử
      await cron(w);
      expect(w.resend.attempts).toBe(1);
      w.resend.down = false;
      w.clock.now = NOW + 601;
      await cron(w);
      expect(w.resend.sent).toHaveLength(1);
      expect(w.resend.attemptKeys).toEqual([`expiry-reminder-${id}-${expires}`, `expiry-reminder-${id}-${expires}`]);
      expect((await rows())[0]).toMatchObject({ status: "sent", attempts: 2 });
    });

    it("lỗi vĩnh viễn (422): thôi, không thử lại", async () => {
      const w = reminderWorld();
      await newLicense(w);
      w.resend.failStatus = 422;
      await cron(w);
      expect((await rows())[0]).toMatchObject({ status: "gave_up", attempts: 1 });
      w.resend.failStatus = null;
      w.clock.now = NOW + DAY;
      await cron(w);
      expect(w.resend.sent).toHaveLength(0);
      expect((await rows())[0]).toMatchObject({ status: "gave_up" });
    });

    it("Resend báo idempotency key đã dùng (409 invalid_idempotent_request): coi là đã gửi", async () => {
      const w = reminderWorld();
      await newLicense(w);
      w.resend.failStatus = 409;
      w.resend.failName = "invalid_idempotent_request";
      await cron(w);
      expect((await rows())[0]).toMatchObject({ status: "sent" });
      expect(w.resend.attempts).toBe(1);
    });

    it(`lỗi tạm mãi: thôi sau ${MAX_ATTEMPTS} lần`, async () => {
      const w = reminderWorld();
      await newLicense(w, { days: 2.5 });
      w.resend.down = true;
      for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
        await cron(w);
        const row = (await rows())[0];
        if (!row || row.status !== "pending") break;
        let t = row.retry_at ?? w.clock.now + 1;
        while (!inSendWindow(t)) t += 3600;
        w.clock.now = t;
      }
      expect((await rows())[0]).toMatchObject({ status: "gave_up", attempts: MAX_ATTEMPTS });
      expect(w.resend.attempts).toBe(MAX_ATTEMPTS);
    });

    it("dòng đang được giữ chỗ (lần cron khác đang gửi) thì không gửi chồng", async () => {
      const w = reminderWorld();
      const { id, expires } = await newLicense(w);
      await env.DB.prepare("INSERT INTO expiry_reminders (license_id, cycle, created_at, attempts, retry_at) VALUES (?, ?, ?, 1, ?)")
        .bind(id, expires, NOW, NOW + 900)
        .run();
      await cron(w);
      expect(w.resend.attempts).toBe(0);
      w.clock.now = NOW + 901; // giữ chỗ hết hạn (Worker kia chết): thử lại
      await cron(w);
      expect(w.resend.sent).toHaveLength(1);
    });
  });

  it(`tối đa ${BATCH} thư mỗi lần cron, phần còn lại gửi ở lần sau`, async () => {
    const w = reminderWorld();
    for (let i = 1; i <= BATCH + 5; i++) await rawLicense(i, NOW + 2 * DAY);
    w.clock.now = NOW;
    await cron(w);
    expect(w.resend.sent).toHaveLength(BATCH);
    await cron(w);
    expect(w.resend.sent).toHaveLength(BATCH + 5);
    await cron(w);
    expect(w.resend.sent).toHaveLength(BATCH + 5);
    expect(new Set(w.resend.sent.map((m) => m.to[0])).size).toBe(BATCH + 5);
  });

  it("enqueue chạy lại bao nhiêu lần cũng ra một dòng cho mỗi (license, mốc hạn)", async () => {
    await rawLicense(1, NOW + 2 * DAY);
    expect(await enqueueExpiryReminders(env.DB, NOW)).toBe(1);
    expect(await enqueueExpiryReminders(env.DB, NOW + 60)).toBe(0);
    expect(await rows()).toHaveLength(1);
  });

  it("lỗi của bước nhắc không làm hỏng việc cron khác: thiếu bảng thì chỉ ghi log, đối soát và gửi lại thư key vẫn chạy", async () => {
    const w = reminderWorld();
    await env.DB.prepare("ALTER TABLE expiry_reminders RENAME TO expiry_reminders_tmp").run();
    try {
      const result = await cron(w);
      expect(result).toEqual({ checked: 0, granted: 0, errors: 0, emails_retried: 0, alerts_sent: 0 });
    } finally {
      await env.DB.prepare("ALTER TABLE expiry_reminders_tmp RENAME TO expiry_reminders").run();
    }
  });

  describe("link ngừng nhận", () => {
    const postForm = async (w: World, body: string) => {
      const ctx = createExecutionContext();
      const res = await w.app.fetch(
        new Request("https://license.test/email/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.10" },
          body,
        }),
        w.env,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return res;
    };
    const tokenFor = async (email: string) => unsubscribeToken(env.RATE_LIMIT_PEPPER, await emailHash(email));
    const optouts = () => env.DB.prepare("SELECT COUNT(*) AS n FROM reminder_optouts").first<{ n: number }>().then((r) => r?.n);

    it("link trong thư dùng được: GET chỉ hiện trang xác nhận, POST mới ngừng nhận; thư sau bị bỏ qua", async () => {
      const w = reminderWorld();
      await newLicense(w, { email: "a@example.com" });
      await cron(w);
      const link = /https:\/\/api\.aitranslator\.vn(\/email\/unsubscribe\?t=[0-9a-f.]+)/.exec(w.resend.sent[0]?.html ?? "");
      expect(link).not.toBeNull();
      const path = link?.[1] ?? "";
      expect(path).toContain(await tokenFor("a@example.com"));

      const get = await w.call("GET", path);
      expect(get.status).toBe(200);
      expect(String(get.body.text)).toContain("<form");
      expect(get.headers.get("content-type")).toContain("text/html");
      expect(get.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(await optouts()).toBe(0); // quét link của hộp thư không ngừng nhận thay khách

      const token = path.split("t=")[1] ?? "";
      const post = await postForm(w, `t=${token}`);
      expect(post.status).toBe(200);
      expect(await optouts()).toBe(1);
      // Bấm lại không lỗi, không thêm dòng.
      expect((await postForm(w, `t=${token}`)).status).toBe(200);
      expect(await optouts()).toBe(1);

      // Gia hạn rồi một năm sau lại gần hết hạn: vẫn không nhắc.
      const lic = await env.DB.prepare("SELECT id, expires_at FROM licenses WHERE email = 'a@example.com'").first<{ id: string; expires_at: number }>();
      w.resend.sent.length = 0;
      const later = (lic?.expires_at ?? 0) + 365 * DAY;
      await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?").bind(later, lic?.id).run();
      w.clock.now = later - 2 * DAY + 3 * 3600;
      await cron(w);
      expect(w.resend.sent).toHaveLength(0);
      expect((await rows()).at(-1)).toMatchObject({ status: "skipped", skip_reason: "opted_out" });
    });

    it("mã sai, thiếu hay bị sửa thì 400 và không ghi gì", async () => {
      const w = reminderWorld();
      const good = await tokenFor("a@example.com");
      const tampered = `${good.slice(0, -1)}${good.endsWith("0") ? "1" : "0"}`;
      for (const t of ["", "abc", tampered, `${"0".repeat(64)}.${"0".repeat(64)}`]) {
        expect((await w.call("GET", `/email/unsubscribe?t=${t}`)).status).toBe(400);
        expect((await postForm(w, `t=${t}`)).status).toBe(400);
      }
      expect((await postForm(w, "")).status).toBe(400);
      expect(await optouts()).toBe(0);
    });

    it("mã ký bằng khóa khác không hợp lệ; mã đúng trả lại mã băm email", async () => {
      const hash = await emailHash(" A@Example.com ");
      expect(hash).toBe(await emailHash("a@example.com")); // chuẩn hóa: chữ thường, bỏ khoảng trắng
      const token = await unsubscribeToken("pepper-1", hash);
      expect(await verifyUnsubscribeToken("pepper-1", token)).toBe(hash);
      expect(await verifyUnsubscribeToken("pepper-2", token)).toBeNull();
    });

    it("giới hạn tần suất theo IP", async () => {
      const w = reminderWorld();
      for (let i = 0; i < LIMITS.unsub_ip; i++) expect((await w.call("GET", "/email/unsubscribe?t=x")).status).toBe(400);
      expect((await w.call("GET", "/email/unsubscribe?t=x")).status).toBe(429);
    });
  });
});

describe("mẫu thư nhắc gia hạn", () => {
  // 2026-11-04 10:00 giờ Việt Nam (03:00 UTC).
  const expiresAt = Date.UTC(2026, 10, 4, 3, 0, 0) / 1000;
  const base = {
    plan: "yearly" as const,
    licenseKey: "ABCDEFGHJKMNPQRSTVWXYZ234567",
    expiresAt,
    daysLeft: 3,
    currency: "VND",
    price: 500000,
    addDays: 365,
    unsubscribeUrl: "https://api.aitranslator.vn/email/unsubscribe?t=abc.def",
  };
  const LANGS: Lang[] = ["vi", "en", "ja", "zh", "ko"];

  it.each(LANGS)("%s: thư đủ gói, hạn, giá, link hướng dẫn và link ngừng nhận; không ảnh, không script", (lang) => {
    const mail = expiryReminderEmail({ ...base, lang });
    expect(mail.subject).toContain("Yearly");
    expect(mail.html).toContain(MAIL[lang].date(2026, 11, 4));
    expect(mail.html).toContain(`<a href="${SITE_URL}${MAIL[lang].guidePath}"`);
    expect(mail.html).toContain(`href="${base.unsubscribeUrl}"`);
    expect(mail.html).toContain("…4567"); // chỉ 4 ký tự cuối của key
    expect(mail.html).not.toContain(base.licenseKey);
    expect(mail.text).not.toContain(base.licenseKey);
    expect(mail.text).toContain(base.unsubscribeUrl);
    expect(mail.html).not.toMatch(/<script|<img|<iframe/i);
    expect(mail.html).toContain(`<html lang="${lang === "zh" ? "zh-Hans" : lang}">`);
    expect(mail.html).toContain(REMINDER[lang].button);
    expect(mail.html).toContain(`<b>${REMINDER[lang].upgradeLabel}</b>`);
    // Khuôn của thư key: ngôn ngữ của khách trên, tiếng Anh dưới (app tiếng Anh thì chỉ tiếng Anh).
    if (lang === "en") {
      expect(mail.subject).not.toContain(" / ");
      expect(mail.html).not.toContain(">English<");
    } else {
      expect(mail.subject).toContain(" / Your Yearly plan expires in 3 days");
      expect(mail.html).toContain(">English<");
      expect(mail.html).toContain("VND 500,000");
    }
  });

  it("thư tiếng Việt: ngày theo giờ Việt Nam trong ô lịch, nhãn còn N ngày, giá có ₫", () => {
    const mail = expiryReminderEmail({ ...base, lang: "vi" });
    expect(mail.subject).toBe("Gói Yearly của bạn sẽ hết hạn sau 3 ngày / Your Yearly plan expires in 3 days");
    expect(mail.html).toContain("THG 11");
    expect(mail.html).toContain(">04<");
    expect(mail.html).toContain("Còn 3 ngày");
    expect(mail.html).toContain("500.000₫");
    expect(mail.html).toContain("04/11/2026");
  });

  it("hạn lúc 23:30 UTC thì ngày Việt Nam là ngày kế tiếp", () => {
    const mail = expiryReminderEmail({ ...base, lang: "vi", expiresAt: Date.UTC(2026, 10, 4, 23, 30, 0) / 1000 });
    expect(mail.html).toContain("05/11/2026");
  });

  it("còn 1 ngày: tiếng Anh dùng số ít", () => {
    const mail = expiryReminderEmail({ ...base, lang: "en", daysLeft: 1 });
    expect(mail.subject).toBe("Your Yearly plan expires in 1 day");
    expect(mail.html).toContain("1 day left");
  });

  it("giá theo loại tiền", () => {
    expect(priceText("vi", "VND", 500000)).toBe("500.000₫");
    expect(priceText("en", "VND", 269000)).toBe("VND 269,000");
    expect(priceText("ja", "USD", 3999)).toBe("$39.99");
    expect(priceText("en", "USD", 2199)).toBe("$21.99");
  });
});
