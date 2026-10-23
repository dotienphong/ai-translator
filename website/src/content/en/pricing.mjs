import { pageHero, sectionHead, plansGrid, steps, faq, ctaBand, callout, appShot, checkList, icon } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Pricing", path: "/en/pricing/" },
];

export const PRICING_FAQ = [
  {
    q: "How is Free different from the paid plans?",
    a: `<p>Free is a trial: it lasts 10 days from the first time a computer registers for it, with up to 30 minutes of translation per day, once per computer. The paid plans (Monthly, 6 Months and Yearly) add the Pro features (glossary, history, export) and a larger translation allowance.</p>`,
  },
  {
    q: "What happens after the 10-day trial?",
    a: `<p>That computer can no longer use the Free plan and needs a Monthly, 6 Months or Yearly plan to keep translating. Uninstalling and reinstalling the app, deleting its data or clearing the Keychain does not restart the 10 days, because our server records the start date for each computer.</p>`,
  },
  {
    q: "Can I pay with an international card?",
    a: `<p>Yes. The Upgrade screen in the app offers two ways to pay: <strong>VietQR bank transfer in VND</strong> (from a Vietnamese bank, through the PayOS gateway) or <strong>international card in USD</strong> (Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax). For a card, the app opens the Creem payment page in your browser; when you are done, return to the app and the plan activates itself. Creem is the merchant of record (reseller) for orders paid by card and handles the payment and the tax on it; Creem's Buyer Terms: <a href="https://www.creem.io/buyer-terms" rel="noopener">https://www.creem.io/buyer-terms</a>. Recurring payments are not available. The Free trial needs no payment method.</p>`,
  },
  {
    q: "Does my plan renew automatically?",
    a: `<p>No. Every plan is a single prepaid order and simply ends when it expires. The app reminds you 7 days before, and you renew when you want to. Renewing the same plan adds 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly), counted from the expiry date if the plan is still active.</p>`,
  },
  {
    q: "How many computers can I use a key on?",
    a: `<p>One. Each key works on a single computer. To move to another computer, deactivate the old one in Settings › License, or choose "Remove that computer and use this one" on the new one. While a key is in use on another computer, the second one is blocked by default; only if you deliberately choose "Activate on this computer anyway" and confirm is the key temporarily locked on both until one of them removes it.</p>`,
  },
  {
    q: "Can I get a refund?",
    a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and it cannot be fixed within a reasonable time, or when the law says otherwise. Send your request to us first, within 7 days of the payment date, to support@aitranslator.vn, with your order number. Changing plans is not refundable. For card payments Creem is the merchant of record, so Creem may also refund them under Creem's terms. When an order is refunded (in full or in part, including through a card dispute), we may shorten the time that order added to your license, or revoke the license if it consists only of that order; this is not automatic: the operator decides case by case. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
  },
  {
    q: "Can I get an e-invoice for my company?",
    a: `<p>For VietQR orders we do not issue electronic invoices yet. For orders paid by international card, Creem emails a receipt to the address you entered. If you need other paperwork, contact support@aitranslator.vn and we will talk it through.</p>`,
  },
  {
    q: "How is translation time counted?",
    a: `<p>Only speech that has been translated counts, measured by the length of the speech. Silence, sentences already in the language you want to read, and segments that could not be translated are not counted. The allowance is tracked separately for each computer.</p>`,
  },
  {
    q: "I lost my key. What do I do?",
    a: `<p>Open Settings › License › Lost your key?, enter the email you used to buy and choose Send my keys. Every valid key for that email is sent to that same address. You can also contact support@aitranslator.vn.</p>`,
  },
];

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

