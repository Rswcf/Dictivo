# Dictivo Native Manual Test Plan

Date: 2026-05-13

Purpose: close the validation gap that cannot be proven by browser-preview E2E, Vitest, Rust unit tests, or command-line whisper.cpp smoke alone. Run this plan on packaged desktop builds before a public release.

## Entry Criteria

- Install the latest packaged app.
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
| NATIVE-005 | Language behavior | Switch language to Chinese. Speak the CJK test phrase. Repeat with German/Spanish if available. | Language chip value is honored, transcript language is plausible, and API metadata language remains within `en`, `zh`, `es`, `ja`, `fr`, `de`, `vi`. |
| NATIVE-006 | Dictionary/snippets in real dictation | Add the dictionary terms and snippet. Dictate a phrase containing `kubectl`, `Supabase`, and `calendar link`. | Final transcript keeps dictionary capitalization/terms and expands the snippet only in the polished text path. |
| NATIVE-007 | Clipboard race | Put known text on clipboard. Start dictation. Before stopping, change clipboard in another app. Stop dictation. | Dictivo does not overwrite changed clipboard blindly. Transcript remains visible and history is saved. Status explains copy/paste fallback. |
| NATIVE-008 | Toggle hotkey cross-app | Focus TextEdit or Notes. Press the dictation hotkey once to start, speak, press again to stop. Repeat after changing the hotkey in Settings. | Exactly one start and one stop are registered. No duplicate recordings or stale old shortcuts remain. Target app receives pasted final text only after stop. |
| NATIVE-009 | Hold hotkey cross-app | In Settings -> Hotkeys, switch dictation activation to hold. Focus TextEdit. Hold dictation hotkey while speaking, release to stop. | Recording starts on press and stops on release. Repeated keydown events do not start multiple sessions. |
| NATIVE-010 | Paste-last hotkey | Create one successful dictation. Focus TextEdit/Notes and press Paste Last. Repeat after changing hotkey in Settings. | Latest final transcript is pasted once. UI hotkey chips update immediately after settings changes. |
| NATIVE-011 | Floating companion | Enable Companion. Click the sidebar mascot. Start/stop a dictation. Use companion hide action. | Native companion window is transparent, borderless, always on top, positioned inside visible work area, updates phases, and hide state syncs back to main UI. |
| NATIVE-012 | Tray behavior | Close the main window, use tray menu to show main, hide companion, then quit. | Close hides windows without killing app. Tray show/hide works. Quit exits without lingering Dictivo processes. |
| NATIVE-013 | Model operations | In Settings -> Local Engine, refresh, select installed Fast/Medium/Quality tiers, import a copy of a model, delete only a disposable test model, and retry failed paths. | Operation lock prevents double-click races. Status messages are clear. Selected tier/model stays consistent after success or rollback after failure. |
| NATIVE-014 | Low disk model preflight | On a constrained test volume or with a mocked small volume, attempt to download/import a model larger than available space. | Download/import fails before transfer with model name, required space, available space, and target directory. |
| NATIVE-015 | Accessibility keyboard pass | Tab through main nav, dictation controls, history item actions, dictionary/snippet forms, settings tabs, and inline confirmations. | Visible focus ring, named icon buttons, no keyboard trap, destructive actions reachable but protected by confirmations/disabled states. |
| NATIVE-016 | Windows install smoke | On Windows 11, install the NSIS `.exe` current-user installer, launch, run setup, select a model, and quit from tray. On a managed/enterprise test profile, also verify the MSI path if available. | The `.exe` installs without requiring admin when policy allows per-user apps. MSI installs cleanly for managed deployment. Model paths resolve under the expected app data directory. Tray and close behavior match macOS where applicable. |
| NATIVE-017 | Windows hotkey/paste | On Windows, run toggle, hold, and Paste Last tests from Notepad. | Global shortcuts register once, SendKeys paste succeeds, and no console window flashes during whisper/model operations. |
| NATIVE-018 | Privacy/network spot check | Run a dictation while monitoring network activity. Optionally block network after model install. | Audio, transcripts, snippets, dictionary, and history stay local. Metadata API, if enabled, never receives content fields. Offline dictation still works with installed model. |

## Exit Criteria

- All macOS cases pass on the release candidate build, or each failure has a linked bug with severity and reproduction steps.
- Windows cases pass before advertising Windows as release-ready.
- Any failed privacy, data-loss, microphone, or cross-app hotkey case is release-blocking.
- Non-blocking UX findings are added to `docs/dictivo-topdown-review-report.md` with priority and rationale.

## Execution Log Template

