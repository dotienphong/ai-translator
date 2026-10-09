import { pageHero, sectionHead, steps, callout, facts, ctaBand, icon, faq, cmdBlock } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Download", path: "/en/download/" },
];

const mailto = (subject, body) =>
  `mailto:support@aitranslator.io.vn?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body.join("\n"))}`;

const MAILTO_MAC = mailto("AI Translator beta request (macOS)", [
  "Hello AI Translator team,",
  "",
  "I would like to receive the macOS beta.",
  "",
  "- Full name:",
  "- Mac model and chip (for example MacBook Air M2):",
  "- macOS version:",
  "- RAM:",
  "- I plan to use it with (Zoom, Teams, Meet, Zalo, webinars...):",
  "- Languages I need translated (English, Chinese, Japanese, Korean, Vietnamese):",
  "",
  "Thank you!",
]);

const MAILTO_WIN = mailto("AI Translator beta request (Windows)", [
  "Hello AI Translator team,",
  "",
  "I would like to receive the Windows beta.",
  "",
  "- Full name:",
  "- PC model and processor (for example a Dell laptop, Intel Core i5-1235U):",
  "- Windows version (10 or 11):",
  "- RAM:",
  "- Graphics card (if any):",
  "- I plan to use it with (Zoom, Teams, Meet, Zalo, webinars...):",
  "- Languages I need translated (English, Chinese, Japanese, Korean, Vietnamese):",
  "",
  "Thank you!",
]);

const INSTALL_CMD = "curl -fsSL https://aitranslator.io.vn/install.sh | bash";
const INSTALL_CMD_BETA = "curl -fsSL https://aitranslator.io.vn/install.sh | bash -s -- --beta";
const WIN_CMD = "irm https://aitranslator.io.vn/install.ps1 | iex";
const WIN_CMD_BETA = "& ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta";
const WIN_CMD_REVIEW = "$s = irm https://aitranslator.io.vn/install.ps1; $s | more; iex $s";
const INSTALL_CMD_REVIEW = "curl -fsSL https://aitranslator.io.vn/install.sh -o install.sh && less install.sh && bash install.sh";

const DL_FAQ = [
  {
    q: "What does the one-line command do, and is it safe?",
    a: `<p>The command downloads a small script from <strong>aitranslator.io.vn</strong>. The script checks your Mac (macOS 14.2 or later, Apple Silicon), reads the latest version number, downloads the .dmg file and its SHA-256 checksum from <strong>releases.aitranslator.io.vn</strong>, compares the checksum, checks that the app's signature is intact, copies it to Applications and opens it. It does not use sudo, does not change any system setting and does not send any data.</p><p>Running a command you paste from the internet always means trusting its source. If you would rather read the script before running it, use the command under “Want to read the script first?” above. The SHA-256 checksum is served from the same place as the file, so it mainly protects you from a corrupted download; it does not replace trusting the source.</p>`,
  },
  {
    q: "Why is there no .dmg download button, and why does this command not get blocked by macOS?",
    a: `<p>The macOS build is ad-hoc signed and has not been notarized by Apple (we do not have an Apple Developer ID yet). A .dmg downloaded in a browser is tagged by macOS as “downloaded from the internet”, and Gatekeeper blocks its first launch: you have to choose Open Anyway in System Settings › Privacy &amp; Security. A file downloaded by the <code>curl</code> command in Terminal does not get that tag, so the app opens directly. Once we have a Developer ID we will add a direct .dmg download button.</p>`,
  },
  {
    q: "I already downloaded the .dmg in my browser. Now what?",
    a: `<p>The first launch will be blocked. The quickest fix is to run the install command above: it installs the latest version over it and the app opens directly. Or follow the <a href="/en/guide/install-macos/">macOS installation guide</a> (Open Anyway).</p>`,
  },
  {
    q: "How do I update or uninstall?",
    a: `<p>The app checks for new versions itself (Settings › General). You can also run the same install command at any time to install the latest version; the script quits the running app and replaces the old one. To uninstall, delete the models and data inside the app first, then drag the app to the Trash; see the <a href="/en/guide/install-macos/#uninstall">uninstall guide</a>.</p>`,
  },
  {
    q: "What does the PowerShell command do, and why does Windows not warn me?",
    a: `<p>The command downloads a small script from <strong>aitranslator.io.vn</strong>. The script checks your PC (Windows 10 or 11, x64), reads the latest version number, downloads the .exe installer and its SHA-256 checksum from <strong>releases.aitranslator.io.vn</strong>, compares the checksum, runs the installer silently (for your account only, no administrator rights) and opens the app. It sends no data. The SHA-256 is served from the same place as the file, so it mainly protects against a corrupted download; you are still trusting <strong>aitranslator.io.vn</strong>.</p><p>The Windows build is not code-signed yet (we do not have a Windows code-signing certificate). SmartScreen only checks files tagged “downloaded from the internet”; a file downloaded by PowerShell has no such tag, so the installer runs directly.</p>`,
  },
  {
    q: "I already downloaded the .exe in my browser. Now what?",
    a: `<p>Microsoft Defender SmartScreen may show “Windows protected your PC”. If the file came from us and the SHA-256 matches, click More info, then Run anyway. Or run the install command above: it installs the latest version without going through SmartScreen. <a href="/en/guide/install-windows/">See the step-by-step guide</a>.</p>`,
  },
  {
    q: "Windows 11 says the app is blocked and offers no way past it. What now?",
    a: `<p>That is <strong>Smart App Control</strong>. In blocking mode it does not let unsigned apps with no reputation run, however they were installed. You can turn it off in Windows Security › App &amp; browser control › Smart App Control settings. Once we have a Windows code-signing certificate this will stop being an issue. <a href="/en/guide/install-windows/#smart-app-control">Details</a>.</p>`,
  },
  {
    q: "Can I use a Mac with an Intel chip?",
    a: `<p>Not yet. AI Translator needs a Mac with an Apple Silicon chip (M1 or newer) and macOS 14.2 or later. The install command stops and tells you why if your Mac does not qualify.</p>`,
  },
  {
    q: "Which Windows PCs can run it?",
    a: `<p>Windows 10 or 11, 64-bit (x64), with a CPU that supports AVX2 and at least 8 GB of RAM. Windows ARM64 is not supported yet. Without AVX2 or with less than 8 GB of RAM, the app explains why and does not let you download the models. We have not measured latency on Windows, so we make no promise about it.</p>`,
  },
  {
    q: "Does the beta update itself?",
    a: `<p>There are Stable and Beta update channels under Settings › General › Update channel. The app checks for new versions at launch and every 24 hours. The Windows build also has the Stable and Beta channels, and you can run the install command again to update.</p>`,
  },
];

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

