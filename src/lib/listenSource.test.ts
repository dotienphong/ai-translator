import { describe, expect, test } from "vitest";
import type { SpeakerVoice, Subtitle } from "./ipc";
import { LABEL_WAIT_MS, decide, isReadable } from "./listenSource";
import type { VoiceMap } from "./speakers";

// Quy tắc nguồn của "Nghe dịch" (spec 2026-11-02-nghe-dich-truc-tiep §6): chỉ đọc tiếng máy, không đọc lời người dùng (micro).

const line = (over: Partial<Subtitle> = {}): Subtitle => ({
  id: 1,
  start_ms: 0,
  end_ms: 1000,
  src_lang: "en",
  src_text: "hello",
  tgt_text: "xin chào",
  status: "done",
  provisional: false,
  replaces: [],
  speaker: null,
  ...over,
});

const voice = (id: number, room: boolean, mergedInto: number | null = null): SpeakerVoice => ({
  id,
  label: `Người ${id}`,
  color: 0,
  source: "voice",
  room,
  mergedInto,
});

const voices = (...vs: SpeakerVoice[]): VoiceMap => new Map(vs.map((v) => [v.id, v]));

describe("decide", () => {
  test("playback mode reads everything", () => {
    expect(decide(line({ speaker: 1 }), voices(voice(1, true)), "playback", 0)).toBe("read");
    expect(decide(line(), voices(), "playback", 0)).toBe("read");
  });

  test("mic-only mode skips everything", () => {
    expect(decide(line({ speaker: 1 }), voices(voice(1, false)), "mic", 10_000)).toBe("skip");
  });

  test("both mode skips a voice that is in the room (the user's own)", () => {
    expect(decide(line({ speaker: 1 }), voices(voice(1, true)), "both", 0)).toBe("skip");
  });

  test("both mode reads a voice that is not in the room (the guest)", () => {
    expect(decide(line({ speaker: 2 }), voices(voice(1, true), voice(2, false)), "both", 0)).toBe("read");
  });

  test("both mode waits for the speaker label, then reads once the wait is over", () => {
    expect(decide(line(), voices(), "both", LABEL_WAIT_MS - 1)).toBe("wait");
    expect(decide(line(), voices(), "both", LABEL_WAIT_MS)).toBe("read");
  });

  test("a speaker not yet in the roster counts as unlabelled", () => {
    expect(decide(line({ speaker: 7 }), voices(), "both", 0)).toBe("wait");
    expect(decide(line({ speaker: 7 }), voices(), "both", LABEL_WAIT_MS)).toBe("read");
  });

  test("a merged voice follows the room flag of the voice it was merged into", () => {
    const map = voices(voice(1, true), voice(2, false, 1));
    expect(decide(line({ speaker: 2 }), map, "both", 0)).toBe("skip");
    const other = voices(voice(1, false), voice(2, true, 1));
    expect(decide(line({ speaker: 2 }), other, "both", 0)).toBe("read");
  });
});

describe("isReadable", () => {
  test("a finished, final, non-empty translation in vi or en is readable", () => {
    expect(isReadable(line(), "vi")).toBe(true);
    expect(isReadable(line(), "en")).toBe(true);
  });

  test("anything else is not", () => {
    expect(isReadable(line({ provisional: true }), "vi")).toBe(false);
    expect(isReadable(line({ status: "translating" }), "vi")).toBe(false);
    expect(isReadable(line({ status: "failed" }), "vi")).toBe(false);
    expect(isReadable(line({ status: "same_lang" }), "vi")).toBe(false);
    expect(isReadable(line({ tgt_text: "   " }), "vi")).toBe(false);
    expect(isReadable(line({ tgt_text: "" }), "vi")).toBe(false);
    expect(isReadable(line(), "ko")).toBe(false);
  });

  test("text over 4000 bytes of UTF-8 is not readable, exactly 4000 is", () => {
    expect(isReadable(line({ tgt_text: "a".repeat(4000) }), "en")).toBe(true);
    expect(isReadable(line({ tgt_text: "a".repeat(4001) }), "en")).toBe(false);
    // Chữ có dấu: mỗi "ế" là 3 byte UTF-8.
    expect(isReadable(line({ tgt_text: "ế".repeat(1334) }), "vi")).toBe(false);
    expect(isReadable(line({ tgt_text: "ế".repeat(1333) }), "vi")).toBe(true);
  });
});
