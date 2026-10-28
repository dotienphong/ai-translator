import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `A video meeting where a colleague speaks Vietnamese and English subtitles appear. ${videoMeta("en", "meeting").seconds}-second video with sound.`, label: "AI Translator demo video: live meeting translation", fallback: "Download the video (MP4, 1 MB)" },
  { kind: "typing", text: `Type & Translate turns an English reply into Vietnamese for a chat message. ${videoMeta("en", "typing").seconds}-second video with sound.`, label: "AI Translator demo video: Type & Translate", fallback: "Download the video (MP4, 1 MB)" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
    a: `<p>Yes, with no bot and no plugin: the app captures your computer's system audio, so it does not depend on which meeting app you use. We tested audio capture on macOS with Zoom, Google Meet, Microsoft Teams and Zalo PC (internal testing, not a certification by those companies). Other participants are not notified, so tell them yourself if your rules require it.</p>`,
  },
  {
    q: "Does AI Translator need an internet connection?",
    a: `<p>Not while it is translating. Speech recognition, translation and subtitles all run on your computer. You only need the internet to download the app and the models the first time (about 1.3 GB or 2.5 GB), to register the free trial, to buy a plan, to verify your license (paid plans work offline for up to 14 days between checks) and to update the app.</p>`,
  },
  {
    q: "Is my meeting audio sent anywhere?",
    a: `<p>No. While you translate, audio exists only in memory (RAM). It is never written to disk and never sent over the network. We checked with a network proxy on macOS: during translation, the app sent no audio and no transcript text out.</p>`,
  },
  {
    q: "Can I translate a livestream into my language?",
    a: `<p>On a computer, yes: the app listens to the audio your computer plays, so it does not depend on the website. We tested it once with YouTube Live (an English-language news channel, Chrome on macOS, 25 October 2026): Vietnamese subtitles appeared throughout the test. For TikTok Live, we only have the result of one Vietnamese livestream with background music: the app captured the sound, but it detected the wrong language and repeated sentences nobody said, so the subtitles were not usable. We have not tested Facebook Live. There is no phone version, and the app does not add subtitles to your own livestream for your audience. See <a href="/en/solutions/livestream-translation/">livestream translation</a>.</p>`,
  },
  {
    q: "Can I get translated meeting subtitles for free?",
    a: `<p>AI Translator has a free 10-day trial with up to 30 minutes of translation a day, no card and no account. It is a trial, not a permanent free plan; after that you need a prepaid plan: Monthly 50,000 ₫, 6 Months 269,000 ₫ or Yearly 500,000 ₫.</p>`,
  },
  {
    q: "Can I pay from outside Vietnam?",
    a: `<p>Yes. Besides VietQR bank transfer in VND (from a Vietnamese bank), the Upgrade screen in the app lets you pay by international card in US dollars, on the Creem payment page: Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax. Cards are not accepted in some countries, per Creem's list. The Free trial needs no payment method.</p>`,
  },
];

