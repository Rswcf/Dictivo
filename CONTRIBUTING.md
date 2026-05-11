# Contributing to Dictivo

Dictivo is a local-first dictation app. Contributions are welcome when they preserve that product promise: fast private transcription, predictable paste workflows, and no cloud handling of user audio or transcript text.

## Good first contributions

- Improve localized documentation in `docs/README.<locale>.md`.
- Add focused tests for settings, hotkeys, clipboard behavior, or local engine path handling.
- Improve setup docs for macOS and Windows.
- Fix small UI copy issues that make onboarding clearer.
- Report reproducible issues with OS version, Dictivo version, local model, and exact steps.

## Privacy rules

Do not add backend behavior that receives or stores:

- audio blobs or audio URLs
- transcript text
- meeting summaries
- dictionary terms
- snippets
- provider credentials
- API keys

Backend events should stay metadata-only, such as local session ID, provider name, privacy mode, duration, and word count.

## Development setup

```bash
npm install
npm run typecheck
npm run test
```

Run the desktop app:

```bash
npm run tauri:dev -w @dictivo/desktop
```

Run a browser-only frontend preview:

```bash
npm run dev
```

## Local engine setup

For source builds, start with a small local model so permissions and hotkeys can be validated quickly:

```bash
DICTIVO_MODEL=small scripts/setup-private-fast.sh
```

Optional overrides:

```bash
DICTIVO_PRIVATE_FAST_HOME=/path/to/private-fast
DICTIVO_WHISPER_CLI=/path/to/whisper-cli
DICTIVO_WHISPER_MODEL=/path/to/model.bin
```

## Pull request checklist

- The change is scoped to one behavior or documentation area.
- Privacy-sensitive data is not sent to the backend.
- Tests or docs were updated for user-facing behavior changes.
- `npm run typecheck` and `npm run test` pass locally, or the PR explains why they were not run.
- UI text is concise and clear for non-developer users.

## Translations

Localized README files should stay useful rather than literal. Keep the same core sections as the English README, but adapt wording for the target language.

Current documentation languages:

- English: `README.md`
- Simplified Chinese: `docs/README.zh-CN.md`
- Japanese: `docs/README.ja.md`
- Spanish: `docs/README.es.md`
