import { RELEASE } from "../../site.mjs";
import { pageHero, sectionHead, feature, linkCard, callout, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";
import { legalVersionLine } from "../legal.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "关于 AI Translator", path: "/zh/about/" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "about",
  lang: "zh",
  path: "/zh/about/",
  title: "关于 AI Translator：由来、原则和开发者",
  description:
    "AI Translator 为会议显示实时翻译字幕，离线运行，由独立开发者 Đỗ Tiến Phong 开发。在这里了解它的由来、原则和当前状态。",
  schemaType: "AboutPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "关于 AI Translator：在你自己的电脑上翻译会议",
  lead: "AI Translator 是一款为会议音频显示实时翻译字幕、在你的电脑上离线运行的桌面应用。它由独立开发者 Đỗ Tiến Phong 开发和运营，支持 macOS 和 Windows。",
  meta: "<span>更新于 {{updated}}</span><span>提供方：Đỗ Tiến Phong</span>",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["产品", "为会议、网络研讨会和视频提供实时翻译字幕<small>语音识别和翻译在你的电脑上运行</small>"],
  ["提供方", "Đỗ Tiến Phong（个人）<small>独立开发者</small>"],
  ["状态", `${RELEASE.zh}<small>macOS 14.2+（Apple 芯片）和 Windows 10/11 64 位</small>`],
  ["支持", `${MAIL}<small>可以用越南语或英语来信</small>`],
  ["语言", "英语、中文、日语（日本語）、韩语（한국어）、越南语（Tiếng Việt）<small>应用界面提供越南语、英语、日语、中文（简体）和韩语</small>"],
  ["许可", "商业产品，不开源<small>使用了第三方的开源组件</small>"],
])}</div>
</div></section>

<section class="section" id="story"><div class="container narrow">
${sectionHead({ eyebrow: "我们的故事", title: "为什么会有 AI Translator" })}
<div class="prose">
<p>最初的想法是把一款现有的 Android 离线翻译应用（开源的）用于通话和会议。但我们几乎立刻就碰到了操作系统的硬性限制。Android 允许第三方应用采集媒体和游戏的音频，却不允许采集电话或网络通话的音频，而通话期间应用的麦克风通常只能听到静音。</p>
<p>电脑就不一样了。Windows 和 macOS（14.2 起）都为应用提供了采集电脑自身正在播放的声音的方法。于是项目转向了桌面：一款收听系统音频、识别语音、翻译并显示字幕的应用，适用于任何会议应用，不需要机器人或插件。</p>
<p>在调研时（2026年9月），我们发现大型会议应用中的翻译字幕往往放在更高价位的付费档位里，并且在云端运行，许多第三方工具也是如此。我们想提供另一种选择：一切都在你的电脑上处理，适用于任何会议应用，重视越南语，而且因为不靠服务器翻译，每使用一分钟也不会增加额外的基础设施成本。这里有一篇<a href="/zh/compare/offline-vs-cloud-translation/">离线翻译与云端翻译的比较</a>。</p>
<p>翻译模型是通过测量选出的。在 2026年9月29日的一次内部测试中（320 句文本，五个翻译方向，在 Mac M4 Pro 上运行），我们选中的模型在自动翻译质量评分上得到 0.837，而在相同条件下测试的另外三个翻译模型得分在 0.736 到 0.833 之间。那次测试使用的是文本而不是真实语音，我们也没有和任何云端服务做比较。</p>
</div>
</div></section>

<section class="section section-alt" id="principles"><div class="container">
${sectionHead({ eyebrow: "原则", title: "打造产品时坚持的六件事", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "从设计上保护隐私", text: "音频留在 RAM 中，从不写入磁盘，也从不发送到任何地方。我们的服务器只保存许可证、订单、试用和错误报告所需的数据。详情见<a href=\"/zh/data-security/\">数据与安全</a>。", accent: true })}
${feature({ icon: "wifi-off", title: "翻译时离线", text: "语音识别和翻译在你的电脑上运行。只有下载模型、登记试用、购买和验证许可证以及更新应用时才需要联网。" })}
${feature({ icon: "info", title: "如实说明现状", text: "还没做到的事，我们就说还没做到。macOS 还没有经过公证，Windows 还没有代码签名，有些机器还没有测量：我们在网站和应用里都坦白说明。" })}
${feature({ icon: "lock", title: "没有广告，没有统计分析", text: "应用没有广告，也没有统计分析。遇到错误时，它会发送一份去除了个人数据的错误报告（不含音频和会议内容），以便我们修复问题；你可以在设置中关闭。我们靠付费套餐维持，而不是靠你的数据。" })}
${feature({ icon: "video", title: "无需机器人，无需账号", text: "不会有机器人加入你的会议，没有要安装的插件，也没有登录。付费套餐通过邮件发送的许可证密钥激活。" })}
${feature({ icon: "gauge", title: "数字都附带条件", text: "本网站上的每一个速度或质量数据都附有测量所用的机器和条件；没有测量过的，我们就说没有测量过。请参阅<a href=\"/zh/features/#performance\">功能和性能</a>。" })}
</div>
</div></section>

<section class="section" id="who"><div class="container narrow">
${sectionHead({ eyebrow: "开发者", title: "AI Translator 背后是谁？" })}
<div class="prose">
<p>AI Translator 由独立开发者 <strong>Đỗ Tiến Phong</strong> 开发和运营，从桌面应用到许可证服务器都是如此。本网站为简洁起见使用“我们”，但这是一个人的产品。</p>
<p>我们不在这里发布冗长的个人简历、用户评价或客户标志。我们只发布可以核实的内容：附带条件的测量数据、已知的限制和清楚的条款。问题、意见和错误报告请发送到 ${MAIL}。也可以查看<a href="/zh/contact/">联系页面</a>。</p>
</div>
</div></section>

