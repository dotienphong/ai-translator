import { pageHero, ctaBand, callout, faq, docLayout } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

// 没有 /compare/ 索引页，所以面包屑只有两级（中间一级的链接会失效）。
const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "离线翻译与云端翻译", path: "/zh/compare/offline-vs-cloud-translation/" },
];

export const COMPARE_FAQ = [
  {
    q: "离线翻译和云端翻译一样准确吗？",
    a: "<p>我们没有直接比较两者的测量数据，所以不下结论。质量取决于模型、语言对以及音频是否清晰。我们自己的内部测试只比较了开源模型之间的表现，没有与任何云服务比较。</p>",
  },
  {
    q: "离线翻译真的不需要联网吗？",
    a: "<p>翻译时不需要。第一次下载模型、开始试用、购买套餐、验证许可证（付费套餐在两次验证之间最多可离线使用 14 天）以及更新应用时需要联网。</p>",
  },
  {
    q: "离线翻译适合敏感会议吗？",
    a: "<p>音频从不离开你的电脑，所以没有第三方处理它。但整体安全还取决于你的电脑和你所在机构的规定，请咨询你的安全团队。应用不会录制会议，转写历史记录默认关闭。</p>",
  },
  {
    q: "离线翻译需要什么样的电脑？",
    a: "<p>至少 8 GB 内存（建议 16 GB）、搭载 macOS 14.2 或更高版本的 Apple 芯片 Mac，以及约 1.3 GB（Lite 模型包）或 2.5 GB（Standard 模型包）的磁盘空间用于存放模型。Windows 版需要 Windows 10/11 64 位（x64），且 CPU 支持 AVX2；不支持 Intel Mac 和 Windows ARM64。</p>",
  },
  {
    q: "离线翻译能把我的声音翻译给其他人吗？",
    a: "<p>暂时不能。AI Translator 的字幕是单向的，把电脑上播放的音频翻译成你的语言；它不会翻译你的声音给别人听。如需用文字回复，请使用<a href=\"/zh/guide/type-and-translate/\">输入翻译</a>：你用自己的语言输入，应用会把译文粘贴到聊天框中，同样在你的电脑上完成。</p>",
  },
];

const toc = [
  { level: 2, id: "comparison-table", text: "对比表" },
  { level: 2, id: "privacy", text: "隐私" },
  { level: 2, id: "internet-and-bots", text: "网络和机器人" },
  { level: 2, id: "cost", text: "成本" },
  { level: 2, id: "latency-hardware-languages", text: "延迟、硬件、语言" },
  { level: 2, id: "updates-integration", text: "更新和集成" },
  { level: 2, id: "which-to-choose", text: "如何选择" },
  { level: 2, id: "faq", text: "常见问题" },
];

export default {
  id: "compare-offline-cloud",
  lang: "zh",
  path: "/zh/compare/offline-vs-cloud-translation/",
  title: "会议翻译：离线与云端的区别",
  description:
    "客观比较离线和云端会议翻译：隐私、网络、机器人、成本、延迟、硬件、语言，以及什么情况下该选哪种方式。",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  schema: [faqPage(COMPARE_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "离线翻译和云端翻译有什么区别？",
  lead: "云端翻译把你的音频发送到服务商的服务器上处理；离线翻译则在你自己的电脑上处理，AI Translator 就是这样做的。离线翻译让音频留在你的电脑上，没有网络也能继续工作，也不需要机器人，但需要性能足够的电脑，目前支持 5 种语言。云端翻译对电脑要求低，通常支持更多语言，还能内置在会议平台中，但你的音频必须离开你的电脑。",
  meta: "<span>更新于 {{updated}}</span>",
})}

