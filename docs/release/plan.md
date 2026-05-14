# Dictivo Launch Plan — Solo Indie Edition

> **Operational checklist with copy-paste commands:** [`SETUP.md`](./SETUP.md). Use this file (`plan.md`) for the *why*, use `SETUP.md` for the *what to click right now*.



> Solo natural-person seller. No legal entity yet. Goal: ship Dictivo at $49 one-time + optional $24/yr renewal, earn pocket money, stay compliant, keep risk floor as low as possible. The entire backend is **Lemon Squeezy + GitHub + a static page on Cloudflare**.

## 1. Locked decisions (unchanged from earlier discussion)

| | |
|---|---|
| Business model | $49 buy-once + 12-month update window + $24 renewal + perpetual fallback |
| Distribution | Dual-track: own site (Lemon Squeezy) + Mac App Store (deferred to v1.1) |
| Update notifications | Menubar dot + non-blocking banner + Settings. "Install on quit." Never modal during work. |

## 2. The entire stack (everything you need to operate)

| Component | Tool | Cost |
|---|---|---|
| Source code (this repo) | GitHub `Rswcf/Dictivo` | Free |
| Marketing site (separate repo) | GitHub `Rswcf/Dictivo-site` → Cloudflare Pages project `dictivo-app` | Free |
| Installer hosting | Cloudflare R2 bucket `dictivo-downloads`, public domain `downloads.dictivo.app` | ~$2/yr storage |
| Domain + DNS | Cloudflare Registrar | ~$15/yr |
| Payment + license keys + emails | Lemon Squeezy (Merchant of Record) | 5% + $0.50/txn |
| macOS code signing + notarization | Apple Developer Program (individual) | $99/yr |
| ~~Windows code signing~~ | ~~Azure Trusted Signing~~ — **deferred to v1.1** | ~$120/yr |
| Update manifest hosting | GitHub Releases (asset on each release) | Free |
| Updater signature | Tauri minisign (Ed25519) | Free |
| Model weights hosting | Hugging Face (current) → R2 only if HF rate-limits | $0 |
| Site analytics (post-launch) | Plausible | Skip at launch |

**v1.0 recurring (Mac-only): ~$115/yr. Breakeven: ~3 sales/year.**

**Zero custom backend code.** No Workers, no databases, no auth, no email infrastructure to maintain. Lemon Squeezy is doing the actual work of issuing licenses and emails; you write none of that.

## 3. Architecture — one diagram

```
   ┌──────────────────────────────────────────┐
   │  Marketing site (separate repo)          │
   │  github.com/Rswcf/Dictivo-site            │
   │  → Cloudflare Pages → dictivo.app         │
   │                                          │
   │  • Hero + pricing + FAQ                  │
   │  • Privacy + EULA pages                  │
   │  • Download buttons → downloads.dictivo  │
   │  • $49 [Buy] button → LS checkout        │
   └────────────────┬─────────────────────────┘
                    │  buyer clicks Buy
                    ▼
   ┌──────────────────────────────────────────┐
   │  Lemon Squeezy (Merchant of Record)      │
   │                                          │
   │  • Hosted checkout                       │
   │  • Charges card, handles VAT/tax         │
   │  • Issues license key                    │
   │  • Emails buyer license + receipt        │
   │  • Manages renewals + refunds            │
   └────────────────┬─────────────────────────┘
                    │  email with license key
                    ▼
   ┌──────────────────────────────────────────┐
   │  Dictivo (Tauri app, this repo)          │
   │                                          │
   │  1. User pastes key into Settings        │
   │  2. App calls LS Activate API once       │
   │     → returns: valid, order date, email  │
   │  3. App caches the license locally       │
   │  4. App computes updates_until           │
   │     = order.created_at + 12 months       │
   │  5. App polls latest.json once on launch │
   │     and every 24h; compares pub_date     │
   │     to updates_until to decide whether   │
   │     to surface a new build               │
   └────────────────┬─────────────────────────┘
                    │  fetches latest.json
                    ▼
   ┌──────────────────────────────────────────┐
   │  GitHub Releases (this repo)             │
   │  Tag-driven: `git push --tags`           │
   │                                          │
   │  • latest.json (release asset)           │
   │  • Dictivo.app.tar.gz + .sig (updater)   │
   │  • Dictivo-*.dmg (user installer, also   │
   │    mirrored to R2 for downloads.        │
   │    dictivo.app/* routes)                 │
   └──────────────────────────────────────────┘
```

Three repos, zero custom backend code. Marketing site, desktop app, and the LS dashboard are the entire operational surface.

## 4. Why this is dramatically simpler than v1

