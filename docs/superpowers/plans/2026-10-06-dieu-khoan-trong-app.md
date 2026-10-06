# Điều khoản và chính sách trong app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App đóng gói EULA và chính sách quyền riêng tư (`docs/legal/*.md`, đã là bản chính thức 1.0) và hiển thị chúng: bước "Điều khoản" bắt buộc ở onboarding, thẻ ở màn hình Giới thiệu, mục gập ở màn hình mua.

**Architecture:** Hai module logic thuần có test (`markdown.ts`, `legal.ts`, `onboardingSteps.ts`), một component React (`LegalDocument.tsx`) dựng phần tử từ khối Markdown đã phân tích, rồi nối vào ba màn hình. Không thêm thư viện, không đụng Rust hay server.

**Tech Stack:** TypeScript, React 19, Vite (`import.meta.glob ?raw`), vitest (môi trường Node, chỉ test logic thuần, `include: src/**/*.test.ts`).

Spec: `docs/superpowers/specs/2026-10-06-legal-in-app-design.md`. Task 0 (văn bản chính thức, README, spec) **đã làm** ở commit `180c639`. Lệnh chạy từ gốc repo. Không push.

## Cấu trúc file

| File | Thay đổi | Task |
|---|---|---|
| `src/lib/markdown.ts`, `src/lib/markdown.test.ts` | Tạo: bộ phân tích Markdown nhỏ | 1 |
| `src/lib/legal.ts`, `src/lib/legal.test.ts` | Tạo: chọn và tải văn bản theo loại và ngôn ngữ | 2 |
| `src/lib/onboardingSteps.ts`, `src/lib/onboardingSteps.test.ts` | Tạo: danh sách bước (thêm "terms") và `canAdvance` | 3 |
| `src/store/app.ts`, `src/store/app.test.ts` | Thêm `termsAccepted`, `setTermsAccepted` | 3 |
| `src/windows/main/LegalDocument.tsx` | Tạo: `LegalDocument`, `LegalDetails` | 4 |
| `src/windows/main/onboarding/Onboarding.tsx` | Dùng `onboardingSteps`, bước "terms", khóa nút Tiếp | 4 |
| `src/windows/main/screens/About.tsx`, `UpgradeScreen.tsx` | Thêm văn bản gập được | 4 |
| `src/i18n/vi.ts`, `src/i18n/en.ts`, `src/styles/main.css` | Chuỗi mới, kiểu bảng | 4 |
| `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | Ghi bước "Điều khoản" ở §4.1 | 5 |

---

### Task 1: Bộ phân tích Markdown (TDD)

**Files:** Create `src/lib/markdown.ts`, `src/lib/markdown.test.ts`

- [ ] **Step 1: Viết test lỗi.** Tạo `src/lib/markdown.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Block, parseInline, parseMarkdown } from "./markdown";

const t = (text: string) => ({ type: "text" as const, text });

describe("parseInline", () => {
  it("tách chữ thường, in đậm và mã", () => {
    expect(parseInline("a **b** c `d` e")).toEqual([
      t("a "),
      { type: "strong", text: "b" },
      t(" c "),
      { type: "code", text: "d" },
      t(" e"),
    ]);
  });
  it("dấu * hay ` lẻ loi vẫn là chữ thường", () => {
    expect(parseInline("2 * 3 và `x")).toEqual([t("2 * 3 và `x")]);
  });
});

