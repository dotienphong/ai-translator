import { pageHero, faq, keys, appShot, docLayout, docNav } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "故障排除", path: "/zh/guide/troubleshooting/" },
];

const toc = [
  { level: 2, id: "no-audio", text: "没有字幕或听不到声音" },
  { level: 2, id: "slow-or-stopped", text: "字幕延迟、缺失或停止" },
  { level: 2, id: "models-macos", text: "模型、安装、macOS 和 Windows" },
  { level: 2, id: "license-quota", text: "许可证、翻译时长和试用" },
  { level: 2, id: "type-and-translate", text: "输入翻译" },
  { level: 2, id: "send-logs", text: "发送日志并报告问题" },
  { level: 2, id: "quick-answers", text: "快速解答" },
];

const QUICK = [
  {
    q: "我关闭了窗口，但应用还在运行。怎么退出？",
    a: "<p>关闭窗口只会把应用隐藏到菜单栏（macOS）或系统托盘（Windows）中。请从菜单栏或托盘中的 AI Translator 图标选择<strong>退出</strong>；在 Mac 上，⌘Q 不会退出它。</p>",
  },
  {
    q: "重新安装应用会丢失密钥或重新开始 10 天试用吗？",
    a: "<p>不会。在同一台电脑上重新安装不算新电脑，而 10 天试用是按电脑记录的，所以无法重新开始。</p>",
  },
  {
    q: "日志会泄露我会议中说过的内容吗？",
    a: "<p>不会。日志不含音频，也不含转写文字。应用出错时，会把日志中相关的部分发给我们，并去除个人文件夹路径、密钥、令牌和邮箱地址；你可以在“设置 › 隐私”中关闭这项功能。</p>",
  },
];

