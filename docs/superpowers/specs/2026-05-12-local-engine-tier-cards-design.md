# Local Engine Tier Cards — Design

**Status:** Draft for review
**Date:** 2026-05-12
**Scope:** Settings → Local Engine surface only. Plus a one-line Rust fix for Vietnamese language routing.

---

## 1. Goals

- **Fix the silent "Re-run setup" bug.** Today clicking it only deletes the benchmark cache via `rerun_benchmark`; no benchmark re-runs. Users see no visible change.
- **Rename `Slow` → `Quality`** in the display layer (tier ID stays `"slow"` in code). Update sub-lines for all three tiers to set expectations honestly.
- **Make the three tier cards clickable** so users have a second path to pick / download a model — direct manipulation instead of only the setup wizard's auto-recommendation.
- **Always render all three tier cards** instead of hiding tiers that exceed the hardware budget. Show them with a warning treatment + a confirm dialog before activating.
- **Wire Vietnamese (`vi`) through `whisper.cpp`** instead of silently falling back to `-l en`.

---

## 2. Non-goals

- Tier ID changes: `Tier::Fast`, `Tier::Medium`, `Tier::Slow` stay in the Rust enum and `"fast" | "medium" | "slow"` in TypeScript. Only the human-visible display string flips for `slow`.
- Onboarding wizard flow: untouched. The wizard still does its three-step flow on first launch and is still reachable via "Settings → Local Engine → Re-run setup → Run setup wizard" (a sub-action, see §4).
- Settings store schema (v4) is unchanged. `selectedTier` stays `"fast" | "medium" | "slow"`.
- DictationWorkbench's inline tier chips still render the new display names but its layout and behavior are unchanged.
- No new Tauri commands are introduced — we extend the existing `RunnableTiers` payload only.

---

## 3. Copy

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ⌖ Local Engine                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│  ╔════════════════════════════════════════════════════════════════════╗   │
│  ║ Recommended for your hardware                                      ║   │
│  ║ large-v3-turbo-q5_0 · 14 cores · 48 GB RAM                         ║   │
│  ║ ┌──────────────┐                                                   ║   │
│  ║ │ Re-run setup │  ← spinner state during re-benchmark              ║   │
│  ║ └──────────────┘                                                   ║   │
│  ╚════════════════════════════════════════════════════════════════════╝   │
│                                                                            │
│  ┌─────────────────────┬────────────────────────┬───────────────────────┐ │
│  │ Fast                │ Medium       ● Active  │ Quality               │ │
│  │ Quicker · may       │ Recommended            │ Most accurate ·       │ │
│  │ sacrifice quality   │                        │ may take longer       │ │
│  │ base · ~142 MB      │ large-turbo · ~600 MB  │ large-v3 · ~3.1 GB    │ │
│  │ ↓ Download          │                        │ ⚠ may be slow         │ │
│  └─────────────────────┴────────────────────────┴───────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

| Tier id | Display name | Sub-line |
| --- | --- | --- |
| `fast` | Fast | Quicker · may sacrifice quality |
| `medium` | Medium | Recommended |
| `slow` | **Quality** | Most accurate · may take longer |

The new tier display strings live in a single `TIER_DISPLAY` constant in `apps/desktop/src/lib/tierDisplay.ts` so both `ModelManager.tsx` (Settings cards) and `DictationWorkbench.tsx` (inline chips) read from the same source of truth.

---

## 4. Re-run setup

### Behavior

Click → button label changes to `Measuring…` + a spinner glyph, button disabled.

```
async function handleRerunSetup() {
  setStatus("measuring");
  try {
    await rerunBenchmark();              // existing: deletes cache JSON
    const mediumModelId = runnableTiers.medium.modelId;
    if (!isInstalled(mediumModelId)) {
      throw new Error("Medium model not installed — pick a tier below to download.");
    }
    const rtf = await benchmarkTier(mediumModelId);
    const tiers = await finalizeCalibration(rtf, mediumModelId);
    setRunnableTiers(tiers);
    setStatus("done");
  } catch (error) {
    setStatus("error", error.message);
  }
}
```

### Edge cases

- **No model installed.** Button shows inline error: `Install a model first by picking a tier below.` Three tier cards remain interactive — user clicks one to download.
- **Benchmark times out** (the 30 s timeout already in `benchmark_tier`). Inline error: `Benchmark didn't finish in 30 s. Try a smaller model.`
- **Hardware fingerprint changed since last cache** (e.g., RAM upgrade, GPU added). The existing `runnable_tiers` already detects fingerprint mismatch and returns empty; the re-benchmark uses the *current* fingerprint when writing the new cache. No special handling needed.

