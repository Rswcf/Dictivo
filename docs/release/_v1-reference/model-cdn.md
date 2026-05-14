# Model CDN — Schema, Hosting, ModelManager Wire-up

> Dictivo already downloads models lazily (today from Hugging Face directly, in `private_fast.rs::download_private_fast_model`). This spec migrates that to a Dictivo-owned CDN with a remote manifest, SHA256 verification, and a bundled `tiny` model so the app is functional the moment it installs.

## 1. Why move off Hugging Face

| Concern | Effect today | Mitigation by moving |
|---|---|---|
| Hugging Face URL changes | App-side bug, requires patch release | Stable Dictivo-owned URL |
| HF rate-limits or 429s | First-run failures, fingerprint Dictivo as a heavy puller | Cloudflare R2, no rate limit, zero egress cost |
| No SHA256 / signature in HF path | Tampered model would be silently used | Manifest carries SHA256; app refuses mismatch |
| Releasing a new model requires an app update | Tight coupling between app version and model availability | Models ship via manifest, decoupled from app |
| HF is a public, third-party brand on the wire | Privacy auditors flag external endpoints | Single `models.dictivo.app` endpoint |

We continue to **license model weights** from their original sources (whisper.cpp / Hugging Face / GGML) and respect their licenses; we just host a mirror.

## 2. Manifest at `https://models.dictivo.app/v1/manifest.json`

```json
{
  "manifest_version": 1,
  "generated_at": "2026-05-14T12:00:00Z",
  "models": [
    {
      "id": "tiny",
      "label": "Whisper tiny (multilingual)",
      "use_case": "Quick notes, low-end hardware",
      "speed": "fast",
      "quality": "basic",
      "tier_hint": "fast",
      "size_bytes": 77704416,
      "sha256": "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
      "url": "https://models.dictivo.app/v1/files/ggml-tiny.bin",
      "license": "MIT (whisper.cpp upstream)",
      "min_app_version": "1.0.0",
      "bundled": true
    },
    {
      "id": "base",
      "label": "Whisper base (multilingual)",
      "tier_hint": "fast",
      "size_bytes": 147951465,
      "sha256": "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
      "url": "https://models.dictivo.app/v1/files/ggml-base.bin",
      "min_app_version": "1.0.0",
      "bundled": false
    },
    {
      "id": "small",
      "label": "Whisper small (multilingual)",
      "tier_hint": "medium",
      "size_bytes": 487601967,
      "sha256": "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
      "url": "https://models.dictivo.app/v1/files/ggml-small.bin",
      "min_app_version": "1.0.0",
      "bundled": false
    },
    {
      "id": "medium",
      "label": "Whisper medium (multilingual)",
      "tier_hint": "slow",
      "size_bytes": 1533763059,
      "sha256": "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
      "url": "https://models.dictivo.app/v1/files/ggml-medium.bin",
      "min_app_version": "1.0.0",
      "bundled": false
    },
    {
      "id": "large-v3",
      "label": "Whisper large-v3 (multilingual)",
      "tier_hint": "slow",
      "size_bytes": 3094623691,
      "sha256": "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2",
      "url": "https://models.dictivo.app/v1/files/ggml-large-v3.bin",
      "min_app_version": "1.0.0",
      "bundled": false
    }
  ]
}
```

### Field semantics

| Field | Meaning |
|---|---|
| `id` | Stable string, matches `private_fast_models` row id |
| `tier_hint` | `fast` / `medium` / `slow` — used by hardware profiler |
| `size_bytes` | Exact bytes; UI shows `X MB / Y GB`, also used for disk-space precheck |
| `sha256` | Lowercase hex; verified after download |
| `bundled: true` | This model is included in the installer (currently only `tiny`) |
| `min_app_version` | App refuses to register the model if its own version is older |
| `license` | Optional, surfaced under About → Licenses |

### Future fields (reserved, not yet enforced)

- `replaced_by`: ID of a newer model that supersedes this one
- `update_window_required: "1.5.0+"`: model only visible to licenses whose `updates_until` covers the app version that introduced it
- `recommended_for: ["apple-silicon", "snapdragon"]`: hardware-specific hints

## 3. R2 bucket layout (`dictivo-models`)

```
dictivo-models/
├── v1/
│   ├── manifest.json                       (mutable; replaced on every model rev)
│   ├── manifest.json.sig                   (minisign over manifest.json)
│   └── files/
│       ├── ggml-tiny.bin
│       ├── ggml-base.bin
│       ├── ggml-small.bin
│       ├── ggml-medium.bin
│       └── ggml-large-v3.bin
└── v2/                                      (reserved for incompatible schema rev)
```

Bound to `models.dictivo.app` via Cloudflare R2 custom domain. Everything is **public** (no auth) — model weights are licensed for redistribution.

## 4. Manifest signature

Same minisign keypair as the updater (`updater-integration.md` §3). The app verifies `manifest.json.sig` before trusting any URL inside the manifest. A tampered manifest cannot redirect downloads to a malicious URL.

