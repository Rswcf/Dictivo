# Launch Blockers — Decisions & External Dependencies

> Things I (as PM) cannot decide alone. Each one has a recommendation; the user's job is to confirm or override. Grouped by how blocking they are.

## A. Hard blockers — launch cannot ship without these

### A1. Legal entity and bank details

**What's blocked:** Lemon Squeezy onboarding (KYC), Apple Developer Program enrollment (individual or organization?), Microsoft Partner Center enrollment, EULA's "Governing Law" clause.

**Decision needed:**
- Is there a registered company already, or does one need to be incorporated before launch?
- Personal sole-proprietor (faster, but mixes personal liability) or LLC / corp (cleaner, slower)?
- In which jurisdiction? Affects tax, EULA enforceability, and Apple Developer enrollment type.

**Recommendation:** If no entity yet, register a US LLC (e.g. Delaware via Stripe Atlas / Firstbase, ~$500 + ~$300/yr) and use it for everything. Cleaner liability, easier to sell later, accepted everywhere.

### A2. Domain ownership

**What's blocked:** All update URLs, license endpoints, pricing site, every email From: address in `eula-and-privacy.md`.

**Decision needed:**
- Does `dictivo.app` already exist as a registered domain? Who controls the DNS account?
- If not registered, register today — `.app` is open and ~$15/yr.

**Recommendation:** Confirm registration; consolidate DNS to Cloudflare (free, fastest, integrates with R2/Workers used everywhere else in the plan).

Subdomains needed:
- `dictivo.app` (marketing)
- `updates.dictivo.app` (Worker)
- `releases.dictivo.app` (R2 custom domain for installers)
- `models.dictivo.app` (R2 custom domain for model weights)
- `verify.dictivo.app` (Worker, license refresh)
- `mail.dictivo.app` (SPF/DKIM for outgoing transactional email)

### A3. Apple Developer ID account

**What's blocked:** macOS signing, notarization, Mac App Store distribution.

**Decision needed:** Whose Apple ID? Individual ($99/yr) or organization ($99/yr but requires D-U-N-S number)?

**Recommendation:** Organization enrollment under the legal entity from A1. Takes 1–4 weeks (D-U-N-S verification). **Start this the day you sign the entity papers** — it's the longest-lead-time external dependency.

### A4. Windows code-signing account

**What's blocked:** Windows installer signing, SmartScreen reputation, Microsoft Store listing.

**Decision needed:**
- Azure Trusted Signing (~$10/mo, requires Azure tenant) vs Certum OV (~$200/yr, requires individual identity verification) vs Microsoft Store-only (offload to Microsoft).
- Or hybrid: Microsoft Store for SmartScreen reputation + Trusted Signing for the direct download.

**Recommendation:** **Azure Trusted Signing + Microsoft Store listing.** Cheapest combination that defangs SmartScreen.

### A5. Cloudflare account

**What's blocked:** All update infrastructure (R2, Workers, DNS).

**Recommendation:** A single Cloudflare account under the legal entity. Free tier covers everything except R2 storage (~$2/yr for our usage). Confirm 2FA + recovery codes are stored in 1Password / equivalent.

### A6. Counsel review of EULA and Privacy

**What's blocked:** Pricing page (claims need legal backing), EULA, Privacy Policy.

**Recommendation:** Engage a SaaS-specialized lawyer for a fixed-fee review of the EULA + Privacy. Budget $1,500–$3,000. Indie-friendly firms (e.g. Cobalt, LegalZoom Premium, or Pia Eberhardt at Indie Lawyer) are reasonable. **Calendar time for review: 1–3 weeks.** Engage early.

