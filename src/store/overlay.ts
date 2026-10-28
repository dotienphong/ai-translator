import { createStore } from "zustand/vanilla";
import type { AppStatus, Ipc, LiveLine, OverlayView, ResizeEdge, Subtitle, SubtitleDelta } from "../lib/ipc";
import { NO_VOICES, type VoiceMap, mergeVoices, setSpeaker } from "../lib/speakers";

// Store của thanh phụ đề. Cửa sổ `overlay` chỉ đọc được phần cài đặt của nó (`get_overlay_view`)
// và nghe sự kiện (phụ đề, trạng thái, mức âm lượng, người nói); lệnh khác duy nhất là `open_speaker_settings` của dòng mời cấp
// quyền (spec 2026-10-26-phan-biet-nguoi-noi §8.4).

// Số câu giữ lại tối đa trên thanh (§4.4): thanh giữ mọi câu để người dùng cuộn xem lại, chỉ chặn ở mức này để cuộc họp
// rất dài không làm DOM và bộ nhớ phình mãi. 1000 câu là vài giờ họp; câu cũ hơn vẫn có ở Lịch sử nếu bật lưu (F4).
export const MAX_LINES = 1000;

// Giữ tối đa `max` phụ đề gần nhất (mặc định `MAX_LINES`), xếp theo `id` (id tăng theo thứ tự câu, và không trùng giữa các phiên nhờ `id_base`).
// Phụ đề cùng `id` (phụ đề tạm được thay, §6.3; bản dịch xong) cập nhật tại chỗ; phụ đề đã được gộp vào phụ đề mới
// (`replaces`, §7) thì bỏ. Phụ đề gộp mang id của câu đầu (nhỏ hơn câu mới đã hiện sau nó), nên nếu nó thay một dòng
// đang hiện thì vào đúng chỗ dòng đầu tiên bị thay (S1 của review 02 lần 2). Phụ đề khác không có trên thanh mà cũ hơn
// dòng đầu (bản dịch xong sau khi câu đó đã bị chặn bởi `max`) thì bỏ qua; còn lại thì chèn đúng chỗ theo `id`.
export function upsertLine(lines: readonly Subtitle[], subtitle: Subtitle, max: number = MAX_LINES): Subtitle[] {
  const replaced = (l: Subtitle) => subtitle.replaces.includes(l.id);
  const kept = lines.filter((l) => !replaced(l));
  const i = kept.findIndex((l) => l.id === subtitle.id);
  const firstReplaced = lines.findIndex(replaced);
  let next: Subtitle[];
  if (i >= 0) {
    next = kept.map((l, j) => (j === i ? subtitle : l));
  } else if (firstReplaced >= 0) {
    const at = lines.slice(0, firstReplaced).filter((l) => !replaced(l)).length;
    next = [...kept.slice(0, at), subtitle, ...kept.slice(at)];
  } else {
    const first = kept[0];
    if (first && subtitle.id < first.id) return kept;
    const at = kept.findIndex((l) => l.id > subtitle.id);
    next = at < 0 ? [...kept, subtitle] : [...kept.slice(0, at), subtitle, ...kept.slice(at)];
  }
  return next.slice(-Math.max(1, max));
}

// Nối phần chữ dịch mới vào phụ đề cùng `id`. Phụ đề đã trôi khỏi thanh thì bỏ qua.
export function appendDelta(lines: readonly Subtitle[], delta: SubtitleDelta): Subtitle[] {
  return lines.map((l) => (l.id === delta.id ? { ...l, tgt_text: l.tgt_text + delta.text } : l));
}

// Trạng thái chốt: lượt cuối của đoạn đã xong (spec 2026-10-10 §4.5), dòng đang nói của đoạn đó hết chỗ.
const SETTLED: ReadonlySet<Subtitle["status"]> = new Set(["done", "failed", "same_lang", "skipped", "dropped"]);

