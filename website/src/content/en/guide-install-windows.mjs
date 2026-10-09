import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Install on Windows", path: "/en/guide/install-windows/" },
];

const toc = [
  { level: 2, id: "requirements", text: "Will it run on your PC?" },
  { level: 2, id: "install-command", text: "Quick way: install with one command" },
  { level: 2, id: "install-exe", text: "Alternative: install from the .exe file" },
  { level: 3, id: "verify-the-file", text: "Verify the installer (SHA-256)" },
  { level: 3, id: "run-the-installer", text: "Run the installer and get past SmartScreen" },
  { level: 2, id: "smart-app-control", text: "Windows 11 says an app is blocked (Smart App Control)" },
  { level: 2, id: "first-launch", text: "First launch" },
  { level: 2, id: "updates", text: "Updates" },
  { level: 2, id: "uninstall", text: "Uninstall properly" },
  { level: 2, id: "common-problems", text: "Common installation problems" },
];

const INSTALL_CMD = "irm https://aitranslator.io.vn/install.ps1 | iex";

const HOWTO_STEPS = [
  { name: "Open PowerShell", text: "Press the Windows key, type PowerShell and press Enter. You do not need to run it as administrator." },
  { name: "Paste the install command and press Enter", text: "Paste irm https://aitranslator.io.vn/install.ps1 | iex into PowerShell and press Enter." },
  { name: "Wait for the app to open", text: "The command downloads the latest version, checks its SHA-256, runs the installer silently for your account only and opens AI Translator." },
];

export default {
  id: "guide-install-windows",
  lang: "en",
  path: "/en/guide/install-windows/",
  title: "Install AI Translator on Windows",
  description:
    "Install AI Translator on Windows 10/11 with one PowerShell command, no SmartScreen; or from the .exe, with SHA-256 check, Smart App Control, updates, uninstall.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-09",
  llm: "Installing AI Translator on Windows 10/11 x64 with one PowerShell command (irm ... install.ps1 | iex), no administrator rights and no SmartScreen. Alternative: the .exe (SHA-256 check, More info › Run anyway if SmartScreen warns because the build is not code-signed). Smart App Control can block an unsigned build. Updates and uninstalling.",
  llmTitle: "Install AI Translator on Windows",
  schema: [
    howTo({
      name: "Install and open AI Translator on Windows with one command",
      description: "Paste one command into PowerShell to download, verify and install AI Translator for your account only; the app then opens.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Install AI Translator on Windows",
  lead: "The fastest way to install AI Translator on Windows is to paste one command into PowerShell: the installer is downloaded, checked and run for your account only (no administrator rights), and the app opens without going through the SmartScreen screen. If you already have an .exe downloaded in a browser you can still install it by double-clicking, but SmartScreen may warn because the beta is not code-signed: click More info, then Run anyway.",
  meta: "<span>For Windows 10 and 11, 64-bit (x64)</span> <span>Updated October 9, 2026</span>",
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
  ["Installer", "One .exe file of about 22 MB<small>Installs for your Windows account only, with no administrator rights.</small>"],
  ["Disk space for models", "1.3 GB (Lite pack) or 2.5 GB (Standard pack)<small>Plus 1 GB free while downloading.</small>"],
  ["Internet", "Needed to download the model and register the Free trial<small>Possibly also during installation (see below). After that, translation runs offline.</small>"],
])}
<p class="small muted">During internal testing we tried system audio capture and the subtitle bar on Windows 11. We have not measured on Windows: latency, a proxy check of network traffic, specific meeting apps with the release build, high-DPI screens or multiple monitors. So we make no latency promise on Windows. On a PC without a capable discrete card, use the Lite pack.</p>

<h2 id="install-command">Quick way: install with one command</h2>
<ol>
<li>Open <strong>PowerShell</strong>: press the <kbd>Windows</kbd> key, type <strong>PowerShell</strong>, press Enter. You do not need to run it as administrator.</li>
<li>Paste the command below and press Enter.</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "Copy command", copied: "Copied", label: "Command that installs AI Translator on Windows" })}
<ol start="3">
<li>Wait about a minute. The command downloads the latest version, compares its SHA-256, runs the installer silently (into <code>%LOCALAPPDATA%\AI Translator\</code>, no UAC prompt) and opens the app.</li>
<li>Continue with the <a href="/en/guide/quick-start/">quick start guide</a>.</li>
</ol>
<p><strong>Why no SmartScreen screen?</strong> SmartScreen only checks a file that carries the “downloaded from the internet” tag (added by browsers) when you open it from File Explorer. A file downloaded by PowerShell has no such tag and the installer is run from PowerShell, so there is no warning even though this build is not code-signed.</p>
${callout({ kind: "warn", title: "Understand what this command does.", text: "The command downloads a script from <strong>aitranslator.io.vn</strong>; the script downloads the installer from <strong>releases.aitranslator.io.vn</strong>, compares its SHA-256 and installs it. It needs no administrator rights and sends no data. The SHA-256 is served from the same place as the file, so it mainly protects against a corrupted download; you are still trusting <strong>aitranslator.io.vn</strong>. To read the script first, use the command that prints it and only then runs it: <code>$s = irm https://aitranslator.io.vn/install.ps1; $s | more; iex $s</code>. Run the same command again at any time to update; the installer closes a running app itself. Beta channel: <code>&amp; ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta</code>." })}
<p>Something went wrong? The script stops and says why (PC not supported, no network, SHA-256 mismatch…). See <a href="#common-problems">common installation problems</a>.</p>

