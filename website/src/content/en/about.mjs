import { pageHero, sectionHead, feature, linkCard, callout, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "About AI Translator", path: "/en/about/" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "about",
  lang: "en",
  path: "/en/about/",
  title: "About AI Translator: story, principles, who builds it",
  description:
    "AI Translator shows live translated subtitles for meetings and runs offline. Built by Đỗ Tiến Phong, an independent developer. Story, principles, current status.",
  schemaType: "AboutPage",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "How AI Translator came about, the product principles, who builds it (Đỗ Tiến Phong, an independent developer), current status, directions under consideration (not commitments), its use of third-party open-source components and short legal information.",
  llmTitle: "About AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "About AI Translator: translating meetings on your own computer",
  lead: "AI Translator is a desktop app that shows live translated subtitles for meeting audio and runs offline on your computer. It is built and run by Đỗ Tiến Phong, an independent developer. It is available for macOS and Windows.",
  meta: "<span>Updated 8 October 2026</span><span>Provider: Đỗ Tiến Phong</span>",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Product", "Live translated subtitles for meetings, webinars and videos<small>Speech recognition and translation run on your computer</small>"],
  ["Provider", "Đỗ Tiến Phong (individual)<small>Independent developer</small>"],
  ["Status", "Released<small>macOS 14.2+ (Apple Silicon) and Windows 10/11 64-bit</small>"],
  ["Support", `${MAIL}<small>You can write in Vietnamese or English</small>`],
  ["Languages", "English, 中文, 日本語, 한국어, Tiếng Việt<small>The app interface is in Vietnamese and English</small>"],
  ["License", "Commercial product, not open source<small>Uses open-source components from third parties</small>"],
])}</div>
</div></section>

<section class="section" id="story"><div class="container narrow">
${sectionHead({ eyebrow: "Our story", title: "Why AI Translator exists" })}
<div class="prose">
<p>The first idea was to take an existing offline translation app for Android (an open-source one) and use it for calls and meetings. We hit a hard limit of the operating system almost at once. Android lets third-party apps capture the audio of media and games, but not the audio of phone calls or VoIP calls, and during a call an app's microphone usually hears only silence.</p>
<p>A computer is different. Both Windows and macOS (from version 14.2) provide a way for an app to capture the sound the computer itself is playing. So the project moved to the desktop: an app that listens to system audio, recognizes speech, translates it and shows subtitles, and works with any meeting app without a bot or a plugin.</p>
<p>While researching (September 2026), we found that translated subtitles in the large meeting apps tend to sit in higher paid tiers and run in the cloud, and most third-party tools do the same. We wanted a different option: everything processed on your machine, any meeting app, a focus on Vietnamese, and, because no server does the translating, no extra infrastructure cost for each minute you use. Here is a <a href="/en/compare/offline-vs-cloud-translation/">comparison of offline and cloud translation</a>.</p>
<p>We chose the translation model by measurement. In an internal test on 29 September 2026 (320 sentences of text, five translation directions, run on a Mac M4 Pro), the model we picked scored 0.837 on an automatic translation-quality score, while the three other translation models tested under the same conditions scored between 0.736 and 0.833. That test used text, not real speech, and we did not compare against any cloud service.</p>
</div>
</div></section>

<section class="section section-alt" id="principles"><div class="container">
${sectionHead({ eyebrow: "Principles", title: "Six things we hold to when building the product", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "Private by design", text: "Audio stays in RAM, is never written to disk and never sent anywhere. Our servers keep only what licensing, orders and the trial need. Details on <a href=\"/en/data-security/\">Data and security</a>.", accent: true })}
${feature({ icon: "wifi-off", title: "Offline while translating", text: "Speech recognition and translation run on your computer. The internet is needed only to download models, register for the trial, buy and verify a license, and update the app." })}
${feature({ icon: "info", title: "Honest about status", text: "If we have not done something yet, we say so. macOS is not notarized yet, Windows is not code-signed yet, some machines are not measured: we say so plainly, on the website and in the app." })}
${feature({ icon: "lock", title: "No ads, no analytics", text: "The app has no ads, no analytics and sends no automatic crash reports. We make a living from paid plans, not from your data." })}
${feature({ icon: "video", title: "No bot, no account", text: "No bot joins your meeting, no plugin to install, no sign-in. Paid plans are activated with a license key sent by email." })}
${feature({ icon: "gauge", title: "Numbers with conditions", text: "Every speed or quality figure on this website comes with the machine and conditions it was measured under; what we have not measured, we say we have not measured. See <a href=\"/en/features/#performance\">features and performance</a>." })}
</div>
</div></section>

<section class="section" id="who"><div class="container narrow">
${sectionHead({ eyebrow: "Who builds it", title: "Who is behind AI Translator?" })}
<div class="prose">
<p>AI Translator is developed and operated by <strong>Đỗ Tiến Phong</strong>, an independent developer, from the desktop app to the license server. This website says “we” for brevity, but this is one person's product.</p>
<p>We do not publish a long biography, testimonials or customer logos here. We only publish what can be verified: measurements with their conditions, known limits and clear terms. Questions, feedback and bug reports go to ${MAIL}. See also the <a href="/en/contact/">Contact page</a>.</p>
</div>
</div></section>

