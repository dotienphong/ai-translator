import { pageHero, sectionHead, callout, facts, linkCard, icon } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Contact and support", path: "/en/contact/" },
];

const EMAIL = SITE.email;
// mailto links with a prefilled subject and body template. `&amp;` because it sits inside an HTML attribute.
const mail = (subject, body) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&amp;body=${encodeURIComponent(body.join("\n"))}` : ""}`;

const M = {
  support: mail("AI Translator technical support", [
    "AI Translator version (About screen):",
    "Operating system and computer (for example macOS 15, MacBook Air M2; or Windows 11, Intel Core i5-1235U):",
    "RAM:",
    "Graphics card (on a Windows PC):",
    "Model pack (Standard or Lite):",
    "Meeting app I am using:",
    "What happened:",
    "Steps to make it happen again:",
  ]),
  key: mail("Lost AI Translator license key", ["Email used to buy:", "Have I tried Settings › License › Lost your key? (yes/no):"]),
  payment: mail("AI Translator payment problem", ["Order code (the “Order …” line on the Upgrade screen):", "Email used to buy:", "Time and amount transferred:", "Problem:"]),
  refund: mail("AI Translator refund request", ["Order code:", "Payment date:", "Reason:"]),
  erase: mail("Request to delete or anonymize personal data", ["I ask you to delete or anonymize the personal data linked to this email.", "(Sent from the same email I used to buy.)"]),
  security: mail("[Security] AI Translator security report", ["What I found:", "Steps to reproduce:", "Affected version or component:"]),
  feedback: mail("AI Translator feedback", ["What you need, or what is not working well:"]),
};

const btn = (href, label) => `<p><a class="btn btn-secondary btn-sm" href="${href}">${icon("mail")} ${label}</a></p>`;

export default {
  id: "contact",
  lang: "en",
  path: "/en/contact/",
  title: "Contact and support for AI Translator",
  description:
    "Contact AI Translator by email at support@aitranslator.io.vn: beta access, technical support, lost keys, payment issues, refunds, data deletion and security reports.",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "How to reach us and get support: email support@aitranslator.io.vn, what to send there (beta, technical help, lost key, payments, refunds, data deletion, security) and what to include.",
  llmTitle: "Contact and support for AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Contact and support",
  lead: "The way to reach AI Translator is to email support@aitranslator.io.vn. It is our only support channel: this website has no contact form, and we have no support phone line.",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Email", `<a href="mailto:${EMAIL}">${EMAIL}</a><small>You can write in Vietnamese or English</small>`],
  ["Other channels", "None<small>No web form, no phone</small>"],
  ["Replies", "No promised reply time<small>One person runs the product, so we do not commit to a specific response time</small>"],
  ["Security reports", `<a href="/.well-known/security.txt">/.well-known/security.txt</a><small>Or email us with a subject starting with [Security]</small>`],
])}</div>
<p class="center-text reveal"><a class="btn btn-primary btn-lg" href="mailto:${EMAIL}">${icon("mail")} Email us</a></p>
<p class="disclaimer">For none of the requests below do you need to send a password, card number or bank account number. We do not need them and do not receive them.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "What to send", title: "What do you need? Email us with this information", text: "Each button below opens your email app with a subject and a template filled in. If it does not open, write to the address above by hand.", center: true })}
<div class="grid grid-2">

<div class="card reveal" id="beta">
<h3>Get the beta</h3>
<p>AI Translator has no public download yet. Email us using the template on the Download page (there is one for macOS and one for Windows): your computer model and chip or processor, your macOS or Windows version, RAM, the meeting app you use and the languages you need. When a beta that fits your computer is available, we send the installer with its SHA-256 checksum so you can verify it.</p>
<p><a class="btn btn-secondary btn-sm" href="/en/download/">Open the Download page ${icon("arrow-right")}</a></p>
</div>

