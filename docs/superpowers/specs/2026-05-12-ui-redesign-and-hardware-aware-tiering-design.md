# UI Redesign + Hardware-Aware Tiering — Design

**Status:** Draft for review
**Date:** 2026-05-12
**Affects:** `apps/desktop` (React + Rust), `packages/shared` (minor)

---

## 1. Goals & Scope

Convert Dictivo from an engineer-flavored UI (7 raw models × 3 profiles × cyberpunk-neon shell × telemetry grid) into a tool a non-technical user can adopt in 60 seconds:

1. Surface exactly three engine tiers — **Fast / Medium / Slow** — instead of raw model names + profile dropdowns.
2. Tier availability is decided per-machine. The UI **only shows tiers the hardware can actually run** (no greying-out, no aspirational buttons).
3. Auto-detect GPU presence (Apple Silicon Metal, NVIDIA CUDA, AMD ROCm, Intel/discrete on x86 Mac, DirectML on Windows) and use it as a primary input to tier mapping.
4. Repaint the entire UI in a **Calm Native** light style (system fonts, single-accent blue, no neon, no grid, no telemetry-by-default).
5. Repaint the floating Companion window so the cartoon avatar (dog / cat / Trump) is a **standalone cutout** with a separate info bubble — not embedded in a card.
6. Keep all current functionality (history, dictionary, snippets, hotkeys, paste flow) reachable; advanced power-user controls (raw model catalog, profile, import .bin) are preserved but hidden behind an "Advanced" disclosure in Settings.

**Out of scope**

- Cloud transcription (Dictivo stays local-first).
- New model formats beyond what `whisper.cpp` already supports.
- API app (`apps/api`) — untouched.

---

## 2. Tier Model & Hardware Detection

### 2.1 What the user sees

| Tier   | What it means                                       | Latency target          |
| ------ | --------------------------------------------------- | ----------------------- |
| Fast   | Lowest latency, lighter quality                     | 30 s audio → ≤ 30 s out |
| Medium | Default — best balance for the machine              | 30 s audio → ≤ 60 s out |
| Slow   | Highest accuracy, slower                            | 30 s audio → ≤ 2 min    |

Tier names are **constant**; the model behind each tier varies by hardware.

### 2.2 Performance classes

Replaces today's `low | mid | high` strings:

| Class       | Signals                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `GpuHigh`   | Apple Silicon (`aarch64` macOS), **or** ≥ 8 GB VRAM dGPU, AND ≥ 16 GB RAM    |
| `CpuStrong` | ≥ 8 cores AND ≥ 16 GB RAM, no qualifying GPU                                 |
| `CpuWeak`   | Everything else                                                              |

### 2.3 Tier → model matrix

```rust
fn default_model_for_tier(class: PerformanceClass, tier: Tier) -> &'static str {
    match (class, tier) {
        (GpuHigh,   Fast)   => "small",
        (GpuHigh,   Medium) => "large-v3-turbo-q5_0",
        (GpuHigh,   Slow)   => "large-v3",
        (CpuStrong, Fast)   => "base",
        (CpuStrong, Medium) => "small",
        (CpuStrong, Slow)   => "large-v3-turbo-q5_0",
        (CpuWeak,   Fast)   => "tiny",
        (CpuWeak,   Medium) => "base",
        (CpuWeak,   Slow)   => "small",
    }
}
```

### 2.4 Runnable detection (performance threshold)

A tier is "runnable" iff its **real-time factor (RTF)** ≤ tier budget:

- Fast: RTF ≤ 1.0×
- Medium: RTF ≤ 2.0×
- Slow: RTF ≤ 4.0×

**Benchmark strategy** (bounded cost): the onboarding wizard downloads and benchmarks **only the Medium-tier model**. Fast/Slow RTFs are *predicted* from the measured Medium RTF using empirically-derived ratios:

| Predicted from Medium RTF | base    | small   | medium-q5 | large-turbo-q5 | large-v3 |
| ------------------------- | ------- | ------- | --------- | -------------- | -------- |
| ratio                     | ×0.4    | ×0.7    | ×1.1      | ×1.5           | ×2.5     |

When a user later switches to an unbenchmarked tier, that tier's model downloads and is benchmarked for real, replacing the prediction. Predictions are stored as `predicted: true` so the UI can distinguish.

A tier with predicted-or-measured RTF outside its budget is **omitted from the UI entirely** (not disabled).