// Dòng đang nói mới hay cập nhật (`subtitle://live`, spec 2026-10-10 §6.2): thay dòng cùng `id`, dòng mới xếp theo `id`.
// Phụ đề cùng `id` đang trên thanh ở trạng thái chốt thì lượt cuối của đoạn đã xong: dòng tới muộn, bỏ.
export function applyLive(live: LiveLine[], lines: readonly Subtitle[], line: LiveLine): LiveLine[] {
  if (lines.some((l) => l.id === line.id && SETTLED.has(l.status))) return live;
  const i = live.findIndex((x) => x.id === line.id);
  if (i >= 0) return live.map((x, j) => (j === i ? line : x));
  return [...live, line].sort((a, b) => a.id - b.id);
}

// Gỡ dòng đang nói (`subtitle://live-end`). Không có dòng đó thì giữ nguyên mảng.
export function endLive(live: LiveLine[], id: number): LiveLine[] {
  return live.some((x) => x.id === id) ? live.filter((x) => x.id !== id) : live;
}

// Phụ đề vừa tới chốt lượt cuối của một dòng đang nói (cùng `id`, hay gộp dòng đó qua `replaces`): gỡ dòng đó ngay, bản cuối
// hiện đúng chỗ (spec 2026-10-10 §4.5, §6.1). `live-end` của engine tới ngay sau; đây là lưới an toàn. Phụ đề mà dòng chỉ
// nối tiếp (`extends`) thì không gỡ: phụ đề đó đã `done` (tạm) từ trước khi dòng nối tiếp nó.
export function settleLive(live: LiveLine[], subtitle: Subtitle): LiveLine[] {
  if (live.length === 0 || !SETTLED.has(subtitle.status)) return live;
  const settled = (id: number) => id === subtitle.id || subtitle.replaces.includes(id);
  return live.some((x) => settled(x.id)) ? live.filter((x) => !settled(x.id)) : live;
}

// Một dòng trên thanh: phụ đề, hay dòng đang nói.
export type OverlayRow = { kind: "line"; line: Subtitle } | { kind: "live"; live: LiveLine };

// Các dòng thanh phụ đề vẽ, theo thứ tự (spec 2026-10-10 §6.1; QĐ6 của kế hoạch 03):
// - dòng đang nói ở chỗ của phụ đề nó nối tiếp (`extends`); không có thì ở chỗ phụ đề cùng `id` (lượt cuối đang chạy); không
//   có nữa thì sau dòng cuối, theo `id`;
// - phụ đề có `id` bằng `id` hay `extends` của một dòng đang nói thì tạm ẩn;
// - hai dòng đang nói cùng một chỗ thì chỉ dòng mới nhất (id lớn nhất) hiện: nó nối tiếp câu của dòng kia nên đã có chữ của
//   câu đó.
// Đối tượng phụ đề và dòng đang nói giữ nguyên tham chiếu, để `OverlayLine` và `LiveLineView` (memo) không vẽ lại thừa.
export function visibleRows(lines: readonly Subtitle[], live: readonly LiveLine[]): OverlayRow[] {
  if (live.length === 0) return lines.map((line): OverlayRow => ({ kind: "line", line }));
  const ids = new Set(lines.map((l) => l.id));
  const anchored = new Map<number, LiveLine>();
  const after: LiveLine[] = [];
  for (const x of [...live].sort((a, b) => a.id - b.id)) {
    const anchor = x.extends !== null && ids.has(x.extends) ? x.extends : ids.has(x.id) ? x.id : null;
    if (anchor === null) after.push(x);
    else anchored.set(anchor, x);
  }
  const hidden = new Set(live.flatMap((x) => (x.extends === null ? [x.id] : [x.id, x.extends])));
  const rows: OverlayRow[] = [];
  for (const line of lines) {
    const x = anchored.get(line.id);
    if (x) rows.push({ kind: "live", live: x });
    else if (!hidden.has(line.id)) rows.push({ kind: "line", line });
  }
  for (const x of after) rows.push({ kind: "live", live: x });
  return rows;
}

export interface OverlayStoreState {
  view: OverlayView | null;
  status: AppStatus | null;
  lines: Subtitle[];
  // Dòng đang nói (spec 2026-10-10 §6.1), xếp theo `id`; chỉ thanh phụ đề có (QĐ5).
  live: LiveLine[];
  // Mức âm lượng vào gần nhất (RMS), cho chỉ báo "đang nghe"; 0 khi phiên không chạy.
  level: number;
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
  init(): Promise<() => void>;
}

