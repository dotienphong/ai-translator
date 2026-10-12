// Bản giả của `@tauri-apps/api/core` và `@tauri-apps/api/event` cho trang xem trước (vite.config.ts): trả dữ liệu mẫu theo
// tham số URL, giữ trạng thái trong bộ nhớ để bấm thử được (đổi cài đặt, bắt đầu/dừng, sửa thuật ngữ…). Không dùng trong
// app thật.
//
// Tham số URL (đều không bắt buộc):
//   lang=vi|en|ja|zh|ko  theme=light|dark  platform=macos|windows
//   screen=home|transcript|history|glossary|settings|upgrade|about  group=general|subtitles|audio|model|hotkeys|license|privacy
//   session=idle|starting|running|error  error=<mã lỗi phiên>  plan=free|monthly|yearly  trial=active|ended
//   onboarding=<số bước, từ 1>  checkout=1  download=1  notice=update|quit|hotkeys|license|error  empty=1
//   overlay (overlay.html): locked=1  source=0  text=<màu>  bg=<màu>  opacity=<0–1>  size=<px>  latest=1  notes=<note,…>
//   dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6): tws=0 (tắt công tắc)  slow=1 (máy chưa đủ nhanh)
//     overlay.html: live=alone|extends|final|provisional (mẫu dòng đang nói, xem `LIVE_SAMPLE`; cần session=running)
import type { AppInfo, AppStatus, LicenseView, LiveLine, Settings, Subtitle } from "../../src/lib/ipc";
import type { ModelsView, PackView } from "../../src/lib/models";

const q = new URLSearchParams(location.search);
const param = (k: string, d = "") => q.get(k) ?? d;
type UiLang = "vi" | "en" | "ja" | "zh" | "ko";
const lang = param("lang", "vi") as UiLang;
// Chữ mẫu theo ngôn ngữ giao diện; bản dịch của dữ liệu mẫu là ngôn ngữ đích, cũng là ngôn ngữ giao diện.
const pick = <T,>(by: Record<UiLang, T>): T => by[lang];
const platform = param("platform", "macos") as "macos" | "windows";
const sessionParam = param("session", "idle") as AppStatus["session"];
const plan = param("plan", "monthly") as "free" | "monthly" | "yearly";
const empty = param("empty") === "1";
const now = Date.now();
const sec = (ms: number) => Math.floor(ms / 1000);
const DAY = 86_400_000;

// ---------------------------------------------------------------- dữ liệu mẫu

let settings: Settings = {
  uiLanguage: lang,
  targetLanguage: lang,
  sourceLanguages: ["en", "zh", "ja", "ko", "vi"],
  sourceLock: null,
  audioSource: platform === "macos" ? { kind: "app", bundleId: "us.zoom.xos" } : { kind: "system" },
  vadEndSilenceMs: 300,
  overlay: {
    fontSize: Number(param("size", "28")),
    lines: 3,
    opacity: Number(param("opacity", "0.6")),
    textColor: param("text", "white") as Settings["overlay"]["textColor"],
    background: param("bg", "black") as Settings["overlay"]["background"],
    showSource: param("source", "1") !== "0",
    locked: param("locked") === "1",
    positions: {},
    lastMonitor: null,
  },
  translateWhileSpeaking: param("tws") !== "0",
  modelTier: "standard",
  hotkeys: {
    toggleSession: "Ctrl+Alt+T",
    toggleOverlay: "Ctrl+Alt+H",
    toggleLock: "Ctrl+Alt+L",
    scrollUp: "Ctrl+Alt+PageUp",
    scrollDown: "Ctrl+Alt+PageDown",
  },
  saveHistory: param("history") !== "0",
  launchAtLogin: true,
  theme: param("theme", "light") as Settings["theme"],
  updateChannel: "stable",
  experimental: { translationContext: true },
  onboardingDone: !q.has("onboarding"),
  revision: 1,
};

