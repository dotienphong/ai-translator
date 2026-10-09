import { pageHero, sectionHead, plansGrid, steps, faq, ctaBand, callout, appShot, checkList, icon } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Pricing", path: "/en/pricing/" },
];

export const PRICING_FAQ = [
  {
    q: "How is Free different from the paid plans?",
    a: `<p>Free is a trial: it lasts 10 days from the first time a computer registers for it, with up to 30 minutes of translation per day, once per computer. The paid plans (Monthly and Yearly) add the Pro features (glossary, history, export) and a larger translation allowance.</p>`,
  },
  {
    q: "What happens after the 10-day trial?",
    a: `<p>That computer can no longer use the Free plan and needs a Monthly or Yearly plan to keep translating. Uninstalling and reinstalling the app, deleting its data or clearing the Keychain does not restart the 10 days, because our server records the start date for each computer.</p>`,
  },
  {
    q: "Can I pay with a credit card or PayPal?",
    a: `<p>Not yet. We only accept bank transfers from Vietnamese banks through a VietQR code, in Vietnamese dong (VND), via the PayOS gateway. International cards, PayPal and recurring payments are not available. If you live abroad and do not have a Vietnamese bank account, you cannot buy a paid plan at the moment.</p>`,
  },
  {
    q: "Does my plan renew automatically?",
    a: `<p>No. Every plan is a single prepaid order and simply ends when it expires. The app reminds you 7 days before, and you renew when you want to. Renewing the same plan adds 30 days (Monthly) or 365 days (Yearly), counted from the expiry date if the plan is still active.</p>`,
  },
  {
    q: "How many computers can I use a key on?",
    a: `<p>One. Each key works on a single computer. To move to another computer, deactivate the old one in Settings › License, or choose "Remove that computer and use this one" on the new one. If a key is activated on two computers at the same time, it is temporarily locked on both until one of them removes it.</p>`,
  },
  {
    q: "Can I get a refund?",
    a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and it cannot be fixed within a reasonable time, or when the law says otherwise. Send your request within 7 days of the payment date to support@aitranslator.io.vn, with your order number. Changing plans is not refundable. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
  },
  {
    q: "Can I get an e-invoice for my company?",
    a: `<p>Not at the moment: we do not issue electronic invoices yet. If you need a receipt, contact support@aitranslator.io.vn and we will talk it through.</p>`,
  },
  {
    q: "How is translation time counted?",
    a: `<p>Only speech that has been translated counts, measured by the length of the speech. Silence, sentences already in the language you want to read, and segments that could not be translated are not counted. The allowance is tracked separately for each computer.</p>`,
  },
  {
    q: "I lost my key. What do I do?",
    a: `<p>Open Settings › License › Lost your key?, enter the email you used to buy and choose Send my keys. Every valid key for that email is sent to that same address. You can also contact support@aitranslator.io.vn.</p>`,
  },
];

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

