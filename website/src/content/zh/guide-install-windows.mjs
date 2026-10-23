import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "在 Windows 上安装", path: "/zh/guide/install-windows/" },
];

const toc = [
  { level: 2, id: "requirements", text: "你的电脑能运行吗？" },
  { level: 2, id: "install-command", text: "快捷方式：用一条命令安装" },
  { level: 2, id: "install-exe", text: "另一种方式：用 .exe 文件安装" },
  { level: 3, id: "verify-the-file", text: "核对安装包（SHA-256）" },
  { level: 3, id: "run-the-installer", text: "运行安装程序并通过 SmartScreen" },
  { level: 2, id: "smart-app-control", text: "Windows 11 提示应用被阻止（智能应用控制）" },
  { level: 2, id: "first-launch", text: "首次启动" },
  { level: 2, id: "updates", text: "更新" },
  { level: 2, id: "uninstall", text: "正确卸载" },
  { level: 2, id: "common-problems", text: "常见安装问题" },
];

const INSTALL_CMD = "irm https://aitranslator.vn/install.ps1 | iex";

const HOWTO_STEPS = [
  { name: "打开 PowerShell", text: "按 Windows 键，输入 PowerShell，然后按 Enter。不需要以管理员身份运行。" },
  { name: "粘贴安装命令并按 Enter", text: "把 irm https://aitranslator.vn/install.ps1 | iex 粘贴到 PowerShell 并按 Enter。" },
  { name: "等待应用打开", text: "命令会下载最新版本，核对 SHA-256，只为你的账户静默运行安装程序，然后打开 AI Translator。" },
];

