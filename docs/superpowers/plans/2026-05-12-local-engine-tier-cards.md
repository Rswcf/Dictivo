# Local Engine Tier Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three Local Engine tier cards (Fast / Medium / Quality) clickable for direct download+select, fix the silent "Re-run setup" bug so it actually runs a benchmark, rename Slow→Quality in copy only, and fix the Vietnamese fallback in `whisper_language`.

**Architecture:** Single PR. Rust changes are surgical (one `match` arm + one struct field + one function simplification + backward-compat cache parse). TypeScript changes add one new file (`tierDisplay.ts`) and rewrite `ModelManager.tsx`'s tier card grid + add inline confirm overlay. App.tsx grows two new handlers (`handleRerunBenchmark`) and threads them through SettingsView to ModelManager. Functional behavior of dictation, wizard, hotkeys, settings store, companion windows — untouched.

**Tech Stack:** Tauri 2 (Rust), React 19 + TypeScript, Vite, Vitest, Playwright, whisper.cpp.

**Spec:** `docs/superpowers/specs/2026-05-12-local-engine-tier-cards-design.md`

---

## Repository Conventions

- All commands run from repo root unless noted.
- TS tests: `npm run test -w @dictivo/desktop`
- E2E: `npm run e2e -w @dictivo/desktop`
- Rust tests: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- Tauri build: `npm run tauri:build -w @dictivo/desktop`
- Commit per task. Subject ≤ 72 chars, imperative. Always include the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure (locked decomposition)

**Modified Rust:**
- `apps/desktop/src-tauri/src/private_fast.rs`
  - `whisper_language()` (line ~1080): add `"vi" => "vi"` arm before the `_ => "en"` fallback.
  - `TierAssignment` (line ~76): add `within_budget: bool` field with camelCase serde rename.
  - `RunnableTiers` (line ~83): change `fast/medium/slow` from `Option<TierAssignment>` to `TierAssignment`.
  - `build_runnable_tiers_with_rtfs()`: simplify — always return all three tiers, set `within_budget` from the budget check; remove the "force show Fast when all None" edge case.
  - `runnable_tiers()` cache loader: add fallback parse path for old-shape `benchmark.json` (Option fields, no `within_budget`).
  - Test module (line ~933+): update `build_runnable_tiers_*` tests to use new struct shape; add `vietnamese_language_maps_to_vi` test; add `legacy_runnable_tiers_json_loads` test.

**Modified TypeScript:**
- `apps/desktop/src/lib/desktopBridge.ts`
  - `TierAssignment`: add `withinBudget: boolean`.
  - `RunnableTiers`: change fields to non-nullable.
  - `getRunnableTiers()` web-preview fallback: fill all 3 tiers with `withinBudget` set.
- `apps/desktop/src/App.tsx`
  - Add `rerunStatus`, `rerunError` state.
  - Add `handleRerunBenchmark` callback.
  - Pass `handleTierChange`, `handleRerunBenchmark`, `rerunStatus`, `rerunError` to `<SettingsView>`.
- `apps/desktop/src/components/SettingsView.tsx`
  - Thread the four new props through to `<ModelManager>`.
- `apps/desktop/src/components/ModelManager.tsx`
  - Rewrite tier card grid: all three cards always render; each is a `<button>` with click handler; 5 visual states; inline confirm overlay; "Run setup wizard instead →" sub-link.
- `apps/desktop/src/components/DictationWorkbench.tsx`
  - Replace inline `TIER_META` constant with `TIER_DISPLAY` import.
  - Filter for available tiers now uses `withinBudget` instead of nullability.
- `apps/desktop/src/styles/app.css`
  - Add `.tier-card.is-active`, `.is-out-of-budget`, `.is-downloading` variants; `.tier-card .active-badge`, `.download-hint`, `.warning-hint`; `.inline-confirm` overlay; `.rerun-button` spinner state.

**Created TypeScript:**
- `apps/desktop/src/lib/tierDisplay.ts` — single-source `TIER_DISPLAY` constant.

**Modified tests:**
- `apps/desktop/tests/componentsStatic.test.tsx` — new assertions for "Quality" label, sub-lines, state badges.
- `apps/desktop/e2e/advanced-override.spec.ts` OR new `apps/desktop/e2e/tier-cards.spec.ts` — click-tier-card flow.

**Unchanged (verify post-redesign):**
- Onboarding wizard (`OnboardingWizard.tsx`)
- Tier enum + ids (`Tier`, `"fast" | "medium" | "slow"`)
- Settings store schema (`settingsStore.ts` v4)
- All other Tauri commands
- Companion floating window
- `packages/shared`, `apps/api`

---

## Task 1 — Rust: Fix Vietnamese language fallback

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Write the failing test**

Open `apps/desktop/src-tauri/src/private_fast.rs`. Find the existing `#[cfg(test)] mod tests` block (search for `mod tests {`). Append:

```rust
#[test]
fn vietnamese_language_maps_to_vi() {
    assert_eq!(whisper_language("vi"), "vi");
}

#[test]
fn unknown_language_still_falls_to_english() {
    assert_eq!(whisper_language("xx"), "en");
    assert_eq!(whisper_language(""), "en");
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml vietnamese_language_maps_to_vi 2>&1 | tail -5
```

Expected: FAIL (`assertion failed: left: "en" right: "vi"`).

- [ ] **Step 3: Add the `vi` match arm**

Find `fn whisper_language` (search for it):

```rust
fn whisper_language(language: &str) -> &str {
    match language {
        "zh" => "zh",
        "ja" => "ja",
        "es" => "es",
        "fr" => "fr",
        "de" => "de",
        _ => "en",
    }
}
```

Replace with:

```rust
fn whisper_language(language: &str) -> &str {
    match language {
        "zh" => "zh",
        "ja" => "ja",
        "es" => "es",
        "fr" => "fr",
        "de" => "de",
        "vi" => "vi",
        _ => "en",
    }
}
```

- [ ] **Step 4: Confirm tests pass**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml whisper_language vietnamese 2>&1 | tail -5
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "$(cat <<'EOF'
fix(engine): route Vietnamese audio with -l vi (not -l en fallback)