export default {
  id: "pricing",
  lang: "en",
  path: "/en/pricing/",
  title: "AI Translator pricing: Free trial, Monthly, 6 Months, Yearly",
  description:
    "AI Translator plans: Free 10-day trial, Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫. Prepaid by VietQR or international card (USD), no auto-renewal.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-15",
  schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  llm: "Pricing for the four plans (Free 10-day trial, Monthly 50,000 VND, 6 Months 269,000 VND, Yearly 500,000 VND), how translation time is counted, how to buy with VietQR (VND) or an international card (USD), changing plans, refunds and pricing questions.",
  llmTitle: "AI Translator pricing",
  body: () => `
${pageHero({ crumbs, title: "Simple pricing: prepaid, no auto-renewal", lead: "Try it free for 10 days, then choose Monthly, 6 Months or Yearly if it earns its place. You start paying inside the app, by VietQR in Vietnamese dong (VND) from a Vietnamese bank or by international card in US dollars (USD); with a card you finish in your browser. Your key arrives by email." })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">The four plans</h2>
${plansGrid("en", { ctaLabel: "Download", freeLabel: "Install and try free" })}
<p class="disclaimer">VND prices are per order and equal the amount in the VietQR code. USD prices apply when you pay by international card and exclude tax: if your country charges tax (VAT, GST or sales tax), Creem adds it on the payment page. Prices and allowances are set on our server; a plan you have already bought keeps its allowance for the period you bought, unless that order has been refunded.</p>
${callout({ title: "Paying from outside Vietnam", text: "No Vietnamese bank account? Choose <strong>International card (USD)</strong> on the Upgrade screen: you pay by card on the Creem payment page, no Vietnamese bank needed. Cards are not accepted in some countries, per Creem's list. The Free trial still needs no payment method. If you need help, <a href=\"/en/contact/\">contact us</a>." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Compare", title: "What each plan includes", center: true })}
<div class="table-wrap reveal" role="region" aria-label="Plan comparison" tabindex="0"><table class="compare">
<thead><tr><th scope="col"><span class="sr-only">Feature</span></th><th scope="col">Free (trial)</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">Price</th><td>0 ₫</td><td>50,000 ₫ per order<small>or $3.99 excl. tax</small></td><td>269,000 ₫ per order<small>or $21.99 excl. tax</small></td><td>500,000 ₫ per order<small>or $39.99 excl. tax</small></td></tr>
<tr><th scope="row">How to pay</th><td>No payment needed</td><td>VietQR (VND) or international card (USD)</td><td>VietQR (VND) or international card (USD)</td><td>VietQR (VND) or international card (USD)</td></tr>
<tr><th scope="row">Duration</th><td>10 days, once per computer</td><td>30 days per order</td><td>180 days per order</td><td>365 days per order</td></tr>
<tr><th scope="row">Translation time</th><td>30 minutes per day</td><td>50 hours (3,000 minutes) per 30-day cycle</td><td>100 hours (6,000 minutes) per 30-day cycle</td><td>Unlimited</td></tr>
<tr><th scope="row">Live translated subtitles, 5 languages</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Customizable subtitle bar, shortcuts</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Copy the transcript</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Type &amp; Translate for chat messages (does not use translation time)</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Glossary (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Session history (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Export to TXT, SRT, Markdown (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Computers per key</th><td>No key needed</td><td>1 computer</td><td>1 computer</td><td>1 computer</td></tr>
<tr><th scope="row">Equivalent per month</th><td>0 ₫</td><td>50,000 ₫</td><td>about 44,800 ₫</td><td>about 41,700 ₫</td></tr>
</tbody></table></div>
<p class="small muted">Buying 6 Monthly orders back to back (180 days) would cost 300,000 ₫, compared with 269,000 ₫ for 180 days from a single 6 Months order; buying 12 Monthly orders back to back (360 days) would cost 600,000 ₫, compared with 500,000 ₫ for 365 days from a single Yearly order. Monthly is limited to 50 hours of translation per 30 days, 6 Months to 100 hours per 30 days; Yearly is unlimited. Details of each Pro feature are on the <a href="/en/features/">features page</a>.</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-upgrade", lang: "en", alt: "The Upgrade screen in the app in English, with International card (USD) preselected: step 1 Payment method next to VietQR bank transfer (VND), with a note that Creem is the merchant of record for card orders, step 2 Choose a plan with the Free, Monthly, 6 Months and Yearly plans, their allowances and USD prices excluding tax ($3.99, $21.99 and $39.99), and step 3 Checkout with the Email to receive your key box and the Pay in your browser button", caption: "The Upgrade screen in the app with the international card selected: two ways to pay, four plans, USD prices (excluding tax) and allowances." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Translation time</span>
<h2>Only speech that gets translated counts</h2>
${checkList([
  "Time is measured by the <strong>length of the speech</strong> in the segments that have been translated, not by padding or silence",
  "Sentences <strong>already in the language</strong> you want to read, and segments that are skipped or could not be translated, <strong>do not count</strong>",
  "<strong>Free:</strong> the 30-minute allowance resets every day, usually at 00:00 on your computer's clock (at least 20 hours after the previous reset; the app shows the exact time it opens again)",
  "<strong>Monthly and 6 Months:</strong> a 30-day cycle that starts on the payment date, not on the calendar month (6 Months has six cycles in its 180 days, each with its own 100 hours)",
  "The app warns you when less than 5 minutes are left; when the allowance runs out, it stops the session and tells you when translation opens again",
  "The allowance is tracked separately for each computer",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "How to buy", title: "From choosing a plan to activation, inside the app", center: true })}
${steps([
  { title: "Choose how to pay and a plan in the app", text: "Open <strong>Upgrade to Pro</strong>, choose the <strong>Payment method</strong> (VietQR in VND or international card in USD), then choose Monthly, 6 Months or Yearly (the prices on the plan boxes follow your payment method), enter the email where you want to receive your key and agree to let us store it to send and recover the key." },
  { title: "Pay", text: "<strong>VietQR:</strong> the app draws a QR code right in its window, with a button to open the PayOS payment page; the code works for 15 minutes. <strong>International card:</strong> the app opens the Creem payment page in your browser by itself; pay within 30 minutes. If you have paid, your key will be sent by email; do not pay again." },
  { title: "It activates itself", text: "When the payment gateway confirms the payment (the app checks every few seconds), the plan takes effect on your computer straight away and your key is emailed to you." },
])}
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/guide/buy-and-activate/">Read the guide to buying and activating a key ${icon("arrow-right")}</a></p>
<p class="disclaimer">We do not receive your card number or bank account details. With VietQR we do not send your email address to PayOS. With an international card we send the email you enter in the app to Creem, to pre-fill the payment page and so that Creem can email you a receipt; Creem is the merchant of record (reseller) for card orders and handles the payment and the tax.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Renewing and changing plans", title: "Flexible, and priced by the day", center: true })}
<div class="grid grid-2">
<div class="card reveal"><h3>Renew the same plan</h3><p>Buy the same plan again to add 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly), counted from the expiry date if the plan is still active. The app reminds you 7 days before the end and again after it expires. Nothing is ever charged automatically.</p></div>
<div class="card reveal"><h3>Change plan while it is active</h3><p>The new plan starts immediately, and the days left on the old plan are converted at the <strong>price per day</strong>, rounded down. For example, priced in VND (if you pay in USD the formula uses the USD prices of both plans, so the days can differ: in this example by at most one day), with 20 days left on Monthly, buying Yearly adds 24 days (Yearly then runs for 389 days), and buying 6 Months adds 22 days (6 Months then runs for 202 days). The app shows the converted days and the new expiry date (an estimate) before you pay. Changing plans is not refundable.</p></div>
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
