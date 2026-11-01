// Chữ của thư nhắc gia hạn trước 3 ngày, năm ngôn ngữ (spec 2026-11-02-nhac-gia-han-qua-email-design.md). Bản vi và en đã được chủ
// dự án duyệt trên bản xem trước; ja, zh, ko không có người bản ngữ duyệt, như thư key (spec 2026-10-23 D6). Tên mục "Nâng cấp
// Pro" lấy đúng chữ của app (src/i18n/*.ts, nav.upgrade): test/node/reminder-strings.test.mjs kiểm, đổi chữ ở app thì đổi ở đây.
import type { Lang } from "../lang";

export interface ReminderStrings {
  subject(plan: string, days: number): string;
  eyebrow: string;
  heading(plan: string): string;
  lead(days: number): string;
  /** Nhãn tháng trên ô lịch (m = 1–12). */
  monthLabel(m: number): string;
  badge(days: number): string;
  planTitle(plan: string): string;
  expiresOn: string;
  keyLabel: string;
  renewTitle(plan: string): string;
  addDays(days: number): string;
  checks: readonly [string, string];
  button: string;
  stepsTitle: string;
  /** Bước 2 chứa đúng `upgradeLabel`; thư in đậm phần đó. */
  steps: readonly [string, string, string];
  upgradeLabel: string;
  help: string;
  footerReason: string;
  unsubscribe: string;
}