Vietnamese was added to packages/shared SUPPORTED_LANGUAGES but the
Rust whisper_language() match never gained a "vi" arm — so users
who selected Tiếng Việt got -l en passed to whisper-cli and Whisper
tried to transcribe Vietnamese audio as English, producing garbage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Rust: TierAssignment.within_budget + RunnableTiers non-Option

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Locate the structs**

```bash
grep -n "pub struct TierAssignment\|pub struct RunnableTiers" apps/desktop/src-tauri/src/private_fast.rs
```

You'll see two struct declarations. Find them.

- [ ] **Step 2: Update `TierAssignment` to add `within_budget`**

Replace the existing definition (currently around line 76):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierAssignment {
    pub model_id: String,
    pub realtime_factor: f32,
    pub predicted: bool,
    pub downloaded: bool,
}
```

with:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierAssignment {
    pub model_id: String,
    pub realtime_factor: f32,
    pub predicted: bool,
    pub downloaded: bool,
    pub within_budget: bool,
}
```

- [ ] **Step 3: Update `RunnableTiers` to use non-Option fields**

Replace the existing definition (currently around line 83):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnableTiers {
    pub fast: Option<TierAssignment>,
    pub medium: Option<TierAssignment>,
    pub slow: Option<TierAssignment>,
    pub fingerprint: String,
    pub benchmarked_at: String,
}
```

with:

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

- [ ] **Step 4: Verify the file still compiles**

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | tail -20
```

Expected: errors in `build_runnable_tiers_with_rtfs`, `runnable_tiers`, `write_runnable_tiers`, and possibly the tests — because they all construct `TierAssignment` and `RunnableTiers` with the old shape. We'll fix those in the next tasks. **Do not commit yet.**

- [ ] **Step 5: Stage progress (no commit)**

Leave the file modified in the working tree. Task 3 will compile-clean it.

---

## Task 3 — Rust: Rewrite `build_runnable_tiers_with_rtfs` for non-Option

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Locate the function**

```bash
grep -n "fn build_runnable_tiers_with_rtfs" apps/desktop/src-tauri/src/private_fast.rs
```

Read the function body around that line.

- [ ] **Step 2: Replace the function body**

Replace the existing `build_runnable_tiers_with_rtfs` function with this simpler version (the budget gate now becomes a `within_budget` flag, not a None-filter; the force-show-Fast edge case is gone):

```rust
fn build_runnable_tiers_with_rtfs<F>(
    class: PerformanceClass,
    measured_medium_rtf: f32,
    fingerprint: &str,
    benchmarked_at: &str,
    is_installed: F,
) -> RunnableTiers
where
    F: Fn(&str) -> bool,
{
    let medium_model = default_model_for_tier(class, Tier::Medium);
    let medium_ratio = ratio_of(medium_model);
    let baseline = if medium_ratio > 0.0 {
        measured_medium_rtf / medium_ratio
    } else {
        0.0
    };

    let make_assignment = |tier: Tier| -> TierAssignment {
        let model_id = default_model_for_tier(class, tier).to_string();
        let rtf = baseline * ratio_of(&model_id);
        let is_medium = matches!(tier, Tier::Medium);
        let within_budget = rtf <= tier_budget(tier);
        TierAssignment {
            downloaded: is_installed(&model_id),
            predicted: !is_medium,
            realtime_factor: rtf,
            model_id,
            within_budget,
        }
    };

    RunnableTiers {
        fast: make_assignment(Tier::Fast),
        medium: make_assignment(Tier::Medium),
        slow: make_assignment(Tier::Slow),
        fingerprint: fingerprint.to_string(),
        benchmarked_at: benchmarked_at.to_string(),
    }
}
```

- [ ] **Step 3: Update existing Rust tests for `build_runnable_tiers`**

Find the tests `build_runnable_tiers_filters_by_budget` and `build_runnable_tiers_drops_slow_when_predicted_too_slow` in the `#[cfg(test)] mod tests` block. Replace them:

```rust
#[test]
fn build_runnable_tiers_marks_in_budget_when_medium_is_fast() {
    use PerformanceClass::*;
    let result = build_runnable_tiers_with_rtfs(
        CpuStrong,
        0.8,
        "fp",
        "2026-05-12T00:00:00Z",
        |id| installed_in_test(id),
    );
    assert!(result.fast.within_budget, "fast should be within budget");
    assert!(result.medium.within_budget, "medium should be within budget");
    assert!(result.slow.within_budget, "slow should be within budget");
}

#[test]
fn build_runnable_tiers_flags_slow_out_of_budget_on_weak_hardware() {
    use PerformanceClass::*;
    let result = build_runnable_tiers_with_rtfs(
        CpuWeak, 5.0, "fp", "ts",
        |_| false,
    );
    // Every tier still has an assignment now — but slow is flagged out of budget.
    assert!(!result.slow.within_budget, "slow should be flagged as out of budget");
    // Medium is over budget too on this hypothetical machine.
    assert!(!result.medium.within_budget);
}
```

(The helper `fn installed_in_test(_model_id: &str) -> bool { false }` from the previous redesign is still in the test module — keep it.)

- [ ] **Step 4: Confirm the function compiles + tests pass**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml build_runnable_tiers 2>&1 | tail -10
```

Expected: 2 passed, 0 failed.

But the whole crate may still not compile because `runnable_tiers()` and `write_runnable_tiers()` haven't been updated. Run:

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep -E "^error" | head -5
```

Errors should now be limited to the cache-loading path in `runnable_tiers()` — Task 4 fixes those.

- [ ] **Step 5: Do not commit yet**

Same staging strategy as Task 2. Task 4 finishes the Rust pass.

---

## Task 4 — Rust: Backward-compat cache parse + finalize_calibration update

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Locate `runnable_tiers` and `finalize_calibration_inner`**

```bash
grep -n "pub fn runnable_tiers\|fn finalize_calibration_inner\|fn finalize_calibration" apps/desktop/src-tauri/src/private_fast.rs
```

- [ ] **Step 2: Inspect the existing `runnable_tiers` body**

Open the file around the located lines. The current body deserializes via `serde_json::from_str::<RunnableTiers>(&text)` directly. Since the struct shape changed, old caches will fail to deserialize. We need a fallback.

- [ ] **Step 3: Add the legacy shape and a fallback loader**

Insert these helpers near the `RunnableTiers` definition (after the struct):

