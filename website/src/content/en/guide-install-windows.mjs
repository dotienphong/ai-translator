import { pageHero, callout, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Install on Windows", path: "/en/guide/install-windows/" },
];

const toc = [
  { level: 2, id: "requirements", text: "Will it run on your PC?" },
  { level: 2, id: "verify-the-file", text: "Verify the installer (SHA-256)" },
  { level: 2, id: "run-the-installer", text: "Run the installer and get past SmartScreen" },
  { level: 2, id: "first-launch", text: "First launch" },
  { level: 2, id: "updates", text: "Updates" },
  { level: 2, id: "uninstall", text: "Uninstall properly" },
  { level: 2, id: "common-problems", text: "Common installation problems" },
];

const HOWTO_STEPS = [
  { name: "Check the SHA-256 of the .exe file", text: "Run Get-FileHash -Algorithm SHA256 on the .exe in PowerShell and compare it with the SHA-256 we sent with the installer." },
  { name: "Open the installer", text: "Double-click the AI Translator_<version>_x64-setup.exe file you downloaded." },
  { name: "Click More info if SmartScreen appears", text: "If Windows shows the blue “Windows protected your PC” screen, click More info and check that the App line shows the installer's file name." },
  { name: "Click Run anyway", text: "Click Run anyway to start the installer. Publisher showing Unknown publisher is normal for a build that is not code-signed." },
  { name: "Finish and open the app", text: "Follow the installer to the end; no administrator rights are needed. Open AI Translator and follow the first-time setup." },
];

