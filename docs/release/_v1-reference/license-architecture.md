# License Enforcement Architecture

> The license is the bridge between the $49 purchase, the 12-month update window, and the perpetual-fallback guarantee. Design priorities, in order: (1) the app keeps working forever even without a license server, (2) license check is invisible during normal use, (3) cracking is *inconvenient* but not the focus — the typical Dictivo buyer is not the typical cracker.

## 1. Decision: Lemon Squeezy as Merchant of Record

| Option | Verdict |
|---|---|
| **Lemon Squeezy** | ✅ Chosen. 5% + $0.50 per txn. Handles global VAT/sales tax as MoR. Webhooks + License API native. Free to start. Indie-friendly UI. |
| Paddle | ❌ Stronger SaaS billing features, but heavier KYC, longer onboarding, and overkill for a single-SKU desktop app at launch. |
| Stripe direct | ❌ Excellent for cards, but we'd inherit VAT/MOSS compliance ourselves — non-trivial for an EU/global launch. |
| FastSpring | ❌ Established, but UI dated, fees marginally higher, less attractive checkout. |
| Gumroad | ❌ Cheap and popular for indie, but checkout brand is "Gumroad", license management is thin. Reserved for first 30 days only if Lemon Squeezy onboarding stalls. |

Switching is reversible later — the license token format is independent of who issues it.

## 2. What a license *is*

A **signed JWT** the user obtains after purchase, stored in the OS keyring. Validation happens entirely offline using a public key shipped inside the app binary.

```json
{
  "iss": "license.dictivo.app",
  "sub": "ord_01HXYZ123",                 // Lemon Squeezy order id
  "email": "alice@example.com",
  "name": "Alice Chen",
  "purchased_at": "2026-05-14T10:23:00Z",
  "updates_until": "2027-05-14T10:23:00Z",
  "seats": 1,
  "product_variant": "personal",          // "personal" | "team" | "edu"
  "iat": 1747214580,
  "exp": 1747214580                       // SAME as iat — the token is non-expiring,
                                          // but we re-mint on every renewal so old
                                          // tokens get superseded
}
```

Signed with **Ed25519** (`EdDSA` in JWT terms). The public key is hard-coded into the Rust binary.

## 3. End-to-end flow

```
┌────────────┐  ① /buy        ┌──────────────┐   ② webhook     ┌──────────────────┐
│ marketing  │ ──────────────▶│ Lemon Squeezy│ ───────────────▶│ license-issuer    │
│ pricing pg │  buyer pays    │  hosted ckt  │  order_created  │ Worker on dictivo │
└────────────┘                └──────────────┘                  └────────┬─────────┘
                                                                         │ ③ mint JWT,
                                                                         │   send email
                                                                         ▼
                                                                ┌──────────────────┐
                                                                │ email to buyer    │
                                                                │ "Activate Dictivo│
                                                                │  → click link"   │
                                                                └────────┬─────────┘
                                                                         │ ④ deep link
                                                                         ▼
                                                            dictivo://activate?token=<jwt>
                                                                         │
                                                                         ▼
                                                                ┌──────────────────┐
                                                                │ Tauri app stores  │
                                                                │ JWT in keychain   │
                                                                │ + verifies signed │
                                                                │ token offline     │
                                                                └──────────────────┘
```

Renewals follow the same path: webhook on `subscription_payment_success` issues a fresh JWT and emails an activation link that replaces the stored token.

## 4. Activation UX

**Path A — deep link (preferred):**
The email's "Activate Dictivo" button opens `dictivo://activate?token=<jwt>`. The OS hands it to the running Dictivo, which decodes, verifies, stores, and shows a success toast.

**Path B — paste:**
Settings → License → "Paste your activation token". For users on locked-down machines where custom URL schemes don't fire.

**Path C — sign-in (future):**
Click "Sign in to recover license", confirm email magic link, app pulls the latest JWT from the issuer Worker. Defer to post-launch.

## 5. Offline verification (Rust, in `src/license.rs`)

```rust
use ed25519_dalek::{Signature, VerifyingKey};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};

const PUBKEY_PEM: &str = include_str!("../keys/license-pubkey.pem");

pub fn verify_license(token: &str) -> Result<Claims, LicenseError> {
    let key = DecodingKey::from_ed_pem(PUBKEY_PEM.as_bytes())?;
    let mut validation = Validation::new(Algorithm::EdDSA);
    validation.set_issuer(&["license.dictivo.app"]);
    // Crucial: do NOT enforce exp — token is non-expiring by design.
    validation.validate_exp = false;
    let data = decode::<Claims>(token, &key, &validation)?;
    Ok(data.claims)
}
```

Verification is pure, runs in <1 ms, requires no network. The app **never blocks on an online check**.

## 6. The `updates_until` field — the entire commercial enforcement surface

That single timestamp is *all* the app uses to gate update delivery:

```rust
pub fn is_in_update_window(claims: &Claims, build_pub_date: DateTime<Utc>) -> bool {
    build_pub_date <= claims.updates_until
}
```

- The endpoint Worker (see `ci-release-pipeline.md` §5) compares `pub_date` of `latest.json` against `claims.updates_until` and returns `204` if expired.
- The client also computes the same locally and tells the user "your update window ends in N days" / "expired — renew anytime".

**There is no other enforcement.** No feature is gated by `updates_until`. The user keeps full functionality of whatever build they last received.

## 7. Re-verification cadence (lightweight)

Every 7 days when the app starts and is online, the app *optionally* phones home to `verify.dictivo.app/v1/license/refresh` to:
- Receive a fresh JWT if the customer has renewed.
- Receive a revoked-list marker if the customer issued a chargeback or refund.

