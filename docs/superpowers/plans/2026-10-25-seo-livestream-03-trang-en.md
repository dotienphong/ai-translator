# SEO từ khóa livestream 03: hai trang mới bản tiếng Anh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo `website/src/content/en/solutions-livestream.mjs` (nhắm "live video translator", "real time translation", "realtime translation") và `website/src/content/en/solutions-tiktok-live.mjs` (nhắm TikTok Live), cùng khung và cùng id với bản vi của kế hoạch 02.

**Architecture:** Cùng khuôn với bản vi. **Cùng số `h2`/`h3`, cùng `id` (`not-a-fit` thay cho `chua-phu-hop`), cùng ảnh, cùng liên kết (đổi tiền tố `/en/`), cùng số câu FAQ** với nhau giữa các ngôn ngữ ja/zh/ko ở kế hoạch 05; bản en là nguồn để dịch.

**Tech Stack:** như kế hoạch 02. Tiền đề: kế hoạch 02 đã xong. `WT=/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream` (viết đường dẫn đầy đủ khi chạy lệnh).

Nhắc luật chữ của bản en: **không dùng** `engine`/`engines`, `metal`, `rust`, `quantization`, `beta`; không nêu tên model hay thư viện.

---

### Task 1: Trang `solutions-livestream` (en)

**Files:**
- Create: `WT/website/src/content/en/solutions-livestream.mjs`

- [ ] **Step 1: Tạo file với nội dung sau**

```js
import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, overlayShot, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Solutions", path: "/en/solutions/" },
  { name: "Livestream translation", path: "/en/solutions/livestream-translation/" },
];

const FAQ = [
  {
    q: "How do I translate a livestream into my language?",
    a: `<p>Install AI Translator on your computer, open the livestream in a browser, choose your language in Translate into and press Start. The app listens to the audio playing on your computer and shows translated subtitles on a floating bar, with a median delay of 0.76–1.03 seconds measured on a Mac M4 Pro (Standard pack).</p>`,
  },
  {
    q: "Does it work with TikTok Live, YouTube and Facebook Live?",
    a: `<p>The app captures your computer's system audio, so it does not depend on the platform: if a livestream plays sound on your computer, the app can hear it. We have tested it with videos playing in a browser. We have not tested each livestream platform. See also <a href="/en/solutions/tiktok-live-translation/">translating TikTok Live</a>.</p>`,
  },
  {
    q: "Can I translate a livestream on my phone?",
    a: `<p>No. AI Translator only runs on macOS (Apple Silicon) and Windows 10/11, so it works only when you watch the livestream on a computer.</p>`,
  },
  {
    q: "Does realtime translation need the internet?",
    a: `<p>Not for the translation itself: speech recognition, translation and subtitles run on your computer, and your audio is not sent anywhere. You still need the internet to watch the livestream.</p>`,
  },
  {
    q: "Can I translate my own livestream for my viewers?",
    a: `<p>Not yet. Subtitles appear only on the screen of the person using the app, translating the sound that plays on their computer into the language they choose. The app does not add subtitles or a translated voice to your livestream.</p>`,
  },
  {
    q: "Is live translation free?",
    a: `<p>The Free plan is a 10-day trial with up to 30 minutes of translation a day, no card and no account. After that you need a prepaid plan; see <a href="/en/pricing/">pricing</a>. Free is a trial, not a permanent free plan.</p>`,
  },
];

export default {
  id: "solutions-livestream",
  lang: "en",
  path: "/en/solutions/livestream-translation/",
  title: "Live video translator: real-time livestream subtitles",
  description:
    "Real-time translation for livestreams and live video on your computer: translated subtitles for YouTube, TikTok and Facebook Live, running offline on your machine.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "How to use AI Translator as a live video translator for livestreams on a computer: real-time translated subtitles, four steps, tips for live video that cannot be rewound, quota, honest limits (no phones, no translating your own livestream) and FAQ.",
  llmTitle: "Live video translator: real-time subtitles for livestreams",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Live video translator: real-time subtitles for livestreams",
  lead: "AI Translator is a live video translator for your computer: it gives you real time translation of a livestream as translated subtitles on screen. It listens to the audio playing on your machine, so it works with live video in a browser without any extension, and both speech recognition and translation run on your own computer. It runs only on macOS and Windows, not on phones, and it makes subtitles only for the viewer: it does not translate your own livestream for your audience.",
  meta: "<span>Updated {{updated}}</span><span>Runs on macOS and Windows computers, not on phones</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Works with", "Livestreams playing in a browser or app on your computer<small>TikTok Live, YouTube, Facebook Live: the app hears your computer's sound, so it does not depend on the platform; we have not tested each platform individually</small>"],
  ["Languages", "English, Chinese (中文), Japanese (日本語), Korean (한국어), Vietnamese (Tiếng Việt)<small>Only the pairs that include Vietnamese have a measured translation quality</small>"],
  ["Delay", "Median 0.76–1.03 seconds<small>After the speaker finishes a sentence; Mac M4 Pro, Standard pack; slower machines will be slower</small>"],
  ["Platform", "macOS 14.2+ (Apple Silicon) and Windows 10/11 x64<small>No version for phones or tablets</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Who it is for", title: "When the livestream is great but not in your language", center: true })}
