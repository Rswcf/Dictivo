# Dictivo

Local-first desktop dictation for macOS and Windows.

Dictivo turns single-speaker speech into polished text with an on-device whisper.cpp engine. The first product slice is intentionally narrow: reliable local dictation, local history, local dictionary/snippets, local model management, global hotkeys, and paste-to-active-app support.

## Product Direction

- Single-person dictation is the MVP focus.
- Meeting transcription, speaker diarization, meeting summaries, and system-audio capture are out of scope for this stage.
- Audio, transcripts, dictionary terms, snippets, provider settings, and local history stay on the user's machine.
- Cloud AI providers are not part of the desktop execution path.
- The backend remains metadata-only and rejects content fields by design.

## Current Stack

- Tauri v2 + React desktop app shell.
- Local whisper.cpp transcription through the Private Fast engine.
- Local text polishing for Message, Email, Raw, and Prompt modes.
- Global hotkey toggle starts/stops local recording and leaves the transcript in the clipboard.
- Always-on-top floating companion window for recording, processing, completion, and setup feedback.
- Fastify API for optional metadata, entitlement, billing, and usage scaffolding.
- Shared TypeScript contracts for local-only provider and backend privacy rules.

## Commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run test
```

To run the native desktop app:

```bash
npm run tauri:dev -w @dictivo/desktop
```

## Local Engine Setup

The packaged macOS and Windows apps include the whisper.cpp CLI. Users only need to open `Settings -> Local Engine` and download or import a local `.bin` model.

When running from source, use a lightweight model first to validate permissions, hotkeys, and latency:

```bash
DICTIVO_MODEL=small scripts/setup-private-fast.sh
```

For higher local quality on capable hardware:

```bash
DICTIVO_MODEL=large-v3-turbo-q5_0 scripts/setup-private-fast.sh
```

Dictivo detects bundled whisper.cpp resources first, then local developer installs and models under the platform data directory or `~/.dictivo/private-fast`. You can override paths with `DICTIVO_PRIVATE_FAST_HOME`, `DICTIVO_WHISPER_CLI`, and `DICTIVO_WHISPER_MODEL`.

Users can download, select, delete, or import local models in `Settings -> Local Engine`.

## Hotkeys and Companion

The default dictation hotkey is `CommandOrControl+Shift+Space`; pressing it once starts local microphone recording, and pressing it again stops recording, transcribes locally, and copies the final text to the clipboard. `CommandOrControl+Shift+V` pastes the last transcript.

`Settings -> Companion` controls the floating status window and avatar. The companion window is separate from the main app, stays above other windows, and mirrors the current dictation state.

## Hardware Adaptation

Dictivo detects platform, CPU architecture, CPU cores, memory, and local acceleration signals exposed by the native runtime. It recommends:

- Low-resource or CPU-only machines: `base` or `small` with Fast profile.
- Mid-range CPU machines: `small` or quantized medium with Balanced profile.
- High-end Apple Silicon or accelerated machines: `large-v3-turbo-q5_0` with Quality profile.

Users can override automatic model/profile selection at any time.

## Privacy Rule

The backend must never receive or store:

- transcript text
- audio blobs or URLs
- meeting summaries
- dictionary terms
- snippets
- provider credentials
- API keys

Those fields are local-only. The desktop app does not call cloud AI APIs.