describe("parseMarkdown", () => {
  it("tiêu đề ba cấp, đoạn nhiều dòng nối bằng dấu cách", () => {
    expect(parseMarkdown("# A\n\n## B\n### C\n\nmột\nhai\n")).toEqual([
      { type: "heading", level: 1, content: [t("A")] },
      { type: "heading", level: 2, content: [t("B")] },
      { type: "heading", level: 3, content: [t("C")] },
      { type: "paragraph", content: [t("một hai")] },
    ]);
  });

  it("danh sách gạch đầu dòng và danh sách đánh số, có dòng nối của một mục", () => {
    expect(parseMarkdown("- x\n- y\n  tiếp\n\n1. một\n2. hai")).toEqual([
      { type: "list", ordered: false, items: [[t("x")], [t("y"), t(" "), t("tiếp")]] },
      { type: "list", ordered: true, items: [[t("một")], [t("hai")]] },
    ]);
  });

  it("trích dẫn gộp các dòng liên tiếp", () => {
    expect(parseMarkdown("> một\n> hai")).toEqual([{ type: "quote", content: [t("một hai")] }]);
  });

  it("bảng: dòng tiêu đề, dòng kẻ, các dòng dữ liệu; ô có in đậm", () => {
    const blocks = parseMarkdown("| Gói | Giá |\n|---|---|\n| Free | **0 đ** |\n| Pro | 50 |\n\nsau bảng");
    expect(blocks).toEqual([
      {
        type: "table",
        header: [[t("Gói")], [t("Giá")]],
        rows: [
          [[t("Free")], [{ type: "strong", text: "0 đ" }]],
          [[t("Pro")], [t("50")]],
        ],
      },
      { type: "paragraph", content: [t("sau bảng")] },
    ]);
  });

  it("dòng có dấu | nhưng không có dòng kẻ ngay sau thì là đoạn thường, không treo vòng lặp", () => {
    expect(parseMarkdown("| lẻ loi |")).toEqual([{ type: "paragraph", content: [t("| lẻ loi |")] }]);
  });

  it("chấp nhận xuống dòng kiểu Windows và văn bản rỗng", () => {
    expect(parseMarkdown("# A\r\n\r\nb\r\n")).toHaveLength(2);
    expect(parseMarkdown("")).toEqual([]);
  });
});

const doc = (name: string) => readFileSync(new URL(`../../docs/legal/${name}`, import.meta.url), "utf8");

