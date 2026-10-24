import { dataFlow, demo, demoVideo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot, overlayShot, checkList } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_TEXT = `A video meeting where a colleague speaks Vietnamese and English subtitles appear, then Type & Translate turns an English reply into Vietnamese for a chat message. ${videoMeta("en").seconds}-second video with sound.`;

export const HOME_FAQ = [
  {
    q: "Does AI Translator need an internet connection?",
    a: `<p>Not while it is translating. Speech recognition, translation and subtitles all run on your computer. You only need the internet to download the app and the models the first time (about 1.3 GB or 2.5 GB), to register the free trial, to buy a plan, to verify your license (paid plans work offline for up to 14 days between checks) and to update the app.</p>`,
  },
  {
    q: "How do I translate a Zoom meeting into my language without a bot?",
    a: "<p>Open AI Translator, choose the language you want to read and press Start. The app listens to the Zoom audio playing on your computer and shows translated subtitles in a floating bar. No bot joins the meeting and the host does not need to enable anything; other participants are not notified, so tell them yourself if your rules require it.</p>",
  },
  {
    q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
    a: `<p>Yes. The app captures your computer's system audio, so it does not depend on which meeting app, webinar or video you use, and it needs no bot and no plugin. We tested audio capture on macOS with Zoom, Google Meet, Microsoft Teams and Zalo PC (internal testing, not a certification by those companies). On macOS you can also choose to listen to one specific app only.</p>`,
  },
  {
    q: "Is my meeting audio sent anywhere?",
    a: `<p>No. While you translate, audio exists only in memory (RAM). It is never written to disk and never sent over the network. We checked with a network proxy on macOS: during translation, the app sent no audio and no transcript text out.</p>`,
  },
  {
    q: "Can I get translated meeting subtitles for free?",
    a: "<p>AI Translator has a free 10-day trial with up to 30 minutes of translation a day, no card and no account. After that you need a prepaid plan: Monthly 50,000 ₫ (50 hours per 30 days), 6 Months 269,000 ₫ (100 hours per 30 days, for 180 days) or Yearly 500,000 ₫ (unlimited for 365 days). Free is a trial, not a permanent free plan.</p>",
  },
  {
    q: "Can I pay from outside Vietnam?",
    a: `<p>Yes. Besides VietQR bank transfer in VND (from a Vietnamese bank), the Upgrade screen in the app lets you pay by international card in US dollars, on the Creem payment page: Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax. Cards are not accepted in some countries, per Creem's list. The Free trial needs no payment method.</p>`,
  },
];

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

export default {
  id: "home",
  lang: "en",
  path: "/en/",
  title: "Live translated subtitles for meetings, offline | AI Translator",
  description:
    "Read live translated subtitles in Zoom, Teams, Google Meet or any app. English, Chinese, Japanese, Korean, Vietnamese. AI runs on your computer, no cloud.",
  software: true,
  modified: "2026-10-24",
  llm: "Home page: what AI Translator is, meeting translation with subtitles, Type & Translate for chat messages, reviewing transcript history, a four-step how-to, data that stays on your computer, pricing and frequently asked questions.",
  llmTitle: "AI Translator: home",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    videoObject({ lang: "en", name: "AI Translator demo: translated meeting subtitles and Type & Translate", description: VIDEO_TEXT, uploadDate: "2026-10-21" }),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS (Apple Silicon) · Windows 10/11 · 10-day free trial</p>
<h1 class="reveal">AI-translated subtitles for <em>every meeting</em>, running on your computer</h1>
<p class="lead reveal"><strong>AI Translator</strong> is a desktop app that turns the audio playing on your computer into floating translated subtitles, and translates the messages you type into the other person's language. The AI runs on your own machine, so your audio and meeting content never go to the cloud. Use it with Zoom, Microsoft Teams, Google Meet, Zalo PC, webinars or videos.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/en/download/">Download ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">See how to use it</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI runs 100% on your device</li>
<li>${icon("check")} Meeting data never goes to the cloud</li>
<li>${icon("check")} No bot, no account</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "Team meeting (illustration)",
  rec: "Translating",
  langs: "JA → EN",
  note: "Illustration: an online meeting with a translated subtitle bar floating at the bottom of the screen",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "来週までに見積書をお送りします。", dst: "We will send the quotation by next week." },
    { src: "この仕様は来月のリリースに間に合いますか。", dst: "Will this specification be ready for next month's release?" },
    { src: "次の会議でスケジュールを確認しましょう。", dst: "Let's review the schedule in the next meeting." },
  ],
  floatA: { icon: "wifi-off", text: "Runs offline" },
  floatB: { icon: "lock", text: "Audio stays on your device" },
})}
</div>
</div></section>

