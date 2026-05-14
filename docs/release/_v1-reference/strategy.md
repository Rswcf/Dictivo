# Dictivo Release & Versioning Strategy

> Locked decisions: $49 one-time + 12-month update window + $24/yr renewal + perpetual fallback. Dual-track distribution (own site + Mac App Store). Tauri 2 desktop, macOS + Windows.

## 1. Version numbering (SemVer)

`MAJOR.MINOR.PATCH`

- **MAJOR** (1 → 2): paid upgrade event. Triggered by either (a) a significant new capability that demands re-marketing, or (b) ~18–24 months elapsed since previous major. Old major continues to function indefinitely.
- **MINOR** (1.x): free for anyone inside their 12-month update window. New models, new UI, new languages, new platforms.
- **PATCH** (1.x.y): always free for everyone on the same MAJOR, regardless of update-window status. Reserved for bug fixes and security.

**Launch version: `1.0.0`.** Current `0.2.0` reflects pre-launch. The bump to 1.0 ships with the first paid build.

## 2. Channels

| Channel | Audience | Source |
|---|---|---|
| `stable` | All paid users (default) | `https://updates.dictivo.app/stable/latest.json` |
| `beta` | Users who opt in in Settings | `https://updates.dictivo.app/beta/latest.json` |

No `nightly` channel. Beta is gated behind a Settings toggle, not a separate binary.

## 3. Cadence target

- **Patch** (`1.0.y`): on-demand, within 72 h of a confirmed regression or CVE
- **Minor** (`1.x.0`): one per 4–8 weeks
- **Major** (`2.0.0`): every 18–24 months

Cadence is a target, not a contract. The EULA promises *availability* of updates inside the window, not *frequency*.

## 4. The 12-month update window — mechanics

Every purchased license carries a field `updates_until` (ISO-8601 date, UTC).

- On purchase: `updates_until = purchased_at + 12 months`
- On renewal ($24): `updates_until = max(now, updates_until) + 12 months`

When the app checks the update endpoint, it includes a signed token whose `updates_until` is bound to the build's `pub_date`:

```
build pub_date <= updates_until   →  user gets the update
build pub_date >  updates_until   →  endpoint returns 204 No Content
                                      app silently stops offering updates,
                                      keeps running the currently installed version forever
```

**The user is never locked out of the app.** A lapsed license still runs every feature it was bought for. Only the auto-update path closes.

## 5. Perpetual fallback guarantee (verbatim, for EULA)

> Once you purchase Dictivo, the version you have downloaded is yours to use offline and forever, without any further payment, recurring fee, or online check. We will never remotely disable a paid Dictivo build.

This sentence is the brand promise that distinguishes Dictivo from 1Password / Adobe / Tower-style transitions. Every pricing-page question, support reply, and launch announcement should be consistent with it.

## 6. What does NOT trigger a major version

To protect the brand promise, the following are explicitly free minor updates inside the window — even though some competitors would gate them:

- New Whisper / Parakeet / equivalent model weights
- New languages
- New OS support (e.g. adding Linux later)
- New companion avatar packs
- API/SDK additions

What *does* trigger a major:

- A platform-incompatible architecture shift (e.g. moving off Tauri/whisper.cpp)
- A re-marketed "second product" that happens to share the codebase
- Renaming the product

## 7. Backwards compatibility horizon

- Settings/SQLite schema migrations must be forward-only and never require manual user action across any path from `1.0` → current.
- Models downloaded by older minors must remain usable in newer minors (model file SHA256s in the manifest are append-only).
- Hotkey assignments and dictionary entries survive every minor.

## 8. Deprecation policy

Removing a feature inside the same MAJOR requires:
1. One full minor cycle with the feature marked deprecated in release notes + Settings.
2. One in-app notice the first time the user touches the deprecated surface.
3. Removal no earlier than the *next* minor.

## 9. Hotfix authority

A patch release can be cut and shipped without a full release review when **all** of:
- The change is < 50 LOC across ≤ 3 files, OR is a dependency version bump for a published CVE.
- Full automated test matrix passes.
- The change does not touch the updater, license, or signing path.

Anything else goes through the standard release runbook (see `docs/release/runbook.md`, TBD).

## 10. Free upgrade events (good-faith gestures)

We will, at our discretion, *extend* `updates_until` for free in narrow cases:
- The current minor breaks a major workflow and the fix is in a later minor.
- A user purchased within 30 days of a major release and their `updates_until` would fall just short of getting it.

These are case-by-case, never advertised.