<h2 id="install-exe">Alternative: install from the .exe file</h2>
<p>Use this if you received the .exe by email or prefer not to use PowerShell. A file downloaded in a browser carries the “downloaded from the internet” tag, so SmartScreen may warn.</p>

<h3 id="verify-the-file">Verify the installer (SHA-256)</h3>
${callout({ kind: "warn", title: "Only download the installer from an official source.", text: "The genuine .exe is the one we send from <strong>support@aitranslator.io.vn</strong> or link to on <strong>aitranslator.io.vn</strong>. A file from anywhere else could be fake or tampered with. Do not run it, even if it is named AI Translator." })}
<p>Every installer we send by email comes with a SHA-256 checksum. Because the Windows build is not code-signed, comparing it is how you make sure the file has not been altered. Do this before installing:</p>
<ol>
<li>Open <strong>PowerShell</strong>: click Start, type <code>PowerShell</code> and open <strong>Windows PowerShell</strong>.</li>
<li>Type the command below, replacing <code>&lt;file-name&gt;</code> with the name of the file you downloaded, then press Enter. The file name contains spaces, so keep the whole path in double quotes as in the example.</li>
</ol>
<div class="table-wrap"><pre><code>Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\\Downloads\\&lt;file-name&gt;.exe"</code></pre></div>
<ol start="3">
<li>Compare the 64-character string in the <strong>Hash</strong> column with the one we sent. PowerShell prints it in capitals; upper or lower case does not matter, but every character must match.</li>
<li>If they differ, do not run the file. Download it again; if it still differs, <a href="/en/contact/">contact support</a>.</li>
</ol>

<h3 id="run-the-installer">Run the installer and get past the SmartScreen warning</h3>
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

<h2 id="smart-app-control">Windows 11 says an app is blocked and offers no way past it</h2>
<p>That is <strong>Smart App Control</strong>, which is different from SmartScreen. In blocking mode it does not let unsigned apps with no reputation run, however they were installed (command, or an .exe downloaded in a browser), and there is no <strong>Run anyway</strong> button. The feature may be on for your Windows 11 PC (in evaluation mode it blocks nothing; only in blocking mode does it block).</p>
<ol>
<li>Open <strong>Windows Security › App &amp; browser control › Smart App Control settings</strong>.</li>
<li>Choose <strong>Off</strong>.</li>
<li>Run the install command or the installer again.</li>
</ol>
<p>On older Windows 11 versions, once Smart App Control is off it cannot be turned back on without reinstalling Windows. If you would rather not turn it off, wait until we have a Windows code-signing certificate. A PC managed by a company or school may not let you turn it off: ask the administrator.</p>

<h2 id="first-launch">First launch</h2>
<ol>
<li>Open <strong>AI Translator</strong> from the Start menu.</li>
<li>The app shows its first-time setup. There is no audio permission step on Windows: the app captures the sound playing on your PC without a separate permission, and it does not use the microphone.</li>
<li>Continue with the <a href="/en/guide/quick-start/">quick start guide</a>.</li>
</ol>
<p>AI Translator lives in the system tray. Closing the window only hides the app; to quit completely, choose <strong>Quit</strong> from the tray icon. Windows may hide new icons behind the <strong>^</strong> arrow on the taskbar: drag the icon onto the taskbar, or turn it on in Taskbar settings. Shortcuts on Windows use Ctrl+Alt (see <a href="/en/guide/subtitle-bar-and-shortcuts/">the subtitle bar and shortcuts</a>).</p>

<h2 id="updates">Updates</h2>
<p>The app checks for new versions itself (Settings › General). You can also run the same install command at any time to get the latest version. If you installed from an .exe we emailed you and that build does not update itself, we send you the new one with its SHA-256; SmartScreen may warn again for the new file.</p>

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
<li><strong>The install command says it could not read latest.json.</strong> Your PC has no network, or a proxy/VPN is blocking <code>releases.aitranslator.io.vn</code>. Check your connection and run it again.</li>
<li><strong>The install command says the SHA-256 does not match.</strong> The download was corrupted or tampered with on the way. The script installs nothing; run it again, and if it still differs write to <a href="/en/contact/">support</a>.</li>
<li><strong>The install command will not run (“cannot be loaded”, or Constrained Language mode).</strong> A company-managed PC may block scripts. Use the .exe route or ask the administrator.</li>
<li><strong>The app is blocked with no way past it.</strong> See the Smart App Control section above.</li>
<li><strong>SmartScreen has no Run anyway button.</strong> (Only when installing from an .exe downloaded in a browser.) A policy on your PC (for example on a computer managed by your company or school) may block apps that are not code-signed. Ask the person who manages the computer.</li>
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
