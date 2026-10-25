// Bản giả của `@tauri-apps/api/core` và `@tauri-apps/api/event` cho trang xem trước (vite.config.ts): trả dữ liệu mẫu theo
// tham số URL, giữ trạng thái trong bộ nhớ để bấm thử được (đổi cài đặt, bắt đầu/dừng, sửa thuật ngữ, tạo/hủy đơn thanh
// toán…). Không dùng trong app thật. Tên và số phiên bản lấy từ src-tauri/tauri.conf.json. Mọi lệnh gọi được ghi vào
// `window.__ipcCalls` ({ cmd, args }) để script kiểm (check-i18n.mjs) xem giao diện đã gửi gì.
//
// Tham số URL (đều không bắt buộc):
//   lang=vi|en|ja|zh|ko  theme=light|dark  platform=macos|windows
//   screen=home|transcript|history|glossary|settings|upgrade|support|about  group=general|subtitles|audio|model|hotkeys|license|privacy
//   session=idle|starting|running|error  error=<mã lỗi phiên>  plan=free|monthly|six_months|yearly  trial=active|ended
//   onboarding=<số bước, từ 1>  checkout=1|card  download=1  notice=update|quit|hotkeys|license|error  empty=1
//   now=<giây Unix hay ngày giờ ISO>  đóng băng đồng hồ của cả trang (Date.now) và của dữ liệu mẫu: hạn đơn thanh toán, hạn
//     license… cố định giữa các lần chạy (ảnh chụp, ca kiểm); không có thì giờ thật
//   thanh toán quốc tế (spec 2026-10-14, 2026-10-22): cách trả chọn sẵn theo lang= (vi: VietQR, ngôn ngữ khác: thẻ quốc tế)
//     usd=0 (server chưa bán USD: bảng giá không có giá USD, bước Cách thanh toán chỉ có VietQR)
//     checkout=1 (đơn VietQR đang chờ, có mã QR)  checkout=card (đơn thẻ đang chờ: không có mã QR, trang thanh toán ở trình
//     duyệt)  pending=old (đơn đang chờ do bản app cũ lưu, đọc lại với số tiền 0 và loại tiền rỗng)  late=1 (đơn đã quá giờ
//     hẹn trả mà server còn báo chờ). Tạo đơn bằng giao diện thì đơn theo đúng gói và loại tiền đã gửi; hủy thì hết đơn chờ.
//   overlay (overlay.html): locked=1  source=0  text=<màu>  bg=<màu>  opacity=<0–1>  size=<px>  latest=1  notes=<note,…>
//   báo cáo lỗi (spec 2026-10-17 §5): reports=0 (người dùng đã tắt báo cáo lỗi tự động; không có thì bật, trừ khi đang ở onboarding:
//     cài mới chưa qua bước Điều khoản thì tắt)  report=ok|failed|ratelimited|rejected (kết quả nút "Gửi log cho hỗ trợ" ở Giới thiệu)
//   dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6): tws=0 (tắt công tắc)  slow=1 (máy chưa đủ nhanh)
//     overlay.html: live=alone|extends|final|provisional (mẫu dòng đang nói, xem `LIVE_SAMPLE`; cần session=running)
//   Gõ dịch (spec 2026-10-17-go-dich): Cài đặt › Gõ dịch: ax=0 (macOS chưa cấp quyền Trợ năng)
//     compose.html: state=empty|typing|loading|done|same|failed|blocked|permission|reopen (mặc định empty; trừ empty, trang tự gõ
//     chữ mẫu rồi để giao diện đi đúng đường thật: chờ 400 ms, xin dịch, nhận chữ dịch; permission còn bấm Enter; reopen còn mở
//     lại ô khi bản nháp đang có, như Esc rồi ⌃⌥G)  paste=0 (tắt tự dán)
//   chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): chat=none|open|unread (chưa có cuộc chat, mặc định; cuộc chat mẫu một hỏi
//     một đáp; như open mà câu trả lời chưa xem, mục Hỗ trợ có chấm đỏ)  support=off|closed (chủ dự án tắt chat; cuộc chat bị chặn)
//     send=failed|ratelimited|busy|expired|disabled (kết quả của lệnh gửi tin; disabled: chat đã tắt, như phía Rust báo trạng
//     tắt qua sự kiện rồi trả lỗi)  email=invalid (lưu email lỗi sai dạng)
//   nguồn micro (spec 2026-10-24-nguon-micro): capture=mic|both (chế độ Micro, Âm thanh máy + Micro)  micperm=denied|undetermined
//     (quyền micro; mặc định đã cấp)  micissue=suspected|permission|unavailable (vấn đề của micro lúc đang chạy; overlay.html:
//     notes=micSilent|micPermission|micUnavailable)
//   video giới thiệu (scripts/demo-video, spec 2026-10-21-demo-video §2.4): demo=1 thì không tự phát mức âm lượng ngẫu nhiên và
//     không tự mở ô soạn; trang dựng cảnh (frame ngoài cùng) phát sự kiện qua `window.__demoEmit` và trả lời lệnh dịch của ô soạn
//     qua `window.top.__demo.composeTranslate(id, emit)`
import conf from "../../src-tauri/tauri.conf.json";
import type {
  AppInfo,
  AppStatus,
  CheckoutView,
  Command,
  Commands,
  ComposeOutcome,
  ComposeView,
  LicenseView,
  LiveLine,
  PlanOffer,
  PlansView,
  Settings,
  Subtitle,
  SupportView,
} from "../../src/lib/ipc";
import type { ModelsView, PackView } from "../../src/lib/models";

