import { pageHero, sectionHead, plansGrid, steps, faq, ctaBand, callout, appShot, checkList, icon } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "价格", path: "/zh/pricing/" },
];

export const PRICING_FAQ = [
  {
    q: "Free 和付费套餐有什么不同？",
    a: `<p>Free 是试用：从一台电脑第一次登记开始，有效期 10 天，每天最多翻译 30 分钟，每台电脑只能用一次。付费套餐（Monthly、6 Months 和 Yearly）增加了 Pro 功能（术语表、历史记录、导出）和更多的翻译时间。</p>`,
  },
  {
    q: "10 天试用结束后会怎样？",
    a: `<p>这台电脑将不能再使用 Free 套餐，需要购买 Monthly、6 Months 或 Yearly 套餐才能继续翻译。卸载后重新安装应用、删除应用数据或清空钥匙串都不会让 10 天重新开始，因为我们的服务器会为每台电脑记录开始日期。</p>`,
  },
  {
    q: "可以用国际银行卡付款吗？",
    a: `<p>可以。应用的升级页面提供两种付款方式：<strong>用越南盾（VND）进行 VietQR 银行转账</strong>（从越南银行转账，经由 PayOS 支付网关），或<strong>用美元（USD）以国际银行卡付款</strong>（Monthly US$3.99、6 Months US$21.99、Yearly US$39.99，不含税）。用银行卡付款时，应用会在浏览器中打开 Creem 付款页面；付款完成后回到应用，套餐会自动生效。对于银行卡支付的订单，Creem 是销售方（merchant of record，即转售商），负责处理付款及相关税费；Creem 的买家条款：<a href="https://www.creem.io/buyer-terms" rel="noopener">https://www.creem.io/buyer-terms</a>。不提供定期扣款。Free 试用不需要任何付款方式。</p>`,
  },
  {
    q: "我的套餐会自动续费吗？",
    a: `<p>不会。每个套餐都是一次性的预付订单，到期后就会结束。应用会在到期前 7 天提醒你，由你决定何时续费。续订同一套餐会增加 30 天（Monthly）、180 天（6 Months）或 365 天（Yearly）；如果套餐仍然有效，则从到期日开始计算。</p>`,
  },
  {
    q: "一个密钥可以在几台电脑上使用？",
    a: `<p>一台。每个密钥只能在一台电脑上使用。要换到另一台电脑，请在旧电脑的“设置 › 许可证”中停用，或在新电脑上选择“移除那台电脑并使用这台”。当密钥正在另一台电脑上使用时，第二台电脑默认会被阻止；只有当你特意选择“仍在这台电脑上激活”并确认后，密钥才会在两台电脑上同时被临时锁定，直到其中一台移除它。</p>`,
  },
  {
    q: "可以退款吗？",
    a: `<p>付款不予退还，除非由于我们这边的故障导致你无法使用所购买的套餐，并且无法在合理时间内修复，或者法律另有规定。请在付款日起 7 天内，先把请求连同订单号发送到 support@aitranslator.vn。更换套餐不予退款。对于银行卡付款，Creem 是销售方（merchant of record），所以 Creem 也可能根据 Creem 的条款退款。当订单被退款时（全部或部分退款，包括通过银行卡争议退款），我们可能会缩短该订单为你的许可证增加的时间；如果许可证只由该订单组成，则可能撤销许可证；这不是自动进行的，而是由运营者逐案决定。详情见<a href="/en/terms/">使用条款（英文）</a>。</p>`,
  },
  {
    q: "可以为公司开具电子发票吗？",
    a: `<p>对于 VietQR 订单，我们目前还不开具电子发票。对于用国际银行卡支付的订单，Creem 会把收据发送到你填写的邮箱。如果你需要其他单据，请联系 support@aitranslator.vn，我们一起商量。</p>`,
  },
  {
    q: "翻译时间是怎么计算的？",
    a: `<p>只计算被翻译的语音，按语音的长度计算。静音、已经是你想阅读的语言的句子，以及未能翻译的片段都不计算。翻译时间按每台电脑分别计算。</p>`,
  },
  {
    q: "我的密钥丢了，该怎么办？",
    a: `<p>打开“设置 › 许可证 › 丢了密钥？”，输入购买时使用的邮箱，然后选择“发送我的密钥”。该邮箱名下所有有效的密钥都会发送到同一个邮箱。你也可以联系 support@aitranslator.vn。</p>`,
  },
];

