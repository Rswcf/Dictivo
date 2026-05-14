# Renewal Flow — UX + Lifecycle Messaging

> The 12-month update window is the only moment in Dictivo's customer journey that produces ongoing revenue. It must feel calm, fair, and never coercive. The user keeps the app forever no matter what — renewal is opt-in, not survival.

## 1. The lifecycle map

```
purchase           T+11mo            T+12mo               T+12mo+
   │                  │                  │                    │
   ▼                  ▼                  ▼                    ▼
─────────────────────────────────────────────────────────────────▶
   ↑                  ↑                  ↑                    ↑
   activation         30-day             window               post-expiry
   email + in-app     warning            close                idle (silence)
                                                              ↓
                                                              user opens
                                                              Settings → License
                                                              ↓
                                                              "Renew $24" offer
```

We **do not** keep escalating reminders after expiry. After one in-app notice on the day of expiry, the matter rests until the user actively opens Settings → License. This is the polite-by-default model.

## 2. Timeline

| Day relative to expiry | Channel | Message |
|---|---|---|
| **T-30 (30 days before)** | In-app, Settings → License badge appears (`30 days left`); no banner | "Your update window ends June 14, 2027. Renew anytime for $24/year." |
| **T-30** | Email (only if user opted in to renewal reminders at purchase, default *on*) | "Your Dictivo update window renews in 30 days. Want it to continue?" |
| **T-7** | In-app, light banner above Settings header (dismissible, per-session) | "7 days left in your update window. [Renew $24] [Remind me later]" |
| **T-0 (expiry day)** | In-app, one-time modal on next launch | "Your update window has ended today. Dictivo will keep working with the version you have. Renew anytime to resume new versions and models." |
| **T-0** | Email | "Your Dictivo update window has ended. Your app keeps working — renew anytime." |
| **T+1 to T+∞** | Silent. No banner. No emails. Just a `[Renew $24]` button in Settings → License. | — |

After the T-0 email, **the user hears from us only when they initiate contact** until/unless they renew.

## 3. The single forbidden pattern

We do **not** show any pricing, renewal CTA, or window-expiry notice during:
- Dictation in progress.
- The first 60 seconds after app launch (cold-start blocker).
- The Onboarding wizard's first run.

The marketing thrashing competitors do during these moments is exactly what makes them feel parasitic. Dictivo's brand stake here is more valuable than any single conversion.

## 4. Copy library

### 4.1 In-app banner (T-7 to T-0)

```
┌──────────────────────────────────────────────────────────────┐
│  Your update window ends in 7 days.                          │
│  Dictivo will keep working either way — renew $24/year to   │
│  keep receiving new versions and models.                     │
│                                                              │
│      [ Renew — $24/year ]    [ Maybe later ]                 │
└──────────────────────────────────────────────────────────────┘
```

`Maybe later` dismisses for the rest of the session. Reappears on the next launch up to the day of expiry; then never again unless the user opens Settings.

### 4.2 Expiry-day modal (T-0)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│             Your Dictivo update window has ended.            │
│                                                              │
│   The version you have now is yours to keep, with every     │
│   feature and model you have downloaded, offline, forever.   │
│                                                              │
│   If you'd like to keep receiving new versions and models,  │
│   you can renew for $24 to extend your window by another    │
│   12 months. There's no rush — your app won't change.        │
│                                                              │
│      [ Renew — $24/year ]    [ Got it, thanks ]              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Shown **once per expiry**. After dismiss, the matter is closed in the UI.

### 4.3 Settings → License (post-expiry)

```
┌──────────────────────────────────────────────────────────────┐
│ License                                                      │
│                                                              │
│ Licensed to     Alice Chen <alice@example.com>               │
│ Order           ord_01HXYZ123                                │
│ Purchased       May 14, 2026                                 │
│ Update window   May 14, 2026 — May 14, 2027  (ended)         │
│ Current version 1.4.2  (downloaded before window ended)     │
│                                                              │
│         [ Renew Dictivo updates — $24/year ]                 │
│                                                              │
│ Renewing today extends your window to May 14, 2028.          │
│ Your app keeps working with the version you have until then. │
└──────────────────────────────────────────────────────────────┘
```

## 5. Email sequence — sample copy

### Email 1: T-30 reminder

> Subject: **A heads-up about your Dictivo update window**
>
> Hi Alice,
>
> One year ago, you bought Dictivo for $49 — thank you for being there early.
>
> Your 12-month update window ends on **June 14, 2027** (30 days from now). After that, the version of Dictivo you have keeps working forever, every feature and every model you have downloaded. You don't need to do anything.
>
> If you'd like to keep receiving new versions and new transcription models we ship over the next year, you can renew for **$24** — about $2 a month — and we'll extend your window by another 12 months.
>
> [ Renew Dictivo updates — $24/year ]
>
> No rush, and no offense taken if you skip it.
>
> — The Dictivo team
>
> P.S. You can opt out of renewal reminders entirely in Settings → License. We send at most one of these per year.

### Email 2: T-0 (window ended)

