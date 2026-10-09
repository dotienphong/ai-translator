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
    q: "Why does Windows warn me when I open the installer?",
    a: `<p>The Windows build is not code-signed yet, because we do not have a Windows code-signing certificate yet. So Microsoft Defender SmartScreen may show the “Windows protected your PC” screen. If the file came from us and the SHA-256 matches, click More info, then Run anyway. Once we have a certificate, the warnings will decrease over time; SmartScreen needs time to build a reputation for a new file, so we do not promise they will disappear right away. <a href="/en/guide/install-windows/">See the step-by-step guide</a>.</p>`,
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
    a: `<p>There are Stable and Beta update channels under Settings › General › Update channel. The app checks for new versions at launch and every 24 hours. The Windows installer we email you at first may not update itself yet; we will say so when we send it.</p>`,
  },
];

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

export default {
  id: "download",
  lang: "en",
  path: "/en/download/",
  title: "Get the AI Translator beta: one-line install for macOS",
  description:
    "Install the AI Translator beta on macOS 14.2+ (Apple Silicon) with one Terminal command and open it right away, no Open Anyway. Windows by email. 10-day free trial.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-09",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: plain(f.a) })))],
  llm: "Install the AI Translator beta on macOS with one Terminal command (curl ... install.sh | bash): it downloads the installer, checks its SHA-256 and opens the app, with no Open Anyway step. The Windows installer comes by email; More info › Run anyway if SmartScreen warns because the build is not code-signed. System requirements.",
  llmTitle: "Get the AI Translator beta",
  body: () => `
${pageHero({ crumbs, title: "Get the AI Translator beta for macOS and Windows", lead: "On macOS you paste one command into Terminal: the app is downloaded, checked and opened right away, with no trip to System Settings to click Open Anyway. The Windows beta is sent by email for now." })}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Status", "Beta. macOS installs with one command; the Windows installer comes by email"],
  ["Version", "0.1.0 (beta)<small>The install command always fetches the latest version of the channel</small>"],
  ["macOS", "14.2 or later, Apple Silicon (M1+)<small>The .dmg installer is about 9 MB; the models are an extra 1.3 or 2.5 GB download</small>"],
  ["Windows", "Windows 10/11 64-bit (x64), CPU with AVX2<small>The .exe installer is under 60 MB; the models are an extra 1.3 or 2.5 GB download</small>"],
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
</div></section>

<section class="section" id="install-windows"><div class="container narrow">
${sectionHead({ eyebrow: "Windows", title: "Windows: get the installer by email", text: "We are sending the Windows beta to testers one by one, with instructions and a SHA-256 checksum." })}
${steps([
  { title: "Email us", text: "Tell us about your computer (model, processor, Windows version, RAM) and which meeting apps you plan to use it with." },
  { title: "Receive the installer and the SHA-256 checksum", text: "We send you a link to the .exe file together with its SHA-256 checksum, so you can check that the file has not been altered." },
  { title: "Install and open it", text: "Run the installer and click More info › Run anyway if SmartScreen warns you. No audio permission is needed. The app downloads its models once and is then ready to translate." },
])}
<div class="row center center-text reveal"><a class="btn btn-primary btn-lg" href="${MAILTO_WIN}">${icon("mail")} Request the Windows beta</a> <a class="btn btn-secondary" href="/en/guide/install-windows/">Read the Windows installation guide ${icon("arrow-right")}</a></div>
<p class="disclaimer">The button opens your email app with a ready-made message. If it does not open, write to <strong>support@aitranslator.io.vn</strong> yourself. Prefer to receive the macOS .dmg by email instead of using the command? <a href="${MAILTO_MAC}">Send a request</a>; a .dmg downloaded in a browser needs the Open Anyway step on first launch.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "If you download the .dmg in a browser, macOS will block the first launch", text: "In that case open <strong>System Settings › Privacy &amp; Security</strong>, scroll to the bottom and click <strong>Open Anyway</strong> next to AI Translator. The simpler way is to run the install command above. After every update to a new version, macOS also asks again for 5 Keychain approvals and 1 audio-recording permission; the app warns you about this when it offers the update. This will go away once we have a Developer ID." })}
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
<tr><th scope="row">Installer</th><td>A .dmg file of about 9 MB (the install command downloads it for you)</td><td>An .exe file under 60 MB that installs for your account only, with no administrator rights</td></tr>
<tr><th scope="row">Code signing</th><td>Ad-hoc signed, not notarized: opens directly when installed with the command; a .dmg downloaded in a browser needs Open Anyway on first launch</td><td>Not code-signed: SmartScreen may warn when you open the installer</td></tr>
<tr><th scope="row">Permission</th><td>System audio recording (the microphone is not used)</td><td>No audio-recording permission needed</td></tr>
</tbody></table></div>
<p class="small muted">If a computer has less than 8 GB of RAM or a processor without AVX2, the app explains why and does not let you download the models. There is no build for Intel Macs.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "About the beta and installing it" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Install AI Translator on your Mac now", text: "One command in Terminal. 10-day free trial, no card needed.", primary: { href: "#install-macos", label: "See the macOS command" }, secondary: { href: MAILTO_WIN, label: "Request the Windows beta" } })}
`,
};
