# EULA Key Clauses + Privacy Policy Delta

> Plain-language source-of-truth for the legal text. A lawyer should sign off before launch, but every clause below must survive that pass — they are the brand promise translated to contract terms. **This is not legal advice; review with counsel before going live.**

## 1. License Grant (the heart)

> Subject to your payment of the applicable Purchase Price and your continued compliance with this Agreement, Dictivo grants you a **perpetual, non-exclusive, non-transferable license** to install and use the version of the Dictivo Software you have downloaded ("Licensed Version") on up to two (2) personal devices you own or control.
>
> This license **does not expire**, does not depend on a network check, and survives the discontinuation of any online service operated by Dictivo, including the update service, the license-issuance service, and the company itself.

This clause is the contractual form of the "perpetual fallback" promise. Counsel should verify the survival language holds in their jurisdiction.

## 2. Update Entitlement Window

> Your purchase entitles you to receive, free of additional charge, every Update Dictivo publishes during the twelve (12) months following the date of purchase ("Update Window"). At the conclusion of the Update Window:
>
> (a) **All previously delivered versions of the Software, including the Licensed Version and any Update you have received, remain fully functional and licensed to you under this Agreement, indefinitely.**
>
> (b) Dictivo shall have no obligation to deliver further Updates to you unless you elect to extend the Update Window by paying the then-current Renewal Fee.
>
> (c) You may elect to renew the Update Window at any time — including after a lapse — for an additional twelve (12) months. The renewed Update Window begins on the date of payment.

## 3. Renewal Fee

> The Renewal Fee at the date of this Agreement is **USD $24.00 per twelve-month Update Window**. Dictivo may revise the Renewal Fee from time to time. **Any revision applies only to renewals purchased after the revision takes effect**; it does not retroactively change the price of a Renewal that you have already paid.
>
> Renewal is offered through a recurring subscription managed by our merchant of record (Lemon Squeezy). **You may cancel that subscription at any time. Cancellation never disables your Licensed Version.**

## 4. Refund

> You may request a full refund of your Purchase Price within **fourteen (14) days** of purchase by contacting `support@dictivo.app` with your order reference. Refunds are processed by our merchant of record. Once refunded, the license issued to you is revoked and you must uninstall the Software.

## 5. Permitted Use

> You may use the Software for any personal, professional, or commercial purpose. Specifically, you may:
>
> - Use the Software to dictate content that you then publish, sell, or distribute commercially.
> - Use the Software within an organization you employ or operate, subject to the seat limit.
> - Modify settings, hotkeys, and dictionaries to suit your workflow.

We deliberately do not restrict commercial use. A dictation tool that you can't use at work is a useless dictation tool.

## 6. Restrictions

> You may not:
>
> - Reverse-engineer, decompile, or disassemble the Software, except to the extent that such activity is expressly permitted by applicable law notwithstanding this limitation.
> - Redistribute the Software, in whole or in part, to third parties.
> - Use the Software in a manner that violates applicable law.

Note: the EU has mandatory reverse-engineering rights for interoperability. The proviso preserves that.

## 7. Transferability

> The license is non-transferable in commerce — you may not resell or sub-license it. However, if you cease using the Software on a device (for example, you replace a laptop), you may activate the license on the new device. Up to two (2) devices may be active at any time; activating a third automatically deactivates the least-recently-used.

## 8. Updates and Their Form

> An "Update" means any Patch (`x.y.Z`), Minor (`x.Y.0`), or content update (such as new model weights or new language packs) Dictivo publishes within the same Major (`X`) version. **Major version transitions (e.g. `2.0.0`) are not Updates** within the meaning of this Agreement and may require a separate purchase or upgrade fee.

This is the one place we explicitly carve out a major-version paid upgrade. It must be visible.

## 9. Privacy Promise (echoed in EULA, fully stated in Privacy Policy)

> Local keeps audio on this device. Cloud Fast uploads audio to cloud transcription providers for faster results.
>
> When used in Local mode, the Software does not transmit your audio, transcripts, dictionaries, snippets, or hotkey configuration to Dictivo or any third party. The network connections the Software makes by default are:
>
> (a) **Updates check** — once on launch and every 24 hours thereafter, the Software requests a single JSON file from `updates.dictivo.app` to determine if a newer version is available. No identifiers other than your license token are transmitted.
>
> (b) **License refresh (optional, disable-able)** — once every seven days the Software may request a refreshed license token from `verify.dictivo.app`.
>
> Both checks can be disabled in Settings; doing so does not affect any other functionality of the Software.
>
> Cloud Fast is an optional paid transcription mode. When you select Cloud Fast, the Software uploads the current recording and minimal request metadata to a Dictivo-operated proxy. Dictivo uses that proxy to verify entitlement, meter monthly transcription minutes, route transcription to cloud transcription providers, and return the final transcript to the Software. Dictionary terms and snippets remain on device and are applied locally after the transcript returns. Provider choice is not exposed in the Software.

## 10. Limitation of Liability (standard)

> To the maximum extent permitted by law, Dictivo's total cumulative liability arising out of or relating to this Agreement is limited to the Purchase Price you paid.

## 11. Governing Law

