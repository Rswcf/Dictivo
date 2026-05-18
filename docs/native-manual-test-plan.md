# Dictivo Native Manual Test Plan

Date: 2026-05-18

Purpose: close the validation gap that cannot be proven by browser-preview E2E, Vitest, Rust unit tests, or command-line whisper.cpp smoke alone. Run this plan on packaged desktop builds before a public release.

Windows parity has a dedicated checklist in [`docs/windows-parity-test-plan.md`](windows-parity-test-plan.md). Run it before treating a Windows validation artifact as feature-aligned with macOS.

## Entry Criteria

- Install the latest packaged app: the macOS release candidate or the Windows validation artifact from the latest `build-desktop.yml` run.
- Confirm only one app bundle is visible in common install locations.
- Confirm app version is the intended release version.
- Run automated gates first:

```bash
npm run build
npm run typecheck
npm run lint
npm run test
npm run e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test global_hotkey_probe -- --ignored --nocapture
npm run smoke:private-fast
npm audit --audit-level=moderate
git diff --check
```

## Test Data

- Spoken English phrase: `Dictivo native microphone test. The quick brown fox jumps over the lazy dog.`
- Spoken CJK phrase: `你好，这是本地听写测试。`
- Dictionary terms: `Supabase`, `kubectl`, `张伟`
- Snippet trigger/content: `calendar link` -> `https://example.test/calendar?source=dictivo`
- External target apps: TextEdit, Notes, Safari or Chrome.

## Native Test Cases

| ID | Area | Steps | Expected Result |
| --- | --- | --- | --- |
| NATIVE-001 | Package uniqueness | Scan `/Applications`, `~/Applications`, Desktop, Downloads, and Spotlight for `Dictivo*.app`. Open app, then quit. | Only the latest app is present. Version matches release. Launch and quit work without orphan processes. |
| NATIVE-002 | First-launch permissions | Reset or use a clean macOS user profile. Launch Dictivo and open Settings -> Privacy. Use each `Open settings` action. | Permission cards show truthful status. macOS opens the correct Privacy & Security pane for Microphone / Accessibility / Automation. No dead-end copy. |
| NATIVE-003 | Microphone happy path | Install/select a local model. Start dictation from the main mic button. Speak the English test phrase for 5-10 seconds. Stop. | App records, transcribes locally, preserves final text in the editor, updates word count/status, saves history, and copies/pastes according to settings. |
| NATIVE-004 | Microphone denial | Deny microphone permission in the OS, then try to start dictation. | User sees an actionable error. Companion enters blocked/error state. No empty or corrupted history item is saved. |
| NATIVE-005 | Language behavior | Keep the default Auto language setting. Speak the CJK test phrase. Repeat with German/Spanish if available. | Input is auto-detected, output stays in the spoken language, CJK counts show characters, and saved/API metadata language remains within `en`, `zh`, `es`, `ja`, `fr`, `de`, `vi`. |
| NATIVE-006 | Dictionary/snippets in real dictation | Add the dictionary terms and snippet. Dictate a phrase containing `kubectl`, `Supabase`, and `calendar link`. | Final transcript keeps dictionary capitalization/terms and expands the snippet only in the polished text path. |
| NATIVE-007 | Clipboard race | Put known text on clipboard. Start dictation. Before stopping, change clipboard in another app. Stop dictation. | Dictivo does not overwrite changed clipboard blindly. Transcript remains visible and history is saved. Status explains copy/paste fallback. |
| NATIVE-008 | Toggle hotkey cross-app | Focus TextEdit or Notes. Press the dictation hotkey once to start, speak, press again to stop. Repeat after changing the hotkey in Settings. | Exactly one start and one stop are registered. No duplicate recordings or stale old shortcuts remain. Target app receives pasted final text only after stop. |
| NATIVE-009 | Hold hotkey cross-app | In Settings -> Hotkeys, switch dictation activation to hold. Focus TextEdit. Hold dictation hotkey while speaking, release to stop. | Recording starts on press and stops on release. Repeated keydown events do not start multiple sessions. |
| NATIVE-010 | Paste-last hotkey | Create one successful dictation. Focus TextEdit/Notes and press Paste Last. Repeat after changing hotkey in Settings. | Latest final transcript is pasted once. UI hotkey chips update immediately after settings changes. |
| NATIVE-011 | Floating companion | Enable Companion. Click the sidebar mascot. Start/stop a dictation. Use companion hide action. | Native companion window is transparent, borderless, always on top, positioned inside visible work area, updates phases, and hide state syncs back to main UI. |
| NATIVE-012 | Tray behavior | Close the main window, use tray menu to show main, hide companion, then quit. | Close hides windows without killing app. Tray show/hide works. Quit exits without lingering Dictivo processes. |
| NATIVE-013 | Model operations | In Settings -> Engine, refresh, select installed Fast/Medium/Quality tiers, import a copy of a model, delete only a disposable test model, and retry failed paths. | Operation lock prevents double-click races. Status messages are clear. Selected tier/model stays consistent after success or rollback after failure. |
| NATIVE-014 | Low disk model preflight | On a constrained test volume or with a mocked small volume, attempt to download/import a model larger than available space. | Download/import fails before transfer with model name, required space, available space, and target directory. |
| NATIVE-015 | Accessibility keyboard pass | Tab through main nav, dictation controls, history item actions, dictionary/snippet forms, settings tabs, and inline confirmations. | Visible focus ring, named icon buttons, no keyboard trap, destructive actions reachable but protected by confirmations/disabled states. |
| NATIVE-016 | Windows install smoke | On Windows 11, install the NSIS `.exe` current-user installer, launch, run setup, select a model, and quit from tray. On a managed/enterprise test profile, also verify the MSI path if available. | The `.exe` installs without requiring admin when policy allows per-user apps. MSI installs cleanly for managed deployment. Model paths resolve under the expected app data directory. Tray and close behavior match macOS where applicable. |
| NATIVE-017 | Windows hotkey/paste | On Windows, run toggle, hold, and Paste Last tests from Notepad. | Global shortcuts register once, SendKeys paste succeeds, and no console window flashes during whisper/model operations. |
| NATIVE-018 | Privacy/network spot check | Run a dictation while monitoring network activity. Optionally block network after model install. | Audio, transcripts, snippets, dictionary, and history stay local. Metadata API, if enabled, never receives content fields. Offline dictation still works with installed model. |
| NATIVE-019 | Windows feature parity pass | On Windows, compare the app against the macOS release candidate across Workbench, Local / Cloud Fast switching, Settings -> Engine, Hotkeys, Companion, Privacy, License & Updates, History, Dictionary, and Snippets. | The same product features are present. Differences are limited to OS-specific permissions, shortcuts, installer format, and signing state. Any missing feature is a bug unless it is explicitly documented as a platform limitation. |