```rust
/// Legacy shape used by benchmark.json caches written before the
/// within_budget refactor. Used only to migrate old caches forward.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyTierAssignment {
    model_id: String,
    realtime_factor: f32,
    predicted: bool,
    downloaded: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyRunnableTiers {
    fast: Option<LegacyTierAssignment>,
    medium: Option<LegacyTierAssignment>,
    slow: Option<LegacyTierAssignment>,
    fingerprint: String,
    benchmarked_at: String,
}

fn migrate_legacy_tiers(legacy: LegacyRunnableTiers) -> RunnableTiers {
    fn synth(tier_name: &str, slot: Option<LegacyTierAssignment>, default_model: &str) -> TierAssignment {
        match slot {
            Some(a) => TierAssignment {
                model_id: a.model_id,
                realtime_factor: a.realtime_factor,
                predicted: a.predicted,
                downloaded: a.downloaded,
                within_budget: true,
            },
            None => TierAssignment {
                model_id: default_model.to_string(),
                realtime_factor: 0.0,
                predicted: true,
                downloaded: false,
                within_budget: false,
            },
        }
        // (tier_name kept as a comment hook in case future debugging wants it;
        //  not currently used.)
        // _ = tier_name;
    }
    // For the synth fallback we don't know the perf class — we approximate by
    // using the model ID that legacy assignments used for that slot, falling
    // back to a reasonable default if the slot was None.
    let fast_default = legacy.fast.as_ref().map(|a| a.model_id.clone()).unwrap_or_else(|| "base".to_string());
    let medium_default = legacy.medium.as_ref().map(|a| a.model_id.clone()).unwrap_or_else(|| "small".to_string());
    let slow_default = legacy.slow.as_ref().map(|a| a.model_id.clone()).unwrap_or_else(|| "large-v3".to_string());
    RunnableTiers {
        fast: synth("fast", legacy.fast, &fast_default),
        medium: synth("medium", legacy.medium, &medium_default),
        slow: synth("slow", legacy.slow, &slow_default),
        fingerprint: legacy.fingerprint,
        benchmarked_at: legacy.benchmarked_at,
    }
}
```

- [ ] **Step 4: Update `runnable_tiers` to use the fallback loader**

Find the body of `pub fn runnable_tiers(app: AppHandle) -> Result<RunnableTiers, String>`. Replace the inner `if let Ok(cached) = serde_json::from_str::<RunnableTiers>(&text)` branch with a two-step parse:

```rust
#[tauri::command]
pub fn runnable_tiers(app: AppHandle) -> Result<RunnableTiers, String> {
    let path = benchmark_cache_path(&app)?;
    let fp = current_fingerprint();

    if path.exists() {
        if let Ok(text) = fs::read_to_string(&path) {
            // First try the current shape.
            if let Ok(cached) = serde_json::from_str::<RunnableTiers>(&text) {
                if cached.fingerprint == fp {
                    return Ok(cached);
                }
            } else if let Ok(legacy) = serde_json::from_str::<LegacyRunnableTiers>(&text) {
                if legacy.fingerprint == fp {
                    return Ok(migrate_legacy_tiers(legacy));
                }
            }
        }
    }

    // No valid cache: return placeholder assignments so the UI can prompt
    // re-run setup. We use the default mapping for the current performance
    // class with predicted=true, downloaded=false, within_budget=false.
    let class = current_performance_class();
    let placeholder = |tier: Tier| TierAssignment {
        model_id: default_model_for_tier(class, tier).to_string(),
        realtime_factor: 0.0,
        predicted: true,
        downloaded: false,
        within_budget: false,
    };
    Ok(RunnableTiers {
        fast: placeholder(Tier::Fast),
        medium: placeholder(Tier::Medium),
        slow: placeholder(Tier::Slow),
        fingerprint: fp,
        benchmarked_at: String::new(),
    })
}
```

You need a helper `current_performance_class()`. Check if it already exists:

```bash
grep -n "fn current_performance_class\|fn detect_performance_class" apps/desktop/src-tauri/src/private_fast.rs
```

If not present, add it near `current_fingerprint`:

```rust
fn current_performance_class() -> PerformanceClass {
    let cores = std::thread::available_parallelism().map(|v| v.get()).unwrap_or(4);
    let ram = total_memory_bytes();
    let gpus = detect_gpu();
    let primary_vram = gpus.iter().filter_map(|g| g.vram_bytes).max();
    compute_performance_class(cores, ram, primary_vram)
}
```

If `finalize_calibration` already has a near-duplicate computation (it does, in `finalize_calibration`), refactor `finalize_calibration` to also call `current_performance_class()` so the logic isn't duplicated. Find it and update the body:

```bash
grep -n "fn finalize_calibration\b" apps/desktop/src-tauri/src/private_fast.rs
```

The function currently computes `class` inline. Replace those lines with a call to `current_performance_class()`.

- [ ] **Step 5: Verify the crate compiles + all existing tests pass**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep "test result" | head -5
```

Expected: all four `test result: ok` lines (no `FAILED`). Should be: 25 passed (was 23 + 2 new from Task 1 + adjusted Task 3 tests = 25 or 26).

- [ ] **Step 6: Add a legacy-cache parse test**

In the test module:

```rust
#[test]
fn legacy_runnable_tiers_json_loads() {
    let legacy_json = r#"{
        "fast": {"modelId":"base","realtimeFactor":0.45,"predicted":true,"downloaded":true},
        "medium": {"modelId":"small","realtimeFactor":0.82,"predicted":false,"downloaded":true},
        "slow": null,
        "fingerprint":"abc",
        "benchmarkedAt":"2026-05-12T00:00:00Z"
    }"#;
    let legacy: LegacyRunnableTiers = serde_json::from_str(legacy_json).expect("legacy parses");
    let migrated = migrate_legacy_tiers(legacy);
    assert_eq!(migrated.fast.model_id, "base");
    assert!(migrated.fast.within_budget);  // synthesized as true for present slots
    assert_eq!(migrated.slow.model_id, "large-v3");
    assert!(!migrated.slow.within_budget);  // synthesized as false for None slot
}
```

- [ ] **Step 7: Run tests once more**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep "test result"
```

Expected: all `ok`, count up by 1 vs Step 5.

