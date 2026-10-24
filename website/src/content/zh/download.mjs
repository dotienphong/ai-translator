import { RELEASE } from "../../site.mjs";
import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq, cmdBlock, chips, flow, osTabs } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "下载", path: "/zh/download/" },
];

const mailto = (subject, body) =>
  `mailto:support@aitranslator.vn?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body.join("\n"))}`;

// 客服用英语或越南语回复，所以各项名称附上英文。
const MAILTO_MAC = mailto("AI Translator installer request (macOS)", [
  "AI Translator 团队你好 (Hello AI Translator team),",
  "",
  "我想获取 macOS 安装包（.dmg）。(I would like to receive the macOS installer.)",
  "",
  "- 姓名 (Full name):",
  "- Mac 型号和芯片（例如 MacBook Air M2）(Mac model and chip):",
  "- macOS 版本 (macOS version):",
  "- 内存 (RAM):",
  "- 打算用于（Zoom、Teams、Meet、Zalo、网络研讨会……）(I plan to use it with):",
  "- 需要翻译的语言（英语、中文、日语、韩语、越南语）(Languages I need translated):",
  "",
  "谢谢！(Thank you!)",
]);

const MAILTO_WIN = mailto("AI Translator installer request (Windows)", [
  "AI Translator 团队你好 (Hello AI Translator team),",
  "",
  "我想获取 Windows 安装包（.exe）。(I would like to receive the Windows installer.)",
  "",
  "- 姓名 (Full name):",
  "- 电脑型号和处理器（例如戴尔笔记本，Intel Core i5-1235U）(PC model and processor):",
  "- Windows 版本（10 或 11）(Windows version):",
  "- 内存 (RAM):",
  "- 显卡（如有）(Graphics card):",
  "- 打算用于（Zoom、Teams、Meet、Zalo、网络研讨会……）(I plan to use it with):",
  "- 需要翻译的语言（英语、中文、日语、韩语、越南语）(Languages I need translated):",
  "",
  "谢谢！(Thank you!)",
]);

const INSTALL_CMD = "curl -fsSL https://aitranslator.vn/install.sh | bash";
const INSTALL_CMD_BETA = "curl -fsSL https://aitranslator.vn/install.sh | bash -s -- --beta";
const INSTALL_CMD_REVIEW = "curl -fsSL https://aitranslator.vn/install.sh -o install.sh && less install.sh && bash install.sh";
const WIN_CMD = "irm https://aitranslator.vn/install.ps1 | iex";
const WIN_CMD_BETA = "& ([scriptblock]::Create((irm https://aitranslator.vn/install.ps1))) -Beta";
const WIN_CMD_REVIEW = "$s = irm https://aitranslator.vn/install.ps1; $s | more; iex $s";

const COPY = { copy: "复制", copied: "已复制" };

