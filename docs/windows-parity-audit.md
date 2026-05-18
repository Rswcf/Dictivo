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
| Do not leave old Windows artifacts as the visible build | GitHub artifact list must keep only `Dictivo-Windows-x64-installers` and `Dictivo-macOS-universal` from the latest completed `Build desktop apps` run on `main`. | Automated/admin pass |
| Windows artifact version must match app version | Windows `Windows installer smoke` log must include `Installed Dictivo.exe ProductVersion <current app version>`. | Automated pass |
| Windows installed app must launch | Windows `Windows installer smoke` log must include `Launch smoke found running Dictivo process`. | Automated pass |
| Latest Windows artifact contents are current | Downloaded artifact must contain `Dictivo_<version>_x64-setup.exe`, `.sig`, `Dictivo_<version>_x64_en-US.msi`, and `.sig`. | Automated pass |
| Local / Cloud Fast mode surfaces are present | `componentsStatic.test.tsx`, `componentsInteraction.test.tsx`, `desktopBridge.test.ts`, and `cloudFastEngine.test.ts` run in CI on Windows. | Automated contract pass |
| Hotkey, paste, clipboard, companion, tray, recorder, and privacy behavior match macOS | `docs/windows-parity-test-plan.md` rows `WIN-PARITY-006` through `WIN-PARITY-020`. | Needs real Windows 11 |
| Local mode does not upload audio; Cloud Fast uploads only after user chooses it | `WIN-PARITY-020`, plus local/cloud code contracts. | Needs real Windows 11 network spot check |
| Manual completion must not be inferred from CI alone | `docs/windows-parity-test-plan.md` completion rule. | Guarded |

## Current Automated Evidence

Read the current automated evidence from GitHub Actions instead of pinning
volatile run IDs in this file:

```bash
gh run list --workflow "Build desktop apps" --branch main --limit 1 --json databaseId,headSha,status,conclusion,createdAt,displayTitle
gh run view <run_id> --json status,conclusion,jobs
gh api repos/Rswcf/Dictivo/actions/artifacts --paginate --jq '.artifacts[] | [.id, .name, .created_at, .expired, .size_in_bytes, .workflow_run.id] | @tsv' | head -20
gh run view --job <windows_job_id> --log | rg "Installed |ProductVersion|Launch smoke|Upload desktop artifact"
```

Required current evidence:

- Latest `Build desktop apps` run on `main` is green for both `macOS universal`
  and `Windows x64`.
- The Windows smoke log includes installed `Dictivo.exe` size,
  `ProductVersion`, and a successful launch-smoke process.
- Retained artifacts include exactly the latest `Dictivo-Windows-x64-installers`
  and `Dictivo-macOS-universal` artifacts.

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
