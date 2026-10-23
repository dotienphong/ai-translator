// Chữ của thư gửi khách, năm ngôn ngữ (spec 2026-10-23-email-theo-ngon-ngu-design.md, Phụ lục A). Tên mục và nút lấy đúng chữ của
// giao diện app (src/i18n/*.ts: nav.settings, settings.group.license, settings.license.activate.button, nav.support): đổi chữ ở app
// thì đổi ở đây (test/node/email-strings.test.mjs kiểm). Bản ja, zh, ko không có người bản ngữ duyệt (spec D6).
import type { Lang } from "../lang";

/** Gốc website; link trong thư chỉ trỏ về đây, không thêm tham số theo dõi. */
export const SITE_URL = "https://aitranslator.vn";

export type LicenseEmailKind = "purchase" | "renewal" | "plan_change" | "recover" | "resend";
export type MailKind = LicenseEmailKind | "support";

/** Chữ đổi theo số key: chỉ tiếng Anh có số nhiều (thư lấy lại key có thể có nhiều key). */
export type Counted = string | { one: string; many: string };

export function pick(text: Counted, count: number): string {
  return typeof text === "string" ? text : count > 1 ? text.many : text.one;
}

export interface MailStrings {
  /** Ngày (tháng 1–12) viết theo thói quen của ngôn ngữ. */
  date(y: number, m: number, d: number): string;
  subject: Record<MailKind, Counted>;
  /** Tiêu đề lớn trong thư. */
  heading: Record<MailKind, Counted>;
  /** Câu dẫn dưới tiêu đề lớn. */
  lead: Record<MailKind, Counted>;
  /** Nhãn nhỏ trên tiêu đề lớn. */
  eyebrow: { license: string; support: string };
  plan: string;
  expires: string;
  stepsTitle: string;
  steps: readonly [string, string, string];
  /** Mỗi key một máy, hãy giữ thư này. */
  note: string;
  /** Chữ của link tới trang mua và kích hoạt key trên website, và đường dẫn của trang đó ở ngôn ngữ này. */
  guide: string;
  guidePath: string;
  help: string;
  /** Câu cuối của thư trả lời hỗ trợ. */
  supportOutro: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MAIL: Record<Lang, MailStrings> = {
  vi: {
    date: (y, m, d) => `${pad(d)}/${pad(m)}/${y}`,
    subject: {
      purchase: "License key AI Translator của bạn",
      renewal: "Đã gia hạn gói AI Translator",
      plan_change: "Đã đổi gói AI Translator",
      recover: "License key AI Translator của bạn",
      resend: "License key AI Translator của bạn",
      support: "Trả lời từ hỗ trợ AI Translator",
    },
    heading: {
      purchase: "Cảm ơn bạn đã mua AI Translator",
      renewal: "Gói của bạn đã được gia hạn",
      plan_change: "Gói của bạn đã được đổi",
      recover: "License key của bạn",
      resend: "License key của bạn",
      support: "Hỗ trợ đã trả lời bạn",
    },
    lead: {
      purchase: "Đây là license key của bạn.",
      renewal: "Cảm ơn bạn đã gia hạn. Key giữ nguyên, không cần kích hoạt lại.",
      plan_change: "Cảm ơn bạn. Key giữ nguyên, không cần kích hoạt lại.",
      recover: "Đây là license key còn hạn của email này.",
      resend: "Đây là license key của bạn, gửi lại theo yêu cầu.",
      support: "Bộ phận hỗ trợ AI Translator đã trả lời tin nhắn của bạn.",
    },
    eyebrow: { license: "License key", support: "Hỗ trợ" },
    plan: "Gói",
    expires: "Hết hạn",
    stepsTitle: "Kích hoạt trên máy của bạn",
    steps: ["Mở AI Translator.", "Vào Cài đặt › Bản quyền.", "Dán key rồi bấm Kích hoạt."],
    note: "Mỗi key dùng trên 1 máy. Hãy giữ thư này để kích hoạt lại khi cài lại máy hay chuyển sang máy khác.",
    guide: "Hướng dẫn chi tiết",
    guidePath: "/huong-dan/mua-va-kich-hoat-key/",
    help: "Cần giúp? Trả lời thư này, chúng tôi sẽ hồi âm.",
    supportOutro: "Trả lời thư này để nhắn tiếp, hoặc mở lại khung chat trên aitranslator.vn hay mục Hỗ trợ trong app.",
  },
  en: {
    date: (y, m, d) => `${d} ${MONTHS_EN[m - 1]} ${y}`,
    subject: {
      purchase: "Your AI Translator license key",
      renewal: "Your AI Translator plan is renewed",
      plan_change: "Your AI Translator plan has changed",
      recover: { one: "Your AI Translator license key", many: "Your AI Translator license keys" },
      resend: { one: "Your AI Translator license key", many: "Your AI Translator license keys" },
      support: "Reply from AI Translator support",
    },
    heading: {
      purchase: "Thank you for buying AI Translator",
      renewal: "Your plan is renewed",
      plan_change: "Your plan has changed",
      recover: { one: "Your license key", many: "Your license keys" },
      resend: { one: "Your license key", many: "Your license keys" },
      support: "Support has replied",
    },
    lead: {
      purchase: "Here is your license key.",
      renewal: "Thank you for renewing. Your key stays the same; no need to activate it again.",
      plan_change: "Thank you. Your key stays the same; no need to activate it again.",
      recover: { one: "Here is the active license key for this email.", many: "Here are the active license keys for this email." },
      resend: { one: "Here is your license key, sent again as you asked.", many: "Here are your license keys, sent again as you asked." },
      support: "AI Translator support has replied to your message.",
    },
    eyebrow: { license: "License key", support: "Support" },
    plan: "Plan",
    expires: "Expires",
    stepsTitle: "Activate on your computer",
    steps: ["Open AI Translator.", "Go to Settings › License.", "Paste the key and click Activate."],
    note: "Each key works on 1 computer. Keep this email to activate again after reinstalling or moving to another computer.",
    guide: "Step-by-step guide",
    guidePath: "/en/guide/buy-and-activate/",
    help: "Need help? Reply to this email.",
    supportOutro: "Reply to this email to continue, or reopen the chat on aitranslator.vn or in the app's Support screen.",
  },
  ja: {
    date: (y, m, d) => `${y}年${m}月${d}日`,
    subject: {
      purchase: "AI Translator のライセンスキー",
      renewal: "AI Translator のプランを更新しました",
      plan_change: "AI Translator のプランを変更しました",
      recover: "AI Translator のライセンスキー",
      resend: "AI Translator のライセンスキー",
      support: "AI Translator サポートからの返信",
    },
    heading: {
      purchase: "AI Translator をご購入いただきありがとうございます",
      renewal: "プランを更新しました",
      plan_change: "プランを変更しました",
      recover: "ライセンスキー",
      resend: "ライセンスキー",
      support: "サポートから返信がありました",
    },
    lead: {
      purchase: "ライセンスキーをお送りします。",
      renewal: "ご更新ありがとうございます。キーは変わらないため、もう一度有効化する必要はありません。",
      plan_change: "ありがとうございます。キーは変わらないため、もう一度有効化する必要はありません。",
      recover: "このメールアドレスで有効なライセンスキーをお送りします。",
      resend: "ご依頼により、ライセンスキーを再送します。",
      support: "AI Translator サポートがあなたのメッセージに返信しました。",
    },
    eyebrow: { license: "ライセンスキー", support: "サポート" },
    plan: "プラン",
    expires: "有効期限",
    stepsTitle: "お使いのパソコンで有効化",
    steps: ["AI Translator を開きます。", "設定 › ライセンス を開きます。", "キーを貼り付けて「有効化」をクリックします。"],
    note: "1 つのキーは 1 台のパソコンで使えます。再インストールやパソコンの買い替えのときに有効化し直せるよう、このメールを保管してください。",
    guide: "詳しい手順",
    guidePath: "/ja/guide/buy-and-activate/",
    help: "ご不明な点は、このメールに返信してください。",
    supportOutro: "このメールに返信して続けるか、aitranslator.vn またはアプリの「サポート」画面からチャットを再開できます。",
  },
  zh: {
    date: (y, m, d) => `${y}年${m}月${d}日`,
    subject: {
      purchase: "你的 AI Translator 许可证密钥",
      renewal: "你的 AI Translator 套餐已续期",
      plan_change: "你的 AI Translator 套餐已更改",
      recover: "你的 AI Translator 许可证密钥",
      resend: "你的 AI Translator 许可证密钥",
      support: "AI Translator 客服的回复",
    },
    heading: {
      purchase: "感谢你购买 AI Translator",
      renewal: "你的套餐已续期",
      plan_change: "你的套餐已更改",
      recover: "你的许可证密钥",
      resend: "你的许可证密钥",
      support: "客服已回复你",
    },
    lead: {
      purchase: "以下是你的许可证密钥。",
      renewal: "感谢续期。密钥保持不变，无需重新激活。",
      plan_change: "谢谢。密钥保持不变，无需重新激活。",
      recover: "以下是此邮箱名下仍有效的许可证密钥。",
      resend: "应你的要求，再次发送你的许可证密钥。",
      support: "AI Translator 客服已回复你的消息。",
    },
    eyebrow: { license: "许可证密钥", support: "客服" },
    plan: "套餐",
    expires: "到期时间",
    stepsTitle: "在你的电脑上激活",
    steps: ["打开 AI Translator。", "进入“设置 › 许可证”。", "粘贴密钥，然后点击“激活”。"],
    note: "每个密钥只能在 1 台电脑上使用。请保留此邮件，以便重装系统或更换电脑后重新激活。",
    guide: "详细步骤",
    guidePath: "/zh/guide/buy-and-activate/",
    help: "需要帮助？直接回复此邮件即可。",
    supportOutro: "你可以直接回复此邮件，或在 aitranslator.vn 或应用的“客服”页面重新打开聊天。",
  },
  ko: {
    date: (y, m, d) => `${y}년 ${m}월 ${d}일`,
    subject: {
      purchase: "AI Translator 라이선스 키",
      renewal: "AI Translator 플랜이 갱신되었습니다",
      plan_change: "AI Translator 플랜이 변경되었습니다",
      recover: "AI Translator 라이선스 키",
      resend: "AI Translator 라이선스 키",
      support: "AI Translator 지원팀의 답변",
    },
    heading: {
      purchase: "AI Translator를 구매해 주셔서 감사합니다",
      renewal: "플랜이 갱신되었습니다",
      plan_change: "플랜이 변경되었습니다",
      recover: "라이선스 키",
      resend: "라이선스 키",
      support: "지원팀이 답변했습니다",
    },
    lead: {
      purchase: "라이선스 키를 보내 드립니다.",
      renewal: "갱신해 주셔서 감사합니다. 키는 그대로이므로 다시 활성화할 필요가 없습니다.",
      plan_change: "감사합니다. 키는 그대로이므로 다시 활성화할 필요가 없습니다.",
      recover: "이 이메일로 구매한 유효한 라이선스 키입니다.",
      resend: "요청하신 라이선스 키를 다시 보내 드립니다.",
      support: "AI Translator 지원팀이 메시지에 답변했습니다.",
    },
    eyebrow: { license: "라이선스 키", support: "지원" },
    plan: "플랜",
    expires: "만료일",
    stepsTitle: "컴퓨터에서 활성화하기",
    steps: ["AI Translator를 엽니다.", "설정 › 라이선스로 이동합니다.", "키를 붙여 넣고 활성화를 클릭합니다."],
    note: "키 하나는 컴퓨터 1대에서 사용할 수 있습니다. 다시 설치하거나 컴퓨터를 바꿀 때 다시 활성화할 수 있도록 이 이메일을 보관하세요.",
    guide: "자세한 안내",
    guidePath: "/ko/guide/buy-and-activate/",
    help: "도움이 필요하면 이 이메일에 회신하세요.",
    supportOutro: "이 이메일에 회신하거나, aitranslator.vn 또는 앱의 지원 화면에서 채팅을 다시 열 수 있습니다.",
  },
};

/** Câu dẫn của phần tiếng Anh nằm dưới phần ngôn ngữ của khách: trỏ lên key ở trên, không lặp lại key. */
export const EN_BELOW: Record<MailKind, Counted> = {
  purchase: { one: "Your license key is shown above.", many: "Your license keys are shown above." },
  renewal: "Thank you for renewing. Your key (above) stays the same; no need to activate it again.",
  plan_change: "Your plan has changed. Your key (above) stays the same; no need to activate it again.",
  recover: { one: "The active license key for this email is shown above.", many: "The active license keys for this email are shown above." },
  resend: { one: "Your license key is shown above, sent again as you asked.", many: "Your license keys are shown above, sent again as you asked." },
  support: "AI Translator support has replied to your message (above).",
};