let status: AppStatus = {
  session: sessionParam,
  overlayVisible: sessionParam === "running",
  hotkeyFailures: param("notice") === "hotkeys" ? ["toggleOverlay"] : [],
  loading: sessionParam === "starting" ? "model" : null,
  sessionError: sessionParam === "error" ? param("error", "audioPermission") : null,
  cpuFallback: false,
  suggestLite: false,
  indicators: { lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: false },
  streamingTooSlow: param("slow") === "1",
  permissionSuspected: false,
  waitingForApp: false,
  pro: plan !== "free",
  quotaWarning: false,
  quotaResetAt: sec(now + 20 * DAY),
  updateReady: param("notice") === "update" ? "0.1.7" : null,
  updateReprompts: param("notice") === "update" && platform === "macos",
  updateCheck: "idle",
  rev: 1,
};

const info: AppInfo = {
  name: "AI Translator",
  version: "0.1.6",
  identifier: "com.aitranslator.desktop",
  platform,
  launchedAtLogin: false,
};

function licenseView(): LicenseView {
  const free = plan === "free";
  const trialEnded = param("trial") === "ended";
  return {
    standing: param("notice") === "license" ? "expired" : free ? "free" : "active",
    plan,
    licensedPlan: null,
    key: free ? null : "••••-••••-••••-••••-••••-••••-Q9XD",
    expiresAt: free ? null : sec(now + (plan === "yearly" ? 300 : 20) * DAY),
    refreshBefore: null,
    validatedAt: sec(now - 3_600_000),
    renewSoon: false,
    quota: free
      ? {
          unlimited: false,
          limitMs: 30 * 60_000,
          usedMs: 6 * 60_000,
          remainingMs: trialEnded ? 0 : 24 * 60_000,
          resetAt: sec(now + 6 * 3_600_000),
          resetKind: "daily",
          needsNetwork: false,
          lost: false,
          storageError: false,
        }
      : {
          unlimited: plan === "yearly",
          limitMs: 50 * 3_600_000,
          usedMs: 6 * 3_600_000 + 12 * 60_000,
          remainingMs: 43 * 3_600_000 + 48 * 60_000,
          resetAt: sec(now + 20 * DAY),
          resetKind: "cycle",
          needsNetwork: false,
          lost: false,
          storageError: false,
        },
    serverConfigured: true,
    devOverride: false,
    clockRolledBack: false,
    trial: free
      ? { status: trialEnded ? "ended" : "active", endsAt: sec(now + 7 * DAY), daysLeft: trialEnded ? 0 : 7 }
      : { status: "none", endsAt: null, daysLeft: 0 },
    conflict: null,
  };
}

function pack(id: "standard" | "lite", bytes: number, extra: Partial<PackView>): PackView {
  return {
    id,
    name: id === "standard" ? { vi: "Chuẩn", en: "Standard" } : { vi: "Nhẹ", en: "Lite" },
    note:
      id === "standard"
        ? {
            vi: "Khả năng dịch chính xác nhất. Nên chọn nếu bạn cần dịch chuyên sâu và có từ ngữ chuyên ngành. Cần máy có RAM >= 16 GB.",
            en: "Most accurate translation. Recommended for in-depth translation with specialized terminology. Needs a machine with RAM >= 16 GB.",
          }
        : {
            vi: "Nhẹ hơn gói Chuẩn. Chạy được trên máy RAM 8 GB – 16 GB, phù hợp với máy yếu. Tốc độ dịch nhanh hơn.",
            en: "Lighter than Standard. Runs on machines with 8–16 GB of RAM, good for lower-end machines. Translates faster.",
          },
    bytes,
    usable: false,
    complete: false,
    missingBytes: bytes,
    partialBytes: 0,
    appTooOld: false,
    enoughSpace: true,
    ...extra,
  };
}

