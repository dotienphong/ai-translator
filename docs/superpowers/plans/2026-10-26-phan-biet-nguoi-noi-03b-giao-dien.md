# Phân biệt người nói, kế hoạch 03b: giao diện (thanh phụ đề, bản chép lời, Cài đặt) và nghiệm thu bằng ảnh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Chủ dự án chưa cho phép commit cho phần 03 của tính năng này. Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng bước "Mốc kiểm" (chạy đúng test, typecheck, lint liên quan; `git status --short` chỉ để đối chiếu). Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`. Chỉ commit khi chủ dự án nói rõ.

**Goal:** phần giao diện của kế hoạch 03 (`2026-10-26-phan-biet-nguoi-noi-03-giao-dien-du-lieu.md`): kiểu TypeScript khớp phía Rust, vẽ tên có màu và vạch màu trên thanh phụ đề và bản chép lời, menu đổi tên / chọn người / gộp, nhóm "Người nói" ở Cài đặt › Phụ đề, ghi chú tải dữ liệu nhận giọng, dòng mời cấp quyền; nghiệm thu bằng ảnh ở 5 ngôn ngữ.

**Chạy sau file 03:** file này dùng sự kiện, lệnh, chữ i18n mà Task 1–10 của file 03 tạo. Quyết định thiết kế (QĐ 1–21), quy ước (`W`, `M`, `DATA`, `B`, `cd $W &&`, cargo, đĩa, vitest không ở `taskpolicy -b`), phủ spec, rủi ro và điều cần chủ dự án quyết: ở file 03. Số Task nối tiếp file 03 (Task 11–23).

**Tech Stack:** React 19.3, TypeScript 7.0, Vite 8.3, Vitest 5.0 (môi trường `node`, component vẽ bằng `react-dom/server`), zustand 5.0. Không thêm thư viện.

**Nguyên tắc vẽ (ưu tiên 1, tốc độ):** phụ đề không bao giờ chờ nhãn. Giọng của dòng là `Subtitle.speaker` (hay `LiveLine.speaker`), tra trong bảng giọng `VoiceMap`; bảng mới giữ nguyên đối tượng của giọng không đổi (`mergeVoices`), nên component memo của từng dòng (`OverlayLine`, `LiveLineView`, `TranscriptRow`) chỉ vẽ lại khi giọng của chính nó đổi hay dòng đó thành/thôi là dòng đầu lượt. Dòng chưa có giọng (hay giọng chưa có trong bảng) vẽ như khi tắt tính năng.

---

### Task 11: Kiểu TypeScript khớp phía Rust

**Files:**
- Modify: `src/lib/ipc.ts` (`AppInfo`, `Settings`, `Subtitle`, `LiveLine`, kiểu người nói mới, `Transcript`, `Navigate`, `Commands`, `Events`)
- Modify: `src/lib/models.ts:52-78`, `src/lib/fakeModels.ts:34`, `src/store/transcript.ts:69` (`empty()`)
- Modify (chỉ thêm trường mới vào dữ liệu mẫu): `src/store/{overlay,transcript,library,app}.test.ts`, `src/lib/subtitleView.test.ts`, `src/windows/overlay/{OverlayLine,LiveLineView}.test.ts`, `scripts/ui-preview/tauri-mock.ts`

- [ ] **Step 1: Thấy đỏ trước (typecheck theo kiểu mới)**

Sửa `src/lib/ipc.ts` trước (Step 2), rồi chạy typecheck để thấy mọi chỗ dựng dữ liệu cũ phải thêm trường:

Run (sau Step 2): `cd $W && node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: một số lỗi `TS2741: Property 'speaker' is missing …`, `'speakers' is missing`, `'speakerAvailable' is missing`, `'speakerDiarization' is missing`, `'speaker' is missing in type … ModelsView` ở đúng các file liệt kê ở trên.

- [ ] **Step 2: Sửa `src/lib/ipc.ts`**

1. Trong `Settings`, sau `translateWhileSpeaking: boolean;` thêm:

```ts
  // "Phân biệt người nói" và "Lấy tên từ Teams, Meet, Zoom" (spec 2026-10-26-phan-biet-nguoi-noi §8.3), mặc định bật. Tắt "Phân biệt"
  // giữa phiên thì dừng ngay; bật thì có tác dụng từ phiên sau.
  speakerDiarization: boolean;
  speakerNames: boolean;
```

2. Trong `AppInfo`, sau `launchedAtLogin: boolean;` thêm:

```ts
  // Bản này có "Phân biệt người nói" không (`speaker::enabled()`; bản phát hành: không, tới kế hoạch 07): chỉ khi có mới hiện nhóm
  // Cài đặt "Người nói" (QĐ 9 của kế hoạch 03 phân biệt người nói).
  speakerAvailable: boolean;
```

3. Trong `Subtitle`, sau `replaces: number[];` thêm:

```ts
  // Mã giọng (spec 2026-10-26-phan-biet-nguoi-noi §9): `null` khi chưa xác định hay phiên không có nhận giọng. Nhãn, màu ở
  // `speaker://roster`.
  speaker: number | null;
```

4. Trong `LiveLine`, sau `tgt_src_units: number;` thêm:

```ts
  // Giọng của câu mà dòng này nối tiếp (`extends`); lượt nói mới thì `null` tới khi đoạn đóng (spec 2026-10-26 §4.4).
  speaker: number | null;
```

5. Sau `interface LiveEnd { id: number; }` thêm:

```ts
// Người nói (spec 2026-10-26-phan-biet-nguoi-noi §9; `transcript::speakers`). Tên từ đâu: đọc từ app họp, "Người N", người dùng đặt.
export type NameSource = "name" | "voice" | "user";

export interface SpeakerVoice {
  id: number;
  // Nhãn đã tính sẵn ở phía Rust: tên người dùng đặt, tên đọc từ app họp, hay "Người N" theo ngôn ngữ giao diện.
  label: string;
  // Chỉ số trong bảng 8 màu (0–7); mã màu theo nền ở CSS (`--spk-<n>`, `speakerColor` ở `speakers.ts`).
  color: number;
  source: NameSource;
  // Giọng trong phòng (nói vào micro).
  room: boolean;
  // Đã gộp tay vào giọng này: nhãn, màu là của giọng đó; tính như cùng một lượt nói.
  mergedInto: number | null;
}

// Bảng người nói của phiên (`speaker://roster`, kết quả của `rename_speaker`, `merge_speakers`).
export interface SpeakerRoster {
  voices: SpeakerVoice[];
  // Tên người tham dự đọc được (kế hoạch 04), cho "Chọn người trong cuộc họp".
  participants: string[];
  // Hiện dòng mời cấp quyền Trợ năng trên thanh phụ đề (spec §6.7; kế hoạch 04 bật).
  askAccess: boolean;
  // Số thứ tự của bảng (QĐ 25 của kế hoạch 03): tăng dần; bảng có `rev` nhỏ hơn bảng đã nhận là cũ, bỏ.
  rev: number;
}

// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker`): nhãn tới muộn, gộp giọng.
export interface SpeakerLabel {
  id: number;
  speaker: number | null;
}
```

6. Trong `Transcript`, sau `lines: Subtitle[];` thêm:

```ts
  // Người nói của phiên: `lines[i].speaker` là `id` trong danh sách này; Lịch sử: dựng lại từ nhãn đã lưu (chỉ đọc).
  speakers: SpeakerVoice[];
  // `rev` của bảng người nói lúc chụp: bản chụp tới muộn không đè bảng mới hơn (QĐ 25). Lịch sử: 0.
  speakersRev: number;
```

7. Trong `Navigate`, sau `settingsGroup: SettingsGroup | null;` thêm:

```ts
  // Phần cần cuộn tới: nhóm Người nói ở Cài đặt › Phụ đề (nút "Mở Cài đặt" của dòng mời trên thanh phụ đề).
  focus?: "speakers";
```

8. Trong `Commands`: đổi `export_transcript` thành

```ts
  export_transcript: {
    args: { source: TranscriptRef; format: ExportFormat; srtText: SrtText; utcOffsetMinutes: number; srtSpeakers?: boolean };
    result: string | null;
  };
```

  và sau dòng `clear_history: …;` thêm:

```ts
  // Người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.2): đổi tên (≤ 40 ký tự; rỗng là trở về tên tự động), gộp, trong phiên đang
  // chạy. Lỗi `speakerNotFound` khi phiên đã dừng hay giọng không còn; đổi tên: `tooLong` (field `name`); gộp: `speakerSame` khi gộp
  // một giọng vào chính nó hay vào giọng nó đã được gộp vào.
  rename_speaker: { args: { id: number; name: string }; result: SpeakerRoster };
  merge_speakers: { args: { from: number; into: number }; result: SpeakerRoster };
  // Chỉ thanh phụ đề: nút "Mở Cài đặt" của dòng mời cấp quyền; mở Cài đặt › Phụ đề › Người nói.
  open_speaker_settings: { args: undefined; result: null };
```

9. Trong `Events`, sau `"subtitle://live-end": LiveEnd;` thêm:

```ts
  // Người nói (spec 2026-10-26-phan-biet-nguoi-noi §4.3, §9): tới cả cửa sổ chính lẫn thanh phụ đề.
  "subtitle://speaker": SpeakerLabel;
  "speaker://roster": SpeakerRoster;
