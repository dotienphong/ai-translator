# AI Translator Privacy Policy

**Version 1.1, effective 7 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**

## 1. Who is responsible for your data

AI Translator (the "app") is developed and operated by **Do Tien Phong** (an individual) ("we", "us"). Contact for privacy and personal-data matters: **support@aitranslator.io.vn**.

## 2. Summary

- Meeting audio is processed **entirely on your computer**. Audio is **never** sent anywhere and is not written to disk.
- The app has **no sign-in accounts, no advertising, no analytics, and no automatic crash reports**.
- Our servers only store your **email** (when you buy a plan), order details, your license and a hashed machine identifier, in order to issue keys, check licenses and make sure each machine gets the Free trial only once.
- Personal data on our servers is **kept until you ask us to delete it** (section 7).

## 3. Data that stays on your computer (not sent to us)

| Data | How it is handled |
|---|---|
| System audio being captured | Held only in RAM while translating; never written to disk or sent over the network |
| Transcripts and translations | Shown on screen. **History is off by default.** If you turn it on, it is stored on your computer, encrypted, and can be deleted with one button |
| Glossary, settings | Stored on your computer |
| History encryption key, license token, trial token, usage counters | Stored in the operating system's key store (macOS Keychain, Windows Credential Manager) |
| Activity logs | Stored on your computer; they do not contain transcript text. If you want support, you send them to us yourself |
| Recognition and translation models | Downloaded once, then run entirely on your computer |

The app's helper programs only listen on `127.0.0.1` (your own machine) or open no network port at all.

## 4. When the app uses the network

The app connects to the network only to:
1. **Download models** and check for new model versions (from `releases.aitranslator.io.vn`).
2. **Check for app updates** (from `releases.aitranslator.io.vn`).
3. **Talk to our license server** (`api.aitranslator.io.vn`): when registering the Free trial (the first time you open the app, right after you accept the terms; this sends a hash of the machine ID), when you buy a plan, activate or deactivate, recover a key, check your license periodically, and (rarely) ask for the server's time when your computer's clock looks wrong. Asking for the time sends none of your data.
4. **The payment page** provided by PayOS, opened in your browser when you buy a plan.

There are no other connections, and none carries audio or transcript text.

## 5. Data we store on our servers

Our servers store the data below. The "Free trial" row applies to every machine that has opened the app with a network connection; the other rows only apply when you buy a plan or activate a key:

| Data | Purpose |
|---|---|
| The email you enter when buying | Send your key and recover it if you lose it |
| When you consented to us processing your email | Proof that you consented |
| Orders: order code, plan, amount, payment time, status | Issue and renew licenses; reconciliation; accounting obligations |
| License: key, plan, expiry date, usage cycle | Grant the paid plan |
| Free trial: a **hash** of the machine ID, when the trial started and ends, the app's last call | Each machine gets the 10-day trial only once, even after reinstalling the app |
| Activated machines: a **hash** of the machine ID, the computer name (`device_label`) and the last license check | Enforce one machine per key, prevent abuse, help you recognize a machine to remove |
| A change log of licenses (who did what, when) | Support, fraud prevention, incident investigation |
| Rate-limit counters (only HMAC hashes of IP, key, email; expire after about 3 hours) | Block key guessing and spam |

We do **not** receive your bank account, card or financial details (the transfer is handled by your bank and PayOS). We do **not** send your email to PayOS. If you only use the Free plan and never buy or activate a key, we store only the "Free trial" row above: no email, computer name or any other information about you.

## 6. Third parties that process data, and transfers abroad

| Party | Role | Data |
|---|---|---|
| **PayOS** (Vietnam) | Processes VietQR bank-transfer payments | Order code, amount, order description. Not your email |
| **Cloudflare** | Hosts the license server, database, and the storage and delivery of updates and models | The data in section 5; technical logs that expire on their own |
| **Resend** | Sends the email containing your key | Your email and the message (including the key); retention per Resend's own policy |

Cloudflare and Resend operate servers outside Vietnam, so the data in section 5 may be processed abroad. By buying a plan and consenting to email processing you agree to this. We do not sell your data or share it for advertising.

## 7. Retention and your rights

**Personal data on our servers is kept until you ask us to delete it.** We do not delete it automatically.

You have the right to know what is stored, to request **deletion** or **anonymization**, to withdraw consent, and to complain under Vietnam's **Law on Personal Data Protection**. Send requests to **support@aitranslator.io.vn** from the email you used when buying (so we can confirm it is you). We respond within the period required by law.

When you ask for deletion we will:
- **remove** your email and computer name;
- **keep** the hash of the machine ID (pseudonymous data, only to prevent abuse: one machine per key, the temporary lock for excessive machine switching, reusing the correct activation when you re-activate the same machine, one Free trial per machine);
- **keep** the time you consented to email processing (proof of earlier consent);
- **keep** the order row at the level accounting requires: order code, date, amount.

After deletion your license still works but **can no longer be recovered by email**. Data on your computer (history, settings) is deleted by you in the app ("Delete models and data") or by uninstalling.

Self-expiring technical data (rate-limit counters; Cloudflare logs) and Resend's mail logs are outside our deletion; their retention follows those parties' policies.

## 8. Children

The service is for people aged **16 or over**. We do not knowingly collect data from children under 16; if you are a parent or guardian and believe your child gave us an email, contact us and we will delete it.

## 9. Security

Token-signing and payment keys live only on our servers (as secrets) and are not in the app. Connections to our servers use HTTPS. Administrative access is protected by a separate login. No system is perfectly secure; if an incident affects personal data we will notify as required by law.

## 10. Changes to this policy

When the policy changes we update this text and the effective date, and announce significant changes in the app or on the website. Continuing to use the app after the effective date means you accept the new version.

## 11. Contact

**Do Tien Phong**, support@aitranslator.io.vn.
