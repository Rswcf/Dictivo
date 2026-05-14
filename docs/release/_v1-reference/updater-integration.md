# Tauri Updater Integration — Implementation Spec

> Adds `@tauri-apps/plugin-updater` to Dictivo and wires the update flow into the existing SettingsView + a non-blocking banner. Designed for the locked A-plan business model (12-month update window + perpetual fallback).

## 1. Dependencies

### Cargo.toml additions (apps/desktop/src-tauri/Cargo.toml)

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"   # provides restart() after install
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
keyring = "3"                 # holds the license JWT cross-platform
```

### Frontend additions (apps/desktop/package.json)

```jsonc
"@tauri-apps/plugin-updater": "^2",
"@tauri-apps/plugin-process": "^2"
```

## 2. tauri.conf.json delta

Append to the existing config:

```jsonc
{
  "plugins": {
    "updater": {
      "active": true,
      "dialog": false,                    // we ship our own UI (Settings + banner)
      "pubkey": "PUT_BASE64_MINISIGN_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://updates.dictivo.app/{{target}}/{{arch}}/{{current_version}}?ch=stable"
      ],
      "windows": {
        "installMode": "passive"          // progress bar, no UAC dialog
      }
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true        // emits .app.tar.gz on macOS, .nsis.zip on Windows
  }
}
```

The `{{current_version}}` path segment lets the server know whether to return an update or `204 No Content` (the user's license is past `updates_until` for this build).

## 3. Signing key generation (one-time, local, NEVER commit)

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/dictivo.key
# Outputs:
#   ~/.tauri/dictivo.key       (private, requires passphrase)
#   ~/.tauri/dictivo.key.pub   (public, paste into tauri.conf.json pubkey)
```

The private key + its passphrase get stored as GitHub Actions Encrypted Secrets:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**Both must be set as environment variables in the runner shell — `.env` files do not work for Tauri signing.**

## 4. Rust setup hook (apps/desktop/src-tauri/src/lib.rs)

Inside the existing `tauri::Builder` chain:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
.setup(|app| {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // 5-second delay so the splash / first dictation isn't blocked
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        match check_for_update_with_license(&handle).await {
            Ok(Some(update)) => {
                let _ = handle.emit("dictivo://update-available", update);
            }
            Ok(None) => { /* up to date, or window expired — quietly do nothing */ }
            Err(e) => {
                // Never surface errors as toasts. Log only.
                tracing::warn!(error = ?e, "update check failed");
            }
        }
    });
    Ok(())
})
```

`check_for_update_with_license` (new function in `src/updater.rs`):
1. Read the license JWT from the OS keyring (see `license-architecture.md`).
2. Add it as `Authorization: Bearer <jwt>` on the update endpoint request.
3. The endpoint validates the token's `updates_until` against this build's `pub_date` and either returns the manifest or `204 No Content`.

## 5. React UpdateBanner component

New file: `apps/desktop/src/components/UpdateBanner.tsx`

```tsx
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ArrowUp, X } from "lucide-react";

