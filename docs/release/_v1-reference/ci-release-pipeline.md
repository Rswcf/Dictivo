# Release CI Pipeline — Signing, Notarization, Publish

> Extends the existing `.github/workflows/build-desktop.yml` with a tag-triggered release job that produces signed, notarized installers and publishes the updater manifest. Target signing stack is the cheapest production-grade option for 2026.

## 1. Tag-driven release flow

```
git tag v1.0.0  &&  git push --tags
        │
        ▼
┌────────────────────────────────────────────────────┐
│ release-desktop.yml (NEW)                          │
│                                                    │
│  ┌──────────────┐   ┌────────────────────────┐    │
│  │ macOS build  │   │ Windows build           │    │
│  │ • bundle     │   │ • bundle                │    │
│  │ • codesign   │   │ • Azure Trusted Signing │    │
│  │ • notarize   │   │ • verify                │    │
│  │ • staple     │   │                         │    │
│  │ • tar.gz     │   │ • nsis.zip              │    │
│  │ • minisign   │   │ • minisign              │    │
│  └──────────────┘   └────────────────────────┘    │
│         │                       │                  │
│         └──────────┬────────────┘                  │
│                    ▼                               │
│     ┌──────────────────────────────┐               │
│     │ assemble-manifest job        │               │
│     │ • build latest.json          │               │
│     │ • upload artifacts to R2     │               │
│     │ • update CF Worker KV index  │               │
│     │ • create GitHub Release      │               │
│     └──────────────────────────────┘               │
└────────────────────────────────────────────────────┘
```

The existing `build-desktop.yml` continues to run on every `main` push for CI validation. Releases are an explicit `vX.Y.Z` tag operation.

## 2. Required GitHub Actions secrets

| Secret | Purpose | Source |
|---|---|---|
| `APPLE_ID` | Notarization auth | Apple Dev account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | Notarization auth | appleid.apple.com → Sign-in & Security |
| `APPLE_TEAM_ID` | Notarization auth | 10-char Team ID |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` of Developer ID Application cert | Keychain export |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` passphrase | Set during export |
| `KEYCHAIN_PASSWORD` | Random temp keychain password | Generate fresh |
| `AZURE_TENANT_ID` | Azure Trusted Signing | Azure portal |
| `AZURE_CLIENT_ID` | Azure Trusted Signing | App registration |
| `AZURE_CLIENT_SECRET` | Azure Trusted Signing | App registration |
| `AZURE_TS_ACCOUNT_NAME` | Trusted Signing account | Azure portal |
| `AZURE_TS_CERT_PROFILE` | Cert profile name | Azure portal |
| `TAURI_SIGNING_PRIVATE_KEY` | Updater signature | `tauri signer generate` output |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Private key passphrase | Set on key generation |
| `R2_ACCOUNT_ID` | Cloudflare R2 publish | CF dashboard |
| `R2_ACCESS_KEY_ID` | R2 API token | CF dashboard |
| `R2_SECRET_ACCESS_KEY` | R2 API token | CF dashboard |
| `R2_BUCKET` | Bucket name | e.g. `dictivo-releases` |

## 3. New workflow file: `.github/workflows/release-desktop.yml`

