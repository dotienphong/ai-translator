// Test của các thành phần dữ liệu và điều khiển: CopyButton (thêm cho MaskedKey.test), KeyValue, Timeline, FilterBar,
// SegmentedControl, ô nhập có nhãn.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton, copyText } from "./CopyButton";
import { DateInput, Field, SearchInput, Select } from "./Field";
import { FilterBar } from "./FilterBar";
import { KeyValue } from "./KeyValue";
import { SegmentedControl } from "./SegmentedControl";
import { Timeline } from "./Timeline";

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined });
}

describe("CopyButton", () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("chép đúng chuỗi được truyền; báo cho trình đọc màn hình qua vùng status", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    render(<CopyButton text="K7Q2-…-9XMB" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Chép" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith("K7Q2-…-9XMB");
    expect(status.textContent).toBe("Đã chép vào bộ nhớ tạm");
  });

  it("kiểu icon: tên gồm thứ được chép, đổi thành Đã chép; không có chữ hiện", async () => {
    stubClipboard(async () => {});
    render(<CopyButton text="a@b.c" appearance="icon" what="email" />);
    const b = screen.getByRole("button", { name: "Chép email" });
    expect(b.textContent).toBe("");
    fireEvent.click(b);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Đã chép" })).toBeTruthy();
  });

  it("Clipboard API bị từ chối: thử cách cũ (execCommand) và báo Đã chép nếu được", async () => {
    stubClipboard(async () => {
      throw new Error("NotAllowed");
    });
    let copied = "";
    const exec = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement | null)?.value ?? "";
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    render(<CopyButton text="xyz" />);
    const b = screen.getByRole("button", { name: "Chép" });
    b.focus();
    fireEvent.click(b);
    await act(async () => {});
    expect(exec).toHaveBeenCalledWith("copy");
    expect(copied).toBe("xyz");
    expect(screen.getByRole("button", { name: "Đã chép" })).toBeTruthy();
    // Ô tạm đã gỡ, focus trả về nút.
    expect(document.querySelector(".copy-buffer")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đã chép" }));
  });

  it("không có Clipboard API, execCommand trả false: Không chép được, báo cách chép tay", async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    render(<CopyButton text="xyz" />);
    fireEvent.click(screen.getByRole("button", { name: "Chép" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Không chép được" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Không chép được, hãy chọn và chép tay");
  });

  it("copyText: trả true khi Clipboard API chép được", async () => {
    stubClipboard(async () => {});
    expect(await copyText("a")).toBe(true);
  });
});

describe("KeyValue", () => {
  it("là danh sách mô tả: mỗi dòng một cặp dt/dd; giá trị rỗng thành —; dòng ẩn bị bỏ", () => {
    const { container } = render(
      <KeyValue
        items={[
          { label: "Email", value: "khach@example.com" },
          { label: "Tên máy", value: null },
          { label: "Ẩn", value: "x", hidden: true },
        ]}
      />,
    );
    const dts = [...container.querySelectorAll("dl > div > dt")].map((e) => e.textContent);
    const dds = [...container.querySelectorAll("dl > div > dd")].map((e) => e.textContent);
    expect(dts).toEqual(["Email", "Tên máy"]);
    expect(dds).toEqual(["khach@example.com", "—"]);
  });

  it("copy: nút chép (tên theo nhãn) chép đúng giá trị truyền vào; giá trị rỗng thì không có nút", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    render(
      <KeyValue
        items={[
          { label: "License id", value: "0b9e…5a69", copy: "0b9e7c1e-full", mono: true },
          { label: "Email", value: null, copy: "không-chép" },
        ]}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Chép license id" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith("0b9e7c1e-full");
    expect(screen.getByText("0b9e…5a69").className).toBe("mono");
  });

  it("huy hiệu và dòng phụ nằm trong ô giá trị", () => {
    const { container } = render(<KeyValue items={[{ label: "Hết hạn", value: "08/10/2027", hint: "còn 365 ngày", badge: <span className="badge">Còn hạn</span> }]} />);
    const dd = container.querySelector("dd");
    expect(dd?.querySelector(".badge")?.textContent).toBe("Còn hạn");
    expect(dd?.querySelector(".kv-hint")?.textContent).toBe("còn 365 ngày");
  });
});