type UpdateInfo = {
  version: string;
  notes: string;            // 3 highlight bullets, max
  fullChangelogUrl: string;
};

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unlisten = listen<UpdateInfo>("dictivo://update-available", (e) => {
      setUpdate(e.payload);
      setDismissed(false);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <ArrowUp size={14} />
      <span>
        Dictivo {update.version} is ready.
        <a href={update.fullChangelogUrl} target="_blank" rel="noreferrer">What's new ›</a>
      </span>
      <div className="actions">
        <button onClick={() => setDismissed(true)}>Not this version</button>
        <button className="primary" onClick={() => triggerInstallOnQuit()}>
          Install on quit
        </button>
      </div>
      <button className="close" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

async function triggerInstallOnQuit() {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update?.available) return;
  await update.downloadAndInstall();
  // Tauri's installer handles the swap on app exit. We don't auto-relaunch —
  // user closes the app on their own schedule. relaunch() exposed only via
  // the "Restart now" secondary action in Settings.
}
```

Mount the banner in `App.tsx`, above the workbench.

## 6. SettingsView wiring

Add a new sub-section under "Local Engine" (or as a fourth top-level sidebar item — recommended: "Updates"). Component sketch:

```tsx
// Inside SettingsView
<section>
  <h3>Updates</h3>
  <p>{update ? `New version ${update.version} ready` : `You're on the latest version (${appVersion}).`}</p>

  <Row>
    <button onClick={checkNow}>Check for updates</button>
    {update && <button onClick={installNow}>Install now & restart</button>}
  </Row>

  <Toggle
    label="Automatically check for updates"
    description="Once when the app starts, then every 24 hours. We only fetch a version-number file and never send any identifier."
    value={autoCheckEnabled}
    onChange={setAutoCheckEnabled}
  />

  <Toggle
    label="Get pre-release builds (beta)"
    description="Receive new features before they ship to everyone. Beta builds can be less stable."
    value={betaChannelEnabled}
    onChange={setBetaChannelEnabled}
  />

  <LicenseStatusRow updatesUntil={license.updatesUntil} />
</section>
```

`LicenseStatusRow` shows one of:
- `Updates until 2027-05-14 (12 months left). [Manage license]`
- `Updates until 2027-05-14 (30 days left — Renew for $24/year). [Renew]`
- `Update window expired. You can still use Dictivo forever; renew anytime to resume receiving new versions and models. [Renew $24]`

## 7. 24-hour periodic check

Inside the setup hook, after the initial 5-second check, schedule a `tokio::time::interval(Duration::from_secs(86400))` loop that re-checks. Pause when the app is hidden / inactive to avoid hitting the endpoint from sleeping machines (use Tauri's `Visibility` events).

## 8. Privacy guarantees baked into the request

- **User-Agent**: `Dictivo-Updater/1.0` (no OS, no arch in UA — path already encodes target).
- **No query params** other than `?ch=stable|beta`.
- **No telemetry**, no install_id, no machine fingerprint. The `Authorization: Bearer` header carries only the license JWT (which the server already issued).
- **Anonymous fallback**: if no license is present yet (trial / freemium / first-launch), the endpoint accepts the request and returns the latest stable build the freemium tier is entitled to.
- **Offline behavior**: timeouts at 5 seconds, fail silent. Reschedule for next interval. Never block UI.

## 9. Forced-update mechanism (security only)

The manifest may include a `critical: true` flag and a `min_version` field. When set:

- The banner is non-dismissible (no "Not this version" button).
- The Settings toggle for auto-updates is greyed out with the explanation `Security update — auto-install required.`
- The app still does not force-quit the user mid-dictation; it installs on the next quit, or after a 24-h soft deadline shows a final modal offering "Install now / Quit and update later."

Use only for signing-key rotation or upstream CVEs.

## 10. Rollback safety

Tauri has no native rollback. We compensate by:
- Server-side: the manifest can be edited to point `latest` at an older signed build (the rollback target must still pass minisign verification with the *current* trusted pubkey, so retain old release artifacts and their signatures).
- Client-side: a `crash_loop_guard` records the version at startup; if the process panics within 30 seconds of launch twice in a row, the next launch surfaces "Dictivo crashed on launch — would you like to download the previous version? [Yes / Keep trying]" pointing at `https://updates.dictivo.app/recovery/<prev-version>`.

## 11. Tests

- `tests/updater.spec.ts` (Playwright): stub the `check()` call, assert UpdateBanner appears and "Install on quit" triggers `downloadAndInstall`.
- `tests/updater_no_license.spec.ts`: stub a 204 response, assert no banner appears and no error toast.
- Rust unit test for `check_for_update_with_license`: assert the Authorization header is set when a license is present and absent when not.

## 12. Migration order

1. Add deps + tauri.conf.json + signing key. CI fails closed if `TAURI_SIGNING_PRIVATE_KEY` is missing.
2. Implement Rust hook with a stub `check_for_update_with_license` that just calls the plugin (no license header yet).
3. Implement UpdateBanner + Settings UI.
4. Layer in license-aware behaviour once `license-architecture.md` is implemented.
5. Cut a 1.0.0-rc.1 build and exercise the full path end-to-end against a real R2-hosted manifest.

## 13. Open questions handed to the user

- Does `updates.dictivo.app` exist as a DNS record yet, and which DNS account holds `dictivo.app`?
- Public key rotation policy — accepted: keep two pubkeys live during a rotation minor, deprecate the old one in the *next* minor. Confirm.
