# Dictivo Top-Down Review Goal

Use this document as the full instruction set for a long-running Goal/agent task.

## Objective

Review `/Users/mayijie/Projects/Code/033_Dictivo` top-down, then test, fix, and verify Dictivo until it reaches release-candidate quality. Do not stop after a superficial report or after the first passing test run. Continue until the product, code, tests, UX, privacy posture, and remaining risks are clearly understood and documented.

## Product Context

Dictivo is a local-first desktop voice dictation app.

- Monorepo: `apps/desktop`, `apps/api`, `packages/shared`.
- Desktop: Tauri 2, React 19, Vite, TypeScript.
- Native layer: Rust for whisper.cpp integration, model management, hardware detection, clipboard, tray, windows, and SQLite local history.
- API: Fastify metadata-only backend.
- Core promise: audio, transcript text, dictionary terms, snippets, and history stay local. Backend APIs must never receive or store user content.

## Required Top-Down Understanding

First build a product and architecture map from:

- `README.md`
- `docs/test-matrix.md`
- root and workspace `package.json` scripts
- `apps/desktop/src/App.tsx`
- desktop components under `apps/desktop/src/components`
- desktop bridge and local logic under `apps/desktop/src/lib`
- Rust commands under `apps/desktop/src-tauri/src`
- API routes under `apps/api/src`
- shared privacy/types under `packages/shared/src`

Record the main flows, data boundaries, failure states, and which tests currently cover each area.

## Feature Areas To Review And Test

### 1. Onboarding

Cover hardware scan, recommended model, download, benchmark, calibration, skip setup, re-opening wizard, failure states, model missing states, slow hardware, old benchmark cache, and fingerprint mismatch.

### 2. Dictation

Cover recording start/stop, WAV generation, local whisper.cpp transcription, profile fallback, message/email/raw/prompt modes, language behavior, local polishing, snippets, dictionary prompt terms, clipboard-change protection, auto paste, copy fallback, status messages, and session persistence.

Languages must be consistent across shared types, desktop UI, API schemas, and Rust language mapping: `en`, `zh`, `es`, `ja`, `fr`, `de`, `vi`.

### 3. Model And Tier Management

Cover Fast, Medium, and Quality tier display; download; selection; benchmark; over-budget warning; Advanced model catalog; select/download/delete/import; hardware classification; env var overrides; local paths; cache migration; and user-visible error states.

### 4. Hotkeys

Cover toggle mode, press-and-hold mode, paste-last, duplicate shortcuts, unavailable shortcuts, browser-preview fallback, and native macOS/Windows/Linux differences.

### 5. History

Cover search, empty state, copy raw/final, markdown export, clear history, long text, CJK text, special characters, 100-item limit, browser localStorage fallback, and native SQLite behavior.

### 6. Dictionary And Snippets

Cover add/remove, empty input, duplicates, long terms, CJK, URL replacements, case-insensitive matching, and whether these values affect local polishing and whisper prompt terms.

### 7. Floating Companion

Cover companion preview, separate companion window, avatars, hide behavior, tray interaction, idle/recording/processing/complete/blocked/error phases, transparent window config, always-on-top behavior, positioning, and close behavior.

### 8. Settings, Privacy, And UX

Cover Local Engine, Hotkeys, Companion, and Privacy settings. Review permission status copy, refresh behavior, system permission guidance, keyboard accessibility, focus states, aria labels, icon button names, error visibility, layout overflow, and whether an ordinary user can complete the full flow:

install -> setup model -> dictate -> paste into another app -> find history -> adjust settings.

### 9. API And Privacy Contract

Cover `/health`, `/v1/transcription/session`, `/v1/usage/events`, `/v1/entitlements`, billing checkout, Stripe webhook, rate limiting, CORS, body limits, logging redaction, schema validation, and forbidden content fields.

The backend must reject audio, transcripts, text, summaries, dictionary terms, snippets, provider credentials, and API keys.

### 10. Build, Packaging, And CI

Cover Vite build, Tauri config, resources, icons, private-fast engine packaging, GitHub Actions desktop build, macOS/Windows artifact assumptions, and platform-specific behavior.

## Known High-Value Checks

Prioritize these, but do not stop here:

- Confirm API language schemas include all supported languages, especially `vi`.
- Confirm no UI copy or tests still expose old `Slow` terminology where the product should say `Quality`.
- Confirm onboarding ready-state logic matches the current non-optional tier shape.
- Review the missing disk-space preflight before model download and decide whether to fix or document it as a release blocker/backlog.
- Review `csp: null`, Tauri command exposure, backend logging, and privacy constraints for security risk.
- Confirm browser E2E limitations are documented: real microphone capture, OS permission dialogs, cross-app global shortcuts, companion native window behavior, and real whisper.cpp execution need native/manual validation.

## Execution Requirements

Run the existing gates before and after meaningful fixes:

```bash
npm run build
npm run typecheck
npm run test
npm run e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

When native validation is possible, also run or attempt:

```bash
npm run tauri:dev -w @dictivo/desktop
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test global_hotkey_probe -- --ignored --nocapture
```

If native microphone, real whisper.cpp models, OS permissions, or cross-app hotkeys cannot be verified in the environment, state the blocker clearly and provide exact manual test steps.

## Fixing Rules

- Fix real bugs found during review.
- Add or update tests for fixed behavior.
- Keep changes scoped to the reviewed behavior.
- Do not add cloud handling of user content.
- Do not send audio, transcript text, dictionary terms, snippets, or credentials to the backend or logs.
- Keep TypeScript, Rust, API schemas, and shared types consistent.
- Preserve a desktop productivity UX: clear, dense, predictable, accessible, and easy to scan.
- Avoid unrelated refactors.

## Output Format

Write the final report in Chinese. Include:

1. Product and architecture understanding.
2. Feature coverage checklist.
3. Findings ordered by severity, with file paths and line numbers.
4. Fixes made, if any.
5. Tests added or updated, if any.
6. Commands executed and results.
7. Remaining native/manual validation matrix.
8. UX improvement recommendations ordered by priority.
9. Residual risks and explicit non-blockers.

## Definition Of Done

Mark the Goal complete only when:

- The product and architecture are clearly mapped.
- All major feature areas above have been reviewed.
- Critical and High issues are fixed, or a concrete blocker prevents fixing them.
- Meaningful Medium issues are either fixed or documented with rationale.
- Relevant tests exist for changed behavior.
- Required gates pass, or any failures are explained with exact causes.
- Native/manual gaps are documented with reproducible steps.