<section class="section-tight" id="video-demo"><div class="container">
${sectionHead({ eyebrow: "Video demo", title: "See AI Translator in action", text: VIDEO_TEXT, center: true })}
${demoVideo({ lang: "en", label: "AI Translator demo video: translated meeting subtitles and Type & Translate", fallback: "Download the demo video (MP4, 2 MB)" })}
</div></section>

<section class="section" id="meeting-translation"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Meeting translation</span>
<h2>Hear the meeting in another language, read it in yours</h2>
<p class="lead">The app listens to the audio playing on your computer and shows the translation on a floating subtitle bar, with the original in small type above. No bot joins the meeting, and nobody else has to install anything.</p>
${checkList([
  "Five languages, translated between any two of them: English, Chinese (中文), Japanese (日本語), Korean (한국어), Vietnamese (Tiếng Việt); the spoken language is detected automatically",
  "Subtitles appear right after the speaker finishes a sentence: a median under 1.1 seconds on a Mac M4 Pro (Standard model pack), and other computers may be slower (<a href=\"/en/features/#performance\">test conditions</a>)",
  "The subtitle bar stays on top: drag it, change the text size and colors, and <strong>Lock</strong> it so clicks pass through",
  "A glossary gives the translator hints for names and industry terms (a Pro feature)",
  "In-person or hybrid meetings: choose the <strong>Microphone</strong> or <strong>Computer audio + Microphone</strong> source to translate people in the room too (<a href=\"/en/features/#microphone\">how it works</a>)",
])}
<p><a class="btn btn-secondary" href="/en/features/">See all features ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "en", alt: "The AI Translator subtitle bar showing the original sentence in small type above its English translation", caption: "The real subtitle bar: original text in small type above, translation below." })}
</div>
</div>
</div></section>

<section class="section section-alt" id="type-and-translate"><div class="container">
<div class="split wide-right reverse">
<div class="stack-lg reveal">
<span class="eyebrow">Type &amp; Translate</span>
<h2>Reply in the other person's language</h2>
<p class="lead">Press ⌃⌥G (Windows: Ctrl+Alt+G) in the chat box you are using, type in your own language and press Enter: the translation is pasted into the chat box for you to check and send.</p>
${checkList([
  "Pastes into the box you are typing in, in any app that accepts pasting (⌘V, Ctrl+V)",
  "Translated on your computer: what you type never leaves it",
  "Included in every plan, and it does not use translation time",
])}
<p><a class="btn btn-secondary" href="/en/guide/type-and-translate/">Read the Type &amp; Translate guide ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "en", alt: "The Type & Translate box with an English message and its Vietnamese translation below", caption: "The Type & Translate box: press Enter to paste the translation into the chat box." })}
</div>
</div>
</div></section>