**Edge case — zero runnable tiers.** If even Fast on `CpuWeak` exceeds the 1.0× budget (e.g. very old CPU + `tiny` still > 1.0× RTF), we force-show **Fast** anyway and append a warning to the footer status line: `"This model may be slow on your hardware"`. We never render an empty tier selector — the user must always be able to dictate.

### 2.5 GPU detection (filling current gaps)

| Platform          | Today                            | New                                                              |
| ----------------- | -------------------------------- | ---------------------------------------------------------------- |
| macOS `aarch64`   | Metal (kept)                     | unchanged                                                        |
| macOS `x86_64`    | none                             | `system_profiler SPDisplaysDataType` → look for AMD/Radeon/Vega  |
| Windows           | `nvidia-smi`, `vulkaninfo`, etc. | + WMI `Win32_VideoController.AdapterRAM` for VRAM size           |
| Linux             | (nothing)                        | `nvidia-smi`, `rocm-smi`, `/proc/driver/nvidia/version` presence |

A detected GPU bumps the machine into `GpuHigh` *only if* it advertises ≥ 8 GB VRAM (where reported) or is Apple Silicon. Otherwise it just informs the user during onboarding ("GPU detected but unused for inference at this size").

### 2.6 Hardware fingerprint & cache

`fingerprint = SHA256(cpu_model_name || total_ram_bytes || gpu_names_joined)`

Cache at `{app_local_data_dir}/benchmark.json`:

```json
{
  "fingerprint": "ab12...",
  "benchmarked_at": "2026-05-12T10:14:00Z",
  "fast":   { "model_id": "small", "realtime_factor": 0.65, "predicted": false, "downloaded": true },
  "medium": { "model_id": "large-v3-turbo-q5_0", "realtime_factor": 0.85, "predicted": false, "downloaded": true },
  "slow":   { "model_id": "large-v3", "realtime_factor": 2.1, "predicted": true, "downloaded": false }
}
```

`fingerprint` mismatch ⇒ cache discarded, re-benchmark triggered. Manual re-run via Settings → Local Engine → "Re-run setup".

---

## 3. First-Run Wizard (3 steps)

### Step 1 — Hardware scan (2-3 s)

Probe hardware via `hardware_profile()` + `detect_gpu()`. Display readable summary:

> "Apple M3 Pro · 18 GB · Metal GPU detected"
> "Continue →"

Probe failures degrade silently to `CpuWeak` and the wizard still advances.

### Step 2 — Pick default model

Recommend the single Medium-tier model for the detected class. Show:

- model label + disk footprint ("Recommended: small · ~470 MB")
- one-line rationale ("best balance for your hardware")
- primary: `Download (Recommended)`
- secondary expanded: `Use a smaller model instead` (`base`/`tiny`), `Import a .bin file`

Pre-flight: free-disk check. If insufficient, block download and offer import.

### Step 3 — Quick calibration (~5 s)

After download succeeds, run the bundled 5-second WAV sample through the downloaded model. Measure RTF. Compute predicted Fast/Slow availability from the Medium RTF + ratio table. Persist `RunnableTiers` to cache.

Closing line:
> "Ready. Your computer can run **Medium** smoothly. Fast and Slow are also available."
> *or* "Only Medium is available on this hardware."
> Button: `Start dictating →`

User can dismiss the wizard at any step (writes `onboardingCompleted: true`, uses CpuWeak/Fast/tiny fallback until user revisits Settings).

---

## 4. UI Redesign — Calm Native

### 4.1 Design language

- **Theme:** light by default, follows `prefers-color-scheme` (dark variant is a calm neutral grey, **not** the current cyberpunk).
- **Typography:** `-apple-system` / `Segoe UI Variable` system stack; no custom display fonts.
- **Color:** one accent — iOS blue `#007AFF` on mac, `#0067C0` on Windows. Danger `#ef4444`. Neutral surfaces `#ffffff` / `#f4f5f7` / `#e5e7eb`.
- **Removed:** grid background, scanlines, neon glow, multi-stop gradients on every surface, `body::before`/`body::after` decorations, inset-shadow stacks.
- **Shape:** 8 px / 12 px radii; one tier of shadow (`0 1px 3px rgba(0,0,0,.06)`).

### 4.2 Main shell

- Sidebar width 268 → 220 px. Drop the "Local AI dictation" subtitle and the decorative `privacy-chip`.
- Four nav items unchanged: Dictation / History / Dictionary / Settings.

### 4.3 Dictation page

