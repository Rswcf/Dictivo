# Pre-Launch Manual Checklist

Things that can't be (fully) automated and need a real human running real Dictivo on a real Mac before tagging `v1.0.0`. Take this list step by step on the day-of.

## 1. End-to-end install + activation + first dictation

- [ ] Download the latest signed DMG from GitHub Releases
- [ ] Drag to /Applications, open with Cmd+double-click (not from Downloads)
- [ ] Gatekeeper accepts without "unidentified developer" warning
- [ ] Onboarding wizard appears, mic permission prompt fires, hardware detection completes in <30s
- [ ] First dictation: hold the configured hotkey, speak one sentence, release — text pastes into a new TextEdit document
- [ ] Settings → License & Updates → paste a real test license key → Activate → panel populates with the right name + email + "updates until" date
- [ ] Quit, reopen → license persists, no re-activation required

## 2. The deep-link path

- [ ] Run `open "dictivo://activate?key=ABCD-1234-EFGH"` from Terminal while Dictivo is closed → it cold-starts, navigates to Settings → License, pre-fills the key, shows "Activation link received" banner
- [ ] Same command while Dictivo is open and on Dictation view → app switches to Settings → License with the prefill
- [ ] Same command twice in 5 seconds → only the first activates (rate limiter triggers)

## 3. Update flow

- [ ] Manually edit a local `latest.json` to advertise a newer version
- [ ] In Settings → License & Updates → "Check for updates" → banner appears
- [ ] Click "Install on Quit" → quit app → reopen → new version installs cleanly
- [ ] Verify the new bundle is the one downloaded (e.g. matching commit SHA in About panel)
- [ ] Manually edit `latest.json` to advertise a build with `pub_date` past your `updates_until` → banner says window expired, install button absent

## 4. Accessibility (deep VoiceOver pass — deferred per user decision)

Items below were not auto-fixed; do them by hand before v1.0:

- [ ] Cmd+F5 turns on VoiceOver. Walk the entire app top-to-bottom.
  - [ ] Tab order reads every interactive element exactly once
  - [ ] No element is announced as just "button" with no label
  - [ ] Settings sidebar items announce their section name
  - [ ] License key input field announces "License key, text field"
  - [ ] UpdateBanner — when present — is announced as a status region
- [ ] Use https://www.tpgi.com/color-contrast-checker/ or `axe DevTools` on the live app:
  - [ ] `--ink-2` on `--surface-2` meets WCAG AA (4.5:1 for body, 3:1 for large text)
  - [ ] `--accent-text` on `--accent-soft` meets the same
  - [ ] `--muted` text — used heavily for secondary info — meets AA on every surface it appears on
- [ ] ESC key dismisses every modal-style confirmation (license deactivate, history clear, model download warning)
- [ ] Keyboard-only: complete a dictation session start-to-paste without touching the mouse
- [ ] `prefers-reduced-motion` — set the OS toggle, verify the companion window's recording pulse animation switches to a static state

## 5. Privacy claims sanity-check on the binary

- [ ] `strings Dictivo.app/Contents/MacOS/dictivo | grep -iE "sentry|crashlytics|posthog|amplitude|mixpanel|segment|google-analytics|datadog"` returns **nothing**
- [ ] `nm Dictivo.app/Contents/MacOS/dictivo | grep -i sentry` returns nothing
- [ ] `Dictivo.app/Contents/Info.plist` has no unexpected `NSAppTransportSecurity` exception domains
- [ ] In Local mode, `lsof -p $(pgrep dictivo) -i TCP` should show **zero** outbound dictation connections until the user clicks "Check for updates", activates a license, downloads a model, or explicitly uses Cloud Fast
- [ ] Cloud Fast mode clearly shows the privacy copy: `Local keeps audio on this device. Cloud Fast uploads audio to cloud transcription providers for faster results.`

If any of these surface a third-party tracker the codebase forgot to remove, **block the release** until cleaned.

## 6. Bundle size + cold-start budget

- [ ] Signed DMG ≤ 110 MB (today's target). Document if it grows.
- [ ] Cold start to "ready for hotkey" ≤ 4 seconds on an M1 with the `tiny` model bundled. Measure with `time open -a Dictivo.app` + a wall-clock observation.

## 7. SQLite forward-compat

- [ ] Open an older `local.sqlite3` from a previous internal build → open the current release candidate → app opens cleanly, no migration errors logged, all sessions visible
- [ ] Add a session in the current release candidate → open the same DB in the previous internal build kept for downgrade testing → app at least opens, even if new columns are unread. See `docs/release/sqlite-migration-plan.md` for the migration policy.

## 8. The avatars

- [ ] Settings → Companion → cycle through Dog / Cat / Iris / Marcus / Custom → no rendering errors, no missing-image placeholder
- [ ] Existing internal user with `companionAvatar: "bikini"` saved → after upgrade, settings show "Iris" selected (migration verified)
- [ ] Same for "muscle" → "Marcus"
- [ ] "trump" → falls back to "Dog" (no migration; intentional removal)

## 9. The "BETA" chip

- [ ] Confirm the topbar `BETA` chip has been turned off (or changed to "v1.0") in the v1.0.0 build. Currently controlled by literal `<span className="beta-chip">BETA</span>` in `App.tsx` — likely needs to become conditional or be removed at tag time.

## 10. Smoke the four canned support scenarios

- [ ] Activate a license, then `rm -f ~/Library/Application\ Support/Dictivo/license.json` → app behaves as if unactivated; re-pasting same key re-activates
- [ ] Activate Cloud Fast, then `rm -f ~/Library/Application\ Support/Dictivo/cloud-fast-license.json` → Local license remains active, Cloud Fast returns to the locked state, and re-pasting the Cloud Fast key re-activates only Cloud Fast
- [ ] Network off → manual "Check for updates" surfaces a friendly "Couldn't reach update server" toast, **not** an error stack
- [ ] LS API down (mock by editing `/etc/hosts` to point `api.lemonsqueezy.com` at `127.0.0.1`) → activation fails with the friendly network error from `license.rs::friendly_network_error`, **not** a raw reqwest message
- [ ] Two-device test: activate on Mac A, attempt activation on Mac B → succeeds (2-seat limit). Attempt activation on a third Mac → LS returns activation_limit, the friendly error renders, suggests removing from a device first

## How to use this checklist

The minimum bar for tagging `v1.0.0` is: every item in sections 1, 2, 3, 5, 6, 8, 9, 10 passes. Section 4 (a11y) and 7 (sqlite migration probing) are highly recommended but not blocking — defer them only if they would push the launch past the Apple Developer approval window.

Each unchecked failure goes into a fresh patch release (`v0.x.y`) and re-runs the affected sections. When the patch chain is green twice in a row, tag the actual `v1.0.0`.