| v1 (over-scoped) | v2 (lean) — saved effort |
|---|---|
| Custom license-issuer Worker that mints Ed25519 JWTs | LS issues license keys natively — save 1 week + ongoing maintenance |
| `verify.dictivo.app` weekly refresh endpoint | LS's `validate` endpoint covers it on demand — save 3 days |
| `updates.dictivo.app` Worker with `Authorization: Bearer <jwt>` and 204 logic | Static `latest.json` on Pages, client-side gating — save 2 days + monthly Worker checks |
| Resend/Postmark for transactional email + email templates | LS auto-emails — save 2 days |
| Cron Worker for renewal reminders | LS sends renewal reminders for subscriptions — save 2 days |
| Founder Lifetime offer (first 100 buyers) | Skipped — adds JWT claim + edge cases |
| Beta channel | Skipped — single stable channel at launch |
| `/vs/wispr-flow` etc. comparison pages | Skipped — defer to post-launch SEO work |
| A/B test pricing copy | Skipped — set one price, ship |
| Counsel review of EULA before launch | Use a template — counsel pass only when revenue ≥ $10k |
| US LLC incorporation | Stay natural person; revisit at $20k/yr revenue |
| Microsoft Store secondary distribution | Skipped at launch |
| Bundled offline installer variant | Bundle only `tiny`; rest on-demand |
| Custom JWT signing keypair management | LS handles license validity entirely |
| Worker analytics | LS dashboard has it |

## 5. License flow — using Lemon Squeezy native

### 5.1 Activation

1. User pays $49 on LS hosted checkout.
2. LS emails the user a license key (e.g. `4F3A-...-9C2B`) automatically.
3. User opens Dictivo → Settings → License → pastes the key → clicks Activate.
4. App makes one call:
   ```
   POST https://api.lemonsqueezy.com/v1/licenses/activate
   {
     "license_key": "4F3A-...-9C2B",
     "instance_name": "Alice's MacBook"
   }
   ```
5. LS responds with: `valid: true`, `license_key.created_at`, `customer.email`, `meta.order_id`, `instance.id`.
6. App caches this in the OS keyring (license key + instance ID) and in SQLite (display data).
7. **No further online check is required.** Activation is one-time.

### 5.2 Update-window enforcement (entirely client-side)

```rust
// inside the app, no network call needed
let purchased_at: DateTime<Utc> = license.created_at;
let updates_until = purchased_at + Duration::days(365);
let build_pub_date: DateTime<Utc> = manifest.pub_date;

let can_install_update = build_pub_date <= updates_until;
```

If `can_install_update == false`, the app shows a banner:

```
A new version of Dictivo is available, but it was released after
your update window ended on May 14, 2027. Renew for $24/year to
install it. Your current version keeps working either way.
```

This is **easily bypassed by anyone determined** (binary patching). For a $49 indie tool, that's fine — the honest 95% renew, the cheats 5% wouldn't have paid anyway. No server-side enforcement infrastructure to maintain.

### 5.3 Renewal flow — simplest possible form

Renewal is a **separate $24 LS product**, not a recurring subscription.

- 30 days before `updates_until`, the app shows a calm in-app reminder in Settings.
- 0 days before, one in-app notice. Then silence.
- User clicks "Renew $24" → LS hosted checkout for the renewal SKU → LS emails a new license key.
- User pastes the new key into Settings → app extends `updates_until` by another 365 days.

No automatic recurring billing means **no failed-card emails to handle, no subscription state to reconcile, no LS webhook to listen for**. Trade-off: a fraction of users forget to renew. Acceptable for the indie scale.

