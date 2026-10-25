import { pageHero, sectionHead, checkList, callout, ctaBand, steps, linkCard, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Solutions", path: "/en/solutions/" },
  { name: "TikTok Live translation", path: "/en/solutions/tiktok-live-translation/" },
];

const FAQ = [
  {
    q: "Can I translate TikTok Live into my language?",
    a: `<p>Yes, if you watch TikTok Live on a computer and the speaker uses English, Chinese, Japanese or Korean. We have not tested TikTok Live itself. We have tested it with videos playing in a browser, and the app listens to the sound playing on your machine, so it does not depend on the website. To do it: open the livestream in a browser, press Start in AI Translator and read translated subtitles on the floating bar.</p>`,
  },
  {
    q: "Does it work on a phone?",
    a: `<p>No. AI Translator only runs on macOS (Apple Silicon) and Windows 10/11. It is not available inside the TikTok app or on a phone; open the livestream in your computer's browser instead.</p>`,
  },
  {
    q: "Do I need to install anything into TikTok or my browser?",
    a: `<p>No. There is no browser extension or plugin, and AI Translator does not need to connect to your TikTok account: it only listens to the sound playing on your computer. Whether you need to sign in to watch is up to TikTok.</p>`,
  },
  {
    q: "I sell on TikTok Live. Can I translate for foreign customers?",
    a: `<p>No. AI Translator has no feature that adds subtitles or a translated voice to your livestream. Subtitles appear only on the screen of the person using the app, translating the sound that plays on their computer into the language they choose.</p>`,
  },
];

export default {
  id: "solutions-tiktok-live",
  lang: "en",
  path: "/en/solutions/tiktok-live-translation/",
  title: "Translate TikTok Live in real time on your computer",
  description:
    "How to get real-time translated subtitles for TikTok Live in a desktop browser. AI Translator does not run on phones; see the steps and the limits.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "How to translate TikTok Live in real time with translated subtitles when you watch in a desktop browser: four steps, tips for sentences cut in the middle, background music and several voices, honest limits (no phones, no translating your own livestream) and FAQ.",
  llmTitle: "Translate TikTok Live in real time when you watch on a computer",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Translate TikTok Live in real time when you watch on a computer",
  lead: "To read translated subtitles while you watch TikTok Live in a language you do not speak, open the livestream in your computer's browser and run AI Translator: it listens to the audio playing on your machine and shows the translation on a floating bar. It runs only on macOS and Windows, so it does not work inside the TikTok app on a phone, and it makes subtitles only for the viewer.",
  meta: "<span>Updated {{updated}}</span><span>Runs on macOS and Windows computers, not on phones</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "Before you try: computers only.", text: "AI Translator has no phone version. If you usually watch TikTok Live on your phone, open the same livestream in your computer's browser to get translated subtitles." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Get started", title: "Four steps to watch TikTok Live with translated subtitles" })}
${steps([
  { title: "Install and open AI Translator", text: "Paste the install command from the <a href=\"/en/download/\">Download</a> page into Terminal (macOS) or PowerShell (Windows). Set <em>Translate into</em> to the language you want to read." },
  { title: "Open TikTok Live on your computer", text: "Open the livestream on the TikTok website in your computer's browser and let it play sound. Signing in and who can watch are up to TikTok and have nothing to do with AI Translator." },
  { title: "Press Start while the livestream plays", text: "Press <strong>Start</strong> (shortcut ⌃⌥T, Windows: Ctrl+Alt+T). On macOS, the first time the system asks for the <em>System Audio Recording</em> permission: see <a href=\"/en/guide/macos-audio-permission/\">how to grant it</a>. The app loads its models in the first few seconds (the first run after installing or updating can take longer, up to a few minutes)." },
  { title: "Drag the subtitle bar next to the video", text: "Drag the bar just under the livestream, set the text size in Settings › Subtitles and click <em>Lock (click-through)</em> so the mouse passes through the bar." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Tips", title: "Tips for cut-off sentences, background music and several voices" })}
${checkList([
  "<strong>Sentences cut in the middle (the speaker hesitates or pauses for breath):</strong> raise <em>Pause that ends a sentence</em> (50–800 ms) so sentences are cut less often; subtitles appear a little later. The change applies from the next session.",
  "<strong>Loud background music or noise:</strong> recognition gets worse and translations are more likely to be wrong; a livestream with clear speech works better.",
  "<strong>Several people talking over each other:</strong> the app translates sentence by sentence from the sound it hears and does not know who is speaking.",
  "<strong>Listen to the browser only (macOS):</strong> so system notifications are not translated, start the livestream first, then in Settings › Audio click <em>Refresh list</em>, choose <em>Only {browser name}</em> and only then press Start. For Safari the entry is named <em>Only Safari and web pages inside other apps</em>. A new source applies from the next session; the other tabs of that browser are still heard.",
  "<strong>Windows cannot pick a single app yet:</strong> mute system notifications while you watch.",
  "<strong>Chinese, Korean, Japanese or English livestreams:</strong> set <em>Translate into</em> to your language (English, Vietnamese, Chinese, Japanese or Korean); if you know the spoken language, set <em>Source language</em>, and if speakers switch, keep Detect automatically. Translation quality has been measured only for pairs that include Vietnamese; other pairs work but have no measured score.",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "When is AI Translator not the right fit for TikTok Live?", text: "Knowing the limits up front saves you a trial." })}
${checkList([
  "<strong>You watch TikTok Live on a phone.</strong> AI Translator only runs on macOS and Windows, so it does not show subtitles inside the TikTok app on a phone.",
  "<strong>You are the one streaming and want to translate for your viewers.</strong> Subtitles appear only on the screen of the person using the app. The app does not add subtitles or a translated voice to your livestream.",
  "<strong>You need to record the livestream or download the video.</strong> The app does not record audio or video to disk and does not process video files; it only has a text transcript.",
  "<strong>The livestream is not in English, Chinese, Japanese, Korean or Vietnamese.</strong> The app supports only these five languages; a livestream in Thai, Indonesian or another language cannot be translated yet.",
], true)}
${callout({ kind: "warn", title: "Machine translation can be wrong.", text: "Do not rely on AI Translator for important decisions (purchases, payments, contracts) without checking. We have not tested TikTok Live itself. We have tested it with videos playing in a browser." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "TikTok Live translation: common questions" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Next steps", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/solutions/livestream-translation/", icon: "play", title: "Livestream translation", text: "How it works, tips for live video you often cannot rewind and the quota, for any livestream platform.", more: "See the solution" })}
${linkCard({ href: "/en/guide/quick-start/", icon: "zap", title: "Quick start", text: "From installation to your first subtitles.", more: "Open the guide" })}
${linkCard({ href: "/en/pricing/", icon: "wallet", title: "Pricing", text: "A 10-day Free trial; after that Monthly, 6 Months or Yearly, prepaid.", more: "See pricing" })}
</div>
<p class="disclaimer">TikTok is a trademark of its respective owner; AI Translator is not affiliated with TikTok.</p>
</div></section>

${ctaBand({ title: "Try it on the next TikTok Live you watch", text: "Install with one command and try Free for 10 days at 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/guide/quick-start/", label: "Open the guide" } })}
`,
};