describe("bốn văn bản pháp lý thật", () => {
  const files: [string, number][] = [
    ["eula.vi.md", 15],
    ["eula.en.md", 15],
    ["privacy.vi.md", 10],
    ["privacy.en.md", 10],
  ];
  for (const [name, sections] of files) {
    it(`${name}: đủ mục, có bảng, không còn dấu Markdown thô, không còn dấu vết bản nháp`, () => {
      const text = doc(name);
      const blocks: Block[] = parseMarkdown(text);
      expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
      expect(blocks.filter((b) => b.type === "heading" && b.level === 2).length).toBeGreaterThanOrEqual(sections);
      expect(blocks.some((b) => b.type === "table")).toBe(true);
      const plain = JSON.stringify(blocks);
      expect(plain).not.toContain("**");
      expect(plain).not.toMatch(/"text":"#/);
      expect(text).not.toMatch(/BẢN NHÁP|DRAFT|\[ngày phát hành|\[date of|\[Địa chỉ|\[Contact|\[7\]/);
    });
  }
});
```

- [ ] **Step 2: Chạy, thấy đỏ.** Run: `pnpm exec vitest run src/lib/markdown.test.ts 2>&1 | tail -8`. Expected: FAIL (không tìm thấy `./markdown`).

- [ ] **Step 3: Cài đặt.** Tạo `src/lib/markdown.ts`:

```ts
// Bộ phân tích Markdown nhỏ cho EULA và chính sách quyền riêng tư (docs/legal/*.md; spec 2026-10-06 legal-in-app).
// Chỉ hỗ trợ tập cú pháp hai văn bản đó dùng: tiêu đề `#`–`###`, đoạn, danh sách `-` và `1.`, bảng, trích dẫn `>`,
// **in đậm** và `mã`. Không có HTML thô, liên kết hay ảnh: mọi thứ khác là chữ thường.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "quote"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/;
const HEADING = /^(#{1,3}) +(.+)$/;
const BULLET = /^- +(.*)$/;
const ORDERED = /^\d+\. +(.*)$/;
const QUOTE = /^> ?(.*)$/;
const TABLE_ROW = /^\|.*\|\s*$/;
const TABLE_RULE = /^\|[\s:|-]+\|\s*$/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  for (const part of source.split(INLINE)) {
    if (part === "") continue;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      out.push({ type: "strong", text: part.slice(2, -2) });
    } else if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      out.push({ type: "code", text: part.slice(1, -1) });
    } else {
      out.push({ type: "text", text: part });
    }
  }
  return out;
}

function cells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const at = (n: number) => lines[n] ?? "";
  const isTable = (n: number) => TABLE_ROW.test(at(n)) && TABLE_RULE.test(at(n + 1));
  const startsBlock = (n: number) =>
    HEADING.test(at(n)) || BULLET.test(at(n)) || ORDERED.test(at(n)) || QUOTE.test(at(n)) || isTable(n);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: (heading[1] ?? "#").length as 1 | 2 | 3, content: parseInline((heading[2] ?? "").trim()) });
      i++;
      continue;
    }
    if (isTable(i)) {
      const header = cells(line);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && TABLE_ROW.test(at(i))) {
        rows.push(cells(at(i)));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE.test(at(i))) {
        parts.push((QUOTE.exec(at(i))?.[1] ?? "").trim());
        i++;
      }
      blocks.push({ type: "quote", content: parseInline(parts.join(" ").trim()) });
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const marker = ordered ? ORDERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = marker.exec(at(i));
        if (m) {
          items.push(parseInline((m[1] ?? "").trim()));
          i++;
        } else if (/^ {2,}\S/.test(at(i)) && items.length > 0) {
          const last = items.pop() ?? [];
          items.push([...last, { type: "text", text: " " }, ...parseInline(at(i).trim())]);
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const parts: string[] = [line.trim()];
    i++;
    while (i < lines.length && at(i).trim() !== "" && !startsBlock(i)) {
      parts.push(at(i).trim());
      i++;
    }
    blocks.push({ type: "paragraph", content: parseInline(parts.join(" ")) });
  }
  return blocks;
}
```

- [ ] **Step 4: Chạy, thấy đạt.** Run: `pnpm exec vitest run src/lib/markdown.test.ts 2>&1 | tail -8; pnpm exec tsc --noEmit && echo TSC_OK`. Expected: mọi test đạt, gồm 4 văn bản thật; `TSC_OK`. Nếu một văn bản thật đỏ vì cú pháp ngoài tập hỗ trợ (ví dụ danh sách lồng nhau), **báo lại**, đừng nới test; sửa văn bản trong `docs/legal/` cho đúng tập cú pháp rồi báo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.test.ts
git commit -m "feat(app): bộ phân tích Markdown nhỏ cho văn bản pháp lý (tiêu đề, đoạn, danh sách, bảng, trích dẫn, in đậm, mã), test cả bốn văn bản thật

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chọn và tải văn bản theo ngôn ngữ (TDD)

**Files:** Create `src/lib/legal.ts`, `src/lib/legal.test.ts`

- [ ] **Step 1: Viết test lỗi.** Tạo `src/lib/legal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadLegal, type LegalLoaders, pickLegal } from "./legal";

const loaders: LegalLoaders = {
  "/docs/legal/eula.vi.md": async () => "EULA vi",
  "/docs/legal/eula.en.md": async () => "EULA en",
  "/docs/legal/privacy.vi.md": async () => "Privacy vi",
};

describe("pickLegal", () => {
  it("chọn đúng loại và ngôn ngữ", async () => {
    expect(await pickLegal(loaders, "eula", "en")?.()).toBe("EULA en");
    expect(await pickLegal(loaders, "privacy", "vi")?.()).toBe("Privacy vi");
  });
  it("thiếu bản ngôn ngữ đó thì dùng tiếng Việt", async () => {
    expect(await pickLegal(loaders, "privacy", "en")?.()).toBe("Privacy vi");
  });
  it("không có loại đó thì null", () => {
    expect(pickLegal({}, "eula", "vi")).toBeNull();
  });
});