### Sub-action: open the wizard

Below the spinner button, add a small text link: `Run setup wizard instead →`. Clicking it sets `onboardingCompleted = false` in `App.tsx` state (not in storage — we don't want to lose the user's progress permanently), which re-mounts `<OnboardingWizard>`. When they finish (or skip), `onComplete` runs and `onboardingCompleted = true` again.

This is the escape hatch for users whose machine has nothing installed and `Re-run setup` can't help.

---

## 5. Tier card click behavior

```
Click a tier card →

  Currently selected
    └─► No-op. Card shows "● Active" badge.

  Downloaded & within budget, not selected
    └─► Call selectPrivateFastModel(assignment.modelId)
        update settings.selectedTier = thisTier
        Card flips to Active.

  Not downloaded & within budget
    └─► Confirm dialog: "Download {label} (~{sizeLabel})?"
        Yes →
          • setStatus(tier, "downloading")
          • await downloadPrivateFastModel(assignment.modelId)
          • await benchmarkTier(assignment.modelId)   // updates this tier's RTF
          • await finalizeCalibration(measuredMediumRtf, mediumModelId)
              ↳ writes a fresh RunnableTiers including the newly-downloaded tier
          • setRunnableTiers(...)
          • selectPrivateFastModel(...)               // make it active
          • setStatus(tier, "active")
        No → no-op

  Out of budget (within_budget=false), download status irrelevant
    └─► Warning confirm: "{label} may run slowly on your hardware.
                          30 s of audio could take roughly {rtf}× realtime.
                          Continue?"
        Yes → same flow as "Not downloaded & within budget" (download if needed,
              benchmark, select)
        No  → no-op
```

### Per-card visual state

| State | Card treatment |
| --- | --- |
| Active | Purple border (`var(--accent)`), `● Active` badge top-right in accent color, full opacity. |
| Downloaded, not active | Default surface, hairline border, hover lifts subtly. |
| Not downloaded, within budget | Default surface, top-right shows `↓ Download` hint in muted purple. |
| Out of budget | Card opacity `0.6`, top-right shows `⚠ may be slow` in `--warning` color (`#f9c440`). Still clickable. |
| Downloading | Card spinner overlay + label changes to `Downloading…` then `Measuring…`. Other cards stay clickable. |

### Confirm dialog

Inline overlay inside the side-panel, not a `window.confirm`. Reuses the existing `.status-banner` styling. Confirms the action with two buttons (Cancel / Download or Continue). Auto-dismisses after a successful action.

---

## 6. Backend changes (Rust)

### 6.1 `TierAssignment` gains a `within_budget` field

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierAssignment {
    pub model_id: String,
    pub realtime_factor: f32,
    pub predicted: bool,
    pub downloaded: bool,
    pub within_budget: bool,   // NEW
}
```

### 6.2 `RunnableTiers` fields become non-Option

Today each of `fast`, `medium`, `slow` is `Option<TierAssignment>` and gets `None` when over budget. We change them to always be `Some` — `build_runnable_tiers_with_rtfs` now returns all three tier assignments with the `within_budget` flag reflecting the budget check.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnableTiers {
    pub fast: TierAssignment,
    pub medium: TierAssignment,
    pub slow: TierAssignment,
    pub fingerprint: String,
    pub benchmarked_at: String,
}
```

`build_runnable_tiers_with_rtfs` simplifies: drop the budget-gated `if`, drop the force-show-Fast edge case (no longer needed since we never omit tiers).

### 6.3 Backward compat on cache load

`runnable_tiers()` reads `benchmark.json`. Old cached files use the previous shape (Option fields, no `within_budget`). On deserialize failure, return an empty-ish payload as today (forces a re-benchmark) — same behavior as fingerprint mismatch.

To make the migration smoother, also implement a fallback parse path: if the new struct fails to deserialize, try parsing as the old shape and convert — Option<None> tiers get synthesized via `default_model_for_tier` with `within_budget: false` (because they were originally hidden for being over budget). This avoids forcing a re-benchmark for users with healthy caches.

### 6.4 `whisper_language` adds `"vi"`

```rust
fn whisper_language(language: &str) -> &str {
    match language {
        "zh" => "zh",
        "ja" => "ja",
        "es" => "es",
        "fr" => "fr",
        "de" => "de",
        "vi" => "vi",   // NEW
        _ => "en",
    }
}
```