> [TBD with counsel — typically the jurisdiction of incorporation. If the entity is yet to be formed, this is one of the launch blockers.]

---

# Privacy Policy — Delta for the Update + License Infrastructure

The full Privacy Policy is `marketing/legal/privacy.md` (TBD). This file specifies only the new sections required for update + license checks.

## §A. What we receive when your Dictivo checks for an update

Every 24 hours (and once at launch), your Dictivo sends a single HTTP request:

```
GET https://updates.dictivo.app/<os>/<arch>/<your-version>?ch=stable
User-Agent: Dictivo-Updater/1.0
Authorization: Bearer <your license token, if any>
```

This request tells our servers:

- **The platform you're on** (`darwin-aarch64`, `windows-x86_64`, etc.) — needed to send the right installer back.
- **The version you currently run** — needed to decide whether you have a newer one already.
- **Your license, if any** — needed to confirm your update window has not expired.
- **Your IP address** — automatically attached by the network; we do not log it.

**We do not log this request.** Our servers respond with a manifest or a `204 No Content` and discard the request immediately.

We do not transmit:
- Your IP address into long-term storage.
- Any device identifier, fingerprint, or installation UUID.
- Your audio, transcripts, dictionary, or settings.
- Your activity, session length, or feature usage.

## §B. What we receive when your Dictivo refreshes your license

Every 7 days, while online and only if you have not disabled it:

```
POST https://verify.dictivo.app/v1/license/refresh
Content-Type: application/json
{ "token": "<your current license token>" }
```

This lets us send you an updated token if you have renewed, and notify you if a refund or chargeback has revoked your license. No other data is collected.

## §C. What we receive when you use Cloud Fast

Cloud Fast is optional and separate from Local mode. When you select Cloud Fast, Dictivo sends:

- The current recording audio.
- Language, mode, duration, app version, platform, and a client session ID.
- Account or entitlement information needed to verify subscription status and monthly minute quota.

Dictivo does not send dictionary entries or snippets with Cloud Fast requests. Those remain local and are applied after the transcript returns.

The Dictivo proxy routes Cloud Fast requests to Groq `whisper-large-v3` first and falls back to ElevenLabs `Scribe v2` on provider rate limits, 5xx errors, timeout, network failure, empty result, or clearly invalid transcript output. Provider names and model routing are internal operational metadata. The desktop app receives the final transcript and a generic fallback-used state, not provider selection controls.

## §D. What you can disable

| Setting | Effect |
|---|---|
| Auto-check for updates | Stops the every-24-h request. You can still check manually. |
| Allow online license refresh | Stops the every-7-day request. Renewals must be activated manually via the email link. |
| Cloud Fast mode | Keep transcription in Local mode. No audio is uploaded for dictation. |
| Pre-release builds (beta) | Switches the update channel to `beta`. |

## §E. Lemon Squeezy

When you purchase Dictivo, **Lemon Squeezy** (3-One.com Inc., 2261 Market Street, Suite 5651, San Francisco, CA 94114) is the Merchant of Record and processes your payment, billing address, and tax information. Their privacy policy applies to that transaction: https://www.lemonsqueezy.com/privacy.

Dictivo receives from Lemon Squeezy only:
- Your name (as provided at checkout).
- Your email address (as provided at checkout).
- A Lemon Squeezy order ID.
- Country (for tax records).

We retain this information for the lifetime of the license + 7 years (tax-record retention requirement).

## §F. Subprocessors

| Service | Purpose |
|---|---|
| Lemon Squeezy | Payment processing, billing email |
| Cloudflare R2 | Update manifest + installer hosting |
| Cloudflare Workers | Update endpoint, license issuer, Cloud Fast proxy |
| Groq | Cloud Fast primary transcription provider |
| ElevenLabs | Cloud Fast fallback transcription provider |
| Resend (or Postmark) | Transactional emails — license delivery, renewal reminders |

We may switch any subprocessor with 30 days' notice. The Privacy Policy here will be updated, and the change visible at the canonical URL.

## §G. Your rights (GDPR / CCPA)

You may, at any time:
- Request a copy of all data we hold tied to your email address.
- Request deletion of that data, except where retention is required for tax compliance.
- Renew or cancel your subscription directly through the Lemon Squeezy portal linked from the email receipt.

Email `privacy@dictivo.app` for any of the above. We respond within 30 days.

---

# Drafting notes (private — do not publish)

- **Have counsel verify** the perpetual-fallback clause survives in the EU, US, and UK. The key risk is the "ongoing services" classification under consumer law: if the regulator treats Dictivo as ongoing services tied to the renewal subscription, parts of the perpetual-fallback claim may be challenged. The defense is that the Software itself is goods (delivered once), and the Update Window is a separate, ancillary service.
- **The 14-day refund** aligns with EU consumer law minimums and is generous enough to head off most disputes. Don't reduce below 14.
- **The "two devices" rule** is intentionally permissive. Many indie tools allow 1 device; doing 2 makes the laptop+desktop case smooth and reduces support load.
- **Major version carveout** (§8): consider whether v1 → v2 should be free for users still inside their Update Window at the moment of the v2 release. This is the Pixelmator Pro path and earns enormous goodwill. Defer the decision but keep the clause flexible.
