import type { ModelsView, PackView } from "./models";

// Dữ liệu giả của quản lý model cho test (chỉ dùng trong file *.test.ts): hai gói như manifest staging, máy Mac 16 GB.

export function fakePack(id: string, bytes: number, extra: Partial<PackView> = {}): PackView {
  return {
    id,
    name: { vi: id === "lite" ? "Nhẹ" : "Chuẩn", en: id === "lite" ? "Lite" : "Standard" },
    note: { vi: "ghi chú", en: "note" },
    bytes,
    usable: false,
    complete: false,
    missingBytes: bytes,
    partialBytes: 0,
    appTooOld: false,
    enoughSpace: true,
    ...extra,
  };
}

export function fakeModelsView(extra: Partial<ModelsView> = {}): ModelsView {
  return {
    rev: 1,
    hasSource: true,
    checking: false,
    manifestError: null,
    sequence: 3,
    packs: [fakePack("standard", 2_485_000_000), fakePack("lite", 1_326_000_000)],
    machine: { os: "macos", ramMib: 16_384, avx2: true, gpus: [], gpuKnown: true },
    verdict: { kind: "recommend", pack: "standard" },
    freeDiskBytes: 100_000_000_000,
    usedBytes: 0,
    job: { state: "idle", pack: null, doneBytes: 0, totalBytes: 0, error: null, replacesInUse: false },
    updateAvailable: false,
    ...extra,
  };
}