The user can disable this in Settings → License → "Allow online license refresh" (default on). Disabling it does not break anything; it just means renewals must be activated manually via email link.

## 8. Revocation policy

We revoke a license only when:
- The order is chargebacked / refunded.
- The license is shared on the public internet (rare, manual handling).

Revocation lives in a server-side bloom filter pulled by the refresh endpoint. The Tauri app, if it has a refreshed list, will:
- **Continue running the installed build** (perpetual fallback applies always).
- Stop accepting future updates.
- Show a one-time Settings message: "Your license was refunded on YYYY-MM-DD. The app remains functional; please contact support if this is a mistake."

## 9. Multi-machine policy

A `personal` license = one seat = one active machine at a time. The activation Worker tracks `machine_id` (random UUID generated at first launch, stored locally) and lets a user have up to 2 simultaneously active machines (laptop + desktop pattern). A 3rd activation deactivates the least recently seen.

We do **not** dial home to enforce — the count is informational only. Heavy enforcement is a tax on honest users to deter a small fraction of bad actors.

## 10. Team / EDU variants (post-launch, mentioned for design completeness)

- **Team**: `seats: N`, same JWT structure, license is a "team token" the admin distributes via a small "Team Admin" web UI (Worker-backed).
- **EDU**: 50% off, requires `.edu` email or alternative manual verification. Same single-seat structure with `product_variant: "edu"` and a clause in the EULA forbidding commercial use.

Defer both to v1.1+.

## 10.1 Cloud Fast entitlement

Cloud Fast is a separate optional subscription from the perpetual Local license.

| Field | Decision |
|---|---|
| Price | $6.99/month |
| Product boundary | Sold standalone or alongside Local. It never gates Local/offline dictation. |
| User-facing mode | One mode only: `Cloud Fast`. Do not expose provider choice. |
| Primary provider | Groq `whisper-large-v3` |
| Fallback provider | ElevenLabs `Scribe v2` |
| Planning quota | 1,500 transcription minutes/month, revisited after real usage data |
| Privacy requirement | UI must say Cloud Fast uploads audio to cloud transcription providers; Local keeps audio on device. |

Cloud Fast requires server-side entitlement and metering. Do not put provider API keys in the desktop app. The desktop should send audio to a Dictivo-owned proxy; the proxy chooses Groq first, fails over to ElevenLabs when needed, enforces quotas, and returns only the transcript/error state needed by the app.

Current implementation note: the desktop uses Lemon Squeezy license activation
directly rather than the older JWT issuer sketch below. Local and Cloud Fast
activations are stored separately. Local uses `license.json` for the perpetual
license/update window; Cloud Fast uses `cloud-fast-license.json` and exchanges
that key/instance ID for a short-lived Worker session token before upload.

## 11. License-issuer Worker — directory layout

```
infra/license-issuer/
├── wrangler.toml
├── src/
│   ├── index.ts             # Webhook entry, deep-link emitter
│   ├── jwt.ts               # Signs JWTs with the private Ed25519 key
│   ├── refund.ts            # /v1/license/refresh + revocation list
│   ├── activations.ts       # machine_id allocation logic
│   └── email.ts             # Resend / Postmark
└── tests/
```

Estimated effort: 2–3 dev-days. The Worker is the *only* server-side code the launch needs.

## 12. Keys

```
keys/
├── license-pubkey.pem       # checked in, embedded via include_str!
├── license-priv.pem         # NOT checked in; stored in Cloudflare Worker secret
```

Pubkey rotation: cut a new minor that ships *both* the old and new pubkeys. After 90 days of overlap, ship the next minor with only the new pubkey. This way no honest user is locked out during rotation.

## 13. What the user sees in Settings → License

```
┌──────────────────────────────────────────────────────────┐
│ License                                                  │
│                                                          │
│ Licensed to     Alice Chen <alice@example.com>           │
│ Order           ord_01HXYZ123                            │
│ Purchased       May 14, 2026                             │
│ Updates until   May 14, 2027  ────●─────────────────     │
│                                  330 days remaining      │
│                                                          │
│ [ Renew for $24/year ]   [ Manage subscription ]         │
│                                                          │
│ ─────────────────────────────────────────────────────    │
│ Recovery                                                 │
│ [ Re-send activation email ]   [ Paste token... ]        │
│                                                          │
│ ☑ Allow online license refresh                           │
│   Once a week the app contacts our license server to     │
│   pick up renewals. No usage data is sent.               │
│                                                          │
│ ☐ Trial mode (downgrade to free tier)                   │
└──────────────────────────────────────────────────────────┘
```

## 14. Trial / freemium boundary (decision pending — see blockers doc)

Two options on the table:
- **Pure paid**, with a 7-day full-refund window via Lemon Squeezy.
- **Freemium core + Pro buy-once at $49**, where Free = unlimited dictation but only the `tiny` model.

These have different license-architecture implications: the freemium path means the app must accept "no license" as a valid state. The architecture above already supports this (no license → no update window → no updates, but the app runs).

## 15. Implementation order

1. Generate Ed25519 keypair locally. Commit pubkey, store privkey in Cloudflare secret.
2. Stand up the license-issuer Worker (mintable JWTs, no Lemon Squeezy yet).
3. Build `src/license.rs` verifier in the desktop app, with a fixture token for tests.
4. Wire Settings → License view.
5. Wire deep-link handler for `dictivo://activate?token=<jwt>`.
6. Integrate Lemon Squeezy webhook → Worker → email.
7. Integrate updater Authorization header (closes the loop with `updater-integration.md`).