> Subject: **Your Dictivo update window has ended — your app keeps working**
>
> Hi Alice,
>
> Just a note to confirm your update window with Dictivo ended today. The version you have on your computer keeps working forever — that's the deal we promised when you bought it.
>
> If you ever want to resume receiving new versions, the renewal page is here:
>
> [ Renew — $24/year ]
>
> That's the last email you'll get about this. We'll only reach out again if you renew or if something significant happens (a security update, the company changing hands, etc.).
>
> Thank you for using Dictivo.
>
> — Dictivo

After these two emails, the user is on **maintenance silence** — only transactional emails (purchase receipts, password-reset equivalents, security advisories) reach them.

## 6. What "renew" does mechanically

1. User clicks `Renew $24/year` in the banner / Settings / email.
2. Browser opens to `https://dictivo.app/renew?token=<jwt>`.
3. Lemon Squeezy hosted checkout, prefilled with the user's email.
4. On success, Lemon Squeezy sends a `subscription_payment_success` webhook to the license issuer Worker.
5. Worker re-mints the JWT with `updates_until = max(now, existing_updates_until) + 365 days`.
6. Worker emails the new JWT as an activation link.
7. User clicks; Dictivo silently accepts the new token; the banner / lock disappears.
8. Settings → License now shows the new window dates.

The whole loop typically takes < 60 seconds and requires no app restart.

## 7. Cancellation

The renewal is a **recurring annual subscription** in Lemon Squeezy's terms — opt-in, with an obvious cancel link in every renewal receipt. Cancelling does **not** alter the user's then-current license — they remain in their existing window through its natural end.

UX inside the app: Settings → License → `Manage subscription` opens the Lemon Squeezy customer portal. We never embed cancellation friction.

## 8. Edge cases

### 8.1 User upgrades hardware shortly before expiry

If a user activates Dictivo on a new machine within 30 days of `updates_until`, we silently grant them a 30-day extension as a courtesy. The new `updates_until` is `max(updates_until, now + 30 days)`. This avoids the bad feeling of "I just bought a new laptop and the app I bought last year is already 'expired'."

### 8.2 User's license is revoked (refund/chargeback) before expiry

Standard revocation path. The banner copy switches to:

> Your Dictivo license has been refunded. The app remains functional with the version you have. Please contact support if this is in error.

No renewal CTA shown.

### 8.3 Multi-machine: two devices, one expires before the other

There is only **one** license and one `updates_until`. Both machines see the same status. Settings on either device offers the same renewal flow.

### 8.4 The user has disabled "online license refresh"

Then they never receive a re-minted JWT automatically. After they renew, an in-app screen prompts: `Please paste the activation token from the renewal email to extend your window.` Same activation flow as initial purchase.

### 8.5 They renew after a year of expiry

The new window starts **today**, not retroactively. We do not back-date renewals. We optionally let the user *re-download* updates that were released during the lapse (the manifest still contains them); we don't withhold history.

## 9. Renewal-rate target

The reference numbers from comparable independents:
- Sketch's renewal model: ~40–60% Y1 renewal among engaged users.
- Tower's mandatory subscription: 75% Y2 renewal, but worse Y1 because users perceive lock-in.
- Sublime Text's 3-year model: most users don't renew because they don't *need* the next major.

For Dictivo, the realistic target is **35–50% Y1 renewal**, gradually climbing as model improvements accumulate visibly between renewal cycles. Below 25% Y1 → re-examine the value of the past year's shipped features. Above 60% → consider raising the renewal price for next-cohort buyers (never retroactively).

## 10. Settings → License → "Renewal reminders" toggle

```
☑ Email me before my update window ends
   We'll send at most one reminder 30 days before, and one note on the day
   the window ends. No marketing emails.
```

Default ON. The user can flip it off and they will only ever hear from us about security or transactional matters.

## 11. Implementation hooks (where in the codebase)

| Component | New responsibility |
|---|---|
| `apps/desktop/src-tauri/src/license.rs` | Compute days-until-expiry; emit events `dictivo://renewal-30d`, `-7d`, `-0d` exactly once each |
| `apps/desktop/src/components/RenewalBanner.tsx` | New, listens to the events above |
| `apps/desktop/src/components/SettingsView.tsx` | Add the post-expiry state to the License section |
| `apps/desktop/src/lib/settingsStore.ts` | Persist `renewal_reminders_dismissed_for: "2027-05-14"` so each warning fires exactly once |
| `infra/license-issuer/src/cron.ts` | Daily Worker cron: emit T-30 and T-0 emails for all eligible licenses |
| `infra/license-issuer/src/email.ts` | Templates for the two emails above |

## 12. Decision log

- **Why only two emails?** Three or more crosses into the "pestering" range. Two is enough for anyone genuinely interested, and respects everyone else.
- **Why renew → forward, not retroactive?** Retroactive renewals create a perverse incentive: skip renewing for 2 years, then renew once to "catch up" cheaply. Forward-only respects the model.
- **Why $24 and not $19 or $29?** $24 = "$2/month" anchor, which slots neatly under the average competing subscription. $19 looks too close to "free." $29 looks too close to half the original purchase. $24 also leaves clean room above for any future "Pro" annual add-on at $39–$49.