## Exit Criteria

- All macOS cases pass on the release candidate build, or each failure has a linked bug with severity and reproduction steps.
- Windows install, hotkey/paste, and feature-parity cases pass before advertising Windows as release-ready. Public release can wait for signing and QA, but the Windows validation build must not intentionally lag the macOS feature set.
- Any failed privacy, data-loss, microphone, or cross-app hotkey case is release-blocking.
- Non-blocking UX findings are added to `docs/dictivo-topdown-review-report.md` with priority and rationale.

## Execution Log Template

| ID | Platform | Build | Tester | Result | Notes / Bug Link |
| --- | --- | --- | --- | --- | --- |
| NATIVE-001 | macOS | 0.3.4 | Codex | Pass | 2026-05-18: `/Applications/Dictivo.app` installed from the current Tauri build, `CFBundleShortVersionString` and `CFBundleVersion` both read `0.3.4`, codesign verification passed, and the app launched from `/Applications/Dictivo.app/Contents/MacOS/dictivo`. |
| NATIVE-005 | macOS | 0.3.4 | Codex | Partial automated | App/shared tests now cover Auto language default, CJK character counts, Cloud Fast `language: auto`, detected language persisted in history, and old Cloud Fast services rejecting Auto with an actionable error. Real spoken CJK/German/Spanish audio still needs manual execution. |
| Layout regression | macOS | 0.3.4 | Codex | Automated | `componentsStatic.test.tsx` locks stable Local/Cloud Fast workbench layout slots so switching modes cannot remove the local tier slot and shift the mic vertically. |
| Windows installer/version smoke | Windows | 0.3.5 | GitHub Actions | Automated | 2026-05-18: `Build desktop apps` run `26040535241`, Windows job `76550586807`, installed `Dictivo.exe` reported `ProductVersion 0.3.5` and stayed running during launch smoke. This is not a replacement for `WIN-PARITY-001..020`. |

Older 0.2.x and 0.3.4 execution notes are historical dogfood evidence and should not be treated as current release proof. Re-run this table on each release candidate.
