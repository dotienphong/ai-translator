import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi as viText } from "../../../i18n";
import type { Notes, NotesProvider } from "../../../lib/ipc";
import { NotesResult, type NotesResultProps } from "./NotesResult";

const NOTES: Notes = {
  summary: "Cuộc họp chốt kế hoạch quý.",
  decisions: [
    { text: "Chốt ngân sách", refs: [12, 14] },
    { text: "Hoãn ra mắt", refs: [] },
  ],
  actionItems: [
    { text: "Gửi báo cáo", owner: "Lan", due: "thứ Sáu", refs: [3] },
    { text: "Đặt phòng", owner: "", due: "", refs: [5] },
  ],
  openQuestions: [{ text: "Ai duyệt chi phí?", refs: [8] }],
  raw: false,
};

const props = (patch: Partial<NotesResultProps> = {}): NotesResultProps => ({
  lang: "vi",
  notes: NOTES,
  source: "gemini",
  editing: false,
  onEdit: () => {},
  onOpenSource: () => {},
  ...patch,
});
const html = (p: NotesResultProps) => renderToStaticMarkup(createElement(NotesResult, p));
const count = (markup: string, needle: string) => markup.split(needle).length - 1;

describe("NotesResult", () => {
  it("local_results_carry_the_draft_badge_and_cloud_results_do_not", () => {
    const local = html(props({ source: "local" }));
    expect(local).toContain(viText["notes.draft.badge"]);
    expect(local).toContain(viText["notes.draft.hint"]);
    for (const source of ["openai", "gemini", "deepseek"] as NotesProvider[]) {
      const cloud = html(props({ source }));
      expect(cloud, source).not.toContain(viText["notes.draft.badge"]);
      expect(cloud, source).not.toContain(viText["notes.draft.hint"]);
    }
  });

  it("every_result_shows_the_review_hint", () => {
    for (const source of ["local", "openai", "gemini", "deepseek"] as NotesProvider[]) {
      expect(html(props({ source })), source).toContain(viText["notes.review.hint"]);
    }
  });

  it("shows_the_four_blocks_in_order", () => {
    const markup = html(props());
    const at = (key: "summary" | "decisions" | "actions" | "questions") => markup.indexOf(viText[`notes.block.${key}`]);
    expect(at("summary")).toBeGreaterThan(-1);
    expect(at("summary")).toBeLessThan(at("decisions"));
    expect(at("decisions")).toBeLessThan(at("actions"));
    expect(at("actions")).toBeLessThan(at("questions"));
    expect(markup).toContain("Chốt ngân sách");
  });

  it("an_item_without_refs_has_no_source_button", () => {
    const markup = html(props());
    // Bốn mục có `refs`, một mục không có.
    expect(count(markup, `aria-label="${viText["notes.refs.open"]}"`)).toBe(4);
    expect(markup).toContain(">#12<");
    expect(markup).toContain(">#3<");
    const withoutRefs = html(
      props({ notes: { ...NOTES, decisions: [{ text: "Hoãn ra mắt", refs: [] }], actionItems: [], openQuestions: [] } }),
    );
    expect(withoutRefs).not.toContain(`aria-label="${viText["notes.refs.open"]}"`);
  });

  it("an_action_shows_owner_and_due_only_when_present", () => {
    const markup = html(props());
    // Chip có biểu tượng; nhãn "Người nhận:" / "Hạn:" chỉ dành cho trình đọc màn hình, chữ hiển thị là giá trị.
    const plain = markup.replace(/<[^>]+>/g, "");
    expect(plain).toContain("Người nhận: Lan");
    expect(plain).toContain("Hạn: thứ Sáu");
    expect(count(plain, "Người nhận:")).toBe(1);
    expect(count(plain, "Hạn:")).toBe(1);
    expect(markup).toContain('class="notes-chip is-owner"');
    expect(markup).toContain('class="notes-chip is-due"');
  });

  it("each_block_title_carries_how_many_items_it_holds", () => {
    const counts = [...html(props()).matchAll(/class="notes-count">(\d+)</g)].map((m) => m[1]);
    expect(counts).toEqual(["2", "2", "1"]);
    const empty: Notes = { summary: "x", decisions: [], actionItems: [], openQuestions: [], raw: false };
    expect(html(props({ notes: empty }))).not.toContain("notes-count");
  });

  it("an_action_item_is_display_only_with_no_checkbox", () => {
    const markup = html(props());
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain("<input");
  });

  it("raw_notes_show_only_the_summary", () => {
    const markup = html(props({ notes: { ...NOTES, raw: true } }));
    expect(markup).toContain("Cuộc họp chốt kế hoạch quý.");
    expect(markup).toContain(viText["notes.raw.hint"]);
    expect(markup).not.toContain("Chốt ngân sách");
    expect(markup).not.toContain(viText["notes.block.decisions"]);
    expect(markup).not.toContain(viText["notes.block.actions"]);
    expect(markup).not.toContain(viText["notes.block.questions"]);
    expect(html(props())).not.toContain(viText["notes.raw.hint"]);
  });

  it("editing_turns_text_into_inputs_and_adds_remove_buttons", () => {
    const reading = html(props());
    expect(reading).not.toContain("<textarea");
    expect(reading).not.toContain(`aria-label="${viText["notes.item.remove"]}"`);
    const editing = html(props({ editing: true }));
    // Tóm tắt + hai quyết định + hai việc + một câu hỏi: sáu ô chữ; hai việc có thêm ô người nhận và hạn.
    expect(count(editing, "<textarea")).toBe(6);
    expect(count(editing, "<input")).toBe(4);
    // Năm mục (không tính Tóm tắt) mỗi mục một nút xóa.
    expect(count(editing, `aria-label="${viText["notes.item.remove"]}"`)).toBe(5);
    expect(editing).toContain("Chốt ngân sách");
  });

  it("empty_blocks_say_so", () => {
    const empty: Notes = { summary: "", decisions: [], actionItems: [], openQuestions: [], raw: false };
    expect(count(html(props({ notes: empty })), viText["notes.block.empty"])).toBe(4);
    expect(count(html(props({ notes: { ...NOTES, summary: "Có tóm tắt", decisions: [] } })), viText["notes.block.empty"])).toBe(1);
  });
});