const DL_FAQ = [
  {
    q: "这一行命令做了什么？安全吗？",
    a: `<p>命令会从 <strong>aitranslator.vn</strong> 下载一个小脚本。脚本会检查你的电脑，读取最新版本号，从 <strong>releases.aitranslator.vn</strong> 下载安装包及其 SHA-256 校验值，核对校验值，然后安装并打开应用。它不发送任何数据，也不需要管理员权限。</p><p>运行从网上粘贴来的命令，总是意味着信任它的来源。如果你想在运行前先读一下脚本，请在你所用系统的指南中打开“我想先看看脚本”。SHA-256 校验值和文件来自同一个地方，所以它主要防止下载损坏，并不能代替对来源的信任。</p>`,
  },
  {
    q: "为什么没有 .dmg 或 .exe 下载按钮？",
    a: `<p>当前版本还没有获得 Apple 或 Microsoft 的签名（我们还没有 Apple Developer ID，也没有 Windows 代码签名证书）。用浏览器下载的文件会被标记为“从互联网下载”，所以 macOS 会在首次启动 .dmg 时阻止它（仍要打开），Windows SmartScreen 也可能对 .exe 发出警告。通过终端或 PowerShell 命令下载的文件不会带这个标记，所以应用会直接安装并打开。等我们拿到证书后，会加上直接下载按钮。</p>`,
  },
  {
    q: "如何更新或卸载？",
    a: `<p>应用会自己检查新版本（设置 › 通用）。你也可以随时运行同一条安装命令来安装最新版本；脚本会退出正在运行的应用并替换旧版本。卸载时，请先在应用内删除模型和数据，再删除应用；请参阅 <a href="/zh/guide/install-macos/#uninstall">macOS</a> 和 <a href="/zh/guide/install-windows/#uninstall">Windows</a> 的卸载指南。</p>`,
  },
  {
    q: "可以在 Intel 芯片的 Mac 上使用吗？",
    a: `<p>暂时不行。AI Translator 需要搭载 Apple 芯片（M1 或更新）的 Mac，以及 macOS 14.2 或更高版本。如果你的 Mac 不满足条件，安装命令会停止并告诉你原因。</p>`,
  },
  {
    q: "哪些 Windows 电脑可以运行？",
    a: `<p>Windows 10 或 11，64 位（x64），CPU 支持 AVX2，内存至少 8 GB。暂不支持 Windows ARM64。如果没有 AVX2 或内存不足 8 GB，应用会说明原因，并且不允许下载模型。Windows 上的延迟只在一台使用集成显卡的笔记本上做过初步测试，比 Mac M4 Pro 慢，所以我们不对此做任何承诺。</p>`,
  },
  {
    q: "应用会自动更新吗？",
    a: `<p>在“设置 › 通用 › 更新通道”下有稳定版和 Beta 两个更新通道。应用在启动时以及每 24 小时检查一次；切换通道会立即检查。要立即检查，请在“设置 › 通用”顶部的区块中，点击“版本 …”旁边的<strong>检查更新</strong>（每次检查后应用会显示“检查时间：HH:MM:SS”），或者从应用图标菜单中选择“检查更新…”。在 macOS 上，每次更新都会再次请求 1 次钥匙串授权；在 Windows 上不会额外询问。</p>`,
  },
];