export default {
  id: "pricing",
  lang: "zh",
  path: "/zh/pricing/",
  title: "价格：免费试用和三种预付套餐",
  description:
    "免费试用 10 天，以及 Monthly、6 Months、Yearly 三种预付套餐。可用国际银行卡（US$3.99 起，不含税）或 VietQR 支付，不自动续费。",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({ crumbs, title: "简单的价格：预付，不自动续费", lead: "先免费试用 10 天，觉得有用再选择 Monthly、6 Months 或 Yearly。付款在应用内开始：可以从越南银行用越南盾（VND）通过 VietQR 支付，也可以用国际银行卡以美元（USD）支付；用银行卡时在浏览器中完成付款。密钥会通过邮件发送给你。" })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">四种套餐</h2>
${plansGrid("zh", { ctaLabel: "下载", freeLabel: "安装并免费试用" })}
<p class="disclaimer">VND 价格按订单计算，与 VietQR 码中的金额一致。USD 价格适用于用国际银行卡付款，不含税：如果你所在国家需要缴税（增值税、商品及服务税或销售税），Creem 会在付款页面上加上。价格和翻译时间由我们的服务器设定；已购买的套餐在所购期限内保持原有的翻译时间，除非该订单已被退款。</p>
${callout({ title: "在越南境外付款", text: "没有越南银行账户？在升级页面选择<strong>国际银行卡（USD）</strong>：在 Creem 付款页面用银行卡付款即可，不需要越南银行。根据 Creem 的名单，部分国家不支持银行卡付款。Free 试用仍然不需要任何付款方式。如需帮助，请<a href=\"/zh/contact/\">联系我们</a>。" })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "对比", title: "每个套餐包含什么", center: true })}
<div class="table-wrap reveal" role="region" aria-label="套餐对比" tabindex="0"><table class="compare">
<thead><tr><th scope="col"><span class="sr-only">功能</span></th><th scope="col">Free（试用）</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">价格</th><td>0 ₫</td><td>每单 50,000 ₫<small>或 US$3.99（不含税）</small></td><td>每单 269,000 ₫<small>或 US$21.99（不含税）</small></td><td>每单 500,000 ₫<small>或 US$39.99（不含税）</small></td></tr>
<tr><th scope="row">付款方式</th><td>无需付款</td><td>VietQR（VND）或国际银行卡（USD）</td><td>VietQR（VND）或国际银行卡（USD）</td><td>VietQR（VND）或国际银行卡（USD）</td></tr>
<tr><th scope="row">期限</th><td>10 天，每台电脑一次</td><td>每单 30 天</td><td>每单 180 天</td><td>每单 365 天</td></tr>
<tr><th scope="row">翻译时间</th><td>每天 30 分钟</td><td>每个 30 天周期 50 小时（3,000 分钟）</td><td>每个 30 天周期 100 小时（6,000 分钟）</td><td>不限时长</td></tr>
<tr><th scope="row">实时翻译字幕，5 种语言</th><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">可自定义的字幕条、快捷键</th><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">复制转写记录</th><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">聊天用的输入翻译（不消耗翻译时间）</th><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">术语表（Pro）</th><td><span class="no">无</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">会话历史（Pro）</th><td><span class="no">无</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">导出为 TXT、SRT、Markdown（Pro）</th><td><span class="no">无</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td><td><span class="yes">有</span></td></tr>
<tr><th scope="row">每个密钥可用的电脑</th><td>无需密钥</td><td>1 台电脑</td><td>1 台电脑</td><td>1 台电脑</td></tr>
<tr><th scope="row">折合每月</th><td>0 ₫</td><td>50,000 ₫</td><td>约 44,800 ₫</td><td>约 41,700 ₫</td></tr>
</tbody></table></div>
<p class="small muted">连续购买 6 次 Monthly（180 天）需要 300,000 ₫，而一次 6 Months 订单的 180 天只需 269,000 ₫；连续购买 12 次 Monthly（360 天）需要 600,000 ₫，而一次 Yearly 订单的 365 天只需 500,000 ₫。Monthly 每 30 天最多翻译 50 小时，6 Months 每 30 天最多 100 小时；Yearly 不限时长。各项 Pro 功能的详情见<a href="/zh/features/">功能页面</a>。</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-upgrade", lang: "zh", alt: "中文的应用升级页面，已选好国际银行卡（USD）：第 1 步付款方式，旁边是 VietQR 银行转账（VND），并说明银行卡订单由 Creem 作为销售方；第 2 步选择套餐，有 Free、Monthly、6 Months 和 Yearly 套餐、各自的翻译时间和不含税的 USD 价格（$3.99、$21.99 和 $39.99）；第 3 步付款，有接收密钥的电子邮箱和在浏览器中付款按钮", caption: "选择国际银行卡时的应用升级页面：两种付款方式、四种套餐、USD 价格（不含税）和翻译时间。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">翻译时间</span>
<h2>只计算被翻译的语音</h2>
${checkList([
  "时间按已翻译片段中<strong>语音的长度</strong>计算，不计算前后的空白或静音",
  "<strong>已经是你想阅读的语言</strong>的句子，以及被跳过或未能翻译的片段，<strong>都不计算</strong>",
  "<strong>Free：</strong>30 分钟的额度每天重置，通常在你电脑时钟的 00:00（距上次重置至少 20 小时；应用会显示重新开放的确切时间）",
  "<strong>Monthly 和 6 Months：</strong>30 天周期从付款日开始，而不是按日历月（6 Months 的 180 天中有六个周期，每个周期各有 100 小时）",
  "剩余时间不足 5 分钟时应用会提醒你；额度用完时，它会停止会话，并告诉你何时可以再次翻译",
  "翻译时间按每台电脑分别计算",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "如何购买", title: "从选择套餐到激活，都在应用内完成", center: true })}
