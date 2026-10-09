import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq, cmdBlock, chips, flow, osTabs } from "../../build/components.mjs";
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

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

const INSTALL_CMD = "curl -fsSL https://aitranslator.io.vn/install.sh | bash";
const INSTALL_CMD_BETA = "curl -fsSL https://aitranslator.io.vn/install.sh | bash -s -- --beta";
const INSTALL_CMD_REVIEW = "curl -fsSL https://aitranslator.io.vn/install.sh -o install.sh && less install.sh && bash install.sh";
const WIN_CMD = "irm https://aitranslator.io.vn/install.ps1 | iex";
const WIN_CMD_BETA = "& ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta";
const WIN_CMD_REVIEW = "$s = irm https://aitranslator.io.vn/install.ps1; $s | more; iex $s";

const COPY = { copy: "Copy", copied: "Copied" };

const DL_FAQ = [
  {
    q: "What does the one-line command do, and is it safe?",
    a: `<p>The command downloads a small script from <strong>aitranslator.io.vn</strong>. The script checks your computer, reads the latest version number, downloads the installer and its SHA-256 checksum from <strong>releases.aitranslator.io.vn</strong>, compares the checksum, installs the app and opens it. It sends no data and needs no administrator rights.</p><p>Running a command you paste from the internet always means trusting its source. If you would rather read the script before running it, open “I want to read the script first” in the guide for your operating system. The SHA-256 checksum is served from the same place as the file, so it mainly protects you from a corrupted download; it does not replace trusting the source.</p>`,
  },
  {
    q: "Why is there no .dmg or .exe download button?",
    a: `<p>The beta is not yet signed by Apple or Microsoft (we do not have an Apple Developer ID or a Windows code-signing certificate). A file downloaded in a browser is tagged “downloaded from the internet”, so macOS blocks the first launch of a .dmg (Open Anyway) and Windows SmartScreen may warn about an .exe. A file downloaded by a command in Terminal or PowerShell does not get that tag, so the app installs and opens directly. Once we have the certificates we will add a direct download button.</p>`,
  },
  {
    q: "How do I update or uninstall?",
    a: `<p>The app checks for new versions itself (Settings › General). You can also run the same install command at any time to install the latest version; the script quits the running app and replaces the old one. To uninstall, delete the models and data inside the app first, then remove the app; see the uninstall guides for <a href="/en/guide/install-macos/#uninstall">macOS</a> and <a href="/en/guide/install-windows/#uninstall">Windows</a>.</p>`,
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
    a: `<p>There are Stable and Beta update channels under Settings › General › Update channel. The app checks at launch and every 24 hours; changing channel checks right away. On macOS each update asks again for 1 Keychain approval; on Windows nothing extra is asked.</p>`,
  },
];

const macPanel = () => `
${chips([["command", "macOS 14.2 or later"], ["cpu", "Apple Silicon (M1 or newer)"], ["download", "About 9 MB installer"], ["shield", "No administrator password"]])}
${flow([
  { title: "Open Terminal", text: "<p>Press <kbd>⌘</kbd> + <kbd>Space</kbd>, type <strong>Terminal</strong> and press Enter.</p>" },
  {
    title: "Paste this command and press Enter",
    text: `<p>Click <strong>Copy</strong>, then paste into Terminal with <kbd>⌘</kbd> + <kbd>V</kbd>.</p>${cmdBlock({ cmd: INSTALL_CMD, ...COPY, label: "Command that installs AI Translator on macOS", term: "Terminal" })}<p class="small">No password needed. Run the same command again at any time to update to the latest version.</p>`,
  },
  { title: "Wait for the app to open", text: "<p>About a minute: the command downloads the latest version, checks its SHA-256, copies AI Translator to Applications and opens it. The first time you click <strong>Start</strong>, macOS asks for system audio recording permission: choose Allow.</p>" },
])}
<div class="panel-more">
<h3>Options and troubleshooting</h3>
${faq(
  [
    {
      q: "Why is there no Open Anyway step?",
      a: "<p>The macOS build is not notarized by Apple yet (we do not have an Apple Developer ID), so macOS blocks a .dmg downloaded in a browser on its first launch. A file downloaded by a command in Terminal is not tagged “downloaded from the internet” by macOS, so the app opens directly. The trade-off is that you have to trust the command's source: see the question below.</p>",
    },
    {
      q: "I want to read the script first",
      a: `<p>The script is at <a href="/install.sh">aitranslator.io.vn/install.sh</a> (about 200 lines, commented). This command downloads it, lets you read it, and only then runs it:</p>${cmdBlock({ cmd: INSTALL_CMD_REVIEW, ...COPY, label: "Command that downloads the script for review before running it", term: "Terminal" })}`,
    },
    {
      q: "Install a newer beta (beta channel)",
      a: `<p>By default the command installs the stable version. To get a newer beta (when there is one), add <code>-s -- --beta</code> after <code>bash</code>:</p>${cmdBlock({ cmd: INSTALL_CMD_BETA, ...COPY, label: "Command that installs from the beta channel", term: "Terminal" })}`,
    },
    {
      q: "I downloaded the .dmg in a browser and macOS blocked it",
      a: "<p>The quickest fix is to run the install command above: it installs the latest version over it and the app opens directly. Or allow it by hand: open <strong>System Settings › Privacy &amp; Security</strong>, scroll to the bottom, click <strong>Open Anyway</strong> next to AI Translator and confirm with your password or Touch ID. See the <a href=\"/en/guide/install-macos/\">macOS installation guide</a>.</p>",
    },
    {
      q: "What does macOS ask after each update?",
      a: "<p>The ad-hoc signed build has a different signature after every release, so macOS asks again for Keychain access: <strong>1 dialog</strong> asking for your Mac login password (choose <strong>Always Allow</strong>), and the system audio recording permission may be asked for again once. Someone installing for the first time sees no Keychain dialog at all. Only the first update from 0.1.0 to 0.1.1 asks 5 times, once.</p>",
    },
    {
      q: "I would like the .dmg by email",
      a: `<p>Send us a short email at <a href="${MAILTO_MAC}">support@aitranslator.io.vn</a>; we reply with the .dmg and its SHA-256 checksum. A .dmg downloaded in a browser needs the Open Anyway step on first launch.</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>Want step-by-step help, including uninstalling?</p><a class="btn btn-secondary btn-sm" href="/en/guide/install-macos/">Full macOS guide ${icon("arrow-right")}</a></div>