const downloading = param("download") === "1";
let models: ModelsView = {
  rev: 1,
  hasSource: true,
  checking: false,
  manifestError: null,
  sequence: 3,
  packs: [
    pack("standard", 2_485_000_000, settings.onboardingDone ? { usable: true, complete: true, missingBytes: 0 } : {}),
    pack("lite", 1_326_000_000, {}),
  ],
  machine:
    platform === "macos"
      ? { os: "macos", ramMib: 16_384, avx2: true, gpus: [], gpuKnown: true }
      : {
          os: "windows",
          ramMib: 32_768,
          avx2: true,
          gpus: [{ name: "NVIDIA GeForce RTX 4060", vramMib: 8_192, discrete: true }],
          gpuKnown: true,
        },
  verdict: { kind: "recommend", pack: "standard" },
  freeDiskBytes: 182_000_000_000,
  usedBytes: settings.onboardingDone ? 2_485_000_000 : 0,
  job: downloading
    ? { state: "downloading", pack: "standard", doneBytes: 1_120_000_000, totalBytes: 2_485_000_000, error: null, replacesInUse: false }
    : { state: "idle", pack: null, doneBytes: 0, totalBytes: 0, error: null, replacesInUse: false },
  updateAvailable: false,
} as ModelsView;

const SAMPLE: [string, string, string][] = [
  [
    "en",
    "We should ship the pilot to two customers first.",
    pick({
      vi: "Chúng ta nên đưa bản thử nghiệm cho hai khách hàng trước.",
      en: "We should ship the pilot to two customers first.",
      ja: "まずパイロット版を2社のお客様に提供しましょう。",
      zh: "我们应该先把试点版本交给两家客户。",
      ko: "먼저 시범 버전을 고객 두 곳에 제공해야 합니다.",
    }),
  ],
  [
    "zh",
    "我们下周可以确认合同条款。",
    pick({
      vi: "Tuần sau chúng ta có thể xác nhận các điều khoản hợp đồng.",
      en: "We can confirm the contract terms next week.",
      ja: "来週、契約条件を確認できます。",
      zh: "",
      ko: "다음 주에 계약 조건을 확인할 수 있습니다.",
    }),
  ],
  [
    "en",
    "The design review moved to Thursday afternoon.",
    pick({
      vi: "Buổi duyệt thiết kế đã dời sang chiều thứ Năm.",
      en: "The design review moved to Thursday afternoon.",
      ja: "デザインレビューは木曜日の午後に変更になりました。",
      zh: "设计评审改到了周四下午。",
      ko: "디자인 검토가 목요일 오후로 변경되었습니다.",
    }),
  ],
  [
    "zh",
    "预算比上个季度略有增加。",
    pick({
      vi: "Ngân sách tăng nhẹ so với quý trước.",
      en: "The budget is slightly higher than last quarter.",
      ja: "予算は前四半期よりわずかに増えています。",
      zh: "",
      ko: "예산이 지난 분기보다 약간 늘었습니다.",
    }),
  ],
  [
    "en",
    "Can you share the budget estimate by Friday?",
    pick({
      vi: "Bạn có thể gửi bản dự toán ngân sách trước thứ Sáu không?",
      en: "Can you share the budget estimate by Friday?",
      ja: "金曜日までに予算の見積もりを共有できますか？",
      zh: "你能在周五前分享预算估算吗？",
      ko: "금요일까지 예산 견적을 공유해 주실 수 있나요?",
    }),
  ],
];

const startedAt = now - 14 * 60_000;
const lines: Subtitle[] = empty
  ? []
  : SAMPLE.map(([l, src, tgt], i) => ({
      id: i + 1,
      start_ms: 32_000 + i * 41_000,
      end_ms: 36_000 + i * 41_000,
      src_lang: l,
      src_text: src,
      tgt_text: l === lang ? "" : tgt,
      status: l === lang ? "same_lang" : "done",
      provisional: false,
      replaces: [],
    }));

