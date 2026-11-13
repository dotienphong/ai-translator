import { describe, expect, it } from "vitest";
import { translate } from "../i18n";
import type { Notes, Subtitle } from "./ipc";
import {
  type AskDialog,
  canExportFile,
  companyOf,
  type Gate,
  type GateInput,
  gate,
  linesForRefs,
  sourceLabel,
  sourceOf,
  templateOf,
  withItem,
} from "./notes";

const CLOUD = { kind: "cloud", provider: "gemini", model: "gemini-2.5-flash" } as const;

// Một đầu vào hợp lệ: nguồn Cloud, có key, đã đồng ý, Pro, 3 câu, chưa có ghi chú, phiên đã dừng.
const base: GateInput = {
  source: CLOUD,
  pack: "installed",
  localAck: true,
  cloudConsent: true,
  hasKey: true,
  sessionActive: false,
  isCurrent: true,
  lineCount: 3,
  pro: true,
  freeLeft: null,
  existing: "none",
};

const LOCAL = { kind: "local" } as const;
const NONE: ReadonlySet<AskDialog> = new Set();

const blocked = (reason: Extract<Gate, { kind: "blocked" }>["reason"]): Gate => ({ kind: "blocked", reason });
const ask = (dialog: AskDialog): Gate => ({ kind: "ask", dialog });

describe("gate", () => {
  it("gate_follows_the_rule_order", () => {
    const rows: [string, Partial<GateInput>, Gate][] = [
      ["valid input goes", {}, { kind: "go" }],
      ["rule 1: no lines", { lineCount: 0 }, blocked("empty")],
      ["rule 2: current session still running", { sessionActive: true }, blocked("sessionRunning")],
      ["rule 3: Free used up", { pro: false, freeLeft: 0 }, blocked("freeUsedUp")],
      ["rule 3 skipped for Pro", { pro: true, freeLeft: 0 }, { kind: "go" }],
      ["rule 4: local unavailable", { source: LOCAL, pack: "unavailable" }, blocked("localUnavailable")],
      ["rule 4: local ram too low", { source: LOCAL, pack: "ramTooLow" }, blocked("localUnavailable")],
      ["rule 4: local pack missing", { source: LOCAL, pack: "missing" }, blocked("packMissing")],
      ["rule 4: local pack downloading", { source: LOCAL, pack: "downloading" }, blocked("packDownloading")],
      [
        "rule 4: a history target waits for the running session",
        { source: LOCAL, sessionActive: true, isCurrent: false },
        blocked("localSessionActive"),
      ],
      ["rule 4: local without the acknowledgement", { source: LOCAL, localAck: false }, ask("localSuggest")],
      ["rule 5: cloud without a key", { hasKey: false }, blocked("keyMissing")],
      ["rule 5: cloud without consent", { cloudConsent: false }, ask("cloudConsent")],
      ["rule 6: an edited note", { existing: "edited" }, ask("overwriteEdited")],
      ["rule 6: a generated note", { existing: "generated" }, ask("overwrite")],
      // Hai luật cùng khớp: luật đứng trước thắng.
      ["no lines beats Free used up", { lineCount: 0, pro: false, freeLeft: 0 }, blocked("empty")],
      ["running session beats Free used up", { sessionActive: true, pro: false, freeLeft: 0 }, blocked("sessionRunning")],
      ["a missing key beats the consent", { hasKey: false, cloudConsent: false }, blocked("keyMissing")],
      ["local suggestion beats the overwrite", { source: LOCAL, localAck: false, existing: "edited" }, ask("localSuggest")],
      ["Free used up beats an unavailable pack", { source: LOCAL, pack: "unavailable", pro: false, freeLeft: 0 }, blocked("freeUsedUp")],
      ["consent beats the overwrite", { cloudConsent: false, existing: "generated" }, ask("cloudConsent")],
    ];
    for (const [name, patch, want] of rows) expect(gate({ ...base, ...patch }, NONE), name).toEqual(want);
  });

  it("a_confirmed_dialog_is_not_asked_again", () => {
    const input: GateInput = { ...base, source: LOCAL, localAck: false, existing: "edited" };
    expect(gate(input, NONE)).toEqual(ask("localSuggest"));
    expect(gate(input, new Set<AskDialog>(["localSuggest"]))).toEqual(ask("overwriteEdited"));
    expect(gate(input, new Set<AskDialog>(["localSuggest", "overwriteEdited"]))).toEqual({ kind: "go" });
    const cloud: GateInput = { ...base, cloudConsent: false };
    expect(gate(cloud, new Set<AskDialog>(["cloudConsent"]))).toEqual({ kind: "go" });
    // Xác nhận không vượt được lý do chặn.
    expect(gate({ ...base, hasKey: false }, new Set<AskDialog>(["cloudConsent"]))).toEqual(blocked("keyMissing"));
  });

  it("local_with_ack_skips_the_suggestion", () => {
    expect(gate({ ...base, source: LOCAL, localAck: true }, NONE)).toEqual({ kind: "go" });
    expect(gate({ ...base, source: LOCAL, localAck: true, existing: "generated" }, NONE)).toEqual(ask("overwrite"));
  });
});

