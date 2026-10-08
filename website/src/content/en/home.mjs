import { dataFlow, demo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, facts, linkCard, appShot, overlayShot, callout, checkList } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

export const HOME_FAQ = [
  {
    q: "Does AI Translator need an internet connection?",
    a: `<p>Not while it is translating. Speech recognition, translation and subtitles all run on your computer. You only need the internet to download the app and the models the first time (about 1.3 GB or 2.5 GB), to register the free trial, to buy a plan, to verify your license (paid plans work offline for up to 14 days between checks) and to update the app.</p>`,
  },
  {
    q: "Is my meeting audio sent anywhere?",
    a: `<p>No. While you translate, audio exists only in memory (RAM). It is never written to disk and never sent over the network. We checked with a network proxy on macOS: during translation, the app sent no audio and no transcript text out.</p>`,
  },
  {
    q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
    a: `<p>Yes. The app captures your computer's system audio, so it does not depend on which meeting app, webinar or video you use, and it needs no bot and no plugin. We tested audio capture on macOS with Zoom, Google Meet, Microsoft Teams and Zalo PC (internal testing, not a certification by those companies). On macOS you can also choose to listen to one specific app only.</p>`,
  },
  {
    q: "Which languages does AI Translator support?",
    a: `<p>Five languages, for both the source audio and the translation: English, 中文, 日本語, 한국어 and Tiếng Việt. We plan to add more languages in the future (no date yet). The app interface is available in Vietnamese and English.</p>`,
  },
  {
    q: "Do I need to create an account?",
    a: `<p>No. There is no sign-in. The Free trial only asks you to accept the terms, and paid plans are activated with a license key that is emailed to you after payment.</p>`,
  },
  {
    q: "Can I pay from outside Vietnam?",
    a: `<p>Not yet. Payment is by bank transfer from a Vietnamese bank (VietQR), in Vietnamese dong. International cards and PayPal are not supported at the moment, so without a Vietnamese bank account you cannot buy a paid plan today. The Free trial needs no payment method.</p>`,
  },
  {
    q: "Where can I download it right now?",
    a: `<p>AI Translator is in beta, so there is no public download button yet. Request the macOS beta on the <a href="/en/download/">Download page</a> and we will email you the installer and setup instructions.</p>`,
  },
];

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

export default {
  id: "home",
  lang: "en",
  path: "/en/",
  title: "AI Translator: AI Meeting Subtitles That Run On Your Device",
  description:
    "AI that translates meetings live on your computer, with low latency. No audio or data goes to the cloud and no cloud AI is used. Works with Zoom, Teams, Meet.",
  software: true,
  modified: "2026-10-08",
  llm: "Home page: what AI Translator is, how it works, features, measured latency, pricing and frequently asked questions.",
  llmTitle: "AI Translator: home",
  schema: [faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: plain(f.a) })))],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> Beta · macOS (Apple Silicon) · Windows coming soon</p>
<h1 class="reveal">AI-translated subtitles for <em>every meeting</em>, running on your computer</h1>
<p class="lead reveal">AI Translator uses AI that runs on your own computer to turn the audio playing on it into translated subtitles on your screen, with low latency. Your audio and meeting content are not sent to the cloud and do not pass through any cloud AI service. Use it with Zoom, Microsoft Teams, Google Meet, Zalo PC, webinars or videos: no bot, no account.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/en/download/">Get the macOS beta ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-it-works">See how it works</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI runs 100% on your device</li>
<li>${icon("check")} Meeting data never goes to the cloud</li>
<li>${icon("check")} Low latency</li>
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