// Dòng đang nói cho thanh phụ đề (spec 2026-10-10 §6.1), theo tham số `live=`:
// - `alone`: dòng đang nói số 6, sau dòng cuối;
// - `extends`: phụ đề tạm số 6, và dòng đang nói số 7 nối tiếp nó (phụ đề 6 tạm ẩn; chữ nguồn của dòng là câu 6 nối với
//   chữ của đoạn đang mở, QĐ6 của kế hoạch 02);
// - `final`: như `alone`; `window.__livePreview.finish()` gửi bản cuối số 6 rồi `live-end`, đúng thứ tự engine phát (§6.2);
// - `provisional`: chỉ phụ đề tạm số 6, không có dòng đang nói (phụ đề tạm nhạt hay không theo chế độ, §6.1).
// Câu mẫu theo ngôn ngữ giao diện: tiếng Anh dịch sang ngôn ngữ giao diện (vi, ja, zh, ko), hay tiếng Trung dịch sang
// tiếng Anh (en).
const LIVE_SAMPLES = {
  vi: {
    lang: "en",
    alone: { src: ["We should also invite the design team", " to the"], tgt: ["Chúng ta cũng nên mời nhóm thiết kế", " tham dự"] },
    final: { src: "We should also invite the design team to the review.", tgt: "Chúng ta cũng nên mời nhóm thiết kế tham dự buổi duyệt." },
    provisional: { src: "The vendor quote came in", tgt: "Báo giá của nhà cung cấp đã tới" },
    extends: { src: ["The vendor quote came in higher", " than expected"], tgt: ["Báo giá của nhà cung cấp cao hơn", " dự kiến"] },
  },
  en: {
    lang: "zh",
    alone: { src: ["我们也应该邀请设计团队", "参加"], tgt: ["We should also invite the design team", " to join"] },
    final: { src: "我们也应该邀请设计团队参加评审。", tgt: "We should also invite the design team to the review." },
    provisional: { src: "供应商的报价已经到了", tgt: "The vendor's quote has arrived" },
    extends: { src: ["供应商的报价已经到了，比预期", "高一些"], tgt: ["The vendor's quote has arrived,", " a bit higher than expected"] },
  },
  ja: {
    lang: "en",
    alone: { src: ["We should also invite the design team", " to the"], tgt: ["デザインチームもレビューに", "招待しましょう"] },
    final: { src: "We should also invite the design team to the review.", tgt: "デザインチームもレビューに招待しましょう。" },
    provisional: { src: "The vendor quote came in", tgt: "ベンダーの見積もりが届きました" },
    extends: { src: ["The vendor quote came in higher", " than expected"], tgt: ["ベンダーの見積もりは", "予想より高くなりました"] },
  },
  zh: {
    lang: "en",
    alone: { src: ["We should also invite the design team", " to the"], tgt: ["我们也应该邀请设计团队", "参加评审"] },
    final: { src: "We should also invite the design team to the review.", tgt: "我们也应该邀请设计团队参加评审。" },
    provisional: { src: "The vendor quote came in", tgt: "供应商的报价已经到了" },
    extends: { src: ["The vendor quote came in higher", " than expected"], tgt: ["供应商的报价已经到了，", "比预期高一些"] },
  },
  ko: {
    lang: "en",
    alone: { src: ["We should also invite the design team", " to the"], tgt: ["디자인 팀도", " 검토에 초대해야 합니다"] },
    final: { src: "We should also invite the design team to the review.", tgt: "디자인 팀도 검토에 초대해야 합니다." },
    provisional: { src: "The vendor quote came in", tgt: "공급업체의 견적이 도착했습니다" },
    extends: { src: ["The vendor quote came in higher", " than expected"], tgt: ["공급업체의 견적이 예상보다", " 높게 나왔습니다"] },
  },
};
const LIVE_SAMPLE = LIVE_SAMPLES[lang];

function liveLine(id: number, ext: number | null, src: string[], tgt: string[]): LiveLine {
  return {
    id,
    extends: ext,
    src_lang: LIVE_SAMPLE.lang,
    src_stable: src[0] ?? "",
    src_tail: src[1] ?? "",
    tgt_stable: tgt[0] ?? "",
    tgt_tail: tgt[1] ?? "",
    tgt_src_units: 0,
  };
}