<div class="card reveal" id="technical-support">
<h3>Technical support</h3>
<p>Please include: the app version (About screen), the macOS version and chip (Apple menu › About This Mac) or the Windows version and processor (Settings › System › About) plus the graphics card, your RAM, the model pack you use (Settings › Model: Standard or Lite), the meeting app, the steps that lead to the problem and the text of any error message.</p>
<p>If you can, attach the log: About › Open log folder. Logs stay on your computer and never contain what was said; you decide whether to send them. Please try the <a href="/en/guide/troubleshooting/">troubleshooting steps</a> first, because many common problems have a quick fix.</p>
${btn(M.support, "Email technical support")}
</div>

<div class="card reveal" id="lost-key">
<h3>Lost license key</h3>
<p>You can recover it yourself: go to Settings › License › Lost your key?, enter the email you used to buy and choose Send my keys. The message comes from no-reply@mail.aitranslator.io.vn, so check your spam folder too. If it still does not arrive, email us from the address you used to buy. See also the <a href="/en/guide/buy-and-activate/">guide to buying and activating a key</a>.</p>
${btn(M.key, "Email about a lost key")}
</div>

<div class="card reveal" id="payment">
<h3>Payment problems</h3>
<p>If you paid but have no key, paid too little, or an order failed, send the order code (the “Order …” line on the Upgrade screen), the email you used to buy, and the time and amount of the transfer. Your bank and PayOS handle the transfer itself; we do not receive your bank account or card details.</p>
${btn(M.payment, "Email about a payment")}
</div>

<div class="card reveal" id="refund">
<h3>Refund request</h3>
<p>Send your request within <strong>7 days</strong> of the payment date, with the order code and the reason. Payments are not refundable, except when a fault on our side stops you from using the plan you bought and we cannot fix it within a reasonable time, or when the law says otherwise; changing plans is not refundable. Details are in the <a href="/en/terms/">Terms of use</a>.</p>
${btn(M.refund, "Send a refund request")}
</div>

<div class="card reveal" id="delete-data">
<h3>Delete or anonymize personal data</h3>
<p>Send the request <strong>from the same email you used to buy</strong>, so we can confirm it is you. We will remove your email and device name; a minimum of data is still kept (the hashed machine ID, the time you consented and the accounting-level order row), and your license still works but can no longer be recovered by email. The full list is on <a href="/en/data-security/#delete-data">Data and security</a>. Data on your own computer you can delete right away inside the app.</p>
${btn(M.erase, "Request data deletion")}
</div>

<div class="card reveal" id="security">
<h3>Report a security issue</h3>
<p>If you believe you have found a vulnerability in the app, the license server or this website, email us with a subject starting with [Security], and include a description, the steps to reproduce and the affected version. We ask that you do not disclose it publicly until we have exchanged messages. Security contact details are also in the <a href="/.well-known/security.txt">security.txt</a> file.</p>
${btn(M.security, "Send a security report")}
</div>

<div class="card reveal" id="feedback">
<h3>Feedback and new needs</h3>
<p>Need another language, need to use it on several computers, or have a different idea? The order of what we weigh for the <a href="/en/about/#under-consideration">next stage</a> depends on user feedback (it is not a commitment). Tell us what you use AI Translator for.</p>
${btn(M.feedback, "Send feedback")}
</div>

</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Before you write", title: "You may find the answer right away" })}
${callout({ title: "About our contact details.", text: "The provider of AI Translator is Đỗ Tiến Phong (individual). We have not published an address, phone number or tax code on this website; all contact goes through the email above." })}
<div class="grid grid-3">
${linkCard({ href: "/en/faq/", icon: "message", title: "FAQ", text: "Short answers about installing, privacy, plans and payment.", more: "Read the FAQ" })}
${linkCard({ href: "/en/guide/troubleshooting/", icon: "support", title: "Troubleshooting", text: "Common problems and how to fix them step by step.", more: "See the guide" })}
${linkCard({ href: "/en/data-security/", icon: "shield", title: "Data and security", text: "What stays on your computer, what our servers store and for how long.", more: "Read the details" })}
</div>
</div></section>
`,
};