${steps([
  { title: "在应用中选择付款方式和套餐", text: "打开<strong>升级到 Pro</strong>，选择<strong>付款方式</strong>（VND 的 VietQR 或 USD 的国际银行卡），然后选择 Monthly、6 Months 或 Yearly（套餐上的价格会跟随你的付款方式），输入接收密钥的邮箱，并同意我们保存它以便发送和找回密钥。" },
  { title: "付款", text: "<strong>VietQR：</strong>应用会直接在窗口中显示二维码，还有一个按钮可以打开 PayOS 付款页面；二维码 15 分钟内有效。<strong>国际银行卡：</strong>应用会自动在浏览器中打开 Creem 付款页面；请在 30 分钟内付款。如果你已经付款，密钥会通过邮件发送给你；请不要重复付款。" },
  { title: "自动激活", text: "支付网关确认付款后（应用每隔几秒检查一次），套餐会立即在你的电脑上生效，密钥也会发送到你的邮箱。" },
])}
<p class="center-text reveal"><a class="btn btn-secondary" href="/zh/guide/buy-and-activate/">阅读购买和激活密钥指南 ${icon("arrow-right")}</a></p>
<p class="disclaimer">我们不会收到你的银行卡号或银行账户信息。使用 VietQR 时，我们不会把你的邮箱发送给 PayOS。使用国际银行卡时，我们会把你在应用中填写的邮箱发送给 Creem，用于预先填写付款页面，并让 Creem 给你发送收据；对于银行卡订单，Creem 是销售方（merchant of record，即转售商），负责处理付款和税费。</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "续订和更换套餐", title: "灵活，并按天计价", center: true })}
<div class="grid grid-2">
<div class="card reveal"><h3>续订同一套餐</h3><p>再次购买同一套餐，即可增加 30 天（Monthly）、180 天（6 Months）或 365 天（Yearly）；如果套餐仍然有效，则从到期日开始计算。应用会在到期前 7 天和到期后提醒你。从不自动扣费。</p></div>
<div class="card reveal"><h3>在有效期内更换套餐</h3><p>新套餐立即生效，旧套餐剩余的天数按<strong>每天的价格</strong>折算，并向下取整。例如按 VND 价格计算（如果用 USD 付款，公式会使用两个套餐的 USD 价格，所以天数可能不同：在这个例子中最多相差一天），Monthly 还剩 20 天时，购买 Yearly 会增加 24 天（Yearly 将持续 389 天），购买 6 Months 会增加 22 天（6 Months 将持续 202 天）。付款前，应用会显示折算后的天数和新的到期日（估算）。更换套餐不予退款。</p></div>
</div>
${callout({ title: "套餐到期时", text: "如果电脑仍在 10 天试用期内，它会回到 Free；试用期结束后，需要付费套餐才能继续翻译。没有付费套餐时，Pro 功能（历史记录、术语表、导出）会被锁定。" })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "价格问题", title: "购买前你可能想问的问题" })}
${faq(PRICING_FAQ)}
</div></section>

${ctaBand({ title: "从 10 天试用开始", text: "每天 30 分钟，足够在真实会议中测试。无需银行卡，无需账号。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/faq/", label: "阅读常见问题" } })}
`,
};
