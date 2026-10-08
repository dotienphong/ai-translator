import { pageHero, sectionHead, steps, callout, facts, ctaBand, icon, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Download", path: "/en/download/" },
];

const SUBJECT = "AI Translator beta request (macOS)";
const BODY = [
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
].join("\n");
const MAILTO = `mailto:support@aitranslator.io.vn?subject=${encodeURIComponent(SUBJECT)}&amp;body=${encodeURIComponent(BODY)}`;

const DL_FAQ = [
  {
    q: "Why is there no direct download button?",
    a: `<p>AI Translator is in beta. We prefer to send the installer to each tester, with instructions and a SHA-256 checksum, and to hear their feedback before we open public downloads.</p>`,
  },
  {
    q: "Why does macOS block the app the first time I open it?",
    a: `<p>The macOS build is ad-hoc signed and has not been notarized by Apple (we do not have an Apple Developer ID yet). Gatekeeper therefore blocks the first launch, and you need to choose Open Anyway in System Settings › Privacy &amp; Security. This step will disappear once we have a Developer ID. <a href="/en/guide/install-macos/">See the step-by-step guide</a>.</p>`,
  },
  {
    q: "Can I use a Mac with an Intel chip?",
    a: `<p>Not yet. AI Translator needs a Mac with an Apple Silicon chip (M1 or newer) and macOS 14.2 or later.</p>`,
  },
  {
    q: "When will the Windows version be available?",
    a: `<p>The Windows 10/11 64-bit version is being finished, but there is no release date yet. Mention "Windows" in your request email so we know you are interested.</p>`,
  },
  {
    q: "Does the beta update itself?",
    a: `<p>There are Stable and Beta update channels under Settings › General › Update channel. The first test installer we email you may not update itself yet; we will say so when we send it.</p>`,
  },
];

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

export default {
  id: "download",
  lang: "en",
  path: "/en/download/",
  title: "Get the AI Translator beta for macOS",
  description:
    "Request the AI Translator beta for macOS 14.2+ (Apple Silicon). 10-day free trial. System requirements, first-launch steps and the status of the Windows version.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: plain(f.a) })))],
  llm: "How to get the macOS beta (no public download yet), system requirements, first-launch steps for an ad-hoc-signed build, and the status of the Windows version.",
  llmTitle: "Get the AI Translator beta",
  body: () => `
${pageHero({ crumbs, title: "Get the AI Translator beta for macOS", lead: "We are sending the beta to testers one by one. Send us a short email and we will reply with the installer, setup instructions and a SHA-256 checksum." })}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Status", "Beta, no public download yet"],
  ["Version", "0.1.0-beta<small>The exact version number is in the email that comes with the installer</small>"],
  ["macOS", "14.2 or later, Apple Silicon (M1+)<small>The .dmg installer is about 9 MB; the models are an extra 1.3 or 2.5 GB download</small>"],
  ["Windows", "Coming soon<small>Windows 10/11 64-bit, no release date yet</small>"],
  ["Free trial", "10 days, 30 minutes per day<small>No card, no account</small>"],
  ["Price afterwards", "Monthly 50,000 ₫ · Yearly 500,000 ₫<small>Paid in VND by bank transfer from a Vietnamese bank (VietQR)</small>"],
])}</div>
<p class="center-text reveal"><a class="btn btn-primary btn-lg" href="${MAILTO}">${icon("mail")} Email us to request the beta</a></p>
<p class="disclaimer">The button opens your email app with a ready-made message. If it does not open, write to <strong>support@aitranslator.io.vn</strong> yourself.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "The steps", title: "From request email to your first subtitles", center: true })}
${steps([
  { title: "Email us", text: "Tell us your Mac model, your macOS version and which meeting apps you plan to use it with." },
  { title: "Receive the installer and the SHA-256 checksum", text: "We send you a link to the .dmg file together with its SHA-256 checksum, so you can check that the file has not been altered." },
  { title: "Install, allow the first launch, grant permission", text: "Drag the app to Applications, allow it to open in System Settings, then grant the system audio recording permission. We have a step-by-step guide." },
  { title: "Download the models and start translating", text: "The app downloads its models once (1.3 or 2.5 GB), lets you hear a sample sentence, and is then ready for your meetings." },
])}
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/guide/install-macos/">Read the macOS installation guide ${icon("arrow-right")}</a></p>
</div></section>

<section class="section"><div class="container narrow">
${callout({ kind: "warn", title: "macOS will block the app the first time you open it. That is expected.", text: "The beta is currently ad-hoc signed and has not been notarized by Apple (we have not bought an Apple Developer ID yet), so on the first launch macOS says it cannot verify the developer. Dismiss the warning, open <strong>System Settings › Privacy &amp; Security</strong>, scroll to the bottom and click <strong>Open Anyway</strong> next to AI Translator, then confirm with your password or Touch ID. After every update to a new version, macOS also asks again for 5 Keychain approvals and 1 audio-recording permission; the app warns you about this when it offers the update. This will go away once we have a Developer ID." })}
${callout({ kind: "ok", title: "Only get the installer from us", text: "Download AI Translator only from a link sent by <strong>support@aitranslator.io.vn</strong> or from the website <strong>aitranslator.io.vn</strong>, and always compare the SHA-256 checksum. Installers from any other source may be fake." })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "System requirements", title: "Will it run on your computer?", center: true })}
<div class="table-wrap reveal" role="region" aria-label="System requirements" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">Requirement</span></th><th scope="col">macOS (beta)</th><th scope="col">Windows (coming soon)</th></tr></thead>
<tbody>
<tr><th scope="row">Operating system</th><td>macOS 14.2 or later</td><td>Windows 10 or 11, 64-bit (x64)</td></tr>
<tr><th scope="row">Processor</th><td>Apple Silicon (M1 or newer). No version for Intel Macs</td><td>CPU with AVX2. Windows ARM64 is not supported yet</td></tr>
<tr><th scope="row">RAM</th><td>At least 8 GB, 16 GB recommended</td><td>At least 8 GB, 16 GB recommended</td></tr>
<tr><th scope="row">Graphics</th><td>Apple GPU</td><td>For the Standard pack, a discrete graphics card with 6 GB or more of VRAM is recommended; without one it runs on the CPU</td></tr>
<tr><th scope="row">Disk space</th><td>1.3 GB (Lite pack) or 2.5 GB (Standard pack), plus 1 GB free while downloading</td><td>The same</td></tr>
<tr><th scope="row">Permission</th><td>System audio recording (the microphone is not used)</td><td>No audio-recording permission needed</td></tr>
</tbody></table></div>
<p class="small muted">If a computer has less than 8 GB of RAM or a processor without AVX2, the app explains why and does not let you download the models. There is no build for Intel Macs.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "About the beta and installing it" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Tell us what you need", text: "One short email is enough. We will reply to you by email.", primary: { href: MAILTO, label: "Email us to request the beta" }, secondary: { href: "/en/pricing/", label: "See pricing" } })}
`,
};