<section class="section-tight"><div class="container narrow">
<h2 class="sr-only">What is AI Translator?</h2>
<p class="lead reveal"><strong>AI Translator</strong> is a desktop app that shows live translated subtitles for the audio playing on your computer. It recognizes the speech, translates it and displays the result on a floating subtitle bar, entirely on your own machine, with no bot joining your meeting and no account to create. A beta for macOS (Apple Silicon) is available on request; the Windows version is still being finished.</p>
<div class="reveal">${facts([
  ["Product type", "Desktop app for live translated subtitles"],
  ["Platforms", "macOS 14.2 or later (Apple Silicon)<small>Windows 10/11 x64: coming soon</small>"],
  ["Languages", "English, 中文, 日本語, 한국어, Tiếng Việt<small>For both the source audio and the translation. More languages are planned for the future</small>"],
  ["Processing", "100% on your device; audio is never sent out<small>Speech recognition and translation both run on your device</small>"],
  ["Price", "Free 10-day trial · Monthly 50,000 ₫ · Yearly 500,000 ₫<small>Prepaid in VND by VietQR from a Vietnamese bank, no auto-renewal</small>"],
  ["Provider", "Đỗ Tiến Phong<small>Support: support@aitranslator.io.vn</small>"],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<ul class="app-strip reveal"><li>Zoom</li><li>Microsoft Teams</li><li>Google Meet</li><li>Zalo PC</li><li>Webinars</li><li>Online video</li></ul>
<p class="disclaimer">Works with any audio playing on your computer. Zoom, Microsoft Teams, Google Meet and Zalo are product names of their respective owners; AI Translator is not affiliated with them.</p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "Your data stays on your computer", title: "The AI runs on your machine, so your meeting never leaves it", text: "Speech recognition, translation and subtitles all happen on your own computer. AI Translator does not send your meeting audio or content to the cloud, and no cloud AI service is used to process it.", center: true })}
${dataFlow("en")}
<div class="grid grid-3">
${feature({ icon: "lock", title: "Nothing goes to the cloud", text: "Audio lives only in RAM: it is never written to disk and never sent over the network. The transcript and the translation appear on your screen and stay on your computer; history is off by default, and if you turn it on it is stored encrypted on your machine.", accent: true })}
${feature({ icon: "zap", title: "Low latency", text: "There is no round trip to a server, so subtitles appear right after the speaker finishes a sentence: a median under 1.1 seconds on a Mac M4 Pro (Standard model pack). Other computers may be slower." })}
${feature({ icon: "shield", title: "Less risk of leaking information", text: "Contracts, HR, finance, product plans: your meeting content is not passed to any third party for translation. Our server only stores your email (when you buy), orders, licenses and device-activation details (a hashed machine ID and device name), never conversation data." })}
</div>
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/data-security/">See exactly where your data goes ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt" id="how-it-works"><div class="container">
${sectionHead({ eyebrow: "How it works", title: "From installation to your first subtitles in three steps", text: "No complicated setup, and no bot to invite to your meeting.", center: true })}
${steps([
  { title: "Install the app and download the models once", text: "Open the app, follow the welcome steps, allow system audio recording (macOS) and download the models to your computer (about 1.3 GB or 2.5 GB, depending on the pack). After that, everything runs offline." },
  { title: "Press Start when your meeting begins", text: "Choose the language you want to read (<strong>Translate into</strong>), then press <strong>Start</strong> or use the shortcut. The app listens to whatever is playing on your computer, whether it is Zoom, Teams, Meet or a video." },
  { title: "Read the floating subtitles", text: "The subtitle bar shows the translation soon after the speaker finishes a sentence (on a Mac M4 Pro the median delay is under 1.1 seconds; other computers may be slower), with the original text in small type above it (you can turn that off). Drag it, resize it, change the text size or lock it in place." },
])}
<p class="center-text reveal"><a class="btn btn-ghost" href="/en/guide/quick-start/">Read the quick-start guide ${icon("arrow-right")}</a></p>
</div></section>