- [ ] **Step 8: Commit Rust changes 2+3+4 together**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "$(cat <<'EOF'
feat(engine): TierAssignment within_budget + legacy cache migration

- TierAssignment gains a within_budget boolean; was implicit via the
  None-filter in RunnableTiers.fast/medium/slow.
- RunnableTiers fields are now non-Option — every tier always has an
  assignment, with within_budget flagging whether predicted RTF is
  inside the budget.
- build_runnable_tiers_with_rtfs simplifies: drops the budget gate
  and the force-show-Fast edge case (no longer needed; every tier is
  emitted always).
- runnable_tiers() cache loader now reads the previous shape via
  LegacyRunnableTiers + migrate_legacy_tiers when the new shape fails
  to deserialize, so existing benchmark.json caches continue to
  function across the upgrade.
- runnable_tiers() empty-cache fallback now returns placeholder
  TierAssignments (downloaded=false, within_budget=false) instead of
  nulls, so the frontend always has three assignments to render.
- current_performance_class() helper extracted from finalize_calibration
  to avoid duplicating the cores/RAM/GPU sniffing logic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — TS bridge: TierAssignment.withinBudget + non-nullable fields

**Files:**
- Modify: `apps/desktop/src/lib/desktopBridge.ts`

- [ ] **Step 1: Update the types**

Find the existing `TierAssignment` + `RunnableTiers` type declarations (`grep -n "TierAssignment\|RunnableTiers" apps/desktop/src/lib/desktopBridge.ts`). Replace them with:

```typescript
export type TierAssignment = {
  modelId: string;
  realtimeFactor: number;
  predicted: boolean;
  downloaded: boolean;
  withinBudget: boolean;
};

export type RunnableTiers = {
  fast: TierAssignment;
  medium: TierAssignment;
  slow: TierAssignment;
  fingerprint: string;
  benchmarkedAt: string;
};
```

- [ ] **Step 2: Update the web-preview fallback in `getRunnableTiers`**

Find the body of `getRunnableTiers()`. Replace its current web-preview branch:

```typescript
export async function getRunnableTiers(): Promise<RunnableTiers> {
  if (!isTauriRuntime()) {
    return {
      fast: { modelId: "base", realtimeFactor: 0.5, predicted: true, downloaded: true, withinBudget: true },
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: true, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: 3.2, predicted: true, downloaded: false, withinBudget: false },
      fingerprint: "web-preview",
      benchmarkedAt: ""
    };
  }
  return invoke<RunnableTiers>("runnable_tiers");
}
```

Also update `finalizeCalibration`'s web-preview fallback the same way (add `withinBudget` to each TierAssignment).

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | tail -10
```

Expected: errors in `App.tsx`, `ModelManager.tsx`, `DictationWorkbench.tsx`, and possibly tests — anywhere the old null-or-assignment pattern was used. These are addressed in the next tasks. **Do not commit yet.**

- [ ] **Step 4: Stage progress, no commit**

---

## Task 6 — TS: Create `tierDisplay.ts` single source of truth

**Files:**
- Create: `apps/desktop/src/lib/tierDisplay.ts`

- [ ] **Step 1: Write the new file**

Create `apps/desktop/src/lib/tierDisplay.ts`:

```typescript
import type { Tier } from "./desktopBridge";