const q = new URLSearchParams(location.search);
const param = (k: string, d = "") => q.get(k) ?? d;
type UiLang = "vi" | "en" | "ja" | "zh" | "ko";
const lang = param("lang", "vi") as UiLang;
// Chữ mẫu theo ngôn ngữ giao diện; bản dịch của dữ liệu mẫu là ngôn ngữ đích, cũng là ngôn ngữ giao diện.
const pick = <T,>(by: Record<UiLang, T>): T => by[lang];
const platform = param("platform", "macos") as "macos" | "windows";
const sessionParam = param("session", "idle") as AppStatus["session"];
const plan = param("plan", "monthly") as "free" | "monthly" | "six_months" | "yearly";
const empty = param("empty") === "1";
const demo = param("demo") === "1";
const sec = (ms: number) => Math.floor(ms / 1000);
const DAY = 86_400_000;

// Giờ của trang: giờ thật, hay giờ cố định của `now=` (giây Unix hoặc ngày giờ ISO). Cố định thì đổi cả `Date.now` của trang,
// để giao diện (câu "đã quá giờ hẹn trả" của đơn thẻ, so `expiresAt` với giờ hiện tại) và dữ liệu mẫu cùng một đồng hồ; nếu
// không, `now=` quá khứ làm mọi đơn mới thành quá hạn. Tham số sai thì báo lỗi, không lặng lẽ dùng giờ thật.
function pageNow(): number {
  const raw = q.get("now");
  if (raw === null) return Date.now();
  const ms = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error(`tauri-mock: now=${raw} không phải giây Unix hay ngày giờ ISO`);
  return ms;
}
const now = pageNow();
if (q.has("now")) Date.now = () => now;
// Bản mới hơn bản đang chạy, cho thông báo "có bản cập nhật": tăng số cuối của phiên bản hiện tại (0.1.9 → 0.1.10).
const nextVersion = (v: string) => v.replace(/(\d+)(?!.*\d)/, (n) => String(Number(n) + 1));

// ---------------------------------------------------------------- dữ liệu mẫu

