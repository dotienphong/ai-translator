import { pageHero, callout, docLayout, docNav, steps, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";
import { legalVersionLine } from "../legal.mjs";

const crumbs = [
  { name: "首页", path: "/zh/" },
  { name: "数据与安全", path: "/zh/data-security/" },
];

const TOC = [
  { level: 2, id: "on-device", text: "哪些数据留在你的电脑上？" },
  { level: 2, id: "network", text: "应用会连接到哪里？" },
  { level: 2, id: "verified", text: "我们是如何核实的？" },
  { level: 2, id: "server", text: "我们的服务器保存什么，保存多久？" },
  { level: 2, id: "error-reports", text: "错误报告：应用会发送什么？" },
  { level: 2, id: "delete-data", text: "如何删除我的数据？" },
  { level: 2, id: "processors", text: "还有谁处理数据？" },
  { level: 2, id: "protections", text: "其他保护措施" },
  { level: 2, id: "signing", text: "目前的代码签名" },
  { level: 2, id: "limits", text: "我们不承诺的事项" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "data-security",
  lang: "zh",
  path: "/zh/data-security/",
  title: "AI Translator 的数据与安全",
  description:
    "AI Translator 在你的电脑上处理音频，从不外传。了解哪些数据留在设备上、应用连接到哪里、服务器保存什么，以及如何删除。",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "使用 AI Translator 时，你的数据去了哪里？",
  lead: "会议音频完全在你的电脑上处理，从不外传：语音识别和翻译使用在你电脑上运行的 AI 模型，不涉及任何云端 AI 服务。本页按数据类型逐一说明：什么留在你的电脑上，什么经过网络，我们的服务器保存什么，以及我们是如何核实的、还有哪些没有核实。",
  meta: `<span>更新于 {{updated}}</span><span>与隐私政策一致：<span lang="en">${legalVersionLine("privacy.en.md")}</span></span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: TOC,
  tocTitle: "本页内容",
  body: `
${facts([
  ["AI 处理", "语音识别和翻译使用在你电脑上运行的 AI 模型；不使用云端 AI"],
  ["对话数据", "只在你的电脑上；我们的服务器上没有"],
  ["音频", "只在内存中，从不写入磁盘，从不外传"],
  ["网络", "5 个地方；都不会收到音频、转写内容或你输入的文字"],
  ["服务器保存", "邮箱（购买时）、订单、许可证、哈希处理后的设备 ID、错误报告"],
  ["保存期限", "直到你要求删除；错误报告 30 天"],
  ["核实方式", "在 macOS 上使用代理和 nettop"],
  ["代码签名", "macOS 为临时签名，未经公证；Windows 未签名"],
])}
<h2 id="on-device">哪些数据留在你的电脑上？</h2>
<p>音频、转写内容、译文以及你在输入翻译中输入的文字，都不会离开你的电脑。应用也没有登录、没有广告、没有分析统计。出错时，应用会向我们发送一份已去除个人数据的错误报告（见<a href="#error-reports">错误报告</a>）；报告中不含音频、转写文字或译文。</p>
<div class="table-wrap" role="region" aria-label="留在你电脑上的数据" tabindex="0"><table>
<thead><tr><th scope="col">数据</th><th scope="col">如何处理</th></tr></thead>
<tbody>
<tr><th scope="row">正在采集的系统音频</th><td>翻译时只在内存中。从不写入磁盘，从不通过网络发送。AI Translator 也不会把会议录制成文件。</td></tr>
<tr><th scope="row">转写内容和译文</th><td>显示在屏幕上，并在会话期间保存在内存中。历史记录默认关闭；如果你开启（Pro 功能），会加密保存在你的电脑上。</td></tr>
<tr><th scope="row">在输入翻译中输入的文字及其译文</th><td>只保存在应用的内存中，直到你粘贴或退出应用。不写入磁盘，不通过网络发送，也不会出现在日志或错误报告中。译文会复制到剪贴板以便粘贴，并一直留在那里，直到你复制别的内容。</td></tr>
<tr><th scope="row">密钥、令牌、翻译时长计数</th><td>历史记录的加密密钥、许可证令牌、试用令牌和翻译时长计数保存在钥匙串（macOS）或凭据管理器（Windows）中。</td></tr>
<tr><th scope="row">日志</th><td>保存在你的电脑上，不含转写内容。只有与错误相关的那部分日志会离开你的电脑，并且是放在已去除个人数据的错误报告中（见<a href="#error-reports">错误报告</a>）。</td></tr>
<tr><th scope="row">术语表、设置、模型</th><td>保存在你的电脑上。模型只需下载一次，之后完全在你的电脑上运行。</td></tr>
</tbody></table></div>
<p>在 macOS 上，输入翻译请求辅助功能权限，只是为了向你正在输入的聊天框发送粘贴键 ⌘V。应用不会读取其他应用的文字、内容或剪贴板；没有这项权限时，应用只会复制译文，由你自己粘贴（见<a href="/zh/guide/type-and-translate/#accessibility">输入翻译</a>）。</p>

<h2 id="network">应用会连接到哪里？</h2>
<p>恰好 5 个地方，都不会收到音频、转写内容或你输入的文字。语音识别和翻译不需要网络。翻译过程中，应用只可能向我们自己的服务器发送定期请求（检查更新，以及到期时的许可证检查）。<a href="/en/privacy/">隐私政策（英文）</a>第 4 节同样列出了 5 个连接，但它是按用途计数的（模型下载和检查更新都连到 releases.aitranslator.io.vn；PayOS 和 Creem 的付款页面算作一项），而下表按目的地计数。</p>
<div class="table-wrap" role="region" aria-label="应用连接的地方" tabindex="0"><table>
<thead><tr><th scope="col">连接到</th><th scope="col">用途</th><th scope="col">发送的内容</th></tr></thead>
<tbody>
<tr><th scope="row">api.aitranslator.io.vn</th><td>许可证服务器：Free 试用登记、购买、激活、停用、找回密钥、许可证检查、接收错误报告；偶尔向服务器询问时间</td><td>哈希处理后的设备 ID、设备名称、密钥；购买或找回密钥时还有你的邮箱；已去除个人数据的错误报告（只在应用没有翻译时发送）</td></tr>
<tr><th scope="row">releases.aitranslator.io.vn</th><td>下载模型，检查并下载应用更新</td><td>只有文件下载请求</td></tr>
<tr><th scope="row">PayOS 付款页面（pay.payos.vn）</th><td>购买套餐时用 VietQR 付款</td><td>在你的浏览器中打开，而不是在应用内</td></tr>
<tr><th scope="row">Creem 付款页面（www.creem.io）</th><td>购买套餐时用国际银行卡付款</td><td>在你的浏览器中打开，而不是在应用内。你的邮箱由我们的服务器发送给 Creem，而不是由应用发送（见“还有谁处理数据？”）</td></tr>
<tr><th scope="row">aitranslator.io.vn（本网站）</th><td>外部链接（政策、支持、下载页面）在系统浏览器中打开</td><td>应用不发送任何内容</td></tr>
</tbody></table></div>

<h2 id="verified">我们是如何核实的？</h2>
<p>我们在 macOS 上让应用运行在一个记录流量的代理（mitmproxy）之后，同时用 <code>nettop</code> 测量，并循环播放一段英文示例句子来翻译一个会话。版本为 0.1.0 正式版，临时签名，机器是 macOS 26.6.2 的 MacBook Pro M4 Pro，日期为 2026年10月6日。</p>
<ul>
<li><strong>一个 15 分 42 秒的会话</strong>（158 个片段，0 个错误）：共有 3 个对外请求，全部发往我们的两台服务器（一次许可证检查和一次更新检查）。翻译过程中只有 1 个请求，即预定的更新检查。这次测量是在我们迁移到自己的域名之前进行的；之后在自己的域名上重复测量（一个约 9 分钟的会话，nettop 测量 5 分钟），结果相同。</li>
<li><strong>nettop</strong> 监视了应用的 7 个进程（包括 AI 处理）：没有发现对外的数据流。</li>
<li>示例句子中的<strong>标记词</strong>：在应用的日志和记录下来的请求中都没有找到。</li>
<li><strong>自动发送错误报告</strong>（2026年10月17日在同一台机器上，用带有此功能的临时签名正式版重新测量）：在一个 12 分 31 秒的会话中，我们在第 5 分钟故意结束了一个辅助程序，让应用把一份错误报告排入队列。会话剩下的 7 分多钟里没有任何请求发送报告；按下“停止”1 秒后，报告到达了我们的服务器。报告正文为 49.8 KB，不含账户名、个人文件夹路径、邮箱地址或示例句子中的标记词。</li>
</ul>
${callout({ kind: "warn", title: "这项测试的局限", text: "只在 macOS、一台机器、一个临时签名版本上测量；自动错误报告只测量了一次（一个 12 分钟的会话，一份报告）。这是内部检查，不是独立审计；代理模式看不到 WebView 的请求和非 HTTP 流量，所以我们用 nettop 作为补充。" })}

<h2 id="server">我们的服务器保存什么，保存多久？</h2>
<p>我们的服务器保存以下数据。Free 试用这一行适用于每台登记过试用的设备；其他各行只在你购买套餐或激活密钥后才会存在，但错误报告这一行例外，它适用于每台应用发送过报告的设备。</p>
<div class="table-wrap" role="region" aria-label="我们的服务器保存的数据" tabindex="0"><table>
<thead><tr><th scope="col">数据</th><th scope="col">用途</th></tr></thead>
<tbody>
<tr><th scope="row">购买时的邮箱，你同意处理邮箱的时间</th><td>发送和找回密钥；银行卡订单预先填写 Creem 的付款页面；同意的证明</td></tr>
<tr><th scope="row">订单：订单号、套餐、金额和币种、时间、状态、支付网关的会话 ID（PayOS 或 Creem）</th><td>签发和续期许可证、对账、会计</td></tr>
<tr><th scope="row">许可证：密钥、套餐、到期时间、翻译时长周期</th><td>授予付费套餐</td></tr>
<tr><th scope="row">已激活的设备：哈希处理后的设备 ID、设备名称、最后一次检查</th><td>一个密钥一台设备，防止滥用</td></tr>
<tr><th scope="row">Free 试用：哈希处理后的设备 ID、开始和结束时间、应用最后一次联系服务器的时间</th><td>每台设备一次试用。没有邮箱或设备名称。</td></tr>
<tr><th scope="row">许可证变更记录</th><td>支持和故障调查</td></tr>
<tr><th scope="row">限速计数器（只有哈希值，约 3 小时后过期）</th><td>阻止猜测密钥和垃圾请求</td></tr>
<tr><th scope="row">错误报告：错误类型和代码、机器信息、哈希处理后的设备 ID、日志中的相关部分</th><td>发现和修复故障；30 天后自动删除（见<a href="#error-reports">错误报告</a>）</td></tr>
</tbody></table></div>
<p><strong>保存期限：</strong>直到你要求删除；我们从不主动删除个人数据（错误报告除外，30 天后自动删除）。我们不会收到你的银行卡号或银行账号。使用 VietQR 时，我们不会把你的邮箱发送给 PayOS；使用国际银行卡时，我们会把你在升级页面上输入的邮箱发送给 Creem，用来预先填写付款页面，并让 Creem 通过邮件给你发送收据。如果你只使用 Free，我们的服务器上没有你的邮箱或设备名称。</p>

<h2 id="error-reports">错误报告：应用出错时会发送什么？</h2>
<p>应用出错时，会自动向我们发送一份错误报告，以便我们发现并修复问题。这项功能默认开启（包括从旧版本更新之后）；你可以在<strong>设置 › 隐私</strong>中关闭或重新开启，也可以在第一次打开应用时的使用条款步骤中直接取消勾选。<strong>关于</strong>页面上的<strong>向客服发送日志</strong>按钮会立即发送一份报告（即使你已关闭自动发送），并给你一个<strong>报告编号</strong>，方便你写进发给客服的邮件。</p>
<div class="table-wrap" role="region" aria-label="应用的错误报告" tabindex="0"><table>
<thead><tr><th scope="col">项目</th><th scope="col">详情</th></tr></thead>
<tbody>
<tr><th scope="row">何时发送</th><td>上一次运行意外结束时；翻译会话因应用内部错误而停止时（不包括由你或你的环境造成的错误，例如缺少录音权限、翻译时长用完或没有网络）；应用的某个辅助程序停止并重启时。只在应用没有翻译时发送，每台机器每天最多 5 份。</td></tr>
<tr><th scope="row">报告包含</th><td>报告编号、错误的类型和代码；应用版本、操作系统、芯片或 CPU、内存、GPU 类型、模型包、你的许可证套餐名称（从不包含密钥）、界面语言；哈希处理后的设备 ID；以及日志中与错误相关的部分，最多 64 KB。</td></tr>
<tr><th scope="row">报告不包含</th><td>音频、转写内容、译文、在输入翻译中输入的文字、许可证密钥、令牌、邮箱地址、电脑名称、操作系统用户名、IP 地址。应用在发送前会从日志中去除个人文件夹路径、密钥、令牌和邮箱地址；我们的服务器会再检查一次，如果还有残留就拒收这份报告。</td></tr>
<tr><th scope="row">如何与你关联</th><td>报告中哈希处理后的设备 ID 与我们为许可证和 Free 试用保存的是同一个，所以在处理支持请求时，我们可以把报告与这台机器的许可证和邮箱关联起来。</td></tr>
<tr><th scope="row">保存多久</th><td>最多 30 天，之后自动删除（服务器最多保存 3,000 份报告）。通过邮件提出的删除申请，也会删除曾为该邮箱激活过密钥的机器的报告。</td></tr>
</tbody></table></div>
<p>我们只用报告来发现和修复故障，不用于广告，也不会与下表中的处理方以外的任何人共享。完整内容见<a href="/en/privacy/">隐私政策（英文）</a>第 10 节。</p>

<h2 id="delete-data">如何删除我的数据？</h2>
${steps(
  [
    { title: "删除你电脑上的数据", text: "进入<strong>设置 › 隐私</strong>。<em>删除所有数据</em>会删除历史记录和术语表；<em>删除模型和数据</em>还会删除已下载的模型（在 macOS 上，请在把应用拖到废纸篓之前操作）。你的许可证、翻译时长和设置会保留。" },
    { title: "请我们删除服务器上的数据", text: `请<strong>用购买时使用的同一个邮箱</strong>发邮件到 ${MAIL}，以便我们确认是你本人。我们的隐私政策还按照越南个人数据保护法的规定，赋予你知悉所存内容、撤回同意和投诉的权利。我们会在法律规定的期限内处理申请。` },
    { title: "我们会做什么", text: "我们会删除你的邮箱和设备名称，并删除曾为该邮箱激活过密钥的机器的错误报告。你的许可证仍然可以使用，但无法再通过邮件找回。" },
  ],
  true,
)}
<p><strong>删除后我们仍会保留：</strong>哈希处理后的设备 ID（只用于防止滥用：一个密钥一台设备，每台设备一次 Free 试用）、你曾同意处理邮箱的时间，以及会计层面的订单记录（订单号、日期、金额和币种、支付网关的会话 ID）。会自行过期的技术日志和 Resend 的邮件日志不在我们的删除范围内，按各方自己的政策处理。你在 Creem 页面上填写的数据以及 Creem 保存的交易记录（作为销售方，它必须保存税务记录）不在发给我们的删除申请范围内；如需在 Creem 删除，请联系 Creem。从未激活过密钥的机器的错误报告不与任何邮箱关联，因此无法通过邮箱找到；它们会在 30 天后自动删除。</p>

<h2 id="processors">还有谁处理数据？</h2>
<div class="table-wrap" role="region" aria-label="处理数据的其他各方" tabindex="0"><table>
<thead><tr><th scope="col">处理方</th><th scope="col">角色</th><th scope="col">数据</th></tr></thead>
<tbody>
<tr><th scope="row">PayOS（越南）</th><td>处理 VietQR 付款</td><td>订单号、金额、订单说明。不含你的邮箱。</td></tr>
<tr><th scope="row">Creem（Armitage Labs OÜ，爱沙尼亚）</th><td>银行卡订单的销售方（merchant of record，即转售商）：处理付款、税费和收据</td><td>你一点击用银行卡付款（即使之后没有付款），我们就会发送订单号、套餐、金额、币种和你输入的邮箱，用来预先填写付款页面，并让 Creem 通过邮件给你发送收据。在付款页面上，Creem 自己收集你的卡号、姓名、账单地址和国家（用于计算税费）以及 IP 地址（用于防止欺诈）；我们不会收到你的卡号。Creem 按照自己的政策（https://www.creem.io/privacy）处理这些数据。Creem 发送到我们服务器的付款通知包含买家的姓名和国家；我们不保存这两项。</td></tr>
<tr><th scope="row">Cloudflare</th><td>运行许可证服务器和数据库；存储和分发模型及更新</td><td>上表中的数据，包括错误报告；会自行过期的技术日志</td></tr>
<tr><th scope="row">Resend</th><td>发送包含你密钥的邮件</td><td>你的邮箱和邮件内容（含密钥）；按 Resend 自己的政策保存的邮件日志</td></tr>
</tbody></table></div>
<p>Cloudflare 和 Resend 在越南境外运营服务器，Creem 是爱沙尼亚公司，所以数据可能在境外处理。我们不出售你的数据，也不为广告共享数据。</p>

<h2 id="protections">其他保护措施</h2>
<ul>
<li><strong>数字签名：</strong>应用更新在写入磁盘前会先检查签名；模型清单用 Ed25519 签名，每个文件都用 SHA-256 核对；许可证令牌用 Ed25519 签名，可以离线验证。应用中只有公钥。</li>
<li><strong>AI 处理与界面分离：</strong>它只与你电脑内的应用通信，不接受来自机器外部的连接，每次运行都使用一个随机密钥。</li>
<li><strong>敏感密钥不放在应用里：</strong>付款 API 密钥和签名密钥只在我们的服务器上；与我们服务器的连接使用 HTTPS。</li>
<li><strong>检测被篡改的应用：</strong>在 macOS 上，应用会检查自己的临时签名是否完好、bundle id 是否正确；签名不匹配的版本只能运行 Free 套餐。这是完整性检查，不能代替 Developer ID 签名。在 Windows 上，当前版本还没有代码签名，所以应用没有这项检查；请改为核对安装包的 SHA-256。</li>
</ul>

<h2 id="signing">目前的代码签名</h2>
<div class="table-wrap" role="region" aria-label="代码签名状态" tabindex="0"><table>
<thead><tr><th scope="col">平台</th><th scope="col">状态</th><th scope="col">对你意味着什么</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>临时签名，<strong>未经公证</strong>（我们还没有 Apple Developer ID）</td><td>在浏览器中下载的 .dmg 第一次打开时会被 macOS 阻止（你需要在“系统设置 › 隐私与安全性”中点击“仍要打开”）；用终端命令安装则可以直接打开。每次更新后，macOS 会再弹出 1 个钥匙串对话框，并可能再次请求录音权限。</td></tr>
<tr><th scope="row">Windows</th><td><strong>没有代码签名</strong>（我们还没有 Windows 代码签名证书）</td><td>用 PowerShell 命令安装不会触发 SmartScreen（PowerShell 下载的文件没有“从互联网下载”的标记）。在浏览器中下载的 .exe 可能显示“Windows 已保护你的电脑”：点击“更多信息”，然后点击“仍要运行”；发布者显示为“未知发布者”。处于阻止模式的智能应用控制会阻止未签名的版本。</td></tr>
</tbody></table></div>
<p>临时签名无法告诉 Apple 开发者是谁，所以请只用<a href="/zh/download/">下载页面</a>上的命令安装，或使用我们发给你的文件，并核对 SHA-256 校验值。未签名的 Windows 版本也一样（用下载页面上的命令安装，或使用我们发给你的文件）：Windows 无法确认文件的发布者，核对 SHA-256 就是你确认文件未被改动的方法。我们计划在条件允许时改用 Developer ID 和 Windows 代码签名证书，目前还没有确定日期。请参阅 <a href="/zh/guide/install-macos/">macOS</a> 和 <a href="/zh/guide/install-windows/">Windows</a> 的安装指南。</p>

<h2 id="limits">我们不承诺的事项</h2>
<ul>
<li>没有绝对安全的系统。如果发生影响个人数据的事件，我们会按法律要求进行通知。</li>
<li>我们没有检查过共享屏幕时观看者能否看到字幕条。如果你担心这一点，请在共享前用快捷键隐藏字幕条。</li>
<li>如果法律或你所在公司的政策有要求，你有责任告诉会议中的其他人你在使用翻译工具。</li>
</ul>
<p>发现了安全问题？请按照<a href="/zh/contact/#security">联系页面</a>上的步骤操作。</p>
`,
})}
${docNav(
  [
    { href: "/en/privacy/", kicker: "全文（英文）", title: "隐私政策" },
    { href: "/en/terms/", kicker: "全文（英文）", title: "使用条款" },
    { href: "/zh/guide/history-and-export/", kicker: "指南", title: "历史记录和导出" },
  ],
  "继续阅读",
)}
</div></section>

${ctaBand({ title: "放心试用，一切由你掌控", text: "直接在你的电脑上翻译，音频从不离开电脑。10 天 Free 试用，无需银行卡，无需账户。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/contact/", label: "联系我们" } })}
`,
};