One-line fix. Closes the bug where Vietnamese (`vi`) silently fell back to English in Whisper, producing garbage transcripts for Vietnamese audio.

---

## 7. Frontend changes (TS)

### 7.1 New file: `apps/desktop/src/lib/tierDisplay.ts`

```typescript
import type { Tier } from "./desktopBridge";

export const TIER_DISPLAY: Record<Tier, { name: string; sub: string }> = {
  fast: { name: "Fast", sub: "Quicker · may sacrifice quality" },
  medium: { name: "Medium", sub: "Recommended" },
  slow: { name: "Quality", sub: "Most accurate · may take longer" }
};
```

Both `DictationWorkbench.tsx` and `ModelManager.tsx` import this.

### 7.2 `desktopBridge.ts` type updates

```typescript
export type TierAssignment = {
  modelId: string;
  realtimeFactor: number;
  predicted: boolean;
  downloaded: boolean;
  withinBudget: boolean;   // NEW
};

export type RunnableTiers = {
  fast: TierAssignment;       // was: TierAssignment | null
  medium: TierAssignment;
  slow: TierAssignment;
  fingerprint: string;
  benchmarkedAt: string;
};
```

Web-preview fallback in `getRunnableTiers()` is updated to fill all three tiers with `withinBudget` flags reflecting plausible web-preview data (fast=true, medium=true, slow=false).

### 7.3 `DictationWorkbench.tsx` reuses `TIER_DISPLAY`

The inline `TIER_META` constant in `DictationWorkbench.tsx` is replaced by the import. The available-tiers filter (`runnableTiers[id] !== null`) becomes `runnableTiers[id].withinBudget` — inline chips still only show tiers the hardware can run, since the inline strip is space-constrained.

### 7.4 `ModelManager.tsx` rewrite

The tier card layout is rewritten to:

- Always render all three cards (no `if (!assignment) { dimmed card }` branch since assignment is always defined now).
- Each card is a real `<button>` with click handler.
- Cards reflect the 5 visual states above via CSS classes (`is-active`, `is-downloading`, `is-out-of-budget`, etc.).
- A new sub-component `<TierCard>` lives inside the same file (no new component file).

The inline confirm overlay is a new helper component, also in this same file:

```tsx
function ConfirmInline({ title, body, confirmLabel, onConfirm, onCancel }) {
  // Renders a slot inside the Local Engine panel with two buttons.
}
```

When active, it sits above the tier card grid and dims the grid until resolved.

### 7.5 `App.tsx` re-wire

Currently `handleTierChange` lives in `App.tsx` and is called by `DictationWorkbench`'s inline chip. The same handler should be reachable from `ModelManager` tier card clicks. Pass `handleTierChange` down to `<SettingsView>` → `<ModelManager>` as a new prop `onTierChange`. The "Re-run setup" handler is a new `handleRerunBenchmark` function in `App.tsx`, also passed down.

App.tsx adds:

```tsx
const [rerunStatus, setRerunStatus] = useState<"idle"|"measuring"|"error">("idle");
const [rerunError, setRerunError] = useState("");

const handleRerunBenchmark = useCallback(async () => { /* as in §4 */ }, [...]);
```

And passes both `onTierChange` (the existing `handleTierChange`) + `onRerunBenchmark` + `rerunStatus` + `rerunError` into `<SettingsView>` → `<ModelManager>`.

### 7.6 CSS additions in `app.css`

A small block under the existing `.tier-card` rule — `.tier-card.is-active`, `.tier-card.is-out-of-budget`, `.tier-card .download-hint`, `.tier-card .warning-hint`, `.tier-card .active-badge`, `.tier-card[disabled]`, plus the inline confirm overlay styles. Estimated +120 lines.

---

## 8. Testing

### Unit (vitest, in `apps/desktop/tests/`)

Add to `componentsStatic.test.tsx`:
- Renders 3 tier cards always (no "Not available on this hardware" string).
- The `slow` tier card shows the label **Quality** (not "Slow") and the sub "Most accurate · may take longer".
- The `fast` tier card sub-line is "Quicker · may sacrifice quality".
- A tier card marked `withinBudget: false` shows the `⚠ may be slow` text.
- A tier card marked `downloaded: true` and the active tier shows the `● Active` badge.

### E2E (Playwright, `apps/desktop/e2e/`)

