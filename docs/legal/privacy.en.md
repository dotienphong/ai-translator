# AI Translator Privacy Policy

**Version 1.2, effective 16 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**

## 1. Who is responsible for your data

AI Translator (the "app") is developed and operated by **Do Tien Phong** (an individual) ("we", "us"). Contact for privacy and personal-data matters: **support@aitranslator.io.vn**.

## 2. Summary

- Meeting audio is processed **entirely on your computer**. Audio is **never** sent anywhere and is not written to disk.
- The app has **no sign-in accounts, no advertising and no analytics**. When it hits an error, it **automatically sends us an error report with personal data scrubbed out** so we can fix the problem; you can turn this off at any time (section 10).
- Our servers only store your **email** (when you buy a plan), order details, your license, a hashed machine identifier and error reports (kept for 30 days), in order to issue keys, check licenses, make sure each machine gets the Free trial only once, and fix bugs.
- Personal data on our servers is **kept until you ask us to delete it** (section 7), except error reports, which are deleted automatically after 30 days (section 10).

## 3. Data that stays on your computer

| Data | How it is handled |
|---|---|
| System audio being captured | Held only in RAM while translating; never written to disk or sent over the network |
| Transcripts and translations | Shown on screen. **History is off by default.** If you turn it on, it is stored on your computer, encrypted, and can be deleted with one button |
| Glossary, settings | Stored on your computer |
| History encryption key, license token, trial token, usage counters | Stored in the operating system's key store (macOS Keychain, Windows Credential Manager) |
| Activity logs | Stored on your computer; they do not contain transcript text. Only the part of a log that relates to an error leaves your computer, inside an error report with personal data scrubbed out (section 10); you can also send a log to support with a button in the app |
| Recognition and translation models | Downloaded once, then run entirely on your computer |

The app's helper programs only listen on `127.0.0.1` (your own machine) or open no network port at all.

## 4. When the app uses the network

The app connects to the network only to:
1. **Download models** and check for new model versions (from `releases.aitranslator.io.vn`).
2. **Check for app updates** (from `releases.aitranslator.io.vn`).
3. **Talk to our license server** (`api.aitranslator.io.vn`): when registering the Free trial (the first time you open the app, right after you accept the terms; this sends a hash of the machine ID), when you buy a plan, activate or deactivate, recover a key, check your license periodically, send error reports (section 10) and (rarely) ask for the server's time when your computer's clock looks wrong. Asking for the time sends none of your data.
4. **The payment page** provided by PayOS (VietQR bank transfer) or Creem (international card), opened in your browser when you buy a plan.
5. **Our website** `aitranslator.io.vn`, opened in your browser when you click a link in the app.

There are no other connections, and none carries audio or transcript text.

## 5. Data we store on our servers

Our servers store the data below. The "Free trial" row applies to every machine that has opened the app with a network connection; the other rows only apply when you buy a plan or activate a key, except the "Error reports" row, which applies to every machine whose app sends a report:

| Data | Purpose |
|---|---|
| The email you enter when buying | Send your key and recover it if you lose it, and, for card orders, pre-fill Creem's payment page |
| When you consented to us processing your email | Proof that you consented |
| Orders: order code, plan, amount and currency, payment time, status, the payment gateway's session ID (PayOS or Creem) | Issue and renew licenses; reconciliation; accounting obligations |
| License: key, plan, expiry date, usage cycle | Grant the paid plan |
| Free trial: a **hash** of the machine ID, when the trial started and ends, the app's last call | Each machine gets the 10-day trial only once, even after reinstalling the app |
| Activated machines: a **hash** of the machine ID, the computer name (`device_label`) and the last license check | Enforce one machine per key, prevent abuse, help you recognize a machine to remove |
| A change log of licenses (who did what, when) | Support, fraud prevention, incident investigation |
| Rate-limit counters (only HMAC hashes of IP, key, email; expire after about 3 hours) | Block key guessing and spam |
| Error reports (section 10): error type and code, machine details, a **hash** of the machine ID and the relevant part of the log; no email, computer name or meeting content | Find and fix bugs; deleted automatically after 30 days |