export default {
  id: "guide-troubleshooting",
  lang: "zh",
  path: "/zh/guide/troubleshooting/",
  title: "故障排除：常见错误及解决方法",
  description:
    "AI Translator 的症状、原因和解决方法：没有字幕、听不到声音、模型下载出错、密钥被锁定、翻译时长用完。以及如何把日志发送给客服。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [faqPage(QUICK.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "故障排除",
  lead: "AI Translator 的大多数问题可以分为四类：录音权限、音频来源、模型和许可证。在下面的表格中找到与应用显示完全一致的消息，按照解决方法操作；如果仍然不行，请把日志发送给客服。",
  meta: `<span>更新于 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本页内容",
  body: `
<h2 id="no-audio">没有字幕，或者听不到声音</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“有应用正在发声，却什么也没听到：AI Translator 可能没有被允许录制系统音频。”</span><p><strong>原因：</strong>macOS 没有授予权限，而且不会报错：应用收到的只是静音。</p><p><strong>解决方法：</strong>点击<strong>打开系统设置</strong>，在“隐私与安全性 › 屏幕与系统音频录制 › 仅系统音频录制”中开启 AI Translator，然后再次点击<strong>开始</strong>。请参阅<a href="/zh/guide/macos-audio-permission/">音频权限指南</a>。Windows 没有这项权限：如果听不到声音，请检查“设置 › 音频”中选择的播放设备。</p></div>
<div class="card"><span class="card-title">“没有听到声音。请检查会议声音是否在播放。”或“无法采集音频。”</span><p><strong>原因：</strong>没有在播放任何声音、音频来源不对，或者应用无法打开音频来源。</p><p><strong>解决方法：</strong>打开会议声音。在“设置 › 音频”中点击<strong>刷新列表</strong>，重新选择音频来源，然后再次点击<strong>开始</strong>。如果问题持续，请发送日志。</p></div>
<div class="card"><span class="card-title">“所选应用没有发声”</span><p><strong>原因：</strong>你选择了<strong>仅 {应用名称}</strong>，而那个应用没有声音。</p><p><strong>解决方法：</strong>让那个应用发出声音（翻译会立即恢复），或者选择<strong>整个系统（本应用除外）</strong>（从下一个会话开始生效）。</p></div>
<div class="card"><span class="card-title">看不到字幕条</span><p><strong>原因：</strong>打开应用时，字幕条在你点击“开始”之前是隐藏的；或者你用快捷键或 ✕ 按钮隐藏了它（✕ 按钮还会停止翻译）。</p><p><strong>解决方法：</strong>如果你点了 ✕，点击<strong>开始</strong>再次翻译，字幕条就会回来。否则，在主页的<strong>字幕条</strong>下点击<strong>显示</strong>；或按 ${keys(["⌃", "⌥", "H"])}（Windows：${keys(["Ctrl", "Alt", "H"])}）；或在菜单栏或托盘菜单中选择“显示字幕”。如果已锁定，用 ${keys(["⌃", "⌥", "L"])}（Windows：${keys(["Ctrl", "Alt", "L"])}）解锁。</p></div>
<div class="card"><span class="card-title">“有快捷键未能注册。请打开“设置 › 快捷键”更改。”</span><p><strong>原因：</strong>其他应用已经占用了这个组合键。</p><p><strong>解决方法：</strong>在“设置 › 快捷键”中点击<strong>更改</strong>，然后按下一个新的组合键，至少包含 Ctrl、Alt 或 Cmd/Win 中的一个（只有 Shift 是不够的）。</p></div>
</div>

<h2 id="slow-or-stopped">字幕延迟、缺失或停止</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“处理跟不上”；“正在使用 CPU 运行（速度较慢）。”；“这台电脑内存不足，建议使用 Lite 模型包。”</span><p><strong>原因：</strong>电脑跟不上语音的速度，或者 GPU 出错，应用改用了 CPU。</p><p><strong>解决方法：</strong>关闭占用资源多的应用。在“设置 › 模型”中选择 Lite 模型包并点击<strong>使用此模型包</strong>（如果还没下载，请点击<strong>下载并使用</strong>）；新的模型包从下一个会话开始使用。</p></div>
<div class="card"><span class="card-title">“翻译不可用：仅显示原文”；“翻译因出错而停止。请打开主窗口查看详情。”；“语音识别已停止工作。…”</span><p><strong>原因：</strong>翻译或语音识别出错了。应用会自动重启它们；如果 10 分钟内失败超过 5 次，就会停止翻译。</p><p><strong>解决方法：</strong>点击<strong>停止</strong>，然后点击<strong>开始</strong>。如果应用提示某个部分缺失或损坏，请重新安装 AI Translator。如果反复出现，请发送日志。</p></div>
</div>

<h2 id="models-macos">模型、安装、macOS 和 Windows</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“无法连接模型服务器。请检查网络连接后重试。”</span><p><strong>原因：</strong>没有网络连接，或者网络阻止了下载。</p><p><strong>解决方法：</strong>检查网络，然后点击<strong>重试</strong>。</p></div>
<div class="card"><span class="card-title">“下载没有完成。点击“继续”可从中断处接着下载。”或“下载的文件已损坏。…”</span><p><strong>原因：</strong>网络连接中断，或者某个文件没有通过完整性检查。</p><p><strong>解决方法：</strong>点击<strong>继续</strong>。如果应用显示“模型已损坏。请重新下载。”，请在“设置 › 模型”中点击<strong>检查并重新下载</strong>。</p></div>
<div class="card"><span class="card-title">“磁盘可用空间不足。…”或“无法把模型文件写入磁盘。”</span><p><strong>原因：</strong>磁盘需要下载大小再加 1 GB 的可用空间（Standard 约 2.5 GB，Lite 约 1.3 GB）。</p><p><strong>解决方法：</strong>释放磁盘空间，或者选择 Lite 模型包。</p></div>
<div class="card"><span class="card-title">“这台电脑不满足最低要求，所以无法下载模型。”</span><p><strong>原因：</strong>低于最低要求：搭载 Apple 芯片、8 GB 内存的 Mac，或 8 GB 内存、CPU 支持 AVX2 的 Windows 10/11 x64 电脑。应用会说明原因，例如“这台电脑的处理器缺少 AI Translator 所需的 AVX2，…”。</p><p><strong>解决方法：</strong>使用满足要求的电脑。要求请参阅<a href="/zh/download/">下载页面</a>。</p></div>
<div class="card"><span class="card-title">第一次打开应用时，macOS 提示无法验证开发者</span><p><strong>原因：</strong>你是从在浏览器中下载的 .dmg 打开应用的，而 macOS 版是临时签名，还没有经过 Apple 公证。</p><p><strong>解决方法：</strong>最快的方法是在<a href="/zh/download/#install-macos">终端中再次运行安装命令</a>（应用会直接打开）。也可以点击<strong>完成</strong>，打开“系统设置 › 隐私与安全性”，滚动到底部，点击 AI Translator 旁边的<strong>仍要打开</strong>。请参阅<a href="/zh/guide/install-macos/">在 macOS 上安装</a>。</p></div>
<div class="card"><span class="card-title">更新后 macOS 要求输入登录密码</span><p><strong>原因：</strong>对于临时签名的版本，这是正常的：每次更新会出现 1 个钥匙串对话框（从 0.1.0 到 0.1.1 的第一次更新为 5 个），还可能请求一次录音权限。</p><p><strong>解决方法：</strong>输入密码，点击<strong>始终允许</strong>，并允许录音权限。</p></div>
<div class="card"><span class="card-title">打开安装程序时，Windows 显示“Windows 已保护你的电脑”</span><p><strong>原因：</strong>你打开的是在浏览器中下载的 .exe，而 Windows 版还没有代码签名，所以 Microsoft Defender SmartScreen 可能会阻止它。</p><p><strong>解决方法：</strong>最快的方法是在 <a href="/zh/download/#install-windows">PowerShell 中再次运行安装命令</a>（不会出现 SmartScreen）。也可以核对 SHA-256，点击<strong>更多信息</strong>，确认“应用”一行显示的是安装程序的文件名，然后点击<strong>仍要运行</strong>。如果没有“仍要运行”按钮，可能是电脑上的策略阻止了它：请询问管理这台电脑的人。请参阅<a href="/zh/guide/install-windows/">在 Windows 上安装</a>。</p></div>
<div class="card"><span class="card-title">杀毒软件阻止或删除了 Windows 安装程序</span><p><strong>原因：</strong>安装程序没有代码签名，下载量也还不大，所以有些产品会认为它可疑。</p><p><strong>解决方法：</strong>请再次核对 SHA-256。如果一致但安装程序仍被阻止，请<a href="/zh/contact/">联系客服</a>，并告诉我们你使用的杀毒软件。</p></div>
</div>

<h2 id="license-quota">许可证、翻译时长和试用</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“翻译时间已用完 · … 重置”</span><p><strong>原因：</strong>你已用完今天的 30 分钟（Free），或本周期的小时数（Monthly：50 小时，6 Months：100 小时）。</p><p><strong>解决方法：</strong>等到屏幕上显示的重置时间，或者<a href="/zh/guide/buy-and-activate/">续订或更换套餐</a>。</p></div>
<div class="card"><span class="card-title">“10 天试用已结束”</span><p><strong>原因：</strong>Free 是每台电脑 10 天的试用；重新安装不会重新开始。</p><p><strong>解决方法：</strong>购买 Monthly、6 Months 或 Yearly 以继续翻译。</p></div>
<div class="card"><span class="card-title">“请联网一次以开始免费试用”或“套餐已有 14 天无法检查，因此使用 Free。请联网。”</span><p><strong>原因：</strong>没有网络，无法登记试用；或者付费套餐超过 14 天没有进行许可证检查。</p><p><strong>解决方法：</strong>联网。如果这台电脑还没有登记试用，请再次点击<strong>开始</strong>，让应用完成登记。如果是付费套餐，请在“设置 › 许可证”中点击<strong>立即检查</strong>。</p></div>
<div class="card"><span class="card-title">“此密钥正在 2 台电脑上使用，因此已被锁定。…”</span><p><strong>原因：</strong>这个密钥被两台电脑占用。</p><p><strong>解决方法：</strong>从其中一台电脑上移除密钥，然后点击<strong>重试</strong>：请参阅<a href="/zh/guide/buy-and-activate/#switch-computers">如何更换电脑</a>。</p></div>
<div class="card"><span class="card-title">“电脑时钟似乎不对。请设置正确的时间后重试。”或“这台电脑的时钟被调回过。…”</span><p><strong>原因：</strong>系统时钟被往回调了。</p><p><strong>解决方法：</strong>设置正确的时间（最好设为自动），并联网让应用检查。</p></div>
<div class="card"><span class="card-title">“此密钥无效。…”；“由于更换电脑过于频繁，此密钥被暂时锁定。…”；“这份 AI Translator 不是正版，…”</span><p><strong>原因：</strong>密钥输错；更换电脑次数过多；或者使用的不是官方安装包。</p><p><strong>解决方法：</strong>重新粘贴邮件中的密钥；密钥被锁定时请联系客服；从我们发给你的链接或 aitranslator.io.vn 重新下载官方版本。</p></div>
</div>

<h2 id="type-and-translate">输入翻译</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">按 ⌃⌥G（Ctrl+Alt+G）打不开输入框</span><p><strong>原因：</strong>输入翻译已关闭，或者其他应用占用了这个快捷键。</p><p><strong>解决方法：</strong>在“设置 › 输入翻译”中开启它。在 Windows 上，如果“设置 › 快捷键”显示快捷键未能注册，请换一个；在 macOS 上，如果其他应用也使用 ⌃⌥G，请更改其中一个的快捷键。</p></div>
<div class="card"><span class="card-title">“译文已复制。若要让 AI Translator 自动粘贴，请在“辅助功能”中允许它。”</span><p><strong>原因：</strong>macOS 没有给 AI Translator 辅助功能权限，或者应用更新后权限失效了。</p><p><strong>解决方法：</strong>这次先在聊天框中按 ⌘V 粘贴。要让应用替你粘贴，请点击<strong>开启自动粘贴</strong>，并在“辅助功能”中开启 AI Translator。如果已经开启但应用仍然询问（常见于应用更新后）：从 0.1.14 版开始，<strong>开启自动粘贴</strong>按钮会自行清除旧的授权，你只需再开启一次；在更早的版本上，请把 AI Translator 从列表中移除（− 按钮）再重新添加（+ 按钮）。请参阅<a href="/zh/guide/type-and-translate/#accessibility">输入翻译</a>。</p></div>
<div class="card"><span class="card-title">按 Enter 后译文没有进入聊天框</span><p><strong>原因：</strong>那个框不接受自动粘贴（密码框、Windows 上以管理员身份运行的应用、阻止粘贴的应用），或者聊天窗口没有及时回到前面。</p><p><strong>解决方法：</strong>译文仍在剪贴板上：点击聊天框，用 ⌘V 或 Ctrl+V 粘贴。</p></div>
<div class="card"><span class="card-title">“有一行太长，无法翻译。请拆分成多行或多条消息。”</span><p><strong>原因：</strong>消息中的某一行太长，无法一次翻译（整条消息最多可以有 4000 个字符）。</p><p><strong>解决方法：</strong>按 Shift+Enter 在合适的位置换行，或者拆成多条消息。</p></div>
</div>

<h2 id="send-logs">发送日志并报告问题</h2>
<p>当应用出错时（突然停止、翻译会话因应用内部错误而停止，或者某个辅助程序停止并重启），它会<strong>自动向我们发送错误报告</strong>：机器信息和日志中相关的部分，其中已去除个人文件夹路径、密钥、令牌和邮箱地址，不含音频或转写文字。报告只在应用没有翻译时发送。这项功能默认开启；你可以在<strong>设置 › 隐私 › 自动发送错误报告</strong>中关闭。请参阅<a href="/zh/data-security/#error-reports">报告包含什么以及保存多久</a>。</p>
<p>对于不会让应用停止的问题（例如字幕错误或很慢），请进入<strong>关于 › 向客服发送日志</strong>：即使你已关闭自动发送，应用也会立即发送一份报告，并显示一个<strong>报告编号</strong>（形如 <code>R-XXXX-XXXX</code>）。请把这个编号写进发给<a href="/zh/contact/">客服</a>（support@aitranslator.io.vn）的邮件中，方便我们找到你的报告。</p>
<p>如果想自己查看或附上日志，请打开<strong>关于 › 打开日志文件夹</strong>，找到 <code>app.log</code>（macOS：<code>~/Library/Logs/</code> 中的 <code>com.aitranslator.desktop</code> 文件夹；Windows：<code>%LOCALAPPDATA%\\com.aitranslator.desktop\\logs\\</code>）。这个文件保留在你的电脑上，不含音频、转写文字或完整的许可证密钥。</p>
${appShot({
  slug: "app-about",
  lang: "zh",
  alt: "关于页面：应用名称、版本一行、打开日志文件夹和向客服发送日志按钮，以及条款与隐私部分",
  caption: "关于：版本、打开日志文件夹和向客服发送日志。",
})}
<p>如果按照表格操作后问题仍反复出现、密钥被锁定或撤销，或者付款出了问题，请联系客服。请附上：</p>
<ul>
<li>应用版本（关于 › “版本 …”，或左侧边栏底部，例如“Monthly · v0.1.6”）、macOS 或 Windows 版本、芯片或处理器（例如 MacBook Air M2）、内存，以及 Windows 电脑的显卡。</li>
<li>模型包（Standard 或 Lite，在“设置 › 模型”中）和你的许可证套餐。</li>
<li>与显示完全一致的消息或截图、你使用的会议应用，以及你刚才做了什么。</li>
<li>报告编号（如果你点击了“向客服发送日志”）以及付款问题的订单号；如果想附上，也可以附上 <code>app.log</code>。</li>
</ul>

<h2 id="quick-answers">快速解答</h2>
${faq(QUICK)}
`,
})}
${docNav(
  [
    { href: "/zh/guide/buy-and-activate/", kicker: "上一篇", title: "购买套餐、激活密钥和更换电脑" },
    { href: "/zh/faq/", kicker: "另请参阅", title: "常见问题" },
  ],
  "相关指南",
)}
</div></section>
`,
};
