import { describe, expect, it } from "vitest";
import type { SpeakerVoice, Subtitle } from "./ipc";
import { MAX_SPEAKER_NAME, NO_VOICES, decorate, isolateName, mergeVoices, setSpeaker, speakerColor } from "./speakers";

const voice = (id: number, patch: Partial<SpeakerVoice> = {}): SpeakerVoice => ({
  id,
  label: `Người ${id}`,
  color: id - 1,
  source: "voice",
  room: false,
  mergedInto: null,
  ...patch,
});

const sub = (id: number, speaker: number | null): Subtitle => ({
  id,
  start_ms: 0,
  end_ms: 0,
  src_lang: "en",
  src_text: "",
  tgt_text: "",
  status: "done",
  provisional: false,
  replaces: [],
  speaker,
});

// Spec 2026-10-26-phan-biet-nguoi-noi §8: nhãn đổi tại chỗ, không vẽ lại cả danh sách.
describe("mergeVoices", () => {
  it("giữ nguyên đối tượng của giọng không đổi, thay đối tượng của giọng đổi", () => {
    const a = mergeVoices(NO_VOICES, [voice(1), voice(2)]);
    const b = mergeVoices(a, [voice(1), voice(2, { label: "Lan" })]);
    expect(b.get(1)).toBe(a.get(1));
    expect(b.get(2)).not.toBe(a.get(2));
    expect(b.get(2)?.label).toBe("Lan");
  });

  it("bảng y hệt thì trả đúng bảng cũ", () => {
    const a = mergeVoices(NO_VOICES, [voice(1)]);
    expect(mergeVoices(a, [voice(1)])).toBe(a);
  });

  it("giọng rời bảng thì mất; bảng rỗng là tắt tính năng", () => {
    const a = mergeVoices(NO_VOICES, [voice(1), voice(2)]);
    expect([...mergeVoices(a, [voice(1)]).keys()]).toEqual([1]);
    expect(mergeVoices(a, []).size).toBe(0);
  });
});

describe("setSpeaker", () => {
  it("chỉ dòng đó đổi đối tượng; không có dòng hay giọng không đổi thì giữ nguyên mảng", () => {
    const lines = [sub(1, null), sub(2, null)];
    const next = setSpeaker(lines, { id: 2, speaker: 5 });
    expect(next[0]).toBe(lines[0]);
    expect(next[1]?.speaker).toBe(5);
    expect(setSpeaker(next, { id: 2, speaker: 5 })).toBe(next);
    expect(setSpeaker(next, { id: 9, speaker: 1 })).toBe(next);
  });
});

describe("decorate", () => {
  const voices = mergeVoices(NO_VOICES, [voice(1), voice(2), voice(3, { mergedInto: 1, label: "Người 1", color: 0 })]);
  const run = (speakers: (number | null)[]) =>
    decorate(
      speakers.map((s, i) => sub(i + 1, s)),
      (l) => l.speaker,
      voices,
    ).map((d) => [d.voice?.id ?? null, d.turnStart]);

  it("tên ở dòng đầu mỗi lượt nói, câu sau của cùng người không lặp tên", () => {
    expect(run([1, 1, 2, 1])).toEqual([
      [1, true],
      [1, false],
      [2, true],
      [1, true],
    ]);
  });

  it("giọng đã gộp tay tính như giọng đích: cùng một lượt", () => {
    expect(run([1, 3, 1])).toEqual([
      [1, true],
      [3, false],
      [1, false],
    ]);
  });

  // QĐ 6 của kế hoạch 03: câu chưa xác định không nhãn; câu có giọng sau nó lặp lại tên. Giọng chưa có trong bảng: chưa xác định.
  it("câu chưa xác định không nhãn, câu sau nó lặp lại tên; giọng chưa có trong bảng là chưa xác định", () => {
    expect(run([1, null, 1, 9])).toEqual([
      [1, true],
      [null, false],
      [1, true],
      [null, false],
    ]);
  });
});

describe("speakerColor", () => {
  it("biến CSS của bảng 8 màu; chỉ số ngoài khoảng thì quay vòng", () => {
    expect(speakerColor(0)).toBe("var(--spk-0)");
    expect(speakerColor(7)).toBe("var(--spk-7)");
    expect(speakerColor(9)).toBe("var(--spk-1)");
    expect(speakerColor(-1)).toBe("var(--spk-7)");
  });

  it("tên tối đa 40 ký tự như phía Rust", () => {
    expect(MAX_SPEAKER_NAME).toBe(40);
  });
});

// QĐ 11 của kế hoạch 03 (rà soát B-N8): tên chèn vào câu được cô lập hướng chữ.
describe("isolateName", () => {
  it("bọc tên trong FSI…PDI (U+2068, U+2069)", () => {
    expect(isolateName("Lan")).toBe("⁨Lan⁩");
    expect([...isolateName("")]).toEqual(["⁨", "⁩"]);
  });
});