We do **not** receive your bank account, card number or financial details (a bank transfer is handled by your bank and PayOS; a card payment is handled by Creem on Creem's own payment page). With VietQR we do **not** send your email to PayOS. With an international card we send the email you entered in the app to Creem, to pre-fill the payment page and so that Creem can email you a receipt. Our server guesses your country from your IP address (via Cloudflare) only to pre-select a payment method on the Upgrade screen; the guessed country is not stored. If you only use the Free plan and never buy or activate a key, we store only the "Free trial" row above and, if the app sends error reports, those reports: no email, computer name or any other information about you.

## 6. Third parties that process data, and transfers abroad

| Party | Role | Data |
|---|---|---|
| **PayOS** (Vietnam) | Processes VietQR bank-transfer payments | Order code, amount, order description. Not your email |
| **Creem** (Armitage Labs OÜ, Estonia) | Merchant of record (reseller) for card orders: handles the payment, tax and receipt | We send the order code, plan, amount, currency and the email you entered as soon as you click to pay by card (even if you then do not pay), to pre-fill the payment page and so that Creem can email you a receipt. On its payment page, Creem itself collects your card number, name, billing address and country (to calculate tax) and IP address (to prevent fraud); we do not receive your card number. Creem processes that data under its own policy (https://www.creem.io/privacy). The payment notification Creem sends to our server includes the buyer's name and country; we do not store these two items |
| **Cloudflare** | Hosts the license server, database, and the storage and delivery of updates and models | The data in section 5, including error reports (section 10); technical logs that expire on their own |
| **Resend** | Sends the email containing your key | Your email and the message (including the key); retention per Resend's own policy |

Cloudflare and Resend operate servers outside Vietnam and Creem is an Estonian company, so the data in sections 5 and 10 may be processed abroad. By buying a plan and consenting to email processing you agree to this. We do not sell your data or share it for advertising.

## 7. Retention and your rights

**Personal data on our servers is kept until you ask us to delete it.** We do not delete it automatically.

You have the right to know what is stored, to request **deletion** or **anonymization**, to withdraw consent, and to complain under Vietnam's **Law on Personal Data Protection**. Send requests to **support@aitranslator.io.vn** from the email you used when buying (so we can confirm it is you). We respond within the period required by law.

When you ask for deletion we will:
- **remove** your email and computer name;
- **delete** the error reports of the machines that ever activated a key for that email (section 10);
- **keep** the hash of the machine ID (pseudonymous data, only to prevent abuse: one machine per key, the temporary lock for excessive machine switching, reusing the correct activation when you re-activate the same machine, one Free trial per machine);
- **keep** the time you consented to email processing (proof of earlier consent);
- **keep** the order row at the level accounting requires: order code, date, amount (and currency), the payment gateway's session ID.

After deletion your license still works but **can no longer be recovered by email**. Data on your computer (history, settings) is deleted by you in the app ("Delete models and data") or by uninstalling.

Self-expiring technical data (rate-limit counters; Cloudflare logs) and Resend's mail logs are outside our deletion; their retention follows those parties' policies. Data you enter on Creem's page and the transaction records kept by Creem (as the merchant of record it must keep tax records) are outside a deletion request sent to us; to have them deleted at Creem, contact Creem. Error reports from a machine that never activated a key are not tied to any email, so they cannot be found by email; they are deleted automatically after 30 days.

## 8. Children

The service is for people aged **16 or over**. We do not knowingly collect data from children under 16; if you are a parent or guardian and believe your child gave us an email, contact us and we will delete it.

## 9. Security

Token-signing and payment keys live only on our servers (as secrets) and are not in the app. Connections to our servers use HTTPS. Administrative access is protected by a separate login. No system is perfectly secure; if an incident affects personal data we will notify as required by law.

## 10. Error reports

When the app hits an error, it **automatically sends us an error report** through our license server (`api.aitranslator.io.vn`) so we can find and fix the problem. This is **on by default**: the Terms step the first time you open the app has a pre-ticked box you can untick, and people who installed the app earlier have it on after updating to a version that includes this feature. You can turn it off or on again at any time in **Settings › Privacy › Send error reports automatically**; turning it off deletes any reports still waiting to be sent. You can also send a report yourself at any time with the **Send log to support** button on the About screen: it sends immediately, even if you turned automatic sending off, and gives you a **report code** to hand to support.

| What | Details |
|---|---|
| When it is sent automatically | When the app's previous run ended abruptly; when a translation session stops because of an error in the app (not errors caused by you or your environment, such as a missing recording permission, a used-up quota, an ended trial, no network or no disk space); or when one of the app's helper programs dies and is restarted automatically. A report is only sent while the app is not translating, and each machine sends at most 5 reports a day |
| The report contains | The report code, the type and code of the error, the time it happened; the app version, the operating system and its version, the architecture, the chip or CPU name, RAM, the type of GPU in use, the model pack, the name of your license plan (never the key), the interface language; a **hash of the machine ID**; and the part of the log that relates to the error (at most 64 KB) |
| The report does not contain | Audio, transcripts, translations, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses |
| Scrubbing | Before sending, the app removes personal folder paths, keys, tokens and email addresses from the log; if any sensitive pattern is left, the whole report is dropped. Our server checks again and rejects a report if anything is left |
| How it is tied to you | The machine-ID hash in the report is the same one we store for licensing and the Free trial (section 5), so we **can link a report to that machine's license and email** when handling a support request |
| How long it is kept | At most **30 days**, then deleted automatically; the server keeps at most 3,000 reports and deletes the oldest first |
| Who can see it | Only the operator of the app, through an admin page with its own login. The data is held on Cloudflare (section 6) |

- We use reports only to find and fix bugs; we do not use them for advertising, sell them or share them with anyone other than the processors in section 6.
- To have the reports of your machine deleted before the 30 days are up, ask for deletion under section 7: when we handle a deletion request by email, we also delete the error reports of the machines that ever activated a key for that email.
- If you would rather send nothing, untick the box at the Terms step or turn the switch off in Settings; the app keeps working fully with it off.

## 11. Changes to this policy

When the policy changes we update this text and the effective date, and announce significant changes in the app or on the website. Continuing to use the app after the effective date means you accept the new version.

## 12. Contact

**Do Tien Phong**, support@aitranslator.io.vn.
