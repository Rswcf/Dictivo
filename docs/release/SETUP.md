# Dictivo Launch Setup — Operational Walkthrough

> Companion to `plan.md`. The plan tells you *what* the launch architecture is; this file tells you *exactly which buttons to click* to make it real. Copy-paste runnable.

**Total time**: ~3 hours of your active attention spread across 5 weeks of calendar time. Apple Developer enrollment is the longest external dependency.

**Recommended order**: run Phases 1, 2, 3, 4 **in parallel** starting today. Phase 1 is fully local; Phases 2 + 3 + 4 have approval waits that you spend doing the *next* phase.

---

## Phase 1 — Tauri signing keys (5 min, locally, today)

### Why
The Tauri updater verifies every downloaded build with a public key baked into the app. Without a keypair, the in-app updater rejects all updates with a signature error. The pubkey is public-facing and goes into the repo. The private key never leaves your machine + GitHub Secrets.

### Step 1.1 — Generate the keypair

```bash
mkdir -p ~/.tauri
cd /Users/mayijie/Projects/Code/033_Dictivo
npx @tauri-apps/cli signer generate -w ~/.tauri/dictivo.key
```

When prompted: **enter a strong password** (e.g. `Diceware-Style-Six-Words-Are-Great`). **Save it in 1Password / your password manager** labeled "Dictivo Tauri signing key". No recovery if lost.

This produces:
- `~/.tauri/dictivo.key` — private key, passphrase-protected
- `~/.tauri/dictivo.key.pub` — public key

### Step 1.2 — Insert the pubkey into `tauri.conf.json`

View the public key:

```bash
cat ~/.tauri/dictivo.key.pub
```

You'll see something like:
```
untrusted comment: minisign public key 1234ABCD5678EF90
RWQ1234567890abcdefghijklmnopqrstuvwxyz...
```

**Copy the second line only** (the base64 string starting with `RW`).

Open `apps/desktop/src-tauri/tauri.conf.json` and replace:
```json
"pubkey": "REPLACE_WITH_BASE64_MINISIGN_PUBLIC_KEY",
```
with:
```json
"pubkey": "RWQ1234567890abcdefghijklmnopqrstuvwxyz...",
```
(your actual pubkey).

Or just paste the pubkey here in chat and I'll do the replacement for you.

### Step 1.3 — Save the private key to GitHub Secrets

Open: `https://github.com/Rswcf/Dictivo/settings/secrets/actions`

Add two secrets:

**Secret 1: `TAURI_SIGNING_PRIVATE_KEY`**

```bash
cat ~/.tauri/dictivo.key | pbcopy
```

Click "New repository secret" → name = `TAURI_SIGNING_PRIVATE_KEY` → paste from clipboard → Add.

**Secret 2: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`**

Click "New repository secret" → name = `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → paste the passphrase you chose in step 1.1 → Add.

### Step 1.4 — Verify

```bash
cd /Users/mayijie/Projects/Code/033_Dictivo
grep pubkey apps/desktop/src-tauri/tauri.conf.json
# expected: "pubkey": "RW..." (not the placeholder anymore)

ls -la ~/.tauri/
# expected: dictivo.key + dictivo.key.pub
```

### Safety check
- [ ] Private key file (`~/.tauri/dictivo.key`) is **not** in git. Run `git status` — it should not appear.
- [ ] Passphrase is saved in your password manager.
- [ ] Public key is in `tauri.conf.json`.
- [ ] Both GitHub Secrets exist.

**Phase 1 done. Move on while waiting on Phases 2 + 3.**

---

## Phase 2 — Apple Developer Program (~1-4 weeks calendar time)

### Why
Required to code-sign + notarize macOS builds. Without it, every Mac user sees "Apple cannot check this app for malicious software" on first launch, and the in-app updater can't replace the signed `.app` bundle.

### Step 2.1 — Enroll (do this today)

1. Go to https://developer.apple.com/programs/enroll/
2. Sign in with an existing Apple ID (or create one — use the email you want associated with Dictivo going forward, not a personal one if you can avoid it)
3. Choose **Individual** enrollment ($99/year, no D-U-N-S number needed). Do NOT choose Organization — it requires more documentation and takes longer.
4. Fill in your legal name **exactly as it appears on your government-issued ID** — Apple verifies this.
5. Accept agreements, pay $99 USD with a card.
6. You'll get a confirmation email. The next email — "your enrollment is complete" — is the one that unlocks signing.

