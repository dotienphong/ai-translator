import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MaskedKey } from "./MaskedKey";

const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

describe("MaskedKey", () => {
  it("che mặc định, bấm Hiện mới thấy key đầy đủ, bấm Ẩn thì che lại", async () => {
    const user = userEvent.setup();
    render(<MaskedKey value={KEY} />);
    expect(screen.getByText("K7Q2-…-9XMB")).toBeTruthy();
    expect(screen.queryByText(KEY)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hiện" }));
    expect(screen.getByText(KEY)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ẩn" }));
    expect(screen.queryByText(KEY)).toBeNull();
  });
});
