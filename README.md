<h1 align="center">🎙 Dictivo</h1>

<p align="center">
  <strong>Local-first voice dictation with an optional fast cloud path.</strong><br/>
  Whisper-grade transcription, one hotkey, and clear privacy controls.
</p>

<p align="center">
  <a href="https://github.com/Rswcf/Dictivo/actions"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/Rswcf/Dictivo/build-desktop.yml?branch=main&label=build&style=flat-square"></a>
  <a href="https://github.com/Rswcf/Dictivo/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/Rswcf/Dictivo?style=flat-square"></a>
  <a href="https://github.com/Rswcf/Dictivo/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Rswcf/Dictivo?style=flat-square"></a>
  <img alt="Platform" src="https://img.shields.io/badge/macOS_beta%20%7C%20Windows_planned-success?style=flat-square">
  <img alt="Local by default" src="https://img.shields.io/badge/🔒_local_by_default-blue?style=flat-square">
</p>

<p align="center">
  <em>[ screenshot / demo GIF goes here — drop at <code>docs/assets/hero.gif</code> ]</em>
</p>

<p align="center">
  🔒 <strong>Local mode keeps audio on your Mac</strong> &nbsp;·&nbsp;
  ⚡ <strong>30-second setup, one hotkey</strong> &nbsp;·&nbsp;
  ☁️ <strong>Optional Cloud Fast at $6.99/mo</strong>
</p>

<p align="center">
  <a href="docs/README.zh-CN.md">简体中文</a> &nbsp;·&nbsp;
  <a href="docs/README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="docs/README.es.md">Español</a>
</p>

---

## Why Dictivo