- Top row: mode pills (Message / Email / Raw / Prompt) — black-on-white selected, light gray outline default.
- Centered white card containing: large round blue mic button, hint text "Press ⌥+Space to start, or click the mic". After recording the card becomes the editable transcript surface.
- Below card: **TierSelector** — 1, 2, or 3 buttons depending on `RunnableTiers`.
- Bottom: single 11 px gray status line, e.g. `Medium · small · Metal · ⌥Space ready · Transcript stays on this device`.
- **Removed:** the entire right-side `engine-panel` telemetry grid (Words / Profile / Model / Accel / Hardware / Hotkey).

### 4.4 Settings → Local Engine

```
┌ Recommended for your hardware ────────────────┐
│  Medium · small (~470 MB) · Metal             │
│  Re-run setup                                  │
└────────────────────────────────────────────────┘

┌ Fast ─────────┐ ┌ Medium ───────┐ ┌ Slow ─────────┐
│ small (~470M) │ │ large-turbo   │ │ large-v3      │
│ Lowest        │ │ Recommended ✓ │ │ Most accurate │
│ latency       │ │               │ │               │
└───────────────┘ └───────────────┘ └───────────────┘

▸ Advanced
   (full 7-model catalog, manual profile select,
    import .bin, manual model paths)
```

- Top "Auto / Manual" select is removed — auto is default; opening Advanced is the manual path.

### 4.5 Settings overall

5 sections → 4: Engine / Hotkeys / Companion / Privacy. The Processing toggles (auto-polish, spoken punctuation, filler removal, smart caps) fold back into Engine → Advanced.

### 4.6 Companion floating window

**Layout shift:** instead of one card with avatar-inside, the companion is a **transparent window** containing two visually separate elements:

```
┌────────────────────────────────────────────┐
│                                            │
│  ╱──╲    ┌─────────────────────────────┐  │
│ ╱ 🐶 ╲   │ Recording                   │  │
│ ╲    ╱   │ 00:14                       │  │
│  ╲__╱    │ ⌥+Space to stop            │  │
│          └─────────────────────────────┘  │
│                                            │
└────────────────────────────────────────────┘
```

- Window: `transparent: true, decorations: false, shadow: false`, ~360×100, always-on-top.
- **Left:** existing `DogAvatar` SVG (`CompanionWindow.tsx:119-131`), `CatAvatar` SVG (`CompanionWindow.tsx:134-146`), or `trumpAvatarImage` PNG — **reused as-is**, no circular frame, transparent background, `drop-shadow` filter for lift.
- **Right:** small white rounded-rect bubble with thin shadow, max ~280 px wide. Bubble has a small triangular tail pointing at the avatar. Top-edge of bubble carries a colored phase indicator strip (red / blue / green / amber).
- Whole window is the drag handle; close `×` shows on hover only.

**Animations** drive the *avatar*, not the bubble:

| Phase      | Avatar                                       | Emote bubble (top-right of avatar) |
| ---------- | -------------------------------------------- | ---------------------------------- |
| idle       | static                                       | —                                  |
| recording  | breathe (translateY ±3 px, 1.4 s)            | red ● (mic)                        |
| processing | slight L-R sway                              | blue …                             |
| complete   | static                                       | green ✓ (1.5 s)                    |
| error      | static                                       | amber !                            |
| blocked    | static                                       | amber !                            |

Settings → Companion: enable toggle + avatar picker (dog/cat/trump) unchanged.

**Linux WM transparency fallback:** if `transparent: true` fails at runtime, window falls back to opaque #f9fafb with a 1 px border — function preserved.

### 4.7 Onboarding wizard styling

- Centered modal card, 480 × 360 px, no sidebar around it.
- Steps indicator at top (1•2•3).
- Same Calm Native tokens as main shell.

---

## 5. Implementation Architecture

### 5.1 Rust (`apps/desktop/src-tauri/src/private_fast.rs`)

New types:

```rust
pub enum Tier { Fast, Medium, Slow }
pub enum PerformanceClass { GpuHigh, CpuStrong, CpuWeak }

pub struct TierAssignment {
    pub model_id: String,
    pub realtime_factor: f32,
    pub predicted: bool,
    pub downloaded: bool,
}

pub struct RunnableTiers {
    pub fast: Option<TierAssignment>,
    pub medium: Option<TierAssignment>,
    pub slow: Option<TierAssignment>,
    pub fingerprint: String,
    pub benchmarked_at: String,
}
```

New helper functions (private):

