import { describe, expect, it } from "vitest";
import { fakeModelsView, fakePack } from "./fakeModels";
import {
  defaultChoice,
  downloadBlock,
  formatBytes,
  jobFor,
  packBadges,
  progress,
  recommendedPack,
  remainingBytes,
  shouldAutoDownload,
} from "./models";

const pack = fakePack;
const view = fakeModelsView;

describe("formatBytes", () => {
  it("theo đơn vị thập phân, tiếng Việt dùng dấu phẩy", () => {
    expect(formatBytes(2_485_000_000, "vi")).toBe("2,5 GB");
    expect(formatBytes(2_485_000_000, "en")).toBe("2.5 GB");
    expect(formatBytes(1_000_000_000, "en")).toBe("1 GB");
    expect(formatBytes(190_085_487, "vi")).toBe("190 MB");
    expect(formatBytes(2_327_524, "en")).toBe("2.3 MB");
    expect(formatBytes(11_639, "en")).toBe("12 KB");
    expect(formatBytes(0, "vi")).toBe("0 KB");
  });
});

describe("chọn gói", () => {
  it("đề xuất theo máy; máy chưa hỗ trợ thì gói nhỏ nhất", () => {
    expect(recommendedPack(view())).toBe("standard");
    expect(recommendedPack(view({ verdict: { kind: "recommend", pack: "lite" } }))).toBe("lite");
    expect(recommendedPack(view({ verdict: { kind: "unsupported", reason: "lowRam" } }))).toBe("lite");
    expect(recommendedPack(view({ verdict: null }))).toBe("lite");
    expect(recommendedPack(view({ packs: [] }))).toBeNull();
  });

  it("gói cần app mới hơn thì không đề xuất", () => {
    const packs = [pack("standard", 2_485_000_000, { appTooOld: true }), pack("lite", 1_326_000_000)];
    expect(recommendedPack(view({ packs }))).toBe("lite");
  });

  it("chọn sẵn: gói người dùng vừa chọn, rồi gói đang dùng, rồi gói đề xuất", () => {
    expect(defaultChoice(view(), "lite", "standard")).toBe("lite");
    expect(defaultChoice(view(), null, "lite")).toBe("lite");
    expect(defaultChoice(view(), "khong-co", null)).toBe("standard");
    expect(defaultChoice(view(), null, null)).toBe("standard");
  });
});

describe("tiến độ tải", () => {
  it("phần còn phải tải trừ phần dở; tiến độ trong 0–1", () => {
    expect(remainingBytes(pack("lite", 1_000, { missingBytes: 800, partialBytes: 300 }))).toBe(500);
    expect(remainingBytes(pack("lite", 1_000, { missingBytes: 100, partialBytes: 300 }))).toBe(0);
    const job = { state: "downloading" as const, pack: "lite", doneBytes: 250, totalBytes: 1_000, error: null, replacesInUse: false };
    expect(progress(job)).toBe(0.25);
    expect(progress({ ...job, totalBytes: 0 })).toBe(0);
    expect(progress({ ...job, doneBytes: 2_000 })).toBe(1);
    expect(jobFor(view({ job }), "lite")).toEqual(job);
    expect(jobFor(view({ job }), "standard")).toBeNull();
    expect(jobFor(view(), "lite")).toBeNull();
  });
});

describe("tải được không", () => {
  const job = (state: "idle" | "downloading" | "paused" | "failed" | "done", pack: string | null) => ({
    state,
    pack,
    doneBytes: 0,
    totalBytes: 10,
    error: null,
    replacesInUse: false,
  });

  it("máy chưa hỗ trợ, gói cần app mới hơn, ổ không đủ chỗ thì không tải", () => {
    const lite = pack("lite", 1_326_000_000);
    expect(downloadBlock(view(), lite)).toBeNull();
    expect(downloadBlock(view({ verdict: { kind: "unsupported", reason: "noAvx2" } }), lite)).toBe("unsupported");
    expect(downloadBlock(view(), { ...lite, appTooOld: true })).toBe("appTooOld");
    expect(downloadBlock(view(), { ...lite, enoughSpace: false })).toBe("noSpace");
  });

  it("bước 3 tự tải gói vừa chọn, kể cả khi gói khác đang dừng giữa chừng", () => {
    expect(shouldAutoDownload(view(), "lite", true)).toBe(true);
    expect(shouldAutoDownload(view({ job: job("downloading", "standard") }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ job: job("paused", "standard") }), "lite", true)).toBe(true);
    expect(shouldAutoDownload(view({ job: job("failed", "standard") }), "lite", true)).toBe(true);
    expect(shouldAutoDownload(view({ job: job("paused", "lite") }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ job: job("failed", "lite") }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ job: job("done", "standard") }), "lite", true)).toBe(true);
    const done = view({ packs: [pack("lite", 1, { usable: true, complete: true })] });
    expect(shouldAutoDownload(done, "lite", true)).toBe(false);
    expect(shouldAutoDownload(view({ verdict: { kind: "unsupported", reason: "lowRam" } }), "lite", true)).toBe(false);
    expect(shouldAutoDownload(view(), null, true)).toBe(false);
  });

  it("Windows chưa dò xong GPU thì chỉ tự tải gói người dùng đã tự chọn", () => {
    const windows = (gpuKnown: boolean) =>
      view({ machine: { os: "windows", ramMib: 16_384, avx2: true, gpus: [], gpuKnown } });
    expect(shouldAutoDownload(windows(false), "lite", false)).toBe(false);
    expect(shouldAutoDownload(windows(false), "lite", true)).toBe(true);
    expect(shouldAutoDownload(windows(true), "lite", false)).toBe(true);
    expect(shouldAutoDownload(view(), "lite", false)).toBe(true);
  });
});

describe("packBadges", () => {
  it("đề xuất, đang dùng hay đã tải, cần app mới hơn", () => {
    const standard = pack("standard", 2_485_000_000, { usable: true });
    const lite = pack("lite", 1_326_000_000, { usable: true, appTooOld: true });
    const v = view({ packs: [standard, lite] });
    expect(packBadges(v, standard, "standard")).toEqual(["recommended", "inUse"]);
    expect(packBadges(v, standard, "lite")).toEqual(["recommended", "installed"]);
    expect(packBadges(v, lite, "standard")).toEqual(["installed", "appTooOld"]);
    const unsupported = view({ verdict: { kind: "unsupported", reason: "lowRam" } });
    expect(packBadges(unsupported, pack("lite", 1), null)).toEqual([]);
  });
});