export const TIER_DISPLAY: Record<Tier, { name: string; sub: string }> = {
  fast: { name: "Fast", sub: "Quicker · may sacrifice quality" },
  medium: { name: "Medium", sub: "Recommended" },
  slow: { name: "Quality", sub: "Most accurate · may take longer" }
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | grep "tierDisplay" | head
```

Expected: no errors for this file (errors elsewhere remain from Task 5).

- [ ] **Step 3: Stage; no commit yet** — Task 7 + 8 will use it.

---

## Task 7 — TS: Update DictationWorkbench to use TIER_DISPLAY + withinBudget filter

**Files:**
- Modify: `apps/desktop/src/components/DictationWorkbench.tsx`

- [ ] **Step 1: Replace the inline TIER_META + filter**

Find the existing top-of-file imports and the local `TIER_META` constant. Make these edits:

(a) Add this import line near the other lib imports:

```typescript
import { TIER_DISPLAY } from "../lib/tierDisplay";
```

(b) Delete the existing local `TIER_META` constant:

```typescript
const TIER_META: Record<Tier, { name: string }> = {
  fast: { name: "Fast" },
  medium: { name: "Medium" },
  slow: { name: "Slow" }
};
```

(c) Find the `availableTiers` filter — currently filters by `pair[1] !== null`. Replace it with the withinBudget filter so the inline strip only renders tiers the hardware can actually run smoothly:

```typescript
const availableTiers: Array<[Tier, TierAssignment]> = (["fast", "medium", "slow"] as const)
  .map((id) => [id, runnableTiers[id]] as [Tier, TierAssignment])
  .filter((pair) => pair[1].withinBudget);
```

(d) Find the JSX that renders the tier name `{TIER_META[id].name}` and change it to `{TIER_DISPLAY[id].name}`.

- [ ] **Step 2: Typecheck the file in isolation**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | grep "DictationWorkbench\|tierDisplay" | head
```

Expected: zero new errors from this file.

- [ ] **Step 3: Stage; no commit yet** — bundle with the larger ModelManager rewrite in Task 8.

---

## Task 8 — TS: Rewrite ModelManager tier cards + inline confirm overlay

**Files:**
- Modify: `apps/desktop/src/components/ModelManager.tsx`

This is the biggest single edit in the plan. Replace the entire content of the file with the implementation below. The structure:

- A small `ConfirmInline` component for the inline confirm overlay.
- A `TierCard` button component encapsulating the 5 visual states.
- The `ModelManager` body wiring everything together.

- [ ] **Step 1: Replace the whole file**

Overwrite `apps/desktop/src/components/ModelManager.tsx` with:

```tsx
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import type {
  HardwareProfile,
  PrivateFastModel,
  PrivateFastStatus,
  RunnableTiers,
  Tier,
  TierAssignment
} from "../lib/desktopBridge";
import { TIER_DISPLAY } from "../lib/tierDisplay";

type RerunStatus = "idle" | "measuring" | "error";

type ModelManagerProps = {
  status: PrivateFastStatus;
  models: PrivateFastModel[];
  hardwareProfile: HardwareProfile | null;
  runnableTiers: RunnableTiers;
  operation: string;
  selectedTier: Tier;
  rerunStatus: RerunStatus;
  rerunError: string;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefresh: () => void;
  onTierChange: (tier: Tier) => void;
  onRerunBenchmark: () => void;
  onOpenWizard: () => void;
};

type PendingConfirm =
  | { kind: "download"; tier: Tier; assignment: TierAssignment }
  | { kind: "warning"; tier: Tier; assignment: TierAssignment }
  | null;

export function ModelManager({
  status,
  models,
  hardwareProfile,
  runnableTiers,
  operation,
  selectedTier,
  rerunStatus,
  rerunError,
  onModelAction,
  onImportModel,
  onRefresh,
  onTierChange,
  onRerunBenchmark,
  onOpenWizard
}: ModelManagerProps) {
  const [importModelId, setImportModelId] = useState("small");
  const [importPath, setImportPath] = useState("");
  const [pending, setPending] = useState<PendingConfirm>(null);

  const mediumModel = models.find((m) => m.id === runnableTiers.medium.modelId);

  const handleTierCardClick = (tier: Tier) => {
    const assignment = runnableTiers[tier];
    if (tier === selectedTier && assignment.downloaded) return;
    if (!assignment.withinBudget) {
      setPending({ kind: "warning", tier, assignment });
      return;
    }
    if (!assignment.downloaded) {
      setPending({ kind: "download", tier, assignment });
      return;
    }
    onTierChange(tier);
  };

  const handleConfirm = () => {
    if (!pending) return;
    onTierChange(pending.tier);
    setPending(null);
  };

  return (
    <div className="model-manager">
      <div className="recommend-card">
        <strong>Recommended for your hardware</strong>
        <div style={{ marginTop: 6 }}>
          {mediumModel?.label ?? hardwareProfile?.recommendedModelId ?? "—"}
          {hardwareProfile ? ` · ${hardwareProfile.cpuCores} cores · ${formatRam(hardwareProfile.memoryTotalBytes)}` : ""}
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className={`text-button rerun-button ${rerunStatus === "measuring" ? "is-measuring" : ""}`}
            disabled={rerunStatus === "measuring"}
            onClick={onRerunBenchmark}
          >
            {rerunStatus === "measuring" ? "Measuring…" : "Re-run setup"}
          </button>
          <button type="button" className="text-button-link" onClick={onOpenWizard}>
            Run setup wizard instead →
          </button>
        </div>
        {rerunStatus === "error" && rerunError && (
          <div className="rerun-error" role="alert">{rerunError}</div>
        )}
      </div>

      {pending && (
        <ConfirmInline
          title={pending.kind === "warning" ? `${TIER_DISPLAY[pending.tier].name} may run slowly` : `Download ${TIER_DISPLAY[pending.tier].name}?`}
          body={
            pending.kind === "warning"
              ? `${pending.assignment.modelId} could take roughly ${pending.assignment.realtimeFactor.toFixed(1)}× realtime on your hardware. 30 seconds of audio may take ${Math.round(pending.assignment.realtimeFactor * 30)} seconds or more. Continue?`
              : `This tier needs ${pending.assignment.modelId} (${models.find((m) => m.id === pending.assignment.modelId)?.sizeLabel ?? "size unknown"}). Download and switch?`
          }
          confirmLabel={pending.kind === "warning" ? "Continue" : "Download"}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}

      <div className="tier-card-row">
        {(["fast", "medium", "slow"] as const).map((tier) => (
          <TierCard
            key={tier}
            tier={tier}
            assignment={runnableTiers[tier]}
            model={models.find((m) => m.id === runnableTiers[tier].modelId)}
            isSelected={selectedTier === tier}
            isBusy={Boolean(operation) && operation.endsWith(`:${runnableTiers[tier].modelId}`)}
            onClick={() => handleTierCardClick(tier)}
          />
        ))}
      </div>

      <details className="advanced">
        <summary>Advanced — full model catalog</summary>
        <div className="model-catalog" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {models.map((model) => {
            const pendingOp = operation.endsWith(`:${model.id}`);
            return (
              <article className={`tier-card ${model.selected ? "is-recommended" : ""}`} key={model.id}>
                <div className="name">{model.label}</div>
                <div className="meta">
                  {model.installed ? "Installed" : model.sizeLabel}
                  {model.selected ? " · Selected" : ""}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  {model.installed ? (
                    <>
                      <button
                        type="button"
                        className="text-button"
                        disabled={model.selected || Boolean(operation)}
                        onClick={() => onModelAction("select", model.id)}
                      >
                        {model.selected ? "Selected" : "Select"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={Boolean(operation)}
                        onClick={() => onModelAction("delete", model.id)}
                      >
                        <Trash2 size={13} />
                        {pendingOp && operation.startsWith("delete:") ? "Deleting" : "Delete"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      disabled={Boolean(operation)}
                      onClick={() => onModelAction("download", model.id)}
                    >
                      <Download size={13} />
                      {pendingOp && operation.startsWith("download:") ? "Downloading" : "Download"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 12 }}>
          <select value={importModelId} onChange={(event) => setImportModelId(event.target.value)}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
          <input
            value={importPath}
            onChange={(event) => setImportPath(event.target.value)}
            placeholder="/path/to/ggml-small.bin"
          />
          <button type="button" className="text-button" onClick={() => onImportModel(importModelId, importPath)}>
            Import
          </button>
        </div>
      </details>

      <small style={{ color: "var(--faint)", fontSize: 11 }}>{status.message}</small>
    </div>
  );
}

function TierCard({
  tier,
  assignment,
  model,
  isSelected,
  isBusy,
  onClick
}: {
  tier: Tier;
  assignment: TierAssignment;
  model: PrivateFastModel | undefined;
  isSelected: boolean;
  isBusy: boolean;
  onClick: () => void;
}) {
  const display = TIER_DISPLAY[tier];
  const stateClasses = [
    "tier-card",
    isSelected ? "is-active" : "",
    !assignment.withinBudget ? "is-out-of-budget" : "",
    isBusy ? "is-downloading" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={stateClasses}
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`${display.name} tier — ${display.sub}`}
    >
      <div className="name">{display.name}</div>
      <div className="meta">{display.sub}</div>
      <div className="meta">
        {model?.label ?? assignment.modelId}
        {model?.sizeLabel ? ` · ${model.sizeLabel}` : ""}
      </div>
      {isSelected && (
        <span className="active-badge" aria-hidden="true">● Active</span>
      )}
      {!isSelected && !assignment.downloaded && assignment.withinBudget && (
        <span className="download-hint" aria-hidden="true">↓ Download</span>
      )}
      {!assignment.withinBudget && (
        <span className="warning-hint" aria-hidden="true">⚠ may be slow</span>
      )}
      {isBusy && (
        <span className="busy-overlay" aria-hidden="true">Downloading…</span>
      )}
    </button>
  );
}

function ConfirmInline({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="inline-confirm" role="dialog" aria-label={title}>
      <strong>{title}</strong>
      <p>{body}</p>
      <div className="inline-confirm-actions">
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="text-button primary" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}

function formatRam(bytes?: number) {
  if (!bytes) return "RAM unknown";
  return `${Math.round(bytes / 1024 ** 3)} GB RAM`;
}
```

- [ ] **Step 2: Verify the file typechecks (App.tsx + SettingsView still uncorrected)**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | grep "ModelManager" | head -5
```

Expected: zero errors from this file. Errors should remain in App.tsx + SettingsView for the props that haven't been wired yet.

- [ ] **Step 3: No commit yet** — bundle with Tasks 9 + 10.

---

## Task 9 — TS: Thread props through SettingsView

**Files:**
- Modify: `apps/desktop/src/components/SettingsView.tsx`

- [ ] **Step 1: Add the new prop types and pass them through**

Find the existing `SettingsViewProps` type. Add the four new props:

```typescript
selectedTier: Tier;
rerunStatus: "idle" | "measuring" | "error";
rerunError: string;
onTierChange: (tier: Tier) => void;
onRerunBenchmark: () => void;
onOpenWizard: () => void;
```

Also add `Tier` to the existing `import type` from `../lib/desktopBridge` if it's not already in the import list.

Find the destructured params at the top of the `SettingsView` function and add the new ones.

Find the JSX call to `<ModelManager .../>` and add the new props:

```tsx
<ModelManager
  /* ...existing props... */
  selectedTier={selectedTier}
  rerunStatus={rerunStatus}
  rerunError={rerunError}
  onTierChange={onTierChange}
  onRerunBenchmark={onRerunBenchmark}
  onOpenWizard={onOpenWizard}
/>
```

- [ ] **Step 2: Verify SettingsView typechecks**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | grep "SettingsView" | head -5
```

Expected: zero errors from this file.

- [ ] **Step 3: No commit yet.**

---

## Task 10 — TS: App.tsx wires handleRerunBenchmark + new props

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Locate the existing handleTierChange + state**

```bash
grep -n "handleTierChange\|rerunStatus\|setOnboardingCompleted\|runnableTiers" apps/desktop/src/App.tsx | head -10
```

- [ ] **Step 2: Add the new state declarations**

Below the existing `useState` calls that declare `runnableTiers` and `selectedTier`, add:

```tsx
  const [rerunStatus, setRerunStatus] = useState<"idle" | "measuring" | "error">("idle");
  const [rerunError, setRerunError] = useState("");
```

- [ ] **Step 3: Add the `handleRerunBenchmark` callback**

Just after the existing `handleTierChange` declaration, add:

```tsx
  const handleRerunBenchmark = useCallback(async () => {
    setRerunStatus("measuring");
    setRerunError("");
    try {
      await rerunBenchmark();
      const mediumAssignment = runnableTiers.medium;
      if (!mediumAssignment.downloaded) {
        throw new Error("Install a model first by picking a tier below.");
      }
      const rtf = await benchmarkTier(mediumAssignment.modelId);
      const fresh = await finalizeCalibration(rtf, mediumAssignment.modelId);
      setRunnableTiers(fresh);
      setRerunStatus("idle");
    } catch (error) {
      setRerunError(error instanceof Error ? error.message : "Re-run failed.");
      setRerunStatus("error");
    }
  }, [runnableTiers.medium]);
```

You'll need to ensure `rerunBenchmark`, `benchmarkTier`, `finalizeCalibration` are all imported from `./lib/desktopBridge` — check the existing import block.

- [ ] **Step 4: Add a `handleOpenWizard` callback**

```tsx
  const handleOpenWizard = useCallback(() => {
    setOnboardingCompleted(false);
  }, []);
```

- [ ] **Step 5: Pass the new props to `<SettingsView>`**

Find the `<SettingsView .../>` JSX. Add:

```tsx
            selectedTier={selectedTier}
            rerunStatus={rerunStatus}
            rerunError={rerunError}
            onTierChange={(tier) => void handleTierChange(tier)}
            onRerunBenchmark={() => void handleRerunBenchmark()}
            onOpenWizard={handleOpenWizard}
```

- [ ] **Step 6: Run full typecheck**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | tail -5
```

Expected: clean, 0 errors.

- [ ] **Step 7: Run unit tests**

```bash
npm run test -w @dictivo/desktop 2>&1 | tail -5
```

The componentsStatic test that renders DictationWorkbench will likely fail because the runnable_tiers mock fixture uses the old shape. Patch the fixture in the test file:

Find the local `runnableTiers` constant inside `componentsStatic.test.tsx` and add `withinBudget: true` (or `false` for slow if appropriate) to each TierAssignment object. If a field was `null`, replace it with a full assignment object.

- [ ] **Step 8: Run unit tests again**

```bash
npm run test -w @dictivo/desktop 2>&1 | tail -5
```

Expected: all green.

- [ ] **Step 9: Commit Tasks 5+6+7+8+9+10 together**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/lib/desktopBridge.ts apps/desktop/src/lib/tierDisplay.ts apps/desktop/src/components/DictationWorkbench.tsx apps/desktop/src/components/ModelManager.tsx apps/desktop/src/components/SettingsView.tsx apps/desktop/tests/componentsStatic.test.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): clickable tier cards + working Re-run setup

ModelManager rewrites the tier card grid into a smart tri-state
button system:
  Active                  → no-op
  Downloaded, not active  → selectPrivateFastModel + flip Active
  Not downloaded          → inline confirm → download + benchmark
                            + finalize_calibration + select
  Out of budget           → warning confirm with predicted RTF
                            → same download flow

Re-run setup actually re-benchmarks now (was: only deleted the cache
file). Button shows "Measuring…" spinner; inline error if no model
is installed. A "Run setup wizard instead →" sub-link resets
onboardingCompleted=false to remount the wizard.

Tier display renames Slow → Quality (id stays "slow" in code) via
the new apps/desktop/src/lib/tierDisplay.ts shared between
ModelManager and DictationWorkbench. Sub-lines are now honest:
  Fast    Quicker · may sacrifice quality
  Medium  Recommended
  Quality Most accurate · may take longer

App.tsx adds handleRerunBenchmark + handleOpenWizard and threads
selectedTier / rerunStatus / rerunError / onTierChange /
onRerunBenchmark / onOpenWizard through SettingsView to ModelManager.

DictationWorkbench's inline tier strip now filters by
assignment.withinBudget instead of nullability — same visual
behavior since over-budget tiers were null before.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 — CSS for tier card states + inline confirm + rerun button

**Files:**
- Modify: `apps/desktop/src/styles/app.css`

- [ ] **Step 1: Find the existing .tier-card block**

```bash
grep -n "\.tier-card\|\.recommend-card" apps/desktop/src/styles/app.css | head -10
```

- [ ] **Step 2: Replace the entire existing `.tier-card-row` + `.tier-card` styles**

Find the existing block (it's small — about 20 lines) and replace it with this expanded set:

```css
.tier-card-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.tier-card {
  position: relative;
  text-align: left;
  background: var(--surface-2);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ink-2);
  cursor: pointer;
  transition: background 200ms ease, border-color 200ms ease, opacity 200ms ease;
  font-family: var(--font-body);
}
.tier-card:hover:not(.is-active) {
  background: rgba(255, 255, 255, 0.06);
}
.tier-card .name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
}
.tier-card .meta {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--muted);
}