describe("source", () => {
  const settings = {
    translationProvider: "local",
    openaiModel: "gpt-4o-mini",
    geminiModel: "gemini-2.5-flash",
    deepseekModel: "deepseek-flash",
  } as const;
  const t = (key: Parameters<typeof translate>[1]) => translate("vi", key);

  it("source_of_reads_the_translation_provider", () => {
    expect(sourceOf(settings)).toEqual({ kind: "local" });
    expect(sourceOf({ ...settings, translationProvider: "openai" })).toEqual({ kind: "cloud", provider: "openai", model: "gpt-4o-mini" });
    expect(sourceOf({ ...settings, translationProvider: "gemini" })).toEqual({ kind: "cloud", provider: "gemini", model: "gemini-2.5-flash" });
    expect(sourceOf({ ...settings, translationProvider: "deepseek" })).toEqual({ kind: "cloud", provider: "deepseek", model: "deepseek-flash" });
    // Cài đặt chưa nạp xong: Local (không đoán một nhà cung cấp cloud).
    expect(sourceOf({})).toEqual({ kind: "local" });
  });

  it("source_label_names_the_provider_and_model_but_never_a_local_model", () => {
    expect(sourceLabel({ kind: "local" }, t)).toBe("Model trên máy");
    expect(sourceLabel({ kind: "cloud", provider: "openai", model: "gpt-4o-mini" }, t)).toBe("ChatGPT · gpt-4o-mini");
    expect(sourceLabel({ kind: "cloud", provider: "gemini", model: "gemini-2.5-flash" }, t)).toBe("Gemini · gemini-2.5-flash");
    expect(sourceLabel({ kind: "cloud", provider: "deepseek", model: "deepseek-flash" }, t)).toBe("DeepSeek · deepseek-flash");
    expect(sourceLabel({ kind: "cloud", provider: "deepseek", model: "" }, t)).toBe("DeepSeek");
  });
});

describe("companyOf", () => {
  it("company_of_names_the_company_behind_each_provider", () => {
    expect(companyOf({ kind: "cloud", provider: "openai", model: "x" })).toBe("OpenAI");
    expect(companyOf({ kind: "cloud", provider: "gemini", model: "x" })).toBe("Google");
    expect(companyOf({ kind: "cloud", provider: "deepseek", model: "x" })).toBe("DeepSeek");
    expect(companyOf({ kind: "local" })).toBe("");
  });
});

describe("export", () => {
  it("file_export_is_pro_only", () => {
    expect(canExportFile(true)).toBe(true);
    expect(canExportFile(false)).toBe(false);
  });
});

describe("notes edits", () => {
  const notes: Notes = {
    summary: "tóm tắt",
    decisions: [
      { text: "a", refs: [1] },
      { text: "b", refs: [] },
    ],
    actionItems: [{ text: "việc", owner: "Lan", due: "", refs: [2] }],
    openQuestions: [],
    raw: false,
  };

  it("with_item_edits_and_removes_without_mutating", () => {
    const before = structuredClone(notes);
    const edited = withItem(notes, "decisions", 1, { text: "b2" });
    expect(edited.decisions).toEqual([
      { text: "a", refs: [1] },
      { text: "b2", refs: [] },
    ]);
    const owner = withItem(notes, "actionItems", 0, { owner: "Hoa", due: "thứ Sáu" });
    expect(owner.actionItems[0]).toEqual({ text: "việc", owner: "Hoa", due: "thứ Sáu", refs: [2] });
    const removed = withItem(notes, "decisions", 0, null);
    expect(removed.decisions).toEqual([{ text: "b", refs: [] }]);
    // Chỉ số ngoài khoảng: không đổi gì; mọi bản gốc nguyên vẹn.
    expect(withItem(notes, "decisions", 9, null)).toBe(notes);
    expect(withItem(notes, "decisions", -1, { text: "x" })).toBe(notes);
    expect(notes).toEqual(before);
    expect(edited.actionItems).toBe(notes.actionItems);
  });
});

describe("linesForRefs", () => {
  const line = (id: number): Subtitle => ({
    id,
    start_ms: 0,
    end_ms: 0,
    src_lang: "en",
    src_text: `câu ${id}`,
    tgt_text: `dịch ${id}`,
    status: "done",
    provisional: false,
    replaces: [],
    speaker: null,
  });
  const lines = [line(10), line(20), line(30)];

  it("lines_for_refs_skips_missing_numbers_and_keeps_order", () => {
    expect(linesForRefs(lines, [3, 99, 1]).map((r) => [r.seq, r.line.id])).toEqual([
      [3, 30],
      [1, 10],
    ]);
    expect(linesForRefs(lines, [0, -2, 1.5, 2]).map((r) => r.seq)).toEqual([2]);
    expect(linesForRefs(lines, [])).toEqual([]);
  });
});

describe("templateOf", () => {
  it("uses_the_saved_template_and_falls_back_to_meeting_when_settings_are_not_loaded_or_have_none", () => {
    expect(templateOf({ notesTemplate: "lecture" })).toBe("lecture");
    expect(templateOf({ notesTemplate: "brief" })).toBe("brief");
    expect(templateOf({})).toBe("meeting");
    expect(templateOf(null)).toBe("meeting");
  });
});
