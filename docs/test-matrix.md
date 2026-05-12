# Dictivo Test Matrix

Scope: local-first desktop UI, companion window, shared privacy contracts, and metadata-only API. The matrix maps current product behavior to automated coverage and remaining manual/E2E checks.

## Frontend Pages And States

| Area | Functional coverage | Edge/state coverage | Automated evidence |
| --- | --- | --- | --- |
| Dictation Workbench | Mode switching surface, live transcript editor, start/stop button, telemetry, hotkey and paste status | Engine not ready, raw transcript preview, long text and special characters, recording animation classes | `apps/desktop/tests/componentsStatic.test.tsx`, `apps/desktop/tests/wireframeVisual.test.ts` |
| Local History | Search input, clear-history control, copy raw, copy final, markdown export | Empty search result, raw transcript present/missing, dense session metadata | `apps/desktop/tests/componentsStatic.test.tsx` |
| Dictionary & Snippets | Add-term/add-snippet controls, removal controls | Empty dictionary, empty snippets, long term, URL replacement with query characters | `apps/desktop/tests/componentsStatic.test.tsx`, `apps/desktop/tests/localPolish.test.ts` |
| Settings: Local Engine | Model selection mode, profile selection, download/select/delete controls, import path, refresh | Installed selected model, pending download state, hardware recommendation, missing CLI text | `apps/desktop/tests/componentsStatic.test.tsx`, `apps/desktop/tests/desktopBridge.test.ts` |
| Settings: Hotkeys | Dictation and Paste Last shortcut rows, activation mode select | Toggle/hold mapping, duplicate shortcut collapse, press/release behavior | `apps/desktop/tests/componentsStatic.test.tsx`, `apps/desktop/tests/hotkeys.test.ts` |
| Settings: Processing | Auto polish, spoken punctuation, filler removal, capitalization toggles | Raw mode bypass, CJK punctuation, prompt/email/message formatting | `apps/desktop/tests/componentsStatic.test.tsx`, `apps/desktop/tests/localPolish.test.ts` |
| Settings: Companion | Enable toggle, avatar picker | Dog/cat/Trump avatar normalization, hidden companion setting persistence | `apps/desktop/tests/componentsStatic.test.tsx`, `apps/desktop/tests/settingsStore.test.ts`, `apps/desktop/tests/companion.test.ts` |
| Settings: Privacy | Permission cards, status copy, refresh control | Granted, denied, clipboard-only, web-preview, unknown native placeholder | `apps/desktop/tests/privacySettings.test.ts`, `apps/desktop/tests/componentsStatic.test.tsx` |
| Floating Companion | Idle, recording, processing, complete, blocked, error summaries | Timer source, word count, paste status, avatar asset, grayscale wireframe styling | `apps/desktop/tests/companion.test.ts`, `apps/desktop/tests/wireframeVisual.test.ts` |
| Responsive UI | Sidebar collapse, horizontal nav, single-column panels, mobile companion sizing | Desktop and mobile breakpoints, horizontal overflow guard, nonblank screenshot capture | `apps/desktop/tests/wireframeVisual.test.ts`, `apps/desktop/e2e/app.spec.ts` |

## Core Logic And API

| Area | Functional coverage | Failure/edge coverage | Automated evidence |
| --- | --- | --- | --- |
| Local bridge fallback | Web preview permission states, model catalog, hardware estimate, clipboard fallback | No `window` runtime, native transcription blocked outside Tauri | `apps/desktop/tests/desktopBridge.test.ts` |
| Local polishing | Punctuation, snippets, fillers, capitalization, dictionary terms, prompt/raw modes | URL snippets preserved, CJK punctuation without inserted spaces | `apps/desktop/tests/localPolish.test.ts` |
| Settings migration | Legacy cloud settings removed, local-only settings retained | Invalid profile/avatar fallback, legacy hotkey upgrade | `apps/desktop/tests/settingsStore.test.ts` |
| Shared privacy contract | Forbidden content fields detected recursively | Metadata-only payload allowed, only local provider exported | `packages/shared/tests/privacy.test.ts` |
| API privacy guard | Metadata API rejects transcript content and legacy cloud provider | Valid local-only session accepted | `apps/api/src/routes/privacy.test.ts` |
| API metadata routes | Health, entitlements, usage, billing scaffolding | Stripe missing uses mock checkout; DB absent returns safe defaults; invalid usage and checkout inputs | `apps/api/src/routes/metadata.test.ts` |
| Native Tauri layer | Global shortcut capability, Rust global-hotkey probe | CI-only ignored Rust probe for platform integration | `apps/desktop/tests/hotkeys.test.ts`, `.github/workflows/build-desktop.yml` |