let settings: Settings = {
  uiLanguage: lang,
  targetLanguage: lang,
  sourceLanguages: ["en", "zh", "ja", "ko", "vi"],
  sourceLock: null,
  audioSource: platform === "macos" ? { kind: "app", bundleId: "us.zoom.xos" } : { kind: "system" },
  captureMode: param("capture") === "mic" ? "mic" : param("capture") === "both" ? "both" : "playback",
  micDevice: null,
  micNoiseFilter: true,
  vadEndSilenceMs: 300,
  micEndSilenceMs: 100,
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
  compose: { enabled: true, target: "auto", autoPaste: true },
  modelTier: "standard",
  hotkeys: {
    toggleSession: "Ctrl+Alt+T",
    toggleOverlay: "Ctrl+Alt+H",
    toggleLock: "Ctrl+Alt+L",
    scrollUp: "Ctrl+Alt+PageUp",
    scrollDown: "Ctrl+Alt+PageDown",
    compose: "Ctrl+Alt+G",
  },
  saveHistory: param("history") !== "0",
  sendErrorReports: !q.has("onboarding") && param("reports") !== "0",
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
  micIssue: (["suspected", "permission", "unavailable"] as const).find((v) => v === param("micissue")) ?? null,
  pro: plan !== "free",
  quotaWarning: false,
  quotaResetAt: sec(now + 20 * DAY),
  updateReady: param("notice") === "update" ? nextVersion(conf.version) : null,
  updateReprompts: param("notice") === "update" && platform === "macos",
  updateCheck: "idle",
  rev: 1,
};

const info: AppInfo = {
  name: conf.productName,
  version: conf.version,
  identifier: conf.identifier,
  platform,
  launchedAtLogin: false,
};

// Hạn mức gói trả phí mỗi chu kỳ 30 ngày: Monthly 50 giờ, 6 Months 100 giờ (Yearly không giới hạn), đã dùng 6 giờ 12 phút.
const paidLimitMs = (plan === "six_months" ? 100 : 50) * 3_600_000;
const paidUsedMs = 6 * 3_600_000 + 12 * 60_000;