<section class="section"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Subtitle bar</span>
<h2>Floating subtitles you can read on any background</h2>
<p class="lead">One bar that stays on top and never takes focus from your meeting app. The translation appears word by word, sentences that are not final yet are dimmer, and the original text sits in small type above (on by default, and you can turn it off).</p>
${checkList([
  "Drag it to move it, drag an edge to resize it; its place is remembered for each screen",
  "Text size 14–48 px, five text colors, five background colors and adjustable background opacity",
  "<strong>Lock</strong> it so mouse clicks pass straight through and never get in the way of your meeting app",
  "Scroll back through earlier sentences with the mouse wheel or a shortcut",
])}
<p><a class="btn btn-secondary" href="/en/features/">See all features ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "en", alt: "The AI Translator subtitle bar showing the original sentence in small type above its English translation", caption: "The real subtitle bar: original text in small type above, translation below." })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-home-running", lang: "en", alt: "AI Translator main screen during a session: status Translating, languages, audio source and the translation time left", caption: "The main screen during a session (Monthly plan)." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Simple controls</span>
<h2>One screen, everything you need</h2>
<p class="lead">Choose the language you want to read, pick the audio source and press Start. The translation time you have left is shown right on the main screen.</p>
${checkList([
  "Five spoken and translated languages: English, 中文, 日本語, 한국어, Tiếng Việt",
  "Detects the spoken language automatically, or lock a single language when you know what will be spoken",
  "Global shortcuts to start, show or hide, lock and scroll the subtitles without leaving your meeting app",
  "A menu bar icon keeps the app running when you close the window",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Why AI Translator", title: "Meeting translation that works differently from cloud tools", text: "Many meeting-translation tools process your audio on a remote server. AI Translator does the opposite: everything happens on your computer.", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "Private by design", text: "Audio lives only in RAM: it is never written to disk and never sent anywhere. The app has no analytics and sends no automatic crash reports.", accent: true })}
${feature({ icon: "wifi-off", title: "Offline while translating", text: "Speech recognition and translation run on your device, so subtitles keep coming even when your connection is flaky or drops. The app only needs the internet now and then for a few things, such as checking your license." })}
${feature({ icon: "video", title: "Any meeting app, no bot", text: "There is no bot to invite and no plugin to install. Anything that plays sound on your computer can become subtitles." })}
${feature({ icon: "book", title: "Glossary", text: "Teach it your names, product names and industry terms. Terms are passed to the translator as hints (up to 500, with CSV import and export; a Pro feature)." })}
${feature({ icon: "history", title: "History and export", text: "Save transcripts on your computer, encrypted, and export them as TXT, SRT or Markdown. History is off by default, so you decide (a Pro feature)." })}
${feature({ icon: "languages", title: "Five languages", text: "English, 中文, 日本語, 한국어 and Tiếng Việt, translated between any two of them. We plan to add more languages in the future. The app interface is available in Vietnamese and English." })}
</div>
<div class="stats reveal">
<div class="stat"><b>&lt; 1.1 s</b><span>median delay from the moment a speaker finishes a sentence to the full translation appearing (Mac M4 Pro, Standard pack)</span></div>
<div class="stat"><b>0</b><span>audio or transcript data sent out while translating (checked with a network proxy on macOS)</span></div>
<div class="stat"><b>5 h 23 min</b><span>one continuous session with no errors in an internal test on macOS</span></div>
</div>
<p class="disclaimer">Figures measured on one specific machine (Mac M4 Pro, 24 GB, macOS 26). Other computers may be slower; see the <a href="/en/features/#performance">performance details and test conditions</a>.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "What it is for", title: "Follow the conversation, whatever language it is in", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/en/solutions/online-meeting-translation/", icon: "users", title: "Online meetings", text: "Translated subtitles for Zoom, Teams, Google Meet and Zalo PC, without asking anyone else to install anything.", more: "See the solution" })}
${linkCard({ href: "/en/solutions/webinar-and-video-translation/", icon: "play", title: "Webinars and videos", text: "Follow talks, courses and videos in another language with translated subtitles right on your screen.", more: "See the solution" })}
</div>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "Pricing", title: "Three simple plans, prepaid with VietQR", text: "No auto-renewal, no recurring billing, no surprises on your bill.", center: true })}
${plansGrid("en", { ctaLabel: "Get the beta", freeLabel: "Sign up for the free trial" })}
<p class="disclaimer">Prices are in Vietnamese dong (VND). Payment is by bank transfer from a Vietnamese bank (VietQR) only; international cards are not accepted yet.</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/en/pricing/">Compare the plans in detail ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "Honest about the beta", text: "AI Translator is in beta. The macOS build is currently signed ad-hoc and not notarized, so macOS blocks the app the first time you open it and you need to allow it in System Settings (we have a <a href=\"/en/guide/install-macos/\">step-by-step installation guide</a>). The Windows version is not released yet. We say this up front so you do not have to guess." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "What you may want to know first" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/en/faq/">See all questions ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Ready to understand every meeting?", text: "Get the macOS beta and try it free for 10 days. No card needed.", primary: { href: "/en/download/", label: "Get the beta" }, secondary: { href: "/en/guide/quick-start/", label: "Read the quick-start guide" } })}
`,
};