`;

const winPanel = () => `
${chips([["windows", "Windows 10 or 11, 64-bit"], ["cpu", "CPU with AVX2"], ["download", "About 22 MB installer"], ["shield", "No administrator rights"]])}
${flow([
  { title: "Open PowerShell", text: "<p>Press the <kbd>Windows</kbd> key, type <strong>PowerShell</strong> and press Enter. You do not need to run it as administrator.</p>" },
  {
    title: "Paste this command and press Enter",
    text: `<p>Click <strong>Copy</strong>, then paste into PowerShell (right-click or <kbd>Ctrl</kbd> + <kbd>V</kbd>).</p>${cmdBlock({ cmd: WIN_CMD, ...COPY, label: "Command that installs AI Translator on Windows", term: "Windows PowerShell", prompt: "PS>" })}<p class="small">Run the same command again at any time to update to the latest version (the installer closes a running app and replaces the old one).</p>`,
  },
  { title: "Wait for the app to open", text: "<p>About a minute: the command downloads the latest version, checks its SHA-256, runs the installer silently for your account only and opens AI Translator. Windows asks for no recording permission; the app downloads its models once and is then ready to translate.</p>" },
])}
${callout({ kind: "warn", title: "The Windows install command is new", text: "We have tested it on only a few PCs. If it fails, send us the message it shows on the <a href=\"/en/contact/\">Contact page</a>, or get the .exe by email (last item below)." })}
<div class="panel-more">
<h3>Options and troubleshooting</h3>
${faq(
  [
    {
      q: "Why is there no SmartScreen warning?",
      a: "<p>The Windows build is not code-signed yet (we have not bought a Windows code-signing certificate). SmartScreen only checks files tagged “downloaded from the internet”, the tag a browser adds when you download a file. A file downloaded by PowerShell has no such tag, so the installer runs directly. You still have to trust the command's source: see the question below.</p>",
    },
    {
      q: "I want to read the script first",
      a: `<p>The script is at <a href="/install.ps1">aitranslator.io.vn/install.ps1</a> (commented). This command prints it so you can read it, and only then runs it:</p>${cmdBlock({ cmd: WIN_CMD_REVIEW, ...COPY, label: "Command that prints the script for review before running it", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "Install a newer beta (beta channel)",
      a: `<p>By default the command installs the stable version. To get a newer beta (when there is one), use this command:</p>${cmdBlock({ cmd: WIN_CMD_BETA, ...COPY, label: "Command that installs from the beta channel on Windows", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "Windows 11 says an app is blocked and offers no way past it",
      a: "<p>That is <strong>Smart App Control</strong>. In blocking mode it does not let unsigned apps with no reputation run, however they were installed. You can turn it off: open <strong>Windows Security › App &amp; browser control › Smart App Control settings</strong>, choose <strong>Off</strong>, then run the install command again. Once we have a Windows code-signing certificate this will stop being an issue. <a href=\"/en/guide/install-windows/#smart-app-control\">Details</a>.</p>",
    },
    {
      q: "I downloaded the .exe in a browser and SmartScreen warned me",
      a: "<p>The blue “Windows protected your PC” screen is normal for an unsigned build. If the file came from us and the SHA-256 matches, click <strong>More info</strong>, check that the App line shows the installer's file name, then click <strong>Run anyway</strong>. Or run the install command above: it installs the latest version without going through SmartScreen. <a href=\"/en/guide/install-windows/\">See the step-by-step guide</a>.</p>",
    },
    {
      q: "The command fails on a company or school PC",
      a: "<p>A managed PC may block PowerShell scripts (Constrained Language Mode). Use the .exe (we can email it to you) or ask the administrator.</p>",
    },
    {
      q: "I would like the .exe by email",
      a: `<p>Send us a short email at <a href="${MAILTO_WIN}">support@aitranslator.io.vn</a>; we reply with the .exe and its SHA-256 checksum. An .exe downloaded in a browser may trigger a SmartScreen warning.</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>Want step-by-step help, including uninstalling?</p><a class="btn btn-secondary btn-sm" href="/en/guide/install-windows/">Full Windows guide ${icon("arrow-right")}</a></div>
`;

export default {
  id: "download",
  lang: "en",
  path: "/en/download/",
  title: "Get the AI Translator beta: one-line install for macOS and Windows",
  description:
    "Get the AI Translator beta: install on macOS 14.2+ (Apple Silicon) or Windows 10/11 with one command, opens right away, no Open Anyway. 10-day free trial.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-09",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: plain(f.a) })))],
  llm: "Get the AI Translator beta: the page detects your operating system and opens the right guide. macOS installs with one Terminal command (curl ... install.sh | bash): it downloads the installer, checks its SHA-256 and opens the app, with no Open Anyway step. Windows installs with one PowerShell command (irm ... install.ps1 | iex); an .exe downloaded in a browser may trigger a SmartScreen warning because the build is not code-signed, and Smart App Control can block it. System requirements.",
  llmTitle: "Get the AI Translator beta",
  body: () => `
${pageHero({
  crumbs,
  title: "Get the AI Translator beta for macOS and Windows",
  lead: "Pick your operating system and paste one command into Terminal or PowerShell: the app is downloaded, checked and opened right away. Beta, 10-day free trial, no card needed.",
  meta: '<span id="os-detect" class="os-detect" hidden></span>',
})}

<section class="section-tight" id="install"><div class="container narrow">
${osTabs({
  labels: {
    list: "Choose your operating system",
    mine: "Your computer",
    detected: "We detected that you are using {os}",
    mobile: "You are viewing this on a phone or tablet. AI Translator runs on a macOS or Windows computer: open this page on your computer.",
    other: "AI Translator is only available for macOS and Windows for now, not for this computer's operating system. You can still read both guides below.",
    copyLink: "Copy page link",
    copied: "Copied",
  },
  tabs: [
    { key: "macos", id: "install-macos", icon: "command", title: "macOS", sub: "Apple Silicon · 14.2+", body: macPanel() },
    { key: "windows", id: "install-windows", icon: "windows", title: "Windows", sub: "10 / 11 · 64-bit", body: winPanel() },
  ],
})}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "At a glance", title: "The beta and the free trial", center: true })}
<div class="reveal">${facts([
  ["Status", "Beta. Both macOS and Windows install with one command"],
  ["Free trial", "10 days, 30 minutes per day<small>No card, no account</small>"],
  ["Price afterwards", "Monthly 50,000 ₫ · Yearly 500,000 ₫<small>Paid in VND by bank transfer from a Vietnamese bank (VietQR)</small>"],
  ["Models", "Downloaded once, 1.3 or 2.5 GB<small>After that, recognition and translation run offline on your machine</small>"],
])}</div>
${callout({ kind: "ok", title: "Only get the installer from us", text: "Install AI Translator only with the command on this page, or from a link sent by <strong>support@aitranslator.io.vn</strong> or from the website <strong>aitranslator.io.vn</strong>. Installers from any other source may be fake." })}
</div></section>

<section class="section"><div class="container">
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

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "About the beta and installing it" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Ready to try it on your next meeting?", text: "One command on a Mac or on Windows. 10-day free trial, no card needed.", primary: { href: "#install", label: "Choose your system and install" }, secondary: { href: "/en/guide/quick-start/", label: "Read the quick-start guide" } })}
`,
};
void feature;
void steps;