.tier-card.is-active,
.tier-card.is-recommended {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.tier-card.is-active .name {
  color: var(--accent-text);
}
.tier-card .active-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-text);
  letter-spacing: 0.08em;
}
.tier-card .download-hint {
  position: absolute;
  top: 10px;
  right: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-text);
  opacity: 0.8;
  letter-spacing: 0.06em;
}
.tier-card .warning-hint {
  position: absolute;
  top: 10px;
  right: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--warning);
  letter-spacing: 0.06em;
}

.tier-card.is-out-of-budget {
  opacity: 0.6;
}
.tier-card.is-out-of-budget:hover {
  opacity: 0.85;
}

.tier-card.is-downloading {
  pointer-events: none;
}
.tier-card .busy-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(10, 10, 12, 0.7);
  color: var(--ink);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  border-radius: var(--radius);
}

.rerun-button.is-measuring {
  opacity: 0.7;
  cursor: progress;
}
.rerun-error {
  margin-top: 8px;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--danger);
}

.text-button-link {
  background: transparent;
  border: 0;
  padding: 6px 0;
  color: var(--accent-text);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  cursor: pointer;
}
.text-button-link:hover {
  text-decoration: underline;
}

.text-button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--canvas);
  font-weight: 600;
}
.text-button.primary:hover {
  background: #b59cfb;
}