Most dictation apps make you choose between speed, accuracy, and privacy. Dictivo keeps Local mode as the default by running [`whisper.cpp`](https://github.com/ggml-org/whisper.cpp) on-device with a model tuned to your specific machine, then adds Cloud Fast only when you explicitly choose faster cloud transcription.

|  | Dictivo | Wispr Flow | Superwhisper | Otter.ai | macOS Dictation |
|---|:---:|:---:|:---:|:---:|:---:|
| 🔒 Local mode on-device | ✅ | ❌ cloud | ✅ | ❌ cloud | ✅ |
| ☁️ Optional fast cloud mode | ✅ | ✅ | partial | ✅ | ❌ |
| 🖥 Auto-tunes to your hardware | ✅ | ❌ | ❌ | — | ❌ |
| ⚡ Global hotkey + paste-to-active-app | ✅ | ✅ | ✅ | ❌ | partial |
| 🎯 Local polish + snippets | ✅ | ✅ | partial | ❌ | ❌ |
| 📖 Local dictionary + snippets | ✅ | partial | ✅ | ❌ | ❌ |
| 🌍 macOS first, Windows planned | ✅ | ✅ | macOS only | ✅ | macOS only |
| 🔎 Source-auditable client | ✅ FSL-1.1-MIT | ❌ proprietary | ❌ proprietary | ❌ proprietary | ✅ bundled |

---

## 🖥 The killer feature: hardware-aware tier selection

Dictivo benchmarks your machine on first launch and labels each tier with the predicted real-time factor — so you can pick **Fast**, **Medium**, or **Quality** with full knowledge of the tradeoff.

```
   Your hardware                Dictivo shows                          Behind the scenes
─────────────────────       ──────────────────────────────       ─────────────────────────────
 Apple M3 Pro 18 GB    →     Fast · Medium · Quality        →     small · large-v3-turbo-q5 · large-v3
 Intel i7 16 GB CPU    →     Fast · Medium · Quality ⚠      →     base · small · large-v3-turbo-q5
 8 GB integrated GPU   →     Fast · Medium ⚠ · Quality ⚠    →     tiny · base · small (warned)
```

Out-of-budget tiers (⚠) are still clickable — you get a warning confirm with the predicted slowdown so you can decide. No more "I downloaded Large-v3 and it took 12 minutes to transcribe a 30-second clip" — you knew up front.

---

## ⚡ 30-second quick start

**Install a release build** (recommended)

```text
1. Download the latest Dictivo `.dmg` from Releases
2. Open Dictivo
3. The setup wizard scans your hardware → downloads one recommended model → measures speed
4. Press `CommandOrControl+Shift+Space`, speak, press the same shortcut again. Done.
```

**Or run from source**

```bash
git clone https://github.com/Rswcf/Dictivo && cd Dictivo
npm install
npm run tauri:dev -w @dictivo/desktop
```

Requirements: Node 20+, Rust stable, and macOS for the current dogfood build. Windows packaging is in the repo but is planned for a later release after the Mac path is stable.

---

## How it works

```text
   ┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
   │  Microphone │───▶│  whisper.cpp     │───▶│  Local polish   │
   │  Hotkey     │    │  (your hardware) │    │  (punctuation / │
   └─────────────┘    └──────────────────┘    │   fillers / caps)│
          ▲                                    └────────┬────────┘
          │                                             │
          │                                             ▼
   Hotkey                                   ┌──────────────────────┐
   to start/stop                            │ Pasted into active   │
                                            │ app · saved locally  │
                                            └──────────────────────┘
```

In Local mode, this loop never sends audio to a cloud API. Audio, transcript, dictionary, snippets, and history stay on disk.

Cloud Fast is a separate optional mode. When selected, Dictivo uploads the current recording to a Dictivo-owned Cloudflare Worker proxy for faster transcription, then applies dictionary/snippet polish locally. The UI always shows only two choices: **Local** and **Cloud Fast**.

---

## 🐶 The floating companion

Dictivo ships with a compact status card companion by default. It appears for recording, processing, completion, blocked, and error states, then keeps the last completion information visible until you hide it or start the next dictation.

If you want a more playful surface, Settings -> Companion can switch the companion to **Animated pet** mode. Pick **Dog**, **Cat**, **Iris**, **Marcus**, or upload a custom local image.

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

- **🎙 Smart local polish** — punctuation cleanup, filler removal, capitalization, dictionary terms, and snippets, all configurable with Text cleanup in Settings.
- **🔥 Global hotkeys** — `CommandOrControl+Shift+Space` to dictate, `CommandOrControl+Shift+V` to paste the last transcript anywhere.
- **📖 Local dictionary & snippets** — Teach Dictivo proper nouns and trigger phrases. Zero round-trip to a server.
- **☁️ Cloud Fast** — Optional $6.99/month fast transcription with 1,500 minutes/month. Provider choice stays automatic and hidden.
- **🧠 Auto language detection** — input is detected automatically and output stays in the spoken language. The app keeps CJK character counts and history metadata aligned with the detected result.
- **🪟 Floating companion window** — Always-on-top, transparent, draggable, dismissible.
- **🛠 Power user escape hatch** — Settings → Engine → Advanced exposes the full 7-model `whisper.cpp` catalog if you don't want auto-pick.
- **🔄 Snappy hot reload** — Tauri 2 + Vite + React 19 + TypeScript. The UI repaints instantly.

---

## Privacy contract

Local keeps audio on this device. Cloud Fast uploads audio to cloud transcription providers for faster results.

In Local mode, the desktop app never sends audio, transcripts, snippets, dictionary terms, or any user content to a remote service.

Cloud Fast requests go through a Dictivo-owned Cloudflare Worker + D1 backend. The desktop uploads only the recording and request metadata; dictionary terms and snippets are kept local and applied after the cloud transcript returns. Provider routing is automatic and internal; provider details are logged only server-side.

The metadata backend (`apps/api`) still rejects transcript-like content on metadata routes at the type and runtime level — see [`packages/shared/src/privacy.ts`](packages/shared/src/privacy.ts) and the API privacy tests.

---

<details>
<summary>📂 <strong>Project structure</strong></summary>

```text
apps/
  api/          Cloudflare Worker + D1 API for metadata, billing, and Cloud Fast
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
npm run smoke:private-fast  # installed app + local model native smoke
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

</details>

<details>
<summary>🧰 <strong>Troubleshooting</strong></summary>

| Problem | Fix |
| --- | --- |
| Nothing records | Grant Microphone permission, restart Dictivo |
| No tiers visible | Re-run setup from Settings → Engine → Re-run setup |
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

**Near-term:** signed macOS release artifacts · screenshots + demo GIFs in README · expanded native E2E around real microphone permissions and global hotkeys · Windows release path after the Mac launch is stable · more community translations.

**Out of scope** (by design, for now): meeting transcription · speaker diarization · meeting summaries · system-audio capture · user-selectable cloud providers.

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

## License

Dictivo is published under the [**Functional Source License, Version 1.1, MIT Future License**](./LICENSE) (`FSL-1.1-MIT`). You can read every line of the desktop client, audit the privacy claims yourself, run it for personal or internal use, and modify it for your own needs. The only restriction is that you may not ship a competing dictation product built on this code while it is still source-available. **Two years after each release, that version automatically converts to the standard MIT License**, removing the competitive-use restriction entirely.

Third-party components included in the desktop binary are catalogued in [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md). All are permissively licensed (MIT / Apache-2.0 / BSD / ISC) and none impose obligations on Dictivo users.

---

<p align="center">
  Built with Tauri 2, React 19, whisper.cpp, and an irrational love for tiny binaries that respect your privacy.
</p>