- `compute_performance_class(cores, ram_bytes, gpus) -> PerformanceClass`
- `predict_rtf_from_medium(model_id, medium_rtf) -> f32`
- `compute_fingerprint(cpu_model, ram_bytes, gpu_names) -> String`

New Tauri commands:

- `detect_gpu() -> GpuInfo` — name + vram_bytes (per device, list)
- `benchmark_tier(model_id: String) -> f32` — runs bundled WAV, returns RTF
- `runnable_tiers() -> RunnableTiers` — reads cache if fingerprint matches, else re-derives
- `rerun_benchmark()` — clears cache, re-runs
- Existing: `hardware_profile()` — keep, extend with new `performance_class` enum

Bundled benchmark sample at `apps/desktop/src-tauri/resources/benchmark-5s.wav` (~50 KB).

Cache file: `{app_local_data_dir}/benchmark.json`.

### 5.2 Frontend (`apps/desktop/src`)

**Settings store (`lib/settingsStore.ts`)**

Add:
- `selectedTier: "fast" | "medium" | "slow"` (default `"medium"`)
- `onboardingCompleted: boolean` (default `false`)

Remove:
- `privateFastProfile`
- `modelSelectionMode`

Migration in `loadSettings()`:
- `privateFastProfile === "fast"` → `selectedTier = "fast"`
- `privateFastProfile === "balanced"` → `selectedTier = "medium"`
- `privateFastProfile === "quality"` → `selectedTier = "slow"`

**Bridge (`lib/desktopBridge.ts`)**

Add: `getRunnableTiers()`, `benchmarkTier(modelId)`, `rerunBenchmark()`.

**App.tsx**

```tsx
if (!settings.onboardingCompleted) return <OnboardingWizard ... />;
return <MainShell ... />;
```

Tier change handler calls existing `selectPrivateFastModel(tierAssignment.model_id)` under the hood — keeps the existing transcribe pipeline contract intact.

**New components**
- `components/OnboardingWizard.tsx` — 3 steps, uses existing bridge functions
- `components/TierSelector.tsx` — renders 1/2/3 buttons from `RunnableTiers`

**Rewritten components**
- `components/ModelManager.tsx` — Recommended card + 3 tier cards + collapsible Advanced
- `components/DictationWorkbench.tsx` — drop telemetry aside, add TierSelector, add footer status line
- `components/CompanionWindow.tsx` — separate avatar wrap from bubble; use existing SVG/PNG verbatim
- `components/SettingsView.tsx` — 5 sections → 4

**Tauri config** (`apps/desktop/src-tauri/tauri.conf.json`)

Companion window block gains:
```json
{ "transparent": true, "decorations": false, "shadow": false, "width": 360, "height": 100 }
```

**Stylesheet** (`apps/desktop/src/styles/app.css`)

Largely rewritten. Goal: down from ~1683 lines to ~700-900 lines. Delete the entire cyberpunk decoration system (grid backgrounds, scanlines, neon glow, multi-stop gradients, body::before/::after). Keep layout primitives. Add `@media (prefers-color-scheme: dark)` block for the calm dark variant.

### 5.3 Data flow at runtime

```
App start
  ├─ loadSettings()
  │   └─ migrate v2/v3 → v4 if needed
  ├─ if !onboardingCompleted:
  │     OnboardingWizard
  │       ├─ Step 1: hardware_profile() + detect_gpu()
  │       ├─ Step 2: download_private_fast_model(recommended_id)
  │       └─ Step 3: benchmark_tier(recommended_id) → persist RunnableTiers
  │   onboardingCompleted = true
  └─ MainShell
       ├─ runnable_tiers() (from cache)
       ├─ render TierSelector with available tiers
       └─ user records → runLocalDictation(...) (existing path)

User switches tier
  ├─ if target tier's model not downloaded:
  │     confirm dialog
  │       ├─ confirm → download_private_fast_model() → benchmark_tier()
  │       │              (on success: tier becomes active; on failure: revert
  │       │               to previous tier, surface error in footer)
  │       └─ cancel  → no state change (previous tier remains active)
  └─ else:
        select_private_fast_model(tierAssignment.model_id)
```

---

## 6. Error Handling

