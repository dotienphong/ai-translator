import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { HintView } from "../lib/ipc";
import { createHintStore } from "./hint";

const HIDDEN: HintView = { uiLanguage: "vi", theme: "system", app: null };
const TEAMS: HintView = { ...HIDDEN, app: "teams" };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(view: HintView = HIDDEN) {
  const f = fakeIpc({
    get_meeting_hint_view: () => view,
    meeting_hint_accept: () => null,
    meeting_hint_dismiss: () => null,
  });
  const store = createHintStore(f.ipc);
  const sent = (cmd: string) => f.calls.filter((c) => c.cmd === cmd).map((c) => c.args);
  return { ...f, store, sent };
}

describe("cửa sổ gợi ý bật dịch (spec 2026-11-01-goi-y-bat-dich-khi-hop §5)", () => {
  it("đọc phần của mình lúc mở, rồi theo sự kiện đổi nội dung", async () => {
    const { store, emit } = setup();
    await store.getState().init();
    expect(store.getState().view).toEqual(HIDDEN);
    emit("meeting-hint://changed", TEAMS);
    expect(store.getState().view?.app).toBe("teams");
    emit("meeting-hint://changed", HIDDEN);
    expect(store.getState().view?.app).toBeNull();
  });

  it("sự kiện tới trước kết quả của lệnh đọc thì giữ sự kiện (mới hơn)", async () => {
    const f = fakeIpc({
      get_meeting_hint_view: async () => {
        // Sự kiện tới trong lúc lệnh đọc còn chạy.
        f.emit("meeting-hint://changed", TEAMS);
        return HIDDEN;
      },
    });
    const store = createHintStore(f.ipc);
    await store.getState().init();
    expect(store.getState().view?.app).toBe("teams");
  });

  it("Bật dịch gọi đúng một lệnh, không kèm tham số", async () => {
    const { store, sent } = setup(TEAMS);
    await store.getState().init();
    store.getState().accept();
    await flush();
    expect(sent("meeting_hint_accept")).toEqual([undefined]);
    expect(sent("meeting_hint_dismiss")).toEqual([]);
  });

  it("Bỏ qua và Không hỏi lại khác nhau ở ignoreApp", async () => {
    const { store, sent } = setup(TEAMS);
    await store.getState().init();
    store.getState().dismiss(false);
    store.getState().dismiss(true);
    await flush();
    expect(sent("meeting_hint_dismiss")).toEqual([{ ignoreApp: false }, { ignoreApp: true }]);
  });

  it("lệnh lỗi không làm vỡ cửa sổ", async () => {
    const f = fakeIpc({
      get_meeting_hint_view: () => TEAMS,
      meeting_hint_accept: () => {
        throw new Error("lỗi");
      },
    });
    const store = createHintStore(f.ipc);
    await store.getState().init();
    store.getState().accept();
    await flush();
    expect(store.getState().view?.app).toBe("teams");
  });
});