```yaml
name: Release desktop

on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: write   # needed to create the GitHub Release

jobs:
  macos:
    name: macOS universal (signed + notarized)
    runs-on: macos-latest
    timeout-minutes: 60
    env:
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
      APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: npm }
      - name: Install Rust universal targets
        run: |
          rustup update stable
          rustup target add x86_64-apple-darwin aarch64-apple-darwin
      - run: npm ci

      # tauri-action handles certificate import + notarization + stapling automatically
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: apps/desktop
          tauriScript: npm run tauri:build -w @dictivo/desktop --
          args: --target universal-apple-darwin --bundles app
          # tauri-action picks up APPLE_* env vars and runs notarytool

      - name: Upload signed macOS artifact
        uses: actions/upload-artifact@v7
        with:
          name: dictivo-macos
          path: |
            apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Dictivo.app.tar.gz
            apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Dictivo.app.tar.gz.sig

  windows:
    name: Windows x64 (Azure Trusted Signing)
    runs-on: windows-latest
    timeout-minutes: 60
    env:
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: npm }
      - run: |
          rustup update stable
          rustup target add x86_64-pc-windows-msvc
      - run: npm ci

      - name: Build unsigned Tauri bundle
        run: npm run tauri:build -w @dictivo/desktop -- --target x86_64-pc-windows-msvc --bundles nsis

      # Azure Trusted Signing — no HSM, no USB token, ~$10/mo
      - name: Sign NSIS installer with Azure Trusted Signing
        uses: azure/trusted-signing-action@v0
        with:
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-client-secret: ${{ secrets.AZURE_CLIENT_SECRET }}
          endpoint: https://eus.codesigning.azure.net/
          trusted-signing-account-name: ${{ secrets.AZURE_TS_ACCOUNT_NAME }}
          certificate-profile-name: ${{ secrets.AZURE_TS_CERT_PROFILE }}
          files-folder: apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis
          files-folder-filter: exe
          file-digest: SHA256
          timestamp-rfc3161: http://timestamp.acs.microsoft.com
          timestamp-digest: SHA256

      - name: Re-sign updater archive with minisign
        run: npm run tauri:build -w @dictivo/desktop -- --target x86_64-pc-windows-msvc --bundles nsis --no-bundle

      - name: Upload signed Windows artifact
        uses: actions/upload-artifact@v7
        with:
          name: dictivo-windows
          path: |
            apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Dictivo_*_x64-setup.exe
            apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Dictivo_*_x64-setup.nsis.zip
            apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Dictivo_*_x64-setup.nsis.zip.sig

  publish:
    name: Publish manifest + GitHub Release
    needs: [macos, windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/download-artifact@v5

      - name: Build latest.json
        run: node scripts/build-update-manifest.mjs --tag ${{ github.ref_name }} --out latest.json

      - name: Upload installers and manifest to R2
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: |
            r2 object put ${{ secrets.R2_BUCKET }}/stable/${{ github.ref_name }}/Dictivo.app.tar.gz --file dictivo-macos/Dictivo.app.tar.gz
            r2 object put ${{ secrets.R2_BUCKET }}/stable/${{ github.ref_name }}/Dictivo.app.tar.gz.sig --file dictivo-macos/Dictivo.app.tar.gz.sig
            r2 object put ${{ secrets.R2_BUCKET }}/stable/${{ github.ref_name }}/Dictivo_x64-setup.nsis.zip --file dictivo-windows/Dictivo_*_x64-setup.nsis.zip
            r2 object put ${{ secrets.R2_BUCKET }}/stable/${{ github.ref_name }}/Dictivo_x64-setup.nsis.zip.sig --file dictivo-windows/Dictivo_*_x64-setup.nsis.zip.sig
            r2 object put ${{ secrets.R2_BUCKET }}/stable/latest.json --file latest.json --content-type application/json

      - name: Create GitHub Release with installers attached
        uses: softprops/action-gh-release@v2
        with:
          name: Dictivo ${{ github.ref_name }}
          generate_release_notes: true
          files: |
            dictivo-macos/Dictivo.app.tar.gz
            dictivo-windows/Dictivo_*_x64-setup.exe
```

## 4. `scripts/build-update-manifest.mjs` (new)

```javascript
#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { argv } from "node:process";

const tag = argv[argv.indexOf("--tag") + 1].replace(/^v/, "");
const outPath = argv[argv.indexOf("--out") + 1];

const macSig = await readFile(`dictivo-macos/Dictivo.app.tar.gz.sig`, "utf8");
const winSigFile = readdirSync("dictivo-windows").find((f) => f.endsWith(".nsis.zip.sig"));
const winSig = await readFile(`dictivo-windows/${winSigFile}`, "utf8");

const base = `https://releases.dictivo.app/stable/v${tag}`;

