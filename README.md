<h1 align="center">🎙 Dictivo</h1>

<p align="center">
  <strong>Private voice dictation that runs entirely on your laptop.</strong><br/>
  Whisper-grade transcription, zero cloud, one hotkey to paste anywhere.
</p>

<p align="center">
  <a href="https://github.com/Rswcf/Dictivo/actions"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/Rswcf/Dictivo/build-desktop.yml?branch=main&label=build&style=flat-square"></a>
  <a href="https://github.com/Rswcf/Dictivo/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/Rswcf/Dictivo?style=flat-square"></a>
  <a href="https://github.com/Rswcf/Dictivo/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Rswcf/Dictivo?style=flat-square"></a>
  <img alt="Platform" src="https://img.shields.io/badge/macOS%20%7C%20Windows-supported-success?style=flat-square">
  <img alt="100% Local" src="https://img.shields.io/badge/🔒_100%25-local-blue?style=flat-square">
</p>

<p align="center">
  <em>[ screenshot / demo GIF goes here — drop at <code>docs/assets/hero.gif</code> ]</em>
</p>

<p align="center">
  🔒 <strong>Audio never leaves your Mac/PC</strong> &nbsp;·&nbsp;
  ⚡ <strong>30-second setup, one hotkey</strong> &nbsp;·&nbsp;
  🖥 <strong>Auto-picks the right model for your hardware</strong>
</p>

<p align="center">
  <a href="docs/README.zh-CN.md">简体中文</a> &nbsp;·&nbsp;
  <a href="docs/README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="docs/README.es.md">Español</a>
</p>

---

## Why Dictivo

