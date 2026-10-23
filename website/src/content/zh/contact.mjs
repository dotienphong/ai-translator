import { pageHero, sectionHead, callout, facts, linkCard, icon } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "联系与支持", path: "/zh/contact/" },
];

const EMAIL = SITE.email;
// 预先填好主题和正文模板的 mailto 链接。因为位于 HTML 属性中，所以使用 `&amp;`。客服用英语或越南语回复，所以各项名称附上英文。
const mail = (subject, body) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&amp;body=${encodeURIComponent(body.join("\n"))}` : ""}`;

const M = {
  support: mail("AI Translator technical support", [
    "AI Translator 版本（关于页面）(App version):",
    "操作系统和电脑（例如 macOS 15、MacBook Air M2；或 Windows 11、Intel Core i5-1235U）(OS and computer):",
    "内存 (RAM):",
    "显卡（Windows 电脑）(Graphics card):",
    "模型包（Standard 或 Lite）(Model pack):",
    "使用的会议应用 (Meeting app):",
    "发生了什么 (What happened):",
    "重现步骤 (Steps to reproduce):",
  ]),
  key: mail("Lost AI Translator license key", ["购买时使用的邮箱 (Email used to buy):", "是否已试过“设置 › 许可证 › 丢了密钥？”（是／否）(Tried Lost your key?):"]),
  payment: mail("AI Translator payment problem", ["订单号（升级页面上的“订单 …”一行）(Order code):", "购买时使用的邮箱 (Email used to buy):", "付款方式（VietQR 或国际银行卡）、时间和金额 (Payment method, time, amount):", "问题 (Problem):"]),
  refund: mail("AI Translator refund request", ["订单号 (Order code):", "付款日期 (Payment date):", "原因 (Reason):"]),
  erase: mail("Request to delete or anonymize personal data", ["我请求删除或匿名化与此邮箱关联的个人数据。(I ask you to delete or anonymize the personal data linked to this email.)", "（从我购买时使用的同一个邮箱发送。）(Sent from the same email I used to buy.)"]),
  security: mail("[Security] AI Translator security report", ["我发现的问题 (What I found):", "重现步骤 (Steps to reproduce):", "受影响的版本或组件 (Affected version or component):"]),
  feedback: mail("AI Translator feedback", ["你需要什么，或哪里不好用 (What you need, or what is not working well):"]),
};

const btn = (href, label) => `<p><a class="btn btn-secondary btn-sm" href="${href}">${icon("mail")} ${label}</a></p>`;

export default {
  id: "contact",
  lang: "zh",
  path: "/zh/contact/",
  title: "AI Translator 联系与支持",
  description:
    "通过 support@aitranslator.vn 或网站和应用中的客服聊天联系 AI Translator：安装包、技术支持、密钥丢失、付款问题、退款、数据删除和安全报告。",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "联系与支持",
  lead: "你可以发邮件到 support@aitranslator.vn 联系 AI Translator，也可以使用客服聊天：本网站每个页面右下角的聊天按钮，或应用中的“客服”页面。我们没有客服电话。",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["邮箱", `<a href="mailto:${EMAIL}">${EMAIL}</a><small>客服用英语或越南语回复；用英语或越南语来信沟通最顺畅</small>`],
  ["聊天", "每个页面右下角的聊天按钮，或应用中的“客服”页面<small>由真人回复，不是机器人。可以留下邮箱（选填），离开页面后也能通过邮件收到回复。消息保存 90 天。看不到聊天按钮（例如浏览器关闭了 JavaScript）时，请发邮件</small>"],
  ["其他渠道", "无<small>除邮件和聊天外，我们没有电话或其他支持渠道</small>"],
  ["回复", "不承诺回复时间<small>产品由一个人运营，所以我们不承诺具体的回复时间</small>"],
  ["安全报告", `<a href="/.well-known/security.txt">/.well-known/security.txt</a><small>或发送主题以 [Security] 开头的邮件</small>`],
])}</div>
<p class="center-text reveal"><a class="btn btn-primary btn-lg" href="mailto:${EMAIL}">${icon("mail")} 给我们发邮件</a></p>
<p class="disclaimer">以下任何请求都不需要你发送密码、银行卡号或银行账号。我们不需要，也不会收到这些信息。</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "需要提供什么", title: "你需要什么？请附上这些信息发邮件给我们", text: "点击下面的每个按钮都会打开你的邮件应用，并填好主题和模板。如果没有打开，请手动写信到上面的地址。", center: true })}
<div class="grid grid-2">

<div class="card reveal" id="installer">
<h3>通过邮件获取安装包</h3>
<p>macOS 和 Windows 都可以在下载页面用一行命令安装，不需要邮件。如果你更想通过邮件获取 macOS 的 .dmg 或 Windows 的 .exe：请使用下载页面上的模板（macOS 和 Windows 各有一个）发邮件给我们，写上你的电脑型号和芯片或处理器、macOS 或 Windows 版本、内存、使用的会议应用以及需要的语言。我们会把安装包连同 SHA-256 校验值一起发给你，方便你核对。</p>
<p><a class="btn btn-secondary btn-sm" href="/zh/download/">打开下载页面 ${icon("arrow-right")}</a></p>
</div>

