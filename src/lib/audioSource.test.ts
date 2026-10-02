import { describe, expect, it } from "vitest";
import { translate } from "../i18n";
import { sourceChoices, sourceFromKey, sourceKey, sourceLabel } from "./audioSource";
import type { AudioSource, AudioSourceOption } from "./ipc";

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate("vi", key, params);

describe("nguồn âm thanh", () => {
  it("giá trị của danh sách đổi qua lại được với cài đặt", () => {
    const sources: AudioSource[] = [
      { kind: "system" },
      { kind: "app", bundleId: "us.zoom.xos" },
      { kind: "device", id: "{0.0.0.00000000}.{a:b}" },
    ];
    for (const s of sources) expect(sourceFromKey(sourceKey(s))).toEqual(s);
  });

  it("nguồn đang chọn vẫn có trong danh sách dù lúc này không đọc thấy", () => {
    const options: AudioSourceOption[] = [{ kind: "app", bundleId: "com.microsoft.teams2", name: "Microsoft Teams" }];
    const zoom: AudioSource = { kind: "app", bundleId: "us.zoom.xos" };
    expect(sourceChoices(zoom, options).map(sourceKey)).toEqual(["system", "app:com.microsoft.teams2", "app:us.zoom.xos"]);
    expect(sourceChoices({ kind: "system" }, null).map(sourceKey)).toEqual(["system"]);
  });

  it("tên hiện: toàn hệ thống theo hệ điều hành, app theo tên (không có thì bundle ID), thiết bị theo tên", () => {
    const devices: AudioSourceOption[] = [{ kind: "device", id: "d1", name: "Loa (Realtek)" }];
    const apps: AudioSourceOption[] = [{ kind: "app", bundleId: "us.zoom.xos", name: "zoom.us" }];
    expect(sourceLabel({ kind: "system" }, "macos", null, t)).toBe("Toàn hệ thống, trừ app này");
    expect(sourceLabel({ kind: "system" }, "windows", null, t)).toBe("Thiết bị phát mặc định (tự động)");
    expect(sourceLabel({ kind: "app", bundleId: "us.zoom.xos" }, "macos", null, t)).toBe("Chỉ us.zoom.xos");
    expect(sourceLabel({ kind: "app", bundleId: "us.zoom.xos" }, "macos", apps, t)).toBe("Chỉ zoom.us");
    expect(sourceLabel(apps[0]!, "macos", null, t)).toBe("Chỉ zoom.us");
    expect(sourceLabel({ kind: "app", bundleId: "x.y", name: null }, "macos", null, t)).toBe("Chỉ x.y");
    expect(sourceLabel({ kind: "app", bundleId: "com.apple.WebKit.GPU", name: null }, "macos", null, t)).toBe(
      "Chỉ Safari và trang web trong các app khác",
    );
    expect(sourceLabel({ kind: "device", id: "d1" }, "windows", devices, t)).toBe("Loa (Realtek)");
    expect(sourceLabel({ kind: "device", id: "d2" }, "windows", devices, t)).toBe("d2");
  });
});
