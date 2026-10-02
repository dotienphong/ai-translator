import { describe, expect, it } from "vitest";
import { afterListenTestStart, playSample } from "./listenTest";

describe("bước Nghe thử", () => {
  it("phiên chạy thì phát câu mẫu; đã rời bước thì dừng phiên; phiên không chạy thì không làm gì", () => {
    expect(afterListenTestStart(true, false)).toBe("play");
    expect(afterListenTestStart(true, true)).toBe("stop");
    expect(afterListenTestStart(false, true)).toBe("none");
    expect(afterListenTestStart(false, false)).toBe("none");
  });

  it("phát được thì báo true; play() bị từ chối thì báo false để bước dừng phiên (N-1 của review cuối 03)", async () => {
    expect(await playSample({ play: () => Promise.resolve() })).toBe(true);
    expect(await playSample({ play: () => Promise.reject(new DOMException("blocked", "NotAllowedError")) })).toBe(false);
    expect(
      await playSample({
        play: () => {
          throw new Error("không giải mã được");
        },
      }),
    ).toBe(false);
  });
});
