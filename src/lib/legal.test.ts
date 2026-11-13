import { describe, expect, it } from "vitest";
import { loadLegal, type LegalLoaders, pickLegal } from "./legal";

const loaders: LegalLoaders = {
  "/docs/legal/eula.vi.md": async () => "EULA vi",
  "/docs/legal/eula.en.md": async () => "EULA en",
  "/docs/legal/privacy.vi.md": async () => "Privacy vi",
};

describe("pickLegal", () => {
  it("chọn đúng loại và ngôn ngữ, kèm ngôn ngữ của file tìm được", async () => {
    const eula = pickLegal(loaders, "eula", "en");
    expect(eula?.lang).toBe("en");
    expect(await eula?.load()).toBe("EULA en");
    const privacy = pickLegal(loaders, "privacy", "vi");
    expect(privacy?.lang).toBe("vi");
    expect(await privacy?.load()).toBe("Privacy vi");
  });
  it("ngôn ngữ chưa có bản riêng (ja, zh, ko) thì dùng English (spec 2026-10-12 Q2)", async () => {
    for (const lang of ["ja", "zh", "ko"] as const) {
      const eula = pickLegal(loaders, "eula", lang);
      expect(eula?.lang, lang).toBe("en");
      expect(await eula?.load(), lang).toBe("EULA en");
    }
  });
  it("thiếu cả bản English thì dùng tiếng Việt (bản gốc)", async () => {
    const privacy = pickLegal(loaders, "privacy", "ko");
    expect(privacy?.lang).toBe("vi");
    expect(await privacy?.load()).toBe("Privacy vi");
    expect(pickLegal(loaders, "privacy", "en")?.lang).toBe("vi");
  });
  it("không có loại đó thì null", () => {
    expect(pickLegal({}, "eula", "vi")).toBeNull();
  });
});

describe("loadLegal", () => {
  it("văn bản rỗng hay tải lỗi thì null, không ném lỗi ra giao diện", async () => {
    await expect(loadLegal("eula", "vi", { "/docs/legal/eula.vi.md": async () => "  \n" })).resolves.toBeNull();
    await expect(
      loadLegal("eula", "vi", {
        "/docs/legal/eula.vi.md": async () => {
          throw new Error("hỏng");
        },
      }),
    ).resolves.toBeNull();
  });
  it("bốn file thật được đóng gói: đúng loại và đúng ngôn ngữ", async () => {
    const eulaVi = await loadLegal("eula", "vi");
    expect(eulaVi?.lang).toBe("vi");
    expect(eulaVi?.text).toContain("Thỏa thuận cấp phép người dùng cuối");
    const eulaEn = await loadLegal("eula", "en");
    expect(eulaEn?.lang).toBe("en");
    expect(eulaEn?.text).toContain("End User License Agreement");
    const privacyVi = await loadLegal("privacy", "vi");
    expect(privacyVi?.lang).toBe("vi");
    expect(privacyVi?.text).toContain("Chính sách quyền riêng tư");
    const privacyEn = await loadLegal("privacy", "en");
    expect(privacyEn?.lang).toBe("en");
    expect(privacyEn?.text).toContain("Privacy Policy");
  });
  it("ja, zh, ko dùng bản English của file thật và báo ngôn ngữ English", async () => {
    for (const lang of ["ja", "zh", "ko"] as const) {
      const eula = await loadLegal("eula", lang);
      expect(eula?.lang, lang).toBe("en");
      expect(eula?.text, lang).toContain("End User License Agreement");
      const privacy = await loadLegal("privacy", lang);
      expect(privacy?.lang, lang).toBe("en");
      expect(privacy?.text, lang).toContain("Privacy Policy");
    }
  });
});

// Đăng nhập bằng Google (spec 2026-11-05-dang-nhap-google-design.md §8, §10): bản đóng gói trong app chính là docs/legal (không có
// bản chép riêng), EULA lên 1.9 và chính sách lên 1.15 (model cloud và ghi chú cuộc họp, spec 2026-11-11 mục 10), và chính sách nói cùng điều với màn đăng nhập và nút Xóa tài khoản trong app.
// Đọc file bằng `node:fs` nạp động (dự án không cài kiểu của Node), như markdown.test.ts.
type Fs = { readFileSync(path: URL, encoding: "utf8"): string };
const onDisk = async (name: string) =>
  ((await import("node:fs" as string)) as Fs).readFileSync(new URL(`../../docs/legal/${name}`, import.meta.url), "utf8");

