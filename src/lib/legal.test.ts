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