Update `advanced-override.spec.ts` (or add a new `tier-cards.spec.ts`):
- Settings → Local Engine renders Fast / Medium / Quality cards.
- Click a tier card not currently selected → confirm dialog renders.
- Cancel → state unchanged.
- Existing `tier-switch.spec.ts` still passes (the inline tier-chip in DictationWorkbench is unchanged behavior-wise).

### Rust (in `private_fast.rs` test module)

- `build_runnable_tiers_with_rtfs` returns all three assignments, with `within_budget` correctly true / false for known ratio inputs.
- Backward-compat: old-shape `benchmark.json` (Option<TierAssignment>) loads and synthesizes the missing fields without panicking.
- `whisper_language("vi") == "vi"`.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Old `benchmark.json` caches in the field fail to deserialize, forcing every existing user to re-benchmark on the next launch. | Fallback parse path in `runnable_tiers()` reads the old shape and synthesizes missing fields (§6.3). |
| User clicks a tier whose model isn't installed; download fails (network). | Inline error toast inside the card; revert state to pre-click; tier card remains clickable for retry. |
| User clicks the over-budget tier and runs a transcription that takes 10 minutes. | Confirm dialog warns with predicted RTF before download; existing in-flight transcribe timeout (`benchmark_tier`'s 30 s) protects the calibration step. The actual dictation run has no timeout (today's behavior). Leave dictation-time timeout as out-of-scope. |
| Renaming `Slow` → `Quality` confuses returning users who knew the old label. | Display-name only — tier id `"slow"` is unchanged, so settings persist correctly. The change is purely visual and the new label is more honest. |
| `vi` users on existing `benchmark.json` caches keep using the old wrong English model. | The Rust fix takes effect immediately on next dictation invocation; no cache invalidation needed (the language flag is not cached, it's passed per-dictation). |

---

## 10. Files Touched

**Modified:**
- `apps/desktop/src-tauri/src/private_fast.rs` — `whisper_language` adds `vi`; `TierAssignment` adds `within_budget`; `RunnableTiers` fields become non-Option; `build_runnable_tiers_with_rtfs` simplifies and removes budget gate; `runnable_tiers()` cache load supports old-shape fallback.
- `apps/desktop/src/lib/desktopBridge.ts` — `TierAssignment.withinBudget`, `RunnableTiers` non-nullable fields, web-preview fallback updated.
- `apps/desktop/src/App.tsx` — adds `handleRerunBenchmark`, `rerunStatus`, `rerunError` state; passes `handleTierChange` + `handleRerunBenchmark` + `rerunStatus` + `rerunError` to SettingsView.
- `apps/desktop/src/components/SettingsView.tsx` — receives and forwards the new props.
- `apps/desktop/src/components/ModelManager.tsx` — clickable tier cards with 5 visual states, inline confirm component, uses `TIER_DISPLAY`.
- `apps/desktop/src/components/DictationWorkbench.tsx` — inline `TIER_META` replaced by `TIER_DISPLAY` import.
- `apps/desktop/src/styles/app.css` — `.tier-card` variants and the inline confirm overlay.
- `apps/desktop/tests/componentsStatic.test.tsx` — assertions for new copy + states.
- `apps/desktop/e2e/tier-switch.spec.ts` or new `apps/desktop/e2e/tier-cards.spec.ts` — click flow.

**Created:**
- `apps/desktop/src/lib/tierDisplay.ts` — single-source `TIER_DISPLAY` constant.

**Deleted:** none.

---

## 11. Definition of Done

- `npm run typecheck -w @dictivo/desktop` → 0 errors
- `npm run test` → all green (existing 54 vitest + new assertions)
- `npm run e2e -w @dictivo/desktop` → all green
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` → all green (existing 23 + Vietnamese mapping + tier-assignment with_budget assertions)
- `npm run tauri:build -w @dictivo/desktop` → produces a .app where:
  - Settings → Local Engine shows three cards labeled Fast / Medium / **Quality**
  - Clicking the active tier is a no-op
  - Clicking a downloaded non-active tier flips Active immediately
  - Clicking a not-downloaded tier opens an inline confirm; confirming downloads + benchmarks + selects
  - Clicking an out-of-budget tier opens a warning confirm with the predicted slowdown
  - Re-run setup runs silently, label changes to "Measuring…", finishes in seconds (no model download), state refreshes
  - Selecting `Tiếng Việt` in the language chip and dictating Vietnamese audio produces Vietnamese text (not English garbage)