const macPanel = () => `
${chips([["command", "macOS 14.2 或更高版本"], ["cpu", "Apple 芯片（M1 或更新）"], ["download", "安装包约 9 MB"], ["shield", "无需管理员密码"]])}
${flow([
  { title: "打开终端", text: "<p>按 <span class='nowrap'><kbd>⌘</kbd> + <kbd>Space</kbd></span>，输入<strong>终端</strong>，然后按 Enter。</p>" },
  {
    title: "粘贴这条命令并按 Enter",
    text: `<p>点击<strong>复制</strong>，然后用 <span class='nowrap'><kbd>⌘</kbd> + <kbd>V</kbd></span> 粘贴到终端。</p>${cmdBlock({ cmd: INSTALL_CMD, ...COPY, label: "在 macOS 上安装 AI Translator 的命令", term: "Terminal" })}<p class="small">不需要密码。随时再次运行同一条命令即可更新到最新版本。</p>`,
  },
  { title: "等待应用打开", text: "<p>大约一分钟：命令会下载最新版本，校验 SHA-256，把 AI Translator 复制到“应用程序”并打开。第一次点击<strong>开始</strong>时，macOS 会请求录制系统音频的权限：请选择“允许”。</p>" },
])}
<div class="panel-more">
<h3>选项和故障排除</h3>
${faq(
  [
    {
      q: "为什么没有“仍要打开”这一步？",
      a: "<p>macOS 版还没有经过 Apple 公证（我们还没有 Apple Developer ID），所以用浏览器下载的 .dmg 在首次启动时会被 macOS 阻止。通过终端命令下载的文件不会被 macOS 标记为“从互联网下载”，所以应用会直接打开。代价是你需要信任命令的来源：请看下面的问题。</p>",
    },
    {
      q: "我想先看看脚本",
      a: `<p>脚本在 <a href="/install.sh">aitranslator.vn/install.sh</a>（约 200 行，带注释）。下面这条命令会先下载脚本让你阅读，然后才运行它：</p>${cmdBlock({ cmd: INSTALL_CMD_REVIEW, ...COPY, label: "下载脚本以便运行前查看的命令", term: "Terminal" })}`,
    },
    {
      q: "提前试用新版本（Beta 通道）",
      a: `<p>默认情况下，命令安装的是稳定版。如果想在有新版本时提前试用（Beta 通道），请在 <code>bash</code> 后面加上 <code>-s -- --beta</code>：</p>${cmdBlock({ cmd: INSTALL_CMD_BETA, ...COPY, label: "从 Beta 通道安装的命令", term: "Terminal" })}`,
    },
    {
      q: "我用浏览器下载了 .dmg，被 macOS 阻止了",
      a: "<p>最快的办法是运行上面的安装命令：它会直接覆盖安装最新版本，应用会直接打开。也可以手动允许：打开<strong>系统设置 › 隐私与安全性</strong>，滚动到底部，点击 AI Translator 旁边的<strong>仍要打开</strong>，再用密码或触控 ID 确认。请参阅 <a href=\"/zh/guide/install-macos/\">macOS 安装指南</a>。</p>",
    },
    {
      q: "每次更新后 macOS 会询问什么？",
      a: "<p>临时签名（ad-hoc）的版本每次发布后签名都会变化，所以 macOS 会再次请求钥匙串访问权限：<strong>1 个对话框</strong>要求输入你的 Mac 登录密码（请选择<strong>始终允许</strong>），录制系统音频的权限也可能会再询问一次。首次安装的人完全不会看到钥匙串对话框。只有从 0.1.0 到 0.1.1 的第一次更新会询问 5 次，且只有这一次。</p>",
    },
    {
      q: "我想通过邮件获取 .dmg",
      a: `<p>给 <a href="${MAILTO_MAC}">support@aitranslator.vn</a> 发一封简短的邮件；我们会回复 .dmg 及其 SHA-256 校验值。用浏览器下载的 .dmg 在首次启动时需要“仍要打开”这一步。</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>想要分步说明，包括如何卸载？</p><a class="btn btn-secondary btn-sm" href="/zh/guide/install-macos/">完整的 macOS 指南 ${icon("arrow-right")}</a></div>