export function createOverlayStore(ipc: Ipc) {
  return createStore<OverlayStoreState>()((set, get) => ({
    view: null,
    status: null,
    lines: [],
    live: [],
    level: 0,
    voices: NO_VOICES,
    askAccess: false,
    askDismissed: false,
    rosterRev: 0,
    async init() {
      const offs = await Promise.all([
        ipc.listen("overlay://view", (view) => set({ view })),
        ipc.listen("subtitle://upsert", (subtitle) =>
          set({ lines: upsertLine(get().lines, subtitle), live: settleLive(get().live, subtitle) }),
        ),
        ipc.listen("subtitle://delta", (delta) => set({ lines: appendDelta(get().lines, delta) })),
        ipc.listen("subtitle://live", (line) => set({ live: applyLive(get().live, get().lines, line) })),
        ipc.listen("subtitle://live-end", (end) => set({ live: endLive(get().live, end.id) })),
        ipc.listen("audio://level", (level) => set({ level })),
        // Nhãn tới muộn sửa đúng dòng; bảng người nói mới (spec 2026-10-26-phan-biet-nguoi-noi §4.3, §9), bỏ bảng cũ hơn (QĐ 25).
        ipc.listen("subtitle://speaker", (label) => set({ lines: setSpeaker(get().lines, label) })),
        ipc.listen("speaker://roster", (roster) => {
          if (roster.rev < get().rosterRev) return;
          set({ voices: mergeVoices(get().voices, roster.voices), askAccess: roster.askAccess, rosterRev: roster.rev });
        }),
        // Trạng thái app (cùng `rev` như cửa sổ chính): bỏ trạng thái cũ tới muộn; phiên mới bắt đầu thì xóa phụ đề cũ. Dòng
        // đang nói chỉ có khi phiên đang chạy: phiên mới, phiên dừng hay lỗi thì bỏ hết (engine đã gửi `live-end` khi dừng;
        // đây là lưới an toàn, spec 2026-10-10 §6.2).
        ipc.listen("app://status", (status) => {
          const prev = get().status;
          if (prev && status.rev < prev.rev) return;
          const fresh = status.session === "starting" && prev?.session !== "starting";
          const level = status.session === "running" ? get().level : 0;
          const live = status.session === "running" || get().live.length === 0 ? get().live : [];
          set(
            fresh
              ? { status, lines: [], live, level, voices: NO_VOICES, askAccess: false, askDismissed: false }
              : { status, live, level },
          );
        }),
      ]);
      // Cài đặt mới hơn đã tới qua `overlay://view` trong lúc chờ thì giữ bản đó (N-3 của review 02 lần 2).
      const view = await ipc.invoke("get_overlay_view");
      if (!get().view) set({ view });
      return () => offs.forEach((off) => off());
    },
    dismissAsk() {
      set({ askDismissed: true });
    },
  }));
}

// Kéo cạnh hay góc để đổi kích thước thanh phụ đề (§4.4): bấm giữ thì báo phía Rust cạnh nào (`begin_overlay_resize`),
// con trỏ di chuyển thì báo mỗi khung hình nhiều nhất một lần (`overlay_resize_move`; phía Rust tự đọc vị trí con trỏ,
// không nhận tọa độ từ giao diện), nhả chuột thì báo xong (`end_overlay_resize`, phía Rust nhớ kích thước mới).
export function createResizeDrag(ipc: Ipc, nextFrame: (run: () => void) => void = (run) => requestAnimationFrame(run)) {
  let dragging = false;
  let queued = false;
  const send = (call: Promise<unknown>) => void call.catch(() => {});
  return {
    begin(edge: ResizeEdge) {
      dragging = true;
      send(ipc.invoke("begin_overlay_resize", { edge }));
    },
    move() {
      if (!dragging || queued) return;
      queued = true;
      nextFrame(() => {
        queued = false;
        if (dragging) send(ipc.invoke("overlay_resize_move"));
      });
    },
    end() {
      if (!dragging) return;
      dragging = false;
      send(ipc.invoke("end_overlay_resize"));
    },
  };
}
