import { describe, expect, it } from "vitest";
import { loadNotices } from "./notices";

describe("loadNotices", () => {
  it("trả văn bản của file THIRD_PARTY_NOTICES đã đóng gói", async () => {
    await expect(loadNotices({ "/THIRD_PARTY_NOTICES.txt": async () => "AI Translator - notices\n" })).resolves.toBe(
      "AI Translator - notices\n",
    );
  });

  it("bản build không có file (bản dev chưa sinh) thì trả null", async () => {
    await expect(loadNotices({})).resolves.toBeNull();
  });

  it("file rỗng hay đọc lỗi cũng trả null, không ném lỗi ra giao diện", async () => {
    await expect(loadNotices({ "/THIRD_PARTY_NOTICES.txt": async () => "  \n" })).resolves.toBeNull();
    await expect(
      loadNotices({
        "/THIRD_PARTY_NOTICES.txt": async () => {
          throw new Error("chunk lỗi");
        },
      }),
    ).resolves.toBeNull();
  });
});