export default {
  id: "download",
  lang: "en",
  path: "/en/download/",
  title: "Get the AI Translator beta: one-line install for macOS and Windows",
  description:
    "Install the AI Translator beta on macOS 14.2+ (Apple Silicon) with one Terminal command, no Open Anyway. Windows with one PowerShell command. 10-day free trial.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-09",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: plain(f.a) })))],
  llm: "Install the AI Translator beta on macOS with one Terminal command (curl ... install.sh | bash): it downloads the installer, checks its SHA-256 and opens the app, with no Open Anyway step. Windows installs with one PowerShell command (irm ... install.ps1 | iex); an .exe downloaded in a browser may trigger a SmartScreen warning because the build is not code-signed, and Smart App Control can block it. System requirements.",
  llmTitle: "Get the AI Translator beta",
  body: () => `
${pageHero({ crumbs, title: "Get the AI Translator beta for macOS and Windows", lead: "On macOS you paste one command into Terminal, on Windows into PowerShell: the app is downloaded, checked and opened right away, with no trip to System Settings to click Open Anyway and no SmartScreen screen." })}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Status", "Beta. Both macOS and Windows install with one command"],
  ["Version", "0.1.0 (beta)<small>The install command always fetches the latest version of the channel</small>"],
  ["macOS", "14.2 or later, Apple Silicon (M1+)<small>The .dmg installer is about 9 MB; the models are an extra 1.3 or 2.5 GB download</small>"],
  ["Windows", "Windows 10/11 64-bit (x64), CPU with AVX2<small>The .exe installer is about 22 MB; the models are an extra 1.3 or 2.5 GB download</small>"],
  ["Free trial", "10 days, 30 minutes per day<small>No card, no account</small>"],
  ["Price afterwards", "Monthly 50,000 ₫ · Yearly 500,000 ₫<small>Paid in VND by bank transfer from a Vietnamese bank (VietQR)</small>"],
])}</div>
</div></section>

<section class="section section-alt" id="install-macos"><div class="container narrow">
${sectionHead({ eyebrow: "macOS", title: "Install on macOS with one command", text: "The fastest way to install AI Translator on an Apple Silicon Mac. It takes about a minute, depending on your connection." })}
${cmdBlock({ cmd: INSTALL_CMD, copy: "Copy command", copied: "Copied", label: "Command that installs AI Translator on macOS" })}
${steps([
  { title: "Open Terminal", text: "Press <kbd>⌘</kbd> + <kbd>Space</kbd>, type <strong>Terminal</strong> and press Enter." },
  { title: "Paste the command above and press Enter", text: "Click Copy command, then paste into Terminal (<kbd>⌘</kbd> + <kbd>V</kbd>). No password is needed." },
  { title: "Wait for the app to open", text: "The command downloads the latest version, checks its SHA-256, copies AI Translator to your Applications folder and opens it. macOS will ask for system audio recording permission: choose Allow." },
])}
<p class="small muted">The command does not use sudo and needs no password. If the Applications folder is not writable, the app goes to <code>~/Applications</code> instead. Run the same command again at any time to install the latest version.</p>
${callout({ kind: "ok", title: "Why is there no Open Anyway step?", text: "The macOS build is not notarized by Apple yet (we do not have an Apple Developer ID), so macOS blocks a .dmg downloaded in a browser on its first launch. A file downloaded by a command in Terminal is not tagged “downloaded from the internet” by macOS, so the app opens directly. The trade-off is that you have to trust the command's source: see below." })}

<h3>Want to read the script first?</h3>
<p>The script is at <a href="/install.sh">aitranslator.io.vn/install.sh</a> (about 200 lines, commented). This command downloads it, lets you read it, and only then runs it:</p>
${cmdBlock({ cmd: INSTALL_CMD_REVIEW, copy: "Copy command", copied: "Copied", label: "Command that downloads the script for review before running it" })}
<h3>Beta channel</h3>
<p>By default the command installs the stable version. To get a newer beta (when there is one), add <code>-s -- --beta</code> after <code>bash</code>:</p>
${cmdBlock({ cmd: INSTALL_CMD_BETA, copy: "Copy command", copied: "Copied", label: "Command that installs from the beta channel" })}
<div class="row center center-text reveal"><a class="btn btn-secondary" href="/en/guide/install-macos/">Read the macOS installation guide ${icon("arrow-right")}</a> <a class="btn btn-secondary" href="/en/guide/quick-start/">Quick start ${icon("arrow-right")}</a></div>
<p class="disclaimer">Prefer to receive the macOS .dmg by email instead of using the command? <a href="${MAILTO_MAC}">Send a request</a>; a .dmg downloaded in a browser needs the Open Anyway step on first launch.</p>
</div></section>

<section class="section" id="install-windows"><div class="container narrow">
${sectionHead({ eyebrow: "Windows", title: "Install on Windows with one command", text: "Paste one line into PowerShell: the installer is downloaded, checked and installed for your account only (no administrator rights), then the app opens." })}
${cmdBlock({ cmd: WIN_CMD, copy: "Copy command", copied: "Copied", label: "Command that installs AI Translator on Windows" })}
${steps([
  { title: "Open PowerShell", text: "Press the <kbd>Windows</kbd> key, type <strong>PowerShell</strong> and press Enter. You do not need to run it as administrator." },
  { title: "Paste the command above and press Enter", text: "Click Copy command, then paste into PowerShell (right-click or <kbd>Ctrl</kbd> + <kbd>V</kbd>)." },
  { title: "Wait for the app to open", text: "The command downloads the latest version, checks its SHA-256, runs the installer silently and opens AI Translator. Windows asks for no recording permission; the app downloads its models once and is then ready to translate." },
])}
<p class="small muted">The command uses no administrator rights. Run the same command again at any time to update to the latest version (the installer closes a running app and replaces the old one). Needs 64-bit (x64) Windows 10 or 11.</p>
<p class="small muted"><strong>The Windows install command is new</strong> and we have tested it on only a few PCs. If it fails, send us the message it shows on the <a href="/en/contact/">Contact page</a>, or get the .exe by email (see the end of this section).</p>
${callout({ kind: "ok", title: "Why is there no SmartScreen warning?", text: "The Windows build is not code-signed yet (we have not bought a Windows code-signing certificate). SmartScreen only checks files tagged “downloaded from the internet”, the tag a browser adds when you download a file. A file downloaded by PowerShell has no such tag, so the installer runs directly. You still have to trust the command's source: see below." })}
${callout({ kind: "warn", title: "Smart App Control can still block it", text: "Windows 11 has a feature called <strong>Smart App Control</strong>. When it is in blocking mode it blocks every app that is unsigned and has no reputation, however it was installed, and offers no way to bypass it. If you hit that, turn Smart App Control off in Windows Security › App &amp; browser control › Smart App Control settings, or wait until we have a code-signing certificate. <a href=\"/en/guide/install-windows/#smart-app-control\">Details</a>." })}

<h3>Want to read the script first?</h3>
<p>The script is at <a href="/install.ps1">aitranslator.io.vn/install.ps1</a> (commented). This command prints it so you can read it, and only then runs it:</p>
${cmdBlock({ cmd: WIN_CMD_REVIEW, copy: "Copy command", copied: "Copied", label: "Command that prints the script for review before running it" })}
<h3>Beta channel</h3>
<p>By default the command installs the stable version. To get a newer beta (when there is one), use this command:</p>
${cmdBlock({ cmd: WIN_CMD_BETA, copy: "Copy command", copied: "Copied", label: "Command that installs from the beta channel on Windows" })}
<div class="row center center-text reveal"><a class="btn btn-secondary" href="/en/guide/install-windows/">Read the Windows installation guide ${icon("arrow-right")}</a></div>
<p class="disclaimer">Prefer to receive the .exe by email instead of using the command? <a href="${MAILTO_WIN}">Send a request</a>. An .exe downloaded in a browser may trigger a SmartScreen warning: click More info › Run anyway.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "If you download the .dmg in a browser, macOS will block the first launch", text: "In that case open <strong>System Settings › Privacy &amp; Security</strong>, scroll to the bottom and click <strong>Open Anyway</strong> next to AI Translator. The simpler way is to run the install command above. After every update to a new version, macOS also asks again for 1 Keychain approval (your login password) and may ask again for the audio-recording permission; the app warns you about this when it offers the update. This will go away once we have a Developer ID." })}
${callout({ kind: "warn", title: "Windows may warn you when you open the installer. That is expected.", text: "The Windows build is not code-signed (we have not bought a Windows code-signing certificate yet). When you open the installer, Microsoft Defender SmartScreen may show the blue “Windows protected your PC” screen. Click <strong>More info</strong>, check that the App line shows the installer's file name, then click <strong>Run anyway</strong>. Your browser may also warn that the file is not commonly downloaded. The installer needs no administrator rights. Once we have a certificate, the warnings will decrease over time. <a href=\"/en/guide/install-windows/\">See the Windows installation guide</a>." })}
${callout({ kind: "ok", title: "Only get the installer from us", text: "Install AI Translator only with the command on this page, or from a link sent by <strong>support@aitranslator.io.vn</strong> or from the website <strong>aitranslator.io.vn</strong>. Installers from any other source may be fake." })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "System requirements", title: "Will it run on your computer?", center: true })}
<div class="table-wrap reveal" role="region" aria-label="System requirements" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">Requirement</span></th><th scope="col">macOS (beta)</th><th scope="col">Windows (beta)</th></tr></thead>
<tbody>
<tr><th scope="row">Operating system</th><td>macOS 14.2 or later</td><td>Windows 10 or 11, 64-bit (x64)</td></tr>
<tr><th scope="row">Processor</th><td>Apple Silicon (M1 or newer). No version for Intel Macs</td><td>CPU with AVX2. Windows ARM64 is not supported yet</td></tr>
<tr><th scope="row">RAM</th><td>At least 8 GB, 16 GB recommended</td><td>At least 8 GB, 16 GB recommended</td></tr>
<tr><th scope="row">Graphics</th><td>Apple GPU</td><td>For the Standard pack, a discrete graphics card with 6 GB or more of VRAM is recommended; without one it runs on the CPU</td></tr>
<tr><th scope="row">Disk space</th><td>1.3 GB (Lite pack) or 2.5 GB (Standard pack), plus 1 GB free while downloading</td><td>The same</td></tr>
<tr><th scope="row">Installer</th><td>A .dmg file of about 9 MB (the install command downloads it for you)</td><td>An .exe file of about 22 MB that installs for your account only, with no administrator rights</td></tr>
<tr><th scope="row">Code signing</th><td>Ad-hoc signed, not notarized: opens directly when installed with the command; a .dmg downloaded in a browser needs Open Anyway on first launch</td><td>Not code-signed: installed with the command, SmartScreen does not ask; an .exe downloaded in a browser may be warned about; Smart App Control in blocking mode blocks it</td></tr>
<tr><th scope="row">Permission</th><td>System audio recording (the microphone is not used)</td><td>No audio-recording permission needed</td></tr>
</tbody></table></div>
<p class="small muted">If a computer has less than 8 GB of RAM or a processor without AVX2, the app explains why and does not let you download the models. There is no build for Intel Macs.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "About the beta and installing it" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Install AI Translator now", text: "One command on a Mac or on Windows. 10-day free trial, no card needed.", primary: { href: "#install-macos", label: "macOS command" }, secondary: { href: "#install-windows", label: "Windows command" } })}
`,
};