`;

const winPanel = () => `
${chips([["windows", "Windows 10 或 11，64 位"], ["cpu", "支持 AVX2 的 CPU"], ["download", "安装包约 22 MB"], ["shield", "无需管理员权限"]])}
${flow([
  { title: "打开 PowerShell", text: "<p>按 <kbd>Windows</kbd> 键，输入 <strong>PowerShell</strong>，然后按 Enter。不需要以管理员身份运行。</p>" },
  {
    title: "粘贴这条命令并按 Enter",
    text: `<p>点击<strong>复制</strong>，然后粘贴到 PowerShell 中（右键单击或 <span class='nowrap'><kbd>Ctrl</kbd> + <kbd>V</kbd></span>）。</p>${cmdBlock({ cmd: WIN_CMD, ...COPY, label: "在 Windows 上安装 AI Translator 的命令", term: "Windows PowerShell", prompt: "PS>" })}<p class="small">随时再次运行同一条命令即可更新到最新版本（安装程序会关闭正在运行的应用并替换旧版本）。</p>`,
  },
  { title: "等待应用打开", text: "<p>大约一分钟：命令会下载最新版本，校验 SHA-256，只为你的账户静默运行安装程序，然后打开 AI Translator。Windows 不需要录音权限；应用会下载一次模型，之后即可开始翻译。</p>" },
])}
<div class="panel-more">
<h3>选项和故障排除</h3>
${faq(
  [
    {
      q: "为什么没有 SmartScreen 警告？",
      a: "<p>Windows 版还没有代码签名（我们还没有购买 Windows 代码签名证书）。SmartScreen 只检查被标记为“从互联网下载”的文件，而这个标记是浏览器下载文件时加上的。通过 PowerShell 下载的文件没有这个标记，所以安装程序会直接运行。你仍然需要信任命令的来源：请看下面的问题。</p>",
    },
    {
      q: "我想先看看脚本",
      a: `<p>脚本在 <a href="/install.ps1">aitranslator.vn/install.ps1</a>（带注释）。下面这条命令会先把脚本显示出来让你阅读，然后才运行它：</p>${cmdBlock({ cmd: WIN_CMD_REVIEW, ...COPY, label: "显示脚本以便运行前查看的命令", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "提前试用新版本（Beta 通道）",
      a: `<p>默认情况下，命令安装的是稳定版。如果想在有新版本时提前试用（Beta 通道），请使用这条命令：</p>${cmdBlock({ cmd: WIN_CMD_BETA, ...COPY, label: "在 Windows 上从 Beta 通道安装的命令", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "Windows 11 提示应用已被阻止，而且没有办法继续",
      a: "<p>这是<strong>智能应用控制</strong>。在阻止模式下，无论如何安装，它都不允许没有签名、没有信誉的应用运行。你可以关闭它：打开<strong>Windows 安全中心 › 应用和浏览器控制 › 智能应用控制设置</strong>，选择<strong>关闭</strong>，然后再次运行安装命令。等我们拿到 Windows 代码签名证书后，就不会再有这个问题。<a href=\"/zh/guide/install-windows/#smart-app-control\">详情</a>。</p>",
    },
    {
      q: "我用浏览器下载了 .exe，SmartScreen 发出了警告",
      a: "<p>对于没有签名的版本，出现蓝色的“Windows 已保护你的电脑”界面是正常的。如果文件是我们提供的，并且 SHA-256 一致，请点击<strong>更多信息</strong>，确认“应用”一行显示的是安装程序的文件名，然后点击<strong>仍要运行</strong>。或者运行上面的安装命令：它会绕过 SmartScreen 安装最新版本。<a href=\"/zh/guide/install-windows/\">请查看分步指南</a>。</p>",
    },
    {
      q: "在公司或学校的电脑上命令运行失败",
      a: "<p>受管理的电脑可能会阻止 PowerShell 脚本（受约束的语言模式）。请使用 .exe（我们可以通过邮件发送给你），或者咨询管理员。</p>",
    },
    {
      q: "我想通过邮件获取 .exe",
      a: `<p>给 <a href="${MAILTO_WIN}">support@aitranslator.vn</a> 发一封简短的邮件；我们会回复 .exe 及其 SHA-256 校验值。用浏览器下载的 .exe 可能会触发 SmartScreen 警告。</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>想要分步说明，包括如何卸载？</p><a class="btn btn-secondary btn-sm" href="/zh/guide/install-windows/">完整的 Windows 指南 ${icon("arrow-right")}</a></div>
`;

export default {
  id: "download",
  lang: "zh",
  path: "/zh/download/",
  title: "下载 macOS 和 Windows 版",
  description:
    "在 macOS 14.2+（Apple 芯片）或 Windows 10/11 上用一行命令安装 AI Translator，安装后直接打开，无需“仍要打开”。免费试用 10 天。",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-24",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "获取 macOS 和 Windows 版 AI Translator",
  lead: "选择你的系统，把一行命令粘贴到终端或 PowerShell：应用会被下载、校验并立即打开。免费试用 10 天，无需银行卡。",
  meta: '<span id="os-detect" class="os-detect" hidden></span>',
})}

<section class="section-tight" id="install"><div class="container dl">
${osTabs({
  labels: {
    list: "选择你的操作系统",
    mine: "你的电脑",
    detected: "检测到你正在使用 {os}",
    mobile: "你正在手机或平板上浏览。AI Translator 运行在 macOS 或 Windows 电脑上：请在电脑上打开此页面。",
    other: "AI Translator 目前只支持 macOS 和 Windows，不支持这台电脑的操作系统。你仍然可以阅读下面的两份指南。",
    copyLink: "复制页面链接",
    copied: "已复制",
  },
  tabs: [
    { key: "macos", id: "install-macos", icon: "command", title: "macOS", sub: "Apple 芯片 · 14.2+", body: macPanel() },
    { key: "windows", id: "install-windows", icon: "windows", title: "Windows", sub: "10 / 11 · 64 位", body: winPanel() },
  ],
})}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "概览", title: "免费试用和价格", center: true })}
<div class="reveal">${facts([
  ["当前版本", RELEASE.zh],
  ["状态", "已发布。macOS 和 Windows 都只需一行命令即可安装"],
  ["免费试用", "10 天，每天 30 分钟<small>无需银行卡，无需账号</small>"],
  ["之后的价格", "Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>通过 VietQR（VND）或国际银行卡（USD）预付，不自动续费。根据 Creem 的名单，部分国家不支持银行卡付款。</small>"],
  ["模型", "只需下载一次，1.3 GB 或 2.5 GB<small>之后识别和翻译都在你的电脑上离线运行</small>"],
])}</div>
${callout({ kind: "ok", title: "只从我们这里获取安装包", text: "请只用本页面上的命令，或通过 <strong>support@aitranslator.vn</strong> 发送的链接、网站 <strong>aitranslator.vn</strong> 安装 AI Translator。来自其他渠道的安装包可能是假的。" })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "系统要求", title: "你的电脑能运行吗？", center: true })}
<div class="table-wrap reveal" role="region" aria-label="系统要求" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">要求</span></th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">操作系统</th><td>macOS 14.2 或更高版本</td><td>Windows 10 或 11，64 位（x64）</td></tr>
<tr><th scope="row">处理器</th><td>Apple 芯片（M1 或更新）。没有 Intel Mac 版本</td><td>支持 AVX2 的 CPU。暂不支持 Windows ARM64</td></tr>
<tr><th scope="row">内存</th><td>至少 8 GB，建议 16 GB</td><td>至少 8 GB，建议 16 GB</td></tr>
<tr><th scope="row">显卡</th><td>Apple GPU</td><td>Standard 模型包建议使用 6 GB 或以上显存的独立显卡；没有则在 CPU 上运行</td></tr>
<tr><th scope="row">磁盘空间</th><td>1.3 GB（Lite 模型包）或 2.5 GB（Standard 模型包），下载时另需 1 GB 可用空间</td><td>相同</td></tr>
<tr><th scope="row">安装包</th><td>约 9 MB 的 .dmg 文件（安装命令会替你下载）</td><td>约 22 MB 的 .exe 文件，只为你的账户安装，无需管理员权限</td></tr>
<tr><th scope="row">代码签名</th><td>临时签名，未经公证：用命令安装会直接打开；用浏览器下载的 .dmg 首次启动时需要“仍要打开”</td><td>没有代码签名：用命令安装时 SmartScreen 不会询问；用浏览器下载的 .exe 可能会收到警告；处于阻止模式的智能应用控制会阻止它</td></tr>
<tr><th scope="row">权限</th><td>录制系统音频；选择含麦克风的采集来源时还需要麦克风权限</td><td>不需要录音权限；含麦克风的采集来源需要 Windows 允许应用使用麦克风</td></tr>
</tbody></table></div>
<p class="small muted">如果电脑内存不足 8 GB，或处理器不支持 AVX2，应用会说明原因，并且不允许下载模型。没有 Intel Mac 版本。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "常见问题", title: "关于安装" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "准备在下一次会议上试试吗？", text: "Mac 和 Windows 都只需一行命令。免费试用 10 天，无需银行卡。", primary: { href: "#install", label: "选择系统并安装" }, secondary: { href: "/zh/guide/quick-start/", label: "阅读快速入门指南" } })}
`,
};
void feature;
void steps;
