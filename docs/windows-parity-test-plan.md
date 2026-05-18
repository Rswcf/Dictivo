# Dictivo Windows Parity Test Plan

Date: 2026-05-18

Purpose: verify that the Windows validation build exposes the same product
features as the current macOS build. Windows public release can remain gated
by signing and manual QA, but the Windows validation artifact must not lag the
macOS feature set.

## Success Criteria

- The latest `build-desktop.yml` run for `main` succeeds for both `macOS universal` and `Windows x64`.
- GitHub artifacts contain exactly the latest `Dictivo-macOS-universal` and `Dictivo-Windows-x64-installers` artifacts.
- The Windows artifact contains both `Dictivo_<version>_x64-setup.exe` and `Dictivo_<version>_x64_en-US.msi`, where `<version>` matches `apps/desktop/src-tauri/tauri.conf.json`.
- Windows 11 passes the feature matrix below against the latest macOS release candidate.
- Any missing Windows feature is recorded as a bug unless it is explicitly an OS permission, installer, signing, or platform-behavior difference.

## Current Automated Evidence

Use this section as a checklist before starting manual Windows QA.

| Evidence | Command or source | Required result |
| --- | --- | --- |
| Source is clean and pushed | `git status --short`; `git log --oneline -3` | No local changes. Latest commit is on `main`. |
| Windows artifact exists | `gh api repos/Rswcf/Dictivo/actions/artifacts --paginate` | Latest artifact includes `Dictivo-Windows-x64-installers`. |
| Workflow parity target exists | `.github/workflows/build-desktop.yml` | Matrix includes `Windows x64`, `x86_64-pc-windows-msvc`, and `msi,nsis`. |
| Workflow contract test | `npm exec -w @dictivo/desktop -- vitest run tests/releaseWorkflow.test.ts` | macOS and Windows validation target tests pass. |
| CI installer + launch smoke | `build-desktop.yml` Windows `Windows installer smoke` step | The NSIS installer installs silently, `Dictivo.exe` is present and non-empty, and the installed app stays running during the launch smoke. |
| Desktop render contracts | `npm exec -w @dictivo/desktop -- vitest run tests/componentsStatic.test.tsx tests/componentsInteraction.test.tsx` | Local / Cloud Fast, companion, settings, and layout contracts pass. |
| Desktop bridge contracts | `npm exec -w @dictivo/desktop -- vitest run tests/desktopBridge.test.ts tests/cloudFastEngine.test.ts` | Cloud Fast session, native bridge, clipboard, and fallback paths pass. |
| Native Rust contracts | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | Windows command helpers, native recorder, license slots, and private-fast tests pass. |
| Browser E2E | `npm run e2e` | Main workflows, settings, companion upload, onboarding, and tier UI pass. |

## Windows Preflight Script

Before running the manual matrix, download the latest
`Dictivo-Windows-x64-installers` artifact, unzip it, and run this from
PowerShell on Windows:

```powershell
.\scripts\windows-parity-smoke.ps1 -InstallerPath .\nsis\Dictivo_<version>_x64-setup.exe
```

The script validates the current-version installer name, requires the adjacent
`.sig` file, installs the NSIS package silently, finds the installed
`Dictivo.exe`, verifies its ProductVersion metadata, launches it, and confirms
the process stays alive. It leaves the app running by default so the tester can
continue with `WIN-PARITY-002`; add `-StopAfterLaunch` when you only want the
preflight result.

## Windows Feature Matrix

Run on Windows 11 from the latest `Dictivo-Windows-x64-installers` artifact.
Compare visible behavior with the latest macOS build from the same commit.

