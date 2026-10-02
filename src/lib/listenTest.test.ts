import { describe, expect, it } from "vitest";
import { afterListenTestStart } from "./listenTest";

describe("bước Nghe thử", () => {
  it("phiên chạy thì phát câu mẫu; đã rời bước thì dừng phiên; phiên không chạy thì không làm gì", () => {
    expect(afterListenTestStart(true, false)).toBe("play");
    expect(afterListenTestStart(true, true)).toBe("stop");
    expect(afterListenTestStart(false, true)).toBe("none");
    expect(afterListenTestStart(false, false)).toBe("none");
  });
});