function liveSubtitle(id: number, src: string, tgt: string, provisional: boolean): Subtitle {
  return {
    id,
    start_ms: 240_000,
    end_ms: 243_000,
    src_lang: LIVE_SAMPLE.lang,
    src_text: src,
    tgt_text: tgt,
    status: "done",
    provisional,
    replaces: [],
  };
}

let glossary = empty
  ? []
  : [
      { id: 1, source: "pilot", target: pick({ vi: "bản thử nghiệm", en: "pilot program", ja: "パイロット版", zh: "试点版本", ko: "시범 버전" }) },
      { id: 2, source: "roadmap", target: pick({ vi: "lộ trình sản phẩm", en: "product roadmap", ja: "ロードマップ", zh: "产品路线图", ko: "로드맵" }) },
      { id: 3, source: "Q4", target: pick({ vi: "quý 4", en: "Q4", ja: "第4四半期", zh: "第四季度", ko: "4분기" }) },
      { id: 4, source: "OKR", target: "OKR" },
      { id: 5, source: "合同", target: pick({ vi: "hợp đồng", en: "contract", ja: "契約", zh: "合约", ko: "계약" }) },
      { id: 6, source: "预算", target: pick({ vi: "ngân sách", en: "budget", ja: "予算", zh: "经费", ko: "예산" }) },
      { id: 7, source: "納期", target: pick({ vi: "hạn giao hàng", en: "delivery date", ja: "納品期限", zh: "交付日期", ko: "납기일" }) },
      { id: 8, source: "회의록", target: pick({ vi: "biên bản cuộc họp", en: "meeting minutes", ja: "議事録", zh: "会议纪要", ko: "회의 기록" }) },
    ];

const history = empty
  ? []
  : [
      { id: 3, startedAt: now - 2 * 3_600_000, endedAt: now - 2 * 3_600_000 + 47 * 60_000, targetLang: lang, lines: 186, preview: SAMPLE[0]![2] },
      { id: 2, startedAt: now - 26 * 3_600_000, endedAt: now - 26 * 3_600_000 + 32 * 60_000, targetLang: lang, lines: 121, preview: SAMPLE[1]![2] },
      { id: 1, startedAt: now - 3 * DAY, endedAt: now - 3 * DAY + 58 * 60_000, targetLang: lang, lines: 240, preview: SAMPLE[3]![2] },
    ];

// Mã QR mẫu (ô vuông giả, không phải mã thật).
function fakeQr(): string {
  let cells = "";
  let seed = 7;
  for (let y = 0; y < 29; y++)
    for (let x = 0; x < 29; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const finder = (x < 7 && y < 7) || (x > 21 && y < 7) || (x < 7 && y > 21);
      const on = finder ? x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) || x === 28 || y === 28 || x === 22 || y === 22 : seed % 3 === 0;
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges">${cells}</svg>`;
}

const checkout =
  param("checkout") === "1"
    ? {
        orderCode: 1000428,
        plan: "monthly",
        amount: 50_000,
        currency: "VND",
        expiresAt: sec(now + 15 * 60_000),
        qrSvg: fakeQr(),
        licenseExpiresAt: null,
        convertedDays: null,
      }
    : null;

// ---------------------------------------------------------------- sự kiện

const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>();
function emit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((h) => h({ payload }));
}
export async function listen(event: string, handler: (e: { payload: unknown }) => void) {
  const set = listeners.get(event) ?? new Set();
  set.add(handler);
  listeners.set(event, set);
  return () => set.delete(handler);
}

function changeStatus(patch: Partial<AppStatus>) {
  status = { ...status, ...patch, rev: status.rev + 1 };
  emit("app://status", status);
  return status;
}

function changeSettings(next: Settings) {
  settings = { ...next, revision: settings.revision + 1 };
  emit("settings://changed", settings);
  emit("overlay://view", overlayView());
  return settings;
}

