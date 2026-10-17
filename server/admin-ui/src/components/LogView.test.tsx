import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { countLines, LogView } from "./LogView";

const pwned = () => (window as unknown as { __pwned?: number }).__pwned;

describe("countLines", () => {
  it.each([
    ["", 0],
    ["một dòng", 1],
    ["một dòng\n", 1],
    ["a\nb", 2],
    ["a\nb\n", 2],
    ["a\n\nb\n", 3],
  ])("%j có %i dòng (dấu xuống dòng cuối không tạo dòng trống)", (text, n) => {
    expect(countLines(text)).toBe(n);
  });
});

describe("LogView", () => {
  it("hiện log trong <pre> có tên, cuộn được bằng bàn phím, kèm số dòng và dung lượng", () => {
    render(<LogView label="Log ứng dụng (app.log)" text={"dòng 1\ndòng 2\n"} />);
    const region = screen.getByRole("region", { name: "Log ứng dụng (app.log)" });
    expect(region.tagName).toBe("PRE");
    expect(region.tabIndex).toBe(0);
    expect(region.textContent).toBe("dòng 1\ndòng 2\n");
    expect(screen.getByText(/^2 dòng · /)).toBeTruthy();
  });

  it("log chứa HTML và script: hiện thành chữ, không dựng phần tử nào, không chạy gì", () => {
    const evil = '<img src=x onerror="window.__pwned = 1">\n<script>window.__pwned = 2</script>\n<b>đậm</b>';
    const { container } = render(<LogView label="Log" text={evil} />);
    expect(container.querySelector("img, script, b")).toBeNull();
    expect(screen.getByRole("region", { name: "Log" }).textContent).toBe(evil);
    expect(pwned()).toBeUndefined();
  });

  it("log rỗng: trạng thái trống có chú thích, không có <pre>", () => {
    const { container } = render(<LogView label="Log" text="" emptyHint="Báo cáo không kèm log này." />);
    expect(screen.getByText("Log trống")).toBeTruthy();
    expect(screen.getByText("Báo cáo không kèm log này.")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
  });
});