<section class="section" id="history"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">History</span>
<h2>Look back at a meeting after it ends</h2>
<p class="lead">Every session has a transcript with the time, the original and the translation of each sentence. Turn on history to reopen past meetings, find a sentence, copy it or export it to a file.</p>
${checkList([
  "Every plan: view, search and copy the transcript of your latest session",
  "Pro feature: save the history of your sessions, reopen past ones, export as TXT, SRT or Markdown",
  "Saving history is off by default; when you turn it on, it is encrypted and stays on your computer",
])}
<p><a class="btn btn-secondary" href="/en/guide/history-and-export/">Read the History guide ${icon("arrow-right")}</a></p>
</div>
<div>
${appShot({ slug: "app-history", lang: "en", alt: "The History screen: a list of saved sessions with date and time, minutes, sentence count, a preview and Open and Delete buttons", caption: "History: sessions saved on your computer." })}
</div>
</div>
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "How to use it", title: "Get started in four steps", text: "Install and set up once; after that, every meeting only takes a press of Start.", center: true })}
<div class="split wide-left">
${steps([
  { title: "Install with one command", text: "Paste the install command from the <a href=\"/en/download/\">Download page</a> into Terminal (macOS) or PowerShell (Windows). The app downloads, checks itself and opens." },
  { title: "Set it up the first time", text: "Choose your language, accept the terms, download the models (about 1.3 GB or 2.5 GB), allow system audio recording (macOS only) and play a sample sentence." },
  { title: "Press Start in your meeting", text: "Choose the language you want to read in <strong>Translate into</strong> and press <strong>Start</strong> (shortcut ⌃⌥T, Windows: Ctrl+Alt+T). Subtitles appear on the floating bar; drag it wherever it is easy to read." },
  { title: "Reply and look back", text: "Press ⌃⌥G (Windows: Ctrl+Alt+G) to Type &amp; Translate a message. When the meeting ends, press <strong>Stop</strong> and open <strong>Transcript</strong> or <strong>History</strong> in the sidebar." },
], true)}
${appShot({ slug: "app-home-running", lang: "en", alt: "AI Translator main screen during a session: status Translating, languages, audio source and the translation time left", caption: "The main screen during a session (Monthly plan)." })}
</div>
<p class="disclaimer">The macOS build is signed ad-hoc and not notarized; the Windows build is not code-signed yet. Installed with the command, macOS opens the app directly and SmartScreen does not ask; a file downloaded in a browser may be blocked or warned about on first launch, and Smart App Control in blocking mode blocks the Windows build. See the installation guides for <a href="/en/guide/install-macos/">macOS</a> and <a href="/en/guide/install-windows/">Windows</a>.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/guide/quick-start/">Read the quick-start guide ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/en/guide/">All guides</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "Your data stays on your computer", title: "The AI runs on your machine, so your meeting never leaves it", text: "Speech recognition, translation and subtitles all happen on your own computer, with no cloud AI service involved.", center: true })}
${dataFlow("en")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "Audio never leaves your computer", text: "Audio lives only in RAM: it is never written to disk and never sent over the network, which we checked with a network proxy on macOS. No server is needed to translate, so subtitles keep coming even when your connection is flaky or drops.", accent: true })}
${feature({ icon: "shield", title: "No meeting content on our server", text: "Our server only stores your email (when you buy, or when you choose to leave it in the support chat), orders, licenses, device-activation details (a hashed machine ID and device name), the Free-trial start (a hashed machine ID), a log of license changes, error reports with personal data scrubbed out (kept for 30 days) and support chat messages if you use the chat (kept for 90 days), never meeting content." })}
</div>
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/data-security/">See exactly where your data goes ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "Pricing", title: "Four simple plans, prepaid by VietQR or international card", text: "No auto-renewal, no recurring billing, nothing is ever charged automatically.", center: true })}
${plansGrid("en", { ctaLabel: "Download", freeLabel: "Install and try free" })}
<p class="disclaimer">VND prices are paid by VietQR from a Vietnamese bank; USD prices are paid by international card and exclude tax (if any).</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/en/pricing/">Compare the plans in detail ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "What you may want to know first" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/en/faq/">See all questions ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Ready to understand every meeting?", text: "Install with one command (Terminal on a Mac, PowerShell on Windows) and try it free for 10 days. No card needed.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/guide/quick-start/", label: "Read the quick-start guide" } })}
`,
};