| Failure                                | Handling                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `detect_gpu` command missing / timeout | Silent CPU-only fallback; benchmark will measure true capability                                                      |
| `total_memory_bytes` unavailable       | Assume 8 GB → `CpuWeak`                                                                                               |
| Whole hardware probe > 3 s             | Force `CpuWeak`, reason: "Probe timed out"; wizard still advances                                                     |
| `whisper-cli` missing / crash          | Wizard shows "Couldn't run a quick check on your machine. Using a safe default." Force `CpuWeak`, all RTFs marked 0   |
| Benchmark runs > 30 s                  | Kill; treat as timeout (same as above)                                                                                |
| Model download network error           | Retry button + "Import a .bin file" path (uses existing `importPrivateFastModel`)                                     |
| Insufficient disk space                | Pre-flight check (`disk_free(models_dir) < model_size + 100 MB`). Block download, surface "Need X MB free, have Y MB" |
| Interrupted download                   | `.partial` files cleaned at next boot                                                                                 |
| Tier switch to undownloaded model      | Inline confirm dialog before download                                                                                 |
| Settings v2/v3 corrupted               | catch + fall to defaults; console warn; never block boot                                                              |
| `benchmark.json` corrupted             | Delete and re-benchmark                                                                                               |
| Companion transparency unsupported     | Opaque fallback (light gray + 1 px border)                                                                            |
| Companion `emit` to closed main window | Silent; retry on next emit                                                                                            |

**Invariant:** every failure path still lets the user dictate, even if only with CPU + `tiny`. No error screen ever traps the user.

---

## 7. Testing

### 7.1 Rust unit tests

- `default_model_for_tier`: full 9-row table-driven test (3 classes × 3 tiers)
- `compute_performance_class`: 6 representative (cores, RAM, GPU) inputs → expected class
- `predict_rtf_from_medium`: boundary values (Medium RTF = 0.5 / 1.0 / 2.0) → expected per-model predictions and which tiers should be included
- `fingerprint_hash`: same input → same digest; any single field changed → different digest
- `parse_gpu_info` per platform: feed canned `system_profiler` / `nvidia-smi` / WMI outputs, assert struct

### 7.2 TS unit tests (vitest)

- `settingsStore` migration: legacy `privateFastProfile: "balanced"` → `selectedTier: "medium"`; missing fields fall to defaults
- `TierSelector`: with `RunnableTiers` containing 1 / 2 / 3 entries, asserts button count and labels
- `OnboardingWizard`: step transitions, mid-flow dismissal, retry on download failure
- `companion.ts buildCompanionSnapshot`: 5 phases × 3 avatars produce stable snapshots (snapshot test)

### 7.3 E2E (Playwright, `apps/desktop/e2e/`)

Three new scenarios:

1. **First run** — clear settings → wizard renders → walk through 3 steps → land on main → assert TierSelector has expected count
2. **Tier switch** — switch tier in main → assert footer status updates and subsequent recording uses new model
3. **Advanced override** — Settings → Local Engine → expand Advanced → pick model from raw catalog → TierSelector hides (manual mode)

### 7.4 Manual test matrix (`docs/test-matrix.md`)

Add columns: `performance_class` / `runnable_tiers_expected` / `verified`. Rows:

- macOS M3 16 GB
- macOS Intel 16 GB (dGPU + no dGPU)
- Windows + RTX 3060
- Windows CPU-only (8 cores, 16 GB)
- Linux + CUDA
- Linux CPU-only

### 7.5 Lightweight visual regression

Playwright screenshots of 5 key surfaces stored under `apps/desktop/e2e/__screenshots__/`:
- Wizard steps 1, 2, 3
- Main dictation page (idle, recording)
- Companion window per phase

Used as a baseline. Diffs surface as PR comments; not a hard CI gate.

### 7.6 Prediction accuracy spot-check

Take 3 real machines (one per class). Run a real 30-second sample through every candidate model. Compare predicted Fast/Slow RTF (from the Medium RTF + ratio table) against measured. If error > 50 %, retune the ratio table. Methodology and current ratios documented in `README.md` under "How Dictivo picks a model".

---

## 8. Out-of-band Notes

- `companion.ts` `CompanionSnapshot` contract is unchanged on the wire — only the consumer (`CompanionWindow.tsx`) is re-styled. This keeps `App.tsx` `companionSnapshot` building logic untouched.
- The raw `MODEL_CATALOG` array in `private_fast.rs` stays (Advanced still uses it). No model is removed from disk on upgrade.
- Existing global hotkey logic, paste flow, history persistence, dictionary, snippets, language selector — all unchanged.
- We do not introduce a new state-management library. State stays in `App.tsx` `useState` + `settingsStore` localStorage.

---