function overlayView() {
  const o = settings.overlay;
  return {
    uiLanguage: settings.uiLanguage,
    fontSize: o.fontSize,
    lines: o.lines,
    opacity: o.opacity,
    textColor: o.textColor,
    background: o.background,
    showSource: o.showSource,
    locked: o.locked,
    translateWhileSpeaking: settings.translateWhileSpeaking,
  };
}

// Mức âm lượng nhảy như đang có người nói.
if (sessionParam === "running") {
  let t = 0;
  setInterval(() => {
    t += 1;
    emit("audio://level", 0.04 + 0.05 * Math.abs(Math.sin(t / 3)) + 0.02 * Math.random());
  }, 120);
}

// ---------------------------------------------------------------- lệnh

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const handlers: Record<string, (args: any) => unknown> = {
  get_settings: () => settings,
  update_settings: ({ patch }) => {
    const { overlay, experimental, ...rest } = patch;
    return changeSettings({
      ...settings,
      ...rest,
      overlay: { ...settings.overlay, ...overlay },
      experimental: { ...settings.experimental, ...experimental },
    });
  },
  set_hotkey: ({ action, accelerator }) => changeSettings({ ...settings, hotkeys: { ...settings.hotkeys, [action]: accelerator } }),
  get_app_status: () => status,
  toggle_session: async () => {
    if (status.session === "running") return changeStatus({ session: "idle", overlayVisible: status.overlayVisible });
    changeStatus({ session: "starting", loading: "model" });
    await wait(900);
    return changeStatus({ session: "running", loading: null, overlayVisible: true, sessionError: null });
  },
  start_listen_test: async () => {
    await wait(600);
    return changeStatus({ session: "running", overlayVisible: true });
  },
  set_overlay_visible: ({ visible }) => changeStatus({ overlayVisible: visible }),
  set_overlay_locked: ({ locked }) => changeSettings({ ...settings, overlay: { ...settings.overlay, locked } }),
  get_app_info: () => info,
  list_audio_sources: () =>
    platform === "macos"
      ? [
          { kind: "app", bundleId: "us.zoom.xos", name: "Zoom" },
          { kind: "app", bundleId: "com.microsoft.teams2", name: "Microsoft Teams" },
          { kind: "app", bundleId: "com.google.Chrome", name: "Google Chrome" },
        ]
      : [
          { kind: "device", id: "{0.0.0.00000000}.{speakers}", name: pick({ vi: "Loa", en: "Speakers", ja: "スピーカー", zh: "扬声器", ko: "스피커" }) + " (Realtek High Definition Audio)" },
          { kind: "device", id: "{0.0.0.00000000}.{headset}", name: "Headset (Jabra Evolve2 65)" },
        ],
  get_transcript: () => ({ session: 1, startedAt, endedAt: null, targetLang: lang, lines }),
  transcript_text: () => lines.map((l) => `${l.src_text}\n${l.tgt_text}`).join("\n\n"),
  export_transcript: () => (platform === "macos" ? "/Users/an/Documents/meeting.txt" : "C:\\Users\\an\\Documents\\meeting.txt"),
  list_history: () => history,
  get_history_session: () => ({ session: 0, startedAt: history[0]?.startedAt ?? now, endedAt: now, targetLang: lang, lines }),
  delete_history_session: () => null,
  clear_history: () => history.length,
  list_glossary: () => glossary,
  add_glossary_entry: ({ source, target }) => {
    const entry = { id: Date.now(), source, target };
    glossary = [...glossary, entry];
    return entry;
  },
  update_glossary_entry: ({ id, source, target }) => {
    glossary = glossary.map((e) => (e.id === id ? { id, source, target } : e));
    return { id, source, target };
  },
  delete_glossary_entry: ({ id }) => {
    glossary = glossary.filter((e) => e.id !== id);
    return null;
  },
  import_glossary_csv: () => ({ added: 12, updated: 2, skipped: 1, overLimit: 0 }),
  export_glossary_csv: () => (platform === "macos" ? "/Users/an/Documents/glossary.csv" : "C:\\Users\\an\\Documents\\glossary.csv"),
  get_debug_sessions: () => [],
  get_overlay_view: () => overlayView(),
  get_license: () => licenseView(),
  get_pending_order: () => checkout,
  get_plans: () => [
    { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50_000 } },
    { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500_000 } },
  ],
  start_checkout: () => checkout ?? { ...{ orderCode: 1000428, plan: "monthly", amount: 50_000, currency: "VND", expiresAt: sec(now + 900_000), qrSvg: fakeQr(), licenseExpiresAt: null, convertedDays: null } },
  check_for_updates: async () => {
    changeStatus({ updateCheck: "checking" });
    await wait(700);
    return changeStatus({ updateCheck: "upToDate" });
  },
  get_models_state: () => models,
  load_models: () => models,
  download_models: () => models,
  pause_models_download: () => models,
  verify_models: () => models,
  dismiss_models_update: () => models,
  delete_models: () => models,
  delete_models_and_data: () => models,
  select_model_pack: ({ pack: id }) => changeSettings({ ...settings, modelTier: id }),
};