<section class="section section-alt" id="status"><div class="container narrow">
${sectionHead({ eyebrow: "Today", title: "Where is AI Translator right now?" })}
<div class="table-wrap reveal" role="region" aria-label="Current status of AI Translator" tabindex="0"><table>
<thead><tr><th scope="col">Area</th><th scope="col">Status</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>macOS 14.2 or later, Apple Silicon. <a href="/en/download/#install-macos">Install with one command in Terminal</a>.</td></tr>
<tr><th scope="row">Windows</th><td>Windows 10/11 64-bit (x64). <a href="/en/download/#install-windows">Install with one command in PowerShell</a>. Latency on Windows has not been measured.</td></tr>
<tr><th scope="row">Code signing</th><td>macOS is ad-hoc signed and not notarized: it opens directly when installed with the command, but a .dmg downloaded in a browser needs Open Anyway on first launch. Windows has no code-signing certificate yet: installed with the command, SmartScreen does not ask, while an .exe downloaded in a browser may be warned about (Smart App Control in blocking mode blocks both) (<a href="/en/guide/install-windows/">what to do</a>).</td></tr>
<tr><th scope="row">Payments</th><td>VietQR in VND through PayOS. No international cards and no e-invoices yet.</td></tr>
<tr><th scope="row">Plans</th><td>Free 10-day trial, Monthly, Yearly. See <a href="/en/pricing/">pricing</a>.</td></tr>
</tbody></table></div>
</div></section>

<section class="section" id="under-consideration"><div class="container narrow">
${sectionHead({ eyebrow: "Ahead", title: "What we are considering" })}
${callout({ kind: "warn", title: "This is not a commitment.", text: "The list below is what we are weighing for the next stage. There are no dates and no fixed order, and any item may change or be dropped depending on user feedback." })}
<div class="prose">
<ul>
<li>Telling speakers apart in the subtitles</li>
<li>Windows ARM64 support</li>
<li>Per-app audio capture on Windows</li>
<li>Two-way speech translation, so your own voice can be translated for the other people in the meeting</li>
<li>Meeting summaries and minutes</li>
<li>Selling outside Vietnam, with international payments</li>
<li>A business plan for multiple devices</li>
<li>More languages for the source audio and the translation (beyond the current five)</li>
<li>More interface languages</li>
</ul>
<p>The order depends on user feedback, so tell us what you need most through the <a href="/en/contact/">Contact page</a>.</p>
</div>
</div></section>

<section class="section section-alt" id="technology"><div class="container narrow">
${sectionHead({ eyebrow: "Licenses", title: "Third-party open-source components", text: "AI Translator is a commercial product and is not open source: the license agreement does not allow copying, reverse engineering or rebranding it. But it uses many open-source components from third parties, and we credit them." })}
<p class="small muted">The original models are redistributed unmodified, together with their licenses. The full list of components and licenses is inside the app, under About › Open-source licenses. Zoom, Microsoft Teams, Google Meet and Zalo are mentioned only to describe compatibility; AI Translator is not affiliated with these companies.</p>
</div></section>

<section class="section" id="legal"><div class="container narrow">
${sectionHead({ eyebrow: "Legal", title: "Short legal information" })}
<div class="reveal">${facts([
  ["Provider", "Đỗ Tiến Phong (individual)"],
  ["Brand", "AI Translator"],
  ["Governing law", "Vietnamese law<small>Disputes go to the competent courts in Vietnam (Terms of use, section 14)</small>"],
  ["Terms of use", `<a href="/en/terms/">License agreement (EULA)</a><small>Version 1.1, effective 7 October 2026</small>`],
  ["Privacy", `<a href="/en/privacy/">Privacy policy</a><small>Version 1.1, effective 7 October 2026</small>`],
  ["Language of the texts", "The Vietnamese version is the original and prevails<small>The English version is a translation for reference</small>"],
  ["Contact about personal data", MAIL],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<h2 class="sr-only">Keep reading</h2>
<div class="grid grid-3">
${linkCard({ href: "/en/features/", icon: "captions", title: "Features", text: "What AI Translator can do today, exactly as it works in the app.", more: "See features" })}
${linkCard({ href: "/en/data-security/", icon: "shield", title: "Data and security", text: "What stays on your computer, where the app connects, what our servers store.", more: "Read the details" })}
${linkCard({ href: "/en/pricing/", icon: "wallet", title: "Pricing", text: "Free 10-day trial, Monthly 50,000 ₫, Yearly 500,000 ₫.", more: "See pricing" })}
</div>
</div></section>

${ctaBand({ title: "Try it on a real meeting", text: "Install on macOS or Windows with one command and use the 10-day Free trial. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/contact/", label: "Contact us" } })}
`,
};