| ID | Feature | Windows steps | Expected parity |
| --- | --- | --- | --- |
| WIN-PARITY-001 | Installers | Install the current-version `Dictivo_<version>_x64-setup.exe`. Then uninstall and test the MSI on a managed profile if available. | NSIS installs per-user without admin when policy allows. MSI installs cleanly. App version matches the current release version. |
| WIN-PARITY-002 | First launch | Launch Dictivo after install. Open every sidebar view. | No crash, stale layout, missing nav item, or old UI state. |
| WIN-PARITY-003 | Private Local setup | Open Settings -> Engine, choose Local, refresh status, select Fast / Medium / Quality where available. | Local model setup and tier controls match macOS; Cloud Fast-specific details are hidden while Local config is shown. |
| WIN-PARITY-004 | Cloud Fast mode | Switch the workbench and Settings -> Engine to Cloud Fast. Try locked and activated states. | Local controls are hidden in Cloud Fast. User sees one Cloud Fast option, no provider picker, and the privacy copy about uploading audio. |
| WIN-PARITY-005 | Cloud Fast license | Activate a Cloud Fast test key, refresh, remove it, and re-activate. | Cloud Fast license cache is separate from Local license. Removing Cloud Fast does not remove Local. |
| WIN-PARITY-006 | Local recording | Start dictation from the main mic button, speak for 5-10 seconds, stop. | Native recorder captures audio, local transcription runs, transcript appears, history updates, and clipboard behavior matches macOS. |
| WIN-PARITY-007 | Cloud Fast recording | With Cloud Fast active, record the same phrase and stop. | Audio uploads only in Cloud Fast, transcript returns, fallback state is user-safe, dictionary/snippets polish locally after the cloud result. |
| WIN-PARITY-008 | Hotkey toggle | Focus Notepad. Press the dictation hotkey to start, speak, press again to stop. | Exactly one start and one stop. Final text is copied and pasted into Notepad when clipboard has not changed. |
| WIN-PARITY-009 | Hotkey hold | Change activation mode to Hold. Hold the dictation hotkey in Notepad, speak, release. | Recording starts on keydown and stops on keyup. Repeated keydown does not start duplicate sessions. |
| WIN-PARITY-010 | Paste Last | Create a successful transcript. Focus Notepad and press Paste Last. | Latest final transcript is pasted once; hotkey label uses Windows formatting. |
| WIN-PARITY-011 | Clipboard race | Start recording, change clipboard before stopping, then stop. | Dictivo does not overwrite a changed clipboard blindly; final text stays visible and copy fallback is clear. |
| WIN-PARITY-012 | Companion status card | Enable companion, start/stop dictation, process, complete, hide, then start again. | Status card appears for active states, tracks state changes, and Hide syncs back to main UI. |
| WIN-PARITY-013 | Companion animated pet | Switch to Animated pet, choose each built-in avatar, upload a local custom image, remove it. | Avatar mode and custom image behavior match macOS except macOS-only fullscreen Spaces behavior. |
| WIN-PARITY-014 | Tray behavior | Close main window, use tray to show main, hide companion, and quit. | Close hides rather than exits. Tray actions work. Quit exits without orphan Dictivo processes. |
| WIN-PARITY-015 | History | Save multiple sessions, search, copy raw/final, paste a session, delete one, clear all. | Data persists under Windows app data and behavior matches macOS. |
| WIN-PARITY-016 | Dictionary/snippets | Add duplicate and valid terms/snippets, dictate terms, remove entries. | Validation, local storage, and final polish match macOS. Snippets are not sent to Cloud Fast. |
| WIN-PARITY-017 | Auto language | Keep Auto language. Dictate English and CJK phrases in Local and Cloud Fast. | Output stays in the spoken language; CJK uses character counts; history metadata is valid. |
| WIN-PARITY-018 | Privacy/settings | Open Settings -> Privacy and each system settings action. | Windows-specific settings links open or fail with actionable text; no macOS-only permission copy is shown as required. |
| WIN-PARITY-019 | Updates/license | Activate Local license if available, refresh, remove, check updates. | Local license and update status match macOS semantics; messages say devices, not Macs. |
| WIN-PARITY-020 | Network privacy | In Local mode, monitor outbound connections during dictation. Repeat in Cloud Fast. | Local mode does not upload audio/transcripts. Cloud Fast uploads only after the user chooses Cloud Fast. |

## Failure Policy

- Release-blocking: missing recording, failed hotkeys, failed paste, data loss,
  Local-mode audio upload, Cloud Fast auth bypass, installer failure, or app crash.
- High priority: companion unavailable, license state confusion, stale old UI,
  wrong privacy copy, missing History/Dictionary/Snippets behavior.
- Medium priority: visual spacing, copy tone, non-blocking settings dead ends.

Record every failed row with:

```text
ID:
Windows build artifact:
Commit:
Steps:
Expected:
Actual:
Screenshot/log:
Severity:
```

## Completion Rule

Do not mark Windows parity complete from CI alone. CI proves that the code
builds and that automated contracts run on Windows. Product parity is complete
only after the Windows feature matrix passes on a real Windows 11 machine.