| ID | Platform | Build | Tester | Result | Notes / Bug Link |
| --- | --- | --- | --- | --- | --- |
| NATIVE-001 | macOS | 0.2.0 | Codex | Pass | 2026-05-13: scanned `/Applications`, `~/Applications`, Desktop, Downloads, Trash, and `/Volumes`; only `/Applications/Dictivo.app` found as an installed app. Removed old bundle-id runtime leftovers at `~/Library/Caches/dictivo` and `~/Library/WebKit/dictivo`; current `com.dictivo.desktop` data and model storage remain. Tauri target bundles are build artifacts only. Version `0.2.0`. Launch and quit smoke passed with no lingering Dictivo or whisper-cli process. Release workflow tests now also lock the macOS universal build target, app bundle type, artifact name, and bundle path. |
| NATIVE-002 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: installed-app smoke verifies `CFBundleShortVersionString`/`CFBundleVersion` and macOS `NSMicrophoneUsageDescription` / `NSAppleEventsUsageDescription`; Rust tests cover Microphone / Accessibility / Automation settings command targets for macOS, Windows, and Linux, and App tests cover Privacy bridge/status refresh plus user-visible failure when the settings pane cannot open. Clean-profile OS permission dialogs and real System Settings panes still need manual execution. |
| NATIVE-003 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: `npm run smoke:private-fast` passed against the installed app's bundled `whisper-cli`, local `ggml-small.bin`, and packaged benchmark WAV; release workflow tests cover the smoke script's transcript, plist metadata, output-error, and model-scan assertions without launching real whisper. App tests also cover start-then-immediate-stop while microphone setup is still pending, proving the controller is stopped after setup instead of dangling. Real microphone capture and UI dictation still need manual execution. |
| NATIVE-004 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: media capture tests cover permission denial before controller creation; App test covers start failure showing the microphone error, restoring the pre-recording editor text, and not calling local transcription or history save. Real OS denial toggle still needs manual execution. |
| NATIVE-005 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: App tests cover Chinese language selection, CJK character counts, language passed to local dictation, and language persisted in history metadata; API/shared tests cover supported metadata languages including Vietnamese. Real spoken CJK/German/Spanish audio still needs manual execution. |
| NATIVE-006 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: local dictation tests cover dictionary capitalization and snippet expansion; App tests cover selected-language dictionary/snippet filtering before dictation; desktop bridge tests verify only dictionary terms and snippet triggers are sent to whisper prompt terms. Real microphone phrase recognition still needs manual execution. |
| NATIVE-007 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: App test covers clipboard marker capture before transcription and `clipboard-changed-copied` paste result after stop; transcript remains visible, history save still runs, and status explains auto paste was skipped. Real cross-app clipboard race still needs manual execution. |
| NATIVE-008 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: native `global_hotkey_probe` passed locally for default shortcut reservation; release workflow keeps this interactive probe as a manual `workflow_dispatch` opt-in instead of blocking push/tag CI. App tests now also cover late native `register()` completion after cleanup, so stale shortcut registrations are unregistered again if the window unmounts or hotkey settings change during registration. Cross-app start/stop behavior in TextEdit/Notes still needs manual execution. |
| NATIVE-009 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: hotkey helper tests cover hold-mode press -> start and release -> stop mapping; App test covers repeated hold-key Pressed events before release starting only one recording and release stopping/transcribing once. Cross-app hold behavior in TextEdit/Notes still needs manual execution. |
| NATIVE-010 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: hotkey helper tests cover paste-last shortcut mapping separately from dictation; App tests cover Settings hotkey changes updating workbench chips, paste-last success using the latest history transcript, and paste-last failure feedback. Cross-app TextEdit/Notes paste still needs manual execution. |
| NATIVE-011 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: App/component tests cover sidebar mascot -> native companion lookup/show/position/state emit, unavailable-window error, companion hide request sync, transparent companion render states, timer, drag, avatar variants, secondary monitor origins, and small work areas; `version.test.ts` locks the Tauri companion window config to transparent, borderless, always-on-top, hidden at launch, no taskbar, no focus, and no shadow. Real packaged floating window chrome/always-on-top behavior still needs manual execution. |
| NATIVE-012 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: Rust tests cover close-to-hide lifecycle, tray menu id -> show/hide/quit action mapping, and left-click-release -> show-main behavior; installed app launch/quit smoke passed with no lingering process. Real tray menu click/show/hide interaction still needs manual execution. |
| NATIVE-013 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: App/component tests cover operation locks, tier rollback, delete/import/refresh wiring, import path trimming, import error feedback, and operation-lock release after failed import; Rust tests cover model id validation. Real UI download/select/delete/import on installed app still needs manual execution. |
| NATIVE-014 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: Rust tests cover low-disk download/import preflight messages with required space, available space, and target directory. Constrained-volume manual test still needs execution. |
| NATIVE-015 | macOS | 0.2.0 | Codex | Partial automated | 2026-05-13: browser-preview Playwright now tabs through primary nav, dictation controls, history actions, dictionary/snippet inputs, settings tabs, tier cards, and inline confirmations with visible focus assertions. Packaged native keyboard pass still needs manual execution. |
| NATIVE-016 | Windows 11 | 0.2.0 | Codex | Partial automated | 2026-05-13: release workflow contract tests cover the Windows x64 matrix entry, `x86_64-pc-windows-msvc` target, MSI + NSIS bundle generation, artifact path, and release gate order before bundling. Tauri config locks the NSIS installer to `currentUser` mode so corporate users have a non-admin install path when policy allows it. Actual `.exe` and MSI install/launch/setup/tray smoke still needs manual verification on Windows 11. |
| NATIVE-017 | Windows 11 | 0.2.0 | Codex | Partial automated | 2026-05-13: CI matrix builds/tests Windows x64, and native Rust command launchers now use `CREATE_NO_WINDOW` for Private Fast processes plus shared paste/settings commands to reduce console-window flashing. Actual Windows Notepad toggle/hold/Paste Last execution still needs manual verification on Windows 11. |
| NATIVE-018 | macOS/Windows | 0.2.0 | Codex | Partial automated | 2026-05-13: Playwright fails on non-local network/WebSocket requests; shared/API tests reject content fields and common aliases with strict metadata schemas. Real network monitor/offline installed-app spot check still needs manual execution. |