function licenseView(): LicenseView {
  const free = plan === "free";
  const trialEnded = param("trial") === "ended";
  return {
    standing: param("notice") === "license" ? "expired" : free ? "free" : "active",
    plan,
    licensedPlan: null,
    key: free ? null : "••••-••••-••••-••••-••••-••••-Q9XD",
    expiresAt: free ? null : sec(now + (plan === "yearly" ? 300 : plan === "six_months" ? 150 : 20) * DAY),
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
          limitMs: paidLimitMs,
          usedMs: paidUsedMs,
          remainingMs: paidLimitMs - paidUsedMs,
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

// Bảng giá mẫu theo gói: [giá VND (đồng), giá USD (cent)].
const PRICES: Record<string, readonly [number, number]> = {
  monthly: [50_000, 399],
  six_months: [269_000, 2_199],
  yearly: [500_000, 3_999],
};
// Bảng gói như server trả; `usd=0` giả server chưa bán USD (không gói nào có giá USD).
const plansView = (): PlansView => ({
  plans: (
    [
      { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30 },
      { code: "six_months", name: "6 Months", quota_minutes_per_cycle: 6000, days_per_order: 180 },
      { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365 },
    ] satisfies Omit<PlanOffer, "prices">[]
  ).map((p) => {
    const [vnd, usd] = PRICES[p.code] ?? [0, 0];
    const prices: Record<string, number> = param("usd") === "0" ? { VND: vnd } : { VND: vnd, USD: usd };
    return { ...p, prices };
  }),
});

// Đơn đang chờ theo gói và loại tiền: VietQR (VND; có mã QR vẽ sẵn, hạn 15 phút) hay thẻ quốc tế (USD; không mã QR, khách
// trả ở trang thanh toán mở bằng trình duyệt, hạn 30 phút). `expiresAtMs`: hạn đã định (đơn quá giờ hẹn trả).
function order(code: string, currency: string, expiresAtMs?: number): CheckoutView {
  const prices = PRICES[code];
  if (prices === undefined) throw new Error(`tauri-mock: không có gói ${code}`);
  const card = currency === "USD";
  return {
    orderCode: card ? 1000429 : 1000428,
    plan: code,
    amount: prices[card ? 1 : 0],
    currency,
    expiresAt: sec(expiresAtMs ?? now + (card ? 30 : 15) * 60_000),
    provider: card ? "creem" : "payos",
    qrSvg: card ? null : fakeQr(),
    licenseExpiresAt: null,
    convertedDays: null,
  };
}

// Đơn đang chờ lúc mở trang, theo `checkout=` (gói Monthly): `pending=old` dựng lại như đơn do bản app cũ lưu (số tiền 0, loại
// tiền rỗng; còn mã QR hay không vẫn như đơn gốc), `late=1` là đơn đã quá giờ hẹn trả 10 phút.
function orderFromUrl(): CheckoutView | null {
  const kind = param("checkout");
  if (kind !== "1" && kind !== "card") return null;
  const placed = order("monthly", kind === "card" ? "USD" : "VND", param("late") === "1" ? now - 10 * 60_000 : undefined);
  return param("pending") === "old" ? { ...placed, amount: 0, currency: "" } : placed;
}
let pendingOrder = orderFromUrl();

// ---------------------------------------------------------------- chat hỗ trợ

// Cuộc chat mẫu theo ngôn ngữ giao diện: [câu hỏi của khách, câu trả lời của chủ dự án].
const SUPPORT_SAMPLE: Record<UiLang, [string, string]> = {
  vi: [
    "Phụ đề không hiện khi họp Teams",
    "Chào bạn, bạn đang dùng macOS bản nào? Bạn thử chọn nguồn âm thanh là Microsoft Teams ở màn hình chính nhé.",
  ],
  en: [
    "Subtitles don't show up during Teams meetings",
    "Hi! Which macOS version are you on? Please try choosing Microsoft Teams as the audio source on the home screen.",
  ],
  ja: [
    "Teams の会議中に字幕が表示されません",
    "こんにちは。macOS のバージョンを教えてください。ホーム画面で音声ソースに Microsoft Teams を選んでみてください。",
  ],
  zh: ["开 Teams 会议时字幕不显示", "你好！你用的是哪个 macOS 版本？请在主屏幕把音频来源选为 Microsoft Teams 试试。"],
  ko: [
    "Teams 회의 중에 자막이 나오지 않아요",
    "안녕하세요! 어떤 macOS 버전을 쓰고 계신가요? 홈 화면에서 오디오 소스를 Microsoft Teams로 선택해 보세요.",
  ],
};
const PLAN_NAMES = { free: "Free", monthly: "Monthly", six_months: "6 Months", yearly: "Yearly" } as const;

function supportStart(): SupportView {
  const chat = param("chat", "none");
  const [question, answer] = pick(SUPPORT_SAMPLE);
  const t0 = sec(now) - 600;
  const messages =
    chat === "open" || chat === "unread"
      ? [
          { id: 41, sender: "customer" as const, text: question, createdAt: t0 },
          { id: 42, sender: "owner" as const, text: answer, createdAt: t0 + 300 },
        ]
      : [];
  return {
    enabled: param("support") !== "off",
    closed: param("support") === "closed",
    hasConversation: messages.length > 0,
    messages,
    unread: chat === "unread",
    rev: 1,
  };
}
let supportView = supportStart();

function changeSupport(patch: Partial<SupportView>): SupportView {
  supportView = { ...supportView, ...patch, rev: supportView.rev + 1 };
  return supportView;
}

// Dòng thông tin máy mẫu như phía Rust dựng (`support::context::line`), theo hệ điều hành, gói và ngôn ngữ giao diện.
function machineLine(): string {
  const os =
    platform === "macos"
      ? "macOS 15.6 · Apple M4 Pro · 24 GB"
      : "Windows 11 (26100) · Intel(R) Core(TM) i5-1345U · 16 GB · GPU Intel(R) Iris(R) Xe Graphics";
  return `${info.name} ${info.version} · ${os} · ${PLAN_NAMES[plan]} · ${lang === "vi" ? "Chuẩn" : "Standard"} · UI ${lang}`;
}

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

// Video giới thiệu: trang dựng cảnh phát sự kiện vào trang này và trả lời lệnh dịch của ô soạn (thay phía Rust).
type DemoHooks = { composeTranslate?: (id: number, emit: (event: string, payload: unknown) => void) => void };
const demoHooks = (): DemoHooks => (window.top as unknown as { __demo?: DemoHooks } | null)?.__demo ?? {};
if (demo) (window as unknown as { __demoEmit: typeof emit }).__demoEmit = emit;

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

// ---------------------------------------------------------------- ô soạn Gõ dịch (compose.html)

const composeState = param("state", "empty");
let composeId = 0;

// Chữ mẫu theo ngôn ngữ giao diện: [chữ gõ, bản dịch]. Ngôn ngữ đích "Tự động" là English, riêng giao diện English thì Tiếng Việt.
const COMPOSE_SAMPLE: Record<UiLang, [string, string]> = {
  vi: ["Mai mình gửi báo cáo nhé.\n\nCảm ơn cả nhóm!", "I'll send the report tomorrow.\n\nThanks, everyone!"],
  en: ["I'll send the report tomorrow.\n\nThanks, everyone!", "Mai mình gửi báo cáo nhé.\n\nCảm ơn cả nhóm!"],
  ja: ["明日レポートを送ります。\n\n皆さん、ありがとうございます！", "I'll send the report tomorrow.\n\nThanks, everyone!"],
  zh: ["我明天发报告。\n\n谢谢大家！", "I'll send the report tomorrow.\n\nThanks, everyone!"],
  ko: ["내일 보고서를 보낼게요.\n\n다들 고마워요!", "I'll send the report tomorrow.\n\nThanks, everyone!"],
};

function composeView(): ComposeView {
  return {
    uiLanguage: lang,
    theme: settings.theme,
    target: lang === "en" ? "vi" : "en",
    autoPaste: param("paste") !== "0",
    blocked: composeState === "blocked" ? "trialEnded" : null,
    platform,
  };
}

// Kết quả của một lần xin dịch theo `state=`, tới qua sự kiện như phía Rust (sau lệnh, không cùng lúc).
function composeAnswer(id: number) {
  const [, translation] = pick(COMPOSE_SAMPLE);
  if (composeState === "loading") return emit("compose://loading", { id });
  if (composeState === "typing") {
    return emit("compose://delta", { id, line: 0, text: translation.split("\n")[0]!.slice(0, 14), reset: false });
  }
  if (composeState !== "same" && composeState !== "failed") {
    translation.split("\n").forEach((text, line) => text && emit("compose://delta", { id, line, text, reset: false }));
  }
  const outcome: ComposeOutcome =
    composeState === "same"
      ? { kind: "sameLanguage" }
      : composeState === "failed"
        ? { kind: "failed", code: "composeFailed" }
        : { kind: "translated", text: translation };
  emit("compose://done", { id, outcome });
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
if (sessionParam === "running" && !demo) {
  let t = 0;
  setInterval(() => {
    t += 1;
    emit("audio://level", 0.04 + 0.05 * Math.abs(Math.sin(t / 3)) + 0.02 * Math.random());
  }, 120);
}

// ---------------------------------------------------------------- lệnh

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mỗi lệnh nhận đúng kiểu tham số và trả đúng kiểu kết quả của `Commands` (src/lib/ipc.ts): đổi hợp đồng IPC mà quên đổi mẫu
// thì `tsc` báo; tên lệnh sai chính tả cũng báo (`satisfies` kiểm cả khóa thừa).
type Handlers = { [C in Command]?: (args: Commands[C]["args"]) => Commands[C]["result"] | Promise<Commands[C]["result"]> };

const handlers = {
  get_settings: () => settings,
  update_settings: ({ patch }) => {
    const { overlay, experimental, compose, ...rest } = patch;
    return changeSettings({
      ...settings,
      ...rest,
      overlay: { ...settings.overlay, ...overlay },
      experimental: { ...settings.experimental, ...experimental },
      compose: { ...settings.compose, ...compose },
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
  get_accessibility_trusted: () => param("ax") !== "0",
  open_accessibility_settings: () => null,
  get_compose_view: () => composeView(),
  compose_translate: () => {
    const id = ++composeId;
    const answer = demo ? demoHooks().composeTranslate : undefined;
    if (answer) answer(id, emit);
    else setTimeout(() => composeAnswer(id), 60);
    return id;
  },
  compose_submit: () => (composeState === "permission" ? "needsPermission" : param("paste") === "0" ? "copied" : "pasted"),
  compose_close: () => null,
  compose_resize: () => null,
  compose_open_accessibility: () => null,
  compose_copy_only: () => null,
  compose_open_main: () => null,
  list_input_devices: () => [
    {
      id: "BuiltInMicrophoneDevice",
      name: platform === "macos" ? "MacBook Pro Microphone" : "Microphone Array",
      isDefault: true,
    },
    { id: "usb-1", name: "Jabra Speak 510", isDefault: false },
  ],
  get_mic_permission: () => (param("micperm") === "denied" ? "denied" : param("micperm") === "undetermined" ? "undetermined" : "granted"),
  request_mic_permission: () => (param("micperm") === "denied" ? "denied" : "granted"),
  open_mic_settings: () => null,
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
    const entry = { id: Math.max(0, ...glossary.map((e) => e.id)) + 1, source, target };
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
  get_pending_order: () => pendingOrder,
  get_plans: () => plansView(),
  // Đơn mới theo đúng gói và loại tiền đã gửi (USD: thẻ, không mã QR; VND: VietQR); thay đơn đang chờ nếu có.
  start_checkout: ({ plan: code, currency }) => (pendingOrder = order(code, currency)),
  cancel_checkout: () => {
    pendingOrder = null;
    return null;
  },
  // Nút "Gửi log cho hỗ trợ": trả mã báo cáo sau nửa giây, hay đúng ba lỗi của lệnh thật theo `report=`.
  send_log_report: async () => {
    await wait(500);
    const codes: Record<string, string> = { failed: "reportFailed", ratelimited: "reportRateLimited", rejected: "reportRejected" };
    const code = codes[param("report", "ok")];
    if (code) throw { code, field: null, message: "…" };
    return { id: "R-7F3K-92QD" };
  },
  // Chat hỗ trợ: trạng thái trong bộ nhớ theo `chat=`, `support=`; gửi tin sau nửa giây, hay đúng lỗi của lệnh thật theo `send=`.
  support_screen: ({ open }) => changeSupport(open ? { unread: false } : {}),
  support_fetch: () => changeSupport({}),
  support_machine_info: () => machineLine(),
  support_send: async ({ text }) => {
    await wait(500);
    const codes: Record<string, string> = {
      failed: "supportOffline",
      ratelimited: "supportRateLimited",
      busy: "supportBusy",
      expired: "supportExpired",
    };
    const code = codes[param("send")];
    if (code) throw { code, field: null, message: "…" };
    if (param("send") === "disabled") {
      emit("support://view", changeSupport({ enabled: false }));
      throw { code: "supportDisabled", field: null, message: "…" };
    }
    const id = Math.max(42, ...supportView.messages.map((m) => m.id)) + 1;
    return changeSupport({
      hasConversation: true,
      messages: [...supportView.messages, { id, sender: "customer", text, createdAt: sec(Date.now()) }],
    });
  },
  support_set_email: async () => {
    await wait(300);
    if (param("email") === "invalid") throw { code: "supportInvalid", field: "email", message: "…" };
    return null;
  },
  support_delete: () => changeSupport({ hasConversation: false, messages: [], unread: false }),
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
} satisfies Handlers;

// Nhật ký lệnh đã gọi, cho script kiểm đọc (`window.__ipcCalls`).
const ipcCalls: { cmd: string; args: unknown }[] = [];
(window as unknown as { __ipcCalls: typeof ipcCalls }).__ipcCalls = ipcCalls;

export async function invoke(cmd: string, args?: unknown) {
  ipcCalls.push({ cmd, args });
  // Lệnh chưa có mẫu thì trả null, như lệnh phía Rust không có kết quả.
  const handler = Object.hasOwn(handlers, cmd) ? (handlers as Record<string, (args: unknown) => unknown>)[cmd] : undefined;
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
  if (location.pathname.endsWith("compose.html") && !demo) {
    emit("compose://open", composeView());
    const input = document.querySelector("textarea");
    if (input && composeState !== "empty") {
      // Gõ chữ mẫu như người dùng: đặt giá trị bằng setter gốc (React theo dõi giá trị) rồi bắn sự kiện `input`.
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, pick(COMPOSE_SAMPLE)[0]);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (composeState === "permission") {
        setTimeout(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })), 700);
      }
      if (composeState === "reopen") setTimeout(() => emit("compose://open", composeView()), 700);
    }
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
        micIssue: n.includes("micSilent")
          ? "suspected"
          : n.includes("micPermission")
            ? "permission"
            : n.includes("micUnavailable")
              ? "unavailable"
              : null,
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