export default {
  id: "pricing",
  lang: "en",
  path: "/en/pricing/",
  title: "AI Translator pricing: Free trial, Monthly, Yearly",
  description:
    "AI Translator plans: 10-day Free trial, Monthly 50,000 ₫ (50 hours per 30 days), Yearly 500,000 ₫ (unlimited, 365 days). Prepaid in VND via VietQR, no auto-renewal.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: plain(f.a) })))],
  llm: "Pricing for the three plans (Free 10-day trial, Monthly 50,000 VND, Yearly 500,000 VND), how translation time is counted, how to buy with VietQR, changing plans, refunds and pricing questions.",
  llmTitle: "AI Translator pricing",
  body: () => `
${pageHero({ crumbs, title: "Simple pricing: prepaid, no auto-renewal", lead: "Try it free for 10 days, then choose Monthly or Yearly if it earns its place. You pay in Vietnamese dong (VND) by VietQR from a Vietnamese bank, right inside the app, and your key arrives by email." })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">The three plans</h2>
${plansGrid("en", { ctaLabel: "Download", freeLabel: "Sign up for the free trial" })}
<p class="disclaimer">Prices are in Vietnamese dong (VND) per order, and equal the amount in the VietQR code. Prices and allowances are set on our server; a plan you have already bought never has its allowance reduced.</p>
${callout({ kind: "warn", title: "Paying from outside Vietnam", text: "For now we accept only bank transfers from Vietnamese banks, made through VietQR and charged in VND. International cards, PayPal and other currencies are not supported yet, so if you do not have a Vietnamese bank account you cannot buy a paid plan today. The Free trial needs no payment method. If this blocks you, <a href=\"/en/contact/\">contact us</a>." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Compare", title: "What each plan includes", center: true })}
<div class="table-wrap reveal" role="region" aria-label="Plan comparison" tabindex="0"><table class="compare">
<thead><tr><th scope="col"><span class="sr-only">Feature</span></th><th scope="col">Free (trial)</th><th scope="col">Monthly</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">Price</th><td>0 ₫</td><td>50,000 ₫ per order</td><td>500,000 ₫ per order</td></tr>
<tr><th scope="row">Duration</th><td>10 days, once per computer</td><td>30 days per order</td><td>365 days per order</td></tr>
<tr><th scope="row">Translation time</th><td>30 minutes per day</td><td>50 hours (3,000 minutes) per 30-day cycle</td><td>Unlimited</td></tr>
<tr><th scope="row">Live translated subtitles, 5 languages</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Customizable subtitle bar, shortcuts</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Copy the transcript</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Glossary (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Session history (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Export to TXT, SRT, Markdown (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Computers per key</th><td>No key needed</td><td>1 computer</td><td>1 computer</td></tr>
<tr><th scope="row">Equivalent per month</th><td>0 ₫</td><td>50,000 ₫</td><td>about 41,700 ₫</td></tr>
</tbody></table></div>
<p class="small muted">Buying 12 Monthly orders back to back (360 days) would cost 600,000 ₫, compared with 500,000 ₫ for 365 days from a single Yearly order. Monthly is limited to 50 hours of translation per 30 days; Yearly is unlimited. Details of each Pro feature are on the <a href="/en/features/">features page</a>.</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-upgrade", lang: "en", alt: "The Upgrade screen in the app showing the Free, Monthly and Yearly plans with their allowances and prices", caption: "The Upgrade screen in the app: three plans, with prices and allowances." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Translation time</span>
<h2>Only speech that gets translated counts</h2>
${checkList([
  "Time is measured by the <strong>length of the speech</strong> in the segments that have been translated, not by padding or silence",
  "Sentences <strong>already in the language</strong> you want to read, and segments that are skipped or could not be translated, <strong>do not count</strong>",
  "<strong>Free:</strong> the 30-minute allowance resets every day at 00:00 on your computer's clock",
  "<strong>Monthly:</strong> a 30-day cycle that starts on the payment date, not on the calendar month",
  "The app warns you when less than 5 minutes are left; when the allowance runs out, it stops the session and tells you when translation opens again",
  "The allowance is tracked separately for each computer",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "How to buy", title: "From choosing a plan to activation, inside the app", center: true })}
${steps([
  { title: "Choose a plan in the app", text: "Open <strong>Upgrade to Pro</strong>, choose Monthly or Yearly, enter the email where you want to receive your key and agree to let us store it to send and recover the key." },
  { title: "Scan the VietQR code", text: "The app draws a VietQR code right in its window, with a button to open the PayOS payment page. The code works for 15 minutes." },
  { title: "It activates itself", text: "When PayOS confirms the payment (the app checks every 3 seconds), the plan takes effect on your computer straight away and your key is emailed to you." },
])}
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/guide/buy-and-activate/">Read the guide to buying and activating a key ${icon("arrow-right")}</a></p>
<p class="disclaimer">Only bank transfers from Vietnamese banks, in VND, through PayOS. We do not receive your card number or bank account details, and we do not send your email address to PayOS.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Renewing and changing plans", title: "Flexible, and priced by the day", center: true })}
<div class="grid grid-2">
<div class="card reveal"><h3>Renew the same plan</h3><p>Buy the same plan again to add 30 days (Monthly) or 365 days (Yearly), counted from the expiry date if the plan is still active. The app reminds you 7 days before the end and again after it expires. Nothing is ever charged automatically.</p></div>
<div class="card reveal"><h3>Change plan while it is active</h3><p>The new plan starts immediately, and the days left on the old plan are converted at the <strong>price per day</strong>, rounded down. For example, with 20 days left on Monthly, buying Yearly adds 24 days (Yearly then runs for 389 days). The app shows the converted days and the new expiry date (an estimate) before you pay. Changing plans is not refundable.</p></div>
</div>
${callout({ title: "When a plan expires", text: "The computer goes back to Free if it is still within its 10-day trial; once the trial is over, it needs a paid plan to keep translating. Pro features (history, glossary, export) are locked when there is no paid plan." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Pricing questions", title: "What you may want to ask before you buy" })}
${faq(PRICING_FAQ)}
</div></section>

${ctaBand({ title: "Start with the 10-day trial", text: "30 minutes a day is enough to test it on a real meeting. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/faq/", label: "Read the FAQ" } })}
`,
};
