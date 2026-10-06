import { describe, expect, it } from "vitest";
import { loadLegal, type LegalLoaders, pickLegal } from "./legal";

const loaders: LegalLoaders = {
  "/docs/legal/eula.vi.md": async () => "EULA vi",
  "/docs/legal/eula.en.md": async () => "EULA en",
  "/docs/legal/privacy.vi.md": async () => "Privacy vi",
};

describe("pickLegal", () => {
  it("chọn đúng loại và ngôn ngữ", async () => {
    expect(await pickLegal(loaders, "eula", "en")?.()).toBe("EULA en");
    expect(await pickLegal(loaders, "privacy", "vi")?.()).toBe("Privacy vi");
  });
  it("thiếu bản ngôn ngữ đó thì dùng tiếng Việt", async () => {
    expect(await pickLegal(loaders, "privacy", "en")?.()).toBe("Privacy vi");
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
    expect(await loadLegal("eula", "vi")).toContain("Thỏa thuận cấp phép người dùng cuối");
    expect(await loadLegal("eula", "en")).toContain("End User License Agreement");
    expect(await loadLegal("privacy", "vi")).toContain("Chính sách quyền riêng tư");
    expect(await loadLegal("privacy", "en")).toContain("Privacy Policy");
  });
});
