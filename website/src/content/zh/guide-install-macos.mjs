import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "指南", path: "/zh/guide/" },
  { name: "在 macOS 上安装", path: "/zh/guide/install-macos/" },
];

const toc = [
  { level: 2, id: "requirements", text: "你的 Mac 能运行吗？" },
  { level: 2, id: "install-command", text: "快捷方式：用一条命令安装" },
  { level: 2, id: "install-dmg", text: "另一种方式：用 .dmg 文件安装" },
  { level: 3, id: "verify-the-file", text: "核对安装包（SHA-256）" },
  { level: 3, id: "drag-to-applications", text: "拖到“应用程序”" },
  { level: 3, id: "first-launch", text: "首次启动：macOS 为什么会阻止" },
  { level: 2, id: "updates", text: "每次更新时" },
  { level: 2, id: "uninstall", text: "正确卸载" },
  { level: 2, id: "common-problems", text: "常见安装问题" },
];

const INSTALL_CMD = "curl -fsSL https://aitranslator.vn/install.sh | bash";

const HOWTO_STEPS = [
  { name: "打开终端", text: "按 Command + Space，输入“终端”，然后按 Enter。" },
  { name: "粘贴安装命令并按 Enter", text: "把 curl -fsSL https://aitranslator.vn/install.sh | bash 粘贴到终端并按 Enter。不需要输入密码。" },
  { name: "等待应用打开", text: "命令会下载最新版本，核对 SHA-256，把 AI Translator 复制到“应用程序”并打开它。当 macOS 请求系统音频录制权限时，请选择“允许”。" },
];