**Wait time:** typically 24-72 hours, occasionally 2-4 weeks if Apple's identity-verification queue is backed up. Don't email Apple Support unless 3+ weeks have passed.

### What to do while waiting
- Continue with Phases 1, 3, 4.
- Re-check enrollment status at https://developer.apple.com/account/ once every 2-3 days.

### Step 2.2 — After approval: create the Developer ID Application certificate

1. Open `Keychain Access` on your Mac.
2. Menu bar → Keychain Access → Certificate Assistant → **Request a Certificate From a Certificate Authority…**
3. Fill in:
   - User Email Address: your Apple Developer email
   - Common Name: your full legal name (same as enrollment)
   - CA Email Address: leave blank
   - Choose: "**Saved to disk**" + "**Let me specify key pair information**"
   - Click Continue → save the `.certSigningRequest` (CSR) file (e.g. to Desktop)
   - On the next screen, leave the defaults (RSA, 2048 bits)
4. Go to https://developer.apple.com/account/resources/certificates/list
5. Click "**+**" (Create a New Certificate)
6. Software → **Developer ID Application** → Continue
7. Upload the CSR file from step 3
8. Continue → Download the issued `.cer` file
9. Double-click the `.cer` file → it imports into Keychain Access under "My Certificates"

### Step 2.3 — Export the certificate as .p12

1. In Keychain Access, find "**Developer ID Application: [Your Name] ([Team ID])**" — usually under "login" keychain, "My Certificates" category
2. Right-click → **Export "Developer ID Application: ..."**
3. File Format: **Personal Information Exchange (.p12)**
4. Save (e.g. as `DeveloperIDApplication.p12` on Desktop)
5. When prompted for a password, **set a strong export password** (this is different from your login keychain password and from your Tauri key passphrase). Save it.

### Step 2.4 — Base64-encode the .p12

```bash
base64 -i ~/Desktop/DeveloperIDApplication.p12 | pbcopy
```

Your clipboard now holds the base64 string.

### Step 2.5 — Generate an app-specific password for notarization

1. https://appleid.apple.com/account/manage → Sign in
2. **Sign-In and Security** section → **App-Specific Passwords**
3. Click **+** → Label: `Dictivo notarization`
4. Save the generated password (looks like `abcd-efgh-ijkl-mnop`)

### Step 2.6 — Find your Team ID

1. https://developer.apple.com/account/#MembershipDetailsCard
2. Copy the 10-character **Team ID** (e.g. `A1B2C3D4E5`)

### Step 2.7 — Add 6 secrets to GitHub

`https://github.com/Rswcf/Dictivo/settings/secrets/actions`

| Secret name | Value |
|---|---|
| `APPLE_ID` | The email used for Apple Developer enrollment |
| `APPLE_PASSWORD` | The app-specific password from step 2.5 |
| `APPLE_TEAM_ID` | The 10-char Team ID from step 2.6 |
| `APPLE_CERTIFICATE` | The base64 string from step 2.4 (paste from clipboard) |
| `APPLE_CERTIFICATE_PASSWORD` | The export password you set in step 2.3 |
| `KEYCHAIN_PASSWORD` | Any random string — used for the temp keychain in CI. Just generate one with `openssl rand -base64 24 \| pbcopy` |

### Step 2.8 — Test the pipeline (optional but recommended)

```bash
git tag v1.0.0-rc.1
git push origin v1.0.0-rc.1
```

Watch `https://github.com/Rswcf/Dictivo/actions`. The `release-desktop` workflow should:
1. Build the universal macOS app
2. Sign with your Developer ID
3. Notarize via Apple's service (5-15 min)
4. Staple
5. Create a GitHub Release with the .dmg, .app.tar.gz, .app.tar.gz.sig, and latest.json

If anything fails, the workflow log will tell you which secret/step. Fix it and tag `v1.0.0-rc.2`.

**Phase 2 done.**

---

## Phase 3 — Lemon Squeezy (24-72 hours for KYC)

### Why
LS is your entire payments + license + email + tax pipeline. The desktop app's License & Updates panel already calls LS's License API. You just need to give it a real product to validate against.

### Step 3.1 — Sign up (do this today, before KYC wait)