```

- [ ] **Step 3: `models.ts`, `fakeModels.ts`, store bản chép lời**

`src/lib/models.ts`: trước `export interface ModelsView {` thêm

```ts
// Dữ liệu nhận giọng (`models::service::SpeakerModel`, spec 2026-10-26-phan-biet-nguoi-noi §4.5).
export type SpeakerModel = "unavailable" | "missing" | "downloading" | "ready";
```

  và trong `ModelsView`, sau `updateAvailable: boolean;` thêm `speaker: SpeakerModel;`.

`src/lib/fakeModels.ts`: sau `updateAvailable: false,` thêm `speaker: "unavailable",`.

`src/store/transcript.ts`, dòng 69: `({ session: 0, startedAt: 0, endedAt: null, targetLang: "", lines: [] })` → `({ session: 0, startedAt: 0, endedAt: null, targetLang: "", lines: [], speakers: [], speakersRev: 0 })`.

- [ ] **Step 4: Thêm trường mới vào dữ liệu mẫu của test và trang xem trước**

Chỉ thêm trường, không đổi gì khác:
- `src/store/overlay.test.ts`: trong `sub` thêm `speaker: null,` sau `replaces: [],`; trong `live` thêm `speaker: null,` sau `tgt_src_units: 2,`.
- `src/store/transcript.test.ts`: trong `sub` thêm `speaker: null,` sau `replaces: [],`; trong `transcript` thêm `speakers: [],` và `speakersRev: 0,` sau `lines,`; trong test "không nghe dòng đang nói", sự kiện `subtitle://live` thêm `speaker: null,` sau `tgt_src_units: 1,`.
- `src/store/library.test.ts:15`: `lines: [] };` → `lines: [], speakers: [], speakersRev: 0 };`.
- `src/lib/subtitleView.test.ts`, `src/windows/overlay/OverlayLine.test.ts`: trong `sub` thêm `speaker: null,` sau `replaces: [],`.
- `src/windows/overlay/LiveLineView.test.ts`: trong `live` thêm `speaker: null,` sau `tgt_src_units: 3,`.
- `src/store/app.test.ts`: trong `settings` thêm `speakerDiarization: true,` và `speakerNames: true,` sau `translateWhileSpeaking: true,`; trong `info` thêm `speakerAvailable: false,` sau `launchedAtLogin: false,`.
- `scripts/ui-preview/tauri-mock.ts`:
  - `settings`: sau `translateWhileSpeaking: param("tws") !== "0",` thêm `speakerDiarization: true,` `speakerNames: true,`;
  - `info`: sau `launchedAtLogin: false,` thêm `speakerAvailable: false,`;
  - `models`: sau `updateAvailable: false,` thêm `speaker: "unavailable",`;
  - `lines` (map của `SAMPLE`): sau `replaces: [],` thêm `speaker: null,`;
  - `liveLine`: sau `tgt_src_units: 0,` thêm `speaker: null,`; `liveSubtitle`: sau `replaces: [],` thêm `speaker: null,`; phụ đề `id: 99` (`translating=1`): sau `replaces: [],` thêm `speaker: null,`;
  - `get_transcript`: `({ session: 1, startedAt, endedAt: null, targetLang: lang, lines })` → `({ session: 1, startedAt, endedAt: null, targetLang: lang, lines, speakers: [], speakersRev: 0 })`; `get_history_session`: thêm `speakers: [], speakersRev: 0` sau `lines` cùng cách.

- [ ] **Step 5: Thấy xanh**

Run: `cd $W && node_modules/.bin/tsc --noEmit && echo tsc-ok && node_modules/.bin/vitest run 2>&1 | tail -4`
Expected: `tsc-ok`; mọi test đạt, cùng số với mốc Task 0 cộng 3 test của `src/i18n/speakers.test.ts`.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short`
Expected: thêm các file của Task này. Không commit.

---

### Task 12: `src/lib/speakers.ts`: bảng giọng, giọng từng dòng, dòng đầu lượt

**Files:**
- Create: `src/lib/speakers.ts`, `src/lib/speakers.test.ts`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/lib/speakers.test.ts`:

```ts
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
    expect(isolateName("Lan")).toBe("\u2068Lan\u2069");
    expect([...isolateName("")]).toEqual(["\u2068", "\u2069"]);
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && node_modules/.bin/vitest run src/lib/speakers.test.ts 2>&1 | tail -4`
Expected: lỗi `Failed to resolve import "./speakers"` (file chưa có).

- [ ] **Step 3: Cài đặt**

Tạo `src/lib/speakers.ts`:

```ts
import type { SpeakerLabel, SpeakerVoice, Subtitle } from "./ipc";

// Phân biệt người nói ở giao diện (spec 2026-10-26-phan-biet-nguoi-noi §8): bảng giọng của phiên, giọng của từng dòng, dòng đầu mỗi
// lượt nói. Không chờ gì từ phía Rust: dòng chưa có giọng (hay giọng chưa có trong bảng) vẽ như khi tắt tính năng.

// Tên tối đa 40 ký tự (spec §8.2; `speakers::MAX_NAME_CHARS` ở phía Rust).
export const MAX_SPEAKER_NAME = 40;

// Bảng giọng theo mã. Đối tượng của giọng không đổi được giữ nguyên tham chiếu (`mergeVoices`), để các dòng memo của giọng đó không
// vẽ lại khi giọng khác đổi tên.
export type VoiceMap = ReadonlyMap<number, SpeakerVoice>;
export const NO_VOICES: VoiceMap = new Map();

function sameVoice(a: SpeakerVoice, b: SpeakerVoice): boolean {
  return (
    a.id === b.id &&
    a.label === b.label &&
    a.color === b.color &&
    a.source === b.source &&
    a.room === b.room &&
    a.mergedInto === b.mergedInto
  );
}

// Bảng mới (`speaker://roster`) ghép vào bảng cũ: giọng không đổi giữ đối tượng cũ; không có gì đổi thì trả đúng bảng cũ.
export function mergeVoices(prev: VoiceMap, next: readonly SpeakerVoice[]): VoiceMap {
  let changed = prev.size !== next.length;
  const out = new Map<number, SpeakerVoice>();
  for (const v of next) {
    const old = prev.get(v.id);
    if (old && sameVoice(old, v)) {
      out.set(v.id, old);
    } else {
      out.set(v.id, v);
      changed = true;
    }
  }
  return changed ? out : prev;
}

// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker`): chỉ dòng đó đổi đối tượng; không có dòng đó hay giọng không đổi thì
// giữ nguyên mảng.
export function setSpeaker(lines: Subtitle[], label: SpeakerLabel): Subtitle[] {
  const i = lines.findIndex((l) => l.id === label.id);
  if (i < 0 || lines[i]?.speaker === label.speaker) return lines;
  return lines.map((l, j) => (j === i ? { ...l, speaker: label.speaker } : l));
}

// Khóa lượt nói: giọng đã gộp tay tính như giọng đích.
function turnKey(voice: SpeakerVoice | null): number | null {
  return voice === null ? null : (voice.mergedInto ?? voice.id);
}

export interface Decorated<T> {
  item: T;
  voice: SpeakerVoice | null;
  // Dòng đầu của lượt nói: tên có màu (thanh phụ đề), nhãn dạng chip (bản chép lời).
  turnStart: boolean;
}

// Gắn giọng và cờ "dòng đầu lượt nói" (spec §8.1, §8.2) cho các dòng theo thứ tự vẽ. Dòng chưa xác định không có giọng; dòng có
// giọng sau nó luôn là dòng đầu lượt (QĐ 6 của kế hoạch 03: thà lặp tên còn hơn để người đọc đoán).
export function decorate<T>(items: readonly T[], speakerOf: (item: T) => number | null, voices: VoiceMap): Decorated<T>[] {
  let previous: number | null = null;
  return items.map((item) => {
    const id = speakerOf(item);
    const voice = id === null ? null : (voices.get(id) ?? null);
    const key = turnKey(voice);
    const turnStart = key !== null && key !== previous;
    previous = key;
    return { item, voice, turnStart };
  });
}

// Biến CSS màu của giọng: bảng 8 màu ở `overlay.css` (nền tối của thanh) và `tokens.css` (cửa sổ chính, sáng và tối) (QĐ 1).
export function speakerColor(color: number): string {
  return `var(--spk-${((Math.trunc(color) % 8) + 8) % 8})`;
}

// Tên chèn vào giữa câu (tiêu đề "Đổi tên “…”", nhãn cho trình đọc màn hình): bọc trong FSI…PDI (U+2068, U+2069) để chữ viết từ
// phải sang trái hay ký tự định dạng lạ trong tên không đảo phần chữ quanh nó (QĐ 11 của kế hoạch 03; rà soát B-N8).
export function isolateName(name: string): string {
  return `\u2068${name}\u2069`;
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run src/lib/speakers.test.ts 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: `10 passed`; `tsc-ok`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short | grep speakers`
Expected: `?? src/lib/speakers.ts`, `?? src/lib/speakers.test.ts` (cùng `?? src/i18n/speakers.test.ts`, `?? src-tauri/src/transcript/speakers.rs` của Task trước). Không commit.

---

### Task 13: Store của thanh phụ đề: bảng giọng, nhãn muộn, dòng mời

**Files:**
- Modify: `src/store/overlay.ts:1-2` (import), `:4-5` (chú thích đầu file), `:98-107` (`OverlayStoreState`), `:109-144` (`createOverlayStore`)
- Test: `src/store/overlay.test.ts`

- [ ] **Step 1: Viết test đỏ**

Trong `src/store/overlay.test.ts`: đổi dòng import kiểu thành `import type { AppStatus, LiveLine, OverlayView, SpeakerRoster, SpeakerVoice, Subtitle } from "../lib/ipc";`, rồi thêm cuối file:

```ts
describe("người nói trên thanh phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §8.1)", () => {
  const voice = (id: number, label = `Người ${id}`): SpeakerVoice => ({
    id,
    label,
    color: id - 1,
    source: "voice",
    room: false,
    mergedInto: null,
  });
  let rev = 0;
  const roster = (voices: SpeakerVoice[], askAccess = false): SpeakerRoster => ({
    voices,
    participants: [],
    askAccess,
    rev: ++rev,
  });

  it("nhãn tới muộn sửa đúng dòng; bảng giọng mới giữ đối tượng của giọng không đổi", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("subtitle://upsert", sub(2, "hai"));
    const before = store.getState().lines;
    fake.emit("subtitle://speaker", { id: 2, speaker: 1 });
    const after = store.getState().lines;
    expect(after[0]).toBe(before[0]);
    expect(after[1]?.speaker).toBe(1);
    fake.emit("subtitle://speaker", { id: 99, speaker: 1 });
    expect(store.getState().lines).toBe(after);
    fake.emit("speaker://roster", roster([voice(1), voice(2)]));
    const first = store.getState().voices;
    fake.emit("speaker://roster", roster([voice(1), voice(2, "Minh")]));
    expect(store.getState().voices.get(1)).toBe(first.get(1));
    expect(store.getState().voices.get(2)?.label).toBe("Minh");
  });

  it("dòng mời: hiện theo phía Rust, ✕ ẩn tới hết phiên; phiên mới thì bỏ bảng giọng và dòng mời", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    fake.emit("speaker://roster", roster([voice(1)], true));
    expect(store.getState().askAccess).toBe(true);
    store.getState().dismissAsk();
    expect(store.getState().askDismissed).toBe(true);
    fake.emit("speaker://roster", roster([voice(1), voice(2)], true));
    expect(store.getState().askDismissed).toBe(true);
    fake.emit("app://status", status("starting", 5));
    expect(store.getState().voices.size).toBe(0);
    expect(store.getState().askAccess).toBe(false);
    expect(store.getState().askDismissed).toBe(false);
  });

  // QĐ 25 (rà soát A-N2): bảng tính trên hai luồng có thể tới không theo thứ tự; bảng cũ hơn tới muộn thì bỏ, tên vừa đổi không quay lại.
  it("bảng người nói có rev nhỏ hơn bảng đã nhận thì bỏ", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    fake.emit("speaker://roster", { voices: [voice(1, "Lan")], participants: [], askAccess: false, rev: 50 });
    fake.emit("speaker://roster", { voices: [voice(1)], participants: [], askAccess: false, rev: 49 });
    expect(store.getState().voices.get(1)?.label).toBe("Lan");
    fake.emit("speaker://roster", { voices: [voice(1, "Hoa")], participants: [], askAccess: false, rev: 51 });
    expect(store.getState().voices.get(1)?.label).toBe("Hoa");
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && node_modules/.bin/vitest run src/store/overlay.test.ts 2>&1 | tail -4`
Expected: `3 failed` (`voices` undefined, `dismissAsk is not a function`).

- [ ] **Step 3: Cài đặt**

Trong `src/store/overlay.ts`:
- Sau dòng `import type { AppStatus, Ipc, LiveLine, OverlayView, ResizeEdge, Subtitle, SubtitleDelta } from "../lib/ipc";` thêm `import { NO_VOICES, type VoiceMap, mergeVoices, setSpeaker } from "../lib/speakers";`.
- Trong `OverlayStoreState`, sau `level: number;` thêm:

```ts
  // Bảng giọng của phiên (spec 2026-10-26-phan-biet-nguoi-noi §8.1); giọng không đổi giữ nguyên đối tượng (dòng memo không vẽ lại).
  // Rỗng: tính năng tắt hay phiên chưa có giọng, thanh như hiện nay.
  voices: VoiceMap;
  // Dòng mời cấp quyền Trợ năng (spec §6.7): phía Rust bảo hiện (`askAccess` của `speaker://roster`), và người dùng chưa bấm ✕
  // trong phiên này (`askDismissed`, chỉ nhớ trong phiên).
  askAccess: boolean;
  askDismissed: boolean;
  // Số thứ tự của bảng người nói đã nhận (`rev`, QĐ 25 của kế hoạch 03): bảng có số nhỏ hơn tới muộn thì bỏ. Không đặt lại khi phiên
  // mới (phía Rust tăng suốt lần chạy của app).
  rosterRev: number;
  dismissAsk(): void;
```

- Trong `createOverlayStore`, sau `level: 0,` thêm `voices: NO_VOICES,` `askAccess: false,` `askDismissed: false,` `rosterRev: 0,`; trong `Promise.all([…])` sau listener `"subtitle://live-end"` thêm:

```ts
        // Nhãn tới muộn sửa đúng dòng; bảng người nói mới (spec 2026-10-26-phan-biet-nguoi-noi §4.3, §9), bỏ bảng cũ hơn (QĐ 25).
        ipc.listen("subtitle://speaker", (label) => set({ lines: setSpeaker(get().lines, label) })),
        ipc.listen("speaker://roster", (roster) => {
          if (roster.rev < get().rosterRev) return;
          set({ voices: mergeVoices(get().voices, roster.voices), askAccess: roster.askAccess, rosterRev: roster.rev });
        }),
```

- Trong listener `"app://status"`, thay dòng `set(fresh ? { status, lines: [], live, level } : { status, live, level });` bằng:

```ts
          set(
            fresh
              ? { status, lines: [], live, level, voices: NO_VOICES, askAccess: false, askDismissed: false }
              : { status, live, level },
          );
```

- Sau hàm `init` (trong đối tượng trả về của `createStore`) thêm:

```ts
    dismissAsk() {
      set({ askDismissed: true });
    },
```

  và trong chú thích đầu file (dòng 4–5) thay dòng

```ts
// và nghe sự kiện (phụ đề, trạng thái, mức âm lượng); không gọi được lệnh nào khác (spec §10.2).
```

  bằng

```ts
// và nghe sự kiện (phụ đề, trạng thái, mức âm lượng, người nói); lệnh khác duy nhất là `open_speaker_settings` của dòng mời cấp
// quyền (spec 2026-10-26-phan-biet-nguoi-noi §8.4).
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run src/store/overlay.test.ts 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test đạt (gồm 3 test mới); `tsc-ok`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short src/store`
Expected: `M src/store/overlay.ts`, `M src/store/overlay.test.ts` (cùng các file test của Task 11). Không commit.

---

### Task 14: Vẽ tên và vạch màu trên thanh phụ đề (`OverlayLine`, `LiveLineView`, CSS)

**Files:**
- Modify: `src/windows/overlay/OverlayLine.tsx`, `src/windows/overlay/LiveLineView.tsx`, `src/windows/overlay/overlay.css` (thêm cuối file)
- Test: `src/windows/overlay/{OverlayLine,LiveLineView}.test.ts`, `src/windows/overlay/overlay.css.test.ts`

- [ ] **Step 1: Viết test đỏ**

`src/windows/overlay/OverlayLine.test.ts`: import kiểu thành `import type { SpeakerVoice, Subtitle } from "../../lib/ipc";`; thêm vào cuối `describe("OverlayLine", …)`:

```ts
  // Spec 2026-10-26-phan-biet-nguoi-noi §8.1: dòng đầu lượt nói có tên màu, mọi dòng của giọng có vạch màu; không có giọng thì như cũ.
  it("giọng: tên có màu ở dòng đầu lượt nói, vạch màu ở mọi dòng của giọng", () => {
    const voice: SpeakerVoice = { id: 2, label: "Minh Trần", color: 1, source: "user", room: false, mergedInto: null };
    const line = sub({ tgt_text: "Xin chào", speaker: 2 });
    expect(html({ line, showSource: true, uiLanguage: "vi", voice, turnStart: true })).toBe(
      '<div class="line translated spk" style="--spk:var(--spk-1)"><div class="spk-label">Minh Trần</div>' +
        '<div class="spk-body"><div class="source">Hello</div><div class="main">Xin chào</div></div></div>',
    );
    expect(html({ line, showSource: false, uiLanguage: "vi", voice, turnStart: false })).toBe(
      '<div class="line translated spk" style="--spk:var(--spk-1)"><div class="spk-body"><div class="main">Xin chào</div></div></div>',
    );
    expect(html({ line, showSource: false, uiLanguage: "vi", voice: null, turnStart: true })).toBe(
      '<div class="line translated"><div class="main">Xin chào</div></div>',
    );
  });
```

`src/windows/overlay/LiveLineView.test.ts`: import kiểu thành `import type { LiveLine, SpeakerVoice } from "../../lib/ipc";`; thêm vào cuối `describe`:

```ts
  // QĐ 5 của kế hoạch 03 phân biệt người nói: dòng nối tiếp mang giọng của câu nó nối tiếp, vẽ như phụ đề; lượt mới thì như cũ.
  it("dòng nối tiếp mang vạch và tên của câu nó nối tiếp", () => {
    const voice: SpeakerVoice = { id: 1, label: "Lan", color: 0, source: "name", room: false, mergedInto: null };
    expect(html({ live: live({ extends: 6, speaker: 1 }), showSource: false, voice, turnStart: true })).toBe(
      '<div class="line live spk" style="--spk:var(--spk-0)"><div class="spk-label">Lan</div><div class="spk-body">' +
        '<div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div></div>',
    );
    expect(html({ live: live(), showSource: false })).toBe(
      '<div class="line live"><div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div>',
    );
  });
```

`src/windows/overlay/overlay.css.test.ts`: thêm vào cuối `describe("overlay.css", …)`:

```ts
  // Spec 2026-10-26-phan-biet-nguoi-noi §8.1: đúng bảng 8 màu của spec cho nền tối, tên 0,56 em đậm, vạch 0,16 em; câu không giọng
  // trong phiên có giọng chừa cùng lề (QĐ 7 của kế hoạch 03).
  it("người nói: bảng 8 màu của spec, tên 0,56 em đậm, vạch 0,16 em, cùng lề", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const colors = [...root.matchAll(/--spk-\d:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]);
    expect(colors).toEqual(["#7cc4ff", "#ffb86b", "#9be38f", "#f59fd5", "#c7a6ff", "#ffe27a", "#6fe0d2", "#ff8f8f"]);
    const label = /\.overlay\s+\.spk-label\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(label).toMatch(/font-size:\s*0\.56em/);
    expect(label).toMatch(/font-weight:\s*700/);
    const body = /\.overlay\s+\.spk-body\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(body).toMatch(/border-left:\s*0\.16em solid var\(--spk\)/);
    expect(body).toMatch(/padding-left:\s*0\.45em/);
    const gutter = /\.overlay\s+\.lines\.has-speakers\s*>\s*\.line:not\(\.spk\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(gutter).toMatch(/padding-left:\s*0\.61em/);
  });
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && node_modules/.bin/vitest run src/windows/overlay 2>&1 | tail -4`
Expected: `3 failed` (markup chưa có `spk`, CSS chưa có bảng màu).

- [ ] **Step 3: Cài đặt `OverlayLine.tsx`**

Thay toàn bộ `src/windows/overlay/OverlayLine.tsx` bằng:

```tsx
import { type CSSProperties, memo } from "react";
import { type UiLanguage, translate } from "../../i18n";
import type { SpeakerVoice, Subtitle } from "../../lib/ipc";
import { speakerColor } from "../../lib/speakers";
import { lineView } from "../../lib/subtitleView";

// Một dòng của thanh phụ đề (§4.4; H8 của kế hoạch 00 "dịch trong lúc người nói chưa dừng"). Memo theo từng dòng (spec
// 2026-10-10 §8, A4): props là đối tượng phụ đề, đối tượng giọng và các giá trị nguyên thủy, so nông là đủ. Mỗi gói chữ dịch
// (`subtitle://delta`) chỉ đổi đối tượng của đúng một dòng (`appendDelta`, `upsertLine` giữ nguyên các dòng khác), và bảng giọng
// mới giữ nguyên đối tượng của giọng không đổi (`mergeVoices`), nên các dòng khác không vẽ lại. Dòng đang nói vẽ ở
// `LiveLineView.tsx`, cùng cấu trúc `.line`, `.source`, `.main`.
//
// Người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.1): dòng có giọng thì vạch màu bên trái (`.spk-body`), dòng đầu lượt nói thêm tên
// có màu phía trên (`.spk-label`); không có giọng thì vẽ đúng như trước khi có tính năng.
export interface OverlayLineProps {
  line: Subtitle;
  showSource: boolean;
  uiLanguage: UiLanguage;
  // Phụ đề tạm (§6.3 spec chính) nhạt cả dòng. Khi đang dịch trong lúc người nói chưa dừng thì không (spec 2026-10-10 §6.1):
  // chỉ phần tạm của dòng đang nói nhạt. Mặc định `true`.
  dimProvisional?: boolean;
  // Giọng của dòng; `null` (chưa xác định, tính năng tắt) thì vẽ như cũ.
  voice?: SpeakerVoice | null;
  // Dòng đầu của lượt nói: tên có màu phía trên.
  turnStart?: boolean;
}

export const OverlayLine = memo(function OverlayLine({
  line,
  showSource,
  uiLanguage,
  dimProvisional = true,
  voice = null,
  turnStart = false,
}: OverlayLineProps) {
  const v = lineView(line, showSource);
  const classes = ["line", v.kind, dimProvisional && v.provisional ? "provisional" : "", voice ? "spk" : ""]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      {v.source && <div className="source">{v.source}</div>}
      <div className="main">
        {v.kind === "dropped" ? translate(uiLanguage, "subtitle.dropped") : v.main}
        {v.kind === "failed" && <span className="tag">{translate(uiLanguage, "subtitle.failed")}</span>}
      </div>
    </>
  );
  if (!voice) return <div className={classes}>{body}</div>;
  return (
    <div className={classes} style={{ "--spk": speakerColor(voice.color) } as CSSProperties}>
      {turnStart && <div className="spk-label">{voice.label}</div>}
      <div className="spk-body">{body}</div>
    </div>
  );
});
```

- [ ] **Step 4: Cài đặt `LiveLineView.tsx`**

Thay toàn bộ `src/windows/overlay/LiveLineView.tsx` bằng:

```tsx
import { type CSSProperties, memo } from "react";
import { TwoTier } from "../../components/TwoTier";
import type { LiveLine, SpeakerVoice } from "../../lib/ipc";
import { speakerColor } from "../../lib/speakers";

// Dòng đang nói của thanh phụ đề (spec 2026-10-10 §6.1; H8 của kế hoạch 00): cùng cấu trúc `.line`, `.source`, `.main` với
// `OverlayLine`, thêm lớp `live`. Câu gốc (khi bật "hiện câu gốc") và bản dịch đều hai tầng (`TwoTier`): phần ổn định giữ
// độ đậm bình thường, phần tạm nhạt. Chưa có chữ dịch (đang chờ bản dịch tạm đầu, câu đã là ngôn ngữ đích, dịch không khả
// dụng) thì dòng chính là câu gốc hai tầng, không có dòng câu gốc nhỏ. Memo so nông như `OverlayLine`: mỗi lần
// `subtitle://live` chỉ đổi đối tượng của đúng một dòng.
//
// Người nói (QĐ 5 của kế hoạch 03 phân biệt người nói): dòng nối tiếp một câu mang giọng của câu đó (`LiveLine.speaker`), vẽ như
// `OverlayLine`; lượt nói mới chưa có giọng thì như cũ.
export interface LiveLineViewProps {
  live: LiveLine;
  showSource: boolean;
  voice?: SpeakerVoice | null;
  turnStart?: boolean;
}

export const LiveLineView = memo(function LiveLineView({
  live,
  showSource,
  voice = null,
  turnStart = false,
}: LiveLineViewProps) {
  const translated = live.tgt_stable !== "" || live.tgt_tail !== "";
  const body = (
    <>
      {translated && showSource && (
        <div className="source">
          <TwoTier stable={live.src_stable} tail={live.src_tail} />
        </div>
      )}
      <div className="main">
        {translated ? (
          <TwoTier stable={live.tgt_stable} tail={live.tgt_tail} />
        ) : (
          <TwoTier stable={live.src_stable} tail={live.src_tail} />
        )}
      </div>
    </>
  );
  if (!voice) return <div className="line live">{body}</div>;
  return (
    <div className="line live spk" style={{ "--spk": speakerColor(voice.color) } as CSSProperties}>
      {turnStart && <div className="spk-label">{voice.label}</div>}
      <div className="spk-body">{body}</div>
    </div>
  );
});
```

- [ ] **Step 5: Cài đặt CSS**

Thêm vào cuối `src/windows/overlay/overlay.css`:

```css
/* Phân biệt người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.1): bảng 8 màu đọc rõ trên nền tối của thanh; giọng thứ N lấy màu
   `--spk-<(N − 1) mod 8>` (`speakerColor`). Tên có màu ở dòng đầu mỗi lượt nói (0,56 em, đậm), vạch màu 0,16 em bên trái mọi câu
   của giọng. Câu chưa xác định không nhãn, không vạch; khi phiên đã có giọng thì mọi câu chừa cùng một lề (QĐ 7 của kế hoạch 03). */
:root {
  --spk-0: #7cc4ff;
  --spk-1: #ffb86b;
  --spk-2: #9be38f;
  --spk-3: #f59fd5;
  --spk-4: #c7a6ff;
  --spk-5: #ffe27a;
  --spk-6: #6fe0d2;
  --spk-7: #ff8f8f;
}

.overlay .spk-label {
  margin: 0 0 0.08em 0.05em;
  color: var(--spk);
  font-size: 0.56em;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.25;
  /* Tên viết từ phải sang trái hay có ký tự định dạng lạ không đảo phần xung quanh (QĐ 11). */
  unicode-bidi: isolate;
}

.overlay .spk-body {
  padding-left: 0.45em;
  border-left: 0.16em solid var(--spk);
}

/* Câu không có giọng trong phiên đã có giọng: cùng lề với câu có vạch (0,16 em vạch + 0,45 em đệm). */
.overlay .lines.has-speakers > .line:not(.spk) {
  padding-left: 0.61em;
}

/* Dòng mời cấp quyền Trợ năng (spec §6.7, §8.1): trên cùng, nền mờ, chữ nhỏ cố định (không theo cỡ chữ phụ đề); nút "Mở Cài đặt"
   và ✕. Chỉ hiện khi thanh chưa khóa. Đỉnh ở 0,7 rem đệm + 1,25 rem = 1,95 rem, thấp hơn đáy hàng chỉ báo ở góc phải (`top: 0.45rem`,
   cao ~1,3 rem với lời nhắc), nên lời nhắc dài không đè lên dòng mời (rà soát B-N3). */
.overlay .ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-self: flex-start;
  gap: 0.3rem 0.55rem;
  max-width: calc(100% - 3.5rem);
  margin: 1.25rem 0 0.15rem;
  padding: 0.3rem 0.65rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.14);
  font: 500 12.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  text-shadow: none;
}
.overlay .ask button {
  padding: 0.1rem 0.45rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #ffe27a;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.overlay .ask button:hover {
  background: rgba(255, 255, 255, 0.16);
}
.overlay .ask .ask-close {
  color: rgba(255, 255, 255, 0.75);
  font-weight: 400;
}
```

- [ ] **Step 6: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run src/windows/overlay 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test đạt (test cũ "vẽ đúng như thanh phụ đề trước khi tách component" giữ nguyên markup; ba test mới); `tsc-ok`.

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && git status --short src/windows/overlay`
Expected: `M` sáu file (`OverlayLine.tsx`, `LiveLineView.tsx`, `overlay.css` và ba file test). Không commit.

---

### Task 15: Thanh phụ đề: bảng giọng vào các dòng, khoảng lề, dòng mời

**Files:**
- Create: `src/windows/overlay/SpeakerAsk.tsx`, `src/windows/overlay/SpeakerAsk.test.ts`
- Modify: `src/windows/overlay/overlay.tsx`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/windows/overlay/SpeakerAsk.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeakerAsk } from "./SpeakerAsk";

// Spec 2026-10-26-phan-biet-nguoi-noi §6.7, §8.1: dòng mời cấp quyền: chữ nhỏ, nút "Mở Cài đặt" và ✕ (ẩn tới hết phiên); không phải
// vùng kéo thanh.
describe("SpeakerAsk", () => {
  it("có chữ mời, nút Mở Cài đặt và nút ✕ có nhãn cho trình đọc màn hình", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerAsk, { uiLanguage: "vi", onOpen: () => {}, onDismiss: () => {} }),
    );
    expect(markup).toContain('<div class="ask" role="status" data-tauri-drag-region="false">');
    expect(markup).toContain('<span class="ask-text">Cho phép quyền Trợ năng để hiện tên người nói</span>');
    expect(markup).toContain('class="ask-open" data-tauri-drag-region="false">Mở cài đặt</button>');
    expect(markup).toContain('aria-label="Ẩn tới hết phiên"');
  });
});
```

Run: `cd $W && node_modules/.bin/vitest run src/windows/overlay/SpeakerAsk.test.ts 2>&1 | tail -3`
Expected: lỗi `Failed to resolve import "./SpeakerAsk"`.

- [ ] **Step 2: Cài đặt `SpeakerAsk.tsx`**

Tạo `src/windows/overlay/SpeakerAsk.tsx`:

```tsx
import { type MessageKey, type UiLanguage, translate } from "../../i18n";

// Dòng mời cấp quyền Trợ năng trên thanh phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §6.7, §8.1): trên cùng, nền mờ, chữ nhỏ. "Mở
// Cài đặt" gọi lệnh duy nhất kế hoạch 03 thêm cho cửa sổ này (`open_speaker_settings`, không tham số); ✕ ẩn tới hết phiên. Bên gọi
// chỉ vẽ khi thanh chưa khóa (khóa thì click đi xuyên qua). Không phải vùng kéo thanh.
export interface SpeakerAskProps {
  uiLanguage: UiLanguage;
  onOpen(): void;
  onDismiss(): void;
}

