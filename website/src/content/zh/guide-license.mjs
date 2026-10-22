import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "购买套餐、激活密钥和更换电脑", path: "/zh/guide/buy-and-activate/" },
];

const toc = [
  { level: 2, id: "buy", text: "在应用内购买套餐" },
  { level: 2, id: "enter-key", text: "获取并输入密钥" },
  { level: 3, id: "lost-key", text: "丢了密钥" },
  { level: 2, id: "switch-computers", text: "一个密钥一台电脑" },
  { level: 2, id: "offline", text: "离线使用和许可证检查" },
  { level: 2, id: "renew-change", text: "续订、更换套餐、到期" },
  { level: 2, id: "refunds", text: "付款问题和退款" },
];

export default {
  id: "guide-license",
  lang: "zh",
  path: "/zh/guide/buy-and-activate/",
  title: "购买套餐、激活密钥和更换电脑",
  description:
    "在应用内用 VietQR 或国际银行卡购买 Monthly、6 Months 或 Yearly，输入密钥，更换电脑，续订，处理未成功的订单、退款和被锁定的密钥。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "购买套餐并激活 AI Translator",
      description: "在应用内用 VietQR 或国际银行卡购买 Monthly、6 Months 或 Yearly 套餐，并在你的电脑上激活密钥。",
      totalTime: "PT10M",
      steps: [
        { name: "打开“升级到 Pro”", text: "点击侧边栏中的“升级到 Pro”，查看四种套餐。购买需要联网。" },
        { name: "选择付款方式和套餐", text: "在第 1 步“付款方式”中选择“VietQR 银行转账（VND）”或“国际银行卡（USD）”；应用会根据界面语言预先选好一种（越南语为 VietQR，其他语言为国际银行卡），你也可以更改。然后在第 2 步“选择套餐”中选择 Monthly、6 Months 或 Yearly；价格随付款方式变化。" },
        { name: "输入接收密钥的邮箱", text: "在第 3 步“付款”中输入“接收密钥的电子邮箱”，勾选同意框（使用国际银行卡时，也表示同意我们把邮箱提供给 Creem，用于预先填写付款页面），然后点击“生成付款二维码”（VietQR）或“在浏览器中付款”（国际银行卡）。" },
        { name: "付款", text: "VietQR：在 15 分钟内用越南银行应用扫码，或点击“打开付款页面”。国际银行卡：在应用于浏览器中打开的 Creem 付款页面上，于 30 分钟内付款（应用会显示“请在 … 前完成付款。”）。如果你晚一些付款而页面仍然接受，密钥仍会通过邮件发送；如果已经付款，请不要重复付款。" },
        { name: "激活", text: "收到付款后，应用会激活套餐。如有需要，打开“设置 › 许可证”，把邮件中的密钥粘贴到“许可证密钥”框中，然后点击“激活”。" },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "购买套餐、激活密钥和更换电脑",
  lead: "AI Translator 的套餐在应用内购买：选择 Monthly、6 Months 或 Yearly，用 VietQR 或国际银行卡付款，密钥会通过邮件发给你，同时应用会在你正在使用的电脑上激活套餐。每个密钥只能在一台电脑上使用。要换到另一台电脑，请先停用旧电脑，再在新电脑上输入密钥。",
  meta: `<span>更新于 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本页内容",
  body: `
${facts([
  ["套餐", "Monthly 50,000 ₫ 或 US$3.99（30 天，50 小时）<small>6 Months 269,000 ₫ 或 US$21.99（180 天，每 30 天 100 小时）</small><small>Yearly 500,000 ₫ 或 US$39.99（365 天，不限时长）</small>"],
  ["付款", "VietQR（越南银行，VND）或国际银行卡（USD，通过 Creem）<small>USD 价格不含税 · 不自动续费</small>"],
  ["电脑", "每个密钥一台电脑"],
  ["离线", "两次许可证检查之间最多 14 天"],
  ["退款", "除使用条款规定的情形外，付款不予退还<small>请在付款日起 7 天内提出申请</small>"],
])}

<h2 id="buy">在应用内购买套餐</h2>
<ol>
<li>点击侧边栏中的<strong>升级到 Pro</strong>。页面会列出全部四种套餐；你当前的套餐标有“当前”。购买需要联网。</li>
<li>页面分为三个步骤。在第 1 步<strong>付款方式</strong>中，选择<strong>VietQR 银行转账（VND）</strong>或<strong>国际银行卡（USD）</strong>；正下方的说明会解释这种方式如何运作。应用会根据界面语言预先选好一种（越南语为 VietQR，英语、日语、中文或韩语为国际银行卡），你也可以更改；套餐框上的价格会随你的选择变化。如果这一步只提供 VietQR，说明目前无法用银行卡付款。看不到这些步骤？请把应用更新到最新版本。</li>
<li>在第 2 步<strong>选择套餐</strong>中点击 <strong>Monthly</strong>、<strong>6 Months</strong> 或 <strong>Yearly</strong> 框（价格以大字显示，并随付款方式变化，例如“50.000 đ / 30 天”或“$3.99 / 30 天”；USD 价格不含税）；选中的框会显示蓝色边框。</li>
<li>在第 3 步<strong>付款</strong>中，输入<strong>接收密钥的电子邮箱</strong>并勾选同意框：这样应用就可以保存邮箱，用来发送和找回你的密钥；使用国际银行卡时，这句话还说明邮箱会发送给 Creem，用于预先填写付款页面；如果你更改了付款方式，请重新勾选。下方有可折叠的<strong>隐私政策</strong>，使用国际银行卡时还有<strong>许可协议（EULA）</strong>，可以在应用内阅读。然后点击<strong>生成付款二维码</strong>（VietQR）或<strong>在浏览器中付款</strong>（国际银行卡）。</li>
<li><strong>VietQR：</strong>用你的银行应用扫码，或点击<strong>打开付款页面</strong>（PayOS，在浏览器中打开）。二维码有效期为 15 分钟，到期时间显示在屏幕上。</li>
<li><strong>国际银行卡：</strong>应用会自动在浏览器中打开 Creem 付款页面，并显示<strong>请在浏览器中完成付款</strong>一栏，其中有订单号、金额以及“请在 … 前完成付款。”的截止时间。请在 30 分钟内付款。如果你晚一些付款而页面仍然接受，付款仍然有效：应用会继续等待确认，密钥也会通过邮件发送，所以请不要重复付款。付款后回到应用；如果浏览器没有打开，请点击<strong>重新打开付款页面</strong>。订单等待期间，付款方式和套餐会被锁定；如果你已经付款，请不要点击“取消”或创建新订单。</li>
<li>等待应用确认（它每隔几秒检查一次订单；银行卡付款时状态行显示“正在等待付款确认…”）：“已收到付款。套餐已在这台电脑上生效，密钥已发送到你的邮箱。”</li>
</ol>
${appShot({
  slug: "app-upgrade",
  lang: "zh",
  alt: "中文的升级页面，已预选国际银行卡（USD）：第 1 步付款方式（VietQR 银行转账（VND）和国际银行卡（USD）），附有关于 Creem 付款页面和 Creem 作为销售方的说明；第 2 步选择套餐，列出 Free、Monthly、6 Months 和 Yearly 套餐、翻译时长和不含税的 USD 价格；第 3 步付款，有接收密钥的电子邮箱框、同意复选框、折叠的隐私政策和许可协议（EULA）以及在浏览器中付款按钮",
  caption: "升级页面。",
})}
${appShot({
  slug: "app-upgrade-qr",
  lang: "zh",
  alt: "VietQR 订单等待中的升级页面：第 1 步选中 VietQR，第 2 步选中 Monthly 套餐，第 3 步是应用内绘制的 VietQR 码、订单号、金额、二维码有效期、等待转账的状态行、打开付款页面按钮和取消按钮",
  caption: "应用内的 VietQR 码和订单号。",
})}
${appShot({
  slug: "app-upgrade-card",
  lang: "zh",
  alt: "国际银行卡订单等待中的升级页面：第 1 步选中国际银行卡（USD），两条说明分别指出 Creem 付款页面会在浏览器中打开、Creem 是销售方；第 2 步是不含税的 USD 价格；第 3 步是请在浏览器中完成付款一栏，包括订单号、金额、付款截止时间、正在等待付款确认…一行、重新打开付款页面按钮、取消按钮，以及已付款就不要取消或新建订单的提醒",
  caption: "应用中等待付款的国际银行卡订单。",
})}
<p>VietQR 只适用于越南银行账户，以 VND 通过 PayOS 付款；如果目前无法用银行卡付款，而你又没有越南银行账户，请联系客服。银行卡价格以 USD 计，不含税（如有税费，Creem 会在付款页面加上）。银行卡订单由 Creem 作为销售方（merchant of record），负责处理付款、税费和收据；你的银行卡账单上通常显示“CREEM.IO* STORE”。价格和翻译时长请参阅<a href="/zh/pricing/">价格页面</a>。</p>

<h2 id="enter-key">通过邮件获取并输入密钥</h2>
<p>密钥会从 no-reply@mail.aitranslator.io.vn 发送到你输入的邮箱。请保留这封邮件，以便重新安装或激活另一台电脑；如果没有收到，请检查垃圾邮件文件夹。密钥由 7 组、每组 4 个字符组成：<code>XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>。</p>
<ol>
<li>打开<strong>设置 › 许可证</strong>。</li>
<li>在<strong>激活密钥</strong>下，把密钥粘贴到<strong>许可证密钥</strong>框中（连字符、空格和大小写都没有关系）。</li>
<li>点击<strong>激活</strong>。</li>
</ol>
<p>应用会在你的电脑上检查密钥；输错时会显示“此密钥无效。请检查是否输错。”激活后，应用会部分隐藏显示密钥；完整的密钥保留在你的邮件中。要输入另一个密钥，请先点击<strong>停用这台电脑</strong>。请不要把密钥告诉别人。</p>
${appShot({
  slug: "app-settings-license",
  lang: "zh",
  alt: "激活后设置中的许可证组：正在使用的 Monthly 套餐、只显示最后一组的部分隐藏密钥、到期日期、剩余时间、续订或更改套餐、立即检查和停用这台电脑按钮，以及丢了密钥？一栏",
  caption: "激活后的“设置 › 许可证”。",
})}
<h3 id="lost-key">丢了密钥</h3>
<p>进入<strong>设置 › 许可证 › 丢了密钥？</strong>，输入<strong>购买时使用的邮箱</strong>，然后点击<strong>发送我的密钥</strong>。该邮箱下所有有效的密钥都会发送到同一个地址。无论是否有密钥，应用都会显示“如果此邮箱有密钥，它马上就会送达。”仍然没有收到？请写信到 support@aitranslator.io.vn。</p>

<h2 id="switch-computers">一个密钥一台电脑：如何更换</h2>
<p>在同一台电脑上重新安装应用不算新电脑。翻译时长按电脑计算：已经用掉的部分留在旧电脑上。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">情况</th><th scope="col">怎么做</th></tr></thead>
<tbody>
<tr><th scope="row">旧电脑还能使用</th><td>在旧电脑上打开<strong>设置 › 许可证 › 停用这台电脑</strong>，然后用<strong>停用</strong>（浅红色确认框中的红色按钮）确认。那台电脑会回到 Free。然后在新电脑上输入密钥。</td></tr>
<tr><th scope="row">旧电脑坏了或不在手边</th><td>在新电脑上输入密钥。应用会显示正在使用该密钥的电脑，以及一个<strong>移除那台电脑并使用这台</strong>按钮。</td></tr>
<tr><th scope="row">你点击了<strong>仍在这台电脑上激活</strong></th><td>在其中一台电脑移除密钥之前，密钥会在两台电脑上都被锁定。应用会先请你确认。</td></tr>
</tbody></table></div>
<p>密钥被锁定时，许可证组会显示<strong>已锁定</strong>标记、“此密钥正在 2 台电脑上使用，因此已被锁定。要继续使用，请从其中一台电脑上移除它。”的消息以及两台电脑。点击<strong>从这台电脑移除密钥</strong>或<strong>移除那台电脑</strong>，然后点击<strong>重试</strong>。锁定期间，两台电脑上的付费套餐都无法使用。</p>
${callout({
  kind: "warn",
  title: "请不要来回切换。",
  text: "在 30 天内多次更换电脑可能会导致密钥被锁定：“由于更换电脑过于频繁，此密钥被暂时锁定。请联系客服。”",
})}

<h2 id="offline">离线使用和许可证检查</h2>
<p>语音识别和翻译不需要联网。付费套餐只需要至少每 14 天在线检查一次。如果 14 天都没有检查成功，应用会回到 Free（如果这台电脑仍在 10 天试用期内；试用期过后，在能够再次检查许可证之前无法翻译），并显示“套餐已有 14 天无法检查，因此使用 Free。请联网。”联网后，在“设置 › 许可证”中点击<strong>立即检查</strong>。把时钟往回调也会引发错误；请参阅<a href="/zh/guide/troubleshooting/">故障排除</a>。</p>

<h2 id="renew-change">续订、更换套餐和到期</h2>
<ul>
<li><strong>不会自动续费。</strong>应用会提醒“你的套餐将在 7 天内结束。请续订以继续使用 Pro 功能。”请在“设置 › 许可证”中点击<strong>续订或更改套餐</strong>。</li>
<li><strong>续订同一套餐：</strong>增加 30 天（Monthly）、180 天（6 Months）或 365 天（Yearly），如果套餐仍有效，则从到期日开始计算。</li>
<li><strong>在有效期内更换套餐：</strong>新套餐立即开始，并有新的翻译时长周期；旧套餐的剩余天数按每天的价格折算并向下取整：<code>折算天数 = 剩余天数 × (旧套餐价格 ÷ 旧套餐天数) ÷ (新套餐价格 ÷ 新套餐天数)</code>，其中新旧价格是两个套餐以更换套餐订单的币种（VND 或 USD）计算的价格。</li>
<li><strong>到期：</strong>如果这台电脑仍在 10 天试用期内，会回到 Free，否则在购买套餐之前无法翻译。Pro 功能会被锁定。</li>
</ul>
<p>每天的价格：Monthly 50,000 ÷ 30 ≈ 1,667 ₫，6 Months 269,000 ÷ 180 ≈ 1,494 ₫，Yearly 500,000 ÷ 365 ≈ 1,370 ₫。以 VND 计价的例子：Monthly 还剩 20 天时购买 Yearly，会增加 20 × 1,667 ÷ 1,370 ≈ 24 天，所以 Yearly 共 365 + 24 = 389 天；购买 6 Months 会增加 20 × 1,667 ÷ 1,494 ≈ 22 天，所以 6 Months 共 180 + 22 = 202 天。反过来，Yearly 还剩 200 天时购买 Monthly，会增加约 164 天，所以 Monthly 共 30 + 164 = 194 天。由于公式使用的是两个套餐以更换套餐订单的币种（VND 或 USD）计算的价格，用 USD 付款时天数可能不同：在上面的例子中最多相差一天，但剩余天数更多时可能相差好几天（6 Months 还剩 180 天时购买 Monthly，用 VND 付款增加 161 天，用 USD 付款增加 165 天）。应用会在付款前显示折算的天数和新的到期日期（估计值），并注明“不予退款。”</p>

<h2 id="refunds">付款问题、退款和发票</h2>
<ul>
<li><strong>VietQR 订单：</strong>“收到的金额少于价格。请在 24 小时内补足订单 … 的差额，或携带此订单号联系客服。”请转账补足差额，或联系客服。</li>
<li><strong>付款不足的银行卡订单</strong>（收到的金额少于套餐价格）：应用显示“已收到付款；客服正在审核订单 …。如有需要，请携带此订单号联系客服。”这表示运营者需要审核这笔订单；请不要再多付。</li>
<li>“已收到付款，但密钥无法在此处激活。…”请在“设置 › 许可证”中输入邮件里的密钥。</li>
<li>你已用银行卡付款，但应用仍显示“正在等待付款确认…”：请等几分钟（我们的服务器会定期再次向 Creem 查询），然后在邮件中查找密钥。如果仍然没有，请携带订单号和 Creem 收据联系客服。</li>
<li><strong>未成功或已超过付款时间的银行卡订单。</strong>应用会显示“订单 … 未成功。如果你已付款，密钥会发送到你的邮箱；请不要重复付款。如有需要，请携带此订单号联系客服。”或“已超过预定的付款时间。如果你已付款，Creem 确认后应用仍会自动激活你的套餐，密钥也会发送到你的邮箱；请不要重复付款。”如果你已经用银行卡付款，请不要重复付款：密钥仍会通过邮件发送；在“设置 › 许可证”中输入它，或携带订单号和 Creem 收据联系客服（你的银行卡账单上通常显示“CREEM.IO* STORE”；可在 creem.io/my-orders/login 查询订单）。如果你还没有付款，可以创建新订单。</li>
<li><strong>取消银行卡订单。</strong>订单等待期间，应用会在两个按钮下方显示：“如果你已在付款页面完成付款，请不要取消或创建新订单：密钥会发送到你的邮箱。取消此订单后，请不要再在旧的付款页面付款。”简而言之：如果已付款，就不要点击“取消”；如果已取消，就不要在那笔订单的付款页面付款，而是创建新订单。</li>
</ul>
<p>付款不予退还，除非由于我们这边的故障导致你无法使用所购买的套餐，并且我们无法在合理时间内修复，或者法律另有规定。请先在付款日起 7 天内，把申请连同<strong>订单号</strong>（在升级页面上显示为“订单 …”）发送到 support@aitranslator.io.vn；更换套餐不予退款。银行卡订单：Creem 是销售方，会把收据发到你填写的邮箱；Creem 也可能根据 Creem 的条款退款（如果我们超过 7 天没有回复，你可以联系 Creem；可在 creem.io/my-orders/login 查询订单）。当订单被退款时（全部或部分退款，包括通过银行卡争议退款），我们可能会缩短该订单为你的许可证增加的时间；如果许可证只由该订单组成，则可能撤销许可证；这不是自动进行的，而是由运营者逐案决定。VietQR 订单目前还没有电子发票；如果你需要单据，请联系客服商量。详情见<a href="/en/terms/">使用条款（英文）</a>和<a href="/zh/contact/">联系页面</a>。</p>
`,
})}
${docNav(
  [
    { href: "/zh/guide/history-and-export/", kicker: "上一篇", title: "历史记录和导出转写记录" },
    { href: "/zh/guide/troubleshooting/", kicker: "下一篇", title: "故障排除" },
  ],
  "相关指南",
)}
</div></section>
`,
};