export default {
  id: "guide-install-windows",
  lang: "zh",
  path: "/zh/guide/install-windows/",
  title: "在 Windows 上安装 AI Translator",
  description:
    "一条 PowerShell 命令即可下载、校验并只为你的账户安装应用，不会出现 SmartScreen 界面。另外还介绍：.exe 安装方式、更新以及卸载。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "用一条命令在 Windows 上安装并打开 AI Translator",
      description: "把一条命令粘贴到 PowerShell，即可下载、校验并只为你的账户安装 AI Translator；应用随后打开。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "在 Windows 上安装 AI Translator",
  lead: "在 Windows 上安装 AI Translator 最快的方法，是把一条命令粘贴到 PowerShell：安装程序会被下载、校验并只为你的账户运行（不需要管理员权限），应用会直接打开，不经过 SmartScreen 界面。如果你已经在浏览器中下载了 .exe，也可以双击安装，但由于 Windows 版没有代码签名，SmartScreen 可能会发出警告：请点击“更多信息”，然后点击“仍要运行”。",
  meta: "<span>适用于 Windows 10 和 11，64 位（x64）</span> <span>更新于 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本指南内容",
  body: `
<h2 id="requirements">你的电脑能运行吗？</h2>
${facts([
  ["操作系统", "Windows 10 或 11，64 位（x64）<small>目前还不支持 Windows ARM64。</small>"],
  ["处理器", "支持 AVX2 的 CPU<small>没有 AVX2 时，应用会说明原因，并且不会下载模型。</small>"],
  ["内存", "最低 8 GB，建议 16 GB<small>内存不足 8 GB 时，应用会说明原因，并且不会下载模型。</small>"],
  ["显卡", "使用 Standard 模型包时，建议配备 6 GB 或以上显存的独立显卡<small>没有独立显卡时在 CPU 上运行。</small>"],
  ["安装包", "一个约 22 MB 的 .exe 文件<small>只为你的 Windows 账户安装，不需要管理员权限。</small>"],
  ["模型所需磁盘空间", "1.3 GB（Lite 模型包）或 2.5 GB（Standard 模型包）<small>下载时还需要额外 1 GB 可用空间。</small>"],
  ["网络", "下载模型和登记 Free 试用时需要<small>安装过程中也可能需要（见下文）。之后翻译离线运行。</small>"],
])}
<p class="small muted">我们在 Windows 11 上试过系统音频采集和字幕条，并在一台使用集成显卡的笔记本上做过初步的延迟测试（比 Mac M4 Pro 慢）。所以我们不对 Windows 上的延迟作出承诺。在没有性能足够的独立显卡的电脑上，请使用 Lite 模型包。</p>

<h2 id="install-command">快捷方式：用一条命令安装</h2>
<ol>
<li>打开 <strong>PowerShell</strong>：按 <kbd>Windows</kbd> 键，输入 <strong>PowerShell</strong>，按 Enter。不需要以管理员身份运行。</li>
<li>粘贴下面的命令并按 Enter。</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "复制命令", copied: "已复制", label: "在 Windows 上安装 AI Translator 的命令", term: "Windows PowerShell", prompt: "PS>" })}
<ol start="3">
<li>等待大约一分钟。命令会下载最新版本，核对 SHA-256，静默运行安装程序（安装到 <code>%LOCALAPPDATA%\\AI Translator\\</code>，没有 UAC 提示），然后打开应用。</li>
<li>继续阅读<a href="/zh/guide/quick-start/">快速入门指南</a>。</li>
</ol>
<p><strong>为什么没有 SmartScreen 界面？</strong>SmartScreen 只会在你从文件资源管理器打开带有“从互联网下载”标记（由浏览器添加）的文件时进行检查。用 PowerShell 下载的文件没有这个标记，安装程序也是从 PowerShell 运行的，所以即使这个版本没有代码签名，也不会出现警告。</p>
${callout({ kind: "warn", title: "请了解这条命令会做什么。", text: "这条命令会从 <strong>aitranslator.vn</strong> 下载一个脚本；脚本从 <strong>releases.aitranslator.vn</strong> 下载安装程序，核对其 SHA-256 后再安装。它不需要管理员权限，也不发送任何数据。SHA-256 与文件来自同一个地方，所以主要是防止下载损坏；你仍然是在信任 <strong>aitranslator.vn</strong>。如果想先阅读脚本，请使用先显示、再运行的命令：<code>$s = irm https://aitranslator.vn/install.ps1; $s | more; iex $s</code>。随时再次运行同一条命令即可更新；安装程序会自行关闭正在运行的应用。" })}
<p>出了问题？脚本会停下来并说明原因（不支持的电脑、没有网络、SHA-256 不匹配……）。请参阅<a href="#common-problems">常见安装问题</a>。</p>

<h2 id="install-exe">另一种方式：用 .exe 文件安装</h2>
<p>如果你是通过邮件收到的 .exe，或者不想使用 PowerShell，可以用这种方式。在浏览器中下载的文件带有“从互联网下载”的标记，所以 SmartScreen 可能会发出警告。</p>

<h3 id="verify-the-file">核对安装包（SHA-256）</h3>
${callout({ kind: "warn", title: "只从官方渠道下载安装包。", text: "正版的 .exe 是我们从 <strong>support@aitranslator.vn</strong> 发送的，或在 <strong>aitranslator.vn</strong> 上提供链接的。来自其他地方的文件可能是伪造或被篡改的。即使名字叫 AI Translator，也不要运行。" })}
<p>我们通过邮件发送的每个安装包都附有 SHA-256 校验值。由于 Windows 版没有代码签名，核对校验值就是确认文件没有被改动的方法。安装前请这样做：</p>
<ol>
<li>打开 <strong>PowerShell</strong>：点击“开始”，输入 <code>PowerShell</code>，然后打开 <strong>Windows PowerShell</strong>。</li>
<li>输入下面的命令，把 <code>&lt;file-name&gt;</code> 换成你下载的文件名，然后按 Enter。文件名中有空格，所以请像示例那样用双引号把整个路径括起来。</li>
</ol>
<div class="table-wrap"><pre><code>Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\\Downloads\\&lt;file-name&gt;.exe"</code></pre></div>
<ol start="3">
<li>把 <strong>Hash</strong> 列中 64 个字符的字符串与我们发给你的进行比较。PowerShell 以大写显示；大小写无关紧要，但每个字符都必须一致。</li>
<li>如果不同，请不要运行文件。重新下载；如果仍然不同，请<a href="/zh/contact/">联系客服</a>。</li>
</ol>

<h3 id="run-the-installer">运行安装程序并通过 SmartScreen 警告</h3>
<p>安装程序的文件名类似 <code>AI Translator_&lt;version&gt;_x64-setup.exe</code>。它只为你的 Windows 账户把 AI Translator 安装到 <code>%LOCALAPPDATA%\\AI Translator\\</code>，所以不需要管理员权限，也不会显示管理员（UAC）提示。安装程序会根据你的 Windows 语言显示越南语或英语。</p>
<p><strong>如果浏览器在下载时发出警告。</strong>浏览器可能会提示这个文件不常被下载。在 Microsoft Edge 中，点击下载列表中文件旁边的“…” › <strong>保留</strong> › <strong>显示更多</strong> › <strong>仍然保留</strong>。在 Chrome 中，点击<strong>保留</strong>。只对来自官方渠道的文件这样做。</p>
<ol>
<li>双击你下载的 <code>.exe</code> 文件（通常在“下载”文件夹中）。</li>
<li>如果 Windows 显示蓝色的<strong>“Windows 已保护你的电脑”</strong>界面（Microsoft Defender SmartScreen），请点击<strong>更多信息</strong>。</li>
<li>检查<strong>应用</strong>一行：它必须是你刚核对过 SHA-256 的安装程序文件。<strong>发布者</strong>显示为<strong>未知发布者</strong>：对于没有代码签名的版本，这是正常的。</li>
<li>点击<strong>仍要运行</strong>。</li>
<li>按照安装程序完成安装。如果你的电脑缺少应用所需的 Windows 显示组件，安装程序会下载它，所以此时需要联网（Windows 11 通常已经自带）。</li>
</ol>
<p>如果没有出现蓝色界面，照常安装即可。如果 Windows 设置为其他语言，按钮名称可能会有所不同。</p>
${callout({ kind: "warn", title: "Windows 为什么会发出警告？", text: "SmartScreen 会对没有代码签名或尚不常被下载的文件发出警告。当前的 Windows 版没有代码签名，因为我们还没有 Windows 代码签名证书（就像 macOS 版还没有 Apple Developer ID 一样）。如果文件来自我们并且 SHA-256 一致，这就是这个版本的正常流程。等我们有了证书，警告会逐渐减少；SmartScreen 需要时间为新文件建立信誉，所以我们不承诺警告会立刻消失。" })}

<h2 id="smart-app-control">Windows 11 提示应用被阻止，而且没有办法继续</h2>
<p>这是<strong>智能应用控制</strong>，它与 SmartScreen 不同。在阻止模式下，无论用哪种方式安装（命令，或在浏览器中下载的 .exe），它都不允许没有签名、也没有信誉的应用运行，而且没有<strong>仍要运行</strong>按钮。你的 Windows 11 电脑可能开启了这项功能（评估模式下它不阻止任何东西；只有在阻止模式下才会阻止）。</p>
<ol>
<li>打开 <strong>Windows 安全中心 › 应用和浏览器控制 › 智能应用控制设置</strong>。</li>
<li>选择<strong>关</strong>。</li>
<li>再次运行安装命令或安装程序。</li>
</ol>
<p>在较旧的 Windows 11 版本上，智能应用控制一旦关闭，除非重装 Windows，否则无法再次开启。如果你不想关闭它，请等我们拿到 Windows 代码签名证书。由公司或学校管理的电脑可能不允许你关闭它：请询问管理员。</p>

<h2 id="first-launch">首次启动</h2>
<ol>
<li>从“开始”菜单打开 <strong>AI Translator</strong>。</li>
<li>应用会显示首次设置。Windows 上没有音频权限这一步：应用无需单独授权就能采集电脑上播放的声音，而且不使用麦克风。</li>
<li>继续阅读<a href="/zh/guide/quick-start/">快速入门指南</a>。</li>
</ol>
<p>AI Translator 位于系统托盘中。关闭窗口只会隐藏应用；要完全退出，请从托盘图标选择<strong>退出</strong>。Windows 可能会把新图标藏在任务栏的 <strong>^</strong> 箭头后面：把图标拖到任务栏上，或者在任务栏设置中开启它。Windows 上的快捷键使用 Ctrl+Alt（见<a href="/zh/guide/subtitle-bar-and-shortcuts/">字幕条和快捷键</a>）。</p>

<h2 id="updates">更新</h2>
<p>应用在打开大约一分钟后检查新版本，之后每 24 小时检查一次，并在后台下载；准备好后，应用会询问“重启”还是“稍后”（托盘菜单中也有“重启以更新”），新版本会在你重启或选择“退出”时安装。更新通道（稳定版或 Beta）在“设置 › 通用”中选择，更改后会立即检查。要立即检查，请在“设置 › 通用”中点击<strong>检查更新</strong>，或从应用图标菜单中选择“检查更新…”。你也可以随时运行同一条安装命令来获取最新版本。如果你是用我们通过邮件发送的 .exe 安装的，而那个版本不会自动更新，我们会把新版本连同 SHA-256 一起发给你；新文件也可能再次触发 SmartScreen 警告。</p>

<h2 id="uninstall">正确卸载</h2>
<ol>
<li>打开 AI Translator，进入<strong>设置 › 隐私</strong>。</li>
<li>点击<strong>删除模型和数据</strong>，然后用<strong>全部删除</strong>确认。应用会删除所有已下载的模型（1.3 GB 或 2.5 GB）、历史记录和术语表。</li>
<li>从系统托盘中的 AI Translator 图标选择<strong>退出</strong>。</li>
<li>打开<strong>设置 › 应用 › 已安装的应用</strong>，找到 <strong>AI Translator</strong>，然后点击<strong>卸载</strong>。</li>
</ol>
<p>卸载程序有一个删除应用数据的选项：勾选后，即使跳过了第 1–2 步，模型也会被删除。你的许可证和剩余翻译时长会保留，所以重新安装不会丢失已购买的套餐。Free 试用与你的电脑绑定，所以重新安装不会重新开始 10 天。模型、历史记录、术语表和日志位于 <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\</code>（模型在 <code>models</code> 子文件夹中，日志在 <code>logs\\app.log</code>）；设置文件 <code>settings.json</code> 位于 <code>%APPDATA%\\com.aitranslator.desktop\\</code>；密钥、令牌和翻译时长计数保存在凭据管理器中。</p>

<h2 id="common-problems">常见安装问题</h2>
<ul>
<li><strong>安装命令提示无法读取 https://releases.aitranslator.vn/stable/latest.json。</strong>你的电脑没有联网，或者代理/VPN 阻止了 <code>releases.aitranslator.vn</code>。请检查网络连接后再运行一次。</li>
<li><strong>安装命令提示 SHA-256 不匹配。</strong>下载过程中文件损坏或被篡改。脚本不会安装任何东西；请再运行一次，如果仍然不同，请写信给<a href="/zh/contact/">客服</a>。</li>
<li><strong>安装命令无法运行（提示受约束的语言模式）。</strong>由公司管理的电脑可能会阻止脚本。请改用 .exe 方式，或询问管理员。</li>
<li><strong>应用被阻止，而且没有办法继续。</strong>请参阅上面的“智能应用控制”一节。</li>
<li><strong>SmartScreen 没有“仍要运行”按钮。</strong>（仅在用浏览器下载的 .exe 安装时。）你电脑上的策略（例如由公司或学校管理的电脑）可能会阻止没有代码签名的应用。请询问管理这台电脑的人。</li>
<li><strong>杀毒软件阻止或删除了安装程序。</strong>请再次核对 SHA-256。如果一致但安装程序仍被阻止，请<a href="/zh/contact/">联系客服</a>，并告诉我们你使用的杀毒软件。</li>
<li><strong>应用显示“这台电脑的处理器缺少 AI Translator 所需的 AVX2，语音识别无法运行。”</strong>没有 AVX2，应用无法下载模型。</li>
<li><strong>应用显示“这台电脑的内存不足 8 GB，AI Translator 暂不支持。”</strong>内存不足 8 GB 的电脑无法下载模型。</li>
<li><strong>Windows ARM64 电脑。</strong>暂不支持：Windows 版只有 x64，我们也没有在 ARM64 机器上测试过。</li>
<li><strong>应用显示“这份 AI Translator 不是正版，因此只能使用 Free。”</strong>安装的文件被改动过，或者来自错误的渠道。请从官方渠道重新下载。</li>
</ul>
<p>如果安装后没有出现字幕，请参阅<a href="/zh/guide/troubleshooting/">故障排除</a>。</p>

${docNav(
  [
    { href: "/zh/guide/quick-start/", kicker: "上一篇", title: "AI Translator 快速入门" },
    { href: "/zh/guide/subtitle-bar-and-shortcuts/", kicker: "下一篇", title: "字幕条和快捷键" },
    { href: "/zh/guide/troubleshooting/", kicker: "相关", title: "故障排除" },
  ],
  "相关指南",
)}
`,
})}
</div></section>
`,
};