1. https://app.lemonsqueezy.com/register
2. Sign up with the email you want associated with Dictivo
3. Confirm email
4. Complete the **Get Verified** flow:
   - Personal details: legal name, address, date of birth
   - Identity verification: photo ID + selfie (handled by their KYC provider)
   - Payout method: connect Wise / PayPal / direct bank (you can do this later but better now)
5. **Wait 24-72 hours** for KYC approval. You can keep working in test mode while waiting.

### Step 3.2 — Create the Store (after KYC)

1. Dashboard → "Create your store"
2. Store name: `Dictivo`
3. Store URL slug: `dictivo` (becomes `dictivo.lemonsqueezy.com`)
4. Country: your country of residence
5. Currency: **USD** — buyers see auto-converted local prices, but your books are kept in USD

### Step 3.3 — Create the main Product ($49 one-time)

1. Products → New product
2. **Type: Single payment** (one-time purchase) — NOT a subscription
3. Name: `Dictivo`
4. Description: paste the relevant blocks from `docs/release/_v1-reference/pricing-copy.md`
5. Price: **$49.00 USD**
6. Under "Add-ons", enable **License keys**
7. License key settings:
   - **Activation limit: 2** (matches our 2-device EULA)
   - **License length: Forever / No expiration** (we use `updates_until` client-side, not LS's expiration)
8. Variants: leave only the default
9. Image: skip for now (or use a placeholder; the icon at `apps/desktop/src-tauri/icons/icon.icns`)
10. Save

After saving, note the **product variant ID** (something like `12345`) — you'll need it later if you ever want to script license issuance.

### Step 3.4 — Create the Renewal Product ($24 one-time)

1. Products → New product
2. **Type: Single payment** (intentionally not subscription — keeps it dumb-simple)
3. Name: `Dictivo — Renew Updates for 1 Year`
4. Description: "Extend your Dictivo update window by 12 months. Your current Dictivo keeps working with or without this renewal — this just unlocks new versions and new transcription models we ship in the next year."
5. Price: **$24.00 USD**
6. **Enable License keys** with the same settings (activation_limit: 2, Forever)
7. Save

When a customer buys this renewal, LS will email them a *new* license key. They paste it into Dictivo Settings → License → Activate, and the app re-computes `updates_until = today + 365 days`. (The Rust code already handles this — re-activation overwrites the cached license.)

### Step 3.5 — Test the purchase flow end-to-end

1. Toggle store to **Test mode** (top of dashboard)
2. Click your Dictivo product → "Share" → copy the **Checkout link**
3. Open in a browser → use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC
4. Complete checkout
5. Check the email you used → a license key arrives within 30 seconds (subject line "Your Dictivo license key")
6. Open Dictivo: Settings → License & Updates → paste the key → click Activate
7. The panel should populate with your customer name, email, "Updates until" date, "365 days remaining"

If step 6 fails, copy the error message and tell me — we'll fix the activation code.

### Step 3.6 — Get your checkout URLs

After step 3.5 succeeds:

1. Main product → Share → copy the checkout URL (e.g. `https://dictivo.lemonsqueezy.com/buy/abc-def-123`)
2. Renewal product → Share → copy that checkout URL too

**Tell me both URLs in chat** and I'll wire them into `site/index.html` (Buy button + Renew button).

### Step 3.7 — Go live

When you're ready:
1. Toggle store to **Live mode**
2. The checkout URLs are the same; they now charge real cards
3. Customers receive real receipts + license keys

**Phase 3 done.**

---

## Phase 4 — Domain + Cloudflare Pages (1-2 hours, can do today)

### Why
The in-app updater fetches `https://dictivo.app/latest.json`. That URL needs to resolve. Plus buyers need a place to actually find and buy the product.

### Step 4.1 — Move DNS to Cloudflare

1. Sign up at https://dash.cloudflare.com/sign-up (free)
2. Dashboard → "Add a site" → enter `dictivo.app` → Free plan
3. Cloudflare scans your existing DNS records and shows you **two assigned nameservers**, e.g.:
   ```
   xena.ns.cloudflare.com
   daniel.ns.cloudflare.com
   ```
4. Go to your current domain registrar (wherever you registered `dictivo.app`) → find "Manage nameservers" or "DNS settings" → replace existing nameservers with Cloudflare's two
5. Save. Cloudflare emails you when the change has propagated (usually 1-6 hours, max 48)

### Step 4.2 — Deploy the marketing site

I've already created a minimal site for you at `site/` in this repo. It contains:
- `index.html` — landing + pricing
- `privacy.html` — privacy policy
- `eula.html` — end-user license agreement
- `latest.json` — placeholder for the in-app updater

To deploy:

1. Cloudflare dashboard → **Workers & Pages** → Create application → **Pages** → **Connect to Git**
2. Authorize Cloudflare to read your GitHub repo, select `Dictivo`
3. Build settings:
   - Framework preset: **None**
   - Build command: leave blank
   - Build output directory: `site`
   - Root directory: leave blank
4. Save and Deploy
5. First deploy takes ~30 seconds. You'll get a preview URL like `dictivo-xyz.pages.dev`.
6. Open the preview URL in a browser — verify it loads
7. Custom domain: in Pages project → **Custom domains** → **Set up a custom domain** → enter `dictivo.app`
8. Cloudflare auto-configures the CNAME + provisions an SSL cert (~30 seconds)
9. Repeat for `www.dictivo.app`

### Step 4.3 — Verify

```bash
curl -I https://dictivo.app
# expected: HTTP/2 200 with content-type: text/html

curl https://dictivo.app/latest.json
# expected: the placeholder JSON
```

If `latest.json` returns 404, double-check the file is in `site/latest.json` in the repo.

### Step 4.4 — Wire up the Buy button (after Phase 3)

After Phase 3 step 3.6, you'll have the LS checkout URLs. Edit `site/index.html`:

```html
<!-- Find these placeholders -->
<a href="REPLACE_WITH_LEMON_SQUEEZY_CHECKOUT_URL" class="cta cta-primary">Buy Dictivo — $49</a>
...
<a href="REPLACE_WITH_LEMON_SQUEEZY_RENEWAL_URL" class="cta">Renew for $24/year</a>
```

Replace with your actual URLs. Commit + push → Cloudflare Pages auto-redeploys within 30 seconds.

Or paste both URLs in chat — I'll do the edit.

**Phase 4 done.**

---

## Phase 5 — Going live (15 minutes)

After Phases 1-4 are all green:

1. **First real release tag:**
   ```bash
   cd /Users/mayijie/Projects/Code/033_Dictivo
   # bump version to 1.0.0
   # (edit apps/desktop/src-tauri/tauri.conf.json: "version": "1.0.0")
   # (edit apps/desktop/package.json: "version": "1.0.0")
   git add -A && git commit -m "release: 1.0.0"
   git tag v1.0.0
   git push origin main --tags
   ```

2. Watch the workflow: `https://github.com/Rswcf/Dictivo/actions`
3. When done, a GitHub Release exists with signed installers
4. Download the .dmg yourself, install it on a clean Mac, verify the in-app updater UI works (Settings → License & Updates)
5. Flip Lemon Squeezy store to **Live mode**

You're now selling Dictivo.

---

## Order of operations (the real-time playbook)

| Day | Action |
|---|---|
| Today | Phase 1 (5 min), apply to Phase 2 (10 min), apply to Phase 3 (10 min), Phase 4 nameservers (10 min) |
| Day 2-3 | Phase 3 KYC clears → set up products + test purchase (45 min). Phase 4 DNS propagates → deploy site (30 min) |
| Week 1-4 | Wait on Apple Developer approval. Iterate on marketing copy, app polish. |
| Apple approves | Phase 2 cert + secrets (1 hr). Push `v1.0.0-rc.1` tag, fix any CI issues. |
| Final week | Tag `v1.0.0`, flip LS to live, post to HN/Twitter/r/macapps. |

Realistic total: **3 weeks from today to first sale**, gated almost entirely on Apple Developer enrollment time.

---

## If something goes wrong — who to contact

| Issue | Where to get help |
|---|---|
| Apple Developer enrollment stuck | https://developer.apple.com/contact/topic/select — only after 3+ weeks |
| Notarization fails | Workflow log will print Apple's error. Most common: missing app-specific password, wrong Team ID, .p12 password wrong |
| Lemon Squeezy KYC stuck | support@lemonsqueezy.com (usually responds within 24h) |
| Cloudflare Pages build fails | Check build log; usually wrong "Build output directory" — should be `site` |
| Tauri updater signature mismatch | Pubkey in tauri.conf.json doesn't match the one used to sign. Re-extract from `~/.tauri/dictivo.key.pub` |
| License activation fails in-app | Check LS dashboard → look up the license key → "Recent activations" log will say why |
