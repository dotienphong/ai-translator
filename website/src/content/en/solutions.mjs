import { pageHero, sectionHead, feature, linkCard, checkList, callout, ctaBand, facts } from "../../build/components.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Solutions", path: "/en/solutions/" },
];

export default {
  id: "solutions",
  lang: "en",
  path: "/en/solutions/",
  title: "Solutions: AI Translator for meetings and video",
  description:
    "AI Translator shows translated subtitles for Zoom, Teams, Meet and Zalo calls, webinars, courses and videos. See how to use it and when it is not the right fit.",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Overview of what AI Translator is used for (online meetings, webinars, courses, videos), links to the two detailed solution pages, and a list of cases where the app is not the right fit.",
  llmTitle: "Solutions: what AI Translator is used for",
  body: () => `
${pageHero({ crumbs, title: "What can you use AI Translator for?", lead: "AI Translator shows live translated subtitles for any audio playing on your computer, and both speech recognition and translation run on your own machine. The two main uses are online meetings, and watching webinars, courses or videos in a language you do not speak. This page helps you pick the right setup, and tells you when the app is not the right fit." })}

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Two main uses", title: "Pick the situation closest to yours", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/en/solutions/online-meeting-translation/", icon: "users", title: "Online meetings: Zoom, Teams, Meet, Zalo", text: "Translated subtitles for calls with partners abroad, without a bot and without asking the host to turn anything on. Includes how to prepare before the call, shortcuts during it and the transcript afterwards.", more: "See the meeting solution" })}
${linkCard({ href: "/en/solutions/webinar-and-video-translation/", icon: "play", title: "Webinars, courses and videos", text: "Read translated subtitles while you watch a conference talk, a course or a video in another language, even in sessions that last hours, then copy or export the transcript to study it again.", more: "See the webinar and video solution" })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "What they share", title: "What stays the same in every situation", text: "Whether you are in a meeting or watching a video, AI Translator works the same way.", center: true })}
<div class="grid grid-2">
${feature({ icon: "speaker", title: "It listens to system audio", text: "The app captures the sound playing on your computer, so it works with any app or web page that makes noise. No bot, no plugin and no account on the meeting or video platform." })}
${feature({ icon: "wifi-off", title: "Offline while translating", text: "Speech recognition and translation run on your machine. Audio stays in memory: it is not written to disk and not sent anywhere. See <a href=\"/en/data-security/\">data and security</a>." })}
${feature({ icon: "languages", title: "Five languages", text: "English, 中文, 日本語, 한국어 and Tiếng Việt, for both the spoken audio and the translation. You choose the language you want to read." })}
${feature({ icon: "captions", title: "A floating subtitle bar", text: "One bar that always stays on top and never takes focus from the app you are using. Drag it, resize the text, lock it so the mouse passes through. See <a href=\"/en/features/\">all features</a>." })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Before you start", title: "What you need", center: true })}
<div class="reveal">${facts([
  ["Platform", "macOS 14.2 or later on Apple Silicon and Windows 10/11 x64 (beta)<small>Intel Macs and Windows ARM64: not supported</small>"],
  ["Computer", "At least 8 GB of RAM, 16 GB recommended<small>One-time model download: 1.3 GB (Lite) or 2.5 GB (Standard)</small>"],
  ["Languages", "English, 中文, 日本語, 한국어, Tiếng Việt<small>App interface: English and Vietnamese</small>"],
  ["Price", "Free 10-day trial · Monthly 50,000 ₫ · Yearly 500,000 ₫<small>Prepaid with VietQR, no automatic renewal</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Quick pick", title: "Which situation, which setup?" })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">Situation</th><th scope="col">Quick tip</th></tr></thead>
<tbody>
<tr><th scope="row">Zoom, Teams or Meet call with a partner</th><td>Lock the source language, add proper names to the glossary (Pro), place the subtitle bar just under the video</td></tr>
<tr><th scope="row">Zalo PC call</th><td>Keep Detect automatically, or lock the language if you know it</td></tr>
<tr><th scope="row">Webinar or conference talk</th><td>Keep the original text showing (on by default), and listen to the player only (macOS)</td></tr>
<tr><th scope="row">Course or lecture video</th><td>Export the transcript to study it again (Pro), add field-specific terms to the glossary (Pro)</td></tr>
</tbody></table></div>
</div></section>

<section class="section section-alt" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "When AI Translator is not the right fit", text: "Knowing the limits up front saves you a trial that goes nowhere." })}
${checkList([
  "<strong>You need the other people to hear your translated voice.</strong> AI Translator translates one way only, from the audio playing on your computer into your language. It does not translate your voice and play it into the meeting.",
  "<strong>You need to record the meeting.</strong> The app does not record audio to disk. It keeps a text transcript only, and saving history is a Pro feature that is off by default.",
  "<strong>You need automatic minutes, summaries or speaker labels.</strong> Not available.",
  "<strong>You use an Intel Mac, Windows ARM64, or a Windows PC whose CPU lacks AVX2.</strong> The beta runs on macOS 14.2 or later on Apple Silicon and on Windows 10/11 64-bit (x64) with a CPU that supports AVX2.",
  "<strong>Your computer has less than 8 GB of RAM,</strong> or you need a language beyond the five above: the app cannot cover that yet.",
  "<strong>You have no Vietnamese bank account.</strong> For now we accept VietQR in VND only, with no international cards.",
], true)}
${callout({ kind: "warn", title: "Automatic translation can be wrong.", text: "Do not rely on AI Translator for important decisions (contracts, medical, legal, financial) without checking with a qualified person." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Want to go deeper?", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/compare/offline-vs-cloud-translation/", icon: "layers", title: "Offline vs cloud translation", text: "A balanced comparison: privacy, cost, latency, hardware and when to choose which.", more: "Read the comparison" })}
${linkCard({ href: "/en/guide/quick-start/", icon: "zap", title: "Quick start", text: "From installation to your first subtitles, including the macOS audio permission.", more: "Open the guide" })}
${linkCard({ href: "/en/pricing/", icon: "wallet", title: "Pricing", text: "Free 10-day trial, Monthly 50,000 ₫, Yearly 500,000 ₫.", more: "See pricing" })}
</div>
</div></section>

${ctaBand({ title: "Try it on your own call or video", text: "Start with the free 10-day trial, 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Get the beta" }, secondary: { href: "/en/pricing/", label: "See pricing" } })}
`,
};