const manifest = {
  version: tag,
  pub_date: new Date().toISOString(),
  notes: "See https://dictivo.app/changelog#" + tag,
  platforms: {
    "darwin-aarch64": { signature: macSig.trim(), url: `${base}/Dictivo.app.tar.gz` },
    "darwin-x86_64":  { signature: macSig.trim(), url: `${base}/Dictivo.app.tar.gz` },
    "windows-x86_64": { signature: winSig.trim(), url: `${base}/Dictivo_x64-setup.nsis.zip` }
  }
};

await writeFile(outPath, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${outPath} for ${tag}`);
```

## 5. Cloudflare Worker for license-aware routing

The R2 bucket holds the raw `latest.json`. The Worker at `updates.dictivo.app` wraps it:

```javascript
// updates-worker.js
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) return new Response("Not found", { status: 404 });
    const [, target, arch, currentVersion] = match;
    const channel = url.searchParams.get("ch") === "beta" ? "beta" : "stable";

    // Fetch the canonical manifest from R2
    const manifestObj = await env.RELEASES.get(`${channel}/latest.json`);
    if (!manifestObj) return new Response("Not found", { status: 404 });
    const manifest = await manifestObj.json();

    // Check the user's license, if any
    const authz = req.headers.get("authorization");
    let updatesUntil = null;
    if (authz?.startsWith("Bearer ")) {
      const claims = await verifyLicenseJwt(authz.slice(7), env.LICENSE_PUBKEY);
      if (claims) updatesUntil = new Date(claims.updates_until);
    }
    const pubDate = new Date(manifest.pub_date);

    // Window expired or no license: don't offer
    if (!updatesUntil || pubDate > updatesUntil) {
      return new Response(null, { status: 204 });
    }

    // Same version or older: nothing to update
    if (compareSemver(manifest.version, currentVersion) <= 0) {
      return new Response(null, { status: 204 });
    }

    // Staged rollout (optional): hash the auth token sub claim
    if (manifest.rollout_percent && manifest.rollout_percent < 100) {
      const bucket = await hashToBucket(authz);
      if (bucket >= manifest.rollout_percent) {
        return new Response(null, { status: 204 });
      }
    }

    return new Response(JSON.stringify(manifest), {
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }
};
```

The Worker is the **only** dynamic component in the release infra. R2 is purely static. Total moving parts: 1 Worker, 1 R2 bucket, 1 GitHub Action workflow.

## 6. Cost estimate (2026)

| Item | Annual |
|---|---|
| Apple Developer Program | $99 |
| Azure Trusted Signing (~$10/mo) | $120 |
| Cloudflare R2 storage (10 GB) | ~$2 |
| Cloudflare Worker (well under free tier) | $0 |
| Cloudflare egress | $0 |
| Microsoft Store dev account (optional) | $19 one-time |
| **Total recurring** | **~$221/yr** |

Breakeven: ~5 license sales per year.

## 7. Pre-launch dry run checklist

- [ ] Generate Tauri signing keypair locally; never check the private key into git.
- [ ] Apple Developer ID Application cert imported + exported as `.p12`.
- [ ] Apple app-specific password created.
- [ ] Azure Trusted Signing account + cert profile provisioned.
- [ ] Cloudflare account + R2 bucket created.
- [ ] `dictivo.app` DNS — `updates.dictivo.app` and `releases.dictivo.app` CNAMEs pointed at the Worker and R2 custom domain respectively.
- [ ] All 12 secrets configured in GitHub repo settings.
- [ ] Push a `v1.0.0-rc.1` tag to a *private* fork or branch and verify end-to-end: installer downloads, double-clicks open without Gatekeeper warning, Windows installer doesn't trigger SmartScreen, app launches, updater succeeds against a manually-edited manifest.

Until that dry run is green, no public marketing.
