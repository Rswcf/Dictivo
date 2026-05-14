# Where Your Data Lives — Marketing-Site Page Content

> Drop this content into the marketing site repo (`034_Dictivo_Site` /
> `Rswcf/Dictivo-site`) as `where-your-data-lives.html` or wherever the
> existing structure prefers. Link to it from the home-page privacy
> trust strip and from the Privacy Policy. Target audience: HN /
> r/privacy / r/macapps skeptics doing a 10-second skim before they
> close the tab.

---

# Where Your Data Lives

Dictivo runs entirely on your Mac. This page is a complete map of every
piece of data the app touches, where it is stored, and what — if
anything — ever leaves the device.

## Files Dictivo creates on your Mac

| Path | Contents | When it appears |
|---|---|---|
| `~/Library/Application Support/Dictivo/local.sqlite3` | Your transcript history, dictionary entries, snippets. Plain SQLite — open it with any tool. | First time you dictate anything. |
| `~/Library/Application Support/Dictivo/license.json` | Your activated license key + the cached customer info Lemon Squeezy returned at activation (your email and name, the order ID). | First time you activate a paid license. |
| `~/Library/Application Support/Dictivo/private-fast/` | Whisper transcription models you have downloaded. Each is a single `.bin` file from the GGML / whisper.cpp project. | When you choose a tier in Settings → Local Engine and click Download. |
| `~/Library/Preferences/com.dictivo.desktop.plist` | macOS-managed app preferences (window position, last-used view). Standard preference plist. | Continuously, as you use the app. |
| `~/Library/HTTPStorages/com.dictivo.desktop/` | Webview state for the Tauri runtime. Currently unused by Dictivo. | Created empty by macOS. |
| `~/Library/WebKit/com.dictivo.desktop/` | WebKit cache the Tauri webview maintains. No remote sites are loaded; the cache is for the in-app UI assets only. | Continuously, as you use the app. |

You can delete any of these files at any time. Dictivo regenerates them
on next launch.

## Files Dictivo does **not** create

- No file in `~/Documents/`
- No file in `~/Library/Caches/com.dictivo.desktop/Audio/` (we never persist captured audio — the WAV is held in RAM during transcription and discarded the moment the transcript is ready)
- No iCloud-synced container

## Network requests Dictivo makes

The full list, in plain language:

### 1. Update check — once at launch, every 24 hours

```
GET https://github.com/Rswcf/Dictivo/releases/latest/download/latest.json
User-Agent: Dictivo-Updater/1.0
Authorization: Bearer <your license token, if you have one>
```

What it sends:
- The fact that a Dictivo client is asking
- Your OS + architecture (so the right installer is offered)
- Your license token, if any (so the response knows whether to surface
  builds released after your update window)

What it does **not** send:
- Audio, transcripts, settings, dictionary entries, your IP-derived
  location, an installation UUID, or any usage data
- Anything if you turn off "Automatically check for updates" in Settings → License & Updates

### 2. License activation — once, the moment you paste your key

```
POST https://api.lemonsqueezy.com/v1/licenses/activate
Body: license_key=<your-key>&instance_name=<your-machine-name>
```

Lemon Squeezy returns your name, email, order ID, and a status code.
Dictivo caches that response in `license.json` (see above) and never
contacts the activation endpoint again unless you click "Refresh"
manually in Settings.

### 3. Model download — only when you trigger it

```
GET https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-*.bin
```

The model files are public. The request carries no identifier.

### 4. Crash reporting — none

Dictivo ships without any crash reporter, analytics SDK, or telemetry
library. If the app crashes on your Mac, you are the only one who
knows.

## What Lemon Squeezy stores

When you buy Dictivo, Lemon Squeezy (the merchant of record) processes
the payment and holds your billing details. Their privacy policy
applies to that data. Dictivo receives only:

- Your name (as you provided at checkout)
- Your email (so we can send the license key)
- A Lemon Squeezy order ID
- Country (for tax records)

We retain this for the lifetime of your license plus 7 years
(tax-record retention requirement).

## Exporting everything

Settings → Local Engine → keep this app forever, even offline.

Workbench → History tab → top-right Export icon → bundles every
session into a single Markdown file in your Downloads folder. You can
also export per-session from the row-level Export icon.

## If you uninstall Dictivo

Drag the app to Trash, then optionally delete:

```sh
rm -rf ~/Library/Application\ Support/Dictivo
rm -f ~/Library/Preferences/com.dictivo.desktop.plist
rm -rf ~/Library/HTTPStorages/com.dictivo.desktop
rm -rf ~/Library/WebKit/com.dictivo.desktop
```

Dictivo has no uninstaller because we don't put anything anywhere else.

## Verifying these claims

The app is signed with our Apple Developer ID. The minisign public key
that authenticates every update is hardcoded into the binary; you can
extract it with `strings Dictivo.app/Contents/MacOS/dictivo | grep -i
RWQ`. The list of allowed network hosts is enforced by the macOS
sandbox + the Tauri CSP — you can inspect the `Info.plist`'s
`NSAppTransportSecurity` block to see exactly which domains the app is
permitted to contact.

If you find a discrepancy between this page and what Dictivo actually
does, email `hello@dictivo.app` — we will fix the docs (or the app)
within 72 hours.
