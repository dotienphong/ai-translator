// Bản giả của `@tauri-apps/api/core` và `@tauri-apps/api/event` cho trang xem trước (vite.config.ts): trả dữ liệu mẫu theo
// tham số URL, giữ trạng thái trong bộ nhớ để bấm thử được (đổi cài đặt, bắt đầu/dừng, sửa thuật ngữ…). Không dùng trong
// app thật.
//
// Tham số URL (đều không bắt buộc):
//   lang=vi|en  theme=light|dark  platform=macos|windows
//   screen=home|transcript|history|glossary|settings|upgrade|about  group=general|subtitles|audio|model|hotkeys|license|privacy
//   session=idle|starting|running|error  error=<mã lỗi phiên>  plan=free|monthly|yearly  trial=active|ended
//   onboarding=<số bước, từ 1>  checkout=1  download=1  notice=update|quit|hotkeys|license|error  empty=1
//   overlay (overlay.html): locked=1  source=0  text=<màu>  bg=<màu>  opacity=<0–1>  size=<px>  latest=1  notes=<note,…>
import type { AppInfo, AppStatus, LicenseView, Settings, Subtitle } from "../../src/lib/ipc";
import type { ModelsView, PackView } from "../../src/lib/models";

const q = new URLSearchParams(location.search);
const param = (k: string, d = "") => q.get(k) ?? d;
const lang = param("lang", "vi") as "vi" | "en";
const vi = lang === "vi";
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
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
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
  ["en", "We should ship the pilot to two customers first.", vi ? "Chúng ta nên đưa bản thử nghiệm cho hai khách hàng trước." : "We should ship the pilot to two customers first."],
  ["zh", "我们下周可以确认合同条款。", vi ? "Tuần sau chúng ta có thể xác nhận các điều khoản hợp đồng." : "We can confirm the contract terms next week."],
  ["en", "The design review moved to Thursday afternoon.", vi ? "Buổi duyệt thiết kế đã dời sang chiều thứ Năm." : "The design review moved to Thursday afternoon."],
  ["zh", "预算比上个季度略有增加。", vi ? "Ngân sách tăng nhẹ so với quý trước." : "The budget is slightly higher than last quarter."],
  ["en", "Can you share the budget estimate by Friday?", vi ? "Bạn có thể gửi bản dự toán ngân sách trước thứ Sáu không?" : "Can you share the budget estimate by Friday?"],
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

let glossary = empty
  ? []
  : [
      { id: 1, source: "pilot", target: vi ? "bản thử nghiệm" : "pilot program" },
      { id: 2, source: "roadmap", target: vi ? "lộ trình sản phẩm" : "product roadmap" },
      { id: 3, source: "Q4", target: vi ? "quý 4" : "Q4" },
      { id: 4, source: "OKR", target: "OKR" },
      { id: 5, source: "合同", target: vi ? "hợp đồng" : "contract" },
      { id: 6, source: "预算", target: vi ? "ngân sách" : "budget" },
      { id: 7, source: "納期", target: vi ? "hạn giao hàng" : "delivery date" },
      { id: 8, source: "회의록", target: vi ? "biên bản cuộc họp" : "meeting minutes" },
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
          { kind: "device", id: "{0.0.0.00000000}.{speakers}", name: vi ? "Loa (Realtek High Definition Audio)" : "Speakers (Realtek High Definition Audio)" },
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
        tgt_text: vi ? "Hãy dời buổi duyệt ra mắt sang" : "Let's move the launch review to",
        status: "translating",
        provisional: false,
        replaces: [],
      });
    }
    const notes = q.get("notes");
    if (notes) {
      const n = notes.split(",");
      changeStatus({
        loading: n.includes("loading") ? "model" : null,
        indicators: { lagging: n.includes("lagging"), noAudio: n.includes("noAudio"), translationUnavailable: n.includes("translationUnavailable") },
      });
    }
  }
}, 150);