const MONTHS_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const enDays = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export const REMINDER: Record<Lang, ReminderStrings> = {
  vi: {
    subject: (plan, d) => `Gói ${plan} của bạn sẽ hết hạn sau ${d} ngày`,
    eyebrow: "Nhắc gia hạn",
    heading: (plan) => `Gói ${plan} sắp hết hạn`,
    lead: (d) => `Gói của bạn hết hạn sau ${d} ngày. Gia hạn trước ngày đó để việc dịch phụ đề không bị gián đoạn.`,
    monthLabel: (m) => `THG ${m}`,
    badge: (d) => `Còn ${d} ngày`,
    planTitle: (plan) => `Gói ${plan}`,
    expiresOn: "Hết hạn ngày",
    keyLabel: "Key",
    renewTitle: (plan) => `Gia hạn gói ${plan}`,
    addDays: (n) => `Cộng thêm ${n} ngày`,
    checks: ["Gia hạn sớm không mất ngày nào: thời hạn mới được cộng vào ngày hết hạn hiện tại.", "Key giữ nguyên, không cần kích hoạt lại."],
    button: "Xem cách gia hạn",
    stepsTitle: "Gia hạn ngay trong app",
    steps: ["Mở AI Translator.", "Chọn Nâng cấp Pro.", "Chọn gói và thanh toán bằng VietQR hoặc thẻ."],
    upgradeLabel: "Nâng cấp Pro",
    help: "Cần giúp? Trả lời thư này, chúng tôi sẽ hồi âm.",
    footerReason: "Bạn nhận thư này vì đã mua gói AI Translator bằng email này.",
    unsubscribe: "Ngừng nhận thư nhắc gia hạn",
  },
  en: {
    subject: (plan, d) => `Your ${plan} plan expires in ${enDays(d)}`,
    eyebrow: "Renewal reminder",
    heading: (plan) => `Your ${plan} plan is expiring soon`,
    lead: (d) => `Your plan expires in ${enDays(d)}. Renew before then to keep your live subtitles running.`,
    monthLabel: (m) => MONTHS_EN[m - 1] ?? "",
    badge: (d) => `${enDays(d)} left`,
    planTitle: (plan) => `${plan} plan`,
    expiresOn: "Expires on",
    keyLabel: "Key",
    renewTitle: (plan) => `Renew ${plan}`,
    addDays: (n) => `Adds ${n} days`,
    checks: ["Renewing early loses no days: the new term is added to your current expiry date.", "Your key stays the same; no need to activate it again."],
    button: "See how to renew",
    stepsTitle: "Renew in the app",
    steps: ["Open AI Translator.", "Choose Upgrade to Pro.", "Pick a plan and pay."],
    upgradeLabel: "Upgrade to Pro",
    help: "Need help? Reply to this email.",
    footerReason: "You are receiving this because you bought an AI Translator plan with this email address.",
    unsubscribe: "Stop renewal reminders",
  },
  ja: {
    subject: (plan, d) => `${plan} プランは${d}日後に期限が切れます`,
    eyebrow: "更新のお知らせ",
    heading: (plan) => `${plan} プランの期限が近づいています`,
    lead: (d) => `プランの期限まであと${d}日です。字幕翻訳を中断せずにお使いいただくには、期限前に更新してください。`,
    monthLabel: (m) => `${m}月`,
    badge: (d) => `あと${d}日`,
    planTitle: (plan) => `${plan} プラン`,
    expiresOn: "有効期限",
    keyLabel: "キー",
    renewTitle: (plan) => `${plan} プランを更新`,
    addDays: (n) => `${n}日分を追加`,
    checks: ["早めに更新しても日数は失われません。新しい期間は現在の有効期限に加算されます。", "キーは変わらないため、もう一度有効化する必要はありません。"],
    button: "更新方法を見る",
    stepsTitle: "アプリ内で更新する",
    steps: ["AI Translator を開きます。", "Pro にアップグレード を選びます。", "プランを選んでお支払いください。"],
    upgradeLabel: "Pro にアップグレード",
    help: "お困りですか？このメールに返信してください。",
    footerReason: "このメールは、このアドレスで AI Translator のプランをご購入いただいたためお送りしています。",
    unsubscribe: "更新のお知らせを停止する",
  },
  zh: {
    subject: (plan, d) => `你的 ${plan} 套餐将在 ${d} 天后到期`,
    eyebrow: "续期提醒",
    heading: (plan) => `${plan} 套餐即将到期`,
    lead: (d) => `你的套餐将在 ${d} 天后到期。请在到期前续期，以免实时字幕中断。`,
    monthLabel: (m) => `${m}月`,
    badge: (d) => `还剩 ${d} 天`,
    planTitle: (plan) => `${plan} 套餐`,
    expiresOn: "到期日",
    keyLabel: "密钥",
    renewTitle: (plan) => `续期 ${plan} 套餐`,
    addDays: (n) => `增加 ${n} 天`,
    checks: ["提前续期不会损失任何天数：新的期限会加在当前到期日之后。", "密钥保持不变，无需重新激活。"],
    button: "查看续期方法",
    stepsTitle: "在应用内续期",
    steps: ["打开 AI Translator。", "选择“升级到 Pro”。", "选择套餐并完成付款。"],
    upgradeLabel: "升级到 Pro",
    help: "需要帮助？直接回复这封邮件即可。",
    footerReason: "你收到这封邮件，是因为你用此邮箱购买了 AI Translator 套餐。",
    unsubscribe: "停止续期提醒",
  },
  ko: {
    subject: (plan, d) => `${plan} 플랜이 ${d}일 후 만료됩니다`,
    eyebrow: "갱신 안내",
    heading: (plan) => `${plan} 플랜이 곧 만료됩니다`,
    lead: (d) => `플랜이 ${d}일 후 만료됩니다. 실시간 자막이 끊기지 않도록 만료 전에 갱신해 주세요.`,
    monthLabel: (m) => `${m}월`,
    badge: (d) => `${d}일 남음`,
    planTitle: (plan) => `${plan} 플랜`,
    expiresOn: "만료일",
    keyLabel: "키",
    renewTitle: (plan) => `${plan} 플랜 갱신`,
    addDays: (n) => `${n}일 추가`,
    checks: ["일찍 갱신해도 남은 기간은 사라지지 않습니다. 새 기간은 현재 만료일에 더해집니다.", "키는 그대로이므로 다시 활성화할 필요가 없습니다."],
    button: "갱신 방법 보기",
    stepsTitle: "앱에서 갱신하기",
    steps: ["AI Translator를 엽니다.", "Pro로 업그레이드를 선택합니다.", "플랜을 선택하고 결제합니다."],
    upgradeLabel: "Pro로 업그레이드",
    help: "도움이 필요하신가요? 이 메일에 회신해 주세요.",
    footerReason: "이 이메일 주소로 AI Translator 플랜을 구매하셨기 때문에 보내드렸습니다.",
    unsubscribe: "갱신 안내 수신 거부",
  },
};

/** Phần tiếng Anh ở dưới thư của khách không dùng tiếng Anh (cùng khuôn với thư key: Việt trên, Anh dưới). */
export const REMINDER_EN_BELOW = {
  heading: (plan: string, days: number) => `Your ${plan} plan expires in ${enDays(days)}`,
  summary: (date: string) =>
    `Renew before ${date} to keep translating without interruption. Renewing early loses no days, and your key stays the same.`,
  expires: "Expires",
  renewal: (price: string, days: number) => `Renewal: ${price} for +${days} days`,
  guide: "Detailed guide",
} as const;