<div class="grid grid-3">
${feature({ icon: "play", title: "Viewers of foreign livestreams", text: "Livestreams in English, Chinese, Japanese or Korean from creators, speakers or broadcasters that you want to understand while they are live." })}
${feature({ icon: "users", title: "Followers of live events", text: "Conferences, product launches or live-selling streams in a foreign language, where you only watch and listen." })}
${feature({ icon: "book", title: "Learners", text: "Live lectures, classes and talks in a foreign language that you want to follow sentence by sentence." })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">How it works</span>
<h2>Real-time livestream translation on your own computer</h2>
${checkList([
  "You open the livestream in a browser (or an app) on your computer and press <strong>Start</strong> in AI Translator",
  "The app captures the sound playing on your computer, splits it into sentences, then recognizes and translates the speech on your machine",
  "The translation appears on a floating subtitle bar above the livestream window, with the original in small type above it",
  "No browser extension and no account on the platform; the bar never takes focus from the window you are using, so you can keep typing in chat",
])}
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "en", alt: "The AI Translator subtitle bar showing the original sentence in small type above its English translation", caption: "The real subtitle bar: original text in small type above, translation below." })}
</div>
</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Get started", title: "Four steps to watch a livestream with translated subtitles" })}
${steps([
  { title: "Open the livestream on your computer", text: "Open the livestream in a browser (or an app) on your computer and let it play sound. On macOS, the first time you press Start the system asks for the <em>System Audio Recording</em> permission: see <a href=\"/en/guide/macos-audio-permission/\">how to grant it</a>." },
  { title: "Choose the language", text: "Set <em>Translate into</em> to the language you want to read. If the whole livestream is in one language, set <em>Source language</em> to it instead of <em>Detect automatically</em>; if speakers switch languages, keep Detect automatically." },
  { title: "Press Start", text: "Press <strong>Start</strong> (shortcut ⌃⌥T, Windows: Ctrl+Alt+T) before the livestream plays or as it starts. The app loads its models in the first few seconds (the first run after installing or updating can take longer, up to a few minutes)." },
  { title: "Place the subtitle bar", text: "Drag the bar just under the video, set the text size and colors in Settings › Subtitles, then click <em>Lock (click-through)</em> so the mouse passes through the bar." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Tips", title: "A livestream cannot be rewound: how to set it up" })}
${checkList([
  "<strong>Pick the source Only {app name} (macOS):</strong> in Settings › Audio, choose the browser that plays the livestream so system notifications are not translated. The other tabs of that browser are still heard, so mute them. The list only shows apps playing sound: start the livestream first, then click <em>Refresh list</em>.",
  "<strong>Windows cannot pick a single app yet:</strong> mute system notifications while you watch.",
  "<strong>Pause that ends a sentence</strong> ranges from 50 to 800 ms: shorter shows subtitles sooner, longer cuts sentences less often. If the speaker talks without pauses, try raising it.",
  "<strong>Lock the source language</strong> when the whole livestream is in one language; keep Detect automatically when speakers switch.",
  "<strong>Missed a sentence?</strong> Scroll up on the subtitle bar to reread earlier sentences; the <em>Latest</em> button returns you to the live line. On every plan you can also view, search and copy the transcript of the latest session (<a href=\"/en/guide/history-and-export/\">history and export</a>).",
])}
${callout({ title: "Quota for long livestreams.", text: "Minutes count only translated speech, not silence, and sentences already in the language you want to read are not counted. Free gives 30 minutes a day for a 10-day trial, so a long livestream needs Monthly (50 hours per 30 days), 6 Months (100 hours per 30 days) or Yearly (unlimited). See <a href=\"/en/pricing/\">pricing</a>." })}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "When is AI Translator not the right fit for a livestream?", text: "Knowing the limits up front saves you a trial." })}
${checkList([
  "<strong>You watch on a phone.</strong> AI Translator only runs on macOS and Windows, so it does not show subtitles inside a phone app. To use it, open the livestream on a computer.",
  "<strong>You are the one streaming and want to translate for your viewers.</strong> Subtitles appear only on the screen of the person using the app, translating the sound that plays on their computer into the language they choose. The app does not add subtitles or a translated voice to your livestream.",
  "<strong>You need to record the livestream, download the video or create a subtitle file from a video file.</strong> The app does not record audio or video to disk and does not process video files; it only has a text transcript.",
  "<strong>The audio is unclear.</strong> Loud background music, noise or several people talking over each other make recognition worse and translations more likely to be wrong.",
  "<strong>You need speed on Windows or on a weaker machine.</strong> The 0.76–1.03 seconds delay was measured on a Mac M4 Pro with the Standard pack; Windows has only a preliminary measurement on one laptop with integrated graphics and is slower (<a href=\"/en/features/#performance\">test conditions</a>).",
], true)}
${callout({ kind: "warn", title: "Machine translation can be wrong.", text: "Do not rely on AI Translator for important decisions (purchases, contracts, medical, legal, financial) without checking with someone qualified. We have tested it with videos playing in a browser. We have not tested each livestream platform." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "Livestream translation: common questions" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Next steps", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/solutions/tiktok-live-translation/", icon: "play", title: "Translate TikTok Live", text: "How to watch TikTok Live in a desktop browser with translated subtitles, and its own limits.", more: "See the guide" })}
${linkCard({ href: "/en/solutions/webinar-and-video-translation/", icon: "book", title: "Webinars, courses and videos", text: "Recorded content in another language, including sessions that last hours.", more: "See the solution" })}
${linkCard({ href: "/en/guide/quick-start/", icon: "zap", title: "Quick start", text: "From installation to your first subtitles.", more: "Open the guide" })}
</div>
<p class="center-text reveal">Want to know whether your content is sent anywhere? See <a href="/en/data-security/">data and security</a>.</p>
<p class="disclaimer">TikTok, YouTube, Facebook and other product names belong to their respective owners; AI Translator is not affiliated with them.</p>
</div></section>

${ctaBand({ title: "Try it on your next livestream", text: "Install with one command and try Free for 10 days at 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/pricing/", label: "See pricing" } })}
`,
};
```

