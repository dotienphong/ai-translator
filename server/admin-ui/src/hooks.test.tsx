import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/client";
import type { Page } from "./api/types";
import { useLoad, usePaged } from "./hooks";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const page = (items: string[], next: string | null): Page<string> => ({ items, next_cursor: next });

/** Mỗi lời gọi (bộ lọc, con trỏ) có một promise hoãn để test tự quyết lúc nào trang về. */
function server() {
  const pending = new Map<string, Deferred<Page<string>>>();
  const key = (filter: string, cursor?: string) => `${filter}/${cursor ?? ""}`;
  const fetchPage = vi.fn((filter: string, cursor?: string) => {
    const d = deferred<Page<string>>();
    pending.set(key(filter, cursor), d);
    return d.promise;
  });
  const reply = (filter: string, cursor: string | undefined, p: Page<string>) =>
    act(async () => {
      pending.get(key(filter, cursor))?.resolve(p);
    });
  const fail = (filter: string, cursor: string | undefined, e: unknown) =>
    act(async () => {
      pending.get(key(filter, cursor))?.reject(e);
    });
  return { fetchPage, reply, fail };
}

/** Cho microtask chạy (hook gọi fetchPage/load qua Promise.resolve().then). */
const flush = () => act(async () => {});

function mountPaged(s: ReturnType<typeof server>) {
  return renderHook(({ f }) => usePaged((cursor) => s.fetchPage(f, cursor), [f]), { initialProps: { f: "a" } });
}

describe("usePaged", () => {
  it("nối trang đúng khi deps không đổi, hasMore theo next_cursor", async () => {
    const s = server();
    const { result } = mountPaged(s);
    await flush();
    await s.reply("a", undefined, page(["a1"], "c1"));
    expect(result.current.rows).toEqual(["a1"]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loading).toBe(false);

    act(() => result.current.more());
    await flush();
    expect(s.fetchPage).toHaveBeenLastCalledWith("a", "c1");
    await s.reply("a", "c1", page(["a2"], "c2"));
    expect(result.current.rows).toEqual(["a1", "a2"]);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.more());
    await flush();
    await s.reply("a", "c2", page(["a3"], null));
    expect(result.current.rows).toEqual(["a1", "a2", "a3"]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("bấm Tải thêm rồi đổi bộ lọc, trang cũ về sau: không nối vào danh sách mới", async () => {
    const s = server();
    const { result, rerender } = mountPaged(s);
    await flush();
    await s.reply("a", undefined, page(["a1"], "c1"));
    act(() => result.current.more());
    await flush();

    rerender({ f: "b" });
    await flush();
    expect(s.fetchPage).toHaveBeenLastCalledWith("b", undefined);
    await s.reply("b", undefined, page(["b1"], null));
    expect(result.current.rows).toEqual(["b1"]);
    expect(result.current.hasMore).toBe(false);

    await s.reply("a", "c1", page(["a2"], "c2"));
    expect(result.current.rows).toEqual(["b1"]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("trang cũ về trước trang mới: loading không tắt sớm, không gọi more với con trỏ cũ", async () => {
    const s = server();
    const { result, rerender } = mountPaged(s);
    await flush();
    await s.reply("a", undefined, page(["a1"], "c1"));
    act(() => result.current.more());
    await flush();
    rerender({ f: "b" });
    await flush();
    expect(s.fetchPage).toHaveBeenCalledTimes(3);

    await s.reply("a", "c1", page(["a2"], "c2"));
    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual(["a1"]);
    act(() => result.current.more());
    await flush();
    expect(s.fetchPage).toHaveBeenCalledTimes(3);

    await s.reply("b", undefined, page(["b1"], "d1"));
    expect(result.current.rows).toEqual(["b1"]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loading).toBe(false);
    act(() => result.current.more());
    await flush();
    expect(s.fetchPage).toHaveBeenLastCalledWith("b", "d1");
  });

  it("trang cũ báo lỗi sau khi đổi bộ lọc: không hiện lỗi của bộ lọc cũ", async () => {
    const s = server();
    const { result, rerender } = mountPaged(s);
    await flush();
    await s.reply("a", undefined, page(["a1"], "c1"));
    act(() => result.current.more());
    await flush();
    rerender({ f: "b" });
    await flush();
    await s.reply("b", undefined, page(["b1"], null));

    await s.fail("a", "c1", new ApiError(500, "internal"));
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual(["b1"]);
    expect(result.current.loading).toBe(false);
  });

  it("more() bấm đúp (hai lần liên tiếp): chỉ gọi fetchPage một lần", async () => {
    const s = server();
    const { result } = mountPaged(s);
    await flush();
    await s.reply("a", undefined, page(["a1"], "c1"));
    act(() => result.current.more());
    act(() => result.current.more());
    await flush();
    expect(s.fetchPage.mock.calls.filter(([, cursor]) => cursor === "c1")).toHaveLength(1);
  });

  it("fetchPage ném lỗi đồng bộ: thành ApiError, không sập", async () => {
    const { result } = renderHook(() =>
      usePaged<string>(() => {
        throw new Error("boom");
      }, []),
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.loading).toBe(false);
    expect(result.current.rows).toEqual([]);
  });

  it("more() mà fetchPage ném lỗi đồng bộ: thành ApiError, loading tắt", async () => {
    let calls = 0;
    const { result } = renderHook(() =>
      usePaged<string>((cursor) => {
        calls++;
        if (cursor) throw new Error("boom");
        return Promise.resolve(page(["a1"], "c1"));
      }, []),
    );
    await flush();
    act(() => result.current.more());
    await flush();
    expect(calls).toBe(2);
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.loading).toBe(false);
  });
});

describe("useLoad", () => {
  function mountLoad() {
    const pending = new Map<number, Deferred<string>>();
    const load = vi.fn((id: number) => {
      const d = deferred<string>();
      pending.set(id, d);
      return d.promise;
    });
    const hook = renderHook(({ id }) => useLoad(() => load(id), [id]), { initialProps: { id: 1 } });
    const reply = (id: number, v: string) =>
      act(async () => {
        pending.get(id)?.resolve(v);
      });
    return { ...hook, load, reply };
  }

  it("bỏ kết quả của lần gọi cũ khi deps đổi (cũ về sau)", async () => {
    const { result, rerender, reply } = mountLoad();
    await flush();
    rerender({ id: 2 });
    await flush();
    await reply(2, "hai");
    expect(result.current.data).toBe("hai");
    await reply(1, "một");
    expect(result.current.data).toBe("hai");
    expect(result.current.loading).toBe(false);
  });

  it("bỏ kết quả của lần gọi cũ khi deps đổi (cũ về trước)", async () => {
    const { result, rerender, reply } = mountLoad();
    await flush();
    rerender({ id: 2 });
    await flush();
    await reply(1, "một");
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await reply(2, "hai");
    expect(result.current.data).toBe("hai");
    expect(result.current.loading).toBe(false);
  });

  it("load ném lỗi đồng bộ: error được đặt (ApiError), không sập", async () => {
    const { result } = renderHook(() =>
      useLoad<string>(() => {
        throw new Error("boom");
      }, []),
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
