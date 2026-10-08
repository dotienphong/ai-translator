// Bảng màu biểu đồ (--chart-1 … --chart-4 trong tokens.css) theo phương pháp của kỹ năng dataviz (scripts/validate_palette.js):
// dải độ sáng OKLCH theo chế độ, độ bão hòa tối thiểu, hai chuỗi kề nhau phân biệt được với mắt thường (ΔE OKLab×100 ≥ 15)
// và khi mù màu đỏ (protan) hay lục (deutan) mô phỏng theo Machado 2009 mức 1,0 (ΔE ≥ 8). Thứ tự chuỗi cố định nên chỉ
// cần cặp kề nhau (cột chồng, cột cạnh nhau). Tương phản ≥ 3:1 với nền nằm ở contrast.test.ts.
import { describe, expect, it } from "vitest";
import css from "./tokens.css?raw";

function hexTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1] as string] = m[2] as string;
  return out;
}
const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
const light = hexTokens(css.slice(0, darkAt));
const dark = { ...light, ...hexTokens(css.slice(darkAt)) };

type Vec = [number, number, number];
const s2lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (hex: string): Vec => [1, 3, 5].map((i) => s2lin(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as Vec;

function oklab([r, g, b]: Vec): Vec {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const MACHADO: Record<"protan" | "deutan", [Vec, Vec, Vec]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

function simulate(hex: string, kind: keyof typeof MACHADO): Vec {
  const [r, g, b] = lin(hex);
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  return MACHADO[kind].map((row) => clamp(row[0] * r + row[1] * g + row[2] * b)) as Vec;
}

function deltaE(a: string, b: string, kind?: keyof typeof MACHADO): number {
  const x = oklab(kind ? simulate(a, kind) : lin(a));
  const y = oklab(kind ? simulate(b, kind) : lin(b));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const SERIES = ["chart-1", "chart-2", "chart-3", "chart-4"];
const BAND = { sáng: [0.43, 0.77], tối: [0.48, 0.67] } as const;

describe("bảng màu biểu đồ (dataviz)", () => {
  it("tính đúng trên cặp mẫu: cùng màu ΔE 0; đen và trắng ΔE 100", () => {
    expect(deltaE("#1d63c9", "#1d63c9")).toBe(0);
    expect(deltaE("#000000", "#ffffff")).toBeCloseTo(100, 0);
  });

  for (const [mode, tokens] of [
    ["sáng", light],
    ["tối", dark],
  ] as const) {
    const colors = SERIES.map((k) => tokens[k] as string);

    it(`chế độ ${mode}: độ sáng trong dải, độ bão hòa ≥ 0,10`, () => {
      const [lo, hi] = BAND[mode];
      for (const c of colors) {
        const [L, a, b] = oklab(lin(c));
        expect(L, `${c} L=${L.toFixed(3)}`).toBeGreaterThanOrEqual(lo);
        expect(L, `${c} L=${L.toFixed(3)}`).toBeLessThanOrEqual(hi);
        expect(Math.hypot(a, b), `${c} C`).toBeGreaterThanOrEqual(0.1);
      }
    });

    it.each(colors.slice(1).map((c, i) => [colors[i] as string, c]))(`chế độ ${mode}: %s và %s phân biệt được (mắt thường ≥ 15, mù màu ≥ 8)`, (a, b) => {
      expect(deltaE(a, b), "mắt thường").toBeGreaterThanOrEqual(15);
      expect(Math.min(deltaE(a, b, "protan"), deltaE(a, b, "deutan")), "protan/deutan").toBeGreaterThanOrEqual(8);
    });
  }
});