export default {
  id: "guide-install-windows",
  lang: "en",
  path: "/en/guide/install-windows/",
  title: "Install AI Translator on Windows",
  description:
    "How to install AI Translator on Windows 10/11: requirements, verify SHA-256, get past the SmartScreen warning with Run anyway, first launch, updates, uninstalling.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Installing AI Translator on Windows 10/11 x64: requirements, SHA-256 check in PowerShell, a per-user .exe installer with no administrator rights, More info › Run anyway if SmartScreen warns because the build is not code-signed, first launch, updates and uninstalling.",
  llmTitle: "Install AI Translator on Windows",
  schema: [
    howTo({
      name: "Install and first-launch AI Translator on Windows",
      description: "Verify the installer, run the .exe and get past the Microsoft Defender SmartScreen warning if it appears.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Install AI Translator on Windows",
  lead: "To install AI Translator on Windows, check the SHA-256 of the .exe file, then double-click it to run the installer. No administrator rights are needed. Because the beta is not code-signed yet, Microsoft Defender SmartScreen may show a warning screen: click More info, then Run anyway.",
  meta: "<span>For Windows 10 and 11, 64-bit (x64)</span> <span>Updated October 8, 2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "In this guide",
  body: `
<h2 id="requirements">Will it run on your PC?</h2>
${facts([
  ["Operating system", "Windows 10 or 11, 64-bit (x64)<small>Windows ARM64 is not supported yet.</small>"],
  ["Processor", "A CPU with AVX2<small>Without AVX2, the app explains why and will not download a model.</small>"],
  ["Memory", "8 GB minimum, 16 GB recommended<small>Under 8 GB, the app explains why and will not download a model.</small>"],
  ["Graphics", "For the Standard pack, a discrete graphics card with 6 GB or more of VRAM is recommended<small>Without one, it runs on the CPU.</small>"],
  ["Installer", "One .exe file under 60 MB<small>Installs for your Windows account only, with no administrator rights.</small>"],
  ["Disk space for models", "1.3 GB (Lite pack) or 2.5 GB (Standard pack)<small>Plus 1 GB free while downloading.</small>"],
  ["Internet", "Needed to download the model and register the Free trial<small>Possibly also during installation (see below). After that, translation runs offline.</small>"],
])}
<p class="small muted">During internal testing we tried system audio capture and the subtitle bar on Windows 11. We have not measured on Windows: latency, a proxy check of network traffic, specific meeting apps with the release build, high-DPI screens or multiple monitors. So we make no latency promise on Windows. On a PC without a capable discrete card, use the Lite pack.</p>

<h2 id="verify-the-file">Verify the installer (SHA-256)</h2>
${callout({ kind: "warn", title: "Only download the installer from an official source.", text: "The genuine .exe is the one we send from <strong>support@aitranslator.io.vn</strong> or link to on <strong>aitranslator.io.vn</strong>. A file from anywhere else could be fake or tampered with. Do not run it, even if it is named AI Translator." })}
<p>Every installer comes with a SHA-256 checksum that we send you. Because the Windows build is not code-signed, comparing it is how you make sure the file has not been altered. Do this before installing:</p>
<ol>
<li>Open <strong>PowerShell</strong>: click Start, type <code>PowerShell</code> and open <strong>Windows PowerShell</strong>.</li>
<li>Type the command below, replacing <code>&lt;file-name&gt;</code> with the name of the file you downloaded, then press Enter. The file name contains spaces, so keep the whole path in double quotes as in the example.</li>
</ol>
<div class="table-wrap"><pre><code>Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\\Downloads\\&lt;file-name&gt;.exe"</code></pre></div>
<ol start="3">
<li>Compare the 64-character string in the <strong>Hash</strong> column with the one we sent. PowerShell prints it in capitals; upper or lower case does not matter, but every character must match.</li>
<li>If they differ, do not run the file. Download it again; if it still differs, <a href="/en/contact/">contact support</a>.</li>
</ol>

<h2 id="run-the-installer">Run the installer and get past the SmartScreen warning</h2>
<p>The installer is a file named like <code>AI Translator_&lt;version&gt;_x64-setup.exe</code>. It installs AI Translator for your Windows account only, into <code>%LOCALAPPDATA%\\AI Translator\\</code>, so it needs no administrator rights and shows no administrator (UAC) prompt. The installer appears in Vietnamese or English, depending on your Windows language.</p>
<p><strong>If your browser warns you while downloading.</strong> The browser may say the file is not commonly downloaded. In Microsoft Edge, click “…” next to the file in the downloads list › <strong>Keep</strong> › <strong>Show more</strong> › <strong>Keep anyway</strong>. In Chrome, click <strong>Keep</strong>. Only do this for a file from an official source.</p>
<ol>
<li>Double-click the <code>.exe</code> file you downloaded (usually in your Downloads folder).</li>
<li>If Windows shows the blue <strong>“Windows protected your PC”</strong> screen (Microsoft Defender SmartScreen), click <strong>More info</strong>.</li>
<li>Check the <strong>App</strong> line: it must be the installer file whose SHA-256 you just checked. <strong>Publisher</strong> shows <strong>Unknown publisher</strong>: that is normal for a build that is not code-signed.</li>
<li>Click <strong>Run anyway</strong>.</li>
<li>Follow the installer to the end. If your PC is missing a Windows display component the app needs, the installer downloads it, so you need an internet connection at this point (Windows 11 usually has it already).</li>
</ol>
<p>If the blue screen does not appear, just install as usual. Button names may differ if Windows is set to another language.</p>
${callout({ kind: "warn", title: "Why does Windows warn you?", text: "SmartScreen warns about files that are not code-signed or not yet commonly downloaded. The current Windows build is not code-signed because we do not have a Windows code-signing certificate yet (just as the macOS build has no Apple Developer ID yet). If the file came from us and the SHA-256 matches, this is the normal path for this build. Once we have a certificate, the warnings will decrease over time; SmartScreen needs time to build a reputation for a new file, so we do not promise they will disappear right away." })}

<h2 id="first-launch">First launch</h2>
<ol>
<li>Open <strong>AI Translator</strong> from the Start menu.</li>
<li>The app shows its first-time setup. There is no audio permission step on Windows: the app captures the sound playing on your PC without a separate permission, and it does not use the microphone.</li>
<li>Continue with the <a href="/en/guide/quick-start/">quick start guide</a>.</li>
</ol>
<p>AI Translator lives in the system tray. Closing the window only hides the app; to quit completely, choose <strong>Quit</strong> from the tray icon. Windows may hide new icons behind the <strong>^</strong> arrow on the taskbar: drag the icon onto the taskbar, or turn it on in Taskbar settings. Shortcuts on Windows use Ctrl+Alt (see <a href="/en/guide/subtitle-bar-and-shortcuts/">the subtitle bar and shortcuts</a>).</p>

<h2 id="updates">Updates</h2>
<p>An installer we send by hand during the beta may not update itself. In that case we email you the new installer with its new SHA-256: check it, then run the installer as you did the first time. SmartScreen may warn again for the new file.</p>

<h2 id="uninstall">Uninstall properly</h2>
<ol>
<li>Open AI Translator and go to <strong>Settings › Privacy</strong>.</li>
<li>Click <strong>Delete models and data</strong>, then confirm with <strong>Delete everything</strong>. The app removes every downloaded model (1.3 or 2.5 GB), your history and your glossary.</li>
<li>Choose <strong>Quit</strong> from the AI Translator icon in the system tray.</li>
<li>Open <strong>Settings › Apps › Installed apps</strong>, find <strong>AI Translator</strong> and click <strong>Uninstall</strong>.</li>
</ol>
<p>The uninstaller has an option to delete the app data: tick it and the models are removed too, even if you skipped steps 1–2. Your license and remaining quota are kept, so reinstalling should not lose a plan you bought. The Free trial is tied to your PC, so reinstalling does not reopen the 10 days. Data and models live in <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\</code> (models in the <code>models</code> subfolder); keys, tokens and quota counters are kept in Credential Manager.</p>

<h2 id="common-problems">Common installation problems</h2>
<ul>
<li><strong>SmartScreen has no Run anyway button.</strong> A policy on your PC (for example on a computer managed by your company or school) may block apps that are not code-signed. Ask the person who manages the computer.</li>
<li><strong>Antivirus software blocks or removes the installer.</strong> Check the SHA-256 again. If it matches and the installer is still blocked, <a href="/en/contact/">contact support</a> and tell us which antivirus you use.</li>
<li><strong>The app says “This computer's processor lacks AVX2, which AI Translator needs.”</strong> Without AVX2 the app cannot download a model.</li>
<li><strong>The app says “This computer has less than 8 GB of RAM, which AI Translator does not support yet.”</strong> PCs under 8 GB cannot download a model.</li>
<li><strong>Windows ARM64 PCs.</strong> Not supported yet: there is only an x64 Windows build, and we have not tested it on ARM64 machines.</li>
<li><strong>The app says “This copy of AI Translator is not genuine, so only Free works.”</strong> The installation was altered or came from the wrong source. Download it again from an official source.</li>
</ul>
<p>If subtitles do not appear after installing, see <a href="/en/guide/troubleshooting/">troubleshooting</a>.</p>

${docNav(
  [
    { href: "/en/guide/quick-start/", kicker: "Previous", title: "AI Translator quick start" },
    { href: "/en/guide/subtitle-bar-and-shortcuts/", kicker: "Next", title: "The subtitle bar and shortcuts" },
    { href: "/en/guide/troubleshooting/", kicker: "Related", title: "Troubleshooting" },
  ],
  "Related guides",
)}
`,
})}
</div></section>
`,
};