The clauses most likely to need rewording:
- "Perpetual fallback" (consumer law in EU may treat as ongoing service)
- Limitation of liability cap to purchase price (some jurisdictions don't permit)
- Refund window (UK / EU has a 14-day statutory minimum already)

### A7. Marketing website

**What's blocked:** Pricing page (`pricing-copy.md` is the copy, but no site yet), every external link in EULA / privacy.

**Current state:** `marketing/` directory holds a **Remotion** video project, not a website. There is no pricing page, no legal pages, no /vs page.

**Recommendation:** Stand up a static Astro / Next.js site at `dictivo.app` with the following routes minimum:
- `/` (hero + value props)
- `/pricing` (uses copy from `pricing-copy.md`)
- `/vs/wispr-flow`, `/vs/superwhisper`, `/vs/macwhisper` (comparison pages — SEO + decision support)
- `/privacy` (from `eula-and-privacy.md`)
- `/eula` (from `eula-and-privacy.md`)
- `/changelog` (mirror of `https://github.com/.../releases`)
- `/download` (redirects to platform-detected installer URL)
- `/renew` (deep-link to Lemon Squeezy hosted renewal)

Effort: 1 week front-end. The video at `marketing/` becomes hero content.

### A8. Lemon Squeezy account

**What's blocked:** Selling anything.

**Recommendation:** Apply within a week of having the legal entity from A1. KYC typically clears in 24–72 hours. While waiting, build the rest in parallel.

## B. Soft blockers — can launch with placeholder, must resolve before scale

### B1. Founder Lifetime offer (yes / no, scope)

**What's at stake:** The first ~100 users are your launch evangelists. Offering them Lifetime ($99? $149? included?) costs you very little because they would mostly renew anyway, but generates outsized social proof and PH/HN goodwill.

**Recommendation:** Yes, but small and capped:
- **First 100 buyers get Lifetime updates** at the same $49 (announced explicitly: "the first 100 Dictivo buyers receive Lifetime updates, never need to renew. Welcome.").
- Cap is hard — at user 101 the offer disappears.
- Mechanism: a `lifetime: true` claim in the JWT issued by the Worker for those orders. The endpoint Worker treats it as "always inside the window."

**Risk if no:** First 100 buyers feel like guinea pigs paying full price for unproven software. Conversion to PH/HN top-3 listings is harder.

**Risk if yes:** ~$2.4k of future renewals foregone (100 × $24/yr if 100% renewed). Trivial.

### B2. Free tier — yes or no?

**What's at stake:** Conversion funnel shape. A free tier doubles word-of-mouth but cuts ~30% of would-be paying users into freeloaders.

**Locked competitor data**:
- MacWhisper has free + Pro split; their free tier is widely used and Pro converts ~3-5%.
- Aiko is fully paid but $10, basically priceless.
- Wispr Flow has a free Basic tier; conversion data not public.

**Recommendation: Yes, a free tier**, narrowly scoped:
- Free = `tiny` model only, unlimited dictation, no time limit.
- Pro ($49) = all models + all future model upgrades + the renewal window mechanics.
- One-line copy on pricing page: "Try the free tier" CTA below the buy button.

**Why:** the free tier's existence is the strongest possible truth-test of the privacy claim. Users who like it convert; users who never would have paid anyway still tell their friends.

### B3. Student / EDU discount mechanics

**What's at stake:** A non-trivial slice of the dictation market (academics, ESL learners writing papers).

**Recommendation:** Defer to v1.1. Initial launch is simpler with one price. Manual `STUDENT` codes can be honored case-by-case via email — even at 100/yr, response time is fine.

### B4. Team / Org licenses

**Recommendation:** Defer to v1.1. Anyone who emails asking for team pricing pre-1.1 gets a manual quote at "5+ seats $39 each, 10+ seats $29 each, 25+ $24 each."

### B5. Major version 2.0 upgrade policy

**What's at stake:** Will users who bought 1.x in the months right before v2 releases feel cheated? Pixelmator handles this by giving any v1 buyer within the last 6 months a free upgrade.

**Recommendation:** Lock in a "6-month grandfather" promise in the EULA — any 1.x purchase within 6 months of v2 release gets v2 free. Communicated at v2 launch, not earlier. The clause in `eula-and-privacy.md` §8 already leaves room for this.

### B6. App icon / brand assets

**What's at stake:** The Settings → Updates UI mockups, pricing page hero, App Store listing.

**Current state:** Icons exist at `apps/desktop/src-tauri/icons/` but I haven't audited their quality / resolution / consistency.

**Recommendation:** Audit + retain a freelance icon designer if needed ($300–$1,000 on Dribbble / Twitter). Budget 1 week + 3 revisions. Deliverable: macOS .icns (1024×1024 down to 16×16), Windows .ico, social OG card, favicon set, App Store screenshots.

### B7. Support inbox + ticketing

**Recommendation:** Personal email (`hello@dictivo.app`) routed through Help Scout / Front (free tier). Don't open Discord on day 1 — it scales support poorly and creates a "always-on" expectation. Add it later when the user base demands it.

### B8. Analytics — to instrument or not

**The brand stakes:** Dictivo's privacy promise forbids client-side telemetry. But the marketing site and pricing page need *some* analytics to A/B test.

**Recommendation:**
- The **app** ships zero telemetry. This is the non-negotiable promise.
- The **marketing site** uses [Plausible](https://plausible.io) ($9/mo, cookieless, GDPR-OK). Plausible script lives only on `dictivo.app`, not in the app binary.
- Sales analytics (conversion, churn) come from Lemon Squeezy's own dashboard.

## C. Operational blockers — needed for steady state but not for launch

### C1. Crash reporting

**Tension:** Sentry / Crashlytics would tell us about real bugs but would also be telemetry. Some indie dev tools use **opt-in** crash reports (e.g. Linear). For Dictivo, **opt-in only**, disabled by default, in Settings → Privacy.

### C2. Beta channel sign-up flow

**Defer:** Beta opt-in in Settings is enough for v1.0. A public Beta program (mailing list, gated invites) is a v1.2 feature.

### C3. Affiliate / referral program

**Defer to v1.1+.** Lemon Squeezy supports affiliates natively, but launching with one adds policy + dispute work that doesn't earn yet.

### C4. App Store rollout strategy

The Mac App Store distribution is the *secondary* track per the locked decision. MAS has unique constraints:
- No `tauri-plugin-updater` — Apple requires use of the App Store auto-update.
- No `tauri-plugin-global-shortcut` permissions can be auto-granted — user grants in System Settings, same as direct distribution.
- Pricing must match (Apple takes 15-30% — we eat that, or list at $59 on MAS to net the same $49 we'd get direct).
- No license JWT, no renewal — Apple handles purchase, but in-app purchase for the annual renewal is doable.

**Recommendation:** Launch direct-only at v1.0. Ship to MAS as v1.1 (1-2 months later) once the direct funnel is stable. **List MAS at $59** to compensate for Apple's cut; explicitly state on the pricing page "MAS version available at $59 if you prefer the App Store; direct purchase at $49 supports us more."

## D. Things I autonomously decided (call out anything you want to change)

| Decision | Made by me | Reversible? |
|---|---|---|
| Lemon Squeezy over Paddle | §A.1 of license-architecture.md | Yes — JWT format is processor-agnostic |
| 14-day refund window (vs 30 / 7) | §4 of eula-and-privacy.md | Yes |
| 2-device activation limit (vs 1 or 3) | §7 of eula-and-privacy.md, §9 of license-architecture.md | Yes |
| Free tier = `tiny` model only | §B2 above | Yes |
| Beta channel exists at launch | §2 of strategy.md | Yes — can defer |
| Bundle `tiny` model into installer | §5 of model-cdn.md | Yes — but +78 MB installer |
| Use Azure Trusted Signing for Windows | §A4 above | Yes — Certum OV is the alternative |
| Disable Hugging Face fallback by 1.1.0 | §12 of model-cdn.md | Yes |
| Email cap: 2 lifetime emails per renewal cycle | §5 of renewal-flow.md | Yes |

## Recommended decision order (asked of the user)

1. **A1** (legal entity) and **A2** (domain) — these gate everything else.
2. **A6** (counsel) — engage early, runs in parallel.
3. **A3** + **A4** (signing accounts) — start as soon as A1 clears.
4. **A7** (marketing site) — can start design while waiting on legal.
5. **B1** (Founder Lifetime) — decide before public announcement.
6. **B2** (free tier scope) — decide before building license-issuer.
7. **B6** (brand assets) — design sprint in parallel with engineering.
8. Everything else — defer or use defaults.
