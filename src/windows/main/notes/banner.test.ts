import { describe, expect, it } from "vitest";
import { type BannerInput, pickBanner } from "./banner";

const quiet: BannerInput = {
  confirmDiscard: false,
  error: null,
  failure: null,
  editing: false,
  staleDraft: false,
  notice: null,
  unsaved: false,
};
const loud: BannerInput = {
  confirmDiscard: true,
  error: { code: "notesBusy", field: null },
  failure: "notesRateLimited",
  editing: true,
  staleDraft: true,
  notice: { kind: "copied" },
  unsaved: true,
};

describe("pickBanner", () => {
  it("says_nothing_when_there_is_nothing_to_say", () => {
    expect(pickBanner(quiet)).toBeNull();
  });

  it("shows_one_message_at_a_time_most_urgent_first", () => {
    const order: [Partial<BannerInput>, string][] = [
      [{ confirmDiscard: false }, "error"],
      [{ confirmDiscard: false, error: null }, "failure"],
      [{ confirmDiscard: false, error: null, failure: null }, "stale"],
      [{ confirmDiscard: false, error: null, failure: null, staleDraft: false }, "notice"],
      [{ confirmDiscard: false, error: null, failure: null, staleDraft: false, notice: null }, "unsaved"],
    ];
    expect(pickBanner(loud)?.kind).toBe("discard");
    for (const [patch, kind] of order) expect(pickBanner({ ...loud, ...patch })?.kind, kind).toBe(kind);
    expect(pickBanner({ ...loud, confirmDiscard: false, error: null, failure: null, staleDraft: false, notice: null, unsaved: false })).toBeNull();
  });

  it("carries_the_error_code_and_the_notice", () => {
    expect(pickBanner({ ...quiet, error: { code: "notesBusy", field: null } })).toEqual({ kind: "error", code: "notesBusy" });
    expect(pickBanner({ ...quiet, failure: "notesOffline" })).toEqual({ kind: "failure", code: "notesOffline" });
    expect(pickBanner({ ...quiet, notice: { kind: "exported", path: "C:\\x.md" } })).toEqual({
      kind: "notice",
      notice: { kind: "exported", path: "C:\\x.md" },
    });
  });

  it("a_newer_draft_warning_only_matters_while_editing", () => {
    expect(pickBanner({ ...quiet, staleDraft: true, editing: false })).toBeNull();
    expect(pickBanner({ ...quiet, staleDraft: true, editing: true })?.kind).toBe("stale");
  });
});