export default {
  id: "home",
  lang: "en",
  path: "/en/",
  title: "AI Translator: real-time translator for meetings, livestreams & chat",
  description:
    "Real-time translation subtitles for Zoom, Teams, Meet, livestreams, YouTube and videos, plus Type & Translate for chat. AI runs offline on your computer.",
  software: true,
  modified: "2026-10-27",
  llm: "Home page: what AI Translator is, meeting and livestream translation with subtitles, Type & Translate for chat messages, reviewing transcript history, a four-step how-to, data that stays on your computer, pricing and frequently asked questions.",
  llmTitle: "AI Translator: home",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "en", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS (Apple Silicon) · Windows 10/11 · 10-day free trial</p>
<h1 class="reveal">AI <em>real-time translation</em> for meetings, livestreams, YouTube, videos and chat messages</h1>
<p class="lead reveal"><strong>AI Translator</strong> is an AI live translator for macOS and Windows: a desktop app that turns the audio playing on your computer into floating translated subtitles in real time, and translates the messages you type into the other person's language. The AI runs on your own machine, so your audio and meeting content never go to the cloud. Use it with Zoom, Microsoft Teams, Google Meet, Zalo PC, webinars, videos or livestreams you watch on a computer.</p>
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

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "Main features", title: "Meeting translation, Type & Translate, History", center: true })}
${featureTabs({
  listLabel: "Choose a feature",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "Meetings",
      title: "Hear the meeting in another language, read it in yours",
      lead: "The app listens to the audio playing on your computer and shows the translation on a floating subtitle bar. No bot joins the meeting.",
      bullets: [
        "Five languages, translated between any two of them: English, Chinese, Japanese, Korean, Vietnamese; the spoken language is detected automatically",
        `Subtitles appear after the speaker finishes a sentence: a median under 1.1 seconds on a Mac M4 Pro (Standard model pack), and other computers may be slower (<a href="/en/features/#performance">test conditions</a>)`,
        `Works with Zoom, Teams, Meet and Zalo; in-person meetings through the <strong>Microphone</strong> source (<a href="/en/features/#microphone">how it works</a>); livestreams you watch on a computer (<a href="/en/solutions/livestream-translation/">livestream translation</a>)`,
      ],
      cta: { href: "/en/features/", label: "See all features" },
      media: demoVideo({ lang: "en", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "Type &amp; Translate",
      title: "Reply in the other person's language",
      lead: "Press ⌃⌥G (Windows: Ctrl+Alt+G) in the chat box you are using, type in your own language and press Enter: the translation is pasted into the chat box for you to check and send.",
      bullets: [
        "Pastes into the box you are typing in, in any app that accepts pasting (⌘V, Ctrl+V)",
        "Translated on your computer: what you type never leaves it",
        "Included in every plan, and it does not use translation time",
      ],
      cta: { href: "/en/guide/type-and-translate/", label: "Read the Type &amp; Translate guide" },
      media: demoVideo({ lang: "en", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "History",
      title: "Look back at a meeting after it ends",
      lead: "Every session has a transcript with the time, the original and the translation of each sentence.",
      bullets: [
        "Every plan: view, search and copy the transcript of your latest session",
        "Pro feature: save the history of your sessions, reopen past ones, export as TXT, SRT or Markdown",
        "Saving history is off by default; when you turn it on, it is encrypted and stays on your computer",
      ],
      cta: { href: "/en/guide/history-and-export/", label: "Read the History guide" },
      media: appShot({ slug: "app-history", lang: "en", alt: "The History screen: a list of saved sessions with date and time, minutes, sentence count, a preview and Open and Delete buttons", caption: "History: sessions saved on your computer." }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "How to use it", title: "Get started in four steps", text: "Install and set up once; after that, every meeting only takes a press of Start.", center: true })}
<div class="split wide-left">
${steps([
  { title: "Install with one command", text: `Paste the command from the <a href="/en/download/">Download page</a> into Terminal (macOS) or PowerShell (Windows).` },
  { title: "Set it up the first time", text: "Choose your language, download the models (about 1.3 GB or 2.5 GB) and allow system audio recording (macOS only)." },
  { title: "Press Start in your meeting", text: "Choose a language in <strong>Translate into</strong> and press <strong>Start</strong> (⌃⌥T, Windows: Ctrl+Alt+T)." },
  { title: "Reply and look back", text: "Press ⌃⌥G (Windows: Ctrl+Alt+G) to Type &amp; Translate; when the meeting ends, open <strong>Transcript</strong> or <strong>History</strong>." },
], true)}
${appShot({ slug: "app-home-running", lang: "en", alt: "AI Translator main screen during a session: status Translating, languages, audio source and the translation time left", caption: "The main screen during a session (Monthly plan)." })}
</div>
<p class="disclaimer">The macOS build is signed ad-hoc and not notarized; the Windows build is not code-signed yet. Installed with the command, macOS opens the app directly and SmartScreen does not ask; a file downloaded in a browser may be blocked or warned about on first launch; Smart App Control in blocking mode blocks the Windows build however it is installed. See the installation guides for <a href="/en/guide/install-macos/">macOS</a> and <a href="/en/guide/install-windows/">Windows</a>.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/guide/quick-start/">Read the quick-start guide ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "Your data stays on your computer", title: "The AI runs on your machine, so your meeting never leaves it", center: true })}
${dataFlow("en")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "Audio never leaves your computer", text: "Audio lives only in RAM: it is never written to disk and never sent over the network, which we checked with a network proxy on macOS. Subtitles keep coming even when your connection drops.", accent: true })}
${feature({ icon: "shield", title: "No meeting content on our server", text: "Our server only stores what it needs to sell plans, activate devices and support you (details below), never meeting content." })}
</div>
<details class="more-details reveal"><summary>What exactly does the server store?</summary><p>Our server only stores your email (when you buy, or when you choose to leave it in the support chat), orders, licenses, device-activation details (a hashed machine ID and device name), the Free-trial start (a hashed machine ID), a log of license changes, error reports with personal data scrubbed out (kept for 30 days) and support chat messages if you use the chat (kept for 90 days), never meeting content.</p></details>
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