## Manual And E2E Scenarios

These require a real browser/Tauri runtime, microphone permissions, and a local model:

| Scenario | Steps | Expected result |
| --- | --- | --- |
| Real dictation happy path | Install/import model, start recording, speak, stop | WAV audio transcribes locally, transcript is polished, saved, copied/pasted, history updates |
| Microphone denial | Deny mic permission and start dictation | Error status is shown, companion enters attention state, no session is saved |
| Clipboard race | Change clipboard between recording and paste | Transcript stays in app and is not pasted over changed clipboard |
| Native model operations | Download/select/delete/import every listed model | Operation state disables duplicate clicks and final status updates correctly |
| Global hotkeys | Toggle and hold modes from another active app | Start/stop/paste-last intents fire exactly once per press/release sequence |
| Rapid navigation | Click all nav/settings tabs repeatedly during loading/operation | No UI state loss, overlap, or disabled-control escape |
| Browser sizes | 390px mobile, 768px tablet, 1440px desktop | 390px and 1440px are automated; 768px tablet remains a manual spot check |
| Accessibility pass | Keyboard tab through main nav, forms, settings, companion close | Visible focus outline, named icon buttons, no keyboard trap |

## Hardware Tier Mapping (manual)

For each row, install Dictivo on the target hardware, run the onboarding wizard, and record what the UI shows. Confirm the footer status line reads `<Tier> · <model> · <accel> · <hotkey>` and that the Companion floating window paints with no window chrome.

| Machine                              | Expected `performance_class` | Expected tiers visible            | Verified |
| ------------------------------------ | ---------------------------- | --------------------------------- | -------- |
| macOS Apple Silicon M3 / 16 GB       | `GpuHigh`                    | Fast, Medium, Slow                |          |
| macOS Apple Silicon M1 / 8 GB        | `CpuStrong`                  | Fast, Medium (Slow may be hidden) |          |
| macOS Intel 16 GB with AMD dGPU 8 GB | `GpuHigh`                    | Fast, Medium, Slow                |          |
| macOS Intel 16 GB, integrated GPU    | `CpuStrong`                  | Fast, Medium                      |          |
| Windows + RTX 3060 (8 GB) + 16 GB    | `GpuHigh`                    | Fast, Medium, Slow                |          |
| Windows CPU-only, 8 cores, 16 GB     | `CpuStrong`                  | Fast, Medium                      |          |
| Windows CPU-only, 4 cores, 8 GB      | `CpuWeak`                    | Fast (Medium maybe; Slow hidden)  |          |
| Linux + NVIDIA CUDA + 16 GB          | `GpuHigh`                    | Fast, Medium, Slow                |          |
| Linux CPU-only, 8 cores, 16 GB       | `CpuStrong`                  | Fast, Medium                      |          |

## Coverage Limits

The repository now includes Playwright E2E coverage for Chromium desktop and mobile web-preview flows plus Vitest coverage for render contracts, pure logic, fallback behavior, CSS contracts, and API privacy. It still cannot fully prove native microphone capture, Tauri companion window positioning, OS permission dialogs, global shortcut registration in another app, or real whisper.cpp model execution without running the packaged desktop app with local permissions and models. Those are tracked above as manual/native scenarios.