<div class="card reveal" id="technical-support">
<h3>技术支持</h3>
<p>请提供：应用版本（关于页面）、macOS 版本和芯片（苹果菜单 › 关于本机）或 Windows 版本和处理器（设置 › 系统 › 系统信息）以及显卡、内存、使用的模型包（设置 › 模型：Standard 或 Lite）、会议应用、导致问题的步骤以及任何错误信息的原文。</p>
<p>最快的方法：进入“关于 › 向客服发送日志”，把显示的报告编号（形如 R-XXXX-XXXX）写进邮件；我们可以用这个编号找到你的日志。日志从不包含说话的内容，个人数据会在发送前去除。如果你想自己附上文件，请进入“关于 › 打开日志文件夹”。许多常见问题都能很快解决，所以请先试试<a href="/zh/guide/troubleshooting/">故障排除步骤</a>。</p>
${btn(M.support, "发邮件给技术支持")}
</div>

<div class="card reveal" id="lost-key">
<h3>许可证密钥丢失</h3>
<p>你可以自己找回：进入“设置 › 许可证 › 丢了密钥？”，输入购买时使用的邮箱，然后选择“发送我的密钥”。邮件来自 no-reply@mail.aitranslator.vn，所以也请检查垃圾邮件文件夹。如果仍然没有收到，请用购买时使用的邮箱给我们发邮件。也可以参阅<a href="/zh/guide/buy-and-activate/">购买和激活密钥指南</a>。</p>
${btn(M.key, "就密钥丢失发邮件")}
</div>

<div class="card reveal" id="payment">
<h3>付款问题</h3>
<p>如果你已付款但没有收到密钥、付款金额不足，或订单失败，请发送订单号（升级页面上的“订单 …”一行）、购买时使用的邮箱、付款方式以及付款时间和金额。如果是银行卡付款，并且你有 Creem 发送到你所填邮箱的收据，也请一并附上。VietQR 转账由你的银行和 PayOS 处理。对于银行卡付款，Creem 是销售方（merchant of record，即转售商），负责处理付款和税费；我们不会收到你的银行账户或银行卡信息。</p>
${btn(M.payment, "就付款问题发邮件")}
</div>

<div class="card reveal" id="refund">
<h3>退款申请</h3>
<p>请在付款日起 <strong>7 天内</strong>，先把申请连同订单号和原因发送给我们。付款不予退还，除非由于我们这边的故障导致你无法使用所购买的套餐，并且我们无法在合理时间内修复，或者法律另有规定；更换套餐不予退款。对于银行卡付款，Creem 是销售方（merchant of record），所以 Creem 也可能根据 Creem 的条款退款；如果我们超过 7 天没有回复，你可以联系 Creem（在 creem.io/my-orders/login 查询你的订单）。当订单被退款时（全部或部分退款，包括通过银行卡争议退款），我们可能会缩短该订单为你的许可证增加的时间；如果许可证只由该订单组成，则可能撤销许可证；这不是自动进行的，而是由运营者逐案决定。详情见<a href="/en/terms/">使用条款（英文）</a>。</p>
${btn(M.refund, "发送退款申请")}
</div>

<div class="card reveal" id="delete-data">
<h3>删除或匿名化个人数据</h3>
<p>请<strong>用购买时使用的同一个邮箱</strong>发送申请，以便我们确认是你本人。我们会删除你的邮箱和设备名称；仍会保留最少量的数据（经过哈希处理的设备 ID、你同意的时间以及会计所需的订单记录），你的许可证仍然可以使用，但无法再通过邮件找回。你在 Creem 页面上填写的数据由 Creem 按照其政策保存；如需在那里删除，请联系 Creem。完整列表见<a href="/zh/data-security/#delete-data">数据与安全</a>。你自己电脑上的数据可以在应用内立即删除。</p>
${btn(M.erase, "申请删除数据")}
</div>

<div class="card reveal" id="security">
<h3>报告安全问题</h3>
<p>如果你认为在应用、许可证服务器或本网站中发现了漏洞，请发送主题以 [Security] 开头的邮件，并附上描述、重现步骤和受影响的版本。在我们互相沟通之前，请不要公开披露。安全联系方式也写在 <a href="/.well-known/security.txt">security.txt</a> 文件中。</p>
${btn(M.security, "发送安全报告")}
</div>

<div class="card reveal" id="feedback">
<h3>意见和新需求</h3>
<p>需要其他语言、想在多台电脑上使用，或者有其他想法？我们在<a href="/zh/about/#under-consideration">下一阶段</a>考虑哪些事项的先后顺序取决于用户反馈（这不是承诺）。请告诉我们你用 AI Translator 做什么。</p>
${btn(M.feedback, "发送意见")}
</div>

</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "写信之前", title: "也许你马上就能找到答案" })}
${callout({ title: "关于我们的联系方式。", text: "AI Translator 的提供方是 Đỗ Tiến Phong（个人）。本网站没有公布地址、电话号码或税号；所有联系都通过上面的邮箱或客服聊天进行。" })}
<div class="grid grid-3">
${linkCard({ href: "/zh/faq/", icon: "message", title: "常见问题", text: "关于安装、隐私、套餐和付款的简短回答。", more: "阅读常见问题" })}
${linkCard({ href: "/zh/guide/troubleshooting/", icon: "support", title: "故障排除", text: "常见问题以及分步解决方法。", more: "查看指南" })}
${linkCard({ href: "/zh/data-security/", icon: "shield", title: "数据与安全", text: "什么留在你的电脑上，我们的服务器保存什么、保存多久。", more: "阅读详情" })}
</div>
</div></section>
`,
};