describe("loadLegal", () => {
  it("văn bản rỗng hay tải lỗi thì null, không ném lỗi ra giao diện", async () => {
    await expect(loadLegal("eula", "vi", { "/docs/legal/eula.vi.md": async () => "  \n" })).resolves.toBeNull();
    await expect(
      loadLegal("eula", "vi", {
        "/docs/legal/eula.vi.md": async () => {
          throw new Error("hỏng");
        },
      }),
    ).resolves.toBeNull();
  });
  it("bốn file thật được đóng gói: đúng loại và đúng ngôn ngữ", async () => {
    expect(await loadLegal("eula", "vi")).toContain("Thỏa thuận cấp phép người dùng cuối");
    expect(await loadLegal("eula", "en")).toContain("End User License Agreement");
    expect(await loadLegal("privacy", "vi")).toContain("Chính sách quyền riêng tư");
    expect(await loadLegal("privacy", "en")).toContain("Privacy Policy");
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ.** `pnpm exec vitest run src/lib/legal.test.ts 2>&1 | tail -6`. Expected: FAIL (thiếu `./legal`).

- [ ] **Step 3: Cài đặt.** Tạo `src/lib/legal.ts`:

```ts
// Văn bản pháp lý đóng gói trong app (docs/legal/*.md; spec 2026-10-06 legal-in-app). Vite đóng mỗi file thành một
// chunk riêng, chỉ tải khi người dùng mở văn bản. Theo mẫu của notices.ts.
import type { UiLanguage } from "../i18n";

export type LegalKind = "eula" | "privacy";

/** Kết quả của `import.meta.glob(…, { query: "?raw", import: "default" })`: đường dẫn → hàm tải văn bản. */
export type LegalLoaders = Record<string, () => Promise<string>>;

const docs = import.meta.glob<string>("/docs/legal/{eula,privacy}.{vi,en}.md", { query: "?raw", import: "default" });

/** Hàm tải văn bản đúng loại và ngôn ngữ; thiếu bản ngôn ngữ đó thì dùng tiếng Việt (bản gốc); không có thì null. */
export function pickLegal(loaders: LegalLoaders, kind: LegalKind, lang: UiLanguage): (() => Promise<string>) | null {
  const find = (l: string) => Object.entries(loaders).find(([path]) => path.endsWith(`/${kind}.${l}.md`))?.[1];
  return find(lang) ?? find("vi") ?? null;
}

/** Văn bản, hoặc null khi không có (hay file rỗng, hay tải lỗi). */
export async function loadLegal(kind: LegalKind, lang: UiLanguage, loaders: LegalLoaders = docs): Promise<string | null> {
  const load = pickLegal(loaders, kind, lang);
  if (!load) return null;
  try {
    const text = await load();
    return text.trim() === "" ? null : text;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Chạy, thấy đạt.** `pnpm exec vitest run src/lib/legal.test.ts 2>&1 | tail -6; pnpm exec tsc --noEmit && echo TSC_OK`. Expected: đạt; `TSC_OK`. (Nếu `UiLanguage` không phải `"vi" | "en"`, hoặc `import.meta.glob` bị `tsc` từ chối, báo lại nguyên lỗi.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/legal.ts src/lib/legal.test.ts
git commit -m "feat(app): đóng gói và chọn văn bản pháp lý theo loại và ngôn ngữ giao diện, thiếu thì dùng tiếng Việt

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Danh sách bước onboarding và trạng thái đồng ý (TDD)

**Files:** Create `src/lib/onboardingSteps.ts`, `src/lib/onboardingSteps.test.ts`; Modify `src/store/app.ts`, `src/store/app.test.ts`

- [ ] **Step 1: Viết test lỗi.** Tạo `src/lib/onboardingSteps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canAdvance, stepsFor } from "./onboardingSteps";

describe("stepsFor", () => {
  it("macOS: bước Điều khoản ngay sau chọn ngôn ngữ, trước tải model", () => {
    expect(stepsFor("macos")).toEqual([
      "language", "terms", "model", "download", "permission", "languages", "test", "privacy", "tray",
    ]);
  });
  it("Windows: bỏ bước quyền ghi âm thanh hệ thống", () => {
    expect(stepsFor("windows")).not.toContain("permission");
    expect(stepsFor("windows")[1]).toBe("terms");
  });
});

describe("canAdvance", () => {
  it("chỉ bước Điều khoản bị khóa khi chưa đồng ý", () => {
    expect(canAdvance("terms", false)).toBe(false);
    expect(canAdvance("terms", true)).toBe(true);
    expect(canAdvance("language", false)).toBe(true);
    expect(canAdvance("tray", false)).toBe(true);
  });
});
```

Trong `src/store/app.test.ts`, theo cách các test khác của file này tạo store, thêm một test: trạng thái đầu `termsAccepted === false`; `setTermsAccepted(true)` đổi thành `true`, `setTermsAccepted(false)` đổi lại.

- [ ] **Step 2: Chạy, thấy đỏ.** `pnpm exec vitest run src/lib/onboardingSteps.test.ts src/store/app.test.ts 2>&1 | tail -10`. Expected: FAIL.

- [ ] **Step 3: Cài đặt.** Tạo `src/lib/onboardingSteps.ts` (chuyển `Step` và `stepsFor` ra khỏi `Onboarding.tsx`, thêm "terms" và `canAdvance`):

```ts
// Các bước lần đầu mở app (§4.1), tách khỏi Onboarding.tsx để test không cần DOM. "terms" (Điều khoản, spec 2026-10-06
// legal-in-app) đứng ngay sau chọn ngôn ngữ, để người dùng đồng ý trước khi tải model.
export type Step = "language" | "terms" | "model" | "download" | "permission" | "languages" | "test" | "privacy" | "tray";

export function stepsFor(platform: "macos" | "windows"): Step[] {
  const steps: Step[] = ["language", "terms", "model", "download", "permission", "languages", "test", "privacy", "tray"];
  return platform === "macos" ? steps : steps.filter((s) => s !== "permission");
}

/** Có cho bấm "Tiếp" ở bước này không: bước Điều khoản đòi đã tick đồng ý. */
export function canAdvance(step: Step, termsAccepted: boolean): boolean {
  return step !== "terms" || termsAccepted;
}
```

`src/store/app.ts`: trong interface trạng thái (cạnh `onboardingStep: number;`) thêm `termsAccepted: boolean;` và (cạnh `setOnboardingStep(step: number): void;`) thêm `setTermsAccepted(accepted: boolean): void;`; trạng thái đầu (cạnh `onboardingStep: 0,`) thêm `termsAccepted: false,`; cạnh `setOnboardingStep(onboardingStep) { set({ onboardingStep }); },` thêm:

```ts
      setTermsAccepted(termsAccepted) {
        set({ termsAccepted });
      },
```

(Chỉ lưu trong phiên onboarding, không ghi xuống đĩa: spec 2026-10-06 mục 3.)

- [ ] **Step 4: Chạy, thấy đạt.** `pnpm exec vitest run src/lib/onboardingSteps.test.ts src/store/app.test.ts 2>&1 | tail -6; pnpm exec tsc --noEmit 2>&1 | tail -5`. Expected: đạt. `tsc` sẽ báo `Onboarding.tsx` còn khai báo `Step` và `stepsFor` riêng (xung đột nếu import trùng) hay không: Task 4 sửa. Nếu `tsc` đỏ chỉ vì chuyện đó, tiếp tục; mọi lỗi khác thì báo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboardingSteps.ts src/lib/onboardingSteps.test.ts src/store/app.ts src/store/app.test.ts
git commit -m "feat(app): bước Điều khoản trong danh sách onboarding và trạng thái đồng ý (canAdvance)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Giao diện: component, chuỗi, và nối vào ba màn hình

**Files:** Create `src/windows/main/LegalDocument.tsx`; Modify `src/windows/main/onboarding/Onboarding.tsx`, `src/windows/main/screens/About.tsx`, `src/windows/main/screens/UpgradeScreen.tsx`, `src/i18n/vi.ts`, `src/i18n/en.ts`, `src/styles/main.css`

- [ ] **Step 1: Chuỗi i18n** (thêm vào cả hai file, cạnh các khóa cùng tiền tố; `src/i18n/i18n.test.ts` đòi vi và en cùng bộ khóa và hai giá trị khác nhau):

| Khóa | vi | en |
|---|---|---|
| `onboarding.terms.title` | `Điều khoản sử dụng` | `Terms of use` |
| `onboarding.terms.intro` | `Trước khi dùng AI Translator, hãy đọc Thỏa thuận cấp phép và Chính sách quyền riêng tư.` | `Before you use AI Translator, please read the License Agreement and the Privacy Policy.` |
| `onboarding.terms.accept` | `Tôi đã đọc và đồng ý với Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư.` | `I have read and agree to the End User License Agreement (EULA) and the Privacy Policy.` |
| `legal.eula` | `Thỏa thuận cấp phép (EULA)` | `License Agreement (EULA)` |
| `legal.privacy` | `Chính sách quyền riêng tư` | `Privacy Policy` |
| `legal.loading` | `Đang tải văn bản…` | `Loading the document…` |
| `legal.missing` | `Không tải được văn bản. Liên hệ support@aitranslator.io.vn.` | `Could not load the document. Contact support@aitranslator.io.vn.` |
| `about.legal` | `Điều khoản và quyền riêng tư` | `Terms and privacy` |

- [ ] **Step 2: Component.** Tạo `src/windows/main/LegalDocument.tsx`:

```tsx
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { type LegalKind, loadLegal } from "../../lib/legal";
import { type Block, type Inline, parseMarkdown } from "../../lib/markdown";
import { useApp, useT } from "./appStore";

function inline(parts: Inline[]): ReactNode {
  return parts.map((p, i) =>
    p.type === "strong" ? <strong key={i}>{p.text}</strong> : p.type === "code" ? <code key={i}>{p.text}</code> : <Fragment key={i}>{p.text}</Fragment>,
  );
}

// Tiêu đề của văn bản nằm dưới tiêu đề của trang: `#` là h3, `##` là h4, `###` là h5.
const HEADINGS = ["h3", "h4", "h5"] as const;

function block(b: Block, key: number): ReactNode {
  switch (b.type) {
    case "heading": {
      const Tag = HEADINGS[b.level - 1] ?? "h5";
      return <Tag key={key}>{inline(b.content)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{inline(b.content)}</p>;
    case "quote":
      return <blockquote key={key}>{inline(b.content)}</blockquote>;
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag key={key}>
          {b.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <table key={key}>
          <thead>
            <tr>
              {b.header.map((c, i) => (
                <th key={i}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

/** Một văn bản pháp lý theo ngôn ngữ giao diện. */
export function LegalDocument({ kind }: { kind: LegalKind }) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "vi");
  // undefined: đang tải; null: không có hay tải lỗi.
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setText(undefined);
    void loadLegal(kind, lang).then((value) => {
      if (alive) setText(value);
    });
    return () => {
      alive = false;
    };
  }, [kind, lang]);
  if (text === undefined) return <p className="hint">{t("legal.loading")}</p>;
  if (text === null) return <p className="hint">{t("legal.missing")}</p>;
  return (
    <div className="legal" tabIndex={0} aria-label={t(kind === "eula" ? "legal.eula" : "legal.privacy")}>
      {parseMarkdown(text).map(block)}
    </div>
  );
}

/** Văn bản gập được; chỉ tải khi mở lần đầu. */
export function LegalDetails({ kind }: { kind: LegalKind }) {
  const t = useT();
  const [opened, setOpened] = useState(false);
  return (
    <details onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>{t(kind === "eula" ? "legal.eula" : "legal.privacy")}</summary>
      {opened && <LegalDocument kind={kind} />}
    </details>
  );
}
```

(Nếu `tsc` than về kiểu của `onToggle` hay `e.currentTarget.open`, sửa tối thiểu, không đổi hành vi.)

- [ ] **Step 3: Kiểu.** Thêm vào cuối `src/styles/main.css`:

```css
/* Văn bản pháp lý (EULA, chính sách; LegalDocument.tsx). */
.legal {
  max-height: 45vh;
  overflow: auto;
  margin-top: 0.5em;
  font-size: 0.9em;
  line-height: 1.5;
}
.legal h3,
.legal h4,
.legal h5 {
  margin: 1em 0 0.4em;
}
.legal table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}
.legal th,
.legal td {
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  padding: 0.3em 0.5em;
  text-align: left;
  vertical-align: top;
}
```

- [ ] **Step 4: Onboarding.** Trong `src/windows/main/onboarding/Onboarding.tsx`: bỏ kiểu `Step` và hàm `stepsFor` tại chỗ, thay bằng `import { canAdvance, type Step, stepsFor } from "../../../lib/onboardingSteps";` (và nếu file khác đang import `stepsFor` từ đây thì giữ `export { stepsFor }` để không vỡ). Thêm `terms: "onboarding.terms.title"` vào `TITLES`. Trong `Onboarding()` thêm `const accepted = useApp((s) => s.termsAccepted);` và đổi nút Tiếp thành `<button className="primary" disabled={!canAdvance(step, accepted)} onClick={…giữ nguyên…}>`. Trong `StepBody` thêm `const accepted = useApp((s) => s.termsAccepted); const setAccepted = useApp((s) => s.setTermsAccepted);` và một nhánh trước `case "model"`:

```tsx
    case "terms":
      return (
        <>
          <p>{t("onboarding.terms.intro")}</p>
          <LegalDetails kind="eula" />
          <LegalDetails kind="privacy" />
          <label className="row">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>{t("onboarding.terms.accept")}</span>
          </label>
        </>
      );
```

với `import { LegalDetails } from "../LegalDocument";`.

- [ ] **Step 5: Giới thiệu.** Trong `src/windows/main/screens/About.tsx` thêm `import { LegalDetails } from "../LegalDocument";` và, ngay trước thẻ `<div className="card"><h2>{t("about.licenses")}</h2>…`, thêm:

```tsx
      <div className="card">
        <h2>{t("about.legal")}</h2>
        <LegalDetails kind="eula" />
        <LegalDetails kind="privacy" />
      </div>
```

- [ ] **Step 6: Màn hình mua.** Trong `src/windows/main/screens/UpgradeScreen.tsx` thêm `import { LegalDetails } from "../LegalDocument";` và, ngay sau thẻ `</label>` của ô `upgrade.consent`, thêm `<LegalDetails kind="privacy" />`.

- [ ] **Step 7: Kiểm toàn bộ**

Run: `pnpm exec tsc --noEmit && echo TSC_OK; pnpm test 2>&1 | grep -E "Test Files|Tests |FAIL"; pnpm build 2>&1 | grep -E "built in|error|Error|legal|eula|privacy" | head -12`
Expected: `TSC_OK`; mọi test đạt (140 trước đó, cộng test mới; `i18n.test.ts` đạt); `pnpm build` thành công và thấy các chunk riêng cho `eula.*.md`, `privacy.*.md`.

- [ ] **Step 8: Commit**

```bash
git add src/windows/main/LegalDocument.tsx src/windows/main/onboarding/Onboarding.tsx src/windows/main/screens/About.tsx src/windows/main/screens/UpgradeScreen.tsx src/i18n/vi.ts src/i18n/en.ts src/styles/main.css
git commit -m "feat(app): hiển thị EULA và chính sách quyền riêng tư: bước Điều khoản bắt buộc ở onboarding, thẻ ở Giới thiệu, mục gập ở màn hình mua

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Spec và kiểm cuối

**Files:** Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

- [ ] **Step 1: Spec gốc §4.1.** Tìm dòng của "Bước 1" (chọn ngôn ngữ giao diện) và thêm ngay sau nó một dòng cùng kiểu danh sách: `**Bước 1b: Điều khoản.** Hiện Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư (đóng gói trong app, theo ngôn ngữ vừa chọn); phải tick đồng ý mới bấm được "Tiếp" (spec 2026-10-06 legal-in-app).` Không đánh số lại các bước khác.
- [ ] **Step 2: Kiểm cuối.** Run: `cargo fmt --all -- --check && echo FMT_OK; node --test "scripts/release/*.test.mjs" 2>&1 | grep -E "^ℹ (pass|fail)"; pnpm test 2>&1 | grep -E "Test Files|Tests "; git status --short`
Expected: `FMT_OK`; Node 0 fail; vitest đạt; cây git chỉ còn file spec vừa sửa.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): ghi bước Điều khoản ở onboarding vào §4.1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

## Việc cần người nhìn (sau khi xong)

Mở bản dev hoặc build, kiểm bằng mắt: onboarding (xóa dữ liệu hay máy mới) hiện bước 2 "Điều khoản", nút Tiếp xám cho tới khi tick; văn bản đọc được, bảng không vỡ, đổi ngôn ngữ ở bước 1 thì văn bản đổi theo; Cài đặt › Giới thiệu có thẻ "Điều khoản và quyền riêng tư"; Nâng cấp có mục gập "Chính sách quyền riêng tư" dưới ô đồng ý email.
