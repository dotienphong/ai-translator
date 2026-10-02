import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import { fakeModelsView, fakePack } from "../lib/fakeModels";
import type { Settings } from "../lib/ipc";
import { createModelsStore } from "./models";

function setup(fail: Partial<Record<string, string>> = {}) {
  let rev = 1;
  const next = (extra = {}) => fakeModelsView({ rev: ++rev, ...extra });
  const error = (code: string) => ({ code, field: null, message: "lỗi giả" });
  const fake = fakeIpc({
    get_models_state: () => fakeModelsView({ rev: 1, sequence: null, packs: [] }),
    load_models: () => {
      if (fail.load_models) throw error(fail.load_models);
      return next();
    },
    download_models: ({ pack }) => {
      if (fail.download_models) throw error(fail.download_models);
      return next({ job: { state: "downloading", pack, doneBytes: 0, totalBytes: 10, error: null, replacesInUse: false } });
    },
    pause_models_download: () => next(),
    select_model_pack: () => ({}) as Settings,
    delete_models: () => next(),
    delete_models_and_data: () => {
      if (fail.delete_models_and_data) throw error(fail.delete_models_and_data);
      return next({ usedBytes: 0 });
    },
    dismiss_models_update: () => next({ updateAvailable: false }),
    verify_models: () =>
      next({ packs: [fakePack("standard", 2_485_000_000), fakePack("lite", 1_326_000_000, { usable: true, missingBytes: 10 })] }),
  });
  let cleared = 0;
  const store = createModelsStore(fake.ipc, () => cleared++);
  return { fake, store, cleared: () => cleared };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("store quản lý model", () => {
  it("init nghe sự kiện, đọc trạng thái, rồi tải manifest ở nền", async () => {
    const { fake, store } = setup();
    const off = await store.getState().init();
    expect(fake.listenerCount("models://state")).toBe(1);
    await flush();
    expect(fake.calls.map((c) => c.cmd)).toEqual(["get_models_state", "load_models"]);
    expect(store.getState().view?.sequence).toBe(3);
    off();
    expect(fake.listenerCount("models://state")).toBe(0);
  });

  it("bỏ trạng thái cũ hơn trạng thái đang có", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    await flush();
    fake.emit("models://state", fakeModelsView({ rev: 50, usedBytes: 7 }));
    fake.emit("models://state", fakeModelsView({ rev: 49, usedBytes: 9 }));
    expect(store.getState().view?.usedBytes).toBe(7);
  });

  it("tải gói: trạng thái mới từ lệnh; lỗi thì hiện mã lỗi", async () => {
    const { store } = setup();
    expect(await store.getState().download("lite")).toBe(true);
    expect(store.getState().view?.job).toMatchObject({ state: "downloading", pack: "lite" });
    const failing = setup({ download_models: "modelsNoSpace" });
    expect(await failing.store.getState().download("lite")).toBe(false);
    expect(failing.store.getState().error).toEqual({ code: "modelsNoSpace", field: null });
    failing.store.getState().dismissError();
    expect(failing.store.getState().error).toBeNull();
  });

  it("lỗi mạng lúc tải manifest không làm init lỗi", async () => {
    const { store } = setup({ load_models: "modelsOffline" });
    await store.getState().init();
    await flush();
    expect(store.getState().error?.code).toBe("modelsOffline");
    expect(store.getState().view?.packs).toEqual([]);
  });

  it("xóa model và dữ liệu xong thì báo cửa sổ chính bỏ dữ liệu đang hiện; lỗi thì không", async () => {
    const { store, cleared } = setup();
    expect(await store.getState().removeAll()).toBe(true);
    expect(cleared()).toBe(1);
    const failing = setup({ delete_models_and_data: "modelsInUse" });
    expect(await failing.store.getState().removeAll()).toBe(false);
    expect(failing.cleared()).toBe(0);
  });

  it("tải lại: băm lại trước, rồi chỉ tải khi gói còn thiếu", async () => {
    const { fake, store } = setup();
    expect(await store.getState().repair("lite")).toBe(true);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["verify_models", "download_models"]);
    expect(fake.calls[1]?.args).toEqual({ pack: "lite" });
  });

  it("chọn gói, xóa hết thì bỏ lựa chọn, để sau thì tắt lời mời cập nhật", async () => {
    const { fake, store } = setup();
    store.getState().choose("lite");
    expect(store.getState().choice).toBe("lite");
    expect(await store.getState().select("lite")).toBe(true);
    expect(await store.getState().removeAll()).toBe(true);
    expect(store.getState().choice).toBeNull();
    await store.getState().dismissUpdate();
    expect(store.getState().view?.updateAvailable).toBe(false);
    expect(await store.getState().remove("standard")).toBe(true);
    await store.getState().pause();
    expect(fake.calls.map((c) => c.cmd)).toEqual([
      "select_model_pack",
      "delete_models_and_data",
      "dismiss_models_update",
      "delete_models",
      "pause_models_download",
    ]);
    expect(fake.calls[0]?.args).toEqual({ pack: "lite" });
  });
});