describe("văn bản pháp lý đóng gói, bản có tài khoản Google", () => {
  it("bản app đóng gói trùng nguyên văn bốn file của docs/legal", async () => {
    for (const kind of ["eula", "privacy"] as const) {
      for (const lang of ["vi", "en"] as const) {
        const bundled = await loadLegal(kind, lang);
        expect(bundled?.text, `${kind}.${lang}`).toBe(await onDisk(`${kind}.${lang}.md`));
      }
    }
  });
  it("EULA 1.9 và chính sách 1.15, bản vi và en cùng phiên bản", async () => {
    expect(await onDisk("eula.vi.md")).toMatch(/^\*\*Phiên bản 1\.9, hiệu lực từ \d\d\/\d\d\/\d{4}\.\*\*$/m);
    expect(await onDisk("eula.en.md")).toMatch(/^\*\*Version 1\.9, effective \d{1,2} [A-Z][a-z]+ \d{4}\. /m);
    expect(await onDisk("privacy.vi.md")).toMatch(/^\*\*Phiên bản 1\.15, hiệu lực từ \d\d\/\d\d\/\d{4}\.\*\*$/m);
    expect(await onDisk("privacy.en.md")).toMatch(/^\*\*Version 1\.15, effective \d{1,2} [A-Z][a-z]+ \d{4}\. /m);
  });
  it("chính sách không còn nói ứng dụng không có tài khoản đăng nhập", async () => {
    expect(await onDisk("privacy.vi.md")).not.toMatch(/không có tài khoản đăng nhập/);
    expect(await onDisk("privacy.en.md")).not.toMatch(/no sign-in accounts?/i);
  });
  it("chính sách nêu đăng nhập bằng Google, dữ liệu nhận từ Google, bên xử lý, nút Xóa tài khoản và những gì máy chủ giữ lại sau khi xóa", async () => {
    const need = {
      vi: [
        "Đăng nhập bằng Google",
        "mã định danh tài khoản Google",
        "Cài đặt › Tài khoản",
        "Xóa tài khoản",
        "không được dùng để quảng bá",
        "**Google**",
        "**Cloudflare**",
        "accounts.google.com",
        // Những gì còn lại sau khi xóa tài khoản: cùng danh sách với account.settings.delete.hint của app.
        "ngày tạo",
        "lần đăng nhập gần nhất",
        "thời điểm bạn đồng ý",
        "ngôn ngữ giao diện",
        "mốc dùng thử",
        "thời điểm xóa",
        // account.settings.delete.hint.license: email mua gói ở lại với license và đơn hàng.
        "Email bạn dùng để mua gói vẫn nằm trong license và đơn hàng",
      ],
      en: [
        "Sign in with Google",
        "Google account identifier",
        "Settings › Account",
        "Delete account",
        "not used for marketing",
        "**Google**",
        "**Cloudflare**",
        "accounts.google.com",
        "creation date",
        "last sign-in time",
        "when you gave consent",
        "interface language",
        "trial dates",
        "time of deletion",
        "The email you used to buy a plan stays with that license and order",
      ],
    } as const;
    for (const lang of ["vi", "en"] as const) {
      const text = await onDisk(`privacy.${lang}.md`);
      for (const n of need[lang]) expect(text, `privacy.${lang}.md: "${n}"`).toContain(n);
    }
  });
  it("EULA nêu tài khoản Google: gói Free cần đăng nhập, gói trả phí không cần, mỗi tài khoản Google dùng thử một lần", async () => {
    const need = {
      vi: ["tài khoản Google", "mỗi tài khoản Google", "không cần đăng nhập"],
      en: ["Google account", "each Google account", "do not need to sign in"],
    } as const;
    for (const lang of ["vi", "en"] as const) {
      const text = await onDisk(`eula.${lang}.md`);
      for (const n of need[lang]) expect(text, `eula.${lang}.md: "${n}"`).toContain(n);
    }
  });
});

// Model cloud và ghi chú cuộc họp (spec 2026-11-11 mục 10; kế hoạch 05 Task 1): chính sách 1.14 chưa có dòng nào về nhà cung cấp cloud,
// nên câu "không gửi qua mạng" của chép lời và bản dịch phải có ngoại lệ, và EULA phải đổi theo câu "dịch chạy trên máy bạn".
describe("văn bản pháp lý, bản có model cloud và ghi chú cuộc họp", () => {
  it("chính sách có đủ mục 1 đến 16, bản vi và en", async () => {
    for (const lang of ["vi", "en"] as const) {
      const heads = (await onDisk(`privacy.${lang}.md`)).match(/^## \d+\./gm) ?? [];
      expect(heads, lang).toEqual(Array.from({ length: 16 }, (_, i) => `## ${i + 1}.`));
    }
  });
  it("chính sách nêu model cloud do người dùng bật, ba máy chủ, việc không gửi âm thanh và nhà cung cấp không phải bên xử lý của chúng tôi", async () => {
    const need = {
      vi: [
        "## 16. Model cloud và ghi chú cuộc họp",
        "Mặc định cả hai đều tắt",
        "api.openai.com",
        "generativelanguage.googleapis.com",
        "api.deepseek.com",
        "**Không bao giờ gửi âm thanh**",
        "không phải bên xử lý dữ liệu của chúng tôi",
        "| Ghi chú cuộc họp |",
        "Ghi chú tạo bằng model trên máy",
      ],
      en: [
        "## 16. Cloud models and meeting notes",
        "Both are off by default",
        "api.openai.com",
        "generativelanguage.googleapis.com",
        "api.deepseek.com",
        "**Audio is never sent**",
        "are not processors of our data",
        "| Meeting notes |",
        "Meeting notes made with the on-device model",
      ],
    } as const;
    for (const lang of ["vi", "en"] as const) {
      const text = await onDisk(`privacy.${lang}.md`);
      for (const phrase of need[lang]) expect(text, `${lang}: ${phrase}`).toContain(phrase);
    }
  });
  it("câu \"không có kết nối nào khác\" và câu dịch trên máy có ngoại lệ model cloud", async () => {
    expect(await onDisk("privacy.vi.md")).toContain("chỉ rời máy ở kết nối số 6");
    expect(await onDisk("privacy.en.md")).toContain("only through connection 6");
    expect(await onDisk("privacy.vi.md")).toContain("chỉ khi bạn tự bật model cloud thì từng câu cần dịch");
    expect(await onDisk("privacy.en.md")).toContain("only if you turn on a cloud model yourself is each sentence");
    expect(await onDisk("eula.vi.md")).toContain("trừ khi bạn tự bật model cloud");
    expect(await onDisk("eula.en.md")).toContain("unless you turn on a cloud model yourself");
  });
});