.inline-confirm {
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 4px;
  font-family: var(--font-body);
  color: var(--ink-2);
}
.inline-confirm strong {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
}
.inline-confirm p {
  margin: 6px 0 12px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}
.inline-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 3: Verify the CSS parses + tests still pass**

```bash
npm run build -w @dictivo/desktop 2>&1 | tail -3
npm run test -w @dictivo/desktop 2>&1 | tail -3
```

Expected: clean Vite build; vitest still green.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/app.css
git commit -m "$(cat <<'EOF'
feat(desktop): tier card state styles + inline confirm + rerun spinner

CSS variants for the new tier-card click model: is-active (accent
border + Active badge), is-out-of-budget (60% opacity + warning
chip), is-downloading (busy overlay with spinner-like dim layer).
Inline confirm overlay for download/warning prompts. Rerun button
gets a measuring state. New .text-button-link helper for the "Run
setup wizard instead →" link.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12 — Tests: componentsStatic assertions + e2e tier card click

**Files:**
- Modify: `apps/desktop/tests/componentsStatic.test.tsx`
- Modify or Create: `apps/desktop/e2e/tier-cards.spec.ts`

- [ ] **Step 1: Add the new assertions to componentsStatic**

Find the existing test that renders `<SettingsView>` or `<ModelManager>`. Add these assertions inside the relevant render block (after the existing `expect(...)` lines):

```tsx
expect(markup).toContain("Quality");
expect(markup).not.toContain("Slow");
expect(markup).toContain("Quicker · may sacrifice quality");
expect(markup).toContain("Most accurate · may take longer");
```

If `SettingsView` isn't currently rendered in any test, add a small test block:

```tsx
it("renders three clickable tier cards with Quality label", () => {
  const runnableTiers = {
    fast: { modelId: "base", realtimeFactor: 0.4, predicted: true, downloaded: true, withinBudget: true },
    medium: { modelId: "small", realtimeFactor: 0.8, predicted: false, downloaded: true, withinBudget: true },
    slow: { modelId: "large-v3", realtimeFactor: 3.5, predicted: true, downloaded: false, withinBudget: false },
    fingerprint: "x",
    benchmarkedAt: "2026-05-12T00:00:00Z"
  };
  const markup = renderToStaticMarkup(
    <ModelManager
      status={{ ready: true, modelId: "small", modelName: "Small", message: "ok", setupHint: "" }}
      models={[{ id: "small", label: "Small", useCase: "", speed: "Fast", quality: "Good", sizeLabel: "~470 MB", notes: "", installed: true, selected: true }]}
      hardwareProfile={null}
      runnableTiers={runnableTiers}
      operation=""
      selectedTier="medium"
      rerunStatus="idle"
      rerunError=""
      onModelAction={vi.fn()}
      onImportModel={vi.fn()}
      onRefresh={vi.fn()}
      onTierChange={vi.fn()}
      onRerunBenchmark={vi.fn()}
      onOpenWizard={vi.fn()}
    />
  );
  expect(markup).toContain("Fast");
  expect(markup).toContain("Medium");
  expect(markup).toContain("Quality");
  expect(markup).not.toContain(">Slow<");  // negative match — no display label "Slow"
  expect(markup).toContain("Quicker · may sacrifice quality");
  expect(markup).toContain("Most accurate · may take longer");
  expect(markup).toContain("⚠ may be slow");
  expect(markup).toContain("● Active");
});
```