- [ ] **Step 2: Kiểm riêng các test của trang này (trang TikTok bản en chưa có nên chưa chạy `site.test.mjs`)**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/seo-targets.test.mjs 2>&1 | grep -E '^(✔|✖)' | grep -E '\(en\)|en:'`
Expected: các dòng cụm của `solutions-livestream` bản en (`live video translator`, `real time translation`, `realtime translation`) và dòng giới hạn của nó là `✔`. Các dòng của `home`, `solutions-meetings`, `solutions-webinar` bản en còn `✖` (kế hoạch 04); dòng của `solutions-tiktok-live` bản en còn `✖` tới Task 2.

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/en/solutions-livestream.mjs && \
git commit -m "feat(website): trang Live video translator, dịch livestream thời gian thực (en)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 2: Trang `solutions-tiktok-live` (en)

**Files:**
- Create: `WT/website/src/content/en/solutions-tiktok-live.mjs`

- [ ] **Step 1: Tạo file với nội dung sau**

```js
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
    a: `<p>Yes, if you watch TikTok Live on a computer: open the livestream in a browser, press Start in AI Translator and read translated subtitles on the floating bar. The app listens to the sound playing on your machine, so nothing has to be installed into TikTok or your browser. We have tested it with videos playing in a browser. We have not tested TikTok Live itself.</p>`,
  },
  {
    q: "Does it work on a phone?",
    a: `<p>No. AI Translator only runs on macOS (Apple Silicon) and Windows 10/11. It is not available inside the TikTok app or on a phone; open the livestream in your computer's browser instead.</p>`,
  },
  {
    q: "Do I need to install anything into TikTok or my browser?",
    a: `<p>No. There is no browser extension, no plugin and no account on the platform: the app only listens to the sound playing on your computer.</p>`,
  },
  {
    q: "I sell on TikTok Live. Can I translate for foreign customers?",
    a: `<p>Not yet. Subtitles appear only on the screen of the person using the app, translating the sound that plays on their computer into the language they choose. The app does not add subtitles or a translated voice to your livestream.</p>`,
  },
];