describe("Timeline", () => {
  const items = [
    { key: "1", day: "08/10/2026", time: "14:01", actor: "admin", action: "license_extended", detail: "days: 30" },
    { key: "2", day: "08/10/2026", time: "13:01", actor: "api", action: "license_activated", tone: "warn" as const },
    { key: "3", day: "07/10/2026", time: "14:03", actor: "webhook", action: "license_issued", links: <a href="/orders/1">Đơn #1</a> },
  ];

  it("danh sách có thứ tự có tên; mỗi mốc một mục; tiêu đề ngày chỉ hiện khi đổi ngày và ẩn với trình đọc màn hình", () => {
    const { container } = render(<Timeline items={items} label="Nhật ký" />);
    expect(screen.getByRole("list", { name: "Nhật ký" }).tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const days = [...container.querySelectorAll(".tl-day")];
    expect(days.map((d) => d.textContent)).toEqual(["08/10/2026", "07/10/2026"]);
    expect(days.every((d) => d.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("mỗi mốc: giờ (kèm ngày cho trình đọc màn hình), mã hành động mono, tác nhân, chi tiết, liên kết, tông", () => {
    const { container } = render(<Timeline items={items} />);
    const first = container.querySelector(".tl-item") as HTMLElement;
    expect(first.querySelector("time")?.textContent).toBe("08/10/2026 14:01");
    expect(first.querySelector("code.tl-action")?.textContent).toBe("license_extended");
    expect(first.querySelector(".tl-actor")?.textContent).toBe("admin");
    expect(first.querySelector(".tl-detail")?.textContent).toBe("days: 30");
    expect(container.querySelectorAll(".tl-item")[1]?.className).toBe("tl-item tone-warn");
    expect(screen.getByRole("link", { name: "Đơn #1" })).toBeTruthy();
  });
});

describe("FilterBar", () => {
  it("nhóm có tên; ô lọc, hành động, dòng đếm (aria-live)", () => {
    render(
      <FilterBar count="12 đơn" actions={<button type="button">Cấp license mới…</button>}>
        <Select label="Gói" value="" options={[["", "Tất cả"]]} onChange={() => {}} />
      </FilterBar>,
    );
    const bar = screen.getByRole("group", { name: "Bộ lọc" });
    expect(bar.querySelector(".filterbar-count")?.textContent).toBe("12 đơn");
    expect(bar.querySelector(".filterbar-count")?.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByLabelText("Gói")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cấp license mới…" })).toBeTruthy();
  });

  it("chip cho bộ lọc đang bật: bấm X bỏ từng cái; từ hai chip có Xóa lọc", async () => {
    const user = userEvent.setup();
    const removeStatus = vi.fn();
    const removePlan = vi.fn();
    const clear = vi.fn();
    const chips = [
      { key: "status", name: "Trạng thái", value: "Đã trả", onRemove: removeStatus },
      { key: "plan", name: "Gói", value: "Yearly", onRemove: removePlan },
    ];
    const { rerender } = render(
      <FilterBar chips={chips} onClear={clear}>
        <span />
      </FilterBar>,
    );
    const list = screen.getByRole("list", { name: "Bộ lọc đang bật" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Trạng thái: Đã trả", "Gói: Yearly"]);
    await user.click(screen.getByRole("button", { name: "Bỏ lọc Trạng thái: Đã trả" }));
    expect(removeStatus).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Xóa lọc" }));
    expect(clear).toHaveBeenCalledTimes(1);
    rerender(
      <FilterBar chips={chips.slice(1)} onClear={clear}>
        <span />
      </FilterBar>,
    );
    expect(screen.queryByRole("button", { name: "Xóa lọc" })).toBeNull();
  });

  it("không chip, không đếm: không có hàng phụ", () => {
    const { container } = render(
      <FilterBar>
        <span />
      </FilterBar>,
    );
    expect(container.querySelector(".filterbar-meta")).toBeNull();
  });

  it("onSubmit: thanh là form, Enter gửi form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <FilterBar onSubmit={onSubmit} label="Lọc nhật ký">
        <label>
          Việc
          <input />
        </label>
      </FilterBar>,
    );
    expect(screen.getByRole("form", { name: "Lọc nhật ký" })).toBeTruthy();
    await user.type(screen.getByLabelText("Việc"), "abc{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "table", label: "Bảng" },
    { value: "timeline", label: "Dòng thời gian" },
    { value: "raw", label: "JSON" },
  ] as const;

  function setup(value: "table" | "timeline" | "raw" = "table") {
    const onChange = vi.fn();
    render(<SegmentedControl label="Cách xem" value={value} options={options} onChange={onChange} />);
    return onChange;
  }

  it("radiogroup có tên; lựa chọn đang bật là radio checked và là điểm dừng Tab duy nhất", () => {
    setup("timeline");
    expect(screen.getByRole("radiogroup", { name: "Cách xem" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("bấm chọn; mũi tên phải/trái vòng quanh, Home, End", async () => {
    const user = userEvent.setup();
    const onChange = setup("table");
    await user.click(screen.getByRole("radio", { name: "JSON" }));
    expect(onChange).toHaveBeenLastCalledWith("raw");
    screen.getByRole("radio", { name: "Bảng" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("timeline");
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("raw");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("raw");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("table");
  });
});

describe("Ô nhập có nhãn", () => {
  it("Select và DateInput gắn nhãn; DateInput invalid thành aria-invalid", () => {
    const onChange = vi.fn();
    render(
      <>
        <Select label="Gói" value="yearly" options={[["", "Tất cả"], ["yearly", "Yearly"]]} onChange={onChange} />
        <DateInput label="Đến ngày" value="2026-10-01" onChange={() => {}} invalid />
      </>,
    );
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByLabelText("Đến ngày").getAttribute("aria-invalid")).toBe("true");
  });

  it("SearchInput: nhãn (có thể ẩn), nút xóa chỉ khi có chữ", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput label="Tìm đơn" value="" onChange={onChange} hideLabel />);
    expect(screen.getByLabelText("Tìm đơn").getAttribute("type")).toBe("search");
    expect(screen.queryByRole("button", { name: "Xóa chữ đã gõ" })).toBeNull();
    rerender(<SearchInput label="Tìm đơn" value="abc" onChange={onChange} hideLabel />);
    await user.click(screen.getByRole("button", { name: "Xóa chữ đã gõ" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("Field: lỗi thay gợi ý, là alert", () => {
    const { rerender } = render(
      <Field label="Email" hint="Email của khách">
        <input />
      </Field>,
    );
    expect(screen.getByText("Email của khách")).toBeTruthy();
    rerender(
      <Field label="Email" hint="Email của khách" error="Email không hợp lệ">
        <input />
      </Field>,
    );
    expect(screen.queryByText("Email của khách")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Email không hợp lệ");
    expect(screen.getByLabelText(/Email/)).toBeTruthy();
  });
});