<section class="section"><div class="container">
${docLayout({
  toc,
  tocTitle: "本页内容",
  body: `
<h2 id="comparison-table">对比表</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">标准</th><th scope="col">云端翻译</th><th scope="col">离线翻译（AI Translator）</th></tr></thead>
<tbody>
<tr><th scope="row">AI 模型在哪里运行</th><td>服务商的云端</td><td>你的电脑上</td></tr>
<tr><th scope="row">音频在哪里处理</th><td>服务商的服务器上</td><td>你的电脑上</td></tr>
<tr><th scope="row">音频会离开你的电脑吗？</th><td>会</td><td>不会，留在内存中</td></tr>
<tr><th scope="row">翻译时需要联网</th><td>需要</td><td>不需要</td></tr>
<tr><th scope="row">机器人或插件</th><td>内置功能不需要；第三方工具可能需要</td><td>不需要，适用于任何能播放声音的应用</td></tr>
<tr><th scope="row">多翻译一分钟的成本</th><td>占用服务商的服务器资源</td><td>不占用服务商的基础设施，使用的是你的电脑</td></tr>
<tr><th scope="row">延迟</th><td>取决于你的网络和服务器负载</td><td>取决于你的硬件</td></tr>
<tr><th scope="row">语言数量</th><td>通常更多</td><td>5 种语言</td></tr>
<tr><th scope="row">电脑要求</th><td>低</td><td>8 GB 内存起，模型下载 1.3–2.5 GB</td></tr>
<tr><th scope="row">模型更新</th><td>服务商负责更新，你立即获得</td><td>由你下载新模型；应用会先询问</td></tr>
<tr><th scope="row">集成</th><td>内置在会议平台中</td><td>独立的应用，有自己的字幕条</td></tr>
</tbody></table></div>

<h2 id="privacy">隐私以及在哪里处理</h2>
<p>使用云端翻译时，你的音频会发送到服务商的服务器。许多服务商有合同和安全认证，所以云端并不一定就更不安全，但你必须信任他们的政策，并对照你所在机构的规定来权衡。</p>
<p>使用 AI Translator 时，语音识别和翻译在你的电脑上运行：音频留在内存中，不写入磁盘，也不发送到任何地方。在 macOS 上用代理检查的结果显示，翻译期间没有任何音频或转写文字离开电脑。请参阅<a href="/zh/data-security/">数据与安全</a>。</p>

<h2 id="internet-and-bots">网络、机器人和会议主持人</h2>
<p>云端翻译在会议期间需要稳定的网络。AI Translator 在网络不稳定或断开时仍会继续翻译。它只在下载模型、开始试用、激活、购买套餐、验证许可证（付费套餐至少每 14 天需要验证一次）和更新时才需要联网，所以完全与互联网隔离的网络并不适合。</p>
<p>内置字幕可能需要主持人或管理员开启，第三方工具可能需要让机器人加入会议室。AI Translator 在你这一端运行，所以谁都不需要做任何事；相应地，其他参会者也不会收到通知。如果规定有要求，请你自己告知他们（见<a href="/zh/solutions/online-meeting-translation/">在线会议解决方案</a>）。</p>

<h2 id="cost">成本和翻译时长</h2>
<p>使用云端时，每一分钟的翻译都会占用服务商的服务器资源。大型会议平台内置的翻译字幕通常只在较高级的付费套餐中提供。使用离线翻译时，计算在你的电脑上进行，所以多翻译一分钟不会给我们增加额外的基础设施成本。AI Translator 的翻译时长额度（试用期间每天 30 分钟，Monthly 每 30 天 50 小时，6 Months 每 30 天 100 小时，Yearly 不限时长）是定价策略，而不是技术限制。</p>
<p>成本转移到了你的电脑上：内存、磁盘和电量（我们没有测量耗电情况）。请参阅<a href="/zh/pricing/">价格</a>。</p>

<h2 id="latency-hardware-languages">延迟、硬件要求和语言</h2>
<p>云端把繁重的工作交给服务器，所以在性能较弱的电脑上也能运行，但延迟也取决于你的网络。离线翻译需要性能足够的电脑：AI Translator 需要至少 8 GB 内存（建议 16 GB）、搭载 macOS 14.2 或更高版本的 Apple 芯片 Mac（或者 Windows 10/11 64 位、CPU 支持 AVX2），以及一次性下载 1.3 GB（Lite）或 2.5 GB（Standard）的模型。</p>
<p>在 Mac M4 Pro 上使用 Standard 模型包，延迟中位数为 0.76–1.03 秒。性能较弱的电脑延迟会更高；我们没有在 M1 Mac 上测量过。云服务支持的语言通常多于 AI Translator 的 5 种语言（英语、中文、日语、韩语、越南语）。由于没有共同的测量标准，我们不比较翻译质量。</p>

<h2 id="updates-integration">模型更新和集成</h2>
<p>云服务由服务商在服务器上更新，所以你不需要做任何事就能获得改进。离线模型在你下载新模型之前会保持原样；应用在下载前会先询问你。</p>
<p>在集成方面，如果大家都使用同一个平台，而且你的套餐已经包含这项功能，那么会议平台内置的翻译字幕会更方便：不需要额外安装，也不需要摆放窗口。AI Translator 是一个独立的应用，有自己的字幕条；作为交换，它适用于任何会议应用、网络研讨会或视频。</p>

<h2 id="which-to-choose">应该选择哪一种？</h2>
<h3>以下情况更适合云端</h3>
<ul>
<li>你需要 AI Translator 5 种语言以外的语言</li>
<li>你的电脑性能较弱、内存不足 8 GB，或者你不想下载模型</li>
<li>你的会议平台套餐已经包含翻译字幕，而且大家都在用</li>
</ul>
<h3>以下情况更适合 AI Translator（离线）</h3>
<ul>
<li>由于内容敏感或内部规定，音频不能离开你的电脑</li>
<li>你的网络不稳定或经常断开（应用仍需要偶尔联网来验证许可证）</li>
<li>你在多个不同的应用上开会，或者观看网络研讨会和视频</li>
<li>你的平台套餐没有翻译字幕，而你也不想让机器人进入会议室</li>
</ul>
${callout({ title: "两者并不互斥。", text: "在有内置字幕的地方使用内置字幕，在其他会议和视频中使用 AI Translator。请参阅<a href=\"/zh/features/\">功能</a>和<a href=\"/zh/guide/quick-start/\">快速入门指南</a>。" })}

<h2 id="faq">常见问题</h2>
${faq(COMPARE_FAQ)}
`,
})}
</div></section>

${ctaBand({ title: "在你自己的会议上试试离线翻译", text: "从 10 天免费试用开始，每天 30 分钟。无需银行卡，无需账户。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/data-security/", label: "我们如何处理数据" } })}
`,
};