export default {
  id: "guide-install-macos",
  lang: "zh",
  path: "/zh/guide/install-macos/",
  title: "在 macOS 上安装 AI Translator",
  description:
    "一条终端命令即可下载、校验并打开应用，无需“仍要打开”。另外还介绍：用 .dmg 安装、核对 SHA-256、更新以及卸载。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "用一条命令在 macOS 上安装并打开 AI Translator",
      description: "把一条命令粘贴到终端，即可下载、校验并安装 AI Translator；应用随后直接打开，无需“仍要打开”这一步。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "在 macOS 上安装 AI Translator",
  lead: "在 macOS 上安装 AI Translator 最快的方法，是把一条命令粘贴到终端：应用会被下载、校验并立即打开，不需要去系统设置里点击“仍要打开”。如果你已经在浏览器中下载了 .dmg，也可以把它拖到“应用程序”来安装，但由于当前版本是临时签名，还没有经过 Apple 公证，macOS 会阻止第一次打开。",
  meta: "<span>适用于 macOS 14.2 或更高版本，Apple 芯片</span> <span>更新于 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "本指南内容",
  body: `
<h2 id="requirements">你的 Mac 能运行吗？</h2>
${facts([
  ["芯片", "Apple 芯片（M1 或更新）<small>没有 Intel Mac 版本。可在苹果菜单 › 关于本机中查看芯片。</small>"],
  ["操作系统", "macOS 14.2 或更高版本"],
  ["内存", "最低 8 GB，建议 16 GB<small>内存不足 8 GB 时，应用会说明原因，并且不会下载模型。</small>"],
  ["安装包", "约 9 MB 的 .dmg 文件"],
  ["模型所需磁盘空间", "1.3 GB（Lite 模型包）或 2.5 GB（Standard 模型包）<small>下载时还需要额外 1 GB 可用空间。</small>"],
  ["网络", "下载模型和登记 Free 试用时需要<small>之后翻译离线运行。</small>"],
])}
<p class="small muted">我们没有在基础款 M1 Mac 上测量过性能，所以无法保证那里的延迟。在 8 GB 内存的 Mac 上，选择 Lite 模型包比较合理。</p>

<h2 id="install-command">快捷方式：用一条命令安装</h2>
<ol>
<li>打开<strong>终端</strong>：按 <kbd>⌘</kbd> + <kbd>Space</kbd>，输入<strong>终端</strong>，按 Enter。</li>
<li>粘贴下面的命令并按 Enter。不需要输入密码。</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "复制命令", copied: "已复制", label: "在 macOS 上安装 AI Translator 的命令" })}
<ol start="3">
<li>等待大约一分钟。命令会下载最新的 AI Translator，核对 SHA-256，检查应用的签名，把应用复制到 <code>/Applications</code>（如果该位置不可写，则复制到 <code>~/Applications</code>）并打开它。</li>
<li>当 macOS 请求<strong>系统音频录制</strong>权限时，请选择“允许”。然后继续阅读<a href="/zh/guide/quick-start/">快速入门指南</a>。</li>
</ol>
<p><strong>为什么没有“仍要打开”这一步？</strong>macOS 只会阻止带有“从互联网下载”标记（由浏览器添加）的文件中的应用。用终端里的 <code>curl</code> 下载的文件没有这个标记，所以即使 Apple 没有公证，应用也会直接打开。</p>
${callout({ kind: "warn", title: "请了解这条命令会做什么。", text: "这条命令会从 <strong>aitranslator.vn</strong> 下载一个脚本；脚本从 <strong>releases.aitranslator.vn</strong> 下载安装包，核对其 SHA-256 后再安装。它不使用 sudo，也不发送任何数据。SHA-256 与文件来自同一个地方，所以主要是防止下载损坏；你仍然是在信任 <strong>aitranslator.vn</strong>。如果想先阅读脚本：<code>curl -fsSL https://aitranslator.vn/install.sh -o install.sh && less install.sh && bash install.sh</code>。随时再次运行同一条命令即可更新到最新版本；脚本会自行退出正在运行的应用。" })}
<p>出了问题？脚本会停下来并说明原因（不支持的 Mac、没有网络、SHA-256 不匹配……）。请参阅<a href="#common-problems">常见安装问题</a>。</p>

<h2 id="install-dmg">另一种方式：用 .dmg 文件安装</h2>
<p>如果你是通过邮件收到的 .dmg，或者不想使用终端，可以用这种方式。在浏览器中下载的文件会被 macOS 加上“从互联网下载”的标记，所以第一次打开时需要额外的“仍要打开”步骤。</p>

<h3 id="verify-the-file">核对安装包（SHA-256）</h3>
${callout({ kind: "warn", title: "只从官方渠道下载安装包。", text: "正版的 .dmg 是我们从 <strong>support@aitranslator.vn</strong> 发送的，或在 <strong>aitranslator.vn</strong> 上提供链接的。来自其他地方的文件可能是伪造或被篡改的。即使名字叫 AI Translator，也不要打开。" })}
<p>我们通过邮件发送的每个安装包都附有 SHA-256 校验值。安装前请核对：</p>
<ol>
<li>打开<strong>终端</strong>（应用程序 › 实用工具）。</li>
<li>输入 <code>shasum -a 256</code> 并加一个空格，从访达把 .dmg 文件拖进终端窗口以填入路径（文件名中的空格也会包含在内），然后按 Enter。也可以输入下面的命令；如果文件名中有空格，请像示例那样用双引号括起来。</li>
</ol>
<div class="table-wrap"><pre><code>shasum -a 256 ~/Downloads/"&lt;file-name&gt;.dmg"</code></pre></div>
<ol start="3">
<li>把输出的 64 个字符与我们发给你的进行比较。两者必须完全相同。</li>
<li>如果不同，请不要打开文件。重新下载；如果仍然不同，请<a href="/zh/contact/">联系客服</a>。</li>
</ol>

<h3 id="drag-to-applications">把 AI Translator 拖到“应用程序”</h3>
<ol>
<li>双击 <code>.dmg</code> 文件打开它。</li>
<li>在出现的窗口中，把 <strong>AI Translator</strong> 拖到<strong>应用程序</strong>文件夹。</li>
</ol>

<h3 id="first-launch">首次启动：macOS 为什么会阻止，以及如何允许</h3>
<p>macOS 用“门禁”（Gatekeeper）检查从互联网下载的应用。当前的 AI Translator 版本是临时签名，还没有经过 Apple 公证，因为我们还没有 Apple Developer ID。所以 macOS 会阻止第一次打开，并提示无法验证开发者。如果文件来自我们并且 SHA-256 一致，这就是这个版本的正常流程。</p>
<ol>
<li>从“应用程序”中打开 AI Translator。当 macOS 提示无法验证开发者时，点击<strong>完成</strong>（关闭对话框的按钮；不同 macOS 版本上的文字可能略有不同）。</li>
<li>打开<strong>系统设置 › 隐私与安全性</strong>。</li>
<li>滚动到页面底部，点击 AI Translator 旁边的<strong>仍要打开</strong>。</li>
<li>用登录密码或触控 ID 确认。</li>
<li>应用会打开并显示首次设置。继续阅读<a href="/zh/guide/quick-start/">快速入门指南</a>。</li>
</ol>
${callout({ kind: "warn", title: "从 macOS 15 开始，右键 › 打开的方法不再有效。", text: "请像上面那样通过“隐私与安全性”操作。“仍要打开”按钮通常只在 macOS 阻止过一次打开操作之后才会出现；如果没有看到，请再打开一次应用，然后回来。" })}
<p>只有在浏览器中下载的 .dmg 才需要这一步；用<a href="#install-command">一行命令</a>安装则不需要。等我们有了 Developer ID 并为应用完成公证后，无论用哪种方式安装，这一步都会消失。</p>

<h2 id="updates">每次更新时，macOS 会再问一件事</h2>
<p>先说更新的方式：应用在打开大约一分钟后检查新版本，之后每 24 小时检查一次，并在后台下载；准备好后，应用会询问“重启”还是“稍后”（托盘菜单中也有“重启以更新”），新版本会在你重启或选择“退出”时安装。更新通道（稳定版或 Beta）在“设置 › 通用”中选择，更改后会立即检查。要立即检查，请在“设置 › 通用”中点击<strong>检查更新</strong>，或从应用图标菜单中选择“检查更新…”。</p>
<p>其余的是临时签名带来的结果：每个新版本的签名都不同，所以 macOS 会再次请求钥匙串访问权限。从 0.1.1 版开始，AI Translator 把所有敏感数据（历史记录的加密密钥、许可证令牌、翻译时长计数）保存在<strong>一个</strong>钥匙串项目中，所以每次更新后你会看到：</p>
<ul>
<li><strong>1 个钥匙串对话框</strong>，要求输入 Mac 的登录密码（我们在一台运行 macOS 26 的 Mac 上测量过：为模拟新版本把应用重新签名两次，每次都只有 1 个对话框）：输入密码并选择<strong>始终允许</strong>。不要选择“拒绝”：应用将无法读取你的许可证和翻译时长。如果不小心选了，请完全退出应用，重新打开，然后选择“始终允许”。</li>
<li>可能会再请求一次<strong>系统音频录制</strong>权限（我们之前的测量记录到 1 个对话框）：请允许。</li>
</ul>
<p><strong>只有从 0.1.0 到 0.1.1 的第一次更新</strong>不同：应用需要把 5 个旧的钥匙串项目复制到新项目中，所以你会一次性看到 5 个钥匙串对话框（我们测得正好 5 个，另加 1 个允许录音的对话框）；之后的更新只有 1 个。</p>
<p>选择“始终允许”后，之后的启动不会再询问。你不会丢失数据、套餐或翻译时长。在全新安装时，我们没有测到钥匙串对话框（只有录音权限，以及从浏览器下载的 .dmg 安装时的“仍要打开”）；如果 macOS 仍然询问，请选择“始终允许”。应用会在更新提示中提前告诉你。等我们有了 Developer ID，这种情况就会消失。你也可以运行同一条安装命令来更新；出于同样的原因，也会出现钥匙串对话框。</p>

<h2 id="uninstall">正确卸载</h2>
<p>删除应用时，macOS 不会给它清理的机会，所以请先删除模型和数据，再把应用移到废纸篓：</p>
<ol>
<li>打开 AI Translator，进入<strong>设置 › 隐私</strong>。</li>
<li>点击<strong>删除模型和数据</strong>，然后用<strong>全部删除</strong>确认。应用会删除所有已下载的模型（1.3 GB 或 2.5 GB）、历史记录和术语表。</li>
<li>从菜单栏中的 AI Translator 图标选择<strong>退出</strong>。</li>
<li>把 <strong>AI Translator</strong> 从“应用程序”拖到废纸篓。</li>
</ol>
<p>你的许可证和剩余翻译时长会保留，所以重新安装不会丢失已购买的套餐。Free 试用与你的 Mac 绑定，所以重新安装不会重新开始 10 天。如果你已经删除了应用却没有删除模型，模型位于 <code>~/Library/Application Support/com.aitranslator.desktop/models</code>。</p>

<h2 id="common-problems">常见安装问题</h2>
<ul>
<li><strong>安装命令提示无法读取 https://releases.aitranslator.vn/stable/latest.json。</strong>你的 Mac 没有联网，或者代理/VPN 阻止了 <code>releases.aitranslator.vn</code>。请检查网络连接后再运行一次。</li>
<li><strong>安装命令提示 SHA-256 不匹配。</strong>下载过程中文件损坏或被篡改。脚本不会安装任何东西；请再运行一次，如果仍然不同，请写信给<a href="/zh/contact/">客服</a>。</li>
<li><strong>安装命令提示应用仍在运行。</strong>请完全退出 AI Translator（菜单栏中的 AI Translator 菜单 › 退出），然后再运行一次命令。</li>
<li><strong>安装命令提示需要 Apple 芯片或 macOS 14.2。</strong>你的 Mac 不满足要求；没有适用于 Intel Mac 的版本。</li>
<li><strong>没有“仍要打开”按钮。</strong>（仅在用浏览器下载的 .dmg 安装时。）再打开一次应用，让 macOS 记录这次阻止，然后回到“隐私与安全性”。</li>
<li><strong>无法在 Intel Mac 上安装。</strong>AI Translator 只为 Apple 芯片构建。</li>
<li><strong>应用显示“这台电脑的内存不足 8 GB，AI Translator 暂不支持。”</strong>内存不足 8 GB 的 Mac 无法下载模型。</li>
<li><strong>应用显示“这份 AI Translator 不是正版，因此只能使用 Free。”</strong>安装的文件被改动过，或者来自错误的渠道。请从官方渠道重新下载。</li>
<li><strong>更新后 macOS 多次询问钥匙串。</strong>对于临时签名的版本，这是正常的：输入密码并选择“始终允许”。</li>
</ul>
<p>如果安装后没有出现字幕，请参阅<a href="/zh/guide/macos-audio-permission/">如何授予系统音频录制权限</a>。</p>

${docNav(
  [
    { href: "/zh/guide/quick-start/", kicker: "上一篇", title: "AI Translator 快速入门" },
    { href: "/zh/guide/macos-audio-permission/", kicker: "下一篇", title: "在 macOS 上授予系统音频录制权限" },
    { href: "/zh/guide/troubleshooting/", kicker: "相关", title: "故障排除" },
  ],
  "相关指南",
)}
`,
})}
</div></section>
`,
};