## 5. Bundling `tiny` in the installer

In `apps/desktop/src-tauri/tauri.conf.json`, add the model to `bundle.resources`:

```jsonc
"resources": {
  "resources/private-fast": "private-fast",
  "resources/benchmark-5s.wav": "benchmark-5s.wav",
  "resources/models/ggml-tiny.bin": "models/ggml-tiny.bin"
}
```

This adds **~78 MB** to the installer (acceptable). On first launch, `private_fast.rs` registers the bundled model into the local model store. The user can dictate immediately without any download.

For users who want a heavier offline starter, the website also offers `Dictivo-1.0.0-offline.dmg` and `Dictivo-1.0.0-offline-x64-setup.exe`, which bundle `tiny + base + small` (totals ~700 MB). Built via a separate `--features offline-bundle` CI matrix entry.

## 6. Migrating `private_fast.rs::download_private_fast_model`

Replace the hard-coded URL:

```rust
// BEFORE
let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model_id}.bin");

// AFTER
let manifest = load_cached_manifest(app)?;   // refreshed periodically; cached on disk
let model_meta = manifest.find(model_id)
    .ok_or(Error::UnknownModel)?;
let url = &model_meta.url;
```

After the download completes, **verify SHA256** before installing into the model store:

```rust
let mut hasher = Sha256::new();
let mut file = File::open(&temp_path)?;
io::copy(&mut file, &mut hasher)?;
let digest = format!("{:x}", hasher.finalize());
if digest != model_meta.sha256 {
    fs::remove_file(&temp_path).ok();
    return Err(Error::ChecksumMismatch);
}
```

The existing `sha2 = "0.10"` dependency in `Cargo.toml` covers this — no new deps needed.

## 7. Refresh cadence for the manifest

| When | Action |
|---|---|
| App first launch | Fetch manifest (timeout 5 s, fall back to embedded copy). |
| App start, daily after that | Re-fetch, cache to `<appData>/models-manifest.json`. |
| User opens Settings → Models | Force-refresh if cache is > 1 h old. |
| Offline | Use cached manifest. The bundled `tiny` model is always available regardless. |

The manifest carries no per-user information; the request is identical for everyone and is safe to cache aggressively.

## 8. Download UX — already in place

The existing `ModelManager.tsx` already covers:

- Tier-card click → confirm download dialog (`pending.kind === "download"`)
- "Within budget" warning dialog (`pending.kind === "warning"`)
- Delete confirmation (`pending.kind === "delete"`)
- `operationInProgress` lockout
- Import-from-path fallback (manual model placement)

What it needs added:

- A **progress bar** during the download. Tauri side emits `dictivo://model-download-progress { modelId, downloaded, total }`; the React side renders a per-row progress.
- A **retry** affordance after a failed download or SHA256 mismatch.
- A **"Not enough disk space"** precheck using `model_meta.size_bytes` + `dirs::data_dir` free-space query.

## 9. Resume + retry semantics

```
attempt 1:  GET <url>, write to <tmp>.part
            on connection drop: keep <tmp>.part
attempt 2:  Range: bytes=<existing>- ; append to <tmp>.part
attempt 3+: exponential backoff (1s, 4s, 16s, abort)
on success: move <tmp>.part → <final>; verify SHA256; install
```

R2 supports HTTP Range requests natively. No server-side code required.

## 10. Privacy of model downloads

The download URL is fully static. No tokens, no identifiers. The User-Agent is `Dictivo/<version> (model-download)`. Cloudflare access logs are not retained beyond what CF provides operationally; we do not export them.

## 11. Test plan

- **Unit (Rust)**: SHA256 mismatch path returns `Error::ChecksumMismatch` and cleans up the temp file.
- **Unit (Rust)**: Range-resume produces the same final SHA256 as a single-shot download.
- **Integration (Playwright)**: Mock the manifest endpoint, stub a small model download, assert ModelManager UI walks through download → verify → install.
- **Manual**: Disconnect Wi-Fi mid-download, reconnect, verify the second attempt resumes rather than restarting.
- **Manual**: Replace `manifest.json.sig` with an invalid signature, assert app rejects the manifest with a clear log line.

## 12. Decommissioning Hugging Face dependency

After 1.0.0 ships:
- 1.0.0 — both paths supported (R2 primary, HF as a final fallback).
- 1.1.0 — HF fallback removed.

This protects against a manifest-server outage during the first 8 weeks while the R2 stack is being battle-tested.

## 13. Model-rev releases (independent of app rev)

Process to ship a new model (e.g. integrating a new Whisper variant):

1. Upload the model `.bin` to `r2://dictivo-models/v1/files/`.
2. Compute SHA256, edit `manifest.json` to add the entry, set `pub_date`.
3. `cosign` or `minisign` over the new `manifest.json` → `manifest.json.sig`.
4. Upload both.
5. The change is **live in 24 h** for every user worldwide, no app update required.

This is the operational core of the renewal-fee value proposition: "for $24/year we keep delivering you new models."