export function SpeakerAsk({ uiLanguage, onOpen, onDismiss }: SpeakerAskProps) {
  const t = (key: MessageKey) => translate(uiLanguage, key);
  return (
    <div className="ask" role="status" data-tauri-drag-region="false">
      <span aria-hidden="true">🔒</span>
      <span className="ask-text">{t("overlay.speakers.ask")}</span>
      <button type="button" className="ask-open" data-tauri-drag-region="false" onClick={onOpen}>
        {t("notice.openSettings")}
      </button>
      <button
        type="button"
        className="ask-close"
        data-tauri-drag-region="false"
        aria-label={t("overlay.speakers.dismiss")}
        title={t("overlay.speakers.dismiss")}
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Nối vào `overlay.tsx`**

Trong `src/windows/overlay/overlay.tsx`:
- Thêm import: `import { decorate } from "../../lib/speakers";`, `import { SpeakerAsk } from "./SpeakerAsk";`, và đổi `import { createOverlayStore, createResizeDrag, visibleRows } from "../../store/overlay";` thành `import { type OverlayRow, createOverlayStore, createResizeDrag, visibleRows } from "../../store/overlay";`.
- Trước `function Overlay()` thêm:

```tsx
// Giọng của một dòng thanh phụ đề: phụ đề, hay dòng đang nói (giọng của câu nó nối tiếp, QĐ 5 của kế hoạch 03 phân biệt người nói).
const rowSpeaker = (r: OverlayRow) => (r.kind === "live" ? r.live.speaker : r.line.speaker);
```

- Trong chú thích trên `function Overlay()` thêm dòng cuối: `// Người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.1): tên có màu ở dòng đầu mỗi lượt, vạch màu mọi câu của giọng (tra bảng giọng của\n// phiên, không chờ gì); dòng mời cấp quyền Trợ năng ở trên cùng khi phía Rust bảo và thanh chưa khóa.`
- Trong `Overlay`, thay

```tsx
  const level = useStore(store, (s) => s.level);
  // Phụ đề và dòng đang nói theo đúng chỗ; chỉ tính lại khi một trong hai đổi.
  const rows = useMemo(() => visibleRows(lines, live), [lines, live]);
```

bằng

```tsx
  const level = useStore(store, (s) => s.level);
  const voices = useStore(store, (s) => s.voices);
  const askAccess = useStore(store, (s) => s.askAccess);
  const askDismissed = useStore(store, (s) => s.askDismissed);
  // Phụ đề và dòng đang nói theo đúng chỗ, cùng giọng và cờ dòng đầu lượt; chỉ tính lại khi phụ đề, dòng đang nói hay bảng giọng
  // đổi. Đối tượng phụ đề, dòng đang nói và giọng giữ nguyên tham chiếu, nên các dòng memo không đổi thì không vẽ lại.
  const rows = useMemo(() => decorate(visibleRows(lines, live), rowSpeaker, voices), [lines, live, voices]);
```

- Sau dòng `const dimProvisional = !streamingEffective(view.translateWhileSpeaking, status);` thêm:

```tsx
  // Dòng mời cấp quyền (spec §6.7): đang dịch, phía Rust bảo hiện, chưa bấm ✕ trong phiên, thanh chưa khóa.
  const showAsk = running && askAccess && !askDismissed && !view.locked;
```

- Thay khối

```tsx
      <div className="lines" ref={scroller} onScroll={syncFollow}>
        {rows.length === 0 && notes.length === 0 && <div className="waiting">{t("overlay.waiting")}</div>}
        {rows.map((r) =>
          r.kind === "live" ? (
            <LiveLineView key={`live-${r.live.id}`} live={r.live} showSource={view.showSource} />
          ) : (
            <OverlayLine
              key={r.line.id}
              line={r.line}
              showSource={view.showSource}
              uiLanguage={view.uiLanguage}
              dimProvisional={dimProvisional}
            />
          ),
        )}
      </div>
```

bằng

```tsx
      {showAsk && (
        <SpeakerAsk
          uiLanguage={view.uiLanguage}
          onOpen={() => void ipc.invoke("open_speaker_settings").catch(() => {})}
          onDismiss={() => store.getState().dismissAsk()}
        />
      )}
      <div className={voices.size > 0 ? "lines has-speakers" : "lines"} ref={scroller} onScroll={syncFollow}>
        {rows.length === 0 && notes.length === 0 && <div className="waiting">{t("overlay.waiting")}</div>}
        {rows.map(({ item: r, voice, turnStart }) =>
          r.kind === "live" ? (
            <LiveLineView
              key={`live-${r.live.id}`}
              live={r.live}
              showSource={view.showSource}
              voice={voice}
              turnStart={turnStart}
            />
          ) : (
            <OverlayLine
              key={r.line.id}
              line={r.line}
              showSource={view.showSource}
              uiLanguage={view.uiLanguage}
              dimProvisional={dimProvisional}
              voice={voice}
              turnStart={turnStart}
            />
          ),
        )}
      </div>
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run src/windows/overlay src/store/overlay.test.ts 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test đạt; `tsc-ok`. (Vẽ thật của thanh phụ đề kiểm bằng ảnh ở Task 21.)

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short src/windows/overlay`
Expected: thêm `?? SpeakerAsk.tsx`, `?? SpeakerAsk.test.ts`, `M overlay.tsx`. Không commit.

---

### Task 16: Store của bản chép lời: bảng người nói, đổi tên, gộp, SRT có tên

**Files:**
- Modify: `src/store/transcript.ts`
- Test: `src/store/transcript.test.ts`

- [ ] **Step 1: Viết test đỏ**

Trong `src/store/transcript.test.ts`:
- đổi import kiểu thành `import type { AppStatus, SpeakerRoster, SpeakerVoice, Subtitle, Transcript } from "../lib/ipc";`;
- sau hàm `transcript` thêm:

```ts
const voice = (id: number, patch: Partial<SpeakerVoice> = {}): SpeakerVoice => ({
  id,
  label: `Người ${id}`,
  color: id - 1,
  source: "voice",
  room: false,
  mergedInto: null,
  ...patch,
});
```

- trong test "xuất file: báo đường dẫn…", đổi kỳ vọng `expect(fake.calls.at(-1)?.args).toEqual({ … utcOffsetMinutes: 420, })` thành có thêm `srtSpeakers: false,` sau `utcOffsetMinutes: 420,`;
- thêm vào cuối `describe("transcript store", …)`:

```ts
  // Spec 2026-10-26-phan-biet-nguoi-noi §8.2, §9.
  it("theo nhãn tới muộn và bảng người nói; phiên mới thì bỏ", async () => {
    const { fake, store } = setup(transcript([sub(1, "một"), sub(2, "hai")]));
    await store.getState().init();
    fake.emit("subtitle://speaker", { id: 2, speaker: 1 });
    expect(store.getState().transcript?.lines.map((l) => l.speaker)).toEqual([null, 1]);
    fake.emit("speaker://roster", { voices: [voice(1)], participants: ["Hoa Phạm"], askAccess: false, rev: 1 });
    expect(store.getState().transcript?.speakers).toEqual([voice(1)]);
    expect(store.getState().participants).toEqual(["Hoa Phạm"]);
    fake.emit("app://status", status("starting", 2));
    expect(store.getState().transcript?.speakers).toEqual([]);
    expect(store.getState().participants).toEqual([]);
  });

  it("đổi tên, gộp qua phía Rust rồi dùng bảng trả về; lỗi thì hiện mã lỗi", async () => {
    const renamed: SpeakerRoster = {
      voices: [voice(1, { label: "Lan", source: "user" })],
      participants: [],
      askAccess: false,
      rev: 1,
    };
    const merged: SpeakerRoster = {
      voices: [voice(1), voice(2, { mergedInto: 1, label: "Người 1", color: 0 })],
      participants: [],
      askAccess: false,
      rev: 2,
    };
    const fake = fakeIpc({
      get_transcript: () => transcript([]),
      rename_speaker: ({ name }) => {
        if (name === "x") throw { code: "speakerNotFound", field: null, message: "…" };
        return renamed;
      },
      merge_speakers: () => merged,
    });
    const store = createTranscriptStore({ ipc: fake.ipc, writeClipboard: async () => {} });
    await store.getState().init();
    expect(await store.getState().renameSpeaker(1, "Lan")).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ cmd: "rename_speaker", args: { id: 1, name: "Lan" } });
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Lan");
    expect(await store.getState().mergeSpeakers(2, 1)).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ cmd: "merge_speakers", args: { from: 2, into: 1 } });
    expect(store.getState().transcript?.speakers[1]?.mergedInto).toBe(1);
    expect(await store.getState().renameSpeaker(1, "x")).toBe(false);
    expect(store.getState().error).toEqual({ code: "speakerNotFound", field: null });
  });

  it("xuất SRT có tên người nói khi chọn", async () => {
    const { fake, store } = setup(transcript([]));
    await store.getState().init();
    await store.getState().exportTo({ kind: "current" }, "srt", "translation", 9_000, true);
    expect(fake.calls.at(-1)?.args).toMatchObject({ format: "srt", srtSpeakers: true });
  });

  // QĐ 25 (rà soát A-N2, B-N11): bảng cũ hơn tới muộn thì bỏ; bản chụp `get_transcript` cũ hơn không đè bảng mới hơn.
  it("bảng người nói hay bản chụp cũ hơn tới muộn thì không đè bảng mới", async () => {
    const { fake, store, setSnapshot } = setup(transcript([sub(1, "một")]));
    await store.getState().init();
    fake.emit("speaker://roster", { voices: [voice(1, { label: "Lan" })], participants: [], askAccess: false, rev: 7 });
    fake.emit("speaker://roster", { voices: [voice(1)], participants: [], askAccess: false, rev: 6 });
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Lan");
    setSnapshot({ ...transcript([sub(1, "một")]), speakers: [voice(1)], speakersRev: 5 });
    fake.emit("app://status", status("running", 3));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Lan");
    setSnapshot({ ...transcript([sub(1, "một")]), speakers: [voice(1, { label: "Hoa" })], speakersRev: 8 });
    fake.emit("app://status", status("idle", 4));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Hoa");
  });
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && node_modules/.bin/vitest run src/store/transcript.test.ts 2>&1 | tail -4`
Expected: `5 failed` (năm test kể trên).

- [ ] **Step 3: Cài đặt**

Trong `src/store/transcript.ts`:
- Dòng import kiểu: thêm `SpeakerRoster` (`import type { AppStatus, ExportFormat, Ipc, SpeakerRoster, SrtText, Subtitle, Transcript, TranscriptRef } from "../lib/ipc";`); thêm `import { setSpeaker } from "../lib/speakers";`.
- Chú thích đầu file: thêm hai dòng cuối

```ts
// Người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.2, §9): nhãn tới muộn, bảng người nói, đổi tên và gộp đi qua phía Rust (bảng
// người nói của phiên ở `TranscriptStore`), store chỉ nhận bảng mới; bảng hay bản chụp cũ hơn (`rev`) thì bỏ.
```
- Trong `TranscriptStoreState`: sau `transcript: Transcript | null;` thêm

```ts
  // Tên người tham dự của phiên hiện tại (kế hoạch 04 đọc), cho "Chọn người trong cuộc họp" (spec 2026-10-26-phan-biet-nguoi-noi
  // §8.2).
  participants: string[];
```

  đổi khai báo `exportTo` thành

```ts
  // `srtSpeakers`: SRT có tên người nói (ô "Thêm tên người nói", mặc định tắt).
  exportTo(
    source: TranscriptRef,
    format: ExportFormat,
    srtText: SrtText,
    startedAt: number,
    srtSpeakers?: boolean,
  ): Promise<void>;
  // Đổi tên, gộp người nói trong phiên đang chạy (spec §8.2). `true` khi xong; lỗi ở `error`.
  renameSpeaker(id: number, name: string): Promise<boolean>;
  mergeSpeakers(from: number, into: number): Promise<boolean>;
```

- Trong `createTranscriptStore`, sau dòng `let lastSession: AppStatus["session"] | null = null;` thêm

```ts
  // Số thứ tự của bảng người nói đang hiện (`rev`, QĐ 25 của kế hoạch 03): bảng hay bản chụp cũ hơn tới muộn thì bỏ. Không đặt lại
  // khi phiên mới (phía Rust tăng suốt lần chạy của app).
  let rosterRev = 0;
```

- Thay hàm `refresh` bằng

```ts
    async function refresh() {
      const snapshot = await ipc.invoke("get_transcript");
      const current = get().transcript;
      const lines = mergeSnapshot(current?.lines ?? [], snapshot.lines, removed);
      // Bảng người nói của bản chụp chỉ thay bảng đang hiện khi không cũ hơn (rà soát B-N11).
      const fresh = snapshot.speakersRev >= rosterRev;
      if (fresh) rosterRev = snapshot.speakersRev;
      const speakers = fresh || !current ? snapshot.speakers : current.speakers;
      set({ transcript: { ...snapshot, lines, speakers } });
    }
```

- Sau `const empty = …;` thêm

```ts
    // Bảng người nói mới (sự kiện, hay kết quả của lệnh đổi tên, gộp); bảng cũ hơn bảng đang hiện thì bỏ.
    function applyRoster(roster: SpeakerRoster) {
      if (roster.rev < rosterRev) return;
      rosterRev = roster.rev;
      const current = get().transcript ?? empty();
      set({ transcript: { ...current, speakers: roster.voices }, participants: roster.participants });
    }

    async function speakerCall(call: () => Promise<SpeakerRoster>): Promise<boolean> {
      try {
        applyRoster(await call());
        set({ error: null });
        return true;
      } catch (e) {
        set({ error: toUiError(e), notice: null });
        return false;
      }
    }
```

- Trong `onStatus`, đổi `set({ transcript: empty() });` thành `set({ transcript: empty(), participants: [] });`.
- Trong đối tượng trả về: sau `transcript: null,` thêm `participants: [],`; trong `Promise.all([…])` của `init`, sau listener `"subtitle://delta"` thêm

```ts
          ipc.listen("subtitle://speaker", (label) => {
            const current = get().transcript;
            if (!current) return;
            const lines = setSpeaker(current.lines, label);
            if (lines !== current.lines) set({ transcript: { ...current, lines } });
          }),
          ipc.listen("speaker://roster", applyRoster),
```

- Thay `exportTo` bằng

```ts
      async exportTo(source, format, srtText, startedAt, srtSpeakers = false) {
        await run(async () => {
          const path = await ipc.invoke("export_transcript", {
            source,
            format,
            srtText,
            utcOffsetMinutes: offsetMinutes(startedAt),
            srtSpeakers,
          });
          return path === null ? null : { kind: "exported", path };
        });
      },

      renameSpeaker(id, name) {
        return speakerCall(() => ipc.invoke("rename_speaker", { id, name }));
      },

      mergeSpeakers(from, into) {
        return speakerCall(() => ipc.invoke("merge_speakers", { from, into }));
      },
```

- Trong `reset`, đổi `set({ transcript: empty(), notice: null, error: null });` thành `set({ transcript: empty(), participants: [], notice: null, error: null });`.

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run src/store 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test đạt; `tsc-ok`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short src/store`
Expected: `M src/store/transcript.ts`, `M src/store/transcript.test.ts` (cùng file của Task trước). Không commit.

---

### Task 17: Bản chép lời: dòng memo, nhãn dạng chip, vạch màu, bảng màu sáng/tối, ô SRT

**Files:**
- Create: `src/windows/main/TranscriptRow.tsx`, `src/windows/main/TranscriptRow.test.ts`
- Modify: `src/windows/main/TranscriptView.tsx` (thay cả file), `src/styles/tokens.css`, `src/styles/main.css:1296-1316` (`.transcript`) và thêm khối mới

- [ ] **Step 1: Viết test đỏ**

Tạo `src/windows/main/TranscriptRow.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerVoice, Subtitle } from "../../lib/ipc";
import { TranscriptRow, type TranscriptRowProps } from "./TranscriptRow";

const sub = (patch: Partial<Subtitle> = {}): Subtitle => ({
  id: 7,
  start_ms: 0,
  end_ms: 900,
  src_lang: "en",
  src_text: "Hello",
  tgt_text: "Xin chào",
  status: "done",
  provisional: false,
  replaces: [],
  speaker: null,
  ...patch,
});

const voice: SpeakerVoice = { id: 3, label: "Người 3", color: 2, source: "voice", room: false, mergedInto: null };

const html = (patch: Partial<TranscriptRowProps> = {}) =>
  renderToStaticMarkup(
    createElement(TranscriptRow, {
      line: sub(),
      lang: "vi",
      time: "10:28:03",
      voice: null,
      turnStart: false,
      menu: null,
      ...patch,
    }),
  );

// Spec 2026-10-26-phan-biet-nguoi-noi §8.2: nhãn dạng chip có chấm màu ở câu đầu mỗi lượt, vạch màu bên trái; Lịch sử chỉ đọc.
describe("TranscriptRow", () => {
  it("không có giọng: vẽ như trước khi có người nói", () => {
    expect(html()).toBe(
      '<li class="translated"><time>10:28:03</time><div><div class="src" lang="en">Hello</div>' +
        '<div class="tgt">Xin chào</div></div></li>',
    );
  });

  it("câu đầu lượt: chip bấm được có tên; câu sau cùng người: chỉ vạch, không lặp tên", () => {
    const first = html({ voice, turnStart: true, onSpeaker: () => {} });
    expect(first).toContain('<li class="translated spk" style="--spk:var(--spk-2)">');
    expect(first).toContain(
      '<button type="button" class="spk-chip" aria-haspopup="dialog" aria-expanded="false" ' +
        'aria-label="Người nói \u2068Người 3\u2069: đổi tên hoặc gộp"><span class="label">Người 3</span>' +
        '<span class="caret" aria-hidden="true">▾</span></button>',
    );
    const next = html({ voice, turnStart: false, onSpeaker: () => {} });
    expect(next).toContain('<li class="translated spk spk-cont" style="--spk:var(--spk-2)">');
    expect(next).not.toContain("spk-chip");
  });

  it("Lịch sử, phiên đã dừng: nhãn chỉ để đọc", () => {
    const markup = html({ voice, turnStart: true });
    expect(markup).toContain('<span class="spk-chip"><span class="label">Người 3</span></span>');
    expect(markup).not.toContain("<button");
  });

  it("là component memo so nông", () => {
    const memo = TranscriptRow as unknown as { $$typeof: symbol; compare: unknown };
    expect(memo.$$typeof).toBe(Symbol.for("react.memo"));
    expect(memo.compare).toBeNull();
  });
});
```

Run: `cd $W && node_modules/.bin/vitest run src/windows/main/TranscriptRow.test.ts 2>&1 | tail -3`
Expected: lỗi `Failed to resolve import "./TranscriptRow"`.

- [ ] **Step 2: Cài đặt `TranscriptRow.tsx`**

Tạo `src/windows/main/TranscriptRow.tsx`:

```tsx
import { type CSSProperties, memo, type ReactNode } from "react";
import { type MessageKey, type Params, type UiLanguage, translate } from "../../i18n";
import type { SpeakerVoice, Subtitle } from "../../lib/ipc";
import { isolateName, speakerColor } from "../../lib/speakers";
import { lineView } from "../../lib/subtitleView";

export interface TranscriptRowProps {
  line: Subtitle;
  lang: UiLanguage;
  // Giờ đã định dạng (`HH:MM:SS`), để memo so bằng giá trị.
  time: string;
  // Giọng của câu (spec 2026-10-26-phan-biet-nguoi-noi §8.2); `null`: chưa xác định hay phiên không có nhận giọng.
  voice: SpeakerVoice | null;
  // Câu đầu của lượt nói: nhãn dạng chip có chấm màu.
  turnStart: boolean;
  // Bấm nhãn để mở menu (phiên đang chạy). Không có thì nhãn chỉ để đọc (Lịch sử, phiên đã dừng; QĐ 10 của kế hoạch 03).
  onSpeaker?: (lineId: number) => void;
  // Menu đang mở của dòng này (`SpeakerMenu`), hay `null`.
  menu: ReactNode;
}

// Một câu của bản chép lời (§4.3): giờ, câu gốc, bản dịch; với người nói thì nhãn ở câu đầu mỗi lượt và vạch màu bên trái (spec
// 2026-10-26-phan-biet-nguoi-noi §8.2). Memo so nông: bản dịch tới dần hay giọng khác đổi tên thì các dòng khác không vẽ lại.
export const TranscriptRow = memo(function TranscriptRow({
  line,
  lang,
  time,
  voice,
  turnStart,
  onSpeaker,
  menu,
}: TranscriptRowProps) {
  const t = (key: MessageKey, params?: Params) => translate(lang, key, params);
  const v = lineView(line, true);
  const translation =
    v.kind === "translated" || v.kind === "translating" ? v.main : v.kind === "failed" ? t("subtitle.failed") : null;
  const classes = [v.kind, v.provisional ? "provisional" : "", voice ? "spk" : "", voice && !turnStart ? "spk-cont" : ""]
    .filter(Boolean)
    .join(" ");
  const style = voice ? ({ "--spk": speakerColor(voice.color) } as CSSProperties) : undefined;
  return (
    <li className={classes} style={style}>
      <time>{time}</time>
      <div>
        {voice &&
          turnStart &&
          (onSpeaker ? (
            <button
              type="button"
              className="spk-chip"
              aria-haspopup="dialog"
              aria-expanded={menu !== null}
              aria-label={t("transcript.speaker.menu", { name: isolateName(voice.label) })}
              onClick={() => onSpeaker(line.id)}
            >
              <span className="label">{voice.label}</span>
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>
          ) : (
            <span className="spk-chip">
              <span className="label">{voice.label}</span>
            </span>
          ))}
        <div className="src" lang={line.src_lang}>
          {v.kind === "dropped" ? t("subtitle.dropped") : line.src_text}
        </div>
        {translation && <div className="tgt">{translation}</div>}
      </div>
      {menu}
    </li>
  );
});
```

- [ ] **Step 3: Thay `TranscriptView.tsx`**

Thay toàn bộ `src/windows/main/TranscriptView.tsx` bằng (thanh công cụ giữ nguyên, thêm ô SRT; danh sách dùng `TranscriptRow`; menu ở Task 18):

```tsx
import { useCallback, useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { errorKey } from "../../i18n";
import type { ExportFormat, SpeakerVoice, SrtText, Transcript, TranscriptRef } from "../../lib/ipc";
import { NO_VOICES, type VoiceMap, decorate, mergeVoices } from "../../lib/speakers";
import { clockTime, localOffsetMinutes } from "../../lib/subtitleView";
import { searchLines } from "../../store/transcript";
import { fallbackLanguage, useApp, useT } from "./appStore";
import { useTranscript } from "./dataStores";
import { TranscriptRow } from "./TranscriptRow";

// Bảng giọng của bản chép lời, giữ nguyên đối tượng của giọng không đổi giữa hai lần vẽ (dòng memo của giọng đó không vẽ lại).
function useVoiceMap(speakers: readonly SpeakerVoice[]): VoiceMap {
  const previous = useRef<VoiceMap>(NO_VOICES);
  return useMemo(() => {
    previous.current = mergeVoices(previous.current, speakers);
    return previous.current;
  }, [speakers]);
}

// Một bản chép lời (§4.3): mỗi câu có giờ, câu gốc và bản dịch; tìm kiếm; sao chép (mọi gói); xuất TXT, SRT, Markdown
// (Pro). Dùng cho phiên hiện tại (màn hình Bản chép lời) và cho một phiên trong Lịch sử. Người nói (spec
// 2026-10-26-phan-biet-nguoi-noi §8.2): nhãn dạng chip có chấm màu ở câu đầu mỗi lượt nói, vạch màu bên trái các câu của giọng; bấm
// nhãn (phiên đang chạy) mở menu đổi tên, chọn người trong cuộc họp, gộp; Lịch sử và phiên đã dừng chỉ đọc.
export function TranscriptView({ transcript, source }: { transcript: Transcript; source: TranscriptRef }) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const pro = useApp((s) => s.status?.pro ?? false);
  const navigate = useApp((s) => s.navigate);
  const copy = useTranscript((s) => s.copy);
  const exportTo = useTranscript((s) => s.exportTo);
  const notice = useTranscript((s) => s.notice);
  const error = useTranscript((s) => s.error);
  const dismiss = useTranscript((s) => s.dismiss);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [srtText, setSrtText] = useState<SrtText>("translation");
  const [srtSpeakers, setSrtSpeakers] = useState(false);
  const [menuLine, setMenuLine] = useState<number | null>(null);
  const voices = useVoiceMap(transcript.speakers);
  // Đổi tên, gộp chỉ trong phiên đang chạy (QĐ 10 của kế hoạch 03).
  const editable = source.kind === "current" && transcript.session !== 0 && transcript.endedAt === null;
  const openMenu = useCallback((lineId: number) => setMenuLine((open) => (open === lineId ? null : lineId)), []);
  // Giờ theo độ lệch múi giờ lúc bắt đầu phiên, như trong file xuất (N4 của review 03).
  const offset = localOffsetMinutes(transcript.startedAt);
  const rows = decorate(searchLines(transcript.lines, query), (l) => l.speaker, voices);
  return (
    <>
      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <label className="sr-only" htmlFor="transcript-search">
              {t("transcript.search")}
            </label>
            <input
              id="transcript-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("transcript.search.placeholder")}
            />
          </div>
          <span className="spacer" />
          <button onClick={() => void copy(source, transcript.startedAt)} disabled={transcript.lines.length === 0}>
            <Icon name="copy" size={16} />
            {t("transcript.copy")}
          </button>
        </div>
        <div className="toolbar">
          <label className="toolbar-label" htmlFor="export-format">
            {t("transcript.export")}
          </label>
          <select id="export-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="txt">TXT</option>
            <option value="srt">SRT</option>
            <option value="markdown">Markdown</option>
          </select>
          {format === "srt" && (
            <select
              aria-label={t("transcript.export.srtText")}
              value={srtText}
              onChange={(e) => setSrtText(e.target.value as SrtText)}
            >
              <option value="translation">{t("transcript.export.translation")}</option>
              <option value="source">{t("transcript.export.source")}</option>
            </select>
          )}
          {format === "srt" && transcript.speakers.length > 0 && (
            <label className="toolbar-check">
              <input type="checkbox" checked={srtSpeakers} onChange={(e) => setSrtSpeakers(e.target.checked)} />
              {t("transcript.export.srtSpeakers")}
            </label>
          )}
          <button
            disabled={!pro || transcript.lines.length === 0}
            onClick={() => void exportTo(source, format, srtText, transcript.startedAt, srtSpeakers)}
          >
            <Icon name="download" size={16} />
            {t("transcript.export.button")}
          </button>
          {!pro && (
            <button className="link" onClick={() => navigate("upgrade")}>
              {t("pro.upgrade")}
            </button>
          )}
        </div>
        {!pro && <p className="hint">{t("transcript.export.pro")}</p>}
        <div role="status">
          {notice?.kind === "copied" && (
            <p className="note">
              <Icon name="check" size={16} />
              <span>{t("transcript.copied")}</span>
            </p>
          )}
          {notice?.kind === "exported" && (
            <p className="note">
              <Icon name="check" size={16} />
              <span>{t("transcript.exported", { path: notice.path })}</span>
            </p>
          )}
        </div>
        <div role="alert">
          {error && (
            <div className="notice error">
              <Icon name="alert" />
              <span>{t(errorKey(error.code))}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
      </div>
      {transcript.lines.length > 0 && rows.length === 0 && <EmptyState icon="search" text={t("transcript.noMatch")} />}
      {rows.length > 0 && (
        <ol className="transcript">
          {rows.map(({ item: l, voice, turnStart }) => (
            <TranscriptRow
              key={l.id}
              line={l}
              lang={lang}
              time={clockTime(transcript.startedAt + l.start_ms, offset)}
              voice={voice}
              turnStart={turnStart}
              onSpeaker={editable ? openMenu : undefined}
              menu={null}
            />
          ))}
        </ol>
      )}
    </>
  );
}
```

(`menuLine` chưa dùng ở Task này: Task 18 nối menu. Nếu TypeScript báo `'menuLine' is declared but its value is never read` thì giữ nguyên tới Task 18; `tsc` của dự án không bật `noUnusedLocals`.)

- [ ] **Step 4: Bảng màu và CSS của cửa sổ chính**

`src/styles/tokens.css`:
- Trong khối `:root { … }` đầu tiên, trước `color-scheme: light;` thêm:

```css
  /* Màu người nói trên nền sáng (spec 2026-10-26-phan-biet-nguoi-noi §8.2): đậm hơn bảng của thanh phụ đề. */
  --spk-0: #1f6fd1;
  --spk-1: #c25e00;
  --spk-2: #2f8a3b;
  --spk-3: #b8378f;
  --spk-4: #7048c9;
  --spk-5: #9a7a00;
  --spk-6: #0f8a7e;
  --spk-7: #c93a3a;
```

- Trong **cả hai** khối tối (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` và `:root[data-theme="dark"] { … }`), trước `color-scheme: dark;` thêm:

```css
    /* Màu người nói trên nền tối: bảng của thanh phụ đề (spec §8.2). */
    --spk-0: #7cc4ff;
    --spk-1: #ffb86b;
    --spk-2: #9be38f;
    --spk-3: #f59fd5;
    --spk-4: #c7a6ff;
    --spk-5: #ffe27a;
    --spk-6: #6fe0d2;
    --spk-7: #ff8f8f;
```

`src/styles/main.css`:
- Trong `.transcript { … }` (dòng 1296–1305), đổi `overflow: hidden;` thành `overflow: visible;` (QĐ 20: menu của dòng cuối không bị cắt).
- Trong `.transcript li { … }` (dòng 1307–1312), thêm `position: relative;`.
- Sau khối `.transcript .failed .tgt { … }` thêm:

```css
/* Người nói trong bản chép lời (spec 2026-10-26-phan-biet-nguoi-noi §8.2): vạch màu bên trái các câu của một giọng, nhãn dạng chip
   có chấm màu ở câu đầu mỗi lượt, câu sau của cùng lượt không có đường kẻ trên. `--spk` đặt theo từng dòng (`speakerColor`). */
.transcript li.spk::before {
  content: "";
  position: absolute;
  top: 0.65rem;
  bottom: 0.65rem;
  left: 0;
  width: 3px;
  border-radius: 2px;
  background: var(--spk);
}

.transcript li.spk-cont {
  border-top: none;
  padding-top: 0.15rem;
}

.spk-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  min-height: 0;
  margin: 0 0 0.35rem;
  padding: 0.05rem 0.7rem 0.05rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--spk) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--spk) 9%, transparent);
  box-shadow: none;
  color: var(--spk);
  /* QĐ 24: chữ pha 80% màu giọng với 20% màu chữ để đạt 4,5:1 trên nền sáng (thấp nhất 4,95; 4,55 khi rê chuột); dòng trên là dự
     phòng cho WebView không có color-mix. Chấm, vạch, viền giữ đúng màu spec. */
  color: color-mix(in srgb, var(--spk) 80%, var(--text));
  font-size: 0.93rem;
  font-weight: 600;
  line-height: 1.5;
}

.spk-chip::before {
  content: "";
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--spk);
}

.spk-chip .label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Tên viết từ phải sang trái hay có ký tự định dạng lạ không đảo phần xung quanh (QĐ 11). */
  unicode-bidi: isolate;
}

.spk-chip .caret {
  opacity: 0.6;
  font-weight: 400;
}

button.spk-chip {
  cursor: pointer;
}

button.spk-chip:hover:not(:disabled) {
  background: color-mix(in srgb, var(--spk) 16%, transparent);
}

.toolbar-check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
  font-size: 0.93rem;
}

/* `.transcript` không còn cắt phần tràn (QĐ 20): chuỗi dài liền (URL, số dài) xuống dòng trong ô, không tràn ra ngoài thẻ (rà soát
   B-N2). */
.transcript .src,
.transcript .tgt {
  overflow-wrap: anywhere;
}
```

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run src/windows/main 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test đạt (gồm 4 test của `TranscriptRow`); `tsc-ok`.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short src/windows/main src/styles`
Expected: `?? TranscriptRow.tsx`, `?? TranscriptRow.test.ts`, `M TranscriptView.tsx`, `M src/styles/tokens.css`, `M src/styles/main.css`. Không commit.

---

### Task 18: Menu của nhãn: đổi tên, chọn người trong cuộc họp, gộp

**Files:**
- Create: `src/windows/main/SpeakerMenu.tsx`, `src/windows/main/SpeakerMenu.test.ts`
- Modify: `src/windows/main/TranscriptView.tsx` (nối menu), `src/styles/main.css` (thêm khối menu)

- [ ] **Step 1: Viết test đỏ**

Tạo `src/windows/main/SpeakerMenu.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerVoice } from "../../lib/ipc";
import { NO_VOICES, mergeVoices } from "../../lib/speakers";
import { SpeakerMenu, type SpeakerMenuProps, composing, dismissal, mergeTargets } from "./SpeakerMenu";

const v = (id: number, label: string, patch: Partial<SpeakerVoice> = {}): SpeakerVoice => ({
  id,
  label,
  color: id - 1,
  source: "user",
  room: false,
  mergedInto: null,
  ...patch,
});

// Giọng 4 đã gộp tay vào giọng 1 (hiện như "Lan Nguyễn").
const voices = mergeVoices(NO_VOICES, [
  v(1, "Lan Nguyễn", { source: "name" }),
  v(2, "Minh Trần"),
  v(3, "Người 3", { source: "voice" }),
  v(4, "Lan Nguyễn", { mergedInto: 1, color: 0 }),
]);
const get = (id: number) => voices.get(id) as SpeakerVoice;

const props = (patch: Partial<SpeakerMenuProps> = {}): SpeakerMenuProps => ({
  lang: "vi",
  voice: get(3),
  voices,
  participants: [],
  onRename: () => {},
  onMerge: () => {},
  onClose: () => {},
  ...patch,
});

const html = (p: SpeakerMenuProps) => renderToStaticMarkup(createElement(SpeakerMenu, p));

// Spec 2026-10-26-phan-biet-nguoi-noi §8.2: ô "Đổi tên" (≤ 40 ký tự), "Chọn người trong cuộc họp" (danh sách người tham dự), "Gộp
// vào người khác ▸".
describe("SpeakerMenu", () => {
  it("đổi tên: tiêu đề có nhãn, ô tối đa 40 ký tự, trống khi đang là nhãn tự động; có tên thì điền sẵn", () => {
    const markup = html(props());
    expect(markup).toContain('aria-label="Đổi tên “\u2068Người 3\u2069”"');
    expect(markup).toMatch(/<input id="speaker-name" type="text"/);
    expect(markup).toMatch(/<input id="speaker-name"[^>]*maxlength="40"/i);
    expect(markup).toMatch(/<input id="speaker-name"[^>]*value=""/);
    expect(html(props({ voice: get(2) }))).toMatch(/<input id="speaker-name"[^>]*value="Minh Trần"/);
    expect(markup).toContain(">Lưu</button>");
  });

  it("người tham dự chỉ khi đọc được; tên đang dùng được đánh dấu", () => {
    expect(html(props())).not.toContain("Chọn người trong cuộc họp");
    const markup = html(props({ voice: get(1), participants: ["Lan Nguyễn", "Hoa Phạm"] }));
    expect(markup).toContain("Chọn người trong cuộc họp");
    expect(markup).toContain('<button type="button" class="menu-item" aria-current="true">Lan Nguyễn</button>');
    expect(markup).toContain('<button type="button" class="menu-item">Hoa Phạm</button>');
    // Rà soát B-N6: hai người tham dự cùng tên (kế hoạch 04 có thể trả "Guest" hai lần) vẫn vẽ đủ hai mục.
    const twice = html(props({ participants: ["Guest", "Guest"] }));
    expect(twice.split(">Guest</button>").length - 1).toBe(2);
  });

  it("gộp: chỉ liệt kê giọng khác chưa bị gộp; chỉ có một giọng thì không có mục gộp", () => {
    expect(mergeTargets(voices, get(3)).map((x) => x.id)).toEqual([1, 2]);
    expect(mergeTargets(voices, get(4)).map((x) => x.id)).toEqual([2, 3]);
    expect(html(props())).toContain("Gộp vào người khác ▸");
    const only = mergeVoices(NO_VOICES, [v(1, "Lan")]);
    expect(html(props({ voice: only.get(1) as SpeakerVoice, voices: only }))).not.toContain("Gộp vào người khác");
  });
});

// Cách menu đóng (rà soát B-Q1; rà soát lần 2: B-Q-mới 2 và trả focus). Mục tiêu bấm giả là chuỗi: "menu" và "chip" (nhãn của chính
// dòng này) ở trong, mọi chuỗi khác ở ngoài.
describe("dismissal", () => {
  const setup = () => {
    let closes = 0;
    const d = dismissal<string>(
      (target) => target === "menu" || target === "chip",
      () => {
        closes += 1;
      },
    );
    return { d, closes: () => closes };
  };
  // Phím thường (không qua bộ gõ).
  const key = (name: string) => ({ key: name, isComposing: false, keyCode: name === "Escape" ? 27 : 13 });

  it("bấm ra ngoài: đóng ở `click`, không đóng lúc nhấn (cú bấm tới đúng nút trước, menu gỡ sau)", () => {
    const { d, closes } = setup();
    d.down("other-chip");
    expect(closes()).toBe(0);
    d.click("other-chip", true);
    expect(closes()).toBe(1);
    expect(d.restoreFocus()).toBe(false);
  });

  it("bấm trong menu, bấm lại chính nhãn, kéo chọn chữ từ ô tên rồi thả ra ngoài: không đóng", () => {
    const { d, closes } = setup();
    d.down("menu");
    d.click("menu", true);
    d.down("chip");
    d.click("chip", true);
    d.down("menu");
    d.click("row", true);
    expect(closes()).toBe(0);
    d.down("other");
    d.click("other", true);
    expect(closes()).toBe(1);
  });

  it("nhấn trong menu rồi thả ngoài cửa sổ (không có `click`): cú bấm ra ngoài kế tiếp vẫn đóng menu", () => {
    const { d, closes } = setup();
    d.down("menu");
    // Bấm nút khác bằng bàn phím: `click` có `detail` 0, không có `mousedown` đi trước.
    d.click("other", false);
    expect(closes()).toBe(1);
    d.down("menu");
    // Cú nhấn chuột kế tiếp đặt lại cú nhấn còn treo.
    d.down("other");
    d.click("other", true);
    expect(closes()).toBe(2);
  });

  it("trả focus về nhãn chỉ khi đóng bằng Esc (focus trong menu), Lưu, chọn người hay gộp; đóng bằng chuột thì không", () => {
    const { d, closes } = setup();
    d.key(key("Enter"), true);
    expect(closes()).toBe(0);
    d.key(key("Escape"), false);
    expect([closes(), d.restoreFocus()]).toEqual([1, false]);
    d.key(key("Escape"), true);
    expect([closes(), d.restoreFocus()]).toEqual([2, true]);
    d.willClose();
    expect(d.restoreFocus()).toBe(true);
    // Lưu lỗi (menu còn mở) rồi người dùng bấm chỗ khác: không kéo focus về nhãn.
    d.down("other");
    expect(d.restoreFocus()).toBe(false);
    // Như trên, nhưng bấm nút khác bằng bàn phím (`click` không có `mousedown` đi trước).
    d.willClose();
    d.click("other", false);
    expect(d.restoreFocus()).toBe(false);
  });

  it("phím của bộ gõ đang ghép chữ (`isComposing`, hay `keyCode` 229 trên WebKit) không đóng menu, không gửi tên", () => {
    const { d, closes } = setup();
    d.key({ key: "Escape", isComposing: true, keyCode: 27 }, true);
    // WebKit (WKWebView của app trên macOS): phím kết thúc ghép chữ tới với `isComposing` false và `keyCode` 229.
    d.key({ key: "Escape", isComposing: false, keyCode: 229 }, true);
    expect(closes()).toBe(0);
    expect(composing({ key: "Enter", isComposing: false, keyCode: 229 })).toBe(true);
    expect(composing(key("Enter"))).toBe(false);
    d.key(key("Escape"), true);
    expect(closes()).toBe(1);
  });
});
```

Run: `cd $W && node_modules/.bin/vitest run src/windows/main/SpeakerMenu.test.ts 2>&1 | tail -3`
Expected: lỗi `Failed to resolve import "./SpeakerMenu"`.

- [ ] **Step 2: Cài đặt `SpeakerMenu.tsx`**

Tạo `src/windows/main/SpeakerMenu.tsx`:

```tsx
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { type MessageKey, type Params, type UiLanguage, translate } from "../../i18n";
import type { SpeakerVoice } from "../../lib/ipc";
import { MAX_SPEAKER_NAME, type VoiceMap, isolateName, speakerColor } from "../../lib/speakers";

export interface SpeakerMenuProps {
  lang: UiLanguage;
  // Giọng của nhãn vừa bấm.
  voice: SpeakerVoice;
  voices: VoiceMap;
  // Tên người tham dự đọc được (kế hoạch 04); rỗng thì không có mục "Chọn người trong cuộc họp".
  participants: readonly string[];
  onRename(name: string): void;
  onMerge(into: number): void;
  onClose(): void;
}

// Giọng gộp được vào: giọng chưa bị gộp vào giọng khác, khác giọng đang mở (tính theo giọng nó đang hiện như).
export function mergeTargets(voices: VoiceMap, voice: SpeakerVoice): SpeakerVoice[] {
  const self = voice.mergedInto ?? voice.id;
  return [...voices.values()].filter((v) => v.mergedInto === null && v.id !== self);
}

// Cách menu đóng, tách khỏi component để test trong Node (không DOM). `inside(target)`: mục tiêu bấm nằm trong menu hay trên nhãn
// của chính dòng này.
// - Bấm ra ngoài đóng menu ở `click`, không ở `mousedown` (rà soát lần 2, B-Q-mới 2): menu của dòng gần cuối kéo dài vùng cuộn; đóng
//   lúc nhấn làm vùng cuộn co lại, nội dung dịch đi dưới con trỏ trước lúc thả, và cú bấm rơi vào chỗ khác. Đóng ở `click` thì cú bấm
//   tới đúng nút (nhãn dòng khác, nút Xuất…) trước, menu gỡ sau.
// - Cú nhấn bắt đầu trong menu (kéo chọn chữ trong ô tên rồi thả ra ngoài) không đóng menu. Mỗi `mousedown` ghi lại cú nhấn mới, nên
//   cú nhấn trong menu mà thả ngoài cửa sổ (không có `click`) không treo tới cú bấm chuột sau; `click` từ bàn phím (`detail` 0, không
//   có `mousedown` đi trước) không dùng cú nhấn cũ (rà soát lần 3).
// - Phím của bộ gõ đang ghép chữ (Nhật, Trung, Hàn) không đóng menu: `isComposing`, hay `keyCode` 229 (WebKit gửi phím kết thúc ghép
//   chữ với `isComposing` false), xem `composing`.
// - Bấm lại chính nhãn: bỏ qua; `onClick` của nhãn đóng menu (`openMenu` bấm lại để đóng). Đóng ở đây thì `onClick` đó mở lại menu
//   với ô tên bị đặt lại (rà soát B-Q1).
// - Chỉ trả focus về nhãn khi đóng bằng Esc lúc focus ở trong menu, hay bằng Lưu, chọn người, gộp (`willClose`, rà soát B-N7). Đóng
//   bằng chuột (kể cả bấm lại nhãn) thì để focus ở nơi trình duyệt đặt (rà soát lần 2).
// Phần của `KeyboardEvent` mà menu cần.
export interface KeyInput {
  key: string;
  isComposing: boolean;
  keyCode: number;
}

// Phím đang thuộc bộ gõ ghép chữ (rà soát lần 3): không đóng menu, không gửi tên.
export function composing(e: KeyInput): boolean {
  return e.isComposing || e.keyCode === 229;
}

export interface Dismissal<T> {
  down(target: T): void;
  // `pointer`: cú bấm đến từ chuột hay chạm (`MouseEvent.detail > 0`).
  click(target: T, pointer: boolean): void;
  key(e: KeyInput, focusInside: boolean): void;
  willClose(): void;
  restoreFocus(): boolean;
}

export function dismissal<T>(inside: (target: T) => boolean, onClose: () => void): Dismissal<T> {
  let pressedInside = false;
  let restore = false;
  return {
    down(target) {
      restore = false;
      pressedInside = inside(target);
    },
    click(target, pointer) {
      const fromInside = pointer && pressedInside;
      pressedInside = false;
      if (fromInside || inside(target)) return;
      restore = false;
      onClose();
    },
    key(e, focusInside) {
      if (e.key !== "Escape" || composing(e)) return;
      restore = focusInside;
      onClose();
    },
    willClose() {
      restore = true;
    },
    restoreFocus() {
      return restore;
    },
  };
}

// Menu của nhãn người nói trong bản chép lời (spec 2026-10-26-phan-biet-nguoi-noi §8.2): ô "Đổi tên" (≤ 40 ký tự; để trống rồi Lưu
// là trở về tên tự động, QĐ 11), "Chọn người trong cuộc họp" (khi đọc được người tham dự), "Gộp vào người khác ▸". Áp cho mọi câu
// của giọng đó trong phiên. Esc hay bấm ra ngoài thì đóng; cách đóng và trả focus: `dismissal`.
export function SpeakerMenu({ lang, voice, voices, participants, onRename, onMerge, onClose }: SpeakerMenuProps) {
  const t = (key: MessageKey, params?: Params) => translate(lang, key, params);
  const [name, setName] = useState(voice.source === "voice" ? "" : voice.label);
  const [merging, setMerging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Cách đóng của lần mở này (tạo trong effect); Lưu, chọn người, gộp báo trước rằng menu sắp đóng (`willClose`).
  const dismiss = useRef<Dismissal<EventTarget | null> | null>(null);
  useEffect(() => {
    input.current?.focus();
    // Nhãn của chính dòng này (menu nằm trong cùng `li` với nhãn).
    const chip = box.current?.parentElement?.querySelector<HTMLButtonElement>("button.spk-chip") ?? null;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (box.current?.contains(target) === true || chip?.contains(target) === true);
    const d = dismissal(inside, onClose);
    dismiss.current = d;
    const onDown = (e: MouseEvent) => d.down(e.target);
    const onClick = (e: MouseEvent) => d.click(e.target, e.detail > 0);
    // Esc trong lúc gõ bằng bộ gõ (tiếng Nhật, Trung, Hàn) chỉ hủy chữ đang ghép, không đóng menu (`composing`).
    const onKey = (e: KeyboardEvent) => d.key(e, box.current?.contains(document.activeElement) === true);
    // Pha capture của `document`: chạy trước mọi phần tử của trang, và không bắt chính cú bấm vừa mở menu (effect gắn listener khi
    // cú bấm đó đã qua pha capture của `document`).
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
      dismiss.current = null;
      // Focus đang ở trong menu vừa gỡ (rơi về `body`): trả về nhãn để người dùng bàn phím không mất chỗ; `preventScroll` để khung
      // không nhảy.
      if (d.restoreFocus() && chip?.isConnected) chip.focus({ preventScroll: true });
    };
  }, [onClose]);
  const title = t("transcript.speaker.rename", { name: isolateName(voice.label) });
  const others = mergeTargets(voices, voice);
  return (
    <div className="speaker-menu" role="dialog" aria-label={title} ref={box}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          dismiss.current?.willClose();
          onRename(name);
        }}
      >
        <label className="menu-head" htmlFor="speaker-name">
          {title}
        </label>
        <div className="menu-row">
          <input
            id="speaker-name"
            type="text"
            ref={input}
            value={name}
            maxLength={MAX_SPEAKER_NAME}
            placeholder={t("transcript.speaker.rename.placeholder")}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            // Enter kết thúc ghép chữ của bộ gõ không gửi tên (WebKit: `keyCode` 229, rà soát lần 3).
            onKeyDown={(e) => {
              if (e.key === "Enter" && composing(e.nativeEvent)) e.preventDefault();
            }}
          />
          <button type="submit">{t("transcript.speaker.rename.save")}</button>
        </div>
      </form>
      {participants.length > 0 && (
        <>
          <div className="menu-sep" />
          <div className="menu-head">{t("transcript.speaker.participants")}</div>
          {participants.map((p, i) => (
            <button
              key={`${i}:${p}`}
              type="button"
              className="menu-item"
              aria-current={p === voice.label ? "true" : undefined}
              onClick={() => {
                dismiss.current?.willClose();
                onRename(p);
              }}
            >
              {p}
            </button>
          ))}
        </>
      )}
      {others.length > 0 && (
        <>
          <div className="menu-sep" />
          <button type="button" className="menu-item" aria-expanded={merging} onClick={() => setMerging((m) => !m)}>
            {`${t("transcript.speaker.merge")} ▸`}
          </button>
          {merging &&
            others.map((o) => (
              <button
                key={o.id}
                type="button"
                className="menu-item sub"
                style={{ "--spk": speakerColor(o.color) } as CSSProperties}
                onClick={() => {
                  dismiss.current?.willClose();
                  onMerge(o.id);
                }}
              >
                <span className="dot" aria-hidden="true" />
                {o.label}
              </button>
            ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Nối menu vào `TranscriptView.tsx`**

Trong `src/windows/main/TranscriptView.tsx`:
- Thêm `import { SpeakerMenu } from "./SpeakerMenu";`.
- Sau `const exportTo = useTranscript((s) => s.exportTo);` thêm:

```tsx
  const participants = useTranscript((s) => s.participants);
  const renameSpeaker = useTranscript((s) => s.renameSpeaker);
  const mergeSpeakers = useTranscript((s) => s.mergeSpeakers);
```

- Sau dòng `const openMenu = useCallback(…);` thêm `const closeMenu = useCallback(() => setMenuLine(null), []);`.
- Trong `<TranscriptRow … />`, thay `menu={null}` bằng:

```tsx
              menu={
                editable && voice && menuLine === l.id ? (
                  <SpeakerMenu
                    lang={lang}
                    voice={voice}
                    voices={voices}
                    participants={participants}
                    onClose={closeMenu}
                    onRename={(name) => void renameSpeaker(voice.id, name).then((ok) => ok && closeMenu())}
                    onMerge={(into) => void mergeSpeakers(voice.id, into).then((ok) => ok && closeMenu())}
                  />
                ) : null
              }
```

`src/styles/main.css`, sau khối `.toolbar-check { … }` của Task 17 thêm:

```css
/* Menu của nhãn người nói (spec §8.2): popover ngay dưới nhãn, trong dòng (QĐ 20). */
.speaker-menu {
  position: absolute;
  z-index: 20;
  top: 2.6rem;
  left: 6.4rem;
  width: min(20rem, calc(100% - 7.5rem));
  padding: 0.35rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.speaker-menu .menu-head {
  display: block;
  padding: 0.4rem 0.6rem 0.25rem;
  color: var(--muted);
  font-size: 0.86rem;
  /* Tên 40 ký tự không có dấu cách (chữ Hán, tên dài liền) vẫn xuống dòng trong menu (rà soát B-Q3). */
  overflow-wrap: anywhere;
}

.speaker-menu .menu-row {
  display: flex;
  gap: 0.4rem;
  padding: 0.1rem 0.4rem 0.4rem;
}

.speaker-menu .menu-row input {
  flex: 1 1 auto;
  min-width: 0;
}

.speaker-menu .menu-sep {
  height: 1px;
  margin: 0.25rem 0.4rem;
  background: var(--border);
}

.speaker-menu .menu-item {
  display: flex;
  justify-content: flex-start;
  gap: 0.5rem;
  width: 100%;
  height: auto;
  border: 0;
  background: transparent;
  box-shadow: none;
  text-align: left;
  /* Nút của app không xuống dòng (`white-space: nowrap`): tên dài phải xuống dòng trong menu, không tràn (rà soát B-Q3); tên viết từ
     phải sang trái không đảo phần xung quanh (QĐ 11). */
  white-space: normal;
  overflow-wrap: anywhere;
  unicode-bidi: isolate;
}

.speaker-menu .menu-item[aria-current="true"] {
  background: var(--accent-soft);
}

.speaker-menu .menu-item.sub {
  padding-left: 1.4rem;
}

.speaker-menu .menu-item .dot {
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--spk);
}
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run src/windows/main 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test đạt (gồm 8 test của `SpeakerMenu.test.ts`: 3 của `SpeakerMenu`, 5 của `dismissal`); `tsc-ok`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short src/windows/main src/styles`
Expected: thêm `?? SpeakerMenu.tsx`, `?? SpeakerMenu.test.ts`. Không commit.

---

### Task 19: Cài đặt › Phụ đề › "Người nói"; cuộn tới nhóm; ghi chú ở Cài đặt › Model

**Files:**
- Create: `src/windows/main/settings/SpeakerSettings.tsx`, `src/windows/main/settings/SpeakerSettings.test.ts`
- Modify: `src/windows/main/settings/SubtitleSettings.tsx`, `src/windows/main/settings/ModelSettings.tsx`, `src/store/app.ts`, `src/store/app.test.ts`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/windows/main/settings/SpeakerSettings.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi as viText } from "../../../i18n";
import { SpeakerSettingsCard, type SpeakerSettingsCardProps } from "./SpeakerSettings";

const props = (patch: Partial<SpeakerSettingsCardProps> = {}): SpeakerSettingsCardProps => ({
  lang: "vi",
  platform: "macos",
  diarization: true,
  names: true,
  trusted: false,
  model: "ready",
  onDiarization: () => {},
  onNames: () => {},
  onOpenAccessibility: () => {},
  ...patch,
});

const html = (p: SpeakerSettingsCardProps) => renderToStaticMarkup(createElement(SpeakerSettingsCard, p));
const fields = (markup: string) => markup.split('<div class="field">').length - 1;

// Spec 2026-10-26-phan-biet-nguoi-noi §8.3: hai công tắc bật sẵn; "Lấy tên" tắt theo "Phân biệt"; "Quyền Trợ năng" chỉ macOS, dùng
// chung với Gõ dịch; §4.5: "đang tải" khi chưa có dữ liệu nhận giọng.
describe("SpeakerSettingsCard", () => {
  it("macOS, hai công tắc bật: có dòng Quyền Trợ năng (chưa cấp, đã cấp)", () => {
    const markup = html(props());
    expect(markup).toContain('<section id="speaker-settings"');
    expect(markup).toContain(viText["settings.speakers.title"]);
    expect(fields(markup)).toBe(3);
    expect(markup).toMatch(/<input id="speaker-diarization"[^>]*checked=""/);
    expect(markup).toMatch(/<input id="speaker-names"[^>]*checked=""/);
    expect(markup).toContain(viText["settings.speakers.permission.missing"]);
    expect(html(props({ trusted: true }))).toContain(viText["settings.speakers.permission.granted"]);
  });

  it("Windows không có dòng quyền", () => {
    expect(fields(html(props({ platform: "windows" })))).toBe(2);
  });

  it("tắt Phân biệt: Lấy tên tắt theo, không bấm được, không có dòng quyền", () => {
    const markup = html(props({ diarization: false }));
    expect(markup).toMatch(/<input id="speaker-names"[^>]*disabled=""/);
    expect(markup).not.toMatch(/<input id="speaker-names"[^>]*checked=""/);
    expect(fields(markup)).toBe(2);
  });

  it("dữ liệu nhận giọng đang tải hay chưa có: ghi dưới Phân biệt người nói", () => {
    expect(html(props({ model: "downloading" }))).toContain(viText["settings.speakers.model.downloading"]);
    expect(html(props({ model: "missing" }))).toContain(viText["settings.speakers.model.missing"]);
    expect(html(props({ model: "ready" }))).not.toContain('class="field-note"');
    expect(html(props({ model: "unavailable" }))).not.toContain('class="field-note"');
  });
});
```

Trong `src/store/app.test.ts`, sau test "sự kiện từ phía Rust cập nhật store (khay, phím tắt đổi trạng thái)" thêm:

```ts
  // Spec 2026-10-26-phan-biet-nguoi-noi §6.7: nút "Mở Cài đặt" của dòng mời trên thanh phụ đề đưa tới nhóm Người nói.
  it("app://navigate có focus thì nhớ để Cài đặt cuộn tới nhóm đó, rồi quên", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://navigate", { screen: "settings", settingsGroup: "subtitles", focus: "speakers" });
    const s = store.getState();
    expect([s.screen, s.settingsGroup, s.settingsFocus]).toEqual(["settings", "subtitles", "speakers"]);
    store.getState().clearSettingsFocus();
    expect(store.getState().settingsFocus).toBeNull();
    fake.emit("app://navigate", { screen: "settings", settingsGroup: "hotkeys" });
    expect(store.getState().settingsFocus).toBeNull();
  });
```

Run: `cd $W && node_modules/.bin/vitest run src/windows/main/settings/SpeakerSettings.test.ts src/store/app.test.ts 2>&1 | tail -4`
Expected: lỗi import `./SpeakerSettings`; test `app://navigate có focus…` đỏ (`settingsFocus` undefined).

- [ ] **Step 2: Cài đặt `SpeakerSettings.tsx`**

Tạo `src/windows/main/settings/SpeakerSettings.tsx`:

```tsx
import { Field } from "../../../components/Field";
import { type MessageKey, type Params, type UiLanguage, translate } from "../../../i18n";
import type { SpeakerModel } from "../../../lib/models";

export interface SpeakerSettingsCardProps {
  lang: UiLanguage;
  platform: "macos" | "windows";
  diarization: boolean;
  names: boolean;
  // macOS: đã có quyền Trợ năng chưa; `null` là chưa đọc (ghi như chưa cấp).
  trusted: boolean | null;
  model: SpeakerModel;
  onDiarization(on: boolean): void;
  onNames(on: boolean): void;
  onOpenAccessibility(): void;
}

// Nhóm "Người nói" ở Cài đặt › Phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §8.3): "Phân biệt người nói" (bật sẵn), "Lấy tên từ
// Teams, Meet, Zoom" (bật sẵn, tắt theo khi "Phân biệt" tắt), và trên macOS khi cả hai bật: "Quyền Trợ năng", dùng chung nút và
// quyền với Gõ dịch (nút xóa quyền cũ sau cập nhật). Chưa có dữ liệu nhận giọng thì ghi "đang tải" (§4.5). Không thêm tab (§8.3).
// Bên gọi chỉ vẽ nhóm này khi bản này có tính năng (QĐ 9 của kế hoạch 03).
export function SpeakerSettingsCard(p: SpeakerSettingsCardProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const modelNote = !p.diarization
    ? null
    : p.model === "downloading"
      ? t("settings.speakers.model.downloading")
      : p.model === "missing"
        ? t("settings.speakers.model.missing")
        : null;
  return (
    <section id="speaker-settings" aria-labelledby="speaker-settings-title">
      <h2 id="speaker-settings-title" className="section-title">
        {t("settings.speakers.title")}
      </h2>
      <div className="card list">
        <Field
          label={t("settings.speakers.diarization")}
          htmlFor="speaker-diarization"
          hintId="speaker-diarization-hint"
          hint={
            <>
              {t("settings.speakers.diarization.hint")}
              {modelNote && (
                <span className="field-note" role="status">
                  {modelNote}
                </span>
              )}
            </>
          }
        >
          <input
            id="speaker-diarization"
            className="switch"
            type="checkbox"
            checked={p.diarization}
            aria-describedby="speaker-diarization-hint"
            onChange={(e) => p.onDiarization(e.target.checked)}
          />
        </Field>
        <Field
          label={t("settings.speakers.names")}
          htmlFor="speaker-names"
          hintId="speaker-names-hint"
          hint={t("settings.speakers.names.hint")}
        >
          <input
            id="speaker-names"
            className="switch"
            type="checkbox"
            checked={p.diarization && p.names}
            disabled={!p.diarization}
            aria-describedby="speaker-names-hint"
            onChange={(e) => p.onNames(e.target.checked)}
          />
        </Field>
        {p.platform === "macos" && p.diarization && p.names && (
          <Field
            label={t("settings.compose.permission")}
            hint={t(p.trusted ? "settings.speakers.permission.granted" : "settings.speakers.permission.missing")}
          >
            <button type="button" onClick={p.onOpenAccessibility}>
              {t("settings.compose.permission.open")}
            </button>
          </Field>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Cài đặt `settingsFocus` ở app store**

Trong `src/store/app.ts`:
- Trong `AppStoreState`, sau `settingsGroup: SettingsGroup;` thêm

```ts
  // Phần cần cuộn tới sau khi mở màn hình (`app://navigate` có `focus`: nút "Mở Cài đặt" của dòng mời người nói, spec
  // 2026-10-26-phan-biet-nguoi-noi §6.7); `null` là không có. Màn hình cuộn tới rồi gọi `clearSettingsFocus`.
  settingsFocus: "speakers" | null;
```

  đổi khai báo `navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;` thành `navigate(screen: Screen, settingsGroup?: SettingsGroup | null, focus?: "speakers" | null): void;`, và sau nó thêm `clearSettingsFocus(): void;`.
- Trong giá trị đầu, sau `settingsGroup: "general",` thêm `settingsFocus: null,`.
- Listener: `ipc.listen("app://navigate", (target: Navigate) => get().navigate(target.screen, target.settingsGroup)),` → `ipc.listen("app://navigate", (target: Navigate) => get().navigate(target.screen, target.settingsGroup, target.focus ?? null)),`.
- Thay hàm `navigate` bằng

```ts
      navigate(screen, settingsGroup, focus = null) {
        set({ ...(settingsGroup ? { screen, settingsGroup } : { screen }), settingsFocus: focus });
      },

      clearSettingsFocus() {
        set({ settingsFocus: null });
      },
```

- [ ] **Step 4: Nối vào `SubtitleSettings.tsx` và `ModelSettings.tsx`**

`src/windows/main/settings/SubtitleSettings.tsx`:
- Import: đổi `import { useState } from "react";` thành `import { useEffect, useState } from "react";`; thêm `import { useModels } from "../modelsStore";` và `import { SpeakerSettingsCard } from "./SpeakerSettings";`.
- Chú thích trên hàm: thêm hai dòng cuối

```tsx
// Nhóm "Người nói" (spec 2026-10-26-phan-biet-nguoi-noi §8.3) ở cuối, chỉ khi bản này có tính năng (`info.speakerAvailable`); nút
// "Mở Cài đặt" của dòng mời trên thanh phụ đề cuộn tới nhóm này (`settingsFocus`).
```
- Thay đoạn từ `const setVisible = useApp((s) => s.setOverlayVisible);` tới `if (!settings || !status) return null;` bằng:

```tsx
  const setVisible = useApp((s) => s.setOverlayVisible);
  const info = useApp((s) => s.info);
  const trusted = useApp((s) => s.accessibilityTrusted);
  const loadAccessibility = useApp((s) => s.loadAccessibility);
  const openAccessibility = useApp((s) => s.openAccessibilitySettings);
  const focus = useApp((s) => s.settingsFocus);
  const clearFocus = useApp((s) => s.clearSettingsFocus);
  const speakerModel = useModels((s) => s.view?.speaker ?? "unavailable");
  const [draftSize, setDraftSize] = useState<number | null>(null);
  const [draftOpacity, setDraftOpacity] = useState<number | null>(null);
  const speakers = info?.speakerAvailable === true;
  const mac = info?.platform === "macos";
  // Quyền Trợ năng (macOS): đọc lại mỗi khi cửa sổ được focus lại, như Cài đặt › Gõ dịch.
  useEffect(() => {
    if (!speakers || !mac) return;
    void loadAccessibility();
    const onFocus = () => void loadAccessibility();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [speakers, mac, loadAccessibility]);
  // Mở từ dòng mời trên thanh phụ đề: cuộn tới nhóm Người nói rồi quên.
  const ready = settings !== null && status !== null;
  useEffect(() => {
    if (focus !== "speakers" || !ready) return;
    document.getElementById("speaker-settings")?.scrollIntoView({ block: "start" });
    clearFocus();
  }, [focus, ready, clearFocus]);
  if (!settings || !status) return null;
```

- Trước `</>` cuối cùng của JSX (sau `</div>` đóng `card list`) thêm:

```tsx
      {speakers && info && (
        <SpeakerSettingsCard
          lang={settings.uiLanguage}
          platform={info.platform}
          diarization={settings.speakerDiarization}
          names={settings.speakerNames}
          trusted={trusted}
          model={speakerModel}
          onDiarization={(speakerDiarization) => void update({ speakerDiarization })}
          onNames={(speakerNames) => void update({ speakerNames })}
          onOpenAccessibility={() => void openAccessibility()}
        />
      )}
```

`src/windows/main/settings/ModelSettings.tsx`: sau `<UpdateNotice />` thêm:

```tsx
      {view.speaker === "downloading" && (
        <p className="note speaker-downloading" role="status">
          <Icon name="download" size={16} />
          <span>{t("settings.model.speakerDownloading")}</span>
        </p>
      )}
```

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && node_modules/.bin/vitest run 2>&1 | tail -4 && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: mọi test của dự án đạt (gồm 4 test của `SpeakerSettingsCard`, test mới của app store); `tsc-ok`.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short src`
Expected: thêm `?? src/windows/main/settings/SpeakerSettings.tsx`, `?? …SpeakerSettings.test.ts`, `M SubtitleSettings.tsx`, `M ModelSettings.tsx`, `M src/store/app.ts`, `M src/store/app.test.ts`. Không commit.

---

### Task 20: Trang xem trước: dữ liệu người nói giả và màn hình kiểm

Trang xem trước dùng đúng mã của `src/` với IPC giả. Tham số mới chỉ có tác dụng khi có trong URL; ảnh website (`shoot.mjs`) không đổi (QĐ 21).

**Files:**
- Modify: `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs`

- [ ] **Step 1: Dữ liệu người nói giả (`tauri-mock.ts`)**

1. Chú thích đầu file, sau đoạn "nguồn micro (spec 2026-10-24-nguon-micro): …" thêm:

```ts
//   người nói (spec 2026-10-26-phan-biet-nguoi-noi §8; kế hoạch 03): speakers=1 (bản có tính năng: nhóm Cài đặt "Người nói"; phiên
//     có ba giọng: tên đọc từ cuộc họp, tên người dùng đặt, "Người 3"; năm câu mẫu của giọng 1, 1, 2, 3, 1; bốn người tham dự)
//     ask=1 (dòng mời cấp quyền Trợ năng trên thanh phụ đề)  speakermodel=ready|missing|downloading|unavailable (dữ liệu nhận giọng;
//     mặc định ready khi speakers=1)  diarization=0, names=0 (tắt hai công tắc)  longnames=1 (tên dài 40 ký tự: giọng 2 tên Latin,
//     thêm một người tham dự tên chữ Hán, để kiểm tràn chữ). Tên trong mẫu là tên giả, như mẫu đã duyệt. Cả cửa sổ chính lẫn thanh
//     phụ đề nhận bảng người nói giả qua sự kiện `speaker://roster` lúc mở trang (danh sách người tham dự chỉ đi qua sự kiện).
```

2. Thêm `SpeakerRoster` vào danh sách `import type { … } from "../../src/lib/ipc";` (theo thứ tự chữ cái, sau `Settings`).

3. Trong `settings`, đổi hai dòng `speakerDiarization: true,` `speakerNames: true,` (Task 11) thành `speakerDiarization: param("diarization") !== "0",` `speakerNames: param("names") !== "0",`.

4. Ngay trước `const info: AppInfo = {` thêm:

```ts
// ---------------------------------------------------------------- người nói (spec 2026-10-26-phan-biet-nguoi-noi §8)

const speakers = param("speakers") === "1";
// Nhãn tự động như phía Rust (`speaker_voice` ở src-tauri/src/i18n.rs).
const voiceLabel = (n: number) =>
  pick({ vi: `Người ${n}`, en: `Speaker ${n}`, ja: `話者${n}`, zh: `说话人${n}`, ko: `화자 ${n}` });
// Giọng của năm câu mẫu (`SAMPLE`): Lan, Lan, Minh, Người 3, Lan.
const SAMPLE_SPEAKERS = [1, 1, 2, 3, 1];
// Tên dài tối đa (40 ký tự) cho `longnames=1` (rà soát B-Q3).
const longNames = param("longnames") === "1";
const LONG_LATIN = "Maximiliano Alessandro Bartholomew-Ortiz";
const LONG_CJK = "欧阳明月上官飞燕司马长风诸葛青云慕容雪晴东方晓白独孤星辰令狐清风西门吹雪南宫云飞";
const secondName = longNames ? LONG_LATIN : "Minh Trần";
let roster: SpeakerRoster = speakers
  ? {
      voices: [
        { id: 1, label: "Lan Nguyễn", color: 0, source: "name", room: false, mergedInto: null },
        { id: 2, label: secondName, color: 1, source: "user", room: false, mergedInto: null },
        { id: 3, label: voiceLabel(3), color: 2, source: "voice", room: false, mergedInto: null },
      ],
      participants: ["Lan Nguyễn", secondName, "Hoa Phạm", "Tuấn Lê", ...(longNames ? [LONG_CJK] : [])],
      askAccess: param("ask") === "1",
      rev: 1,
    }
  : { voices: [], participants: [], askAccess: false, rev: 0 };

// Bảng mới như phía Rust: số thứ tự tăng (QĐ 25 của kế hoạch 03), phát `speaker://roster` cho các cửa sổ, trả về cho lệnh.
function changeRoster(next: SpeakerRoster): SpeakerRoster {
  roster = { ...next, rev: roster.rev + 1 };
  emit("speaker://roster", roster);
  return roster;
}
```

5. Trong `info`, đổi `speakerAvailable: false,` thành `speakerAvailable: speakers,`.

6. Trong `models`, đổi `speaker: "unavailable",` thành `speaker: param("speakermodel", speakers ? "ready" : "unavailable") as ModelsView["speaker"],`.

7. Trong `lines` (map của `SAMPLE`), đổi `speaker: null,` thành `speaker: speakers ? (SAMPLE_SPEAKERS[i] ?? null) : null,`.

8. `liveLine`: đổi chữ ký thành `function liveLine(id: number, ext: number | null, src: string[], tgt: string[], speaker: number | null = null): LiveLine` và `speaker: null,` thành `speaker,`. `liveSubtitle`: đổi chữ ký thành `function liveSubtitle(id: number, src: string, tgt: string, provisional: boolean, speaker: number | null = null): Subtitle` và `speaker: null,` thành `speaker,`.

9. Trong khối `if (location.pathname.endsWith("overlay.html")) { … }`:
   - ngay sau `emit("app://status", status);` thêm `if (speakers) emit("speaker://roster", roster);`;
   - đổi `emit("subtitle://upsert", liveSubtitle(6, s.provisional.src, s.provisional.tgt, true));` thành `emit("subtitle://upsert", liveSubtitle(6, s.provisional.src, s.provisional.tgt, true, speakers ? 2 : null));`;
   - đổi `if (live === "extends") emit("subtitle://live", liveLine(7, 6, s.extends.src, s.extends.tgt));` thành `if (live === "extends") emit("subtitle://live", liveLine(7, 6, s.extends.src, s.extends.tgt, speakers ? 2 : null));`.

10. Trong `handlers`:
   - `get_transcript`: `speakers: [], speakersRev: 0` → `speakers: roster.voices, speakersRev: roster.rev`;
   - `get_history_session`: `speakers: []` → `speakers: roster.voices.map((v) => ({ ...v, source: "user" as const, mergedInto: null }))` (`speakersRev: 0` giữ nguyên);
   - sau `clear_history: …,` thêm:

```ts
  // Người nói: đổi tên (rỗng là trở về nhãn tự động), gộp, như phía Rust (bảng mới phát cho các cửa sổ).
  rename_speaker: ({ id, name }) => {
    const clean = name.trim().replace(/\s+/g, " ");
    return changeRoster({
      ...roster,
      voices: roster.voices.map((v) =>
        v.id === id ? { ...v, label: clean || voiceLabel(v.id), source: clean ? "user" : "voice" } : v,
      ),
    });
  },
  merge_speakers: ({ from, into }) => {
    const target = roster.voices.find((v) => v.id === into);
    if (!target) throw { code: "speakerNotFound", field: null, message: "…" };
    return changeRoster({
      ...roster,
      voices: roster.voices.map((v) =>
        v.id === from ? { ...v, label: target.label, color: target.color, source: target.source, mergedInto: into } : v,
      ),
    });
  },
  open_speaker_settings: () => null,
```

11. Trong khối `setTimeout(async () => { … })` cuối file ("trạng thái ban đầu của trang", dòng 830), ngay sau `const screen = q.get("screen");` (trước `if (screen) emit("app://navigate", …)`) thêm:

```ts
  // Cửa sổ chính (không phải thanh phụ đề hay ô soạn): bảng người nói giả tới như sự kiện `speaker://roster` của phiên đang chạy
  // (rà soát lần 2, B-Q-mới 1). Phía Rust chỉ gửi `participants` qua sự kiện (`get_transcript` không có), nên thiếu dòng này thì menu
  // của nhãn không bao giờ có "Chọn người trong cuộc họp". Đây chỉ là giả lập: cửa sổ chính thật luôn có danh sách rỗng tới kế hoạch
  // 04 (bộ đọc tên cấp `participants`). Phát ở đây: store bản chép lời đã nghe sự kiện (`init()` chạy khi nạp `main.tsx`, `refresh()`
  // xong trước hàng đợi `setTimeout`), và trước khi chuyển màn hình, nên menu mở ở `prepare` đã có danh sách.
  if (speakers && !location.pathname.endsWith("overlay.html") && !location.pathname.endsWith("compose.html")) {
    emit("speaker://roster", roster);
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd $W && node_modules/.bin/tsc --noEmit && echo tsc-ok`
Expected: `tsc-ok` (`satisfies Handlers` kiểm tên lệnh và kiểu tham số, kết quả).

- [ ] **Step 3: Màn hình và điều kiện kiểm (`check-i18n.mjs`)**

1. Chú thích đầu file: sau câu về Chat hỗ trợ thêm

```js
// Phân biệt người nói (spec 2026-10-26-phan-biet-nguoi-noi §8; kế hoạch 03): bản chép lời có nhãn (sáng, tối), menu của nhãn (cả tên
// 40 ký tự), bấm lại nhãn để đóng menu, Esc trả focus về nhãn, bấm nhãn dòng khác khi đã cuộn tới đáy, ô "Thêm tên người nói" của
// SRT, Lịch sử chỉ đọc, nhóm Cài đặt "Người nói" (macOS, chưa cấp
// quyền, Windows, tắt, đang tải), ghi chú ở Cài đặt › Model, thanh phụ đề có tên và vạch màu, dòng mời cấp quyền (bấm thật, không đè
// lời nhắc), dòng đang nói nối tiếp; bản không có tính năng thì không có gì mới.
```

   Ngay trước dòng `// [tên, tham số URL, tùy chọn { prepare: …` (chú thích của `const SCREENS`, dòng 503) thêm:

```js
// Chờ tới khi biểu thức `expression` đúng trên trang, tối đa `ms` (rà soát lần 2 của kế hoạch 03 phân biệt người nói:
// `settings-model-speaker-downloading` sai 1/10 lượt vì khoảng chờ cố định hết trước khi màn hình vẽ xong lúc máy bận). Hết giờ thì
// không ném lỗi: các điều kiện kiểm phía sau báo sai như thường.
const until = (expression, ms = 5000) =>
  `(async () => { const end = Date.now() + ${ms}; while (Date.now() < end && !(${expression})) await new Promise((r) => setTimeout(r, 50)); })()`;

// Bấm chuột thật vào giữa phần tử mà biểu thức `expression` trả về, không cuộn trước (`page.click` cuộn phần tử vào giữa khung, làm
// mất vị trí cuộn cần thử).
async function clickInPlace(page, expression) {
  const box = await page.eval(
    `(() => { const e = ${expression}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  if (!box) throw new Error(`không thấy ${expression}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await page.s.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await sleep(120);
}

// Phím Esc thật (`page.press` không có mã phím của Esc).
async function pressEscape(page) {
  for (const type of ["keyDown", "keyUp"]) {
    await page.s.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  await sleep(120);
}

// Rà soát B-Q1, B-N7 và rà soát lần 2 (kế hoạch 03 phân biệt người nói), bấm bằng chuột và phím thật như người dùng:
// 1. bấm nhãn "Người 3" mở menu; gõ vào ô tên rồi bấm trong ô thì menu vẫn mở, chữ còn nguyên; bấm lại chính nhãn thì menu đóng (không
//    đóng rồi mở lại). Không kiểm focus ở bước này: Chrome tự focus nút khi bấm chuột, WKWebView thì không, và menu cố ý không trả
//    focus khi đóng bằng chuột;
// 2. mở lại, Esc khi focus ở ô tên: menu đóng, focus về nhãn (đường thử được mã trả focus của `SpeakerMenu`);
// 3. menu của dòng cuối mở, khung cuộn tới đáy (phần menu kéo dài vùng cuộn): bấm nhãn của dòng khác thì menu sang dòng đó (B-Q-mới 2:
//    đóng menu lúc nhấn làm vùng cuộn co lại, nội dung dịch đi dưới con trỏ, cú bấm mất).
async function speakerChipTwice(page, ck) {
  const chip = ".transcript li:nth-child(4) button.spk-chip";
  await page.click(chip);
  await ck(`!!document.querySelector(".speaker-menu")`, "bấm nhãn: menu mở");
  await page.eval(
    `(() => { const i = document.querySelector("#speaker-name"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Hoa"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  await page.click("#speaker-name");
  await ck(`document.querySelector("#speaker-name")?.value === "Hoa"`, "bấm trong menu: menu vẫn mở, chữ đã gõ còn nguyên");
  await page.click(chip);
  await ck(`!document.querySelector(".speaker-menu")`, "bấm lại chính nhãn: menu đóng, không mở lại");
  await page.click(chip);
  await ck(`document.activeElement === document.querySelector("#speaker-name")`, "mở lại menu: focus ở ô tên");
  await pressEscape(page);
  await ck(`!document.querySelector(".speaker-menu")`, "Esc: menu đóng");
  await ck(`document.activeElement === document.querySelector(${JSON.stringify(chip)})`, "Esc: focus về nhãn");
  await page.click(".transcript li:last-child button.spk-chip");
  await ck(`!!document.querySelector(".transcript li:last-child .speaker-menu")`, "menu của dòng cuối mở");
  await page.eval(`(() => { const c = document.querySelector("main.content"); c.scrollTop = c.scrollHeight; })()`);
  await sleep(150);
  // Nhãn thấp nhất của một dòng khác còn nằm trọn trong khung khi đã cuộn tới đáy.
  const other = `[...document.querySelectorAll(".transcript li:not(:last-child) button.spk-chip")].filter((c) => { const r = c.getBoundingClientRect(); const b = document.querySelector("main.content").getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom; }).at(-1)`;
  await ck(`!!(${other})`, "đã cuộn tới đáy mà vẫn thấy nhãn của một dòng khác");
  await page.eval(`(() => { const c = ${other}; if (c) c.closest("li").dataset.checkTarget = "1"; })()`);
  await clickInPlace(page, `document.querySelector("li[data-check-target] button.spk-chip")`);
  await ck(
    `!!document.querySelector("li[data-check-target] .speaker-menu") && document.querySelectorAll(".speaker-menu").length === 1`,
    "bấm nhãn dòng khác lúc đã cuộn tới đáy: menu sang dòng đó, cú bấm không mất",
  );
}
```

2. Trong `SCREENS`, ngay trước `["about", "screen=about"],` thêm:

```js
  // Phân biệt người nói (kế hoạch 03): năm câu mẫu của giọng 1, 1, 2, 3, 1.
  ["transcript-speakers", "screen=transcript&speakers=1"],
  ["transcript-speakers-dark", "screen=transcript&speakers=1&theme=dark"],
  // Bấm nhãn thứ ba ("Người 3") như mẫu đã duyệt.
  [
    "transcript-speakers-menu",
    "screen=transcript&speakers=1",
    { prepare: `document.querySelectorAll(".transcript button.spk-chip")[2].click()`, wait: 500 },
  ],
  // Mở phiên đầu của Lịch sử: nhãn đã lưu, chỉ đọc.
  ["history-speakers", "screen=history&speakers=1", { prepare: `document.querySelector(".history .actions button").click()`, wait: 900 }],
  // Rà soát B-Q1, B-N7, rà soát lần 2: bấm lại chính nhãn thì menu đóng; Esc trả focus về nhãn; bấm nhãn dòng khác lúc đã cuộn tới
  // đáy thì menu sang dòng đó (chuột và phím thật).
  ["transcript-speakers-chip-twice", "screen=transcript&speakers=1", { interact: speakerChipTwice }],
  // Rà soát B-Q3: tên 40 ký tự (Latin ở nhãn và tiêu đề menu, chữ Hán ở người tham dự) xuống dòng trong menu, không tràn.
  // Cuộn menu vào khung sau khi mở: ở 720x480 mục tên chữ Hán nằm dưới mép cửa sổ (rà soát lần 2).
  [
    "transcript-speakers-menu-long",
    "screen=transcript&speakers=1&longnames=1",
    {
      prepare: `(async () => { document.querySelectorAll(".transcript button.spk-chip")[1].click(); await ${until(`!!document.querySelector(".speaker-menu")`, 2000)}; document.querySelector(".speaker-menu")?.scrollIntoView({ block: "end" }); })()`,
      wait: 400,
    },
  ],
  // Rà soát B-N10: hàng xuất SRT có ô "Thêm tên người nói" (chọn SRT như người dùng: đặt giá trị rồi bắn `change`).
  [
    "transcript-speakers-srt",
    "screen=transcript&speakers=1",
    {
      prepare: `(() => { const s = document.querySelector("#export-format"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "srt"); s.dispatchEvent(new Event("change", { bubbles: true })); })()`,
      wait: 400,
    },
  ],
  ...[
    ["settings-subtitles-speakers", ""],
    ["settings-subtitles-speakers-dark", "&theme=dark"],
    ["settings-subtitles-speakers-noax", "&ax=0"],
    ["settings-subtitles-speakers-windows", "&platform=windows"],
    ["settings-subtitles-speakers-off", "&diarization=0"],
    ["settings-subtitles-speakers-downloading", "&speakermodel=downloading"],
  ].map(([name, extra]) => [
    name,
    `screen=settings&group=subtitles&speakers=1${extra}`,
    {
      prepare: `(async () => { await ${until(`!!document.getElementById("speaker-settings")`)}; document.getElementById("speaker-settings")?.scrollIntoView({ block: "start" }); })()`,
      wait: 300,
    },
  ]),
  // Chờ tới khi ghi chú hiện, không dựa vào khoảng chờ cố định sau khi tải trang (rà soát lần 2: 1/10 lượt sai, chạy lại thì đạt).
  [
    "settings-model-speaker-downloading",
    "screen=settings&group=model&speakers=1&speakermodel=downloading",
    { prepare: until(`!!document.querySelector(".note.speaker-downloading")`), wait: 100 },
  ],
```

3. Thay `const OVERLAYS = [ … ];` bằng:

```js
// Thanh phụ đề (overlay.html): [tên, tham số URL, tùy chọn như SCREENS].
const OVERLAYS = [
  ["overlay", "session=running"],
  ["overlay-live", "session=running&live=alone"],
  ["overlay-mic-silent", "session=running&notes=micSilent"],
  ["overlay-mic-permission", "session=running&notes=micPermission"],
  // Phân biệt người nói (kế hoạch 03).
  ["overlay-speakers", "session=running&speakers=1"],
  ["overlay-speakers-ask", "session=running&speakers=1&ask=1"],
  ["overlay-speakers-ask-locked", "session=running&speakers=1&ask=1&locked=1"],
  [
    "overlay-speakers-ask-click",
    "session=running&speakers=1&ask=1",
    { prepare: `document.querySelector(".overlay .ask-open").click(); document.querySelector(".overlay .ask-close").click()`, wait: 300 },
  ],
  // Rà soát B-N3: dòng mời và lời nhắc ở góc phải cùng lúc.
  ["overlay-speakers-ask-notes", "session=running&speakers=1&ask=1&notes=micSilent"],
  ["overlay-speakers-live", "session=running&speakers=1&live=extends"],
];
```

4. Ngay trước `const EXTRA = {` thêm:

```js
// Bản chép lời có người nói (năm câu của giọng 1, 1, 2, 3, 1): nhãn ở 4 câu đầu lượt, vạch ở 5 câu, câu thứ hai của Lan không lặp tên;
// `editable`: nhãn là nút bấm (phiên đang chạy), không thì chỉ để đọc (Lịch sử).
const speakerTranscript = (editable) => [
  [`document.querySelectorAll(".transcript .spk-chip").length === 4`, "4 nhãn ở 4 câu đầu lượt nói"],
  [`document.querySelectorAll(".transcript li.spk").length === 5`, "5 câu có vạch màu"],
  [`document.querySelectorAll(".transcript li.spk-cont").length === 1`, "câu sau của cùng người không lặp tên"],
  [
    `document.querySelectorAll(".transcript button.spk-chip").length === ${editable ? 4 : 0}`,
    editable ? "nhãn bấm được (phiên đang chạy)" : "Lịch sử: nhãn chỉ để đọc",
  ],
  [
    `(() => { const c = document.querySelector(".transcript .spk-chip"); return !!c && getComputedStyle(c).color !== getComputedStyle(document.body).color; })()`,
    "nhãn có màu riêng",
  ],
];
// Nhóm "Người nói" ở Cài đặt › Phụ đề: có nhóm, đúng số dòng, công tắc "Phân biệt" theo `on`.
const speakerSettings = (fields, on) => [
  [`!!document.getElementById("speaker-settings")`, "có nhóm Người nói"],
  [`document.querySelectorAll("#speaker-settings .field").length === ${fields}`, `nhóm Người nói có ${fields} dòng`],
  [`document.getElementById("speaker-diarization").checked === ${on}`, on ? "Phân biệt người nói bật sẵn" : "Phân biệt người nói tắt"],
];
```

5. Trong `const EXTRA = { … }`, thêm vào đầu (sau dòng `const EXTRA = {`):

```js
  // Phân biệt người nói (kế hoạch 03).
  "transcript-speakers": () => speakerTranscript(true),
  "transcript-speakers-dark": () => speakerTranscript(true),
  "history-speakers": () => speakerTranscript(false),
  "transcript-speakers-menu": (lang) => [
    has(".speaker-menu", "menu của nhãn mở"),
    [`document.querySelector("#speaker-name")?.maxLength === 40`, "ô đổi tên tối đa 40 ký tự"],
    [`document.querySelector("#speaker-name")?.value === ""`, "nhãn tự động: ô đổi tên để trống"],
    [`document.querySelectorAll(".speaker-menu .menu-item").length === 5`, "bốn người tham dự và mục Gộp"],
    [
      inPage(
        lang,
        `const name = document.querySelectorAll(".transcript .spk-chip .label")[2].textContent; const iso = String.fromCharCode(0x2068) + name + String.fromCharCode(0x2069); return document.querySelector(".speaker-menu .menu-head").textContent === t("transcript.speaker.rename", { name: iso });`,
      ),
      "tiêu đề menu: Đổi tên “<nhãn>”",
    ],
  ],
  "settings-subtitles": () => [[`!document.getElementById("speaker-settings")`, "bản không có tính năng: không có nhóm Người nói"]],
  "settings-subtitles-speakers": () => speakerSettings(3, true),
  "settings-subtitles-speakers-dark": () => speakerSettings(3, true),
  "settings-subtitles-speakers-noax": (lang) => [
    ...speakerSettings(3, true),
    [
      inPage(lang, `return document.getElementById("speaker-settings").textContent.includes(t("settings.speakers.permission.missing"));`),
      "macOS chưa cấp quyền: ghi chưa cấp và cách cấp lại",
    ],
  ],
  "settings-subtitles-speakers-windows": () => speakerSettings(2, true),
  "settings-subtitles-speakers-off": () => [
    ...speakerSettings(2, false),
    [
      `document.getElementById("speaker-names").disabled && !document.getElementById("speaker-names").checked`,
      "tắt Phân biệt thì Lấy tên tắt theo, không bấm được",
    ],
  ],
  "settings-subtitles-speakers-downloading": (lang) => [
    ...speakerSettings(3, true),
    [
      inPage(lang, `return document.getElementById("speaker-settings").textContent.includes(t("settings.speakers.model.downloading"));`),
      "ghi đang tải dữ liệu nhận giọng",
    ],
  ],
  "settings-model-speaker-downloading": (lang) => [
    [inPage(lang, `return document.body.textContent.includes(t("settings.model.speakerDownloading"));`), "Cài đặt › Model báo đang tải dữ liệu nhận giọng"],
  ],
  overlay: () => [
    [
      `!document.querySelector(".overlay .spk-label") && !document.querySelector(".overlay .lines.has-speakers")`,
      "tính năng tắt: thanh như hiện nay",
    ],
  ],
  "overlay-speakers": () => [
    [`document.querySelectorAll(".overlay .spk-label").length === 4`, "tên có màu ở dòng đầu 4 lượt nói"],
    [`document.querySelectorAll(".overlay .spk-body").length === 5`, "5 câu có vạch màu"],
    [
      `getComputedStyle(document.querySelector(".overlay .spk-label")).color === "rgb(124, 196, 255)"`,
      "giọng đầu tiên màu #7cc4ff (bảng nền tối)",
    ],
    [`document.querySelector(".overlay .lines").classList.contains("has-speakers")`, "phiên có giọng: mọi câu cùng lề"],
    [`!document.querySelector(".overlay .ask")`, "không có dòng mời khi phía Rust không bảo"],
  ],
  "overlay-speakers-ask": (lang) => [
    [`document.querySelectorAll(".overlay .ask button").length === 2`, "dòng mời có nút Mở Cài đặt và ✕"],
    [
      inPage(
        lang,
        `return document.querySelector(".overlay .ask-text").textContent === t("overlay.speakers.ask") && document.querySelector(".overlay .ask-open").textContent === t("notice.openSettings");`,
      ),
      "chữ của dòng mời đúng ngôn ngữ",
    ],
    [
      `(() => { const a = document.querySelector(".overlay .ask"); return a.scrollWidth <= a.clientWidth + 1 && a.getBoundingClientRect().right <= innerWidth; })()`,
      "dòng mời không tràn",
    ],
  ],
  "overlay-speakers-ask-locked": () => [[`!document.querySelector(".overlay .ask")`, "thanh đã khóa: không có dòng mời"]],
  "overlay-speakers-ask-click": () => [
    [`window.__ipcCalls.some((c) => c.cmd === "open_speaker_settings")`, "Mở Cài đặt gọi open_speaker_settings"],
    [`!document.querySelector(".overlay .ask")`, "✕ ẩn dòng mời tới hết phiên"],
  ],
  "overlay-speakers-live": () => [
    [
      `document.querySelector(".overlay .line.live.spk .spk-label")?.textContent === "Minh Trần"`,
      "dòng đang nói nối tiếp câu của Minh mang tên và vạch của Minh",
    ],
  ],
  "overlay-speakers-ask-notes": () => [
    has(".overlay .ask", "có dòng mời"),
    has(".overlay .note.micSilent", "có lời nhắc micro"),
    [
      `(() => { const a = document.querySelector(".overlay .ask").getBoundingClientRect(); const n = document.querySelector(".overlay .indicators").getBoundingClientRect(); return a.bottom <= n.top || a.top >= n.bottom || a.right <= n.left || a.left >= n.right; })()`,
      "dòng mời không đè lên lời nhắc ở góc phải",
    ],
  ],
  "transcript-speakers-menu-long": () => [
    has(".speaker-menu", "menu của nhãn tên dài mở"),
    [
      `(() => { const m = document.querySelector(".speaker-menu").getBoundingClientRect(); return m.left >= 0 && m.right <= innerWidth; })()`,
      "menu nằm trong cửa sổ",
    ],
    [
      `[...document.querySelectorAll(".speaker-menu .menu-item, .speaker-menu .menu-head")].every((e) => e.scrollWidth <= e.clientWidth + 1)`,
      "tên 40 ký tự (Latin, chữ Hán) xuống dòng trong menu, không tràn",
    ],
    [`document.querySelectorAll(".speaker-menu .menu-item").length === 6`, "năm người tham dự (có tên chữ Hán dài) và mục Gộp"],
  ],
  "transcript-speakers-srt": (lang) => [
    [
      inPage(
        lang,
        `const c = document.querySelector(".toolbar-check"); return !!c && c.textContent === t("transcript.export.srtSpeakers") && !c.querySelector("input").checked;`,
      ),
      "hàng xuất SRT có ô Thêm tên người nói, mặc định tắt",
    ],
  ],
```

  (`has` và `inPage` định nghĩa phía trên `EXTRA` trong file; `has` định nghĩa trước `COMPOSES`, tức trước `EXTRA`.)

6. Trong vòng chạy, thay

```js
    for (const [name, query] of OVERLAYS) {
      if (!wanted(name)) continue;
      await visit(browser, lang, { name: "900x300", width: 900, height: 300 }, name, `${BASE}/overlay.html?${query}&lang=${lang}`, {
        transparent: true,
        audit: false,
      });
    }
```

bằng

```js
    for (const [name, query, options] of OVERLAYS) {
      if (!wanted(name)) continue;
      await visit(
        browser,
        lang,
        { name: "900x300", width: 900, height: 300 },
        name,
        `${BASE}/overlay.html?${query}&lang=${lang}`,
        { transparent: true, audit: false, ...options },
        EXTRA[name]?.(lang),
      );
    }
```

- [ ] **Step 4: Kiểm cú pháp**

Run: `cd $W && node --check scripts/ui-preview/check-i18n.mjs && echo ok`
Expected: `ok`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short scripts`
Expected: `M scripts/ui-preview/tauri-mock.ts`, `M scripts/ui-preview/check-i18n.mjs`; `scripts/ui-preview/shoot.mjs` không đổi. Không commit.

---

### Task 21: Nghiệm thu giao diện bằng ảnh (thanh phụ đề nền tối, cửa sổ chính sáng và tối, Cài đặt; 5 ngôn ngữ)

**Files:** không đổi mã (sửa lỗi tìm được thì quay lại đúng Task của nó, chạy lại test của Task đó rồi chạy lại Task này). Ảnh ở `target/ui-preview/ui-ja-zh-ko/` và `target/ui-preview/dich-trong-luc-noi/` (không commit).

- [ ] **Step 1: Chạy trang xem trước**

Run (Bash `run_in_background: true`): `cd $W && node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431`
Rồi: `cd $W && curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1431/`
Expected: `200`. Không có Google Chrome thì dừng, báo chủ dự án (script dùng Chrome của máy qua `website/tools/browser/cdp.mjs`; không cài Playwright).

- [ ] **Step 2: Kiểm các màn hình của người nói ở 5 ngôn ngữ**

Run: `cd $W && ONLY=transcript-speakers,history-speakers,settings-subtitles,settings-model-speaker,overlay node scripts/ui-preview/check-i18n.mjs vi en ja zh ko 2>&1 | tail -25`
Expected: dòng cuối `Đạt: vi, en, ja, zh, ko. Ảnh ở …/target/ui-preview/ui-ja-zh-ko`. Điều kiện nào sai thì đọc mô tả (ví dụ "chữ tràn khỏi ô: button …" ở ja), sửa đúng Task đó, chạy lại. (`ONLY=settings-subtitles` gồm cả `settings-subtitles` và `-dark` cũ: chúng phải không có nhóm Người nói.)

- [ ] **Step 3: Không thụt lùi ở các màn hình khác**

Run: `cd $W && node scripts/ui-preview/check-i18n.mjs vi en 2>&1 | tail -5 && node scripts/ui-preview/check-live.mjs 2>&1 | tail -5`
Expected: `Đạt: vi, en …` và check-live đạt mọi nhóm (dòng đang nói khi không có người nói vẽ như cũ). Lỗi có sẵn trước kế hoạch này (đối chiếu bằng cách chạy cùng lệnh trên thư mục chính `$M` nếu cần, không sửa `$M`) thì ghi lại, không sửa ở đây.

- [ ] **Step 4: Xem ảnh (người kiểm đọc ảnh bằng công cụ đọc ảnh)**

Mở và nhìn các ảnh sau; ghi mỗi ảnh "đạt" hay mô tả lỗi:
- Thanh phụ đề, nền tối: `target/ui-preview/ui-ja-zh-ko/{vi,ja,ko}.900x300.overlay-speakers.png` — tên có màu (xanh, cam, xanh lá) ở dòng đầu mỗi lượt, cỡ nhỏ hơn câu, vạch màu bên trái mọi câu, câu thứ hai của Lan không lặp tên; so với `bench/2026-10-26-nguoi-noi/truoc-spec/mock/1-thanh-phu-de.png`.
- Dòng mời: `…/{vi,en,zh}.900x300.overlay-speakers-ask.png` — trên cùng, nền mờ, chữ nhỏ, "Mở cài đặt" màu vàng, ✕; không đè lên chấm "đang nghe" ở góc phải; so với `mock/2-thanh-phu-de-chua-cap-quyen.png`.
- Dòng đang nói: `…/vi.900x300.overlay-speakers-live.png` — dòng cuối mang tên và vạch của Minh.
- Bản chép lời, nền sáng: `…/{vi,ja,zh}.960x640.transcript-speakers.png` và cửa sổ nhỏ `…/vi.720x480.transcript-speakers.png` — chip có chấm màu ở câu đầu lượt, vạch trái, câu tiếp theo cùng lượt không có đường kẻ trên; so với `mock/3-ban-chep-loi-doi-ten.png`.
- Bản chép lời, nền tối: `…/{vi,ko}.960x640.transcript-speakers-dark.png` — màu chip là bảng sáng của thanh phụ đề, đọc rõ trên nền tối.
- Menu: `…/{vi,en,ja,zh,ko}.960x640.transcript-speakers-menu.png` và `…/ja.720x480.transcript-speakers-menu.png` — ô đổi tên, nút Lưu, danh sách bốn người, "Gộp vào người khác ▸"; menu không bị cắt, không tràn ngang.
- Lịch sử: `…/vi.960x640.history-speakers.png` — chip không có dấu ▾ (chỉ đọc).
- Menu tên dài: `…/{ja,zh}.720x480.transcript-speakers-menu-long.png`, `…/vi.960x640.transcript-speakers-menu-long.png` — menu đã cuộn vào khung, thấy cả mục cuối; tên Latin 40 ký tự ở tiêu đề và mục, tên chữ Hán 40 ký tự xuống dòng trong menu, không tràn, menu không ra ngoài cửa sổ.
- Hàng xuất SRT: `…/{vi,ja,ko}.720x480.transcript-speakers-srt.png` — ô "Thêm tên người nói" cạnh nút Xuất…, không tràn hàng.
- Chữ nhãn trên nền sáng: trong `…/vi.960x640.transcript-speakers.png`, chữ chip đọc rõ (đậm màu hơn mẫu một chút, QĐ 24 của file 03), chấm và vạch đúng màu mẫu.
- Dòng mời cùng lời nhắc: `…/{vi,ja,ko}.900x300.overlay-speakers-ask-notes.png` — dòng mời nằm dưới hàng chỉ báo, không đè chữ "Micro không có tín hiệu".
- Cài đặt: `…/{vi,en,ja,zh,ko}.960x640.settings-subtitles-speakers.png`, `…/vi.960x640.settings-subtitles-speakers-dark.png`, `…/vi.960x640.settings-subtitles-speakers-windows.png`, `…/ja.720x480.settings-subtitles-speakers-noax.png` — tiêu đề nhóm "Người nói", hai công tắc bật, dòng Quyền Trợ năng (macOS); chữ dài của ja/ko xuống dòng trong ô, không tràn; so với `mock/4-cai-dat-nguoi-noi.png`.

Expected: mọi ảnh đạt. Lỗi bố cục thì sửa CSS ở đúng Task (14, 17, 18) rồi chạy lại Step 2 cho màn hình đó (`ONLY=<tên>`).

- [ ] **Step 5: Tắt trang xem trước**

Dừng tiến trình nền của Step 1 (TaskStop), rồi: `lsof -nP -iTCP:1431 -sTCP:LISTEN | tail -n +2`
Expected: không còn dòng nào (không có Vite cổng 1431). Không đụng tiến trình không do mình mở.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short | grep -c "target/\|\.png$"`
Expected: `0` (ảnh nằm trong `target/`, bị `.gitignore` bỏ qua, không hiện trong `git status`). Không commit.

---

### Task 22: Mốc kiểm tổng của kế hoạch 03

**Files:** không

- [ ] **Step 1: Rust** (build nặng: lệnh dừng thật nếu còn dưới 14 GiB)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && echo "$avail GiB trống" && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt --all -- --check && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result|FAILED"`
Expected: số GiB trống ≥ 14 (dưới thì lệnh in "đĩa còn … GiB, dừng", thoát mã 1, không build: báo chủ dự án); `--check` không in gì. Mốc kiểm này chỉ kiểm, không ghi file (rà soát lần 2: chạy `cargo fmt --all` trước thì `--check` không bao giờ đỏ; đối chiếu bằng `git diff --stat` sau fmt cũng không được, vì file mới như `speakers.rs` chưa được git theo dõi và mọi file sửa đã có thay đổi của chính kế hoạch). `--check` in khác biệt nghĩa là Mốc kiểm của một Task đã bỏ sót fmt: ghi tên file, chạy `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo fmt --all` (chỉ đổi cách xuống dòng), rồi chạy lại Step này từ đầu; clippy `Finished`, 0 cảnh báo; `test result: ok` hai lần. Ghi số đạt của `meeting-translator --lib` (mốc 865 cộng số test mới của file 03).

- [ ] **Step 2: Kiểm kiểu Windows**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 ./scripts/check-windows.sh 2>&1 | tail -2`
Expected: `Finished` (mã của kế hoạch 03 không có phần riêng nền tảng ngoài `cfg` sẵn có).

- [ ] **Step 3: Giao diện**

Run: `cd $W && node_modules/.bin/tsc --noEmit && echo tsc-ok && node_modules/.bin/vitest run 2>&1 | tail -4`
Expected: `tsc-ok`; mọi test đạt, bằng mốc Task 0 cộng **41** test mới: i18n 3 (`src/i18n/speakers.test.ts`), `speakers` 10, store thanh phụ đề 3, thanh phụ đề 4 (`OverlayLine` 1, `LiveLineView` 1, `overlay.css` 1, `SpeakerAsk` 1), store bản chép lời 4, `TranscriptRow` 4, `SpeakerMenu.test.ts` 8 (`SpeakerMenu` 3, `dismissal` 5), `SpeakerSettings` 4, app store 1.

- [ ] **Step 4: Cổng chống lọt và script phát hành**

Run: `cd $W && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)" && grep -rln "AI_TRANSLATOR_DEV_SPEAKER" src-tauri/src src && grep -n "AI_TRANSLATOR_DEV_SPEAKER" src-tauri/src/speaker/mod.rs && scripts/release/check-no-network.sh speaker-worker speaker-protocol 2>&1 | tail -1`
Expected: `# fail 0`; trong `src-tauri/src` và `src` chỉ `src-tauri/src/speaker/mod.rs` có chuỗi cờ dev; trong file đó chỉ các dòng chú thích `//!` (không vào binary) và dòng `pub const DEV_SPEAKER_ENV …` ngay dưới `#[cfg(debug_assertions)]` (cổng `no-dev-gate` của bản phát hành không đổi); kiểm không mã mạng đạt (kế hoạch 03 không đụng worker).

- [ ] **Step 5: Test bản phát hành của `speaker::`** (build nặng, tùy đĩa; CI cũng chạy ở bước "Test bản quyền, báo cáo lỗi và nhận giọng ở bản release")

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 MACOSX_DEPLOYMENT_TARGET=14.2 cargo test --release --locked -p meeting-translator --lib -- speaker:: --test-threads=1 2>&1 | grep -E "^test result|FAILED|release_builds"`
Expected: `release_builds_never_enable_speaker ... ok`, `release_builds_never_activate_speaker_whatever_the_settings ... ok`, `test result: ok`. Lệnh in "đĩa còn … GiB, dừng" (dưới 18 GiB, đo ngay lúc này chứ không dùng số của Step 1) thì không build: ghi "để CI" và báo chủ dự án.

- [ ] **Step 6: Đối chiếu thay đổi**

Run: `cd $W && git status --short`
Expected: chỉ các file trong bảng "Cấu trúc file" của file 03 và hai file kế hoạch; không có file trong `target/`, không có ảnh. Không commit.

---

### Task 23: Thử trên app dev thật **(cần chủ dự án)**

Kế hoạch 03 không tự chạy app (cần quyền ghi âm hệ thống cho bản dev, bấm Bắt đầu). Chủ dự án làm theo, báo lại kết quả từng mục.

**Cảnh báo mất dữ liệu (QĐ 22 của file 03; rà soát A-C1, rà soát lần 2 A-Q1, A-N5):**
- Bản dev ký bằng đúng `identifier` của app đã cài (`com.aitranslator.desktop`), nên dùng chung thư mục dữ liệu và kho khóa. Từ Task 0b của file 03 (QĐ 22, đã quyết 2026-10-27) bản dev dùng file DB riêng `data-dev.db` và mục khóa DB riêng `db-key-dev`, không mở `data.db` và không đọc, ghi, xóa `db-key` của app đã cài; Lịch sử và từ điển của bản dev tách riêng, bắt đầu rỗng. Step 1 vẫn sao lưu `data.db` làm bảo hiểm phụ; Step 3 kiểm `data.db` **không đổi byte** (so `cmp` với bản sao lưu) và chỉ khôi phục khi nó đổi. **Trong khoảng giữa không mở app đã cài** (app đã cài ghi vào `data.db` thì phép so của Step 3 mất ý nghĩa).
- Thư mục dữ liệu (`app_local_data_dir`, `src-tauri/src/db.rs` `install`): macOS `~/Library/Application Support/com.aitranslator.desktop/`, Windows `%LOCALAPPDATA%\com.aitranslator.desktop`; file `data.db` của app đã cài, và `data.db-journal` nếu có (`db.rs` `journal_path`; `db.rs` không bật WAL nên không có `-wal`, `-shm`); file của bản dev: `data-dev.db` (và `data-dev.db-journal`).
- **Không khởi động lại hay đăng xuất máy giữa Step 1 và Step 3.** App đã cài có mục khởi động cùng hệ thống (`~/Library/LaunchAgents/com.aitranslator.desktop.plist`; bản debug không tự đăng ký mục này, `src-tauri/src/lib.rs:131-134`), nên sẽ tự mở và có thể ghi vào `data.db` (Lịch sử của phiên dịch), làm Step 3 báo `data.db` đổi dù bản dev không đụng tới. Lỡ khởi động lại thì thoát app đã cài ngay (menu khay › Thoát) rồi chạy Step 3 (Step 3 dừng khi app đã cài còn chạy); Step 3 báo đổi thì báo lại trước khi khôi phục (khôi phục làm mất những gì app đã cài vừa lưu).
- **Lịch sử và từ điển tạo trong lúc thử bản dev (Step 2) chỉ nằm trong `data-dev.db`:** không bao giờ hiện ở app đã cài. Đừng lưu phiên cần giữ hay thêm mục từ điển thật bằng bản dev.
- Khóa DB không được sao lưu (không chép bí mật ra file, spec §10.2). **Bản dev có mục khóa DB riêng `db-key-dev`** (QĐ 22; tự tạo ở lần mở DB đầu tiên) và không đụng `db-key` của app đã cài, nên bấm "Xóa toàn bộ dữ liệu" ở bản dev chỉ xóa `data-dev.db` và `db-key-dev`, không còn ảnh hưởng app đã cài (`data.db` và `db-key` giữ nguyên; kiểm bằng Step 3). "Xóa model và dữ liệu" ở bản dev làm đúng việc đó và thêm xóa thư mục `models/` dùng chung với app đã cài (tải lại được, không mất Lịch sử; chỉ bấm khi chấp nhận tải lại model). Step 3 vẫn **dừng, không khôi phục** khi có file `data.db.unreadable-*` mới: file đó nghĩa là có điều ngoài dự kiến đã đụng khóa hay file của app đã cài.
- Ba đoạn lệnh dưới chạy bằng `bash` (cả khi shell của bạn là zsh); `exit` chỉ thoát đoạn lệnh. Đoạn nào in một dòng có chữ "dừng", hay `cp`, `cmp`, `mv` báo lỗi, thì **dừng cả Task 23** (đang ở Step 1: không chạy bản dev; đang ở Step 3: không mở app đã cài) và báo lại dòng đó. Mẫu `pgrep` viết `[.]` thay cho `.` để không khớp chính shell đang chạy lệnh (dòng lệnh của shell đó có chuỗi mẫu).

**Files:** không

- [ ] **Step 1: Sao lưu DB rồi chuẩn bị (cần chủ dự án)**

1. Thoát hẳn app đã cài (menu khay › Thoát).
2. Sao lưu ra ngoài repo (bảo hiểm phụ: bản dev dùng `data-dev.db`, không đụng `data.db`). Đoạn lệnh kiểm app đã cài và bản dev đều đã thoát, so từng file chép được với bản gốc bằng `cmp`, rồi mới ghi đường dẫn thư mục sao lưu vào file cố định `$DATA/db-backup-dang-dung.txt` để Step 3 dùng đúng thư mục đó. Còn file đó (lần trước chưa khôi phục) thì không sao lưu đè: một bản sao lưu mới lúc này là bản DB đã bị bản dev nâng.

```bash
cd $W && DATA="$DATA" bash -euo pipefail <<'EOF'
D="$HOME/Library/Application Support/com.aitranslator.desktop"
P="$DATA/db-backup-dang-dung.txt"
unreadable() { if [ -d "$D" ]; then find "$D" -maxdepth 1 -name 'data.db.unreadable-*' -print | sed 's|.*/||' | sort; fi; }
if [ -z "$DATA" ] || [ ! -d "$DATA" ]; then echo "DATA chưa đặt hay không phải thư mục: dừng"; exit 1; fi
if [ -e "$P" ]; then echo "còn bản sao lưu chưa khôi phục ($(cat "$P")): chạy Step 3 trước, dừng"; exit 1; fi
if pgrep -lf "AI Translator[.]app/Contents/MacOS"; then echo "app đã cài còn chạy: thoát nó, dừng"; exit 1; fi
if pgrep -lf "AI Translator Dev[.]app/Contents/MacOS"; then echo "bản dev còn chạy: thoát nó, dừng"; exit 1; fi
BK="$DATA/db-backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$BK"
unreadable > "$BK/unreadable-truoc.txt"
if [ -e "$D/data.db" ]; then
  for f in data.db data.db-journal; do
    if [ -e "$D/$f" ]; then
      cp -p "$D/$f" "$BK/$f"
      if ! cmp "$D/$f" "$BK/$f"; then echo "bản sao $f khác bản gốc: dừng"; exit 1; fi
    fi
  done
else
  touch "$BK/KHONG-CO-DB"
fi
printf '%s\n' "$BK" > "$P"
ls -l "$BK"
echo "SAO LƯU XONG: $BK"
EOF
```

   Expected: dòng cuối `SAO LƯU XONG: …/db-backup-<thời điểm>`; `ls` có `data.db` (và `data.db-journal` nếu có) cùng kích thước với bản gốc, cùng `unreadable-truoc.txt`. Máy chưa từng có DB (chưa dùng Lịch sử, từ điển) thì có `KHONG-CO-DB` thay cho `data.db`: sau khi thử vẫn phải không có `data.db`. Không có dòng `SAO LƯU XONG` thì dừng cả Task 23, không chạy bản dev.
3. `$W/.env` có `AI_TRANSLATOR_DEV_SPEAKER=true`; có `src-tauri/binaries/speaker-worker` (chép bằng `scripts/copy-sidecars.sh`) và model `eres2net-sv-en-voxceleb-16k.onnx` trong thư mục model của bản dev (như kế hoạch 02 Task 18). Chạy `cd $W && scripts/run-dev-app.sh`.

- [ ] **Step 2: Danh sách thử (cần chủ dự án)**

1. Cài đặt › Phụ đề có nhóm "Người nói", hai công tắc bật sẵn; macOS có dòng "Quyền Trợ năng".
2. Bấm Bắt đầu, phát một đoạn hội thoại 2–3 người (video họp, podcast): thanh phụ đề hiện "Người 1", "Người 2"… có màu ở dòng đầu mỗi lượt, vạch màu mọi câu; chữ dịch không chậm đi thấy được.
3. Bản chép lời: chip ở câu đầu lượt; bấm chip "Người 2" → đổi tên "Minh" → Lưu: mọi câu của giọng đó (cả trên thanh phụ đề) đổi thành "Minh" ngay.
4. Gộp "Người 3" vào "Minh": câu của Người 3 hiện là Minh, cùng màu.
5. Tắt "Phân biệt người nói" giữa phiên: nhãn và vạch biến mất ngay ở cả hai cửa sổ; `~/Library/Logs/<bundle-id>/` có dòng "nhận giọng: người dùng tắt, dừng worker của phiên", không có tên người.
6. Bật lại, bấm Dừng rồi Bắt đầu: có nhãn lại từ phiên mới.
7. Pro + bật "Lưu lịch sử": dừng phiên, mở Lịch sử: nhãn như lúc dừng (tên đã đổi), không bấm được; xuất TXT, Markdown có tên; SRT chỉ có tên khi tích "Thêm tên người nói".
8. Đổi ngôn ngữ giao diện sang English giữa phiên: "Người 1" thành "Speaker 1".
9. Bấm nhãn mở menu, gõ vài chữ, bấm lại chính nhãn: menu đóng (không mở lại). Mở lại, Esc: menu đóng, focus về nhãn (Tab đi tiếp từ nhãn). Mở menu của dòng cuối, cuộn xuống đáy rồi bấm nhãn của một dòng khác: menu sang dòng đó ngay ở cú bấm đầu (rà soát lần 2, B-Q-mới 2). Máy có bộ gõ tiếng Nhật, Trung hay Hàn: gõ vào ô tên, Esc khi chữ còn đang ghép thì chỉ hủy chữ đang ghép, menu còn mở.
10. Bản phát hành (khi chủ dự án dựng thử, không bắt buộc ở 03): không có nhóm "Người nói", thanh phụ đề như 0.3.1. Bản phát hành dựng thử dùng đúng `data.db` của app đã cài (chỉ bản debug dùng `data-dev.db`) và nâng nó lên phiên bản 2: thử **sau** Step 3, theo đúng Step 1 → thử → Step 3 thêm một lần (Step 1 từ chối chạy khi lần trước chưa xong Step 3); lần đó Step 3 bước 2 sẽ báo `data.db` đổi, chạy đoạn khôi phục ở bước 3.

Expected: chủ dự án báo đạt từng mục; mục nào không đạt thì ghi lại để sửa trước kế hoạch 04.

- [ ] **Step 3: Kiểm `data.db` không đổi (khôi phục nếu đổi) và kiểm app đã cài (cần chủ dự án)**

1. Thoát bản dev (menu khay › Thoát; `scripts/run-dev-app.sh` tự kết thúc khi app thoát).
2. Kiểm `data.db` của app đã cài không đổi byte so với bản sao lưu ở Step 1. Đoạn lệnh không ghi gì vào thư mục dữ liệu: kiểm bản dev và app đã cài đều đã thoát, không có `data.db.unreadable-*` mới, rồi so `data.db` (và `data.db-journal`) bằng `cmp`. Không đổi thì dời file ghi thư mục sao lưu vào thư mục đó (Step 1 lần sau chạy được) và không khôi phục gì.

```bash
cd $W && DATA="$DATA" bash -euo pipefail <<'EOF'
D="$HOME/Library/Application Support/com.aitranslator.desktop"
P="$DATA/db-backup-dang-dung.txt"
unreadable() { if [ -d "$D" ]; then find "$D" -maxdepth 1 -name 'data.db.unreadable-*' -print | sed 's|.*/||' | sort; fi; }
if [ -z "$DATA" ] || [ ! -s "$P" ]; then echo "không thấy file ghi thư mục sao lưu (Step 1 chưa xong?): dừng, không đụng DB"; exit 1; fi
BK="$(cat "$P")"
if [ ! -d "$BK" ]; then echo "không có thư mục sao lưu $BK: dừng"; exit 1; fi
if pgrep -lf "AI Translator Dev[.]app/Contents/MacOS"; then echo "bản dev còn chạy: thoát hẳn, dừng"; exit 1; fi
if pgrep -lf "AI Translator[.]app/Contents/MacOS"; then echo "app đã cài đang chạy: thoát nó, dừng"; exit 1; fi
unreadable > "$BK/unreadable-sau.txt"
if ! cmp -s "$BK/unreadable-truoc.txt" "$BK/unreadable-sau.txt"; then
  echo "có data.db.unreadable-* mới: dừng, không khôi phục, không mở app đã cài"
  diff "$BK/unreadable-truoc.txt" "$BK/unreadable-sau.txt" || true
  exit 1
fi
changed=0
for f in data.db data.db-journal; do
  if [ -e "$BK/$f" ] || [ -e "$D/$f" ]; then
    if [ ! -e "$BK/$f" ] || [ ! -e "$D/$f" ] || ! cmp -s "$BK/$f" "$D/$f"; then echo "$f ĐÃ ĐỔI so với bản sao lưu"; changed=1; fi
  fi
done
if [ "$changed" = 1 ]; then echo "data.db của app đã cài đã đổi: dừng, không mở app đã cài, báo lại rồi chạy đoạn khôi phục ở bước 3"; exit 1; fi
if [ -e "$D/data-dev.db" ]; then ls -l "$D/data-dev.db"; else echo "không có data-dev.db (bản dev chưa mở DB)"; fi
mv "$P" "$BK/khong-doi.txt"
echo "DATA.DB KHÔNG ĐỔI so với $BK: không cần khôi phục"
EOF
```

   Expected: dòng cuối `DATA.DB KHÔNG ĐỔI …`, trước đó `ls` thấy `data-dev.db` (lần chạy bản dev đầu tiên từ Task 0b của file 03 thì là file mới tạo; bước 7 của Step 2 đã mở DB). Máy chưa từng có DB thì vẫn không có `data.db`. Có dòng `ĐÃ ĐỔI` hay chữ "dừng" thì không mở app đã cài, báo lại dòng đó: `data.db` đổi nghĩa là bản dev vẫn đụng tới DB của app đã cài (lỗi của Task 0b, phải sửa trước kế hoạch 04) hay app đã cài đã chạy giữa chừng. Đã có dòng `DATA.DB KHÔNG ĐỔI` thì bỏ qua bước 3, sang bước 4.
3. **Chỉ khi bước 2 báo `data.db` đã đổi:** khôi phục từ đúng thư mục ghi ở Step 1. Đoạn lệnh không xóa gì: kiểm bản dev và app đã cài đều đã thoát và không có `data.db.unreadable-*` mới; chép bản sao lưu sang tên tạm cạnh DB và so bằng `cmp`; chỉ sau đó mới dời `data.db` đã đổi vào `<thư mục sao lưu>/ban-dev/` và đổi tên tạm thành `data.db` (`data-dev.db` không bị đụng).

```bash
cd $W && DATA="$DATA" bash -euo pipefail <<'EOF'
D="$HOME/Library/Application Support/com.aitranslator.desktop"
P="$DATA/db-backup-dang-dung.txt"
unreadable() { if [ -d "$D" ]; then find "$D" -maxdepth 1 -name 'data.db.unreadable-*' -print | sed 's|.*/||' | sort; fi; }
if [ -z "$DATA" ] || [ ! -s "$P" ]; then echo "không thấy file ghi thư mục sao lưu (Step 1 chưa xong?): dừng, không đụng DB"; exit 1; fi
BK="$(cat "$P")"
if [ ! -d "$BK" ]; then echo "không có thư mục sao lưu $BK: dừng"; exit 1; fi
if [ ! -s "$BK/data.db" ] && [ ! -e "$BK/KHONG-CO-DB" ]; then echo "$BK không có data.db: dừng, không đụng DB"; exit 1; fi
if pgrep -lf "AI Translator Dev[.]app/Contents/MacOS"; then echo "bản dev còn chạy: thoát hẳn, dừng"; exit 1; fi
if pgrep -lf "AI Translator[.]app/Contents/MacOS"; then echo "app đã cài đang chạy: thoát nó, dừng"; exit 1; fi
unreadable > "$BK/unreadable-sau.txt"
if ! cmp -s "$BK/unreadable-truoc.txt" "$BK/unreadable-sau.txt"; then
  echo "có data.db.unreadable-* mới (khóa trong kho khóa có thể đã bị thay): dừng, không khôi phục, không mở app đã cài"
  diff "$BK/unreadable-truoc.txt" "$BK/unreadable-sau.txt" || true
  exit 1
fi
if [ ! -e "$BK/KHONG-CO-DB" ]; then
  for f in data.db data.db-journal; do
    if [ -e "$BK/$f" ]; then
      cp -p "$BK/$f" "$D/$f.khoi-phuc"
      if ! cmp "$BK/$f" "$D/$f.khoi-phuc"; then echo "chép $f sang tên tạm hỏng: dừng (data.db hiện tại còn nguyên)"; exit 1; fi
    fi
  done
fi
mkdir -p "$BK/ban-dev"
for f in data.db data.db-journal; do
  if [ -e "$D/$f" ]; then mv "$D/$f" "$BK/ban-dev/$f"; fi
done
for f in data.db data.db-journal; do
  if [ -e "$D/$f.khoi-phuc" ]; then mv "$D/$f.khoi-phuc" "$D/$f"; fi
done
if [ ! -e "$BK/KHONG-CO-DB" ] && ! cmp "$BK/data.db" "$D/data.db"; then echo "data.db sau khi khôi phục khác bản sao lưu: dừng"; exit 1; fi
mv "$P" "$BK/da-khoi-phuc.txt"
ls -l "$D" | grep 'data\.db' || true
echo "KHÔI PHỤC XONG từ $BK (data.db đã đổi ở $BK/ban-dev)"
EOF
```

   Expected: dòng cuối `KHÔI PHỤC XONG từ …`; `data.db` cùng kích thước với bản trong thư mục sao lưu; không còn file `*.khoi-phuc`. Máy chưa từng có DB thì thư mục dữ liệu không còn `data.db` (`data.db` vừa xuất hiện đã dời vào `ban-dev/`). Không có dòng `KHÔI PHỤC XONG` thì dừng, không mở app đã cài, báo lại dòng có chữ "dừng"; mọi file (bản sao lưu, `data.db` đã đổi, `data.db.unreadable-*`) vẫn còn nguyên để xem cách lấy lại.
4. Mở app đã cài: Lịch sử hiện danh sách phiên cũ, không báo lỗi dữ liệu; Từ điển thuật ngữ còn các mục cũ (Pro).

Expected: app đã cài mở được Lịch sử và từ điển như trước khi thử. Giữ thư mục sao lưu (cả `ban-dev/`) tới khi chủ dự án xác nhận, rồi tự xóa.