(Later, if you want auto-renewal, switch this product to LS's subscription type — about 30 minutes of work.)

### 5.4 Multi-device

LS Activate API enforces `activation_limit` natively. Set it to **2** in the LS product config. The third activation returns an error; the LS UI in the user's email lets them deactivate one.

### 5.5 Refunds + chargebacks

- 14-day refund. User emails you, you click Refund in LS dashboard. Done.
- LS handles chargeback disputes end-to-end. You only see the net payout.
- After a refund, the license key is automatically invalidated by LS. The app's next activation check (re-paste, or just one heartbeat) returns `valid: false`. Until then, the app continues to function (perpetual fallback applies). This is acceptable and on-brand.

## 6. Update delivery — GitHub Releases only

1. CI in **this** repo builds signed `.app.tar.gz` (macOS) on every `v*.*.*` tag.
2. CI generates `latest.json` containing the signed URL + minisign signature.
3. CI publishes everything as assets on the GitHub Release.
4. Tauri updater plugin in the installed app polls
   `https://github.com/Rswcf/Dictivo/releases/latest/download/latest.json`
   once on launch + every 24h. GitHub auto-redirects to the asset on the most-recent non-prerelease tag.
5. The `url` field inside `latest.json` points at the same release's `.app.tar.gz`.

**Why not host on `dictivo.app/latest.json`?** Because the marketing site lives in a separate repo (`Rswcf/Dictivo-site`). Cross-repo writes would require either (a) a GitHub PAT in this repo with write access to the other (sprawling secrets) or (b) a webhook chain that's brittle. The GitHub Releases asset URL solves all of this with zero infra: it works the moment the first release exists, it follows the latest tag automatically, and Tauri's updater follows the redirect natively.

The marketing site's `downloads.json` and `downloads.dictivo.app/*` are a **separate concern** — they're the human-facing "Download for Mac" experience and are updated in the site repo via its own release flow. The two manifests never share a schema and never need to be in sync byte-for-byte.

## 7. Model hosting — keep Hugging Face for now

`private_fast.rs` already pulls models from `huggingface.co/ggerganov/whisper.cpp`. Keep this for v1.0. **Add SHA256 verification client-side** with a constant per model — that's a 10-line addition.

If HF starts rate-limiting (unlikely at our scale), migrate models to a single R2 bucket of static files: ~$2/yr storage, no Worker. Same `download_private_fast_model` code, only the URL constants change.

**Bundle the `tiny` model in the installer** (~78 MB) so the app works immediately on first launch, no internet required.

## 8. Compliance — what's actually needed for a natural-person seller

### 8.1 What Lemon Squeezy does *for you* (as MoR)

- Collects and remits VAT in 100+ jurisdictions.
- Collects and remits US sales tax.
- Handles consumer rights (EU 14-day cooling-off, etc.).
- Manages chargebacks.
- Issues invoices/receipts in the right language and tax format.

You receive net payouts via Wise / PayPal / Payoneer. **You do not register for VAT in any country.** This is the entire reason to use LS instead of Stripe-direct.

### 8.2 What you do

| Area | Action | Time |
|---|---|---|
| Personal income tax | Declare LS payouts as income in your local jurisdiction. Keep LS's annual statement. Handled offline; doesn't touch product operations. | 1 hr/yr |
| EULA | Generate from a template (Termly free tier / TermsFeed). English, global, references LS as MoR. | 2 hrs |
| Privacy Policy | Generate from a template. Describe the actual flows: update check (no PII), license activation (email from LS), zero in-app telemetry. | 1-2 hrs |
| Refund policy | 14 days, full refund, no questions. Listed on pricing page. | 5 min |
| Marketing-site legal notice | One footer line identifying the seller + contact email. Detail level adapted privately to your jurisdiction. | 5 min |
| Cookie/tracking notice | Not needed if no analytics. Plausible is cookieless if added later. | 0 |

**No counsel review at launch.** Re-evaluate when revenue clears $10k/yr — at that point a $300–500 lawyer pass over your EULA + Privacy is cheap insurance.

### 8.3 EULA — the only clauses that actually matter for risk

1. **License grant**: perpetual use of the version you have, on up to 2 of your own devices.
2. **No warranty**: "Software provided AS IS, no fitness for any particular purpose."
3. **Liability cap**: "Total liability limited to amount paid."
4. **Refund window**: 14 days, contact support@yourdomain.
5. **Governing law**: your country/jurisdiction.

A template gives you all five plus boilerplate. Don't promise more than you can deliver. Don't claim things that aren't true (uptime SLAs, no-bug guarantees).

### 8.4 The "perpetual fallback" promise — risk analysis

The promise is "the app keeps working forever, even if we shut down." This sounds scary but is actually **the lowest-risk promise possible**, because:

- The app already runs offline by design. There is no server it needs.
- The license validation is one-shot at activation. After that, the cached license is trusted.
- Even if LS goes away tomorrow, every paid user's cached license keeps validating forever (you literally can't unset it without an app update, which you wouldn't ship).

Honoring this promise costs zero. Breaking it would require you to actively push a malicious update — which you won't. Easy promise to keep.

## 9. Risk minimization — practical checklist

| Risk | Mitigation | Status |
|---|---|---|
| Chargeback | LS handles; you eat the $15 fee + refund | Built-in |
| Tax non-compliance | LS is MoR | Built-in |
| GDPR / privacy lawsuit | Collect zero PII in the app; LS handles checkout-side PII per its own policy | Built-in by design |
| Code-injection via tampered update | Minisign verification on every update | Built into Tauri plugin |
| User's machine bricked by bad release | Tauri can install update on quit; if catastrophic, user re-downloads from your site (signed installers are always available) | Built-in |
| Hugging Face vanishes / rate-limits | Cache model URLs locally; can migrate to R2 in a day | Easy path |
| LS account suspended | Cached licenses still work; can migrate to Paddle/Gumroad in <1 week (license validation re-keying needed) | Low-likelihood, manageable |
| Apple Developer cert expires | Annual renewal calendar reminder | Trivial |
| Customer email leaks via compromised inbox | Use a dedicated `hello@dictivo.app` inbox with 2FA; you have nothing else to leak | Trivial |
| Refund abuse | 14 days is short enough; if any single buyer abuses, deny the second purchase | Manual |
| Crack tools | Acknowledged; ignored. Honest payers will pay. | Accepted |

There is **no high-likelihood, high-impact risk** in this stack that isn't already mitigated. The biggest practical risk is "you give up on the product before earning $1k." That's a motivation risk, not a technical one.

## 10. Decisions — locked

| # | Decision | Status |
|---|---|---|
| 1 | **Mac-only at v1.0**; Windows deferred to v1.1 once Mac launch is stable | ✅ Locked |
| 2 | **Free tier exists** = `tiny` model, unlimited dictation; Paid $49 = all models + 12-mo update window | ✅ Locked |
| 3 | `dictivo.app` registered, will be consolidated to Cloudflare DNS | ✅ Locked |
| 4 | **Lemon Squeezy** as MoR, payouts via SEPA or Wise — global approach, seller's local tax handled offline | ✅ Locked |
| 5 | **Target customer: US + Western Europe**, affluent, privacy-conscious. English-only at launch. USD-primary pricing. | ✅ Locked |

### 10.1 Payment + Merchant of Record — Lemon Squeezy, locked

Lemon Squeezy acts as Merchant of Record. From the moment a buyer clicks Buy, LS is the legal seller of record — they charge the card, collect the correct VAT/sales tax for the buyer's jurisdiction, issue the invoice in the right language, send the license-key email, manage refunds and chargebacks, and pay you the net amount on a regular cadence.

This means:
- **The seller** (you) does not register for VAT/sales tax in any country. Anywhere.
- **The seller** receives net payouts and declares them as ordinary income wherever they live, separately and privately from this product's operations.
- **The product's compliance surface** (EULA, Privacy Policy, refund terms) is global English-language and bound to the marketing site, not to any specific tax jurisdiction.

Fees: 5% + $0.50/transaction (≈ 5.5% effective at $49). At any revenue scale Dictivo will plausibly reach in years 1-2, this premium over Stripe-direct is well worth not having a global tax-compliance side-job.

### 10.2 Compliance surface — global, jurisdiction-agnostic

| Item | What it is | Source |
|---|---|---|
| **EULA** | Standard SaaS terms — perpetual license to the bought version, 12-mo update entitlement, 14-day refund, liability cap to purchase price | Template (Termly / TermsFeed / Lemon Squeezy partner). English. |
| **Privacy Policy** | Cookieless marketing site; app collects no PII; LS is sub-processor for checkout. | Template + customization (1 hr) |
| **Refund policy** | 14 days, full refund, no questions. Stated on pricing page + receipt. | LS supports this natively. |
| **Imprint / legal notice** | Required by some jurisdictions on the seller's website. Use a generic line: `Dictivo is sold by [your name], operating as an independent software developer. For inquiries: hello@dictivo.app` — adapt the level of address detail to your local legal obligation privately. | One line on marketing site footer |
| **Lemon Squeezy disclosure** | Required: state that LS is the Merchant of Record. One sentence in the Privacy Policy + receipt. | LS provides standard copy |

**Counsel review** is optional at launch. Revisit once annual revenue clears $10k — at that point a single fixed-fee EULA pass ($300-1000 from an indie-friendly SaaS lawyer) is cheap insurance.

### 10.3 Payout

LS pays in USD. Options:
- **SEPA** (EU sellers): direct EUR conversion at LS's FX rate. €0 fee. Simplest.
- **Wise**: multi-currency account, hold USD without forced conversion, better FX, ~€2-5 per transfer. Recommended if revenue grows past $10k/yr.
- **PayPal**: works globally but worst FX. Avoid.

Choose during LS onboarding; can be changed later.

### 10.4 Target customer — explicit positioning

The pricing, copy, and feature priorities all assume the same buyer profile:

- **Geography**: US + Western Europe (UK, DE, FR, NL, SE, CH, AT, BE, IE).
- **Income / role**: knowledge workers, writers, researchers, developers, students at well-funded institutions — anyone whose 30 minutes of typing time per day is worth $5+.
- **Disposition**: privacy-conscious enough that "100% local, no cloud" is a *headline*, not a footnote. Already heard of Whisper / runs models locally / has opinions about subscriptions.
- **Currency**: USD-primary on the pricing page; LS auto-displays EUR/GBP based on buyer IP.
- **Language**: English only at v1.0. Localization (DE/FR) is a v1.2+ consideration.
- **Channels**: Hacker News, r/macapps, Product Hunt, Twitter/X dev community, niche newsletters (Apple Insider, Six Colors, MacStories). **Not** general consumer ads.

Everything in `pricing-copy.md` (the FAQ voice, the "we don't subscription-trap you" framing, the side-by-side competitor table) is calibrated to this buyer. Avoid expanding the persona until v1.0 has 500+ paying users — wider personas weaken the message that hooks this one.

### 10.2 Cost impact of locked decisions

| Item | Annual |
|---|---|
| Apple Developer Program (individual) | $99 |
| ~~Azure Trusted Signing (Windows)~~ | ~~$120~~ → defer to v1.1 |
| Domain (`dictivo.app`) | $15 |
| Cloudflare DNS + Pages | $0 |
| Lemon Squeezy | per-transaction only (5% + $0.50) |
| **Total recurring (Mac-only v1.0)** | **~$115/yr** |

Breakeven: ~3 sales/year.

## 11. Realistic timeline (calendar, not effort)

| Week | What happens |
|---|---|
| 0 | Register `dictivo.app`. Apply to Apple Developer Program (individual, $99). Apply to Lemon Squeezy. Start a Cloudflare account. |
| 1 | Apple Developer approves (1–4 weeks variance — sometimes faster as individual). LS approves (24–72 hrs). Cloudflare set up. |
| 2 | Generate Tauri minisign keypair locally. Add `tauri-plugin-updater` to project. Write the `release-desktop.yml` workflow. First signed/notarized build runs end-to-end on a test tag. |
| 3 | Wire Settings → License (paste key → call LS Activate). Wire Settings → Updates (status + manual check + auto-toggle). Wire UpdateBanner. |
| 4 | Build the 1-page marketing site (HTML + Tailwind), pricing page, EULA + Privacy from templates. Set up LS product with `activation_limit: 2`. |
| 5 | Soft launch: HN "Show HN" thread + Twitter. Watch for the first 20 real purchases. Fix anything that breaks. |

**~5 weeks from today, gated mainly on Apple Developer approval.**

## 12. v1 → v1.1 → v1.2 roadmap (post-launch)

| Version | Adds |
|---|---|
| 1.0 | Mac-only or Mac+Windows, the lean stack above |
| 1.1 (~3 months later, if revenue justifies) | Windows (if launched Mac-only) **or** Mac App Store listing **or** student discount via discount codes |
| 1.2 (~6 months later) | Team licenses; first new Whisper-family model integration to vindicate the renewal value |
| 1.3 + | New languages, polish, accessibility, whatever the user feedback prioritizes |

Major version 2.0 is at least **18 months** away. Don't think about it until then.

## 13. The four sentences you put on the pricing page

> Dictivo turns speech into polished text on your laptop — 100% offline.
> $49 once, yours forever. The first 12 months of new versions and models are included.
> After that, the version you have keeps working forever — renew for $24 anytime to get the next 12 months.
> No subscription, no cloud, no telemetry. 14-day full refund.

If you can't agree with every word of those four sentences, the plan is wrong. If you can, the plan is right.

---

## 14. Index of detailed reference docs (mostly over-scoped — read only if you want details on a specific topic)

- `_v1-reference/strategy.md` — SemVer policy + the perpetual-fallback language for the EULA (the EULA section is reusable; the rest is more than you need)
- `_v1-reference/updater-integration.md` — concrete Tauri config + Rust setup hook + UpdateBanner component (the **code** is reusable; ignore the Worker-routing bits)
- `_v1-reference/ci-release-pipeline.md` — the GitHub Actions workflow YAML (drop the R2 upload and Worker bits; keep the Apple/Azure signing steps)
- `_v1-reference/pricing-copy.md` — pricing page copy + FAQ (reusable as-is for the marketing site)
- `_v1-reference/eula-and-privacy.md` — plain-language EULA clauses (use as a checklist against your template's clauses)
- `_v1-reference/model-cdn.md` — only relevant if HF starts rate-limiting
- `_v1-reference/renewal-flow.md` — the **UX copy** for the in-app banner is reusable; ignore the cron Worker bits
- `_v1-reference/license-architecture.md` — entirely superseded by "use LS's license API"
- `_v1-reference/blockers.md` — the decision list is mostly addressed in §10 above