Most dictation apps make you choose between speed, accuracy, and privacy. Dictivo picks **all three** — by running [`whisper.cpp`](https://github.com/ggml-org/whisper.cpp) on-device with a model tuned to your specific machine.

|  | Dictivo | Wispr Flow | Superwhisper | Otter.ai | macOS Dictation |
|---|:---:|:---:|:---:|:---:|:---:|
| 🔒 100% on-device | ✅ | ❌ cloud | ✅ | ❌ cloud | ✅ |
| 🖥 Auto-tunes to your hardware | ✅ | ❌ | ❌ | — | ❌ |
| ⚡ Global hotkey + paste-to-active-app | ✅ | ✅ | ✅ | ❌ | partial |
| 🎯 Message / Email / Prompt modes | ✅ | ✅ | partial | ❌ | ❌ |
| 📖 Local dictionary + snippets | ✅ | partial | ✅ | ❌ | ❌ |
| 🌍 macOS **and** Windows | ✅ | ✅ | macOS only | ✅ | macOS only |
| 💰 Free, open source | ✅ MIT | ❌ paid | ❌ paid | ❌ paid | ✅ bundled |

---

## 🖥 The killer feature: hardware-aware tier selection

Dictivo benchmarks your machine on first launch and exposes **only the models you can actually run smoothly**.

```
   Your hardware                Dictivo shows                  Behind the scenes
─────────────────────       ─────────────────────         ─────────────────────────────
 Apple M3 Pro 18 GB    →     Fast · Medium · Slow    →     small · large-v3-turbo-q5 · large-v3
 Intel i7 16 GB CPU    →     Fast · Medium           →     base · small (Slow hidden — too slow)
 8 GB integrated GPU   →     Fast                    →     tiny (Medium/Slow hidden honestly)
```

No more "I downloaded Large-v3 and it took 12 minutes to transcribe a 30-second clip." Dictivo measures the **real-time factor** on your machine and quietly hides any tier that can't keep up.

---

## ⚡ 30-second quick start

**Install a release build** (recommended)

```text
1. Download the latest Dictivo.dmg (macOS) or .msi (Windows) from Releases
2. Open Dictivo
3. The setup wizard scans your hardware → downloads one recommended model → measures speed
4. Press ⌥ Space, speak, press ⌥ Space again. Done.
```

**Or run from source**

```bash
git clone https://github.com/Rswcf/Dictivo && cd Dictivo
npm install
npm run tauri:dev -w @dictivo/desktop
```

Requirements: Node 20+, Rust stable, macOS or Windows.

---

## How it works

```text
   ┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
   │  Microphone │───▶│  whisper.cpp     │───▶│  Local polish   │
   │  ⌥ Space    │    │  (your hardware) │    │  (Msg / Email / │
   └─────────────┘    └──────────────────┘    │   Raw / Prompt) │
          ▲                                    └────────┬────────┘
          │                                             │
          │                                             ▼
   ⌥ Space                                  ┌──────────────────────┐
   to start/stop                            │ Pasted into active   │
                                            │ app · saved locally  │
                                            └──────────────────────┘
```

Nothing in this loop ever talks to a cloud API. Audio, transcript, dictionary, snippets, history — all stay on disk.

---

## 🐶 The floating companion

A 360 × 100 px transparent window that sits in the corner of your screen, animated by a cartoon mascot. Pick **dog**, **cat**, or **Trump**.

<p align="center">
  <em>[ companion screenshot — drop at <code>docs/assets/companion.png</code> ]</em>
</p>

The mascot:
- breathes while you're recording
- sways while transcribing
- shows a green ✓ when paste lands

It's silly. People share it. We're keeping it.

---

## Features

- **🎙 4 polish modes** — Message, Email, Raw, Prompt. Same recording, four different finished outputs.
- **🔥 Global hotkeys** — `⌥+Space` to dictate, `⌥+Shift+V` to paste the last transcript anywhere.
- **📖 Local dictionary & snippets** — Teach Dictivo proper nouns and trigger phrases. Zero round-trip to a server.
- **🧠 7-language transcription** — English, 中文, Español, 日本語, Français, Deutsch (and any other Whisper-supported tongue at the engine level).
- **🪟 Floating companion window** — Always-on-top, transparent, draggable, dismissible.
- **🛠 Power user escape hatch** — Settings → Local Engine → Advanced exposes the full 7-model `whisper.cpp` catalog if you don't want auto-pick.
- **🔄 Snappy hot reload** — Tauri 2 + Vite + React 19 + TypeScript. The UI repaints instantly.

---

## Privacy contract

The desktop app **never** sends audio, transcripts, snippets, dictionary terms, or any user content to a remote service.

The optional metadata backend (`apps/api`) accepts only: local session ID, provider name, privacy mode, duration in seconds, and word count. The privacy guard rejects anything else at the type and runtime level — see [`packages/shared/src/privacy.ts`](packages/shared/src/privacy.ts) and the API privacy tests.

---

<details>
<summary>📂 <strong>Project structure</strong></summary>

```text
apps/
  api/          Fastify metadata API (no transcripts ever)
  desktop/      Tauri + React desktop app
packages/
  shared/       Privacy contract + shared types
docs/
  test-matrix   Product / QA coverage matrix
  README.*.md   Localized README files
scripts/
  setup-private-fast.sh
  prepare-private-fast-engine.mjs
```

</details>

<details>
<summary>🛠 <strong>Development commands</strong></summary>

```bash
npm install                 # workspace install
npm run dev                 # vite preview (no Tauri shell)
npm run tauri:dev   -w @dictivo/desktop
npm run tauri:build -w @dictivo/desktop

npm run typecheck           # all packages
npm run test                # vitest across shared/desktop/api
npm run e2e                 # playwright web-preview suite
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

</details>

<details>
<summary>🧰 <strong>Troubleshooting</strong></summary>

| Problem | Fix |
| --- | --- |
| Nothing records | Grant Microphone permission, restart Dictivo |
| No tiers visible | Re-run setup from Settings → Local Engine → Re-run setup |
| Transcript copies but doesn't paste | Grant Accessibility permission on macOS, focus a text field, `⌘+V` |
| Global hotkey ignored | Another app claimed it — change in Settings → Hotkeys |
| First transcription is slow | Switch to Fast tier; it auto-uses a smaller model |

</details>

<details>
<summary>🧪 <strong>Quality gates</strong></summary>

- TypeScript type checks: shared, API, desktop
- Vitest: privacy contracts, API behavior, render contracts, polishing, hotkeys, settings migration, bridge fallbacks
- Playwright: Chromium desktop + mobile web-preview flows
- Rust unit tests: hardware detection, tier resolution, benchmark, fingerprint hashing, clipboard markers
- Manual hardware-tier matrix in [`docs/test-matrix.md`](docs/test-matrix.md)

</details>

---

## Roadmap

**Near-term:** Signed macOS + Windows release artifacts · screenshots + demo GIFs in README · expanded native E2E around real microphone permissions and global hotkeys · more community translations.

**Out of scope** (by design, for now): meeting transcription · speaker diarization · meeting summaries · system-audio capture · any cloud-AI execution path.

---

## ⭐ Star history

<p align="center">
  <a href="https://star-history.com/#Rswcf/Dictivo&Date">
    <img alt="Star history" src="https://api.star-history.com/svg?repos=Rswcf/Dictivo&type=Date">
  </a>
</p>

If Dictivo saves you from typing up another email, give the repo a star — it's how we measure whether this experiment matters to people.

---

## Community

- 💬 **Questions / setup help** — GitHub Discussions
- 🐛 **Bugs** — open an issue with OS, Dictivo version, selected tier, and repro steps
- 🌍 **Translations** — PR updating the matching `docs/README.<locale>.md`
- 🤝 **Contributions** — read [`CONTRIBUTING.md`](CONTRIBUTING.md), then open a PR
- 🔒 **Security** — do not file public issues with sensitive logs; use the repo's security contact

---

<p align="center">
  Built with Tauri 2, React 19, whisper.cpp, and an irrational love for tiny binaries that respect your privacy.
</p>