export async function invoke(cmd: string, args?: unknown) {
  const handler = handlers[cmd];
  return handler ? handler(args ?? {}) : null;
}

// ---------------------------------------------------------------- trạng thái ban đầu của trang

// Đưa tới màn hình hay bước cần xem sau khi store đã nghe sự kiện.
setTimeout(async () => {
  const screen = q.get("screen");
  if (screen) emit("app://navigate", { screen, settingsGroup: q.get("group") });
  const step = q.get("onboarding");
  if (step) {
    const { appStore } = await import("../../src/windows/main/appStore");
    appStore.getState().setOnboardingStep(Number(step) - 1);
    if (q.get("accepted") === "1") appStore.getState().setTermsAccepted(true);
  }
  const notice = q.get("notice");
  if (notice === "quit") emit("app://notice", { kind: "quitFromTray" });
  if (notice === "error") {
    const { appStore } = await import("../../src/windows/main/appStore");
    appStore.setState({ error: { code: "network", field: null } });
  }
  if (location.pathname.endsWith("overlay.html")) {
    // Trạng thái và phụ đề tới thanh phụ đề qua sự kiện, như phía Rust.
    emit("app://status", status);
    for (const line of lines) emit("subtitle://upsert", line);
    if (q.get("translating") === "1") {
      emit("subtitle://upsert", {
        id: 99,
        start_ms: 0,
        end_ms: 0,
        src_lang: "en",
        src_text: "Let's move the launch review to Thursday afternoon.",
        tgt_text: pick({
          vi: "Hãy dời buổi duyệt ra mắt sang",
          en: "Let's move the launch review to",
          ja: "リリースレビューを木曜日の午後に",
          zh: "把发布评审改到",
          ko: "출시 검토를 목요일 오후로",
        }),
        status: "translating",
        provisional: false,
        replaces: [],
      });
    }
    const live = q.get("live");
    const s = LIVE_SAMPLE;
    if (live === "alone" || live === "final") emit("subtitle://live", liveLine(6, null, s.alone.src, s.alone.tgt));
    if (live === "extends" || live === "provisional") {
      emit("subtitle://upsert", liveSubtitle(6, s.provisional.src, s.provisional.tgt, true));
    }
    if (live === "extends") emit("subtitle://live", liveLine(7, 6, s.extends.src, s.extends.tgt));
    (window as unknown as { __livePreview: { finish(): void } }).__livePreview = {
      finish() {
        emit("subtitle://upsert", liveSubtitle(6, s.final.src, s.final.tgt, false));
        emit("subtitle://live-end", { id: 6 });
      },
    };
    const notes = q.get("notes");
    if (notes) {
      const n = notes.split(",");
      changeStatus({
        loading: n.includes("loading") ? "model" : null,
        indicators: {
          lagging: n.includes("lagging"),
          noAudio: n.includes("noAudio"),
          translationUnavailable: n.includes("translationUnavailable"),
          streamingUnavailable: false,
        },
      });
    }
  }
}, 150);
