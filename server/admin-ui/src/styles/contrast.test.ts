// Tương phản WCAG 2.2 AA của các cặp màu chính (spec giao diện mới, mục 2): đọc thẳng tokens.css, tính bằng công thức độ
// sáng tương đối, ở cả chế độ sáng và tối. Đổi màu mà làm tụt dưới ngưỡng thì test này hỏng.
//   Chữ thường: ≥ 4,5:1. Thành phần giao diện và biểu tượng (vòng focus, viền ô nhập, cột biểu đồ): ≥ 3:1.
import { describe, expect, it } from "vitest";
// ?raw: Vite đọc tệp thành chuỗi (không cần kiểu của Node).
import css from "./tokens.css?raw";

/** Các biến màu dạng #rrggbb trong một khối CSS. */
function hexTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1] as string] = m[2] as string;
  return out;
}

const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
const light = hexTokens(css.slice(0, darkAt));
// Chế độ tối chỉ ghi đè một phần: thiếu thì dùng giá trị sáng (đúng như trình duyệt áp dụng).
const dark = { ...light, ...hexTokens(css.slice(darkAt)) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg", "surface", "surface-2", "surface-3", "sidebar", "topbar"];

/** [chữ hay phần tử, nền, ngưỡng] */
const PAIRS: [string, string, number][] = [
  // Mực trên mọi bề mặt
  ...["ink", "ink-2", "ink-3"].flatMap((fg) => SURFACES.map((bg): [string, string, number] => [fg, bg, 4.5])),
  // Link và mục thanh bên đang chọn
  ...["surface", "bg", "surface-2", "sidebar", "brand-soft"].map((bg): [string, string, number] => ["brand-ink", bg, 4.5]),
  ["brand-hover", "surface", 4.5],
  ["brand-hover", "bg", 4.5],
  // Nút chính, nút nguy hiểm nền đặc, avatar
  ["on-brand", "brand", 4.5],
  ["on-brand", "brand-hover", 4.5],
  ["on-bad", "bad-solid", 4.5],
  ["on-bad", "bad-solid-hover", 4.5],
  ["bad-solid", "surface", 3],
  // Chữ đỏ khi rê chuột (link cần chú ý ở Tổng quan)
  ["bad-hover", "surface", 4.5],
  // Huy hiệu, thông báo, số đếm: chữ ngữ nghĩa trên nền -soft và trên bề mặt (nút viền nguy hiểm)
  ...["ok", "warn", "bad", "info", "neutral"].flatMap((t): [string, string, number][] => [
    [t, `${t}-soft`, 4.5],
    [t, "surface", 4.5],
  ]),
  ["bad", "bg", 4.5],
  // Tooltip của thanh bên thu gọn: chữ màu --surface trên nền --ink
  ["surface", "ink", 4.5],
  // Thành phần giao diện (3:1): vòng focus, viền ô nhập, biểu tượng thương hiệu, cột biểu đồ
  ...["bg", "surface", "surface-2", "sidebar", "brand-soft"].map((bg): [string, string, number] => ["focus", bg, 3]),
  ["line-input", "surface", 3],
  ["line-input", "bg", 3],
  ["brand", "surface", 3],
  ["brand", "bg", 3],
  ["brand", "brand-soft", 3],
  ["accent", "surface", 3],
  ...["chart-1", "chart-2", "chart-3", "chart-4"].map((c): [string, string, number] => [c, "surface", 3]),

  // ---------- Pha 2: thành phần dùng chung ----------
  // Nút khóa (mọi kiểu): chữ --ink-3 trên nền --surface-3 phẳng, vẫn đọc được. Nút rê chuột: chữ mực trên --surface-2,
  // --surface-3 (ghost); nút nguy hiểm viền khi rê chuột: --bad trên --bad-soft (đã có ở trên).
  ["ink-3", "surface-3", 4.5],
  ["ink", "surface-2", 4.5],
  ["ink-2", "surface-3", 4.5],
  // Lựa chọn đang bật của SegmentedControl ở chế độ tối nằm trên --line-strong
  ["ink", "line-strong", 4.5],
  // Notice, ErrorBox, lỗi trong hộp thoại: chữ mực trên nền nhạt của từng tông; dòng phụ --ink-2
  ...["ok-soft", "info-soft", "warn-soft", "bad-soft"].flatMap((bg): [string, string, number][] => [
    ["ink", bg, 4.5],
    ["ink-2", bg, 4.5],
  ]),
  // Chip bộ lọc: tên --ink-2, giá trị --brand-ink trên --brand-soft; nút X khi rê chuột: --ink trên --brand-soft-2
  ["ink-2", "brand-soft", 4.5],
  ["ink", "brand-soft-2", 4.5],
  // Ô biểu tượng (Card, Stat, EmptyState, đầu hộp thoại): nét biểu tượng trên nền nhạt cùng tông, ≥ 3:1
  ["brand", "brand-soft", 3],
  ["ok", "ok-soft", 3],
  ["warn", "warn-soft", 3],
  ["bad", "bad-soft", 3],
  ["ink-3", "surface-3", 3],
  // Toast (bề mặt đảo màu): chữ và nút đóng, biểu tượng thành công
  ["on-inverse", "inverse", 4.5],
  ["on-inverse-2", "inverse", 4.5],
  ["inverse-ok", "inverse", 3],
  // Chấm của Timeline (vòng nét trên nền thẻ), cột biểu đồ trên nền thẻ phụ (bảng số, tooltip)
  ...["ink-3", "ok", "warn", "bad", "brand"].map((c): [string, string, number] => [c, "surface", 3]),
  ...["chart-1", "chart-2", "chart-3", "chart-4"].map((c): [string, string, number] => [c, "surface-2", 3]),

  // ---------- Pha 3: Việc cần xử lý, Tổng quan, Hệ thống ----------
  // Dòng việc khi rê chuột hay có focus (nền --surface-2): số còn thiếu (--warn), trạng thái email (--bad), giờ (--ink-2)
  ["warn", "surface-2", 4.5],
  ["bad", "surface-2", 4.5],
  // Chấm số lượng cạnh tiêu đề nhóm: đã có (--bad trên --bad-soft, --warn trên --warn-soft)
  // Thanh tỷ lệ (phễu dùng thử, đơn theo trạng thái): phần đầy trên rãnh --surface-3, ≥ 3:1
  ...["chart-1", "ok", "warn", "bad", "brand", "ink-3"].map((c): [string, string, number] => [c, "surface-3", 3]),
  // Chấm trạng thái đơn và biểu tượng chú thích ở đầu trang (--info trên nền trang)
  ...["ok", "warn", "bad", "brand", "neutral"].map((c): [string, string, number] => [c, "surface", 3]),
  ["info", "bg", 3],
  // Ô biểu tượng của dòng chỉ số tông thông tin
  ["info", "info-soft", 3],
  // Khung kênh phát hành (nền --surface-2): chữ của chip và ghi chú trên --surface, nhãn --ink-3 trên --surface-2
  ["ink-3", "surface-2", 4.5],
];

describe("tương phản token màu (WCAG AA)", () => {
  it("tính đúng trên cặp mẫu: đen trên trắng 21:1, trắng trên trắng 1:1", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
  });

  for (const [mode, tokens] of [
    ["sáng", light],
    ["tối", dark],
  ] as const) {
    it(`chế độ ${mode}: đọc được đủ token`, () => {
      for (const [fg, bg] of PAIRS) {
        expect(tokens[fg], `thiếu --${fg}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(tokens[bg], `thiếu --${bg}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it.each(PAIRS)(`chế độ ${mode}: --%s trên --%s đạt %s:1`, (fg, bg, min) => {
      const ratio = contrast(tokens[fg] as string, tokens[bg] as string);
      expect(ratio, `--${fg} ${tokens[fg]} trên --${bg} ${tokens[bg]}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
    });
  }
});