export default {
  id: "solutions-tiktok-live",
  lang: "en",
  path: "/en/solutions/tiktok-live-translation/",
  title: "Translate TikTok Live in real time on your computer",
  description:
    "How to translate TikTok Live in real time with translated subtitles in a desktop browser. AI Translator does not run on phones; see the steps and the limits.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "How to translate TikTok Live in real time with translated subtitles when you watch in a desktop browser: four steps, tips for fast speakers, background music and several voices, honest limits (no phones, no translating your own livestream) and FAQ.",
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
  { title: "Open TikTok Live on your computer", text: "Open the livestream on the TikTok website in your computer's browser and let it play sound. Signing in and who can watch are up to TikTok and have nothing to do with AI Translator." },
  { title: "Install and open AI Translator", text: "Paste the install command from the <a href=\"/en/download/\">Download</a> page into Terminal (macOS) or PowerShell (Windows). Set <em>Translate into</em> to the language you want to read." },
  { title: "Press Start while the livestream plays", text: "Press <strong>Start</strong> (shortcut ⌃⌥T, Windows: Ctrl+Alt+T). On macOS, the first time the system asks for the <em>System Audio Recording</em> permission: see <a href=\"/en/guide/macos-audio-permission/\">how to grant it</a>." },
  { title: "Drag the subtitle bar next to the video", text: "Drag the bar just under the livestream, set the text size in Settings › Subtitles and click <em>Lock (click-through)</em> so the mouse passes through the bar." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Tips", title: "Tips for fast speakers, background music and several voices" })}
${checkList([
  "<strong>Fast speakers who rarely pause:</strong> raise <em>Pause that ends a sentence</em> (50–800 ms) so sentences are cut less often; subtitles appear a little later.",
  "<strong>Loud background music or noise:</strong> recognition gets worse and translations are more likely to be wrong; a livestream with clear speech works better.",
  "<strong>Several people talking over each other:</strong> the app translates sentence by sentence from the sound it hears and does not know who is speaking.",
  "<strong>Listen to the browser only (macOS):</strong> in Settings › Audio, choose <em>Only {browser name}</em> so system notifications are not translated; the other tabs of that browser are still heard.",
  "<strong>Chinese, Korean, Japanese or English livestreams:</strong> set <em>Translate into</em> to your language; if you know the spoken language, set <em>Source language</em>, and if speakers switch, keep Detect automatically.",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "When is AI Translator not the right fit for TikTok Live?", text: "Knowing the limits up front saves you a trial." })}
${checkList([
  "<strong>You watch TikTok Live on a phone.</strong> AI Translator only runs on macOS and Windows, so it does not show subtitles inside the TikTok app on a phone.",
  "<strong>You are the one streaming and want to translate for your viewers.</strong> Subtitles appear only on the screen of the person using the app. The app does not add subtitles or a translated voice to your livestream.",
  "<strong>You need to record the livestream or download the video.</strong> The app does not record audio or video to disk and does not process video files; it only has a text transcript.",
], true)}
${callout({ kind: "warn", title: "Machine translation can be wrong.", text: "Do not rely on AI Translator for important decisions (purchases, payments, contracts) without checking. We have not tested TikTok Live itself; what we have tested is described on the <a href=\"/en/solutions/livestream-translation/#not-a-fit\">livestream translation page</a>." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "TikTok Live translation: common questions" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Next steps", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/solutions/livestream-translation/", icon: "play", title: "Livestream translation", text: "How it works, tips for live video that cannot be rewound and the quota, for any livestream platform.", more: "See the solution" })}
${linkCard({ href: "/en/guide/quick-start/", icon: "zap", title: "Quick start", text: "From installation to your first subtitles.", more: "Open the guide" })}
${linkCard({ href: "/en/pricing/", icon: "wallet", title: "Pricing", text: "A 10-day Free trial; after that Monthly, 6 Months or Yearly, prepaid.", more: "See pricing" })}
</div>
<p class="disclaimer">TikTok is a trademark of its respective owner; AI Translator is not affiliated with TikTok.</p>
</div></section>

${ctaBand({ title: "Try it on the next TikTok Live you watch", text: "Install with one command and try Free for 10 days at 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/guide/quick-start/", label: "Open the guide" } })}
`,
};
```

- [ ] **Step 2: Chạy test cấu trúc chung (lúc này hai trang en đủ để mọi liên kết giữa chúng hợp lệ)**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/site.test.mjs 2>&1 | grep -E '^(✖|ℹ (tests|pass|fail|skipped))'`
Expected: `ℹ fail 1` và đúng một dòng `✖ đủ trang (không thiếu module nào)` (còn thiếu bản ja/zh/ko; kế hoạch 05 làm nó xanh). Mọi `✖` khác là lỗi thật. Lỗi hay gặp: `<title>` quá 70 ký tự (tiêu đề en của trang livestream: "Live video translator: real-time livestream subtitles" 53 ký tự + " | AI Translator" = 69, sát trần; nếu test đếm khác thì rút "real-time livestream subtitles" thành "real-time subtitles"), chữ cấm (`engine`, `metal`), thuật ngữ trùng title/description với trang khác, liên kết hỏng.

- [ ] **Step 3: Chạy test mới cho bản en**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/seo-targets.test.mjs 2>&1 | grep -E '^(✔|✖)' | grep -E '\(en\)|en:'`
Expected: dòng của `solutions-livestream` và `solutions-tiktok-live` bản en (cụm, giới hạn, STALE_LIVE) đều `✔`. Dòng của `home`, `solutions-meetings`, `solutions-webinar` bản en và dòng menu/trang Giải pháp còn `✖` (kế hoạch 04).

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/en/solutions-tiktok-live.mjs && \
git commit -m "feat(website): trang Translate TikTok Live in real time (en)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.
