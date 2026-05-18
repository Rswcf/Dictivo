# Dictivo Windows Parity Audit

Date: 2026-05-18

Objective: make the Windows validation build feature-aligned with the current
macOS build. Windows public release may still wait for signing and manual QA,
but the Windows artifact must not remain an older product state.

## Completion Status

Not complete. Automated CI now proves that Windows builds, installs, reports
the expected installed app version, and launches. Full parity still requires a
real Windows 11 pass through `docs/windows-parity-test-plan.md`.

## Success Criteria

- Windows CI continues to build MSI and NSIS artifacts from the same commit as
  macOS.
- Only the latest desktop artifacts remain available for validation.
- The Windows installer installs the current version and does not launch an old
  `Dictivo.exe`.
- The Windows app exposes the same product surfaces as macOS: Workbench,
  Private Local, Cloud Fast, license/account flows, hotkeys, paste behavior,
  floating companion, history, dictionary, snippets, privacy/settings, updates,
  and auto language behavior.
- Any difference is either an explicit OS behavior, signing/public-release
  limitation, or a logged bug.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Keep Windows in GitHub Actions for testing | `.github/workflows/build-desktop.yml` includes `Windows x64`, `x86_64-pc-windows-msvc`, and `msi,nsis`; `apps/desktop/tests/releaseWorkflow.test.ts` locks this. | Automated pass |
| Do not leave old Windows artifacts as the visible build | GitHub artifact list currently keeps only `Dictivo-Windows-x64-installers` and `Dictivo-macOS-universal` from run `26040535241`. | Automated/admin pass |
| Windows artifact version must match app version | Run `26040535241`, Windows job `76550586807`, smoke log: `Installed Dictivo.exe ProductVersion 0.3.5`. | Automated pass |
| Windows installed app must launch | Same smoke log: `Launch smoke found running Dictivo process 6308`. | Automated pass |
| Latest Windows artifact contents are current | Downloaded artifact contains `Dictivo_0.3.5_x64-setup.exe`, `.sig`, `Dictivo_0.3.5_x64_en-US.msi`, and `.sig`. | Automated pass |
| Local / Cloud Fast mode surfaces are present | `componentsStatic.test.tsx`, `componentsInteraction.test.tsx`, `desktopBridge.test.ts`, and `cloudFastEngine.test.ts` run in CI on Windows. | Automated contract pass |
| Hotkey, paste, clipboard, companion, tray, recorder, and privacy behavior match macOS | `docs/windows-parity-test-plan.md` rows `WIN-PARITY-006` through `WIN-PARITY-020`. | Needs real Windows 11 |
| Local mode does not upload audio; Cloud Fast uploads only after user chooses it | `WIN-PARITY-020`, plus local/cloud code contracts. | Needs real Windows 11 network spot check |
| Manual completion must not be inferred from CI alone | `docs/windows-parity-test-plan.md` completion rule. | Guarded |

## Current Automated Evidence

Latest verified commit: `16daa3e`

GitHub Actions:

- Workflow: `Build desktop apps`
- Run: `26040535241`
- Windows job: `76550586807`
- macOS job: `76550586885`
- Result: success on both jobs

Latest retained artifacts:

- `7061253268` - `Dictivo-Windows-x64-installers`
- `7061183069` - `Dictivo-macOS-universal`

Local verification for the latest audit/doc guard:

```bash
npm exec -w @dictivo/desktop -- vitest run tests/releaseWorkflow.test.ts tests/docsConsistency.test.ts
git diff --check
```

## Remaining Manual Gate

Run the latest Windows artifact on a real Windows 11 machine:

```powershell
.\scripts\windows-parity-smoke.ps1 -InstallerPath .\nsis\Dictivo_0.3.5_x64-setup.exe
```

Then complete `WIN-PARITY-001` through `WIN-PARITY-020` in
`docs/windows-parity-test-plan.md`.

Windows parity can be marked complete only when every matrix row passes or has
a concrete bug with severity, reproduction steps, screenshot/log evidence, and
an owner decision to block or defer Windows public release.