Add `import { ModelManager } from "../src/components/ModelManager";` near the top of the file if not already imported.

- [ ] **Step 2: Run the test**

```bash
npm run test -w @dictivo/desktop -- tests/componentsStatic.test.tsx 2>&1 | tail -10
```

Expected: green.

- [ ] **Step 3: Add the e2e tier-cards spec**

Create `apps/desktop/e2e/tier-cards.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ selectedTier: "medium", onboardingCompleted: true, companionEnabled: false })
    );
  });
});

test("tier cards render with Quality label and show Active badge on selected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  await expect(page.getByText("Quality")).toBeVisible();
  await expect(page.getByText("Fast")).toBeVisible();
  await expect(page.getByText("Medium")).toBeVisible();
  await expect(page.getByText("Most accurate · may take longer")).toBeVisible();
  await expect(page.getByText("● Active")).toBeVisible();
});

test("clicking out-of-budget tier opens warning confirm", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  await page.getByRole("button", { name: /Quality tier/i }).click();
  await expect(page.getByRole("dialog", { name: /may run slowly/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cancel/i })).toBeVisible();
});

test("cancel button dismisses confirm without changing tier", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  await page.getByRole("button", { name: /Quality tier/i }).click();
  await page.getByRole("button", { name: /Cancel/i }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  // Medium is still the active tier
  await expect(page.getByRole("button", { name: /Medium tier/i })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 4: Run e2e**

```bash
npm run e2e -w @dictivo/desktop 2>&1 | tail -10
```

Expected: 8 passed (5 existing + 3 new), 0 failed.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/tests/componentsStatic.test.tsx apps/desktop/e2e/tier-cards.spec.ts
git commit -m "$(cat <<'EOF'
test(desktop): tier card click flows + Quality label assertions

componentsStatic now snapshots a SettingsView render where slow tier
shows "Quality" (not "Slow"), with the new sub-lines visible, ⚠ may
be slow warning chip, and ● Active badge on the selected tier.

New e2e/tier-cards.spec.ts covers three flows:
  1. All three tier cards visible with new labels.
  2. Clicking an out-of-budget tier opens the warning confirm.
  3. Cancel dismisses without changing the active tier.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 — Sanity sweep + Tauri rebuild + reinstall

**Files:** none modified; verification only.

- [ ] **Step 1: Full test sweep**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | tail -3
npm run test 2>&1 | grep -E "Test Files|Tests" | head -6
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep "test result" | head -6
npm run e2e -w @dictivo/desktop 2>&1 | tail -3
```

Expected: typecheck clean, vitest all green, Rust test result lines all `ok`, e2e 8 passed.

- [ ] **Step 2: Tauri release build**

```bash
npm run tauri:build -w @dictivo/desktop 2>&1 | tail -8
```

Expected: `Finished release profile`, `.app` + `.dmg` bundled.

- [ ] **Step 3: Quit running Dictivo and replace install**

```bash
osascript -e 'tell application "Dictivo" to quit' 2>/dev/null || true
sleep 1
rm -rf /Applications/Dictivo.app
cp -R apps/desktop/src-tauri/target/release/bundle/macos/Dictivo.app /Applications/
xattr -dr com.apple.quarantine /Applications/Dictivo.app 2>/dev/null || true
rm -rf apps/desktop/src-tauri/target/release/bundle/macos/Dictivo.app
touch apps/desktop/src-tauri/target/.metadata_never_index
ls -ld /Applications/Dictivo.app
```

- [ ] **Step 4: Push**

```bash
git push origin main 2>&1 | tail -3
```

---

## Self-Review

After writing the plan, sanity-check the spec coverage:

**1. Spec coverage** — every spec § maps to a task:
- §1 Goals — overall scope across Tasks 1, 4, 8, 10
- §2 Non-goals — preserved (no Tier enum id change, no settings schema change, wizard untouched)
- §3 Copy — Task 6 (`tierDisplay.ts`) + Task 7 (DictationWorkbench) + Task 8 (ModelManager)
- §4 Re-run setup — Task 10 (`handleRerunBenchmark`) + Task 11 (CSS measuring state)
- §5 Tier card click — Task 8 (`TierCard` + `handleTierCardClick`) + Task 8 (`ConfirmInline`)
- §6 Backend changes — Task 1 (Vietnamese), Task 2 (struct shape), Task 3 (function body), Task 4 (legacy cache parse)
- §7 Frontend changes — Tasks 5, 6, 7, 8, 9, 10
- §8 Testing — Tasks 1 (Rust), 4 (Rust legacy), 10 (vitest patch), 12 (vitest + e2e)
- §9 Risks — addressed via legacy parse + retry-on-failure UX
- §10 Files Touched — explicit at top of plan
- §11 Definition of Done — Task 13

**2. Placeholder scan** — search for `TBD` / `TODO` / `implement later` — should be zero. Grep:

```bash
grep -nE "TBD|implement later|fill in details|add appropriate" docs/superpowers/plans/2026-05-12-local-engine-tier-cards.md | grep -v "Placeholder scan" || echo "clean"
```

**3. Type consistency** — names used across tasks:
- `TierAssignment.within_budget` (Rust) / `withinBudget` (TS) — consistent via serde camelCase
- `RunnableTiers.fast: TierAssignment` (non-Option) consistent across Rust + TS
- `TIER_DISPLAY` exported from `tierDisplay.ts`, imported by both `DictationWorkbench.tsx` and `ModelManager.tsx`
- `rerunStatus: "idle" | "measuring" | "error"` consistent App.tsx → SettingsView → ModelManager
- `handleRerunBenchmark`, `handleTierChange`, `handleOpenWizard` — consistent names throughout

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-local-engine-tier-cards.md`.**

Per user direction ("持续推进 不需要问我"), proceeding directly to subagent-driven-development.