<section class="section section-alt" id="status"><div class="container narrow">
${sectionHead({ eyebrow: "现状", title: "AI Translator 目前进展如何？" })}
<div class="table-wrap reveal" role="region" aria-label="AI Translator 的当前状态" tabindex="0"><table>
<thead><tr><th scope="col">方面</th><th scope="col">状态</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>macOS 14.2 或更高版本，Apple 芯片。<a href="/zh/download/#install-macos">在终端中用一行命令安装</a>。</td></tr>
<tr><th scope="row">Windows</th><td>Windows 10/11 64 位（x64）。<a href="/zh/download/#install-windows">在 PowerShell 中用一行命令安装</a>。Windows 上的延迟只在一台使用集成显卡的笔记本上做过初步测试（比 Mac M4 Pro 慢）。</td></tr>
<tr><th scope="row">代码签名</th><td>macOS 是临时签名，未经公证：用命令安装会直接打开，但用浏览器下载的 .dmg 在首次启动时需要“仍要打开”。Windows 还没有代码签名证书：用命令安装时 SmartScreen 不会询问，而用浏览器下载的 .exe 可能会收到警告（处于阻止模式的智能应用控制会阻止两者）（<a href="/zh/guide/install-windows/">怎么办</a>）。</td></tr>
<tr><th scope="row">付款</th><td>通过 PayOS 用 VND 进行 VietQR 支付，或通过 Creem 用国际银行卡以 USD 支付。VietQR 订单还没有越南电子发票；银行卡订单会收到 Creem 发送的收据。</td></tr>
<tr><th scope="row">套餐</th><td>免费试用 10 天、Monthly、6 Months、Yearly。请参阅<a href="/zh/pricing/">价格</a>。</td></tr>
</tbody></table></div>
</div></section>

<section class="section" id="under-consideration"><div class="container narrow">
${sectionHead({ eyebrow: "展望", title: "我们正在考虑的事" })}
${callout({ kind: "warn", title: "这不是承诺。", text: "下面列出的是我们为下一阶段考虑的事项。没有日期，也没有固定顺序，任何一项都可能根据用户反馈而改变或放弃。" })}
<div class="prose">
<ul>
<li>在字幕中区分不同的说话人</li>
<li>支持 Windows ARM64</li>
<li>在 Windows 上按应用采集音频</li>
<li>双向语音翻译，让你自己的声音也能被翻译给会议中的其他人</li>
<li>会议摘要和会议纪要</li>
<li>面向多台设备的企业套餐</li>
<li>为源音频和译文增加更多语言（目前五种之外）</li>
<li>更多界面语言</li>
</ul>
<p>先后顺序取决于用户反馈，所以请通过<a href="/zh/contact/">联系页面</a>告诉我们你最需要什么。</p>
</div>
</div></section>

<section class="section section-alt" id="technology"><div class="container narrow">
${sectionHead({ eyebrow: "许可", title: "第三方开源组件", text: "AI Translator 是商业产品，不开源：许可协议不允许复制、逆向工程或更换品牌。但它使用了许多第三方开源组件，我们会标明它们的来源。" })}
<p class="small muted">原始模型未经修改，与其许可证一起再分发。完整的组件和许可证列表在应用内的“关于 › 开源许可证”中。提到 Zoom、Microsoft Teams、Google Meet 和 Zalo 只是为了说明兼容性；AI Translator 与这些公司没有关联。</p>
</div></section>

<section class="section" id="legal"><div class="container narrow">
${sectionHead({ eyebrow: "法律信息", title: "简要法律信息" })}
<div class="reveal">${facts([
  ["提供方", "Đỗ Tiến Phong（个人）"],
  ["品牌", "AI Translator"],
  ["适用法律", "越南法律<small>争议由越南有管辖权的法院处理（使用条款第 14 条）</small>"],
  ["使用条款", `<a href="/en/terms/">许可协议（EULA，英文）</a><small><span lang="en">${legalVersionLine("eula.en.md")}</span></small>`],
  ["隐私", `<a href="/en/privacy/">隐私政策（英文）</a><small><span lang="en">${legalVersionLine("privacy.en.md")}</span></small>`],
  ["文本语言", "越南语版本为原文，以越南语版本为准<small>英文版本是供参考的译文；没有中文版本</small>"],
  ["个人数据相关联系", MAIL],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<h2 class="sr-only">继续阅读</h2>
<div class="grid grid-3">
${linkCard({ href: "/zh/features/", icon: "captions", title: "功能", text: "AI Translator 目前能做的事，与应用中的实际表现完全一致。", more: "查看功能" })}
${linkCard({ href: "/zh/data-security/", icon: "shield", title: "数据与安全", text: "什么留在你的电脑上，应用连接到哪里，我们的服务器保存什么。", more: "阅读详情" })}
${linkCard({ href: "/zh/pricing/", icon: "wallet", title: "价格", text: "免费试用 10 天，Monthly 50,000 ₫，6 Months 269,000 ₫，Yearly 500,000 ₫。", more: "查看价格" })}
</div>
</div></section>

${ctaBand({ title: "在真实会议中试试看", text: "在 macOS 或 Windows 上用一行命令安装，使用 10 天 Free 试用。无需银行卡，无需账号。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/contact/", label: "联系我们" } })}
`,
};
