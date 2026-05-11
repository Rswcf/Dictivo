# Dictivo

Private, local-first voice dictation for macOS and Windows.

Dictivo turns speech into polished text with an on-device `whisper.cpp` engine. It is built for people who want fast dictation, reusable snippets, local history, global hotkeys, and paste-to-active-app workflows without sending audio or transcripts to cloud AI providers.

## Languages

- English: `README.md`
- 简体中文: [docs/README.zh-CN.md](docs/README.zh-CN.md)
- 日本語: [docs/README.ja.md](docs/README.ja.md)
- Español: [docs/README.es.md](docs/README.es.md)

## Why Dictivo

Most dictation tools ask you to choose between convenience and privacy. Dictivo is designed around a different default:

| Need | Dictivo approach |
| --- | --- |
| Dictate quickly | Press the global hotkey, speak, stop, and paste. |
| Keep work private | Audio, transcripts, dictionary terms, snippets, and history stay on your device. |
| Write in your own style | Choose Message, Email, Raw, or Prompt mode. |
| Reuse repeated text | Add local dictionary terms and snippets for names, product words, links, and phrases. |
| Run on different machines | Select a Fast, Balanced, or Quality local engine profile based on your hardware. |

## Product Tour

Dictivo is intentionally focused on one job: reliable single-person dictation.

- Local dictation workbench with live editable transcript text.
- On-device transcription through the Private Fast `whisper.cpp` engine.
- Local polishing for Message, Email, Raw, and Prompt workflows.
- Local history for recent dictations.
- Local dictionary and snippets for custom words and reusable replacements.
- Local model manager for downloading, importing, selecting, and deleting models.
- Global hotkeys for start/stop and paste-last.
- Floating companion window for recording, processing, completion, and setup states.
- Metadata-only backend scaffolding for entitlement, billing, and usage events.

## Quick Start

### Install a release build

When release artifacts are published, download the latest build from GitHub Releases:

- macOS: `Dictivo.app` or `.dmg`
- Windows: installer bundle from the release assets

Open Dictivo, then go to `Settings -> Local Engine` and download or import a local model.

### Run from source

Requirements:

- Node.js 20+
- Rust stable
- macOS or Windows for the native desktop shell

```bash
npm install
npm run tauri:dev -w @dictivo/desktop
```

For a browser-only frontend preview:

```bash
npm run dev
```

## First Dictation

1. Open `Settings -> Local Engine`.
2. Download or import a `.bin` model.
3. Confirm microphone and accessibility permissions when your OS asks.
4. Press `CommandOrControl+Shift+Space` to start recording.
5. Speak naturally.
6. Press the same hotkey again to stop.
7. Dictivo transcribes locally, copies the final text, and attempts to paste into the active app.

If automatic paste is blocked by the OS, the transcript is still copied. Press `Command+V` on macOS or `Ctrl+V` on Windows.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Nothing records | Confirm microphone permission, then restart Dictivo. |
| No local model appears | Open `Settings -> Local Engine` and download or import a `.bin` model. |
| Transcript copies but does not paste | Confirm accessibility permission on macOS, focus the target text field, then use `Command+V`. |
| Global hotkey does not respond | Change the shortcut in `Settings -> Hotkeys` if another app already owns it. |
| The first transcription is slow | Use a smaller model first, then switch to a quality model after setup is confirmed. |

## Local Engine Setup

Packaged desktop builds include the expected Private Fast engine layout. When running from source, start with a small model to validate permissions, hotkeys, and latency:

```bash
DICTIVO_MODEL=small scripts/setup-private-fast.sh
```

For higher local quality on capable hardware:

```bash
DICTIVO_MODEL=large-v3-turbo-q5_0 scripts/setup-private-fast.sh
```

Dictivo detects bundled resources first, then developer installs and models under the platform data directory or `~/.dictivo/private-fast`.

Optional overrides:

```bash
DICTIVO_PRIVATE_FAST_HOME=/path/to/private-fast
DICTIVO_WHISPER_CLI=/path/to/whisper-cli
DICTIVO_WHISPER_MODEL=/path/to/model.bin
```

## Privacy Model

Dictivo is local-first by design.

The desktop app does not call cloud AI APIs for dictation. The backend must never receive or store:

- audio blobs or audio URLs
- transcript text
- meeting summaries
- dictionary terms
- snippets
- provider credentials
- API keys

The backend accepts metadata only, such as local session IDs, provider name, privacy mode, duration, and word count.

## Supported Languages

The current app supports local dictation settings for:

- English
- 中文
- Español
- 日本語
- Français
- Deutsch

The interface documentation currently ships in English, Simplified Chinese, Japanese, and Spanish. More community translations are welcome.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `CommandOrControl+Shift+Space` | Start or stop dictation |
| `CommandOrControl+Shift+V` | Paste the last transcript |

Shortcuts can be changed in `Settings -> Hotkeys`.

## Project Structure

```text
apps/
  api/          Fastify metadata API
  desktop/      Tauri + React desktop app
packages/
  shared/       Shared TypeScript contracts and privacy helpers
docs/
  README.*      Localized GitHub documentation
  test-matrix   Product and QA coverage matrix
scripts/
  setup-private-fast.sh
  prepare-private-fast-engine.mjs
```

## Development Commands

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run e2e
npm run test:coverage
npm run build
```

Native desktop commands:

```bash
npm run tauri:dev -w @dictivo/desktop
npm run tauri:build -w @dictivo/desktop
```

## Quality Gates

The repository includes:

- TypeScript type checks for shared, API, and desktop packages.
- Vitest tests for shared privacy contracts, API metadata/privacy behavior, frontend render contracts, local polishing, hotkeys, settings migration, and bridge fallbacks.
- Playwright E2E tests for desktop and mobile Chromium web-preview flows.
- Rust tests for Tauri-side clipboard markers, lifecycle behavior, and Private Fast path selection.
- A product test matrix in [docs/test-matrix.md](docs/test-matrix.md).

## Roadmap

Near-term:

- Publish signed macOS and Windows release artifacts.
- Add product screenshots and short demo clips to the README.
- Expand native E2E coverage around microphone permissions, global hotkeys, and local model execution.
- Add more community translations.

Out of scope for the current product slice:

- Meeting transcription
- Speaker diarization
- Meeting summaries
- System-audio capture
- Cloud AI provider execution paths

## Community

- Questions and setup help: use GitHub Discussions when the repository is public.
- Bugs: open a GitHub Issue with OS, app version, local model, and reproduction steps.
- Contributions: read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
- Security or privacy concerns: do not post sensitive logs publicly; use the repository security contact once configured.
- Translations: open a pull request that updates the matching `docs/README.<locale>.md` file.

## Documentation Research

This README was redesigned after reviewing documentation patterns from high-traffic open-source repositories. See [docs/github-docs-research.md](docs/github-docs-research.md) for the research notes and adopted principles.
